import { compareTwoStrings } from "string-similarity";

/**
 * SHORT answers: how a typed answer is compared with the stored one, and the
 * list syntax an author can write in the answer field.
 *
 * Plain answer — compared after normalising: Unicode form, curly quotes,
 * spacing and surrounding punctuation never matter; capitals don't either
 * unless the idea was saved as case sensitive. Within that, a typo passes
 * on similarity (Dice coefficient over 0.85).
 *
 *   naked forex                    one answer
 *   [naked forex, mindfulness trading]
 *                                  a list: every part must appear, any order
 *   2 of [red, green, blue]        a list: any 2 of the parts
 *   \[citation needed]             a leading backslash keeps brackets literal
 *   [Smith\, J., Jones\, K.]       \, is a comma inside a part
 *
 * A list is graded on what the person typed as a whole: it is split on
 * commas, semicolons, slashes, "&", "+", line breaks and " and ", and each
 * part is claimed by at most one piece (so one name typed twice is one part).
 * A part also counts when it appears word for word anywhere in the answer,
 * so "naked forex then mindfulness trading" passes, and so does a part that
 * itself contains "and". Extra words or extra items never fail an answer.
 */

export const SHORT_PASS_THRESHOLD = 0.85;

export type ShortAnswerSpec =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[]; need: number };

export interface ShortGradeOptions {
  /** Capitals must match. Off by default. */
  caseSensitive?: boolean;
}

const LIST_PATTERN = /^(?:(\d+)\s+of\s+)?\[([\s\S]*)\]$/i;

/**
 * Splits a list body on unescaped commas; `\,` stays a comma inside a part.
 * Empty parts are dropped ("[a, , b]" is two parts).
 */
function splitItems(body: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\" && body[i + 1] === ",") {
      cur += ",";
      i++;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * What a stored SHORT answer asks for. Brackets make a list only with two or
 * more parts; "[x]" or "[]" is the literal text, as is anything after a
 * leading backslash. "N of" outside 1..parts is treated as "all of them"
 * here — the form refuses it before it is saved (shortAnswerProblem).
 */
export function parseShortAnswer(stored: string): ShortAnswerSpec {
  const raw = stored.trim();
  if (raw.startsWith("\\[")) return { kind: "text", text: raw.slice(1) };
  const m = LIST_PATTERN.exec(raw);
  if (!m) return { kind: "text", text: raw };
  const items = splitItems(m[2]);
  if (items.length < 2) return { kind: "text", text: raw };
  const n = m[1] === undefined ? items.length : Number(m[1]);
  const need = Number.isInteger(n) && n >= 1 && n <= items.length ? n : items.length;
  return { kind: "list", items, need };
}

/** Why an answer can't be saved as written, or null. For the add and edit forms. */
export function shortAnswerProblem(stored: string): string | null {
  const raw = stored.trim();
  if (raw.startsWith("\\[")) return null;
  const m = LIST_PATTERN.exec(raw);
  if (!m) return null;
  const items = splitItems(m[2]);
  if (items.length < 2) return null;
  if (m[1] !== undefined) {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1 || n > items.length) {
      return `"${m[1]} of" needs a number from 1 to ${items.length} (the parts in the brackets).`;
    }
  }
  const seen = new Set<string>();
  for (const item of items) {
    const key = normalizeAnswer(item, false);
    if (seen.has(key)) return `"${item}" is in the list twice.`;
    seen.add(key);
  }
  return null;
}

/** One line for the form: how this answer will be graded. */
export function shortAnswerRule(stored: string, caseSensitive = false): string | null {
  const spec = parseShortAnswer(stored);
  const caps = caseSensitive ? "Capitals must match." : "Capitals don't matter.";
  if (spec.kind === "text") return spec.text ? `Graded as one answer; small typos pass. ${caps}` : null;
  const which = spec.need === spec.items.length ? (spec.items.length === 2 ? "both parts" : `all ${spec.items.length} parts`) : `any ${spec.need} of the ${spec.items.length} parts`;
  return `Graded as a list: ${which}, in any order. ${caps}`;
}

