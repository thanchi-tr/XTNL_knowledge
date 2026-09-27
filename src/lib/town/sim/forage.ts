import { LAND_CROPS, WATER_CROPS } from "./catalog";
import { clock } from "./state";
import { MAP_H, MAP_W, Overlay, Terrain, type GameState } from "./types";
import { center, occupancy } from "./world";

/**
 * Wild crops: plants gone feral, seeding themselves across the open ground.
 *
 * Every dawn a few more come up on bare grass. What comes up depends on how
 * far out it is: the common crops — potato, wheat, grape — close in by the
 * hall, where the town's own fields have been seeding the verges for years;
 * the rarer ones — corn, strawberry, garlic — only far out. They are gathered
 * like a tree is felled: mark them with Clear and idle hands bring them in.
 * Winter kills all but the potato, and only the potato comes up in it.
 */

/** The most wild crops the map holds at once. */
export const WILD_CAP = 180;
/** How many try to come up each dawn (winter: a quarter as many, all potato). */
const WILD_DAILY = 16;
/** Harvest effort, in villager-hours, and what a patch gives. */
export const WILD_EFFORT = 2;
export const wildAmount = (kind: number) => (kind >= MARSH_KIND ? 6 : 5 + Math.floor(kind / 3));
/** Wild kinds from here up are water plants of the marsh: WATER_CROPS[kind - MARSH_KIND]. */
export const MARSH_KIND = 100;
/** What comes up in a marsh: reeds mostly, watercress now and then. */
export const marshKind = (roll: number) => MARSH_KIND + WATER_CROPS.indexOf(roll < 0.7 ? "reed" : "watercress");
/** Tiles from the hall over which the crops run from the commonest to the rarest. */
const WILD_SPAN = 150;

export const wildCrop = (meta: number): (typeof LAND_CROPS)[number] | (typeof WATER_CROPS)[number] =>
  meta >= MARSH_KIND ? WATER_CROPS[Math.min(WATER_CROPS.length - 1, meta - MARSH_KIND)] : LAND_CROPS[Math.max(0, Math.min(LAND_CROPS.length - 1, meta))];

/**
 * Which crop comes up at a spot: mostly the one its distance calls for,
 * sometimes a commoner one — the rare crops never stray in toward the hall.
 */
export function wildKindAt(s: GameState, x: number, y: number, roll: number): number {
  const hall = s.structures.find((st) => st.type === "townhall");
  const [hx, hy] = hall ? center(hall) : [MAP_W / 2, MAP_H / 2];
  const far = Math.min(1, Math.hypot(x - hx, y - hy) / WILD_SPAN);
  const top = Math.round(far * (LAND_CROPS.length - 1));
  return Math.max(0, top - Math.floor(roll * roll * 4));
}

/** At dawn: wild crops come up, and in winter all but the potato die back. */
export function sowWild(s: GameState, r: () => number) {
  const winter = clock(s.time).season === "winter";
  const { overlay, terrain, meta } = s.map;
  let count = 0;
  for (let i = 0; i < overlay.length; i++) {
    if (overlay[i] !== Overlay.Crop) continue;
    if (winter && meta[i] !== 0) {
      overlay[i] = Overlay.None;
      meta[i] = 0;
    } else count++;
  }
  const tries = winter ? WILD_DAILY / 4 : WILD_DAILY;
  const occ = occupancy(s);
  for (let n = 0; n < tries && count < WILD_CAP; n++) {
    const x = Math.floor(r() * MAP_W);
    const y = Math.floor(r() * MAP_H);
    const i = y * MAP_W + x;
    // Wild things come up on grass and meadow; reeds and cress in the marsh.
    const t = terrain[i];
    if ((t !== Terrain.Grass && t !== Terrain.Meadow && t !== Terrain.Marsh) || overlay[i] !== Overlay.None || occ[i]) continue;
    if (t === Terrain.Marsh && winter) continue;
    overlay[i] = Overlay.Crop;
    meta[i] = winter ? 0 : t === Terrain.Marsh ? marshKind(r()) : wildKindAt(s, x, y, r());
    count++;
  }
}
