"use client";

import { useMemo, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { Attribute } from "@prisma/client";
import type { Skill, SkillRank } from "@/lib/skill-pool";
import { PURE_MAX_TIER, CAPSTONE_MAX_TIER } from "@/lib/skill-pool";
import type { UnlockBlocker } from "@/lib/skill-gates";
import { estimateEta, type EtaEstimate } from "@/lib/skill-eta";
import { RANK_META } from "@/lib/skill-visuals";
import { RANK_MATERIAL } from "@/lib/materials";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { LOADOUT_SLOTS } from "@/lib/loadout";
import { cx } from "@/components/ui/cx";
import { SkillLogo } from "./SkillLogo";
import { EmblemDetail, EmblemDetailSheet } from "./EmblemDetail";
import type { LadderContext } from "./ladder";

export type SkillStatus = "active" | "dormant" | "locked";

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
 *
 * Redesign: every node is a focusable button (Tab, Enter or Space opens
 * it); nothing on the graph loops (ready is a still dashed gold ring, owned
 * edges are solid); labels are 12 px; the detail is a sheet below 1024 px
 * and a side panel from 1024 (the same EmblemDetail the ladder uses).
 */

const COL_W = 78;
const ROW_H = 60;
const NODE = 30;
const GUTTER = 64;
const PAD_TOP = 42;
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

const DEPTH_LABELS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "C·I", "C·II", "C·III", "C·IV", "C·V", "Apex", "Ult"];

const ETA_TONE: Record<EtaEstimate["status"], string> = {
  available: "var(--kept)",
  projected: "var(--ink-1)",
  needs_prerequisite: "var(--ink-2)",
  no_progress: "var(--owed)",
  unknown: "var(--ink-2)",
};

/** ≥ 1024 px: the detail sits beside the graph; below, it is a sheet. */
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false
  );
}

interface Props {
  attribute: Attribute;
  skills: Skill[];
  statusOf: (code: string) => SkillStatus;
  blockersOf: (skill: Skill) => UnlockBlocker[];
  ctx: LadderContext;
  equippedByCode: Record<string, number>;
  masteryPerDay: number | null;
  scorePerDay: Record<string, number> | null;
}

