import type { Attribute } from "@prisma/client";
import type { Skill, SkillRank } from "./skill-pool";
import { PURE_MAX_TIER, ULTIMATE_TIER } from "./skill-pool";
import { NEUTRAL_MODIFIERS, type ActiveModifiers } from "./skill-gates";
import { LOADOUT_SLOTS } from "./loadout";

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
 * **Every shape also grants something concrete.** Composition used to only
 * ever multiply the printed value of whatever skills you happened to be
 * carrying — real, but abstract, and invisible until you already understood
 * the powerShare curve. Each of the 32 shapes below now grants one named
 * mechanic in its own right (`grant`), stated in the same vocabulary the
 * skill tree already uses: an extra strike forgiven, a wrong answer that no
 * longer breaks your combo, a review that stays gracious two days past due
 * instead of costing you score. "Assemble this shape, get this concrete
 * thing" is a far more legible promise than "assemble this shape, everything
 * gets somewhat stronger."
 *
 * **Which emblems complete which shape is deliberately never explained
 * in-app.** `blurb` describes the shape once it is already showing in the
 * footer; nothing steers a player toward it beforehand. The 32 conditions
 * below are the actual detection logic and the only place they are written
 * down — see `combo-discovery.ts` and `ComboCodex.tsx` for how a shape is
 * revealed exactly once, the first time a player actually assembles it.
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
 * How far rarity alone can push the sky, in raw-difficulty units.
 *
 * The sets own the ceiling and always will — 13 curves to a score of ~60, the
 * top of HARMONIC, so a loadout of ten Ultimates that composes into nothing
 * can never reach the sun or the black hole. What it *can* no longer do is
 * leave the site looking exactly as bare as an empty bar. That was the old
 * behaviour and it was wrong in both directions: it told a player holding a
 * lineage terminus that they had earned nothing, and it made the one moment
 * worth celebrating — a first Ultimate — completely invisible until it
 * happened to line up with a second emblem.
 */
const RARITY_CEILING_RAW = 13;

/**
 * Bends rarity's contribution against accumulation.
 *
 * Above 1, so filling slots with cheap emblems pays less than proportionally
 * while depth pays more: ten Tier I Pures reach a sixth of the rarity axis,
 * a single Ultimate a tenth of it. Composition stays the way to a bright sky;
 * rarity only decides how dark the floor is.
 */
const RARITY_SHAPE = 1.15;

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

/**
 * What a completed shape actually grants, in the same vocabulary
 * `ActiveModifiers` already uses — see `foldSetGrants` for exactly how each
 * kind's `value` is applied. A set never grants RESONANCE-of-resonance
 * (attenuating a shape's own reward by the powerShare it produced would be
 * circular); every other modifier kind the skill tree uses is fair game.
 */
export type SetGrantKind =
  | "REVIEW_YIELD"
  | "DECAY_RESISTANCE"
  | "DEGRADATION_WARD"
  | "GRACE_EXTENSION"
  | "INTERVAL_DILATION"
  | "COMBO_CEILING"
  | "COMBO_ANCHOR"
  | "MASTERY_YIELD"
  | "STRIKE_TOLERANCE"
  | "YIELD_FLOOR"
  | "DEDUP_PRECISION"
  | "STREAK_AMPLIFIER"
  | "RESONANCE";

export interface SetGrant {
  kind: SetGrantKind;
  value: number;
  /** Plain statement of the mechanic, shown in the discovery popup and the codex. */
  effectText: string;
  /** When it actually matters — the recommendation half of the popup. */
  tip: string;
}

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
  grant: SetGrant;
}

