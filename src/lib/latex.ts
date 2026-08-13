import { create, all } from "mathjs";

const math = create(all);

/**
 * The LaTeX layer, shared by the authoring form and every read-only render.
 *
 * Two distinct jobs live here, and keeping them apart is the whole point:
 *
 *   **Prompts** are prose with math *spans* — `$...$` inline, `$$...$$`
 *   block. `segmentMath` splits them so KaTeX only ever sees what the author
 *   explicitly marked as math. Everything outside a span is passed through
 *   verbatim, which is what lets every pre-existing FORMULA prompt (all of
 *   which are plain English sentences with no `$` in them) keep rendering
 *   byte-for-byte unchanged.
 *
 *   **Answers** are graded, not displayed — `verifyFormula` proves
 *   equivalence by evaluating both sides at random points through mathjs, so
 *   the stored answer has to stay a mathjs expression. `latexToMathjs` lets
 *   an author type LaTeX anyway and normalises it back down; `toTexPreview`
 *   then renders it by round-tripping through mathjs's own `toTex()`.
 *
 * That round-trip is deliberate. Rendering the answer's raw source with
 * KaTeX would happily typeset something the grader cannot parse — a pretty
 * preview of an answer that will reject every correct response. Going
 * through `math.parse` means the preview only appears when the grader has
 * genuinely understood the expression, so the preview *is* the validation.
 */

// `$$...$$` first — otherwise the inline branch matches the empty string
// between the two opening dollars of a block span.
const MATH_SPAN = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

export interface MathSegment {
  /** Source text of this segment, including delimiters for math spans. */
  text: string;
  /** Absolute offset of `text` in the original string. */
  start: number;
  /** The LaTeX inside the delimiters, for math segments only. */
  latex?: string;
  display?: boolean;
}

export function segmentMath(source: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let last = 0;
  for (const match of source.matchAll(MATH_SPAN)) {
    const idx = match.index ?? 0;
    if (idx > last) segments.push({ text: source.slice(last, idx), start: last });
    const [whole, display, inline] = match;
    segments.push({ text: whole, start: idx, latex: display ?? inline, display: display !== undefined });
    last = idx + whole.length;
  }
  if (last < source.length) segments.push({ text: source.slice(last), start: last });
  return segments;
}

/**
 * Whether `pos` sits inside a `$...$` span.
 *
 * Drives the palette's auto-wrapping: inserting `\sum_{i=1}^{n}` into prose
 * has to bring its own `$...$` or it renders as literal backslash text,
 * while inserting it *inside* an existing span must not, or the span is torn
 * in half. Deciding that from the caret position is what makes the palette
 * behave the way anyone would expect it to.
 */
export function isInsideMathSpan(source: string, pos: number): boolean {
  for (const seg of segmentMath(source)) {
    if (seg.latex === undefined) continue;
    // Strictly inside the delimiters — the caret sitting against the outer
    // edge of a `$` counts as outside, so typing at a span's boundary starts
    // a new one rather than silently joining the old.
    const openLen = seg.display ? 2 : 1;
    if (pos > seg.start + openLen - 1 && pos < seg.start + seg.text.length - openLen + 1) return true;
  }
  return false;
}

// ============================================================================
// LaTeX -> mathjs
// ============================================================================

/** `\command` -> mathjs equivalent, for commands that map to a bare token. */
const COMMAND_TOKENS: Record<string, string> = {
  cdot: "*",
  times: "*",
  ast: "*",
  div: "/",
  pm: "+", // an answer can't be two-valued; the positive branch is the useful reading
  left: "",
  right: "",
  ",": "",
  ";": "",
  quad: "",
  qquad: "",
  displaystyle: "",
  limits: "",
  infty: "Infinity",
  pi: "pi",
  tau: "tau",
  ln: "log",
  lg: "log10",
  exp: "exp",
  det: "det",
};

/** Greek and function names mathjs already understands once the backslash is dropped. */
const PASSTHROUGH_COMMANDS = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta",
  "iota", "kappa", "lambda", "mu", "nu", "xi", "rho", "sigma", "upsilon", "phi", "varphi", "chi",
  "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega",
  "sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "coth", "log", "min", "max", "gcd", "abs", "floor", "ceil",
]);

