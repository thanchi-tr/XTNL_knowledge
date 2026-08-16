/**
 * One definition of "due", for the whole app.
 *
 * ── The bug this exists to kill ──────────────────────────
 * There were three, and they disagreed:
 *
 *   /review, notifications, bosses   `dueDate <= now`      exact instant
 *   /dashboard "Due today"           `dueDate <= todayEnd` calendar day
 *   formatDue's label                `round(diff / 1 day)` rounded days
 *
 * So a card scheduled for the 17th, at 05:00 because that is the time of day
 * you happened to review it four days earlier, was labelled "Due today",
 * counted as due today on the dashboard, and *withheld from the review queue*
 * until 05:00 actually arrived. Observed live: two ideas due 2026-08-17T05:00Z
 * with the clock at 2026-08-16T16:21Z — already the 17th in local time — and
 * an empty review queue with nothing on screen explaining why.
 *
 * ── The rule ─────────────────────────────────────────────
 * A card due on day D is reviewable from the start of day D. That is how
 * every spaced-repetition tool a person has used before behaves, and it is
 * the only rule under which "Due today" and "I can review it" mean the same
 * thing. Scheduling still stores an exact instant — intervals are computed in
 * fractional days and the grace window needs the precision — but *becoming
 * available* is a day-granular question.
 *
 * The alternative, making the labels precise instead ("Due in 12h"), was
 * rejected: it would be honest and useless. Nobody schedules study around a
 * card unlocking at three in the afternoon, and the queue would refill itself
 * at arbitrary times through the day.
 *
 * ── Timezone ─────────────────────────────────────────────
 * Server-side this resolves against the server's zone, which for a
 * single-user deployment is the deployment's zone rather than the reader's.
 * Both are handled the same way and both are wrong by at most one day-edge;
 * the *previous* behaviour was wrong by up to a full day for every card, on
 * every surface, which is the part worth fixing first. Making this truly
 * local needs the client's offset threaded into the server components, and
 * is worth doing separately rather than smuggling in here.
 */

/**
 * The instant a card must be scheduled at or before to count as due: the last
 * millisecond of `now`'s day.
 */
export function dueCutoff(now: Date): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Whether a card scheduled for `dueDate` is reviewable as of `now`. */
export function isDue(dueDate: Date, now: Date): boolean {
  return dueDate.getTime() <= dueCutoff(now).getTime();
}

/**
 * Whole days between today and the card's day, ignoring time of day.
 *
 * `Math.round` on a raw millisecond difference — the old approach — reports a
 * card due in 13 hours as "in 1d" and one due in 11 hours as "today",
 * depending only on what time it is now. Comparing calendar days instead
 * means the label changes when the date changes and at no other moment.
 */
export function daysUntilDue(dueDate: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export interface DueLabel {
  label: string;
  /** Past its day, not merely arrived at it. */
  overdue: boolean;
}

export function formatDue(dueDate: Date, now: Date): DueLabel {
  const days = daysUntilDue(dueDate, now);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, overdue: true };
  if (days === 0) return { label: "Due today", overdue: false };
  if (days === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${days}d`, overdue: false };
}
