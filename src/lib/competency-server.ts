/**
 * Skills: the reads and the only writer (server only; the rules are competency.ts; blueprint P5, decisions D7, D8 and
 * D9). The Competency table and the two link columns (TaskTemplate.competencyId, Roadmap.competencyId) are written here
 * and nowhere else, and nothing here touches the ledger: no ActivityEvent, MasteryLedgerEntry or Domain point, no XP,
 * MP, level, kept week, price or moment (scripts/status-check.ts pins that this file writes no ledger and imports no
 * writer). Hours are read from the ledger and never written: a link is the only write that moves them.
 *
 *   loadSkills(userId, opts?)                  the live skills by hours, the Fields an Intellect skill may name, whether
 *                                              writes are on. Fails soft: before the migration (no Competency table, or
 *                                              no competencyId column) it reads as no skills, and walks that can't be read
 *                                              leave an exercise skill its ticks alone
 *   loadSkillsPage(userId)                     loadSkills, plus the suggestions (normTitle families with ≥ 10 live ticks),
 *                                              the Fields by level and Field tier, and the roadmaps a skill may take
 *   loadSkillChoices(userId, templateId)       the task drawer's link control: the skill the task feeds now (and how),
 *                                              the skills it may take, or why it can't take one (a work tab's, a goal)
 *   loadTemplateSkill(userId, templateId)      the skill a template feeds, as it stands (POST /tasks/complete's)
 *   readSkillsPart(userId)                     the celebration snapshot's part: each live skill's hours and tier
 *   addSkillCore / addSuggestedSkillCore / editSkillCore / archiveSkillCore
 *   linkTemplateSkillCore / linkRoadmapSkillCore   a link set or cleared (a work tab's task and a goal are refused)
 *
 * Every write needs lifeWritesEnabled(env) (production, or XTNL_LIFE_JUDGE=1 on the local rehearsal): dev and prod
 * share one database, so a dev server records nothing and says so (SKILL_WRITES_OFF). Every write clears the 'life'
 * cache tag (the snapshot part's), so a link's history never reads as a tick's tier-up.
 *
 * The store and the fact reads are injectable (SkillDeps), so scripts/status-check.ts drives every core on fixtures
 * with no database.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { lifeWritesEnabled, type LifeEnv } from "./life-economy";
import { keyOfDateColumn } from "./life-day";
import { loadFieldLevels } from "./queries";
import { fieldTier, nextTierAt } from "./field-tier";
import {
  SKILL_GONE,
  cleanSkillInput,
  effectiveSkillOf,
  linkRefusalOf,
  planSkillEdit,
  roadmapLinkRefusalOf,
  skillsOf,
  suggestionsOf,
  type FamilyRow,
  type SkillData,
  type SkillFacts,
  type SkillInput,
  type SkillPatch,
  type SkillResult,
  type SkillRow,
  type SkillSuggestion,
  type SkillTemplate,
  type SkillTick,
  type SkillTopUp,
  type SkillView,
} from "./competency";

/** A server whose writes are off (a dev server sharing the database, a Preview) says this and records nothing. */
export const SKILL_WRITES_OFF = "Skill changes are recorded only on the live app.";
const SAVE_FAILED = "Couldn't save that. Try again.";
const NOT_READY = "Skills aren't set up on this database yet.";
const RACED = "That skill changed meanwhile. Try again.";

/** A bound on the rows one read takes (SKILLS_MAX keeps a user's live skills to 30). */
const ROWS_MAX = 100;
/** The roadmaps the link control lists. */
const ROADMAPS_MAX = 20;

// ── The store ───────────────────────────────────────────────────────────────

/** A new row: the data, its id and its place. */
export type SkillNewRow = SkillData & { id: string; sortOrder: number };

/** A template as a link reads it. */
export interface LinkTemplate {
  id: string;
  title: string;
  kind: string;
  boardId: string | null;
  competencyId: string | null;
}

/** A roadmap as a link reads it (and the link control lists it). */
export interface LinkRoadmap {
  id: string;
  /** The goal's own label, else its aim (the user's words). */
  name: string;
  status: string;
  competencyId: string | null;
}

