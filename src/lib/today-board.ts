/**
 * The Today board, as pure selectors.
 *
 * Everything that decides what the board shows and what a tick pays lives
 * here, with no database and no clock, so the server and the browser run the
 * same code. That is what makes "a tick pays exactly what the row says" true
 * by construction rather than by care: the row's '≈ N XP' is
 * `planCompletion(...)` against the day's ledger, and the server pays
 * `planCompletion(...)` against the same ledger read in one wave. The browser
 * also runs it against its own optimistic ledger, so after a tick the next
 * rows re-price against the new knee base before the round trip returns.
 *
 * `tasks.ts` reads the rows and writes the ledger; this module only turns
 * rows into decisions. Nothing here throws on odd data: a template with an
 * unparseable rule falls back to a one-off, a missing stat to zero.
 */
import type { TaskStyle } from "./task-style";
import { paidByStepsOf, stepsAllowed, type Subtask, type SubtaskDay } from "./subtasks";
import { addDays, daysBetween, dayKeyOf, weekdayOf, LIFE_TZ, DAY_START_HOUR, type DayKey } from "./life-day";
import type {
  ActivityInput,
  AutoMetric,
  Band,
  BoardPlace,
  Category,
  DueKind,
  GradeSource,
  Horizon,
  InstanceSource,
  InstanceStatus,
  KrMetric,
  PayMode,
  PriceInput,
  Receipt,
  Sink,
  StepShare,
  TaskKind,
  Timing,
  Track,
} from "./life-types";
import type { Attribute } from "@prisma/client";
import { STUDY_AUTO_METRICS, UNDO_WINDOW_MINUTES, effBand, estEff, payModeOf, priceTask, receiptBandOf, timingFor } from "./life-grade";
import { repeatNOf } from "./life-lexicon";
import { describeRule, nextDue, occursOn, parseRule, periodProgress, scheduledPerWeek, type Rule } from "./recurrence";
import {
  ROADMAP_CAPTION,
  goalAsOf,
  goalProgress,
  goalProgressLabel,
  progressQtyAsOf,
  roadmapPointAsOf,
  stepsDoneAsOf,
  type GoalProgressInput,
  type GoalProgressRow,
  type RoadmapGoalEntry,
} from "./goals";
// Type-only (erased): the zero-reason codes the fallback words must cover, and a goal's seat (revision 5).
import type { GoalSlot, StatedZeroReason } from "./roadmap-types";
import {
  HABIT_WINDOW_DAYS,
  habitStrength,
  keptToNextRung,
  perDutyStreak,
  rungOf,
  type DutyStreak,
  type HabitRung,
  type InstanceLike,
  type StreakOptions,
} from "./habit";
import { expectedOn, ruleOn, type DutyTemplate, type PendingChange, type PendingNext } from "./duty-rule";
import { settledFor, type RestKind } from "./duty-economy";
import type { DutyBoard, OwedCard } from "./duty-view";

// ── Constants ─────────────────────────────────────────────────────────────

/**
 * How far back the per-duty streak and habit strength read (habit.ts's own
 * window), so the board's projection and the server's price see the same
 * history: long enough for a weekly habit to reach Automatic and every rule
 * to reach the consistency cap, short enough to stay one modest query.
 */
export const HISTORY_DAYS = HABIT_WINDOW_DAYS;

/** An undo is accepted this long after the tick, and only on the same life day. */
export const UNDO_WINDOW_MS = UNDO_WINDOW_MINUTES * 60_000;

/** A deadline joins the Today lane this many days before it falls; further off it waits in Anytime. */
export const DEADLINE_LOOKAHEAD_DAYS = 2;

/** The drawer's minute chips. */
export const MINUTE_CHIPS = [10, 20, 30, 45, 60, 90] as const;

/** Tasks linked to study pay 0 life XP: the reviews already paid (sink DOMAIN). */
export const STUDY_METRICS: ReadonlySet<AutoMetric> = new Set<AutoMetric>(STUDY_AUTO_METRICS);

/** The board's sections, top to bottom on a phone. Desktop splits them into two columns in this order. */
export const BOARD_SECTIONS = ["quest", "must", "today", "yesterday", "goals", "anytime", "inbox"] as const;
export type BoardSection = (typeof BOARD_SECTIONS)[number];

/** The two desktop columns, each in the order above. */
export const BOARD_COLUMNS: readonly [readonly BoardSection[], readonly BoardSection[]] = [
  ["quest", "must", "today", "yesterday"],
  ["goals", "anytime", "inbox"],
];

export type Lane = "must" | "today" | "yesterday" | "anytime";

/** One-tap answers for an inbox item. */
export type InboxChoice = "today" | "tomorrow" | "anytime" | "goal" | "idea" | "drop";

// ── Shapes the server hands the board ─────────────────────────────────────

/** The fields a price reads. */
export interface PricedTemplate {
  id: string;
  title: string;
  normTitle: string;
  recurrence: string | null;
  dueDay: DayKey | null;
  dueKind: DueKind | null;
  intrinsic: boolean;
  autoMetric: AutoMetric | null;
  mvv: string | null;
  track: Track;
  band: Band;
  bandOverride: number;
  estMinutes: number;
  machineMinutes: number;
}

/** A template as the board needs it: the rule, the frozen grade and how it was sized. */
export interface BoardTemplate extends PricedTemplate {
  kind: TaskKind;
  inbox: boolean;
  startDay: DayKey;
  /**
   * A one-off put off to this day ('Move to tomorrow' on a deadline): off
   * the board until then. It never touches dueDay, so a deadline keeps its
   * day and its late factor. Absent is the same as null.
   */
  planDay?: DayKey | null;
  horizon: Horizon | null;
  parentId: string | null;
  krMetric: KrMetric | null;
  krTarget: number | null;
  krUnit: string | null;
  compulsory: boolean;
  autoTarget: number | null;
  category: Category;
  lexicalBand: Band;
  aiBand: Band | null;
  gradeSource: GradeSource;
  gradeConfidence: number;
  gradeBasis: string | null;
  gradeModel: string | null;
  gradePromptVersion: number | null;
  gradeAttempts: number;
  /** Frozen at the first completion or 24 h after capture, whichever came first. */
  gradeFrozen: boolean;
  /** Captured moments ago and still waiting on its one AI sizing. */
  sizing: boolean;
  bandOverrideAt: string | null;
  gradeFrozenAt: string | null;
  topAttribute: Attribute | null;
  note: string | null;
  completedAt: string | null;
  createdAt: string;
  sortOrder: number;
  /**
   * A goal's MP, stated when it was set and frozen (M5; goals.ts reads
   * goalMp ?? statedGoalMp(horizon)). null on a non-goal and on a goal set
   * before launch's stateGoalMp. Absent reads as null.
   */
  goalMp?: number | null;
  /** Set once a goal is closed (its g at the close; 0 when unmeasured). A closed goal leaves the board. Absent reads as null. */
  closedScore?: number | null;
  /**
   * M2 (lane 0 type; lane D fills it): TaskTemplate.pendingChange read
   * through duty-rule.ts parsePendingChange. The board decides compulsory,
   * compulsoryOnRest and archived per day through duty-rule.ts ruleOn.
   * Absent reads as null.
   */
  pendingChange?: PendingChange | null;
  /**
   * M2 (lane D): TaskTemplate.compulsoryOnRest, 'Even on rest days'. A must
   * with it stays owed on a rest, sick or vacation day. Absent reads as
   * BoardData.duty.rules' value, else false.
   */
  compulsoryOnRest?: boolean;
  /** M2 (lane D): TaskTemplate.mvvMinutes, the minimum version's minutes. Absent reads as null. */
  mvvMinutes?: number | null;
  /**
   * Roadmap (lane 0 type; lane G fills it through TEMPLATE_SELECT):
   * TaskTemplate.captureKey. A roadmap goal is 'rm:<milestoneId>', its
   * practices and steps 'rm:<milestoneId>:p<i>' / ':s<i>'. Absent reads as null.
   */
  captureKey?: string | null;
}

export interface BoardInstance {
  id: string;
  templateId: string;
  day: DayKey;
  slot: number;
  status: InstanceStatus;
  source: InstanceSource;
  xpPaid: number;
  /** M2 (lane D): TaskInstance.repaired, a make-up inside the restore window ('12 days · repaired'). Absent reads false. */
  repaired?: boolean;
}

/** Per recurring template, derived from its whole recent history on the server. */
export interface TemplateStats {
  /** The last day it was done, for AFTER rules. */
  lastDone: DayKey | null;
  /** The per-duty streak with today still open, and as it will read once today is done. */
  streak: { before: DutyStreak; ifDone: DutyStreak };
  /** Habit strength (Loop EWMA), the same two ways. */
  strength: { before: number; ifDone: number };
  /** Day-equivalents C pays on when yesterday is recorded now. */
  streakDaysYesterday: number;
  /** Share of scheduled occurrences kept over the last 28 days; null until there is a schedule to judge. */
  keptRatio28: number | null;
}

/** One live completion in a day's ledger: what repeat decay and the INTRO count read. */
export interface LedgerCompletion {
  eventId: string;
  templateId: string | null;
  /** The template's normTitle: the repeat-decay key. */
  groupKey: string;
  intro: boolean;
  raw: number;
  xp: number;
  sink: Sink;
}

/** One life day's ledger, reduced to what pricing and the tiles read. */
export interface DayLedger {
  day: DayKey;
  /** R_before for the next completion: SUM(rawXp) of the day. */
  rawBefore: number;
  /** SUM(xp) of the day's TRACK rows: life XP, after the knee. */
  lifeXp: number;
  /** TASK rows not undone. */
  completions: LedgerCompletion[];
  reviews: number;
  /** SUM(xp) of the day's REVIEW rows (sink DOMAIN): what reviews paid, never life XP. */
  reviewXp: number;
  ideas: number;
  /** Cards due when the day was first opened; null until the DAY_OPEN row is written. */
  dayOpenQty: number | null;
}

/** The TASK row that paid an instance, for its receipt and its undo. */
export interface PaidRecord {
  eventId: string;
  instanceId: string;
  receipt: Receipt | null;
  occurredAt: string;
  xp: number;
  undone: boolean;
}

/** Everything the board is built from, as the server reads it in one wave. Serialisable. */
export interface BoardData {
  /** Each template's chosen icon and colour (task-style-server loadTaskStyles); absent or missing: the defaults. */
  styles?: Record<string, TaskStyle>;
  /** Each template's steps and the ones ticked today (subtasks-server loadSubtasks); absent: no task has steps. */
  subtasks?: Record<string, SubtaskDay>;
  today: DayKey;
  yesterday: DayKey;
  capacityMin: number;
  /** Whether the player chose capacityMin (LifeSettings.capacitySetAt); false while it is the default. */
  capacitySet?: boolean;
  templates: BoardTemplate[];
  /** Instances from the start of the current month or week (whichever is earlier) and yesterday on. */
  instances: BoardInstance[];
  stats: Record<string, TemplateStats>;
  ledger: { today: DayLedger; yesterday: DayLedger };
  /** Keyed by instance id. */
  paid: Record<string, PaidRecord>;
  /** Σ GOAL_PROGRESS qty per goal. */
  goalQty: Record<string, number>;
  /**
   * Σ GOAL_PROGRESS qty per open goal per life day (M5): what goalProgress
   * measures as of min(today, due day), so a number logged after the due day
   * never counts. tasks.ts always sends it. Absent (an older fixture), a
   * goal's goalQty counts as logged on the day the goal was set.
   */
  goalDays?: Record<string, GoalProgressRow[]>;
  /** Cards due now; null where the caller did not read it (the nav count). */
  dueNow: number | null;
  /**
   * M2 (lane D, F12): what the board shows of Duty — open debts, rest,
   * freezes, the settlement cursor, pending rule changes and the settled-day
   * facts (duty-view.ts dutyBoardOf). Absent: the pre-M2 board, exactly.
   */
  duty?: DutyBoard;
  /**
   * Roadmap (lane 0 type; lane T fills it, F16 seam 3): each open ROADMAP
   * goal's stored series (with its binding class and label), "Roadmap ·
   * milestone 2 of 3", the "pays nothing · …" reason and the note of a goal
   * never measured again ("measures removed by a reset", "replaced by Start
   * again"; its series is empty), keyed by goal id. Read with one query only when
   * such a goal exists; a missing table reads as none. Absent: no roadmap goals.
   * Revision 5 (contracts §23.3; lane 3): an entry may carry its goal's seat
   * (RoadmapGoalSeat), which the loader reads only once GOALS_MAX > 1.
   */
  roadmapGoals?: Record<string, RoadmapGoalEntrySeated>;
}

