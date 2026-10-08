import type { Metadata } from "next";
import "@/components/task-style/task-style.css";
import { cookies } from "next/headers";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { autoCompleteStudyTasks, loadTodayBoard, recordDayOpen } from "@/lib/tasks";
import { boardClock, buildBoard, unrecordedStudyTasks, weekQuestsShownOnToday } from "@/lib/today-board";
import { getDailyStreak } from "@/lib/streak";
import { loadBossStates } from "@/lib/bosses";
import { loadNotifications } from "@/lib/notifications";
import { isLaunched } from "@/lib/life-economy";
import { maybeMaintainLife } from "@/lib/settlement";
import { freezeWeekQuests, loadTodayNamedTitles, loadWeekQuests } from "@/lib/roadmap-quests-server";
import { loadAimStep } from "@/lib/roadmap-server";
import { AIM_STEP_COOKIE, aimPromptOf, todayAimLineOf } from "@/lib/roadmap-invite";
import { AIM_PROMPT_COOKIE, ROADMAP_GOALS_LIVE } from "@/lib/roadmap-types";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { longDate } from "@/components/shell/nav";
import { TodayBoard } from "@/components/today/TodayBoard";
import { closeItemsOf } from "@/components/today/board-ui";
import { WeekQuests } from "@/components/roadmap/WeekQuests";
import { AimLine } from "@/components/roadmap/AimLine";
import { NamedMark } from "@/components/glyph/NamedMark";

