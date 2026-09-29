import { ATTR_NAME, attrsOf, growOnRise } from "./attributes";
import { roleLabel, soldierTitle } from "./catalog";
import type { Cost } from "./catalog";
import { byId, log } from "./state";
import { onDeath } from "./recognition";
import { canAfford, costText, pay, rng } from "./world";
import { thriftRefund, windfall } from "./paths";
import type { GameState, MonsterKind, Role, Structure, Villager } from "./types";
import type { SimContext } from "./tick";
import { MONSTERS, tierOf } from "./bestiary";
import { petrify } from "./champions";
import { stats } from "./stats";
import type { Element } from "./elements";
import {
  ITEM_SLOTS, SINGLETONS, TROPHY, itemDef, poolOf, rarityIndex, type ItemDef, type ItemFamily, type ItemSlot, type Rarity,
} from "./items";

/**
 * What monsters leave behind, and what the forge makes of it.
 *
 *   - Every kill drops parts — hide, fang, bone, ichor, scale, ectoplasm,
 *     core — by the kind of thing it was, more the higher its level. Strong
 *     monsters sometimes carry a jewel.
 *   - Spoils are kept only in a forge. Its store holds one stack per slot,
 *     and a level adds two slots; whatever does not fit is left on the field.
 *   - The forge turns parts into gear. Special troops — archers, heavies,
 *     wizards, knights — cannot train past level 8 without a weapon, and the
 *     weapon's tier sets how far they can go.
 *   - Wizards past 12 do not simply level: each step is an attempt that can
 *     kill them. Emblem knights go out on sorties for a battalion and for
 *     jewels, and advance only with both and a deep enough emblem.
 */

type Result = string | null;

// ── Parts ─────────────────────────────────────────────────

export const PARTS = {
  hide: { name: "Hide", blurb: "Tough skin from beasts." },
  fang: { name: "Fang", blurb: "Teeth and claws, sharp enough to edge a blade." },
  bone: { name: "Bone", blurb: "From the dead, and from the very large." },
  ichor: { name: "Ichor", blurb: "Venom, slime and sap." },
  scale: { name: "Scale", blurb: "From drakes and serpents. Turns a blade." },
  ectoplasm: { name: "Ectoplasm", blurb: "What is left of a spirit. Takes an enchantment." },
  core: { name: "Core", blurb: "The heart of something that should not move." },
  jewel: { name: "Monster jewel", blurb: "Rare. Grown inside the strongest monsters." },
} as const;
export type PartKey = keyof typeof PARTS;

export const DROPS: Record<MonsterKind, PartKey[]> = {
  slime: ["ichor"], bat: ["hide", "fang"], spider: ["ichor", "fang"], goblin: ["fang", "hide"],
  skeleton: ["bone"], wolf: ["hide", "fang"], werewolf: ["hide", "fang"], wraith: ["ectoplasm"],
  minotaur: ["hide", "bone"], troll: ["hide", "bone"], lich: ["bone", "ectoplasm"], golem: ["core"],
  wyvern: ["scale", "fang"], serpent: ["scale", "fang"], demon: ["scale", "core"], dragon: ["scale", "core"],
  elderdragon: ["scale", "core"], harpy: ["hide"], ogre: ["hide", "bone"], mimic: ["core", "ichor"],
  treant: ["ichor", "core"], salamander: ["scale", "hide"], frostgiant: ["bone", "core"], banshee: ["ectoplasm"],
  basilisk: ["scale", "fang"],
  ghoul: ["bone", "hide"], gargoyle: ["core"], cyclops: ["bone", "hide"], vampire: ["fang", "ectoplasm"], hydra: ["scale", "fang"],
  griffin: ["hide", "fang"], wisp: ["ectoplasm"], wendigo: ["bone", "hide"], oni: ["bone", "core"], kappa: ["scale", "ichor"],
  tengu: ["hide"], jiangshi: ["bone", "ectoplasm"], kitsune: ["hide", "ectoplasm"], yurei: ["ectoplasm"], gashadokuro: ["bone", "core"],
  jorogumo: ["ichor", "fang"], nian: ["hide", "core"],
  phoenix: ["scale", "core"], leviathan: ["scale", "core"], behemoth: ["hide", "bone", "core"], stormroc: ["hide", "core"],
  raiju: ["fang", "core"], seraph: ["ectoplasm", "core"], shadowcolossus: ["ectoplasm", "bone"], voidwalker: ["ectoplasm", "core"],
  scorpion: ["scale", "fang"], jackal: ["hide", "fang"], mummy: ["bone", "ectoplasm"], sandworm: ["scale", "fang", "core"], djinn: ["ectoplasm", "core", "jewel"], sphinx: ["hide", "jewel", "core"],
  pixie: ["ectoplasm"], skyray: ["hide", "fang"], cloudjelly: ["ichor"], thunderbird: ["hide", "core"], stormgiant: ["bone", "core"], skyserpent: ["scale", "jewel", "core"],
};

