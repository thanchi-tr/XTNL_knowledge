import type { Attribute } from "@prisma/client";

/**
 * The thirteen base attributes.
 *
 * Every Field declares a percentage split across these, and Field levels
 * flow into attribute scores weighted by that split. Attributes are
 * therefore *earned by what you study*, not allocated freely — a Field of
 * pure formal mathematics cannot produce Compassion no matter how far it
 * levels, which is the constraint that makes a skill gated on Compassion
 * mean something.
 */
export const ATTRIBUTES = [
  "MIND",
  "PHYSICAL",
  "CRITICAL_THINKING",
  "COMPASSION",
  "ABSTRACT",
  "LOGIC",
  "REASON",
  "REBUTTAL",
  "SELF_RESPECT",
  "FAITH",
  "CREATIVITY",
  "STUBBORNNESS",
  "STATISTIC",
] as const satisfies readonly Attribute[];

export interface AttributeMeta {
  key: Attribute;
  label: string;
  /** One line on what studying this actually trains. */
  blurb: string;
  /**
   * Naming fragments for procedural skill generation (skill-pool.ts).
   * `adjective` leads a skill name, `noun` closes a synergy name. Curated
   * per attribute so generated names read as written rather than assembled.
   */
  adjective: string;
  noun: string;
}

export const ATTRIBUTE_META: Record<Attribute, AttributeMeta> = {
  MIND: {
    key: "MIND",
    label: "Mind",
    blurb: "Raw retention and working memory — how much you can hold at once.",
    adjective: "Eidetic",
    noun: "Recall",
  },
  PHYSICAL: {
    key: "PHYSICAL",
    label: "Physical",
    blurb: "Stamina and repetition tolerance — grinding volume without decay.",
    adjective: "Tempered",
    noun: "Endurance",
  },
  CRITICAL_THINKING: {
    key: "CRITICAL_THINKING",
    label: "Critical Thinking",
    blurb: "Detecting the flaw, the unstated premise, the sleight of hand.",
    adjective: "Incisive",
    noun: "Scrutiny",
  },
  COMPASSION: {
    key: "COMPASSION",
    label: "Compassion",
    blurb: "Patience with your own failure — recovery rather than punishment.",
    adjective: "Merciful",
    noun: "Clemency",
  },
  ABSTRACT: {
    key: "ABSTRACT",
    label: "Abstract",
    blurb: "Working above the concrete — structure, analogy, generalisation.",
    adjective: "Rarefied",
    noun: "Abstraction",
  },
  LOGIC: {
    key: "LOGIC",
    label: "Logic",
    blurb: "Formal validity — what follows, and what only appears to.",
    adjective: "Deductive",
    noun: "Entailment",
  },
  REASON: {
    key: "REASON",
    label: "Reason",
    blurb: "Judgement under uncertainty, where logic alone runs out.",
    adjective: "Considered",
    noun: "Judgement",
  },
  REBUTTAL: {
    key: "REBUTTAL",
    label: "Rebuttal",
    blurb: "Holding a position under attack, and dismantling the counter.",
    adjective: "Adversarial",
    noun: "Riposte",
  },
  SELF_RESPECT: {
    key: "SELF_RESPECT",
    label: "Self Respect",
    blurb: "Refusing to let one bad session define the account.",
    adjective: "Unbowed",
    noun: "Standing",
  },
  FAITH: {
    key: "FAITH",
    label: "Faith",
    blurb: "Continuing through the interval where progress is invisible.",
    adjective: "Steadfast",
    noun: "Conviction",
  },
  CREATIVITY: {
    key: "CREATIVITY",
    label: "Creativity",
    blurb: "Generating the connection nobody handed you.",
    adjective: "Divergent",
    noun: "Invention",
  },
  STUBBORNNESS: {
    key: "STUBBORNNESS",
    label: "Stubbornness",
    blurb: "Refusing to drop a thread until it yields.",
    adjective: "Obstinate",
    noun: "Persistence",
  },
  STATISTIC: {
    key: "STATISTIC",
    label: "Statistic",
    blurb: "Reasoning about frequency, variance and what the sample supports.",
    adjective: "Empirical",
    noun: "Inference",
  },
};

export type Composition = Record<Attribute, number>;

export function emptyComposition(): Composition {
  return Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])) as Composition;
}

export const COMPOSITION_TOTAL = 100;

/**
 * Keyword-derived default composition, so a new Field arrives with a
 * plausible split rather than thirteen zeroes.
 *
 * Deterministic and offline by design — the same rule the skill pool
 * follows. A model call here would make the substrate of every downstream
 * unlock non-reproducible, and would make two identically-named Fields
 * potentially train different attributes.
 *
 * Purely a starting point: the value is user-editable afterwards, which is
 * where real intent gets expressed.
 */
