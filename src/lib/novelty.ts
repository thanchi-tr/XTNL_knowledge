import type { QuestionType } from "@prisma/client";
import { compareTwoStrings } from "string-similarity";
import {
  decodeListQuestion,
  decodeOrderQuestion,
  decodeNumericQuestion,
  decodeStringArray,
  decodeNumericAnswer,
} from "./idea-payload";
import { SIMILARITY_MERGE_MIN } from "./xp";

/**
 * Is this idea new, or do I already have it — and if I have it, in what way?
 *
 * Cosine similarity alone answered the first half and could not answer the
 * second. It measures *topic*, and two cards on one topic can be anything to
 * each other: the same fact reworded, the same question with a different
 * answer, the same sentence with a "not" in it, or the same template about a
 * different subject. Those look alike to an embedding and need opposite
 * treatment:
 *
 *   "How tall is Everest?" 8849 m  vs  8848 m      — cosine ~0.99. Was
 *        auto-merged, silently discarding what may be the correction.
 *   "Atomic number of carbon?" 6  vs  oxygen? 8    — cosine ~0.9. Was blocked
 *        as a near duplicate, though it is plainly a second fact.
 *   "Light is a wave"  vs  "Light is not a wave"   — cosine ~0.95. Reported
 *        as "95% similar", which is the least useful true thing to say.
 *
 * So the verdict is now decided on two kinds of evidence. The embedding still
 * says how close two cards are in meaning; a cheap lexical reading of both
 * says *how* they differ — which words each has that the other lacks, whether
 * the answers agree, whether the figures match, whether one negates the
 * other. Every rule below is a combination of those, and every verdict
 * carries the evidence it was reached on, so the Add form can say what it
 * found rather than quote a percentage.
 *
 * Pure and synchronous: no database, no model. dedup.ts fetches the
 * neighbours and hands them here; scripts/novelty-check.ts runs it on fixed
 * cases without either.
 */

// ── Cards as text ────────────────────────────────────────────

/** A card reduced to what it asks and what it answers, as plain text. */
export interface CardText {
  type: QuestionType;
  prompt: string;
  answer: string;
  /** ORDER only: the true sequence, since the same items in another order are a different answer. */
  sequence?: string[];
}

/** Decodes a stored (encoded) question/answer pair into plain prompt and answer text. */
export function cardTextFromStored(type: QuestionType, question: string, answer: string): CardText {
  switch (type) {
    case "SHORT":
    case "FORMULA":
      return { type, prompt: question, answer };
    case "MULTI": {
      let options: string[] = [];
      try {
        options = JSON.parse(question);
      } catch {
        options = [question];
      }
      // Sorted: the same options offered in another order are the same card.
      return { type, prompt: [...options].sort().join(" / "), answer };
    }
    case "DIAGRAM": {
      let labels: Record<string, string> = {};
      try {
        labels = JSON.parse(answer);
      } catch {
        // malformed: compare on nothing rather than on JSON punctuation
      }
      return { type, prompt: "", answer: Object.values(labels).join(", ") };
    }
    case "CLOZE":
      // The numbered blanks are markup, not words.
      return { type, prompt: question.replace(/\[\d+\]/g, "___"), answer: decodeStringArray(answer).join(", ") };
    case "LIST":
      return { type, prompt: decodeListQuestion(question).prompt, answer: decodeStringArray(answer).join(", ") };
    case "ORDER": {
      const sequence = decodeStringArray(answer);
      return { type, prompt: decodeOrderQuestion(question).prompt, answer: sequence.join(" -> "), sequence };
    }
    case "NUMERIC": {
      const q = decodeNumericQuestion(question);
      const a = decodeNumericAnswer(answer);
      return { type, prompt: q.prompt, answer: `${a.value}${q.unit ? ` ${q.unit}` : ""}` };
    }
  }
}

// ── Reading text ─────────────────────────────────────────────

/**
 * Function words, dropped before comparing. Deliberately excludes every
 * negator: "not" is the one small word whose presence reverses a claim.
 */
