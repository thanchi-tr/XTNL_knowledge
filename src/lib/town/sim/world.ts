import { ARMY_PER_POINT, CATALOG, KNIGHT_TITLES, STORE_PER_LEVEL, grade, knightTitle, type Cost } from "./catalog";
import { MATURE, SEEDLING, SPROUT, TILE_WOOD, YOUNG, treeMeta } from "./woods";
import { inSight } from "./vision";
import {
  MAP_H, MAP_W, MILITARY, Overlay, RAW_FOODS, Terrain,
  type GameState, type MapState, type ResourceKey, type Resources, type Season, type Structure, type StructureType,
} from "./types";

/**
 * The map: generation, occupancy, placement rules, pavement connectivity and
 * pathfinding. Everything spatial the engine asks is answered here.
 */

// ── Seeded randomness ─────────────────────────────────────

/** Deterministic noise in [0, 1) for a tile. */
export function tileHash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const idx = (x: number, y: number) => y * MAP_W + x;
export const tx = (i: number) => i % MAP_W;
export const ty = (i: number) => Math.floor(i / MAP_W);
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

/** The river's centre column at a row. */
export const riverCenter = (y: number) => 11 + Math.round(Math.sin(y / 9) * 3 + Math.sin(y / 4.3));

/** Rock kinds, by meta value. Low-tier minted resources, as the brief asks. */
export const ROCK_KINDS = ["stone", "coal", "iron", "silver"] as const;

export function generateMap(seed: number): MapState {
  const r = rng(seed);
  const n = MAP_W * MAP_H;
  const terrain = new Array<number>(n).fill(Terrain.Grass);
  const overlay = new Array<number>(n).fill(Overlay.None);
  const meta = new Array<number>(n).fill(0);

  // River down the west side, with sandy banks.
  for (let y = 0; y < MAP_H; y++) {
    const c = riverCenter(y);
    const half = 2 + (Math.sin(y / 13) > 0.3 ? 1 : 0);
    for (let x = c - half - 1; x <= c + half + 1; x++) {
      if (!inBounds(x, y)) continue;
      terrain[idx(x, y)] = Math.abs(x - c) <= half ? Terrain.Water : Terrain.Bank;
    }
  }

  // Forest: noisy blobs across the land, bigger the further from where the
  // town is founded — the deep country is wooded and dark. Each blob only
  // visits its own box, so a map many times larger still generates quickly.
  const home: [number, number] = [37, 26];
  const nBlobs = Math.round((MAP_W * MAP_H) / 600);
  for (let i = 0; i < nBlobs; i++) {
    const bx = 18 + r() * (MAP_W - 18);
    const by = r() * MAP_H;
    const far = Math.min(1, dist(home, [bx, by]) / 160);
    if (dist(home, [bx, by]) < 22) continue; // leave the founding ground open
    const br = 4 + r() * 5 + far * 7;
    for (let y = Math.floor(by - br - 2); y <= Math.ceil(by + br + 2); y++) {
      for (let x = Math.floor(bx - br - 2); x <= Math.ceil(bx + br + 2); x++) {
        if (!inBounds(x, y)) continue;
        const i2 = idx(x, y);
        if (terrain[i2] !== Terrain.Grass) continue;
        if (Math.hypot(x - bx, (y - by) * 1.2) < br + (tileHash(x, y, seed % 997) - 0.5) * 2) {
          terrain[i2] = Terrain.Forest;
          meta[i2] = TILE_WOOD; // a full stand
        }
      }
    }
  }

  // Ponds: still water on open ground, ringed with a sandy bank.
  const nPonds = Math.round((MAP_W * MAP_H) / 2000);
  for (let i = 0; i < nPonds; i++) {
    const px0 = 24 + r() * (MAP_W - 30);
    const py0 = 4 + r() * (MAP_H - 8);
    const rx = 1.8 + r() * 3;
    const ry = 1.4 + r() * 2.4;
    if (dist(home, [px0, py0]) < 16) continue;
    for (let y = Math.floor(py0 - ry - 2); y <= Math.ceil(py0 + ry + 2); y++) {
      for (let x = Math.floor(px0 - rx - 2); x <= Math.ceil(px0 + rx + 2); x++) {
        if (!inBounds(x, y)) continue;
        const i2 = idx(x, y);
        if (terrain[i2] === Terrain.Water) continue;
        const d = ((x - px0) / rx) ** 2 + ((y - py0) / ry) ** 2;
        const rag = (tileHash(x, y, 71) - 0.5) * 0.5;
        if (d <= 1 + rag) terrain[i2] = Terrain.Water;
        else if (d <= 1.9 + rag) terrain[i2] = Terrain.Bank;
        else continue;
        meta[i2] = 0;
      }
    }
  }

  // Scattered trees and rocks on open grass.
  for (let i = 0; i < n; i++) {
    if (terrain[i] !== Terrain.Grass) continue;
    const v = r();
    if (v < 0.05) {
      overlay[i] = Overlay.Tree;
      const age = r();
      meta[i] = treeMeta(Math.floor(r() * 8), age < 0.6 ? MATURE : age < 0.85 ? YOUNG : age < 0.95 ? SEEDLING : SPROUT);
    } else if (v < 0.062) {
      overlay[i] = Overlay.Rock;
      const k = r();
      meta[i] = k < 0.55 ? 0 : k < 0.82 ? 1 : k < 0.96 ? 2 : 3;
    }
  }
  return { w: MAP_W, h: MAP_H, terrain, overlay, meta };
}

