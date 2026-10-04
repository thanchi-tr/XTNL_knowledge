"use server";

/**
 * FROZEN CONTRACT (M2 lane 0 shell; lane E implements, F13 and F14) — the
 * rituals' server actions: Close the day's note and mood, and the weekly
 * review's done marker. Both write REFLECTION rows (sink NONE, xp 0,
 * countsForStreak false; never graded). Pure builders live in
 * src/lib/rituals.ts: reflectionEventInput, weekReviewEventInput,
 * reviewedWeek.
 *
 * Same conventions as actions/duty.ts: `{ok, value} | {ok, error}`, never
 * throws, `refresh()` on `{refresh: true}`. Every action takes only the
 * change and reads the rest (today, the reviewed week) on the server.
 *
 *   saveReflection(day, note, mood, opts?)  today, or yesterday (a sheet opened before 04:00 and
 *                                           saved after it); a later save supersedes. opts.opId
 *                                           (optional) makes a retried save land once
 *   markWeekReviewed(opts?)                 reviewedWeek(today)'s 'week-review:<YYYY-Www>';
 *                                           refused before Duty's launch day and on Thursday and
 *                                           Friday (no week is under review); idempotent
 *   setDebtWriteOff(on, opts?)              kept for old imports only: the same action as
 *                                           actions/duty.ts setDebtWriteOff (one writer,
 *                                           lib/duty.ts setDebtWriteOffCore), answering
 *                                           {debtWriteOff}. Settings › Days imports it from
 *                                           actions/duty.ts
 *
 * Spec: docs/life-plan/m2-refit.md F13, F14, F15; contract table: docs/life-plan/m2-contracts.md.
 */
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { recordActivity } from "@/lib/activity";
import { todayKey, type DayKey } from "@/lib/life-day";
import { isDutyLaunched } from "@/lib/duty-economy";
import { setDebtWriteOff as setDebtWriteOffAction, type DutyActionOptions, type DutyActionResult } from "./duty";
import {
  isMood,
  reflectionDayAllowed,
  reflectionEventInput,
  reflectionNonce,
  reviewedWeek,
  weekReviewEventInput,
} from "@/lib/rituals";

export type RitualActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface RitualActionOptions {
  refresh?: boolean;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAVE_FAILED = "Couldn't save that. Try again.";

async function run<T>(label: string, opts: RitualActionOptions | undefined, fn: (userId: string) => Promise<RitualActionResult<T>>): Promise<RitualActionResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * Close the day: a private note and a mood for `day` (today, or yesterday
 * before 04:00 reads as yesterday). Key reflectionKey(day, nonce); a later
 * save supersedes. `mood` is a small integer or null; stored as qty.
 */
export async function saveReflection(
  day: DayKey,
  note: string,
  mood: number | null,
  opts?: RitualActionOptions & { opId?: string }
): Promise<RitualActionResult<{ day: DayKey; key: string }>> {
  if (typeof day !== "string" || !DAY_KEY_RE.test(day)) return { ok: false, error: "Pick a day." };
  if (note != null && typeof note !== "string") return { ok: false, error: "A note is a line of text." };
  if (mood != null && !isMood(mood)) return { ok: false, error: "A mood is 1 to 5." };
  return run("saveReflection", opts, async (userId) => {
    const now = new Date();
    if (!reflectionDayAllowed(day, todayKey(now))) return { ok: false, error: "Only today, or yesterday until 04:00, can be noted." };
    const input = reflectionEventInput({ day, note: note ?? "", mood: mood ?? null, nonce: reflectionNonce(now, opts?.opId), now });
    // Idempotent on its key: a retried save returns the row already written.
    const row = await recordActivity(userId, input);
    return { ok: true, value: { day, key: row.dedupeKey ?? input.dedupeKey ?? "" } };
  });
}

/** Marks rituals.ts reviewedWeek(today) as reviewed: weekReviewKey(weekKey), detail 'week review'. */
export async function markWeekReviewed(opts?: RitualActionOptions): Promise<RitualActionResult<{ weekKey: string }>> {
  return run("markWeekReviewed", opts, async (userId) => {
    const now = new Date();
    const today = todayKey(now);
    if (!isDutyLaunched(today)) return { ok: false, error: "The weekly review starts with Duty." };
    const week = reviewedWeek(today);
    if (!week) return { ok: false, error: "No week is under review today: the review opens on Saturday." };
    await recordActivity(userId, weekReviewEventInput({ weekKey: week.weekKey, day: today, now }));
    return { ok: true, value: { weekKey: week.weekKey } };
  });
}

/**
 * Settings › Days 'Accept a loss' (LifeSettings.debtWriteOff): the one
 * action is actions/duty.ts setDebtWriteOff (its core spreads
 * newLifeSettingsData for a first row, decision 1). This name delegates to
 * it, same arguments and same answer, so there is one writer and one shape.
 * An async function rather than `export { … } from`, which a "use server"
 * file is not documented to allow.
 */
export async function setDebtWriteOff(on: boolean, opts?: DutyActionOptions): Promise<DutyActionResult<{ debtWriteOff: boolean }>> {
  return setDebtWriteOffAction(on, opts);
}
