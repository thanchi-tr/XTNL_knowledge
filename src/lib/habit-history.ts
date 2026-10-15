/**
 * A habit's track record over a calendar year (Tasks › Habits, /today/habits): one card per personal habit, a
 * Monday-first grid of the year's life days, each day's state in the habit's own hue, its completion %, its streaks
 * and this week's count. Pure and client-safe: no database, no clock (today is passed in). The server read is
 * habit-history-server.ts; nothing here or there writes anything (the page is read-only: it never changes the game).
 *
 * A day's state, from its TaskInstance rows and the habit's rule (recurrence.ts), with habit.ts's own reading:
 *
 *   d  done      a DONE or DONE_LATE slot (any kept slot keeps the day)
 *   m  minimum   the minimum version (DONE_MVV): half a day in the %, it holds the streak
 *   h  held      skipped, excused, a declared rest / sick / vacation day or a freeze (Duty's held days, as the board
 *                reads them: boardStreakOptionsOf): outlined, never counted against
 *   x  missed    a due day with nothing kept, once it can no longer be recorded (or a MISSED / WRITTEN_OFF /
 *                MADE_UP row); for a TARGET, a closed period's shortfall, shown on its last empty days the way
 *                settlement writes its missed slots on the period's last day
 *   o  open      due and still recordable (today, yesterday, or after the settlement cursor): no verdict yet
 *   n  not due   the rule did not ask for it that day: a faint base
 *   b / f / z    before the habit began, still to come, after it ended (archived): empty
 *
 * Completion % = (done + ½ × minimum) / due days so far this year, held days in neither (a TARGET counts units:
 * n a period, its held units out of both, an open or unjudged period only what was done). Streaks are in due
 * occurrences (periods for a TARGET): the current one is habit.ts perDutyStreak, exactly what the board's row
 * says; the best is the longest run of the year (kept adds, the minimum and held days hold, a miss breaks).
 *
 *   HABIT_HUES / HUE_NAMES        the 8-hue palette (tokens.css --hab-1..8, Night and Vellum), by creation order
 *   hueOrderOf(templates)         id → hue 1..8: createdAt, then id, over every personal habit ever (archived too)
 *   yearBoundsOf / yearDaysOf     a calendar year's first and last day, and every day of it
 *   yearGridOf(year)              the grid: Monday-first rows, week columns, month labels
 *   moveInGrid(i, key, …)         the grid's arrow keys (roving tabindex), or null when the key does not move
 *   habitCardOf / habitYearOf     the derivation
 *   dayStateWord / dayDetailOf    a square's accessible name and its popover line
 */
