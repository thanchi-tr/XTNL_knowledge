import type { Attribute } from "@prisma/client";
import { ATTRIBUTES } from "./attributes";
import type { Skill, SkillRank } from "./skill-pool";
import { PURE_MAX_TIER, CAPSTONE_MAX_TIER } from "./skill-pool";
import { RANK_META } from "./skill-visuals";
import { themeFor } from "./attribute-themes";

/**
 * The emblem grammar: how a skill's rank and tier become a *form*.
 *
 * The problem this replaces: the old emblem escalated almost entirely
 * through stroke width, so across eight Pure tiers a player saw the same
 * polygon get slightly thicker. Tiers 1 and 2 were indistinguishable, and
 * arriving at tier 8 — the end of a lineage that costs 64 mastery points —
 * looked like arriving at tier 7. An unlock has to *look* like it cost
 * something.
 *
 * So each step now adds a genuinely new constructional element rather than
 * more of the last one. Read down the `FORM_SKINS` table and the emblem
 * visibly acquires an inner echo, then vertices, then a core, then a
 * containment ring, then spokes, then a corona — six recognisable silhouette
 * changes, each one a thing you can point at.
 *
 * Pure/DB-free so both the server emblem and the client celebration render
 * from the same source.
 */

export interface FormSkin {
  /** 0..1 along the whole ladder. Drives colour temperature and glow. */
  charge: number;
  strokeWidth: number;
  /** Fill under the primary polygon. */
  fillOpacity: number;
  /** A second, rotated polygon inside the first. */
  innerEcho: boolean;
  /** Dots on every vertex of the primary polygon. */
  vertexNodes: boolean;
  /** Radius of the solid centre, 0 for none. */
  coreRadius: number;
  /** A containing circle around the whole mark. */
  outerRing: boolean;
  /** Lines from the core out to each vertex. */
  spokes: boolean;
  /** Second outer ring plus heavy glow — the "this is finished" signal. */
  corona: boolean;
  /** Orbiting particles, when animation is enabled. */
  motes: number;
}

const BASE: FormSkin = {
  charge: 0,
  strokeWidth: 1.4,
  fillOpacity: 0,
  innerEcho: false,
  vertexNodes: false,
  coreRadius: 0,
  outerRing: false,
  spokes: false,
  corona: false,
  motes: 0,
};

/**
 * The eight Pure steps. Every row differs from the one above by at least
 * one structural element, never by stroke width alone.
 */
const PURE_STEPS: Partial<FormSkin>[] = [
  { strokeWidth: 1.4 },
  { strokeWidth: 1.7, fillOpacity: 0.07 },
  { strokeWidth: 1.9, fillOpacity: 0.09, innerEcho: true },
  { strokeWidth: 2.0, fillOpacity: 0.1, innerEcho: true, vertexNodes: true },
  { strokeWidth: 2.1, fillOpacity: 0.12, innerEcho: true, vertexNodes: true, coreRadius: 3.2 },
  { strokeWidth: 2.2, fillOpacity: 0.14, innerEcho: true, vertexNodes: true, coreRadius: 3.6, outerRing: true },
  {
    strokeWidth: 2.3,
    fillOpacity: 0.16,
    innerEcho: true,
    vertexNodes: true,
    coreRadius: 4,
    outerRing: true,
    spokes: true,
    motes: 2,
  },
  {
    strokeWidth: 2.5,
    fillOpacity: 0.2,
    innerEcho: true,
    vertexNodes: true,
    coreRadius: 4.6,
    outerRing: true,
    spokes: true,
    corona: true,
    motes: 3,
  },
];

/** Where a skill sits on the whole ladder, 1..15. Mirrors the tree's own depth axis. */
export function depthOf(skill: Skill): number {
  switch (skill.rank) {
    case "PURE":
    case "SYNERGY":
      return skill.tier;
    case "CAPSTONE":
      return PURE_MAX_TIER + skill.tier;
    case "APEX":
      return PURE_MAX_TIER + CAPSTONE_MAX_TIER + 1;
    case "ULTIMATE":
      return PURE_MAX_TIER + CAPSTONE_MAX_TIER + 2;
  }
}

const MAX_DEPTH = PURE_MAX_TIER + CAPSTONE_MAX_TIER + 2;

