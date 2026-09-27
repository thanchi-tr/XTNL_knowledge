import { makeCanvas, px, hash, type Ctx } from "../art/core";
import { M, E, EMISSIVE, LIT, MID, SHADE, DEEP, shift, shiftRgb, type Ramp4 } from "../art/materials";
import { grass, cobbles, sandBank, iceField } from "../art/textures";
import { frosted, type FrostMode } from "../art/winter";
import { storehouse, armySchool, armyPoint, lairArt, unitHome, rowHouse, duplexHome, apartmentBlock } from "../art/buildings3";
import { GRADES, then, mix, stampLight, applyEnvironmentLighting, type Grade } from "./lighting";
import { pine, oak, crop, youngTree, seedling } from "../art/nature";
import { keep, townhouse, forge, barracks, tower, mine, type RoofStyle } from "../art/buildings";
import {
  pitfire, school, watermill, drawWheel, kitchen, refinery, archery, armoury, wizardHut, nobleYard,
  iceFactory, lumberCamp, marketRow, wallTile, rockNode, debris, tileTree, lamppost, brazier, FIRE_MOUTH, BRAZIER_MOUTH, laboratory, fishery,
} from "../art/buildings2";
import { monsterAt, type MonsterArt } from "../art/sprites";
import { figure, troopLook, type Look } from "../art/heroes";
import { heroEffect, hasAura, buildingAura, effectBadges } from "../art/effects";
import type { Effect } from "@/lib/town/sim/effects";
import { DIG_HOURS, FILL_HOURS } from "@/lib/town/sim/catalog";
import { MAPPED, UNSEEN, VISIBLE, seesPoint, torchLit, visionMap } from "@/lib/town/sim/vision";
import { graded, gradedWall } from "../art/grades";
import { alertRadius, fuelCap, growsInWinter, hallRadius, isGuardPost, passiveRadius, wallLevel, lightRange, reachAt, unlitBuildings, warmAt, warmFields, type Warmth } from "@/lib/town/sim/world";
import { TILE_WOOD, TREE_EFFORT, treeStage } from "@/lib/town/sim/woods";
import { text } from "../pixel";
import { MAP_H, MAP_W, Overlay, TILE, Terrain, type Combatant, type GameState, type Structure } from "@/lib/town/sim/types";
import { CATALOG, grade, homeTier, levelHours } from "@/lib/town/sim/catalog";
import { MONSTERS as BEASTS } from "@/lib/town/sim/bestiary";
import { clock, type Clock } from "@/lib/town/sim/state";
import type { TownProfile } from "@/lib/town/rules";

/**
 * Map rendering.
 *
 * The world is 960×640 pixels — twice the viewport each way at the lowest
 * zoom, which is the scale the first town was drawn at. It splits into two
 * layers so the detail stays affordable:
 *
 *   static   ground, river, pavement, forest, trees, rocks, rubble, walls
 *            and every building, painted back-to-front into one canvas and
 *            only repainted when the town itself changes;
 *   live     everything that moves or flickers, drawn over it each frame
 *            through the camera.
 */

export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;
export const VIEW_W = 480;
export const VIEW_H = 320;

export const STYLE: Record<TownProfile["archetype"], { roof: RoofStyle; banner: Ramp4 }> = {
  hamlet: { roof: "thatch", banner: M.WOOL },
  "merchant-port": { roof: "teal", banner: M.CLOTHBLU },
  "alchemist-grove": { roof: "moss", banner: M.CLOTHGRN },
  "forge-hold": { roof: "slate", banner: M.CLOTHRED },
  "arcane-citadel": { roof: "red", banner: M.ARCANE },
};

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// ── Structure art ─────────────────────────────────────────

export function structureArt(st: Structure, arch: TownProfile["archetype"]): HTMLCanvasElement | null {
  const { roof, banner } = STYLE[arch];
  const L = st.level;
  switch (st.type) {
    case "townhall": return keep(L, roof, banner);
    // A home by its tier: unit, house, townhouse, duplex.
    case "house": {
      const tier = homeTier(L);
      return tier === 0 ? unitHome(st.id, roof) : tier === 1 ? townhouse(st.id % 6, roof, true) : tier === 2 ? rowHouse(st.id, roof) : duplexHome(st.id, roof);
    }
    case "apartment": return apartmentBlock(L, roof, st.w >= st.h);
    case "pitfire": return pitfire(L);
    case "lamppost": return lamppost();
    case "laboratory": return laboratory(L);
    case "fishery": return fishery(L);
    case "brazier": return brazier();
    case "school": return school(L, roof);
    case "watermill": return watermill(L, roof);
    case "refinery": return refinery(L, roof);
    case "kitchen": return kitchen(L, roof);
    case "market": return marketRow(L);
    case "barracks": return barracks(L, roof, banner);
    case "archery": return archery(L, roof);
    case "armoury": return armoury(L, roof);
    case "wizardhut": return wizardHut(L);
    case "nobleyard": return nobleYard(L, banner);
    case "watchtower": return tower(L, false);
    case "icefactory": return iceFactory(L);
    case "mine": return mine(Math.min(5, L));
    case "lumbercamp": return lumberCamp();
    case "forge": return forge(L, roof);
    case "storehouse": return storehouse(L, roof);
    case "armyschool": return armySchool(L, roof, banner);
    case "armypoint": return armyPoint(L, banner);
    default: return null; // fields are drawn as tiles
  }
}

/** Where an art canvas sits: bottom-aligned to the footprint, centred across it. */
export function artAnchor(st: Structure, art: HTMLCanvasElement): [number, number] {
  return [st.x * TILE + Math.round((st.w * TILE - art.width) / 2), (st.y + st.h) * TILE - art.height];
}

// ── Static layer ──────────────────────────────────────────

/**
 * Ground textures for one region of the world. Every texture is anchored to
 * world coordinates, so neighbouring regions meet without a seam, and none
 * is ever made larger than the region being drawn.
 */
function regionSheets(X0: number, Y0: number, W: number, H: number, winter: boolean) {
  const make = (draw: (c: Ctx) => void) => {
    const { c } = makeCanvas(W, H);
    c.translate(-X0, -Y0);
    draw(c);
    return new Uint32Array(c.getImageData(0, 0, W, H).data.buffer);
  };
  return {
    G: make((c) => grass(c, X0, Y0, W, H, 5)),
    // Warm packed-earth cobbles: roads must read as ground you walk on,
    // clearly apart from the cool grey of walls.
    Rd: make((c) => cobbles(c, X0, Y0, W, H, 3, M.ROAD)),
    Sd: make((c) => sandBank(c, X0, Y0, W, H, 6)),
    // Winter: field ice, and the roads trodden into grey slush.
    Ic: winter ? make((c) => iceField(c, X0, Y0, W, H, 8)) : null,
    Sl: winter ? make((c) => cobbles(c, X0, Y0, W, H, 3, M.SLUSH)) : null,
  };
}

function drawField(c: Ctx, st: Structure, frozen: boolean, dormant = false) {
  const water = st.type === "waterfarm";
  const x0 = st.x * TILE;
  const y0 = st.y * TILE;
  const w = st.w * TILE;
  const h = st.h * TILE;
  if (frozen) {
    // Iced over: the furrows (or the paddy's dikes) still show through as
    // ridges in the ice, and nothing stands in them.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ridge = water ? x % 12 === 0 || y % 12 === 0 : y % 3 === 0;
        const trough = water ? y % 12 === 1 : y % 3 === 2;
        const glint = hash(x0 + x, y0 + y, 17) > 0.97;
        px(c, x0 + x, y0 + y, 1, 1, M.ICE[ridge || glint ? LIT : trough ? SHADE : MID]);
      }
    }
  } else if (water) {
    // flooded paddy between raised earthen dikes; the dikes shade the water below them
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dike = x % 12 === 0 || y % 12 === 0;
        const under = y % 12 === 1;
        const ripple = hash(Math.floor((x0 + x) / 3), y0 + y, 3) > 0.92;
        px(c, x0 + x, y0 + y, 1, 1, dike ? M.DIRT[y % 12 === 0 ? LIT : MID] : under ? M.WATER[DEEP] : ripple ? M.WATER[LIT] : M.WATER[MID]);
      }
    }
    const shoot = st.mode === "lotus" ? M.CLOTHRED : M.CLOTHGRN;
    for (let yy = 2; yy < h; yy += 4) for (let xx = 2; xx < w; xx += 3) {
      if (xx % 12 === 0 || yy % 12 === 0) continue;
      px(c, x0 + xx, y0 + yy - 2, 1, 2, shoot[MID]);
      px(c, x0 + xx, y0 + yy - 2, 1, 1, shoot[LIT]);
    }
  } else {
    // furrows: a lit ridge, its face, the trough
    for (let y = 0; y < h; y++) px(c, x0, y0 + y, w, 1, M.DIRT[y % 3 === 0 ? LIT : y % 3 === 1 ? MID : SHADE]);
    const plant = crop((st.mode ?? "potato") as "potato", (st.level >= 3 ? 2 : 1) as 1 | 2);
    if (!dormant) for (let yy = 0; yy < st.h * 2; yy++) for (let xx = 0; xx < st.w * 2; xx++) c.drawImage(plant, x0 + xx * 4 - 1, y0 + yy * 4 - 4);
  }
  // fence, its rails sagging between posts
  for (let x = 0; x <= w; x += 4) {
    px(c, x0 + x - 1, y0 - 1, 1, 3, M.PINE[MID]);
    px(c, x0 + x - 1, y0 + h - 2, 1, 3, M.PINE[MID]);
  }
  px(c, x0 - 1, y0, w + 1, 1, M.PINE[LIT]);
  px(c, x0 - 1, y0 + h - 1, w + 1, 1, M.PINE[SHADE]);
}

// ── Ground: one pixel pass with autotiled edges ──────────

