import Link from "next/link";
import { loadTodayCounts } from "@/lib/tasks";
import { getCurrentUserId } from "@/lib/user";

/**
 * 'Today N' in the header: open musts plus the todos still due today.
 *
 * The same arrangement as `NavReviewLink`, and for the same reason: the
 * board is where the day's obligations live, and there should be no need to
 * go and look to know whether anything is waiting there. It wears the
 * review shortcut's cloth (`nav-new-idea nav-review`) so the pair reads as
 * one family of "N waiting" buttons that follow the sky together.
 *
 * Renders nothing at zero — a count is only worth the space while it asks
 * for something — and fails silently to nothing, so a cold database can
 * never take the header down with it. The count is cached per life day
 * under the life and activity tags, so a tick anywhere clears it.
 */
async function loadCount(): Promise<number> {
  try {
    const counts = await loadTodayCounts(getCurrentUserId());
    return counts.musts + counts.due;
  } catch {
    return 0;
  }
}

export async function NavTodayLink() {
  const n = await loadCount();
  if (n === 0) return null;

  return (
    <Link
      href="/today"
      className="btn-primary nav-new-idea nav-review"
      style={{ padding: "8px 14px" }}
      title={`${n} thing${n === 1 ? "" : "s"} left on today's board`}
    >
      Today
      <span className="nav-review-count mono">{n}</span>
    </Link>
  );
}
