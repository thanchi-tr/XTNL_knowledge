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
/**
 * Ground. Meadow is rich grass (fields there yield more); hills are stony
 * high ground (no ploughing, but richer mines and a longer view, and raiders
 * climb them slowly); marsh is soft wet ground (nothing can stand on it, but
 * it gives peat and bog iron, and raiders flounder in it).
 */
export const Terrain = { Grass: 0, Water: 1, Pavement: 2, Forest: 3, Bank: 4, Meadow: 5, Hill: 6, Marsh: 7 } as const;
export const TERRAIN_NAME: Record<number, string> = { 0: "Grass", 1: "Water", 2: "Road", 3: "Forest", 4: "Riverbank", 5: "Meadow", 6: "Hills", 7: "Marsh" };
export const Overlay = { None: 0, Tree: 1, Rock: 2, Debris: 3, Wall: 4, Gate: 5, Lair: 6, Crop: 7 } as const;

export interface MapState {
  w: number;
  h: number;
  terrain: number[];
  overlay: number[];
  /** Per-tile extra: tree variant, rock kind, wall hp, forest pool, wild crop kind. */
  meta: number[];
  /** 1 where a road has been relaid in stone flags (see actions.paint). */
  paving?: number[];
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
  /** Survival goods: salt for curing, peat and charcoal to burn, meat, bloomery iron, aged compost. */
  "salt", "peat", "charcoal", "meat", "bogiron", "compost",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];
export type Resources = Record<ResourceKey, number>;

export const RAW_FOODS: ResourceKey[] = [
  "potato", "wheat", "grape", "herb", "cabbage", "carrot", "pumpkin", "barley", "onion", "bean", "turnip", "corn", "strawberry", "garlic",
  "rice", "taro", "lotus", "reed", "watercress", "chestnut", "fish", "meat",
];

// ── Structures ────────────────────────────────────────────
export type StructureType =
  | "townhall" | "house" | "pitfire" | "school" | "farm" | "waterfarm" | "watermill"
  | "refinery" | "kitchen" | "market" | "barracks" | "archery" | "armoury" | "wizardhut"
  | "nobleyard" | "watchtower" | "icefactory" | "mine" | "lumbercamp" | "forge"
  | "lamppost" | "brazier" | "laboratory" | "fishery"
  | "storehouse" | "armyschool" | "armypoint" | "museum"
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
  /**
   * The work just ordered on it — a new build or an upgrade — with what was
   * paid and when (wall-clock ms). For ten real seconds it can be called off
   * and everything is given back.
   */
  undo?: { kind: "build" | "upgrade"; at: number; cost: Partial<Record<ResourceKey, number>>; jewels: number };
  /** Being taken down and carried to a new plot; it stands there once `buildUntil` passes. */
  moveTo?: { x: number; y: number };
  /** Monster parts set into a tower or spire past level 10 (see ./augment). */
  aug?: { feet?: Record<string, number>; heart?: number; jewel?: number; eye?: number };
  /** Its workers are ordered on past their day's strength (see ./work). */
  overtime?: boolean;
  /** The ground most of its footprint stands on (a Terrain value), read when it was placed. */
  ground?: number;
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
  training?: {
    villagerId: number; role: Role; left?: number; until?: number; rank?: number;
    /** A recruit being taken on: a flat four hours, not slowed by the study pace. */
    recruit?: boolean;
  } | null;
  /** Pit fire: fuel units in the grate. Brazier: coal in the bowl. */
  fuel?: number;
  /** Forge: the piece on the anvil. */
  craft?: { item: string; until: number } | null;
  /** Enclosed buildings: the room's thermal state (design §1.8). */
  zone?: Zone;
  /** Heated buildings: what the fire burns in. */
  hearth?: HearthKind;
  /** Fields: nitrogen, phosphorus, organic matter (design §3.5). */
  soil?: Soil;
  /** Load-bearing frame: capacity factor per post, 1 intact, 0 failed (design §5). */
  frame?: number[];
  /** Footings under the posts. */
  footing?: Footing;
  /** Roof snow and eave ice, kg/m² water equivalent. */
  roofSnow?: number;
  eaveIce?: number;
  /** Timber decay and frost-heave damage, 0 (sound) to 1. */
  rot?: number;
  /** A roof the town chose over the grade's default (turf: warm and heavy). */
  roofKind?: string;
}

