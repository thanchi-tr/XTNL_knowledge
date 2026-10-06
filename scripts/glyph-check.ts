import "./_no-model";
/**
 * Glyph core checks (ui-motion.md §11.1; lane M0a). Pure: no database, no
 * network, no model, no server, no browser. Components render with
 * renderToStaticMarkup; motions run against a small fake DOM built from that
 * markup (scripts/word-count.mjs's parser), with the frozen gateway
 * (src/lib/motion.ts) unchanged and announce / burst swapped for recorders.
 *
 *   npx tsx scripts/glyph-check.ts        (npm run ui:glyph once M0c wires it)
 *
 * Covers: the grammar of every glyph × state; distinctness and honest classes;
 * SSR end states, Still and Calm through the gateway, chains created up front,
 * accents for elements in view at hydration (H15); licences and the seen
 * store (first view, same value, offscreen, in view, basis, storage batching,
 * pruning, the 300 cap, H13's SINCE_LINE); no pulse, no spin, one loop;
 * glyph.css; HonestyChip, ProvMark and InfoTip markup; spoken twins and the
 * shared unit table; the composites at 344; safety surfaces never move.
 */
import Module from "node:module";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as copy from "../src/components/roadmap/roadmap-copy";
import { AIM_RANKS, type ProficiencyBasis } from "../src/lib/roadmap-types";
import { basisSignature, basisWithout, rebaseCauseOf } from "../src/lib/roadmap-proficiency";
import { hashSeed } from "../src/lib/motion";
import TABLE from "../src/lib/figure-units.json";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${String(detail).slice(0, 400)}` : ""}`);
  }
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walkFiles(rel, out);
    else out.push(rel);
  }
  return out;
}

// Glyph.tsx imports glyph.css; Node can't load CSS.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};

// ─── A small fake DOM ───────────────────────────────────────────────────────

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Call {
  el: FEl;
  frames: Keyframe[];
  opts: KeyframeAnimationOptions;
}
const CALLS: Call[] = [];

class FText {
  parent: FEl | null = null;
  constructor(public text: string) {}
  get nodeType() {
    return 3;
  }
}

type Compound = { tag: string | null; classes: string[]; attrs: { name: string; value: string | null; prefix?: boolean }[]; id: string | null };

