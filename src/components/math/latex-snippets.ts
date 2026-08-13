/**
 * The lookup palette: a broad LaTeX reference for the equation fields.
 *
 * Scope is *mathematical notation an author here might reasonably need*,
 * organised so it can be scanned rather than searched — fourteen groups, one
 * visible at a time, each small enough to read at a glance. The earlier
 * version carried 38 commands chosen from this app's own seeded Ideas, which
 * covered those Ideas and nothing else: no matrices, no set theory, no
 * logic, no inverse trig, barely any relations. Anyone writing outside
 * linear algebra and basic calculus hit the end of it immediately.
 *
 * `‸` marks where the caret lands after insertion, so a template like
 * `\frac{}{}` drops you inside the numerator instead of after the whole
 * thing. Stripped before the text reaches the field.
 *
 * A note on what is *not* here: environments that describe layout rather
 * than a value (`aligned`, `array`, `cases`) are offered for prompts, where
 * they render, but an answer built from them has nothing for the grader to
 * evaluate at a random point — see `verifyFormula`. The answer field says so
 * rather than silently accepting one.
 */

export interface LatexSnippet {
  /** What the button shows — the rendered glyph where one exists, so the palette reads as notation rather than as code. */
  glyph: string;
  /** The command itself, shown on hover and used as the accessible name. This is the "lookup" half. */
  command: string;
  /** Inserted at the caret. `‸` marks the resulting caret position. */
  insert: string;
}

export interface LatexGroup {
  label: string;
  snippets: LatexSnippet[];
}

