/**
 * Roadmap readings (lane R1, F10, F12): the writers — one source of truth for
 * g, RAISE and Proficiency — and the goal seam's series loader. Server-only
 * (Prisma). Every write is gated by life-economy lifeWritesEnabled() and goes
 * through the upsert rule (roadmap.md Migration: today only; source and
 * observedAt guarded; an unchanged row writes nothing); each writer writes the
 * roadmap's PROFICIENCY reading too, applies the reach rules, and invalidates
 * 'roadmap'.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R1. Callers:
 *   recordRoadmapReadings   settlement.ts maybeMaintainLife and runLifeCron (lane G, after the
 *                           judge), the degrade cron (lane G, after it degrades); never fails its caller
 *   recordCardsForReview    submitReview's after() (lane L): a no-op unless a level crossed in scope
 *   recordPracticeForTemplate  every completion and undo's after() (lane G): a no-op outside the scope map
 *   readingOpsFor           goals-server prepareRoadmapGoalClose and closeGoalCore (lane L)
 *   writeReadings · readingUpsertOp   R4's acceptCore, undoAcceptCore and finishStartCore
 *   loadRoadmapGoalSeries   the board loader (lanes T and G) and goals-server (lane L): one read wave
 * Added by R1 (compatible):
 *   RoadmapReadingsClient · ReadingsDeps · RoadmapContext · CtxMilestone · ContextQuery
 *   loadRoadmapContext · planRoadmapWrite · RoadmapWritePlan · applyRoadmapWrite · reachOpOf
 *   RoadmapScopeMap · loadScopeMap · scopeMapOf · crossesLevel · seriesMilestoneOf
 *   proficiencyReadingFor (R4's plan decisions) · loadProficiencyPair (R4's views)
 *   goalSeriesEntryOf · GoalSeriesFacts · upsertDecision (the rule the SQL encodes) · stableJson
 *   resetReadingsThrottle (checks) · PlanOptions
 * Fix round (roadmap-contracts.md §9.4):
 *   - One due day: CtxMilestone.goal.dueDay (the goal's TaskTemplate.dueDay) and milestoneDueDayOf
 *     everywhere a due day is read (the window, the as-of reads, g, the reach, the close's point).
 *   - Positions by lineage: CtxMilestone.createdAt; isSupersededMilestone / supersededIdsOf. A
 *     superseded row ("replaced by Start again") is never measured, its close is refused for good,
 *     and its goal's series is empty with SUPERSEDED_NOTE.
 *   - readingOpsFor refuses (`final: true`) only the deterministic cases and rethrows the rest.
 *   - The goal series' zero reason is read back with statedReadBackOf, LINEAGE_PAID with its day;
 *     a reset is detected with reset-scopes isResetArchiveReason.
 * Fix round 2: GoalSeriesFacts.today; loadRoadmapGoalSeries passes its day, so LINEAGE_PAID's day
 *   carries its year when it is not this year's, as the roadmap page words it.
 *
 * Shape of a run: one context load (two read waves: the roadmap with its
 * milestones, items, measures and acceptance; then the latest readings, the
 * card histogram, Domain names, templates, the goals (with their due days),
 * steps, instances and held days in one Promise.all; a third only for a goal
 * rescheduled to a day that is past too), a pure plan, and one array
 * transaction of upserts and guarded reach updates.
 */
import { Prisma, type PrismaClient, type RoadmapItem, type RoadmapMeasure, type RoadmapMilestone } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import { GOAL_MINT_PREFIX, goalMintKey, lifeWritesEnabled } from "./life-economy";
import { heldDaysOf, type RestRow } from "./duty-rule";
import { isMissingRestDayTable } from "./rest-rules";
import { RESET_ARCHIVE_NOTE, isResetArchiveReason } from "./reset-scopes";
import { goalAsOf, type GoalStep, type RoadmapGoalEntry, type RoadmapSeriesPoint } from "./goals";
import type { InstanceLike } from "./habit";
import {
  cardsAtLevelFromHistogram,
  cardsReadingRow,
  lastReadingOn,
  measureLabelOf,
  milestoneGOn,
  milestoneGoalSeries,
  practiceKeptValue,
  practiceReadingRow,
  reachActionOf,
  statedReadBackOf,
  zeroReasonOf,
  zeroReasonWordsOf,
  type LevelHistogram,
  type MilestoneG,
  type ReachAction,
  type SeriesMilestone,
} from "./roadmap-measures";
import { basisWithout, parseProficiencyDetail, proficiencyBasisOf, proficiencyReadingOf } from "./roadmap-proficiency";
import {
  PROFICIENCY_VERSION,
  READINGS_THROTTLE_MS,
  ROADMAP_NOT_YET,
  SELF_KEY_PREFIX,
  isMissingRoadmapTable,
  isSupersededRow,
  milestoneDueDayOf,
  parseMeasureKey,
  proficiencyKey,
  provenanceOf,
  type Decision,
  type EndStateTerm,
  type ItemDraft,
  type ItemKind,
  type MeasureScope,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneStatus,
  type Origin,
  type PositionRow,
  type PracticeBand,
  type PracticeMethod,
  type ProficiencyBasis,
  type ProficiencyRebaseCause,
  type Reading,
  type ReadingSource,
  type ReadingsRun,
  type RoadmapStatus,
  type RoadmapWriteOpts,
  type StartSnapshot,
} from "./roadmap-types";

/** Where a full run comes from: the chain is throttled (READINGS_THROTTLE_MS), the crons always run. */
export type ReadingsCaller = "CHAIN" | "LIFE_CRON" | "DEGRADE_CRON";

/** The Prisma surface the readings use: the real client, or a check's stub. */
export type RoadmapReadingsClient = Pick<
  PrismaClient,
  "roadmap" | "roadmapMilestone" | "roadmapReading" | "idea" | "domain" | "taskTemplate" | "taskInstance" | "restDay" | "activityEvent" | "$transaction" | "$executeRaw" | "$queryRaw"
>;

/** What the writers take besides the gate's env: an injected client, context loader, scope map and clock (the checks inject all four). */
export interface ReadingsDeps extends RoadmapWriteOpts {
  client?: RoadmapReadingsClient;
  loadContext?: (q: ContextQuery, today: DayKey) => Promise<RoadmapContext | null>;
  loadScopeMap?: (userId: string) => Promise<RoadmapScopeMap | null>;
  /** The time a row is written; readingUpsertOp refuses a row whose day is not today by it. */
  clock?: () => Date;
}

const clientOf = (d: ReadingsDeps): RoadmapReadingsClient => d.client ?? prisma;

// ═══ The upsert ═════════════════════════════════════════════════════════════

/** One computed reading to upsert (day = today only). */
export interface ReadingRow {
  measureKey: string;
  day: DayKey;
  value: number;
  detail: unknown;
}