// ── Survival (design doc: docs/town-survival-systems.md) ──
export type HearthKind = "open" | "chimney" | "stove" | "brazier" | "tiled" | "hypocaust" | "boiler" | "rune";
export type Footing = "pad" | "trench" | "deep";

export interface Zone {
  /** Air temperature, °C. */
  T: number;
  /** Carbon monoxide, mg/m³. */
  co: number;
  /** Masonry-stove mass temperature, °C. */
  Ts: number;
  /** Creosote in the flue, kg. */
  creo: number;
  /** Fuel burnt last step, kg/h, and what it was. */
  burn: number;
  fuel?: string;
  /** Minutes accumulated towards the next ten-minute update. */
  acc?: number;
  /** Day the town was last told this hearth had no fuel. */
  warnDay?: number;
}

export interface Soil {
  N: number;
  P: number;
  O: number;
  /** Consecutive cycles of the same crop, and which crop. */
  nc: number;
  crop: string;
  /** Hours into the current growing cycle. */
  hours: number;
}

export type Affliction = "normal" | "shivering" | "hypoMild" | "hypoModerate" | "hypoSevere" | "undressing" | "cardiac";
export type IllnessKind = "poisoning" | "dysentery" | "ergotism" | "typhus" | "pneumonia" | "gangrene" | "scurvy" | "infection";

export interface Illness {
  kind: IllnessKind;
  /** Minute symptoms begin (after incubation). */
  onset: number;
  /** Minute it resolves on its own, if survived. */
  until: number;
}

/** A villager's physiology (design §1, §3.4, §7). */
export interface Body {
  /** Core temperature, °C. */
  Tc: number;
  /** Clothing and foot wetness, 0–1. */
  W: number;
  Wf: number;
  /** Glycogen / ready energy, kcal; body fat, kg; lean tissue lost, kg. */
  Eg: number;
  F: number;
  B: number;
  /** Fatigue, 0–1. */
  phi: number;
  /** Vitamin C pool, mg; water deficit, L; carboxyhaemoglobin, %. */
  vitC: number;
  h2o: number;
  cohb: number;
  /** Blood lost, L, and the open bleed, L/min. */
  blood: number;
  bleed: number;
  /** Frostbite dose, K·min (hands, feet); chilblain and trench-foot doses. */
  frostH: number;
  frostF: number;
  cb: number;
  tf: number;
  state: Affliction;
  ill: Illness[];
  /** Out of work to warm up until the core recovers. */
  warming?: boolean;
  /** Productivity this hour (mean of the minutes), and its accumulator. */
  eff: number;
  effAcc: number;
  effN: number;
  /** Where they are this minute: a building id, or null outdoors. */
  at?: number | null;
  /** Hours soaked through (W > 0.8), for pneumonia. */
  soaked: number;
  /** Lost limbs or digits. */
  amputee?: number;
  /** Spoiled meals eaten since the last hour. */
  spoiledMeals: number;
  /** Hot meals eaten since the last hour. */
  meals: number;
  /** Rescue / afterdrop risk: set while being rewarmed after collapse. */
  afterdrop?: number;
  /** Came through moderate hypothermia this hour (pneumonia risk). */
  hypoDone?: boolean;
  /** Productivity averaged over recent shifts: what a 24-hour workplace sees. */
  effDay?: number;
  /** Share of the shift actually at work (warming breaks, sickness), and its minute counters. */
  presence?: number;
  shiftMin?: number;
  workMin?: number;
}

/** Aggro channels: kinetic breachers, burrowers, weather-riders, infiltrators. */
export const CHANNELS = ["K", "B", "Wr", "I"] as const;
export type Channel = (typeof CHANNELS)[number];
export const STIMULI = ["can", "smk", "ac", "bio", "heat", "food", "pop"] as const;
export type Stimulus = (typeof STIMULI)[number];

