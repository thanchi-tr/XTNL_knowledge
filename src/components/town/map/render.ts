import { makeCanvas, px, hash, type Ctx } from "../art/core";
import { M, E, EMISSIVE, LIT, MID, SHADE, DEEP, shift, shiftRgb, type Ramp4 } from "../art/materials";
import { grass, cobbles, sandBank, iceField } from "../art/textures";
import { frosted, type FrostMode } from "../art/winter";
import { storehouse, armySchool, armyPoint } from "../art/buildings3";
import { GRADES, then, mix, isIdentity, stampLight, applyEnvironmentLighting, type Grade } from "./lighting";
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
import { alertRadius, fuelCap, growsInWinter, hallRadius, isGuardPost, lightRange, reachAt, unlitBuildings, warmAt, warmFields, type Warmth } from "@/lib/town/sim/world";
import { TILE_WOOD, TREE_EFFORT, treeStage } from "@/lib/town/sim/woods";
import { text } from "../pixel";
import { MAP_H, MAP_W, Overlay, TILE, Terrain, type Combatant, type GameState, type Structure } from "@/lib/town/sim/types";
import { CATALOG } from "@/lib/town/sim/catalog";
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
    case "house": return townhouse(st.id % 6, roof, true);
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

let sheetCache: {
  cobble: HTMLCanvasElement; grassC: HTMLCanvasElement; sandC: HTMLCanvasElement; iceC: HTMLCanvasElement; slushC: HTMLCanvasElement;
} | null = null;

