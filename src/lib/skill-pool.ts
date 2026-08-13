import type { Attribute } from "@prisma/client";
import { ATTRIBUTES, ATTRIBUTE_META } from "./attributes";

/**
 * Procedural skill pool.
 *
 * The whole pool is generated once, at module load, from a grammar of
 * (archetype × attribute affinity × tier). It is a pure function of the
 * tables below: same pool every process, every machine, forever. No model
 * call is involved in generating a skill, and deliberately so — a skill
 * tree whose contents shift between runs cannot be planned toward, and
 * planning toward a distant unlock is the entire point of having one.
 *
 * (A model *is* allowed to grade the written attestations that mint mastery
 * points — see mastery.ts. That judges your work; it never invents the
 * rules you are working against.)
 *
 * Replaces the previous hardcoded five-skill matrix, which keyed off literal
 * seeded Domain names ("Memory & Cognition", "Quantitative System Dev") and
 * so could never fire for a Field the user created, and of which only two
 * were ever wired into the engine.
 */

// ============================================================================
// Effects
// ============================================================================
//
// Every effect kind below hooks a specific, already-existing computation.
// Nothing here is cosmetic: if an effect cannot be pointed at the line it
// changes, it does not belong in the pool.

export type SkillEffect =
  /** Multiplies the per-review payout (xp.ts `reviewReward`). */
  | { kind: "REVIEW_YIELD"; multiplier: number }
  /** Lowers the diminishing-returns constant in `yieldXp` for saturated domains. */
  | { kind: "DECAY_RESISTANCE"; lambda: number }
  /** Intercepts Degradation up to N times per ISO week (srs.ts `attemptDegradation`). */
  | { kind: "DEGRADATION_WARD"; weeklyCharges: number }
  /** Adds days to the grace period before an unreviewed Idea degrades. */
  | { kind: "GRACE_EXTENSION"; extraDays: number }
  /** Stretches review intervals — same retention, fewer sessions. */
  | { kind: "INTERVAL_DILATION"; multiplier: number }
  /** Raises the combo multiplier ceiling above COMBO_CAP. */
  | { kind: "COMBO_CEILING"; extraSteps: number }
  /** Keeps a fraction of the combo on a wrong answer instead of resetting to zero. */
  | { kind: "COMBO_ANCHOR"; retained: number }
  /** Multiplies the level-12 mastery bonus and the mastery points it mints. */
  | { kind: "MASTERY_YIELD"; multiplier: number }
  /** Extra failed attempts tolerated before Degradation triggers. */
  | { kind: "STRIKE_TOLERANCE"; extraStrikes: number }
  /** Floors `yieldXp` at this fraction of base, however saturated the domain. */
  | { kind: "YIELD_FLOOR"; fractionOfBase: number }
  /** Raises the auto-merge similarity threshold — fewer submissions silently absorbed. */
  | { kind: "DEDUP_PRECISION"; thresholdDelta: number }
  /** Amplifies per-Field streak rewards (field-streaks.ts). */
  | { kind: "STREAK_AMPLIFIER"; multiplier: number }
  /** Adds a flat percentage to every attribute score. */
  | { kind: "RESONANCE"; percent: number };

export type SkillEffectKind = SkillEffect["kind"];

interface Archetype {
  code: string;
  /** Closes a pure skill's name: "<Adjective> <noun>". */
  noun: string;
  kind: SkillEffectKind;
  /** Attributes this archetype can be built from. Also seeds the synergy pairs. */
  affinities: readonly Attribute[];
  /**
   * 1–5. Drives mastery cost and attribute requirements: the more the effect
   * reaches into the engine, the more it costs to hold. A flat yield bump is
   * cheap; rewriting how deduplication decides is not.
   */
  complexity: number;
  /** Effect magnitude at a given tier. */
  magnitude: (tier: number) => SkillEffect;
  /** Human-readable effect, for the UI. */
  describe: (effect: SkillEffect) => string;
}

/**
 * Fraction of an archetype's peak effect delivered at a given tier.
 *
 * Sub-linear on purpose, and it is the single most important number in the
 * pool's feel. Real knowledge acquisition has diminishing returns — the
 * first pass through a subject moves you enormously, the eighth pass
 * refines an edge — so each successive tier adds *less* than the one
 * before while costing more. Concretely, across the eight Pure tiers the
 * curve delivers roughly 28%, 43%, 54%, 65%, 75%, 84%, 92%, 100% of peak:
 * eight real steps rather than five coarse ones, with the back half
 * deliberately grinding.
 *
 * Defined past PURE_MAX_TIER as well, because Capstone tiers continue the
 * same curve into 9-13 and are supposed to exceed anything a single
 * lineage can reach alone.
 */