export interface Aggro {
  hot: number[];
  scar: number[];
  /** This hour's stimuli, in their units. */
  ledger: Record<Stimulus, number>;
  /** Channel input over the last day, for the readout. */
  daily: number[];
  purse: number;
  trigger: number;
  lastWaveAt: number;
  /** Times of casualties, for the director's relief. */
  losses: number[];
  /** Channel aggro for the last six hours, for punitive waves. */
  past: number[][];
  /** Tile → hostile deaths remembered (decays, half-life 3 days). */
  deathMap: Record<number, number>;
}

export interface Stores {
  /** Spoiled (edible, risky) share of each food, in its units. */
  spoiled: Partial<Record<ResourceKey, number>>;
  /** Miasma in the stores, and the freeze-thaw damage multiplier. */
  miasma: number;
  kMul: number;
  frozen: boolean;
  /** Share of the meal stock cooked from spoiled food; vitamin C carried per meal, mg. */
  mealTaint: number;
  mealVitC: number;
  /** Spore contamination of grain and of the water. */
  contamFood: number;
  contamWater: number;
  /** Moisture content of the wood stock (wet basis). */
  woodMC: number;
  /** Nightsoil: fresh, and composting (person-days). */
  soilFresh: number;
  soilAging: number;
}

export type ToolMat = "flint" | "bronze" | "bog" | "wrought" | "steel" | "crucible";
export interface Tool {
  id: number;
  mat: ToolMat;
  /** Sharpness 0–1, fatigue damage, remaining mass share. */
  s: number;
  D: number;
  m: number;
}

export interface Corpse {
  id: number;
  x: number;
  y: number;
  at: number;
  kg: number;
  name: string;
  /** Labour-hours of burial done. */
  dug: number;
}

export type SocietyState = "stable" | "strained" | "unrest" | "strike" | "mutiny" | "exile";
export interface Society {
  state: SocietyState;
  since: number;
  /** A faction's demand and when it runs out. */
  ultimatum?: { faction: number; demand: "repeal" | "rations" | "rest"; until: number } | null;
  /** Hours the worst faction has held its discontent over the strike line. */
  strikeHours: number;
  /** Hours Hope has lain at nothing. Three days of it and the town is abandoned. */
  despairHours?: number;
  /** Hours a town that once grew has lain at two people or fewer. Three days of it and it has dwindled away. */
  fewHours?: number;
}

export type NodeKind = "bogiron" | "salt" | "coal" | "peat" | "flint" | "silver";
/** A wilderness extraction site (design §4.4). */
export interface ExtractionNode {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  wake: number;
  awakened: boolean;
  discovered: boolean;
}

export interface Policy {
  /** What homes heat to while people are in, °C. */
  heat: number;
  /** Portion at each meal, 1 = full. */
  ration: number;
  /** Spread nightsoil fresh instead of composting it. */
  freshSoil: boolean;
  /** Burn coal in stoves and fireplaces before wood. */
  coalFirst: boolean;
  /** Workday length in hours (the extended-shift decree raises it). */
  shift: number;
  /** Idle hands clearing and digging are driven past their day's strength (see ./work). */
  overtime?: boolean;
}

// ── People ────────────────────────────────────────────────
export type Role =
  | "idle" | "farmhand" | "icer" | "chef" | "scientist" | "geologist" | "commander" | "biologist" | "artist"
  | "miner" | "lumberjack" | "refiner" | "trader" | "fisher"
  /** Trained at the army school from a veteran; leads an army point. */
  | "captain"
  | "infantry" | "archer" | "heavy" | "wizard" | "knight";

export const MILITARY: Role[] = ["infantry", "archer", "heavy", "wizard", "knight"];