import { RECORD_WINDOW_DAYS } from "./life-grade";
import { LIFE_TZ, addDays, daysBetween, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import { describeRule, occursOn, parseRule, periodOf, periodProgress, type Rule } from "./recurrence";
import { HABIT_WINDOW_DAYS, perDutyStreak, targetUnits, type InstanceLike, type StreakOptions } from "./habit";
import type { RestKind } from "./duty-economy";
import type { TaskIcon } from "./task-style";

// ── The palette ───────────────────────────────────────────────────────────

/** How many habit hues there are (tokens.css --hab-1 … --hab-8, each with a Night and a Vellum value). */
export const HABIT_HUES = 8;
/** The hues in palette order; never the Must orange. */
export const HUE_NAMES = ["blue", "amber", "pink", "green", "violet", "cyan", "lime", "sky"] as const;
export type HabitHue = number;

/**
 * Each habit's hue, 1..8: its place in creation order (createdAt, then id) over every personal habit, archived ones
 * included, so a new habit never recolours an old one and an ended habit keeps its colour.
 */
export function hueOrderOf(templates: readonly { id: string; createdAt: string }[]): Record<string, HabitHue> {
  const sorted = [...templates].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: Record<string, HabitHue> = {};
  sorted.forEach((t, i) => {
    out[t.id] = (i % HABIT_HUES) + 1;
  });
  return out;
}

// ── The year and its grid ─────────────────────────────────────────────────

/** The earliest year the switcher offers. */
export const FIRST_YEAR = 2000;

export function yearBoundsOf(year: number): { start: DayKey; end: DayKey } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function yearDaysOf(year: number): DayKey[] {
  const { start, end } = yearBoundsOf(year);
  const out: DayKey[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The year a ?year= asks for: four digits from FIRST_YEAR to this year; anything else is this year. */
export function yearOfParam(raw: unknown, today: DayKey): number {
  const thisYear = Number(today.slice(0, 4));
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== "string" || !/^\d{4}$/.test(text)) return thisYear;
  const y = Number(text);
  return y >= FIRST_YEAR && y <= thisYear ? y : thisYear;
}

/**
 * The first day the instances are read from: the week before the year (a TARGET week straddles New Year) and, for
 * the current year, HABIT_WINDOW_DAYS back from today (perDutyStreak's own window, so the current streak is the
 * board's).
 */
export function readFromOf(year: number, today: DayKey): DayKey {
  const weekBefore = addDays(yearBoundsOf(year).start, -7);
  if (year !== Number(today.slice(0, 4))) return weekBefore;
  const window = addDays(today, -(HABIT_WINDOW_DAYS - 1));
  return window < weekBefore ? window : weekBefore;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export interface YearGrid {
  year: number;
  days: number;
  /** Rows before 1 January in the first column (its weekday − 1). */
  offset: number;
  /** Week columns (53, or 54 when a leap year starts on a Sunday). */
  cols: number;
  /** Month labels above the grid, each at the column its month mostly starts in. */
  months: { label: string; col: number }[];
}

/** Day i of the year (0-based) sits in column ⌊(i + offset) / 7⌋ and row (i + offset) mod 7 (Monday is row 0). */
export function cellOf(i: number, offset: number): { col: number; row: number } {
  return { col: Math.floor((i + offset) / 7), row: (i + offset) % 7 };
}

export function yearGridOf(year: number): YearGrid {
  const { start } = yearBoundsOf(year);
  const days = yearDaysOf(year).length;
  const offset = weekdayOf(start) - 1;
  const cols = Math.ceil((offset + days) / 7);
  const months: { label: string; col: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const first = `${year}-${String(m + 1).padStart(2, "0")}-01`;
    const i = daysBetween(start, first);
    const { col, row } = cellOf(i, offset);
    // A month that starts late in a week labels the next column, where most of its first week is.
    months.push({ label: MONTH_SHORT[m], col: m > 0 && row > 3 ? col + 1 : col });
  }
  return { year, days, offset, cols, months };
}

/**
 * The grid's keys (a roving tabindex): ←/→ a week, ↑/↓ a day within the week's column, Home/End the first or last
 * cell of the row, Ctrl+Home/End 1 January or 31 December. Null when the key does not move (or would leave the year).
 */
export function moveInGrid(i: number, key: string, ctrl: boolean, grid: Pick<YearGrid, "days" | "offset">): number | null {
  const { row } = cellOf(i, grid.offset);
  const inYear = (j: number) => (j >= 0 && j < grid.days ? j : null);
  switch (key) {
    case "ArrowRight":
      return inYear(i + 7);
    case "ArrowLeft":
      return inYear(i - 7);
    case "ArrowDown":
      return row < 6 ? inYear(i + 1) : null;
    case "ArrowUp":
      return row > 0 ? inYear(i - 1) : null;
    case "Home": {
      if (ctrl) return 0;
      let j = i;
      while (j - 7 >= 0) j -= 7;
      return j;
    }
    case "End": {
      if (ctrl) return grid.days - 1;
      let j = i;
      while (j + 7 < grid.days) j += 7;
      return j;
    }
    default:
      return null;
  }
}

/** 'Tue 14 Oct'. */
export function dayShortLabel(day: DayKey): string {
  return `${WEEKDAY_SHORT[weekdayOf(day) - 1]} ${Number(day.slice(8))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1]}`;
}

/** 'Tuesday 14 October'. */
export function dayLongLabel(day: DayKey): string {
  return `${WEEKDAY_LONG[weekdayOf(day) - 1]} ${Number(day.slice(8))} ${MONTH_LONG[Number(day.slice(5, 7)) - 1]}`;
}

// ── Day states ────────────────────────────────────────────────────────────

/** One square: see the header. b, f and z are all empty; they differ only in their words. */
export type DayCode = "d" | "m" | "h" | "x" | "o" | "n" | "b" | "f" | "z";
export const DAY_CODES: readonly DayCode[] = ["d", "m", "h", "x", "o", "n", "b", "f", "z"];

export type HeldWhy = "rest" | "sick" | "vacation" | "freeze" | "skipped" | "excused";

/** What the popover says beyond the state (only days with something to say carry one). */
export interface HabitDayNote {
  /** The first kept (or minimum) slot's local time, '07:12'. */
  at?: string;
  /** XP the day's instances paid (TaskInstance.xpPaid summed). */
  xp?: number;
  /** Kept slots that day, when more than one (an 'Again'). */
  times?: number;
  /** A DONE_LATE: kept by a make-up. */
  late?: true;
  /** Kept (or the minimum) on a day the rule did not ask for: shown, never counted. */
  extra?: true;
  held?: HeldWhy;
  /** A MADE_UP row: the debt was cleared later, the day still reads missed. */
  madeUp?: true;
  /** A TARGET period's shortfall square: what that period kept against its target. */
  short?: { kept: number; target: number; per: "week" | "month" };
}

/** What a template contributes (the server's read, already in life-day keys). */
export interface HabitTemplateFacts {
  id: string;
  title: string;
  recurrence: string | null;
  startDay: DayKey;
  /** ISO; the colour order. */
  createdAt: string;
  sortOrder: number;
  /** dayKeyOf(archivedAt): nothing is expected on or after it. Null: active. */
  archivedDay: DayKey | null;
  mvv: string | null;
  /** TaskStyle's icon (the card's glyph); null draws the check. */
  icon: TaskIcon | null;
}

export interface HabitInstanceFacts {
  templateId: string;
  day: DayKey;
  status: string;
  repaired?: boolean;
  /** ISO. */
  completedAt?: string | null;
  xpPaid?: number;
}

export interface HabitCardContext {
  year: number;
  today: DayKey;
  /** The earliest day the instances cover (readFromOf). */
  since: DayKey;
  hue: HabitHue;
  /** The board's habit options for this template (today-board boardStreakOptionsOf): the cursor and its held days. */
  opts: StreakOptions;
  /** Why a held day holds: the valid declarations, and the freeze days. */
  restKinds: ReadonlyMap<DayKey, RestKind>;
  freezeDays: ReadonlySet<DayKey>;
  tz?: string;
}

export type StreakUnit = "day" | "week" | "month";

export interface HabitYearCard {
  id: string;
  title: string;
  hue: HabitHue;
  icon: TaskIcon | null;
  /** The rule in words: 'every day', 'Mon · Wed · Fri', '3× a week'. */
  rule: string;
  mvv: string | null;
  startDay: DayKey;
  /** The day it ended (archived), or null. */
  ended: DayKey | null;
  /** One code per day of the year, 1 January first. */
  days: string;
  notes: Record<DayKey, HabitDayNote>;
  /** Rounded; null while nothing has been due. */
  percent: number | null;
  /** Units: (done + ½ minimum) and due, as the % reads them. */
  credit: number;
  due: number;
  /** Squares of each state this year. */
  counts: { done: number; minimum: number; held: number; missed: number };
  /** perDutyStreak().kept today (null for another year, or once it ended). */
  current: number | null;
  best: number;
  unit: StreakUnit;
  /** 'this week 3 of 4' (this year, while it runs); null when nothing is asked this period. */
  period: { label: "this week" | "this month"; kept: number; target: number } | null;
  /** The footer line. */
  foot: string;
  /** The card in words, for screen readers. */
  summary: string;
}

export interface HabitYearView {
  year: number;
  today: DayKey;
  prev: number | null;
  next: number | null;
  habits: HabitYearCard[];
  ended: HabitYearCard[];
  percent: number | null;
  /** '4 habits · 63% kept this year'. */
  summary: string;
}

const KEEPS = new Set(["DONE", "DONE_LATE"]);
const BREAKS = new Set(["MISSED", "WRITTEN_OFF", "MADE_UP"]);

interface DayFold {
  kept: number;
  mvv: boolean;
  skipped: boolean;
  excused: boolean;
  broke: boolean;
  madeUp: boolean;
  late: boolean;
  at: string | null;
  xp: number;
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();
/** '07:12' in the life zone. */
export function clockOf(iso: string, tz: string = LIFE_TZ): string {
  let f = clockFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    clockFormatters.set(tz, f);
  }
  return f.format(new Date(iso));
}

function foldDay(list: readonly HabitInstanceFacts[] | undefined, tz: string): DayFold {
  const f: DayFold = { kept: 0, mvv: false, skipped: false, excused: false, broke: false, madeUp: false, late: false, at: null, xp: 0 };
  let first: string | null = null;
  for (const i of list ?? []) {
    f.xp += i.xpPaid ?? 0;
    if (KEEPS.has(i.status)) {
      f.kept += 1;
      if (i.status === "DONE_LATE") f.late = true;
    } else if (i.status === "DONE_MVV") f.mvv = true;
    else if (i.status === "SKIPPED") f.skipped = true;
    else if (i.status === "EXCUSED") f.excused = true;
    else if (BREAKS.has(i.status)) {
      f.broke = true;
      if (i.status === "MADE_UP") f.madeUp = true;
    }
    if ((KEEPS.has(i.status) || i.status === "DONE_MVV") && i.completedAt && (!first || i.completedAt < first)) first = i.completedAt;
  }
  if (first) f.at = clockOf(first, tz);
  return f;
}

/** The rule in words, as the card's header says it: 'every day', 'weekdays', 'Mon · Wed · Fri', '3× a week'. */
export function ruleWords(rule: Rule, startDay?: DayKey): string {
  const d = describeRule(rule, startDay);
  if (d === "Daily") return "every day";
  // A weekday set keeps its capitals ('Mon · Wed · Fri'); 'Monthly …' is not a weekday.
  if (WEEKDAY_SHORT.some((w) => d === w || d.startsWith(`${w} `))) return d;
  return d.charAt(0).toLowerCase() + d.slice(1);
}

function bestRunOf(seq: readonly ("kept" | "held" | "missed")[]): number {
  let run = 0;
  let best = 0;
  for (const o of seq) {
    if (o === "kept") best = Math.max(best, ++run);
    else if (o === "missed") run = 0;
  }
  return best;
}

const unitWord = (n: number, unit: StreakUnit) => (unit === "day" ? String(n) : `${n} ${unit}${n === 1 ? "" : "s"}`);

/**
 * One habit's card for a year, or null when its rule cannot be read (a template with no schedule has nothing to
 * track). `instances` are this template's, covering ctx.since through the year's end.
 */
export function habitCardOf(t: HabitTemplateFacts, instances: readonly HabitInstanceFacts[], ctx: HabitCardContext): HabitYearCard | null {
  const rule = parseRule(t.recurrence);
  if (!rule) return null;
  const tz = ctx.tz ?? LIFE_TZ;
  const { today, opts } = ctx;
  const { start: ys, end: ye } = yearBoundsOf(ctx.year);
  const days = yearDaysOf(ctx.year);
  const byDay = new Map<DayKey, HabitInstanceFacts[]>();
  for (const i of instances) {
    const list = byDay.get(i.day);
    if (list) list.push(i);
    else byDay.set(i.day, [i]);
  }
  const folds = new Map<DayKey, DayFold>();
  const fold = (d: DayKey): DayFold => {
    let f = folds.get(d);
    if (!f) folds.set(d, (f = foldDay(byDay.get(d), tz)));
    return f;
  };
  const outside = (d: DayKey): DayCode | null => (d < t.startDay ? "b" : t.archivedDay != null && d >= t.archivedDay ? "z" : d > today ? "f" : null);
  const pending = (d: DayKey) => daysBetween(d, today) <= RECORD_WINDOW_DAYS || (opts.settledThroughDay != null && d > opts.settledThroughDay);
  const heldWhy = (d: DayKey, f: DayFold): HeldWhy | null => {
    if (f.skipped) return "skipped";
    if (f.excused) return "excused";
    if (!opts.heldDays?.has(d)) return null;
    if (ctx.freezeDays.has(d)) return "freeze";
    const kind = ctx.restKinds.get(d);
    return kind === "SICK" ? "sick" : kind === "VACATION" ? "vacation" : "rest";
  };
  const keptNote = (f: DayFold, extra: boolean): HabitDayNote => {
    const n: HabitDayNote = {};
    if (f.at) n.at = f.at;
    if (f.xp > 0) n.xp = Math.round(f.xp * 10) / 10;
    if (f.kept > 1) n.times = f.kept;
    if (f.late) n.late = true;
    if (extra) n.extra = true;
    return n;
  };

  const codes = new Map<DayKey, DayCode>();
  const notes: Record<DayKey, HabitDayNote> = {};
  for (const d of days) codes.set(d, outside(d) ?? "n");
  const inYear = (d: DayKey) => d >= ys && d <= ye;
  const seq: ("kept" | "held" | "missed")[] = [];
  let credit = 0;
  let due = 0;
  let unit: StreakUnit = "day";

  if (rule.kind === "TARGET") {
    unit = rule.per === "W" ? "week" : "month";
    const n = rule.n;
    for (let p = periodOf(rule, ys); p.start <= ye && p.start <= today; p = periodOf(rule, addDays(p.end, 1))) {
      if (t.archivedDay != null && p.start >= t.archivedDay) break;
      const span: DayKey[] = [];
      for (let d = p.start; d <= p.end; d = addDays(d, 1)) span.push(d);
      const live = span.filter((d) => !outside(d));
      const mvv = live.filter((d) => fold(d).kept === 0 && fold(d).mvv);
      const held = live.filter((d) => fold(d).kept === 0 && !fold(d).mvv && heldWhy(d, fold(d)));
      const empty = live.filter((d) => fold(d).kept === 0 && !fold(d).mvv && !heldWhy(d, fold(d)));
      const periodInstances: InstanceLike[] = span.flatMap((d) => (byDay.get(d) ?? []).map((i) => ({ day: i.day, status: i.status, repaired: i.repaired })));
      const keptU = targetUnits(rule, { start: p.start, end: p.end < today ? p.end : today }, periodInstances, opts.heldDays).kept;
      const minU = Math.min(n - keptU, mvv.length);
      const heldU = Math.min(n - keptU - minU, held.length);
      const shortU = Math.max(0, n - keptU - minU - heldU);
      const cutShort = t.archivedDay != null && t.archivedDay <= p.end;
      const outcome = keptU >= n ? "met" : pending(p.end) ? "open" : p.start < t.startDay || cutShort ? "unjudged" : shortU === 0 ? "held" : "missed";
      const shortDays = new Set(outcome === "missed" ? [...empty].reverse().slice(0, shortU) : []);
      for (const d of span) {
        if (!inYear(d) || outside(d)) continue;
        const f = fold(d);
        if (f.kept > 0) {
          codes.set(d, "d");
          notes[d] = keptNote(f, false);
        } else if (f.mvv) {
          codes.set(d, "m");
          notes[d] = keptNote(f, false);
        } else if (heldWhy(d, f)) {
          codes.set(d, "h");
          notes[d] = { held: heldWhy(d, f)! };
        } else if (shortDays.has(d)) {
          codes.set(d, "x");
          notes[d] = { short: { kept: keptU, target: n, per: rule.per === "W" ? "week" : "month" } };
        } else if (outcome === "open" && pending(d)) codes.set(d, "o");
      }
      // A period counts in the year its last day falls in, so a week across New Year counts once.
      if (p.end > ye) continue;
      credit += keptU + minU / 2;
      due += outcome === "open" || outcome === "unjudged" ? keptU + minU : keptU + minU + shortU;
      if (outcome === "met") seq.push("kept");
      else if (outcome === "held") seq.push("held");
      else if (outcome === "missed") seq.push("missed");
    }
  } else if (rule.kind === "AFTER") {
    // Due N days after it was last done (or from its start); a completion after the due day is late, and the due day
    // reads missed (habit.ts habitStrength's own reading). Before the instances read, the due day is unknown.
    const walkFrom = t.startDay > ctx.since ? t.startDay : ctx.since;
    const walkTo = today < ye ? today : ye;
    let dueDay: DayKey | null = t.startDay >= ctx.since ? t.startDay : null;
    const missAt = (d: DayKey) => {
      if (!inYear(d) || outside(d)) return;
      codes.set(d, "x");
      due += 1;
      seq.push("missed");
    };
    for (let d = walkFrom; d <= walkTo; d = addDays(d, 1)) {
      if (outside(d)) continue;
      const f = fold(d);
      if (f.kept > 0 || f.mvv) {
        if (dueDay != null && d > dueDay) missAt(dueDay);
        if (inYear(d)) {
          codes.set(d, f.kept > 0 ? "d" : "m");
          notes[d] = keptNote(f, false);
          credit += f.kept > 0 ? 1 : 0.5;
          due += 1;
          seq.push(f.kept > 0 ? "kept" : "held");
        }
        dueDay = addDays(d, rule.n);
      } else if (inYear(d) && heldWhy(d, f)) {
        codes.set(d, "h");
        notes[d] = { held: heldWhy(d, f)! };
      }
    }
    if (dueDay != null && dueDay <= walkTo && !outside(dueDay)) {
      if (pending(dueDay)) {
        if (inYear(dueDay)) codes.set(dueDay, "o");
      } else {
        missAt(dueDay);
        if (inYear(today) && !outside(today) && today > dueDay) codes.set(today, "o");
      }
    }
  } else {
    for (const d of days) {
      if (outside(d)) continue;
      const f = fold(d);
      const isDue = occursOn(rule, t.startDay, d);
      if (f.kept > 0) {
        codes.set(d, "d");
        notes[d] = keptNote(f, !isDue);
        if (isDue) {
          credit += 1;
          due += 1;
          seq.push("kept");
        }
      } else if (f.mvv) {
        codes.set(d, "m");
        notes[d] = keptNote(f, !isDue);
        if (isDue) {
          credit += 0.5;
          due += 1;
          seq.push("held");
        }
      } else if (!isDue) {
        codes.set(d, "n");
      } else if (f.skipped || f.excused) {
        codes.set(d, "h");
        notes[d] = { held: heldWhy(d, f)! };
        seq.push("held");
      } else if (f.broke) {
        codes.set(d, "x");
        if (f.madeUp) notes[d] = { madeUp: true };
        due += 1;
        seq.push("missed");
      } else if (heldWhy(d, f)) {
        codes.set(d, "h");
        notes[d] = { held: heldWhy(d, f)! };
        seq.push("held");
      } else if (pending(d)) {
        codes.set(d, "o");
      } else {
        codes.set(d, "x");
        due += 1;
        seq.push("missed");
      }
    }
  }

  const dayString = days.map((d) => codes.get(d) ?? "n").join("");
  const count = (c: DayCode) => dayString.split(c).length - 1;
  const counts = { done: count("d"), minimum: count("m"), held: count("h"), missed: count("x") };
  const thisYear = ctx.year === Number(today.slice(0, 4));
  const active = t.archivedDay == null;
  const running = thisYear && active && t.startDay <= today;
  const history: InstanceLike[] = instances.map((i) => ({ day: i.day, status: i.status, repaired: i.repaired }));
  const current = running ? perDutyStreak(rule, t.startDay, today, history, opts).kept : null;
  const best = Math.max(bestRunOf(seq), current ?? 0);

  let period: HabitYearCard["period"] = null;
  if (running) {
    if (rule.kind === "TARGET") {
      const shown = history.filter((i) => KEEPS.has(i.status) || i.status === "DONE_MVV").map((i) => i.day);
      const pp = periodProgress(rule, today, shown);
      period = { label: rule.per === "W" ? "this week" : "this month", kept: pp.done, target: pp.target };
    } else if (rule.kind !== "AFTER") {
      const monday = weekStartKeyOf(today);
      let kept = 0;
      let target = 0;
      for (let d = monday; d <= addDays(monday, 6); d = addDays(d, 1)) {
        if (d < t.startDay || !occursOn(rule, t.startDay, d)) continue;
        target += 1;
        if (d <= today && (fold(d).kept > 0 || fold(d).mvv)) kept += 1;
      }
      if (target > 0) period = { label: "this week", kept, target };
    }
  }

  const percent = due > 0 ? Math.round((100 * credit) / due) : null;
  const words = ruleWords(rule, t.startDay);
  const footParts: string[] = [];
  if (!active) footParts.push(`Ended ${dayShortLabel(t.archivedDay!)}`);
  if (current != null) footParts.push(`Current ${unitWord(current, unit)}`);
  footParts.push(`${footParts.length > 0 ? "best" : "Best"} ${unitWord(best, unit)}`);
  if (period) footParts.push(`${period.label} ${period.kept} of ${period.target}`);
  if (!running && due > 0) footParts.push(`${counts.done} kept, ${counts.missed} missed`);
  const foot = footParts.join(" · ");
  const pctWords = percent == null ? "nothing due yet" : `${percent}% kept`;
  const summary =
    `${t.title}, ${words}, ${ctx.year}: ${pctWords}. ${counts.done} days kept, ${counts.minimum} at the minimum, ${counts.missed} missed, ${counts.held} held. ` +
    `${current != null ? `Current streak ${unitWord(current, unit)}, best ${unitWord(best, unit)}.` : `Best streak ${unitWord(best, unit)}.`}` +
    `${period ? ` ${period.label.charAt(0).toUpperCase()}${period.label.slice(1)}: ${period.kept} of ${period.target}.` : ""}`;

  return {
    id: t.id,
    title: t.title,
    hue: ctx.hue,
    icon: t.icon,
    rule: words,
    mvv: t.mvv,
    startDay: t.startDay,
    ended: t.archivedDay,
    days: dayString,
    notes,
    percent,
    credit,
    due,
    counts,
    current,
    best,
    unit,
    period,
    foot,
    summary,
  };
}

/** Everything the year read hands over. */
export interface HabitYearInput {
  year: number;
  today: DayKey;
  /** The earliest day `instances` cover (readFromOf). */
  since: DayKey;
  /** Every personal habit, archived ones included (the colour order needs them all). */
  templates: readonly HabitTemplateFacts[];
  instances: readonly HabitInstanceFacts[];
  /** Per template id: boardStreakOptionsOf (absent: none, as before Duty's launch). */
  options: Readonly<Record<string, StreakOptions>>;
  restKinds?: ReadonlyMap<DayKey, RestKind>;
  freezeDays?: ReadonlySet<DayKey>;
  tz?: string;
}

/** The page: every habit with a rule that lived in the year, active ones first in board order, then the ended ones. */
export function habitYearOf(input: HabitYearInput): HabitYearView {
  const { year, today } = input;
  const thisYear = Number(today.slice(0, 4));
  const { start: ys, end: ye } = yearBoundsOf(year);
  const hues = hueOrderOf(input.templates);
  const byTemplate = new Map<string, HabitInstanceFacts[]>();
  for (const i of input.instances) {
    const list = byTemplate.get(i.templateId);
    if (list) list.push(i);
    else byTemplate.set(i.templateId, [i]);
  }
  const order = [...input.templates].sort((a, b) => a.sortOrder - b.sortOrder || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  const cards: HabitYearCard[] = [];
  for (const t of order) {
    if (t.startDay > ye || (t.archivedDay != null && t.archivedDay <= ys)) continue;
    const card = habitCardOf(t, byTemplate.get(t.id) ?? [], {
      year,
      today,
      since: input.since,
      hue: hues[t.id] ?? 1,
      opts: input.options[t.id] ?? {},
      restKinds: input.restKinds ?? new Map(),
      freezeDays: input.freezeDays ?? new Set(),
      tz: input.tz,
    });
    if (card) cards.push(card);
  }
  const habits = cards.filter((c) => c.ended == null);
  const ended = cards.filter((c) => c.ended != null);
  const credit = cards.reduce((s, c) => s + c.credit, 0);
  const due = cards.reduce((s, c) => s + c.due, 0);
  const percent = due > 0 ? Math.round((100 * credit) / due) : null;
  const firstYear = Math.min(thisYear, ...input.templates.map((t) => Number(t.startDay.slice(0, 4))));
  const when = year === thisYear ? "this year" : `in ${year}`;
  const parts = [`${habits.length} ${habits.length === 1 ? "habit" : "habits"}`];
  if (ended.length > 0) parts.push(`${ended.length} ended`);
  parts.push(percent == null ? `nothing due ${when} yet` : `${percent}% kept ${when}`);
  return {
    year,
    today,
    prev: year > Math.max(FIRST_YEAR, firstYear) ? year - 1 : null,
    next: year < thisYear ? year + 1 : null,
    habits,
    ended,
    percent,
    summary: parts.join(" · "),
  };
}

// ── Words ─────────────────────────────────────────────────────────────────

const HELD_WORDS: Record<HeldWhy, string> = {
  rest: "rest day",
  sick: "sick day",
  vacation: "vacation",
  freeze: "freeze used",
  skipped: "skipped",
  excused: "excused",
};

/** A square's state in words, for its accessible name: 'Tue 14 Oct: kept'. */
export function dayStateWord(code: DayCode, note: HabitDayNote | undefined, day: DayKey, today: DayKey): string {
  switch (code) {
    case "d":
      return note?.extra ? "kept, an extra day" : "kept";
    case "m":
      return note?.extra ? "minimum version, an extra day" : "minimum version";
    case "h":
      return note?.held ? HELD_WORDS[note.held] : "held";
    case "x":
      return "missed";
    case "o":
      return day === today ? "due today" : daysBetween(day, today) === 1 ? "not recorded yet" : "not settled yet";
    case "n":
      return "not due";
    case "b":
      return "before it began";
    case "f":
      return "still to come";
    case "z":
      return "after it ended";
  }
}

const paidWords = (xp: number | undefined) => (xp && xp > 0 ? `paid ${(Math.round(xp * 10) / 10).toFixed(1)}` : null);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const line = (parts: readonly (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** The popover's line for a day: 'Kept 07:12 · paid 8.3', 'Minimum version · 10 pushups', 'Rest day', 'Missed', 'Not due'. */
export function dayDetailOf(code: DayCode, note: HabitDayNote | undefined, day: DayKey, today: DayKey, mvv: string | null): string {
  const extra = note?.extra ? "an extra day, not due" : null;
  switch (code) {
    case "d":
      return line([`${note?.late ? "Kept late (a make-up)" : "Kept"}${note?.times ? ` ${note.times}×` : ""}${note?.at ? ` ${note.at}` : ""}`, paidWords(note?.xp), extra]);
    case "m":
      return line(["Minimum version", mvv, note?.at, paidWords(note?.xp), extra]);
    case "h":
      return `${cap(note?.held ? HELD_WORDS[note.held] : "held")} · the streak holds`;
    case "x":
      if (note?.short) return `Missed · the ${note.short.per} kept ${note.short.kept} of ${note.short.target}`;
      return note?.madeUp ? "Missed · the debt was made up later" : "Missed";
    case "o":
      return day === today ? "Due today · not done yet" : daysBetween(day, today) === 1 ? "Not recorded yet" : "Not settled yet";
    case "n":
      return "Not due";
    case "b":
      return "Before it began";
    case "f":
      return "Still to come";
    case "z":
      return "After it ended";
  }
}
