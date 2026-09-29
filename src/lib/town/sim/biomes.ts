import type { GameState, ResourceKey } from "./types";

/**
 * Maps (design §17): the land a town is founded on.
 *
 * A new game picks one of three at random:
 *
 * - **The green country** (temperate): river, woods, meadows, hills and marsh.
 *   Four seasons, hard winters. Everything the game had before.
 * - **The desert**: dunes and mesas, a thin river in a wadi, palm oases where
 *   the water stands, salt pans in the low ground. Hot days, cold nights, a
 *   mild wet winter with no ice, a summer that scorches the fields. Dates,
 *   millet, chickpeas, melons and saffron; scorpions, jackals, mummies, the
 *   sandworm, the djinn and the sphinx.
 * - **The floating isles** (sky): islands adrift in open sky. The town's
 *   island is large; the rest are scattered, reached by bridges laid over
 *   the void. Cold and windy. Cloudberries, sunflowers, starfruit and
 *   windroot; pixies, sky rays, cloud jellies, thunderbirds, storm giants
 *   and the sky serpent.
 *
 * Each map keeps a set of the old monsters that belong there (bats in the
 * desert tombs, griffins on the isles). Anything else the land would send —
 * a goblin to a desert, a troll to the isles — arrives as the local thing
 * nearest it in strength (`localize`), so every raid, lair and roaming band
 * is of the map it comes to.
 */

export type Biome = "temperate" | "desert" | "skyisles";
export const BIOMES: Biome[] = ["temperate", "desert", "skyisles"];

export interface BiomeDef {
  name: string;
  blurb: string;
  /** Degrees on the seasonal mean, and a multiplier on the day's swing. */
  dT: number;
  swing: number;
  /** Chance a wet regime holds, as a share of the green country's. */
  wet: number;
  /** Wind on the green country's. */
  wind: number;
  /** Whether winter ices the ground and the fields. */
  freezes: boolean;
  /** Field yield by season, in place of the green country's. */
  seasonYield: Record<"spring" | "summer" | "autumn" | "winter", number>;
  /** Crops that grow here, land and water: the land ones commonest first, as wild patches spread out from the hall. */
  land: readonly string[];
  water: readonly string[];
  /** Crops that grow through winter. */
  winterCrops: readonly string[];
  /** Terrain names on this map, by Terrain value. */
  terrain: Record<number, string>;
}

/** The crops each new map adds to the green country's. */
export const DESERT_CROPS = ["date", "millet", "chickpea", "melon", "saffron"] as const;
export const SKY_CROPS = ["cloudberry", "sunflower", "starfruit", "windroot"] as const;
export const BIOME_CROPS = [...DESERT_CROPS, ...SKY_CROPS] as const;

