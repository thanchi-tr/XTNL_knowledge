import { DAY_MIN, type FallCause, type GameState } from "./types";
import { WATCH_REST } from "./menace";
import type { Moment } from "./moments";
import type { Peril, WinterAudit } from "./psyche";

/**
 * The run's log (design M1, "Honest endings"): what the town's report is
 * written from when it falls. A page each game dawn — people, food-days,
 * fuel-days, Hope, sanity and the land's budget — the dead by what killed
 * them, those who walked out, every wave and how it went, the first time
 * each thing went wrong, and what the player's study gave the town.
 *
 * Kept cheap and small: one sample a day, thinned by half past
 * SAMPLES_MAX; WAVES_MAX waves; tallies otherwise. It is saved with the
 * town. An older save starts its log on the day it is loaded, with what it
 * had already counted (deaths, raids won) kept apart as `before`.
 *
 * Nothing here is read by the simulation: it only records, and stops at
 * the fall — a town rebuilt from its ruins does not change its report. The
 * sums and the lesson are the report's (runReport, lessonOf).
 */

/** What killed someone, as the report groups it. */
export type DeathCause = "battle" | "cold" | "hunger" | "thirst" | "sickness" | "overwork" | "minds" | "mutiny" | "other";
export const DEATH_CAUSES: readonly DeathCause[] = ["battle", "cold", "hunger", "thirst", "sickness", "overwork", "minds", "mutiny", "other"];
export const CAUSE_LABEL: Record<DeathCause, string> = {
  battle: "battle", cold: "cold", hunger: "hunger", thirst: "thirst", sickness: "sickness", overwork: "overwork", minds: "broken minds", mutiny: "the mutiny", other: "other",
};

/** A forecast under this many days lights the Peril meter; under PERIL_ALARM it turns red, and crossing it is an alarm. */
export const PERIL_SHOW = 5;
export const PERIL_ALARM = 3;
/** What one person eats in a day, as ./body canTakeIn counts it. */
export const DAY_KCAL = 2500;
/** Dawn samples kept; past it, every second one goes and the town is sampled half as often. */
export const SAMPLES_MAX = 200;
/** Waves kept; past it, the oldest goes. */
export const WAVES_MAX = 60;

/** One dawn: the five series the report draws, and the land's budget. Days are capped at 99 (the save holds no Infinity). */
export interface Dawn {
  d: number;
  pop: number;
  foodDays: number;
  fuelDays: number;
  hope: number;
  sanity: number;
  budget: number;
}

/** A wave's grade, from the harm it did (./nemesis scoreWave): S nothing to speak of, C a heavy blow. */
export type Grade = "S" | "A" | "B" | "C";
export interface WaveNote {
  d: number;
  name: string;
  /** Broken; withdrew having taken its target; the hall fell and the town lived; the town was sacked. */
  outcome: "broken" | "withdrew" | "hall" | "sacked";
  grade: Grade;
  slain: number;
  /** People lost to it: in the fight, and when the hall fell. */
  lost: number;
  /** When the hall fell: the people still in the town after it. */
  left?: number;
}

export interface StudyGiven {
  /** Right answers settled into goods (./tithes). */
  passes: number;
  /** Supply carts by tier (./knowledge TIERS). */
  carts: number[];
  /** Everything study paid in, by good. */
  goods: Record<string, number>;
  heirlooms: number;
  reqs: number;
  charts: number;
}

export interface RunLog {
  v: 1;
  /** The day the log began: the founding day, or the day an older save was first loaded. */
  from: number;
  /** What an older save had counted before the log began, not broken down. */
  before?: { deaths: number; raidsWon: number };
  samples: Dawn[];
  /** Days between samples: 1, doubled each time the samples are thinned. */
  every: number;
  deaths: Partial<Record<DeathCause, number>>;
  walkouts: number;
  waves: WaveNote[];
  firsts: {
    death?: { d: number; cause: DeathCause; why: string };
    /** The day of each cause's first death. */
    cause?: Partial<Record<DeathCause, number>>;
    walkout?: { d: number; hope: number; sanity: number };
    fuelOut?: number;
    /** The first day the fuel ran out in winter, when water is melted snow. */
    winterFuelOut?: number;
    foodOut?: number;
    /** The first peril alarm: what it said. */
    peril?: { d: number; what: string };
  };
  /** The day the current empty stretch began, while the store is empty. */
  out?: { fuel?: number | null; food?: number | null };
  /** Dawns the land's budget stood at 2 or more, and its highest. */
  land?: { days: number; peak: number };
  study: StudyGiven;
  /** The last winter audit (./psyche winterAudit). */
  audit?: WinterAudit;
}

