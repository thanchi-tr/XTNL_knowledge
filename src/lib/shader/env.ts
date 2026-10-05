/**
 * What the page says right now, for the shader gate (ui-motion.md §6.4). Small
 * and first-load safe: ShaderSlot's pre-gate reads it before the runtime is
 * ever fetched, and the runtime's browser host reads it after. Every read is
 * guarded, so importing this on the server is safe (it is never called there).
 */
import { motionLevel } from "@/lib/motion";
import { AMBIENT_KEY, FX, HORIZON_AIR, WAIT_PAUSED_KEY, type ShaderProgram, type SlotKind } from "./params";
import { gate, type GateInput, type ShaderMode } from "./gate";

export interface Env {
  level: "full" | "calm" | "still";
  reduce: boolean;
  contrast: boolean;
  forced: boolean;
  power: boolean;
  saveData: boolean;
  deviceMemory: number | null;
  route: string;
  hidden: boolean;
}

const mq = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;

export function readEnv(): Env {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  return {
    level: motionLevel(),
    reduce: mq("(prefers-reduced-motion: reduce)"),
    contrast: mq("(prefers-contrast: more)"),
    forced: mq("(forced-colors: active)"),
    power: document.documentElement.dataset.power === "save",
    saveData: nav.connection?.saveData === true,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    route: location.pathname.replace(/\/+$/, "") || "/",
    hidden: document.visibilityState === "hidden",
  };
}

export function sessionGet(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

export function sessionSet(k: string, v: string): void {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* private mode: the budget then lasts this page only */
  }
}

/** The AMBIENT budget this program has spent this session (ms). */
export const ambientUsed = (p: ShaderProgram) => Number(sessionGet(AMBIENT_KEY(p))) || 0;

/** The WAIT pause: on the card (WeavePause's data-paused) or for the whole session. */
export const waitPaused = (card: Element | { hasAttribute(n: string): boolean } | null) => !!card?.hasAttribute("data-paused") || sessionGet(WAIT_PAUSED_KEY) === "1";

export interface SlotSpec {
  program: ShaderProgram;
  kind: Exclude<SlotKind, "static">;
  /** Plain numbers from params.ts (the seed first). */
  params: number[];
  /** The horizon has a measured value (always true for the weave). */
  measured: boolean;
  /** WAIT: the run went stale or timed out. */
  stale?: boolean;
  /** WAIT: when the run started (epoch ms), so a remount never restarts its 90 s. */
  startedAt?: number;
}

/** The gate's input from the page and the slot, with the runtime's own facts passed in (unknown before it loads). */
export function gateInputOf(
  e: Env,
  el: Element | { closest(s: string): unknown },
  spec: SlotSpec,
  rt: Pick<GateInput, "supported" | "highp" | "degraded" | "programOff" | "inView" | "offscreenMs" | "live" | "otherLoopLive" | "runAgeMs">,
  usedMs: number,
  paused: boolean
): GateInput {
  // /dev/style/fx only: data-fx-sim="contrast hold" (a token list).
  const sim = ((el.closest("[data-fx-sim]") as Element | null)?.getAttribute("data-fx-sim") ?? "").split(" ");
  return {
    ...rt,
    level: e.level,
    osReducedMotion: e.reduce,
    contrastMore: e.contrast || sim.includes("contrast"),
    forcedColors: e.forced,
    noFx: !!el.closest('[data-fx="none"]'),
    saveData: e.saveData,
    deviceMemory: e.deviceMemory,
    program: spec.program,
    kind: spec.kind,
    route: e.route,
    power: e.power,
    hidden: e.hidden,
    measured: spec.measured,
    ambientLeftMs: FX.ambientMax - FX.ramp - usedMs,
    stale: !!spec.stale,
    paused,
    horizonAir: HORIZON_AIR,
  };
}

/** Before the runtime loads: would this slot loop if it were in view and the page quiet? */
export function preGate(el: Element, spec: SlotSpec): ShaderMode {
  const unknown = { supported: null, highp: null, degraded: false, inView: true, offscreenMs: 0, live: false, otherLoopLive: false, runAgeMs: spec.startedAt ? Date.now() - spec.startedAt : 0 };
  return gate(gateInputOf(readEnv(), el, spec, unknown, ambientUsed(spec.program), spec.kind === "wait" && waitPaused(el.closest("[data-wait]"))))[0];
}
