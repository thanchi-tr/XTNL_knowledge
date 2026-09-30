/**
 * FROZEN CONTRACT — the one toast queue behind <ToastDock/> (L0-foundation).
 *
 *   pushToast({ title?, body?, action?, holdMs?, ring? }) → id
 *   dismissToast(id)
 *   subscribeToasts(fn), getToasts()       (ToastDock reads these)
 *
 * One dock for the whole app: tabbar-h + 12 above the bottom on compact,
 * bottom-right 380 wide from 600. role=status, one action (Undo / OK), a
 * 4–10 s hold that pauses on hover or focus. `ring: true` carries a closing
 * mini PromiseRing, for a ring that closed off-screen (T1).
 */
import type { ReactNode } from "react";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastInput {
  /** Display 16 line ("Musts kept"). */
  title?: ReactNode;
  body?: ReactNode;
  action?: ToastAction;
  /** 4000–10000; clamped. Default 6000. */
  holdMs?: number;
  /** Carries a closing mini PromiseRing (34 px). */
  ring?: boolean;
  /** A stable key: pushing the same key replaces the toast instead of stacking. */
  key?: string;
}

export interface ToastItem extends ToastInput {
  id: number;
  holdMs: number;
}

const MIN_HOLD = 4000;
const MAX_HOLD = 10000;
/** At most this many at once; the oldest goes first. */
const MAX_VISIBLE = 3;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function clampHold(ms: number | undefined): number {
  return Math.max(MIN_HOLD, Math.min(MAX_HOLD, ms ?? 6000));
}

export function pushToast(input: ToastInput): number {
  const id = ++seq;
  const item: ToastItem = { ...input, id, holdMs: clampHold(input.holdMs) };
  const rest = input.key ? items.filter((t) => t.key !== input.key) : items;
  items = [...rest, item].slice(-MAX_VISIBLE);
  emit();
  return id;
}

export function dismissToast(id: number): void {
  const next = items.filter((t) => t.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function getToasts(): ToastItem[] {
  return items;
}

const EMPTY: ToastItem[] = [];
export function getServerToasts(): ToastItem[] {
  return EMPTY;
}

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