const dayOf = (s: GameState) => Math.floor(s.time / DAY_MIN) + 1;

export function newRunlog(s: GameState): RunLog {
  const raids = s.stats?.raidsWon ?? 0;
  return {
    v: 1, from: dayOf(s), samples: [], every: 1, deaths: {}, walkouts: 0, waves: [], firsts: {},
    study: { passes: 0, carts: [0, 0, 0, 0, 0], goods: {}, heirlooms: 0, reqs: 0, charts: 0 },
    ...(s.deaths || raids ? { before: { deaths: s.deaths, raidsWon: raids } } : {}),
  };
}

/**
 * The town's log, begun if it has none. The tick reads the stores every
 * hour and the first study settles at once on opening, so a log is begun
 * before a first death: `before` then holds only what an older save brought.
 */
export const runlogOf = (s: GameState): RunLog => (s.runlog ??= newRunlog(s));

// ── What killed them ──────────────────────────────────────

/**
 * A death's reason (the `why` every killing passes to ./recognition onDeath)
 * in the report's groups. Order matters: "died of thirst" is thirst and
 * "died of their injuries" battle before "died of …" is an illness.
 */
const CLASSES: [DeathCause, RegExp][] = [
  ["mutiny", /mutiny/i],
  ["minds", /murder|despair/i],
  ["overwork", /worked past/i],
  ["thirst", /thirst/i],
  ["hunger", /starv|wasted|hunger/i],
  ["battle", /defending|at the gate|injur|hall fell|bled/i],
  ["cold", /froze|frozen|cold|blizzard/i],
  ["sickness", /died of|fumes|amputation|poison|scurvy/i],
];
export const causeOf = (why: string): DeathCause => CLASSES.find(([, re]) => re.test(why))?.[0] ?? "other";

/** A death, as ./recognition onDeath hears of it. */
export function noteDeath(s: GameState, why: string) {
  if (s.fallen) return;
  const rl = runlogOf(s);
  const cause = causeOf(why);
  const d = dayOf(s);
  rl.deaths[cause] = (rl.deaths[cause] ?? 0) + 1;
  rl.firsts.death ??= { d, cause, why };
  (rl.firsts.cause ??= {})[cause] ??= d;
}

/** Someone who walked out into the fog (./psyche): Hope and their sanity when they went, the first time. */
export function noteWalkout(s: GameState, sanity: number) {
  if (s.fallen) return;
  const rl = runlogOf(s);
  rl.walkouts += 1;
  rl.firsts.walkout ??= { d: dayOf(s), hope: Math.round(s.mood), sanity: Math.round(sanity) };
}

/** The harm a wave did (./nemesis scoreWave's reward, 0–1) as a grade. */
export const gradeOf = (harm: number): Grade => (harm < 0.05 ? "S" : harm < 0.25 ? "A" : harm < 0.5 ? "B" : "C");

/**
 * A wave over (./combat), by its party's name. When the hall fell, `left` is
 * who was still in the town after it. `harm` is what the land scored the
 * wave; a band out of the fog that was never scored is graded on the people
 * it cost, a quarter each, as scoreWave counts them.
 */
export function noteWave(s: GameState, name: string, outcome: WaveNote["outcome"], slain: number, lost: number, left?: number, harm?: number) {
  if (s.fallen) return;
  const rl = runlogOf(s);
  const hall = outcome === "hall" || outcome === "sacked";
  const h = harm ?? (hall ? 1 : Math.min(1, 0.25 * lost));
  rl.waves.push({ d: dayOf(s), name, outcome, grade: gradeOf(h), slain, lost, ...(hall && left !== undefined ? { left } : {}) });
  if (rl.waves.length > WAVES_MAX) rl.waves.splice(0, rl.waves.length - WAVES_MAX);
}

