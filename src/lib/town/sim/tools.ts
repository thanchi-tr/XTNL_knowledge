import { log } from "./state";
import { rng } from "./world";
import { kmod } from "./knowledge";
import type { GameState, Tool, ToolMat } from "./types";

/**
 * Tools (design §3.6). Each tool in the kit has an edge and a fatigue life.
 * An hour's work dulls the edge by the target's hardness over the tool's,
 * to the 2.2; fatigue builds with the target's density and, below the
 * metal's ductile-to-brittle transition, up to five times faster — bog iron
 * is cold-short at −5 °C. Failure is a Weibull draw on accumulated damage.
 * A dull edge is honed automatically, at the cost of metal; a tool worn to
 * 60% of its mass is spent.
 */

export interface MatDef { name: string; H: number; K: number; dbt: number | null }
export const TOOL_MATS: Record<ToolMat, MatDef> = {
  flint: { name: "Flint", H: 700, K: 0.1, dbt: null },
  bronze: { name: "Bronze", H: 150, K: 0.8, dbt: -99 },
  bog: { name: "Bog iron", H: 120, K: 0.6, dbt: -5 },
  wrought: { name: "Wrought iron", H: 110, K: 0.9, dbt: -25 },
  steel: { name: "Carburised steel", H: 400, K: 0.7, dbt: -15 },
  crucible: { name: "Crucible steel", H: 500, K: 0.8, dbt: -30 },
};

export type Target = "softwood" | "oak" | "loam" | "clay" | "limestone" | "granite" | "bogore" | "coal" | "ice";
export const TARGETS: Record<Target, { H: number; rho: number }> = {
  softwood: { H: 30, rho: 450 },
  oak: { H: 55, rho: 750 },
  loam: { H: 20, rho: 1500 },
  clay: { H: 40, rho: 1800 },
  limestone: { H: 200, rho: 2600 },
  granite: { H: 800, rho: 2700 },
  bogore: { H: 250, rho: 3000 },
  coal: { H: 80, rho: 1350 },
  ice: { H: 40, rho: 917 },
};
const FROZEN: Partial<Record<Target, [number, number]>> = {
  softwood: [1.5, 1.1], oak: [1.5, 1.1], loam: [4, 1], clay: [4, 1], bogore: [1.2, 1],
};

const K_W = 0.004;
const D0 = 0.0025;
const BETA = 4;

/** Brings the kit into line with the tool count in the stores. New tools are wrought iron unless made otherwise. */
export function syncTools(s: GameState) {
  const kit = (s.toolkit ??= []);
  const want = Math.max(0, Math.floor(s.res.tools + 1e-6));
  while (kit.length < want) {
    const mat = s.toolsPending?.shift() ?? "wrought";
    s.nextToolId = (s.nextToolId ?? 0) + 1;
    kit.push({ id: s.nextToolId, mat, s: 1, D: 0, m: 1 });
  }
  while (kit.length > want) {
    // Spent in other ways (earthworks, trade): the worst go first.
    kit.sort((a, b) => a.m - a.D - (b.m - b.D));
    kit.shift();
  }
}

/**
 * One worker-hour on a target with the best free tool. Returns the output
 * multiplier: the edge's √sharpness, or 0.5 with bare hands and a stick.
 */
export function workTool(s: GameState, target: Target, T: number, intensity: number, used: Set<number>, onInjury?: () => void): number {
  syncTools(s);
  const kit = s.toolkit!;
  const free = kit.filter((t) => !used.has(t.id)).sort((a, b) => b.s * (1 - b.D) - a.s * (1 - a.D));
  const tool = free[0];
  if (!tool) return 0.5;
  used.add(tool.id);
  const mat = TOOL_MATS[tool.mat];
  const tg = TARGETS[target];
  const fr = T < -5 ? FROZEN[target] ?? [1, 1] : [1, 1];
  const H = tg.H * fr[0];
  const rho = tg.rho * fr[1];
  // Craftsmanship (Reason ideas): edges hold, metal lasts.
  const care = 1 - kmod(s, "REASON");
  tool.s = Math.max(0, tool.s - K_W * Math.pow(H / mat.H, 2.2) * intensity * care);
  const cold = mat.dbt === null ? 3 : 1 + 4 * Math.max(0, Math.min(1, (mat.dbt - T) / 15));
  const dD = D0 * Math.pow(rho / 450, 1.5) * (1 / mat.K) * cold * intensity * care;
  const pFail = 1 - Math.exp(-(Math.pow(tool.D + dD, BETA) - Math.pow(tool.D, BETA)));
  tool.D += dD;
  const r = rng(Math.floor(s.time) * 41 + tool.id * 7);
  const eff = Math.sqrt(Math.max(0.05, tool.s));
  if (r() < pFail) {
    s.toolkit = kit.filter((t) => t !== tool);
    s.res.tools = s.toolkit.length;
    s.res.iron += 1;
    if (r() < 0.08) onInjury?.();
    log(s, `A ${mat.name.toLowerCase()} tool breaks on ${target}${T < (mat.dbt ?? 99) ? " in the cold" : ""}.`, "bad");
    return eff;
  }
  // Hone a dull edge: a quarter hour, and a little metal.
  if (tool.s < 0.5) {
    tool.s = 1;
    tool.m -= 0.015;
    if (tool.m < 0.6) {
      s.toolkit = kit.filter((t) => t !== tool);
      s.res.tools = s.toolkit.length;
      s.res.iron += 1;
      log(s, `A ${mat.name.toLowerCase()} tool is ground down to nothing and goes for scrap.`, "info");
    }
    return eff * 0.75;
  }
  return eff;
}

export const kitSummary = (s: GameState): { mat: ToolMat; n: number; s: number; D: number }[] => {
  const by = new Map<ToolMat, Tool[]>();
  for (const t of s.toolkit ?? []) by.set(t.mat, [...(by.get(t.mat) ?? []), t]);
  return [...by].map(([mat, ts]) => ({ mat, n: ts.length, s: ts.reduce((a, t) => a + t.s, 0) / ts.length, D: ts.reduce((a, t) => a + t.D, 0) / ts.length }));
};