/** The table and the link columns, as the cores use them (the real one is Prisma; the checks pass their own). */
export interface SkillStore {
  /** The user's live rows (archivedAt null). */
  live(userId: string): Promise<SkillRow[]>;
  /** One of the user's rows by id, live or archived. */
  byId(userId: string, id: string): Promise<SkillRow | null>;
  /** A new skill, and (a suggestion taken) its family's templates linked to it, in one transaction; templates linked. */
  insert(userId: string, row: SkillNewRow, linkTemplateIds: readonly string[]): Promise<number>;
  /** A live row's name, attribute and Field; how many changed (0 or 1). */
  update(userId: string, id: string, data: Omit<SkillData, "kind">): Promise<number>;
  /** Archive one live row; how many changed (0 or 1). Its links stay (they count toward nothing while it is archived). */
  archive(userId: string, id: string, at: Date): Promise<number>;
  template(userId: string, templateId: string): Promise<LinkTemplate | null>;
  /** Set or clear one personal TASK or HABIT template's link; how many changed (0 or 1). */
  linkTemplate(userId: string, templateId: string, competencyId: string | null): Promise<number>;
  roadmap(userId: string, roadmapId: string): Promise<LinkRoadmap | null>;
  linkRoadmap(userId: string, roadmapId: string, competencyId: string | null): Promise<number>;
}

/** The facts the hours read, each injectable. */
export interface SkillReads {
  /** The personal templates that feed a skill (their own link or their roadmap's). */
  templates: (userId: string) => Promise<SkillTemplate[]>;
  /** Those templates' TASK rows, each with its instance's minutes and whether an 'undo:<id>' row took it back. */
  ticks: (userId: string, templateIds: readonly string[]) => Promise<SkillTick[]>;
  /** Every logged walk's minutes, and how many. */
  walks: (userId: string) => Promise<{ minutes: number; count: number }>;
  /** The walks still logged that topped up a template already ticked on their day ("Counts as" after a tick). */
  topUps: (userId: string) => Promise<SkillTopUp[]>;
  /** Every Field's id, name and level now (queries.ts loadFieldLevels). */
  fields: () => Promise<readonly { id: string; name: string; level: number }[]>;
  /** The personal TASK and HABIT templates that feed no skill, with their live completions (the suggestions). */
  families: (userId: string) => Promise<FamilyRow[]>;
  /** The user's roadmaps that may take a skill (not archived), lowest seat first. */
  roadmaps: (userId: string) => Promise<LinkRoadmap[]>;
}

export interface SkillDeps {
  store?: SkillStore;
  reads?: Partial<SkillReads>;
  /** The variables the write gate reads (process.env by default). */
  env?: LifeEnv;
  now?: () => Date;
  /** A new row's id (a UUID by default; the checks pass a counter). */
  newId?: () => string;
}

/**
 * Whether a database error says the skills' schema isn't there yet (the migration not applied: no Competency table,
 * no competencyId column), or the client predates it.
 */
export function isMissingSkillSchema(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; meta?: unknown };
  const text = `${typeof e.message === "string" ? e.message : ""} ${JSON.stringify(e.meta ?? {})}`;
  if (e.code === "P2021" || /\b42P01\b/.test(text) || /(relation|table) \W{0,2}(public\.)?\W?Competency\W{0,2} does not exist/i.test(text)) return /Competency/.test(text);
  if (e.code === "P2022" || /\b42703\b/.test(text) || /column \S*competencyId\S* does not exist/i.test(text)) return /competencyId/.test(text);
  // A client generated before the migration: no competency delegate, or no competencyId argument.
  if (err instanceof TypeError) return /\b(findMany|findFirst|create|updateMany)\b/.test(text) && /undefined/.test(text);
  return err instanceof Prisma.PrismaClientValidationError && /competencyId|competency/.test(text);
}

let warnedMissing = false;
function warnMissing(label: string): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(`${label}: the skills' schema is missing (migration 20261230000000_competencies not applied); showing no skills.`);
}

const ROW_SELECT = { id: true, name: true, attribute: true, kind: true, fieldId: true, sortOrder: true, createdAt: true, archivedAt: true } as const;

