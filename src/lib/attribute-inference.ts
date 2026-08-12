import type { Attribute, QuestionType } from "@prisma/client";
import {
  ATTRIBUTES,
  emptyComposition,
  normaliseComposition,
  COMPOSITION_TOTAL,
  type Composition,
} from "./attributes";

/**
 * Automatic attribute assignment for Fields, Domains and Ideas.
 *
 * Replaces `defaultCompositionFor`'s first-match-wins regex, which had two
 * problems worth naming. It stopped at the first pattern that matched, so
 * "Quantitative Trading Psychology" scored purely as mathematics and lost
 * both the trading and the psychology. And it only ever ran on Fields, so
 * a Domain or an Idea — the two levels where you actually say what you are
 * studying — contributed nothing to what your attributes became.
 *
 * The model here is a shrinkage estimator: evidence from the text, pulled
 * toward a prior from the level above.
 *
 *   posterior = confidence · evidence + (1 − confidence) · prior
 *
 * `confidence` saturates with how much lexical evidence the text actually
 * offers (`EVIDENCE_HALF_WEIGHT`), so a richly-worded Idea speaks mostly
 * for itself while a two-word Domain name mostly inherits its Field. That
 * is the behaviour you want in both directions: naming a Domain "Ch. 4"
 * should not reset it to a generic split, and writing a paragraph about
 * grief inside a mathematics Field should still register Compassion.
 *
 * Deterministic and offline, like everything else that decides game rules
 * here — a model call would make two identically-worded submissions score
 * differently between runs. (`gemini.ts` still grades attestations; that
 * judges the user's writing, it does not assign the substrate.)
 */

interface LexicalRule {
  pattern: RegExp;
  weights: Partial<Composition>;
  /** How much this rule is worth when it fires. Specific terms outweigh vague ones. */
  strength: number;
}

/**
 * Every rule that matches contributes — the whole point of moving off
 * first-match-wins. `strength` separates a term that names a discipline
 * outright ("thermodynamics") from one that merely leans ("system").
 */