/** Clears trees and rocks in a rectangle — for the starting settlement only. */
export function clearArea(map: MapState, x0: number, y0: number, w: number, h: number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!inBounds(x, y)) continue;
    const i = idx(x, y);
    if (map.terrain[i] === Terrain.Forest) map.terrain[i] = Terrain.Grass;
    if (map.overlay[i] === Overlay.Tree || map.overlay[i] === Overlay.Rock) map.overlay[i] = Overlay.None;
  }
}

// ── Occupancy ─────────────────────────────────────────────

/** Tile → structure id (0 = free). Rebuilt on demand; structures change rarely. */
export function occupancy(s: GameState): Int32Array {
  const occ = new Int32Array(MAP_W * MAP_H);
  for (const st of s.structures) {
    for (let y = st.y; y < st.y + st.h; y++) for (let x = st.x; x < st.x + st.w; x++) {
      if (inBounds(x, y)) occ[idx(x, y)] = st.id;
    }
  }
  return occ;
}

/** Tiles touching a footprint from outside (4-neighbourhood). */
export function ringOf(x0: number, y0: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let x = x0; x < x0 + w; x++) {
    if (inBounds(x, y0 - 1)) out.push(idx(x, y0 - 1));
    if (inBounds(x, y0 + h)) out.push(idx(x, y0 + h));
  }
  for (let y = y0; y < y0 + h; y++) {
    if (inBounds(x0 - 1, y)) out.push(idx(x0 - 1, y));
    if (inBounds(x0 + w, y)) out.push(idx(x0 + w, y));
  }
  return out;
}

export const center = (st: { x: number; y: number; w: number; h: number }): [number, number] => [st.x + st.w / 2, st.y + st.h / 2];
export const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ── Costs ─────────────────────────────────────────────────

export function canAfford(res: Resources, cost: Cost): boolean {
  return Object.entries(cost).every(([k, v]) => (res[k as keyof Resources] ?? 0) >= (v as number));
}

export function pay(res: Resources, cost: Cost) {
  for (const [k, v] of Object.entries(cost)) res[k as keyof Resources] -= v as number;
}

