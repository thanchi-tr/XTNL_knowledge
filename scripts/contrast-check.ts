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
 *     the pairs the kit paints (color-lab CHIP_WASH / PAID_WASH, read back out of components.css):
 *       each signal chip's text ≥ 4.5 on its own wash over every surface,
 *       ink-0 ≥ 4.5 on a paid pill's currency wash over every surface,
 *       ink-0/1/2 ≥ 4.5 on --bar (the top bar, tab bar, rail and sidebar),
 *       --light ≥ 3 as a mark on every surface (motes, a lit ring)
 *     the legacy --ink-3 alias renders at ≥ 7.2 on card (it points at --ink-2)
 *   Vellum (ships after launch): the same checks (its --mp is a glyph colour, so non-text),
 *     reported as warnings unless --strict-vellum.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BAR_TEXT_TOKENS,
  CHIP_WASH,
  LEDGER_DE_MIN,
  LIGHT_MARK,
  PAID_WASH,
  MARK_MIN,
  MARK_TOKENS,
  SURFACES,
  TEXT_MIN,
  TEXT_TOKENS,
  composite,
  contrast,
  deltaE,
  parseColor,
  wash,
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
  // The pairs the kit paints: chip text on its own wash, ink on a paid pill, ink on the bars, the light mark.
  for (const s of SURFACES) {
    const bg = solid(theme, s);
    for (const [sig, pct] of Object.entries(CHIP_WASH)) {
      const fg = solid(theme, sig, bg);
      const r = contrast(fg, wash(fg, pct, bg));
      check(`${label}: ${sig} chip text on its ${pct}% wash over ${s} ≥ ${TEXT_MIN}`, r >= TEXT_MIN, r.toFixed(2), warnOnly);
    }
    for (const [cur, pct] of Object.entries(PAID_WASH)) {
      const r = contrast(solid(theme, "--ink-0", bg), wash(solid(theme, cur, bg), pct, bg));
      check(`${label}: --ink-0 on a paid ${cur} pill (${pct}% wash) over ${s} ≥ ${TEXT_MIN}`, r >= TEXT_MIN, r.toFixed(2), warnOnly);
    }
    const light = contrast(solid(theme, LIGHT_MARK, bg), bg);
    check(`${label}: ${LIGHT_MARK} (mark) on ${s} ≥ ${MARK_MIN}`, light >= MARK_MIN, light.toFixed(2), warnOnly);
  }
  {
    const bar = solid(theme, "--bar");
    for (const t of BAR_TEXT_TOKENS) {
      const r = contrast(solid(theme, t, bar), bar);
      check(`${label}: ${t} on --bar ≥ ${TEXT_MIN}`, r >= TEXT_MIN, r.toFixed(2), warnOnly);
    }
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

// The wash percentages above are the ones components.css paints (so the two cannot drift).
{
  const comp = readFileSync(join(ROOT, "src/app/styles/components.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  /** The wash % in the first rule whose whole selector is `selector`, if it washes `token`. */
  const pctIn = (selector: string, token: string): number | null => {
    for (let i = comp.indexOf(selector); i >= 0; i = comp.indexOf(selector, i + 1)) {
      const before = comp.slice(0, i).trimEnd();
      const after = comp.slice(i + selector.length).trimStart();
      if (!after.startsWith("{") || !(before === "" || before.endsWith("}") || before.endsWith("{"))) continue;
      const open = comp.indexOf("{", i);
      const body = comp.slice(open + 1, comp.indexOf("}", open));
      const m = /background:\s*color-mix\(in srgb,\s*var\((--[a-z]+)\)\s*(\d+)%/.exec(body);
      return m && m[1] === token ? Number(m[2]) : null;
    }
    return null;
  };
  for (const [sig, pct] of Object.entries(CHIP_WASH)) {
    const got = pctIn(`.chip.${sig.slice(2)}`, sig);
    check(`components.css: .chip.${sig.slice(2)} washes ${sig} at ${pct}%`, got === pct, String(got));
  }
  check("components.css: .pill.paid washes --xp at the measured %", pctIn(".pill.paid", "--xp") === PAID_WASH["--xp"], String(pctIn(".pill.paid", "--xp")));
  check("components.css: .pill.paid.pts washes --pts at the measured %", pctIn(".pill.paid.pts", "--pts") === PAID_WASH["--pts"], String(pctIn(".pill.paid.pts", "--pts")));
}

// Gate 2: every legacy alias is gone (the former --ink-3 text now reads --ink-2 directly).
{
  for (const legacy of ["--ink-3", "--line", "--green", "--green-10", "--nav-h"]) {
    check(`legacy alias ${legacy} is gone`, aliases[legacy] === undefined, aliases[legacy] ?? "");
  }
}

console.log(`\ncontrast-check: ${passed} passed, ${failed} failed, ${warned} warnings${warned && !strictVellum ? " (Vellum ships after launch)" : ""}`);
process.exit(failed ? 1 : 0);
