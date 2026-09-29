import { clock, countedTroops, perHour, totalBeds } from "./state";
import { bodyOf } from "./body";
import { readPlayer } from "./nemesis";
import { aggroOf } from "./aggro";
import { kmod, ATTRS, ATTR_BUFFS } from "./knowledge";
import { workLevel } from "./work";
import { air } from "./weather";
import { isHome } from "./world";
import { townGifts } from "./heroes";
import { defendedTest } from "./combat";
import type { GameState, Structure } from "./types";

/**
 * The town's needs, as a pyramid (Maslow): what keeps people alive, then
 * safe, then together, then proud, then purposeful. Each tier counts only as
 * far as the tiers below it hold — a festival means little to the starving,
 * a school less to people with no roof. A town that keeps its lower tiers
 * met can spend on the upper ones; one that neglects them for glory loses
 * both.
 *
 * Two slow stocks carry the pyramid into the town:
 *
 * - **Wellbeing** follows the pyramid's score with a half-life of
 *   WELL_HALF_H hours. Sanity drifts toward what Wellbeing can hold up;
 *   breakdowns come less often in a town that is well; the work goes better.
 *   A good hour, or a bad one, barely moves it — a good week does.
 * - **Foundations** is what long care builds: reserves laid in, households,
 *   rites, skills, study. It rises and falls over days, and pays back in
 *   everything — output, building speed, steadiness under strain — so good
 *   decisions made in a row compound. A starving town eats its foundations.
 *
 * Nothing here is a switch. No one decision, made or missed, moves either
 * stock more than a little; only a run of them does (scripts/town-balance-check).
 */

export type TierId = "survival" | "safety" | "belonging" | "esteem" | "purpose";

export interface NeedPart {
  id: string;
  label: string;
  /** How well it is met, 0–1. */
  sat: number;
  /** A line for the player: what it stands on. */
  note: string;
}

export interface Tier {
  id: TierId;
  name: string;
  /** How well the tier's own needs are met, 0–1 (its weakest need weighs double). */
  sat: number;
  /** How far the tiers below let it count, 0–1. */
  gate: number;
  /** What it adds to the pyramid: sat × gate. */
  eff: number;
  parts: NeedPart[];
}

export interface Needs {
  tiers: Tier[];
  /** The pyramid's score now, 0–1. */
  score: number;
  /** The one need doing the most harm: the lowest part of the lowest tier that is short. */
  weakest: { tier: TierId; part: NeedPart } | null;
}

export interface NeedsState {
  /** Wellbeing, 0–1: the pyramid's score, followed slowly. */
  well: number;
  /** Foundations, 0–1: what long care has built. */
  found: number;
  /** When the last festival was held, for the belonging it leaves behind. */
  festAt?: number;
}