export function skinFor(skill: Skill): FormSkin {
  const depth = depthOf(skill);
  const charge = Math.min(1, depth / MAX_DEPTH);

  // Synergy and Capstone borrow the Pure ladder's steps, indexed by their
  // own position on the shared depth axis — so a Capstone I never looks
  // less finished than the Pure VIII it was built from.
  const stepIndex = Math.min(PURE_STEPS.length - 1, Math.max(0, depth - 1));
  const step = PURE_STEPS[stepIndex];

  const skin: FormSkin = { ...BASE, ...step, charge };

  if (skill.rank === "SYNERGY") {
    // Two overlapping bodies carry the "two attributes" idea; a heavy core
    // would hide the lens where they meet, which is the whole point.
    return { ...skin, coreRadius: 0, spokes: false, motes: Math.min(2, skin.motes) };
  }
  if (skill.rank === "CAPSTONE") {
    return { ...skin, outerRing: true, motes: Math.max(2, skin.motes) };
  }
  if (skill.rank === "APEX") {
    return { ...skin, ...PURE_STEPS[PURE_STEPS.length - 1], charge, outerRing: true, corona: true, motes: 6 };
  }
  if (skill.rank === "ULTIMATE") {
    return { ...skin, ...PURE_STEPS[PURE_STEPS.length - 1], charge: 1, outerRing: true, corona: true, motes: 9 };
  }
  return skin;
}

