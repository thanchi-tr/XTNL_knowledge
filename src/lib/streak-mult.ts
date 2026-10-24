/**
 * The global daily-quest streak multiplier (blueprint 3.2a "Streak multiplier"; plan P29; decision D25; harm H3's safer
 * variant). Pure and client-importable: no Prisma, no clock. The server's read is streak-mult-server.ts
 * (loadStreakFacts); the board's projection, the server's payment (today-board planCompletion), Today's chip, the rules
 * page and the phone read the same rules here.
 *
 * INERT UNTIL STREAK_LAUNCH_DAY (null in code; outside production XTNL_STREAK_LAUNCH_DAY may set it, the rehearsal server
 * and the sims). While it is null nothing is read and nothing below is applied: C is the per-habit consistency it always
 * was, every receipt is 'life-1' to 'life-3' byte for byte, and Today, the rules page and the phone read exactly as
 * before. It is flipped only on the user's direct go.
 *
 *   d           the judged Full days in a row before a tick's day (fullDayRunOf): settlement's FULL_DAY rows, counted back
 *               from the latest judged day (the settlement cursor: today − 2 in the usual run, yesterday once it is
 *               settled early from Today). Today is never judged, so a tick today never moves it. Today and /check await
 *               Duty's lazy settle before their board read while it is in force (settlement settleForStreak), and the
 *               early settle refreshes the board, so what a row projects is what its tick pays
 *   kept weeks  a 'life-4' receipt stores the raw it had without the multiplier (streak.plainRaw), and the week judge
 *               counts that toward the kept floor (life-weeks keptRawOf), so kept weeks, and MP, never move with it
 *   bridges     a held day (a declared rest, sick or vacation day) and a rest-token day (FREEZE_USE) bridge the streak
 *               without adding a day, even when its rings closed; any other judged day that is not Full ends it, so one
 *               miss resets it to ×1.00. The minimum version keeps a must (full-day.ts MUST_KEPT_STATUSES)
 *   m(d)        min(1.2, 1.05^d) (life-grade streakMult): ×1.00, ×1.05, ×1.10, ×1.16, then ×1.20 from day 4
 *   where       C on every full personal tick from the launch day, one-offs included (a work tab's task pays nothing);
 *               never the minimum version, #play, a study task, a walk's SESSION, a make-up (×0.85, C 1.00), a review or
 *               an MP mint. Per-habit streaks stay for display and habit strength
 *   receipts    'life-4' (life-grade FORMULA_VERSION_STREAK) with `streak` {days, mult}, on top of 'life-3' (a proof tick
 *               keeps its proof fields). A receipt before the launch is never repriced
 *   Duty        the streak reads settlement's judgements, which exist only once Duty is live, so it is in force from the
 *               later of STREAK_LAUNCH_DAY and DUTY_LAUNCH_DAY (streakFromOf): a habit is never priced at ×1.00 for want
 *               of a judged day. Judged Full days before the streak's own launch count (they are facts, read forward)
 *
 * Exports
 *   Launch   STREAK_LAUNCH_DAY · STREAK_LAUNCH_DAY_ENV · StreakEnv · streakLaunchDay(env?) · streakOn(day, launchDay?) ·
 *            streakFromOf(streakLaunch, dutyLaunch) · streakLive(day, from)
 *   The run  STREAK_READ_DAYS · StreakFacts · StreakRun · NO_RUN · fullDayRunOf(facts, day)
 *   Board    BoardStreak · streakRunOn(b, day) · StreakView · streakViewOf(run)
 *   Words    STREAK_RULES_HREF · streakMultText(mult) · streakDayText(run) · streakChipText(run) · streakDescribe(run) ·
 *            streakTickText(r) · streakRuleLines()
 */
import { addDays, type DayKey } from "./life-day";
import { isDayKey } from "./life-economy";
import { SETTLE_LAG_DAYS } from "./duty-economy";
import { STREAK_MULT_BASE, STREAK_MULT_CAP, STREAK_MULT_CAP_DAYS, TIMING_FACTOR, streakMult } from "./life-grade";
import type { Receipt } from "./life-types";

// ── Launch ────────────────────────────────────────────────────────────────

/**
 * The first life day the streak multiplier is in force (D25). Null keeps it inert: no read, no 'life-4' receipt, no chip.
 * Set in the launch commit only, on the user's direct go; a code constant survives a 'life' reset.
 */
export const STREAK_LAUNCH_DAY = null as DayKey | null;

