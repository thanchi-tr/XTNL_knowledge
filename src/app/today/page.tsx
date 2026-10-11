import type { Metadata } from "next";
import "@/components/task-style/task-style.css";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { autoCompleteStudyTasks, loadTodayBoard, recordDayOpen } from "@/lib/tasks";
import { boardClock, unrecordedStudyTasks, weekQuestsShownOnToday } from "@/lib/today-board";
import { getDailyStreak } from "@/lib/streak";
import { loadBossStates } from "@/lib/bosses";
import { loadNotifications } from "@/lib/notifications";
import { isLaunched } from "@/lib/life-economy";
import { maybeMaintainLife } from "@/lib/settlement";
import { loadWeightView } from "@/lib/weight-server";
import { freezeWeekQuests, loadTodayNamedTitles, loadWeekQuests } from "@/lib/roadmap-quests-server";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { longDate } from "@/components/shell/nav";
import { TodayBoard } from "@/components/today/TodayBoard";
import { DueElsewhere } from "@/components/today/DueElsewhere";
import { dueElsewhereOf, questsOpenOf, weighInDueOf } from "@/components/today/due-elsewhere";
import { NamedMark } from "@/components/glyph/NamedMark";

// The board turns on the clock (a 04:00 day edge, a ten-minute undo window)
// and on every tick — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Today" };

/**
 * Tasks › Today (the three sections: Ideas, Tasks, Body). The board shows the
 * tasks due today and nothing else; what is due in the other two sections is
 * one slim strip of links out (due-elsewhere.ts): reviews due, this week's
 * roadmap quests still open and the encounters ready (Ideas, /review, where
 * the review quest, the week quests, the aim line and the encounters live
 * now), and a weigh-in not yet logged (Body, /train). The streak and the
 * Full day are Character's (/you).
 */
export default async function TodayPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const day = todayKey(now);

  // One wave: the board's own read (templates, recent instances, the day's
  // ledger, the queue size, and each open ROADMAP goal's stored series —
  // cached per life day), the streak (the day's moments, Record yesterday's
  // honesty), the notification feed the Tasks Asks read (the same cached feed
  // as the top bar's bell), and, for the strip only, the ready encounters,
  // this life week's quests (roadmap F17: one cached indexed row once the
  // week is frozen; a failure or a missing table reads as none) and the Body
  // section's day (the weight card's own cached read; it fails soft to the
  // empty view). All cached; a warm load costs nothing.
  // The live fix (contracts §22.11, ruling 67): each plan-born title's Gemini-named Domain names, so Today marks them.
  // Started with the wave (cached per life day; a failure reads as none) and awaited after it.
  const namedTitlesLoad = loadTodayNamedTitles(userId, now).catch(() => ({}) as Record<string, string[]>);
  const [board, streak, bosses, feed, quests, weight] = await Promise.all([
    loadTodayBoard(userId, day, now),
    getDailyStreak(userId),
    loadBossStates(userId).catch(() => []),
    loadNotifications(userId, now).catch(() => null),
    loadWeekQuests(userId, now).catch(() => null),
    loadWeightView(userId, now).catch(() => null),
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

  // The date lives in the top bar (the life day's own date, which between
  // midnight and 04:00 is still the day before, and says so). The clock
  // below keeps time and prints its zone on purpose: a wrong zone would
  // silently shift every day edge in the app, and this is where it shows.
  const clock = boardClock(now);

  // The one strip: what Ideas and Body have due today, from the reads above. Hidden when nothing is (no rows).
  const elsewhere = dueElsewhereOf({
    reviewsDue: board.dueNow ?? null,
    questsOpen: quests && weekQuestsShownOnToday(quests.view) ? questsOpenOf(quests.view) : 0,
    bossesReady: bosses.filter((b) => b.availability.status === "ready").length,
    weighInDue: weighInDueOf(weight),
  });

  return (
    <>
      <ShellTitle eyebrow={clock.lateNight ? "Today · until 04:00" : "Today"} title={longDate(board.today)} />
      <TodayBoard
        data={board}
        streak={streak}
        nowIso={now.toISOString()}
        notices={feed?.notices ?? []}
        footClock={{ time: clock.time, zone: clock.zone, tz: clock.tz }}
        launched={isLaunched(day)}
        elsewhere={elsewhere.length > 0 ? <DueElsewhere rows={elsewhere} /> : null}
        namedTitles={Object.keys(namedTitles).length > 0 ? { names: namedTitles, mark: <NamedMark /> } : null}
      />
    </>
  );
}
