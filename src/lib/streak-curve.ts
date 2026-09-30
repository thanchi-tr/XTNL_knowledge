/**
 * The streak's pure maths, shared by the server and the browser.
 *
 * Two kinds of streak read from here. Day counts become a bonus through one
 * curve, `streakBonusPercent`: the per-Field streak (field-streaks.ts) folds
 * it into a Field's effective level, and the life price's consistency factor
 * C uses the same curve, so the Today board can project a tick in the browser
 * with exactly the number the server will pay. The daily streak (streak.ts)
 * folds the life ledger into consecutive days.
 *
 * Kept apart from their writers because those import Prisma, which the
 * browser cannot load. Nothing here reads a clock: every function is handed
 * the day it is asked about.
 */
import { addDays, daysBetween, type DayKey } from "./life-day";
import type { ActivitySource } from "./life-types";

// ── The bonus curve ─────────────────────────────────────────────────────────

export const STREAK_BONUS_CAP_PERCENT = 20;

/**
 * `2.5 * sqrt(days)`, capped at 20% — reaches its cap at day 64 (~9 weeks of
 * unbroken daily activity). Matches the sqrt-shaped diminishing curves
 * already used elsewhere in the leveling maths (`domainLevel` in xp.ts)
 * rather than inventing a new curve family for one mechanic.
 */
export function streakBonusPercent(currentDays: number): number {
  return Math.min(STREAK_BONUS_CAP_PERCENT, 2.5 * Math.sqrt(Math.max(0, currentDays)));
}

// ── Per-Field streak steps ──────────────────────────────────────────────────

/**
 * The first life day on the 04:00-local clock. FieldStreak rows last written
 * before it hold the UTC date of their review, which for a user east of UTC
 * is often the local day before. Must be the life day the cut-over deploys
 * on, or later — never earlier, or a row written under the old clock after
 * this date could read as a missed day.
 */
export const FIELD_STREAK_CUTOVER_DAY: DayKey = "2026-10-05";

export type FieldStreakStep = "same" | "continued" | "broken";

/**
 * How a per-Field streak moves on a review: already counted today, extended
 * by one day, or broken.
 *
 * One-release shim: a gap of two days still continues when the last active
 * day was written under the old UTC clock. A review at 09:00 on a Tuesday was
 * stored as Monday's UTC date, so reviewing again on Wednesday reads as a
 * two-day gap across the switch. Without this the cut-over could break a
 * streak the player never broke, and a long one would inflict DOUBT. The
 * shim only ever errs toward the player; remove it once every FieldStreak
 * row has been rewritten on the new clock.
 */
export function fieldStreakStep(
  lastActiveKey: DayKey,
  todayKey: DayKey,
  cutoverKey: DayKey = FIELD_STREAK_CUTOVER_DAY
): FieldStreakStep {
  const gap = daysBetween(lastActiveKey, todayKey);
  if (gap <= 0) return "same";
  if (gap === 1) return "continued";
  if (gap === 2 && lastActiveKey < cutoverKey) return "continued";
  return "broken";
}

// ── The daily streak ────────────────────────────────────────────────────────

/**
 * How many life days the daily streak reads, today included. A streak that
 * reaches the edge is reported as a floor ("70+") rather than a number the
 * query could not see past.
 */
export const STREAK_WINDOW_DAYS = 70;

/**
 * What counts as showing up, unless the writer says otherwise. Every kind of
 * real work: a review (right or wrong), a new Idea, an attestation, a Boss
 * fight, a task (its minimum version, #play and self-completing study tasks
 * included), goal progress, and the pre-ledger days the cut-over backfill
 * carried over. A workout counts from M4 when it lasts ten minutes; its
 * writer decides.
 */
export const STREAK_SOURCES: ReadonlySet<ActivitySource> = new Set<ActivitySource>([
  "REVIEW",
  "IDEA_CREATE",
  "ATTESTATION",
  "BOSS",
  "TASK",
  "GOAL_PROGRESS",
  "LEGACY_DAY",
]);

/**
 * Never counts, whatever the writer asks. Passive signals (steps, opening the
 * app) must not keep a streak alive: that is the bug the old Idea.updatedAt
 * streak had, where the midnight degrade cron counted as a day's work. Debts,
 * adjustments, freezes and reflections are bookkeeping, not activity. An
 * UNDO has its own −1 unit and must never also add one.
 */