// The board turns on the clock (a 04:00 day edge, a ten-minute undo window)
// and on every tick — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const day = todayKey(now);

  // One wave: the board's own read (templates, recent instances, the day's
  // ledger, the queue size, and each open ROADMAP goal's stored series —
  // cached per life day), the streak, the ready encounters Next up names,
  // the notification feed the Asks cards read (the same cached feed as the
  // top bar's bell), and this life week's quests for the started roadmap
  // milestone (roadmap F17: one cached indexed row once the week is frozen,
  // so the card loads with the board; no Suspense, no fallback, and a
  // failure or a missing table renders nothing). Revision 4 (F-R4-3) adds the
  // aim's step (R4's loadAimStep: at most 4 indexed reads, cached for the life
  // day on 'roadmap' and 'life'; a missing table or column, or a failure,
  // reads as no line) and the request's cookies (the "Not now" snoozes). All
  // cached; a warm load costs nothing.
  // The live fix (contracts §22.11, ruling 67): each plan-born title's Gemini-named Domain names, so Today marks them.
  // Started with the wave (cached per life day; a failure reads as none) and awaited after it.
  const namedTitlesLoad = loadTodayNamedTitles(userId, now).catch(() => ({}) as Record<string, string[]>);
  const [board, streak, bosses, feed, quests, aimStep, jar] = await Promise.all([
    loadTodayBoard(userId, day, now),
    getDailyStreak(userId),
    loadBossStates(userId),
    loadNotifications(userId, now).catch(() => null),
    loadWeekQuests(userId, now).catch(() => null),
    loadAimStep(userId, now).catch(() => null),
    cookies(),
  ]);
  const namedTitles = await namedTitlesLoad;

  // Writes a render may owe, after the response and only when owed: the
  // day's first open fixes the quest's target, and a study task the day's
  // reviews have already satisfied gets its (0 XP) completion recorded.
  const needsDayOpen = board.ledger.today.dayOpenQty === null;
  const studyToRecord = unrecordedStudyTasks(board) > 0;
  if (needsDayOpen || studyToRecord) {
    after(async () => {
      if (needsDayOpen) await recordDayOpen(userId, board.dueNow ?? 0, now);
      if (studyToRecord) await autoCompleteStudyTasks(userId, now);
    });
  }

  // Roadmap F14: this week's quest set, frozen once (INSERT … ON CONFLICT DO
  // NOTHING). The life cron freezes it just after Monday 04:00; a render that
  // finds none (a failed cron) freezes it after the response, in its own
  // after(). An empty, held or past-due week is frozen too. freezeWeekQuests
  // writes only where life writes are on and never throws; a writes-off
  // server shows the live set, labelled, and schedules nothing.
  if (quests && !quests.frozen && !quests.view.writesOff) {
    after(() => freezeWeekQuests(userId, now, "RENDER"));
  }

  // Life maintenance, its own after(), never awaited by the render (M2 F5,
  // decision 4): daily settlement first (Duty's lazy, idempotent judging of
  // days ≤ today − 2), then the M5 week judge, in one single-flight chain.
  // maybeMaintainLife writes nothing before Duty's launch, with life writes
  // off (lifeWritesEnabled, the shared database) or while the settlement
  // cursor is null, returns at once when nothing is behind, and never throws.
  after(() => maybeMaintainLife(userId));

  const readyBosses = bosses.filter((b) => b.availability.status === "ready").map((b) => b.archetype.name);
  const focus = feed?.notices.find((n) => n.id === "focus")?.title ?? null;

  // The date lives in the top bar (the life day's own date, which between
  // midnight and 04:00 is still the day before, and says so). The clock
  // below keeps time and prints its zone on purpose: a wrong zone would
  // silently shift every day edge in the app, and this is where it shows.
  const clock = boardClock(now);

  // Revision 4 (F-R4-3, decisions 35 and 49): one quiet aim line, from day
  // keys alone (roadmap-invite todayAimLineOf; no view is counted): SET on a
  // fresh-start day with its back-off (the Settings switch and every "Not
  // now" silence it: 'later:' from the /you ASK card, 'hide:' from the /you
  // LATER line and from this line's SET ×, whose label promises no aim
  // suggestions for 4 weeks; aimPromptOf reads the cookie and the switch,
  // and the page never branches on the prompt), DRAFT for a waiting draft (3
  // days at most), START for a milestone ready to start (never while
  // ROADMAP_GOALS_LIVE is false). Nothing here writes: "Not now" is
  // AimLine's own action.
  const aimCookie = jar.get(AIM_PROMPT_COOKIE)?.value;
  const aimLine = todayAimLineOf({
    step: aimStep,
    prompt: aimPromptOf(aimCookie, aimStep?.aimSuggestions ?? null, day),
    cookie: aimCookie,
    stepCookie: jar.get(AIM_STEP_COOKIE)?.value,
    today: day,
    goalsLive: ROADMAP_GOALS_LIVE,
  });
  // The line hides only while Close the day is due: the board's slot carries
  // data-compact on the evening clock (closeDayProminent), and this wrapper
  // carries data-close-due when Close the day has something to close (the
  // board's own closeItemsOf, over the same board), so an evening with
  // nothing left open still shows it (roadmap.css keys the rule on both).
  const closeBoard = aimLine && !weekQuestsShownOnToday(quests?.view) ? buildBoard(board) : null;
  const closeDue = closeBoard ? closeItemsOf({ must: closeBoard.must, todayRows: closeBoard.todayRows, today: closeBoard.today, live: closeBoard.dutyLive }).length > 0 : false;

  // The week quests card (F17) under the goals, only for an open week with a
  // quest; else the aim line in the same slot, so the two never show together.
  // Never an Ask, a count or a bell line, and never on red.
  const questsSlot =
    quests && weekQuestsShownOnToday(quests.view) ? (
      <WeekQuests variant="today" view={quests.view} />
    ) : aimLine ? (
      <div className="rm-aim-slot" data-close-due={closeDue ? "1" : undefined}>
        <AimLine view={aimLine} />
      </div>
    ) : null;

  return (
    <>
      <ShellTitle eyebrow={clock.lateNight ? "Today · until 04:00" : "Today"} title={longDate(board.today)} />
      <TodayBoard
        data={board}
        streak={streak}
        nowIso={now.toISOString()}
        notices={feed?.notices ?? []}
        focus={focus}
        bosses={readyBosses}
        footClock={{ time: clock.time, zone: clock.zone, tz: clock.tz }}
        launched={isLaunched(day)}
        questsSlot={questsSlot}
        namedTitles={Object.keys(namedTitles).length > 0 ? { names: namedTitles, mark: <NamedMark /> } : null}
      />
    </>
  );
}
