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
import { addDays, daysBetween, dayKeyOf, weekdayOf, LIFE_TZ, type DayKey } from "./life-day";
import type {
  ActivityInput,
  AutoMetric,
  Band,
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
  TaskKind,
  Timing,
  Track,
} from "./life-types";
import type { Attribute } from "@prisma/client";
import { UNDO_WINDOW_MINUTES, effBand, estEff, payModeOf, priceTask, timingFor } from "./life-grade";
import { repeatNOf } from "./life-lexicon";
import { describeRule, nextDue, occursOn, parseRule, periodProgress, scheduledPerWeek, type Rule } from "./recurrence";
import {
  HABIT_WINDOW_DAYS,
  habitStrength,
  keptToNextRung,
  perDutyStreak,
  rungOf,
  type DutyStreak,
  type HabitRung,
  type InstanceLike,
} from "./habit";

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
export const STUDY_METRICS: ReadonlySet<AutoMetric> = new Set<AutoMetric>(["REVIEWS", "IDEAS", "REVIEW_DUE"]);

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
}

export interface BoardInstance {
  id: string;
  templateId: string;
  day: DayKey;
  slot: number;
  status: InstanceStatus;
  source: InstanceSource;
  xpPaid: number;
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
  today: DayKey;
  yesterday: DayKey;
  capacityMin: number;
  templates: BoardTemplate[];
  /** Instances from the start of the current month or week (whichever is earlier) and yesterday on. */
  instances: BoardInstance[];
  stats: Record<string, TemplateStats>;
  ledger: { today: DayLedger; yesterday: DayLedger };
  /** Keyed by instance id. */
  paid: Record<string, PaidRecord>;
  /** Σ GOAL_PROGRESS qty per goal. */
  goalQty: Record<string, number>;
  /** Cards due now; null where the caller did not read it (the nav count). */
  dueNow: number | null;
}

// ── Small pure helpers ────────────────────────────────────────────────────

