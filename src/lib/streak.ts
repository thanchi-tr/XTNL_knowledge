import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { getCurrentUserId } from "./user";
import { addDays, dateColumn, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { computeStreak, streakWindowStart, HELD_SOURCES, STREAK_WINDOW_DAYS, type DailyStreak as CurveDailyStreak } from "./streak-curve";
import { FREEZE_MAX, dutyLaunchDay, firstDutyDay, isDutyLaunched, settledFor } from "./duty-economy";
import { heldDaysOf, type RestRow } from "./duty-rule";

// The pure half lives in streak-curve.ts so the browser can import it; these
// re-exports are for server callers. Client code imports streak-curve.ts.
export { computeStreak, foldStreakDays, streakUnitsOf, STREAK_WINDOW_DAYS } from "./streak-curve";

/**
 * The daily streak: consecutive life days on which the player did something.
 *
 * Read from the life ledger (activity.ts). It used to be derived from
 * `Idea.updatedAt`, which had two faults: a day spent only on tasks or a
 * workout broke it, and the midnight degrade cron bumps `updatedAt` on every
 * overdue Idea, so a day with no activity at all could keep it alive. The
 * ledger fixes both: every kind of real work writes a row that counts, and
 * automatic writes (the cron, opening the app, steps) either write nothing or
 * write rows that never count.
 *
 * Days are life days (04:00 local, life-day.ts), so a review at 00:40 counts
 * for the evening it belongs to.
 *
 * A streak stays alive through today even before today's first action; it
 * only breaks once a whole day passes with nothing in it. That is computed on
 * every read and never stored.
 *
 * M2 (lane B, F8; m2-refit.md decisions 12, 13, 15, 23):
 *   - Held days bridge without counting: a spent freeze and a repair (their
 *     ledger rows, HELD_SOURCES) and a declared rest, sick or vacation day
 *     (RestDay rows read through duty-rule heldDaysOf, so a row declared too
 *     late or cancelled holds nothing). Only days up to today are read, so a
 *     future rest day bridges nothing.
 *   - Freezes: bankedFreezes = min(2, FREEZE_EARN − FREEZE_USE) over all
 *     history, counted in the same raw query.
 *   - While Duty is live, a day settlement has not judged yet with nothing in
 *     it is pending: it neither counts nor breaks the run, since a freeze or a
 *     repair may still hold it. A break is only ever a judged one. "Judged" is
 *     duty-economy settledFor(d, cursor, firstDutyDay(epochDay)), the one
 *     settled-day rule: only a day settlement will ever judge (on or after
 *     the first Duty day) can wait on it; an earlier day keeps M1's rule.
 *     Before Duty launches every rule is M1's, wherever the launch script
 *     has already put the cursor.
 *   - DailyStreak gains endedOn and endedAfter (the judged day with nothing
 *     in it that ended the last run, and that run's length; 'Ended Tuesday at
 *     23 days') and freezeWillCover (display only, never stored).
 *   - dailyStreakOf (pure) and readStreakFacts (the one SQL) are shared with
 *     snapshot.ts readStreak: no second copy of the query.
 */

/** The daily streak as the server reads it: streak-curve's DailyStreak plus M2's facts. */
export interface DailyStreak extends CurveDailyStreak {
  /**
   * The judged day with nothing in it that ended the last run, while no run
   * is alive (current 0); null when a run is alive or none was ever read.
   */
  endedOn: DayKey | null;
  /** That run's length in active days (a floor at the window's edge); 0 with no endedOn. */
  endedAfter: number;
  /**
   * An unsettled yesterday with nothing in it, a freeze banked and a run it
   * would carry (settlement's automatic spend will cover it). Display only.
   */
  freezeWillCover: boolean;
  /** Held days (freeze, repair, rest) inside the current run. */
  heldInRun: number;
}

/** One day's net streak units and held-row count, as the raw query groups them. */
export interface StreakDayRow {
  day: DayKey;
  /** +1 per counting row, −1 per UNDO (streakUnitsOf). */
  units: number;
  /** Rows from HELD_SOURCES (FREEZE_USE, REPAIR). */
  held: number;
}

/** Everything dailyStreakOf needs: what readStreakFacts reads, or a fixture. */
export interface StreakFacts {
  today: DayKey;
  /** Days read, today included (STREAK_WINDOW_DAYS for the board, 400 for the snapshot). */
  windowDays: number;
  rows: readonly StreakDayRow[];
  /** All-history counts of FREEZE_EARN and FREEZE_USE rows. */
  freezeEarned: number;
  freezeUsed: number;
  /** RestDay rows in the window (heldDaysOf decides which hold). */
  restRows: readonly RestRow[];
  /** LifeSettings.settledThroughDay. */
  settledThroughDay: DayKey | null;
  /** duty-economy dutyLaunchDay(). Null: Duty is off and every M2 rule is inert. */
  dutyLaunchDay: DayKey | null;
  /** LifeSettings.epochDay, for settledFor's floor (firstDutyDay). Absent or null: the launch day is the floor. */
  epochDay?: DayKey | null;
}

/**
 * The daily streak from its facts (pure; streak-check tests it). Active days
 * have net units > 0; held days are FREEZE_USE and REPAIR days plus the
 * valid rest days on or after the Duty launch day; pending days (Duty live,
 * on or after the first Duty day and not settledFor, before today, nothing in
 * them) bridge without counting.
 */
export function dailyStreakOf(f: StreakFacts): DailyStreak {
  const windowDays = Math.max(1, Math.floor(f.windowDays));
  const start = streakWindowStart(f.today, windowDays);
  const active = new Set<DayKey>();
  const held = new Set<DayKey>();
  for (const r of f.rows) {
    if (r.day < start || r.day > f.today) continue;
    if (r.units > 0) active.add(r.day);
    if (r.held > 0) held.add(r.day);
  }
  const launch = f.dutyLaunchDay;
  if (launch != null) {
    for (const d of heldDaysOf(f.restRows, start > launch ? start : launch, f.today)) held.add(d);
  }
  const cursor = f.settledThroughDay;
  const live = isDutyLaunched(f.today, launch) && cursor != null;
  const pending = new Set<DayKey>();
  if (live) {
    // Only a day settlement will judge can wait on it: from the first Duty day, not yet settledFor.
    const floor = firstDutyDay(f.epochDay ?? launch!, launch)!;
    for (let d = floor > start ? floor : start; d < f.today; d = addDays(d, 1)) {
      if (settledFor(d, cursor, floor)) continue;
      if (!active.has(d) && !held.has(d)) pending.add(d);
    }
  }
  const bankedFreezes = Math.min(FREEZE_MAX, Math.max(0, Math.floor(f.freezeEarned) - Math.floor(f.freezeUsed)));
  const bridged = pending.size > 0 ? new Set<DayKey>([...held, ...pending]) : held;
  const base = computeStreak(active, bridged, f.today, { windowDays, bankedFreezes });
  // held7Days shows real holds only: a pending day is an empty slot, not a held one.
  const held7Days = base.held7Days.map((h, i) => h && !pending.has(addDays(f.today, i - 6)));

  // The current run's held days.
  let heldInRun = 0;
  if (base.current > 0) {
    for (let i = 1; i < windowDays; i++) {
      const d = addDays(f.today, -i);
      if (active.has(d) || pending.has(d)) continue;
      if (!held.has(d)) break;
      heldInRun += 1;
    }
  }
  // No run alive: the last run's length, and the first day after it that neither held nor waits
  // on settlement (the judged day that ended it). A run that reaches the window's edge is a floor.
  let endedOn: DayKey | null = null;
  let endedAfter = 0;
  if (base.current === 0) {
    let last = 0;
    for (let i = 1; i < windowDays && last === 0; i++) if (active.has(addDays(f.today, -i))) last = i;
    if (last > 0) {
      for (let i = last - 1; i >= 1; i--) {
        const d = addDays(f.today, -i);
        if (!held.has(d) && !pending.has(d)) {
          endedOn = d;
          break;
        }
      }
      for (let i = last; endedOn && i < windowDays; i++) {
        const d = addDays(f.today, -i);
        if (active.has(d)) endedAfter += 1;
        else if (!held.has(d)) break;
      }
    }
  }

  const yesterday = addDays(f.today, -1);
  // pending.has(yesterday): Duty live, yesterday not settled, nothing in it and nothing holding it.
  const freezeWillCover = pending.has(yesterday) && bankedFreezes >= 1 && base.current > 0;

  return { ...base, held7Days, endedOn, endedAfter, freezeWillCover, heldInRun };
}

/**
 * The streak's facts for a window ending today, in one round trip: the raw
 * query (each day's net units and held rows, plus a UNION ALL row with the
 * all-history FREEZE_EARN and FREEZE_USE counts) and, only once a Duty
 * launch day is set, the RestDay rows up to today and the settlement cursor
 * and epoch (settledFor's floor) from LifeSettings.
 */
export async function readStreakFacts(userId: string, now: Date = new Date(), windowDays: number = STREAK_WINDOW_DAYS): Promise<StreakFacts> {
  const today = todayKey(now);
  const start = streakWindowStart(today, windowDays);
  const launch = dutyLaunchDay();
  const [rows, restRows, settings] = await Promise.all([
    // The same CASE as `streakUnitsOf`, which the checks test. The second SELECT is one row.
    prisma.$queryRaw<{ day: Date | null; units: number; held: number; earned: number; used: number }[]>`
      SELECT "day",
             SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END)::int AS units,
             SUM(CASE WHEN "source" IN (${Prisma.join([...HELD_SOURCES])}) THEN 1 ELSE 0 END)::int AS held,
             0::int AS earned,
             0::int AS used
      FROM "ActivityEvent"
      WHERE "userId" = ${userId} AND "day" >= ${start}::date
      GROUP BY "day"
      UNION ALL
      SELECT NULL::date AS "day", 0::int AS units, 0::int AS held,
             (COUNT(*) FILTER (WHERE "source" = 'FREEZE_EARN'))::int AS earned,
             (COUNT(*) FILTER (WHERE "source" = 'FREEZE_USE'))::int AS used
      FROM "ActivityEvent"
      WHERE "userId" = ${userId} AND "source" IN ('FREEZE_EARN', 'FREEZE_USE')
    `,
    launch != null && today >= launch
      ? prisma.restDay.findMany({
          where: { userId, day: { gte: dateColumn(start > launch ? start : launch), lte: dateColumn(today) } },
          select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
        })
      : Promise.resolve([] as { day: Date; kind: string; declaredAt: Date; cancelledAt: Date | null }[]),
    launch != null ? prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true, epochDay: true } }) : Promise.resolve(null),
  ]);

  const days: StreakDayRow[] = [];
  let freezeEarned = 0;
  let freezeUsed = 0;
  for (const r of rows) {
    if (r.day == null) {
      freezeEarned += Number(r.earned) || 0;
      freezeUsed += Number(r.used) || 0;
      continue;
    }
    days.push({ day: keyOfDateColumn(new Date(r.day)), units: Number(r.units) || 0, held: Number(r.held) || 0 });
  }
  return {
    today,
    windowDays,
    rows: days,
    freezeEarned,
    freezeUsed,
    restRows: restRows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt })),
    settledThroughDay: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    dutyLaunchDay: launch,
    epochDay: settings?.epochDay ? keyOfDateColumn(settings.epochDay) : null,
  };
}

export const getDailyStreak = cache(async (userId?: string): Promise<DailyStreak> => {
  const id = userId ?? getCurrentUserId();
  return cached(`dailyStreak:${id}`, ["activity"], () => getDailyStreakUncached(id));
});

async function getDailyStreakUncached(userId: string, now: Date = new Date()): Promise<DailyStreak> {
  return dailyStreakOf(await readStreakFacts(userId, now, STREAK_WINDOW_DAYS));
}
