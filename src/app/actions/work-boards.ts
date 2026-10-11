"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { archiveWorkBoardCore, createWorkBoardCore, renameWorkBoardCore, restoreWorkBoardCore, type WorkBoardResult } from "@/lib/work-boards-server";
import type { WorkBoardRef } from "@/lib/work-boards";

/**
 * The work tabs' writes (src/lib/work-boards.ts holds the rules,
 * work-boards-server.ts the cores): add (the strip's '+'), rename and archive
 * (the work board's menu), restore (Settings › Work tabs). Each takes only an
 * id and a name, never throws, and answers `{ ok, value } | { ok, error }`.
 * `refresh: true` re-renders the current route in the same response, the
 * root layout included, so the strip's tabs (the shell's data) follow at once.
 */

export interface WorkBoardActionOptions {
  /** Re-render the current route (and the shell's tabs) in this response. */
  refresh?: boolean;
}

async function run<T>(label: string, opts: WorkBoardActionOptions | undefined, fn: (userId: string) => Promise<WorkBoardResult<T>>): Promise<WorkBoardResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

/** Adds a work tab named `name` in the lowest free slot; refused once three are open. */
export async function createWorkBoard(name: string, opts?: WorkBoardActionOptions): Promise<WorkBoardResult<WorkBoardRef>> {
  return run("createWorkBoard", opts, (userId) => createWorkBoardCore(userId, name));
}

/** Renames an open work tab (1..24 characters). */
export async function renameWorkBoard(boardId: string, name: string, opts?: WorkBoardActionOptions): Promise<WorkBoardResult<WorkBoardRef>> {
  return run("renameWorkBoard", opts, (userId) => renameWorkBoardCore(userId, boardId, name));
}

/** Archives a work tab: its slot frees at once, its tasks are kept; Settings restores it. */
export async function archiveWorkBoard(boardId: string, opts?: WorkBoardActionOptions): Promise<WorkBoardResult<{ id: string }>> {
  return run("archiveWorkBoard", opts, (userId) => archiveWorkBoardCore(userId, boardId));
}

/** Restores an archived work tab while a slot is free. */
export async function restoreWorkBoard(boardId: string, opts?: WorkBoardActionOptions): Promise<WorkBoardResult<WorkBoardRef>> {
  return run("restoreWorkBoard", opts, (userId) => restoreWorkBoardCore(userId, boardId));
}
