import { CATALOG } from "./catalog";
import { MONSTERS, statsAt } from "./bestiary";
import { clock, residents } from "./state";
import { alertRadius, center, idx, inBounds, isGuardPost, occupancy, wallHp } from "./world";
import { leverage } from "./frame";
import { aggroOf } from "./aggro";
import { MAP_H, MAP_W, Overlay, Terrain, type Channel, type GameState, type IncomingMonster, type RaidSide, type Structure } from "./types";

/**
 * Breach pathfinding (design §5.6). A cost field in seconds of risk-weighted
 * time: moving across the ground, breaking through walls at the group's
 * rate, standing in the towers' fire, and crossing ground where the land
 * remembers its dead. Targets are valued — sleepers, food, warmth, and for
 * siege beasts the leverage of a loaded post — and the one taken is the
 * best value over time to reach. Monsters follow the field downhill.
 */

const RISK: Record<Channel, number> = { K: 0.2, B: 0, Wr: 2.0, I: 0 };
const MEMORY = 5;

export interface Group { dps: number; hp: number; flying: boolean }

export function groupOf(party: IncomingMonster[]): Group {
  let dps = 0;
  let hp = 0;
  let flying = true;
  for (const p of party) {
    const def = MONSTERS[p.kind];
    const st = statsAt(def, p.level);
    dps += (st.dmg / def.interval) * p.count;
    hp += st.hp * p.count;
    if (!def.flying) flying = false;
  }
  return { dps: Math.max(1, dps), hp: Math.max(1, hp), flying };
}

/** Towers' fire, per tile: Σ dps of posts whose circle covers it. */
function threatMap(s: GameState, box: Box): Float32Array {
  const m = new Float32Array(box.w * box.h);
  for (const t of s.structures) {
    if (t.buildUntil || !(isGuardPost(t) || t.type === "townhall")) continue;
    const [cx, cy] = center(t);
    const R = t.type === "townhall" ? 6 : alertRadius(t);
    const dps = t.type === "townhall" ? (10 * t.level) / 1.2 : ((t.type === "armypoint" ? 18 : 14) * t.level) / 1.1;
    const guards = s.villagers.filter((v) => v.guard === t.id).length;
    const total = dps + guards * 10;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      if (x < box.x || y < box.y || x >= box.x + box.w || y >= box.y + box.h) continue;
      if (Math.hypot(x - cx, y - cy) > R) continue;
      m[(y - box.y) * box.w + (x - box.x)] += total;
    }
  }
  return m;
}

export interface Box { x: number; y: number; w: number; h: number }