function sheets() {
  if (!sheetCache) {
    const make = (draw: (c: Ctx) => void) => {
      const { cv, c } = makeCanvas(WORLD_W, WORLD_H);
      draw(c);
      return cv;
    };
    sheetCache = {
      // Warm packed-earth cobbles: roads must read as ground you walk on,
      // clearly apart from the cool grey of walls.
      cobble: make((c) => cobbles(c, 0, 0, WORLD_W, WORLD_H, 3, M.ROAD)),
      grassC: make((c) => grass(c, 0, 0, WORLD_W, WORLD_H, 5)),
      sandC: make((c) => sandBank(c, 0, 0, WORLD_W, WORLD_H, 6)),
      // Winter: field ice, and the roads trodden into grey slush.
      iceC: make((c) => iceField(c, 0, 0, WORLD_W, WORLD_H, 8)),
      slushC: make((c) => cobbles(c, 0, 0, WORLD_W, WORLD_H, 3, M.SLUSH)),
    };
  }
  return sheetCache;
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
function composeGround(c: Ctx, s: GameState, shadows: [number, number, number][], warm: Warmth[] | null) {
  const { cobble, grassC, sandC, iceC, slushC } = sheets();
  const pixels = (cv: HTMLCanvasElement) => new Uint32Array(cv.getContext("2d")!.getImageData(0, 0, WORLD_W, WORLD_H).data.buffer);
  const G = pixels(grassC);
  const Rd = pixels(cobble);
  const Sd = pixels(sandC);
  const Ic = warm ? pixels(iceC) : G;
  const Sl = warm ? pixels(slushC) : Rd;
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
  const img = c.createImageData(WORLD_W, WORLD_H);
  const out = new Uint32Array(img.data.buffer);
  const { terrain } = s.map;
  const T = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : terrain[ty * MAP_W + tx]);
  const W = M.WATER.map(hexPixel);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
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
          const i = Y * WORLD_W + X;
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
    if (y < 0 || y >= WORLD_H) continue;
    for (let xx = Math.max(0, x); xx < Math.min(WORLD_W, x + w); xx++) {
      const i = y * WORLD_W + xx;
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

export interface World {
  cv: HTMLCanvasElement;
  occluders: Occluder[];
}

/**
 * Paints the static world. Called only when `worldKey` changes: a build, an
 * upgrade, a cleared tile, a painted road, a wall knocked down.
 */
export function composeWorld(s: GameState, arch: TownProfile["archetype"]): World {
  const { cv, c } = makeCanvas(WORLD_W, WORLD_H);
  const { terrain, overlay, meta } = s.map;
  // Winter: snow on every roof and cap, warm or not; ice on the ground
  // everywhere a pit fire does not reach.
  const winter = clock(s.time).season === "winter";
  const warm = winter ? warmFields(s) : null;
  const dress = (img: HTMLCanvasElement, mode: FrostMode = "roof") => (winter ? frosted(img, mode) : img);

  // Everything upright, back to front; their shadows go into the ground pass.
  const shadows: [number, number, number][] = [];
  const items: { base: number; draw: () => void }[] = [];
  const occluders: Occluder[] = [];
  const upright = (img: HTMLCanvasElement, x: number, y: number, base: number) => {
    const o = { img, x: Math.round(x), y: Math.round(y), base };
    occluders.push(o);
    items.push({ base, draw: () => c.drawImage(img, o.x, o.y) });
  };
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
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
        upright(tree, X + TILE / 2 - tree.width / 2 + Math.round((hash(x, y, 2) - 0.5) * 4), Y + TILE - tree.height + (left >= 0.5 ? 0 : 1), Y + TILE);
        continue;
      }
      const o = overlay[i];
      if (o === Overlay.Tree) {
        const tree = dress(tileTree(meta[i]), "tree");
        if (treeStage(meta[i]) >= 2) castRows(shadows, X - 2, Y + TILE - 2, 10, 3);
        upright(tree, X + TILE / 2 - tree.width / 2, Y + TILE - tree.height + 2, Y + TILE);
      } else if (o === Overlay.Rock) {
        upright(dress(rockNode(meta[i], i % 3), "cap"), X - 2, Y - 2, Y + TILE);
      } else if (o === Overlay.Debris) {
        items.push({ base: Y + 1, draw: () => c.drawImage(debris(i % 5), X, Y) });
      } else if (o === Overlay.Wall || o === Overlay.Gate) {
        const n = overlay[i - MAP_W] === Overlay.Wall || overlay[i - MAP_W] === Overlay.Gate;
        const sb = overlay[i + MAP_W] === Overlay.Wall || overlay[i + MAP_W] === Overlay.Gate;
        const tileArt = dress(wallTile(n, sb, o === Overlay.Gate), "cap");
        upright(tileArt, X, Y + TILE - tileArt.height, Y + TILE);
      }
    }
  }
  for (const st of s.structures) {
    const bare = structureArt(st, arch);
    if (!bare) continue;
    const art = dress(bare);
    const [ax, ay] = artAnchor(st, art);
    castRows(shadows, ax + 4, (st.y + st.h) * TILE - 3, art.width - 8, 6);
    upright(st.buildUntil ? unbuilt(art) : art, ax, ay, (st.y + st.h) * TILE);
  }

  composeGround(c, s, shadows, warm);
  // Farm fields sit flat on the ground, under everything else.
  const frozenAt = (st: Structure) => !!warm && !warmAt(warm, [st.x + st.w / 2, st.y + st.h / 2]);
  // In winter a field the fire keeps open still stands bare unless it is potatoes.
  for (const st of s.structures) if (st.type === "farm" || st.type === "waterfarm") drawField(c, st, frozenAt(st), winter && !growsInWinter(st));
  items.sort((a, b) => a.base - b.base).forEach((it) => it.draw());
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
const PROTECT = new Set<number>([...EMISSIVE, ...[HUD.frame, HUD.empty, HUD.friend, HUD.foe, HUD.build, ...HUD.select, HUD.level, HUD.legend, HUD.crit, HUD.hit].map((h) => parseInt(h.slice(1), 16))]);

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
  c.drawImage(world.cv, cam.x, cam.y, vw, vh, 0, 0, VIEW_W, VIEW_H);

  c.save();
  c.scale(cam.zoom, cam.zoom);
  c.translate(-cam.x, -cam.y);
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
    if (st.type === "kitchen" || st.type === "refinery" || st.type === "house") smoke(c, X + st.w * TILE - 8, Y - 16, t + st.id * 0.3, st.type === "refinery");
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
    const total = def.buildHours * 60 * Math.pow(st.level, st.level > 1 ? 1.3 : 0);
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
    for (const o of world.occluders) {
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
  const rings: { cx: number; cy: number; r: number; manned: boolean; inside: number }[] = [];
  const insideAt = new Map<number, number>();
  for (const u of s.raid?.combatants ?? []) if (u.inside && u.post !== undefined && u.hp > 0) insideAt.set(u.post, (insideAt.get(u.post) ?? 0) + 1);
  for (const st of s.structures) {
    if (!isGuardPost(st) || st.buildUntil) continue;
    if (!s.raid && ov.selected !== st.id) continue;
    const manned = s.villagers.some((v) => v.guard === st.id);
    rings.push({ cx: (st.x + st.w / 2) * TILE, cy: (st.y + st.h / 2) * TILE, r: alertRadius(st) * TILE, manned, inside: insideAt.get(st.id) ?? 0 });
  }
  if (ov.ghost?.type === "watchtower" || ov.ghost?.type === "armypoint") {
    const g = ov.ghost;
    rings.push({ cx: (g.x + g.w / 2) * TILE, cy: (g.y + g.h / 2) * TILE, r: (g.type === "armypoint" ? 12 : 10) * TILE, manned: true, inside: 0 });
  }
  for (const ring of rings) {
    const col = ring.manned ? E.AMBER : E.BLOOD;
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
    if (!isIdentity(base)) applyEnvironmentLighting(c, VIEW_W, VIEW_H, [base], undefined, PROTECT);
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
    else if (st.type === "house" || st.type === "kitchen" || st.type === "school" || st.type === "laboratory" || st.type === "fishery") light(cx, cy, 13);
    else if (st.type === "watchtower" || st.type === "wizardhut") light(cx, cy - 8, 15);
  }
  if (raid) for (const p of s.raid!.projectiles) light((p.x + (p.tx - p.x) * p.t) * TILE, (p.y + (p.ty - p.y) * p.t) * TILE, 8);
  let lit = then(season, GRADES.FIRELIGHT);
  if (raid) lit = then(lit, GRADES.RAID);
  applyEnvironmentLighting(c, VIEW_W, VIEW_H, [base, mix(base, lit, 0.5), lit], lightBuf, PROTECT);
}

