"use client";

import { motion } from "framer-motion";

interface Props {
  correct: number;
  incorrect: number;
  domainLevelUps: string[];
  /** Total points the server credited across the run. */
  pointsEarned: number;
  /** Previews of ideas that reached level 12 this run. */
  mastered: string[];
  /** Longest consecutive-correct run. */
  bestCombo: number;
  onDone: () => void;
}

/**
 * End-of-run report.
 *
 * Previously this showed accuracy and a list of levelled-up domains and
 * nothing else — the points you had just earned, the whole currency of the
 * system, went unmentioned. A session should close by stating what it was
 * worth.
 */
export function SessionComplete({
  correct,
  incorrect,
  domainLevelUps,
  pointsEarned,
  mastered,
  bestCombo,
  onDone,
}: Props) {
  const total = correct + incorrect;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const perfect = total > 0 && incorrect === 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="card flex flex-col items-center px-6 py-10 text-center"
    >
      <span className={`chip ${perfect ? "chip-green" : "chip-muted"}`}>
        {perfect ? "Clean sweep" : "Complete"}
      </span>

      {/* The headline is the payout. One decimal, not zero: the combo
          multiplier moves the total in tenths, and rounding to whole points
          hid the entire effect on a short run (2.0 + 2.1 + 2.2 showed as
          "+6", identical to the flat reward it replaced). */}
      <p
        className="mono mt-5"
        style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: "var(--green)" }}
      >
        +{pointsEarned.toFixed(1)}
      </p>
      <p className="label-xs mt-1.5">Points earned</p>
      {bestCombo >= 2 && (
        <p className="mt-1" style={{ fontSize: 11, color: "var(--ink-2)" }}>
          includes a {bestCombo}-answer combo bonus
        </p>
      )}

      <div
        className="mt-6 grid w-full max-w-sm grid-cols-3 gap-px overflow-hidden"
        style={{ background: "var(--line)", borderRadius: 10 }}
      >
        {[
          { label: "Correct", value: `${correct}/${total}` },
          { label: "Accuracy", value: `${accuracy}%` },
          { label: "Best run", value: String(bestCombo) },
        ].map((cell) => (
          <div key={cell.label} className="px-3 py-3" style={{ background: "var(--card)" }}>
            <p className="mono" style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-0)" }}>
              {cell.value}
            </p>
            <p className="label-xs mt-0.5">{cell.label}</p>
          </div>
        ))}
      </div>

      {mastered.length > 0 && (
        <div className="mt-5 w-full max-w-sm">
          <p className="label-xs mb-2">Mastered — level 12 reached</p>
          <ul className="space-y-1">
            {mastered.map((preview, i) => (
              <li
                key={`${preview}-${i}`}
                className="truncate px-3 py-1.5 text-left"
                style={{
                  fontSize: 12,
                  borderRadius: 8,
                  background: "var(--green-06)",
                  border: "1px solid rgba(0,204,122,0.20)",
                  color: "var(--ink-1)",
                }}
                title={preview}
              >
                {preview}
              </li>
            ))}
          </ul>
        </div>
      )}

      {domainLevelUps.length > 0 && (
        <div className="mt-5">
          <p className="label-xs mb-2">Domain level-ups</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {domainLevelUps.map((name, i) => (
              <span key={`${name}-${i}`} className="chip chip-green">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={onDone} className="btn-primary mt-8">
        Back to Review
      </button>
    </motion.div>
  );
}
