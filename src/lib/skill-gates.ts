import type { Attribute } from "@prisma/client";
import type { AttributeScores } from "./attributes";
import type { Skill, SkillEffect } from "./skill-pool";
import { worstByKind, type ActiveDebuffRow } from "./debuff-meta";
import { bestByKind, type ActiveBoonRow } from "./boon-meta";
import { DEFAULT_LAMBDA, COMBO_CAP } from "./xp";

/**
 * The pure half of the progression system: what an unlocked skill *does*,
 * and whether a given skill's gates are currently satisfied.
 *
 * Split from `skill-effects.ts` for the same reason `xp.ts` is split from
 * `srs.ts` — this half has no database dependency, and the skills page's
 * tree view needs to evaluate gates for all 478 skills in the browser.
 * Passing precomputed blockers down from the server instead would mean
 * shipping a few hundred kilobytes of RSC payload on every page load to
 * duplicate arithmetic the client can do for free.
 *
 * Two rules govern the fold:
 *
 * 1. Unlocking is permanent, activity is not. A skill stays owned once
 *    bought, but only applies while its requirements are still met —
 *    dismantling the Fields that earned it turns it dormant rather than
 *    refunding it. Ownership is a receipt; power is a current state.
 *
 * 2. Effects take the BEST value per kind, never the sum. Tiers are
 *    prerequisite-chained, so owning tier V means owning I–IV as well;
 *    summing would silently multiply a lineage's intended magnitude by
 *    five, and every published number in the UI would be a lie.
 */

export interface ActiveModifiers {
  reviewYieldMultiplier: number;
  lambda: number;
  wardCharges: number;
  graceExtraDays: number;
  intervalMultiplier: number;
  comboCap: number;
  comboRetained: number;
  masteryMultiplier: number;
  extraStrikes: number;
  yieldFloorFraction: number;
  dedupThresholdDelta: number;
  streakMultiplier: number;
  resonancePercent: number;
  /** Debuff-only (DOUBT) — a flat percentage taken off every attribute score. Never set by a skill. */
  attributePenaltyPercent: number;
}

export const NEUTRAL_MODIFIERS: ActiveModifiers = {
  reviewYieldMultiplier: 1,
  lambda: DEFAULT_LAMBDA,
  wardCharges: 0,
  graceExtraDays: 0,
  intervalMultiplier: 1,
  comboCap: COMBO_CAP,
  comboRetained: 0,
  masteryMultiplier: 1,
  extraStrikes: 0,
  yieldFloorFraction: 0,
  dedupThresholdDelta: 0,
  streakMultiplier: 1,
  resonancePercent: 0,
  attributePenaltyPercent: 0,
};

export function foldEffects(skills: Skill[]): ActiveModifiers {
  const m: ActiveModifiers = { ...NEUTRAL_MODIFIERS };
  for (const s of skills) {
    const e = s.effect;
    switch (e.kind) {
      case "REVIEW_YIELD":
        m.reviewYieldMultiplier = Math.max(m.reviewYieldMultiplier, e.multiplier);
        break;
      case "DECAY_RESISTANCE":
        // Lower lambda is stronger, so this one minimises.
        m.lambda = Math.min(m.lambda, e.lambda);
        break;
      case "DEGRADATION_WARD":
        m.wardCharges = Math.max(m.wardCharges, e.weeklyCharges);
        break;
      case "GRACE_EXTENSION":
        m.graceExtraDays = Math.max(m.graceExtraDays, e.extraDays);
        break;
      case "INTERVAL_DILATION":
        m.intervalMultiplier = Math.max(m.intervalMultiplier, e.multiplier);
        break;
      case "COMBO_CEILING":
        m.comboCap = Math.max(m.comboCap, COMBO_CAP + e.extraSteps);
        break;
      case "COMBO_ANCHOR":
        m.comboRetained = Math.max(m.comboRetained, e.retained);
        break;
      case "MASTERY_YIELD":
        m.masteryMultiplier = Math.max(m.masteryMultiplier, e.multiplier);
        break;
      case "STRIKE_TOLERANCE":
        m.extraStrikes = Math.max(m.extraStrikes, e.extraStrikes);
        break;
      case "YIELD_FLOOR":
        m.yieldFloorFraction = Math.max(m.yieldFloorFraction, e.fractionOfBase);
        break;
      case "DEDUP_PRECISION":
        m.dedupThresholdDelta = Math.max(m.dedupThresholdDelta, e.thresholdDelta);
        break;
      case "STREAK_AMPLIFIER":
        m.streakMultiplier = Math.max(m.streakMultiplier, e.multiplier);
        break;
      case "RESONANCE":
        m.resonancePercent = Math.max(m.resonancePercent, e.percent);
        break;
    }
  }
  return m;
}

/**
 * Applies active debuffs on top of an already-folded skill modifier set.
 *
 * Deliberately applied *after* `foldEffects`, not merged into it: a debuff
 * should reduce the buffed state you actually have, so a player with strong
 * skills still ends up ahead of one without them while Shaken. Each kind
 * hooks the same real engine line its skill counterpart does.
 */
export function foldDebuffs(base: ActiveModifiers, debuffs: ActiveDebuffRow[]): ActiveModifiers {
  const worst = worstByKind(debuffs);
  const m: ActiveModifiers = { ...base };

  if (worst.SHAKEN) {
    m.reviewYieldMultiplier = m.reviewYieldMultiplier * (1 - worst.SHAKEN);
  }
  if (worst.FATIGUED) {
    m.comboCap = Math.max(0, Math.floor(m.comboCap * (1 - worst.FATIGUED)));
  }
  if (worst.DOUBT) {
    m.attributePenaltyPercent = worst.DOUBT;
  }

  return m;
}