/*
 * Where two ground materials meet, the one that sits higher laps over the
 * other in a ragged fringe 0–2px deep, staggered in two-pixel steps by a hash
 * of the edge — grass over a road's kerb, the bank over the water, forest
 * floor over open grass — rather than a ruled line along the tile grid. On
 * the north and west sides the lip throws a pixel of shadow onto the lower
 * material, because the light comes from there; water gets foam where it
 * laps the southern bank.
 */
const LAYER: Record<number, number> = {
  [Terrain.Water]: 0,
  [Terrain.Pavement]: 1,
  [Terrain.Bank]: 2,
  [Terrain.Grass]: 3,
  [Terrain.Forest]: 4,
};

const fringe = (along: number, line: number, salt: number) => Math.floor(hash(along >> 1, line, 31 + salt) * 3);

/** Swaps a packed 0xRRGGBB for canvas byte order (0xAABBGGRR, opaque). */
const toPixel = (v: number) => (0xff000000 | ((v & 255) << 16) | (v & 0xff00) | (v >>> 16)) >>> 0;
const fromPixel = (p: number) => ((p & 255) << 16) | (p & 0xff00) | ((p >>> 16) & 255);
const hexPixel = (hex: string) => toPixel(parseInt(hex.slice(1), 16));

/**
 * `warm` is null outside winter. In winter every pixel is iced over unless it
 * lies inside a fire's warmth — its rays, cut short by walls and stretched by
 * the heat the walls threw back. The ice ends in a ragged lit lip facing
 * the fire, and a ring of wet ground just inside it.
 */
function composeGround(c: Ctx, s: GameState, shadows: [number, number, number][], warm: Warmth[] | null, X0: number, Y0: number, RW: number, RH: number) {
  const tex = regionSheets(X0, Y0, RW, RH, !!warm);
  const G = tex.G;
  const Rd = tex.Rd;
  const Sd = tex.Sd;
  const Ic = tex.Ic ?? G;
  const Sl = tex.Sl ?? Rd;
  const I = M.ICE.map(hexPixel);
  /** How far outside every fire's warmth a pixel lies, in pixels (negative inside), on a ragged edge. */
  const iceEdge = (X: number, Y: number) => {
    let e = Infinity;
    const rag = Math.floor(hash(X >> 1, Y >> 1, 41) * 3) - 1;
    for (const w of warm!) {
      const dx = X - w.cx * TILE;
      const dy = Y - w.cy * TILE;
      e = Math.min(e, Math.hypot(dx, dy) - reachAt(w, Math.atan2(dy, dx)) * TILE - rag);
    }
    return e;
  };
  const img = c.createImageData(RW, RH);
  const out = new Uint32Array(img.data.buffer);
  const { terrain } = s.map;
  const T = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : terrain[ty * MAP_W + tx]);
  const W = M.WATER.map(hexPixel);

  const tx0 = Math.max(0, Math.floor(X0 / TILE));
  const ty0 = Math.max(0, Math.floor(Y0 / TILE));
  const tx1 = Math.min(MAP_W, Math.ceil((X0 + RW) / TILE));
  const ty1 = Math.min(MAP_H, Math.ceil((Y0 + RH) / TILE));
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const own = T(tx, ty);
      const n = [T(tx, ty - 1), T(tx + 1, ty), T(tx, ty + 1), T(tx - 1, ty)]; // N E S W
      // For water: how many whole tiles of water lie between this one and each bank.
      let west = 0;
      let east = 0;
      if (own === Terrain.Water) {
        while (west < 4 && T(tx - west - 1, ty) === Terrain.Water) west++;
        while (east < 4 && T(tx + east + 1, ty) === Terrain.Water) east++;
      }
      for (let yy = 0; yy < TILE; yy++) {
        for (let xx = 0; xx < TILE; xx++) {
          const X = tx * TILE + xx;
          const Y = ty * TILE + yy;
          const dist = [yy, TILE - 1 - xx, TILE - 1 - yy, xx];
          const along = [X, Y, X, Y];
          const line = [ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE, tx * TILE];
          let mat = own;
          let lip = -1; // side whose lip falls just short of this pixel
          for (let k = 0; k < 4; k++) {
            if (n[k] < 0 || LAYER[n[k]] <= LAYER[own]) continue;
            const f = fringe(along[k], line[k], k);
            if (dist[k] < f) {
              if (LAYER[n[k]] > LAYER[mat]) mat = n[k];
            } else if (dist[k] === f) lip = k;
          }
          const i = (Y - Y0) * RW + (X - X0);
          const edge = warm ? iceEdge(X, Y) : -Infinity;
          const frozen = edge >= 0;
          let px: number;
          if (mat === Terrain.Water) {
            // The channel darkens past ~14px from either bank, along a ragged line.
            const bank = Math.min(west * TILE + xx, east * TILE + (TILE - 1 - xx));
            const ripple = hash(Math.floor(X / 3), Y, 7);
            px = W[bank > 13 + fringe(Y, 0, 5) ? SHADE : MID];
            if (ripple > 0.97) px = W[LIT];
            else if (ripple < 0.02) px = W[DEEP];
            if (lip === 0) px = W[DEEP]; // the bank shades the water beneath it
            else if (lip === 2 && hash(X >> 1, Y, 9) > 0.4) px = W[LIT]; // foam on the far shore
            if (frozen) {
              // Shelves of ice grow out from both banks; the current keeps the middle open.
              const shelf = 4 + fringe(Y, 0, 13);
              if (bank < shelf) px = hash(X, Y, 19) > 0.95 ? I[LIT] : bank === 0 ? I[SHADE] : I[MID];
              else if (bank === shelf) px = I[LIT]; // the shelf's broken edge
              else if (bank === shelf + 1) px = W[DEEP]; // and the water in its shadow
            }
          } else {
            px = mat === Terrain.Pavement ? (frozen ? Sl : Rd)[i] : frozen ? Ic[i] : mat === Terrain.Bank ? Sd[i] : G[i];
            if (mat === Terrain.Forest) px = toPixel(shiftRgb(fromPixel(px), 1, SHADE));
            if (mat === own && (lip === 0 || lip === 3)) px = toPixel(shiftRgb(fromPixel(px), 1, SHADE));
            if (frozen && edge < 1) px = toPixel(shiftRgb(fromPixel(px), -1)); // the ice's lip, catching the firelight
            else if (!frozen && edge >= -1.5) px = toPixel(shiftRgb(fromPixel(px), 1, SHADE)); // meltwater
          }
          out[i] = px;
        }
      }
    }
  }
  // Cast shadows fall down-right of each footprint, one ramp step down.
  for (const [x, y, w] of shadows) {
    if (y < Y0 || y >= Y0 + RH) continue;
    for (let xx = Math.max(X0, x); xx < Math.min(X0 + RW, x + w); xx++) {
      const i = (y - Y0) * RW + (xx - X0);
      out[i] = toPixel(shiftRgb(fromPixel(out[i]), 1, SHADE));
    }
  }
  c.putImageData(img, 0, 0);
}

/** The rows of a cast shadow: `depth` rows, each stepped one pixel right. */
function castRows(list: [number, number, number][], x: number, y: number, w: number, depth: number) {
  for (let i = 0; i < depth; i++) list.push([Math.round(x + i + 2), Math.round(y + i), Math.round(w)]);
}

/** A building under construction: its own art, stepped two shades into shadow, under scaffolding. */
const unbuiltCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function unbuilt(art: HTMLCanvasElement): HTMLCanvasElement {
  let cv = unbuiltCache.get(art);
  if (!cv) {
    const m = makeCanvas(art.width, art.height);
    m.c.drawImage(art, 0, 0);
    shift(m.c, 0, 0, art.width, art.height, 2, SHADE);
    for (let x = 2; x < art.width - 2; x += 7) px(m.c, x, Math.round(art.height * 0.3), 1, Math.round(art.height * 0.7), M.PINE[LIT]);
    for (let y = Math.round(art.height * 0.35); y < art.height; y += 8) px(m.c, 2, y, art.width - 4, 1, M.PINE[MID]);
    cv = m.cv;
    unbuiltCache.set(art, cv);
  }
  return cv;
}

/**
 * Something upright in the static world — a building, a tree, a wall, a
 * rock — kept so the live layer can put it back in front of whoever walks
 * behind it.
 */
export interface Occluder {
  img: HTMLCanvasElement;
  x: number;
  y: number;
  /** World y of the line where it meets the ground. */
  base: number;
}

/**
 * The static world, in chunks: 32×32 tiles each, painted only when first
 * seen and repainted only when something inside it (or tall enough to reach
 * into it) changes. A map many times the size of the screen costs no more
 * to open than the corner of it you are looking at.
 */
export const CHUNK = 32;
const CHUNK_PX = CHUNK * TILE;
/** Chunks painted per frame at most, so opening the map never stalls. */
const CHUNK_BUDGET = 2;
/** Chunks kept in memory; the least recently seen go first. */
const CHUNK_KEEP = 90;

export interface Chunk {
  key: string;
  cv: HTMLCanvasElement;
  occluders: Occluder[];
  checkedAt: number;
}

export interface World {
  chunks: Map<number, Chunk>;
}

export const newWorld = (): World => ({ chunks: new Map() });