export function costText(cost: Cost): string {
  return Object.entries(cost).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${v} ${k}`).join(" · ") || "free";
}

// ── Placement ─────────────────────────────────────────────

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
  /** Per-tile validity, for the ghost overlay. */
  bad: number[];
}

/**
 * Whether a building can go here. The rules from the brief, in order:
 * every tile must be open grass — no tree, no rock, no debris left from a
 * demolition, no water, no forest, no pavement, nothing already built — and
 * river or forest buildings must actually touch the river or the forest.
 */
export function checkPlacement(s: GameState, type: StructureType, x: number, y: number, occ = occupancy(s)): PlacementCheck {
  const def = CATALOG[type];
  const bad: number[] = [];
  let reason: string | undefined;
  for (let yy = y; yy < y + def.h; yy++) {
    for (let xx = x; xx < x + def.w; xx++) {
      if (!inBounds(xx, yy)) {
        reason ??= "Off the map.";
        continue;
      }
      const i = idx(xx, yy);
      const t = s.map.terrain[i];
      const o = s.map.overlay[i];
      let why: string | undefined;
      if (occ[i]) why = "Something is already built here.";
      else if (t === Terrain.Water) why = "Cannot build on water.";
      else if (t === Terrain.Forest) why = "Forest must be left standing — build a lumber camp beside it.";
      else if (t === Terrain.Pavement) why = "Buildings go on grass, not pavement.";
      else if (o === Overlay.Tree) why = "A tree is in the way — clear it first.";
      else if (o === Overlay.Rock) why = "A rock is in the way — clear it first.";
      else if (o === Overlay.Debris) why = "Rubble must be cleared before anything is built here.";
      else if (o === Overlay.Wall || o === Overlay.Gate) why = "A wall stands here.";
      else if (o === Overlay.Lair) why = "Something old stands here. Nothing is built on it.";
      if (why) {
        bad.push(i);
        reason ??= why;
      }
    }
  }
  const ring = ringOf(x, y, def.w, def.h);
  if (!reason && def.needsRiver && !ring.some((i) => s.map.terrain[i] === Terrain.Water || s.map.terrain[i] === Terrain.Bank && ringOf(tx(i), ty(i), 1, 1).some((j) => s.map.terrain[j] === Terrain.Water))) {
    reason = `A ${def.name.toLowerCase()} must be placed next to the river.`;
  }
  if (!reason && def.needsForest && !ring.some((i) => s.map.terrain[i] === Terrain.Forest)) {
    reason = "A lumber camp must be placed next to forest.";
  }
  if (!reason && def.unique && s.structures.some((st) => st.type === type)) reason = `Only one ${def.name.toLowerCase()} is allowed.`;
  if (!reason && def.requires && !s.villagers.some((v) => v.role === def.requires!.role)) reason = def.requires.reason;
  if (!reason && (type === "house" || type === "school")) {
    const hall = s.structures.find((st) => st.type === "townhall");
    if (hall && hallDistance(s, { x, y, w: def.w, h: def.h }) > hallRadius(hall.level)) {
      reason = `Homes and schools must stand within the town hall's reach (${hallRadius(hall.level)} tiles at level ${hall.level}) — raise the hall to reach further.`;
    }
  }
  if (!reason && type === "armypoint") {
    const { allowed, troops, captains } = armyPointsAllowed(s);
    const have = s.structures.filter((st) => st.type === "armypoint").length;
    if (have >= allowed) {
      reason = `Each army point needs ${ARMY_PER_POINT} troops and a knight to lead it: the town has ${troops} troops and ${captains} knight${captains === 1 ? "" : "s"}, enough for ${allowed}${have ? `, and has ${have}` : ""}.`;
    }
  }
  // Last, so every other reason is given first: nobody builds blind.
  if (!reason && !inSight(s, x, y, def.w, def.h)) reason = "Nobody can see there — push the fog back with a fire, a lamp or the hall's reach first.";
  return { ok: !reason, reason, bad };
}

