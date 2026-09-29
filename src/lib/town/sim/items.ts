import type { Element } from "./elements";
import { ELEMENTS } from "./elements";
import type { MonsterKind, Role } from "./types";

/**
 * Eight hundred things to find, forge and wear: equipment in thirteen
 * families and seven rarities, the forge's own tiered pieces, thirty
 * singular artifacts, and the loot a fight leaves behind — parts, feet,
 * essences, gems, rare metals, reagents, trophies, scrap and curios.
 *
 * Rarity runs broken → common → rare → special → legendary → mythic →
 * singleton. A broken piece is barely better than a bare hand and is worth
 * more as scrap; a singleton exists once in the world, and once found is
 * never dropped again.
 *
 * The catalogue is built on first use and is the same on every run: item n
 * is always the same item, and has the same icon (art/items.ts).
 */

export type Rarity = "broken" | "common" | "rare" | "special" | "legendary" | "mythic" | "singleton";
export const RARITIES: Rarity[] = ["broken", "common", "rare", "special", "legendary", "mythic", "singleton"];
export const RARITY_NAME: Record<Rarity, string> = {
  broken: "Broken", common: "Common", rare: "Rare", special: "Special", legendary: "Legendary", mythic: "Mythic", singleton: "Singleton",
};
/** Label colours, for the UI and the icons' frames. */
export const RARITY_COLOR: Record<Rarity, string> = {
  broken: "#7d746b", common: "#d8d0c4", rare: "#5aa9ff", special: "#6fe08a", legendary: "#ffb347", mythic: "#e06bff", singleton: "#ff5a6e",
};
export const rarityIndex = (r: Rarity) => RARITIES.indexOf(r);

export type ItemSlot = "weapon" | "armour" | "helm" | "boots" | "ring" | "amulet" | "relic";
export const ITEM_SLOTS: ItemSlot[] = ["weapon", "armour", "helm", "boots", "ring", "amulet", "relic"];
export const SLOT_NAME: Record<ItemSlot, string> = {
  weapon: "Weapon", armour: "Armour", helm: "Helm", boots: "Boots", ring: "Ring", amulet: "Amulet", relic: "Relic",
};

export type ItemFamily =
  | "sword" | "bow" | "crossbow" | "staff" | "halberd" | "plate" | "robe" | "leather"
  | "helm" | "boots" | "ring" | "amulet" | "relic"
  | "part" | "foot" | "essence" | "gem" | "metal" | "reagent" | "trophy" | "scrap" | "curio";

export interface ItemDef {
  id: string;
  /** Its place in the catalogue, and so its icon. */
  n: number;
  name: string;
  family: ItemFamily;
  rarity: Rarity;
  kind: "equipment" | "loot";
  slot?: ItemSlot;
  /** Who can wear it. */
  roles?: Role[];
  element?: Element;
  /** Bonuses as fractions: damage, hit points, pace, attack haste; range in tiles. */
  dmg?: number;
  hp?: number;
  speed?: number;
  haste?: number;
  range?: number;
  /** Tier for training caps (weapons): 0 none, 1 common, 2 rare, 3 legendary. */
  tier?: number;
  /** Coin a trader pays for one. */
  value: number;
  blurb: string;
}

// ── Word lists ────────────────────────────────────────────

const NOUNS: Record<string, string[]> = {
  sword: ["Sword", "Blade", "Sabre", "Falchion", "Broadsword", "Longsword", "Gladius", "Scimitar"],
  bow: ["Bow", "Shortbow", "Longbow", "Recurve", "Hunting bow", "War bow", "Flatbow", "Hornbow"],
  crossbow: ["Crossbow", "Arbalest", "Latchbow", "Repeater", "Stonebow", "Windlass bow", "Siege bow", "Hand crossbow"],
  staff: ["Staff", "Wand", "Rod", "Sceptre", "Orb-staff", "Crook", "Stave", "Focus"],
  halberd: ["Halberd", "Poleaxe", "Glaive", "Bardiche", "Bill", "Partisan", "Voulge", "Warhammer"],
  plate: ["Hauberk", "Cuirass", "Brigandine", "Scale mail", "Plate", "Breastplate", "Coat of plates", "Lamellar"],
  robe: ["Robe", "Mantle", "Vestment", "Cassock", "Cloak", "Habit", "Gown", "Shroud"],
  leather: ["Jerkin", "Tunic", "Gambeson", "Coat", "Vest", "Duster", "Hide coat", "Brigand"],
  helm: ["Helm", "Cap", "Hood", "Coif", "Visor", "Circlet", "Sallet", "Bascinet"],
  boots: ["Boots", "Greaves", "Sandals", "Sabatons", "Shoes", "Striders", "Treads", "Walkers"],
  ring: ["Ring", "Band", "Signet", "Loop", "Seal", "Coil", "Hoop", "Knot"],
  amulet: ["Amulet", "Pendant", "Talisman", "Locket", "Charm", "Torc", "Medallion", "Phylactery"],
  relic: ["Tome", "Idol", "Reliquary", "Censer", "Codex", "Totem", "Chalice", "Icon"],
};

