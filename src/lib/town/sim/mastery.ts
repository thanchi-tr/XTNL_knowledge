import type { Attribute } from "@prisma/client";
import type { TownInput } from "../rules";
import { log } from "./state";
import { recognize, reachOf } from "./recognition";
import type { GameState, StructureType, Villager } from "./types";

/**
 * What the player's own study — in the real app, not the town — earns the
 * town, read once an hour from the day's study and kept on the state:
 *
 * - **Mastery gates.** A trade teaches only so far without a master: a
 *   worker climbs past level 10, a soldier past rank 12 and a raised hero
 *   past level 10 only while the player holds an emblem of the knowledge the
 *   work draws on, deep enough (depth 3, then 6 for the last reaches). The
 *   emblems are the player's real achievements (Skill emblems): the town's
 *   best people are bounded by what its player has truly learned.
 * - **Daily boons**, at dawn, for yesterday's study: the reviews done, the
 *   ideas brought home, the streak kept, the Domain level reached.
 *
 * Nothing here needs the app to be open: the last reading is kept.
 */

export interface Mastery {
  /** Deepest equipped emblem carrying each attribute. */
  depth: Partial<Record<Attribute, number>>;
  /** Deepest equipped emblem of any kind. */
  peak: number;
  domainPeak: number;
  ideasToday: number;
  reviewsToday: number;
  dueRemaining: number;
  streak: number;
  /** The day the dawn boons were last given, so each day's study pays once. */
  paidDay?: number;
  /** Gates already announced, so the chronicle says each once. */
  told?: Record<string, boolean>;
}

export function masteryOf(s: GameState): Mastery {
  return (s.mastery ??= { depth: {}, peak: 0, domainPeak: 0, ideasToday: 0, reviewsToday: 0, dueRemaining: 0, streak: 0 });
}

/** The hour's reading of the player's study. */
export function readStudy(s: GameState, input: TownInput) {
  const m = masteryOf(s);
  const depth: Partial<Record<Attribute, number>> = {};
  for (const e of input.emblems ?? []) for (const a of e.attributes) depth[a] = Math.max(depth[a] ?? 0, e.depth);
  m.depth = depth;
  m.peak = Math.max(input.peakDepth ?? 0, ...(input.emblems ?? []).map((e) => e.depth), 0);
  m.domainPeak = input.domainPeak ?? 0;
  m.ideasToday = input.newIdeasToday ?? 0;
  m.reviewsToday = input.reviewsToday ?? 0;
  m.dueRemaining = input.dueRemaining ?? 0;
  m.streak = input.streakDays ?? 0;
}

// ── Mastery gates ─────────────────────────────────────────

/** The knowledge each trade draws on: an emblem carrying it opens the trade's higher levels. */
export const TRADE_KNOWLEDGE: Partial<Record<StructureType, Attribute>> = {
  farm: "STATISTIC", waterfarm: "STATISTIC", watermill: "STATISTIC",
  lumbercamp: "PHYSICAL", mine: "PHYSICAL", icefactory: "PHYSICAL", fishery: "PHYSICAL",
  kitchen: "CREATIVITY",
  refinery: "LOGIC", laboratory: "LOGIC", alchemy: "LOGIC", observatory: "LOGIC", mythiclab: "LOGIC",
  forge: "REASON", market: "REASON",
  school: "MIND", museum: "MIND",
};
/** The knowledge a soldier's higher ranks draw on: any one of these. */
export const WAR_KNOWLEDGE: Attribute[] = ["REBUTTAL", "PHYSICAL", "STUBBORNNESS"];

/** Level gates: past `from`, an emblem of at least `depth` is needed. */
export const WORK_GATES = [{ from: 10, depth: 3 }, { from: 20, depth: 6 }] as const;
export const RANK_GATES = [{ from: 12, depth: 4 }, { from: 16, depth: 7 }] as const;
export const HERO_GATES = [{ from: 10, depth: 5 }, { from: 20, depth: 8 }] as const;

const deepest = (m: Mastery, attrs: Attribute[] | "any") => (attrs === "any" ? m.peak : Math.max(0, ...attrs.map((a) => m.depth[a] ?? 0)));

