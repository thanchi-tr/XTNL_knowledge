"use client";

import { useMemo, useState } from "react";
import type { Attribute } from "@prisma/client";
import type { Skill, SkillRank } from "@/lib/skill-pool";
import { PURE_MAX_TIER, CAPSTONE_MAX_TIER } from "@/lib/skill-pool";
import type { UnlockBlocker } from "@/lib/skill-gates";
import { estimateEta, type EtaEstimate } from "@/lib/skill-eta";
import { RANK_META } from "@/lib/skill-visuals";
import { themeFor } from "@/lib/attribute-themes";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { SkillLogo } from "./SkillLogo";
import { RankTag } from "./RankTag";
import { SkillCard, type SkillStatus } from "./SkillCard";

/**
 * The skill tree, drawn top-down as the directed graph it actually is.
 *
 * Vertical rather than horizontal: the pool is a funnel — many cheap Pure
 * tiers converge into Capstones, every Capstone converges into the single
 * Apex, and the Apex opens three Ultimates — and a funnel reads as a
 * funnel when it narrows *downward*. Depth is the Y axis, so the eye
 * travels the way progression does, and the page scrolls the way a long
 * ladder should.
 *
 * Columns are packed per rank *band* rather than globally. Capstone
 * lineages only exist below depth 8, so they reuse the horizontal space
 * the Pure lineages occupy above — without that, a 27-lineage attribute
 * would be 2,300px wide and unreadable. Each band is centred against the
 * widest one, which is what produces the funnel silhouette.
 *
 * Layout is a fixed DAG, not a force simulation: deterministic, so the
 * tree a player learns the shape of today is the same shape tomorrow.
 */

const COL_W = 74;
const ROW_H = 58;
const NODE = 30;
const GUTTER = 52;
const PAD_TOP = 40;
const LABEL_GAP = 16;

/** Vertical position, 1-indexed. Mirrors the prerequisite chain exactly. */
function depthFor(skill: Skill): number {
  switch (skill.rank) {
    case "PURE":
      return skill.tier; // 1..8
    case "SYNERGY":
      return skill.tier; // 1..5, alongside the Pure ladder
    case "CAPSTONE":
      return PURE_MAX_TIER + skill.tier; // 9..13
    case "APEX":
      return PURE_MAX_TIER + CAPSTONE_MAX_TIER + 1; // 14
    case "ULTIMATE":
      return PURE_MAX_TIER + CAPSTONE_MAX_TIER + 2; // 15
  }
}

/** Which horizontal band a rank shares columns with. */
function bandFor(rank: SkillRank): "upper" | "capstone" | "apex" | "ultimate" {
  if (rank === "PURE" || rank === "SYNERGY") return "upper";
  if (rank === "CAPSTONE") return "capstone";
  if (rank === "APEX") return "apex";
  return "ultimate";
}

/** Stable per-lineage key — everything sharing one gets one column. */
function lineageKey(skill: Skill): string {
  switch (skill.rank) {
    case "PURE":
      return `P:${skill.archetypeCode}`;
    case "SYNERGY":
      return `S:${skill.archetypeCode}:${[...skill.attributes].sort().join("+")}`;
    case "CAPSTONE":
      return `C:${(skill.parentArchetypes ?? []).join("+")}`;
    case "APEX":
      return "X";
    case "ULTIMATE":
      return `U:${skill.archetypeCode}`;
  }
}

function lineageLabel(skill: Skill, attribute: Attribute): string {
  switch (skill.rank) {
    case "PURE":
      return skill.archetypeCode.charAt(0) + skill.archetypeCode.slice(1).toLowerCase();
    case "SYNERGY": {
      const other = skill.attributes.find((a) => a !== attribute) ?? attribute;
      return `+${ATTRIBUTE_META[other].label}`;
    }
    case "CAPSTONE":
      return (skill.parentArchetypes ?? []).map((a) => a.slice(0, 4).toLowerCase()).join("·");
    case "APEX":
      return "Apex";
    case "ULTIMATE":
      return skill.archetypeCode.charAt(0) + skill.archetypeCode.slice(1).toLowerCase();
  }
}