/** What one fallen monster leaves. */
export function dropsFor(kind: MonsterKind, level: number, legendary: boolean, r: () => number): Record<string, number> {
  const out: Record<string, number> = {};
  const kinds = DROPS[kind] ?? ["bone"];
  const n = 1 + Math.floor(level / 5);
  for (let i = 0; i < n; i++) {
    const p = kinds[Math.floor(r() * kinds.length)];
    out[p] = (out[p] ?? 0) + 1;
  }
  const jewel = legendary ? 1 : level >= 5 ? Math.min(0.5, level * 0.015) : 0;
  if (jewel >= 1 || r() < jewel) out.jewel = (out.jewel ?? 0) + Math.max(1, Math.floor(jewel));
  // High-tier monsters (level 10 and up) can leave a foot, a heart or an eye: parts for the towers (./augment).
  if (level >= 10) {
    if (r() < 0.25) out[`foot:${kind}`] = (out[`foot:${kind}`] ?? 0) + 1;
    if (r() < 0.12) out.heart = (out.heart ?? 0) + 1;
    if (r() < 0.12) out.eye = (out.eye ?? 0) + 1;
  }
  return out;
}

// ── Loot: equipment and the rest ─────────────────────────

/** Weights over broken … mythic for an equipment drop, by band. */
const DROP_WEIGHTS = [
  [60, 40, 0, 0, 0, 0],
  [25, 55, 20, 0, 0, 0],
  [5, 45, 38, 12, 0, 0],
  [0, 15, 45, 32, 8, 0],
  [0, 0, 20, 45, 30, 5],
  [0, 0, 0, 20, 50, 30],
];
const DROP_RARITY: Rarity[] = ["broken", "common", "rare", "special", "legendary", "mythic"];

/** The rarity of an equipment drop: by the monster's level, a band up for legendary things, the top band for mythic ones. */
export function dropRarity(level: number, tier: "common" | "legendary" | "mythic", r: () => number): Rarity {
  const band = tier === "mythic" ? 5 : Math.min(4, (level < 5 ? 0 : level < 15 ? 1 : level < 30 ? 2 : level < 60 ? 3 : 4) + (tier === "legendary" ? 1 : 0));
  const w = DROP_WEIGHTS[band];
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return DROP_RARITY[i];
  return "common";
}

const GEM_NAMES = ["ruby", "sapphire", "emerald", "topaz", "amethyst", "onyx", "opal", "pearl", "garnet", "jade", "moonstone", "sunstone"];
const SCRAP_IDS = ["scrap-iron", "scrap-cloth", "scrap-wood", "scrap-bone", "scrap-gem", "scrap-coin"];
const CURIO_IDS = ["curio-idol", "curio-chalice", "curio-hoard", "curio-goblet", "curio-ivory", "curio-map"];

/**
 * What a fallen monster leaves beyond its parts: a piece of equipment now and
 * then (always from a mythic thing, often from a legendary one), gems from
 * the stronger, scrap from the weak, the essence of a legendary or mythic
 * thing's element, its great trophy, and once in a while a curio.
 */
export function lootFor(kind: MonsterKind, level: number, r: () => number): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, n = 1) => (out[id] = (out[id] ?? 0) + n);
  const tier = tierOf(kind);
  const def = MONSTERS[kind];
  const pEquip = tier === "mythic" ? 1 : tier === "legendary" ? 0.6 : Math.min(0.25, 0.04 + level * 0.004);
  for (let i = 0; i < (tier === "mythic" ? 2 : 1); i++) {
    if (r() >= pEquip) continue;
    const pool = poolOf(dropRarity(level, tier, r));
    if (pool.length) add(pool[Math.floor(r() * pool.length)].id);
  }
  if (level < 8 && r() < 0.15) add(SCRAP_IDS[Math.floor(r() * SCRAP_IDS.length)]);
  if (level >= 5 && r() < Math.min(0.2, 0.02 + level * 0.003)) {
    const grade = level < 20 ? "chipped" : level < 50 ? "cut" : "radiant";
    add(`gem-${GEM_NAMES[Math.floor(r() * GEM_NAMES.length)]}-${grade}`);
  }
  if (def.element && tier !== "common") {
    const grade = tier === "mythic" ? (r() < 0.3 ? "primal" : "greater") : r() < 0.2 ? "greater" : "lesser";
    add(`essence-${def.element}-${grade}`, tier === "mythic" ? 2 : 1);
  }
  const trophy = TROPHY[kind];
  if (trophy && (tier === "mythic" || r() < 0.3)) add(trophy.id);
  if (level >= 10 && r() < 0.02) add(CURIO_IDS[Math.floor(r() * CURIO_IDS.length)]);
  return out;
}

