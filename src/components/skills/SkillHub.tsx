"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SKILL_POOL, type Skill } from "@/lib/skill-pool";
import { unlockBlockers, type ActiveModifiers } from "@/lib/skill-gates";
import { DEBUFF_META, type ActiveDebuffRow } from "@/lib/debuff-meta";
import { BOON_META, type ActiveBoonRow } from "@/lib/boon-meta";
import { ATTRIBUTES, ATTRIBUTE_META, type AttributeScores } from "@/lib/attributes";
import { themeFor } from "@/lib/attribute-themes";
import { RANK_META, RANK_ORDER } from "@/lib/skill-visuals";
import { InventoryPanel } from "./InventoryPanel";
import { formatExpiry } from "@/lib/format-date";

/**
 * The skills hub: thirteen paths as portals, plus the inventory.
 *
 * The tree itself moved to `/skills/[attribute]`. A hub whose job is
 * "choose where to go" and a path page whose job is "work inside one
 * discipline" are different screens, and cramming both into one route made
 * the tree fight the selector for the same vertical space.
 *
 * Gates are still evaluated in the browser from four small inputs — see
 * `skill-gates.ts` for why that split exists.
 */

interface Props {
  scores: AttributeScores;
  ownedCodes: string[];
  masteryBalance: number;
  modifiers: ActiveModifiers;
  debuffs: ActiveDebuffRow[];
  boons: ActiveBoonRow[];
}

type View = "paths" | "inventory";