const LEXICON: LexicalRule[] = [
  // ── Formal and quantitative ──────────────────────────────────────
  { pattern: /\b(math|algebra|calculus|topolog\w*|geometr\w*|theorem|proof|lemma)/i, strength: 3, weights: { LOGIC: 32, ABSTRACT: 30, REASON: 20, MIND: 18 } },
  { pattern: /\b(statistic\w*|probabilit\w*|bayes\w*|variance|regression|sample|distribution)/i, strength: 3, weights: { STATISTIC: 42, REASON: 20, CRITICAL_THINKING: 20, LOGIC: 18 } },
  { pattern: /\b(econometric|quantitative|quant|backtest\w*|expectancy|sharpe|drawdown)/i, strength: 3, weights: { STATISTIC: 35, REASON: 25, CRITICAL_THINKING: 20, STUBBORNNESS: 20 } },
  { pattern: /\b(logic|deduct\w*|inference|entail\w*|axiom|formal)/i, strength: 2, weights: { LOGIC: 45, REASON: 30, ABSTRACT: 25 } },

  // ── Natural science ──────────────────────────────────────────────
  { pattern: /\b(physic\w*|thermodynam\w*|mechanic\w*|quantum|relativit\w*)/i, strength: 3, weights: { ABSTRACT: 30, LOGIC: 26, MIND: 24, STATISTIC: 20 } },
  { pattern: /\b(chemistr\w*|molecul\w*|organic|reaction|bond|atom\w*)/i, strength: 3, weights: { MIND: 32, ABSTRACT: 24, LOGIC: 24, CRITICAL_THINKING: 20 } },
  { pattern: /\b(biolog\w*|cell\w*|neuro\w*|anatom\w*|genetic\w*|protein|enzyme)/i, strength: 3, weights: { MIND: 38, CRITICAL_THINKING: 22, ABSTRACT: 20, PHYSICAL: 20 } },

  // ── Engineering and computation ──────────────────────────────────
  { pattern: /\b(comput\w*|software|program\w*|algorithm\w*|data structure|compiler|database|api)/i, strength: 3, weights: { LOGIC: 34, ABSTRACT: 26, CREATIVITY: 20, STUBBORNNESS: 20 } },
  { pattern: /\b(engineer\w*|architect\w*|system|optimi[sz]\w*|debug\w*|refactor\w*)/i, strength: 2, weights: { LOGIC: 28, STUBBORNNESS: 26, ABSTRACT: 24, CREATIVITY: 22 } },

  // ── Argument, law, philosophy ────────────────────────────────────
  { pattern: /\b(philosoph\w*|ethic\w*|metaphysic\w*|epistem\w*)/i, strength: 3, weights: { REASON: 30, ABSTRACT: 26, CRITICAL_THINKING: 24, REBUTTAL: 20 } },
  { pattern: /\b(rhetoric|argument\w*|debate|rebut\w*|counter\w*|fallac\w*|refut\w*)/i, strength: 3, weights: { REBUTTAL: 40, CRITICAL_THINKING: 28, REASON: 20, LOGIC: 12 } },
  { pattern: /\b(law|legal|statut\w*|contract|jurisprud\w*|precedent)/i, strength: 3, weights: { REASON: 28, REBUTTAL: 26, CRITICAL_THINKING: 26, MIND: 20 } },

  // ── Humanities and society ───────────────────────────────────────
  { pattern: /\b(histor\w*|polit\w*|anthropol\w*|sociolog\w*|civili[sz]\w*)/i, strength: 2, weights: { CRITICAL_THINKING: 30, REASON: 26, MIND: 24, STATISTIC: 20 } },
  { pattern: /\b(econom\w*|market\w*|trade|trading|invest\w*|capital|fund|portfolio)/i, strength: 3, weights: { STATISTIC: 30, REASON: 26, SELF_RESPECT: 22, STUBBORNNESS: 22 } },

  // ── Craft and expression ─────────────────────────────────────────
  { pattern: /\b(art|design|music|paint\w*|film|poetr\w*|literat\w*|narrat\w*|composit\w*)/i, strength: 3, weights: { CREATIVITY: 42, ABSTRACT: 24, MIND: 18, SELF_RESPECT: 16 } },
  { pattern: /\b(writ\w*|essay|prose|draft\w*|edit\w*)/i, strength: 2, weights: { CREATIVITY: 34, ABSTRACT: 22, CRITICAL_THINKING: 22, MIND: 22 } },
  { pattern: /\b(languag\w*|vocab\w*|grammar|linguist\w*|conjugat\w*|kanji|character)/i, strength: 3, weights: { MIND: 42, STUBBORNNESS: 26, PHYSICAL: 18, CREATIVITY: 14 } },

  // ── Body, care, self ─────────────────────────────────────────────
  { pattern: /\b(fitness|training|sport|athlet\w*|nutrition|strength|endurance|exercise)/i, strength: 3, weights: { PHYSICAL: 46, STUBBORNNESS: 24, SELF_RESPECT: 20, FAITH: 10 } },
  { pattern: /\b(medic\w*|clinic\w*|nurs\w*|health|patient|diagnos\w*|radiograph\w*)/i, strength: 3, weights: { MIND: 30, COMPASSION: 26, CRITICAL_THINKING: 24, PHYSICAL: 20 } },
  { pattern: /\b(psycholog\w*|therap\w*|counsel\w*|relationship|empath\w*|grief|trauma)/i, strength: 3, weights: { COMPASSION: 38, CRITICAL_THINKING: 20, REASON: 20, SELF_RESPECT: 22 } },
  { pattern: /\b(discipline|habit|routine|consisten\w*|persever\w*|resilien\w*)/i, strength: 2, weights: { STUBBORNNESS: 36, SELF_RESPECT: 26, FAITH: 22, PHYSICAL: 16 } },
  { pattern: /\b(mindful\w*|meditat\w*|calm|patience|emotion\w*|regulat\w*)/i, strength: 2, weights: { COMPASSION: 30, SELF_RESPECT: 28, FAITH: 24, REASON: 18 } },
  { pattern: /\b(theolog\w*|religio\w*|spirit\w*|scriptur\w*|faith|prayer)/i, strength: 3, weights: { FAITH: 44, COMPASSION: 20, ABSTRACT: 20, SELF_RESPECT: 16 } },

  // ── Memory and study craft ───────────────────────────────────────
  { pattern: /\b(memor\w*|recall|retention|forgetting|mnemonic|spaced|repetition)/i, strength: 3, weights: { MIND: 46, STUBBORNNESS: 22, FAITH: 18, PHYSICAL: 14 } },
  { pattern: /\b(risk|uncertain\w*|bias|assumption|premise|evidence)/i, strength: 2, weights: { CRITICAL_THINKING: 34, REASON: 28, STATISTIC: 24, REBUTTAL: 14 } },
];