/**
 * Revision 5 (contracts §23.3; lane 3): the seat of a ROADMAP goal's roadmap
 * beside its BoardData.roadmapGoals entry: the goal's slot (null for a
 * paused goal, whose stored slot may be another's: ruling 55) and how many
 * goals are open (DRAFT and ACTIVE). Today's goal chip shows the seat only
 * with 2 or more goals open (D39).
 */
export interface RoadmapGoalSeat {
  slot: GoalSlot | null;
  open: number;
}

/** A BoardData.roadmapGoals entry, with its seat when the loader read one (revision 5). */
export type RoadmapGoalEntrySeated = RoadmapGoalEntry & { seat?: RoadmapGoalSeat | null };

// ── Small pure helpers ────────────────────────────────────────────────────

/** MADE_UP (M2) reads done on the board while its streak reads missed (habit.ts BREAKS). */
const DONE_STATUSES: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"]);

export function isDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status);
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 'Tue' for a key. */
export function weekdayName(key: DayKey): string {
  return WEEKDAY_SHORT[weekdayOf(key) - 1];
}

/** '15 Oct' for a key. */
export function shortDate(key: DayKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** A day near today by its weekday, anything further by its date. */
export function dayName(key: DayKey, today: DayKey): string {
  const gap = daysBetween(today, key);
  if (gap === 0) return "today";
  if (gap === 1) return "tomorrow";
  if (gap === -1) return "yesterday";
  if (gap > 1 && gap < 7) return weekdayName(key);
  if (gap < -1 && gap > -7) return weekdayName(key);
  return shortDate(key);
}

/** The repeat-decay key. A title of only stop-words has an empty normTitle; its own words stand in. */
export function groupKeyOf(t: { normTitle: string; title: string }): string {
  const k = t.normTitle.trim();
  return k.length > 0 ? k : t.title.trim().toLowerCase();
}

/** D's n: 1 + the day's earlier live completions of this template or a near-identical one (life-lexicon.ts's rule). */
export function ledgerRepeatN(t: PricedTemplate, ledger: DayLedger): number {
  return repeatNOf(
    { templateId: t.id, normTitle: groupKeyOf(t) },
    ledger.completions.map((c) => ({ templateId: c.templateId, normTitle: c.groupKey }))
  );
}

/** V's k: INTRO completions already made that day. */
export function ledgerIntroBefore(ledger: DayLedger): number {
  return ledger.completions.reduce((n, c) => n + (c.intro ? 1 : 0), 0);
}

/**
 * Whether a stored completion counts toward V's INTRO count: the band its
 * own receipt was paid at. The template's current band (after a later
 * self-rating, say) is only a fallback for a row with no readable receipt,
 * so rating a ticked INTRO task +1 cannot take it out of today's count and
 * let later routine work escape V.
 */
export function paidIntroOf(receipt: unknown, template: { band: Band; bandOverride: number } | null): boolean {
  const paid = receiptBandOf(receipt) ?? (template ? effBand(template.band, template.bandOverride) : null);
  return paid === "INTRO";
}

/** A goal's '+n' as it is recorded: rounded to 0.1 and capped, or null when it is not progress (zero, negative, not a number). */
export function goalProgressQty(qty: unknown): number | null {
  if (typeof qty !== "number" || !Number.isFinite(qty)) return null;
  const n = Math.min(1000, Math.round(qty * 10) / 10);
  return n > 0 ? n : null;
}

/**
 * How a completion pays (life-grade.ts's rule). The minimum version is only
 * on offer to a task that has one: asking for it on a task without one is
 * a full completion, not a cheaper way to hold a streak.
 */
export function modeOf(t: Pick<PricedTemplate, "autoMetric" | "intrinsic" | "mvv">, mvv?: boolean): PayMode {
  return payModeOf(t, !!(mvv && t.mvv));
}

/**
 * T (life-grade.ts's rule): only a one-off past its DEADLINE is late.
 * PLANNED days carry forward and are never late; recording yesterday inside
 * the record window is on time. Make-ups (0.85) arrive with M2.
 */
export function timingOf(t: Pick<PricedTemplate, "recurrence" | "dueDay" | "dueKind">, day: DayKey): Timing {
  if (t.recurrence) return "ON_TIME";
  return timingFor({ dueKind: t.dueKind, dueDay: t.dueDay, day });
}

/** A client number becomes a finite integer or nothing; the price itself applies the [0.5, 2] × est_eff clamp. */
export function sanitizeMinutes(m: unknown): number | null {
  if (typeof m !== "number" || !Number.isFinite(m)) return null;
  return Math.round(Math.max(-100_000, Math.min(100_000, m)));
}

/** The TASK row's dedupe key; `attempt` is how many times this slot has been undone. */
export function taskDedupeKey(templateId: string, day: DayKey, slot: number, attempt: number): string {
  return `task:${templateId}:${day}:${slot}:${attempt}`;
}

/** Whether a tick can still be undone: inside ten minutes and on the same life day. */
export function canUndo(occurredAt: Date, now: Date, tz: string = LIFE_TZ): boolean {
  const age = now.getTime() - occurredAt.getTime();
  return age >= -60_000 && age <= UNDO_WINDOW_MS && dayKeyOf(occurredAt, tz) === dayKeyOf(now, tz);
}

/** The rule, parsed; null for a one-off or anything unreadable (which then behaves as a one-off). */
export function ruleOf(t: { recurrence: string | null }): Rule | null {
  return t.recurrence ? parseRule(t.recurrence) : null;
}

// ── Pricing a completion (shared by the row, the drawer and the server) ────

export interface PlanInput {
  template: PricedTemplate;
  /** The life day the completion lands on: today, or yesterday inside the record window. */
  day: DayKey;
  today: DayKey;
  slot: number;
  minutes?: number | null;
  mvv?: boolean;
  /** That day's ledger, read in the same wave as everything else. */
  ledger: DayLedger;
  /** Consistency, in day-equivalents (DutyStreak.days); ignored for one-offs. */
  streakDays: number;
  /** Completed by activity (reviews, new Ideas) rather than a tap. */
  auto?: boolean;
  /**
   * M2: a make-up of a missed occurrence (duty-plan.ts planMakeUp). Prices
   * with timing MAKE_UP (T 0.85) and streakDays 0 (C 1.00), whatever
   * `streakDays` says. status and source stay this function's; the make-up
   * caller maps them (makeUpStatusOf, source 'make-up').
   */
  makeUp?: boolean;
  /** A task broken into steps: the steps ticked of all (life-grade priceTask: K = done ÷ total on a full completion). */
  steps?: StepShare | null;
}

export interface CompletionPlan {
  input: PriceInput;
  receipt: Receipt;
  status: InstanceStatus;
  source: InstanceSource;
  timing: Timing;
  mode: PayMode;
  sink: Sink;
  /** How this completion enters the day's ledger, for the next price. */
  completion: Omit<LedgerCompletion, "eventId">;
}

/** Prices one completion. Pure: the same inputs give the same receipt, in the browser and on the server. */
export function planCompletion(p: PlanInput): CompletionPlan {
  const t = p.template;
  const mode = modeOf(t, p.mvv);
  const timing = p.makeUp ? timingFor({ makeUp: true, day: p.day }) : timingOf(t, p.day);
  const recurring = !!ruleOf(t);
  const input: PriceInput = {
    band: t.band,
    bandOverride: t.bandOverride,
    machineMinutes: t.machineMinutes,
    estMinutes: t.estMinutes,
    minutes: sanitizeMinutes(p.minutes),
    timing,
    recurring,
    streakDays: recurring && !p.makeUp ? Math.max(0, p.streakDays) : 0,
    repeatN: ledgerRepeatN(t, p.ledger),
    introBefore: ledgerIntroBefore(p.ledger),
    mode,
    ...(p.steps ? { steps: p.steps } : {}),
  };
  const receipt = priceTask(input, { rawBefore: p.ledger.rawBefore }, t.track);
  // A completion that can never pay (#play, study) records to NONE, so no
  // level ever reads it; everything else is life XP on its track, even when
  // the knee has flattened it to nothing.
  const sink: Sink = mode === "PLAY" || mode === "STUDY" ? "NONE" : "TRACK";
  const status: InstanceStatus = mode === "MVV" ? "DONE_MVV" : timing === "LATE" ? "DONE_LATE" : "DONE";
  const source: InstanceSource = p.auto
    ? t.autoMetric === "IDEAS"
      ? "auto:ideas"
      : "auto:reviews"
    : p.day < p.today
      ? "record-yesterday"
      : "manual";
  return {
    input,
    receipt,
    status,
    source,
    timing,
    mode,
    sink,
    completion: {
      templateId: t.id,
      groupKey: groupKeyOf(t),
      intro: effBand(t.band, t.bandOverride) === "INTRO",
      raw: receipt.raw,
      xp: receipt.xp,
      sink,
    },
  };
}

/**
 * M2 (lane D): what a make-up and its minimum version would pay now against
 * `ledger` (planCompletion with makeUp: T 0.85, C 1.00; the minimum adds K
 * 0.3): the MakeUpCard's 'Make up · ≈ 3.5' and 'Do minimum · ≈ 2.1', the
 * same pricer the make-up action pays with. A study must prices 0.
 */
export function makeUpPricesOf(t: PricedTemplate, ledger: DayLedger, today: DayKey): { makeUpXp: number; minimumXp: number | null } {
  const base: PlanInput = { template: t, day: today, today, slot: 0, ledger, streakDays: 0, makeUp: true };
  return {
    makeUpXp: planCompletion(base).receipt.xp,
    minimumXp: t.mvv ? planCompletion({ ...base, mvv: true }).receipt.xp : null,
  };
}

/**
 * The TASK ledger row a planned completion writes. `day` is the row's date;
 * `keyDay` (M2, a make-up: the missed instance's day) names the occurrence
 * in the dedupe key, which uses keyDay ?? day.
 */
export function taskEventInput(
  plan: CompletionPlan,
  at: {
    templateId: string;
    track: Track;
    instanceId: string;
    day: DayKey;
    slot: number;
    attempt: number;
    now: Date;
    countsForStreak?: boolean;
    detail?: string | null;
    keyDay?: DayKey;
  }
): ActivityInput {
  return {
    source: "TASK",
    sink: plan.sink,
    track: at.track,
    occurredAt: at.now,
    day: at.day,
    templateId: at.templateId,
    sourceId: at.instanceId,
    compositionKey: `tpl:${at.templateId}`,
    xp: plan.receipt.xp,
    rawXp: plan.receipt.raw,
    countsForStreak: at.countsForStreak ?? true,
    receipt: plan.receipt,
    detail: at.detail ?? null,
    dedupeKey: taskDedupeKey(at.templateId, at.keyDay ?? at.day, at.slot, at.attempt),
  };
}

/** The row a TASK row is undone by: its exact negation, so the day's XP, knee base and streak units net to zero. */
export interface UndoneEvent {
  id: string;
  day: DayKey;
  sink: Sink;
  track: Track | null;
  templateId: string | null;
  sourceId: string | null;
  xp: number;
  rawXp: number | null;
}

export function undoEventInput(ev: UndoneEvent, now: Date): ActivityInput {
  return {
    source: "UNDO",
    sink: ev.sink,
    track: ev.track,
    occurredAt: now,
    day: ev.day,
    templateId: ev.templateId,
    sourceId: ev.sourceId,
    compositionKey: ev.templateId ? `tpl:${ev.templateId}` : null,
    xp: -ev.xp,
    rawXp: ev.rawXp == null ? null : -ev.rawXp,
    countsForStreak: false,
    detail: "undo",
    dedupeKey: `undo:${ev.id}`,
  };
}

// ── Study tasks and the review quest ──────────────────────────────────────

export interface StudyCounts {
  reviews: number;
  ideas: number;
  /** Cards due now; null when unknown (then the queue-cleared rule cannot fire). */
  dueNow: number | null;
}

export interface AutoState {
  met: boolean;
  done: number;
  target: number;
  label: string;
  /** Whether meeting it involved any real work today. An empty queue is not a day's activity. */
  worked: boolean;
}

/**
 * Where a study-linked task stands. REVIEWS and IDEAS count today's ledger
 * rows; REVIEWS and REVIEW_DUE are also met once the queue is clear, since
 * nothing more can be reviewed.
 */
export function autoStateOf(t: Pick<BoardTemplate, "autoMetric" | "autoTarget">, c: StudyCounts): AutoState | null {
  const metric = t.autoMetric;
  if (!metric || !STUDY_METRICS.has(metric)) return null;
  const cleared = c.dueNow === 0;
  if (metric === "REVIEW_DUE") {
    return {
      met: cleared,
      done: c.reviews,
      target: c.reviews + (c.dueNow ?? 0),
      label: cleared ? (c.reviews > 0 ? "queue clear" : "nothing due") : `${c.dueNow ?? "?"} due`,
      worked: c.reviews > 0,
    };
  }
  const target = Math.max(1, Math.round(t.autoTarget ?? 1));
  if (metric === "IDEAS") {
    return { met: c.ideas >= target, done: Math.min(c.ideas, target), target, label: `${Math.min(c.ideas, target)}/${target} ideas`, worked: c.ideas > 0 };
  }
  const met = c.reviews >= target || cleared;
  return {
    met,
    done: Math.min(c.reviews, target),
    target,
    label: c.reviews < target && cleared ? `${c.reviews}/${target} · queue clear` : `${Math.min(c.reviews, target)}/${target} reviews`,
    worked: c.reviews > 0,
  };
}

export interface Quest {
  target: number;
  progress: number;
  complete: boolean;
  /** Nothing was due all day. */
  rest: boolean;
  /** Σ today's REVIEW xp (sink DOMAIN). The quest itself pays 0 life XP. */
  paidByReviews: number;
  dueNow: number;
}

/**
 * 'Clear the queue'. The target is fixed at the day's first open (DAY_OPEN),
 * so cards falling due later cannot move the goalposts mid-morning; before
 * that row exists it is what has been reviewed plus what is still due.
 */
export function questOf(r: { dayOpenQty: number | null; reviews: number; dueNow: number; reviewXp: number }): Quest {
  const target = Math.max(0, Math.round(r.dayOpenQty ?? r.reviews + r.dueNow));
  const progress = r.reviews;
  return {
    target,
    progress,
    complete: r.dueNow === 0 || progress >= target,
    rest: target === 0 && r.dueNow === 0,
    paidByReviews: r.reviewXp,
    dueNow: r.dueNow,
  };
}

// ── Which day a template is due ───────────────────────────────────────────

/** Whether a recurring template is expected today, and since when when it is carried. */
export function expectedToday(
  t: Pick<BoardTemplate, "recurrence" | "startDay">,
  rule: Rule,
  today: DayKey,
  lastDone: DayKey | null
): { due: boolean; carriedFrom: DayKey | null } {
  if (t.startDay > today) return { due: false, carriedFrom: null };
  if (rule.kind === "AFTER") {
    // An AFTER rule carries: once its day has passed it stays due until done.
    const from = lastDone ? addDays(lastDone, 1) : t.startDay;
    const scheduled = nextDue(rule, t.startDay, from, lastDone);
    if (!scheduled || scheduled > today) return { due: false, carriedFrom: null };
    return { due: true, carriedFrom: scheduled < today ? scheduled : null };
  }
  return { due: occursOn(rule, t.startDay, today, lastDone), carriedFrom: null };
}

// ── What may be recorded, and on which day (the board's lanes and the server's gate) ──

/** The last day any of these instances was done, or null. */
export function lastDoneOf(instances: readonly Pick<BoardInstance, "day" | "status">[]): DayKey | null {
  let last: DayKey | null = null;
  for (const i of instances) if (isDoneStatus(i.status) && (!last || i.day > last)) last = i.day;
  return last;
}

/** An occurrence already settled some other way: nothing more can be recorded on its day. */
const SETTLED_STATUSES: ReadonlySet<string> = new Set(["SKIPPED", "EXCUSED", "MISSED", "WRITTEN_OFF"]);

/**
 * Whether `yesterday` is a day this template can still be recorded on, at
 * T 1.00, until today's life day ends. The Yesterday lane is built from
 * this and completeInstanceCore refuses anything it rejects, so the server
 * accepts exactly what the board offers:
 *
 * - a fixed schedule that expected it yesterday (AFTER and TARGET rules
 *   have no fixed day to miss: they carry forward, or count the week, on
 *   their own);
 * - a one-off whose deadline was yesterday, unless it was put off past
 *   yesterday (planDay) — then it was not done by the deadline;
 * - never a study task, which only ever completes on its own day.
 */
export function yesterdayRecordable(
  t: Pick<BoardTemplate, "recurrence" | "startDay" | "autoMetric" | "dueKind" | "dueDay" | "planDay">,
  rule: Rule | null,
  yesterday: DayKey,
  lastDone: DayKey | null
): boolean {
  if (t.startDay > yesterday || t.autoMetric) return false;
  if (!rule) return t.dueKind === "DEADLINE" && t.dueDay === yesterday && !(t.planDay && t.planDay > yesterday);
  if (rule.kind === "AFTER" || rule.kind === "TARGET") return false;
  return occursOn(rule, t.startDay, yesterday, lastDone);
}

/**
 * Why a completion may not be booked on `day`, or null when it may. The
 * day is the server's own: today, or yesterday inside the record window —
 * never another. A one-off may be done on any day it is still open; a
 * repeating task only on a day its rule expects it (a TARGET any day);
 * yesterday only as yesterdayRecordable allows. This is what stops a
 * forged call booking an unscheduled task into yesterday's knee or ticking
 * a sparse rule every day to farm its consistency.
 */
export function completionBlockOf(a: {
  t: Pick<BoardTemplate, "recurrence" | "startDay" | "autoMetric" | "dueKind" | "dueDay" | "planDay" | "completedAt">;
  rule: Rule | null;
  day: DayKey;
  today: DayKey;
  lastDone: DayKey | null;
  /** The template's instances on `day`. */
  onDay: readonly Pick<BoardInstance, "status">[];
}): string | null {
  const { t, rule, day, today } = a;
  const yesterday = addDays(today, -1);
  if (day !== today && day !== yesterday) return "Only today, or yesterday until today ends, can be recorded. Refresh the board.";
  if (t.startDay > day) return "That task didn't exist yet on that day.";
  if (!rule && t.completedAt) return "Already done.";
  if (day === today) {
    if (!rule || rule.kind === "TARGET") return null;
    return expectedToday(t, rule, today, a.lastDone).due ? null : "It isn't due today.";
  }
  if (a.onDay.some((i) => SETTLED_STATUSES.has(i.status))) return "Yesterday is already settled for this task.";
  return yesterdayRecordable(t, rule, yesterday, a.lastDone) ? null : "Only what was due yesterday can be recorded for yesterday.";
}

/**
 * Why a task may not move to `target`, or null when it may. A repeating
 * task's 'tomorrow' skips today (so a compulsory one cannot); a one-off
 * moves to any day from today on, except that a compulsory deadline is
 * never put off past its own day. A deadline that moves keeps its day and
 * its late factor (it is put off with planDay, see rescheduleCore): moving
 * is a plan, not a way out of being late.
 */
export function moveBlockOf(
  t: Pick<BoardTemplate, "recurrence" | "compulsory" | "dueKind" | "dueDay" | "completedAt">,
  target: DayKey,
  today: DayKey
): string | null {
  if (ruleOf(t)) return t.compulsory ? "A compulsory task can't be skipped. Do its minimum version instead." : null;
  if (t.completedAt) return "Already done.";
  if (target < today) return "Pick today or a later day.";
  if (t.compulsory && t.dueKind === "DEADLINE" && t.dueDay && target > t.dueDay) return "A compulsory deadline can't be put off past its day.";
  return null;
}

/**
 * The first day a captured habit runs: its phase when the line gave one
 * ('every 2 weeks on mon', 'every other sat', 'daily from 15 oct'),
 * otherwise today. A deadline on a repeating line ('until fri') is not a
 * start, and a date already past never starts a habit in the past.
 */
export function startDayFor(p: { recurrence: string | null; dueDay: DayKey | null; dueKind: DueKind | null }, today: DayKey): DayKey {
  if (!p.recurrence || !parseRule(p.recurrence)) return today;
  return p.dueDay && p.dueKind !== "DEADLINE" && p.dueDay > today ? p.dueDay : today;
}

/**
 * A set of keys that forgets everything when its epoch changes. The server
 * keeps a few in-process memos (DAY_OPEN written today, a study task
 * recorded today) to save round trips; keyed to an epoch that a reset
 * changes, a memo can never outlive the rows it remembers.
 */
export class EpochSet {
  private epoch: unknown = undefined;
  private readonly keys = new Set<string>();

  private at(epoch: unknown): Set<string> {
    if (epoch !== this.epoch) {
      this.epoch = epoch;
      this.keys.clear();
    }
    return this.keys;
  }

  has(epoch: unknown, key: string): boolean {
    return this.at(epoch).has(key);
  }

  add(epoch: unknown, key: string): void {
    const keys = this.at(epoch);
    if (keys.size > 1000) keys.clear();
    keys.add(key);
  }

  delete(epoch: unknown, key: string): void {
    this.at(epoch).delete(key);
  }
}

// ── Per-habit history ─────────────────────────────────────────────────────

/**
 * The consistency a completion on `day` is priced with: the per-duty streak
 * with that day still open. Shared by the board's projection and the
 * completion itself so the two cannot disagree.
 */
export function streakDaysFor(
  t: Pick<BoardTemplate, "startDay">,
  rule: Rule,
  history: readonly InstanceLike[],
  day: DayKey,
  opts: StreakOptions = {}
): number {
  return perDutyStreak(rule, t.startDay, day, history.filter((i) => i.day < day), opts).days;
}

/**
 * The habit reads' M2 options (decision 15), for statsFor: once Duty is
 * live, a day after the settlement cursor with nothing recorded reads
 * pending (never missed), and a held day reads held — a declared rest,
 * sick or vacation day (duty-rule.ts heldDaysOf) or a freeze day. A must
 * kept 'Even on rest days' is held by freeze days only. Before launch: no
 * options, M1/M5 behaviour exactly.
 */
export function boardStreakOptionsOf(
  t: Pick<BoardTemplate, "compulsory" | "compulsoryOnRest">,
  ctx: { live: boolean; cursor: DayKey | null; restDays: ReadonlySet<DayKey>; freezeDays: ReadonlySet<DayKey> }
): StreakOptions {
  if (!ctx.live) return {};
  if (t.compulsory && t.compulsoryOnRest) return { settledThroughDay: ctx.cursor, heldDays: ctx.freezeDays };
  const held = new Set<DayKey>(ctx.restDays);
  for (const d of ctx.freezeDays) held.add(d);
  return { settledThroughDay: ctx.cursor, heldDays: held };
}

export function statsFor(t: BoardTemplate, rule: Rule, instances: readonly BoardInstance[], today: DayKey, opts: StreakOptions = {}): TemplateStats {
  // habit.ts reads several slots on one day as one day (any kept slot keeps it).
  const days: InstanceLike[] = instances.map((i) => ({ day: i.day, status: i.status, repaired: i.repaired }));
  const before = days.filter((i) => i.day < today);
  const ifDone = [...before, { day: today, status: "DONE" }];
  const yesterday = addDays(today, -1);
  let lastDone: DayKey | null = null;
  for (const i of days) if (isDoneStatus(i.status) && (!lastDone || i.day > lastDone)) lastDone = i.day;

  // Share kept over the last four weeks, against the rule's own rate. Null
  // until a week of schedule exists to judge — honest 'calibrating', not 0%.
  const from = t.startDay > addDays(today, -28) ? t.startDay : addDays(today, -28);
  const span = Math.max(0, daysBetween(from, today));
  const expected = (scheduledPerWeek(rule) * span) / 7;
  const kept = new Set(days.filter((i) => i.day >= from && i.day < today && isDoneStatus(i.status)).map((i) => i.day)).size;

  return {
    lastDone,
    streak: { before: perDutyStreak(rule, t.startDay, today, before, opts), ifDone: perDutyStreak(rule, t.startDay, today, ifDone, opts) },
    strength: { before: habitStrength(rule, t.startDay, today, before, opts), ifDone: habitStrength(rule, t.startDay, today, ifDone, opts) },
    streakDaysYesterday: streakDaysFor(t, rule, days, yesterday, opts),
    keptRatio28: span >= 7 && expected >= 1 ? Math.min(1, kept / expected) : null,
  };
}

// ── The board ─────────────────────────────────────────────────────────────

export type RowState = "open" | "done" | "skipped" | "locked";

export interface RowProgress {
  done: number;
  target: number;
  label: string;
  met: boolean;
}

export interface BoardRow {
  key: string;
  template: BoardTemplate;
  lane: Lane;
  day: DayKey;
  state: RowState;
  /** The slot a tick on this row writes: the open slot, or the next one for Again. */
  slot: number;
  /** The instance that paid (latest done slot), for its receipt and undo. */
  instanceId: string | null;
  timesDone: number;
  /** The latest done slot was the minimum version (DONE_MVV): the tick shows half-filled, "Minimum kept". */
  minimum: boolean;
  paid: PaidRecord | null;
  /** What a tick at the estimate pays now. */
  projection: Receipt;
  streakDays: number;
  carriedFrom: DayKey | null;
  late: boolean;
  dueLabel: string | null;
  ruleLabel: string | null;
  estMinutes: number;
  streak: DutyStreak | null;
  strength: number | null;
  rung: HabitRung | null;
  toNextRung: number | null;
  progress: RowProgress | null;
  parentTitle: string | null;
  /** Completed by activity: the tick stays disabled until the target is met. */
  auto: AutoState | null;
  /**
   * M2 (lane D): today is a declared rest, sick or vacation day and this row
   * is held by it (every habit, and every must not kept 'Even on rest days').
   * Absent: false.
   */
  heldToday?: boolean;
  /** M2 (lane D): '12 days · repaired' after a restoring make-up, '12 days · held' after the minimum or an excused day. */
  streakNote?: "repaired" | "held" | null;
  /** M2 (lane D): a weakening still pending (its effectiveDay is after today): 'must · ends Thu 8 Oct'. */
  pendingNext?: PendingNext | null;
  /** Its steps (subtasks), on today's rows only; absent or null: no steps. */
  steps?: RowSteps | null;
}

/** A row's steps: the list, the ones ticked today, and how the ticks pay (src/lib/subtasks.ts). */
export interface RowSteps {
  items: Subtask[];
  done: string[];
  /** Paid by its steps for a part (not every step): the row stays open, its tick finishes the rest. */
  partial: boolean;
  /** Paid by a whole tick (Done, the minimum, a make-up): the steps are a checklist only. */
  checklist: boolean;
}

export interface GoalCard {
  template: BoardTemplate;
  horizon: Horizon;
  metric: KrMetric;
  /** 0..1, or null when there is nothing to measure yet. */
  progress: number | null;
  label: string;
  /** 'support habits 82% kept (28 d)'. */
  support: string | null;
  dueLabel: string | null;
  steps: number;
  /**
   * g when the goal is past its due day and below 1 ('Carried 0.55'); else
   * null. Never a debt: the goal stays open to reschedule or close.
   */
  carried: number | null;
  /**
   * Roadmap (lane T, F16 seams 3–4): a ROADMAP goal's caption parts, chip,
   * zero reason and reset note, from BoardData.roadmapGoals. Absent (or
   * null) on every other goal.
   */
  roadmap?: RoadmapGoalCard | null;
}

/**
 * What a ROADMAP goal's card says beyond g (roadmap.md F10, F16 seam 4). g
 * itself is goals.ts goalProgress over the stored series (the one function
 * the ladder and the close use); these are only its words.
 */
export interface RoadmapGoalCard {
  /**
   * The binding part's class in words (goals.ts ROADMAP_CAPTION): "tested by
   * your reviews" (MEASURED) or "from your ticks" (SELF_REPORTED, or the
   * steps' share when it is strictly below the series). null before the
   * first reading ≤ the as-of day.
   */
  caption: string | null;
  /** The binding part ("cards at level 6+", "1 of 3 steps"); null before the first reading. */
  slowest: string | null;
  /** When the binding reading was taken: "measured 09:12", "measured Sat", "measured 3 Oct"; null when the steps bind or before the first reading. */
  measured: string | null;
  /**
   * "Roadmap · milestone 2 of 3"; null when the milestone's place is unknown
   * (no entry). Revision 5 (contracts §23.3): with 2 or more goals open the
   * chip reads "2 of 5" after its goal's seat glyph (`slot`), "[goal.2] 2 of 5".
   */
  chip: string | null;
  /** Revision 5 (lane 3): the goal's seat, only while 2 or more goals are open (D39); absent with one goal, whose chip is unchanged. */
  slot?: GoalSlot | null;
  /** Why it states 0, shown after "pays nothing" ("knowledge is paid by reviews"); null unless goalMp is 0. */
  zeroReason: string | null;
  /**
   * Why it will never be measured again, on a line of its own: "measures
   * removed by a reset" or "roadmap archived" (its roadmap was archived), or
   * "replaced by Start again" (roadmap-types isSupersededRow: a newer copy of
   * its milestone has started).
   */
  note: string | null;
  /**
   * The goal will never be measured again: a note and no stored point. The
   * roadmap's readings refuse it for good (readingOpsFor's final refusal), so
   * its close pays 0, "not measured", whatever MP it stated: the card reads
   * "not measured · pays nothing", never "pays ⬡ 6 × progress from 70%".
   * False for a goal with no reading yet ("not measured yet"): it may still be.
   */
  unmeasured: boolean;
}

/** A one-off waiting for a later day, as Anytime's 'Planned later' list shows it. */
export interface LaterRow {
  templateId: string;
  title: string;
  /** The day it returns to the board. */
  day: DayKey;
  /** 'tomorrow', 'Sat', '15 Oct'; a put-off deadline adds its own day ('tomorrow · by Sat'). */
  label: string;
}

export interface Board {
  today: DayKey;
  yesterday: DayKey;
  must: BoardRow[];
  todayRows: BoardRow[];
  yesterdayRows: BoardRow[];
  anytime: BoardRow[];
  inbox: BoardTemplate[];
  goals: Record<Horizon, GoalCard[]>;
  /** Planned one-offs whose day is still ahead. */
  later: number;
  /** The same one-offs, by the day they return (then title): what 'Planned later' lists. */
  laterRows: LaterRow[];
  /** Σ est_eff of Must and Today (skipped rows excluded), in minutes. */
  planned: number;
  capacity: number;
  /** Minutes over capacity, 0 when within. */
  over: number;
  /** The cheapest open, non-compulsory Today card: the one-tap move when over. */
  suggestion: BoardRow | null;
  lifeXpToday: number;
  reviewXpToday: number;
  /** Must and Today have nothing left open. */
  clear: boolean;
  counts: { musts: number; due: number; inbox: number };
  habits: { done: number; total: number };
  /** Any row was completed today (for the streak tile's optimistic liveness). */
  activeToday: boolean;
  /**
   * M2 (lane D): open debts (BoardData.duty.owed), each re-priced against
   * today's live ledger, oldest first. Empty without Duty data. They render
   * only inside the Must lane and the Owed row.
   */
  owed: OwedCard[];
  /** M2 (lane D): today's declaration (rest, sick, vacation), or null. */
  restToday: RestKind | null;
  /** M2 (lane D): the Duty UI is on (BoardData.duty.live). */
  dutyLive: boolean;
}

/** Deadline and planned-date labels: 'by Fri', 'late 2d', 'from Tue'. */
export function dueLabelOf(t: Pick<BoardTemplate, "dueDay" | "dueKind">, today: DayKey): { label: string | null; late: boolean; carriedFrom: DayKey | null } {
  if (!t.dueDay) return { label: null, late: false, carriedFrom: null };
  const gap = daysBetween(today, t.dueDay);
  if (t.dueKind === "DEADLINE") {
    if (gap < 0) return { label: `late ${-gap}d`, late: true, carriedFrom: null };
    return { label: `by ${dayName(t.dueDay, today)}`, late: false, carriedFrom: null };
  }
  if (gap < 0) return { label: `from ${dayName(t.dueDay, today)}`, late: false, carriedFrom: t.dueDay };
  if (gap === 0) return { label: null, late: false, carriedFrom: null };
  return { label: dayName(t.dueDay, today), late: false, carriedFrom: null };
}

/** One line describing a template's schedule: 'Mon · Thu · compulsory', 'by Fri', 'inbox'. */
export function describeTemplate(
  t: Pick<BoardTemplate, "recurrence" | "startDay" | "dueDay" | "dueKind" | "compulsory" | "inbox" | "intrinsic" | "kind" | "horizon">,
  today: DayKey
): string {
  const parts: string[] = [];
  if (t.kind === "IDEA_DRAFT") parts.push("idea draft");
  if (t.kind === "GOAL" && t.horizon) parts.push(`${t.horizon.toLowerCase()} goal`);
  const rule = ruleOf(t);
  if (rule) {
    const d = describeRule(rule, t.startDay);
    if (d) parts.push(d);
  } else if (t.dueDay) {
    const due = dueLabelOf(t, today);
    parts.push(due.label ?? "today");
  } else if (t.kind !== "GOAL" && t.kind !== "IDEA_DRAFT") {
    parts.push(t.inbox ? "inbox" : "anytime");
  }
  if (t.compulsory) parts.push("compulsory");
  if (t.intrinsic) parts.push("#play");
  return parts.join(" · ");
}

function ledgerFor(d: BoardData, day: DayKey): DayLedger {
  return day === d.today ? d.ledger.today : d.ledger.yesterday;
}

// ── Where a template sits (capture.md 'Say where it went') ────────────────

/** One row a template puts on the board's lanes, and what that row says about its day. */
export interface PlacedRow {
  lane: Lane;
  day: DayKey;
  extra: Partial<Pick<BoardRow, "dueLabel" | "late" | "carriedFrom" | "progress">>;
}

/**
 * Where one template sits on the board: its place in the board's own lane
 * names, the rows it puts on the lanes, and how it shows when it has no row
 * of its own (Anytime's 'Planned later' and 'Coming up' lines). buildBoard
 * files every template by this function and the capture toast names
 * `place`, so the toast and the board cannot disagree.
 */
export interface Placement {
  place: BoardPlace;
  /** Rows on the lanes (a deadline due yesterday has two: yesterday's and today's). Empty when it has none. */
  rows: PlacedRow[];
  /** A one-off waiting for a later day: the day it returns ('Planned later'). */
  laterDay: DayKey | null;
  /** A repeating task not on today's lanes: the next day it falls due ('Coming up'). */
  upcomingDay: DayKey | null;
  /** Counted in today's Habits tally, and whether it is kept; null when it is not one of today's habits. */
  habit: { done: boolean } | null;
}

export interface PlaceContext {
  today: DayKey;
  /** Defaults to the day before `today`. */
  yesterday?: DayKey;
  /** This template's instances: today and yesterday at least, the current week or month for a TARGET habit. */
  instances: readonly BoardInstance[];
  /**
   * The last day it was done over its whole history (TemplateStats.lastDone),
   * which an AFTER rule reads. Defaults to the latest done instance given.
   */
  lastDone?: DayKey | null;
}

const PLACE_MUST: BoardPlace = { lane: "must", label: "Must" };
const PLACE_PLANNED: BoardPlace = { lane: "planned", label: "Planned" };
const PLACE_HABITS: BoardPlace = { lane: "habits", label: "Habits" };
const PLACE_ANYTIME: BoardPlace = { lane: "anytime", label: "Anytime" };
const PLACE_INBOX: BoardPlace = { lane: "inbox", label: "Inbox" };
const PLACE_GOALS: BoardPlace = { lane: "goals", label: "Goals" };
const PLACE_GOAL_CLOSED: BoardPlace = { lane: "done", label: "Closed" };
const PLACE_DONE_TODAY: BoardPlace = { lane: "done", label: "Done today" };

/** 'Planned later · Fri 2 Oct'. */
function laterPlace(day: DayKey): BoardPlace {
  return { lane: "later", label: `Planned later · ${weekdayName(day)} ${shortDate(day)}` };
}

/** 'Habits · tomorrow', 'Habits · next Thu', 'Habits · next 15 Oct'; a habit not started yet reads 'from'. */
function upcomingPlace(day: DayKey, today: DayKey, word: "next" | "from"): BoardPlace {
  const when = dayName(day, today);
  return { lane: "upcoming", label: when === "tomorrow" ? `Habits · ${word === "from" ? "from " : ""}tomorrow` : `Habits · ${word} ${when}` };
}

/**
 * Where a template sits, and the rows it puts on the board (see Placement).
 * Pure: buildBoard calls it for every template, and the server calls it on
 * a row it has just written, so a capture's toast names the lane the board
 * then shows it in.
 *
 *   goals      every goal
 *   inbox      an inbox item or an idea draft
 *   done       a one-off done today (or recorded for yesterday this
 *              morning), a habit done today
 *   must       compulsory and due today
 *   planned    a one-off due today, carried, or a deadline within two days
 *   habits     a repeating task due today (a TARGET still short of target)
 *   later      a one-off planned for, or put off to, a later day
 *   upcoming   a repeating task not due today ('Coming up'), or one not
 *              started yet
 *   anytime    undated, a distant deadline, a TARGET already met
 */
export function placementOf(t: BoardTemplate, ctx: PlaceContext): Placement {
  const { today, instances: insts } = ctx;
  const yesterday = ctx.yesterday ?? addDays(today, -1);
  const only = (place: BoardPlace, more: Partial<Placement> = {}): Placement => ({
    place,
    rows: [],
    laterDay: null,
    upcomingDay: null,
    habit: null,
    ...more,
  });

  // A closed goal (M5) is finished for good: off the board, like a one-off done earlier.
  if (t.kind === "GOAL") return only(t.closedScore != null ? PLACE_GOAL_CLOSED : PLACE_GOALS);
  if (t.inbox || t.kind === "IDEA_DRAFT") return only(PLACE_INBOX);
  const rule = ruleOf(t);

  if (!rule) {
    // One-offs. Done today (or recorded for yesterday this morning) stays on
    // the board ticked, so it can be undone; done earlier is gone.
    const doneInst = insts.find(
      (i) => isDoneStatus(i.status) && (i.day === today || (i.day === yesterday && i.source === "record-yesterday"))
    );
    if (t.completedAt && !doneInst) return only({ lane: "done", label: "Done" });
    const due = dueLabelOf(t, today);
    if (doneInst) {
      const onYesterday = doneInst.day === yesterday;
      const lane: Lane = onYesterday ? "yesterday" : t.compulsory ? "must" : "today";
      return only(onYesterday ? { lane: "done", label: "Done yesterday" } : PLACE_DONE_TODAY, {
        rows: [{ lane, day: doneInst.day, extra: { dueLabel: due.label, late: due.late } }],
      });
    }
    // Put off to a later day: off the board until then, deadline untouched.
    if (t.planDay && t.planDay > today) return only(laterPlace(t.planDay), { laterDay: t.planDay });
    if (!t.dueDay) return only(PLACE_ANYTIME, { rows: [{ lane: "anytime", day: today, extra: {} }] });
    if (t.dueKind === "DEADLINE") {
      const gap = daysBetween(today, t.dueDay);
      const rows: PlacedRow[] = [];
      // Due yesterday: late if done now, but still on time if it was done
      // yesterday and only the tick is late — the record window's promise.
      if (yesterdayRecordable(t, null, yesterday, null)) rows.push({ lane: "yesterday", day: yesterday, extra: { dueLabel: "by yesterday" } });
      if (gap <= 0) {
        rows.push({ lane: t.compulsory ? "must" : "today", day: today, extra: { dueLabel: due.label, late: due.late } });
        return only(t.compulsory ? PLACE_MUST : PLACE_PLANNED, { rows });
      }
      if (gap <= DEADLINE_LOOKAHEAD_DAYS) {
        rows.push({ lane: "today", day: today, extra: { dueLabel: due.label } });
        return only(PLACE_PLANNED, { rows });
      }
      rows.push({ lane: "anytime", day: today, extra: { dueLabel: due.label } });
      return only({ lane: "anytime", label: `Anytime · ${due.label ?? `by ${shortDate(t.dueDay)}`}` }, { rows });
    }
    // PLANNED: on or after its day it is today's; before, it waits.
    if (t.dueDay > today) return only(laterPlace(t.dueDay), { laterDay: t.dueDay });
    return only(t.compulsory ? PLACE_MUST : PLACE_PLANNED, {
      rows: [{ lane: t.compulsory ? "must" : "today", day: today, extra: { dueLabel: due.label, carriedFrom: due.carriedFrom } }],
    });
  }

  // Recurring.
  const lastDone = ctx.lastDone !== undefined ? ctx.lastDone : lastDoneOf(insts);
  const doneToday = insts.some((i) => i.day === today && isDoneStatus(i.status));

  if (rule.kind === "TARGET") {
    // Not started yet ('3x/week from mon'): no row until its first day.
    if (t.startDay > today) return only(upcomingPlace(t.startDay, today, "from"), { upcomingDay: t.startDay });
    const doneKeys = [...new Set(insts.filter((i) => isDoneStatus(i.status)).map((i) => i.day))];
    const pp = periodProgress(rule, today, doneKeys);
    const progress: RowProgress = {
      done: pp.done,
      target: pp.target,
      label: `${pp.done}/${pp.target} this ${rule.per === "W" ? "week" : "month"}`,
      met: pp.met,
    };
    const habit = { done: doneToday || pp.met };
    if (pp.met && !doneToday) return only(PLACE_ANYTIME, { rows: [{ lane: "anytime", day: today, extra: { progress } }], habit });
    return only(doneToday ? PLACE_DONE_TODAY : t.compulsory ? PLACE_MUST : PLACE_HABITS, {
      rows: [{ lane: t.compulsory ? "must" : "today", day: today, extra: { progress } }],
      habit,
    });
  }

  const rows: PlacedRow[] = [];
  let place: BoardPlace;
  let upcomingDay: DayKey | null = null;
  let habit: Placement["habit"] = null;
  const exp = expectedToday(t, rule, today, lastDone);
  if (exp.due || doneToday) {
    habit = { done: doneToday };
    rows.push({
      lane: t.compulsory ? "must" : "today",
      day: today,
      extra: { carriedFrom: exp.carriedFrom, dueLabel: exp.carriedFrom ? `from ${dayName(exp.carriedFrom, today)}` : null },
    });
    place = doneToday ? PLACE_DONE_TODAY : t.compulsory ? PLACE_MUST : PLACE_HABITS;
  } else {
    // Not today: Anytime's 'Coming up' lists it on the day it next falls due.
    const next = nextDue(rule, t.startDay, addDays(today, 1), lastDone);
    upcomingDay = next && next > today ? next : null;
    place = upcomingDay ? upcomingPlace(upcomingDay, today, t.startDay > today ? "from" : "next") : { lane: "upcoming", label: "Habits" };
  }

  // Yesterday's occurrence, still recordable (yesterdayRecordable: the
  // server's own gate). AFTER rules carry on their own, and a study task
  // only ever completes on its day.
  if (yesterdayRecordable(t, rule, yesterday, lastDone)) {
    const y = insts.filter((i) => i.day === yesterday);
    const judged = y.some((i) => SETTLED_STATUSES.has(i.status));
    const doneY = y.find((i) => isDoneStatus(i.status));
    // Open, or recorded this morning (so the tick shows and can be undone).
    if (!judged && (!doneY || doneY.source === "record-yesterday")) rows.push({ lane: "yesterday", day: yesterday, extra: {} });
  }
  return { place, rows, laterDay: null, upcomingDay, habit };
}

/**
 * The board place of one template in the board's own words ('Must',
 * 'Habits · next Thu', 'Planned later · Fri 2 Oct', 'Anytime · by 30 Nov',
 * 'Inbox', 'Goals', 'Done today'): placementOf's `place`, the lane
 * buildBoard files it in. `instances` are the template's own.
 */
export function placeOf(t: BoardTemplate, today: DayKey, instances: readonly BoardInstance[] = [], lastDone?: DayKey | null): BoardPlace {
  return placementOf(t, { today, instances, lastDone }).place;
}

/** A 'Planned later' line: when it comes back, and for a put-off deadline the day it is still due. */
function laterRowOf(t: BoardTemplate, day: DayKey, today: DayKey): LaterRow {
  const when = dayName(day, today);
  const due = t.dueKind === "DEADLINE" && t.dueDay && t.dueDay !== day ? dueLabelOf(t, today).label : null;
  return { templateId: t.id, title: t.title, day, label: due ? `${when} · ${due}` : when };
}

function sortRows(rows: BoardRow[]): BoardRow[] {
  const rank: Record<RowState, number> = { open: 0, locked: 1, done: 2, skipped: 3 };
  return rows.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      Number(b.template.compulsory) - Number(a.template.compulsory) ||
      a.template.sortOrder - b.template.sortOrder ||
      a.template.createdAt.localeCompare(b.template.createdAt) ||
      a.template.id.localeCompare(b.template.id)
  );
}

