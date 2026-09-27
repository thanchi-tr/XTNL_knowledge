import { log, clock } from "./state";
import { MONSTERS } from "./bestiary";
import { plural } from "./words";
import { MAP_H, MAP_W, Overlay, RAW_FOODS, Terrain, type GameState, type Lair, type LairKind, type MonsterKind, type NodeKind, type ResourceKey, type Roamer, type Scout, type Villager } from "./types";
import { air } from "./weather";
import { MEAL_KCAL, bodyOf, killBody } from "./body";
import { aggroOf, emit, rho, unitPi } from "./aggro";
import { defencePower } from "./combat";
import { center, dist, idx, inBounds, rng } from "./world";
import { LAIR_NAMES, TORCH_SIGHT, markSeen, seesPoint, torchLit } from "./vision";
import { wildAmount, wildCrop, wildKindAt } from "./forage";

/**
 * The wilds: what lives out in the fog.
 *
 * Lairs lie deep in the land, far from where a town is founded — tombs
 * nearest, shadow realm gates further, a dragon pit furthest — and every few
 * days each looses a band that roams the map. Bands wander; the longer the
 * town has stood, the likelier they turn toward it. One that comes within
 * sight of a building attacks: it becomes a raid, arriving from where it
 * stood. Lairs grow stronger with time, and so do their bands.
 *
 * Knights and wizards go out on expeditions into the fog (design §4): their
 * pace and their appetite come from the load they carry, their heading
 * drifts with what they can see, and they can lose the way. Extraction nodes
 * out there give salt, bog iron, coal, peat, flint and silver — and wake
 * whatever guards them.
 */

export const LAIR_SIZE: Record<LairKind, [number, number]> = {
  tomb: [4, 3], shadowgate: [4, 4], dragonpit: [6, 5], goblinwarren: [5, 3], webhollow: [4, 4], frostrift: [5, 4], titangate: [6, 5],
};
/** How far from where the town is founded each kind of gate lies, at the nearest. */
const LAIR_FROM: Record<LairKind, number> = { goblinwarren: 50, webhollow: 60, tomb: 70, frostrift: 90, shadowgate: 110, titangate: 130, dragonpit: 150 };
/** The level each kind of gate opens at; each gate adds its own depth bonus. */
export const LAIR_START: Record<LairKind, number> = { goblinwarren: 2, webhollow: 3, tomb: 3, frostrift: 5, shadowgate: 7, titangate: 9, dragonpit: 14 };
/** What each lair breeds, by the level it has reached. */
const BROOD: Record<LairKind, { kind: MonsterKind; min: number }[]> = {
  tomb: [{ kind: "skeleton", min: 1 }, { kind: "ghoul", min: 4 }, { kind: "jiangshi", min: 7 }, { kind: "wraith", min: 10 }, { kind: "lich", min: 14 }, { kind: "gashadokuro", min: 30 }],
  shadowgate: [{ kind: "werewolf", min: 1 }, { kind: "yurei", min: 8 }, { kind: "banshee", min: 11 }, { kind: "oni", min: 15 }, { kind: "vampire", min: 20 }, { kind: "kitsune", min: 26 }, { kind: "demon", min: 36 }],
  dragonpit: [{ kind: "salamander", min: 1 }, { kind: "griffin", min: 18 }, { kind: "wyvern", min: 22 }, { kind: "hydra", min: 28 }, { kind: "dragon", min: 40 }],
  goblinwarren: [{ kind: "goblin", min: 1 }, { kind: "wolf", min: 4 }, { kind: "ogre", min: 10 }, { kind: "troll", min: 14 }, { kind: "cyclops", min: 20 }],
  webhollow: [{ kind: "spider", min: 1 }, { kind: "bat", min: 2 }, { kind: "kappa", min: 5 }, { kind: "jorogumo", min: 10 }, { kind: "basilisk", min: 16 }],
  frostrift: [{ kind: "wolf", min: 1 }, { kind: "wisp", min: 4 }, { kind: "wendigo", min: 14 }, { kind: "frostgiant", min: 18 }, { kind: "nian", min: 25 }],
  titangate: [{ kind: "gargoyle", min: 1 }, { kind: "golem", min: 10 }, { kind: "minotaur", min: 13 }, { kind: "cyclops", min: 18 }, { kind: "basilisk", min: 22 }, { kind: "gashadokuro", min: 32 }],
};

/** What a gate breeds at its level now, and at the next step up the brood. */
export function broodOf(l: Lair): { now: MonsterKind; next?: { kind: MonsterKind; at: number } } {
  const list = BROOD[l.kind];
  const now = [...list].reverse().find((b) => l.level >= b.min) ?? list[0];
  const next = list.find((b) => b.min > l.level);
  return { now: now.kind, next: next ? { kind: next.kind, at: next.min } : undefined };
}

/** Tiles a band crosses in a game minute: a slow march, about 1.5 an hour. */
const ROAM_PACE = 1.5 / 60;
/** How near a building a band must come before it attacks. */
export const STRIKE_RANGE = 8;