/** JSON with object keys sorted, so two equal details compare equal whatever their key order. */
export function stableJson(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

/**
 * The rule the upsert's ON CONFLICT … WHERE encodes, as a pure function (the
 * checks' in-memory store runs it): with no row for (userId, measureKey, day)
 * insert; else update only when the stored row has the same source, its
 * observedAt is not later (an older computation finishing late never
 * overwrites a newer one), and its value or its detail differs (an unchanged
 * row writes nothing). The detail is compared too: PRACTICE_KEPT's effTarget
 * and PROFICIENCY's basis and rebase live there and can change while the
 * value does not.
 */
export function upsertDecision(
  existing: { source: string; observedAt: Date; value: number; detail: unknown } | null,
  incoming: { source: string; observedAt: Date; value: number; detail: unknown }
): "insert" | "update" | "skip" {
  if (!existing) return "insert";
  if (existing.source !== incoming.source) return "skip";
  if (existing.observedAt.getTime() > incoming.observedAt.getTime()) return "skip";
  if (existing.value === incoming.value && stableJson(existing.detail) === stableJson(incoming.detail)) return "skip";
  return "update";
}

/**
 * The readings upsert as one operation for a caller's array transaction:
 * INSERT … ON CONFLICT ("userId","measureKey","day") DO UPDATE … WHERE the
 * stored row's source matches, its observedAt ≤ this one's and its value or
 * detail differs. Raw INSERTs supply their own id. Throws (before any write)
 * for a SELF key, or for a row whose day is not todayKey(observedAt): a past
 * day is final once the life day turns, and only today is written.
 */
export function readingUpsertOp(userId: string, row: ReadingRow, observedAt: Date, client: Pick<PrismaClient, "$executeRaw"> = prisma): Prisma.PrismaPromise<number> {
  if (row.measureKey.startsWith(SELF_KEY_PREFIX)) throw new Error(`readingUpsertOp: a computed writer never writes a SELF key (${row.measureKey})`);
  const today = todayKey(observedAt);
  if (row.day !== today) throw new Error(`readingUpsertOp: only today (${today}) is written, not ${row.day}`);
  if (!Number.isFinite(row.value)) throw new Error(`readingUpsertOp: not a value: ${row.value}`);
  const id = globalThis.crypto.randomUUID();
  const detail = row.detail === undefined ? null : JSON.stringify(row.detail);
  return client.$executeRaw(Prisma.sql`
    INSERT INTO "RoadmapReading" ("id", "userId", "measureKey", "day", "value", "detail", "source", "observedAt")
    VALUES (${id}, ${userId}, ${row.measureKey}, ${row.day}::date, ${row.value}, ${detail}::jsonb, 'COMPUTED', ${observedAt})
    ON CONFLICT ("userId", "measureKey", "day") DO UPDATE
      SET "value" = EXCLUDED."value", "detail" = EXCLUDED."detail", "observedAt" = EXCLUDED."observedAt"
      WHERE "RoadmapReading"."source" = EXCLUDED."source"
        AND "RoadmapReading"."observedAt" <= EXCLUDED."observedAt"
        AND ("RoadmapReading"."value" IS DISTINCT FROM EXCLUDED."value" OR "RoadmapReading"."detail" IS DISTINCT FROM EXCLUDED."detail")
  `);
}

/** Writes computed readings with readingUpsertOp (gated by lifeWritesEnabled()) in one array transaction; returns the rows written. */
export async function writeReadings(userId: string, rows: readonly ReadingRow[], observedAt: Date, opts: ReadingsDeps = {}): Promise<number> {
  if (!lifeWritesEnabled(opts.env)) return 0;
  const today = todayKey((opts.clock ?? (() => new Date()))());
  const keep = rows.filter((r) => r.day === today && r.day === todayKey(observedAt) && !r.measureKey.startsWith(SELF_KEY_PREFIX));
  if (keep.length === 0) return 0;
  const client = clientOf(opts);
  const results = await client.$transaction(keep.map((r) => readingUpsertOp(userId, r, observedAt, client)));
  invalidate("roadmap");
  return results.reduce((s: number, n: unknown) => s + (typeof n === "number" ? n : 0), 0);
}

// ═══ The context a run reads ════════════════════════════════════════════════

/** A milestone as the writers read it: the contract's MilestoneDraft plus its Start, goal and reach facts. */
export interface CtxMilestone extends MilestoneDraft {
  /** A loaded row always has its id. */
  id: string;
  startedDay: DayKey | null;
  goalId: string | null;
  reachedDay: DayKey | null;
  reachPendingDay: DayKey | null;
  /** RoadmapMilestone.feasibility: a MilestoneFeasibility before Start, a StartSnapshot after. */
  feasibility: unknown;
  /**
   * The goal's state: open = neither closed nor archived. Null before Start
   * finishes. `dueDay` (fix round) is the goal's TaskTemplate.dueDay, which a
   * Reschedule moves: dueOf (milestoneDueDayOf) prefers it to the row's own.
   */
  goal: { open: boolean; archived: boolean; dueDay?: DayKey | null } | null;
  /** The goal's one-off steps (non-recurring, non-goal, non-archived children). */
  steps: GoalStep[];
  /** RoadmapMilestone.createdAt (ISO; fix round): orders a "Start again" copy after the row it replaces (isNewerRow). */
  createdAt?: string | null;
}

/** The one due day of a milestone (roadmap-types milestoneDueDayOf): its goal's once started, else its own. */
export function dueOf(m: Pick<CtxMilestone, "dueDay" | "goal">): DayKey | null {
  return milestoneDueDayOf(m.dueDay, m.goal?.dueDay ?? null);
}

const positionOf = (m: Pick<CtxMilestone, "id" | "lineageId" | "version" | "status" | "rankIndex" | "createdAt">): PositionRow => ({
  id: m.id,
  lineageId: m.lineageId,
  version: m.version,
  status: m.status,
  rankIndex: m.rankIndex,
  createdAt: m.createdAt ?? null,
});

/** The ids of the superseded rows among a roadmap's milestones (roadmap-types isSupersededRow): never measured again. */
export function supersededIdsOf(milestones: readonly Pick<CtxMilestone, "id" | "lineageId" | "version" | "status" | "rankIndex" | "createdAt">[]): Set<string> {
  const rows = milestones.map(positionOf);
  return new Set(rows.filter((r) => isSupersededRow(r, rows)).map((r) => r.id));
}

/** A STARTING or STARTED row replaced by a newer started row of its lineage ("Start again"): "replaced by Start again". */
export function isSupersededMilestone(m: Pick<CtxMilestone, "id" | "lineageId" | "version" | "status" | "rankIndex" | "createdAt">, all: readonly Pick<CtxMilestone, "id" | "lineageId" | "version" | "status" | "rankIndex" | "createdAt">[]): boolean {
  return isSupersededRow(positionOf(m), all.map(positionOf));
}

/** The note and the close's refusal for a superseded row's goal (it pays 0, "not measured"). */
export const SUPERSEDED_NOTE = "replaced by Start again";

/** One instance-bearing template a practice measure reads. */
export interface CtxTemplate {
  rule: string | null;
  startDay: DayKey;
  instances: InstanceLike[];
}

/** Everything one run reads, as plain data (the checks build it as a fixture). */
export interface RoadmapContext {
  roadmap: { id: string; status: RoadmapStatus; version: number; reachedDay: DayKey | null; archiveReason: string | null };
  /** The current acceptance (version = Roadmap.version, not undone). */
  acceptance: { version: number; endState: EndStateTerm[] } | null;
  /** PLANNED, STARTING, STARTED and LATER rows (carried included). */
  milestones: CtxMilestone[];
  /** The latest stored reading of each key the run reads (≤ today), plus the clip-day readings of restarted practices. */
  readings: Reading[];
  /** The latest PROFICIENCY reading (any day ≤ today), or null. */
  previousProficiency: Reading | null;
  histogram: LevelHistogram;
  domainNames: Record<string, string>;
  templates: Record<string, CtxTemplate>;
  /** Held days (rest, sick, vacation, freeze) over the plan's windows. */
  heldDays: DayKey[];
}

/** Which roadmap a context load reads. */
export interface ContextQuery {
  userId: string;
  roadmapId?: string;
  /** The roadmap holding the milestone with this goal. */
  goalId?: string;
  statuses?: RoadmapStatus[];
  /** Domains whose cards the run must read beyond the plan's own (a plan decision's new end state). */
  extraDomainIds?: readonly string[];
}

const LOADED_STATUSES: MilestoneStatus[] = ["PLANNED", "STARTING", "STARTED", "LATER"];

const keyOrNull = (d: Date | null | undefined): DayKey | null => (d ? keyOfDateColumn(d) : null);
const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function scopeOf(v: unknown): MeasureScope {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const scope: MeasureScope = {};
  if (Array.isArray(o.domainIds)) scope.domainIds = asArray(o.domainIds);
  if (Array.isArray(o.itemLineageIds)) scope.itemLineageIds = asArray(o.itemLineageIds);
  if (Array.isArray(o.templateIds)) scope.templateIds = asArray(o.templateIds);
  return scope;
}

function endStateOf(v: unknown): EndStateTerm[] {
  if (!Array.isArray(v)) return [];
  const out: EndStateTerm[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    if (typeof o.measureKey !== "string" || typeof o.target !== "number") continue;
    out.push({
      measureKey: o.measureKey,
      target: o.target,
      baseline: typeof o.baseline === "number" ? o.baseline : 0,
      baselineDay: typeof o.baselineDay === "string" ? o.baselineDay : "",
      label: typeof o.label === "string" ? o.label : "",
    });
  }
  return out;
}

type ItemRow = RoadmapItem;
type MeasureRow = RoadmapMeasure;
type MilestoneRow = RoadmapMilestone & { items: RoadmapItem[]; measures: RoadmapMeasure[] };

function itemOf(r: ItemRow): ItemDraft {
  return {
    id: r.id,
    lineageId: r.lineageId,
    kind: r.kind as ItemKind,
    ord: r.ord,
    label: r.label,
    rawLabel: r.rawLabel,
    origin: r.origin as Origin,
    decision: r.decision as Decision,
    domainId: r.domainId,
    proposedName: r.proposedName,
    syllabusRef: r.syllabusRef,
    method: r.method as PracticeMethod | null,
    sessionsPerWeek: r.sessionsPerWeek,
    durationBand: r.durationBand as PracticeBand | null,
    rule: r.rule,
    planSource: r.planSource as ItemDraft["planSource"],
    checkpointKind: r.checkpointKind as ItemDraft["checkpointKind"],
    outOf: r.outOf,
    bar: r.bar,
    addToToday: r.addToToday,
    templateId: r.templateId,
    flags: r.flags as ItemDraft["flags"],
    notes: r.notes as ItemDraft["notes"],
  };
}

function measureOf(r: MeasureRow): MeasureSpec {
  return {
    id: r.id,
    kind: r.kind as MeasureSpec["kind"],
    role: r.role as MeasureSpec["role"],
    scope: scopeOf(r.scope),
    minLevel: r.minLevel,
    target: r.target,
    targetSource: r.targetSource as MeasureSpec["targetSource"],
    fittedTarget: r.fittedTarget,
    rateSource: r.rateSource as MeasureSpec["rateSource"],
    baseline: r.baseline,
    baselineDay: keyOrNull(r.baselineDay),
    unit: r.unit,
    itemLineageId: r.itemLineageId,
    measureKey: r.measureKey,
  };
}

function milestoneOf(r: MilestoneRow): CtxMilestone {
  return {
    id: r.id,
    lineageId: r.lineageId,
    version: r.version,
    ord: r.ord,
    title: r.title,
    titleOrigin: r.titleOrigin as Origin,
    titleDecision: r.titleDecision as Decision,
    windowStart: keyOrNull(r.windowStart),
    dueDay: keyOrNull(r.dueDay),
    status: r.status as MilestoneStatus,
    rankIndex: r.rankIndex,
    overAccepted: r.overAccepted,
    items: r.items.map(itemOf),
    measures: r.measures.map(measureOf),
    notes: [],
    startedDay: keyOrNull(r.startedDay),
    goalId: r.goalId,
    reachedDay: keyOrNull(r.reachedDay),
    reachPendingDay: keyOrNull(r.reachPendingDay),
    feasibility: r.feasibility,
    goal: null,
    steps: [],
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
  };
}

/** Measured by the writers: STARTING, or STARTED with an open goal, and never a superseded row (`superseded` from supersededIdsOf). */
const isOpenMilestone = (m: CtxMilestone, superseded: ReadonlySet<string>): boolean =>
  !superseded.has(m.id) && (m.status === "STARTING" || (m.status === "STARTED" && m.goal?.open === true));

/** The PAYS measures a run computes (CHECKPOINT is context; a measure with no key is not read). */
const payingKeyed = (m: CtxMilestone): MeasureSpec[] => m.measures.filter((x) => x.role === "PAYS" && x.kind !== "CHECKPOINT" && x.measureKey);

/** A practice measure's templates: its scope's, else its key's. */
function templateIdsOf(measure: MeasureSpec): string[] {
  if (measure.scope.templateIds && measure.scope.templateIds.length > 0) return measure.scope.templateIds;
  const p = measure.measureKey ? parseMeasureKey(measure.measureKey) : null;
  return p?.kind === "PRACTICE_KEPT" ? p.templateIds : [];
}

/** Each practice lineage's PRACTICE_KEPT keys, by their start, with the day before the next start (no day counted twice). */
function practiceWindows(milestones: readonly CtxMilestone[]): { key: string; lineages: string[]; measure: MeasureSpec; milestone: CtxMilestone; until: DayKey | null }[] {
  const out: { key: string; lineages: string[]; measure: MeasureSpec; milestone: CtxMilestone; until: DayKey | null; from: DayKey }[] = [];
  const seen = new Set<string>();
  for (const m of milestones) {
    for (const meas of m.measures) {
      if (meas.kind !== "PRACTICE_KEPT" || meas.role !== "PAYS" || !meas.measureKey || seen.has(meas.measureKey)) continue;
      const p = parseMeasureKey(meas.measureKey);
      if (p?.kind !== "PRACTICE_KEPT") continue;
      seen.add(meas.measureKey);
      const lineages = meas.scope.itemLineageIds && meas.scope.itemLineageIds.length > 0 ? meas.scope.itemLineageIds : meas.itemLineageId ? [meas.itemLineageId] : [];
      out.push({ key: meas.measureKey, lineages, measure: meas, milestone: m, until: null, from: p.from });
    }
  }
  for (const w of out) {
    let next: DayKey | null = null;
    for (const o of out) if (o !== w && o.from > w.from && o.lineages.some((l) => w.lineages.includes(l)) && (next == null || o.from < next)) next = o.from;
    w.until = next ? addDays(next, -1) : null;
  }
  return out;
}

/**
 * The real context loader: two read waves. Wave 1, the roadmap (by user and
 * status, id, or a goal it holds) with its PLANNED, STARTING, STARTED and
 * LATER milestones, their items and measures, and the current acceptance.
 * Wave 2, in one Promise.all: the latest reading of each key (DISTINCT ON),
 * the clip-day readings of restarted practices and the due-day readings of
 * past-due open milestones (g is read as of the due day), the card histogram (Idea
 * groupBy domainId, level), the Domain names, the goal and practice
 * templates, the goals' steps, the practice instances, and the held days
 * (RestDay through heldDaysOf, plus FREEZE_USE days). Null with no roadmap.
 *
 * One due day (fix round): the goals read selects TaskTemplate.dueDay, so
 * every due day below is dueOf(m) (milestoneDueDayOf: the goal's, which a
 * Reschedule moves, else the row's). The held days are read from the plan's
 * start with no upper bound and kept up to the latest such day. A past-due
 * open milestone whose goal's due day differs from its row's needs the
 * as-of reads of that day: a third read, only in that rare case.
 */
export async function loadRoadmapContext(client: RoadmapReadingsClient, q: ContextQuery, today: DayKey): Promise<RoadmapContext | null> {
  const where: Prisma.RoadmapWhereInput = { userId: q.userId };
  if (q.roadmapId) where.id = q.roadmapId;
  if (q.goalId) where.milestones = { some: { goalId: q.goalId } };
  if (q.statuses) where.status = { in: q.statuses };
  const row = await client.roadmap.findFirst({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      version: true,
      reachedDay: true,
      archiveReason: true,
      milestones: { where: { status: { in: LOADED_STATUSES } }, orderBy: { ord: "asc" }, include: { items: true, measures: true } },
      acceptances: { where: { undoneAt: null }, orderBy: { version: "desc" }, take: 1, select: { version: true, endState: true } },
    },
  });
  if (!row) return null;
  const milestones = row.milestones
    .map(milestoneOf)
    .filter((m) => m.status === "STARTING" || m.status === "STARTED" || m.version <= row.version);
  const acceptance = row.acceptances[0] ? { version: row.acceptances[0].version, endState: endStateOf(row.acceptances[0].endState) } : null;

  const keys = new Set<string>([proficiencyKey(row.id)]);
  const domainIds = new Set<string>();
  const practiceTemplateIds = new Set<string>();
  const goalIds: string[] = [];
  let from: DayKey | null = null;
  let to: DayKey | null = null;
  for (const m of milestones) {
    if (m.goalId) goalIds.push(m.goalId);
    if (m.windowStart && (from == null || m.windowStart < from)) from = m.windowStart;
    if (m.startedDay && (from == null || m.startedDay < from)) from = m.startedDay;
    if (m.dueDay && (to == null || m.dueDay > to)) to = m.dueDay;
    for (const meas of m.measures) {
      if (!meas.measureKey || meas.role !== "PAYS") continue;
      keys.add(meas.measureKey);
      const p = parseMeasureKey(meas.measureKey);
      if (p?.kind === "CARDS_AT_LEVEL") p.domainIds.forEach((d) => domainIds.add(d));
      if (meas.kind === "PRACTICE_KEPT") templateIdsOf(meas).forEach((t) => practiceTemplateIds.add(t));
    }
    for (const it of m.items) if (it.kind === "PRACTICE" && it.templateId) practiceTemplateIds.add(it.templateId);
  }
  for (const d of q.extraDomainIds ?? []) domainIds.add(d);
  for (const t of acceptance?.endState ?? []) {
    keys.add(t.measureKey);
    const p = parseMeasureKey(t.measureKey);
    if (p?.kind === "CARDS_AT_LEVEL") p.domainIds.forEach((d) => domainIds.add(d));
  }
  const windows = practiceWindows(milestones).filter((w) => w.until != null);
  // A past-due open milestone's g is read as of its due day: each PAYS key's last reading on or before that day.
  // The row's own due day here (the goal's is read below); a goal rescheduled to another day that is also past gets a third read.
  const asOfReads: { key: string; until: DayKey }[] = [];
  for (const m of milestones) {
    if (m.status !== "STARTED" || !m.dueDay || m.dueDay >= today) continue;
    for (const meas of m.measures) if (meas.role === "PAYS" && meas.measureKey && meas.kind !== "CHECKPOINT") asOfReads.push({ key: meas.measureKey, until: m.dueDay });
  }
  const clipReads = [...windows.map((w) => ({ key: w.key, until: w.until! })), ...asOfReads];
  const heldFrom = from ?? today;
  const ids = Array.from(domainIds);
  const tplIds = Array.from(practiceTemplateIds);
  const readingSelect = { measureKey: true, day: true, value: true, detail: true, source: true, observedAt: true } as const;

  const [latest, clips, groups, domains, goals, steps, instances, rest, freezes] = await Promise.all([
    client.$queryRaw<{ measureKey: string; day: Date; value: number; detail: unknown; source: string; observedAt: Date }[]>(Prisma.sql`
      SELECT DISTINCT ON ("measureKey") "measureKey", "day", "value", "detail", "source", "observedAt"
      FROM "RoadmapReading"
      WHERE "userId" = ${q.userId} AND "measureKey" IN (${Prisma.join(Array.from(keys))}) AND "day" <= ${today}::date
      ORDER BY "measureKey", "day" DESC, "observedAt" DESC
    `),
    Promise.all(
      clipReads.map((w) =>
        client.roadmapReading.findFirst({
          where: { userId: q.userId, measureKey: w.key, day: { lte: dateColumn(w.until) } },
          orderBy: [{ day: "desc" }, { observedAt: "desc" }],
          select: readingSelect,
        })
      )
    ),
    ids.length > 0
      ? client.idea.groupBy({ by: ["domainId", "level"], where: { domainId: { in: ids }, isArchived: false }, _count: { _all: true } })
      : Promise.resolve([] as { domainId: string; level: number; _count: { _all: number } }[]),
    ids.length > 0 ? client.domain.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : Promise.resolve([]),
    goalIds.length > 0
      ? client.taskTemplate.findMany({ where: { userId: q.userId, id: { in: goalIds } }, select: { id: true, closedScore: true, archivedAt: true, dueDay: true } })
      : Promise.resolve([] as { id: string; closedScore: number | null; archivedAt: Date | null; dueDay: Date | null }[]),
    goalIds.length > 0
      ? client.taskTemplate.findMany({
          where: { userId: q.userId, parentId: { in: goalIds }, recurrence: null, kind: { not: "GOAL" }, archivedAt: null },
          select: { parentId: true, completedAt: true },
        })
      : Promise.resolve([]),
    tplIds.length > 0
      ? Promise.all([
          client.taskTemplate.findMany({ where: { userId: q.userId, id: { in: tplIds } }, select: { id: true, recurrence: true, startDay: true } }),
          client.taskInstance.findMany({ where: { userId: q.userId, templateId: { in: tplIds }, day: { gte: dateColumn(heldFrom) } }, select: { templateId: true, day: true, status: true, repaired: true } }),
        ])
      : Promise.resolve([[], []] as const),
    // No upper bound: a Reschedule can move a goal's due day past every row's own (declared rest and vacation days ahead count).
    client.restDay
      .findMany({ where: { userId: q.userId, day: { gte: dateColumn(heldFrom) } }, select: { day: true, kind: true, declaredAt: true, cancelledAt: true } })
      .catch((err: unknown) => {
        if (!isMissingRestDayTable(err)) throw err;
        return [];
      }),
    client.activityEvent.findMany({ where: { userId: q.userId, source: "FREEZE_USE", day: { gte: dateColumn(heldFrom) } }, select: { day: true } }),
  ]);

  const toReading = (r: { measureKey: string; day: Date; value: number; detail: unknown; source: string; observedAt: Date }): Reading => ({
    measureKey: r.measureKey,
    day: keyOfDateColumn(r.day),
    value: r.value,
    detail: r.detail ?? null,
    source: r.source as ReadingSource,
    observedAt: r.observedAt.toISOString(),
  });
  const readings = [...latest.map(toReading), ...clips.filter((c): c is NonNullable<typeof c> => c != null).map(toReading)];
  const pk = proficiencyKey(row.id);

  const histogram: Record<string, Record<number, number>> = {};
  for (const g of groups) (histogram[g.domainId] ??= {})[g.level] = g._count._all;

  const goalState = new Map(goals.map((g) => [g.id, { open: g.closedScore == null && g.archivedAt == null, archived: g.archivedAt != null, dueDay: keyOrNull(g.dueDay) }] as const));
  const stepsBy = new Map<string, GoalStep[]>();
  for (const s of steps) if (s.parentId) (stepsBy.get(s.parentId) ?? stepsBy.set(s.parentId, []).get(s.parentId)!).push({ completedDay: s.completedAt ? dayKeyOf(s.completedAt) : null });
  for (const m of milestones) {
    if (!m.goalId) continue;
    m.goal = goalState.get(m.goalId) ?? null;
    m.steps = stepsBy.get(m.goalId) ?? [];
  }

  // The as-of reads of a goal rescheduled to a day that is past too (wave 3; only then).
  const lateReads: { key: string; until: DayKey }[] = [];
  for (const m of milestones) {
    const due = dueOf(m);
    if (m.status !== "STARTED" || m.goal?.open !== true || !due || due >= today || due === m.dueDay) continue;
    for (const meas of payingKeyed(m)) lateReads.push({ key: meas.measureKey!, until: due });
  }
  if (lateReads.length > 0) {
    const late = await Promise.all(
      lateReads.map((w) => client.roadmapReading.findFirst({ where: { userId: q.userId, measureKey: w.key, day: { lte: dateColumn(w.until) } }, orderBy: [{ day: "desc" }, { observedAt: "desc" }], select: readingSelect }))
    );
    for (const r of late) if (r) readings.push(toReading(r));
  }

  const [tplRows, instRows] = instances;
  const templates: Record<string, CtxTemplate> = {};
  for (const t of tplRows) templates[t.id] = { rule: t.recurrence, startDay: keyOfDateColumn(t.startDay), instances: [] };
  for (const i of instRows) templates[i.templateId]?.instances.push({ day: keyOfDateColumn(i.day), status: i.status, repaired: i.repaired });

  // Held days over the plan: from its first start to its latest due day, the goals' own (a Reschedule) included.
  let heldTo = to ?? today;
  for (const m of milestones) {
    const due = dueOf(m);
    if (due && due > heldTo) heldTo = due;
  }
  const restRows: RestRow[] = rest.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
  const held = heldDaysOf(restRows, heldFrom, heldTo);
  for (const f of freezes) {
    const day = keyOfDateColumn(f.day);
    if (day >= heldFrom && day <= heldTo) held.add(day);
  }

  return {
    roadmap: { id: row.id, status: row.status as RoadmapStatus, version: row.version, reachedDay: keyOrNull(row.reachedDay), archiveReason: row.archiveReason },
    acceptance,
    milestones,
    readings,
    previousProficiency: readings.find((r) => r.measureKey === pk) ?? null,
    histogram,
    domainNames: Object.fromEntries(domains.map((d) => [d.id, d.name])),
    templates,
    heldDays: Array.from(held).sort(),
  };
}

