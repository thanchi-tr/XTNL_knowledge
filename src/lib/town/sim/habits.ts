import { DESERT_MONSTERS, biomeOf, native, type Biome } from "./biomes";
import { clock, log } from "./state";
import { center, idx, inBounds } from "./world";
import { air, type Regime } from "./weather";
import { MAP_H, MAP_W, Terrain, type GameState, type Season, type Structure } from "./types";
import { CATALOG } from "./catalog";

/**
 * How monsters live on each map, and how the weather moves them (design §18.2).
 *
 * - **When they come.** In the desert's heat — summer, or any heatwave —
 *   most things lie up in the shade by day and come at dusk: a raid due in
 *   the hot hours waits for the evening. Only the things that love heat
 *   (salamanders, djinn, sphinxes, sandworms, demons, dragons) walk at noon.
 * - **What the weather brings.** Each kind of weather favours its own:
 *   sandworms, jackals and djinn ride a sandstorm in; thunderbirds and sky
 *   serpents hunt in a thunderstorm; wisps, pixies and cloud jellies come in
 *   fog; griffins, harpies and sky rays on a gale; kappa in the rain; the
 *   wendigo and the frost giant in a blizzard. Everything else is a little
 *   less willing to come out in it.
 * - **Where they come from.** On the floating isles only what flies crosses
 *   the open sky: a walking raid climbs out of the clouds at the edge of the
 *   town's own island, and a walking band stays on the island it was born on.
 * - **How the ground and the air treat them.** In the desert, anything not
 *   of the desert labours through the sand; in a heatwave it tires. In a
 *   fight the weather takes sides — see `weatherCombat`.
 */

/** What each kind of weather draws out, beyond the ordinary. */
export const WEATHER_LOVERS: Partial<Record<Regime, Record<string, number>>> = {
  sandstorm: { sandworm: 2.5, jackal: 1.6, djinn: 2, scorpion: 1.4, mummy: 1.3 },
  heatwave: { salamander: 2, djinn: 1.5, sphinx: 1.5, sandworm: 1.3 },
  gale: { harpy: 1.8, griffin: 1.6, skyray: 2, thunderbird: 1.5, tengu: 1.5, stormgiant: 1.3 },
  thunder: { thunderbird: 3, skyserpent: 2.2, wyvern: 1.6, stormgiant: 1.8 },
  fog: { pixie: 1.8, cloudjelly: 2, wisp: 2, yurei: 1.8, banshee: 1.6, wraith: 1.5 },
  rain: { kappa: 2, slime: 1.5, serpent: 1.5 },
  blizzard: { wendigo: 2, frostgiant: 2 },
  snow: { wendigo: 1.4, frostgiant: 1.4 },
};
/** Everything else, in that weather. */
const SHUN: Partial<Record<Regime, number>> = { sandstorm: 0.7, heatwave: 0.85, gale: 0.8, thunder: 0.8, blizzard: 0.85 };

/** Things that walk in the desert's noon. */
export const HEAT_LOVERS = new Set(["salamander", "djinn", "sphinx", "sandworm", "demon", "dragon", "phoenix", "elderdragon"]);

/** The desert's hot hours: summer, or a heatwave, from nine to six. */
export const hotHours = (biome: Biome, season: Season, regime: Regime, hour: number) =>
  biome === "desert" && (season === "summer" || regime === "heatwave") && hour >= 9 && hour < 18;

export interface HabitKind {
  kind: string;
  flying?: boolean;
}

/**
 * How willing a kind is to raid now, on this map, in this weather: the
 * multiplier on its weight in the raid table.
 */
export function habitWeight(biome: Biome, def: HabitKind, hour: number, regime: Regime, season: Season): number {
  let w = 1;
  const loves = WEATHER_LOVERS[regime]?.[def.kind];
  if (loves) w *= loves;
  else w *= SHUN[regime] ?? 1;
  if (hotHours(biome, season, regime, hour) && !HEAT_LOVERS.has(def.kind)) w *= 0.25;
  // On the isles the air is the road: walkers must climb up out of the clouds, and a gale keeps them down.
  if (biome === "skyisles" && !def.flying) w *= regime === "gale" ? 0.4 : 0.8;
  return w;
}

/**
 * When a raid will actually come: in the desert's heat, a party that does
 * not love it waits for dusk.
 */
export function arrivalFor(s: GameState, at: number, lead: string): number {
  const c = clock(at);
  const regime = air(s).regime;
  if (!hotHours(biomeOf(s), c.season, regime, c.hour) || HEAT_LOVERS.has(lead)) return at;
  return at + (19 - c.hour) * 60 - (at % 60);
}

/**
 * The land's habits as they stand, in lines: what the hour and the weather
 * are drawing out on this map, and the rules of its ground. For the panel.
 */
export function habitNotes(s: GameState, kinds: { kind: string; name: string; flying?: boolean; weight: number }[]): string[] {
  const c = clock(s.time);
  const regime = air(s).regime;
  const biome = biomeOf(s);
  const out: string[] = [];
  if (hotHours(biome, c.season, regime, c.hour)) out.push("The heat is up: most things lie up in the shade until dusk, and a raid due now comes at nightfall. Only the heat-lovers walk at noon.");
  const drawn = kinds
    .filter((k) => k.weight > 0 && native(biome, k.kind) && (WEATHER_LOVERS[regime]?.[k.kind] ?? 0) > 1)
    .map((k) => k.name.toLowerCase());
  if (drawn.length) out.push(`This weather draws out ${drawn.slice(0, 4).join(", ")}${drawn.length > 4 ? " and more" : ""}; everything else is warier of it.`);
  if (biome === "desert") out.push("Anything not of the desert labours through its sand; sandworms tunnel under walls.");
  if (biome === "skyisles") out.push("Only what flies crosses the open sky: a walking raid climbs out of the clouds at the edge of the town's island, and a walking band never leaves its own. Storm giants step over walls.");
  return out;
}

