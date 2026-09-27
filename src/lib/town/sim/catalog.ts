import type { Resources, Role, StructureType } from "./types";

/**
 * Every building the town can raise, in one table.
 *
 * Costs, footprints, placement rules and staffing all live here so the rest
 * of the engine asks the catalogue rather than special-casing types. Where a
 * building has a rule the player must satisfy — a watermill beside the river,
 * a farm connected to the market — it is stated here in words as well, so the
 * build menu can show the reason a placement is refused.
 */

export type Cost = Partial<Resources>;

export interface BuildingDef {
  type: StructureType;
  name: string;
  blurb: string;
  w: number;
  h: number;
  cost: Cost;
  /** Cost to go from `level` to `level + 1`. */
  upgrade: (level: number) => Cost;
  /** Game hours to build level 1; upgrades scale from this. */
  buildHours: number;
  maxLevel: number;
  /** Workers the building can take at a level. 0 = unstaffed. */
  slots: (level: number) => number;
  /** Which role a worker takes on when assigned here. */
  workRole?: Role;
  /** Only one allowed. */
  unique?: boolean;
  /** Footprint must touch river water. */
  needsRiver?: boolean;
  /** Footprint must touch forest tiles. */
  needsForest?: boolean;
  /** Someone of this role must live in town before it can be placed. */
  requires?: { role: Role; reason: string };
  /** Human-readable placement and connection rules. */
  rules: string[];
  category: "civic" | "food" | "industry" | "military" | "infrastructure";
  /** Hit points per level. */
  hpPerLevel: number;
}

const scale = (base: Cost, k: number): Cost => {
  const out: Cost = {};
  for (const [key, v] of Object.entries(base)) out[key as keyof Resources] = Math.round((v as number) * k);
  return out;
};

/** Upgrades grow ~1.6× per level, and ask for refined materials from level 3. */
const growth = (base: Cost, refined: Cost = {}) => (level: number): Cost => {
  const c = scale(base, Math.pow(1.6, level - 1));
  if (level >= 3) for (const [k, v] of Object.entries(scale(refined, level - 2))) c[k as keyof Resources] = v;
  return c;
};

/** Bulk-good capacity a storehouse adds per level. */
export const STORE_PER_LEVEL = 400;
/** Troops in town per army point allowed. */
export const ARMY_PER_POINT = 50;
// ── Ranks ─────────────────────────────────────────────────

/**
 * The two military trees. A soldier's or knight's level picks their title;
 * training in a building carries them only so far (TRAIN_CAP), and every
 * level past that is earned in battle — each fight survived has a chance to
 * promote whoever took part in it.
 */
export interface Title { id: string; name: string; from: number; ranged?: boolean; blurb: string }

export const SOLDIER_TITLES: Title[] = [
  { id: "levy", name: "Peasant Levy", from: 1, blurb: "A villager with a pitchfork or a club." },
  { id: "spearman", name: "Spearman Militia", from: 3, blurb: "Spear and round shield; stands firm against a charge." },
  { id: "bowman", name: "Bowman Militia", from: 5, ranged: true, blurb: "A cheap bow from the archery range." },
  { id: "sergeant", name: "Sergeant-at-Arms", from: 7, blurb: "Mail and a broadsword: the line's backbone." },
  { id: "crossbowman", name: "Crossbowman", from: 10, ranged: true, blurb: "Slow to reload; a bolt goes through plate." },
  { id: "halberdier", name: "Veteran Halberdier", from: 13, blurb: "Halberd and half-plate; breaks armour and horse alike." },
  { id: "arbalestier", name: "Arbalestier", from: 17, ranged: true, blurb: "A heavy arbalest behind a painted pavise." },
];
export const SOLDIER_MAX = 20;

export const KNIGHT_TITLES: Title[] = [
  { id: "squire", name: "Noble Squire", from: 1, blurb: "A noble trainee on foot with an arming sword." },
  { id: "serjeant", name: "Mounted Serjeant", from: 6, blurb: "Light lance, light horse, scout and skirmisher." },
  { id: "bachelor", name: "Knight Bachelor", from: 11, blurb: "Barded horse and couched lance: shock cavalry." },
  { id: "paladin", name: "Paladin", from: 15, blurb: "Champion in masterwork plate on a white charger." },
  { id: "noble", name: "Noble Knight", from: 19, blurb: "A lord's knight under a crested helm and his own colours." },
  { id: "emblem", name: "Emblem Knight", from: 23, blurb: "Bound to an emblem; rises by sortie and study." },
];