// ═══ The plan (pure) ════════════════════════════════════════════════════════

/** A milestone's measures and their "slowest: …" words (a practice is named only when its name is YOURS or the app's own). */
export function seriesMilestoneOf(m: Pick<MilestoneDraft, "measures" | "items"> & { id: string }): SeriesMilestone {
  const labels: Record<string, string> = {};
  for (const meas of m.measures) {
    if (!meas.measureKey) continue;
    let label = measureLabelOf(meas);
    if (meas.kind === "PRACTICE_KEPT") {
      const lineages = meas.scope.itemLineageIds ?? (meas.itemLineageId ? [meas.itemLineageId] : []);
      const items = m.items.filter((i) => i.kind === "PRACTICE" && lineages.includes(i.lineageId));
      const c = items.length === 1 ? provenanceOf(items[0].origin, items[0].decision) : null;
      if (c === "YOURS" || c === "WORKED_OUT") label = `${items[0].label.replace(/\s+/g, " ").trim()} sessions`;
    }
    labels[meas.measureKey] = label;
  }
  return { id: m.id, measures: m.measures, labels };
}

/** A milestone's own reach facts: whether any part rests on ticks (a practice measure, or steps). */
const restsOnTicks = (m: CtxMilestone): boolean => m.measures.some((x) => x.role === "PAYS" && x.kind === "PRACTICE_KEPT") || m.steps.length > 0;

