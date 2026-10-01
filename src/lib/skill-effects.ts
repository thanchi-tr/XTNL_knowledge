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
import { LOADOUT_SLOTS } from "./loadout";
import { effectiveFieldComposition } from "./attribute-inference";
import { loadFieldStreakBonuses } from "./field-streaks";
import { loadActiveDebuffs, type ActiveDebuffRow } from "./debuffs";
import { loadActiveBoons, type ActiveBoonRow } from "./boons";
import {
  foldEffects,
  foldDebuffs,
  foldBoons,
  attenuateModifiers,
  meetsRequirements,
  resolveWardAnchor,
  NEUTRAL_MODIFIERS,
  type ActiveModifiers,
} from "./skill-gates";
import { resolveResonance, foldSetGrants, type LoadoutResonance } from "./loadout-sets";
import { loadAugments, computeRate, type CapitalRate } from "./capital";
import { weekStartOf } from "./life-day";
import type { OwnedAugment } from "./augments";
import { loadLifeTracks } from "./life-tracks-server";

/**
 * The database half of the progression system: reads Field/streak/skill/
 * debuff state and resolves it into one `ActiveModifiers` the engine uses.
 *
 * The pure half — `foldEffects`, `unlockBlockers`, `meetsRequirements` and
 * friends — lives in `skill-gates.ts` so client components can evaluate
 * gates without pulling Prisma into the browser bundle. Everything is
 * re-exported here so existing server-side callers keep one import site.
 */

export { LOADOUT_SLOTS } from "./loadout";

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

export interface EquippedEntry {
  slot: number;
  skill: Skill;
  /** False when equipped but the attribute requirements are no longer met. */
  active: boolean;
}

export interface ProgressionState {
  scores: AttributeScores;
  ownedCodes: string[];
  /** Slot -> skill, for the loadout bar. Sparse; length is always LOADOUT_SLOTS. */
  loadout: (EquippedEntry | null)[];
  /** Equipped AND requirements met — the only skills that fold into `modifiers`. */
  activeSkills: Skill[];
  /** Equipped but requirements no longer met. */
  dormantSkills: Skill[];
  /** Owned but not equipped. Contributes nothing. */
  benchedSkills: Skill[];
  /** Which set shapes the active loadout satisfies, and the power that unlocks. */
  resonance: LoadoutResonance;
  modifiers: ActiveModifiers;
  /** Currently-active debuffs, so the UI can name what is dragging the numbers down. */
  debuffs: ActiveDebuffRow[];
  /** Currently-active boons — Boss spoils, and equally worth naming. */
  boons: ActiveBoonRow[];
  /** Permanent capital-bought upgrades on owned emblems. */
  augments: OwnedAugment[];
  /** Passive capital earned per hour by the active loadout. */
  capitalRate: CapitalRate;
}

/** One Field as the attribute scores read it: its level and effective composition. */
export interface FieldRow {
  id: string;
  name: string;
  level: number;
  composition: Composition;
}

/**
 * A Field contributes its *effective* composition — its own split blended
 * with what its Domains actually turned out to be about, weighted by the
 * points sitting in each (`effectiveFieldComposition`).
 *
 * Before this, the entire attribute substrate rested on the Field's name.
 * A Field called "Personal Skill" scored whatever that phrase happened to
 * match, no matter that every Domain under it was about statistics. Domain
 * and Idea attribution only *mean* something if they reach this function —
 * this is where automatic assignment stops being a stored label and starts
 * deciding which skills you can unlock.
 */