const DONE_STATUSES: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV"]);

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
  const timing = timingOf(t, p.day);
  const recurring = !!ruleOf(t);
  const input: PriceInput = {
    band: t.band,
    bandOverride: t.bandOverride,
    machineMinutes: t.machineMinutes,
    estMinutes: t.estMinutes,
    minutes: sanitizeMinutes(p.minutes),
    timing,
    recurring,
    streakDays: recurring ? Math.max(0, p.streakDays) : 0,
    repeatN: ledgerRepeatN(t, p.ledger),
    introBefore: ledgerIntroBefore(p.ledger),
    mode,
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

/** The TASK ledger row a planned completion writes. */
export function taskEventInput(
  plan: CompletionPlan,
  at: { templateId: string; track: Track; instanceId: string; day: DayKey; slot: number; attempt: number; now: Date; countsForStreak?: boolean; detail?: string | null }
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
    dedupeKey: taskDedupeKey(at.templateId, at.day, at.slot, at.attempt),
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

// ── Per-habit history ─────────────────────────────────────────────────────

/**
 * The consistency a completion on `day` is priced with: the per-duty streak
 * with that day still open. Shared by the board's projection and the
 * completion itself so the two cannot disagree.
 */
export function streakDaysFor(t: Pick<BoardTemplate, "startDay">, rule: Rule, history: readonly InstanceLike[], day: DayKey): number {
  return perDutyStreak(rule, t.startDay, day, history.filter((i) => i.day < day)).days;
}

export function statsFor(t: BoardTemplate, rule: Rule, instances: readonly BoardInstance[], today: DayKey): TemplateStats {
  // habit.ts reads several slots on one day as one day (any kept slot keeps it).
  const days: InstanceLike[] = instances.map((i) => ({ day: i.day, status: i.status }));
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
    streak: { before: perDutyStreak(rule, t.startDay, today, before), ifDone: perDutyStreak(rule, t.startDay, today, ifDone) },
    strength: { before: habitStrength(rule, t.startDay, today, before), ifDone: habitStrength(rule, t.startDay, today, ifDone) },
    streakDaysYesterday: streakDaysFor(t, rule, days, yesterday),
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
      ...extra,
    };
  };

  for (const t of d.templates) {
    if (t.kind === "GOAL") {
      goalTemplates.push(t);
      continue;
    }
    if (t.inbox || t.kind === "IDEA_DRAFT") {
      inbox.push(t);
      continue;
    }
    const rule = ruleOf(t);
    const insts = instancesByTpl.get(t.id) ?? [];

    if (!rule) {
      // One-offs. Done today (or recorded for yesterday this morning) stays on
      // the board ticked, so it can be undone; done earlier is gone.
      const doneInst = insts.find(
        (i) => isDoneStatus(i.status) && (i.day === today || (i.day === yesterday && i.source === "record-yesterday"))
      );
      if (t.completedAt && !doneInst) continue;
      const due = dueLabelOf(t, today);
      if (doneInst) {
        const lane: Lane = doneInst.day === yesterday ? "yesterday" : t.compulsory ? "must" : "today";
        const r = row(t, lane, doneInst.day, { dueLabel: due.label, late: due.late });
        (lane === "must" ? must : lane === "yesterday" ? yesterdayRows : todayRows).push(r);
        continue;
      }
      if (!t.dueDay) {
        anytime.push(row(t, "anytime", today));
        continue;
      }
      if (t.dueKind === "DEADLINE") {
        const gap = daysBetween(today, t.dueDay);
        // Due yesterday: late if done now, but still on time if it was done
        // yesterday and only the tick is late — the record window's promise.
        if (t.dueDay === yesterday && t.startDay <= yesterday) {
          yesterdayRows.push(row(t, "yesterday", yesterday, { dueLabel: "by yesterday" }));
        }
        if (gap <= 0) {
          (t.compulsory ? must : todayRows).push(row(t, t.compulsory ? "must" : "today", today, { dueLabel: due.label, late: due.late }));
        } else if (gap <= DEADLINE_LOOKAHEAD_DAYS) {
          todayRows.push(row(t, "today", today, { dueLabel: due.label }));
        } else {
          anytime.push(row(t, "anytime", today, { dueLabel: due.label }));
        }
        continue;
      }
      // PLANNED: on or after its day it is today's; before, it waits.
      if (t.dueDay > today) {
        later += 1;
        continue;
      }
      (t.compulsory ? must : todayRows).push(
        row(t, t.compulsory ? "must" : "today", today, { dueLabel: due.label, carriedFrom: due.carriedFrom })
      );
      continue;
    }

    // Recurring.
    const stats = d.stats[t.id];
    const lastDone = stats?.lastDone ?? null;
    const doneToday = insts.some((i) => i.day === today && isDoneStatus(i.status));

    if (rule.kind === "TARGET") {
      if (t.startDay > today) continue;
      const doneKeys = [...new Set(insts.filter((i) => isDoneStatus(i.status)).map((i) => i.day))];
      const pp = periodProgress(rule, today, doneKeys);
      const progress: RowProgress = {
        done: pp.done,
        target: pp.target,
        label: `${pp.done}/${pp.target} this ${rule.per === "W" ? "week" : "month"}`,
        met: pp.met,
      };
      habitsTotal += 1;
      if (doneToday || pp.met) habitsDone += 1;
      if (pp.met && !doneToday) anytime.push(row(t, "anytime", today, { progress }));
      else (t.compulsory ? must : todayRows).push(row(t, t.compulsory ? "must" : "today", today, { progress }));
      continue;
    }

    const exp = expectedToday(t, rule, today, lastDone);
    if (exp.due || doneToday) {
      habitsTotal += 1;
      if (doneToday) habitsDone += 1;
      const lane: Lane = t.compulsory ? "must" : "today";
      const r = row(t, lane, today, {
        carriedFrom: exp.carriedFrom,
        dueLabel: exp.carriedFrom ? `from ${dayName(exp.carriedFrom, today)}` : null,
      });
      (lane === "must" ? must : todayRows).push(r);
    }

    // Yesterday's occurrence, still recordable. AFTER and TARGET rules carry
    // on their own, and a study task only ever completes on its day.
    if (rule.kind !== "AFTER" && !t.autoMetric && t.startDay <= yesterday && occursOn(rule, t.startDay, yesterday, lastDone)) {
      const y = insts.filter((i) => i.day === yesterday);
      const judged = y.some((i) => i.status === "SKIPPED" || i.status === "EXCUSED" || i.status === "MISSED" || i.status === "WRITTEN_OFF");
      const doneY = y.find((i) => isDoneStatus(i.status));
      // Open, or recorded this morning (so the tick shows and can be undone).
      if (!judged && (!doneY || doneY.source === "record-yesterday")) {
        yesterdayRows.push(row(t, "yesterday", yesterday));
      }
    }
  }

  sortRows(must);
  sortRows(todayRows);
  sortRows(yesterdayRows);
  sortRows(anytime);
  inbox.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Capacity: what the day asks of you, done or not; a skipped card no longer asks.
  const planned = [...must, ...todayRows].filter((r) => r.state !== "skipped").reduce((s, r) => s + r.estMinutes, 0);
  const capacity = Math.max(0, d.capacityMin);
  const over = Math.max(0, planned - capacity);
  const suggestion = over > 0 ? cheapestMovable(todayRows) : null;

  const openish = (r: BoardRow) => r.state === "open" || r.state === "locked";
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
  };
}

