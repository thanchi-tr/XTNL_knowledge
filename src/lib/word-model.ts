/**
 * Word completion's language model. Pure: no database, no React, no clock of
 * its own. The server builds it from everything the user writes and ships it
 * compact (vocabulary.ts loadWordModel); the browser decodes it once and
 * ranks with it on every keystroke (components/WordComplete.tsx).
 *
 *   buildWordModel({sources, choices, now}) → WordModel   the user's words, counted
 *   encodeWordModel(model) → WordModelWire                 what crosses the wire (≤ ~120 KB at the caps)
 *   decodeWordModel(wire) → WordModel | null               back again, validated
 *   suggest(model, typed, context, learnt?) → Suggestion[] the ranking, per keystroke
 *
 * ── The model ─────────────────────────────────────────────────────────────
 * Counts are frecency-weighted: every occurrence weighs 0.5^(ageDays / 60),
 * so what the user writes now outranks what they wrote a year ago at the
 * same count. On those counts:
 *
 *   P(w)    = c(w) / C                                   C: every token's weight
 *   P(w|c)  = λ_c · c(c,w) / N(c) + (1 − λ_c) · P(w)     Witten–Bell
 *   λ_c     = N(c) / (N(c) + T(c))                       N: c's weight as a context, T: its distinct followers
 *
 * where c is the word before the one being typed in the same field (lower
 * case; "" at the start).
 *
 * The user's choices (WordChoice) join the counts: a pick is PICK_WEIGHT
 * occurrences of the word, in its context, at lastPickAt (the same decay); a
 * pass (the word was the FIRST suggestion and the user typed past it to a
 * different word) multiplies its score by PASS_FACTOR^passes, the passes
 * decayed by lastPassAt's age.
 *
 * ── The ranking ───────────────────────────────────────────────────────────
 * For a typed prefix p (≥ MIN_PREFIX characters, any case) after context c:
 *
 *   score(w) = ln P(w|c) + passes(w) · ln PASS_FACTOR + KEYSTROKE_BONUS · (|w| − |p|)
 *
 * over the words starting with p (never p itself; length ≥ MIN_WORD_LENGTH
 * or picked before, which the build enforces), top MAX_SUGGESTIONS. With
 * fewer and |p| ≥ FUZZY_MIN_PREFIX, words whose prefix is one Damerau edit
 * from p (a slip, a swap, a missed or doubled letter) follow at
 * FUZZY_FACTOR × probability — after every exact prefix, always.
 */

// ── Constants ─────────────────────────────────────────────────────────────

/** Days for an occurrence (and a pick, and a pass) to lose half its weight. */
export const HALF_LIFE_DAYS = 60;
/** A pick counts as this many occurrences of the word, in its context. */
export const PICK_WEIGHT = 3;
/** Each (decayed) pass multiplies the word's probability by this. */
export const PASS_FACTOR = 0.85;
/** Per character the completion saves, in nats: between near-equals, the longer word saves more typing. */
export const KEYSTROKE_BONUS = 0.04;
/** A fuzzy candidate's probability is multiplied by this (and it ranks after every exact prefix). */
export const FUZZY_FACTOR = 0.1;
/** Below this, the candidate list is everything and helps nobody. */
export const MIN_PREFIX = 2;
/** Fuzzy candidates only from this many characters: two letters with a slip in them match half the dictionary. */
export const FUZZY_MIN_PREFIX = 3;

/** At most this many fuzzy candidates are listed (after every exact prefix). */
export const FUZZY_MAX = 2;
export const MAX_SUGGESTIONS = 6;
/** Below this, a word is faster to type than to pick off a list (unless the user has picked it before). */
export const MIN_WORD_LENGTH = 5;
/** Words seen once are usually typos; names (customers, tags, Fields, Domains) are exempt. */
export const MIN_COUNT = 2;
/** The wire's caps: words, bigram pairs, and the contexts those pairs hang off. */
export const MAX_WORDS = 2500;
export const MAX_PAIRS = 6000;
export const MAX_CONTEXTS = 1500;
/** Longer tokens are URLs and hashes, never words: not counted, and a context of "" after them. */
export const WORD_MAX_CHARS = 40;
/** At most this many choice events per write (the client's queue holds no more). */
export const CHOICE_BATCH_MAX = 50;
/** Weights cross the wire as round(WIRE_LOG_SCALE · ln w): ±5 % precision over any range, two or three digits each. */
export const WIRE_LOG_SCALE = 10;