export const NEVER_STREAK_SOURCES: ReadonlySet<ActivitySource> = new Set<ActivitySource>([
  "STEPS",
  "DAY_OPEN",
  "DEBT",
  "ADJUST",
  "FREEZE_EARN",
  "FREEZE_USE",
  "REFLECTION",
  "UNDO",
]);

/**
 * Sources that hold a day without counting it: it bridges the streak rather
 * than extending it. A spent freeze and a repair (M2); declared rest days
 * join them from M2 through the RestDay table.
 */
export const HELD_SOURCES: readonly ActivitySource[] = ["FREEZE_USE", "REPAIR"];

/** The countsForStreak a row is written with: the writer's choice, within the rules above. */
export function countsForStreakOf(source: ActivitySource, requested?: boolean | null): boolean {
  if (NEVER_STREAK_SOURCES.has(source)) return false;
  return requested ?? STREAK_SOURCES.has(source);
}

/**
 * One row's contribution to its day: +1 when it counts, −1 for an UNDO, else
 * 0. A day is active when its units sum above zero, so a task ticked and then
 * undone nets to nothing. streak.ts runs the same CASE in SQL; this is its
 * mirror for tests and for anything that already holds the rows.
 */
export function streakUnitsOf(row: { source: string; countsForStreak: boolean }): number {
  if (row.countsForStreak) return 1;
  if (row.source === "UNDO") return -1;
  return 0;
}

export interface StreakDays {
  active: Set<DayKey>;
  held: Set<DayKey>;
}

/** Folds ledger rows into active and held days, exactly as streak.ts's query groups them. */
export function foldStreakDays(
  rows: Iterable<{ day: DayKey; source: string; countsForStreak: boolean }>
): StreakDays {
  const units = new Map<DayKey, number>();
  const held = new Set<DayKey>();
  const holding = new Set<string>(HELD_SOURCES);
  for (const r of rows) {
    units.set(r.day, (units.get(r.day) ?? 0) + streakUnitsOf(r));
    if (holding.has(r.source)) held.add(r.day);
  }
  const active = new Set<DayKey>();
  for (const [day, n] of units) if (n > 0) active.add(day);
  return { active, held };
}

export interface DailyStreak {
  current: number;
  /** Oldest first, today last. */
  last7Days: boolean[];
  /** Same seven days: held (a freeze or a repair) without being active. */
  held7Days: boolean[];
  /** Freezes in the bank. Always 0 until freezes arrive in M2. */
  bankedFreezes: number;
  /** True when the streak runs to the edge of the window read, so `current` is a floor. */
  capped?: boolean;
}

/** The oldest life day the daily streak reads, for a window ending today. */
export function streakWindowStart(todayKey: DayKey, windowDays: number = STREAK_WINDOW_DAYS): DayKey {
  return addDays(todayKey, -(windowDays - 1));
}

/**
 * Consecutive active days ending today, or yesterday while today has no
 * activity yet: a streak only breaks once a whole life day passes with
 * nothing in it, so an empty morning is still alive. Held days bridge the
 * gap without adding to the count. Liveness is decided here, on read, and
 * never stored, so a dead streak can never keep paying anything.
 */
export function computeStreak(
  activeDays: ReadonlySet<DayKey>,
  heldDays: ReadonlySet<DayKey>,
  todayKey: DayKey,
  opts: { windowDays?: number; bankedFreezes?: number } = {}
): DailyStreak {
  const windowDays = Math.max(1, Math.floor(opts.windowDays ?? STREAK_WINDOW_DAYS));

  let current = 0;
  let broken = false;
  for (let i = 0; i < windowDays; i++) {
    const key = addDays(todayKey, -i);
    if (activeDays.has(key)) {
      current += 1;
      continue;
    }
    if (i === 0 || heldDays.has(key)) continue;
    broken = true;
    break;
  }

  const last7Days: boolean[] = [];
  const held7Days: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDays(todayKey, -i);
    const active = activeDays.has(key);
    last7Days.push(active);
    held7Days.push(!active && heldDays.has(key));
  }

  return {
    current,
    last7Days,
    held7Days,
    bankedFreezes: Math.max(0, Math.floor(opts.bankedFreezes ?? 0)),
    capped: !broken && current > 0,
  };
}
