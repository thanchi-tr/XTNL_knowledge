import type { Attribute } from "@prisma/client";
import type { Skill, SkillRank } from "./skill-pool";

/**
 * Set bonuses: what ten emblems mean *together*.
 *
 * The loadout used to be additive and independent — each slot contributed its
 * printed effect, the fold took the best per kind, and the only question worth
 * asking was "which ten are numerically largest". That makes the bar a
 * leaderboard rather than a decision, and it makes a late account strictly
 * better than an early one at every single slot.
 *
 * So the weight moves off the individual emblem and onto the shape of the
 * collection. A lone emblem now realises `SOLO_SHARE` of its printed power;
 * the rest is unlocked by *composition* — same lineage, same tier, a complete
 * rank spectrum, a tier ladder. Ten unrelated Ultimates are worth noticeably
 * less than a coherent set, which is the whole point.
 *
 * **Low-level loadouts must be able to do something interesting.** `TRIAD`
 * and `CADRE` need three emblems that merely share an archetype or a tier —
 * reachable with nothing but Pure Tier I. They are worth little in absolute
 * terms, and that is correct: what matters is that a new player can *see* a
 * set fire in their first session and understand there is a game here.
 *
 * **Difficulty is earned twice.** A set's score is its structural shape
 * (`weight` — how many slots it costs and how specific it is) multiplied by
 * the material it was built from (rank and tier of the actual members). The
 * same shape is therefore worth far more in Ultimates than in Tier I Pures,
 * so the footer's intensity tracks genuine achievement instead of just
 * counting how many rules happened to match.
 *
 * Pure and database-free, so the footer can evaluate it in the browser — the
 * same reason `skill-gates.ts` is split out of `skill-effects.ts`.
 */

/**
 * Fraction of its printed power a single emblem realises with no set backing.
 *
 * Low on purpose. At 0.35 the span controlled by composition was under two
 * thirds of the range and a shapeless pile of emblems still felt adequate; at
 * 0.15 nearly the whole range belongs to the sets, and carrying ten unrelated
 * emblems is visibly the weak option rather than merely the unexciting one.
 */
export const SOLO_SHARE = 0.15;

/** Set strength above 1.0 keeps paying, but at a much shallower rate. */
const OVERDRIVE_RATE = 0.3;

/** Ceiling on summed potency, so stacking every shape cannot run away. */
const STRENGTH_CAP = 1.4;

/**
 * How much each rank counts as "material". Roughly the effort to obtain one,
 * not its numerical strength — an Ultimate is a lineage's terminus, and a
 * loadout built from them should read as harder than one built from Tier I.
 */
const RANK_MATERIAL: Record<SkillRank, number> = {
  PURE: 1,
  SYNERGY: 2,
  CAPSTONE: 3.2,
  APEX: 4.5,
  ULTIMATE: 6,
};

export type ResonanceGrade = "NONE" | "FAINT" | "ALIGNED" | "HARMONIC" | "RESONANT" | "TRANSCENDENT";

export interface ActiveSet {
  id: string;
  name: string;
  blurb: string;
  /** The equipped skills that satisfy this shape. */
  members: Skill[];
  /** Shape weight × member material. Feeds the footer's intensity. */
  difficulty: number;
  /** Contribution to `setStrength`. */
  potency: number;
}

export interface LoadoutResonance {
  sets: ActiveSet[];
  /** Summed potency, capped. 0 when nothing lines up. */
  setStrength: number;
  /** 0–100, curved. Drives the footer's grade, colour and particles. */
  score: number;
  grade: ResonanceGrade;
  /**
   * Fraction of its printed power each emblem actually realises. `SOLO_SHARE`
   * with no sets, 1.0 for a fully-realised loadout, above that under overdrive.
   */
  powerShare: number;
}

interface SetShape {
  id: string;
  name: string;
  blurb: string;
  /**
   * Shapes asking the same question at different thresholds. Only the
   * strongest satisfied member of a family counts.
   *
   * Cadre and Phalanx both ask "how many share a tier"; Triad, Choir and
   * Monolith all ask "how many share an archetype". Letting them stack meant
   * one coherent group paid out two or three times, and ten unconsidered
   * Tier I emblems reached 89% power on nothing but slot-filling — rewarding
   * accumulation in a system whose entire purpose is to reward composition.
   */
  family: string;
  /** Structural difficulty: how many slots it costs and how specific it is. */
  weight: number;
  potency: number;
  /** The members satisfying the shape, or null when it does not apply. */
  detect(skills: Skill[]): Skill[] | null;
}

/** Groups skills by a key, returning the largest group when it meets `min`. */
function largestGroup<K>(skills: Skill[], key: (s: Skill) => K, min: number): Skill[] | null {
  const groups = new Map<K, Skill[]>();
  for (const s of skills) {
    const k = key(s);
    const g = groups.get(k);
    if (g) g.push(s);
    else groups.set(k, [s]);
  }
  let best: Skill[] | null = null;
  for (const g of groups.values()) {
    if (g.length >= min && (best === null || g.length > best.length)) best = g;
  }
  return best;
}

