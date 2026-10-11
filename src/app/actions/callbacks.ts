"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import type { CallBackInput, CallBackView } from "@/lib/callbacks";
import {
  archiveCallBackCore,
  clearReminderCore,
  restoreCallBackCore,
  restoreReminderCore,
  saveCallBackCore,
  type CallBackResult,
  type ReminderSnapshot,
} from "@/lib/callbacks-server";

/**
 * A work tab's call backs (src/lib/callbacks.ts holds the rules, callbacks-server.ts the cores): add or edit
 * from the sheet, archive and its Undo, and 'Done' on an open reminder and its Undo. Each never throws and
 * answers `{ ok, value } | { ok, error }`; `refresh: true` re-renders the work tab in the same response, so the
 * card, the call-back task in the lanes and the bell follow at once.
 */

export interface CallBackActionOptions {
  refresh?: boolean;
}

async function run<T>(label: string, opts: CallBackActionOptions | undefined, fn: (userId: string) => Promise<CallBackResult<T>>): Promise<CallBackResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** Adds a call back to a work tab (`id` null) or edits one. */
export async function saveCallBack(boardId: string, id: string | null, input: CallBackInput, opts?: CallBackActionOptions): Promise<CallBackResult<CallBackView>> {
  if (typeof boardId !== "string" || (id !== null && typeof id !== "string")) return { ok: false, error: "That call back no longer exists." };
  return run("saveCallBack", opts, (userId) => saveCallBackCore(userId, boardId, id, input));
}

/** Archives a call back: its reminder goes quiet, its task stays on the board. */
export async function archiveCallBack(id: string, opts?: CallBackActionOptions): Promise<CallBackResult<{ id: string }>> {
  if (typeof id !== "string") return { ok: false, error: "That call back no longer exists." };
  return run("archiveCallBack", opts, (userId) => archiveCallBackCore(userId, id));
}

/** Archive's Undo. */
export async function restoreCallBack(id: string, opts?: CallBackActionOptions): Promise<CallBackResult<{ id: string }>> {
  if (typeof id !== "string") return { ok: false, error: "That call back no longer exists." };
  return run("restoreCallBack", opts, (userId) => restoreCallBackCore(userId, id));
}

/** 'Done' on an open reminder: the reminder goes, the call back stays. Answers what it cleared, for the Undo. */
export async function clearCallBackReminder(id: string, opts?: CallBackActionOptions): Promise<CallBackResult<ReminderSnapshot>> {
  if (typeof id !== "string") return { ok: false, error: "That call back no longer exists." };
  return run("clearCallBackReminder", opts, (userId) => clearReminderCore(userId, id));
}

/** The Undo of 'Done': the same reminder back, its sent stamp too (it never fires twice). */
export async function restoreCallBackReminder(id: string, snapshot: ReminderSnapshot, opts?: CallBackActionOptions): Promise<CallBackResult<{ id: string }>> {
  if (typeof id !== "string") return { ok: false, error: "That call back no longer exists." };
  return run("restoreCallBackReminder", opts, (userId) => restoreReminderCore(userId, id, snapshot));
}
