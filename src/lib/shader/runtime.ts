/**
 * The shader runtime (ui-motion.md §6.2, §6.5): client only, reached ONLY through
 * `import("@/lib/shader/runtime")` from ShaderSlot after a quiet window (the
 * Next 16 "Loading External Libraries" pattern, so Turbopack splits it out of
 * every route's first-load JS). Nothing imports it statically.
 *
 *   mount(el, { program, params, kind }) → SlotHandle | null
 *   attach(el, spec) → { set, detach }      ShaderSlot's way in (the conductor)
 *   status() → { supported, live, running, degraded, countedLosses }
 *
 * This file is the browser host for engine.ts and the page wiring: one
 * IntersectionObserver and one ResizeObserver for every slot; the quiet-window
 * input listeners; 'load' and the first idle callback (the governor's start);
 * visibilitychange, pagehide and pageshow; one MutationObserver on <html> for
 * data-motion, data-power and data-theme; matchMedia `change` on
 * prefers-contrast, forced-colors and prefers-reduced-motion; and FX_EVENT
 * (WeavePause). Each re-gates. The listeners are wired while a slot is attached.
 *
 * Debug hooks (§6.8; dev, /dev/style, or window.__XTNL_SHD_FORCE):
 * window.__xtnlShader = { status(), running(), frames, probe(slot, points),
 * lose({ counted }), restore(), clock(ms) }.
 */
import { createEngine, type Host, type SlotHandle, type Attachment, type RuntimeStatus } from "./engine";
import { readEnv, sessionGet, sessionSet, type SlotSpec } from "./env";
import { FX, FX_EVENT, type ShaderVar } from "./params";

export type { SlotHandle, Attachment, RuntimeStatus, SlotSpec };

type ShdWindow = Window & { __XTNL_SHD_FORCE?: boolean; __xtnlShader?: unknown };

function browserHost(): Host & { onView: Map<Element, (v: boolean) => void>; onSize: Map<Element, () => void> } {
  const w = window as ShdWindow;
  const onView = new Map<Element, (v: boolean) => void>();
  const onSize = new Map<Element, () => void>();
  let io: IntersectionObserver | null = null;
  let ro: ResizeObserver | null = null;
  return {
    onView,
    onSize,
    now: () => performance.now(),
    wall: () => Date.now(),
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    timeout: (cb, ms) => window.setTimeout(cb, ms),
    clear: (id) => window.clearTimeout(id),
    idle: (cb) => (typeof w.requestIdleCallback === "function" ? w.requestIdleCallback(() => cb(), { timeout: FX.idle }) : window.setTimeout(cb, 0)),
    env: readEnv,
    get: sessionGet,
    set: sessionSet,
    canvas: () => document.createElement("canvas"),
    vars: (el) => {
      const cs = getComputedStyle(el);
      return (n: ShaderVar) => cs.getPropertyValue(n);
    },
    size: (el) => {
      const r = el.getBoundingClientRect();
      return [r.width, r.height];
    },
    dpr: () => window.devicePixelRatio || 1,
    view(el, cb) {
      io ??= new IntersectionObserver((es) => es.forEach((e) => onView.get(e.target)?.(e.intersectionRatio >= 0.5)), { threshold: [0, 0.5] });
      onView.set(el, cb);
      io.observe(el);
      return () => {
        onView.delete(el);
        io?.unobserve(el);
      };
    },
    resize(el, cb) {
      if (typeof ResizeObserver !== "function") return () => undefined;
      ro ??= new ResizeObserver((es) => es.forEach((e) => onSize.get(e.target)?.()));
      onSize.set(el, cb);
      ro.observe(el);
      return () => {
        onSize.delete(el);
        ro?.unobserve(el);
      };
    },
    root: document.documentElement,
    force: () => w.__XTNL_SHD_FORCE === true,
    loaded: () => document.readyState === "complete",
    active: (on) => wire(on),
  };
}

const INPUTS = ["scroll", "wheel", "pointerdown", "pointermove", "keydown", "touchstart"] as const;
const QUERIES = ["(prefers-contrast: more)", "(forced-colors: active)", "(prefers-reduced-motion: reduce)"];

const host = typeof window === "undefined" ? null : browserHost();
const engine = host ? createEngine(host) : null;

let wired = false;
let mo: MutationObserver | null = null;
const onInput = () => engine?.input();
const onRegate = () => engine?.regate();
const onPageHide = () => engine?.pagehide();
const onPageShow = (e: PageTransitionEvent) => {
  if (e.persisted) engine?.regate();
};
const onLoad = () => {
  const w = window as ShdWindow;
  const ready = () => engine?.ready();
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(ready);
  else window.setTimeout(ready, 200);
  engine?.regate();
};

function wire(on: boolean) {
  if (on === wired || !engine) return;
  wired = on;
  const ls = (t: EventTarget | null, ev: string, fn: EventListener, capture = false) => {
    if (!t) return;
    if (on) t.addEventListener(ev, fn, capture ? { capture, passive: true } : undefined);
    else t.removeEventListener(ev, fn, capture);
  };
  for (const t of INPUTS) ls(window, t, onInput, true);
  ls(window, FX_EVENT, onRegate);
  ls(window, "pagehide", onPageHide);
  ls(window, "pageshow", onPageShow as EventListener);
  ls(document, "visibilitychange", onRegate);
  for (const q of QUERIES) ls(typeof matchMedia === "function" ? matchMedia(q) : null, "change", onRegate);
  if (on) {
    mo = new MutationObserver(() => {
      engine.theme();
      engine.regate();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion", "data-power", "data-theme"] });
  } else {
    mo?.disconnect();
    mo = null;
  }
}

if (engine) {
  // The governor starts after 'load' and the first idle callback (hydration and the font swap don't count).
  if (document.readyState === "complete") onLoad();
  else window.addEventListener("load", onLoad, { once: true });
  const w = window as ShdWindow;
  if (process.env.NODE_ENV !== "production" || location.pathname.startsWith("/dev/style") || w.__XTNL_SHD_FORCE) {
    const d = engine.debug;
    w.__xtnlShader = {
      status: () => engine.status(),
      running: d.running,
      get frames() {
        return d.frames();
      },
      probe: d.probe,
      lose: d.lose,
      restore: d.restore,
      clock: (ms: number) => {
        d.clock(ms);
        engine.regate();
      },
    };
  }
}

const NO_STATUS: RuntimeStatus = { supported: null, highp: null, live: 0, running: [], degraded: false, countedLosses: 0 };

/** A context now for this slot, or null (unsupported, degraded, or another slot is live; a WAIT mount takes it from AMBIENT). */
export function mount(el: HTMLElement, spec: { program: SlotSpec["program"]; params: number[]; kind: SlotSpec["kind"] }): SlotHandle | null {
  return engine ? engine.mount(el, { measured: true, ...spec }) : null;
}

/** Gate and run this slot for as long as it is attached (ShaderSlot). */
export function attach(el: HTMLElement, spec: SlotSpec): Attachment {
  return engine ? engine.attach(el, spec) : { set: () => undefined, detach: () => undefined };
}

export function status(): RuntimeStatus {
  return engine ? engine.status() : NO_STATUS;
}

/** Re-gate every slot now. */
export function regate(): void {
  engine?.regate();
}