export interface LoadoutResonance {
  sets: ActiveSet[];
  /** Summed potency, capped. 0 when nothing lines up. */
  setStrength: number;
  /** 0–100, curved. Drives the footer's grade, colour and particles. */
  score: number;
  grade: ResonanceGrade;
  /**
   * 0–1 richness of what is equipped, independent of composition. Drives the
   * atmosphere continuously, between and within grades.
   */
  rarity: number;
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
  grant: SetGrant;
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
 *
 * 32 shapes across 25 families. Every one of the 13 grant kinds is used at
 * least once; several are used by shapes of deliberately different weight
 * (Cadre/Phalanx both grant STRIKE_TOLERANCE, Phalanx more) so a player who
 * discovers the cheap version later finds the expensive one is a real
 * upgrade, not a different reward entirely.
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
    grant: {
      kind: "STRIKE_TOLERANCE",
      value: 1,
      effectText: "One extra wrong answer forgiven before a Strike, on any card.",
      tip: "A cheap, early cushion — good for a loadout still full of cards you're shaky on.",
    },
  },
  {
    id: "TRIAD",
    family: "LINEAGE",
    name: "Triad",
    blurb: "Three or more emblems from one archetype.",
    weight: 1,
    potency: 0.1,
    detect: (s) => largestGroup(s, (x) => x.archetypeCode, 3),
    grant: {
      kind: "GRACE_EXTENSION",
      value: 1,
      effectText: "Overdue Ideas get 1 extra day of grace before a late review starts costing you.",
      tip: "Worth it the moment your schedule gets unpredictable — a missed day stops being a scramble.",
    },
  },
  {
    id: "PHALANX",
    family: "TIER",
    name: "Phalanx",
    blurb: "Five or more emblems of the same tier.",
    weight: 2,
    potency: 0.17,
    detect: (s) => largestGroup(s, (x) => x.tier, 5),
    grant: {
      kind: "STRIKE_TOLERANCE",
      value: 2,
      effectText: "Two extra wrong answers forgiven before a Strike, on any card.",
      tip: "Supersedes Cadre outright — lean on it while pushing into unfamiliar Fields where misses are frequent.",
    },
  },
  {
    id: "FOCUS",
    family: "FOCUS",
    name: "Singular Focus",
    blurb: "Six or more emblems training one attribute.",
    weight: 2,
    potency: 0.18,
    detect: (s) => largestAttributeGroup(s, 6),
    grant: {
      kind: "RESONANCE",
      value: 6,
      effectText: "+6% to every attribute score.",
      tip: "Fires the same qualifying bar every other skill uses — build this when you're just short of unlocking something.",
    },
  },
  {
    id: "COMPLEMENT",
    family: "COMPLEMENT",
    name: "Full Complement",
    blurb: "Every slot filled and every emblem active.",
    weight: 2,
    potency: 0.18,
    detect: (s) => (s.length >= 10 ? s : null),
    grant: {
      kind: "YIELD_FLOOR",
      value: 0.15,
      effectText: "Every passed review pays at least 15% of its undecayed value, no matter how stale the card was.",
      tip: "Best on an account with a lot of old, decayed backlog — it stops the oldest cards paying almost nothing.",
    },
  },
  {
    id: "CHOIR",
    family: "LINEAGE",
    name: "Choir",
    blurb: "Five or more emblems from one archetype.",
    weight: 2.6,
    potency: 0.24,
    detect: (s) => largestGroup(s, (x) => x.archetypeCode, 5),
    grant: {
      kind: "GRACE_EXTENSION",
      value: 2,
      effectText: "Overdue Ideas get 2 extra days of grace before a late review starts costing you.",
      tip: "Supersedes Triad — the set to build before a trip or a busy week you already know is coming.",
    },
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
    grant: {
      kind: "DEDUP_PRECISION",
      value: 0.03,
      effectText: "The duplicate-idea detector loosens its matching threshold slightly.",
      tip: "Useful once your Library spans many Fields and near-duplicate Ideas start slipping through under different names.",
    },
  },
  {
    id: "CONFLUENCE",
    family: "FUSION",
    name: "Confluence",
    blurb: "Two or more Synergy emblems, each already fusing two attributes.",
    weight: 1.2,
    potency: 0.09,
    detect: (s) => {
      const synergies = s.filter((x) => x.rank === "SYNERGY");
      return synergies.length >= 2 ? synergies : null;
    },
    grant: {
      kind: "REVIEW_YIELD",
      value: 0.06,
      effectText: "+6% points on every passed review.",
      tip: "A gentle, always-on boost — reasonable to keep running as a default rather than saving for a specific moment.",
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
    grant: {
      kind: "INTERVAL_DILATION",
      value: 0.12,
      effectText: "Review intervals stretch 12% further before a card comes due again.",
      tip: "A real breadth build across five different lineages earns you a lighter daily queue — use it once the backlog feels heavy.",
    },
  },
  {
    id: "GENESIS",
    family: "GENESIS",
    name: "Genesis",
    blurb: "Five or more Tier I or II emblems — a loadout built almost entirely of fresh unlocks.",
    weight: 1.1,
    potency: 0.08,
    detect: (s) => {
      const fresh = s.filter((x) => (x.rank === "PURE" || x.rank === "SYNERGY") && x.tier <= 2);
      return fresh.length >= 5 ? fresh : null;
    },
    grant: {
      kind: "COMBO_ANCHOR",
      value: 0.3,
      effectText: "A wrong answer keeps 30% of your combo instead of zeroing it.",
      tip: "Naturally available early — a new account's first real taste of a streak that survives a single mistake.",
    },
  },
  {
    id: "HORIZON",
    family: "SPAN",
    name: "Horizon",
    blurb: "A Tier I and a Tier VIII from the same archetype, both equipped.",
    weight: 1.8,
    potency: 0.14,
    detect: (s) => {
      const byArch = new Map<string, Skill[]>();
      for (const x of s) {
        if (x.rank !== "PURE") continue;
        const g = byArch.get(x.archetypeCode);
        if (g) g.push(x);
        else byArch.set(x.archetypeCode, [x]);
      }
      for (const g of byArch.values()) {
        const lo = g.find((x) => x.tier === 1);
        const hi = g.find((x) => x.tier === PURE_MAX_TIER);
        if (lo && hi) return [lo, hi];
      }
      return null;
    },
    grant: {
      kind: "INTERVAL_DILATION",
      value: 0.08,
      effectText: "Review intervals stretch 8% further before a card comes due again.",
      tip: "A lineage's beginning and end carried together — a small, early taste of what Ascension pays out in full.",
    },
  },
  {
    id: "GRADIENT",
    family: "RANKSPAN",
    name: "Gradient",
    blurb: "Three or more distinct ranks represented.",
    weight: 1.5,
    potency: 0.12,
    detect: (s) => {
      const ranks = new Set(s.map((x) => x.rank));
      return ranks.size >= 3 ? s : null;
    },
    grant: {
      kind: "REVIEW_YIELD",
      value: 0.08,
      effectText: "+8% points on every passed review.",
      tip: "A natural byproduct of a loadout that isn't all one rank — check whether you already have this before chasing anything else.",
    },
  },
  {
    id: "IRONCLAD",
    family: "REDUNDANCY",
    name: "Ironclad",
    blurb: "Two or more equipped emblems whose own effect is a Degradation Ward.",
    weight: 1.6,
    potency: 0.13,
    detect: (s) => {
      const wards = s.filter((x) => x.effect.kind === "DEGRADATION_WARD");
      return wards.length >= 2 ? wards : null;
    },
    grant: {
      kind: "STRIKE_TOLERANCE",
      value: 1,
      effectText: "One extra wrong answer forgiven before a Strike, on any card.",
      tip: "Redundant wards say the same thing twice — the set answers by making a slip cost even less.",
    },
  },
  {
    id: "UNBROKEN",
    family: "RESILIENCE",
    name: "Unbroken",
    blurb: "One Degradation Ward and one Strike Tolerance emblem, both equipped.",
    weight: 1.7,
    potency: 0.14,
    detect: (s) => {
      const ward = s.find((x) => x.effect.kind === "DEGRADATION_WARD");
      const strike = s.find((x) => x.effect.kind === "STRIKE_TOLERANCE");
      return ward && strike ? [ward, strike] : null;
    },
    grant: {
      kind: "COMBO_ANCHOR",
      value: 0.4,
      effectText: "A wrong answer keeps 40% of your combo instead of zeroing it.",
      tip: "A loadout built around not losing things extends that promise to your streak too.",
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
    grant: {
      kind: "STREAK_AMPLIFIER",
      value: 0.2,
      effectText: "The daily Field streak bonus is worth 20% more.",
      tip: "A generalist build pays off in the currency generalism doesn't otherwise touch — showing up daily.",
    },
  },
  {
    id: "EQUILIBRIUM",
    family: "BALANCE",
    name: "Equilibrium",
    blurb: "At least three Pure and three Synergy emblems equipped together.",
    weight: 1.6,
    potency: 0.13,
    detect: (s) => {
      const pure = s.filter((x) => x.rank === "PURE");
      const syn = s.filter((x) => x.rank === "SYNERGY");
      return pure.length >= 3 && syn.length >= 3 ? [...pure, ...syn] : null;
    },
    grant: {
      kind: "STREAK_AMPLIFIER",
      value: 0.12,
      effectText: "The daily Field streak bonus is worth 12% more.",
      tip: "The gentlest route to the same reward Toolkit pays out in full, reachable earlier.",
    },
  },
  {
    id: "TRIANGULATION",
    family: "PAIRING",
    name: "Triangulation",
    blurb: "A Synergy and both of its two parent attributes' Tier V+ Pures, all equipped.",
    weight: 2.3,
    potency: 0.18,
    detect: (s) => {
      const synergies = s.filter((x) => x.rank === "SYNERGY");
      for (const syn of synergies) {
        const [a1, a2] = syn.attributes;
        const p1 = s.find((x) => x.rank === "PURE" && x.tier >= 5 && x.attributes[0] === a1);
        const p2 = s.find((x) => x.rank === "PURE" && x.tier >= 5 && x.attributes[0] === a2);
        if (p1 && p2) return [syn, p1, p2];
      }
      return null;
    },
    grant: {
      kind: "MASTERY_YIELD",
      value: 0.15,
      effectText: "+15% mastery points from every source.",
      tip: "A deliberate, specific pairing — worth assembling right before a push toward a Capstone that needs the points.",
    },
  },
  {
    id: "PURIST",
    family: "MONOCHROME",
    name: "Purist",
    blurb: "Eight or more emblems, all Pure rank.",
    weight: 2.1,
    potency: 0.16,
    detect: (s) => (s.length >= 8 && s.every((x) => x.rank === "PURE") ? s : null),
    grant: {
      kind: "REVIEW_YIELD",
      value: 0.1,
      effectText: "+10% points on every passed review.",
      tip: "Fundamentals only, eight deep — a legitimate build in its own right, not just a stepping stone to Synergy.",
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
    grant: {
      kind: "MASTERY_YIELD",
      value: 0.25,
      effectText: "+25% mastery points from every source.",
      tip: "The whole spectrum, rewarded in the currency that measures a whole career — keep it running once you have it.",
    },
  },
  {
    id: "CONTINUUM",
    family: "RANKSPAN",
    name: "Continuum",
    blurb: "Four or more distinct ranks represented.",
    weight: 3.2,
    potency: 0.22,
    detect: (s) => {
      const ranks = new Set(s.map((x) => x.rank));
      return ranks.size >= 4 ? s : null;
    },
    grant: {
      kind: "REVIEW_YIELD",
      value: 0.16,
      effectText: "+16% points on every passed review.",
      tip: "Supersedes Gradient — one rank short of Spectrum's full run, and far easier to hold onto day to day.",
    },
  },
  {
    id: "VANGUARD",
    family: "ELEVATION",
    name: "Vanguard",
    blurb: "Three or more emblems Capstone rank or higher.",
    weight: 2.2,
    potency: 0.17,
    detect: (s) => {
      const heavy = s.filter((x) => x.rank !== "PURE" && x.rank !== "SYNERGY");
      return heavy.length >= 3 ? heavy : null;
    },
    grant: {
      kind: "DEGRADATION_WARD",
      value: 1,
      effectText: "+1 weekly Degradation Ward charge — blocks a level drop from an unattempted or failed review.",
      tip: "Hard-won emblems earning you room to actually miss a review without paying for it.",
    },
  },
  {
    id: "INVESTMENT",
    family: "ECONOMY",
    name: "Investment",
    blurb: "Active emblems whose combined mastery cost is at least 200.",
    weight: 1.9,
    potency: 0.15,
    detect: (s) => {
      const total = s.reduce((sum, x) => sum + x.masteryCost, 0);
      return total >= 200 ? s : null;
    },
    grant: {
      kind: "MASTERY_YIELD",
      value: 0.1,
      effectText: "+10% mastery points from every source.",
      tip: "What you spent to equip this loadout starts paying part of itself back.",
    },
  },
  {
    id: "CROSSCURRENT",
    family: "MIRROR",
    name: "Crosscurrent",
    blurb: "Two Synergy emblems sharing no attribute at all — four distinct attributes between just two slots.",
    weight: 2.1,
    potency: 0.16,
    detect: (s) => {
      const synergies = s.filter((x) => x.rank === "SYNERGY");
      for (let i = 0; i < synergies.length; i++) {
        for (let j = i + 1; j < synergies.length; j++) {
          const [a, b] = [synergies[i], synergies[j]];
          if (!a.attributes.some((x) => b.attributes.includes(x))) return [a, b];
        }
      }
      return null;
    },
    grant: {
      kind: "DEDUP_PRECISION",
      value: 0.025,
      effectText: "The duplicate-idea detector loosens its matching threshold slightly.",
      tip: "Two fusions that share nothing still catch the same kind of near-duplicate Idea between them.",
    },
  },
  {
    id: "CROWNED",
    family: "COURT",
    name: "Crowned",
    blurb: "An Apex and a Synergy that shares one of its attributes, both equipped.",
    weight: 2.8,
    potency: 0.2,
    detect: (s) => {
      const apexes = s.filter((x) => x.rank === "APEX");
      for (const ap of apexes) {
        const partner = s.find((x) => x.rank === "SYNERGY" && x.attributes.includes(ap.attributes[0]));
        if (partner) return [ap, partner];
      }
      return null;
    },
    grant: {
      kind: "COMBO_CEILING",
      value: 3,
      effectText: "The combo ceiling rises by 3 steps before it stops paying more per correct answer.",
      tip: "Best on a long, focused review session — the extra ceiling only matters once you're already running a real combo.",
    },
  },
  {
    id: "BASTION",
    family: "ELEVATION",
    name: "Bastion",
    blurb: "Six or more emblems Capstone rank or higher.",
    weight: 4.5,
    potency: 0.32,
    detect: (s) => {
      const heavy = s.filter((x) => x.rank !== "PURE" && x.rank !== "SYNERGY");
      return heavy.length >= 6 ? heavy : null;
    },
    grant: {
      kind: "DEGRADATION_WARD",
      value: 2,
      effectText: "+2 weekly Degradation Ward charges — blocks a level drop from an unattempted or failed review.",
      tip: "Supersedes Vanguard — enough that a genuinely bad week still costs you nothing structurally.",
    },
  },
  {
    id: "NEXUS",
    family: "FUSION",
    name: "Nexus",
    blurb: "Four or more Synergy emblems.",
    weight: 2.8,
    potency: 0.19,
    detect: (s) => {
      const synergies = s.filter((x) => x.rank === "SYNERGY");
      return synergies.length >= 4 ? synergies : null;
    },
    grant: {
      kind: "REVIEW_YIELD",
      value: 0.14,
      effectText: "+14% points on every passed review.",
      tip: "Supersedes Confluence — a loadout built almost entirely on cross-attribute fusions.",
    },
  },
  {
    id: "FORTUNE",
    family: "ECONOMY",
    name: "Fortune",
    blurb: "Active emblems whose combined mastery cost is at least 800.",
    weight: 4,
    potency: 0.3,
    detect: (s) => {
      const total = s.reduce((sum, x) => sum + x.masteryCost, 0);
      return total >= 800 ? s : null;
    },
    grant: {
      kind: "MASTERY_YIELD",
      value: 0.22,
      effectText: "+22% mastery points from every source.",
      tip: "Supersedes Investment — a loadout this expensive should visibly compound, not just sit there.",
    },
  },
  {
    id: "POLYGLOT",
    family: "DIASPORA",
    name: "Polyglot",
    blurb: "Seven or more distinct archetypes represented among active emblems.",
    weight: 2.5,
    potency: 0.19,
    detect: (s) => {
      const codes = new Set(s.map((x) => x.archetypeCode));
      return codes.size >= 7 ? s : null;
    },
    grant: {
      kind: "GRACE_EXTENSION",
      value: 3,
      effectText: "Overdue Ideas get 3 extra days of grace before a late review starts costing you.",
      tip: "The breadth-first counterpart to Choir's depth — a loadout spread this wide already forgives a scattered schedule.",
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
    grant: {
      kind: "GRACE_EXTENSION",
      value: 4,
      effectText: "Overdue Ideas get 4 extra days of grace before a late review starts costing you.",
      tip: "Supersedes Choir and Triad both — total commitment to one lineage buys the widest forgiveness in the game.",
    },
  },
  {
    id: "LADDER",
    family: "LADDER",
    name: "Complete Ladder",
    blurb: "Every Pure tier, I through VIII, of one archetype, all equipped.",
    weight: 5.2,
    potency: 0.34,
    detect: (s) => {
      const byArch = new Map<string, Skill[]>();
      for (const x of s) {
        if (x.rank !== "PURE") continue;
        const g = byArch.get(x.archetypeCode);
        if (g) g.push(x);
        else byArch.set(x.archetypeCode, [x]);
      }
      for (const g of byArch.values()) {
        const tiers = new Set(g.map((x) => x.tier));
        let complete = true;
        for (let t = 1; t <= PURE_MAX_TIER; t++) {
          if (!tiers.has(t)) {
            complete = false;
            break;
          }
        }
        if (complete) return g;
      }
      return null;
    },
    grant: {
      kind: "DECAY_RESISTANCE",
      value: 0.05,
      effectText: "Idea decay slows — the lambda governing how fast an unreviewed card weakens drops by 0.05.",
      tip: "A full ladder is eight of your ten slots — worth it on the one lineage you genuinely never want to lose ground on.",
    },
  },
  {
    id: "OMNISCIENT",
    family: "BREADTH_MATCH",
    name: "Omniscient",
    blurb: "An equipped Ultimate plus an emblem for each attribute its breadth check demands.",
    weight: 4.8,
    potency: 0.35,
    detect: (s) => {
      const ultimates = s.filter((x) => x.rank === "ULTIMATE");
      for (const u of ultimates) {
        const reqs = u.breadthRequirement ?? [];
        if (reqs.length === 0) continue;
        const covering = reqs.map((r) => s.find((x) => x !== u && x.attributes.includes(r.attribute)));
        if (covering.every((c): c is Skill => c !== undefined)) return [u, ...covering];
      }
      return null;
    },
    grant: {
      kind: "RESONANCE",
      value: 10,
      effectText: "+10% to every attribute score.",
      tip: "Actively training exactly what an Ultimate quietly demands of you — the surest way to keep it from ever going dormant.",
    },
  },
  {
    id: "DUALITY",
    family: "TERMINUS",
    name: "Duality",
    blurb: "Two or more Ultimate emblems equipped at once.",
    weight: 5.8,
    potency: 0.38,
    detect: (s) => {
      const ultimates = s.filter((x) => x.rank === "ULTIMATE");
      return ultimates.length >= 2 ? ultimates : null;
    },
    grant: {
      kind: "YIELD_FLOOR",
      value: 0.3,
      effectText: "Every passed review pays at least 30% of its undecayed value, no matter how stale the card was.",
      tip: "Two lineage termini at once — no review this loadout touches should ever be worth almost nothing.",
    },
  },
];

/** Mean material of a set's members — rank, lifted by tier depth. */
function materialOf(members: Skill[]): number {
  if (members.length === 0) return 0;
  let total = 0;
  for (const m of members) total += materialOfOne(m);
  return total / members.length;
}

/**
 * Per-tier lift on top of rank material. 0.18 rather than 0.12: reaching Tier
 * VIII is the whole length of a Pure lineage, and at the lower coefficient it
 * counted for so little that a deep, deliberately-built loadout scored below
 * a bag of ten Tier I emblems that merely filled the slots.
 */
const TIER_LIFT = 0.18;

/** One emblem's material: its rank, lifted by how deep into its lineage it sits. */
function materialOfOne(skill: Skill): number {
  return RANK_MATERIAL[skill.rank] * (1 + (skill.tier - 1) * TIER_LIFT);
}

/**
 * The richest a full bar can be: every slot an Ultimate.
 *
 * `ULTIMATE_TIER` rather than 1 — Ultimates carry their depth (15) in `tier`,
 * so the tier lift in `materialOfOne` applies to them as much as to a Pure
 * VIII. Normalising against the rank material alone put a single Ultimate at
 * 0.35 of the axis and saturated the whole thing at three of them.
 */
const MAX_LOADOUT_MATERIAL =
  LOADOUT_SLOTS * RANK_MATERIAL.ULTIMATE * (1 + (ULTIMATE_TIER - 1) * TIER_LIFT);

/**
 * How rare the equipped emblems are, 0–1, ignoring whether they compose.
 *
 * Deliberately measured across *everything equipped* rather than across set
 * members, because this is the one channel that answers "what am I carrying"
 * instead of "what have I built". It is also continuous, which matters more
 * than its size: the grade ladder has five rungs, so within a rung the sky
 * used to be frozen no matter what was swapped in. This value moves on every
 * single attach, and the atmosphere reads it directly.
 */
export function rarityOf(active: Skill[]): number {
  if (active.length === 0) return 0;
  let total = 0;
  for (const s of active) total += materialOfOne(s);
  return Math.min(1, total / MAX_LOADOUT_MATERIAL);
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

    sets.push({
      id: shape.id,
      name: shape.name,
      blurb: shape.blurb,
      members,
      difficulty,
      potency,
      grant: shape.grant,
    });
    raw += difficulty;
    strength += potency;
  }

  const setStrength = Math.min(strength, STRENGTH_CAP);

  // Rarity is added to raw difficulty rather than max()'d against the result,
  // so it keeps mattering after the first set lands instead of going dead the
  // moment composition overtakes it. Same curve, so the saturation that stops
  // a fifth set from doubling the sky applies to rare emblems too.
  const rarity = rarityOf(active);
  const rarityRaw = RARITY_CEILING_RAW * Math.pow(rarity, RARITY_SHAPE);
  const score = curve(raw + rarityRaw);

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
    rarity,
    powerShare,
  };
}

export const NO_RESONANCE: LoadoutResonance = {
  sets: [],
  setStrength: 0,
  score: 0,
  grade: "NONE",
  rarity: 0,
  powerShare: SOLO_SHARE,
};

/**
 * What a completed shape grants, folded on top of the skill baseline — the
 * same "best value per kind, never summed" rule `foldEffects` uses, applied
 * here across whichever sets are simultaneously active rather than across
 * skills. Deliberately a separate pass from `attenuateModifiers`: a set's own
 * grant is not attenuated by the powerShare it itself produces, the same
 * reason boons sit outside that attenuation in `skill-effects.ts`.
 *
 * Each kind's `value` has one fixed meaning, matching the unit its
 * `ActiveModifiers` field already uses:
 *   - multiplier-shaped kinds (REVIEW_YIELD, INTERVAL_DILATION, MASTERY_YIELD,
 *     STREAK_AMPLIFIER) store a fraction and stack multiplicatively on top —
 *     `value: 0.06` means "+6%".
 *   - count-shaped kinds (DEGRADATION_WARD, GRACE_EXTENSION, COMBO_CEILING,
 *     STRIKE_TOLERANCE) store a flat integer and add.
 *   - floor-shaped kinds (COMBO_ANCHOR, YIELD_FLOOR) store the guaranteed
 *     minimum and take the max against whatever skills already provide.
 *   - DECAY_RESISTANCE stores a flat lambda reduction; DEDUP_PRECISION and
 *     RESONANCE store flat deltas and add.
 */
export function foldSetGrants(base: ActiveModifiers, sets: ActiveSet[]): ActiveModifiers {
  const best = new Map<SetGrantKind, number>();
  for (const s of sets) {
    const cur = best.get(s.grant.kind);
    if (cur === undefined || s.grant.value > cur) best.set(s.grant.kind, s.grant.value);
  }
  const v = (k: SetGrantKind) => best.get(k);
  const m: ActiveModifiers = { ...base };

  const reviewYield = v("REVIEW_YIELD");
  if (reviewYield !== undefined) m.reviewYieldMultiplier *= 1 + reviewYield;

  const decay = v("DECAY_RESISTANCE");
  if (decay !== undefined) m.lambda = Math.max(0.02, m.lambda - decay);

  const ward = v("DEGRADATION_WARD");
  if (ward !== undefined) m.wardCharges += ward;

  const grace = v("GRACE_EXTENSION");
  if (grace !== undefined) m.graceExtraDays += grace;

  const interval = v("INTERVAL_DILATION");
  if (interval !== undefined) m.intervalMultiplier *= 1 + interval;

  const comboCeiling = v("COMBO_CEILING");
  if (comboCeiling !== undefined) m.comboCap += comboCeiling;

  const comboAnchor = v("COMBO_ANCHOR");
  if (comboAnchor !== undefined) m.comboRetained = Math.max(m.comboRetained, comboAnchor);

  const mastery = v("MASTERY_YIELD");
  if (mastery !== undefined) m.masteryMultiplier *= 1 + mastery;

  const strikes = v("STRIKE_TOLERANCE");
  if (strikes !== undefined) m.extraStrikes += strikes;

  const floor = v("YIELD_FLOOR");
  if (floor !== undefined) m.yieldFloorFraction = Math.max(m.yieldFloorFraction, floor);

  const dedup = v("DEDUP_PRECISION");
  if (dedup !== undefined) m.dedupThresholdDelta += dedup;

  const streakAmp = v("STREAK_AMPLIFIER");
  if (streakAmp !== undefined) m.streakMultiplier *= 1 + streakAmp;

  const resonance = v("RESONANCE");
  if (resonance !== undefined) m.resonancePercent += resonance;

  return m;
}

// Re-exported so callers that only need the neutral baseline (e.g. a codex
// entry for a shape that has never been completed) don't need a second
// import from skill-gates.ts.
export { NEUTRAL_MODIFIERS };
