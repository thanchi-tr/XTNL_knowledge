import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { dueCutoff } from "./due";
import { activityOp, isDuplicateActivity, recordActivity } from "./activity";
import {
  addDays,
  dateColumn,
  dayKeyOf,
  dayStartOf,
  keyOfDateColumn,
  monthKeyOf,
  todayKey,
  weekStartKeyOf,
  type DayKey,
} from "./life-day";
import {
  CAPTURE_BATCH_MAX,
  CAPTURE_UNDO_MS,
  type ActivitySource,
  type AutoMetric,
  type Band,
  type BoardPlace,
  type CaptureSource,
  type Category,
  type DueKind,
  type GradeSource,
  type Horizon,
  type InstanceSource,
  type InstanceStatus,
  type KrMetric,
  type ParsedCapture,
  type Receipt,
  type Sink,
  type TaskKind,
  type Track,
} from "./life-types";
import type { Attribute } from "@prisma/client";
import { SIZING_PENDING_MS, isGradeFrozen, normTitleOf, sizeLexically, titleMatchesKey } from "./life-lexicon";
import {
  EST_MINUTES_MAX,
  SIZING_MAX_ATTEMPTS,
  clampBandOverride,
  isTrack,
  selfRatingOpen,
  selfRatingOpensOn,
  toBand,
} from "./life-grade";
import { cleanCaptureKey, matchParentGoal, parseCapture } from "./capture-parse";
import type { GoalProgressRow } from "./goals";
import { captureShapeOf } from "./capture-shape";
import { occursOn } from "./recurrence";
import { statedGoalMp } from "./life-economy";
import { MAKEUP_RESTORE_EVERY_DAYS, dutyLaunchDay, freezeUseKey, isDutyLaunched, newLifeSettingsData } from "./duty-economy";
import { HELD_SOURCES } from "./streak-curve";
import { heldDaysOf, parsePendingChange, type DutyTemplate, type RestRow } from "./duty-rule";
import {
  MAKE_UP_UNDO_ELSEWHERE,
  dutyBoardOf,
  isSettledDayFor,
  needsSettledGuard,
  planClarifyRule,
  planRuleEdit,
  settledTickMessage,
  settledUndoMessage,
  tickRefusalOf,
  yesterdayMustsOf,
  type DutyBoardFacts,
  type OwedRow,
  type RuleEdit,
  type RuleRow,
  type RuleWrite,
} from "./duty-plan";
import { DUTY_READ_AHEAD_DAYS, DUTY_READ_BACK_DAYS, type DutyBoard, type SettledFact } from "./duty-view";
import { isMissingRestDayTable } from "./rest-rules";
import { loadRoadmapGoalSeries } from "./roadmap-readings";
import { isMissingRoadmapTable, isRoadmapCaptureKey, isSupersededRow, type PositionRow } from "./roadmap-types";
import {
  EpochSet,
  HISTORY_DAYS,
  boardStreakOptionsOf,
  STUDY_METRICS,
  UNDO_WINDOW_MS,
  buildBoard,
  canUndo,
  completionBlockOf,
  describeTemplate,
  goalMetricOf,
  goalProgressQty,
  groupKeyOf,
  horizonFor,
  isDoneStatus,
  lastDoneOf,
  moveBlockOf,
  paidIntroOf,
  placeOf,
  placementOf,
  planAutoCompletions,
  planCompletion,
  roadmapGoalIdsOf,
  ruleOf,
  shortDate,
  statsFor,
  streakDaysFor,
  taskEventInput,
  undoEventInput,
  weekdayName,
  type BoardData,
  type BoardInstance,
  type BoardTemplate,
  type DayLedger,
  type InboxChoice,
  type LedgerCompletion,
  type PaidRecord,
  type TemplateStats,
} from "./today-board";

export type { InboxChoice } from "./today-board";

/**
 * The task engine's server side: capture, completion, undo, skip, and the
 * Today board's one read wave.
 *
 * ── Shape of every write ─────────────────────────────────
 * One read wave (independent reads issued together), then one
 * `$transaction([...])` array: the instance, its ledger row and the template
 * touch-ups commit or fail together. There is no interactive transaction —
 * each round trip costs 160-800 ms here, and an array needs none of them to
 * be sequential. Idempotency comes from unique keys rather than from reading
 * first: a TASK row's dedupe key is `task:<tpl>:<day>:<slot>:<attempt>`, the
 * instance is unique on (template, day, slot), and a P2002 on either means
 * the tick is already recorded, so the stored receipt is returned. A double
 * tap therefore writes one row.
 *
 * ── Concurrent completions ───────────────────────────────
 * A price reads the day's ledger (the knee base, repeat decay, the INTRO
 * count), so two completions priced against the same read would both pay
 * as if first — N parallel ticks could pay N full prices past the knee's
 * 300 a day. Each completion's array therefore opens with a per-user
 * advisory lock (transaction-scoped: it releases at commit) and a guard
 * that fails the transaction, by a division by zero, if the day's knee rows
 * are not the ones the price was read against (or a one-off was completed
 * meanwhile). A failed guard re-reads and re-prices, a few times at most.
 * Completions are therefore serial per player, each priced against every
 * one before it, and the day always totals g(ΣR) — still one array, still
 * no interactive transaction.
 *
 * ── Prices ───────────────────────────────────────────────
 * Every completion is priced by `planCompletion` in today-board.ts against
 * the day's ledger as read in the same wave, which is the same function and
 * the same inputs the board used to print the row's '≈ N XP'. Past rows are
 * never repriced; an undo is a new, negating row.
 *
 * ── Instances are lazy ───────────────────────────────────
 * Nothing here pre-creates an expected occurrence. A TaskInstance exists
 * only once someone acts on it (a tick, a skip) or, from M2, once
 * settlement judges it. What is due is a pure function of the rule and the
 * day (recurrence.ts), evaluated on read.
 */

export type LifeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): LifeResult<T> => ({ ok: true, value });
const fail = <T>(error: string): LifeResult<T> => ({ ok: false, error });

// ── Rows ──────────────────────────────────────────────────────────────────

const TEMPLATE_SELECT = {
  id: true,
  title: true,
  normTitle: true,
  kind: true,
  inbox: true,
  recurrence: true,
  startDay: true,
  dueDay: true,
  dueKind: true,
  planDay: true,
  horizon: true,
  parentId: true,
  krMetric: true,
  krTarget: true,
  krUnit: true,
  compulsory: true,
  compulsoryOnRest: true,
  pendingChange: true,
  intrinsic: true,
  mvv: true,
  mvvMinutes: true,
  autoMetric: true,
  autoTarget: true,
  track: true,
  category: true,
  band: true,
  lexicalBand: true,
  aiBand: true,
  bandOverride: true,
  bandOverrideAt: true,
  estMinutes: true,
  machineMinutes: true,
  composition: true,
  gradeSource: true,
  gradeConfidence: true,
  gradeBasis: true,
  gradeModel: true,
  gradePromptVersion: true,
  gradeAttempts: true,
  gradeFrozenAt: true,
  note: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  sortOrder: true,
  goalMp: true,
  closedScore: true,
  // Roadmap (F16 seam 3): a roadmap goal is 'rm:<milestoneId>', its practices and steps 'rm:<id>:p<i>' / ':s<i>'.
  captureKey: true,
} satisfies Prisma.TaskTemplateSelect;

/** What every template read selects. Exported for duty.ts (the make-up's pricing read). */
export { TEMPLATE_SELECT };

export type TemplateRow = Prisma.TaskTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;

const INSTANCE_SELECT = {
  id: true,
  templateId: true,
  day: true,
  slot: true,
  status: true,
  source: true,
  xpPaid: true,
  repaired: true,
} satisfies Prisma.TaskInstanceSelect;

type InstanceRow = Prisma.TaskInstanceGetPayload<{ select: typeof INSTANCE_SELECT }>;

const asBand = (s: string | null | undefined): Band => toBand(s);
const asTrack = (s: string | null | undefined): Track => (isTrack(s) ? s : "DUTY");
const keyOrNull = (d: Date | null): DayKey | null => (d ? keyOfDateColumn(d) : null);

/** The strongest attribute in a stored composition, for the row's colour dot. */
function topAttributeOf(composition: Prisma.JsonValue): Attribute | null {
  if (!composition || typeof composition !== "object" || Array.isArray(composition)) return null;
  let best: Attribute | null = null;
  let weight = 0;
  for (const [attribute, w] of Object.entries(composition)) {
    if (typeof w === "number" && w > weight) {
      best = attribute as Attribute;
      weight = w;
    }
  }
  return best;
}

export function toBoardTemplate(r: TemplateRow, now: Date): BoardTemplate {
  const age = now.getTime() - r.createdAt.getTime();
  const gradeFrozen = isGradeFrozen(r, now);
  return {
    id: r.id,
    title: r.title,
    normTitle: r.normTitle,
    kind: r.kind as TaskKind,
    inbox: r.inbox,
    recurrence: r.recurrence,
    startDay: keyOfDateColumn(r.startDay),
    dueDay: keyOrNull(r.dueDay),
    dueKind: (r.dueKind as DueKind | null) ?? null,
    planDay: keyOrNull(r.planDay),
    horizon: (r.horizon as Horizon | null) ?? null,
    parentId: r.parentId,
    krMetric: (r.krMetric as KrMetric | null) ?? null,
    krTarget: r.krTarget,
    krUnit: r.krUnit,
    compulsory: r.compulsory,
    // M2: 'Even on rest days' (the drawer's pill; ruleOn reads it per day).
    compulsoryOnRest: r.compulsoryOnRest,
    intrinsic: r.intrinsic,
    mvv: r.mvv,
    autoMetric: (r.autoMetric as AutoMetric | null) ?? null,
    autoTarget: r.autoTarget,
    track: asTrack(r.track),
    category: r.category as Category,
    band: asBand(r.band),
    lexicalBand: asBand(r.lexicalBand),
    aiBand: r.aiBand ? asBand(r.aiBand) : null,
    bandOverride: r.bandOverride,
    bandOverrideAt: r.bandOverrideAt?.toISOString() ?? null,
    gradeFrozenAt: r.gradeFrozenAt?.toISOString() ?? null,
    estMinutes: r.estMinutes,
    machineMinutes: r.machineMinutes,
    gradeSource: r.gradeSource as GradeSource,
    gradeConfidence: r.gradeConfidence,
    gradeBasis: r.gradeBasis,
    gradeModel: r.gradeModel,
    gradePromptVersion: r.gradePromptVersion,
    gradeAttempts: r.gradeAttempts,
    gradeFrozen,
    // life-lexicon.ts's 'sizing…': a lexical grade minutes old whose one AI
    // call has not landed yet. A renamed title is never sized, so never pending,
    // and neither is a plan-born task ('rm:…'): no model sizes one (decision 50).
    sizing:
      r.gradeSource === "LEXICAL" &&
      !isRoadmapCaptureKey(r.captureKey) &&
      !gradeFrozen &&
      r.bandOverride === 0 &&
      r.gradeAttempts === 0 &&
      age >= 0 &&
      age <= SIZING_PENDING_MS &&
      titleMatchesKey(r),
    topAttribute: topAttributeOf(r.composition),
    note: r.note,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    sortOrder: r.sortOrder,
    goalMp: r.goalMp,
    closedScore: r.closedScore,
    // M2: the rule over time (duty-rule.ts ruleOn reads it per day).
    pendingChange: parsePendingChange(r.pendingChange),
    // Roadmap (F16 seam 3): the capture key, so the board can tell a roadmap row ('rm:…') from the rest.
    captureKey: r.captureKey,
  };
}

/** A template row as duty-rule.ts reads its rule (ruleOn, expectedOn, mustsDueOn). */
function dutyTemplateOf(r: TemplateRow): DutyTemplate & { id: string } {
  return {
    id: r.id,
    kind: r.kind,
    recurrence: r.recurrence,
    startDay: keyOfDateColumn(r.startDay),
    dueDay: keyOrNull(r.dueDay),
    dueKind: r.dueKind,
    compulsory: r.compulsory,
    compulsoryOnRest: r.compulsoryOnRest,
    inbox: r.inbox,
    archivedDay: r.archivedAt ? dayKeyOf(r.archivedAt) : null,
    pendingChange: r.pendingChange,
  };
}

function toBoardInstance(i: InstanceRow): BoardInstance {
  return {
    id: i.id,
    templateId: i.templateId,
    day: keyOfDateColumn(i.day),
    slot: i.slot,
    status: i.status as InstanceStatus,
    source: i.source as InstanceSource,
    xpPaid: i.xpPaid,
    // M2: a make-up inside the restore window ('12 days · repaired').
    repaired: i.repaired,
  };
}

// ── The day's ledger, in two queries ──────────────────────────────────────

export interface TaskEventRow {
  id: string;
  day: Date;
  source: string;
  sink: string;
  track: string | null;
  templateId: string | null;
  sourceId: string | null;
  xp: number;
  rawXp: number | null;
  occurredAt: Date;
  dedupeKey: string | null;
  receipt: Prisma.JsonValue;
  normTitle: string | null;
  title: string | null;
  band: string | null;
  bandOverride: number | null;
}

export interface DayTotalRow {
  day: Date;
  source: string;
  sink: string;
  n: number;
  /** Rows of this group carrying a rawXp: the knee rows beyond TASK and UNDO. */
  nraw: number;
  xp: number;
  raw: number;
  qty: number | null;
  /** M2: the group's net streak units (streak.ts's CASE: countsForStreak +1, UNDO −1), for the freeze state. */
  units: number;
}

const daysSql = (days: DayKey[]) => Prisma.join(days.map((d) => Prisma.sql`${d}::date`));

/**
 * The day's TASK and UNDO rows, each joined to its template's normTitle and
 * band: what repeat decay (D) and the INTRO count (V) read, and what an undo
 * negates.
 */
export function readDayTaskEvents(userId: string, days: DayKey[]): Promise<TaskEventRow[]> {
  return prisma.$queryRaw<TaskEventRow[]>`
    SELECT e."id", e."day", e."source", e."sink", e."track", e."templateId", e."sourceId",
           e."xp", e."rawXp", e."occurredAt", e."dedupeKey", e."receipt",
           t."normTitle", t."title", t."band", t."bandOverride"
    FROM "ActivityEvent" e
    LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
    WHERE e."userId" = ${userId} AND e."day" IN (${daysSql(days)}) AND e."source" IN ('TASK', 'UNDO')
    ORDER BY e."occurredAt" ASC, e."id" ASC
  `;
}

/** Per day, source and sink: count, Σ xp, Σ rawXp and the DAY_OPEN qty. The knee base, the tiles and the quest read these. */
export function readDayTotals(userId: string, days: DayKey[]): Promise<DayTotalRow[]> {
  return prisma.$queryRaw<DayTotalRow[]>`
    SELECT "day", "source", "sink",
           COUNT(*)::int AS n,
           COUNT("rawXp")::int AS nraw,
           COALESCE(SUM("xp"), 0)::float8 AS xp,
           COALESCE(SUM("rawXp"), 0)::float8 AS raw,
           MAX("qty")::float8 AS qty,
           COALESCE(SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END), 0)::int AS units
    FROM "ActivityEvent"
    WHERE "userId" = ${userId} AND "day" IN (${daysSql(days)})
    GROUP BY "day", "source", "sink"
    ORDER BY "day", "source", "sink"
  `;
}

/**
 * How many rows a day's price reads: every TASK and UNDO row (repeat decay,
 * the INTRO count) and any other row carrying a rawXp (the knee base). The
 * ledger is append-only, so an unchanged count is an unchanged ledger — the
 * completion guard compares against this.
 */
export function kneeRowsOf(day: DayKey, totals: readonly DayTotalRow[]): number {
  return totals
    .filter((r) => keyOfDateColumn(r.day) === day)
    .reduce((s, r) => s + (r.source === "TASK" || r.source === "UNDO" ? r.n : r.nraw), 0);
}

/** Ids of TASK rows an UNDO has negated ('undo:<eventId>'). */
function undoneIds(events: readonly TaskEventRow[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.source === "UNDO" && e.dedupeKey?.startsWith("undo:")) out.add(e.dedupeKey.slice(5));
  }
  return out;
}

