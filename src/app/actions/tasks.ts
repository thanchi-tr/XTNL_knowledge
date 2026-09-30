"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import type { CaptureSpan } from "@/lib/capture-parse";
import type { DayKey } from "@/lib/life-day";
import { applySizing } from "@/lib/life-sizing";
import { createFromCapture, type CapturedItem } from "./capture";
import {
  againCore,
  archiveCore,
  clarifyInboxCore,
  completeInstanceCore,
  goalProgressCore,
  renameCore,
  rescheduleCore,
  resizableCore,
  setBandOverrideCore,
  setDailyCapacityCore,
  skipCore,
  unarchiveCore,
  undoCaptureCore,
  undoCompletionCore,
  type Completion,
  type InboxChoice,
  type LifeResult,
} from "@/lib/tasks";

/**
 * The task actions: the Today board's writes, plus a text capture.
 *
 * Every action takes only a reference and the change (an id, a slot, some
 * minutes) and reads the rest on the server; no price, day or status the
 * browser sends is trusted. Numbers are clamped in the core. Each returns the
 * same `{ok, value} | {ok, error}` shape as the other actions, never throws,
 * and calls `refresh()` when asked — the board passes `{ refresh: true }` so
 * the response carries the re-rendered page in the same round trip, which is
 * what its optimistic state reconciles against. Callers elsewhere (the
 * capture toast on /review, say) leave it off so a review session is never
 * re-rendered under the player.
 */

export type TaskActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface TaskActionOptions {
  /** Re-render the current route in this response. The Today board sets it. */
  refresh?: boolean;
}

async function run<T>(label: string, opts: TaskActionOptions | undefined, fn: (userId: string) => Promise<LifeResult<T>>): Promise<TaskActionResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

const isId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 64;
const noId = <T>(): TaskActionResult<T> => ({ ok: false, error: "No task given." });
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Captures one line as a task. The same path as the capture sheet's
 * createFromCapture — one parse, one set of input clamps
 * (sanitizeCaptureInput), one sizing rule (none for goals and idea drafts)
 * and the same retry key — so the two entry points cannot drift apart.
 */
