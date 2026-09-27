import { MAP_H, MAP_W, Overlay, Terrain, type GameState, type Season } from "./types";

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
 * A loose tree's `meta` packs its look (0–7) and its stage (×8).
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

export const treeStage = (meta: number) => Math.min(SNAG, Math.floor(meta / 8)) as TreeStage;
export const treeLook = (meta: number) => meta % 8;
export const treeMeta = (look: number, stage: TreeStage) => (look % 8) + stage * 8;

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

/** Every forest on the map: connected forest tiles and the wood they hold. */
export function forests(s: GameState): Forest[] {
  const { terrain, meta } = s.map;
  const seen = new Uint8Array(terrain.length);
  const out: Forest[] = [];
  for (let i = 0; i < terrain.length; i++) {
    if (seen[i] || terrain[i] !== Terrain.Forest) continue;
    const tiles: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      tiles.push(j);
      const x = j % MAP_W;
      const y = Math.floor(j / MAP_W);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
        const k = ny * MAP_W + nx;
        if (!seen[k] && terrain[k] === Terrain.Forest) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    out.push({ tiles, wood: tiles.reduce((a, t) => a + meta[t], 0), cap: tiles.length * TILE_WOOD });
  }
  return out;
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
      meta[t] = treeMeta(Math.floor(r() * 8), SPROUT);
    }
  }

  const grow = GROW[season];
  if (grow) {
    for (let t = 0; t < overlay.length; t++) {
      if (overlay[t] !== Overlay.Tree) continue;
      const stage = treeStage(meta[t]);
      if (stage < MATURE && r() < grow) meta[t] = treeMeta(treeLook(meta[t]), (stage + 1) as TreeStage);
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
      meta[t] = treeMeta(treeLook(meta[t]), SNAG);
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