/**
 * M2 (lane D, F3): the template as its rule stands on `day` (duty-rule.ts
 * ruleOn over its pendingChange): an un-flag reaches the board on its
 * effective day, not before, and a pending archive takes the template off
 * the board on its effective day even though settlement writes archivedAt
 * two days later (null then). A template with no pending change is
 * returned as it is.
 */
export function ruledTemplateOn(t: BoardTemplate, day: DayKey): BoardTemplate | null {
  const pendingChange = t.pendingChange ?? null;
  if (!pendingChange) return t;
  const r = ruleOn(dutyTemplateOf(t), day);
  if (r.archivedDay != null && day >= r.archivedDay) return null;
  return { ...t, compulsory: r.compulsory, compulsoryOnRest: r.compulsoryOnRest };
}

/** A board template as duty-rule.ts reads it (the board holds live templates only: archivedDay null; a pending archive is in pendingChange). */
function dutyTemplateOf(t: BoardTemplate): DutyTemplate {
  return {
    kind: t.kind,
    recurrence: t.recurrence,
    startDay: t.startDay,
    dueDay: t.dueDay,
    dueKind: t.dueKind,
    compulsory: t.compulsory,
    compulsoryOnRest: t.compulsoryOnRest ?? false,
    inbox: t.inbox,
    archivedDay: null,
    pendingChange: t.pendingChange ?? null,
  };
}

