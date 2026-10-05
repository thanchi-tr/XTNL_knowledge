/**
 * Glyph motion (ui-motion.md §4.7, §5). Every named motion with its licence,
 * through the frozen gateway (src/lib/motion.ts: play, burst). Imports only
 * motion.ts and celebrate's announce. No element.animate here.
 *
 *   playGlyph(el, motion, { licence, accent?, seed?, name?, … }) → Promise<void>
 *       No licence, or the wrong one, throws in development (H1). Never moves a safe.* or
 *       sess.* glyph, nor anything inside [data-safety] (an InfoTip there opens instantly).
 *   sequence({ run, order })        the per-page chain: one flourish chain at a time (H13)
 *   sequenceAtMount(labels)         more than 6 SEEN events pending at mount → none plays, one
 *                                   SINCE_LINE names them (≤ 3 items, then "+ n more")
 *   GLYPH_DUR, MOTION_LICENCE, CHAIN_ORDER, sinceParts, subscribeSince, currentSince
 *
 * Rules held here:
 *   - Every chain is created in one call: each part's play() is issued at once with its own delay
 *     and fill: 'backwards' (H12); nothing awaits a previous part.
 *   - Still: nothing (play() returns at once); rank-rise still announces.
 *   - Calm: a part whose keyframes carry no opacity is skipped (play() strips transform and dashes,
 *     caps 260 ms / 200 ms delay, and skips flourishes).
 *   - `accent`: the element was ≥ 50% in view at hydration (D30): a stamp over the final state,
 *     never a keyframe that hides, zeroes or un-draws a part (H15).
 *   - Estimates, Gemini-sourced, unverified, best-case and stated figures never animate as values:
 *     date-moved and pay-swap are crossfades only (H3).
 */
import { announce as celebrateAnnounce } from "./celebrate";
import { DUR, EASE, burst as gatewayBurst, center, motionLevel, play, type PlayOptions } from "./motion";

// ─── Licences and tokens ────────────────────────────────────────────────────

export type Licence = "ACT" | "SEEN" | "CHANGED" | "WAIT" | "AMBIENT" | "STATIC";
export const LICENCES: readonly Licence[] = ["ACT", "SEEN", "CHANGED", "WAIT", "AMBIENT", "STATIC"];

export type GlyphMotion =
  | "build"
  | "reach"
  | "start"
  | "rank-rise"
  | "quest-done"
  | "step-done"
  | "pv-confirm"
  | "verdict-change"
  | "ladder"
  | "bars"
  | "date-moved"
  | "pay-swap"
  | "unlock"
  | "meter-fill"
  | "horizon-front"
  | "seal-reached"
  | "tip-open"
  | "kindle";

/** Each motion's one licence (§4.7). playGlyph refuses any other. */
export const MOTION_LICENCE: Readonly<Record<GlyphMotion, Licence>> = {
  build: "SEEN",
  reach: "SEEN",
  start: "ACT",
  "rank-rise": "SEEN",
  "quest-done": "SEEN",
  "step-done": "ACT",
  "pv-confirm": "ACT",
  "verdict-change": "ACT",
  ladder: "ACT",
  bars: "ACT",
  "date-moved": "CHANGED",
  "pay-swap": "ACT",
  unlock: "ACT",
  "meter-fill": "SEEN",
  "horizon-front": "SEEN",
  "seal-reached": "SEEN",
  "tip-open": "ACT",
  kindle: "SEEN",
};
export const GLYPH_MOTIONS = Object.keys(MOTION_LICENCE) as GlyphMotion[];

/** §5.4, built from the frozen DUR / EASE. */
export const GLYPH_DUR = {
  draw: DUR.slow,
  drawStep: 20,
  stoneStep: 60,
  ringIn: 240,
  check: 220,
  checkDelay: 40,
  stamp: 380,
  centre: 320,
  rim: 360,
  notch: 200,
  notchStep: 24,
  fill: 700,
  ping: 900,
  swap: DUR.quick,
  kindle: 420,
  flicker: 260,
  breathe: 1200,
  breatheIterations: 74,
  ramp: 400,
  chainMax: 1600,
  waitMax: 90_000,
  ambientMax: 5_000,
} as const;

