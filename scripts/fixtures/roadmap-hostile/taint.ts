/**
 * The taint check's pieces (roadmap-rev4.md F-R4-22 H1): tokens, the
 * vocabulary V of words the app or the user may legitimately show, the
 * tainted set T of one reply, and a walk that finds T's tokens in any view
 * model, report or log line. Pure; lane R7. R4's roadmap-server-check may
 * import it to run the same taint check on its own views (F-R4-16).
 *
 *   T = the tokens of 4+ characters in every string of the raw reply (keys and
 *       values), minus the schema's property names, the issued enum keys and V.
 *   V = the tokens of the app's own copy (roadmap-copy, the catalog templates
 *       and how lines, every code template and code-written reason) and of
 *       the run's user text and Domain names.
 * No token of T may appear in a rendered view, the report JSON or the log
 * line, apart from GAP rows inside the panel view.
 *
 * Tokens are NFKC, lower case, format characters (zero-width, bidi) removed,
 * split on anything but letters and digits; purely numeric tokens are left
 * out (numbers are NUMBER's, and day keys and ids are full of them).
 *
 * Fix round 2 (lens 1 minor: V absorbed the claim vocabulary from a word
 * list, the class of blindness RULE_EXAMPLES had):
 *   - V is built from the copy only: a word-list constant (a name ending in
 *     _WORDS, _TERMS, _PHRASES, _CUES, _STEMS or _KEYWORDS, and a catalog
 *     entry's `keywords`) is a matcher the app reads text with, never text it
 *     renders, so its array is left out (CREDENTIAL_WORDS put "certified",
 *     "accredited", "diploma" … in V wholesale);
 *   - the guarded words (the claim, resource, spend and credential lists and
 *     HOSTILE_CANON; the check passes them) are never in V. Where the app's
 *     own sentence holds one ("It may name a book, course or other
 *     resource"), that occurrence is the app's: a hit inside a run of two or
 *     more words of one of the app's literals, in a string that is one of
 *     them whole, or in a value exactly one of its CONSTANT_CASE literals
 *     ("SYLLABUS", an enum value) is no hit (OwnCopy). Anywhere else a
 *     reply's "course" or "official" is tainted like any other word.
 */

/** tokensOf's results by text: R4's views repeat the same strings reply after reply (a run's starter, its copy), so the scan reads each once. */
const TOKEN_CACHE = new Map<string, string[]>();
const TOKEN_CACHE_MAX = 200_000;
const TOKEN_CACHE_TEXT_MAX = 2_000;

/** The tokens of a text, as the taint check reads them. */
export function tokensOf(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const hit = TOKEN_CACHE.get(text);
  if (hit) return hit;
  const clean = text.normalize("NFKC").replace(/[\p{Cf}]/gu, "").toLowerCase();
  const out = (clean.match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter((t) => Array.from(t).length >= 4 && !/^\p{N}+$/u.test(t));
  if (text.length <= TOKEN_CACHE_TEXT_MAX) {
    if (TOKEN_CACHE.size >= TOKEN_CACHE_MAX) TOKEN_CACHE.clear();
    TOKEN_CACHE.set(text, out);
  }
  return out;
}

/** Every string in a JSON-like value: object keys (isKey) and string values, with their paths. */
export interface FoundString {
  path: string;
  text: string;
  isKey: boolean;
}

/**
 * Every string of a value, visited in order: object keys (isKey) and string
 * values, with the live path (a stack: copy it to keep it). `skip(path,
 * node)` prunes a subtree (the GAP panel rows). Cycles are cut, and a subtree
 * met twice is read once; depth is bounded so a hostile 200-deep reply can
 * be read without overflowing. The path is joined only by a visitor that
 * keeps it, so a scan of R4's large views stays cheap.
 */
export function scanStrings(value: unknown, visit: (text: string, isKey: boolean, path: readonly string[]) => void, skip?: (path: readonly string[], node: unknown) => boolean, maxDepth = 400): void {
  const seen = new Set<object>();
  const path: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > maxDepth) return;
    if (skip && skip(path, v)) return;
    if (typeof v === "string") {
      visit(v, false, path);
      return;
    }
    if (!v || typeof v !== "object") return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        path.push(String(i));
        walk(v[i], depth + 1);
        path.pop();
      }
      return;
    }
    for (const k of Object.keys(v)) {
      path.push(k);
      visit(k, true, path);
      walk((v as Record<string, unknown>)[k], depth + 1);
      path.pop();
    }
  };
  walk(value, 0);
}

/** The strings of a value, each with its path (scanStrings, collected). */
export function stringsOf(value: unknown, skip?: (path: readonly string[], node: unknown) => boolean, maxDepth = 400): FoundString[] {
  const out: FoundString[] = [];
  scanStrings(value, (text, isKey, path) => out.push({ path: path.join("."), text, isKey }), skip, maxDepth);
  return out;
}

