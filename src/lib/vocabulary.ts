import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate, type CacheTag } from "./cache";
import { decodeListQuestion, decodeNumericQuestion, decodeOrderQuestion, decodeStringArray } from "./idea-payload";
import { parseShortAnswer } from "./short-answer";
import {
  EMPTY_WORD_MODEL,
  buildWordModel,
  encodeWordModel,
  wordChoiceBatch,
  type WordChoiceDelta,
  type WordChoiceRecord,
  type WordModelWire,
  type WordSource,
} from "./word-model";

/**
 * The words this player actually writes, and the choices they make among
 * the suggestions: word completion's model, built on the server and shipped
 * to the capture forms (word-model.ts has the model and the ranking).
 *
 * Capture is the slowest part of the loop and the one with the least reward
 * attached, so anything that shortens it is worth more than it looks. A
 * generic dictionary would be the wrong source: the words that are slow to
 * type here are the domain ones — "photosynthesis", "amortisation",
 * "Kolmogorov", a customer's name — which is exactly what a dictionary
 * lacks and what the player's own writing is made of.
 *
 * The corpus is everything the user writes, each piece dated so recent
 * writing counts for more: ideas (decoded to their real text, so JSON keys
 * like "prompt" or "items" never enter) and their other wordings; task
 * titles and notes on the personal board and every work tab; task steps;
 * call back tags; customers' names and nicknames, their interaction briefs
 * and tags, their tasks; goals' aims; and the Field, Domain and work tab
 * names, which are always eligible.
 *
 *   loadWordModel(userId)                 → WordModelWire, cached on every tag a writer clears, and 'words'
 *   recordWordChoicesCore(userId, events) → one upsert of the picks and passes; never throws
 */

/** The newest rows read per table: years of writing, at a bounded cost per build. */
export const SOURCE_ROWS_MAX = 4000;

/** The model is rebuilt after any of these is cleared: ideas and their wordings, Fields and Domains, tasks, steps, call backs and work tabs ('life'), goals, and the user's own choices. */
export const WORD_MODEL_TAGS: CacheTag[] = ["ideas", "fields", "life", "roadmap", "words"];

/**
 * Longer than the cache's default: a build is a dozen reads, and words
 * that are a few minutes stale cost nothing (the customer tables clear no
 * tag; their names arrive within this).
 */
export const WORD_MODEL_TTL_MS = 10 * 60_000;

// ── The corpus ────────────────────────────────────────────────────────────

/**
 * An idea's own words, one string per field the user typed, decoded from
 * the stored columns: never a JSON key, an image, a hotspot or a number the
 * app wrote. A cloze sentence gets its blanks back, so the words around
 * them are read in order.
 */
export function ideaTexts(type: string, question: string, answer: string): string[] {
  const str = (x: unknown): string[] => (typeof x === "string" && x ? [x] : []);
  const strings = (xs: unknown): string[] => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
  switch (type) {
    case "SHORT": {
      const spec = parseShortAnswer(answer);
      return [question, ...(spec.kind === "list" ? spec.items : [spec.text])].filter(Boolean);
    }
    case "FORMULA":
      return [question, answer].filter(Boolean);
    case "MULTI":
      return [...strings(decodeStringArray(question)), ...str(answer)];
    case "DIAGRAM": {
      try {
        const labels = JSON.parse(answer) as unknown;
        return labels && typeof labels === "object" && !Array.isArray(labels) ? strings(Object.values(labels)) : [];
      } catch {
        return [];
      }
    }
    case "CLOZE": {
      const blanks = strings(decodeStringArray(answer));
      return [question.replace(/\[(\d+)\]/g, (_m, n: string) => ` ${blanks[Number(n) - 1] ?? ""} `)];
    }
    case "LIST":
      return [...str(decodeListQuestion(question).prompt), ...strings(decodeStringArray(answer))];
    case "ORDER":
      return [...str(decodeOrderQuestion(question).prompt), ...strings(decodeStringArray(answer))];
    case "NUMERIC": {
      const q = decodeNumericQuestion(question);
      return [...str(q.prompt), ...str(q.unit)];
    }
    default:
      return [];
  }
}