/** Artifacts made, not found: the Book and the Crown come from the mythic laboratory. */
const CRAFTED_SINGLETONS = new Set(["book-of-enlightenment", "crown-of-the-realm"]);

/**
 * One of the singular artifacts not yet in the world, of an element if one is
 * asked for and any is left: marked found, and never dropped again.
 */
export function claimSingleton(s: GameState, r: () => number, element?: Element | null): string | null {
  const found = new Set(s.singletons ?? []);
  const left = SINGLETONS.filter((a) => !found.has(a.id) && !CRAFTED_SINGLETONS.has(a.id));
  const of = element ? left.filter((a) => a.element === element) : [];
  const pick = (of.length ? of : left)[Math.floor(r() * (of.length ? of : left).length)];
  if (!pick) return null;
  (s.singletons ??= []).push(pick.id);
  return pick.id;
}

/** Scrap a piece of each stuff gives back. */
const SCRAP_OF: Partial<Record<ItemFamily, string>> = {
  sword: "scrap-iron", halberd: "scrap-iron", plate: "scrap-iron", helm: "scrap-iron", ring: "scrap-coin", amulet: "scrap-coin",
  bow: "scrap-wood", crossbow: "scrap-wood", staff: "scrap-wood", relic: "scrap-coin", robe: "scrap-cloth", leather: "scrap-cloth", boots: "scrap-cloth",
};

/** What breaking a piece down gives back, by rarity. */
export function salvageYield(id: string): Record<string, number> {
  const d = itemDef(id);
  if (!d || d.kind !== "equipment") return {};
  const scrap = SCRAP_OF[d.family] ?? "scrap-iron";
  const r = rarityIndex(d.rarity);
  const out: Record<string, number> = { [scrap]: 1 + Math.min(3, r) };
  if (r >= 1) out[["hide", "fang", "bone", "ichor"][d.n % 4]] = r;
  if (r >= 3) out.jewel = r - 2;
  if (r >= 5 && d.element) out[`essence-${d.element}-lesser`] = 2;
  return out;
}

export function salvage(s: GameState, id: string): Result {
  const d = itemDef(id);
  if (!d || d.kind !== "equipment") return "Only equipment can be broken down.";
  if (d.rarity === "singleton") return "A singular piece is not broken down.";
  if (!take(s, id, 1)) return "None in the forge's store.";
  const got = salvageYield(id);
  const lost = Object.entries(got).reduce((a, [k, n]) => a + store(s, k, n), 0);
  log(s, `The ${d.name.toLowerCase()} is broken down: ${Object.entries(got).map(([k, n]) => `${n} ${itemDef(k)?.name.toLowerCase() ?? k}`).join(", ")}${lost ? ` (${lost} would not fit)` : ""}.`, "info");
  return null;
}

/** What mending a broken piece costs: two of its scrap and some coin. */
export const REPAIR_COIN = 10;
export function repair(s: GameState, id: string): Result {
  const d = itemDef(id);
  if (!d || d.rarity !== "broken") return "Only a broken piece can be mended.";
  const scrap = SCRAP_OF[d.family] ?? "scrap-iron";
  if (stock(s, scrap) < 2) return `Needs 2 ${itemDef(scrap)?.name.toLowerCase() ?? scrap} to mend.`;
  if (s.res.coin < REPAIR_COIN) return `Needs ${REPAIR_COIN} coin.`;
  if (stock(s, id) < 1) return "None in the forge's store.";
  const mended = `${d.family}-common-${d.id.split("-").pop()}`;
  take(s, id, 1);
  take(s, scrap, 2);
  s.res.coin -= REPAIR_COIN;
  store(s, mended, 1);
  log(s, `The forge mends the ${d.name.toLowerCase()}: a ${itemDef(mended)?.name.toLowerCase()}.`, "good");
  return null;
}

/** Sells one piece of loot or equipment at a market, for its worth. */
export function sellItem(s: GameState, id: string): Result {
  const d = itemDef(id);
  if (!d) return "Nothing to sell.";
  if (d.rarity === "singleton") return "A singular piece is not for sale.";
  if (!s.structures.some((m) => m.type === "market" && !m.buildUntil)) return "Build a market to sell to.";
  if (!take(s, id, 1)) return "None in the forge's store.";
  s.res.coin += d.value;
  log(s, `Sold a ${d.name.toLowerCase()} for ${d.value} coin.`, "info");
  return null;
}

