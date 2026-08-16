"use client";

import { useEffect, useMemo } from "react";
import { skyFor, type Sky } from "@/lib/sky";
import type { LoadoutResonance } from "@/lib/loadout-sets";
import type { Skill } from "@/lib/skill-pool";

/**
 * The app's ambient sky, driven by what the loadout adds up to.
 *
 * The whole point is the *contrast*. With nothing equipped the site is
 * deliberately bare — `html[data-res-grade="NONE"]` strips the background
 * gradients, card sheen and accent glow back to flat panels on flat black
 * (see the ATMOSPHERE block in atmosphere.css). Everything decorative is
 * something the loadout puts there, so an empty bar is not a neutral state
 * you stop noticing; it is visibly an unlit room.
 *
 * What is put there used to be a single scene at five brightnesses, keyed to
 * the resonance grade — and since one Apex satisfying one shape already
 * reached the top grade, nearly every real loadout stood under the same
 * magenta sky with the same black hole in it. The rarest thing in the game
 * was also the most common thing on screen.
 *
 * Now the *scene* comes from the depth ladder (`src/lib/sky.ts`): fifteen
 * skies, one per rung, futuristic at d1 through primordial at d15, each with
 * its own motif and its own direction of travel. Rarity decides how strongly
 * that scene is present, and the grade keeps its old job of stripping the
 * site bare when nothing is linked. The black hole is no longer a rung at
 * all — it is reserved, and mounts on top of whichever sky you are under.
 *
 * Three rules keep spectacle from becoming a usability problem:
 *
 *  1. It never sits in front of anything. The layer is `position: fixed` with
 *     `z-index: -1` and `pointer-events: none`, so it paints above the page
 *     background and below every pixel of content, and cannot intercept a
 *     click. It is deliberately *not* rendered inside the loadout bar, whose
 *     `isolation: isolate` would trap a negative z-index inside the footer.
 *  2. Opacities stay low. Text contrast is not negotiable, however rare the
 *     combination that earned the effect.
 *  3. Everything loops, so everything opts into `--ambient-play`. A hidden
 *     tab or a phone under 20% battery stops paying for all of it — which is
 *     what makes it affordable to run app-wide rather than on one screen.
 */

interface Props {
  resonance: LoadoutResonance;
  /** The equipped, non-dormant skills — what the sky is chosen from. */
  active: Skill[];
  /**
   * Renders inside its own box instead of over the viewport, and does not
   * touch the root attribute.
   *
   * For the reference page, which shows every sky at once: fifteen fixed
   * full-viewport layers would stack on top of each other, and fifteen
   * components racing to set `data-sky` would leave whichever mounted last
   * deciding how the entire page looks.
   */
  scoped?: boolean;
  /** Overrides the resolved sky. Reference page only. */
  forceSky?: Sky;
  /** Overrides resolved rarity, 0–1. Reference page only. */
  forceRarity?: number;
  /** Overrides the singularity gate. Reference page only. */
  forceSingularity?: boolean;
}

/** Deterministic pseudo-random in [0,1) — never `Math.random()`, which would desync SSR from hydration. */
function rand(i: number, salt: number): number {
  const h = Math.sin((i + 1) * 91.7 + salt * 47.13) * 39113.77;
  return h - Math.floor(h);
}

/**
 * Glyphs for the Runeflow sky.
 *
 * Greek and geometric rather than actual Elder Futhark: runic codepoints are
 * missing from most default stacks and fall back to tofu boxes, which is a
 * conspicuous way to break the one sky whose entire idea is legible marks.
 */
const GLYPHS = ["Δ", "Ω", "Ψ", "Φ", "Σ", "Λ", "Ξ", "△", "▽", "◇", "○", "✦"];