/** Whether a single tile can take pavement, a wall or a gate. */
export function checkTile(s: GameState, i: number, kind: "pavement" | "wall" | "gate", occ = occupancy(s)): string | null {
  const t = s.map.terrain[i];
  const o = s.map.overlay[i];
  if (occ[i]) return "A building stands here.";
  if (t === Terrain.Water || t === Terrain.Forest) return "Only on open ground.";
  if (o === Overlay.Lair) return "Something old stands here.";
  if (!inSight(s, i % MAP_W, Math.floor(i / MAP_W))) return "Nobody can see there — light it first.";
  if (o === Overlay.Tree || o === Overlay.Rock || o === Overlay.Debris) return "Clear this tile first.";
  if (kind === "pavement" && t === Terrain.Pavement) return "Already paved.";
  if (kind === "wall" && (o === Overlay.Wall || t === Terrain.Pavement)) return o === Overlay.Wall ? "Already walled." : "Put a gate across a road, not a wall.";
  if (kind === "gate" && o === Overlay.Gate) return "Already a gate.";
  return null;
}

// ── Connectivity ──────────────────────────────────────────

/** Pavement component per tile (-1 = not pavement). Gates are pavement too. */
export function pavementComponents(map: MapState): Int32Array {
  const comp = new Int32Array(MAP_W * MAP_H).fill(-1);
  let next = 0;
  const q: number[] = [];
  for (let i = 0; i < comp.length; i++) {
    if (map.terrain[i] !== Terrain.Pavement || comp[i] !== -1) continue;
    comp[i] = next;
    q.length = 0;
    q.push(i);
    while (q.length) {
      const c = q.pop()!;
      const x = tx(c);
      const y = ty(c);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inBounds(nx, ny)) continue;
        const j = idx(nx, ny);
        if (comp[j] === -1 && map.terrain[j] === Terrain.Pavement) {
          comp[j] = next;
          q.push(j);
        }
      }
    }
    next++;
  }
  return comp;
}

export interface Links {
  comp: Int32Array;
  /** Components each structure touches. */
  of: Map<number, Set<number>>;
}

export function computeLinks(s: GameState): Links {
  const comp = pavementComponents(s.map);
  const of = new Map<number, Set<number>>();
  for (const st of s.structures) {
    const set = new Set<number>();
    for (const i of ringOf(st.x, st.y, st.w, st.h)) if (comp[i] >= 0) set.add(comp[i]);
    of.set(st.id, set);
  }
  return { comp, of };
}

export function linked(links: Links, a: number, b: number): boolean {
  const A = links.of.get(a);
  const B = links.of.get(b);
  if (!A || !B) return false;
  for (const c of A) if (B.has(c)) return true;
  return false;
}

export const MILITARY_TYPES: StructureType[] = ["barracks", "archery", "armoury", "wizardhut", "nobleyard", "armyschool"];

/** Troops a watchtower can have posted to it. */
export const guardSlots = (level: number, type: StructureType = "watchtower") => (type === "armypoint" ? 10 + 5 * level : 2 + 2 * level);

/**
 * How near a monster must come, in tiles from the centre, before a post
 * calls out its guards: a watchtower sees further as it rises; the hall's
 * militia rise only when the hall itself is threatened.
 */
export function alertRadius(st: Structure): number {
  if (st.type === "townhall") return 10;
  return Math.floor((st.type === "armypoint" ? 10 : 8) + 2 * reachLevel(st.level));
}

/**
 * The outer circle of a watchtower or army point: its guards come out for a
 * monster in the inner circle whatever it is doing, and for one out here
 * only when it attacks something — a building, or the wall.
 */
export function passiveRadius(st: Structure): number {
  return st.type === "townhall" ? 10 : Math.round(alertRadius(st) * 1.8);
}

/** A farm's harvest reaches the granary only if it shares pavement with a market. */
export function farmReachesMarket(s: GameState, links: Links, farm: Structure): boolean {
  return s.structures.some((m) => m.type === "market" && !m.buildUntil && linked(links, farm.id, m.id));
}