/** A token set from texts. */
export function vocabularyOf(texts: Iterable<string>): Set<string> {
  const v = new Set<string>();
  for (const t of texts) for (const tok of tokensOf(t)) v.add(tok);
  return v;
}

/** The words of a schema: its property names and every enum value (and its type names). */
export function schemaWordsOf(schema: unknown): Set<string> {
  const words = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const n = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(n)) {
      if (k === "properties" && v && typeof v === "object") for (const p of Object.keys(v)) for (const t of tokensOf(p)) words.add(t);
      if (k === "enum" && Array.isArray(v)) for (const e of v) if (typeof e === "string") for (const t of tokensOf(e)) words.add(t);
      if (k === "required" && Array.isArray(v)) for (const e of v) if (typeof e === "string") for (const t of tokensOf(e)) words.add(t);
      walk(v);
    }
  };
  walk(schema);
  for (const t of ["object", "array", "string"]) words.add(t);
  return words;
}

/**
 * The modules whose string literals can reach a view model, a report or a
 * log line the bar reads: V is their words (fix round, lens 1 blocker:
 * built from four files, V left out the modules that write view text, so
 * the app's own words, R2's "a miss costs a day … missed days bunch
 * together", counted as the reply's). roadmap-validate.ts is NOT here: its
 * RULE_EXAMPLES and rule messages hold the hostile vocabulary itself
 * ("Genki textbook", "an ISBN"); only its renderable reasons go in
 * (renderableReasonsOf). Never roadmap-lexicon (the claim lists),
 * roadmap-model (the prompt) or roadmap-evidence (the pack).
 */
export const V_SOURCE_FILES: readonly string[] = [
  "src/components/roadmap/roadmap-copy.ts",
  "src/components/roadmap/roadmap-ui-model.ts",
  "src/components/roadmap/roadmap-labels.ts",
  "src/lib/roadmap-catalog.ts",
  "src/lib/roadmap-types.ts",
  "src/lib/roadmap-realism.ts",
  "src/lib/roadmap-server.ts",
  "src/lib/roadmap-pace.ts",
  "src/lib/roadmap-proficiency.ts",
  "src/lib/roadmap-quests.ts",
  "src/lib/roadmap-quests-server.ts",
  "src/lib/roadmap-invite.ts",
  "src/lib/roadmap-economy.ts",
  "src/lib/roadmap-measures.ts",
  "src/lib/roadmap-readings.ts",
];

/**
 * Words a hostile reply smuggles that the app never writes (roadmap-validate's
 * RULE_EXAMPLES and messages, the D family's payloads): V must hold none of
 * them, or the taint check is blind to them. A non-vacuity pin, not the
 * whole canon: the check guards the claim, resource, spend and credential
 * lists too (appVocabularyOf's `guarded`). Fix round 2 added the credential
 * and claim words V used to absorb: certified, accredited, diploma, official
 * and course.
 */
export const HOSTILE_CANON: readonly string[] = [
  "genki",
  "textbook",
  "isbn",
  "edition",
  "doctor",
  "injury",
  "weak",
  "spots",
  "curriculum",
  "bootcamp",
  "guaranteed",
  "kessler",
  "kestrel",
  "struggles",
  "beginner",
  "kolmogorov",
  "certified",
  "accredited",
  "diploma",
  "official",
  "course",
];

/** A constant whose name ends so is a word list: a matcher, never copy (fix round 2). */
export const WORD_LIST_NAME = /^[A-Z][A-Z0-9_]*_(?:WORDS|TERMS|PHRASES|CUES|STEMS|KEYWORDS)$/;

/**
 * The app's own sentences, for the guarded words only: where a guarded word
 * stands inside a run of two or more words of one of the app's literals (or
 * in a string equal to one whole), it is the app's own (taintHits). `whole`
 * holds every literal of two or more words, its words joined by one space; a
 * one-word literal exempts nothing.
 */
export interface OwnCopy {
  guarded: ReadonlySet<string>;
  phrases: ReadonlyMap<string, readonly (readonly string[])[]>;
  whole: ReadonlySet<string>;
  /** The app's CONSTANT_CASE literals ("SYLLABUS", "MANUAL", "EXAM_DAY"): a view value exactly one of them is an enum value, not text. */
  keys: ReadonlySet<string>;
}

/** Every word of a text as the guard reads it (every length; NFKC, lower case, format characters removed). */
export function wordsOf(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];
  return text.normalize("NFKC").replace(/[\p{Cf}]/gu, "").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