/** The weakening still to come for a template on `today` (its effectiveDay is after today), or null. */
export function pendingNextOf(t: Pick<BoardTemplate, "pendingChange">, today: DayKey): PendingNext | null {
  const next = t.pendingChange?.next;
  return next && next.effectiveDay > today ? next : null;
}

/**
 * M2 (review blocker): settledFor's floor on this board — DutyBoard.floor
 * (firstDutyDay(epochDay, launchDay)), or, while the board core does not
 * send it, the launch day (the floor's lower bound). Null without a launch
 * day: then settledFor keeps the cursor-only lock, as the server does.
 */
export function dutyFloorOf(duty: Pick<DutyBoard, "launchDay" | "floor">): DayKey | null {
  return duty.floor !== undefined ? duty.floor : duty.launchDay;
}

/**
 * M2: `day` is locked as settled — duty-economy.ts settledFor, the one rule
 * the server's tick, record and undo refusals use. A cursor the launch
 * script set ahead of the first Duty day never locks a pre-Duty day.
 */
export function isSettledOn(duty: Pick<DutyBoard, "cursor" | "launchDay" | "floor"> | null | undefined, day: DayKey): boolean {
  return !!duty && settledFor(day, duty.cursor, dutyFloorOf(duty));
}

/**
 * M2: `day` is a Duty day settlement has still to judge — Duty live, a
 * cursor, on or after the first Duty day and after the cursor. Record
 * yesterday's honesty line, its Settle footer and the freeze switch, and
 * the Day ledger's 'record it by' line speak only for such a day.
 */
