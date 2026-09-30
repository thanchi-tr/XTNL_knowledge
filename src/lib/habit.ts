import { addDays, daysBetween, type DayKey } from "./life-day";
import { RECORD_WINDOW_DAYS } from "./life-grade";
import { nextDue, occurrencesBetween, parseRule, periodOf, type Rule, type RuleLike } from "./recurrence";

/**
 * A recurring task's standing, derived on read from its expected
 * occurrences and the instances that exist. Nothing here is a stored
 * counter: a counter can drift from the ledger and can keep paying a
 * streak that died while nobody looked (the FieldStreak trap), whereas a
 * derivation is only ever as old as the read.
 *
 * Two readings, for two questions:
 *
 * - perDutyStreak — how many occurrences in a row were kept. It feeds the
 *   price's consistency factor C, and it is what a row prints ('14d').
 *   DONE keeps it; the minimum version, a skip and an excused day hold it
 *   (the Tiny Habits rule: showing up small still counts as showing up);
 *   an expected day that passed the record window with nothing breaks it.
 * - habitStrength — Loop Habit Tracker's score, an EWMA that a kept
 *   occurrence raises and a missed one lowers but never resets. Lally
 *   (2010) found one missed day does not materially slow habit formation;
 *   this is the number that agrees with that, and the rungs read from it.
 *
 * Today and yesterday are never judged: either can still be recorded
 * (RECORD_WINDOW_DAYS), so an open occurrence there is pending, not a miss.
 */

/** What a TaskInstance contributes: its life day and status. */
export interface InstanceLike {
  day: DayKey;
  status: string;
}

export interface StreakOptions {
  /** The earliest day the supplied instances cover. Occurrences before it are not examined. Default: HABIT_WINDOW_DAYS back. */
  since?: DayKey;
  /** Days before today that can still be recorded. Default RECORD_WINDOW_DAYS. */
  recordWindowDays?: number;
}

/**
 * How far back a reading looks by default, today included. Measured in
 * days but it has to be long in occurrences: a once-a-week habit needs 44
 * kept in a row (about 308 days) to reach Automatic, and every rule must
 * be able to reach the consistency cap (64 day-equivalents). The board
 * reads the same span of instances in one query.
 */
export const HABIT_WINDOW_DAYS = 400;

/** Loop's smoothing: 66 kept in a row from nothing reaches 0.97. */
export const HABIT_ALPHA = 0.052;

export type HabitRung = "Seeded" | "Forming" | "Established" | "Automatic";

/** The rungs, each held until strength reaches the next one's floor. Reached from zero at 6, 18 and 44 kept. */
export const HABIT_RUNGS: readonly { rung: HabitRung; from: number }[] = [
  { rung: "Seeded", from: 0 },
  { rung: "Forming", from: 0.25 },
  { rung: "Established", from: 0.6 },
  { rung: "Automatic", from: 0.9 },
];

export type Outcome = "kept" | "held" | "missed" | "pending";

const KEEPS = new Set(["DONE", "DONE_LATE"]);
const HOLDS = new Set(["DONE_MVV", "SKIPPED", "EXCUSED"]);
const BREAKS = new Set(["MISSED", "WRITTEN_OFF"]);

/** One day's instances read together: any kept slot keeps the day; an UNDONE row is as if absent. */
function dayOutcome(statuses: readonly string[] | undefined): Exclude<Outcome, "pending"> | null {
  if (!statuses) return null;
  if (statuses.some((s) => KEEPS.has(s))) return "kept";
  if (statuses.some((s) => HOLDS.has(s))) return "held";
  if (statuses.some((s) => BREAKS.has(s))) return "missed";
  return null;
}

function byDay(instances: readonly InstanceLike[]): Map<DayKey, string[]> {
  const map = new Map<DayKey, string[]>();
  for (const i of instances) {
    const list = map.get(i.day);
    if (list) list.push(i.status);
    else map.set(i.day, [i.status]);
  }
  return map;
}

function windowStart(startDay: DayKey, today: DayKey, since?: DayKey): DayKey {
  const floor = since ?? addDays(today, -(HABIT_WINDOW_DAYS - 1));
  return floor > startDay ? floor : startDay;
}

function toRule(rule: RuleLike): Rule | null {
  if (rule == null) return null;
  return typeof rule === "string" ? parseRule(rule) : rule;
}

/**
 * A fixed schedule's expected occurrences in the window, oldest first,
 * each with what became of it.
 */
export function outcomesOf(
  rule: RuleLike,
  startDay: DayKey,
  today: DayKey,
  instances: readonly InstanceLike[],
  opts: StreakOptions = {}
): { day: DayKey; outcome: Outcome }[] {
  const window = opts.recordWindowDays ?? RECORD_WINDOW_DAYS;
  const days = byDay(instances);
  return occurrencesBetween(rule, startDay, windowStart(startDay, today, opts.since), today).map((day) => {
    const o = dayOutcome(days.get(day));
    return { day, outcome: o ?? (daysBetween(day, today) <= window ? "pending" : "missed") };
  });
}

