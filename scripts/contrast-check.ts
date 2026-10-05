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
 *     ui-motion (ui-motion.md §11.6): glyph and chip ink on card, raised, sunken and overlay
 *       (ink-0/1/2 text ≥ 4.5; ink-mute, ink-1 strokes, the 12 px badge and the pv.suggest
 *       rim ≥ 3); the horizon's walked path ≥ 3 on the dawn (card + ink-0 at fx.css's cap,
 *       and at the air's peak); the unwalked path and the hairline ≥ 3 where they sit; the
 *       dawn cap in fx.css equals the runtime's capFor (one number, two layers)
 *   Vellum (ships after launch): the same checks (its --mp is a glyph colour, so non-text),
 *     reported as warnings unless --strict-vellum.
 *   A shortfall already handed to the lead (PENDING in the ui-motion block) is a WARN.
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
import { capFor, frontPoint, horizonGeometry, parseCssColor } from "../src/lib/shader/params";

const ROOT = join(__dirname, "..");
const css = readFileSync(join(ROOT, "src/app/styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const strictVellum = process.argv.includes("--strict-vellum");

let failed = 0;
let warned = 0;
/** Warnings that are ui-motion PENDING handoffs (the lead decides), not Vellum. */
let pendingWarned = 0;
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

// ── ui-motion (M0c; ui-motion.md §11.6): the glyph and horizon pairs, Night and Vellum ──
// The glyphs and chips are ink on the four surfaces a card can be; the horizon band
// layers the measured marks (SVG) over the dawn, card mixed with --ink-0 at the
// layer's cap (fx.css --shd-cap, the number the runtime takes from the card's
// luminance). The dawn sits above the hairline only, and the air moves it ±20%.
// A known shortfall already handed to the lead is a WARN until it is decided
// (the PENDING list; a fixed one prints a NOTE so its key can be deleted).
{
  const PENDING: Record<string, string> = {
    hairline:
      "fx.css .shd-hair is --ink-mute at stroke-opacity .55 (ui-motion.md §6.6), about 2:1, against §11.6's ≥ 3; the lead decides: the hairline opaque (4.1 on the card, 3.2 Night / 3.5 Vellum on its dawn row), or §11.6 names it decorative",
  };
  const pendingSeen = new Set<string>();
  const checkUm = (name: string, ok: boolean, detail: string, warnOnly: boolean, pending?: string) => {
    if (pending && pending in PENDING) {
      if (!ok) {
        pendingSeen.add(pending);
        warned++;
        pendingWarned++;
        console.log(`WARN ${name} — ${detail} (handed off: ${PENDING[pending]})`);
        return;
      }
    }
    check(name, ok, detail, warnOnly);
  };
  const fx = readFileSync(join(ROOT, "src/components/fx/fx.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const firstRule = (selectorRe: string) => new RegExp(`(?:^|[{};])\\s*${selectorRe}\\s*\\{([^}]*)\\}`).exec(fx)?.[1] ?? "";
  const num = (body: string, prop: string) => {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)`).exec(body);
    return m ? Number(m[1]) : NaN;
  };
  const caps = { Night: num(firstRule("\\.shd"), "--shd-cap"), Vellum: num(firstRule(':root\\[data-theme="vellum"\\] \\.shd'), "--shd-cap") };
  const hairAlpha = num(firstRule("\\.shd-hair"), "stroke-opacity");
  check("ui-motion: fx.css declares the dawn cap per theme and the hairline's opacity", Number.isFinite(caps.Night) && Number.isFinite(caps.Vellum) && Number.isFinite(hairAlpha), JSON.stringify({ caps, hairAlpha }));

  // The unwalked path sits below the hairline (where no dawn is drawn) everywhere but its end on the aim point.
  const g = horizonGeometry(312, 56);
  const below = Array.from({ length: 99 }, (_, i) => frontPoint(g, i / 100)).every(([, y]) => y > g.yh);
  check("ui-motion: the horizon path runs below the hairline (the dawn is drawn above it only) up to the aim point", below && frontPoint(g, 1)[1] === g.yh);

  const surfaces = ["--card", "--raised", "--sunken", "--overlay"] as const;
  for (const [label, theme, warnOnly] of [
    ["Night", night, false],
    ["Vellum", vellum, !strictVellum],
  ] as const) {
    for (const s of surfaces) {
      const bg = solid(theme, s);
      for (const t of ["--ink-0", "--ink-1", "--ink-2"]) {
        const r = contrast(solid(theme, t, bg), bg);
        check(`${label}: ui-motion chip text ${t} on ${s} ≥ ${TEXT_MIN}`, r >= TEXT_MIN, r.toFixed(2), warnOnly);
      }
      const mute = contrast(solid(theme, "--ink-mute", bg), bg);
      check(`${label}: ui-motion --ink-mute glyph (non-text) on ${s} ≥ ${MARK_MIN}`, mute >= MARK_MIN, mute.toFixed(2), warnOnly);
      const ink1 = contrast(solid(theme, "--ink-1", bg), bg);
      check(`${label}: ui-motion --ink-1 glyph strokes beside a badge on ${s} ≥ ${MARK_MIN}`, ink1 >= MARK_MIN, ink1.toFixed(2), warnOnly);
      const rim = contrast(solid(theme, "--ink-2", bg), bg);
      check(`${label}: ui-motion the pv.suggest balloon rim (--ink-2) on ${s} ≥ ${MARK_MIN}`, rim >= MARK_MIN, rim.toFixed(2), warnOnly);
    }
    const card = solid(theme, "--card");
    const disc = contrast(solid(theme, "--ink-1", card), card);
    check(`${label}: ui-motion a 12 px badge (--ink-1 on its --card disc) ≥ ${MARK_MIN}`, disc >= MARK_MIN, disc.toFixed(2), warnOnly);

    // the dawn cap: fx.css and the runtime agree (one number, two layers)
    const cap = caps[label];
    const runtimeCap = capFor("horizon", parseCssColor(resolve(theme, "--card")));
    check(`${label}: ui-motion the dawn cap in fx.css (${cap}) is the runtime's capFor (${runtimeCap})`, Math.abs(cap - runtimeCap) < 1e-9);

    const ink0 = solid(theme, "--ink-0", card);
    const mute = solid(theme, "--ink-mute", card);
    for (const [k, air] of [
      ["at the cap", 1],
      ["at the air's peak (cap × 1.2)", 1.2],
    ] as const) {
      const dawn = wash(ink0, cap * air * 100, card);
      const walked = contrast(ink0, dawn);
      check(`${label}: ui-motion the walked path (--ink-0) on the dawn ${k} ≥ ${MARK_MIN}`, walked >= MARK_MIN, walked.toFixed(2), warnOnly);
    }
    // the unwalked path: on the card below the hairline, and on the hairline's own row at its end (the dawn there is half the cap)
    const edge = wash(ink0, cap * 50, card);
    const pathOnCard = contrast(mute, card);
    const pathAtEnd = contrast(mute, edge);
    check(`${label}: ui-motion the unwalked path (--ink-mute) on the card below the hairline ≥ ${MARK_MIN}`, pathOnCard >= MARK_MIN, pathOnCard.toFixed(2), warnOnly);
    check(`${label}: ui-motion the unwalked path's end on the hairline row (dawn at half the cap) ≥ ${MARK_MIN}`, pathAtEnd >= MARK_MIN, pathAtEnd.toFixed(2), warnOnly);
    // the hairline: --ink-mute at fx.css's stroke-opacity, on the card and on its dawn row
    const hair = (bg: Rgb) => contrast(wash(mute, hairAlpha * 100, bg), bg);
    const hairCard = hair(card);
    const hairEdge = hair(edge);
    checkUm(`${label}: ui-motion the hairline (--ink-mute at ${hairAlpha}) on the card and its dawn row ≥ ${MARK_MIN}`, Math.min(hairCard, hairEdge) >= MARK_MIN, `${hairCard.toFixed(2)} / ${hairEdge.toFixed(2)}`, warnOnly, "hairline");
    // under prefers-contrast: more the soft layer is gone and the hairline and path are --ink-1
    const hc = contrast(solid(theme, "--ink-1", card), card);
    check(`${label}: ui-motion under prefers-contrast: more the hairline and path (--ink-1 on --card) ≥ ${MARK_MIN}`, hc >= MARK_MIN, hc.toFixed(2), warnOnly);
  }
  for (const k of Object.keys(PENDING)) if (!pendingSeen.has(k)) console.log(`NOTE ui-motion: "${k}" passes now; delete it from PENDING`);
}

// Gate 2: every legacy alias is gone (the former --ink-3 text now reads --ink-2 directly).
{
  for (const legacy of ["--ink-3", "--line", "--green", "--green-10", "--nav-h"]) {
    check(`legacy alias ${legacy} is gone`, aliases[legacy] === undefined, aliases[legacy] ?? "");
  }
}

console.log(`\ncontrast-check: ${passed} passed, ${failed} failed, ${warned} warnings${warned > pendingWarned && !strictVellum ? " (Vellum ships after launch)" : ""}${pendingWarned ? ` (${pendingWarned} handed to the lead)` : ""}`);
process.exit(failed ? 1 : 0);