export const BIOME_DEFS: Record<Biome, BiomeDef> = {
  temperate: {
    name: "The green country",
    blurb: "River, woods and meadow; four seasons and a hard winter.",
    dT: 0, swing: 1, wet: 1, wind: 1, freezes: true,
    seasonYield: { spring: 1, summer: 1.1, autumn: 1.2, winter: 0.3 },
    land: ["potato", "wheat", "grape", "herb", "cabbage", "carrot", "pumpkin", "barley", "onion", "bean", "turnip", "corn", "strawberry", "garlic"],
    water: ["rice", "taro", "lotus", "reed", "watercress", "chestnut"],
    winterCrops: ["potato"],
    terrain: { 0: "Grass", 1: "Water", 2: "Road", 3: "Forest", 4: "Riverbank", 5: "Meadow", 6: "Hills", 7: "Marsh", 8: "Open sky" },
  },
  desert: {
    name: "The desert",
    blurb: "Dunes, mesas and a thin river; palm oases, salt pans, scorching summers and a mild winter.",
    dT: 11, swing: 1.9, wet: 0.2, wind: 1.1, freezes: false,
    seasonYield: { spring: 1.1, summer: 0.6, autumn: 1, winter: 0.9 },
    land: ["millet", "date", "chickpea", "onion", "barley", "bean", "melon", "garlic", "grape", "herb", "saffron"],
    water: ["rice", "lotus", "reed"],
    winterCrops: ["date", "millet", "chickpea", "onion", "garlic", "barley"],
    terrain: { 0: "Sand", 1: "Water", 2: "Road", 3: "Palm grove", 4: "Wet sand", 5: "Oasis", 6: "Mesa", 7: "Salt pan", 8: "Open sky" },
  },
  skyisles: {
    name: "The floating isles",
    blurb: "Islands adrift in open sky, reached by bridges; cold, bright and windy.",
    dT: -3, swing: 0.8, wet: 1.2, wind: 1.5, freezes: true,
    seasonYield: { spring: 1, summer: 1.15, autumn: 1.1, winter: 0.3 },
    land: ["potato", "windroot", "wheat", "cabbage", "carrot", "turnip", "sunflower", "cloudberry", "strawberry", "starfruit", "herb"],
    water: ["watercress", "lotus", "reed"],
    winterCrops: ["potato", "windroot", "cloudberry"],
    terrain: { 0: "Grass", 1: "Water", 2: "Road", 3: "Forest", 4: "Shore", 5: "Meadow", 6: "Crags", 7: "Mire", 8: "Open sky" },
  },
};

export const biomeOf = (s: Pick<GameState, "biome">): Biome => s.biome ?? "temperate";
export const biomeDef = (s: Pick<GameState, "biome">) => BIOME_DEFS[biomeOf(s)];

/** A map for a new game, at random. */
export const pickBiome = (roll: number): Biome => BIOMES[Math.min(BIOMES.length - 1, Math.floor(roll * BIOMES.length))];

/** Whether this winter ices the ground, the fields and the river. */
export const iceWinter = (s: Pick<GameState, "biome">, winter: boolean) => winter && biomeDef(s).freezes;

export const landCrops = (s: Pick<GameState, "biome">) => biomeDef(s).land;
export const waterCrops = (s: Pick<GameState, "biome">) => biomeDef(s).water;
export const growsHere = (s: Pick<GameState, "biome">, crop: string) => biomeDef(s).land.includes(crop) || biomeDef(s).water.includes(crop);

// ── Monsters ───────────────────────────────────────────────

/** The monsters each map adds. */
export const DESERT_MONSTERS = ["scorpion", "jackal", "mummy", "sandworm", "djinn", "sphinx"] as const;
export const SKY_MONSTERS = ["pixie", "skyray", "cloudjelly", "thunderbird", "stormgiant", "skyserpent"] as const;
export const BIOME_MONSTERS = new Set<string>([...DESERT_MONSTERS, ...SKY_MONSTERS]);

/** The green country's own that also belong on each new map. */
const KEEP: Record<Exclude<Biome, "temperate">, string[]> = {
  desert: ["bat", "spider", "skeleton", "mimic", "salamander", "basilisk", "harpy", "ghoul", "griffin", "minotaur", "golem", "ogre", "cyclops", "lich", "wyvern", "demon", "dragon", "gashadokuro"],
  skyisles: ["bat", "wisp", "harpy", "gargoyle", "griffin", "tengu", "wraith", "banshee", "yurei", "wyvern", "dragon", "golem", "mimic", "nian", "demon"],
};
/** The mythic nine come anywhere: they are older than the map. */
const MYTHIC = ["elderdragon", "phoenix", "leviathan", "behemoth", "stormroc", "raiju", "seraph", "shadowcolossus", "voidwalker"];

/** Whether a kind belongs on a map. */
export function native(biome: Biome, kind: string): boolean {
  if (MYTHIC.includes(kind)) return true;
  if (biome === "temperate") return !BIOME_MONSTERS.has(kind);
  return (biome === "desert" ? (DESERT_MONSTERS as readonly string[]) : (SKY_MONSTERS as readonly string[])).includes(kind) || KEEP[biome].includes(kind);
}