type Stuff = "metal" | "wood" | "cloth" | "hide";
const STUFF: Record<string, Stuff> = {
  sword: "metal", halberd: "metal", plate: "metal", helm: "metal", boots: "hide", ring: "metal", amulet: "metal", relic: "metal",
  bow: "wood", crossbow: "wood", staff: "wood", robe: "cloth", leather: "hide",
};
const BROKEN = ["Broken", "Rusted", "Cracked", "Frayed"];
const COMMON: Record<Stuff, string[]> = {
  metal: ["Iron", "Bronze", "Copper", "Brass", "Pewter", "Tin", "Bone", "Horn"],
  wood: ["Oak", "Ash", "Yew", "Elm", "Hazel", "Willow", "Birch", "Pine"],
  cloth: ["Wool", "Linen", "Hemp", "Felt", "Canvas", "Homespun", "Burlap", "Cotton"],
  hide: ["Hide", "Deerskin", "Rawhide", "Boar-hide", "Goatskin", "Calfskin", "Sealskin", "Wolfskin"],
};
const RARE: Record<Stuff, string[]> = {
  metal: ["Steel", "Silver", "Blued", "Damask", "Folded", "Tempered", "Chased", "Gilded"],
  wood: ["Ironwood", "Heartwood", "Bloodwood", "Blackthorn", "Horn-backed", "Sinew-backed", "Lacquered", "Rosewood"],
  cloth: ["Silk", "Velvet", "Brocade", "Embroidered", "Fine", "Quilted", "Damask", "Satin"],
  hide: ["Studded", "Boiled", "Oiled", "Riveted", "Tooled", "Layered", "Scaled", "Wyrmskin"],
};
const SPECIAL = ["Warden's", "Hunter's", "Sentinel's", "Pilgrim's", "Duelist's", "Vanguard's", "Oathkeeper's", "Wayfarer's"];
const LEGENDARY = ["Wyrmbone", "Runed", "Starforged", "Kingsguard", "Titan's", "Dragonscale", "Moonlit", "Sunforged"];
export const MYTHIC_WORD: Record<Element, string> = {
  earth: "Worldroot", fire: "Emberheart", water: "Tidecaller", air: "Galebound", thunder: "Stormborn",
  light: "Dawnlit", dark: "Nightwoven", time: "Aeon", space: "Voidwrought",
};

/** Who wears each family. */
const WEARERS: Record<string, Role[]> = {
  sword: ["knight"], bow: ["archer"], crossbow: ["archer"], staff: ["wizard"], halberd: ["heavy"],
  plate: ["knight", "heavy"], robe: ["wizard"], leather: ["archer"],
  helm: ["archer", "heavy", "wizard", "knight"], boots: ["archer", "heavy", "wizard", "knight"],
  ring: ["archer", "heavy", "wizard", "knight"], amulet: ["archer", "heavy", "wizard", "knight"],
  relic: ["wizard", "knight"],
};
const SLOT_OF: Record<string, ItemSlot> = {
  sword: "weapon", bow: "weapon", crossbow: "weapon", staff: "weapon", halberd: "weapon",
  plate: "armour", robe: "armour", leather: "armour", helm: "helm", boots: "boots", ring: "ring", amulet: "amulet", relic: "relic",
};

// ── Stats by rarity (index 0 broken … 6 singleton) ────────

