import type { Attribute } from "@prisma/client";

/**
 * The town simulation's state, as one serialisable object.
 *
 * Everything the game needs to resume lives here and nothing else does: the
 * renderer and the UI are pure functions of this object plus the player's
 * knowledge input. That is what makes save/load a single JSON write, and what
 * keeps the rules testable without a canvas.
 */

// ── Time ──────────────────────────────────────────────────
/** Game minutes per in-game day. */
export const DAY_MIN = 24 * 60;
export type Season = "spring" | "summer" | "autumn" | "winter";
export const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
/** Days in each season. Winter is the long one. */
export const SEASON_LENGTH: Record<Season, number> = { spring: 6, summer: 6, autumn: 6, winter: 10 };
/** Days in a year: the four seasons end to end. */
export const YEAR_DAYS = SEASONS.reduce((a, k) => a + SEASON_LENGTH[k], 0);

// ── Map ───────────────────────────────────────────────────
export const TILE = 8; // world pixels per tile
export const MAP_W = 360;
export const MAP_H = 240;

/* Plain constant objects rather than `const enum`: Next compiles each file
   in isolation, and a const enum imported across files is not inlined. */
export const Terrain = { Grass: 0, Water: 1, Pavement: 2, Forest: 3, Bank: 4 } as const;
export const Overlay = { None: 0, Tree: 1, Rock: 2, Debris: 3, Wall: 4, Gate: 5, Lair: 6, Crop: 7 } as const;

export interface MapState {
  w: number;
  h: number;
  terrain: number[];
  overlay: number[];
  /** Per-tile extra: tree variant, rock kind, wall hp, forest pool, wild crop kind. */
  meta: number[];
  /** 1 where the town has ever seen: the fog lifts to a thin mist there, not the full cloud. */
  seen?: number[];
}

// ── Resources ─────────────────────────────────────────────
export const RESOURCE_KEYS = [
  "coin", "wood", "stone", "coal", "iron", "silver", "platinum", "diamond", "gold", "mithril",
  /** Tools: bought from caravans or made at the refinery; double the pace of digging. */
  "tools",
  /** Torches: packed by knights and wizards to see through the fog. Each burns two hours. */
  "torches",
  "potato", "wheat", "grape", "herb", "cabbage", "carrot", "pumpkin", "barley",
  "onion", "bean", "turnip", "corn", "strawberry", "garlic",
  "rice", "taro", "lotus", "reed", "watercress", "chestnut", "fish",
  "meals", "ice", "planks", "bricks", "ingots", "gunpowder", "poison",
  /** Arcane formula: steadies a wizard's ascension past level 12. */
  "formula",
  /** Laboratory goods: a healing tonic, and fertiliser for the fields. */
  "tonic", "fertiliser",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];
export type Resources = Record<ResourceKey, number>;

export const RAW_FOODS: ResourceKey[] = [
  "potato", "wheat", "grape", "herb", "cabbage", "carrot", "pumpkin", "barley", "onion", "bean", "turnip", "corn", "strawberry", "garlic",
  "rice", "taro", "lotus", "reed", "watercress", "chestnut", "fish",
];

// ── Structures ────────────────────────────────────────────
export type StructureType =
  | "townhall" | "house" | "pitfire" | "school" | "farm" | "waterfarm" | "watermill"
  | "refinery" | "kitchen" | "market" | "barracks" | "archery" | "armoury" | "wizardhut"
  | "nobleyard" | "watchtower" | "icefactory" | "mine" | "lumbercamp" | "forge"
  | "lamppost" | "brazier" | "laboratory" | "fishery"
  | "storehouse" | "armyschool" | "armypoint"
  /** Two duplexes knocked together: not built, made. */
  | "apartment";

export type Crop =
  | "potato" | "wheat" | "grape" | "herb" | "cabbage" | "carrot" | "pumpkin" | "barley"
  | "onion" | "bean" | "turnip" | "corn" | "strawberry" | "garlic";
export type WaterCrop = "rice" | "taro" | "lotus" | "reed" | "watercress" | "chestnut";

export interface Structure {
  id: number;
  type: StructureType;
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  hp: number;
  /** 0–100. Falls while mood is below half; at 0 the building loses a level. */
  condition: number;
  /** Villager ids working here. */
  workers: number[];
  /** Game minute the current build or upgrade completes. */
  buildUntil?: number;
  /** Farm crop / waterfarm crop / refinery recipe / school course. */
  mode?: string;
  /** House: extra beds bought on top of the level's base. */
  bedUpgrades?: number;
  /** House: installed utilities. */
  utilities?: string[];
  /** House: villagers on break until this minute. */
  breakUntil?: number;
  /**
   * School / barracks training in progress. `left` is the work remaining in
   * game minutes at full pace; the pace itself moves with the player's
   * reviews, so there is no fixed finish time. `until` is from older saves.
   */
  training?: { villagerId: number; role: Role; left?: number; until?: number; rank?: number } | null;
  /** Pit fire: fuel units in the grate. Brazier: coal in the bowl. */
  fuel?: number;
  /** Forge: the piece on the anvil. */
  craft?: { item: string; until: number } | null;
}