const STOP = new Set(
  (
    "a an the of in on at to for from by with and or but is are was were be been being am do does did has have had " +
    "what which who whom whose when where why how that this these those it its as into than then there their they them " +
    "he she his her we our you your i me my can could would should will shall may might must about also any some such so " +
    "if each every all both more most other only own same very just over under between through during before after above " +
    "below up down out off again further once here called known named following give name list state explain describe " +
    "define definition true correct answer question refer refers mean means meaning term example e g ie eg etc because since"
  ).split(" ")
);

const NEGATORS = new Set(
  "not no never none nobody nothing neither nor cannot cant dont doesnt didnt isnt arent wasnt werent wont wouldnt shouldnt couldnt without lacks lack absent".split(
    " "
  )
);

/** Lower case, accents off, contractions closed ("don't" → "dont"), thousands separators out, punctuation to spaces. */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
    .replace(/['’`]/g, "")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/[^\p{L}\p{N}.\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A light, symmetric stemmer: plural and tense endings only. It does not
 * need to be linguistically right, only consistent — both sides of every
 * comparison go through it, so "boils"/"boiling"/"boiled" meet at "boil".
 */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(ss|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  return w;
}

const NUMBER = /^-?\d+(\.\d+)?(e-?\d+)?$/;

interface Reading {
  norm: string;
  /** Content words, stemmed, stop words and numbers removed. */
  terms: Set<string>;
  /** The same words in the order written, for spelling out acronyms. */
  seq: string[];
  numbers: number[];
  /** How many negators it carries: an odd count reads as a denial. */
  negations: number;
}

const aligned = (r: Reading, to: Reading): Reading => ({ ...r, terms: align(r.terms, to.terms) });

/**
 * Collapses the words in `r` that spell out an acronym `other` uses —
 * "system quality number" becomes "sqn" when the other card says SQN — so
 * a card and its abbreviated twin are compared on the same terms. Words the
 * other card also has are kept.
 */
function fold(r: Reading, other: Reading): Reading {
  let terms: Set<string> | null = null;
  for (const t of other.terms) {
    // Also when `r` has the acronym already ("the System Quality Number … SQN ="): the spelt-out words are the same term again.
    if (t.length < 2 || t.length > 6 || !/^[a-z]+$/.test(t)) continue;
    for (let i = 0; i + t.length <= r.seq.length; i++) {
      const run = r.seq.slice(i, i + t.length);
      if (run.map((w) => w[0]).join("") !== t) continue;
      terms ??= new Set(r.terms);
      terms.add(t);
      for (const w of run) if (!other.terms.has(w)) terms.delete(w);
      break;
    }
  }
  return terms ? { ...r, terms } : r;
}

function read(text: string): Reading {
  const norm = normalise(text);
  const terms = new Set<string>();
  const seq: string[] = [];
  const numbers: number[] = [];
  let negations = 0;
  for (const tok of norm.split(" ")) {
    if (!tok) continue;
    if (NUMBER.test(tok)) {
      numbers.push(Number(tok));
      continue;
    }
    if (NEGATORS.has(tok)) {
      negations++;
      continue;
    }
    if (STOP.has(tok) || tok.length < 2) continue;
    const t = stem(tok);
    // "gives", "named", "describes": function words once their endings are off.
    if (STOP.has(t)) continue;
    terms.add(t);
    seq.push(t);
  }
  numbers.sort((a, b) => a - b);
  return { norm, terms, seq, numbers, negations };
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size && !b.size) return 1;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / (a.size + b.size - n);
};

/** Share of `a`'s terms that also appear in `b`. */
const within = (a: Set<string>, b: Set<string>) => {
  if (!a.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / a.size;
};

const only = (a: Set<string>, b: Set<string>) => [...a].filter((t) => !b.has(t));

/** Edit distance, stopping early once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The candidate's words, with each misspelling of a word the other card
 * has replaced by that word — "Canbera" meets "Canberra". Short words are
 * left alone: at four letters one edit is often a different word.
 */
function align(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of a) {
    if (b.has(t) || t.length < 5) {
      out.add(t);
      continue;
    }
    const max = t.length >= 8 ? 2 : 1;
    let hit: string | undefined;
    for (const u of b) {
      if (u.length >= 5 && editDistance(t, u, max) <= max) {
        hit = u;
        break;
      }
    }
    out.add(hit ?? t);
  }
  return out;
}

function sameNumbers(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => Math.abs(x - b[i]) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(b[i])));
}