/** The ground the fight can happen on: the town and forty tiles around it. */
export function fightBox(s: GameState, extra: [number, number][] = []): Box {
  let x0 = MAP_W, y0 = MAP_H, x1 = 0, y1 = 0;
  for (const st of s.structures) {
    x0 = Math.min(x0, st.x);
    y0 = Math.min(y0, st.y);
    x1 = Math.max(x1, st.x + st.w);
    y1 = Math.max(y1, st.y + st.h);
  }
  for (const [x, y] of extra) {
    x0 = Math.min(x0, Math.floor(x));
    y0 = Math.min(y0, Math.floor(y));
    x1 = Math.max(x1, Math.ceil(x));
    y1 = Math.max(y1, Math.ceil(y));
  }
  x0 = Math.max(0, x0 - 40);
  y0 = Math.max(0, y0 - 40);
  x1 = Math.min(MAP_W, x1 + 40);
  y1 = Math.min(MAP_H, y1 + 40);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface Field { box: Box; dist: Float64Array; target: number; flying: boolean }

/**
 * The cost of entering each tile of the box for this group: ground, walls to
 * break, the towers' fire and the land's dead. Built ones: the same for every
 * target, since a target's own footprint is where the search starts, at nothing.
 */
export function costField(s: GameState, g: Group, ch: Channel, box: Box): Float64Array {
  const occ = occupancy(s);
  const threat = threatMap(s, box);
  const deaths = aggroOf(s).deathMap;
  const risk = RISK[ch];
  const cost = (gx: number, gy: number): number => {
    const i = idx(gx, gy);
    const t = s.map.terrain[i];
    const o = s.map.overlay[i];
    if (g.flying) return 1;
    if (t === Terrain.Water) return Infinity;
    if (occ[i]) return Infinity;
    // Raiders take the road; they climb hills slowly and flounder in marsh.
    let c = t === Terrain.Pavement ? 0.8 : t === Terrain.Forest ? 2 : t === Terrain.Bank ? 1.2 : t === Terrain.Hill ? 1.6 : t === Terrain.Marsh ? 2.4 : 1;
    // A wall must be broken; a gate stands open to anything that walks up to it.
    if (o === Overlay.Wall) c += wallHp(s.map.meta[i]) / g.dps;
    else if (o === Overlay.Tree || o === Overlay.Rock) c += 1.5;
    c += (risk * threat[(gy - box.y) * box.w + (gx - box.x)]) / g.hp * 60;
    const dm = deaths[gy * 360 + gx];
    if (dm) c += MEMORY * dm;
    return c;
  };
  const costs = new Float64Array(box.w * box.h);
  for (let k = 0; k < costs.length; k++) costs[k] = cost(box.x + (k % box.w), box.y + Math.floor(k / box.w));
  return costs;
}

/**
 * Reverse Dijkstra from a target's footprint over the box: every tile's cost
 * to get there and start breaking it. Given `goals` (cells of the box), it
 * stops once each is settled — their values are final, the rest of the field
 * is not: for weighing targets, not for walking.
 */
export function flowField(s: GameState, target: Structure, g: Group, ch: Channel, box: Box = fightBox(s), costs = costField(s, g, ch, box), goals?: number[]): Field {
  const n = box.w * box.h;
  const dist = new Float64Array(n).fill(Infinity);
  // Binary heap of (dist, cell) in typed arrays; a cell may sit in it more than once (lazy deletion).
  let cap = 1 << 14;
  let heapD = new Float64Array(cap);
  let heapI = new Int32Array(cap);
  let size = 0;
  const push = (d: number, i: number) => {
    if (size === cap) {
      cap *= 2;
      const nd = new Float64Array(cap);
      nd.set(heapD);
      heapD = nd;
      const ni = new Int32Array(cap);
      ni.set(heapI);
      heapI = ni;
    }
    let k = size++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heapD[p] <= d) break;
      heapD[k] = heapD[p];
      heapI[k] = heapI[p];
      k = p;
    }
    heapD[k] = d;
    heapI[k] = i;
  };
  let popD = 0;
  const pop = (): number => {
    popD = heapD[0];
    const top = heapI[0];
    const ld = heapD[--size];
    const li = heapI[size];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      if (l >= size) break;
      const r = l + 1;
      const m = r < size && heapD[r] < heapD[l] ? r : l;
      if (heapD[m] >= ld) break;
      heapD[k] = heapD[m];
      heapI[k] = heapI[m];
      k = m;
    }
    heapD[k] = ld;
    heapI[k] = li;
    return top;
  };
  for (let y = target.y - 1; y <= target.y + target.h; y++) for (let x = target.x - 1; x <= target.x + target.w; x++) {
    if (x < box.x || y < box.y || x >= box.x + box.w || y >= box.y + box.h) continue;
    const k = (y - box.y) * box.w + (x - box.x);
    dist[k] = 0;
    push(0, k);
  }
  const waiting = goals ? new Set(goals) : null;
  const W = box.w;
  const H = box.h;
  while (size > 0) {
    const k = pop();
    const d = popD;
    if (d > dist[k]) continue;
    if (waiting?.delete(k) && !waiting.size) break;
    const x = k % W;
    const y = (k - x) / W;
    for (let q = 0; q < 8; q++) {
      const nx = x + DX[q];
      const ny = y + DY[q];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      const c = costs[nk];
      if (!Number.isFinite(c)) continue;
      const nd = d + c * STEP[q];
      if (nd < dist[nk]) {
        dist[nk] = nd;
        push(nd, nk);
      }
    }
  }
  return { box, dist, target: target.id, flying: g.flying };
}

