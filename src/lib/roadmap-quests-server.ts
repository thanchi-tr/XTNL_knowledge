/**
 * Week quests' reads and writes (roadmap lane R6; roadmap.md revision 3,
 * F14). One RoadmapQuestWeek row per milestone per life week
 * ('rq:<milestoneId>:<weekStart>', INSERT … ON CONFLICT DO NOTHING), frozen by
 * the life cron just after Monday 04:00, else by Start, else by the first
 * chain run or render that finds none (in after()). Results are written once
 * the week has settled (the Wednesday 04:00 after its Sunday). Every write is
 * gated by lifeWritesEnabled(). Server-only.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R6. Callers:
 *   loadWeekQuests       /today (lane T) beside the board; the Aim card's line (R4's loadAimCard);
 *                        the roadmap page (R4's loadRoadmapView, through `viewInput`)
 *   freezeWeekQuests     the life cron (source CRON) and the chain (RENDER), before readings (lane G);
 *                        the /today, /you and /you/roadmap after() when the set is not frozen (RENDER)
 *   finalizeQuestWeeks   the chain and the life cron, after readings (lane G); renders never finalise
 *   weekQuestSetFor · questWeekInsertOp   R4's startPreview and finishStartCore (source START)
 *   loadPastWeeks        R4's loadRoadmapView
 * Imports nothing from roadmap-model, roadmap-validate or roadmap-evidence;
 * no model is ever called. One of the two files allowed to call yoursText()
 * and labelTextOf() (the quest labels).
 *
 * Every read goes through a QuestStore: the Prisma one by default, an
 * in-memory one in scripts/roadmap-quests-check.ts (prisma-free).
 *
 * Every input of a week's set is read as of Monday 04:00 (dayStartOf(weekStart))
 * except card levels, which are read at the freeze and named in the basis:
 *   - held days: RestDay rows declared before Monday 04:00 and not cancelled
 *     by then, through duty-rule heldDaysOf;
 *   - cards: those created before Monday 04:00 (later ones are ADD progress);
 *   - v0: the last reading before the week (the Start reading in Start's week);
 *   - steps done and checkpoint logs: before the week;
 *   - capacity: throughput as if read on Monday (finalDay = weekStart − 2);
 *   - p, yield and the need rate: the StartSnapshot's, for the milestone's life.
 *
 * Fix round (roadmap-contracts.md §9):
 *   - one due day: milestoneDueDayOf (the goal's after a Reschedule);
 *   - the open milestone skips a superseded row (isSupersededRow: a dropped
 *     row whose "Start again" copy has started), and "Milestone n of m" counts
 *     positions (one per lineage), so a dropped row and its copy are one;
 *   - a NUMBER-flagged label reaches a quest only when the words are the
 *     user's (origin USER or SYLLABUS) or were actually edited (flags cleared);
 *   - the freeze and the finaliser return a caught failure as `error`, which
 *     the roadmap step reports (roadmapStepErrorsOf);
 *   - a row's place on Today is today-board's own placementOf, in the words
 *     of the board section the seek opens (questPlaceText).
 *
 * Revision 4 (roadmap-rev4.md F-R4-14, F-R4-16; contracts §14.9):
 *   - every PAYS card measure of the milestone is read, one per Domain
 *     (WeekQuestInput.cards), with its segment: recall cards only (CardState
 *     .recall from Idea.questionType), and for an `rc` measure the cards at
 *     exactly L with their clean-entry state from the REVIEW ledger rows
 *     (roadmap-types' isRetryEntry over retryReadDaysOf, the one rule R1's
 *     readings and R4's planContext also read; fix round, contracts §15.1),
 *     read with the card levels;
 *   - the reach uses the StartSnapshot's figures and the loadout's strikes and
 *     grace, read with m;
 *   - ADD's evidence counts recall cards per Domain (addedByDomain); RAISE
 *     reads each part's own measure key;
 *   - a legacy roadmap (isLegacyRoadmap: depth null on a Field Area, or a
 *     scheduled row with no stage) has no week quests: loadWeekQuests returns
 *     null and the freeze skips it ("Start again at a depth to measure this
 *     aim" is R4's page line);
 *   - the milestone read selects Roadmap.depth and RoadmapMilestone.stage;
 *     before the rev-4 migration is applied (isMissingRev4Column) it reads
 *     without them, and every roadmap then reads as legacy (none can have
 *     started: ROADMAP_GOALS_LIVE was false throughout);
 *   - the view reads the parts' Domain names from the Domain rows, and marks
 *     a BODY plan's PRACTICE rows for HEALTH_LINE.
 *
 * Confirm to unlock (contracts §19; lane R6's half, landed by R4's item): no
 * quest for a practice, step or checkpoint of a kind the plan's gate blocks
 * (waiting on the user's answer, or one they said to avoid). The gate is the
 * caller's (QuestSetOverrides.gate: Start passes its own, with the parser's
 * words), else questGateOf over the roadmap row's words and stored answers
 * (the milestone read selects Roadmap.aim, constraints, examLabel, syllabus
 * and coverage; the parts read RoadmapItem.catalogKey, absent before the
 * rev-4 migration). An item with no catalog type is the user's own and is
 * never held back.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { addDays, dateColumn, dayKeyOf, dayStartOf, daysBetween, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import { lifeWritesEnabled } from "./life-economy";
import { heldDaysOf, type RestRow } from "./duty-rule";
import { isMissingRestDayTable } from "./rest-rules";
import { instanceOutcome } from "./habit";
import { parseRule } from "./recurrence";
import { loadWeeklyQuotas } from "./field-quota";
import { loadThroughput } from "./throughput-server";
import { availableFor } from "./roadmap-realism";
import { activityConfirmOf, allowedKindsFor, catalogTrackOf, constraintsStateOf, isPlaceableKind } from "./roadmap-catalog";
import type { Track } from "./life-types";
import { placementOf, ruleOf, type BoardInstance, type BoardTemplate, type Placement } from "./today-board";
import {
  DECISIONS,
  DECLARED_FACTOR,
  NON_RECALL_TYPES,
  ORIGINS,
  PRACTICE_BANDS,
  THROUGHPUT_LAG_DAYS,
  acceptanceOrderBy,
  checkpointLogPrefix,
  cueTextsOf,
  domainName,
  isLegacyRoadmap,
  isMissingRev4Column,
  isMissingRoadmapTable,
  isQuestWeekFinal,
  isRetryEntry,
  isRecallType,
  isSupersededRow,
  labelTextOf,
  milestoneDueDayOf,
  parseMeasureKey,
  positionCountOf,
  practiceBandMinutes,
  provenanceOf,
  questWeekKey,
  retryReadDaysOf,
  yoursText,
  type ActivityGate,
  type CardSegment,
  type CardState,
  type CodeText,
  type Decision,
  type DomainName,
  type Intensity,
  type Origin,
  type PastWeekView,
  type PracticeBand,
  type QuestEvidence,
  type QuestFinalizeRun,
  type QuestFreezeRun,
  type RateSource,
  type RealismInput,
  type ReviewLedgerRow,
  type RoadmapWriteOpts,
  type StartPoint,
  type StartSnapshot,
  type WeekQuestCardInput,
  type WeekQuestCheckpointInput,
  type WeekQuestInput,
  type WeekQuestPracticeInput,
  type WeekQuestProgress,
  type WeekQuestSet,
  type WeekQuestSource,
  type WeekQuestSpec,
  type WeekQuestState,
  type WeekQuestStepInput,
  type WeekQuestsView,
  type WeekQuestVariant,
  type YoursText,
} from "./roadmap-types";
import {
  pastWeekOf,
  questProgress,
  questWindowOf,
  weekQuestResultsOf,
  weekQuestsFor,
  weekQuestsViewOf,
  type WeekQuestInputExtras,
  type WeekQuestResultsStored,
  type WeekQuestsViewInput,
} from "./roadmap-quests";

// ═══ The store: every read and write this module makes ══════════════════════

/** The roadmap fields a week reads. */
export interface QuestRoadmapRow {
  id: string;
  status: string;
  fieldId: string | null;
  track: string;
  /** Revision 4: Roadmap.depth (12, 10 or 8 on a Field Area; null on a track Area or a legacy plan). Absent reads as null. */
  depth?: number | null;
  hoursPerWeek: number;
  intensity: string;
  startPoint: string;
  typicalHours: number | null;
  typicalHoursSource: string | null;
  targetDay: DayKey;
  practicesAllowed: boolean;
  /**
   * Confirm to unlock (contracts §19): the words the plan's gate reads and the
   * stored answers (Roadmap.coverage). Absent (a store that doesn't read
   * them): the week reads no gate of its own, and only a gate the caller
   * passes (QuestSetOverrides.gate) holds a kind back.
   */
  aim?: string | null;
  constraints?: string | null;
  examLabel?: string | null;
  syllabus?: unknown;
  coverage?: unknown;
}

/** One milestone with its roadmap, its goal and its place among the roadmap's scheduled milestones. */
export interface QuestMilestoneFacts {
  roadmap: QuestRoadmapRow;
  milestone: {
    id: string;
    lineageId: string;
    ord: number;
    title: string;
    status: string;
    startedDay: DayKey | null;
    dueDay: DayKey | null;
    /** RoadmapMilestone.feasibility: a StartSnapshot (kind START) once started. */
    feasibility: unknown;
    goalId: string | null;
    /** RoadmapMilestone.version and createdAt (fix round): isSupersededRow orders a "Start again" copy after its dropped row. */
    version?: number;
    createdAt?: Date | string | null;
    /** Revision 4: RoadmapMilestone.stage (a StageKey; null on a legacy row). Absent reads as null. */
    stage?: string | null;
  };
  /** The milestone's goal (null before Start, or when it was deleted). */
  goal: { id: string; dueDay: DayKey | null; closed: boolean; closedDay: DayKey | null; archivedDay: DayKey | null } | null;
  /**
   * 1-based place among the roadmap's scheduled positions (PLANNED, STARTING,
   * STARTED; one per lineage), by ord: "Milestone 2". A dropped row and its
   * "Start again" copy share one place.
   */
  place: number;
  /** How many positions are scheduled (positionCountOf): "of 3". */
  of: number;
}

export interface QuestItemRow {
  id: string;
  lineageId: string;
  kind: string;
  ord: number;
  label: string;
  origin: string;
  decision: string;
  domainId: string | null;
  proposedName: string | null;
  flags: string[];
  templateId: string | null;
  rule: string | null;
  durationBand: string | null;
  outOf: number | null;
  bar: number | null;
  addToToday: boolean;
  /** RoadmapItem.catalogKey (revision 4; absent or null: no catalog type, the user's own words, never held back). */
  catalogKey?: string | null;
}

export interface QuestMeasureRow {
  kind: string;
  role: string;
  scope: unknown;
  minLevel: number | null;
  target: number;
  baseline: number | null;
  rateSource: string | null;
  measureKey: string | null;
}