/** What one run will write. */
export interface RoadmapWritePlan {
  today: DayKey;
  /** Every row computed now (milestone measures, end state, PROFICIENCY), day = today. */
  rows: ReadingRow[];
  /** The rows that differ from today's stored row (the rest write nothing). */
  changed: ReadingRow[];
  /** Reach transitions to apply, each with the pending day the guard reads. */
  reaches: { milestoneId: string; action: ReachAction; knownPending: DayKey | null }[];
  /** Roadmap.reachedDay to set (where null). */
  aimReachedDay: DayKey | null;
  proficiency: ReadingRow | null;
  /** Each STARTED milestone's g as of goalAsOf(today, dueOf(m)), on stored readings overlaid with this run's rows. */
  g: Record<string, MilestoneG>;
}

/** The plan options: a close (confirm or clear at once), a plan decision's Proficiency basis and cause. */
export interface PlanOptions {
  closingMilestoneId?: string | null;
  /** false: a reach this plan would apply does not count in PROFICIENCY yet (a plan decision's row, written before any reach lands). Default true. */
  countNewReaches?: boolean;
  basis?: ProficiencyBasis | null;
  decision?: { cause: ProficiencyRebaseCause; names?: Readonly<Record<string, string>> } | null;
}

/**
 * The pure core of every writer: the rows to write, the reach transitions and
 * the PROFICIENCY row, from a context and the run's start time.
 *   1. Each PAYS measure of STARTING milestones and of STARTED ones with an open
 *      goal, never a superseded row (supersededIdsOf: "replaced by Start
 *      again"): CARDS_AT_LEVEL from the card histogram (levels 13–20 count),
 *      PRACTICE_KEPT from the templates' instances and the held days over
 *      [start, dueOf(m)]; plus the current acceptance's end-state card measures.
 *   2. The reach rules on each such STARTED milestone, g as of
 *      goalAsOf(today, dueOf(m)) (one due day: the goal's once started) on the
 *      stored readings overlaid with step 1.
 *   3. Roadmap.reachedDay, once the final scheduled milestone's reach is
 *      confirmed and every end-state measure holds its target today.
 *   4. The PROFICIENCY row (ACTIVE only): the basis carried from the previous
 *      reading of the same version (a plan decision passes its own), less any
 *      practice switched off at Start; reaches applied in step 2 count.
 */