/** Groups by attribute, where a Synergy counts toward both of its attributes. */
function largestAttributeGroup(skills: Skill[], min: number): Skill[] | null {
  const groups = new Map<Attribute, Skill[]>();
  for (const s of skills) {
    for (const a of s.attributes) {
      const g = groups.get(a);
      if (g) g.push(s);
      else groups.set(a, [s]);
    }
  }
  let best: Skill[] | null = null;
  for (const g of groups.values()) {
    if (g.length >= min && (best === null || g.length > best.length)) best = g;
  }
  return best;
}

/**
 * The shapes, cheapest first.
 *
 * Ordering is presentational only — the footer lists them in this order, so
 * the entry-level sets a new player can actually reach appear at the top
 * rather than being buried under aspirational ones they cannot read yet.
 */
export const SET_SHAPES: readonly SetShape[] = [
  {
    id: "CADRE",
    family: "TIER",
    name: "Cadre",
    blurb: "Three or more emblems of the same tier.",
    weight: 0.7,
    potency: 0.07,
    detect: (s) => largestGroup(s, (x) => x.tier, 3),
  },
  {
    id: "TRIAD",
    family: "LINEAGE",
    name: "Triad",
    blurb: "Three or more emblems from one archetype.",
    weight: 1,
    potency: 0.1,
    detect: (s) => largestGroup(s, (x) => x.archetypeCode, 3),
  },
  {
    id: "PHALANX",
    family: "TIER",
    name: "Phalanx",
    blurb: "Five or more emblems of the same tier.",
    weight: 2,
    potency: 0.17,
    detect: (s) => largestGroup(s, (x) => x.tier, 5),
  },
  {
    id: "FOCUS",
    family: "FOCUS",
    name: "Singular Focus",
    blurb: "Six or more emblems training one attribute.",
    weight: 2,
    potency: 0.18,
    detect: (s) => largestAttributeGroup(s, 6),
  },
  {
    id: "COMPLEMENT",
    family: "COMPLEMENT",
    name: "Full Complement",
    blurb: "Every slot filled and every emblem active.",
    weight: 2,
    potency: 0.18,
    detect: (s) => (s.length >= 10 ? s : null),
  },
  {
    id: "CHOIR",
    family: "LINEAGE",
    name: "Choir",
    blurb: "Five or more emblems from one archetype.",
    weight: 2.6,
    potency: 0.24,
    detect: (s) => largestGroup(s, (x) => x.archetypeCode, 5),
  },
  {
    id: "POLYMATH",
    family: "POLYMATH",
    name: "Polymath",
    blurb: "Six different attributes carried at once.",
    weight: 2.4,
    potency: 0.2,
    detect: (s) => {
      const seen = new Set<Attribute>();
      for (const x of s) for (const a of x.attributes) seen.add(a);
      return seen.size >= 6 ? s : null;
    },
  },
  {
    id: "ASCENSION",
    family: "ASCENSION",
    name: "Ascension",
    blurb: "A tier ladder I through V, no two rungs from the same archetype.",
    weight: 2.6,
    potency: 0.22,
    // The distinct-archetype rule is what makes this a different shape from
    // Choir rather than a free rider on it. Buying one lineage to tier V is
    // the most obvious thing a player can do, and without this it silently
    // paid out three sets for that single decision.
    detect: (s) => {
      const members: Skill[] = [];
      const used = new Set<string>();
      for (let tier = 1; tier <= 5; tier++) {
        const m = s.find((x) => x.tier === tier && !used.has(x.archetypeCode));
        if (!m) return null;
        used.add(m.archetypeCode);
        members.push(m);
      }
      return members;
    },
  },
  {
    id: "TOOLKIT",
    family: "TOOLKIT",
    name: "Toolkit",
    blurb: "Seven distinct effects, no two doing the same job.",
    weight: 2.8,
    potency: 0.24,
    detect: (s) => {
      const kinds = new Set(s.map((x) => x.effect.kind));
      return kinds.size >= 7 ? s : null;
    },
  },
  {
    id: "SPECTRUM",
    family: "SPECTRUM",
    name: "Spectrum",
    blurb: "One emblem of every rank, Pure through Ultimate.",
    // The heaviest shape in the game: it cannot be assembled at all without
    // an Ultimate, which is a lineage's terminus.
    weight: 5.5,
    potency: 0.3,
    detect: (s) => {
      const ranks: SkillRank[] = ["PURE", "SYNERGY", "CAPSTONE", "APEX", "ULTIMATE"];
      const members: Skill[] = [];
      for (const r of ranks) {
        const m = s.find((x) => x.rank === r && !members.includes(x));
        if (!m) return null;
        members.push(m);
      }
      return members;
    },
  },
  {
    id: "MONOLITH",
    family: "LINEAGE",
    name: "Monolith",
    blurb: "Eight or more emblems from a single archetype.",
    // A family head stands in for every shape it supersedes, so it has to be
    // worth what it absorbed. Before this, committing eight slots to one
    // archetype scored *lower* than a bag of ten unrelated Tier I emblems,
    // because suppression took away its Choir and Triad and gave nothing back.
    weight: 6,
    potency: 0.4,
    detect: (s) => largestGroup(s, (x) => x.archetypeCode, 8),
  },
];