type DbRow = { id: string; name: string; attribute: string; kind: string; fieldId: string | null; sortOrder: number; createdAt: Date; archivedAt: Date | null };

const rowOf = (r: DbRow): SkillRow => ({ ...r, createdAt: r.createdAt.toISOString(), archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null });

/** The kinds a link may name: a task or a habit (a goal and an idea draft are never practised). */
const LINKABLE_KINDS = ["TASK", "HABIT"];

/** The real store: Prisma. */
export const prismaSkillStore: SkillStore = {
  async live(userId) {
    const rows = await prisma.competency.findMany({ where: { userId, archivedAt: null }, select: ROW_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: ROWS_MAX });
    return rows.map(rowOf);
  },
  async byId(userId, id) {
    const r = await prisma.competency.findFirst({ where: { id, userId }, select: ROW_SELECT });
    return r ? rowOf(r) : null;
  },
  async insert(userId, row, linkTemplateIds) {
    const data = { id: row.id, userId, name: row.name, attribute: row.attribute, kind: row.kind, fieldId: row.fieldId, sortOrder: row.sortOrder };
    if (linkTemplateIds.length === 0) {
      await prisma.competency.create({ data });
      return 0;
    }
    const [, linked] = await prisma.$transaction([
      prisma.competency.create({ data }),
      // Only templates that feed no skill yet: a link set meanwhile is never overwritten.
      prisma.taskTemplate.updateMany({ where: { id: { in: [...linkTemplateIds] }, userId, boardId: null, kind: { in: LINKABLE_KINDS }, competencyId: null }, data: { competencyId: row.id } }),
    ]);
    return linked.count;
  },
  async update(userId, id, data) {
    return (await prisma.competency.updateMany({ where: { id, userId, archivedAt: null }, data: { name: data.name, attribute: data.attribute, fieldId: data.fieldId } })).count;
  },
  async archive(userId, id, at) {
    return (await prisma.competency.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: at } })).count;
  },
  async template(userId, templateId) {
    return prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { id: true, title: true, kind: true, boardId: true, competencyId: true } });
  },
  async linkTemplate(userId, templateId, competencyId) {
    return (await prisma.taskTemplate.updateMany({ where: { id: templateId, userId, boardId: null, kind: { in: LINKABLE_KINDS } }, data: { competencyId } })).count;
  },
  async roadmap(userId, roadmapId) {
    const r = await prisma.roadmap.findFirst({ where: { id: roadmapId, userId }, select: { id: true, aim: true, label: true, status: true, competencyId: true } });
    return r ? { id: r.id, name: r.label ?? r.aim, status: r.status, competencyId: r.competencyId } : null;
  },
  async linkRoadmap(userId, roadmapId, competencyId) {
    return (await prisma.roadmap.updateMany({ where: { id: roadmapId, userId, status: { not: "ARCHIVED" } }, data: { competencyId } })).count;
  },
};

// ── The fact reads ──────────────────────────────────────────────────────────

type TemplateRaw = { id: string; title: string; kind: string; competencyId: string | null; estMinutes: number; boardId: string | null; roadmapCompetencyId: string | null };
type TickRaw = { id: string; templateId: string; dedupeKey: string | null; receiptMinutes: number | null; instanceMinutes: number | null; instanceSource: string | null; day: Date | null; undone: boolean };
type FamilyRaw = { id: string; title: string; normTitle: string; track: string; category: string; completions: number };

