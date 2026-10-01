/**
 * Filing an idea without losing it (capture.md 'Idea capture without the
 * round trip' part 6, and P2 'One-box ideas').
 *
 * Two halves:
 *
 * 1. The rules the idea write path runs on, pure: how long each model call
 *    may take and what stands in when it fails (modelOr), the honest error a
 *    submission returns when the embedding service is unreachable, the
 *    Domain name used when naming fails (fallbackDomainName), which outcomes
 *    archive the Inbox draft, and how a draft row becomes SHORT content.
 *    ideas.ts, dedup.ts and domain-discovery.ts import them; so does
 *    idea-capture-check.ts, which is why this module's static imports stay
 *    free of the database client.
 *
 * 2. One-box filing: an 'idea: Q :: A' line files itself. createFromCapture
 *    writes the IDEA_DRAFT first (title = question, note = answer), then, for
 *    a draft with an answer that is not a duplicate, runs
 *    `after(() => fileIdeaDraftCore(userId, id))`, with userId read before
 *    after(). This loads the draft (not archived), builds SHORT { question:
 *    title, answer: note } and submits it through ideas.ts with the draftId,
 *    collection BOOK. Created or merged archives the draft (the draftId
 *    rule, inside the submission) and the IDEA_CREATE hook pays as it does
 *    today; saturated or failed leaves the draft in the Inbox, where Finish
 *    opens /add?draft=<id> to link or enrich it. Saturation never
 *    auto-merges.
 *
 * Server-only. Never a "use server" module: fileIdeaDraftCore takes a
 * userId, so it must not be callable from the browser. It never throws; it
 * logs.
 *
 * The submission goes through ideas.ts's `submitIdea`, a thin wrapper over
 * its private submitIdeaCore: the creation code (the yield, the IDEA_CREATE
 * row) stays in ideas.ts, where study-side-check pins it, and a "use server"
 * module may not export the core itself (contract §4). ideas.ts and the
 * database client are loaded on call, which also keeps the import graph
 * free of a cycle (ideas.ts imports this module).
 */
import type { IdeaContent } from "./idea-payload";
import type { SubmitIdeaResult } from "@/app/actions/ideas";
import { withModelTimeout } from "./gemini";
import { splitIdeaLine } from "./capture-parse";

/** What one attempt to file a draft came to. */
export type IdeaFilingOutcome = "created" | "merged" | "saturated" | "failed";

// ── Model calls: deadlines and stand-ins ─────────────────────────────────────

/** The embedding a submission cannot do without: dedup and routing both read it. */
export const IDEA_EMBED_TIMEOUT_MS = 10_000;
/** Node synthesis (title, premise, prompt, tags): optional, the Idea is filed without it. */
export const IDEA_SYNTH_TIMEOUT_MS = 12_000;
/** Naming a new Domain: optional, fallbackDomainName stands in. */
export const IDEA_NAMING_TIMEOUT_MS = 8_000;

/** A known failure, returned rather than thrown because production hides thrown messages. */
export interface IdeaActionError {
  status: "error";
  message: string;
}

/** Nothing was written; the form keeps every field. */
export const EMBED_FAILED: IdeaActionError = {
  status: "error",
  message: "Couldn't reach the embedding service. Your idea is still here. Try again in a minute.",
};

/** Enrich's synthesis failed: nothing was folded in. */
export const ENRICH_FAILED: IdeaActionError = {
  status: "error",
  message: "Couldn't reach the service that writes the enrichment. Nothing was changed. Try again in a minute.",
};

/**
 * The model's answer, or `fallback(error)` once `ms` pass or the call fails
 * (a missing API key, a network error, a malformed reply), whichever comes
 * first. Never throws unless `fallback` does: a model hiccup is a value on
 * the write path, never an exception. `call` is a thunk, so even a
 * synchronous throw lands here.
 */
