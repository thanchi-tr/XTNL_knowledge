/**
 * M0b: the shader layer (ui-motion.md §6, §11.2), with no browser, GPU,
 * database, network or model.
 *
 *   npx tsx scripts/shader-check.ts        (npm run ui:shader once M0c wires it)
 *
 * Covers:
 *   - horizonParams and the SVG marks: front from the printed %, clamps,
 *     unmeasured → −1 and static, dotted SELF_REPORTED, contours per depth,
 *     DONE / ARCHIVED static, the seed, and no Proficiency in any uniform;
 *   - horizon-front transitions (both directions, never across a basis or a
 *     rebase), and the seen key (the basis signature, no surface);
 *   - geometry (p1 midpoint, linear front, walked width) and the SVG dawn
 *     against the HORIZON maths ported to TS (≤ 1/255 per channel at 9 points);
 *   - the weave's period and kinds; the gate's whole truth table; AMBIENT_ROUTES;
 *   - dprOf / slotPixels; parseCssColor; the caps on the real tokens; the
 *     SHADER_VARS whitelist; throttleVerdict;
 *   - the GLSL lint (precision guard first, WebGL1 only, literal loop bounds
 *     ≤ 4, no reversed smoothstep, uniforms = binders both ways, ≤ 4 vec4,
 *     ≤ 2 KB, no 'spin');
 *   - the runtime's static rules (no 3D library, the context attributes, DPR
 *     and pixel caps, dispose order, no console.error, import() only);
 *   - the engine with a recording fake canvas and a fake clock: still / calm /
 *     contrast never create a context; the horizon's 12 fps, 400 ms ramps,
 *     4.6 s ramp-out and 5 s release, one shared budget across mounts; the
 *     weave's 20 fps, 90 s stop and the pause; the first frame before
 *     data-live; WAIT over AMBIENT and the 1-context cap; loss counting;
 *     held slots and theme changes; dispose then remount; the governor; the
 *     quiet window; mediump-only and no-WebGL fallbacks;
 *   - SSR of the slots (no canvas, aria-hidden, the walked dasharray, kinds)
 *     and fx.css (layer order, no keyframes, backstops, ink only).
 */
import Module from "node:module";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { gate, shaderMode, type GateInput } from "../src/lib/shader/gate";
import {
  AMBIENT_KEY,
  AMBIENT_ROUTES,
  FX,
  HORIZON_AIR,
  LIMITS,
  SHADER_VARS,
  WAIT_PAUSED_KEY,
  WEAVE_PERIOD,
  capFor,
  dawnEllipse,
  dprOf,
  frontPoint,
  horizonDawnStops,
  horizonGeometry,
  horizonParams,
  horizonSeenKey,
  horizonTransition,
  parseCssColor,
  slotPixels,
  throttleVerdict,
  weaveGeometry,
  weaveParams,
  type ShaderVar,
} from "../src/lib/shader/params";
import { BINDERS, HORIZON, PRELUDE, PROGRAMS, VERT, WEAVE, type UniformFrame } from "../src/lib/shader/programs";
import { createEngine, type Host } from "../src/lib/shader/engine";
import type { Env, SlotSpec } from "../src/lib/shader/env";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// Node can't load CSS; the fx and glyph components import theirs.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};

// ── 1. horizonParams and the marks ─────────────────────────────────────────
function params() {
  const base = { status: "ACTIVE", depth: 12, roadmapId: "rm-1" };
  check("horizon: percent 41 (value .4199) gives front .41", horizonParams({ ...base, proficiency: { percent: 41, value: 0.4199 } }).front === 0.41);
  check("horizon: percent 100 gives front 1", horizonParams({ ...base, proficiency: { percent: 100 } }).front === 1);
  check("horizon: values above 1 clamp (percent 130, value 1.3)", horizonParams({ ...base, proficiency: { percent: 130 } }).front === 1 && horizonParams({ ...base, proficiency: { value: 1.3 } }).front === 1);
  const nul = horizonParams({ ...base, proficiency: { percent: null } });
  const nan = horizonParams({ ...base, proficiency: { percent: NaN } });
  const none = horizonParams({ ...base, proficiency: null });
  check("horizon: null or NaN gives −1 and kind 'static' (unlit)", [nul, nan, none].every((p) => p.front === -1 && p.kind === "static" && !p.measured && p.percent === null));
  check("horizon: ACTIVE and measured is 'ambient'", horizonParams({ ...base, proficiency: { percent: 41 } }).kind === "ambient");
  check("horizon: SELF_REPORTED gives the dotted walked path", horizonParams({ ...base, proficiency: { percent: 23, class: "SELF_REPORTED" } }).dotted);
  check("horizon: MEASURED and live give solid", !horizonParams({ ...base, proficiency: { percent: 23, class: "MEASURED" } }).dotted && !horizonParams({ ...base, proficiency: { percent: 23, class: "MEASURED", live: true } }).dotted);
  const contours = [12, 10, 8, null].map((d) => horizonParams({ ...base, depth: d, proficiency: { percent: 41 } }).contours);
  check("horizon: depth 12 / 10 / 8 / null gives contours 12 / 10 / 8 / 0", contours.join() === "12,10,8,0", contours.join());
  check("horizon: ARCHIVED and DONE give kind 'static' (ARCHIVED dimmed)", ["ARCHIVED", "DONE"].every((s) => horizonParams({ ...base, status: s, proficiency: { percent: 64 } }).kind === "static") && horizonParams({ ...base, status: "ARCHIVED", proficiency: { percent: 64 } }).dim);
  const s1 = horizonParams({ ...base, proficiency: { percent: 41 } }).seed;
  const s2 = horizonParams({ ...base, proficiency: { percent: 90 } }).seed;
  const s3 = horizonParams({ ...base, roadmapId: "rm-2", proficiency: { percent: 41 } }).seed;
  check("horizon: the seed is deterministic per roadmapId, in [0, 1), and differs across ids", s1 === s2 && s1 !== s3 && s1 >= 0 && s1 < 1);

  // No Proficiency in any uniform: the frame has no such key, and the slot's params are the seed alone.
  const frame: UniformFrame = { w: 312, h: 56, dpr: 1, time: 3, ink: [1, 1, 1], cap: 0.2, seed: s1, air: 0.5 };
  const keys = Object.keys(frame).join();
  check("horizon: the uniform frame carries no Proficiency (no percent, front, value)", !/percent|front|value|proficiency/i.test(keys), keys);
  const hf = strip(read("src/components/fx/HorizonField.tsx"));
  check("horizon: HorizonField hands the runtime the seed only (params={[p.seed]})", /params=\{\[p\.seed\]\}/.test(hf));
  check("horizon: HORIZON's uniforms are the same for any Proficiency (the binder has no such input)", JSON.stringify(BINDERS.horizon(frame)) === JSON.stringify(BINDERS.horizon({ ...frame })));
  const ids = HORIZON.match(/[A-Za-z_]\w*/g) ?? [];
  check("horizon: the HORIZON source has no bez, front, walked or path identifier (D15)", !ids.some((t) => /^(bez\w*|front\w*|walked\w*|path\w*)$/i.test(t)), ids.filter((t) => /bez|front|walk|path/i.test(t)).join());
}