/** Chain motions queue one at a time per page (H13); a lower order plays first (reach before rank-rise). */
export const CHAIN_ORDER: Readonly<Partial<Record<GlyphMotion, number>>> = { reach: 1, build: 1, "rank-rise": 2, "seal-reached": 3 };
/** More SEEN events than this pending at mount: none plays (H13). */
export const SINCE_MAX = 6;

// ─── Test seams (the checks swap announce and burst for recorders) ──────────

const hooks = { announce: celebrateAnnounce, burst: gatewayBurst };
export function __setGlyphMotionHooks(h: Partial<typeof hooks>): () => void {
  const prev = { ...hooks };
  Object.assign(hooks, h);
  return () => {
    Object.assign(hooks, prev);
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type El = Element;
const all = (root: ParentNode, sel: string): El[] => Array.from(root.querySelectorAll(sel));
const one = (root: ParentNode, sel: string): El | null => root.querySelector(sel);
const iOf = (e: El): number => Number(e.getAttribute("data-i") ?? 0);
const byI = (a: El, b: El) => iOf(a) - iOf(b);
const later = (ms: number, fn?: () => void): Promise<void> =>
  new Promise((resolve) =>
    setTimeout(() => {
      fn?.();
      resolve();
    }, ms)
  );

/** A draw: dashoffset 100 → 0 on a pathLength=100 path (calm strips it). */
function DRAW(from: Keyframe = {}, to: Keyframe = {}): Keyframe[] {
  return [
    { strokeDasharray: "100 100", strokeDashoffset: 100, ...from },
    { strokeDasharray: "100 100", strokeDashoffset: 0, ...to },
  ];
}

/** One part through the gateway: fill 'backwards' by default; under calm a part with no opacity is skipped. */
function go(el: El | null | undefined, frames: Keyframe[], opts: PlayOptions = {}): Promise<void> {
  if (!el) return Promise.resolve();
  const level = motionLevel();
  if (level === "still") return Promise.resolve();
  if (level === "calm" && !frames.some((f) => "opacity" in f)) return Promise.resolve();
  return play(el, frames, { fill: "backwards", ...opts });
}

const done = (ps: Promise<void>[]): Promise<void> => Promise.all(ps).then(() => undefined);

export function isSafetySurface(el: El | null | undefined): boolean {
  if (!el) return false;
  const g = el.getAttribute?.("data-g");
  if (g && /^(safe|sess)\.|^m\.(quote|verbatim|policy|judge|nopay|clash)$/.test(g)) return true;
  return Boolean(el.closest?.("[data-safety]"));
}

// ─── Options ────────────────────────────────────────────────────────────────

export interface PlayGlyphOptions {
  licence: Licence;
  /** In view at hydration (D30): play the accent over the final state, never a redraw from zero. */
  accent?: boolean;
  /** The burst seed (rank-rise: `aimrank:${roadmapId}:${index}`). */
  seed?: string;
  /** The rank name for rank-rise's one announce ("Aim rank Journeyman reached"). */
  name?: string;
  /** meter-fill: the last-seen measured value (0..1) and the current one. */
  from?: number;
  to?: number;
  /** horizon-front: the walked dash share from → to (0..100) and the front dot's 8 offsets (px) to its resting place. */
  walk?: [number, number];
  front?: [number, number][];
  /** pv-confirm: the old glyph that fades out, and the label whose new word fades in. */
  fromEl?: El | null;
  labelEl?: El | null;
  /** date-moved / pay-swap: the new text, swapped into `.mg-dm-t` (or the element) at mid-fade. */
  text?: string;
  /** A start delay for a part of a larger chain. */
  delay?: number;
  /** quest-done on /today: the check draw only (D10). */
  today?: boolean;
}

type MotionFn = (el: El, o: PlayGlyphOptions) => Promise<void>;

// ─── The motions ────────────────────────────────────────────────────────────

const MOTIONS: Readonly<Record<GlyphMotion, MotionFn>> = {
  /** SEEN · the stage became current or held: stones draw bottom-up (240 each, 60 ms apart), then the solid layer. */
  build(svg, o) {
    const stones = all(svg, '[data-part="mark"]').sort(byI);
    const d0 = o.delay ?? 0;
    if (o.accent) {
      return go(stones[stones.length - 1], [{ transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 240, easing: EASE.stamp, delay: d0 });
    }
    const ps = stones.map((s, i) => go(s, DRAW({ opacity: 0.35 }, { opacity: 1 }), { duration: 240, delay: d0 + i * GLYPH_DUR.stoneStep }));
    const solid = one(svg, '[data-part="solid"]');
    if (solid) {
      const lastEnd = (stones.length - 1) * GLYPH_DUR.stoneStep + 240;
      ps.push(go(solid, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: d0 + Math.max(0, lastEnd - 160) }));
    }
    return done(ps);
  },

  /** SEEN · the counted reach count rose: segment 420 → node stamp 380 (from 300) → build (from 560). Never a pending reach. */
  reach(row, o) {
    const node = row.matches?.(".mg-rr-node") ? row : one(row, ".mg-rr-node");
    if (o.accent) return go(node, [{ transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: GLYPH_DUR.stamp, easing: EASE.stamp });
    const ps: Promise<void>[] = [];
    // the segment into this node: the previous row's down line (300), then this row's short up line (120)
    const n = row.getAttribute("data-n");
    const down = n != null ? (row.closest?.(".mg-rr")?.querySelector(`[data-rr-to="${n}"]`) ?? null) : null;
    const up = one(row, '[data-rr-seg="in"]');
    if (down) ps.push(go(down, DRAW(), { duration: 300 }));
    if (up) ps.push(go(up, DRAW(), { duration: 120, delay: down ? 300 : 0 }));
    ps.push(go(node, [{ transform: "scale(.55)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: GLYPH_DUR.stamp, delay: 300, easing: EASE.stamp }));
    const inner = node ? one(node, ".mg-rr-in") : null;
    if (inner) ps.push(MOTIONS.build(inner, { ...o, delay: 560 }));
    return done(ps);
  },

  /** ACT · Start milestone: the here-ring stamps in, then one ping (flourish). No stroke sweep; the arc stays at the measured 0%. */
  start(node) {
    const ring = one(node, '[data-part="ring"]');
    const ping = one(node, '[data-part="ping"]');
    return done([
      go(ring, [{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "scale(1)" }], { duration: GLYPH_DUR.ringIn, easing: EASE.stamp }),
      go(ping, [{ opacity: 0.5, transform: "scale(.7)" }, { opacity: 0, transform: "scale(1.5)" }], { duration: GLYPH_DUR.ping, delay: GLYPH_DUR.ringIn, flourish: true }),
    ]);
  },

  /** SEEN, its own event after reach: rim 360 → notches pop (from 300) → centre stamp (from 560) → burst of 8 + one announce. */
  "rank-rise"(seal, o) {
    const svg = seal.matches?.("svg") ? seal : one(seal, "svg.mg-rank");
    const say = () => {
      if (o.name) hooks.announce(`Aim rank ${o.name} reached`);
    };
    const level = motionLevel();
    if (!svg || level === "still") {
      say();
      return Promise.resolve();
    }
    if (level === "calm") {
      say();
      return go(svg, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
    }
    const centre = one(svg, '[data-part="solid"]');
    const seed = o.seed ?? `aimrank:${seal.getAttribute("data-rank") ?? "0"}`;
    const doBurst = () => {
      const [x, y] = center(svg);
      hooks.burst(x, y, 8, seed, { color: "var(--ink-1)", spread: 40 });
    };
    if (o.accent) {
      go(centre, [{ transform: "scale(1.6)" }, { transform: "scale(1)" }], { duration: GLYPH_DUR.centre, easing: EASE.stamp });
      return later(200, () => {
        doBurst();
        say();
      });
    }
    go(one(svg, '[data-part="rim"]'), DRAW(), { duration: GLYPH_DUR.rim, flourish: true });
    go(one(svg, '[data-part="mark"]'), [{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }], { duration: GLYPH_DUR.notch, delay: 300, easing: EASE.stamp, flourish: true });
    go(centre, [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1)" }], { duration: GLYPH_DUR.centre, delay: 560, easing: EASE.stamp });
    const pips = all(seal, ".mg-rs-pip[data-on]");
    const last = pips[pips.length - 1];
    if (last) go(last, [{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 240, delay: 640, easing: EASE.stamp });
    return later(880, () => {
      doBurst();
      say();
    });
  },

  /** SEEN · the measured count reached N: solid 160 + the badge check draws (220, +40); the step's dot hops to the top tread. No particles. */
  "quest-done"(kg, o) {
    const svg = one(kg, "svg.mg-quest");
    const ok = one(kg, ".mg-kg-ok");
    const okPath = ok ? one(ok, "path") : null;
    if (o.accent) return go(ok, [{ transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 240, easing: EASE.stamp });
    const today = o.today || Boolean(kg.closest?.('[data-route="/today"]'));
    const ps: Promise<void>[] = [];
    if (!today && svg) {
      if (kg.getAttribute("data-kg") === "step") {
        ps.push(go(one(svg, ".mg-dot"), [{ transform: "translate(-5.5px,5px)" }, { transform: "translate(0,0)" }], { duration: 320, easing: EASE.stamp }));
      } else {
        for (const s of all(svg, '[data-part="solid"]')) ps.push(go(s, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 }));
        for (const k of all(svg, ".mg-k")) ps.push(go(k, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 }));
      }
    }
    ps.push(go(ok, [{ opacity: 0 }, { opacity: 1 }], { duration: 80, delay: GLYPH_DUR.checkDelay }));
    ps.push(go(okPath, DRAW(), { duration: GLYPH_DUR.check, delay: GLYPH_DUR.checkDelay + 40 }));
    return done(ps);
  },

  /** ACT · Mark done on a step or practice: the check draws (220). No burst: a self-tick is never louder than a tested quest. */
  "step-done"(tick) {
    const p = tick.matches?.("path") ? tick : one(tick, "path");
    return go(p, DRAW(), { duration: GLYPH_DUR.check, delay: GLYPH_DUR.checkDelay });
  },

  /** ACT · I checked this / Keep: the balloon fades out while a solid rim draws; the check draws; the word fades in. */
  "pv-confirm"(svg, o) {
    const ps: Promise<void>[] = [];
    if (o.fromEl) ps.push(go(o.fromEl, [{ opacity: 1 }, { opacity: 0 }], { duration: GLYPH_DUR.swap, fill: "none" }));
    ps.push(go(one(svg, '[data-part="rim"]'), DRAW({ opacity: 0 }, { opacity: 1 }), { duration: 240 }));
    ps.push(go(one(svg, '[data-part="mark"]'), DRAW(), { duration: GLYPH_DUR.check, delay: 200 }));
    if (o.labelEl) ps.push(go(o.labelEl, [{ opacity: 0 }, { opacity: 1 }], { duration: GLYPH_DUR.swap }));
    return done(ps);
  },

  /** ACT · a pick changed the chosen verdict. v.unv never moves (H3). */
  "verdict-change"(svg) {
    const v = svg.getAttribute("data-g");
    const mark = one(svg, '[data-part="mark"]');
    switch (v) {
      case "v.fits":
        return go(mark, DRAW({ opacity: 0 }, { opacity: 1 }), { duration: 220 });
      case "v.tight":
        return go(one(svg, '[data-part="solid"]'), [{ transform: "scaleX(0)", opacity: 0.4 }, { transform: "scaleX(1)", opacity: 1 }], { duration: 240 });
      case "v.over":
        return done([
          go(one(svg, '[data-part="rim"]'), DRAW({ opacity: 0.4 }, { opacity: 1 }), { duration: 240 }),
          go(mark, [{ transform: "scale(1.8)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 160, delay: 240, easing: EASE.stamp }),
          go(one(svg, '[data-part="badge"]'), [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 240 }),
        ]);
      case "v.imp":
        return go(mark, DRAW({ opacity: 0 }, { opacity: 1 }), { duration: 160 });
      case "v.fitted": {
        const k = all(svg, '[data-part="mark"]').sort(byI);
        return done([
          go(k[0], [{ transform: "translateX(-3px)", opacity: 0.5 }, { transform: "translateX(0)", opacity: 1 }], { duration: 240, easing: EASE.inout }),
          go(k[1], [{ transform: "translateX(3px)", opacity: 0.5 }, { transform: "translateX(0)", opacity: 1 }], { duration: 240, easing: EASE.inout }),
        ]);
      }
      default:
        return Promise.resolve();
    }
  },

  /** ACT · a depth pick: the rungs light up to the chosen one (20 ms per rung, 420 in all); the gap bar draws. */
  ladder(el) {
    const rungs = all(el, ".mg-sl-r[data-on]");
    const ps = rungs.map((r, i) => go(r, [{ opacity: 0.25 }, { opacity: 1 }], { duration: 160, delay: Math.min(i * GLYPH_DUR.drawStep, 260) }));
    ps.push(go(one(el, ".mg-sl-gap line"), DRAW(), { duration: 240, delay: Math.min(420, rungs.length * GLYPH_DUR.drawStep) }));
    return done(ps);
  },

  /** ACT · an intensity pick: the bars grow (160, 40 ms apart). */
  bars(svg) {
    return done(all(svg, '[data-part="mark"]').sort(byI).map((b, i) => go(b, [{ transform: "scaleY(0)", opacity: 0.3 }, { transform: "scaleY(1)", opacity: 1 }], { duration: 160, delay: i * 40 })));
  },

  /** CHANGED · an estimate moved: a crossfade of the marker and its text. No draw, no roll, no direction. */
  "date-moved"(el, o) {
    if (o.text != null && motionLevel() !== "still") {
      const t = one(el, ".mg-dm-t") ?? el;
      setTimeout(() => {
        t.textContent = o.text!;
      }, GLYPH_DUR.swap);
    } else if (o.text != null) (one(el, ".mg-dm-t") ?? el).textContent = o.text;
    return go(el, [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: 2 * GLYPH_DUR.swap, fill: "none" });
  },

  /** ACT · a Start-sheet switch changed the stated pay: a plain crossfade (a stated rate is not money earned). */
  "pay-swap"(el, o) {
    if (o.text != null) {
      if (motionLevel() === "still") el.textContent = o.text;
      else setTimeout(() => (el.textContent = o.text!), GLYPH_DUR.swap / 2);
    }
    return go(el, [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: GLYPH_DUR.swap, fill: "none" });
  },

  /** ACT · I checked this on a Start-sheet row: the shackle lifts −2.5 and turns −12° (its resting CSS is open: Glyph `open`). */
  unlock(svg) {
    return go(one(svg, ".mg-shackle"), [{ transform: "translateY(0) rotate(0deg)", opacity: 0.6 }, { transform: "translateY(-2.5px) rotate(-12deg)", opacity: 1 }], { duration: 240, easing: EASE.stamp });
  },

  /** SEEN · a meter from the last-seen measured value to now, either direction (D9). Never from 0, no overshoot. */
  "meter-fill"(el, o) {
    if (o.from == null || o.to == null || o.from === o.to) return Promise.resolve();
    const bar = el.matches?.("i") ? el : (one(el, "i") ?? el);
    return go(bar, [{ transform: `scaleX(${o.from})` }, { transform: `scaleX(${o.to})` }], { duration: GLYPH_DUR.fill });
  },

  /** SEEN · the horizon's walked path and front dot (SVG marks), from the last-seen % to now, either direction. */
  "horizon-front"(band, o) {
    if (!o.walk || !o.front || o.walk[0] === o.walk[1]) return Promise.resolve();
    const walk = one(band, ".shd-walk");
    const dot = one(band, ".shd-front");
    const ps: Promise<void>[] = [];
    if (walk && !walk.classList.contains("shd-dots")) ps.push(go(walk, [{ strokeDasharray: `${o.walk[0]} 100` }, { strokeDasharray: `${o.walk[1]} 100` }], { duration: GLYPH_DUR.fill }));
    if (dot) ps.push(go(dot, o.front.map(([x, y]) => ({ transform: `translate(${x}px,${y}px)` })), { duration: GLYPH_DUR.fill }));
    return done(ps);
  },

  /** SEEN · a counted done reach, new since last seen: the stamp on [m.seal]. Never on a closed-unreached aim. */
  "seal-reached"(svg, o) {
    if (o.accent) return go(svg, [{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: GLYPH_DUR.stamp, easing: EASE.stamp });
    return go(svg, [{ transform: "scale(1.7) rotate(-7deg)", opacity: 0 }, { transform: "scale(1) rotate(0deg)", opacity: 1 }], { duration: GLYPH_DUR.stamp, easing: EASE.stamp });
  },

  /** ACT · an InfoTip or chip opens: the panel's opacity 0 → 1 (160). Instant on a safety surface (playGlyph never reaches here there). */
  "tip-open"(panel) {
    return go(panel, [{ opacity: 0 }, { opacity: 1 }], { duration: GLYPH_DUR.swap });
  },

  /** SEEN (phase 3) · the streak rose: scaleY .55 → 1 from the bottom, then the core flickers twice. */
  kindle(svg, o) {
    const core = one(svg, ".mg-core");
    const flicker = go(core, [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 2 * GLYPH_DUR.flicker, delay: o.accent ? 0 : GLYPH_DUR.kindle, fill: "none" });
    if (o.accent) return flicker;
    return done([go(svg, [{ transform: "scaleY(.55)" }, { transform: "scaleY(1)" }], { duration: GLYPH_DUR.kindle, easing: EASE.stamp }), flicker]);
  },
};

// ─── playGlyph ──────────────────────────────────────────────────────────────

function licenceError(msg: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") throw new Error(msg);
  return Promise.resolve();
}

/** Plays one named motion on an element, under its licence (H1). */
export function playGlyph(el: El | null | undefined, motion: GlyphMotion, opts: PlayGlyphOptions): Promise<void> {
  if (!opts || !opts.licence) return licenceError(`playGlyph("${motion}") needs a licence (ui-motion.md H1)`);
  const want = MOTION_LICENCE[motion];
  if (!want) return licenceError(`playGlyph: unknown motion "${motion}"`);
  if (opts.licence !== want) return licenceError(`playGlyph("${motion}") runs under ${want}, not ${opts.licence}`);
  if (!el || isSafetySurface(el)) return Promise.resolve();
  return MOTIONS[motion](el, opts);
}

// ─── sequence(): one flourish chain per page at a time (H13) ────────────────

export interface ChainEvent {
  run: () => Promise<void> | void;
  /** Lower plays first (CHAIN_ORDER: reach and build 1, rank-rise 2, seal 3). */
  order?: number;
}

const queue: ChainEvent[] = [];
let running = false;
let scheduled = false;

function nextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn());
  else setTimeout(fn, 16);
}

function drain(): void {
  if (running) return;
  queue.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const ev = queue.shift();
  if (!ev) return;
  running = true;
  const capped = Promise.race([Promise.resolve().then(ev.run), later(GLYPH_DUR.chainMax)]);
  void capped
    .catch(() => undefined)
    .then(() => {
      running = false;
      setTimeout(drain, 60);
    });
}

/** Queues one chain event; events collected in the same frame play in CHAIN_ORDER, one at a time, each ≤ 1.6 s. */
export function sequence(ev: ChainEvent): void {
  queue.push(ev);
  if (running || scheduled) return;
  scheduled = true;
  nextFrame(() => {
    scheduled = false;
    drain();
  });
}

/** The queue's state, for the checks. */
export function sequenceState(): { pending: number; running: boolean } {
  return { pending: queue.length, running };
}

// ─── SINCE_LINE (H13) ───────────────────────────────────────────────────────

export interface SinceLine {
  /** ≤ 3 named items. */
  items: string[];
  /** How many more ("+ n more"). */
  more: number;
  /** The rest, for the (i). */
  rest: string[];
  /** "Since you last looked: milestone 2 reached · date moved to 7 Mar + 4 more". */
  text: string;
}

export const SINCE_LEAD = "Since you last looked:";

export function sinceParts(labels: readonly string[]): SinceLine {
  const items = labels.slice(0, 3);
  const rest = labels.slice(3);
  return { items, more: rest.length, rest, text: `${SINCE_LEAD} ${items.join(" · ")}${rest.length ? ` + ${rest.length} more` : ""}` };
}

let since: SinceLine | null = null;
const sinceSubs = new Set<() => void>();

export function currentSince(): SinceLine | null {
  return since;
}
export function subscribeSince(fn: () => void): () => void {
  sinceSubs.add(fn);
  return () => {
    sinceSubs.delete(fn);
  };
}

/**
 * The SEEN events pending when a page mounts (after a long absence): more
 * than SINCE_MAX → none plays, every one jumps to its end state, and one
 * static SINCE_LINE names them. Returns the line, or null to play normally.
 */
export function sequenceAtMount(labels: readonly string[]): SinceLine | null {
  if (labels.length <= SINCE_MAX) return null;
  since = sinceParts(labels);
  for (const fn of sinceSubs) fn();
  return since;
}

/** Clears the since line (a new page, or the checks). */
export function clearSince(): void {
  since = null;
  for (const fn of sinceSubs) fn();
}
