import { CATALOG, censusKey, baseBeds } from "./catalog";
import {
  checkPlacement, clearArea, generateMap, paintCountry, idx, isGuardPost, occupancy, riverCenter, ringOf, rng, unlitBuildings, MILITARY_TYPES,
} from "./world";
import {
  DAY_MIN, MAP_H, MAP_W, MILITARY, Overlay, RESOURCE_KEYS, SEASON_LENGTH, SEASONS, Terrain, YEAR_DAYS,
  type GameState, type Resources, type Role, type Season, type Structure, type StructureType, type Villager,
} from "./types";
import { MATURE, TILE_WOOD, treeMeta } from "./woods";
import { placeLairs } from "./wilds";
import { FOG } from "./vision";
import { sowWild } from "./forage";
import { initSurvival, initVillager } from "./survival";

/**
 * Founding a town, and the read-only questions everything else asks of it:
 * what time and season it is, who lives here, who can fight.
 */

const SYLLABLES = ["al", "bra", "cel", "dor", "el", "fen", "gar", "hal", "is", "jor", "kel", "lin", "mar", "nor", "os", "per", "quin", "ros", "syl", "tor", "ul", "ver", "wyn", "yl", "zan"];

export function villagerName(seed: number): string {
  const r = rng(seed * 7919 + 13);
  const n = 2 + Math.floor(r() * 2);
  let s = "";
  for (let i = 0; i < n; i++) s += SYLLABLES[Math.floor(r() * SYLLABLES.length)];
  return s[0].toUpperCase() + s.slice(1);
}

export function emptyResources(): Resources {
  return Object.fromEntries(RESOURCE_KEYS.map((k) => [k, 0])) as Resources;
}

export function makeStructure(s: GameState, type: StructureType, x: number, y: number, built: boolean): Structure {
  const def = CATALOG[type];
  const st: Structure = {
    id: s.nextId++,
    type,
    x,
    y,
    w: def.w,
    h: def.h,
    level: 1,
    hp: def.hpPerLevel,
    condition: 100,
    workers: [],
    buildUntil: built ? undefined : s.time + def.buildHours * 60,
  };
  // The ground it stands on: meadow and hills change what a building yields.
  const tally = new Map<number, number>();
  for (let yy = y; yy < y + def.h; yy++) for (let xx = x; xx < x + def.w; xx++) {
    if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue;
    const t = s.map.terrain[yy * MAP_W + xx];
    tally.set(t, (tally.get(t) ?? 0) + 1);
  }
  const most = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (most && (most[0] === Terrain.Meadow || most[0] === Terrain.Hill) && most[1] * 2 >= def.w * def.h) st.ground = most[0];
  if (type === "house" || type === "apartment") {
    st.bedUpgrades = 0;
    st.utilities = [];
  }
  if (type === "farm") st.mode = "potato";
  if (type === "waterfarm") st.mode = "rice";
  if (type === "refinery") st.mode = "planks";
  if (type === "laboratory") st.mode = "tonic";
  // A new fire's grate is empty: the town has to load it.
  if (type === "pitfire") st.fuel = 0;
  if (type === "brazier") st.fuel = 2;
  s.structures.push(st);
  return st;
}

/** A name no living villager has, so the log never speaks of two of anyone. */
function freshName(s: GameState): string {
  // Seeded as before (the id about to be given, plus one), so a town's first names do not change.
  const seed = s.nextId + 1 + s.seed;
  let name = villagerName(seed);
  for (let k = 1; k < 40 && s.villagers.some((v) => v.name === name); k++) name = villagerName(seed + k * 104729);
  return name;
}

export function makeVillager(s: GameState, house: number | null, role: Role = "idle"): Villager {
  const name = freshName(s);
  const v: Villager = {
    id: s.nextId++,
    name,
    house,
    role,
    rank: 0,
    xp: 0,
    health: 100,
    happy: 70,
    work: null,
  };
  s.villagers.push(v);
  if (s.survivalV === 1) initVillager(s, v);
  return v;
}

/**
 * A new town: the map, a town hall, a road, two houses, a fire, a watermill
 * on the river with a field beside it, a kitchen and a market to close the
 * food loop, and six villagers — enough to see every system working from the
 * first minute rather than after an hour of setup.
 */
