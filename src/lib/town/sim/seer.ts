import { CATALOG } from "./catalog";
import { chooseTarget } from "./breach";
import { log } from "./state";
import { stats } from "./stats";
import { stock } from "./loot";
import { nemesisOf, pickTactic, TACTIC_CHANNEL, TACTIC_LABEL, type Tactic } from "./nemesis";
import { waveGuess } from "./aggro";
import { rng } from "./world";
import { workLevel } from "./work";
import { MILITARY, type GameState, type MonsterKind, type RaidSide, type Villager } from "./types";

/**
 * Excursions, and the Eye of Time.
 *
 * A worker who has risen to level 10 may go out into the fog like a hero —
 * torches and rations in a pack — on an excursion. The fog is not kind to
 * people who go out into it again and again, but some come back every time;
 * and a worker who has come home from fifty excursions may one day come home
 * changed, able to see a little way ahead in time. That is the Eye of Time.
 *
 * The Eye sees the next wave the land sends by burning precious metal: silver
 * shows where it will come from, gold shows what it will make for as well,
 * platinum the way it means to fight, and a diamond shows what is coming and
 * how strong. What the Eye has seen comes true: the wave comes from there.
 * A star chart halves the metal; so does the Hourglass of the Eye, if the
 * town holds it.
 */

export const EXCURSION_LEVEL = 10;
/** Excursions a worker must come home from before the fog may change them. */
export const EYE_AFTER = 50;
/** And the chance, on each homecoming after that, that it does. */
export const EYE_CHANCE = 0.2;

export interface Prophecy {
  side: RaidSide;
  /** The building the wave will make for (gold or better). */
  target?: number;
  /** How it means to fight (platinum or better). */
  tactic?: Tactic;
  /** What is likeliest to come, and about how strong (a diamond). */
  kind?: MonsterKind;
  level?: number;
  seenAt: number;
  depth: number;
  /** Who saw it. */
  seer: string;
}

export type VisionMetal = "silver" | "gold" | "platinum" | "diamond";
export const VISIONS: { metal: VisionMetal; qty: number; depth: number; shows: string }[] = [
  { metal: "silver", qty: 12, depth: 1, shows: "where the next wave comes from" },
  { metal: "gold", qty: 3, depth: 2, shows: "where it comes from, and what it makes for" },
  { metal: "platinum", qty: 2, depth: 3, shows: "where from, what for, and how it means to fight" },
  { metal: "diamond", qty: 1, depth: 4, shows: "all of that, and what is coming and how strong" },
];

/** A worker who can go on excursions: level 10 or more, and not a soldier. */
export const canExcursion = (v: Villager) => !MILITARY.includes(v.role) && workLevel(v) >= EXCURSION_LEVEL;

export const isEye = (v: Villager) => v.role === "seer";

/**
 * A worker is home from an excursion. Counted; and past the fiftieth, now and
 * then, the fog has changed them. Returns true if they came home the Eye of Time.
 */
export function excursionHome(s: GameState, v: Villager): boolean {
  if (MILITARY.includes(v.role) || v.role === "seer") return false;
  v.excursions = (v.excursions ?? 0) + 1;
  if (v.excursions < EYE_AFTER) return false;
  const r = rng(Math.floor(s.time) * 31 + v.id * 977);
  if (r() >= EYE_CHANCE) return false;
  const job = s.structures.find((st) => st.id === v.work);
  if (job) job.workers = job.workers.filter((id) => id !== v.id);
  v.work = null;
  v.role = "seer";
  log(s, `${v.name} comes home from the ${v.excursions}th excursion changed. They see a little way ahead in time now: the town has an Eye of Time.`, "good");
  return true;
}

/** What a vision costs, after star charts and the hourglass. */
export function visionCost(s: GameState, metal: VisionMetal): { qty: number; chart: boolean; hourglass: boolean } {
  const base = VISIONS.find((x) => x.metal === metal)!.qty;
  const hourglass = stock(s, "hourglass-of-the-eye") > 0;
  const chart = s.res.starchart >= 1;
  let qty = base;
  if (hourglass) qty = Math.ceil(qty / 2);
  if (chart) qty = Math.ceil(qty / 2);
  return { qty, chart, hourglass };
}

/**
 * The Eye burns metal and looks ahead. What it sees is fixed: the next wave
 * the land sends comes from that side, for that building, fighting that way.
 */
export function foresee(s: GameState, seerId: number, metal: VisionMetal): string | null {
  const v = s.villagers.find((x) => x.id === seerId);
  if (!v || !isEye(v)) return "Only an Eye of Time can look ahead.";
  if (v.scout || (v.awayUntil && v.awayUntil > s.time)) return `${v.name} is away.`;
  if (v.health < 30) return `${v.name} is too ill to look.`;
  const vision = VISIONS.find((x) => x.metal === metal)!;
  const cost = visionCost(s, metal);
  if (s.res[metal] < cost.qty) return `Burning ${cost.qty} ${metal} is what it takes (you have ${Math.floor(s.res[metal])}).`;
  s.res[metal] -= cost.qty;
  if (cost.chart) s.res.starchart -= 1;
  const r = rng(Math.floor(s.time) * 131 + seerId * 7 + 3);
  const sides: RaidSide[] = ["east", "south", "north", "west"];
  const p: Prophecy = { side: sides[Math.floor(r() * 4)], seenAt: s.time, depth: vision.depth, seer: v.name };
  if (vision.depth >= 2) {
    const tactic = pickTactic(s, r).tactic;
    const ch = TACTIC_CHANNEL[tactic];
    const aim = chooseTarget(s, ch, [{ kind: "troll", level: 1, count: 1 }], r);
    if (aim.target) p.target = aim.target.id;
    if (vision.depth >= 3) {
      p.tactic = tactic;
      // A wave already stalking the town will fight the way the Eye saw.
      const n = nemesisOf(s);
      if (n.stalk) n.stalk.tactic = tactic;
    }
    if (vision.depth >= 4) {
      const g = waveGuess(s, tactic);
      p.kind = g.kind;
      p.level = g.level;
    }
  }
  s.prophecy = p;
  stats(s).prophecies = (stats(s).prophecies ?? 0) + 1;
  const target = p.target ? s.structures.find((st) => st.id === p.target) : undefined;
  log(s, `${v.name} burns ${cost.qty} ${metal}${cost.chart ? " over a star chart" : ""} and looks ahead: the next wave comes from the ${p.side}${target ? `, for the ${CATALOG[target.type].name.toLowerCase()}` : ""}${p.tactic ? ` — ${TACTIC_LABEL[p.tactic]}` : ""}.`, "info");
  return null;
}

/** The prophecy in words, for the panels. */
export function prophecyText(s: GameState): string | null {
  const p = s.prophecy;
  if (!p) return null;
  const target = p.target ? s.structures.find((st) => st.id === p.target) : undefined;
  const bits = [`from the ${p.side}`];
  if (target) bits.push(`for the ${CATALOG[target.type].name.toLowerCase()} at ${target.x},${target.y}`);
  if (p.tactic) bits.push(TACTIC_LABEL[p.tactic]);
  if (p.kind) bits.push(`likeliest ${p.kind}${p.level ? ` near level ${p.level}` : ""}`);
  return `${p.seer} has seen the next wave: ${bits.join(", ")}.`;
}

/** The wave comes as foreseen: the director reads this when it launches (./aggro). */
export function takeProphecy(s: GameState): Prophecy | null {
  const p = s.prophecy ?? null;
  s.prophecy = null;
  return p;
}

