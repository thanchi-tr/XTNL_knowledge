"use client";

/**
 * FROZEN CONTRACT — useLastSeen(key, value) → the value this viewer saw last time, or null.
 *
 * Rings, meters and number tickers animate from the LAST-SEEN value, never
 * from 0 and never on every visit: the first render returns null (so the
 * server and the first client render agree, and nothing moves on arrival),
 * then, after mount, the previous value from localStorage is returned once
 * and the current one is stored for next time. Equal values return null.
 */
import { useEffect, useState } from "react";

const PREFIX = "xtnl:seen:";

export function useLastSeen(key: string, value: number): number | null {
  const [seen, setSeen] = useState<number | null>(null);
  useEffect(() => {
    let prev: number | null = null;
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw !== null && raw !== "" && Number.isFinite(Number(raw))) prev = Number(raw);
      window.localStorage.setItem(PREFIX + key, String(value));
    } catch {
      prev = null;
    }
    // A stored last-seen value is an external system; syncing it into state after mount is the point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(prev !== null && prev !== value ? prev : null);
  }, [key, value]);
  return seen;
}
