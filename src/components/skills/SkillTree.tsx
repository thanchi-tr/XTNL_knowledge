"use client";

import { useMemo, useState } from "react";
import type { Attribute } from "@prisma/client";
import type { Skill } from "@/lib/skill-pool";
import type { UnlockBlocker } from "@/lib/skill-gates";
import { estimateEta, type EtaEstimate } from "@/lib/skill-eta";
import { RANK_META } from "@/lib/skill-visuals";
import { themeFor } from "@/lib/attribute-themes";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { SkillLogo } from "./SkillLogo";
import { SkillCard, type SkillStatus } from "./SkillCard";

/**
 * The skill tree, drawn as the directed graph it actually is.
 *
 * A flat grid hid the one fact that matters most — that these skills *lead
 * somewhere*. The whole design of the pool is a funnel (five Pure tiers
 * feed a Capstone, every Capstone feeds the Apex, the Apex feeds three
 * Ultimates), and a player deciding what to work toward needs to see the
 * funnel, not read prerequisite codes off individual cards.
 *
 * Layout is a fixed DAG rather than a force simulation: one row per
 * lineage, one column per depth, edges drawn from each skill to its
 * prerequisites. Deterministic, so the tree a player learns the shape of
 * today is in the same shape tomorrow.
 */

const COL_W = 88;
const ROW_H = 46;
const NODE = 30;
const GUTTER = 168;
const PAD_TOP = 34;

const COLUMN_LABELS = ["I", "II", "III", "IV", "V", "C·I", "C·II", "C·III", "APEX", "ULT"];

function columnFor(skill: Skill): number {
  switch (skill.rank) {
    case "PURE":
      return skill.tier - 1; // 0..4
    case "SYNERGY":
      return skill.tier - 1; // 0..2, on its own rows
    case "CAPSTONE":
      return 5 + skill.tier - 1; // 5..7
    case "APEX":
      return 8;
    case "ULTIMATE":
      return 9;
  }
}

/** Stable per-lineage key — everything sharing one gets one row. */
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
      return `+ ${ATTRIBUTE_META[other].label}`;
    }
    case "CAPSTONE":
      return (skill.parentArchetypes ?? []).map((a) => a.charAt(0) + a.slice(1, 4).toLowerCase()).join("·");
    case "APEX":
      return "Apex";
    case "ULTIMATE":
      return skill.archetypeCode.charAt(0) + skill.archetypeCode.slice(1).toLowerCase();
  }
}

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
  const [hovered, setHovered] = useState<{ code: string; x: number; y: number } | null>(null);
  const theme = themeFor(attribute);

  const { rows, positions, width, height } = useMemo(() => {
    // Rank order first, then lineage key — so the tree reads left-to-right
    // as "cheap and many" toward "singular and final", top to bottom.
    const sorted = [...skills].sort(
      (a, b) => RANK_META[a.rank].order - RANK_META[b.rank].order || lineageKey(a).localeCompare(lineageKey(b))
    );

    const rowIndex = new Map<string, number>();
    const rowList: { key: string; label: string; rank: Skill["rank"] }[] = [];
    for (const s of sorted) {
      const key = lineageKey(s);
      if (!rowIndex.has(key)) {
        rowIndex.set(key, rowList.length);
        rowList.push({ key, label: lineageLabel(s, attribute), rank: s.rank });
      }
    }

    const pos = new Map<string, { x: number; y: number; skill: Skill }>();
    for (const s of sorted) {
      const col = columnFor(s);
      const row = rowIndex.get(lineageKey(s))!;
      pos.set(s.code, { x: GUTTER + col * COL_W + COL_W / 2, y: PAD_TOP + row * ROW_H + ROW_H / 2, skill: s });
    }

    return {
      rows: rowList,
      positions: pos,
      width: GUTTER + COLUMN_LABELS.length * COL_W,
      height: PAD_TOP + rowList.length * ROW_H + 12,
    };
  }, [skills, attribute]);

  const selected = selectedCode ? positions.get(selectedCode)?.skill ?? null : null;
  const hoveredEntry = hovered ? positions.get(hovered.code) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card relative overflow-x-auto" style={{ padding: 8 }}>
        <svg width={width} height={height} style={{ display: "block" }}>
          {COLUMN_LABELS.map((label, i) => (
            <text
              key={label}
              x={GUTTER + i * COL_W + COL_W / 2}
              y={18}
              textAnchor="middle"
              style={{ fontSize: 9, fill: "var(--ink-3)", letterSpacing: "0.08em", fontWeight: 600 }}
            >
              {label}
            </text>
          ))}

          {rows.map((row, i) => (
            <g key={row.key}>
              <text
                x={GUTTER - 12}
                y={PAD_TOP + i * ROW_H + ROW_H / 2 + 3}
                textAnchor="end"
                style={{ fontSize: 10, fill: RANK_META[row.rank].color, fontWeight: 500 }}
              >
                {row.label}
              </text>
              <line
                x1={GUTTER}
                y1={PAD_TOP + i * ROW_H + ROW_H / 2}
                x2={width - 8}
                y2={PAD_TOP + i * ROW_H + ROW_H / 2}
                stroke="var(--line)"
                strokeWidth={1}
              />
            </g>
          ))}

          {/* Prerequisite edges. An edge whose parent you own carries a slow
              current toward what it feeds, so the tree reads as live and the
              direction of travel is obvious without arrowheads. */}
          {[...positions.values()].map(({ x, y, skill }) =>
            skill.prerequisites.map((code) => {
              const from = positions.get(code);
              if (!from) return null;
              const parentOwned = statusOf(code) !== "locked";
              const childOwned = statusOf(skill.code) !== "locked";
              const mid = (from.x + x) / 2;
              const d = `M ${from.x + NODE / 2} ${from.y} C ${mid} ${from.y}, ${mid} ${y}, ${x - NODE / 2} ${y}`;
              const color = RANK_META[skill.rank].color;

              return (
                <g key={`${code}->${skill.code}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={parentOwned ? color : "var(--line-hi)"}
                    strokeOpacity={parentOwned ? 0.5 : 0.28}
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
                onMouseEnter={() => setHovered({ code: skill.code, x, y })}
                onMouseLeave={() => setHovered((h) => (h?.code === skill.code ? null : h))}
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
                  {/* Particles are off at node scale — hundreds of animated
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

        {/* Hover card — effect and projected time, without needing a click. */}
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
              Columns run left to right by depth: five Pure tiers, then Capstones, then the Apex, then the three
              Ultimates that close the path.
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
  // Flip to the left of the node when it would otherwise overflow the
  // scroll container's right edge.
  const flip = x + 270 > maxX;

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
        <span className="chip shrink-0" style={{ fontSize: 8.5, background: meta.wash, color: meta.color, border: `1px solid ${meta.color}40` }}>
          {meta.label}
        </span>
      </div>

      <p style={{ fontSize: 11, color: meta.color, marginTop: 4, fontWeight: 500 }}>{skill.effectText}</p>
      <p style={{ fontSize: 10, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.5 }}>{skill.flavour}</p>

      <div className="mt-2.5 flex items-baseline justify-between gap-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
        <span className="label-xs" style={{ fontSize: 9 }}>
          {status === "locked" ? "Time to reach" : status === "dormant" ? "Dormant" : "Active"}
        </span>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: status === "locked" ? ETA_TONE[eta.status] : themeColor }}>
          {status === "locked" ? eta.label : status === "dormant" ? "requirements lapsed" : "in effect"}
        </span>
      </div>
      {status === "locked" && eta.bottleneck && (
        <p style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.45 }}>{eta.bottleneck}</p>
      )}
    </div>
  );
}
