import { rng } from "./world";
import type { Role, StructureType, Villager } from "./types";

/**
 * Every villager's attributes: twelve, in three groups, 1 to 20 (a commoner
 * sits about 8). They are the person, not the post: they stay with them
 * through every job, every promotion and every ladder, and they grow a
 * little as the person rises in what they do.
 *
 *   Labour   Strength   fields, forest, mine, earthworks
 *            Dexterity  kitchen, refinery, forge, fishing, the market
 *            Endurance  a longer, harder day before strength runs out
 *            Wits       learning: a worker's experience, a lesson's pace
 *   War      Might      the weight of a blow
 *            Agility    how fast the blows come, and a bow's aim
 *            Vitality   hit points
 *            Valor      holding firm under the dark's terror
 *   Arcane   Arcana     a spell's power
 *            Spirit     wards and healing
 *            Insight    a spell's reach, and the odds of an ascension
 *            Lore       a wizard's study
 *
 * Each point above or below 8 is worth 3% in what it governs (attrMul): a
 * 20 is a third better at it than a commoner, a 4 an eighth worse.
 *
 * Who arrives with what is rolled when they arrive — and a town with a name
 * for looking after its people draws more of the gifted (./recognition).
 */

export type AttrKey = "str" | "dex" | "end" | "wit" | "mig" | "agi" | "vit" | "val" | "arc" | "spi" | "ins" | "lor";
export type Attrs = Record<AttrKey, number>;
export type AttrGroup = "labour" | "war" | "arcane";

export const GROUPS: Record<AttrGroup, AttrKey[]> = {
  labour: ["str", "dex", "end", "wit"],
  war: ["mig", "agi", "vit", "val"],
  arcane: ["arc", "spi", "ins", "lor"],
};
export const GROUP_NAME: Record<AttrGroup, string> = { labour: "Labour", war: "War", arcane: "Arcane" };
export const ALL_ATTRS: AttrKey[] = [...GROUPS.labour, ...GROUPS.war, ...GROUPS.arcane];

export const ATTR_NAME: Record<AttrKey, string> = {
  str: "Strength", dex: "Dexterity", end: "Endurance", wit: "Wits",
  mig: "Might", agi: "Agility", vit: "Vitality", val: "Valor",
  arc: "Arcana", spi: "Spirit", ins: "Insight", lor: "Lore",
};
export const ATTR_SHORT: Record<AttrKey, string> = {
  str: "Str", dex: "Dex", end: "End", wit: "Wit", mig: "Mgt", agi: "Agi", vit: "Vit", val: "Val", arc: "Arc", spi: "Spi", ins: "Ins", lor: "Lor",
};
export const ATTR_BLURB: Record<AttrKey, string> = {
  str: "fields, forest, mine and earthworks", dex: "kitchen, refinery, forge, fishing and the market", end: "a longer day before strength runs out",
  wit: "a worker's learning and a lesson's pace", mig: "the weight of a blow", agi: "how fast blows come, and a bow's aim", vit: "hit points",
  val: "holding firm under the dark's terror", arc: "a spell's power", spi: "wards and healing", ins: "a spell's reach and an ascension's odds", lor: "a wizard's study",
};

export const ATTR_MIN = 1;
export const ATTR_MAX = 20;
/** What an attribute is worth in what it governs: 3% a point either side of 8. */
export const attrMul = (a: number) => 1 + 0.03 * (a - 8);

const clampA = (a: number) => Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(a)));

/** A commoner's roll: about 8, most between 5 and 11. */
function commoner(r: () => number): Attrs {
  const out = {} as Attrs;
  for (const k of ALL_ATTRS) {
    // Three draws averaged: a hump round 8, rarely below 4 or above 12.
    const g = (r() + r() + r()) / 3;
    out[k] = clampA(3 + g * 10);
  }
  return out;
}

export type Gift = "gifted" | "prodigy";
export const GIFT_NAME: Record<Gift, string> = { gifted: "Gifted", prodigy: "Prodigy" };

/**
 * A newcomer's attributes: a commoner's, or — with the odds the town's
 * name buys (./recognition talentOdds) — a gifted one (two of a calling's
 * attributes raised to 14–17) or a prodigy (three raised, one to 18–20).
 */
