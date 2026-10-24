/**
 * Side quests' read and write (blueprint 2.5; plan P31; decision D35). Server only; the rules are side-quests.ts.
 *
 *   runSideQuests(userId, now, opts?) → SideQuestRun
 *       The life maintenance's and the life cron's step (settlement.ts runSideQuestStep, behind settlementWritesEnabled):
 *       reads the day's facts (readSideFacts), plans (side-quests planSideQuests) and writes each side quest through
 *       tasks.ts createTemplateCore, an ordinary one-off (its week's key, captureSource 'trigger', a DEADLINE expiry,
 *       its note and its neutral size). At once, with no read, while SIDE_QUESTS_LAUNCH_DAY is not in force or writes
 *       are off. A key already taken (another render, the cron, a race) is a unique violation the core turns into the
 *       row it already wrote: nothing is written twice. Right before each write the open side quests are counted
 *       again (tasks.ts countOpenSideQuests), so a '#side' line saved since the facts were read takes its slot and the
 *       draft is left unwritten (`full`): SIDE_OPEN_MAX holds across both writers.
 *   readSideFacts(userId, today, now) → SideQuestFacts
 *       One wave: today's personal board (loadTodayBoard, built on the read's clock), this week's daily quests
 *       (daily-quests-server readQuestFacts, the week strip's own facts), Body's effort rows this week (momentum-server
 *       weekEffortOf, the judge's rule) and the side quests (this week's keys, and every one still open). Personal
 *       Board only: a work tab is never read, so no CRM row is ever a trigger (D35).
 *
 * Like every new write it waits for the switch and the write gate (dev and prod share one database). It pays nothing
 * itself: a side quest pays its normal price when ticked, like any task.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { dateColumn, keyOfDateColumn, todayKey, weekKeyOf, weekStartKeyOf, type DayKey } from "./life-day";
import { lifeWritesEnabled } from "./life-economy";
import { countOpenSideQuests, createTemplateCore, loadTodayBoard, type CreatedTask } from "./tasks";
import { buildBoard } from "./today-board";
import { readQuestFacts } from "./daily-quests-server";
import { questWeekOf } from "./daily-quests";
import { weekEffortOf } from "./momentum-server";
import { PERSONAL_BOARD } from "./work-boards";
import type { ParsedCapture } from "./life-types";
import {
  SIDE_CAPTURE_SOURCE,
  SIDE_KEY_PREFIX,
  SIDE_OPEN_MAX,
  planSideQuests,
  sideOpenOn,
  sideParsedOf,
  sideQuestsLaunchDay,
  sideQuestsOn,
  type SideQuestFacts,
  type SideQuestTemplate,
} from "./side-quests";

export interface SideQuestOptions {
  /** SIDE_QUESTS_LAUNCH_DAY in force (default sideQuestsLaunchDay()). */
  launch?: DayKey | null;
  /** May this server write (default lifeWritesEnabled(); the step passes settlementWritesEnabled). */
  writes?: boolean;
  /** The facts (default readSideFacts): the checks pass their own. */
  facts?: (userId: string, today: DayKey, now: Date) => Promise<SideQuestFacts>;
  /** The write (default tasks.ts createTemplateCore): the checks pass a recording stub. */
  create?: typeof createTemplateCore;
  /** The open side quests right before each write (default tasks.ts countOpenSideQuests): the checks pass their own. */
  count?: (userId: string, today: DayKey) => Promise<number>;
}

/** What one run did: why it wrote nothing, or each side quest it wrote (or found written). */
export interface SideQuestRun {
  skipped: "NOT_LAUNCHED" | "WRITES_OFF" | null;
  /** The drafts planned (each written once, or found under its key, or left unwritten as `full`). */
  planned: number;
  created: { key: string; id: string; duplicate: boolean }[];
  /** Drafts left unwritten because SIDE_OPEN_MAX were open by the time of the write (a '#side' line took the slot). */
  full?: number;
}

