import { WORK_GATES, knowledgeFor, tellGate, workCapOf } from "./mastery";
import { attrMul, attrsOf } from "./attributes";
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
export const workLevel = (v: Villager) => Math.max(1, v.level ?? 0, v.rank);

/** The most a worker's level climbs. */
export const WORK_MAX = 30;
/** Hours at work from one work level to the next: a day and a half at first, steeper after. */
export const workXpToNext = (level: number) => Math.round(12 * Math.pow(Math.max(1, level), 1.4));

/**
 * An hour at work: every worker, whatever the titles of their trade, grows
 * more able with the hours — moving buildings, leading the night shift and
 * going on excursions all wait on it. Hard work teaches faster than easy.
 */
export function gainWork(s: GameState, v: Villager, hours: number) {
  if (MILITARY_ROLES.includes(v.role)) return;
  v.level ??= Math.max(1, v.rank);
  if (v.level >= WORK_MAX) return;
  // A trade teaches only so far without a master's emblem (./mastery): experience keeps, the level waits.
  const cap = workCapOf(s, v, WORK_MAX);
  v.wxp = Math.min((v.wxp ?? 0) + hours * attrMul(attrsOf(v).wit), v.level >= cap ? workXpToNext(v.level) : Infinity);
  if (v.level >= cap && v.wxp >= workXpToNext(v.level)) tellGate(s, v, "worker's trade", knowledgeFor(s, v), WORK_GATES.find((g) => g.from === cap)?.depth ?? 3);
  while (v.level < cap && v.wxp >= workXpToNext(v.level)) {
    v.wxp -= workXpToNext(v.level);
    v.level += 1;
    if (v.level === 5 || v.level === 10 || v.level % 10 === 0) log(s, `${v.name} is a level-${v.level} worker now${v.level === 10 ? ": they can move buildings and go on excursions into the fog" : v.level === 5 ? ": they could lead a night shift" : ""}.`, "good");
  }
}
const MILITARY_ROLES = ["infantry", "archer", "heavy", "wizard", "knight"];

/** Why a worker is at half strength today, if they are. */
export function weakness(v: Villager): { cold: boolean; hungry: boolean } {
  return { cold: !!v.coldNight, hungry: (v.body?.Eg ?? 2000) < 400 };
}

/** Effort points a worker has for the day. */
export function capacity(v: Villager): number {
  const w = weakness(v);
  // Endurance: a point either side of 8 is 4% more (or less) strength to spend in a day.
  return (1 + workLevel(v)) * (w.cold || w.hungry ? 0.5 : 1) * (1 + 0.04 * (attrsOf(v).end - 8));
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