function effectProgress(tier: number): number {
  return Math.pow(tier / PURE_MAX_TIER, 0.62);
}

/**
 * Continuous effects ride `effectProgress` toward a stated peak, so they
 * gain less per tier as the lineage deepens. Countable effects (charges,
 * days, strikes) instead step linearly with tier: rounding a diminishing
 * curve onto integers produces adjacent tiers with *identical* numbers,
 * and paying a steeper price for a purchase that visibly changes nothing
 * is the one thing a long ladder must never do.
 */
const ARCHETYPES: readonly Archetype[] = [
  {
    code: "DIVIDEND",
    noun: "Dividend",
    kind: "REVIEW_YIELD",
    affinities: ["LOGIC", "STATISTIC", "MIND"],
    complexity: 1,
    magnitude: (t) => ({ kind: "REVIEW_YIELD", multiplier: 1 + 0.3 * effectProgress(t) }),
    describe: (e) => (e.kind === "REVIEW_YIELD" ? `+${Math.round((e.multiplier - 1) * 100)}% points per review` : ""),
  },
  {
    code: "PATIENCE",
    noun: "Patience",
    kind: "DECAY_RESISTANCE",
    affinities: ["ABSTRACT", "CREATIVITY", "REASON"],
    complexity: 3,
    // DEFAULT_LAMBDA is 0.15; lower means saturated domains keep paying.
    magnitude: (t) => ({ kind: "DECAY_RESISTANCE", lambda: Math.max(0.03, 0.15 - 0.1 * effectProgress(t)) }),
    describe: (e) => (e.kind === "DECAY_RESISTANCE" ? `Similarity decay λ ${e.lambda.toFixed(3)} (from 0.15)` : ""),
  },
  {
    code: "WARD",
    noun: "Ward",
    kind: "DEGRADATION_WARD",
    affinities: ["STUBBORNNESS", "FAITH", "SELF_RESPECT"],
    complexity: 4,
    magnitude: (t) => ({ kind: "DEGRADATION_WARD", weeklyCharges: t }),
    describe: (e) =>
      e.kind === "DEGRADATION_WARD"
        ? `Absorbs ${e.weeklyCharges} degradation${e.weeklyCharges === 1 ? "" : "s"} per week`
        : "",
  },
  {
    code: "CLEMENCY",
    noun: "Clemency",
    kind: "GRACE_EXTENSION",
    affinities: ["COMPASSION", "FAITH", "SELF_RESPECT"],
    complexity: 2,
    magnitude: (t) => ({ kind: "GRACE_EXTENSION", extraDays: t }),
    describe: (e) => (e.kind === "GRACE_EXTENSION" ? `+${e.extraDays}d grace before decay` : ""),
  },
  {
    code: "DILATION",
    noun: "Dilation",
    kind: "INTERVAL_DILATION",
    affinities: ["MIND", "ABSTRACT", "PHYSICAL"],
    complexity: 4,
    magnitude: (t) => ({ kind: "INTERVAL_DILATION", multiplier: 1 + 0.4 * effectProgress(t) }),
    describe: (e) =>
      e.kind === "INTERVAL_DILATION" ? `+${Math.round((e.multiplier - 1) * 100)}% review interval` : "",
  },
  {
    code: "CRESCENDO",
    noun: "Crescendo",
    kind: "COMBO_CEILING",
    affinities: ["PHYSICAL", "STUBBORNNESS", "MIND"],
    complexity: 2,
    magnitude: (t) => ({ kind: "COMBO_CEILING", extraSteps: Math.ceil(1.25 * t) }),
    describe: (e) => (e.kind === "COMBO_CEILING" ? `Combo ceiling +${e.extraSteps} answers` : ""),
  },
  {
    code: "ANCHOR",
    noun: "Anchor",
    kind: "COMBO_ANCHOR",
    affinities: ["SELF_RESPECT", "REBUTTAL", "FAITH"],
    complexity: 3,
    magnitude: (t) => ({ kind: "COMBO_ANCHOR", retained: Math.min(0.75, 0.75 * effectProgress(t)) }),
    describe: (e) => (e.kind === "COMBO_ANCHOR" ? `Keeps ${Math.round(e.retained * 100)}% of combo on a miss` : ""),
  },
  {
    code: "CROWN",
    noun: "Crown",
    kind: "MASTERY_YIELD",
    affinities: ["CRITICAL_THINKING", "REASON", "MIND"],
    complexity: 5,
    magnitude: (t) => ({ kind: "MASTERY_YIELD", multiplier: 1 + 1.25 * effectProgress(t) }),
    describe: (e) =>
      e.kind === "MASTERY_YIELD" ? `+${Math.round((e.multiplier - 1) * 100)}% mastery bonus and points` : "",
  },
  {
    code: "FORTITUDE",
    noun: "Fortitude",
    kind: "STRIKE_TOLERANCE",
    affinities: ["PHYSICAL", "STUBBORNNESS", "COMPASSION"],
    complexity: 3,
    magnitude: (t) => ({ kind: "STRIKE_TOLERANCE", extraStrikes: t }),
    describe: (e) =>
      e.kind === "STRIKE_TOLERANCE" ? `+${e.extraStrikes} strike${e.extraStrikes === 1 ? "" : "s"} before decay` : "",
  },
  {
    code: "WELLSPRING",
    noun: "Wellspring",
    kind: "YIELD_FLOOR",
    affinities: ["CREATIVITY", "ABSTRACT", "FAITH"],
    complexity: 4,
    magnitude: (t) => ({ kind: "YIELD_FLOOR", fractionOfBase: Math.min(0.6, 0.6 * effectProgress(t)) }),
    describe: (e) =>
      e.kind === "YIELD_FLOOR" ? `New ideas never yield below ${Math.round(e.fractionOfBase * 100)}% of base` : "",
  },
  {
    code: "DISCERNMENT",
    noun: "Discernment",
    kind: "DEDUP_PRECISION",
    affinities: ["CRITICAL_THINKING", "REBUTTAL", "STATISTIC"],
    complexity: 5,
    magnitude: (t) => ({ kind: "DEDUP_PRECISION", thresholdDelta: 0.02 * effectProgress(t) }),
    describe: (e) =>
      e.kind === "DEDUP_PRECISION"
        ? `Auto-merge threshold +${(e.thresholdDelta * 100).toFixed(2)}pp — fewer submissions absorbed`
        : "",
  },
  {
    code: "COVENANT",
    noun: "Covenant",
    kind: "STREAK_AMPLIFIER",
    affinities: ["FAITH", "STUBBORNNESS", "SELF_RESPECT"],
    complexity: 4,
    magnitude: (t) => ({ kind: "STREAK_AMPLIFIER", multiplier: 1 + 1.0 * effectProgress(t) }),
    describe: (e) =>
      e.kind === "STREAK_AMPLIFIER" ? `+${Math.round((e.multiplier - 1) * 100)}% field-streak effect` : "",
  },
  {
    code: "RESONANCE",
    noun: "Resonance",
    kind: "RESONANCE",
    affinities: ["MIND", "REASON", "CREATIVITY"],
    complexity: 5,
    magnitude: (t) => ({ kind: "RESONANCE", percent: Math.round(10 * effectProgress(t)) }),
    describe: (e) => (e.kind === "RESONANCE" ? `+${e.percent}% to all attribute scores` : ""),
  },
];