/** Everything that decides how a chunk looks, hashed: the tiles in and around it, what stands on them, the season. */
function chunkKey(s: GameState, arch: string, cx: number, cy: number, winterSig: string): string {
  const { terrain, overlay, meta } = s.map;
  const tx0 = Math.max(0, cx * CHUNK - 4);
  const tx1 = Math.min(MAP_W, (cx + 1) * CHUNK + 4);
  const ty0 = Math.max(0, cy * CHUNK - 1);
  const ty1 = Math.min(MAP_H, (cy + 1) * CHUNK + 7);
  let h = 0;
  for (let y = ty0; y < ty1; y++) {
    for (let x = tx0; x < tx1; x++) {
      const i = y * MAP_W + x;
      const o = overlay[i];
      const t = terrain[i];
      const m = o === Overlay.Wall || o === Overlay.Gate ? grade(wallLevel(meta[i])) : o === Overlay.Tree || o === Overlay.Rock ? meta[i] : t === Terrain.Forest ? (meta[i] >= TILE_WOOD / 2 ? 3 : meta[i] >= TILE_WOOD / 5 ? 2 : meta[i] > TILE_WOOD / 20 ? 1 : 0) : 0;
      h = (h * 31 + t * 7 + o * 13 + m) | 0;
    }
  }
  const near = (x: number, y: number, w: number, hh: number) =>
    x + w >= cx * CHUNK - 12 && x <= (cx + 1) * CHUNK + 12 && y + hh >= cy * CHUNK && y <= (cy + 1) * CHUNK + 18;
  const sts = s.structures.filter((st) => near(st.x, st.y, st.w, st.h)).map((st) => `${st.id}:${st.type}:${st.level}:${st.mode ?? ""}:${st.buildUntil ? 1 : 0}`).join(",");
  const lairs = (s.lairs ?? []).filter((l) => near(l.x, l.y, l.w, l.h)).map((l) => `${l.id}`).join(",");
  return `${arch}|${h}|${sts}|${lairs}|${winterSig}`;
}

/** The season's part of every chunk's key: whether it is winter, and where the fires keep the ice off. */
function winterSignature(s: GameState): string {
  if (clock(s.time).season !== "winter") return "";
  return "w:" + warmFields(s).map((w) => `${w.id}:${w.r}:${w.far.toFixed(1)}`).join(";");
}

/** A chunk, painted if it is missing or stale and the frame's budget allows. */
function ensureChunk(world: World, s: GameState, arch: TownProfile["archetype"], cx: number, cy: number, budget: { left: number }, winterSig: string): Chunk | undefined {
  const id = cy * 4096 + cx;
  const now = performance.now();
  let ch = world.chunks.get(id);
  if (ch && now - ch.checkedAt < 250) return ch;
  const key = chunkKey(s, arch, cx, cy, winterSig);
  if (ch && ch.key === key) {
    ch.checkedAt = now;
    return ch;
  }
  if (budget.left <= 0) return ch; // stale, or not yet painted: next frame
  budget.left -= 1;
  const r = composeRegion(s, arch, cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, CHUNK_PX);
  ch = { key, cv: r.cv, occluders: r.occluders, checkedAt: now };
  world.chunks.delete(id);
  world.chunks.set(id, ch);
  while (world.chunks.size > CHUNK_KEEP) world.chunks.delete(world.chunks.keys().next().value!);
  return ch;
}

/**
 * Paints one region of the static world: ground, fields, and every upright
 * thing whose art reaches into it — trees, rocks, walls, buildings, lairs —
 * back to front. Returns the uprights that stand (by their foot) inside the
 * region, for the live layer's painter's pass.
 */
function composeRegion(s: GameState, arch: TownProfile["archetype"], X0: number, Y0: number, RW: number, RH: number): { cv: HTMLCanvasElement; occluders: Occluder[] } {
  const { cv, c } = makeCanvas(RW, RH);
  const { terrain, overlay, meta } = s.map;
  // Winter: snow on every roof and cap, warm or not; ice on the ground
  // everywhere a pit fire does not reach.
  const winter = clock(s.time).season === "winter";
  const warm = winter ? warmFields(s) : null;
  const dress = (img: HTMLCanvasElement, mode: FrostMode = "roof") => (winter ? frosted(img, mode) : img);

  const shadows: [number, number, number][] = [];
  const items: { base: number; draw: () => void }[] = [];
  const occluders: Occluder[] = [];
  const owns = (fx: number, fy: number) => fx >= X0 && fx < X0 + RW && fy > Y0 && fy <= Y0 + RH;
  const upright = (img: HTMLCanvasElement, x: number, y: number, base: number, footX: number) => {
    const o = { img, x: Math.round(x), y: Math.round(y), base };
    if (o.x > X0 + RW || o.x + img.width < X0 || o.y > Y0 + RH || o.y + img.height < Y0) return;
    if (owns(footX, base)) occluders.push(o);
    items.push({ base, draw: () => c.drawImage(img, o.x, o.y) });
  };
  const tx0 = Math.max(0, Math.floor(X0 / TILE) - 4);
  const tx1 = Math.min(MAP_W, Math.ceil((X0 + RW) / TILE) + 4);
  const ty0 = Math.max(0, Math.floor(Y0 / TILE) - 1);
  const ty1 = Math.min(MAP_H, Math.ceil((Y0 + RH) / TILE) + 7);
  for (let y = ty0; y < ty1; y++) {
    for (let x = tx0; x < tx1; x++) {
      const i = y * MAP_W + x;
      const X = x * TILE;
      const Y = y * TILE;
      if (terrain[i] === Terrain.Forest) {
        // The stand thins as it is cut: full trees on a well-stocked tile,
        // young ones as it runs down, seedlings near the end, then bare floor.
        if ((x + y * 3) % 2 !== 0) continue;
        const v = Math.floor(hash(x, y, 11) * 6);
        const left = meta[i] / TILE_WOOD;
        if (left <= 0.05) continue;
        const bare = left >= 0.5 ? (v % 3 === 0 ? oak(v % 4) : pine(v % 3)) : left >= 0.2 ? youngTree(v) : seedling(v);
        const tree = dress(bare, "tree");
        upright(tree, X + TILE / 2 - tree.width / 2 + Math.round((hash(x, y, 2) - 0.5) * 4), Y + TILE - tree.height + (left >= 0.5 ? 0 : 1), Y + TILE, X + TILE / 2);
        continue;
      }
      const o = overlay[i];
      if (o === Overlay.Tree) {
        const tree = dress(tileTree(meta[i]), "tree");
        if (treeStage(meta[i]) >= 2) castRows(shadows, X - 2, Y + TILE - 2, 10, 3);
        upright(tree, X + TILE / 2 - tree.width / 2, Y + TILE - tree.height + 2, Y + TILE, X + TILE / 2);
      } else if (o === Overlay.Rock) {
        upright(dress(rockNode(meta[i], i % 3), "cap"), X - 2, Y - 2, Y + TILE, X + TILE / 2);
      } else if (o === Overlay.Debris) {
        if (X + TILE > X0 && X < X0 + RW && Y + TILE > Y0 && Y < Y0 + RH) items.push({ base: Y + 1, draw: () => c.drawImage(debris(i % 5), X, Y) });
      } else if (o === Overlay.Wall || o === Overlay.Gate) {
        const n = overlay[i - MAP_W] === Overlay.Wall || overlay[i - MAP_W] === Overlay.Gate;
        const sb = overlay[i + MAP_W] === Overlay.Wall || overlay[i + MAP_W] === Overlay.Gate;
        const tileArt = dress(gradedWall(wallTile(n, sb, o === Overlay.Gate), grade(wallLevel(meta[i]))), "cap");
        upright(tileArt, X, Y + TILE - tileArt.height, Y + TILE, X + TILE / 2);
      }
    }
  }
  for (const st of s.structures) {
    if (st.x + st.w < tx0 - 12 || st.x > tx1 + 12 || st.y + st.h < ty0 || st.y > ty1 + 18) continue;
    const plain = structureArt(st, arch);
    if (!plain) continue;
    const bare = graded(plain, grade(st.level), STYLE[arch].banner, st.level);
    const art = dress(bare);
    const [ax, ay] = artAnchor(st, art);
    castRows(shadows, ax + 4, (st.y + st.h) * TILE - 3, art.width - 8, 6);
    upright(st.buildUntil ? unbuilt(art) : art, ax, ay, (st.y + st.h) * TILE, (st.x + st.w / 2) * TILE);
  }
  for (const l of s.lairs ?? []) {
    if (l.x + l.w < tx0 - 12 || l.x > tx1 + 12 || l.y + l.h < ty0 || l.y > ty1 + 18) continue;
    const art = dress(lairArt(l.kind), "cap");
    const ax = l.x * TILE + Math.round((l.w * TILE - art.width) / 2);
    const ay = (l.y + l.h) * TILE - art.height;
    castRows(shadows, ax + 4, (l.y + l.h) * TILE - 3, art.width - 8, 5);
    upright(art, ax, ay, (l.y + l.h) * TILE, (l.x + l.w / 2) * TILE);
  }

  composeGround(c, s, shadows, warm, X0, Y0, RW, RH);
  c.save();
  c.translate(-X0, -Y0);
  // Farm fields sit flat on the ground, under everything else.
  const frozenAt = (st: Structure) => !!warm && !warmAt(warm, [st.x + st.w / 2, st.y + st.h / 2]);
  // In winter a field the fire keeps open still stands bare unless it is potatoes.
  for (const st of s.structures) {
    if (st.type !== "farm" && st.type !== "waterfarm") continue;
    if ((st.x + st.w) * TILE < X0 || st.x * TILE > X0 + RW || (st.y + st.h) * TILE < Y0 || st.y * TILE > Y0 + RH) continue;
    drawField(c, st, frozenAt(st), winter && !growsInWinter(st));
  }
  items.sort((a, b) => a.base - b.base).forEach((it) => it.draw());
  c.restore();
  return { cv, occluders };
}

// ── Live layer ────────────────────────────────────────────

export interface Walker {
  kind: Look;
  /** Villager id, for per-hero effects. */
  id?: number;
  path: number[];
  offset: number;
  speed: number;
  /**
   * wander: a free villager strolling back and forth all day.
   * commute: a worker, seen only on the way to work in the morning and
   * home in the evening — once each per day, on the game clock.
   */
  mode?: "wander" | "commute";
  /** Commuters: game minutes after 06:00 (and 17:00) they set off. */
  leave?: number;
}

/** Commuters walk this many tiles per game minute. */
const COMMUTE_PACE = 0.5;

