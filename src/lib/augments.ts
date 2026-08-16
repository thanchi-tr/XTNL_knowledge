import type { Skill } from "./skill-pool";
import { skinFor } from "./skill-form";

/**
 * Emblem augments — what capital actually buys.
 *
 * Capital is never spent on *new* emblems; mastery already does that, and
 * two currencies bidding for the same purchase is the "over-complicating
 * kills the fun" failure the gamification literature warns about. Capital
 * only ever deepens something you already own, which keeps the two economies
 * pointed at different decisions: mastery answers "what do I acquire next",
 * capital answers "what do I commit to".
 *
 * Four kinds, deliberately of different character rather than four sizes of
 * the same upgrade:
 *
 *   AMPLIFY  — the emblem does its own job harder.
 *   GRAFT    — the emblem gains a second job it never had.
 *   YIELD    — the emblem pays capital back, so money compounds.
 *   PRESTIGE — nothing mechanical; the mark visibly changes.
 *
 * PRESTIGE existing at all is the point: with three mechanical upgrades and
 * no cosmetic one, every purchase is an optimisation and the currency turns
 * into homework. A tier you buy purely because you want the emblem to look
 * like that is what keeps it feeling like a reward.
 *
 * Pure and DB-free so the skills page can price and preview augments without
 * pulling Prisma into the browser bundle — the same split `skill-gates.ts`
 * keeps from `skill-effects.ts`.
 */

export type AugmentKind = "AMPLIFY" | "GRAFT" | "YIELD" | "PRESTIGE";

export interface AugmentMeta {
  kind: AugmentKind;
  label: string;
  blurb: string;
  /** Plain statement of what it does, for the purchase card. */
  effectText: string;
  /** Multiplier on the emblem's base cost. */
  costFactor: number;
}

export const AUGMENT_META: Record<AugmentKind, AugmentMeta> = {
  AMPLIFY: {
    kind: "AMPLIFY",
    label: "Amplify",
    blurb: "The same effect, pushed past what the emblem prints.",
    effectText: "+35% to this emblem's own effect, above its printed value.",
    costFactor: 1,
  },
  GRAFT: {
    kind: "GRAFT",
    label: "Graft",
    blurb: "A second job, grafted onto a familiar mark.",
    effectText: "Adds a modest second effect drawn from the emblem's attribute.",
    costFactor: 1.8,
  },
  YIELD: {
    kind: "YIELD",
    label: "Yield",
    blurb: "The emblem starts paying for itself.",
    effectText: "This emblem contributes +60% more passive capital while equipped.",
    costFactor: 1.4,
  },
  PRESTIGE: {
    kind: "PRESTIGE",
    label: "Prestige",
    blurb: "Nothing changes but the mark. That is the whole point.",
    effectText: "Purely visual: a gilded form and a slower, heavier corona.",
    costFactor: 0.6,
  },
};

export const AUGMENT_KINDS = Object.keys(AUGMENT_META) as AugmentKind[];

/** How much AMPLIFY lifts the emblem's delta from neutral. */
export const AMPLIFY_BONUS = 0.35;
/** How much a YIELD augment lifts that emblem's capital contribution. */
export const YIELD_BONUS = 0.6;

/**
 * Base price of augmenting one emblem, before the per-kind factor.
 *
 * Scales with the emblem's own depth on the 15-rung ladder, so deepening a
 * terminal Ultimate is a genuine commitment while a Tier I trinket stays
 * cheap enough to experiment with. Quadratic in charge for the same reason
 * the mastery curve is: linear pricing makes the top of the tree arrive too
 * fast to feel earned.
 */
export function augmentBaseCost(skill: Skill): number {
  const { charge } = skinFor(skill);
  return Math.round(40 + 460 * charge * charge);
}

export function augmentCost(skill: Skill, kind: AugmentKind): number {
  return Math.round(augmentBaseCost(skill) * AUGMENT_META[kind].costFactor);
}

export interface OwnedAugment {
  skillCode: string;
  kind: AugmentKind;
}

/** Index of what is augmented, for O(1) lookups while folding. */
export function augmentIndex(rows: OwnedAugment[]): Map<string, Set<AugmentKind>> {
  const index = new Map<string, Set<AugmentKind>>();
  for (const r of rows) {
    const set = index.get(r.skillCode) ?? new Set<AugmentKind>();
    set.add(r.kind);
    index.set(r.skillCode, set);
  }
  return index;
}

export function hasAugment(index: Map<string, Set<AugmentKind>>, skillCode: string, kind: AugmentKind): boolean {
  return index.get(skillCode)?.has(kind) === true;
}