/** The rows a build reads (the DB's own shapes, trimmed to what is written by hand). */
export interface CorpusRows {
  ideas: { questionType: string; question: string; answer: string; createdAt: Date }[];
  variants: { prompt: string; createdAt: Date }[];
  /** Personal and work tasks, habits, goals and idea drafts alike. */
  tasks: { title: string; note: string | null; createdAt: Date }[];
  subtasks: { title: string; createdAt: Date }[];
  callBacks: { tags: string[]; createdAt: Date }[];
  customers: { name: string; nickname: string | null; createdAt: Date }[];
  interactions: { brief: string; tags: string[]; createdAt: Date }[];
  customerTasks: { title: string; detail: string | null; createdAt: Date }[];
  roadmaps: { aim: string; constraints: string | null; createdAt: Date }[];
  /** Field, Domain and open work tab names: the structure as it stands now. */
  structure: string[];
}

export const EMPTY_CORPUS: CorpusRows = { ideas: [], variants: [], tasks: [], subtasks: [], callBacks: [], customers: [], interactions: [], customerTasks: [], roadmaps: [], structure: [] };

/** The rows as the model's sources: one per field the user typed, dated when it was written. Pure. */
export function corpusOf(rows: CorpusRows, now: number): WordSource[] {
  const out: WordSource[] = [];
  const add = (text: string | null | undefined, at: Date | number, kind: WordSource["kind"] = "text") => {
    if (typeof text === "string" && text.trim()) out.push({ text, at: typeof at === "number" ? at : at.getTime(), kind });
  };
  for (const r of rows.ideas) for (const t of ideaTexts(r.questionType, r.question, r.answer)) add(t, r.createdAt);
  for (const r of rows.variants) add(r.prompt, r.createdAt);
  for (const r of rows.tasks) {
    add(r.title, r.createdAt);
    add(r.note, r.createdAt);
  }
  for (const r of rows.subtasks) add(r.title, r.createdAt);
  for (const r of rows.callBacks) for (const tag of r.tags) add(tag, r.createdAt, "name");
  for (const r of rows.customers) {
    add(r.name, r.createdAt, "name");
    add(r.nickname, r.createdAt, "name");
  }
  for (const r of rows.interactions) {
    add(r.brief, r.createdAt);
    for (const tag of r.tags) add(tag, r.createdAt, "name");
  }
  for (const r of rows.customerTasks) {
    add(r.title, r.createdAt);
    add(r.detail, r.createdAt);
  }
  for (const r of rows.roadmaps) {
    add(r.aim, r.createdAt);
    add(r.constraints, r.createdAt);
  }
  for (const name of rows.structure) add(name, now, "structure");
  return out;
}

/** WordChoice rows as the build reads them. */
export function choicesOf(rows: { word: string; context: string; picks: number; passes: number; lastPickAt: Date | null; lastPassAt: Date | null }[]): WordChoiceRecord[] {
  return rows.map((r) => ({ word: r.word, context: r.context, picks: r.picks, passes: r.passes, lastPickAt: r.lastPickAt?.getTime() ?? null, lastPassAt: r.lastPassAt?.getTime() ?? null }));
}

/** Each table read on its own, failing soft to nothing: a missing table (or a failed read) costs its words, never the model. */
async function readCorpus(userId: string): Promise<{ rows: CorpusRows; choices: WordChoiceRecord[] }> {
  const newest = { orderBy: { createdAt: "desc" as const }, take: SOURCE_ROWS_MAX };
  const soft = <T>(p: Promise<T[]>): Promise<T[]> => p.catch((): T[] => []);
  const [ideas, variants, tasks, subtasks, callBacks, customers, interactions, customerTasks, roadmaps, fields, domains, boards, choices] = await Promise.all([
    soft(prisma.idea.findMany({ where: { isArchived: false }, select: { questionType: true, question: true, answer: true, createdAt: true }, ...newest })),
    soft(prisma.ideaVariant.findMany({ select: { prompt: true, createdAt: true }, ...newest })),
    soft(prisma.taskTemplate.findMany({ where: { userId }, select: { title: true, note: true, createdAt: true }, ...newest })),
    soft(prisma.taskSubtask.findMany({ where: { userId }, select: { title: true, createdAt: true }, ...newest })),
    soft(prisma.callBack.findMany({ where: { userId }, select: { tags: true, createdAt: true }, ...newest })),
    soft(prisma.customer.findMany({ where: { userId }, select: { name: true, nickname: true, createdAt: true }, ...newest })),
    soft(prisma.customerInteraction.findMany({ where: { userId }, select: { brief: true, tags: true, createdAt: true }, ...newest })),
    soft(prisma.customerTask.findMany({ where: { userId }, select: { title: true, detail: true, createdAt: true }, ...newest })),
    soft(prisma.roadmap.findMany({ where: { userId }, select: { aim: true, constraints: true, createdAt: true }, ...newest })),
    soft(prisma.field.findMany({ select: { name: true } })),
    soft(prisma.domain.findMany({ select: { name: true } })),
    soft(prisma.workBoard.findMany({ where: { userId, archivedAt: null }, select: { name: true } })),
    soft(prisma.wordChoice.findMany({ where: { userId }, select: { word: true, context: true, picks: true, passes: true, lastPickAt: true, lastPassAt: true }, orderBy: { updatedAt: "desc" }, take: SOURCE_ROWS_MAX })),
  ]);
  return {
    rows: {
      ideas: ideas.map((r) => ({ ...r, questionType: String(r.questionType) })),
      variants,
      tasks,
      subtasks,
      callBacks,
      customers,
      interactions,
      customerTasks,
      roadmaps,
      structure: [...fields, ...domains, ...boards].map((r) => r.name),
    },
    choices: choicesOf(choices),
  };
}

