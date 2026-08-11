import { prisma } from "./prisma";

export interface DailyStreak {
  current: number;
  /** Oldest first, today last. */
  last7Days: boolean[];
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Derives a real daily streak from `Idea.updatedAt` rather than inventing
 * one — there's no activity-log table, but `updatedAt` only changes via a
 * genuine user action (review outcome, creation, linking), so "distinct
 * calendar days with at least one updated Idea" is an honest, if slightly
 * approximate, activity signal. No new schema needed for this.
 *
 * A streak stays "alive" through the current day even before today's first
 * review — it only breaks once a full day passes with zero activity.
 */
export async function getDailyStreak(): Promise<DailyStreak> {
  const rows = await prisma.$queryRaw<{ day: Date }[]>`
    SELECT DISTINCT date_trunc('day', "updatedAt") AS day
    FROM "Idea"
    WHERE "updatedAt" >= now() - interval '60 days'
    ORDER BY day DESC
  `;
  const activeDays = new Set(rows.map((r) => dateKey(new Date(r.day))));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const cursor = new Date(today);
  if (!activeDays.has(dateKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let current = 0;
  while (activeDays.has(dateKey(cursor))) {
    current += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const last7Days: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    last7Days.push(activeDays.has(dateKey(day)));
  }

  return { current, last7Days };
}