/** Sets the lairs down for a new map, or an old save that has none. */
export function placeLairs(s: GameState) {
  const fresh = !s.lairs;
  if (!fresh && s.lairsV === 2) return;
  const r = rng(s.seed * 7 + 13 + (fresh ? 0 : 977));
  const hall = s.structures.find((st) => st.type === "townhall");
  const home: [number, number] = hall ? center(hall) : [37, 26];
  const older: LairKind[] = ["tomb", "tomb", "tomb", "shadowgate", "shadowgate", "dragonpit"];
  const newer: LairKind[] = ["goblinwarren", "goblinwarren", "webhollow", "webhollow", "frostrift", "frostrift", "titangate"];
  // An older save keeps the gates it has; only the newer kinds are set into it, in the fog.
  const want = fresh ? [...older, ...newer] : newer;
  s.lairs ??= [];
  s.lairsV = 2;
  let id = s.lairs.reduce((a, l) => Math.max(a, l.id), 0) + 1;
  for (const kind of want) {
    const [w, h] = LAIR_SIZE[kind];
    for (let tries = 0; tries < 400; tries++) {
      const x = 2 + Math.floor(r() * (MAP_W - w - 4));
      const y = 2 + Math.floor(r() * (MAP_H - h - 4));
      if (dist(home, [x, y]) < LAIR_FROM[kind]) continue;
      if (s.lairs.some((l) => Math.abs(l.x - x) < 22 && Math.abs(l.y - y) < 22)) continue;
      if (!fresh && s.map.seen?.[idx(x, y)]) continue;
      let ok = true;
      for (let yy = y; yy < y + h && ok; yy++) for (let xx = x; xx < x + w; xx++) if (s.map.terrain[idx(xx, yy)] === Terrain.Water) ok = false;
      if (!ok) continue;
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          const i = idx(xx, yy);
          if (s.map.terrain[i] === Terrain.Pavement || s.map.terrain[i] === Terrain.Forest) s.map.terrain[i] = Terrain.Grass;
          s.map.overlay[i] = Overlay.Lair;
          s.map.meta[i] = 0;
        }
      }
      // The deeper in the country, the higher the gate stands above others of its kind.
      const bonus = Math.max(0, Math.floor((dist(home, [x, y]) - LAIR_FROM[kind]) / 25));
      s.lairs.push({ id: id++, kind, x, y, w, h, level: LAIR_START[kind] + bonus, bonus, discovered: false, nextSpawnAt: s.time + (2 + r() * 3) * 24 * 60 });
      break;
    }
  }
  s.roamers ??= [];
}

const breed = (l: Lair) => [...BROOD[l.kind]].reverse().find((b) => l.level >= b.min) ?? BROOD[l.kind][0];

/** Lairs grow with the days: a level every three. */
export const lairLevel = (s: GameState, l: Lair) => LAIR_START[l.kind] + (l.bonus ?? 0) + lairGrowth(clock(s.time).day);

/**
 * How much a gate has grown with the days: a level every three days for the
 * first sixty, then one every eight — the land does not outgrow every town
 * for ever, so a town that holds on can still catch up and carry the fight to
 * the gates.
 */
export const lairGrowth = (day: number) => (day <= 60 ? Math.floor(day / 3) : 20 + Math.floor((day - 60) / 8));

/** The chance, when a band picks where to go next, that it turns toward the town. */
export const turnChance = (s: GameState) => Math.min(0.7, 0.25 + clock(s.time).day * 0.01);

/** Band movement and scouting: on the minute, so both glide rather than jump. */
export function stepWilds(s: GameState, minutes: number) {
  for (const b of s.roamers ?? []) {
    // A hunter follows its quarry at a run.
    if (b.hunt !== undefined) {
      const q = s.villagers.find((v) => v.id === b.hunt)?.scout;
      if (q) {
        b.tx = q.x;
        b.ty = q.y;
      } else b.hunt = undefined;
    }
    const d = Math.hypot(b.tx - b.x, b.ty - b.y);
    const step = Math.min(d, (b.hunt !== undefined ? HUNT_PACE / 60 : ROAM_PACE) * minutes);
    if (d > 0.01) {
      b.x += ((b.tx - b.x) / d) * step;
      b.y += ((b.ty - b.y) / d) * step;
    }
  }
  for (const v of s.villagers) if (v.scout) stepScout(s, v, minutes);
}

