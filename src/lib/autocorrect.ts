/**
 * Typing assistance for the Add form.
 *
 * Two jobs: fix the handful of misspellings people actually make, and
 * expand shorthand so a long word costs a few keystrokes. Both fire on a
 * *word boundary* — the moment you type a space or punctuation — never
 * mid-word, so nothing rewrites itself under the cursor while you are still
 * deciding what to type.
 *
 * **What it refuses to touch.** This is a knowledge base holding formulas,
 * identifiers and notation, where a helpful correction is a corruption. A
 * token is left alone if it contains a digit, an underscore, a backtick, a
 * slash, any maths operator, or an internal capital — `x_0`, `O(n log n)`,
 * `getUserId` and `NaN` all survive intact. The FORMULA field opts out
 * entirely rather than relying on those heuristics.
 *
 * Everything it does is a plain text substitution applied through the
 * textarea's own edit history, so Ctrl+Z undoes a correction exactly like
 * any other typing.
 */

/**
 * Misspellings frequent enough to be worth correcting, and unambiguous
 * enough to be safe. Deliberately short: a large list starts "correcting"
 * technical vocabulary it has never heard of, and a false correction on a
 * card you will review for months is far more costly than a typo.
 */
const TYPOS: Record<string, string> = {
  teh: "the",
  hte: "the",
  adn: "and",
  nad: "and",
  taht: "that",
  thier: "their",
  recieve: "receive",
  recieved: "received",
  seperate: "separate",
  seperated: "separate",
  definately: "definitely",
  occured: "occurred",
  occuring: "occurring",
  neccessary: "necessary",
  necessarry: "necessary",
  accomodate: "accommodate",
  begining: "beginning",
  beleive: "believe",
  calender: "calendar",
  concious: "conscious",
  existance: "existence",
  independant: "independent",
  occassion: "occasion",
  persistant: "persistent",
  refered: "referred",
  relevent: "relevant",
  succesful: "successful",
  successfull: "successful",
  untill: "until",
  wich: "which",
  wiht: "with",
  whcih: "which",
  lenght: "length",
  strenght: "strength",
  heigth: "height",
  widht: "width",
  arugment: "argument",
  arguement: "argument",
  enviroment: "environment",
  goverment: "government",
  knowlege: "knowledge",
  knowldge: "knowledge",
  langauge: "language",
  mesure: "measure",
  paramater: "parameter",
  proccess: "process",
  proprty: "property",
  reccomend: "recommend",
  refernce: "reference",
  represnt: "represent",
  seperator: "separator",
  statment: "statement",
  varaible: "variable",
  varible: "variable",
  wierd: "weird",
  becuase: "because",
  becasue: "because",
  diffrent: "different",
  differnt: "different",
  freind: "friend",
  futher: "further",
  intrest: "interest",
  particulary: "particularly",
  probaly: "probably",
  quantitiy: "quantity",
  siginificant: "significant",
  significnat: "significant",
  therefor: "therefore",
  thoerem: "theorem",
  theorm: "theorem",
  equatoin: "equation",
  equasion: "equation",
  funciton: "function",
  fucntion: "function",
  retrun: "return",
  vlaue: "value",
};

/**
 * Shorthand, expanded on the same word boundary.
 *
 * This is the half that actually saves keystrokes. Chosen for terms that
 * recur constantly when writing study material and are tedious to type in
 * full.
 */
const EXPANSIONS: Record<string, string> = {
  "w/": "with",
  "w/o": "without",
  bc: "because",
  bcs: "because",
  defn: "definition",
  eqn: "equation",
  fn: "function",
  thm: "theorem",
  pf: "proof",
  wrt: "with respect to",
  iff: "if and only if",
  approx: "approximately",
  bw: "between",
  diff: "difference",
  prob: "probability",
  dist: "distribution",
  freq: "frequency",
  temp: "temperature",
  info: "information",
  env: "environment",
  param: "parameter",
  var: "variable",
  val: "value",
  ref: "reference",
  req: "requirement",
  algo: "algorithm",
  struct: "structure",
  sys: "system",
  ex: "example",
};

