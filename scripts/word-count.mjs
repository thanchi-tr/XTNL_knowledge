/**
 * App-word counting (ui-motion.md §3.1). One method for the static checks
 * (roadmap-ui-check renders a fixture with renderToStaticMarkup and counts the
 * markup) and for ui-audit (which walks the live DOM). Pure: no DOM, no
 * network. Reads src/lib/figure-units.json, the table figure-speech.ts also
 * speaks, so the exempt units and the spoken twins cannot drift.
 *
 *   countAppWords(markup, { width: 344 })  → { count, words, tokens }
 *   visibleText(markup, { width })          → the visible words with no exemptions (honesty survival)
 *   parseMarkup(markup)                     → a small element tree (also used by scripts/glyph-check.ts)
 *   wordRules()                             → the serialisable rules (units, separators, figure pattern)
 *   classifyRuns(runs, rules)               → tokens with a kind; standalone (no outer references)
 *   countDomAppWords(root, rules, opts?)    → the same count over a live DOM; standalone, so ui-audit
 *                                             can inject it with domCounterScript()
 *
 * Counting:
 *   1. Drop: a closed <details>' content (its <summary> stays); [hidden]; .sr-only; attribute text;
 *      <svg>, <canvas>, .shd; the reference column (.rm-ref-b of a closed .rm-ref) under 760 px;
 *      .rm-acts-w at 344/375 (.rm-acts-n from 932); <script>, <style>, <template>, <noscript>.
 *   2. Exempt (visible, not counted): [data-wc="own"|"name"|"honest"]; figure tokens; a unit word,
 *      day or month next to a figure; the separators · → — / |; a lone sign (≈ ↓ …) before a figure.
 *   3. Count what is left, split on whitespace. Punctuation-only tokens are not words.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLE = JSON.parse(readFileSync(join(HERE, "../src/lib/figure-units.json"), "utf8"));

/** The serialisable rules both counters use. */
export function wordRules() {
  const suffix = Object.keys(TABLE.suffix);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const suffixAlt = suffix
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(esc)
    .join("|");
  return {
    // §3.1: /^[≈~↓↑+−-]?\d[\d.,:/–-]*(%|h|m|d|wk|mo|min|×|\+)?$/ — the suffix list comes from the table
    figure: `^[${Object.keys(TABLE.prefix).map(esc).join("")}]?\\d[\\d.,:/–-]*(${suffixAlt})?$`,
    prefixes: Object.keys(TABLE.prefix),
    units: Object.keys(TABLE.words),
    level: TABLE.level.pattern,
    days: Object.keys(TABLE.days),
    months: Object.keys(TABLE.months),
    separators: TABLE.separators,
    suffix,
  };
}

// ─── A small HTML parser (renderToStaticMarkup output is well formed) ──────

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/**
 * parseMarkup(html) → { tag: "#root", attrs: {}, children: [...] }.
 * Element: { tag, attrs, children, parent }. Text: { text, parent }.
 */
export function parseMarkup(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      pushText(cur, html.slice(i));
      break;
    }
    if (lt > i) pushText(cur, html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt)) {
      const end = html.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (html[lt + 1] === "/") {
      const end = html.indexOf(">", lt);
      const name = html.slice(lt + 2, end).trim().toLowerCase();
      let p = cur;
      while (p && p.tag !== name && p.parent) p = p.parent;
      if (p && p.tag === name) cur = p.parent ?? root;
      i = end + 1;
      continue;
    }
    // an opening tag
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(html[j])) j++;
    const tag = html.slice(lt + 1, j).toLowerCase();
    const attrs = {};
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(html[j])) j++;
      if (html[j] === ">") {
        j++;
        break;
      }
      if (html[j] === "/" && html[j + 1] === ">") {
        selfClose = true;
        j += 2;
        break;
      }
      let k = j;
      while (k < n && !/[\s=/>]/.test(html[k])) k++;
      const name = html.slice(j, k);
      j = k;
      while (j < n && /\s/.test(html[j])) j++;
      if (html[j] === "=") {
        j++;
        while (j < n && /\s/.test(html[j])) j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const end = html.indexOf(q, j + 1);
          attrs[name] = decodeEntities(html.slice(j + 1, end));
          j = end + 1;
        } else {
          let e = j;
          while (e < n && !/[\s>]/.test(html[e])) e++;
          attrs[name] = decodeEntities(html.slice(j, e));
          j = e;
        }
      } else if (name) attrs[name] = "";
      else j++;
    }
    const el = { tag, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (RAW.has(tag) && !selfClose) {
      const end = html.toLowerCase().indexOf(`</${tag}`, j);
      const body = html.slice(j, end < 0 ? n : end);
      if (body) el.children.push({ text: body, parent: el, raw: true });
      const close = end < 0 ? n : html.indexOf(">", end) + 1;
      i = close;
      continue;
    }
    if (!selfClose && !VOID.has(tag)) cur = el;
    i = j;
  }
  return root;
}

function pushText(parent, raw) {
  if (!raw) return;
  parent.children.push({ text: decodeEntities(raw), parent });
}