/** Outside production, a valid 'YYYY-MM-DD' here overrides STREAK_LAUNCH_DAY (the rehearsal server, the sims). */
export const STREAK_LAUNCH_DAY_ENV = "XTNL_STREAK_LAUNCH_DAY";

/** The variables the switch reads. Defaults to process.env; the checks pass their own. */
export interface StreakEnv {
  NODE_ENV?: string;
  XTNL_STREAK_LAUNCH_DAY?: string;
}

/** Each variable read by name, so a bundler can inline NODE_ENV; on a client the XTNL_ one is undefined (a server decision). */
function readEnv(env?: StreakEnv): StreakEnv {
  if (env) return env;
  if (typeof process === "undefined" || !process.env) return {};
  return { NODE_ENV: process.env.NODE_ENV, XTNL_STREAK_LAUNCH_DAY: process.env.XTNL_STREAK_LAUNCH_DAY };
}

/** The launch day in force: outside production a valid XTNL_STREAK_LAUNCH_DAY, else STREAK_LAUNCH_DAY. */
export function streakLaunchDay(env?: StreakEnv): DayKey | null {
  const e = readEnv(env);
  if (e.NODE_ENV !== "production") {
    const override = e.XTNL_STREAK_LAUNCH_DAY?.trim();
    if (isDayKey(override)) return override;
  }
  return STREAK_LAUNCH_DAY;
}

/** The streak's own switch is on for life day `day`: on and after its launch day; never while there is none. */
export function streakOn(day: DayKey, launchDay: DayKey | null = streakLaunchDay()): boolean {
  return launchDay != null && day >= launchDay;
}

/**
 * The first day the multiplier prices a tick: the later of its own launch day and Duty's (the streak reads settlement's
 * judgements, written only once Duty is live). Null while either is unset.
 */
export function streakFromOf(streakLaunch: DayKey | null, dutyLaunch: DayKey | null): DayKey | null {
  if (streakLaunch == null || dutyLaunch == null) return null;
  return streakLaunch > dutyLaunch ? streakLaunch : dutyLaunch;
}

/** The multiplier prices a tick dated `day`: on and after `from` (streakFromOf); never while there is none. */
export function streakLive(day: DayKey, from: DayKey | null): boolean {
  return from != null && day >= from;
}

// ── The run ───────────────────────────────────────────────────────────────

/**
 * How far back the server reads FULL_DAY, FREEZE_USE and rest rows (a bound on one modest query): a run that reaches the
 * window's first day is reported as a floor ('day 400+'). The multiplier itself is capped from day 4.
 */
export const STREAK_READ_DAYS = 400;

/** What the run is counted from (the server reads it; the checks build it). */
export interface StreakFacts {
  /** The first day settlement ever judges (duty-economy firstDutyDay); null: none (Duty off), so the run is 0. */
  firstJudged: DayKey | null;
  /** LifeSettings.settledThroughDay: the latest judged day; null: nothing judged yet. */
  cursor: DayKey | null;
  /** The days with a FULL_DAY row ('fullday:<d>'). */
  fullDays: ReadonlySet<DayKey>;
  /** The held days: a declared rest, sick or vacation day (duty-rule heldDaysOf) and a rest-token day (FREEZE_USE). */
  heldDays: ReadonlySet<DayKey>;
  /** The read's first day; a run still counting there is a floor. Absent or null: firstJudged (the whole history). */
  from?: DayKey | null;
}

/** d, the judged Full days in a row; `floor`: the run reached the read's window, so it is at least `days`. */
export interface StreakRun {
  days: number;
  floor: boolean;
}

export const NO_RUN: StreakRun = { days: 0, floor: false };

/** A sanity bound on one walk, past any read window. */
const RUN_SCAN_MAX = 3660;

/**
 * d for a tick dated `day`: from the latest judged day before it (the cursor, or day − 1 when the cursor is at or past
 * it) back to the first judged day, a Full day adds one, a held day bridges without adding (held first: a rest-token
 * day whose rings closed still adds nothing), and any other judged day ends the run. 0 with no judged day.
 */
export function fullDayRunOf(f: StreakFacts, day: DayKey): StreakRun {
  if (f.firstJudged == null || f.cursor == null) return NO_RUN;
  const before = addDays(day, -1);
  let x = f.cursor < before ? f.cursor : before;
  const windowFrom = f.from != null && f.from > f.firstJudged ? f.from : null;
  const stop = windowFrom ?? f.firstJudged;
  let days = 0;
  for (let i = 0; x >= stop && i < RUN_SCAN_MAX; i++, x = addDays(x, -1)) {
    if (f.heldDays.has(x)) continue;
    if (f.fullDays.has(x)) {
      days += 1;
      continue;
    }
    return { days, floor: false };
  }
  return { days, floor: windowFrom != null };
}

