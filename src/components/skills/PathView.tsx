"use client";

/**
 * The graph view of one path (the SkillTree), one tap from the ladder
 * (?view=graph). The ladder is the default; the graph stays for the player
 * who wants the lineages drawn as the DAG they are. Its nodes are
 * keyboard-focusable, and its detail is a sheet below 1024 px and a side
 * panel from 1024.
 *
 * Gate evaluation happens in the browser from four small inputs (see
 * skill-gates.ts for why).
 */
import { useMemo } from "react";
import type { Attribute } from "@prisma/client";
import { SKILL_POOL, type Skill } from "@/lib/skill-pool";
import { meetsRequirements, unlockBlockers } from "@/lib/skill-gates";
import { SkillTree, type SkillStatus } from "./SkillTree";
import type { LadderContext } from "./ladder";

interface Props {
  attribute: Attribute;
  ctx: LadderContext;
  equippedByCode: Record<string, number>;
  masteryPerDay: number | null;
  scorePerDay: Record<string, number> | null;
}

export function PathView({ attribute, ctx, equippedByCode, masteryPerDay, scorePerDay }: Props) {
  const ownedSet = useMemo(() => new Set(ctx.ownedCodes), [ctx.ownedCodes]);
  const skills = useMemo(() => SKILL_POOL.filter((s) => s.attributes.includes(attribute)), [attribute]);

  const statusOf = useMemo(() => {
    const map = new Map<string, SkillStatus>();
    for (const skill of skills) {
      if (!ownedSet.has(skill.code)) continue;
      map.set(
        skill.code,
        meetsRequirements(skill, ctx.scores, ctx.modifiers.resonancePercent, ctx.modifiers.attributePenaltyPercent) ? "active" : "dormant"
      );
    }
    return (code: string): SkillStatus => map.get(code) ?? "locked";
  }, [skills, ownedSet, ctx]);

  const blockersOf = useMemo(
    () => (skill: Skill) => unlockBlockers(skill, ctx.scores, [...ctx.ownedCodes], ctx.balance, ctx.modifiers),
    [ctx]
  );

  return (
    <SkillTree
      attribute={attribute}
      skills={skills}
      statusOf={statusOf}
      blockersOf={blockersOf}
      ctx={ctx}
      equippedByCode={equippedByCode}
      masteryPerDay={masteryPerDay}
      scorePerDay={scorePerDay}
    />
  );
}