export function ResonanceAtmosphere({
  resonance,
  active,
  scoped = false,
  forceSky,
  forceRarity,
  forceSingularity,
}: Props) {
  const resolved = useMemo(() => skyFor(active, resonance), [active, resonance]);
  const sky = forceSky ?? resolved.sky;
  const rarity = forceRarity ?? resonance.rarity;
  const singularity = forceSingularity ?? resolved.singularity;
  const grade = resonance.grade;

  // Drives the bare-site stripping in atmosphere.css. Set on the root rather
  // than passed through props because it has to reach rules for the body
  // background and every card in the app, none of which this component owns.
  useEffect(() => {
    if (scoped) return;
    document.documentElement.dataset.resGrade = grade;
    return () => {
      delete document.documentElement.dataset.resGrade;
    };
  }, [grade, scoped]);

  /**
   * The continuous channels, on the same element.
   *
   * Separate effect from the grade because these change far more often —
   * every attach moves rarity and can move the sky, where grade moves maybe
   * five times in an account's life. `--atmos-rarity` is registered as a
   * `<number>` in atmosphere.css, so writing it here is what makes the body
   * gradients interpolate rather than snap.
   */
  useEffect(() => {
    if (scoped) return;
    const root = document.documentElement;
    root.style.setProperty("--atmos-rarity", rarity.toFixed(3));
    if (sky) {
      root.style.setProperty("--sky-a", sky.rgb);
      root.style.setProperty("--sky-b", sky.rgb2);
      root.dataset.sky = sky.id;
    }
    return () => {
      root.style.removeProperty("--atmos-rarity");
      root.style.removeProperty("--sky-a");
      root.style.removeProperty("--sky-b");
      delete root.dataset.sky;
    };
  }, [rarity, sky, scoped]);

  /**
   * Particles are generated at full count once and *sliced* to the current
   * count, so raising rarity adds to a field that is already there rather
   * than regenerating it — existing particles keep their exact position and
   * phase, and the sky thickens instead of reshuffling on every equip.
   */
  const particles = useMemo(() => {
    if (!sky) return [];
    return Array.from({ length: sky.particles }, (_, i) => ({
      x: rand(i, 1) * 100,
      y: rand(i, 2) * 100,
      dur: 5 + rand(i, 3) * 14,
      delay: rand(i, 4) * -18,
      size: 1.5 + rand(i, 5) * 3,
      len: 26 + rand(i, 6) * 60,
      dx: (rand(i, 7) - 0.5) * 14,
      dy: (rand(i, 8) - 0.5) * 16,
      glyph: GLYPHS[Math.floor(rand(i, 9) * GLYPHS.length)],
    }));
  }, [sky]);

  /** Matter spiralling into the hole. */
  const infall = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        angle: (360 / 14) * i + rand(i, 31) * 20,
        dur: 3.6 + rand(i, 32) * 3.4,
        delay: rand(i, 33) * -7,
      })),
    []
  );

  if (!sky) return null;

  const shown = Math.max(3, Math.round(sky.particles * (0.3 + rarity * 0.7)));
  const isGlyph = sky.motif === "runeflow";

  return (
    <div
      className={scoped ? "sky sky-scoped" : "sky"}
      aria-hidden="true"
      data-sky={sky.id}
      style={
        {
          "--sky-a": sky.rgb,
          "--sky-b": sky.rgb2,
          "--atmos-rarity": rarity.toFixed(3),
          // The singularity's own layers predate the sky ladder and still
          // read `--res-color`; feeding it the sky hue keeps the hole tinted
          // by whatever it is collapsing.
          "--res-color": `rgb(${sky.rgb})`,
        } as React.CSSProperties
      }
    >
      {/* Three parallax bands plus grain and a vignette. The bands each own
          their own `::before`/`::after`, so a motif gets up to nine paint
          layers out of three DOM nodes — and the depth between them is what
          stops a background reading as wallpaper. */}
      <div className="sky-far" data-motif={sky.motif} />
      <div className="sky-mid" data-motif={sky.motif} />
      <div className="sky-near" data-motif={sky.motif} />

      {particles.slice(0, shown).map((p, i) => (
        <span
          key={i}
          className="sky-p"
          data-drift={sky.drift}
          data-glyph={isGlyph ? "" : undefined}
          style={
            {
              "--x": `${p.x}%`,
              "--y": `${p.y}%`,
              "--s": isGlyph ? `${10 + p.size * 4}px` : `${p.size}px`,
              "--len": `${p.len}px`,
              "--d": `${p.dur}s`,
              "--delay": `${p.delay}s`,
              // Unitless: skies.css multiplies these by `--uw`/`--uh`, which
              // resolve against the container when the sky is scoped.
              "--dx": p.dx.toFixed(2),
              "--dy": p.dy.toFixed(2),
            } as React.CSSProperties
          }
        >
          {isGlyph ? p.glyph : null}
        </span>
      ))}

      {/* Above the motif, below the particles' own light: grain first so it
          textures the scene, vignette last so it also pulls the particles
          away from the edges. */}
      <div className="sky-grain" />
      <div className="sky-vignette" />

      {/* Reserved. Only an Ultimate or a full d14 combo mounts this — see
          `reservesTheHole`. It sits on top of whichever sky you are under
          rather than replacing it, so the singularity reads as something
          that arrived rather than as one more rung. */}
      {singularity && (
        <div className="atmos-hole">
          {/* Order matters: disk, then lensing ring, then the horizon on top,
              so the dark core actually occludes the disk behind it. */}
          <span className="atmos-disk" />
          <span className="atmos-lens" />
          <span className="atmos-horizon" />
          {infall.map((p, i) => (
            <span
              key={i}
              className="atmos-infall"
              style={
                {
                  "--a": `${p.angle}deg`,
                  "--d": `${p.dur}s`,
                  "--delay": `${p.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
          {/* Time coming apart: a slow pulse that washes the field and stalls
              on a stepped timing function, so it stutters rather than eases. */}
          <span className="atmos-freeze" />
        </div>
      )}
    </div>
  );
}
