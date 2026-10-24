import type { Metadata } from "next";
import "@/components/task-style/task-style.css";
import "@/components/shell/work-tabs.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { loadTodayBoard } from "@/lib/tasks";
import { loadWorkBoard } from "@/lib/work-boards-server";
import type { DailyStreak } from "@/lib/streak";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { TodayBoard } from "@/components/today/TodayBoard";
import { Button } from "@/components/ui/Button";

// The board turns on the clock (a 04:00 day edge, a ten-minute undo window): never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tasks" };

/**
 * A work board's TodayBoard props never read a streak (work is not the game:
 * no day moments); the board's type still asks for one, so it gets nothing.
 */
const NO_STREAK: DailyStreak = {
  current: 0,
  last7Days: [false, false, false, false, false, false, false],
  held7Days: [false, false, false, false, false, false, false],
  bankedFreezes: 0,
  endedOn: null,
  endedAfter: 0,
  freezeWillCover: false,
  heldInRun: 0,
  restTokens: null,
};

/**
 * A work tab's Tasks (work-boards.ts; /today/work/<id>/tasks; until the Office workspace, 2026-10-20, the tab's own
 * index): the same board as the personal Board (Must, Planned, Habits, Inbox and Anytime, the drawer, steps, Undo)
 * over this tab's own tasks, in the workspace's skin (TodayBoard's `work`: no colour code and no diamonds, no XP or
 * band figures, no streaks, no moments, no flourish or pluck: a calm check). Kept out of the game: no life XP, no
 * due-elsewhere strip, no capacity, no goals, no Close the day. The '+' (and 'c') captures into this tab (QuickCapture
 * stamps the line with it). The tab's menu and its lists live in the work frame's header. An archived tab says so and
 * points to Settings; an unknown one is a 404.
 */
export default async function WorkTasksPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const now = new Date();
  const userId = getCurrentUserId();
  const day = todayKey(now);
  // One wave: the tab and its board (an archived or unknown tab's board read is empty and unused).
  const [board, data] = await Promise.all([loadWorkBoard(userId, boardId), loadTodayBoard(userId, day, now, boardId)]);
  if (!board) notFound();

  if (board.archived) {
    return (
      <>
        <ShellTitle eyebrow={board.name} title="Tasks" />
        <div className="page cq-main">
          <section className="card work-card" aria-label={`Work tab: ${board.name}`}>
            <div className="work-card-h">
              <b>{board.name} is archived</b>
            </div>
            <p className="work-card-note">Its tasks are kept. Restore it in Settings › Work tabs while a place is free.</p>
            <div className="work-menu-row">
              <Button variant="secondary" href="/settings#work-tabs">
                Open Settings
              </Button>
              <Button variant="quiet" href="/today">
                Back to Board
              </Button>
            </div>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <ShellTitle eyebrow={board.name} title="Tasks" />
      <TodayBoard data={data} streak={NO_STREAK} nowIso={now.toISOString()} notices={[]} work={{ id: board.id, name: board.name, crmOn: board.crmOn, ordersOn: board.ordersOn }} />
    </>
  );
}
