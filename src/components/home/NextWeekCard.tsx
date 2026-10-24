"use client";

/**
 * The "Next week" card, wired (lib/week-calibration.ts; blueprint 5.2d, plan P32, decision D36): what the weekly
 * audit's frozen copy set for the week after it. Shown in the weekly review's step 5 (Monday to Wednesday, for the
 * week just begun) and on Today on Mondays; the server reads it (week-calibration-server loadNextWeek), the markup is
 * NextWeekBody's, and nothing here prices anything.
 *
 * Accept runs the change's own core (actions/calibration acceptCalibration: Settings' capacity, the drawer's 'Not a
 * must', which waits the akrasia horizon once Duty is live, or a habit made a must under the daily quests' cap) and
 * says what stands. Keep changes nothing: it is remembered for this viewer only (localStorage, every access in
 * try/catch, read through useSyncExternalStore so the server render never mismatches), so here the card reads "Kept as
 * it is." with a quiet Undo beside it, which takes the Keep back (the change is on offer again). A change that already
 * stands, by its own tap or another way, says so instead of offering itself again. Neutral words throughout (harm H12).
 */
import "./next-week.css";
import { useState, useSyncExternalStore, useTransition } from "react";
import { acceptCalibration } from "@/app/actions/calibration";
import { announce } from "@/lib/celebrate";
import { calibrationKeptKey, type NextWeekItem, type NextWeekView } from "@/lib/week-calibration";
import { KEPT_LINE, NextWeekBody } from "./NextWeekBody";

const OFFLINE = "Couldn't reach the server. Check the connection and try again.";

function readKept(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeKept(key: string, ids: readonly string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Storage blocked (a private window, site data off): the Keep holds until the page reloads.
  }
}

function idsOf(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function NextWeekCard({ view, title = "Next week", headingId = "nw-h" }: { view: NextWeekView; title?: string; headingId?: string }) {
  const keptKey = calibrationKeptKey(view.weekKey);
  const stored = useSyncExternalStore(subscribeStorage, () => readKept(keptKey), () => "");
  // This visit's Keeps (true) and Undos (false), over what storage says: the 'storage' event fires in other tabs only.
  const [keptNow, setKeptNow] = useState<Readonly<Record<string, boolean>>>({});
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept(item: NextWeekItem) {
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof acceptCalibration>>;
      try {
        res = await acceptCalibration(item.id, { refresh: true });
      } catch {
        res = { ok: false, error: OFFLINE };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const line = res.value.line;
      setDone((d) => ({ ...d, [item.id]: line }));
      announce(line);
    });
  }

  function keep(item: NextWeekItem) {
    setError(null);
    writeKept(keptKey, [...new Set([...idsOf(readKept(keptKey)), item.id])]);
    setKeptNow((k) => ({ ...k, [item.id]: true }));
    announce(KEPT_LINE);
  }

  function unkeep(item: NextWeekItem) {
    setError(null);
    writeKept(keptKey, idsOf(readKept(keptKey)).filter((id) => id !== item.id));
    setKeptNow((k) => ({ ...k, [item.id]: false }));
    announce("On offer again.");
  }

  const kept = new Set([...idsOf(stored), ...Object.keys(keptNow)].filter((id) => keptNow[id] ?? true));

  return (
    <NextWeekBody
      view={view}
      title={title}
      headingId={headingId}
      busy={pending}
      error={error}
      done={done}
      kept={kept}
      onAccept={accept}
      onKeep={keep}
      onUnkeep={unkeep}
    />
  );
}