/** Troops from a barracks count only if it shares pavement with a watchtower. */
export function barracksCounted(s: GameState, links: Links, b: Structure): boolean {
  return s.structures.some((t) => t.type === "watchtower" && !t.buildUntil && linked(links, b.id, t.id));
}

/** A house can send recruits to a barracks it shares pavement with. */
export function houseReachesBarracks(links: Links, house: Structure, barracks: Structure): boolean {
  return linked(links, house.id, barracks.id);
}

// ── Reach: irrigation and warmth ──────────────────────────

export const IRRIGATION_RANGE = 14;

/**
 * Irrigation for a farm: full from a watermill in range at least as high a
 * level; half from a lower-level one ("must be upgraded alongside the farm");
 * a quarter, rain-fed, with none. Water farms get nothing without one, unless
 * they sit on the river itself.
 */
export function irrigation(s: GameState, farm: Structure): number {
  const c = center(farm);
  let best = 0;
  for (const m of s.structures) {
    if (m.type !== "watermill" || m.buildUntil) continue;
    if (dist(center(m), c) > IRRIGATION_RANGE) continue;
    best = Math.max(best, m.level >= farm.level ? 1 : 0.5);
  }
  if (best > 0) return best;
  if (farm.type === "waterfarm") {
    return ringOf(farm.x, farm.y, farm.w, farm.h).some((i) => s.map.terrain[i] === Terrain.Water) ? 0.6 : 0;
  }
  return 0.25;
}

/** Past level 10 a level counts for half, so a level-30 building is great, not absurd. */
export const reachLevel = (level: number) => Math.min(level, 10) + Math.max(0, level - 10) / 2;

export function warmthRange(level: number) {
  return Math.floor(6 + reachLevel(level) * 2);
}

/** A building's full hit points: by level, and half again at each tenth. */
export function structureMaxHp(st: { type: StructureType; level: number }): number {
  return Math.round(CATALOG[st.type].hpPerLevel * st.level * (1 + 0.5 * grade(st.level)));
}

/** A home: a house (at any of its tiers) or an apartment. */
export const isHome = (st: { type: StructureType }) => st.type === "house" || st.type === "apartment";

// ── Walls ─────────────────────────────────────────────────

/*
 * A wall or gate tile keeps its level and its hit points together in the
 * tile's meta: level × 10000 + hit points. Walls from before levels read as
 * level 1.
 */
export const WALL_MAX_LEVEL = 30;
export const wallLevel = (meta: number) => Math.max(1, Math.floor(meta / 10000));
export const wallHp = (meta: number) => (meta >= 10000 ? meta % 10000 : meta);
export const wallMaxHp = (level: number, gate = false) => (gate ? 80 : 60) + (gate ? 60 : 50) * (level - 1) + (gate ? 120 : 100) * grade(level);
export const wallMeta = (level: number, hp: number) => level * 10000 + Math.max(0, Math.min(9999, Math.round(hp)));
/** Stone and more to raise one tile of wall a level. */
export function wallUpgradeCost(level: number): Cost {
  const c: Cost = { stone: 4 + 2 * level };
  if (level >= 5) c.bricks = Math.ceil(level / 3);
  if (level >= 15) c.ingots = Math.ceil((level - 10) / 5);
  if (level + 1 === 10) c.gold = 1;
  if (level + 1 === 20) c.platinum = 1;
  if (level + 1 === 30) c.diamond = 1;
  return c;
}

// ── Warmth ────────────────────────────────────────────────

/**
 * A fuelled pit fire's warmth, cast as rays.
 *
 * The fire throws RAYS rays out from its centre. In the open each reaches
 * the fire's radius, and together they make the circle. A wall or a gate
 * stops a ray where it stands, so whatever lies behind a wall stays cold —
 * and the heat the wall stopped is thrown back: the rays still open reach
 * further, until the ground warmed is as much as the open circle would have
 * warmed (never past twice the radius). A fire walled in on every side
 * warms its whole yard, right up to the wall, and nothing beyond it.
 *
 * Only a pit fire warms: lampposts and braziers light the dark but thaw
 * nothing.
 */
