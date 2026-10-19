"use client";

/**
 * The Office workspace's shared client state (2026-10-20): what the work frame's header knows (the tab, its search
 * index) and the ONE scheduled task sheet it hosts. The header (WorkHeader.tsx, in the work layout, so it stays while
 * the pages under it change) publishes the context; the Agenda, a customer's page and the New menu open the sheet with
 * openScheduledSheet. A tiny external store (useSyncExternalStore), like shell-store.
 */
import { useSyncExternalStore } from "react";
import type { WorkIndex } from "@/lib/customer-search";
import { defaultWhenOf, whenInputOf, type ScheduledView } from "@/lib/scheduled-tasks";

/** The tab as the frame knows it. */
export interface WorkFrameBoard {
  id: string;
  name: string;
  crmOn: boolean;
  ordersOn: boolean;
}

export interface WorkContext {
  board: WorkFrameBoard | null;
  /** The search index the frame loaded with the workspace; null when its read failed (the search falls back to the server). */
  index: WorkIndex | null;
}

/** One opening of the sheet: the task it edits (null: a new one) and the customer a new one starts with. */
export interface SheetRequest {
  /** Bumped on every opening: the sheet's form remounts from it. */
  key: number;
  open: boolean;
  task: ScheduledView | null;
  customerId: string | null;
  /** The When field's start (a datetime-local value on the user's clock), read when the sheet was opened. */
  when: string;
}

interface State {
  ctx: WorkContext;
  sheet: SheetRequest | null;
}

let state: State = { ctx: { board: null, index: null }, sheet: null };
const listeners = new Set<() => void>();
let seq = 0;

function emit(next: State) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const SERVER: State = { ctx: { board: null, index: null }, sheet: null };

/** The header publishes the tab and its index (on mount, and whenever the frame re-renders with new ones). */
export function setWorkContext(ctx: WorkContext): void {
  if (state.ctx.board === ctx.board && state.ctx.index === ctx.index) return;
  emit({ ...state, ctx });
}

export function useWorkContext(): WorkContext {
  return useSyncExternalStore(subscribe, () => state.ctx, () => SERVER.ctx);
}

/** Opens the scheduled task sheet (from a tap): a new task (optionally for a customer), or `task` to edit. */
export function openScheduledSheet(req: { task?: ScheduledView | null; customerId?: string | null } = {}): void {
  seq += 1;
  const task = req.task ?? null;
  emit({ ...state, sheet: { key: seq, open: true, task, customerId: task?.customer?.id ?? req.customerId ?? null, when: task ? whenInputOf(task.dueAt) : defaultWhenOf(new Date()) } });
}

/** Closes it (its data stays, so it slides away before the next opening replaces it). */
export function closeScheduledSheet(): void {
  if (!state.sheet) return;
  emit({ ...state, sheet: { ...state.sheet, open: false } });
}

export function useScheduledSheet(): SheetRequest | null {
  return useSyncExternalStore(subscribe, () => state.sheet, () => SERVER.sheet);
}