/** On the hour: lairs grow and breed, bands choose where to go, and those near the town attack. */
export function wildsHourly(s: GameState, r: () => number) {
  placeLairs(s);
  const roamers = (s.roamers ??= []);
  for (const l of s.lairs!) {
    l.level = lairLevel(s, l);
    if (s.time < l.nextSpawnAt) continue;
    l.nextSpawnAt = s.time + (2 + r() * 2) * 24 * 60;
    if (roamers.filter((b) => b.lair === l.id).length >= 3) continue;
    const kind = breed(l);
    const def = MONSTERS[kind.kind];
    const count = def.pack ? def.pack[0] + Math.floor(r() * (def.pack[1] - def.pack[0] + 1)) : 1 + Math.floor(r() * 2);
    const [cx, cy] = center(l);
    s.nextRoamerId = (s.nextRoamerId ?? 1) + 1;
    roamers.push({ id: s.nextRoamerId, lair: l.id, kind: kind.kind, level: Math.max(def.min, Math.min(def.max, l.level)), count, x: cx, y: cy + l.h / 2 + 1, tx: cx, ty: cy });
    retarget(s, roamers[roamers.length - 1], r);
    if (l.discovered) log(s, `Something comes out of the ${LAIR_NAMES[l.kind]} at ${l.x},${l.y}.`, "bad");
  }
  for (const b of roamers) if (b.hunt === undefined && Math.hypot(b.tx - b.x, b.ty - b.y) < 0.5) retarget(s, b, r);

  // A band that comes near a building attacks — one raid at a time, and only
  // when the land's purse will pay for it and it would not overwhelm what
  // defends that building beyond the director's aim (design §2.3). Otherwise
  // it circles, waiting. A hunter on a hero's trail is not held back.
  if (!s.raid) {
    for (const b of roamers) {
      const near = nearestStructure(s, b);
      if (!near || near.d > STRIKE_RANGE) continue;
      const cost = bandCost(b);
      if (b.hunt === undefined) {
        const pi = unitPi(b.kind, b.level) * b.count * b.count;
        const local = defencePower(s, near.st);
        // Undefended ground is easy prey; a defended building is not stormed with more than the aim.
        if (aggroOf(s).purse < cost || (local > 0 && pi > 1.5 * rho(s) * local)) continue;
      }
      aggroOf(s).purse = Math.max(0, aggroOf(s).purse - cost);
      aggroOf(s).lastWaveAt = s.time;
      s.roamers = roamers.filter((x) => x !== b);
      const [tx, ty] = center(near.st);
      const side = Math.abs(b.x - tx) > Math.abs(b.y - ty) ? (b.x < tx ? "west" : "east") : b.y < ty ? "north" : "south";
      s.raid = {
        arrivesAt: s.time + 45, party: [{ kind: b.kind, level: b.level, count: b.count }], side, phase: "incoming",
        target: near.st.id, reach: 0, origin: [b.x, b.y], combatants: [], projectiles: [], clock: 0, nextId: 1,
      };
      const lair = s.lairs!.find((l) => l.id === b.lair);
      log(s, `A band from the fog — ${b.count > 1 ? `${b.count} ${plural(MONSTERS[b.kind].name)}` : MONSTERS[b.kind].name} (L${b.level})${lair ? ` out of a ${LAIR_NAMES[lair.kind]}` : ""} — is at the edge of town!`, "bad");
      break;
    }
  }
}

/** What a band costs the director's purse to strike: as a wave of its size. */
export const bandCost = (b: { level: number; count: number }) => 12 * Math.pow(b.level, 1.5) * b.count;

function nearestStructure(s: GameState, p: { x: number; y: number }) {
  let best: { st: GameState["structures"][number]; d: number } | undefined;
  for (const st of s.structures) {
    const cx = Math.max(st.x, Math.min(p.x, st.x + st.w));
    const cy = Math.max(st.y, Math.min(p.y, st.y + st.h));
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (!best || d < best.d) best = { st, d };
  }
  return best;
}

function retarget(s: GameState, b: Roamer, r: () => number) {
  if (r() < turnChance(s)) {
    const near = nearestStructure(s, b);
    if (near) {
      const [x, y] = center(near.st);
      b.tx = x;
      b.ty = y;
      return;
    }
  }
  const a = r() * Math.PI * 2;
  const d = 8 + r() * 18;
  b.tx = Math.max(2, Math.min(MAP_W - 3, b.x + Math.cos(a) * d));
  b.ty = Math.max(2, Math.min(MAP_H - 3, b.y + Math.sin(a) * d));
}

// ── Heroes' packs and expeditions (design §4) ─────────────

export const PACK_SLOTS = 6;
export const TORCH_MINUTES = 120;
/** A ration: three meals' worth, about 3300 kcal of hardtack in a kilo. */
export const RATION_MEALS = 3;
export const RATION_RAW = 4;
export const RATION_KCAL = RATION_MEALS * MEAL_KCAL;
export const canPack = (v: Villager) => v.role === "knight" || v.role === "wizard";

/** Out in the fog-country one tile stands for about 0.72 km of walking. */
export const TILE_KM = 0.72;
/** Body mass, and the kit a hero carries before anything in the pack (kg). */
const W_BODY = 70;
const KIT_KG = 12;
const ITEM_KG: Record<string, number> = { torch: 0.5, ration: 1 };
/** Most a hero carries home: pack, kit and haul (kg); a horse takes more. */
export const carryCap = (v: Villager) => (mounted(v) ? 90 : 30);
const mounted = (v: Villager) => v.role === "knight" && v.rank >= 6;

type Result = string | null;

function packSlot(v: Villager): number {
  v.pack ??= Array(PACK_SLOTS).fill(null);
  return v.pack.findIndex((p) => !p);
}

/** Puts a torch from the store into a hero's pack. */
export function packTorch(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || !canPack(v)) return "Only knights and wizards carry a pack.";
  if (v.scout) return "Not while they are out in the fog.";
  const slot = packSlot(v);
  if (slot < 0) return "The pack is full — six slots.";
  if (s.res.torches < 1) return "No torches in store. The refinery makes them from wood and coal.";
  s.res.torches -= 1;
  v.pack![slot] = "torch";
  return null;
}

