import { MONSTERS, partyName, statsAt } from "./bestiary";
import { clock, log } from "./state";
import { center } from "./world";
import { air } from "./weather";
import { chooseTarget } from "./breach";
import { defencePower } from "./combat";
import { CHANNELS, STIMULI, Terrain, type Aggro, type Channel, type GameState, type IncomingMonster, type MonsterKind, type Stimulus } from "./types";

/**
 * Ecological vengeance (design §2). Every productive act writes a stimulus
 * to the hour's ledger: canopy felled, smoke, strike energy through the
 * rock, blood and rot, leaked heat, food held, people. On the hour the
 * ledger folds into four channels — kinetic breachers, burrowers,
 * weather-riders, infiltrators — each with a decaying hot reservoir and a
 * permanent scar. The director turns the total into a daily budget, fills a
 * purse, and spends it on waves sized against the town's defence by
 * Lanchester's square law.
 */

/** Stimulus → channel weights (§2.1), rows in STIMULI order, columns K, B, Wr, I. */
export const WEIGHTS: Record<Stimulus, [number, number, number, number]> = {
  can: [0.02, 0, 0.005, 0.002],
  smk: [0.3, 0, 0.15, 0.4],
  ac: [0.5, 6.0, 0, 0],
  bio: [0.03, 0.01, 0.05, 0.1],
  heat: [0.5, 0, 4.0, 0.2],
  food: [0, 0.02, 0, 0.05],
  pop: [0.004, 0.002, 0.004, 0.003],
};
export const STIMULUS_LABEL: Record<Stimulus, string> = {
  can: "Canopy felled (m²)", smk: "Smoke (kg)", ac: "Strike noise (MJ)", bio: "Blood & rot (L)", heat: "Heat leaked (MWh)", food: "Food held (t)", pop: "People",
};
export const CHANNEL_LABEL: Record<Channel, string> = { K: "Siege beasts", B: "Burrowers", Wr: "Blizzard stalkers", I: "Spore swarms" };

const PHI = 0.15;
const HALF_LIFE_H = 72;
export const A_REF = 20;
const SEASON_BUDGET = { spring: 0.8, summer: 0.6, autumn: 1.1, winter: 1.6 } as const;
/** Seasonal allocation σ_j (§2.6). */
export const SEASON_SIGMA: Record<string, [number, number, number, number]> = {
  spring: [1.0, 1.2, 0, 1.4],
  summer: [1.2, 0.8, 0, 1.0],
  autumn: [1.3, 1.0, 0.4, 0.8],
  winter: [0.8, 0.4, 2.5, 0.2],
};
/** Point cost of one unit at level 1, by archetype. */
const UNIT_COST: Record<Channel, number> = { K: 12, B: 10, Wr: 14, I: 6 };
/** What each archetype sends, by level band. */
export const ROSTER: Record<Channel, { kind: MonsterKind; min: number }[]> = {
  K: [{ kind: "ogre", min: 1 }, { kind: "troll", min: 4 }, { kind: "cyclops", min: 9 }, { kind: "oni", min: 14 }, { kind: "gashadokuro", min: 24 }],
  B: [{ kind: "ghoul", min: 1 }, { kind: "jiangshi", min: 5 }, { kind: "jorogumo", min: 10 }, { kind: "serpent", min: 16 }],
  Wr: [{ kind: "wendigo", min: 1 }, { kind: "yurei", min: 4 }, { kind: "wraith", min: 8 }, { kind: "banshee", min: 12 }],
  I: [{ kind: "wisp", min: 1 }, { kind: "kitsune", min: 12 }],
};

export function newAggro(): Aggro {
  return {
    hot: [0, 0, 0, 0], scar: [0, 0, 0, 0], ledger: Object.fromEntries(STIMULI.map((k) => [k, 0])) as Aggro["ledger"],
    daily: [0, 0, 0, 0], purse: 0, trigger: 0, lastWaveAt: 0, losses: [], past: [], deathMap: {},
  };
}
export const aggroOf = (s: GameState): Aggro => (s.aggro ??= newAggro());

/**
 * Writes a stimulus to the ledger. Near a lair it counts up to three times
 * over: `1 + 2·exp(−d/60 m)` (§2.1).
 */
export function emit(s: GameState, k: Stimulus, amount: number, x?: number, y?: number) {
  if (!(amount > 0)) return;
  const ag = aggroOf(s);
  let w = 1;
  if (x !== undefined && y !== undefined && s.lairs?.length) {
    let d = Infinity;
    for (const l of s.lairs) d = Math.min(d, Math.hypot(l.x + l.w / 2 - x, l.y + l.h / 2 - y) * 2);
    w = 1 + 2 * Math.exp(-d / 60);
  }
  ag.ledger[k] += amount * w;
}