// ── Minimap ───────────────────────────────────────────────

const MINI_COLORS: Record<number, string> = { 0: "#3f7a36", 1: "#2c6aa6", 2: "#a09080", 3: "#1f4e2c", 4: "#c8b086" };

/** The minimap in winter: ice for grass, bank and forest floor outside the fires' warmth. */
const MINI_ICE: Record<number, string> = { 0: "#9cc4d6", 1: "#2c6aa6", 2: "#8a94a4", 3: "#6f93a8", 4: "#9cc4d6" };

export function drawMinimap(c: Ctx, s: GameState, cam: Camera) {
  c.imageSmoothingEnabled = false;
  const warm = clock(s.time).season === "winter" ? warmFields(s) : null;
  for (let i = 0; i < s.map.terrain.length; i++) {
    const o = s.map.overlay[i];
    const tx = i % MAP_W;
    const ty = Math.floor(i / MAP_W);
    const iced = !!warm && !warmAt(warm, [tx + 0.5, ty + 0.5]);
    c.fillStyle = o === Overlay.Wall || o === Overlay.Gate ? "#d0ccc4" : o === Overlay.Tree ? "#265e30" : o === Overlay.Rock ? "#7a7888" : o === Overlay.Debris ? "#5a3a24" : (iced ? MINI_ICE : MINI_COLORS)[s.map.terrain[i]];
    c.fillRect(i % MAP_W, Math.floor(i / MAP_W), 1, 1);
  }
  for (const st of s.structures) {
    c.fillStyle = st.type === "townhall" ? "#ffd84a" : st.type === "farm" || st.type === "waterfarm" ? "#b89a3a" : "#e8e0d0";
    c.fillRect(st.x, st.y, st.w, st.h);
  }
  if (s.raid?.started) {
    c.fillStyle = "#ff3a2a";
    for (const u of s.raid.combatants) if (u.side === "monster" && u.hp > 0) c.fillRect(Math.floor(u.x), Math.floor(u.y), 2, 2);
  }
  c.strokeStyle = "#fff";
  c.lineWidth = 1;
  c.strokeRect(cam.x / TILE + 0.5, cam.y / TILE + 0.5, VIEW_W / cam.zoom / TILE, VIEW_H / cam.zoom / TILE);
}