// ── 2. transitions and the seen key ────────────────────────────────────────
function transitions() {
  check("transition: lastSeen null gives from == front", horizonTransition({ lastSeen: null, front: 0.41 }).from === 0.41);
  check("transition: .50 → .41 gives from = lastSeen (a fall moves too, D9)", horizonTransition({ lastSeen: 0.5, front: 0.41 }).from === 0.5);
  check("transition: .30 → .41 gives from = lastSeen", horizonTransition({ lastSeen: 0.3, front: 0.41 }).from === 0.3);
  check("transition: a different basis gives from == front", horizonTransition({ lastSeen: 0.3, front: 0.41, sameBasis: false }).from === 0.41);
  check("transition: a rebase gives from == front", horizonTransition({ lastSeen: 0.3, front: 0.41, rebased: true }).from === 0.41);
  check("transition: a value stored while unmeasured (−1) never draws from 0", horizonTransition({ lastSeen: -0.01, front: 0.41 }).from === 0.41);
  check("transition: unmeasured now gives no transition", horizonTransition({ lastSeen: 0.3, front: -1 }).from === -1);
  const k = horizonSeenKey("rm-1", "3:2166136261");
  check("seen key: carries the basis signature and what 'horizon', no surface", k.basis === "3:2166136261" && k.what === "horizon" && k.roadmapId === "rm-1" && !/you|card|header|page/i.test(JSON.stringify(k)));
  const hf = strip(read("src/components/fx/HorizonField.tsx"));
  check("seen key: HorizonField keys useSeenValue on horizonSeenKey(roadmapId, basisKey)", /horizonSeenKey\(roadmapId, basisKey\)/.test(hf) && /useSeenValue\(key,/.test(hf));
  check("horizon-front: a rebase passes rebased (no transition), full only, fill 'backwards', 700 ms", /change\?\.kind === "rebased"/.test(hf) && /motionLevel\(\) !== "full"/.test(hf) && /fill: "backwards"/.test(hf) && /FRONT_MS = 700/.test(hf));
  check("horizon-front: it plays through the gateway's play() (no element.animate)", /\bplay\(/.test(hf) && !/\.animate\(/.test(hf));
}

// ── 3. geometry and the dawn ───────────────────────────────────────────────
function geometry() {
  for (const [w, h] of [
    [312, 56],
    [312, 64],
    [600, 72],
  ] as const) {
    const g = horizonGeometry(w, h);
    check(`geometry ${w}×${h}: p1.x is the midpoint`, near(g.p1[0], (g.p0[0] + g.p2[0]) / 2));
    let inc = true;
    let lin = true;
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const f = i / 100;
      const x = frontPoint(g, f)[0];
      if (!(x > prev)) inc = false;
      if (!near(x, g.p0[0] + f * (g.p2[0] - g.p0[0]), 1e-9)) lin = false;
      prev = x;
    }
    check(`geometry ${w}×${h}: frontPoint(f).x is linear and strictly increasing`, inc && lin);
    const a = frontPoint(g, 0);
    const b = frontPoint(g, 1);
    check(`geometry ${w}×${h}: frontPoint(0) = p0 and frontPoint(1) = p2`, near(a[0], g.p0[0]) && near(a[1], g.p0[1]) && near(b[0], g.p2[0]) && near(b[1], g.p2[1]));
    const f = 0.41;
    check(`geometry ${w}×${h}: the walked width equals f × (p2.x − p0.x) within 1e-9`, near(frontPoint(g, f)[0] - g.p0[0], f * (g.p2[0] - g.p0[0]), 1e-9));
  }

  // The SVG dawn (piecewise-linear stops, clipped above the hairline, at --shd-cap) against the HORIZON maths at air 0.
  const stops = horizonDawnStops();
  const svgAlpha = (r: number) => {
    const o = r / 1.6;
    if (o >= 1) return stops[stops.length - 1].opacity;
    for (let i = 1; i < stops.length; i++) {
      if (o <= stops[i].offset) {
        const a = stops[i - 1];
        const b = stops[i];
        return a.opacity + ((o - a.offset) / (b.offset - a.offset)) * (b.opacity - a.opacity);
      }
    }
    return 0;
  };
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const tokens = read("src/app/styles/tokens.css");
  const night = { ink: parseCssColor(/--ink-0:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1])!, card: parseCssColor(/--card:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1])! };
  const vblock = tokens.slice(tokens.indexOf(':root[data-theme="vellum"]'));
  const vellum = { ink: parseCssColor(/--ink-0:\s*(#[0-9a-f]{6})/i.exec(vblock)?.[1])!, card: parseCssColor(/--card:\s*(#[0-9a-f]{6})/i.exec(vblock)?.[1])! };
  for (const [name, th] of [
    ["Night", night],
    ["Vellum", vellum],
  ] as const) {
    const cap = capFor("horizon", th.card);
    let worst = 0;
    for (const [w, h] of [
      [312, 56],
      [600, 72],
    ] as const) {
      const g = horizonGeometry(w, h);
      const e = dawnEllipse(g);
      for (const fx of [0.5, 0.8, 0.93])
        for (const fy of [0.08, 0.2, 0.3]) {
          const x = fx * w;
          const y = fy * h; // SVG, y down, above the hairline at .38h
          // HORIZON (GL y up; DPR 1 for the horizon): e = (px − (aimX, H)) / (.62·RES.x, 1.15·(RES.y − H) + 1)
          const H = 0.62 * h;
          const yg = h - y;
          const ex = (x - 0.93 * w) / (0.62 * w);
          const ey = (yg - H) / (1.15 * (h - H) + 1);
          const gl = Math.exp(-(ex * ex + ey * ey) * 2.2) * smooth(H - 1, H + 1, yg) * cap;
          const r = Math.hypot((x - e.cx) / e.rx, (y - e.cy) / e.ry);
          const sv = (y < g.yh ? svgAlpha(r) : 0) * cap;
          for (let c = 0; c < 3; c++) {
            const d = Math.abs(sv - gl) * Math.abs(th.ink[c] - th.card[c]) * 255 + 0.5; // + the shader's ±0.5/255 dither
            worst = Math.max(worst, d);
          }
        }
    }
    check(`dawn (${name}, cap ${cap}): the SVG equals HORIZON at air 0 within 1/255 per channel at 9 points`, worst <= 1, `worst ${worst.toFixed(3)}/255`);
  }
}

// ── 4. weave, gate, sizes, palette, governor ───────────────────────────────
const CLEAR: GateInput = {
  level: "full",
  osReducedMotion: false,
  contrastMore: false,
  forcedColors: false,
  supported: true,
  highp: true,
  degraded: false,
  noFx: false,
  saveData: false,
  deviceMemory: 8,
  programOff: false,
  program: "horizon",
  kind: "ambient",
  route: "/you",
  power: false,
  hidden: false,
  inView: true,
  offscreenMs: 0,
  live: false,
  otherLoopLive: false,
  measured: true,
  ambientLeftMs: 4000,
  stale: false,
  paused: false,
  runAgeMs: 0,
  horizonAir: true,
};

function weaveAndGate() {
  check("weave: the period is 12 s and 600 / 12 is an integer (a seamless wrap)", WEAVE_PERIOD === 12 && Number.isInteger(FX.wrap / WEAVE_PERIOD) && /TIME\/12\.0/.test(WEAVE));
  check("weave: stale or paused gives kind 'static'", weaveParams({ stale: true }).kind === "static" && weaveParams({ paused: true }).kind === "static" && weaveParams({}).kind === "wait");
  const segs = weaveGeometry(312, 48);
  check("weave: 4 strands × 8 static over / under segments (m + i odd is over)", segs.length === 32 && segs.filter((s) => s.over).length === 16);

  const W: GateInput = { ...CLEAR, program: "weave", kind: "wait", route: "/you/roadmap" };
  const css = (o: Partial<GateInput>, base = CLEAR) => shaderMode({ ...base, ...o }) === "css";
  check("gate: full and all clear → loop (AMBIENT and WAIT)", shaderMode(CLEAR) === "loop" && shaderMode(W) === "loop");
  check("gate: still and calm → css", css({ level: "still" }) && css({ level: "calm" }) && css({ level: "calm" }, W));
  check("gate: contrastMore and forcedColors → css", css({ contrastMore: true }) && css({ forcedColors: true }) && css({ contrastMore: true }, W));
  check("gate: kind static → css", css({ kind: "static" }));
  check("gate: unsupported, !highp, degraded, noFx, saveData, deviceMemory ≤ 2, program off → css", css({ supported: false }) && css({ highp: false }) && css({ degraded: true }) && css({ noFx: true }) && css({ saveData: true }) && css({ deviceMemory: 2 }) && css({ programOff: true }));
  check("gate: supported / highp not yet probed (null) do not block", shaderMode({ ...CLEAR, supported: null, highp: null }) === "loop");
  check("gate: deviceMemory 4 or unknown does not block", shaderMode({ ...CLEAR, deviceMemory: 4 }) === "loop" && shaderMode({ ...CLEAR, deviceMemory: null }) === "loop");
  check("gate: otherLoopLive → css", css({ otherLoopLive: true }) && css({ otherLoopLive: true }, W));
  check("gate: AMBIENT with OS reduced motion, a spent budget, an outside route, !HORIZON_AIR or unmeasured → css", css({ osReducedMotion: true }) && css({ ambientLeftMs: 0 }) && css({ route: "/today" }) && css({ route: "/review" }) && css({ horizonAir: false }) && css({ measured: false }));
  check("gate: OS reduced motion alone does not stop a WAIT (it is pausable and calm/still already stop it)", shaderMode({ ...W, osReducedMotion: true }) === "loop");
  check("gate: WAIT stale, paused or ≥ 90 s → css", css({ stale: true }, W) && css({ paused: true }, W) && css({ runAgeMs: 90000 }, W) && !css({ runAgeMs: 89999 }, W));
  check("gate: power save → css", css({ power: true }) && css({ power: true }, W));
  check("gate: live and hidden or offscreen → hold, then css after 10 s", shaderMode({ ...CLEAR, live: true, hidden: true }) === "hold" && shaderMode({ ...CLEAR, live: true, inView: false, offscreenMs: 9999 }) === "hold" && shaderMode({ ...CLEAR, live: true, inView: false, offscreenMs: 10000 }) === "css");
  check("gate: not live and hidden or offscreen → css (re-gated in view)", css({ hidden: true }) && css({ inView: false }));
  check("gate: the reason code names the row", gate({ ...CLEAR, level: "calm" })[1] === "level" && gate({ ...CLEAR, route: "/today" })[1] === "ambient" && gate({ ...CLEAR, live: true, inView: false })[1] === "held");
  check("gate: AMBIENT_ROUTES excludes /today and /review (and their children)", !AMBIENT_ROUTES.some((r) => r === "/today" || r === "/review" || r.startsWith("/today/") || r.startsWith("/review/")));
  check("gate: AMBIENT_ROUTES are /you, /you/roadmap and the three dev pages", AMBIENT_ROUTES.join() === "/you,/you/roadmap,/dev/style/art/you,/dev/style/roadmap,/dev/style/fx");
  check("gate: HORIZON_AIR is the one switch, and it is on (U1 = a: 5 s settle)", HORIZON_AIR === true && FX.ambientMax === 5000 && FX.ramp === 400);

  check("dprOf: horizon 3 → 1, 1 → 1, NaN or 0 → 1", dprOf("horizon", 3) === 1 && dprOf("horizon", 1) === 1 && dprOf("horizon", NaN) === 1 && dprOf("horizon", 0) === 1);
  check("dprOf: weave 3 → 1.5", dprOf("weave", 3) === 1.5 && dprOf("weave", 1) === 1);
  check("slotPixels: (312, 56, 1) → [312, 56]; (312, 48, 1.5) → [468, 72]", slotPixels(312, 56, 1).join() === "312,56" && slotPixels(312, 48, 1.5).join() === "468,72");
  check("slotPixels: the per-program pixel caps are honoured (horizon 1024 × 160, weave 1024 × 96)", slotPixels(2000, 300, 1, "horizon").join() === "1024,160" && slotPixels(1500, 80, 1.5, "weave").join() === "1024,96" && slotPixels(0, 0, 1).join() === "1,1");

  const p = (s: string) => parseCssColor(s)?.map((v) => Math.round(v * 255)).join();
  check("parseCssColor: '#f1f3f8', '#abc', 'rgba(…, .34)'", p("#f1f3f8") === "241,243,248" && p("#abc") === "170,187,204" && p("rgba(17, 21, 29, .34)") === "17,21,29" && p(" rgb(1 2 3) ") === "1,2,3");
  check("parseCssColor: garbage → null", ["", "red", "#12", "rgb(a,b,c)", "var(--ink-0)", "#gggggg", "rgb(300,0,0)"].every((s) => parseCssColor(s) === null));
  const tokens = read("src/app/styles/tokens.css");
  const nightCard = parseCssColor(/--card:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1]);
  const vellumCard = parseCssColor(/--card:\s*(#[0-9a-f]{6})/i.exec(tokens.slice(tokens.indexOf(':root[data-theme="vellum"]')))?.[1]);
  check("palette: the horizon cap is .20 on Night and .14 on Vellum (the real --card tokens); the weave .7", capFor("horizon", nightCard) === 0.2 && capFor("horizon", vellumCard) === 0.14 && capFor("weave", nightCard) === 0.7);
  check("palette: SHADER_VARS is ink and card only (no --owed, --gold-*, --mp, --xp, --pts, --light)", SHADER_VARS.every((v) => /^--(ink-0|ink-2|ink-mute|card)$/.test(v)) && !SHADER_VARS.some((v) => /owed|gold|--mp|--xp|--pts|light/.test(v)));
  const fxcss = read("src/components/fx/fx.css");
  check("palette: fx.css mirrors the caps as --shd-cap (.2 Night, .14 Vellum)", /\.shd \{[^}]*--shd-cap: \.2;/.test(fxcss) && /:root\[data-theme="vellum"\] \.shd \{ --shd-cap: \.14; \}/.test(fxcss));

  check("governor: before load + idle → not sampled", throttleVerdict({ ready: false, windows: [40, 40] }) === "not-sampled");
  check("governor: fewer than 2 windows → measuring", throttleVerdict({ ready: true, windows: [] }) === "measuring" && throttleVerdict({ ready: true, windows: [40] }) === "measuring");
  check("governor: two 2 s windows with a median over 22 ms → degrade", throttleVerdict({ ready: true, windows: [33, 34] }) === "degrade");
  check("governor: one slow window then a fast one → ok", throttleVerdict({ ready: true, windows: [33, 16.7] }) === "ok" && throttleVerdict({ ready: true, windows: [16.7, 16.7] }) === "ok");
}

// ── 5. GLSL lint ───────────────────────────────────────────────────────────
function glsl() {
  const ZERO: UniformFrame = { w: 1, h: 1, dpr: 1, time: 0, ink: [0, 0, 0], cap: 0, seed: 0, air: 0 };
  for (const id of ["horizon", "weave"] as const) {
    const src = PROGRAMS[id].frag;
    const code = src.replace(/\/\/.*$/gm, "");
    check(`glsl ${id}: the precision guard comes first`, src.startsWith("#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif"));
    check(`glsl ${id}: WebGL1 only (no #version 300, no in / out qualifiers, no texture, no indexing)`, !/#version/.test(code) && !/(^|[;{\s])(in|out)\s+(vec\d|float|int|mat\d|bool)\b/m.test(code) && !/\btexture(2D|Cube)?\s*\(/.test(code) && !/sampler/.test(code) && !/\[/.test(code));
    const fors = code.match(/\bfor\s*\(/g) ?? [];
    const bounded = [...code.matchAll(/\bfor\s*\(\s*int\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*(\d+)\s*;\s*\1\+\+\s*\)/g)];
    check(`glsl ${id}: every loop has a literal int bound ≤ 4`, fors.length === bounded.length && bounded.every((m) => Number(m[2]) <= 4), `${fors.length} loops`);
    const rev = [...code.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)].filter((m) => Number(m[1]) >= Number(m[2]));
    check(`glsl ${id}: no smoothstep with reversed literal edges`, rev.length === 0, rev.map((m) => m[0]).join());
    const declared = [...code.matchAll(/\buniform\s+(\w+)\s+(\w+)\s*;/g)];
    const bound = Object.keys(BINDERS[id](ZERO)).sort();
    const names = declared.map((m) => m[2]).sort();
    check(`glsl ${id}: the declared uniforms match the binder's keys exactly, both ways`, names.join() === bound.join(), `${names.join()} vs ${bound.join()}`);
    check(`glsl ${id}: ≤ 4 uniforms, all vec4`, declared.length <= 4 && declared.every((m) => m[1] === "vec4"));
    check(`glsl ${id}: the source (prelude included) is ≤ 2 KB`, Buffer.byteLength(src) <= 2048, `${Buffer.byteLength(src)} B`);
    check(`glsl ${id}: no 'spin'`, !/spin/i.test(src));
    check(`glsl ${id}: ink and alpha only through premul (premultiplied alpha, nothing else written)`, (code.match(/gl_FragColor\s*=/g) ?? []).length === 1 && /gl_FragColor=premul\(/.test(code.replace(/\s+/g, "")));
  }
  check("glsl: the vertex shader is one full-screen triangle (a_pos → v_uv)", /attribute vec2 a_pos;/.test(VERT) && /v_uv=a_pos\*0\.5\+0\.5/.test(VERT) && !/#version/.test(VERT));
  const drift = Number(/drift=TIME\*([\d.]+)/.exec(HORIZON)?.[1]);
  check("glsl: the prelude's vnoise is 32-cell periodic and the air drifts 32 cells per 600 s (the wrap is seamless)", /mod\(i,32\.0\)/.test(PRELUDE) && /mod\(i\+1\.0,32\.0\)/.test(PRELUDE) && FX.wrap === 600 && near(600 * drift, 32, 1e-4), String(600 * drift));
  check("glsl: the horizon air is zero-mean (two opposite drifts, ±20% at most)", /vec2\(drift,0\.0\)\)\+vnoise\(g\*1\.7-SEED\*53\.0-vec2\(drift,0\.0\)\)\)-0\.5/.test(HORIZON.replace(/\s+/g, "")) && /n\*0\.4/.test(HORIZON));
  check("glsl: fps and caps per program (horizon 12 fps / DPR 1, weave 20 fps / DPR 1.5)", PROGRAMS.horizon.fps === 12 && PROGRAMS.weave.fps === 20 && PROGRAMS.horizon.dprCap === 1 && PROGRAMS.weave.dprCap === 1.5 && LIMITS.horizon.licence === "ambient" && LIMITS.weave.licence === "wait");
}

// ── 6. runtime static rules ────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|mjs|js)$/.test(n)) out.push(rel);
  }
  return out;
}

function statics() {
  const engine = strip(read("src/lib/shader/engine.ts"));
  const runtime = strip(read("src/lib/shader/runtime.ts"));
  const lazy = engine + runtime + strip(read("src/lib/shader/programs.ts"));
  const all = walk("src/lib/shader").concat(walk("src/components/fx")).map((f) => strip(read(f))).join("\n");
  check("runtime: imports none of three, ogl, regl, twgl or pixi", !/from\s+["'](three|ogl|regl|twgl|pixi(\.js)?|@pixi\/[\w-]+)["']/.test(all) && !/import\(\s*["'](three|ogl|regl|twgl|pixi)/.test(all));
  const pkg = read("package.json");
  check("runtime: no 3D library in package.json", !/"(three|ogl|regl|twgl|pixi\.js|@react-three\/fiber)"\s*:/.test(pkg));
  check("runtime: getContext('webgl') with failIfMajorPerformanceCaveat and powerPreference 'low-power', no depth / stencil / antialias / preserved buffer", /getContext\("webgl"/.test(engine) && /failIfMajorPerformanceCaveat: !host\.force\(\)/.test(engine) && /powerPreference: "low-power"/.test(engine) && /antialias: false/.test(engine) && /depth: false/.test(engine) && /stencil: false/.test(engine) && /preserveDrawingBuffer: false/.test(engine) && /premultipliedAlpha: true/.test(engine));
  check("runtime: DPR capped per program and pixel caps applied (dprOf + slotPixels with the program)", /slotPixels\(w, h, dprOf\(s\.spec\.program, host\.dpr\(\)\), s\.spec\.program\)/.test(engine));
  const disp = engine.slice(engine.indexOf("function dispose("), engine.indexOf("function lost("));
  const iRm = disp.indexOf('removeEventListener("webglcontextlost"');
  const iRm2 = disp.indexOf('removeEventListener("webglcontextrestored"');
  const iLose = disp.indexOf("loseContext()");
  check("runtime: dispose() removes the lost / restored listeners before loseContext()", iRm >= 0 && iRm2 >= 0 && iLose > iRm && iLose > iRm2);
  check("runtime: dispose() removes the canvas and sets data-shd-state=\"fallback\" (via unshow) and clears data-live", /c\.remove\(\)/.test(disp) && /unshow\(s\)/.test(disp) && /removeAttribute\("data-live"\)[\s\S]*setAttribute\("data-shd-state", "fallback"\)/.test(engine.slice(engine.indexOf("function unshow("))));
  check("runtime: data-weave-live is set on the [data-wait] card while the weave is live, and cleared", /card\(s\)\?\.setAttribute\("data-weave-live", ""\)/.test(engine) && /card\(s\)\?\.removeAttribute\("data-weave-live"\)/.test(engine));
  check("runtime: never calls console.* or getError", !/console\./.test(lazy + all) && !/getError\s*\(/.test(lazy));
  check("runtime: html[data-shader-running] while a loop runs", /setAttribute\("data-shader-running", ""\)/.test(engine) && /removeAttribute\("data-shader-running"\)/.test(engine));
  check("runtime: the debug hooks (status, running, frames, probe, lose, restore, clock) are installed only in dev, under /dev/style or with __XTNL_SHD_FORCE", /process\.env\.NODE_ENV !== "production" \|\| location\.pathname\.startsWith\("\/dev\/style"\) \|\| w\.__XTNL_SHD_FORCE/.test(runtime) && ["status:", "running:", "get frames()", "probe:", "lose:", "restore:", "clock:"].every((k) => runtime.includes(k)));
  check("runtime: one MutationObserver on <html> for data-motion, data-power and data-theme; matchMedia change on contrast, forced colours and reduced motion", /attributeFilter: \["data-motion", "data-power", "data-theme"\]/.test(runtime) && ["(prefers-contrast: more)", "(forced-colors: active)", "(prefers-reduced-motion: reduce)"].every((q) => runtime.includes(q)));
  check("runtime: pagehide releases, pageshow (persisted) re-gates, visibilitychange re-gates", /"pagehide", onPageHide/.test(runtime) && /e\.persisted/.test(runtime) && /"visibilitychange", onRegate/.test(runtime));

  // import() only: nothing in src reaches the runtime, the engine or the programs statically, except the runtime itself.
  const statics: string[] = [];
  for (const f of walk("src")) {
    const s = strip(read(f));
    for (const m of s.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)) {
      const target = m[1];
      const hit = /(^@\/lib\/shader\/(runtime|engine|programs)$)|(^\.\/(runtime|engine|programs)$)/.test(target);
      const allowed = (f === "src/lib/shader/runtime.ts" && /engine$/.test(target)) || (f === "src/lib/shader/engine.ts" && /programs$/.test(target));
      if (hit && !allowed) statics.push(`${f} → ${target}`);
    }
  }
  check("runtime: reached only through import() (no static import of runtime, engine or programs outside the chunk)", statics.length === 0, statics.join("; "));
  const slot = strip(read("src/components/fx/ShaderSlot.tsx"));
  check("runtime: ShaderSlot loads it with import(\"@/lib/shader/runtime\") only after the quiet pre-gate", /import\("@\/lib\/shader\/runtime"\)/.test(slot) && /preGate\(el, spec\) !== "loop"/.test(slot) && /document\.readyState !== "complete"/.test(slot) && /requestIdleCallback\(go, \{ timeout: FX\.idle \}\)/.test(slot));
  check("runtime: a static slot never loads it (kind === 'static' returns before anything)", /if \(!el \|\| kind === "static" \|\| typeof IntersectionObserver !== "function"\) return;/.test(slot));
  check("runtime: nothing under the /today or /review trees imports @/components/fx", ![...walk("src/app/today"), ...walk("src/app/review"), ...walk("src/components/today")].some((f) => /@\/components\/fx/.test(read(f))));
  check("runtime: no class, attribute or label in the shader layer contains 'spin' or 'shimmer'", !/spin|shimmer/i.test(all + read("src/components/fx/fx.css").replace(/\/\*[\s\S]*?\*\//g, "")));
}

// ── 7. the engine with a fake canvas and a fake clock ──────────────────────
type Listener = (e: { type: string; preventDefault(): void }) => void;

class FakeEl {
  tag: string;
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  id = "";
  constructor(tag: string, attrs: Record<string, string> = {}) {
    this.tag = tag;
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
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
  getAttribute(n: string) {
    return this.attrs.get(n) ?? null;
  }
  matches(sel: string): boolean {
    let m = /^\[([\w-]+)(?:(~?=)"([^"]*)")?\]$/.exec(sel);
    if (m) {
      const v = this.attrs.get(m[1]);
      if (v === undefined) return false;
      if (!m[2]) return true;
      return m[2] === "=" ? v === m[3] : v.split(" ").includes(m[3]);
    }
    m = /^\.([\w-]+)$/.exec(sel);
    if (m) return (this.attrs.get("class") ?? "").split(/\s+/).includes(m[1]);
    return sel === this.tag;
  }
  closest(sel: string): FakeEl | null {
    return this.matches(sel) ? this : (this.parent?.closest(sel) ?? null);
  }
  querySelector(sel: string): FakeEl | null {
    for (const c of this.children) {
      if (c.matches(sel)) return c;
      const d = c.querySelector(sel);
      if (d) return d;
    }
    return null;
  }
  insertBefore(node: FakeEl, ref: FakeEl | null) {
    node.parent?.removeChild(node);
    node.parent = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(node);
    else this.children.splice(i, 0, node);
    return node;
  }
  appendChild(node: FakeEl) {
    return this.insertBefore(node, null);
  }
  removeChild(node: FakeEl) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    node.parent = null;
  }
  remove() {
    this.parent?.removeChild(this);
  }
  get canvas(): FakeCanvas | null {
    return (this.children.find((c) => c.tag === "canvas") as FakeCanvas | undefined) ?? null;
  }
}

interface Draw {
  t: number;
  u: Record<string, number[]>;
  live: boolean;
  canvas: FakeCanvas;
}

interface World {
  t: number;
  getContextCalls: number;
  glOk: boolean;
  highp: boolean;
  linkOk: boolean;
  khr: boolean;
  draws: Draw[];
  canvases: FakeCanvas[];
  env: Env;
  session: Map<string, string>;
  loaded: boolean;
  varsReads: number;
}

class FakeCanvas extends FakeEl {
  width = 300;
  height = 150;
  listeners = new Map<string, Set<Listener>>();
  gl: FakeGL | null = null;
  given: WebGLContextAttributes | null = null;
  constructor(private world: World) {
    super("canvas");
  }
  getContext(_type: string, attrs: WebGLContextAttributes) {
    this.world.getContextCalls++;
    this.given = attrs;
    if (!this.world.glOk) return null;
    this.gl = new FakeGL(this, this.world);
    return this.gl;
  }
  addEventListener(t: string, fn: Listener) {
    if (!this.listeners.has(t)) this.listeners.set(t, new Set());
    this.listeners.get(t)!.add(fn);
  }
  removeEventListener(t: string, fn: Listener) {
    this.listeners.get(t)?.delete(fn);
  }
  dispatch(t: string) {
    for (const fn of [...(this.listeners.get(t) ?? [])]) fn({ type: t, preventDefault() {} });
  }
}

class FakeGL {
  VERTEX_SHADER = 1;
  FRAGMENT_SHADER = 2;
  HIGH_FLOAT = 3;
  LINK_STATUS = 4;
  ARRAY_BUFFER = 5;
  STATIC_DRAW = 6;
  FLOAT = 7;
  COLOR_BUFFER_BIT = 8;
  TRIANGLES = 9;
  RGBA = 10;
  UNSIGNED_BYTE = 11;
  lost = false;
  cur: Record<string, number[]> = {};
  lose = { loseContext: () => this.setLost(true), restoreContext: () => this.setLost(false) };
  constructor(
    public canvas: FakeCanvas,
    private world: World
  ) {}
  private setLost(on: boolean) {
    this.lost = on;
    this.canvas.dispatch(on ? "webglcontextlost" : "webglcontextrestored");
  }
  getShaderPrecisionFormat() {
    return { precision: this.world.highp ? 23 : 0, rangeMin: 127, rangeMax: 127 };
  }
  getExtension(n: string) {
    if (n === "WEBGL_lose_context") return this.lose;
    if (n === "KHR_parallel_shader_compile" && this.world.khr) return { COMPLETION_STATUS_KHR: 99 };
    return null;
  }
  createShader() {
    return {};
  }
  shaderSource() {}
  compileShader() {}
  createProgram() {
    return { polls: 0 };
  }
  attachShader() {}
  linkProgram() {}
  getProgramParameter(p: { polls: number }, pname: number) {
    if (pname === 99) return ++p.polls >= 3;
    if (pname === this.LINK_STATUS) return this.world.linkOk;
    return null;
  }
  useProgram() {}
  createBuffer() {
    return {};
  }
  bindBuffer() {}
  bufferData() {}
  getAttribLocation() {
    return 0;
  }
  enableVertexAttribArray() {}
  vertexAttribPointer() {}
  getUniformLocation(_p: unknown, name: string) {
    return { name };
  }
  clearColor() {}
  viewport() {}
  clear() {}
  uniform4f(loc: { name: string }, a: number, b: number, c: number, d: number) {
    this.cur[loc.name] = [a, b, c, d];
  }
  drawArrays() {
    this.world.draws.push({ t: this.world.t, u: { ...this.cur }, live: this.canvas.parent?.hasAttribute("data-live") ?? false, canvas: this.canvas });
  }
  isContextLost() {
    return this.lost;
  }
  readPixels(_x: number, _y: number, _w: number, _h: number, _f: number, _t: number, buf: Uint8Array) {
    buf.set([12, 34, 56, 78]);
  }
}

const PALETTE: Record<ShaderVar, string> = { "--ink-0": "#f1f3f8", "--ink-2": "#9aa3b5", "--ink-mute": "#6f788c", "--card": "#11151d" };
const FRAME = 1000 / 60;

function makeWorld(over: Omit<Partial<World>, "env"> & { env?: Partial<Env>; frameMs?: number } = {}) {
  const w: World = {
    t: 0,
    getContextCalls: 0,
    glOk: true,
    highp: true,
    linkOk: true,
    khr: false,
    draws: [],
    canvases: [],
    session: new Map(),
    loaded: true,
    varsReads: 0,
    ...over,
    env: { level: "full", reduce: false, contrast: false, forced: false, power: false, saveData: false, deviceMemory: 8, route: "/you", hidden: false, ...over.env },
  };
  let nid = 0;
  let frameT = 0;
  let frameMs = over.frameMs ?? FRAME;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const rafs = new Map<number, (t: number) => void>();
  const views = new Map<FakeEl, (v: boolean) => void>();
  const root = new FakeEl("html");
  const host: Host = {
    now: () => w.t,
    wall: () => 1_700_000_000_000 + w.t,
    raf: (cb) => (rafs.set(++nid, cb), nid),
    caf: (i) => void rafs.delete(i),
    timeout: (cb, ms) => (timers.set(++nid, { at: w.t + Math.max(0, ms), fn: cb }), nid),
    clear: (i) => void (i !== undefined && timers.delete(i)),
    idle: (cb) => void host.timeout(cb, 1),
    env: () => ({ ...w.env }),
    get: (k) => w.session.get(k) ?? null,
    set: (k, v) => void w.session.set(k, v),
    canvas: () => {
      const c = new FakeCanvas(w);
      w.canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
    vars: () => {
      w.varsReads++;
      return (n) => PALETTE[n];
    },
    size: () => [312, 56],
    dpr: () => 2.625,
    view: (el, cb) => {
      views.set(el as unknown as FakeEl, cb);
      return () => void views.delete(el as unknown as FakeEl);
    },
    resize: () => () => undefined,
    root: root as unknown as HTMLElement,
    force: () => false,
    loaded: () => w.loaded,
  };
  /** Advance the clock: timers in order, rAF callbacks at each display frame. */
  function run(ms: number) {
    const end = w.t + ms;
    for (;;) {
      let nt = Infinity;
      let id = -1;
      for (const [i, x] of timers) if (x.at < nt) [nt, id] = [x.at, i];
      const nf = frameT + frameMs;
      const next = Math.min(nt, nf);
      if (next > end) {
        w.t = end;
        return;
      }
      w.t = next;
      if (nt <= nf) {
        const x = timers.get(id)!;
        timers.delete(id);
        x.fn();
      } else {
        frameT = nf;
        const cbs = [...rafs.values()];
        rafs.clear();
        for (const cb of cbs) cb(w.t);
      }
    }
  }
  /** Run until the next display frame has been processed. */
  const frame = () => run(frameT + frameMs - w.t + 1e-6);
  const engine = createEngine(host);
  return { w, host, engine, run, frame, root, view: (el: FakeEl, v: boolean) => views.get(el)?.(v), setFrame: (ms: number) => void (frameMs = ms), rafsPending: () => rafs.size };
}

function slotEl(program: "horizon" | "weave", parent: FakeEl = new FakeEl("div")) {
  const el = new FakeEl("div", { class: `shd shd-${program}`, "data-shd": program, "data-shd-state": "fallback" });
  el.appendChild(new FakeEl("svg", { class: "shd-fb" }));
  if (program === "horizon") el.appendChild(new FakeEl("svg", { class: "shd-marks" }));
  parent.appendChild(el);
  return el;
}
const H_SPEC: SlotSpec = { program: "horizon", kind: "ambient", params: [0.42], measured: true };
const W_SPEC: SlotSpec = { program: "weave", kind: "wait", params: [0], measured: true };
const asEl = (e: FakeEl) => e as unknown as HTMLElement;
const isLive = (e: FakeEl) => e.hasAttribute("data-live") && e.getAttribute("data-shd-state") === "live" && !!e.canvas;
const isFallback = (e: FakeEl) => !e.hasAttribute("data-live") && e.getAttribute("data-shd-state") === "fallback" && !e.canvas;

function runtimeFake() {
  // still / calm / contrast / forced / power / reduced motion (AMBIENT) / outside route: no context, ever.
  for (const [name, env] of [
    ["still", { level: "still" }],
    ["calm", { level: "calm" }],
    ["prefers-contrast: more", { contrast: true }],
    ["forced colours", { forced: true }],
    ["power save", { power: true }],
    ["OS reduced motion (AMBIENT)", { reduce: true }],
    ["/today (AMBIENT)", { route: "/today" }],
  ] as const) {
    const W = makeWorld({ env: env as Partial<Env> });
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(6000);
    check(`fake: ${name} — getContext is never called and the SVG stays`, W.w.getContextCalls === 0 && isFallback(el));
  }
  {
    const W = makeWorld();
    const sim = new FakeEl("div", { "data-fx-sim": "contrast" });
    const el = slotEl("horizon", sim);
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(3000);
    check("fake: the fx page's contrast simulation — no context", W.w.getContextCalls === 0);
  }
  {
    const W = makeWorld();
    const nofx = new FakeEl("div", { "data-fx": "none" });
    const el = slotEl("horizon", nofx);
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(3000);
    check("fake: inside data-fx=\"none\" — no context", W.w.getContextCalls === 0);
  }
  {
    const W = makeWorld();
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), { ...H_SPEC, measured: false });
    W.view(el, true);
    W.run(3000);
    check("fake: an unmeasured horizon — no context", W.w.getContextCalls === 0);
  }
  {
    const W = makeWorld();
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.run(3000);
    check("fake: a slot never ≥ 50% in view — no context", W.w.getContextCalls === 0);
  }
  {
    const W = makeWorld({ loaded: false });
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(3000);
    const before = W.w.getContextCalls;
    W.w.loaded = true;
    W.engine.regate();
    W.run(1000);
    check("fake: nothing starts before the window 'load' event", before === 0 && W.w.getContextCalls === 1);
  }

  // The full horizon: quiet start, first frame, 12 fps, ramps, 5 s, release.
  {
    const W = makeWorld();
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.run(200);
    W.engine.input(); // a scroll at t = 200
    W.view(el, true);
    W.run(350);
    check("fake: input during the quiet window delays getContext (400 ms after the last input)", W.w.getContextCalls === 0);
    for (let i = 0; i < 2000 && W.w.getContextCalls === 0; i++) W.run(0.1);
    const tCtx = W.w.t;
    check("fake: then the context starts (one getContext), 400 ms after the last input", W.w.getContextCalls === 1 && tCtx >= 600 && tCtx < 660, `at ${tCtx.toFixed(1)} ms`);
    const c = W.w.canvases[0];
    check("fake: the context attributes are the spec's (low-power, failIfMajorPerformanceCaveat, no depth / stencil / AA)", !!c.given && c.given.powerPreference === "low-power" && c.given.failIfMajorPerformanceCaveat === true && c.given.depth === false && c.given.stencil === false && c.given.antialias === false && c.given.preserveDrawingBuffer === false);
    check("fake: the canvas sits before the measured marks (they stay on top) and is aria-hidden", el.children.indexOf(c) === el.children.findIndex((x) => x.matches(".shd-marks")) - 1 && c.getAttribute("aria-hidden") === "true");
    check("fake: the canvas is DPR-capped (horizon DPR 1 at devicePixelRatio 2.625)", c.width === 312 && c.height === 56);
    const firstDraws = W.w.draws.length;
    check("fake: the first canvas frame (the rest frame: air 0, TIME 0) is drawn before data-live", firstDraws === 1 && !W.w.draws[0].live && W.w.draws[0].u.u_dawn[2] === 0 && W.w.draws[0].u.u_view[3] === 0 && !el.hasAttribute("data-live"));
    W.frame();
    check("fake: data-live comes one rAF later (state 'live', html[data-shader-running])", isLive(el) && W.root.hasAttribute("data-shader-running"));
    const tLive = W.w.t;
    W.run(6000);
    const draws = W.w.draws.filter((d) => d.canvas === c && d.t > tLive);
    const span = (draws[draws.length - 1]?.t ?? tLive) - tLive;
    const gaps = draws.slice(1).map((d, i) => d.t - draws[i].t);
    const minGap = Math.min(...gaps);
    check("fake: horizon frames at ≤ 12 fps (every gap ≥ 1000 / 12 less rAF jitter)", minGap >= 1000 / 12 - 0.6 && (draws.length - 1) / ((draws[draws.length - 1].t - draws[0].t) / 1000) <= 12.05 && draws.length >= 55, `min gap ${minGap.toFixed(2)} ms, ${draws.length} frames in ${span.toFixed(0)} ms`);
    const airs = draws.map((d) => ({ t: d.t - tLive, air: d.u.u_dawn[2] }));
    const up = airs.find((a) => a.air >= 1);
    check("fake: the air ramps in over 400 ms (0 → 1)", airs[0].air < 0.35 && !!up && up.t >= 380 && up.t <= 520, `full at ${up?.t.toFixed(0)} ms`);
    const outStart = airs.findIndex((a, i) => i > 0 && a.air < 1 && airs[i - 1].air >= 1);
    check("fake: the air ramps out from about 4.6 s of visible time", outStart > 0 && airs[outStart].t >= 4550 && airs[outStart].t <= 4700, `at ${airs[outStart]?.t.toFixed(0)} ms`);
    check("fake: frames stop and the canvas is removed by 5 s of visible time (the slot is SVG again)", span <= 5000 && isFallback(el) && !W.root.hasAttribute("data-shader-running"), `last frame at ${span.toFixed(0)} ms`);
    const used = Number(W.w.session.get(AMBIENT_KEY("horizon")));
    check("fake: the spent budget is in sessionStorage (≈ 5 s)", used >= 4900 && used <= 5000, String(used));
    check("fake: the air is 0 → 1 → 0 and never beyond", airs.every((a) => a.air >= 0 && a.air <= 1));
    const n0 = W.w.draws.length;
    W.run(20000);
    check("fake: after the budget no frame and no new context (calm afterwards: AMBIENT ≤ 5 s per session)", W.w.draws.length === n0 && W.w.getContextCalls === 1);
  }

  // Three mounts in one session share one 5 s budget (a /you ↔ /you/roadmap trip, a reload).
  {
    const session = new Map<string, string>();
    let visible = 0;
    let contexts = 0;
    for (let i = 0; i < 3; i++) {
      const W = makeWorld({ session });
      const el = slotEl("horizon");
      const att = W.engine.attach(asEl(el), H_SPEC);
      W.view(el, true);
      W.run(1600);
      const mine = W.w.draws.filter((d) => d.live);
      if (mine.length) visible += mine[mine.length - 1].t - mine[0].t + 1000 / 12;
      contexts += W.w.getContextCalls;
      att.detach();
    }
    const used = Number(session.get(AMBIENT_KEY("horizon")));
    check("fake: three mounts in one session use one shared 5 s budget", used <= 5000 && visible <= 5100 && contexts === 3, `used ${used}, visible ≈ ${visible.toFixed(0)}`);
    const W = makeWorld({ session });
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(3000);
    check("fake: a fourth mount once the budget is spent gets no context", W.w.getContextCalls === 0 && isFallback(el));
  }

  // The weave: 20 fps, 90 s, the pause.
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const card = new FakeEl("div", { "data-wait": "" });
    const el = slotEl("weave", card);
    W.engine.attach(asEl(el), W_SPEC);
    W.view(el, true);
    W.run(500);
    check("fake: weave live in its [data-wait] card (data-weave-live on the card)", isLive(el) && card.hasAttribute("data-weave-live"));
    const c = W.w.canvases[0];
    check("fake: the weave canvas is capped at DPR 1.5 (468 × 84 for 312 × 56 css)", c.width === 468 && c.height === 84);
    const t0 = W.w.t;
    W.run(95000);
    const draws = W.w.draws.filter((d) => d.live);
    const last = draws[draws.length - 1].t;
    const gaps = draws.slice(1).map((d, i) => d.t - draws[i].t);
    const fps = (draws.length - 1) / ((last - draws[0].t) / 1000);
    check("fake: weave frames at ≤ 20 fps", Math.min(...gaps) >= 50 - 0.6 && fps <= 20.1 && fps >= 19, `min gap ${Math.min(...gaps).toFixed(2)} ms, ${fps.toFixed(2)} fps`);
    check("fake: the weave stops by 90 s of run (canvas removed, data-weave-live cleared)", last - t0 <= 90000 && last - t0 > 85000 && isFallback(el) && !card.hasAttribute("data-weave-live"), `${((last - t0) / 1000).toFixed(1)} s`);
    const times = draws.map((d) => d.u.u_view[3]);
    check("fake: TIME stays in [0, 600) (wrapped)", times.every((t) => t >= 0 && t < 600));
  }
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const card = new FakeEl("div", { "data-wait": "" });
    const el = slotEl("weave", card);
    W.engine.attach(asEl(el), W_SPEC);
    W.view(el, true);
    W.run(1000);
    const live = isLive(el);
    // WeavePause: data-paused on the card + the session flag + an FX_EVENT (the runtime re-gates).
    card.setAttribute("data-paused", "");
    W.w.session.set(WAIT_PAUSED_KEY, "1");
    W.engine.regate();
    check("fake: the pause stops the weave at once (same tick: canvas removed)", live && isFallback(el) && !card.hasAttribute("data-weave-live"));
    const n = W.w.draws.length;
    W.run(5000);
    check("fake: a paused weave stays SVG (the session flag)", W.w.draws.length === n && W.w.getContextCalls === 1);
  }
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(el), { ...W_SPEC, startedAt: 1_700_000_000_000 - 89_000 });
    W.view(el, true);
    W.run(5000);
    check("fake: a remounted weave keeps its run's 90 s (startedAt)", isFallback(el) && W.w.draws.filter((d) => d.live).length <= 20);
  }
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(el), { ...W_SPEC, stale: true });
    W.view(el, true);
    W.run(3000);
    check("fake: a stale run never loops", W.w.getContextCalls === 0);
  }

  // WAIT over AMBIENT, and the 1-context cap (the low-level API).
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const a = slotEl("horizon");
    const b = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    const c = slotEl("horizon");
    const ha = W.engine.mount(asEl(a), H_SPEC);
    W.run(200);
    const aLive = isLive(a);
    const hb = W.engine.mount(asEl(b), W_SPEC);
    check("fake: a WAIT mount on the page disposes a live AMBIENT slot", !!ha && aLive && !!hb && isFallback(a) && !!b.canvas);
    W.run(200);
    const hc = W.engine.mount(asEl(c), H_SPEC);
    check("fake: a second mount while one slot is live returns null (≤ 1 live context)", hc === null && W.engine.status().live === 1);
    hb?.dispose();
    check("fake: handle.dispose() releases it", isFallback(b) && W.engine.status().live === 0);
  }
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const a = slotEl("horizon");
    W.engine.attach(asEl(a), H_SPEC);
    W.view(a, true);
    W.run(1000);
    const aLive = isLive(a);
    const b = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(b), W_SPEC);
    W.view(b, true);
    W.run(1500);
    check("fake: one loop per page — a WAIT slot attached beside a live horizon takes the page (the horizon goes SVG)", aLive && isFallback(a) && isLive(b) && W.engine.status().live === 1);
  }
  {
    const W = makeWorld();
    const a = slotEl("horizon");
    const b = slotEl("horizon");
    W.engine.attach(asEl(a), H_SPEC);
    W.engine.attach(asEl(b), { ...H_SPEC, params: [0.9] });
    W.view(a, true);
    W.view(b, true);
    W.run(1500);
    check("fake: two AMBIENT slots — one live, the other waits (1 context)", W.engine.status().live === 1 && W.w.getContextCalls === 1 && (isLive(a) !== isLive(b)));
  }

  // Context loss.
  {
    const W = makeWorld({ env: { route: "/dev/style/fx" } });
    for (let i = 0; i < 3; i++) {
      const h = W.engine.mount(asEl(slotEl("weave", new FakeEl("div", { "data-wait": "" }))), W_SPEC);
      W.run(1500);
      h?.dispose();
    }
    const s = W.engine.status();
    check("fake: three mount / dispose cycles within 60 s leave supported === true (a self-initiated loss is never counted)", s.supported === true && s.countedLosses === 0 && W.w.getContextCalls === 3);
  }
  {
    const W = makeWorld({ env: { route: "/dev/style/fx" } });
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.mount(asEl(el), W_SPEC);
    W.run(1500);
    const gl = W.w.canvases[0].gl!;
    gl.lose.loseContext();
    const lostShowsSvg = !el.hasAttribute("data-live") && el.getAttribute("data-shd-state") === "fallback";
    W.run(500);
    const n = W.w.draws.length;
    W.run(500);
    const heldWhileLost = W.w.draws.length === n;
    gl.lose.restoreContext();
    W.run(200);
    const back = isLive(el);
    W.run(1500);
    gl.lose.loseContext();
    const s = W.engine.status();
    check("fake: a loss drops data-live (the SVG shows) and draws nothing until restored", lostShowsSvg && heldWhileLost);
    check("fake: webglcontextrestored rebuilds, redraws the rest frame and goes live again", back);
    check("fake: two counted losses within 60 s set supported = false and release the slot", s.supported === false && s.countedLosses === 2 && isFallback(el));
    check("fake: then nothing mounts for the session", W.engine.mount(asEl(slotEl("weave", new FakeEl("div", { "data-wait": "" }))), W_SPEC) === null);
  }
  {
    const W = makeWorld({ env: { route: "/dev/style/fx" } });
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.mount(asEl(el), W_SPEC);
    W.run(300);
    W.w.canvases[0].gl!.lose.loseContext(); // within 1 s of creation
    W.w.canvases[0].gl!.lose.restoreContext();
    W.run(1500);
    W.w.env.hidden = true;
    W.w.canvases[0].gl!.lose.loseContext(); // while hidden
    W.w.env.hidden = false;
    W.w.canvases[0].gl!.lose.restoreContext();
    W.run(1500);
    const s = W.engine.status();
    check("fake: a loss within 1 s of creation or while hidden is not counted", s.countedLosses === 0 && s.supported === true && isLive(el));
  }

  // Hold, theme, release after 10 s offscreen.
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const card = new FakeEl("div", { "data-wait": "" });
    const el = slotEl("weave", card);
    W.engine.attach(asEl(el), W_SPEC);
    W.view(el, true);
    W.run(1000);
    W.view(el, false);
    const reads = W.w.varsReads;
    const n = W.w.draws.length;
    W.engine.theme();
    W.run(3000);
    check("fake: offscreen → held: the context stays, no frame, no rAF (data-shd-hold)", !!el.canvas && el.hasAttribute("data-shd-hold") && W.w.draws.length === n && W.rafsPending() === 0);
    check("fake: a theme change while held draws nothing and reads nothing until visible", W.w.varsReads === reads && W.w.draws.length === n);
    W.view(el, true);
    W.run(200);
    check("fake: back in view → resumes, and the palette is re-read at the next drawn frame", W.w.draws.length > n && W.w.varsReads === reads + 1 && !el.hasAttribute("data-shd-hold"));
    W.view(el, false);
    W.run(10100);
    check("fake: 10 s offscreen → the context is released (SVG)", isFallback(el) && W.engine.status().live === 0);
    W.view(el, true);
    W.run(1000);
    check("fake: back in view later → a new context after a quiet moment", isLive(el) && W.w.getContextCalls === 2);
  }
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(el), W_SPEC);
    W.view(el, true);
    W.run(1000);
    W.w.env.hidden = true;
    W.engine.regate(); // visibilitychange
    const n = W.w.draws.length;
    W.run(2000);
    check("fake: a hidden page holds the loop (no frames)", W.w.draws.length === n && el.hasAttribute("data-shd-hold"));
    W.w.env.hidden = false;
    W.engine.regate();
    W.run(500);
    check("fake: visible again → frames resume", W.w.draws.length > n);
    W.w.env.power = true;
    W.engine.regate(); // data-power="save"
    check("fake: data-power=save stops the loop (SVG)", isFallback(el));
  }

  // Dispose then remount; a contrast change on a live slot.
  {
    const W = makeWorld();
    const el = slotEl("horizon");
    const att = W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(1000);
    const was = isLive(el);
    att.detach();
    const gone = isFallback(el) && W.engine.status().live === 0;
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    check("fake: dispose (unmount) then remount shows the fallback first (state 'fallback', no canvas)", was && gone && isFallback(el));
    W.run(1000);
    check("fake: the remount re-gates and goes live after a quiet moment", isLive(el));
    W.w.env.contrast = true;
    W.engine.regate(); // matchMedia change → prefers-contrast: more
    check("fake: a matchMedia change to prefers-contrast: more disposes a live slot at once", isFallback(el));
  }
  {
    const W = makeWorld();
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(1500);
    W.w.env.level = "calm";
    W.engine.regate(); // data-motion → calm
    check("fake: switching to calm releases a live slot at once (no ramp: calm has no loops)", isFallback(el));
  }
  {
    const W = makeWorld();
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(1500);
    W.engine.pagehide();
    check("fake: pagehide releases the context (bfcache)", isFallback(el) && W.engine.status().live === 0);
  }

  // The governor: sustained slow frames degrade the session.
  {
    const W = makeWorld({ env: { route: "/you/roadmap" }, frameMs: 33.3 });
    W.engine.ready();
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(el), W_SPEC);
    W.view(el, true);
    W.run(800);
    const live = isLive(el);
    W.run(4500);
    const s = W.engine.status();
    check("fake: two 2 s windows with a median rAF interval over 22 ms → degraded, the loop becomes SVG within ≈ 4 s", live && s.degraded && isFallback(el));
    const el2 = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(el2), W_SPEC);
    W.view(el2, true);
    W.run(2000);
    check("fake: degraded is for the session (every later gate says css)", isFallback(el2) && W.w.getContextCalls === 1);
  }
  {
    const W = makeWorld({ env: { route: "/you/roadmap" } });
    W.engine.ready();
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(el), W_SPEC);
    W.view(el, true);
    W.run(10000);
    check("fake: 60 Hz frames never degrade", !W.engine.status().degraded && isLive(el));
  }
  {
    const W = makeWorld({ env: { route: "/you/roadmap" }, frameMs: 33.3 });
    const el = slotEl("weave", new FakeEl("div", { "data-wait": "" }));
    W.engine.attach(asEl(el), W_SPEC);
    W.view(el, true);
    W.run(6000);
    check("fake: the governor does not sample before 'load' and the first idle callback", !W.engine.status().degraded);
  }

  // Fallbacks: no WebGL, mediump only, a link failure, KHR_parallel_shader_compile.
  {
    const W = makeWorld({ glOk: false });
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(3000);
    check("fake: no WebGL (getContext null) → supported false, the SVG stays, one probe only", W.engine.status().supported === false && isFallback(el) && W.w.getContextCalls === 1);
  }
  {
    const W = makeWorld({ highp: false });
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(3000);
    check("fake: mediump only → css for the session (no canvas inserted)", W.engine.status().highp === false && isFallback(el) && W.w.getContextCalls === 1);
  }
  {
    const W = makeWorld({ linkOk: false });
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(3000);
    check("fake: a link failure switches the program off silently (SVG, no frame)", isFallback(el) && W.w.draws.length === 0 && W.w.getContextCalls === 1);
  }
  {
    const W = makeWorld({ khr: true });
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(1000);
    check("fake: with KHR_parallel_shader_compile the link is polled across frames, then it goes live", isLive(el));
  }
  {
    const W = makeWorld();
    const el = slotEl("horizon");
    W.engine.attach(asEl(el), H_SPEC);
    W.view(el, true);
    W.run(1000);
    const px = W.engine.debug.probe(asEl(el), [
      [10, 10],
      [290, 20],
    ]);
    W.engine.debug.clock(4800);
    W.run(600);
    check("fake: debug probe reads pixels; clock(ms) advances the AMBIENT budget (the air ends)", !!px && px.length === 2 && isFallback(el));
  }
}

