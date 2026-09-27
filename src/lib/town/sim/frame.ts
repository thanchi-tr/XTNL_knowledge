import { CATALOG, grade } from "./catalog";
import { clock, log, residents } from "./state";
import { air, weatherOf, type Air } from "./weather";
import { TILE_M, envelope, isZone, materials, snowShape } from "./zones";
import { idx, inBounds, structureMaxHp } from "./world";
import { destroyStructure } from "./combat";
import { bodyOf, killBody } from "./body";
import { kmod } from "./knowledge";
import { Terrain, type Footing, type GameState, type Structure } from "./types";

/**
 * Structural integrity (design §5). A building stands on posts: one at every
 * tile along its walls, and an interior grid where the span passes six
 * metres. Each post carries its share of roof, snow, eave ice and upper
 * floors; each can carry only what its weakest link allows — the footing's
 * bearing on the soil, the pegged joint, the post itself — scaled by rot,
 * frost heave, thaw and repair. A post that fails throws its load onto its
 * neighbours with a dynamic kick; the cascade runs until it settles or the
 * building comes down.
 */

export interface FrameNode {
  /** Lattice position, in tiles from the building's corner. */
  i: number;
  j: number;
  corner: boolean;
  perimeter: boolean;
  /** Share of the roof it carries (sums to 1). */
  share: number;
  nb: number[];
}

const nodeMemo = new Map<string, FrameNode[]>();

/** The post lattice for a footprint. */
export function frameNodes(w: number, h: number): FrameNode[] {
  const key = `${w}x${h}`;
  const hit = nodeMemo.get(key);
  if (hit) return hit;
  const pts: FrameNode[] = [];
  const at = new Map<string, number>();
  const add = (i: number, j: number, perimeter: boolean) => {
    const k = `${i},${j}`;
    if (at.has(k)) return;
    at.set(k, pts.length);
    pts.push({ i, j, perimeter, corner: (i === 0 || i === w) && (j === 0 || j === h), share: 0, nb: [] });
  };
  for (let i = 0; i <= w; i++) {
    add(i, 0, true);
    add(i, h, true);
  }
  for (let j = 1; j < h; j++) {
    add(0, j, true);
    add(w, j, true);
  }
  if (w > 3 && h > 3) for (let i = 2; i < w; i += 2) for (let j = 2; j < h; j += 2) add(i, j, false);
  // Neighbours: the next post along a row or column (perimeter every tile, interior every two).
  for (const [a, p] of pts.entries()) {
    for (const [b, q] of pts.entries()) {
      if (a === b) continue;
      const di = Math.abs(p.i - q.i);
      const dj = Math.abs(p.j - q.j);
      if ((di === 0 && dj > 0 && dj <= 2) || (dj === 0 && di > 0 && di <= 2)) p.nb.push(b);
    }
  }
  // Shares: interior posts carry twice a wall post, corners three quarters.
  const wgt = pts.map((p) => (p.perimeter ? (p.corner ? 0.75 : 1) : 2));
  const tot = wgt.reduce((x, y) => x + y, 0);
  pts.forEach((p, k) => (p.share = wgt[k] / tot));
  nodeMemo.set(key, pts);
  return pts;
}

export const hasFrame = (st: Structure) => (isZone(st) || st.type === "watchtower") && !st.buildUntil;

/** Stone-walled buildings stand on strip footings; timber ones on padstones, unless the town dug deeper. */
export function footingOf(st: Structure): Footing {
  if (st.footing) return st.footing;
  const wall = materials(st).wall.id;
  return wall === "daub" || wall === "log" || wall === "turf" ? "pad" : "trench";
}
export const FOOTING: Record<Footing, { name: string; depth: number; area: number; cost: Partial<Record<string, number>> }> = {
  pad: { name: "Padstones", depth: 0.3, area: 0.2, cost: { stone: 2 } },
  trench: { name: "Trench footings", depth: 0.8, area: 1.0, cost: { stone: 10 } },
  deep: { name: "Deep stone footings", depth: 1.5, area: 1.5, cost: { stone: 25 } },
};

function frameOf(st: Structure): number[] {
  const n = frameNodes(st.w, st.h).length;
  if (!st.frame || st.frame.length !== n) st.frame = Array(n).fill(1);
  return st.frame;
}

/** Soil under a building: silt by the water, loam elsewhere. Returns frost susceptibility and dry bearing, kPa. */
function soilUnder(s: GameState, st: Structure): { susc: number; q: number } {
  let wet = 0;
  let n = 0;
  for (let y = st.y - 2; y < st.y + st.h + 2; y++) for (let x = st.x - 2; x < st.x + st.w + 2; x++) {
    if (!inBounds(x, y)) continue;
    n++;
    const t = s.map.terrain[idx(x, y)];
    if (t === Terrain.Water || t === Terrain.Bank || t === Terrain.Marsh) wet++;
  }
  const f = n ? wet / n : 0;
  return { susc: f > 0.1 ? 1.0 : 0.7, q: f > 0.1 ? 60 : 100 };
}