/** A ration into the pack: three meals, or else four of the most plentiful raw food. */
export function packRation(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || !canPack(v)) return "Only knights and wizards carry a pack.";
  if (v.scout) return "Not while they are out in the fog.";
  const slot = packSlot(v);
  if (slot < 0) return "The pack is full — six slots.";
  if (s.res.meals >= RATION_MEALS) s.res.meals -= RATION_MEALS;
  else {
    const raw = RAW_FOODS.reduce((a, k) => (s.res[k] > s.res[a] ? k : a), RAW_FOODS[0]);
    if (s.res[raw] < RATION_RAW) return `No food to spare: a ration takes ${RATION_MEALS} meals or ${RATION_RAW} of a crop.`;
    s.res[raw] -= RATION_RAW;
  }
  v.pack![slot] = "ration";
  return null;
}

/** Takes an unlit torch or a ration back out of a pack. A burning torch is thrown away. */
export function unpackSlot(s: GameState, villagerId: number, slot: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  const item = v?.pack?.[slot];
  if (!v || !item) return "Nothing in that slot.";
  if (v.scout) return "Not while they are out in the fog.";
  if (item === "torch") s.res.torches += 1;
  if (item === "ration") s.res.meals += RATION_MEALS;
  v.pack![slot] = null;
  return null;
}

const count = (v: Villager, item: string) => v.pack?.filter((p) => p === item).length ?? 0;
const torchMinutesLeft = (v: Villager) =>
  (v.pack ?? []).reduce((a, p) => a + (p === "torch" ? TORCH_MINUTES : p?.startsWith("torch:") ? Number(p.slice(6)) : 0), 0);

/** Kilograms of a haul: fuel units are ten kilos, everything else one. */
export function haulKg(h: Partial<Record<ResourceKey, number>> | undefined): number {
  let kg = 0;
  for (const [k, n] of Object.entries(h ?? {})) kg += (n as number) * (["wood", "coal", "peat", "charcoal"].includes(k) ? 10 : 1);
  return kg;
}

/** Everything carried, kg: kit, pack and haul. A mounted knight's horse takes all but the kit. */
export function loadKg(v: Villager): number {
  const pack = (v.pack ?? []).reduce((a, p) => a + (p ? ITEM_KG[p.startsWith("torch") ? "torch" : p] ?? 1 : 0), 0);
  const all = KIT_KG + pack + haulKg(v.scout?.haul);
  return mounted(v) ? KIT_KG / 2 : all;
}

/**
 * Pandolf's load-carriage equation (§4.1): watts to walk at V m/s carrying
 * L kg over terrain η on grade G %.
 */
export function pandolf(L: number, V: number, eta: number, G = 0, W = W_BODY): number {
  return 1.5 * W + 2.0 * (W + L) * (L / W) ** 2 + eta * (W + L) * (1.5 * V * V + 0.35 * V * G);
}

/** The fastest pace (m/s) that keeps within a power budget: the quadratic of §4.1. */
export function paceFor(L: number, eta: number, Mcap: number, G = 0, W = W_BODY): number {
  const a = 1.5 * eta * (W + L);
  const b = 0.35 * eta * (W + L) * G;
  const c = 1.5 * W + 2 * (W + L) * (L / W) ** 2 - Mcap;
  if (c >= 0) return 0.2;
  const disc = b * b - 4 * a * c;
  return Math.max(0.2, (-b + Math.sqrt(disc)) / (2 * a));
}

/** Terrain coefficient under a point, snow included. */
function terrainEta(s: GameState, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(tx, ty)) return 1.2;
  const t = s.map.terrain[idx(tx, ty)];
  let eta = t === Terrain.Pavement ? 1.0 : t === Terrain.Forest ? 1.5 : t === Terrain.Water ? 1.8 : t === Terrain.Bank ? 1.1 : t === Terrain.Hill ? 1.5 : t === Terrain.Marsh ? 1.9 : 1.2;
  const snowCm = air(s).snowDepth * 100;
  if (snowCm > 1) eta = Math.max(eta, 1.3 + 0.082 * snowCm);
  return eta;
}

/** How far out a hero's pack takes them and back: hours of light, of food, and tiles out-and-back. */
export function adventureReach(v: Villager): { torches: number; rations: number; lightHours: number; foodHours: number; tiles: number; load: number; watts: number; pace: number } {
  const torches = count(v, "torch");
  const rations = count(v, "ration");
  const load = loadKg(v);
  const V = mounted(v) ? 1.8 : Math.min(1.3, paceFor(load, 1.2, 450));
  const watts = mounted(v) ? 160 : pandolf(load, V, 1.2);
  const kcalH = (watts * 3600) / 4184;
  const lightHours = (torches * TORCH_MINUTES) / 60;
  const foodHours = (rations * RATION_KCAL + (v.body?.Eg ?? 1500)) / kcalH;
  const tilesPerHour = (V * 3.6) / TILE_KM;
  const tiles = Math.floor((Math.min(lightHours, foodHours) * tilesPerHour) / 2);
  return { torches, rations, lightHours, foodHours: Math.round(foodHours * 10) / 10, tiles, load, watts: Math.round(watts), pace: V };
}

/**
 * Sends a hero out toward a tile — or to work a discovered extraction node
 * there. They need a torch and a ration to set out.
 */