export function rollAttrs(r: () => number, odds: { gifted: number; prodigy: number }): { attrs: Attrs; gift?: Gift; calling?: AttrGroup } {
  const attrs = commoner(r);
  const roll = r();
  const gift: Gift | undefined = roll < odds.prodigy ? "prodigy" : roll < odds.prodigy + odds.gifted ? "gifted" : undefined;
  if (!gift) return { attrs };
  const calling = (["labour", "war", "arcane"] as AttrGroup[])[Math.floor(r() * 3)];
  const keys = [...GROUPS[calling]].sort(() => r() - 0.5);
  const n = gift === "prodigy" ? 3 : 2;
  keys.slice(0, n).forEach((k, i) => {
    attrs[k] = clampA(gift === "prodigy" && i === 0 ? 18 + r() * 2.99 : 14 + r() * 3.99);
  });
  return { attrs, gift, calling };
}

/** A villager's attributes, rolled once (from their id) for anyone who came before attributes did. */
export function attrsOf(v: Villager): Attrs {
  if (!v.attrs) v.attrs = commoner(rng(v.id * 104729 + 7));
  return v.attrs;
}

export const attr = (v: Villager, k: AttrKey) => attrsOf(v)[k];

/** The attribute a job leans on, by the building it is done in. */
export const JOB_ATTR: Partial<Record<StructureType, AttrKey>> = {
  farm: "str", waterfarm: "str", lumbercamp: "str", mine: "str", icefactory: "str",
  kitchen: "dex", refinery: "dex", forge: "dex", fishery: "dex", market: "dex",
  school: "wit", laboratory: "wit", observatory: "wit", alchemy: "wit", mythiclab: "wit", museum: "wit",
};

/** How a worker's attributes serve the job they are at: its leaning attribute, and endurance a little. */
export function workMul(v: Villager, job?: StructureType): number {
  const a = attrsOf(v);
  const key = job ? JOB_ATTR[job] : undefined;
  const main = key ? attrMul(a[key]) : (attrMul(a.str) + attrMul(a.dex)) / 2;
  return main * (1 + 0.01 * (a.end - 8));
}

/** A troop's attributes in the fight: blows, speed, hit points, and firmness against terror (0–1). */
export function warMods(v: Villager): { dmg: number; haste: number; hp: number; valor: number; arcane: boolean } {
  const a = attrsOf(v);
  const arcane = v.role === "wizard";
  const ranged = v.role === "archer";
  const dmg = arcane ? attrMul(a.arc) : ranged ? (attrMul(a.agi) + attrMul(a.mig)) / 2 : attrMul(a.mig);
  const haste = 1 / (1 + 0.015 * (a.agi - 8));
  const hp = attrMul(a.vit);
  const valor = Math.max(0, Math.min(1, (a.val - 8) / 12));
  return { dmg, haste, hp, valor, arcane };
}

/** The attributes a rise in each calling trains: one of these may grow by a point at each promotion. */
export const RISE_ATTR: Partial<Record<Role, AttrKey[]>> = {
  farmhand: ["str", "end"], lumberjack: ["str", "end"], miner: ["str", "end"], icer: ["str", "end"],
  chef: ["dex", "wit"], refiner: ["dex", "wit"], fisher: ["dex", "end"], trader: ["dex", "wit"],
  scientist: ["wit", "ins"], biologist: ["wit", "str"], geologist: ["wit", "str"], artist: ["dex", "wit"], commander: ["val", "wit"],
  infantry: ["mig", "vit", "val"], heavy: ["vit", "mig", "val"], archer: ["agi", "mig"], knight: ["mig", "vit", "val"],
  wizard: ["arc", "lor", "ins", "spi"],
};

/**
 * A promotion: three times in five, one of the calling's attributes grows by
 * a point (to 20 at most) — the weakest of them first, so a person rounds
 * out as they rise. Returns the attribute that grew, if any.
 */
export function growOnRise(v: Villager, seed: number): AttrKey | null {
  const keys = RISE_ATTR[v.role];
  if (!keys) return null;
  const r = rng(seed * 7919 + v.id * 31 + v.rank);
  if (r() >= 0.6) return null;
  const a = attrsOf(v);
  const k = [...keys].sort((x, y) => a[x] - a[y])[0];
  if (a[k] >= ATTR_MAX) return null;
  a[k] += 1;
  return k;
}

/** A villager's three strongest attributes, for a line in a list. */
export function bestAttrs(v: Villager, n = 3): { k: AttrKey; a: number }[] {
  const a = attrsOf(v);
  return ALL_ATTRS.map((k) => ({ k, a: a[k] })).sort((x, y) => y.a - x.a).slice(0, n);
}

/** A villager's standing among the gifted, for their name in a list: a prodigy, gifted, or nothing. */
export function giftOf(v: Villager): Gift | null {
  return v.gift ?? null;
}