export function ledgerOf(day: DayKey, totals: readonly DayTotalRow[], events: readonly TaskEventRow[]): DayLedger {
  const tot = totals.filter((r) => keyOfDateColumn(r.day) === day);
  const evs = events.filter((e) => keyOfDateColumn(e.day) === day);
  const undone = undoneIds(evs);
  const completions: LedgerCompletion[] = evs
    .filter((e) => e.source === "TASK" && !undone.has(e.id))
    .map((e) => {
      // The band the row was *paid* as, from its own receipt (paidIntroOf):
      // a later self-rating of its template cannot take it out of today's
      // INTRO count.
      const template = e.band != null ? { band: asBand(e.band), bandOverride: e.bandOverride ?? 0 } : null;
      return {
        eventId: e.id,
        templateId: e.templateId,
        groupKey: e.normTitle != null ? groupKeyOf({ normTitle: e.normTitle, title: e.title ?? "" }) : `tpl:${e.templateId ?? e.id}`,
        intro: paidIntroOf(e.receipt, template),
        raw: e.rawXp ?? 0,
        xp: e.xp,
        sink: e.sink as Sink,
      };
    });
  const sum = (pick: (r: DayTotalRow) => number, where: (r: DayTotalRow) => boolean = () => true) =>
    tot.filter(where).reduce((s, r) => s + pick(r), 0);
  const dayOpen = tot.find((r) => r.source === "DAY_OPEN");
  return {
    day,
    rawBefore: sum((r) => r.raw),
    lifeXp: sum((r) => r.xp, (r) => r.sink === "TRACK"),
    completions,
    reviews: sum((r) => r.n, (r) => r.source === "REVIEW"),
    reviewXp: sum((r) => r.xp, (r) => r.source === "REVIEW"),
    ideas: sum((r) => r.n, (r) => r.source === "IDEA_CREATE"),
    dayOpenQty: dayOpen?.qty ?? null,
  };
}

/** The TASK row that paid each instance, latest first wins. */
function paidOf(events: readonly TaskEventRow[]): Record<string, PaidRecord> {
  const undone = undoneIds(events);
  const out: Record<string, PaidRecord> = {};
  for (const e of events) {
    if (e.source !== "TASK" || !e.sourceId) continue;
    out[e.sourceId] = {
      eventId: e.id,
      instanceId: e.sourceId,
      receipt: (e.receipt as unknown as Receipt | null) ?? null,
      occurredAt: e.occurredAt.toISOString(),
      xp: e.xp,
      undone: undone.has(e.id),
    };
  }
  return out;
}

// ── In-process memos that a reset must clear ──────────────────────────────

let memoEpochSeq = 0;
/** Long enough to outlive any process: only invalidateAll() (a reset) drops it. */
const MEMO_EPOCH_TTL_MS = 365 * 86_400_000;

/**
 * An epoch that changes whenever the whole cache is dropped — the resets
 * and re-attribution call invalidateAll(). It is cached with no tags, so an
 * ordinary write never touches it. The memos below are keyed to it, so a
 * reset that deletes DAY_OPEN rows or study completions also forgets that
 * this process wrote them.
 */
function memoEpoch(): Promise<number> {
  return cached("lifeMemoEpoch", [], async () => ++memoEpochSeq, MEMO_EPOCH_TTL_MS);
}

// ── The board read ────────────────────────────────────────────────────────

type BoardCore = Omit<BoardData, "dueNow">;

/** The board core's one read: the board itself, its Duty part (BoardData.duty, M2) and yesterday's open musts (TodayCounts). */
interface BoardCoreRead {
  core: BoardCore;
  duty: DutyBoard;
  yesterdayMusts: number;
}

/** The settlement rows a YesterdaySettled notice reads (duty-view.ts SettledFact). */
const SETTLED_SOURCES = ["DEBT", "FREEZE_EARN", "FREEZE_USE", "FULL_DAY", "REPAIR"];
const FREEZE_SOURCES = ["FREEZE_EARN", "FREEZE_USE"];

async function readBoardCore(userId: string, today: DayKey, now: Date): Promise<BoardCoreRead> {
  const yesterday = addDays(today, -1);
  // M2 reads. Open debts are read whatever the launch says (a rollback of
  // DUTY_LAUNCH_DAY must never strand a debt card, decision 2); the rest,
  // the freezes and the settled facts only once Duty has a launch day.
  const launchDay = dutyLaunchDay();
  const dutyOn = launchDay != null;
  const restoreFrom = dayStartOf(addDays(today, -(MAKEUP_RESTORE_EVERY_DAYS - 1)));
  const [settings, templateRows, instanceRows, totals, events, goalQtyRows, debtRows, restRows, dutyRows] = await Promise.all([
    prisma.lifeSettings.findUnique({
      where: { userId },
      select: { dailyCapacityMin: true, capacitySetAt: true, settledThroughDay: true, epochDay: true, debtWriteOff: true },
    }),
    prisma.taskTemplate.findMany({
      where: {
        userId,
        archivedAt: null,
        // Open work, anything finished since yesterday began (so it can be
        // seen ticked and undone), and every goal's children for its rollup.
        OR: [{ completedAt: null }, { completedAt: { gte: dayStartOf(yesterday) } }, { parentId: { not: null } }],
      },
      select: TEMPLATE_SELECT,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.taskInstance.findMany({
      where: { userId, day: { gte: dateColumn(addDays(today, -HISTORY_DAYS)) } },
      select: INSTANCE_SELECT,
    }),
    // The day before yesterday too: the freeze state reads its streak units (M2).
    readDayTotals(userId, [addDays(today, -2), yesterday, today]),
    readDayTaskEvents(userId, [yesterday, today]),
    // By goal and life day: goalProgress measures as of min(today, due day).
    prisma.activityEvent.groupBy({
      by: ["templateId", "day"],
      where: { userId, source: "GOAL_PROGRESS" },
      _sum: { qty: true },
    }),
    // M2, one query: every open debt with its template, archived ones
    // included (F12's owed cards), and the restores spent in (today − 7,
    // today] — one per template (MAKEUP_RESTORE_EVERY_DAYS).
    prisma.taskInstance.findMany({
      where: { userId, OR: [{ debtOpen: true }, { repaired: true, completedAt: { gte: restoreFrom } }] },
      select: {
        id: true,
        templateId: true,
        day: true,
        slot: true,
        debtXp: true,
        debtOpen: true,
        repaired: true,
        completedAt: true,
        template: { select: TEMPLATE_SELECT },
      },
      orderBy: [{ day: "asc" }, { slot: "asc" }],
    }),
    // A launch day set before the life_duty migration is applied (F20's
    // order broken) reads no rest rather than failing the board.
    dutyOn
      ? prisma.restDay
          .findMany({
            where: { userId, day: { gte: dateColumn(addDays(today, -DUTY_READ_BACK_DAYS)), lte: dateColumn(addDays(today, DUTY_READ_AHEAD_DAYS)) } },
            select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
          })
          .catch((err: unknown) => {
            if (!isMissingRestDayTable(err)) throw err;
            console.error("Today board: the RestDay table is missing (apply life_duty); reading no rest.");
            return [];
          })
      : Promise.resolve([]),
    // M2, one query: every freeze and repair row (the balance is all
    // history, the repair hint the latest; a few a month at most) and the
    // settlement rows of the last settled days.
    dutyOn
      ? prisma.activityEvent.findMany({
          where: {
            userId,
            OR: [
              { source: { in: FREEZE_SOURCES } },
              { source: "REPAIR" },
              { source: { in: SETTLED_SOURCES }, day: { gte: dateColumn(addDays(today, -4)), lte: dateColumn(yesterday) } },
            ],
          },
          select: { source: true, day: true, xp: true, qty: true, templateId: true, dedupeKey: true },
        })
      : Promise.resolve([]),
  ]);

  const templates = templateRows.map((r) => toBoardTemplate(r, now));
  const instances = instanceRows.map(toBoardInstance);
  const byTpl = new Map<string, BoardInstance[]>();
  for (const i of instances) {
    const list = byTpl.get(i.templateId);
    if (list) list.push(i);
    else byTpl.set(i.templateId, [i]);
  }
  const ledgerToday = ledgerOf(today, totals, events);

  // ── Duty (M2): BoardData.duty and yesterday's open musts ──
  const cursor = settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null;
  const countOf = (source: string) => dutyRows.filter((r) => r.source === source).length;
  const settledFrom = addDays(today, -4);
  const settledRows = dutyRows.filter((r) => {
    const d = keyOfDateColumn(r.day);
    return SETTLED_SOURCES.includes(r.source) && d >= settledFrom && d <= yesterday;
  });
  // Net streak units and held days from the day totals (streak.ts's CASE and HELD_SOURCES).
  const heldSources = new Set<string>(HELD_SOURCES);
  const units: Record<DayKey, number> = {};
  const heldByLedger = new Set<DayKey>();
  for (const r of totals) {
    const d = keyOfDateColumn(r.day);
    units[d] = (units[d] ?? 0) + (r.units ?? 0);
    if (heldSources.has(r.source) && r.n > 0) heldByLedger.add(d);
  }
  const facts: DutyBoardFacts = {
    today,
    launchDay,
    cursor,
    epochDay: settings?.epochDay ? keyOfDateColumn(settings.epochDay) : null,
    debtWriteOff: !!settings?.debtWriteOff,
    owed: debtRows
      .filter((o) => o.debtOpen)
      .map(
        (o): OwedRow => ({
          instanceId: o.id,
          day: keyOfDateColumn(o.day),
          slot: o.slot,
          debtXp: o.debtXp,
          template: { ...toBoardTemplate(o.template, now), archived: !!o.template.archivedAt, mvvMinutes: o.template.mvvMinutes },
        })
      ),
    instances: instanceRows.map((i) => ({ templateId: i.templateId, day: keyOfDateColumn(i.day), status: i.status, repaired: i.repaired })),
    repairedRecently: new Set(debtRows.filter((r) => r.repaired && r.completedAt && r.completedAt >= restoreFrom).map((r) => r.templateId)),
    ledger: ledgerToday,
    restRows: restRows.map((r): RestRow => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt })),
    freezeEarned: countOf("FREEZE_EARN"),
    freezeUsed: countOf("FREEZE_USE"),
    units,
    heldByLedger,
    freezeUsedYesterday: settledRows.some((r) => r.source === "FREEZE_USE" && keyOfDateColumn(r.day) === yesterday),
    templates: templateRows.map(dutyTemplateOf),
    lastRepairDay: dutyRows.reduce<DayKey | null>((last, r) => {
      if (r.source !== "REPAIR") return last;
      const d = keyOfDateColumn(r.day);
      return last == null || d > last ? d : last;
    }, null),
    settledRows: settledRows.map(
      (r): SettledFact => ({
        source: r.source as ActivitySource,
        day: keyOfDateColumn(r.day),
        xp: r.xp,
        qty: r.qty,
        templateId: r.templateId,
        dedupeKey: r.dedupeKey,
      })
    ),
  };
  const duty = dutyBoardOf(facts);
  const yesterdayMusts = yesterdayMustsOf({ ...facts, instances });

  // The habit reads take the cursor and the held days once Duty is live
  // (decision 15): an unsettled day reads pending, a held day held, so no
  // row shows a break settlement has not judged (today-board
  // boardStreakOptionsOf; before launch, M1/M5 exactly).
  const streakCtx = {
    live: duty.live,
    cursor,
    restDays: heldDaysOf(facts.restRows, addDays(today, -DUTY_READ_BACK_DAYS), today),
    freezeDays: new Set(dutyRows.filter((r) => r.source === "FREEZE_USE").map((r) => keyOfDateColumn(r.day))),
  };
  const stats: Record<string, TemplateStats> = {};
  for (const t of templates) {
    const rule = ruleOf(t);
    if (rule) stats[t.id] = statsFor(t, rule, byTpl.get(t.id) ?? [], today, boardStreakOptionsOf(t, streakCtx));
  }

  // The browser needs only the current period's instances (TARGET progress
  // reads the month or week, the lanes read today and yesterday); history
  // stays on the server, already folded into `stats`.
  const monthStart = `${monthKeyOf(today)}-01`;
  const weekStart = weekStartKeyOf(today);
  const recentFrom = [monthStart, weekStart, yesterday].sort()[0];

  const { goalQty, goalDays } = goalProgressOf(goalQtyRows, templates);

  const core: BoardCore = {
    today,
    yesterday,
    capacityMin: settings?.dailyCapacityMin ?? 240,
    capacitySet: !!settings?.capacitySetAt,
    templates,
    instances: instances.filter((i) => i.day >= recentFrom),
    stats,
    ledger: { today: ledgerToday, yesterday: ledgerOf(yesterday, totals, events) },
    paid: paidOf(events),
    goalQty,
    goalDays,
  };
  return { core, duty, yesterdayMusts };
}

/**
 * Σ GOAL_PROGRESS per goal (goalQty, every goal) and per open goal per life
 * day (goalDays: only goals on the board, so a closed goal's history is not
 * sent), from one groupBy over (templateId, day).
 */
function goalProgressOf(
  rows: readonly { templateId: string | null; day: Date; _sum: { qty: number | null } }[],
  templates: readonly BoardTemplate[]
): { goalQty: Record<string, number>; goalDays: Record<string, GoalProgressRow[]> } {
  const open = new Set(templates.filter((t) => t.kind === "GOAL" && t.closedScore == null).map((t) => t.id));
  const goalQty: Record<string, number> = {};
  const goalDays: Record<string, GoalProgressRow[]> = {};
  for (const r of rows) {
    if (!r.templateId) continue;
    const qty = r._sum.qty ?? 0;
    goalQty[r.templateId] = (goalQty[r.templateId] ?? 0) + qty;
    if (open.has(r.templateId)) (goalDays[r.templateId] ??= []).push({ day: keyOfDateColumn(r.day), qty });
  }
  for (const list of Object.values(goalDays)) list.sort((a, b) => a.day.localeCompare(b.day));
  return { goalQty, goalDays };
}

function loadBoardCore(userId: string, day: DayKey, now: Date): Promise<BoardCoreRead> {
  return cached(`boardCore:${userId}:${day}`, ["life", "activity"], () => readBoardCore(userId, day, now));
}

function countDue(now: Date): Promise<number> {
  // `dueCutoff`, as the review queue and the nav button use it, so the quest
  // and the queue it opens agree about what is due.
  return prisma.idea.count({ where: { isArchived: false, dueDate: { lte: dueCutoff(now) } } });
}

/**
 * The review queue's size for a life day. dueCutoff is fixed for the whole
 * day, so one cached count per day serves the board, the nav and the bell;
 * reviews and new Ideas invalidate it.
 */
function loadDueNow(day: DayKey, now: Date): Promise<number> {
  return cached(`lifeDueNow:${day}`, ["ideas", "activity"], () => countDue(now));
}

/**
 * Everything the Today board is built from, for one life day: templates,
 * recent instances, per-habit history folded into stats, the day's ledger
 * and the review queue's size. Cached per day under the life, activity and
 * ideas tags, since a review changes the quest and a tick changes the rest,
 * and under 'roadmap' for the open roadmap goals' stored series.
 */
export async function loadTodayBoard(userId: string, day: DayKey, now: Date = new Date()): Promise<BoardData> {
  return cached(`today:${userId}:${day}`, ["life", "activity", "ideas", "roadmap"], async () => {
    const [read, dueNow] = await Promise.all([loadBoardCore(userId, day, now), loadDueNow(day, now)]);
    // M2: BoardData.duty (duty-view.ts DutyBoard), read in the same wave.
    // Roadmap (F16 seam 3): BoardData.roadmapGoals, the stored series of the open ROADMAP goals.
    const roadmapGoals = await loadBoardRoadmapGoals(userId, read.core.templates, day);
    return { ...read.core, dueNow, duty: read.duty, roadmapGoals };
  });
}

/**
 * BoardData.roadmapGoals (roadmap.md F16 seam 3): the open ROADMAP goals'
 * stored series, with ord and of ("Roadmap · milestone 2 of 3"), the zero
 * reason and the reset note (roadmap-readings loadRoadmapGoalSeries). One
 * query, and only when such a goal is open (today-board roadmapGoalIdsOf;
 * none while ROADMAP_GOALS_LIVE is off), so every other board pays nothing.
 * A missing table (life_roadmap not applied) or any other failure reads as
 * none, never as a failed board: the goal then reads "not measured yet",
 * since a ROADMAP goal's g comes from stored readings only.
 */
async function loadBoardRoadmapGoals(userId: string, templates: readonly BoardTemplate[], day: DayKey): Promise<NonNullable<BoardData["roadmapGoals"]>> {
  const ids = roadmapGoalIdsOf(templates);
  if (ids.length === 0) return {};
  try {
    return await loadRoadmapGoalSeries(userId, ids, day);
  } catch (err) {
    if (!isMissingRoadmapTable(err)) console.error("Today board: the roadmap goals' series failed to load; they read as not measured.", err);
    return {};
  }
}

export interface TodayCounts {
  /** Compulsory items due today still open. */
  musts: number;
  /** Everything else due today still open. */
  due: number;
  inbox: number;
  /**
   * M2: compulsory occurrences due yesterday still open (duty-plan.ts
   * yesterdayMustsOf): 0 before launch, once yesterday is settled, before
   * the first Duty day, or when a freeze covers it; on a rest day only the
   * 'Even on rest days' musts.
   */
  yesterdayMusts: number;
}