const DAY_MS = 86_400_000;

// ── Words ─────────────────────────────────────────────────────────────────

/** Word characters: letters (with their marks), digits, apostrophes (straight and curly) and hyphens. */
const WORD_CHARS = "\\p{L}\\p{M}\\p{N}'’-";
const SPLIT_RE = new RegExp(`[^${WORD_CHARS}]+`, "u");
const RUN_RE = new RegExp(`[${WORD_CHARS}]+`, "gu");
const TAIL_RE = new RegExp(`[${WORD_CHARS}]+$`, "u");
const HEAD_RE = new RegExp(`^[${WORD_CHARS}]+`, "u");
const VALID_RE = new RegExp(`^[${WORD_CHARS}]{1,${WORD_MAX_CHARS}}$`, "u");
const LETTER_RE = /\p{L}/u;
const EDGE_RE = /^['’-]+|['’-]+$/gu;
/** LaTeX commands (\frac, \alpha): markup, never words. */
const LATEX_RE = /\\[A-Za-z]+/g;
/** A word right after one of these is not prose: '^goal', '#tag', '@time', '~30m', '\cmd'. No completion there. */
const MARKER_RE = /[\\^#@~]/;
/** How far back the caret's word and the word before it are looked for. */
const LOOK_BACK = 200;

/** Quotes and dashes around a word are not part of it ("'quoted'", "-x"); inside it they are (don't, x-ray). */
export function edgeTrim(token: string): string {
  return token.replace(EDGE_RE, "");
}

/** The key a word is counted, matched and stored under: NFC, lower case, one apostrophe. */
export function keyOf(token: string): string {
  return token.normalize("NFC").toLowerCase().replace(/’/g, "'");
}

/**
 * The tokens of a piece of the user's writing, as written (casing kept):
 * split on anything that is not a word character, LaTeX commands dropped,
 * quotes and dashes trimmed from the ends.
 */
export function tokensOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.normalize("NFC").replace(LATEX_RE, " ").split(SPLIT_RE)) {
    const t = edgeTrim(raw);
    if (t) out.push(t);
  }
  return out;
}

/** A context key as both sides store it: the token's key, or "" for none (and for a token too long to be a word). */
function contextKeyOf(token: string): string {
  const key = keyOf(token);
  return key.length <= WORD_MAX_CHARS ? key : "";
}

/**
 * The word being typed at the caret (from the last word boundary back to
 * the caret; leading quotes and dashes left out), where it starts, and the
 * word before it in the same field (its context). No word after a marker
 * ('^goal', '#tag', '\frac'): those have their own suggestions or none.
 */