// ============================================================================
// Difficulty curve
// ============================================================================

/**
 * Ladder depth.
 *
 * Deliberately long. Five coarse Pure tiers meant a lineage was finished
 * almost as soon as it was started; eight finer ones — each worth less
 * than the last (`effectProgress`) and costing more — is what turns a
 * lineage into something you work at over months rather than clear in an
 * afternoon. Synergy and Capstone were widened to match so the whole tree
 * escalates at one rate instead of three.
 */
export const PURE_MAX_TIER = 8;
export const SYNERGY_MAX_TIER = 5;

/**
 * Attribute score required at a given tier.
 *
 * Super-linear (t^1.55) so tiers separate sharply rather than arriving in a
 * clump. Attribute score is `Σ fieldLevel × weight/100`, so a high tier means
 * sustained investment in Fields that actually weight that attribute — you
 * cannot arrive there by breadth alone.
 *
 * The coefficient tracks the Domain leveling curve. When `DOMAIN_LEVEL_STEP`
 * went from 2 to 7, Domain levels shrank by 3.5x and Field levels — being
 * `Σ domainLevel^0.75` — by 3.5^0.75 ≈ 2.56x, and attribute score is linear
 * in Field level. Left at 3 this would have made every gate 2.56x harder as a
 * side effect of a change that was about early pacing, quietly pushing the
 * Ultimates out of reach. Scaling by the same factor keeps the tree exactly
 * as reachable as it was: the same amount of work unlocks the same skills,
 * and only the number printed on a Domain changed.
 */
