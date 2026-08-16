import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { dueCutoff } from "@/lib/due";

/**
 * Straight into the review queue, with the number waiting on it.
 *
 * The nav already links to `/review`, but as one word in a row of six — the
 * same visual weight as Taxonomy, which you open once a month. Reviewing is
 * the thing this app is *for*, and there was no way to see from any screen
 * whether anything was waiting without going and looking.
 *
 * So it gets the second primary action in the header, beside New Idea and
 * cut from the same cloth: `nav-new-idea` is what carries the sky's
 * silhouette, palette, bevel and motes, so the two read as a pair that
 * changes together rather than as one styled button and one ordinary one.
 *
 * Renders nothing at zero. A button that says "0 due" is an invitation to an
 * empty page, and a permanent one would train you to stop reading it — the
 * count is only worth the space when it is asking for something.
 *
 * `dueCutoff` rather than `now`, so this agrees with the queue it opens.
 * Before that was shared, the two ran different rules and a badge could have
 * sent you to an empty page — which is precisely the bug it would exist to
 * prevent.
 */
async function loadDue(): Promise<number> {
  // Fails silently to 0, like `NavTitleBadge`: a cold database should never
  // take down every route in the app on its way to rendering one count.
  try {
    return await prisma.idea.count({
      where: { isArchived: false, dueDate: { lte: dueCutoff(new Date()) } },
    });
  } catch {
    return 0;
  }
}

export async function NavReviewLink() {
  const due = await loadDue();
  if (due === 0) return null;

  return (
    <Link
      href="/review"
      className="btn-primary nav-new-idea nav-review"
      style={{ padding: "8px 14px" }}
      title={`${due} idea${due === 1 ? "" : "s"} due for review`}
    >
      Review
      <span className="nav-review-count mono">{due}</span>
    </Link>
  );
}