// ── The board ─────────────────────────────────────────────────────────────

/**
 * BoardData.streak (today-board): the first day the multiplier prices a tick (streakFromOf) and d for a tick dated
 * today and one dated yesterday. The server sends it only while the streak is in force today; absent, every
 * projection, chip and receipt is exactly as before.
 */
export interface BoardStreak {
  launchDay: DayKey;
  today: StreakRun;
  yesterday: StreakRun;
}

/** The run a tick dated `day` prices with: today's, or yesterday's for a record of yesterday. */
export function streakRunOn(b: Pick<BoardStreak, "today" | "yesterday">, day: DayKey, today: DayKey): StreakRun {
  return day >= today ? b.today : b.yesterday;
}

/** Today's chip and the phone's `streak.multiplier`: d, m(d) and the words. */
export interface StreakView {
  days: number;
  floor: boolean;
  mult: number;
  /** 'Streak ×1.16 · day 3'. */
  text: string;
}

export function streakViewOf(run: StreakRun): StreakView {
  return { days: run.days, floor: run.floor, mult: streakMult(run.days), text: streakChipText(run) };
}

// ── Words ─────────────────────────────────────────────────────────────────

/** Where Today's chip links: the rules page's Streak card (its id), rendered only while the multiplier is in force. */
export const STREAK_RULES_HREF = "/today/rules#streak";

/** '×1.16': m(d) to two places, as the chip and the phone's tick line print it. */
export function streakMultText(mult: number): string {
  return `×${(Number.isFinite(mult) ? mult : 1).toFixed(2)}`;
}

/** 'day 3', 'day 400+' at the read's edge. */
export function streakDayText(run: StreakRun): string {
  return `day ${run.days}${run.floor ? "+" : ""}`;
}

/** Today's chip: 'Streak ×1.16 · day 3'; 'Streak ×1.00' before the first judged Full day (a count, never a warning). */
export function streakChipText(run: StreakRun): string {
  const mult = streakMultText(streakMult(run.days));
  return run.days > 0 ? `Streak ${mult} · ${streakDayText(run)}` : `Streak ${mult}`;
}

/** What a screen reader says: '3 Full days in a row: every full tick pays ×1.16.' */
export function streakDescribe(run: StreakRun): string {
  const mult = streakMultText(streakMult(run.days));
  if (run.days <= 0) return `Streak multiplier ${mult}: a Full day starts it.`;
  return `${run.days}${run.floor ? " or more" : ""} Full day${run.days === 1 ? "" : "s"} in a row: every full tick pays ${mult}.`;
}

/** The phone's tick line part ('streak ×1.16') for a 'life-4' receipt above ×1.00; null for any other receipt. */
export function streakTickText(r: Pick<Receipt, "streak"> | null | undefined): string | null {
  const s = r?.streak;
  if (!s || typeof s.mult !== "number" || !Number.isFinite(s.mult) || s.mult <= 1) return null;
  return `streak ${streakMultText(s.mult)}`;
}

/** The rules page's lines (every figure read from the code that applies it). */
export function streakRuleLines(): string[] {
  const samples = [0, 1, 2, 3, STREAK_MULT_CAP_DAYS].map((d) => `day ${d} ${streakMultText(streakMult(d))}`).join(", ");
  return [
    `A Full day is all three rings: every must kept (the minimum version counts), the review quest and one life deed. d counts the judged Full days in a row.`,
    `C is min(${STREAK_MULT_CAP.toFixed(2)}, ${STREAK_MULT_BASE.toFixed(2)}^d) on every full tick, one-offs included: ${samples}, and no higher from day ${STREAK_MULT_CAP_DAYS}.`,
    `A rest, sick or vacation day and a rest token bridge the streak without adding a day. Any other day that is not Full starts it again at ${streakMultText(1)}.`,
    `A day counts once settlement judges it, ${SETTLE_LAG_DAYS} days on, or sooner when you settle yesterday from Today. Today is never judged, so a tick today never moves it: what a row shows is what its tick pays.`,
    `The minimum version, #play, study tasks, a walk's own pay and a make-up (×${TIMING_FACTOR.MAKE_UP.toFixed(2)}) keep C at ${streakMultText(1)}. Reviews and MP are never multiplied: a kept week's raw floor counts each tick without it.`,
    `Per-task streaks stay on each row for habit strength; they no longer change a price.`,
  ];
}
