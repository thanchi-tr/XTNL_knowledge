"use client";

import { useMemo, useState } from "react";
import { SKILL_POOL, type Skill, type SkillRank } from "@/lib/skill-pool";
import { meetsRequirements, type ActiveModifiers } from "@/lib/skill-gates";
import { describeModifiers } from "@/lib/modifier-display";
import { RANK_META, RANK_ORDER } from "@/lib/skill-visuals";
import { ATTRIBUTE_META, type AttributeScores } from "@/lib/attributes";
import { SkillLogo } from "./SkillLogo";

/**
 * The loadout screen — what you own, and what it is actually doing.
 *
 * This is the half of the system that was previously invisible: effects
 * were folded into `ActiveModifiers` and consumed by the engine, but the
 * player had no screen that said "your reviews currently pay +6%." Owning
 * something you cannot see the effect of is indistinguishable from owning
 * nothing, which is a strange way to run a reward system.
 *
 * Every stat line names the engine hook it lands on, so nothing here reads
 * as a decorative number.
 */

interface Props {
  ownedCodes: string[];
  scores: AttributeScores;
  modifiers: ActiveModifiers;
}

export function InventoryPanel({ ownedCodes, scores, modifiers }: Props) {
  const [filter, setFilter] = useState<SkillRank | "ALL">("ALL");

  const owned = useMemo(() => {
    const set = new Set(ownedCodes);
    return SKILL_POOL.filter((s) => set.has(s.code)).sort(
      (a, b) => RANK_META[b.rank].order - RANK_META[a.rank].order || b.tier - a.tier || a.name.localeCompare(b.name)
    );
  }, [ownedCodes]);

  const isActive = (s: Skill) =>
    meetsRequirements(s, scores, modifiers.resonancePercent, modifiers.attributePenaltyPercent);

  const activeCount = owned.filter(isActive).length;
  const dormant = owned.filter((s) => !isActive(s));
  const stats = describeModifiers(modifiers);

  const countsByRank = useMemo(() => {
    const out = {} as Record<SkillRank, number>;
    for (const rank of RANK_ORDER) out[rank] = 0;
    for (const s of owned) out[s.rank] += 1;
    return out;
  }, [owned]);

  const visible = filter === "ALL" ? owned : owned.filter((s) => s.rank === filter);

  if (owned.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <p style={{ fontSize: 13, color: "var(--ink-1)" }}>Nothing acquired yet.</p>
        <p className="mt-1.5" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          Unlock a skill from the tree and it will appear here, with exactly what it changes.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      {/* ── Active effects: the loadout readout ── */}
      <div className="card" style={{ padding: 16, alignSelf: "start" }}>
        <div className="flex items-baseline justify-between">
          <p className="label-xs">Active effects</p>
          <span className="mono" style={{ fontSize: 11, color: "var(--green)" }}>
            {activeCount}/{owned.length}
          </span>
        </div>

        {stats.length === 0 ? (
          <p className="mt-3" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            Everything owned is currently dormant — nothing is modifying the engine.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {stats.map((line) => (
              <div key={line.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ fontSize: 11.5, color: "var(--ink-1)" }}>{line.label}</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: line.tone === "debuff" ? "var(--red)" : "var(--green)",
                    }}
                  >
                    {line.value}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: "var(--ink-3)", lineHeight: 1.45 }}>{line.hook}</p>
              </div>
            ))}
          </div>
        )}

        {dormant.length > 0 && (
          <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
            <p style={{ fontSize: 10.5, color: "var(--amber)" }}>
              {dormant.length} skill{dormant.length === 1 ? "" : "s"} dormant — requirements no longer met.
            </p>
            <p style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 3 }}>
              Still owned. They reactivate the moment the attribute score recovers.
            </p>
          </div>
        )}
      </div>

      {/* ── The collection ── */}
      <div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className="chip"
            style={{
              cursor: "pointer",
              background: filter === "ALL" ? "var(--green-10)" : "var(--sub)",
              color: filter === "ALL" ? "var(--green)" : "var(--ink-2)",
              border: `1px solid ${filter === "ALL" ? "rgba(0,204,122,0.25)" : "var(--line)"}`,
            }}
          >
            All {owned.length}
          </button>
          {RANK_ORDER.filter((r) => countsByRank[r] > 0).map((rank) => {
            const meta = RANK_META[rank];
            const on = filter === rank;
            return (
              <button
                key={rank}
                type="button"
                onClick={() => setFilter(rank)}
                className="chip"
                style={{
                  cursor: "pointer",
                  background: on ? meta.wash : "var(--sub)",
                  color: on ? meta.color : "var(--ink-2)",
                  border: `1px solid ${on ? `${meta.color}40` : "var(--line)"}`,
                }}
              >
                {meta.label} {countsByRank[rank]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((skill) => {
            const meta = RANK_META[skill.rank];
            const active = isActive(skill);
            const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";

            return (
              <div
                key={skill.code}
                className={`card equipped ${legendary ? "foil" : ""}`}
                style={
                  {
                    padding: 12,
                    borderColor: active ? `${meta.color}59` : "rgba(240,160,48,0.35)",
                    background: active
                      ? `linear-gradient(160deg, ${meta.wash} 0%, transparent 62%), var(--card)`
                      : "var(--card)",
                    opacity: active ? 1 : 0.72,
                    "--equipped-line": `${meta.color}22`,
                    "--equipped-glow": `${meta.color}55`,
                    "--foil": `${meta.color}30`,
                  } as React.CSSProperties
                }
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative shrink-0">
                    <SkillLogo skill={skill} size={34} />
                    {!active && (
                      <span
                        aria-hidden
                        className="absolute inset-0"
                        style={{ background: "var(--card)", opacity: 0.45, borderRadius: 8 }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "var(--ink-0)",
                        lineHeight: 1.3,
                      }}
                    >
                      {skill.name}
                    </p>
                    <p style={{ fontSize: 10.5, color: meta.color, marginTop: 2 }}>{skill.effectText}</p>
                    <p style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 3 }}>
                      {skill.attributes.map((a) => ATTRIBUTE_META[a].label).join(" · ")}
                      {!active && " · dormant"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