const WEAPON_DMG = [0.05, 0.2, 0.45, 0.65, 0.9, 1.3, 1.6];
const ARMOUR_HP = [0.1, 0.25, 0.5, 0.7, 1.0, 1.4, 1.8];
const BOOT_SPEED = [0, 0.04, 0.08, 0.12, 0.16, 0.22, 0.3];
const RING_HASTE = [0, 0.02, 0.04, 0.06, 0.08, 0.12, 0.15];
const RELIC_RANGE = [0, 0.2, 0.4, 0.6, 0.8, 1.2, 1.5];
const VALUE = [1, 5, 20, 45, 120, 400, 1500];
const TIER = [0, 1, 2, 2, 3, 3, 3];

function statsFor(family: string, r: number, k: number): Pick<ItemDef, "dmg" | "hp" | "speed" | "haste" | "range"> {
  const j = (k % 4) * 0.02; // variants within a rarity differ a little
  const round = (x: number) => Math.round(x * 1000) / 1000;
  switch (family) {
    case "sword": return { dmg: round(WEAPON_DMG[r] + j), hp: round(0.05 * r) };
    case "bow": return { dmg: round(WEAPON_DMG[r] + j), haste: round(RING_HASTE[r] * 0.5) };
    case "crossbow": return { dmg: round(WEAPON_DMG[r] * 1.15 + j), range: round(RELIC_RANGE[r] * 0.5) };
    case "staff": return { dmg: round(WEAPON_DMG[r] + j), range: round(RELIC_RANGE[r]) };
    case "halberd": return { dmg: round(WEAPON_DMG[r] * 0.9 + j), hp: round(0.08 * r) };
    case "plate": return { hp: round(ARMOUR_HP[r] + j) };
    case "robe": return { hp: round(ARMOUR_HP[r] * 0.6 + j), dmg: round(0.06 * r) };
    case "leather": return { hp: round(ARMOUR_HP[r] * 0.8 + j), speed: round(BOOT_SPEED[r] * 0.5) };
    case "helm": return { hp: round(ARMOUR_HP[r] * 0.4 + j) };
    case "boots": return { speed: round(BOOT_SPEED[r] + j / 2), hp: round(ARMOUR_HP[r] * 0.15) };
    case "ring": return { dmg: round(WEAPON_DMG[r] * 0.3 + j), haste: round(RING_HASTE[r]) };
    case "amulet": return { hp: round(ARMOUR_HP[r] * 0.3 + j), dmg: round(WEAPON_DMG[r] * 0.2) };
    case "relic": return { dmg: round(WEAPON_DMG[r] * 0.25), hp: round(ARMOUR_HP[r] * 0.25), range: round(RELIC_RANGE[r] + j) };
    default: return {};
  }
}

/** The forge's own pieces, tier by tier, kept under their old ids. */
const FORGED: { id: string; name: string; family: string; tier: 1 | 2 | 3; blurb: string }[] = [
  { id: "sword1", name: "Fang-edged sword", family: "sword", tier: 1, blurb: "A knight's first real blade." },
  { id: "bow1", name: "Sinew bow", family: "bow", tier: 1, blurb: "Hide-wrapped, bone-tipped." },
  { id: "staff1", name: "Ichor staff", family: "staff", tier: 1, blurb: "Venom set in the head: a focus." },
  { id: "halberd1", name: "Fang halberd", family: "halberd", tier: 1, blurb: "Long enough to keep a wolf off." },
  { id: "hidecoat", name: "Hide coat", family: "leather", tier: 1, blurb: "Stops a claw, mostly." },
  { id: "sword2", name: "Scaleblade", family: "sword", tier: 2, blurb: "Drake scale folded into the steel." },
  { id: "bow2", name: "Wyrmsinew longbow", family: "bow", tier: 2, blurb: "Its arrows find what flies." },
  { id: "staff2", name: "Wraithglass staff", family: "staff", tier: 2, blurb: "A spirit, caught and made to listen." },
  { id: "halberd2", name: "Coreforged halberd", family: "halberd", tier: 2, blurb: "Heavier than it looks, and it looks heavy." },
  { id: "bonemail", name: "Bone mail", family: "plate", tier: 2, blurb: "Scale over bone over hide." },
  { id: "oathblade", name: "Oathblade", family: "sword", tier: 3, blurb: "Forged under a knight's oath." },
  { id: "aegis", name: "Aegis plate", family: "plate", tier: 3, blurb: "A paladin's armour, made by one." },
  { id: "hexstaff", name: "Hexstaff", family: "staff", tier: 3, blurb: "Needs an archmage to bind the jewels." },
  { id: "starweave", name: "Starweave robe", family: "robe", tier: 3, blurb: "Woven by an archmage from what the wraiths leave." },
  { id: "wyrmbow", name: "Wyrmbone bow", family: "bow", tier: 3, blurb: "A paladin's gift to the range." },
];
// The forge's pieces keep their old strength: +20/45/90% damage, +25/50/100% hit points.
const FORGED_DMG = [0, 0.2, 0.45, 0.9];
const FORGED_HP = [0, 0.25, 0.5, 1];
const FORGED_RARITY: Rarity[] = ["common", "common", "rare", "legendary"];
/** Worldsplitter is the fifteenth forge piece; it stays a forge piece. */
const WORLDSPLITTER = { id: "worldsplitter", name: "Worldsplitter", family: "halberd", tier: 3 as const, blurb: "A paladin forged it; a giant might lift it." };