/** A literal's body as it renders: escapes decoded (\n, \t → a space; \uXXXX, \u{…}, \xXX → the character; \x → x). */
export function decodeEscapes(body: string): string {
  return body
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[nrtvbf]/g, " ")
    .replace(/\\(.)/g, "$1");
}

/** OwnCopy over these literals, for these guarded words. */
export function ownCopyOf(literals: Iterable<string>, guarded: Iterable<string>): OwnCopy {
  const g = new Set(guarded);
  const phrases = new Map<string, string[][]>();
  const whole = new Set<string>();
  const keys = new Set<string>();
  for (const lit of literals) {
    if (/^[A-Z][A-Z0-9_]*$/.test(lit)) keys.add(lit);
    const ws = wordsOf(decodeEscapes(lit));
    // A one-word literal in lower case ("required", "exam": a union member) exempts nothing: a view value equal to it may be the
    // reply's. Only its CONSTANT_CASE form, matched exactly (`keys`), is the app's enum value.
    if (ws.length < 2) continue;
    whole.add(ws.join(" "));
    for (const w of new Set(ws)) {
      if (!g.has(w)) continue;
      const list = phrases.get(w) ?? [];
      list.push(ws);
      phrases.set(w, list);
    }
  }
  return { guarded: g, phrases, whole, keys };
}

/** Whether every occurrence of `token` in `text` stands inside one of the app's own literals (OwnCopy). */
export function ownOccurrence(token: string, text: string, own: OwnCopy): boolean {
  if (!own.guarded.has(token)) return false;
  if (own.keys.has(text)) return true;
  const ws = wordsOf(text);
  if (own.whole.has(ws.join(" "))) return true;
  const covered = new Array<boolean>(ws.length).fill(false);
  for (const ph of own.phrases.get(token) ?? []) {
    for (let i = 0; i + ph.length <= ws.length; i++) {
      let k = 0;
      while (k < ph.length && ws[i + k] === ph[k]) k++;
      if (k === ph.length) for (let j = 0; j < ph.length; j++) covered[i + j] = true;
    }
  }
  return ws.every((w, i) => w !== token || covered[i]);
}

/** V's own words, file by file (missing files are listed, never silently skipped). */
export interface AppVocabulary {
  /** V: the copy's words, minus every guarded word. */
  vocabulary: Set<string>;
  /** The copy's words before the guard (word lists already left out). */
  raw: Set<string>;
  /** Where a guarded word is the app's own (taintHits). */
  own: OwnCopy;
  perFile: { file: string; words: number }[];
  missing: string[];
  /** The word lists left out of V, as "file: NAME". */
  wordLists: string[];
  /** The guarded words the app's own sentences hold (each occurrence there is the app's). */
  guardedInCopy: string[];
}

export function appVocabularyOf(readSource: (file: string) => string | null, reasons: Iterable<string>, guarded: Iterable<string> = HOSTILE_CANON): AppVocabulary {
  const reasonList = [...reasons];
  const raw = vocabularyOf(reasonList);
  const literals: string[] = [...reasonList];
  const perFile: { file: string; words: number }[] = [];
  const missing: string[] = [];
  const wordLists: string[] = [];
  for (const file of V_SOURCE_FILES) {
    const src = readSource(file);
    if (src == null) {
      missing.push(file);
      continue;
    }
    const lists: string[] = [];
    const lits = literalsOf(src, { skipWordLists: lists });
    for (const name of lists) wordLists.push(`${file.replace(/^.*\//, "")}: ${name}`);
    literals.push(...lits);
    const words = vocabularyOf(lits);
    for (const t of words) raw.add(t);
    perFile.push({ file, words: words.size });
  }
  const g = new Set([...guarded].flatMap((w) => tokensOf(w)));
  const vocabulary = new Set([...raw].filter((t) => !g.has(t)));
  return { vocabulary, raw, own: ownCopyOf(literals, g), perFile, missing, wordLists, guardedInCopy: [...g].filter((t) => raw.has(t)).sort() };
}

/** T: the reply's own tokens the app and the user never wrote. */
export function taintOf(raw: string, parsed: unknown, schemaWords: ReadonlySet<string>, vocabulary: ReadonlySet<string>): Set<string> {
  const t = new Set<string>();
  const add = (s: string) => {
    for (const tok of tokensOf(s)) if (!schemaWords.has(tok) && !vocabulary.has(tok)) t.add(tok);
  };
  // The parsed reply's keys and values; a reply too large to walk is read from its text.
  if (raw.length > 200_000) add(raw.slice(0, 200_000));
  else for (const s of stringsOf(parsed)) add(s.text);
  return t;
}

/** One taint hit: a token of T found at a path of a scanned value (in an object key, or a string value). */
export interface TaintHit {
  where: string;
  path: string;
  token: string;
  isKey: boolean;
  text: string;
}