const ATTRIBUTE_SCORE_COEFFICIENT = 3 / Math.pow(3.5, 0.75);

export function requiredAttributeScore(tier: number): number {
  return Math.round(ATTRIBUTE_SCORE_COEFFICIENT * Math.pow(tier, 1.55) * 10) / 10;
}

/**
 * Mastery points to unlock.
 *
 * Quadratic in tier and linear in complexity, doubled for synergies. A
 * tier-I trinket is 1 point; a tier-V rewrite of the mastery economy is 125.
 * Points are minted roughly one per idea driven to level 12, so the top of a
 * lineage is deliberately a long campaign rather than a purchase.
 */
export function masteryCost(complexity: number, tier: number, synergy: boolean): number {
  return complexity * tier * tier * (synergy ? 2 : 1);
}

export const CAPSTONE_MAX_TIER = 5;

/**
 * A Capstone tier N literally continues its dominant parent archetype's own
 * curve past Tier V (magnitude(5+N), requiredAttributeScore(5+N)) — it is
 * not a new formula, it is the same lineage pushed further, gated by owning
 * a second archetype's Tier V as well. `(5+tier)^2 * 3` is a flat 4.32x
 * multiplier over that archetype's own Tier-V Pure cost at every complexity
 * ((6^2*3)/(5^2*1) = 108/25 = (7^2*3)/... = same ratio throughout), so the
 * "combining costs more than either half alone" claim is provable, not
 * hand-tuned per lineage.
 */
export function capstoneMasteryCost(complexity: number, capstoneTier: number): number {
  return complexity * Math.pow(PURE_MAX_TIER + capstoneTier, 2) * 3;
}

/**
 * One Apex per attribute, fused from every Capstone lineage that attribute
 * has. Derived from the ladder rather than hardcoded, so it stays provably
 * above the deepest Capstone at the same complexity however the tier
 * counts are retuned: `(depth)^2 * 5` against the Capstone's `depth^2 * 3`
 * one rung lower. The `print-skill-pool-stats` script asserts that
 * ordering across every prerequisite edge.
 */
export function apexMasteryCost(maxComplexity: number): number {
  return maxComplexity * Math.pow(PURE_MAX_TIER + CAPSTONE_MAX_TIER + 1, 2) * 5;
}

/** Every archetype that lists `attribute` as an affinity, in ARCHETYPES order. */
function archetypesByAttribute(): Map<Attribute, Archetype[]> {
  const map = new Map<Attribute, Archetype[]>();
  for (const arch of ARCHETYPES) {
    for (const attribute of arch.affinities) {
      const list = map.get(attribute) ?? [];
      list.push(arch);
      map.set(attribute, list);
    }
  }
  return map;
}

// ============================================================================
// Generated pool
// ============================================================================

/**
 * PURE/SYNERGY are single-lineage, single-parent chains (tier N requires
 * tier N-1 of the same lineage). CAPSTONE and APEX are the fan-in tiers:
 * a Capstone requires two *different* archetypes' Pure Tier-V skills to
 * exist at once, and an Apex requires several Capstones — "low level skill
 * combine to unlock higher skill," literally, not just a longer chain.
 * ULTIMATE sits above the Apex: it requires the Apex (which already implies
 * every Pure/Synergy/Capstone beneath it — "complete the whole path") plus
 * standing in two *other* attributes, the literal mechanism forcing a
 * player out of one comfort-zone specialty before the run's most powerful
 * skills open up.
 */
export type SkillRank = "PURE" | "SYNERGY" | "CAPSTONE" | "APEX" | "ULTIMATE";