/** Thirty things that exist once. */
export const SINGLETONS: { id: string; name: string; family: string; element?: Element; blurb: string }[] = [
  { id: "dawnbreaker", name: "Dawnbreaker", family: "sword", element: "light", blurb: "The first sword to be lifted against the dark. It will not rust." },
  { id: "tidefang", name: "Tidefang", family: "sword", element: "water", blurb: "A blade that rings like surf, and cuts like the undertow." },
  { id: "emberfall", name: "Emberfall", family: "halberd", element: "fire", blurb: "Its edge is a line of coals that never cools." },
  { id: "mountainmaw", name: "Mountainmaw", family: "halberd", element: "earth", blurb: "Quarried, not forged. It weighs what a hill weighs." },
  { id: "galewing", name: "Galewing", family: "bow", element: "air", blurb: "Its arrows ride the wind the archer calls." },
  { id: "nightsong", name: "Nightsong", family: "crossbow", element: "dark", blurb: "The bolt is never seen, only heard, and only after." },
  { id: "voidpiercer", name: "Voidpiercer", family: "bow", element: "space", blurb: "Its arrow is already where it is going." },
  { id: "thunderclap", name: "Thunderclap", family: "crossbow", element: "thunder", blurb: "The string is a lightning-thread; the bolt, the storm." },
  { id: "stormcaller", name: "Stormcaller", family: "staff", element: "thunder", blurb: "Raised, it brings the clouds down to the rooftops." },
  { id: "hourglass-sceptre", name: "The Hourglass Sceptre", family: "staff", element: "time", blurb: "The sand in it runs both ways." },
  { id: "starweaver-rod", name: "Starweaver's Rod", family: "staff", element: "space", blurb: "It draws the constellations closer." },
  { id: "aegis-first-king", name: "Aegis of the First King", family: "plate", element: "light", blurb: "Plate that remembers every blow it turned, and shines for each." },
  { id: "mantle-of-stars", name: "Mantle of Stars", family: "robe", element: "space", blurb: "The night sky, cut and hemmed." },
  { id: "shadowhide", name: "Shadowhide", family: "leather", element: "dark", blurb: "Tanned from a shade. The wearer is hard to find." },
  { id: "tidewall", name: "Tidewall Hauberk", family: "plate", element: "water", blurb: "Mail that moves like water and stops like a sea wall." },
  { id: "crown-of-the-realm", name: "Crown of the Realm", family: "helm", element: "light", blurb: "There is one crown. Whoever wears it is King." },
  { id: "helm-storm-king", name: "Helm of the Storm-king", family: "helm", element: "thunder", blurb: "Thunder answers the one beneath it." },
  { id: "veil-of-ages", name: "Veil of Ages", family: "helm", element: "time", blurb: "Through it, a moment lasts as long as the wearer needs." },
  { id: "sevenleague", name: "Sevenleague Boots", family: "boots", element: "air", blurb: "Seven leagues to a stride, and never tired." },
  { id: "emberstride", name: "Emberstride", family: "boots", element: "fire", blurb: "Footprints that smoulder for a day." },
  { id: "ring-of-hours", name: "Ring of Hours", family: "ring", element: "time", blurb: "It turns on the finger, and the day turns with it." },
  { id: "band-of-the-deep", name: "Band of the Deep", family: "ring", element: "water", blurb: "Cold as the sea floor. The wearer never drowns." },
  { id: "seal-of-the-void", name: "Seal of the Void", family: "ring", element: "space", blurb: "The stone is a hole in the world." },
  { id: "heart-of-the-mountain", name: "Heart of the Mountain", family: "amulet", element: "earth", blurb: "It beats once a day, slow as stone." },
  { id: "phoenix-tear", name: "Phoenix Tear", family: "amulet", element: "fire", blurb: "Warm to the touch. Some say it will bring its wearer back once." },
  { id: "eye-of-night", name: "Eye of Night", family: "amulet", element: "dark", blurb: "It sees what the dark hides." },
  { id: "book-of-enlightenment", name: "The Book of Enlightenment", family: "relic", blurb: "Written from one of your own emblems. A grand wizard who reads it whole becomes a Master of Mythic Arts." },
  { id: "chalice-of-dawn", name: "Chalice of Dawn", family: "relic", element: "light", blurb: "What is poured into it comes out as light." },
  { id: "codex-of-the-nine", name: "Codex of the Nine", family: "relic", blurb: "Every element, and what beats it, in one hand." },
  { id: "hourglass-of-the-eye", name: "The Hourglass of the Eye", family: "relic", element: "time", blurb: "An Eye of Time who holds it burns half the metal to see." },
];

