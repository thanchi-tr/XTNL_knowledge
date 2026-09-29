import { MAP_H, MAP_W, Overlay, Terrain, type GameState, type ResourceKey, type Season } from "./types";
import type { Biome } from "./biomes";

/**
 * Trees and forests.
 *
 * There are two kinds of wood on the map:
 *
 *   loose trees  single trees on open grass (Overlay.Tree). They seed
 *                themselves at random and grow through four stages —
 *                sprout, seedling, young tree, mature — and winter culls
 *                them once, on its first day: sprouts and seedlings die
 *                outright, a young tree has a 70% chance to die standing
 *                as a snag, a mature one a 5% chance. Dead or alive, the
 *                matter is settled for the season.
 *   forests      connected stretches of forest ground. Each tile holds up to
 *                TILE_WOOD of wood, and a lumber camp draws it down. A forest
 *                refills while it holds more than 15% of its full stock; below
 *                that it stops regrowing, and every tile that is cut to
 *                nothing turns to open grass, until the whole stand is gone.
 *                A tree that seeds itself inside a forest does not stand
 *                alone — it adds to that forest's wood.
 *
 * A loose tree's `meta` packs its look (0–7), its stage (×8) and its
 * species (×40): a map made before species were counts as the old mixed wood.
 *
 * Species: the mixed oak and pine of old; birch, maple (red in autumn),
 * willow, cherry (in blossom each spring), cypress; and the fruit trees —
 * apple (blossom in spring, apples in summer and autumn), chestnut (nuts in
 * autumn), the desert's date palm and the isles' starfruit. A grown fruit
 * tree bears once a season it fruits in, picked without felling it (./actions
 * pickFruit); felled, it gives its wood like any other.
 */

export const TILE_WOOD = 40;
/** Below this share of its full stock, a forest no longer regrows. */
export const FOREST_FLOOR = 0.15;

export const SPROUT = 0;
export const SEEDLING = 1;
export const YOUNG = 2;
export const MATURE = 3;
export const SNAG = 4;
export type TreeStage = 0 | 1 | 2 | 3 | 4;

export const TREE_LABEL = ["Sprout", "Seedling", "Young tree", "Mature tree", "Snag"] as const;
/** Wood a tree gives when cut, by stage. Sprouts and seedlings give nothing worth the name. */
export const TREE_WOOD = [0, 1, 4, 8, 3] as const;
/** Work, in idle-villager hours, to cut a tree down, by stage. */
export const TREE_EFFORT = [0.5, 1, 1.5, 2, 1] as const;

export type Species = "mixed" | "birch" | "maple" | "willow" | "cherry" | "cypress" | "apple" | "chestnut" | "date" | "starfruit";
/** Species by code: the code is the meta's multiple of SPECIES_STRIDE, so the order never changes. */
export const SPECIES: Species[] = ["mixed", "birch", "maple", "willow", "cherry", "cypress", "apple", "chestnut", "date", "starfruit"];
export const SPECIES_STRIDE = 40;

export interface TreeKind {
  name: string;
  /** What it bears, in which seasons, and how much a picking gives. */
  fruit?: ResourceKey;
  seasons?: Season[];
  yield?: number;
  /** In blossom (spring) — cherry and apple. */
  blossom?: boolean;
}
export const TREE_KINDS: Record<Species, TreeKind> = {
  mixed: { name: "Tree" },
  birch: { name: "Birch" },
  maple: { name: "Maple" },
  willow: { name: "Willow" },
  cherry: { name: "Cherry", blossom: true },
  cypress: { name: "Cypress" },
  apple: { name: "Apple tree", fruit: "apple", seasons: ["summer", "autumn"], yield: 6, blossom: true },
  chestnut: { name: "Chestnut", fruit: "chestnut", seasons: ["autumn"], yield: 5 },
  date: { name: "Date palm", fruit: "date", seasons: ["summer", "autumn"], yield: 6 },
  starfruit: { name: "Starfruit tree", fruit: "starfruit", seasons: ["spring", "summer", "autumn"], yield: 4 },
};

export const treeStage = (meta: number) => Math.min(SNAG, Math.floor((meta % SPECIES_STRIDE) / 8)) as TreeStage;
export const treeLook = (meta: number) => meta % 8;
export const treeSpecies = (meta: number): Species => SPECIES[Math.floor(meta / SPECIES_STRIDE)] ?? "mixed";
export const treeMeta = (look: number, stage: TreeStage, species: Species = "mixed") => (look % 8) + stage * 8 + Math.max(0, SPECIES.indexOf(species)) * SPECIES_STRIDE;
/** The same tree at another stage: its look and species kept. */
export const atStage = (meta: number, stage: TreeStage) => treeMeta(treeLook(meta), stage, treeSpecies(meta));