// ── The forge's store ─────────────────────────────────────

/** Units of one item a slot holds. */
export const STACK = 20;
export const armorySlots = (forgeLevel: number) => (forgeLevel > 0 ? 4 + 2 * forgeLevel : 0);

export const forgeOf = (s: GameState): Structure | undefined =>
  s.structures.filter((st) => st.type === "forge" && !st.buildUntil).sort((a, b) => b.level - a.level)[0];

export function stash(s: GameState): { item: string; qty: number }[] {
  s.armory ??= [];
  return s.armory;
}

export const stock = (s: GameState, item: string) => stash(s).filter((x) => x.item === item).reduce((a, x) => a + x.qty, 0);

/** Puts items away, topping up existing stacks first. Returns what did not fit. */
export function store(s: GameState, item: string, qty: number): number {
  const left = storeInto(s, item, qty);
  if (left < qty) {
    const found = (stats(s).found ??= []);
    if (!found.includes(item)) found.push(item);
  }
  return left;
}

function storeInto(s: GameState, item: string, qty: number): number {
  const forge = forgeOf(s);
  if (!forge) return qty;
  const slots = armorySlots(forge.level);
  const a = stash(s);
  for (const x of a) {
    if (qty <= 0) break;
    if (x.item !== item || x.qty >= STACK) continue;
    const put = Math.min(qty, STACK - x.qty);
    x.qty += put;
    qty -= put;
  }
  while (qty > 0 && a.length < slots) {
    const put = Math.min(qty, STACK);
    a.push({ item, qty: put });
    qty -= put;
  }
  return qty;
}

export function take(s: GameState, item: string, qty: number): boolean {
  if (stock(s, item) < qty) return false;
  const a = stash(s);
  for (let i = a.length - 1; i >= 0 && qty > 0; i--) {
    if (a[i].item !== item) continue;
    const t = Math.min(qty, a[i].qty);
    a[i].qty -= t;
    qty -= t;
  }
  s.armory = a.filter((x) => x.qty > 0);
  return true;
}

// ── Gear ──────────────────────────────────────────────────

export type GearSlot = ItemSlot;

export interface GearDef {
  id: string;
  name: string;
  slot: GearSlot;
  /** Who can carry it. Armour fits any special troop. */
  roles: Role[];
  tier: 1 | 2 | 3;
  parts: Partial<Record<PartKey, number>>;
  cost: Cost;
  hours: number;
  /** Legendary pieces need a hero of this standing in town to make them. */
  crafter?: { role: "knight" | "wizard"; rank: number };
  blurb: string;
}

export const SPECIAL: Role[] = ["archer", "heavy", "wizard", "knight"];