export function sendScout(s: GameState, villagerId: number, tx: number, ty: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || !canPack(v)) return "Only knights and wizards go out into the fog.";
  if (v.scout) return "Already out.";
  if (v.deployedUntil && v.deployedUntil > s.time) return "Away on a sortie.";
  if (!v.pack?.some((p) => p === "torch")) return "Pack a torch first — nobody sees in the fog without one.";
  if (!v.pack?.some((p) => p === "ration")) return "Pack a ration first — nobody walks the fog on an empty stomach.";
  if (v.health < 40) return `${v.name} is too hurt to go (${Math.round(v.health)} health).`;
  if (!inBounds(Math.floor(tx), Math.floor(ty))) return "Off the map.";
  const hall = s.structures.find((st) => st.type === "townhall");
  const [hx, hy] = hall ? center(hall) : [tx, ty];
  if (Math.hypot(tx - hx, ty - hy) < 6) return "Pick somewhere further out.";
  const node = (s.nodes ?? []).find((n) => n.discovered && Math.hypot(n.x - tx, n.y - ty) <= 3);
  const reach = adventureReach(v);
  lightNext(v);
  v.guard = null;
  v.scout = {
    x: hx, y: hy, tx: (node ? node.x : tx) + 0.5, ty: (node ? node.y : ty) + 0.5, hx, hy, phase: "out", haul: {},
    nextFindAt: s.time + 60, psi: 0, err: 0, node: node?.id, worked: 0,
  };
  log(s, `${v.name} sets out ${node ? `to work the ${NODE_DEFS[node.kind].name.toLowerCase()} at ${node.x},${node.y}` : "on an adventure"} with ${reach.torches} torch${reach.torches === 1 ? "" : "es"} and ${reach.rations} ration${reach.rations === 1 ? "" : "s"}, carrying ${Math.round(reach.load)} kg.`, "info");
  return null;
}

function lightNext(v: Villager): boolean {
  const i = v.pack?.findIndex((p) => p === "torch") ?? -1;
  if (i < 0) return false;
  v.pack![i] = `torch:${TORCH_MINUTES}`;
  return true;
}

/** A hero who does not come back: their pack and whatever they found are lost with them. */
function lose(s: GameState, v: Villager, why: string) {
  killBody(s, v, why);
}

/** Something found on the road: the further out, the likelier and the richer. */
function find(s: GameState, sc: Scout, r: () => number) {
  const far = Math.min(1, Math.hypot(sc.x - sc.hx, sc.y - sc.hy) / 150);
  if (r() > 0.35 + 0.35 * far) return;
  const haul = (sc.haul ??= {});
  const add = (k: ResourceKey, n: number) => (haul[k] = (haul[k] ?? 0) + n);
  const roll = r();
  if (roll < 0.015 * far) add("gold", 1);
  else if (roll < 0.045 * far) add("diamond", 1);
  else if (roll < 0.1 * far) add("platinum", 1);
  else if (roll < 0.3) add("silver", 1 + Math.floor(r() * (1 + 3 * far)));
  else if (roll < 0.6) {
    const kind = wildKindAt(s, sc.x, sc.y, r());
    add(wildCrop(kind), wildAmount(kind));
  } else add("coin", Math.round(5 + r() * 30 * (0.5 + far)));
}

/** Whether a hero sees a landmark: the town's light, the river, a lair, within sight. */
function landmarkInSight(s: GameState, x: number, y: number, sightTiles: number): boolean {
  if (seesPoint(s, x, y)) return true;
  const R = Math.max(1, Math.ceil(sightTiles));
  for (let dy = -R; dy <= R; dy += Math.max(1, Math.floor(R / 3))) for (let dx = -R; dx <= R; dx += Math.max(1, Math.floor(R / 3))) {
    const gx = Math.floor(x + dx);
    const gy = Math.floor(y + dy);
    if (!inBounds(gx, gy)) continue;
    const t = s.map.terrain[idx(gx, gy)];
    if (t === Terrain.Water || s.map.overlay[idx(gx, gy)] === Overlay.Lair) return true;
  }
  return false;
}

const navSkill = (v: Villager) => (v.traits?.includes("navigator") ? 0.9 : v.role === "knight" ? 0.6 : 0.5);

/**
 * One minute of an expedition (§4.2–4.5): eat from the pack when the stores
 * run low, burn the torch, walk at the pace the load allows with the heading
 * error wandering, lose the way when the drift outruns what can be seen,
 * work a node, run from what hunts them.
 */
