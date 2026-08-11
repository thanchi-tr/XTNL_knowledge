"use client";

import { motion } from "framer-motion";
import type { BossResolution } from "@/lib/bosses";
import { DEBUFF_META } from "@/lib/debuff-meta";

interface Props {
  resolution: BossResolution;
  onDone: () => void;
}

/**
 * The encounter's closing beat.
 *
 * A defeat is written to sting without discouraging: it names what the
 * debuff costs and when it lifts, and states the real accuracy against the
 * real bar, so the gap always looks closeable. Losing to a Boss in this app
 * still means you did a full session of genuine reviews — the screen says
 * so rather than pretending the time was wasted.
 */
export function BossResult({ resolution, onDone }: Props) {
  if (resolution.outcome === "rejected") {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="chip chip-muted mx-auto">Encounter void</p>
        <p className="mt-3" style={{ fontSize: 13, color: "var(--ink-1)" }}>
          {resolution.why}
        </p>
        <button type="button" onClick={onDone} className="btn-secondary mt-6">
          Back
        </button>
      </div>
    );
  }

  const victory = resolution.outcome === "victory";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`card flex flex-col items-center px-6 py-10 text-center ${victory ? "" : "boss-hit"}`}
      style={{
        borderColor: victory ? "rgba(240,160,48,0.45)" : "rgba(240,58,87,0.35)",
        background: victory
          ? "linear-gradient(160deg, rgba(240,160,48,0.10) 0%, transparent 60%), var(--card)"
          : "linear-gradient(160deg, rgba(240,58,87,0.08) 0%, transparent 60%), var(--card)",
      }}
    >
      <span className={`chip ${victory ? "chip-amber" : "chip-red"}`}>{victory ? "Victory" : "Defeat"}</span>

      {victory ? (
        <>
          <p className="rank-ascend mt-4 text-[20px] font-bold" style={{ color: "var(--amber)" }}>
            {resolution.defeated.name} falls
          </p>
          <p className="mono mt-4" style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: "var(--amber)" }}>
            +{resolution.masteryAwarded}
          </p>
          <p className="label-xs mt-1.5">Mastery earned</p>

          <p className="mt-5 max-w-sm" style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
            Something older takes its place. <strong style={{ color: "var(--ink-1)" }}>{resolution.nextBoss.name}</strong>{" "}
            waits at tier {resolution.newTier}.
          </p>
        </>
      ) : (
        <>
          <p className="mt-4 text-[18px] font-semibold" style={{ color: "var(--ink-0)" }}>
            It holds.
          </p>
          <p className="mt-3 max-w-sm" style={{ fontSize: 12.5, color: "var(--ink-1)", fontStyle: "italic", lineHeight: 1.6 }}>
            “{resolution.taunt}”
          </p>
          <p className="mt-4" style={{ fontSize: 11, color: "var(--red)" }}>
            {DEBUFF_META[resolution.debuff].label} — {DEBUFF_META[resolution.debuff].effectText(DEBUFF_META[resolution.debuff].defaultMagnitude)}
          </p>
        </>
      )}

      <div
        className="mt-6 grid w-full max-w-xs grid-cols-2 gap-px overflow-hidden"
        style={{ background: "var(--line)", borderRadius: 10 }}
      >
        <div className="px-3 py-3" style={{ background: "var(--card)" }}>
          <p className="mono" style={{ fontSize: 16, fontWeight: 700, color: victory ? "var(--green)" : "var(--red)" }}>
            {Math.round(resolution.accuracy * 100)}%
          </p>
          <p className="label-xs mt-0.5">Accuracy</p>
        </div>
        <div className="px-3 py-3" style={{ background: "var(--card)" }}>
          <p className="mono" style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>
            {Math.round(resolution.required * 100)}%
          </p>
          <p className="label-xs mt-0.5">Required</p>
        </div>
      </div>

      <p className="mt-4" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
        Every card in that encounter was a real review. The schedule moved regardless.
      </p>

      <button type="button" onClick={onDone} className="btn-primary mt-6">
        Return
      </button>
    </motion.div>
  );
}
