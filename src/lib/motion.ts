/**
 * FROZEN CONTRACT — the one motion gateway (L0-foundation, redesign "Sigil & Slate").
 *
 * Every animation in Today, the runner, the recap and the shell goes through
 * here. framer-motion stays out of those routes.
 *
 *   motionLevel(): "full" | "calm" | "still"      what html[data-motion] says right now
 *   play(el, keyframes, opts?) → Promise<void>      WAAPI with fill:both
 *        Still → returns at once (the element's resting CSS IS the final state)
 *        Calm  → keyframes stripped to opacity, ≤ 260 ms, delay ≤ 200 ms; opts.flourish skipped
 *        Full  → as given
 *   fly(from, to, { text, kind })  → Promise<void>  the "+4.2" token + 2 trailing motes, 600 ms
 *        Full only. Calm and Still show a static floater under the target instead.
 *   burst(x, y, n, seedId, opts?)                   seeded motes (T1 8, T2 14, T3 ≤ 26). Full only.
 *   countTo(els, fromLastSeen, to, opts?)           number ticker from the LAST-SEEN value, never 0
 *   roll(el, text)                                  numeral rolls old → new (stamp ease)
 *   bump(el)                                        glyph bump 320 ms
 *   floater(near, text, kind?)                      the static "+4.2 life XP" under a target
 *   center(el), seededRandom(seed), hashSeed(seed)
 *   DUR, EASE                                       the motion tokens as numbers / strings
 *   formatFigure(value, dp)                         en-GB grouping, fixed decimals
 *
 * Only transform, opacity and stroke-dashoffset are ever animated. Every
 * function is a no-op on the server, so importing this anywhere is safe.
 */
import type { CurrencyKind, MotionLevel } from "./celebration-types";

// ─── Tokens (mirror tokens.css) ─────────────────────────────────────────────

export const DUR = {
  press: 90,
  quick: 160,
  base: 240,
  slow: 420,
  flight: 600,
  seal: 1400,
  mastery: 2200,
  ceremony: 2000,
  /** Calm ceilings. */
  calmMax: 260,
  calmDelayMax: 200,
} as const;

export const EASE = {
  out: "cubic-bezier(.16,1,.3,1)",
  inout: "cubic-bezier(.65,0,.35,1)",
  stamp: "cubic-bezier(.34,1.56,.64,1)",
} as const;

/** The currency hue a flying token takes. */
const TOKEN_COLOUR: Record<CurrencyKind, string> = { xp: "var(--xp)", pts: "var(--pts)", mp: "var(--mp)" };
/** The sprite symbol for each currency glyph (ui/Icon.tsx). */
const GLYPH: Record<CurrencyKind, string> = { xp: "c-xp", pts: "c-pts", mp: "c-mp" };

const isBrowser = (): boolean => typeof window !== "undefined" && typeof document !== "undefined";

/** What html[data-motion] says. The pre-paint script sets it before first paint; SSR reads as still. */
export function motionLevel(): MotionLevel {
  if (!isBrowser()) return "still";
  const v = document.documentElement.dataset.motion;
  return v === "calm" || v === "still" ? v : "full";
}

// ─── Seeds: the same event always gives the same burst ─────────────────────

