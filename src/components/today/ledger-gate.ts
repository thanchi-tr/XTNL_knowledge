"use client";

/**
 * The order of a tick's feedback, in one place.
 *
 * A tick is Tier 0 in place (the check draws, "≈ 3.6" becomes "+3.6"), then
 * its "+3.6" token flies to the life-XP cell (or the top-bar MiniLedger);
 * only when it lands does the figure count up, and only then do the day's
 * Tier 1 moments show (the seal lights, a ring closes, a lane is stamped).
 *
 * The board registers the flight's promise here (holdLedger) in the tap's
 * own handler, before React re-renders; the ledger figure and the day's
 * snapshot wait on it (ledgerGate / useAfterFlight). Without a flight in the
 * air (a server refresh, an undo, Still) everything updates at once.
 */
import { useEffect, useState } from "react";
import type { CurrencyKind } from "@/lib/celebration-types";

const gates: Partial<Record<CurrencyKind, Promise<void>>> = {};

/** Registers the flight a ledger figure should wait for. The latest flight wins. */
export function holdLedger(kind: CurrencyKind, flight: Promise<void>): void {
  gates[kind] = flight;
  const clear = () => {
    if (gates[kind] === flight) delete gates[kind];
  };
  flight.then(clear, clear);
}

/** The flight still in the air for this ledger, or null. */
export function ledgerGate(kind: CurrencyKind): Promise<void> | null {
  return gates[kind] ?? null;
}

/**
 * `value`, held back while a flight to `kind` is in the air: the view shows
 * the old value until the token lands, then the new one. `key` identifies
 * the value's content (objects are rebuilt every render).
 */
export function useAfterFlight<T>(value: T, key: string, kind: CurrencyKind = "xp"): T {
  const [shown, setShown] = useState<{ key: string; value: T }>({ key, value });
  useEffect(() => {
    if (shown.key === key) return;
    let live = true;
    const next = { key, value };
    const apply = () => {
      if (live) setShown(next);
    };
    // Never synchronously: the gate's promise, or the next microtask.
    void (ledgerGate(kind) ?? Promise.resolve()).then(apply, apply);
    return () => {
      live = false;
    };
    // `value` travels with its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind]);
  return shown.key === key ? value : shown.value;
}