/**
 * Question type is a real structural signal, independent of wording: a
 * FORMULA card exercises manipulation of formal structure whatever it is
 * about. Weak on purpose — it nudges, it does not decide.
 */
const QUESTION_TYPE_SIGNAL: Record<QuestionType, { weights: Partial<Composition>; strength: number }> = {
  SHORT: { strength: 0.5, weights: { MIND: 60, REASON: 40 } },
  MULTI: { strength: 0.5, weights: { CRITICAL_THINKING: 55, REASON: 45 } },
  FORMULA: { strength: 1, weights: { LOGIC: 40, ABSTRACT: 35, STATISTIC: 25 } },
  DIAGRAM: { strength: 1, weights: { MIND: 45, ABSTRACT: 35, CRITICAL_THINKING: 20 } },
  // A blank is cued recall — almost purely retention, with the surrounding
  // sentence doing the reasoning for you.
  CLOZE: { strength: 0.5, weights: { MIND: 75, REASON: 25 } },
  // Producing every member of a set is retention under a completeness
  // constraint; noticing one is missing is the stubborn part.
  LIST: { strength: 0.75, weights: { MIND: 55, STUBBORNNESS: 25, CRITICAL_THINKING: 20 } },
  // Sequence is about relations between steps, not the steps themselves.
  ORDER: { strength: 1, weights: { LOGIC: 45, REASON: 30, ABSTRACT: 25 } },
  NUMERIC: { strength: 1, weights: { STATISTIC: 50, LOGIC: 30, MIND: 20 } },
};

/**
 * Evidence weight at which the text is trusted half as much as the prior.
 * Two solid keyword hits (strength 3 each) put confidence around 0.55 —
 * enough for a well-named Domain to steer away from its Field, not enough
 * for one incidental word to.
 */
const EVIDENCE_HALF_WEIGHT = 5;

/** A rule firing many times in one text is not proportionally more evidence. */
const MAX_HITS_COUNTED = 3;

export interface InferenceInput {
  /** Everything the level offers: a name, or a question plus answer plus tags. */
  text: string;
  /** The level above — a Domain's Field, an Idea's Domain. Omitted for a Field. */
  prior?: Composition;
  questionType?: QuestionType;
}

export interface InferenceResult {
  composition: Composition;
  /** 0..1 — how much the text drove the result versus the prior. */
  confidence: number;
  /** Which rules fired, for explaining the assignment in the UI. */
  matched: string[];
}

/** Even split across the four most general-purpose attributes. Used only when there is no evidence and no prior. */
const FALLBACK: Partial<Composition> = { MIND: 30, LOGIC: 25, REASON: 25, CRITICAL_THINKING: 20 };

