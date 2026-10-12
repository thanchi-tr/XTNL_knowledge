import { create, all, type MathNode } from "mathjs";
import { normalizeFormulaText, splitEquation } from "./latex";

const math = create(all);

/**
 * Formula equivalence: is what was typed the same formula as the stored one, written any other way?
 *
 * Proved by evaluation, not by comparing text: both sides are evaluated at random points and must agree
 * everywhere. So `b*a*c`, `c*(a*b)` and `a*b*c` are one formula; `a*b+c` and `a*(b+c)` are not. On top of the
 * evaluation, the ways people actually write a formula are accepted:
 *
 *   - multiplication written `×`, `·`, `⋅`, `**` for powers, `−` for minus, `√x`, `²` (latex.ts normalizeFormulaText);
 *   - letters written together for a product, `bac` for `b*a*c`, when the other side has those variables and not
 *     `bac` itself (either side: an author's `F = ma` accepts `F = m*a`);
 *   - a variable in other capitals (`n` for `N`) when the card is not case sensitive and that is the only match;
 *   - an equation in any arrangement: `y = a*b`, `b*a = y`, `2y = 2ab` (the same relation up to a constant factor),
 *     and the formula alone (`a*b`) when the stored answer names what it computes (`y = a*b`), or the reverse;
 *   - a function the grader doesn't compute (`Std(sample)`, `mean(x)`, any capitals) is the same unknown function on
 *     both sides: equal arguments give equal values. The elementary ones (sqrt, ln, sin, …) are computed, in any
 *     capitals (`SQRT(N)`).
 *
 * Fails closed: an unreadable answer, or too few points where both sides have a real value, is not a pass.
 */

export interface FormulaOptions {
  /** The idea's answerCaseSensitive: when set, `n` is not `N`. */
  caseSensitive?: boolean;
  /** Points that must agree (default 6). */
  trials?: number;
  /** The random source (default Math.random); the checks pass a seeded one. */
  rng?: () => number;
}

const DEFAULT_TRIALS = 6;
const ATTEMPTS_PER_TRIAL = 5;
const TOLERANCE_REL = 1e-6;

/** Functions the grader computes, by their lower-case spelling → mathjs's name. Everything else is opaque. */
const ELEMENTARY: Readonly<Record<string, string>> = {
  sqrt: "sqrt", cbrt: "cbrt", exp: "exp", log: "log", ln: "log", lg: "log10", log10: "log10", log2: "log2",
  sin: "sin", cos: "cos", tan: "tan", sec: "sec", csc: "csc", cot: "cot",
  asin: "asin", acos: "acos", atan: "atan", arcsin: "asin", arccos: "acos", arctan: "atan",
  sinh: "sinh", cosh: "cosh", tanh: "tanh", abs: "abs", floor: "floor", ceil: "ceil", round: "round",
  min: "min", max: "max", pow: "pow", mod: "mod", sign: "sign", nthroot: "nthRoot", factorial: "factorial",
};

/** The prefix of an opaque function's internal name (`Std(…)` → `fn_std(…)`). */
const OPAQUE = "fn_";

interface Side {
  node: MathNode;
  /** Free variables (not numeric constants such as pi or e, not function names). */
  vars: Set<string>;
  /** Opaque functions (internal names). */
  fns: Set<string>;
}

type Parsed = { kind: "expr"; side: Side } | { kind: "eq"; lhs: Side; rhs: Side };

type Node = MathNode & { type: string; name?: string; fn?: MathNode; args?: MathNode[]; content?: MathNode };

const isConstantName = (name: string) => name in math && typeof (math as unknown as Record<string, unknown>)[name] === "number";

/** Renames every function call: elementary → mathjs's spelling, anything else → an opaque `fn_<lower>`. */
function canonFunctions(node: MathNode, fns: Set<string>): MathNode {
  return node.transform((raw) => {
    const n = raw as Node;
    if (n.type !== "FunctionNode" || !n.fn || (n.fn as Node).type !== "SymbolNode") return raw;
    const name = String((n.fn as Node).name ?? "");
    const lower = name.toLowerCase();
    const target = ELEMENTARY[lower] ?? `${OPAQUE}${lower}`;
    if (!ELEMENTARY[lower]) fns.add(target);
    return new math.FunctionNode(new math.SymbolNode(target), (n.args ?? []).map((a) => canonFunctions(a, fns)));
  });
}

function variablesOf(node: MathNode): Set<string> {
  const vars = new Set<string>();
  node.traverse((raw, path, parent) => {
    const n = raw as Node;
    if (n.type !== "SymbolNode") return;
    if (path === "fn" && (parent as Node | null)?.type === "FunctionNode") return;
    const name = String(n.name ?? "");
    if (!isConstantName(name)) vars.add(name);
  });
  return vars;
}

function sideOf(text: string): Side | null {
  try {
    const fns = new Set<string>();
    const node = canonFunctions(math.parse(text), fns);
    return { node, vars: variablesOf(node), fns };
  } catch {
    return null;
  }
}