export interface QuestTemplateRow {
  id: string;
  recurrence: string | null;
  startDay: DayKey;
  estMinutes: number;
  completedAt: Date | null;
  archivedAt: Date | null;
  /**
   * The TaskTemplate columns today-board's placeOf reads to file the task on
   * Today (fix round: a row's place is the board's own). Absent reads as the
   * column's default (kind TASK, not inbox, not compulsory, no dates).
   */
  kind?: string;
  inbox?: boolean;
  compulsory?: boolean;
  dueDay?: DayKey | null;
  dueKind?: string | null;
  planDay?: DayKey | null;
  autoMetric?: string | null;
  closedScore?: number | null;
}

export interface QuestInstanceRow {
  templateId: string;
  day: DayKey;
  status: string;
  repaired: boolean;
  /** When the row was written: a step recorded after Monday 04:00 (even for Sunday) is still open as of Monday. */
  createdAt?: Date;
  /** TaskInstance.source (placeOf reads it for yesterday's row); absent reads 'manual'. */
  source?: string;
}

export interface QuestCardRow {
  domainId: string;
  level: number;
  dueDate: Date;
  graceEndsAt: Date | null;
  createdAt: Date;
  /** Revision 4: the Idea's id (the clean-entry ledger read) and its question type (recall cards: every type but NON_RECALL_TYPES). Absent: counted. */
  id?: string;
  questionType?: string | null;
}

/** One REVIEW ledger row of a card (ActivityEvent source REVIEW, sourceId the Idea). */
export interface QuestReviewRow {
  ideaId: string;
  day: DayKey;
  occurredAt: Date;
  detail: string | null;
}

/** A RoadmapQuestWeek row, JSON columns unparsed. */
export interface StoredQuestWeek {
  id: string;
  userId: string;
  roadmapId: string;
  milestoneId: string;
  weekStart: DayKey;
  dedupeKey: string;
  source: string;
  state: string;
  generator: number;
  quests: unknown;
  basis: unknown;
  cappedBy: string | null;
  results: unknown;
  finalizedAt: Date | null;
  createdAt: Date;
}

/** A week's capacity: available(w) over the week's non-held days, its class, and whether it is the declared fallback. */
export type QuestCapacity = WeekQuestInput["capacity"];

/**
 * Every read and write this module makes, as plain rows. The default is
 * Prisma (prismaQuestStore); the checks pass an in-memory one, so the
 * freeze, the finaliser and the as-of-Monday rules are tested without a
 * database. Implementations must keep two write rules: insertQuestWeek is
 * INSERT … ON CONFLICT ("userId","dedupeKey") DO NOTHING (returns 0 or 1),
 * and finalizeQuestWeek is UPDATE … WHERE "finalizedAt" IS NULL (0 or 1).
 */
export interface QuestStore {
  /** Every scheduled milestone of the user's ACTIVE roadmap (scope "active"), or of the roadmaps of these milestones (those included). */
  milestones(userId: string, scope: { active: true } | { milestoneIds: readonly string[] }): Promise<QuestMilestoneFacts[]>;
  parts(milestoneId: string): Promise<{ items: QuestItemRow[]; measures: QuestMeasureRow[] }>;
  templates(userId: string, ids: readonly string[]): Promise<QuestTemplateRow[]>;
  instances(userId: string, templateIds: readonly string[], from: DayKey, to: DayKey): Promise<QuestInstanceRow[]>;
  domains(ids: readonly string[]): Promise<{ id: string; name: string; fieldId: string }[]>;
  /** Non-archived Ideas in these Domains created before the instant. */
  cards(domainIds: readonly string[], createdBefore: Date): Promise<QuestCardRow[]>;
  lastReadingBefore(userId: string, measureKey: string, day: DayKey): Promise<{ day: DayKey; value: number } | null>;
  readingOn(userId: string, measureKey: string, day: DayKey): Promise<{ day: DayKey; value: number } | null>;
  readingsBetween(userId: string, measureKey: string, from: DayKey, to: DayKey): Promise<{ day: DayKey; value: number }[]>;
  /** Days of readings whose key starts with the prefix (checkpoint logs), from `from` (null: any) to `to`. */
  logDays(userId: string, prefix: string, from: DayKey | null, to: DayKey): Promise<DayKey[]>;
  /** Non-archived Ideas with domainId in scope and createdAt in [from, to). */
  countAdded(domainIds: readonly string[], from: Date, to: Date): Promise<number>;
  /** Revision 4 (ADD's parts): non-archived recall cards (questionType not in NON_RECALL_TYPES) created in [from, to), per Domain id. */
  addedByDomain(domainIds: readonly string[], from: Date, to: Date): Promise<Record<string, number>>;
  /** Revision 4 (clean entry): the REVIEW ledger rows of these cards dated from `from` on. */
  reviewRows(userId: string, ideaIds: readonly string[], from: DayKey): Promise<QuestReviewRow[]>;
  /** RestDay rows with day in [from, to] (none when the table is missing). */
  restRows(userId: string, from: DayKey, to: DayKey): Promise<RestRow[]>;
  /** The week's capacity as if read on Monday, as a function of the week's held days (so it joins the read wave). */
  capacity(userId: string, roadmap: QuestRoadmapRow, weekStart: DayKey): Promise<(heldDays: readonly DayKey[]) => QuestCapacity>;
  /** This week's weekly Field quotas (Fields in maintenance excluded). */
  quotas(userId: string, weekStart: DayKey): Promise<{ fieldId: string; name: string; quota: number }[]>;
  /** The current interval multiplier m. */
  intervalMultiplier(userId: string): Promise<number>;
  /** Revision 4 (optional): m with the loadout's extra strikes and grace days (the reach model's terms), in one read. Absent: intervalMultiplier with none. */
  reachLoadout?(userId: string): Promise<{ intervalMultiplier: number; extraStrikes: number; graceExtraDays: number }>;
  /**
   * The clean-entry window (cleanWindowDaysOf): the interval multiplier m
   * recorded on the roadmap's current acceptance (acceptanceOrderBy, undone
   * ones skipped: the one R1's readings read), or null with none. Absent:
   * none, so the window reads the live m alone.
   */
  acceptanceMultiplier?(userId: string, roadmapId: string): Promise<number | null>;
  /** Frozen weeks of the user: of one roadmap, not yet finalised, or of one life week (any combination). */
  questWeeks(userId: string, filter: { roadmapId?: string; unfinalized?: boolean; weekStart?: DayKey }): Promise<StoredQuestWeek[]>;
  insertQuestWeek(userId: string, roadmapId: string, set: WeekQuestSet, source: WeekQuestSource, now: Date): Promise<number>;
  finalizeQuestWeek(id: string, results: WeekQuestResultsStored, now: Date): Promise<number>;
}

/** What every function here takes: the write gate's env (RoadmapWriteOpts) and the store. */
export interface QuestOpts extends RoadmapWriteOpts {
  store?: QuestStore;
}

/**
 * What a caller that is mid-Start knows before the milestone's rows say it
 * (R4's finishStartCore computes the set before its finish transaction, and
 * startPreview before anything exists): the StartSnapshot, the started day,
 * the template of each practice and step, and the Start reading.
 */
export interface QuestSetOverrides {
  startedDay?: DayKey;
  snapshot?: StartSnapshot;
  /**
   * Item id or item lineage id → template id, for practices and steps whose
   * RoadmapItem.templateId is not written yet. A mapped id with no template
   * row (the Start preview's placeholders) reads the item's own rule and
   * band, starting on the started day.
   */
  templateIds?: Readonly<Record<string, string>>;
  /** The Start reading of the card measure (rev 3: one measure). */
  v0?: number;
  /** Revision 4: the Start reading per measure key (a depth plan's one measure per Domain); a key not here falls back to its stored reading, then to the live count. */
  v0ByKey?: Readonly<Record<string, number>>;
  /**
   * Confirm to unlock (contracts §19): the plan's gate as the caller read it
   * (R4's Start passes its own, with the parser's words). Absent: the gate of
   * the roadmap row's own words and answers (questGateOf).
   */
  gate?: Pick<ActivityGate, "blocked"> | null;
}

// ═══ Labels: only the user's words, code's names and Domain names (F13) ═════

/**
 * Whether a label still carries a number nobody but Gemini wrote (F6, fix
 * round). A NUMBER flag counts unless the words are the user's own (origin
 * USER) or the syllabus's (SYLLABUS). EDITED alone is not enough: a
 * plan-only edit (sessions, band, bar, a target) leaves Gemini's words and
 * their flags in place, and R4's editItemCore clears the flags only when the
 * label text itself changed (roadmap-contracts.md §9.3, "EDITED means the
 * words changed"). So a label actually edited has no NUMBER flag left.
 */
function carriesGeminiNumber(origin: Origin, flags: readonly string[] | undefined): boolean {
  return (flags ?? []).includes("NUMBER") && origin !== "USER" && origin !== "SYLLABUS";
}

/**
 * A stored practice name, step title or checkpoint label as a quest-label
 * part: YoursText (typed, edited or checked) or CodeText (code's own name,
 * kept or pending), never Gemini's unchecked words, never a removed item,
 * and never text that still carries a NUMBER flag (carriesGeminiNumber).
 */
export function questLabelOf(item: { origin: string; decision: string; label: string; flags?: readonly string[] }): YoursText | CodeText | null {
  if (!(ORIGINS as readonly string[]).includes(item.origin) || !(DECISIONS as readonly string[]).includes(item.decision)) return null;
  const origin = item.origin as Origin;
  const decision = item.decision as Decision;
  if (decision === "REMOVED") return null;
  if (carriesGeminiNumber(origin, item.flags)) return null;
  const text = item.label.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return labelTextOf(origin, decision, text);
}

/** A checkpoint label: YoursText only (the bar and outOf are the user's), under the same NUMBER rule. */
export function checkpointLabelOf(item: { origin: string; decision: string; label: string; flags?: readonly string[] }): YoursText | null {
  if (!(ORIGINS as readonly string[]).includes(item.origin) || !(DECISIONS as readonly string[]).includes(item.decision)) return null;
  const origin = item.origin as Origin;
  const decision = item.decision as Decision;
  if (decision === "REMOVED") return null;
  if (carriesGeminiNumber(origin, item.flags)) return null;
  const text = item.label.replace(/\s+/g, " ").trim();
  return text ? yoursText(origin, decision, text) : null;
}

// ═══ Small helpers ══════════════════════════════════════════════════════════

const SCHEDULED = new Set(["PLANNED", "STARTING", "STARTED"]);
const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);
const minDay = (a: DayKey, b: DayKey): DayKey => (a < b ? a : b);
const isKept = (status: string) => instanceOutcome([status]) === "kept";

/** A fact's milestone as roadmap-types' position helpers read it. */
function positionRowOf(f: QuestMilestoneFacts): { id: string; lineageId: string; version: number; status: string; createdAt: Date | string | null } {
  return { id: f.milestone.id, lineageId: f.milestone.lineageId, version: f.milestone.version ?? 0, status: f.milestone.status, createdAt: f.milestone.createdAt ?? null };
}

/**
 * The open milestone: a STARTED milestone of an ACTIVE roadmap whose goal is
 * open (not closed, not archived) and which is not superseded (fix round): a
 * dropped row whose "Start again" copy has started is never the open one,
 * even after its goal is unarchived (isSupersededRow), so the week asks
 * nothing of a position twice.
 */