/**
 * The nav's and the bell's counts: the board's own, built from the same data
 * with its Duty part (M2), so they agree with the board row for row — a
 * debited one-off has only its make-up card (decision 18; the Owed notice
 * counts it), and a row today's rest holds is not open (nothing is owed on
 * it). Without `duty` buildBoard is the pre-M2 board, so the part must be
 * passed.
 */
export function todayCountsOf(data: BoardData): Omit<TodayCounts, "yesterdayMusts"> {
  return buildBoard(data).counts;
}

/**
 * The nav's 'Today N' and the bell's lines: open musts, open due todos, the
 * inbox. Reads the same core and the same due count as the board, so a
 * study task the board shows met (the queue is clear) is not counted open
 * here, and a tick that clears the board clears the button.
 */
export async function loadTodayCounts(userId: string, now: Date = new Date()): Promise<TodayCounts> {
  const day = todayKey(now);
  return cached(`todayCount:${userId}:${day}`, ["life", "activity", "ideas"], async () => {
    const [read, dueNow] = await Promise.all([loadBoardCore(userId, day, now), loadDueNow(day, now)]);
    return { ...todayCountsOf({ ...read.core, dueNow, duty: read.duty }), yesterdayMusts: read.yesterdayMusts };
  });
}

// ── Capture ───────────────────────────────────────────────────────────────

export interface CreatedTask {
  id: string;
  title: string;
  /** What one completion at the estimate would pay now, priced against today's real ledger (or what the done-now tick paid). */
  projectedXp: number;
  describe: string;
  /** A done-now capture ('x run 30m') was ticked, and projectedXp is what it paid. */
  completed: boolean;
  /** Why a done-now capture was saved but not ticked; null otherwise. */
  doneNowError: string | null;
  /** This capture key was already saved (a retried send): the row returned is the one written the first time. */
  duplicate: boolean;
  /**
   * Where it went, in the board's own lane names: today-board placeOf over
   * the inserted row (and the done-now tick, when one went through), the
   * same rule buildBoard files it by.
   */
  where: BoardPlace;
}

const TITLE_MAX = 200;
const RAW_MAX = 1000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The open goals a '^name' may attach to — the one list both the capture
 * chip (actions/capture.ts loadCaptureVocabulary) and the server's own link
 * (createTemplateCore) read, so the chip's pick is what lands.
 */
export function loadOpenGoals(userId: string): Promise<{ id: string; title: string }[]> {
  return cached(`captureGoals:${userId}`, ["life"], () =>
    prisma.taskTemplate.findMany({
      where: { userId, kind: "GOAL", archivedAt: null, completedAt: null, closedScore: null },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
  );
}

/** The empty line's 'Recent' chips: how far back they read, and how many. */
export const RECENT_CAPTURE_DAYS = 30;
export const RECENT_CAPTURE_MAX = 8;

/**
 * The distinct lines of `rows` (newest first), at most `max`. Two lines
 * are the same when they differ only in case and spacing; the newest
 * spelling is kept, trimmed but otherwise as typed, so tapping the chip
 * re-parses exactly the line that was saved. Pure.
 */
export function recentCaptureLines(rows: readonly { rawText: string | null }[], max: number = RECENT_CAPTURE_MAX): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (out.length >= max) break;
    const text = (r.rawText ?? "").trim();
    const key = text.replace(/\s+/g, " ").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/**
 * The player's last quick captures of tasks and habits (capture.md
 * 'Suggestions from your own tasks'): the distinct lines of the last
 * RECENT_CAPTURE_DAYS, newest first, at most RECENT_CAPTURE_MAX. A line
 * taken back (Undo, or replaced by an Edit, both of which archive it) is
 * left out: it is the misread one. Cached under 'life', which every
 * capture clears.
 */
export function loadRecentCaptures(userId: string, now: Date = new Date()): Promise<string[]> {
  return cached(`captureRecent:${userId}:${todayKey(now)}`, ["life"], async () => {
    const rows = await prisma.taskTemplate.findMany({
      where: {
        userId,
        captureSource: "quick",
        kind: { in: ["TASK", "HABIT"] },
        archivedAt: null,
        createdAt: { gte: new Date(now.getTime() - RECENT_CAPTURE_DAYS * 86_400_000) },
      },
      select: { rawText: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Room for repeats: the same line captured daily still leaves seven others.
      take: RECENT_CAPTURE_MAX * 6,
    });
    return recentCaptureLines(rows);
  });
}

/** The sheet's duplicate note reads at most this many open titles. */
export const ACTIVE_TITLES_MAX = 300;

/** An open template's title and where it sits, for the sheet's quiet 'Already on your board' note. */
export interface ActiveTitle {
  /** normTitleOf(title), of the title as it reads now: the sheet matches on equality only. */
  normTitle: string;
  title: string;
  where: BoardPlace;
}

/**
 * Open templates (not archived, not completed), newest first, at most
 * `max`, each with its place on the board — placementOf over the board's
 * own read, so the note names the lane the board shows it in. Pure.
 */
export function activeTitlesOf(
  core: Pick<BoardData, "today" | "yesterday" | "templates" | "instances" | "stats">,
  max: number = ACTIVE_TITLES_MAX
): ActiveTitle[] {
  const byTpl = new Map<string, BoardInstance[]>();
  for (const i of core.instances) {
    const list = byTpl.get(i.templateId);
    if (list) list.push(i);
    else byTpl.set(i.templateId, [i]);
  }
  return core.templates
    .filter((t) => !t.completedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, Math.max(0, max))
    .map((t) => ({
      normTitle: normTitleOf(t.title),
      title: t.title,
      where: placementOf(t, { today: core.today, yesterday: core.yesterday, instances: byTpl.get(t.id) ?? [], lastDone: core.stats[t.id]?.lastDone ?? null }).place,
    }));
}

/** The open titles for today's board, read from the board's own cached wave. */
export async function loadActiveTitles(userId: string, now: Date = new Date()): Promise<ActiveTitle[]> {
  return activeTitlesOf((await loadBoardCore(userId, todayKey(now), now)).core);
}

/**
 * Writes a capture as one template with its lexical grade. One INSERT (the
 * day's ledger and the settings row are read alongside it, not after); the
 * AI sizing is the caller's `after(() => applySizing(id))`.
 *
 * `parsed` is the server's own parse of `rawText` — the authority. Its
 * numbers are clamped anyway. `captureKey`, the sheet's per-line nonce,
 * makes a retried send idempotent: the second insert hits the unique key
 * and the first row comes back. A done-now capture ('x run 30m') is
 * completed here too, so the result's XP is what was paid; if that tick
 * fails, the template is still returned (with the reason), never reported
 * as a failed save that a retry would duplicate. A retried done-now line
 * whose row was saved on an earlier life day is not ticked today
 * (resentTickBlock): its work belongs to the day it was captured.
 *
 * An idea draft keeps its answer ('idea: Q :: A') as its note, whole: the
 * title is the question. How a line is stored (its kind, days, Must, inbox
 * and note) is capture-shape.ts captureShapeOf, which the sheet can import.
 *
 * `link` (roadmap Start only; docs/life-plan/roadmap.md decision 14, F16
 * seam 5): structure instead of text. An explicit `parentId` replaces the
 * '^name' match, and `goal` replaces captureGoalFields' metric, target, unit
 * and stated MP; the horizon still comes from horizonFor (linkedGoalFields,
 * linkedParentOf). A ROADMAP goal must come out MID, or nothing is written.
 */
export async function createTemplateCore(
  userId: string,
  parsed: ParsedCapture,
  opts: { rawText: string; captureSource: CaptureSource; captureKey?: string | null; now?: Date; link?: CaptureLink }
): Promise<CreatedTask> {
  const w = await insertCapture(userId, parsed, opts);
  if (!wantsDoneNowTick(parsed, w.t)) return w.created;
  return tickUnlessResent(userId, w);
}

/**
 * A roadmap Start's structure for one capture (roadmap lane 0 type; lane G
 * wires it, F16 seam 5): an explicit parent goal replaces the '^name' match,
 * and the goal override replaces captureGoalFields' metric and MP (the
 * horizon still comes from horizonFor).
 */
export interface CaptureLink {
  parentId?: string;
  goal?: { krMetric: KrMetric; krTarget: number | null; krUnit: string | null; goalMp: number };
}

/**
 * The parent a linked capture names outright (F16 seam 5), or null when the
 * '^name' match decides as before. A goal never takes a parent (the same rule
 * as the '^name' match), so a link's parentId on a goal capture is ignored.
 * Pure; capture-server-check holds it.
 */
export function linkedParentOf(kind: TaskKind, link: CaptureLink | null | undefined): string | null {
  const id = link?.parentId?.trim();
  return id && kind !== "GOAL" ? id : null;
}

/**
 * A goal capture's columns with a roadmap link's override applied (F16 seam
 * 5): the link's krMetric, krTarget, krUnit and goalMp replace what
 * captureGoalFields read from the title (so a milestone named 'read 12
 * books' is still measured by its roadmap, never as MANUAL), while the
 * horizon stays horizonFor's. Any other kind, or no `goal`, is unchanged.
 * Throws, before anything is written, on a stated MP that is not a finite
 * number ≥ 0, on a ROADMAP goal whose horizon is not MID (a roadmap
 * milestone is always a Mid goal: decision 8, F15), or on a ROADMAP goal
 * stating anything but 0 or statedGoalMp('MID') (the roadmap adds no MP
 * reason, cap or limit; balance-horizon 3e). Pure.
 */
export function linkedGoalFields(kind: TaskKind, base: CaptureGoalFields, link: CaptureLink | null | undefined): CaptureGoalFields {
  const g = link?.goal;
  if (kind !== "GOAL" || !g) return base;
  if (typeof g.goalMp !== "number" || !Number.isFinite(g.goalMp) || g.goalMp < 0) throw new Error("A linked goal needs a stated MP of 0 or more.");
  if (g.krTarget != null && !Number.isFinite(g.krTarget)) throw new Error("A linked goal's target must be a number.");
  if (g.krMetric === "ROADMAP" && base.horizon !== "MID") throw new Error("A roadmap milestone is a Mid goal: tag it Mid, with its due day more than 30 days away.");
  if (g.krMetric === "ROADMAP" && g.goalMp !== 0 && g.goalMp !== statedGoalMp("MID")) {
    throw new Error(`A roadmap milestone states ${statedGoalMp("MID")} MP or nothing.`);
  }
  return { horizon: base.horizon, krMetric: g.krMetric, krTarget: g.krTarget, krUnit: g.krUnit, goalMp: g.goalMp };
}

/** What insertCapture wrote, and what a later done-now tick needs from it. */
interface InsertedCapture {
  created: CreatedTask;
  t: BoardTemplate;
  instances: BoardInstance[];
  minutes: number | null;
  today: DayKey;
  now: Date;
}

/**
 * createTemplateCore's write without the done-now tick: one INSERT (or the
 * row a retried key already wrote), priced against today's real ledger and
 * placed on the board. recaptureCore ticks only after the line it replaces
 * has been taken back.
 */
async function insertCapture(
  userId: string,
  parsed: ParsedCapture,
  opts: { rawText: string; captureSource: CaptureSource; captureKey?: string | null; now?: Date; link?: CaptureLink }
): Promise<InsertedCapture> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const title = parsed.title.trim().replace(/\s+/g, " ").slice(0, TITLE_MAX);
  if (!title) throw new Error("Nothing to add: the line has no title left once its tokens are read.");
  const captureKey = cleanCaptureKey(opts.captureKey);

  const typed = typeof parsed.estMinutes === "number" && Number.isFinite(parsed.estMinutes) ? parsed.estMinutes : null;
  const sizing = sizeLexically(title, { tagTrack: parsed.track, minutes: typed });
  const machineMinutes = Math.max(1, Math.round(sizing.machineMinutes));
  const estMinutes = typed != null ? Math.max(1, Math.min(EST_MINUTES_MAX, Math.round(typed))) : machineMinutes;

  const { kind, recurrence, startDay, dueDay, dueKind, compulsory, inbox, note } = captureShapeOf(parsed, today);

  // A roadmap Start (F16 seam 5) names its parent goal and the goal's measure outright; checked before the write.
  const goal = linkedGoalFields(kind, captureGoalFields(kind, title, parsed.horizon, dueDay, today), opts.link);
  // '^name': the same matcher and the same list the chip previewed, unless the link named the parent.
  let parentId: string | null = linkedParentOf(kind, opts.link);
  if (!parentId && parsed.parentHint && kind !== "GOAL") parentId = matchParentGoal(parsed.parentHint, await loadOpenGoals(userId))?.id ?? null;

  const autoMetric = parsed.autoMetric && kind !== "GOAL" ? parsed.autoMetric : null;
  const autoTarget =
    autoMetric && parsed.autoTarget != null && Number.isFinite(parsed.autoTarget)
      ? Math.max(1, Math.min(500, Math.round(parsed.autoTarget)))
      : null;

  const data: Prisma.TaskTemplateUncheckedCreateInput = {
    userId,
    title,
    normTitle: normTitleOf(title),
    rawText: opts.rawText.slice(0, RAW_MAX),
    note,
    kind,
    inbox,
    recurrence,
    startDay: dateColumn(startDay),
    dueDay: dueDay ? dateColumn(dueDay) : null,
    dueKind,
    horizon: goal.horizon,
    parentId,
    krMetric: goal.krMetric,
    krTarget: goal.krTarget,
    krUnit: goal.krUnit,
    goalMp: goal.goalMp,
    compulsory,
    intrinsic: parsed.intrinsic,
    mvv: parsed.mvv ? parsed.mvv.slice(0, 120) : null,
    autoMetric,
    autoTarget,
    track: parsed.track ?? sizing.track,
    trackSource: parsed.track ? "TAG" : "CATEGORY",
    category: sizing.category,
    band: sizing.band,
    lexicalBand: sizing.band,
    estMinutes,
    machineMinutes,
    minutesSource: typed != null ? "USER" : "LEXICAL",
    composition: sizing.composition as Prisma.InputJsonValue,
    gradeSource: "LEXICAL",
    gradeConfidence: Math.max(0, Math.min(1, sizing.confidence)),
    gradeBasis: sizing.basis.slice(0, 200),
    captureSource: opts.captureSource,
    captureKey,
  };

  const insert = prisma.taskTemplate
    .create({ data, select: TEMPLATE_SELECT })
    .then((row) => ({ row, duplicate: false }))
    .catch(async (err: unknown) => {
      // The same line sent twice (a lost response, then Retry): return the first.
      if (captureKey && isDuplicateActivity(err)) {
        const row = await prisma.taskTemplate.findFirst({ where: { userId, captureKey }, select: TEMPLATE_SELECT });
        if (row) return { row, duplicate: true };
      }
      throw err;
    });

  // One wave: the insert, today's ledger (so the toast's price is today's
  // real price, not an empty day's), and whether LifeSettings exists yet.
  const [{ row, duplicate }, totals, events, settings] = await Promise.all([
    insert,
    readDayTotals(userId, [today]),
    readDayTaskEvents(userId, [today]),
    prisma.lifeSettings.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  if (!settings) {
    // The first capture ever, or the first after a reset: rare, so one more
    // round trip. A failure costs only the epoch day, never the capture.
    try {
      await prisma.lifeSettings.upsert({ where: { userId }, create: { userId, ...newLifeSettingsData(today) }, update: {} });
    } catch (err) {
      console.error("LifeSettings not created:", err);
    }
  }
  invalidate("life", "activity");

  // A new row has no instances yet. A retried send's row may have been
  // ticked since (here, or on the board), so its place reads them.
  const instances = duplicate ? await readCapturedInstances(userId, row.id, today) : [];
  return capturedOf(row, { duplicate, instances, totals, events, minutes: typed, today, now });
}

/** A goal capture's own columns; all null for any other kind. */
export interface CaptureGoalFields {
  horizon: Horizon | null;
  krMetric: KrMetric | null;
  krTarget: number | null;
  krUnit: string | null;
  /** The MP the goal states, frozen at creation (M5): statedGoalMp(horizon), so Short 1, Mid 6, Long 20. */
  goalMp: number | null;
}

/**
 * What a captured goal stores beside its title (m5-refit F15): its horizon
 * (a tag may lower it, never raise it past its deadline: horizonFor), how it
 * is measured (goalMetricOf: 'read 12 books' counts itself) and goalMp =
 * statedGoalMp(horizon), stated once here and never recomputed (a later
 * reschedule moves only the due day). Pure: insertCapture spreads it into
 * the INSERT, and scripts/board-check.ts holds it.
 */
export function captureGoalFields(kind: TaskKind, title: string, tag: Horizon | null | undefined, dueDay: DayKey | null, today: DayKey): CaptureGoalFields {
  if (kind !== "GOAL") return { horizon: null, krMetric: null, krTarget: null, krUnit: null, goalMp: null };
  const horizon = horizonFor(tag ?? null, dueDay, today);
  return { horizon, ...goalMetricOf(title), goalMp: statedGoalMp(horizon) };
}

/** A capture's row as the toast reports it: priced against today's real ledger, placed with its instances. */
function capturedOf(
  row: TemplateRow,
  a: {
    duplicate: boolean;
    instances: BoardInstance[];
    totals: readonly DayTotalRow[];
    events: readonly TaskEventRow[];
    minutes: number | null;
    today: DayKey;
    now: Date;
  }
): InsertedCapture {
  const t = toBoardTemplate(row, a.now);
  const created: CreatedTask = {
    id: row.id,
    title: row.title,
    projectedXp: planCompletion({ template: t, day: a.today, today: a.today, slot: 0, ledger: ledgerOf(a.today, a.totals, a.events), streakDays: 0 }).receipt.xp,
    describe: describeTemplate(t, a.today),
    completed: false,
    doneNowError: null,
    duplicate: a.duplicate,
    where: placeOf(t, a.today, a.instances),
  };
  return { created, t, instances: a.instances, minutes: a.minutes, today: a.today, now: a.now };
}

/**
 * The row an edit's earlier send already wrote (recaptureCore's 'find'),
 * reported as a retried save is: priced against today's ledger, placed with
 * its instances. Nothing is written. Null when it no longer exists.
 */
async function readCaptured(userId: string, id: string, now: Date): Promise<InsertedCapture | null> {
  const today = todayKey(now);
  const [row, totals, events, instances] = await Promise.all([
    prisma.taskTemplate.findFirst({ where: { id, userId }, select: TEMPLATE_SELECT }),
    readDayTotals(userId, [today]),
    readDayTaskEvents(userId, [today]),
    readCapturedInstances(userId, id, today),
  ]);
  return row ? capturedOf(row, { duplicate: true, instances, totals, events, minutes: null, today, now }) : null;
}

/** A done-now line ('x run 30m') is ticked as it is saved; a goal or an idea draft never is. */
function wantsDoneNowTick(parsed: Pick<ParsedCapture, "doneNow">, t: Pick<BoardTemplate, "kind">): boolean {
  return parsed.doneNow && tickableKind(t);
}

/** Only a task or a habit is ticked: a goal pays through its steps, and an idea draft is filed, not done. */
function tickableKind(t: Pick<BoardTemplate, "kind">): boolean {
  return t.kind !== "GOAL" && t.kind !== "IDEA_DRAFT";
}

/** "Wed 30 Sep": the day a resent line was first saved, as its note names it. */
const savedDayLabel = (day: DayKey) => `${weekdayName(day)} ${shortDate(day)}`;

/**
 * Why a resent done-now line is not ticked now, or null when it may be. A
 * line resent (a lost response, a queued retry) on the life day its row was
 * saved is ticked as before: completeInstanceCore returns the first tick's
 * receipt, so nothing is paid twice. A row saved on an EARLIER life day is
 * never ticked today: its work was done that day, and booking it now would
 * pay it on the wrong day (or, if that day's tick landed, a second time).
 * The note says which: ticked that day, or still to tick on Today. Pure.
 */
export function resentTickBlock(p: {
  duplicate: boolean;
  /** The row's createdAt (the first send's), as a Date or its ISO string. */
  createdAt: Date | string;
  today: DayKey;
  instances: readonly Pick<BoardInstance, "day" | "status">[];
}): string | null {
  if (!p.duplicate) return null;
  const saved = dayKeyOf(new Date(p.createdAt));
  if (saved >= p.today) return null;
  return p.instances.some((i) => i.day === saved && isDoneStatus(i.status))
    ? `Saved and ticked on ${savedDayLabel(saved)}.`
    : `Saved on ${savedDayLabel(saved)}; tick it on Today.`;
}

/** The done-now tick, unless the row is a resend saved on an earlier life day (resentTickBlock). */
async function tickUnlessResent(userId: string, w: InsertedCapture): Promise<CreatedTask> {
  const block = resentTickBlock({ duplicate: w.created.duplicate, createdAt: w.t.createdAt, today: w.today, instances: w.instances });
  return block ? { ...w.created, doneNowError: block } : tickCaptured(userId, w.created, w.t, w);
}

/** A captured row's instances, for its place: its whole (short) life is enough. */
async function readCapturedInstances(userId: string, templateId: string, today: DayKey): Promise<BoardInstance[]> {
  const rows = await prisma.taskInstance.findMany({
    where: { userId, templateId, day: { gte: dateColumn(addDays(today, -HISTORY_DAYS)) } },
    select: INSTANCE_SELECT,
  });
  return rows.map(toBoardInstance);
}

/**
 * Ticks a done-now capture, so the result's XP is what the tick paid and its
 * place is where the ticked row now sits ('Done today'). A refused or failed
 * tick keeps the saved row and says why: never a failed save that a retry
 * would duplicate.
 */
async function tickCaptured(
  userId: string,
  created: CreatedTask,
  t: BoardTemplate,
  a: { minutes: number | null; today: DayKey; now: Date; instances: readonly BoardInstance[] }
): Promise<CreatedTask> {
  try {
    const done = await completeInstanceCore(userId, t.id, { day: "today", minutes: a.minutes, now: a.now });
    if (!done.ok) return { ...created, doneNowError: done.error };
    const v = done.value;
    const ticked: BoardInstance = { id: v.instanceId, templateId: t.id, day: v.day, slot: v.slot, status: v.status, source: v.source, xpPaid: v.receipt.xp };
    return {
      ...created,
      projectedXp: v.receipt.xp,
      completed: true,
      where: placeOf(t, a.today, [...a.instances.filter((i) => i.id !== ticked.id), ticked]),
    };
  } catch (err) {
    console.error("Done-now tick failed after capture:", err);
    return { ...created, doneNowError: "Saved, but the tick didn't go through. Tick it on Today." };
  }
}

// ── Completion ────────────────────────────────────────────────────────────

export interface CompleteOptions {
  /**
   * The life day to book: 'today', 'yesterday', or the row's own DayKey
   * (what the board sends, so a board left open across 04:00 cannot book a
   * tick on the wrong day). Checked against the server's clock: only today,
   * or yesterday inside the record window.
   */
  day?: "today" | "yesterday" | DayKey;
  minutes?: number | null;
  mvv?: boolean;
  now?: Date;
}

export interface Completion {
  instanceId: string;
  templateId: string;
  eventId: string | null;
  day: DayKey;
  slot: number;
  receipt: Receipt;
  status: InstanceStatus;
  source: InstanceSource;
  occurredAt: string;
  /** True when this was already recorded (a double tap) and the stored receipt came back. */
  duplicate: boolean;
}

const SLOT_MAX = 20;
/** Tries a completion makes when another lands under it. Each retry re-reads and re-prices. */
const SETTLE_ATTEMPTS = 3;

/** The server's day for a request: today, yesterday, or null for a day it will not book. */
function resolveDay(day: CompleteOptions["day"], today: DayKey): DayKey | null {
  const yesterday = addDays(today, -1);
  if (day === undefined || day === "today") return today;
  if (day === "yesterday") return yesterday;
  return day === today || day === yesterday ? day : null;
}

interface CompletionRead {
  t: BoardTemplate;
  history: BoardInstance[];
  events: TaskEventRow[];
  ledger: DayLedger;
  /** The day's knee rows as read (kneeRowsOf): what the guard holds the write to. */
  kneeRows: number;
  /**
   * M2: LifeSettings.settledThroughDay and .epochDay as read. A day on or
   * before the cursor and on or after the first Duty day takes no tick
   * (decision 25, duty-economy settledFor).
   */
  settledThrough?: DayKey | null;
  epochDay?: DayKey | null;
  /** M2: the template has an open debt. A one-off with one is made up from its card only (decision 18). */
  debited?: boolean;
  /** M2: a FREEZE_USE covers the day (yesterday only): nothing more is recorded on it (decision 12). */
  frozen?: boolean;
}

/**
 * The one read wave a completion needs: the template, its history, the
 * day's ledger, the settlement cursor and epoch, any open debt, and — for a
 * record of yesterday — whether a freeze covers it.
 */
async function readForCompletion(
  userId: string,
  templateId: string,
  today: DayKey,
  day: DayKey,
  now: Date
): Promise<(CompletionRead & { row: TemplateRow }) | null> {
  const [row, instances, totals, events, settings, debts, frozen] = await Promise.all([
    prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: TEMPLATE_SELECT }),
    prisma.taskInstance.findMany({
      where: { templateId, userId, day: { gte: dateColumn(addDays(today, -HISTORY_DAYS)) } },
      select: INSTANCE_SELECT,
    }),
    readDayTotals(userId, [day]),
    readDayTaskEvents(userId, [day]),
    prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true, epochDay: true } }),
    prisma.taskInstance.count({ where: { templateId, userId, debtOpen: true } }),
    day < today
      ? prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: freezeUseKey(day) } }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!row) return null;
  return {
    row,
    t: toBoardTemplate(row, now),
    history: instances.map(toBoardInstance),
    events,
    ledger: ledgerOf(day, totals, events),
    kneeRows: kneeRowsOf(day, totals),
    settledThrough: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    epochDay: settings?.epochDay ? keyOfDateColumn(settings.epochDay) : null,
    debited: debts > 0,
    frozen: !!frozen,
  };
}