// ── People ────────────────────────────────────────────────
export type Role =
  | "idle" | "farmhand" | "icer" | "chef" | "scientist" | "geologist" | "commander" | "biologist"
  | "miner" | "lumberjack" | "refiner" | "trader" | "fisher"
  /** Trained at the army school from a veteran; leads an army point. */
  | "captain"
  | "infantry" | "archer" | "heavy" | "wizard" | "knight";

export const MILITARY: Role[] = ["infantry", "archer", "heavy", "wizard", "knight"];

export interface Villager {
  id: number;
  name: string;
  house: number | null;
  role: Role;
  /** Promotion rank on the role's ladder, or combat level for the military. */
  rank: number;
  xp: number;
  health: number;
  happy: number;
  work: number | null;
  /** Bound emblem, for grand wizards and emblem knights. */
  emblem?: { code: string; name: string; attribute: Attribute; depth: number } | null;
  /** Special troops: forged gear, by item id (see ./loot). */
  gear?: { weapon?: string; armour?: string };
  /** Emblem knights: the soldiers who have sworn to them. */
  battalion?: number;
  /** Emblem knights: away on a sortie until this minute. */
  deployedUntil?: number;
  /** Knights and wizards: six pack slots. A torch is `torch`, or `torch:<minutes left>` once lit. */
  pack?: (string | null)[];
  /** Knights and wizards out scouting the fog. */
  scout?: Scout | null;
  /** Knights: when their silver pay first went unpaid. They desert after three days. */
  unpaidSince?: number | null;
  /** The watchtower this troop is posted to. Only posted troops defend. */
  guard?: number | null;
}

// ── Monsters and raids ────────────────────────────────────
export type MonsterKind =
  | "slime" | "bat" | "spider" | "goblin" | "skeleton" | "wolf" | "werewolf" | "wraith"
  | "minotaur" | "troll" | "lich" | "golem" | "wyvern" | "serpent" | "demon" | "dragon" | "elderdragon"
  | "harpy" | "ogre" | "mimic" | "treant" | "salamander" | "frostgiant" | "banshee" | "basilisk"
  | "ghoul" | "gargoyle" | "cyclops" | "vampire" | "hydra" | "griffin" | "wisp" | "wendigo"
  | "oni" | "kappa" | "tengu" | "jiangshi" | "kitsune" | "yurei" | "gashadokuro" | "jorogumo" | "nian";

export interface Combatant {
  id: number;
  side: "monster" | "defender";
  kind: string;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dmg: number;
  /** Seconds between attacks. */
  interval: number;
  cooldown: number;
  /** Tiles. */
  range: number;
  /** Tiles per second. */
  speed: number;
  flying: boolean;
  legendary: boolean;
  /** Defender only: the villager behind the troop. */
  villagerId?: number;
  targetId?: number | null;
  /** Struct target, for monsters breaking buildings or walls. */
  targetStruct?: number | null;
  targetTile?: number | null;
  /** Last time this unit struck, for the swing flash. */
  swingAt?: number;
  /** Static defender: the watchtower it stands for. */
  structId?: number;
  /** A night haunt: sent for one building, and gone once it falls. */
  haunt?: boolean;
  /** A defender who has struck a blow this fight: in line for a field promotion. */
  fought?: boolean;
  /** A monster's last blow on a building or the wall: where, and when (raid clock). */
  hitAt?: [number, number, number];
  /** A dark monster in a pit fire's light: slowed, weakened and burning. */
  scorched?: boolean;
  /** Guards: the tower (or, for the militia, the hall) they answer to. */
  post?: number;
  /** Guards waiting inside their post: unseen, untouchable, not yet called out. */
  inside?: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  tx: number;
  ty: number;
  kind: "arrow" | "bolt" | "fire" | "rock";
  t: number;
}

export type RaidSide = "east" | "south" | "north" | "west";

export interface IncomingMonster {
  kind: MonsterKind;
  level: number;
  count: number;
}