/** What a map's land grows, by share: the green country's mixed wood and orchards, the desert's palms, the isles' starfruit. */
const SPECIES_MIX: Record<Biome, [Species, number][]> = {
  temperate: [["mixed", 0.46], ["birch", 0.1], ["maple", 0.08], ["willow", 0.06], ["cherry", 0.05], ["cypress", 0.05], ["apple", 0.12], ["chestnut", 0.08]],
  desert: [["mixed", 0.7], ["date", 0.3]],
  skyisles: [["mixed", 0.55], ["birch", 0.1], ["cherry", 0.12], ["starfruit", 0.23]],
};
export function pickSpecies(biome: Biome, roll: number): Species {
  let t = 0;
  for (const [sp, p] of SPECIES_MIX[biome] ?? SPECIES_MIX.temperate) {
    t += p;
    if (roll < t) return sp;
  }
  return "mixed";
}

const SEASON_I: Record<Season, number> = { spring: 0, summer: 1, autumn: 2, winter: 3 };
/** A season's stamp: which year and season it is, for what was picked when. */
export const seasonStamp = (year: number, season: Season) => year * 4 + SEASON_I[season];

/** What a tree shows this season: 0 plain, 1 in blossom, 2 with ripe fruit, 3 in autumn colour. */
export function treeFace(s: GameState, tile: number, season: Season, year: number): 0 | 1 | 2 | 3 {
  const meta = s.map.meta[tile];
  if (treeStage(meta) !== MATURE) return 0;
  const sp = treeSpecies(meta);
  const k = TREE_KINDS[sp];
  if (ripe(s, tile, season, year)) return 2;
  if (k.blossom && season === "spring") return 1;
  if (sp === "maple" && season === "autumn") return 3;
  return 0;
}

/** Whether a grown fruit tree has fruit to pick: its season, and not yet picked in it. */
export function ripe(s: GameState, tile: number, season: Season, year: number): boolean {
  if (s.map.overlay[tile] !== Overlay.Tree) return false;
  const meta = s.map.meta[tile];
  if (treeStage(meta) !== MATURE) return false;
  const k = TREE_KINDS[treeSpecies(meta)];
  if (!k.fruit || !k.seasons?.includes(season)) return false;
  return s.picked?.[tile] !== seasonStamp(year, season);
}

/** Chance per hour that a growing tree moves up a stage. Nothing grows in winter. */
const GROW: Record<Season, number> = { spring: 1 / 30, summer: 1 / 40, autumn: 1 / 80, winter: 0 };
/** Wood a forest tile regrows per hour, while its forest is above the floor. */
export const REGROW: Record<Season, number> = { spring: 0.12, summer: 0.1, autumn: 0.05, winter: 0 };
/** Trees that try to seed themselves each hour. */
const SEEDS: Record<Season, number> = { spring: 14, summer: 5, autumn: 2, winter: 0 };

export interface Forest {
  tiles: number[];
  wood: number;
  cap: number;
}

/**
 * The connected forest tiles, flooded only when the forest's shape has
 * changed: a fingerprint of the forest tiles is a plain scan, the flood fill
 * is not.
 */
const forestMemo = new WeakMap<GameState, { sig: string; parts: number[][] }>();
function forestParts(s: GameState): number[][] {
  const { terrain } = s.map;
  let n = 0;
  let h = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] !== Terrain.Forest) continue;
    n++;
    h = (h * 31 + i) | 0;
  }
  const sig = `${n}:${h}`;
  const m = forestMemo.get(s);
  if (m && m.sig === sig) return m.parts;
  // The flood in typed arrays: a forest can run to tens of thousands of tiles.
  const N = MAP_W * MAP_H;
  const seen = new Uint8Array(terrain.length);
  const parts: number[][] = [];
  const stack = new Int32Array(n + 4);
  const F = Terrain.Forest;
  for (let i = 0; i < terrain.length; i++) {
    if (seen[i] || terrain[i] !== F) continue;
    const tiles: number[] = [];
    let top = 0;
    seen[i] = 1;
    stack[top++] = i;
    while (top) {
      const j = stack[--top];
      tiles.push(j);
      const x = j % MAP_W;
      let k = j + 1;
      if (x + 1 < MAP_W && !seen[k] && terrain[k] === F) { seen[k] = 1; stack[top++] = k; }
      k = j - 1;
      if (x > 0 && !seen[k] && terrain[k] === F) { seen[k] = 1; stack[top++] = k; }
      k = j + MAP_W;
      if (k < N && !seen[k] && terrain[k] === F) { seen[k] = 1; stack[top++] = k; }
      k = j - MAP_W;
      if (k >= 0 && !seen[k] && terrain[k] === F) { seen[k] = 1; stack[top++] = k; }
    }
    parts.push(tiles);
  }
  forestMemo.set(s, { sig, parts });
  return parts;
}

