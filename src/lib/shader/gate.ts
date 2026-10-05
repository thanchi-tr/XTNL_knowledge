/**
 * The shader gate (ui-motion.md §6.4). PURE: shaderMode(input) → 'css' |
 * 'loop' | 'hold', in the order of the spec's truth table. 'hold' applies only
 * to a slot that is already live (it keeps its context, draws nothing and runs
 * no rAF). shader-check walks the whole table.
 */
import { AMBIENT_ROUTES, FX, type ShaderProgram, type SlotKind } from "./params";

export type ShaderMode = "css" | "loop" | "hold";

export interface GateInput {
  level: "full" | "calm" | "still";
  osReducedMotion: boolean;
  contrastMore: boolean;
  forcedColors: boolean;
  /** true / false / null when not probed yet. */
  supported: boolean | null;
  /** false only once probed and missing (mediump-only); null when not probed. */
  highp: boolean | null;
  degraded: boolean;
  /** Inside [data-fx="none"] (the intake, the Start sheet, the Activities card). */
  noFx: boolean;
  saveData: boolean;
  deviceMemory: number | null;
  /** A compile or link failure switched this program off for the session. */
  programOff?: boolean;
  program: ShaderProgram;
  kind: SlotKind;
  route: string;
  power: boolean;
  hidden: boolean;
  inView: boolean;
  offscreenMs: number;
  /** This slot has a context. */
  live: boolean;
  /** Another slot on the page loops (a WAIT wins over AMBIENT; a second slot of the same licence waits). */
  otherLoopLive: boolean;
  measured: boolean;
  /** This program's session budget left before its ramp-out must start. */
  ambientLeftMs: number;
  stale: boolean;
  paused: boolean;
  runAgeMs: number;
  horizonAir: boolean;
}

/** The reason code beside the mode (the fx page and the debug hooks show it). */
export type GateWhy = "" | "level" | "contrast" | "static" | "device" | "other" | "ambient" | "wait" | "power" | "offscreen" | "away" | "held";

export function gate(i: GateInput): [ShaderMode, GateWhy] {
  if (i.level !== "full") return ["css", "level"];
  if (i.contrastMore || i.forcedColors) return ["css", "contrast"];
  if (i.kind === "static") return ["css", "static"];
  if (i.supported === false || i.highp === false || i.degraded || i.programOff || i.noFx || i.saveData || (i.deviceMemory !== null && i.deviceMemory <= 2)) return ["css", "device"];
  if (i.otherLoopLive) return ["css", "other"];
  if (i.kind === "ambient" && (!AMBIENT_ROUTES.includes(i.route) || i.osReducedMotion || !i.horizonAir || !i.measured || i.ambientLeftMs <= 0)) return ["css", "ambient"];
  if (i.kind === "wait" && (i.stale || i.paused || i.runAgeMs >= FX.waitMax)) return ["css", "wait"];
  if (i.power) return ["css", "power"];
  if (i.hidden || !i.inView) {
    if (!i.live) return ["css", "away"];
    return i.offscreenMs >= FX.offscreenMax ? ["css", "offscreen"] : ["hold", "held"];
  }
  return ["loop", ""];
}

export const shaderMode = (i: GateInput): ShaderMode => gate(i)[0];
