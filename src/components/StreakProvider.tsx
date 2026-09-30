"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface StreakContextValue {
  streak: number;
  best: number;
  /** Sets the combo to a server-computed value — see the comment below for why the server decides this now. */
  recordResult: (next: number) => void;
}

const StreakContext = createContext<StreakContextValue | null>(null);

/**
 * Session combo streak — consecutive correct answers in the current tab.
 * Not persisted, and resets on reload on purpose.
 *
 * The COMBO lives only in the review runner (redesign: the nav streak is the
 * DAY streak, shown on Today's Day ledger; the shell shows no combo). This
 * provider stays mounted around the page content so the runner can keep it
 * across its cards; L2 may move it into the runner outright.
 *
 * This feeds scoring: SessionCard sends it as `combo` and `reviewReward`
 * turns it into up to a +50% multiplier. What the *next* value should be is
 * decided server-side (`applyReviewResult` → `nextCombo`); this provider
 * just stores whatever it is told.
 */
export function StreakProvider({ children }: { children: ReactNode }) {
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const recordResult = useCallback((next: number) => {
    setStreak(next);
    setBest((b) => Math.max(b, next));
  }, []);

  return <StreakContext.Provider value={{ streak, best, recordResult }}>{children}</StreakContext.Provider>;
}

export function useStreak(): StreakContextValue {
  const ctx = useContext(StreakContext);
  if (!ctx) throw new Error("useStreak must be used within StreakProvider");
  return ctx;
}