// ── Loot ──────────────────────────────────────────────────

const PART_LOOT: { id: string; name: string; rarity: Rarity; blurb: string }[] = [
  { id: "hide", name: "Hide", rarity: "common", blurb: "Tough skin from beasts." },
  { id: "fang", name: "Fang", rarity: "common", blurb: "Teeth and claws, sharp enough to edge a blade." },
  { id: "bone", name: "Bone", rarity: "common", blurb: "From the dead, and from the very large." },
  { id: "ichor", name: "Ichor", rarity: "common", blurb: "Venom, slime and sap." },
  { id: "scale", name: "Scale", rarity: "rare", blurb: "From drakes and serpents. Turns a blade." },
  { id: "ectoplasm", name: "Ectoplasm", rarity: "rare", blurb: "What is left of a spirit. Takes an enchantment." },
  { id: "core", name: "Core", rarity: "rare", blurb: "The heart of something that should not move." },
  { id: "jewel", name: "Monster jewel", rarity: "special", blurb: "Rare. Grown inside the strongest monsters." },
  { id: "heart", name: "Monster heart", rarity: "special", blurb: "Set into a tower, it widens its passive reach." },
  { id: "eye", name: "Monster eye", rarity: "special", blurb: "Set into a tower, it lengthens its active reach." },
];
const GEMS = ["Ruby", "Sapphire", "Emerald", "Topaz", "Amethyst", "Onyx", "Opal", "Pearl", "Garnet", "Jade", "Moonstone", "Sunstone"];
const GEM_GRADES: [string, string, Rarity][] = [["chipped", "Chipped", "common"], ["cut", "Cut", "rare"], ["radiant", "Radiant", "special"]];
const ESSENCE_GRADES: [string, string, Rarity][] = [["lesser", "Lesser", "rare"], ["greater", "Greater", "legendary"], ["primal", "Primal", "mythic"]];
const METALS: [string, string, Rarity, string][] = [
  ["star-iron", "Star iron", "special", "Fell from the sky. Takes an edge nothing else will."],
  ["moon-silver", "Moon silver", "special", "Silver that shines in the dark."],
  ["sky-bronze", "Sky bronze", "special", "Light as a feather, hard as a bell."],
  ["deep-gold", "Deep gold", "special", "From the roots of the mountains; heavier than it should be."],
  ["meteoric-glass", "Meteoric glass", "special", "Black glass from a falling star."],
  ["orichalcum", "Orichalcum", "legendary", "The red metal of lost cities."],
  ["adamant", "Adamant", "legendary", "It does not break. It barely scratches."],
  ["dragonsteel", "Dragonsteel", "legendary", "Steel quenched in a dragon's blood."],
];
const REAGENTS: [string, string, Rarity, string][] = [
  ["quicksilver", "Quicksilver", "special", "Living metal: the alchemist's first servant."],
  ["dragons-blood", "Dragon's blood", "legendary", "Still warm in the flask."],
  ["starlight-dust", "Starlight dust", "special", "Swept from an observatory's lens at dawn."],
  ["moonwater", "Moonwater", "special", "Water left out under a full moon."],
  ["void-salt", "Void salt", "legendary", "Salt that tastes of nothing at all."],
  ["time-sand", "Time sand", "legendary", "Sand from an hourglass that ran out."],
  ["phoenix-ash", "Phoenix ash", "mythic", "Ash that is never cold."],
  ["storm-glass", "Storm glass", "special", "Glass where lightning struck sand."],
];
const SCRAPS: [string, string, string][] = [
  ["scrap-iron", "Iron scrap", "Bent nails, broken links. The forge takes it back."],
  ["scrap-cloth", "Cloth scrap", "Rags. Enough of them make a patch."],
  ["scrap-wood", "Wood splinters", "What is left of a broken haft."],
  ["scrap-bone", "Bone shards", "Too small to carve, not too small to grind."],
  ["scrap-gem", "Cracked gem", "It will never be cut now."],
  ["scrap-coin", "Tarnished coin", "Somebody's once. Worth a little by weight."],
];
const CURIOS: [string, string, Rarity, string][] = [
  ["curio-idol", "Golden idol", "special", "Heavy, ugly and worth a fortune to the right trader."],
  ["curio-chalice", "Silver chalice", "rare", "A cup from somebody's chapel."],
  ["curio-hoard", "Old coin hoard", "rare", "A purse of coins no one mints any more."],
  ["curio-goblet", "Jewelled goblet", "special", "Too fine to drink from."],
  ["curio-ivory", "Carved ivory", "rare", "A hunt, carved around a tusk."],
  ["curio-map", "Ancient map", "special", "Of a coast that is not there any more."],
];

