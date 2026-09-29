import { onDeath, recognize } from "./recognition";
import { UTILITIES } from "./catalog";
import { byId, clock, log } from "./state";
import { REGIME_FX, YEAR_MEAN_T, air, seasonalT } from "./weather";
import { burnRate, center, rng } from "./world";
import { rateOf } from "./paths";
import { emit, noteLoss } from "./aggro";
import { FOOD_KCAL, MEAL_KCAL, bodyOf, canTakeIn } from "./body";
import { kmod } from "./knowledge";
import { stats } from "./stats";
import { SANITY_PULL, breakFactor, sanitySetpoint } from "./needs";
import { townGifts } from "./heroes";
import { biomeDef } from "./biomes";
import { FUEL_UNIT_KG, HEARTHS, achOf, defaultHearth, envelope, isHeated, isZone, lhv, woodFuel } from "./zones";
import { LUMBER_RATE } from "./tick";
import { pushMoment } from "./moments";
import { DAY_KCAL, PERIL_ALARM, PERIL_SHOW, noteHour, notePeril, noteWalkout, runlogOf } from "./runlog";
import { DAY_MIN, RAW_FOODS, SEASONS, SEASON_LENGTH, YEAR_DAYS } from "./types";
import type { Corpse, GameState, PerilKind, Season, Society, SocietyState, Structure, Villager } from "./types";

/**
 * Psychological attrition (design §6). A villager's happiness is their
 * sanity: cold, dark, hunger, spoiled food, unburied dead and decrees wear it
 * down; warm sleep, hot meals and company build it back. Below 35 the mind
 * can break. The town's mood is its Hope, drifting toward the average
 * sanity and knocked about by deaths and victories. Discontent gathers by
 * faction, and past its lines the town strains, riots, strikes and mutinies.
 * Emergency decrees can be enacted and never repealed.
 */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const FACTIONS = ["Tradition", "Pragmatism", "Faith"] as const;

export const factionOf = (v: Villager) => (v.fac ??= Math.floor(Math.abs(Math.sin(v.id * 78.233) * 43758.5453) % 1 * 3));

// ── The dead ──────────────────────────────────────────────

export function addCorpse(s: GameState, name: string, x: number, y: number) {
  const list = (s.corpses ??= []);
  const id = list.reduce((a, c) => Math.max(a, c.id), 0) + 1;
  list.push({ id, x, y, at: s.time, kg: 65, name, dug: 0 });
}

/** Up to this many people, everyone in town feels a death in full. */
export const GRIEF_TOWN = 20;
/** Up to this many housemates, each grieves in full. */
export const GRIEF_HOUSE = 5;

/**
 * A death seen (§6.1): the town is shaken, the household far more; Hope
 * takes its knock. A village of twenty knows everyone; in a bigger town a
 * stranger's death is news more than grief, so the town's share (sanity and
 * Hope alike) is spread over its people. A household's grief is one family's
 * worth: in a block of thirty it is shared out, not multiplied thirtyfold.
 */
export function witnessDeath(s: GameState, dead: Villager) {
  // Grief saturates: a town already mourning feels each further death less — the first
  // death of a bad day in full, the fourth at half, the tenth at a quarter. A single
  // catastrophe hurts; it does not by itself unhinge everyone.
  const today = s.aggro?.losses.filter((t) => s.time - t < 24 * 60).length ?? 0;
  const numb = 1 / (1 + Math.max(0, today - 1) / 3);
  const town = Math.min(1, GRIEF_TOWN / Math.max(1, s.villagers.length)) * numb;
  const mates = dead.house == null ? 0 : s.villagers.filter((v) => v !== dead && v.house === dead.house).length;
  const house = Math.min(1, GRIEF_HOUSE / Math.max(1, mates));
  for (const v of s.villagers) {
    if (v === dead) continue;
    const kin = dead.house != null && v.house === dead.house;
    v.happy = Math.max(0, v.happy - (kin ? 15 * house * numb : 3 * town) * (v.traits?.includes("pious") ? 0.8 : 1) * (1 - kmod(s, "COMPASSION")));
  }
  s.hopeEvents = (s.hopeEvents ?? 0) - 4 * town;
}

/** Labour-hours to bury one: two, or a fifth of that into a mass grave by decree. */
export const burialHours = (s: GameState) => (s.decrees?.includes("massgraves") ? 0.2 : 2);

/**
 * The hour's burials, by idle hands; and the unburied rotting, which the
 * wild smells (§2.1) and the town cannot stop seeing (§6.1).
 */
export function corpsesHourly(s: GameState) {
  const list = s.corpses ?? [];
  if (!list.length) return;
  let hands = s.villagers.filter((v) => v.role === "idle" && !v.work && v.health > 20 && !(v.broken && v.broken.until > s.time)).length;
  if (!hands) hands = 0.25;
  for (const c of [...list]) {
    if (hands <= 0) break;
    const need = burialHours(s) - c.dug;
    const put = Math.min(hands, need);
    c.dug += put;
    hands -= put;
    if (c.dug >= burialHours(s) - 1e-6) {
      s.corpses = s.corpses!.filter((x) => x !== c);
      if (!s.decrees?.includes("massgraves")) log(s, `${c.name} is buried.`, "info");
    }
  }
  const a = air(s);
  const q10 = Math.pow(2, (a.T - 10) / 10);
  const bio = (s.decrees?.includes("massgraves") ? 0 : 1) * (s.corpses ?? []).reduce((acc, c) => acc + 0.02 * c.kg * q10, 0);
  const hall = s.structures.find((x) => x.type === "townhall");
  const [hx, hy] = hall ? center(hall) : [40, 30];
  if (bio > 0) emit(s, "bio", bio, hx, hy);
}

// ── Sanity ────────────────────────────────────────────────

/** Weight of the decrees on everyone's mind (§6.5). */
export function decreeWeight(s: GameState): number {
  return (s.decrees ?? []).reduce((a, id) => a + (DECREES.find((d) => d.id === id)?.weight ?? 0), 0);
}