/** Hours for Wellbeing to close half the gap to the pyramid's score. */
export const WELL_HALF_H = 18;
/** Hours for Foundations to close half its gap — and while the town starves, the faster fall. */
export const FOUND_HALF_H = 96;
export const FOUND_FALL_H = 36;
/** How much each tier weighs in the score: the base of the pyramid most. */
export const TIER_WEIGHT: Record<TierId, number> = { survival: 0.34, safety: 0.26, belonging: 0.18, esteem: 0.12, purpose: 0.1 };
export const TIER_NAME: Record<TierId, string> = { survival: "Survival", safety: "Safety", belonging: "Belonging", esteem: "Esteem", purpose: "Purpose" };
export const TIER_BLURB: Record<TierId, string> = {
  survival: "Food, warmth, water and a bed. Nothing above counts while this fails.",
  safety: "Warm homes, a guarded town, health, and stores laid in for the bad days.",
  belonging: "Households, the dead honoured, rest and feasts, and a town at peace with itself.",
  esteem: "Skill in the work, a hall that grows with the town, and raids beaten rather than suffered.",
  purpose: "Study and learning: the town's reason to be more than alive.",
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 0 below a, 1 above b, smooth between. */
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** A tier's own score: its weakest need weighs as much as all of them together. */
const tierSat = (parts: NeedPart[]) => (parts.length ? 0.5 * Math.min(...parts.map((p) => p.sat)) + 0.5 * mean(parts.map((p) => p.sat)) : 0);

/** What the fog's bands and the night's prowlers pass by, whether guarded or not. */
export const NOT_TARGETS = ["watchtower", "lamppost", "pitfire", "brazier", "armypoint"];

/**
 * Buildings worth guarding that nothing actually defends: no tower's fire
 * reaches them and no posted guard covers them. These are what the fog's
 * bands take, one a half day — the same test the land itself uses.
 */
export function unguarded(s: GameState): Structure[] {
  // The hour asks this four or five times over (the needs, the land's budget, its aim, the bands' prey):
  // within it, once — unless a building or a person came or went (./state perHour).
  return perHour(BARE, s, `${s.structures.length}|${s.villagers.length}`, () => {
    const defended = defendedTest(s);
    return s.structures.filter((b) => !b.buildUntil && !NOT_TARGETS.includes(b.type) && !defended(b));
  });
}
const BARE = new WeakMap<GameState, { n: number; key: string; v: Structure[] }>();

/** Days a festival's belonging lasts, fading. */
export const FEAST_DAYS = 5;

export function needsState(s: GameState): NeedsState {
  return (s.needs ??= { well: 0.6, found: 0.2 });
}

/** The pyramid as it stands this hour. */
export function needsOf(s: GameState): Needs {
  const pop = s.villagers.length;
  const n = Math.max(1, pop);
  const m = readPlayer(s);
  const bodies = s.villagers.map(bodyOf);
  const day = clock(s.time).day;

  // ── Survival ──
  const energy = pop ? mean(bodies.map((b) => clamp01(b.Eg / 2000))) : 1;
  const warm = pop ? mean(bodies.map((b) => clamp01((b.Tc - 35) / 1.5))) : 1;
  const water = pop ? mean(bodies.map((b) => clamp01(1 - (b.h2o ?? 0) / 5))) : 1;
  const beds = totalBeds(s);
  const cold = bodies.filter((b) => b.Tc < 36).length;
  const survival: NeedPart[] = [
    { id: "food", label: "Food", sat: 0.5 * clamp01(m.foodDays / 3) + 0.5 * energy, note: `${m.foodDays.toFixed(1)} days of food in store; bellies ${pct(energy)} full` },
    { id: "warmth", label: "Warmth", sat: warm, note: cold ? `${cold} of ${pop} are cold` : "everyone is warm" },
    { id: "water", label: "Water", sat: water, note: water > 0.95 ? "nobody is thirsty" : `thirst: ${pct(1 - water)} short` },
    { id: "rest", label: "Beds", sat: pop ? clamp01(beds / pop) : 1, note: `${beds} beds for ${pop}` },
  ];

  // ── Safety ──
  const T = air(s).T;
  const homes = s.structures.filter((h) => isHome(h) && !h.buildUntil);
  const byHome = new Map<number, Structure>(homes.map((h) => [h.id, h]));
  const housedWarm = s.villagers.filter((v) => {
    const h = v.house != null ? byHome.get(v.house) : undefined;
    return !!h && (h.zone?.T ?? T) >= 8;
  }).length;
  const troops = countedTroops(s).length;
  const worth = s.structures.filter((b) => !b.buildUntil && !NOT_TARGETS.includes(b.type)).length;
  const bare = unguarded(s).length;
  const guarded = worth ? 1 - bare / worth : 1;
  const defence = 0.5 * guarded + 0.3 * (1 - m.hallWeak) + 0.2 * clamp01(troops / Math.max(1, 0.2 * pop));
  const health = pop ? mean(s.villagers.map((v) => clamp01((v.health - 30) / 50))) : 1;
  const reserves = 0.5 * clamp01(m.foodDays / 7) + 0.5 * clamp01(m.fuelDays / 4);
  const safety: NeedPart[] = [
    { id: "homes", label: "Warm homes", sat: pop ? housedWarm / n : 1, note: `${housedWarm} of ${pop} sleep in a home at 8 °C or more` },
    { id: "defence", label: "Defence", sat: defence, note: `${bare ? `${bare} building${bare === 1 ? " stands" : "s stand"} undefended` : "every building is defended"}; ${troops} troop${troops === 1 ? "" : "s"}${m.hallWeak >= 1 ? "; the hall stands unguarded" : ""}` },
    { id: "health", label: "Health", sat: health, note: `average health ${Math.round(mean(s.villagers.map((v) => v.health)))}` },
    { id: "reserves", label: "Reserves", sat: reserves, note: `food for ${m.foodDays.toFixed(1)} of 7 days, fuel for ${m.fuelDays.toFixed(1)} of 4` },
  ];

  // ── Belonging ──
  const residents = new Map<number, number>();
  for (const v of s.villagers) if (v.house != null) residents.set(v.house, (residents.get(v.house) ?? 0) + 1);
  const together = s.villagers.filter((v) => v.house != null && (residents.get(v.house) ?? 0) >= 2).length;
  const unburied = s.corpses?.length ?? 0;
  const st = needsState(s);
  const gifts = townGifts(s);
  const feast = st.festAt === undefined ? 0 : clamp01(1 - (s.time - st.festAt) / (FEAST_DAYS * gifts.feast * 1440));
  const comforts = homes.length ? homes.filter((h) => (h.utilities?.length ?? 0) > 0).length / homes.length : 0;
  const disc = pop ? mean(s.villagers.map((v) => v.disc ?? 0)) : 0;
  const belonging: NeedPart[] = [
    { id: "company", label: "Households", sat: pop ? together / n : 0, note: `${together} of ${pop} share a home with someone` },
    { id: "rites", label: "Rites", sat: 1 / (1 + unburied), note: unburied ? `${unburied} dead lie unburied` : "the dead are buried" },
    { id: "leisure", label: "Rest and feasts", sat: Math.max(feast, 0.8 * comforts), note: feast > 0 ? `the last festival is still talked of (${pct(feast)})` : `${pct(comforts)} of homes have a comfort; no festival lately` },
    { id: "accord", label: "Accord", sat: 1 - disc / 100, note: `discontent ${Math.round(disc)}` },
  ];

  // ── Esteem ──
  const workers = s.villagers.filter((v) => v.work != null || v.role !== "idle");
  const skill = workers.length ? clamp01(mean(workers.map(workLevel)) / 8) : 0;
  const hall = s.structures.find((h) => h.type === "townhall");
  const expected = 1 + day / 6;
  const losses = aggroOf(s).losses.length;
  const esteem: NeedPart[] = [
    { id: "skill", label: "Skill", sat: skill, note: `workers average level ${workers.length ? mean(workers.map(workLevel)).toFixed(1) : "—"} of 8` },
    { id: "standing", label: "Standing", sat: hall ? clamp01(hall.level / expected) : 0, note: `hall level ${hall?.level ?? 0} — a town of day ${day} looks for ${Math.floor(expected)}` },
    { id: "pride", label: "Pride", sat: 1 / (1 + losses / 3), note: losses ? `${losses} lost to the land in three days` : "no losses to the land in three days" },
  ];

  // ── Purpose ──
  const study = clamp01(ATTRS.reduce((a, k) => a + Math.max(0, kmod(s, k)) / ATTR_BUFFS[k].cap, 0) / 4);
  const has = (t: string) => s.structures.some((x) => x.type === t && !x.buildUntil);
  const schooling = s.structures.some((x) => x.type === "school" && !!x.training);
  const learning = (has("school") ? 0.4 : 0) + (schooling ? 0.3 : 0) + (has("laboratory") || has("observatory") || has("museum") ? 0.3 : 0);
  const purpose: NeedPart[] = [
    { id: "study", label: "Study", sat: study, note: study > 0 ? `the founder's study carries the town (${pct(study)})` : "no study reaches the town today" },
    { id: "learning", label: "Learning", sat: learning, note: has("school") ? (schooling ? "the school has a class" : "the school stands empty") : "no school yet" },
  ];

  const raw: [TierId, NeedPart[]][] = [["survival", survival], ["safety", safety], ["belonging", belonging], ["esteem", esteem], ["purpose", purpose]];
  const tiers: Tier[] = [];
  let gate = 1;
  for (const [id, parts] of raw) {
    const sat = tierSat(parts);
    tiers.push({ id, name: TIER_NAME[id], sat, gate, eff: sat * gate, parts });
    // Each tier opens the next only as far as it is itself met.
    gate *= smooth(0.3, 0.7, sat);
  }
  const score = tiers.reduce((a, t) => a + TIER_WEIGHT[t.id] * t.eff, 0);
  let weakest: Needs["weakest"] = null;
  for (const t of tiers) {
    const low = [...t.parts].sort((a, b) => a.sat - b.sat)[0];
    if (low && low.sat < 0.6) {
      weakest = { tier: t.id, part: low };
      break;
    }
  }
  return { tiers, score, weakest };
}

/** What long care is building toward this hour: reserves and the upper tiers, as far as they count. */
function foundationsTarget(nd: Needs): number {
  const t = Object.fromEntries(nd.tiers.map((x) => [x.id, x])) as Record<TierId, Tier>;
  const reserves = t.safety.parts.find((p) => p.id === "reserves")!.sat * t.safety.gate;
  return 0.3 * reserves + 0.3 * t.belonging.eff + 0.22 * t.esteem.eff + 0.18 * t.purpose.eff;
}

/** The hour's needs: Wellbeing follows the pyramid, Foundations follow long care. */
export function needsHourly(s: GameState): Needs {
  const st = needsState(s);
  const nd = needsOf(s);
  st.well += (nd.score - st.well) * (1 - Math.pow(0.5, 1 / WELL_HALF_H));
  const target = foundationsTarget(nd);
  const starving = nd.tiers[0].sat < 0.35;
  const half = target < st.found && starving ? FOUND_FALL_H : FOUND_HALF_H / (target > st.found ? townGifts(s).found : 1);
  st.found += (target - st.found) * (1 - Math.pow(0.5, 1 / half));
  st.well = clamp01(st.well);
  st.found = clamp01(st.found);
  return nd;
}

// ── What the stocks do ────────────────────────────────────

/** The sanity a villager drifts toward, set by how well the town is. */
export const sanitySetpoint = (s: GameState) => 20 + 75 * needsState(s).well;
/** Share of the gap to the setpoint closed each hour. */
export const SANITY_PULL = 0.025;

/** Breakdown hazard multiplier: a well town, and a well-founded one, breaks less. */
export const breakFactor = (s: GameState) => {
  const st = needsState(s);
  return (1.3 - 0.8 * st.well) * (1 - 0.4 * st.found);
};

/** Output multiplier: 0.85–1.15 from Wellbeing, and up to a third more from Foundations. */
export const thriveFactor = (s: GameState) => {
  const st = needsState(s);
  return (0.85 + 0.3 * st.well) * (1 + 0.33 * st.found);
};

/** Building-speed multiplier from Foundations: a practised town builds faster. */
export const buildFactor = (s: GameState) => 1 + 0.3 * needsState(s).found;

/** Tier by id, for panels and scripts. */
export const tierOf = (nd: Needs, id: TierId) => nd.tiers.find((t) => t.id === id)!;