const g = (d: GearDef) => d;
export const GEAR: Record<string, GearDef> = {
  // Tier 1: monster parts on plain metal.
  sword1: g({ id: "sword1", name: "Fang-edged sword", slot: "weapon", roles: ["knight"], tier: 1, parts: { fang: 3, bone: 2 }, cost: { ingots: 4 }, hours: 4, blurb: "A knight's first real blade." }),
  bow1: g({ id: "bow1", name: "Sinew bow", slot: "weapon", roles: ["archer"], tier: 1, parts: { hide: 3, bone: 2 }, cost: { planks: 4 }, hours: 4, blurb: "Hide-wrapped, bone-tipped." }),
  staff1: g({ id: "staff1", name: "Ichor staff", slot: "weapon", roles: ["wizard"], tier: 1, parts: { ichor: 3, bone: 2 }, cost: { planks: 2, silver: 2 }, hours: 4, blurb: "Venom set in the head: a focus." }),
  halberd1: g({ id: "halberd1", name: "Fang halberd", slot: "weapon", roles: ["heavy"], tier: 1, parts: { fang: 4, hide: 2 }, cost: { ingots: 5 }, hours: 5, blurb: "Long enough to keep a wolf off." }),
  hidecoat: g({ id: "hidecoat", name: "Hide coat", slot: "armour", roles: SPECIAL, tier: 1, parts: { hide: 5 }, cost: { coin: 20 }, hours: 3, blurb: "Stops a claw, mostly." }),
  // Tier 2: the rarer parts.
  sword2: g({ id: "sword2", name: "Scaleblade", slot: "weapon", roles: ["knight"], tier: 2, parts: { scale: 3, core: 1, fang: 2 }, cost: { ingots: 8, silver: 4 }, hours: 8, blurb: "Drake scale folded into the steel." }),
  bow2: g({ id: "bow2", name: "Wyrmsinew longbow", slot: "weapon", roles: ["archer"], tier: 2, parts: { scale: 2, hide: 4, ectoplasm: 1 }, cost: { planks: 6, silver: 3 }, hours: 8, blurb: "Its arrows find what flies." }),
  staff2: g({ id: "staff2", name: "Wraithglass staff", slot: "weapon", roles: ["wizard"], tier: 2, parts: { ectoplasm: 4, core: 1 }, cost: { silver: 6, gold: 1 }, hours: 8, blurb: "A spirit, caught and made to listen." }),
  halberd2: g({ id: "halberd2", name: "Coreforged halberd", slot: "weapon", roles: ["heavy"], tier: 2, parts: { core: 2, bone: 4 }, cost: { ingots: 10 }, hours: 9, blurb: "Heavier than it looks, and it looks heavy." }),
  bonemail: g({ id: "bonemail", name: "Bone mail", slot: "armour", roles: SPECIAL, tier: 2, parts: { bone: 4, scale: 2, hide: 2 }, cost: { ingots: 6 }, hours: 7, blurb: "Scale over bone over hide." }),
  // Tier 3: what only heroes can make.
  oathblade: g({ id: "oathblade", name: "Oathblade", slot: "weapon", roles: ["knight"], tier: 3, parts: { jewel: 2, scale: 4, core: 2 }, cost: { gold: 6, ingots: 12 }, hours: 16, crafter: { role: "knight", rank: 15 }, blurb: "Forged under a knight's oath. Only a paladin can make one." }),
  aegis: g({ id: "aegis", name: "Aegis plate", slot: "armour", roles: SPECIAL, tier: 3, parts: { jewel: 2, scale: 5, bone: 4 }, cost: { gold: 6, ingots: 14 }, hours: 18, crafter: { role: "knight", rank: 15 }, blurb: "A paladin's armour, made by one." }),
  hexstaff: g({ id: "hexstaff", name: "Hexstaff", slot: "weapon", roles: ["wizard"], tier: 3, parts: { jewel: 2, ectoplasm: 5, core: 2 }, cost: { gold: 4, mithril: 1 }, hours: 16, crafter: { role: "wizard", rank: 13 }, blurb: "Needs an archmage to bind the jewels." }),
  starweave: g({ id: "starweave", name: "Starweave robe", slot: "armour", roles: SPECIAL, tier: 3, parts: { jewel: 1, ectoplasm: 4, ichor: 4 }, cost: { silver: 10, gold: 2 }, hours: 14, crafter: { role: "wizard", rank: 13 }, blurb: "Woven by an archmage from what the wraiths leave." }),
  wyrmbow: g({ id: "wyrmbow", name: "Wyrmbone bow", slot: "weapon", roles: ["archer"], tier: 3, parts: { jewel: 2, scale: 4, bone: 3 }, cost: { gold: 4, planks: 10 }, hours: 16, crafter: { role: "knight", rank: 15 }, blurb: "A paladin's gift to the range." }),
  worldsplitter: g({ id: "worldsplitter", name: "Worldsplitter", slot: "weapon", roles: ["heavy"], tier: 3, parts: { jewel: 2, core: 4, bone: 4 }, cost: { gold: 5, ingots: 16 }, hours: 18, crafter: { role: "knight", rank: 15 }, blurb: "A paladin forged it; a giant might lift it." }),
};

/**
 * Which gear a troop carries, by what they fight with: on the soldier tree a
 * ranged title takes bows and an armoured one halberds.
 */
export function gearRole(v: Villager): Role {
  if (v.role !== "infantry" && v.role !== "archer" && v.role !== "heavy") return v.role;
  const t = soldierTitle(Math.max(1, v.rank));
  return t.ranged ? "archer" : v.rank >= 7 ? "heavy" : "infantry";
}

export const isSpecial = (v: Villager) => SPECIAL.includes(gearRole(v));
/** The piece worn in a slot, from the catalogue of eight hundred (./items). */
export const gearOf = (v: Villager, slot: GearSlot): ItemDef | undefined => (v.gear?.[slot] ? itemDef(v.gear[slot]!) : undefined);

/** How far a special troop can train on the weapon it carries. */
export const WEAPON_CAP = [8, 12, 18, Infinity] as const;
export function gearCap(v: Villager): number {
  if (!isSpecial(v)) return Infinity;
  return WEAPON_CAP[gearOf(v, "weapon")?.tier ?? 0];
}

