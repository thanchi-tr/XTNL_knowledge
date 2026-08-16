import type { ResonanceGrade } from "./loadout-sets";

/**
 * How a resonance grade looks in the loadout bar.
 *
 * The ramp deliberately reuses the skill-rarity hues already established in
 * `globals.css` — green, blue, violet, gold, prismatic pink. A player who has
 * learned that violet means Capstone reads a violet footer as "this is
 * Capstone-hard" without being told, and inventing a second, unrelated colour
 * language for the same idea would throw that away.
 *
 * Intensity escalates on four independent channels rather than just getting
 * brighter, so the top grades are distinguishable from each other and not
 * merely from the bottom: the accent hue, the strength of the lighting, the
 * number of drifting motes, and whether a light sweep crosses the bar.
 *
 * `motes` is a count, not a density — the particle layer sizes itself to the
 * bar, and a fixed count keeps the cost bounded on a phone. Every animation
 * involved is opt-in pausable (see the POWER block in globals.css), so a
 * backgrounded tab or a battery below 20% stops paying for any of it.
 */

/**
 * NOTE: the app-wide atmosphere no longer keys off the grade at all.
 *
 * It used to: each grade added one more phenomenon, cumulatively, and
 * TRANSCENDENT ran all five at once. But a single Apex satisfying a single
 * shape already reached TRANSCENDENT, so in practice there was one scene and
 * everyone stood in it. The scene now comes from the depth ladder — see
 * `src/lib/sky.ts` — and what survives here is the *bar's* own styling,
 * which is what this file was always really about.
 */

export interface GradeVisual {
  label: string;
  /** Primary accent — border, text, particle colour. */
  color: string;
  /** Lighting wash behind the bar. */
  glow: string;
  /** Drifting particles in the bar's aura. 0 disables the layer entirely. */
  motes: number;
  /** A slow light sweep across the bar. Reserved for the top three grades. */
  sweep: boolean;
  /** One line naming what the loadout has achieved. */
  tagline: string;
}

export const GRADE_VISUALS: Record<ResonanceGrade, GradeVisual> = {
  NONE: {
    label: "Unlinked",
    color: "#5a7490",
    glow: "rgba(90,116,144,0)",
    motes: 0,
    sweep: false,
    tagline: "No emblems in combination — each is working alone.",
  },
  FAINT: {
    label: "Faint",
    color: "#00cc7a",
    glow: "rgba(0,204,122,0.16)",
    motes: 6,
    sweep: false,
    tagline: "A first pattern holds.",
  },
  ALIGNED: {
    label: "Aligned",
    color: "#4d9cf5",
    glow: "rgba(77,156,245,0.20)",
    motes: 10,
    sweep: false,
    tagline: "The set is deliberate now.",
  },
  HARMONIC: {
    label: "Harmonic",
    color: "#9b6bff",
    glow: "rgba(155,107,255,0.26)",
    motes: 14,
    sweep: true,
    tagline: "Bodies have found orbits around you.",
  },
  RESONANT: {
    label: "Resonant",
    color: "#f0a030",
    glow: "rgba(240,160,48,0.30)",
    motes: 18,
    sweep: true,
    tagline: "A star at the centre of it, burning.",
  },
  TRANSCENDENT: {
    label: "Transcendent",
    color: "#ff5eb0",
    glow: "rgba(255,94,176,0.34)",
    motes: 24,
    sweep: true,
    tagline: "Light bends around this. Time comes apart.",
  },
};

export interface Mote {
  /** Percent across the bar. */
  left: number;
  /** Percent down the bar. */
  top: number;
  delaySec: number;
  durationSec: number;
  size: number;
}

/**
 * Deterministic mote placement.
 *
 * Emphatically not `Math.random()`: the bar renders on the server and
 * hydrates on the client, and a random layout differs between the two. React
 * treats that as a hydration mismatch and discards the server tree — which in
 * this app has already cost every click handler on the page once, when a
 * locale-dependent date did the same thing. A hash of the index gives a
 * scattered but reproducible layout.
 */
export function motesFor(count: number, seed = 1): Mote[] {
  const out: Mote[] = [];
  for (let i = 0; i < count; i++) {
    const h = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const a = h - Math.floor(h);
    const g = Math.sin((i + 1) * 39.3468 + seed * 11.135) * 24634.6345;
    const b = g - Math.floor(g);
    out.push({
      left: Math.round(a * 1000) / 10,
      top: Math.round(b * 800) / 10 + 10,
      delaySec: Math.round(a * 40) / 10,
      durationSec: 3.4 + Math.round(b * 30) / 10,
      size: b > 0.82 ? 3 : b > 0.5 ? 2 : 1.5,
    });
  }
  return out;
}
