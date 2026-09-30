import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { autoCompleteStudyTasks, loadTodayBoard, recordDayOpen } from "@/lib/tasks";
import { boardClock, unrecordedStudyTasks } from "@/lib/today-board";
import { getDailyStreak } from "@/lib/streak";
import { loadWeeklyQuotas } from "@/lib/field-quota";
import { loadBossStates } from "@/lib/bosses";
import { TodayBoard } from "@/components/today/TodayBoard";

// The board turns on the clock (a 04:00 day edge, a ten-minute undo window)
// and on every tick — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const day = todayKey(now);

  // One wave: the board's own read (templates, recent instances, the day's
  // ledger, the queue size — cached per life day), the streak, and the two
  // knowledge-side lines the quest card mirrors. All cached; a warm load
  // costs nothing.
  const [board, streak, quotas, bosses] = await Promise.all([
    loadTodayBoard(userId, day, now),
    getDailyStreak(userId),
    loadWeeklyQuotas(userId, now),
    loadBossStates(userId),
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

  const short = quotas.filter((q) => !q.met);
  const owed = short.reduce((s, q) => s + q.short, 0);
  const quota =
    quotas.length === 0
      ? null
      : short.length > 0
        ? { line: `${owed} new idea${owed === 1 ? "" : "s"} owed this week`, met: false }
        : { line: "Weekly quota met", met: true };
  const bossReady = bosses.filter((b) => b.availability.status === "ready").length;

  // The zone is printed on purpose: a wrong one would silently shift every
  // day edge in the app, and this is where it would be noticed.
  const clock = boardClock(now);

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Today</p>
          <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
            {clock.date}
          </h1>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {clock.date} · {clock.time} {clock.zone} ({clock.tz}) ·{" "}
          <Link href="/today/rules" style={{ color: "var(--blue)" }}>
            How XP works
          </Link>
        </p>
      </header>

      <TodayBoard data={board} streak={streak} nowIso={now.toISOString()} quota={quota} bossReady={bossReady} />
    </main>
  );
}