export function SkillTree({ attribute, skills, statusOf, blockersOf, ctx, equippedByCode, masteryPerDay, scorePerDay }: Props) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const wide = useWide();

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
        y: PAD_TOP + (top.depth - 1) * ROW_H + ROW_H / 2 - NODE / 2 - LABEL_GAP + 6,
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
  const used = new Set(Object.values(equippedByCode));
  const freeSlot = Array.from({ length: LOADOUT_SLOTS }, (_, i) => i).find((i) => !used.has(i));

  function onNodeKey(e: KeyboardEvent<SVGGElement>, code: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedCode(code);
    }
  }

  return (
    <div className="tree-grid">
      <div className="card" style={{ position: "relative", overflowX: "auto", padding: 8 }}>
        <svg width={width} height={height} style={{ display: "block" }} role="group" aria-label={`${ATTRIBUTE_META[attribute].label} path graph`}>
          {/* Depth rails: the ladder's rungs, labelled down the left edge. */}
          {Array.from({ length: maxDepth }, (_, i) => {
            const y = PAD_TOP + i * ROW_H + ROW_H / 2;
            return (
              <g key={i} aria-hidden="true">
                <line x1={GUTTER - 10} y1={y} x2={width - 8} y2={y} stroke="var(--line-1)" strokeWidth={1} />
                <text x={GUTTER - 16} y={y + 4} textAnchor="end" style={{ fontSize: 12, fill: "var(--ink-2)", fontWeight: 600 }}>
                  {DEPTH_LABELS[i] ?? String(i + 1)}
                </text>
              </g>
            );
          })}

          {/* Lineage names, above each lineage's first node. */}
          {labels.map((l) => (
            <text key={l.key} x={l.x} y={l.y} textAnchor="middle" aria-hidden="true" style={{ fontSize: 12, fill: "var(--ink-2)", fontWeight: 600 }}>
              {l.label.length > 10 ? `${l.label.slice(0, 9)}…` : l.label}
            </text>
          ))}

          {/* Prerequisite edges, parent above to child below. Owned parents draw solid in ink. */}
          {[...positions.values()].map(({ x, y, skill }) =>
            skill.prerequisites.map((code) => {
              const from = positions.get(code);
              if (!from) return null;
              const parentOwned = statusOf(code) !== "locked";
              const childOwned = statusOf(skill.code) !== "locked";
              const midY = (from.y + y) / 2;
              const d = `M ${from.x} ${from.y + NODE / 2} C ${from.x} ${midY}, ${x} ${midY}, ${x} ${y - NODE / 2}`;
              return (
                <path
                  key={`${code}->${skill.code}`}
                  aria-hidden="true"
                  d={d}
                  fill="none"
                  stroke={parentOwned ? "var(--ink-1)" : "var(--line-2)"}
                  strokeOpacity={parentOwned ? (childOwned ? 0.7 : 0.9) : 1}
                  strokeWidth={parentOwned ? 1.6 : 1}
                  strokeDasharray={parentOwned && !childOwned ? "3 5" : undefined}
                />
              );
            })
          )}

          {[...positions.values()].map(({ x, y, skill }) => {
            const status = statusOf(skill.code);
            const unlockable = status === "locked" && blockersOf(skill).length === 0;
            const isSelected = skill.code === selectedCode;
            const state = status === "locked" ? (unlockable ? "ready to unlock" : "locked") : status === "dormant" ? "owned, dormant" : "owned";

            return (
              <g
                key={skill.code}
                className="tree-node"
                data-emblem={skill.code}
                transform={`translate(${x - NODE / 2}, ${y - NODE / 2})`}
                onClick={() => setSelectedCode(skill.code)}
                onKeyDown={(e) => onNodeKey(e, skill.code)}
                onMouseEnter={() => setHovered(skill.code)}
                onMouseLeave={() => setHovered((h) => (h === skill.code ? null : h))}
                onFocus={() => setHovered(skill.code)}
                onBlur={() => setHovered((h) => (h === skill.code ? null : h))}
                role="button"
                tabIndex={0}
                aria-label={`${skill.name}, ${RANK_META[skill.rank].label}, ${state}`}
                aria-pressed={isSelected}
              >
                {/* A 44 px hit area around the 30 px node. */}
                <rect x={-7} y={-7} width={NODE + 14} height={NODE + 14} fill="transparent" />
                <rect className="focus-ring" x={-8} y={-8} width={NODE + 16} height={NODE + 16} rx={13} fill="none" stroke="var(--focus)" strokeWidth={2} />
                {unlockable && (
                  <rect x={-6} y={-6} width={NODE + 12} height={NODE + 12} rx={12} fill="none" stroke="#f0c75e" strokeWidth={1.5} strokeDasharray="3 3" />
                )}
                <rect
                  x={-3}
                  y={-3}
                  width={NODE + 6}
                  height={NODE + 6}
                  rx={9}
                  fill={status !== "locked" ? "var(--raised)" : "transparent"}
                  stroke={
                    isSelected
                      ? "var(--ink-0)"
                      : status !== "locked"
                        ? `url(#m-${RANK_MATERIAL[skill.rank]})`
                        : "var(--line-2)"
                  }
                  strokeWidth={isSelected ? 2 : status !== "locked" ? 1.8 : 1}
                />
                <g opacity={status === "locked" && !unlockable ? 0.42 : 1}>
                  <SkillLogo skill={skill} size={NODE} animated={false} />
                </g>
                {status === "dormant" && <circle cx={NODE + 1} cy={-1} r={3.5} fill="var(--owed)" stroke="var(--card)" strokeWidth={1} />}
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
          />
        )}
      </div>

      {wide ? (
        <div>
          {selected ? (
            <section className="card pad-l" aria-label={`${selected.name} detail`}>
              <EmblemDetail
                key={selected.code}
                skill={selected}
                ctx={ctx}
                equippedSlot={equippedByCode[selected.code]}
                freeSlot={freeSlot}
                onDone={() => setSelectedCode(null)}
              />
            </section>
          ) : (
            <section className="card pad-l">
              <p className="t-body-l" style={{ margin: 0 }}>
                Pick a node for its detail.
              </p>
              <p className="t-meta" style={{ marginTop: 6 }}>
                The tree runs top to bottom by depth: eight Pure tiers, then Capstones where two lineages fuse, then the single
                Apex, then the three Ultimates that close the path. Tab through the nodes; Enter opens one.
              </p>
            </section>
          )}
        </div>
      ) : (
        <EmblemDetailSheet
          skill={selected}
          ctx={ctx}
          equippedSlot={selected ? equippedByCode[selected.code] : undefined}
          freeSlot={freeSlot}
          onClose={() => setSelectedCode(null)}
        />
      )}
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
}: {
  skill: Skill;
  status: SkillStatus;
  eta: EtaEstimate;
  x: number;
  y: number;
  maxX: number;
}) {
  // Flip left when the card would overflow the scroll container's edge.
  const flip = x + 280 > maxX;
  const material = RANK_MATERIAL[skill.rank];

  return (
    <div
      className="card"
      aria-hidden="true"
      style={{
        position: "absolute",
        zIndex: 2,
        width: 256,
        pointerEvents: "none",
        left: flip ? x - 262 : x + 26,
        top: Math.max(4, y - 52),
        padding: 12,
        background: "var(--overlay)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <b className="t-body-l">{skill.name}</b>
        <span className={cx("chip", "dt-mat", material)}>{RANK_META[skill.rank].label}</span>
      </div>
      <p className="t-meta ink-1" style={{ marginTop: 4 }}>
        {skill.effectText}
      </p>
      <p className="t-meta" style={{ marginTop: 4 }}>
        {skill.flavour}
      </p>
      <div
        style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-1)", display: "flex", justifyContent: "space-between", gap: 8 }}
        className="t-meta"
      >
        <span>{status === "locked" ? "Time to reach" : status === "dormant" ? "Dormant" : "Active"}</span>
        <b className="num" style={{ color: status === "locked" ? ETA_TONE[eta.status] : "var(--ink-0)" }}>
          {status === "locked" ? eta.label : status === "dormant" ? "requirements lapsed" : "in effect"}
        </b>
      </div>
      {status === "locked" && eta.bottleneck && (
        <p className="t-meta" style={{ marginTop: 4 }}>
          {eta.bottleneck}
        </p>
      )}
    </div>
  );
}