const titleOf = (list: Title[], rank: number) => [...list].reverse().find((t) => rank >= t.from) ?? list[0];
export const soldierTitle = (rank: number) => titleOf(SOLDIER_TITLES, Math.max(1, rank));
export const knightTitle = (rank: number) => titleOf(KNIGHT_TITLES, Math.max(1, rank));

/** How far training alone carries a troop in each building. Past this, only battle promotes. */
export const TRAIN_CAP: Partial<Record<StructureType, number>> = { barracks: 4, archery: 6, armoury: 6, armyschool: 10, nobleyard: 10 };
/** The level a recruit starts at in each building. */
export const RECRUIT_RANK: Partial<Record<StructureType, number>> = { archery: 5 };

/** Silver a knight is paid each day, by title. Unpaid for three days, they leave. */
export const KNIGHT_PAY = [1, 1.5, 2, 3, 4, 5];
export const knightPay = (rank: number) => KNIGHT_PAY[KNIGHT_TITLES.indexOf(knightTitle(rank))];

/** People a town must hold before a building can rise to the next level. */
export function upgradePeople(type: StructureType, level: number): number {
  return type === "townhall" ? 4 + 5 * level : 2 + 3 * level;
}

/** Work, in villager-hours, to dig one tile of channel or fill one in. Tools halve it. */
export const DIG_HOURS = 60;
export const FILL_HOURS = 45;

/** What a knight's recruitment costs at the army school. */
export const KNIGHT_RECRUIT = { coin: 30, silver: 4 };