export interface GearStats {
  /** Multipliers on damage, hit points and pace. */
  dmg: number;
  hp: number;
  speed: number;
  /** Share off the time between blows, at most half. */
  haste: number;
  /** Tiles of reach added. */
  range: number;
  /** The weapon's element, if it carries one. */
  element: Element | null;
}
/** Everything a troop's gear adds, slot by slot. */
export function gearStats(v: Villager): GearStats {
  let dmg = 1;
  let hp = 1;
  let speed = 1;
  let haste = 0;
  let range = 0;
  let element: Element | null = null;
  for (const slot of ITEM_SLOTS) {
    const d = gearOf(v, slot);
    if (!d) continue;
    dmg += d.dmg ?? 0;
    hp += d.hp ?? 0;
    speed += d.speed ?? 0;
    haste += d.haste ?? 0;
    range += d.range ?? 0;
    if (slot === "weapon" && d.element) element = d.element;
  }
  return { dmg, hp, speed, haste: Math.min(0.5, haste), range, element };
}

/** Damage and hit-point multipliers from carried gear. */
export function gearBonus(v: Villager): { dmg: number; hp: number } {
  const g = gearStats(v);
  return { dmg: g.dmg, hp: g.hp };
}

/** Every slot filled with sound gear (nothing broken): what a Master of Mythic Arts must wear. */
export const fullSet = (v: Villager) => ITEM_SLOTS.every((slot) => {
  const d = gearOf(v, slot);
  return !!d && d.rarity !== "broken";
});

/** A hero able to make a legendary piece, present in town. */
export function crafterFor(s: GameState, def: GearDef): Villager | undefined {
  if (!def.crafter) return undefined;
  return s.villagers.find((v) => v.role === def.crafter!.role && v.rank >= def.crafter!.rank && !isAway(s, v));
}

export function craftCheck(s: GameState, def: GearDef): string | null {
  const forge = forgeOf(s);
  if (!forge) return "Build a forge first.";
  if (def.tier > forge.level) return `Needs a level ${def.tier} forge.`;
  if (def.crafter && !crafterFor(s, def)) return `Needs a ${def.crafter.role} of level ${def.crafter.rank}+ in town to make it.`;
  for (const [p, n] of Object.entries(def.parts)) if (stock(s, p) < (n as number)) return `Needs ${n} ${PARTS[p as PartKey].name.toLowerCase()} (have ${stock(s, p)}).`;
  if (!canAfford(s.res, def.cost)) return `Needs ${costText(def.cost)}.`;
  return null;
}

export function startCraft(s: GameState, ctx: SimContext, itemId: string): Result {
  const def = GEAR[itemId];
  if (!def) return "Unknown piece.";
  const forge = forgeOf(s);
  if (forge?.craft) return "The anvil is busy.";
  const bad = craftCheck(s, def);
  if (bad) return bad;
  for (const [p, n] of Object.entries(def.parts)) take(s, p, n as number);
  pay(s.res, def.cost);
  thriftRefund(s, forge!, def.cost);
  // Its path (./paths): Steady or Mastery works the anvil faster.
  const haste = (1 - ctx.profile.streakHaste) / (1 + (forge!.level - 1) * 0.1) / (forge!.pr ?? 1);
  forge!.craft = { item: itemId, until: s.time + def.hours * 60 * haste };
  log(s, `The forge starts on a ${def.name.toLowerCase()}.`);
  return null;
}

/** Finished pieces go into the store; one that will not fit waits on the anvil. */
export function finishCrafts(s: GameState) {
  for (const f of s.structures) {
    if (f.type !== "forge" || !f.craft || f.craft.until > s.time) continue;
    if (store(s, f.craft.item, 1) > 0) continue;
    // The windfall path: now and then a second piece from the same heat.
    const twin = windfall(s, f, rng(Math.floor(f.craft.until) * 31 + f.id)) && store(s, f.craft.item, 1) === 0;
    if (twin) f.lucky = (f.lucky ?? 0) + 1;
    log(s, `The forge finishes a ${GEAR[f.craft.item]?.name.toLowerCase() ?? "piece"}${twin ? " — and a second from the same heat" : ""}.`, "good");
    f.craft = null;
  }
}

export function equip(s: GameState, villagerId: number, itemId: string): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  const def = itemDef(itemId);
  if (!v || !def || def.kind !== "equipment" || !def.slot) return "Nothing to equip.";
  if (!def.roles?.includes(gearRole(v))) return `A ${def.name.toLowerCase()} is not for a ${roleLabel(v.role, v.rank).replace(/ \d+$/, "").toLowerCase()}.`;
  if (!take(s, itemId, 1)) return "None in the forge.";
  const old = v.gear?.[def.slot];
  v.gear = { ...v.gear, [def.slot]: itemId };
  if (old && store(s, old, 1) > 0) log(s, `No room in the forge for the old ${itemDef(old)?.name.toLowerCase() ?? "piece"} — it is scrapped.`, "bad");
  return null;
}