// ── Comparing two cards ──────────────────────────────────────

/** How two answers stand to each other. */
export type AnswerRelation = "same" | "contains" | "partial" | "differ" | "none";

export interface PairSignals {
  /** Embedding cosine, from pgvector. */
  cosine: number;
  /** Shared content words over all content words, whole card (Jaccard). */
  words: number;
  /** Character-level likeness of the whole card (Dice on bigrams): catches typos the word test misses. */
  surface: number;
  /** Share of the candidate's words the existing card already has, and the reverse. */
  candidateInMatch: number;
  matchInCandidate: number;
  /** How alike the two prompts are: the better of word overlap and containment. */
  prompt: number;
  answer: AnswerRelation;
  /** Figures anywhere on the cards: equal, different, or not on both. */
  numbers: "same" | "differ" | "none";
  /** One card denies what the other asserts. */
  polarity: boolean;
  sameFormat: boolean;
  /** Words only one side has — what the label shows as the difference. */
  onlyCandidate: string[];
  onlyMatch: string[];
  /**
   * New words where each card keeps its detail (the answer; a cloze's
   * sentence). What "adds detail" and "already covered" are judged on, so a
   * reworded prompt's filler ("what makes… appear") does not count as more.
   */
  addsCandidate: number;
  addsMatch: number;
  shared: string[];
  candidateNumbers: number[];
  matchNumbers: number[];
}

function answerRelation(c: CardText, m: CardText, rc: Reading, rm: Reading): AnswerRelation {
  if (!rc.norm || !rm.norm) return "none";
  if (rc.norm === rm.norm) {
    // The same items in another order are a different answer to an ORDER card.
    if (c.sequence && m.sequence && c.sequence.map(normalise).join("|") !== m.sequence.map(normalise).join("|")) return "differ";
    return "same";
  }
  if (rc.numbers.length && rm.numbers.length && !sameNumbers(rc.numbers, rm.numbers)) return "differ";
  if (c.sequence && m.sequence && jaccard(rc.terms, rm.terms) === 1) {
    return c.sequence.map(normalise).join("|") === m.sequence.map(normalise).join("|") ? "same" : "differ";
  }
  const j = jaccard(rc.terms, rm.terms);
  if (j >= 0.6) return "same";
  const small = rc.terms.size <= rm.terms.size ? rc.terms : rm.terms;
  const large = small === rc.terms ? rm.terms : rc.terms;
  if (small.size > 0 && within(small, large) >= 0.8) return "contains";
  if (j <= 0.2) {
    // One word apart by a letter or two is a typo, not a second answer.
    return compareTwoStrings(rc.norm, rm.norm) >= 0.8 ? "same" : "differ";
  }
  return "partial";
}

