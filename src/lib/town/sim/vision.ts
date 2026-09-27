import { MAP_H, MAP_W, Terrain, type GameState } from "./types";
import { center, hallRadius, lightRange } from "./world";

/**
 * The fog. The land lies under cloud except where the town can see:
 *
 *   the town hall     its whole reach
 *   a lit pit fire    its circle of light
 *   lamps, braziers   theirs
 *   a watchtower      a small circle round it (an army point a little more)
 *   a scout's torch   a few tiles round a knight or wizard out in the fog
 *
 * Forest is always under cloud: nobody sees into the trees, even close by.
 * Ground once seen stays mapped — it lies under a thin mist when nobody is
 * watching it, not the full cloud — and whatever stands there (a tomb, a
 * gate) stays found.
 */

export const UNSEEN = 0;
export const MAPPED = 1;
export const VISIBLE = 2;

/** Tiles a lit torch shows round the hero carrying it. */
export const TORCH_SIGHT = 6;

export interface Sight {
  x: number;
  y: number;
  r: number;
}

/** Everything the town sees by, in tiles. */
export function sightSources(s: GameState): Sight[] {
  const out: Sight[] = [];
  for (const st of s.structures) {
    if (st.buildUntil && st.type !== "townhall") continue;
    const [x, y] = center(st);
    if (st.type === "townhall") out.push({ x, y, r: hallRadius(st.level) });
    else if (st.type === "watchtower") out.push({ x, y, r: 5 + st.level });
    else if (st.type === "armypoint") out.push({ x, y, r: 6 + st.level });
    else {
      const r = lightRange(st);
      if (r > 0) out.push({ x, y, r });
    }
  }
  for (const v of s.villagers) {
    if (v.scout && torchLit(v)) out.push({ x: v.scout.x, y: v.scout.y, r: TORCH_SIGHT });
  }
  return out;
}

/** Whether a hero has a torch burning in their pack. */
export const torchLit = (v: { pack?: (string | null)[] }) => !!v.pack?.some((p) => p?.startsWith("torch:"));

const memo = new WeakMap<GameState, { key: string; map: Uint8Array }>();

/**
 * Tile by tile: UNSEEN, MAPPED or VISIBLE. Recomputed only when what the
 * town sees by changes. Marks newly seen ground on the map, and any lair
 * standing on it as found.
 */
export function visionMap(s: GameState): Uint8Array {
  const src = sightSources(s);
  const key = src.map((q) => `${Math.round(q.x * 2)},${Math.round(q.y * 2)},${q.r}`).join(";") + `|${s.map.w}`;
  const hit = memo.get(s);
  if (hit && hit.key === key) return hit.map;

  const n = s.map.w * s.map.h;
  if (!s.map.seen || s.map.seen.length !== n) s.map.seen = new Array<number>(n).fill(0);
  const seen = s.map.seen;
  const map = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (seen[i]) map[i] = MAPPED;
  for (const q of src) {
    const x0 = Math.max(0, Math.floor(q.x - q.r));
    const x1 = Math.min(s.map.w - 1, Math.ceil(q.x + q.r));
    const y0 = Math.max(0, Math.floor(q.y - q.r));
    const y1 = Math.min(s.map.h - 1, Math.ceil(q.y + q.r));
    const r2 = q.r * q.r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - q.x;
        const dy = y + 0.5 - q.y;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * s.map.w + x;
        seen[i] = 1;
        // Nobody sees into the trees.
        if (s.map.terrain[i] === Terrain.Forest) {
          if (map[i] < MAPPED) map[i] = MAPPED;
        } else map[i] = VISIBLE;
      }
    }
  }
  discoverLairs(s);
  memo.set(s, { key, map });
  return map;
}

/** Marks a circle of ground as seen — a scout's torch, as they go. */
export function markSeen(s: GameState, x: number, y: number, r: number) {
  const n = s.map.w * s.map.h;
  if (!s.map.seen || s.map.seen.length !== n) s.map.seen = new Array<number>(n).fill(0);
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(s.map.h - 1, Math.ceil(y + r)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(s.map.w - 1, Math.ceil(x + r)); xx++) {
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r) s.map.seen[yy * s.map.w + xx] = 1;
    }
  }
  discoverLairs(s);
}

/** Any lair standing on seen ground is found. */
function discoverLairs(s: GameState) {
  const seen = s.map.seen;
  if (!seen) return;
  for (const l of s.lairs ?? []) {
    if (l.discovered) continue;
    for (let y = l.y; y < l.y + l.h && !l.discovered; y++) {
      for (let x = l.x; x < l.x + l.w; x++) {
        if (seen[y * s.map.w + x]) {
          l.discovered = true;
          s.log.unshift({ t: s.time, text: `Out in the fog: a ${LAIR_NAMES[l.kind]} at ${l.x},${l.y}. Things come out of it.`, tone: "bad" });
          break;
        }
      }
    }
  }
}

export const LAIR_NAMES = { tomb: "tomb", dragonpit: "dragon pit", shadowgate: "shadow realm gate" } as const;

/** The fog's rules can be switched off — for headless checks that build wherever they like. */
export const FOG = { rules: true };

/** Whether every tile of a rectangle lies in plain sight. */
export function inSight(s: GameState, x: number, y: number, w = 1, h = 1): boolean {
  if (!FOG.rules) return true;
  const map = visionMap(s);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) return false;
      if (map[yy * MAP_W + xx] !== VISIBLE) return false;
    }
  }
  return true;
}

/** Whether a point, in tiles, can be seen right now. */
export const seesPoint = (s: GameState, x: number, y: number) => {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && visionMap(s)[ty * MAP_W + tx] === VISIBLE;
};