/** Where a walker stands now, and which way along the path they head (+1 out, −1 back); null when indoors. */
function walkerAt(w: Walker, t: number, minute: number): { pos: number; dir: 1 | -1 } | null {
  const len = w.path.length - 1;
  if (w.mode === "commute") {
    const leave = w.leave ?? 0;
    const out = (minute - (6 * 60 + leave)) * COMMUTE_PACE;
    if (out >= 0 && out <= len) return { pos: out, dir: 1 };
    const back = (minute - (17 * 60 + leave)) * COMMUTE_PACE;
    if (back >= 0 && back <= len) return { pos: len - back, dir: -1 };
    return null;
  }
  const u = (t * w.speed + w.offset) % (2 * len);
  return u < len ? { pos: u, dir: 1 } : { pos: 2 * len - u, dir: -1 };
}

export interface Overlays {
  hover: [number, number] | null;
  ghost: { type: string; x: number; y: number; w: number; h: number; ok: boolean; art: HTMLCanvasElement | null } | null;
  paint: { tiles: number[]; ok: boolean; kind: string } | null;
  selected: number | null;
  /** A selected tree, rock or rubble tile. */
  tile: number | null;
  walkers: Walker[];
  arch: TownProfile["archetype"];
  /** What is acting on each building, for the radiance and the badges. */
  effects?: Map<number, Effect[]>;
}

/** A defender's look follows its ladder; a battalion soldier is a footman sworn to a knight. */
const troopArt = (c: Combatant): Look => troopLook(c.kind, c.level);

/** Flames are emissive: the night grade leaves them burning at full strength. */
function flames(c: Ctx, x: number, y: number, t: number, n: number, seed: number, tall = 1) {
  for (let i = 0; i < n; i++) {
    const f = hash(Math.floor(t * 14), i, seed);
    const hgt = Math.round((2 + f * 5) * tall);
    px(c, x + i - n / 2, y - hgt, 1, hgt, f > 0.6 ? E.AMBER[1] : f > 0.3 ? E.AMBER[2] : E.BLOOD[2]);
    if (f > 0.8) px(c, x + i - n / 2, y - 2, 1, 1, E.AMBER[0]);
  }
}

/** Smoke in solid puffs that thin by stepping down a ramp and shrinking — no translucency. */
function smoke(c: Ctx, x: number, y: number, t: number, dark = false, ramp?: Ramp4) {
  const S = ramp ?? (dark ? M.SLATE : M.FURGREY);
  for (let i = 0; i < 4; i++) {
    const age = (t * 0.45 + i / 4) % 1;
    if (age > 0.8) continue;
    const sx = x + Math.sin(age * 5 + i) * 2 + age * 7;
    const sy = y - age * 22;
    const s = age < 0.3 ? 2 : age < 0.6 ? 3 : 2;
    px(c, Math.round(sx), Math.round(sy), s, s, S[age < 0.3 ? SHADE : age < 0.6 ? MID : LIT]);
  }
}

// HUD colours: bars and numbers must stay legible through night and raid.
const HUD = { frame: "#0c0810", empty: "#3a1418", friend: "#5ad06a", foe: "#e0402a", build: "#e8c060", select: ["#ffe07a", "#c9a040"], level: "#ffe070", legend: "#ffb04a", crit: "#ffd84a", hit: "#ff7a6a" };
/** How much colour the world keeps: a muted, weathered palette. Lights and the interface stay vivid. */
const MUTED = 0.74;
/** Monsters that fly, lifted off the ground when they roam. */
const MONSTER_FLIES = new Set(Object.values(BEASTS).filter((d) => d.flying).map((d) => d.kind as string));
// The night fog's two greys are kept out of the grade too, so the dark
// greys it out rather than tinting it blue (see FOG_NIGHT_NEAR/FAR below).
const PROTECT = new Set<number>([0x4b4e53, 0x1d1f22, ...EMISSIVE, ...[HUD.frame, HUD.empty, HUD.friend, HUD.foe, HUD.build, ...HUD.select, HUD.level, HUD.legend, HUD.crit, HUD.hit].map((h) => parseInt(h.slice(1), 16))]);

function hpBar(c: Ctx, x: number, y: number, w: number, frac: number, friend: boolean) {
  px(c, x - 1, y - 1, w + 2, 4, HUD.frame);
  px(c, x, y, w, 2, HUD.empty);
  px(c, x, y, Math.max(0, Math.round(w * frac)), 2, friend ? HUD.friend : HUD.foe);
}

/**
 * A unit's contact shadow: a solid 3-row ellipse in the darkest shade of the
 * ground it stands on — never black, never translucent. Flying units get a
 * smaller, lighter one.
 */
function footShadow(c: Ctx, s: GameState, x: number, y: number, w: number, flying = false) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor((y - 1) / TILE);
  const t = tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H ? s.map.terrain[ty * MAP_W + tx] : Terrain.Grass;
  const ramp = t === Terrain.Pavement ? M.ROAD : t === Terrain.Bank ? M.SAND : t === Terrain.Water ? M.WATER : M.GRASS;
  const col = ramp[flying ? SHADE : DEEP];
  const x0 = Math.round(x - w / 2);
  const yy = Math.round(y);
  px(c, x0 + 1, yy - 2, w - 2, 1, col);
  px(c, x0, yy - 1, w, 1, col);
  px(c, x0 + 1, yy, w - 2, 1, col);
}