function stepScout(s: GameState, v: Villager, minutes: number) {
  const sc = v.scout!;
  const r = rng(Math.floor(s.time) * 17 + v.id);
  const b = bodyOf(v);
  const a = air(s);
  const c = clock(s.time);

  // Food: a ration when the ready energy runs low.
  if (b.Eg < 800) {
    const i = v.pack?.findIndex((p) => p === "ration") ?? -1;
    if (i >= 0) {
      v.pack![i] = null;
      b.Eg += RATION_KCAL;
      if (b.Eg > 2000) {
        b.F = Math.min(20, b.F + ((b.Eg - 2000) * 0.8) / 7700);
        b.Eg = 2000;
      }
    }
  }
  // Water from streams and snow on the trail: fine unless it is deep winter with no fire.
  if (a.T < -2 && !torchLit(v)) b.h2o += (1.5 / 1440) * minutes;
  else b.h2o = Math.max(0, b.h2o - minutes / 60);

  // The torch.
  const lit = v.pack?.findIndex((p) => p?.startsWith("torch:")) ?? -1;
  if (lit >= 0) {
    const left = Number(v.pack![lit]!.slice(6)) - minutes;
    if (left > 0) v.pack![lit] = `torch:${left}`;
    else {
      v.pack![lit] = null;
      if (!lightNext(v)) log(s, `${v.name}'s last torch gutters out.`, "bad");
    }
  }
  const torch = torchLit(v);
  const night = c.darkness > 0.5;
  const sightM = night ? (torch ? 12 : 3) : torch ? Math.max(12, a.vis) : Math.min(a.vis, 60);
  const sightTiles = sightM / (TILE_KM * 1000);

  // Pace: Pandolf within 450 W sustained (800 W running from something).
  const load = loadKg(v);
  const eta = terrainEta(s, sc.x, sc.y);
  const hunted = (s.roamers ?? []).find((q) => q.hunt === v.id);
  // Empty of ready energy, the legs go: fat alone will not drive a hard march (§1.6).
  const fuel = 0.35 + 0.65 * Math.min(1, b.Eg / 500);
  const Mcap = (hunted ? 800 : 450) * fuel;
  let V = mounted(v) ? (hunted ? 3.5 : 1.8) * fuel : Math.min(hunted ? 2.5 : 1.3, paceFor(load, eta, Mcap));
  const working = sc.node !== undefined && sc.phase === "out" && Math.hypot(sc.tx - sc.x, sc.ty - sc.y) < 0.6;
  if (working) V = 0;
  sc.power = working ? 400 : mounted(v) ? 160 : pandolf(load, V, eta);
  const stepTiles = ((V * 60) / (TILE_KM * 1000)) * minutes;

  // Lost: a correlated random walk until a landmark gives a fix.
  if (sc.lost !== undefined) {
    sc.lost += minutes;
    sc.psi = (sc.psi ?? 0) + Math.sqrt(minutes) * 0.5 * gauss(r);
    sc.x = Math.max(0, Math.min(MAP_W - 1, sc.x + Math.cos(sc.psi) * stepTiles));
    sc.y = Math.max(0, Math.min(MAP_H - 1, sc.y + Math.sin(sc.psi) * stepTiles));
    if (torch) markSeen(s, sc.x, sc.y, TORCH_SIGHT);
    if (landmarkInSight(s, sc.x, sc.y, sightTiles) && r() < (0.8 * navSkill(v) + 0.2) * (minutes / 10)) {
      sc.lost = undefined;
      sc.err = 0;
      sc.psi = 0;
      sc.phase = "back";
      log(s, `${v.name} finds a landmark and the way home.`, "good");
    }
    return;
  }

  // Heading error: a random walk per km, faster in poor sight, damped by skill and landmarks.
  const fix = landmarkInSight(s, sc.x, sc.y, sightTiles);
  if (driftStep(sc, stepTiles, sightM, navSkill(v), fix, minutes, r)) {
    sc.lost = 0;
    log(s, `${v.name} has lost the way in the ${night ? "dark" : a.vis < 100 ? "whiteout" : "fog"}.`, "bad");
    return;
  }

  // Auto turn-back (§4.3): home while food and light last 1.2 times the way home.
  if (sc.phase === "out") {
    const home = Math.hypot(sc.hx - sc.x, sc.hy - sc.y);
    const tilesPerMin = Math.max(0.01, (Math.max(0.5, V || 1.2) * 60) / (TILE_KM * 1000));
    const minsHome = home / tilesPerMin;
    const kcalHome = (minsHome / 60) * ((Math.max(sc.power, 300) * 3600) / 4184);
    const food = count(v, "ration") * RATION_KCAL + b.Eg;
    const full = haulKg(sc.haul) + KIT_KG >= carryCap(v);
    if (food <= 1.2 * kcalHome || torchMinutesLeft(v) <= 1.2 * minsHome || full) {
      sc.phase = "back";
      log(s, `${v.name} turns for home${full ? " with a full load" : food <= 1.2 * kcalHome ? " before the food runs out" : " while the torches last"}.`, "info");
    }
  }

  // Working a node.
  if (working && sc.phase === "out") {
    workNode(s, v, sc, minutes, r);
    return;
  }

  const [gx, gy] = sc.phase === "out" ? [sc.tx, sc.ty] : [sc.hx, sc.hy];
  const d = Math.hypot(gx - sc.x, gy - sc.y);
  const step = Math.min(d, stepTiles);
  if (d > 0.01) {
    const head = Math.atan2(gy - sc.y, gx - sc.x) + (sc.psi ?? 0);
    sc.x = Math.max(0, Math.min(MAP_W - 1, sc.x + Math.cos(head) * step));
    sc.y = Math.max(0, Math.min(MAP_H - 1, sc.y + Math.sin(head) * step));
  }
  // Fording water soaks the feet.
  if (s.map.terrain[idx(Math.floor(sc.x), Math.floor(sc.y))] === Terrain.Water) b.Wf = 1;
  if (torch) markSeen(s, sc.x, sc.y, TORCH_SIGHT);
  if (s.time >= (sc.nextFindAt ?? 0)) {
    sc.nextFindAt = s.time + 60;
    find(s, sc, r);
  }
  if (d - step < 0.3) {
    if (sc.phase === "out" && sc.node === undefined) {
      sc.phase = "back";
      log(s, `${v.name} reaches the place and turns for home.`, "info");
    } else if (sc.phase === "back") {
      v.scout = null;
      for (const q of s.roamers ?? []) if (q.hunt === v.id) q.hunt = undefined;
      if (v.pack) for (let i = 0; i < v.pack.length; i++) if (v.pack[i]?.startsWith("torch:")) v.pack[i] = null;
      const got = Object.entries(sc.haul ?? {}).filter(([, n]) => n);
      for (const [k, n] of got) {
        if (k === "tools") {
          for (let i = 0; i < Math.floor(n as number); i++) (s.toolsPending ??= []).push("flint");
        }
        s.res[k as ResourceKey] += n as number;
      }
      log(s, got.length
        ? `${v.name} is back from the adventure with ${got.map(([k, n]) => `${Math.round((n as number) * 10) / 10} ${k}`).join(", ")}.`
        : `${v.name} is back from the fog, empty-handed.`, got.length ? "good" : "info");
      return;
    }
  }
  // A band in the way: a fight in the dark, wounds, and a run for home.
  for (const q of s.roamers ?? []) {
    if (Math.hypot(q.x - sc.x, q.y - sc.y) > 1.5) continue;
    b.bleed = Math.max(b.bleed, 0.03);
    v.health = Math.max(0, v.health - 5 * minutes);
    emit(s, "bio", 0.03 * 60, sc.x, sc.y);
    if (v.health <= 0) return lose(s, v, `fell to ${plural(MONSTERS[q.kind].name).toLowerCase()} out in the fog`);
    if (sc.phase === "out") {
      sc.phase = "back";
      log(s, `${v.name} runs into ${plural(MONSTERS[q.kind].name).toLowerCase()} in the fog and turns for home, wounded.`, "bad");
    }
  }
  // Hunted: drop cargo, lightest value first, until the pace outruns the hunter (§4.5).
  if (hunted && sc.haul && haulKg(sc.haul) > 0) {
    const vHunter = HUNT_PACE * 1000 * TILE_KM / 3600; // m/s
    const dropOrder = Object.keys(sc.haul).sort((x, y) => (VALUE[x] ?? 1) - (VALUE[y] ?? 1));
    let dropped = 0;
    while (paceFor(loadKg(v), eta, Mcap) <= vHunter && dropOrder.length) {
      const k = dropOrder.shift()!;
      dropped += haulKg({ [k]: sc.haul[k as ResourceKey] });
      delete sc.haul[k as ResourceKey];
    }
    if (dropped) {
      log(s, `${v.name} drops ${Math.round(dropped)} kg of cargo to outrun the thing behind.`, "bad");
      const n = (s.nodes ?? []).find((x) => x.id === sc.node);
      if (n) n.wake = Math.min(100, n.wake + 5);
    }
  }
}