export function planRoadmapWrite(ctx: RoadmapContext, now: Date, opts: PlanOptions = {}): RoadmapWritePlan {
  const today = todayKey(now);
  const observedAt = now.toISOString();
  const rows = new Map<string, ReadingRow>();
  const superseded = supersededIdsOf(ctx.milestones);

  for (const m of ctx.milestones) {
    if (!isOpenMilestone(m, superseded)) continue;
    for (const meas of payingKeyed(m)) {
      const key = meas.measureKey!;
      const p = parseMeasureKey(key);
      if (p?.kind === "CARDS_AT_LEVEL") rows.set(key, cardsReadingRow(key, today, cardsAtLevelFromHistogram(ctx.histogram, p.domainIds, p.level)));
      else if (p?.kind === "PRACTICE_KEPT") {
        const tpls = templateIdsOf(meas).map((id) => ({ templateId: id, ...(ctx.templates[id] ?? { rule: null, startDay: p.from, instances: [] }) }));
        const value = practiceKeptValue(tpls, { startedDay: p.from, dueDay: dueOf(m) ?? p.from, asOf: today }, ctx.heldDays);
        const lineages = meas.scope.itemLineageIds && meas.scope.itemLineageIds.length > 0 ? meas.scope.itemLineageIds : meas.itemLineageId ? [meas.itemLineageId] : [];
        const lineageTemplates = Object.fromEntries(lineages.map((l) => [l, m.items.find((i) => i.lineageId === l && i.kind === "PRACTICE")?.templateId ?? null] as const));
        rows.set(key, practiceReadingRow(key, today, value, lineages.length > 0 ? lineageTemplates : undefined));
      }
    }
  }
  const endState = ctx.roadmap.status === "ACTIVE" ? (ctx.acceptance?.endState ?? []) : [];
  for (const t of endState) {
    const p = parseMeasureKey(t.measureKey);
    if (p?.kind === "CARDS_AT_LEVEL" && !rows.has(t.measureKey)) rows.set(t.measureKey, cardsReadingRow(t.measureKey, today, cardsAtLevelFromHistogram(ctx.histogram, p.domainIds, p.level)));
  }

  const computed: Reading[] = Array.from(rows.values()).map((r) => ({ ...r, source: "COMPUTED", observedAt }));
  const overlaid = [...ctx.readings.filter((r) => !(r.day === today && rows.has(r.measureKey))), ...computed];

  const reaches: RoadmapWritePlan["reaches"] = [];
  const reachedNow = new Map<string, DayKey | null>();
  const gBy: Record<string, MilestoneG> = {};
  for (const m of ctx.milestones) {
    reachedNow.set(m.id, m.reachedDay);
    if (m.status !== "STARTED" || m.goal?.open !== true || superseded.has(m.id)) continue;
    const g = milestoneGOn(seriesMilestoneOf(m), overlaid, m.steps, goalAsOf(today, dueOf(m)));
    gBy[m.id] = g;
    const action = reachActionOf({ g: g.g, today, selfReported: restsOnTicks(m), reachedDay: m.reachedDay, reachPendingDay: m.reachPendingDay, closing: m.id === opts.closingMilestoneId });
    if (action.kind === "none") continue;
    reaches.push({ milestoneId: m.id, action, knownPending: m.reachPendingDay });
    if ((action.kind === "reach" || action.kind === "confirm") && opts.countNewReaches !== false) reachedNow.set(m.id, action.day);
  }

  let aimReachedDay: DayKey | null = null;
  if (ctx.roadmap.status === "ACTIVE" && ctx.roadmap.reachedDay == null) {
    // The final scheduled lineage (a dropped row and its "Start again" copy share it): reached when any of its rows is.
    const scheduled = ctx.milestones.filter((m) => m.status !== "LATER");
    const maxOrd = scheduled.reduce((best, m) => Math.max(best, m.ord), -Infinity);
    const finalLineages = new Set(scheduled.filter((m) => m.ord === maxOrd).map((m) => m.lineageId));
    const finalReached = scheduled.some((m) => finalLineages.has(m.lineageId) && reachedNow.get(m.id) != null);
    const valueOf = (key: string) => lastReadingOn(overlaid, key, today)?.value ?? null;
    if (finalReached && endState.every((t) => (valueOf(t.measureKey) ?? -Infinity) >= t.target)) aimReachedDay = today;
  }

  let proficiency: ReadingRow | null = null;
  if (ctx.roadmap.status === "ACTIVE" && ctx.acceptance) {
    const prev = ctx.previousProficiency ? parseProficiencyDetail(ctx.previousProficiency.detail) : null;
    const versionRows = ctx.milestones.filter((m) => m.status === "STARTING" || m.status === "STARTED" || m.version === ctx.roadmap.version);
    let basis =
      opts.basis ??
      (prev && prev.v === PROFICIENCY_VERSION && prev.basisVersion === ctx.roadmap.version
        ? prev.basis
        : proficiencyBasisOf({ basisVersion: ctx.roadmap.version, endState: ctx.acceptance.endState, feasibility: null, milestones: versionRows, switchedOff: [], heldDays: ctx.heldDays }));
    const switchedOff = ctx.milestones
      .filter((m) => m.status === "STARTING" || m.status === "STARTED")
      .flatMap((m) => m.items.filter((i) => i.kind === "PRACTICE" && i.addToToday === false).map((i) => i.lineageId));
    basis = basisWithout(basis, switchedOff);

    const kept: Record<string, number> = {};
    for (const w of practiceWindows(ctx.milestones)) {
      const r = lastReadingOn(overlaid, w.key, w.until ?? today);
      if (!r) continue;
      if (w.lineages.length === 1) kept[w.lineages[0]] = (kept[w.lineages[0]] ?? 0) + r.value;
      else {
        const d = r.detail && typeof r.detail === "object" ? (r.detail as { byTemplate?: Record<string, number>; byLineage?: Record<string, number> }) : {};
        for (const l of w.lineages) {
          const tpl = w.milestone.items.find((i) => i.lineageId === l)?.templateId;
          const v = typeof d.byLineage?.[l] === "number" ? d.byLineage[l] : tpl && typeof d.byTemplate?.[tpl] === "number" ? d.byTemplate[tpl] : null;
          if (v != null) kept[l] = (kept[l] ?? 0) + v;
        }
      }
    }
    const reachedLineages = new Set<string>();
    let onTicks = false;
    for (const m of ctx.milestones) {
      if (!reachedNow.get(m.id)) continue;
      reachedLineages.add(m.lineageId);
      if (restsOnTicks(m)) onTicks = true;
    }
    proficiency = proficiencyReadingOf({
      roadmapId: ctx.roadmap.id,
      today,
      basis,
      histogram: ctx.histogram,
      domainNames: ctx.domainNames,
      kept,
      reached: reachedLineages.size,
      reachedOnTicks: onTicks,
      previous: ctx.previousProficiency,
      decision: opts.decision ?? null,
    });
    rows.set(proficiency.measureKey, proficiency);
  }

  const all = Array.from(rows.values());
  const stored = new Map(ctx.readings.filter((r) => r.day === today).map((r) => [r.measureKey, r] as const));
  const changed = all.filter((r) => {
    const s = stored.get(r.measureKey);
    return !s || s.source !== "COMPUTED" || s.value !== r.value || stableJson(s.detail) !== stableJson(r.detail);
  });
  return { today, rows: all, changed, reaches, aimReachedDay, proficiency, g: gBy };
}

// ═══ Applying a plan ════════════════════════════════════════════════════════

/**
 * One reach transition as a guarded updateMany (F10): reachedDay is set once,
 * where null, and never cleared; reachPendingDay is set only where both are
 * null and cleared only while reachedDay is null. A confirm of a known
 * pending day also requires that pending day to still stand, so a reach a
 * concurrent undo cleared is never confirmed.
 */
export function reachOpOf(client: Pick<PrismaClient, "roadmapMilestone">, milestoneId: string, action: ReachAction, knownPending: DayKey | null): Prisma.PrismaPromise<Prisma.BatchPayload> | null {
  switch (action.kind) {
    case "none":
      return null;
    case "reach":
      return client.roadmapMilestone.updateMany({ where: { id: milestoneId, reachedDay: null }, data: { reachedDay: dateColumn(action.day), reachPendingDay: null } });
    case "pend":
      return client.roadmapMilestone.updateMany({ where: { id: milestoneId, reachedDay: null, reachPendingDay: null }, data: { reachPendingDay: dateColumn(action.day) } });
    case "clear":
      return client.roadmapMilestone.updateMany({ where: { id: milestoneId, reachedDay: null, reachPendingDay: { not: null } }, data: { reachPendingDay: null } });
    case "confirm": {
      const where: Prisma.RoadmapMilestoneWhereInput = { id: milestoneId, reachedDay: null };
      if (knownPending && knownPending === action.day) where.reachPendingDay = dateColumn(knownPending);
      return client.roadmapMilestone.updateMany({ where, data: { reachedDay: dateColumn(action.day), reachPendingDay: null } });
    }
  }
}

/** Every write a plan makes, as ops for one array transaction: the changed upserts, the reach updates, the aim's reachedDay. */
function opsOf(client: RoadmapReadingsClient, userId: string, roadmapId: string, plan: RoadmapWritePlan, observedAt: Date): { upserts: Prisma.PrismaPromise<number>[]; updates: Prisma.PrismaPromise<Prisma.BatchPayload>[] } {
  const upserts = plan.changed.map((r) => readingUpsertOp(userId, r, observedAt, client));
  const updates: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];
  for (const r of plan.reaches) {
    const op = reachOpOf(client, r.milestoneId, r.action, r.knownPending);
    if (op) updates.push(op);
  }
  if (plan.aimReachedDay) updates.push(client.roadmap.updateMany({ where: { id: roadmapId, reachedDay: null }, data: { reachedDay: dateColumn(plan.aimReachedDay) } }));
  return { upserts, updates };
}

