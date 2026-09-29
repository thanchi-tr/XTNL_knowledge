import { clock, log } from "./state";
import { needsOf, needsState, tierOf as needTier } from "./needs";
import { noteDeath } from "./runlog";
import type { GameState } from "./types";

/**
 * Recognition: the town's name, among those who might come to live in it.
 *
 * Good stewardship earns it, a little every dawn — a complete cycle with no
 * one lost, full bellies, warm homes, a fair working day, a bed for everyone,
 * a town that is well and at peace — and good deeds add to it: a raid broken,
 * a legend slain, a feast, a hero raised. Loss spends it: every death, and
 * more when many die in a day; most of all the deaths a town lets happen —
 * of hunger, cold and thirst — and murder, flight, the hall falling.
 *
 * What it buys is who comes: the higher the town's name, the likelier a
 * newcomer arrives gifted — two attributes of a calling raised — or a
 * prodigy, three of them and one near the height (./attributes rollAttrs).
 */

export interface Entry {
  why: string;
  n: number;
}

export interface Recognition {
  points: number;
  /** Today's entries (since dawn), and yesterday's, newest first. */
  today: Entry[];
  yesterday: Entry[];
  /** Deaths since dawn: each one costs more than the last. */
  deathsToday: number;
}

export const REC_START = 50;
export const REC_MAX = 1000;

export const TIERS = [
  { from: 0, name: "Unknown" },
  { from: 100, name: "Noted" },
  { from: 250, name: "Respected" },
  { from: 500, name: "Renowned" },
  { from: 800, name: "Legendary" },
] as const;

export function recognitionOf(s: GameState): Recognition {
  return (s.recognition ??= { points: REC_START, today: [], yesterday: [], deathsToday: 0 });
}

export const tierFor = (points: number) => [...TIERS].reverse().find((t) => points >= t.from)!;
export const nextTier = (points: number) => TIERS.find((t) => t.from > points) ?? null;

/** Adds (or takes) recognition for a reason, and notes it on today's list. */
export function recognize(s: GameState, n: number, why: string) {
  if (!n) return;
  const r = recognitionOf(s);
  const before = r.points;
  r.points = Math.max(0, Math.min(REC_MAX, r.points + n));
  const same = r.today.find((e) => e.why === why);
  if (same) same.n += n;
  else r.today.unshift({ why, n });
  if (r.today.length > 12) r.today.pop();
  const was = tierFor(before);
  const now = tierFor(r.points);
  if (now.from > was.from) log(s, `The town is ${now.name.toLowerCase()} now: word of it travels, and the gifted come more often.`, "good");
  else if (now.from < was.from) log(s, `The town's name falls to ${now.name.toLowerCase()}.`, "bad");
}

/** The odds a newcomer arrives gifted, or a prodigy: rising with the town's name, and flattening. */
export function talentOdds(points: number): { gifted: number; prodigy: number } {
  return {
    gifted: 0.05 + 0.45 * (1 - Math.exp(-points / 250)),
    prodigy: 0.01 + 0.14 * (1 - Math.exp(-points / 600)),
  };
}

/** Deaths the town let happen: hunger, cold, thirst, fumes, sickness, a body worked to death — neglect, not the land. */
const NEGLECT = /thirst|wasted|hunger|starv|froze|frozen|cold|fumes|pneumonia|dysentery|poison|scurvy|worked past/i;
/** Deaths in the town's defence: the ledger names them apart. */
const BATTLE = /defending|at the gate|injur/i;

/**
 * How far word of a town carries: a bigger town's days, good and bad, are
 * heard further — √(people / 8), from 0.7 for a hamlet to 2.5 for a city.
 */
export const reachOf = (s: GameState) => Math.max(0.7, Math.min(2.5, Math.sqrt(s.villagers.length / 8)));

/**
 * A death: 3 points, and every death already today makes the next dearer by
 * the share of the town it has lost — dying "too much" is measured against
 * the town's size: the fifth death of a day in a town of ten costs 13, in a
 * town of forty 6. A death of neglect costs 3 more.
 */
export function onDeath(s: GameState, why = "") {
  const r = recognitionOf(s);
  const neglect = NEGLECT.test(why);
  const cost = Math.round(3 + (24 * r.deathsToday) / Math.max(6, s.villagers.length) + (neglect ? 3 : 0));
  r.deathsToday += 1;
  recognize(s, -cost, neglect ? "died of neglect" : BATTLE.test(why) ? "fell in battle" : "a death");
  // Every death passes here once, with its reason: the run's log sorts them by what killed them.
  noteDeath(s, why);
}

/**
 * Dawn: yesterday's entries are kept for the ledger, and the night's
 * stewardship is counted — what the town's needs looked like as it woke.
 */
export function recognitionDaily(s: GameState) {
  const r = recognitionOf(s);
  const quiet = r.deathsToday === 0;
  r.yesterday = r.today;
  r.today = [];
  r.deathsToday = 0;
  if (!s.villagers.length) return;
  const nd = needsOf(s);
  const part = (tier: Parameters<typeof needTier>[1], id: string) => needTier(nd, tier).parts.find((p) => p.id === id)?.sat ?? 0;
  // The day's stewardship, heard as far as the town's name carries.
  const k = reachOf(s);
  const day = (n: number, why: string) => recognize(s, Math.round(n * k * 10) / 10, why);
  if (quiet) day(2, "a full cycle, no one lost");
  const food = part("survival", "food");
  if (food >= 0.7) day(2, "bellies full");
  else if (food <= 0.3) day(-3, "hunger");
  const warm = part("survival", "warmth");
  if (warm >= 0.9) day(2, "warm enough");
  else if (warm <= 0.5) day(-3, "the cold");
  if (part("survival", "rest") >= 1) day(1, "a bed for everyone");
  const shift = s.policy?.shift ?? 14;
  if (shift <= 12) day(shift <= 10 ? 3 : 2, "a fair working day");
  else if (shift >= 15) day(-2, "the long days");
  if (needsState(s).well >= 0.6) day(2, "a town that is well");
  if (part("belonging", "accord") >= 0.7) day(1, "a town at peace");
  void clock;
}