/** Duty's refusal of a tick from a completion read (duty-plan tickRefusalOf): settled, frozen, or a debited one-off. */
function tickRefusalFor(read: CompletionRead, day: DayKey, today: DayKey, rule: boolean): string | null {
  return tickRefusalOf({
    day,
    today,
    launchDay: dutyLaunchDay(),
    cursor: read.settledThrough,
    epochDay: read.epochDay,
    oneOff: !rule,
    debited: !!read.debited,
    frozen: !!read.frozen,
  });
}

function storedCompletion(ev: { id: string; sourceId: string | null; receipt: Prisma.JsonValue; occurredAt: Date }, inst: { id: string; status: string; source: string }, t: BoardTemplate, day: DayKey, slot: number): Completion {
  return {
    instanceId: ev.sourceId ?? inst.id,
    templateId: t.id,
    eventId: ev.id,
    day,
    slot,
    receipt: ev.receipt as unknown as Receipt,
    status: inst.status as InstanceStatus,
    source: inst.source as InstanceSource,
    occurredAt: ev.occurredAt.toISOString(),
    duplicate: true,
  };
}

/** What the latest done slot on a day paid, as a duplicate result; null when nothing on that day is done. */
function doneOnDay(read: CompletionRead, day: DayKey): LifeResult<Completion> | null {
  const done = read.history.filter((i) => i.day === day && isDoneStatus(i.status)).sort((a, b) => b.slot - a.slot)[0];
  if (!done) return null;
  const undone = undoneIds(read.events);
  const ev = [...read.events].reverse().find((e) => e.source === "TASK" && e.sourceId === done.id && !undone.has(e.id));
  return ev ? ok(storedCompletion(ev, done, read.t, day, done.slot)) : fail("Already done.");
}

/**
 * Serialises a player's completions: transaction-scoped, released at commit
 * or rollback. Settlement, the make-up actions, freeze spends and rest
 * declarations take the same lock (M2).
 */
export function lifeLockOp(userId: string) {
  return prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`life-complete:${userId}`}::text))`;
}

export interface FreshnessGuardOptions {
  /** A make-up (M2): its instance must still be MISSED with its debt open. */
  openDebtInstanceId?: string;
  /** A record of yesterday (M2, decision 12): no FREEZE_USE may have landed on `day` ('freeze-use:<day>'). */
  notFrozen?: boolean;
}

/**
 * The freshness guard's SQL (freshnessGuardOp): division by zero unless the
 * day's knee rows are still `kneeRows`; for a one-off, unless it is still
 * open and (M2, decision 18) carries no open debt — settlement charged it
 * between the read and the write, so the retry's re-read answers 'Make it
 * up from its card'; for a make-up, unless its instance is still owed; and
 * for a record of yesterday, unless no freeze has covered the day since.
 */
export function freshnessGuardSql(
  userId: string,
  day: DayKey,
  kneeRows: number,
  oneOffTemplateId: string | null,
  opts: FreshnessGuardOptions = {}
): Prisma.Sql {
  const stillOpen = oneOffTemplateId
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "TaskTemplate" WHERE "id" = ${oneOffTemplateId} AND "completedAt" IS NULL)
      AND NOT EXISTS (SELECT 1 FROM "TaskInstance" WHERE "templateId" = ${oneOffTemplateId} AND "debtOpen")`
    : Prisma.empty;
  const stillOwed = opts.openDebtInstanceId
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "TaskInstance" WHERE "id" = ${opts.openDebtInstanceId} AND "status" = 'MISSED' AND "debtOpen")`
    : Prisma.empty;
  const notFrozen = opts.notFrozen
    ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "ActivityEvent" WHERE "userId" = ${userId} AND "dedupeKey" = ${freezeUseKey(day)})`
    : Prisma.empty;
  return Prisma.sql`
    SELECT 1 / (CASE WHEN
      (SELECT COUNT(*) FROM "ActivityEvent"
        WHERE "userId" = ${userId} AND "day" = ${day}::date
          AND ("source" IN ('TASK', 'UNDO') OR "rawXp" IS NOT NULL)) = ${kneeRows}::int
      ${stillOpen}
      ${stillOwed}
      ${notFrozen}
    THEN 1 ELSE 0 END)
  `;
}

/**
 * Fails the transaction (division by zero) unless the day's knee rows are
 * still the `kneeRows` the price was read against — and, for a one-off,
 * unless it is still open and not debited; for a make-up (M2), unless its
 * instance is still MISSED with its debt open; for a record of yesterday,
 * unless no freeze covers it. Runs after the lock, as its own statement, so
 * it reads everything committed before this transaction got its turn.
 */
export function freshnessGuardOp(
  userId: string,
  day: DayKey,
  kneeRows: number,
  oneOffTemplateId: string | null,
  opts: FreshnessGuardOptions = {}
) {
  return prisma.$executeRaw(freshnessGuardSql(userId, day, kneeRows, oneOffTemplateId, opts));
}

/**
 * The settled-day guard's SQL (settledDayGuardOp): 22003 when `day` is
 * settled by the one rule, duty-economy settledFor — on or before the
 * cursor and, once a launch day is set, on or after GREATEST(launch,
 * epochDay), the first Duty day. The launch script may set the cursor to
 * firstDutyDay − 1 days before the launch; the floor keeps every pre-launch
 * day open. Without a launch day (a rollback) the cursor alone locks.
 */
export function settledDayGuardSql(userId: string, day: DayKey, launchDay: DayKey | null = dutyLaunchDay()): Prisma.Sql {
  const floor = launchDay ? Prisma.sql`AND ${day}::date >= GREATEST(${launchDay}::date, "epochDay")` : Prisma.empty;
  return Prisma.sql`
    SELECT (CASE WHEN EXISTS (
      SELECT 1 FROM "LifeSettings" WHERE "userId" = ${userId} AND "settledThroughDay" >= ${day}::date ${floor}
    ) THEN 40000 ELSE 1 END)::smallint
  `;
}

/**
 * M2 (decision 25): fails the transaction with SQLSTATE 22003 (a smallint
 * cast overflow) when settlement has already judged `day`. A separate
 * statement after the lock, and a different error from the freshness
 * guard's 22012, so it is never retried: isSettledDay maps it straight to
 * the settled message. Today can never be settled except across 04:00 (an
 * early settle reaches yesterday at most), so ticks and undos dated today
 * carry it only near the day's end (duty-plan needsSettledGuard); a
 * yesterday record, an undo of one and a freeze spend always do.
 */
export function settledDayGuardOp(userId: string, day: DayKey, launchDay: DayKey | null = dutyLaunchDay()) {
  return prisma.$executeRaw(settledDayGuardSql(userId, day, launchDay));
}

function sqlStateOf(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (err.meta ?? {}) as Record<string, unknown>;
    return String(meta.code ?? "");
  }
  return "";
}

/** The freshness guard's failure (22012): someone else's completion landed between this one's read and its write. Retried. */
export function isStaleRead(err: unknown): boolean {
  if (sqlStateOf(err) === "22012") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /division by zero|22012/i.test(message);
}

/** The settled-day guard's failure (22003): the day was settled first. Never retried. */
export function isSettledDay(err: unknown): boolean {
  if (sqlStateOf(err) === "22003") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /smallint out of range|22003/i.test(message);
}

type SettleArgs = {
  day: DayKey;
  today: DayKey;
  slot: number;
  minutes?: number | null;
  mvv?: boolean;
  now: Date;
  auto?: boolean;
  countsForStreak?: boolean;
  detail?: string | null;
};

const RETRY = Symbol("retry");