/** The stored answer as a person reads it (results, library). */
export function displayShortAnswer(stored: string): string {
  const spec = parseShortAnswer(stored);
  if (spec.kind === "text") return spec.text;
  const list = spec.items.join(", ");
  return spec.need === spec.items.length ? `${list} (any order)` : `any ${spec.need} of: ${list}`;
}

/**
 * Text as compared: NFKC, straight quotes, dashes as hyphens, one space
 * between words, no punctuation at either end, lower case unless capitals
 * matter.
 */
export function normalizeAnswer(s: string, caseSensitive: boolean): string {
  let t = s
    .normalize("NFKC")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'`.,;:!?()[\]{}*_-]+|[\s"'`.,;:!?()[\]{}*_-]+$/g, "");
  if (!caseSensitive) t = t.toLocaleLowerCase();
  return t;
}

/**
 * Two normalised strings, the same answer? Equal passes; otherwise a typo
 * passes on similarity. Case sensitive: similarity is still measured on the
 * case-folded text (a typo is a typo), but a difference in capitals alone,
 * or a typo plus wrong capitals, fails.
 */
function same(given: string, expected: string, caseSensitive: boolean): boolean {
  if (given === expected) return true;
  if (!given || !expected) return false;
  if (!caseSensitive) return compareTwoStrings(given, expected) > SHORT_PASS_THRESHOLD;
  const g = given.toLocaleLowerCase();
  const e = expected.toLocaleLowerCase();
  if (g === e) return false; // only the capitals differ
  return compareTwoStrings(given, expected) > SHORT_PASS_THRESHOLD && compareTwoStrings(g, e) > SHORT_PASS_THRESHOLD;
}

const PIECE_SPLIT = /\s*(?:[,;/&+\n•·|]|\band\b|\bthen\b)\s*/i;

/** Pieces of a typed list, with any leading "1." / "2)" / "-" bullet dropped. */
function pieces(typed: string): string[] {
  return typed
    .split(PIECE_SPLIT)
    .map((p) => p.replace(/^\s*(?:\d+[.)]|[-*])\s+/, ""))
    .map((p) => p.trim())
    .filter(Boolean);
}

/** `needle` appears in `hay` as whole words (both already normalised). */
function containsWords(hay: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : hay[at - 1];
    const after = hay[at + needle.length] ?? "";
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    from = at + 1;
  }
}

/** How many of the list's parts the typed answer names, each part counted once. */
export function countListMatches(typed: string, items: readonly string[], caseSensitive = false): number {
  const whole = normalizeAnswer(typed, caseSensitive);
  const left = pieces(typed).map((p) => normalizeAnswer(p, caseSensitive));
  // Longer parts first, so "mindfulness trading" isn't claimed by a piece meant for "trading".
  const wanted = items.map((it) => normalizeAnswer(it, caseSensitive)).sort((a, b) => b.length - a.length);
  let found = 0;
  for (const item of wanted) {
    const idx = left.findIndex((p) => same(p, item, caseSensitive));
    if (idx !== -1) {
      left.splice(idx, 1);
      found++;
    } else if (containsWords(whole, item)) {
      found++;
    }
  }
  return found;
}

/** One typed answer against one expected text, no list syntax (a cloze blank, a LIST item). */
export function matchesText(typed: string, expected: string, opts: ShortGradeOptions = {}): boolean {
  const cs = opts.caseSensitive === true;
  return same(normalizeAnswer(typed, cs), normalizeAnswer(expected, cs), cs);
}

/** The SHORT grader: the typed answer against the stored one, list syntax included. */
export function gradeShortAnswer(typed: string, stored: string, opts: ShortGradeOptions = {}): boolean {
  const spec = parseShortAnswer(stored);
  if (spec.kind === "list") return countListMatches(typed, spec.items, opts.caseSensitive === true) >= spec.need;
  return matchesText(typed, spec.text, opts);
}
