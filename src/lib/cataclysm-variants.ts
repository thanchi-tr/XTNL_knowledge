import { ATTRIBUTES } from "./attributes";
import { depthOf } from "./skill-form";
import type { Skill } from "./skill-pool";

/**
 * Which page-scale attach event an emblem fires, and which variant of it.
 *
 * Deliberately a plain module rather than living in `Cataclysm.tsx`. That
 * file is `"use client"`, and a function exported from a client module is
 * only a *reference* on the server — the preview page calls these while
 * rendering, which failed outright with "attempted to call
 * meteorVariantFor() from the server". Pure selection logic that both sides
 * need has to sit outside the client boundary.
 *
 * Assignment is keyed to the emblem's attribute rather than randomised, for
 * the same reason the geometry is deterministic: the same emblem must always
 * arrive the same way, or there is nothing to learn. Grouping by attribute
 * also gives the twelve Ultimates of one attribute a shared identity, the
 * way their emblems already share a silhouette.
 */

export type CataclysmTier = "collapse" | "meteor" | "bloom" | "shimmer" | "none";

/**
 * The ladder is 15 rungs and only the top three earn a full-screen event;
 * below that the slot burst and the bar charge already say enough. d11 and
 * d12 fold into `shimmer` rather than being left blank — a dead gap between
 * the mid-tiers and the bloom reads as a bug, not as restraint.
 */
export function tierForDepth(depth: number): CataclysmTier {
  if (depth >= 15) return "collapse";
  if (depth === 14) return "meteor";
  if (depth === 13) return "bloom";
  if (depth >= 5) return "shimmer";
  return "none";
}

export function tierForSkill(skill: Skill): CataclysmTier {
  return tierForDepth(depthOf(skill));
}

export const METEOR_VARIANTS = ["rain", "comet", "starfall", "shards", "embers", "bolts"] as const;
export const COLLAPSE_VARIANTS = ["hole", "nova", "rift", "eclipse", "pulsar", "implosion"] as const;
export type MeteorVariant = (typeof METEOR_VARIANTS)[number];
export type CollapseVariant = (typeof COLLAPSE_VARIANTS)[number];

/**
 * Six per tier rather than three.
 *
 * At three, the tier still repeated every fourth emblem. Six halves that,
 * and forces each variant to justify itself: any two must differ in *kind*
 * — direction, motion, or what is actually happening — never only in colour
 * or scale. A variant that is a recolour of another is worse than not
 * having it, because it teaches the player the distinction is meaningless.
 *
 * Thirteen attributes over six variants does not divide evenly, so the
 * spread is 3/2/2/2/2/2. Accepted deliberately: forcing evenness would mean
 * breaking the one-attribute-one-variant rule, and a shared identity within
 * an attribute is worth more than a perfectly flat histogram.
 */
export function variantIndex(skill: Skill): number {
  const i = ATTRIBUTES.indexOf(skill.attributes[0]);
  return ((i % 6) + 6) % 6;
}

export function meteorVariantFor(skill: Skill): MeteorVariant {
  return METEOR_VARIANTS[variantIndex(skill)];
}

export function collapseVariantFor(skill: Skill): CollapseVariant {
  return COLLAPSE_VARIANTS[variantIndex(skill)];
}