/** The hour's change in one villager's sanity (§6.1). */
export function sanityDelta(s: GameState, v: Villager): number {
  const b = bodyOf(v);
  const c = clock(s.time);
  const traits = v.traits ?? [];
  const home = byId(s, v.house);
  const asleep = c.hour >= 22 || c.hour < 6;
  const zoneT = home?.zone?.T ?? air(s).T;
  let d = 0;
  d -= 2.0 * Math.max(0, 36.5 - b.Tc) * (traits.includes("hardy") ? 0.6 : 1);
  const dark = !asleep && c.darkness > 0.5 && (b.at == null || !(byId(s, b.at)?.zone?.burn));
  if (dark) d -= 0.5 * (traits.includes("nyctophobe") ? 3 : 1);
  d -= 1.5 * clamp((0.3 - b.Eg / 2000) / 0.3, 0, 1);
  d -= 4 * b.spoiledMeals;
  // Unburied dead in sight: every one near home or work.
  let corpses = 0;
  const [px, py] = home ? center(home) : [0, 0];
  for (const k of s.corpses ?? []) corpses += 1 / (1 + (Math.hypot(k.x - px, k.y - py) * 2 / 5) ** 2);
  d -= 1.2 * corpses * (traits.includes("pious") ? 0.5 : 1) * (s.decrees?.includes("massgraves") ? 0.5 : 1);
  d -= 0.1 * decreeWeight(s);
  if (traits.includes("hollow")) d -= 0.2;
  if (traits.includes("leftThem")) d -= 0.1;
  if (b.cb >= 8) d -= 0.2;
  if (b.F < 5 && b.F >= 3) d -= 0.5;
  if (asleep) d += zoneT >= 10 ? 1.5 : zoneT >= 5 ? 0.8 : 0;
  d += 3 * Math.min(1, b.meals) * (1 - (s.stores?.mealTaint ?? 0));
  if (!asleep && home && s.villagers.filter((o) => o.house === v.house).length >= 3) d += 0.5;
  if (s.festivalUntil > s.time) d += 1.5;
  const util = (home?.utilities ?? []).reduce((a, id) => a + (UTILITIES.find((u) => u.id === id)?.happy ?? 0), 0);
  d += util;
  if (home?.breakUntil && home.breakUntil > s.time) d += 3;
  // Homeostasis (./needs): minds drift toward what the town's wellbeing can hold up — back
  // up in a town whose needs are met, down in one that is failing, a little each hour.
  d += SANITY_PULL * (sanitySetpoint(s) - v.happy);
  // A cleric's blessing, a skald's tales (./heroes).
  d += townGifts(s).sanity;
  return d;
}

/** Break table by severity (§6.2). */
const MINOR = [["refuse", 0.5], ["binge", 0.3], ["wander", 0.2]] as const;
const MAJOR = [["desert", 0.35], ["arson", 0.2], ["catatonic", 0.3], ["smash", 0.15]] as const;
const EXTREME = [["homicide", 0.4], ["suicide", 0.3], ["mutineer", 0.3]] as const;

function roll<T extends string>(table: readonly (readonly [T, number])[], r: () => number): T {
  let p = r();
  for (const [k, w] of table) if ((p -= w) < 0) return k;
  return table[0][0];
}

/** Hours sanity must lie below 20 before a mind can break the worst ways: a bad night is not enough. */
export const EXTREME_AFTER_H = 36;

function breakDown(s: GameState, v: Villager, r: () => number) {
  const S = v.happy;
  const long = v.lowSince != null && s.time - v.lowSince >= EXTREME_AFTER_H * 60;
  const kind = S < 8 && long ? roll(EXTREME, r) : S < 20 ? roll(MAJOR, r) : roll(MINOR, r);
  const until = s.time + (kind === "catatonic" ? 24 : 6) * 60;
  for (const o of s.villagers) if (o !== v && o.house === v.house) o.happy = Math.max(0, o.happy - 5);
  switch (kind) {
    case "refuse":
    case "wander":
    case "catatonic":
      v.broken = { kind, until };
      log(s, `${v.name} breaks down: ${kind === "catatonic" ? "catatonic, staring at nothing" : kind === "wander" ? "wanders off to sit by the fire" : "refuses to work"}.`, "bad");
      break;
    case "binge": {
      const eaten = Math.min(3, s.res.meals);
      s.res.meals -= eaten;
      bodyOf(v).Eg = Math.min(2000, bodyOf(v).Eg + eaten * 1100);
      log(s, `${v.name} breaks into the stores and eats ${Math.round(eaten)} meals alone.`, "bad");
      break;
    }
    case "desert": {
      const food = Math.min(6, s.res.meals);
      s.res.meals -= food;
      s.villagers = s.villagers.filter((q) => q !== v);
      for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
      s.hopeEvents = (s.hopeEvents ?? 0) - 3;
      recognize(s, -4, "a desertion");
      noteWalkout(s, v.happy);
      log(s, `${v.name} walks out into the fog with ${Math.round(food)} meals and does not come back.`, "bad");
      break;
    }
    case "arson": {
      // A woodpile fire, not the town's whole winter: a tenth of it, sixty at most.
      const lost = Math.min(60, Math.round(s.res.wood * 0.1));
      s.res.wood -= lost;
      const target = s.structures.filter((st) => st.type === "storehouse" || st.type === "house").sort((a, b) => a.id - b.id)[Math.floor(r() * 3)];
      if (target) target.hp = Math.max(1, Math.round(target.hp * 0.5));
      log(s, `${v.name} sets fire to the woodpile${target ? " and a building beside it" : ""}. ${lost} wood burns.`, "bad");
      v.broken = { kind, until };
      break;
    }
    case "smash": {
      const n = Math.min(s.toolkit?.length ?? 0, 2);
      if (n && s.toolkit) {
        s.toolkit.splice(0, n);
        s.res.tools = s.toolkit.length;
      }
      v.broken = { kind, until };
      log(s, n ? `${v.name} smashes ${n} tool${n === 1 ? "" : "s"} in a rage.` : `${v.name} rages through the workshop, breaking what comes to hand.`, "bad");
      break;
    }
    case "homicide": {
      const victim = s.villagers.find((o) => o !== v && !o.champion && o.house === v.house) ?? s.villagers.find((o) => o !== v && !o.champion);
      if (victim) {
        s.villagers = s.villagers.filter((q) => q !== victim);
        for (const st of s.structures) st.workers = st.workers.filter((id) => id !== victim.id);
        s.deaths += 1;
        noteLoss(s);
        const [x, y] = byId(s, victim.house) ? center(byId(s, victim.house)!) : [40, 30];
        addCorpse(s, victim.name, x, y);
        s.hopeEvents = (s.hopeEvents ?? 0) - 8;
        onDeath(s, "murder");
        recognize(s, -4, "a murder");
        log(s, `${v.name}'s mind snaps: ${victim.name} is killed.`, "bad");
      }
      v.broken = { kind, until: s.time + 48 * 60 };
      break;
    }
    case "suicide": {
      s.villagers = s.villagers.filter((q) => q !== v);
      for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
      s.deaths += 1;
      noteLoss(s);
      const [x, y] = byId(s, v.house) ? center(byId(s, v.house)!) : [40, 30];
      addCorpse(s, v.name, x, y);
      s.hopeEvents = (s.hopeEvents ?? 0) - 6;
      onDeath(s, "despair");
      log(s, `${v.name} could not go on.`, "bad");
      break;
    }
    case "mutineer":
      v.disc = Math.min(100, (v.disc ?? 0) + 30);
      for (const o of s.villagers) if (factionOf(o) === factionOf(v)) o.disc = Math.min(100, (o.disc ?? 0) + 10);
      log(s, `${v.name} starts talking of taking the hall. The ${FACTIONS[factionOf(v)]} faction listens.`, "bad");
      break;
  }
}

