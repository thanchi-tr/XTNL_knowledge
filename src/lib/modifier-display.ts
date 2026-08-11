import { NEUTRAL_MODIFIERS, type ActiveModifiers } from "./skill-gates";

/**
 * Turns the folded `ActiveModifiers` into the lines an inventory screen
 * shows: "what am I actually running right now."
 *
 * Only deviations from neutral are emitted. A loadout screen listing
 * thirteen rows of "no change" would bury the two that matter, and the
 * whole reason this view exists is that the numbers were previously
 * invisible — the engine used them, the player never saw them.
 *
 * Pure and DB-free, so the client can render it (see `skill-gates.ts` for
 * why that split exists).
 */

export interface ModifierLine {
  label: string;
  /** Formatted for display, sign included where it reads as a delta. */
  value: string;
  /** Where in the engine this actually lands — the honesty check on every buff. */
  hook: string;
  tone: "buff" | "debuff";
}

function pct(multiplier: number): string {
  const delta = Math.round((multiplier - 1) * 100);
  return `${delta >= 0 ? "+" : ""}${delta}%`;
}

export function describeModifiers(m: ActiveModifiers): ModifierLine[] {
  const lines: ModifierLine[] = [];
  const n = NEUTRAL_MODIFIERS;

  if (m.reviewYieldMultiplier !== n.reviewYieldMultiplier) {
    lines.push({
      label: "Review yield",
      value: pct(m.reviewYieldMultiplier),
      hook: "Points credited per passed review",
      tone: m.reviewYieldMultiplier >= 1 ? "buff" : "debuff",
    });
  }
  if (m.lambda !== n.lambda) {
    lines.push({
      label: "Saturation decay",
      value: `λ ${m.lambda.toFixed(2)}`,
      hook: `Down from ${n.lambda.toFixed(2)} — crowded domains keep paying`,
      tone: "buff",
    });
  }
  if (m.wardCharges > 0) {
    lines.push({
      label: "Degradation ward",
      value: m.wardCharges >= 99 ? "Sealed" : `${m.wardCharges}/week`,
      hook: "Absorbs a decay that would drop an idea a level",
      tone: "buff",
    });
  }
  if (m.graceExtraDays > 0) {
    lines.push({
      label: "Grace period",
      value: `+${m.graceExtraDays}d`,
      hook: "Longer before an unreviewed idea decays",
      tone: "buff",
    });
  }
  if (m.intervalMultiplier !== n.intervalMultiplier) {
    lines.push({
      label: "Review interval",
      value: pct(m.intervalMultiplier),
      hook: "Same retention, fewer sessions",
      tone: "buff",
    });
  }
  if (m.comboCap !== n.comboCap) {
    lines.push({
      label: "Combo ceiling",
      value: `${m.comboCap} answers`,
      hook: `Baseline ${n.comboCap} — caps the streak multiplier`,
      tone: m.comboCap >= n.comboCap ? "buff" : "debuff",
    });
  }
  if (m.comboRetained > 0) {
    lines.push({
      label: "Combo anchor",
      value: `${Math.round(m.comboRetained * 100)}% kept`,
      hook: "Retained on a wrong answer instead of resetting to zero",
      tone: "buff",
    });
  }
  if (m.masteryMultiplier !== n.masteryMultiplier) {
    lines.push({
      label: "Mastery yield",
      value: pct(m.masteryMultiplier),
      hook: "Mastery points minted, and the level-12 bonus",
      tone: "buff",
    });
  }
  if (m.extraStrikes > 0) {
    lines.push({
      label: "Strike tolerance",
      value: `+${m.extraStrikes}`,
      hook: "Extra misses before an idea degrades",
      tone: "buff",
    });
  }
  if (m.yieldFloorFraction > 0) {
    lines.push({
      label: "Yield floor",
      value: `${Math.round(m.yieldFloorFraction * 100)}% of base`,
      hook: "New ideas never pay below this, however saturated",
      tone: "buff",
    });
  }
  if (m.dedupThresholdDelta > 0) {
    lines.push({
      label: "Dedup precision",
      value: `+${(m.dedupThresholdDelta * 100).toFixed(1)}pp`,
      hook: "Fewer submissions silently auto-merged",
      tone: "buff",
    });
  }
  if (m.streakMultiplier !== n.streakMultiplier) {
    lines.push({
      label: "Streak amplifier",
      value: pct(m.streakMultiplier),
      hook: "Multiplies what a field streak is worth",
      tone: "buff",
    });
  }
  if (m.resonancePercent > 0) {
    lines.push({
      label: "Resonance",
      value: `+${m.resonancePercent}%`,
      hook: "Added to every attribute score",
      tone: "buff",
    });
  }
  if (m.attributePenaltyPercent > 0) {
    lines.push({
      label: "Doubt",
      value: `−${m.attributePenaltyPercent}%`,
      hook: "Taken off every attribute score",
      tone: "debuff",
    });
  }

  return lines;
}