export interface Skill {
  code: string;
  name: string;
  /** Sole archetype for PURE/SYNERGY; dominant (higher-complexity) parent for CAPSTONE; "APEX"/ULTIMATE archetype code for those ranks. */
  archetypeCode: string;
  /** The archetypes a CAPSTONE/APEX/ULTIMATE actually fans in from — absent for PURE/SYNERGY, where archetypeCode already says it all. */
  parentArchetypes?: string[];
  /** One attribute for PURE/CAPSTONE/APEX/ULTIMATE, two for a SYNERGY. */
  attributes: Attribute[];
  rank: SkillRank;
  tier: number;
  effect: SkillEffect;
  effectText: string;
  complexity: number;
  masteryCost: number;
  /** Every listed attribute must reach this score. */
  requiredScore: number;
  /** Every code here must already be owned. 0 entries = a lineage's own root (Pure Tier I). */
  prerequisites: string[];
  /** ULTIMATE only — two attributes *outside* this skill's own that must independently clear a lesser bar. The breadth gate. */
  breadthRequirement?: { attribute: Attribute; requiredScore: number }[];
  flavour: string;
}

// Indexed by tier, so index 0 is unused. Runs to VIII because PURE_MAX_TIER
// is 8 — a short array here silently produced "Eidetic Crown undefined".
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

function pureCode(archetype: string, attribute: Attribute, tier: number): string {
  return `P_${archetype}_${attribute}_T${tier}`;
}

function synergyCode(archetype: string, a: Attribute, b: Attribute, tier: number): string {
  return `S_${archetype}_${a}_${b}_T${tier}`;
}

function capstoneCode(attribute: Attribute, archA: string, archB: string, tier: number): string {
  return `C_${attribute}_${archA}_${archB}_T${tier}`;
}

function apexCode(attribute: Attribute): string {
  return `X_${attribute}`;
}

function ultimateCode(archetype: string, attribute: Attribute): string {
  return `U_${archetype}_${attribute}`;
}

/**
 * Capstones: the fan-in tier. For every attribute, every unordered pair of
 * archetypes that both train it gets its own 3-tier lineage whose Tier-I
 * prerequisite is BOTH archetypes' Pure Tier-V for that attribute — a real
 * two-parent unlock, not a longer single chain. An archetype pair sharing
 * more than one attribute (e.g. WARD & CLEMENCY share both FAITH and
 * SELF_RESPECT) legitimately produces one lineage per shared attribute;
 * each is a distinct discipline, same as PURE/SYNERGY already treat
 * per-attribute lineages as distinct.
 */
function buildCapstones(): Skill[] {
  const pool: Skill[] = [];
  const byAttribute = archetypesByAttribute();

  for (const attribute of ATTRIBUTES) {
    const archs = byAttribute.get(attribute) ?? [];
    for (let i = 0; i < archs.length; i++) {
      for (let j = i + 1; j < archs.length; j++) {
        const [archA, archB] = [archs[i], archs[j]].sort((x, y) => x.code.localeCompare(y.code));
        // Tie-break on complexity favours whichever archetype sorts first —
        // deterministic, and matches the alphabetical code ordering below.
        const dominant = archB.complexity > archA.complexity ? archB : archA;
        const pairComplexity = Math.max(archA.complexity, archB.complexity);

        let previousCode: string | null = null;
        for (let tier = 1; tier <= CAPSTONE_MAX_TIER; tier++) {
          const effect = dominant.magnitude(PURE_MAX_TIER + tier);
          const code = capstoneCode(attribute, archA.code, archB.code, tier);
          const prerequisites =
            tier === 1
              ? [pureCode(archA.code, attribute, PURE_MAX_TIER), pureCode(archB.code, attribute, PURE_MAX_TIER)]
              : [previousCode!];

          pool.push({
            code,
            name: `${ATTRIBUTE_META[attribute].adjective} ${archA.noun}-${archB.noun} Capstone ${ROMAN[tier]}`.trim(),
            archetypeCode: dominant.code,
            parentArchetypes: [archA.code, archB.code],
            attributes: [attribute],
            rank: "CAPSTONE",
            tier,
            effect,
            effectText: dominant.describe(effect),
            complexity: pairComplexity,
            masteryCost: capstoneMasteryCost(pairComplexity, tier),
            requiredScore: requiredAttributeScore(PURE_MAX_TIER + tier),
            prerequisites,
            flavour: `${archA.noun} and ${archB.noun}, fused through ${ATTRIBUTE_META[attribute].label} — neither alone was enough.`,
          });
          previousCode = code;
        }
      }
    }
  }

  return pool;
}