export const CATALOG: Record<StructureType, BuildingDef> = {
  townhall: {
    type: "townhall", name: "Town Hall", category: "civic",
    blurb: "The seat of the town. Keeps the census and caps how far every other building can grow.",
    w: 14, h: 7, cost: {}, upgrade: growth({ wood: 120, stone: 160, coin: 60 }, { bricks: 20, ingots: 8 }),
    buildHours: 24, maxLevel: 20, slots: () => 0, unique: true, hpPerLevel: 400,
    rules: [
      "One per town. If it falls, the town is sacked.",
      "Homes and schools must stand within its reach: 20 tiles at level 1, and 4 more each level.",
      "Buildings far from it are raided more often, and by stronger things.",
    ],
  },
  house: {
    type: "house", name: "House", category: "civic",
    blurb: "Beds for villagers — each bed is one resident. Utilities lift the mood of whoever lives here.",
    w: 5, h: 3, cost: { wood: 30, stone: 20 }, upgrade: growth({ wood: 30, stone: 24 }, { planks: 10, bricks: 6 }),
    buildHours: 4, maxLevel: 10, slots: () => 0, hpPerLevel: 80,
    rules: ["Connect to a barracks by pavement so residents can be trained as troops."],
  },
  pitfire: {
    type: "pitfire", name: "Pit Fire", category: "civic",
    blurb: "Warms houses through winter and keeps the dark off at night. Burns wood or coal — far more on a winter night.",
    w: 2, h: 2, cost: { stone: 10, wood: 5 }, upgrade: growth({ stone: 12, wood: 6 }, { bricks: 4 }),
    buildHours: 1, maxLevel: 5, slots: () => 0, hpPerLevel: 40,
    rules: [
      "Warms and lights everything within 6 tiles, plus 2 per level.",
      "Burns only the wood or coal loaded into its grate (120 fuel, +60 a level). When the grate runs dry it goes out. Summer burns a fifth as much.",
      "At night, every building outside a lit fire, brazier or lamp draws a dark thing to it.",
      "Winter ices over all ground it does not warm. Fields out on the ice grow nothing; roofs take snow either way.",
    ],
  },
  school: {
    type: "school", name: "School", category: "civic",
    blurb: "Trains specialists: scientists, kitchen hands, geologists, commanders and biologists.",
    w: 8, h: 4, cost: { wood: 80, stone: 60, coin: 20 }, upgrade: growth({ wood: 60, stone: 60, coin: 30 }, { planks: 12, bricks: 12 }),
    buildHours: 10, maxLevel: 8, slots: () => 0, hpPerLevel: 120,
    rules: ["Takes an idle villager and returns a specialist."],
  },
  farm: {
    type: "farm", name: "Farm Plot", category: "food",
    blurb: "One field block, one worker. Neighbouring blocks of the same crop grow faster together.",
    w: 3, h: 3, cost: { wood: 10 }, upgrade: growth({ wood: 12, stone: 6 }),
    buildHours: 2, maxLevel: 10, slots: () => 1, workRole: "farmhand", hpPerLevel: 40,
    rules: [
      "On grass. Needs a watermill within 14 tiles, at least as high a level.",
      "Must touch pavement with a path to the market, or the harvest never reaches the granary.",
      "In winter it freezes and grows nothing unless a lit pit fire reaches it.",
    ],
  },
  waterfarm: {
    type: "waterfarm", name: "Water Farm", category: "food",
    blurb: "Flooded paddies for rice, taro, lotus and reed.",
    w: 3, h: 3, cost: { wood: 15, stone: 10 }, upgrade: growth({ wood: 14, stone: 10 }),
    buildHours: 3, maxLevel: 10, slots: () => 1, workRole: "farmhand", hpPerLevel: 40,
    rules: ["On grass, within 14 tiles of a watermill.", "Same market connection as a farm.", "Freezes in winter unless a lit pit fire reaches it."],
  },
  watermill: {
    type: "watermill", name: "Watermill", category: "food",
    blurb: "Lifts river water to the fields. Farms cannot outgrow the mill that feeds them.",
    w: 5, h: 4, cost: { wood: 40, stone: 30 }, upgrade: growth({ wood: 30, stone: 30 }, { planks: 8 }),
    buildHours: 6, maxLevel: 10, slots: () => 0, needsRiver: true, hpPerLevel: 90,
    rules: ["Must be placed next to the river.", "Irrigates farms within 14 tiles."],
  },
  refinery: {
    type: "refinery", name: "Refinery", category: "industry",
    blurb: "Turns raw material into refined: planks, bricks, ingots — and, with scientists, gunpowder and poison.",
    w: 7, h: 4, cost: { stone: 60, wood: 40, iron: 10 }, upgrade: growth({ stone: 50, wood: 30, iron: 10 }, { bricks: 10 }),
    buildHours: 8, maxLevel: 10, slots: (l) => 1 + l, workRole: "refiner", hpPerLevel: 110,
    rules: [],
  },
  kitchen: {
    type: "kitchen", name: "Kitchen", category: "food",
    blurb: "Chefs cook raw crops into meals. Nobody eats a raw potato for long.",
    w: 5, h: 3, cost: { wood: 40, stone: 30 }, upgrade: growth({ wood: 30, stone: 30 }, { bricks: 6 }),
    buildHours: 5, maxLevel: 10, slots: (l) => 1 + l, workRole: "chef", hpPerLevel: 80,
    rules: ["Staffed by chefs trained at the school."],
  },
  market: {
    type: "market", name: "Market", category: "civic",
    blurb: "Where the harvest is gathered and sold. Farms must reach it by pavement.",
    w: 8, h: 4, cost: { wood: 50, stone: 30 }, upgrade: growth({ wood: 40, stone: 30, coin: 20 }, { planks: 8 }),
    buildHours: 6, maxLevel: 10, slots: (l) => Math.ceil(l / 2), workRole: "trader", hpPerLevel: 90,
    rules: [],
  },
  barracks: {
    type: "barracks", name: "Barracks", category: "military",
    blurb: "Recruits Peasant Levies and drills them up to Spearman Militia (level 4). Every rank past that is earned in battle.",
    w: 11, h: 4, cost: { wood: 60, stone: 50 }, upgrade: growth({ wood: 50, stone: 50, iron: 6 }, { ingots: 6 }),
    buildHours: 8, maxLevel: 10, slots: () => 0, hpPerLevel: 150,
    rules: ["Connect to a house to recruit, and to a watchtower so its troops are counted."],
  },
  archery: {
    type: "archery", name: "Archery Range", category: "military",
    blurb: "Recruits Bowman Militia (level 5) and drills them to level 6. Bows do double damage to anything that flies.",
    w: 9, h: 4, cost: { wood: 60, stone: 30 }, upgrade: growth({ wood: 50, stone: 30 }, { planks: 8 }),
    buildHours: 8, maxLevel: 10, slots: () => 0, hpPerLevel: 120,
    rules: ["Same connection rules as a barracks."],
  },
  armoury: {
    type: "armoury", name: "Heavy Armoury", category: "military",
    blurb: "No longer built. An old armoury still houses soldiers and drills them to level 6.",
    w: 9, h: 4, cost: { wood: 40, stone: 60, iron: 20 }, upgrade: growth({ stone: 50, iron: 16 }, { ingots: 8 }),
    buildHours: 10, maxLevel: 10, slots: () => 0, hpPerLevel: 180,
    rules: ["Same connection rules as a barracks."],
  },
  wizardhut: {
    type: "wizardhut", name: "Wizard Hut", category: "military",
    blurb: "Wizards study here and grow in power on their own. At 15 they become grand wizards.",
    w: 4, h: 4, cost: { wood: 50, stone: 40, silver: 10 }, upgrade: growth({ stone: 40, silver: 8 }, { ingots: 4 }),
    buildHours: 12, maxLevel: 10, slots: () => 0, hpPerLevel: 100,
    rules: ["Grand wizards defend only against legendary foes, and cost nothing to keep."],
  },
  nobleyard: {
    type: "nobleyard", name: "Noble Yard", category: "military",
    blurb: "No longer built — knights are made at the army school. An old yard still drills knights to level 10.",
    w: 9, h: 5, cost: { stone: 80, wood: 40, iron: 20, gold: 10 }, upgrade: growth({ stone: 60, iron: 20, gold: 6 }, { ingots: 10 }),
    buildHours: 14, maxLevel: 10, slots: () => 0, hpPerLevel: 160,
    rules: [],
  },
  watchtower: {
    type: "watchtower", name: "Watchtower", category: "military",
    blurb: "Counts the garrison and shoots at whatever comes close.",
    w: 4, h: 3, cost: { stone: 50, wood: 20 }, upgrade: growth({ stone: 40, wood: 16 }, { bricks: 6 }),
    buildHours: 5, maxLevel: 10, slots: () => 0, hpPerLevel: 130,
    rules: ["Troops count only if their barracks reaches a watchtower by pavement."],
  },
  icefactory: {
    type: "icefactory", name: "Ice Factory", category: "industry",
    blurb: "Cuts and stores ice through winter to keep summer bearable.",
    w: 6, h: 4, cost: { wood: 50, stone: 40 }, upgrade: growth({ wood: 30, stone: 40 }, { bricks: 6 }),
    buildHours: 6, maxLevel: 10, slots: (l) => 1 + l, workRole: "icer", needsRiver: true, hpPerLevel: 90,
    rules: ["Must be placed next to the river."],
  },
  mine: {
    type: "mine", name: "Mine", category: "industry",
    blurb: "Stone and coal, and — rarely — precious things: silver, then platinum, diamond, and gold rarest of all.",
    w: 10, h: 5, cost: { wood: 40, stone: 20 }, upgrade: growth({ wood: 30, stone: 30 }, { ingots: 4 }),
    buildHours: 8, maxLevel: 10, slots: (l) => 1 + l, workRole: "miner", hpPerLevel: 140,
    rules: [
      "The further from the town hall, the richer the seam: 0.5% an hour close in, up to 8% far out.",
      "Geologists and depth raise the odds too. Mithril only from level 6.",
    ],
  },
  lumbercamp: {
    type: "lumbercamp", name: "Lumber Camp", category: "industry",
    blurb: "Fells timber from the neighbouring forest, drawing down its stock of wood. A forest grows back while it holds more than 15% of its wood.",
    w: 4, h: 3, cost: { wood: 20, stone: 5 }, upgrade: growth({ wood: 20, stone: 10 }),
    buildHours: 3, maxLevel: 10, slots: (l) => 1 + l, workRole: "lumberjack", needsForest: true, hpPerLevel: 70,
    rules: ["Must be placed next to forest.", "Cuts within 4 tiles. Below 15% the forest stops growing back, and every tile cut bare becomes open ground."],
  },
  forge: {
    type: "forge", name: "Forge", category: "industry",
    blurb: "Arms the garrison: every level adds to every troop's damage. Stores what monsters leave, and makes gear from it.",
    w: 7, h: 4, cost: { stone: 50, wood: 30 }, upgrade: growth({ stone: 40, iron: 12 }, { ingots: 6 }),
    buildHours: 8, maxLevel: 10, slots: () => 0, hpPerLevel: 120,
    rules: [
      "Without a forge, spoils from raids are left on the field.",
      "Its store holds 4 stacks, plus 2 per level.",
    ],
  },
  laboratory: {
    type: "laboratory", name: "Laboratory", category: "industry",
    blurb: "Scientists at the bench: arcane formulas for the wizards, healing tonic for the sick, fertiliser for the fields.",
    w: 6, h: 4, cost: { stone: 50, wood: 40, coin: 40, silver: 4 }, upgrade: growth({ stone: 40, wood: 20, silver: 4 }, { bricks: 8, ingots: 2 }),
    buildHours: 10, maxLevel: 10, slots: (l) => 1 + l, workRole: "scientist", hpPerLevel: 100,
    requires: { role: "scientist", reason: "A laboratory needs a scientist to set it up — train one at the school first." },
    rules: ["Needs at least one scientist in town before it can be placed.", "Staffed by scientists only."],
  },
  fishery: {
    type: "fishery", name: "Fishing Hut", category: "food",
    blurb: "A hut on stilts, a jetty and a drying rack. Fishers bring in the river's catch — a raw food the kitchen cooks.",
    w: 4, h: 3, cost: { wood: 30, stone: 5 }, upgrade: growth({ wood: 24, stone: 8 }, { planks: 6 }),
    buildHours: 3, maxLevel: 10, slots: (l) => 1 + l, workRole: "fisher", needsRiver: true, hpPerLevel: 60,
    rules: ["Must be placed next to the river.", "The catch is poor in winter and best in autumn."],
  },
  lamppost: {
    type: "lamppost", name: "Lamppost", category: "infrastructure",
    blurb: "An oil lamp on an iron post. Lights a small circle, needs no fuel.",
    w: 1, h: 1, cost: { iron: 4, stone: 4 }, upgrade: () => ({}),
    buildHours: 1, maxLevel: 1, slots: () => 0, hpPerLevel: 30,
    rules: ["Lights everything within 4 tiles at night.", "Light, not warmth: it thaws no ice."],
  },
  storehouse: {
    type: "storehouse", name: "Storehouse", category: "civic",
    blurb: "A board barn for bulk goods. Without room to keep it, a harvest past what the town can hold is wasted.",
    w: 6, h: 4, cost: { wood: 60, stone: 20 }, upgrade: growth({ wood: 40, stone: 30 }, { planks: 8 }),
    buildHours: 5, maxLevel: 10, slots: () => 0, hpPerLevel: 90,
    rules: [
      `Raises how much of each bulk good the town can hold by ${STORE_PER_LEVEL} a level.`,
      "Bulk goods: timber, stone, coal, iron, every crop and catch, meals, ice, planks and bricks. Coin, precious metals and laboratory goods keep anywhere.",
    ],
  },
  armyschool: {
    type: "armyschool", name: "Army School", category: "military",
    blurb: "The only place knights are made. Recruits Noble Squires and drills them up to Mounted Serjeant.",
    w: 8, h: 4, cost: { stone: 80, wood: 50, coin: 60, iron: 10 }, upgrade: growth({ stone: 60, wood: 30, coin: 40 }, { ingots: 6 }),
    buildHours: 12, maxLevel: 10, slots: () => 0, hpPerLevel: 140,
    rules: [
      `Recruits cost ${KNIGHT_RECRUIT.coin} coin and ${KNIGHT_RECRUIT.silver} silver. Training carries a knight to level 10 (Mounted Serjeant); Knight Bachelor and above are won in battle.`,
      "Knights are paid in silver every day — 1 for a squire up to 5 for an emblem knight. Three days unpaid and they leave.",
      "Houses 4 knights a level.",
    ],
  },
  armypoint: {
    type: "armypoint", name: "Army Point", category: "military",
    blurb: "A fortified camp: a watchtower on a larger scale, led by a knight and held by a company of guards.",
    w: 6, h: 5, cost: { stone: 120, wood: 60, iron: 30, coin: 100 }, upgrade: growth({ stone: 80, iron: 20, coin: 60 }, { ingots: 10 }),
    buildHours: 16, maxLevel: 10, slots: () => 1, workRole: "knight", hpPerLevel: 260,
    rules: [
      `One army point for every ${ARMY_PER_POINT} troops in town, and each needs a knight of its own to lead it.`,
      "Works like a watchtower: troops posted here wait inside and come out when a monster crosses its circle.",
      "Holds 10 guards, plus 5 a level; watches 10 tiles, plus 2 a level.",
      "Its knight leads them: +20% damage and health, and more the higher the knight's title.",
    ],
  },
  brazier: {
    type: "brazier", name: "Brazier", category: "infrastructure",
    blurb: "An iron bowl of burning coal on a stone plinth. Lights farther than a lamp.",
    w: 1, h: 1, cost: { stone: 8, iron: 3 }, upgrade: () => ({}),
    buildHours: 1, maxLevel: 1, slots: () => 0, hpPerLevel: 40,
    rules: ["Lights everything within 6 tiles.", "Burns a little coal each night hour.", "Light, not warmth: it thaws no ice."],
  },
};