/**
 * The hour's mind: sanity for everyone, the break hazard below 35, then Hope,
 * discontent and the society's state.
 */
export function psycheHourly(s: GameState) {
  const r = rng(Math.floor(s.time) * 23 + s.seed);
  for (const v of [...s.villagers]) {
    const b = bodyOf(v);
    v.happy = clamp(v.happy + sanityDelta(s, v), 0, 100);
    if (v.happy >= 20) v.lowSince = null;
    else v.lowSince ??= s.time;
    b.spoiledMeals = 0;
    b.meals = 0;
    if (v.broken && v.broken.until <= s.time) v.broken = null;
    if (v.happy < 35 && !v.broken && !v.champion) {
      const lam = 0.004 * Math.exp(0.12 * (35 - v.happy)) * (1 - kmod(s, "MIND")) * breakFactor(s);
      if (r() < 1 - Math.exp(-lam)) breakDown(s, v, r);
    }
  }
  hopeHourly(s);
  discontentHourly(s);
  societyHourly(s, r);
}

function hopeHourly(s: GameState) {
  const n = s.villagers.length;
  const mean = n ? s.villagers.reduce((a, v) => a + v.happy, 0) / n : s.mood;
  let dH = (mean - s.mood) / (7 * 24);
  dH -= (s.corpses?.length ?? 0) / 24;
  // A shock (deaths, a victory, a decree) comes through over the following hours — a
  // quarter of what is left each hour — so a bad hour is a bad day, not an abyss.
  const shock = (s.hopeEvents ?? 0) * 0.25;
  dH += shock;
  s.hopeEvents = (s.hopeEvents ?? 0) - shock;
  if (Math.abs(s.hopeEvents) < 0.05) s.hopeEvents = 0;
  if (s.festivalUntil > s.time) dH += 6 / 12;
  // Faith (ideas in Faith-heavy Fields) lifts Hope each hour; neglect of them drags it.
  dH += 0.5 * kmod(s, "FAITH");
  for (const d of s.debuffs) dH += d.moodPerHour;
  // A cleric's faith: Hope a day, and while a cleric of the Beacon lives, a floor under it (./heroes).
  const gift = townGifts(s);
  dH += gift.hope / 24;
  let next = s.mood + dH;
  // Held at the floor; below it, lifted half a point an hour back toward it.
  if (gift.hopeFloor > 0 && next < gift.hopeFloor) next = Math.max(next, Math.min(gift.hopeFloor, s.mood + 0.5));
  s.mood = clamp(next, 0, 100);
}

function discontentHourly(s: GameState) {
  const ration = s.policy?.ration ?? 1;
  const shift = s.policy?.shift ?? 14;
  for (const v of s.villagers) {
    factionOf(v);
    // Where discontent settles is set by policy, not by time: the default fourteen-hour day
    // settles near 45 (strained, never a strike on its own); sixteen hours near 70, short
    // rations higher still. Long hours are a lever to pull for a while, not a slow trap.
    let d = ((2.2 * (1 - ration)) / 24 + (0.34 * Math.max(0, shift - 10)) / 24) * (1 - kmod(s, "SELF_RESPECT")) - (0.03 * (v.disc ?? 0)) / 24;
    if (s.festivalUntil > s.time) d -= 3 / 12;
    if (v.happy < 30) d += 0.2;
    v.disc = clamp((v.disc ?? 0) + d, 0, 100);
  }
}

export function factionDiscontent(s: GameState): { share: number; disc: number }[] {
  const n = s.villagers.length || 1;
  return FACTIONS.map((_, f) => {
    const m = s.villagers.filter((v) => factionOf(v) === f);
    return { share: m.length / n, disc: m.length ? m.reduce((a, v) => a + (v.disc ?? 0), 0) / m.length : 0 };
  });
}

/** Hours a town can lie dwindled, or without hope, before the run ends. */
export const FALL_HOURS = 72;
/** Hours a town too small to dwindle can stand with no one in it before the run ends. */
export const EMPTY_HOURS = 24;
/** The peak a town must reach before it can dwindle: past five people. Smaller, it can only empty. */
export const DWINDLE_PEAK = 6;

