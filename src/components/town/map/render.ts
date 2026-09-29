import { cached, makeCanvas, outline, px, hash, type Ctx } from "../art/core";
import { redSky } from "@/lib/town/sim/menace";
import { M, E, EMISSIVE, LIT, MID, SHADE, DEEP, shift, shiftRgb, type Ramp4 } from "../art/materials";
import { grass, cobbles, sandBank, iceField, meadow, hillside, marsh, reedStand, flagstones, dunes, oasis, mesa, saltPan, skyClouds, bridgeDeck } from "../art/textures";
import { frosted, type FrostMode } from "../art/winter";
import { storehouse, lairArt, unitHome, rowHouse, duplexHome, apartmentBlock } from "../art/buildings3";
import { GRADES, then, mix, stampLight, applyEnvironmentLighting, type Grade } from "./lighting";
import { pine, oak, crop, youngTree, seedling, palm, cactus, type CropArt, birch, maple } from "../art/nature";
import { MARSH_KIND, wildCrop } from "@/lib/town/sim/forage";
import { townhouse, tower, mine, type RoofStyle } from "../art/buildings";
import {
  forge, barracks, armySchool, armyPoint, kitchen, school, refinery, laboratory, fishery, lumberCamp, armoury, wizardHut, anchorsOf, SPECIAL_TYPES, townHall, museum,
  alchemy, observatory, mythicLab,
} from "../art/special";
import {
  pitfire, watermill, drawWheel, archery, nobleYard,
  iceFactory, marketRow, wallTile, rockNode, debris, tileTree, lamppost, brazier, FIRE_MOUTH, BRAZIER_MOUTH,
} from "../art/buildings2";
import { grim, type MonsterArt } from "../art/sprites";
import { figure, troopLook, type Look } from "../art/heroes";
import { frameAt, isMythicArt, mythicSprite } from "../art/mythic";
import { artFacing, monsterFrame, type Pose } from "../art/monster-anim";
import { drawProjectile, legendaryAura, mythicAura, omenWeather } from "../art/fx";
import { statueSprite } from "../art/statues";
import { omenOf } from "@/lib/town/sim/omens";
import { heroEffect, hasAura, buildingAura, effectBadges } from "../art/effects";
import { bloodSigil, drawGlints, heroBanner, heroSigil, lightPillar, menaceSmoke } from "../art/menace";
import { CLASS_RAMP, heroAura, heroLevel, isChampionLook, isClassLook, isHeroLook } from "../art/heroes";
import type { Effect } from "@/lib/town/sim/effects";
import { DIG_HOURS, FILL_HOURS } from "@/lib/town/sim/catalog";
import { MAPPED, UNSEEN, VISIBLE, seesPoint, torchLit, visionMap } from "@/lib/town/sim/vision";
import { graded, orderedWall } from "../art/grades";
import { LAMP_CAP, alertRadius, fuelCap, growsInWinter, hallRadius, isGuardPost, lampFuel, passiveRadius, wallLevel, lightRange, reachAt, unlitBuildings, warmAt, warmFields, type Warmth, wallOrder } from "@/lib/town/sim/world";
import { mannerOf, type Manner } from "@/lib/town/sim/wilds";
import { TILE_WOOD, TREE_EFFORT, treeStage, treeFace, treeSpecies } from "@/lib/town/sim/woods";
import { text } from "../pixel";
import { icon } from "../art/icons";
import { MAP_H, MAP_W, MILITARY, Overlay, TILE, Terrain, type Combatant, type GameState, type Structure } from "@/lib/town/sim/types";
import { units as commandUnits } from "@/lib/town/sim/command";
import { biomeOf, iceWinter, type Biome } from "@/lib/town/sim/biomes";
import { air, type Regime } from "@/lib/town/sim/weather";
import { CATALOG, grade, homeTier, upgradeHours } from "@/lib/town/sim/catalog";
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
/**
 * The view's size in game pixels. Not fixed: the same budget of pixels
 * (480 × 320) is reshaped to the place it is shown in — 3:2 on a desk,
 * nearly square on a Fold's main screen, tall on its cover screen or any
 * phone held upright, and in full screen exactly the shape of the space
 * left — so a narrow screen shows a taller map rather than a thinner strip.
 * Live bindings: every reader sees the current size after `setView`.
 */
export let VIEW_W = 480;
export let VIEW_H = 320;
export const VIEW_AREA = 480 * 320;

export function setView(w: number, h: number) {
  if (w === VIEW_W && h === VIEW_H) return;
  VIEW_W = w;
  VIEW_H = h;
  // The light buffer is sized to the view.
  lightBuf = null;
}

/**
 * The view for a place on screen. In full screen, the stage's own shape.
 * Otherwise the map takes the height the screen has left under the bars
 * above it (`availH`, with room kept for the tool row below): tall on a
 * Fold's cover screen (down to 5:6), wide on its main screen or a short
 * desk window (up to 16:9) — so the tools stay on screen. Always even, always
 * the same number of pixels.
 */
export function viewFor(full: boolean, stageW: number, stageH: number, availH: number, area = VIEW_AREA): [number, number] {
  let aspect = 3 / 2;
  if (full && stageW > 0 && stageH > 0) aspect = stageW / stageH;
  else if (stageW > 0) aspect = Math.max(5 / 6, Math.min(16 / 9, stageW / Math.max(160, availH)));
  aspect = Math.max(0.45, Math.min(2.4, aspect));
  const w = 2 * Math.round(Math.sqrt(area * aspect) / 2);
  const h = 2 * Math.round(area / w / 2);
  return [w, h];
}

/**
 * On a desktop the view is sized from the screen it has, not a fixed budget:
 * about PX_TARGET screen (CSS) pixels to a game pixel — the size a pixel is in
 * the ordinary window — so going full screen, or maximising a big window,
 * shows more of the world rather than the same world blown up. Never less
 * than VIEW_AREA, never more than MAX_AREA (the light is graded pixel by
 * pixel); and TownGame backs `quality` off on a machine that cannot keep up.
 */
export const PX_TARGET = 1.75;
export const MAX_AREA = 520_000;
export const DESK_AREA = Math.round(VIEW_AREA * 1.6);
export function areaFor(cssW: number, cssH: number, quality = 1): number {
  const want = (cssW * cssH) / (PX_TARGET * PX_TARGET);
  return Math.round(Math.max(VIEW_AREA, Math.min(MAX_AREA, want) * quality));
}

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
    case "townhall": return townHall(L, roof, banner);
    case "museum": return museum(L, roof, banner);
    // A home by its tier: unit, house, townhouse, duplex.
    case "house": {
      const tier = homeTier(L);
      return tier === 0 ? unitHome(st.id, roof) : tier === 1 ? townhouse(st.id % 6, roof, true) : tier === 2 ? rowHouse(st.id, roof) : duplexHome(st.id, roof);
    }
    case "apartment": return apartmentBlock(L, roof, st.w >= st.h);
    case "pitfire": return pitfire(L);
    case "lamppost": return lamppost(lampFuel(st) > 0);
    case "laboratory": return laboratory(L, roof, banner);
    case "alchemy": return alchemy(L, roof, banner);
    case "observatory": return observatory(L, roof, banner);
    case "mythiclab": return mythicLab(L, roof, banner);
    case "fishery": return fishery(L, roof, banner);
    case "brazier": return brazier();
    case "school": return school(L, roof, banner);
    case "watermill": return watermill(L, roof);
    case "refinery": return refinery(L, roof, banner);
    case "kitchen": return kitchen(L, roof, banner);
    case "market": return marketRow(L);
    case "barracks": return barracks(L, roof, banner);
    case "archery": return archery(L, roof);
    case "armoury": return armoury(L, roof, banner);
    case "wizardhut": return wizardHut(L, banner);
    case "nobleyard": return nobleYard(L, banner);
    case "watchtower": return tower(L, false);
    case "icefactory": return iceFactory(L);
    case "mine": return mine(Math.min(5, L));
    case "lumbercamp": return lumberCamp(L, roof, banner);
    case "forge": return forge(L, roof, banner);
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

/** A stand of reeds for a marsh's wild plants, drawn once per look. */
function reedTuft(meta: number): HTMLCanvasElement {
  return cached(`reed:${meta % 3}`, () => {
    const { cv, c } = makeCanvas(8, 10);
    reedStand(c, 1, 1, meta);
    outline(cv);
    return cv;
  });
}

// ── Static layer ──────────────────────────────────────────

/**
 * Ground textures for one region of the world. Every texture is anchored to
 * world coordinates, so neighbouring regions meet without a seam, and none
 * is ever made larger than the region being drawn.
 */
