"use client";

import { useState } from "react";
import type { ActiveSet } from "@/lib/loadout-sets";

/**
 * Fires once, the first time this browser ever actually assembles a shape.
 *
 * Deliberately reactive rather than explanatory: nothing in the app tells a
 * player which emblems make a Triad or an Ascension beforehand. This is the
 * payoff for finding one — what it's called, what it concretely does, and
 * when it's worth keeping around — shown only after the fact, so discovery
 * stays something that happens to you rather than a checklist to follow.
 */

interface Props {
  queue: ActiveSet[];
  onDismiss: () => void;
}

export function ComboPopup({ queue, onDismiss }: Props) {
  const [index, setIndex] = useState(0);
  if (queue.length === 0) return null;

  const current = queue[Math.min(index, queue.length - 1)];
  const remaining = queue.length - index - 1;

  function next() {
    if (remaining <= 0) {
      setIndex(0);
      onDismiss();
    } else {
      setIndex((i) => i + 1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(2,5,8,.78)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="combo-popup-title"
    >
      <div
        className="card w-[min(94vw,420px)] p-5 boss-rise"
        style={{ borderColor: "rgba(0,204,122,.4)", background: "linear-gradient(160deg, rgba(0,204,122,.08), var(--card) 55%)" }}
      >
        <p className="label-xs" style={{ color: "var(--green)" }}>
          Combination discovered
        </p>
        <h2 id="combo-popup-title" className="mt-1" style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-0)" }}>
          {current.name}
        </h2>
        <p className="mt-1.5" style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {current.blurb}
        </p>

        <div className="mt-3 p-3" style={{ borderRadius: 10, background: "var(--sub)", border: "1px solid var(--line)" }}>
          <p className="label-xs">Grants</p>
          <p className="mt-1" style={{ fontSize: 13, fontWeight: 600, color: "var(--green)", lineHeight: 1.4 }}>
            {current.grant.effectText}
          </p>
        </div>

        <div className="mt-2.5 p-3" style={{ borderRadius: 10, background: "rgba(240,160,48,.08)", border: "1px solid rgba(240,160,48,.2)" }}>
          <p className="label-xs" style={{ color: "var(--amber)" }}>
            When to use it
          </p>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--ink-1)", lineHeight: 1.5 }}>
            {current.grant.tip}
          </p>
        </div>

        <p className="mt-3" style={{ fontSize: 10, color: "var(--ink-3)" }}>
          Saved to your combo codex — triple-click the Loadout label in the footer any time to review it.
        </p>

        <button type="button" className="btn-primary mt-3 w-full" onClick={next}>
          {remaining > 0 ? `Got it — next (${remaining} more)` : "Got it"}
        </button>
      </div>
    </div>
  );
}