function splitTop(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth--;
    if (depth === 0 && !quote && sep.test(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseCompound(s: string): Compound {
  const c: Compound = { tag: null, classes: [], attrs: [], id: null };
  const tag = /^[a-zA-Z][\w-]*/.exec(s);
  let i = 0;
  if (tag) {
    c.tag = tag[0].toLowerCase();
    i = tag[0].length;
  }
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^\.([\w-]+)/.exec(rest))) c.classes.push(m[1]);
    else if ((m = /^#([\w-]+)/.exec(rest))) c.id = m[1];
    else if ((m = /^\[([\w-]+)(?:(\^?)="([^"]*)")?\]/.exec(rest))) c.attrs.push({ name: m[1], value: m[3] ?? null, prefix: m[2] === "^" });
    else throw new Error(`fake DOM: unsupported selector "${s}"`);
    i += m[0].length;
  }
  return c;
}

function matchCompound(el: FEl, c: Compound): boolean {
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id && el.getAttribute("id") !== c.id) return false;
  const cls = (el.getAttribute("class") ?? "").split(/\s+/);
  if (!c.classes.every((k) => cls.includes(k))) return false;
  return c.attrs.every((a) => (a.value == null ? el.hasAttribute(a.name) : a.prefix ? (el.getAttribute(a.name) ?? "").startsWith(a.value) : el.getAttribute(a.name) === a.value));
}

function matchSelector(el: FEl, sel: string): boolean {
  return splitTop(sel, /,/).some((one) => {
    const parts = splitTop(one, /\s/).map(parseCompound);
    if (!matchCompound(el, parts[parts.length - 1])) return false;
    let at: FEl | null = el.parent;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (at && !matchCompound(at, parts[i])) at = at.parent;
      if (!at) return false;
      at = at.parent;
    }
    return true;
  });
}

class FEl {
  tagName: string;
  attrs = new Map<string, string>();
  children: (FEl | FText)[] = [];
  parent: FEl | null = null;
  rect: Rect = { left: 0, top: 0, width: 20, height: 20 };
  dataset: Record<string, string | undefined> = {};
  style = { setProperty() {}, removeProperty() {} };
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  get nodeType() {
    return 1;
  }
  getAttribute(n: string) {
    return this.attrs.has(n) ? this.attrs.get(n)! : null;
  }
  setAttribute(n: string, v: string) {
    this.attrs.set(n, String(v));
  }
  removeAttribute(n: string) {
    this.attrs.delete(n);
  }
  hasAttribute(n: string) {
    return this.attrs.has(n);
  }
  get classList() {
    const list = () => (this.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    return {
      contains: (c: string) => list().includes(c),
      add: (c: string) => this.setAttribute("class", [...new Set([...list(), c])].join(" ")),
      remove: (c: string) => this.setAttribute("class", list().filter((x) => x !== c).join(" ")),
    };
  }
  get textContent(): string {
    return this.children.map((c) => (c instanceof FText ? c.text : c.textContent)).join("");
  }
  set textContent(v: string) {
    const t = new FText(v);
    t.parent = this;
    this.children = [t];
  }
  appendChild<T extends FEl | FText>(c: T): T {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
  }
  get isConnected() {
    return true;
  }
  get offsetWidth() {
    return 6;
  }
  get offsetHeight() {
    return 6;
  }
  getBoundingClientRect() {
    const r = this.rect;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
  }
  querySelectorAll(sel: string): FEl[] {
    const out: FEl[] = [];
    const walk = (e: FEl) => {
      for (const c of e.children) {
        if (c instanceof FEl) {
          if (c.matches(sel)) out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel: string): FEl | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  matches(sel: string) {
    return matchSelector(this, sel);
  }
  closest(sel: string): FEl | null {
    if (this.matches(sel)) return this;
    return this.parent ? this.parent.closest(sel) : null;
  }
  animate(frames: Keyframe[], opts: KeyframeAnimationOptions) {
    CALLS.push({ el: this, frames, opts });
    return { finished: Promise.resolve(), cancel() {} };
  }
}

interface PNode {
  tag?: string;
  attrs?: Record<string, string>;
  children?: PNode[];
  text?: string;
  raw?: boolean;
}

function toFake(n: PNode): FEl {
  const el = new FEl(n.tag ?? "div");
  for (const [k, v] of Object.entries(n.attrs ?? {})) el.setAttribute(k, v);
  for (const c of n.children ?? []) {
    if (c.text != null) {
      if (!c.raw) el.appendChild(new FText(c.text));
    } else el.appendChild(toFake(c));
  }
  return el;
}

class FakeLS {
  map = new Map<string, string>();
  gets = 0;
  sets = 0;
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.gets++;
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.sets++;
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

class FakeIO {
  static all: FakeIO[] = [];
  targets = new Set<FEl>();
  constructor(
    public cb: (entries: { target: FEl; isIntersecting: boolean; intersectionRatio: number }[]) => void,
    public opts: { rootMargin?: string; threshold?: number | number[] }
  ) {
    FakeIO.all.push(this);
  }
  observe(t: FEl) {
    this.targets.add(t);
  }
  unobserve(t: FEl) {
    this.targets.delete(t);
  }
  disconnect() {
    this.targets.clear();
  }
}

const html = new FEl("html");
const body = new FEl("body");
html.appendChild(body);
const LS = new FakeLS();
const fakeWindow = { innerWidth: 344, innerHeight: 882, localStorage: LS, setTimeout, clearTimeout };
const fakeDocument = {
  documentElement: html,
  body,
  createElement: (t: string) => new FEl(t),
  getElementById: (id: string) => body.querySelector(`#${id}`),
};
function installDom() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = fakeWindow;
  g.document = fakeDocument;
  g.IntersectionObserver = FakeIO;
}
function setLevel(l: "full" | "calm" | "still") {
  html.dataset.motion = l;
}

async function main() {
  const { parseMarkup, countAppWords, classifyRuns, wordRules, visibleText } = (await import("./word-count.mjs")) as typeof import("./word-count.mjs");
  const paths = await import("../src/components/glyph/paths");
  const { flatParts } = await import("../src/components/glyph/paths/part");
  const { FLAME_PATH } = await import("../src/components/glyph/paths/flame");
  const { RANK_WORDS } = await import("../src/components/glyph/paths/rank");
  const G = await import("../src/components/glyph/Glyph");
  const { GlyphDefs, defsList } = await import("../src/components/glyph/GlyphDefs");
  const HC = await import("../src/components/glyph/HonestyChip");
  const { InfoTip, CardKey, wireDescribedBy } = await import("../src/components/glyph/InfoTip");
  const { GlyphStat, StatRow, Fig } = await import("../src/components/glyph/GlyphStat");
  const { GlyphLane } = await import("../src/components/glyph/GlyphLane");
  const { RankSeal, rankRiseDecision, rankSealLabel } = await import("../src/components/glyph/RankSeal");
  const { StageLadder } = await import("../src/components/glyph/StageLadder");
  const { TimeBar, placeLabels, timeBarHeight, textWidth12 } = await import("../src/components/glyph/TimeBar");
  const { RouteRail, RAIL_STATES } = await import("../src/components/glyph/RouteRail");
  const { PipStrip } = await import("../src/components/glyph/PipStrip");
  const { CapacityGauge } = await import("../src/components/glyph/CapacityGauge");
  const seen = await import("../src/components/glyph/useSeen");
  const GM = await import("../src/lib/glyph-motion");
  const FS = await import("../src/lib/figure-speech");
  const motion = await import("../src/lib/motion");

  const R = (el: ReactElement) => renderToStaticMarkup(el);
  const tree = (markup: string) => parseMarkup(markup) as PNode;
  const fake = (markup: string): FEl => {
    const wrap = toFake(tree(markup));
    wrap.tagName = "DIV";
    body.appendChild(wrap);
    return wrap;
  };
  const elementsOf = (n: PNode, out: PNode[] = []): PNode[] => {
    for (const c of n.children ?? []) {
      if (c.tag) {
        out.push(c);
        elementsOf(c, out);
      }
    }
    return out;
  };
  const ancestorsOf = (n: PNode & { parent?: PNode }): PNode[] => {
    const out: PNode[] = [];
    let p = (n as { parent?: PNode }).parent as (PNode & { parent?: PNode }) | undefined;
    while (p) {
      out.push(p);
      p = (p as { parent?: PNode }).parent as (PNode & { parent?: PNode }) | undefined;
    }
    return out;
  };
  const cls = (n: PNode) => (n.attrs?.class ?? "").split(/\s+/).filter(Boolean);

  const { GLYPH_NAMES, GLYPH_INFO, GLYPH_STATES, glyphParts, DEFS_FAMILIES } = paths;
  type GName = (typeof GLYPH_NAMES)[number];
  const glyphMarkup = (name: GName, state: "idle" | "active" | "done", extra: Record<string, unknown> = {}) => R(createElement(G.Glyph, { name, state, size: 24, ...extra }));

  // ── 1. Grammar ────────────────────────────────────────────────────────────
  console.log("— grammar —");
  const SW = new Set(["1.25", "1.5", "1.75", "2", "2.25"]);
  // ui-motion §15.12's dash rule (revision 5): pv.libpick joins pv.suggest's family (D34: not checked).
  const DASHED = new Set(["pv.suggest", "pv.kept", "pv.pick", "pv.libpick", "v.unv"]);
  const ROLES = new Set(["rim", "mark", "solid", "badge", "ring", "ping"]);
  const gram: string[] = [];
  const inner = new Map<string, string>();
  for (const name of GLYPH_NAMES) {
    for (const state of GLYPH_STATES) {
      const m = glyphMarkup(name, state);
      const t = tree(m);
      const svg = elementsOf(t).find((e) => e.tag === "svg");
      const where = `${name} ${state}`;
      if (!svg) {
        gram.push(`${where}: no svg`);
        continue;
      }
      if (svg.attrs?.viewBox !== "0 0 24 24") gram.push(`${where}: viewBox ${svg.attrs?.viewBox}`);
      if (svg.attrs?.["data-g"] !== name || svg.attrs?.["data-s"] !== state) gram.push(`${where}: data-g / data-s`);
      if (!cls(svg).includes("mg")) gram.push(`${where}: class mg`);
      const els = elementsOf(svg);
      const drawn = els.filter((e) => e.tag === "path" || e.tag === "use");
      if (drawn.length === 0 || drawn.length > 6) gram.push(`${where}: ${drawn.length} parts`);
      if (els.some((e) => ["filter", "lineargradient", "radialgradient", "mask", "text", "pattern", "image", "foreignobject", "style"].includes(e.tag!))) gram.push(`${where}: a forbidden element`);
      for (const p of els.filter((e) => e.tag === "path")) {
        const a = p.attrs ?? {};
        if (!ROLES.has(a["data-part"] ?? "")) gram.push(`${where}: a path without a data-part`);
        const stroked = a.stroke !== "none";
        if (stroked && a.pathlength !== "100" && a.pathLength !== "100") gram.push(`${where}: a stroked path without pathLength=100`);
        if (a["stroke-width"] != null && !SW.has(a["stroke-width"])) gram.push(`${where}: stroke-width ${a["stroke-width"]}`);
        if (a.fill != null && a.fill !== "currentColor") gram.push(`${where}: fill ${a.fill}`);
        if (a.stroke != null && a.stroke !== "none") gram.push(`${where}: stroke ${a.stroke}`);
        if (a["stroke-linecap"] || a["stroke-linejoin"] || a.style || a.color) gram.push(`${where}: a cap, join, style or colour attribute`);
        if (a["stroke-dasharray"] && !DASHED.has(name)) gram.push(`${where}: dashed`);
      }
      for (const u of els.filter((e) => e.tag === "use")) {
        const href = u.attrs?.href ?? "";
        if (!/^#(i|s|c|h)-[a-z]+$/.test(href)) gram.push(`${where}: a use that is not a kit symbol (${href})`);
      }
      const parts = flatParts(glyphParts(name, state));
      if (parts.length !== drawn.length) gram.push(`${where}: markup ≠ declared parts`);
      inner.set(`${name}|${state}`, m.replace(/ class="[^"]*"/g, "").replace(/ data-s="[^"]*"/g, ""));
    }
  }
  check("grammar: every glyph renders in idle, active and done with viewBox 0 0 24 24, data-g and data-s", GLYPH_NAMES.length >= 80 && gram.length === 0, gram.slice(0, 8).join("; "));
  const sameStates: string[] = [];
  for (const name of GLYPH_NAMES) {
    const [i, a, d] = GLYPH_STATES.map((s) => inner.get(`${name}|${s}`));
    const isVerdict = GLYPH_INFO[name].family === "verdict";
    if (i === a) sameStates.push(`${name} idle = active`);
    if (!isVerdict && (a === d || i === d)) sameStates.push(`${name} done = ${a === d ? "active" : "idle"}`);
    if (isVerdict && a !== d) sameStates.push(`${name}: a verdict's done is not its active shape`);
  }
  check("grammar: states differ in path, fill or dash (never colour alone); verdicts have no done state (done = active)", sameStates.length === 0, sameStates.join("; "));
  const glyphCss = read("src/components/glyph/glyph.css");
  const mgRule = /\.mg \{([^}]*)\}/.exec(glyphCss)?.[1] ?? "";
  check("grammar: round caps and joins, no fill, currentColor, 1.75 (glyph.css .mg)", /stroke-linecap: round/.test(mgRule) && /stroke-linejoin: round/.test(mgRule) && /fill: none/.test(mgRule) && /stroke: currentColor/.test(mgRule) && /stroke-width: 1\.75/.test(mgRule));
  check("grammar: idle strokes 1.5 and 12 px glyphs 2 (glyph.css)", /\.mg\.mg-is-idle \{[^}]*stroke-width: 1\.5/.test(glyphCss) && /\.mg\.mg-z12, \.mg\.mg-z12\.mg-is-idle \{ stroke-width: 2; \}/.test(glyphCss));

  // badges: ≤ 2 subpaths (the tally 3), no feature under 3 units
  const subpaths = (d: string) => (d.match(/[Mm]/g) ?? []).length;
  function bboxes(d: string): { w: number; h: number }[] {
    const out: { w: number; h: number }[] = [];
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    let x = 0;
    let y = 0;
    let cmd = "";
    let box: number[] | null = null;
    const add = (px: number, py: number) => {
      if (!box) box = [px, py, px, py];
      box[0] = Math.min(box[0], px);
      box[1] = Math.min(box[1], py);
      box[2] = Math.max(box[2], px);
      box[3] = Math.max(box[3], py);
    };
    const flush = () => {
      if (box) out.push({ w: box[2] - box[0], h: box[3] - box[1] });
      box = null;
    };
    let i = 0;
    const num = () => Number(toks[i++]);
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === "M") {
        flush();
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        add(x, y);
        cmd = rel ? "l" : "L";
      } else if (C === "L" || C === "T") {
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        add(x, y);
      } else if (C === "H") {
        const nx = num();
        x = rel ? x + nx : nx;
        add(x, y);
      } else if (C === "V") {
        const ny = num();
        y = rel ? y + ny : ny;
        add(x, y);
      } else if (C === "C") {
        for (let k = 0; k < 3; k++) {
          const nx = num();
          const ny = num();
          add(rel ? x + nx : nx, rel ? y + ny : ny);
          if (k === 2) {
            x = rel ? x + nx : nx;
            y = rel ? y + ny : ny;
          }
        }
      } else if (C === "S" || C === "Q") {
        for (let k = 0; k < 2; k++) {
          const nx = num();
          const ny = num();
          add(rel ? x + nx : nx, rel ? y + ny : ny);
          if (k === 1) {
            x = rel ? x + nx : nx;
            y = rel ? y + ny : ny;
          }
        }
      } else if (C === "A") {
        const rx = num();
        const ry = num();
        num();
        num();
        num();
        const nx = num();
        const ny = num();
        const ex = rel ? x + nx : nx;
        const ey = rel ? y + ny : ny;
        add(ex, ey);
        add(Math.min(x, ex) - Math.min(rx, Math.abs(ex - x) / 2 + rx), Math.min(y, ey));
        add(Math.max(x, ex), Math.max(y, ey) + Math.min(ry, ry));
        x = ex;
        y = ey;
      } else if (C === "Z") {
        // close
      } else i++;
    }
    flush();
    return out;
  }
  const badgeBad: string[] = [];
  for (const name of paths.FAMILY_NAMES.evidence) {
    for (const p of flatParts(glyphParts(name, "idle"))) {
      if (p.t !== "p") continue;
      const max = name === "ev.counted" ? 3 : 2;
      if (subpaths(p.d) > max) badgeBad.push(`${name}: ${subpaths(p.d)} subpaths`);
      for (const b of bboxes(p.d)) if (Math.max(b.w, b.h) < 3) badgeBad.push(`${name}: a ${b.w.toFixed(1)} × ${b.h.toFixed(1)} feature`);
    }
  }
  check("badges: evidence badges have ≤ 2 subpaths (ev.counted ≤ 3) and no feature under 3 units", badgeBad.length === 0, badgeBad.join("; "));

  // colour: no hex and no gold, --mp, --xp, --owed or --light in glyph files or glyph.css
  const glyphFiles = walkFiles("src/components/glyph").filter((f) => /\.(tsx?|css)$/.test(f));
  const hexBad = glyphFiles.filter((f) => /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/.test(code(read(f))));
  check("colour: no hex colour in the glyph files or glyph.css", hexBad.length === 0, hexBad.join(", "));
  const inkBad = glyphFiles.filter((f) => /gold|--mp\b|--xp\b|--owed|--light\b|--pts\b/.test(code(read(f))));
  check("colour: no gold, --mp, --xp, --owed or --light in the glyph files (ink only, D22)", inkBad.length === 0, inkBad.join(", "));

  // delivery: static families as <use> into GlyphDefs; animatable inline
  const delivery: string[] = [];
  for (const name of GLYPH_NAMES) {
    const m = glyphMarkup(name, "idle", { defs: "gx" });
    const viaUse = m.includes(`href="#gd-gx-${name}-idle"`);
    if (GLYPH_INFO[name].defs && !viaUse) delivery.push(`${name} should be a <use>`);
    if (!GLYPH_INFO[name].defs && viaUse) delivery.push(`${name} should be inline`);
    if (GLYPH_INFO[name].defs && glyphMarkup(name, "active", { defs: "gx" }).includes("#gd-")) delivery.push(`${name} active should be inline`);
  }
  check("delivery: static families render as <use> into GlyphDefs (idle), animatable families inline (D3)", delivery.length === 0, delivery.join("; "));
  const defsMarkup = R(createElement(GlyphDefs, { route: "rm" }));
  const defsTree = tree(defsMarkup);
  const symbols = elementsOf(defsTree).filter((e) => e.tag === "symbol");
  check(
    "GlyphDefs: one hidden 0 × 0 svg of <symbol>s, ids gd-{route}-{name}-idle, static families only",
    /^<svg width="0" height="0" aria-hidden="true"/.test(defsMarkup) &&
      /position:absolute/.test(defsMarkup) &&
      symbols.length === defsList(DEFS_FAMILIES).length &&
      // ui-motion §15.1 (revision 5): the goal family's ids carry the seat digit (gd-{route}-goal.k-{state}).
      symbols.every((s) => /^gd-rm-[a-z0-9.-]+-idle$/.test(s.attrs?.id ?? "") && GLYPH_INFO[(s.attrs!.id!.slice(6, -5)) as GName]?.defs != null),
    `${symbols.length} symbols`
  );
  let badRoute = false;
  try {
    R(createElement(GlyphDefs, { route: "Bad Route" }));
  } catch {
    badRoute = true;
  }
  check("GlyphDefs: a route prefix is lowercase letters and digits", badRoute);
  check("GlyphDefs: emitted by a page, never by the frozen layout.tsx", !/GlyphDefs/.test(read("src/app/layout.tsx")));

  // ── 2. Distinctness and classes ───────────────────────────────────────────
  console.log("— distinctness and classes —");
  const iconSrc = read("src/components/ui/Icon.tsx");
  const kitPaths = new Map<string, string>();
  for (const m of iconSrc.matchAll(/<symbol id="([\w-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)) for (const d of m[2].matchAll(/ d="([^"]+)"/g)) kitPaths.set(d[1], m[1]);
  const dup: string[] = [];
  for (const name of GLYPH_NAMES) {
    for (const state of GLYPH_STATES) {
      for (const p of flatParts(glyphParts(name, state))) {
        if (p.t !== "p" || !kitPaths.has(p.d)) continue;
        // flame.unlit is the i-flame path as an outline, by spec: the kit symbol is fill-only, so it cannot be reused through <use>
        if (name === "flame" && p.d === FLAME_PATH) continue;
        dup.push(`${name} ${state} copies ${kitPaths.get(p.d)}`);
      }
    }
  }
  check("distinct: no glyph copies a kit path (kit symbols are reused through <use>; flame.unlit allowlisted by spec)", kitPaths.size > 30 && dup.length === 0, dup.join("; "));
  const suggest = flatParts(glyphParts("pv.suggest", "idle"));
  check("distinct: pv.suggest is not c-xp and is not filled", suggest.every((p) => p.t === "p" && !p.fill && !p.fs && kitPaths.get(p.d) !== "c-xp"));
  const health = flatParts(glyphParts("safe.health", "idle")).map((p) => (p.t === "p" ? p.d : ""));
  check("distinct: safe.health is neither h-sick nor s-duty", !health.some((d) => kitPaths.get(d) === "h-sick" || kitPaths.get(d) === "s-duty"));
  const pill: string[] = [];
  for (const name of paths.FAMILY_NAMES.safety) {
    const ps = flatParts(glyphParts(name, "idle"));
    const capsule = ps.some((p) => p.t === "p" && (p.d.match(/A/g) ?? []).length === 2 && (p.d.match(/L/g) ?? []).length >= 2);
    const hasPad = ps.some((p) => p.part === "mark") && ps.some((p) => p.part === "solid");
    if (capsule && !hasPad) pill.push(name);
  }
  check("distinct: no safe.* glyph is a pill (the bandage has its pad and dots; avoid is a strike over the session glyph)", pill.length === 0 && flatParts(glyphParts("safe.strike", "idle")).length === 1, pill.join(", "));
  const rankSets = (["active", "done"] as const).map((s) => paths.FAMILY_NAMES.rank.map((n) => inner.get(`${n}|${s}`)));
  check("distinct: rank.0 … rank.6 are pairwise distinct (active and done)", rankSets.every((set) => new Set(set).size === 7));
  const sealsAll = RANK_WORDS.flatMap((_, i) => (["idle", "active", "done"] as const).flatMap((s) => [34, 40, 48, 72].map((z) => R(createElement(RankSeal, { index: i, size: z as 34, state: s }))))).join("");
  check("distinct: RankSeal has no lock part, no padlock and no numeral", !/m\.lock|mg-shackle|i-lock|<text/.test(sealsAll) && !/>\d+</.test(sealsAll));
  const lockUsers = glyphFiles.filter((f) => /"m\.lock"/.test(code(read(f))) && !/paths\/(misc|index|means)\.ts$|Glyph\.tsx$/.test(f));
  check("classes: m.lock (needs your check) is never drawn by a composite: no rank, no draft Paragon", lockUsers.length === 0, lockUsers.join(", "));
  check("classes: t.earliest is not dashed", !glyphMarkup("t.earliest", "idle").includes("stroke-dasharray"));
  check("classes: no chip rim is dashed (glyph.css has no dashed border)", !/dashed|dotted/.test(code(glyphCss)));

  // composites, for the class and SSR checks
  const kindsRendered = G.QUEST_KINDS.flatMap((k) => GLYPH_STATES.map((s) => R(createElement(G.KindGlyph, { kind: k, state: s, defs: "gx" }))));
  const chipsRendered = HC.HONESTY_KIND_NAMES.flatMap((k) => [
    R(createElement(HC.HonestyChip, { kind: k })),
    R(createElement(HC.HonestyChip, { kind: k, full: `Full text of ${k}.`, id: `p-${k}` })),
  ]);
  const verdictsRendered = (Object.keys(HC.VERDICT_WORDS) as (keyof typeof HC.VERDICT_WORDS)[]).flatMap((v) => [R(createElement(HC.VerdictChip, { verdict: v })), R(createElement(HC.VerdictChip, { verdict: v, unverified: true, chosen: true }))]);
  const RAIL = RAIL_STATES.map((s, i) => ({ n: i + 1, state: s, label: `Milestone ${i + 1}, ${s}`, title: `M${i + 1}`, pct: s === "CURRENT" ? 23 : undefined, gate: "retained" as const, countsFrom: "Thu", closedPct: 82, more: i % 2 ? "Dates" : undefined }));
  const railMarkup = R(createElement(RouteRail, { nodes: RAIL, label: "Milestones" }));
  const stripMarkup = R(createElement(RouteRail, { nodes: RAIL.slice(0, 6), orientation: "strip", label: "Strip" }));
  const tbProps = {
    today: "2026-10-05",
    labelledBy: "realism",
    realistic: { day: "2028-03-12", label: "Mar 2028", sentence: "Realistic: about March 2028, an estimate.", estimate: true, bestCase: true },
    earliest: { day: "2027-12-01", label: "earliest Dec 27", sentence: "Earliest if every review passes: December 2027." },
    exam: { day: "2027-05-04", label: "4 May 27 · Retained", sentence: "The exam on 4 May 2027 is a waypoint at Retained." },
    mine: { day: "2027-12-31", label: "31 Dec 27 · yours", sentence: "Your date: 31 December 2027." },
  };
  const tbMarkup = R(createElement(TimeBar, tbProps));
  const statMarkup = [
    R(createElement(StatRow, { items: [{ glyph: "ev.estimate", value: 9, unit: "h", label: "seen", estimate: true }, { glyph: "pv.you", value: 10, unit: "h/wk", label: "yours" }] })),
    R(createElement(GlyphStat, { glyph: "ev.tested", value: "", calibrating: { n: 12, need: 30 }, bestCase: true })),
    R(createElement(GlyphStat, { glyph: "ev.measured", value: 41, unit: "%", estimate: true })),
    R(createElement(GlyphStat, { glyph: "ev.measured", value: 41, unit: "%" })),
    R(createElement(GlyphStat, { glyph: "ev.measured", value: "09:12", at: "09:12" })),
  ];
  const ladderMarkup = R(createElement(StageLadder, { chosen: 10, exam: 8, gapDays: 110 }));
  const gaugeMarkup = R(createElement(CapacityGauge, { need: { value: 200, text: "3 h 20" }, have: { value: 270, text: "4 h 30" }, unit: "/wk", verdict: "FITS", unverified: true, label: "Needs about 3 hours 20 a week; you have about 4 hours 30 a week." }));
  const laneMarkup = R(createElement(GlyphLane, { who: "gemini", items: ["Domains", "order"] })) + R(createElement(GlyphLane, { who: "app", items: ["practices"] }));
  const pipMarkup = R(createElement(PipStrip, { label: "Due: Tuesday 1, Wednesday 2", days: [{ key: "Mon", n: 0, past: true }, { key: "Tue", n: 1 }, { key: "Wed", n: 2, today: true }, { key: "Thu", n: 0 }, { key: "Fri", n: 0 }, { key: "Sat", n: 0 }, { key: "Sun", n: 0 }] }));
  const provMarkup = (Object.keys(G.PROVMARK_WORDS) as (keyof typeof G.PROVMARK_WORDS)[]).map((c) => R(createElement(G.ProvMark, { cls: c })));
  const tipMarkup = R(createElement(InfoTip, { topic: "setting an aim", id: "tip1", describes: "aim" } as Parameters<typeof InfoTip>[0], "The form lead, verbatim."));
  const keyMarkup = R(createElement(CardKey, { id: "key1", entries: [{ glyph: "ev.tested", words: "tested by your reviews" }], rows: ["Row 1: from your words"] }));
  const composites = [...kindsRendered, ...chipsRendered, ...verdictsRendered, railMarkup, stripMarkup, tbMarkup, ...statMarkup, ladderMarkup, gaugeMarkup, laneMarkup, pipMarkup, ...provMarkup, tipMarkup, keyMarkup, sealsAll];
  const allComposite = composites.join("\n");

  // verdict glyphs only inside a verdict chip (or a verdict-word chip: Over, Unverified, Aim / library not checked)
  const VERDICT_WORD_CHIPS = new Set(["over", "unverified", "aim-unchecked", "library-unchecked"]);
  const strayVerdicts: string[] = [];
  for (const m of composites) {
    const t = tree(m);
    const link = (n: PNode, parent?: PNode) => {
      (n as { parent?: PNode }).parent = parent;
      for (const c of n.children ?? []) link(c, n);
    };
    link(t);
    for (const e of elementsOf(t)) {
      const g = e.attrs?.["data-g"] ?? "";
      if (!g.startsWith("v.")) continue;
      const ok = ancestorsOf(e).some((a) => cls(a).includes("mg-vc") || VERDICT_WORD_CHIPS.has(a.attrs?.["data-hc"] ?? ""));
      if (!ok) strayVerdicts.push(g);
    }
  }
  check("classes: verdict glyphs render only inside a verdict chip (D27)", strayVerdicts.length === 0, strayVerdicts.join(", "));
  check(
    "classes: ev.measured only with a measured time; a GlyphStat with `estimate` never uses it",
    !statMarkup[2].includes('data-g="ev.measured"') && statMarkup[2].includes('data-g="ev.estimate"') && !statMarkup[3].includes('data-g="ev.measured"') && statMarkup[4].includes('data-g="ev.measured"')
  );
  // the rail's own node marks (the outline node's [pv.suggest] badge is the balloon glyph: dashed by its own rule)
  const railTree = tree(railMarkup + stripMarkup);
  const railDash = elementsOf(railTree).filter((e) => e.attrs?.["stroke-dasharray"] && ancestorsOf(e).some((a) => cls(a).includes("mg-rr-node")));
  check(
    "classes: on the rail only the pending node is dashed (the current arc's dasharray is its measured %)",
    railDash.length > 0 && railDash.every((e) => e.attrs!["stroke-dasharray"] === "4 4" || (/^\d+ 100$/.test(e.attrs!["stroke-dasharray"]) && cls(e).includes("mg-rr-arc")))
  );

  // ── 3. SSR end states ─────────────────────────────────────────────────────
  console.log("— SSR —");
  const glyphAll = GLYPH_NAMES.flatMap((n) => GLYPH_STATES.map((s) => inner.get(`${n}|${s}`) ?? "")).join("\n");
  const ssrBad = [glyphAll, allComposite].some((m) => /opacity:\s*0(?![.\d])/.test(m) || /data-playing|data-mg-armed/.test(m));
  check("SSR: no inline opacity:0, no data-playing, no armed state in any glyph or composite (the server paints the end state)", !ssrBad);
  check("SSR: no `title` anywhere in a glyph component", !/ title="/.test(glyphAll + allComposite));
  check("SSR: no composite carries SVG <text>", !/<text[\s>]/.test(allComposite));

  // ── 4. Spoken twins and the shared unit table (D26) ───────────────────────
  console.log("— spoken twins —");
  eq("speech: ≈ 110 d → about 110 days", FS.speakFigure("≈ 110 d"), "about 110 days");
  eq("speech: L6+ → level 6 or higher", FS.speakFigure("L6+"), "level 6 or higher");
  eq("speech: 10 h/wk → 10 hours a week", FS.speakFigure("10 h/wk"), "10 hours a week");
  eq("speech: 46 → 38 → from 46 to 38", FS.speakFigure("46 → 38"), "from 46 to 38");
  eq("speech: ↓ 1 since Sun → down 1 since Sunday", FS.speakFigure("↓ 1 since Sun"), "down 1 since Sunday");
  eq("speech: figureSpeech(110, d, estimate)", FS.figureSpeech(110, "d", { estimate: true }), "about 110 days");
  eq("speech: calibrating replaces the figure", FS.figureSpeech(0, "%", { calibrating: { n: 12, need: 30 } }), "pass rate calibrating, 12 of 30");
  eq("speech: one of N and singulars", [FS.speakFigure("1 of 3 cards"), FS.speakFigure("1 h"), FS.speakFigure("2/5")], ["1 of 3 cards", "1 hour", "2 of 5"]);
  const SUFFIX_T = TABLE.suffix as Record<string, { other: string }>;
  const WORDS_T = TABLE.words as Record<string, { other: string }>;
  const unspoken = FS.FIGURE_UNITS.filter((u) => {
    const want = WORDS_T[u] ? `2 ${WORDS_T[u].other}` : `2 ${SUFFIX_T[u].other}`;
    return FS.figureSpeech(2, u) !== want;
  });
  check("speech: figureSpeech speaks every unit in figure-units.json", unspoken.length === 0, unspoken.join(", "));
  const rules = wordRules() as { units: string[]; suffix: string[]; figure: string };
  eq("table: word-count exempts exactly the table's unit words", [...rules.units].sort(), Object.keys(TABLE.words).sort());
  eq("table: word-count's figure suffixes are exactly the table's", [...rules.suffix].sort(), Object.keys(TABLE.suffix).sort());
  const kinds = (s: string) => classifyRuns([{ text: s, kind: "app", block: false }], rules).map((t: { kind: string }) => t.kind);
  const unitMiss = Object.keys(TABLE.words).filter((u) => countAppWords(`<p>5 ${u}</p>`).count !== 0 || !["unit", "punct"].includes(kinds(`5 ${u}`)[1]));
  const suffixMiss = Object.keys(TABLE.suffix).filter((u) => kinds(`5${u}`).join() !== "figure");
  check("table: every unit word after a figure is exempt, every suffix figure is a figure", unitMiss.length === 0 && suffixMiss.length === 0, [...unitMiss, ...suffixMiss].join(", "));
  eq("table: a word the table doesn't know still counts", kinds("5 apples"), ["figure", "app"]);
  const statTree = tree(statMarkup[0]);
  const srs = elementsOf(statTree).filter((e) => cls(e).includes("sr-only")).map((e) => (e.children ?? []).map((c) => c.text ?? "").join(""));
  check(
    "twins: GlyphStat / StatRow render the compact text aria-hidden and one sr twin each",
    srs.length === 2 && srs[0] === "about 9 hours seen" && srs[1] === "10 hours a week yours" && elementsOf(statTree).filter((e) => cls(e).includes("mg-stat-f")).every((e) => e.attrs?.["aria-hidden"] === "true"),
    JSON.stringify(srs)
  );
  check("twins: PipStrip is role=img with its full label; its letters are names", /role="img" aria-label="Due: Tuesday 1, Wednesday 2"/.test(pipMarkup) && /<b data-wc="name">T<\/b>/.test(pipMarkup));
  const gapChip = R(createElement(HC.HonestyChip, { kind: "review-gap", label: "review gap ≈ 110 d" }));
  check("twins: a chip figure reads as words (review gap ≈ 110 d → review gap about 110 days)", gapChip.includes('<span class="sr-only">review gap about 110 days</span>'));
  check("twins: <Fig> renders the compact text aria-hidden and its words sr-only", R(createElement(Fig, { compact: "↓ 1 since Sun" })) === '<span class="mg-fig"><span aria-hidden="true">↓ 1 since Sun</span><span class="sr-only">down 1 since Sunday</span></span>');

  // ── 5. HonestyChip, ProvMark, InfoTip ─────────────────────────────────────
  console.log("— chips, marks, tips —");
  const chipBad: string[] = [];
  for (const k of HC.HONESTY_KIND_NAMES) {
    const def = HC.HONESTY_KINDS[k];
    const st = tree(R(createElement(HC.HonestyChip, { kind: k })));
    const els = elementsOf(st);
    const sr = els.filter((e) => cls(e).includes("sr-only"));
    const lab = els.find((e) => cls(e).includes("mg-hc-l"));
    if (sr.length !== 1) chipBad.push(`${k}: ${sr.length} sr strings`);
    if (!lab || lab.attrs?.["aria-hidden"] !== "true" || lab.attrs?.["data-wc"] !== "honest") chipBad.push(`${k}: the label is not aria-hidden and honest`);
    if (els.some((e) => e.tag === "svg" && !ancestorsOfIn(st, e).some((a) => a.attrs?.["aria-hidden"] === "true") && e.attrs?.["aria-hidden"] !== "true")) chipBad.push(`${k}: a glyph is read`);
    if (els.some((e) => e.tag === "button" || e.tag === "a" || e.attrs?.tabindex != null)) chipBad.push(`${k}: a static chip is focusable`);
    const want = def.sr ?? FS.speakFigure(def.label);
    if (sr[0] && textOf(sr[0]) !== want) chipBad.push(`${k}: sr "${textOf(sr[0])}"`);
    // the button form
    const bt = R(createElement(HC.HonestyChip, { kind: k, full: `Full text of ${k}.`, id: `p-${k}` }));
    if (!new RegExp(`^<button type="button" class="mg-hcb" data-hc="${k}" aria-expanded="false" aria-controls="p-${k}">[\\s\\S]*</button><span id="p-${k}" class="mg-tp" data-hc-panel="${k}" hidden="">Full text of ${k}\\.</span>$`).test(bt)) chipBad.push(`${k}: button form ${bt.slice(0, 120)}`);
  }
  check("HonestyChip: every kind holds its full string once (sr-only static; the panel for a button), glyph and label aria-hidden, not focusable when static", chipBad.length === 0, chipBad.slice(0, 6).join("; "));
  function ancestorsOfIn(root: PNode, target: PNode): PNode[] {
    const path: PNode[] = [];
    const find = (n: PNode, trail: PNode[]): boolean => {
      if (n === target) {
        path.push(...trail);
        return true;
      }
      return (n.children ?? []).some((c) => find(c, [...trail, n]));
    };
    find(root, []);
    return path;
  }
  function textOf(n: PNode): string {
    return n.text != null ? n.text : (n.children ?? []).map(textOf).join("");
  }
  check(
    "HonestyChip: a button chip has a real 40 × 40 box (min-height and min-width 40, negative block margins of 8)",
    /\.mg-hcb \{[^}]*min-height: 40px;[^}]*min-width: 40px;[^}]*margin: -8px 0;/.test(glyphCss)
  );
  check("HonestyChip: chip rows keep column gap ≥ 8 and row gap ≥ 16 (D31)", /\.mg-chips \{[^}]*column-gap: 8px;[^}]*row-gap: 16px;/.test(glyphCss));
  const geminiLabels = HC.GEMINI_KINDS.filter((k) => !/Gemini/.test(HC.HONESTY_KINDS[k].label));
  check("HonestyChip: the Gemini kinds' visible labels contain \"Gemini\" (D25)", geminiLabels.length === 0, geminiLabels.join(", "));
  let threw = false;
  try {
    R(createElement(HC.HonestyChip, { kind: "gemini", label: "not checked" }));
  } catch {
    threw = true;
  }
  check("HonestyChip: a bare \"not checked\" on a Gemini mark throws in development", threw);
  eq(
    "HonestyChip: the static constants are roadmap-copy's (DRAFT, KEPT_SUGGESTION, GEMINI_CHOICE_WORDS, CHECKPOINT caption)",
    [HC.HONESTY_KINDS.gemini.sr, HC.HONESTY_KINDS["gemini-kept"].sr, HC.HONESTY_KINDS["gemini-pick"].sr, HC.HONESTY_KINDS["context-only"].sr],
    [copy.PROVENANCE_WORDS.DRAFT, copy.PROVENANCE_WORDS.KEPT_SUGGESTION, copy.GEMINI_CHOICE_WORDS, copy.WEEK_QUEST_CAPTIONS.CHECKPOINT]
  );
  check("HonestyChip: the health chip keeps the instruction (\"Not medical advice · ask a professional\")", HC.HONESTY_KINDS.health.label === "Not medical advice · ask a professional" && HC.HONESTY_KINDS.health.button);
  const vw: string[] = [];
  for (const v of Object.keys(HC.VERDICT_WORDS) as (keyof typeof HC.VERDICT_WORDS)[]) for (const u of [false, true]) if (HC.verdictWordOf(v, u) !== copy.verdictWord(v, u)) vw.push(`${v}/${u}`);
  check("VerdictChip: its word is roadmap-copy verdictWord's (\"Unverified · Fits\")", vw.length === 0, vw.join(", "));
  check("VerdictChip: an unverified verdict shows v.unv before its own glyph", /data-g="v\.unv"[\s\S]*data-g="v\.fits"[\s\S]*Unverified · Fits/.test(R(createElement(HC.VerdictChip, { verdict: "FITS", unverified: true }))));
  eq(
    "ProvMark: the sr words are the current ones",
    provMarkup.map((m) => /<span class="sr-only">([^<]*)<\/span>/.exec(m)?.[1]),
    // ui-motion §15.1 (revision 5): PROVMARK_NAMES gains pv.library («Your Domain») and pv.named («named by Gemini», D33).
    ["Written by the app", "added by the app", "worked out by the app", "You wrote this", "You checked this", "Your syllabus line", "Your Domain", "named by Gemini"]
  );
  eq(
    "ProvMark: the words match roadmap-copy (provenanceChipWords, PROVENANCE_WORDS.WORKED_OUT, the added line)",
    [G.PROVMARK_WORDS["app-written"], G.PROVMARK_WORDS["app-worked"], G.PROVMARK_WORDS.you, G.PROVMARK_WORDS.checked, G.PROVMARK_WORDS["app-added"]],
    [copy.provenanceChipWords("WORKED_OUT", false), copy.PROVENANCE_WORDS.WORKED_OUT, copy.provenanceChipWords("YOURS", false), copy.provenanceChipWords("YOURS", true), "added by the app"]
  );
  check("ProvMark: \"added by the app\" and \"Your syllabus line\" are still roadmap words", /"added by the app"/.test(read("src/components/roadmap/roadmap-copy.ts")) && /Your syllabus line/.test(read("src/components/roadmap/ProvenanceChip.tsx")));
  eq("KindGlyph: the sr captions are WEEK_QUEST_CAPTIONS", G.QUEST_KINDS.map((k) => G.KIND_WORDS[k]), ["RAISE", "ADD", "PRACTICE", "STEP", "CHECKPOINT"].map((k) => copy.WEEK_QUEST_CAPTIONS[k as keyof typeof copy.WEEK_QUEST_CAPTIONS]));
  eq("RankSeal: the rank words are AIM_RANKS", [...RANK_WORDS], [...AIM_RANKS]);
  check(
    "InfoTip: a closed tip is a 40 px button (About {topic}, aria-expanded, aria-controls) with its hidden panel right after, holding the text verbatim",
    tipMarkup ===
      '<button type="button" class="mg-tip" data-tip="info" aria-label="About setting an aim" aria-expanded="false" aria-controls="tip1">' +
        glyphButtonInner() +
        '</button><span id="tip1" class="mg-tp" data-tip-panel="info" hidden="">The form lead, verbatim.</span>',
    tipMarkup.slice(0, 300)
  );
  function glyphButtonInner() {
    return R(createElement(G.Glyph, { name: "m.info", inherit: true }));
  }
  check("InfoTip: its CSS box is at least 40 × 40", /\.mg-tip \{[^}]*width: 40px; height: 40px; min-width: 40px; min-height: 40px;/.test(glyphCss));
  check("CardKey: the Key lists each glyph with its words and every per-row line", /data-tip="key"/.test(keyMarkup) && /tested by your reviews/.test(keyMarkup) && /Row 1: from your words/.test(keyMarkup) && /class="mg-key"/.test(keyMarkup));
  check("CardKey: phrasing content only (role=list spans, no <ul>/<li>), so a key inside a <p> never breaks hydration", !/<ul\b|<li\b/.test(keyMarkup) && /role="list"/.test(keyMarkup) && /role="listitem"/.test(keyMarkup));
  const tipCounts = composites.map((m) => (m.match(/class="mg-tip"/g) ?? []).length);
  check("InfoTip: no composite renders more than 3 InfoTips (the Key counts as one)", tipCounts.every((n) => n <= 3));
  {
    const target = new FEl("textarea");
    target.setAttribute("aria-describedby", "count");
    const undo = wireDescribedBy(target as unknown as Element, "tip1");
    const wired = target.getAttribute("aria-describedby");
    undo();
    check(
      "InfoTip: `describes` wires aria-describedby on the target control (token-merged, undone on unmount)",
      wired === "count tip1" && target.getAttribute("aria-describedby") === "count" && /wireDescribedBy\(document\.getElementById\(describes\), panelId\)/.test(read("src/components/glyph/InfoTip.tsx"))
    );
  }

  // ── 6. Composites at 344 ──────────────────────────────────────────────────
  console.log("— composites at 344 —");
  const sl = tree(ladderMarkup);
  const cols = elementsOf(sl).filter((e) => cls(e).includes("mg-sl-c"));
  const nums = elementsOf(sl).filter((e) => cls(e).includes("mg-sl-n")).map(textOf).filter(Boolean);
  check(
    "StageLadder: an aria-hidden 12-column HTML grid; gate numerals 4 · 6 · 8 · 10 · 12 are HTML; the gap bar has no viewBox",
    /^<div class="mg-sl" aria-hidden="true"/.test(ladderMarkup) && cols.length === 12 && JSON.stringify(nums) === '["4","6","8","10","12"]' && !/viewBox="[^"]*"[^>]*class="mg-sl-gap"|class="mg-sl-gap"[^>]*viewBox/.test(ladderMarkup) && /repeat\(var\(--sl-n, 12\), minmax\(0, 1fr\)\); height: 56px;/.test(glyphCss)
  );
  check("StageLadder: lit up to the chosen depth, a flag at the exam level", cols.filter((c) => c.attrs?.["data-on"] != null).length === 10 && /data-level="8"[^>]*>[\s\S]*?mg-sl-ex/.test(ladderMarkup));
  const tb = tree(tbMarkup);
  const tbRoot = elementsOf(tb)[0];
  const tbSvg = elementsOf(tb).find((e) => e.tag === "svg");
  const tbList = elementsOf(tb).find((e) => e.tag === "ul");
  check(
    "TimeBar: role=group labelled by the realism sentence; the line SVG is aria-hidden with no viewBox; one list item per marker",
    tbRoot.attrs?.role === "group" && tbRoot.attrs?.["aria-labelledby"] === "realism" && tbSvg?.attrs?.["aria-hidden"] === "true" && tbSvg?.attrs?.viewBox == null && (tbList?.children ?? []).filter((c) => c.tag === "li").length === 4 && cls(tbList!).includes("sr-only")
  );
  check("TimeBar: the exam waypoint and earliest sentences are in the accessibility tree (not aria-hidden, not role=img)", !ancestorsOfIn(tb, tbList!).some((a) => a.attrs?.["aria-hidden"] === "true" || a.attrs?.role === "img"));
  check("TimeBar: a 40 px Dates toggle controls that list", /<button type="button" class="mg-tb-dates" aria-expanded="false" aria-controls="([^"]+)">Dates<\/button><\/div><ul id="\1"/.test(tbMarkup) && /\.mg-tb-dates \{ min-height: 40px; min-width: 40px;/.test(glyphCss));
  const W = 278;
  const lab = "4 May 27 · Retained";
  const placed = placeLabels([0.4, 0.4 + 40 / W, 0.4 + 80 / W, 0.4 + 120 / W].map((x) => ({ x, text: lab })), W);
  check(
    "TimeBar: the placer puts three marks 40 px apart on rows 1, 2, 3 with no overlap, and drops a fourth to the list only",
    textWidth12(lab) > 48 && JSON.stringify(placed.map((p) => p.row)) === "[1,2,3,null]",
    JSON.stringify(placed)
  );
  eq("TimeBar: 52, 68 or 84 px by row count", [1, 2, 3].map(timeBarHeight), [52, 68, 84]);
  const crowd = R(createElement(TimeBar, { ...tbProps, realistic: { ...tbProps.realistic, day: "2027-12-20" }, earliest: { ...tbProps.earliest, day: "2027-12-18" }, mine: { ...tbProps.mine, day: "2027-12-22" }, exam: { ...tbProps.exam, day: "2027-12-24" } }));
  check("TimeBar: a crowded bar draws ≤ 3 label rows, the rest only in its list", (crowd.match(/class="mg-tb-l"/g) ?? []).length === 3 && (crowd.match(/<li /g) ?? []).length === 4 && /data-rows="3"/.test(crowd));
  const railStates = elementsOf(tree(railMarkup)).filter((e) => cls(e).includes("mg-rr-row")).map((e) => e.attrs?.["data-state"]);
  check("RouteRail: renders every MilestoneRowState (and held), role list, one label per node", JSON.stringify(railStates) === JSON.stringify(RAIL_STATES) && (railMarkup.match(/class="sr-only"/g) ?? []).length === RAIL_STATES.length);
  const visibleRail = visibleText(railMarkup);
  check("RouteRail: pending, closed and past-due nodes keep their words visible", /counts from Thu/.test(visibleRail) && /Closed at 82% · not reached/.test(visibleRail) && /Past due/.test(visibleRail) && /Slipped/.test(visibleRail));
  check("RouteRail: the strip's current node is the measured arc, never a half disc", /data-state="CURRENT"[\s\S]*?class="mg-rr-arc"[^>]*stroke-dasharray="23 100"/.test(stripMarkup) && !/a12 12 0 0 1 0 24z/.test(stripMarkup));
  const restingClasses = elementsOf(tree(railMarkup + stripMarkup + sealsAll)).flatMap(cls);
  check("no pulse: the rail's current and pending nodes and RankSeal's next rank carry no animation class", !restingClasses.some((c) => /pulse|anim|breathe|blink|glow|spin|shimmer/.test(c)));
  check("RouteRail: rows are 44 px, the strip a repeat(n, 1fr) grid of 16 px nodes", /\.mg-rr-d > summary, \.mg-rr-flat \{[^}]*min-height: 44px;/.test(glyphCss) && /grid-template-columns: repeat\(var\(--rr-n, 6\), minmax\(0, 1fr\)\)/.test(glyphCss) && /\.mg-rr-strip \.mg-rr-node \{[^}]*width: 16px; height: 16px;/.test(glyphCss));
  check("RouteRail: segments are never dashed (2 px ink-0 to the last counted reach, 1 px ink-mute after)", !/mg-rr-seg[^>]*stroke-dasharray/.test(railMarkup) && /\.mg-rr-seg\[data-on\] line \{ stroke: var\(--ink-0\); stroke-width: 2; \}/.test(glyphCss));
  const words344 = countAppWords(railMarkup + tbMarkup + ladderMarkup, { width: 344 });
  check("word-count: composites count (the rail's words are aria-hidden but visible, so counted; figures exempt)", words344.count > 0 && !words344.words.includes("4") && !words344.words.includes("82%"), words344.words.join(" "));
  const sample =
    '<div>Week quests · until Sun <span data-wc="honest">pays nothing</span><span class="sr-only">hidden words</span><svg><text>x</text></svg><details><summary>More</summary>secret words</details><p hidden>gone</p> 3 cards 41% ≈ 9 h <b data-wc="own">my aim</b> Mon 4 Oct</div>';
  eq("word-count: §3.1 on a sample (sr-only, hidden, svg, closed details, data-wc, figures, units, separators, dates)", countAppWords(sample).words, ["Week", "quests", "until", "Sun", "More"]);
  eq("word-count: an open <details> counts its content", countAppWords("<details open><summary>More</summary>two words</details>").count, 3);
  eq("word-count: the visible view keeps the exempt words", visibleText(sample).includes("pays nothing") && !visibleText(sample).includes("hidden words"), true);

  // the gallery (/dev/style/glyphs) renders every glyph × state, the composites at 278 px, ≤ 3 InfoTips a box
  try {
    const { GlyphGallery } = await import("../src/app/dev/style/glyphs/GlyphGallery");
    const gallery = R(createElement(GlyphGallery, { level: null, theme: null }));
    const shown = new Set([...gallery.matchAll(/data-g="([^"]+)" data-s="(idle|active|done)"/g)].map((m) => `${m[1]}|${m[2]}`));
    const missing = GLYPH_NAMES.flatMap((n) => GLYPH_STATES.map((s) => `${n}|${s}`)).filter((k) => !shown.has(k) && !k.startsWith("quest."));
    const questShown = G.QUEST_KINDS.every((k) => GLYPH_STATES.every((s) => gallery.includes(`data-kg="${k}" data-s="${s}"`)));
    check("gallery: /dev/style/glyphs renders every glyph in idle, active and done (quests as KindGlyphs)", missing.length === 0 && questShown, missing.slice(0, 6).join(", "));
    check("gallery: the composites sit in 312 px frames (a 278 px card content box) and the page emits its GlyphDefs", /data-glyph-defs="gx"/.test(gallery) && /\.gxl-frame \{ width: 312px; max-width: 100%;/.test(read("src/app/dev/style/glyphs/glyphs.css")) && /\.gxl-card \{[^}]*padding: 16px;/.test(read("src/app/dev/style/glyphs/glyphs.css")));
    check("gallery: no SVG text, no `title`, ≤ 3 InfoTips in any box", !/<text[\s>]/.test(gallery) && !/ title="/.test(gallery) && gallery.split('class="gxl-card"').every((b) => (b.match(/class="mg-tip"/g) ?? []).length <= 3));
    const page = read("src/app/dev/style/glyphs/page.tsx");
    check("gallery: gated like every /dev/style page and read per request (?motion, ?theme)", /devStyleEnabled\(\)\) notFound\(\)/.test(page) && /export const dynamic = "force-dynamic"/.test(page) && /await searchParams/.test(page));
  } catch (err) {
    check("gallery: /dev/style/glyphs renders", false, String(err).slice(0, 300));
  }

  // ── 7. CSS ────────────────────────────────────────────────────────────────
  console.log("— glyph.css —");
  check("css: glyph.css starts with the layer order", glyphCss.split(/\r?\n/)[0].trim() === "@layer theme, base, components, art, effects, utilities;");
  const cssCode = code(glyphCss);
  const kfs = [...cssCode.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
  check("css: the only keyframes are mg-breathe, opacity only", kfs.length === 1 && kfs[0][1] === "mg-breathe" && [...kfs[0][2].matchAll(/([a-z-]+)\s*:/g)].every((m) => m[1] === "opacity"));
  const anims = [...cssCode.matchAll(/(?:^|[;{\s])animation(?:-name)?\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
  const breathe = /\[data-wait\]:not\(\[data-weave-live\]\):not\(\[data-paused\]\) svg\.mg-weave \{\s*animation: mg-breathe 1200ms ease-in-out (\d+) alternate;\s*animation-play-state: var\(--ambient-play\);\s*\}/.exec(cssCode);
  const iters = Number(breathe?.[1] ?? 0);
  check(
    "css: glyph.css's one animation is mg-breathe on svg.mg-weave under [data-wait]:not([data-weave-live]):not([data-paused]), ≤ 74 even iterations, alternate, --ambient-play",
    anims.length === 1 && breathe != null && iters <= 74 && iters % 2 === 0 && /@layer effects \{[\s\S]*mg-breathe/.test(cssCode),
    anims.join(" | ")
  );
  check("css: no infinite loop, no 'spin' or 'shimmer'", !/infinite|spin|shimmer/.test(cssCode));
  const trans = [...cssCode.matchAll(/transition\s*:\s*([^;}]+)/g)].map((m) => m[1].trim().split(/\s+/)[0]);
  check("css: transitions move transform or opacity only (never layout)", trans.every((p) => p === "transform" || p === "opacity"), trans.join(", "));
  const small = [...cssCode.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?([\d.]+)px/g)].map((m) => Number(m[1])).filter((v) => v < 12);
  check("css: no text under 12 px", small.length === 0, small.join(", "));
  const KIT = new Set(["chip", "icon-btn", "sr-only", "meter"]);
  const classes = new Set([...cssCode.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)));
  const foreign = [...classes].filter((c) => !c.startsWith("mg-") && c !== "mg" && !KIT.has(c));
  check("css: every class glyph.css styles is mg-* (kit classes only as context)", foreign.length === 0, foreign.join(", "));
  const galleryCss = read("src/app/dev/style/glyphs/glyphs.css");
  const galleryClasses = new Set([...code(galleryCss).matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]));
  try {
    const { compile } = await import("tailwindcss");
    const twDir = join(ROOT, "node_modules/tailwindcss");
    const tw = await compile(read("src/app/globals.css"), {
      base: join(ROOT, "src/app"),
      loadStylesheet: async (id: string, b: string) => {
        if (id === "tailwindcss") return { path: join(twDir, "index.css"), base: twDir, content: readFileSync(join(twDir, "index.css"), "utf8") };
        if (b.startsWith(twDir)) return { path: join(b, id), base: twDir, content: readFileSync(join(b, id), "utf8") };
        return { path: join(b, id), base: b, content: "" };
      },
    });
    const mine = [...classes, ...galleryClasses].filter((c) => c.startsWith("mg") || c.startsWith("gxl-"));
    const before = tw.build([]);
    const after = tw.build(mine);
    const hits = mine.filter((n) => after.includes(`.${n} {`) && !before.includes(`.${n} {`));
    check("css: no mg-* or gxl-* class is also a Tailwind utility", hits.length === 0 && tw.build(["block"]).includes(".block {"), hits.join(", "));
  } catch (err) {
    check("css: the Tailwind probe compiled", false, String(err).slice(0, 200));
  }
  const usedMg = new Set<string>();
  for (const f of [...glyphFiles.filter((f) => f.endsWith(".tsx")), "src/lib/glyph-motion.ts"])
    for (const lit of code(read(f)).matchAll(/["'`]([^"'`\n]*\bmg-[^"'`\n]*)["'`]/g)) for (const m of lit[1].matchAll(/mg-[\w-]+(?![\w$-])/g)) if (!m[0].endsWith("-")) usedMg.add(m[0]);
  // family classes (mg-{family}) and motion hooks on parts are selectors, not styles
  const HOOKS = new Set([...Object.keys(paths.FAMILY_NAMES).map((f) => `mg-${f}`), "mg-ok", "mg-strike", "mg-dm-t", "mg-slot", "mg-pip", "mg-dot"]);
  const undefinedMg = [...usedMg].filter((c) => !classes.has(c) && !HOOKS.has(c));
  check("css: every mg-* class a component uses is defined in glyph.css (family classes aside)", undefinedMg.length === 0, undefinedMg.join(", "));

  // ── 8. Code rules ─────────────────────────────────────────────────────────
  console.log("— code rules —");
  const srcFiles = walkFiles("src").filter((f) => /\.(tsx?|mjs)$/.test(f));
  const animateOutside = srcFiles.filter((f) => f !== "src/lib/motion.ts" && /\.animate\(/.test(code(read(f))));
  check("gateway: no element.animate( outside src/lib/motion.ts", animateOutside.length === 0, animateOutside.join(", "));
  const gm = read("src/lib/glyph-motion.ts");
  const gmImports = [...code(gm).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  check("glyph-motion: imports only motion.ts and celebrate's announce", gmImports.length === 2 && gmImports.includes("./motion") && gmImports.includes("./celebrate") && /import \{ announce as celebrateAnnounce \} from "\.\/celebrate"/.test(gm));
  const spinBad = [...glyphFiles, "src/lib/glyph-motion.ts", "src/lib/figure-speech.ts"].filter((f) => /spin|shimmer/i.test(code(read(f))));
  check("names: no identifier, class or keyframe in the glyph lane contains 'spin' or 'shimmer'", spinBad.length === 0, spinBad.join(", "));
  const callSites = [...walkFiles("src/components/glyph"), ...walkFiles("src/components/roadmap")].filter((f) => /\.tsx?$/.test(f));
  const valueMotion: string[] = [];
  for (const f of callSites) for (const line of code(read(f)).split("\n")) if (/\b(countTo|roll)\(/.test(line) && /≈|estimate|stated|unverified|bestCase|Gemini/i.test(line)) valueMotion.push(`${f}: ${line.trim().slice(0, 80)}`);
  check("H3: no countTo or roll on a value marked ≈, estimate, stated, unverified, best case or Gemini", valueMotion.length === 0, valueMotion.join("; "));
  const whatKeys = new Set<string>();
  for (const f of walkFiles("src/components/glyph")) for (const m of code(read(f)).matchAll(/what: "([^"]+)"/g)) whatKeys.add(m[1]);
  const surfacey = [...whatKeys].filter((w) => /you|roadmap|today|card|header|page|aim/i.test(w));
  check("seen keys: the rank, reach, date and seal keys name no surface", whatKeys.has("rank") && whatKeys.has("reach") && surfacey.length === 0, [...whatKeys].join(", "));
  const activity = read("src/components/roadmap/ActivityConfirm.tsx");
  check("safety: the Activities components carry no data-play, .mg-weave or .shd", !/data-play|mg-weave|\bshd\b/.test(code(activity)));

  // ── 9. Motion through the gateway (a fake DOM) ────────────────────────────
  console.log("— motion —");
  const announced: string[] = [];
  const bursts: unknown[][] = [];
  const restoreHooks = GM.__setGlyphMotionHooks({ announce: (t: string) => void announced.push(t), burst: (...a: unknown[]) => void bursts.push(a) });
  installDom();
  type Target = { motion: (typeof GM.GLYPH_MOTIONS)[number]; el: () => FEl | null; opts?: Record<string, unknown> };
  const targets: Target[] = [
    { motion: "build", el: () => fake(glyphMarkup("stage.mastered", "done")).querySelector("svg") },
    { motion: "reach", el: () => fake(R(createElement(RouteRail, { nodes: [{ n: 1, state: "REACHED", gate: "foundation", label: "1" }, { n: 2, state: "REACHED", rankIndex: 2, label: "2" }, { n: 3, state: "CURRENT", pct: 10, label: "3" }] }))).querySelector('[data-n="2"]') },
    { motion: "start", el: () => fake(railMarkup).querySelector('[data-state="CURRENT"] .mg-rr-node') },
    { motion: "rank-rise", el: () => fake(R(createElement(RankSeal, { index: 2, size: 48, state: "done" }))).querySelector(".mg-rs"), opts: { name: "Journeyman", seed: "aimrank:rm1:2" } },
    { motion: "quest-done", el: () => fake(R(createElement(G.KindGlyph, { kind: "raise", state: "done" }))).querySelector(".mg-kg") },
    { motion: "step-done", el: () => fake('<svg class="mg"><path d="M6 12.5l4 4 8-8.5" data-part="mark" pathLength="100"/></svg>').querySelector("svg") },
    { motion: "pv-confirm", el: () => fake(R(createElement(G.ProvMark, { cls: "checked", confirming: true }))).querySelector("svg") },
    { motion: "verdict-change", el: () => fake(glyphMarkup("v.over", "active")).querySelector("svg") },
    { motion: "ladder", el: () => fake(ladderMarkup).querySelector(".mg-sl") },
    { motion: "bars", el: () => fake(glyphMarkup("intensity.push", "idle")).querySelector("svg") },
    { motion: "date-moved", el: () => fake(tbMarkup).querySelector('.mg-tb-m[data-k="realistic"]') },
    { motion: "pay-swap", el: () => fake('<span class="num">6</span>').querySelector("span"), opts: { text: "4" } },
    { motion: "unlock", el: () => fake(glyphMarkup("m.lock", "idle", { open: true })).querySelector("svg") },
    { motion: "meter-fill", el: () => fake('<div class="meter"><i></i></div>').querySelector(".meter"), opts: { from: 0.3, to: 0.41 } },
    { motion: "horizon-front", el: () => fake('<div class="shd"><svg class="shd-marks"><path class="shd-walk"></path><circle class="shd-front"></circle></svg></div>').querySelector(".shd"), opts: { walk: [30, 41], front: Array.from({ length: 8 }, (_, i) => [-(7 - i) * 3, 0]) } },
    { motion: "seal-reached", el: () => fake(glyphMarkup("m.seal", "idle")).querySelector("svg") },
    { motion: "tip-open", el: () => fake('<span class="mg-tp">x</span>').querySelector("span") },
    { motion: "kindle", el: () => fake(glyphMarkup("flame", "done")).querySelector("svg") },
    // Revision 5 (ui-motion §15.9): the topic map's three motions, on the parts their selectors name.
    { motion: "trace", el: () => fake('<section><ul><li data-trace="self"><span class="rm-tm-rail"></span></li><li data-trace="rel"><span class="rm-tm-rail"></span></li><li data-trace="other"><span class="rm-tm-rail"></span></li></ul></section>').querySelector("section") },
    { motion: "layer-open", el: () => fake(`<li data-n="2">${glyphMarkup("layer.2", "idle")}<span data-lo="badge">b</span><span data-lo="word">after 1</span></li>`).querySelector("li"), opts: { text: "open" } },
    { motion: "estimate-swap", el: () => fake('<span class="rm-es"><span>4 layers</span></span>').querySelector("span") },
  ];
  check("motion: every named motion has a fixture here", GM.GLYPH_MOTIONS.every((m) => targets.some((t) => t.motion === m)));
  const lic = (m: (typeof GM.GLYPH_MOTIONS)[number]) => GM.MOTION_LICENCE[m];
  const run = async (t: Target, level: "full" | "calm" | "still", accent = false) => {
    setLevel(level);
    CALLS.length = 0;
    const el = t.el();
    const p = GM.playGlyph(el as unknown as Element, t.motion, { licence: lic(t.motion), accent, ...(t.opts ?? {}) } as never);
    const sync = CALLS.length;
    await p;
    await tick(1);
    return { el, sync, calls: [...CALLS] };
  };
  // still: nothing
  const stillBad: string[] = [];
  announced.length = 0;
  for (const t of targets) {
    const r = await run(t, "still");
    if (r.calls.length) stillBad.push(`${t.motion}: ${r.calls.length}`);
  }
  check("still: playGlyph calls element.animate 0 times for every motion", stillBad.length === 0, stillBad.join(", "));
  check("still: rank-rise still announces, once", announced.length === 1 && announced[0] === "Aim rank Journeyman reached", JSON.stringify(announced));
  // calm: opacity only, ≤ 260 ms, delay ≤ 200; no ping, rim or notch; no burst
  const calmBad: string[] = [];
  let calmCalls = 0;
  announced.length = 0;
  bursts.length = 0;
  for (const t of targets) {
    const r = await run(t, "calm");
    calmCalls += r.calls.length;
    for (const c of r.calls) {
      const keys = new Set(c.frames.flatMap((f) => Object.keys(f).filter((k) => k !== "offset" && k !== "easing" && k !== "composite")));
      if ([...keys].some((k) => k !== "opacity")) calmBad.push(`${t.motion}: ${[...keys].join("+")}`);
      if ((c.opts.duration as number) > 260 || ((c.opts.delay as number) ?? 0) > 200) calmBad.push(`${t.motion}: ${c.opts.duration}/${c.opts.delay}`);
      if (c.el.getAttribute("data-part") === "ping") calmBad.push(`${t.motion}: ping`);
    }
    if (t.motion === "rank-rise" && (r.calls.length !== 1 || r.calls[0].el.tagName !== "SVG")) calmBad.push(`rank-rise: ${r.calls.length} calls (rim and notches must not run)`);
    if (t.motion === "start" && r.calls.some((c) => c.el.getAttribute("data-part") !== "ring")) calmBad.push("start: the ping ran");
  }
  check("calm: the fades still run (opacity, not nothing)", calmCalls >= 15, String(calmCalls));
  check("calm: every motion passes opacity keyframes only, ≤ 260 ms and ≤ 200 ms delay; ping, rim and notch make no call", calmBad.length === 0, calmBad.join("; "));
  check("calm: no burst; rank-rise announces once", bursts.length === 0 && announced.length === 1);
  const gatewayBefore = body.children.length;
  setLevel("calm");
  motion.burst(10, 10, 8, "calm-check");
  check("calm: the gateway's burst creates 0 motes", body.children.length === gatewayBefore);
  // full: chains created up front, fill 'backwards'
  const fullBad: string[] = [];
  // estimate-swap is a crossfade (§15.9); so is layer-open's state word (its [data-lo="word"] part).
  const CROSSFADES = new Set(["date-moved", "pay-swap", "estimate-swap"]);
  announced.length = 0;
  bursts.length = 0;
  for (const t of targets) {
    const r = await run(t, "full");
    if (r.calls.length === 0 && t.motion !== "tip-open") fullBad.push(`${t.motion}: no call`);
    if (r.sync !== r.calls.length) fullBad.push(`${t.motion}: ${r.calls.length - r.sync} parts started late (awaited)`);
    for (const c of r.calls) {
      const fill = c.opts.fill;
      const flicker = t.motion === "kindle" && c.el.getAttribute("class")?.includes("mg-core");
      const wordSwap = t.motion === "layer-open" && c.el.getAttribute("data-lo") === "word";
      if (!CROSSFADES.has(t.motion) && !flicker && !wordSwap && fill !== "backwards") fullBad.push(`${t.motion}: fill ${fill}`);
    }
    const end = Math.max(0, ...r.calls.map((c) => ((c.opts.delay as number) ?? 0) + ((c.opts.duration as number) ?? 0)));
    if (end > GM.GLYPH_DUR.chainMax) fullBad.push(`${t.motion}: ${end} ms`);
  }
  check("full: every chain issues all its parts' calls at once (no await between parts), each fill 'backwards', each ≤ 1.6 s", fullBad.length === 0, fullBad.join("; "));
  check("full: rank-rise bursts 8 ink motes with its seed and announces once", bursts.length === 1 && bursts[0][2] === 8 && bursts[0][3] === "aimrank:rm1:2" && (bursts[0][4] as { color: string }).color === "var(--ink-1)" && announced.length === 1, JSON.stringify(bursts));
  const startRun = await run(targets.find((t) => t.motion === "start")!, "full");
  const startBad = startRun.calls.filter((c) => c.frames.some((f) => Object.keys(f).some((k) => !["opacity", "transform", "offset", "easing"].includes(k)) || (typeof f.transform === "string" && !/^scale\(/.test(f.transform))));
  check("start: only opacity and scale on the here-ring and its ping (no dashoffset sweep on a ring)", startRun.calls.length === 2 && startBad.length === 0);
  const reachRun = await run(targets.find((t) => t.motion === "reach")!, "full");
  check("reach: the segment draws, the node stamps (from 300), the cut-out builds (from 560); ≤ 1.04 s", reachRun.calls.length >= 4 && Math.max(...reachRun.calls.map((c) => ((c.opts.delay as number) ?? 0) + ((c.opts.duration as number) ?? 0))) <= 1040);
  // accents: in view at hydration never hides, zeroes or un-draws a part (H15)
  const hides = (f: Keyframe) =>
    f.opacity === 0 || f.opacity === "0" || Number(f.strokeDashoffset) === 100 || (typeof f.transform === "string" && /scale[XY]?\(0(\.0*)?\)|scale\(0(\.0*)?,/.test(f.transform));
  const accentBad: string[] = [];
  let accentCalls = 0;
  bursts.length = 0;
  announced.length = 0;
  for (const t of targets.filter((x) => lic(x.motion) === "SEEN")) {
    const r = await run(t, "full", true);
    accentCalls += r.calls.length;
    if (r.calls.length === 0) accentBad.push(`${t.motion}: no accent`);
    for (const c of r.calls) if (c.frames.some(hides)) accentBad.push(`${t.motion}: ${JSON.stringify(c.frames[0])}`);
    if (t.motion === "rank-rise") {
      await tick(260);
      if (bursts.length !== 1 || announced.length !== 1) accentBad.push("rank-rise accent: burst + announce");
    }
  }
  check("H15: the accents ran", accentCalls >= 8, String(accentCalls));
  check("H15: in view at hydration, every SEEN motion plays its accent only — no keyframe hides, zeroes or un-draws a part", accentBad.length === 0, accentBad.join("; "));
  // licences
  let noLicence = false;
  let wrongLicence = false;
  try {
    GM.playGlyph(fake("<svg></svg>").querySelector("svg") as unknown as Element, "build", {} as never);
  } catch {
    noLicence = true;
  }
  try {
    GM.playGlyph(fake("<svg></svg>").querySelector("svg") as unknown as Element, "build", { licence: "ACT" });
  } catch {
    wrongLicence = true;
  }
  check("H1: playGlyph without a licence, or with another motion's, throws in development", noLicence && wrongLicence);
  eq(
    "H1: the six licences, and each motion's own (§4.7)",
    [GM.LICENCES, GM.MOTION_LICENCE["date-moved"], GM.MOTION_LICENCE.reach, GM.MOTION_LICENCE["rank-rise"], GM.MOTION_LICENCE.start, GM.MOTION_LICENCE["tip-open"]],
    [["ACT", "SEEN", "CHANGED", "WAIT", "AMBIENT", "STATIC"], "CHANGED", "SEEN", "SEEN", "ACT", "ACT"]
  );
  // safety: never a safe.* or sess.* glyph, never inside [data-safety]
  setLevel("full");
  const safetyCalls: string[] = [];
  for (const name of [...paths.FAMILY_NAMES.safety, ...paths.FAMILY_NAMES.session]) {
    CALLS.length = 0;
    await GM.playGlyph(fake(glyphMarkup(name, "idle")).querySelector("svg") as unknown as Element, "seal-reached", { licence: "SEEN" });
    if (CALLS.length) safetyCalls.push(name);
  }
  CALLS.length = 0;
  await GM.playGlyph(fake('<div data-safety=""><span class="mg-tp">x</span></div>').querySelector(".mg-tp") as unknown as Element, "tip-open", { licence: "ACT" });
  check("safety: glyph-motion never moves a safe.* or sess.* glyph, and a tip on a safety surface opens instantly", safetyCalls.length === 0 && CALLS.length === 0, safetyCalls.join(", "));
  // sequence and SINCE_LINE (H13)
  const order: string[] = [];
  GM.sequence({ order: 2, run: async () => void order.push("rank-rise") });
  GM.sequence({ order: 1, run: async () => void order.push("reach") });
  await tick(200);
  eq("H13: reach and rank-rise are separate events; collected together, reach plays first", order, ["reach", "rank-rise"]);
  const since = GM.sequenceAtMount(["milestone 2 reached", "date moved to 7 Mar", "rank Journeyman", "seal", "meter", "pace", "measure"]);
  check("H13: more than 6 pending at mount → none plays, one SINCE_LINE with ≤ 3 items and \"+ n more\"", since != null && since.items.length === 3 && since.more === 4 && since.text === "Since you last looked: milestone 2 reached · date moved to 7 Mar · rank Journeyman + 4 more");
  check("H13: 6 pending play normally", GM.sequenceAtMount(["a", "b", "c", "d", "e", "f"]) == null);
  GM.clearSince();
  check("rank-rise: plays only when the counted index rises (never first view, equal, a fall or a pending reach)", rankRiseDecision(1, 2) && !rankRiseDecision(null, 2) && !rankRiseDecision(2, 2) && !rankRiseDecision(3, 2));
  eq("RankSeal: standing alone it reads the full words", rankSealLabel(1, true), "Aim rank Aspirant, 2 of 7, kept for good");

  // ── 10. The seen store and triggers ───────────────────────────────────────
  console.log("— seen —");
  seen.__resetSeenStore();
  LS.clear();
  const K = (what: string, basis = seen.planBasis("2026-10-05", 1)) => ({ roadmapId: "rm1", basis, what });
  const onScreen = (el: FEl) => (el.rect = { left: 0, top: 100, width: 40, height: 40 });
  const offScreen = (el: FEl) => (el.rect = { left: 0, top: 2000, width: 40, height: 40 });
  const ioOf = (margin: boolean) => FakeIO.all.find((o) => (o.opts.rootMargin ?? "").includes("25%") === margin)!;
  const fire = (io: FakeIO, el: FEl, isIntersecting: boolean, ratio: number) => io.cb([{ target: el, isIntersecting, intersectionRatio: ratio }]);
  // first-ever view
  let changes: unknown[] = [];
  const e1 = fake("<span></span>").querySelector("span")!;
  onScreen(e1);
  seen.trackSeenEvent(e1 as unknown as Element, K("rank"), 2, { onChange: (o) => changes.push(o) });
  seen.flushSeen();
  await tick();
  check("seen: a first-ever view does not play, and stores", changes.length === 0 && seen.readSeen(K("rank")) === 2);
  // same value
  seen.trackSeenEvent(e1 as unknown as Element, K("rank"), 2, { onChange: (o) => changes.push(o) });
  await tick();
  check("seen: the same value does not play", changes.length === 0);
  // changed, offscreen: no play, not stored; armed as it approaches; plays once at 50% in view, then stores
  const e2 = fake('<svg class="mg"></svg>').querySelector("svg")!;
  offScreen(e2);
  seen.trackSeenEvent(e2 as unknown as Element, K("rank"), 3, { onChange: (o) => changes.push(o) });
  await tick();
  check("seen: a changed value offscreen does not play and is not stored", changes.length === 0 && seen.readSeen(K("rank")) === 2);
  setLevel("full");
  fire(ioOf(true), e2, true, 0.2);
  check("seen: armed at its from-state while it approaches (data-mg-armed)", e2.hasAttribute("data-mg-armed"));
  onScreen(e2);
  fire(ioOf(false), e2, true, 0.6);
  fire(ioOf(false), e2, true, 0.9);
  seen.flushSeen();
  check(
    "seen: on screen it plays exactly once, not as an accent, disarmed, then stores",
    changes.length === 1 && (changes[0] as { inViewAtHydration: boolean; from: number }).inViewAtHydration === false && (changes[0] as { from: number }).from === 2 && !e2.hasAttribute("data-mg-armed") && seen.readSeen(K("rank")) === 3
  );
  // changed, in view at hydration: the accent, after the mount batch
  changes = [];
  const e3 = fake("<span></span>").querySelector("span")!;
  onScreen(e3);
  seen.trackSeenEvent(e3 as unknown as Element, K("rank"), 4, { onChange: (o) => changes.push(o) });
  check("seen: in view at hydration waits for the mount batch", changes.length === 0);
  await tick();
  check("seen: in view at hydration plays its accent (inViewAtHydration), then stores", changes.length === 1 && (changes[0] as { inViewAtHydration: boolean }).inViewAtHydration && seen.readSeen(K("rank")) === 4);
  // a different basis does not play; a switch-off rebase in the same version is a different basis
  changes = [];
  const basisA: ProficiencyBasis = { basisVersion: 3, cards: [{ measureKey: "d1:6", target: 34 } as never], practice: [{ itemLineageId: "p1", planned: 10 }, { itemLineageId: "p2", planned: 8 }], scheduled: 6 };
  const basisB = basisWithout(basisA, ["p2"]);
  const kA = seen.proficiencyBasis(3, hashSeed(basisSignature(basisA)));
  const kB = seen.proficiencyBasis(3, hashSeed(basisSignature(basisB)));
  check("D8: a SWITCHED_OFF rebase with the same basisVersion gives a different basis key", rebaseCauseOf(basisA, basisB) === "SWITCHED_OFF" && kA !== kB);
  const e4 = fake("<span></span>").querySelector("span")!;
  onScreen(e4);
  seen.trackSeenEvent(e4 as unknown as Element, K("meter:proficiency", kA), 41, { onChange: (o) => changes.push(o) });
  seen.flushSeen();
  seen.trackSeenEvent(e4 as unknown as Element, K("meter:proficiency", kB), 52, { onChange: (o) => changes.push(o) });
  seen.flushSeen();
  await tick();
  check("D8: a key with a different basis does not play (41 → 52% across a rebase is no rise)", changes.length === 0);
  check("D8: the newer basis replaced the older one of its family; the plan basis beside it stays", LS.getItem(seen.entryKeyOf({ roadmapId: "rm1", basis: kA })) === null && LS.getItem(seen.entryKeyOf({ roadmapId: "rm1", basis: kB })) !== null && LS.getItem(seen.entryKeyOf({ roadmapId: "rm1", basis: seen.planBasis("2026-10-05", 1) })) !== null);
  // useSeenValue's step: last seen, never 0 by default, null when equal
  seen.__resetSeenStore();
  LS.clear();
  const kv = K("measure:x");
  const steps = [seen.seenValueStep(kv, 0.3), seen.seenValueStep(kv, 0.41), seen.seenValueStep(kv, 0.41), seen.seenValueStep(kv, 0.2)];
  eq("useSeenValue: null on first view, the last-seen value after, null when equal (either direction)", steps, [null, 0.3, null, 0.41]);
  // storage: one getItem per surface; writes batched per frame
  seen.__resetSeenStore();
  LS.clear();
  LS.setItem(seen.entryKeyOf({ roadmapId: "rm2", basis: "plan/x:1" }), JSON.stringify({ at: 1, e: { a: 1, b: 2, c: 3 } }));
  LS.gets = 0;
  LS.sets = 0;
  const reads = ["a", "b", "c"].map((w) => seen.readSeen({ roadmapId: "rm2", basis: "plan/x:1", what: w }));
  check("storage: a surface reads its entry once (one getItem)", LS.gets === 1 && JSON.stringify(reads) === "[1,2,3]", String(LS.gets));
  seen.writeSeen({ roadmapId: "rm2", basis: "plan/x:1", what: "a" }, 5);
  seen.writeSeen({ roadmapId: "rm2", basis: "plan/x:1", what: "b" }, 6);
  seen.writeSeen({ roadmapId: "rm2", basis: "plan/x:1", what: "d" }, "Mar 2028");
  check("storage: writes wait for the frame", LS.sets === 0);
  seen.flushSeen();
  const stored = JSON.parse(LS.getItem(seen.entryKeyOf({ roadmapId: "rm2", basis: "plan/x:1" }))!);
  check("storage: one batch writes the entry once; a string is stored as its hashSeed", LS.sets === 1 && stored.e.a === 5 && stored.e.d === hashSeed("Mar 2028"));
  // the cap: the 301st value evicts the least recently written roadmap entry
  seen.__resetSeenStore();
  LS.clear();
  for (let r = 0; r < 3; r++) {
    const e: Record<string, number> = {};
    for (let i = 0; i < 100; i++) e[`w${i}`] = i;
    LS.setItem(seen.entryKeyOf({ roadmapId: `old${r}`, basis: "plan/a:1" }), JSON.stringify({ at: 10 + r, e }));
  }
  seen.writeSeen({ roadmapId: "fresh", basis: "plan/a:1", what: "x" }, 1);
  seen.flushSeen();
  const evKeys = [...LS.map.keys()].filter((k) => k.startsWith(seen.SEEN_EV_PREFIX));
  check("storage: ≤ 300 values in all; the 301st evicts the least recently written roadmap entry", evKeys.length === 3 && !evKeys.some((k) => k.includes("old0")) && evKeys.some((k) => k.includes("fresh")), evKeys.join(", "));
  // H13 through the store: > 6 changed at mount → none plays, all stored, the line names them
  seen.__resetSeenStore();
  LS.clear();
  const many = Array.from({ length: 7 }, (_, i) => K(`m${i}`));
  for (const k of many) seen.writeSeen(k, 1);
  seen.flushSeen();
  changes = [];
  for (const k of many) {
    const el = fake("<span></span>").querySelector("span")!;
    onScreen(el);
    seen.trackSeenEvent(el as unknown as Element, k, 2, { label: k.what, onChange: (o) => changes.push(o) });
  }
  await tick();
  seen.flushSeen();
  check("H13: 7 changed events at mount: none plays, every one is stored, one SINCE_LINE", changes.length === 0 && many.every((k) => seen.readSeen(k) === 2) && GM.currentSince()?.more === 4);
  GM.clearSince();
  changes = [];
  const after = fake("<span></span>").querySelector("span")!;
  onScreen(after);
  seen.trackSeenEvent(after as unknown as Element, K("m0"), 3, { onChange: (o) => changes.push(o) });
  await tick();
  check("H13: the skip belongs to that mount only; a later change plays", changes.length === 1 && GM.currentSince() == null);
  // a tracker disposed before its batch settles leaves it: Strict Mode's double effect never counts twice
  seen.__resetSeenStore();
  LS.clear();
  const six = Array.from({ length: 6 }, (_, i) => K(`s${i}`));
  for (const k of six) seen.writeSeen(k, 1);
  seen.flushSeen();
  changes = [];
  for (const k of six) {
    const el = fake("<span></span>").querySelector("span")!;
    onScreen(el);
    const dispose = seen.trackSeenEvent(el as unknown as Element, k, 2, { onChange: (o) => changes.push(o) });
    if (k.what === "s0") {
      dispose();
      seen.trackSeenEvent(el as unknown as Element, k, 2, { onChange: (o) => changes.push(o) });
    }
  }
  await tick();
  check("H13: a tracker disposed before the batch settles leaves it (6 real events still play, once each)", changes.length === 6 && GM.currentSince() == null, String(changes.length));
  // two trackers on one element both hear the observer
  seen.__resetSeenStore();
  LS.clear();
  seen.writeSeen(K("a"), 1);
  seen.writeSeen(K("b"), 1);
  seen.flushSeen();
  changes = [];
  const both = fake("<span></span>").querySelector("span")!;
  offScreen(both);
  seen.trackSeenEvent(both as unknown as Element, K("a"), 2, { onChange: (o) => changes.push(o) });
  seen.trackSeenEvent(both as unknown as Element, K("b"), 2, { onChange: (o) => changes.push(o) });
  await tick();
  onScreen(both);
  fire(ioOf(false), both, true, 0.8);
  check("seen: two events on one element both play when it is seen", changes.length === 2);

  restoreHooks();
  console.log(`\nglyph-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
  void relative;
  void textWidth12;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