export function SkillHub({ scores, ownedCodes, masteryBalance, modifiers, debuffs, boons }: Props) {
  const [view, setView] = useState<View>("paths");
  const ownedSet = useMemo(() => new Set(ownedCodes), [ownedCodes]);

  const blockersOf = useMemo(
    () => (skill: Skill) => unlockBlockers(skill, scores, ownedCodes, masteryBalance, modifiers),
    [scores, ownedCodes, masteryBalance, modifiers]
  );

  /** Per-path totals, including how many are affordable right now — the "there is something to do here" signal. */
  const summaries = useMemo(() => {
    const out = {} as Record<string, { owned: number; total: number; ready: number; ultimates: number }>;
    for (const a of ATTRIBUTES) out[a] = { owned: 0, total: 0, ready: 0, ultimates: 0 };
    for (const skill of SKILL_POOL) {
      for (const a of skill.attributes) {
        const row = out[a];
        row.total += 1;
        if (ownedSet.has(skill.code)) {
          row.owned += 1;
          if (skill.rank === "ULTIMATE") row.ultimates += 1;
        } else if (blockersOf(skill).length === 0) {
          row.ready += 1;
        }
      }
    }
    return out;
  }, [ownedSet, blockersOf]);

  const totalReady = ATTRIBUTES.reduce((sum, a) => sum + summaries[a].ready, 0);

  return (
    <div className="space-y-5">
      {debuffs.length > 0 && (
        <div className="card px-4 py-3" style={{ borderColor: "rgba(240,58,87,0.3)", background: "var(--red-10)" }}>
          <p className="label-xs" style={{ color: "var(--red)" }}>
            Afflicted
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {debuffs.map((d, i) => {
              const meta = DEBUFF_META[d.kind];
              return (
                <div key={`${d.kind}-${i}`} style={{ fontSize: 11 }}>
                  <span style={{ color: "var(--red)", fontWeight: 600 }}>{meta.label}</span>
                  <span style={{ color: "var(--ink-2)" }}> — {meta.effectText(d.magnitude)}</span>
                  <span style={{ color: "var(--ink-3)" }}>
                    {" · until "}
                    {formatExpiry(d.expiresAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {boons.length > 0 && (
        <div className="card px-4 py-3" style={{ borderColor: "rgba(0,204,122,0.3)", background: "var(--green-06)" }}>
          <p className="label-xs" style={{ color: "var(--green)" }}>
            Spoils
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {boons.map((b, i) => {
              const meta = BOON_META[b.kind];
              return (
                <div key={`${b.kind}-${i}`} style={{ fontSize: 11 }}>
                  <span style={{ color: "var(--green)", fontWeight: 600 }}>{meta.label}</span>
                  <span style={{ color: "var(--ink-2)" }}> — {meta.effectText(b.magnitude)}</span>
                  <span style={{ color: "var(--ink-3)" }}>
                    {" · until "}
                    {formatExpiry(b.expiresAt)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "paths" as const, label: "Paths" },
              { id: "inventory" as const, label: `Inventory · ${ownedCodes.length}` },
            ]
          ).map((tab) => {
            const on = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setView(tab.id)}
                className="chip"
                style={{
                  cursor: "pointer",
                  fontSize: 10.5,
                  padding: "5px 12px",
                  background: on ? "var(--green-10)" : "var(--sub)",
                  color: on ? "var(--green)" : "var(--ink-2)",
                  border: `1px solid ${on ? "rgba(0,204,122,0.28)" : "var(--line)"}`,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {view === "paths" && totalReady > 0 && (
          <p style={{ fontSize: 11, color: "var(--green)" }}>
            {totalReady} skill{totalReady === 1 ? "" : "s"} ready to unlock
          </p>
        )}
      </div>

      {view === "inventory" ? (
        <InventoryPanel ownedCodes={ownedCodes} scores={scores} modifiers={modifiers} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {ATTRIBUTES.map((attribute) => {
            const theme = themeFor(attribute);
            const meta = ATTRIBUTE_META[attribute];
            const s = summaries[attribute];
            const pct = s.total > 0 ? s.owned / s.total : 0;

            return (
              <Link
                key={attribute}
                href={`/skills/${theme.slug}`}
                className="card card-hover foil relative overflow-hidden no-underline"
                style={
                  {
                    padding: 15,
                    borderColor: s.owned > 0 ? `${theme.color}44` : "var(--line)",
                    background: `linear-gradient(155deg, ${theme.wash} 0%, transparent 58%), var(--card)`,
                    "--foil": `${theme.color}33`,
                  } as React.CSSProperties
                }
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 ${s.ultimates > 0 ? "aura-breathe" : ""}`}
                  style={{ background: `radial-gradient(circle, ${theme.color}26, transparent 70%)` }}
                />

                <div className="relative">
                  <div className="flex items-start justify-between gap-2">
                    <h2 style={{ fontSize: 13.5, fontWeight: 700, color: theme.bright, lineHeight: 1.25 }}>
                      {meta.label}
                    </h2>
                    <span className="mono shrink-0" style={{ fontSize: 13, fontWeight: 800, color: theme.color }}>
                      {scores[attribute].toFixed(1)}
                    </span>
                  </div>

                  <p className="mt-1" style={{ fontSize: 10.5, color: "var(--ink-3)", lineHeight: 1.45, minHeight: 30 }}>
                    {meta.blurb}
                  </p>

                  <div className="mt-2.5 h-1.5 w-full overflow-hidden" style={{ borderRadius: 3, background: "var(--sub)" }}>
                    <div
                      style={{
                        width: `${pct * 100}%`,
                        height: "100%",
                        borderRadius: 3,
                        background:
                          s.ultimates > 0
                            ? `linear-gradient(90deg, ${theme.color}, ${RANK_META.ULTIMATE.color})`
                            : theme.color,
                      }}
                    />
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                      {s.owned}/{s.total} unlocked
                    </span>
                    {s.ready > 0 ? (
                      <span className="mono" style={{ fontSize: 9.5, color: "var(--green)", fontWeight: 700 }}>
                        {s.ready} ready
                      </span>
                    ) : (
                      <span style={{ fontSize: 9.5, color: "var(--ink-3)" }}>enter →</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {view === "paths" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {RANK_ORDER.map((rank) => (
            <span key={rank} className="flex items-center gap-1.5" style={{ fontSize: 10, color: "var(--ink-2)" }}>
              <span
                style={{ width: 8, height: 8, borderRadius: 2, background: RANK_META[rank].color, display: "inline-block" }}
              />
              {RANK_META[rank].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