/** Applies a plan in one array transaction; returns the rows written and the reach updates that landed. */
export async function applyRoadmapWrite(client: RoadmapReadingsClient, userId: string, roadmapId: string, plan: RoadmapWritePlan, observedAt: Date): Promise<{ written: number; reaches: number }> {
  const { upserts, updates } = opsOf(client, userId, roadmapId, plan, observedAt);
  if (upserts.length === 0 && updates.length === 0) return { written: 0, reaches: 0 };
  const results = (await client.$transaction([...upserts, ...updates])) as unknown[];
  let written = 0;
  let reaches = 0;
  results.forEach((r, i) => {
    if (i < upserts.length) written += typeof r === "number" ? r : 0;
    else reaches += r && typeof r === "object" && typeof (r as { count?: unknown }).count === "number" ? (r as { count: number }).count : 0;
  });
  invalidate("roadmap");
  return { written, reaches };
}

// ═══ The writers ════════════════════════════════════════════════════════════

/** The chain's in-process throttle: the last run per user (the crons are never throttled). */
const lastChainRun = new Map<string, number>();

/** For the checks: forget the chain throttle. */
export function resetReadingsThrottle(): void {
  lastChainRun.clear();
}

const loaderOf = (d: ReadingsDeps) => d.loadContext ?? ((q: ContextQuery, today: DayKey) => loadRoadmapContext(clientOf(d), q, today));
/** A failure in words, never blank (roadmapStepErrorsOf drops a blank error, and a failure must reach the cron's `errors`). */
const errorText = (err: unknown): string => {
  const text = err instanceof Error ? err.message || err.name : String(err);
  return text && text.trim() ? text.trim() : "unknown error";
};

async function runForActive(userId: string, now: Date, d: ReadingsDeps): Promise<ReadingsRun> {
  const today = todayKey(now);
  const ctx = await loaderOf(d)({ userId, statuses: ["ACTIVE"] }, today);
  if (!ctx) return { written: 0, reaches: 0, skipped: "NO_ROADMAP" };
  const plan = planRoadmapWrite(ctx, now);
  const done = await applyRoadmapWrite(clientOf(d), userId, ctx.roadmap.id, plan, now);
  return { ...done, skipped: null };
}

/** A writer's guard: never throws; a missing table reads MISSING_TABLE, anything else is logged and returned. */
async function guarded(what: string, fn: () => Promise<ReadingsRun>): Promise<ReadingsRun> {
  try {
    return await fn();
  } catch (err) {
    if (isMissingRoadmapTable(err)) return { written: 0, reaches: 0, skipped: "MISSING_TABLE" };
    console.error(`roadmap readings (${what}) failed:`, err);
    return { written: 0, reaches: 0, skipped: null, error: errorText(err) };
  }
}

/**
 * The full writer: every PAYS measure of STARTING and STARTED milestones and
 * the current end-state measures, the ACTIVE roadmap's PROFICIENCY reading,
 * and the reach rules (and the aim's reachedDay), from one context load.
 * Gated by lifeWritesEnabled(); throttled from the chain (READINGS_THROTTLE_MS
 * per user, in process); never throws: a failure is logged and returned in
 * `error` (ReadingsRun.error, never blank), which lane G's step appends to
 * the cron's `errors` through roadmap-types roadmapStepErrorsOf. A missing
 * table is `skipped: "MISSING_TABLE"`, not an error.
 */
export async function recordRoadmapReadings(
  userId: string,
  now: Date = new Date(),
  opts: RoadmapWriteOpts & { caller?: ReadingsCaller } & ReadingsDeps = {}
): Promise<ReadingsRun> {
  if (!lifeWritesEnabled(opts.env)) return { written: 0, reaches: 0, skipped: "WRITES_OFF" };
  if ((opts.caller ?? "CHAIN") === "CHAIN") {
    const last = lastChainRun.get(userId);
    if (last != null && now.getTime() - last < READINGS_THROTTLE_MS && now.getTime() >= last) return { written: 0, reaches: 0, skipped: "THROTTLED" };
    lastChainRun.set(userId, now.getTime());
  }
  return guarded("full", () => runForActive(userId, now, opts));
}

/** The scope map the event writers check before any read (cached on 'roadmap'). */
export interface RoadmapScopeMap {
  roadmapId: string;
  /** CARDS_AT_LEVEL measures of STARTING and STARTED milestones, and the end state's. */
  cards: { measureKey: string; domainIds: string[]; level: number }[];
  /** Practice and step templates of STARTING and STARTED milestones. */
  templateIds: string[];
}

/** The scope map of a context-shaped roadmap (pure; the loader and the checks share it). */
export function scopeMapOf(input: {
  roadmapId: string;
  milestones: readonly { status: string; measures: readonly Pick<MeasureSpec, "kind" | "role" | "measureKey" | "scope">[]; items: readonly Pick<ItemDraft, "kind" | "templateId">[] }[];
  endState: readonly EndStateTerm[];
}): RoadmapScopeMap {
  const cards = new Map<string, { measureKey: string; domainIds: string[]; level: number }>();
  const tpls = new Set<string>();
  const addCard = (key: string | null) => {
    const p = key ? parseMeasureKey(key) : null;
    if (p?.kind === "CARDS_AT_LEVEL") cards.set(key!, { measureKey: key!, domainIds: p.domainIds, level: p.level });
  };
  for (const m of input.milestones) {
    if (m.status !== "STARTING" && m.status !== "STARTED") continue;
    for (const meas of m.measures) {
      if (meas.role !== "PAYS") continue;
      if (meas.kind === "CARDS_AT_LEVEL") addCard(meas.measureKey);
      if (meas.kind === "PRACTICE_KEPT") (meas.scope.templateIds ?? []).forEach((t) => tpls.add(t));
    }
    for (const it of m.items) if ((it.kind === "PRACTICE" || it.kind === "STEP") && it.templateId) tpls.add(it.templateId);
  }
  for (const t of input.endState) addCard(t.measureKey);
  return { roadmapId: input.roadmapId, cards: Array.from(cards.values()), templateIds: Array.from(tpls).sort() };
}

/** The real scope map: one query (the ACTIVE roadmap's STARTING and STARTED milestones and the current end state), cached on 'roadmap'. */
export async function loadScopeMap(userId: string, client: RoadmapReadingsClient = prisma): Promise<RoadmapScopeMap | null> {
  return cached(`roadmapScope:${userId}`, ["roadmap"], async () => {
    try {
      const row = await client.roadmap.findFirst({
        where: { userId, status: "ACTIVE" },
        select: {
          id: true,
          milestones: {
            where: { status: { in: ["STARTING", "STARTED"] } },
            select: { status: true, measures: { select: { kind: true, role: true, measureKey: true, scope: true } }, items: { select: { kind: true, templateId: true } } },
          },
          acceptances: { where: { undoneAt: null }, orderBy: { version: "desc" }, take: 1, select: { endState: true } },
        },
      });
      if (!row) return null;
      return scopeMapOf({
        roadmapId: row.id,
        milestones: row.milestones.map((m) => ({
          status: m.status,
          measures: m.measures.map((x) => ({ kind: x.kind as MeasureSpec["kind"], role: x.role as MeasureSpec["role"], measureKey: x.measureKey, scope: scopeOf(x.scope) })),
          items: m.items.map((i) => ({ kind: i.kind as ItemKind, templateId: i.templateId })),
        })),
        endState: endStateOf(row.acceptances[0]?.endState),
      });
    } catch (err) {
      if (isMissingRoadmapTable(err)) return null;
      throw err;
    }
  });
}

/** A review crossed level L: it went from below L to at or above it, or back. */
export function crossesLevel(oldLevel: number, newLevel: number, level: number): boolean {
  return oldLevel < level !== newLevel < level;
}

/**
 * submitReview's event writer: returns at once (no read past the cached scope
 * map) unless the Domain is in the scope of a STARTING, STARTED or end-state
 * CARDS measure whose L lies between the old and new level; then one run
 * (its measures, the reach rules, PROFICIENCY). An evening review on the due
 * day writes the due day's reading (today's life day). Never throws.
 */
export async function recordCardsForReview(
  userId: string,
  ideaId: string,
  domainId: string,
  oldLevel: number,
  newLevel: number,
  opts: RoadmapWriteOpts & { now?: Date } & ReadingsDeps = {}
): Promise<void> {
  void ideaId; // the Domain and the levels decide; the card itself is read by the grouped count.
  if (!lifeWritesEnabled(opts.env) || oldLevel === newLevel) return;
  const now = opts.now ?? new Date();
  await guarded("review", async () => {
    const map = await (opts.loadScopeMap ?? ((u: string) => loadScopeMap(u, clientOf(opts))))(userId);
    if (!map || !map.cards.some((c) => c.domainIds.includes(domainId) && crossesLevel(oldLevel, newLevel, c.level))) return { written: 0, reaches: 0, skipped: null };
    return runForActive(userId, now, opts);
  });
}

/**
 * The completion and undo hook's writer: returns at once unless templateId
 * is a practice or step template of a STARTING or STARTED milestone (the
 * scope map cached on 'roadmap'); then one run (that milestone's
 * PRACTICE_KEPT, steps share, reach rules and PROFICIENCY). An undo clears a
 * pending reach. Never throws.
 */