export function compareCards(c: CardText, m: CardText, cosine: number): PairSignals {
  const whole = (x: CardText) => `${x.prompt}\n${x.answer}`;
  // Typos folded toward the existing card's spelling, and acronyms both ways.
  const both = (cx: Reading, mx: Reading): [Reading, Reading] => {
    const c1 = fold(aligned(cx, mx), mx);
    return [c1, fold(mx, c1)];
  };
  const [wc, wm] = both(read(whole(c)), read(whole(m)));
  const [pc, pm] = both(read(c.prompt), read(m.prompt));
  const [ac, am] = both(read(c.answer), read(m.answer));
  // Where a card keeps its detail: a cloze in its sentence, everything else in its answer.
  const detail = (x: CardText, w: Reading, a: Reading) => (x.type === "CLOZE" || !a.terms.size ? w.terms : a.terms);
  const dc = detail(c, wc, ac);
  const dm = detail(m, wm, am);

  const smallP = pc.terms.size <= pm.terms.size ? pc.terms : pm.terms;
  const largeP = smallP === pc.terms ? pm.terms : pc.terms;
  const prompt =
    pc.norm && pc.norm === pm.norm
      ? 1
      : smallP.size >= 2
        ? Math.max(jaccard(pc.terms, pm.terms), within(smallP, largeP))
        : jaccard(pc.terms, pm.terms) * (smallP.size ? 1 : 0);

  return {
    cosine,
    words: jaccard(wc.terms, wm.terms),
    surface: compareTwoStrings(wc.norm, wm.norm),
    candidateInMatch: within(wc.terms, wm.terms),
    matchInCandidate: within(wm.terms, wc.terms),
    prompt,
    answer: answerRelation(c, m, ac, am),
    numbers: !wc.numbers.length || !wm.numbers.length ? "none" : sameNumbers(wc.numbers, wm.numbers) ? "same" : "differ",
    polarity: wc.negations % 2 !== wm.negations % 2,
    sameFormat: c.type === m.type,
    onlyCandidate: only(wc.terms, wm.terms),
    onlyMatch: only(wm.terms, wc.terms),
    addsCandidate: [...dc].filter((t) => !wm.terms.has(t)).length,
    addsMatch: [...dm].filter((t) => !wc.terms.has(t)).length,
    shared: [...wc.terms].filter((t) => wm.terms.has(t)),
    candidateNumbers: wc.numbers,
    matchNumbers: wm.numbers,
  };
}

// ── Relations ────────────────────────────────────────────────

/**
 * What an existing card is to the candidate, most serious first. The first
 * three decide the action: IDENTICAL merges; the seven between it and
 * SIBLING stop for the user; the last three create.
 */
export type Relation =
  | "IDENTICAL"
  | "CONFLICT"
  | "OPPOSITE"
  | "REWORDED"
  | "COVERED"
  | "EXTENDS"
  | "REFORMATTED"
  | "CLOSE"
  | "SIBLING"
  | "RELATED"
  | "DISTINCT";

export type RelationAction = "MERGE_EXACT" | "SATURATION" | "CREATE_NEW_NODE";

/** What the user is steered towards. `discard` means: nothing to add, keep the existing card. */
export type Suggestion = "merge" | "enrich" | "link" | "discard" | "create";

export const RELATION_META: Record<
  Relation,
  { label: string; action: RelationAction; suggest: Suggestion; severity: number; tone: "same" | "warn" | "near" | "new" }
> = {
  IDENTICAL: { label: "Already known", action: "MERGE_EXACT", suggest: "merge", severity: 10, tone: "same" },
  CONFLICT: { label: "Conflicting answer", action: "SATURATION", suggest: "link", severity: 9, tone: "warn" },
  OPPOSITE: { label: "Opposite claim", action: "SATURATION", suggest: "link", severity: 8, tone: "warn" },
  REWORDED: { label: "Reworded duplicate", action: "SATURATION", suggest: "discard", severity: 7, tone: "near" },
  COVERED: { label: "Already covered", action: "SATURATION", suggest: "discard", severity: 6, tone: "near" },
  EXTENDS: { label: "Adds detail", action: "SATURATION", suggest: "enrich", severity: 5, tone: "near" },
  REFORMATTED: { label: "Same fact, new format", action: "SATURATION", suggest: "link", severity: 4, tone: "near" },
  CLOSE: { label: "Near duplicate", action: "SATURATION", suggest: "enrich", severity: 3, tone: "near" },
  SIBLING: { label: "Sibling fact", action: "CREATE_NEW_NODE", suggest: "create", severity: 2, tone: "new" },
  RELATED: { label: "New angle", action: "CREATE_NEW_NODE", suggest: "create", severity: 1, tone: "new" },
  DISTINCT: { label: "New ground", action: "CREATE_NEW_NODE", suggest: "create", severity: 0, tone: "new" },
};

/** The cosine bands, passed in so the DEDUP_PRECISION skill's shift on the merge line still applies. */
export interface Bands {
  merge: number;
  saturation: number;
  related: number;
}

/**
 * Lexical lines. Measured on content words after stop words are dropped,
 * so they are stricter than they look: "capital of France" and "France's
 * capital city" share two words of three.
 */