/** Thawing ground loses two thirds of its bearing (§5.4). */
export const thawing = (s: GameState) => s.time < weatherOf(s).thawUntil;

export interface FrameLoad {
  /** kN per post, capacity kN per post, utilisation. */
  load: number[];
  cap: number[];
  u: number[];
  q: number;
}

/** Loads and capacities of every post now (§5.2–5.3). */
export function frameLoads(s: GameState, st: Structure, a: Air = air(s)): FrameLoad {
  const nodes = frameNodes(st.w, st.h);
  const f = frameOf(st);
  const env = envelope(st);
  const roof = env.roof;
  const wet = (a.P > 0 && !a.snowing) || a.regime === "thaw";
  const dead = (wet ? roof.deadWet : roof.dead) + 0.3 + (env.storeys > 1 ? 2.0 : 0);
  const snow = (snowShape(roof.pitch) * (st.roofSnow ?? 0) * 9.81) / 1000;
  const q = dead + snow;
  const plan = st.w * st.h * TILE_M * TILE_M;
  const soil = soilUnder(s, st);
  const foot = FOOTING[footingOf(st)];
  const thaw = thawing(s) ? 0.35 : 1;
  const joint = grade(st.level) >= 1 ? 100 : 50;
  const post = env.wall.id === "daub" || env.wall.id === "log" || env.wall.id === "turf" ? 1200 : 3000;
  const eave = ((st.eaveIce ?? 0) * 9.81) / 1000;
  const perimCount = nodes.filter((p) => p.perimeter).length || 1;
  const cond = 0.5 + st.condition / 200;
  const load: number[] = [];
  const cap: number[] = [];
  const u: number[] = [];
  nodes.forEach((p, k) => {
    const L = q * plan * p.share + (p.perimeter ? (eave * plan) / perimCount : 0);
    const bearing = soil.q * foot.area * thaw;
    const C = Math.min(bearing, joint, post) * f[k] * (1 - 0.8 * (st.rot ?? 0)) * cond * (1 + kmod(s, "STUBBORNNESS"));
    load.push(L);
    cap.push(C);
    u.push(C > 0 ? L / C : Infinity);
  });
  return { load, cap, u, q };
}

/**
 * The cascade (§5.5): failed posts drop out, their load goes to intact
 * neighbours by stiffness with a 1.5× kick; a post with no neighbour left
 * brings its share of roof down. Deterministic order: worst utilisation
 * first, then lowest index.
 */
export function resolveFrame(s: GameState, st: Structure, a: Air = air(s)): { failed: number; collapsed: number } {
  if (!hasFrame(st)) return { failed: 0, collapsed: 0 };
  const nodes = frameNodes(st.w, st.h);
  const f = frameOf(st);
  const { load, cap } = frameLoads(s, st, a);
  const L = [...load];
  const down = f.map((x) => x <= 0);
  let fresh = 0;
  let roofDown = 0;
  let queue = nodes.map((_, k) => k).filter((k) => !down[k] && L[k] > cap[k]).sort((x, y) => L[y] / cap[y] - L[x] / cap[x] || x - y);
  let iter = 0;
  while (queue.length && iter++ < 4 * nodes.length) {
    const k = queue.shift()!;
    if (down[k]) continue;
    down[k] = true;
    f[k] = 0;
    fresh++;
    const nb = nodes[k].nb.filter((b) => !down[b]);
    if (!nb.length) roofDown += nodes[k].share;
    else for (const b of nb) L[b] += (1.5 * L[k]) / nb.length;
    queue = nodes.map((_, j) => j).filter((j) => !down[j] && L[j] > cap[j]).sort((x, y) => L[y] / cap[y] - L[x] / cap[x] || x - y);
  }
  // Any pre-existing failures with no intact neighbour also leave roof unsupported.
  const collapsed = Math.min(1, nodes.reduce((acc, p, k) => acc + (down[k] ? p.share : 0), 0) + roofDown * 0.5);
  if (fresh > 0) afterFailure(s, st, fresh, collapsed, a);
  return { failed: fresh, collapsed };
}

function afterFailure(s: GameState, st: Structure, fresh: number, collapsed: number, a: Air) {
  const name = CATALOG[st.type].name.toLowerCase();
  const max = structureMaxHp(st);
  st.hp = Math.min(st.hp, Math.max(1, Math.round(max * (1 - collapsed))));
  // Those inside when it went.
  const inside = s.villagers.filter((v) => v.body?.at === st.id);
  const q = frameLoads(s, st, a).q;
  let hurt = 0;
  for (const v of inside) {
    const rr = Math.abs(Math.sin(v.id * 12.9898 + s.time)) % 1;
    if (collapsed >= 0.3 && rr < 0.15 * (q / 2)) {
      killBody(s, v, `was crushed when the ${name} came down`);
      continue;
    }
    if (rr < 0.6 * collapsed + 0.1) {
      const b = bodyOf(v);
      b.bleed = Math.max(b.bleed, 0.03);
      v.health = Math.max(1, v.health - 40);
      hurt++;
    }
  }
  if (collapsed >= 0.6) {
    log(s, `The ${name} at ${st.x},${st.y} collapses: ${fresh} post${fresh === 1 ? "" : "s"} gave way and the roof came in.${hurt ? ` ${hurt} hurt.` : ""}`, "bad");
    destroyStructure(s, st);
  } else {
    log(s, `${fresh} post${fresh === 1 ? "" : "s"} of the ${name} at ${st.x},${st.y} gave way${collapsed > 0.05 ? `; ${Math.round(collapsed * 100)}% of the roof is down` : ""}.${hurt ? ` ${hurt} hurt.` : ""}`, "bad");
  }
}