export function isUnsettledDutyDay(duty: Pick<DutyBoard, "live" | "cursor" | "launchDay" | "floor"> | null | undefined, day: DayKey): boolean {
  if (!duty?.live || duty.cursor == null) return false;
  const floor = dutyFloorOf(duty);
  return floor != null && day >= floor && day > duty.cursor;
}

/**
 * M2 (rest banner): how many 'Even on rest days' musts stay owed on the
 * declared days [from, to] — compulsory with compulsoryOnRest under ruleOn
 * on a day they are expected (duty-rule.ts expectedOn), or a TARGET must in
 * force then (a rest day is never held for one). The banner then never says
 * 'Nothing will be owed'.
 */
export function onRestMustsIn(templates: readonly BoardTemplate[], from: DayKey, to: DayKey): number {
  const span = Math.max(0, Math.min(daysBetween(from, to), 62));
  let n = 0;
  for (const t of templates) {
    if ((t.kind !== "TASK" && t.kind !== "HABIT") || t.inbox || t.completedAt || (!t.compulsory && !t.pendingChange)) continue;
    const dt = dutyTemplateOf(t);
    const target = parseRule(t.recurrence)?.kind === "TARGET";
    for (let i = 0; i <= span; i++) {
      const d = addDays(from, i);
      const r = ruleOn(dt, d);
      if (!r.compulsory || !r.compulsoryOnRest || (r.archivedDay != null && d >= r.archivedDay)) continue;
      if (target ? d >= t.startDay : expectedOn(dt, d)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

/** Statuses that hold a streak in a row's meta ('12 days · held'): the minimum version, an excused day. */
const HELD_NOTE_STATUSES: ReadonlySet<string> = new Set(["DONE_MVV", "EXCUSED"]);

/**
 * '· repaired' or '· held' after the streak in a row's meta: what the
 * template's latest occurrence before today became (UNDONE rows aside). A
 * repaired make-up says repaired; the minimum or an excused day says held;
 * a declared rest yesterday with nothing recorded (settlement has not
 * written its EXCUSED yet) says held too.
 */
export function streakNoteOf(instances: readonly BoardInstance[], today: DayKey, restYesterday: boolean): BoardRow["streakNote"] {
  let latest: DayKey | null = null;
  for (const i of instances) if (i.day < today && i.status !== "UNDONE" && (!latest || i.day > latest)) latest = i.day;
  const yesterday = addDays(today, -1);
  if (restYesterday && (!latest || latest < yesterday)) return "held";
  if (!latest) return null;
  const onDay = instances.filter((i) => i.day === latest && i.status !== "UNDONE");
  if (onDay.some((i) => i.repaired && isDoneStatus(i.status))) return "repaired";
  if (onDay.some((i) => i.status === "DONE" || i.status === "DONE_LATE")) return null;
  return onDay.some((i) => HELD_NOTE_STATUSES.has(i.status)) ? "held" : null;
}

/**
 * Builds the board. Lanes:
 *
 *   must       compulsory items due today (recurring, or a deadline today or past)
 *   today      planned and due todos, due habits, TARGET habits still short,
 *              deadlines within two days, carried planned items ('from Tue')
 *   yesterday  yesterday's scheduled occurrences still open, recordable at
 *              T 1.00 until today ends
 *   anytime    undated one-offs, distant deadlines, TARGET habits already met
 *   inbox      unclarified captures and idea drafts
 *   goals      Short / Mid / Long
 */
export function buildBoard(data: BoardData, ops: readonly BoardOp[] = []): Board {
  const d = ops.length > 0 ? applyOps(data, ops) : data;
  const { today, yesterday } = d;

  const instancesByTpl = new Map<string, BoardInstance[]>();
  for (const i of d.instances) {
    const list = instancesByTpl.get(i.templateId);
    if (list) list.push(i);
    else instancesByTpl.set(i.templateId, [i]);
  }
  const tplById = new Map(d.templates.map((t) => [t.id, t]));
  const counts: StudyCounts = { reviews: d.ledger.today.reviews, ideas: d.ledger.today.ideas, dueNow: d.dueNow };

  // M2 (lane D): Duty, when the server sent it. Without it, the pre-M2 board.
  const duty = d.duty ?? null;
  const dutyLive = !!duty?.live;
  const restToday = duty?.rest.today ?? null;
  const restYesterday = !!duty?.rest.yesterday;
  // Yesterday is settled (an early settle, by settledFor: never a pre-Duty
  // day under the launch cursor), or a freeze already covers it (a freeze is
  // a no-activity day, decision 12): nothing more is recorded on it.
  const yesterdayLocked = isSettledOn(duty, yesterday) || (dutyLive && !!duty?.freezes.usedYesterday);
  // A one-off with an open debt shows only its MakeUpCard, never a late row (decision 18).
  const debited = new Set<string>();
  for (const c of duty?.owed ?? []) {
    const t = tplById.get(c.templateId) ?? c.template;
    if (t && !ruleOf(t)) debited.add(c.templateId);
  }

  const must: BoardRow[] = [];
  const todayRows: BoardRow[] = [];
  const yesterdayRows: BoardRow[] = [];
  const anytime: BoardRow[] = [];
  const inbox: BoardTemplate[] = [];
  const goalTemplates: BoardTemplate[] = [];
  let later = 0;
  let habitsTotal = 0;
  let habitsDone = 0;

  const row = (t: BoardTemplate, lane: Lane, day: DayKey, extra: Partial<BoardRow> = {}): BoardRow => {
    const onDay = (instancesByTpl.get(t.id) ?? []).filter((i) => i.day === day).sort((a, b) => a.slot - b.slot);
    const done = onDay.filter((i) => isDoneStatus(i.status));
    const latestDone = done[done.length - 1] ?? null;
    const skipped = onDay.some((i) => i.status === "SKIPPED" && i.slot === 0) && done.length === 0;
    const openSlot = onDay.find((i) => !isDoneStatus(i.status) && i.status !== "SKIPPED")?.slot;
    const slot = done.length > 0 ? Math.max(...onDay.map((i) => i.slot)) + 1 : (openSlot ?? 0);
    const stats = d.stats[t.id];
    const rule = ruleOf(t);
    const doneToday = day === today && done.length > 0;
    const streak = rule && stats ? (doneToday ? stats.streak.ifDone : stats.streak.before) : null;
    const strength = rule && stats ? (doneToday ? stats.strength.ifDone : stats.strength.before) : null;
    const streakDays = rule && stats ? (day === today ? stats.streak.before.days : stats.streakDaysYesterday) : 0;
    const auto = day === today ? autoStateOf(t, counts) : null;
    const projection = planCompletion({ template: t, day, today, slot, ledger: ledgerFor(d, day), streakDays }).receipt;
    let state: RowState = done.length > 0 ? "done" : skipped ? "skipped" : "open";
    // Steps (today only): ticked steps that paid a part keep the row open, its tick finishing the rest.
    const sub = day === today && stepsAllowed(t) ? d.subtasks?.[t.id] : undefined;
    const paidRow = latestDone ? (d.paid[latestDone.id] ?? null) : null;
    const paidSteps = paidByStepsOf(paidRow?.receipt ?? null);
    const steps: RowSteps | null =
      sub && sub.items.length > 0
        ? { items: sub.items, done: sub.done, partial: !!paidSteps && paidSteps.done < paidSteps.total, checklist: done.length > 0 && !paidSteps }
        : null;
    if (steps?.partial && state === "done") state = "open";
    // A study task that has met its target counts as done even before the
    // after() hook has written its instance; one that has not stays locked.
    if (state === "open" && auto) state = auto.met ? "done" : "locked";
    const parent = t.parentId ? tplById.get(t.parentId) : undefined;
    return {
      key: `${t.id}:${day}`,
      template: t,
      lane,
      day,
      state,
      slot,
      instanceId: latestDone?.id ?? null,
      timesDone: done.length,
      minimum: latestDone?.status === "DONE_MVV",
      paid: latestDone ? (d.paid[latestDone.id] ?? null) : null,
      projection,
      streakDays,
      carriedFrom: null,
      late: false,
      dueLabel: null,
      ruleLabel: rule ? describeRule(rule, t.startDay) || null : null,
      estMinutes: estEff(t.estMinutes, t.machineMinutes),
      streak,
      strength,
      rung: strength == null ? null : rungOf(strength),
      toNextRung: strength == null ? null : keptToNextRung(strength),
      progress: auto ? { done: auto.done, target: auto.target, label: auto.label, met: auto.met } : null,
      parentTitle: parent?.title ?? null,
      auto,
      heldToday: day === today && restToday != null && (!!rule || t.compulsory) && !(t.compulsory && t.compulsoryOnRest),
      streakNote:
        dutyLive && rule && streak && streak.days > 0
          ? streakNoteOf(
              instancesByTpl.get(t.id) ?? [],
              today,
              restYesterday && rule.kind !== "TARGET" && rule.kind !== "AFTER" && occursOn(rule, t.startDay, yesterday)
            )
          : null,
      pendingNext: pendingNextOf(t, today),
      steps,
      ...extra,
    };
  };

  const laneRows: Record<Lane, BoardRow[]> = { must, today: todayRows, yesterday: yesterdayRows, anytime };
  const laterRows: LaterRow[] = [];

  // Every template is filed by placementOf, the one rule the capture toast
  // also names its place by.
  for (const raw of d.templates) {
    // The rule as it stands today (a pending archive leaves on its day; an un-flag lands on its day).
    const t = ruledTemplateOn(raw, today);
    if (!t || debited.has(t.id)) continue;
    const p = placementOf(t, {
      today,
      yesterday,
      instances: instancesByTpl.get(t.id) ?? [],
      lastDone: d.stats[t.id]?.lastDone ?? null,
    });
    if (p.place.lane === "goals") {
      goalTemplates.push(t);
      continue;
    }
    if (p.place.lane === "inbox") {
      inbox.push(t);
      continue;
    }
    if (p.laterDay) {
      later += 1;
      laterRows.push(laterRowOf(t, p.laterDay, today));
    }
    if (p.habit) {
      habitsTotal += 1;
      if (p.habit.done) habitsDone += 1;
    }
    for (const r of p.rows) {
      if (r.lane === "yesterday" && yesterdayLocked) continue;
      laneRows[r.lane].push(row(t, r.lane, r.day, r.extra));
    }
  }

  sortRows(must);
  sortRows(todayRows);
  sortRows(yesterdayRows);
  sortRows(anytime);
  inbox.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  laterRows.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title) || a.templateId.localeCompare(b.templateId));

  // Capacity: what the day asks of you, done or not; a skipped card no longer
  // asks, and neither does a row a rest day holds until it is done (M2).
  const planned = [...must, ...todayRows].filter(asksToday).reduce((s, r) => s + r.estMinutes, 0);
  const capacity = Math.max(0, d.capacityMin);
  const over = Math.max(0, planned - capacity);
  const suggestion = over > 0 ? cheapestMovable(todayRows) : null;

  // Held rows owe nothing today: never counted open (the bell, the nav badge, 'clear').
  const openish = (r: BoardRow) => (r.state === "open" || r.state === "locked") && !r.heldToday;
  const musts = must.filter(openish).length;
  const due = todayRows.filter(openish).length;

  return {
    today,
    yesterday,
    must,
    todayRows,
    yesterdayRows,
    anytime,
    inbox,
    goals: goalCards(goalTemplates, d, tplById),
    later,
    laterRows,
    planned,
    capacity,
    over,
    suggestion,
    lifeXpToday: d.ledger.today.lifeXp,
    reviewXpToday: d.ledger.today.reviewXp,
    clear: musts === 0 && due === 0,
    counts: { musts, due, inbox: inbox.length },
    habits: { done: habitsDone, total: habitsTotal },
    activeToday: d.ledger.today.completions.length > 0,
    owed: owedNow(duty?.owed ?? [], d.ledger.today, today),
    restToday,
    dutyLive,
  };
}

/**
 * Whether a row still asks something of today: not skipped, and not held by
 * a rest day while undone (a held row the player does anyway counts, kept).
 * The lane tallies, the capacity and the open counts read this one rule.
 */
export function asksToday(r: Pick<BoardRow, "state" | "heldToday">): boolean {
  return r.state !== "skipped" && !(r.heldToday && r.state !== "done");
}

/** The open debts, oldest first, each re-priced against today's live ledger (a tick moves D and V for a make-up too). */
function owedNow(owed: readonly OwedCard[], ledger: DayLedger, today: DayKey): OwedCard[] {
  return owed
    .map((c) => (c.template ? { ...c, ...makeUpPricesOf(c.template, ledger, today) } : c))
    .sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title) || a.slot - b.slot || a.instanceId.localeCompare(b.instanceId));
}

