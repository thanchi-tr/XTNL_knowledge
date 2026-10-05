/**
 * Shader slot parameters (ui-motion.md §6, lane M0b). PURE and server-safe:
 * the SVG layers (fallbacks.tsx), the gate, the runtime and shader-check all
 * read these, so the canvas's rest frame and the SVG it replaces come from
 * the same numbers.
 *
 *   horizonGeometry · frontPoint · horizonParams · horizonTransition ·
 *   horizonSeenKey · horizonDawnStops       the horizon band (§6.3, §6.6)
 *   weaveParams · weaveGeometry             the drafting band
 *   parseCssColor · paletteFromVars         colours, from SHADER_VARS only
 *   dprOf · slotPixels                      canvas size (DPR and pixel caps)
 *   throttleVerdict · medianOf              the governor (§6.5 step 10)
 *   AMBIENT_ROUTES · HORIZON_AIR · FX · LIMITS
 *
 * The shader never draws a measured mark (D15): nothing here hands a
 * Proficiency value to a uniform. The measured marks are SVG.
 */
import { hashSeed } from "@/lib/motion";

export type ShaderProgram = "horizon" | "weave";
export type SlotKind = "ambient" | "wait" | "static";

/** One constant turns the horizon air off everywhere (D16). */
export const HORIZON_AIR = true;

/** The only routes where an AMBIENT slot may loop (D16). Never /today or /review. The lead adds a route. */
export const AMBIENT_ROUTES: readonly string[] = ["/you", "/you/roadmap", "/dev/style/art/you", "/dev/style/roadmap", "/dev/style/fx"];

/** The only custom properties the runtime may read (§6.3). No --owed, gold, --mp, --xp, --pts or --light. */
export const SHADER_VARS = ["--ink-0", "--ink-2", "--ink-mute", "--card"] as const;
export type ShaderVar = (typeof SHADER_VARS)[number];

/** Budgets and timings, in ms (§5.4, §6.5). */
export const FX = {
  /** AMBIENT: visible time per program per browser session. */
  ambientMax: 5000,
  /** The air ramps in and out over this. */
  ramp: 400,
  /** WAIT: the longest run. */
  waitMax: 90000,
  /** A held slot is released after this long offscreen or hidden. */
  offscreenMax: 10000,
  /** The quiet window: no scroll, pointer or key event for this long. */
  quiet: 400,
  /** requestIdleCallback timeout for the lazy load. */
  idle: 1500,
  /** Two counted context losses within this window switch WebGL off for the session. */
  lossWindow: 60000,
  /** A loss counts only once the context has been live this long. */
  lossMinLive: 1000,
  /** The governor's window and its median threshold. */
  govWindow: 2000,
  govSlow: 22,
  /** Resize debounce. */
  resize: 150,
  /** TIME wraps here (both programs are period-locked to it). */
  wrap: 600,
} as const;

/** Per-program limits (§6.5 steps 7 and 9). programs.ts reads them; they live here so the first-load code never pulls the GLSL. */
export const LIMITS: Record<ShaderProgram, { fps: number; dprCap: number; maxPx: readonly [number, number]; ink: ShaderVar; licence: "ambient" | "wait" }> = {
  horizon: { fps: 12, dprCap: 1, maxPx: [1024, 160], ink: "--ink-0", licence: "ambient" },
  weave: { fps: 20, dprCap: 1.5, maxPx: [1024, 96], ink: "--ink-2", licence: "wait" },
};

/** sessionStorage keys: the AMBIENT budget spent (ms) per program, and the WAIT pause for the session. */
export const AMBIENT_KEY = (program: ShaderProgram) => `xtnl:fx:ambient:${program}`;
export const WAIT_PAUSED_KEY = "xtnl:fx:wait-paused";
/** The DOM event a page fires to ask the runtime to re-gate (WeavePause, the fx page). */
export const FX_EVENT = "xtnl:fx";

/** The slots' nominal CSS sizes at 344 (§6.1); the client wrappers re-measure after mount. */
export const BAND = { card: [312, 56], page: [312, 64], weave: [312, 48] } as const;

