"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { goodsList, goodsPlus, type RunTown } from "@/lib/town/pulse-core";

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
  /** What the run sends the player's town (lib/town/pulse-core runTown); null when there is no town to speak for. */
  town?: RunTown | null;
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
  town = null,
}: Props) {
  const total = correct + incorrect;
  // Something to take to town: then the town is where the session sends you.
  const deliver = !!town && (town.passes > 0 || town.carts.length > 0 || town.reqs.length > 0);
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

      {deliver && (
        <div
          className="mt-5 w-full max-w-sm px-3 py-2.5 text-left"
          style={{ borderRadius: 10, background: "var(--sub)", border: "1px solid var(--line)", fontSize: 12, lineHeight: 1.55, color: "var(--ink-1)" }}
        >
          <p className="label-xs mb-1">For your town</p>
          {town.passes > 0 && (
            <p>
              <span style={{ color: "var(--ink-0)" }}>
                {town.approx ? "≈ " : ""}
                {goodsPlus(town.goods)}
              </span>{" "}
              <span style={{ color: "var(--ink-2)" }}>
                from {town.passes} right answer{town.passes === 1 ? "" : "s"}
              </span>
            </p>
          )}
          {town.carts.map((c) => (
            <p key={c.field}>
              {c.field} cleared → {c.rarity} cart ({c.streak}-day streak): {goodsList(c.goods)}
            </p>
          ))}
          {town.reqs.map((r) => (
            <p key={r.field}>
              Requisition filled: {r.field} {r.need}/{r.need} → {goodsList(r.reward)}
            </p>
          ))}
        </div>
      )}

      {deliver ? (
        <>
          <Link href="/town" className="btn-primary mt-8">
            Deliver to your town →
          </Link>
          <button type="button" onClick={onDone} className="btn-secondary mt-3">
            Back to Review
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onDone} className="btn-primary mt-8">
            Back to Review
          </button>
          {/* No pulse on this device: the answers still count, and a town
              founded here today is paid for them when it first reads. */}
          {!town && correct > 0 && (
            <Link href="/town" className="mt-3 no-underline" style={{ fontSize: 11, color: "var(--ink-2)" }}>
              Right answers send goods to a town. Found your town to receive them →
            </Link>
          )}
        </>
      )}
    </motion.div>
  );
}