/** Reads a typed or stored formula: normalised, then one expression or one equation. Null when it doesn't parse. */
export function parseFormula(input: string): Parsed | null {
  const text = normalizeFormulaText(input);
  if (!text) return null;
  const eq = splitEquation(text);
  if (eq) {
    const lhs = sideOf(eq.lhs);
    const rhs = sideOf(eq.rhs);
    return lhs && rhs ? { kind: "eq", lhs, rhs } : null;
  }
  const side = sideOf(text);
  return side ? { kind: "expr", side } : null;
}

const sidesOf = (p: Parsed): Side[] => (p.kind === "eq" ? [p.lhs, p.rhs] : [p.side]);
const varsOfParsed = (p: Parsed) => new Set(sidesOf(p).flatMap((s) => [...s.vars]));

/**
 * `word` as a product of names from `names` (letters written together: `bac` → b, a, c), fewest pieces first;
 * null when it can't be read that way or reads as a single name.
 */
export function segmentProduct(word: string, names: Iterable<string>, caseSensitive: boolean): string[] | null {
  const key = (s: string) => (caseSensitive ? s : s.toLowerCase());
  const byKey = new Map<string, string>();
  for (const n of names) if (!byKey.has(key(n))) byKey.set(key(n), n);
  const w = key(word);
  // best[i] = the fewest pieces covering w.slice(0, i)
  const best: (string[] | null)[] = Array(w.length + 1).fill(null);
  best[0] = [];
  for (let i = 1; i <= w.length; i++) {
    for (let j = 0; j < i; j++) {
      const prev = best[j];
      const name = byKey.get(w.slice(j, i));
      if (!prev || !name) continue;
      if (!best[i] || prev.length + 1 < best[i]!.length) best[i] = [...prev, name];
    }
  }
  const out = best[w.length];
  return out && out.length >= 2 ? out : null;
}

/** How each of `from`'s variables reads against `to`'s: itself, the same name in other capitals, or a product. */
function readingsAgainst(from: Set<string>, to: Set<string>, caseSensitive: boolean): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const v of from) {
    if (to.has(v)) continue;
    if (!caseSensitive) {
      const same = [...to].filter((t) => t.toLowerCase() === v.toLowerCase());
      if (same.length === 1) {
        map.set(v, same);
        continue;
      }
    }
    const parts = segmentProduct(v, to, caseSensitive);
    if (parts) map.set(v, parts);
  }
  return map;
}

function applyReadings(side: Side, readings: Map<string, string[]>): Side {
  if (readings.size === 0) return side;
  const node = side.node.transform((raw, path, parent) => {
    const n = raw as Node;
    if (n.type !== "SymbolNode") return raw;
    if (path === "fn" && (parent as Node | null)?.type === "FunctionNode") return raw;
    const parts = readings.get(String(n.name ?? ""));
    if (!parts) return raw;
    if (parts.length === 1) return new math.SymbolNode(parts[0]);
    const product = parts.map((p) => new math.SymbolNode(p) as MathNode).reduce((a, b) => new math.OperatorNode("*", "multiply", [a, b]));
    return new math.ParenthesisNode(product);
  });
  return { node, vars: variablesOf(node), fns: side.fns };
}

function applyToParsed(p: Parsed, readings: Map<string, string[]>): Parsed {
  return p.kind === "eq" ? { kind: "eq", lhs: applyReadings(p.lhs, readings), rhs: applyReadings(p.rhs, readings) } : { kind: "expr", side: applyReadings(p.side, readings) };
}

/** The variable a side is, when it is one bare variable (`y`, `(y)`), else null. */
function bareVariable(side: Side): string | null {
  let n = side.node as Node;
  while (n.type === "ParenthesisNode" && n.content) n = n.content as Node;
  return n.type === "SymbolNode" && side.vars.has(String(n.name)) ? String(n.name) : null;
}

/** An equation that names what it computes (`y = …` or `… = y`, with y nowhere else): that side, and the formula. */
function namedFormula(p: Parsed): { name: string; formula: Side } | null {
  if (p.kind !== "eq") return null;
  for (const [named, other] of [[p.lhs, p.rhs], [p.rhs, p.lhs]] as const) {
    const name = bareVariable(named);
    if (name && !other.vars.has(name)) return { name, formula: other };
  }
  return null;
}

type Compiled = { evaluate: (scope: Record<string, unknown>) => unknown };

function compile(side: Side): Compiled | null {
  try {
    return side.node.compile() as Compiled;
  } catch {
    return null;
  }
}