const clamp01 = (v: number) => (v > 1 ? 1 : v > 0 ? v : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── horizon ────────────────────────────────────────────────────────────────

export type Pt = readonly [number, number];

/**
 * SVG coordinates (y down). The hairline sits at 62% of the height from the
 * bottom (yh = .38h from the top; GL's horizonY = .62h), the aim point at 93%
 * of the width. p1.x is the midpoint of p0.x and p2.x, so x(t) is linear and
 * frontPoint(f).x = p0.x + f · (p2.x − p0.x).
 */
export interface HorizonGeometry {
  w: number;
  h: number;
  /** The hairline, from the top. */
  yh: number;
  p0: Pt;
  p1: Pt;
  p2: Pt;
}

export function horizonGeometry(w: number, h: number): HorizonGeometry {
  const yh = 0.38 * h;
  const p0: Pt = [0.05 * w, 0.9 * h];
  const p2: Pt = [0.93 * w, yh];
  return { w, h, yh, p0, p1: [(p0[0] + p2[0]) / 2, 0.9 * h], p2 };
}

/** The point on the walked curve at front f (0..1), clamped. */
export function frontPoint(g: HorizonGeometry, f: number): Pt {
  const t = clamp01(f);
  const u = 1 - t;
  return [u * u * g.p0[0] + 2 * u * t * g.p1[0] + t * t * g.p2[0], u * u * g.p0[1] + 2 * u * t * g.p1[1] + t * t * g.p2[1]];
}

/** The curve as an SVG path, in the geometry's own units. */
export function horizonCurve(g: HorizonGeometry): string {
  return `M${r2(g.p0[0])} ${r2(g.p0[1])}Q${r2(g.p1[0])} ${r2(g.p1[1])} ${r2(g.p2[0])} ${r2(g.p2[1])}`;
}

/** 8 points along the curve from one front to another: the front dot's keyframes (horizon-front). */
export function frontKeyframes(g: HorizonGeometry, from: number, to: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 8; i++) out.push(frontPoint(g, from + ((to - from) * i) / 7));
  return out;
}

/** What a horizon slot needs from a Proficiency view (ProficiencyView fits). */
export interface HorizonProficiency {
  /** floor(100 × value); used when present. */
  percent?: number | null;
  /** The stored value in [0, 1]; used only when percent is missing. */
  value?: number | null;
  class?: string;
  live?: boolean;
}

export interface HorizonInput {
  proficiency: HorizonProficiency | null | undefined;
  /** RoadmapStatus: DRAFT · ACTIVE · DONE · ARCHIVED. */
  status: string;
  /** The target depth's level (12, 10, 8 …); null for a plan without one. */
  depth: number | null | undefined;
  roadmapId: string;
}

export interface HorizonParams {
  /** 0..1, or −1 when unmeasured. */
  front: number;
  /** The printed figure (0..100), or null when unmeasured. */
  percent: number | null;
  measured: boolean;
  /** 'ambient' only for ACTIVE (and the Aim card's ACCEPTED, which is ACTIVE) with a measured value. */
  kind: "ambient" | "static";
  /** SELF_REPORTED draws the walked path dotted. */
  dotted: boolean;
  /** One contour per level of the target depth (0 without one). */
  contours: number;
  /** ARCHIVED is dimmed (.6). */
  dim: boolean;
  /** hashSeed(roadmapId) / 2^32: the air's seed (no data in it). */
  seed: number;
}

function percentOf(p: HorizonProficiency | null | undefined): number | null {
  if (!p) return null;
  const raw = typeof p.percent === "number" && Number.isFinite(p.percent) ? p.percent : typeof p.value === "number" && Number.isFinite(p.value) ? Math.floor(100 * p.value) : null;
  if (raw === null) return null;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

/** The seed for a roadmap, in [0, 1). Deterministic per id. */
export const seedOf = (id: string) => hashSeed(id) / 4294967296;

export function horizonParams({ proficiency, status, depth, roadmapId }: HorizonInput): HorizonParams {
  const percent = percentOf(proficiency);
  const measured = percent !== null;
  const contours = typeof depth === "number" && Number.isFinite(depth) ? Math.max(0, Math.min(12, Math.round(depth))) : 0;
  return {
    front: measured ? percent / 100 : -1,
    percent,
    measured,
    kind: measured && status === "ACTIVE" ? "ambient" : "static",
    dotted: proficiency?.class === "SELF_REPORTED",
    contours,
    dim: status === "ARCHIVED",
    seed: seedOf(roadmapId),
  };
}

/**
 * horizon-front (§4.7, D8, D9): the walked path moves from the last-seen front
 * to the current one, either direction, only under the same basis. A first
 * view, another basis or a rebase gives no transition (from == to).
 */
export function horizonTransition(o: { lastSeen: number | null | undefined; front: number; sameBasis?: boolean; rebased?: boolean }): { from: number; to: number } {
  const to = o.front;
  // A stored −1 (seen while unmeasured) is no measured value: never a draw from 0.
  const ok = o.lastSeen != null && Number.isFinite(o.lastSeen) && o.lastSeen >= 0 && o.sameBasis !== false && !o.rebased && to >= 0;
  return { from: ok ? clamp01(o.lastSeen as number) : to, to };
}

/** The seen key: shared by /you and /you/roadmap (no surface in it), keyed on the Proficiency basis signature (D8). */
export function horizonSeenKey(roadmapId: string, basisKey: string): { roadmapId: string; basis: string; what: "horizon" } {
  return { roadmapId, basis: basisKey, what: "horizon" };
}

/** The dawn's falloff: exp(−2.2 r²) in the ellipse's units, as the HORIZON program computes it. */
export const dawnFalloff = (r: number) => Math.exp(-2.2 * r * r);
/** The dawn ellipse reaches r = 1.6 (where the falloff is under 1/255). */
export const DAWN_R = 1.6;

/** The SVG dawn's gradient stops: offset in [0, 1] over r ∈ [0, 1.6], opacity = the falloff (the cap is the layer's opacity). */
export function horizonDawnStops(n = 11): { offset: number; opacity: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const o = i / (n - 1);
    return { offset: Math.round(o * 1000) / 1000, opacity: Math.round(dawnFalloff(o * DAWN_R) * 10000) / 10000 };
  });
}