/** Mean material of a set's members — rank, lifted by tier depth. */
function materialOf(members: Skill[]): number {
  if (members.length === 0) return 0;
  // Tier depth at 0.18 per step, not 0.12. Reaching Tier VIII is the whole
  // length of a Pure lineage, and at the lower coefficient it counted for so
  // little that a deep, deliberately-built loadout scored below a bag of ten
  // Tier I emblems that merely filled the slots.
  let total = 0;
  for (const m of members) total += RANK_MATERIAL[m.rank] * (1 + (m.tier - 1) * 0.18);
  return total / members.length;
}

/**
 * Curves summed raw difficulty onto 0–100.
 *
 * Saturating rather than linear: the gap between "nothing" and "a first
 * Triad" should be the most visible step in the whole range, and a player
 * already running four sets should not be able to double the footer's
 * intensity by adding a fifth. `1 - e^(-raw/14)` puts an entry-level
 * Cadre+Triad around 11 and a deep Ultimate loadout in the high 80s.
 */
function curve(raw: number): number {
  return Math.round(100 * (1 - Math.exp(-raw / 14)));
}

function gradeFor(score: number): ResonanceGrade {
  if (score <= 0) return "NONE";
  if (score < 20) return "FAINT";
  if (score < 40) return "ALIGNED";
  if (score < 60) return "HARMONIC";
  if (score < 80) return "RESONANT";
  return "TRANSCENDENT";
}

/**
 * Detects every satisfied shape among the currently *active* equipped skills
 * and resolves the loadout's overall resonance.
 *
 * Dormant emblems are excluded by the caller for the same reason they
 * contribute no modifiers: a slot whose requirements lapsed is occupied, not
 * working, and letting it complete a set would make the bar claim power the
 * engine does not grant.
 */
export function resolveResonance(active: Skill[]): LoadoutResonance {
  const sets: ActiveSet[] = [];
  let raw = 0;
  let strength = 0;

  // Within a family only the strongest satisfied shape survives, so holding
  // eight of one archetype reads as a Monolith rather than as a Monolith plus
  // the Choir plus the Triad already contained inside it.
  const bestInFamily = new Map<string, SetShape>();
  for (const shape of SET_SHAPES) {
    const members = shape.detect(active);
    if (!members || members.length === 0) continue;
    const held = bestInFamily.get(shape.family);
    if (!held || shape.weight > held.weight) bestInFamily.set(shape.family, shape);
  }

  for (const shape of SET_SHAPES) {
    if (bestInFamily.get(shape.family) !== shape) continue;
    const members = shape.detect(active);
    if (!members || members.length === 0) continue;

    const material = materialOf(members);
    // Material is compressed before it multiplies the shape. Linearly, an
    // Ultimate counts six times a Pure, and ten Ultimates maxed the whole
    // scale on nothing but the four shallowest shapes — rank alone
    // out-shouting composition, which is exactly what this system exists to
    // stop. At ^0.7 that same gap is ~3.4x: still decisive, no longer able
    // to substitute for having built anything.
    const difficulty = shape.weight * Math.pow(material, 0.7);
    // Potency scales with material too, but far more gently than difficulty
    // does — an Ultimate Triad should *look* dramatically rarer than a Tier I
    // one while being only moderately stronger, or the footer's spectacle
    // would be promising a power gap the numbers never deliver.
    const potency = shape.potency * (1 + Math.log2(1 + material) * 0.18);

    sets.push({ id: shape.id, name: shape.name, blurb: shape.blurb, members, difficulty, potency });
    raw += difficulty;
    strength += potency;
  }

  const setStrength = Math.min(strength, STRENGTH_CAP);
  const score = sets.length === 0 ? 0 : curve(raw);

  // Below 1.0 the set fills in the 65% the solo emblem gives up; above it,
  // overdrive keeps paying at a shallower rate so a perfect loadout has
  // somewhere left to go.
  const powerShare =
    SOLO_SHARE +
    (1 - SOLO_SHARE) * Math.min(1, setStrength) +
    Math.max(0, setStrength - 1) * OVERDRIVE_RATE;

  return {
    sets: sets.sort((a, b) => b.difficulty - a.difficulty),
    setStrength,
    score,
    grade: gradeFor(score),
    powerShare,
  };
}

export const NO_RESONANCE: LoadoutResonance = {
  sets: [],
  setStrength: 0,
  score: 0,
  grade: "NONE",
  powerShare: SOLO_SHARE,
};