/** The highest level `gates` allow for an emblem depth, below `max`. */
function capBy(gates: readonly { from: number; depth: number }[], depth: number, max: number): number {
  for (const g of gates) if (depth < g.depth) return g.from;
  return max;
}

/** The knowledge a villager's work draws on. */
export function knowledgeFor(s: GameState, v: Villager): Attribute[] | "any" {
  if (["infantry", "archer", "heavy"].includes(v.role)) return WAR_KNOWLEDGE;
  const st = s.structures.find((x) => x.id === v.work);
  const k = st ? TRADE_KNOWLEDGE[st.type] : undefined;
  return k ? [k] : "any";
}

/** How far a worker's level may climb, given the player's emblems. */
export function workCapOf(s: GameState, v: Villager, max: number): number {
  return capBy(WORK_GATES, deepest(masteryOf(s), knowledgeFor(s, v)), max);
}

/** How far a soldier's rank may climb. */
export function rankCapOf(s: GameState, v: Villager, max: number): number {
  return capBy(RANK_GATES, deepest(masteryOf(s), WAR_KNOWLEDGE), max);
}

/** How far a raised hero may climb: any emblem, deep enough. */
export function heroCapOf(s: GameState, max: number): number {
  return capBy(HERO_GATES, masteryOf(s).peak, max);
}

/** How far a trade's ladder of titles may climb: half of it free, three quarters with depth 3, all with depth 6. */
export function ladderCapOf(s: GameState, v: Villager, top: number): number {
  const d = deepest(masteryOf(s), knowledgeFor(s, v));
  return d >= 6 ? top : d >= 3 ? Math.floor(top * 0.75) : Math.floor(top * 0.5);
}

/** What a gate needs, in words, for the panel and the chronicle. */
export function gateText(attrs: Attribute[] | "any", depth: number): string {
  const what = attrs === "any" ? "any emblem" : `an emblem of ${attrs.map((a) => a.replace(/_/g, " ").toLowerCase()).join(" or ")}`;
  return `${what}, depth ${depth} or deeper`;
}

/** Tells the chronicle once that someone has reached a gate. */
export function tellGate(s: GameState, v: Villager, what: string, attrs: Attribute[] | "any", depth: number) {
  const m = masteryOf(s);
  const key = `${v.id}:${what}`;
  m.told ??= {};
  if (m.told[key]) return;
  m.told[key] = true;
  log(s, `${v.name} has learned all a ${what} can without a master: to climb further the town needs ${gateText(attrs, depth)} — earned in your own study.`, "info");
}

/** The next gate for a level, if any. */
export function nextGate(gates: readonly { from: number; depth: number }[], level: number) {
  return gates.find((g) => level <= g.from) ?? null;
}

// ── Dawn boons ────────────────────────────────────────────

/** Gifted-odds bonus from the study streak: half a point a day, to ten. */
export const streakTalent = (s: GameState) => Math.min(0.1, masteryOf(s).streak * 0.005);
/** Wits a newcomer brings to a learned town: a point for every three Domain levels, to four. */
export const learnedWits = (s: GameState) => Math.min(4, Math.floor(masteryOf(s).domainPeak / 3));

/**
 * At dawn, yesterday's study pays the town: every review done and the day's
 * due cleared — a studious town, its name and its hope rise; every idea
 * brought home — word of it travels. The streak's and the Domain's boons are
 * standing ones (streakTalent, learnedWits).
 */
export function studyDawn(s: GameState, day: number) {
  const m = masteryOf(s);
  if (m.paidDay === day) return;
  m.paidDay = day;
  const k = reachOf(s);
  if (m.reviewsToday > 0 && m.dueRemaining === 0) {
    recognize(s, Math.round(3 * k * 10) / 10, "a studious town (reviews done)");
    s.mood = Math.min(100, s.mood + 3);
  }
  if (m.ideasToday > 0) recognize(s, Math.round(Math.min(5, m.ideasToday) * k * 10) / 10, "new ideas brought home");
}