// ── What study gave ───────────────────────────────────────

/**
 * Every moment pushed (./moments) passes through here: carts, tithes,
 * requisitions, heirlooms and star charts are tallied, since the moments
 * themselves are few and short-lived. A tithe's title leads with its count
 * of right answers, as the Delivery reads it.
 */
export function noteMoment(s: GameState, m: Moment) {
  if (s.fallen || (m.kind !== "cart" && m.kind !== "tithe" && m.kind !== "req" && m.kind !== "heirloom" && m.kind !== "chart")) return;
  const st = runlogOf(s).study;
  if (m.kind === "heirloom") {
    st.heirlooms += 1;
    return;
  }
  if (m.kind === "cart") st.carts[Math.max(0, Math.min(st.carts.length - 1, m.tier ?? 0))] += 1;
  else if (m.kind === "tithe") st.passes += parseInt(m.title, 10) || 0;
  else if (m.kind === "req") st.reqs += 1;
  else st.charts += m.goods?.starchart ?? 0;
  for (const [k, n] of Object.entries(m.goods ?? {})) if (n > 0) st.goods[k] = (st.goods[k] ?? 0) + n;
}

// ── The hour and the dawn ─────────────────────────────────

/**
 * The hour's stores (./psyche perilAlarms): the first time the fuel runs out
 * (under one unit) or the food (under a day's eating for the town), and the
 * day the present empty stretch began.
 */
export function noteHour(s: GameState, fuel: number, foodDays: number, winter: boolean) {
  const rl = runlogOf(s);
  const d = dayOf(s);
  const out = (rl.out ??= {});
  if (fuel < 1) {
    out.fuel ??= d;
    rl.firsts.fuelOut ??= d;
    if (winter) rl.firsts.winterFuelOut ??= d;
  } else out.fuel = null;
  if (foodDays < 1) {
    out.food ??= d;
    rl.firsts.foodOut ??= d;
  } else out.food = null;
}

/** The first peril alarm of the run (./psyche perilAlarms). */
export function notePeril(s: GameState, what: string) {
  runlogOf(s).firsts.peril ??= { d: dayOf(s), what };
}

const days = (n: number) => Math.round(Math.min(99, Math.max(0, n)) * 10) / 10;

/** The dawn's page: one sample a day, thinned by half once there are SAMPLES_MAX. */
export function noteDawn(s: GameState, p: Peril, budget: number) {
  const rl = runlogOf(s);
  const d = dayOf(s);
  if (budget >= 2) {
    const l = (rl.land ??= { days: 0, peak: 0 });
    l.days += 1;
    l.peak = Math.max(l.peak, Math.round(budget * 100) / 100);
  }
  if ((d - rl.from) % rl.every !== 0 || rl.samples.some((x) => x.d === d)) return;
  rl.samples.push({ d, pop: s.villagers.length, foodDays: days(p.foodDays), fuelDays: days(p.fuelDays), hope: Math.round(s.mood), sanity: Math.round(p.sanity), budget: Math.round(budget * 100) / 100 });
  if (rl.samples.length >= SAMPLES_MAX) {
    rl.samples = rl.samples.filter((_, i) => i % 2 === 0);
    rl.every *= 2;
  }
}

// ── The report ────────────────────────────────────────────

const sum = (r: Partial<Record<string, number>>) => Object.values(r).reduce<number>((a, n) => a + (n ?? 0), 0);

export interface Lesson {
  /** Which rule matched, 1–7 in the order they are tried. */
  rule: number;
  text: string;
}

/**
 * The one thing to do differently, from the first rule the run's tallies
 * match. Each is tied to a count the log kept, and says it, so a lesson
 * never blames what did not happen.
 */
