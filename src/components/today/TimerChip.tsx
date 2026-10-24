"use client";

import { useEffect, useState } from "react";
import { timerLabelOf, type TimerView } from "@/lib/proof";
import { Icon } from "@/components/ui/Icon";

interface Props {
  /** The task's title, for the buttons' names ("Start the timer for Thesis chapter"). */
  title: string;
  /** The row's open timer (BoardRow.proof.timer): running, or stopped and waiting for its tick; null for none. */
  timer: TimerView | null;
  busy: boolean;
  /** Start, and Resume on a stopped timer (a new segment the tick counts with the earlier ones). */
  onStart: () => void;
  onStop: () => void;
  /** Discard a stopped timer: closed counting nothing, so the row is back to Start timer. Absent: no Discard. */
  onDiscard?: () => void;
}

/** How often a running timer's words move: a minute's figure needs no more. */
export const RUNNING_REFRESH_MS = 15_000;

/**
 * The clock a running timer's minutes are read against (the row's chip and the drawer's Done): `Date.now()`, moved
 * every 15 seconds while `running`, still otherwise. Nothing polls the server.
 */
export function useTimerClock(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), RUNNING_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [running]);
  return now;
}

/**
 * A proof row's timer (blueprint P23): "Start timer" on a row with none, "Timer 12 min · Stop" while it runs, and
 * "Timed 34 min" with Resume and Discard once stopped (its tick then counts it; Resume adds a segment after a break,
 * Discard drops a mis-tap so it counts nothing). The timer is a TaskSession row, so it survives a reload and another
 * device; only its words are drawn here, refreshed every 15 seconds while it runs (nothing polls the server). Every
 * control is a 44 px target (today.css .t-row .r-timer).
 */
export function TimerChip({ title, timer, busy, onStart, onStop, onDiscard }: Props) {
  const running = !!timer?.running;
  const now = useTimerClock(running);

  if (!timer) {
    return (
      <button type="button" className="r-act r-timer" onClick={onStart} disabled={busy} aria-label={`Start the timer for ${title}`}>
        <Icon name="clock" size={16} />
        Start timer
      </button>
    );
  }
  const label = timerLabelOf(timer, Math.max(now, Date.parse(timer.startedAt)));
  if (!running) {
    return (
      <>
        {/* Its words, then its two controls: three items that wrap one by one on a narrow row, never mid-label. */}
        <span className="r-timer r-timer-done" data-state="stopped">
          <Icon name="clock" size={16} />
          <span suppressHydrationWarning>{label}</span>
        </span>
        <button type="button" className="r-act r-timer" data-state="resume" onClick={onStart} disabled={busy} aria-label={`Resume the timer for ${title} (${label})`}>
          Resume
        </button>
        {onDiscard && (
          <button type="button" className="r-act r-timer" data-state="discard" onClick={onDiscard} disabled={busy} aria-label={`Discard the timer for ${title}`}>
            Discard
          </button>
        )}
      </>
    );
  }
  return (
    <button type="button" className="r-act r-timer" data-state="running" onClick={onStop} disabled={busy} aria-label={`Stop the timer for ${title}`}>
      <Icon name="clock" size={16} />
      <span suppressHydrationWarning>{label}</span>
      <span aria-hidden="true">· Stop</span>
    </button>
  );
}