export const BUILDABLE: StructureType[] = [
  "house", "pitfire", "farm", "waterfarm", "watermill", "fishery", "kitchen", "market", "school",
  "lumbercamp", "mine", "refinery", "laboratory", "icefactory", "forge",
  "barracks", "archery", "wizardhut", "watchtower",
  "lamppost", "brazier", "storehouse", "armyschool", "armypoint",
];

/** Tile-painted infrastructure, priced per tile. */
export const PAVEMENT_COST: Cost = { stone: 1 };
export const WALL_COST: Cost = { stone: 4 };
export const GATE_COST: Cost = { stone: 6, wood: 4 };

// ── House furnishings ─────────────────────────────────────

export const UTILITIES: { id: string; name: string; cost: Cost; happy: number }[] = [
  { id: "well", name: "Well", cost: { stone: 20 }, happy: 0.08 },
  { id: "hearth", name: "Hearth", cost: { stone: 15, wood: 10 }, happy: 0.1 },
  { id: "garden", name: "Garden", cost: { wood: 10, herb: 10 }, happy: 0.1 },
  { id: "bathhouse", name: "Bathhouse", cost: { stone: 30, wood: 20, coin: 20 }, happy: 0.16 },
  { id: "library", name: "Bookshelf", cost: { planks: 10, coin: 30 }, happy: 0.14 },
  { id: "musicbox", name: "Music Box", cost: { ingots: 2, coin: 60 }, happy: 0.2 },
];