/** A monster's great trophy: what it leaves only when it falls. */
export const TROPHY: Partial<Record<MonsterKind, { id: string; name: string; blurb: string }>> = {
  lich: { id: "trophy-lich", name: "Lich's phylactery", blurb: "Emptied. Mostly." },
  wyvern: { id: "trophy-wyvern", name: "Wyvern wing", blurb: "Leather stretched on bone, ten feet of it." },
  serpent: { id: "trophy-serpent", name: "Serpent coil", blurb: "A length of the Deep Serpent, salted." },
  demon: { id: "trophy-demon", name: "Demon horn", blurb: "Still warm, a week later." },
  dragon: { id: "trophy-dragon", name: "Dragon heart", blurb: "It beat once after it was cut out." },
  hydra: { id: "trophy-hydra", name: "Hydra head", blurb: "One of five. The others did not stay dead." },
  kitsune: { id: "trophy-kitsune", name: "Kitsune tail", blurb: "One of nine, trailing foxfire." },
  gashadokuro: { id: "trophy-gashadokuro", name: "Giant's skull", blurb: "A skull you could stand up in." },
  nian: { id: "trophy-nian", name: "Nian mane", blurb: "Red as the lanterns that frighten it." },
  elderdragon: { id: "trophy-elderdragon", name: "Elder dragon's heart", blurb: "Older than the town. Older than the hills." },
  phoenix: { id: "trophy-phoenix", name: "Phoenix feather", blurb: "It burns without burning away." },
  leviathan: { id: "trophy-leviathan", name: "Leviathan scale", blurb: "A shield, without any work at all." },
  behemoth: { id: "trophy-behemoth", name: "Behemoth horn", blurb: "The earth's own tusk." },
  stormroc: { id: "trophy-stormroc", name: "Roc plume", blurb: "A feather the height of a man, crackling." },
  raiju: { id: "trophy-raiju", name: "Raijū fang", blurb: "It sparks when you touch it." },
  seraph: { id: "trophy-seraph", name: "Seraph's halo-shard", blurb: "Too bright to look at for long." },
  shadowcolossus: { id: "trophy-shadowcolossus", name: "Colossus shade", blurb: "A piece of darkness, in a jar." },
  voidwalker: { id: "trophy-voidwalker", name: "Void shard", blurb: "A splinter of the space between places." },
};

