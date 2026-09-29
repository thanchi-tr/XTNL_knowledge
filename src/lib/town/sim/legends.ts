import { CATALOG, LADDERS, roleLabel, type Cost } from "./catalog";
import { clock, log } from "./state";
import { canAfford, costText, pay } from "./world";
import type { GameState, Role, StructureType, Villager } from "./types";

/**
 * Legendary callings: the three the town can raise above the top of a
 * trade's ladder. Each is one person, one of a kind in the town, and each
 * changes how the whole town lives. The way in is meant to be hard to reach:
 * the top rank of the trade, a workplace raised to level 25, a hall of 30,
 * a town of 60 that has stood 40 days, a sound body and mind, and a price in
 * the rarest things the land gives.
 *
 *   Grand Steward   from a 5★ Chef     every kitchen cooks half again; food
 *                                      in store rots 40% slower
 *   Earthshaper     from Geologist 10  every mine digs half again; digging
 *                                      and filling go three times as fast
 *   Verdant Sage    from a Biologist   every field yields 40% more, and no
 *                                      field's soil tires
 */

export type Legend = "steward" | "earthshaper" | "sage";

export interface LegendDef {
  id: Legend;
  name: string;
  /** The trade it rises from, and the top rank of that trade. */
  role: Role;
  rank: number;
  /** Where the candidate must be working, and how high that building must stand. */
  at: StructureType;
  atLevel: number;
  cost: Cost;
  blurb: string;
  effect: string;
}

const top = (role: Role) => (LADDERS[role]?.length ?? 1) - 1;

export const LEGENDS: Record<Legend, LegendDef> = {
  steward: {
    id: "steward", name: "Grand Steward", role: "chef", rank: top("chef"), at: "kitchen", atLevel: 25,
    cost: { gold: 20, diamond: 5 },
    blurb: "A cook become keeper of the whole town's table.",
    effect: "Every kitchen cooks half again as much, and food in store rots 40% slower.",
  },
  earthshaper: {
    id: "earthshaper", name: "Earthshaper", role: "geologist", rank: top("geologist"), at: "mine", atLevel: 25,
    cost: { mithril: 10, diamond: 5 },
    blurb: "A geologist who reads the rock like a page.",
    effect: "Every mine digs half again as much; channels are dug and water filled three times as fast.",
  },
  sage: {
    id: "sage", name: "Verdant Sage", role: "farmhand", rank: top("farmhand"), at: "farm", atLevel: 25,
    cost: { platinum: 10, diamond: 5 },
    blurb: "A biologist the fields answer to.",
    effect: "Every field yields 40% more, and no field's soil ever tires.",
  },
};

export const LEGEND_TOWN = { hall: 30, pop: 60, day: 40, health: 80, mind: 70 } as const;

/** A villager's title: their legendary calling if they have one, else their rank in the trade. */
export const titleOf = (v: Villager) =>
  v.champion === "king" ? `King · ${roleLabel(v.role, v.rank)}` : v.champion === "master" ? `Master of Mythic Arts · ${v.rank}` : v.legend ? LEGENDS[v.legend].name : roleLabel(v.role, v.rank);

/** The living holder of a calling, if the town has one. */
export const legendOf = (s: GameState, l: Legend): Villager | undefined => s.villagers.find((v) => v.legend === l);
export const hasLegend = (s: GameState, l: Legend) => !!legendOf(s, l);

/** Who stands nearest the calling: the best-placed villager of the trade. */
export function candidateFor(s: GameState, l: Legend): Villager | undefined {
  const def = LEGENDS[l];
  return s.villagers
    .filter((v) => v.role === def.role && !v.legend)
    .sort((a, b) => b.rank - a.rank || (b.health + b.happy) - (a.health + a.happy))[0];
}

/** Every requirement for raising `v` to the calling, met or not. */
export function legendChecks(s: GameState, l: Legend, v: Villager | undefined): { ok: boolean; label: string }[] {
  const def = LEGENDS[l];
  const hall = s.structures.find((x) => x.type === "townhall");
  const work = v?.work != null ? s.structures.find((x) => x.id === v.work) : undefined;
  const day = clock(s.time).day;
  return [
    { ok: !hasLegend(s, l), label: `No ${def.name} in the town already` },
    { ok: !!v && v.rank >= def.rank, label: `A ${roleLabel(def.role, def.rank)} — the top of the trade${v ? ` (best: ${roleLabel(v.role, v.rank)})` : ""}` },
    { ok: !!work && work.type === def.at && work.level >= def.atLevel && !work.buildUntil, label: `Working at a ${CATALOG[def.at].name.toLowerCase()} of level ${def.atLevel}${work?.type === def.at ? ` (it is ${work.level})` : ""}` },
    { ok: (hall?.level ?? 0) >= LEGEND_TOWN.hall, label: `A town hall of level ${LEGEND_TOWN.hall} (it is ${hall?.level ?? 0})` },
    { ok: s.villagers.length >= LEGEND_TOWN.pop, label: `A town of ${LEGEND_TOWN.pop} (it has ${s.villagers.length})` },
    { ok: day >= LEGEND_TOWN.day, label: `The town has stood ${LEGEND_TOWN.day} days (day ${day})` },
    { ok: !!v && v.health >= LEGEND_TOWN.health && v.happy >= LEGEND_TOWN.mind, label: `Sound in body (${LEGEND_TOWN.health}+) and mind (${LEGEND_TOWN.mind}+)` },
    { ok: canAfford(s.res, def.cost), label: costText(def.cost) },
  ];
}

/** Raises a villager to a legendary calling, if every requirement is met. */
export function ascendLegend(s: GameState, l: Legend, villagerId: number): string | null {
  const v = s.villagers.find((x) => x.id === villagerId);
  const miss = legendChecks(s, l, v).find((c) => !c.ok);
  if (miss) return `Not yet: ${miss.label}.`;
  pay(s.res, LEGENDS[l].cost);
  v!.legend = l;
  log(s, `${v!.name} becomes the ${LEGENDS[l].name}. ${LEGENDS[l].effect}`, "good");
  return null;
}

/** The multipliers the callings put on the town, 1 where the calling is empty. */
export function legendMods(s: GameState) {
  return {
    kitchen: hasLegend(s, "steward") ? 1.5 : 1,
    rot: hasLegend(s, "steward") ? 0.6 : 1,
    mine: hasLegend(s, "earthshaper") ? 1.5 : 1,
    earthworks: hasLegend(s, "earthshaper") ? 3 : 1,
    farm: hasLegend(s, "sage") ? 1.4 : 1,
    soilKeeps: hasLegend(s, "sage"),
  };
}