/**
 * The lowest projected-XP open card that is safe to move: not compulsory,
 * not a study task, and not a deadline due today or already past (moving
 * it cannot make it any less late, so the tile never suggests it). Ties go
 * to the longer card, which frees more time.
 */
export function cheapestMovable(rows: readonly BoardRow[]): BoardRow | null {
  let best: BoardRow | null = null;
  for (const r of rows) {
    if (r.state !== "open" || r.template.compulsory || r.auto) continue;
    if (r.template.dueKind === "DEADLINE" && r.template.dueDay && r.template.dueDay <= r.day) continue;
    if (
      !best ||
      r.projection.xp < best.projection.xp ||
      (r.projection.xp === best.projection.xp && r.estMinutes > best.estMinutes) ||
      (r.projection.xp === best.projection.xp && r.estMinutes === best.estMinutes && r.template.title < best.template.title)
    ) {
      best = r;
    }
  }
  return best;
}

/** The price a tick on this row would pay with these minutes or as its minimum version: the drawer's live projection. */
export function projectRow(data: BoardData, r: BoardRow, opts: { minutes?: number | null; mvv?: boolean } = {}): Receipt {
  return planCompletion({
    template: r.template,
    day: r.day,
    today: data.today,
    slot: r.slot,
    minutes: opts.minutes,
    mvv: opts.mvv,
    ledger: ledgerFor(data, r.day),
    streakDays: r.streakDays,
  }).receipt;
}