/**
 * Prices and writes one completion from an already-read wave: the lock,
 * the freshness guard, the instance upsert, the TASK row and the template
 * touch-ups (freeze the grade; mark a one-off complete) in one array.
 * Returns RETRY when the guard found the day moved under it.
 */
async function settleOnce(userId: string, read: CompletionRead, a: SettleArgs): Promise<LifeResult<Completion> | typeof RETRY> {
  const { t, history, events, ledger } = read;
  const existing = history.find((i) => i.day === a.day && i.slot === a.slot) ?? null;
  const undone = undoneIds(events);

  if (existing && isDoneStatus(existing.status)) {
    // Already done: a second tap returns what the first one paid.
    const ev = [...events].reverse().find((e) => e.source === "TASK" && e.sourceId === existing.id && !undone.has(e.id));
    if (ev) return ok(storedCompletion(ev, existing, t, a.day, a.slot));
    return fail("Already done.");
  }

  const rule = ruleOf(t);
  // A one-off is done once, whichever day it was booked on.
  if (!rule && t.completedAt) return fail("Already done.");
  // M2: a settled day takes no tick (decision 25), a frozen yesterday no record
  // (decision 12), and a debited one-off is made up from its card (decision 18).
  const refusal = tickRefusalFor(read, a.day, a.today, !!rule);
  if (refusal) return fail(refusal);

  const streakDays = rule && !a.auto ? streakDaysFor(t, rule, history, a.day) : 0;
  const plan = planCompletion({
    template: t,
    day: a.day,
    today: a.today,
    slot: a.slot,
    minutes: a.minutes,
    mvv: a.mvv,
    ledger,
    streakDays,
    auto: a.auto,
  });

  // Each undo of this slot bumps the attempt, so re-completing writes a new
  // row under a new key rather than colliding with the one that was undone.
  const attempt = existing ? events.filter((e) => e.source === "UNDO" && e.sourceId === existing.id).length : 0;
  const instanceId = existing?.id ?? newId();
  const event = taskEventInput(plan, {
    templateId: t.id,
    track: t.track,
    instanceId,
    day: a.day,
    slot: a.slot,
    attempt,
    now: a.now,
    countsForStreak: a.countsForStreak,
    detail: a.detail,
  });
  const minutes = Math.round(plan.receipt.minutes) || null;
  const dayCol = dateColumn(a.day);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    lifeLockOp(userId),
    // M2 (decision 25): its own statement, 22003, never retried. A tick dated
    // today carries it only near 04:00, the one time today can be settled.
    ...(needsSettledGuard(a.day, a.today, a.now) ? [settledDayGuardOp(userId, a.day)] : []),
    freshnessGuardOp(userId, a.day, read.kneeRows, rule ? null : t.id, { notFrozen: a.day < a.today }),
    prisma.taskInstance.upsert({
      where: { templateId_day_slot: { templateId: t.id, day: dayCol, slot: a.slot } },
      create: {
        id: instanceId,
        userId,
        templateId: t.id,
        day: dayCol,
        slot: a.slot,
        status: plan.status,
        source: plan.source,
        completedAt: a.now,
        minutes,
        xpPaid: plan.receipt.xp,
      },
      update: { status: plan.status, source: plan.source, completedAt: a.now, minutes, xpPaid: plan.receipt.xp },
    }),
    activityOp(userId, event),
    // The grade freezes at the first completion: from here on neither the AI
    // nor a resize can change what this task is worth.
    prisma.taskTemplate.updateMany({ where: { id: t.id, gradeFrozenAt: null }, data: { gradeFrozenAt: a.now } }),
  ];
  // The TASK row: after the lock, the guards (the settled one only when carried) and the instance.
  const EVENT_AT = ops.length - 2;
  if (!rule) {
    ops.push(prisma.taskTemplate.updateMany({ where: { id: t.id, completedAt: null }, data: { completedAt: a.now } }));
  }

  try {
    const results = await prisma.$transaction(ops);
    const created = results[EVENT_AT] as { id: string };
    return ok({
      instanceId,
      templateId: t.id,
      eventId: created.id,
      day: a.day,
      slot: a.slot,
      receipt: plan.receipt,
      status: plan.status,
      source: plan.source,
      occurredAt: a.now.toISOString(),
      duplicate: false,
    });
  } catch (err) {
    if (isSettledDay(err)) return fail(settledTickMessage(a.day));
    if (isStaleRead(err)) return RETRY;
    if (!isDuplicateActivity(err)) throw err;
    // Another request recorded this tick first (a second device, a retried
    // action). Whatever it stored is the answer.
    const [ev, inst] = await Promise.all([
      prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: event.dedupeKey! } } }),
      prisma.taskInstance.findUnique({ where: { templateId_day_slot: { templateId: t.id, day: dayCol, slot: a.slot } }, select: INSTANCE_SELECT }),
    ]);
    if (ev && inst) return ok(storedCompletion(ev, inst, t, a.day, a.slot));
    return fail("That tick is already being recorded.");
  } finally {
    invalidate("life", "activity");
  }
}

/**
 * settleOnce, re-read and re-priced when another completion lands between
 * the read and the write (the freshness guard), a few times at most.
 */
async function settleCompletion(
  userId: string,
  read: CompletionRead,
  a: SettleArgs,
  reread: () => Promise<CompletionRead | null>
): Promise<LifeResult<Completion>> {
  let current = read;
  for (let attempt = 1; ; attempt++) {
    const res = await settleOnce(userId, current, a);
    if (res !== RETRY) return res;
    if (attempt >= SETTLE_ATTEMPTS) return fail("Another tick was being recorded at the same moment. Try again.");
    const next = await reread();
    if (!next) return fail("That task no longer exists.");
    current = next;
  }
}

function completableReason(t: BoardTemplate, row: TemplateRow): string | null {
  if (row.archivedAt) return "That task is archived.";
  if (t.kind === "GOAL") return "Goals move through their steps, not a tick.";
  if (t.kind === "IDEA_DRAFT") return "An idea draft is finished on the Add page.";
  return null;
}

/**
 * Completes a task on today or yesterday (the day is checked against the
 * server's clock, never taken on trust), at its estimate or at reported
 * minutes, in full or as its minimum version. Pays exactly the price the
 * board projected against the same ledger. Idempotent on a double tap.
 *
 * Only what the board offers is accepted (completionBlockOf, the board's
 * own lane rule): a repeating task on a day it is due, yesterday only for
 * what was due yesterday. The slot is the server's: the first completion
 * of the day is slot 0, and a day already done returns what it paid —
 * another slot is 'Again' (againCore), which requires a first one.
 */
export async function completeInstanceCore(userId: string, templateId: string, opts: CompleteOptions = {}): Promise<LifeResult<Completion>> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const day = resolveDay(opts.day, today);
  if (!day) return fail("The board is out of date: that day can no longer be recorded. Refresh and try again.");

  const load = () => readForCompletion(userId, templateId, today, day, now);
  const read = await load();
  if (!read) return fail("That task no longer exists.");
  const { t, row } = read;
  const reason = completableReason(t, row);
  if (reason) return fail(reason);

  // Done on that day already (a double tap, a retry): the first tick's receipt.
  const repeat = doneOnDay(read, day);
  if (repeat) return repeat;

  const rule = ruleOf(t);
  // M2, up front from the read: a settled day is closed to ticks and records
  // (decision 25, settledFor: never a day before the first Duty day), a
  // frozen yesterday to records (decision 12), and a one-off with an open
  // debt has only its make-up card (decision 18). settleOnce holds all three
  // again at write time, and the guards in its array after the lock.
  const refusal = tickRefusalFor(read, day, today, !!rule);
  if (refusal) return fail(refusal);

  const block = completionBlockOf({
    t,
    rule,
    day,
    today,
    lastDone: lastDoneOf(read.history),
    onDay: read.history.filter((i) => i.day === day),
  });
  if (block) return fail(block);

  // A study task completes itself; a manual tick is accepted only once its
  // target is met (and then pays 0, like the auto-completion would).
  if (t.autoMetric && STUDY_METRICS.has(t.autoMetric)) {
    if (day !== today) return fail("A study task only completes on its own day.");
    const needsDue = t.autoMetric !== "IDEAS";
    const dueNow = needsDue ? await loadDueNow(today, now) : null;
    const plans = planAutoCompletions({
      templates: [t],
      today,
      counts: { reviews: read.ledger.reviews, ideas: read.ledger.ideas, dueNow },
      doneToday: new Set(),
      lastDone: {},
    });
    if (plans.length === 0) return fail("This completes itself when your reviews reach the target.");
    return settleCompletion(
      userId,
      read,
      { day, today, slot: 0, now, auto: true, countsForStreak: plans[0].state.worked, detail: plans[0].state.label },
      load
    );
  }

  return settleCompletion(userId, read, { day, today, slot: 0, minutes: opts.minutes, mvv: opts.mvv, now }, load);
}

/** 'Again': the same habit once more today, in the next slot. Repeat decay prices it lower. */
export async function againCore(userId: string, templateId: string, opts: CompleteOptions = {}): Promise<LifeResult<Completion>> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const load = () => readForCompletion(userId, templateId, today, today, now);
  const read = await load();
  if (!read) return fail("That task no longer exists.");
  const reason = completableReason(read.t, read.row);
  if (reason) return fail(reason);
  if (!ruleOf(read.t)) return fail("Again is for repeating tasks.");
  if (read.t.autoMetric) return fail("A study task completes once a day.");
  const onDay = read.history.filter((i) => i.day === today);
  if (!onDay.some((i) => isDoneStatus(i.status))) return fail("Do it once first.");
  const slot = Math.max(...onDay.map((i) => i.slot)) + 1;
  if (slot > SLOT_MAX) return fail("That's plenty for one day.");
  return settleCompletion(userId, read, { day: today, today, slot, minutes: opts.minutes, mvv: opts.mvv, now }, load);
}

// ── Undo ──────────────────────────────────────────────────────────────────

/**
 * Undoes a tick within ten minutes on the same life day by appending an
 * UNDO row that negates it exactly (xp, rawXp, and −1 streak unit), so the
 * day nets to zero. The instance reads UNDONE and is reused if ticked again.
 * The grade stays frozen: a tick is what freezes it, and undoing one is not
 * a way to re-size. Takes the completions' lock, so a tick priced at the
 * same moment re-reads the lowered knee base rather than the old one.
 *
 * M2: a tick whose day settlement has since judged stands (decision 25:
 * refused from the read, and by the settled-day guard at write time), and a
 * make-up is undone by undoMakeUpCore (its repayment is reversed too), so it
 * is answered with MAKE_UP_UNDO_ELSEWHERE for the action to route.
 *
 * The result names the tick's template, so the action's after() can hand it
 * to the roadmap's practice writer (F16 seam 6) without another read.
 */
export async function undoCompletionCore(
  userId: string,
  instanceId: string,
  now: Date = new Date()
): Promise<LifeResult<{ instanceId: string; xp: number; templateId: string }>> {
  const [inst, events, settings] = await Promise.all([
    prisma.taskInstance.findFirst({
      where: { id: instanceId, userId },
      select: { id: true, templateId: true, day: true, status: true, source: true, template: { select: { recurrence: true } } },
    }),
    prisma.activityEvent.findMany({
      where: { userId, sourceId: instanceId, source: { in: ["TASK", "UNDO"] } },
      orderBy: { occurredAt: "desc" },
      select: { id: true, day: true, source: true, sink: true, track: true, templateId: true, sourceId: true, xp: true, rawXp: true, occurredAt: true, dedupeKey: true },
    }),
    prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true, epochDay: true } }),
  ]);
  if (!inst) return fail("That tick no longer exists.");
  if (!isDoneStatus(inst.status)) return ok({ instanceId, xp: 0, templateId: inst.templateId });
  if (inst.source.startsWith("auto:")) return fail("Your reviews completed this one; it can't be undone.");
  if (inst.source === "make-up") return fail(MAKE_UP_UNDO_ELSEWHERE);
  const instDay = keyOfDateColumn(inst.day);
  const settled = isSettledDayFor(instDay, {
    cursor: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    epochDay: settings?.epochDay ? keyOfDateColumn(settings.epochDay) : null,
    launchDay: dutyLaunchDay(),
  });
  if (settled) return fail(settledUndoMessage(instDay));

  const undone = new Set(events.filter((e) => e.source === "UNDO" && e.dedupeKey?.startsWith("undo:")).map((e) => e.dedupeKey!.slice(5)));
  const ev = events.find((e) => e.source === "TASK" && !undone.has(e.id));
  if (!ev) return ok({ instanceId, xp: 0, templateId: inst.templateId });
  if (!canUndo(ev.occurredAt, now)) {
    return fail(`Too late to undo: a tick can be undone for ${UNDO_WINDOW_MS / 60_000} minutes, on the same day.`);
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    lifeLockOp(userId),
    ...(needsSettledGuard(instDay, todayKey(now), now) ? [settledDayGuardOp(userId, instDay)] : []),
    activityOp(
      userId,
      undoEventInput(
        {
          id: ev.id,
          day: keyOfDateColumn(ev.day),
          sink: ev.sink as Sink,
          track: ev.track ? asTrack(ev.track) : null,
          templateId: ev.templateId,
          sourceId: ev.sourceId,
          xp: ev.xp,
          rawXp: ev.rawXp,
        },
        now
      )
    ),
    prisma.taskInstance.update({ where: { id: inst.id }, data: { status: "UNDONE", xpPaid: 0, completedAt: null, minutes: null } }),
  ];
  if (!inst.template.recurrence) {
    ops.push(prisma.taskTemplate.updateMany({ where: { id: inst.templateId }, data: { completedAt: null } }));
  }
  try {
    await prisma.$transaction(ops);
  } catch (err) {
    // Settled between the read and the write: the tick stands.
    if (isSettledDay(err)) return fail(settledUndoMessage(instDay));
    // Undone already (a double tap on Undo): the first one's row stands.
    if (!isDuplicateActivity(err)) throw err;
  } finally {
    invalidate("life", "activity");
  }
  return ok({ instanceId, xp: -ev.xp, templateId: inst.templateId });
}

/**
 * The template an instance belongs to, or null. One indexed read, for the
 * one path whose result does not name it: a make-up's Undo, routed to
 * duty.ts undoMakeUpCore, whose after() still hands the template to the
 * roadmap's practice writer (F16 seam 6).
 */
export async function templateIdOfInstance(userId: string, instanceId: string): Promise<string | null> {
  const row = await prisma.taskInstance.findFirst({ where: { id: instanceId, userId }, select: { templateId: true } });
  return row?.templateId ?? null;
}

// ── Skip, reschedule, archive ─────────────────────────────────────────────

/**
 * Skips today's occurrence of a repeating task: 0 XP, and its per-duty
 * streak holds rather than breaks. A compulsory task can't be skipped —
 * that is what its minimum version is for.
 */
export async function skipCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<null>> {
  const today = todayKey(now);
  const [row, existing] = await Promise.all([
    prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { recurrence: true, compulsory: true, archivedAt: true, mvv: true } }),
    prisma.taskInstance.findUnique({
      where: { templateId_day_slot: { templateId, day: dateColumn(today), slot: 0 } },
      select: { status: true, userId: true },
    }),
  ]);
  if (!row || row.archivedAt) return fail("That task no longer exists.");
  if (!row.recurrence) return fail("Only a repeating task can be skipped. Move a one-off to tomorrow instead.");
  if (row.compulsory) {
    return fail(row.mvv ? "A compulsory task can't be skipped. Do its minimum version instead." : "A compulsory task can't be skipped.");
  }
  if (existing && existing.userId !== userId) return fail("That task no longer exists.");
  if (existing && isDoneStatus(existing.status)) return fail("Already done today. Undo it first.");
  if (existing?.status === "SKIPPED") return ok(null);

  await prisma.taskInstance.upsert({
    where: { templateId_day_slot: { templateId, day: dateColumn(today), slot: 0 } },
    create: { userId, templateId, day: dateColumn(today), slot: 0, status: "SKIPPED", source: "manual", xpPaid: 0 },
    update: { status: "SKIPPED", completedAt: null, xpPaid: 0, minutes: null },
  });
  invalidate("life", "activity");
  return ok(null);
}

/**
 * Moves a one-off to another day. An undated or planned one is re-planned
 * (dueDay = the day, PLANNED). A deadline is only *put off*: planDay takes
 * it off the board until that day while dueDay stays its real deadline, so
 * it is still late after it and still pays the late factor — 'Tomorrow'
 * can neither pull a deadline in nor shed lateness. A compulsory deadline
 * is never put off past its own day (moveBlockOf). 'Tomorrow' on a
 * repeating task skips today instead.
 */