const num = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** The real fact reads. */
export const prismaSkillReads: SkillReads = {
  async templates(userId) {
    // A practice or step of a roadmap is keyed 'rm:<milestoneId>:p<i>' / ':s<i>' (roadmap-types): its milestone's roadmap
    // names the skill unless the template names its own. A work tab's task never feeds one.
    const rows = await prisma.$queryRaw<TemplateRaw[]>`
      SELECT t."id", t."title", t."kind", t."competencyId", t."estMinutes", t."boardId", r."competencyId" AS "roadmapCompetencyId"
      FROM "TaskTemplate" t
      LEFT JOIN "RoadmapMilestone" m ON t."captureKey" ~ '^rm:[^:]+:[ps][0-9]+$' AND m."id" = split_part(t."captureKey", ':', 2)
      LEFT JOIN "Roadmap" r ON r."id" = m."roadmapId" AND r."userId" = t."userId"
      WHERE t."userId" = ${userId} AND t."boardId" IS NULL AND (t."competencyId" IS NOT NULL OR r."competencyId" IS NOT NULL)
    `;
    return rows.map((r) => ({ ...r, estMinutes: num(r.estMinutes) ?? 0 }));
  },
  async ticks(userId, templateIds) {
    if (templateIds.length === 0) return [];
    // Every TASK row of the templates, with its instance's minutes and source; an 'undo:<id>' row of any source (an
    // UNDO, a walk's reversal) takes it back. The receipt's minutes only: the rest of the receipt is never read here.
    const rows = await prisma.$queryRaw<TickRaw[]>`
      SELECT e."id", e."templateId", e."dedupeKey",
        CASE WHEN jsonb_typeof(e."receipt"->'minutes') = 'number' THEN (e."receipt"->>'minutes')::float8 ELSE NULL END AS "receiptMinutes",
        i."minutes" AS "instanceMinutes", i."source" AS "instanceSource", COALESCE(i."day", e."day") AS "day",
        EXISTS (SELECT 1 FROM "ActivityEvent" u WHERE u."userId" = e."userId" AND u."dedupeKey" = 'undo:' || e."id") AS "undone"
      FROM "ActivityEvent" e
      LEFT JOIN "TaskInstance" i ON i."id" = e."sourceId"
      WHERE e."userId" = ${userId} AND e."source" = 'TASK' AND e."templateId" = ANY(${[...templateIds]}::text[])
    `;
    return rows.map((r) => ({ ...r, receiptMinutes: num(r.receiptMinutes), instanceMinutes: num(r.instanceMinutes), day: r.day ? keyOfDateColumn(new Date(r.day)) : null, undone: r.undone === true }));
  },
  async walks(userId) {
    const [row] = await prisma.$queryRaw<{ minutes: number | null; count: number | null }[]>`
      SELECT COALESCE(SUM("durationMin"), 0)::float8 AS "minutes", COUNT(*)::int AS "count" FROM "ExerciseSession" WHERE "userId" = ${userId} AND "kind" = 'WALK'
    `;
    return { minutes: num(row?.minutes) ?? 0, count: num(row?.count) ?? 0 };
  },
  async topUps(userId) {
    // A WORKOUT row whose receipt topped up a habit already ticked (exercise.ts walkReceiptOf's walk.topUp), while its
    // walk is one the walks above count (its ExerciseSession is still there, of kind WALK): that day's ticks of the
    // template are the walk's time on an EXERCISE skill.
    const rows = await prisma.$queryRaw<{ templateId: string | null; day: Date }[]>`
      SELECT w."receipt"->'walk'->'topUp'->>'templateId' AS "templateId", w."day"
      FROM "ActivityEvent" w
      JOIN "ExerciseSession" s ON s."id" = w."sourceId" AND s."userId" = w."userId" AND s."kind" = 'WALK'
      WHERE w."userId" = ${userId} AND w."source" = 'WORKOUT' AND w."dedupeKey" LIKE 'workout:%'
        AND jsonb_typeof(w."receipt"->'walk'->'topUp') = 'object'
    `;
    return rows.filter((r) => typeof r.templateId === "string" && r.templateId.length > 0).map((r) => ({ templateId: r.templateId!, day: keyOfDateColumn(new Date(r.day)) }));
  },
  fields: async () => (await loadFieldLevels()).map((f) => ({ id: f.id, name: f.name, level: f.level })),
  async families(userId) {
    const rows = await prisma.$queryRaw<FamilyRaw[]>`
      SELECT t."id", t."title", t."normTitle", t."track", t."category", COUNT(e."id")::int AS "completions"
      FROM "TaskTemplate" t
      JOIN "ActivityEvent" e ON e."userId" = t."userId" AND e."templateId" = t."id" AND e."source" = 'TASK'
      LEFT JOIN "RoadmapMilestone" m ON t."captureKey" ~ '^rm:[^:]+:[ps][0-9]+$' AND m."id" = split_part(t."captureKey", ':', 2)
      LEFT JOIN "Roadmap" r ON r."id" = m."roadmapId" AND r."userId" = t."userId"
      WHERE t."userId" = ${userId} AND t."boardId" IS NULL AND t."competencyId" IS NULL AND r."competencyId" IS NULL AND t."kind" IN ('TASK', 'HABIT')
        AND (e."dedupeKey" IS NULL OR e."dedupeKey" NOT LIKE 'undo:%')
        AND NOT EXISTS (SELECT 1 FROM "ActivityEvent" u WHERE u."userId" = e."userId" AND u."dedupeKey" = 'undo:' || e."id")
      GROUP BY t."id"
    `;
    return rows.map((r) => ({ ...r, completions: num(r.completions) ?? 0 }));
  },
  async roadmaps(userId) {
    const rows = await prisma.roadmap.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      select: { id: true, aim: true, label: true, status: true, competencyId: true },
      orderBy: [{ slot: "asc" }, { createdAt: "asc" }],
      take: ROADMAPS_MAX,
    });
    return rows.map((r) => ({ id: r.id, name: r.label ?? r.aim, status: r.status, competencyId: r.competencyId }));
  },
};