export const LATEX_GROUPS: LatexGroup[] = [
  {
    label: "Structure",
    snippets: [
      { glyph: "a⁄b", command: "\\frac{a}{b}", insert: "\\frac{‸}{}" },
      { glyph: "√", command: "\\sqrt{x}", insert: "\\sqrt{‸}" },
      { glyph: "ⁿ√", command: "\\sqrt[n]{x}", insert: "\\sqrt[n]{‸}" },
      { glyph: "xⁿ", command: "x^{n}", insert: "^{‸}" },
      { glyph: "xₙ", command: "x_{n}", insert: "_{‸}" },
      { glyph: "xⁿₙ", command: "x_{a}^{b}", insert: "_{‸}^{}" },
      { glyph: "|x|", command: "\\left|x\\right|", insert: "\\left|‸\\right|" },
      { glyph: "‖x‖", command: "\\left\\|x\\right\\|", insert: "\\left\\|‸\\right\\|" },
      { glyph: "(ⁿₖ)", command: "\\binom{n}{k}", insert: "\\binom{‸}{}" },
      { glyph: "x̄", command: "\\overline{x}", insert: "\\overline{‸}" },
      { glyph: "x̲", command: "\\underline{x}", insert: "\\underline{‸}" },
      { glyph: "Abc", command: "\\text{words}", insert: "\\text{‸}" },
    ],
  },
  {
    label: "Operators",
    snippets: [
      { glyph: "Σ", command: "\\sum_{i=1}^{n}", insert: "\\sum_{i=1}^{n} ‸" },
      { glyph: "Π", command: "\\prod_{i=1}^{n}", insert: "\\prod_{i=1}^{n} ‸" },
      { glyph: "∐", command: "\\coprod_{i=1}^{n}", insert: "\\coprod_{i=1}^{n} ‸" },
      { glyph: "∫", command: "\\int_{a}^{b}", insert: "\\int_{a}^{b} ‸ \\, dx" },
      { glyph: "∬", command: "\\iint", insert: "\\iint_{‸} " },
      { glyph: "∭", command: "\\iiint", insert: "\\iiint_{‸} " },
      { glyph: "∮", command: "\\oint", insert: "\\oint_{‸} " },
      { glyph: "⋃", command: "\\bigcup_{i=1}^{n}", insert: "\\bigcup_{i=1}^{n} ‸" },
      { glyph: "⋂", command: "\\bigcap_{i=1}^{n}", insert: "\\bigcap_{i=1}^{n} ‸" },
      { glyph: "lim", command: "\\lim_{x \\to a}", insert: "\\lim_{x \\to ‸}" },
      { glyph: "sup", command: "\\sup_{x}", insert: "\\sup_{‸}" },
      { glyph: "inf", command: "\\inf_{x}", insert: "\\inf_{‸}" },
    ],
  },
  {
    label: "Calculus",
    snippets: [
      { glyph: "d⁄dx", command: "\\frac{d}{dx}", insert: "\\frac{d}{d‸}" },
      { glyph: "df⁄dx", command: "\\frac{df}{dx}", insert: "\\frac{d‸}{dx}" },
      { glyph: "∂⁄∂x", command: "\\frac{\\partial}{\\partial x}", insert: "\\frac{\\partial ‸}{\\partial x}" },
      { glyph: "d²⁄dx²", command: "\\frac{d^{2}}{dx^{2}}", insert: "\\frac{d^{2}‸}{dx^{2}}" },
      { glyph: "∂", command: "\\partial", insert: "\\partial ‸" },
      { glyph: "∇", command: "\\nabla", insert: "\\nabla ‸" },
      { glyph: "f′", command: "f'(x)", insert: "'‸" },
      { glyph: "ẋ", command: "\\dot{x}", insert: "\\dot{‸}" },
      { glyph: "ẍ", command: "\\ddot{x}", insert: "\\ddot{‸}" },
      { glyph: "dx", command: "\\, dx", insert: "\\, d‸" },
      { glyph: "Δ", command: "\\Delta", insert: "\\Delta ‸" },
      { glyph: "→a", command: "\\to a", insert: "\\to ‸" },
    ],
  },
  {
    label: "Functions",
    snippets: [
      { glyph: "sin", command: "\\sin", insert: "\\sin ‸" },
      { glyph: "cos", command: "\\cos", insert: "\\cos ‸" },
      { glyph: "tan", command: "\\tan", insert: "\\tan ‸" },
      { glyph: "sec", command: "\\sec", insert: "\\sec ‸" },
      { glyph: "csc", command: "\\csc", insert: "\\csc ‸" },
      { glyph: "cot", command: "\\cot", insert: "\\cot ‸" },
      { glyph: "sin⁻¹", command: "\\arcsin", insert: "\\arcsin ‸" },
      { glyph: "cos⁻¹", command: "\\arccos", insert: "\\arccos ‸" },
      { glyph: "tan⁻¹", command: "\\arctan", insert: "\\arctan ‸" },
      { glyph: "sinh", command: "\\sinh", insert: "\\sinh ‸" },
      { glyph: "cosh", command: "\\cosh", insert: "\\cosh ‸" },
      { glyph: "tanh", command: "\\tanh", insert: "\\tanh ‸" },
      { glyph: "log", command: "\\log", insert: "\\log ‸" },
      { glyph: "logₐ", command: "\\log_{b}", insert: "\\log_{‸}" },
      { glyph: "ln", command: "\\ln", insert: "\\ln ‸" },
      { glyph: "exp", command: "\\exp", insert: "\\exp ‸" },
      { glyph: "min", command: "\\min", insert: "\\min ‸" },
      { glyph: "max", command: "\\max", insert: "\\max ‸" },
      { glyph: "gcd", command: "\\gcd", insert: "\\gcd ‸" },
      { glyph: "det", command: "\\det", insert: "\\det ‸" },
    ],
  },
  {
    label: "Relations",
    snippets: [
      { glyph: "=", command: "=", insert: "= ‸" },
      { glyph: "≠", command: "\\neq", insert: "\\neq ‸" },
      { glyph: "<", command: "<", insert: "< ‸" },
      { glyph: ">", command: ">", insert: "> ‸" },
      { glyph: "≤", command: "\\leq", insert: "\\leq ‸" },
      { glyph: "≥", command: "\\geq", insert: "\\geq ‸" },
      { glyph: "≪", command: "\\ll", insert: "\\ll ‸" },
      { glyph: "≫", command: "\\gg", insert: "\\gg ‸" },
      { glyph: "≈", command: "\\approx", insert: "\\approx ‸" },
      { glyph: "≡", command: "\\equiv", insert: "\\equiv ‸" },
      { glyph: "∼", command: "\\sim", insert: "\\sim ‸" },
      { glyph: "≃", command: "\\simeq", insert: "\\simeq ‸" },
      { glyph: "≅", command: "\\cong", insert: "\\cong ‸" },
      { glyph: "∝", command: "\\propto", insert: "\\propto ‸" },
      { glyph: "≐", command: "\\doteq", insert: "\\doteq ‸" },
    ],
  },
  {
    label: "Arithmetic",
    snippets: [
      { glyph: "+", command: "+", insert: "+ ‸" },
      { glyph: "−", command: "-", insert: "- ‸" },
      { glyph: "×", command: "\\times", insert: "\\times ‸" },
      { glyph: "÷", command: "\\div", insert: "\\div ‸" },
      { glyph: "·", command: "\\cdot", insert: "\\cdot ‸" },
      { glyph: "±", command: "\\pm", insert: "\\pm ‸" },
      { glyph: "∓", command: "\\mp", insert: "\\mp ‸" },
      { glyph: "∗", command: "\\ast", insert: "\\ast ‸" },
      { glyph: "⋆", command: "\\star", insert: "\\star ‸" },
      { glyph: "∘", command: "\\circ", insert: "\\circ ‸" },
      { glyph: "⊕", command: "\\oplus", insert: "\\oplus ‸" },
      { glyph: "⊗", command: "\\otimes", insert: "\\otimes ‸" },
      { glyph: "⊙", command: "\\odot", insert: "\\odot ‸" },
      { glyph: "%", command: "\\%", insert: "\\% ‸" },
    ],
  },
  {
    label: "Sets",
    snippets: [
      { glyph: "∈", command: "\\in", insert: "\\in ‸" },
      { glyph: "∉", command: "\\notin", insert: "\\notin ‸" },
      { glyph: "∋", command: "\\ni", insert: "\\ni ‸" },
      { glyph: "⊂", command: "\\subset", insert: "\\subset ‸" },
      { glyph: "⊆", command: "\\subseteq", insert: "\\subseteq ‸" },
      { glyph: "⊃", command: "\\supset", insert: "\\supset ‸" },
      { glyph: "⊇", command: "\\supseteq", insert: "\\supseteq ‸" },
      { glyph: "∪", command: "\\cup", insert: "\\cup ‸" },
      { glyph: "∩", command: "\\cap", insert: "\\cap ‸" },
      { glyph: "∖", command: "\\setminus", insert: "\\setminus ‸" },
      { glyph: "∅", command: "\\emptyset", insert: "\\emptyset ‸" },
      { glyph: "ℝ", command: "\\mathbb{R}", insert: "\\mathbb{R}‸" },
      { glyph: "ℕ", command: "\\mathbb{N}", insert: "\\mathbb{N}‸" },
      { glyph: "ℤ", command: "\\mathbb{Z}", insert: "\\mathbb{Z}‸" },
      { glyph: "ℚ", command: "\\mathbb{Q}", insert: "\\mathbb{Q}‸" },
      { glyph: "ℂ", command: "\\mathbb{C}", insert: "\\mathbb{C}‸" },
    ],
  },
  {
    label: "Logic",
    snippets: [
      { glyph: "∀", command: "\\forall", insert: "\\forall ‸" },
      { glyph: "∃", command: "\\exists", insert: "\\exists ‸" },
      { glyph: "∄", command: "\\nexists", insert: "\\nexists ‸" },
      { glyph: "¬", command: "\\neg", insert: "\\neg ‸" },
      { glyph: "∧", command: "\\land", insert: "\\land ‸" },
      { glyph: "∨", command: "\\lor", insert: "\\lor ‸" },
      { glyph: "⟹", command: "\\implies", insert: "\\implies ‸" },
      { glyph: "⟸", command: "\\impliedby", insert: "\\impliedby ‸" },
      { glyph: "⟺", command: "\\iff", insert: "\\iff ‸" },
      { glyph: "∴", command: "\\therefore", insert: "\\therefore ‸" },
      { glyph: "∵", command: "\\because", insert: "\\because ‸" },
      { glyph: "⊨", command: "\\models", insert: "\\models ‸" },
    ],
  },
  {
    label: "Arrows",
    snippets: [
      { glyph: "→", command: "\\to", insert: "\\to ‸" },
      { glyph: "←", command: "\\gets", insert: "\\gets ‸" },
      { glyph: "↔", command: "\\leftrightarrow", insert: "\\leftrightarrow ‸" },
      { glyph: "⇒", command: "\\Rightarrow", insert: "\\Rightarrow ‸" },
      { glyph: "⇐", command: "\\Leftarrow", insert: "\\Leftarrow ‸" },
      { glyph: "⇔", command: "\\Leftrightarrow", insert: "\\Leftrightarrow ‸" },
      { glyph: "↦", command: "\\mapsto", insert: "\\mapsto ‸" },
      { glyph: "⟶", command: "\\longrightarrow", insert: "\\longrightarrow ‸" },
      { glyph: "↑", command: "\\uparrow", insert: "\\uparrow ‸" },
      { glyph: "↓", command: "\\downarrow", insert: "\\downarrow ‸" },
      { glyph: "↗", command: "\\nearrow", insert: "\\nearrow ‸" },
      { glyph: "↘", command: "\\searrow", insert: "\\searrow ‸" },
    ],
  },
  {
    label: "Greek",
    snippets: [
      { glyph: "α", command: "\\alpha", insert: "\\alpha ‸" },
      { glyph: "β", command: "\\beta", insert: "\\beta ‸" },
      { glyph: "γ", command: "\\gamma", insert: "\\gamma ‸" },
      { glyph: "δ", command: "\\delta", insert: "\\delta ‸" },
      { glyph: "ε", command: "\\epsilon", insert: "\\epsilon ‸" },
      { glyph: "ζ", command: "\\zeta", insert: "\\zeta ‸" },
      { glyph: "η", command: "\\eta", insert: "\\eta ‸" },
      { glyph: "θ", command: "\\theta", insert: "\\theta ‸" },
      { glyph: "ι", command: "\\iota", insert: "\\iota ‸" },
      { glyph: "κ", command: "\\kappa", insert: "\\kappa ‸" },
      { glyph: "λ", command: "\\lambda", insert: "\\lambda ‸" },
      { glyph: "μ", command: "\\mu", insert: "\\mu ‸" },
      { glyph: "ν", command: "\\nu", insert: "\\nu ‸" },
      { glyph: "ξ", command: "\\xi", insert: "\\xi ‸" },
      { glyph: "π", command: "\\pi", insert: "\\pi ‸" },
      { glyph: "ρ", command: "\\rho", insert: "\\rho ‸" },
      { glyph: "σ", command: "\\sigma", insert: "\\sigma ‸" },
      { glyph: "τ", command: "\\tau", insert: "\\tau ‸" },
      { glyph: "υ", command: "\\upsilon", insert: "\\upsilon ‸" },
      { glyph: "φ", command: "\\phi", insert: "\\phi ‸" },
      { glyph: "χ", command: "\\chi", insert: "\\chi ‸" },
      { glyph: "ψ", command: "\\psi", insert: "\\psi ‸" },
      { glyph: "ω", command: "\\omega", insert: "\\omega ‸" },
    ],
  },
  {
    label: "Greek caps",
    snippets: [
      { glyph: "Γ", command: "\\Gamma", insert: "\\Gamma ‸" },
      { glyph: "Δ", command: "\\Delta", insert: "\\Delta ‸" },
      { glyph: "Θ", command: "\\Theta", insert: "\\Theta ‸" },
      { glyph: "Λ", command: "\\Lambda", insert: "\\Lambda ‸" },
      { glyph: "Ξ", command: "\\Xi", insert: "\\Xi ‸" },
      { glyph: "Π", command: "\\Pi", insert: "\\Pi ‸" },
      { glyph: "Σ", command: "\\Sigma", insert: "\\Sigma ‸" },
      { glyph: "Υ", command: "\\Upsilon", insert: "\\Upsilon ‸" },
      { glyph: "Φ", command: "\\Phi", insert: "\\Phi ‸" },
      { glyph: "Ψ", command: "\\Psi", insert: "\\Psi ‸" },
      { glyph: "Ω", command: "\\Omega", insert: "\\Omega ‸" },
      { glyph: "ϵ", command: "\\varepsilon", insert: "\\varepsilon ‸" },
      { glyph: "ϑ", command: "\\vartheta", insert: "\\vartheta ‸" },
      { glyph: "ϕ", command: "\\varphi", insert: "\\varphi ‸" },
    ],
  },
  {
    label: "Accents",
    snippets: [
      { glyph: "x̂", command: "\\hat{x}", insert: "\\hat{‸}" },
      { glyph: "x̃", command: "\\tilde{x}", insert: "\\tilde{‸}" },
      { glyph: "x̄", command: "\\bar{x}", insert: "\\bar{‸}" },
      { glyph: "x⃗", command: "\\vec{x}", insert: "\\vec{‸}" },
      { glyph: "ẋ", command: "\\dot{x}", insert: "\\dot{‸}" },
      { glyph: "ẍ", command: "\\ddot{x}", insert: "\\ddot{‸}" },
      { glyph: "âbc", command: "\\widehat{abc}", insert: "\\widehat{‸}" },
      { glyph: "ãbc", command: "\\widetilde{abc}", insert: "\\widetilde{‸}" },
      { glyph: "AB⃗", command: "\\overrightarrow{AB}", insert: "\\overrightarrow{‸}" },
      { glyph: "𝐱", command: "\\mathbf{x}", insert: "\\mathbf{‸}" },
      { glyph: "𝑥", command: "\\mathit{x}", insert: "\\mathit{‸}" },
      { glyph: "𝓍", command: "\\mathcal{X}", insert: "\\mathcal{‸}" },
    ],
  },
  {
    label: "Brackets",
    snippets: [
      { glyph: "( )", command: "\\left( \\right)", insert: "\\left( ‸ \\right)" },
      { glyph: "[ ]", command: "\\left[ \\right]", insert: "\\left[ ‸ \\right]" },
      { glyph: "{ }", command: "\\left\\{ \\right\\}", insert: "\\left\\{ ‸ \\right\\}" },
      { glyph: "⟨ ⟩", command: "\\langle \\rangle", insert: "\\left\\langle ‸ \\right\\rangle" },
      { glyph: "⌈ ⌉", command: "\\lceil \\rceil", insert: "\\left\\lceil ‸ \\right\\rceil" },
      { glyph: "⌊ ⌋", command: "\\lfloor \\rfloor", insert: "\\left\\lfloor ‸ \\right\\rfloor" },
      { glyph: "| |", command: "\\left| \\right|", insert: "\\left| ‸ \\right|" },
      { glyph: "‖ ‖", command: "\\left\\| \\right\\|", insert: "\\left\\| ‸ \\right\\|" },
    ],
  },
  {
    label: "Matrix",
    snippets: [
      { glyph: "(▦)", command: "\\begin{pmatrix} … \\end{pmatrix}", insert: "\\begin{pmatrix} ‸ & \\\\ & \\end{pmatrix}" },
      { glyph: "[▦]", command: "\\begin{bmatrix} … \\end{bmatrix}", insert: "\\begin{bmatrix} ‸ & \\\\ & \\end{bmatrix}" },
      { glyph: "|▦|", command: "\\begin{vmatrix} … \\end{vmatrix}", insert: "\\begin{vmatrix} ‸ & \\\\ & \\end{vmatrix}" },
      { glyph: "{▤", command: "\\begin{cases} … \\end{cases}", insert: "\\begin{cases} ‸ & \\text{if } \\\\ & \\text{otherwise} \\end{cases}" },
      { glyph: "≡▤", command: "\\begin{aligned} … \\end{aligned}", insert: "\\begin{aligned} ‸ &= \\\\ &= \\end{aligned}" },
      { glyph: "&", command: "& (column separator)", insert: " & ‸" },
      { glyph: "⏎", command: "\\\\ (row break)", insert: " \\\\ ‸" },
      { glyph: "⋯", command: "\\cdots", insert: "\\cdots ‸" },
      { glyph: "⋮", command: "\\vdots", insert: "\\vdots ‸" },
      { glyph: "⋱", command: "\\ddots", insert: "\\ddots ‸" },
    ],
  },
  {
    label: "Misc",
    snippets: [
      { glyph: "∞", command: "\\infty", insert: "\\infty ‸" },
      { glyph: "…", command: "\\ldots", insert: "\\ldots ‸" },
      { glyph: "∠", command: "\\angle", insert: "\\angle ‸" },
      { glyph: "⊥", command: "\\perp", insert: "\\perp ‸" },
      { glyph: "∥", command: "\\parallel", insert: "\\parallel ‸" },
      { glyph: "°", command: "^\\circ", insert: "^\\circ ‸" },
      { glyph: "′", command: "\\prime", insert: "'‸" },
      { glyph: "ℏ", command: "\\hbar", insert: "\\hbar ‸" },
      { glyph: "ℓ", command: "\\ell", insert: "\\ell ‸" },
      { glyph: "ℜ", command: "\\Re", insert: "\\Re ‸" },
      { glyph: "ℑ", command: "\\Im", insert: "\\Im ‸" },
      { glyph: "ℵ", command: "\\aleph", insert: "\\aleph ‸" },
      { glyph: "∇", command: "\\nabla", insert: "\\nabla ‸" },
      { glyph: "␣", command: "\\quad", insert: "\\quad ‸" },
    ],
  },
];

export const CURSOR_MARK = "‸";

/**
 * Splices `snippet` into `value` at `[start, end)`, resolving `‸` to a caret
 * position.
 *
 * `wrapInMath` is what makes the palette work in a prose field: outside a
 * `$...$` span, a bare `\sum_{i=1}^{n}` renders as literal backslash text,
 * which is exactly the failure it looks like. Wrapping only when the caret
 * is *not* already inside a span means clicking a symbol always produces
 * rendered math, and never tears an existing span in half.
 */
export function insertLatexSnippet(
  value: string,
  start: number,
  end: number,
  snippet: string,
  wrapInMath = false
): { next: string; cursor: number } {
  const markIndex = snippet.indexOf(CURSOR_MARK);
  const clean = snippet.replace(CURSOR_MARK, "");
  const body = wrapInMath ? `$${clean}$` : clean;
  const next = value.slice(0, start) + body + value.slice(end);
  const offset = (wrapInMath ? 1 : 0) + (markIndex === -1 ? clean.length : markIndex);
  return { next, cursor: start + offset };
}
