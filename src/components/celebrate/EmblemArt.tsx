"use client";

/**
 * L3-celebrate — an emblem's coin for a curtain or a Moments row, drawn from
 * its code alone (Replay, or an unlock whose caller staged no art). Loaded
 * lazily by AscensionCurtain and MomentArt, so the skill pool never ships
 * in the shell's bundle. SkillLogo's palette is untouched; the rim is the
 * rank's material (EmblemCoin).
 */
import { EmblemCoin } from "@/components/ui/Crest";
import { SkillLogo } from "@/components/skills/SkillLogo";
import { depthOf } from "@/lib/skill-form";
import { getSkill } from "@/lib/skill-pool";

export function EmblemArt({ code, size = 168, label }: { code: string; size?: number; label?: string }) {
  const skill = getSkill(code);
  if (!skill) return null;
  return (
    <EmblemCoin rank={skill.rank} depth={depthOf(skill)} size={size} label={label}>
      <SkillLogo skill={skill} size={Math.round(size * 0.5)} animated={false} />
    </EmblemCoin>
  );
}

export default EmblemArt;