/**
 * On the hour: snow lands on the roofs, slides off steep ones, melts off the
 * leaky ones (and refreezes at the eaves in hard frost); every frame is
 * checked.
 */
export function framesHourly(s: GameState) {
  const a = air(s);
  for (const st of [...s.structures]) {
    if (!hasFrame(st)) continue;
    const env = envelope(st);
    let snow = st.roofSnow ?? 0;
    if (a.snowing) snow += a.P;
    if (env.roof.pitch > 60) snow = 0;
    let melt = 0;
    if (a.T < 0) {
      const Tin = st.zone?.T ?? a.T;
      melt = (env.roof.U * Math.max(0, Tin) * 3600) / 334000;
    } else melt = 0.15 * a.T + (a.P > 0 && !a.snowing ? 0.5 * a.P : 0);
    melt = Math.min(snow, melt);
    snow -= melt;
    if (a.T < -3) st.eaveIce = (st.eaveIce ?? 0) + 0.5 * melt;
    else if (a.T > 0) st.eaveIce = Math.max(0, (st.eaveIce ?? 0) - 0.3 * a.T);
    st.roofSnow = Math.max(0, snow);
    if (s.structures.includes(st)) resolveFrame(s, st, a);
  }
}

/**
 * Once a day: frost heave works on shallow footings in frost-susceptible
 * ground (corners worst, heated interiors least); timber rots in the warm
 * and wet; failed posts are shored up from the wood store, damaged ones
 * repaired while the town keeps its spirits.
 */
export function framesDaily(s: GameState) {
  const w = weatherOf(s);
  const a = air(s);
  const c = clock(s.time);
  for (const st of s.structures) {
    if (!hasFrame(st)) continue;
    const f = frameOf(st);
    const nodes = frameNodes(st.w, st.h);
    const foot = FOOTING[footingOf(st)];
    const soil = soilUnder(s, st);
    if (c.season === "winter" && w.zf > foot.depth) {
      const heated = (st.zone?.T ?? a.T) > 5 ? 0.4 : 1;
      nodes.forEach((p, k) => {
        if (f[k] <= 0) return;
        f[k] = Math.max(0.05, f[k] - 0.004 * (w.zf - foot.depth) * soil.susc * (p.corner ? 1.5 : 1) * heated);
      });
    }
    const wall = materials(st).wall;
    if (a.T > 5 && wall.rot > 0) {
      const wetF = a.P > 0 || soil.susc > 0.9 ? 1 : 0.3;
      const protect = footingOf(st) === "pad" ? 0.2 : 0.1;
      st.rot = Math.min(1, (st.rot ?? 0) + 0.02 * Math.min(1, (a.T - 5) / 15) * wetF * wall.rot * protect * 0.1);
    }
    // Repairs.
    for (let k = 0; k < f.length; k++) {
      if (f[k] <= 0) {
        if (s.res.wood >= 2) {
          s.res.wood -= 2;
          f[k] = 0.6;
        }
      } else if (s.mood >= 50) f[k] = Math.min(1, f[k] + 0.02);
    }
  }
}

/** The worst post's utilisation: how near the building is to giving way. */
export function frameUtil(s: GameState, st: Structure): number {
  if (!hasFrame(st)) return 0;
  const { u } = frameLoads(s, st);
  return Math.max(0, ...u.filter((x) => Number.isFinite(x)));
}

/**
 * A siege beast's blow on a building (§2.5): it goes for the post nearest
 * where it stands, and the frame is checked at once.
 */
export function strikeFrame(s: GameState, st: Structure, x: number, y: number, dmg: number) {
  if (!hasFrame(st)) return;
  const nodes = frameNodes(st.w, st.h);
  const f = frameOf(st);
  let best = 0;
  let bd = Infinity;
  nodes.forEach((p, k) => {
    if (f[k] <= 0) return;
    const d = Math.hypot(st.x + p.i - x, st.y + p.j - y);
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  const perPost = structureMaxHp(st) / nodes.length;
  f[best] = Math.max(0, f[best] - dmg / (perPost * 2));
  resolveFrame(s, st);
}

/** Leverage: how much comes down if its weakest post goes (§5.6), as a share of the building. */
export function leverage(s: GameState, st: Structure): number {
  if (!hasFrame(st)) return 0;
  const util = frameUtil(s, st);
  return Math.min(1, util) * (residents(s, st).length > 0 ? 1.5 : 1);
}