/**
 * Folds temporary boons (Boss spoils) on top of the skill baseline.
 *
 * Applied before debuffs, so a player who is both Shaken and carrying
 * Insight ends up between the two rather than having one silently erase
 * the other. Boons stack with skills by taking the better value per hook,
 * the same rule `foldEffects` uses — never summing.
 */
export function foldBoons(base: ActiveModifiers, boons: ActiveBoonRow[]): ActiveModifiers {
  const best = bestByKind(boons);
  const m: ActiveModifiers = { ...base };

  if (best.INSIGHT) {
    m.reviewYieldMultiplier = m.reviewYieldMultiplier * (1 + best.INSIGHT);
  }
  if (best.MOMENTUM) {
    m.comboCap = m.comboCap + Math.round(best.MOMENTUM);
  }
  if (best.FOCUS) {
    m.extraStrikes = m.extraStrikes + Math.round(best.FOCUS);
  }
  if (best.CLARITY) {
    m.graceExtraDays = m.graceExtraDays + Math.round(best.CLARITY);
  }

  return m;
}

/**
 * The single multiplier applied to a raw attribute score before it is
 * compared against any requirement — RESONANCE up, DOUBT down. Exported so
 * the UI shows the same number the gate actually uses.
 */
export function effectiveScoreFactor(resonancePercent = 0, attributePenaltyPercent = 0): number {
  return (1 + resonancePercent / 100) * (1 - attributePenaltyPercent / 100);
}

/**
 * Both gates an ULTIMATE carries are checked here, not just the primary
 * one: its own attributes must clear `requiredScore`, and every entry in
 * `breadthRequirement` — attributes it does *not* train — must clear its
 * own lesser bar. So dismantling the breadth Fields makes an Ultimate go
 * dormant exactly the way dismantling its primary Field would, which is
 * the whole point of gating it on breadth in the first place.
 */
export function meetsRequirements(
  skill: Skill,
  scores: AttributeScores,
  resonancePercent = 0,
  attributePenaltyPercent = 0
): boolean {
  const factor = effectiveScoreFactor(resonancePercent, attributePenaltyPercent);
  const primary = skill.attributes.every((a: Attribute) => scores[a] * factor >= skill.requiredScore);
  if (!primary) return false;
  return (skill.breadthRequirement ?? []).every((b) => scores[b.attribute] * factor >= b.requiredScore);
}

/**
 * Which owned, active DEGRADATION_WARD skill absorbs the weekly-use counter
 * when more than one is owned. `foldEffects` only keeps the strongest
 * numeric value, not which skill produced it — this resolves that
 * deterministically (highest charge count, then tier, then code) so
 * `srs.ts` knows exactly which `UnlockedSkill` row to bump.
 */
export type WardSkill = Skill & { effect: Extract<SkillEffect, { kind: "DEGRADATION_WARD" }> };

export function resolveWardAnchor(activeSkills: Skill[]): WardSkill | undefined {
  const wardSkills = activeSkills.filter((s): s is WardSkill => s.effect.kind === "DEGRADATION_WARD");
  if (wardSkills.length === 0) return undefined;

  return [...wardSkills].sort(
    (a, b) => b.effect.weeklyCharges - a.effect.weeklyCharges || b.tier - a.tier || a.code.localeCompare(b.code)
  )[0];
}

export type UnlockBlocker =
  | { reason: "ALREADY_OWNED" }
  | { reason: "PREREQUISITE"; missing: string }
  | { reason: "ATTRIBUTE"; attribute: Attribute; have: number; need: number }
  /** Distinct from ATTRIBUTE: an attribute this skill does NOT train, demanded as breadth (ULTIMATE only). */
  | { reason: "BREADTH"; attribute: Attribute; have: number; need: number }
  | { reason: "MASTERY"; have: number; need: number };

/** Every unmet condition, so the UI can show the whole gap rather than the first hit. */
export function unlockBlockers(
  skill: Skill,
  scores: AttributeScores,
  ownedCodes: string[],
  masteryBalance: number,
  modifiers: Pick<ActiveModifiers, "resonancePercent" | "attributePenaltyPercent"> = NEUTRAL_MODIFIERS
): UnlockBlocker[] {
  const blockers: UnlockBlocker[] = [];

  if (ownedCodes.includes(skill.code)) {
    return [{ reason: "ALREADY_OWNED" }];
  }
  for (const prereq of skill.prerequisites) {
    if (!ownedCodes.includes(prereq)) {
      blockers.push({ reason: "PREREQUISITE", missing: prereq });
    }
  }

  const factor = effectiveScoreFactor(modifiers.resonancePercent, modifiers.attributePenaltyPercent);
  const scoreOf = (a: Attribute) => Math.round(scores[a] * factor * 100) / 100;

  for (const a of skill.attributes) {
    const have = scoreOf(a);
    if (have < skill.requiredScore) {
      blockers.push({ reason: "ATTRIBUTE", attribute: a, have, need: skill.requiredScore });
    }
  }

  for (const b of skill.breadthRequirement ?? []) {
    const have = scoreOf(b.attribute);
    if (have < b.requiredScore) {
      blockers.push({ reason: "BREADTH", attribute: b.attribute, have, need: b.requiredScore });
    }
  }

  if (masteryBalance < skill.masteryCost) {
    blockers.push({ reason: "MASTERY", have: masteryBalance, need: skill.masteryCost });
  }

  return blockers;
}