/** Every forest on the map: connected forest tiles and the wood they hold. */
export function forests(s: GameState): Forest[] {
  const { meta } = s.map;
  return forestParts(s).map((tiles) => ({ tiles, wood: tiles.reduce((a, t) => a + meta[t], 0), cap: tiles.length * TILE_WOOD }));
}

/** The forest a tile belongs to, if any. */
export function forestOf(s: GameState, tile: number): Forest | undefined {
  if (s.map.terrain[tile] !== Terrain.Forest) return undefined;
  return forests(s).find((f) => f.tiles.includes(tile));
}

export const regrows = (f: Forest) => f.wood > f.cap * FOREST_FLOOR;

/**
 * An hour in the woods: forests refill or, below the floor, give up the
 * tiles cut bare; trees seed themselves and grow a stage.
 * `free(tile)` says whether open grass is free to take a new tree.
 */
export function growWoods(s: GameState, season: Season, r: () => number, free: (tile: number) => boolean) {
  const { terrain, overlay, meta } = s.map;
  for (const f of forests(s)) {
    if (regrows(f)) {
      const add = REGROW[season];
      if (add) for (const t of f.tiles) meta[t] = Math.min(TILE_WOOD, meta[t] + add);
    } else {
      for (const t of f.tiles) {
        if (meta[t] > 0.01) continue;
        terrain[t] = Terrain.Grass;
        meta[t] = 0;
      }
    }
  }

  for (let i = 0; i < SEEDS[season]; i++) {
    const t = Math.floor(r() * MAP_W * MAP_H);
    if (terrain[t] === Terrain.Forest) {
      // A tree taking root in a forest thickens the forest.
      meta[t] = Math.min(TILE_WOOD, meta[t] + TILE_WOOD / 2);
    } else if (terrain[t] === Terrain.Grass && overlay[t] === Overlay.None && free(t) && (nearWood(s, t) || r() < 0.25)) {
      overlay[t] = Overlay.Tree;
      meta[t] = treeMeta(Math.floor(r() * 8), SPROUT, pickSpecies(s.biome ?? "temperate", r()));
    }
  }

  const grow = GROW[season];
  if (grow) {
    for (let t = 0; t < overlay.length; t++) {
      if (overlay[t] !== Overlay.Tree) continue;
      const stage = treeStage(meta[t]);
      if (stage < MATURE && r() < grow) meta[t] = atStage(meta[t], (stage + 1) as TreeStage);
    }
  }
}

/**
 * Winter's first day settles every loose tree: sprouts and seedlings die
 * and are gone; young trees die standing as snags seven times in ten;
 * mature trees one time in twenty.
 */
export function winterCull(s: GameState, r: () => number): { gone: number; snags: number; stand: number } {
  const { overlay, meta } = s.map;
  let gone = 0;
  let snags = 0;
  let stand = 0;
  for (let t = 0; t < overlay.length; t++) {
    if (overlay[t] !== Overlay.Tree) continue;
    const stage = treeStage(meta[t]);
    if (stage === SPROUT || stage === SEEDLING) {
      overlay[t] = Overlay.None;
      meta[t] = 0;
      gone++;
    } else if ((stage === YOUNG && r() < 0.7) || (stage === MATURE && r() < 0.05)) {
      meta[t] = atStage(meta[t], SNAG);
      snags++;
    } else if (stage !== SNAG) stand++;
  }
  return { gone, snags, stand };
}

function nearWood(s: GameState, t: number) {
  const x = t % MAP_W;
  const y = Math.floor(t / MAP_W);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const j = ny * MAP_W + nx;
      if ((s.map.overlay[j] === Overlay.Tree && treeStage(s.map.meta[j]) >= YOUNG && treeStage(s.map.meta[j]) !== SNAG) || s.map.terrain[j] === Terrain.Forest) return true;
    }
  }
  return false;
}