export function lessonOf(s: GameState): Lesson {
  const rl = s.runlog ?? newRunlog(s);
  const dead = sum(rl.deaths);
  const n = (c: DeathCause) => rl.deaths[c] ?? 0;
  const winterOut = rl.firsts.winterFuelOut;
  if (n("thirst") >= 3 && winterOut !== undefined) {
    const a = rl.audit;
    return {
      rule: 1,
      text: `Winter water is snow melted by fuel: enter winter with ${a ? `${Math.ceil(a.need)} fuel` : "ten days of fuel"}, snow-melt included. ` +
        `The fuel ran out on day ${winterOut}${a ? ` (the autumn audit counted ${Math.round(a.hold)} held against ${Math.ceil(a.need)} needed)` : ""}, and ${n("thirst")} died of thirst.`,
    };
  }
  if (rl.walkouts > 0 && rl.walkouts * 2 >= dead) {
    const w = rl.firsts.walkout;
    return {
      rule: 2,
      text: `${rl.walkouts} walked out${w ? `, the first on day ${w.d} while Hope read ${w.hope}%` : ""}: sanity holds people, not Hope. ` +
        "A mind below 35 can break and walk; warm sleep, hot meals and company build it back.",
    };
  }
  if (n("hunger") >= 3) {
    const low = rl.samples.reduce<Dawn | null>((a, x) => (x.pop > 0 && (!a || x.foodDays < a.foodDays) ? x : a), null);
    return {
      rule: 3,
      text: `${n("hunger")} died of hunger. Keep food-days above ${PERIL_SHOW}: a week of food in store for everyone${low ? `; this town's fell to ${low.foodDays} on day ${low.d}` : ""}.`,
    };
  }
  if (n("overwork") >= 2) {
    return {
      rule: 4,
      text: `${n("overwork")} worked past their strength. Shift length: a ${s.policy?.shift ?? 14}-hour day wears people down; shorten it, or give fewer of them hard work.`,
    };
  }
  if (dead > 0 && n("battle") >= 0.4 * dead) {
    return {
      rule: 5,
      text: `${n("battle")} of ${dead} deaths came in battle. The night watch sleeps from ${WATCH_REST[0]} to ${WATCH_REST[1]}: post troops for the day as well, towers where the waves aim.`,
    };
  }
  if ((rl.land?.days ?? 0) >= 3) {
    return {
      rule: 6,
      text: `Overdue cards fed the land: ×${rl.land!.peak.toFixed(1)} for ${rl.land!.days} days. Each Field you finish takes a tenth off its budget that day.`,
    };
  }
  const broken = rl.waves.filter((w) => w.outcome === "broken").length;
  return {
    rule: 7,
    text: `The land grew faster than the town: ${rl.waves.length} wave${rl.waves.length === 1 ? "" : "s"} came and ${broken} ${broken === 1 ? "was" : "were"} broken. ` +
      "Every tree felled and fire lit draws its answer; kept study calms it, and each Field you finish takes a tenth off its budget.",
  };
}

/** One line of the turn: something that went wrong, and its day. */
interface Turn {
  d: number;
  text: string;
}

/** "first thirst death": the words for a cause's first death. */
const FIRST: Record<DeathCause, string> = {
  battle: "first death in battle", cold: "first death of cold", hunger: "first death of hunger", thirst: "first thirst death", sickness: "first death of sickness",
  overwork: "first worked to death", minds: "first death of a broken mind", mutiny: "first death in the mutiny", other: "first death",
};

/**
 * The turn: how the end began, from the run's firsts. The largest toll's
 * first death, what ran out before it (fuel for the cold and the thirsty,
 * food for the hungry), and the day the doom clock or the first alarm
 * started — in the order they happened.
 */
function turnOf(rl: RunLog): string | null {
  const causes = DEATH_CAUSES.filter((c) => (rl.deaths[c] ?? 0) > 0).sort((a, b) => (rl.deaths[b] ?? 0) - (rl.deaths[a] ?? 0));
  const top = causes[0];
  const out: Turn[] = [];
  if (top && rl.walkouts > (rl.deaths[top] ?? 0) && rl.firsts.walkout) out.push({ d: rl.firsts.walkout.d, text: `first walk-out on day ${rl.firsts.walkout.d}` });
  else if (top) {
    const d = rl.firsts.cause?.[top];
    if (d !== undefined) out.push({ d, text: `${FIRST[top]} on day ${d}` });
    const fuel = top === "thirst" ? rl.firsts.winterFuelOut ?? rl.firsts.fuelOut : top === "cold" ? rl.firsts.fuelOut : undefined;
    if (fuel !== undefined) out.push({ d: fuel, text: `fuel ran out on day ${fuel}` });
    if (top === "hunger" && rl.firsts.foodOut !== undefined) out.push({ d: rl.firsts.foodOut, text: `food ran out on day ${rl.firsts.foodOut}` });
  } else if (rl.firsts.walkout) out.push({ d: rl.firsts.walkout.d, text: `first walk-out on day ${rl.firsts.walkout.d}` });
  if (rl.firsts.peril) out.push({ d: rl.firsts.peril.d, text: `the first alarm (${rl.firsts.peril.what.toLowerCase()}) on day ${rl.firsts.peril.d}` });
  if (!out.length) return null;
  const text = out.sort((a, b) => a.d - b.d).map((t) => t.text).join("; ");
  return text[0].toUpperCase() + text.slice(1) + ".";
}

