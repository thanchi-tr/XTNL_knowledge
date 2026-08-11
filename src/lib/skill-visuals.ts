import type { SkillRank } from "./skill-pool";

/**
 * One source of truth for how a rank *looks*, shared by SkillLogo,
 * SkillCard and SkillTree so a Capstone is the same violet in the emblem,
 * the card border, and the tree node. Colours mirror the `--rank-*` tokens
 * in globals.css; they are repeated as literals here because SVG `stroke`
 * and canvas-style computations cannot read CSS custom properties.
 */

export interface RankMeta {
  rank: SkillRank;
  label: string;
  color: string;
  /** Translucent fill for card backgrounds and aura halos. */
  wash: string;
  /** Ascending display weight — also the tree's column order. */
  order: number;
  /** One line on what this rank costs, for tooltips and legends. */
  blurb: string;
}

export const RANK_META: Record<SkillRank, RankMeta> = {
  PURE: {
    rank: "PURE",
    label: "Pure",
    color: "#5a7490",
    wash: "rgba(90,116,144,0.10)",
    order: 0,
    blurb: "One attribute, one archetype. Five tiers deep.",
  },
  SYNERGY: {
    rank: "SYNERGY",
    label: "Synergy",
    color: "#4d9cf5",
    wash: "rgba(77,156,245,0.10)",
    order: 1,
    blurb: "Two attributes held high at once.",
  },
  CAPSTONE: {
    rank: "CAPSTONE",
    label: "Capstone",
    color: "#9b6bff",
    wash: "rgba(155,107,255,0.12)",
    order: 2,
    blurb: "Two complete archetype paths, fused.",
  },
  APEX: {
    rank: "APEX",
    label: "Apex",
    color: "#f0a030",
    wash: "rgba(240,160,48,0.12)",
    order: 3,
    blurb: "Every lineage an attribute has, converged.",
  },
  ULTIMATE: {
    rank: "ULTIMATE",
    label: "Ultimate",
    color: "#ff5eb0",
    wash: "rgba(255,94,176,0.14)",
    order: 4,
    blurb: "The whole path, plus proven breadth in two unrelated attributes.",
  },
};

export const RANK_ORDER: SkillRank[] = (Object.keys(RANK_META) as SkillRank[]).sort(
  (a, b) => RANK_META[a].order - RANK_META[b].order
);
