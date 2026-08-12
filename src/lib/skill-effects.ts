import { cache } from "react";
import { prisma } from "./prisma";
import { cached } from "./cache";
import {
  computeAttributeScores,
  type AttributeScores,
  type Composition,
  type FieldContribution,
  emptyComposition,
} from "./attributes";
import { getSkill, type Skill } from "./skill-pool";
import { loadFieldStreakBonuses } from "./field-streaks";
import { loadActiveDebuffs, type ActiveDebuffRow } from "./debuffs";
import { loadActiveBoons, type ActiveBoonRow } from "./boons";
import {
  foldEffects,
  foldDebuffs,
  foldBoons,
  meetsRequirements,
  resolveWardAnchor,
  NEUTRAL_MODIFIERS,
  type ActiveModifiers,
} from "./skill-gates";

/**
 * The database half of the progression system: reads Field/streak/skill/
 * debuff state and resolves it into one `ActiveModifiers` the engine uses.
 *
 * The pure half — `foldEffects`, `unlockBlockers`, `meetsRequirements` and
 * friends — lives in `skill-gates.ts` so client components can evaluate
 * gates without pulling Prisma into the browser bundle. Everything is
 * re-exported here so existing server-side callers keep one import site.
 */

export {
  foldEffects,
  foldDebuffs,
  effectiveScoreFactor,
  meetsRequirements,
  resolveWardAnchor,
  unlockBlockers,
  NEUTRAL_MODIFIERS,
  type ActiveModifiers,
  type UnlockBlocker,
  type WardSkill,
} from "./skill-gates";

export interface ProgressionState {
  scores: AttributeScores;
  ownedCodes: string[];
  activeSkills: Skill[];
  dormantSkills: Skill[];
  modifiers: ActiveModifiers;
  /** Currently-active debuffs, so the UI can name what is dragging the numbers down. */
  debuffs: ActiveDebuffRow[];
  /** Currently-active boons — Boss spoils, and equally worth naming. */
  boons: ActiveBoonRow[];
}

interface FieldRow {
  id: string;
  name: string;
  level: number;
  composition: Composition;
}

async function loadFieldRows(): Promise<FieldRow[]> {
  return cached("fieldRows", ["fields"], async () => {
    const fields = await prisma.field.findMany({
      select: { id: true, name: true, level: true, attributes: { select: { attribute: true, weight: true } } },
    });

    return fields.map((f) => {
      const composition = emptyComposition();
      for (const a of f.attributes) composition[a.attribute] = a.weight;
      return { id: f.id, name: f.name, level: f.level, composition: composition as Composition };
    });
  });
}

/**
 * Folds a Field's activity streak into its *effective level* before scoring
 * — a Field with a 30-day streak contributes as if it were several levels
 * higher, scaled by `streakMultiplier` (1 = the raw field-streaks.ts curve,
 * >1 once a STREAK_AMPLIFIER skill is active). Streak never touches
 * `composition`, so which attributes benefit is still entirely a function
 * of what the Field trains.
 */
function scoresWithStreak(
  rows: FieldRow[],
  streakBonuses: Record<string, number>,
  streakMultiplier: number
): AttributeScores {
  const contributions: FieldContribution[] = rows.map((f) => {
    const bonusPercent = (streakBonuses[f.id] ?? 0) * streakMultiplier;
    return { fieldName: f.name, level: f.level * (1 + bonusPercent / 100), composition: f.composition };
  });
  return computeAttributeScores(contributions);
}

/** Raw attribute scores — streak bonus included at its base (1x, pre-STREAK_AMPLIFIER) strength, no RESONANCE applied. */
export async function loadAttributeScores(userId: string): Promise<AttributeScores> {
  const [rows, streakBonuses] = await Promise.all([loadFieldRows(), loadFieldStreakBonuses(userId)]);
  return scoresWithStreak(rows, streakBonuses, 1);
}

