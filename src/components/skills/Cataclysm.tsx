"use client";

import { RANK_META } from "@/lib/skill-visuals";
import { SkillLogo } from "./SkillLogo";
import { depthOf } from "@/lib/skill-form";
import { themeFor } from "@/lib/attribute-themes";
import type { Skill } from "@/lib/skill-pool";

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
  /** The emblem being slotted — shown at the centre before it is consumed. */
  skill: Skill;
  /** Bumping this remounts the layer, which is what replays a one-shot. */
  replayKey: number;
}

/**
 * How long the emblem holds the screen before the event takes it.
 *
 * Trimmed 18% from the first pass — the mark was readable well before the
 * hold ended, and the extra dwell pushed the whole event past the point
 * where it still felt like a reward rather than a wait. Prelude is cut by
 * the same factor, not just the emblem: shortening only the emblem would
 * leave it gone while the collapse still waited to begin.
 */
const EMBLEM_TRIM = 0.82;
const PRELUDE_MS = { APEX: Math.round(1200 * EMBLEM_TRIM), ULTIMATE: Math.round(1800 * EMBLEM_TRIM) } as const;
const EMBLEM_MS = { APEX: Math.round(2000 * EMBLEM_TRIM), ULTIMATE: Math.round(2600 * EMBLEM_TRIM) } as const;
const IMPACTS = 7;
const AURORA_BANDS = 3;

/**
 * Which page event a depth earns.
 *
 * The ladder is 15 rungs and only the top three deserve a full-screen
 * event; below that the slot burst and the bar charge already say enough.
 * d11 and d12 are folded into `shimmer` rather than left blank — a dead gap
 * between the mid-tiers and the bloom would read as a bug, not as restraint.
 */
export type CataclysmTier = "collapse" | "meteor" | "bloom" | "shimmer" | "none";

export function tierForDepth(depth: number): CataclysmTier {
  if (depth >= 15) return "collapse";
  if (depth === 14) return "meteor";
  if (depth === 13) return "bloom";
  if (depth >= 5) return "shimmer";
  return "none";
}

const METEORS = 30;
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

export function Cataclysm({ skill, replayKey }: Props) {
  const depth = depthOf(skill);
  const tier = tierForDepth(depth);
  if (tier === "none") return null;

  // Terminal ranks are read by rank first; everything below is read by the
  // attribute it trains, which is what its emblem is coloured by too.
  const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
  const color = legendary ? RANK_META[skill.rank].color : themeFor(skill.attributes[0]).color;

  if (tier === "shimmer") {
    return (
      <span
        key={replayKey}
        className="cataclysm"
        aria-hidden="true"
        style={
          {
            "--cat-color": color,
            "--cat-dur": `${1100 + (depth - 5) * 45}ms`,
            // Climbs gently across the band so d10 is perceptibly more than
            // d5 without either becoming loud.
            "--sh-peak": (0.42 + (depth - 5) * 0.045).toFixed(2),
            "--sh-x": "50%",
          } as React.CSSProperties
        }
      >
        <span className="cat-shimmer" />
      </span>
    );
  }

  if (tier === "bloom") {
    return (
      <span
        key={replayKey}
        className="cataclysm"
        aria-hidden="true"
        style={
          {
            "--cat-color": color,
            "--cat-dur": "2600ms",
            "--prelude": "700ms",
          } as React.CSSProperties
        }
      >
        {Array.from({ length: AURORA_BANDS }, (_, i) => (
          <span
            key={`a${i}`}
            className="cat-aurora"
            style={
              {
                "--au-tilt": `${88 + i * 16}deg`,
                "--ad": `${i * 260}ms`,
              } as React.CSSProperties
            }
          />
        ))}
        <span className="cat-bloom-ring" />
      </span>
    );
  }

  if (tier === "meteor") {
    return (
      <span
        key={replayKey}
        className="cataclysm"
        aria-hidden="true"
        style={
          {
            "--cat-color": color,
            "--cat-dur": "3400ms",
            "--emblem-dur": `${EMBLEM_MS.APEX}ms`,
          } as React.CSSProperties
        }
      >
        <span className="cat-skyglow" />
        <span className="cat-ground" />

        <span className="cat-emblem">
          <SkillLogo skill={skill} size={132} />
        </span>
        <span className="cat-emblem-ring" />

        {/* Impacts land along the bottom as the first streaks reach it. */}
        {Array.from({ length: IMPACTS }, (_, i) => (
          <span
            key={`i${i}`}
            className="cat-impact"
            style={
              {
                "--ix": `${8 + (84 / (IMPACTS - 1)) * i}%`,
                "--id": `${PRELUDE_MS.APEX + 300 + (i % 5) * 210}ms`,
              } as React.CSSProperties
            }
          />
        ))}
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
                  // Offset past the prelude so the rain begins once the
                  // emblem is on screen rather than obscuring its arrival.
                  "--md": `${PRELUDE_MS.APEX + (i % 9) * 130 + (i % 4) * 55}ms`,
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
    <span
      key={replayKey}
      className="cataclysm"
      aria-hidden="true"
      style={
        {
          "--cat-color": color,
          "--cat-dur": "5600ms",
          "--prelude": `${PRELUDE_MS.ULTIMATE}ms`,
          "--emblem-dur": `${EMBLEM_MS.ULTIMATE}ms`,
        } as React.CSSProperties
      }
    >
      <span className="cat-dim" />

      {/* The mark arrives, is read, and is then crushed inward — the well
          opens underneath it rather than on an empty page. */}
      <span className="cat-emblem">
        <SkillLogo skill={skill} size={148} />
      </span>
      <span className="cat-emblem-ring" />

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
