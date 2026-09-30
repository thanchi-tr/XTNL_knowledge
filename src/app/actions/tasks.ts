"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { parseCapture, type CaptureSpan } from "@/lib/capture-parse";
import { todayKey, type DayKey } from "@/lib/life-day";
import { applySizing } from "@/lib/life-sizing";
import {
  againCore,
  archiveCore,
  clarifyInboxCore,
  completeInstanceCore,
  createTemplateCore,
  goalProgressCore,
  renameCore,
  rescheduleCore,
  resizableCore,
  setBandOverrideCore,
  skipCore,
  undoCaptureCore,
  undoCompletionCore,
  type Completion,
  type CreatedTask,
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

/** Accepts only what a span can be: a handful of non-negative integer pairs. */
function cleanSpans(spans: unknown): CaptureSpan[] {
  if (!Array.isArray(spans)) return [];
  return spans
    .slice(0, 50)
    .filter((s): s is CaptureSpan => !!s && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.end >= s.start)
    .map((s) => ({ start: s.start, end: s.end }));
}

const TEXT_MAX = 1000;

/**
 * Captures one line as a task. The server re-parses the text as the
 * authority (the chips the browser showed were a preview), writes the
 * template with its lexical grade in one insert, and sizes it with the AI
 * after the response: a model outage can slow the grade, never lose the
 * capture.
 */
export async function createTask(text: string, reverted?: CaptureSpan[], opts?: TaskActionOptions): Promise<TaskActionResult<CreatedTask>> {
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Type something to add." };
  const raw = text.slice(0, TEXT_MAX);
  return run("createTask", opts, async (userId) => {
    const parsed = parseCapture(raw, { today: todayKey(), reverted: cleanSpans(reverted) });
    if (!parsed.title.trim()) return { ok: false, error: "That line has no title left once its dates and tags are read." };
    const created = await createTemplateCore(userId, parsed, { rawText: raw, captureSource: "quick" });
    after(async () => {
      try {
        await applySizing(created.id);
      } catch (err) {
        console.error("Task sizing failed:", err);
      }
    });
    return { ok: true, value: created };
  });
}

export interface CompleteTaskInput {
  day?: "today" | "yesterday";
  slot?: number;
  minutes?: number | null;
  mvv?: boolean;
}

/** Ticks a task: today, or yesterday inside the record window. Pays exactly the projected price; a double tap pays once. */
export async function completeTask(templateId: string, input?: CompleteTaskInput, opts?: TaskActionOptions): Promise<TaskActionResult<Completion>> {
  if (!isId(templateId)) return noId();
  return run("completeTask", opts, (userId) =>
    completeInstanceCore(userId, templateId, {
      day: input?.day === "yesterday" ? "yesterday" : "today",
      slot: typeof input?.slot === "number" ? input.slot : 0,
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

/** '+1' (or +n) on a goal measured by hand. */
export async function goalProgress(templateId: string, qty?: number, opts?: TaskActionOptions): Promise<TaskActionResult<{ qty: number }>> {
  if (!isId(templateId)) return noId();
  return run("goalProgress", opts, (userId) => goalProgressCore(userId, templateId, typeof qty === "number" ? qty : 1));
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
