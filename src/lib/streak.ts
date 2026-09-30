import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { getCurrentUserId } from "./user";
import { keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { computeStreak, streakWindowStart, HELD_SOURCES, type DailyStreak } from "./streak-curve";

// The pure half lives in streak-curve.ts so the browser can import it; these
// re-exports are for server callers. Client code imports streak-curve.ts.
export type { DailyStreak } from "./streak-curve";
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
 */
export const getDailyStreak = cache(async (userId?: string): Promise<DailyStreak> => {
  const id = userId ?? getCurrentUserId();
  return cached(`dailyStreak:${id}`, ["activity"], () => getDailyStreakUncached(id));
});

async function getDailyStreakUncached(userId: string, now: Date = new Date()): Promise<DailyStreak> {
  const today = todayKey(now);
  // One round trip: each day's net streak units (+1 per counting row, −1 per
  // UNDO, so a tick that was undone nets to nothing) and whether anything
  // held it. The same CASE as `streakUnitsOf`, which the checks test.
  const rows = await prisma.$queryRaw<{ day: Date; units: number; held: number }[]>`
    SELECT "day",
           SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END)::int AS units,
           SUM(CASE WHEN "source" IN (${Prisma.join([...HELD_SOURCES])}) THEN 1 ELSE 0 END)::int AS held
    FROM "ActivityEvent"
    WHERE "userId" = ${userId} AND "day" >= ${streakWindowStart(today)}::date
    GROUP BY "day"
  `;

  const active = new Set<DayKey>();
  const held = new Set<DayKey>();
  for (const r of rows) {
    const key = keyOfDateColumn(new Date(r.day));
    if (r.units > 0) active.add(key);
    if (r.held > 0) held.add(key);
  }

  // Freezes arrive in M2; until then none can have been earned.
  return computeStreak(active, held, today, { bankedFreezes: 0 });
}
