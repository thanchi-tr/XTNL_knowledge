"use client";

import { RANK_META } from "@/lib/skill-visuals";
import type { SkillRank } from "@/lib/skill-pool";

/**
 * The two terminal-rank attach events, at page scale.
 *
 * `EquipPulse` fires in the slot and `BarCharge` across the footer, both
 * scaled continuously by charge — which is right for the 15 rungs below the
 * top, where the difference between neighbours should be a matter of degree.
 * It is wrong for the last two. An Apex completes a whole attribute and an
 * Ultimate ends a lineage costing thousands of mastery; those should not be
 * a slightly larger version of slotting a Tier VII, they should be a
 * different *kind* of event. So they get their own layer and their own
 * vocabulary:
 *
 *   APEX     — meteor rain. Gold, matching the rank, falling past the whole
 *              viewport. Arrival from outside.
 *   ULTIMATE — collapse. The page is pulled into a point, the point turns,
 *              and the glass fractures. Arrival from inside.
 *
 * Deterministic geometry, never random: server and client must agree, and a
 * spectacle that rolls differently each time is a spectacle you cannot
 * design against.
 */

interface Props {
  rank: Extract<SkillRank, "APEX" | "ULTIMATE">;
  /** Bumping this remounts the layer, which is what replays a one-shot. */
  replayKey: number;
}

const METEORS = 18;
const PULL_SPOKES = 14;

/**
 * Fracture paths, hand-placed in a 0..100 viewBox so they scale to any
 * viewport. Each starts near the centre and forks outward; the kinks are
 * what stop them reading as clean rays rather than as broken glass.
 */
const CRACKS: string[] = [
  "M50 50 L44 38 L46 27 L39 14 L41 2",
  "M50 50 L58 41 L57 29 L65 18 L63 4",
  "M50 50 L62 52 L74 47 L86 51 L99 45",
  "M50 50 L60 60 L59 72 L68 84 L66 99",
  "M50 50 L48 63 L40 73 L43 87 L36 99",
  "M50 50 L38 55 L27 51 L14 57 L1 53",
  "M50 50 L41 45 L30 44 L18 36 L4 33",
  "M50 50 L67 46 L80 37 L94 33",
  "M50 50 L55 66 L52 80 L57 96",
  "M50 50 L33 60 L21 70 L8 77",
];

export function Cataclysm({ rank, replayKey }: Props) {
  const color = RANK_META[rank].color;

  if (rank === "APEX") {
    return (
      <span
        key={replayKey}
        className="cataclysm"
        aria-hidden="true"
        style={{ ["--cat-color" as string]: color, ["--cat-dur" as string]: "1500ms" }}
      >
        <span className="cat-skyglow" />
        {Array.from({ length: METEORS }, (_, i) => (
          <span
            key={i}
            className="cat-meteor"
            style={
              {
                // Spread across the width plus a margin, so streaks also
                // enter from off-screen left rather than all starting inside.
                "--mx": `${-18 + (118 / METEORS) * i}%`,
                "--md": `${(i % 6) * 120 + (i % 3) * 45}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </span>
    );
  }

  return (
    <span
      key={replayKey}
      className="cataclysm"
      aria-hidden="true"
      style={{ ["--cat-color" as string]: color }}
    >
      <span className="cat-dim" />

      {/* Order is the effect: streaks, then the disc, then the horizon on
          top, so the black centre genuinely occludes what falls into it. */}
      {Array.from({ length: PULL_SPOKES }, (_, i) => (
        <span
          key={i}
          className="cat-pull"
          style={
            {
              "--a": `${(360 / PULL_SPOKES) * i}deg`,
              "--md": `${(i % 5) * 90}ms`,
            } as React.CSSProperties
          }
        />
      ))}

      <span className="cat-disk" />
      <span className="cat-hole" />

      <svg className="cat-crack" viewBox="0 0 100 100" preserveAspectRatio="none">
        {CRACKS.map((d, i) => (
          <path key={i} d={d} style={{ ["--cd" as string]: `${700 + i * 45}ms` }} />
        ))}
      </svg>

      <span className="cat-flash" />
    </span>
  );
}