const SAME_PROMPT = 0.75;
const SAME_WORDS = 0.75;
const MERGE_WORDS = 0.6;
/** A card must bring at least this many words the other lacks to count as adding or missing something. */
const EXTRA_WORDS = 2;
const CONTAINED = 0.85;

/**
 * The rule table. Order matters: the specific, dangerous cases (a figure
 * changed, a "not" inserted) are tested before the general closeness bands,
 * because those are exactly the cases the bands get wrong.
 */
export function relate(sig: PairSignals, bands: Bands, exact: boolean): Relation {
  const { cosine: cos, answer } = sig;
  const answersDiffer = answer === "differ" || (sig.numbers === "differ" && answer !== "same");
  const agree = answer === "same" || answer === "contains" || (answer === "none" && sig.numbers !== "differ");
  const extraC = sig.addsCandidate;
  const extraM = sig.addsMatch;
  // DEDUP_PRECISION raises the merge line; the word-for-word path tightens with it.
  const lift = Math.max(0, bands.merge - SIMILARITY_MERGE_MIN);

  if (exact && sig.sameFormat) return "IDENTICAL";

  // Same question, a different answer: a correction, a second answer, or a mistake — never silently one of them.
  if (sig.prompt >= SAME_PROMPT && answersDiffer && cos >= 0.75) return "CONFLICT";
  // The same statement with a denial in it.
  if (sig.polarity && sig.words >= 0.6 && cos >= 0.75) return "OPPOSITE";

  const clean = agree && !sig.polarity && sig.numbers !== "differ";
  if (clean && sig.sameFormat && sig.words >= MERGE_WORDS && cos >= bands.merge) return "IDENTICAL";
  // Word for word the same card (punctuation, word order, "the") even where the embedding wobbles.
  if (clean && sig.sameFormat && answer === "same" && sig.words >= Math.min(1, 0.9 + 5 * lift) && cos >= bands.merge - 0.06) return "IDENTICAL";

  if (clean && (cos >= 0.9 || (sig.words >= SAME_WORDS && cos >= 0.75))) {
    if (sig.matchInCandidate >= CONTAINED && extraC >= EXTRA_WORDS) return "EXTENDS";
    if (sig.candidateInMatch >= CONTAINED && extraM >= EXTRA_WORDS) return "COVERED";
    return sig.sameFormat ? "REWORDED" : "REFORMATTED";
  }

  if (cos > bands.saturation) {
    // One template, another subject: both sides name something the other does not, and the answers part.
    if (answersDiffer && sig.onlyCandidate.length >= 1 && sig.onlyMatch.length >= 1) return "SIBLING";
    if (sig.matchInCandidate >= CONTAINED && extraC >= EXTRA_WORDS && !answersDiffer) return "EXTENDS";
    if (sig.candidateInMatch >= CONTAINED && extraM >= EXTRA_WORDS && !answersDiffer) return "COVERED";
    return "CLOSE";
  }

  return cos >= bands.related ? "RELATED" : "DISTINCT";
}

/**
 * How likely two cards are the same idea, 0–1. For display and ranking
 * only — the relation decides the action. Cosine is rescaled over the range
 * this embedding model actually produces (its floor is ~0.52; see xp.ts).
 */
export function sameness(sig: PairSignals): number {
  const cosN = Math.max(0, Math.min(1, (sig.cosine - 0.6) / 0.4));
  let s = 0.55 * cosN + 0.3 * sig.words + 0.15 * sig.surface;
  if (sig.answer === "differ" || sig.numbers === "differ" || sig.polarity) s *= 0.8;
  return Math.max(0, Math.min(1, s));
}

// ── Verdicts ─────────────────────────────────────────────────

export interface Neighbour {
  id: string;
  title: string | null;
  similarity: number;
  card: CardText;
  /** Where it lives, for the label ("in Thermodynamics"). */
  domainName?: string | null;
  fieldName?: string | null;
}

export interface NoveltyMatch {
  id: string;
  title: string | null;
  similarity: number;
  relation: Relation;
  label: string;
  /** Its prompt and answer, shortened, so the user can compare without leaving the form. */
  prompt: string;
  answer: string;
  domainName: string | null;
  fieldName: string | null;
}