export function unequip(s: GameState, villagerId: number, slot: GearSlot): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  const item = v?.gear?.[slot];
  if (!v || !item) return "Nothing to take off.";
  if (store(s, item, 1) > 0) return "No room in the forge's store.";
  v.gear = { ...v.gear, [slot]: undefined };
  return null;
}

// ── Heroes ────────────────────────────────────────────────

/** Away from town: on an emblem knight's sortie, or out scouting the fog. */
export const isAway = (s: GameState, v: Villager) => (!!v.deployedUntil && v.deployedUntil > s.time) || !!v.scout;

/** Real Domain levels steady every special troop's training: up to +25% on each roll. */
export const domainBonus = (ctx: SimContext) => Math.min(0.25, (ctx.input.domainPeak ?? 0) * 0.02 + (ctx.input.domainSum ?? 0) * 0.002);

/** Wizards level freely to here; every step past it is an ascension. */
export const ASCEND_FROM = 12;
/** The top of each ladder. */
export const MAX_KNIGHT = 150;
export const MAX_WIZARD = 500;
/** Study for the next level: steep early, then a slow climb so 500 stays reachable. */
export const xpToNext = (rank: number) => (rank <= 30 ? 10 * Math.max(1, rank) : 300 + 6 * (rank - 30));

/**
 * Odds a wizard survives the next step past 12. Falls with every level
 * climbed; stored experience beyond the threshold, an arcane formula and the
 * player's own Domain levels each raise it.
 */
export function ascensionOdds(v: Villager, ctx: SimContext, formula: boolean): number {
  const stored = Math.max(0, Math.min(1, v.xp / xpToNext(v.rank) - 1)) * 0.3;
  // Harder with every level, on a log scale: 38% bare at 13, around 15% at
  // 60, below nothing at 500 — where only every aid together gets you through.
  // Hero ascension is meant to be rare (power creep, ./heroes): 30% bare at 13, falling from there.
  const base = 0.32 - 0.25 * Math.log10(1 + (v.rank - ASCEND_FROM) / 5);
  // Insight and Lore (./attributes): a point either side of 8 is a point of odds each.
  const a = attrsOf(v);
  const p = base + stored + (formula ? 0.25 : 0) + domainBonus(ctx) + 0.01 * (a.ins - 8) + 0.01 * (a.lor - 8);
  return Math.max(0.05, Math.min(0.95, p));
}

/** How high a wizard can climb: 15 without an emblem; each rung of its depth opens 33 more, to 500. */
export const wizardCapFor = (depth: number) => Math.min(MAX_WIZARD, 15 + depth * 33);
export function ascensionCap(v: Villager): number {
  return v.rank >= 15 ? (v.emblem ? wizardCapFor(v.emblem.depth) : 15) : 15;
}

export function attemptAscension(s: GameState, ctx: SimContext, villagerId: number, formula: boolean): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || v.role !== "wizard") return "Only a wizard can ascend.";
  if (v.rank < ASCEND_FROM) return `Wizards level on their own until ${ASCEND_FROM}.`;
  if (v.xp < xpToNext(v.rank)) return `Not ready — ${Math.floor(v.xp)}/${xpToNext(v.rank)} experience.`;
  if (v.rank >= MAX_WIZARD) return "At the peak of the art.";
  if (v.rank >= ascensionCap(v)) return v.rank >= 15 ? "Bind a deeper emblem to climb further." : "At the peak.";
  if (v.rank + 1 > gearCap(v)) return "Needs a better staff to hold the power.";
  if (formula && s.res.formula < 1) return "No arcane formula in store.";
  const p = ascensionOdds(v, ctx, formula);
  if (formula) s.res.formula -= 1;
  const r = rng(Math.floor(s.time * 13) + v.id * 7919);
  if (r() < p) {
    v.rank += 1;
    v.xp = 0;
    const grew = growOnRise(v, Math.floor(s.time));
    log(s, (v.rank === 15 ? `${v.name} ascends and becomes a Grand Wizard` : `${v.name} ascends to Wizard ${v.rank}`) + (grew ? ` (+1 ${ATTR_NAME[grew]}).` : "."), "good");
    return null;
  }
  // The power slips its bounds. A champion is not consumed by it: they turn to stone.
  if (v.champion) {
    petrify(s, v, "reaches too far in the ascension");
    return `${v.name} did not hold the power (${Math.round(p * 100)}% odds): stone, until restored.`;
  }
  const hut = byId(s, v.work);
  if (hut) hut.hp = Math.max(1, hut.hp - hut.hp * 0.5);
  if (hut) hut.workers = hut.workers.filter((id) => id !== v.id);
  s.villagers = s.villagers.filter((x) => x.id !== v.id);
  s.deaths += 1;
  onDeath(s, "consumed by the ascension");
  s.mood = Math.max(0, s.mood - 4);
  log(s, `${v.name} reaches too far. The ascension fails, and the wizard is consumed${hut ? " — the hut is scorched" : ""}.`, "bad");
  return `${v.name} did not survive the ascension (${Math.round(p * 100)}% odds).`;
}