export async function createTask(
  text: string,
  reverted?: CaptureSpan[],
  opts?: TaskActionOptions & { captureKey?: string }
): Promise<TaskActionResult<CapturedItem>> {
  try {
    return await createFromCapture(text, reverted, { refresh: opts?.refresh === true, captureKey: opts?.captureKey });
  } catch (err) {
    console.error("createTask failed:", err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

export interface CompleteTaskInput {
  /**
   * The row's own life day (row.day), or 'today' / 'yesterday'. Send the
   * DayKey: the server books only today or yesterday by its own clock, so a
   * board left open across 04:00 is refused rather than booked a day off.
   */
  day?: "today" | "yesterday" | DayKey;
  /** Ignored: the server picks the slot (the first of the day; 'Again' is againTask). Kept so old callers still type-check. */
  slot?: number;
  minutes?: number | null;
  mvv?: boolean;
}

/** Ticks a task: today, or yesterday inside the record window. Pays exactly the projected price; a double tap pays once. */
export async function completeTask(templateId: string, input?: CompleteTaskInput, opts?: TaskActionOptions): Promise<TaskActionResult<Completion>> {
  if (!isId(templateId)) return noId();
  const day = input?.day;
  const cleanDay = day === "yesterday" || day === "today" || (typeof day === "string" && DAY_KEY_RE.test(day)) ? day : "today";
  return run("completeTask", opts, (userId) =>
    completeInstanceCore(userId, templateId, {
      day: cleanDay,
      minutes: typeof input?.minutes === "number" ? input.minutes : null,
      mvv: input?.mvv === true,
    })
  );
}

/** Undoes a tick within ten minutes, on the same day. Nets to zero. */
export async function undoCompletion(instanceId: string, opts?: TaskActionOptions): Promise<TaskActionResult<{ instanceId: string; xp: number }>> {
  if (!isId(instanceId)) return noId();
  return run("undoCompletion", opts, (userId) => undoCompletionCore(userId, instanceId));
}

/** The capture toast's Undo: takes a capture back within ten minutes. */
export async function undoCapture(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<null>> {
  if (!isId(templateId)) return noId();
  return run("undoCapture", opts, (userId) => undoCaptureCore(userId, templateId));
}

/** Skips today's occurrence of a repeating, non-compulsory task. 0 XP; its streak holds. */
export async function skipTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<null>> {
  if (!isId(templateId)) return noId();
  return run("skipTask", opts, (userId) => skipCore(userId, templateId));
}

/** The same habit once more today. */
export async function againTask(templateId: string, input?: Pick<CompleteTaskInput, "minutes" | "mvv">, opts?: TaskActionOptions): Promise<TaskActionResult<Completion>> {
  if (!isId(templateId)) return noId();
  return run("againTask", opts, (userId) =>
    againCore(userId, templateId, {
      minutes: typeof input?.minutes === "number" ? input.minutes : null,
      mvv: input?.mvv === true,
    })
  );
}

/** Moves a one-off to tomorrow or a given day; on a repeating task, 'tomorrow' skips today. */
export async function rescheduleTask(templateId: string, to: "tomorrow" | DayKey, opts?: TaskActionOptions): Promise<TaskActionResult<{ dueDay: DayKey } | null>> {
  if (!isId(templateId)) return noId();
  if (typeof to !== "string") return { ok: false, error: "Pick a day." };
  return run("rescheduleTask", opts, (userId) => rescheduleCore(userId, templateId, to));
}

/** Archives a task. Nothing with history is ever deleted. */
export async function archiveTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<null>> {
  if (!isId(templateId)) return noId();
  return run("archiveTask", opts, (userId) => archiveCore(userId, templateId));
}

/** Brings back an archived (or dropped) task, history and streak intact: the Undo for Archive and Drop. */
export async function unarchiveTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<null>> {
  if (!isId(templateId)) return noId();
  return run("unarchiveTask", opts, (userId) => unarchiveCore(userId, templateId));
}

/** The player's own daily capacity in minutes (clamped 30..960, to 5). Until it is set, the tile's figure is a default. */
export async function setDailyCapacity(minutes: number, opts?: TaskActionOptions): Promise<TaskActionResult<{ minutes: number }>> {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return { ok: false, error: "Pick a number of minutes." };
  return run("setDailyCapacity", opts, (userId) => setDailyCapacityCore(userId, minutes));
}

const INBOX_CHOICES: readonly InboxChoice[] = ["today", "tomorrow", "anytime", "goal", "idea", "drop"];

/** One-tap clarify for an inbox item: Today / Tomorrow / Anytime / Goal ^ / Idea / Drop. */
export async function clarifyInbox(
  templateId: string,
  choice: InboxChoice,
  parentId?: string | null,
  opts?: TaskActionOptions
): Promise<TaskActionResult<{ href: string | null }>> {
  if (!isId(templateId)) return noId();
  if (!INBOX_CHOICES.includes(choice)) return { ok: false, error: "Unknown choice." };
  return run("clarifyInbox", opts, (userId) => clarifyInboxCore(userId, templateId, choice, isId(parentId) ? parentId : null));
}

/**
 * '+1' (or +n) on a goal measured by hand. Progress only goes up. Pass a
 * fresh `opId` per tap: a tap that reaches the server twice then counts once.
 */
export async function goalProgress(
  templateId: string,
  qty?: number,
  opts?: TaskActionOptions & { opId?: string }
): Promise<TaskActionResult<{ qty: number }>> {
  if (!isId(templateId)) return noId();
  const opId = typeof opts?.opId === "string" ? opts.opId : null;
  return run("goalProgress", opts, (userId) => goalProgressCore(userId, templateId, typeof qty === "number" ? qty : 1, new Date(), opId));
}

/** Renames a task; its grade and repeat-decay group stay. */
export async function renameTask(templateId: string, title: string, opts?: TaskActionOptions): Promise<TaskActionResult<{ title: string }>> {
  if (!isId(templateId)) return noId();
  if (typeof title !== "string") return { ok: false, error: "A task needs a title." };
  return run("renameTask", opts, (userId) => renameCore(userId, templateId, title));
}

/**
 * 'Resize': asks the AI to size the task again. One retry, only before the
 * grade freezes, and it counts toward the day's sizing cap (life-sizing.ts
 * enforces the cap). Runs inline, since the player is waiting on the answer;
 * the model call is bounded at a few seconds and a failure keeps the grade.
 */
export async function resizeTask(templateId: string, opts?: TaskActionOptions): Promise<TaskActionResult<{ outcome: string }>> {
  if (!isId(templateId)) return noId();
  return run("resizeTask", opts, async (userId) => {
    const allowed = await resizableCore(userId, templateId);
    if (!allowed.ok) return allowed;
    const outcome = await applySizing(templateId, { force: true });
    switch (outcome) {
      case "sized":
      case "copied":
        return { ok: true, value: { outcome } };
      case "failed":
      case "error":
        return { ok: false, error: "The AI didn't answer. The size stays as it was." };
      case "capped":
        return { ok: false, error: "Today's AI sizing limit is reached. Try again tomorrow, or self-rate it." };
      case "renamed":
        return { ok: false, error: "A renamed task keeps its size. Self-rate it instead." };
      case "done":
        return { ok: false, error: "This isn't something that gets sized." };
      default:
        return { ok: false, error: "The size is frozen now. Self-rate it instead." };
    }
  });
}

/** Self-rating: clamped to at most one band above the machine's, at least INTRO; once a week after the first completion. */
export async function setBandOverride(templateId: string, override: number, opts?: TaskActionOptions): Promise<TaskActionResult<{ bandOverride: number }>> {
  if (!isId(templateId)) return noId();
  if (typeof override !== "number" || !Number.isFinite(override)) return { ok: false, error: "Pick a size." };
  return run("setBandOverride", opts, (userId) => setBandOverrideCore(userId, templateId, override));
}