/** The society's state machine, evaluated hourly (§6.4). */
function societyHourly(s: GameState, r: () => number) {
  const soc: Society = (s.society ??= { state: "stable", since: s.time, strikeHours: 0 });
  const H = s.mood;
  const n = s.villagers.length || 1;
  const D = s.villagers.reduce((a, v) => a + (v.disc ?? 0), 0) / n;
  const facs = factionDiscontent(s);
  const worst = facs.reduce((best, f, i) => (f.disc > facs[best].disc ? i : best), 0);
  const set = (state: SocietyState) => {
    if (soc.state === state) return;
    soc.state = state;
    soc.since = s.time;
    const msg: Record<SocietyState, string> = {
      stable: "The town settles. People look each other in the eye again.",
      strained: "The town is strained: tempers short, work slower.",
      unrest: "Unrest: tools go missing, fires start, the hall's orders are argued over.",
      strike: `The ${FACTIONS[worst]} faction lays down its tools. Nothing is worked, heated or cooked by them until they are heard.`,
      mutiny: `Mutiny. The ${FACTIONS[worst]} faction takes up arms against the hall.`,
      exile: "The steward is overthrown and driven out. The run is over.",
    };
    log(s, msg[state], state === "stable" ? "good" : "bad");
  };
  // Ultimatum: a faction over 70 holding over 30% makes a demand, 48 hours to meet it.
  if (!soc.ultimatum && facs[worst].disc > 70 && facs[worst].share > 0.3) {
    const demand = (s.policy?.ration ?? 1) < 1 ? "rations" : (s.decrees?.length ?? 0) > 0 ? "repeal" : "rest";
    soc.ultimatum = { faction: worst, demand, until: s.time + 48 * 60 };
    log(s, `The ${FACTIONS[worst]} faction demands ${demand === "rations" ? "full rations" : demand === "repeal" ? "the last decree be repealed — which cannot be done" : "a day of rest"}. 48 hours.`, "bad");
  }
  if (soc.ultimatum && s.time >= soc.ultimatum.until) {
    const f = soc.ultimatum.faction;
    for (const v of s.villagers) if (factionOf(v) === f) v.disc = clamp((v.disc ?? 0) + 15, 0, 100);
    soc.ultimatum = null;
    soc.strikeHours = Math.max(soc.strikeHours, 24);
  }
  // Despair: three days with Hope at five or less and the survivors give up the place (§6.4).
  soc.despairHours = H <= 5 ? (soc.despairHours ?? 0) + 1 : 0;
  if (soc.despairHours >= FALL_HOURS && !s.fallen) {
    s.fallCause = "abandoned";
    s.fallen = { at: s.time, day: clock(s.time).day };
    log(s, "Three days without hope. The survivors pack what they can carry and leave. The town is abandoned.", "bad");
  }
  // Dwindled: a town that grew past five and has lain at a third of its peak or fewer (two at
  // the least) for three days is a camp of survivors, not a town. They can stay and rebuild;
  // the tally stops here.
  const t = stats(s);
  t.peakPop = Math.max(t.peakPop ?? 0, s.villagers.length);
  // Emptied: a town that never grew past five cannot dwindle, and one with no one in it used to stand for
  // ever. A day empty ends it. A town that grew is left to its dwindling clock, which an empty town runs
  // too: refugees can still refill it in those three days — at the thaw, say, when a newcomer no longer
  // needs two days' fuel found for them.
  soc.emptyHours = s.villagers.length || t.peakPop >= DWINDLE_PEAK ? 0 : (soc.emptyHours ?? 0) + 1;
  if (soc.emptyHours >= EMPTY_HOURS && !s.fallen) {
    s.fallCause = "emptied";
    s.fallen = { at: s.time, day: clock(s.time).day };
    log(s, "A day with no one living in the town. It stands empty. The run is over.", "bad");
  }
  const husk = Math.max(2, Math.floor(t.peakPop / 3));
  // Or at half its peak or fewer with nothing in store to feed or warm one more (./body canTakeIn):
  // a starving camp, which no one comes to, is not a town either.
  const camp = s.villagers.length <= Math.max(3, Math.floor(t.peakPop / 2)) && canTakeIn(s, clock(s.time).season) !== null;
  soc.fewHours = t.peakPop >= DWINDLE_PEAK && (s.villagers.length <= husk || camp) ? (soc.fewHours ?? 0) + 1 : 0;
  if (soc.fewHours >= FALL_HOURS && !s.fallen) {
    s.fallCause = "dwindled";
    s.fallen = { at: s.time, day: clock(s.time).day };
    log(s, camp && s.villagers.length > husk
      ? `Three days at ${s.villagers.length} people, of ${t.peakPop} at its height, with nothing in store to feed or warm another. What stands is a starving camp, not a town. The town has dwindled away.`
      : `Three days with ${husk} people or fewer left, of ${t.peakPop} at its height. What stands is a camp of survivors, not a town. The town has dwindled away.`, "bad");
  }
  if (facs[worst].disc >= 75) soc.strikeHours += 1;
  else soc.strikeHours = Math.max(0, soc.strikeHours - 1);

  switch (soc.state) {
    case "stable":
      if (H < 50 || D >= 40) set("strained");
      break;
    case "strained":
      if (H >= 60 && D < 30) set("stable");
      else if ((H < 30 || D >= 60) && s.time - soc.since >= 6 * 60) set("unrest");
      break;
    case "unrest":
      if (H >= 40 && D < 50) set("strained");
      else if (soc.strikeHours >= 24) set("strike");
      else if (r() < 1 - Math.exp(-0.01)) {
        const lost = Math.round(s.res.wood * 0.05);
        if (lost > 0) {
          s.res.wood -= lost;
          log(s, `Sabotage in the night: ${lost} wood burnt.`, "bad");
        }
      }
      break;
    case "strike":
      if (facs[worst].disc < 60) {
        soc.strikeHours = 0;
        set("unrest");
      }
      else if ((H < 10 && D >= 85) || s.time - soc.since > 72 * 60) set("mutiny");
      break;
    case "mutiny": {
      // Mutineers against loyalists: the larger side prevails within a day.
      const rebels = s.villagers.filter((v) => factionOf(v) === worst).length;
      const loyal = s.villagers.length - rebels + s.villagers.filter((v) => v.guard != null).length;
      if (s.time - soc.since >= 24 * 60) {
        if (rebels > loyal || loyal < 0.25 * s.villagers.length) {
          set("exile");
          s.fallCause = "deposed";
          s.fallen ??= { at: s.time, day: clock(s.time).day };
        } else {
          const dead = s.villagers.filter((v) => factionOf(v) === worst && !v.champion).slice(0, Math.ceil(rebels / 2));
          for (const v of dead) {
            s.villagers = s.villagers.filter((q) => q !== v);
            for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
            s.deaths += 1;
            onDeath(s, "the mutiny");
            addCorpse(s, v.name, 40, 30);
          }
          for (const v of s.villagers) v.disc = Math.max(0, (v.disc ?? 0) - 30);
          log(s, `The mutiny is put down. ${dead.length} dead.`, "bad");
          set("unrest");
        }
      } else if (r() < 0.05) {
        const st = s.structures.filter((x) => x.type !== "townhall")[Math.floor(r() * Math.max(1, s.structures.length - 1))];
        if (st) st.hp = Math.max(1, Math.round(st.hp * 0.3));
      }
      break;
    }
    case "exile":
      break;
  }
}

/** Work lost to the society's state. */
export function societyWork(s: GameState): number {
  const st = s.society?.state ?? "stable";
  return st === "strained" ? 0.95 : st === "unrest" ? 0.85 : 1;
}

// ── Peril (design M1, "Honest endings") ───────────────────
//
// How near the end the town stands, read straight from the rules that end it
// (societyHourly above) and from the stores it lives on: the doom clock, and
// how many days the food and the fuel will last. The Peril meter shows it,
// the first crossings stop the game (perilAlarms), autumn's first dawn audits
// the winter to come (winterAudit), and the run's log keeps a page of it every
// dawn (./runlog). Reads only, bar the alarms' own records.