/** Utilities a house can hold at a level. */
export const utilitySlots = (level: number) => Math.min(UTILITIES.length, 1 + Math.floor(level / 2));
export const baseBeds = (level: number) => 2 + level;
export const bedUpgradeCost = (bought: number): Cost => ({ wood: 20 + bought * 15, planks: bought >= 2 ? bought * 3 : 0 });
export const maxBedUpgrades = (level: number) => Math.floor(level / 2) + 1;

// ── Crops ─────────────────────────────────────────────────

/**
 * Hard economy: every source of food runs at this share of its old rate, so
 * a town eats only as well as it farms, fishes and cooks.
 */
export const FOOD_PACE = 0.45;
/** Training is deliberately slow: course and recruit times are this much longer. */
export const TRAIN_SLOW = 1.5;

/** Fish an hour per fisher at rank 0, before season and hut level. */
export const FISH_CATCH = 3;
export const FISH_SEASON = { spring: 1, summer: 1.1, autumn: 1.25, winter: 0.4 } as const;

export const CROP_YIELD: Record<string, number> = {
  potato: 10, wheat: 8, grape: 5, herb: 3, cabbage: 7, carrot: 8, pumpkin: 5, barley: 9,
  onion: 7, bean: 6, turnip: 9, corn: 8, strawberry: 4, garlic: 3,
  rice: 9, taro: 7, lotus: 4, reed: 6, watercress: 6, chestnut: 5,
};