type SheetKey = "G" | "Rd" | "Fl" | "Sd" | "Md" | "Hl" | "Ms" | "Ic" | "Sl" | "Dn" | "Oa" | "Mz" | "Sp" | "Sk" | "Br";
const SHEET_DRAW: Record<SheetKey, (c: Ctx, X0: number, Y0: number, W: number, H: number) => void> = {
  G: (c, X0, Y0, W, H) => grass(c, X0, Y0, W, H, 5),
  // Warm packed-earth cobbles: roads must read as ground you walk on,
  // clearly apart from the cool grey of walls.
  Rd: (c, X0, Y0, W, H) => cobbles(c, X0, Y0, W, H, 3, M.ROAD),
  // Stone flags: dressed slabs, swept clear even in winter.
  Fl: (c, X0, Y0, W, H) => flagstones(c, X0, Y0, W, H, 11),
  Sd: (c, X0, Y0, W, H) => sandBank(c, X0, Y0, W, H, 6),
  Md: (c, X0, Y0, W, H) => meadow(c, X0, Y0, W, H, 5),
  Hl: (c, X0, Y0, W, H) => hillside(c, X0, Y0, W, H, 5),
  Ms: (c, X0, Y0, W, H) => marsh(c, X0, Y0, W, H, 5),
  // Winter: field ice, and the roads trodden into grey slush.
  Ic: (c, X0, Y0, W, H) => iceField(c, X0, Y0, W, H, 8),
  Sl: (c, X0, Y0, W, H) => cobbles(c, X0, Y0, W, H, 3, M.SLUSH),
  // The desert (lib/town/sim/biomes): dunes, oasis green, mesa rock, salt pans.
  Dn: (c, X0, Y0, W, H) => dunes(c, X0, Y0, W, H, 5),
  Oa: (c, X0, Y0, W, H) => oasis(c, X0, Y0, W, H, 5),
  Mz: (c, X0, Y0, W, H) => mesa(c, X0, Y0, W, H, 5),
  Sp: (c, X0, Y0, W, H) => saltPan(c, X0, Y0, W, H, 5),
  // The floating isles: the sky below, and the bridges over it.
  Sk: (c, X0, Y0, W, H) => skyClouds(c, X0, Y0, W, H, 5),
  Br: (c, X0, Y0, W, H) => bridgeDeck(c, X0, Y0, W, H, 5),
};

/** Which sheet paints each ground on each map. */
function groundSheet(biome: Biome, mat: number): SheetKey {
  if (biome === "desert") {
    if (mat === Terrain.Meadow) return "Oa";
    if (mat === Terrain.Hill) return "Mz";
    if (mat === Terrain.Marsh) return "Sp";
    if (mat === Terrain.Bank) return "Sd";
    return "Dn";
  }
  return mat === Terrain.Bank ? "Sd" : mat === Terrain.Meadow ? "Md" : mat === Terrain.Hill ? "Hl" : mat === Terrain.Marsh ? "Ms" : "G";
}
/**
 * Ground sheets already painted, by region and kind. They depend on nothing
 * but where they are, so a chunk repainted because a tree grew or a house
 * went up reuses them; painting them afresh is most of what a chunk costs.
 */
const sheetCache = new Map<string, Uint32Array>();
const SHEET_KEEP = 96;

/**
 * Ground textures for one region of the world. Every texture is anchored to
 * world coordinates, so neighbouring regions meet without a seam, and none
 * is ever made larger than the region being drawn. Each is painted only when
 * a tile in the region asks for it, and kept.
 */
function regionSheets(X0: number, Y0: number, W: number, H: number) {
  const get = (k: SheetKey): Uint32Array => {
    const key = `${k}:${X0}:${Y0}:${W}:${H}`;
    let sheet = sheetCache.get(key);
    if (sheet) {
      sheetCache.delete(key);
      sheetCache.set(key, sheet);
      return sheet;
    }
    const { c } = makeCanvas(W, H);
    c.translate(-X0, -Y0);
    SHEET_DRAW[k](c, X0, Y0, W, H);
    sheet = new Uint32Array(c.getImageData(0, 0, W, H).data.buffer);
    sheetCache.set(key, sheet);
    while (sheetCache.size > SHEET_KEEP) sheetCache.delete(sheetCache.keys().next().value!);
    return sheet;
  };
  const memo: Partial<Record<SheetKey, Uint32Array>> = {};
  return (k: SheetKey) => (memo[k] ??= get(k));
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
  // The open sky lies under everything: every island's edge laps over it.
  [Terrain.Void]: -1,
  [Terrain.Water]: 0,
  [Terrain.Pavement]: 1,
  [Terrain.Bank]: 2,
  [Terrain.Marsh]: 3,
  [Terrain.Grass]: 4,
  [Terrain.Meadow]: 5,
  [Terrain.Hill]: 6,
  [Terrain.Forest]: 7,
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
  const tex = regionSheets(X0, Y0, RW, RH);
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
  const { terrain, paving, bridge } = s.map;
  const T = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : terrain[ty * MAP_W + tx]);
  const W = M.WATER.map(hexPixel);
  const biome = biomeOf(s);
  const ROCK = M.STONE.map(hexPixel);
  const EARTH = M.DIRT.map(hexPixel);
  const MIST = M.CLOUD.map(hexPixel);
  const land = (t: number) => t >= 0 && t !== Terrain.Void;

  const tx0 = Math.max(0, Math.floor(X0 / TILE));
  const ty0 = Math.max(0, Math.floor(Y0 / TILE));
  const tx1 = Math.min(MAP_W, Math.ceil((X0 + RW) / TILE));
  const ty1 = Math.min(MAP_H, Math.ceil((Y0 + RH) / TILE));
  const n = [0, 0, 0, 0];
  const dist = [0, 0, 0, 0];
  const along = [0, 0, 0, 0];
  const line = [0, 0, 0, 0];
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      const own = T(tx, ty);
      // N E S W
      n[0] = T(tx, ty - 1);
      n[1] = T(tx + 1, ty);
      n[2] = T(tx, ty + 1);
      n[3] = T(tx - 1, ty);
      // For water: how many whole tiles of water lie between this one and each bank.
      let west = 0;
      let east = 0;
      if (own === Terrain.Water) {
        while (west < 4 && T(tx - west - 1, ty) === Terrain.Water) west++;
        while (east < 4 && T(tx + east + 1, ty) === Terrain.Water) east++;
      }
      // Open sky under an island's edge: how many tiles down from the land, and whether water spills over it.
      let cliff = 0;
      let fall = false;
      if (own === Terrain.Void) {
        for (let k = 1; k <= 3; k++) {
          const up = T(tx, ty - k);
          // A bridge above is no island: nothing hangs under it.
          if (bridge?.[(ty - k) * MAP_W + tx]) break;
          if (land(up)) {
            cliff = k;
            fall = up === Terrain.Water;
            break;
          }
          if (up !== Terrain.Void) break;
        }
      }
      for (let yy = 0; yy < TILE; yy++) {
        for (let xx = 0; xx < TILE; xx++) {
          const X = tx * TILE + xx;
          const Y = ty * TILE + yy;
          dist[0] = yy;
          dist[1] = TILE - 1 - xx;
          dist[2] = TILE - 1 - yy;
          dist[3] = xx;
          along[0] = X;
          along[1] = Y;
          along[2] = X;
          along[3] = Y;
          line[0] = ty * TILE;
          line[1] = (tx + 1) * TILE;
          line[2] = (ty + 1) * TILE;
          line[3] = tx * TILE;
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
          if (mat === Terrain.Void) {
            // The sky, and under an island's edge its rocky underside, ragged at the bottom; water pouring off in a fall.
            px = tex("Sk")[i];
            if (cliff) {
              const depth = (cliff - 1) * TILE + yy;
              const bottom = 12 + Math.floor(hash(X >> 1, 3, 57) * 6) + (hash(X >> 3, 4, 59) > 0.6 ? 5 : 0);
              if (depth < bottom) {
                const streak = hash(X, 7, 61) > 0.7;
                px = depth < 3 ? EARTH[depth === 0 ? MID : SHADE] : depth >= bottom - 2 ? ROCK[DEEP] : ROCK[streak ? SHADE : depth < bottom / 2 ? MID : SHADE];
                if (depth < 6 && hash(X, depth, 63) > 0.93) px = EARTH[DEEP]; // a root hanging out of the earth
              }
              if (fall && depth < bottom + 22) {
                const col = hash(X >> 1, Math.floor((Y + depth) / 3), 67);
                px = depth > bottom + 14 ? MIST[col > 0.5 ? LIT : MID] : W[col > 0.8 ? LIT : col > 0.35 ? MID : SHADE];
              }
            }
          } else if (mat === Terrain.Water) {
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
            const at = Math.floor(Y / TILE) * MAP_W + Math.floor(X / TILE);
            const flags = mat === Terrain.Pavement && !!paving?.[at];
            const deck = mat === Terrain.Pavement && !!bridge?.[at];
            px = mat === Terrain.Pavement ? tex(deck ? "Br" : flags ? "Fl" : frozen ? "Sl" : "Rd")[i] : frozen ? tex("Ic")[i] : tex(groundSheet(biome, mat))[i];
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
const CHUNK_BUDGET = 1;
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
  const { terrain, overlay, meta, paving } = s.map;
  const clk = clock(s.time);
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
      const m = o === Overlay.Wall || o === Overlay.Gate ? wallOrder(wallLevel(meta[i])) : o === Overlay.Tree ? meta[i] + 1000 * treeFace(s, i, clk.season, clk.year) : o === Overlay.Rock || o === Overlay.Crop ? meta[i] : t === Terrain.Forest ? (meta[i] >= TILE_WOOD / 2 ? 3 : meta[i] >= TILE_WOOD / 5 ? 2 : meta[i] > TILE_WOOD / 20 ? 1 : 0) : 0;
      h = (h * 31 + t * 7 + o * 13 + m + (paving?.[i] ? 101 : 0)) | 0;
    }
  }
  const near = (x: number, y: number, w: number, hh: number) =>
    x + w >= cx * CHUNK - 12 && x <= (cx + 1) * CHUNK + 12 && y + hh >= cy * CHUNK && y <= (cy + 1) * CHUNK + 18;
  const sts = s.structures.filter((st) => near(st.x, st.y, st.w, st.h)).map((st) => `${st.id}:${st.type}:${st.level}:${st.mode ?? ""}:${st.buildUntil ? 1 : 0}`).join(",");
  const lairs = (s.lairs ?? []).filter((l) => near(l.x, l.y, l.w, l.h)).map((l) => `${l.id}`).join(",");
  return `${arch}|${h}|${sts}|${lairs}|${winterSig}|${clk.season}`;
}