/** A villager lost: the director eases, a little, for a few days. */
export function noteLoss(s: GameState) {
  aggroOf(s).losses.push(s.time);
}

/** Baseline hostility of the land: grows with the town's age whatever it does. */
export const aFloor = (days: number) => 2 * Math.pow(1 + days / 7, 1.2);

/** Each channel's aggro now. */
export function channelAggro(s: GameState): number[] {
  const ag = aggroOf(s);
  const floor = aFloor(s.time / 1440);
  return CHANNELS.map((_, j) => ag.hot[j] + ag.scar[j] + floor);
}

/** Tiles occupied or paved: the town's footprint. */
function footprint(s: GameState): number {
  let n = 0;
  for (const st of s.structures) n += st.w * st.h;
  const t = s.map.terrain;
  for (let i = 0; i < t.length; i++) if (t[i] === Terrain.Pavement) n++;
  return n;
}

/** The daily threat budget (§2.3). */
export function dailyBudget(s: GameState): number {
  const A = channelAggro(s).reduce((a, b) => a + b, 0);
  const N = s.villagers.length;
  const season = clock(s.time).season;
  return 3 * Math.pow(1 + A / A_REF, 1.35) * Math.pow(N, 0.8) * (Math.sqrt(footprint(s)) / 10) * SEASON_BUDGET[season];
}

/** How hard the next wave is aimed, as a share of the town's defence (§2.3). */
export function rho(s: GameState): number {
  const ag = aggroOf(s);
  const days = s.time / 1440;
  const A = channelAggro(s).reduce((a, b) => a + b, 0);
  const recent = ag.losses.filter((t) => s.time - t <= 3 * 1440).length;
  const relief = Math.min(1, recent / Math.max(4, 0.15 * s.villagers.length));
  return 0.45 + 0.12 * Math.log(1 + days / 5) + 0.05 * Math.min(8, A / A_REF) - 0.25 * relief;
}

/**
 * On the hour: the ledger folds into the channels, the purse fills, and a
 * wave goes out when the purse has reached its trigger (or a channel has
 * spiked, or a guardian has woken).
 */
export function aggroHourly(s: GameState, r: () => number) {
  const ag = aggroOf(s);
  // Food held and people present are standing stimuli.
  const food = (["meals", "potato", "wheat", "barley", "corn", "bean", "rice", "fish", "meat"] as const).reduce((a, k) => a + s.res[k], 0);
  ag.ledger.food += food / 1000;
  ag.ledger.pop += s.villagers.length;
  const I = CHANNELS.map((_, j) => STIMULI.reduce((a, k) => a + WEIGHTS[k][j] * ag.ledger[k], 0));
  const decay = Math.exp(-Math.LN2 / HALF_LIFE_H);
  for (let j = 0; j < 4; j++) {
    ag.hot[j] = ag.hot[j] * decay + (1 - PHI) * I[j];
    ag.scar[j] += PHI * I[j];
    ag.daily[j] = ag.daily[j] * (23 / 24) + I[j];
  }
  for (const k of STIMULI) ag.ledger[k] = 0;
  const A = channelAggro(s);
  ag.past.push(A);
  if (ag.past.length > 7) ag.past.shift();
  ag.losses = ag.losses.filter((t) => s.time - t <= 3 * 1440);
  // The death map fades: half-life three days.
  const fade = Math.exp(-Math.LN2 / 72);
  for (const key of Object.keys(ag.deathMap)) {
    const v = ag.deathMap[+key] * fade;
    if (v < 0.05) delete ag.deathMap[+key];
    else ag.deathMap[+key] = v;
  }

  // The purse.
  const budget = dailyBudget(s);
  ag.purse += budget / 24;
  if (!ag.trigger) ag.trigger = (0.8 + r() * 0.8) * budget * 1.5;
  const grace = s.time < s.nextRaidAt;
  const spiked = ag.past.length >= 7 && A.some((a, j) => a - ag.past[0][j] >= 0.5 * A_REF);
  const due = ag.purse >= ag.trigger || spiked;
  if (!grace && due && !s.raid && s.time - ag.lastWaveAt >= 12 * 60) {
    launchWave(s, r, spiked ? A.findIndex((a, j) => a - ag.past[0][j] >= 0.5 * A_REF) : undefined);
  }
  weatherStalkers(s, r);
}

/** The next wave's trigger: what is left in the purse, and another 0.8–1.6 × a day and a half's budget. */
function nextTrigger(s: GameState, r: () => number): number {
  const ag = aggroOf(s);
  return ag.purse + (0.8 + r() * 0.8) * dailyBudget(s) * 1.5;
}