export async function rescheduleCore(userId: string, templateId: string, to: "tomorrow" | DayKey, now: Date = new Date()): Promise<LifeResult<{ dueDay: DayKey } | null>> {
  const today = todayKey(now);
  const row = await prisma.taskTemplate.findFirst({
    where: { id: templateId, userId },
    select: { recurrence: true, compulsory: true, dueDay: true, dueKind: true, completedAt: true, archivedAt: true, kind: true },
  });
  if (!row || row.archivedAt) return fail("That task no longer exists.");
  if (row.recurrence) {
    if (to !== "tomorrow") return fail("A repeating task follows its rule; skip today instead.");
    return skipCore(userId, templateId, now);
  }
  const target = to === "tomorrow" ? addDays(today, 1) : to;
  if (!KEY_RE.test(target)) return fail("Pick today or a later day.");
  const block = moveBlockOf(
    { recurrence: null, compulsory: row.compulsory, dueKind: (row.dueKind as DueKind | null) ?? null, dueDay: keyOrNull(row.dueDay), completedAt: row.completedAt?.toISOString() ?? null },
    target,
    today
  );
  if (block) return fail(block);
  const asTask = row.kind === "IDEA_DRAFT" ? "TASK" : undefined;
  if (row.dueKind === "DEADLINE" && row.dueDay) {
    await prisma.taskTemplate.update({
      where: { id: templateId },
      data: { planDay: target > today ? dateColumn(target) : null, inbox: false, kind: asTask },
    });
    invalidate("life", "activity");
    return ok({ dueDay: keyOfDateColumn(row.dueDay) });
  }
  await prisma.taskTemplate.update({
    where: { id: templateId },
    data: { dueDay: dateColumn(target), dueKind: "PLANNED", planDay: null, inbox: false, kind: asTask },
  });
  invalidate("life", "activity");
  return ok({ dueDay: target });
}

// ── The rule over time: the akrasia horizon (M2 F3) ───────────────────────

/** The columns a rule edit reads, and compares again when it writes. */
const RULE_SELECT = {
  id: true,
  compulsory: true,
  compulsoryOnRest: true,
  inbox: true,
  kind: true,
  recurrence: true,
  startDay: true,
  dueDay: true,
  dueKind: true,
  archivedAt: true,
  createdAt: true,
  pendingChange: true,
  /** Read, never compared (ruleWhere): an unarchive's roadmap check keys on it (unarchiveCore). */
  krMetric: true,
} satisfies Prisma.TaskTemplateSelect;

type RuleReadRow = Prisma.TaskTemplateGetPayload<{ select: typeof RULE_SELECT }>;

function ruleRowOf(r: RuleReadRow): RuleRow {
  return {
    compulsory: r.compulsory,
    compulsoryOnRest: r.compulsoryOnRest,
    inbox: r.inbox,
    kind: r.kind,
    recurrence: r.recurrence,
    startDay: keyOfDateColumn(r.startDay),
    dueDay: keyOrNull(r.dueDay),
    dueKind: r.dueKind,
    archivedAt: r.archivedAt,
    createdAt: r.createdAt,
    pendingChange: r.pendingChange,
  };
}

/**
 * Compare-and-set: the row as it was read, on every column a rule edit
 * reads. Settlement's housekeeping (applying a `next`, pruning a prior
 * segment) rewrites these columns too, so an edit read before it lands
 * matches nothing and is planned again rather than writing over it.
 */
function ruleWhere(userId: string, r: RuleReadRow): Prisma.TaskTemplateWhereInput {
  return {
    id: r.id,
    userId,
    compulsory: r.compulsory,
    compulsoryOnRest: r.compulsoryOnRest,
    inbox: r.inbox,
    archivedAt: r.archivedAt,
    pendingChange: r.pendingChange == null ? { equals: Prisma.AnyNull } : { equals: r.pendingChange as Prisma.InputJsonValue },
  };
}

/** A RuleWrite as Prisma columns (a cleared pendingChange is Prisma.DbNull). */
function ruleData(w: RuleWrite): Prisma.TaskTemplateUpdateManyMutationInput {
  const data: Prisma.TaskTemplateUpdateManyMutationInput = {};
  if (w.compulsory !== undefined) data.compulsory = w.compulsory;
  if (w.compulsoryOnRest !== undefined) data.compulsoryOnRest = w.compulsoryOnRest;
  if (w.archivedAt !== undefined) data.archivedAt = w.archivedAt;
  if (w.pendingChange !== undefined) data.pendingChange = w.pendingChange == null ? Prisma.DbNull : (w.pendingChange as unknown as Prisma.InputJsonValue);
  if (w.pendingChangeAt !== undefined) data.pendingChangeAt = w.pendingChangeAt;
  return data;
}

/** When a rule edit takes effect (actions/duty.ts RuleChangeResult). */
export interface RuleChangeOutcome {
  templateId: string;
  effect: "immediate" | "deferred";
  /** The day a deferred change takes effect; null when immediate. */
  effectiveDay: DayKey | null;
}

const RULE_EDIT_ATTEMPTS = 3;

/**
 * Reads the template, plans the edit (duty-plan.ts planRuleEdit: the
 * classifier, one pending change per template, prior segments for a
 * strengthening) and writes it compare-and-set; a row that moved under it
 * is read and planned again, a few times at most. `refusalOf` (optional)
 * reads more about the row it read and may refuse the edit before any write
 * (unarchiveCore's roadmap check).
 */
async function applyRuleEdit(
  userId: string,
  templateId: string,
  edit: RuleEdit,
  now: Date,
  refusalOf?: (row: RuleReadRow) => Promise<string | null>
): Promise<LifeResult<RuleChangeOutcome>> {
  const today = todayKey(now);
  const launched = isDutyLaunched(today);
  for (let attempt = 1; attempt <= RULE_EDIT_ATTEMPTS; attempt++) {
    const row = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: RULE_SELECT });
    if (!row) return fail("That task no longer exists.");
    if (row.archivedAt && (edit.kind === "unflag" || edit.kind === "rest" || edit.kind === "cancel")) return fail("That task is archived.");
    const refusal = refusalOf ? await refusalOf(row) : null;
    if (refusal) return fail(refusal);
    const plan = planRuleEdit(ruleRowOf(row), edit, { today, now, launched });
    if (!plan.ok) return fail(plan.error);
    const out: RuleChangeOutcome = { templateId, effect: plan.value.effect, effectiveDay: plan.value.effectiveDay };
    if (!plan.value.write) return ok(out);
    const res = await prisma.taskTemplate.updateMany({ where: ruleWhere(userId, row), data: ruleData(plan.value.write) });
    if (res.count > 0) {
      invalidate("life", "activity");
      return ok(out);
    }
  }
  return fail("Something changed at the same moment. Try again.");
}

/**
 * Archives a template. Never deletes: its instances and ledger rows are
 * history, and debts (M2) outlive it. M2 (F3, decision 17): archiving a must
 * once Duty is live, past its 60-minute typo grace, is a weakening — it is
 * deferred to today + 7 as a pending archive (archivedAt is NOT set early;
 * settlement writes it), and the answer says so. Anything else archives at
 * once, at `now` (or at `opts.archivedAt`, the link an edit leaves).
 */
export async function archiveCore(
  userId: string,
  templateId: string,
  now: Date = new Date(),
  opts: { archivedAt?: Date } = {}
): Promise<LifeResult<RuleChangeOutcome>> {
  return applyRuleEdit(userId, templateId, { kind: "archive", at: opts.archivedAt ?? now }, now);
}

/**
 * Brings an archived template back, history and streak intact (archiving
 * never deleted anything). The undo for Archive and for the inbox's Drop: it
 * also cancels a pending archive. A strengthening, so never retroactive: a
 * must's archived days stay unowed (duty-plan.ts planRuleEdit).
 *
 * A roadmap milestone's goal (krMetric ROADMAP; roadmap.md F15, F22): the
 * unarchive undoes the milestone's DROPPED, but never into a second open
 * milestone, so it is refused (roadmapUnarchiveRefusalOf) when its "Start
 * again" copy has started (that copy replaced it: one goal per lineage
 * pays), or while another milestone of the roadmap is under way (Start is
 * one milestone at a time). Only an archived ROADMAP goal pays the extra
 * read; a missing roadmap table reads as no roadmap.
 */
export async function unarchiveCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<null>> {
  const res = await applyRuleEdit(userId, templateId, { kind: "unarchive" }, now, async (row) =>
    row.archivedAt && row.krMetric === "ROADMAP" ? roadmapUnarchiveRefusalOf(await loadRoadmapUnarchiveFacts(userId, templateId)) : null
  );
  return res.ok ? ok(null) : res;
}

// ── Unarchive of a roadmap milestone's goal (roadmap.md F15, F22) ─────────

/** Unarchive's answer when the milestone's "Start again" copy has started: the copy replaced this goal (roadmap-types isSupersededRow). */
export const ROADMAP_UNARCHIVE_REPLACED = "This milestone was started again: its newer goal replaced this one.";
/** Unarchive's answer while another milestone of the same roadmap is under way: Start is one milestone at a time. */
export const ROADMAP_UNARCHIVE_OTHER_LIVE = "Another milestone of this roadmap is under way. Close or drop it first.";

/** A roadmap milestone row as unarchive reads it: the position columns and its goal. */
export type UnarchiveMilestoneRow = PositionRow & { goalId: string | null };

/** What unarchive reads about the milestone a ROADMAP goal belongs to. */
export interface RoadmapUnarchiveFacts {
  /** The milestone whose goal is being unarchived. */
  row: UnarchiveMilestoneRow;
  /** Its roadmap's status: only an ACTIVE roadmap starts or measures a milestone. */
  roadmapStatus: string;
  /** Every milestone row of that roadmap (the row itself included). */
  rows: readonly UnarchiveMilestoneRow[];
  /** The goal ids among `rows` that are open: neither closed nor archived. */
  openGoalIds: ReadonlySet<string>;
}

/**
 * Why a ROADMAP goal must stay archived, or null when unarchiving it is
 * fine (pure; capture-server-check holds it):
 *   - its milestone is superseded (isSupersededRow: a newer STARTING or
 *     STARTED row of its lineage, its "Start again" copy once started). The
 *     copy replaced it; reopening it would let two goals of one lineage pay
 *     (review Lens 1, lineage paid twice). A copy still PLANNED supersedes
 *     nothing, so an Undo right after Drop still works;
 *   - its roadmap is ACTIVE and another milestone (not superseded) is
 *     STARTING, or STARTED with an open goal: Start's own rule
 *     (STARTED_ELSEWHERE), so quests and readings never see two open
 *     milestones.
 * No facts (not a roadmap goal's milestone, or no roadmap table): null.
 */
export function roadmapUnarchiveRefusalOf(facts: RoadmapUnarchiveFacts | null): string | null {
  if (!facts) return null;
  if (isSupersededRow(facts.row, facts.rows)) return ROADMAP_UNARCHIVE_REPLACED;
  if (facts.roadmapStatus !== "ACTIVE") return null;
  const live = facts.rows.some(
    (m) =>
      m.id !== facts.row.id &&
      (m.status === "STARTING" || (m.status === "STARTED" && m.goalId != null && facts.openGoalIds.has(m.goalId))) &&
      !isSupersededRow(m, facts.rows)
  );
  return live ? ROADMAP_UNARCHIVE_OTHER_LIVE : null;
}

/**
 * The facts roadmapUnarchiveRefusalOf decides from: the goal's milestone
 * with every row of its roadmap (one query), then which of the other STARTED
 * rows' goals are open (one more, only when it can change the answer: the
 * row is not already replaced, the roadmap is ACTIVE and another row is
 * STARTED). Null when the goal has no milestone or the roadmap tables are
 * missing (life_roadmap not applied); any other failure throws, so the
 * action answers "Couldn't save that" and the goal stays archived.
 */
async function loadRoadmapUnarchiveFacts(userId: string, goalId: string): Promise<RoadmapUnarchiveFacts | null> {
  const POSITION = { id: true, lineageId: true, version: true, status: true, rankIndex: true, createdAt: true, goalId: true } as const;
  try {
    const m = await prisma.roadmapMilestone.findFirst({
      where: { goalId, roadmap: { userId } },
      select: { ...POSITION, roadmap: { select: { status: true, milestones: { select: POSITION } } } },
    });
    if (!m) return null;
    const { roadmap, ...row } = m;
    const others =
      roadmap.status === "ACTIVE" && !isSupersededRow(row, roadmap.milestones)
        ? roadmap.milestones.flatMap((r) => (r.id !== row.id && r.status === "STARTED" && r.goalId ? [r.goalId] : []))
        : [];
    const open = others.length
      ? await prisma.taskTemplate.findMany({ where: { userId, id: { in: others }, archivedAt: null, closedScore: null }, select: { id: true } })
      : [];
    return { row, roadmapStatus: roadmap.status, rows: roadmap.milestones, openGoalIds: new Set(open.map((t) => t.id)) };
  } catch (err) {
    if (isMissingRoadmapTable(err)) return null;
    throw err;
  }
}

/** 'Not a must' (the drawer, F3): deferred 7 days once launched and past the 60-minute typo grace. */
export function setCompulsoryCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<RuleChangeOutcome>> {
  return applyRuleEdit(userId, templateId, { kind: "unflag" }, now);
}

/** 'Even on rest days' (the drawer, F3; musts only): on is immediate from today and never retroactive; off is deferred. */
export function setCompulsoryOnRestCore(userId: string, templateId: string, on: boolean, now: Date = new Date()): Promise<LifeResult<RuleChangeOutcome>> {
  return applyRuleEdit(userId, templateId, { kind: "rest", on }, now);
}

/** 'Keep it': cancels a pending weakening, at once (a strengthening). */
export function cancelPendingChangeCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<RuleChangeOutcome>> {
  return applyRuleEdit(userId, templateId, { kind: "cancel" }, now);
}

/**
 * How an edit marks the line it replaced. There is no column for it
 * (capture.md: no schema change), so recaptureCore archives the old row at
 * the new row's own createdAt, to the millisecond: a row created at exactly
 * an archived row's archivedAt is what replaced it. An Undo or an Archive
 * stamps the server's clock instead, which lands on another row's insert
 * time only by a same-millisecond accident. Edits of edits (X → Y → Z) are
 * followed this many hops.
 */
export const REPLACEMENT_HOPS = 5;

/**
 * The line that replaced an archived capture and still stands, following
 * edits of edits up to REPLACEMENT_HOPS; null when the row was taken back
 * (an Undo, an Archive) or is not archived, or when everything it became is
 * gone too. `replacementOf` finds the row created at exactly an archived
 * row's archivedAt: tasks.ts reads it from the database, the checks stub it.
 */
export async function standingReplacement(
  row: { id: string; archivedAt: Date | null },
  replacementOf: (archived: { id: string; archivedAt: Date }) => Promise<{ id: string; archivedAt: Date | null } | null>
): Promise<string | null> {
  if (!row.archivedAt) return null;
  let cur = { id: row.id, archivedAt: row.archivedAt };
  for (let hop = 0; hop < REPLACEMENT_HOPS; hop++) {
    const next = await replacementOf(cur);
    if (!next) return null;
    if (!next.archivedAt) return next.id;
    cur = { id: next.id, archivedAt: next.archivedAt };
  }
  return null;
}

/** standingReplacement's lookup for one player: the row inserted at exactly that archivedAt. */
function replacementIn(userId: string) {
  return (archived: { id: string; archivedAt: Date }) =>
    prisma.taskTemplate.findFirst({
      where: { userId, createdAt: archived.archivedAt, id: { not: archived.id } },
      select: { id: true, archivedAt: true },
    });
}

export const UNDO_CAPTURE_GONE = "That capture no longer exists.";
export const UNDO_CAPTURE_TOO_LATE = "Too late to undo the capture. Archive it from Today instead.";
export const UNDO_CAPTURE_REPLACED = "Your edit replaced that line. Undo the new one instead.";

/** Undo's answer. `code: 'gone'` (actions/capture.ts CaptureErrorCode) when the capture is missing or an edit replaced it. */
export type UndoCaptureResult = { ok: true; value: null } | { ok: false; error: string; code?: "gone" };

export type UndoCapturePlan = { ok: true; steps: ("untick" | "archive")[] } | { ok: false; error: string; code?: "gone" };

/**
 * What the capture toast's Undo does. Pure; undoCaptureCore follows it.
 *
 * - A missing row is 'gone'.
 * - An archived row is a repeat (a double tap, a retry after a lost answer):
 *   a no-op ok, since what Undo promised is already true. Unless an edit
 *   replaced it and the replacement still stands (`replacedBy`): then
 *   'Removed' would be false, as the edited line is still on the board, so
 *   it is refused as 'gone' with a sentence that says what happened.
 * - Past CAPTURE_UNDO_MS it is too late (exactly ten minutes is still in).
 * - Otherwise the row's ticks are netted to zero, then it is archived.
 */