/** The season's part of every chunk's key: whether it is winter, and where the fires keep the ice off. */
function winterSignature(s: GameState): string {
  if (!iceWinter(s, clock(s.time).season === "winter")) return "";
  return "w:" + warmFields(s).map((w) => `${w.id}:${w.r}:${w.far.toFixed(1)}`).join(";");
}

/**
 * Art made ahead of need, in the frame's spare time (TownGame calls it when
 * the browser is idle): every building's art, graded — and, from the second
 * half of autumn, frosted for the winter to come — then the chunks one ring
 * beyond the view. A first winter, a new corner of the map, a town of a
 * hundred buildings: none of it is drawn from nothing in the middle of a
 * frame, where a single cold chunk of the end game cost a third of a second.
 * Stops at `until` (performance.now()); picks up where it left off.
 */
let warmCursor = 0;
let warmKey = "";
export function warmAhead(world: World, s: GameState, arch: TownProfile["archetype"], cam: Camera, until: number): void {
  const clk = clock(s.time);
  const frostSoon = iceWinter(s, true) && (clk.season === "winter" || (clk.season === "autumn" && clk.seasonProgress > 0.5));
  const key = `${arch}:${clk.season}:${frostSoon}:${s.structures.length}:${s.structures.reduce((a, st) => a + st.level, 0)}`;
  if (key !== warmKey) {
    warmKey = key;
    warmCursor = 0;
  }
  while (warmCursor < s.structures.length) {
    if (performance.now() > until) return;
    const st = s.structures[warmCursor++];
    const plain = structureArt(st, arch);
    if (!plain) continue;
    const bare = graded(plain, grade(st.level), STYLE[arch].banner, st.level, SPECIAL_TYPES.has(st.type));
    if (frostSoon) frosted(bare, "roof");
  }
  const vw = VIEW_W / cam.zoom;
  const vh = VIEW_H / cam.zoom;
  const cx0 = Math.max(0, Math.floor(cam.x / CHUNK_PX) - 1);
  const cy0 = Math.max(0, Math.floor(cam.y / CHUNK_PX) - 1);
  const cx1 = Math.min(Math.ceil(MAP_W / CHUNK) - 1, Math.floor((cam.x + vw) / CHUNK_PX) + 1);
  const cy1 = Math.min(Math.ceil(MAP_H / CHUNK) - 1, Math.floor((cam.y + vh) / CHUNK_PX) + 2);
  const wsig = winterSignature(s);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (performance.now() > until) return;
      ensureChunk(world, s, arch, cx, cy, { left: 1 }, wsig);
    }
  }
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
  // Winter ices the ground only where winter freezes (the desert's does not).
  const winter = iceWinter(s, clock(s.time).season === "winter");
  const { season, year } = clock(s.time);
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
        const desert = biomeOf(s) === "desert";
        // A mixed stand: oak and pine, with birch and maple among them (the maples red in autumn).
        const grown = v === 2 ? birch(x % 8) : v === 5 ? maple(y % 4, season === "autumn") : v % 3 === 0 ? oak(v % 4) : pine(v % 3);
        const bare = desert ? (left >= 0.5 ? palm(v) : cactus(v, left >= 0.2 ? 2 : 1)) : left >= 0.5 ? grown : left >= 0.2 ? youngTree(v) : seedling(v);
        const tree = dress(bare, "tree");
        upright(tree, X + TILE / 2 - tree.width / 2 + Math.round((hash(x, y, 2) - 0.5) * 4), Y + TILE - tree.height + (left >= 0.5 ? 0 : 1), Y + TILE, X + TILE / 2);
        continue;
      }
      const o = overlay[i];
      if (o === Overlay.Tree) {
        // In the desert a lone tree on the sand is a cactus, its size by the tree's stage.
        // In the desert a lone tree on the sand is a cactus, its size by the tree's stage — or a date palm, grown.
        const face = treeFace(s, i, season, year);
        const palmTree = treeSpecies(meta[i]) === "date";
        const tree = dress(biomeOf(s) === "desert" && !palmTree ? cactus(meta[i] % 8, Math.min(3, treeStage(meta[i]))) : tileTree(meta[i], face), "tree");
        if (treeStage(meta[i]) >= 2) castRows(shadows, X - 2, Y + TILE - 2, 10, 3);
        upright(tree, X + TILE / 2 - tree.width / 2, Y + TILE - tree.height + 2, Y + TILE, X + TILE / 2);
      } else if (o === Overlay.Rock) {
        upright(dress(rockNode(meta[i], i % 3), "cap"), X - 2, Y - 2, Y + TILE, X + TILE / 2);
      } else if (o === Overlay.Crop) {
        // A wild patch: two plants of the crop, a little apart.
        const plant = dress(meta[i] >= MARSH_KIND ? reedTuft(meta[i]) : crop(wildCrop(meta[i]) as CropArt, 2), "tree");
        if (X + TILE > X0 && X < X0 + RW && Y + TILE > Y0 && Y < Y0 + RH) {
          items.push({ base: Y + TILE - 1, draw: () => {
            c.drawImage(plant, X, Y);
            c.drawImage(plant, X + 3, Y - 1);
          } });
        }
      } else if (o === Overlay.Debris) {
        if (X + TILE > X0 && X < X0 + RW && Y + TILE > Y0 && Y < Y0 + RH) items.push({ base: Y + 1, draw: () => c.drawImage(debris(i % 5), X, Y) });
      } else if (o === Overlay.Wall || o === Overlay.Gate) {
        const n = overlay[i - MAP_W] === Overlay.Wall || overlay[i - MAP_W] === Overlay.Gate;
        const sb = overlay[i + MAP_W] === Overlay.Wall || overlay[i + MAP_W] === Overlay.Gate;
        const tileArt = dress(orderedWall(wallTile(n, sb, o === Overlay.Gate), wallOrder(wallLevel(meta[i]))), "cap");
        upright(tileArt, X, Y + TILE - tileArt.height, Y + TILE, X + TILE / 2);
      }
    }
  }
  for (const st of s.structures) {
    if (st.x + st.w < tx0 - 12 || st.x > tx1 + 12 || st.y + st.h < ty0 || st.y > ty1 + 18) continue;
    const plain = structureArt(st, arch);
    if (!plain) continue;
    const bare = graded(plain, grade(st.level), STYLE[arch].banner, st.level, SPECIAL_TYPES.has(st.type));
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
    drawField(c, st, frozenAt(st), winter && !growsInWinter(st, s));
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
  /** Command (lib/town/sim/command): the selected troops (villager ids), the box being dragged and the last order, in tiles. */
  units?: { sel: Set<number>; box: [number, number, number, number] | null; mark: { x: number; y: number; at: number; kind: string } | null };
  /** Numbers rising off the map (TownGame's list, never saved): drawn like a fight's pops. */
  fx?: Fx[];
}

/**
 * A number rising off the map: '+12' and the good's icon over the hall when
 * tithes land, a purse over a kill, a building's new level when it is done.
 * Kept by the page, never in the saved state; it lives FX_LIFE seconds.
 */
export interface Fx {
  /** Where it starts, in tiles; the label is centred on x. */
  x: number;
  y: number;
  /** Digits, '+' and 'L': the scene's pixel font (../pixel). */
  text: string;
  /** A resource or item icon drawn after the number. */
  icon?: string;
  tone: "goods" | "coin" | "level";
  /** When it rose, in seconds (performance.now() / 1000). */
  t0: number;
  /** Its label, drawn once on its first frame. */
  img?: HTMLCanvasElement;
}
/** Seconds an fx lives, and the world pixels it rises in that time. */
export const FX_LIFE = 1.2;
const FX_RISE = 12;