export function classesOf(el) {
  return (el.attrs?.class ?? el.attrs?.className ?? "").split(/\s+/).filter(Boolean);
}

/** All elements under a node, depth first. */
export function elementsOf(node, out = []) {
  for (const c of node.children ?? []) {
    if (c.tag) {
      out.push(c);
      elementsOf(c, out);
    }
  }
  return out;
}

/** The text of a node (every text descendant, joined). */
export function textOfNode(node) {
  if (node.text != null) return node.raw ? "" : node.text;
  return (node.children ?? []).map(textOfNode).join("");
}

// ─── Runs: the visible text, with the exemption kind each piece sits in ───

const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure",
  "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul", "button", "label", "option", "legend",
]);
const SKIP_TAG = new Set(["svg", "canvas", "script", "style", "template", "noscript", "head", "title"]);

function dropped(el, width) {
  const a = el.attrs;
  if (SKIP_TAG.has(el.tag)) return true;
  if ("hidden" in a) return true;
  const cls = classesOf(el);
  if (cls.includes("sr-only") || cls.includes("shd")) return true;
  const narrow = width < 600;
  if (narrow && cls.includes("rm-acts-w")) return true;
  if (!narrow && cls.includes("rm-acts-n")) return true;
  if (width < 760 && cls.includes("rm-ref-b") && el.parent && classesOf(el.parent).includes("rm-ref") && !("data-open" in el.parent.attrs)) return true;
  return false;
}

/**
 * runs(tree, width) → [{ text, kind, block }]: kind is "app" or the nearest data-wc
 * ("own" | "name" | "honest"); `block` is a line break (a block element), `edge` a token break (any other element).
 */
export function runsOf(root, { width = 344 } = {}) {
  const out = [];
  const walk = (node, kind, closedDetails) => {
    for (const c of node.children ?? []) {
      if (c.text != null) {
        if (!c.raw && !closedDetails) out.push({ text: c.text, kind, block: false });
        continue;
      }
      if (dropped(c, width)) {
        if (BLOCK.has(c.tag)) out.push({ text: "", kind, block: true });
        continue;
      }
      if (closedDetails && c.tag !== "summary") continue;
      const wc = c.attrs["data-wc"];
      const k = wc === "own" || wc === "name" || wc === "honest" ? wc : kind;
      if (c.tag === "textarea") {
        out.push({ text: textOfNode(c), kind: "own", block: true });
        continue;
      }
      if (c.tag === "select") {
        const opts = elementsOf(c).filter((o) => o.tag === "option");
        const sel = opts.find((o) => "selected" in o.attrs) ?? opts[0];
        if (sel) out.push({ text: textOfNode(sel), kind: k, block: true });
        continue;
      }
      // every element edge breaks a token (flex and grid children sit apart on screen without whitespace);
      // only a block element breaks a line of visibleText
      const edge = BLOCK.has(c.tag) ? { text: "", kind: k, block: true } : { text: "", kind: k, edge: true };
      out.push(edge);
      walk(c, k, c.tag === "details" && !("open" in c.attrs));
      out.push(edge);
    }
  };
  walk(root, "app", false);
  return out;
}

/**
 * classifyRuns(runs, rules) → tokens [{ text, kind }] where kind is one of
 * app | own | name | honest | figure | unit | sep | sign | punct.
 * Standalone (no outer references): ui-audit injects its source into the page.
 */
export function classifyRuns(runs, rules) {
  const figure = new RegExp(rules.figure);
  const level = new RegExp(rules.level);
  const units = new Set(rules.units);
  const dates = new Set([...rules.days, ...rules.months]);
  const seps = new Set([...rules.separators, "–", "-", "•"]);
  const prefixes = new Set(rules.prefixes);
  // 1. tokens: split on whitespace and hard (block) breaks; a token spanning runs is "app" if any
  //    worded piece is app (punctuation glued to an exempt word keeps the word's kind)
  const toks = [];
  let cur = null;
  const wordless = (s) => !/[\p{L}\p{N}]/u.test(s);
  const flush = () => {
    if (cur && cur.text) toks.push(cur);
    cur = null;
  };
  for (const r of runs) {
    if (r.block || r.edge) {
      flush();
      continue;
    }
    const parts = r.text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      if (/^\s+$/.test(p)) {
        flush();
        continue;
      }
      if (!cur) cur = { text: p, kind: r.kind };
      else {
        if (cur.kind !== r.kind && !wordless(p)) {
          if (wordless(cur.text)) cur.kind = r.kind;
          else if (cur.kind === "app" || r.kind === "app") cur.kind = "app";
        }
        cur.text += p;
      }
    }
  }
  flush();
  // 2. classify
  const strip = (t) => t.replace(/^[«»“”"'(\[{]+/, "").replace(/[«»“”"')\]}:;,.!?]+$/, "");
  const isFig = (t) => figure.test(t) || level.test(t);
  const out = toks.map((t) => ({ text: t.text, kind: t.kind, bare: strip(t.text) }));
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    if (t.kind !== "app") continue;
    const b = t.bare;
    if (!b || !/[\p{L}\p{N}]/u.test(b)) {
      t.kind = seps.has(b) || seps.has(t.text) ? "sep" : prefixes.has(b) ? "sign" : "punct";
      continue;
    }
    if (isFig(b)) t.kind = "figure";
  }
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    if (t.kind !== "app") continue;
    const prev = out[i - 1];
    const next = out[i + 1];
    const prevFig = prev && (prev.kind === "figure" || prev.kind === "unit");
    const nextFig = next && next.kind === "figure";
    if (prevFig && (units.has(t.bare) || level.test(t.bare))) t.kind = "unit";
    else if (dates.has(t.bare) && (prevFig || nextFig)) t.kind = "unit";
  }
  // a lone sign right before a figure is part of it
  for (let i = 0; i < out.length; i++) if (out[i].kind === "sign" && !(out[i + 1] && out[i + 1].kind === "figure")) out[i].kind = "punct";
  return out.map(({ text, kind }) => ({ text, kind }));
}

