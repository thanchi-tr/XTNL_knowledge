/**
 * The type-role codemod (redesign L0, step 3). Each lane runs it on the files it owns.
 *
 *   npx tsx scripts/codemod-type-roles.ts <file|dir>... [--write] [--quiet]
 *
 * Dry run by default: prints what it would change and what it leaves for a
 * human. With --write it applies the mechanical rewrites:
 *
 *  1. Inline style objects → type roles (TSX). A literal `style={{ … }}` whose
 *     type keys match a role loses those keys and gains the class; other keys
 *     stay in the style, and an emptied style is removed. Roles:
 *       { fontSize ≤ 12.5, textTransform: "uppercase", letterSpacing?, fontWeight?, color? }  → t-eyebrow
 *       { fontSize ≤ 13.5, color: var(--ink-2|ink-3), lineHeight? }                          → t-meta
 *       { fontSize: 15, fontWeight: 500, color: var(--ink-0)? }                                → t-body-l
 *       { color: var(--ink-0|1|2|3) } (and nothing type-related)                               → ink-0/1/2 (ink-3 → ink-2)
 *     className must be absent or a string literal; an expression className is reported, not touched.
 *     Display roles (Fraunces) are a design decision, never automatic: reported only.
 *  2. Hand-written rgba literals → tokens (TSX and CSS), exact legacy hues only:
 *       rgba(0,204,122,a)   → color-mix(in srgb, var(--kept) a%, transparent)
 *       rgba(240,58,87,a)   → color-mix(in srgb, var(--owed) a%, transparent)
 *       rgba(77,156,245,a)  → color-mix(in srgb, var(--held) a%, transparent)
 *       rgba(4,8,15,a)      → color-mix(in srgb, var(--page) a%, transparent)
 *       rgba(255,255,255,.06|.065) → var(--line-1); rgba(255,255,255,.11) → var(--line-2)
 *     rgba(240,160,48,a) (the old amber) is reported only: due → ink, an Apex use → gold material.
 *
 * Uses the TypeScript compiler API (ts-morph is not a dependency). No network, no DB.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const QUIET = argv.includes("--quiet");
const targets = argv.filter((a) => !a.startsWith("--"));
if (targets.length === 0) {
  console.log("usage: npx tsx scripts/codemod-type-roles.ts <file|dir>... [--write]");
  process.exit(2);
}

interface Edit {
  start: number;
  end: number;
  text: string;
}
interface Report {
  file: string;
  roles: number;
  colours: number;
  manual: string[];
}

// ─── rgba → tokens ──────────────────────────────────────────────────────────

const RGBA = /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?\.\d+|1|0)\s*\)/g;
const HUES: Record<string, string> = { "0,204,122": "--kept", "240,58,87": "--owed", "77,156,245": "--held", "4,8,15": "--page" };

export function mapRgba(css: string): { text: string; changed: number; manual: string[] } {
  let changed = 0;
  const manual: string[] = [];
  const text = css.replace(RGBA, (whole, r, g, b, a) => {
    const key = `${Number(r)},${Number(g)},${Number(b)}`;
    const alpha = Number(a);
    if (key === "255,255,255") {
      const line = alpha === 0.06 || alpha === 0.065 ? "var(--line-1)" : alpha === 0.11 ? "var(--line-2)" : null;
      if (line) changed++;
      return line ?? whole;
    }
    if (key === "240,160,48") {
      manual.push(`${whole}: old amber (due → ink-0; an Apex use → gold material)`);
      return whole;
    }
    const token = HUES[key];
    if (!token) return whole;
    changed++;
    const pct = Number((alpha * 100).toFixed(1));
    return `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;
  });
  return { text, changed, manual };
}

// ─── style objects → roles ──────────────────────────────────────────────────

type Lit = string | number;

function literal(e: ts.Expression): Lit | undefined {
  if (ts.isNumericLiteral(e)) return Number(e.text);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return -Number(e.operand.text);
  return undefined;
}

const INK = /^var\(--ink-([0-3])\)$/;

/** The role for a set of literal style props, and the keys it consumes. Exported for tests. */
export function roleFor(props: Record<string, Lit>): { role: string; consumed: string[] } | null {
  const fs = typeof props.fontSize === "number" ? props.fontSize : undefined;
  const color = typeof props.color === "string" ? props.color : undefined;
  const ink = color ? INK.exec(color)?.[1] : undefined;
  if (fs !== undefined && fs <= 12.5 && props.textTransform === "uppercase" && (color === undefined || ink)) {
    return { role: "t-eyebrow", consumed: ["fontSize", "textTransform", "letterSpacing", "fontWeight", "color"].filter((k) => k in props) };
  }
  if (fs !== undefined && fs <= 13.5 && (ink === "2" || ink === "3") && props.fontWeight === undefined && props.textTransform === undefined) {
    return { role: "t-meta", consumed: ["fontSize", "color", "lineHeight"].filter((k) => k in props) };
  }
  if (fs === 15 && Number(props.fontWeight) === 500 && (color === undefined || ink === "0")) {
    return { role: "t-body-l", consumed: ["fontSize", "fontWeight", "color", "lineHeight"].filter((k) => k in props) };
  }
  const typeKeys = ["fontSize", "fontWeight", "letterSpacing", "textTransform", "lineHeight", "fontFamily"];
  if (ink !== undefined && !typeKeys.some((k) => k in props)) {
    return { role: `ink-${ink === "3" ? "2" : ink}`, consumed: ["color"] };
  }
  return null;
}