/** The end drawing near: which rule's clock is running, and the numbers it runs on. */
export interface Doom {
  kind: "dwindle" | "despair" | "empty";
  hoursLeft: number;
  people: number;
  peak: number;
  /** A third of the peak, two at least: at or under it the town is a husk. */
  husk: number;
  /** Half the peak, three at least: at or under it, with nothing to take in one more, a starving camp. */
  camp: number;
  /** What the town lacks to take in one more (./body canTakeIn), when that is what keeps it a camp. */
  lack: string | null;
}

/** Fuel a day, in store units: the hearths, the pit fires and braziers kept lit, the kitchens, and in the freeze the snow melted for water. */
export interface DailyFuel {
  heat: number;
  fires: number;
  cooking: number;
  melt: number;
  total: number;
}

export interface Peril {
  doom: Doom | null;
  /** Days the stores last at today's rate; Infinity with no one to feed or nothing burning. */
  foodDays: number;
  fuelDays: number;
  /** In the freeze water is melted snow, paid in fuel: it lasts as long as the fuel. Infinity otherwise. */
  waterDays: number;
  /** Fuel held (store units) and food held (kcal). */
  fuel: number;
  kcal: number;
  burn: DailyFuel;
  melting: boolean;
  /** Mean sanity, where the town's wellbeing pulls it (./needs sanitySetpoint), and the gap: above 0 it is rising. */
  sanity: number;
  setpoint: number;
  sanityTrend: number;
}

/** The steady air a forecast is made at: a season's mean temperature on this map, the ground under it, a fair day's wind. */
export interface Climate {
  season: Season;
  T: number;
  Tg: number;
  wind: number;
}

/** Heat a person gives off in a warm room, W: a waking 150 and a sleeping 100, most of the hours at home asleep (./zones). */
const OCC_W = 110;
/** A kitchen's fire takes 1.5 kg of wood an hour through the working day, 06:00–20:00 (./zones stepZones). */
const KITCHEN_KG_DAY = 1.5 * 14;
/** Water a person drinks in a day, litres; the fuel a litre of snow takes to melt, kg; and below what temperature winter water is snow (./body drink). */
const WATER_L = 2.5;
const MELT_KG = 0.09;
const MELT_BELOW = -2;

const fuelHeld = (s: GameState) => s.res.wood + s.res.coal + s.res.peat + s.res.charcoal;
/** Kcal in store, counted as ./body canTakeIn counts it. */
const kcalHeld = (s: GameState) => s.res.meals * MEAL_KCAL + RAW_FOODS.reduce((a, k) => a + s.res[k] * (FOOD_KCAL[k] ?? 600), 0);

function climateAt(s: GameState, Tseason: number, season: Season): Climate {
  const b = biomeDef(s);
  // The ground under a house, as ./weather air has it.
  return { season, T: Tseason + b.dT, Tg: YEAR_MEAN_T + 0.35 * (Tseason - YEAR_MEAN_T), wind: REGIME_FX.fair.v * b.wind };
}

/** Today's forecast air: the season's mean now, not the hour's weather, so the forecast does not swing with every gust. */
export const climateNow = (s: GameState) => climateAt(s, seasonalT(s.time), clock(s.time).season);

/** The day this year's winter begins (days since founding, from 0). */
function winterStart(s: GameState): number {
  const day = Math.floor(s.time / DAY_MIN);
  return day - (day % YEAR_DAYS) + SEASONS.slice(0, SEASONS.indexOf("winter")).reduce((a, k) => a + SEASON_LENGTH[k], 0);
}

/** This year's winter, its days' mean temperature at noon. */
export function winterClimate(s: GameState): Climate {
  const w0 = winterStart(s);
  let t = 0;
  for (let i = 0; i < SEASON_LENGTH.winter; i++) t += seasonalT((w0 + i + 0.5) * DAY_MIN);
  return climateAt(s, t / SEASON_LENGTH.winter, "winter");
}

/**
 * Kilos an hour a zone's fire burns to hold the heat target with `people`
 * inside, at a steady outdoor temperature: ./zones stepZones at its
 * equilibrium, where a stove's stored heat gives out what it takes in. Wood
 * as the stores hold it, the town's commonest and weakest fuel.
 */
export function fireKgH(s: GameState, st: Structure, cl: Climate, people: number): number {
  const kind = st.hearth ?? defaultHearth(st);
  if (!kind || people <= 0) return 0;
  const def = HEARTHS[kind];
  const env = envelope(st);
  const Hout = env.UAwalls + env.UAroof + 0.333 * env.V * achOf(st, env, cl.wind, 0);
  const UAfloor = env.UAfloor * (1 - (def.floor ?? 0));
  // The fire makes up what walls, roof, draughts and floor lose, past what the people in it give off.
  const need = (Hout + UAfloor) * (s.policy?.heat ?? 10) - Hout * cl.T - UAfloor * cl.Tg - OCC_W * people;
  if (need <= 0) return 0;
  const eta = Math.min(0.95, def.eta * (1 + kmod(s, "ABSTRACT")));
  const f = woodFuel(s.stores?.woodMC ?? 0.3);
  return Math.min(def.maxKgH, ((need / eta) * 3600) / (lhv(f.lhvDry, f.mc) * 1e6));
}

/** Night hours, 20:00–06:00, when pit fires burn harder and braziers burn at all (./tick). */
const NIGHT_H = 10;

/**
 * The town's fuel a day at a steady climate, in store units. A home is lit
 * while anyone is in: the evening and the night, or all day for someone
 * with no work to go to. A heated workplace is lit through the shift while
 * anyone works there. A pit fire with fuel in its grate burns its season's
 * rate, a brazier its coal through the night: kept lit, they draw on the
 * stores too. Kitchens cook by day. In the freeze, snow is melted for
 * everyone's water. Lamps, a unit a night, are left out.
 */
