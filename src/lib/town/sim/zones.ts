import { CATALOG, grade, homeTier } from "./catalog";
import { clock, log } from "./state";
import { airBoost, center, fireAir, rng } from "./world";
import { emit } from "./aggro";
import { kmod } from "./knowledge";
import type { Air } from "./weather";
import type { GameState, HearthKind, ResourceKey, Structure, StructureType, Zone } from "./types";

/**
 * Shelter heat (design §1.8–1.9). Every enclosed building is one thermal
 * zone: its envelope loses heat through walls, roof, floor and draughts; its
 * hearth burns the town's fuel to hold a target; open fires and braziers foul
 * the air with carbon monoxide; chimneys choke on creosote. Updated every ten
 * game minutes with the exact exponential solution, so it is stable at any
 * step.
 */

/** Metres per tile side. */
export const TILE_M = 2;
/** Kilograms in one unit of wood, coal, peat or charcoal in the stores. */
export const FUEL_UNIT_KG = 10;

// ── Materials ─────────────────────────────────────────────

export interface WallMat { id: string; name: string; U: number; ach: number; cm: number; rot: number }
export const WALLS: Record<string, WallMat> = {
  daub: { id: "daub", name: "Wattle & daub", U: 2.2, ach: 3.0, cm: 25, rot: 1.0 },
  log: { id: "log", name: "Hewn log, chinked", U: 0.9, ach: 1.0, cm: 25, rot: 1.0 },
  turf: { id: "turf", name: "Log + turf berm", U: 0.6, ach: 0.8, cm: 150, rot: 0.8 },
  rubble: { id: "rubble", name: "Rubble stone", U: 2.0, ach: 1.8, cm: 90, rot: 0 },
  plaster: { id: "plaster", name: "Rubble + lime plaster", U: 1.6, ach: 0.9, cm: 90, rot: 0 },
  brick: { id: "brick", name: "Brick, double wythe", U: 1.8, ach: 0.8, cm: 90, rot: 0 },
  dressed: { id: "dressed", name: "Dressed stone + timber lining", U: 0.8, ach: 0.6, cm: 90, rot: 0.2 },
};

export interface RoofMat { id: string; name: string; U: number; dead: number; deadWet: number; pitch: number; ignite: number }
export const ROOFS: Record<string, RoofMat> = {
  thatch: { id: "thatch", name: "Thatch", U: 0.35, dead: 0.35, deadWet: 0.45, pitch: 50, ignite: 0.002 },
  turf: { id: "turf", name: "Turf", U: 0.8, dead: 1.5, deadWet: 2.5, pitch: 25, ignite: 0 },
  shingle: { id: "shingle", name: "Wooden shingle", U: 2.0, dead: 0.2, deadWet: 0.25, pitch: 40, ignite: 0.0008 },
  slate: { id: "slate", name: "Slate", U: 4.5, dead: 0.6, deadWet: 0.6, pitch: 40, ignite: 0 },
  copper: { id: "copper", name: "Copper", U: 5.5, dead: 0.3, deadWet: 0.3, pitch: 35, ignite: 0 },
};

/** Snow a roof keeps, by pitch (§5.2). */
export const snowShape = (pitch: number) => (pitch <= 30 ? 0.8 : pitch < 60 ? (0.8 * (60 - pitch)) / 30 : 0);

// ── Hearths ───────────────────────────────────────────────