/** Multi-character sequences replaced as soon as they are complete. */
const SYMBOLS: [RegExp, string][] = [
  [/->/g, "→"],
  [/<-/g, "←"],
  [/=>/g, "⇒"],
  [/<=>/g, "⇔"],
  [/\.\.\./g, "…"],
  [/(\s)--(\s)/g, "$1—$2"],
  [/\+-/g, "±"],
  [/!=/g, "≠"],
  [/>=/g, "≥"],
  [/<=/g, "≤"],
];

/**
 * True when a token must be left exactly as typed, *given that it has
 * already matched the dictionary*.
 *
 * Order matters, and an earlier version had it backwards: this ran before
 * the lookup, so `w/` — a deliberate expansion key — was rejected for
 * containing a slash and never expanded at all. Only known words reach here
 * now, so it need only catch dictionary keys that collide with notation.
 *
 * All-caps is the one that earns its keep. `VAR` is vector autoregression
 * and `PROB` heads a probability column; rewriting either into its
 * lowercase expansion would be far worse than any typo. The cost is that
 * `TEH` stays misspelt, which is the right side of that trade.
 */
function isProtected(token: string): boolean {
  if (token.length > 1 && token === token.toUpperCase() && /[A-Z]/.test(token)) return true;
  // Internal capital — `getUserId`, `NaN`, `pH`. A leading capital is
  // ordinary prose and does not count.
  if (/.[A-Z]/.test(token)) return true;
  // Digits and notation. Slash is deliberately absent: `w/` and `w/o` are
  // dictionary keys, and nothing else containing a slash is one.
  return /\d|[_`\\^*+=<>{}[\]()|~$@#%]/.test(token);
}

export interface Correction {
  from: string;
  to: string;
  kind: "typo" | "expansion";
}

/** The correction for a single word, or null to leave it alone. */
export function correctWord(word: string): Correction | null {
  if (!word) return null;

  const lower = word.toLowerCase();
  const typo = TYPOS[lower];
  const expansion = typo ? undefined : EXPANSIONS[lower];
  if (!typo && !expansion) return null;

  // Only words the dictionary already claims reach this guard.
  if (isProtected(word)) return null;

  const to = (typo ?? expansion) as string;
  return { from: word, to: matchCase(word, to), kind: typo ? "typo" : "expansion" };
}

/**
 * Carries the original's capitalisation onto the replacement, so correcting
 * a word that opened a sentence does not quietly lowercase it.
 */
function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export interface AutocorrectResult {
  text: string;
  /** Where the caret should sit afterwards. */
  caret: number;
  corrections: Correction[];
}

/**
 * Applies corrections to the word just completed, plus any symbol
 * sequences, and reports what changed.
 *
 * Only the token immediately before the caret is considered: rewriting text
 * elsewhere in the field while someone edits one sentence is the fastest
 * way to make a feature like this feel hostile.
 */
export function autocorrectAtCaret(text: string, caret: number): AutocorrectResult {
  const corrections: Correction[] = [];

  // The boundary character that triggered this (space, newline, punctuation)
  // sits just before the caret; the token is what precedes it.
  const before = text.slice(0, caret);
  const match = /(^|[\s([{"'])([^\s([{"']+)([\s.,;:!?)\]}"']?)$/.exec(before);

  let next = text;
  let nextCaret = caret;

  if (match) {
    const [, lead, token, trail] = match;
    const correction = correctWord(token);
    if (correction) {
      corrections.push(correction);
      const start = caret - (lead.length + token.length + trail.length) + lead.length;
      next = text.slice(0, start) + correction.to + text.slice(start + token.length);
      nextCaret = caret + (correction.to.length - token.length);
    }
  }

  // Symbols are position-independent — they are unambiguous and short.
  for (const [pattern, replacement] of SYMBOLS) {
    if (pattern.test(next)) {
      const beforeLen = next.length;
      const head = next.slice(0, nextCaret).replace(pattern, replacement);
      const tail = next.slice(nextCaret);
      next = head + tail;
      nextCaret += next.length - beforeLen;
    }
  }

  return { text: next, caret: Math.max(0, Math.min(nextCaret, next.length)), corrections };
}

/** Characters that end a word and so trigger a pass. */
export function isBoundaryKey(key: string): boolean {
  return key === " " || key === "Enter" || key === "Tab" || /^[.,;:!?)\]}]$/.test(key);
}