export const LAND_CROPS = [
  "potato", "wheat", "grape", "herb", "cabbage", "carrot", "pumpkin", "barley", "onion", "bean", "turnip", "corn", "strawberry", "garlic",
] as const;
export const WATER_CROPS = ["rice", "taro", "lotus", "reed", "watercress", "chestnut"] as const;

// ── Kitchen dishes ────────────────────────────────────────

/**
 * What a kitchen cooks. Pottage takes whatever is in the store; every other
 * dish asks for particular crops and a chef of some standing, and gives more
 * meals from them — and the better ones lift the town as it eats. A kitchen
 * out of a dish's ingredients falls back to pottage rather than go cold.
 */
export interface Dish {
  id: string;
  name: string;
  /** Per batch. Empty: pottage, from any raw food. */
  input: Cost;
  meals: number;
  /** Chef rank needed (0 kitchen hand … 7 five stars). */
  rank: number;
  mood?: number;
  happy?: number;
  health?: number;
  blurb: string;
}

export const DISHES: Dish[] = [
  { id: "pottage", name: "Pottage", input: {}, meals: 1, rank: 0, blurb: "Whatever is in the store, boiled. One meal per crop." },
  { id: "bread", name: "Barley bread", input: { wheat: 2, barley: 1 }, meals: 4.5, rank: 0, blurb: "The staple. Cheap and filling." },
  { id: "stew", name: "Root stew", input: { potato: 2, carrot: 1 }, meals: 4.5, rank: 1, happy: 0.1, blurb: "Warm, and it shows." },
  { id: "rolls", name: "Cabbage rolls", input: { cabbage: 2, rice: 1 }, meals: 5, rank: 1, happy: 0.1, blurb: "From the paddies and the plots." },
  { id: "pie", name: "Pumpkin pie", input: { pumpkin: 1, wheat: 1 }, meals: 3.5, rank: 2, happy: 0.25, blurb: "Nobody is unhappy holding pie." },
  { id: "roast", name: "Herb-crusted roast", input: { taro: 1, herb: 1, potato: 1 }, meals: 4.5, rank: 3, mood: 0.1, blurb: "A starred chef's dish. Lifts the mood." },
  { id: "broth", name: "Lotus-root broth", input: { lotus: 1, reed: 1, rice: 1 }, meals: 5, rank: 4, health: 0.3, blurb: "Mends the sick." },
  { id: "grilled", name: "Grilled fish", input: { fish: 2 }, meals: 4, rank: 0, blurb: "Off the jetty and onto the coals." },
  { id: "fishstew", name: "Fisherman's stew", input: { fish: 2, potato: 1, carrot: 1 }, meals: 6, rank: 2, health: 0.15, blurb: "The river and the field in one pot." },
  { id: "cornbread", name: "Corn bread", input: { corn: 2, barley: 1 }, meals: 5, rank: 0, blurb: "Golden, dense, keeps for days." },
  { id: "mash", name: "Turnip mash", input: { turnip: 2, potato: 1 }, meals: 5, rank: 0, blurb: "Plain, hot and plenty of it." },
  { id: "succotash", name: "Succotash", input: { corn: 1, bean: 1, onion: 1 }, meals: 5, rank: 1, happy: 0.05, blurb: "Three crops in one pan." },
  { id: "onionsoup", name: "Onion soup", input: { onion: 2, wheat: 1 }, meals: 4.5, rank: 1, health: 0.05, blurb: "Slow-cooked, with a crust of bread on top." },
  { id: "salad", name: "Watercress salad", input: { watercress: 2, onion: 1 }, meals: 4, rank: 1, health: 0.2, blurb: "Sharp and green. Good for the sick." },
  { id: "garlicfish", name: "Garlic fish", input: { fish: 2, garlic: 1 }, meals: 5, rank: 2, health: 0.1, blurb: "The catch, with a clove or two." },
  { id: "beanstew", name: "Hunter's bean stew", input: { bean: 2, carrot: 1, garlic: 1 }, meals: 6, rank: 2, happy: 0.1, blurb: "Keeps a patrol on its feet all day." },
  { id: "tart", name: "Strawberry tart", input: { strawberry: 2, wheat: 1 }, meals: 3.5, rank: 3, happy: 0.3, blurb: "Summer on a plate." },
  { id: "dumplings", name: "Chestnut dumplings", input: { chestnut: 1, rice: 1, cabbage: 1 }, meals: 5.5, rank: 3, mood: 0.1, blurb: "Steamed in the paddy's own leaves." },
  { id: "feast", name: "Captain's feast", input: { corn: 1, garlic: 1, fish: 2, strawberry: 1 }, meals: 9, rank: 6, mood: 0.35, happy: 0.25, blurb: "A four-star table fit to toast a campaign." },
  { id: "banquet", name: "Harvest banquet", input: { grape: 1, pumpkin: 1, wheat: 1, cabbage: 1 }, meals: 9, rank: 5, mood: 0.3, happy: 0.2, blurb: "A three-star table. The whole town hears of it." },
];