/**
 * The navigation drift of §4.2, one step: heading error random-walks by
 * σ√km, cross-track error integrates it, a landmark in sight may fix both.
 * Returns true when the error has outrun what can be seen: lost.
 */
export function driftStep(sc: { psi?: number; err?: number }, stepTiles: number, sightM: number, skill: number, fix: boolean, minutes: number, r: () => number): boolean {
  const km = stepTiles * TILE_KM;
  const sigma = 0.15 * (1 + Math.pow(250 / Math.max(3, sightM), 0.7)) * (1 - 0.6 * skill) * (fix ? 0.3 : 1);
  sc.psi = (sc.psi ?? 0) + sigma * Math.sqrt(Math.max(0, km)) * gauss(r);
  sc.err = (sc.err ?? 0) + stepTiles * Math.sin(sc.psi);
  if (fix && r() < (0.8 * skill + 0.2) * (minutes / 10)) {
    sc.err = 0;
    sc.psi = 0;
  }
  return Math.abs(sc.err) * TILE_KM * 1000 > Math.max(sightM, 30);
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}

/** Value per kg, for what gets dropped first. */
const VALUE: Record<string, number> = { silver: 50, gold: 200, platinum: 120, diamond: 300, coin: 10, salt: 3, bogiron: 1, coal: 0.3, peat: 0.2, tools: 5, potato: 0.5 };
/** A hunting band's pace, tiles an hour. */
const HUNT_PACE = 8;

// ── Extraction nodes (§4.4) ───────────────────────────────

export const NODE_DEFS: Record<NodeKind, { name: string; perHour: number; res: ResourceKey; c: number; r: number; guardian: MonsterKind; count: number }> = {
  bogiron: { name: "Bog iron", perHour: 4, res: "bogiron", c: 0.6, r: 3, guardian: "kappa", count: 3 },
  salt: { name: "Rock salt", perHour: 6, res: "salt", c: 0.5, r: 2, guardian: "gargoyle", count: 2 },
  coal: { name: "Surface coal", perHour: 0.8, res: "coal", c: 4, r: 4, guardian: "salamander", count: 3 },
  peat: { name: "Peat bog", perHour: 1, res: "peat", c: 1, r: 5, guardian: "wisp", count: 3 },
  flint: { name: "Flint scar", perHour: 1 / 3, res: "tools", c: 2.4, r: 3, guardian: "tengu", count: 2 },
  silver: { name: "Silver seam", perHour: 0.3, res: "silver", c: 12, r: 1, guardian: "jorogumo", count: 1 },
};