/** Reads a `{...}` group starting at `i` (which must point at `{`). Returns its body and the index after `}`. */
function readGroup(src: string, i: number): { body: string; next: number } {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return { body: src.slice(i + 1, j), next: j + 1 };
    }
  }
  // Unbalanced — treat the rest as the body rather than throwing, so a
  // half-typed expression degrades instead of exploding mid-keystroke.
  return { body: src.slice(i + 1), next: src.length };
}

/** Reads an optional `[...]` argument (for `\sqrt[n]{x}`). */
function readOptional(src: string, i: number): { body: string | null; next: number } {
  if (src[i] !== "[") return { body: null, next: i };
  const close = src.indexOf("]", i);
  if (close === -1) return { body: null, next: i };
  return { body: src.slice(i + 1, close), next: close + 1 };
}

/** Reads a balanced `(...)` starting at `i`. */
function readParen(src: string, i: number): { body: string; next: number } | null {
  if (src[i] !== "(") return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")") {
      depth--;
      if (depth === 0) return { body: src.slice(i + 1, j), next: j + 1 };
    }
  }
  return null;
}

/**
 * Paired fence commands, and the mathjs function each one *means*.
 *
 * `\left| x \right|` is absolute value, not two stray pipes — dropping the
 * commands and leaving `| x |` produces something mathjs cannot parse at
 * all. Norm collapses to `abs` because the grader evaluates scalars.
 */
const FENCES: { open: string; close: string; fn: string }[] = [
  // `\left\|` must be tried before `\left|`, or the shorter pattern splits it.
  { open: "\\left\\|", close: "\\right\\|", fn: "abs" },
  { open: "\\lVert", close: "\\rVert", fn: "abs" },
  { open: "\\left|", close: "\\right|", fn: "abs" },
  { open: "\\lvert", close: "\\rvert", fn: "abs" },
  { open: "\\left\\lfloor", close: "\\right\\rfloor", fn: "floor" },
  { open: "\\lfloor", close: "\\rfloor", fn: "floor" },
  { open: "\\left\\lceil", close: "\\right\\rceil", fn: "ceil" },
  { open: "\\lceil", close: "\\rceil", fn: "ceil" },
];

