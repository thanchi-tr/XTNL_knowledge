import { addDays, daysBetween, monthKeyOf, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";

/**
 * When a recurring task is due: the grammar TaskTemplate.recurrence is
 * written in, and the pure functions that read it.
 *
 * Three families, because people mean three different things by "every":
 *
 * - a fixed schedule — DAILY, WEEKDAYS, DOW:1,4 (Mon = 1 … Sun = 7),
 *   EVERY:N (every N days, phase fixed from the start day) and MONTHLY:D
 *   (the Dth, or the month's last day when it is shorter) — due on its
 *   days whether or not it was done last time;
 * - after completion — AFTER:N, due N days after it was last done, and
 *   open from then until it is done again ('every! 3 days'). It has no
 *   fixed days to miss, so it can never be compulsory;
 * - a frequency target — TARGET:N/W or TARGET:N/M, N distinct days per
 *   life week (Monday 04:00) or calendar month, on any days.
 *
 * A template with no rule is a one-off (its dueDay and dueKind live on the
 * template). Expected occurrences are never stored: they are a function of
 * the rule, the start day and the day asked about, computed on read the
 * way daily-focus.ts derives its pick, so nothing needs a cron to
 * materialise them. Everything works on life-day keys, so a DST change can
 * neither add nor lose an occurrence.
 */

export type Rule =
  | { kind: "DAILY" }
  | { kind: "WEEKDAYS" }
  | { kind: "DOW"; days: number[] }
  | { kind: "EVERY"; n: number }
  | { kind: "AFTER"; n: number }
  | { kind: "TARGET"; n: number; per: "W" | "M" }
  | { kind: "MONTHLY"; day: number };

/** A rule, its stored string, or nothing (a one-off). Every reader below accepts any of them. */
export type RuleLike = Rule | string | null | undefined;

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Bounds a stored rule is read within; anything outside is not a rule. */
const MAX_INTERVAL_DAYS = 365;

/**
 * Reads a stored rule. Returns null for a one-off and for anything
 * malformed — a template whose rule cannot be read is treated as a one-off
 * rather than guessed at. 'WEEKENDS' is accepted as DOW:6,7.
 */
export function parseRule(text: string | null | undefined): Rule | null {
  if (!text) return null;
  const t = text.trim().toUpperCase();
  if (t === "DAILY") return { kind: "DAILY" };
  if (t === "WEEKDAYS") return { kind: "WEEKDAYS" };
  if (t === "WEEKENDS") return { kind: "DOW", days: [6, 7] };

  let m = /^DOW:([1-7](?:,[1-7])*)$/.exec(t);
  if (m) {
    const days = Array.from(new Set(m[1].split(",").map(Number))).sort((a, b) => a - b);
    return { kind: "DOW", days };
  }
  m = /^(EVERY|AFTER):(\d{1,3})$/.exec(t);
  if (m) {
    const n = Number(m[2]);
    if (n < 1 || n > MAX_INTERVAL_DAYS) return null;
    return { kind: m[1] as "EVERY" | "AFTER", n };
  }
  m = /^TARGET:(\d{1,2})\/([WM])$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    const per = m[2] as "W" | "M";
    if (n < 1 || n > (per === "W" ? 7 : 31)) return null;
    return { kind: "TARGET", n, per };
  }
  m = /^MONTHLY:(\d{1,2})$/.exec(t);
  if (m) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) return null;
    return { kind: "MONTHLY", day };
  }
  return null;
}

/** The canonical stored form of a rule. parseRule(formatRule(r)) is r. */
export function formatRule(rule: Rule): string {
  switch (rule.kind) {
    case "DAILY":
      return "DAILY";
    case "WEEKDAYS":
      return "WEEKDAYS";
    case "DOW":
      return `DOW:${rule.days.join(",")}`;
    case "EVERY":
      return `EVERY:${rule.n}`;
    case "AFTER":
      return `AFTER:${rule.n}`;
    case "TARGET":
      return `TARGET:${rule.n}/${rule.per}`;
    case "MONTHLY":
      return `MONTHLY:${rule.day}`;
  }
}