/**
 * `starter` is a real game's beginning: a level-1 hall, one level-1 home and
 * its two villagers, and the stores to build from. `showcase` is the fuller
 * layout the preview towns (and the headless checks) start from.
 */
export type Founding = "starter" | "showcase";

export function newTown(seed: number, bonus = 0, founding: Founding = "showcase"): GameState {
  const s: GameState = {
    version: 2,
    seed,
    time: 8 * 60, // founded at eight in the morning
    map: generateMap(seed),
    structures: [],
    villagers: [],
    nextId: 1,
    res: emptyResources(),
    mood: 72,
    hunger: 85,
    debuffs: [],
    festivalUntil: 0,
    raid: null,
    // Three days' grace before the first raid: long enough to build a fire,
    // a barracks and a tower, short enough that the threat is felt early.
    nextRaidAt: 2 * 24 * 60,
    kills: [],
    clearing: [],
    log: [],
    hourAcc: 0,
    lastVillagerAt: 0,
    deaths: 0,
    woodsV: 1,
    ranksV: 1,
    terrainV: 1,
  };
  const m = s.map;
  clearArea(m, 12, 18, 56, 34);

  const pave = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (m.terrain[i] === Terrain.Grass || m.terrain[i] === Terrain.Bank || m.terrain[i] === Terrain.Meadow || m.terrain[i] === Terrain.Hill) m.terrain[i] = Terrain.Pavement;
    }
  };

  makeStructure(s, "townhall", 30, 22, true);
  if (founding === "starter") {
    foundStarter(s, bonus);
    placeLairs(s);
    firstCrops(s);
    initSurvival(s);
    return s;
  }
  pave(20, 29, 60, 29); // high street under the hall
  pave(37, 30, 37, 44); // lane to the market

  makeStructure(s, "house", 23, 30, true);
  makeStructure(s, "house", 29, 30, true);
  // The founders bring a few days' wood for the first fire.
  makeStructure(s, "pitfire", 34, 30, true).fuel = 60;
  // The kitchen stands by the homes it feeds, just behind them.
  makeStructure(s, "kitchen", 29, 33, true);
  makeStructure(s, "market", 38, 34, true);

  // Watermill: the first spot on the river's edge near the fields.
  // The founders know the riverbank before the fog closes in: sight is no bar here.
  let mill: Structure | undefined;
  const fogRules = FOG.rules;
  FOG.rules = false;
  for (let y = 34; y < 44 && !mill; y++) {
    const x0 = riverCenter(y);
    for (let x = x0; x < x0 + 8; x++) {
      if (checkPlacement(s, "watermill", x, y).ok) {
        mill = makeStructure(s, "watermill", x, y, true);
        break;
      }
    }
  }
  FOG.rules = fogRules;
  // Its two fields right beside it, and a lane from them round to the market.
  const fx = mill ? mill.x + mill.w : 22;
  const fy = mill ? mill.y : 34;
  const farmA = makeStructure(s, "farm", fx, fy, true);
  const farmB = makeStructure(s, "farm", fx, fy + 3, true);
  farmB.mode = "wheat";
  pave(fx + 3, fy, fx + 3, fy + 6);
  pave(fx, fy + 6, 37, fy + 6);
  pave(37, 44, 37, fy + 6);

  s.res = starterStores(bonus);

  // Six founders: two in the fields, one at the stove, three idle hands.
  const houses = s.structures.filter((st) => st.type === "house");
  for (let i = 0; i < 6; i++) makeVillager(s, houses[i % houses.length].id);
  const [a, b, c] = s.villagers;
  assign(s, a, farmA);
  assign(s, b, farmB);
  const kitchen = s.structures.find((st) => st.type === "kitchen")!;
  c.role = "chef";
  assign(s, c, kitchen);

  // Whatever the fire does not reach gets a lamp, so the first night's dark
  // finds nothing — the haunts are for towns that outgrow their light.
  for (const st of unlitBuildings(s)) {
    const spot = ringOf(st.x, st.y, st.w, st.h).find((i) => checkPlacement(s, "lamppost", i % MAP_W, Math.floor(i / MAP_W)).ok);
    if (spot !== undefined) makeStructure(s, "lamppost", spot % MAP_W, Math.floor(spot / MAP_W), true);
  }

  s.log.push({ t: s.time, text: "The town is founded. Six villagers, two fields, one fire, a few lamps.", tone: "info" });
  placeLairs(s);
  firstCrops(s);
  // Everything above was placed while the occupancy was empty; confirm the
  // layout is still legal now that it is not, so a bad seed fails loudly.
  void occupancy(s);
  initSurvival(s);
  return s;
}