/** Sorties: emblem-bearing knights ride out for half a day. */
export const SORTIE_HOURS = 12;
export const canDeploy = (v: Villager) => v.role === "knight" && v.rank >= 22 && !!v.emblem;

export function deploy(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || !canDeploy(v)) return "Only a knight of 22+ bearing an emblem can ride out.";
  if (isAway(s, v)) return "Already out.";
  if (s.raid?.phase === "fighting") return "Not while the town is under attack.";
  if (v.health < 40) return "Too wounded to ride.";
  v.deployedUntil = s.time + SORTIE_HOURS * 60;
  log(s, `${v.name} rides out to gather a battalion.`);
  return null;
}

/** A returning knight brings followers, sometimes a jewel, and some wounds. */
export function returnFromSortie(s: GameState, v: Villager) {
  const r = rng(Math.floor(s.time) * 17 + v.id);
  const sworn = 1 + Math.floor(v.rank / 12) + (r() < 0.4 ? 1 : 0);
  v.battalion = (v.battalion ?? 0) + sworn;
  v.health = Math.max(20, v.health - Math.floor(r() * 25));
  v.deployedUntil = undefined;
  const jewelOdds = Math.min(0.9, 0.35 + (v.battalion ?? 0) * 0.03);
  const found: string[] = [`${sworn} sworn to the battalion`];
  if (r() < jewelOdds) {
    const lost = store(s, "jewel", 1);
    found.push(lost ? "a monster jewel, left behind — no room in the forge" : "a monster jewel");
  }
  const part = (["hide", "fang", "bone", "scale"] as PartKey[])[Math.floor(r() * 4)];
  const n = 2 + Math.floor(r() * 3);
  if (store(s, part, n) < n) found.push(`${PARTS[part].name.toLowerCase()}`);
  log(s, `${v.name} returns: ${found.join(", ")}.`, "good");
}

/**
 * What an emblem knight needs to take the next step: a battalion that grows
 * with every rank (it is kept, not spent), a jewel or more per step, and an
 * emblem one rung deeper every nine ranks — depth 15 reaches 150.
 */
export function advanceRequirement(v: Villager) {
  const step = v.rank + 1 - 22;
  // Every step asks more than the last (power creep, ./heroes): four sworn a step, a jewel more every ten.
  return { battalion: 4 * step, jewels: 1 + Math.floor(step / 10), depth: Math.min(15, Math.ceil(step / 9)) };
}
/** How high a knight can advance on an emblem of this depth. */
export const knightCapFor = (depth: number) => Math.min(MAX_KNIGHT, 22 + depth * 9);

export function advanceKnight(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || v.role !== "knight" || v.rank < 22) return "Only a knight of 22+ can advance this way.";
  if (isAway(s, v)) return "Out on a sortie.";
  if (v.rank >= MAX_KNIGHT) return "At the height of knighthood.";
  const req = advanceRequirement(v);
  if (!v.emblem) return "Bind an emblem first — a real skill of yours.";
  if (v.emblem.depth < req.depth) return `The emblem must be depth ${req.depth}+ (it is ${v.emblem.depth}).`;
  if ((v.battalion ?? 0) < req.battalion) return `Needs a battalion of ${req.battalion} (has ${v.battalion ?? 0}) — ride out on sorties.`;
  if (v.rank + 1 > gearCap(v)) return "Needs a better blade.";
  if (!take(s, "jewel", req.jewels)) return `Needs ${req.jewels} monster jewel(s) in the forge.`;
  v.rank += 1;
  v.xp = 0;
  const grew = growOnRise(v, Math.floor(s.time));
  log(s, (v.rank === 23 ? `${v.name} is raised to Emblem Knight` : `${v.name} advances to Emblem Knight ${v.rank}`) + (grew ? ` (+1 ${ATTR_NAME[grew]}).` : "."), "good");
  return null;
}