/**
 * The goals as cards, nearest due first within each horizon. Progress is
 * goals.ts goalProgress as of goalAsOf(today, dueDay), the one measurement
 * the You sheet's ladder and a close also take (a step ticked or a number
 * logged after the due day never counts); the labels are the board's own
 * ('2 of 4 steps', '7 of 12 books', 'no one-off steps'), counted the same
 * way. A closed goal (closedScore set) is skipped: it is finished for good.
 */
function goalCards(goals: BoardTemplate[], d: BoardData, tplById: Map<string, BoardTemplate>): Record<Horizon, GoalCard[]> {
  const out: Record<Horizon, GoalCard[]> = { SHORT: [], MID: [], LONG: [] };
  const children = new Map<string, BoardTemplate[]>();
  for (const t of d.templates) {
    if (!t.parentId || !tplById.has(t.parentId)) continue;
    const list = children.get(t.parentId);
    if (list) list.push(t);
    else children.set(t.parentId, [t]);
  }
  for (const g of goals) {
    if (g.closedScore != null) continue;
    const horizon: Horizon = g.horizon ?? "MID";
    const kids = children.get(g.id) ?? [];
    const steps = kids.filter((k) => !k.recurrence && k.kind !== "GOAL");
    const habits = kids.filter((k) => !!k.recurrence);
    const ratios = habits.map((h) => d.stats[h.id]?.keptRatio28).filter((r): r is number => r != null);
    const support =
      ratios.length > 0
        ? `support habits ${Math.round((ratios.reduce((s, r) => s + r, 0) / ratios.length) * 100)}% kept (28 d)`
        : null;
    const metric: KrMetric = g.krMetric ?? "CHILDREN";
    const input = goalProgressInputOf(g, steps, d);
    // The goal's own due day. For a ROADMAP goal that is the one due day
    // every surface reads (roadmap-types milestoneDueDayOf: the goal's
    // TaskTemplate.dueDay once started, which a Reschedule moves), so Today,
    // the ladder, the close and the roadmap's reach rules judge one day.
    const asOf = goalAsOf(d.today, g.dueDay);
    const progress = goalProgress(input, asOf);
    let label: string;
    let roadmap: RoadmapGoalCard | null = null;
    if (metric === "ROADMAP") {
      // g and its label are goals.ts's ROADMAP branch over the stored series
      // (never a live value), the words the ladder and the close read too.
      // A goal that will never be measured again (its roadmap archived, or
      // its row replaced by Start again) reads 'not measured', with its
      // note, rather than 'not measured yet'.
      roadmap = roadmapGoalCardOf(g, input, asOf, d.today, d.roadmapGoals?.[g.id] ?? null);
      label = roadmap.unmeasured ? "not measured" : goalProgressLabel(input, asOf);
    } else if (metric === "MANUAL") {
      const qty = progressQtyAsOf(input.progress, asOf);
      const target = g.krTarget ?? null;
      const unit = g.krUnit ? ` ${g.krUnit}` : "";
      label = target && target > 0 ? `${fmtQty(qty)} of ${fmtQty(target)}${unit}` : `${fmtQty(qty)}${unit} so far`;
    } else if (metric === "CHILDREN") {
      const { done, total } = stepsDoneAsOf(input.steps, asOf);
      label = total > 0 ? `${done} of ${total} step${total === 1 ? "" : "s"}` : habits.length > 0 ? "no one-off steps" : "no steps yet";
    } else {
      // REVIEWS, IDEAS, WORKOUTS, RUN_KM: goals.ts measures none of them (M5).
      label = "not measured";
    }
    const pastDue = g.dueDay != null && g.dueDay < d.today;
    out[horizon].push({
      template: g,
      horizon,
      metric,
      progress,
      label,
      support,
      dueLabel: g.dueDay ? dueLabelOf(g, d.today).label : null,
      steps: steps.length,
      carried: pastDue && progress != null && progress < 1 ? progress : null,
      ...(roadmap ? { roadmap } : {}),
    });
  }
  for (const h of Object.keys(out) as Horizon[]) {
    out[h].sort((a, b) => (a.template.dueDay ?? "9999").localeCompare(b.template.dueDay ?? "9999") || a.template.createdAt.localeCompare(b.template.createdAt));
  }
  return out;
}

/**
 * What goals.ts goalProgress reads for one goal, from the board's own data:
 * its one-off steps (non-recurring, non-goal children; the board reads no
 * archived template) with the life day each was completed, and its
 * GOAL_PROGRESS by day (goalDays, or, absent, goalQty on the day it was set).
 * A ROADMAP goal also carries its stored series (BoardData.roadmapGoals; none
 * when absent), which goals.ts reads in its ROADMAP branch: the same series
 * the ladder and the close read, so all three give one g.
 */
export function goalProgressInputOf(
  g: BoardTemplate,
  steps: readonly BoardTemplate[],
  d: Pick<BoardData, "goalQty" | "goalDays" | "roadmapGoals">
): GoalProgressInput {
  const qty = d.goalQty[g.id] ?? 0;
  return {
    krMetric: g.krMetric ?? "CHILDREN",
    krTarget: g.krTarget,
    steps: steps.map((s) => ({ completedDay: s.completedAt ? dayKeyOf(new Date(s.completedAt)) : null })),
    progress: d.goalDays?.[g.id] ?? (qty !== 0 ? [{ day: dayKeyOf(new Date(g.createdAt)), qty }] : []),
    ...(g.krMetric === "ROADMAP" ? { readings: d.roadmapGoals?.[g.id]?.series ?? [] } : {}),
  };
}

// ── Roadmap goals on Today (F16 seams 3–4, lane T) ──────────────────────────

/**
 * The open ROADMAP goals whose stored series the board loader reads
 * (BoardData.roadmapGoals, roadmap-readings loadRoadmapGoalSeries): goals
 * with krMetric 'ROADMAP' that are not closed or completed. Empty means the
 * one extra query is skipped. Sorted, so the cache key is stable.
 */
export function roadmapGoalIdsOf(templates: readonly Pick<BoardTemplate, "id" | "kind" | "krMetric" | "closedScore" | "completedAt">[]): string[] {
  return templates
    .filter((t) => t.kind === "GOAL" && t.krMetric === "ROADMAP" && t.closedScore == null && !t.completedAt)
    .map((t) => t.id)
    .sort();
}

/**
 * Why a milestone states 0, in words, for "pays nothing · …" (F15). The
 * loader sends the words themselves (roadmap-readings loadRoadmapGoalSeries;
 * LINEAGE_PAID's carry the day it paid: "this milestone already paid on 3
 * Mar"), used as they are, without a leading "pays nothing ·". A bare
 * roadmap-types StatedZeroReason code is worded here as a fallback, in the
 * roadmap page's own words (roadmap-copy ZERO_REASON_LINE; board-check pins
 * them equal), so a milestone's reason reads the same on Today and its page.
 */
const ZERO_REASON_WORDS: Readonly<Record<StatedZeroReason, string>> = {
  KNOWLEDGE_ONLY: "knowledge is paid by reviews",
  PRACTICE_UNDER_HOUR: "practice under an hour a week",
  PRACTICE_UNDER_SHARE: "practice under a third of this milestone's planned time",
  LINEAGE_PAID: "this milestone already paid",
};

export function roadmapZeroReasonText(reason: string | null | undefined): string | null {
  const t = (reason ?? "").trim();
  if (!t) return null;
  const code = Object.prototype.hasOwnProperty.call(ZERO_REASON_WORDS, t) ? ZERO_REASON_WORDS[t as StatedZeroReason] : null;
  const words = code ?? t.replace(/^pays nothing\s*·\s*/i, "").trim();
  return words || null;
}

/**
 * When a stored reading was taken, as Today shows it (F10: "measured 09:12"
 * or "measured Sat"): the time on this life day, the weekday within the
 * last six days, else the date, with its year when that differs from
 * today's ("measured 20 Dec 2025"). The You ladder (GoalLadder
 * measuredLabel, sheet-math shortDayLabel) and the Aim card (roadmap-copy
 * measuredLabel, dayLabel) word it the same way, so one reading reads alike
 * on all three. Life days and times are Sydney's (LIFE_TZ), so the server
 * and the browser print the same words. null for a bad time.
 */
export function measuredLabelOf(observedAt: string, today: DayKey, tz: string = LIFE_TZ): string | null {
  const ms = Date.parse(observedAt);
  if (!Number.isFinite(ms)) return null;
  const at = new Date(ms);
  const day = dayKeyOf(at, tz);
  if (day === today) {
    try {
      const parts = new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
      return `measured ${pad2(Number(get("hour")))}:${get("minute")}`;
    } catch {
      return "measured today";
    }
  }
  const gap = daysBetween(day, today);
  if (gap > 0 && gap < 7) return `measured ${weekdayName(day)}`;
  const year = day.slice(0, 4) !== today.slice(0, 4) ? ` ${Number(day.slice(0, 4))}` : "";
  return `measured ${shortDate(day)}${year}`;
}

/**
 * The words of a ROADMAP goal's card, part by part (the label itself is
 * goals.ts goalProgressLabel). The binding part is the one that set g's
 * minimum as of `asOf`, by goals.ts's own rule: the stored series point that
 * day reads (roadmapPointAsOf: its class, its label, and when it was
 * measured), or the steps' done share when that is strictly lower (from your
 * ticks; a tie keeps the measure). With no point the caption is null and
 * the card reads not measured: "not measured yet" while a reading may still
 * come, "not measured" for good (`unmeasured`) when the entry's note says
 * why it never will (an archived roadmap, or a row replaced by Start again).
 * Revision 5 (contracts §23.3): an entry seated among 2 or more open goals
 * gives the chip "2 of 5" and its `slot` (the seat glyph before it); with one
 * goal, or no seat read, the card is exactly as before.
 */
export function roadmapGoalCardOf(
  g: Pick<BoardTemplate, "goalMp">,
  input: Pick<GoalProgressInput, "steps" | "readings">,
  asOf: DayKey,
  today: DayKey,
  entry: RoadmapGoalEntrySeated | null
): RoadmapGoalCard {
  const point = roadmapPointAsOf(input.readings, asOf);
  const { done, total } = stepsDoneAsOf(input.steps, asOf);
  const stepsBind = point != null && total > 0 && done / total < Math.max(0, Math.min(1, point.g));
  const caption = point == null ? null : stepsBind || point.bindingClass !== "MEASURED" ? ROADMAP_CAPTION.SELF_REPORTED : ROADMAP_CAPTION.MEASURED;
  const slowest = point == null ? null : stepsBind ? `${done} of ${total} step${total === 1 ? "" : "s"}` : (point.bindingLabel ?? "").trim() || null;
  const note = entry?.note?.trim() || null;
  const seat = entry?.seat && entry.seat.open >= 2 && entry.seat.slot != null ? entry.seat.slot : null;
  const placed = entry != null && entry.ord > 0 && entry.of >= entry.ord;
  return {
    caption,
    slowest,
    measured: point && !stepsBind ? measuredLabelOf(point.observedAt, today) : null,
    chip: placed ? (seat != null ? `${entry.ord} of ${entry.of}` : `Roadmap · milestone ${entry.ord} of ${entry.of}`) : null,
    zeroReason: g.goalMp === 0 ? roadmapZeroReasonText(entry?.zeroReason) : null,
    note,
    unmeasured: point == null && note != null,
    ...(seat != null ? { slot: seat } : {}),
  };
}

/**
 * Whether Today shows the week quests card (F17): only for an OPEN week with
 * at least one quest. Absent for no ACTIVE roadmap or STARTED milestone (no
 * view), and for an empty, HELD or PAST_DUE set — Today stays silent there;
 * the roadmap page says what to do.
 */
export function weekQuestsShownOnToday(view: { state: string; rows: readonly unknown[] } | null | undefined): boolean {
  return !!view && view.state === "OPEN" && view.rows.length > 0;
}

/**
 * Where a sought task lives (SEEK_TEMPLATE_EVENT from a week quest row, or a
 * capture's '#t-' link): which collapsed place the board must open first —
 * 'anytime' for Anytime, Planned later and Coming up, 'inbox' for the Inbox
 * (its row only flashes) — or null when it is drawn in a lane already.
 * `found` is false for a template the board does not hold (archived, or a
 * done one-off off the board): the seek gives up.
 */