export function dailyFuel(s: GameState, cl: Climate): DailyFuel {
  const shift = Math.min(24, s.policy?.shift ?? 14);
  const homes = new Map<number, { n: number; allDay: boolean }>();
  const staff = new Map<number, number>();
  for (const v of s.villagers) {
    if (v.scout || (v.deployedUntil && v.deployedUntil > s.time)) continue;
    if (v.work != null) staff.set(v.work, (staff.get(v.work) ?? 0) + 1);
    if (v.house == null) continue;
    const h = homes.get(v.house) ?? { n: 0, allDay: false };
    h.n += 1;
    if (v.work == null) h.allDay = true;
    homes.set(v.house, h);
  }
  let heat = 0;
  let fires = 0;
  let cooking = 0;
  for (const st of s.structures) {
    if (st.buildUntil) continue;
    if (st.type === "pitfire" && (st.fuel ?? 0) > 0) {
      fires += (burnRate(cl.season, false) * (24 - NIGHT_H) + burnRate(cl.season, true) * NIGHT_H) / rateOf(st);
      continue;
    }
    if (st.type === "brazier" && ((st.fuel ?? 0) > 0 || s.res.coal >= 1)) {
      fires += (0.5 * NIGHT_H) / rateOf(st);
      continue;
    }
    if (!isZone(st)) continue;
    if (st.type === "kitchen") {
      if (staff.get(st.id)) cooking += KITCHEN_KG_DAY;
      continue;
    }
    if (!isHeated(st)) continue;
    const h = homes.get(st.id);
    if (h) heat += fireKgH(s, st, cl, h.n) * (h.allDay ? 24 : 24 - shift);
    else if (staff.get(st.id)) heat += fireKgH(s, st, cl, staff.get(st.id)!) * shift;
  }
  const melt = cl.season === "winter" && cl.T < MELT_BELOW ? s.villagers.length * WATER_L * MELT_KG : 0;
  const out = { heat: heat / FUEL_UNIT_KG, fires, cooking: cooking / FUEL_UNIT_KG, melt: melt / FUEL_UNIT_KG, total: 0 };
  out.total = out.heat + out.fires + out.cooking + out.melt;
  return out;
}

/** The end drawing near, if a rule's clock is running: the nearest of them. */
function doomOf(s: GameState): Doom | null {
  const soc = s.society;
  if (!soc) return null;
  const pop = s.villagers.length;
  const peak = Math.max(s.stats?.peakPop ?? 0, pop);
  const husk = Math.max(2, Math.floor(peak / 3));
  const camp = Math.max(3, Math.floor(peak / 2));
  const base = { people: pop, peak, husk, camp, lack: null as string | null };
  const left = (h: number, of: number) => Math.max(0, of - h);
  const all: Doom[] = [];
  if ((soc.emptyHours ?? 0) > 0) all.push({ ...base, kind: "empty", hoursLeft: left(soc.emptyHours!, EMPTY_HOURS) });
  if ((soc.fewHours ?? 0) > 0) all.push({ ...base, kind: "dwindle", hoursLeft: left(soc.fewHours!, FALL_HOURS), lack: pop > husk ? canTakeIn(s, clock(s.time).season) : null });
  if ((soc.despairHours ?? 0) > 0) all.push({ ...base, kind: "despair", hoursLeft: left(soc.despairHours!, FALL_HOURS) });
  return all.sort((a, b) => a.hoursLeft - b.hoursLeft)[0] ?? null;
}

/** How near the end the town stands: the doom clock, and the days its food, fuel and winter water will last. Reads only. */
export function perilOf(s: GameState): Peril {
  const pop = s.villagers.length;
  const fuel = fuelHeld(s);
  const kcal = kcalHeld(s);
  const burn = dailyFuel(s, climateNow(s));
  const fuelDays = burn.total > 0 ? fuel / burn.total : Infinity;
  const sanity = pop ? s.villagers.reduce((a, v) => a + v.happy, 0) / pop : 0;
  const setpoint = sanitySetpoint(s);
  return {
    doom: doomOf(s),
    foodDays: pop ? kcal / (pop * DAY_KCAL) : Infinity,
    fuelDays,
    waterDays: burn.melt > 0 ? fuelDays : Infinity,
    fuel, kcal, burn, melting: burn.melt > 0,
    sanity, setpoint, sanityTrend: pop ? setpoint - sanity : 0,
  };
}

/** A fuel figure as the forecasts write it: whole units, or a tenth under ten. */
export const fuelText = (n: number) => (n >= 10 ? `${Math.round(n)}` : `${Math.round(n * 10) / 10}`);
const daysText = (n: number) => `${(Math.floor(n * 10) / 10).toFixed(1)} day${n >= 0.95 && n < 1.05 ? "" : "s"}`;

/** What a dwindling town needs to be a town again: more than a husk, or — while it is a starving camp — more than a camp or the stores to take in one more. */
export const doomNeeds = (d: Doom) => (d.people <= d.husk ? d.husk + 1 : d.camp + 1);

/** The meter's line for the end drawing near: "Dwindling · 41 h left · 3 of 11 people (a town needs 4)". */
export function doomText(d: Doom, mood: number): string {
  if (d.kind === "empty") return `Empty · ${d.hoursLeft} h left · no one lives here`;
  if (d.kind === "despair") return `Abandoning · ${d.hoursLeft} h left · Hope ${Math.round(mood)}% (it needs above 5)`;
  return `Dwindling · ${d.hoursLeft} h left · ${d.people} of ${d.peak} people (a town needs ${doomNeeds(d)}${d.lack ? `, or ${d.lack === "no food" ? "food" : "fuel"} to take in one more` : ""})`;
}

/** The meter's line for a store running short: "Fuel 2.8 days". */
export function forecastText(kind: "food" | "fuel", p: Peril): string {
  return kind === "food" ? `Food ${daysText(p.foodDays)}` : `Fuel ${daysText(p.fuelDays)}${p.melting ? " (heat and water)" : ""}`;
}

/** The fires' day, term by term: "heat 64 + pit fires 51 + cooking 4 + snow-melt 0.3 a day". */
export const burnText = (b: DailyFuel) =>
  `heat ${fuelText(b.heat)}${b.fires ? ` + pit fires ${fuelText(b.fires)}` : ""}${b.cooking ? ` + cooking ${fuelText(b.cooking)}` : ""}${b.melt ? ` + snow-melt ${fuelText(b.melt)}` : ""} a day`;

function doomMoment(s: GameState, d: Doom): { title: string; lines: string[] } {
  const c = clock(s.time);
  if (d.kind === "empty") {
    return { title: "No one lives in the town", lines: [`${d.hoursLeft} hours left: a day with no one in it and the run ends.`, "Refugees come to a near-empty town with a free bed, food and fuel to spare, and Hope at 10% or more."] };
  }
  if (d.kind === "despair") {
    return { title: `Hope has fallen to ${Math.round(s.mood)}%`, lines: [`${d.hoursLeft} hours left: three days with Hope at 5% or less and the survivors leave.`, "Hope drifts toward the town's mean sanity; a festival, good meals and a broken wave lift it."] };
  }
  const cold = c.season === "autumn" || c.season === "winter";
  return {
    title: `Dwindling: ${d.people} of ${d.peak} people`,
    lines: [
      `${d.hoursLeft} hours left to hold ${doomNeeds(d)} or more${d.lack ? `, or the ${d.lack === "no food" ? "food" : "fuel"} to take in one more` : ""}, or the town is a camp and the run ends.`,
      `Newcomers come only to a town with a free bed and two days' food in store for one more${cold ? ", and in the cold months two days' fuel a head" : ""}.`,
    ],
  };
}