export function planUndoCapture(p: { createdAt: Date | null; archivedAt: Date | null; now: Date; replacedBy?: string | null }): UndoCapturePlan {
  if (!p.createdAt) return { ok: false, error: UNDO_CAPTURE_GONE, code: "gone" };
  if (p.archivedAt) return p.replacedBy ? { ok: false, error: UNDO_CAPTURE_REPLACED, code: "gone" } : { ok: true, steps: [] };
  if (p.now.getTime() - p.createdAt.getTime() > CAPTURE_UNDO_MS) return { ok: false, error: UNDO_CAPTURE_TOO_LATE };
  return { ok: true, steps: ["untick", "archive"] };
}

/**
 * The capture toast's Undo: within ten minutes (CAPTURE_UNDO_MS, the window
 * the sheet's Undo and Edit are offered for), takes a capture back, as
 * planUndoCapture decides. A done-now capture's tick is undone first, so the
 * XP nets to zero, then the template is archived. An already-archived
 * capture is ok, so a repeat is a no-op, unless an edit replaced it: that is
 * reported, not passed off as removed. `opts.archivedAt` is recaptureCore's:
 * the new row's createdAt, the link standingReplacement follows.
 */
export async function undoCaptureCore(
  userId: string,
  templateId: string,
  now: Date = new Date(),
  opts: { archivedAt?: Date } = {}
): Promise<UndoCaptureResult> {
  const [row, instances] = await Promise.all([
    prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { createdAt: true, archivedAt: true } }),
    prisma.taskInstance.findMany({ where: { templateId, userId }, select: { id: true, status: true } }),
  ]);
  const replacedBy = row?.archivedAt ? await standingReplacement({ id: templateId, archivedAt: row.archivedAt }, replacementIn(userId)) : null;
  const plan = planUndoCapture({ createdAt: row?.createdAt ?? null, archivedAt: row?.archivedAt ?? null, now, replacedBy });
  if (!plan.ok) return plan;
  if (plan.steps.length === 0) return ok(null);
  for (const i of instances) {
    if (!isDoneStatus(i.status)) continue;
    const undone = await undoCompletionCore(userId, i.id, now);
    if (!undone.ok) return { ok: false, error: undone.error };
  }
  // A capture taken back is ten minutes old at most: inside the typo grace, so this archives at once.
  const archived = await archiveCore(userId, templateId, now, { archivedAt: opts.archivedAt ?? now });
  return archived.ok ? ok(null) : { ok: false, error: archived.error };
}

// ── Edit a line just saved (capture.md 'Edit a line you just saved') ──────

/**
 * One step of an edit, in the order recaptureCore takes them:
 *   find       (a resend only) return the row this edit's first send wrote: no write, no tick
 *   create     write the new line
 *   undo-old   take the old line back: its ticks net to zero, it is archived
 *   tick-new   tick the new line, when it is done-now
 *   keep-tick  tick the new line because the old row was ticked on Today: the edit keeps the completion
 */
export type RecaptureStep = "find" | "create" | "undo-old" | "tick-new" | "keep-tick";

export type RecapturePlan = { ok: true; steps: RecaptureStep[] } | { ok: false; code?: "gone" | "too-late"; error: string };

export const RECAPTURE_GONE = "That capture is gone.";
export const RECAPTURE_TOO_LATE = "Too late to edit the line. Change it on Today.";
export const RECAPTURE_SAME_KEY = "That edit was sent as the line it replaces, so nothing changed. Try again.";
export const RECAPTURE_OLD_STANDS =
  "Not ticked: the old line still stands, so the work would count twice. Archive it on Today, then tick this one.";
/** A kept completion that could not be made again on the new line (a goal, a refused tick): the old tick is gone with the old line. */
export const RECAPTURE_TICK_TAKEN_BACK = "The old line's tick was taken back.";
/** A resent done-now edit whose row has no tick today: nothing is ticked on a resend. */
export const RESENT_NOT_TICKED = "Saved by an earlier send, not ticked. Tick it on Today.";

/**
 * The steps an edit of a captured line takes. Pure; recaptureCore follows it.
 *
 * - The old row must exist for this player ('gone') and be at most
 *   CAPTURE_UNDO_MS old ('too-late' past it; exactly ten minutes is still
 *   in, as for the toast's Undo).
 * - An old row already archived was taken by something: this same edit's
 *   earlier send (a lost response, a reload), an earlier edit, an Undo or
 *   an Archive. Only the first left a row under this edit's captureKey
 *   (`keyRowId`), so only then is it a resend: its row comes back as it
 *   stands ('find': no second row, no second tick), in the window or past
 *   it. With no row under the key it is 'gone', never a second row beside
 *   an earlier edit's.
 * - An edit sent under the old line's own key would take back the very row
 *   it writes: refused, and nothing changes.
 * - The new line is written FIRST, so whatever fails after it costs the old
 *   row's removal (reported as oldKept), never the new words.
 * - A tick comes LAST, once the old row's ticks are netted out, so an edit
 *   pays what the line typed right the first time would have (no repeat
 *   decay against its own old tick, the knee base back where it was), and
 *   an old line that could not be taken back never leaves the same work
 *   paid twice. The new line is ticked when it is done-now ('tick-new'), or
 *   when the old row was ticked on Today and its own line was not done-now
 *   ('keep-tick': the edit keeps the completion, priced fresh). An old
 *   done-now line ('x run 30m') edited without its 'x' is not ticked: the
 *   'x' is what the edit took out.
 */
export function planRecapture(p: {
  oldCreatedAt: Date | null;
  oldArchived: boolean;
  now: Date;
  /** The new line is done-now. */
  doneNow?: boolean;
  /** The old row's id, to recognise a key that names it. */
  oldId?: string;
  /** The row already saved under this edit's captureKey (an earlier send of this same edit), or null. */
  keyRowId?: string | null;
  /** The old row has a tick standing, whatever made it. */
  oldTicked?: boolean;
  /** The old row's own line (its rawText, re-parsed: lineIsDoneNow) was done-now. */
  oldDoneNow?: boolean;
}): RecapturePlan {
  if (!p.oldCreatedAt) return { ok: false, code: "gone", error: RECAPTURE_GONE };
  if (p.keyRowId && p.keyRowId === p.oldId) return { ok: false, error: RECAPTURE_SAME_KEY };
  if (p.oldArchived) return p.keyRowId ? { ok: true, steps: ["find"] } : { ok: false, code: "gone", error: RECAPTURE_GONE };
  if (p.now.getTime() - p.oldCreatedAt.getTime() > CAPTURE_UNDO_MS) return { ok: false, code: "too-late", error: RECAPTURE_TOO_LATE };
  const tick: RecaptureStep[] = p.doneNow ? ["tick-new"] : p.oldTicked && !p.oldDoneNow ? ["keep-tick"] : [];
  return { ok: true, steps: ["create", "undo-old", ...tick] };
}

/**
 * Whether a stored capture line reads as done-now ('x run 30m', 'done the
 * dishes'), by the parser's own deterministic rule. The edit reads the old
 * row's rawText through it. Pure.
 */
export function lineIsDoneNow(rawText: string | null | undefined, today: DayKey): boolean {
  return typeof rawText === "string" && rawText.trim() !== "" && parseCapture(rawText, { today }).doneNow;
}

/**
 * What a resent edit reports for the row its first send wrote, without
 * writing or ticking anything: the tick standing on it today (completed,
 * projectedXp = what that tick paid), or, for a done-now line with none,
 * why it is not ticked. Pure.
 */
export function resentEditOf(
  created: CreatedTask,
  a: {
    /** The line is done-now and its kind can be ticked. */
    doneNow: boolean;
    createdAt: Date | string;
    today: DayKey;
    instances: readonly Pick<BoardInstance, "day" | "slot" | "status" | "xpPaid">[];
  }
): CreatedTask {
  const done = a.instances.filter((i) => i.day === a.today && isDoneStatus(i.status)).sort((x, y) => x.slot - y.slot)[0];
  if (done) return { ...created, completed: true, projectedXp: done.xpPaid };
  if (!a.doneNow) return created;
  return { ...created, doneNowError: resentTickBlock({ duplicate: true, createdAt: a.createdAt, today: a.today, instances: a.instances }) ?? RESENT_NOT_TICKED };
}

/**
 * The tick facts a saved line reports (actions/capture.ts itemOf): whether
 * a tick went through with it, so projectedXp is what it paid, and why a
 * tick it owed was not made. createTemplateCore ticks only a done-now line;
 * recaptureCore also an edit that keeps the old row's tick from Today, so
 * the facts are the result's, not re-derived from the new line's 'x'. Pure.
 */
export function tickFactsOf(created: Pick<CreatedTask, "completed" | "doneNowError">): { doneNow: boolean; doneNowError: string | null } {
  return { doneNow: created.completed, doneNowError: created.doneNowError };
}

export type RecaptureResult =
  | { ok: true; value: CreatedTask & { replacedId: string; oldKept: boolean } }
  | { ok: false; error: string; code?: "gone" | "too-late" };

/**
 * Replaces a line captured under ten minutes ago with its edited text
 * (`parsed` is the server's own parse of `rawText`), following
 * planRecapture over one read wave: the old row (its age, whether it is
 * archived, its own line, its ticks) and the row this edit's captureKey
 * already wrote. Idempotent under that key: a resend returns the row its
 * first send wrote (resentEditOf), never a second row or a second tick, and
 * never takes the old one back twice. The old row is archived at the new
 * row's createdAt, the link Undo follows (standingReplacement).
 *
 * `oldKept` is true when the new line was saved but the old one could not
 * be taken back (its tick no longer undoable, say); a done-now line is then
 * left unticked, with the reason. A tick made here, done-now or kept from
 * the old row's tick on Today, is in the result (completed, and projectedXp
 * is what it paid); when it could not be made, doneNowError says why.
 */
export async function recaptureCore(
  userId: string,
  oldId: string,
  parsed: ParsedCapture,
  opts: { rawText: string; captureKey?: string | null; captureSource?: CaptureSource; now?: Date }
): Promise<RecaptureResult> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const captureKey = cleanCaptureKey(opts.captureKey);
  const validOld = typeof oldId === "string" && oldId.length > 0 && oldId.length <= 64;
  const [old, oldTicks, keyRow] = await Promise.all([
    validOld
      ? prisma.taskTemplate.findFirst({ where: { id: oldId, userId }, select: { createdAt: true, archivedAt: true, rawText: true } })
      : null,
    validOld ? prisma.taskInstance.findMany({ where: { templateId: oldId, userId }, select: { status: true } }) : [],
    captureKey ? prisma.taskTemplate.findFirst({ where: { userId, captureKey }, select: { id: true } }) : null,
  ]);
  const plan = planRecapture({
    oldCreatedAt: old?.createdAt ?? null,
    oldArchived: !!old?.archivedAt,
    now,
    doneNow: parsed.doneNow,
    oldId,
    keyRowId: keyRow?.id ?? null,
    oldTicked: oldTicks.some((i) => isDoneStatus(i.status)),
    oldDoneNow: old ? lineIsDoneNow(old.rawText, today) : false,
  });
  if (!plan.ok) return plan.code ? { ok: false, error: plan.error, code: plan.code } : { ok: false, error: plan.error };

  if (plan.steps[0] === "find") {
    const found = keyRow ? await readCaptured(userId, keyRow.id, now) : null;
    if (!found) return { ok: false, error: RECAPTURE_GONE, code: "gone" };
    const resent = resentEditOf(found.created, {
      doneNow: wantsDoneNowTick(parsed, found.t),
      createdAt: found.t.createdAt,
      today: found.today,
      instances: found.instances,
    });
    return ok({ ...resent, replacedId: oldId, oldKept: false });
  }

  const w = await insertCapture(userId, parsed, { rawText: opts.rawText, captureSource: opts.captureSource ?? "quick", captureKey, now });
  // Sent under the old line's own key (a race past the plan's check), the 'new' row IS the old one: taking it back would lose the line.
  if (w.created.id === oldId) return { ok: false, error: RECAPTURE_SAME_KEY };

  let oldKept = false;
  try {
    const undone = await undoCaptureCore(userId, oldId, now, { archivedAt: new Date(w.t.createdAt) });
    if (!undone.ok) {
      oldKept = true;
      console.warn("Recapture kept the old line:", undone.error);
    }
  } catch (err) {
    console.error("Recapture could not take back the old line:", err);
    oldKept = true;
  }

  let created = w.created;
  if (plan.steps.includes("tick-new") && wantsDoneNowTick(parsed, w.t)) {
    created = oldKept ? { ...created, doneNowError: RECAPTURE_OLD_STANDS } : await tickUnlessResent(userId, w);
  } else if (plan.steps.includes("keep-tick") && !oldKept) {
    // The old row's tick on Today was netted out with it; the edit keeps the
    // completion on the new row, priced fresh. (Kept old line: its tick stands.)
    const kept = tickableKind(w.t) ? await tickUnlessResent(userId, w) : created;
    created = kept.completed
      ? kept
      : { ...kept, doneNowError: kept.doneNowError ? `${RECAPTURE_TICK_TAKEN_BACK} ${kept.doneNowError}` : RECAPTURE_TICK_TAKEN_BACK };
  }
  return ok({ ...created, replacedId: oldId, oldKept });
}

// ── A pasted list (capture.md 'Paste a list') ─────────────────────────────

/** One pasted line as the batch hands it to the saver: its own validated key, the rest still to sanitize. */
export interface CaptureBatchLine {
  text: unknown;
  reverted: unknown;
  captureKey: string;
}

export type CaptureBatchOutcome<I> = { ok: true; item: I } | { ok: false; captureKey: string; error: string };

export const BATCH_TOO_MANY = `Only ${CAPTURE_BATCH_MAX} lines can be added at once. This one is kept: add it again.`;
export const BATCH_NO_KEY = "This line was sent without its save key, so a retry could add it twice. It is kept: add it again.";
export const BATCH_SAME_KEY = "This line was sent with another line's save key. It is kept: add it again.";
export const BATCH_THREW = "Couldn't save it. Your line is kept — try again.";

/**
 * Saves a pasted list one line at a time, in order, and answers for every
 * line in the order sent. Each line is all-or-nothing on its own: `save`
 * writes it under its captureKey (so a retry finds what an earlier send
 * wrote), and a refusal or a throw fails only that line, with its key, so
 * the sheet keeps it. A line past CAPTURE_BATCH_MAX, without a valid key,
 * or reusing an earlier line's key is refused before anything is written:
 * a shared key would make the second line come back as the first.
 */
export async function runCaptureBatch<I>(
  lines: unknown,
  save: (line: CaptureBatchLine) => Promise<LifeResult<I>>
): Promise<CaptureBatchOutcome<I>[]> {
  const list: unknown[] = Array.isArray(lines) ? lines : [];
  const seen = new Set<string>();
  const out: CaptureBatchOutcome<I>[] = [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i] && typeof list[i] === "object" ? (list[i] as Record<string, unknown>) : {};
    const key = cleanCaptureKey(raw.captureKey);
    const sentKey = key ?? (typeof raw.captureKey === "string" ? raw.captureKey.slice(0, 64) : "");
    const refuse = (error: string) => out.push({ ok: false, captureKey: sentKey, error });
    if (i >= CAPTURE_BATCH_MAX) refuse(BATCH_TOO_MANY);
    else if (!key) refuse(BATCH_NO_KEY);
    else if (seen.has(key)) refuse(BATCH_SAME_KEY);
    else {
      seen.add(key);
      try {
        const res = await save({ text: raw.text, reverted: raw.reverted, captureKey: key });
        out.push(res.ok ? { ok: true, item: res.value } : { ok: false, captureKey: key, error: res.error });
      } catch (err) {
        console.error("Pasted line not saved:", err);
        refuse(BATCH_THREW);
      }
    }
  }
  return out;
}


/**
 * One-tap clarify for an inbox item. 'idea' keeps it in the inbox as an idea
 * draft and hands back the Add page that finishes it. A deadline the item
 * was captured with ('pay rent by fri?') is kept through every choice:
 * 'Today' or 'Tomorrow' only plans when to do it (planDay), and 'Anytime'
 * never drops it — clarifying is not a way to shed a deadline.
 */
