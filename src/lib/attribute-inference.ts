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
 * Homographs are handled inside the patterns with negative lookahead rather
 * than by a rule-level veto, because the ambiguity is local to the word and
 * not to the document: an idea can legitimately discuss covalent bonds and
 * bond yields in the same breath, and a veto would silently drop both.
 *
 * Measured misfires this exists to stop — every one of these was scoring
 * wrongly before:
 *
 *   "when do you use a capital letter"   scored as economics  (STATISTIC)
 *   "organic growth vs acquisition"      scored as chemistry
 *   "how many bytes does a character"    scored as language, and PHYSICAL
 *   "corporate bond yield to maturity"   scored as chemistry *and* finance
 *
 * The general rule applied below: a word with a common non-academic or
 * cross-domain sense either carries its qualifier in the pattern ("covalent
 * bond", "capital expenditure") or is excluded from the senses it does not
 * mean. Bare ambiguous tokens — "system", "sample", "reaction", "trade",
 * "fund", "composition" — are not worth a rule on their own at all.
 */

/**
 * Every rule that matches contributes — the whole point of moving off
 * first-match-wins. `strength` separates a term that names a discipline
 * outright ("thermodynamics") from one that merely leans ("system").
 */
const LEXICON: LexicalRule[] = [
  // ── Formal and quantitative ──────────────────────────────────────
  { pattern: /\b(mathematic\w*|algebra\w*|calculus|topolog\w*|geometr\w*|theorem|lemma|corollar\w*|integral|derivative|matri(x|ces)|eigen\w*|polynomial|factorial|logarithm)/i, strength: 3, weights: { LOGIC: 32, ABSTRACT: 30, REASON: 20, MIND: 18 } },
  { pattern: /\b(statistic\w*|probabilit\w*|bayes\w*|variance|covariance|regression|std ?dev\w*|standard deviation|percentile|quantile|correlat\w*|p-value|confidence interval|hypothesis test\w*|sampling)/i, strength: 3, weights: { STATISTIC: 42, REASON: 20, CRITICAL_THINKING: 20, LOGIC: 18 } },
  { pattern: /\b(econometric\w*|backtest\w*|expectancy|sharpe|drawdown|volatilit\w*|monte carlo|stochastic)/i, strength: 3, weights: { STATISTIC: 35, REASON: 25, CRITICAL_THINKING: 20, STUBBORNNESS: 20 } },
  { pattern: /\b(logic|deduct\w*|syllogis\w*|entail\w*|axiom\w*|tautolog\w*|predicate|quantifier)/i, strength: 2, weights: { LOGIC: 45, REASON: 30, ABSTRACT: 25 } },
  { pattern: /\b(proof|prove|proving)\b/i, strength: 2, weights: { LOGIC: 38, ABSTRACT: 28, REASON: 24, STUBBORNNESS: 10 } },

  // ── Natural science ──────────────────────────────────────────────
  { pattern: /\b(physic\w*|thermodynam\w*|quantum|relativit\w*|kinematic\w*|momentum|entropy|electromagnet\w*|newton\w*)/i, strength: 3, weights: { ABSTRACT: 30, LOGIC: 26, MIND: 24, STATISTIC: 20 } },
  // "bond" and "organic" carry their qualifier: bare forms mean finance and
  // marketing at least as often as they mean chemistry.
  { pattern: /\b(chemistr\w*|molecul\w*|stoichiometr\w*|electron|isotope|ph scale|titrat\w*|(covalent|ionic|hydrogen|chemical) bond|organic chem\w*|atomic \w+|periodic table)/i, strength: 3, weights: { MIND: 32, ABSTRACT: 24, LOGIC: 24, CRITICAL_THINKING: 20 } },
  { pattern: /\b(biolog\w*|cellular|mitochondri\w*|neuro\w*|anatom\w*|genetic\w*|genome|protein|enzyme|photosynthes\w*|evolution\w*|ecosystem|species)/i, strength: 3, weights: { MIND: 38, CRITICAL_THINKING: 22, ABSTRACT: 20, PHYSICAL: 20 } },
  { pattern: /\b(astronom\w*|astrophys\w*|galax\w*|nebula|supernova|orbit\w*|planet\w*|stellar|cosmolog\w*|red giant|black hole|light-?year)/i, strength: 3, weights: { ABSTRACT: 34, MIND: 26, LOGIC: 22, CRITICAL_THINKING: 18 } },
  { pattern: /\b(geograph\w*|geolog\w*|climat\w*|monsoon|tecton\w*|erosion|atmosphere|latitude|longitude|meteorolog\w*|weather|glacier)/i, strength: 3, weights: { MIND: 32, CRITICAL_THINKING: 24, ABSTRACT: 22, STATISTIC: 20 } },

  // ── Computation ──────────────────────────────────────────────────
  { pattern: /\b(algorithm\w*|data structure|hash ?(map|table|set)|linked list|binary (tree|search)|graph traversal|sort\w* algorithm|big-?o|complexity class|recursion|dynamic programming|heap|trie|linear probing)/i, strength: 3, weights: { LOGIC: 36, ABSTRACT: 28, STUBBORNNESS: 20, CREATIVITY: 16 } },
  // "comput" is anchored to its noun forms: as a bare stem it fires on the
  // ordinary verb, so "compute the yield to maturity" scored as computer
  // science and diluted a finance card.
  { pattern: /\b(computer|computing|computation\w*|software|programm\w*|compiler|runtime|typescript|javascript|python|rust\b|golang|function signature|variable scope|pointer|garbage collect\w*|utf-?8|byte\w*)/i, strength: 3, weights: { LOGIC: 34, ABSTRACT: 26, CREATIVITY: 20, STUBBORNNESS: 20 } },
  { pattern: /\b(database|sql\b|query plan|index\w* scan|normali[sz]ation|transaction|acid\b|schema|primary key|foreign key|migration)/i, strength: 3, weights: { LOGIC: 32, ABSTRACT: 26, CRITICAL_THINKING: 22, STUBBORNNESS: 20 } },
  { pattern: /\b(machine learning|neural net\w*|deep learning|gradient descent|overfit\w*|dropout|training set|embedding|transformer|classifier|loss function|backprop\w*)/i, strength: 3, weights: { STATISTIC: 34, ABSTRACT: 26, LOGIC: 24, CRITICAL_THINKING: 18 } },
  { pattern: /\b(security|cryptograph\w*|encrypt\w*|authenticat\w*|vulnerab\w*|exploit|injection|xss\b|csrf|hashing|tls\b|threat model)/i, strength: 3, weights: { CRITICAL_THINKING: 32, LOGIC: 26, REBUTTAL: 22, STUBBORNNESS: 20 } },
  // Bare "network" is deliberately absent: it collided with "neural network"
  // and pulled machine-learning cards toward distributed systems.
  { pattern: /\b(networking|network protocol|packet|ethernet|dns\b|ip address|subnet|firewall|protocol|tcp\b|http\w*|latency|bandwidth|distributed system|load balanc\w*|cache invalidat\w*|concurren\w*|deadlock)/i, strength: 3, weights: { LOGIC: 30, ABSTRACT: 26, CRITICAL_THINKING: 24, STUBBORNNESS: 20 } },
  { pattern: /\b(engineer\w*|architectur\w*|optimi[sz]\w*|debug\w*|refactor\w*|circuit|voltage|torque|tolerance|blueprint)/i, strength: 2, weights: { LOGIC: 28, STUBBORNNESS: 26, ABSTRACT: 24, CREATIVITY: 22 } },

  // ── Argument, law, philosophy ────────────────────────────────────
  { pattern: /\b(philosoph\w*|ethic\w*|metaphysic\w*|epistem\w*|ontolog\w*|utilitarian\w*|deontolog\w*|existential\w*)/i, strength: 3, weights: { REASON: 30, ABSTRACT: 26, CRITICAL_THINKING: 24, REBUTTAL: 20 } },
  { pattern: /\b(rhetoric\w*|argument\w*|debate|rebut\w*|counter-?argument|fallac\w*|refut\w*|steel ?man|straw ?man|objection)/i, strength: 3, weights: { REBUTTAL: 40, CRITICAL_THINKING: 28, REASON: 20, LOGIC: 12 } },
  { pattern: /\b(jurisprud\w*|statut\w*|legal|litigation|tort|plaintiff|defendant|precedent|contract law|invitation to treat|liabilit\w*|court)/i, strength: 3, weights: { REASON: 28, REBUTTAL: 26, CRITICAL_THINKING: 26, MIND: 20 } },

  // ── Society ──────────────────────────────────────────────────────
  { pattern: /\b(histor\w*|civili[sz]\w*|dynast\w*|empire|revolution|medieval|antiquit\w*|bronze age|renaissance|colonial\w*)/i, strength: 2, weights: { CRITICAL_THINKING: 30, REASON: 26, MIND: 24, STATISTIC: 20 } },
  { pattern: /\b(politic\w*|governance|democra\w*|parliament\w*|constitution\w*|electoral|proportional representation|first-?past-?the-?post|gerrymander\w*|referend\w*|legislat\w*|policy|diplomac\w*|sovereign\w*)/i, strength: 2, weights: { CRITICAL_THINKING: 30, REASON: 28, REBUTTAL: 22, MIND: 20 } },
  { pattern: /\b(sociolog\w*|anthropolog\w*|demograph\w*|social norm|culture|ethnograph\w*|inequalit\w*)/i, strength: 2, weights: { CRITICAL_THINKING: 28, COMPASSION: 24, REASON: 24, STATISTIC: 20 } },

  // ── Money ────────────────────────────────────────────────────────
  // "capital" excluded from its letter/city/punishment senses.
  { pattern: /\b(econom\w*|inflation|monetary|fiscal|gdp\b|supply and demand|elasticit\w*|opportunity cost|capital (expenditure|allocation|structure)|macro\w*|microeconom\w*)/i, strength: 3, weights: { STATISTIC: 30, REASON: 28, CRITICAL_THINKING: 24, ABSTRACT: 18 } },
  { pattern: /\b(trading|investor|investing|investment|portfolio|equit(y|ies)|securit(y|ies) market|yield to maturity|coupon rate|corporate bond|hedge|derivative\w* market|arbitrage|liquidit\w*)/i, strength: 3, weights: { STATISTIC: 30, REASON: 26, SELF_RESPECT: 22, STUBBORNNESS: 22 } },
  { pattern: /\b(account\w*|balance sheet|income statement|cash flow|ledger|depreciat\w*|amorti[sz]\w*|accrual|debit|credit entry|audit\w*)/i, strength: 3, weights: { STATISTIC: 32, LOGIC: 26, CRITICAL_THINKING: 22, STUBBORNNESS: 20 } },
  { pattern: /\b(marketing|brand\w*|customer acquisition|lifetime value|conversion rate|segment\w*|positioning|campaign|funnel|churn|organic (growth|traffic|reach))/i, strength: 3, weights: { CREATIVITY: 28, CRITICAL_THINKING: 26, STATISTIC: 24, REASON: 20 } },
  { pattern: /\b(management|leadership|strateg\w*|stakeholder|negotiat\w*|delegat\w*|operations|logistics|procurement|kpi\b)/i, strength: 2, weights: { REASON: 26, CRITICAL_THINKING: 24, COMPASSION: 22, SELF_RESPECT: 20 } },
  // "finance", "business" and "commerce" were missing entirely, so a Field
  // literally named "Business & Finance" inferred nothing and was stored as
  // the generic fallback — indistinguishable from every other unmatched name.
  { pattern: /\b(financ\w*|business|commerc\w*|entrepreneur\w*|revenue|profit|pricing|valuation|budget\w*)/i, strength: 3, weights: { STATISTIC: 28, REASON: 26, CRITICAL_THINKING: 22, STUBBORNNESS: 20 } },

  // ── Craft and expression ─────────────────────────────────────────
  { pattern: /\b(painting|sculpt\w*|drawing|illustrat\w*|typograph\w*|colour theory|color theory|visual design|composition of (the )?(image|frame)|aesthetic\w*)/i, strength: 3, weights: { CREATIVITY: 42, ABSTRACT: 24, MIND: 18, SELF_RESPECT: 16 } },
  { pattern: /\b(music\w*|harmon(y|ic)\w*|chord|tritone|cadence|counterpoint|melod\w*|rhythm|timbre|scale degree|key signature)/i, strength: 3, weights: { CREATIVITY: 38, ABSTRACT: 26, MIND: 20, PHYSICAL: 16 } },
  { pattern: /\b(film|cinema\w*|cinematograph\w*|photograph\w*|framing|montage|shot composition|exposure|aperture)/i, strength: 3, weights: { CREATIVITY: 38, ABSTRACT: 24, CRITICAL_THINKING: 20, MIND: 18 } },
  { pattern: /\b(literatur\w*|poetr\w*|poem|narrativ\w*|protagonist|metaphor|prose style|novel\b|fiction)/i, strength: 3, weights: { CREATIVITY: 36, ABSTRACT: 24, COMPASSION: 20, MIND: 20 } },
  { pattern: /\b(writing|essay|paragraph|draft\w*|editing|rewrite|thesis statement|outline)/i, strength: 2, weights: { CREATIVITY: 34, ABSTRACT: 22, CRITICAL_THINKING: 22, MIND: 22 } },
  // "character" only in its writing-system sense; the CS rule owns bytes.
  { pattern: /\b(languag\w*|vocabular\w*|grammar|linguist\w*|conjugat\w*|declension|kanji|hanzi|hiragana|katakana|pronunciation|idiom|tense\b|capital letter)/i, strength: 3, weights: { MIND: 42, STUBBORNNESS: 26, CREATIVITY: 16, CRITICAL_THINKING: 16 } },

  // ── Body, care, self ─────────────────────────────────────────────
  { pattern: /\b(fitness|hypertroph\w*|sport|athlet\w*|strength training|endurance|exercise|progressive overload|cardio|mobilit\w*|repetition range)/i, strength: 3, weights: { PHYSICAL: 46, STUBBORNNESS: 24, SELF_RESPECT: 20, FAITH: 10 } },
  { pattern: /\b(nutrition|macronutrient|protein intake|calorie|vitamin|diet\w*|cooking|baking|ferment\w*|gluten|dough|sear\w*|emulsif\w*)/i, strength: 3, weights: { PHYSICAL: 32, MIND: 26, CRITICAL_THINKING: 22, CREATIVITY: 20 } },
  { pattern: /\b(medic\w*|clinic\w*|nurs\w*|patient|diagnos\w*|symptom|patholog\w*|pharmacolog\w*|dosage|radiograph\w*|prognosis)/i, strength: 3, weights: { MIND: 30, COMPASSION: 26, CRITICAL_THINKING: 24, PHYSICAL: 20 } },
  { pattern: /\b(psycholog\w*|therap\w*|counsel\w*|empath\w*|grief|trauma|attachment style|cognitive behav\w*|depress\w*|anxiet\w*)/i, strength: 3, weights: { COMPASSION: 38, SELF_RESPECT: 22, CRITICAL_THINKING: 20, REASON: 20 } },
  { pattern: /\b(disciplin\w*|habit\w*|routine|consisten\w*|persever\w*|resilien\w*|willpower|procrastinat\w*|accountab\w*|conditioning|peak performance|productivit\w*)/i, strength: 3, weights: { STUBBORNNESS: 36, SELF_RESPECT: 26, FAITH: 22, PHYSICAL: 16 } },
  { pattern: /\b(cognitio\w*|cognitive|attention|focus\b|concentrat\w*|flow state|self-?improvement|personal development|skill acquisition)/i, strength: 2, weights: { MIND: 34, CRITICAL_THINKING: 24, SELF_RESPECT: 22, STUBBORNNESS: 20 } },
  { pattern: /\b(mindful\w*|meditat\w*|patience|emotional regulat\w*|self-?compassion|breathwork|equanimit\w*)/i, strength: 2, weights: { COMPASSION: 30, SELF_RESPECT: 28, FAITH: 24, REASON: 18 } },
  { pattern: /\b(theolog\w*|religio\w*|spiritual\w*|scriptur\w*|faith\b|prayer|doctrin\w*|liturg\w*|monastic)/i, strength: 3, weights: { FAITH: 44, COMPASSION: 20, ABSTRACT: 20, SELF_RESPECT: 16 } },

  // ── Study craft and epistemics ───────────────────────────────────
  { pattern: /\b(memori[sz]\w*|memory|recall|retention|forgetting curve|mnemonic|spaced repetition|encoding specificity|interleav\w*)/i, strength: 3, weights: { MIND: 46, STUBBORNNESS: 22, FAITH: 18, PHYSICAL: 14 } },
  { pattern: /\b(pedagog\w*|teaching|curricul\w*|assessment|feedback loop|deliberate practice|scaffold\w*)/i, strength: 2, weights: { MIND: 28, COMPASSION: 24, CRITICAL_THINKING: 24, REASON: 24 } },
  { pattern: /\b(risk|uncertaint\w*|bias\b|assumption|premise|evidence|falsifiab\w*|confounder|base rate|causal\w*)/i, strength: 2, weights: { CRITICAL_THINKING: 34, REASON: 28, STATISTIC: 24, REBUTTAL: 14 } },
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
  if (domains.length === 0) return fieldOwn;

  const scored = domains.filter((d) => d.totalPoints > 0);

  /**
   * Points weight the mix, but their absence no longer discards it.
   *
   * Previously any Domain with zero points was filtered out, so a Field with
   * a dozen well-named Domains and no reviews yet fell back to whatever its
   * own name happened to infer. That is exactly backwards at the moment it
   * matters most — a fresh account, or one just reset, has all the structural
   * evidence and none of the points, and it was throwing the evidence away.
   *
   * With no points anywhere, Domains contribute equally; otherwise the
   * points-weighted mix stands, unchanged.
   */
  const contributing = scored.length > 0 ? scored : domains;
  const totalWeight =
    scored.length > 0 ? scored.reduce((sum, d) => sum + d.totalPoints, 0) : contributing.length;

  const domainMix = emptyComposition();
  for (const d of contributing) {
    const share = (scored.length > 0 ? d.totalPoints : 1) / totalWeight;
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