/**
 * T's tokens found in a value (keys and string values), outside the pruned
 * subtrees. `structuralKeys` are the field names the app's own outputs use
 * (read off clean replies): a key equal to one of them is structure, not text.
 * `own`: a guarded word standing only inside the app's own sentences is the
 * app's (fix round 2; ownOccurrence).
 */
export function taintHits(where: string, value: unknown, taint: ReadonlySet<string>, skip?: (path: readonly string[], node: unknown) => boolean, structuralKeys?: ReadonlySet<string>, own?: OwnCopy): TaintHit[] {
  if (taint.size === 0) return [];
  const hits: TaintHit[] = [];
  scanStrings(
    value,
    (text, isKey, path) => {
      if (isKey && structuralKeys?.has(text)) return;
      let found: Set<string> | null = null;
      for (const tok of tokensOf(text)) {
        if (!taint.has(tok) || found?.has(tok)) continue;
        (found ??= new Set()).add(tok);
        if (own && !isKey && ownOccurrence(tok, text, own)) continue;
        hits.push({ where, path: path.join("."), token: tok, isKey, text });
      }
    },
    skip
  );
  return hits;
}

/** The field names of a value (every object key), for the structural-key allowlist. */
export function keysOf(value: unknown, into: Set<string>): Set<string> {
  for (const s of stringsOf(value)) if (s.isKey) into.add(s.text);
  return into;
}

/** Every property name a schema declares, at any depth (a report path may hold these and nothing else but indexes and "<extra>"). */
export function schemaKeysOf(schema: unknown, into = new Set<string>()): Set<string> {
  if (!schema || typeof schema !== "object") return into;
  const n = schema as Record<string, unknown>;
  if (n.properties && typeof n.properties === "object") {
    for (const [k, v] of Object.entries(n.properties as Record<string, unknown>)) {
      into.add(k);
      schemaKeysOf(v, into);
    }
  }
  if (n.items) schemaKeysOf(n.items, into);
  return into;
}

/** Every enum value a schema issues (the app's keys: D1, S3, RECALL_DRILLS …). */
export function schemaEnumsOf(schema: unknown, into = new Set<string>()): Set<string> {
  if (!schema || typeof schema !== "object") return into;
  const n = schema as Record<string, unknown>;
  if (Array.isArray(n.enum)) for (const e of n.enum) if (typeof e === "string") into.add(e);
  if (n.properties && typeof n.properties === "object") for (const v of Object.values(n.properties as Record<string, unknown>)) schemaEnumsOf(v, into);
  if (n.items) schemaEnumsOf(n.items, into);
  return into;
}

/** The index just past the `]` closing the array that opens at `open` (string literals skipped), or -1. */
function arrayEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i + 1;
  }
  return -1;
}

/**
 * The word lists of a source (comments already removed): each constant named
 * by WORD_LIST_NAME whose value is an array literal (or a Set of one), and
 * each `keywords: [...]` property (a catalog entry's matcher words). Returns
 * their [start, end) spans and names.
 */
export function wordListsOf(src: string): { name: string; start: number; end: number }[] {
  const out: { name: string; start: number; end: number }[] = [];
  const starts = [/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*(?::[^=;]*)?=\s*(?:new\s+Set\s*(?:<[^>]*>)?\s*\(\s*)?\[/g, /\b(keywords)\s*:\s*\[/g];
  for (const re of starts) {
    for (const m of src.matchAll(re)) {
      const name = m[1];
      if (name !== "keywords" && !WORD_LIST_NAME.test(name)) continue;
      const open = (m.index ?? 0) + m[0].length - 1;
      const end = arrayEnd(src, open);
      if (end > open) out.push({ name, start: open, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The string literals of a TypeScript source (comments removed): the app's
 * own words for V. Template literals are cut at their ${…} holes.
 * `skipWordLists` (fix round 2): leave out every word list (wordListsOf), and
 * push each one's name into the array given.
 */
export function literalsOf(source: string, opts?: { skipWordLists?: string[] }): string[] {
  let src = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  if (opts?.skipWordLists) {
    const lists = wordListsOf(src);
    let kept = "";
    let at = 0;
    for (const l of lists) {
      if (l.start < at) continue;
      kept += `${src.slice(at, l.start)}[]`;
      at = l.end;
      opts.skipWordLists.push(l.name);
    }
    src = kept + src.slice(at);
  }
  const out: string[] = [];
  for (const m of src.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g)) {
    const body = m[0].slice(1, -1);
    if (m[0][0] === "`") out.push(...body.split(/\$\{[^}]*\}/));
    else out.push(body);
  }
  return out;
}
