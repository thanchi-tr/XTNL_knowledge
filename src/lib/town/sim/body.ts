import { CATALOG } from "./catalog";
import { byId, clock, log, residents } from "./state";
import { air } from "./weather";
import { FUEL_UNIT_KG, HEARTHS, isZone, ppm, stepZones, type Occ } from "./zones";
import { center, idx, inBounds, rng, warmAt, warmFields, type Warmth } from "./world";
import { emit, noteLoss } from "./aggro";
import { addCorpse, witnessDeath } from "./psyche";
import { RAW_FOODS, type Affliction, type Body, type GameState, type IllnessKind, type ResourceKey, type Structure, type Villager } from "./types";

/**
 * The body (design §1.2–1.7, §3.4, §7): a core-temperature differential
 * equation per villager, stepped every game minute — metabolic heat against
 * dry heat loss through tissue, clothing and the air's boundary layer, plus
 * breath and sweat — with glycogen and fat stores, fatigue, hands and feet
 * as quasi-steady nodes accumulating frostbite, chilblain and trench-foot
 * doses, carbon monoxide, bleeding, and the hypothermia state machine.
 */

// ── Constants ─────────────────────────────────────────────

export const C_BODY = 3490 * 70; // J/K
export const A_SKIN = 1.8; // m²
export const S_MAX = 350; // W, peak shivering
export const M_BASAL = 80; // W
export const EG_MAX = 2000; // kcal
/** Lean tissue lost (kg) at which starvation kills: about two fifths of it. */
export const LEAN_FATAL = 18;
/** One meal from the kitchen: a hearty bowl of pottage and bread. */
export const MEAL_KCAL = 1100;
/** kcal in one unit (≈1 kg) of each raw food, eaten uncooked when the meals run out. */
export const FOOD_KCAL: Partial<Record<ResourceKey, number>> = {
  potato: 770, wheat: 3400, grape: 700, herb: 300, cabbage: 250, carrot: 410, pumpkin: 260, barley: 3500,
  onion: 400, bean: 3400, turnip: 280, corn: 3600, strawberry: 320, garlic: 1500,
  rice: 3600, taro: 1100, lotus: 740, reed: 200, watercress: 110, chestnut: 2000, fish: 1000, meat: 2000,
};
/** Vitamin C, mg per unit (kg) (§3.4). */
export const FOOD_VITC: Partial<Record<ResourceKey, number>> = {
  potato: 150, cabbage: 300, watercress: 300, herb: 300, strawberry: 400, grape: 400, onion: 70, garlic: 70,
  carrot: 60, turnip: 200, pumpkin: 90, taro: 50, lotus: 440, chestnut: 400,
};

