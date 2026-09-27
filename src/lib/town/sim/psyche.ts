import { UTILITIES } from "./catalog";
import { byId, clock, log } from "./state";
import { air } from "./weather";
import { center, rng } from "./world";
import { emit, noteLoss } from "./aggro";
import { bodyOf } from "./body";
import { kmod } from "./knowledge";
import { stats } from "./stats";
import type { Corpse, GameState, Society, SocietyState, Villager } from "./types";

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
  const town = Math.min(1, GRIEF_TOWN / Math.max(1, s.villagers.length));
  const mates = dead.house == null ? 0 : s.villagers.filter((v) => v !== dead && v.house === dead.house).length;
  const house = Math.min(1, GRIEF_HOUSE / Math.max(1, mates));
  for (const v of s.villagers) {
    if (v === dead) continue;
    const kin = dead.house != null && v.house === dead.house;
    v.happy = Math.max(0, v.happy - (kin ? 15 * house : 3 * town) * (v.traits?.includes("pious") ? 0.8 : 1) * (1 - kmod(s, "COMPASSION")));
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
  if (s.festivalUntil > s.time) d += 3;
  const util = (home?.utilities ?? []).reduce((a, id) => a + (UTILITIES.find((u) => u.id === id)?.happy ?? 0), 0);
  d += util;
  if (home?.breakUntil && home.breakUntil > s.time) d += 3;
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

function breakDown(s: GameState, v: Villager, r: () => number) {
  const S = v.happy;
  const kind = S < 8 ? roll(EXTREME, r) : S < 20 ? roll(MAJOR, r) : roll(MINOR, r);
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
      log(s, `${v.name} walks out into the fog with ${Math.round(food)} meals and does not come back.`, "bad");
      break;
    }
    case "arson": {
      const lost = Math.round(s.res.wood * 0.3);
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
      log(s, `${v.name} smashes ${n || "no"} tool${n === 1 ? "" : "s"} in a rage.`, "bad");
      break;
    }
    case "homicide": {
      const victim = s.villagers.find((o) => o !== v && o.house === v.house) ?? s.villagers.find((o) => o !== v);
      if (victim) {
        s.villagers = s.villagers.filter((q) => q !== victim);
        for (const st of s.structures) st.workers = st.workers.filter((id) => id !== victim.id);
        s.deaths += 1;
        noteLoss(s);
        const [x, y] = byId(s, victim.house) ? center(byId(s, victim.house)!) : [40, 30];
        addCorpse(s, victim.name, x, y);
        s.hopeEvents = (s.hopeEvents ?? 0) - 8;
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
    b.spoiledMeals = 0;
    b.meals = 0;
    if (v.broken && v.broken.until <= s.time) v.broken = null;
    if (v.happy < 35 && !v.broken) {
      const lam = 0.004 * Math.exp(0.12 * (35 - v.happy)) * (1 - kmod(s, "MIND"));
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
  dH += s.hopeEvents ?? 0;
  s.hopeEvents = 0;
  if (s.festivalUntil > s.time) dH += 6 / 12;
  // Faith (ideas in Faith-heavy Fields) lifts Hope each hour; neglect of them drags it.
  dH += 0.5 * kmod(s, "FAITH");
  for (const d of s.debuffs) dH += d.moodPerHour;
  s.mood = clamp(s.mood + dH, 0, 100);
}

function discontentHourly(s: GameState) {
  const ration = s.policy?.ration ?? 1;
  const shift = s.policy?.shift ?? 14;
  for (const v of s.villagers) {
    factionOf(v);
    let d = ((10 * (1 - ration)) / 24 + (1.5 * Math.max(0, shift - 10)) / 24) * (1 - kmod(s, "SELF_RESPECT")) - (0.03 * (v.disc ?? 0)) / 24;
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
  if (soc.despairHours >= 72 && !s.fallen) {
    s.fallCause = "abandoned";
    s.fallen = { at: s.time, day: clock(s.time).day };
    log(s, "Three days without hope. The survivors pack what they can carry and leave. The town is abandoned.", "bad");
  }
  // Dwindled: a town that grew past five and has lain at two people or fewer for three days is a
  // camp of survivors, not a town. They can stay and rebuild; the tally stops here.
  const t = stats(s);
  t.peakPop = Math.max(t.peakPop ?? 0, s.villagers.length);
  soc.fewHours = t.peakPop >= 6 && s.villagers.length <= 2 ? (soc.fewHours ?? 0) + 1 : 0;
  if (soc.fewHours >= 72 && !s.fallen) {
    s.fallCause = "dwindled";
    s.fallen = { at: s.time, day: clock(s.time).day };
    log(s, "Three days with two people or fewer left. What stands is a camp of survivors, not a town. The town has dwindled away.", "bad");
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
        s.res.wood -= lost;
        log(s, `Sabotage in the night: ${lost} wood burnt.`, "bad");
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
          const dead = s.villagers.filter((v) => factionOf(v) === worst).slice(0, Math.ceil(rebels / 2));
          for (const v of dead) {
            s.villagers = s.villagers.filter((q) => q !== v);
            for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
            s.deaths += 1;
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
  return { heat: 12, ration: 1, freshSoil: false, coalFirst: false, shift: 14 };
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
  const lame = s.villagers.filter((v) => (v.body?.amputee ?? 0) > 0);
  for (const v of lame) {
    s.res.meals = Math.max(0, s.res.meals - 1);
    s.villagers = s.villagers.filter((q) => q !== v);
    for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
  }
  log(s, `${lame.length} are sent into the fog.`, "bad");
}

export type { Corpse };