/** A finite real value, or null (a domain error, a complex value, a non-number). */
function valueAt(c: Compiled, scope: Record<string, unknown>): number | null {
  try {
    const v = c.evaluate(scope);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** One random point: a value per variable, and a fixed random smooth function per opaque function. */
function scopeAt(vars: Iterable<string>, fns: Iterable<string>, rng: () => number): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  for (const v of vars) scope[v] = 0.5 + rng() * 4.5; // 0.5..5: away from 0 for most operations
  for (const f of fns) {
    const c0 = 1 + rng() * 3;
    const terms = Array.from({ length: 4 }, () => ({ a: 0.5 + rng() * 2, k: 0.3 + rng() * 1.7, p: rng() * 6.28 }));
    scope[f] = (...args: unknown[]) => args.reduce<number>((s, x, j) => {
      const t = terms[j % terms.length];
      return s + t.a * Math.sin(t.k * (j + 1) * Number(x) + t.p);
    }, c0);
  }
  return scope;
}

const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_REL * Math.max(1, Math.abs(a), Math.abs(b));

/** f ≡ g at random points. */
function sameFunction(f: Side, g: Side, trials: number, rng: () => number): boolean {
  const cf = compile(f);
  const cg = compile(g);
  if (!cf || !cg) return false;
  const vars = new Set([...f.vars, ...g.vars]);
  const fns = new Set([...f.fns, ...g.fns]);
  let valid = 0;
  for (let attempt = 0; attempt < trials * ATTEMPTS_PER_TRIAL && valid < trials; attempt++) {
    const scope = scopeAt(vars, fns, rng);
    const a = valueAt(cf, scope);
    const b = valueAt(cg, scope);
    if (a === null || b === null) continue;
    if (!close(a, b)) return false;
    valid++;
  }
  return valid >= trials;
}

/** L1 − R1 ≡ k·(L2 − R2) for one constant k ≠ 0: the same relation, in any arrangement or scale. */
function sameRelation(l1: Side, r1: Side, l2: Side, r2: Side, trials: number, rng: () => number): boolean {
  const c = [l1, r1, l2, r2].map(compile);
  if (c.some((x) => !x)) return false;
  const [cl1, cr1, cl2, cr2] = c as Compiled[];
  const vars = new Set([l1, r1, l2, r2].flatMap((s) => [...s.vars]));
  const fns = new Set([l1, r1, l2, r2].flatMap((s) => [...s.fns]));
  let k: number | null = null;
  let valid = 0;
  for (let attempt = 0; attempt < trials * ATTEMPTS_PER_TRIAL && valid < trials; attempt++) {
    const scope = scopeAt(vars, fns, rng);
    const v = [cl1, cr1, cl2, cr2].map((x) => valueAt(x, scope));
    if (v.some((x) => x === null)) continue;
    const d1 = (v[0] as number) - (v[1] as number);
    const d2 = (v[2] as number) - (v[3] as number);
    const zero1 = close(d1, 0);
    const zero2 = close(d2, 0);
    if (zero1 && zero2) {
      valid++;
      continue;
    }
    if (zero1 !== zero2) return false;
    const ratio = d1 / d2;
    if (k === null) k = ratio;
    else if (!close(ratio, k)) return false;
    valid++;
  }
  // A relation that holds everywhere (y = y) is no answer: it must say something, at a point where it can be wrong.
  return valid >= trials && k !== null && !close(k, 0);
}

/**
 * Is `given` the same formula as `expected`? (See the header for what counts.) Both are typed text: mathjs,
 * LaTeX, or the everyday spellings; an equation or an expression.
 */
export function formulasEquivalent(given: string, expected: string, opts: FormulaOptions = {}): boolean {
  const trials = opts.trials ?? DEFAULT_TRIALS;
  const rng = opts.rng ?? Math.random;
  const caseSensitive = opts.caseSensitive ?? false;
  const g0 = parseFormula(given);
  const e0 = parseFormula(expected);
  if (!g0 || !e0) return false;

  // Read each side's unknown names against the other's: capitals, then letters written together.
  const g = applyToParsed(g0, readingsAgainst(varsOfParsed(g0), varsOfParsed(e0), caseSensitive));
  const e = applyToParsed(e0, readingsAgainst(varsOfParsed(e0), varsOfParsed(g), caseSensitive));

  if (g.kind === "expr" && e.kind === "expr") return sameFunction(g.side, e.side, trials, rng);
  if (g.kind === "eq" && e.kind === "eq") return sameRelation(g.lhs, g.rhs, e.lhs, e.rhs, trials, rng);
  // One side is an equation that names what it computes, the other the formula alone.
  if (e.kind === "eq" && g.kind === "expr") {
    const named = namedFormula(e);
    return named !== null && !g.side.vars.has(named.name) && sameFunction(g.side, named.formula, trials, rng);
  }
  if (g.kind === "eq" && e.kind === "expr") {
    const named = namedFormula(g);
    return named !== null && !e.side.vars.has(named.name) && sameFunction(named.formula, e.side, trials, rng);
  }
  return false;
}

/**
 * Does a SHORT card's stored answer read as a formula, so a typed answer may be graded by equivalence as well as
 * by its text? It must parse, name at least one variable, carry a formula's operator (* / ^ = +) or a function
 * call, and not be prose (two words side by side: "mean/variance ratio" stays text). A hyphen alone doesn't make
 * a formula: "x-ray" is a word.
 */
export function looksLikeFormula(stored: string): boolean {
  const text = normalizeFormulaText(stored);
  if (!text || text.length > 300) return false;
  if (!/[*/^=+]|[A-Za-z_]\w*\s*\(/.test(text)) return false;
  if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text)) return false;
  const p = parseFormula(text);
  return p !== null && varsOfParsed(p).size > 0;
}