const soft =
  <T>(what: string, fallback: T) =>
  (err: unknown): T => {
    if (!isMissingSkillSchema(err)) console.error(`[skills] ${what} unavailable`, err);
    return fallback;
  };

const depsOf = (deps: SkillDeps = {}) => ({
  store: deps.store ?? prismaSkillStore,
  reads: { ...prismaSkillReads, ...deps.reads },
  now: deps.now ?? (() => new Date()),
  newId: deps.newId ?? (() => globalThis.crypto.randomUUID()),
  writesOn: lifeWritesEnabled(deps.env),
});

/** The live rows; none when the schema is missing (the migration not applied yet), and then `ready` is false. */
async function liveRows(store: SkillStore, userId: string, label: string): Promise<{ rows: SkillRow[]; ready: boolean }> {
  try {
    return { rows: await store.live(userId), ready: true };
  } catch (err) {
    if (!isMissingSkillSchema(err)) throw err;
    warnMissing(label);
    return { rows: [], ready: false };
  }
}

/**
 * The facts the hours need: the templates that feed a skill, their ticks (only when a template does), and the walks
 * with their top-ups (only when an exercise skill is live). The templates are the hours themselves, so a failed read
 * there throws; the walks and top-ups fail soft together (an exercise skill then counts its ticks alone).
 */
async function factsFor(userId: string, rows: readonly SkillRow[], reads: SkillReads): Promise<SkillFacts> {
  if (rows.length === 0) return { templates: [], ticks: [], walks: null, topUps: [] };
  const exercise = rows.some((r) => r.kind === "EXERCISE");
  const walkSide = exercise
    ? Promise.all([reads.walks(userId), reads.topUps(userId)]).then(([walks, topUps]) => ({ walks, topUps })).catch(soft("the walks", null))
    : Promise.resolve(null);
  const [templates, walked] = await Promise.all([reads.templates(userId), walkSide]);
  const live = new Set(rows.map((r) => r.id));
  const feeding = templates.filter((t) => effectiveSkillOf(t, live) != null).map((t) => t.id);
  const ticks = feeding.length > 0 ? await reads.ticks(userId, feeding) : [];
  return { templates, ticks, walks: walked?.walks ?? null, topUps: walked?.topUps ?? [] };
}

// ── The reads ───────────────────────────────────────────────────────────────

/** What the Status card, the Skills page and the phone read. */
export interface SkillsView {
  skills: SkillView[];
  /** The Fields an Intellect skill may name (id, name, level now), by name. */
  fields: { id: string; name: string; level: number }[];
  /** Writes are on (production, or the local rehearsal). */
  writesOn: boolean;
  /** The schema is there (the migration applied): false reads as no skills, and adding one says it isn't set up. */
  ready: boolean;
}

