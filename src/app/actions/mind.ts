"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { todayKey, type DayKey } from "@/lib/life-day";
import { PAUSE_LENGTHS, isCheckId, isOlderCursor, pauseUntilOf, type CheckTrigger, type CheckVia, type OlderCursor, type OlderPage, type PauseLength } from "@/lib/mind";
import {
  deleteAllChecksCore,
  deleteCheckCore,
  dismissLowCore,
  loadOlderChecksCore,
  logCheckCore,
  mindErrorTag,
  pauseCore,
  type LoggedCheck,
  type MindResult,
} from "@/lib/mind-server";

/**
 * The check-in actions: log one, take one back (Undo and Delete are one action), delete them all, pause and resume,
 * hide the low-pattern card, and read a page of the older check-ins (each with its own Delete). A record, never a
 * reward: none of these pays anything, ticks a streak, keeps a quest or returns a moment, whatever the values.
 *
 * Nothing the browser sends is trusted: the input is copied field by field (anything else is dropped, `at` included:
 * a web check-in is felt when the server receives it), and the core checks it again (mind.ts cleanCheckInput). A pause
 * is asked for by its length; the server picks the day from its own clock. A check-in, a pause, a hide and the older
 * pages are refused while MIND_LAUNCH_DAY is not in force; the deletes never are. The writes invalidate the process
 * cache's 'mind' tag; like the weight actions, `{ refresh: true }` also re-renders the current route in the same
 * response (refresh() is a Server Action call only, and does not revalidate tagged data, which is why the cores
 * invalidate). Each returns { ok, value } or { ok: false, error } and never throws, and no log line carries a value.
 */

export interface MindActionOptions {
  /** Re-render the current route in this response (the card sets it). */
  refresh?: boolean;
}

export interface LogCheckInput {
  valence: number;
  energy: number;
  /** 0..4, or null / omitted when skipped. */
  stress?: number | null;
  word?: string | null;
  tags?: string[];
  /** self (the default) or close; prompted once prompts exist. */
  trigger?: CheckTrigger;
  /** web (the default), today, close or capture on the web. */
  via?: CheckVia;
  /** When the prompt this answers was shown (ISO); prompted check-ins only. */
  promptedAt?: string | null;
  /** Opening the sheet to saving it, in ms (measured by the sheet). */
  tookMs?: number | null;
  /** A UUID the sheet makes once per check-in and sends on every retry. */
  clientId: string;
}

async function run<T>(
  label: string,
  opts: MindActionOptions | undefined,
  fn: (userId: string) => Promise<MindResult<T>>,
  failLine = "Couldn't save that. Try again."
): Promise<MindResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed: ${mindErrorTag(err)}`);
    return { ok: false, error: failLine };
  }
}

/** Logs one check-in. A resend with the same clientId answers the first one (replay: true). */
export async function logCheck(input: LogCheckInput, opts?: MindActionOptions): Promise<MindResult<LoggedCheck>> {
  return run("logCheck", opts, async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to log." };
    const raw = {
      valence: input.valence,
      energy: input.energy,
      stress: input.stress,
      word: input.word,
      tags: input.tags,
      trigger: input.trigger,
      via: input.via,
      promptedAt: input.promptedAt,
      tookMs: input.tookMs,
      clientId: input.clientId,
    };
    return logCheckCore(userId, raw, new Date());
  });
}

/** Takes back one check-in: the receipt's Undo, and each row's Delete. One already gone answers deleted: 0. */
export async function deleteCheck(id: string, opts?: MindActionOptions): Promise<MindResult<{ deleted: number }>> {
  return run("deleteCheck", opts, async (userId) => {
    if (!isCheckId(id)) return { ok: false, error: "That check-in isn't here." };
    return deleteCheckCore(userId, id);
  });
}

/** "Delete all check-ins": every one, at once. It can't be undone (the card asks first). */
export async function deleteAllChecks(opts?: MindActionOptions): Promise<MindResult<{ deleted: number }>> {
  return run("deleteAllChecks", opts, (userId) => deleteAllChecksCore(userId));
}

/** Pauses check-ins for a week or a month from today, or resumes them now (null). The check-ins are kept. */
export async function pauseChecks(length: PauseLength | null, opts?: MindActionOptions): Promise<MindResult<{ pausedUntil: DayKey | null }>> {
  return run("pauseChecks", opts, async (userId) => {
    if (length !== null && !Object.prototype.hasOwnProperty.call(PAUSE_LENGTHS, length)) return { ok: false, error: "Pick a week or a month." };
    const now = new Date();
    return pauseCore(userId, length === null ? null : pauseUntilOf(length, todayKey(now)), now);
  });
}

/** Hides the low-pattern card for a week. Nothing is sent anywhere. */
export async function dismissLowPattern(opts?: MindActionOptions): Promise<MindResult<{ lowSeenAt: string }>> {
  return run("dismissLowPattern", opts, (userId) => dismissLowCore(userId, new Date()));
}

/**
 * "Show older": one page of the check-ins before the 14-day list, newest first, strictly before `before` (the last
 * row shown; null for the first page). The cursor is copied field by field and checked again in the core. A read: it
 * writes nothing and re-renders nothing.
 */
export async function loadOlderChecks(before: OlderCursor | null): Promise<MindResult<OlderPage>> {
  return run(
    "loadOlderChecks",
    undefined,
    async (userId) => {
      const cursor = before && typeof before === "object" ? { at: before.at, id: before.id } : before;
      if (!isOlderCursor(cursor)) return { ok: false, error: "Those check-ins aren't here." };
      return loadOlderChecksCore(userId, cursor, new Date());
    },
    "Couldn't load those. Try again."
  );
}