export interface Warmth {
  id: number;
  /** Centre, in tiles. */
  cx: number;
  cy: number;
  /** The open-ground radius. */
  r: number;
  /** How far the open rays now reach, walls' deflected heat included. */
  far: number;
  /** Reach of each ray, in tiles. Ray i points at angle 2πi / RAYS. */
  reach: Float32Array;
}

export const WARM_RAYS = 96;

const blocksHeat = (o: number) => o === Overlay.Wall || o === Overlay.Gate;

function castWarmth(s: GameState, f: Structure): Warmth {
  const [cx, cy] = center(f);
  const r = warmthRange(f.level);
  const max = r * 2;
  const wall = new Float32Array(WARM_RAYS);
  for (let i = 0; i < WARM_RAYS; i++) {
    const a = (i / WARM_RAYS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = max;
    for (let t = 0.25; t <= max; t += 0.25) {
      const x = Math.floor(cx + dx * t);
      const y = Math.floor(cy + dy * t);
      if (!inBounds(x, y)) break;
      if (blocksHeat(s.map.overlay[idx(x, y)])) {
        d = t;
        break;
      }
    }
    wall[i] = d;
  }
  // Find the reach R at which the open rays, capped by their walls, cover
  // the same ground as the open circle: Σ min(wall, R)² = RAYS · r².
  const area = (R: number) => wall.reduce((a, w) => a + Math.min(w, R) ** 2, 0);
  const target = WARM_RAYS * r * r;
  let far = max;
  if (area(max) > target) {
    let lo = r;
    let hi = max;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (area(mid) < target) lo = mid;
      else hi = mid;
    }
    far = hi;
  }
  return { id: f.id, cx, cy, r, far, reach: wall.map((w) => Math.min(w, far)) };
}

const warmMemo = new WeakMap<GameState, { key: string; fields: Warmth[] }>();

/** Every fuelled pit fire's warmth. Recast only when a fire or a wall changes. */
export function warmFields(s: GameState): Warmth[] {
  const fires = s.structures.filter((f) => f.type === "pitfire" && !f.buildUntil && (f.fuel ?? 0) > 0);
  let h = 0;
  const { overlay } = s.map;
  for (let i = 0; i < overlay.length; i++) if (blocksHeat(overlay[i])) h = (h * 31 + i) | 0;
  const key = `${fires.map((f) => `${f.id}:${f.level}:${f.x}:${f.y}`).join(",")}|${h}`;
  const hit = warmMemo.get(s);
  if (hit && hit.key === key) return hit.fields;
  const fields = fires.map((f) => castWarmth(s, f));
  warmMemo.set(s, { key, fields });
  return fields;
}

/**
 * How far a fire's warmth reaches at an angle. Between two rays it blends,
 * except across a wall's edge, where the shorter ray wins so no warmth leaks
 * round the corner.
 */
export function reachAt(w: Warmth, angle: number): number {
  const f = (((angle / (Math.PI * 2)) * WARM_RAYS) % WARM_RAYS + WARM_RAYS) % WARM_RAYS;
  const i = Math.floor(f);
  const a = w.reach[i];
  const b = w.reach[(i + 1) % WARM_RAYS];
  if (Math.abs(a - b) > 1) return Math.min(a, b);
  return a + (b - a) * (f - i);
}

/** Whether a point, in tiles, lies inside any of these fires' warmth. */
export function warmAt(fields: Warmth[], p: [number, number]): boolean {
  return fields.some((w) => {
    const dx = p[0] - w.cx;
    const dy = p[1] - w.cy;
    return Math.hypot(dx, dy) <= reachAt(w, Math.atan2(dy, dx));
  });
}

/** Whether a point, in tiles, lies inside any pit fire's warmth. */
export function isWarm(s: GameState, p: [number, number]): boolean {
  return warmAt(warmFields(s), p);
}