export const EMPTY_SKILLS: SkillsView = { skills: [], fields: [], writesOn: false, ready: false };

/** The live skills by hours, fresh on every read (a link shows at once). Before the migration: none. */
export async function loadSkills(userId: string, opts: SkillDeps & { fields?: boolean } = {}): Promise<SkillsView> {
  const d = depsOf(opts);
  const [live, fieldList] = await Promise.all([
    liveRows(d.store, userId, "loadSkills"),
    opts.fields === false ? Promise.resolve([]) : d.reads.fields().catch(soft("the Field levels", [] as readonly { id: string; name: string; level: number }[])),
  ]);
  const fields = [...fieldList].sort((a, b) => a.name.localeCompare(b.name));
  let facts: SkillFacts;
  try {
    facts = await factsFor(userId, live.rows, d.reads);
  } catch (err) {
    if (!isMissingSkillSchema(err)) throw err;
    warnMissing("loadSkills");
    return { skills: [], fields, writesOn: d.writesOn, ready: false };
  }
  return { skills: skillsOf(live.rows, facts, fields), fields, writesOn: d.writesOn, ready: live.ready };
}

/** A Field as the Skills page lists it: its level and its Field tier (field-tier.ts). */
export interface SkillsPageField {
  id: string;
  name: string;
  level: number;
  tier: string;
  /** The level the next Field tier starts at; null at the top. */
  nextAt: number | null;
}

export interface SkillsPage extends SkillsView {
  suggestions: SkillSuggestion[];
  /** The Fields by level (highest first), each with its Field tier. */
  fieldRows: SkillsPageField[];
  /** The roadmaps a skill may take, each with the skill it names now. */
  roadmaps: LinkRoadmap[];
}

/** The Skills page: the skills, the suggestions (none before the migration), the Fields by level and tier, and the roadmaps. */
export async function loadSkillsPage(userId: string, opts: SkillDeps = {}): Promise<SkillsPage> {
  const d = depsOf(opts);
  const [view, families, roadmaps] = await Promise.all([
    loadSkills(userId, opts),
    d.reads.families(userId).catch(soft("the task families", [] as FamilyRow[])),
    d.reads.roadmaps(userId).catch(soft("the roadmaps", [] as LinkRoadmap[])),
  ]);
  const fieldRows = [...view.fields]
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
    .map((f) => ({ id: f.id, name: f.name, level: f.level, tier: fieldTier(f.level).label, nextAt: nextTierAt(f.level) }));
  // The live skills as the suggestions read them (a family a skill already names is not suggested).
  const live = view.skills.map((s) => ({ name: s.name, kind: s.kind, archivedAt: null }));
  return { ...view, suggestions: view.ready ? suggestionsOf(families, live) : [], fieldRows, roadmaps: view.ready ? roadmaps : [] };
}

/** The task drawer's link control. */
export interface SkillChoices {
  /** The skill the task feeds now, and how: its own link, or its roadmap's. */
  current: { id: string; name: string; via: "own" | "roadmap" } | null;
  /** The live skills it may take, by name. */
  choices: { id: string; name: string; attribute: string }[];
  /** Why it can't take one (a work tab's task, a goal); null when it can. */
  refusal: string | null;
  writesOn: boolean;
}

/** The drawer's control for one template: what it feeds, what it may take, or why it can't. */
export async function loadSkillChoices(userId: string, templateId: string, opts: SkillDeps = {}): Promise<SkillChoices> {
  const d = depsOf(opts);
  const [{ rows }, template, templates] = await Promise.all([
    liveRows(d.store, userId, "loadSkillChoices"),
    d.store.template(userId, templateId).catch(soft("the task", null)),
    d.reads.templates(userId).catch(soft("the linked tasks", [] as SkillTemplate[])),
  ]);
  const refusal = linkRefusalOf(template ? { boardId: template.boardId, kind: template.kind } : null, null, true);
  const live = new Set(rows.map((r) => r.id));
  const linked = templates.find((t) => t.id === templateId) ?? null;
  const id = linked ? effectiveSkillOf(linked, live) : null;
  const skill = id ? rows.find((r) => r.id === id) : undefined;
  return {
    current: skill ? { id: skill.id, name: skill.name, via: linked?.competencyId === skill.id ? "own" : "roadmap" } : null,
    choices: rows.map((r) => ({ id: r.id, name: r.name, attribute: r.attribute })).sort((a, b) => a.name.localeCompare(b.name)),
    refusal,
    writesOn: d.writesOn,
  };
}