export interface Villager {
  id: number;
  name: string;
  /** Leads the night shift: building goes on through the dark while they do (see ./work). */
  nightShift?: boolean;
  /** Away at the museum or travelling until this game time, and which (see ./leisure). */
  awayUntil?: number;
  awayFor?: "museum" | "travel";
  /** Effort points spent today, and whether last night was slept cold (see ./work). */
  effort?: number;
  coldNight?: boolean;
  /** A legendary calling this villager has risen to (see ./legends). */
  legend?: "steward" | "earthshaper" | "sage";
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
  /** Physiology (design §1). */
  body?: Body;
  /** Discontent 0–100, and faction: 0 Tradition, 1 Pragmatism, 2 Faith. */
  disc?: number;
  fac?: number;
  /** Traits: hardy, pious, nyctophobe, navigator, physician, hollow, leftThem. */
  traits?: string[];
  /** A mental break: what, and until when. */
  broken?: { kind: string; until: number } | null;
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
  /** The tower or spire whose monster parts this fighter strikes with (./augment). */
  augFrom?: number;
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
  /** Which of the land's four answers this is (design §2.5). */
  archetype?: Channel;
  /** Set when the raiders took their objective and withdrew: what they brought down. */
  retreated?: string;
  /** The nemesis's tactic for this wave (./nemesis). */
  tactic?: string;
  phase: "incoming" | "fighting" | "repelled";
  combatants: Combatant[];
  projectiles: Projectile[];
  /** Real seconds of combat elapsed, for animation. */
  clock: number;
  nextId: number;
  started?: boolean;
  /** Pieces of the fight worth telling, for the floating combat text. */
  pops?: { x: number; y: number; text: string; at: number; tone: "hit" | "crit" | "heal" }[];
  /** Night prowlers: a haunt that wandered in out of the dark for any building, lit or not. */
  prowl?: boolean;
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
  /** Heading error (rad) and cross-track drift (tiles) of the party's reckoning (design §4.2). */
  psi?: number;
  err?: number;
  /** Cargo carried beyond the pack, kg, and marching power last minute, W. */
  load?: number;
  power?: number;
  /** A node being worked, and hours spent at it. */
  node?: number;
  worked?: number;
}

export type LairKind = "tomb" | "dragonpit" | "shadowgate" | "goblinwarren" | "webhollow" | "frostrift" | "titangate";

/** Something old and bad, deep in the fog. It breeds monsters that roam the map. */
export interface Lair {
  id: number;
  kind: LairKind;
  x: number;
  y: number;
  w: number;
  h: number;
  level: number;
  /** Levels this gate stands above others of its kind: the deeper in the country, the higher. */
  bonus?: number;
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
  /** A band hunting a hero out in the fog: the villager it follows. */
  hunt?: number;
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
  /** The steward's last hint, and when the next may be asked for (game time). See ./advisor. */
  hint?: import("./advisor").Hint;
  hintReadyAt?: number;
  /** 2 once the newer monster gates have been set into an older map. */
  lairsV?: number;
  /** 1 once meadows, hills and marsh have been surveyed into an older map. */
  terrainV?: number;
  /** The run's tallies (./stats), achievements earned (id → game time), and a won game. */
  stats?: import("./stats").Stats;
  achievements?: Record<string, number>;
  victory?: { day: number; how: string; seen?: boolean };
  /** A newcomer on the road to town, and when they arrive (game time). */
  incoming?: number;
  /** What is going to waste for want of room, per good: a tally fading by a tenth an hour. */
  wasted?: Partial<Record<ResourceKey, number>>;
  /** 1 once troops are on the soldier and knight trees (no archers, heavies or captains apart). */
  ranksV?: number;
  /** 1 once trees carry growth stages and forests hold a wood stock. */
  woodsV?: number;
  // ── Survival (design doc) ──
  /** 1 once the survival systems are initialised on this save. */
  survivalV?: number;
  weather?: import("./weather").Weather;
  aggro?: Aggro;
  stores?: Stores;
  toolkit?: Tool[];
  /** Materials of tools made but not yet in the kit. */
  toolsPending?: ToolMat[];
  nextToolId?: number;
  corpses?: Corpse[];
  society?: Society;
  decrees?: string[];
  nodes?: ExtractionNode[];
  policy?: Policy;
  /** Community Hope change waiting to be applied (deaths, victories, decrees). */
  hopeEvents?: number;
  /** Minutes accumulated towards the next physiology step, and the next ten-minute zone step. */
  bodyAcc?: number;
  zoneAcc?: number;
  /** Cause of the run's end, if not a sack. */
  fallCause?: string;
  /** Today's study in town: buffs, drops paid, what the adversary reads (./knowledge). */
  knowledge?: import("./knowledge").Knowledge;
  /** The adversary: its model of the player, its tactics' weights, its stalking (./nemesis). */
  nemesis?: import("./nemesis").Nemesis;
}