/** Softmax over channel aggro, weighted by the season, weather-riders only in a blizzard (§2.4). */
export function archetypeOdds(s: GameState): number[] {
  const A = channelAggro(s);
  const sig = SEASON_SIGMA[clock(s.time).season];
  const blizzard = air(s).vis < 50;
  // A zero season weight, or clear air for the stalkers, rules a channel out altogether.
  const x = A.map((a, j) => (sig[j] === 0 || (j === 2 && !blizzard) ? null : (sig[j] * a) / 8));
  const live = x.filter((v): v is number => v !== null);
  if (!live.length) return [1, 0, 0, 0];
  const m = Math.max(...live);
  const e = x.map((v) => (v === null ? 0 : Math.exp(v - m)));
  const t = e.reduce((a, b) => a + b, 0) || 1;
  return e.map((v) => v / t);
}

/** Level a wave comes at on a channel (§2.4). */
export const waveLevel = (A: number, days: number) => Math.max(1, Math.round(1 + 0.35 * Math.sqrt(A) + 0.08 * days));

function pickKind(ch: Channel, level: number): MonsterKind {
  const band = ROSTER[ch].filter((u) => level >= u.min);
  return (band[band.length - 1] ?? ROSTER[ch][0]).kind;
}

/** Offensive power of a monster at a level: hp × dps. */
export function unitPi(kind: MonsterKind, level: number): number {
  const def = MONSTERS[kind];
  const { hp, dmg } = statsAt(def, level);
  return hp * (dmg / def.interval);
}

/**
 * A wave: the archetype drawn, the roster filled greedily to ρ·Π_town or
 * until the purse runs out, a target chosen by value over time-to-reach.
 */
export function launchWave(s: GameState, r: () => number, forced?: number) {
  const ag = aggroOf(s);
  const odds = archetypeOdds(s);
  let j = forced ?? 0;
  if (forced === undefined) {
    let pick = r();
    j = odds.findIndex((p) => (pick -= p) < 0);
    if (j < 0) j = odds.findIndex((p) => p > 0);
    if (j < 0) j = 0;
  }
  // A punitive wave on a channel the weather rules out goes to the siege beasts.
  if (j === 2 && air(s).vis >= 50) j = 0;
  const ch = CHANNELS[j];
  const A = channelAggro(s);
  const days = s.time / 1440;
  // The objective first, then the strength: sized against what defends that building (§2.3–2.4).
  let level = waveLevel(A[j], days);
  const probe = ch === "I" ? undefined : chooseTarget(s, ch, [{ kind: pickKind(ch, level), level, count: 1 }], r);
  // What went unspent last time makes this wave larger: up to half again (§2.3).
  const surplus = Math.min(0.5, Math.max(0, ag.purse - ag.trigger) / (3 * Math.max(1, dailyBudget(s))));
  const target = rho(s) * (1 + surplus) * Math.max(1, defencePower(s, probe?.target));
  // The level the channel calls for — stepped down while one of them alone would outmatch the target.
  while (level > 1 && unitPi(pickKind(ch, level), level) > target) level--;
  const cost = UNIT_COST[ch] * Math.pow(level, 1.5);
  if (ag.purse < cost) {
    ag.trigger = ag.purse + cost;
    return;
  }
  // Spores are not fought: they settle.
  if (ch === "I") return sporeEvent(s, r, level);
  const kind = pickKind(ch, level);
  const pi = unitPi(kind, level);
  let n = 0;
  let spent = 0;
  // Square law: n of them are n² as strong as one.
  while (n < 60 && spent + cost <= ag.purse && (n === 0 || (n + 1) * (n + 1) * pi <= target)) {
    n++;
    spent += cost;
  }
  ag.purse -= spent;
  ag.trigger = nextTrigger(s, r);
  ag.lastWaveAt = s.time;
  const party: IncomingMonster[] = [{ kind, level, count: n }];
  const aim = probe && probe.target ? probe : chooseTarget(s, ch, party, r);
  const arrivesAt = s.time + (ch === "B" ? 60 + Math.floor(r() * 120) : 120 + Math.floor(r() * 240));
  s.raid = {
    arrivesAt, party, side: aim.side, target: aim.target?.id, reach: 0, phase: "incoming",
    combatants: [], projectiles: [], clock: 0, nextId: 1, archetype: ch, origin: aim.origin,
  };
  const what = aim.target ? ` making for the ${aim.label}` : "";
  const heard = ch === "B" && aim.warned ? " The listening posts hear digging under the ground." : ch === "B" ? " Nobody hears them coming." : "";
  log(s, `The land answers — ${partyName(party)}${what}, in ${Math.round((arrivesAt - s.time) / 60)} hours.${heard}`, "bad");
  s.nextRaidAt = Math.max(s.nextRaidAt, s.time);
}