// ── 8. SSR of the slots and fx.css ─────────────────────────────────────────
async function ssr() {
  const { HorizonField } = await import("../src/components/fx/HorizonField");
  const { DraftWeave } = await import("../src/components/fx/DraftWeave");
  const { WeavePause } = await import("../src/components/fx/WeavePause");
  const { HorizonMarks } = await import("../src/components/fx/fallbacks");
  const R = (el: ReactElement) => renderToStaticMarkup(el);
  const hf = (o: Record<string, unknown>) => R(createElement(HorizonField, { proficiency: { percent: 41, class: "MEASURED", live: false, change: null }, roadmapId: "rm-1", basisKey: "1:abc", depth: 12, status: "ACTIVE", ...o } as never));
  const active = hf({});
  check("ssr: the horizon renders .shd.shd-horizon, aria-hidden, data-shd-state=\"fallback\", no canvas", /<div class="shd shd-horizon shd-band-card" aria-hidden="true" data-shd="horizon" data-shd-kind="ambient" data-shd-state="fallback">/.test(active) && !/<canvas/.test(active));
  check("ssr: the measured marks — walked path pathLength 100 with dasharray \"41 100\", the front dot, the hairline", /class="shd-walk" d="[^"]+" pathLength="100" stroke-dasharray="41 100"/.test(active) && /class="shd-front"/.test(active) && /class="shd-hair"/.test(active) && /class="shd-path"/.test(active));
  check("ssr: the dawn (the soft layer) is under the marks; 12 contours at depth 12", active.indexOf("shd-fb") < active.indexOf("shd-marks") && (active.match(/class="shd-contour"/g) ?? []).length === 12);
  check("ssr: no text, no title, no 'spin' inside a band", !/<text|title=|spin/i.test(active.replace(/<div class="shd[^>]*>/, "")));
  const page = hf({ variant: "page" });
  check("ssr: the header variant is .shd-band-page", /shd-band-page/.test(page));
  const done = hf({ status: "DONE", proficiency: { percent: 100 } });
  const archived = hf({ status: "ARCHIVED", proficiency: { percent: 64 } });
  check("ssr: DONE and ARCHIVED render kind static (ARCHIVED dim), with the dawn and marks", /data-shd-kind="static"/.test(done) && /data-shd-kind="static"/.test(archived) && /shd-dim/.test(archived) && /stroke-dasharray="100 100"/.test(done));
  const unmeasured = hf({ proficiency: { percent: null } });
  check("ssr: unmeasured renders the unlit marks (hairline, path, contours; no walked path, no dot, no dawn)", /data-shd-kind="static"/.test(unmeasured) && /shd-hair/.test(unmeasured) && /shd-path/.test(unmeasured) && !/shd-walk|shd-front|shd-dawn|shd-fb/.test(unmeasured));
  const self = hf({ proficiency: { percent: 23, class: "SELF_REPORTED" } });
  check("ssr: SELF_REPORTED is dotted (no dasharray on the walked path)", /class="shd-walk shd-dots"/.test(self) && !/stroke-dasharray/.test(self));
  const zero = hf({ proficiency: { percent: 0 } });
  check("ssr: 0% is measured (a dot at the start, dasharray \"0 100\")", /stroke-dasharray="0 100"/.test(zero) && /shd-front/.test(zero));
  const ids = [...R(createElement("div", null, createElement(HorizonField, { proficiency: { percent: 41 }, roadmapId: "a", basisKey: "1", depth: 8, status: "ACTIVE" }), createElement(HorizonField, { proficiency: { percent: 41 }, roadmapId: "b", basisKey: "1", depth: 8, status: "ACTIVE" }))).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  check("ssr: two bands on one page never share a gradient id (useId)", ids.length === 4 && new Set(ids).size === 4, ids.join());

  const marks = R(createElement(HorizonMarks, { w: 312, h: 56, front: 0.41, contours: 0 }));
  const d = /class="shd-front" d="M([\d.]+) ([\d.]+)h0"/.exec(marks);
  const g = horizonGeometry(312, 56);
  const fp = frontPoint(g, 0.41);
  check("ssr: the front dot sits at frontPoint(front)", !!d && near(Number(d[1]), Math.round(fp[0] * 100) / 100, 0.006) && near(Number(d[2]), Math.round(fp[1] * 100) / 100, 0.006));

  const weave = R(createElement(DraftWeave, {}));
  const stale = R(createElement(DraftWeave, { stale: true }));
  check("ssr: DraftWeave renders .shd-weave (WAIT), no canvas; stale renders kind static", /class="shd shd-weave" aria-hidden="true" data-shd="weave" data-shd-kind="wait"/.test(weave) && /data-shd-kind="static"/.test(stale) && !/<canvas/.test(weave) && (weave.match(/class="shd-strand"/g) ?? []).length === 8);
  check("ssr: no bar, no %, no 'spin' in the weave", !/%|spin|progress/i.test(weave));
  const pause = R(createElement(WeavePause, {}));
  check("ssr: WeavePause is a button, aria-label \"Pause animation\", aria-pressed=\"false\", the [m.pause] glyph, no title", /^<button[^>]*type="button"/.test(pause) && /aria-label="Pause animation"/.test(pause) && /aria-pressed="false"/.test(pause) && /M9 6\.5v11M15 6\.5v11/.test(pause) && !/title=/.test(pause) && /shd-pause/.test(pause));

  const css = read("src/components/fx/fx.css");
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  check("fx.css: starts with the layer order", css.split(/\r?\n/)[0].trim() === "@layer theme, base, components, art, effects, utilities;");
  check("fx.css: no @keyframes, no animation (an SVG layer never moves on its own)", !/@keyframes|animation\s*:/.test(body));
  check("fx.css: .shd canvas has pointer-events: none; .shd-marks sits above .shd-fb", /\.shd canvas \{ pointer-events: none; \}/.test(body) && /\.shd > \.shd-marks \{ z-index: 1; \}/.test(body) && /\.shd\[data-live\] > \.shd-fb \{ visibility: hidden; \}/.test(body));
  check("fx.css: the prefers-contrast and forced-colors backstops hide the canvas, the soft layer and the contours (the path and dot stay)", /@media \(prefers-contrast: more\) \{\s*\.shd canvas, \.shd > \.shd-fb, \.shd-marks \.shd-contour \{ display: none; \}/.test(body) && /@media \(forced-colors: active\) \{\s*\.shd canvas, \.shd > \.shd-fb, \.shd-marks \.shd-contour \{ display: none; \}\s*\.shd-marks \{ forced-color-adjust: auto; \}/.test(body));
  check("fx.css: ink only (no gold, --mp, --xp, --owed, --light, no hex colour)", !/--(gold|mp|xp|owed|light|pts)\b|#[0-9a-f]{3,8}\b/i.test(body));
  check("fx.css: shd-* classes only", [...body.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].every((m) => /^shd/.test(m[1]) || m[1] === "theme-night"));
  check("fx.css: fixed band heights (56 / 64 / 48; 64 / 72 from a 600 px container)", /\.shd-band-card \{ --shd-h: 56px; \}/.test(body) && /\.shd-band-page \{ --shd-h: 64px; \}/.test(body) && /\.shd-weave \{ --shd-h: 48px;/.test(body) && /@container \(min-width: 600px\)/.test(body));

  // The runtime module is inert on the server.
  const rt = await import("../src/lib/shader/runtime");
  check("runtime: importing it on the server is inert (status() unsupported-unknown, mount → null)", rt.status().live === 0 && rt.status().supported === null && rt.mount({} as HTMLElement, { program: "horizon", params: [0], kind: "ambient" }) === null);

  // The fx page: the gate, AMBIENT route, the four modes and the contrast switch.
  const fxPage = strip(read("src/app/dev/style/fx/page.tsx"));
  check("fx page: gated (devStyleEnabled), shd=off|loop|hold|lost, contrast=more, program=weave", /if \(!devStyleEnabled\(\)\) notFound\(\)/.test(fxPage) && /\["loop", "off", "hold", "lost"\]/.test(fxPage) && /contrast/.test(fxPage) && /data-fx=\{shd === "off" \? "none"/.test(fxPage));
  check("fx page: relative from the root", relative(ROOT, join(ROOT, "src/app/dev/style/fx/page.tsx")).length > 0);
}

(async () => {
  params();
  transitions();
  geometry();
  weaveAndGate();
  glsl();
  statics();
  runtimeFake();
  await ssr();
  console.log(`\nshader-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.log(String(err?.stack ?? err));
  process.exit(1);
});