/** The dawn ellipse in SVG units: centred on the aim point on the hairline. */
export function dawnEllipse(g: HorizonGeometry): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: g.p2[0], cy: g.yh, rx: 0.62 * g.w, ry: 1.15 * g.yh + 1 };
}

// ─── weave ──────────────────────────────────────────────────────────────────

/** The weave's breath period (s); TIME wraps at 600, which is 50 periods, so the wrap is seamless. */
export const WEAVE_PERIOD = 12;

export function weaveParams({ stale, paused }: { stale?: boolean; paused?: boolean }): { kind: "wait" | "static" } {
  return { kind: stale || paused ? "static" : "wait" };
}

/**
 * The four strands at TIME = 0 (the program's rest frame), each cut into the 8
 * static over / under segments the program's `lift` gives (segment m of
 * strand i is "over" when m + i is odd).
 */
export function weaveGeometry(w: number, h: number): { d: string; over: boolean }[] {
  const cy = h / 2;
  const seg = w / 8;
  const out: { d: string; over: boolean }[] = [];
  for (let i = 0; i < 4; i++) {
    const k = (2 * Math.PI) / (w * (0.55 + 0.15 * i));
    const amp = h * (0.16 + 0.05 * i) * Math.cos(i * 1.5708);
    for (let m = 0; m < 8; m++) {
      const xb = (m + 1) * seg;
      let d = "";
      for (let x = m * seg; ; x += 4) {
        const xx = Math.min(x, xb);
        d += `${d ? "L" : "M"}${r2(xx)} ${r2(cy - amp * Math.sin(xx * k + i * 1.7))}`;
        if (xx >= xb) break;
      }
      out.push({ d, over: (m + i) % 2 === 1 });
    }
  }
  return out;
}

// ─── palette ────────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

/** '#f1f3f8', '#abc', 'rgb(…)', 'rgba(…, .34)' → linear 0..1 sRGB channels; garbage → null. */
export function parseCssColor(v: string | null | undefined): Rgb | null {
  const s = (v ?? "").trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
  }
  m = /^rgba?\(([^)]*)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number);
    if (p.length === 3 && p.every((x) => Number.isFinite(x) && x >= 0 && x <= 255)) return p.map((x) => x / 255) as Rgb;
  }
  return null;
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** The alpha cap: the horizon .20 on Night, .14 on Vellum (by the card's luminance); the weave .7. fx.css mirrors it as --shd-cap. */
export function capFor(program: ShaderProgram, card: Rgb | null): number {
  if (program === "weave") return 0.7;
  return card && luminance(card) >= 0.5 ? 0.14 : 0.2;
}

/** The program's ink and cap from the whitelisted custom properties only. */
export function paletteFromVars(read: (name: ShaderVar) => string, program: ShaderProgram): { ink: Rgb; cap: number } | null {
  const ink = parseCssColor(read(LIMITS[program].ink));
  return ink ? { ink, cap: capFor(program, parseCssColor(read("--card"))) } : null;
}

// ─── size ───────────────────────────────────────────────────────────────────

/** min(devicePixelRatio, the program's cap); a missing or broken ratio is 1. */
export function dprOf(program: ShaderProgram, dpr: number): number {
  return Math.min(Number.isFinite(dpr) && dpr > 0 ? dpr : 1, LIMITS[program].dprCap);
}

/** The canvas's device-pixel size: CSS size × dpr, rounded, at least 1, clamped to the program's pixel cap when given. */
export function slotPixels(cssW: number, cssH: number, dpr: number, program?: ShaderProgram): [number, number] {
  const max = program ? LIMITS[program].maxPx : [Infinity, Infinity];
  const px = (v: number, m: number) => Math.max(1, Math.min(m, Math.round((Number.isFinite(v) ? v : 0) * dpr)));
  return [px(cssW, max[0]), px(cssH, max[1])];
}

// ─── governor ───────────────────────────────────────────────────────────────

export function medianOf(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * The throttle governor (§6.5 step 10). `ready` once the window 'load' event
 * and the first idle callback have passed; `windows` holds the median rAF
 * interval of each completed 2 s window, oldest first. Two slow windows in a
 * row (median over 22 ms) degrade the session.
 */
export function throttleVerdict({ ready, windows }: { ready: boolean; windows: readonly number[] }): "not-sampled" | "measuring" | "degrade" | "ok" {
  if (!ready) return "not-sampled";
  if (windows.length < 2) return "measuring";
  const n = windows.length;
  return windows[n - 1] > FX.govSlow && windows[n - 2] > FX.govSlow ? "degrade" : "ok";
}
