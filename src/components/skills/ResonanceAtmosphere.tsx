"use client";

import { useEffect, useMemo } from "react";
import { GRADE_VISUALS } from "@/lib/resonance-visuals";
import type { LoadoutResonance } from "@/lib/loadout-sets";

/**
 * The app's ambient sky, driven by what the loadout adds up to.
 *
 * The whole point is the *contrast*. With nothing equipped the site is
 * deliberately bare — `html[data-res-grade="NONE"]` strips the background
 * gradients, card sheen and accent glow back to flat panels on flat black
 * (see the ATMOSPHERE block in globals.css). Everything decorative is
 * something the loadout puts there, so an empty bar is not a neutral state
 * you stop noticing; it is visibly an unlit room.
 *
 * Layers accumulate rather than swap, so the ceiling reads as an event: at
 * TRANSCENDENT dust, meteors, orbiting bodies, a sun and a black hole are all
 * running at once, and the hole periodically freezes the field around it.
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
 *
 * Renders nothing at NONE beyond the stripping attribute.
 */

interface Props {
  resonance: LoadoutResonance;
  /**
   * Renders inside its own box instead of over the viewport, and does not
   * touch the root attribute.
   *
   * For the reference page, which shows every grade at once: nine fixed
   * full-viewport layers would stack on top of each other, and nine
   * components racing to set `data-res-grade` would leave whichever mounted
   * last deciding how the entire page looks.
   */
  scoped?: boolean;
}

/** Deterministic pseudo-random in [0,1) — never `Math.random()`, which would desync SSR from hydration. */
function rand(i: number, salt: number): number {
  const h = Math.sin((i + 1) * 91.7 + salt * 47.13) * 39113.77;
  return h - Math.floor(h);
}

export function ResonanceAtmosphere({ resonance, scoped = false }: Props) {
  const grade = resonance.grade;
  const rarity = resonance.rarity;
  const visual = GRADE_VISUALS[grade];
  const has = (l: string) => visual.layers.includes(l as never);

  /**
   * Density, not just presence.
   *
   * Each layer is generated at full size once and *sliced* by the current
   * count, so raising rarity adds particles to a field that is already there
   * rather than regenerating it — the existing dust keeps its exact position
   * and phase, and the sky visibly thickens instead of flickering and
   * reshuffling on every equip.
   */
  const dustCount = 8 + Math.round(rarity * 24);
  const meteorCount = 2 + Math.round(rarity * 7);
  const orbitCount = 2 + Math.round(rarity * 3);

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
   * The continuous half of the same signal, on the same element.
   *
   * Separate effect from the grade because it changes far more often — every
   * attach moves rarity, where grade moves maybe five times in an account's
   * life — and because it is a style rather than an attribute. `--atmos-rarity`
   * is registered as a `<number>` in atmosphere.css, so writing it here is
   * what makes the body gradients interpolate rather than snap.
   */
  useEffect(() => {
    if (scoped) return;
    document.documentElement.style.setProperty("--atmos-rarity", rarity.toFixed(3));
    return () => {
      document.documentElement.style.removeProperty("--atmos-rarity");
    };
  }, [rarity, scoped]);

  const dust = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        left: rand(i, 1) * 100,
        top: rand(i, 2) * 100,
        dur: 12 + rand(i, 3) * 16,
        delay: rand(i, 4) * -24,
        size: rand(i, 5) > 0.86 ? 2.5 : 1.5,
      })),
    []
  );

  const meteors = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        top: rand(i, 11) * 70 - 10,
        left: 40 + rand(i, 12) * 70,
        dur: 2.4 + rand(i, 13) * 2.2,
        // Long, staggered gaps — a meteor is an event, and one every few
        // seconds forever would read as rain.
        delay: rand(i, 14) * 26,
        len: 120 + rand(i, 15) * 190,
      })),
    []
  );

  const orbits = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        size: 220 + i * 165,
        dur: 26 + i * 15,
        reverse: i % 2 === 1,
        bodySize: 3 + rand(i, 21) * 4,
        tilt: -18 + rand(i, 22) * 36,
      })),
    []
  );

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

  if (grade === "NONE") return null;

  return (
    <div
      className={scoped ? "atmos atmos-scoped" : "atmos"}
      aria-hidden="true"
      data-grade={grade}
      style={
        {
          "--res-color": visual.color,
          "--res-glow": visual.glow,
          // Also set locally so the scoped variant, which deliberately never
          // touches the root, still evolves on the reference page.
          "--atmos-rarity": rarity.toFixed(3),
        } as React.CSSProperties
      }
    >
      {has("dust") && (
        <div className="atmos-dust">
          {dust.slice(0, dustCount).map((d, i) => (
            <span
              key={i}
              className="atmos-speck"
              style={
                {
                  left: `${d.left}%`,
                  top: `${d.top}%`,
                  width: d.size,
                  height: d.size,
                  "--d": `${d.dur}s`,
                  "--delay": `${d.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {has("meteors") &&
        meteors.slice(0, meteorCount).map((m, i) => (
          <span
            key={i}
            className="atmos-meteor"
            style={
              {
                top: `${m.top}%`,
                left: `${m.left}%`,
                width: m.len,
                "--d": `${m.dur}s`,
                "--delay": `${m.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}

      {has("orbits") && (
        <div className="atmos-system">
          {orbits.slice(0, orbitCount).map((o, i) => (
            <div
              key={i}
              className="atmos-orbit"
              // The tilt lives here and the spin on the child: animating
              // `transform` on one element would overwrite the other.
              style={{
                width: o.size,
                height: o.size,
                transform: `translate(-50%,-50%) rotateX(72deg) rotateZ(${o.tilt}deg)`,
              }}
            >
              <div
                className={`atmos-orbit-spin ${o.reverse ? "rev" : ""}`}
                style={{ "--d": `${o.dur}s` } as React.CSSProperties}
              >
                <span className="atmos-body" style={{ width: o.bodySize, height: o.bodySize }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {has("sun") && (
        <div className="atmos-sun">
          <span className="atmos-sun-core" />
          <span className="atmos-sun-rays" />
        </div>
      )}

      {has("blackhole") && (
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