export interface Beast {
  kind: string;
  min: number;
  flying?: boolean;
  legendary?: boolean;
  night?: boolean;
  weight: number;
}

const hashOf = (k: string) => {
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
};

/**
 * The local stand-in for a kind that does not belong on this map: the native
 * thing nearest it in strength, on the wing if it flew, legendary if it was,
 * a night thing for a night thing. Among near-equals the kind's own name
 * decides, so a goblin always becomes the same thing and the substitutes
 * spread across the natives instead of piling onto one.
 */
export function localize(biome: Biome, kind: string, all: Record<string, Beast>): string {
  if (native(biome, kind) || !all[kind]) return kind;
  const src = all[kind];
  const score = (d: Beast) =>
    Math.abs(Math.log((d.min + 1) / (src.min + 1))) * 4 + (!!d.flying !== !!src.flying ? 2 : 0) + (!!d.legendary !== !!src.legendary ? 30 : 0) + (!!d.night !== !!src.night ? 0.5 : 0);
  const natives = Object.values(all).filter((d) => native(biome, d.kind) && !MYTHIC.includes(d.kind) && d.weight > 0);
  if (!natives.length) return kind;
  const best = Math.min(...natives.map(score));
  const near = natives.filter((d) => score(d) <= best + 1).sort((a, b) => a.kind.localeCompare(b.kind));
  return near[hashOf(kind) % near.length].kind;
}

// ── Stores and the table ───────────────────────────────────

/** Food value, kcal per unit, for the new crops. */
export const BIOME_KCAL: Record<string, number> = { date: 2800, millet: 3700, chickpea: 3600, melon: 340, saffron: 300, cloudberry: 500, sunflower: 5800, starfruit: 310, windroot: 700 };
/** Vitamin C, mg per unit. */
export const BIOME_VITC: Record<string, number> = { date: 4, millet: 0, chickpea: 40, melon: 370, saffron: 800, cloudberry: 1500, sunflower: 14, starfruit: 340, windroot: 180 };
/** Spoilage k at 20 °C, per game day, as the stores' K20 (./stores): dried dates and grain keep, berries do not. */
export const BIOME_SPOIL: Record<string, number> = { date: 0.05, millet: 0.01, chickpea: 0.01, melon: 0.78, saffron: 0.01, cloudberry: 2.6, sunflower: 0.01, starfruit: 0.78, windroot: 0.078 };
/** Base field yield, as CROP_YIELD. */
export const BIOME_YIELD: Record<string, number> = { date: 6, millet: 9, chickpea: 7, melon: 5, saffron: 2, cloudberry: 4, sunflower: 7, starfruit: 4, windroot: 8 };
/** Market value, coin per unit. */
export const BIOME_PRICE: Record<string, number> = { date: 3, millet: 1.2, chickpea: 1.6, melon: 2.5, saffron: 14, cloudberry: 4, sunflower: 1.8, starfruit: 5, windroot: 1.4 };
/** What each draws from the soil, as the soil's CROP_SOIL (./soil): chickpeas, like beans, give nitrogen back. */
export const BIOME_SOIL: Record<string, { cycle: number; N: number; P: number; O: number }> = {
  date: { cycle: 6, N: 3, P: 0.5, O: 0 }, millet: { cycle: 4, N: 3, P: 0.5, O: -0.03 }, chickpea: { cycle: 5, N: -4, P: 0.6, O: 0.02 },
  melon: { cycle: 5, N: 5, P: 0.8, O: -0.04 }, saffron: { cycle: 5, N: 2, P: 0.3, O: -0.02 }, cloudberry: { cycle: 4, N: 2, P: 0.3, O: 0 },
  sunflower: { cycle: 5, N: 5, P: 0.9, O: -0.05 }, starfruit: { cycle: 6, N: 3, P: 0.5, O: 0 }, windroot: { cycle: 3, N: 3, P: 0.5, O: -0.03 },
};

export const cropKeys = (): ResourceKey[] => [...BIOME_CROPS] as ResourceKey[];
