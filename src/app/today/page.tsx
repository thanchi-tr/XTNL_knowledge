import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { autoCompleteStudyTasks, loadTodayBoard, recordDayOpen } from "@/lib/tasks";
import { boardClock, unrecordedStudyTasks } from "@/lib/today-board";
import { getDailyStreak } from "@/lib/streak";
import { loadBossStates } from "@/lib/bosses";
import { loadNotifications } from "@/lib/notifications";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { longDate } from "@/components/shell/nav";
import { TodayBoard } from "@/components/today/TodayBoard";
import { LiveClock } from "@/components/today/LiveClock";

// The board turns on the clock (a 04:00 day edge, a ten-minute undo window)
// and on every tick — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const day = todayKey(now);

  // One wave: the board's own read (templates, recent instances, the day's
  // ledger, the queue size — cached per life day), the streak, the ready
  // encounters Next up names, and the notification feed the Asks cards
  // read (the same cached feed as the top bar's bell). All cached; a warm
  // load costs nothing.
  const [board, streak, bosses, feed] = await Promise.all([
    loadTodayBoard(userId, day, now),
    getDailyStreak(userId),
    loadBossStates(userId),
    loadNotifications(userId, now).catch(() => null),
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

  const readyBosses = bosses.filter((b) => b.availability.status === "ready").map((b) => b.archetype.name);
  const focus = feed?.notices.find((n) => n.id === "focus")?.title ?? null;

  // The date lives in the top bar (the life day's own date, which between
  // midnight and 04:00 is still the day before, and says so). The clock
  // below keeps time and prints its zone on purpose: a wrong zone would
  // silently shift every day edge in the app, and this is where it shows.
  const clock = boardClock(now);

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
        footer={
          <p className="t-num">
            <LiveClock initialTime={clock.time} zone={clock.zone} tz={clock.tz} /> · <Link href="/today/rules">How a day is judged</Link>
          </p>
        }
      />
    </>
  );
}