export interface Raid {
  arrivesAt: number;
  /** Everything in the party; the first entry leads and names it. */
  party: IncomingMonster[];
  side: RaidSide;
  /** A second side, when a big party splits to come at the town two ways. */
  flank?: RaidSide;
  /** The building the raid is making for — the further out, the likelier. */
  target?: number;
  /** Levels the raid gained from how far out its target stands. */
  reach?: number;
  /** Where a band out of the fog stood when it turned on the town: it attacks from there. */
  origin?: [number, number];
  phase: "incoming" | "fighting" | "repelled";
  combatants: Combatant[];
  projectiles: Projectile[];
  /** Real seconds of combat elapsed, for animation. */
  clock: number;
  nextId: number;
  started?: boolean;
  /** Pieces of the fight worth telling, for the floating combat text. */
  pops?: { x: number; y: number; text: string; at: number; tone: "hit" | "crit" | "heal" }[];
  /** A night haunt rather than a raid: one dark thing per unlit building. */
  haunt?: { structId: number; kind: MonsterKind; level: number }[];
  /** Spoils taken this fight, and what was left for want of a forge or room in it. */
  spoils?: { kept: Record<string, number>; lost: number };
}

export interface Debuff {
  id: string;
  label: string;
  until: number;
  /** Mood change per hour while active. */
  moodPerHour: number;
  /** Multiplier on all production. */
  production: number;
}

export interface LogLine {
  t: number;
  text: string;
  tone?: "good" | "bad" | "info";
}

export interface CaravanOffer {
  id: string;
  /** What the caravan hands over: a resource, or a piece of gear for the forge's store. */
  get: { res?: ResourceKey; item?: string; qty: number };
  /** What it asks in return — always goods, never coin. */
  give: Partial<Record<ResourceKey, number>>;
  /** Times this trade can still be made. */
  left: number;
}

export interface Caravan {
  name: string;
  arrivedAt: number;
  until: number;
  offers: CaravanOffer[];
}

/** A hero out in the fog with torches: out to a point, then home. */
export interface Scout {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Where home is: the hall's centre when they set out. */
  hx: number;
  hy: number;
  phase: "out" | "back";
  /** Minutes of food still in them; when it runs out they eat a ration, or go hungry. */
  fed?: number;
  /** Minutes wandering lost, torchless in the fog. Too long and they are never seen again. */
  lost?: number;
  /** What they have found out there, brought home if they come home. */
  haul?: Partial<Record<ResourceKey, number>>;
  /** When the next find is rolled for. */
  nextFindAt?: number;
}

export type LairKind = "tomb" | "dragonpit" | "shadowgate";

/** Something old and bad, deep in the fog. It breeds monsters that roam the map. */
export interface Lair {
  id: number;
  kind: LairKind;
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  discovered: boolean;
  nextSpawnAt: number;
}

/** A band of monsters wandering the map from a lair. Near the town, it attacks. */
export interface Roamer {
  id: number;
  lair: number;
  kind: MonsterKind;
  level: number;
  count: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

export interface GameState {
  version: 2;
  seed: number;
  /** Game minutes since founding. */
  time: number;
  map: MapState;
  structures: Structure[];
  villagers: Villager[];
  nextId: number;
  res: Resources;
  /** Town-wide, 0–100. */
  mood: number;
  hunger: number;
  debuffs: Debuff[];
  festivalUntil: number;
  raid: Raid | null;
  nextRaidAt: number;
  kills: { kind: MonsterKind; at: number }[];
  /** Tiles queued for clearing (trees, rocks, debris). */
  clearing: { tile: number; progress: number }[];
  log: LogLine[];
  /** Accumulated minutes not yet applied as hourly ticks. */
  hourAcc: number;
  lastVillagerAt: number;
  deaths: number;
  /** Lairs hidden in the fog, and the bands they have loosed. */
  lairs?: Lair[];
  roamers?: Roamer[];
  nextRoamerId?: number;
  /** When the town fell, if it has: the end of the run. */
  fallen?: { at: number; day: number; seen?: boolean } | null;
  /** The forge's store: monster parts, jewels and finished gear, one stack per slot. */
  armory?: { item: string; qty: number }[];
  /** Day of the last night haunt, so each night brings at most one. */
  hauntDay?: number;
  /** Year whose winter has already culled the loose trees. */
  winterYear?: number;
  /** Earthworks: river channels being dug, or dug water being filled in. */
  earthworks?: { tile: number; kind: "dig" | "fill"; progress: number }[];
  /** A trade caravan in town, and when the next one is due. */
  caravan?: Caravan | null;
  nextCaravanAt?: number;
  /** Day the town last heard its stores were overflowing. */
  storeWarnDay?: number;
  /** 1 once troops are on the soldier and knight trees (no archers, heavies or captains apart). */
  ranksV?: number;
  /** 1 once trees carry growth stages and forests hold a wood stock. */
  woodsV?: number;
}
