/**
 * The streak multiplier's read (blueprint P29; decision D25), for the Today board (BoardData.streak, so the rows' '≈ N
 * XP' and the chip), a tick's own read (tasks.ts readForCompletion, so the payment) and the phone's /check (through the
 * board). Server only; the rules are streak-mult.ts. Nothing is written.
 *
 *   loadStreakFacts(client, userId, today, opts?)   → BoardStreak | null (null at once, with no read, while the
 *                                                      multiplier is not in force today: streakFromOf)
 *
 * The rows, in one wave: LifeSettings' settlement cursor and epoch, the FULL_DAY and FREEZE_USE rows and the RestDay rows
 * (duty-rule heldDaysOf decides which hold) over the last STREAK_READ_DAYS days. The board and the tick read the same
 * rows through the same fold (fullDayRunOf), so what a row projects is what its tick pays.
 */
import type { PrismaClient } from "@prisma/client";
import { addDays, dateColumn, keyOfDateColumn, type DayKey } from "./life-day";
import { dutyLaunchDay, firstDutyDay } from "./duty-economy";
import { heldDaysOf } from "./duty-rule";
import { isMissingRestDayTable } from "./rest-rules";
import { STREAK_READ_DAYS, fullDayRunOf, streakFromOf, streakLaunchDay, streakLive, type BoardStreak, type StreakFacts } from "./streak-mult";

/** The Prisma surface the read uses: the real client, or a check's stub. */
export type StreakClient = Pick<PrismaClient, "lifeSettings" | "activityEvent" | "restDay">;

export interface StreakReadOptions {
  /** STREAK_LAUNCH_DAY in force (default streakLaunchDay()). */
  launch?: DayKey | null;
  /** DUTY_LAUNCH_DAY in force (default dutyLaunchDay()). */
  dutyLaunch?: DayKey | null;
}

/** The settlement rows the run reads: a Full day, and a rest token's day. */
export const STREAK_ROW_SOURCES = ["FULL_DAY", "FREEZE_USE"] as const;

/** BoardData.streak for `today`, or null (no read) while the multiplier is not in force today. */
export async function loadStreakFacts(client: StreakClient, userId: string, today: DayKey, opts: StreakReadOptions = {}): Promise<BoardStreak | null> {
  const launch = opts.launch === undefined ? streakLaunchDay() : opts.launch;
  const duty = opts.dutyLaunch === undefined ? dutyLaunchDay() : opts.dutyLaunch;
  const from = streakFromOf(launch, duty);
  if (!streakLive(today, from) || from == null) return null;
  const windowFrom = addDays(today, -STREAK_READ_DAYS);
  const yesterday = addDays(today, -1);
  const [settings, rows, rest] = await Promise.all([
    client.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true, epochDay: true } }),
    client.activityEvent.findMany({
      where: { userId, source: { in: [...STREAK_ROW_SOURCES] }, day: { gte: dateColumn(windowFrom), lte: dateColumn(yesterday) } },
      select: { source: true, day: true },
    }),
    client.restDay
      .findMany({ where: { userId, day: { gte: dateColumn(windowFrom), lte: dateColumn(yesterday) } }, select: { day: true, kind: true, declaredAt: true, cancelledAt: true } })
      .catch((err: unknown) => {
        // A Duty launch day set before life_duty is applied reads no rest, as the board does.
        if (!isMissingRestDayTable(err)) throw err;
        return [] as { day: Date; kind: string; declaredAt: Date; cancelledAt: Date | null }[];
      }),
  ]);
  const dayOf = (d: Date) => keyOfDateColumn(new Date(d));
  const epochDay = settings?.epochDay ? dayOf(settings.epochDay) : null;
  const held = heldDaysOf(
    rest.map((r) => ({ day: dayOf(r.day), kind: r.kind, declaredAt: new Date(r.declaredAt), cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null })),
    windowFrom,
    yesterday
  );
  for (const r of rows) if (r.source === "FREEZE_USE") held.add(dayOf(r.day));
  const facts: StreakFacts = {
    firstJudged: epochDay ? firstDutyDay(epochDay, duty) : null,
    cursor: settings?.settledThroughDay ? dayOf(settings.settledThroughDay) : null,
    fullDays: new Set(rows.filter((r) => r.source === "FULL_DAY").map((r) => dayOf(r.day))),
    heldDays: held,
    from: windowFrom,
  };
  return { launchDay: from, today: fullDayRunOf(facts, today), yesterday: fullDayRunOf(facts, yesterday) };
}