export function inferComposition({ text, prior, questionType }: InferenceInput): InferenceResult {
  const evidence = emptyComposition();
  let totalStrength = 0;
  const matched: string[] = [];

  for (const rule of LEXICON) {
    const hits = text.match(new RegExp(rule.pattern.source, "gi"));
    if (!hits) continue;

    const counted = Math.min(hits.length, MAX_HITS_COUNTED);
    // Sub-linear in repeats: the second mention of "algorithm" says less
    // than the first, and the tenth says nothing at all.
    const weight = rule.strength * (1 + Math.log2(counted));
    totalStrength += weight;
    for (const a of ATTRIBUTES) {
      evidence[a] += (rule.weights[a] ?? 0) * weight;
    }
    matched.push(hits[0].toLowerCase());
  }

  if (questionType) {
    const signal = QUESTION_TYPE_SIGNAL[questionType];
    totalStrength += signal.strength;
    for (const a of ATTRIBUTES) {
      evidence[a] += (signal.weights[a] ?? 0) * signal.strength;
    }
  }

  const confidence = totalStrength / (totalStrength + EVIDENCE_HALF_WEIGHT);

  // No prior and no evidence: a Field named "Misc" has to become something.
  if (totalStrength === 0 && !prior) {
    return { composition: normaliseComposition({ ...emptyComposition(), ...FALLBACK }), confidence: 0, matched };
  }
  if (totalStrength === 0 && prior) {
    return { composition: normaliseComposition({ ...prior }), confidence: 0, matched };
  }

  const evidenceNorm = normaliseComposition(evidence);
  if (!prior) {
    return { composition: evidenceNorm, confidence, matched };
  }

  const blended = emptyComposition();
  for (const a of ATTRIBUTES) {
    blended[a] = evidenceNorm[a] * confidence + prior[a] * (1 - confidence);
  }
  return { composition: normaliseComposition(blended), confidence, matched };
}

/**
 * Folds one new observation into a running composition — how a Domain
 * absorbs each Idea filed into it.
 *
 * `observations` is the count *before* this one, so the pull of a single
 * new Idea shrinks as a Domain fills up: the tenth Idea moves it by a
 * tenth, the hundredth barely at all. That keeps a mature Domain stable
 * while still letting a genuinely new direction show up over time, and it
 * means no single submission can yank a Domain's identity sideways.
 */
export function blendObservation(
  current: Composition,
  observation: Composition,
  observations: number,
  /** Caps how fast a young Domain can swing on one Idea. */
  maxPull = 0.25
): Composition {
  const pull = Math.min(maxPull, 1 / Math.max(1, observations + 1));
  const out = emptyComposition();
  for (const a of ATTRIBUTES) {
    out[a] = current[a] * (1 - pull) + observation[a] * pull;
  }
  return normaliseComposition(out);
}

/**
 * A Field's *effective* composition: what its Domains actually turned out
 * to be about, weighted by how much work sits in each.
 *
 * The Field's own composition — inferred from its name, or hand-edited —
 * stays the anchor, because a Field with one lopsided Domain should not be
 * redefined by it. Domains outvote the name only once they carry real
 * points. This is what makes Domain and Idea attribution *matter*: without
 * it the whole substrate still rests on whatever you typed as a Field name.
 */
export function effectiveFieldComposition(
  fieldOwn: Composition,
  domains: { composition: Composition; totalPoints: number }[]
): Composition {
  const scored = domains.filter((d) => d.totalPoints > 0);
  if (scored.length === 0) return fieldOwn;

  const totalPoints = scored.reduce((sum, d) => sum + d.totalPoints, 0);
  const domainMix = emptyComposition();
  for (const d of scored) {
    const share = d.totalPoints / totalPoints;
    for (const a of ATTRIBUTES) domainMix[a] += d.composition[a] * share;
  }

  // The Field name keeps a floor of influence however much its Domains
  // accumulate — it is the one part of this a human chose deliberately.
  const FIELD_ANCHOR = 0.35;
  const out = emptyComposition();
  for (const a of ATTRIBUTES) {
    out[a] = fieldOwn[a] * FIELD_ANCHOR + domainMix[a] * (1 - FIELD_ANCHOR);
  }
  return normaliseComposition(out);
}

/** Highest-weighted attribute, for storing a single dominant label on an Idea. */
export function dominantOf(composition: Composition): Attribute | null {
  let best: Attribute = ATTRIBUTES[0];
  for (const a of ATTRIBUTES) {
    if (composition[a] > composition[best]) best = a;
  }
  return composition[best] > 0 ? best : null;
}

export { COMPOSITION_TOTAL };
