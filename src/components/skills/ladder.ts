/**
 * The Skills ladder, as data (pure: the page, the detail sheet and
 * scripts/you-check.ts share it).
 *
 *   requirementsOf(skill, ctx)   every requirement, met or not, with have / need
 *   unlockPercent(reqs)          the coin's "64%": the mean of each requirement's progress
 *   nodeState(skill, ctx)        owned | ready | locked
 *   buildLadder(attribute, ctx)  Ultimate → Pure, each rank with its material and nodes
 *   pathSummary(ctx)             per path: owned, total, ready (chips and the header)
 *   defaultPath(ctx)             the path /skills opens on
 *   readyEmblems(ctx)            every emblem that can be unlocked now, deepest first
 *
 * The gate itself is skill-gates.ts (unlockBlockers); this module only
 * describes it. `ready` here means exactly "unlockBlockers returns nothing",
 * so the ladder can never offer an unlock the server would refuse.
 */
import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, ATTRIBUTE_META, type AttributeScores } from "@/lib/attributes";
import { RANK_MATERIAL, emblemDepthMaterial, materialLabel, type Material } from "@/lib/materials";
import { depthOf } from "@/lib/skill-form";
import { effectiveScoreFactor, unlockBlockers, type ActiveModifiers } from "@/lib/skill-gates";
import { SKILL_POOL, getSkill, type Skill, type SkillRank } from "@/lib/skill-pool";
import { RANK_META } from "@/lib/skill-visuals";

export interface LadderContext {
  scores: AttributeScores;
  ownedCodes: readonly string[];
  /** Mastery points (MP) on hand. */
  balance: number;
  modifiers: Pick<ActiveModifiers, "resonancePercent" | "attributePenaltyPercent">;
}

export type NodeState = "owned" | "ready" | "locked";

export type RequirementKind = "attribute" | "breadth" | "prerequisite" | "mastery";