export function seekPlaceOf(data: Pick<BoardData, "templates" | "instances" | "stats" | "today">, templateId: string): { found: boolean; open: "anytime" | "inbox" | null } {
  const t = data.templates.find((x) => x.id === templateId);
  if (!t) return { found: false, open: null };
  const lane = placeOf(t, data.today, data.instances.filter((i) => i.templateId === t.id), data.stats[t.id]?.lastDone ?? null).lane;
  if (lane === "inbox") return { found: true, open: "inbox" };
  return { found: true, open: lane === "anytime" || lane === "later" || lane === "upcoming" ? "anytime" : null };
}

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ── Optimistic operations ─────────────────────────────────────────────────

/**
 * What the browser has done that the server has not confirmed yet. Applied
 * on top of the last props, so a tick lands on the click; dropped once the
 * props reflect it (see `reflected`).
 */
export type BoardOp =
  | {
      id: string;
      kind: "complete";
      templateId: string;
      day: DayKey;
      slot: number;
      minutes?: number | null;
      mvv?: boolean;
      /** When it was tapped (ISO). */
      at: string;
      /** Filled in from the server's answer: the real instance and its stored receipt. */
      instanceId?: string;
      receipt?: Receipt;
    }
  | { id: string; kind: "undo"; instanceId: string }
  | { id: string; kind: "skip"; templateId: string; day: DayKey }
  /** Moved to tomorrow, archived, or clarified out of the inbox: gone from where it was. */
  | { id: string; kind: "hide"; templateId: string };

/** Whether fresh props already show an op, so it can be dropped without a flash. */
export function reflected(data: BoardData, op: BoardOp): boolean {
  switch (op.kind) {
    case "complete":
      return data.instances.some((i) => i.templateId === op.templateId && i.day === op.day && i.slot === op.slot && isDoneStatus(i.status));
    case "undo":
      return !data.instances.some((i) => i.id === op.instanceId && isDoneStatus(i.status));
    case "skip":
      return data.instances.some((i) => i.templateId === op.templateId && i.day === op.day && i.status === "SKIPPED");
    case "hide":
      return false;
  }
}

/** Applies optimistic ops to a copy of the data. Idempotent: an op the data already reflects is skipped. */
export function applyOps(data: BoardData, ops: readonly BoardOp[]): BoardData {
  const d: BoardData = {
    ...data,
    templates: [...data.templates],
    instances: [...data.instances],
    paid: { ...data.paid },
    ledger: {
      today: { ...data.ledger.today, completions: [...data.ledger.today.completions] },
      yesterday: { ...data.ledger.yesterday, completions: [...data.ledger.yesterday.completions] },
    },
  };
  for (const op of ops) {
    if (reflected(d, op)) continue;
    if (op.kind === "hide") {
      d.templates = d.templates.filter((t) => t.id !== op.templateId);
      continue;
    }
    if (op.kind === "skip") {
      d.instances = d.instances.filter((i) => !(i.templateId === op.templateId && i.day === op.day && i.slot === 0));
      d.instances.push({ id: `opt:${op.id}`, templateId: op.templateId, day: op.day, slot: 0, status: "SKIPPED", source: "manual", xpPaid: 0 });
      continue;
    }
    if (op.kind === "undo") {
      const inst = d.instances.find((i) => i.id === op.instanceId);
      if (!inst) continue;
      const rec = d.paid[inst.id];
      d.instances = d.instances.map((i) => (i.id === inst.id ? { ...i, status: "UNDONE" as InstanceStatus, xpPaid: 0 } : i));
      const ledger = inst.day === d.today ? d.ledger.today : inst.day === d.yesterday ? d.ledger.yesterday : null;
      if (ledger && rec) {
        const c = ledger.completions.find((x) => x.eventId === rec.eventId);
        ledger.completions = ledger.completions.filter((x) => x.eventId !== rec.eventId);
        if (c) {
          ledger.rawBefore -= c.raw;
          if (c.sink === "TRACK") ledger.lifeXp -= c.xp;
        }
        d.paid[inst.id] = { ...rec, undone: true };
      }
      if (inst.templateId) {
        d.templates = d.templates.map((t) => (t.id === inst.templateId && !t.recurrence ? { ...t, completedAt: null } : t));
      }
      continue;
    }
    // complete
    const t = d.templates.find((x) => x.id === op.templateId);
    if (!t) continue;
    const ledger = op.day === d.today ? d.ledger.today : op.day === d.yesterday ? d.ledger.yesterday : null;
    if (!ledger) continue;
    const stats = d.stats[t.id];
    const plan = planCompletion({
      template: t,
      day: op.day,
      today: d.today,
      slot: op.slot,
      minutes: op.minutes,
      mvv: op.mvv,
      ledger,
      streakDays: stats ? (op.day === d.today ? stats.streak.before.days : stats.streakDaysYesterday) : 0,
    });
    const receipt = op.receipt ?? plan.receipt;
    const instanceId = op.instanceId ?? `opt:${op.id}`;
    const eventId = `opt-ev:${op.id}`;
    d.instances = d.instances.filter((i) => !(i.templateId === t.id && i.day === op.day && i.slot === op.slot));
    d.instances.push({ id: instanceId, templateId: t.id, day: op.day, slot: op.slot, status: plan.status, source: plan.source, xpPaid: receipt.xp });
    ledger.completions.push({ ...plan.completion, raw: receipt.raw, xp: receipt.xp, eventId });
    ledger.rawBefore += receipt.raw;
    if (plan.sink === "TRACK") ledger.lifeXp += receipt.xp;
    d.paid[instanceId] = { eventId, instanceId, receipt, occurredAt: op.at, xp: receipt.xp, undone: false };
    if (!t.recurrence) {
      d.templates = d.templates.map((x) => (x.id === t.id ? { ...x, completedAt: op.at } : x));
    }
  }
  return d;
}

// ── Auto-completion of study tasks ────────────────────────────────────────

export interface AutoPlanItem {
  template: BoardTemplate;
  state: AutoState;
}

/**
 * The study tasks today's activity has satisfied and that have no done
 * instance yet. Pure: `tasks.ts` writes one instance and one 0-XP TASK row
 * (sink NONE, receipt 'paid by reviews') for each.
 */
export function planAutoCompletions(input: {
  templates: readonly BoardTemplate[];
  today: DayKey;
  counts: StudyCounts;
  /** Instances already on today, by template. */
  doneToday: ReadonlySet<string>;
  lastDone: Readonly<Record<string, DayKey | null>>;
}): AutoPlanItem[] {
  const out: AutoPlanItem[] = [];
  for (const t of input.templates) {
    if (!t.autoMetric || !STUDY_METRICS.has(t.autoMetric)) continue;
    if (t.kind === "GOAL" || t.kind === "IDEA_DRAFT" || t.inbox) continue;
    if (input.doneToday.has(t.id)) continue;
    const rule = ruleOf(t);
    if (rule) {
      if (rule.kind !== "TARGET" && !expectedToday(t, rule, input.today, input.lastDone[t.id] ?? null).due) continue;
    } else if (t.completedAt || (t.dueKind === "PLANNED" && t.dueDay && t.dueDay > input.today) || (t.planDay && t.planDay > input.today)) {
      continue;
    }
    const state = autoStateOf(t, input.counts);
    if (state?.met) out.push({ template: t, state });
  }
  return out;
}

/** Study tasks the board shows as met that have no instance yet: what the page's after() should record. */
export function unrecordedStudyTasks(data: BoardData): number {
  const doneToday = new Set(data.instances.filter((i) => i.day === data.today && isDoneStatus(i.status)).map((i) => i.templateId));
  const lastDone: Record<string, DayKey | null> = {};
  for (const [id, s] of Object.entries(data.stats)) lastDone[id] = s.lastDone;
  return planAutoCompletions({
    templates: data.templates,
    today: data.today,
    counts: { reviews: data.ledger.today.reviews, ideas: data.ledger.today.ideas, dueNow: data.dueNow },
    doneToday,
    lastDone,
  }).length;
}

// ── Goals ─────────────────────────────────────────────────────────────────

const HORIZON_ORDER: Record<Horizon, number> = { SHORT: 0, MID: 1, LONG: 2 };

/**
 * A goal's horizon: its tag, or how far off its deadline is (≤ 30 days
 * SHORT, ≤ 180 MID, else LONG). A tag may lower it below what the date
 * implies but never raise it — calling a goal due next week 'long' would
 * only postpone the question of whether it is on track.
 */
export function horizonFor(tag: Horizon | null, dueDay: DayKey | null, today: DayKey): Horizon {
  let byDate: Horizon | null = null;
  if (dueDay) {
    const gap = daysBetween(today, dueDay);
    byDate = gap <= 30 ? "SHORT" : gap <= 180 ? "MID" : "LONG";
  }
  if (tag && byDate) return HORIZON_ORDER[tag] <= HORIZON_ORDER[byDate] ? tag : byDate;
  return tag ?? byDate ?? "MID";
}

/** 'read 12 books' measures itself: MANUAL, target 12, unit 'books'. Otherwise the goal is its children. */
export function goalMetricOf(title: string): { krMetric: KrMetric; krTarget: number | null; krUnit: string | null } {
  const m = /(?:^|\s)(\d{1,6}(?:\.\d+)?)\s*([a-z][a-z-]{0,23})\b/i.exec(title);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return { krMetric: "MANUAL", krTarget: n, krUnit: m[2].toLowerCase() };
  }
  return { krMetric: "CHILDREN", krTarget: null, krUnit: null };
}

// ── The header clock ──────────────────────────────────────────────────────

/** 'Thu 1 Oct', '06:12', 'AEST' for an instant in the life zone. The zone is printed so a wrong one is visible. */
const pad2 = (n: number) => String(n).padStart(2, "0");

export function boardClock(now: Date, tz: string = LIFE_TZ): { date: string; time: string; zone: string; tz: string; lateNight: boolean } {
  try {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // The heading names the life day the board is showing. Between midnight and
    // 04:00 that is still the day before on the calendar, and says so.
    const day = dayKeyOf(now, tz);
    const calendar = `${get("weekday")} ${get("day")} ${get("month")}`;
    const lifeDate = `${WEEKDAY_SHORT[weekdayOf(day) - 1]} ${shortDate(day)}`;
    return {
      date: lifeDate === calendar ? calendar : `${lifeDate} · until ${pad2(DAY_START_HOUR)}:00`,
      time: `${get("hour")}:${get("minute")}`,
      zone: get("timeZoneName"),
      tz,
      // Between midnight and 04:00 the board still shows the day before.
      lateNight: lifeDate !== calendar,
    };
  } catch {
    return { date: shortDate(dayKeyOf(now, tz)), time: "", zone: "", tz, lateNight: false };
  }
}

// ── Moments around a board write (actions/tasks.ts) ───────────────────────

/** The `{ok, value} | {ok, error}` every board write returns (tasks.ts LifeResult). */
export type WriteResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * L3's detectors around one board write: a snapshot before, the write, a
 * snapshot after taken the same way, and the diff, returned with the write's
 * own value as `celebrations` (streak milestones, habit rungs, finished
 * goals; the board presents the T2/T3s and chimes its T1s itself).
 *
 * Decoration only, so it can never cost the write:
 *   - a refused write, or one that changed nothing (`changed` false: a double
 *     tap's stored answer), takes no second snapshot and returns no moments;
 *   - a snapshot or a diff that fails (throws, or has no before) is no moments;
 *   - the write itself runs exactly once, after the before snapshot settles,
 *     so the before never sees the write.
 * Injected so it stays pure: tasks.ts passes captureSnapshot and
 * detectCelebrations, scripts/today-ui-check.ts passes fakes.
 */
export async function withMoments<T, S, E>(deps: {
  snapshot: () => Promise<S>;
  detect: (before: S, after: S) => Promise<E[]>;
  write: () => Promise<WriteResult<T>>;
  changed?: (value: T) => boolean;
}): Promise<WriteResult<T & { celebrations: E[] }>> {
  let before: S | null = null;
  try {
    before = await deps.snapshot();
  } catch {
    before = null;
  }
  const res = await deps.write();
  if (!res.ok) return res;
  let celebrations: E[] = [];
  if (before !== null && (deps.changed?.(res.value) ?? true)) {
    try {
      celebrations = await deps.detect(before, await deps.snapshot());
    } catch {
      celebrations = [];
    }
  }
  return { ok: true, value: { ...res.value, celebrations } };
}