/** An alarm stays raised a day at least, and is raised again only once what set it off has passed: no flicker, no nagging. */
const REARM_MIN = 24 * 60;

/**
 * The hour's alarms. The first crossing of each — the doom clock starting,
 * food or fuel under PERIL_ALARM days — is a peril moment, which the screen
 * stops for (TownGame). Each is raised once, and again only after it has
 * passed (the clock stopped; the store back over PERIL_SHOW days) and a
 * day has gone by. The run's log keeps the stores' empty days and the first
 * alarm. Nothing after the fall.
 */
export function perilAlarms(s: GameState, p: Peril) {
  if (s.fallen) return;
  if (s.villagers.length) noteHour(s, p.fuel, p.foodDays, clock(s.time).season === "winter");
  const seen = (s.perilSeen ??= {});
  const raise = (kind: PerilKind, on: boolean, passed: boolean, make: () => { title: string; lines: string[] }) => {
    const at = seen[kind];
    if (on) {
      if (at !== undefined) return;
      seen[kind] = s.time;
      const m = make();
      pushMoment(s, { kind: "peril", ...m });
      notePeril(s, m.title);
    } else if (at !== undefined && passed && s.time - at >= REARM_MIN) delete seen[kind];
  };
  raise("doom", !!p.doom, true, () => doomMoment(s, p.doom!));
  raise("food", p.foodDays < PERIL_ALARM, p.foodDays >= PERIL_SHOW, () => ({
    title: `Food for ${daysText(p.foodDays)}`,
    lines: [`${s.villagers.length} people eat ${fuelText((s.villagers.length * DAY_KCAL) / 1000)}k kcal a day; the stores hold ${fuelText(p.kcal / 1000)}k.`, "Farms, fishers and kitchens fill them; a hungry town takes in no one."],
  }));
  raise("fuel", p.fuelDays < PERIL_ALARM, p.fuelDays >= PERIL_SHOW, () => ({
    title: `Fuel for ${daysText(p.fuelDays)}`,
    lines: [
      `${fuelText(p.fuel)} fuel held; the fires take ${fuelText(p.burn.total)} a day (${burnText(p.burn)}).`,
      p.melting ? "In the freeze water is snow melted by fuel: when the fuel is gone, people go thirsty." : "Lumberjacks fell wood; coal, peat and charcoal burn as well.",
    ],
  }));
}

/** What the autumn audit counted (winterAudit): the winter's fuel and food against what the town holds. */
export interface WinterAudit {
  year: number;
  days: number;
  mouths: number;
  /** The winter's fuel, in store units: heat, pit fires, cooking, snow-melt, and all of it. */
  heat: number;
  fires: number;
  cooking: number;
  melt: number;
  need: number;
  hold: number;
  short: number;
  /** Person-days of food in store (a person-day is DAY_KCAL), and the winter's. */
  foodHave: number;
  foodNeed: number;
  /** Days left before winter; the lumberjacks, at full strength, that would make up the shortfall in them, and for how many days. */
  daysLeft: number;
  hands: number;
  handDays: number;
}

/**
 * The winter ahead, counted at its days' mean temperature: SEASON_LENGTH
 * winter days of the town's fires (dailyFuel) with its people as they are,
 * and a person-day of food for each of them a day — against the stores.
 * Pure: the same sums the forecasts use, ten days of them.
 */
export function winterAudit(s: GameState): WinterAudit {
  const days = SEASON_LENGTH.winter;
  const burn = dailyFuel(s, winterClimate(s));
  const hold = fuelHeld(s);
  const need = days * burn.total;
  const short = Math.max(0, need - hold);
  const daysLeft = Math.max(1, Math.round(winterStart(s) - s.time / DAY_MIN));
  // A lumberjack at full strength fells LUMBER_RATE an hour through the shift (./tick).
  const handDays = short / (LUMBER_RATE * (s.policy?.shift ?? 14));
  const hands = short <= 0 ? 0 : handDays <= daysLeft ? 1 : Math.ceil(handDays / daysLeft);
  return {
    year: clock(s.time).year, days, mouths: s.villagers.length,
    heat: days * burn.heat, fires: days * burn.fires, cooking: days * burn.cooking, melt: days * burn.melt, need, hold, short,
    foodHave: kcalHeld(s) / DAY_KCAL, foodNeed: s.villagers.length * days,
    daysLeft, hands, handDays: hands > 1 ? daysLeft : Math.max(1, Math.ceil(handDays)),
  };
}

/** The audit as the screen shows it: '10 winter days · 11 mouths · heat 510 + snow-melt 2 fuel = 512 · you hold 430 · short 82 (about 1 lumberjack for 1 day)'. */
export function auditText(a: WinterAudit): { title: string; lines: string[] } {
  const foodShort = a.foodHave < a.foodNeed;
  const title = `Winter audit: ${a.short > 0 ? `${fuelText(a.short)} fuel short` : "fuel enough"}${foodShort ? `, food short` : ""}`;
  const fuel = `${a.days} winter days · ${a.mouths} mouths · heat ${fuelText(a.heat)}${a.fires ? ` + pit fires ${fuelText(a.fires)}` : ""}${a.cooking ? ` + cooking ${fuelText(a.cooking)}` : ""} + snow-melt ${fuelText(a.melt)} fuel = ${fuelText(a.need)} · you hold ${fuelText(a.hold)} · ` +
    (a.short > 0 ? `short ${fuelText(a.short)} (about ${a.hands} lumberjack${a.hands === 1 ? "" : "s"} for ${a.handDays} day${a.handDays === 1 ? "" : "s"})` : `${fuelText(a.hold - a.need)} to spare`);
  const food = `food ${Math.round(a.foodHave)} of ${a.foodNeed} person-days${foodShort ? ` · short ${Math.ceil(a.foodNeed - a.foodHave)}` : ""}`;
  return { title, lines: [fuel, food, `Winter comes in ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}. Its water is snow melted by fuel.`] };
}

/** Autumn's first dawn (days 13, 41, …): the winter audit, once a year, as a moment the screen stops for. Returns it when it was made. */
export function auditAutumn(s: GameState): WinterAudit | null {
  const c = clock(s.time);
  if (c.hour !== 6 || c.season !== "autumn" || s.fallen || !s.villagers.length) return null;
  const rl = runlogOf(s);
  if (rl.audit?.year === c.year) return null;
  const a = winterAudit(s);
  rl.audit = a;
  pushMoment(s, { kind: "audit", ...auditText(a) });
  return a;
}

