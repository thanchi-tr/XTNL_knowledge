import { CATALOG, type Cost } from "./catalog";
import { log } from "./state";
import { canAfford, costText, pay } from "./world";
import { stats } from "./stats";
import { MILITARY, type GameState, type Villager } from "./types";

/**
 * Rest and wonder. A town that only works and fights breaks; these are the
 * two ways to mend it on purpose.
 *
 *   The museum   a villager spends three hours among the town's paintings
 *                and carvings: back steadier (sanity +12, and 3 more a
 *                museum level), and the town takes a little heart. Needs an
 *                artist at work there.
 *   A journey    a villager goes travelling for a day, on 12 coin and 6
 *                meals: back with far more (sanity +30), and with stories
 *                that lift the whole town.
 *
 * Neither works while away. Food does its part too: every fine dish the
 * kitchens serve lifts the town's hope a little, hour by hour.
 */

export const MUSEUM_HOURS = 3;
export const TRAVEL_HOURS = 24;
export const TRAVEL_COST: Cost = { coin: 12, meals: 6 };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** The museum a visit can go to: one with an artist at work in it, the highest first. */
export function openMuseum(s: GameState) {
  return s.structures
    .filter((m) => m.type === "museum" && !m.buildUntil && m.workers.some((id) => s.villagers.find((v) => v.id === id)?.role === "artist"))
    .sort((a, b) => b.level - a.level)[0];
}

export const isAway = (s: GameState, v: Villager) => !!v.awayUntil && v.awayUntil > s.time;

/** Who could go: anyone not already away, not on a sortie, not a troop on guard. */
export const couldGo = (s: GameState) =>
  s.villagers.filter((v) => !isAway(s, v) && !v.deployedUntil && !v.scout && !(MILITARY.includes(v.role) && v.guard) && v.health > 20);

export function sendToMuseum(s: GameState, villagerId: number): string | null {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  const m = openMuseum(s);
  if (!m) return "There is no museum with an artist at work in it.";
  if (isAway(s, v)) return `${v.name} is already away.`;
  v.awayUntil = s.time + MUSEUM_HOURS * 60;
  v.awayFor = "museum";
  log(s, `${v.name} spends the afternoon at the ${CATALOG.museum.name.toLowerCase()}.`, "info");
  return null;
}

export function sendTravelling(s: GameState, villagerId: number): string | null {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  if (isAway(s, v)) return `${v.name} is already away.`;
  if (!canAfford(s.res, TRAVEL_COST)) return `A journey needs ${costText(TRAVEL_COST)}.`;
  pay(s.res, TRAVEL_COST);
  v.awayUntil = s.time + TRAVEL_HOURS * 60;
  v.awayFor = "travel";
  log(s, `${v.name} sets out on a journey, back tomorrow.`, "info");
  return null;
}

/** The hour: whoever is due back comes home, and what they bring with them. */
export function leisureHourly(s: GameState) {
  for (const v of s.villagers) {
    if (!v.awayUntil || v.awayUntil > s.time) continue;
    const kind = v.awayFor;
    v.awayUntil = undefined;
    v.awayFor = undefined;
    if (kind === "museum") {
      const lvl = Math.max(1, ...s.structures.filter((m) => m.type === "museum").map((m) => m.level));
      v.happy = clamp(v.happy + 12 + 3 * lvl);
      s.hopeEvents = (s.hopeEvents ?? 0) + 0.5;
      stats(s).museum += 1;
    } else if (kind === "travel") {
      v.happy = clamp(v.happy + 30);
      s.hopeEvents = (s.hopeEvents ?? 0) + 1.5;
      stats(s).travels += 1;
      log(s, `${v.name} is back from their journey, full of stories.`, "good");
    }
  }
}