/**
 * Apex: one per attribute, the top of the pyramid. Its prerequisite is
 * every Capstone Tier-III lineage that attribute has — own them all, and
 * only then does the attribute's Apex unlock. LOGIC is the sole exception:
 * only DIVIDEND trains it, so no archetype *pair* — and therefore no
 * Capstone — exists for it. It still gets a genuine 3-way, cross-lineage
 * fan-in: DIVIDEND's own Pure Tier-V for LOGIC plus its two Synergy
 * Tier-III lineages pairing LOGIC with its other two affinities.
 */
function buildApex(capstones: Skill[]): Skill[] {
  const pool: Skill[] = [];
  const byAttribute = archetypesByAttribute();

  for (const attribute of ATTRIBUTES) {
    const tier3 = capstones.filter((s) => s.tier === CAPSTONE_MAX_TIER && s.attributes[0] === attribute);

    let prerequisites: string[];
    let complexity: number;
    let parentArchetypes: string[];

    if (tier3.length > 0) {
      prerequisites = tier3.map((s) => s.code);
      complexity = Math.max(...tier3.map((s) => s.complexity));
      parentArchetypes = Array.from(new Set(tier3.flatMap((s) => s.parentArchetypes ?? [])));
    } else {
      const sole = (byAttribute.get(attribute) ?? [])[0];
      if (!sole) throw new Error(`No archetype trains attribute ${attribute} — cannot build its Apex.`);
      const others = sole.affinities.filter((a) => a !== attribute);
      prerequisites = [
        pureCode(sole.code, attribute, PURE_MAX_TIER),
        ...others.map((other) => {
          const [a, b] = [attribute, other].sort() as [Attribute, Attribute];
          return synergyCode(sole.code, a, b, SYNERGY_MAX_TIER);
        }),
      ];
      complexity = sole.complexity;
      parentArchetypes = [sole.code];
    }

    const percent = 10 + prerequisites.length;
    const effect: SkillEffect = { kind: "RESONANCE", percent };
    const apexTier = PURE_MAX_TIER + CAPSTONE_MAX_TIER + 1; // 9 — one past the deepest Capstone

    pool.push({
      code: apexCode(attribute),
      name: `Apex of ${ATTRIBUTE_META[attribute].label}`,
      archetypeCode: "APEX",
      parentArchetypes,
      attributes: [attribute],
      rank: "APEX",
      tier: apexTier,
      effect,
      effectText: `+${percent}% to all attribute scores`,
      complexity,
      masteryCost: apexMasteryCost(complexity),
      requiredScore: requiredAttributeScore(apexTier),
      prerequisites,
      flavour: `Every discipline that touches ${ATTRIBUTE_META[attribute].label} converges here.`,
    });
  }

  return pool;
}

// ============================================================================
// Ultimate tier — three per attribute, gated on completing the whole path
// ============================================================================

/** One rung past the Apex — the deepest thing in the pool. */
export const ULTIMATE_TIER = PURE_MAX_TIER + CAPSTONE_MAX_TIER + 2;
/** The score bar each of the two breadth attributes must clear — real but not maximal investment in a second discipline. */
export const ULTIMATE_BREADTH_TIER = 5;

/**
 * A flat 3x an attribute's own Apex cost — the ratio holds at every
 * complexity level, so the escalation is provable rather than tuned per
 * attribute. For the highest-complexity attributes this runs to five
 * figures: the top of this game is a campaign, not a purchase, and there
 * are three of these per attribute to choose between.
 */
export function ultimateMasteryCost(apexComplexity: number): number {
  return apexMasteryCost(apexComplexity) * 3;
}

/**
 * Hand-authored, not derived: which two attributes an Ultimate additionally
 * demands standing in. Chosen for a real thematic complement to the primary
 * attribute (the body a pure mind neglects, the doubt a believer needs,
 * the structure an inventor needs) rather than an arbitrary index offset —
 * the point is that stepping outside the comfort zone should read as
 * *meaningful*, not just mechanically enforced.
 */