export async function clarifyInboxCore(
  userId: string,
  templateId: string,
  choice: InboxChoice,
  parentId: string | null = null,
  now: Date = new Date()
): Promise<LifeResult<ClarifyOutcome>> {
  const today = todayKey(now);
  // A drop is an archive, and archiveCore decides it (M2: deferred on a must).
  if (choice === "drop") {
    const dropped = await archiveCore(userId, templateId, now);
    if (!dropped.ok) return fail(dropped.error === "That task no longer exists." ? "That item no longer exists." : dropped.error);
    return ok({ href: null, effect: dropped.value.effect, effectiveDay: dropped.value.effectiveDay });
  }
  const row = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId, archivedAt: null }, select: RULE_SELECT });
  if (!row) return fail("That item no longer exists.");
  const asTask = row.kind === "IDEA_DRAFT" ? "TASK" : undefined;
  const deadline = row.dueKind === "DEADLINE" && !!row.dueDay;
  // M2 (F3, decisions 17 and 31): the classifier on a must. A must leaving
  // the inbox is owed from today, never before (a prior segment rides on the
  // same update); a scheduled must sent back to the inbox as an idea waits
  // out the akrasia horizon, so it is refused with the way out.
  const duty = planClarifyRule(ruleRowOf(row), choice, { today, now, launched: isDutyLaunched(today) });
  if (!duty.ok) return fail(duty.error);
  const pendingChange =
    duty.value.pendingChange === undefined
      ? {}
      : { pendingChange: duty.value.pendingChange == null ? Prisma.DbNull : (duty.value.pendingChange as unknown as Prisma.InputJsonValue) };

  switch (choice) {
    case "today":
    case "tomorrow": {
      const day = choice === "today" ? today : addDays(today, 1);
      // Putting a deadline off to tomorrow: a must is never put off past its own day (moveBlockOf, as rescheduleCore).
      if (choice === "tomorrow" && !row.recurrence && deadline) {
        const block = moveBlockOf({ recurrence: null, compulsory: row.compulsory, dueKind: "DEADLINE", dueDay: keyOrNull(row.dueDay), completedAt: null }, day, today);
        if (block) return fail(block);
      }
      await prisma.taskTemplate.update({
        where: { id: templateId },
        data: row.recurrence
          ? { inbox: false, kind: asTask, ...pendingChange }
          : deadline
            ? { inbox: false, kind: asTask, planDay: day > today ? dateColumn(day) : null, ...pendingChange }
            : { inbox: false, kind: asTask, dueDay: dateColumn(day), dueKind: "PLANNED", planDay: null, ...pendingChange },
      });
      break;
    }
    case "anytime":
      await prisma.taskTemplate.update({
        where: { id: templateId },
        data: deadline
          ? { inbox: false, kind: asTask, planDay: null, ...pendingChange }
          : { inbox: false, kind: asTask, dueDay: null, dueKind: null, planDay: null, ...pendingChange },
      });
      break;
    case "goal": {
      if (!parentId) return fail("Pick a goal.");
      const goal = await prisma.taskTemplate.findFirst({ where: { id: parentId, userId, kind: "GOAL", archivedAt: null, closedScore: null }, select: { id: true } });
      if (!goal) return fail("That goal is closed or no longer exists.");
      await prisma.taskTemplate.update({ where: { id: templateId }, data: { inbox: false, kind: asTask, parentId: goal.id, ...pendingChange } });
      break;
    }
    case "idea":
      await prisma.taskTemplate.update({ where: { id: templateId }, data: { kind: "IDEA_DRAFT", inbox: true } });
      invalidate("life", "activity");
      return ok({ href: `/add?draft=${encodeURIComponent(templateId)}`, effect: "immediate", effectiveDay: null });
    default:
      return fail("Unknown choice.");
  }
  invalidate("life", "activity");
  return ok({ href: null, effect: "immediate", effectiveDay: null });
}

/** What a clarify did: where to go next (an idea draft's Add page), and whether a drop was deferred (M2: a must's archive waits 7 days). */
export interface ClarifyOutcome {
  href: string | null;
  effect: "immediate" | "deferred";
  effectiveDay: DayKey | null;
}

/**
 * Renames a task. The normTitle (its repeat-decay and grade-copy key) and
 * its grade stay: a new name is not a new task. A title renamed away from
 * its key is never sized by the AI and never lends its grade to another
 * capture (life-lexicon.ts titleMatchesKey, pickCopySource), so a rename
 * cannot file a grade made for other words under this one's key.
 */
export async function renameCore(userId: string, templateId: string, title: string): Promise<LifeResult<{ title: string }>> {
  const clean = title.trim().replace(/\s+/g, " ").slice(0, TITLE_MAX);
  if (!clean) return fail("A task needs a title.");
  const res = await prisma.taskTemplate.updateMany({ where: { id: templateId, userId, archivedAt: null }, data: { title: clean } });
  if (res.count === 0) return fail("That task no longer exists.");
  invalidate("life", "activity");
  return ok({ title: clean });
}

// ── Goals ─────────────────────────────────────────────────────────────────

const GOAL_OP_RE = /^[A-Za-z0-9:_-]{4,64}$/;

/** What '+1' on a roadmap milestone's goal answers (F16 seam 5): its g comes from stored readings, never from taps. */
export const ROADMAP_GOAL_PROGRESS_REFUSAL = "This goal is measured from your records.";

/** Why a goal takes no '+1', or null when it does. A ROADMAP goal never does. Pure; capture-server-check holds it. */
export function goalProgressRefusalOf(goal: { krMetric: string | null }): string | null {
  return goal.krMetric === "ROADMAP" ? ROADMAP_GOAL_PROGRESS_REFUSAL : null;
}

/**
 * '+1' on a goal measured by hand: a GOAL_PROGRESS row with its qty. Counts
 * for the day's streak (it is real work); pays nothing until M5. Progress
 * only goes up: a negative 'correction' would keep a streak alive on zero
 * net progress, so it waits for a proper undo. `opId`, one per tap, makes
 * a tap that reaches the server twice count once ('goal:<tpl>:<opId>').
 * A roadmap milestone's goal (krMetric ROADMAP) is refused before any
 * write: it is measured from its readings (goalProgressRefusalOf).
 */
export async function goalProgressCore(
  userId: string,
  templateId: string,
  qty: number = 1,
  now: Date = new Date(),
  opId: string | null = null
): Promise<LifeResult<{ qty: number }>> {
  const n = goalProgressQty(qty);
  if (n === null) return fail(Number.isFinite(qty) && qty < 0 ? "Progress can only be added." : "Nothing to add.");
  // A closed goal (M5) takes no more progress: its close measured it for good.
  const goal = await prisma.taskTemplate.findFirst({
    where: { id: templateId, userId, kind: "GOAL", archivedAt: null, closedScore: null },
    select: { id: true, krMetric: true },
  });
  if (!goal) return fail("That goal is closed or no longer exists.");
  const refusal = goalProgressRefusalOf(goal);
  if (refusal) return fail(refusal);
  const key = opId && GOAL_OP_RE.test(opId) ? `goal:${templateId}:${opId}` : null;
  const row = await recordActivity(userId, {
    source: "GOAL_PROGRESS",
    sink: "NONE",
    occurredAt: now,
    templateId,
    sourceId: templateId,
    qty: n,
    countsForStreak: true,
    dedupeKey: key,
  });
  invalidate("life", "activity");
  return ok({ qty: row.qty ?? n });
}

// ── Settings ──────────────────────────────────────────────────────────────

const CAPACITY_MIN = 30;
const CAPACITY_MAX = 16 * 60;

/**
 * The player's own daily capacity, in minutes. Until this is set the Today
 * tile's figure is only the default (capacitySet false) and may not warn.
 */
export async function setDailyCapacityCore(userId: string, minutes: number, now: Date = new Date()): Promise<LifeResult<{ minutes: number }>> {
  if (!Number.isFinite(minutes)) return fail("Pick a number of minutes.");
  const m = Math.max(CAPACITY_MIN, Math.min(CAPACITY_MAX, Math.round(minutes / 5) * 5));
  await prisma.lifeSettings.upsert({
    where: { userId },
    create: { userId, ...newLifeSettingsData(todayKey(now)), dailyCapacityMin: m, capacitySetAt: now },
    update: { dailyCapacityMin: m, capacitySetAt: now },
  });
  invalidate("life", "activity");
  return ok({ minutes: m });
}

// ── Self-rating ───────────────────────────────────────────────────────────

/**
 * Sets the self-rating (life-grade.ts's clamp): the effective band never
 * above the machine band + 1, never below INTRO. It affects future
 * completions only, prints 'self-rated' on every receipt, and after the
 * first completion can change at most once per seven life days. The first
 * completion is when the grade froze, since a tick is the only thing that
 * writes `gradeFrozenAt`.
 */
export async function setBandOverrideCore(userId: string, templateId: string, override: number, now: Date = new Date()): Promise<LifeResult<{ bandOverride: number }>> {
  const row = await prisma.taskTemplate.findFirst({
    where: { id: templateId, userId, archivedAt: null },
    select: { band: true, bandOverride: true, bandOverrideAt: true, gradeFrozenAt: true },
  });
  if (!row) return fail("That task no longer exists.");
  const clamped = clampBandOverride(asBand(row.band), override);
  if (clamped === row.bandOverride) return ok({ bandOverride: clamped });
  const rating = { firstCompletedAt: row.gradeFrozenAt, bandOverrideAt: row.bandOverrideAt };
  if (!selfRatingOpen(rating, now)) {
    const opensOn = selfRatingOpensOn(rating);
    return fail(opensOn ? `The size can change again from ${weekdayName(opensOn)} ${shortDate(opensOn)}.` : "The size can't change yet.");
  }
  await prisma.taskTemplate.update({ where: { id: templateId }, data: { bandOverride: clamped, bandOverrideAt: now } });
  invalidate("life", "activity");
  return ok({ bandOverride: clamped });
}

/** resizableCore's refusal for a plan-born task (contracts §16.4): its size is the plan's, never a model's. */
export const PLAN_BORN_RESIZE_REFUSAL = "A plan-born task's size comes from its practice.";

/**
 * Whether a template may still be re-sized by the AI: paid work, not
 * plan-born, not frozen, not renamed, and its one retry unused. A plan-born
 * task (roadmap Start, captureKey 'rm:…') is never re-sized: no model sizes
 * or explains one (roadmap decision 50), so Resize never reaches the model.
 */
export async function resizableCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<null>> {
  const row = await prisma.taskTemplate.findFirst({
    where: { id: templateId, userId, archivedAt: null },
    select: { gradeFrozenAt: true, createdAt: true, gradeAttempts: true, kind: true, title: true, normTitle: true, captureKey: true },
  });
  if (!row) return fail("That task no longer exists.");
  if (row.kind === "GOAL" || row.kind === "IDEA_DRAFT") return fail("Goals and idea drafts aren't sized; only tasks are.");
  if (isRoadmapCaptureKey(row.captureKey)) return fail(PLAN_BORN_RESIZE_REFUSAL);
  if (isGradeFrozen(row, now)) {
    return fail("The size is frozen: it was completed, or captured over a day ago. Self-rate it instead.");
  }
  if (!titleMatchesKey(row)) return fail("A renamed task keeps its size. Self-rate it instead.");
  if (row.gradeAttempts >= SIZING_MAX_ATTEMPTS) return fail("It has already been re-sized once.");
  return ok(null);
}

// ── The revision loop ─────────────────────────────────────────────────────

/** Life days whose DAY_OPEN this process has already written, so a page render writes at most once a day. Forgotten on a reset. */
const dayOpened = new EpochSet();

/**
 * The first render of /today or /review in a life day records how many
 * cards were due: the quest's fixed target for the day. Call it inside
 * `after()`. Sink NONE, never counts for the streak (opening the app is not
 * work), and idempotent on 'dayopen:<day>'.
 */
export async function recordDayOpen(userId: string, dueCount: number, now: Date = new Date()): Promise<void> {
  const day = todayKey(now);
  const key = `${userId}:${day}`;
  const epoch = await memoEpoch();
  if (dayOpened.has(epoch, key)) return;
  dayOpened.add(epoch, key);
  try {
    await recordActivity(userId, {
      source: "DAY_OPEN",
      sink: "NONE",
      occurredAt: now,
      day,
      qty: Math.max(0, Math.round(dueCount)),
      countsForStreak: false,
      dedupeKey: `dayopen:${day}`,
    });
  } catch (err) {
    dayOpened.delete(epoch, key);
    console.error("DAY_OPEN not recorded:", err);
  }
}

/** Study tasks this process has seen recorded as done, by 'templateId:day'. Forgotten on a reset. */
const autoDoneToday = new EpochSet();

/** Whether a study task could be due today, judged from the template alone (no instances needed). */
function mayBeDueToday(t: BoardTemplate, today: DayKey): boolean {
  if (t.startDay > today) return false;
  const rule = ruleOf(t);
  if (!rule) return !t.completedAt && !(t.dueKind === "PLANNED" && t.dueDay !== null && t.dueDay > today) && !(t.planDay && t.planDay > today);
  return rule.kind === "AFTER" || rule.kind === "TARGET" || occursOn(rule, t.startDay, today);
}

/** Templates that complete themselves from study, cached so the review path pays nothing when there are none. */
function loadAutoTemplates(userId: string, now: Date): Promise<BoardTemplate[]> {
  return cached(`autoTasks:${userId}`, ["life"], async () => {
    const rows = await prisma.taskTemplate.findMany({
      where: { userId, archivedAt: null, autoMetric: { in: [...STUDY_METRICS] } },
      select: TEMPLATE_SELECT,
    });
    return rows.map((r) => toBoardTemplate(r, now));
  });
}

/**
 * Completes today's study-linked tasks whose target today's activity has
 * met ('review 20 daily', 'add 3 ideas by fri', 'review due'). Each writes a
 * DONE instance (source auto:reviews / auto:ideas) and a 0-XP TASK row with
 * sink NONE — the reviews already paid, through the Domain. Runs in the
 * review path's after() and after a /today render; a no-op, with no query,
 * when no such task exists. Returns how many it completed.
 */
export async function autoCompleteStudyTasks(userId: string, now: Date = new Date()): Promise<number> {
  const today = todayKey(now);
  const epoch = await memoEpoch();
  // Every review lands here, so the common cases must cost nothing: no study
  // tasks at all, none scheduled today, or all of today's already recorded.
  const autos = (await loadAutoTemplates(userId, now)).filter((t) => !autoDoneToday.has(epoch, `${t.id}:${today}`) && mayBeDueToday(t, today));
  if (autos.length === 0) return 0;

  const ids = autos.map((a) => a.id);
  const needsDue = autos.some((a) => a.autoMetric !== "IDEAS");
  const [instances, totals, events, dueNow, lastDoneRows, debtRows] = await Promise.all([
    prisma.taskInstance.findMany({ where: { userId, templateId: { in: ids }, day: dateColumn(today) }, select: INSTANCE_SELECT }),
    readDayTotals(userId, [today]),
    readDayTaskEvents(userId, [today]),
    needsDue ? loadDueNow(today, now) : Promise.resolve(null),
    prisma.taskInstance.groupBy({
      by: ["templateId"],
      // MADE_UP (M2) reads done on the board, as today-board DONE_STATUSES does.
      where: { userId, templateId: { in: ids }, status: { in: ["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"] } },
      _max: { day: true },
    }),
    // M2 (decision 18): a debited one-off is made up from its card, never auto-completed beside it.
    prisma.taskInstance.findMany({ where: { userId, templateId: { in: ids }, debtOpen: true }, select: { templateId: true } }),
  ]);
  const debited = new Set(debtRows.map((r) => r.templateId));

  const ledger = ledgerOf(today, totals, events);
  const kneeRows = kneeRowsOf(today, totals);
  const history = instances.map(toBoardInstance);
  const doneToday = new Set(history.filter((i) => isDoneStatus(i.status)).map((i) => i.templateId));
  for (const id of doneToday) autoDoneToday.add(epoch, `${id}:${today}`);
  const lastDone: Record<string, DayKey | null> = {};
  for (const r of lastDoneRows) lastDone[r.templateId] = r._max.day ? keyOfDateColumn(r._max.day) : null;

  const plans = planAutoCompletions({
    templates: autos,
    today,
    counts: { reviews: ledger.reviews, ideas: ledger.ideas, dueNow },
    doneToday,
    lastDone,
  });

  let completed = 0;
  for (const p of plans) {
    if (debited.has(p.template.id) && !ruleOf(p.template)) {
      // Nothing to auto-complete today: its card is the one path (and the memo spares the next review the read).
      autoDoneToday.add(epoch, `${p.template.id}:${today}`);
      continue;
    }
    const read: CompletionRead = {
      t: p.template,
      history: history.filter((i) => i.templateId === p.template.id),
      events,
      ledger,
      kneeRows,
      debited: debited.has(p.template.id),
    };
    try {
      const res = await settleCompletion(
        userId,
        read,
        { day: today, today, slot: 0, now, auto: true, countsForStreak: p.state.worked, detail: p.state.label },
        // An earlier study task in this loop moved the day's rows: re-read this one fresh.
        () => readForCompletion(userId, p.template.id, today, today, now)
      );
      if (res.ok) autoDoneToday.add(epoch, `${p.template.id}:${today}`);
      if (res.ok && !res.value.duplicate) completed += 1;
    } catch (err) {
      console.error("Study task not auto-completed:", err);
    }
  }
  return completed;
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}