/** The eight ways a monster steps, and how far each is: straight, then diagonal. */
const DX = Int8Array.of(1, -1, 0, 0, 1, 1, -1, -1);
const DY = Int8Array.of(0, 0, 1, -1, 1, -1, 1, -1);
const STEP = Float64Array.of(1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414);

export const fieldAt = (f: Field, x: number, y: number) => {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < f.box.x || gy < f.box.y || gx >= f.box.x + f.box.w || gy >= f.box.y + f.box.h) return Infinity;
  return f.dist[(gy - f.box.y) * f.box.w + (gx - f.box.x)];
};

/** The next point to walk to: the neighbouring tile lowest on the field. */
export function downhill(f: Field, x: number, y: number): [number, number] | null {
  const here = fieldAt(f, x, y);
  let best = here;
  let to: [number, number] | null = null;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const v = fieldAt(f, x + dx, y + dy);
    if (v < best) {
      best = v;
      to = [Math.floor(x + dx) + 0.5, Math.floor(y + dy) + 0.5];
    }
  }
  return to;
}

/** A target's value density (§5.6). */
export function targetValue(s: GameState, st: Structure, ch: Channel): number {
  if (st.buildUntil || ["lamppost", "brazier", "pitfire"].includes(st.type)) return 0;
  const night = clock(s.time).night;
  let V = 5;
  V += residents(s, st).length * 40 * (night ? 1 : 0.5);
  if (st.type === "storehouse" || st.type === "townhall") {
    const kcal = s.res.meals * 1100 + (["potato", "wheat", "barley", "corn", "bean", "rice", "fish", "meat"] as const).reduce((a, k) => a + s.res[k] * 1000, 0);
    const stores = s.structures.filter((x) => x.type === "storehouse" && !x.buildUntil).length;
    V += (kcal * 1e-4) / Math.max(1, stores + (st.type === "townhall" ? 1 : 0));
  }
  if (ch === "Wr" && st.zone) V += Math.max(0, st.zone.T) * 3;
  if (ch === "K") V *= 1 + leverage(s, st);
  return V;
}

const SIDES: RaidSide[] = ["east", "south", "north", "west"];

/** The open ground of the box in connected parts (eight ways, as monsters walk): 0 where nothing can stand. */
function groundParts(costs: Float64Array, box: Box): Int32Array {
  const part = new Int32Array(costs.length);
  const stack = new Int32Array(costs.length);
  let next = 0;
  for (let i = 0; i < costs.length; i++) {
    if (part[i] || !Number.isFinite(costs[i])) continue;
    part[i] = ++next;
    let top = 0;
    stack[top++] = i;
    while (top) {
      const k = stack[--top];
      const x = k % box.w;
      const y = (k - x) / box.w;
      for (let q = 0; q < 8; q++) {
        const nx = x + DX[q];
        const ny = y + DY[q];
        if (nx < 0 || ny < 0 || nx >= box.w || ny >= box.h) continue;
        const nk = ny * box.w + nx;
        if (part[nk] || !Number.isFinite(costs[nk])) continue;
        part[nk] = next;
        stack[top++] = nk;
      }
    }
  }
  return part;
}

/** The parts of open ground a search from this building starts in: its ring of seeds, and the ground beside them. */
function entryParts(part: Int32Array, box: Box, st: Structure): Set<number> {
  const out = new Set<number>();
  for (let y = st.y - 2; y <= st.y + st.h + 1; y++) for (let x = st.x - 2; x <= st.x + st.w + 1; x++) {
    if (x < box.x || y < box.y || x >= box.x + box.w || y >= box.y + box.h) continue;
    const p = part[(y - box.y) * box.w + (x - box.x)];
    if (p) out.add(p);
  }
  return out;
}

function sidePoint(side: RaidSide, st: Structure): [number, number] {
  const [cx, cy] = center(st);
  const d = 26;
  const [dx, dy] = side === "east" ? [1, 0] : side === "west" ? [-1, 0] : side === "north" ? [0, -1] : [0, 1];
  return [Math.max(1.5, Math.min(MAP_W - 1.5, cx + dx * d)), Math.max(1.5, Math.min(MAP_H - 1.5, cy + dy * d))];
}