/** The skill a template feeds, as it stands now (POST /tasks/complete's `competency`); null with none. */
export async function loadTemplateSkill(userId: string, templateId: string, opts: SkillDeps = {}): Promise<SkillView | null> {
  const d = depsOf(opts);
  const { rows } = await liveRows(d.store, userId, "loadTemplateSkill");
  if (rows.length === 0) return null;
  const facts = await factsFor(userId, rows, d.reads);
  const t = facts.templates.find((x) => x.id === templateId);
  const id = t ? effectiveSkillOf(t, new Set(rows.map((r) => r.id))) : null;
  if (!id) return null;
  return skillsOf(rows, facts).find((s) => s.id === id) ?? null;
}

/** The celebration snapshot's part (celebration-detect CompetenciesPart): every live skill's hours and tier. */
export interface SkillsPartRow {
  id: string;
  name: string;
  hours: number;
  tier: number;
  line: string;
}

/** Every live skill's hours and tier for the snapshot; none before the migration (quietly: a tick still plays its moments). */
export async function readSkillsPart(userId: string, opts: SkillDeps = {}): Promise<{ rows: SkillsPartRow[] }> {
  const view = await loadSkills(userId, { ...opts, fields: false });
  return { rows: view.skills.map((s) => ({ id: s.id, name: s.name, hours: s.hours, tier: s.tier, line: s.line })) };
}

// ── The writes ──────────────────────────────────────────────────────────────

function writeFailed(label: string, err: unknown): { ok: false; error: string } {
  if (isMissingSkillSchema(err)) {
    warnMissing(label);
    return { ok: false, error: NOT_READY };
  }
  // Two adds racing on one name, or on the walks (the partial unique indexes).
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { ok: false, error: RACED };
  console.error(`[skills] ${label} failed:`, err);
  return { ok: false, error: SAVE_FAILED };
}

const nextSort = (live: readonly SkillRow[]) => Math.max(-1, ...live.map((r) => r.sortOrder)) + 1;

/** Adds a skill (competency.ts cleanSkillInput: a unique name, an attribute, practice or exercise, an Intellect skill's Field). */
export async function addSkillCore(userId: string, input: SkillInput, deps: SkillDeps = {}): Promise<SkillResult<{ id: string }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: SKILL_WRITES_OFF };
  try {
    const [live, fields] = await Promise.all([d.store.live(userId), d.reads.fields()]);
    const clean = cleanSkillInput(input, { live, fields });
    if (!clean.ok) return clean;
    const id = d.newId();
    await d.store.insert(userId, { ...clean.value, id, sortOrder: nextSort(live) }, []);
    invalidate("life");
    return { ok: true, value: { id } };
  } catch (err) {
    return writeFailed("addSkillCore", err);
  }
}

/**
 * Takes a suggestion: the skill it names, with every template of its family linked to it, in one transaction. The
 * family is read again here by its key (nothing the browser sends but the key is trusted); a family no longer
 * suggested (linked meanwhile, or below the count) is refused.
 */
export async function addSuggestedSkillCore(userId: string, key: string, deps: SkillDeps = {}): Promise<SkillResult<{ id: string; linked: number }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: SKILL_WRITES_OFF };
  try {
    const [live, fields, families] = await Promise.all([d.store.live(userId), d.reads.fields(), d.reads.families(userId)]);
    const s = suggestionsOf(families, live).find((x) => x.key === key);
    if (!s) return { ok: false, error: "That suggestion has gone: its tasks feed a skill already." };
    const clean = cleanSkillInput({ name: s.name, attribute: s.attribute, kind: s.kind }, { live, fields });
    if (!clean.ok) return clean;
    const id = d.newId();
    const linked = await d.store.insert(userId, { ...clean.value, id, sortOrder: nextSort(live) }, s.templateIds);
    invalidate("life");
    return { ok: true, value: { id, linked } };
  } catch (err) {
    return writeFailed("addSuggestedSkillCore", err);
  }
}

