/**
 * The habits' year (server only): one read wave for Tasks › Habits (/today/habits), folded by habit-history.ts.
 * Read-only: nothing here writes, settles or judges (the page never changes the game).
 *
 *   loadHabitYear(userId, year, now) → HabitYearView, cached per user, year and life day under 'life' and
 *                                      'activity' (a tick, a skip, a rest day or a rule change clears it)
 *
 * The wave: every personal habit template (kind HABIT, not an inbox item, the personal Board only; archived ones too,
 * for the colour order and the Ended fold), their instances from readFromOf(year, today) through 31 December, the
 * task styles (each card's glyph; cached on their own), and, once Duty has a launch day, the settlement cursor, the
 * declared rest days and the freeze days (the RestDay table may be missing on a database the life_duty migration has
 * not reached: it reads as none, as the board does). The held days and the cursor reach the derivation exactly as the
 * board's habit reads take them (today-board boardStreakOptionsOf), so a square never says what the row does not.
 */
import { prisma } from "./prisma";
import { cached } from "./cache";
import { PERSONAL_BOARD } from "./work-boards";
import { dateColumn, dayKeyOf, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { dutyLaunchDay, isDutyLaunched } from "./duty-economy";
import { validRestDays, type RestRow } from "./duty-rule";
import { isMissingRestDayTable } from "./rest-rules";
import { boardStreakOptionsOf } from "./today-board";
import { loadTaskStyles } from "./task-style-server";
import type { StreakOptions } from "./habit";
import { habitYearOf, readFromOf, yearBoundsOf, type HabitTemplateFacts, type HabitYearView } from "./habit-history";

/** The habits that have a card: the personal Board's HABIT templates, never an inbox item. */
const HABIT_WHERE = { kind: "HABIT", inbox: false, ...PERSONAL_BOARD } as const;

export function loadHabitYear(userId: string, year: number, now: Date = new Date()): Promise<HabitYearView> {
  const today = todayKey(now);
  return cached(`habitYear:${userId}:${year}:${today}`, ["life", "activity"], () => readHabitYear(userId, year, today));
}

async function readHabitYear(userId: string, year: number, today: DayKey): Promise<HabitYearView> {
  const since = readFromOf(year, today);
  const { end } = yearBoundsOf(year);
  const range = { gte: dateColumn(since), lte: dateColumn(end) };
  const launchDay = dutyLaunchDay();
  const dutyOn = launchDay != null;
  const [templateRows, instanceRows, styles, settings, restRows, freezeRows] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { userId, ...HABIT_WHERE },
      select: { id: true, title: true, recurrence: true, startDay: true, createdAt: true, sortOrder: true, archivedAt: true, mvv: true, compulsory: true, compulsoryOnRest: true },
    }),
    prisma.taskInstance.findMany({
      where: { userId, day: range, template: HABIT_WHERE },
      select: { templateId: true, day: true, status: true, repaired: true, completedAt: true, xpPaid: true },
    }),
    loadTaskStyles(userId),
    dutyOn ? prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true } }) : Promise.resolve(null),
    dutyOn
      ? prisma.restDay
          .findMany({ where: { userId, day: range }, select: { day: true, kind: true, declaredAt: true, cancelledAt: true } })
          .catch((err: unknown) => {
            if (!isMissingRestDayTable(err)) throw err;
            console.error("Habits: the RestDay table is missing (apply life_duty); reading no rest.");
            return [];
          })
      : Promise.resolve([]),
    dutyOn ? prisma.activityEvent.findMany({ where: { userId, source: "FREEZE_USE", day: range }, select: { day: true } }) : Promise.resolve([]),
  ]);

  // Before Duty is live the habit reads take no options (M1/M5 exactly), as the board's do.
  const live = isDutyLaunched(today, launchDay);
  const rest: RestRow[] = restRows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
  const restKinds = live ? validRestDays(rest, since, end) : new Map();
  const freezeDays = new Set<DayKey>(live ? freezeRows.map((r) => keyOfDateColumn(r.day)) : []);
  const streakCtx = {
    live,
    cursor: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    restDays: new Set<DayKey>(restKinds.keys()),
    freezeDays,
  };
  const options: Record<string, StreakOptions> = {};
  for (const t of templateRows) options[t.id] = boardStreakOptionsOf(t, streakCtx);

  const templates: HabitTemplateFacts[] = templateRows.map((t) => ({
    id: t.id,
    title: t.title,
    recurrence: t.recurrence,
    startDay: keyOfDateColumn(t.startDay),
    createdAt: t.createdAt.toISOString(),
    sortOrder: t.sortOrder,
    archivedDay: t.archivedAt ? dayKeyOf(t.archivedAt) : null,
    mvv: t.mvv,
    icon: styles[t.id]?.icon ?? null,
  }));
  return habitYearOf({
    year,
    today,
    since,
    templates,
    instances: instanceRows.map((i) => ({
      templateId: i.templateId,
      day: keyOfDateColumn(i.day),
      status: i.status,
      repaired: i.repaired,
      completedAt: i.completedAt?.toISOString() ?? null,
      xpPaid: i.xpPaid,
    })),
    options,
    restKinds,
    freezeDays,
  });
}
