/**
 * Editor mechanics for the equation fields: bracket auto-closing and LaTeX
 * tokenising.
 *
 * Both are pure string functions, deliberately kept out of the React
 * components. Caret arithmetic is the easiest thing in this feature to get
 * subtly wrong — off by one, or right in the simple case and wrong when
 * there's a selection — and it is far cheaper to prove correct against a
 * table of cases than by clicking around a textarea.
 */

// ============================================================================
// Auto-close
// ============================================================================

/** Openers and the closer each one inserts. */
const PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

/** Characters that both open and close, so the decision depends on context. */
const SYMMETRIC = new Set(["$"]);

const CLOSERS = new Set([...Object.values(PAIRS), ...SYMMETRIC]);

export interface EditState {
  value: string;
  /** Caret, or selection start. */
  start: number;
  /** Selection end; equal to `start` when nothing is selected. */
  end: number;
}

export interface EditResult {
  value: string;
  /** Where the caret lands. */
  start: number;
  end: number;
}

/**
 * Handles a single typed character, returning the edit to apply — or `null`
 * to let the browser insert it normally.
 *
 * Three behaviours, in the order they're checked:
 *
 *   1. **Wrap a selection.** Typing `(` with text selected surrounds it
 *      rather than replacing it, which is the one case where the default
 *      browser behaviour actively destroys work.
 *   2. **Type through a closer.** With the caret at `(x|)`, typing `)`
 *      steps over the existing one instead of producing `(x)|)`. Without
 *      this, auto-closing makes every expression end in a pile of surplus
 *      brackets.
 *   3. **Auto-close an opener.** `(` becomes `()` with the caret inside.
 */
export function handleAutoClose(state: EditState, key: string): EditResult | null {
  const { value, start, end } = state;
  const hasSelection = end > start;
  const closer = PAIRS[key];
  const isSymmetric = SYMMETRIC.has(key);

  if (hasSelection && (closer || isSymmetric)) {
    const selected = value.slice(start, end);
    const right = closer ?? key;
    return {
      value: value.slice(0, start) + key + selected + right + value.slice(end),
      // Keep the selection over the original text, now surrounded — so a
      // second bracket press wraps again rather than starting over.
      start: start + 1,
      end: end + 1,
    };
  }

  if (!hasSelection && CLOSERS.has(key) && value[start] === key) {
    return { value, start: start + 1, end: start + 1 };
  }

  if (!hasSelection && (closer || isSymmetric)) {
    const right = closer ?? key;
    return {
      value: value.slice(0, start) + key + right + value.slice(start),
      start: start + 1,
      end: start + 1,
    };
  }

  return null;
}

/**
 * Backspace between a freshly-auto-closed pair removes both halves.
 *
 * Only when the two are directly adjacent — `{|}` — so deleting inside
 * `{ x |}` behaves normally. Returns `null` to fall through to the default.
 */
export function handleAutoDelete(state: EditState): EditResult | null {
  const { value, start, end } = state;
  if (end !== start || start === 0) return null;
  const before = value[start - 1];
  const after = value[start];
  const expected = PAIRS[before] ?? (SYMMETRIC.has(before) ? before : undefined);
  if (expected === undefined || after !== expected) return null;
  return { value: value.slice(0, start - 1) + value.slice(start + 1), start: start - 1, end: start - 1 };
}

// ============================================================================
// Tokenising
// ============================================================================

export type LatexTokenKind =
  | "text"
  | "delimiter"
  | "command"
  | "brace"
  | "script"
  | "number"
  | "comment";

export interface LatexToken {
  kind: LatexTokenKind;
  text: string;
}

/**
 * Splits LaTeX source into coloured spans for the editor overlay.
 *
 * Intentionally a lexer and not a parser: the input is being *typed*, so it
 * is invalid far more often than it is valid, and a highlighter that only
 * works on complete expressions would spend most of its life showing
 * nothing. Every branch here consumes at least one character, so unbalanced
 * or half-finished input still tokenises to the end.
 */
export function tokenizeLatex(source: string): LatexToken[] {
  const tokens: LatexToken[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (ch === "%") {
      flush();
      const nl = source.indexOf("\n", i);
      const stop = nl === -1 ? source.length : nl;
      tokens.push({ kind: "comment", text: source.slice(i, stop) });
      i = stop;
      continue;
    }

    if (ch === "$") {
      flush();
      const double = source[i + 1] === "$";
      tokens.push({ kind: "delimiter", text: double ? "$$" : "$" });
      i += double ? 2 : 1;
      continue;
    }

    if (ch === "\\") {
      flush();
      // `\\` is a row break, and `\{`/`\|` are escaped literals — all are
      // two-character tokens that must not be read as a command name.
      const next = source[i + 1];
      if (next !== undefined && !/[a-zA-Z]/.test(next)) {
        tokens.push({ kind: "command", text: source.slice(i, i + 2) });
        i += 2;
        continue;
      }
      const m = /^\\[a-zA-Z]+/.exec(source.slice(i));
      if (m) {
        tokens.push({ kind: "command", text: m[0] });
        i += m[0].length;
        continue;
      }
      tokens.push({ kind: "command", text: ch });
      i++;
      continue;
    }

    if (ch === "{" || ch === "}" || ch === "[" || ch === "]") {
      flush();
      tokens.push({ kind: "brace", text: ch });
      i++;
      continue;
    }

    if (ch === "^" || ch === "_" || ch === "&") {
      flush();
      tokens.push({ kind: "script", text: ch });
      i++;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      flush();
      const m = /^[0-9]*\.?[0-9]+/.exec(source.slice(i))!;
      tokens.push({ kind: "number", text: m[0] });
      i += m[0].length;
      continue;
    }

    buffer += ch;
    i++;
  }

  flush();
  return tokens;
}