/** Rewrites paired fences to function calls, innermost first. */
function foldFences(input: string): string {
  let src = input;
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    for (const f of FENCES) {
      const closeIdx = src.indexOf(f.close);
      if (closeIdx === -1) continue;
      // Last opener before the first closer is by definition the innermost pair.
      const openIdx = src.lastIndexOf(f.open, closeIdx - 1);
      if (openIdx === -1) continue;
      const body = src.slice(openIdx + f.open.length, closeIdx);
      src = `${src.slice(0, openIdx)}${f.fn}(${body})${src.slice(closeIdx + f.close.length)}`;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return src;
}

/** Functions where `\sin^{2}(x)` conventionally means `(sin x)^2`, not `sin(x^2)`. */
const POWERABLE_FUNCTIONS = new Set([
  "sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "coth", "log", "arcsin", "arccos", "arctan",
]);

/**
 * Converts a LaTeX expression to mathjs source.
 *
 * Covers the constructs the palette can produce and that an answer can
 * meaningfully be graded on — anything genuinely non-numeric (matrices,
 * `\cases`, alignment) is intentionally not handled, because there is no
 * expression for `verifyFormula` to evaluate at a random point anyway.
 *
 * Input that contains no backslash and no brace is returned untouched, so
 * every existing mathjs answer passes through this function unchanged.
 */
export function latexToMathjs(input: string): string {
  const stripped = input.trim().replace(/^\$\$?|\$\$?$/g, "").trim();
  if (!/[\\{}]/.test(stripped)) return stripped;
  const src = foldFences(stripped);

  let out = "";
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\\") {
      const nameMatch = /^\\([a-zA-Z]+|[,;])/.exec(src.slice(i));
      if (!nameMatch) {
        i++;
        continue;
      }
      const name = nameMatch[1];
      i += nameMatch[0].length;

      if (name === "frac" || name === "dfrac" || name === "tfrac") {
        while (src[i] === " ") i++;
        const num = readGroup(src, i);
        i = num.next;
        while (src[i] === " ") i++;
        const den = readGroup(src, i);
        i = den.next;
        out += `((${latexToMathjs(num.body)})/(${latexToMathjs(den.body)}))`;
        continue;
      }

      if (name === "sqrt") {
        while (src[i] === " ") i++;
        const opt = readOptional(src, i);
        i = opt.next;
        while (src[i] === " ") i++;
        const body = readGroup(src, i);
        i = body.next;
        out += opt.body
          ? `nthRoot(${latexToMathjs(body.body)}, ${latexToMathjs(opt.body)})`
          : `sqrt(${latexToMathjs(body.body)})`;
        continue;
      }

      if (name === "operatorname" || name === "mathrm" || name === "text" || name === "mathbf") {
        while (src[i] === " ") i++;
        const body = readGroup(src, i);
        i = body.next;
        out += body.body.trim();
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(COMMAND_TOKENS, name)) {
        out += COMMAND_TOKENS[name];
        continue;
      }

      if (PASSTHROUGH_COMMANDS.has(name)) {
        // `\sin^{2}(x)` is standard notation for `(sin x)^2`. Emitting it in
        // source order gives `sin^(2)(x)`, which mathjs reads as raising the
        // *function itself* to a power and rejects at evaluation time.
        if (POWERABLE_FUNCTIONS.has(name) && src[i] === "^") {
          let j = i + 1;
          while (src[j] === " ") j++;
          let power: string;
          if (src[j] === "{") {
            const g = readGroup(src, j);
            power = latexToMathjs(g.body);
            j = g.next;
          } else {
            power = src[j] ?? "";
            j++;
          }
          while (src[j] === " ") j++;
          const arg = readParen(src, j);
          if (arg) {
            out += `${name}(${latexToMathjs(arg.body)})^(${power})`;
            i = arg.next;
            continue;
          }
          // No parenthesised argument (`\sin^2 \theta`) — fall through and
          // let the normal path handle it rather than guessing where the
          // argument ends.
        }
        out += name;
        continue;
      }

      // Unknown command — drop the backslash and keep the name. mathjs will
      // reject it if it isn't a real symbol, which surfaces as a parse error
      // in the preview rather than a silently wrong answer.
      out += name;
      continue;
    }

    if (ch === "^" || ch === "_") {
      i++;
      while (src[i] === " ") i++;
      let body: string;
      if (src[i] === "{") {
        const g = readGroup(src, i);
        body = latexToMathjs(g.body);
        i = g.next;
      } else {
        body = src[i] ?? "";
        i++;
      }
      // A subscript is part of the *name* (`a_1` is the variable `a1`, which
      // is exactly how this app's own seeded answers spell it), never an
      // operation.
      out += ch === "^" ? `^(${body})` : body;
      continue;
    }

    if (ch === "{" ) {
      const g = readGroup(src, i);
      out += `(${latexToMathjs(g.body)})`;
      i = g.next;
      continue;
    }

    if (ch === "}") {
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out.trim();
}

// ============================================================================
// Preview
// ============================================================================

export type ExpressionPreview =
  | { ok: true; tex: string; mathjs: string; variables: string[] }
  | { ok: false; error: string };

/**
 * Normalises an answer expression and renders it back as LaTeX.
 *
 * `ok: false` is the honest signal that `verifyFormula` would fail to parse
 * this answer — the same `math.parse` call, so the preview cannot disagree
 * with the grader.
 */
export function previewExpression(input: string): ExpressionPreview {
  const source = latexToMathjs(input);
  if (!source.trim()) return { ok: false, error: "Empty expression." };
  try {
    const node = math.parse(source);
    const variables = new Set<string>();
    node.filter((n) => n.type === "SymbolNode").forEach((n) => {
      const name = (n as unknown as { name: string }).name;
      if (!(name in math)) variables.add(name);
    });
    return { ok: true, tex: node.toTex(), mathjs: source, variables: [...variables] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not a valid expression." };
  }
}