async function loadProgressionUncached(userId: string, now: Date): Promise<ProgressionState> {
  const [rows, streakBonuses, owned, debuffs, boons] = await Promise.all([
    loadFieldRows(),
    loadFieldStreakBonuses(userId),
    prisma.unlockedSkill.findMany({ where: { userId }, select: { skillCode: true } }),
    loadActiveDebuffs(userId, now),
    loadActiveBoons(userId, now),
  ]);

  const ownedSkills = owned
    .map((o) => getSkill(o.skillCode))
    .filter((s): s is Skill => s !== undefined);

  // Debuffs are independent of which skills are active, so their penalty is
  // resolved up front and applied in every pass below.
  const penalty = foldDebuffs(NEUTRAL_MODIFIERS, debuffs).attributePenaltyPercent;

  const baseScores = scoresWithStreak(rows, streakBonuses, 1);
  const firstPass = ownedSkills.filter((s) => meetsRequirements(s, baseScores, 0, penalty));
  const firstFold = foldEffects(firstPass);

  const scores = scoresWithStreak(rows, streakBonuses, firstFold.streakMultiplier);
  const isActive = (s: Skill) => meetsRequirements(s, scores, firstFold.resonancePercent, penalty);
  const activeSkills = ownedSkills.filter(isActive);
  const dormantSkills = ownedSkills.filter((s) => !isActive(s));

  return {
    scores,
    ownedCodes: owned.map((o) => o.skillCode),
    activeSkills,
    dormantSkills,
    // Order matters: skills form the baseline, boons lift it, debuffs cut
    // it. Applying debuffs last means a penalty bites the state you
    // actually have rather than being cancelled out by a fresh buff.
    modifiers: foldDebuffs(foldBoons(foldEffects(activeSkills), boons), debuffs),
    debuffs,
    boons,
  };
}

/**
 * Everything the engine and UI need about progression, in one round trip.
 *
 * RESONANCE and STREAK_AMPLIFIER are both resolved in the same two-pass
 * bootstrap: fold once against base (1x) scores to discover which owned
 * skills are active, then re-fold attribute scores with the resonance
 * percent and streak multiplier that first pass produced. Deliberately not
 * iterated to a fixed point — no chain of Resonance/Amplifier skills can
 * bootstrap itself into unlocking further copies of the same kind.
 */
export const loadProgression = cache(async (userId: string): Promise<ProgressionState> => {
  // Two layers, doing different jobs. React `cache` dedupes within a single
  // render — the nav's title badge and the page body both want progression,
  // and without it every route paid for it twice. `cached` then holds the
  // result across requests, which is what actually gets a page under a
  // second when one round trip costs ~816ms.
  return cached(`progression:${userId}`, ["fields", "progress"], () =>
    loadProgressionUncached(userId, new Date())
  );
});

/** Bypasses both cache layers. For write paths that must not act on a stale balance or skill list. */
export function loadProgressionFresh(userId: string, now: Date = new Date()): Promise<ProgressionState> {
  return loadProgressionUncached(userId, now);
}

/** Modifiers alone — the hot path for the review engine. */
export async function loadModifiers(userId: string): Promise<ActiveModifiers> {
  return (await loadProgression(userId)).modifiers;
}

// ISO week (Monday 00:00 UTC) — arbitrary but fixed, so "N uses per week"
// means something consistent rather than a rolling 7 days. Carried over
// from the old skills.ts Shield implementation this replaces.
function currentWeekAnchor(now: Date): Date {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Attempts to spend one weekly charge of whichever owned, active
 * DEGRADATION_WARD skill `resolveWardAnchor` picks. Returns that skill on
 * success (caller must not degrade), or `undefined` if no ward is active or
 * its charges are exhausted for the current ISO week — caller proceeds with
 * the normal degradation.
 */
export async function tryConsumeWardCharge(
  userId: string,
  activeSkills: Skill[],
  now: Date = new Date()
): Promise<Skill | undefined> {
  const anchor = resolveWardAnchor(activeSkills);
  if (!anchor) return undefined;

  const weeklyCharges = anchor.effect.weeklyCharges;
  const weekAnchor = currentWeekAnchor(now);
  const existing = await prisma.unlockedSkill.findUnique({
    where: { userId_skillCode: { userId, skillCode: anchor.code } },
  });

  const usesThisWeek = existing && existing.weekAnchor.getTime() === weekAnchor.getTime() ? existing.usesThisWeek : 0;
  if (usesThisWeek >= weeklyCharges) return undefined;

  await prisma.unlockedSkill.upsert({
    where: { userId_skillCode: { userId, skillCode: anchor.code } },
    create: { userId, skillCode: anchor.code, usesThisWeek: 1, weekAnchor },
    update: { usesThisWeek: usesThisWeek + 1, weekAnchor },
  });

  return anchor;
}
