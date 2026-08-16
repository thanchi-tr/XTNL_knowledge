import type { Skill } from "./skill-pool";
import { depthOf } from "./skill-form";
import type { LoadoutResonance } from "./loadout-sets";

/**
 * Which sky the loadout is standing under.
 *
 * Previously the background had exactly one variable: the resonance grade,
 * five rungs, and the top rung — magenta light and a black hole — was reached
 * by a single Apex emblem satisfying a single shape. So nearly every real
 * loadout looked identical, and the rarest thing in the game was also the
 * most common thing on screen.
 *
 * Two changes fix that. The hole is *reserved* (see `reservesTheHole`), and
 * everything below it gets its own sky rather than a dimmer copy of the same
 * one.
 *
 * ── Why fifteen ──────────────────────────────────────────
 * The depth ladder already has fifteen rungs — `depthOf` returns 1–15 across
 * Pure I through Ultimate — and it is the number a player is already reading
 * off their emblems. Inventing a separate scale for the background would mean
 * two ladders to learn; indexing the skies by peak depth means the sky *is*
 * the readout. The deepest emblem equipped picks it, because a loadout is
 * remembered by its best piece.
 *
 * ── Why futuristic at the bottom ─────────────────────────
 * The ladder runs neon and chrome at d1 to primordial firelight at d15: the
 * further you go, the further back you reach. Progress fiction usually runs
 * the other way, toward more technology, but this app is a magician's
 * workshop — its whole visual language is sigils and arcane circles — and in
 * that language the oldest thing is the most powerful. It also leaves the
 * ladder somewhere to end: "the first light there ever was" is a ceiling in a
 * way that "an even better spaceship" is not.
 */

/** Distinct visual elements a sky can mount. Each is one physical idea. */
export type SkyMotif =
  | "grid"
  | "datastream"
  | "orbital"
  | "terraform"
  | "aurora"
  | "storm"
  | "cinder"
  | "glacier"
  | "verdance"
  | "cathedral"
  | "sanctum"
  | "runeflow"
  | "dunes"
  | "monolith"
  | "firstlight";

/** How a sky's particles move. Direction is the cheapest way to tell two apart. */
export type SkyDrift =
  | "none"
  | "fall-fast"
  | "fall-slow"
  | "rise"
  | "cross"
  | "wander"
  | "settle";

export interface Sky {
  /** Depth rung this sky belongs to, 1–15. */
  depth: number;
  id: string;
  /** Shown in the footer and the reference page. */
  name: string;
  /** Where on the futuristic→ancient run this sits. One or two words. */
  era: string;
  /** Primary hue, as a bare `r g b` triplet so alpha can be computed. */
  rgb: string;
  /** Secondary hue, for the counter-light and particle accents. */
  rgb2: string;
  motif: SkyMotif;
  drift: SkyDrift;
  /**
   * How many particles at full rarity. 0 disables the layer.
   *
   * Kept deliberately low. Each particle is a separately composited layer
   * running its own infinite animation, and this is a background — thirty of
   * them was more layers than the rest of the page uses in total, spent on
   * the one thing nobody is looking directly at.
   */
  particles: number;
  /** One line naming what you are standing in. */
  tagline: string;
}

/**
 * The ladder, futuristic (d1) to ancient (d15).
 *
 * Each entry differs from its neighbours in *motif* and in *drift direction*,
 * not only in hue — the lesson from the twelve cataclysm variants was that
 * recolouring one effect fifteen times reads as one effect, and teaches the
 * player the distinction is meaningless. Consecutive rungs never share a
 * drift: fall, rise, cross and wander alternate the whole way up.
 */