/** Draws one frame: the static layer through the camera, the live layer, then the light. */
export function drawFrame(ctx: Ctx, world: World, s: GameState, cam: Camera, ov: Overlays, t: number) {
  const c = ctx;
  c.imageSmoothingEnabled = false;
  const vw = VIEW_W / cam.zoom;
  const vh = VIEW_H / cam.zoom;
  c.fillStyle = "#0c0a10";
  c.fillRect(0, 0, VIEW_W, VIEW_H);

  c.save();
  c.scale(cam.zoom, cam.zoom);
  c.translate(-cam.x, -cam.y);
  // The static world: the chunks in view, painted as they are needed. One
  // row below and a column each side are kept ready too, for the uprights
  // whose art reaches up or across into view.
  const budget = { left: CHUNK_BUDGET };
  const wsig = winterSignature(s);
  const cx0 = Math.max(0, Math.floor(cam.x / CHUNK_PX));
  const cy0 = Math.max(0, Math.floor(cam.y / CHUNK_PX));
  const cx1 = Math.min(Math.ceil(MAP_W / CHUNK) - 1, Math.floor((cam.x + vw) / CHUNK_PX));
  const cy1 = Math.min(Math.ceil(MAP_H / CHUNK) - 1, Math.floor((cam.y + vh) / CHUNK_PX));
  const occluders: Occluder[] = [];
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const ch = ensureChunk(world, s, ov.arch, cx, cy, budget, wsig);
      if (ch) c.drawImage(ch.cv, cx * CHUNK_PX, cy * CHUNK_PX);
      else {
        c.fillStyle = "#2a2d34";
        c.fillRect(cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX, CHUNK_PX);
      }
    }
  }
  for (let cy = cy0; cy <= Math.min(Math.ceil(MAP_H / CHUNK) - 1, cy1 + 1); cy++) {
    for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(Math.ceil(MAP_W / CHUNK) - 1, cx1 + 1); cx++) {
      const inside = cy <= cy1 && cx >= cx0 && cx <= cx1;
      const ch = inside ? world.chunks.get(cy * 4096 + cx) : ensureChunk(world, s, ov.arch, cx, cy, budget, wsig);
      if (ch) occluders.push(...ch.occluders);
    }
  }
  const clk = clock(s.time);
  const inView = (x: number, y: number, m = 40) => x > cam.x - m && x < cam.x + vw + m && y > cam.y - m && y < cam.y + vh + m;

  // water glints: three-pixel streaks drifting downstream
  for (let k = 0; k < 90; k++) {
    const tx = Math.floor(hash(k, 1, 4) * MAP_W);
    const ty = Math.floor(((hash(k, 2, 4) * MAP_H) + t * 1.5) % MAP_H);
    if (s.map.terrain[ty * MAP_W + tx] !== Terrain.Water) continue;
    const X = tx * TILE + Math.floor(hash(k, 3, 4) * 5);
    const Y = ty * TILE + Math.floor(hash(k, 5, 4) * 6);
    if (inView(X, Y) && Math.sin(t * 4 + k) > 0.3) px(c, X, Y, 3, 1, M.WATER[LIT]);
  }

  // building life
  for (const st of s.structures) {
    const X = st.x * TILE;
    const Y = st.y * TILE;
    if (!inView(X, Y, 120) || st.buildUntil) continue;
    if (st.type === "pitfire" && (st.fuel ?? 0) > 0) {
      const art = pitfire(st.level);
      const [ax, ay] = artAnchor(st, art);
      const m = FIRE_MOUTH[Math.min(5, st.level)];
      flames(c, ax + m.x, ay + m.y, t, m.n + (clk.season === "winter" ? 2 : 0), st.id, m.tall);
      smoke(c, ax + m.x, ay + m.y - 10 - m.tall * 4, t + st.id);
    }
    if (st.type === "brazier" && (st.fuel ?? 0) > 0) {
      const [ax, ay] = artAnchor(st, brazier());
      flames(c, ax + BRAZIER_MOUTH.x, ay + BRAZIER_MOUTH.y, t, BRAZIER_MOUTH.n, st.id, BRAZIER_MOUTH.tall);
    }
    if (st.type === "forge") {
      flames(c, X + 18, Y + st.h * TILE - 1, t, 12, 5);
      smoke(c, X + st.w * TILE - 12, Y - 20, t, true);
    }
    if (st.type === "kitchen" || st.type === "refinery" || st.type === "house" || st.type === "apartment") smoke(c, X + st.w * TILE - 8, Y - 16, t + st.id * 0.3, st.type === "refinery");
    // the laboratory's flue runs green
    if (st.type === "laboratory") smoke(c, X + 10, Y - 20, t + st.id * 0.3, false, M.CLOTHGRN);
    if (st.type === "watermill") drawWheel(c, X - 3, Y + st.h * TILE - 10, 9, t * 1.6);
  }

  // After dusk, a red mark over every building no light reaches: that is
  // where tonight's haunt will go.
  if (clk.darkness > 0.2 && !s.raid) {
    for (const st of unlitBuildings(s)) {
      const X = Math.round((st.x + st.w / 2) * TILE);
      const Y = st.y * TILE - 10 - Math.round(Math.sin(t * 3 + st.id) * 1.5);
      if (!inView(X, Y)) continue;
      px(c, X - 1, Y, 3, 1, HUD.frame);
      px(c, X - 1, Y + 1, 3, 4, HUD.frame);
      px(c, X, Y + 1, 1, 2, E.BLOOD[1]);
      px(c, X, Y + 4, 1, 1, E.BLOOD[0]);
    }
  }

  // construction progress
  for (const st of s.structures) {
    if (!st.buildUntil) continue;
    const def = CATALOG[st.type];
    const total = def.buildHours * 60 * (st.level > 1 ? levelHours(st.level) : 1);
    const frac = 1 - Math.max(0, st.buildUntil - s.time) / Math.max(1, total);
    const X = st.x * TILE;
    const Y = st.y * TILE - 6;
    px(c, X, Y, st.w * TILE, 3, HUD.frame);
    px(c, X + 1, Y + 1, Math.round((st.w * TILE - 2) * Math.min(1, frac)), 1, HUD.build);
  }

  // ── Radiance: what is acting on which building ──
  // Drawn under the people, so a villager walking past stays readable; the
  // badges go on top with the bars.
  const badges: (() => void)[] = [];
  for (const [id, list] of ov.effects ?? []) {
    const st = s.structures.find((x) => x.id === id);
    if (!st) continue;
    const art = structureArt(st, ov.arch);
    const box = art ? { img: art, at: artAnchor(st, art) } : null;
    const x = box ? box.at[0] : st.x * TILE;
    const y = box ? box.at[1] : st.y * TILE;
    const w = box ? box.img.width : st.w * TILE;
    const h = box ? box.img.height : st.h * TILE;
    const feet = (st.y + st.h) * TILE;
    if (!inView(x + w / 2, y + h / 2, 60 + w)) continue;
    for (const e of list) buildingAura(c, e.kind, x, y, w, h, feet, t, st.id + e.kind.length, box?.img);
    badges.push(() => effectBadges(c, list.map((e) => e.kind), x + w / 2, y - 9));
  }

  // ── Everyone on their feet, in depth order ──
  // Sprites are sorted by the line where their feet touch the ground, and
  // so is every building, tree, wall and rock that overlaps one of them: a
  // villager on the road behind a house is drawn, then the house goes back
  // over them. Bars and numbers wait until everything else is down.
  const sprites: { base: number; x0: number; y0: number; x1: number; y1: number; draw: () => void }[] = [];
  const onTop: (() => void)[] = [];

  // villagers going about their work (day only)
  if (!clk.night && !s.raid?.started) {
    for (const w of ov.walkers) {
      if (w.path.length < 2) continue;
      const len = w.path.length - 1;
      const at = walkerAt(w, t, s.time % (24 * 60));
      if (!at) continue;
      const pos = Math.min(len, at.pos);
      const a = w.path[Math.floor(pos)];
      const b = w.path[Math.min(len, Math.floor(pos) + 1)];
      const f = pos - Math.floor(pos);
      const x = Math.round(((a % MAP_W) + ((b % MAP_W) - (a % MAP_W)) * f) * TILE + TILE / 2);
      const y = Math.round((Math.floor(a / MAP_W) + (Math.floor(b / MAP_W) - Math.floor(a / MAP_W)) * f) * TILE + TILE);
      if (!inView(x, y)) continue;
      const frame = Math.floor(t * 6 + w.offset) % 2 ? 1 : 0;
      const img = figure(w.kind, frame);
      const back = at.dir > 0 ? (b % MAP_W) < (a % MAP_W) : (a % MAP_W) < (b % MAP_W);
      const dx = Math.round(x - img.width / 2);
      const dy = y - img.height;
      sprites.push({
        base: y, x0: dx - 10, y0: dy - 6, x1: dx + img.width + 10, y1: y + 2,
        draw: () => {
          footShadow(c, s, x, y, frame ? 8 : 10);
          if (back) {
            c.save();
            c.translate(dx + img.width, dy);
            c.scale(-1, 1);
            c.drawImage(img, 0, 0);
            c.restore();
          } else c.drawImage(img, dx, dy);
          if (hasAura(w.kind)) heroEffect(c, w.kind, x, dy, y, t, w.id ?? 0);
        },
      });
    }
  }

  // Bands out of the fog — drawn only where the town can see them.
  for (const b of s.roamers ?? []) {
    if (!seesPoint(s, b.x, b.y)) continue;
    const img = monsterAt(b.kind as MonsterArt, b.level);
    const flip = b.tx < b.x;
    for (let k = 0; k < Math.min(3, b.count); k++) {
      const x = Math.round((b.x + (k - 1) * 1.3) * TILE);
      const y = Math.round((b.y + (k % 2) * 0.7) * TILE);
      if (!inView(x, y, 60)) continue;
      const dx = Math.round(x - img.width / 2);
      const dy = y - img.height - (MONSTER_FLIES.has(b.kind) ? 12 : 0);
      sprites.push({
        base: y, x0: dx - 10, y0: dy - 6, x1: dx + img.width + 10, y1: y + 2,
        draw: () => {
          footShadow(c, s, x, y, Math.round(img.width / 1.6));
          if (flip) c.drawImage(img, dx, dy);
          else {
            c.save();
            c.translate(dx + img.width, dy);
            c.scale(-1, 1);
            c.drawImage(img, 0, 0);
            c.restore();
          }
        },
      });
    }
  }
  // Heroes out in the fog, torch in hand.
  for (const v of s.villagers) {
    if (!v.scout) continue;
    const x = Math.round(v.scout.x * TILE);
    const y = Math.round(v.scout.y * TILE);
    if (!inView(x, y)) continue;
    const look = troopLook(v.role, v.rank);
    const frame = Math.floor(t * 6 + v.id) % 2 ? 1 : 0;
    const img = figure(look, frame);
    const [gx] = v.scout.phase === "out" ? [v.scout.tx] : [v.scout.hx];
    const left = gx < v.scout.x;
    const dx = Math.round(x - img.width / 2);
    const dy = y - img.height;
    const lit = torchLit(v);
    sprites.push({
      base: y, x0: dx - 10, y0: dy - 10, x1: dx + img.width + 10, y1: y + 2,
      draw: () => {
        footShadow(c, s, x, y, 10);
        if (left) {
          c.save();
          c.translate(dx + img.width, dy);
          c.scale(-1, 1);
          c.drawImage(img, 0, 0);
          c.restore();
        } else c.drawImage(img, dx, dy);
        if (lit) flames(c, x + (left ? -6 : 6), dy + 7, t, 2, v.id, 0.5);
      },
    });
  }

  // combat
  const raid = s.raid;
  if (raid?.started) {
    for (const u of raid.combatants) {
      // guards still inside their tower are not out on the field
      if (u.hp <= 0 || u.structId || u.inside) continue;
      const x = Math.round(u.x * TILE);
      const y = Math.round(u.y * TILE);
      if (!inView(x, y, 80)) continue;
      const frame = Math.floor(t * 6 + u.id) % 2 ? 1 : 0;
      const look = u.side === "defender" ? troopArt(u) : null;
      const img = u.side === "monster" ? monsterAt(u.kind as MonsterArt, u.level) : figure(look!, frame);
      const lift = u.flying ? Math.round(14 + Math.sin(t * 3 + u.id) * 2) : 0;
      const swing = u.swingAt !== undefined && raid.clock - u.swingAt < 0.15 ? (u.side === "monster" ? -2 : 2) : 0;
      const dx = Math.round(x - img.width / 2 + swing);
      const dy = y - img.height - lift;
      sprites.push({
        base: y, x0: dx - 10, y0: dy - 6, x1: dx + img.width + 10, y1: y + 2,
        draw: () => {
          footShadow(c, s, x, y, Math.round(img.width / (u.flying ? 2.2 : 1.6)), u.flying);
          if (u.side === "monster") {
            c.save();
            c.translate(dx + img.width, dy);
            c.scale(-1, 1);
            c.drawImage(img, 0, 0);
            c.restore();
          } else c.drawImage(img, dx, dy);
          if (look && hasAura(look)) heroEffect(c, look, x, dy, y, t, u.id);
        },
      });
      if (u.scorched) {
        // firelight on a thing of the dark: embers rising off it
        onTop.push(() => {
          for (let k = 0; k < 4; k++) {
            const ex = x - 6 + Math.floor(hash(k, u.id, 3) * 12);
            const ey = y - 4 - ((Math.floor(t * 12) + k * 5) % 14);
            px(c, ex, ey, 1, 1, k % 2 ? E.AMBER[1] : E.AMBER[2]);
          }
        });
      }
      onTop.push(() => {
        hpBar(c, x - 8, dy - 5, 16, u.hp / u.maxHp, u.side === "defender");
        if (u.side === "monster" && u.level >= 5) text(c, `L${u.level}`, x - 6, dy - 11, u.legendary ? HUD.legend : HUD.level);
      });
    }
    // static posts: HP over the building
    for (const u of raid.combatants.filter((v) => v.structId && v.hp > 0)) {
      const st = s.structures.find((x) => x.id === u.structId);
      if (st) onTop.push(() => hpBar(c, st.x * TILE, st.y * TILE - 10, st.w * TILE, u.hp / u.maxHp, true));
    }
    onTop.push(() => {
      for (const p of raid.projectiles) {
        const x = (p.x + (p.tx - p.x) * p.t) * TILE;
        const y = (p.y + (p.ty - p.y) * p.t) * TILE - Math.sin(p.t * Math.PI) * 10;
        if (p.kind === "arrow") px(c, x - 1, y, 3, 1, M.PINE[LIT]);
        else {
          // bolts and fire are light sources: a white core in a halo
          const g = p.kind === "bolt" ? E.CYAN : E.AMBER;
          px(c, x - 1, y, 3, 1, g[1]);
          px(c, x, y - 1, 1, 3, g[1]);
          px(c, x, y, 1, 1, g[0]);
        }
      }
      for (const p of raid.pops ?? []) {
        const age = raid.clock - p.at;
        if (age > 0.9) continue;
        text(c, p.text.replace("-", ""), Math.round(p.x * TILE), Math.round(p.y * TILE - age * 14), p.tone === "crit" ? HUD.crit : HUD.hit);
      }
    });
  }

  // The painter's pass: sprites, and whatever upright thing overlaps one.
  if (sprites.length) {
    const layer: { base: number; order: number; draw: () => void }[] = sprites.map((sp) => ({ base: sp.base, order: 1, draw: sp.draw }));
    for (const o of occluders) {
      const ox1 = o.x + o.img.width;
      const oy1 = o.y + o.img.height;
      if (!sprites.some((sp) => sp.x0 < ox1 && sp.x1 > o.x && sp.y0 < oy1 && sp.y1 > o.y)) continue;
      layer.push({ base: o.base, order: 0, draw: () => c.drawImage(o.img, o.x, o.y) });
    }
    // On the same line, the building goes first and whoever stands there over it.
    layer.sort((p, q) => p.base - q.base || p.order - q.order).forEach((it) => it.draw());
  }
  for (const f of badges) f();
  for (const f of onTop) f();

  // Trees, rocks and rubble being cleared: a bar over the tile.
  for (const job of s.clearing) {
    const X = (job.tile % MAP_W) * TILE;
    const Y = Math.floor(job.tile / MAP_W) * TILE;
    if (!inView(X, Y)) continue;
    const o = s.map.overlay[job.tile];
    const stage = o === Overlay.Tree ? treeStage(s.map.meta[job.tile]) : 0;
    const need = o === Overlay.Tree ? TREE_EFFORT[stage] : o === Overlay.Rock ? 4 : 3;
    const yy = o === Overlay.Tree ? Y - [4, 10, 18, 22, 22][stage] : Y - 5;
    px(c, X, yy, TILE, 3, HUD.frame);
    px(c, X + 1, yy + 1, Math.max(1, Math.round((TILE - 2) * Math.min(1, job.progress / need))), 1, HUD.build);
  }

  // ── The fog ──
  // Cloud over everything the town cannot see, a thin mist over ground it
  // has seen before (and at the cloud's edge, so it thins rather than
  // stops), drifting slowly. Drawn over the world and whatever walks in it,
  // under the markers the player works with.
  drawFog(c, s, cam, clk.darkness > 0.5);

  // selection, ghosts, painting
  if (ov.selected) {
    const st = s.structures.find((x) => x.id === ov.selected);
    if (st) {
      const col = HUD.select[Math.floor(t * 3) % 2];
      c.strokeStyle = col;
      c.lineWidth = 1 / cam.zoom;
      c.strokeRect(st.x * TILE + 0.5, st.y * TILE + 0.5, st.w * TILE - 1, st.h * TILE - 1);
      text(c, `L${st.level}`, st.x * TILE + 2, st.y * TILE + 2, HUD.select[0]);
    }
  }
  // The selected pit fire's warmth: a dashed amber line that runs out to its
  // reach in the open and hugs any wall that cuts it short.
  const selFire = ov.selected ? s.structures.find((x) => x.id === ov.selected && x.type === "pitfire") : undefined;
  const selWarm = selFire && warmFields(s).find((w) => w.id === selFire.id);
  if (selWarm) {
    const n = Math.max(96, Math.round(selWarm.far * TILE * 2 * Math.PI));
    const crawl = Math.floor(t * 6);
    for (let i = 0; i < n; i++) {
      if ((i + crawl) % 8 >= 5) continue;
      const a = (i / n) * Math.PI * 2;
      const r = reachAt(selWarm, a) * TILE;
      const x = Math.round(selWarm.cx * TILE + Math.cos(a) * r);
      const y = Math.round(selWarm.cy * TILE + Math.sin(a) * r);
      px(c, x, y + 1, 1, 1, E.AMBER[3]);
      px(c, x, y, 1, 1, E.AMBER[1]);
    }
  }

  // Fuel left in each pit fire's grate: a bar over the fire, green while
  // there is plenty, amber past half, red in the last fifth, and a blinking
  // empty frame once it is out.
  for (const st of s.structures) {
    if (st.type !== "pitfire" || st.buildUntil) continue;
    const art = pitfire(st.level);
    const [ax, ay] = artAnchor(st, art);
    if (!inView(ax, ay, 40)) continue;
    const frac = Math.max(0, Math.min(1, (st.fuel ?? 0) / fuelCap(st.level)));
    const w = Math.max(14, art.width - 4);
    const x = Math.round(ax + (art.width - w) / 2);
    const y = ay - 6;
    px(c, x - 1, y - 1, w + 2, 5, HUD.frame);
    px(c, x, y, w, 3, HUD.empty);
    if (frac > 0) px(c, x, y, Math.max(1, Math.round(w * frac)), 3, frac > 0.5 ? HUD.friend : frac > 0.2 ? HUD.build : HUD.foe);
    else if (Math.floor(t * 2) % 2) px(c, x, y, w, 3, HUD.foe);
    px(c, x, y, Math.max(0, Math.round(w * frac)), 1, HUD.level); // its lit top edge
  }

  // Earthworks under way: the tile opened to raw earth (or heaped with it,
  // for a fill), a spade's worth more each hour, and a bar of the work done.
  for (const job of s.earthworks ?? []) {
    const X = (job.tile % MAP_W) * TILE;
    const Y = Math.floor(job.tile / MAP_W) * TILE;
    if (!inView(X, Y)) continue;
    const need = job.kind === "dig" ? DIG_HOURS : FILL_HOURS;
    const f = Math.min(1, job.progress / need);
    const ramp = job.kind === "dig" ? M.DIRT : M.SAND;
    for (let yy = 0; yy < TILE; yy++) px(c, X, Y + yy, TILE, 1, ramp[yy % 3 === 0 ? LIT : yy < TILE * f ? SHADE : MID]);
    if (job.kind === "dig" && f > 0.5) px(c, X + 2, Y + 3, TILE - 4, 2, M.WATER[DEEP]); // water seeping in
    px(c, X, Y - 4, TILE, 3, HUD.frame);
    px(c, X + 1, Y - 3, Math.max(1, Math.round((TILE - 2) * f)), 1, job.kind === "dig" ? HUD.build : "#6ab0e0");
  }

  // The town hall's reach: where homes and schools may stand. Shown while
  // one is being placed, and while the hall is selected.
  const hallSt = s.structures.find((x) => x.type === "townhall");
  if (hallSt && (ov.ghost?.type === "house" || ov.ghost?.type === "school" || ov.selected === hallSt.id)) {
    const cx = (hallSt.x + hallSt.w / 2) * TILE;
    const cy = (hallSt.y + hallSt.h / 2) * TILE;
    const r = hallRadius(hallSt.level) * TILE;
    const n = Math.round(r * 2 * Math.PI);
    const crawl = Math.floor(t * 6);
    for (let i = 0; i < n; i++) {
      if ((i + crawl) % 8 >= 5) continue;
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      px(c, x, y + 1, 1, 1, E.VOID[3]);
      px(c, x, y, 1, 1, E.VOID[1]);
    }
  }

  // Watchtower circles: where guards will come out. Always while a raid is
  // on, for the selected tower, and for a tower being placed. Gold if guards
  // are posted there, red if nobody is.
  const rings: { cx: number; cy: number; r: number; pr?: number; manned: boolean; inside: number }[] = [];
  const insideAt = new Map<number, number>();
  for (const u of s.raid?.combatants ?? []) if (u.inside && u.post !== undefined && u.hp > 0) insideAt.set(u.post, (insideAt.get(u.post) ?? 0) + 1);
  for (const st of s.structures) {
    if (!isGuardPost(st) || st.buildUntil) continue;
    if (!s.raid && ov.selected !== st.id) continue;
    const manned = s.villagers.some((v) => v.guard === st.id);
    rings.push({ cx: (st.x + st.w / 2) * TILE, cy: (st.y + st.h / 2) * TILE, r: alertRadius(st) * TILE, pr: passiveRadius(st) * TILE, manned, inside: insideAt.get(st.id) ?? 0 });
  }
  if (ov.ghost?.type === "watchtower" || ov.ghost?.type === "armypoint") {
    const g = ov.ghost;
    rings.push({ cx: (g.x + g.w / 2) * TILE, cy: (g.y + g.h / 2) * TILE, r: (g.type === "armypoint" ? 12 : 10) * TILE, manned: true, inside: 0 });
  }
  for (const ring of rings) {
    const col = ring.manned ? E.AMBER : E.BLOOD;
    // The outer circle: sparse dashes. Guards come out to it only for
    // something attacking a building or the wall.
    if (ring.pr) {
      const np = Math.max(48, Math.round(ring.pr * 2 * Math.PI));
      const crawlP = Math.floor(t * 3);
      for (let i = 0; i < np; i++) {
        if ((i + crawlP) % 12 >= 3) continue;
        const a = (i / np) * Math.PI * 2;
        px(c, Math.round(ring.cx + Math.cos(a) * ring.pr), Math.round(ring.cy + Math.sin(a) * ring.pr), 1, 1, col[2]);
      }
    }
    // A continuous dashed line (5 on, 3 off) with a dark edge outside it, so
    // it reads as a boundary rather than more flowers in the grass.
    const n = Math.max(48, Math.round(ring.r * 2 * Math.PI));
    const crawl = Math.floor(t * 6);
    for (let i = 0; i < n; i++) {
      if ((i + crawl) % 8 >= 5) continue;
      const a = (i / n) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      px(c, Math.round(ring.cx + cos * (ring.r + 1)), Math.round(ring.cy + sin * (ring.r + 1)), 1, 1, col[3]);
      px(c, Math.round(ring.cx + cos * ring.r), Math.round(ring.cy + sin * ring.r), 1, 1, col[1]);
    }
    if (ring.inside) {
      // guards waiting inside: a shield and their number over the tower
      const bx = Math.round(ring.cx) - 6;
      const by = Math.round(ring.cy) - 40;
      px(c, bx, by, 13, 7, HUD.frame);
      px(c, bx + 1, by + 1, 3, 4, col[2]);
      px(c, bx + 2, by + 5, 1, 1, col[2]);
      text(c, String(ring.inside), bx + 5, by + 1, HUD.select[0]);
    }
  }

  if (ov.tile !== null) {
    c.strokeStyle = HUD.select[Math.floor(t * 3) % 2];
    c.lineWidth = 1 / cam.zoom;
    c.strokeRect((ov.tile % MAP_W) * TILE + 0.5, Math.floor(ov.tile / MAP_W) * TILE + 0.5, TILE - 1, TILE - 1);
  }
  if (ov.ghost) {
    const g = ov.ghost;
    c.fillStyle = g.ok ? "rgba(90,220,120,0.28)" : "rgba(240,70,60,0.32)";
    c.fillRect(g.x * TILE, g.y * TILE, g.w * TILE, g.h * TILE);
    if (g.art) {
      c.globalAlpha = 0.6;
      c.drawImage(g.art, g.x * TILE + Math.round((g.w * TILE - g.art.width) / 2), (g.y + g.h) * TILE - g.art.height);
      c.globalAlpha = 1;
    }
  }
  if (ov.paint) {
    c.fillStyle = !ov.paint.ok ? "rgba(240,70,60,0.35)" : ov.paint.kind === "dig" ? "rgba(150,100,60,0.45)" : ov.paint.kind === "fill" ? "rgba(90,160,220,0.4)" : "rgba(232,200,96,0.35)";
    for (const i of ov.paint.tiles) c.fillRect((i % MAP_W) * TILE, Math.floor(i / MAP_W) * TILE, TILE, TILE);
  }
  if (ov.hover && !ov.ghost && !ov.paint) {
    c.strokeStyle = "rgba(255,255,255,0.35)";
    c.lineWidth = 1 / cam.zoom;
    c.strokeRect(ov.hover[0] * TILE + 0.5, ov.hover[1] * TILE + 0.5, TILE - 1, TILE - 1);
  }
  c.restore();

  const rainy = clk.season === "spring" && hash(clk.day, 9, 9) > 0.55;
  weather(c, clk, t, rainy);
  environment(c, s, cam, clk, t, rainy);
}