/**
 * countAppWords(markup, { width = 344, exempt = true }) → { count, words, tokens }.
 * With exempt: false every visible word counts (the honesty-survival view).
 */
export function countAppWords(markup, { width = 344, exempt = true } = {}) {
  const runs = runsOf(parseMarkup(markup), { width });
  const tokens = classifyRuns(runs, wordRules());
  const counted = tokens.filter((t) => (exempt ? t.kind === "app" : t.kind !== "punct" && t.kind !== "sep" && t.kind !== "sign"));
  return { count: counted.length, words: counted.map((t) => t.text), tokens };
}

/** The visible text (every exemption shown), one string: for "is X visible" assertions. */
export function visibleText(markup, { width = 344 } = {}) {
  const runs = runsOf(parseMarkup(markup), { width });
  let s = "";
  for (const r of runs) s += r.block ? "\n" : r.text;
  return s
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * The same count over a live DOM (ui-audit). Standalone: only its arguments.
 * opts.foldBottom: count only text whose box starts above this y (the fold).
 */
export function countDomAppWords(root, rules, opts) {
  const o = opts || {};
  const width = o.width || (typeof window !== "undefined" ? window.innerWidth : 344);
  const BLOCKS = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DETAILS", "DIALOG", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL", "BUTTON", "LABEL", "OPTION", "LEGEND"]);
  const SKIP = new Set(["SVG", "svg", "CANVAS", "SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);
  const runs = [];
  const drop = (el) => {
    if (SKIP.has(el.tagName)) return true;
    if (el.hasAttribute("hidden")) return true;
    const cl = el.classList;
    if (cl.contains("sr-only") || cl.contains("shd")) return true;
    if (width < 600 && cl.contains("rm-acts-w")) return true;
    if (width >= 600 && cl.contains("rm-acts-n")) return true;
    if (width < 760 && cl.contains("rm-ref-b") && el.parentElement && el.parentElement.classList.contains("rm-ref") && !el.parentElement.hasAttribute("data-open")) return true;
    return false;
  };
  const walk = (node, kind, closed) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        if (closed) continue;
        if (o.foldBottom != null) {
          const range = document.createRange();
          range.selectNodeContents(c);
          const r = range.getBoundingClientRect();
          if (r.height > 0 && r.top >= o.foldBottom) continue;
        }
        runs.push({ text: c.nodeValue || "", kind: kind, block: false });
        continue;
      }
      if (c.nodeType !== 1) continue;
      if (drop(c)) {
        if (BLOCKS.has(c.tagName)) runs.push({ text: "", kind: kind, block: true });
        continue;
      }
      if (closed && c.tagName !== "SUMMARY") continue;
      const wc = c.getAttribute("data-wc");
      const k = wc === "own" || wc === "name" || wc === "honest" ? wc : kind;
      if (c.tagName === "TEXTAREA" || c.tagName === "INPUT") continue;
      if (c.tagName === "SELECT") {
        const sel = c.selectedOptions && c.selectedOptions[0];
        if (sel) runs.push({ text: sel.textContent || "", kind: k, block: true });
        continue;
      }
      runs.push({ text: "", kind: k, edge: true });
      walk(c, k, c.tagName === "DETAILS" && !c.open);
      runs.push({ text: "", kind: k, edge: true });
    }
  };
  walk(root, "app", false);
  // classifyRuns must be in scope: domCounterScript injects its source beside this function
  const tokens = classifyRuns(runs, rules);
  const words = tokens.filter((t) => t.kind === "app").map((t) => t.text);
  return { count: words.length, words: words };
}

/** A script for page.evaluate: counts app words under `selector` (main by default) in the live DOM. */
export function domCounterScript(selector = "main", opts = {}) {
  return `(() => { ${classifyRuns.toString()}\n${countDomAppWords.toString()}\nconst root = document.querySelector(${JSON.stringify(selector)}); if (!root) return null; return countDomAppWords(root, ${JSON.stringify(wordRules())}, ${JSON.stringify(opts)}); })()`;
}