export interface Requirement {
  key: string;
  kind: RequirementKind;
  /** "Statistic 350", "Earlier emblems on its lineage", "1,200 MP". */
  label: string;
  /** What is measured, without the threshold ("Statistic"). */
  subject: string;
  have: number;
  need: number;
  met: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Every requirement of `skill`, in the order the gate checks them, met or not. */
export function requirementsOf(skill: Skill, ctx: LadderContext): Requirement[] {
  const factor = effectiveScoreFactor(ctx.modifiers.resonancePercent, ctx.modifiers.attributePenaltyPercent);
  const scoreOf = (a: Attribute) => round2(ctx.scores[a] * factor);
  const owned = new Set(ctx.ownedCodes);
  const out: Requirement[] = [];

  if (skill.prerequisites.length > 0) {
    const have = skill.prerequisites.filter((c) => owned.has(c)).length;
    const need = skill.prerequisites.length;
    const only = need === 1 ? getSkill(skill.prerequisites[0]) : undefined;
    out.push({
      key: "prereq",
      kind: "prerequisite",
      label: only ? only.name : `Earlier emblems on its lineage`,
      subject: "Earlier emblems",
      have,
      need,
      met: have >= need,
    });
  }
  for (const a of skill.attributes) {
    const have = scoreOf(a);
    out.push({
      key: `attr:${a}`,
      kind: "attribute",
      label: `${ATTRIBUTE_META[a].label} ${formatReq(skill.requiredScore)}`,
      subject: ATTRIBUTE_META[a].label,
      have,
      need: skill.requiredScore,
      met: have >= skill.requiredScore,
    });
  }
  for (const b of skill.breadthRequirement ?? []) {
    const have = scoreOf(b.attribute);
    out.push({
      key: `breadth:${b.attribute}`,
      kind: "breadth",
      label: `${ATTRIBUTE_META[b.attribute].label} ${formatReq(b.requiredScore)} (breadth)`,
      subject: ATTRIBUTE_META[b.attribute].label,
      have,
      need: b.requiredScore,
      met: have >= b.requiredScore,
    });
  }
  out.push({
    key: "mastery",
    kind: "mastery",
    label: `${formatReq(skill.masteryCost)} MP`,
    subject: "Mastery points",
    have: ctx.balance,
    need: skill.masteryCost,
    met: ctx.balance >= skill.masteryCost,
  });
  return out;
}

/** "350", "48.2", "1,200": requirement thresholds as the player reads them. */
export function formatReq(v: number): string {
  const dp = Number.isInteger(v) ? 0 : 1;
  return v.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/**
 * The coin's percentage: the mean of each requirement's own progress
 * (each capped at 100%). Never reads 100 while anything is unmet, so a
 * locked coin can't claim to be done.
 */
export function unlockPercent(reqs: readonly Requirement[]): number {
  if (reqs.length === 0) return 100;
  const mean = reqs.reduce((s, r) => s + (r.need > 0 ? Math.max(0, Math.min(1, r.have / r.need)) : 1), 0) / reqs.length;
  const pct = Math.floor(mean * 100);
  return reqs.every((r) => r.met) ? 100 : Math.min(99, pct);
}

export function nodeState(skill: Skill, ctx: LadderContext): NodeState {
  if (ctx.ownedCodes.includes(skill.code)) return "owned";
  return unlockBlockers(skill, ctx.scores, [...ctx.ownedCodes], ctx.balance, ctx.modifiers).length === 0 ? "ready" : "locked";
}

export interface LadderNode {
  skill: Skill;
  state: NodeState;
  depth: number;
  /** 0..100; 100 when owned or ready. */
  percent: number;
}

export interface LadderRank {
  rank: SkillRank;
  label: string;
  material: Material;
  /** "Gold · depth 14", "Silver · depth 9–13". */
  caption: string;
  owned: number;
  total: number;
  ready: number;
  /** Ready first, then locked by progress, then owned deepest first. */
  nodes: LadderNode[];
}

/** Top to bottom, the way the mockup reads: the rarest rank first. */
export const LADDER_RANKS: readonly SkillRank[] = ["ULTIMATE", "APEX", "CAPSTONE", "SYNERGY", "PURE"];

const STATE_ORDER: Record<NodeState, number> = { ready: 0, locked: 1, owned: 2 };

export function compareNodes(a: LadderNode, b: LadderNode): number {
  if (a.state !== b.state) return STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (a.state === "locked" && a.percent !== b.percent) return b.percent - a.percent;
  if (a.depth !== b.depth) return a.state === "owned" ? b.depth - a.depth : a.depth - b.depth;
  return a.skill.name.localeCompare(b.skill.name);
}

export function skillsOnPath(attribute: Attribute): Skill[] {
  return SKILL_POOL.filter((s) => s.attributes.includes(attribute));
}

export function ladderNode(skill: Skill, ctx: LadderContext): LadderNode {
  const state = nodeState(skill, ctx);
  return {
    skill,
    state,
    depth: depthOf(skill),
    percent: state === "locked" ? unlockPercent(requirementsOf(skill, ctx)) : 100,
  };
}

export function buildLadder(attribute: Attribute, ctx: LadderContext): LadderRank[] {
  const skills = skillsOnPath(attribute);
  return LADDER_RANKS.map((rank) => {
    const nodes = skills
      .filter((s) => s.rank === rank)
      .map((s) => ladderNode(s, ctx))
      .sort(compareNodes);
    const depths = nodes.map((n) => n.depth);
    const lo = Math.min(...depths);
    const hi = Math.max(...depths);
    const material = RANK_MATERIAL[rank];
    return {
      rank,
      label: RANK_META[rank].label,
      material,
      caption: nodes.length === 0 ? materialLabel(material) : `${materialLabel(material)} · depth ${lo === hi ? lo : `${lo}–${hi}`}`,
      owned: nodes.filter((n) => n.state === "owned").length,
      total: nodes.length,
      ready: nodes.filter((n) => n.state === "ready").length,
      nodes,
    };
  }).filter((r) => r.total > 0);
}

export interface PathSummary {
  attribute: Attribute;
  owned: number;
  total: number;
  ready: number;
  /** Deepest owned emblem on the path (0 when none): picks the header's sky. */
  deepest: number;
}

export function pathSummary(ctx: LadderContext): Record<Attribute, PathSummary> {
  const out = {} as Record<Attribute, PathSummary>;
  for (const a of ATTRIBUTES) out[a] = { attribute: a, owned: 0, total: 0, ready: 0, deepest: 0 };
  const owned = new Set(ctx.ownedCodes);
  for (const skill of SKILL_POOL) {
    const isOwned = owned.has(skill.code);
    const ready = !isOwned && nodeState(skill, ctx) === "ready";
    const depth = depthOf(skill);
    for (const a of skill.attributes) {
      const row = out[a];
      row.total += 1;
      if (isOwned) {
        row.owned += 1;
        row.deepest = Math.max(row.deepest, depth);
      } else if (ready) row.ready += 1;
    }
  }
  return out;
}

/** The path /skills opens on: the one with the most ready emblems, else the highest score. */
export function defaultPath(ctx: LadderContext, summary = pathSummary(ctx)): Attribute {
  let best: Attribute = ATTRIBUTES[0];
  for (const a of ATTRIBUTES) {
    const s = summary[a];
    const b = summary[best];
    if (s.ready > b.ready || (s.ready === b.ready && ctx.scores[a] > ctx.scores[best])) best = a;
  }
  return best;
}

/** Every emblem unlockable right now, deepest (rarest) first. */
export function readyEmblems(ctx: LadderContext): Skill[] {
  return SKILL_POOL.filter((s) => !ctx.ownedCodes.includes(s.code) && nodeState(s, ctx) === "ready").sort(
    (a, b) => depthOf(b) - depthOf(a) || b.masteryCost - a.masteryCost || a.name.localeCompare(b.name)
  );
}

/** The emblems an unlock opens (their only missing prerequisite was this one). */
export function opensAfter(skill: Skill, ownedCodes: readonly string[]): Skill[] {
  const owned = new Set([...ownedCodes, skill.code]);
  return SKILL_POOL.filter(
    (s) => !owned.has(s.code) && s.prerequisites.includes(skill.code) && s.prerequisites.every((p) => owned.has(p))
  );
}

/** Depth notches and their band, for captions ("depth 14 · gold notches"). */
export function depthMaterial(skill: Skill): Material {
  return emblemDepthMaterial(depthOf(skill));
}
