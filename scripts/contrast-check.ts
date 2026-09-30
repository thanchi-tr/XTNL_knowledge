/**
 * Gate 1 (redesign.md › Acceptance): contrast and colour-vision distance of
 * the tokens, read straight from src/app/styles/tokens.css. Pure: no DB, no
 * browser. Run: npx tsx scripts/contrast-check.ts [--strict-vellum]
 *
 *   Night (ships now; failures exit 1):
 *     every text token (ink-0/1/2, kept, owed, held, xp, pts, mp) ≥ 4.5 on page, card, raised, overlay, sunken
 *     --ink-mute and --line-ctl ≥ 3 on the same surfaces (non-text)
 *     each on-solid label ≥ 4.5 on its fill (on-kept on kept, …)
 *     --xp vs --pts ≥ 8 ΔE under protan and deutan
 *     the gold button label (#2a1d00) ≥ 4.5 on its darkest stop (#c9901f)
 *     the legacy --ink-3 alias renders at ≥ 7.2 on card (it points at --ink-2)
 *   Vellum (ships after launch): the same checks (its --mp is a glyph colour, so non-text),
 *     reported as warnings unless --strict-vellum.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEDGER_DE_MIN,
  MARK_MIN,
  MARK_TOKENS,
  SURFACES,
  TEXT_MIN,
  TEXT_TOKENS,
  composite,
  contrast,
  deltaE,
  parseColor,
  type Rgb,
} from "../src/app/dev/style/color-lab";

const ROOT = join(__dirname, "..");
const css = readFileSync(join(ROOT, "src/app/styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const strictVellum = process.argv.includes("--strict-vellum");

let failed = 0;
let warned = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "", warnOnly = false) {
  if (ok) {
    passed++;
    return;
  }
  if (warnOnly) {
    warned++;
    console.log(`WARN ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** The declarations inside the first block whose selector list matches `selector` exactly. */
function block(selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`, "m").exec(css);
  if (!m) throw new Error(`tokens.css: no block for ${selector}`);
  const out: Record<string, string> = {};
  for (const decl of m[1].split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    if (k.startsWith("--")) out[k] = decl.slice(i + 1).trim();
  }
  return out;
}

const night = block(":root, .theme-night");
const vellum = { ...night, ...block(':root[data-theme="vellum"]') };
const aliases = (() => {
  // The legacy alias block is the second ":root, .theme-night" block.
  const all = [...css.matchAll(/(?:^|})\s*:root, \.theme-night\s*\{([^}]*)\}/gm)];
  const body = all[1]?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const decl of body.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
})();

function resolve(theme: Record<string, string>, name: string, depth = 0): string {
  const v = theme[name];
  if (v == null) throw new Error(`missing token ${name}`);
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(v);
  if (ref && depth < 5) return resolve(theme, ref[1], depth + 1);
  return v;
}

function solid(theme: Record<string, string>, name: string, over?: Rgb): Rgb {
  const c = parseColor(resolve(theme, name));
  if (!c) throw new Error(`unparseable ${name}: ${theme[name]}`);
  return c.a < 1 && over ? composite(c, over) : c.rgb;
}

function runTheme(label: string, theme: Record<string, string>, warnOnly: boolean) {
  const text = label === "Vellum" ? TEXT_TOKENS.filter((t) => t !== "--mp") : [...TEXT_TOKENS];
  const marks = label === "Vellum" ? [...MARK_TOKENS, "--mp"] : [...MARK_TOKENS];
  for (const s of SURFACES) {
    const bg = solid(theme, s);
    for (const t of text) {
      const r = contrast(solid(theme, t, bg), bg);
      check(`${label}: ${t} on ${s} ≥ ${TEXT_MIN}`, r >= TEXT_MIN, r.toFixed(2), warnOnly);
    }
    for (const t of marks) {
      const r = contrast(solid(theme, t, bg), bg);
      check(`${label}: ${t} (non-text) on ${s} ≥ ${MARK_MIN}`, r >= MARK_MIN, r.toFixed(2), warnOnly);
    }
  }
  for (const [on, fill] of [
    ["--on-kept", "--kept"],
    ["--on-owed", "--owed"],
    ["--on-held", "--held"],
    ["--on-xp", "--xp"],
    ["--on-pts", "--pts"],
    ["--on-mp", "--mp"],
  ] as const) {
    const r = contrast(solid(theme, on), solid(theme, fill));
    check(`${label}: ${on} on ${fill} ≥ ${TEXT_MIN}`, r >= TEXT_MIN, r.toFixed(2), warnOnly);
  }
  const xp = solid(theme, "--xp");
  const pts = solid(theme, "--pts");
  for (const v of ["protan", "deutan"] as const) {
    const d = deltaE(xp, pts, v);
    check(`${label}: --xp vs --pts ΔE ≥ ${LEDGER_DE_MIN} (${v})`, d >= LEDGER_DE_MIN, d.toFixed(1), warnOnly);
  }
}

runTheme("Night", night, false);
runTheme("Vellum", vellum, !strictVellum);

// The gold button label on its darkest stop (components.css .btn-gold).
{
  const label = parseColor("#2a1d00")!.rgb;
  const darkest = parseColor(night["--gold-b"] ?? "#c9901f")!.rgb;
  const r = contrast(label, darkest);
  check("gold button label #2a1d00 on --gold-b ≥ 4.5", r >= TEXT_MIN, r.toFixed(2));
  const top = contrast(label, parseColor("#ffe7a3")!.rgb);
  check("gold button label on the top stop ≥ 4.5", top >= TEXT_MIN, top.toFixed(2));
}

// Gate 2: the former --ink-3 text renders at ≥ 7.2 on card with no per-file change.
{
  check("legacy alias: --ink-3 points at --ink-2", aliases["--ink-3"] === "var(--ink-2)", aliases["--ink-3"] ?? "missing");
  const r = contrast(solid(night, "--ink-2"), solid(night, "--card"));
  check("legacy alias: --ink-3 (→ ink-2) on card ≥ 7.2", r >= 7.2, r.toFixed(2));
  for (const [legacy, target] of [
    ["--green", "var(--kept)"],
    ["--red", "var(--owed)"],
    ["--blue", "var(--held)"],
    ["--amber", "var(--ink-0)"],
    ["--line-act", "var(--line-ctl)"],
    ["--nav-h", "var(--topbar-h)"],
    ["--base", "var(--page)"],
    ["--sub", "var(--sunken)"],
    ["--lift", "var(--overlay)"],
  ] as const) {
    check(`legacy alias: ${legacy} → ${target}`, aliases[legacy] === target, aliases[legacy] ?? "missing");
  }
}

console.log(`\ncontrast-check: ${passed} passed, ${failed} failed, ${warned} warnings${warned && !strictVellum ? " (Vellum ships after launch)" : ""}`);
process.exit(failed ? 1 : 0);
