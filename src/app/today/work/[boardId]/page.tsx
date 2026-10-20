import type { Metadata } from "next";
import "@/components/shell/work-tabs.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadAgenda } from "@/lib/scheduled-tasks-server";
import { loadFollowUps } from "@/lib/crm-server";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { AgendaView } from "@/components/work/AgendaView";
import { Button } from "@/components/ui/Button";

// The agenda turns on the clock (overdue, today, the 04:00 day edge): never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Agenda" };

/**
 * A work tab's Agenda (scheduled-tasks.ts; /today/work/<id>): the Office workspace's home, where the Tasks strip's
 * work tab lands. Its scheduled tasks by when they are due (Overdue · Today · Upcoming · Later · Done), each with Done,
 * Snooze and a tap to edit. `?task=<id>` (a reminder's tap, the bell, the search; an old customer task's id resolves to
 * its task) and `?callback=<id>` (an old call back's link: /today?board=…&callback=… redirects here) highlight that
 * row. The title reads "<tab> · Agenda". An archived tab says so and points to Settings; an unknown one is a 404.
 * Its follow-ups (Phase 2, crm-server loadFollowUps: the tab's cached facts, judged against this render's clock) are
 * read in the same wave; a failed read is no Follow up section (the side column then lists the overdue customers).
 */
export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ boardId }, query] = await Promise.all([params, searchParams]);
  const now = new Date();
  const [agenda, followUps] = await Promise.all([
    loadAgenda(getCurrentUserId(), boardId, { now, query }),
    loadFollowUps(getCurrentUserId(), boardId, now).catch((err) => {
      console.error("[crm] follow-ups read failed", err);
      return null;
    }),
  ]);
  if (agenda.kind === "gone") notFound();

  if (agenda.kind === "archived") {
    return (
      <>
        <ShellTitle eyebrow={agenda.board.name} title="Agenda" />
        <div className="page narrow cq-main">
          <section className="card work-card" aria-label={`Work tab: ${agenda.board.name}`}>
            <div className="work-card-h">
              <b>{agenda.board.name} is archived</b>
            </div>
            <p className="work-card-note">Its tasks, customers and scheduled tasks are kept. Restore it in Settings › Work tabs while a place is free.</p>
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
      <ShellTitle eyebrow={agenda.board.name} title="Agenda" />
      <AgendaView board={agenda.board} rows={agenda.rows} focus={agenda.focus} focusMissing={agenda.focusMissing} nowIso={agenda.nowIso} followUps={followUps} />
    </>
  );
}