function toRule(rule: RuleLike): Rule | null {
  if (rule == null) return null;
  return typeof rule === "string" ? parseRule(rule) : rule;
}

/** True for a rule with fixed days (so a miss is a definite thing): everything but AFTER and TARGET. */
export function isFixedSchedule(rule: RuleLike): boolean {
  const r = toRule(rule);
  return !!r && r.kind !== "AFTER" && r.kind !== "TARGET";
}

/** A compulsory task needs something to be judged against; 'after I last did it' is not that. */
export function allowsCompulsory(rule: RuleLike): boolean {
  const r = toRule(rule);
  return !r || r.kind !== "AFTER";
}

function parts(key: DayKey): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** The key of day `d` of the month `key` is in, clamped to the month's last day. */
function monthDay(key: DayKey, d: number): DayKey {
  const [y, m] = parts(key);
  return `${y}-${pad2(m)}-${pad2(Math.min(d, daysInMonth(y, m)))}`;
}

function firstOfNextMonth(key: DayKey): DayKey {
  const [y, m] = parts(key);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
}

const maxKey = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);

/**
 * Whether the rule expects the task on `key`. Nothing is expected before
 * the start day. AFTER is expected from its due day (last done + N, or the
 * start day if never done) until it is done again; TARGET is eligible
 * every day, and periodProgress says whether the period still needs it.
 */
export function occursOn(rule: RuleLike, startDay: DayKey, key: DayKey, lastDoneKey?: DayKey | null): boolean {
  const r = toRule(rule);
  if (!r || key < startDay) return false;
  switch (r.kind) {
    case "DAILY":
    case "TARGET":
      return true;
    case "WEEKDAYS":
      return weekdayOf(key) <= 5;
    case "DOW":
      return r.days.includes(weekdayOf(key));
    case "EVERY":
      return daysBetween(startDay, key) % r.n === 0;
    case "AFTER":
      return key >= afterDue(r.n, startDay, lastDoneKey);
    case "MONTHLY":
      return key === monthDay(key, r.day);
  }
}

function afterDue(n: number, startDay: DayKey, lastDoneKey?: DayKey | null): DayKey {
  return lastDoneKey ? maxKey(addDays(lastDoneKey, n), startDay) : startDay;
}

/**
 * The first day on or after `from` that the rule expects the task —
 * computed directly, never by scanning, and checked against occursOn day
 * by day in scripts/recurrence-check.ts. Null for a one-off.
 */
export function nextDue(rule: RuleLike, startDay: DayKey, from: DayKey, lastDoneKey?: DayKey | null): DayKey | null {
  const r = toRule(rule);
  if (!r) return null;
  const f = maxKey(from, startDay);
  switch (r.kind) {
    case "DAILY":
    case "TARGET":
      return f;
    case "WEEKDAYS": {
      const wd = weekdayOf(f);
      return wd <= 5 ? f : addDays(f, 8 - wd);
    }
    case "DOW": {
      const wd = weekdayOf(f);
      const ahead = r.days.map((d) => (d - wd + 7) % 7);
      return addDays(f, Math.min(...ahead));
    }
    case "EVERY": {
      const rem = daysBetween(startDay, f) % r.n;
      return rem === 0 ? f : addDays(f, r.n - rem);
    }
    case "AFTER":
      return maxKey(f, afterDue(r.n, startDay, lastDoneKey));
    case "MONTHLY": {
      const here = monthDay(f, r.day);
      return here >= f ? here : monthDay(firstOfNextMonth(f), r.day);
    }
  }
}

/**
 * Every day a fixed schedule expects the task in [from, to], oldest first.
 * Empty for AFTER and TARGET, which have no fixed days, and for a one-off.
 */
export function occurrencesBetween(rule: RuleLike, startDay: DayKey, from: DayKey, to: DayKey): DayKey[] {
  const r = toRule(rule);
  if (!r || !isFixedSchedule(r)) return [];
  const out: DayKey[] = [];
  let d = nextDue(r, startDay, from);
  // Bounded by the span itself: every fixed rule advances at least a day.
  while (d && d <= to && out.length <= daysBetween(from, to) + 1) {
    out.push(d);
    d = nextDue(r, startDay, addDays(d, 1));
  }
  return out;
}

