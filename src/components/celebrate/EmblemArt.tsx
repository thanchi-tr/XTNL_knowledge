"use client";

/**
 * L3-celebrate — an emblem's coin drawn from its code alone (a Moments row,
 * or anything that has only the code). One drawing of the emblem: it is
 * L4's CeremonyArt (EmblemCoin with the rank's material rim and depth
 * notches around SkillLogo, animated={false}), the same art the Ascension
 * curtain shows. Loaded lazily by MomentArt, so the skill pool never ships
 * in the shell's bundle.
 */
import { CeremonyArt } from "@/components/skills/ceremony-art";
import { depthOf } from "@/lib/skill-form";
import { getSkill } from "@/lib/skill-pool";

export function EmblemArt({ code, size = 168 }: { code: string; size?: number }) {
  const skill = getSkill(code);
  if (!skill) return null;
  return <CeremonyArt art={{ type: "emblem", code, rank: skill.rank, depth: depthOf(skill) }} size={size} />;
}

export default EmblemArt;
