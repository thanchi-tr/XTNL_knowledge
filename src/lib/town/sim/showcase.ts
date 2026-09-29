import { CATALOG, HALL_YEARS, LADDERS } from "./catalog";
import { assign, beds, clock, makeStructure, makeVillager, newTown, residents } from "./state";
import { stats } from "./stats";
import { alertRadius, checkPlacement, fuelCap, occupancy, ringOf, structureMaxHp, unlitBuildings, wallMaxHp, wallMeta, WALL_MAX_LEVEL } from "./world";
import { LAIR_START, lairGrowth, lairLevel } from "./wilds";
import { store } from "./loot";
import { TILE_WOOD } from "./woods";
import { MAP_H, MAP_W, Overlay, Terrain, YEAR_DAYS, type GameState, type Role, type Structure, type StructureType } from "./types";

/**
 * The end-game preview: a town twenty years on, its hall at level 100 — the
 * end-game phase, which does not end the run: the land keeps answering, and
 * two dragons with a wyvern escort are on their way to the hall.
 *
 * It is laid out the way a careful player would lay one out, inside a ring
 * of walls at their highest level, every tile of it inside the active reach
 * of a watchtower at its highest level:
 *
 *   the garrison      north of the hall: barracks, archery range, army
 *                     school, heavy armoury, the mage spire
 *   the homes         south of the hall: rows of houses, the school, the
 *                     kitchens, fires and lamps
 *   entertainment     north-east: the museum, the markets, the tilting yard,
 *                     a plaza of fires, braziers and lamps
 *   industry          east: forge, refinery, the four laboratories, storehouses, a mine
 *                     in the hills and a lumber camp at the edge of a grove
 *   the farms         south-west along the river: fields, the watermill, the
 *                     fishing hut, the paddies and the ice house — guarded by
 *                     their own army point under an Emblem Knight
 *
 * Avenues of stone run between the districts to gates in the wall; every
 * door is joined to them; and the ground of every district but the farms is
 * relaid in stone flags. Two more army points camp outside the gates.
 */

type Rect = [number, number, number, number]; // x0, y0, x1, y1 — inclusive
type Rule = (reason: string) => boolean;
/** A preview may ignore the rule that army points wait on fifty troops apiece: it is showing the camps, not earning them. */
const campsAllowed: Rule = (r) => /army point needs/i.test(r);

// The ring, and the districts inside it.
const RING: Rect = [1, 2, 112, 98];
const GARRISON: Rect = [20, 4, 61, 20];
const HOMES: Rect = [20, 31, 61, 56];
const FUN: Rect = [65, 4, 110, 34];
const WORKS: Rect = [65, 38, 110, 70];
const FARMS: Rect = [4, 60, 61, 96];
const HILL: Rect = [98, 40, 110, 50];
const GROVE: Rect = [100, 58, 110, 69];

const inRect = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
const tile = (x: number, y: number) => y * MAP_W + x;

/** The first spot, spiralling out from the rect's centre, where a building may stand wholly inside it. */
function spotIn(s: GameState, type: StructureType, r: Rect, relax?: Rule, near?: [number, number]): [number, number] | null {
  const def = CATALOG[type];
  const occ = occupancy(s);
  const [cx, cy] = near ?? [Math.round((r[0] + r[2]) / 2), Math.round((r[1] + r[3]) / 2)];
  for (let d = 0; d < 60; d++) {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < r[0] || y < r[1] || x + def.w - 1 > r[2] || y + def.h - 1 > r[3]) continue;
      const c = checkPlacement(s, type, x, y, occ);
      if (c.ok || (relax && c.reason && relax(c.reason))) return [x, y];
    }
  }
  return null;
}

function raise(s: GameState, type: StructureType, level: number, r: Rect, relax?: Rule, near?: [number, number]): Structure | null {
  const at = spotIn(s, type, r, relax, near);
  if (!at) return null;
  const st = makeStructure(s, type, at[0], at[1], true);
  st.level = Math.min(level, CATALOG[type].maxLevel);
  st.hp = structureMaxHp(st);
  if (type === "pitfire" || type === "brazier") st.fuel = type === "pitfire" ? fuelCap(st.level) : 6;
  return st;
}