/** Share of a block's crop lost, by the worker's rank on the farm ladder. */
export const FARM_LOSS = [0.6, 0.45, 0.3, 0.18, 0.08];

// ── Refinery recipes ──────────────────────────────────────

export const RECIPES: { id: string; name: string; input: Cost; output: Cost; scientist?: boolean }[] = [
  { id: "planks", name: "Planks", input: { wood: 3 }, output: { planks: 1 } },
  { id: "bricks", name: "Bricks", input: { stone: 3, coal: 1 }, output: { bricks: 1 } },
  { id: "ingots", name: "Iron ingots", input: { iron: 3, coal: 2 }, output: { ingots: 1 } },
  { id: "gunpowder", name: "Gunpowder", input: { coal: 2, herb: 1 }, output: { gunpowder: 1 }, scientist: true },
  { id: "poison", name: "Poison extract", input: { herb: 3, grape: 1 }, output: { poison: 1 }, scientist: true },
  { id: "charcoal", name: "Charcoal", input: { wood: 4 }, output: { coal: 1 } },
  { id: "tools", name: "Tools", input: { ingots: 1, planks: 2 }, output: { tools: 2 } },
];

/**
 * What the laboratory's scientists make. Each scientist works through the
 * recipe once an hour per level of the lab.
 */
