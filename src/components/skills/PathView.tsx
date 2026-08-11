"use client";

import { useMemo } from "react";
import type { Attribute } from "@prisma/client";
import { SKILL_POOL, type Skill } from "@/lib/skill-pool";
import { meetsRequirements, unlockBlockers, type ActiveModifiers } from "@/lib/skill-gates";
import { ATTRIBUTE_META, type AttributeScores } from "@/lib/attributes";
import { themeFor } from "@/lib/attribute-themes";
import { RANK_META, RANK_ORDER } from "@/lib/skill-visuals";
import { SkillTree } from "./SkillTree";
import type { SkillStatus } from "./SkillCard";

/**
 * One attribute's whole path, on its own page.
 *
 * Splitting the thirteen paths out of a single switcher is what makes them
 * feel like places rather than tabs: each gets its own URL, its own colour
 * (`attribute-themes.ts`), and its own header stating what this attribute
 * trains and how far along it you are. Gate evaluation still happens in the
 * browser from four small inputs — see `skill-gates.ts` for why.
 */

interface Props {
  attribute: Attribute;
  scores: AttributeScores;
  ownedCodes: string[];
  masteryBalance: number;
  modifiers: ActiveModifiers;
  masteryPerDay: number | null;
  scorePerDay: Record<string, number> | null;
}

export function PathView({
  attribute,
  scores,
  ownedCodes,
  masteryBalance,
  modifiers,
  masteryPerDay,
  scorePerDay,
}: Props) {
  const theme = themeFor(attribute);
  const meta = ATTRIBUTE_META[attribute];
  const ownedSet = useMemo(() => new Set(ownedCodes), [ownedCodes]);

  const skills = useMemo(() => SKILL_POOL.filter((s) => s.attributes.includes(attribute)), [attribute]);

  const statusByCode = useMemo(() => {
    const map = new Map<string, SkillStatus>();
    for (const skill of SKILL_POOL) {
      if (!ownedSet.has(skill.code)) continue;
      map.set(
        skill.code,
        meetsRequirements(skill, scores, modifiers.resonancePercent, modifiers.attributePenaltyPercent)
          ? "active"
          : "dormant"
      );
    }
    return map;
  }, [ownedSet, scores, modifiers]);

  const statusOf = useMemo(() => (code: string): SkillStatus => statusByCode.get(code) ?? "locked", [statusByCode]);
  const blockersOf = useMemo(
    () => (skill: Skill) => unlockBlockers(skill, scores, ownedCodes, masteryBalance, modifiers),
    [scores, ownedCodes, masteryBalance, modifiers]
  );

  const owned = skills.filter((s) => ownedSet.has(s.code)).length;
  const ready = skills.filter((s) => !ownedSet.has(s.code) && blockersOf(s).length === 0).length;
  const byRank = RANK_ORDER.map((rank) => ({
    rank,
    total: skills.filter((s) => s.rank === rank).length,
    owned: skills.filter((s) => s.rank === rank && ownedSet.has(s.code)).length,
  })).filter((r) => r.total > 0);

  return (
    <div className="space-y-4">
      {/* Path header — the page's identity, in this attribute's own colour. */}
      <header
        className="card relative overflow-hidden"
        style={{
          padding: "16px 18px",
          borderColor: `${theme.color}44`,
          background: `linear-gradient(150deg, ${theme.wash} 0%, transparent 55%), var(--card)`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64"
          style={{ background: `radial-gradient(circle, ${theme.color}22, transparent 70%)` }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <p className="section-eyebrow" style={{ color: theme.color }}>
              Path
            </p>
            <h1
              className="mt-1 text-[22px] font-bold tracking-tight"
              style={{ color: theme.bright, lineHeight: 1.15 }}
            >
              {meta.label}
            </h1>
            <p className="mt-1 max-w-lg" style={{ fontSize: 12, color: "var(--ink-2)" }}>
              {meta.blurb}
            </p>
          </div>

          <div className="flex shrink-0 items-end gap-6">
            <div>
              <p className="label-xs">Score</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 800, color: theme.color, lineHeight: 1.1 }}>
                {scores[attribute].toFixed(1)}
              </p>
            </div>
            <div>
              <p className="label-xs">Unlocked</p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)", lineHeight: 1.1 }}>
                {owned}
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>/{skills.length}</span>
              </p>
            </div>
            {ready > 0 && (
              <div>
                <p className="label-xs">Ready</p>
                <p className="mono" style={{ fontSize: 22, fontWeight: 800, color: "var(--green)", lineHeight: 1.1 }}>
                  {ready}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Per-rank completion — the funnel, as a set of bars. */}
        <div className="relative mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
          {byRank.map(({ rank, total, owned: rankOwned }) => (
            <div key={rank}>
              <div className="flex items-baseline justify-between gap-2">
                <span style={{ fontSize: 9.5, color: RANK_META[rank].color, fontWeight: 600 }}>
                  {RANK_META[rank].label}
                </span>
                <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                  {rankOwned}/{total}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden" style={{ borderRadius: 2, background: "var(--sub)" }}>
                <div
                  style={{
                    width: `${(rankOwned / total) * 100}%`,
                    height: "100%",
                    borderRadius: 2,
                    background: RANK_META[rank].color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </header>

      <SkillTree
        attribute={attribute}
        skills={skills}
        statusOf={statusOf}
        blockersOf={blockersOf}
        masteryBalance={masteryBalance}
        masteryPerDay={masteryPerDay}
        scorePerDay={scorePerDay}
      />
    </div>
  );
}
