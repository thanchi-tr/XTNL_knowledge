import { LIFE_TZ, dayEndOf, dayKeyOf, daysBetween } from "./life-day";

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
 * ── Which day ────────────────────────────────────────────
 * "Day" means the life day from life-day.ts: 04:00 to 04:00 in the user's own
 * zone, the same day every other surface in the app counts in. This used to
 * resolve against the server's zone, which on the deployment is UTC, so the
 * queue refilled at 10:00 local and a card due "today" could still be locked
 * at breakfast. Pinning the zone (rather than threading the reader's offset
 * through every server component) is what a single-user app needs: the
 * server and the browser now name the same day without being told.
 *
 * Starting the day at 04:00 rather than midnight means a late session still
 * belongs to the evening it started in: cards unlocked at 23:00 stay in the
 * same queue at 01:00 instead of the queue refilling mid-sitting.
 */

/**
 * The instant a card must be scheduled at or before to count as due: the last
 * millisecond of `now`'s life day.
 */
export function dueCutoff(now: Date, tz: string = LIFE_TZ): Date {
  return new Date(dayEndOf(dayKeyOf(now, tz), tz).getTime() - 1);
}

/** Whether a card scheduled for `dueDate` is reviewable as of `now`. */
export function isDue(dueDate: Date, now: Date, tz: string = LIFE_TZ): boolean {
  return dueDate.getTime() <= dueCutoff(now, tz).getTime();
}

/**
 * Whole days between today and the card's day, ignoring time of day.
 *
 * `Math.round` on a raw millisecond difference — the old approach — reports a
 * card due in 13 hours as "in 1d" and one due in 11 hours as "today",
 * depending only on what time it is now. Comparing life days instead means
 * the label changes when the day turns over and at no other moment.
 */
export function daysUntilDue(dueDate: Date, now: Date, tz: string = LIFE_TZ): number {
  return daysBetween(dayKeyOf(now, tz), dayKeyOf(dueDate, tz));
}

export interface DueLabel {
  label: string;
  /** Past its day, not merely arrived at it. */
  overdue: boolean;
}

export function formatDue(dueDate: Date, now: Date, tz: string = LIFE_TZ): DueLabel {
  const days = daysUntilDue(dueDate, now, tz);
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, overdue: true };
  if (days === 0) return { label: "Due today", overdue: false };
  if (days === 1) return { label: "Due tomorrow", overdue: false };
  return { label: `Due in ${days}d`, overdue: false };
}
