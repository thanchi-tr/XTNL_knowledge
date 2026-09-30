"use client";

/**
 * FROZEN CONTRACT — the shell's client state (L0-foundation).
 *
 *   useShell(select)            read: data (ShellData | null), title override, mini ledger, watch element
 *   setShellData(data)          ShellDataBridge only
 *   setShellTitle(t) → clear    <ShellTitle/> only
 *   setMiniLedger(v | null)     the page that owns the ledger cells (useMiniLedger in MiniLedger.tsx)
 *   setLedgerWatch(el | null)   ditto: the element whose scrolling away docks the MiniLedger
 */
import { useSyncExternalStore } from "react";
import type { ShellData } from "./shell-types";

export interface TitleOverride {
  eyebrow?: string | null;
  title: string;
}

export interface LedgerValues {
  /** Today's life XP. */
  xp: number;
  /** Today's review points. Never summed with xp. */
  pts: number;
}

export interface ShellState {
  data: ShellData | null;
  title: TitleOverride | null;
  ledger: LedgerValues | null;
  watch: Element | null;
}

let state: ShellState = { data: null, title: null, ledger: null, watch: null };
const listeners = new Set<() => void>();
const SERVER: ShellState = { data: null, title: null, ledger: null, watch: null };

function set(patch: Partial<ShellState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getShell(): ShellState {
  return state;
}

export function subscribeShell(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useShell<T>(select: (s: ShellState) => T): T {
  return useSyncExternalStore(
    subscribeShell,
    () => select(state),
    () => select(SERVER)
  );
}

export function setShellData(data: ShellData | null): void {
  set({ data });
}

let titleSeq = 0;
export function setShellTitle(t: TitleOverride): () => void {
  const mine = ++titleSeq;
  set({ title: t });
  return () => {
    if (mine === titleSeq) set({ title: null });
  };
}

export function setMiniLedger(v: LedgerValues | null): void {
  set({ ledger: v });
}

export function setLedgerWatch(el: Element | null): void {
  set({ watch: el });
}