/** The selection ring under a commanded troop's feet. */
function selRing(c: Ctx, x: number, y: number, w: number) {
  c.save();
  c.strokeStyle = "#7dff9a";
  c.globalAlpha = 0.95;
  c.lineWidth = 1;
  c.beginPath();
  c.ellipse(x + 0.5, y - 0.5, Math.max(5, w / 2 - 1), 2.6, 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}

/** A defender's look follows its ladder; a battalion soldier is a footman sworn to a knight. */
const troopArt = (c: Combatant): Look => troopLook(c.kind, c.level, c.champion, c.heroCls, c.heavyCls);

/**
 * A monster's sprite this frame: walking, standing or striking, each in its
 * own body (../art/monster-anim). `frame` pins an attack's beat; otherwise the
 * clock picks it — a stride six beats a second, a breath one and a half.
 */
function beast(kind: string, level: number, variant: number, t: number, id: number, pose: Pose = "idle", frame?: number): HTMLCanvasElement {
  if (!isMythicArt(kind)) {
    const f = frame ?? (pose === "walk" ? Math.floor(t * 6 + id) : Math.floor(t * 1.5 + id * 0.37));
    return monsterFrame(kind as MonsterArt, level, variant, pose, f);
  }
  // A mythic thing's poses go through the grim pass too, at the deepest tier.
  const f = frameAt(t, id);
  return cached(`grimMythic:${kind}:${f}`, () => {
    const src = mythicSprite(kind, f);
    const { cv, c } = makeCanvas(src.width, src.height);
    c.drawImage(src, 0, 0);
    grim(c, 3);
    return cv;
  });
}

/**
 * How a fighting monster is moving, from where it stood the last frame:
 * whether it is on the move, and which way it last went. Forgotten with the
 * fight (a new raid numbers its combatants afresh).
 */
const lastSeen = new Map<number, { x: number; y: number; face: number; still: number }>();
let lastRaidKey = -1;
function motion(raidKey: number, id: number, x: number, y: number): { moving: boolean; face: number } {
  if (raidKey < lastRaidKey) lastSeen.clear();
  lastRaidKey = raidKey;
  const p = lastSeen.get(id);
  if (!p) {
    lastSeen.set(id, { x, y, face: 1, still: 0 });
    return { moving: false, face: 1 };
  }
  const dx = x - p.x;
  const moved = Math.hypot(dx, y - p.y) > 0.004;
  if (Math.abs(dx) > 0.004) p.face = dx < 0 ? -1 : 1;
  p.still = moved ? 0 : p.still + 1;
  p.x = x;
  p.y = y;
  // A frame or two without a step (the sim runs on its own clock) is not a halt.
  return { moving: p.still < 4, face: p.face };
}

/**
 * Where a band's member stands about the band, in tiles, at a moment: a
 * pack's members trot round one another, flyers wheel, the dead sway, brutes
 * pace a stride to each side, ambushers barely stir, spirits drift.
 */
function mannerOffset(man: Manner, t: number, k: number, id: number): [number, number] {
  switch (man) {
    case "pack": {
      const a = t * 1.1 + k * 2.1 + id;
      return [Math.cos(a) * 0.7, Math.sin(a) * 0.4];
    }
    case "wheel": {
      const a = t * 0.9 + k * 2.09 + id;
      return [Math.cos(a) * 1.6, Math.sin(a) * 0.9];
    }
    case "shamble":
      return [Math.sin(t * 0.7 + k * 1.9 + id) * 0.35, 0];
    case "pace":
      return [Math.sin(t * 0.45 + k * 0.8 + id) * 1.0, 0];
    case "creep":
      return [Math.sin(t * 0.3 + k * 2.3 + id) * 0.15, 0];
    default:
      return [Math.sin(t * 0.6 + k * 2 + id) * 0.6, Math.cos(t * 0.8 + k + id) * 0.35];
  }
}

/** A monster's drawn size in tiles, for picking it out under the pointer. */
export function beastBox(kind: string, level: number): [number, number] {
  const img = beast(kind, level, 0, 0, 0);
  return [img.width / TILE, img.height / TILE];
}

/** A legendary thing trails motes of its element; a mythic one burns in a ring of them. */
function beastAura(c: Ctx, kind: string, x: number, top: number, feet: number, w: number, t: number, seed: number) {
  const def = BEASTS[kind as keyof typeof BEASTS];
  if (!def?.legendary || !def.element) return;
  if (def.mythic) mythicAura(c, def.element, x, top, feet, w, t, seed);
  else legendaryAura(c, def.element, x - w / 2, top, w, feet - top, t, seed);
}

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

/** A 3×5 pixel alphabet, enough for levels: the digits and an L. */
const GLYPH: Record<string, string> = {
  L: "100100100100111", 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001",
  5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111",
};
function glyphs(c: Ctx, text: string, x: number, y: number, color: string) {
  [...text].forEach((ch, k) => {
    const g = GLYPH[ch];
    if (!g) return;
    for (let i = 0; i < 15; i++) if (g[i] === "1") px(c, x + k * 4 + (i % 3), y + Math.floor(i / 3), 1, 1, color);
  });
}

// HUD colours: bars and numbers must stay legible through night and raid.
const HUD = { frame: "#0c0810", empty: "#3a1418", friend: "#5ad06a", foe: "#e0402a", build: "#e8c060", select: ["#ffe07a", "#c9a040"], level: "#ffe070", legend: "#ffb04a", crit: "#ffd84a", hit: "#ff7a6a" };
/** How much colour the world keeps: a muted, weathered palette. Lights and the interface stay vivid. */
const MUTED = 0.74;
/** Monsters that fly, lifted off the ground when they roam. */
const MONSTER_FLIES = new Set(Object.values(BEASTS).filter((d) => d.flying).map((d) => d.kind as string));
// The night fog's two blacks are kept out of the grade too, so the dark
// stays dark rather than tinting blue (see FOG_NIGHT_NEAR/FAR below).
const PROTECT = new Set<number>([0x0d0e11, 0x050506, ...EMISSIVE, ...[HUD.frame, HUD.empty, HUD.friend, HUD.foe, HUD.build, ...HUD.select, HUD.level, HUD.legend, HUD.crit, HUD.hit].map((h) => parseInt(h.slice(1), 16))]);

/** An fx's colour: kept out of the grade (PROTECT), so it reads at night as by day. */
const FX_TONE: Record<Fx["tone"], string> = { goods: HUD.friend, coin: HUD.level, level: HUD.select[0] };

/** The pixel font has no '+': a small cross stands in front of the digits. */
function fxText(c: Ctx, s: string, x: number, y: number, color: string) {
  if (!s.startsWith("+")) return text(c, s, x, y, color);
  px(c, x + 1, y + 1, 1, 3, color);
  px(c, x, y + 2, 3, 1, color);
  text(c, s.slice(1), x + 4, y, color);
}

/** An fx's label: its number with a shadow a pixel down and right, then the icon. */
function fxLabel(f: Fx): HTMLCanvasElement {
  const ic = f.icon ? icon(f.icon) : null;
  const tw = f.text.length * 4;
  const w = tw + 1 + (ic ? ic.width + 1 : 0);
  const h = Math.max(6, ic ? ic.height : 0);
  const { cv, c } = makeCanvas(w, h);
  const ty = Math.floor((h - 6) / 2);
  fxText(c, f.text, 1, ty + 1, HUD.frame);
  fxText(c, f.text, 0, ty, FX_TONE[f.tone]);
  if (ic) c.drawImage(ic, tw + 2, Math.floor((h - ic.height) / 2));
  return cv;
}

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
// ── Menace and majesty (../art/menace) ──

/** Monsters drawn this frame whose eyes burn through the night: glowed after the grade. */
const glowQueue: { img: HTMLCanvasElement; dx: number; dy: number; flip: boolean }[] = [];
/** Heroes drawn this frame: each carries a small light the night does not reach. */
const heroLights: { x: number; y: number; r: number }[] = [];

/** A hero's own colour: gold for the King, the stars for the Master, its era's for the rest. */
function heroRamp(look: Look): Ramp4 | null {
  if (look === "champion-king") return E.GOLD;
  if (look === "champion-master") return E.VOID;
  if (isHeroLook(look)) return heroAura(look);
  if (look === "emblemknight") return E.VOID;
  if (look === "grandwizard") return E.AMBER;
  if (isClassLook(look)) return CLASS_RAMP[look];
  return null;
}

/** Under a hero: the rune sigil, and for a champion the pillar of light. Returns whether it is a hero at all. */
function heroUnder(c: Ctx, look: Look, x: number, feet: number, h: number, t: number): boolean {
  const ramp = heroRamp(look);
  if (!ramp) return false;
  const champ = isChampionLook(look);
  const lv = isHeroLook(look) ? heroLevel(look) : 0;
  if (champ) lightPillar(c, x, feet, h + 26, t, ramp);
  heroSigil(c, x, feet, t, ramp, champ ? 12 : lv >= 100 ? 11 : 9);
  heroLights.push({ x, y: feet - 8, r: champ ? 26 : 16 });
  return true;
}

/** Over a hero: an emblem knight's banner, from level 40, and the King's. */
function heroOver(c: Ctx, look: Look, x: number, top: number, t: number) {
  const knight = look === "champion-king" || (isHeroLook(look) && look.startsWith("hero-knight") && heroLevel(look) >= 40);
  if (!knight) return;
  const ramp = heroRamp(look)!;
  heroBanner(c, x, top, t, ramp, look === "champion-king" ? M.CLOTHRED : M.ARCANE);
}

/** How heavy a monster reads: smoke off it, and the ground shakes when it strikes. */
const heavy = (u: Combatant) => u.legendary || u.mythic || u.level >= 20;

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
/** Where the last frame's time went, in ms: the ground and buildings, the figures, the light. */
export const drawStats = { world: 0, sprites: 0, light: 0 };

export function drawFrame(ctx: Ctx, world: World, s: GameState, cam: Camera, ov: Overlays, t: number) {
  const f0 = performance.now();
  const c = ctx;
  c.imageSmoothingEnabled = false;
  const vw = VIEW_W / cam.zoom;
  const vh = VIEW_H / cam.zoom;
  c.fillStyle = "#0c0a10";
  c.fillRect(0, 0, VIEW_W, VIEW_H);
  glowQueue.length = 0;
  heroLights.length = 0;

  c.save();
  // The ground shakes under a heavy thing's blow: a pixel or two, for a moment.
  const rd = s.raid;
  if (rd?.started) {
    const blow = rd.combatants.find((u) => u.side === "monster" && u.hp > 0 && heavy(u) && u.swingAt !== undefined && rd.clock - u.swingAt < 0.12);
    if (blow) {
      const amp = blow.mythic ? 2 : 1;
      c.translate(hash(Math.floor(t * 40), 1, 5) > 0.5 ? amp : -amp, hash(Math.floor(t * 40), 2, 7) > 0.5 ? amp : 0);
    }
  }
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

  // Spike pits (lib/town/sim/menace): a dark hole with stakes in it, on the ground under everything.
  for (const i of s.traps ?? []) {
    const X = (i % MAP_W) * TILE;
    const Y = Math.floor(i / MAP_W) * TILE;
    if (!inView(X, Y, 8)) continue;
    px(c, X + 1, Y + 4, TILE - 2, 3, "#1a1410");
    px(c, X + 2, Y + 3, TILE - 4, 1, "#2a2018");
    for (const sx of [2, 4, 6]) {
      px(c, X + sx, Y + 3 - (sx === 4 ? 1 : 0), 1, 2, M.STEEL[sx === 4 ? LIT : MID]);
    }
  }

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
    // the special buildings say where their own fires burn and flues smoke, level by level
    if (SPECIAL_TYPES.has(st.type)) {
      const art = structureArt(st, ov.arch);
      const an = art && anchorsOf(art);
      if (art && an) {
        const [ax, ay] = artAnchor(st, art);
        for (const f of an.fire ?? []) flames(c, ax + f.x, ay + f.y, t, f.n, st.id, f.tall ?? 1);
        (an.smoke ?? []).forEach((p, k) => smoke(c, ax + p.x, ay + p.y, t + st.id * 0.3 + k * 0.5, !!p.dark, p.green ? M.CLOTHGRN : undefined));
      }
    }
    if (st.type === "house" || st.type === "apartment") smoke(c, X + st.w * TILE - 8, Y - 16, t + st.id * 0.3);
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

  // Every gate found in the fog wears its level over it, on a plaque that glows through the night.
  for (const l of s.lairs ?? []) {
    if (!l.discovered) continue;
    const X = Math.round((l.x + l.w / 2) * TILE);
    const Y = l.y * TILE - 30;
    if (!inView(X, Y, 80)) continue;
    const text = `L${l.level}`;
    const w = text.length * 4 + 3;
    px(c, X - Math.floor(w / 2), Y, w, 9, HUD.frame);
    px(c, X - Math.floor(w / 2) + 1, Y + 1, w - 2, 7, "#2a1438");
    glyphs(c, text, X - Math.floor(w / 2) + 2, Y + 2, E.VOID[1]);
  }

  // construction progress
  for (const st of s.structures) {
    if (!st.buildUntil) continue;
    const def = CATALOG[st.type];
    const total = def.buildHours * 60 * (st.level > 1 ? upgradeHours(st.type, st.level) : 1);
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
  const f1 = performance.now();
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

  // Bands out of the fog — drawn only where the town can see them. None stands still for long:
  // each member moves in its kind's manner (sim/wilds mannerOf) about where the band is, hopping
  // as it walks, and faces the way it is going.
  for (const b of s.roamers ?? []) {
    if (!seesPoint(s, b.x, b.y)) continue;
    const man = mannerOf(b.kind);
    const lying = b.still !== undefined && s.time < b.still;
    const marching = !lying && Math.hypot(b.tx - b.x, b.ty - b.y) > 0.05;
    const flies = MONSTER_FLIES.has(b.kind);
    const art = isMythicArt(b.kind) ? -1 : artFacing(b.kind as MonsterArt);
    for (let k = 0; k < Math.min(3, b.count); k++) {
      // Each member on its own beat, so a pack does not step as one.
      const img = beast(b.kind, b.level, b.id % 3, t + k * 0.23, b.id + k * 5, marching || (!lying && man !== "creep") ? "walk" : "idle");
      const [ox, oy] = lying ? [0, 0] : mannerOffset(man, t, k, b.id);
      const x = Math.round((b.x + (k - 1) * 1.3 + ox) * TILE);
      const y = Math.round((b.y + (k % 2) * 0.7 + oy) * TILE);
      if (!inView(x, y, 60)) continue;
      // Which way it faces: the march, or — moving about its spot — the way its own loop turns.
      const [nx] = lying ? [0] : mannerOffset(man, t + 0.08, k, b.id);
      const vx = marching && Math.abs(b.tx - b.x) > 0.3 ? b.tx - b.x : nx - ox;
      // Drawn as authored when that already faces its way; mirrored when not; a thing seen from the front never.
      const flip = art === 0 || (vx < 0 ? -1 : 1) === art;
      const hop = 0;
      const bob = flies ? Math.round(Math.sin(t * 3 + k * 1.7 + b.id) * 2) : man === "drift" ? Math.round(Math.sin(t * 1.6 + k) * 1.5) : 0;
      const dx = Math.round(x - img.width / 2);
      const dy = y - img.height - (flies ? 12 : 0) - hop + bob;
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
          if (k === 0) beastAura(c, b.kind, x, dy, y, img.width, t, b.id);
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
    const look = troopLook(v.role, v.rank, null, null, v.heavy);
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

  // Troops stationed out in the field (lib/town/sim/command), standing guard day and night.
  const sel = ov.units?.sel;
  if (!s.raid?.started) {
    for (const v of s.villagers) {
      if (!v.stand || !MILITARY.includes(v.role)) continue;
      const x = Math.round(v.stand[0] * TILE);
      const y = Math.round(v.stand[1] * TILE);
      if (!inView(x, y)) continue;
      const look = troopLook(v.role === "infantry" ? "footman" : v.role, v.rank, v.champion, v.hero?.cls, v.heavy);
      const img = figure(look, Math.floor(t * 2 + v.id) % 4 === 0 ? 1 : 0);
      const dx = Math.round(x - img.width / 2);
      const dy = y - img.height;
      const picked = !!sel?.has(v.id);
      sprites.push({
        base: y, x0: dx - 10, y0: dy - 6, x1: dx + img.width + 10, y1: y + 2,
        draw: () => {
          if (picked) selRing(c, x, y, img.width);
          footShadow(c, s, x, y, 10);
          heroUnder(c, look, x, y, img.height, t);
          c.drawImage(img, dx, dy);
          if (hasAura(look)) heroEffect(c, look, x, dy, y, t, v.id);
          heroOver(c, look, x, dy, t);
        },
      });
      if (picked) onTop.push(() => hpBar(c, x - 8, dy - 5, 16, v.health / 100, true));
    }
  }

  // Champions turned to stone stand before the hall, in a row, until they are restored.
  const hallAt = s.structures.find((st) => st.type === "townhall");
  if (hallAt) {
    (s.statues ?? []).forEach((v, i) => {
      const img = statueSprite(troopLook(v.role, v.rank, v.champion), v.statue?.restore ?? 0);
      const x = Math.round((hallAt.x + 1.5 + i * 2.4) * TILE);
      const y = Math.round((hallAt.y + hallAt.h + 1.4) * TILE);
      if (!inView(x, y)) return;
      const dx = x - Math.round(img.width / 2);
      const dy = y - img.height;
      sprites.push({ base: y, x0: dx - 4, y0: dy - 4, x1: dx + img.width + 4, y1: y + 2, draw: () => c.drawImage(img, dx, dy) });
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
      // A monster walks, stands or strikes; it faces the way it goes, or what it is striking.
      let mPose: Pose = "idle";
      let mFrame: number | undefined;
      let face = 1;
      if (u.side === "monster") {
        const m = motion(raid.nextId, u.id, u.x, u.y);
        const since = u.swingAt !== undefined ? raid.clock - u.swingAt : Infinity;
        if (since < 0.14) [mPose, mFrame] = ["attack", 1];
        else if (since < 0.34) [mPose, mFrame] = ["attack", 2];
        else if (!m.moving && u.cooldown < Math.min(0.3, u.interval * 0.3)) [mPose, mFrame] = ["attack", 0];
        else mPose = m.moving ? "walk" : "idle";
        const aim = u.targetStruct != null ? s.structures.find((st) => st.id === u.targetStruct) : undefined;
        face = m.moving ? m.face : aim ? (aim.x + aim.w / 2 >= u.x ? 1 : -1) : m.face;
      }
      const img = u.side === "monster" ? beast(u.kind, u.level, u.variant ?? 0, t, u.id, mPose, mFrame) : figure(look!, frame);
      const mArt = u.side === "monster" ? (isMythicArt(u.kind) ? -1 : artFacing(u.kind as MonsterArt)) : 0;
      const mMirror = u.side === "monster" && mArt !== 0 && face !== mArt;
      const lift = u.flying ? Math.round(14 + Math.sin(t * 3 + u.id) * 2) : 0;
      // A mythic thing's blow is a lunge toward what it strikes; other monsters strike in their own frames.
      const swing = u.side === "monster"
        ? (isMythicArt(u.kind) && mPose === "attack" ? [-1, 3, 1][mFrame ?? 1] * face : 0)
        : u.swingAt !== undefined && raid.clock - u.swingAt < 0.15 ? 2 : 0;
      const dx = Math.round(x - img.width / 2 + swing);
      const dy = y - img.height - lift;
      const picked = u.side === "defender" && !!sel && (sel.has(u.villagerId ?? -1) || sel.has(u.leader ?? -1));
      if (picked && u.order && u.order.kind !== "hold") {
        // Where it was told to go: a faint line to the spot, or to the monster it hunts.
        const o = u.order;
        const hunted = o.kind === "attack" ? raid.combatants.find((m) => m.id === o.target) : undefined;
        const ox = Math.round((hunted?.x ?? o.x) * TILE);
        const oy = Math.round((hunted?.y ?? o.y) * TILE);
        onTop.push(() => {
          c.save();
          c.strokeStyle = o.kind === "attack" ? "#ff7a6a" : o.kind === "amove" ? "#ffcf6a" : "#7dff9a";
          c.globalAlpha = 0.45;
          c.setLineDash([2, 2]);
          c.beginPath();
          c.moveTo(x + 0.5, y - 0.5);
          c.lineTo(ox + 0.5, oy - 0.5);
          c.stroke();
          c.restore();
        });
      }
      sprites.push({
        base: y, x0: dx - 10, y0: dy - 6, x1: dx + img.width + 10, y1: y + 2,
        draw: () => {
          if (picked) selRing(c, x, y, img.width);
          footShadow(c, s, x, y, Math.round(img.width / (u.flying ? 2.2 : 1.6)), u.flying);
          if (u.side === "monster" && u.legendary) bloodSigil(c, x, y, img.width, t, !!u.mythic);
          if (look) heroUnder(c, look, x, y, img.height, t);
          if (u.side === "monster") {
            if (mMirror) {
              c.save();
              c.translate(dx + img.width, dy);
              c.scale(-1, 1);
              c.drawImage(img, 0, 0);
              c.restore();
            } else c.drawImage(img, dx, dy);
            glowQueue.push({ img, dx, dy, flip: mMirror });
            if (heavy(u) || u.level >= 12) menaceSmoke(c, x, dy, img.width, t, u.id, u.mythic ? 9 : u.legendary ? 7 : 4);
          } else c.drawImage(img, dx, dy);
          if (look && hasAura(look)) heroEffect(c, look, x, dy, y, t, u.id, u.element ?? null);
          if (look) heroOver(c, look, x, dy, t);
          if (u.side === "monster" && u.legendary) beastAura(c, u.kind, x, dy, y + (u.flying ? -lift : 0), img.width, t, u.id);
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
        if (u.side === "monster" && u.legendary) text(c, `${(BEASTS[u.kind as keyof typeof BEASTS]?.name ?? u.kind).toUpperCase()} L${u.level}`, x - 16, dy - 11, HUD.legend);
        else if (u.side === "monster" && u.level >= 5) text(c, `L${u.level}`, x - 6, dy - 11, HUD.level);
      });
    }
    // static posts: HP over the building
    for (const u of raid.combatants.filter((v) => v.structId && v.hp > 0)) {
      const st = s.structures.find((x) => x.id === u.structId);
      if (st) onTop.push(() => hpBar(c, st.x * TILE, st.y * TILE - 10, st.w * TILE, u.hp / u.maxHp, true));
    }
    onTop.push(() => {
      for (const p of raid.projectiles) {
        // Arrows, quarrels, stones and ballista bolts arc; spells, blade-waves and breath fly straight.
        const arcs = p.kind === "arrow" || p.kind === "quarrel" || p.kind === "rock" || p.kind === "ballista";
        const x = (p.x + (p.tx - p.x) * p.t) * TILE;
        const y = (p.y + (p.ty - p.y) * p.t) * TILE - (arcs ? Math.sin(p.t * Math.PI) * 10 : 0);
        drawProjectile(c, p, x, y, t);
      }
      for (const p of raid.pops ?? []) {
        const age = raid.clock - p.at;
        if (age > 0.9) continue;
        text(c, p.text.replace("-", ""), Math.round(p.x * TILE), Math.round(p.y * TILE - age * 14), p.tone === "crit" ? HUD.crit : HUD.hit);
      }
    });
  }
  // Numbers rising off the map, the way a fight's pops do: each label is drawn once, then only copied.
  if (ov.fx?.length) {
    const now = performance.now() / 1000;
    const fx = ov.fx;
    onTop.push(() => {
      for (const f of fx) {
        const age = now - f.t0;
        if (age < 0 || age > FX_LIFE) continue;
        const img = (f.img ??= fxLabel(f));
        const x = Math.round(f.x * TILE - img.width / 2);
        const y = Math.round(f.y * TILE - img.height - (age / FX_LIFE) * FX_RISE);
        if (inView(x, y)) c.drawImage(img, x, y);
      }
    });
  }

  // Command: rings on selected troops still inside a post, the selection box, and where the last order went.
  if (ov.units) {
    const u = ov.units;
    if (u.sel.size) {
      for (const cu of commandUnits(s)) {
        if (!u.sel.has(cu.id) || (!cu.inside && (s.raid?.started || cu.stationed))) continue;
        const x = Math.round(cu.x * TILE);
        const y = Math.round(cu.y * TILE);
        if (inView(x, y)) onTop.push(() => selRing(c, x, y + 4, 14));
      }
    }
    if (u.box) {
      const [x0, y0, x1, y1] = u.box;
      onTop.push(() => {
        c.save();
        c.strokeStyle = "#7dff9a";
        c.fillStyle = "rgba(125,255,154,0.08)";
        c.setLineDash([3, 2]);
        const rx = Math.round(Math.min(x0, x1) * TILE) + 0.5;
        const ry = Math.round(Math.min(y0, y1) * TILE) + 0.5;
        const rw = Math.round(Math.abs(x1 - x0) * TILE);
        const rh = Math.round(Math.abs(y1 - y0) * TILE);
        c.fillRect(rx, ry, rw, rh);
        c.strokeRect(rx, ry, rw, rh);
        c.restore();
      });
    }
    const mk = u.mark;
    const age = mk ? performance.now() / 1000 - mk.at : 9;
    if (mk && age < 0.9) {
      onTop.push(() => {
        const x = Math.round(mk.x * TILE);
        const y = Math.round(mk.y * TILE);
        const r = 7 - age * 5;
        c.save();
        c.globalAlpha = 1 - age;
        c.strokeStyle = mk.kind === "attack" ? "#ff7a6a" : mk.kind === "amove" ? "#ffcf6a" : "#7dff9a";
        c.beginPath();
        c.ellipse(x + 0.5, y + 0.5, r, r / 2, 0, 0, Math.PI * 2);
        c.stroke();
        if (mk.kind === "attack") {
          c.beginPath();
          c.moveTo(x - 3, y - 3);
          c.lineTo(x + 4, y + 4);
          c.moveTo(x + 4, y - 3);
          c.lineTo(x - 3, y + 4);
          c.stroke();
        }
        c.restore();
      });
    }
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
  // A lamp's reservoir, only over one running low: amber under half, red in the last quarter, blinking once dry.
  for (const st of s.structures) {
    if (st.type !== "lamppost" || st.buildUntil) continue;
    const frac = Math.max(0, Math.min(1, lampFuel(st) / LAMP_CAP));
    if (frac >= 0.5) continue;
    const art = lamppost(frac > 0);
    const [ax, ay] = artAnchor(st, art);
    if (!inView(ax, ay, 30)) continue;
    const w = 9;
    const x = Math.round(ax + (art.width - w) / 2);
    const y = ay - 5;
    px(c, x - 1, y - 1, w + 2, 4, HUD.frame);
    px(c, x, y, w, 2, HUD.empty);
    if (frac > 0) px(c, x, y, Math.max(1, Math.round(w * frac)), 2, frac > 0.25 ? HUD.build : HUD.foe);
    else if (Math.floor(t * 2) % 2) px(c, x, y, w, 2, HUD.foe);
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

  // The sky as the simulation has it (lib/town/sim/weather), on this map.
  const sky = air(s);
  const biome = biomeOf(s);
  // Lightning: now and then in a thunderstorm, and whenever it falls on a fight.
  const flash = (sky.regime === "thunder" && hash(Math.floor(t / 2.3), 7, 71) > 0.72 && t % 2.3 < 0.14) || (!!s.raid?.flashAt && s.raid.clock - s.raid.flashAt < 0.12);
  // A building lightning has just struck: the bolt on it, for a moment of game time.
  for (const st of s.structures) {
    if (st.struck === undefined || s.time - st.struck > 2) continue;
    const x = (st.x + st.w / 2) * TILE;
    const y = st.y * TILE;
    if (inView(x, y, 60)) bolt(c, (x - cam.x) * cam.zoom, (y - cam.y) * cam.zoom, t);
  }
  const f2 = performance.now();
  weather(c, clk, t, sky.regime, biome, flash);
  // Only a mythic omen fills the sky (lib/town/sim/menace redSky).
  const omen = omenOf(s);
  if (omen?.power === 2) omenWeather(c, omen.element, VIEW_W, VIEW_H, t, omen.power);
  environment(c, s, cam, clk, t, sky.regime, biome, flash);
  const f3 = performance.now();
  drawStats.world = f1 - f0;
  drawStats.sprites = f2 - f1;
  drawStats.light = f3 - f2;
}

// ── Weather and light ─────────────────────────────────────

/** Particles only: the season's colour cast is part of the grade, not a layer. */
/** A jagged bolt from the top of the view down to (x, y), in screen pixels. */
function bolt(c: Ctx, x: number, y: number, t: number) {
  c.save();
  c.strokeStyle = "#fffbe0";
  c.lineWidth = 1;
  c.beginPath();
  let bx = x + (hash(Math.floor(t * 8), 1, 73) - 0.5) * 30;
  c.moveTo(bx, 0);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    bx += (hash(i, Math.floor(t * 8), 79) - 0.5) * 14;
    c.lineTo(i === steps ? x : bx, (y * i) / steps);
  }
  c.stroke();
  c.restore();
}

/**
 * What falls and blows across the view, from the simulation's own sky: snow
 * and blizzard, rain and thunder, a sandstorm's streaming grains, heat
 * shimmer, a gale's streaks, banks of fog. Fair weather gets the season's
 * small things — leaves, petals, fireflies — or the map's: dust motes in the
 * desert, wisps of cloud and wheeling birds over the isles.
 */
function weather(c: Ctx, clk: Clock, t: number, regime: Regime, biome: Biome, flash: boolean) {
  if (regime === "snow" || regime === "blizzard") {
    const storm = regime === "blizzard";
    for (let i = 0; i < (storm ? 380 : 140); i++) {
      const x = (hash(i, 1, 1) * VIEW_W + Math.sin(t * 0.7 + i) * 8 + t * (storm ? 90 : 6)) % VIEW_W;
      const y = (hash(i, 2, 1) * VIEW_H + t * (storm ? 60 : 14 + hash(i, 3, 1) * 16)) % VIEW_H;
      const near = hash(i, 4, 1) > 0.7;
      px(c, x, y, storm ? 3 : 2, near ? 2 : 1, M.LINEN[near ? LIT : MID]);
    }
    return;
  }
  if (regime === "rain" || regime === "thaw" || regime === "thunder") {
    const heavy = regime === "thunder";
    for (let i = 0; i < (heavy ? 200 : 90); i++) {
      const x = (hash(i, 1, 3) * VIEW_W + t * (heavy ? 60 : 30)) % VIEW_W;
      const y = (hash(i, 2, 3) * VIEW_H + t * (heavy ? 260 : 180)) % VIEW_H;
      px(c, x, y, 1, heavy ? 6 : 4, M.GLASS[LIT]);
    }
    if (heavy && flash) bolt(c, hash(Math.floor(t / 2.3), 3, 71) * VIEW_W, VIEW_H * (0.4 + hash(Math.floor(t / 2.3), 4, 71) * 0.4), t);
    return;
  }
  if (regime === "sandstorm") {
    // A wall of blown sand: grains streaming sideways, thick enough to hide the far side of the street.
    c.save();
    c.fillStyle = "rgba(214,170,104,0.22)";
    c.fillRect(0, 0, VIEW_W, VIEW_H);
    c.restore();
    for (let i = 0; i < 320; i++) {
      const x = (hash(i, 1, 13) * VIEW_W + t * (160 + hash(i, 3, 13) * 90)) % VIEW_W;
      const y = (hash(i, 2, 13) * VIEW_H + Math.sin(t * 2 + i) * 6 + t * 10) % VIEW_H;
      const tone = hash(i, 4, 13) > 0.6 ? LIT : hash(i, 4, 13) > 0.25 ? MID : SHADE;
      px(c, x, y, hash(i, 5, 13) > 0.7 ? 4 : 2, 1, M.DUNE[tone]);
    }
    return;
  }
  if (regime === "heatwave") {
    // Heat shimmer: faint wavering bands rising off the ground.
    c.save();
    c.globalAlpha = 0.18;
    for (let k = 0; k < 14; k++) {
      const y = (VIEW_H - ((t * 14 + k * 23) % (VIEW_H + 20))) | 0;
      for (let x = 0; x < VIEW_W; x += 3) px(c, x, y + Math.round(Math.sin(x / 9 + t * 3 + k) * 1.5), 2, 1, M.SAND[LIT]);
    }
    c.restore();
    return;
  }
  if (regime === "gale") {
    // Streaks of wind, and what it carries: sand in the desert, leaves and grass elsewhere.
    c.save();
    c.globalAlpha = 0.5;
    for (let i = 0; i < 46; i++) {
      const x = (hash(i, 1, 17) * VIEW_W + t * 240) % (VIEW_W + 60) - 30;
      const y = hash(i, 2, 17) * VIEW_H + Math.sin(t * 3 + i) * 4;
      px(c, x, y, 10 + Math.floor(hash(i, 3, 17) * 18), 1, M.CLOUD[LIT]);
    }
    c.restore();
    for (let i = 0; i < 50; i++) {
      const x = (hash(i, 1, 19) * VIEW_W + t * 190) % VIEW_W;
      const y = (hash(i, 2, 19) * VIEW_H + Math.sin(t * 5 + i) * 10 + t * 20) % VIEW_H;
      const bit = biome === "desert" ? M.DUNE : i % 2 ? M.FOLIAGE : M.OCHRE;
      px(c, x, y, 2, 1, bit[MID]);
    }
    return;
  }
  if (regime === "fog") {
    // Banks of fog drifting slowly across.
    c.save();
    for (let k = 0; k < 9; k++) {
      const x = ((hash(k, 1, 23) * (VIEW_W + 200) + t * (6 + k)) % (VIEW_W + 200)) - 100;
      const y = hash(k, 2, 23) * VIEW_H;
      c.globalAlpha = 0.16 + hash(k, 3, 23) * 0.14;
      c.fillStyle = "#e8eef4";
      c.beginPath();
      c.ellipse(x, y, 70 + hash(k, 4, 23) * 60, 22 + hash(k, 5, 23) * 18, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    return;
  }
  // Fair and still: the season's small things, or the map's.
  if (biome === "desert") {
    for (let i = 0; i < 22; i++) {
      const x = (hash(i, 1, 29) * VIEW_W + t * 7 + Math.sin(t + i) * 9) % VIEW_W;
      const y = (hash(i, 2, 29) * VIEW_H + Math.cos(t * 0.6 + i) * 6) % VIEW_H;
      px(c, x, y, 1, 1, M.DUNE[LIT]);
    }
    return;
  }
  if (biome === "skyisles" && !clk.night) {
    // Wisps of cloud drift past below, and birds wheel on the updraft.
    c.save();
    c.globalAlpha = 0.25;
    for (let k = 0; k < 4; k++) {
      const x = ((hash(k, 1, 31) * (VIEW_W + 160) + t * 12) % (VIEW_W + 160)) - 80;
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.ellipse(x, hash(k, 2, 31) * VIEW_H, 40, 8, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    for (let k = 0; k < 3; k++) {
      const x = VIEW_W / 2 + Math.cos(t * 0.4 + k * 2) * (60 + k * 30);
      const y = VIEW_H / 3 + Math.sin(t * 0.4 + k * 2) * (30 + k * 12);
      const flap = Math.floor(t * 4 + k) % 2;
      px(c, x - 2, y - flap, 2, 1, M.CHITIN[SHADE]);
      px(c, x, y, 1, 1, M.CHITIN[SHADE]);
      px(c, x + 1, y - flap, 2, 1, M.CHITIN[SHADE]);
    }
    return;
  }
  if (clk.season === "autumn") {
    for (let i = 0; i < 40; i++) {
      const x = (hash(i, 1, 2) * VIEW_W + t * 18 + Math.sin(t + i) * 10) % VIEW_W;
      const y = (hash(i, 2, 2) * VIEW_H + t * 12) % VIEW_H;
      const leaf = [M.OCHRE, M.CLAY, M.BRASS][i % 3];
      px(c, x, y, 2, 1, leaf[MID]);
      px(c, x + 1, y + 1, 1, 1, leaf[SHADE]);
    }
  } else if (clk.season === "spring") {
    for (let i = 0; i < 26; i++) {
      const x = (hash(i, 1, 4) * VIEW_W + t * 10 + Math.sin(t * 1.3 + i) * 12) % VIEW_W;
      const y = (hash(i, 2, 4) * VIEW_H + t * 8) % VIEW_H;
      px(c, x, y, 2, 1, M.ARCANE[LIT]);
    }
  } else if (clk.night && clk.season === "summer") {
    // fireflies carry their own light
    for (let i = 0; i < 24; i++) {
      if (Math.sin(t * 2 + i * 1.7) < 0.4) continue;
      px(c, hash(i, 1, 5) * VIEW_W + Math.sin(t + i) * 6, hash(i, 2, 5) * VIEW_H + Math.cos(t * 0.8 + i) * 4, 1, 1, E.BILE[1]);
    }
  }
}

/** The cast each kind of weather, and each map, puts on the day. */
const WEATHER_GRADE: Partial<Record<Regime, Grade>> = {
  sandstorm: { mul: [1.02, 0.86, 0.62], add: [34, 18, -4] },
  heatwave: { mul: [1.08, 1.0, 0.84], add: [18, 10, -6] },
};
const BIOME_GRADE: Record<Biome, Grade> = {
  temperate: GRADES.DAY,
  desert: { mul: [1.05, 1.0, 0.9], add: [8, 4, -2] },
  skyisles: { mul: [0.98, 1.0, 1.04], add: [6, 8, 14] },
};
const FLASH: Grade = { mul: [1.3, 1.3, 1.4], add: [60, 60, 72] };

const SEASON: Record<Clock["season"], Grade> = { spring: GRADES.DAY, summer: GRADES.SUMMER, autumn: GRADES.AUTUMN, winter: GRADES.WINTER };
let lightBuf: Uint8Array | null = null;

/**
 * The frame's grade: the season, darkened toward night in quarter steps,
 * the fog of a rainy day, and the red of an alarm. At night every fire,
 * forge, lit hall and flying bolt stamps its rings of light, and those rings
 * are graded with firelight instead of dark.
 */
/** The cast each omen puts on the day (./omens): ashen, drowned, dusty, pale, stormy, blinding, night, sepia, warped. */
export const OMEN_GRADE: Record<string, Grade> = {
  fire: { mul: [1.05, 0.82, 0.62], add: [14, 2, -6] },
  water: { mul: [0.78, 0.9, 1.05], add: [2, 10, 20] },
  earth: { mul: [0.95, 0.88, 0.72], add: [8, 4, -4] },
  air: { mul: [0.95, 1, 1], add: [6, 10, 10] },
  thunder: { mul: [0.62, 0.66, 0.82], add: [-6, -4, 6] },
  light: { mul: [1.1, 1.1, 1.05], add: [34, 32, 24] },
  dark: { mul: [0.55, 0.5, 0.75], add: [-6, -6, 6] },
  time: { mul: [0.95, 0.85, 0.6], add: [16, 8, -8] },
  space: { mul: [0.85, 0.7, 1.05], add: [8, -4, 22] },
};


function environment(c: Ctx, s: GameState, cam: Camera, clk: Clock, t: number, regime: Regime, biome: Biome, flash: boolean) {
  const o = omenOf(s);
  const omen = o && o.power === 2 ? o : null;
  // The season on this map, then its weather: grey in rain and snow, a wall of white in fog or a blizzard, dust-brown in a sandstorm.
  let season = then(SEASON[clk.season], BIOME_GRADE[biome]);
  if (regime === "rain" || regime === "thaw" || regime === "snow") season = mix(season, GRADES.FOG, 0.45);
  else if (regime === "fog" || regime === "blizzard") season = mix(season, GRADES.FOG, 0.8);
  else if (regime === "thunder") season = mix(season, GRADES.FOG, 0.5);
  else if (regime === "gale") season = mix(season, GRADES.FOG, 0.2);
  else if (WEATHER_GRADE[regime]) season = then(season, WEATHER_GRADE[regime]!);
  if (flash) season = then(season, FLASH);
  if (omen) season = then(season, mix(GRADES.DAY, OMEN_GRADE[omen.element], omen.power === 2 ? 1 : 0.7));
  // An unnatural night falls at noon; a storm darkens the day by half — an omen's, or a thunderstorm's.
  const dark = Math.max(Math.round(clk.darkness * 4) / 4, omen?.element === "dark" ? 1 : omen?.element === "thunder" || (regime === "thunder" && !flash) ? 0.5 : 0);
  let base = season;
  if (dark > 0) base = then(base, mix(GRADES.DAY, GRADES.NIGHT, dark));
  const raid = !!s.raid?.started;
  const red = redSky(s);
  if (red) base = then(base, GRADES.RAID);
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
  // A hero carries a little light of their own: the dark does not close on them.
  for (const h of heroLights) light(h.x, h.y, h.r);
  let lit = then(season, GRADES.FIRELIGHT);
  if (red) lit = then(lit, GRADES.RAID);
  // The dark drains colour as well as light: outside the rings the world is nearly grey.
  applyEnvironmentLighting(c, VIEW_W, VIEW_H, [base, mix(base, lit, 0.5), lit], lightBuf, PROTECT, MUTED * (1 - 0.6 * dark));
  // Then the eyes: whatever is out there, you see it by its eyes first.
  if (glowQueue.length) {
    c.save();
    c.scale(cam.zoom, cam.zoom);
    c.translate(-cam.x, -cam.y);
    for (const g of glowQueue) drawGlints(c, g.img, g.dx, g.dy, g.flip, dark);
    c.restore();
  }
}

// ── Minimap ───────────────────────────────────────────────

const MINI_COLORS: Record<number, string> = { 0: "#4f6e44", 1: "#3a6280", 2: "#9a8e80", 3: "#2c4634", 4: "#b8a88a", 5: "#7a9448", 6: "#6e6c52", 7: "#3c5040", 8: "#8fbfe8" };
/** Each map's own ground on the minimap, over the green country's. */
const MINI_BIOME: Record<Biome, Record<number, string>> = {
  temperate: MINI_COLORS,
  desert: { ...MINI_COLORS, 0: "#d8b878", 3: "#6a8a40", 4: "#c09a68", 5: "#7aa048", 6: "#b0603f", 7: "#e8e2d4" },
  skyisles: { ...MINI_COLORS, 0: "#5f8a50", 5: "#86a656", 8: "#9ccaf0" },
};

/** The minimap in winter: ice for grass, bank and forest floor outside the fires' warmth. */
const MINI_ICE: Record<number, string> = { 0: "#9cc4d6", 1: "#2c6aa6", 2: "#8a94a4", 3: "#6f93a8", 4: "#9cc4d6", 5: "#a6ccdc", 6: "#b4c2cc", 7: "#86aac0", 8: "#9ccaf0" };

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
  const warm = iceWinter(s, clock(s.time).season === "winter") ? warmFields(s) : null;
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
      const hex = o === Overlay.Lair ? "#6a4a80" : o === Overlay.Wall || o === Overlay.Gate ? "#c4c0b8" : o === Overlay.Tree ? "#34583a" : o === Overlay.Rock ? "#747480" : o === Overlay.Debris ? "#5a4230" : o === Overlay.Crop ? "#8a9a4a" : (iced ? MINI_ICE : MINI_BIOME[biomeOf(s)])[s.map.terrain[i]];
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

/**
 * At night the fog is darkness: whatever the town cannot see is black, a
 * shade off it by the town and black itself out in the wilds — and ground
 * seen before keeps no haze of its own, it goes dark with the rest.
 */
const FOG_NIGHT_NEAR = "#0d0e11";
const FOG_NIGHT_FAR = "#050506";
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
  let painted = false;
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
      // By night the haze over ground seen before thickens to the dark, and the edge closes in.
      if (night) f = Math.min(1, f / HAZE);
      // a wide, slow swell in the bank, so its edge is never a ruled circle
      const wX = X0 + x;
      const wY = Y0 + y;
      const swell = smoothNoise(wX, wY, 48, 83) * 0.65 + smoothNoise(wX, wY, 20, 84) * 0.35;
      if (f < 1) f = Math.max(0, Math.min(1, f + (swell - 0.5) * 0.28));
      const b = BAYER[(y & 3) * 4 + (x & 3)];
      if (f < b) continue;
      painted = true;
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
  if (!painted) clearFog.add(cv);
  return cv;
}

/** Fog chunks with nothing in them — the town's own ground by day — are not blended over the frame at all. */
const clearFog = new WeakSet<HTMLCanvasElement>();

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
      if (!clearFog.has(fc.cv)) c.drawImage(fc.cv, cx * CHUNK_PX, cy * CHUNK_PX);
    }
  }
}