/**
 * The wave's objective: of the eight most valuable buildings, the one with
 * the best value over time to reach and break into, from the best side.
 * Burrowers surface beside it — unless water rings it, when they must come
 * up on the far side of the moat.
 */
export function chooseTarget(s: GameState, ch: Channel, party: IncomingMonster[], r: () => number): {
  target?: Structure; side: RaidSide; origin?: [number, number]; label: string; warned?: boolean;
} {
  const g = groupOf(party);
  // Burrowers go for the stores; everyone else for whatever is worth most to them.
  const pool = ch === "B" ? s.structures.filter((st) => st.type === "storehouse" || st.type === "townhall" || st.type === "kitchen") : s.structures;
  const cands = pool.map((st) => ({ st, V: targetValue(s, st, ch) })).filter((c) => c.V > 0).sort((a, b) => b.V - a.V).slice(0, 8);
  if (!cands.length) return { side: SIDES[Math.floor(r() * 4)], label: "town" };
  let best = { U: -Infinity, st: cands[0].st, side: SIDES[0] as RaidSide };
  if (ch === "B") {
    // Underground, the only cost is distance; take the richest.
    best = { U: cands[0].V, st: cands[0].st, side: SIDES[Math.floor(r() * 4)] };
  } else {
    // One cost field for all eight, and each search only as far as the four sides it is asked about.
    const box = fightBox(s);
    const costs = costField(s, g, ch, box);
    const inBox = (x: number, y: number) => x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;
    const cell = (x: number, y: number) => (Math.floor(y) - box.y) * box.w + (Math.floor(x) - box.x);
    const ground = groundParts(costs, box);
    for (const c of cands) {
      const pts = SIDES.map((side) => sidePoint(side, c.st));
      // Only a side on the same open ground as the building can be reached: waiting on any other
      // (on a building, in water, walled off beyond it) would search the whole box for nothing.
      const reach = entryParts(ground, box, c.st);
      const goals = pts.filter(([x, y]) => inBox(Math.floor(x), Math.floor(y))).map(([x, y]) => cell(x, y)).filter((k) => reach.has(ground[k]));
      if (!goals.length) continue;
      const f = flowField(s, c.st, g, ch, box, costs, goals);
      for (const [i, side] of SIDES.entries()) {
        const [x, y] = pts[i];
        const T = fieldAt(f, x, y);
        if (!Number.isFinite(T)) continue;
        const U = c.V / (T + 10);
        if (U > best.U) best = { U, st: c.st, side };
      }
    }
  }
  const label = CATALOG[best.st.type].name.toLowerCase();
  if (ch !== "B") return { target: best.st, side: best.side, label };
  // Burrowers: surface at the building's side, or beyond the water ringing it.
  const [cx, cy] = center(best.st);
  const a = r() * Math.PI * 2;
  let origin: [number, number] = [cx + Math.cos(a) * (best.st.w / 2 + 1), cy + Math.sin(a) * (best.st.h / 2 + 1)];
  for (let d = 1; d <= 8; d++) {
    const x = Math.floor(cx + Math.cos(a) * (best.st.w / 2 + d));
    const y = Math.floor(cy + Math.sin(a) * (best.st.h / 2 + d));
    if (inBounds(x, y) && s.map.terrain[idx(x, y)] === Terrain.Water) {
      origin = [cx + Math.cos(a) * (best.st.w / 2 + d + 2), cy + Math.sin(a) * (best.st.h / 2 + d + 2)];
      break;
    }
  }
  origin = [Math.max(1, Math.min(MAP_W - 2, origin[0])), Math.max(1, Math.min(MAP_H - 2, origin[1]))];
  const warned = s.structures.some((t) => isGuardPost(t) && !t.buildUntil && Math.hypot(center(t)[0] - cx, center(t)[1] - cy) <= 12);
  return { target: best.st, side: best.side, origin, label, warned };
}