function openOf(list: readonly QuestMilestoneFacts[]): QuestMilestoneFacts | null {
  const rowsOf = new Map<string, ReturnType<typeof positionRowOf>[]>();
  for (const f of list) rowsOf.set(f.roadmap.id, [...(rowsOf.get(f.roadmap.id) ?? []), positionRowOf(f)]);
  const open = list.filter(
    (f) =>
      f.roadmap.status === "ACTIVE" &&
      f.milestone.status === "STARTED" &&
      f.goal != null &&
      !f.goal.closed &&
      f.goal.archivedDay == null &&
      !isSupersededRow(positionRowOf(f), rowsOf.get(f.roadmap.id) ?? [])
  );
  open.sort((a, b) => a.place - b.place);
  return open[0] ?? null;
}

/**
 * Places by position (fix round): the roadmap's scheduled rows (PLANNED,
 * STARTING, STARTED, not above the roadmap's version) by ord then id, one
 * place per lineage, so a dropped row and its "Start again" copy (same ord,
 * same lineage) read as one "Milestone 2", and `of` is positionCountOf.
 * A dropped milestone (STARTED, its goal archived) keeps its place; LATER
 * takes none. So `of` is RoadmapView.positions (contracts §11.2) and the
 * place is Today's chip (R1 goalSeriesEntryOf), even where a raw ord is not
 * (a re-planned "Start again" copy is renumbered after the carried rows).
 * Exported for the checks (roadmap-quests-check "fix round 2").
 */
