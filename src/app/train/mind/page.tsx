import type { Metadata } from "next";
import "@/components/mind/mind.css";
import { getCurrentUserId } from "@/lib/user";
import { countChecks, loadMindView } from "@/lib/mind-server";
import { deleteAllChecks, deleteCheck, dismissLowPattern, loadOlderChecks, logCheck, pauseChecks } from "@/app/actions/mind";
import { MindCard, MindOff } from "@/components/mind/MindCard";

// A check-in turns over with the life day (04:00), and the view is the user's own rows — never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mind" };

/**
 * Body › Mind (health-2026-10-27.md D1, D3, D8, D23): the check-in's home — "Check in" (the sheet: the grid, stress, a
 * word, tags), the 14-day strip, the weekly medians with any "Changed" mark, the low-pattern card when it holds, each
 * check-in with its own Delete (the older ones a page at a time), Pause and "Delete all check-ins", and "Need to talk?
 * Lifeline 13 11 14" always.
 *
 * The server decides whether check-ins are open: loadMindView computes mindOn(today) from MIND_LAUNCH_DAY (null in
 * code; XTNL_MIND_LAUNCH_DAY outside production, the rehearsal server) and, while it is off, reads nothing and answers
 * live: false — the page then says that check-ins arrive with the next update, and reads only how many are stored
 * (countChecks: a count, never a value), so any kept from before (a rolled-back switch, a rehearsal server's rows) can
 * still be removed with "Delete all check-ins". A missing table reads as ready: false and the card says so; a failed
 * read says it couldn't load. The reads are cached under 'mind'; every write invalidates them. A record, never a
 * reward: nothing here pays, and nothing in the economy reads it.
 */
export default async function MindPage() {
  const now = new Date();
  const userId = getCurrentUserId();
  const view = await loadMindView(userId, now);
  const stored = view.live ? 0 : await countChecks(userId);
  return (
    <div className="page narrow">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {view.live ? (
          <MindCard view={view} actions={{ logCheck, deleteCheck, deleteAllChecks, pauseChecks, dismissLowPattern, loadOlderChecks }} />
        ) : (
          <MindOff stored={stored} deleteAllChecks={deleteAllChecks} />
        )}
      </div>
    </div>
  );
}