/** FNV-1a over the string. */
export function hashSeed(seed: string | number): number {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** mulberry32 seeded by the event id. Deterministic: no Math.random anywhere in the reward path. */
export function seededRandom(seed: string | number): () => number {
  let s = hashSeed(seed);
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── The fx layer (fixed, portalled to <body>, inert) ───────────────────────

let fxLayer: HTMLDivElement | null = null;

function fx(): HTMLDivElement | null {
  if (!isBrowser()) return null;
  if (fxLayer && fxLayer.isConnected) return fxLayer;
  fxLayer = document.createElement("div");
  fxLayer.className = "fx";
  fxLayer.setAttribute("aria-hidden", "true");
  document.body.appendChild(fxLayer);
  return fxLayer;
}

export function center(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

// ─── play ───────────────────────────────────────────────────────────────────

export interface PlayOptions extends KeyframeAnimationOptions {
  /** A flight, burst or rim draw: skipped entirely under Calm. */
  flourish?: boolean;
}

const ALLOWED = new Set(["opacity", "transform", "strokeDashoffset", "strokeDasharray", "offset", "easing", "composite"]);

/** Drops any property the house rules forbid animating (width, height, filter, colour …). */
function sanitize(frames: Keyframe[]): Keyframe[] {
  return frames.map((f) => {
    const out: Keyframe = {};
    for (const [k, v] of Object.entries(f)) if (ALLOWED.has(k)) (out as Record<string, unknown>)[k] = v;
    return out;
  });
}

export function play(el: Element | null | undefined, keyframes: Keyframe[], opts: PlayOptions = {}): Promise<void> {
  if (!el || !isBrowser() || typeof (el as HTMLElement).animate !== "function") return Promise.resolve();
  const level = motionLevel();
  if (level === "still") return Promise.resolve();
  const { flourish, ...rest } = opts;
  let frames = sanitize(keyframes);
  let options: KeyframeAnimationOptions = { fill: "both", easing: EASE.out, ...rest };
  if (level === "calm") {
    if (flourish) return Promise.resolve();
    frames = frames.map((f) => {
      const g: Keyframe = { ...f };
      delete g.transform;
      delete g.strokeDashoffset;
      delete g.strokeDasharray;
      return g;
    });
    const duration = typeof rest.duration === "number" ? rest.duration : DUR.base;
    options = {
      ...options,
      duration: Math.min(duration, DUR.calmMax),
      delay: Math.min(typeof rest.delay === "number" ? rest.delay : 0, DUR.calmDelayMax),
    };
  }
  try {
    return el
      .animate(frames, options)
      .finished.then(() => undefined)
      .catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

// ─── fly: the Tier 0 token flight ───────────────────────────────────────────

export interface FlyOptions {
  /** "+4.2" */
  text: string;
  kind?: CurrencyKind;
}

function glyphSvg(kind: CurrencyKind): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "g");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#${GLYPH[kind]}`);
  svg.appendChild(use);
  return svg;
}

/**
 * The +N token and two trailing motes travel a quadratic curve from where it
 * was earned to its OWN ledger (xp → life-XP cell or MiniLedger; pts → the
 * session tally). Full only; otherwise a static floater appears under the
 * target and the promise resolves at once.
 */
export function fly(from: Element | null | undefined, to: Element | null | undefined, { text, kind = "xp" }: FlyOptions): Promise<void> {
  if (!isBrowser() || !to) return Promise.resolve();
  const level = motionLevel();
  if (level !== "full" || !from) {
    floater(to, text, kind);
    return Promise.resolve();
  }
  const layer = fx();
  if (!layer) return Promise.resolve();
  const [x0, y0] = center(from);
  const [x1, y1] = center(to);
  const cx = (x0 + x1) / 2 - 60;
  const cy = Math.min(y0, y1) - 50;
  const tok = TOKEN_COLOUR[kind];

  const launch = (node: HTMLElement, isToken: boolean, delay: number): Promise<void> => {
    node.style.setProperty("--tok", tok);
    layer.appendChild(node);
    const bw = node.offsetWidth || 6;
    const bh = node.offsetHeight || 6;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      const s = isToken ? 1 - 0.35 * t * t : 0.6 + 0.5 * Math.sin(Math.PI * t);
      frames.push({ transform: `translate(${x - bw / 2}px,${y - bh / 2}px) scale(${s})`, opacity: t > 0.9 ? 0.2 : 1 });
    }
    return node
      .animate(frames, { duration: DUR.flight, delay, easing: "cubic-bezier(.55,0,.25,1)", fill: "both" })
      .finished.catch(() => undefined)
      .then(() => node.remove());
  };

  const mote = () => {
    const m = document.createElement("div");
    m.className = "fx-mote";
    return m;
  };
  void launch(mote(), false, 70);
  void launch(mote(), false, 35);
  const token = document.createElement("div");
  token.className = "fx-token";
  token.appendChild(glyphSvg(kind));
  token.appendChild(document.createTextNode(text));
  return launch(token, true, 0);
}

/** The static stand-in for a flight under Calm and Still: "+4.2 life XP" under the target, 1.8 s. */
export function floater(near: Element | null | undefined, text: string, kind: CurrencyKind = "xp"): void {
  if (!isBrowser() || !near) return;
  const layer = fx();
  if (!layer) return;
  const r = near.getBoundingClientRect();
  const f = document.createElement("div");
  f.className = "fx-floater";
  f.style.setProperty("--tok", TOKEN_COLOUR[kind]);
  f.textContent = text;
  f.style.left = `${Math.max(8, Math.min(window.innerWidth - 120, r.left - 6))}px`;
  f.style.top = `${r.bottom + 6}px`;
  layer.appendChild(f);
  window.setTimeout(() => f.remove(), 1800);
}

// ─── burst ──────────────────────────────────────────────────────────────────

export interface BurstOptions {
  color?: string;
  spread?: number;
}

/** A seeded burst. Full only. T1 = 8, T2 = 14, T3 ≤ 26 (clamped). */
export function burst(x: number, y: number, n: number, seedId: string, { color = "var(--light)", spread = 60 }: BurstOptions = {}): void {
  if (!isBrowser() || motionLevel() !== "full") return;
  const layer = fx();
  if (!layer) return;
  const count = Math.max(0, Math.min(26, Math.round(n)));
  const r = seededRandom(seedId);
  for (let i = 0; i < count; i++) {
    const m = document.createElement("div");
    m.className = "fx-mote";
    m.style.setProperty("--tok", color);
    layer.appendChild(m);
    const a = (i / count) * Math.PI * 2 + r() * 0.5;
    const d = spread * (0.55 + r() * 0.6);
    const rot = Math.round(r() * 240 - 120);
    const scale = 0.7 + r() * 0.6;
    const dur = 700 + r() * 180;
    m.animate(
      [
        { transform: `translate(${x - 3}px,${y - 3}px) scale(.4) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x - 3 + Math.cos(a) * d}px,${y - 3 + Math.sin(a) * d}px) scale(${scale}) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: EASE.out, fill: "both" }
    )
      .finished.catch(() => undefined)
      .then(() => m.remove());
  }
}

// ─── Numbers ────────────────────────────────────────────────────────────────

/** en-GB grouping with fixed decimals: 1,346.0 · 4.2 */
export function formatFigure(value: number, dp = 1): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export interface CountOptions {
  dur?: number;
  dp?: number;
  format?: (v: number) => string;
}

/** Ticks the figure from the last-seen value to the new one. Still writes the final text at once. */
export function countTo(
  els: Element | null | undefined | (Element | null | undefined)[],
  fromLastSeen: number,
  to: number,
  { dur = DUR.slow, dp = 1, format }: CountOptions = {}
): void {
  const list = ([] as (Element | null | undefined)[]).concat(els).filter((e): e is Element => Boolean(e));
  const fmt = format ?? ((v: number) => formatFigure(v, dp));
  if (!isBrowser() || list.length === 0) return;
  const level = motionLevel();
  if (level === "still" || fromLastSeen === to) {
    for (const el of list) el.textContent = fmt(to);
    return;
  }
  const d = level === "calm" ? Math.min(dur, DUR.calmMax) : dur;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / d);
    const e = 1 - Math.pow(1 - p, 3);
    for (const el of list) el.textContent = fmt(fromLastSeen + (to - fromLastSeen) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Rolls a numeral old → new. Calm and Still swap the text in place. */
export function roll(el: HTMLElement | null | undefined, text: string): void {
  if (!el) return;
  if (!isBrowser() || motionLevel() !== "full" || typeof el.animate !== "function") {
    el.textContent = text;
    return;
  }
  el.animate(
    [
      { transform: "translateY(0)", opacity: 1 },
      { transform: "translateY(-60%)", opacity: 0, offset: 0.45 },
      { transform: "translateY(60%)", opacity: 0, offset: 0.5 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 480, easing: "ease-out" }
  );
  window.setTimeout(() => {
    el.textContent = text;
  }, 215);
}

/** The glyph bump after a count-up. Full only; transform only. */
export function bump(el: Element | null | undefined): void {
  if (!el || !isBrowser() || motionLevel() !== "full") return;
  void play(el, [{ transform: "scale(1)" }, { transform: "scale(1.3)", offset: 0.45 }, { transform: "scale(1)" }], {
    duration: 320,
    easing: EASE.stamp,
    fill: "none",
  });
}

/** True when the element is at least partly inside the viewport (a flight needs a visible target). */
export function inViewport(el: Element | null | undefined, margin = 0): boolean {
  if (!el || !isBrowser()) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  return r.bottom > margin && r.top < window.innerHeight - margin && r.right > 0 && r.left < window.innerWidth;
}