/** The detectors' run for one life day: plan, then write each draft under its week's key. */
export async function runSideQuests(userId: string, now: Date, opts: SideQuestOptions = {}): Promise<SideQuestRun> {
  const today = todayKey(now);
  const launch = opts.launch === undefined ? sideQuestsLaunchDay() : opts.launch;
  if (!sideQuestsOn(today, launch)) return { skipped: "NOT_LAUNCHED", planned: 0, created: [] };
  if (!(opts.writes ?? lifeWritesEnabled())) return { skipped: "WRITES_OFF", planned: 0, created: [] };
  const facts = await (opts.facts ?? readSideFacts)(userId, today, now);
  const drafts = planSideQuests(facts);
  const create = opts.create ?? createTemplateCore;
  const count = opts.count ?? countOpenSideQuests;
  const created: SideQuestRun["created"] = [];
  let full = 0;
  for (const d of drafts) {
    // Counted again right before the write: the facts are a read ago, and a '#side' line may have taken a slot since.
    if ((await count(userId, today)) >= SIDE_OPEN_MAX) {
      full = drafts.length - created.length;
      break;
    }
    const parsed: ParsedCapture = sideParsedOf(d);
    const row: CreatedTask = await create(userId, parsed, {
      rawText: d.title,
      captureSource: SIDE_CAPTURE_SOURCE,
      now,
      trigger: { key: d.key, note: d.note, sizeAs: d.sizeAs },
    });
    created.push({ key: d.key, id: row.id, duplicate: row.duplicate });
  }
  return { skipped: null, planned: drafts.length, created, ...(full > 0 ? { full } : {}) };
}

/** The side quests' columns the facts read. */
const SIDE_SELECT = { captureKey: true, dueDay: true, completedAt: true, archivedAt: true } satisfies Prisma.TaskTemplateSelect;

/** Everything the detectors read for `today`, in one wave (see the file's header). */
export async function readSideFacts(userId: string, today: DayKey, now: Date): Promise<SideQuestFacts> {
  const monday = weekStartKeyOf(today);
  const weekKey = weekKeyOf(today);
  const [data, quests, effortRows, sideRows] = await Promise.all([
    loadTodayBoard(userId, today, now),
    readQuestFacts(userId, monday, today),
    prisma.activityEvent.findMany({
      where: { userId, track: "BODY", day: { gte: dateColumn(monday), lte: dateColumn(today) }, source: { in: ["TASK", "UNDO", "WORKOUT"] } },
      select: { id: true, source: true, templateId: true, receipt: true, dedupeKey: true },
    }),
    prisma.taskTemplate.findMany({
      where: {
        userId,
        ...PERSONAL_BOARD,
        captureKey: { startsWith: SIDE_KEY_PREFIX },
        OR: [{ captureKey: { endsWith: `:${weekKey}` } }, { archivedAt: null, completedAt: null, dueDay: { gte: dateColumn(today) } }],
      },
      select: SIDE_SELECT,
    }),
  ]);
  // Body's effort minutes count EXERCISE ticks only (the judge's rule): their templates' categories, read once.
  const tplIds = [...new Set(effortRows.flatMap((r) => (r.source === "TASK" && r.templateId ? [r.templateId] : [])))];
  const cats = tplIds.length ? await prisma.taskTemplate.findMany({ where: { id: { in: tplIds } }, select: { id: true, category: true } }) : [];
  const catOf = new Map(cats.map((c) => [c.id, c.category]));
  // On the read's own clock: a task deferred until later is off the board, so never a subject (task-decisions.ts).
  const board = buildBoard(data, [], now.getTime());
  const templates = new Map<string, SideQuestTemplate>(
    data.templates.map((t) => [t.id, { id: t.id, title: t.title, track: t.track, intrinsic: t.intrinsic, autoMetric: t.autoMetric, mvv: t.mvv, captureKey: t.captureKey ?? null }])
  );
  const sides = sideRows.map((r) => ({ captureKey: r.captureKey, dueDay: r.dueDay ? keyOfDateColumn(r.dueDay) : null, completedAt: r.completedAt, archivedAt: r.archivedAt }));
  return {
    today,
    weekKey,
    heldToday: board.restToday != null,
    // The week's declared rest days (once Duty is live: rest is Duty's), as the kept-week judge pro-rates the floor.
    restDays: quests.held ? quests.held.restDays.size : 0,
    effortMinutes: weekEffortOf(effortRows.map((r) => ({ ...r, receipt: r.receipt as unknown, category: r.templateId ? (catOf.get(r.templateId) ?? null) : null }))),
    questRows: questWeekOf(quests.templates, quests.instances, today, { start: monday, held: quests.held }).rows,
    rows: [...board.must, ...board.todayRows],
    templates,
    usedKeys: new Set(sides.flatMap((r) => (r.captureKey && r.captureKey.endsWith(`:${weekKey}`) ? [r.captureKey] : []))),
    open: sides.filter((r) => sideOpenOn(r, today)).length,
  };
}