const ULTIMATE_BREADTH_PAIRS: Record<Attribute, readonly [Attribute, Attribute]> = {
  MIND: ["PHYSICAL", "CREATIVITY"],
  PHYSICAL: ["FAITH", "SELF_RESPECT"],
  CRITICAL_THINKING: ["COMPASSION", "FAITH"],
  COMPASSION: ["LOGIC", "REBUTTAL"],
  ABSTRACT: ["STATISTIC", "PHYSICAL"],
  LOGIC: ["CREATIVITY", "COMPASSION"],
  REASON: ["FAITH", "STUBBORNNESS"],
  REBUTTAL: ["COMPASSION", "SELF_RESPECT"],
  SELF_RESPECT: ["COMPASSION", "CRITICAL_THINKING"],
  FAITH: ["CRITICAL_THINKING", "STATISTIC"],
  CREATIVITY: ["LOGIC", "STUBBORNNESS"],
  STUBBORNNESS: ["CREATIVITY", "REASON"],
  STATISTIC: ["ABSTRACT", "FAITH"],
};

interface UltimateArchetype {
  code: string;
  label: string;
  /** One clause, used in the generated flavour text. */
  tagline: string;
  magnitude: () => SkillEffect;
  describe: (effect: SkillEffect) => string;
}

/**
 * Three finishing moves, identical across all 13 attributes so the choice
 * between them is about playstyle, not availability: APOTHEOSIS rewards
 * raw output, SENTINEL makes a Field's Ideas unbreakable, POLYMATH pays its
 * own breadth requirement forward by boosting every attribute at once —
 * each magnitude is set to clearly exceed anything reachable below Ultimate
 * (Apex's own ceiling is 20% RESONANCE; POLYMATH is 40%), so unlocking one
 * is unmistakably a different order of power, not one more increment.
 */
const ULTIMATE_ARCHETYPES: readonly UltimateArchetype[] = [
  {
    code: "APOTHEOSIS",
    label: "Apotheosis",
    tagline: "raw, undiluted output — every review pays double",
    magnitude: () => ({ kind: "REVIEW_YIELD", multiplier: 2 }),
    describe: (e) => (e.kind === "REVIEW_YIELD" ? `+${Math.round((e.multiplier - 1) * 100)}% points per review` : ""),
  },
  {
    code: "SENTINEL",
    label: "Sentinel",
    tagline: "nothing built here can be taken from you again",
    magnitude: () => ({ kind: "DEGRADATION_WARD", weeklyCharges: 99 }),
    describe: () => "Degradation effectively cannot touch this Field again",
  },
  {
    code: "POLYMATH",
    label: "Polymath",
    tagline: "proof that no single path was ever the whole answer",
    magnitude: () => ({ kind: "RESONANCE", percent: 40 }),
    describe: (e) => (e.kind === "RESONANCE" ? `+${e.percent}% to all attribute scores` : ""),
  },
];

/**
 * One Ultimate per (attribute × archetype) = 39 skills. `prerequisites` is
 * just `[apex.code]` — the Apex already transitively demands every Pure,
 * Synergy and Capstone lineage that attribute has, so requiring it alone
 * *is* "complete the whole path." `breadthRequirement` is the second,
 * independent gate: standing in two attributes this skill does not itself
 * train, checked by skill-effects.ts's `unlockBlockers` as a BREADTH
 * blocker distinct from the usual same-attribute ATTRIBUTE blocker.
 */
function buildUltimates(apex: Skill[]): Skill[] {
  const pool: Skill[] = [];
  const apexByAttribute = new Map(apex.map((s) => [s.attributes[0], s]));

  for (const attribute of ATTRIBUTES) {
    const apexSkill = apexByAttribute.get(attribute);
    if (!apexSkill) continue; // unreachable — buildApex emits exactly one per attribute

    const [breadthA, breadthB] = ULTIMATE_BREADTH_PAIRS[attribute];
    const breadthRequirement = [breadthA, breadthB].map((a) => ({
      attribute: a,
      requiredScore: requiredAttributeScore(ULTIMATE_BREADTH_TIER),
    }));

    for (const arch of ULTIMATE_ARCHETYPES) {
      const effect = arch.magnitude();
      pool.push({
        code: ultimateCode(arch.code, attribute),
        name: `${arch.label} of ${ATTRIBUTE_META[attribute].label}`,
        archetypeCode: arch.code,
        parentArchetypes: apexSkill.parentArchetypes,
        attributes: [attribute],
        rank: "ULTIMATE",
        tier: ULTIMATE_TIER,
        effect,
        effectText: arch.describe(effect),
        complexity: apexSkill.complexity,
        masteryCost: ultimateMasteryCost(apexSkill.complexity),
        requiredScore: requiredAttributeScore(ULTIMATE_TIER),
        prerequisites: [apexSkill.code],
        breadthRequirement,
        flavour: `${arch.tagline} — earned by completing the whole ${ATTRIBUTE_META[attribute].label} path, and by proving yourself in ${ATTRIBUTE_META[breadthA].label} and ${ATTRIBUTE_META[breadthB].label} besides.`,
      });
    }
  }

  return pool;
}