/**
 * The user's word model, encoded for the client (word-model.ts
 * WordModelWire). Cached per user on WORD_MODEL_TAGS for WORD_MODEL_TTL_MS;
 * callers catch (a failure is the empty model: no suggestions, never a
 * broken form).
 */
export const loadWordModel = (userId: string): Promise<WordModelWire> =>
  cached(
    `wordModel:${userId}`,
    WORD_MODEL_TAGS,
    async () => {
      const now = Date.now();
      const { rows, choices } = await readCorpus(userId);
      return encodeWordModel(buildWordModel({ sources: corpusOf(rows, now), choices, now }));
    },
    WORD_MODEL_TTL_MS
  );

export { EMPTY_WORD_MODEL };

// ── The user's choices ────────────────────────────────────────────────────

/**
 * One statement for the whole batch: a multi-row INSERT … ON CONFLICT DO
 * UPDATE that adds the picks and passes to whatever the rows already hold
 * and stamps lastPickAt / lastPassAt only where the batch has some. One
 * round trip, atomic on its own — N upserts in a $transaction would be N + 2
 * round trips through the pooler, and Next runs a client's actions one at a
 * time, so a slow write here would hold the capture sheet's next save.
 * Times are UTC, as Prisma stores them. `ids` are the new rows' ids, one per
 * row (an existing row keeps its own).
 */
export function wordChoiceSql(userId: string, rows: readonly WordChoiceDelta[], ids: readonly string[]): Prisma.Sql {
  const utcNow = Prisma.sql`(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`;
  const values = rows.map(
    (r, i) =>
      Prisma.sql`(${ids[i]}::text, ${userId}::text, ${r.word}::text, ${r.context}::text, ${r.picks}::int, ${r.passes}::int,
        CASE WHEN ${r.picks}::int > 0 THEN ${utcNow} END, CASE WHEN ${r.passes}::int > 0 THEN ${utcNow} END, ${utcNow}, ${utcNow})`
  );
  return Prisma.sql`INSERT INTO "WordChoice" ("id", "userId", "word", "context", "picks", "passes", "lastPickAt", "lastPassAt", "createdAt", "updatedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("userId", "word", "context") DO UPDATE SET
      "picks" = "WordChoice"."picks" + EXCLUDED."picks",
      "passes" = "WordChoice"."passes" + EXCLUDED."passes",
      "lastPickAt" = COALESCE(EXCLUDED."lastPickAt", "WordChoice"."lastPickAt"),
      "lastPassAt" = COALESCE(EXCLUDED."lastPassAt", "WordChoice"."lastPassAt"),
      "updatedAt" = EXCLUDED."updatedAt"`;
}

/**
 * Stores a batch of picks and passes (word-model.ts wordChoiceBatch: at most
 * CHOICE_BATCH_MAX events, validated, one row per word and context) in one
 * statement, then clears 'words' so the next model has them. Never throws:
 * a lost choice costs a little learning, never the form.
 */
export async function recordWordChoicesCore(userId: string, events: unknown): Promise<{ ok: boolean; recorded: number }> {
  const rows = wordChoiceBatch(events);
  if (rows.length === 0) return { ok: true, recorded: 0 };
  try {
    await prisma.$executeRaw(wordChoiceSql(userId, rows, rows.map(() => randomUUID())));
    invalidate("words");
    return { ok: true, recorded: rows.length };
  } catch (err) {
    console.error("Words: the choices weren't saved.", err);
    return { ok: false, recorded: 0 };
  }
}