/** Every monster kind, for its foot. Kept here so the list of feet is fixed. */
export const FOOT_KINDS: MonsterKind[] = [
  "slime", "bat", "spider", "goblin", "skeleton", "wolf", "werewolf", "wraith", "minotaur", "troll", "lich", "golem", "wyvern", "serpent",
  "demon", "dragon", "elderdragon", "harpy", "ogre", "mimic", "treant", "salamander", "frostgiant", "banshee", "basilisk", "ghoul",
  "gargoyle", "cyclops", "vampire", "hydra", "griffin", "wisp", "wendigo", "oni", "kappa", "tengu", "jiangshi", "kitsune", "yurei",
  "gashadokuro", "jorogumo", "nian", "phoenix", "leviathan", "behemoth", "stormroc", "raiju", "seraph", "shadowcolossus", "voidwalker",
];
/** Which kinds are legendary and mythic, for their feet's rarity (the bestiary holds the rest). */
const LEGENDARY_KINDS = new Set<MonsterKind>(["lich", "wyvern", "serpent", "demon", "dragon", "hydra", "kitsune", "gashadokuro", "nian"]);
const MYTHIC_KINDS = new Set<MonsterKind>(["elderdragon", "phoenix", "leviathan", "behemoth", "stormroc", "raiju", "seraph", "shadowcolossus", "voidwalker"]);

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const titleName = (kind: MonsterKind) => kind === "elderdragon" ? "Elder dragon" : kind === "stormroc" ? "Storm roc" : kind === "shadowcolossus" ? "Shadow colossus"
  : kind === "voidwalker" ? "Void walker" : kind === "frostgiant" ? "Frost giant" : kind === "raiju" ? "Raijū" : cap(kind);

// ── The catalogue ─────────────────────────────────────────

let built: ItemDef[] | null = null;
let byId: Map<string, ItemDef> | null = null;