async function loadFieldRows(): Promise<FieldRow[]> {
  return cached("fieldRows", ["fields", "ideas"], async () => {
    const fields = await prisma.field.findMany({
      // One LATERAL JOIN instead of four sequential round trips. Without
      // this Prisma fetched Field, then FieldAttribute, then Domain, then
      // DomainAttribute as separate queries — four network hops for what is
      // one question, on every single page in the app.
      relationLoadStrategy: "join",
      select: {
        id: true,
        name: true,
        level: true,
        attributes: { select: { attribute: true, weight: true } },
        domains: {
          select: {
            totalPoints: true,
            attributes: { select: { attribute: true, weight: true } },
          },
        },
      },
    });

    return fields.map((f) => {
      const own = emptyComposition();
      for (const a of f.attributes) own[a.attribute] = a.weight;

      const domains = f.domains
        .filter((d) => d.attributes.length > 0)
        .map((d) => {
          const composition = emptyComposition();
          for (const a of d.attributes) composition[a.attribute] = a.weight;
          return { composition: composition as Composition, totalPoints: d.totalPoints };
        });

      return {
        id: f.id,
        name: f.name,
        level: f.level,
        composition: effectiveFieldComposition(own as Composition, domains),
      };
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
 *
 * M5: `lifeRows` (life-tracks.ts LifeContribution, 'Life · Body' at its
 * effectiveLevel) are appended after the Field rows, unamplified: the
 * streak multiplier (STREAK_AMPLIFIER / COVENANT) scales Field streak
 * bonuses only, and a life row's one multiplier is its own kept-week bonus,
 * already inside its level. With no life rows the scores are exactly the
 * pre-M5 ones (the same rows, in the same order).
 */
export function scoresWithStreak(
  rows: readonly FieldRow[],
  streakBonuses: Record<string, number>,
  streakMultiplier: number,
  lifeRows: readonly FieldContribution[] = []
): AttributeScores {
  const contributions: FieldContribution[] = rows.map((f) => {
    const bonusPercent = (streakBonuses[f.id] ?? 0) * streakMultiplier;
    return { fieldName: f.name, level: f.level * (1 + bonusPercent / 100), composition: f.composition };
  });
  return computeAttributeScores(lifeRows.length ? [...contributions, ...lifeRows] : contributions);
}

/**
 * The life tracks' attribute rows (M5). Empty before launch (the view is
 * the not-launched one), and empty when the read fails: a flaky life read
 * hides life for one cache window, it never takes progression (and every
 * page with it) down. The failure is logged.
 */
async function loadLifeRows(userId: string, now?: Date): Promise<FieldContribution[]> {
  try {
    const life = await loadLifeTracks(userId, now);
    return life.launched ? life.contributions : [];
  } catch (err) {
    console.error("[progression] life tracks read failed; attributes read Fields only", err);
    return [];
  }
}

/**
 * Raw attribute scores — streak bonus included at its base (1x, pre-STREAK_AMPLIFIER) strength, no RESONANCE applied.
 * Life rows included (M5), so the Seal's epithet (celebrations.ts) follows a PHYSICAL lead from Body.
 * Life is read with a fresh Date (M5 review C1): React cache() keys a Date by
 * identity, so the call never shares the page render's pre-judge memo; a
 * week judged in after() (and its band or title moment) reads the ledger the
 * judge just invalidated.
 */
export async function loadAttributeScores(userId: string): Promise<AttributeScores> {
  const [rows, streakBonuses, lifeRows] = await Promise.all([loadFieldRows(), loadFieldStreakBonuses(userId), loadLifeRows(userId, new Date())]);
  return scoresWithStreak(rows, streakBonuses, 1, lifeRows);
}

async function loadProgressionUncached(userId: string, now: Date): Promise<ProgressionState> {
  const [rows, streakBonuses, owned, debuffs, boons, augments, lifeRows] = await Promise.all([
    loadFieldRows(),
    loadFieldStreakBonuses(userId),
    prisma.unlockedSkill.findMany({ where: { userId }, select: { skillCode: true, equippedSlot: true } }),
    loadActiveDebuffs(userId, now),
    loadActiveBoons(userId, now),
    loadAugments(userId),
    loadLifeRows(userId, now),
  ]);

  const ownedSkills = owned
    .map((o) => getSkill(o.skillCode))
    .filter((s): s is Skill => s !== undefined);

  // Only equipped skills can contribute. Ownership is a receipt; a slot is
  // what makes an effect real.
  const slotOf = new Map<string, number>();
  for (const o of owned) {
    if (o.equippedSlot !== null && o.equippedSlot >= 0 && o.equippedSlot < LOADOUT_SLOTS) {
      slotOf.set(o.skillCode, o.equippedSlot);
    }
  }
  const equippedSkills = ownedSkills.filter((s) => slotOf.has(s.code));

  // Augment lookups, built once and shared by both folding passes.
  const amplified = new Set(augments.filter((a) => a.kind === "AMPLIFY").map((a) => a.skillCode));
  const grafted = new Set(augments.filter((a) => a.kind === "GRAFT").map((a) => a.skillCode));

  // Debuffs are independent of which skills are active, so their penalty is
  // resolved up front and applied in every pass below.
  const penalty = foldDebuffs(NEUTRAL_MODIFIERS, debuffs).attributePenaltyPercent;

  const baseScores = scoresWithStreak(rows, streakBonuses, 1, lifeRows);
  const firstPass = equippedSkills.filter((s) => meetsRequirements(s, baseScores, 0, penalty));
  // Attenuated on both passes. Gating on printed values and then paying out
  // attenuated ones would let a loadout unlock skills on strength it does
  // not actually have. Set grants are folded in here too — Focus and
  // Omniscient can grant RESONANCE on their own, with no individual skill
  // involved, and that has to reach the bootstrap or a loadout whose only
  // source of RESONANCE is a completed shape would gate as if it had none.
  const firstResonance = resolveResonance(firstPass);
  const firstFold = foldSetGrants(
    attenuateModifiers(foldEffects(firstPass, amplified, grafted), firstResonance.powerShare),
    firstResonance.sets
  );

  // The amplifier scales Field streaks only; the life rows ride along unamplified.
  const scores = scoresWithStreak(rows, streakBonuses, firstFold.streakMultiplier, lifeRows);
  const isActive = (s: Skill) => meetsRequirements(s, scores, firstFold.resonancePercent, penalty);
  const activeSkills = equippedSkills.filter(isActive);
  const dormantSkills = equippedSkills.filter((s) => !isActive(s));
  const benchedSkills = ownedSkills.filter((s) => !slotOf.has(s.code));

  const loadout: (EquippedEntry | null)[] = Array.from({ length: LOADOUT_SLOTS }, () => null);
  for (const skill of equippedSkills) {
    const slot = slotOf.get(skill.code)!;
    loadout[slot] = { slot, skill, active: isActive(skill) };
  }

  const resonance = resolveResonance(activeSkills);

  return {
    scores,
    ownedCodes: owned.map((o) => o.skillCode),
    loadout,
    activeSkills,
    dormantSkills,
    benchedSkills,
    resonance,
    // Order matters: skills are attenuated to what the loadout's coherence
    // actually realises, set grants land on top of that at full strength
    // (never attenuated by the powerShare they themselves produced — the
    // same reason boons sit outside the attenuation), then boons lift that,
    // then debuffs cut it. Applying debuffs last means a penalty bites the
    // state you actually have rather than being cancelled out by a fresh
    // buff.
    modifiers: foldDebuffs(
      foldBoons(foldSetGrants(attenuateModifiers(foldEffects(activeSkills, amplified, grafted), resonance.powerShare), resonance.sets), boons),
      debuffs
    ),
    debuffs,
    boons,
    augments,
    capitalRate: computeRate(activeSkills, augments),
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
  // second when one round trip costs ~816ms. 'life' (M5): the life tracks
  // feed the scores, so a tick, a judged week or a goal close recomputes
  // progression once; its inner loaders (field rows, streak bonuses,
  // augments) stay warm under their own keys.
  return cached(`progression:${userId}`, ["fields", "progress", "life"], () =>
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

// The life week (Monday 04:00 local, life-day.ts) — fixed rather than a
// rolling 7 days, so "N uses per week" means something consistent, and the
// same week the quota and the life system count in. `weekAnchor` is compared
// by equality, so moving the anchor from Monday 00:00 UTC refreshed every
// ward's charges once, in the player's favour.
function currentWeekAnchor(now: Date): Date {
  return weekStartOf(now);
}

/**
 * Attempts to spend one weekly charge of whichever owned, active
 * DEGRADATION_WARD skill `resolveWardAnchor` picks. Returns that skill on
 * success (caller must not degrade), or `undefined` if no ward is active or
 * its charges are exhausted for the current life week — caller proceeds with
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
