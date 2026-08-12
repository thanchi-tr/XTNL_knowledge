"use client";

import type { SkillRank } from "@/lib/skill-pool";
import { RANK_META } from "@/lib/skill-visuals";

/**
 * The rank chip on a skill card.
 *
 * Capstone and above emit a few drifting motes, so the tag itself carries
 * the weight of the rank before its label is read. Pure and Synergy stay
 * static — if every tag shimmered, none of them would mean anything, and
 * these two ranks account for the overwhelming majority of the pool.
 *
 * Mote positions and delays are derived from the rank, not random, so a
 * given tag animates identically on every render and across reloads.
 */

const MOTES: Record<string, { left: number; delay: number }[]> = {
  CAPSTONE: [
    { left: 22, delay: 0 },
    { left: 58, delay: 1.1 },
    { left: 80, delay: 2 },
  ],
  APEX: [
    { left: 14, delay: 0 },
    { left: 40, delay: 0.7 },
    { left: 66, delay: 1.4 },
    { left: 88, delay: 2.1 },
  ],
  ULTIMATE: [
    { left: 10, delay: 0 },
    { left: 30, delay: 0.5 },
    { left: 50, delay: 1 },
    { left: 70, delay: 1.5 },
    { left: 90, delay: 2 },
  ],
};

interface Props {
  rank: SkillRank;
  /** Overrides the label — used for the tier suffix on tree detail cards. */
  label?: string;
  size?: "sm" | "xs";
}

export function RankTag({ rank, label, size = "sm" }: Props) {
  const meta = RANK_META[rank];
  const motes = MOTES[rank];

  return (
    <span
      className={`chip shrink-0 ${motes ? "tag-particles" : ""}`}
      style={{
        fontSize: size === "xs" ? 8.5 : 9,
        // `currentColor` is what the motes inherit, so one colour drives both.
        color: meta.color,
        background: meta.wash,
        border: `1px solid ${meta.color}40`,
      }}
    >
      {motes?.map((m, i) => (
        <span key={i} aria-hidden className="mote" style={{ left: `${m.left}%`, animationDelay: `${m.delay}s` }} />
      ))}
      <span style={{ position: "relative" }}>{label ?? meta.label}</span>
    </span>
  );
}