/** Sets extraction nodes down in the fog, 30–140 tiles out. */
export function placeNodes(s: GameState) {
  if (s.nodes) return;
  const r = rng(s.seed * 11 + 29);
  const hall = s.structures.find((st) => st.type === "townhall");
  const home: [number, number] = hall ? center(hall) : [37, 26];
  s.nodes = [];
  let id = 1;
  for (const kind of Object.keys(NODE_DEFS) as NodeKind[]) {
    for (let n = 0; n < NODE_DEFS[kind].count; n++) {
      for (let tries = 0; tries < 300; tries++) {
        const x = 2 + Math.floor(r() * (MAP_W - 4));
        const y = 2 + Math.floor(r() * (MAP_H - 4));
        const d = dist(home, [x, y]);
        if (d < 30 || d > 140) continue;
        const t = s.map.terrain[idx(x, y)];
        if (t === Terrain.Water || s.map.overlay[idx(x, y)] === Overlay.Lair) continue;
        if ((kind === "bogiron" || kind === "peat") && !nearWater(s, x, y)) continue;
        if (s.nodes.some((q) => Math.hypot(q.x - x, q.y - y) < 10)) continue;
        s.nodes.push({ id: id++, kind, x, y, wake: 0, awakened: false, discovered: false });
        break;
      }
    }
  }
}

function nearWater(s: GameState, x: number, y: number) {
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (inBounds(x + dx, y + dy) && s.map.terrain[idx(x + dx, y + dy)] === Terrain.Water) return true;
  return false;
}

/** Wake-meter band (§4.4). */
export function wakeState(w: number, awakened: boolean): string {
  if (awakened) return "Awakened";
  return w >= 75 ? "Hunting" : w >= 50 ? "Stirring" : w >= 25 ? "Signs" : "Dormant";
}

function workNode(s: GameState, v: Villager, sc: Scout, minutes: number, r: () => number) {
  const node = (s.nodes ?? []).find((n) => n.id === sc.node);
  if (!node) {
    sc.phase = "back";
    return;
  }
  const def = NODE_DEFS[node.kind];
  const h = minutes / 60;
  const got = def.perHour * h;
  const haul = (sc.haul ??= {});
  haul[def.res] = (haul[def.res] ?? 0) + got;
  sc.worked = (sc.worked ?? 0) + h;
  const before = node.wake;
  wakeStep(node, got, h);
  if (before < 25 && node.wake >= 25) log(s, `Tracks around the ${def.name.toLowerCase()} at ${node.x},${node.y}. Something lives near it.`, "bad");
  // Ambush.
  const lam = node.wake >= 75 ? 0.08 * ((node.wake - 50) / 50) ** 2 : node.wake >= 50 ? 0.02 * ((node.wake - 50) / 50) ** 2 : 0;
  if (lam > 0 && r() < 1 - Math.exp(-lam * h)) {
    spawnHunter(s, node, v, 1);
    sc.phase = "back";
    log(s, `${v.name} is ambushed at the ${def.name.toLowerCase()} and runs for home.`, "bad");
  }
  if (node.wake >= 100 && !node.awakened) {
    node.awakened = true;
    spawnHunter(s, node, v, 3);
    log(s, `The guardian of the ${def.name.toLowerCase()} wakes, and follows ${v.name} toward the town.`, "bad");
    sc.phase = "back";
  }
}

function spawnHunter(s: GameState, node: { x: number; y: number; kind: NodeKind; wake: number }, v: Villager, mult: number) {
  const def = MONSTERS[NODE_DEFS[node.kind].guardian];
  const days = clock(s.time).day;
  const level = Math.max(def.min, Math.min(def.max, Math.round(3 + days / 3) * mult));
  s.nextRoamerId = (s.nextRoamerId ?? 1) + 1;
  (s.roamers ??= []).push({
    id: s.nextRoamerId, lair: 0, kind: NODE_DEFS[node.kind].guardian, level, count: mult, x: node.x + 1, y: node.y + 1,
    tx: v.scout?.hx ?? node.x, ty: v.scout?.hy ?? node.y, hunt: v.id,
  });
}

/** The wake meter's rise for kilos taken over hours of presence (§4.4). */
export function wakeStep(node: { kind: NodeKind; wake: number }, qty: number, hours: number) {
  node.wake = Math.min(100, node.wake + NODE_DEFS[node.kind].c * qty + 0.5 * hours);
}

/** Nodes seen become known. */
export function discoverNodes(s: GameState) {
  for (const n of s.nodes ?? []) {
    if (n.discovered) continue;
    if (s.map.seen?.[idx(n.x, n.y)]) {
      n.discovered = true;
      log(s, `A ${NODE_DEFS[n.kind].name.toLowerCase()} is found at ${n.x},${n.y}.`, "good");
    }
  }
}

/** Daily: node wake meters settle, but never below forty once a guardian has woken. */
export function nodesDaily(s: GameState) {
  for (const n of s.nodes ?? []) n.wake = Math.max(n.awakened ? 40 : 0, n.wake - NODE_DEFS[n.kind].r);
}