export interface HearthDef {
  kind: HearthKind; name: string; eta: number; flue: number; dAch: number; ignite: number; maxKgH: number; cost: Partial<Record<ResourceKey, number>>;
  /** Its level on the heating ladder: each must be fitted over the one below it. */
  tier: number;
  /** A body of masonry that stores the fire's heat and gives it out slowly. */
  mass?: boolean;
  /** Has a flue: takes coal, gathers creosote, wants sweeping. */
  flued?: boolean;
  /** Share of the room's heat loss to the ground it cuts, by warming the floor. */
  floor?: number;
  blurb: string;
}
export const HEARTHS: Record<HearthKind, HearthDef> = {
  open: { kind: "open", name: "Open hearth", tier: 1, eta: 0.15, flue: 0.6, dAch: 1.0, ignite: 1, maxKgH: 6, cost: {}, blurb: "A fire on the floor under a smoke hole: most of the heat goes up with the smoke." },
  chimney: { kind: "chimney", name: "Chimney fireplace", tier: 2, flued: true, eta: 0.22, flue: 0.95, dAch: 0.5, ignite: 0.25, maxKgH: 6, cost: { stone: 40, bricks: 10 }, blurb: "A flue takes the smoke; the room keeps a little more of the fire." },
  brazier: { kind: "brazier", name: "Charcoal brazier", tier: 2, eta: 0.95, flue: 0, dAch: 0, ignite: 0.25, maxKgH: 1.5, cost: { iron: 3 }, blurb: "All its heat stays in the room — and all its fumes. Small, and dangerous to sleep by." },
  stove: { kind: "stove", name: "Masonry stove", tier: 3, mass: true, flued: true, eta: 0.7, flue: 0.99, dAch: 0.1, ignite: 0.05, maxKgH: 5, cost: { stone: 80, bricks: 30, ingots: 2 }, blurb: "A mass of brick that drinks a hot fire and gives it back all night." },
  tiled: { kind: "tiled", name: "Tiled stove", tier: 4, mass: true, flued: true, eta: 0.82, flue: 0.995, dAch: 0.08, ignite: 0.02, maxKgH: 6, cost: { stone: 60, bricks: 60, ingots: 4, silver: 3 }, blurb: "A tall stove faced in glazed tile, its smoke winding through channels until nearly all its heat is in the brick." },
  hypocaust: { kind: "hypocaust", name: "Hypocaust", tier: 5, flued: true, floor: 0.6, eta: 0.8, flue: 0.99, dAch: 0.05, ignite: 0.01, maxKgH: 10, cost: { stone: 150, bricks: 100, ingots: 6, gold: 1 }, blurb: "A furnace under a raised floor: hot air runs beneath the room, so the cold no longer comes up from the ground." },
  boiler: { kind: "boiler", name: "Boiler & radiators", tier: 6, flued: true, floor: 0.3, eta: 0.9, flue: 0.999, dAch: 0.04, ignite: 0.005, maxKgH: 12, cost: { ingots: 16, bricks: 60, gold: 3 }, blurb: "A coal boiler and iron radiators: steady heat in every room, and a flue that takes everything." },
  rune: { kind: "rune", name: "Rune hearthstone", tier: 7, mass: true, flued: true, floor: 0.5, eta: 1, flue: 1, dAch: 0, ignite: 0, maxKgH: 4, cost: { mithril: 2, diamond: 2, ingots: 10 }, blurb: "A carved stone that burns without smoke or fumes and holds its warmth like a sleeping animal." },
};

// ── Fuels (§1.9) ──────────────────────────────────────────

export type FuelKey = "wood" | "coal" | "peat" | "charcoal";
export interface FuelDef { key: FuelKey; name: string; lhvDry: number; mc: number; pm: number; co: number; creo: number }
export const FUELS: Record<FuelKey, FuelDef> = {
  wood: { key: "wood", name: "Wood", lhvDry: 18.5, mc: 0.5, pm: 6, co: 60, creo: 0.0006 },
  coal: { key: "coal", name: "Surface coal", lhvDry: 27, mc: 0.08, pm: 12, co: 50, creo: 0.001 },
  peat: { key: "peat", name: "Black peat", lhvDry: 21, mc: 0.35, pm: 15, co: 80, creo: 0.002 },
  charcoal: { key: "charcoal", name: "Charcoal", lhvDry: 30, mc: 0.05, pm: 0.5, co: 200, creo: 0 },
};

/** Lower heating value at a moisture content (wet basis), MJ/kg. */
export const lhv = (dry: number, mc: number) => dry * (1 - mc) - 2.44 * mc;

/**
 * Wood burns by its moisture: green wood (MC 0.5) gives about 8 MJ/kg and a
 * lot of smoke and soot, seasoned wood (MC 0.2) about 14. Smoke and creosote
 * scale from seasoned oak's with the water in the log.
 */
export function woodFuel(mc: number): FuelDef {
  const wet = Math.max(0, Math.min(1, (mc - 0.2) / 0.3));
  return { ...FUELS.wood, mc, pm: 6 + 14 * wet, co: 60 + 60 * wet, creo: 0.0006 + 0.0034 * wet };
}

// ── Which buildings are zones ─────────────────────────────

