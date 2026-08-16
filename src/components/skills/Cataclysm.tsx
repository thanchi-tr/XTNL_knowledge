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
 * Trimmed twice: 18% off the first pass, then a further 40%, landing at
 * 0.49 of the original. The mark was readable long before either hold
 * ended, and dwell past the point of recognition reads as a wait rather
 * than a reward. Apex now holds ~980ms and Ultimate ~1270ms.
 *
 * Prelude is cut by the same factor, never the emblem alone: shortening
 * only the emblem would leave it gone while the collapse still waited to
 * begin, opening a dead beat in the middle of the event.
 */
const EMBLEM_TRIM = 0.49;
const PRELUDE_MS = { APEX: Math.round(1200 * EMBLEM_TRIM), ULTIMATE: Math.round(1800 * EMBLEM_TRIM) } as const;
const EMBLEM_MS = { APEX: Math.round(2000 * EMBLEM_TRIM), ULTIMATE: Math.round(2600 * EMBLEM_TRIM) } as const;
const IMPACTS = 7;
/** The d15 field: out before the collapse, held through it, released after. */
const BLACKOUT_MS = 6400;
/** The violet Apex burns against. Deep enough to read as shadow beside gold, not as a second highlight. */
const APEX_VIOLET = "#6d28d9";
/** Gold streaks run to white-hot; violet streaks run to black. */
const GOLD_BODY = "#ffe9a8";
const VIOLET_BODY = "#05010a";
const VIOLET_HEAD = "#1a0033";
/** Glyph marks around the d13 circle. */
const TICKS = 16;

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
    // Ring radii in a 0..100 viewBox. Counter-rotating pairs, and dash
    // patterns chosen so no two rings resolve into the same broken circle.
    const rings = [
      { r: 46, w: 1.2, dash: "6 10", spin: "26s", dir: "360deg", draw: 1000, delay: 0 },
      { r: 38, w: 1.8, dash: "289", spin: "0s", dir: "0deg", draw: 900, delay: 140 },
      { r: 30, w: 1.0, dash: "3 7", spin: "17s", dir: "-360deg", draw: 800, delay: 280 },
      { r: 21, w: 1.5, dash: "132", spin: "12s", dir: "360deg", draw: 700, delay: 420 },
    ];
    return (
      <span
        key={replayKey}
        className="cataclysm"
        aria-hidden="true"
        style={{ "--cat-color": color, "--cat-dur": "2600ms" } as React.CSSProperties}
      >
        <span className="cat-inscribe-ground" />
        <span className="cat-inscribe">
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            {rings.map((ring, i) => (
              <circle
                key={`r${i}`}
                className="cat-ring"
                cx="50"
                cy="50"
                r={ring.r}
                strokeWidth={ring.w}
                style={
                  {
                    "--dash": ring.dash,
                    "--spin": ring.spin,
                    "--dir": ring.dir,
                    "--draw": `${ring.draw}ms`,
                    "--rd": `${ring.delay}ms`,
                  } as React.CSSProperties
                }
              />
            ))}

            {/* Glyph ticks around the outer ring, struck in sequence. */}
            {Array.from({ length: TICKS }, (_, i) => {
              const a = (360 / TICKS) * i;
              const rad = (a * Math.PI) / 180;
              const inner = 40.5;
              const outer = i % 3 === 0 ? 51 : 48;
              return (
                <line
                  key={`t${i}`}
                  className="cat-tick"
                  x1={50 + Math.cos(rad) * inner}
                  y1={50 + Math.sin(rad) * inner}
                  x2={50 + Math.cos(rad) * outer}
                  y2={50 + Math.sin(rad) * outer}
                  style={{ ["--td" as string]: `${260 + i * 42}ms` }}
                />
              );
            })}
          </svg>
        </span>
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
            // Apex burns gold against deep violet — the rank's own hue lit
            // against the arcane one, so the shower reads as two materials
            // rather than one colour at two brightnesses.
            "--cat-color-2": APEX_VIOLET,
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
                ...(i % 2 === 1 ? { "--streak": APEX_VIOLET } : {}),
                // Impacts keep white cores either way — a strike is a strike.
              } as React.CSSProperties
            }
          />
        ))}
        {Array.from({ length: METEORS }, (_, i) => {
          const g = meteorGeometry(i);
          const dark = i % 3 === 2;
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
                  // Every third streak is the dark material, so the two are
                  // interleaved rather than split into two visible groups.
                  // Written flat rather than spread: a conditional spread makes
                  // the object a union, and the `as CSSProperties` cast then
                  // fails because neither branch overlaps it.
                  "--streak": dark ? APEX_VIOLET : color,
                  "--streak-body": dark ? VIOLET_BODY : GOLD_BODY,
                  "--streak-head": dark ? VIOLET_HEAD : "#fff",
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
          "--blackout-dur": `${BLACKOUT_MS}ms`,
          "--emblem-dur": `${EMBLEM_MS.ULTIMATE}ms`,
        } as React.CSSProperties
      }
    >
      <span className="cat-dim" />

      {/* First in the stack, so every layer below is drawn *on top* of it.
          The page goes out during the emblem hold and stays out for the whole
          collapse, which is what gives the horizon something to be darker
          than. Ordering is the entire trick here — as the last child it was
          a curtain dropped after the show. */}
      <span className="cat-blackout" />

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
      {/* Above the disc, below the horizon — light bent over the top. */}
      <span className="cat-lens-arc" />
      <span className="cat-photon" />
      <span className="cat-hole" />
      <span className="cat-shock" />
    </span>
  );
}
