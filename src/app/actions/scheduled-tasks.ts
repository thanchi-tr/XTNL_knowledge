"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import type { ScheduledTaskInput, ScheduledView } from "@/lib/scheduled-tasks";
import {
  archiveScheduledCore,
  createScheduledCore,
  doneScheduledCore,
  editScheduledCore,
  reopenScheduledCore,
  restoreScheduledCore,
  searchWorkCore,
  snoozeScheduledCore,
  type ScheduledResult,
} from "@/lib/scheduled-tasks-server";
import type { CustomerMatch, TaskMatch } from "@/lib/customer-search";

/**
 * A work tab's scheduled tasks (src/lib/scheduled-tasks.ts holds the rules, scheduled-tasks-server.ts the cores): add
 * and edit from the sheet, Done (optionally logged to the customer's history) and its Undo, Snooze, archive and its
 * Undo. Each never throws and answers `{ ok, value } | { ok, error }`; `refresh: true` re-renders the current route in
 * the same response (the agenda, the customer page, the work frame's search index and the bell follow at once).
 * Work, never the game: nothing here pays XP or writes the ledger.
 */

export interface ScheduledActionOptions {
  refresh?: boolean;
}

const UNSAVED = "Couldn't save that. Try again.";

async function run<T>(label: string, opts: ScheduledActionOptions | undefined, fn: (userId: string) => Promise<ScheduledResult<T>>): Promise<ScheduledResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: UNSAVED };
  }
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const GONE = { ok: false as const, error: "That scheduled task no longer exists." };

/** Schedules a task on a work tab. */
export async function createScheduledTask(boardId: string, input: ScheduledTaskInput, opts?: ScheduledActionOptions): Promise<ScheduledResult<ScheduledView>> {
  if (!isId(boardId)) return { ok: false, error: "That work tab no longer exists." };
  return run("createScheduledTask", opts, (userId) => createScheduledCore(userId, boardId, input));
}

/** Edits a scheduled task (moving its time arms its reminder again). */
export async function editScheduledTask(id: string, input: ScheduledTaskInput, opts?: ScheduledActionOptions): Promise<ScheduledResult<ScheduledView>> {
  if (!isId(id)) return GONE;
  return run("editScheduledTask", opts, (userId) => editScheduledCore(userId, id, input));
}

/** Done; with `log`, also an entry in the customer's history (the same transaction). Answers the entry for the Undo. */
export async function doneScheduledTask(id: string, log?: { action: string; brief: string } | null, opts?: ScheduledActionOptions): Promise<ScheduledResult<{ id: string; doneAt: string; interactionId: string | null }>> {
  if (!isId(id)) return GONE;
  return run("doneScheduledTask", opts, (userId) => doneScheduledCore(userId, id, { log: log ?? null }));
}

/** Done's Undo: open again, and the entry Done logged archived. */
export async function reopenScheduledTask(id: string, interactionId?: string | null, opts?: ScheduledActionOptions): Promise<ScheduledResult<{ id: string }>> {
  if (!isId(id)) return GONE;
  return run("reopenScheduledTask", opts, (userId) => reopenScheduledCore(userId, id, { interactionId: interactionId ?? null }));
}

/** Snooze to a preset: '10min' | 'hour' | 'evening' | 'tomorrow' | 'monday'. */
export async function snoozeScheduledTask(id: string, preset: string, opts?: ScheduledActionOptions): Promise<ScheduledResult<{ id: string; dueAt: string }>> {
  if (!isId(id)) return GONE;
  return run("snoozeScheduledTask", opts, (userId) => snoozeScheduledCore(userId, id, preset));
}

/** Archives a scheduled task (the toast offers Undo). */
export async function archiveScheduledTask(id: string, opts?: ScheduledActionOptions): Promise<ScheduledResult<{ id: string }>> {
  if (!isId(id)) return GONE;
  return run("archiveScheduledTask", opts, (userId) => archiveScheduledCore(userId, id));
}

/** Archive's Undo. */
export async function restoreScheduledTask(id: string, opts?: ScheduledActionOptions): Promise<ScheduledResult<{ id: string }>> {
  if (!isId(id)) return GONE;
  return run("restoreScheduledTask", opts, (userId) => restoreScheduledCore(userId, id));
}

/**
 * The work header's search on the server: ONLY when the browser has no index (its read failed). Typing never calls
 * it while the index is there (the browser matches on its own; scheduled-tasks-check pins it).
 */
export async function searchWorkFallback(boardId: string, q: string): Promise<ScheduledResult<{ customers: CustomerMatch[]; more: number; tasks: TaskMatch[] }>> {
  if (!isId(boardId)) return { ok: false, error: "That work tab no longer exists." };
  return run("searchWorkFallback", undefined, (userId) => searchWorkCore(userId, boardId, q));
}