// ── In the fight ─────────────────────────────────────────────

export interface WeatherCombat {
  /** Guards' alert radius. */
  alert: number;
  /** Ranged defenders' reach and damage. */
  range: number;
  rangedDmg: number;
  /** Flying monsters' pace. */
  flyerSpeed: number;
  /** Seconds between blows for those the heat tires. */
  heat: number;
  /** Thunder-element monsters' blows, in a thunderstorm. */
  thunder: number;
  /** Lightning falls on the field. */
  lightning: boolean;
}

/** What the weather does to a fight, as it stands. */
export function weatherCombat(s: GameState): WeatherCombat {
  const r = air(s).regime;
  const w: WeatherCombat = { alert: 1, range: 1, rangedDmg: 1, flyerSpeed: 1, heat: 1, thunder: 1, lightning: false };
  if (r === "fog") {
    w.alert = 0.6;
    w.range = 0.8;
  } else if (r === "sandstorm") {
    w.alert = 0.7;
    w.range = 0.7;
    w.rangedDmg = 0.75;
  } else if (r === "gale") {
    w.flyerSpeed = 1.3;
    w.rangedDmg = 0.85;
  } else if (r === "thunder") {
    w.lightning = true;
    w.thunder = 1.25;
    w.range = 0.9;
  } else if (r === "heatwave") w.heat = 1.15;
  else if (r === "rain" || r === "snow") w.range = 0.9;
  else if (r === "blizzard") {
    w.alert = 0.7;
    w.range = 0.75;
  }
  return w;
}

/**
 * The desert-born: its own six, and the basilisk and salamander that were
 * always creatures of hot stone. Everything else found there — golems,
 * ogres, skeletons, the old country's migrants — labours through the sand
 * and tires in a heatwave.
 */
export const DESERT_BORN = new Set<string>([...DESERT_MONSTERS, "basilisk", "salamander"]);
export const SAND_SLOW = 0.85;
export const sandSlowed = (biome: Biome, kind: string, flying: boolean) => biome === "desert" && !flying && !DESERT_BORN.has(kind);

/**
 * Where a walking raid climbs out of the clouds on the floating isles: the
 * last solid ground on the way out from its target toward the side it comes
 * from. Null anywhere else, or when that line never reaches open sky.
 */
export function isleEdge(s: GameState, aim: Structure | undefined, side: "east" | "south" | "north" | "west", jitter: number): [number, number] | null {
  if (biomeOf(s) !== "skyisles" || !aim) return null;
  const [cx, cy] = center(aim);
  const [dx, dy] = side === "east" ? [1, 0] : side === "west" ? [-1, 0] : side === "north" ? [0, -1] : [0, 1];
  let x = cx + dy * jitter;
  let y = cy + dx * jitter;
  for (let k = 0; k < 120; k++) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(Math.floor(nx), Math.floor(ny))) return null;
    if (s.map.terrain[idx(Math.floor(nx), Math.floor(ny))] === Terrain.Void) return [Math.max(1.5, Math.min(MAP_W - 1.5, x)), Math.max(1.5, Math.min(MAP_H - 1.5, y))];
    x = nx;
    y = ny;
  }
  return null;
}

// ── In the wilds ────────────────────────────────────────────

/** Whether a band rests this hour: desert things (but the heat-lovers) lie up through the hot hours. */
export function bandRests(s: GameState, kind: string): boolean {
  const c = clock(s.time);
  return hotHours(biomeOf(s), c.season, air(s).regime, c.hour) && !HEAT_LOVERS.has(kind);
}

/** Whether a band may set foot on a tile: on the isles, a walker never steps off its island. */
export function bandCanStand(s: GameState, flying: boolean, x: number, y: number): boolean {
  if (flying || biomeOf(s) !== "skyisles") return true;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return inBounds(tx, ty) && s.map.terrain[idx(tx, ty)] !== Terrain.Void;
}

// ── Storms on the town ─────────────────────────────────────

/** Chance lightning strikes the town in an hour of thunderstorm. */
export const LIGHTNING_CHANCE = 0.3;
const TALL = new Set(["watchtower", "townhall", "wizardhut", "observatory", "armypoint", "mythiclab"]);

/** On the hour: a thunderstorm's lightning finds the tallest things in town. */
export function stormsHourly(s: GameState, r: () => number) {
  if (air(s).regime !== "thunder" || r() >= LIGHTNING_CHANCE) return;
  const tall = s.structures.filter((st) => !st.buildUntil && TALL.has(st.type));
  const pool = tall.length ? tall : s.structures.filter((st) => !st.buildUntil);
  if (!pool.length) return;
  const st = pool[Math.floor(r() * pool.length)];
  const hit = Math.max(1, Math.round(st.hp * 0.08));
  st.hp = Math.max(1, st.hp - hit);
  st.struck = s.time;
  log(s, `Lightning strikes the ${CATALOG[st.type].name.toLowerCase()}. (−${hit} hp)`, "bad");
}