function transformTsx(file: string, src: string, report: Report): string {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxAttributes(node)) {
      const attrs = node.properties.filter(ts.isJsxAttribute);
      const style = attrs.find((a) => a.name.getText(sf) === "style");
      const init = style?.initializer;
      if (style && init && ts.isJsxExpression(init) && init.expression && ts.isObjectLiteralExpression(init.expression)) {
        const obj = init.expression;
        const props: Record<string, Lit> = {};
        const nodes = new Map<string, ts.ObjectLiteralElementLike>();
        let allLiteral = true;
        for (const p of obj.properties) {
          if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
            allLiteral = false;
            continue;
          }
          const key = p.name.text;
          const v = literal(p.initializer);
          nodes.set(key, p);
          if (v === undefined) {
            if (["fontSize", "color"].includes(key)) allLiteral = false;
            continue;
          }
          props[key] = v;
        }
        const r = allLiteral ? roleFor(props) : null;
        const line = sf.getLineAndCharacterOfPosition(style.getStart(sf)).line + 1;
        if (!r) {
          if ("fontSize" in props || (!allLiteral && /fontSize/.test(obj.getText(sf)))) {
            report.manual.push(`${line}: style ${obj.getText(sf).replace(/\s+/g, " ").slice(0, 90)}`);
          }
        } else {
          const cls = attrs.find((a) => a.name.getText(sf) === "className");
          if (cls && !(cls.initializer && ts.isStringLiteral(cls.initializer))) {
            report.manual.push(`${line}: ${r.role} fits, but className is an expression`);
          } else {
            const remaining = obj.properties.filter((p) => !(ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && r.consumed.includes(p.name.text)));
            const styleText = remaining.length ? `style={{ ${remaining.map((p) => p.getText(sf)).join(", ")} }}` : "";
            if (cls && cls.initializer && ts.isStringLiteral(cls.initializer)) {
              const merged = [...new Set([...cls.initializer.text.split(/\s+/).filter(Boolean), r.role])].join(" ");
              edits.push({ start: cls.initializer.getStart(sf), end: cls.initializer.getEnd(), text: JSON.stringify(merged) });
              edits.push({ start: style.getStart(sf), end: style.getEnd(), text: styleText });
            } else {
              edits.push({ start: style.getStart(sf), end: style.getEnd(), text: `className="${r.role}"${styleText ? ` ${styleText}` : ""}` });
            }
            report.roles++;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

// ─── driver ─────────────────────────────────────────────────────────────────

function collect(p: string, acc: string[]) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) if (f !== "node_modules" && !f.startsWith(".")) collect(join(p, f), acc);
  } else if ([".tsx", ".ts", ".css"].includes(extname(p))) acc.push(p);
}

const files: string[] = [];
for (const t of targets) collect(t, files);
const ROOT = process.cwd();
let totalRoles = 0;
let totalColours = 0;
let totalManual = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const report: Report = { file: relative(ROOT, file), roles: 0, colours: 0, manual: [] };
  let out = src;
  if (file.endsWith(".tsx")) out = transformTsx(file, out, report);
  const c = mapRgba(out);
  out = c.text;
  report.colours = c.changed;
  report.manual.push(...c.manual);
  totalRoles += report.roles;
  totalColours += report.colours;
  totalManual += report.manual.length;
  if (report.roles || report.colours || report.manual.length) {
    console.log(`${report.file}: ${report.roles} role rewrites, ${report.colours} colour rewrites${report.manual.length ? `, ${report.manual.length} for a human` : ""}`);
    if (!QUIET) for (const m of report.manual) console.log(`    manual ${m}`);
  }
  if (WRITE && out !== src) writeFileSync(file, out);
}
console.log(`\ncodemod-type-roles: ${files.length} files, ${totalRoles} role rewrites, ${totalColours} colour rewrites, ${totalManual} left for a human${WRITE ? " (written)" : " (dry run; pass --write)"}`);