// ── Weather and light ─────────────────────────────────────

/** Particles only: the season's colour cast is part of the grade, not a layer. */
function weather(c: Ctx, clk: Clock, t: number, rainy: boolean) {
  if (clk.season === "winter") {
    for (let i = 0; i < 140; i++) {
      const x = (hash(i, 1, 1) * VIEW_W + Math.sin(t * 0.7 + i) * 8 + t * 6) % VIEW_W;
      const y = (hash(i, 2, 1) * VIEW_H + t * (14 + hash(i, 3, 1) * 16)) % VIEW_H;
      const near = hash(i, 4, 1) > 0.7;
      px(c, x, y, 2, near ? 2 : 1, M.LINEN[near ? LIT : MID]);
    }
  } else if (clk.season === "autumn") {
    for (let i = 0; i < 40; i++) {
      const x = (hash(i, 1, 2) * VIEW_W + t * 18 + Math.sin(t + i) * 10) % VIEW_W;
      const y = (hash(i, 2, 2) * VIEW_H + t * 12) % VIEW_H;
      const leaf = [M.OCHRE, M.CLAY, M.BRASS][i % 3];
      px(c, x, y, 2, 1, leaf[MID]);
      px(c, x + 1, y + 1, 1, 1, leaf[SHADE]);
    }
  } else if (clk.season === "spring") {
    if (rainy) {
      for (let i = 0; i < 90; i++) {
        const x = (hash(i, 1, 3) * VIEW_W + t * 30) % VIEW_W;
        const y = (hash(i, 2, 3) * VIEW_H + t * 180) % VIEW_H;
        px(c, x, y, 1, 4, M.GLASS[LIT]);
      }
    } else {
      for (let i = 0; i < 26; i++) {
        const x = (hash(i, 1, 4) * VIEW_W + t * 10 + Math.sin(t * 1.3 + i) * 12) % VIEW_W;
        const y = (hash(i, 2, 4) * VIEW_H + t * 8) % VIEW_H;
        px(c, x, y, 2, 1, M.ARCANE[LIT]);
      }
    }
  } else if (clk.night) {
    // fireflies carry their own light
    for (let i = 0; i < 24; i++) {
      if (Math.sin(t * 2 + i * 1.7) < 0.4) continue;
      px(c, hash(i, 1, 5) * VIEW_W + Math.sin(t + i) * 6, hash(i, 2, 5) * VIEW_H + Math.cos(t * 0.8 + i) * 4, 1, 1, E.BILE[1]);
    }
  }
}