const OUTDOOR: StructureType[] = ["farm", "waterfarm", "lumbercamp", "fishery", "market", "lamppost", "brazier", "pitfire", "armypoint", "watchtower", "mine"];
export const isZone = (st: Structure) => !OUTDOOR.includes(st.type) && !st.buildUntil;
/** Buildings people are kept warm in, with a hearth the town feeds. */
export const HEATED: StructureType[] = ["house", "apartment", "townhall", "school", "barracks", "archery", "armoury", "wizardhut", "nobleyard", "armyschool", "laboratory"];
export const isHeated = (st: Structure) => HEATED.includes(st.type);
/** Workshops warm from their own work. W while staffed. */
const PROCESS_HEAT: Partial<Record<StructureType, number>> = { kitchen: 6000, refinery: 10000, forge: 15000 };
/** Buildings dug into the ground: storehouse cellars and the ice house. */
const EARTH: Partial<Record<StructureType, number>> = { storehouse: 3, icefactory: 3, watermill: 1.2 };

export function defaultHearth(st: Structure): HearthKind | undefined {
  if (!isHeated(st)) return undefined;
  if (st.type === "townhall" || st.type === "school") return "chimney";
  return "open";
}

export interface Envelope {
  wall: WallMat;
  roof: RoofMat;
  /** Floor area and volume, m², m³. */
  Af: number;
  V: number;
  storeys: number;
  /** Conductances, W/K: walls + openings, roof, floor to ground. */
  UAwalls: number;
  UAroof: number;
  UAfloor: number;
  roofArea: number;
  ach0: number;
  /** Heat capacity of the room, J/K. */
  C: number;
}

/** The building's walls and roof, from its type, level and grade (the grades' re-materialling). */
export function materials(st: Structure): { wall: WallMat; roof: RoofMat } {
  const g = grade(st.level);
  let wall: WallMat;
  let roof: RoofMat;
  if (st.type === "house" || st.type === "apartment") {
    const tier = st.type === "apartment" ? 3 : homeTier(st.level);
    wall = [WALLS.daub, WALLS.log, WALLS.plaster, WALLS.dressed][tier];
    roof = g >= 2 ? ROOFS.copper : g >= 1 ? ROOFS.slate : ROOFS.thatch;
  } else if (st.type === "storehouse" || st.type === "watermill" || st.type === "icefactory") {
    wall = g >= 1 ? WALLS.rubble : WALLS.log;
    roof = g >= 1 ? ROOFS.slate : ROOFS.shingle;
  } else {
    wall = g >= 2 ? WALLS.dressed : g >= 1 ? WALLS.plaster : st.type === "townhall" ? WALLS.plaster : WALLS.log;
    roof = g >= 2 ? ROOFS.copper : g >= 1 || st.type === "townhall" ? ROOFS.slate : ROOFS.thatch;
  }
  if (st.roofKind && ROOFS[st.roofKind]) roof = ROOFS[st.roofKind];
  return { wall, roof };
}

export function envelope(st: Structure): Envelope {
  const { wall, roof } = materials(st);
  const tier = st.type === "house" ? homeTier(st.level) : st.type === "apartment" ? 3 : 0;
  const storeys = tier >= 2 ? 2 : 1;
  const Lx = st.w * TILE_M;
  const Ly = st.h * TILE_M;
  const Af = Lx * Ly * storeys;
  const height = 2.7 * storeys;
  const V = Lx * Ly * height;
  const perim = 2 * (Lx + Ly);
  const openings = 2 + Math.max(2, Math.round(perim / 8)); // one door, a shuttered window every 8 m
  const doorArea = 2;
  const winArea = openings - 2;
  const wallArea = Math.max(0, perim * height - doorArea - winArea);
  const roofArea = (Lx * Ly) / Math.cos((roof.pitch * Math.PI) / 180);
  const UAwalls = wallArea * wall.U + doorArea * 3.0 + winArea * 5.0;
  const UAroof = roofArea * roof.U;
  const earth = EARTH[st.type] ?? 1;
  const UAfloor = Lx * Ly * 0.9 * earth;
  const C = 1200 * V + wall.cm * 1000 * Lx * Ly * storeys;
  return { wall, roof, Af, V, storeys, UAwalls, UAroof, UAfloor, roofArea, ach0: wall.ach, C };
}

export function zoneOf(st: Structure, T0 = 10): Zone {
  st.zone ??= { T: T0, co: 0, Ts: T0, creo: 0, burn: 0 };
  if (isHeated(st)) st.hearth ??= defaultHearth(st);
  return st.zone;
}

/** Air changes an hour: draughts grow with wind and a building's disrepair; a hearth's draw adds more. */
export function achOf(st: Structure, env: Envelope, v: number, doors: number): number {
  const cond = st.condition / 100;
  const hearth = st.hearth ? HEARTHS[st.hearth].dAch : 0;
  return env.ach0 * (1 + 0.12 * v) * (1 + 0.6 * (1 - cond)) + hearth + 0.4 * doors;
}