interface PeriodOutcome {
  start: DayKey;
  end: DayKey;
  kept: number;
  held: number;
  target: number;
  /**
   * met; open (it can still be met, or its last days recorded); unjudged
   * (it began before the habit did, or before the instances read, so it
   * cannot be fairly held to the full target); held (the shortfall is
   * covered by the minimum version, skips or excused days); or missed.
   */
  outcome: "met" | "open" | "unjudged" | "held" | "missed";
}

/** A TARGET's periods in the window, oldest first. Distinct days count, held days excuse a shortfall. */
function periodsOf(rule: Rule & { kind: "TARGET" }, startDay: DayKey, today: DayKey, instances: readonly InstanceLike[], opts: StreakOptions): PeriodOutcome[] {
  const window = opts.recordWindowDays ?? RECORD_WINDOW_DAYS;
  const days = byDay(instances);
  const from = windowStart(startDay, today, opts.since);
  const out: PeriodOutcome[] = [];
  let p = periodOf(rule, from);
  while (p.start <= today) {
    let kept = 0;
    let held = 0;
    for (let d = p.start; d <= p.end && d <= today; d = addDays(d, 1)) {
      const o = dayOutcome(days.get(d));
      if (o === "kept") kept += 1;
      else if (o === "held") held += 1;
    }
    let outcome: PeriodOutcome["outcome"];
    if (kept >= rule.n) outcome = "met";
    else if (daysBetween(p.end, today) <= window) outcome = "open";
    else if (p.start < startDay || p.start < from) outcome = "unjudged";
    else if (kept + held >= rule.n) outcome = "held";
    else outcome = "missed";
    out.push({ start: p.start, end: p.end, kept, held, target: rule.n, outcome });
    p = periodOf(rule, addDays(p.end, 1));
  }
  return out;
}

/** An AFTER task's completion days in the window, oldest first. */
function completionsOf(instances: readonly InstanceLike[], from: DayKey, today: DayKey): DayKey[] {
  const days = new Set<DayKey>();
  for (const i of instances) if (KEEPS.has(i.status) && i.day >= from && i.day <= today) days.add(i.day);
  return Array.from(days).sort();
}

export interface DutyStreak {
  /** Kept occurrences in a row (periods, for a TARGET). */
  kept: number;
  /** Day-equivalents for the consistency factor C: kept × 7 / scheduled per week (a kept week is 7). */
  days: number;
  /** Occurrences held inside the run: the minimum version, skips, excused days. */
  held: number;
  unit: "occurrence" | "week" | "month";
  /** The most recent kept day (the period's last kept day for a TARGET). */
  lastKept: DayKey | null;
  /** True when the run reaches back to the edge of the window read, so `kept` is a floor. */
  capped?: boolean;
}

const EMPTY: DutyStreak = { kept: 0, days: 0, held: 0, unit: "occurrence", lastKept: null, capped: false };

/** Day-equivalents of a run: what C is computed from. */
export function streakDaysOf(rule: RuleLike, kept: number): number {
  const r = toRule(rule);
  if (!r || kept <= 0) return 0;
  switch (r.kind) {
    case "DAILY":
      return kept;
    case "WEEKDAYS":
      return (kept * 7) / 5;
    case "DOW":
      return (kept * 7) / r.days.length;
    case "EVERY":
    case "AFTER":
      return kept * r.n;
    case "MONTHLY":
      return (kept * 365) / 12;
    case "TARGET":
      return r.per === "W" ? kept * 7 : (kept * 365) / 12;
  }
}

/**
 * The per-duty streak on `today`. `instances` must cover the window from
 * `opts.since` (default HABIT_WINDOW_DAYS back) to today: an expected day
 * inside it with no instance reads as missed once it leaves the record
 * window.
 */