export async function recordPracticeForTemplate(userId: string, templateId: string, opts: RoadmapWriteOpts & { now?: Date } & ReadingsDeps = {}): Promise<void> {
  if (!lifeWritesEnabled(opts.env)) return;
  const now = opts.now ?? new Date();
  await guarded("practice", async () => {
    const map = await (opts.loadScopeMap ?? ((u: string) => loadScopeMap(u, clientOf(opts))))(userId);
    if (!map || !map.templateIds.includes(templateId)) return { written: 0, reaches: 0, skipped: null };
    return runForActive(userId, now, opts);
  });
}

// ═══ The close (lane L) ═════════════════════════════════════════════════════

/** What a ROADMAP goal's close preview and close need (goals-server, lane L). */
export type ReadingOps =
  | {
      ok: true;
      /** The upserts (today's readings and PROFICIENCY), for the close's array transaction; [] when live. */
      ops: Prisma.PrismaPromise<unknown>[];
      /** The rows computed now (the close pays from exactly these). */
      rows: ReadingRow[];
      /** The point g is read from, before the steps' share. */
      point: RoadmapSeriesPoint | null;
      /** The reach transition a close at this g applies (confirm at g = 1, clear below). */
      reach: ReachAction;
      /** Computed on a writes-off server: shown "not recorded on this server", written nowhere. */
      live: boolean;
      /** R1 addition: the guarded reach update for the transaction (the close's with closing, else the writer's rule); [] when live. */
      reachOps?: Prisma.PrismaPromise<unknown>[];
      /** R1 addition: the milestone's g with the steps' share (what reachOps judged). */
      g?: number | null;
    }
  /**
   * A deterministic refusal (roadmap-contracts.md §9.4.1): the goal is never
   * measured again, so the close empties its series and closes unmeasured
   * (pays 0). Only: no roadmap or milestone holds the goal, an ARCHIVED or
   * DRAFT roadmap, a missing table, or a superseded row ("replaced by Start
   * again"). Anything else (a timeout, a code error) is THROWN, so the close
   * fails "Couldn't close; try again" and writes nothing.
   */
  | { ok: false; reason: string; final: true };

/** The refusal words for a goal no roadmap milestone holds. */
export const NOT_A_MILESTONE = "This goal is not a roadmap milestone";
/** The refusal words while the roadmap tables are not there (before the migration). */
export const MISSING_TABLES = "The roadmap tables are not there yet";

/** The refusal for a goal whose roadmap is archived: a reset's (reset-scopes isResetArchiveReason) reads RESET_ARCHIVE_NOTE. */
function archivedReason(archiveReason: string | null): string {
  return isResetArchiveReason(archiveReason) ? RESET_ARCHIVE_NOTE : "This roadmap is archived: its measures are no longer recorded";
}

const refuse = (reason: string): ReadingOps => ({ ok: false, reason, final: true });

/**
 * Today's readings for one ROADMAP goal's milestone. `closing`
 * (closeGoalCore) applies the close's reach rule (confirm at g = 1, clear
 * below) and counts it in PROFICIENCY; without it (the preview) the writers'
 * rule applies. On a writes-off server the values are computed live and
 * nothing is returned to write. g, the point and the reach are judged as of
 * goalAsOf(today, dueOf(m)): the goal's due day, which a Reschedule moves.
 *
 * Refuses (`final: true`) only the deterministic cases: no roadmap or
 * milestone for the goal, an ARCHIVED or DRAFT roadmap, a missing table, a
 * superseded row. Every other failure is rethrown: a close must fail and
 * write nothing rather than close a milestone at g 0 for good.
 */
export async function readingOpsFor(userId: string, goalId: string, now: Date, opts: RoadmapWriteOpts & ReadingsDeps & { closing?: boolean } = {}): Promise<ReadingOps> {
  try {
    const today = todayKey(now);
    const ctx = await loaderOf(opts)({ userId, goalId }, today);
    if (!ctx) return refuse(NOT_A_MILESTONE);
    if (ctx.roadmap.status === "ARCHIVED") return refuse(archivedReason(ctx.roadmap.archiveReason));
    if (ctx.roadmap.status === "DRAFT") return refuse(ROADMAP_NOT_YET);
    const m = ctx.milestones.find((x) => x.goalId === goalId);
    if (!m) return refuse(NOT_A_MILESTONE);
    if (isSupersededMilestone(m, ctx.milestones)) return refuse(SUPERSEDED_NOTE);
    // Without `closing` (the preview), no reach is applied, so PROFICIENCY counts none this plan would add.
    const plan = planRoadmapWrite(ctx, now, { closingMilestoneId: opts.closing ? m.id : null, countNewReaches: opts.closing === true });
    const asOf = goalAsOf(today, dueOf(m));
    const sm = seriesMilestoneOf(m);
    const overlaid = [...ctx.readings.filter((r) => !(r.day === today && plan.rows.some((x) => x.measureKey === r.measureKey))), ...plan.rows.map((r) => ({ ...r, source: "COMPUTED" as const, observedAt: now.toISOString() }))];
    const bare = milestoneGOn(sm, overlaid, [], asOf);
    const point: RoadmapSeriesPoint | null =
      bare.g != null && bare.binding ? { day: asOf, g: bare.g, observedAt: bare.binding.observedAt ?? now.toISOString(), bindingClass: bare.binding.class, bindingLabel: bare.binding.label } : null;
    const full = plan.g[m.id] ?? milestoneGOn(sm, overlaid, m.steps, asOf);
    const closeReach = reachActionOf({ g: full.g, today, selfReported: restsOnTicks(m), reachedDay: m.reachedDay, reachPendingDay: m.reachPendingDay, closing: true });
    const live = !lifeWritesEnabled(opts.env);
    const client = clientOf(opts);
    const mine = plan.reaches.filter((r) => r.milestoneId === m.id);
    return {
      ok: true,
      ops: live ? [] : plan.changed.map((r) => readingUpsertOp(userId, r, now, client)),
      rows: plan.rows,
      point,
      reach: closeReach,
      live,
      reachOps: live ? [] : mine.map((r) => reachOpOf(client, r.milestoneId, r.action, r.knownPending)).filter((x): x is Prisma.PrismaPromise<Prisma.BatchPayload> => x != null),
      g: full.g,
    };
  } catch (err) {
    if (isMissingRoadmapTable(err)) return refuse(MISSING_TABLES);
    throw err;
  }
}

// ═══ Plan decisions (R4) and views ══════════════════════════════════════════

/**
 * The PROFICIENCY row a plan decision writes inside its own transaction
 * (acceptCore, undoAcceptCore, finishStartCore; F12): the decision's basis
 * (from proficiencyBasisOf over its in-memory plan, or basisWithout for a
 * switch-off) measured on today's cards, practice and reaches, rebased
 * against the previous reading with the decision's cause. R4 passes the row
 * to readingUpsertOp. Null without a roadmap.
 */
export async function proficiencyReadingFor(
  userId: string,
  roadmapId: string,
  now: Date,
  args: { basis: ProficiencyBasis; decision: { cause: ProficiencyRebaseCause; names?: Readonly<Record<string, string>> } },
  opts: ReadingsDeps = {}
): Promise<ReadingRow | null> {
  const today = todayKey(now);
  const ctx = await loaderOf(opts)({ userId, roadmapId, extraDomainIds: args.basis.cards.flatMap((c) => c.domainIds) }, today);
  if (!ctx) return null;
  const acceptance = ctx.acceptance ?? { version: args.basis.basisVersion, endState: [] };
  const plan = planRoadmapWrite({ ...ctx, roadmap: { ...ctx.roadmap, status: "ACTIVE" }, acceptance }, now, { basis: args.basis, decision: args.decision, countNewReaches: false });
  return plan.proficiency;
}

/** The stored PROFICIENCY readings every surface shows: the latest ≤ today, and the last before this life week ("since Sun"). */
export async function loadProficiencyPair(userId: string, roadmapId: string, today: DayKey, client: RoadmapReadingsClient = prisma): Promise<{ current: Reading | null; beforeThisWeek: Reading | null }> {
  const key = proficiencyKey(roadmapId);
  const select = { measureKey: true, day: true, value: true, detail: true, source: true, observedAt: true } as const;
  const [cur, before] = await Promise.all([
    client.roadmapReading.findFirst({ where: { userId, measureKey: key, day: { lte: dateColumn(today) } }, orderBy: [{ day: "desc" }, { observedAt: "desc" }], select }),
    client.roadmapReading.findFirst({ where: { userId, measureKey: key, day: { lt: dateColumn(weekStartKeyOf(today)) } }, orderBy: [{ day: "desc" }, { observedAt: "desc" }], select }),
  ]);
  const toReading = (r: NonNullable<typeof cur>): Reading => ({
    measureKey: r.measureKey,
    day: keyOfDateColumn(r.day),
    value: r.value,
    detail: r.detail ?? null,
    source: r.source as ReadingSource,
    observedAt: r.observedAt.toISOString(),
  });
  return { current: cur ? toReading(cur) : null, beforeThisWeek: before ? toReading(before) : null };
}

// ═══ The goal seam's series ═════════════════════════════════════════════════

