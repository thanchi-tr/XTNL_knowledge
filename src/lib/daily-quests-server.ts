/**
 * The daily quests' history read (server only; decisions D14, D15 and D16): a week of every daily quest, for the 1/0
 * strip on Tasks › Habits (components/habits/QuestWeek.tsx) and for the weekly audit (week-audit-server.ts), which
 * reads the same facts so its rate is the strip's own count. Read-only: nothing here writes, settles or judges.
 *
 *   loadQuestWeek(userId, now) → QuestWeek (daily-quests.ts questWeekOf), cached per user and life day under 'life'
 *                                and 'activity' (a tick, a skip, a rule change or a capture clears it)
 *   readQuestFacts(userId, start, today, opts?) → QuestFacts: the week from `start` (a Monday): the personal Board's
 *                                templates, the instances of those that are a must on a day of it (and, with
 *                                opts.habits, of those with a repeat rule: the audit's habits line), and the days
 *                                Duty holds once it is live (none before: rest is Duty's)
 *
 * The cap itself is read in tasks.ts (loadStandingMusts), next to the writes it guards.
 */
import { prisma } from "./prisma";
import { cached } from "./cache";
import { PERSONAL_BOARD } from "./work-boards";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import { dutyLaunchDay, isDutyLaunched } from "./duty-economy";
import { validRestDays, type RestRow } from "./duty-rule";
import { isMissingRestDayTable } from "./rest-rules";
import { parseRule } from "./recurrence";
import { questWeekOf, type QuestHeldDays, type QuestTemplate, type QuestWeek } from "./daily-quests";

/** How far back a one-off must's earlier tick is read (a one-off done before its due day keeps it: questWeekOf). */
const QUEST_LOOKBACK_DAYS = 60;

export function loadQuestWeek(userId: string, now: Date = new Date()): Promise<QuestWeek> {
  const today = todayKey(now);
  return cached(`questWeek:${userId}:${today}`, ["life", "activity"], async () => {
    const start = weekStartKeyOf(today);
    const facts = await readQuestFacts(userId, start, today);
    return questWeekOf(facts.templates, facts.instances, today, { start, held: facts.held });
  });
}

/** A template as the week reads it: a must's rule and order, and what keeps it off the audit's habits line. */
export type QuestFactsTemplate = QuestTemplate & {
  /** TaskTemplate.autoMetric: a study task that completes itself from the day's reviews. */
  autoMetric: string | null;
  /** TaskTemplate.intrinsic: #play. */
  intrinsic: boolean;
};

export interface QuestFacts {
  templates: QuestFactsTemplate[];
  /** `at`: when its status was set (completedAt for a tick or a make-up, else the row's last write): a frozen copy keeps those set by its 04:00. */
  instances: { templateId: string; day: DayKey; status: string; at: Date }[];
  /** Once Duty is live: its declared rest days and its freeze days in the week; undefined before. */
  held: QuestHeldDays | undefined;
}

/**
 * The personal Board's TASK and HABIT templates that could be a must on a day of the week (not an inbox item, not
 * archived before Monday; questWeekOf keeps those due as a must on a day, the rule in force read per day), then the
 * instances of those it keeps (with opts.habits, of every template with a repeat rule too), from QUEST_LOOKBACK_DAYS
 * before Monday through Sunday, and, once Duty is live, the held days (the RestDay table may be missing on a database
 * the life_duty migration has not reached: it reads as none, as the board does).
 */
export async function readQuestFacts(userId: string, start: DayKey, today: DayKey, opts: { habits?: boolean } = {}): Promise<QuestFacts> {
  const end = addDays(start, 6);
  const range = { gte: dateColumn(start), lte: dateColumn(end) };
  const live = isDutyLaunched(today, dutyLaunchDay());
  const [rows, restRows, freezeRows] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { userId, ...PERSONAL_BOARD, kind: { in: ["TASK", "HABIT"] }, inbox: false, OR: [{ archivedAt: null }, { archivedAt: { gte: dateColumn(start) } }] },
      select: {
        id: true,
        title: true,
        kind: true,
        recurrence: true,
        startDay: true,
        dueDay: true,
        dueKind: true,
        compulsory: true,
        compulsoryOnRest: true,
        inbox: true,
        archivedAt: true,
        pendingChange: true,
        sortOrder: true,
        createdAt: true,
        autoMetric: true,
        intrinsic: true,
      },
    }),
    live
      ? prisma.restDay.findMany({ where: { userId, day: range }, select: { day: true, kind: true, declaredAt: true, cancelledAt: true } }).catch((err: unknown) => {
          if (!isMissingRestDayTable(err)) throw err;
          console.error("Daily quests: the RestDay table is missing (apply life_duty); reading no rest.");
          return [];
        })
      : Promise.resolve([]),
    live ? prisma.activityEvent.findMany({ where: { userId, source: "FREEZE_USE", day: range }, select: { day: true } }) : Promise.resolve([]),
  ]);
  const templates: QuestFactsTemplate[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind,
    recurrence: t.recurrence,
    startDay: keyOfDateColumn(t.startDay),
    dueDay: t.dueDay ? keyOfDateColumn(t.dueDay) : null,
    dueKind: t.dueKind,
    compulsory: t.compulsory,
    compulsoryOnRest: t.compulsoryOnRest,
    inbox: t.inbox,
    archivedDay: t.archivedAt ? dayKeyOf(t.archivedAt) : null,
    pendingChange: t.pendingChange,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
    autoMetric: t.autoMetric,
    intrinsic: t.intrinsic,
  }));
  // Only the templates some day of the week owes as a must are read further (and, for the audit, the repeating ones).
  const ids = new Set(questWeekOf(templates, [], today, { start }).rows.map((r) => r.templateId));
  if (opts.habits) for (const t of templates) if (parseRule(t.recurrence)) ids.add(t.id);
  const instances =
    ids.size === 0
      ? []
      : await prisma.taskInstance.findMany({
          where: { userId, templateId: { in: [...ids] }, day: { gte: dateColumn(addDays(start, -QUEST_LOOKBACK_DAYS)), lte: dateColumn(end) } },
          select: { templateId: true, day: true, status: true, completedAt: true, updatedAt: true },
        });
  const rest: RestRow[] = restRows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
  return {
    templates,
    instances: instances.map((i) => ({ templateId: i.templateId, day: keyOfDateColumn(i.day), status: i.status, at: i.completedAt ?? i.updatedAt })),
    held: live ? { restDays: new Set(validRestDays(rest, start, end).keys()), freezeDays: new Set(freezeRows.map((r) => keyOfDateColumn(r.day))) } : undefined,
  };
}