export function caretWordOf(value: string, caret: number): { prefix: string; start: number; context: string } {
  const c = Math.max(0, Math.min(value.length, caret));
  const before = value.slice(Math.max(0, c - LOOK_BACK), c);
  const run = TAIL_RE.exec(before)?.[0] ?? "";
  const lead = /^['’-]*/.exec(run)?.[0].length ?? 0;
  const prefix = run.slice(lead);
  const start = c - run.length + lead;
  if (start > 0 && MARKER_RE.test(value[start - 1])) return { prefix: "", start, context: "" };
  return { prefix, start, context: contextBefore(value, start) };
}

/** The word before `start` in the field, as a context key ("" for none), read the way tokensOf reads the corpus. */
export function contextBefore(value: string, start: number): string {
  const window = value.slice(Math.max(0, start - LOOK_BACK), start).normalize("NFC").replace(LATEX_RE, " ");
  const runs = window.match(RUN_RE) ?? [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const t = edgeTrim(runs[i]);
    if (t) return contextKeyOf(t);
  }
  return "";
}

/** The whole word that starts at `start` (key; "" for none): what a word that was being typed became. */
export function wordAt(value: string, start: number): string {
  const run = HEAD_RE.exec(value.slice(start, start + LOOK_BACK))?.[0] ?? "";
  return keyOf(edgeTrim(run));
}

// ── Build ─────────────────────────────────────────────────────────────────

/**
 * How a source's words are admitted. 'text' is prose (a word needs
 * MIN_COUNT occurrences); 'name' is a deliberate label — a customer, a tag
 * — admitted from one occurrence; 'structure' is a Field, Domain or work tab
 * name, admitted from one and always kept under the cap.
 */
export type WordSourceKind = "text" | "name" | "structure";

/** One piece of the user's writing: one field, so the context resets at its start. */
export interface WordSource {
  text: string;
  /** When it was written (epoch ms). */
  at: number;
  kind?: WordSourceKind;
}

/** A WordChoice row as the build reads it (word and context keys; times in epoch ms). */
export interface WordChoiceRecord {
  word: string;
  context: string;
  picks: number;
  passes: number;
  lastPickAt: number | null;
  lastPassAt: number | null;
}

export interface WordContext {
  /** This context's weight as a context: N(c). */
  n: number;
  /** Its distinct followers: T(c). */
  t: number;
  /** Follower word index → c(c, w), for the followers shipped. */
  followers: Map<number, number>;
}

export interface WordModel {
  /** When it was built (epoch ms): the client's own learning applies only to choices made after it. */
  builtAt: number;
  /** The words in the user's most common casing, sorted by `lower` (code-unit order) for a binary search. */
  words: string[];
  lower: string[];
  /** Each word's weight, c(w). */
  weight: number[];
  /** Each word's passes, decayed. */
  passes: number[];
  /** Every token's weight: C. */
  total: number;
  /** Context key → its N, T and shipped followers. */
  contexts: Map<string, WordContext>;
}

/** An occurrence's weight `now`: 0.5^(ageDays / HALF_LIFE_DAYS); never above 1 (a future stamp is now). */
export function decayOf(at: number | null, now: number): number {
  if (at === null || !Number.isFinite(at)) return 0;
  return Math.pow(0.5, Math.max(0, now - at) / DAY_MS / HALF_LIFE_DAYS);
}

const KIND_RANK: Record<WordSourceKind, number> = { text: 0, name: 1, structure: 2 };

interface WordAcc {
  weight: number;
  count: number;
  forms: Map<string, number>;
  rank: number;
  picked: boolean;
  passes: number;
}

/** The form written most often; between equals, the first one seen. */
function commonForm(key: string, forms: Map<string, number>): string {
  let best = key;
  let bestCount = 0;
  for (const [form, n] of forms) {
    if (n > bestCount) {
      best = form;
      bestCount = n;
    }
  }
  return best;
}

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Counts the user's writing and choices into a model, capped for the wire:
 * Field, Domain and work tab names first (always kept), then the heaviest
 * words up to MAX_WORDS; then the heaviest (context, word) pairs among them,
 * up to MAX_PAIRS over at most MAX_CONTEXTS contexts. N(c) and T(c) are
 * counted over every follower, shipped or not, so Witten–Bell stays honest.
 */
export function buildWordModel(input: { sources: readonly WordSource[]; choices?: readonly WordChoiceRecord[]; now: number }): WordModel {
  const { now } = input;
  const words = new Map<string, WordAcc>();
  const contexts = new Map<string, { n: number; followers: Map<string, number> }>();
  let total = 0;

  const accOf = (key: string): WordAcc => {
    let a = words.get(key);
    if (!a) {
      a = { weight: 0, count: 0, forms: new Map(), rank: 0, picked: false, passes: 0 };
      words.set(key, a);
    }
    return a;
  };
  const follow = (ctx: string, key: string, w: number) => {
    let c = contexts.get(ctx);
    if (!c) {
      c = { n: 0, followers: new Map() };
      contexts.set(ctx, c);
    }
    c.n += w;
    c.followers.set(key, (c.followers.get(key) ?? 0) + w);
  };

  for (const source of input.sources) {
    if (typeof source.text !== "string" || !source.text) continue;
    const w = decayOf(source.at, now);
    if (w <= 0) continue;
    const rank = KIND_RANK[source.kind ?? "text"];
    let prev = "";
    for (const token of tokensOf(source.text)) {
      const key = keyOf(token);
      if (key.length > WORD_MAX_CHARS) {
        prev = "";
        continue;
      }
      total += w;
      const a = accOf(key);
      a.weight += w;
      a.count += 1;
      a.forms.set(token, (a.forms.get(token) ?? 0) + 1);
      if (rank > a.rank) a.rank = rank;
      follow(prev, key, w);
      prev = key;
    }
  }

  for (const c of input.choices ?? []) {
    const word = cleanChoiceWord(c.word);
    const context = cleanChoiceContext(c.context);
    if (word === null || context === null) continue;
    const picks = Number.isFinite(c.picks) ? Math.max(0, c.picks) : 0;
    const passes = Number.isFinite(c.passes) ? Math.max(0, c.passes) : 0;
    if (picks > 0) {
      const w = PICK_WEIGHT * picks * decayOf(c.lastPickAt, now);
      const a = accOf(word);
      a.picked = true;
      if (w > 0) {
        a.weight += w;
        total += w;
        follow(context, word, w);
      }
    }
    if (passes > 0) {
      const w = passes * decayOf(c.lastPassAt, now);
      if (w > 0) accOf(word).passes += w;
    }
  }

  // The words: eligible (a letter; long enough or picked; seen enough or a name or picked), structure first, then by weight.
  const eligible: string[] = [];
  for (const [key, a] of words) {
    if (!LETTER_RE.test(key) || a.weight <= 0) continue;
    if (key.length < MIN_WORD_LENGTH && !a.picked) continue;
    if (a.count < MIN_COUNT && a.rank === 0 && !a.picked) continue;
    eligible.push(key);
  }
  eligible.sort((x, y) => {
    const a = words.get(x)!;
    const b = words.get(y)!;
    return (b.rank === 2 ? 1 : 0) - (a.rank === 2 ? 1 : 0) || b.weight - a.weight || byKey(x, y);
  });
  const kept = eligible.slice(0, MAX_WORDS).sort(byKey);
  const index = new Map(kept.map((k, i) => [k, i]));

  // The pairs: heaviest first, while their context fits under MAX_CONTEXTS.
  const pairs: { ctx: string; i: number; w: number }[] = [];
  for (const [ctx, c] of contexts) {
    for (const [key, w] of c.followers) {
      const i = index.get(key);
      if (i !== undefined) pairs.push({ ctx, i, w });
    }
  }
  pairs.sort((a, b) => b.w - a.w || byKey(a.ctx, b.ctx) || a.i - b.i);
  const shipped = new Map<string, WordContext>();
  let count = 0;
  for (const p of pairs) {
    if (count >= MAX_PAIRS) break;
    let s = shipped.get(p.ctx);
    if (!s) {
      if (shipped.size >= MAX_CONTEXTS) continue;
      const c = contexts.get(p.ctx)!;
      s = { n: c.n, t: c.followers.size, followers: new Map() };
      shipped.set(p.ctx, s);
    }
    s.followers.set(p.i, p.w);
    count++;
  }

  return {
    builtAt: now,
    words: kept.map((k) => commonForm(k, words.get(k)!.forms)),
    lower: kept,
    weight: kept.map((k) => words.get(k)!.weight),
    passes: kept.map((k) => words.get(k)!.passes),
    total,
    contexts: shipped,
  };
}

// ── The wire ──────────────────────────────────────────────────────────────

/**
 * The model as JSON. Weights are round(WIRE_LOG_SCALE · ln w). Bigrams are
 * the [ctxIndex, wordIndex, weight] triples grouped by context, so the
 * context is written once per row instead of once per pair:
 *   b: [[context, N, T, wordIndex, weight, wordIndex, weight, …], …]
 * where context is a word index when the context is one of `w`, else its
 * key ("" for the start of a field).
 */
export interface WordModelWire {
  v: 1;
  /** Built at (epoch ms). */
  t: number;
  /** Every token's weight, C. */
  n: number;
  /** Words, the user's casing, sorted by their lower case. */
  w: string[];
  /** Each word's weight. */
  u: number[];
  /** Passes, sparse: [wordIndex, round(10 · decayed passes), …]. */
  p: number[];
  b: (string | number)[][];
}

export const EMPTY_WORD_MODEL: WordModelWire = { v: 1, t: 0, n: 0, w: [], u: [], p: [], b: [] };

const MIN_WEIGHT = 1e-12;
const quantise = (w: number) => Math.round(WIRE_LOG_SCALE * Math.log(Math.max(w, MIN_WEIGHT)));
const dequantise = (q: number) => Math.exp(q / WIRE_LOG_SCALE);

export function encodeWordModel(m: WordModel): WordModelWire {
  const index = new Map(m.lower.map((k, i) => [k, i]));
  const b: (string | number)[][] = [];
  const ctxKeys = [...m.contexts.keys()].sort(byKey);
  for (const ctx of ctxKeys) {
    const c = m.contexts.get(ctx)!;
    const row: (string | number)[] = [index.get(ctx) ?? ctx, quantise(c.n), c.t];
    for (const [i, w] of [...c.followers].sort((x, y) => x[0] - y[0])) row.push(i, quantise(w));
    b.push(row);
  }
  const p: number[] = [];
  m.passes.forEach((x, i) => {
    const v = Math.round(x * 10);
    if (v > 0) p.push(i, v);
  });
  return { v: 1, t: m.builtAt, n: m.total > 0 ? quantise(m.total) : 0, w: [...m.words], u: m.weight.map(quantise), p, b };
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** The wire back into a model; null for anything malformed (no suggestions beats wrong ones). */
export function decodeWordModel(raw: unknown): WordModel | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof WordModelWire, unknown>>;
  if (r.v !== 1 || !Array.isArray(r.w) || !Array.isArray(r.u) || !Array.isArray(r.p) || !Array.isArray(r.b)) return null;
  if (r.w.length !== r.u.length || r.w.length > MAX_WORDS || !isInt(r.n) || typeof r.t !== "number") return null;
  const words: string[] = [];
  const lower: string[] = [];
  for (const w of r.w) {
    if (typeof w !== "string" || !w) return null;
    const k = keyOf(w);
    if (lower.length > 0 && !(lower[lower.length - 1] < k)) return null;
    words.push(w);
    lower.push(k);
  }
  if (!r.u.every(isInt)) return null;
  const weight = (r.u as number[]).map(dequantise);
  const passes = new Array<number>(words.length).fill(0);
  if (r.p.length % 2 !== 0) return null;
  for (let j = 0; j < r.p.length; j += 2) {
    const i = r.p[j];
    const v = r.p[j + 1];
    if (!isInt(i) || !isInt(v) || i < 0 || i >= words.length || v < 0) return null;
    passes[i] = v / 10;
  }
  const contexts = new Map<string, WordContext>();
  for (const row of r.b) {
    if (!Array.isArray(row) || row.length < 3 || (row.length - 3) % 2 !== 0) return null;
    const [ctx, n, t] = row;
    const key = typeof ctx === "number" ? (isInt(ctx) && ctx >= 0 && ctx < lower.length ? lower[ctx] : null) : typeof ctx === "string" ? ctx : null;
    if (key === null || !isInt(n) || !isInt(t) || t < 0) return null;
    const followers = new Map<number, number>();
    for (let j = 3; j < row.length; j += 2) {
      const i = row[j];
      const w = row[j + 1];
      if (!isInt(i) || !isInt(w) || i < 0 || i >= words.length) return null;
      followers.set(i, dequantise(w));
    }
    contexts.set(key, { n: dequantise(n), t, followers });
  }
  return { builtAt: r.t, words, lower, weight, passes, total: r.w.length > 0 ? dequantise(r.n) : 0, contexts };
}

// ── The user's choices ────────────────────────────────────────────────────

export type WordChoiceKind = "pick" | "pass";

/** One choice, as the client queues it and the server stores it (word and context are keys). */
export interface WordEvent {
  word: string;
  context: string;
  kind: WordChoiceKind;
}

/** A word as a choice may name it: its key, of word characters only, at most WORD_MAX_CHARS, with a letter; else null. */
export function cleanChoiceWord(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const s = keyOf(x.trim());
  if (!VALID_RE.test(s) || !LETTER_RE.test(s) || edgeTrim(s) !== s) return null;
  return s;
}

/** A context as a choice may name it: "" (the start of a field), or a key of word characters, at most WORD_MAX_CHARS; else null. */
export function cleanChoiceContext(x: unknown): string | null {
  if (x === "" || x === undefined || x === null) return "";
  if (typeof x !== "string") return null;
  const s = keyOf(x.trim());
  if (s === "") return "";
  if (!VALID_RE.test(s) || edgeTrim(s) !== s) return null;
  return s;
}

export interface WordChoiceDelta {
  word: string;
  context: string;
  picks: number;
  passes: number;
}

/**
 * The events a write may store: at most CHOICE_BATCH_MAX read, anything
 * malformed dropped, and one row per (word, context) with its picks and
 * passes summed — one statement upserts them all, and a statement may not
 * touch the same row twice.
 */
export function wordChoiceBatch(events: unknown): WordChoiceDelta[] {
  if (!Array.isArray(events)) return [];
  const rows = new Map<string, WordChoiceDelta>();
  for (const e of events.slice(0, CHOICE_BATCH_MAX)) {
    if (!e || typeof e !== "object") continue;
    const { word, context, kind } = e as Record<string, unknown>;
    const w = cleanChoiceWord(word);
    const c = cleanChoiceContext(context);
    if (w === null || c === null || (kind !== "pick" && kind !== "pass")) continue;
    const id = `${c}\u0000${w}`;
    const row = rows.get(id) ?? { word: w, context: c, picks: 0, passes: 0 };
    if (kind === "pick") row.picks += 1;
    else row.passes += 1;
    rows.set(id, row);
  }
  return [...rows.values()];
}

/**
 * The passes a finished word implies: every suggestion that was FIRST for a
 * prefix of it (≥ MIN_PREFIX) and is not the word itself, when the word went
 * on past that prefix and is long enough to have been a suggestion itself.
 * Short words never count (typing 'in' is not turning 'information' down).
 * `firsts`: first suggestion key → the prefix it was first for.
 */
export function passesOf(firsts: ReadonlyMap<string, string>, finished: string, context: string): WordEvent[] {
  const out: WordEvent[] = [];
  if (finished.length < MIN_WORD_LENGTH) return out;
  for (const [word, prefix] of firsts) {
    if (prefix.length < MIN_PREFIX || word === finished) continue;
    if (finished.startsWith(prefix) && finished.length > prefix.length) out.push({ word, context, kind: "pass" });
  }
  return out;
}

/** Choices made since the model was built, folded for the ranking (fresh: no decay). */
export interface WordLearning {
  picks: Map<string, number>;
  /** Context → word → picks. */
  pairs: Map<string, Map<string, number>>;
  passes: Map<string, number>;
  /** Every pick. */
  total: number;
}

export function learningOf(events: readonly WordEvent[]): WordLearning {
  const out: WordLearning = { picks: new Map(), pairs: new Map(), passes: new Map(), total: 0 };
  for (const e of events) {
    if (e.kind === "pass") {
      out.passes.set(e.word, (out.passes.get(e.word) ?? 0) + 1);
      continue;
    }
    out.total += 1;
    out.picks.set(e.word, (out.picks.get(e.word) ?? 0) + 1);
    const row = out.pairs.get(e.context) ?? new Map<string, number>();
    row.set(e.word, (row.get(e.word) ?? 0) + 1);
    out.pairs.set(e.context, row);
  }
  return out;
}

// ── The ranking ───────────────────────────────────────────────────────────

export interface Suggestion {
  /** As it is inserted: the user's casing, capitalised when they started the word with a capital. */
  word: string;
  /** How much of `word` the user has already typed, for dimming (0 for a fuzzy candidate). */
  prefixLength: number;
  fuzzy?: true;
}

/** First index whose key is ≥ x. */
function lowerBound(keys: readonly string[], x: string): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** [from, to) of the keys starting with p: a binary search, then the range itself. */
export function prefixRange(keys: readonly string[], p: string): [number, number] {
  const from = lowerBound(keys, p);
  let to = from;
  while (to < keys.length && keys[to].startsWith(p)) to++;
  return [from, to];
}

/** At most one substitution, insertion, deletion or adjacent swap apart (optimal string alignment). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let i = 0;
    while (i < la && a[i] === b[i]) i++;
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [s, l] = la < lb ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/** Whether some prefix of `key` (|p| − 1 … |p| + 1 long) is one Damerau edit from p. */
function fuzzyPrefix(key: string, p: string): boolean {
  for (let k = p.length - 1; k <= p.length + 1; k++) {
    if (k < 1 || k > key.length) continue;
    if (withinOneEdit(p, key.slice(0, k))) return true;
  }
  return false;
}

/** The user started the word with a capital and the word is all lower case: start it with one too. */
function cased(word: string, typed: string): string {
  const first = typed[0];
  if (!first || first === first.toLowerCase() || word !== word.toLowerCase()) return word;
  return word[0].toUpperCase() + word.slice(1);
}

/**
 * The model in one context, for scoring its words (by index): P(w|c) with
 * Witten–Bell over the model's counts plus the choices learnt since it was
 * built (fresh picks: PICK_WEIGHT occurrences each, in their context).
 */
export function rankerOf(m: WordModel, context: string, learnt?: WordLearning) {
  const total = m.total + PICK_WEIGHT * (learnt?.total ?? 0);
  const mc = m.contexts.get(context);
  const lc = learnt?.pairs.get(context);
  let n = mc?.n ?? 0;
  let t = mc?.t ?? 0;
  if (lc) {
    for (const [word, picks] of lc) {
      n += PICK_WEIGHT * picks;
      const [from, to] = prefixRange(m.lower, word);
      const i = from < to && m.lower[from] === word ? from : -1;
      if (i < 0 || !mc?.followers.has(i)) t += 1;
    }
  }
  /** λ_c = N(c) / (N(c) + T(c)); 0 for a context never seen (the unigram alone). */
  const lambda = n > 0 ? n / (n + t) : 0;
  const lnPass = Math.log(PASS_FACTOR);
  /** P(w|c) = λ_c · c(c,w) / N(c) + (1 − λ_c) · P(w). */
  const prob = (i: number): number => {
    const key = m.lower[i];
    const pw = total > 0 ? (m.weight[i] + PICK_WEIGHT * (learnt?.picks.get(key) ?? 0)) / total : 0;
    if (lambda === 0) return pw;
    const cw = (mc?.followers.get(i) ?? 0) + PICK_WEIGHT * (lc?.get(key) ?? 0);
    return (lambda * cw) / n + (1 - lambda) * pw;
  };
  /** ln P(w|c) + passes(w) · ln PASS_FACTOR + KEYSTROKE_BONUS · (|w| − |p|). */
  const score = (i: number, typedLength: number): number => {
    const passes = m.passes[i] + (learnt?.passes.get(m.lower[i]) ?? 0);
    return Math.log(prob(i)) + passes * lnPass + KEYSTROKE_BONUS * (m.words[i].length - typedLength);
  };
  return { total, lambda, prob, score };
}

/**
 * The ranking (see the header). `typed` is the word as typed so far,
 * `context` the key of the word before it ("" for none), `learnt` the
 * choices made since the model was built.
 */
export function suggest(m: WordModel | null, typed: string, context: string, learnt?: WordLearning): Suggestion[] {
  if (!m || m.words.length === 0) return [];
  const p = keyOf(typed);
  if (p.length < MIN_PREFIX) return [];
  const ranker = rankerOf(m, context, learnt);
  if (!(ranker.total > 0)) return [];
  const scoreOf = (i: number) => ranker.score(i, p.length);
  const rank = (a: { i: number; s: number }, b: { i: number; s: number }) => b.s - a.s || byKey(m.lower[a.i], m.lower[b.i]);

  const [from, to] = prefixRange(m.lower, p);
  const exact: { i: number; s: number }[] = [];
  for (let i = from; i < to; i++) {
    if (m.lower[i] === p) continue;
    exact.push({ i, s: scoreOf(i) });
  }
  exact.sort(rank);
  const out: Suggestion[] = exact.slice(0, MAX_SUGGESTIONS).map(({ i }) => ({ word: cased(m.words[i], typed), prefixLength: typed.length }));
  if (out.length >= MAX_SUGGESTIONS || p.length < FUZZY_MIN_PREFIX) return out;

  // Fuzzy: a typo is rarely the first letter, so a candidate keeps p's first letter, or swaps the first two
  // ("hpo" for "pho"); a dropped first letter ("pho" → "Hours") is not a typo worth offering. At most
  // FUZZY_MAX of them, so a near-miss never crowds the list.
  const lnFuzzy = Math.log(FUZZY_FACTOR);
  const fuzzy: { i: number; s: number }[] = [];
  const seen = new Set<number>();
  for (const head of new Set([p[0], p[1]])) {
    const [a, b] = prefixRange(m.lower, head);
    for (let i = a; i < b; i++) {
      const key = m.lower[i];
      if (seen.has(i) || key.startsWith(p) || key.length < p.length) continue;
      if (key[0] !== p[0] && !(key[0] === p[1] && key[1] === p[0])) continue;
      seen.add(i);
      if (fuzzyPrefix(key, p)) fuzzy.push({ i, s: scoreOf(i) + lnFuzzy });
    }
  }
  fuzzy.sort(rank);
  for (const { i } of fuzzy.slice(0, Math.min(FUZZY_MAX, MAX_SUGGESTIONS - out.length))) out.push({ word: cased(m.words[i], typed), prefixLength: 0, fuzzy: true });
  return out;
}
