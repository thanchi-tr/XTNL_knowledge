"use client";

import { needsOf, needsState, TIER_BLURB, TIER_WEIGHT, type Tier } from "@/lib/town/sim/needs";
import type { GameState } from "@/lib/town/sim/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** How a tier reads at a glance. */
function tone(t: Tier): "ok" | "warn" | "bad" | "shut" {
  if (t.gate < 0.35) return "shut";
  return t.sat >= 0.7 ? "ok" : t.sat >= 0.4 ? "warn" : "bad";
}

/**
 * The town's needs as a pyramid (sim/needs): survival at the base, purpose
 * at the peak. A tier only counts as far as the ones beneath it hold, so the
 * panel dims a tier the town cannot yet reach. Below it, the two slow stocks
 * the pyramid feeds: Wellbeing (what minds drift toward) and Foundations
 * (what long care has built, and pays back in everything).
 */
export function NeedsPanel({ s }: { s: GameState }) {
  const nd = needsOf(s);
  const st = needsState(s);
  const tiers = [...nd.tiers].reverse();
  return (
    <div className="tg-needs">
      <p className="town-kicker" style={{ marginTop: 12 }}>The town&apos;s needs</p>
      <div className="tg-pyramid" role="list" aria-label="Needs, from purpose at the top to survival at the base">
        {tiers.map((t, i) => {
          const k = tone(t);
          return (
            <details key={t.id} className={`tg-tier ${k}`} role="listitem" style={{ width: `${56 + i * 11}%` }}>
              <summary title={TIER_BLURB[t.id]}>
                <span className="tg-tier-name">{t.name}</span>
                <span className="tg-tier-bar" aria-hidden><i style={{ width: pct(t.sat) }} /></span>
                <b>{k === "shut" ? "—" : pct(t.sat)}</b>
              </summary>
              <p className="town-dim">{TIER_BLURB[t.id]}{t.gate < 0.95 ? ` It counts at ${pct(t.gate)} while the tiers below are short.` : ""} Weighs {pct(TIER_WEIGHT[t.id])} of the whole.</p>
              <ul>
                {t.parts.map((p) => (
                  <li key={p.id} className={p.sat < 0.4 ? "warn-text" : ""}>
                    <span>{p.label}</span>
                    <span className="tg-tier-bar sm" aria-hidden><i style={{ width: pct(p.sat) }} /></span>
                    <em>{p.note}</em>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      {nd.weakest && (
        <p className="tg-need-weak">
          <b>Weakest need:</b> {nd.weakest.part.label.toLowerCase()} ({nd.tiers.find((t) => t.id === nd.weakest!.tier)!.name.toLowerCase()}) — {nd.weakest.part.note}.
        </p>
      )}
      <div className="tg-stocks">
        <div>
          <span>Wellbeing</span>
          <span className="tg-tier-bar" aria-hidden><i style={{ width: pct(st.well) }} /></span>
          <b>{pct(st.well)}</b>
          <em>Follows the pyramid over a day or so. Minds drift toward it; the town breaks less and works better when it is high.</em>
        </div>
        <div>
          <span>Foundations</span>
          <span className="tg-tier-bar gold" aria-hidden><i style={{ width: pct(st.found) }} /></span>
          <b>{pct(st.found)}</b>
          <em>Built over days by reserves, households, rest, skill and study; up to a third more from everything, faster building, steadier minds. A starving town eats it.</em>
        </div>
      </div>
    </div>
  );
}
