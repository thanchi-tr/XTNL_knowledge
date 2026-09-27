import { byId, clock, log } from "./state";
import { killBody } from "./body";
import type { GameState, Structure, StructureType, Villager } from "./types";

/**
 * A day's strength.
 *
 * Every piece of work is one of four kinds — no effort, easy, medium, hard —
 * worth 0, 1, 2 or 4 points. A level-1 worker has 2 points a day: two easy
 * tasks, or one medium one. Each level of the trade adds another point. A
 * night slept in the cold, or a belly running empty, halves it.
 *
 * A worker who has spent the day's strength stops. The town can order a
 * building's workers into overtime, and then they go on — but the next dawn
 * each of them pays for it: health lost in proportion to how far past their
 * strength they went, and a chance, growing with it, that they do not get
 * up again.
 *
 * Where the points go:
 *   a job      its kind's points over a full shift, hour by hour worked
 *   clearing   by what is cleared: a wild crop or sapling easy, a grown tree,
 *              rubble or a cut of peat medium, breaking rock hard — shared
 *              among the idle hands who did it
 *   earthworks hard, hour by hour
 */

export type Effort = "none" | "easy" | "medium" | "hard";
export const EFFORT_POINTS: Record<Effort, number> = { none: 0, easy: 1, medium: 2, hard: 4 };
export const EFFORT_LABEL: Record<Effort, string> = { none: "No effort", easy: "Easy", medium: "Medium", hard: "Hard" };

/** What a day's shift at each workplace takes out of a worker. */
export const JOB_EFFORT: Partial<Record<StructureType, Effort>> = {
  market: "easy", fishery: "easy", school: "easy", kitchen: "easy", armypoint: "easy", museum: "easy",
  farm: "medium", waterfarm: "medium", watermill: "medium", refinery: "medium", laboratory: "medium", icefactory: "medium",
  mine: "hard", lumbercamp: "hard", forge: "hard",
};
export const jobEffort = (type: StructureType): Effort => JOB_EFFORT[type] ?? "none";

/** A worker's level in their trade, for strength: rank 0 and 1 are both level 1. */
export const workLevel = (v: Villager) => Math.max(1, v.rank);

/** Why a worker is at half strength today, if they are. */
export function weakness(v: Villager): { cold: boolean; hungry: boolean } {
  return { cold: !!v.coldNight, hungry: (v.body?.Eg ?? 2000) < 400 };
}

/** Effort points a worker has for the day. */
export function capacity(v: Villager): number {
  const w = weakness(v);
  return (1 + workLevel(v)) * (w.cold || w.hungry ? 0.5 : 1);
}

export const spent = (v: Villager) => v.effort ?? 0;
export const spend = (v: Villager, points: number) => {
  v.effort = (v.effort ?? 0) + points;
};

/** The level a worker needs to lead the night shift. */
export const NIGHT_SHIFT_LEVEL = 5;

/** Whether the town builds through the night: a level-5 worker leads the night shift. */
export function hasNightShift(s: GameState): boolean {
  return s.villagers.some((v) => v.nightShift && workLevel(v) >= NIGHT_SHIFT_LEVEL);
}

/** Whether a building's workers are being driven past their strength. */
export const overtime = (st: Structure | undefined) => !!st?.overtime;

/** Whether a worker still works this hour: strength left, or ordered on. */
export function canWork(v: Villager, st?: Structure): boolean {
  return spent(v) < capacity(v) || overtime(st);
}

/**
 * The hour. Through the night, anyone whose home is cold (under 10 °C) or
 * who has none is marked as having slept cold. Dusk clears the mark for the
 * night ahead.
 */
export function workHourly(s: GameState) {
  const c = clock(s.time);
  if (c.hour === 21) for (const v of s.villagers) v.coldNight = false;
  if (c.hour >= 22 || c.hour < 5) {
    for (const v of s.villagers) {
      const home = byId(s, v.house);
      if (!home || (home.zone && home.zone.T < 10)) v.coldNight = true;
    }
  }
}

/**
 * Dawn: the day's work is settled. Anyone who went past their strength pays:
 * health, and a chance of death, both growing with how far past. Then
 * everyone starts the new day with their strength whole.
 */
export function workDawn(s: GameState, r: () => number) {
  for (const v of [...s.villagers]) {
    const cap = capacity(v);
    const over = cap > 0 ? spent(v) / cap - 1 : 0;
    if (over > 0.05) {
      v.health = Math.max(1, v.health - 25 * over);
      if (r() < Math.min(0.3, 0.06 * over)) {
        killBody(s, v, `worked past their strength and did not get up (${Math.round(spent(v))} of ${Math.round(cap)} effort)`);
        continue;
      }
      if (over >= 0.5) log(s, `${v.name} was driven to ${Math.round((1 + over) * 100)}% of their strength yesterday and wakes broken-down.`, "bad");
    }
    v.effort = 0;
  }
}
