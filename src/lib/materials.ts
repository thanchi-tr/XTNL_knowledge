/**
 * FROZEN CONTRACT (L0-foundation, redesign "Sigil & Slate").
 * Page lanes import from here; changes go through the lead.
 *
 *   type Material = "iron" | "bronze" | "silver" | "gold" | "astral"
 *   MATERIALS                      the ladder, low to high
 *   crestMaterial(level)           the character crest band (1–14 iron … 70+ astral)
 *   emblemDepthMaterial(depth)     emblem depth band (1–4 iron … 15 astral)
 *   medallionMaterial(level)       domain / field / track medallions (1–4 iron … 20+ astral)
 *   RANK_MATERIAL, rankMaterial()  skill rank → rim material (SkillLogo palettes untouched)
 *   MATERIAL_STOPS                 the three gradient stops per material (mirror of tokens.css)
 *   materialGradientId(m)          "m-iron" … the <linearGradient> ids in the icon sprite
 *   crestBandStarts                the levels at which the crest is re-forged (T3)
 *
 * Material says rarity, depth and band. It is drawn on shapes only: never as
 * text on a page surface and never as a status colour (tokens.css).
 * Pure and dependency-free, so server code, client code and the checks share it.
 */
import type { SkillRank } from "./skill-pool";

export type Material = "iron" | "bronze" | "silver" | "gold" | "astral";

export const MATERIALS: readonly Material[] = ["iron", "bronze", "silver", "gold", "astral"];

/** The first level of each crest band. A level that lands on one of these is a band re-forge (T3). */
export const crestBandStarts: Readonly<Record<Material, number>> = {
  iron: 1,
  bronze: 15,
  silver: 28,
  gold: 46,
  astral: 70,
};

/**
 * The character crest by level: 1–14 iron (Novice to Adept), 15–27 bronze
 * (Practitioner, Scholar), 28–45 silver (Savant, Master), 46–69 gold
 * (Grandmaster, Luminary), 70+ astral (Sage, Archon). A Transcendent rank
 * (an Ultimate owned) is astral whatever the level.
 */
export function crestMaterial(level: number, transcendent = false): Material {
  if (transcendent) return "astral";
  if (level >= crestBandStarts.astral) return "astral";
  if (level >= crestBandStarts.gold) return "gold";
  if (level >= crestBandStarts.silver) return "silver";
  if (level >= crestBandStarts.bronze) return "bronze";
  return "iron";
}

/** Emblem depth notches: 1–4 iron, 5–8 bronze, 9–12 silver, 13–14 gold, 15 astral. */
export function emblemDepthMaterial(depth: number): Material {
  if (depth >= 15) return "astral";
  if (depth >= 13) return "gold";
  if (depth >= 9) return "silver";
  if (depth >= 5) return "bronze";
  return "iron";
}

/** Domain, field and track medallions: 1–4 iron, 5–9 bronze, 10–14 silver, 15–19 gold, 20+ astral. */
export function medallionMaterial(level: number): Material {
  if (level >= 20) return "astral";
  if (level >= 15) return "gold";
  if (level >= 10) return "silver";
  if (level >= 5) return "bronze";
  return "iron";
}

/** Skill rank → the rim around its emblem. RANK_META colours (skill-visuals.ts) are untouched. */
export const RANK_MATERIAL: Readonly<Record<SkillRank, Material>> = {
  PURE: "iron",
  SYNERGY: "bronze",
  CAPSTONE: "silver",
  APEX: "gold",
  ULTIMATE: "astral",
};

export function rankMaterial(rank: SkillRank): Material {
  return RANK_MATERIAL[rank];
}

/** Top, middle and bottom stops (a / m / b in tokens.css). SVG needs literals. */
export const MATERIAL_STOPS: Readonly<Record<Material, readonly [string, string, string]>> = {
  iron: ["#c3c9d4", "#8a93a4", "#434a5a"],
  bronze: ["#f3c08f", "#c0834f", "#8a5530"],
  silver: ["#ffffff", "#c9d1de", "#7d889c"],
  gold: ["#fff0bd", "#f0c75e", "#c9901f"],
  astral: ["#d8f3ff", "#c7b5ff", "#ffd9ee"],
};

/** The id of the material's <linearGradient> in the icon sprite (ui/Icon.tsx). */
export function materialGradientId(m: Material): string {
  return `m-${m}`;
}

/** "Bronze" for a caption or a kicker. */
export function materialLabel(m: Material): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}