/** Renames a skill, moves it to another attribute (not an exercise skill: walks are Vitality's), or sets an Intellect skill's Field. */
export async function editSkillCore(userId: string, id: string, patch: SkillPatch, deps: SkillDeps = {}): Promise<SkillResult<{ id: string }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: SKILL_WRITES_OFF };
  try {
    const [row, live, fields] = await Promise.all([d.store.byId(userId, id), d.store.live(userId), d.reads.fields()]);
    if (!row || row.archivedAt != null) return { ok: false, error: SKILL_GONE };
    const plan = planSkillEdit(row, patch, { live, fields });
    if (!plan.ok) return plan;
    const changed = await d.store.update(userId, id, plan.value);
    if (changed !== 1) return { ok: false, error: SKILL_GONE };
    invalidate("life");
    return { ok: true, value: { id } };
  } catch (err) {
    return writeFailed("editSkillCore", err);
  }
}

/** Retires a skill: archivedAt is set. Its links stay and count toward nothing; its Seals stay in Moments. */
export async function archiveSkillCore(userId: string, id: string, deps: SkillDeps = {}): Promise<SkillResult<null>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: SKILL_WRITES_OFF };
  try {
    const changed = await d.store.archive(userId, id, d.now());
    if (changed !== 1) return { ok: false, error: SKILL_GONE };
    invalidate("life");
    return { ok: true, value: null };
  } catch (err) {
    return writeFailed("archiveSkillCore", err);
  }
}

/**
 * Links a template to a live skill, or clears its link (`competencyId` null). A work tab's task, a goal and an idea
 * draft are refused (competency.ts linkRefusalOf). A template names at most one skill: a new link replaces the old.
 * Its history counts from now, on read; nothing else is written.
 */
export async function linkTemplateSkillCore(userId: string, templateId: string, competencyId: string | null, deps: SkillDeps = {}): Promise<SkillResult<{ competencyId: string | null }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: SKILL_WRITES_OFF };
  try {
    const [template, skill] = await Promise.all([d.store.template(userId, templateId), competencyId ? d.store.byId(userId, competencyId) : Promise.resolve(null)]);
    const refusal = linkRefusalOf(template ? { boardId: template.boardId, kind: template.kind } : null, skill, competencyId == null);
    if (refusal) return { ok: false, error: refusal };
    if ((template!.competencyId ?? null) === competencyId) return { ok: true, value: { competencyId } };
    const changed = await d.store.linkTemplate(userId, templateId, competencyId);
    if (changed !== 1) return { ok: false, error: "That task changed meanwhile. Try again." };
    invalidate("life");
    return { ok: true, value: { competencyId } };
  } catch (err) {
    return writeFailed("linkTemplateSkillCore", err);
  }
}

/** Links a roadmap's practices and steps to a live skill (a practice's own link still wins), or clears it. */
export async function linkRoadmapSkillCore(userId: string, roadmapId: string, competencyId: string | null, deps: SkillDeps = {}): Promise<SkillResult<{ competencyId: string | null }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: SKILL_WRITES_OFF };
  try {
    const [roadmap, skill] = await Promise.all([d.store.roadmap(userId, roadmapId), competencyId ? d.store.byId(userId, competencyId) : Promise.resolve(null)]);
    const refusal = roadmapLinkRefusalOf(roadmap, skill, competencyId == null);
    if (refusal) return { ok: false, error: refusal };
    if ((roadmap!.competencyId ?? null) === competencyId) return { ok: true, value: { competencyId } };
    const changed = await d.store.linkRoadmap(userId, roadmapId, competencyId);
    if (changed !== 1) return { ok: false, error: "That roadmap changed meanwhile. Try again." };
    invalidate("life");
    return { ok: true, value: { competencyId } };
  } catch (err) {
    return writeFailed("linkRoadmapSkillCore", err);
  }
}
