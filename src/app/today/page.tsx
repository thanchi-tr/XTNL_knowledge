import type { Metadata } from "next";
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
import { freezeWeekQuests, loadWeekQuests } from "@/lib/roadmap-quests-server";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { longDate } from "@/components/shell/nav";
import { TodayBoard } from "@/components/today/TodayBoard";
import { WeekQuests } from "@/components/roadmap/WeekQuests";

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
  // failure or a missing table renders nothing). All cached; a warm load
  // costs nothing.
  const [board, streak, bosses, feed, quests] = await Promise.all([
    loadTodayBoard(userId, day, now),
    getDailyStreak(userId),
    loadBossStates(userId),
    loadNotifications(userId, now).catch(() => null),
    loadWeekQuests(userId, now).catch(() => null),
  ]);

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

  // The week quests card (F17) under the goals, only for an open week with a
  // quest: never an Ask, a count or a bell line, and never on red.
  const questsSlot = quests && weekQuestsShownOnToday(quests.view) ? <WeekQuests variant="today" view={quests.view} /> : null;

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
      />
    </>
  );
}