export async function modelOr<T>(
  call: () => Promise<T>,
  ms: number,
  fallback: (error: string) => T,
  label: string,
  log: (message: string) => void = (m) => console.warn(m)
): Promise<T> {
  const res = await withModelTimeout(Promise.resolve().then(call), ms);
  if (res.ok) return res.value;
  log(`${label} failed (${res.error}); went on without it.`);
  return fallback(res.error);
}

/** The embedding, or EMBED_FAILED: a submission's one model call it cannot file without. */
export async function embedOrError(call: () => Promise<number[]>, label: string, ms = IDEA_EMBED_TIMEOUT_MS): Promise<number[] | IdeaActionError> {
  const v = await modelOr<number[] | null>(call, ms, () => null, label);
  return v ?? EMBED_FAILED;
}

// ── The Domain name when naming fails ────────────────────────────────────────

/** Function words, the embedding text's own labels, and common Vietnamese particles. */
const STOP_WORDS = new Set(
  (
    "a an the and or but nor of to in on at by for from with without into onto over under about above below between " +
    "as is are was were be been being am do does did done has have had having can could will would shall should may might must " +
    "it its it's this that these those there here what which who whom whose why how when where whether if then than so " +
    "not no yes any all some each every both either neither more most less least very too also just only own same such " +
    "i me my we our you your he him his she her they them their one ones vs via per etc eg ie " +
    "correct question answer " +
    "là của và các những có không được cho với một trong này đó gì nào sao thế như để khi thì mà ở tại từ về bị đã sẽ đang rất cũng nhưng hay hoặc"
  ).split(/\s+/)
);

/** Domain names are short labels; a longer one is cut at a word boundary. */
const DOMAIN_NAME_MAX = 40;

function titleCaseWord(w: string): string {
  return w ? w[0].toLocaleUpperCase() + w.slice(1) : w;
}

function capName(name: string): string {
  const s = name.replace(/\s+/g, " ").trim();
  if (s.length <= DOMAIN_NAME_MAX) return s;
  const cut = s.slice(0, DOMAIN_NAME_MAX + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : s.slice(0, DOMAIN_NAME_MAX)).trim();
}

/**
 * A Domain name with no model: the first usable tag in Title Case
 * ('cell-biology' → 'Cell Biology'); else the first three content words with
 * stop-words removed, in Title Case; capped at 40 characters at a word
 * boundary; else '<Field> notes'. The caller still matches it against the
 * Field's existing Domains, case-insensitively, before creating one.
 */
export function fallbackDomainName(fieldName: string, tags: readonly string[], contentText: string): string {
  for (const tag of tags ?? []) {
    if (typeof tag !== "string") continue;
    const words = tag.split(/[\s_-]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    if (words.length > 0) return capName(words.map(titleCaseWord).join(" "));
  }
  const words = (typeof contentText === "string" ? contentText.match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu) ?? [] : []).filter(
    (w) => !STOP_WORDS.has(w.toLocaleLowerCase()) && !/^\p{N}+$/u.test(w) && w.length > 1
  );
  if (words.length > 0) return capName(words.slice(0, 3).map(titleCaseWord).join(" "));
  const field = typeof fieldName === "string" ? fieldName.trim() : "";
  return capName(field ? `${field} notes` : "Notes");
}

// ── The Inbox draft ──────────────────────────────────────────────────────────