export const WORK_TIER = { rest: 0, light: 100, moderate: 250, heavy: 400, extreme: 550 } as const;
const TIER_OF: Partial<Record<Structure["type"], number>> = {
  farm: 250, waterfarm: 250, lumbercamp: 400, mine: 400, fishery: 250, icefactory: 400, market: 100, kitchen: 100,
  refinery: 250, forge: 400, laboratory: 100, school: 100, barracks: 250, archery: 250, armoury: 250, wizardhut: 100,
  nobleyard: 250, armyschool: 250, watermill: 100, storehouse: 250, townhall: 100, watchtower: 100, armypoint: 250,
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function newBody(): Body {
  return {
    Tc: 37, W: 0, Wf: 0, Eg: 1500, F: 12, B: 0, phi: 0, vitC: 1200, h2o: 0, cohb: 0, blood: 0, bleed: 0,
    frostH: 0, frostF: 0, cb: 0, tf: 0, state: "normal", ill: [], eff: 1, effAcc: 0, effN: 0, soaked: 0,
    spoiledMeals: 0, meals: 0,
  };
}

export const bodyOf = (v: Villager): Body => (v.body ??= newBody());

// ── Clothing ──────────────────────────────────────────────

export interface Clothes { clo: number; hands: number; feet: number; wp: number }

export function clothesOf(v: Villager, season: string): Clothes {
  const base: Clothes =
    season === "winter" ? { clo: 2.2, hands: 1.5, feet: 1.2, wp: 0.3 }
      : season === "summer" ? { clo: 0.6, hands: 0, feet: 0.6, wp: 0.1 }
        : { clo: 1.2, hands: 0.8, feet: 0.8, wp: 0.2 };
  if (v.role === "infantry" || v.role === "knight" || v.role === "heavy" || v.role === "archer") base.clo += 0.3;
  if (v.gear?.armour === "hidecoat") base.clo += 1.0;
  const b = v.body;
  if (b?.state === "undressing") {
    base.clo = 0.2;
    base.hands = 0;
  }
  return base;
}

// ── Where each villager is this minute ────────────────────

export interface Place {
  /** A zone they are inside, or undefined outdoors. */
  zone?: Structure;
  /** Where they stand, tiles. */
  x: number;
  y: number;
  tier: number;
  walking: boolean;
  asleep: boolean;
  /** Underground (the mine): ground temperature, still air, dripping. */
  under?: boolean;
  working: boolean;
  /** Keep every layer on however hot the work (tests; the stubborn). */
  noStrip?: boolean;
}

function homeOf(s: GameState, v: Villager): Structure | undefined {
  return byId(s, v.house) ?? undefined;
}

/**
 * The day's shape: asleep at home 22–06, at work through the shift (the
 * extended-shift decree lengthens it), home in the evening. Anyone too cold
 * leaves work to warm up; the broken and the gravely ill stay in.
 */
export function placeOf(s: GameState, v: Villager, hour: number): Place | null {
  if (v.deployedUntil && v.deployedUntil > s.time) return null;
  const b = bodyOf(v);
  if (v.scout) {
    // Marching power comes from the load-carriage model in ./wilds; resting when camped.
    const march = Math.max(0, (v.scout.power ?? 375) - M_BASAL);
    return { x: v.scout.x, y: v.scout.y, tier: march, walking: march > 0, asleep: false, working: false };
  }
  const home = homeOf(s, v);
  const at = (st: Structure | undefined, tier: number, asleep: boolean, working = false): Place => {
    if (!st) {
      const hall = s.structures.find((x) => x.type === "townhall");
      const [x, y] = hall ? center(hall) : [40, 30];
      return { x, y, tier, walking: false, asleep, working };
    }
    const [x, y] = center(st);
    if (st.type === "mine") return { x, y, tier, walking: false, asleep, under: true, working };
    return { zone: isZone(st) ? st : undefined, x, y, tier, walking: false, asleep, working };
  };
  const shift = s.policy?.shift ?? 14;
  const sleeping = hour >= 22 || hour < 6;
  if (sleeping) return at(home, 0, true);
  if (b.state === "hypoSevere" || b.state === "cardiac") return at(home, 0, true);
  if (v.broken && v.broken.until > s.time) return at(home, 0, false);
  const sick = b.ill.some((i) => i.onset <= s.time && (i.kind === "pneumonia" || i.kind === "typhus" || i.kind === "dysentery" || i.kind === "gangrene"));
  if (b.warming || sick) return at(home ?? s.structures.find((x) => x.type === "townhall"), 0, false);
  const onShift = hour >= 6 && hour < 6 + shift;
  const striking = s.society?.state === "strike" && v.fac === strikingFaction(s);
  if (onShift && !striking) {
    const work = byId(s, v.work);
    const onBreak = !!home?.breakUntil && home.breakUntil > s.time;
    if (work && !onBreak && v.health > 20 && !work.buildUntil) return at(work, TIER_OF[work.type] ?? 100, false, true);
    // Idle hands go out to clear, dig and bury when there is work of that kind.
    if (v.role === "idle" && ((s.clearing.length ?? 0) > 0 || (s.earthworks?.length ?? 0) > 0 || (s.corpses?.length ?? 0) > 0)) {
      const hall = s.structures.find((x) => x.type === "townhall");
      const [x, y] = hall ? center(hall) : [40, 30];
      return { x: x + 4, y: y + 6, tier: WORK_TIER.heavy, walking: true, asleep: false, working: true };
    }
  }
  return at(home, 0, false);
}

export const strikingFaction = (s: GameState) => s.society?.ultimatum?.faction ?? worstFaction(s);
function worstFaction(s: GameState): number {
  const sums = [0, 0, 0];
  const n = [0, 0, 0];
  for (const v of s.villagers) {
    const f = v.fac ?? 1;
    sums[f] += v.disc ?? 0;
    n[f] += 1;
  }
  let best = 0;
  for (let f = 1; f < 3; f++) if (n[f] && sums[f] / n[f] > (n[best] ? sums[best] / n[best] : -1)) best = f;
  return best;
}

// ── Outdoor exposure: wind shelter, fire radiation ────────

const shelterMemo = new WeakMap<GameState, { key: string; map: Map<number, number> }>();

/**
 * Wind in the lee of walls and buildings: `1 − 0.8·exp(−x/(5h))` per
 * obstacle within 15 heights (§1.2), approximated by casting eight compass
 * rays and averaging what each finds.
 */
export function shelterAt(s: GameState, x: number, y: number): number {
  let h = 0;
  for (let i = 0; i < s.map.overlay.length; i += 97) h = (h * 31 + s.map.overlay[i]) | 0;
  const key = `${h}|${s.structures.length}`;
  let memo = shelterMemo.get(s);
  if (!memo || memo.key !== key) {
    memo = { key, map: new Map() };
    shelterMemo.set(s, memo);
  }
  const k = Math.floor(y) * 1000 + Math.floor(x);
  const hit = memo.map.get(k);
  if (hit !== undefined) return hit;
  let sum = 0;
  const occ = new Set<number>();
  for (const st of s.structures) if (st.type !== "farm" && st.type !== "waterfarm") for (let yy = st.y; yy < st.y + st.h; yy++) for (let xx = st.x; xx < st.x + st.w; xx++) occ.add(idx(xx, yy));
  for (let d = 0; d < 8; d++) {
    const a = (d / 8) * Math.PI * 2;
    let f = 1;
    for (let t = 1; t <= 22; t++) {
      const tx = Math.floor(x + Math.cos(a) * t);
      const ty = Math.floor(y + Math.sin(a) * t);
      if (!inBounds(tx, ty)) break;
      const i = idx(tx, ty);
      const o = s.map.overlay[i];
      if (o === 4 || o === 5 || occ.has(i)) {
        f = 1 - 0.8 * Math.exp(-(t * 2) / (5 * 3));
        break;
      }
    }
    sum += f;
  }
  const v = sum / 8;
  memo.map.set(k, v);
  return v;
}

/** kg of wood a pit fire burns an hour, by its grate's burn rate in fuel units. */
function fireWatts(s: GameState, f: Structure): number {
  if ((f.fuel ?? 0) <= 0) return 0;
  const c = clock(s.time);
  const units = c.season === "winter" ? (c.night ? 3 : 1.5) : c.season === "summer" ? 0.08 : 0.4;
  return ((units * FUEL_UNIT_KG) / 3600) * 14.3e6;
}

/** Radiant gain from lit pit fires, W absorbed (§1.2); walls block it. */
export function radiantGain(s: GameState, x: number, y: number, fields: Warmth[]): number {
  let q = 0;
  for (const f of s.structures) {
    if (f.type !== "pitfire" || f.buildUntil) continue;
    const [cx, cy] = center(f);
    const rTiles = Math.hypot(x - cx, y - cy);
    if (rTiles > 12) continue;
    if (!warmAt(fields.filter((w) => w.id === f.id), [x, y])) continue;
    const r = Math.max(1, rTiles * 2);
    q += (0.3 * fireWatts(s, f)) / (4 * Math.PI * r * r);
  }
  return 0.378 * q;
}

// ── The minute step ───────────────────────────────────────

export interface Env {
  T: number;
  v: number;
  RH: number;
  /** Precipitation reaching the clothes, mm/h. */
  P: number;
  rad: number;
  co: number;
  snowCm: number;
  outdoors: boolean;
}

/** Productivity multiplier of an affliction state. */
const STATE_WORK: Record<Affliction, number> = { normal: 1, shivering: 0.9, hypoMild: 0.6, hypoModerate: 0, hypoSevere: 0, undressing: 0, cardiac: 0 };
export const STATE_LABEL: Record<Affliction, string> = {
  normal: "Well", shivering: "Shivering", hypoMild: "Mild hypothermia", hypoModerate: "Moderate hypothermia",
  hypoSevere: "Severe hypothermia", undressing: "Paradoxical undressing", cardiac: "Cardiac arrest",
};

export interface Step {
  died?: string;
}

/**
 * One minute of one body. Returns a cause of death if it dies. `r` rolls the
 * hazards; `dt` is seconds (60).
 */
export function stepBody(b: Body, v: Villager, env: Env, place: Place, cl: Clothes, r: () => number, dt = 60, allies = 0, now = 0): Step {
  const dtMin = dt / 60;
  // In bed, under blankets and furs: a clo and a half more.
  let clo = cl.clo + (place.asleep ? 1.5 : 0);
  // Stripping a layer for hard work once warm, as anyone sensible does.
  if (!place.noStrip && place.tier >= 250 && b.Tc > 37.1) clo = Math.max(0.4, clo - 0.8);
  const vEff = env.v + (place.walking ? 1.3 : 0);
  const Rcl = 0.155 * clo * (1 - 0.75 * b.W) * Math.max(0.55, 1 - 0.035 * vEff);
  const hc = Math.max(3, 8.3 * Math.sqrt(vEff));
  const Ra = 1 / (hc + 4.7);
  const Rt = 0.03 + 0.09 * clamp(37 - b.Tc, 0, 1);
  const g = 0.3 + 0.7 * clamp(b.Eg / (0.25 * EG_MAX), 0, 1);
  const Mshiv = S_MAX * clamp((36.8 - b.Tc) / 1.8, 0, 1) * g * clamp((b.Tc - 31) / 2, 0, 1);
  const tier = STATE_WORK[b.state] > 0 ? place.tier : 0;
  const Mlab = tier * (1 + 0.06 * Math.max(0, clo - 1.5)) * (1 + 0.008 * (place.walking && env.outdoors ? env.snowCm : 0)) * (1 + 0.5 * b.phi * b.phi);
  const Mtot = M_BASAL + Mlab + Mshiv;
  const Hmet = M_BASAL + 0.8 * Mlab + Mshiv;
  const Qdry = (A_SKIN * (b.Tc - env.T)) / (Rt + Rcl + Ra);
  const pa = env.RH * 0.611 * Math.exp((17.27 * env.T) / (env.T + 237.3));
  const Qresp = Mtot * (0.0014 * (34 - env.T) + 0.0173 * (5.87 - pa));
  const Qsw = b.Tc > 37.1 ? Math.min(500 * (1 - 0.6 * b.W), 180 * (b.Tc - 37.1)) : 0;
  const e = 0.9 / (1 + 0.8 * clo);
  b.Tc += ((Hmet - Qdry - Qresp - e * Qsw + env.rad) * dt) / C_BODY;

  // Wetness: rain and snow on the clothes, sweat condensing in them, drying.
  const Peff = env.outdoors ? env.P * (env.T < -2 ? 0.3 : 1) : 0;
  // Clothes dry indoors, slowly in dry air outdoors — and not at all while the body is sweating into them.
  const dry = Qsw > 0 ? 0 : !env.outdoors ? (env.T > 10 ? 0.004 : 0.0015) : env.P > 0 ? 0 : 0.0005;
  b.W = clamp(b.W + (0.004 * Peff * (1 - cl.wp)) * dtMin + ((1 - e) * ((Qsw * dt) / 2.43e6)) / (0.6 * Math.max(0.3, clo)) - dry * dtMin - (env.rad > 60 ? 0.02 * dtMin : 0), 0, 1);
  if (env.outdoors && place.walking && env.snowCm > 10) b.Wf = clamp(b.Wf + 0.004 * dtMin, 0, 1);
  else if (!env.outdoors) b.Wf = clamp(b.Wf - (env.T > 10 ? 0.004 : 0.0015) * dtMin, 0, 1);

  // Energy: glycogen first, then fat at the Alpert limit, then muscle.
  b.Eg -= (Mtot * dt) / 4184;
  if (b.Eg < 0) {
    const need = -b.Eg;
    const fromFat = Math.min(need, ((69 * b.F) / 1440) * dtMin);
    b.F = Math.max(0, b.F - fromFat / 7700);
    b.B += (need - fromFat) / 1000;
    b.Eg = 0;
  }
  // Fatigue.
  // Twelve hours of heavy work to exhaustion; a night's warm sleep clears it, rest by day slowly.
  if (place.working && tier > 0) b.phi = clamp(b.phi + (Mlab / (400 * 720)) * dtMin, 0, 1);
  else if (place.asleep) b.phi = clamp(b.phi - ((env.T >= 5 ? 1 : 0.5) / 480) * dtMin, 0, 1);
  else b.phi = clamp(b.phi - dtMin / 960, 0, 1);

  // Hands and feet (§1.5).
  const vc = clamp((37 - b.Tc) / 1.5, 0, 1);
  const Rtx = 0.05 + 0.25 * vc;
  const node = (cloX: number, w: number) => {
    const R = 0.155 * cloX * (1 - 0.75 * w);
    return env.T + ((b.Tc - env.T) * (R + Ra)) / (Rtx + R + Ra);
  };
  const Th = node(cl.hands, b.W);
  const Tf = node(cl.feet, b.Wf);
  if (Th < -0.5) b.frostH += (-0.5 - Th) * (1 + b.W) * dtMin;
  if (Tf < -0.5) b.frostF += (-0.5 - Tf) * (1 + b.Wf) * dtMin;
  if (Th > 0 && Th < 10) b.cb += (((10 - Th) / 10) * (0.5 + b.W) * dtMin) / 60;
  else if (Th > 20) b.cb = Math.max(0, b.cb - (0.3 * dtMin) / 60);
  if (b.Wf > 0.5 && Tf > 0 && Tf < 15) b.tf += (b.Wf * ((15 - Tf) / 15) * dtMin) / 60;
  else if (b.Wf < 0.2 && Tf > 20 && b.tf < 30) b.tf = Math.max(0, b.tf - (0.4 * dtMin) / 60);
  const manip = env.outdoors ? clamp((Th - 8) / 12, 0.2, 1) : 1;

  // Carbon monoxide (§1.9).
  const eq = Math.min(80, 0.15 * ppm(env.co));
  const tau = (2.5 * 60 * 100) / Math.max(100, Mtot);
  b.cohb += (eq - b.cohb) * (1 - Math.exp(-dtMin / tau));

  // Bleeding: small wounds clot; an artery does not, unless someone is there to bind it.
  if (b.bleed > 0) {
    b.blood += b.bleed * dtMin;
    const cold = clamp((env.T - 10) / 20, 0, 1);
    if (b.bleed < 0.1) b.bleed *= Math.exp(-dtMin / 20) * (0.6 + 0.4 * cold);
    else if (allies > 0) b.bleed *= 0.1;
    if (b.bleed < 0.001) b.bleed = 0;
  } else if (b.blood > 0 && b.Eg > 200) b.blood = Math.max(0, b.blood - (0.02 * dtMin) / 60);

  // The affliction machine (§1.7), with hysteresis and hazards.
  const Tc = b.Tc;
  const prev = b.state;
  let st = b.state;
  if (st === "cardiac") {
    return { died: "heart stopped in the cold" };
  }
  if (Tc <= 24) return { died: "froze to death" };
  if (st === "normal" && Tc < 36.0) st = "shivering";
  if (st === "shivering" && Tc > 36.4) st = "normal";
  if ((st === "shivering" || st === "normal") && Tc < 35.0) st = "hypoMild";
  if (st === "hypoMild" && Tc > 35.4) st = "shivering";
  if (st === "hypoMild" && Tc < 32.0) st = "hypoModerate";
  if (st === "hypoModerate" && Tc > 32.5) st = "hypoMild";
  if ((st === "hypoModerate" || st === "undressing") && Tc < 28.0) st = "hypoSevere";
  if (st === "hypoSevere" && Tc > 29) st = "hypoModerate";
  if ((st === "hypoModerate" || st === "hypoSevere") && Tc >= 28 && Tc <= 31) {
    const lam = (0.015 * (31 - Tc)) / 3;
    if (r() < 1 - Math.exp(-lam * dtMin)) st = "undressing";
  }
  if (st === "undressing" && Tc > 32.5) st = "hypoMild";
  if (Tc < 30) {
    let lam = 0.0005 * Math.exp(0.55 * (30 - Tc));
    if (b.afterdrop && b.afterdrop > 0) lam *= 3;
    if (r() < 1 - Math.exp(-lam * dtMin)) st = "cardiac";
  }
  b.state = st;
  if (prev !== st && st === "hypoModerate") b.hypoDone = true;

  // Other deaths.
  if (b.blood >= 2.5) return { died: "bled to death" };
  if (b.B >= LEAN_FATAL) return { died: "wasted away" };
  if (b.h2o >= 7) return { died: "died of thirst" };
  if (b.cohb >= 55 && r() < 1 - Math.exp(-0.05 * ((b.cohb - 55) / 10 + 0.1) * dtMin)) return { died: "never woke from the fumes" };

  // Productivity this minute.
  let eff = (1 - 0.6 * b.phi * b.phi) * (1 - (0.35 * Mshiv) / S_MAX) * manip * STATE_WORK[b.state];
  if (b.blood >= 0.75) eff *= b.blood >= 1.5 ? 0.5 : 0.8;
  if (b.cohb >= 25) eff *= 0.5;
  else if (b.cohb >= 10) eff *= 0.9;
  if (b.h2o >= 1.5) eff *= 0.85;
  if (b.frostH >= 480) eff *= 0.8;
  else if (b.frostH >= 180) eff *= 0.7;
  if (b.cb >= 8) eff *= 0.85;
  if (b.tf >= 30) eff *= 0.6;
  else if (b.tf >= 10) eff *= 0.85;
  if (b.vitC < 300) eff *= 0.85;
  if (b.amputee) eff *= Math.pow(0.7, b.amputee);
  for (const i of b.ill) if (i.onset <= now) eff *= ILL_WORK[i.kind];
  if (place.working) {
    b.effAcc += eff;
    b.effN += 1;
  }
  // Warming breaks: out of the cold at 36.0, back at 36.8.
  if (env.outdoors && b.Tc < 36.0 && place.working) b.warming = true;
  if (b.warming && b.Tc >= 36.8) b.warming = false;
  return {};
}

export const ILL_WORK: Record<IllnessKind, number> = {
  poisoning: 0.5, dysentery: 0.3, ergotism: 0, typhus: 0, pneumonia: 0, gangrene: 0.2, scurvy: 0.85, infection: 0.7,
};

// ── The town's minute ─────────────────────────────────────

/**
 * Every villager's minute: where they are, what the air there is, and the
 * body's answer to it. Zones step every ten minutes on the occupancy found.
 */
export function stepBodies(s: GameState, minutes: number) {
  s.bodyAcc = (s.bodyAcc ?? 0) + minutes;
  while (s.bodyAcc >= 1) {
    s.bodyAcc -= 1;
    bodyMinute(s);
  }
}

function bodyMinute(s: GameState) {
  const c = clock(s.time);
  const a = air(s);
  // Pit-fire warmth is cast only if someone outdoors stands near a lit fire.
  const fires = s.structures.filter((f) => f.type === "pitfire" && !f.buildUntil && (f.fuel ?? 0) > 0);
  let fields: Warmth[] | null = null;
  const fieldsNow = () => (fields ??= warmFields(s));
  const r = rng(Math.floor(s.time) * 7 + s.seed * 13 + 1);
  const occ = new Map<number, Occ>();
  const byPlace = new Map<string, number>();
  const places: [Villager, Place][] = [];
  for (const v of s.villagers) {
    const p = placeOf(s, v, c.hour);
    if (!p) continue;
    places.push([v, p]);
    const key = p.zone ? `z${p.zone.id}` : `${Math.round(p.x)},${Math.round(p.y)}`;
    byPlace.set(key, (byPlace.get(key) ?? 0) + 1);
    if (p.zone) {
      const o = occ.get(p.zone.id) ?? { awake: 0, asleep: 0 };
      if (p.asleep) o.asleep++;
      else o.awake++;
      occ.set(p.zone.id, o);
    }
  }
  s.zoneAcc = (s.zoneAcc ?? 0) + 1;
  if (s.zoneAcc >= 10) {
    stepZones(s, s.zoneAcc, a, occ);
    s.zoneAcc = 0;
  }
  const dead: [Villager, string, Place][] = [];
  const shiftEnd = 6 + (s.policy?.shift ?? 14);
  const onShift = c.hour >= 6 && c.hour < shiftEnd;
  for (const [v, p] of places) {
    const b = bodyOf(v);
    b.at = p.zone?.id ?? null;
    if (onShift && v.work) {
      b.shiftMin = (b.shiftMin ?? 0) + 1;
      if (p.working) b.workMin = (b.workMin ?? 0) + 1;
    }
    const cl = clothesOf(v, c.season);
    const z = p.zone?.zone;
    let env: Env;
    if (p.zone && z) {
      const hearth = p.zone.hearth ? HEARTHS[p.zone.hearth] : undefined;
      const sitting = !p.asleep && hearth && z.burn > 0 && p.zone.hearth !== "stove" ? 40 : 0;
      env = { T: z.T, v: 0.2, RH: 0.6, P: 0, rad: sitting, co: z.co, snowCm: 0, outdoors: false };
    } else if (p.under) {
      env = { T: Math.max(6, a.Tg), v: 0.3, RH: 0.95, P: 0.2, rad: 0, co: 0, snowCm: 0, outdoors: true };
    } else {
      const shelter = shelterAt(s, p.x, p.y);
      const nearFire = fires.some((f) => Math.hypot(f.x + 1 - p.x, f.y + 1 - p.y) <= 12);
      env = {
        T: a.T, v: a.v * shelter, RH: a.RH, P: a.P, rad: nearFire ? radiantGain(s, p.x, p.y, fieldsNow()) : 0, co: 0,
        snowCm: a.snowDepth * 100, outdoors: true,
      };
      if (v.scout) {
        env.v = a.v;
        env.rad = 0;
      }
    }
    const key = p.zone ? `z${p.zone.id}` : `${Math.round(p.x)},${Math.round(p.y)}`;
    const allies = (byPlace.get(key) ?? 1) - 1;
    const res = stepBody(b, v, env, p, cl, r, 60, allies, s.time);
    if (res.died) dead.push([v, res.died, p]);
    // Collapsed outdoors with someone there: carried in, with the rescue-collapse risk.
    if (!res.died && env.outdoors && (b.state === "hypoSevere" || b.state === "undressing") && allies > 0 && !v.scout) {
      if (r() < 0.05) b.state = "cardiac";
      b.warming = true;
      b.afterdrop = 1;
    }
  }
  for (const [v, why, p] of dead) killBody(s, v, why, p.x, p.y);
  // Meals at seven, noon and seven.
  if (c.minute === 0 && (c.hour === 7 || c.hour === 12 || c.hour === 19)) for (const v of s.villagers) if (!v.scout && !(v.deployedUntil && v.deployedUntil > s.time)) eat(s, v);
}

/** A death in the body model: logged, the corpse left where it fell. */
export function killBody(s: GameState, v: Villager, why: string, x?: number, y?: number) {
  if (!s.villagers.includes(v)) return;
  const home = byId(s, v.house);
  const [hx, hy] = home ? center(home) : [x ?? 40, y ?? 30];
  const st = byId(s, v.work);
  if (st) st.workers = st.workers.filter((id) => id !== v.id);
  s.villagers = s.villagers.filter((q) => q.id !== v.id);
  s.deaths += 1;
  noteLoss(s);
  if (!v.scout) addCorpse(s, v.name, x ?? hx, y ?? hy);
  witnessDeath(s, v);
  log(s, `${v.name} ${why}.`, "bad");
}

// ── Eating and drinking ───────────────────────────────────

/**
 * A sitting: meals from the kitchen to top up the glycogen store (and a
 * little to fat while it is below twelve kilos), raw food uncooked when the
 * meals run out. Spoiled food cooked into the meals carries its risk; so does
 * the water, and in winter water is melted snow, paid in fuel.
 */
export function eat(s: GameState, v: Villager) {
  const b = bodyOf(v);
  const ration = s.policy?.ration ?? 1;
  const want = (clamp(EG_MAX - b.Eg, 0, 1400) + (b.F < 12 ? 300 : 0)) * ration;
  if (want <= 0) return;
  let got = 0;
  const stores = s.stores;
  const mealsNeed = want / MEAL_KCAL;
  const meals = Math.min(mealsNeed, s.res.meals);
  if (meals > 0) {
    s.res.meals -= meals;
    got += meals * MEAL_KCAL;
    const taint = stores?.mealTaint ?? 0;
    b.spoiledMeals += meals * taint;
    b.meals += meals;
    b.vitC = Math.min(1500, b.vitC + meals * (stores?.mealVitC ?? 40));
    const r = rng(Math.floor(s.time) + v.id * 17);
    if (taint > 0 && r() < 0.25 * taint * meals) sicken(s, v, "poisoning");
    if ((stores?.contamFood ?? 0) > 0.2 && r() < 0.1 * (stores!.contamFood)) sicken(s, v, "ergotism");
  }
  // Raw food, uncooked, from whatever there is most of.
  if (got < want) {
    const foods = RAW_FOODS.filter((k) => s.res[k] > 0).sort((x, y) => s.res[y] - s.res[x]);
    for (const k of foods) {
      if (got >= want) break;
      const kcal = FOOD_KCAL[k] ?? 600;
      const units = Math.min(s.res[k], (want - got) / kcal);
      s.res[k] -= units;
      const sp = stores?.spoiled[k] ?? 0;
      if (stores && sp > s.res[k]) stores.spoiled[k] = s.res[k];
      got += units * kcal;
      b.vitC = Math.min(1500, b.vitC + units * (FOOD_VITC[k] ?? 0));
    }
  }
  // Excess over the store goes to fat.
  b.Eg += got;
  if (b.Eg > EG_MAX) {
    b.F = Math.min(20, b.F + ((b.Eg - EG_MAX) * 0.8) / 7700);
    b.Eg = EG_MAX;
  }
  drink(s, v);
}

/** A third of the day's water, at each sitting (§3.4). */
function drink(s: GameState, v: Villager) {
  const b = bodyOf(v);
  const need = 2.5 / 3;
  const a = air(s);
  // In winter the river is ice: water is melted snow, 0.09 kg of oak a litre.
  if (a.T < -2 && clock(s.time).season === "winter") {
    const fuel = (need * 0.09) / FUEL_UNIT_KG;
    if (s.res.wood >= fuel) s.res.wood -= fuel;
    else if (s.res.peat >= fuel) s.res.peat -= fuel;
    else {
      b.h2o += need;
      return;
    }
  }
  b.h2o = 0;
  const cw = s.stores?.contamWater ?? 0;
  if (cw > 0 && rng(Math.floor(s.time) + v.id * 29)() < 0.05 * cw) sicken(s, v, "dysentery");
}

// ── Illness (§7) ──────────────────────────────────────────

export const ILLNESS: Record<IllnessKind, { name: string; incubate: [number, number]; days: number; mortality: number }> = {
  poisoning: { name: "Food poisoning", incubate: [2, 6], days: 1, mortality: 0.01 },
  dysentery: { name: "Dysentery", incubate: [24, 48], days: 5, mortality: 0.08 },
  ergotism: { name: "Ergotism", incubate: [24, 24], days: 3, mortality: 0.1 },
  typhus: { name: "Typhus", incubate: [8 * 24, 8 * 24], days: 12, mortality: 0.2 },
  pneumonia: { name: "Pneumonia", incubate: [24, 48], days: 7, mortality: 0.15 },
  gangrene: { name: "Gangrene", incubate: [48, 120], days: 30, mortality: 0.25 },
  scurvy: { name: "Scurvy", incubate: [0, 0], days: 30, mortality: 0.05 },
  infection: { name: "Wound infection", incubate: [24, 72], days: 4, mortality: 0 },
};

export function sicken(s: GameState, v: Villager, kind: IllnessKind) {
  const b = bodyOf(v);
  if (b.ill.some((i) => i.kind === kind)) return;
  const def = ILLNESS[kind];
  const r = rng(Math.floor(s.time) * 3 + v.id * 101 + kind.length);
  const inc = (def.incubate[0] + r() * (def.incubate[1] - def.incubate[0])) * 60;
  b.ill.push({ kind, onset: s.time + inc, until: s.time + inc + def.days * 24 * 60 });
}

/**
 * The hour's illness: hazards of death, the water and energy some diseases
 * take, gangrene waiting on the knife, crowding and wet giving rise to new
 * cases, and the scurvy of an empty vitamin pool.
 */
export function illnessHourly(s: GameState) {
  const r = rng(Math.floor(s.time) * 11 + s.seed);
  const c = clock(s.time);
  const physician = s.villagers.some((v) => v.role === "scientist" || v.role === "biologist" || v.traits?.includes("physician"));
  const triage = s.decrees?.includes("triage");
  for (const v of [...s.villagers]) {
    const b = bodyOf(v);
    // Vitamin C: 12.8% a day of the pool, and more when chilled.
    b.vitC = Math.max(0, b.vitC - (0.128 * b.vitC) / 24 - (b.Tc < 36 ? 15 / 24 : 0));
    // Soaked through, or after moderate hypothermia: pneumonia.
    b.soaked = b.W > 0.8 ? b.soaked + 1 : Math.max(0, b.soaked - 0.5);
    if (b.hypoDone || b.soaked >= 12) {
      b.hypoDone = false;
      b.soaked = 0;
      if (r() < 0.3) sicken(s, v, "pneumonia");
    }
    // Frostbite III, trench foot III or an infected wound: gangrene.
    if (b.frostH >= 480 || b.frostF >= 480 || b.tf >= 72) sicken(s, v, "gangrene");
    // Crowding in winter: lice and typhus.
    const home = byId(s, v.house);
    if (home && c.season === "winter" && c.hour === 0) {
      const area = home.w * home.h * 4;
      if (residents(s, home).length > area / 4 && r() < 0.02) sicken(s, v, "typhus");
    }
    for (const ill of [...b.ill]) {
      if (ill.onset > s.time) continue;
      const def = ILLNESS[ill.kind];
      if (ill.kind === "gangrene") {
        // The knife: with medicine and a physician, or by decree without.
        const withMeds = physician && s.res.tonic >= 1;
        if (withMeds || triage) {
          if (withMeds) s.res.tonic -= 1;
          b.ill = b.ill.filter((i) => i !== ill);
          b.frostH = Math.min(b.frostH, 179);
          b.frostF = Math.min(b.frostF, 179);
          b.tf = Math.min(b.tf, 29);
          if (r() < (withMeds ? 0.8 : 0.55)) {
            b.amputee = (b.amputee ?? 0) + 1;
            log(s, `${v.name} loses a limb to the knife${withMeds ? "" : ", without medicine,"} and lives.`, "info");
            for (const w of s.villagers) if (w !== v && w.house === v.house) w.happy = Math.max(0, w.happy - 8);
            v.happy = Math.max(0, v.happy - 25);
          } else {
            killBody(s, v, "did not survive the amputation");
            break;
          }
          continue;
        }
      }
      let pDay = def.mortality / Math.max(1, def.days);
      if (ill.kind === "gangrene") pDay = 0.25;
      if ((ill.kind === "dysentery" || ill.kind === "poisoning") && b.h2o > 1.5) pDay *= 3;
      if (ill.kind === "pneumonia" && (byId(s, v.house)?.zone?.T ?? 0) < 10) pDay *= 2;
      if (s.res.tonic >= 1 && v.health < 70) pDay *= 0.5;
      const lam = -Math.log(1 - Math.min(0.99, pDay)) / 24;
      if (ill.kind === "dysentery") {
        b.h2o += 3 / 24;
        b.Eg = Math.max(0, b.Eg - 800 / 24);
      }
      if (ill.kind === "poisoning") b.h2o += 2 / 24;
      if (ill.kind === "ergotism") {
        v.happy = Math.max(0, v.happy - 3);
        b.frostH += 60;
      }
      if (ill.kind === "typhus") b.Tc = Math.max(b.Tc, 39.5);
      v.health = Math.max(0, v.health - 1);
      if (r() < 1 - Math.exp(-lam)) {
        killBody(s, v, `died of ${def.name.toLowerCase()}`);
        break;
      }
      if (s.time >= ill.until) b.ill = b.ill.filter((i) => i !== ill);
    }
    if (!s.villagers.includes(v)) continue;
    // Scurvy II: old wounds reopen.
    if (b.vitC < 100) {
      if (r() < 1 - Math.exp(-0.05 / 24)) {
        killBody(s, v, "died of scurvy");
        continue;
      }
      b.bleed = Math.max(b.bleed, 0.01);
    }
    // Starvation below three kilos of fat.
    if (b.F < 3 && r() < 1 - Math.exp((-0.05 * (3 - b.F)) / 24)) {
      killBody(s, v, "starved");
      continue;
    }
    // The hour's productivity and attendance, for the workplaces.
    if (b.effN) {
      b.eff = b.effAcc / b.effN;
      b.effDay = b.effDay === undefined ? b.eff : b.effDay + (b.eff - b.effDay) / 8;
    }
    b.effAcc = 0;
    b.effN = 0;
    if (b.shiftMin) {
      const p = (b.workMin ?? 0) / b.shiftMin;
      b.presence = b.presence === undefined ? p : b.presence + (p - b.presence) / 8;
      b.shiftMin = 0;
      b.workMin = 0;
    }
  }
  // Emitted blood of open wounds: the bio channel smells it.
  const blood = s.villagers.reduce((a, v) => a + (v.body?.bleed ?? 0) * 60, 0);
  if (blood > 0) {
    const hall = s.structures.find((x) => x.type === "townhall");
    const [hx, hy] = hall ? center(hall) : [40, 30];
    emit(s, "bio", blood, hx, hy);
  }
}

/** The town's hunger meter, kept for the readouts: how fed people are, 0–100. */
export function townHunger(s: GameState): number {
  if (!s.villagers.length) return 100;
  const m = s.villagers.reduce((a, v) => {
    const b = bodyOf(v);
    return a + Math.min(1, b.Eg / 1500) * 0.6 + Math.min(1, b.F / 10) * 0.4;
  }, 0);
  return Math.round((100 * m) / s.villagers.length);
}

/** Every villager's working capacity this hour, 0–1. */
export const effOf = (v: Villager) => v.body?.effDay ?? v.body?.eff ?? 1;

void CATALOG;