export const SKY_LADDER: readonly Sky[] = [
  {
    depth: 1,
    id: "grid",
    name: "Neon Grid",
    era: "Near future",
    rgb: "122 214 255",
    rgb2: "255 96 158",
    motif: "grid",
    drift: "cross",
    particles: 8,
    tagline: "A lattice of light, receding to a vanishing point.",
  },
  {
    depth: 2,
    id: "datastream",
    name: "Datastream",
    era: "Machine age",
    rgb: "124 226 172",
    rgb2: "70 146 198",
    motif: "datastream",
    drift: "fall-fast",
    particles: 12,
    tagline: "Information falling faster than it can be read.",
  },
  {
    depth: 3,
    id: "orbital",
    name: "Orbital",
    era: "Space age",
    rgb: "150 188 238",
    rgb2: "224 234 252",
    motif: "orbital",
    drift: "cross",
    particles: 9,
    tagline: "Structures holding station above a dark curve.",
  },
  {
    depth: 4,
    id: "terraform",
    name: "Terraform",
    era: "Colonial",
    rgb: "108 206 192",
    rgb2: "228 172 110",
    motif: "terraform",
    drift: "rise",
    particles: 11,
    tagline: "An atmosphere still being argued into existence.",
  },
  {
    depth: 5,
    id: "aurora",
    name: "Aurora",
    era: "Industrial north",
    rgb: "134 232 194",
    rgb2: "158 130 226",
    motif: "aurora",
    drift: "wander",
    particles: 10,
    tagline: "Curtains of charged air, moving without wind.",
  },
  {
    depth: 6,
    id: "storm",
    name: "Skyfall",
    era: "Age of sail",
    rgb: "164 190 220",
    rgb2: "96 120 156",
    motif: "storm",
    drift: "fall-fast",
    particles: 16,
    tagline: "Weather with an opinion about you.",
  },
  {
    depth: 7,
    id: "cinder",
    name: "Cinder",
    era: "Forge age",
    rgb: "232 148 88",
    rgb2: "186 68 48",
    motif: "cinder",
    drift: "rise",
    particles: 12,
    tagline: "Everything here was made by being burned first.",
  },
  {
    depth: 8,
    id: "glacier",
    name: "Glacier",
    era: "Last ice",
    rgb: "192 222 240",
    rgb2: "122 158 200",
    motif: "glacier",
    drift: "settle",
    particles: 14,
    tagline: "Slow enough that the cold seems patient.",
  },
  {
    depth: 9,
    id: "verdance",
    name: "Verdance",
    era: "Old forest",
    rgb: "148 198 138",
    rgb2: "226 210 152",
    motif: "verdance",
    drift: "wander",
    particles: 12,
    tagline: "Light arriving late, through a great deal of leaf.",
  },
  {
    depth: 10,
    id: "cathedral",
    name: "Cathedral",
    era: "High medieval",
    rgb: "236 198 138",
    rgb2: "138 160 224",
    motif: "cathedral",
    drift: "fall-slow",
    particles: 11,
    tagline: "Coloured light, falling a very long way.",
  },
  {
    depth: 11,
    id: "sanctum",
    name: "Sanctum",
    era: "Monastic",
    rgb: "236 184 122",
    rgb2: "180 100 72",
    motif: "sanctum",
    drift: "rise",
    particles: 10,
    tagline: "Small flames, kept alight by someone for a long time.",
  },
  {
    depth: 12,
    id: "runeflow",
    name: "Runeflow",
    era: "First writing",
    rgb: "176 150 230",
    rgb2: "230 202 156",
    motif: "runeflow",
    drift: "wander",
    particles: 9,
    tagline: "Marks that meant something before anyone wrote them down.",
  },
  {
    depth: 13,
    id: "dunes",
    name: "Dunes",
    era: "Bronze",
    rgb: "222 188 142",
    rgb2: "164 118 82",
    motif: "dunes",
    drift: "cross",
    particles: 12,
    tagline: "A country that has buried more than it has kept.",
  },
  {
    depth: 14,
    id: "monolith",
    name: "Monolith",
    era: "Neolithic",
    rgb: "192 176 156",
    rgb2: "126 114 142",
    motif: "monolith",
    drift: "settle",
    particles: 11,
    tagline: "Raised by people who left nothing else behind.",
  },
  {
    depth: 15,
    id: "firstlight",
    name: "First Light",
    era: "Before",
    rgb: "240 142 104",
    rgb2: "224 92 130",
    motif: "firstlight",
    drift: "rise",
    particles: 12,
    tagline: "The oldest light there is, still arriving.",
  },
];

/** Minimum members a d14-only set needs before it counts as a "full" one. */
const FULL_APEX_MEMBERS = 3;

/**
 * Whether this loadout has earned the black hole.
 *
 * The reserve is the point. A singularity that shows up for one Apex is
 * scenery; one that shows up for a lineage terminus is an event, and the
 * whole reason to chase a terminus. Two ways in, and only two:
 *
 *  - **Any Ultimate.** One is enough. It is the top of a lineage and there
 *    are only 39 of them in a 749-emblem pool.
 *  - **A full d14 combo.** Not merely owning Apexes — a *satisfied set* whose
 *    every member is d14 or deeper, at least three of them. Composition at
 *    that depth is as hard as a terminus and should read as such.
 *
 * Deliberately not "enough Apexes equipped": that would be accumulation, and
 * the whole set system exists to reward composition over accumulation.
 */
export function reservesTheHole(active: Skill[], resonance: LoadoutResonance): boolean {
  if (active.some((s) => s.rank === "ULTIMATE")) return true;
  return resonance.sets.some(
    (set) => set.members.length >= FULL_APEX_MEMBERS && set.members.every((m) => depthOf(m) >= 14)
  );
}

export interface SkyResolution {
  sky: Sky | null;
  /** 1–15, or 0 for an empty bar. */
  depth: number;
  /** Whether the reserved singularity is mounted on top of the sky. */
  singularity: boolean;
}

/**
 * Picks the sky from the deepest emblem equipped.
 *
 * Peak rather than mean: a loadout is remembered by its best piece, and
 * averaging would mean slotting a Pure I into a finished build visibly
 * *downgrades* the room, which is a bad thing to teach.
 */
export function skyFor(active: Skill[], resonance: LoadoutResonance): SkyResolution {
  if (active.length === 0) return { sky: null, depth: 0, singularity: false };

  let peak = 0;
  for (const s of active) peak = Math.max(peak, depthOf(s));
  const sky = SKY_LADDER[Math.min(SKY_LADDER.length, Math.max(1, peak)) - 1] ?? null;

  return { sky, depth: peak, singularity: reservesTheHole(active, resonance) };
}
