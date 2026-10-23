"use client";

/**
 * A select that writes its pick on change without fighting the keyboard (the P5 review): the task drawer's Skill pick
 * (CompetencyLink) and You › Skills' roadmap picks (CompetencyBoard).
 *
 * - The select stays enabled while a pick is written (the caller marks its row aria-busy with `busy`): a focused
 *   control that becomes disabled loses focus, which threw a keyboard user out mid-choice.
 * - A pick is shown at once and written once it settles (PICK_SETTLE_MS): arrow keys on a closed select change it once
 *   for every option they pass, and only the last is the user's choice, so browsing the list writes once.
 * - Only the latest pick's reply counts (`latest()`), so a slower earlier reply never undoes a later pick.
 * - A pick still settling when the control unmounts (the drawer closed) is written then, never dropped.
 */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";

/** How long a pick rests before it is written. */
export const PICK_SETTLE_MS = 500;

/** Writes one pick; `latest()` is false once a later pick (or an unmount) made this one's reply stale. */
export type PickWriter = (key: string, value: string, latest: () => boolean) => Promise<void>;

export interface SettledPick {
  /** The value each key shows while its pick settles and is written; absent when none is in flight. */
  chosen: Readonly<Record<string, string>>;
  /** A pick: shown at once, written once it settles. */
  pick: (key: string, value: string) => void;
}

export function useSettledPick(write: PickWriter): SettledPick {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const writer = useRef(write);
  const seq = useRef(new Map<string, number>());
  const queued = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; value: string }>());

  useEffect(() => {
    writer.current = write;
  });

  // Unmounting with picks still settling: write them now (their replies have no control left to show).
  useEffect(() => {
    const waiting = queued.current;
    const numbers = seq.current;
    return () => {
      for (const [key, q] of waiting) {
        clearTimeout(q.timer);
        numbers.set(key, (numbers.get(key) ?? 0) + 1);
        void writer.current(key, q.value, () => false);
      }
      waiting.clear();
    };
  }, []);

  const run = useCallback(async (key: string, value: string, n: number) => {
    const latest = () => seq.current.get(key) === n;
    try {
      await writer.current(key, value, latest);
    } finally {
      // The written value is the one shown from now on (the caller's data, refreshed); a stale reply changes nothing.
      if (latest())
        startTransition(() =>
          setChosen((c) => {
            const next = { ...c };
            delete next[key];
            return next;
          })
        );
    }
  }, []);

  const pick = useCallback(
    (key: string, value: string) => {
      const n = (seq.current.get(key) ?? 0) + 1;
      seq.current.set(key, n);
      setChosen((c) => ({ ...c, [key]: value }));
      const q = queued.current.get(key);
      if (q) clearTimeout(q.timer);
      const timer = setTimeout(() => {
        queued.current.delete(key);
        void run(key, value, n);
      }, PICK_SETTLE_MS);
      queued.current.set(key, { timer, value });
    },
    [run]
  );

  return { chosen, pick };
}