/** The country a town is founded in already has its wild crops. */
function firstCrops(s: GameState) {
  const r = rng(s.seed * 5 + 3);
  for (let d = 0; d < 8; d++) sowWild(s, r);
}

/** Starting stores: enough to put up a fire, a field and a road or two, and not much more. */
function starterStores(bonus: number): Resources {
  return {
    ...emptyResources(),
    coin: 60 + bonus * 4,
    wood: 120 + bonus * 6,
    stone: 90 + bonus * 5,
    coal: 12 + bonus,
    iron: 6 + bonus,
    potato: 30,
    wheat: 10,
    meals: 30,
    torches: 2,
    silver: Math.floor(bonus / 3),
    gold: Math.floor(bonus / 6),
  };
}

/** A new game: the hall, one home beside it, and the two villagers who live there. */
function foundStarter(s: GameState, bonus: number): GameState {
  const home = makeStructure(s, "house", 23, 30, true);
  s.res = starterStores(bonus);
  makeVillager(s, home.id);
  makeVillager(s, home.id);
  s.log.push({ t: s.time, text: "The town is founded: a hall, one home, two villagers. Everything else is yours to build — start with a fire before the first night.", tone: "info" });
  return s;
}

/**
 * Brings an older save up to date: resources added since it was written
 * start at zero, the forge's store starts empty. Everything else new is
 * optional on the state and read with a default.
 */
export function migrate(s: GameState): GameState {
  s.res = { ...emptyResources(), ...s.res };
  s.armory ??= [];
  // The map has grown. The old ground keeps its place in the top-left
  // corner; new country is surveyed around it.
  if (s.map.w !== MAP_W || s.map.h !== MAP_H) {
    const old = s.map;
    const fresh = generateMap(s.seed);
    for (let y = 0; y < Math.min(old.h, MAP_H); y++) {
      for (let x = 0; x < Math.min(old.w, MAP_W); x++) {
        const o = y * old.w + x;
        const n = y * MAP_W + x;
        fresh.terrain[n] = old.terrain[o];
        fresh.overlay[n] = old.overlay[o];
        fresh.meta[n] = old.meta[o];
      }
    }
    const remap = (t: number) => Math.floor(t / old.w) * MAP_W + (t % old.w);
    s.clearing = s.clearing.map((j) => ({ ...j, tile: remap(j.tile) }));
    s.earthworks = (s.earthworks ?? []).map((j) => ({ ...j, tile: remap(j.tile) }));
    s.map = fresh;
    log(s, "Surveyors have mapped the country beyond the old borders: the land runs further east and south.", "info");
  }
  // One soldier tree, knights from the army school, and no captains apart:
  // archers and heavies join the soldier tree at the matching title, and
  // captains become knights.
  // Lairs lie deep in the fog of every map, old ones included.
  placeLairs(s);
  if (s.ranksV !== 1) {
    for (const v of s.villagers) {
      if (v.role === "archer") {
        v.role = "infantry";
        v.rank = v.rank < 10 ? Math.max(5, Math.min(6, v.rank)) : v.rank < 17 ? 10 : 17;
      } else if (v.role === "heavy") {
        v.role = "infantry";
        v.rank = v.rank < 13 ? 7 : 13;
      } else if ((v.role as string) === "captain") {
        v.role = "knight";
        v.rank = 6;
      }
    }
    s.ranksV = 1;
  }
  // Trees from before growth stages are all grown; forests from before wood
  // stocks start full.
  if (s.woodsV !== 1) {
    for (let i = 0; i < s.map.overlay.length; i++) {
      if (s.map.overlay[i] === Overlay.Tree && s.map.meta[i] < 8) s.map.meta[i] = treeMeta(s.map.meta[i], MATURE);
      if (s.map.terrain[i] === Terrain.Forest) s.map.meta[i] = TILE_WOOD;
    }
    s.woodsV = 1;
  }
  // The survival systems (docs/town-survival-systems.md): an old town inherits a scar of aggro.
  if (s.survivalV !== 1) {
    initSurvival(s);
    log(s, "The land has noticed the town. Cold, hunger, rot and what lives in the fog now answer everything it does.", "bad");
  }
  // A town from before night haunts gets tonight's grace and fair warning.
  if (s.hauntDay === undefined) {
    const c = clock(s.time);
    s.hauntDay = c.hour < 12 ? c.day - 1 : c.day;
    log(s, "A new danger: from tomorrow night, something comes for every building no fire, brazier or lamp reaches.", "bad");
  }
  // Meadows, hills and marsh came later: they are surveyed into the country
  // the town has not yet seen, well clear of anything it has built.
  if (s.terrainV !== 1) {
    const hall = s.structures.find((st) => st.type === "townhall");
    const home: [number, number] = hall ? [hall.x + hall.w / 2, hall.y + hall.h / 2] : [37, 26];
    const occ = new Uint8Array(MAP_W * MAP_H);
    for (const st of s.structures) for (let yy = st.y - 2; yy < st.y + st.h + 2; yy++) for (let xx = st.x - 2; xx < st.x + st.w + 2; xx++) if (xx >= 0 && yy >= 0 && xx < MAP_W && yy < MAP_H) occ[yy * MAP_W + xx] = 1;
    paintCountry(s.map.terrain, s.map.overlay, s.map.meta, s.seed, home, 26, (i) => !s.map.seen?.[i] && !occ[i]);
    s.terrainV = 1;
  }
  return s;
}