export interface RunReport {
  cause: FallCause | null;
  day: number;
  /** "Dwindled on day 31". */
  headline: string;
  /** The rule that ended it, with the town's numbers. */
  why: string;
  turn: string | null;
  samples: Dawn[];
  /** The toll, largest first: each cause of death, and those who walked out. */
  toll: { label: string; n: number }[];
  deaths: number;
  walkouts: number;
  /** Deaths an older save had counted before its log began. */
  before: number;
  waves: { all: number; broken: number; withdrew: number; hall: number; sacked: number; grades: Record<Grade, number>; last: WaveNote[] };
  study: StudyGiven;
  lesson: Lesson;
  from: number;
}

/** The report of a fallen town (./components/town/RunReport), from its log and how it stands. Reads only. */
export function runReport(s: GameState): RunReport {
  const rl = s.runlog ?? newRunlog(s);
  const day = s.fallen?.day ?? dayOf(s);
  const cause = s.fallCause ?? null;
  const pop = s.villagers.length;
  const peak = Math.max(s.stats?.peakPop ?? 0, pop);
  const husk = Math.max(2, Math.floor(peak / 3));
  const lastWave = rl.waves[rl.waves.length - 1];
  const [headline, why] = ((): [string, string] => {
    switch (cause) {
      case "dwindled":
        return [`Dwindled on day ${day}`, pop <= husk
          ? `Three days with ${husk} people or fewer, of ${peak} at its height: a camp of survivors, not a town.`
          : `Three days at ${pop} of ${peak} people, with nothing in store to feed or warm one more: a starving camp, not a town.`];
      case "abandoned":
        return [`Abandoned on day ${day}`, "Three days with Hope at 5% or less: the survivors packed what they could carry and left."];
      case "deposed":
        return [`Deposed on day ${day}`, "The mutiny won: the town's own people drove its steward out."];
      case "sacked":
        return [`Sacked on day ${day}`, lastWave?.outcome === "sacked"
          ? `The hall fell to the ${lastWave.name} with 3 or fewer to hold it, and the raiders took everyone left: ${lastWave.lost} lost to that wave.`
          : "The hall fell with 3 or fewer to hold it, and the raiders took everyone left."];
      case "emptied":
        return [`Emptied on day ${day}`, "No one lived in the town for a whole day, and it had never grown past five."];
      default:
        return [`The town fell on day ${day}`, "The hall fell."];
    }
  })();
  const toll = DEATH_CAUSES.filter((c) => (rl.deaths[c] ?? 0) > 0).map((c) => ({ label: CAUSE_LABEL[c], n: rl.deaths[c] ?? 0 }));
  if (rl.walkouts) toll.push({ label: "walked out", n: rl.walkouts });
  toll.sort((a, b) => b.n - a.n);
  const grades: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0 };
  for (const w of rl.waves) grades[w.grade] += 1;
  const count = (o: WaveNote["outcome"]) => rl.waves.filter((w) => w.outcome === o).length;
  return {
    cause, day, headline, why, turn: turnOf(rl), samples: rl.samples, toll, deaths: sum(rl.deaths), walkouts: rl.walkouts, before: rl.before?.deaths ?? 0,
    waves: { all: rl.waves.length, broken: count("broken"), withdrew: count("withdrew"), hall: count("hall"), sacked: count("sacked"), grades, last: rl.waves.slice(-5).reverse() },
    study: rl.study, lesson: lessonOf(s), from: rl.from,
  };
}