export function scheduledPlacesOf(
  rows: readonly { id: string; lineageId: string; ord: number; status: string; version: number }[],
  roadmapVersion: number
): { placeOf: Map<string, number>; of: number } {
  const scheduled = rows.filter((r) => SCHEDULED.has(r.status) && r.version <= roadmapVersion).sort((a, b) => a.ord - b.ord || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byLineage = new Map<string, number>();
  for (const r of scheduled) if (!byLineage.has(r.lineageId)) byLineage.set(r.lineageId, byLineage.size + 1);
  const placeOf = new Map<string, number>();
  for (const r of rows) {
    const p = byLineage.get(r.lineageId);
    if (p != null) placeOf.set(r.id, p);
  }
  return { placeOf, of: positionCountOf(scheduled) };
}

/** A BODY-track plan (F-R4-13): its PRACTICE week quest rows show HEALTH_LINE. */
function isBodyPlan(r: QuestRoadmapRow): boolean {
  return r.fieldId == null && catalogTrackOf({ fieldId: null, track: r.track as Track }) === "BODY";
}

/** RoadmapMilestone.feasibility as a StartSnapshot, or null before Start. */
export function startSnapshotOfRow(feasibility: unknown): StartSnapshot | null {
  if (!feasibility || typeof feasibility !== "object") return null;
  const f = feasibility as Partial<StartSnapshot>;
  if (f.kind !== "START" || typeof f.startedDay !== "string" || !Array.isArray(f.weeks)) return null;
  return f as StartSnapshot;
}

/** A stored row as the set it froze (tolerant of a malformed JSON column: it reads as no quests). */
export function setOfStored(row: StoredQuestWeek): WeekQuestSet {
  const quests = Array.isArray(row.quests) ? (row.quests as WeekQuestSpec[]) : [];
  const basis = Array.isArray(row.basis) ? (row.basis as unknown[]).filter((b): b is string => typeof b === "string") : [];
  const state: WeekQuestState = row.state === "HELD" || row.state === "PAST_DUE" ? row.state : "OPEN";
  const cappedBy = row.cappedBy === "CATCHUP" || row.cappedBy === "CAPACITY" ? row.cappedBy : null;
  return { weekStart: row.weekStart, milestoneId: row.milestoneId, generator: row.generator, state, quests, basis, cappedBy };
}

function resultsOfStored(row: StoredQuestWeek): WeekQuestResultsStored | null {
  if (row.finalizedAt == null || !row.results || typeof row.results !== "object") return null;
  const r = row.results as Partial<WeekQuestResultsStored>;
  if (!Array.isArray(r.rows)) return null;
  return {
    closedDay: typeof r.closedDay === "string" ? r.closedDay : null,
    rows: r.rows,
    heldAfterFreeze: typeof r.heldAfterFreeze === "number" ? r.heldAfterFreeze : 0,
    ...(typeof r.eligibleDays === "number" ? { eligibleDays: r.eligibleDays } : {}),
  };
}

/** RestDay rows as they stood at an instant: declared before it, a cancellation after it undone. */
function restRowsAsOf(rows: readonly RestRow[], asOf: Date): RestRow[] {
  const t = asOf.getTime();
  return rows
    .filter((r) => r.declaredAt.getTime() < t && (r.cancelledAt == null || r.cancelledAt.getTime() >= t))
    .map((r) => ({ ...r, cancelledAt: null }));
}

/** Held days in [from, to] as declared before the instant (F13 Input). */
export function heldDaysAsOf(rows: readonly RestRow[], asOf: Date, from: DayKey, to: DayKey): Set<DayKey> {
  return from > to ? new Set() : heldDaysOf(restRowsAsOf(rows, asOf), from, to);
}

const isBand = (b: string | null): b is PracticeBand => b != null && (PRACTICE_BANDS as readonly string[]).includes(b);

// ═══ Legacy plans (F-R4-16) ═════════════════════════════════════════════════

/**
 * Whether the open milestone's roadmap is legacy (F-R4-16): depth null on a
 * Field Area, or a scheduled row of it with no stage (isLegacyRoadmap). A
 * legacy roadmap has no week quests. A fact read without the rev-4 columns
 * (depth and stage absent) reads as legacy.
 */
export function isLegacyFacts(open: QuestMilestoneFacts, list: readonly QuestMilestoneFacts[]): boolean {
  const same = list.filter((f) => f.roadmap.id === open.roadmap.id);
  if (!same.some((f) => f.milestone.id === open.milestone.id)) same.push(open);
  return isLegacyRoadmap({ fieldId: open.roadmap.fieldId, depth: open.roadmap.depth ?? null }, same.map((f) => ({ stage: f.milestone.stage ?? null })));
}

// ═══ Building a week's input (F13 Input) ════════════════════════════════════

/** A WeekQuestInput with R6's extras (the loadout's reach terms). */
export type WeekQuestInputR6 = WeekQuestInput & WeekQuestInputExtras;

/** Own-property read of a number from a plain record ('__proto__' and friends never resolve). */
function ownNumberOf(rec: Readonly<Record<string, number>> | null | undefined, key: string): number | undefined {
  if (!rec || typeof rec !== "object" || !Object.prototype.hasOwnProperty.call(rec, key)) return undefined;
  const v = rec[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * The plan's gate for a week (confirm to unlock, contracts §19): roadmap-
 * catalog allowedKindsFor over the roadmap's own words (its constraints, aim
 * and notes, cueTextsOf) and the user's stored answers (Roadmap.coverage).
 * The parser's pre-fill is R4's (Start passes its gate); this reading holds
 * the cue gate and every answer. null when the row carries no words (a
 * store that doesn't read them).
 */
export function questGateOf(r: QuestRoadmapRow): Pick<ActivityGate, "blocked"> | null {
  if (r.aim === undefined && r.constraints === undefined) return null;
  const raw = r.syllabus && typeof r.syllabus === "object" ? (r.syllabus as { lines?: unknown; source?: unknown }) : null;
  const syllabus = raw ? { lines: Array.isArray(raw.lines) ? raw.lines.filter((l): l is string => typeof l === "string") : [], source: typeof raw.source === "string" ? raw.source : null } : null;
  const track = catalogTrackOf({ fieldId: r.fieldId, track: (r.track as Track) ?? "CRAFT" });
  const texts = cueTextsOf({ constraints: r.constraints ?? null, aim: r.aim ?? "", examLabel: r.examLabel ?? null, typicalHoursSource: r.typicalHoursSource, syllabus });
  const state = constraintsStateOf({ track, texts, exam: !!r.examLabel, practicesAllowed: r.practicesAllowed });
  return allowedKindsFor(state, activityConfirmOf(r.coverage));
}

/** The measure's own count of a Domain's cards at ≥ L, as its key counts (r: recall only; rc: and a retry entry at exactly L counts L − 1). R4's bar seam reads the same count. */
export function measureCountOf(cards: readonly CardState[], L: number, segment: CardSegment | undefined): number {
  let n = 0;
  for (const c of cards) {
    if (segment && c.recall === false) continue;
    if (c.level < L) continue;
    if (segment === "rc" && c.level === L && c.retryEntry) continue;
    n += 1;
  }
  return n;
}

/**
 * The clean-entry read's window at level L, in life days: retryReadDaysOf at
 * the wider of the live m and the roadmap's current acceptance's, with the
 * live grace extension — R1's cleanReadDaysOf to the day, so R1's readings,
 * R4's planContext and these parts read one window. srs.ts sets a card's
 * interval with the loadout of its review day, so a card that entered L under
 * an interval multiplier since unequipped still sits inside it. The
 * acceptance is read only here (a card sits at L on an `rc` measure);
 * unreadable (logged) or absent, the live m alone.
 */
async function cleanWindowDaysOf(store: QuestStore, userId: string, roadmapId: string, L: number, liveM: number, loadout: { graceExtraDays: number }): Promise<number> {
  const accepted = await Promise.resolve()
    .then(() => (store.acceptanceMultiplier ? store.acceptanceMultiplier(userId, roadmapId) : null))
    .catch((err: unknown) => {
      console.error("week quests: the acceptance's interval multiplier is unavailable (the clean-entry window reads the live m):", questErrorText(err));
      return null;
    });
  const m = Math.max(liveM, typeof accepted === "number" && Number.isFinite(accepted) && accepted > 0 ? accepted : 1);
  return retryReadDaysOf(L, m, loadout.graceExtraDays || 0);
}

/**
 * WeekQuestInput for one milestone's week, read as of Monday 04:00 except
 * card levels. null when the milestone has no StartSnapshot or started day
 * (not started, and no override), or when one of its Domains is still in
 * Gemini's words (Start refuses that, F15, so such a milestone never has a set).
 *
 * Revision 4: every PAYS CARDS_AT_LEVEL measure is read, in the order of the
 * milestone's DOMAIN items (R's order), into `cards` (`card` is the first,
 * for v1 readers). A card's `recall` comes from its question type; an `rc`
 * measure's cards at exactly L get `retryEntry` from their REVIEW ledger rows
 * of the last cleanWindowDaysOf life days (retryReadDaysOf at the wider of m
 * and the acceptance's, with the loadout's grace extension; fix round 2,
 * contracts §16.1: the window holds the entering pass and the miss before it,
 * srs.ts's latest retry entry included — 184 days at L12, m 1; one shared
 * window, R1's cleanReadDaysOf, so R1's readings, R4's planContext and these
 * parts count the same cards), read with the card levels and judged by
 * roadmap-types' isRetryEntry, the one clean-entry rule (fix round,
 * contracts §15.1: R1's, which the reach DP
 * follows; a shield or a degrade before the pass is a retry too, and a later
 * strike at L keeps it one until its next pass). The loadout's strikes and
 * grace come with m.
 */
export async function weekQuestInputFor(
  store: QuestStore,
  userId: string,
  facts: QuestMilestoneFacts,
  weekStart: DayKey,
  now: Date,
  overrides: QuestSetOverrides = {}
): Promise<WeekQuestInputR6 | null> {
  const ms = facts.milestone;
  const snapshot = overrides.snapshot ?? startSnapshotOfRow(ms.feasibility);
  const startedDay = overrides.startedDay ?? ms.startedDay ?? snapshot?.startedDay ?? null;
  if (!snapshot || !startedDay) return null;
  // One due day (fix round): the goal's once started (a Reschedule moves only that), else the milestone's.
  const dueDay = milestoneDueDayOf(ms.dueDay, facts.goal?.dueDay) ?? snapshot.dueDay;
  const weekEnd = addDays(weekStart, 6);
  const asOf = dayStartOf(weekStart);
  const lastBefore = addDays(weekStart, -1);

  // Wave 1: the milestone's own rows.
  const { items, measures } = await store.parts(ms.id);
  const live = items.filter((i) => i.decision !== "REMOVED");
  const domainOrd = new Map<string, number>();
  for (const d of live) if (d.kind === "DOMAIN" && d.domainId != null && !domainOrd.has(d.domainId)) domainOrd.set(d.domainId, d.ord);
  const scopeOf = (mm: QuestMeasureRow): string[] => {
    const parsed = mm.measureKey ? parseMeasureKey(mm.measureKey) : null;
    if (mm.scope && typeof mm.scope === "object" && Array.isArray((mm.scope as { domainIds?: unknown }).domainIds)) {
      return (mm.scope as { domainIds: unknown[] }).domainIds.filter((d): d is string => typeof d === "string");
    }
    return parsed?.kind === "CARDS_AT_LEVEL" ? parsed.domainIds : [];
  };
  const cardMeasures = measures
    .filter((mm) => mm.kind === "CARDS_AT_LEVEL" && mm.role === "PAYS" && mm.measureKey && mm.minLevel != null)
    .map((mm) => {
      const parsed = parseMeasureKey(mm.measureKey as string);
      return { mm, key: mm.measureKey as string, L: mm.minLevel as number, scope: scopeOf(mm), segment: parsed?.kind === "CARDS_AT_LEVEL" ? parsed.segment : undefined };
    })
    .filter((x) => x.scope.length > 0)
    .sort((a, b) => {
      const oa = Math.min(...a.scope.map((id) => domainOrd.get(id) ?? Number.MAX_SAFE_INTEGER));
      const ob = Math.min(...b.scope.map((id) => domainOrd.get(id) ?? Number.MAX_SAFE_INTEGER));
      return oa - ob || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    });
  const scopeIds = [...new Set(cardMeasures.flatMap((x) => x.scope))];

  // The Domains set the paying scope and the quest text: Gemini's unchecked words never reach a set.
  for (const d of live) {
    if (d.kind !== "DOMAIN") continue;
    if (d.domainId != null && !scopeIds.includes(d.domainId)) continue;
    if (!(ORIGINS as readonly string[]).includes(d.origin) || !(DECISIONS as readonly string[]).includes(d.decision)) return null;
    const cls = provenanceOf(d.origin as Origin, d.decision as Decision);
    if (cls === "DRAFT" || cls === "KEPT_SUGGESTION") return null;
  }

  const mapped = (i: QuestItemRow) => overrides.templateIds?.[i.id] ?? overrides.templateIds?.[i.lineageId] ?? null;
  const templateOf = (i: QuestItemRow) => i.templateId ?? mapped(i);
  // Confirm to unlock (contracts §19): no quest for a practice, step or checkpoint of a kind the plan's gate blocks
  // (waiting on the user's answer, or one they said to avoid); an item with no catalog type is the user's own.
  const gate = overrides.gate ?? questGateOf(facts.roadmap);
  const placeable = (i: QuestItemRow) => !gate || isPlaceableKind(gate, i.catalogKey);
  const practiceItems = live.filter((i) => i.kind === "PRACTICE" && i.addToToday && templateOf(i) && placeable(i)).sort((a, b) => a.ord - b.ord);
  const stepItems = live.filter((i) => i.kind === "STEP" && i.addToToday && templateOf(i) && placeable(i)).sort((a, b) => a.ord - b.ord);
  const cpItem = live.find((i) => i.kind === "CHECKPOINT" && i.outOf != null && i.bar != null && placeable(i)) ?? null;
  const templateIds = [...new Set([...practiceItems, ...stepItems].map((i) => templateOf(i) as string))];
  const stepTemplateIds = stepItems.map((i) => templateOf(i) as string);
  const restTo = maxDay(dueDay, weekEnd);
  const v0Of = (key: string): Promise<{ day: DayKey; value: number } | null> =>
    startedDay >= weekStart ? store.readingOn(userId, key, startedDay) : store.lastReadingBefore(userId, key, weekStart);
  const loadoutOf = async (): Promise<{ intervalMultiplier: number; extraStrikes: number; graceExtraDays: number }> =>
    store.reachLoadout ? store.reachLoadout(userId) : { intervalMultiplier: await store.intervalMultiplier(userId), extraStrikes: 0, graceExtraDays: 0 };

  // Wave 2: everything else, at once.
  const [templates, stepInstances, domains, cards, v0Rows, rest, capacityOf, quotas, loadout, logDays] = await Promise.all([
    templateIds.length ? store.templates(userId, templateIds) : Promise.resolve([] as QuestTemplateRow[]),
    stepTemplateIds.length && startedDay <= lastBefore ? store.instances(userId, stepTemplateIds, startedDay, lastBefore) : Promise.resolve([] as QuestInstanceRow[]),
    scopeIds.length ? store.domains(scopeIds) : Promise.resolve([]),
    scopeIds.length ? store.cards(scopeIds, asOf) : Promise.resolve([] as QuestCardRow[]),
    Promise.all(cardMeasures.map((x) => v0Of(x.key))),
    store.restRows(userId, weekStart, restTo),
    store.capacity(userId, facts.roadmap, weekStart),
    store.quotas(userId, weekStart),
    loadoutOf(),
    cpItem ? store.logDays(userId, checkpointLogPrefix(cpItem.lineageId), null, lastBefore) : Promise.resolve([] as DayKey[]),
  ]);
  const m = Number.isFinite(loadout.intervalMultiplier) && loadout.intervalMultiplier > 0 ? loadout.intervalMultiplier : 1;

  // Wave 3 (an `rc` measure only): the clean-entry read for its cards at exactly L, with the card levels.
  const retryIds = new Set<string>();
  const rcAt = cardMeasures.filter((x) => x.segment === "rc");
  if (rcAt.length) {
    const atL = cards.filter((c) => c.id != null && rcAt.some((x) => x.scope.includes(c.domainId) && c.level === x.L));
    if (atL.length) {
      const L = Math.max(...rcAt.map((x) => x.L));
      const back = await cleanWindowDaysOf(store, userId, facts.roadmap.id, L, m, loadout);
      const rows = await store.reviewRows(userId, atL.map((c) => c.id as string), addDays(todayKey(now), -back));
      const byIdea = new Map<string, ReviewLedgerRow[]>();
      for (const r of rows) byIdea.set(r.ideaId, [...(byIdea.get(r.ideaId) ?? []), { day: r.day, at: r.occurredAt.getTime(), detail: r.detail }]);
      for (const c of atL) if (isRetryEntry(byIdea.get(c.id as string) ?? [], c.level)) retryIds.add(c.id as string);
    }
  }

  const held = heldDaysAsOf(rest, asOf, weekStart, restTo);
  const heldWeek = [...held].filter((d) => d >= weekStart && d <= weekEnd).sort();
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const liveAt = (t: QuestTemplateRow | undefined) => t != null && (t.archivedAt == null || t.archivedAt.getTime() >= asOf.getTime());
  /** The item's template row; for an override-mapped id with no row yet (the Start preview), the item's own plan from the started day. */
  const templateFor = (item: QuestItemRow): QuestTemplateRow | undefined => {
    const id = templateOf(item) as string;
    const row = templatesById.get(id);
    if (row || item.templateId != null || mapped(item) == null) return row;
    const band = isBand(item.durationBand) ? practiceBandMinutes(item.durationBand) : 0;
    return { id, recurrence: item.kind === "PRACTICE" ? item.rule : null, startDay: startedDay, estMinutes: band, completedAt: null, archivedAt: null };
  };

  // The card measures, one per Domain on a depth plan.
  const byId = new Map(domains.map((d) => [d.id, d]));
  const states: CardState[] = cards.map((c) => ({
    level: c.level,
    dueDay: dayKeyOf(c.dueDate),
    graceEndsDay: c.graceEndsAt ? dayKeyOf(c.graceEndsAt) : null,
    createdDay: dayKeyOf(c.createdAt),
    domainId: c.domainId,
    ...(c.questionType != null ? { recall: isRecallType(c.questionType) } : {}),
    ...(c.id != null && retryIds.has(c.id) ? { retryEntry: true } : {}),
  }));
  const cardInputs: WeekQuestCardInput[] = cardMeasures.map((x, i) => {
    const names: DomainName[] = [];
    for (const id of x.scope) {
      const row = byId.get(id);
      if (row) names.push(domainName(row));
    }
    const own = states.filter((c) => c.domainId != null && x.scope.includes(c.domainId));
    const baseline = x.mm.baseline ?? 0;
    const startV0 = ownNumberOf(overrides.v0ByKey, x.key) ?? (cardMeasures.length === 1 ? overrides.v0 : undefined);
    const v0 = startedDay >= weekStart ? (v0Rows[i]?.value ?? startV0 ?? measureCountOf(own, x.L, x.segment)) : (v0Rows[i]?.value ?? baseline);
    const rate = x.mm.rateSource as RateSource | null;
    const input: WeekQuestCardInput = {
      measureKey: x.key,
      domainIds: [...x.scope],
      domainNames: names,
      level: x.L,
      target: x.mm.target,
      baseline,
      v0,
      cards: own,
      rateSource: rate === "SCOPE" || rate === "FIELD" || rate === "YOURS" || rate === "NONE" ? rate : snapshot.rateSource,
      fieldId: byId.get(x.scope[0])?.fieldId ?? null,
    };
    if (x.scope.length === 1) input.domainId = x.scope[0];
    if (x.segment) input.segment = x.segment;
    return input;
  });

  // Practices on Today, in ord.
  const practices: WeekQuestPracticeInput[] = [];
  for (const item of practiceItems) {
    const t = templateFor(item);
    if (!liveAt(t) || !t) continue;
    const name = questLabelOf(item);
    const rule = t.recurrence ?? item.rule;
    if (!name || !rule || !parseRule(rule)) continue;
    practices.push({ templateId: t.id, name, rule, startDay: t.startDay, bandMinutes: isBand(item.durationBand) ? practiceBandMinutes(item.durationBand) : t.estMinutes });
  }

  // Steps, with the day each was done before the week (a step done this week is still open as of Monday).
  const steps: WeekQuestStepInput[] = [];
  for (const item of stepItems) {
    const t = templateFor(item);
    if (!liveAt(t) || !t) continue;
    const title = questLabelOf(item);
    if (!title) continue;
    const keptDays = stepInstances
      .filter((i) => i.templateId === t.id && isKept(i.status) && i.day < weekStart && (i.createdAt == null || i.createdAt.getTime() < asOf.getTime()))
      .map((i) => i.day)
      .sort();
    const completedBefore = t.completedAt && t.completedAt.getTime() < asOf.getTime() ? dayKeyOf(t.completedAt) : null;
    const doneDay = keptDays[0] ?? completedBefore;
    steps.push({ templateId: t.id, title, ord: item.ord, doneDay, minutes: t.estMinutes });
  }

  // The checkpoint, kept with the user's bar and scale.
  let checkpoint: WeekQuestCheckpointInput | null = null;
  if (cpItem) {
    const label = checkpointLabelOf(cpItem);
    if (label) {
      const before = logDays.filter((d) => d < weekStart).sort();
      checkpoint = { itemLineageId: cpItem.lineageId, label, lastLogDay: before.length ? before[before.length - 1] : null };
    }
  }

  const areaQuota = facts.roadmap.fieldId ? (quotas.find((q) => q.fieldId === facts.roadmap.fieldId) ?? null) : null;
  return {
    weekStart,
    weekEnd,
    milestone: { id: ms.id, ord: facts.place, of: facts.of, startedDay, dueDay, snapshot },
    heldDays: [...held].sort(),
    card: cardInputs[0] ?? null,
    cards: cardInputs,
    capacity: capacityOf(heldWeek),
    otherFieldQuotas: quotas.filter((q) => q.fieldId !== facts.roadmap.fieldId).reduce((sum, q) => sum + Math.max(0, q.quota), 0),
    areaQuotaField: areaQuota ? { fieldId: areaQuota.fieldId, name: areaQuota.name } : null,
    practices,
    steps,
    checkpoint,
    m,
    cardLevelsReadAt: now.toISOString(),
    loadout: { extraStrikes: loadout.extraStrikes, graceExtraDays: loadout.graceExtraDays },
  };
}

// ═══ Verification reads (F14 Verification) ══════════════════════════════════

/** RAISE's evidence from the window's readings: the last value, the week's high, and the first day after the high it read lower. */
export function raiseEvidenceOf(rows: readonly { day: DayKey; value: number }[]): Extract<QuestEvidence, { kind: "RAISE" }> {
  const sorted = [...rows].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (sorted.length === 0) return { kind: "RAISE", value: null, high: null, slipDay: null };
  const value = sorted[sorted.length - 1].value;
  let high = -Infinity;
  let highDay = sorted[0].day;
  for (const r of sorted) {
    if (r.value >= high) {
      high = r.value;
      highDay = r.day;
    }
  }
  const slipDay = value < high ? (sorted.find((r) => r.day > highDay && r.value < high)?.day ?? null) : null;
  return { kind: "RAISE", value, high, slipDay };
}

/**
 * Where a task sits on Today, in the words of the board section a seek
 * opens (fix round, lane T handoff 3), from today-board's own placementOf,
 * so the row's place and TodayBoard's seekPlaceOf always agree:
 *   - Anytime, Planned later and Coming up all sit under Anytime, which the
 *     seek opens for each: "in Anytime";
 *   - the Inbox: "in Inbox";
 *   - a row drawn today in a lane: "in Must", or for the today lane "in
 *     Habits" when it repeats and "in Planned" when it doesn't (board-ui
 *     splitTodayLane), done today or not (a done row stays in its lane);
 *   - off the board (done on an earlier day, a goal): null, so the row names
 *     no place.
 */
export function questPlaceText(p: Placement, today: DayKey, repeating: boolean): string | null {
  const lane = p.place.lane;
  if (lane === "inbox") return "in Inbox";
  if (lane === "anytime" || lane === "later" || lane === "upcoming") return "in Anytime";
  const row = p.rows.find((r) => r.day === today);
  if (!row) return null;
  if (row.lane === "must") return "in Must";
  if (row.lane === "today") return repeating ? "in Habits" : "in Planned";
  if (row.lane === "anytime") return "in Anytime";
  return null;
}

/**
 * Where a quest's template sits on Today on `today`, from the rows this
 * module reads: placementOf over the TaskTemplate columns it uses (kind,
 * inbox, closedScore, recurrence, startDay, completedAt, dueDay, dueKind,
 * planDay, compulsory, autoMetric) and the template's instances, in
 * questPlaceText's words. A pending rule change (M2, parked) is not applied;
 * lastDone is the latest done instance read.
 */
export function questPlaceOfTemplate(t: QuestTemplateRow, today: DayKey, instances: readonly QuestInstanceRow[]): string | null {
  const board = boardTemplateOf(t);
  const p = placementOf(board, { today, instances: boardInstancesOf(t.id, instances) });
  return questPlaceText(p, today, ruleOf(board) != null);
}

/**
 * A QuestTemplateRow as today-board's BoardTemplate, projected to the
 * columns placementOf reads; the rest of BoardTemplate (pricing, grading)
 * never decides a place. Exported for the checks (seekPlaceOf on the same
 * projection).
 */
export function boardTemplateOf(t: QuestTemplateRow): BoardTemplate {
  const board = {
    id: t.id,
    kind: t.kind ?? "TASK",
    inbox: t.inbox ?? false,
    closedScore: t.closedScore ?? null,
    recurrence: t.recurrence,
    startDay: t.startDay,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    dueDay: t.dueDay ?? null,
    dueKind: t.dueKind ?? null,
    planDay: t.planDay ?? null,
    compulsory: t.compulsory ?? false,
    autoMetric: t.autoMetric ?? null,
  } as Pick<BoardTemplate, "id" | "inbox" | "closedScore" | "recurrence" | "startDay" | "completedAt" | "dueDay" | "planDay" | "compulsory"> & {
    kind: string;
    dueKind: string | null;
    autoMetric: string | null;
  };
  return board as unknown as BoardTemplate;
}

/** One template's instance rows as today-board's BoardInstance (day, status, source are what placeOf reads). */
export function boardInstancesOf(templateId: string, instances: readonly QuestInstanceRow[]): BoardInstance[] {
  const own = instances
    .filter((i) => i.templateId === templateId)
    .map((i) => ({ id: "", templateId: i.templateId, day: i.day, slot: 0, status: i.status, source: i.source ?? "manual", xpPaid: 0, repaired: i.repaired }));
  return own as unknown as BoardInstance[];
}

/** The first day of `today`'s calendar month: a TARGET /M habit's period starts there. */
const monthStartOf = (today: DayKey): DayKey => `${today.slice(0, 8)}01` as DayKey;

/**
 * The evidence for every quest of a set over its window (or a closed window
 * ending at `to`), in one wave: one COUNT per ADD, the RAISE readings, the
 * practice and step instances, the checkpoint logs. With `placeDay` (a load
 * for today), also where each task sits on Today that day: its instance read
 * then starts at the start of that month at the latest, so a TARGET habit's
 * period progress (met: filed in Anytime) is the board's.
 */
async function evidenceFor(
  store: QuestStore,
  userId: string,
  specs: readonly WeekQuestSpec[],
  placeDay?: DayKey
): Promise<{ evidence: QuestEvidence[]; places: Record<string, string> }> {
  const templateIds = [...new Set(specs.flatMap((q) => (q.kind === "PRACTICE" || q.kind === "STEP" ? [q.templateId] : [])))];
  const questSpan = specs.length ? specs.reduce((acc, q) => ({ from: minDay(acc.from, q.from), to: maxDay(acc.to, q.to) }), { from: specs[0].from, to: specs[0].to }) : null;
  const span = questSpan && placeDay ? { from: minDay(questSpan.from, minDay(monthStartOf(placeDay), addDays(placeDay, -1))), to: maxDay(questSpan.to, placeDay) } : questSpan;
  const [templates, instances, perSpec] = await Promise.all([
    templateIds.length ? store.templates(userId, templateIds) : Promise.resolve([] as QuestTemplateRow[]),
    templateIds.length && span && span.from <= span.to ? store.instances(userId, templateIds, span.from, span.to) : Promise.resolve([] as QuestInstanceRow[]),
    Promise.all(
      specs.map(async (q): Promise<QuestEvidence | null> => {
        if (q.to < q.from) return null;
        if (q.kind === "RAISE" && q.parts && q.parts.length > 0) {
          // Generator 2: each part reads its own Domain's measure key (recall cards; `rc` counts a retry entry after its next pass).
          const evs = await Promise.all(q.parts.map((p) => store.readingsBetween(userId, p.measureKey, q.from, q.to)));
          const byDomain: Record<string, { value: number | null; high: number | null; slipDay: DayKey | null }> = {};
          q.parts.forEach((p, i) => {
            const ev = raiseEvidenceOf(evs[i]);
            byDomain[p.domainId] = { value: ev.value, high: ev.high, slipDay: ev.slipDay };
          });
          return { kind: "RAISE", value: null, high: null, slipDay: null, byDomain };
        }
        if (q.kind === "RAISE") return raiseEvidenceOf(await store.readingsBetween(userId, q.measureKey, q.from, q.to));
        if (q.kind === "ADD" && q.parts && q.parts.length > 0) {
          // Generator 2: recall cards per Domain (a multiple-choice card added this week doesn't count).
          const ids = q.parts.map((p) => p.domainId);
          const by = await store.addedByDomain(ids, dayStartOf(q.from), dayStartOf(addDays(q.to, 1)));
          const addedByDomain: Record<string, number> = {};
          for (const id of ids) addedByDomain[id] = Object.prototype.hasOwnProperty.call(by, id) && Number.isFinite(by[id]) ? Math.max(0, Math.floor(by[id])) : 0;
          return { kind: "ADD", added: ids.reduce((sum, id) => sum + addedByDomain[id], 0), addedByDomain };
        }
        if (q.kind === "ADD") return { kind: "ADD", added: q.domainIds.length ? await store.countAdded(q.domainIds, dayStartOf(q.from), dayStartOf(addDays(q.to, 1))) : 0 };
        if (q.kind === "CHECKPOINT") return { kind: "CHECKPOINT", logDays: await store.logDays(userId, checkpointLogPrefix(q.itemLineageId), q.from, q.to) };
        return null;
      })
    ),
  ]);
  const byId = new Map(templates.map((t) => [t.id, t]));
  const places: Record<string, string> = {};
  if (placeDay) {
    for (const t of templates) {
      if (t.archivedAt != null) continue;
      const text = questPlaceOfTemplate(t, placeDay, instances.filter((x) => x.day <= placeDay));
      if (text) places[t.id] = text;
    }
  }
  const evidence = specs.map((q, i): QuestEvidence => {
    const got = perSpec[i];
    if (got) return got;
    if (q.kind === "PRACTICE") {
      const t = byId.get(q.templateId);
      const own = instances.filter((x) => x.templateId === q.templateId && x.day >= q.from && x.day <= q.to);
      return { kind: "PRACTICE", rule: t?.recurrence ?? null, startDay: t?.startDay ?? q.from, instances: own.map((x) => ({ day: x.day, status: x.status, repaired: x.repaired })) };
    }
    if (q.kind === "STEP") {
      const days = instances.filter((x) => x.templateId === q.templateId && isKept(x.status) && x.day >= q.from && x.day <= q.to).map((x) => x.day);
      return { kind: "STEP", doneDays: [...new Set(days)].sort() };
    }
    if (q.kind === "RAISE") return { kind: "RAISE", value: null, high: null, slipDay: null };
    if (q.kind === "ADD") return { kind: "ADD", added: 0 };
    return { kind: "CHECKPOINT", logDays: [] };
  });
  return { evidence, places };
}

/**
 * questProgress for every quest of a set (the one function every surface
 * uses), and with `placeDay` where each PRACTICE and STEP task sits on Today
 * that day (questPlaceText of the board's placeOf); places is {} without it.
 */
export async function questProgressFor(
  store: QuestStore,
  userId: string,
  set: WeekQuestSet,
  placeDay?: DayKey
): Promise<{ progress: WeekQuestProgress[]; places: Record<string, string> }> {
  const { evidence, places } = await evidenceFor(store, userId, set.quests, placeDay);
  return { progress: set.quests.map((q, i) => questProgress(q, evidence[i])), places };
}

// ═══ Loading this week's set (F14) ══════════════════════════════════════════

/** This week's set for the open roadmap's STARTED milestone, its verified progress and its view. */
export interface WeekQuestsLoad {
  set: WeekQuestSet;
  /** false: no row yet (generated live); the caller schedules freezeWeekQuests(…, 'RENDER') in after(). */
  frozen: boolean;
  progress: WeekQuestProgress[];
  /** The Today variant. */
  view: WeekQuestsView;
  /**
   * Added by R6: everything weekQuestsViewOf read for `view` except the
   * variant, so the Aim card and the roadmap page render their own variant
   * from the same load: weekQuestsViewOf({...load.viewInput, variant: "roadmap", passRate}).
   */
  viewInput: Omit<WeekQuestsViewInput, "variant">;
}

/** The view of a load in another variant (the roadmap page passes p now, and a re-fitted target when it has one, for the pass-rate note). */
export function weekQuestsViewFor(
  load: WeekQuestsLoad,
  variant: WeekQuestVariant,
  passRateNow?: { p: number; calibrating: boolean } | null,
  fittedNow?: number | null
): WeekQuestsView {
  const passRate = load.viewInput.passRate ? { ...load.viewInput.passRate, now: passRateNow ?? null, fittedNow: fittedNow ?? null } : null;
  return weekQuestsViewOf({ ...load.viewInput, variant, passRate });
}

function defaultStore(opts: QuestOpts): QuestStore {
  return opts.store ?? prismaQuestStore;
}

async function loadWeekQuestsUncached(userId: string, now: Date, opts: QuestOpts): Promise<WeekQuestsLoad | null> {
  const store = defaultStore(opts);
  const today = todayKey(now);
  const weekStart = weekStartKeyOf(today);
  // One wave: the open milestone and this week's frozen rows (whichever milestone they belong to).
  const [list, rows] = await Promise.all([store.milestones(userId, { active: true }), store.questWeeks(userId, { weekStart })]);
  const open = openOf(list);
  if (!open) return null;
  // A legacy roadmap is not measured (F-R4-16): no week quests until "Start again at a depth".
  if (isLegacyFacts(open, list)) return null;
  const key = questWeekKey(open.milestone.id, weekStart);
  const stored = rows.find((r) => r.dedupeKey === key) ?? null;
  let set: WeekQuestSet | null = stored ? setOfStored(stored) : null;
  const frozen = set != null;
  if (!set) {
    const input = await weekQuestInputFor(store, userId, open, weekStart, now);
    if (!input) return null;
    set = weekQuestsFor(input);
  }
  const partIds = [...new Set(set.quests.flatMap((q) => ((q.kind === "RAISE" || q.kind === "ADD") && q.parts ? q.parts.map((p) => p.domainId) : [])))];
  const [{ progress, places }, nameRows] = await Promise.all([questProgressFor(store, userId, set, today), partIds.length ? store.domains(partIds) : Promise.resolve([])]);
  const domainNames: Record<string, DomainName> = {};
  for (const row of nameRows) domainNames[row.id] = domainName(row);
  const snapshot = startSnapshotOfRow(open.milestone.feasibility);
  const raise = set.quests.find((q) => q.kind === "RAISE");
  const level = raise && raise.kind === "RAISE" ? raise.minLevel : (snapshot?.feasibility?.knowledge?.[0]?.level ?? null);
  const viewInput: Omit<WeekQuestsViewInput, "variant"> = {
    set,
    progress,
    milestone: { ord: open.place, of: open.of, title: open.milestone.title, dueDay: milestoneDueDayOf(open.milestone.dueDay, open.goal?.dueDay) },
    level,
    frozen,
    writesOff: !lifeWritesEnabled(opts.env),
    places,
    passRate: snapshot ? { start: { p: snapshot.pStart, calibrating: snapshot.pCalibrating }, now: null } : null,
    domainNames,
    health: isBodyPlan(open.roadmap),
  };
  return { set, frozen, progress, view: weekQuestsViewOf({ ...viewInput, variant: "today" }), viewInput };
}

/**
 * Cached 'weekQuests:<user>:<today>' on ['roadmap', 'ideas', 'life',
 * 'activity']. null with no ACTIVE roadmap, no STARTED milestone with an open
 * goal, or a missing table (isMissingRoadmapTable): Today and /you render as
 * before. Any other failure is logged and reads as null too, so Today never
 * fails on a week quest. Writes nothing.
 *
 * With no frozen row it generates the set live (frozen: false); the caller
 * schedules the RENDER freeze in after(). On a server with writes off the
 * live set is labelled "not recorded on this server" (view.writesOff) and
 * may differ between renders there, and only there.
 */
export async function loadWeekQuests(userId: string, now: Date, opts: QuestOpts = {}): Promise<WeekQuestsLoad | null> {
  const run = async () => {
    try {
      return await loadWeekQuestsUncached(userId, now, opts);
    } catch (err) {
      if (!isMissingRoadmapTable(err) && !isMissingRev4Column(err)) console.error("week quests not loaded:", err);
      return null;
    }
  };
  if (opts.store) return run();
  return cached(`weekQuests:${userId}:${todayKey(now)}`, ["roadmap", "ideas", "life", "activity"], run);
}

// ═══ The freeze (decision 23) ═══════════════════════════════════════════════

/**
 * The freeze as one operation for a caller's array transaction
 * (finishStartCore): INSERT … ON CONFLICT ("userId","dedupeKey") DO NOTHING.
 * Resolves to 1 when this call froze the week, 0 when a set already stood.
 * The id is a fresh UUID and the timestamps are written explicitly (raw
 * INSERTs get no Prisma defaults). The caller gates writes and invalidates
 * 'roadmap'.
 */
export function questWeekInsertOp(userId: string, roadmapId: string, set: WeekQuestSet, source: WeekQuestSource, now: Date): Prisma.PrismaPromise<number> {
  const id = globalThis.crypto.randomUUID();
  const key = questWeekKey(set.milestoneId, set.weekStart);
  return prisma.$executeRaw`
    INSERT INTO "public"."RoadmapQuestWeek"
      ("id", "userId", "roadmapId", "milestoneId", "weekStart", "dedupeKey", "source", "state", "generator", "quests", "basis", "cappedBy", "createdAt")
    VALUES (
      ${id}, ${userId}, ${roadmapId}, ${set.milestoneId}, ${set.weekStart}::date, ${key}, ${source}, ${set.state},
      ${set.generator}::int, ${JSON.stringify(set.quests)}::jsonb, ${JSON.stringify(set.basis)}::jsonb, ${set.cappedBy},
      (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    )
    ON CONFLICT ("userId", "dedupeKey") DO NOTHING`;
}

/**
 * The generator's set for one milestone's week, its input read as of Monday
 * 04:00 (card levels now). The milestone may be STARTING (Start's own
 * freeze): pass what the rows don't say yet in `overrides`. null when the
 * milestone isn't the user's, has no snapshot, or is not startable as is.
 * Writes nothing.
 */
export async function weekQuestSetFor(
  userId: string,
  milestoneId: string,
  weekStart: DayKey,
  now: Date,
  opts: QuestOpts & { overrides?: QuestSetOverrides } = {}
): Promise<WeekQuestSet | null> {
  const store = defaultStore(opts);
  const list = await store.milestones(userId, { milestoneIds: [milestoneId] });
  const facts = list.find((f) => f.milestone.id === milestoneId);
  if (!facts) return null;
  const input = await weekQuestInputFor(store, userId, facts, weekStartKeyOf(weekStart), now, opts.overrides ?? {});
  return input ? weekQuestsFor(input) : null;
}

/**
 * A caught failure in words for the step's `errors` (roadmapStepErrorsOf):
 * the message on one line, at most ERROR_TEXT_MAX characters (Prisma's run
 * to many lines).
 */
const ERROR_TEXT_MAX = 300;
export function questErrorText(err: unknown): string {
  const raw = err instanceof Error ? err.message || err.name : String(err);
  const one = raw.replace(/\s+/g, " ").trim() || "unknown error";
  return one.length > ERROR_TEXT_MAX ? `${one.slice(0, ERROR_TEXT_MAX - 1)}…` : one;
}

/**
 * Freezes this life week's set for the open milestone when none exists
 * (empty sets too: HELD, PAST_DUE, or nothing to ask). Cron first (source
 * CRON), then Start (START, through questWeekInsertOp), then the chain or a
 * render (RENDER) that finds no row. Nothing is written with writes off.
 * Never throws: a missing table is `skipped: "MISSING_TABLE"`; any other
 * failure is logged and returned as `error` (nothing frozen), which the
 * roadmap step reports in the cron's `errors` (F16 seam 8).
 */
export async function freezeWeekQuests(userId: string, now: Date, source: WeekQuestSource, opts: QuestOpts = {}): Promise<QuestFreezeRun> {
  if (!lifeWritesEnabled(opts.env)) return { froze: 0, skipped: "WRITES_OFF" };
  const store = defaultStore(opts);
  try {
    const weekStart = weekStartKeyOf(todayKey(now));
    const [list, rows] = await Promise.all([store.milestones(userId, { active: true }), store.questWeeks(userId, { weekStart })]);
    const open = openOf(list);
    if (!open) return { froze: 0, skipped: "NO_ROADMAP" };
    // A legacy roadmap is not measured (F-R4-16): nothing to freeze.
    if (isLegacyFacts(open, list)) return { froze: 0, skipped: "NO_ROADMAP" };
    const key = questWeekKey(open.milestone.id, weekStart);
    if (rows.some((r) => r.dedupeKey === key)) return { froze: 0, skipped: null };
    const input = await weekQuestInputFor(store, userId, open, weekStart, now);
    if (!input) return { froze: 0, skipped: null };
    const froze = await store.insertQuestWeek(userId, open.roadmap.id, weekQuestsFor(input), source, now);
    if (froze > 0) invalidate("roadmap");
    return { froze, skipped: null };
  } catch (err) {
    if (isMissingRoadmapTable(err) || isMissingRev4Column(err)) return { froze: 0, skipped: "MISSING_TABLE" };
    console.error("week quests not frozen:", err);
    return { froze: 0, skipped: null, error: questErrorText(err) };
  }
}

// ═══ Finalisation (F14 History) ═════════════════════════════════════════════

/**
 * Writes results and finalizedAt once (UPDATE … WHERE "finalizedAt" IS NULL)
 * for every week that has settled: today ≥ the window's last day (or the
 * close day of a milestone closed mid-week) + WEEK_QUEST_FINAL_LAG_DAYS, so
 * a Sunday session recorded on Monday and a make-up both land first. Rows
 * are questProgress over the closed window; heldAfterFreeze counts its days
 * held by a rest, sick or vacation day declared at or after the set's
 * Monday 04:00 (the days the set's counts could not know). Renders never
 * call this. Never throws: a missing table is `skipped: "MISSING_TABLE"`;
 * any other failure is logged and returned as `error`, with `finalized`
 * counting the weeks written before it (each write is its own guarded
 * UPDATE, so a rerun writes only the rest).
 */
export async function finalizeQuestWeeks(userId: string, now: Date, opts: QuestOpts = {}): Promise<QuestFinalizeRun> {
  if (!lifeWritesEnabled(opts.env)) return { finalized: 0, skipped: "WRITES_OFF" };
  const store = defaultStore(opts);
  let finalized = 0;
  try {
    const today = todayKey(now);
    const rows = await store.questWeeks(userId, { unfinalized: true });
    if (rows.length === 0) return { finalized: 0, skipped: null };
    const facts = await store.milestones(userId, { milestoneIds: [...new Set(rows.map((r) => r.milestoneId))] });
    const goalOf = new Map(facts.map((f) => [f.milestone.id, f.goal]));

    const due = rows.flatMap((row) => {
      const set = setOfStored(row);
      const win = questWindowOf(set);
      const goal = goalOf.get(row.milestoneId) ?? null;
      const closeDay = goal ? (goal.closed ? goal.closedDay : goal.archivedDay) : null;
      const closedDay = closeDay != null && closeDay <= win.to ? closeDay : null;
      const to = closedDay != null ? minDay(win.to, closedDay) : win.to;
      return isQuestWeekFinal(to, today) ? [{ row, set, win, closedDay, to }] : [];
    });
    if (due.length === 0) return { finalized: 0, skipped: null };

    const restFrom = due.reduce((d, x) => minDay(d, x.win.from), due[0].win.from);
    const restTo = due.reduce((d, x) => maxDay(d, x.to), due[0].to);
    const [rest, measuredAll] = await Promise.all([
      store.restRows(userId, restFrom, restTo),
      Promise.all(
        due.map(({ set, to }) => {
          const closed = { ...set, quests: set.quests.map((q) => ({ ...q, to: minDay(q.to, to) }) as WeekQuestSpec) };
          return questProgressFor(store, userId, closed);
        })
      ),
    ]);

    for (let i = 0; i < due.length; i++) {
      const { row, set, win, closedDay, to } = due[i];
      const asOf = dayStartOf(set.weekStart);
      const heldThen = heldDaysAsOf(rest, asOf, win.from, to);
      const heldNow = win.from <= to ? heldDaysOf(rest, win.from, to) : new Set<DayKey>();
      let heldAfter = 0;
      for (const d of heldNow) if (!heldThen.has(d)) heldAfter += 1;
      const windowDays = win.from <= to ? daysBetween(win.from, to) + 1 : 0;
      const results = weekQuestResultsOf(set, measuredAll[i].progress, closedDay, heldAfter, Math.max(0, windowDays - heldThen.size));
      finalized += await store.finalizeQuestWeek(row.id, results, now);
    }
    if (finalized > 0) invalidate("roadmap");
    return { finalized, skipped: null };
  } catch (err) {
    if (finalized > 0) invalidate("roadmap");
    if (isMissingRoadmapTable(err)) return { finalized, skipped: "MISSING_TABLE" };
    console.error("week quests not finalised:", err);
    return { finalized, skipped: null, error: questErrorText(err) };
  }
}

// ═══ History (F14, F18) ═════════════════════════════════════════════════════

/**
 * "Past week quests": one line per frozen week of the roadmap except the
 * open milestone's set for this week, newest first (a milestone closed this
 * week keeps its row here). An empty week (held, past due, nothing asked)
 * reads 0 of 0; a week not yet finalised reads "still settling".
 */
export async function loadPastWeeks(userId: string, roadmapId: string, today: DayKey, opts: QuestOpts = {}): Promise<PastWeekView[]> {
  const store = defaultStore(opts);
  try {
    const thisWeek = weekStartKeyOf(today);
    const [rows, active] = await Promise.all([store.questWeeks(userId, { roadmapId }), store.milestones(userId, { active: true })]);
    if (rows.length === 0) return [];
    const open = openOf(active);
    const places = new Map<string, number>();
    const missing = rows.map((r) => r.milestoneId).filter((id) => !active.some((f) => f.milestone.id === id));
    const others = missing.length ? await store.milestones(userId, { milestoneIds: [...new Set(missing)] }) : [];
    for (const f of [...active, ...others]) places.set(f.milestone.id, f.place);
    return rows
      .filter((r) => !(open && r.milestoneId === open.milestone.id && r.weekStart === thisWeek))
      .map((r) => ({ r, place: places.get(r.milestoneId) ?? 0 }))
      .sort((a, b) => (a.r.weekStart < b.r.weekStart ? 1 : a.r.weekStart > b.r.weekStart ? -1 : b.place - a.place))
      .map(({ r, place }) => pastWeekOf(setOfStored(r), resultsOfStored(r), place, today));
  } catch (err) {
    if (!isMissingRoadmapTable(err)) console.error("past week quests not loaded:", err);
    return [];
  }
}

// ═══ The Prisma store ═══════════════════════════════════════════════════════

interface MilestoneSqlRow {
  roadmapId: string;
  roadmapStatus: string;
  roadmapVersion: number;
  fieldId: string | null;
  track: string;
  hoursPerWeek: number;
  intensity: string;
  startPoint: string;
  typicalHours: number | null;
  typicalHoursSource: string | null;
  targetDay: Date;
  practicesAllowed: boolean;
  id: string;
  lineageId: string;
  ord: number;
  title: string;
  status: string;
  version: number;
  startedDay: Date | null;
  dueDay: Date | null;
  feasibility: unknown;
  goalId: string | null;
  createdAt: Date;
  goalRowId: string | null;
  goalDueDay: Date | null;
  goalClosedScore: number | null;
  goalCompletedAt: Date | null;
  goalArchivedAt: Date | null;
  /** Revision 4 (absent when read before the rev-4 migration). */
  depth?: number | null;
  stage?: string | null;
  /** Confirm to unlock (contracts §19): the gate's words and the stored answers (coverage: revision 4). */
  aim?: string | null;
  constraints?: string | null;
  examLabel?: string | null;
  syllabus?: unknown;
  coverage?: unknown;
}

const keyOrNull = (d: Date | null): DayKey | null => (d ? keyOfDateColumn(d) : null);

/** Places among each roadmap's scheduled positions (scheduledPlacesOf: by ord, one per lineage), for every row the query returned. */
function factsOf(rows: readonly MilestoneSqlRow[]): QuestMilestoneFacts[] {
  const byRoadmap = new Map<string, MilestoneSqlRow[]>();
  for (const r of rows) byRoadmap.set(r.roadmapId, [...(byRoadmap.get(r.roadmapId) ?? []), r]);
  const out: QuestMilestoneFacts[] = [];
  for (const list of byRoadmap.values()) {
    const { placeOf: place, of } = scheduledPlacesOf(
      list.map((r) => ({ id: r.id, lineageId: r.lineageId, ord: Number(r.ord), status: r.status, version: Number(r.version) })),
      Number(list[0].roadmapVersion)
    );
    for (const r of list) {
      out.push({
        roadmap: {
          id: r.roadmapId,
          status: r.roadmapStatus,
          fieldId: r.fieldId,
          track: r.track,
          hoursPerWeek: Number(r.hoursPerWeek),
          intensity: r.intensity,
          startPoint: r.startPoint,
          typicalHours: r.typicalHours == null ? null : Number(r.typicalHours),
          typicalHoursSource: r.typicalHoursSource,
          targetDay: keyOfDateColumn(r.targetDay),
          practicesAllowed: r.practicesAllowed,
          depth: r.depth == null ? null : Number(r.depth),
          aim: r.aim ?? null,
          constraints: r.constraints ?? null,
          examLabel: r.examLabel ?? null,
          syllabus: r.syllabus ?? null,
          coverage: r.coverage ?? null,
        },
        milestone: {
          id: r.id,
          lineageId: r.lineageId,
          ord: Number(r.ord),
          title: r.title,
          status: r.status,
          startedDay: keyOrNull(r.startedDay),
          dueDay: keyOrNull(r.dueDay),
          feasibility: r.feasibility,
          goalId: r.goalId,
          version: Number(r.version),
          createdAt: r.createdAt,
          stage: r.stage ?? null,
        },
        goal:
          r.goalId && r.goalRowId
            ? {
                id: r.goalId,
                dueDay: keyOrNull(r.goalDueDay),
                closed: r.goalClosedScore != null,
                closedDay: r.goalClosedScore != null && r.goalCompletedAt ? dayKeyOf(r.goalCompletedAt) : null,
                archivedDay: r.goalArchivedAt ? dayKeyOf(r.goalArchivedAt) : null,
              }
            : null,
        place: place.get(r.id) ?? Number(r.ord),
        of,
      });
    }
  }
  return out;
}

/**
 * The milestone read. With `rev4` it also selects Roadmap.depth and
 * RoadmapMilestone.stage (F-R4-16's legacy test); the store retries without
 * them when the rev-4 migration isn't applied yet (isMissingRev4Column), and
 * every roadmap then reads as legacy.
 */
function milestonesSql(userId: string, scope: { active: true } | { milestoneIds: readonly string[] }, rev4 = true): Prisma.Sql {
  const where =
    "active" in scope
      ? Prisma.sql`r."status" = 'ACTIVE' AND m."status" IN ('PLANNED', 'STARTING', 'STARTED') AND m."version" <= r."version"`
      : Prisma.sql`r."id" IN (SELECT "roadmapId" FROM "public"."RoadmapMilestone" WHERE "id" IN (${Prisma.join([...scope.milestoneIds])}))
          AND ((m."status" IN ('PLANNED', 'STARTING', 'STARTED') AND m."version" <= r."version") OR m."id" IN (${Prisma.join([...scope.milestoneIds])}))`;
  return Prisma.sql`
    SELECT r."id" AS "roadmapId", r."status" AS "roadmapStatus", r."version" AS "roadmapVersion", r."fieldId", r."track",
           r."hoursPerWeek", r."intensity", r."startPoint", r."typicalHours", r."typicalHoursSource", r."targetDay", r."practicesAllowed",
           r."aim", r."constraints", r."examLabel", r."syllabus",
           m."id", m."lineageId", m."ord", m."title", m."status", m."version", m."startedDay", m."dueDay", m."feasibility", m."goalId", m."createdAt",
           t."id" AS "goalRowId", t."dueDay" AS "goalDueDay", t."closedScore" AS "goalClosedScore", t."completedAt" AS "goalCompletedAt", t."archivedAt" AS "goalArchivedAt"
           ${rev4 ? Prisma.sql`, r."depth", m."stage", r."coverage"` : Prisma.empty}
    FROM "public"."RoadmapMilestone" m
    JOIN "public"."Roadmap" r ON r."id" = m."roadmapId"
    LEFT JOIN "public"."TaskTemplate" t ON t."id" = m."goalId" AND t."userId" = r."userId"
    WHERE r."userId" = ${userId} AND ${where}`;
}

function storedOf(r: {
  id: string;
  userId: string;
  roadmapId: string;
  milestoneId: string;
  weekStart: Date;
  dedupeKey: string;
  source: string;
  state: string;
  generator: number;
  quests: Prisma.JsonValue;
  basis: Prisma.JsonValue;
  cappedBy: string | null;
  results: Prisma.JsonValue | null;
  finalizedAt: Date | null;
  createdAt: Date;
}): StoredQuestWeek {
  return { ...r, weekStart: keyOfDateColumn(r.weekStart) };
}

/** The declared fallback while throughput can't be read: hours × 60 × DECLARED_FACTOR × non-held days ÷ 7, unverified. */
function declaredCapacity(roadmap: QuestRoadmapRow, heldDays: readonly DayKey[]): QuestCapacity {
  const open = Math.max(0, 7 - heldDays.length);
  return { availableMin: (roadmap.hoursPerWeek * 60 * DECLARED_FACTOR * open) / 7, class: "YOURS", calibrating: true };
}

/** The app's store: Prisma, the house's cached loaders, and R2's capacity (throughput as if read on Monday). */
export const prismaQuestStore: QuestStore = {
  async milestones(userId, scope) {
    if ("milestoneIds" in scope && scope.milestoneIds.length === 0) return [];
    try {
      return factsOf(await prisma.$queryRaw<MilestoneSqlRow[]>(milestonesSql(userId, scope)));
    } catch (err) {
      // Before the rev-4 migration: read without depth and stage (every roadmap then reads as legacy).
      if (!isMissingRev4Column(err)) throw err;
      return factsOf(await prisma.$queryRaw<MilestoneSqlRow[]>(milestonesSql(userId, scope, false)));
    }
  },
  async parts(milestoneId) {
    const select = {
      id: true,
      lineageId: true,
      kind: true,
      ord: true,
      label: true,
      origin: true,
      decision: true,
      domainId: true,
      proposedName: true,
      flags: true,
      templateId: true,
      rule: true,
      durationBand: true,
      outOf: true,
      bar: true,
      addToToday: true,
    } as const;
    // The catalog type (revision 4) is what the gate reads (contracts §19); before the rev-4 migration it reads as absent.
    const itemsOf = async (): Promise<QuestItemRow[]> => {
      try {
        return await prisma.roadmapItem.findMany({ where: { milestoneId }, select: { ...select, catalogKey: true } });
      } catch (err) {
        if (!isMissingRev4Column(err)) throw err;
        return prisma.roadmapItem.findMany({ where: { milestoneId }, select });
      }
    };
    const [items, measures] = await Promise.all([
      itemsOf(),
      prisma.roadmapMeasure.findMany({
        where: { milestoneId },
        select: { kind: true, role: true, scope: true, minLevel: true, target: true, baseline: true, rateSource: true, measureKey: true },
      }),
    ]);
    return { items: items.map((i) => ({ ...i, flags: i.flags ?? [] })), measures };
  },
  async templates(userId, ids) {
    const rows = await prisma.taskTemplate.findMany({
      where: { userId, id: { in: [...ids] } },
      select: {
        id: true,
        recurrence: true,
        startDay: true,
        estMinutes: true,
        completedAt: true,
        archivedAt: true,
        // What today-board's placeOf reads to file the task on Today (the row's place).
        kind: true,
        inbox: true,
        compulsory: true,
        dueDay: true,
        dueKind: true,
        planDay: true,
        autoMetric: true,
        closedScore: true,
      },
    });
    return rows.map((r) => ({ ...r, startDay: keyOfDateColumn(r.startDay), dueDay: keyOrNull(r.dueDay), planDay: keyOrNull(r.planDay) }));
  },
  async instances(userId, templateIds, from, to) {
    const rows = await prisma.taskInstance.findMany({
      where: { userId, templateId: { in: [...templateIds] }, day: { gte: dateColumn(from), lte: dateColumn(to) } },
      select: { templateId: true, day: true, status: true, repaired: true, createdAt: true, source: true },
    });
    return rows.map((r) => ({ ...r, day: keyOfDateColumn(r.day) }));
  },
  async domains(ids) {
    return prisma.domain.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, fieldId: true } });
  },
  async cards(domainIds, createdBefore) {
    return prisma.idea.findMany({
      where: { domainId: { in: [...domainIds] }, isArchived: false, createdAt: { lt: createdBefore } },
      select: { id: true, domainId: true, level: true, dueDate: true, graceEndsAt: true, createdAt: true, questionType: true },
    });
  },
  async lastReadingBefore(userId, measureKey, day) {
    const r = await prisma.roadmapReading.findFirst({
      where: { userId, measureKey, day: { lt: dateColumn(day) } },
      orderBy: { day: "desc" },
      select: { day: true, value: true },
    });
    return r ? { day: keyOfDateColumn(r.day), value: r.value } : null;
  },
  async readingOn(userId, measureKey, day) {
    const r = await prisma.roadmapReading.findUnique({
      where: { userId_measureKey_day: { userId, measureKey, day: dateColumn(day) } },
      select: { day: true, value: true },
    });
    return r ? { day: keyOfDateColumn(r.day), value: r.value } : null;
  },
  async readingsBetween(userId, measureKey, from, to) {
    const rows = await prisma.roadmapReading.findMany({
      where: { userId, measureKey, day: { gte: dateColumn(from), lte: dateColumn(to) } },
      orderBy: { day: "asc" },
      select: { day: true, value: true },
    });
    return rows.map((r) => ({ day: keyOfDateColumn(r.day), value: r.value }));
  },
  async logDays(userId, prefix, from, to) {
    const rows = await prisma.roadmapReading.findMany({
      where: { userId, measureKey: { startsWith: prefix }, day: from ? { gte: dateColumn(from), lte: dateColumn(to) } : { lte: dateColumn(to) } },
      select: { day: true },
    });
    return rows.map((r) => keyOfDateColumn(r.day));
  },
  async countAdded(domainIds, from, to) {
    return prisma.idea.count({ where: { domainId: { in: [...domainIds] }, isArchived: false, createdAt: { gte: from, lt: to } } });
  },
  async addedByDomain(domainIds, from, to) {
    const rows = await prisma.idea.groupBy({
      by: ["domainId"],
      where: { domainId: { in: [...domainIds] }, isArchived: false, createdAt: { gte: from, lt: to }, questionType: { notIn: [...NON_RECALL_TYPES] } },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) out[r.domainId] = r._count._all;
    return out;
  },
  async reviewRows(userId, ideaIds, from) {
    if (ideaIds.length === 0) return [];
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: "REVIEW", sourceId: { in: [...ideaIds] }, day: { gte: dateColumn(from) } },
      select: { sourceId: true, day: true, occurredAt: true, detail: true },
    });
    return rows.flatMap((r) => (r.sourceId ? [{ ideaId: r.sourceId, day: keyOfDateColumn(r.day), occurredAt: r.occurredAt, detail: r.detail }] : []));
  },
  async restRows(userId, from, to) {
    try {
      const rows = await prisma.restDay.findMany({
        where: { userId, day: { gte: dateColumn(from), lte: dateColumn(to) } },
        select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
      });
      return rows.map((r) => ({ ...r, day: keyOfDateColumn(r.day) }));
    } catch (err) {
      if (isMissingRestDayTable(err)) return [];
      throw err;
    }
  },
  async capacity(userId, roadmap, weekStart) {
    try {
      const throughput = await loadThroughput(userId, addDays(weekStart, -THROUGHPUT_LAG_DAYS));
      return (heldDays) => {
        try {
          const input: RealismInput = {
            today: weekStart,
            targetDay: roadmap.targetDay,
            scopes: [],
            throughput,
            hoursPerWeek: roadmap.hoursPerWeek,
            intensity: roadmap.intensity as Intensity,
            startPoint: roadmap.startPoint as StartPoint,
            typicalHours: roadmap.typicalHours,
            typicalHoursSource: roadmap.typicalHoursSource,
            m: 1,
            heldDays: [...heldDays],
            areaInMaintenance: false,
            practicesAllowed: roadmap.practicesAllowed,
            trackArea: roadmap.fieldId == null,
          };
          const a = availableFor(weekStart, input);
          return { availableMin: a.minutes, class: a.class, calibrating: a.unverified || a.class === "YOURS" };
        } catch {
          return declaredCapacity(roadmap, heldDays);
        }
      };
    } catch {
      return (heldDays) => declaredCapacity(roadmap, heldDays);
    }
  },
  async quotas(userId, weekStart) {
    const rows = await loadWeeklyQuotas(userId, dayStartOf(weekStart));
    return rows.map((q) => ({ fieldId: q.fieldId, name: q.fieldName, quota: q.quota }));
  },
  async intervalMultiplier(userId) {
    const { loadModifiers } = await import("./skill-effects");
    return (await loadModifiers(userId)).intervalMultiplier;
  },
  async reachLoadout(userId) {
    const { loadModifiers } = await import("./skill-effects");
    const mods = await loadModifiers(userId);
    return { intervalMultiplier: mods.intervalMultiplier, extraStrikes: mods.extraStrikes, graceExtraDays: mods.graceExtraDays };
  },
  async acceptanceMultiplier(userId, roadmapId) {
    const a = await prisma.roadmapAcceptance.findFirst({ where: { roadmapId, undoneAt: null, roadmap: { userId } }, orderBy: acceptanceOrderBy(), select: { intervalMultiplier: true } });
    return a ? a.intervalMultiplier : null;
  },
  async questWeeks(userId, filter) {
    const rows = await prisma.roadmapQuestWeek.findMany({
      where: {
        userId,
        ...(filter.roadmapId ? { roadmapId: filter.roadmapId } : {}),
        ...(filter.unfinalized ? { finalizedAt: null } : {}),
        ...(filter.weekStart ? { weekStart: dateColumn(filter.weekStart) } : {}),
      },
      orderBy: { weekStart: "desc" },
    });
    return rows.map(storedOf);
  },
  async insertQuestWeek(userId, roadmapId, set, source, now) {
    return questWeekInsertOp(userId, roadmapId, set, source, now);
  },
  async finalizeQuestWeek(id, results, now) {
    const r = await prisma.roadmapQuestWeek.updateMany({
      where: { id, finalizedAt: null },
      data: { results: results as unknown as Prisma.InputJsonValue, finalizedAt: now },
    });
    return r.count;
  },
};

/** Exported for the checks: the open milestone among a store's facts. */
export const openMilestoneOf = openOf;