/** A house is warm if a fuelled pit fire reaches it. */
export function houseWarm(s: GameState, house: Structure): boolean {
  return isWarm(s, center(house));
}

/** Fuel a pit fire's grate holds: one wood burns an hour of summer, a coal three. */
export function fuelCap(level: number) {
  return 60 + 60 * level;
}

/**
 * Fuel a pit fire burns in an hour: a little in spring and autumn, a fifth
 * of that in summer, more in winter and most on a winter night.
 */
export function burnRate(season: Season, night: boolean) {
  if (season === "winter") return night ? 3 : 1.5;
  return season === "summer" ? 0.4 * 0.2 : 0.4;
}

// ── Storage ───────────────────────────────────────────────

/** Goods that take room to keep. Coin, precious metals and laboratory goods keep anywhere. */
export const BULK: ResourceKey[] = ["wood", "stone", "coal", "iron", ...RAW_FOODS, "meals", "ice", "planks", "bricks"];

/** How much of each bulk good the town can hold: the hall's cellars, and every storehouse. */
export function storageCap(s: GameState): number {
  const hall = s.structures.find((st) => st.type === "townhall");
  const stores = s.structures.filter((st) => st.type === "storehouse" && !st.buildUntil);
  return 300 + 150 * ((hall?.level ?? 1) - 1) + stores.reduce((a, st) => a + STORE_PER_LEVEL * st.level, 0);
}

// ── Army points ───────────────────────────────────────────

/** Where troops can be posted to stand guard. */
export const GUARD_POSTS: StructureType[] = ["watchtower", "armypoint"];
export const isGuardPost = (st: Structure) => GUARD_POSTS.includes(st.type);

/**
 * Army points the town may raise: one per 50 troops, and one per captain —
 * a captain being anyone who holds a knight's title.
 */
export function armyPointsAllowed(s: GameState): { allowed: number; troops: number; captains: number } {
  const troops = s.villagers.filter((v) => MILITARY.includes(v.role)).length;
  const captains = s.villagers.filter((v) => v.role === "knight").length;
  return { allowed: Math.min(Math.floor(troops / ARMY_PER_POINT), captains), troops, captains };
}

/** The knight leading an army point, if one is. */
export const commanderOf = (s: GameState, post: Structure) => s.villagers.find((v) => v.role === "knight" && v.work === post.id);

/** The lift a knight gives the guards of the army point they lead: +20%, and 5% a title above squire. */
export function captainBonus(s: GameState, post: Structure | undefined): number {
  if (!post || post.type !== "armypoint") return 1;
  const k = commanderOf(s, post);
  if (!k || k.health <= 20) return 1;
  return 1.2 + 0.05 * KNIGHT_TITLES.indexOf(knightTitle(k.rank));
}

// ── Distance from the hall ────────────────────────────────

/** How far the town hall's writ runs, in tiles from its centre. Homes and schools stand inside it. */
export const hallRadius = (level: number) => Math.floor(16 + 4 * Math.min(level, 10) + 1.5 * Math.max(0, level - 10));

/** Tiles from the town hall's centre to a building's. */
export function hallDistance(s: GameState, st: { x: number; y: number; w: number; h: number }): number {
  const hall = s.structures.find((x) => x.type === "townhall");
  if (!hall) return 0;
  return dist(center(hall), center(st));
}

/** Levels a raid gains for how far out its target stands: one every 12 tiles past the hall's reach. */
export function exposure(s: GameState, st: Structure): number {
  const hall = s.structures.find((x) => x.type === "townhall");
  const d = hallDistance(s, st) - (hall ? hallRadius(hall.level) : 20);
  return Math.max(0, Math.floor(d / 12));
}

/** A mine's chance an hour of striking something precious: 0.5% by the hall, 8% far out. */
export function mineRareRate(s: GameState, mine: Structure): number {
  const t = Math.max(0, Math.min(1, (hallDistance(s, mine) - 10) / 60));
  return 0.005 + (0.08 - 0.005) * t;
}