export interface NoveltyVerdict {
  relation: Relation;
  action: RelationAction;
  label: string;
  /** One sentence: what was found, in words. */
  summary: string;
  suggest: Suggestion;
  /** The facts behind it, one short line each. */
  evidence: string[];
  /** 0–1, for the chosen relation: how sure (merge / stop) or how new (create). */
  confidence: number;
  /** The card the verdict is about; null when nothing is close enough to name. */
  match: NoveltyMatch | null;
  /** Other cards worth knowing about: a second conflict, a copy in another Field. */
  also: NoveltyMatch[];
  /** Neighbours past the N_similar line: how crowded the topic already is. */
  crowd: number;
  signals: PairSignals | null;
  /** The submission as read, shortened the same way as the match, for the side-by-side. */
  candidate: { prompt: string; answer: string };
}

const clip = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const quote = (n: Neighbour) => `“${clip(n.title ?? n.card.prompt ?? n.id, 60)}”`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const words = (ws: string[], n = 4) => ws.slice(0, n).join(", ") + (ws.length > n ? ` +${ws.length - n}` : "");
const figures = (xs: number[]) => xs.slice(0, 3).map((x) => String(x)).join(", ");

function matchOf(n: Neighbour, relation: Relation): NoveltyMatch {
  return {
    id: n.id,
    title: n.title,
    similarity: n.similarity,
    relation,
    label: RELATION_META[relation].label,
    prompt: clip(n.card.prompt),
    answer: clip(n.card.answer),
    domainName: n.domainName ?? null,
    fieldName: n.fieldName ?? null,
  };
}

function summaryFor(rel: Relation, n: Neighbour, sig: PairSignals): string {
  const q = quote(n);
  switch (rel) {
    case "IDENTICAL":
      return `The same card as ${q}: same question, same answer.`;
    case "CONFLICT":
      return sig.numbers === "differ" && sig.candidateNumbers.length && sig.matchNumbers.length
        ? `Asks what ${q} asks, but with a different figure (${figures(sig.candidateNumbers)} here, ${figures(sig.matchNumbers)} there). Is this a correction?`
        : `Asks what ${q} asks, but answers it differently. A correction, or a second answer?`;
    case "OPPOSITE":
      return `Says the opposite of ${q}: one of them denies what the other claims.`;
    case "REWORDED":
      return `${q} already says this, with the same answer, in other words.`;
    case "COVERED":
      return `Everything here is already in ${q}, which says more.`;
    case "EXTENDS":
      return `Says everything ${q} does, and adds ${words(sig.onlyCandidate)}.`;
    case "REFORMATTED":
      return `The fact behind ${q}, drilled as a ${n.card.type.toLowerCase()} card there and a different format here.`;
    case "CLOSE":
      return `Very close in meaning to ${q}, though worded too differently to call on words alone.`;
    case "SIBLING":
      return `Follows the pattern of ${q}, about something else (${words(sig.onlyCandidate, 3)} rather than ${words(sig.onlyMatch, 3)}).`;
    case "RELATED":
      return `A new idea on a topic you already study: nearest is ${q}.`;
    case "DISTINCT":
      return `Nothing you have is close — the nearest, ${q}, is on other ground.`;
  }
}

function evidenceFor(sig: PairSignals): string[] {
  const out = [`meaning ${pct(sig.cosine)}`, `words ${pct(sig.words)} shared`];
  if (sig.prompt >= SAME_PROMPT) out.push("asks the same question");
  out.push(
    sig.answer === "same"
      ? "answers agree"
      : sig.answer === "contains"
        ? "one answer contains the other"
        : sig.answer === "differ"
          ? "answers differ"
          : sig.answer === "partial"
            ? "answers overlap in part"
            : "no answer to compare"
  );
  if (sig.numbers === "differ") out.push(`figures differ: ${figures(sig.candidateNumbers)} vs ${figures(sig.matchNumbers)}`);
  if (sig.numbers === "same") out.push("same figures");
  if (sig.polarity) out.push("one side negates");
  if (!sig.sameFormat) out.push("different format");
  if (sig.onlyCandidate.length) out.push(`new here: ${words(sig.onlyCandidate)}`);
  if (sig.onlyMatch.length) out.push(`only there: ${words(sig.onlyMatch)}`);
  return out;
}