const SEASON: Record<Clock["season"], Grade> = { spring: GRADES.DAY, summer: GRADES.SUMMER, autumn: GRADES.AUTUMN, winter: GRADES.WINTER };
let lightBuf: Uint8Array | null = null;

/**
 * The frame's grade: the season, darkened toward night in quarter steps,
 * the fog of a rainy day, and the red of an alarm. At night every fire,
 * forge, lit hall and flying bolt stamps its rings of light, and those rings
 * are graded with firelight instead of dark.
 */
function environment(c: Ctx, s: GameState, cam: Camera, clk: Clock, t: number, rainy: boolean) {
  const season = rainy ? mix(SEASON.spring, GRADES.FOG, 0.6) : SEASON[clk.season];
  const dark = Math.round(clk.darkness * 4) / 4;
  let base = season;
  if (dark > 0) base = then(base, mix(GRADES.DAY, GRADES.NIGHT, dark));
  const raid = !!s.raid?.started;
  if (raid) base = then(base, GRADES.RAID);
  if (dark === 0) {
    applyEnvironmentLighting(c, VIEW_W, VIEW_H, [base], undefined, PROTECT, MUTED);
    return;
  }
  if (!lightBuf) lightBuf = new Uint8Array(VIEW_W * VIEW_H);
  lightBuf.fill(0);
  const light = (wx: number, wy: number, r: number) => {
    // flicker in whole pixels, a few times a second
    const rr = Math.round(r * cam.zoom + (hash(Math.floor(t * 5), Math.round(wx), 3) > 0.5 ? 1 : 0));
    stampLight(lightBuf!, VIEW_W, VIEW_H, (wx - cam.x) * cam.zoom, (wy - cam.y) * cam.zoom, rr);
  };
  for (const st of s.structures) {
    if (st.buildUntil) continue;
    const cx = (st.x + st.w / 2) * TILE;
    const cy = (st.y + st.h / 2) * TILE;
    // Fires, braziers and lamps light exactly the ground they protect.
    const reach = lightRange(st);
    if (reach > 0) light(cx, cy, reach * TILE);
    else if (st.type === "forge" || st.type === "refinery") light(cx, cy, 26);
    else if (st.type === "townhall") light(cx, cy + 10, 38);
    else if (st.type === "house" || st.type === "apartment" || st.type === "kitchen" || st.type === "school" || st.type === "laboratory" || st.type === "fishery") light(cx, cy, 13);
    else if (st.type === "watchtower" || st.type === "wizardhut") light(cx, cy - 8, 15);
  }
  if (raid) for (const p of s.raid!.projectiles) light((p.x + (p.tx - p.x) * p.t) * TILE, (p.y + (p.ty - p.y) * p.t) * TILE, 8);
  let lit = then(season, GRADES.FIRELIGHT);
  if (raid) lit = then(lit, GRADES.RAID);
  applyEnvironmentLighting(c, VIEW_W, VIEW_H, [base, mix(base, lit, 0.5), lit], lightBuf, PROTECT, MUTED);
}

// ── Minimap ───────────────────────────────────────────────

const MINI_COLORS: Record<number, string> = { 0: "#4f6e44", 1: "#3a6280", 2: "#9a8e80", 3: "#2c4634", 4: "#b8a88a" };

/** The minimap in winter: ice for grass, bank and forest floor outside the fires' warmth. */
const MINI_ICE: Record<number, string> = { 0: "#9cc4d6", 1: "#2c6aa6", 2: "#8a94a4", 3: "#6f93a8", 4: "#9cc4d6" };

/** The minimap's window onto the map, in tiles. It shows this much at a time, and can be dragged. */
export const MINI_W = 120;
export const MINI_H = 80;

/**
 * The minimap: a window onto the map, one pixel a tile, starting at
 * `origin`. Unseen ground is dark, ground seen before is dimmed, and only
 * what the town can see now shows its monsters.
 */
