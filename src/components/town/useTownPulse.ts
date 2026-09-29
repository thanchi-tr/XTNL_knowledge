"use client";

import { useSyncExternalStore } from "react";
import {
  PULSE_EVENT,
  PULSE_KEY,
  PULSE_STALE_MS,
  SINCE_KEY,
  dayKey,
  parsePulse,
  parseSince,
  withSince,
  type PulseView,
  type TownPulse,
} from "@/lib/town/pulse-core";

/**
 * The town's pulse (lib/town/pulse-core), for any component outside the town.
 *
 * Read from localStorage after mount, never on the server: the server
 * snapshot is null, so the first paint matches and the town lines appear once
 * the page is live. Updates when another tab writes (the 'storage' event),
 * when this tab writes (PULSE_EVENT), and once a minute so "stale" and the day
 * turn over on their own. Null when there is no pulse, or it is malformed or
 * of another version: every town line then simply does not render.
 */
export function useTownPulse(): PulseView | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PULSE_KEY || e.key === SINCE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PULSE_EVENT, onChange);
  const tick = window.setInterval(onChange, 60_000);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PULSE_EVENT, onChange);
    window.clearInterval(tick);
  };
}

const serverSnapshot = () => null;

// The snapshot must be the same object until something in it changes, or
// React re-renders forever; the pulse is parsed only when its text changes.
let parsed: { raw: string; since: string; pulse: TownPulse | null } = { raw: "", since: "", pulse: null };
let view: PulseView | null = null;

function snapshot(): PulseView | null {
  let raw = "";
  let since = "";
  try {
    raw = localStorage.getItem(PULSE_KEY) ?? "";
    since = localStorage.getItem(SINCE_KEY) ?? "";
  } catch {
    /* storage blocked: no pulse */
  }
  if (raw !== parsed.raw || since !== parsed.since) {
    const base = parsePulse(raw);
    parsed = { raw, since, pulse: base && withSince(base, parseSince(since)) };
  }
  const pulse = parsed.pulse;
  if (!pulse) return (view = null);
  const stale = Date.now() - pulse.at > PULSE_STALE_MS;
  const today = dayKey();
  if (!view || view.pulse !== pulse || view.stale !== stale || view.today !== today) view = { pulse, stale, today };
  return view;
}