/**
 * Spore swarms (§2.5): a plume settles on the stores and the water. How much
 * sticks depends on how the food is kept.
 */
function sporeEvent(s: GameState, r: () => number, level: number) {
  const ag = aggroOf(s);
  // A plume costs the land a wave's worth: the whole trigger.
  const spend = Math.min(ag.purse, Math.max(ag.trigger, UNIT_COST.I * Math.pow(level, 1.5)));
  ag.purse -= spend;
  ag.trigger = nextTrigger(s, r);
  ag.lastWaveAt = s.time;
  const st = s.stores;
  if (!st) return;
  if (air(s).T < -5) {
    log(s, "A pale mist drifts in from the wilds, and dies in the frost.", "info");
    return;
  }
  const dose = Math.min(0.5, (0.15 * spend) / Math.max(1, dailyBudget(s)));
  const seal = storeSeal(s);
  st.contamFood = Math.min(1, st.contamFood + dose * (1 - seal));
  st.contamWater = Math.min(1, st.contamWater + dose * 1.0);
  log(s, `A sickly-sweet mist settles over the granary and the wells. Grain spoiled: ${Math.round(st.contamFood * 100)}%; water fouled: ${Math.round(st.contamWater * 100)}%.`, "bad");
}

/** How well the stores keep spores out: open sacks 0, a raised storehouse 0.6, a great one 0.9. */
export function storeSeal(s: GameState): number {
  const best = s.structures.filter((st) => st.type === "storehouse" && !st.buildUntil).reduce((a, st) => Math.max(a, st.level), 0);
  return best >= 10 ? 0.9 : best >= 5 ? 0.6 : best >= 1 ? 0.3 : 0;
}

/**
 * Blizzard stalkers (§2.5): in zero visibility, each hour, anyone out alone
 * and cold enough may be taken. Lights and company keep them off.
 */
function weatherStalkers(s: GameState, r: () => number) {
  const a = air(s);
  if (a.vis >= 50) return;
  const A = channelAggro(s)[2];
  const outdoors = s.villagers.filter((v) => v.body && v.body.at === null && !(v.deployedUntil && v.deployedUntil > s.time));
  for (const v of outdoors) {
    const b = v.body!;
    const [x, y] = v.scout ? [v.scout.x, v.scout.y] : [0, 0];
    const allies = v.scout ? 0 : outdoors.filter((o) => o !== v && o.work === v.work).length;
    const lit = v.scout ? (v.pack?.some((p) => p?.startsWith("torch:")) ? 0.8 : 0) : 0.5;
    const U = (1 / (1 + allies)) * Math.max(0, 37.5 - b.Tc) * (1 - lit);
    const lam = 0.02 * (A / A_REF) * U;
    if (lam > 0 && r() < 1 - Math.exp(-lam)) {
      s.villagers = s.villagers.filter((q) => q !== v);
      for (const st of s.structures) st.workers = st.workers.filter((id) => id !== v.id);
      s.deaths += 1;
      noteLoss(s);
      s.hopeEvents = (s.hopeEvents ?? 0) - 6;
      log(s, `${v.name} was taken in the blizzard${v.scout ? ` near ${Math.round(x)},${Math.round(y)}` : ""}. Nothing was found but tracks.`, "bad");
    }
  }
}

/**
 * What the next wave looks like, for the readout: purse against trigger,
 * the archetype odds, the level and the budget.
 */
export function threatForecast(s: GameState) {
  const ag = aggroOf(s);
  const A = channelAggro(s);
  const budget = dailyBudget(s);
  const perHour = budget / 24;
  const toGo = Math.max(0, ag.trigger - ag.purse);
  const hours = perHour > 0 ? toGo / perHour : Infinity;
  const grace = Math.max(0, (s.nextRaidAt - s.time) / 60);
  return {
    aggro: A,
    total: A.reduce((a, b) => a + b, 0),
    scar: ag.scar.reduce((a, b) => a + b, 0),
    daily: ag.daily,
    budget,
    purse: ag.purse,
    trigger: ag.trigger,
    hoursToWave: Math.max(hours, grace, Math.max(0, (ag.lastWaveAt + 12 * 60 - s.time) / 60)),
    odds: archetypeOdds(s),
    levels: A.map((a) => waveLevel(a, s.time / 1440)),
    rho: rho(s),
    defence: defencePower(s),
  };
}

/** A hostile death remembered at a tile (the death map, §5.6). */
export function rememberDeath(s: GameState, x: number, y: number) {
  const ag = aggroOf(s);
  const k = Math.floor(y) * 360 + Math.floor(x);
  ag.deathMap[k] = (ag.deathMap[k] ?? 0) + 1;
}

void center;
