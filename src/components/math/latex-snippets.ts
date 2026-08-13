/**
 * The lookup palette's contents — grouped LaTeX snippets for the equation
 * field. `‸` marks where the cursor lands after insertion; stripped before
 * the snippet reaches the textarea.
 *
 * Scoped to what this app's own FORMULA Ideas actually use (dot products,
 * norms, Bayes' theorem, exponential decay, the power rule — see
 * prisma/seed.ts's Mathematics & Statistics field) rather than a exhaustive
 * LaTeX command reference. A lookup that shows 200 rarely-needed commands is
 * harder to scan than one that shows the 30 an author here will actually
 * reach for.
 */

export interface LatexSnippet {
  /** What the button shows. Unicode glyph where one exists — recognisable at a glance, no tooltip required. */
  glyph: string;
  /** The LaTeX command itself, shown on hover — the "lookup" half of the picker. */
  command: string;
  /** Inserted at the cursor. `‸` marks where the cursor lands afterward. */
  insert: string;
}

export interface LatexGroup {
  label: string;
  snippets: LatexSnippet[];
}

export const LATEX_GROUPS: LatexGroup[] = [
  {
    label: "Structures",
    snippets: [
      { glyph: "a/b", command: "\\frac{a}{b}", insert: "\\frac{‸}{}" },
      { glyph: "√", command: "\\sqrt{x}", insert: "\\sqrt{‸}" },
      { glyph: "ⁿ√", command: "\\sqrt[n]{x}", insert: "\\sqrt[n]{‸}" },
      { glyph: "xʸ", command: "x^{y}", insert: "^{‸}" },
      { glyph: "xᵧ", command: "x_{y}", insert: "_{‸}" },
      { glyph: "|x|", command: "\\left|x\\right|", insert: "\\left|‸\\right|" },
      { glyph: "x⃗", command: "\\vec{x}", insert: "\\vec{‸}" },
      { glyph: "x̄", command: "\\bar{x}", insert: "\\bar{‸}" },
    ],
  },
  {
    label: "Calculus",
    snippets: [
      { glyph: "Σ", command: "\\sum_{i=1}^{n}", insert: "\\sum_{i=1}^{n} ‸" },
      { glyph: "Π", command: "\\prod_{i=1}^{n}", insert: "\\prod_{i=1}^{n} ‸" },
      { glyph: "∫", command: "\\int_{a}^{b}", insert: "\\int_{a}^{b} ‸ \\, dx" },
      { glyph: "lim", command: "\\lim_{x \\to a}", insert: "\\lim_{x \\to ‸}" },
      { glyph: "d/dx", command: "\\frac{d}{dx}", insert: "\\frac{d}{dx}‸" },
      { glyph: "∂", command: "\\partial", insert: "\\partial ‸" },
    ],
  },
  {
    label: "Relations",
    snippets: [
      { glyph: "≤", command: "\\leq", insert: "\\leq ‸" },
      { glyph: "≥", command: "\\geq", insert: "\\geq ‸" },
      { glyph: "≠", command: "\\neq", insert: "\\neq ‸" },
      { glyph: "≈", command: "\\approx", insert: "\\approx ‸" },
      { glyph: "±", command: "\\pm", insert: "\\pm ‸" },
      { glyph: "×", command: "\\times", insert: "\\times ‸" },
      { glyph: "÷", command: "\\div", insert: "\\div ‸" },
      { glyph: "·", command: "\\cdot", insert: "\\cdot ‸" },
      { glyph: "→", command: "\\to", insert: "\\to ‸" },
      { glyph: "∞", command: "\\infty", insert: "\\infty ‸" },
    ],
  },
  {
    label: "Greek",
    snippets: [
      { glyph: "α", command: "\\alpha", insert: "\\alpha ‸" },
      { glyph: "β", command: "\\beta", insert: "\\beta ‸" },
      { glyph: "γ", command: "\\gamma", insert: "\\gamma ‸" },
      { glyph: "δ", command: "\\delta", insert: "\\delta ‸" },
      { glyph: "Δ", command: "\\Delta", insert: "\\Delta ‸" },
      { glyph: "ε", command: "\\epsilon", insert: "\\epsilon ‸" },
      { glyph: "θ", command: "\\theta", insert: "\\theta ‸" },
      { glyph: "λ", command: "\\lambda", insert: "\\lambda ‸" },
      { glyph: "μ", command: "\\mu", insert: "\\mu ‸" },
      { glyph: "π", command: "\\pi", insert: "\\pi ‸" },
      { glyph: "σ", command: "\\sigma", insert: "\\sigma ‸" },
      { glyph: "Σ", command: "\\Sigma", insert: "\\Sigma ‸" },
      { glyph: "φ", command: "\\phi", insert: "\\phi ‸" },
      { glyph: "ω", command: "\\omega", insert: "\\omega ‸" },
    ],
  },
];

export const CURSOR_MARK = "‸";

/** Splices `snippet` into `value` at `[start, end)`, resolving `‸` to a caret position. */
export function insertLatexSnippet(
  value: string,
  start: number,
  end: number,
  snippet: string
): { next: string; cursor: number } {
  const markIndex = snippet.indexOf(CURSOR_MARK);
  const clean = snippet.replace(CURSOR_MARK, "");
  const next = value.slice(0, start) + clean + value.slice(end);
  const cursor = start + (markIndex === -1 ? clean.length : markIndex);
  return { next, cursor };
}
