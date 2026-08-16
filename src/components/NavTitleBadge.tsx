import Link from "next/link";
import { loadFieldLevels } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";
import { fieldLevel } from "@/lib/xp";
import { computeTitle } from "@/lib/titles";

/**
 * The player's current title, in the nav on every page.
 *
 * An async Server Component passed into the (client) `AppNav` as a slot, so
 * the root layout itself stays synchronous and this streams in rather than
 * blocking first paint on a database round trip.
 *
 * Fails silently to `null`: a nav badge is decoration, and a missing
 * DEFAULT_USER_ID or a cold database should never be able to take down
 * every route in the app on its way to rendering one label.
 */
async function loadBadge() {
  // Only the data fetch is guarded — building JSX inside a try/catch would
  // not actually catch render errors anyway (React renders lazily), and
  // eslint is right to reject it.
  try {
    const userId = getCurrentUserId();
    const [progression, fields] = await Promise.all([loadProgression(userId), loadFieldLevels()]);

    const accountLevel = fieldLevel(fields.map((f) => f.level));
    const ultimateCount = progression.activeSkills.filter((s) => s.rank === "ULTIMATE").length;
    return {
      accountLevel,
      ultimateCount,
      title: computeTitle(accountLevel, progression.scores, ultimateCount),
    };
  } catch {
    return null;
  }
}

export async function NavTitleBadge() {
  const badge = await loadBadge();
  if (!badge) return null;

  const { title, accountLevel, ultimateCount } = badge;
  const transcendent = ultimateCount > 0;

  return (
    <Link
      href="/skills"
      className="nav-title hidden items-baseline gap-2 no-underline lg:flex"
      title={`${title.full}${title.nextRank ? ` · ${title.levelsToNext} to ${title.nextRank}` : ""}`}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: transcendent ? "var(--rank-ultimate)" : "var(--ink-1)",
        }}
      >
        {title.rank}
      </span>
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {accountLevel}
      </span>
    </Link>
  );
}