const KEYWORD_AFFINITIES: { pattern: RegExp; weights: Partial<Composition> }[] = [
  { pattern: /math|algebra|calculus|topolog|number theory|geometr|analysis/i, weights: { LOGIC: 30, ABSTRACT: 30, REASON: 20, MIND: 20 } },
  { pattern: /statistic|probabil|data|econometric|quant/i, weights: { STATISTIC: 40, REASON: 20, LOGIC: 20, CRITICAL_THINKING: 20 } },
  { pattern: /physic|chemistr|biolog|science|thermodynam|mechanic/i, weights: { ABSTRACT: 25, LOGIC: 25, STATISTIC: 20, MIND: 30 } },
  { pattern: /comput|software|program|algorithm|engineer/i, weights: { LOGIC: 35, ABSTRACT: 25, CREATIVITY: 20, STUBBORNNESS: 20 } },
  { pattern: /philosoph|ethic|logic|rhetoric|argument|law|legal/i, weights: { REASON: 25, REBUTTAL: 25, CRITICAL_THINKING: 25, LOGIC: 25 } },
  { pattern: /histor|polit|econom|social|anthropol/i, weights: { CRITICAL_THINKING: 30, REASON: 25, STATISTIC: 20, MIND: 25 } },
  { pattern: /art|design|music|writ|literat|poetr|film/i, weights: { CREATIVITY: 40, ABSTRACT: 25, MIND: 20, SELF_RESPECT: 15 } },
  { pattern: /languag|vocab|grammar|linguist/i, weights: { MIND: 40, STUBBORNNESS: 25, PHYSICAL: 20, CREATIVITY: 15 } },
  { pattern: /medic|anatom|clinic|nurs|health/i, weights: { MIND: 30, COMPASSION: 25, CRITICAL_THINKING: 25, PHYSICAL: 20 } },
  { pattern: /psycholog|therap|counsel|relationship/i, weights: { COMPASSION: 35, CRITICAL_THINKING: 20, REASON: 20, SELF_RESPECT: 25 } },
  { pattern: /fitness|train|sport|athlet|nutrition/i, weights: { PHYSICAL: 45, STUBBORNNESS: 25, SELF_RESPECT: 20, FAITH: 10 } },
  { pattern: /theolog|religio|spirit|scriptur|meditat/i, weights: { FAITH: 40, COMPASSION: 20, ABSTRACT: 20, SELF_RESPECT: 20 } },
  { pattern: /trad|financ|invest|market|business/i, weights: { STATISTIC: 30, REASON: 25, SELF_RESPECT: 20, STUBBORNNESS: 25 } },
];

/** Even split across the four most general-purpose attributes. */
const FALLBACK_WEIGHTS: Partial<Composition> = {
  MIND: 30,
  LOGIC: 25,
  REASON: 25,
  CRITICAL_THINKING: 20,
};

export function defaultCompositionFor(fieldName: string): Composition {
  const match = KEYWORD_AFFINITIES.find((k) => k.pattern.test(fieldName));
  const base = { ...emptyComposition(), ...(match?.weights ?? FALLBACK_WEIGHTS) };
  return normaliseComposition(base);
}

/**
 * Forces a composition to sum to exactly COMPOSITION_TOTAL.
 *
 * Largest-remainder rather than naive rounding: proportional scaling of
 * integers routinely lands on 99 or 101, and a silent off-by-one in the
 * substrate would skew every attribute score derived from it.
 */
export function normaliseComposition(input: Composition): Composition {
  const total = ATTRIBUTES.reduce((sum, a) => sum + Math.max(0, input[a]), 0);
  if (total === 0) return emptyComposition();

  const exact = ATTRIBUTES.map((a) => ({
    attribute: a,
    value: (Math.max(0, input[a]) / total) * COMPOSITION_TOTAL,
  }));

  const out = emptyComposition();
  let assigned = 0;
  for (const e of exact) {
    out[e.attribute] = Math.floor(e.value);
    assigned += out[e.attribute];
  }

  // Hand out the remaining points to the largest fractional parts.
  const remainders = exact
    .map((e) => ({ attribute: e.attribute, frac: e.value - Math.floor(e.value) }))
    .sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (assigned < COMPOSITION_TOTAL && remainders.length > 0) {
    out[remainders[i % remainders.length].attribute] += 1;
    assigned += 1;
    i += 1;
  }

  return out;
}

export interface FieldContribution {
  fieldName: string;
  level: number;
  composition: Composition;
}

export type AttributeScores = Record<Attribute, number>;

/**
 * Attribute scores from Field levels and compositions.
 *
 * `score(A) = Σ_fields fieldLevel × weight(field, A) / 100`
 *
 * Linear in Field level on purpose. Field level is already sub-linear in
 * points (`floor(Σ domainLevel^0.75)`), so compounding another curve here
 * would make high attribute thresholds unreachable in practice rather than
 * merely demanding.
 */
export function computeAttributeScores(contributions: FieldContribution[]): AttributeScores {
  const scores = emptyComposition() as AttributeScores;
  for (const c of contributions) {
    for (const a of ATTRIBUTES) {
      scores[a] += (c.level * c.composition[a]) / COMPOSITION_TOTAL;
    }
  }
  for (const a of ATTRIBUTES) {
    scores[a] = Math.round(scores[a] * 100) / 100;
  }
  return scores;
}

/** Which Fields feed a given attribute, strongest first — for UI attribution. */
export function sourcesFor(attribute: Attribute, contributions: FieldContribution[]) {
  return contributions
    .map((c) => ({
      fieldName: c.fieldName,
      weight: c.composition[attribute],
      contribution: (c.level * c.composition[attribute]) / COMPOSITION_TOTAL,
    }))
    .filter((s) => s.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);
}