export function drawMinimap(c: Ctx, s: GameState, cam: Camera, origin: [number, number]) {
  c.imageSmoothingEnabled = false;
  const [ox, oy] = origin;
  const warm = clock(s.time).season === "winter" ? warmFields(s) : null;
  const vis = visionMap(s);
  const img = c.createImageData(MINI_W, MINI_H);
  const out = new Uint32Array(img.data.buffer);
  for (let y = 0; y < MINI_H; y++) {
    for (let x = 0; x < MINI_W; x++) {
      const tx = ox + x;
      const ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) {
        out[y * MINI_W + x] = 0xff100e14;
        continue;
      }
      const i = ty * MAP_W + tx;
      const v = vis[i];
      if (v === UNSEEN) {
        out[y * MINI_W + x] = 0xff2a2622;
        continue;
      }
      const o = s.map.overlay[i];
      const iced = !!warm && !warmAt(warm, [tx + 0.5, ty + 0.5]);
      const hex = o === Overlay.Lair ? "#6a4a80" : o === Overlay.Wall || o === Overlay.Gate ? "#c4c0b8" : o === Overlay.Tree ? "#34583a" : o === Overlay.Rock ? "#747480" : o === Overlay.Debris ? "#5a4230" : (iced ? MINI_ICE : MINI_COLORS)[s.map.terrain[i]];
      let rgb = parseInt(hex.slice(1), 16);
      if (v === MAPPED) rgb = ((rgb >> 1) & 0x7f7f7f) + 0x141414; // dimmed: seen, not watched
      out[y * MINI_W + x] = (0xff000000 | ((rgb & 255) << 16) | (rgb & 0xff00) | (rgb >>> 16)) >>> 0;
    }
  }
  c.putImageData(img, 0, 0);
  for (const st of s.structures) {
    c.fillStyle = st.type === "townhall" ? "#e8c860" : st.type === "farm" || st.type === "waterfarm" ? "#a88e48" : "#d8d2c4";
    c.fillRect(st.x - ox, st.y - oy, st.w, st.h);
  }
  for (const l of s.lairs ?? []) {
    if (!l.discovered) continue;
    c.fillStyle = "#b060e0";
    c.fillRect(l.x - ox, l.y - oy, l.w, l.h);
  }
  c.fillStyle = "#e05040";
  for (const b of s.roamers ?? []) if (vis[Math.floor(b.y) * MAP_W + Math.floor(b.x)] === VISIBLE) c.fillRect(Math.floor(b.x) - ox, Math.floor(b.y) - oy, 2, 2);
  if (s.raid?.started) for (const u of s.raid.combatants) if (u.side === "monster" && u.hp > 0) c.fillRect(Math.floor(u.x) - ox, Math.floor(u.y) - oy, 2, 2);
  c.fillStyle = "#ffe08a";
  for (const v of s.villagers) if (v.scout) c.fillRect(Math.floor(v.scout.x) - ox, Math.floor(v.scout.y) - oy, 1, 1);
  c.strokeStyle = "#fff";
  c.lineWidth = 1;
  c.strokeRect(cam.x / TILE - ox + 0.5, cam.y / TILE - oy + 0.5, VIEW_W / cam.zoom / TILE, VIEW_H / cam.zoom / TILE);
}

// ── Fog ───────────────────────────────────────────────────

/*
 * Fog, not cloud: a pale, flat bank that thickens gradually away from what
 * the town can see — clear, then a thin haze a tile or two deep, then fog
 * too thick to see through by four tiles out. Ground seen before is never
 * lost in the thick of it: it keeps a light haze. The thickness is a smooth
 * field; each pixel is fog or clear by an ordered dither against it, so the
 * edge reads as mist in the 16-bit way, not a stamped texture. A slow,
 * wide swell in the field keeps the bank from looking ruled.
 *
 * It is painted in the same 32-tile chunks as the world and kept: a chunk is
 * repainted only when what the town sees changes near it. A frame draws a
 * handful of images, whatever the zoom.
 */

/** The fog's two shades: close in value, cool and grey — a bank, not smoke. */
const FOG_LIGHT = "#878c93";
const FOG_BODY = "#7e838a";
/** Thickness of fog over ground seen before but not watched now. */
const HAZE = 0.42;
/** Tiles over which the fog thickens from clear to solid. */
const FOG_DEPTH = 4;
/** Ordered-dither thresholds, 4×4. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Value noise with smooth steps between its lattice points: soft swells, no blocks. */
function smoothNoise(x: number, y: number, cell: number, seed: number) {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, seed);
  const b = hash(gx + 1, gy, seed);
  const c = hash(gx, gy + 1, seed);
  const d = hash(gx + 1, gy + 1, seed);
  const top = a + (b - a) * sx;
  return top + (c + (d - c) * sx - top) * sy;
}

interface FogChunk {
  vis: Uint8Array;
  night: boolean;
  cv: HTMLCanvasElement;
}

/** At night the bank darkens with distance from the hall: grey by the town, near black out in the wilds. */
const FOG_NIGHT_NEAR = "#4b4e53";
const FOG_NIGHT_FAR = "#1d1f22";
/** Tiles past the hall's reach over which the night fog darkens fully. */
const NIGHT_FADE = 70;
const fogChunks = new Map<number, FogChunk>();
let fogField: { vis: Uint8Array; field: Float32Array } | null = null;

/**
 * Fog thickness per tile, 0 to 1: distance to the nearest tile in sight,
 * run through a two-pass chamfer over the whole map, capped at FOG_DEPTH;
 * ground seen before is held to the haze. Recomputed only when sight does.
 */
function fogThickness(vis: Uint8Array): Float32Array {
  if (fogField?.vis === vis) return fogField.field;
  const n = MAP_W * MAP_H;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = vis[i] === VISIBLE ? 0 : FOG_DEPTH;
  const D = 1.41;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - MAP_W] + 1);
        if (x > 0) v = Math.min(v, d[i - MAP_W - 1] + D);
        if (x < MAP_W - 1) v = Math.min(v, d[i - MAP_W + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = MAP_H - 1; y >= 0; y--) {
    for (let x = MAP_W - 1; x >= 0; x--) {
      const i = y * MAP_W + x;
      let v = d[i];
      if (x < MAP_W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < MAP_H - 1) {
        v = Math.min(v, d[i + MAP_W] + 1);
        if (x < MAP_W - 1) v = Math.min(v, d[i + MAP_W + 1] + D);
        if (x > 0) v = Math.min(v, d[i + MAP_W - 1] + D);
      }
      d[i] = v;
    }
  }
  const field = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let f = Math.min(1, d[i] / FOG_DEPTH);
    if (vis[i] === MAPPED) f = Math.min(f, HAZE);
    field[i] = f;
  }
  fogField = { vis, field };
  return field;
}

/** Paints one chunk of fog: the thickness field, bilinear between tile centres, dithered. */
function paintFogChunk(field: Float32Array, cx: number, cy: number, night: { x: number; y: number; r: number } | null): HTMLCanvasElement {
  const { cv, c } = makeCanvas(CHUNK_PX, CHUNK_PX);
  const img = c.createImageData(CHUNK_PX, CHUNK_PX);
  const out = new Uint32Array(img.data.buffer);
  const toPx = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return (0xff000000 | ((v & 255) << 16) | (v & 0xff00) | (v >>> 16)) >>> 0;
  };
  const light = toPx(FOG_LIGHT);
  const body = toPx(FOG_BODY);
  const nearN = toPx(FOG_NIGHT_NEAR);
  const farN = toPx(FOG_NIGHT_FAR);
  const F = (tx: number, ty: number) => field[Math.max(0, Math.min(MAP_H - 1, ty)) * MAP_W + Math.max(0, Math.min(MAP_W - 1, tx))];
  const X0 = cx * CHUNK_PX;
  const Y0 = cy * CHUNK_PX;
  for (let y = 0; y < CHUNK_PX; y++) {
    const wy = (Y0 + y) / TILE - 0.5;
    const ty = Math.floor(wy);
    const fy = wy - ty;
    for (let x = 0; x < CHUNK_PX; x++) {
      const wx = (X0 + x) / TILE - 0.5;
      const tx = Math.floor(wx);
      const fx = wx - tx;
      const top = F(tx, ty) + (F(tx + 1, ty) - F(tx, ty)) * fx;
      const bot = F(tx, ty + 1) + (F(tx + 1, ty + 1) - F(tx, ty + 1)) * fx;
      let f = top + (bot - top) * fy;
      if (f <= 0) continue;
      // a wide, slow swell in the bank, so its edge is never a ruled circle
      const wX = X0 + x;
      const wY = Y0 + y;
      const swell = smoothNoise(wX, wY, 48, 83) * 0.65 + smoothNoise(wX, wY, 20, 84) * 0.35;
      if (f < 1) f = Math.max(0, Math.min(1, f + (swell - 0.5) * 0.28));
      const b = BAYER[(y & 3) * 4 + (x & 3)];
      if (f < b) continue;
      if (night) {
        // by night: the further from the hall, the darker, dithered between two shades
        const far = Math.max(0, Math.min(1, (Math.hypot(wX / TILE - night.x, wY / TILE - night.y) - night.r) / NIGHT_FADE));
        out[y * CHUNK_PX + x] = far > BAYER[((y + 2) & 3) * 4 + ((x + 1) & 3)] ? farN : nearN;
        continue;
      }
      // the brighter shade only as a sparse, dithered sheen where the bank swells
      out[y * CHUNK_PX + x] = (swell - 0.5) * 2.2 > b ? light : body;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

function drawFog(c: Ctx, s: GameState, cam: Camera, isNight: boolean) {
  const vis = visionMap(s);
  const hall = s.structures.find((x) => x.type === "townhall");
  const night = isNight && hall ? { x: hall.x + hall.w / 2, y: hall.y + hall.h / 2, r: hallRadius(hall.level) } : null;
  const vw = VIEW_W / cam.zoom;
  const vh = VIEW_H / cam.zoom;
  const cx0 = Math.max(0, Math.floor(cam.x / CHUNK_PX));
  const cy0 = Math.max(0, Math.floor(cam.y / CHUNK_PX));
  const cx1 = Math.min(Math.ceil(MAP_W / CHUNK) - 1, Math.floor((cam.x + vw) / CHUNK_PX));
  const cy1 = Math.min(Math.ceil(MAP_H / CHUNK) - 1, Math.floor((cam.y + vh) / CHUNK_PX));
  let budget = CHUNK_BUDGET + 1;
  let field: Float32Array | null = null;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const id = cy * 4096 + cx;
      let fc = fogChunks.get(id);
      if (!fc || fc.vis !== vis || fc.night !== !!night) {
        if (budget > 0 || !fc) {
          budget -= 1;
          field ??= fogThickness(vis);
          fc = { vis, night: !!night, cv: paintFogChunk(field, cx, cy, night) };
          fogChunks.delete(id);
          fogChunks.set(id, fc);
          while (fogChunks.size > CHUNK_KEEP) fogChunks.delete(fogChunks.keys().next().value!);
        }
      }
      c.drawImage(fc.cv, cx * CHUNK_PX, cy * CHUNK_PX);
    }
  }
}

