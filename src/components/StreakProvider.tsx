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
 * This feeds scoring: SessionCard sends it as `combo` and `reviewReward`
 * turns it into up to a +50% multiplier. What the *next* value should be is
 * no longer decided here — a wrong answer doesn't necessarily zero it
 * (COMBO_ANCHOR can retain a fraction), so `applyReviewResult` computes
 * `nextCombo` server-side and this provider just stores whatever it's told.
 * It remains client state for the same reason `SubmitReviewInput.combo`
 * remains a documented, bounded exception to server authority — see that
 * comment for why grading itself never left the server.
 */
export function StreakProvider({
  children,
  /**
   * Rendered after `children`, at the bottom of the shell — the loadout bar.
   *
   * A named slot rather than just another child, and that distinction turned
   * out to matter: a Suspense-wrapped Server Component placed as a bare
   * sibling after `{children}` here rendered its HTML but never hydrated, so
   * the bar's buttons were inert on every route. Passed as a prop — the same
   * shape `AppNav` already uses for `titleSlot`, which does hydrate — it
   * works. Keeping both slots on the one pattern means there is one way to
   * hang server content off this shell, not two.
   */
  bottomSlot,
}: {
  children: ReactNode;
  bottomSlot?: ReactNode;
}) {
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const recordResult = useCallback((next: number) => {
    setStreak(next);
    setBest((b) => Math.max(b, next));
  }, []);

  return (
    <StreakContext.Provider value={{ streak, best, recordResult }}>
      {children}
      {bottomSlot}
    </StreakContext.Provider>
  );
}

export function useStreak(): StreakContextValue {
  const ctx = useContext(StreakContext);
  if (!ctx) throw new Error("useStreak must be used within StreakProvider");
  return ctx;
}