/** Occupants of a zone this step: awake and asleep. */
export interface Occ { awake: number; asleep: number }

/** What the fire burns, in the order the town's policy allows. */
function fuelChoice(s: GameState, kind: HearthKind): FuelKey[] {
  if (kind === "brazier") return ["charcoal", "coal"];
  if (kind === "boiler") return ["coal", "charcoal", "peat", "wood"];
  const coalOk = !!HEARTHS[kind].flued;
  const pol = s.policy;
  if (coalOk && pol?.coalFirst) return ["coal", "peat", "wood", "charcoal"];
  return coalOk ? ["wood", "peat", "coal", "charcoal"] : ["wood", "peat"];
}

function fuelDef(s: GameState, k: FuelKey): FuelDef {
  if (k === "wood") return woodFuel(s.stores?.woodMC ?? 0.3);
  return FUELS[k];
}

/** Draws kg of a fuel from the stores; returns what was had. */
function draw(s: GameState, k: FuelKey, kg: number): number {
  const units = kg / FUEL_UNIT_KG;
  const got = Math.min(units, s.res[k]);
  s.res[k] -= got;
  return got * FUEL_UNIT_KG;
}

/**
 * Ten game minutes of every zone: the fire picks its rate to hold the
 * target, fuel comes out of the stores, the room follows the exact solution,
 * and smoke, soot, carbon monoxide and leaked heat go where they go.
 */