// ── Decrees (§6.5) ────────────────────────────────────────

export interface Decree {
  id: string;
  name: string;
  blurb: string;
  hope: number;
  /** Discontent by faction: Tradition, Pragmatism, Faith. */
  disc: [number, number, number];
  weight: number;
  unlock: (s: GameState) => string | null;
}

export const DECREES: Decree[] = [
  {
    id: "triage", name: "Triage without medicine", hope: -3, disc: [2, 0, 4], weight: 1,
    blurb: "Amputations without a physician or medicine: gangrene survived one time in two, not one in five.",
    unlock: (s) => (s.villagers.some((v) => v.body?.ill.some((i) => i.kind === "gangrene")) ? null : "Needs a case of gangrene."),
  },
  {
    id: "protein", name: "Emergency protein", hope: -25, disc: [20, 5, 40], weight: 5,
    blurb: "The dead are butchered: 30 kg of meat each. Those who eat carry it with them, and some sicken years later.",
    unlock: (s) => ((s.corpses?.length ?? 0) > 0 && s.res.meals < s.villagers.length * 3 ? null : "Needs the dead unburied and less than a day of food."),
  },
  {
    id: "burnhouses", name: "Burn the houses", hope: -8, disc: [10, 0, 5], weight: 2,
    blurb: "An emptied home is pulled down for firewood: its timber, green, into the woodpile. Its people sleep in the hall.",
    unlock: (s) => (s.res.wood + s.res.peat + s.res.coal < s.villagers.length * 2 ? null : "Needs fuel for less than a day."),
  },
  {
    id: "shifts", name: "Extended shifts", hope: -2, disc: [6, 0, 3], weight: 1,
    blurb: "Fourteen hours becomes eighteen. More gets done; people tire, and chill, faster.",
    unlock: () => null,
  },
  {
    id: "massgraves", name: "Mass graves", hope: -4, disc: [4, 0, 12], weight: 1,
    blurb: "The dead go into a pit, quickly: a tenth of the labour, and no rot for the wild to smell. No rites.",
    unlock: (s) => ((s.corpses?.length ?? 0) >= 5 ? null : "Needs five unburied dead."),
  },
  {
    id: "sealsick", name: "Seal the sick", hope: -6, disc: [3, 0, 6], weight: 2,
    blurb: "Homes with the sick are shut: disease stays inside them, and so do the sick, untended.",
    unlock: (s) => (s.villagers.filter((v) => v.body?.ill.length).length >= 2 ? null : "Needs two sick."),
  },
  {
    id: "cull", name: "Cull the lame", hope: -15, disc: [15, 2, 25], weight: 4,
    blurb: "The disabled are sent into the fog with a day's food. Mouths saved; the town learns what it is.",
    unlock: (s) => (s.villagers.filter((v) => (v.body?.amputee ?? 0) > 0).length >= 3 ? null : "Needs three disabled."),
  },
  {
    id: "nightwatch", name: "Night watch by torchlight", hope: 2, disc: [0, 0, 0], weight: 0,
    blurb: "Four torches a night along the perimeter: stalkers keep off lit ground. Smoke rises.",
    unlock: () => null,
  },
];

/** Enacts a decree. There is no repeal. */
export function enactDecree(s: GameState, id: string): string | null {
  const d = DECREES.find((x) => x.id === id);
  if (!d) return "No such decree.";
  if (s.decrees?.includes(id)) return "Already the law.";
  const why = d.unlock(s);
  if (why) return why;
  (s.decrees ??= []).push(id);
  s.mood = clamp(s.mood + d.hope, 0, 100);
  for (const v of s.villagers) v.disc = clamp((v.disc ?? 0) + d.disc[factionOf(v)], 0, 100);
  if (id === "shifts") (s.policy ??= defaultPolicy()).shift = 18;
  if (id === "protein") {
    butcherDead(s);
    // The faithful do not wait: if they are a third of the town, they make their demand at once.
    const faith = factionDiscontent(s)[2];
    if (faith.share > 0.3 && s.society && !s.society.ultimatum) {
      s.society.ultimatum = { faction: 2, demand: "repeal", until: s.time + 48 * 60 };
      log(s, "The Faith faction demands the decree be repealed — which cannot be done. 48 hours.", "bad");
    }
  }
  if (id === "burnhouses") burnAHouse(s);
  if (id === "cull") cullLame(s);
  log(s, `Decree: ${d.name}. It cannot be undone.`, "bad");
  return null;
}

export function defaultPolicy() {
  // Homes heated to ten degrees: warm sleep (the gain starts at 10) for a fifth less fuel than twelve.
  return { heat: 10, ration: 1, freshSoil: false, coalFirst: false, shift: 14 };
}

/** Emergency protein: every unburied body into the meat store; the eaters marked. */
function butcherDead(s: GameState) {
  const n = s.corpses?.length ?? 0;
  s.res.meat += n * 30;
  s.corpses = [];
  for (const v of s.villagers) {
    v.happy = Math.max(0, v.happy - 30);
    v.traits ??= [];
    if (!v.traits.includes("hollow")) v.traits.push("hollow");
  }
  log(s, `${n} of the dead are butchered: ${n * 30} kg of meat.`, "bad");
}

function burnAHouse(s: GameState) {
  const homes = s.structures.filter((st) => st.type === "house" && !st.buildUntil).sort((a, b) => a.level - b.level);
  const h = homes[0];
  if (!h) return;
  const timber = h.w * h.h * 4 * 40; // kg: about 40 kg of timber per m² of house
  const units = timber / 10;
  const mc = s.stores?.woodMC ?? 0.3;
  if (s.stores) s.stores.woodMC = (mc * s.res.wood + 0.45 * units) / Math.max(1, s.res.wood + units);
  s.res.wood += units;
  for (const v of s.villagers) if (v.house === h.id) v.house = s.structures.find((st) => st.type === "townhall")?.id ?? null;
  s.structures = s.structures.filter((st) => st !== h);
  log(s, `A home at ${h.x},${h.y} is pulled down for its timber: ${Math.round(units)} wood.`, "bad");
}

function cullLame(s: GameState) {
  const lame = s.villagers.filter((v) => (v.body?.amputee ?? 0) > 0 && !v.champion);
  for (const v of lame) {
    s.res.meals = Math.max(0, s.res.meals - 1);
    s.villagers = s.villagers.filter((q) => q !== v);
    for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
  }
  if (lame.length) recognize(s, -3 * lame.length, "the lame sent away");
  log(s, `${lame.length} are sent into the fog.`, "bad");
}

export type { Corpse };