/** Puts a villager to work, taking on the building's role if they had none. */
export function assign(s: GameState, v: Villager, st: Structure) {
  const def = CATALOG[st.type];
  if (v.work) unassign(s, v);
  if (def.workRole && (v.role === "idle" || (v.role !== def.workRole && !isSpecialistFor(v.role, st.type)))) {
    v.role = def.workRole;
    v.rank = 0;
    v.xp = 0;
  }
  v.work = st.id;
  if (!st.workers.includes(v.id)) st.workers.push(v.id);
}

/** Specialists keep their own role at the right workplace. */
export function isSpecialistFor(role: Role, type: StructureType) {
  return (role === "biologist" && (type === "farm" || type === "waterfarm")) ||
    (role === "scientist" && (type === "refinery" || type === "laboratory")) ||
    (role === "geologist" && type === "mine") ||
    (role === "chef" && type === "kitchen");
}

export function unassign(s: GameState, v: Villager) {
  const st = s.structures.find((x) => x.id === v.work);
  if (st) st.workers = st.workers.filter((id) => id !== v.id);
  v.work = null;
}

// ── Clock ─────────────────────────────────────────────────

export interface Clock {
  day: number;
  hour: number;
  minute: number;
  season: Season;
  year: number;
  night: boolean;
  /** 0–1 through the current season. */
  seasonProgress: number;
  /** 0 at noon, 1 at midnight — for lighting. */
  darkness: number;
}

export function clock(time: number): Clock {
  const day = Math.floor(time / DAY_MIN);
  const minuteOfDay = time % DAY_MIN;
  const hour = Math.floor(minuteOfDay / 60);
  // Walk the year's seasons to find which one today falls in.
  let into = day % YEAR_DAYS;
  let seasonIndex = 0;
  while (into >= SEASON_LENGTH[SEASONS[seasonIndex]]) into -= SEASON_LENGTH[SEASONS[seasonIndex++]];
  const len = SEASON_LENGTH[SEASONS[seasonIndex]];
  const h = minuteOfDay / 60;
  // Dusk from 18:00, full dark 21:00–04:00, dawn by 07:00.
  let darkness = 0;
  if (h >= 18 && h < 21) darkness = (h - 18) / 3;
  else if (h >= 21 || h < 4) darkness = 1;
  else if (h >= 4 && h < 7) darkness = 1 - (h - 4) / 3;
  return {
    day: day + 1,
    hour,
    minute: Math.floor(minuteOfDay % 60),
    season: SEASONS[seasonIndex],
    year: Math.floor(day / YEAR_DAYS) + 1,
    night: h >= 20 || h < 6,
    seasonProgress: (into + minuteOfDay / DAY_MIN) / len,
    darkness,
  };
}

// ── Queries ───────────────────────────────────────────────

export const byId = (s: GameState, id: number | null | undefined) => (id == null ? undefined : s.structures.find((st) => st.id === id));