/**
 * The verdict for a candidate against its nearest neighbours in the Field
 * (closest first) and, optionally, its nearest elsewhere in the account.
 *
 * Every neighbour is related, not only the closest: the embedding's
 * ranking is by topic, and the card that actually conflicts with the
 * candidate is often second or third. The most serious relation found
 * decides; the rest that stop a submission are reported alongside it.
 */
export function judge(
  candidate: CardText,
  neighbours: Neighbour[],
  bands: Bands,
  opts: { crowdLine?: number; elsewhere?: Neighbour[] } = {}
): NoveltyVerdict {
  const crowd = neighbours.filter((n) => n.similarity >= (opts.crowdLine ?? 0.7)).length;
  const self = { prompt: clip(candidate.prompt), answer: clip(candidate.answer) };
  if (!neighbours.length) {
    return {
      relation: "DISTINCT",
      action: "CREATE_NEW_NODE",
      label: RELATION_META.DISTINCT.label,
      summary: "Nothing in this Field to compare against yet: this opens it.",
      suggest: "create",
      evidence: ["no neighbours"],
      confidence: 1,
      match: null,
      also: elsewhereNotes(candidate, opts.elsewhere ?? [], bands),
      crowd: 0,
      signals: null,
      candidate: self,
    };
  }

  const candNorm = normalise(`${candidate.prompt}\n${candidate.answer}`);
  const rated = neighbours.map((n) => {
    const sig = compareCards(candidate, n.card, n.similarity);
    const exact = candNorm.length > 0 && candNorm === normalise(`${n.card.prompt}\n${n.card.answer}`);
    const rel = relate(sig, bands, exact);
    return { n, sig, rel, same: exact ? 1 : sameness(sig) };
  });
  // Most serious first; among equals, the likelier duplicate.
  rated.sort((a, b) => RELATION_META[b.rel].severity - RELATION_META[a.rel].severity || b.same - a.same);
  const top = rated[0];
  const meta = RELATION_META[top.rel];
  // A create is named against the nearest card, not the most serious (they are all creates).
  const named = meta.action === "CREATE_NEW_NODE" ? rated.reduce((a, b) => (b.n.similarity > a.n.similarity ? b : a)) : top;

  const also = [
    ...rated
      .filter((r) => r !== named && RELATION_META[r.rel].action !== "CREATE_NEW_NODE")
      .slice(0, 3)
      .map((r) => matchOf(r.n, r.rel)),
    ...elsewhereNotes(candidate, opts.elsewhere ?? [], bands),
  ];

  const evidence = evidenceFor(named.sig);
  if (crowd >= 3) evidence.push(`${crowd} close cards on this topic already — new ones here pay less`);

  return {
    relation: named.rel,
    action: RELATION_META[named.rel].action,
    label: RELATION_META[named.rel].label,
    summary: summaryFor(named.rel, named.n, named.sig),
    suggest: RELATION_META[named.rel].suggest,
    evidence,
    confidence: RELATION_META[named.rel].action === "CREATE_NEW_NODE" ? 1 - Math.max(...rated.map((r) => r.same)) : named.same,
    match: matchOf(named.n, named.rel),
    also,
    crowd,
    signals: named.sig,
    candidate: self,
  };
}

/** Copies in other Fields: reported, never acted on — the user chose this Field. */
function elsewhereNotes(candidate: CardText, elsewhere: Neighbour[], bands: Bands): NoveltyMatch[] {
  const candNorm = normalise(`${candidate.prompt}\n${candidate.answer}`);
  return elsewhere
    .map((n) => {
      const sig = compareCards(candidate, n.card, n.similarity);
      const rel = relate(sig, bands, candNorm === normalise(`${n.card.prompt}\n${n.card.answer}`));
      return { n, rel };
    })
    .filter((r) => ["IDENTICAL", "REWORDED", "CONFLICT", "OPPOSITE", "COVERED", "EXTENDS", "REFORMATTED"].includes(r.rel))
    .slice(0, 2)
    .map((r) => matchOf(r.n, r.rel));
}