export interface PeriodProgress {
  /** Distinct days done in the period. */
  done: number;
  target: number;
  /** First and last life day of the period, inclusive. */
  start: DayKey;
  end: DayKey;
  met: boolean;
}

/** The period a TARGET counts over that contains `key`: its life week, or its calendar month. */
export function periodOf(rule: RuleLike, key: DayKey): { start: DayKey; end: DayKey } {
  const r = toRule(rule);
  if (r?.kind === "TARGET") {
    if (r.per === "W") {
      const start = weekStartKeyOf(key);
      return { start, end: addDays(start, 6) };
    }
    const start = `${monthKeyOf(key)}-01`;
    return { start, end: addDays(firstOfNextMonth(key), -1) };
  }
  return { start: key, end: key };
}

/**
 * Progress in the period containing `key`: '2/3 this week'. Counts
 * distinct days, so two ticks on one day are one. For a rule that is not a
 * TARGET the period is the day itself.
 */
export function periodProgress(rule: RuleLike, key: DayKey, doneKeys: readonly DayKey[]): PeriodProgress {
  const r = toRule(rule);
  const { start, end } = periodOf(r, key);
  const days = new Set(doneKeys.filter((d) => d >= start && d <= end));
  const target = r?.kind === "TARGET" ? r.n : 1;
  return { done: days.size, target, start, end, met: days.size >= target };
}

const ordinal = (n: number): string => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
};

const times = (n: number, per: string): string =>
  n === 1 ? `Once a ${per}` : n === 2 ? `Twice a ${per}` : `${n}× a ${per}`;

/**
 * The rule in words, as chips and receipts print it: 'Mon · Thu',
 * 'Every 3 days', '3 days after done', '3× a week', 'Monthly on the 15th'.
 * Given the start day, a weekly EVERY names its weekday.
 */
export function describeRule(rule: RuleLike, startDay?: DayKey): string {
  const r = toRule(rule);
  if (!r) return "Once";
  switch (r.kind) {
    case "DAILY":
      return "Daily";
    case "WEEKDAYS":
      return "Weekdays";
    case "DOW": {
      const key = r.days.join(",");
      if (key === "1,2,3,4,5,6,7") return "Daily";
      if (key === "1,2,3,4,5") return "Weekdays";
      if (key === "6,7") return "Weekends";
      return r.days.map((d) => WEEKDAY_SHORT[d - 1]).join(" · ");
    }
    case "EVERY": {
      if (r.n === 1) return "Daily";
      if (r.n === 2) return "Every other day";
      if (r.n % 7 === 0) {
        const weeks = r.n / 7;
        const on = startDay ? ` · ${WEEKDAY_SHORT[weekdayOf(startDay) - 1]}` : "";
        return `${weeks === 1 ? "Weekly" : `Every ${weeks} weeks`}${on}`;
      }
      return `Every ${r.n} days`;
    }
    case "AFTER":
      return `${r.n} day${r.n === 1 ? "" : "s"} after done`;
    case "TARGET":
      return times(r.n, r.per === "W" ? "week" : "month");
    case "MONTHLY":
      return `Monthly on the ${ordinal(r.day)}${r.day >= 29 ? " (or the last day)" : ""}`;
  }
}

/**
 * How many times a week the rule asks for the task, on average: the
 * divisor that turns a run of kept occurrences into day-equivalents for
 * the consistency factor C (grading B). 0 for a one-off.
 */
export function scheduledPerWeek(rule: RuleLike): number {
  const r = toRule(rule);
  if (!r) return 0;
  switch (r.kind) {
    case "DAILY":
      return 7;
    case "WEEKDAYS":
      return 5;
    case "DOW":
      return r.days.length;
    case "EVERY":
    case "AFTER":
      return 7 / r.n;
    case "TARGET":
      return r.per === "W" ? r.n : (r.n * 12) / 52;
    case "MONTHLY":
      return 12 / 52;
  }
}