/** Attribute decides silhouette: 3..7 sides, stable per attribute. */
export function sidesFor(attribute: Attribute): number {
  return 3 + (ATTRIBUTES.indexOf(attribute) % 5);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Cold slate at the bottom of a ladder — a tier-I emblem should look unfinished. */
const COLD = "#3a4a5c";

export interface EmblemPalette {
  /** Outer stroke — climbs from cold slate toward the attribute's own hue. */
  edge: string;
  /** Inner detail and core. */
  inner: string;
  /** Glow/aura and particles. */
  glow: string;
  /** Accent used for vertices and ring nodes. */
  accent: string;
}

/**
 * Colour is a function of *charge*, not just identity: a Pure I sits near
 * cold slate and a Pure VIII arrives at the attribute's full hue, so the
 * ladder reads as something heating up. Capstone and above hand the edge
 * over to the rank colour, which is what makes the fan-in ranks legible
 * across a tree of otherwise attribute-coloured nodes.
 */
export function paletteFor(skill: Skill): EmblemPalette {
  const theme = themeFor(skill.attributes[0]);
  const rank = RANK_META[skill.rank].color;
  const { charge } = skinFor(skill);

  const legendary = skill.rank === "APEX" || skill.rank === "ULTIMATE";
  const edgeTarget = skill.rank === "PURE" || skill.rank === "SYNERGY" ? theme.color : rank;

  return {
    edge: mix(COLD, edgeTarget, Math.min(1, 0.25 + charge * 0.85)),
    inner: mix(COLD, theme.bright, Math.min(1, 0.15 + charge)),
    glow: legendary ? rank : theme.color,
    accent: legendary ? rank : theme.bright,
  };
}

export const RANK_OF: Record<SkillRank, string> = {
  PURE: "Pure",
  SYNERGY: "Synergy",
  CAPSTONE: "Capstone",
  APEX: "Apex",
  ULTIMATE: "Ultimate",
};

/**
 * Terminal aura: a soft radial light behind the two ranks that end a path.
 *
 * A distinct hue from the emblem's own — purple under Ultimate's magenta,
 * yellow under Apex's amber — so the halo reads as light the mark is
 * *casting* rather than a thicker version of the mark itself. Three stops
 * with the mid-stop carrying most of the alpha is what keeps the edge soft;
 * a two-stop ramp terminates in a visible disc boundary at these radii.
 *
 * Null for every other rank. This is the one visual that says "path ended".
 */
export interface TerminalAura {
  /** Inner colour, at the centre of the falloff. */
  color: string;
  /** Radius in emblem units (64-unit viewBox). */
  radius: number;
  /** Alpha at the centre stop. */
  intensity: number;
}

export function auraFor(skill: Skill): TerminalAura | null {
  if (skill.rank === "ULTIMATE") {
    return { color: "#9b6bff", radius: 31, intensity: 0.5 };
  }
  if (skill.rank === "APEX") {
    return { color: "#ffd24d", radius: 29, intensity: 0.42 };
  }
  return null;
}

// ============================================================================
// Archetype motif
// ============================================================================
//
// The emblem encoded attribute (silhouette), depth (structure) and rank
// (motion) — but nothing at all for *archetype*, which is the one thing that
// says what a skill actually does. The consequence was measurable: 749
// skills collapsed onto ~200 distinguishable emblems, so a Dividend and a
// Ward built from the same attribute at the same tier were pixel-identical
// despite having nothing in common mechanically.
//
// A small glyph at the centre closes that gap. Kept to a few strokes inside
// a ±7 box: it has to survive being rendered at 22px in a tree node, so
// silhouette legibility beats detail every time.

/** Centre glyph per archetype, as SVG path data in the 64×64 emblem space. */
const MOTIFS: Record<string, string> = {
  // Two stacked bars — a ledger line. Yield.
  DIVIDEND: "M25 29h14M25 35h14",
  // A long dwell mark with a waiting dot.
  PATIENCE: "M25 32h11M39.5 32a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
  // Shield chevron.
  WARD: "M32 25l7 3v5c0 3.5-3 6-7 7c-4-1-7-3.5-7-7v-5z",
  // An open arc — something held, not gripped.
  CLEMENCY: "M25 34a7 7 0 0 1 14 0",
  // Expanding chevrons.
  DILATION: "M27 28l5 4-5 4M34 28l5 4-5 4",
  // Ascending steps.
  CRESCENDO: "M25 38h4v-4h4v-4h4v-4h4",
  // A downward hook.
  ANCHOR: "M32 25v11M27 33a5 5 0 0 0 10 0M28 28h8",
  // Three points.
  CROWN: "M25 37l1.5-9 5.5 5 5.5-5 1.5 9z",
  // A braced vertical.
  FORTITUDE: "M32 25v14M28 27h8M28 37h8",
  // A rising droplet.
  WELLSPRING: "M32 25l5 8a5 5 0 0 1-10 0z",
  // A split diamond — the cut that separates.
  DISCERNMENT: "M32 24l7 8-7 8-7-8zM32 24v16",
  // Two linked rings.
  COVENANT: "M29 32a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M33 32a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
  // Concentric arcs.
  RESONANCE: "M28 32a4 4 0 0 1 8 0M25 32a7 7 0 0 1 14 0M31 32h2",
  // Upward triangle.
  APEX: "M32 24l8 14H24z",
  // A burst.
  APOTHEOSIS: "M32 23v18M23 32h18M26 26l12 12M38 26l-12 12",
  // A crossguard.
  SENTINEL: "M32 24v16M26 30h12",
  // An asterisk of paths.
  POLYMATH: "M32 24v16M25 28l14 8M39 28l-14 8",
};

/**
 * The motif for a skill, or null when the emblem is too sparse to carry one.
 *
 * Withheld at depth 1: the first step of a lineage should look plainly
 * unfinished, and an empty centre is the cheapest way to say so.
 */
export function motifFor(skill: Skill): string | null {
  if (depthOf(skill) < 2) return null;
  return MOTIFS[skill.archetypeCode] ?? null;
}

// ============================================================================
// Particles
// ============================================================================
//
// `FormSkin.motes` was a single number, which could only ever escalate by
// "more of the same dot". Motion is the strongest signal the emblem has and
// spending it on one channel wastes it — so the effect is split into five
// independent channels that switch on at different depths. The result is
// that a Capstone doesn't just have *more* particles than a Pure VIII, it
// moves in a recognisably different way.
//
// Everything is deterministic: counts, radii, durations and per-particle
// delays all derive from depth and index, never from `Math.random()`. The
// emblem renders on the server, so a random duration would differ between
// the server and client passes and React would report a hydration mismatch.

export interface ParticleSpec {
  /** Dots orbiting clockwise on the outer radius. */
  orbitals: number;
  /** A second ring turning the other way — reads as depth, not just speed. */
  counterOrbitals: number;
  /** Seconds per full revolution. Higher depth turns *slower*: heavier, more deliberate. */
  orbitSeconds: number;
  /** Points on the containment ring that fade in and out on staggered delays. */
  sparks: number;
  /** Motes that rise from the core and fade — reserved for the very top. */
  embers: number;
  /** Rotating dashed arc segments outside the body. */
  arcs: number;
  /** The centre breathes. */
  corePulse: boolean;
  /** The outer halo breathes, slower and wider than the core. */
  coronaPulse: boolean;
  /** Radiant spikes between the vertices. */
  rays: number;

  // ── Terminal spectacle ──────────────────────────────────────────────
  //
  // Reserved for APEX and ULTIMATE — the only two ranks that end a path,
  // 52 skills out of 749. Everything below is a channel *no other rank
  // has at all*, because escalating the same six channels by count alone
  // made the last two steps read as "more dots" rather than as arrival.
  // These are expensive per emblem and that is the point: they appear on
  // roughly seven percent of the pool, one at a time, on a detail view.

  /** Expanding rings that burst outward and fade, on staggered delays. */
  shockwaves: number;
  /** Tilted ellipses rotating on different axes — an orbital shell, not a flat ring. */
  haloRings: number;
  /** Trailing motes behind each orbital, tapering in size and opacity. */
  cometTails: boolean;
  /** Four-point stars on the outer field. Sharper read than a round spark. */
  sparkleStars: number;
  /** A crossed lens flare over the core. */
  flare: boolean;
  /** The rays breathe in and out rather than sitting static. */
  rayPulse: boolean;
  /** A conic highlight sweeping around the body. */
  conicSweep: boolean;
}

const NO_PARTICLES: ParticleSpec = {
  orbitals: 0,
  counterOrbitals: 0,
  orbitSeconds: 18,
  sparks: 0,
  embers: 0,
  arcs: 0,
  corePulse: false,
  coronaPulse: false,
  rays: 0,
  shockwaves: 0,
  haloRings: 0,
  cometTails: false,
  sparkleStars: 0,
  flare: false,
  rayPulse: false,
  conicSweep: false,
};

/**
 * The particle ladder.
 *
 * Deliberately silent for the first four steps. If a tier-I emblem already
 * shimmered there would be nowhere left to go, and the moment a lineage
 * first starts to *move* — depth 5 — needs to land as an event. Restraint
 * early is what buys the top of the ladder its impact.
 */
export function particlesFor(skill: Skill): ParticleSpec {
  const depth = depthOf(skill);

  if (skill.rank === "ULTIMATE") {
    return {
      orbitals: 4,
      counterOrbitals: 7,
      orbitSeconds: 28,
      sparks: 10,
      embers: 7,
      arcs: 3,
      corePulse: true,
      coronaPulse: true,
      rays: 12,
      // Three halos on different axes read as a shell rather than a disc;
      // three staggered shockwaves keep something always expanding, so the
      // emblem never settles into a static frame.
      shockwaves: 3,
      haloRings: 3,
      cometTails: true,
      sparkleStars: 6,
      flare: true,
      rayPulse: true,
      conicSweep: true,
    };
  }
  if (skill.rank === "APEX") {
    return {
      orbitals: 6,
      counterOrbitals: 4,
      orbitSeconds: 22,
      sparks: 8,
      embers: 0,
      arcs: 2,
      corePulse: true,
      coronaPulse: true,
      rays: 8,
      // Deliberately short of Ultimate on every count, and missing embers
      // and the conic sweep entirely — reaching Apex should feel like the
      // top of a mountain with one peak still visible above it.
      shockwaves: 2,
      haloRings: 2,
      cometTails: true,
      sparkleStars: 4,
      flare: true,
      rayPulse: true,
      conicSweep: false,
    };
  }
  if (skill.rank === "CAPSTONE") {
    // Counter-rotation is the Capstone signature: two archetype paths fused,
    // shown as two rings turning against each other.
    //
    // Every tier must add a channel. `skinFor` clamps all five Capstone
    // depths (9-13) onto the same structural skin, so unlike Pure the
    // particles carry the *entire* escalation here — a version of this that
    // stopped growing at tier 4 made Capstone IV and V pixel-identical
    // despite a 40-point price gap between them.
    const t = skill.tier;
    return {
      ...NO_PARTICLES,
      orbitals: 2 + Math.floor(t / 3), // 2,2,3,3,3
      counterOrbitals: t >= 5 ? 5 : 3,
      // Slower as it deepens: heavier, more deliberate.
      orbitSeconds: 20 + t * 1.5,
      sparks: t >= 3 ? 2 + t : 0, // 0,0,5,6,7
      arcs: t >= 2 ? (t >= 5 ? 2 : 1) : 0,
      corePulse: t >= 4,
      rays: t >= 5 ? 4 : 0,
    };
  }

  // Pure and Synergy share the depth ladder.
  if (depth >= 8) {
    return { ...NO_PARTICLES, orbitals: 3, orbitSeconds: 18, sparks: 4, corePulse: true };
  }
  if (depth >= 7) {
    return { ...NO_PARTICLES, orbitals: 3, orbitSeconds: 16, sparks: 3 };
  }
  if (depth >= 5) {
    return { ...NO_PARTICLES, orbitals: 2, orbitSeconds: 14 };
  }
  return NO_PARTICLES;
}