/** The facts one goal's entry is built from (the loader reads them; the checks build them). */
export interface GoalSeriesFacts {
  /** `version`, `status` and `createdAt` (fix round) place the row among `roadmap.positions` for isSupersededRow. */
  milestone: Pick<MilestoneDraft, "measures" | "items" | "lineageId" | "ord"> & { id: string; feasibility: unknown; version?: number; status?: string; createdAt?: string | null };
  /**
   * `scheduled`: the PLANNED, STARTING and STARTED rows (ord and of count
   * their lineages). `positions` (fix round): the same rows as position rows;
   * with them, a superseded row's goal gets no series and SUPERSEDED_NOTE.
   */
  roadmap: { status: RoadmapStatus; archiveReason: string | null; scheduled: readonly { lineageId: string; ord: number }[]; positions?: readonly PositionRow[] };
  /** The goal's frozen stated MP (TaskTemplate); null when unknown. */
  stated: number | null;
  readings: readonly Reading[];
  /** The day another goal of the same lineage closed paying (MP_MINT 'mp:GOAL:<id>' > 0); null when none did or it was not read. */
  lineagePaidOn?: DayKey | null;
  /** Today (fix round 2): LINEAGE_PAID's day carries its year when it is not this year's (zeroReasonWordsOf), as the roadmap page words it. */
  today?: DayKey | null;
}

/**
 * One goal's BoardData.roadmapGoals entry: the stored series
 * (milestoneGoalSeries), "Roadmap · milestone 2 of 3" (its place among the
 * scheduled lineages: ord ≥ 1, of ≥ ord), the zero reason in words, and the
 * note.
 *   - A goal whose roadmap is archived gets no points (g null, pays 0, "not
 *     measured") and the note RESET_ARCHIVE_NOTE ("measures removed by a
 *     reset", reset-scopes isResetArchiveReason) or "roadmap archived".
 *   - A superseded row's goal (its "Start again" copy has started) gets no
 *     points and SUPERSEDED_NOTE ("replaced by Start again").
 *   - The zero reason is read back through statedForMilestone with the Start
 *     arithmetic (statedReadBackOf), so it is the Start sheet's own reason;
 *     LINEAGE_PAID carries its day ("this milestone already paid on 3 Mar";
 *     "… on 3 Mar 2025" when `today` is in another year, fix round 2).
 */
export function goalSeriesEntryOf(f: GoalSeriesFacts): RoadmapGoalEntry {
  const byLineage = new Map<string, number>();
  for (const s of f.roadmap.scheduled) {
    const cur = byLineage.get(s.lineageId);
    if (cur == null || s.ord < cur) byLineage.set(s.lineageId, s.ord);
  }
  const ords = Array.from(byLineage.values()).sort((a, b) => a - b);
  const mine = byLineage.get(f.milestone.lineageId) ?? f.milestone.ord;
  const ord = ords.filter((o) => o < mine).length + 1;
  const of = Math.max(ords.length, ord);
  const archived = f.roadmap.status === "ARCHIVED";
  const m = f.milestone;
  const superseded =
    !archived &&
    !!f.roadmap.positions &&
    m.status != null &&
    m.version != null &&
    isSupersededRow({ id: m.id, lineageId: m.lineageId, version: m.version, status: m.status, createdAt: m.createdAt ?? null }, f.roadmap.positions);
  const note = archived ? (isResetArchiveReason(f.roadmap.archiveReason) ? RESET_ARCHIVE_NOTE : "roadmap archived") : superseded ? SUPERSEDED_NOTE : null;
  const series = archived || superseded ? [] : milestoneGoalSeries(seriesMilestoneOf(m), f.readings, []);
  const snap = m.feasibility && typeof m.feasibility === "object" && (m.feasibility as { kind?: unknown }).kind === "START" ? (m.feasibility as StartSnapshot) : null;
  const paidOn = f.lineagePaidOn ?? null;
  const reason = zeroReasonOf({ stated: f.stated, ...statedReadBackOf(m, snap, paidOn) });
  return { series, ord, of, zeroReason: reason ? zeroReasonWordsOf(reason, paidOn, f.today) : null, note };
}

/**
 * The stored series of open ROADMAP goals, keyed by goal id, with ord, of,
 * zeroReason and note (BoardData.roadmapGoals; goals-server attaches the
 * series). One read wave of three queries in one Promise.all: the milestones
 * holding these goals (with their measures, items and roadmap, whose
 * PLANNED, STARTING and STARTED rows carry their positions and goals), their
 * PAYS measures' readings up to today (one SQL join), and the goals' stated
 * MP. A goal whose roadmap a reset archived, or whose row a "Start again"
 * copy superseded, gets no points and the note; a missing table
 * (isMissingRoadmapTable) reads as {}.
 *
 * A second read, only for a goal that states 0 and shares its lineage with
 * another goal (a dropped row's, before "Start again"): those goals' paying
 * closes (MP_MINT 'mp:GOAL:<id>' > 0), which date LINEAGE_PAID's words.
 */
export async function loadRoadmapGoalSeries(userId: string, goalIds: readonly string[], today: DayKey, opts: { client?: RoadmapReadingsClient } = {}): Promise<Record<string, RoadmapGoalEntry>> {
  const ids = Array.from(new Set(goalIds));
  if (ids.length === 0) return {};
  const client = opts.client ?? prisma;
  try {
    const [milestones, readings, stated] = await Promise.all([
      client.roadmapMilestone.findMany({
        where: { goalId: { in: ids }, roadmap: { userId } },
        include: {
          measures: true,
          items: true,
          roadmap: {
            select: {
              status: true,
              archiveReason: true,
              milestones: {
                where: { status: { in: ["PLANNED", "STARTING", "STARTED"] } },
                select: { id: true, lineageId: true, ord: true, status: true, version: true, rankIndex: true, createdAt: true, goalId: true },
              },
            },
          },
        },
      }),
      client.$queryRaw<{ measureKey: string; day: Date; value: number; detail: unknown; source: string; observedAt: Date }[]>(Prisma.sql`
        SELECT r."measureKey", r."day", r."value", r."detail", r."source", r."observedAt"
        FROM "RoadmapReading" r
        WHERE r."userId" = ${userId} AND r."day" <= ${today}::date AND r."measureKey" IN (
          SELECT me."measureKey" FROM "RoadmapMeasure" me
          JOIN "RoadmapMilestone" mi ON mi."id" = me."milestoneId"
          WHERE mi."goalId" IN (${Prisma.join(ids)}) AND me."role" = 'PAYS' AND me."measureKey" IS NOT NULL
        )
        ORDER BY r."day" ASC
      `),
      client.$queryRaw<{ id: string; stated: number | null }[]>(Prisma.sql`
        SELECT "id", "goalMp" AS "stated" FROM "TaskTemplate" WHERE "userId" = ${userId} AND "id" IN (${Prisma.join(ids)})
      `),
    ]);
    const all: Reading[] = readings.map((r) => ({
      measureKey: r.measureKey,
      day: keyOfDateColumn(r.day),
      value: r.value,
      detail: r.detail ?? null,
      source: r.source as ReadingSource,
      observedAt: r.observedAt.toISOString(),
    }));
    const statedBy = new Map(stated.map((s) => [s.id, s.stated] as const));

    // LINEAGE_PAID's day: only a goal that states 0 and shares its lineage with another goal needs it (rare).
    const siblingsOf = new Map<string, string[]>();
    for (const row of milestones) {
      if (!row.goalId) continue;
      const s = statedBy.get(row.goalId);
      if (s == null || s > 0) continue;
      const others = row.roadmap.milestones.filter((x) => x.lineageId === row.lineageId && x.goalId && x.goalId !== row.goalId).map((x) => x.goalId as string);
      if (others.length > 0) siblingsOf.set(row.goalId, others);
    }
    const siblingGoals = Array.from(new Set(Array.from(siblingsOf.values()).flat()));
    const paidDay = new Map<string, DayKey>();
    if (siblingGoals.length > 0) {
      const mints = await client.activityEvent.findMany({
        where: { userId, source: "MP_MINT", dedupeKey: { in: siblingGoals.map(goalMintKey) }, qty: { gt: 0 } },
        select: { dedupeKey: true, day: true },
      });
      for (const r of mints) {
        if (!r.dedupeKey || !r.dedupeKey.startsWith(GOAL_MINT_PREFIX)) continue;
        const goal = r.dedupeKey.slice(GOAL_MINT_PREFIX.length);
        const day = keyOfDateColumn(r.day);
        const cur = paidDay.get(goal);
        if (!cur || day < cur) paidDay.set(goal, day);
      }
    }

    const out: Record<string, RoadmapGoalEntry> = {};
    for (const row of milestones) {
      if (!row.goalId) continue;
      const m = milestoneOf({ ...row, items: row.items, measures: row.measures });
      const keys = new Set(m.measures.map((x) => x.measureKey).filter(Boolean));
      const paid = (siblingsOf.get(row.goalId) ?? []).map((g) => paidDay.get(g)).filter((d): d is DayKey => !!d).sort();
      out[row.goalId] = goalSeriesEntryOf({
        milestone: m,
        roadmap: {
          status: row.roadmap.status as RoadmapStatus,
          archiveReason: row.roadmap.archiveReason,
          scheduled: row.roadmap.milestones,
          positions: row.roadmap.milestones.map((x) => ({ id: x.id, lineageId: x.lineageId, version: x.version, status: x.status, rankIndex: x.rankIndex, createdAt: x.createdAt })),
        },
        stated: statedBy.get(row.goalId) ?? null,
        readings: all.filter((r) => keys.has(r.measureKey)),
        lineagePaidOn: paid[0] ?? null,
        today,
      });
    }
    return out;
  } catch (err) {
    if (isMissingRoadmapTable(err)) return {};
    throw err;
  }
}