export const LAB_RECIPES: { id: string; name: string; input: Cost; output: Cost; blurb: string }[] = [
  { id: "formula", name: "Arcane formula", input: { poison: 1, gunpowder: 1, silver: 2 }, output: { formula: 1 }, blurb: "Steadies a wizard's ascension past level 12." },
  { id: "tonic", name: "Healing tonic", input: { herb: 2, grape: 1 }, output: { tonic: 1 }, blurb: "Taken by any villager whose health falls below 70: +25 health." },
  { id: "fertiliser", name: "Fertiliser", input: { fish: 1, herb: 1, coal: 1 }, output: { fertiliser: 3 }, blurb: "Fields that get it grow a quarter more." },
  { id: "salve", name: "Garlic salve", input: { garlic: 2, herb: 1 }, output: { tonic: 1 }, blurb: "A cheaper tonic from the garlic beds: +25 health below 70." },
];

// ── School courses ────────────────────────────────────────

export const COURSES: { role: Role; name: string; hours: number; cost: Cost; blurb: string }[] = [
  { role: "scientist", name: "Scientist", hours: 12, cost: { coin: 30 }, blurb: "Works the refinery's special compounds." },
  { role: "chef", name: "Kitchen hand", hours: 6, cost: { coin: 10 }, blurb: "Rises to chef, head chef, then one to five stars." },
  { role: "geologist", name: "Geologist", hours: 18, cost: { coin: 40 }, blurb: "Levels 1–10. Raises the odds of rare ore at the mine." },
  { role: "commander", name: "Commander", hours: 24, cost: { coin: 60 }, blurb: "Raises the raw power of every troop." },
  { role: "biologist", name: "Biologist", hours: 20, cost: { coin: 50 }, blurb: "Raises the yield of every farm in town." },
];

// ── Ladders ───────────────────────────────────────────────

export const LADDERS: Partial<Record<Role, string[]>> = {
  farmhand: ["Villager", "Apprentice", "Apprentice II", "Farmer", "Biologist"],
  icer: ["Villager", "Apprentice", "Apprentice II", "Main Icer", "Head Icer", "Ice Master"],
  chef: ["Kitchen Hand", "Chef", "Head Chef", "1★ Chef", "2★ Chef", "3★ Chef", "4★ Chef", "5★ Chef"],
  fisher: ["Villager", "Angler", "Fisher", "Net Master", "Master Angler"],
  geologist: ["Geologist 1", "Geologist 2", "Geologist 3", "Geologist 4", "Geologist 5", "Geologist 6", "Geologist 7", "Geologist 8", "Geologist 9", "Geologist 10"],
};

/** Game hours of work to climb from `rank`. The ladder slows as it rises. */
export const promotionHours = (rank: number) => Math.round(18 * Math.pow(rank + 1, 1.5));

/** The label the census files a villager under. */
export function roleLabel(role: Role, rank: number): string {
  const ladder = LADDERS[role];
  if (ladder) return ladder[Math.min(ladder.length - 1, rank)];
  if (role === "wizard") return rank >= 15 ? `Grand Wizard ${rank}` : `Wizard ${rank}`;
  if (role === "knight") return `${knightTitle(rank).name} ${rank}`;
  if (role === "infantry" || role === "archer" || role === "heavy") return `${soldierTitle(rank).name} ${rank}`;
  const names: Partial<Record<Role, string>> = {
    idle: "Idle", scientist: "Scientist", commander: "Commander", biologist: "Biologist",
    miner: "Miner", lumberjack: "Lumberjack", refiner: "Refiner", trader: "Trader", fisher: "Fisher",
    infantry: "Infantry", archer: "Archer", heavy: "Heavy Infantry",
  };
  return names[role] ?? role;
}

/** Census group — ranks on one ladder collapse to their current title. */
export function censusKey(role: Role, rank: number): string {
  if (role === "farmhand" && rank >= 4) return "Biologist";
  if (role === "wizard") return rank >= 15 ? "Grand Wizard" : "Wizard";
  if (role === "knight") return knightTitle(rank).name;
  if (role === "infantry" || role === "archer" || role === "heavy") return soldierTitle(rank).name;
  if (role === "geologist") return "Geologist";
  if (role === "chef" && rank >= 3) return "Starred Chef";
  return roleLabel(role, rank);
}