/** Lays a road from a building's door to the nearest road already down, around everything in the way. */
function roadFrom(s: GameState, st: Structure) {
  const occ = occupancy(s);
  if (st.y + st.h >= MAP_H) return;
  const start = tile(Math.min(MAP_W - 1, st.x + Math.floor(st.w / 2)), st.y + st.h);
  const open = (i: number) => {
    const t = s.map.terrain[i];
    const o = s.map.overlay[i];
    return !occ[i] && t !== Terrain.Water && t !== Terrain.Forest && t !== Terrain.Marsh && o !== Overlay.Wall && o !== Overlay.Lair && o !== Overlay.Rock;
  };
  if (!open(start)) return;
  const prev = new Int32Array(MAP_W * MAP_H).fill(-2);
  prev[start] = -1;
  const q = [start];
  let found = -1;
  for (let h = 0; h < q.length && q.length < 80000; h++) {
    const i = q[h];
    if (s.map.terrain[i] === Terrain.Pavement) {
      found = i;
      break;
    }
    const x = i % MAP_W;
    for (const j of [i - MAP_W, i + MAP_W, x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= MAP_W * MAP_H || prev[j] !== -2 || !open(j)) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  for (let i = found; i >= 0; i = prev[i]) {
    s.map.terrain[i] = Terrain.Pavement;
    s.map.overlay[i] = Overlay.None;
  }
}

/** A straight road, over open ground and bank only (never water, never a building). */
function avenue(s: GameState, x0: number, y0: number, x1: number, y1: number) {
  const occ = occupancy(s);
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    const i = tile(x, y);
    if (occ[i] || s.map.terrain[i] === Terrain.Water) continue;
    s.map.terrain[i] = Terrain.Pavement;
    s.map.overlay[i] = Overlay.None;
  }
}

export function endgameTown(seed: number, bonus: number): GameState {
  const s = newTown(seed, bonus, "starter");
  const paving = (s.map.paving = new Array(MAP_W * MAP_H).fill(0));
  // Twenty years on — the road to the hall's hundredth level — and a few days more.
  s.time = (HALL_YEARS * YEAR_DAYS + 2) * 24 * 60 + 9 * 60;
  s.nextRaidAt = s.time + 3 * 24 * 60;
  const hall = s.structures.find((x) => x.type === "townhall")!;
  hall.level = 100;
  hall.hp = structureMaxHp(hall);
  hall.hearth = "rune";

  // Everything inside the walls, and well beyond them, has been walked.
  s.map.seen = Array.from({ length: MAP_W * MAP_H }, (_, i) => {
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    return x <= RING[2] + 20 && y <= RING[3] + 16 ? 1 : 0;
  });

  // The gates in the fog near the town were sealed long ago.
  const before = (s.lairs ?? []).length;
  s.lairs = (s.lairs ?? []).filter((l) => l.x > RING[2] + 12 || l.y > RING[3] + 12);
  for (let i = 0; i < MAP_W * MAP_H; i++) {
    const x = i % MAP_W;
    const y = Math.floor(i / MAP_W);
    if (s.map.overlay[i] === Overlay.Lair && inRect([0, 0, RING[2] + 12, RING[3] + 12], x, y)) s.map.overlay[i] = Overlay.None;
  }
  const sealedNear = before - s.lairs.length;
  s.roamers = [];
  // The gates still open out in the fog are young ones, opened since the old ones fell: levels 35 to 45.
  s.lairs.forEach((l, k) => {
    l.bonus = 35 + (k % 3) * 5 - LAIR_START[l.kind] - lairGrowth(clock(s.time).day);
    l.level = lairLevel(s, l);
  });

  // Clear the ground inside the ring: forest felled, rock broken, marsh drained — but for a grove and a hill kept for the works.
  for (let y = RING[1]; y <= RING[3]; y++) for (let x = RING[0]; x <= RING[2]; x++) {
    const i = tile(x, y);
    const t = s.map.terrain[i];
    if (inRect(GROVE, x, y)) {
      if (t !== Terrain.Water) {
        s.map.terrain[i] = Terrain.Forest;
        s.map.meta[i] = TILE_WOOD;
        s.map.overlay[i] = Overlay.None;
      }
      continue;
    }
    if (inRect(HILL, x, y) && t !== Terrain.Water) s.map.terrain[i] = Terrain.Hill;
    else if (t === Terrain.Forest || t === Terrain.Marsh || (t === Terrain.Hill && !inRect(HILL, x, y))) s.map.terrain[i] = Terrain.Grass;
    if (s.map.overlay[i] !== Overlay.None) {
      s.map.overlay[i] = Overlay.None;
      s.map.meta[i] = 0;
    }
  }

  // The avenues between the districts, out to the gates.
  const [hx, hy] = [hall.x + Math.floor(hall.w / 2), hall.y + hall.h];
  avenue(s, hx, RING[1], hx, hall.y - 1); // north avenue, to the north gate
  avenue(s, RING[0] + 1, hy, RING[2], hy); // the east–west avenue under the hall
  avenue(s, hx, hy, hx, RING[3]); // south avenue, to the south gate
  avenue(s, 63, RING[1], 63, RING[3]); // the long street between the town and the works
  avenue(s, 63, 36, RING[2], 36); // between entertainment and industry
  avenue(s, 20, 58, RING[2], 58); // between the homes and the farms
  // …and on beyond two of the gates, to the camps.
  avenue(s, RING[2], hy, RING[2] + 12, hy);
  avenue(s, hx, RING[3], hx, RING[3] + 6);

  // The people the buildings need before they can be built: an artist, a scientist.
  makeVillager(s, hall.id, "artist");
  makeVillager(s, hall.id, "scientist");

  const built: Structure[] = [];
  const put = (type: StructureType, level: number, r: Rect, relax?: Rule, near?: [number, number]) => {
    const st = raise(s, type, level, r, relax, near);
    if (st) built.push(st);
    return st;
  };

  // The garrison, north of the hall.
  put("barracks", 40, GARRISON, undefined, [26, 8]);
  put("armyschool", 40, GARRISON, undefined, [48, 8]);
  put("archery", 30, GARRISON, undefined, [28, 16]);
  put("armoury", 40, GARRISON, undefined, [50, 16]);
  const spire = put("wizardhut", 40, GARRISON, undefined, [38, 10]);

  // The homes, south of the hall.
  for (let k = 0; k < 14; k++) put("house", 30, HOMES, undefined, [23 + (k % 7) * 6, 34 + Math.floor(k / 7) * 12]);
  put("apartment", 30, HOMES, undefined, [56, 52]);
  put("school", 40, HOMES, undefined, [50, 44]);
  put("kitchen", 40, HOMES, undefined, [30, 41]);
  put("kitchen", 40, HOMES, undefined, [48, 36]);
  put("pitfire", 20, HOMES, undefined, [40, 46]);
  put("pitfire", 20, HOMES, undefined, [26, 50]);

  // Entertainment, north-east.
  const museum = put("museum", 30, FUN, undefined, [74, 8]);
  put("market", 30, FUN, undefined, [90, 10]);
  put("market", 30, FUN, undefined, [74, 22]);
  put("nobleyard", 30, FUN, undefined, [96, 24]);
  put("pitfire", 25, FUN, undefined, [88, 22]);
  for (const at of [[70, 16], [82, 30], [100, 8], [106, 18]] as [number, number][]) put("brazier", 1, FUN, undefined, at);

  // Industry, east.
  const forge = put("forge", 40, WORKS, undefined, [70, 42]);
  put("refinery", 40, WORKS, undefined, [82, 42]);
  const lab = put("laboratory", 40, WORKS, undefined, [72, 54]);
  // The newer laboratories stand by the old one: the alchemist, the observatory, the mythic laboratory.
  const alch = put("alchemy", 25, WORKS, undefined, [78, 48]);
  const obs = put("observatory", 25, WORKS, undefined, [90, 48]);
  if (alch) alch.mode = "quicksilver";
  if (obs) obs.mode = "starchart";
  const mlab = put("mythiclab", 20, WORKS, undefined, [96, 40]);
  for (const at of [[84, 54], [70, 64], [84, 64]] as [number, number][]) put("storehouse", 30, WORKS, undefined, at);
  const mine = put("mine", 30, HILL, undefined, [102, 44]);
  put("lumbercamp", 40, WORKS, undefined, [95, 62]);

  // The farms, along the river, under their own army point. Every field touches the
  // watermill that waters it, so the mills go down first, on the bank, and the
  // fields round each.
  const crops = ["potato", "wheat", "cabbage", "carrot", "barley", "onion", "bean", "pumpkin", "grape", "corn", "garlic", "turnip"];
  const farms: Structure[] = [];
  const mills = [64, 76, 88].map((y) => put("watermill", 30, FARMS, undefined, [18, y])).filter(Boolean) as Structure[];
  for (const m of mills) {
    for (const [dx, dy] of [[m.w, 0], [m.w, 2], [0, m.h], [2, m.h], [0, -3], [m.w + 3, 0]]) {
      if (farms.length >= crops.length) break;
      const f = put("farm", 25, FARMS, undefined, [m.x + dx, m.y + dy]);
      if (f) {
        f.mode = crops[farms.length];
        farms.push(f);
      }
    }
  }
  put("fishery", 40, FARMS, undefined, [18, 80]);
  put("waterfarm", 25, FARMS, undefined, [20, 88]);
  put("icefactory", 30, FARMS, undefined, [20, 62]);
  const farmCamp = put("armypoint", 30, FARMS, campsAllowed, [52, 86]);
  put("pitfire", 20, FARMS, undefined, [44, 80]);

  // The camps outside the gates, on ground cleared for them.
  for (const r of [[RING[2] + 2, hy - 10, RING[2] + 18, hy + 10], [hx - 14, RING[3] + 1, hx + 14, RING[3] + 14]] as Rect[]) {
    for (let y = r[1]; y <= r[3]; y++) for (let x = r[0]; x <= r[2]; x++) {
      const i = tile(x, y);
      if (s.map.terrain[i] === Terrain.Forest || s.map.terrain[i] === Terrain.Marsh) s.map.terrain[i] = Terrain.Grass;
      if (s.map.overlay[i] === Overlay.Tree || s.map.overlay[i] === Overlay.Rock || s.map.overlay[i] === Overlay.Crop || s.map.overlay[i] === Overlay.Debris) {
        s.map.overlay[i] = Overlay.None;
        s.map.meta[i] = 0;
      }
    }
  }
  const eastCamp = put("armypoint", 30, [RING[2] + 3, hy - 8, RING[2] + 16, hy + 8], campsAllowed);
  const southCamp = put("armypoint", 30, [hx - 12, RING[3] + 2, hx + 12, RING[3] + 12], campsAllowed);

  // Lamps along the avenues.
  for (const [x, y] of [[hx + 2, 12], [hx + 2, 40], [hx + 2, 70], [hx + 2, 90], [70, hy + 2], [90, hy + 2], [104, hy + 2], [66, 20], [66, 48], [66, 80], [30, 60], [90, 60]] as [number, number][]) {
    const at = spotIn(s, "lamppost", [x - 2, y - 2, x + 2, y + 2]);
    if (at) built.push(makeStructure(s, "lamppost", at[0], at[1], true));
  }

  // Every door joined to the avenues.
  for (const st of built) if (st.type !== "lamppost" && st.type !== "brazier" && st.type !== "pitfire") roadFrom(s, st);

  // The wall: every tile of the ring at the highest level, gates where the avenues run out.
  const wallTiles: [number, number][] = [];
  for (let x = RING[0]; x <= RING[2]; x++) wallTiles.push([x, RING[1]], [x, RING[3]]);
  for (let y = RING[1] + 1; y < RING[3]; y++) wallTiles.push([RING[0], y], [RING[2], y]);
  const occ = occupancy(s);
  const walls: [number, number][] = [];
  for (const [x, y] of wallTiles) {
    const i = tile(x, y);
    if (s.map.terrain[i] === Terrain.Water || occ[i]) continue; // the river runs through its own gaps
    const gate = s.map.terrain[i] === Terrain.Pavement;
    if (s.map.terrain[i] === Terrain.Forest) s.map.terrain[i] = Terrain.Grass;
    s.map.overlay[i] = gate ? Overlay.Gate : Overlay.Wall;
    s.map.meta[i] = wallMeta(WALL_MAX_LEVEL, wallMaxHp(WALL_MAX_LEVEL, gate));
    walls.push([x, y]);
  }

  // Watchtowers at their highest level, placed until every tile of the wall lies in one's active reach.
  const towers: Structure[] = [];
  const reachOf = (t: Structure) => alertRadius(t);
  const covered = (x: number, y: number) => towers.some((t) => Math.hypot(t.x + t.w / 2 - x, t.y + t.h / 2 - y) <= reachOf(t));
  const inside: Rect = [RING[0] + 2, RING[1] + 2, RING[2] - 2, RING[3] - 2];
  for (let guard = 0; guard < 24; guard++) {
    const open = walls.find(([x, y]) => !covered(x, y));
    if (!open) break;
    const [wx, wy] = open;
    const cx = Math.round(wx + Math.sign((RING[0] + RING[2]) / 2 - wx) * 6);
    const cy = Math.round(wy + Math.sign((RING[1] + RING[3]) / 2 - wy) * 6);
    const at = spotIn(s, "watchtower", inside, undefined, [cx, cy]);
    if (!at) break;
    const t = makeStructure(s, "watchtower", at[0], at[1], true);
    t.level = CATALOG.watchtower.maxLevel;
    t.aug = { jewel: 6, eye: 4, heart: 4, feet: { dragon: 5, wyvern: 3 } };
    t.hp = structureMaxHp(t);
    towers.push(t);
  }
  if (spire) spire.aug = { jewel: 8, eye: 5, heart: 3, feet: { dragon: 6 } };

  // Nothing stands in the dark: a lamp beside anything no fire, brazier or lamp reaches.
  for (const st of unlitBuildings(s)) {
    const at = ringOf(st.x, st.y, st.w, st.h).find((i) => checkPlacement(s, "lamppost", i % MAP_W, Math.floor(i / MAP_W)).ok);
    if (at !== undefined) makeStructure(s, "lamppost", at % MAP_W, Math.floor(at / MAP_W), true);
  }

  // The ground of every district but the farms, relaid in stone flags; and every avenue.
  const occ2 = occupancy(s);
  for (let y = RING[1] + 1; y < RING[3]; y++) for (let x = RING[0] + 1; x < RING[2]; x++) {
    const i = tile(x, y);
    const t = s.map.terrain[i];
    if (t === Terrain.Pavement) {
      paving[i] = 1;
      continue;
    }
    const district = inRect(GARRISON, x, y) || inRect(HOMES, x, y) || inRect(FUN, x, y) || (inRect(WORKS, x, y) && !inRect(GROVE, x, y) && !inRect(HILL, x, y)) || (x >= 20 && x <= 61 && y >= 21 && y <= 30);
    if (!district || occ2[i] || t === Terrain.Water || t === Terrain.Forest || s.map.overlay[i] !== Overlay.None) continue;
    s.map.terrain[i] = Terrain.Pavement;
    paving[i] = 1;
  }

  // The people: a home and a trade for everyone, the best of each trade, and three legends.
  const homes = s.structures.filter((x) => x.type === "house");
  const homeFor = () => homes.find((h) => residents(s, h).length < beds(s, h))?.id ?? hall.id;
  for (const v of s.villagers) v.house = homeFor();
  const topOf = (role: Role) => (LADDERS[role]?.length ?? 8) - 1;
  for (const st of s.structures) {
    const def = CATALOG[st.type];
    if (!def.workRole || st.type === "armypoint") continue;
    const n = Math.min(3, def.slots(st.level)) - st.workers.length;
    for (let k = 0; k < n; k++) {
      const existing = s.villagers.find((v) => v.role === def.workRole && !v.work);
      const v = existing ?? makeVillager(s, homeFor(), def.workRole);
      v.rank = Math.max(v.rank, Math.min(12, topOf(def.workRole)));
      assign(s, v, st);
    }
  }
  const legend = (role: Role, where: Structure | null | undefined, l: "steward" | "earthshaper" | "sage") => {
    if (!where) return;
    const v = makeVillager(s, homeFor(), role);
    v.rank = topOf(role);
    v.health = 100;
    v.legend = l;
    assign(s, v, where);
  };
  legend("chef", s.structures.find((x) => x.type === "kitchen"), "steward");
  legend("geologist", mine, "earthshaper");
  legend("farmhand", farms[0], "sage");
  if (lab && !lab.workers.length) {
    const sci = s.villagers.find((v) => v.role === "scientist");
    if (sci) assign(s, sci, lab);
  }
  if (museum && !museum.workers.some((id) => s.villagers.find((v) => v.id === id)?.role === "artist")) {
    const artist = s.villagers.find((v) => v.role === "artist" && !v.work);
    if (artist) assign(s, artist, museum);
  }
  while (s.villagers.length < 90) makeVillager(s, homeFor());
  for (const v of s.villagers) {
    v.rank = Math.max(v.rank, 6);
    v.happy = 88;
    v.health = Math.max(v.health, 95);
  }
  const foreman = s.villagers.find((v) => v.role !== "idle" && v.rank >= 5 && !v.legend);
  if (foreman) foreman.nightShift = true;
  for (const h of homes) h.hearth = "boiler";

  // The garrison: soldiers on every tower and camp, an Emblem Knight leading each camp, Grand Wizards on the towers.
  const posts = [...towers, ...[farmCamp, eastCamp, southCamp].filter(Boolean) as Structure[]];
  const enlist = (role: Role, rank: number, post: Structure | undefined, gear: { weapon: string; armour: string }) => {
    const v = makeVillager(s, homeFor(), role);
    v.rank = rank;
    v.happy = 90;
    v.gear = gear;
    v.guard = post?.id ?? null;
    return v;
  };
  // Bowmen, every one: twenty years of wyverns have taught the town what brings down a flier.
  for (let k = 0; k < 32; k++) enlist("infantry", 22 + (k % 5), posts[k % posts.length], { weapon: "wyrmbow", armour: "bonemail" });
  ([farmCamp, eastCamp, southCamp].filter(Boolean) as Structure[]).forEach((c, k) => {
    const lead = enlist("knight", 26 + k * 6, c, { weapon: "oathblade", armour: "aegis" });
    lead.work = c.id;
    c.workers.push(lead.id);
  });
  // Knights ride from the camps, where there is room to charge; a dragon over the rooftops is the bowmen's.
  // The east camp, on the road the dragons come by, keeps only its captain-knight.
  const camps = [farmCamp, southCamp].filter(Boolean) as Structure[];
  for (let k = 0; k < 3; k++) enlist("knight", 23 + k * 3, camps[k % Math.max(1, camps.length)] ?? towers[0], { weapon: "oathblade", armour: "aegis" });
  const wizards = Array.from({ length: 5 }, (_, k) => enlist("wizard", 15 + k * 20, towers[k % Math.max(1, towers.length)], { weapon: "hexstaff", armour: "starweave" }));

  // The champions. The eastern camp's knight wears the one crown; the eldest wizard reads a Book of Enlightenment.
  const kingKnight = s.villagers.filter((v) => v.role === "knight").sort((a, b) => b.rank - a.rank)[0];
  if (kingKnight) {
    kingKnight.rank = 64;
    kingKnight.emblem = { code: "preview-oath", name: "Oath of the First Hall", attribute: "FAITH", depth: 9 };
    kingKnight.gear = {
      weapon: "dawnbreaker", armour: "aegis-first-king", helm: "crown-of-the-realm", boots: "boots-legendary-3",
      ring: "ring-mythic-light", amulet: "amulet-legendary-6", relic: "relic-mythic-light",
    };
    kingKnight.champion = "king";
  }
  const eldest = wizards[wizards.length - 1];
  eldest.emblem = { code: "preview-stars", name: "The Far Sky", attribute: "ABSTRACT", depth: 12 };
  eldest.gear = {
    weapon: "starweaver-rod", armour: "mantle-of-stars", helm: "helm-mythic-space", boots: "boots-mythic-space",
    ring: "seal-of-the-void", amulet: "amulet-mythic-space", relic: "book:preview-stars",
  };
  eldest.champion = "master";
  // A second Master fell to the last elder dragon, and stands in stone in the hall, half restored.
  const fallen = makeVillager(s, homeFor(), "wizard");
  fallen.rank = 60;
  fallen.emblem = { code: "preview-deep", name: "Deep Water", attribute: "MIND", depth: 7 };
  fallen.gear = {
    weapon: "staff-mythic-dark", armour: "robe-mythic-dark", helm: "helm-legendary-2", boots: "boots-legendary-5",
    ring: "ring-legendary-1", amulet: "eye-of-night", relic: "book:preview-deep",
  };
  fallen.champion = "master";
  s.villagers = s.villagers.filter((v) => v !== fallen);
  fallen.statue = { since: s.time - 3 * 24 * 60, restore: 0.55, fuel: 0.2 };
  (s.statues ??= []).push(fallen);
  s.singletons = [
    "crown-of-the-realm", "book:preview-stars", "book:preview-deep", "dawnbreaker", "aegis-first-king", "starweaver-rod",
    "mantle-of-stars", "seal-of-the-void", "eye-of-night",
  ];
  // The Eye of Time: a woodsman who came home from the fog fifty-seven times.
  const eye = makeVillager(s, homeFor(), "seer");
  eye.level = 14;
  eye.excursions = 57;
  // Twenty years of work: the town's hands are old hands.
  for (const v of s.villagers) if (!["infantry", "archer", "heavy", "wizard", "knight"].includes(v.role)) v.level = Math.max(v.level ?? 1, 6 + (v.id % 9));
  if (mlab) mlab.mode = "fireward";

  // Stores full of what twenty years have brought in.
  Object.assign(s.res, {
    coin: 40000, wood: 6000, stone: 6000, meals: 5000, potato: 3000, wheat: 2000, cabbage: 800, coal: 2000, iron: 1200, silver: 1500, gold: 400,
    platinum: 120, diamond: 60, mithril: 40, planks: 900, bricks: 900, ingots: 600, torches: 80, tools: 80,
    quicksilver: 40, starchart: 12, fireward: 2, waterward: 1, earthward: 1, airward: 1, thunderward: 1, lightward: 1, darkward: 1, timeward: 1, spaceward: 1,
  });
  if (forge) {
    store(s, "jewel", 20);
    store(s, "heart", 6);
    store(s, "eye", 6);
    store(s, "foot:dragon", 4);
    for (const id of ["essence-water-lesser", "essence-fire-greater", "gem-ruby-radiant", "gem-sapphire-cut", "metal-adamant", "reagent-dragons-blood", "trophy-dragon", "sword-legendary-2", "bow-mythic-air", "curio-idol"]) store(s, id, id.startsWith("essence") ? 6 : 1);
  }
  const t = stats(s);
  t.raidsWon = 240;
  t.sealed = Math.max(4, sealedNear);
  t.winters = HALL_YEARS;
  for (const st of s.structures) t.built[st.type] = (t.built[st.type] ?? 0) + 1;
  s.mood = 82;
  s.log.push({ t: s.time, text: `Year ${HALL_YEARS + 1}. The hall stands at level 100 behind walls of the highest stone; the gates near the town were sealed long ago.`, tone: "info" });
  // And the dragons come for the hall.
  s.raid = {
    arrivesAt: s.time + 45, party: [{ kind: "dragon", level: 55, count: 2 }, { kind: "wyvern", level: 26, count: 4 }],
    side: "east", target: hall.id, phase: "incoming", combatants: [], projectiles: [], clock: 0, nextId: 1, archetype: "K",
  };
  s.log.push({ t: s.time, text: "Two dragons and their wyverns have been seen over the eastern hills, making for the hall.", tone: "bad" });
  return s;
}