/** What a strike turns out to be: silver most often, then platinum, diamond, and gold rarest. */
export const RARE_FINDS: { res: ResourceKey; weight: number; qty: [number, number] }[] = [
  { res: "silver", weight: 55, qty: [1, 3] },
  { res: "platinum", weight: 25, qty: [1, 2] },
  { res: "diamond", weight: 13, qty: [1, 1] },
  { res: "gold", weight: 7, qty: [1, 1] },
];

/** Only potatoes grow in winter, and only in a field a fire keeps open. */
export function growsInWinter(field: Structure): boolean {
  return field.type === "farm" && (field.mode ?? "potato") === "potato";
}

/** In winter a field outside every pit fire's warmth is iced over and grows nothing. */
export function fieldFrozen(s: GameState, field: Structure, winter: boolean): boolean {
  return winter && !isWarm(s, center(field));
}

// ── Light ─────────────────────────────────────────────────

/** Types that give light, and so are never themselves haunted. */
export const LIGHT_TYPES: StructureType[] = ["pitfire", "lamppost", "brazier"];

/** Reach of a light, in tiles. A cold fire or an empty brazier gives none. */
export function lightRange(st: Structure): number {
  if (st.buildUntil) return 0;
  if (st.type === "pitfire") return (st.fuel ?? 0) > 0 ? warmthRange(st.level) : 0;
  if (st.type === "brazier") return (st.fuel ?? 0) > 0 ? 6 : 0;
  if (st.type === "lamppost") return 4;
  return 0;
}

/** Distance from a point to the nearest tile of a footprint. */
function toFootprint(p: [number, number], st: Structure) {
  const cx = Math.max(st.x, Math.min(p[0], st.x + st.w));
  const cy = Math.max(st.y, Math.min(p[1], st.y + st.h));
  return Math.hypot(p[0] - cx, p[1] - cy);
}

/** Whether any light reaches a building. */
export function isLit(s: GameState, st: Structure): boolean {
  return s.structures.some((l) => {
    const r = lightRange(l);
    return r > 0 && toFootprint(center(l), st) <= r;
  });
}

/** Buildings standing in the dark: what a night haunt comes for. */
export function unlitBuildings(s: GameState): Structure[] {
  return s.structures.filter((st) => !LIGHT_TYPES.includes(st.type) && !st.buildUntil && !isLit(s, st));
}

// ── Pathfinding ───────────────────────────────────────────

/**
 * Breadth-first search over walkable tiles. Villagers and troops walk on
 * pavement only; farmers may also cross grass — the one rule the brief gives
 * about who walks where. Starts and ends are the tiles beside each building.
 */
export function findPath(s: GameState, from: Structure, to: Structure, grassOk: boolean, occ: Int32Array): number[] | null {
  const walk = (i: number) => {
    const t = s.map.terrain[i];
    const o = s.map.overlay[i];
    if (o === Overlay.Wall || occ[i]) return false;
    if (t === Terrain.Pavement) return true;
    return grassOk && (t === Terrain.Grass || t === Terrain.Bank) && o === Overlay.None;
  };
  const starts = ringOf(from.x, from.y, from.w, from.h).filter(walk);
  const goals = new Set(ringOf(to.x, to.y, to.w, to.h).filter(walk));
  if (!starts.length || !goals.size) return null;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-2);
  const q: number[] = [];
  for (const st of starts) {
    prev[st] = -1;
    q.push(st);
  }
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    if (goals.has(c)) {
      const path: number[] = [];
      for (let k = c; k !== -1; k = prev[k]) path.push(k);
      return path.reverse();
    }
    const x = tx(c);
    const y = ty(c);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!inBounds(nx, ny)) continue;
      const j = idx(nx, ny);
      if (prev[j] !== -2 || !walk(j)) continue;
      prev[j] = c;
      q.push(j);
    }
    if (q.length > 6000) break;
  }
  return null;
}