export function perDutyStreak(
  rule: RuleLike,
  startDay: DayKey,
  today: DayKey,
  instances: readonly InstanceLike[],
  opts: StreakOptions = {}
): DutyStreak {
  const r = toRule(rule);
  if (!r) return EMPTY;
  const from = windowStart(startDay, today, opts.since);
  const window = opts.recordWindowDays ?? RECORD_WINDOW_DAYS;

  if (r.kind === "TARGET") {
    const periods = periodsOf(r, startDay, today, instances, opts);
    let kept = 0;
    let held = 0;
    let lastKept: DayKey | null = null;
    let broke = false;
    for (let i = periods.length - 1; i >= 0; i--) {
      const p = periods[i];
      if (p.outcome === "met") {
        kept += 1;
        lastKept ??= p.end < today ? p.end : today;
      } else if (p.outcome === "missed") {
        broke = true;
        break;
      } else if (p.outcome === "held") {
        held += 1;
      }
    }
    return {
      kept,
      days: streakDaysOf(r, kept),
      held,
      unit: r.per === "W" ? "week" : "month",
      lastKept,
      capped: !broke && kept > 0 && from > startDay,
    };
  }

  if (r.kind === "AFTER") {
    const done = completionsOf(instances, from, today);
    if (done.length === 0) return EMPTY;
    const last = done[done.length - 1];
    // Overdue past what can still be recorded: the run is over.
    if (daysBetween(addDays(last, r.n), today) > window) return { ...EMPTY };
    let kept = 1;
    let broke = false;
    for (let i = done.length - 1; i > 0; i--) {
      if (daysBetween(done[i - 1], done[i]) <= r.n) kept += 1;
      else {
        broke = true;
        break;
      }
    }
    return { kept, days: streakDaysOf(r, kept), held: 0, unit: "occurrence", lastKept: last, capped: !broke && from > startDay };
  }

  const outcomes = outcomesOf(r, startDay, today, instances, opts);
  let kept = 0;
  let held = 0;
  let lastKept: DayKey | null = null;
  let broke = false;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const { day, outcome } = outcomes[i];
    if (outcome === "pending") continue;
    if (outcome === "kept") {
      kept += 1;
      lastKept ??= day;
    } else if (outcome === "held") held += 1;
    else {
      broke = true;
      break;
    }
  }
  return { kept, days: streakDaysOf(r, kept), held, unit: "occurrence", lastKept, capped: !broke && kept > 0 && from > startDay };
}

/** Strength after a run of outcomes, oldest first, from `start`. Held and pending leave it unchanged. */
export function strengthAfter(outcomes: readonly Outcome[], start = 0): number {
  let s = start;
  for (const o of outcomes) {
    if (o === "kept") s = s * (1 - HABIT_ALPHA) + HABIT_ALPHA;
    else if (o === "missed") s = s * (1 - HABIT_ALPHA);
  }
  return s;
}

/**
 * Habit strength on `today`, 0..1. A TARGET scores each required day of a
 * closed period — the days done as kept, the shortfall not covered by
 * holds as missed — and the current period's days done so far. An AFTER
 * scores each completion, with a miss before any that came late.
 */
export function habitStrength(
  rule: RuleLike,
  startDay: DayKey,
  today: DayKey,
  instances: readonly InstanceLike[],
  opts: StreakOptions = {}
): number {
  const r = toRule(rule);
  if (!r) return 0;

  if (r.kind === "TARGET") {
    const seq: Outcome[] = [];
    for (const p of periodsOf(r, startDay, today, instances, opts)) {
      const kept = Math.min(p.kept, p.target);
      for (let i = 0; i < kept; i++) seq.push("kept");
      if (p.outcome === "missed") {
        const short = Math.max(0, p.target - kept - p.held);
        for (let i = 0; i < short; i++) seq.push("missed");
      }
    }
    return strengthAfter(seq);
  }

  if (r.kind === "AFTER") {
    const window = opts.recordWindowDays ?? RECORD_WINDOW_DAYS;
    const done = completionsOf(instances, windowStart(startDay, today, opts.since), today);
    const seq: Outcome[] = [];
    done.forEach((d, i) => {
      if (i > 0 && daysBetween(done[i - 1], d) > r.n) seq.push("missed");
      seq.push("kept");
    });
    const due = nextDue(r, startDay, today, done[done.length - 1] ?? null);
    if (due && daysBetween(due, today) > window) seq.push("missed");
    return strengthAfter(seq);
  }

  return strengthAfter(outcomesOf(r, startDay, today, instances, opts).map((o) => o.outcome));
}

/** The rung a strength stands on. */
export function rungOf(strength: number): HabitRung {
  let rung: HabitRung = "Seeded";
  for (const r of HABIT_RUNGS) if (strength >= r.from) rung = r.rung;
  return rung;
}

/** Kept occurrences in a row still needed to reach the next rung: ceil(ln((1 − target)/(1 − S)) / ln(0.948)). Null at the top. */
export function keptToNextRung(strength: number): number | null {
  const s = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0));
  const next = HABIT_RUNGS.find((r) => r.from > s);
  if (!next) return null;
  const n = Math.log((1 - next.from) / (1 - s)) / Math.log(1 - HABIT_ALPHA);
  // A hair of tolerance so a strength a rounding error short of a rung does not ask for one more.
  return Math.max(1, Math.ceil(n - 1e-9));
}

/** The row's words: 'Forming · 4 more to Established', or just 'Automatic'. */
export function habitLine(strength: number): string {
  const rung = rungOf(strength);
  const more = keptToNextRung(strength);
  if (more == null) return rung;
  const next = HABIT_RUNGS[HABIT_RUNGS.findIndex((r) => r.rung === rung) + 1].rung;
  return `${rung} · ${more} more to ${next}`;
}