export function beds(s: GameState, house: Structure): number {
  // The hall shelters two, so a town that has lost every house can still
  // take in the refugees it needs to rebuild.
  if (house.type === "townhall") return 2;
  if (house.type === "apartment") return baseBeds(house.level) * 2 + 4 + (house.bedUpgrades ?? 0);
  return baseBeds(house.level) + (house.bedUpgrades ?? 0);
}

export const isDwelling = (st: Structure) => (st.type === "house" || st.type === "apartment" || st.type === "townhall") && !st.buildUntil;

export function totalBeds(s: GameState): number {
  return s.structures.filter(isDwelling).reduce((a, h) => a + beds(s, h), 0);
}

export function residents(s: GameState, house: Structure): Villager[] {
  return s.villagers.filter((v) => v.house === house.id);
}

export function census(s: GameState): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of s.villagers) {
    const k = censusKey(v.role, v.rank);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export const isMilitary = (v: Villager) => MILITARY.includes(v.role);

/** Where a troop is garrisoned: the military building of its kind with the fewest. */
export function garrisonOf(s: GameState, v: Villager): Structure | undefined {
  const types: StructureType[] =
    v.role === "wizard" ? ["wizardhut"] : v.role === "knight" ? ["armyschool", "nobleyard"] : ["barracks", "archery", "armoury"];
  return byId(s, v.work) ?? s.structures.find((st) => types.includes(st.type));
}

/**
 * Troops posted to a standing watchtower — the only ones who defend. The
 * rest stay in their barracks whatever comes.
 */
export function countedTroops(s: GameState): Villager[] {
  return s.villagers.filter((v) => isMilitary(v) && v.guard != null && s.structures.some((t) => t.id === v.guard && isGuardPost(t) && !t.buildUntil));
}

/** The troops posted to one tower. */
export const guardsAt = (s: GameState, towerId: number) => s.villagers.filter((v) => isMilitary(v) && v.guard === towerId);

export function militaryCapacity(st: Structure): number {
  return MILITARY_TYPES.includes(st.type) ? 4 * st.level : 0;
}

/** Town power, used to pick how strong a raid it attracts. */
export function townPower(s: GameState): { power: number; avgTroopLevel: number } {
  const hall = s.structures.find((st) => st.type === "townhall");
  const troops = s.villagers.filter(isMilitary);
  const avg = troops.length ? troops.reduce((a, v) => a + Math.max(1, v.rank), 0) / troops.length : 1;
  // A crowded town draws bigger monsters: every six people add a level.
  return { power: (hall?.level ?? 1) + avg + troops.length / 4 + s.villagers.length / 5, avgTroopLevel: avg };
}

export function log(s: GameState, text: string, tone: "good" | "bad" | "info" = "info") {
  s.log.unshift({ t: s.time, text, tone });
  if (s.log.length > 80) s.log.length = 80;
}

// ── Saving ────────────────────────────────────────────────

/**
 * Map layers run-length encoded for the save: long runs of grass, water and
 * empty overlay pack to a few numbers each, so a map many times larger saves
 * and loads in a fraction of the space.
 */
export function rle(a: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; ) {
    let j = i + 1;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(a[i], j - i);
    i = j;
  }
  return out;
}

export function unrle(r: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.length; i += 2) for (let k = 0; k < r[i + 1]; k++) out.push(r[i]);
  return out;
}

/** The save as text: the whole state, with its map layers packed. */
export function packSave(s: GameState): string {
  const { terrain, overlay, meta, seen, paving, ...rest } = s.map;
  return JSON.stringify({ ...s, map: { ...rest, packed: 1, terrain: rle(terrain), overlay: rle(overlay), meta: rle(meta), seen: seen ? rle(seen) : undefined, paving: paving ? rle(paving) : undefined } });
}

/** Reads a save written by `packSave` — or an older, unpacked one. */
export function unpackSave(raw: string): GameState {
  const s = JSON.parse(raw) as GameState & { map: GameState["map"] & { packed?: number } };
  if (s.map.packed) {
    s.map.terrain = unrle(s.map.terrain);
    s.map.overlay = unrle(s.map.overlay);
    s.map.meta = unrle(s.map.meta);
    if (s.map.seen) s.map.seen = unrle(s.map.seen);
    if (s.map.paving) s.map.paving = unrle(s.map.paving);
    delete s.map.packed;
  }
  return s;
}