function buildPool(): Skill[] {
  const pool: Skill[] = [];

  // ── Pure lineages: one attribute, five tiers ────────────────────────
  for (const arch of ARCHETYPES) {
    for (const attribute of arch.affinities) {
      for (let tier = 1; tier <= PURE_MAX_TIER; tier++) {
        const effect = arch.magnitude(tier);
        pool.push({
          code: pureCode(arch.code, attribute, tier),
          name: `${ATTRIBUTE_META[attribute].adjective} ${arch.noun} ${ROMAN[tier]}`.trim(),
          archetypeCode: arch.code,
          attributes: [attribute],
          rank: "PURE",
          tier,
          effect,
          effectText: arch.describe(effect),
          complexity: arch.complexity,
          masteryCost: masteryCost(arch.complexity, tier, false),
          requiredScore: requiredAttributeScore(tier),
          prerequisites: tier > 1 ? [pureCode(arch.code, attribute, tier - 1)] : [],
          flavour: ATTRIBUTE_META[attribute].blurb,
        });
      }
    }
  }

  // ── Synergy lineages: two attributes, three tiers ───────────────────
  //
  // Each unordered attribute pair is claimed by the FIRST archetype whose
  // affinities contain both. Without that rule the same pair would generate
  // a skill under several archetypes and collide on the generated name;
  // with it, a pair reads as one distinct discipline.
  const claimed = new Set<string>();
  for (const arch of ARCHETYPES) {
    for (let i = 0; i < arch.affinities.length; i++) {
      for (let j = i + 1; j < arch.affinities.length; j++) {
        const [a, b] = [arch.affinities[i], arch.affinities[j]].sort() as [Attribute, Attribute];
        const pairKey = `${a}|${b}`;
        if (claimed.has(pairKey)) continue;
        claimed.add(pairKey);

        for (let tier = 1; tier <= SYNERGY_MAX_TIER; tier++) {
          // Synergies land one tier above their number — the cost of
          // needing two attributes high at once is repaid in magnitude.
          const effect = arch.magnitude(tier + 1);
          pool.push({
            code: synergyCode(arch.code, a, b, tier),
            name: `${ATTRIBUTE_META[a].adjective} ${ATTRIBUTE_META[b].noun} ${ROMAN[tier]}`.trim(),
            archetypeCode: arch.code,
            attributes: [a, b],
            rank: "SYNERGY",
            tier,
            effect,
            effectText: arch.describe(effect),
            complexity: arch.complexity,
            masteryCost: masteryCost(arch.complexity, tier, true),
            // Both attributes must independently clear the bar.
            requiredScore: requiredAttributeScore(tier + 1),
            prerequisites: tier > 1 ? [synergyCode(arch.code, a, b, tier - 1)] : [],
            flavour: `${ATTRIBUTE_META[a].label} and ${ATTRIBUTE_META[b].label}, held together.`,
          });
        }
      }
    }
  }

  const capstones = buildCapstones();
  const apex = buildApex(capstones);
  const ultimates = buildUltimates(apex);

  return [...pool, ...capstones, ...apex, ...ultimates];
}

export const SKILL_POOL: readonly Skill[] = buildPool();

export const SKILLS_BY_CODE: ReadonlyMap<string, Skill> = new Map(SKILL_POOL.map((s) => [s.code, s]));

export function getSkill(code: string): Skill | undefined {
  return SKILLS_BY_CODE.get(code);
}

/** Every skill whose lineage touches an attribute. */
export function skillsForAttribute(attribute: Attribute): Skill[] {
  return SKILL_POOL.filter((s) => s.attributes.includes(attribute));
}

export const ARCHETYPE_LIST = ARCHETYPES;