const DEPTH_LABELS = [
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII",
  "C·I", "C·II", "C·III", "C·IV", "C·V",
  "APEX", "ULT",
];

const ETA_TONE: Record<EtaEstimate["status"], string> = {
  available: "var(--green)",
  projected: "var(--ink-1)",
  needs_prerequisite: "var(--ink-3)",
  no_progress: "var(--red)",
  unknown: "var(--ink-3)",
};

interface Props {
  attribute: Attribute;
  skills: Skill[];
  statusOf: (code: string) => SkillStatus;
  blockersOf: (skill: Skill) => UnlockBlocker[];
  masteryBalance: number;
  masteryPerDay: number | null;
  scorePerDay: Record<string, number> | null;
}

export function SkillTree({
  attribute,
  skills,
  statusOf,
  blockersOf,
  masteryBalance,
  masteryPerDay,
  scorePerDay,
}: Props) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = themeFor(attribute);

  const { positions, labels, width, height, maxDepth } = useMemo(() => {
    const sorted = [...skills].sort(
      (a, b) => RANK_META[a.rank].order - RANK_META[b.rank].order || lineageKey(a).localeCompare(lineageKey(b))
    );

    // One column index per lineage, numbered independently inside each band.
    const bandColumns = new Map<string, Map<string, number>>();
    const lineageBand = new Map<string, string>();
    const lineageTop = new Map<string, { depth: number; label: string; rank: SkillRank }>();

    for (const s of sorted) {
      const band = bandFor(s.rank);
      const key = lineageKey(s);
      if (!bandColumns.has(band)) bandColumns.set(band, new Map());
      const cols = bandColumns.get(band)!;
      if (!cols.has(key)) cols.set(key, cols.size);
      lineageBand.set(key, band);

      const depth = depthFor(s);
      const top = lineageTop.get(key);
      if (!top || depth < top.depth) {
        lineageTop.set(key, { depth, label: lineageLabel(s, attribute), rank: s.rank });
      }
    }

    const widest = Math.max(...[...bandColumns.values()].map((c) => c.size));

    /** Centring each band against the widest is what draws the funnel. */
    const xFor = (band: string, col: number) => {
      const size = bandColumns.get(band)!.size;
      const offset = (widest - size) / 2;
      return GUTTER + (offset + col) * COL_W + COL_W / 2;
    };

    const pos = new Map<string, { x: number; y: number; skill: Skill }>();
    for (const s of sorted) {
      const key = lineageKey(s);
      const band = bandFor(s.rank);
      pos.set(s.code, {
        x: xFor(band, bandColumns.get(band)!.get(key)!),
        y: PAD_TOP + (depthFor(s) - 1) * ROW_H + ROW_H / 2,
        skill: s,
      });
    }

    // One label per lineage, sitting just above its topmost node.
    const labelList = [...lineageTop.entries()].map(([key, top]) => {
      const band = lineageBand.get(key)!;
      return {
        key,
        label: top.label,
        rank: top.rank,
        x: xFor(band, bandColumns.get(band)!.get(key)!),
        y: PAD_TOP + (top.depth - 1) * ROW_H + ROW_H / 2 - NODE / 2 - LABEL_GAP + 4,
      };
    });

    const deepest = Math.max(...sorted.map(depthFor));
    return {
      positions: pos,
      labels: labelList,
      width: GUTTER + widest * COL_W + 16,
      height: PAD_TOP + deepest * ROW_H + 16,
      maxDepth: deepest,
    };
  }, [skills, attribute]);

  const selected = selectedCode ? positions.get(selectedCode)?.skill ?? null : null;
  const hoveredEntry = hovered ? positions.get(hovered) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card relative overflow-x-auto" style={{ padding: 8 }}>
        <svg width={width} height={height} style={{ display: "block" }}>
          {/* Depth rails — the ladder's rungs, labelled down the left edge. */}
          {Array.from({ length: maxDepth }, (_, i) => {
            const y = PAD_TOP + i * ROW_H + ROW_H / 2;
            return (
              <g key={i}>
                <line x1={GUTTER - 12} y1={y} x2={width - 8} y2={y} stroke="var(--line)" strokeWidth={1} />
                <text
                  x={GUTTER - 20}
                  y={y + 3}
                  textAnchor="end"
                  style={{ fontSize: 8.5, fill: "var(--ink-3)", letterSpacing: "0.06em", fontWeight: 600 }}
                >
                  {DEPTH_LABELS[i] ?? String(i + 1)}
                </text>
              </g>
            );
          })}

          {/* Lineage names, above each lineage's first node. */}
          {labels.map((l) => (
            <text
              key={l.key}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              style={{ fontSize: 8.5, fill: RANK_META[l.rank].color, fontWeight: 600 }}
            >
              {l.label.length > 11 ? `${l.label.slice(0, 10)}…` : l.label}
            </text>
          ))}

          {/* Prerequisite edges, drawn parent-above to child-below. An edge
              whose parent you own carries a current toward what it feeds. */}
          {[...positions.values()].map(({ x, y, skill }) =>
            skill.prerequisites.map((code) => {
              const from = positions.get(code);
              if (!from) return null;
              const parentOwned = statusOf(code) !== "locked";
              const childOwned = statusOf(skill.code) !== "locked";
              const midY = (from.y + y) / 2;
              const d = `M ${from.x} ${from.y + NODE / 2} C ${from.x} ${midY}, ${x} ${midY}, ${x} ${y - NODE / 2}`;
              const color = RANK_META[skill.rank].color;

              return (
                <g key={`${code}->${skill.code}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={parentOwned ? color : "var(--line-hi)"}
                    strokeOpacity={parentOwned ? 0.5 : 0.26}
                    strokeWidth={parentOwned ? 1.6 : 1}
                  />
                  {parentOwned && !childOwned && (
                    <path
                      className="edge-flow"
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeOpacity={0.95}
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })
          )}

          {[...positions.values()].map(({ x, y, skill }) => {
            const status = statusOf(skill.code);
            const meta = RANK_META[skill.rank];
            const unlockable = status === "locked" && blockersOf(skill).length === 0;
            const isSelected = skill.code === selectedCode;

            return (
              <g
                key={skill.code}
                transform={`translate(${x - NODE / 2}, ${y - NODE / 2})`}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedCode(skill.code)}
                onMouseEnter={() => setHovered(skill.code)}
                onMouseLeave={() => setHovered((h) => (h === skill.code ? null : h))}
                role="button"
                aria-label={`${skill.name} — ${status}`}
              >
                {unlockable && (
                  <>
                    <rect
                      className="unlock-burst"
                      x={-3}
                      y={-3}
                      width={NODE + 6}
                      height={NODE + 6}
                      rx={9}
                      fill="none"
                      stroke="var(--green)"
                      strokeWidth={2}
                    />
                    <rect
                      className="ready-ring"
                      x={-6}
                      y={-6}
                      width={NODE + 12}
                      height={NODE + 12}
                      rx={12}
                      fill="none"
                      stroke="var(--green)"
                      strokeWidth={1.4}
                    />
                  </>
                )}

                {status !== "locked" && (skill.rank === "APEX" || skill.rank === "ULTIMATE") && (
                  <circle
                    className="aura-breathe"
                    cx={NODE / 2}
                    cy={NODE / 2}
                    r={NODE * 0.85}
                    fill={meta.color}
                    opacity={0.16}
                  />
                )}

                <rect
                  x={-3}
                  y={-3}
                  width={NODE + 6}
                  height={NODE + 6}
                  rx={9}
                  fill={status !== "locked" ? meta.wash : "transparent"}
                  stroke={
                    isSelected
                      ? "var(--ink-0)"
                      : status !== "locked"
                        ? meta.color
                        : unlockable
                          ? "var(--green)"
                          : "var(--line-hi)"
                  }
                  strokeWidth={isSelected ? 2 : unlockable ? 1.6 : 1}
                  strokeOpacity={status === "locked" && !unlockable ? 0.5 : 1}
                />
                <g opacity={status === "locked" && !unlockable ? 0.4 : 1}>
                  {/* Particles off at node scale — hundreds of animated
                      emblems at once is a compositor problem, and the detail
                      panel is where an Ultimate gets to show off. */}
                  <SkillLogo skill={skill} size={NODE} animated={false} />
                </g>

                {status === "dormant" && (
                  <circle cx={NODE + 1} cy={-1} r={3.5} fill="var(--amber)" stroke="var(--card)" strokeWidth={1} />
                )}
              </g>
            );
          })}
        </svg>

        {hoveredEntry && (
          <HoverCard
            skill={hoveredEntry.skill}
            status={statusOf(hoveredEntry.skill.code)}
            eta={estimateEta({ blockers: blockersOf(hoveredEntry.skill), masteryPerDay, scorePerDay })}
            x={hoveredEntry.x}
            y={hoveredEntry.y}
            maxX={width}
            themeColor={theme.color}
          />
        )}
      </div>

      <div>
        {selected ? (
          <SkillCard
            key={selected.code}
            skill={selected}
            status={statusOf(selected.code)}
            blockers={blockersOf(selected)}
            masteryBalance={masteryBalance}
            eta={estimateEta({ blockers: blockersOf(selected), masteryPerDay, scorePerDay })}
          />
        ) : (
          <div className="card px-4 py-8 text-center">
            <p style={{ fontSize: 12, color: "var(--ink-2)" }}>Hover a node for its effect. Click to inspect.</p>
            <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
              The tree runs top to bottom by depth: eight Pure tiers, then Capstones where two lineages fuse, then
              the single Apex, then the three Ultimates that close the path.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function HoverCard({
  skill,
  status,
  eta,
  x,
  y,
  maxX,
  themeColor,
}: {
  skill: Skill;
  status: SkillStatus;
  eta: EtaEstimate;
  x: number;
  y: number;
  maxX: number;
  themeColor: string;
}) {
  const meta = RANK_META[skill.rank];
  // Flip left when the card would overflow the scroll container's edge.
  const flip = x + 280 > maxX;

  return (
    <div
      className="hover-card card"
      style={{
        left: flip ? x - 262 : x + 26,
        top: Math.max(4, y - 52),
        padding: 11,
        borderColor: `${meta.color}66`,
        background: `linear-gradient(160deg, ${meta.wash} 0%, transparent 60%), var(--card)`,
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-0)", lineHeight: 1.3 }}>{skill.name}</p>
        <RankTag rank={skill.rank} size="xs" />
      </div>

      <p style={{ fontSize: 11, color: meta.color, marginTop: 4, fontWeight: 500 }}>{skill.effectText}</p>
      <p style={{ fontSize: 10, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.5 }}>{skill.flavour}</p>

      <div
        className="mt-2.5 flex items-baseline justify-between gap-2 pt-2"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <span className="label-xs" style={{ fontSize: 9 }}>
          {status === "locked" ? "Time to reach" : status === "dormant" ? "Dormant" : "Active"}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: status === "locked" ? ETA_TONE[eta.status] : themeColor,
          }}
        >
          {status === "locked" ? eta.label : status === "dormant" ? "requirements lapsed" : "in effect"}
        </span>
      </div>
      {status === "locked" && eta.bottleneck && (
        <p style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.45 }}>{eta.bottleneck}</p>
      )}
    </div>
  );
}
