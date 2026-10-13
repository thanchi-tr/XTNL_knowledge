import type { Metadata } from "next";
import "@/components/task-style/task-style.css";
import "@/components/shell/work-tabs.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { loadTodayBoard } from "@/lib/tasks";
import { loadWorkBoard } from "@/lib/work-boards-server";
import { loadCallBacks, withCrm } from "@/lib/callbacks-server";
import { CALLBACK_PARAM, type CallBacksData } from "@/lib/callbacks";
import type { DailyStreak } from "@/lib/streak";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { TodayBoard } from "@/components/today/TodayBoard";
import { Button } from "@/components/ui/Button";

// The board turns on the clock (a 04:00 day edge, a ten-minute undo window): never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Work" };

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
};

/**
 * Tasks › a work tab (work-boards.ts; /today/work/<id>): the same board as
 * the personal Board (Must, Planned, Habits, Inbox and Anytime, the drawer,
 * steps, Undo) over this tab's own tasks, with the tab's name as the title.
 * Kept out of the game: no life XP, no due-elsewhere strip, no capacity, no
 * goals, no Close the day (TodayBoard's `work`). The '+' (and 'c') captures
 * into this tab (QuickCapture stamps the line with it). An archived tab says
 * so and points to Settings; an unknown one is a 404.
 *
 * Its call backs (callbacks.ts) mount in the board's call-backs slot: the
 * newest first, this tab's tags, its customers when its CRM is on, and
 * `?callback=<id>` (a reminder's tap, via /today?board=) scrolls to that card
 * and highlights it. Read with the wave; a failed read is no section, never
 * a broken board. The tab's card links to its customer list and its order
 * list (work-orders.ts) while each is switched on.
 */
export default async function WorkBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { boardId } = await params;
  const query = await searchParams;
  const now = new Date();
  const userId = getCurrentUserId();
  const day = todayKey(now);
  // Started with the wave, awaited after it (it fails soft to no section).
  const callBacksLoad: Promise<CallBacksData | null> = loadCallBacks(userId, boardId, { focus: query[CALLBACK_PARAM], now }).catch((err) => {
    console.error("[callbacks] load failed", err);
    return null;
  });
  // One wave: the tab and its board (an archived or unknown tab's board read is empty and unused).
  const [board, data] = await Promise.all([loadWorkBoard(userId, boardId), loadTodayBoard(userId, day, now, boardId)]);
  const callBacksRead = await callBacksLoad;
  if (!board) notFound();

  if (board.archived) {
    return (
      <>
        <ShellTitle eyebrow="Work" title={board.name} />
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

  // The tab's customers reach the sheet only where its CRM is on.
  const callBacks = callBacksRead ? withCrm(callBacksRead, board.crmOn) : null;

  return (
    <>
      <ShellTitle eyebrow="Work" title={board.name} />
      <TodayBoard data={data} streak={NO_STREAK} nowIso={now.toISOString()} notices={[]} work={{ id: board.id, name: board.name, crmOn: board.crmOn, ordersOn: board.ordersOn }} callBacks={callBacks} />
    </>
  );
}