export function stepZones(s: GameState, dtMin: number, a: Air, occ: Map<number, Occ>) {
  const c = clock(s.time);
  const dt = dtMin * 60;
  const r = rng(Math.floor(s.time) * 131 + s.seed);
  const target = s.policy?.heat ?? 10;
  let smokeKg = 0;
  let heatW = 0;
  const fires = fireAir(s);
  for (const st of s.structures) {
    if (!isZone(st)) continue;
    // The open air round this building: warmer inside a lit pit fire's radius.
    const [bx, by] = center(st);
    const To = a.T + airBoost(fires, bx, by);
    const z = zoneOf(st, To);
    const env = envelope(st);
    const o = occ.get(st.id) ?? { awake: 0, asleep: 0 };
    const people = o.awake + o.asleep;
    const Qocc = 150 * o.awake + 100 * o.asleep;
    const kitchenOn = st.type in PROCESS_HEAT && st.workers.length > 0 && c.hour >= 6 && c.hour < 20;
    let Qproc = kitchenOn ? PROCESS_HEAT[st.type]! : 0;
    const Tg = a.Tg;
    const kind = st.hearth;
    const base = kind ? HEARTHS[kind] : undefined;
    // Draught and flue (Abstract ideas): more of the fire into the room.
    const def = base ? { ...base, eta: Math.min(0.95, base.eta * (1 + kmod(s, "ABSTRACT"))) } : undefined;
    const ach = achOf(st, env, a.v, o.awake * 2);
    const Hv = 0.333 * env.V * ach;
    const Hout = env.UAwalls + env.UAroof + Hv;
    // A warmed floor (hypocaust, radiators, a hearthstone) cuts the loss to the cold ground.
    const UAfloor = env.UAfloor * (1 - (def?.floor ?? 0));
    const H = Hout + UAfloor;
    // The fire: burn to hold the target while people are in; bank it low when empty.
    let mdot = 0;
    let fuel: FuelDef | undefined;
    // Nobody in, no fire: the town does not burn wood on empty rooms.
    if (def && people > 0) {
      const want = target;
      const need = H * want - Hout * To - UAfloor * Tg - Qocc - Qproc;
      // Burn at the rate that holds the target; a stove's mass smooths what it gives out.
      if (def?.mass) {
        // Bring the stove's mass to the temperature at which it gives out what the room needs, over an hour.
        const Tset = want + Math.max(0, need) / 250;
        mdot = Math.max(0, Math.max(0, need) + ((Tset - z.Ts) * 600000) / 3600) / def.eta;
      } else if (need > 0) mdot = need / def.eta;
      if (mdot > 0) {
        for (const k of fuelChoice(s, kind!)) {
          const f = fuelDef(s, k);
          const mj = lhv(f.lhvDry, f.mc);
          const kgH = Math.min(def.maxKgH, (mdot * 3600) / (mj * 1e6));
          const got = draw(s, k, (kgH * dtMin) / 60);
          if (got > 0) {
            mdot = (got * 60) / dtMin;
            fuel = f;
            break;
          }
        }
        if (!fuel) {
          mdot = 0;
          if (people > 0 && z.warnDay !== c.day && c.season === "winter") {
            z.warnDay = c.day;
            log(s, `No fuel for the ${def.name.toLowerCase()} in the ${CATALOG[st.type].name.toLowerCase()} at ${st.x},${st.y}. It goes cold.`, "bad");
          }
        }
      }
    }
    // The kitchen's own fire burns wood too.
    if (kitchenOn && st.type === "kitchen") {
      const got = draw(s, "wood", (1.5 * dtMin) / 60);
      if (got <= 0) Qproc = 0;
      else smokeKg += (got * woodFuel(s.stores?.woodMC ?? 0.3).pm) / 1000;
    }
    const P = fuel ? (mdot / 3600) * lhv(fuel.lhvDry, fuel.mc) * 1e6 : 0;
    z.burn = mdot;
    z.fuel = fuel?.key;
    let Qfire = 0;
    if (def && P > 0) {
      if (def?.mass) {
        z.Ts += (dt * (def.eta * P - 250 * (z.Ts - z.T))) / 600000;
      } else Qfire = def.eta * P;
    } else if (def?.mass) {
      z.Ts += (dt * (-250 * (z.Ts - z.T))) / 600000;
    }
    const Qstove = def?.mass ? 250 * (z.Ts - z.T) : 0;
    // Exact update of the room.
    const Teq = (Hout * To + UAfloor * Tg + Qocc + Qproc + Qfire + Qstove) / H;
    z.T = Teq + (z.T - Teq) * Math.exp((-H * dt) / env.C);
    if (!def?.mass) z.Ts = z.T;
    // Carbon monoxide: dc/dt = G/V − ACH·c, per hour, exact.
    if (fuel && def) {
      const G = mdot * fuel.co * (1 - def.flue) * 1000; // mg/h
      const ceq = G / (env.V * Math.max(0.05, ach));
      z.co = ceq + (z.co - ceq) * Math.exp((-ach * dtMin) / 60);
      if (def?.flued) z.creo += ((mdot * dtMin) / 60) * fuel.creo;
      smokeKg += ((mdot * dtMin) / 60) * fuel.pm / 1000 * (kind === "open" ? 1 : 1);
    } else {
      z.co = z.co * Math.exp((-ach * dtMin) / 60);
    }
    heatW += Hout * Math.max(0, z.T - To);
    // Hazards, rolled as hazards over the step: a chimney fire, a thatch catching.
    if (def && mdot > 0) {
      const hours = dtMin / 60;
      const lamCf = def?.flued ? 4e-5 * Math.exp(z.creo) : 0;
      const lamIg = def.ignite * env.roof.ignite;
      if (r() < 1 - Math.exp(-(lamCf + lamIg) * hours)) houseFire(s, st, lamCf > lamIg ? "chimney" : "roof");
    }
  }
  const [hx, hy] = townCentre(s);
  const scav = a.regime === "blizzard" ? 0.9 : a.snowing ? 0.6 : 0;
  if (smokeKg > 0) emit(s, "smk", smokeKg * (1 - scav), hx, hy);
  if (heatW > 0) emit(s, "heat", (heatW * dtMin) / 60 / 1e6, hx, hy);
}

function townCentre(s: GameState): [number, number] {
  const hall = s.structures.find((st) => st.type === "townhall");
  return hall ? center(hall) : [40, 30];
}

/** A chimney fire or a roof catching: half the building's strength gone, the flue burnt clean. */
function houseFire(s: GameState, st: Structure, cause: "chimney" | "roof") {
  st.hp = Math.max(1, Math.round(st.hp * (cause === "roof" ? 0.35 : 0.55)));
  st.condition = Math.max(0, st.condition - 30);
  if (st.zone) st.zone.creo = 0;
  log(s, cause === "chimney"
    ? `Chimney fire at the ${CATALOG[st.type].name.toLowerCase()} (${st.x},${st.y}) — the soot of green wood caught. Badly burnt.`
    : `The ${materials(st).roof.name.toLowerCase()} roof of the ${CATALOG[st.type].name.toLowerCase()} (${st.x},${st.y}) caught from the hearth.`, "bad");
}

/** A zone's temperature, or the open air's for outdoor places. */
export function placeT(st: Structure | undefined, a: Air): number {
  if (!st || !isZone(st) || !st.zone) return a.T;
  return st.zone.T;
}

/** ppm from mg/m³. */
export const ppm = (mg: number) => mg / 1.145;