function build(): ItemDef[] {
  const out: Omit<ItemDef, "n">[] = [];
  const families = ["sword", "bow", "crossbow", "staff", "halberd", "plate", "robe", "leather", "helm", "boots", "ring", "amulet", "relic"];
  for (const family of families) {
    const nouns = NOUNS[family];
    const stuff = STUFF[family];
    const base = { family: family as ItemFamily, kind: "equipment" as const, slot: SLOT_OF[family], roles: WEARERS[family] };
    const add = (id: string, name: string, rarity: Rarity, k: number, blurb: string, element?: Element) => {
      const r = rarityIndex(rarity);
      out.push({ ...base, id, name, rarity, element, ...statsFor(family, r, k), tier: SLOT_OF[family] === "weapon" ? TIER[r] : undefined, value: Math.round(VALUE[r] * (1 + k * 0.05)), blurb });
    };
    BROKEN.forEach((w, k) => add(`${family}-broken-${k}`, `${w} ${nouns[k].toLowerCase()}`, "broken", k, "More use as scrap than as a weapon. The forge can mend it."));
    COMMON[stuff].forEach((w, k) => add(`${family}-common-${k}`, `${w} ${nouns[k].toLowerCase()}`, "common", k, "Plain work, honestly made."));
    RARE[stuff].forEach((w, k) => add(`${family}-rare-${k}`, `${w} ${nouns[k].toLowerCase()}`, "rare", k, "Better than anything the town could make itself."));
    SPECIAL.forEach((w, k) => add(`${family}-special-${k}`, `${w} ${nouns[k].toLowerCase()}`, "special", k, "Made for someone. It remembers who."));
    LEGENDARY.forEach((w, k) => add(`${family}-legendary-${k}`, `${w} ${nouns[k].toLowerCase()}`, "legendary", k, "The kind of thing songs are made about."));
    ELEMENTS.forEach((e, k) => add(`${family}-mythic-${e}`, `${MYTHIC_WORD[e]} ${nouns[k % nouns.length].toLowerCase()}`, "mythic", k, `Steeped in ${e}. Its blow is of ${e}.`, e));
  }
  for (const f of [...FORGED, WORLDSPLITTER]) {
    const weapon = SLOT_OF[f.family] === "weapon";
    out.push({
      id: f.id, name: f.name, family: f.family as ItemFamily, kind: "equipment", slot: SLOT_OF[f.family], roles: WEARERS[f.family],
      rarity: FORGED_RARITY[f.tier], dmg: weapon ? FORGED_DMG[f.tier] : undefined, hp: weapon ? undefined : FORGED_HP[f.tier],
      tier: weapon ? f.tier : undefined, value: VALUE[rarityIndex(FORGED_RARITY[f.tier])], blurb: `${f.blurb} Forged in town.`,
    });
  }
  for (const a of SINGLETONS) {
    const st = statsFor(a.family, 6, 3);
    out.push({
      id: a.id, name: a.name, family: a.family as ItemFamily, kind: "equipment", slot: SLOT_OF[a.family], roles: WEARERS[a.family],
      rarity: "singleton", element: a.element, ...st, tier: SLOT_OF[a.family] === "weapon" ? 3 : undefined, value: VALUE[6], blurb: a.blurb,
    });
  }
  // Loot.
  const loot = (id: string, name: string, family: ItemFamily, rarity: Rarity, blurb: string, element?: Element) =>
    out.push({ id, name, family, kind: "loot", rarity, element, value: VALUE[rarityIndex(rarity)], blurb });
  for (const p of PART_LOOT) loot(p.id, p.name, "part", p.rarity, p.blurb);
  for (const k of FOOT_KINDS) {
    const rarity: Rarity = MYTHIC_KINDS.has(k) ? "mythic" : LEGENDARY_KINDS.has(k) ? "legendary" : "rare";
    loot(`foot:${k}`, `${titleName(k)} foot`, "foot", rarity, "Set into a tower or spire, it quickens strikes against its own kind.");
  }
  for (const e of ELEMENTS) for (const [g, G, rarity] of ESSENCE_GRADES) loot(`essence-${e}-${g}`, `${G} ${e} essence`, "essence", rarity, `Distilled ${e}. The mythic laboratory's stock-in-trade.`, e);
  for (const gem of GEMS) for (const [g, G, rarity] of GEM_GRADES) loot(`gem-${gem.toLowerCase()}-${g}`, `${G} ${gem.toLowerCase()}`, "gem", rarity, g === "chipped" ? "A chip off something better." : g === "cut" ? "Faceted, and it catches the light." : "It gives off a light of its own.");
  for (const [id, name, rarity, blurb] of METALS) loot(`metal-${id}`, name, "metal", rarity, blurb);
  for (const [id, name, rarity, blurb] of REAGENTS) loot(`reagent-${id}`, name, "reagent", rarity, blurb);
  for (const k of FOOT_KINDS) {
    const t = TROPHY[k];
    if (t) loot(t.id, t.name, "trophy", MYTHIC_KINDS.has(k) ? "mythic" : "legendary", t.blurb);
  }
  for (const [id, name, blurb] of SCRAPS) loot(id, name, "scrap", "broken", blurb);
  for (const [id, name, rarity, blurb] of CURIOS) loot(id, name, "curio", rarity, blurb);
  return out.map((d, n) => ({ ...d, n }));
}

/** Every item, in order: item n has icon n. */
export function itemList(): ItemDef[] {
  if (!built) {
    built = build();
    byId = new Map(built.map((d) => [d.id, d]));
  }
  return built;
}

/**
 * An item by id. Books of Enlightenment are written one per emblem
 * (`book:<code>`) and share the book's entry; unknown ids are undefined.
 */
export function itemDef(id: string): ItemDef | undefined {
  itemList();
  if (id.startsWith("book:")) return byId!.get("book-of-enlightenment");
  return byId!.get(id);
}

export const isEquipment = (id: string) => itemDef(id)?.kind === "equipment";
export const rarityOf = (id: string): Rarity => itemDef(id)?.rarity ?? "common";

/** Items of one family and rarity, for rolling a drop. */
const pools = new Map<string, ItemDef[]>();
export function poolOf(rarity: Rarity, kind: "equipment" | "loot" = "equipment", family?: ItemFamily): ItemDef[] {
  const key = `${rarity}:${kind}:${family ?? ""}`;
  let p = pools.get(key);
  if (!p) pools.set(key, (p = itemList().filter((d) => d.rarity === rarity && d.kind === kind && (!family || d.family === family) && !FORGED_IDS.has(d.id) && d.id !== "book-of-enlightenment" && d.id !== "crown-of-the-realm")));
  return p;
}
/** Pieces made at the forge: never dropped. */
export const FORGED_IDS = new Set([...FORGED.map((f) => f.id), WORLDSPLITTER.id]);