/** A draft id from a URL or a client: a cuid-shaped string of at most 64 characters, or null. */
export function validDraftId(id: unknown): string | null {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/**
 * Which outcomes archive the Inbox draft. Created and merged: the idea now
 * exists (merged: as the card it matched), so the draft has done its job.
 * Saturated: nothing was written and the user must still choose Link or
 * Enrich, so the draft stays. Error: nothing was written.
 */
export const ARCHIVES_DRAFT: Readonly<Record<SubmitIdeaResult["status"], boolean>> = {
  created: true,
  merged: true,
  saturated: false,
  error: false,
};

export function filingArchivesDraft(status: SubmitIdeaResult["status"]): boolean {
  return ARCHIVES_DRAFT[status] === true;
}

/** A submission's result as a filing outcome; an error member is a failed filing. */
export function filingOutcomeOf(status: SubmitIdeaResult["status"]): IdeaFilingOutcome {
  return status === "error" ? "failed" : status;
}

/** The columns of an IDEA_DRAFT row that carry its text. */
export interface IdeaDraftRow {
  title: string;
  note: string | null;
  rawText: string | null;
}

/**
 * A draft's question and answer. The parser cuts the answer out of the title
 * (title = question) and createTemplateCore stores it as `note`; a draft
 * written before that, or with its answer chip reverted, still has 'Q :: A'
 * in the title; and the raw line keeps it in every case. Read with
 * splitIdeaLine, the same rule the capture sheet's chips use.
 */
export function ideaDraftContent(row: IdeaDraftRow): { question: string; answer: string } {
  const fromTitle = splitIdeaLine(row.title ?? "");
  const question = fromTitle.question || (row.title ?? "").trim();
  const note = (row.note ?? "").trim();
  const answer = note || fromTitle.answer || (row.rawText ? splitIdeaLine(row.rawText).answer : null) || "";
  return { question, answer };
}

// ── One-box filing ───────────────────────────────────────────────────────────

/** What filing needs from the outside world; stubs in idea-capture-check.ts. */
export interface FilingDeps {
  /** The open (not archived) IDEA_DRAFT row, or null. The text is read back from the row, never from the line. */
  loadDraft(draftId: string): Promise<IdeaDraftRow | null>;
  /** The submission: the only step that calls a model. Archives the draft itself on created or merged. */
  submit(content: IdeaContent, draftId: string): Promise<SubmitIdeaResult>;
  log(message: string): void;
}

/**
 * Files one written draft. The order is the guarantee: the row is read back
 * first and the model is reached only through `submit`, after it, so no
 * model call happens for a line that is not already safe in the Inbox; and
 * every failure, thrown or returned, is 'failed', which keeps the draft.
 */
export async function runIdeaFiling(deps: FilingDeps, draftId: string): Promise<IdeaFilingOutcome> {
  try {
    const row = await deps.loadDraft(draftId);
    if (!row) {
      deps.log(`draft ${draftId} is not an open idea draft; nothing to file.`);
      return "failed";
    }
    const { question, answer } = ideaDraftContent(row);
    if (!question || !answer) {
      deps.log(`draft ${draftId} has no ${question ? "answer" : "question"}; it waits in the Inbox.`);
      return "failed";
    }
    const res = await deps.submit({ type: "SHORT", question, answer }, draftId);
    if (res.status === "error") deps.log(`draft ${draftId} was not filed: ${res.message}`);
    return filingOutcomeOf(res.status);
  } catch (err) {
    deps.log(`draft ${draftId} was not filed: ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }
}

export async function fileIdeaDraftCore(userId: string, draftId: string): Promise<IdeaFilingOutcome> {
  const id = validDraftId(draftId);
  const log = (message: string) => console.warn(`fileIdeaDraftCore: ${message}`);
  if (!id || typeof userId !== "string" || !userId) {
    log("called without a valid user or draft id.");
    return "failed";
  }
  try {
    const [{ prisma }, { submitIdea }, { getCurrentUserId }] = await Promise.all([
      import("./prisma"),
      import("@/app/actions/ideas"),
      import("./user"),
    ]);
    // submitIdea files for the instance's user (single tenant, user.ts).
    // Refuse rather than file one user's draft into another's library.
    if (getCurrentUserId() !== userId) {
      log(`draft ${id} belongs to another user; not filed.`);
      return "failed";
    }
    return await runIdeaFiling(
      {
        loadDraft: (draft) =>
          prisma.taskTemplate.findFirst({
            where: { id: draft, userId, kind: "IDEA_DRAFT", archivedAt: null },
            select: { title: true, note: true, rawText: true },
          }),
        submit: (content, draft) => submitIdea({ content, collectionLabel: "BOOK", draftId: draft }),
        log,
      },
      id
    );
  } catch (err) {
    log(`draft ${id} was not filed: ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }
}
