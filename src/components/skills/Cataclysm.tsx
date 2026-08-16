"use client";

import { RANK_META } from "@/lib/skill-visuals";
import type { SkillRank } from "@/lib/skill-pool";

/**
 * The two terminal-rank attach events, at page scale.
 *
 * `EquipPulse` fires in the slot and `BarCharge` across the footer, both
 * scaled continuously by charge — which is right for the fifteen rungs
 * below the top, where neighbours should differ by degree. It is wrong for
 * the last two. An Apex completes a whole attribute and an Ultimate ends a
 * lineage costing thousands of mastery, so they get their own layer, their
 * own vocabulary, and by a wide margin the longest durations in the app:
 *
 *   APEX     — meteor rain, 2.6s. Arrival from outside.
 *   ULTIMATE — gravitational collapse, 4.2s. Arrival from inside.
 *
 * Deterministic geometry, never random: server and client must agree, and a
 * spectacle that rolls differently each time cannot be designed against.
 */

interface Props {
  rank: Extract<SkillRank, "APEX" | "ULTIMATE">;
  /** Bumping this remounts the layer, which is what replays a one-shot. */
  replayKey: number;
}

const METEORS = 22;
const PULL_SPOKES = 22;
const WARP_RINGS = 3;

/**
 * One meteor's geometry, derived from a single angle.
 *
 * This is the fix for the trail pointing the wrong way. A meteor's tail lies
 * *along* its velocity, so the rotation and the displacement have to come
 * from one number. CSS `rotate()` is clockwise, which sends a downward bar
 * to the left — so travelling down-and-right needs a *negative* rotation,
 * and the displacement is that same angle resolved into components.
 *
 * `--dy` is fixed at the distance needed to clear the viewport; `--dx` is
 * whatever that implies at this angle, rather than a number picked to look
 * about right.
 */
function meteorGeometry(index: number) {
  // 14deg to 34deg from vertical. Varied so the shower does not look combed,
  // bounded so no streak travels so flat it reads as a horizontal wipe.
  const deg = 14 + ((index * 7) % 21);
  const rad = (deg * Math.PI) / 180;
  const travel = 165; // vh — comfortably past the bottom edge from -22vh
  return {
    rot: -deg,
    dx: `${(Math.tan(rad) * travel).toFixed(1)}vh`,
    dy: `${travel}vh`,
    // Faster streaks are longer, which is the other half of reading as speed.
    len: `${16 + (index % 4) * 5}vh`,
  };
}

export function Cataclysm({ rank, replayKey }: Props) {
  const color = RANK_META[rank].color;

  if (rank === "APEX") {
    return (
      <span
        key={replayKey}
        className="cataclysm"
        aria-hidden="true"
        style={{ ["--cat-color" as string]: color, ["--cat-dur" as string]: "2600ms" }}
      >
        <span className="cat-skyglow" />
        {Array.from({ length: METEORS }, (_, i) => {
          const g = meteorGeometry(i);
          return (
            <span
              key={i}
              className="cat-meteor"
              style={
                {
                  // Start left of the viewport too, since every streak drifts
                  // right — otherwise the left edge stays empty throughout.
                  "--mx": `${-45 + (150 / METEORS) * i}%`,
                  "--md": `${(i % 7) * 150 + (i % 4) * 55}ms`,
                  "--rot": `${g.rot}deg`,
                  "--dx": g.dx,
                  "--dy": g.dy,
                  "--len": g.len,
                } as React.CSSProperties
              }
            />
          );
        })}
      </span>
    );
  }

  return (
    <span key={replayKey} className="cataclysm" aria-hidden="true" style={{ ["--cat-color" as string]: color }}>
      <span className="cat-dim" />
      <span className="cat-halo" />

      {/* Staggered rings reading as space bending outward from the well. */}
      {Array.from({ length: WARP_RINGS }, (_, i) => (
        <span key={`w${i}`} className="cat-warp" style={{ ["--wd" as string]: `${i * 420}ms` }} />
      ))}

      {/* Order is the effect: matter, then the disc, then the photon ring,
          then the horizon on top — so the black centre genuinely occludes
          everything falling into it rather than sitting behind it. */}
      {Array.from({ length: PULL_SPOKES }, (_, i) => (
        <span
          key={`p${i}`}
          className="cat-pull"
          style={
            {
              "--a": `${(360 / PULL_SPOKES) * i}deg`,
              "--md": `${(i % 6) * 110}ms`,
            } as React.CSSProperties
          }
        />
      ))}

      <span className="cat-disk" />
      <span className="cat-photon" />
      <span className="cat-hole" />
      <span className="cat-shock" />
    </span>
  );
}