/** The lowest projected-XP open card that is safe to move: not compulsory, not a study task. Ties go to the longer card, which frees more time. */
export function cheapestMovable(rows: readonly BoardRow[]): BoardRow | null {
  let best: BoardRow | null = null;
  for (const r of rows) {
    if (r.state !== "open" || r.template.compulsory || r.auto) continue;
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
    let progress: number | null = null;
    let label: string;
    if (metric === "MANUAL") {
      const qty = d.goalQty[g.id] ?? 0;
      const target = g.krTarget ?? null;
      progress = target && target > 0 ? Math.max(0, Math.min(1, qty / target)) : null;
      label = target ? `${fmtQty(qty)} of ${fmtQty(target)}${g.krUnit ? ` ${g.krUnit}` : ""}` : `${fmtQty(qty)}${g.krUnit ? ` ${g.krUnit}` : ""} so far`;
    } else if (steps.length > 0) {
      const done = steps.filter((s) => s.completedAt).length;
      progress = done / steps.length;
      label = `${done} of ${steps.length} step${steps.length === 1 ? "" : "s"}`;
    } else {
      label = habits.length > 0 ? "no one-off steps" : "no steps yet";
    }
    out[horizon].push({
      template: g,
      horizon,
      metric,
      progress,
      label,
      support,
      dueLabel: g.dueDay ? dueLabelOf(g, d.today).label : null,
      steps: steps.length,
    });
  }
  for (const h of Object.keys(out) as Horizon[]) {
    out[h].sort((a, b) => (a.template.dueDay ?? "9999").localeCompare(b.template.dueDay ?? "9999") || a.template.createdAt.localeCompare(b.template.createdAt));
  }
  return out;
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
    } else if (t.completedAt || (t.dueKind === "PLANNED" && t.dueDay && t.dueDay > input.today)) {
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
export function boardClock(now: Date, tz: string = LIFE_TZ): { date: string; time: string; zone: string; tz: string } {
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
    return {
      date: `${get("weekday")} ${get("day")} ${get("month")}`,
      time: `${get("hour")}:${get("minute")}`,
      zone: get("timeZoneName"),
      tz,
    };
  } catch {
    return { date: shortDate(dayKeyOf(now, tz)), time: "", zone: "", tz };
  }
}
