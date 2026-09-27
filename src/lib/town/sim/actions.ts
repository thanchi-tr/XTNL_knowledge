import { CATALOG, grade, hallMinDay, PEAT_CUT, PEAT_EFFORT, COMBINE_COST, COMBINE_FROM, COURSES, KNIGHT_RECRUIT, RECRUIT_RANK, jewelCost, upgradeHours, upgradePeople, GATE_COST, PAVEMENT_COST, TRAIN_SLOW, UTILITIES, WALL_COST, bedUpgradeCost, maxBedUpgrades, utilitySlots, type Cost } from "./catalog";
import { assign, beds, byId, clock, log, makeStructure, residents, unassign } from "./state";
import { buildMinutes, type SimContext } from "./tick";
import {
  WALL_MAX_LEVEL, isHome, canAfford, checkMove, checkPlacement, checkTile, computeLinks, costText, fuelCap, wallLevel, wallMaxHp, wallMeta, wallUpgradeCost, guardSlots, houseReachesBarracks, isGuardPost, occupancy, pay, MILITARY_TYPES,
} from "./world";
import { forgeOf, stock, store, take } from "./loot";
import { NIGHT_SHIFT_LEVEL, workLevel } from "./work";
import { inSight } from "./vision";
import { SEEDLING, SNAG, TREE_EFFORT, TREE_LABEL, TREE_WOOD, treeStage } from "./woods";
import { WILD_EFFORT, wildAmount, wildCrop } from "./forage";
import { HEARTHS, isHeated, isZone } from "./zones";
import { FOOTING, footingOf, frameNodes, hasFrame } from "./frame";
import { defaultPolicy } from "./psyche";
import type { Footing, HearthKind, Policy } from "./types";
import { MILITARY, Overlay, Terrain, YEAR_DAYS, type GameState, type Role, type Structure, type StructureType, type Villager } from "./types";

/**
 * Everything the player can do, each as a checked mutation. A refusal returns
 * the reason as a sentence — the UI shows it verbatim, so it is written for a
 * player, not a log.
 */

type Result = string | null;

const hall = (s: GameState) => s.structures.find((st) => st.type === "townhall");

export function place(s: GameState, ctx: SimContext, type: StructureType, x: number, y: number): Result {
  const check = checkPlacement(s, type, x, y);
  if (!check.ok) return check.reason ?? "Cannot build here.";
  const cost = CATALOG[type].cost;
  if (!canAfford(s.res, cost)) return `Needs ${costText(cost)}.`;
  pay(s.res, cost);
  const st = makeStructure(s, type, x, y, false);
  st.buildUntil = s.time + buildMinutes(s, ctx, CATALOG[type].buildHours);
  st.undo = { kind: "build", at: Date.now(), cost: { ...cost }, jewels: 0 };
  // Wild crops on the plot are trampled under the footings.
  trample(s, x, y, st.w, st.h);
  log(s, `Work begins on a ${CATALOG[type].name.toLowerCase()}.`);
  return null;
}

function trample(s: GameState, x: number, y: number, w: number, h: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = yy * s.map.w + xx;
    if (s.map.overlay[i] === Overlay.Crop) s.map.overlay[i] = s.map.meta[i] = 0;
  }
}

/** What relaying one tile of road in stone flags costs. */
export const STONE_PAVING_COST: Cost = { stone: 2 };

export function paint(s: GameState, kind: "pavement" | "wall" | "gate", tiles: number[]): Result {
  const occ = occupancy(s);
  const unit: Cost = kind === "pavement" ? PAVEMENT_COST : kind === "wall" ? WALL_COST : GATE_COST;
  let laid = 0;
  let why: string | null = null;
  for (const i of tiles) {
    // A road laid over a road is relaid in stone flags.
    if (kind === "pavement" && s.map.terrain[i] === Terrain.Pavement && s.map.overlay[i] !== Overlay.Gate && !s.map.paving?.[i]) {
      if (!canAfford(s.res, STONE_PAVING_COST)) {
        why = `Out of stone (${costText(STONE_PAVING_COST)} a tile of flags).`;
        break;
      }
      pay(s.res, STONE_PAVING_COST);
      (s.map.paving ??= new Array(s.map.terrain.length).fill(0))[i] = 1;
      laid++;
      continue;
    }
    const bad = checkTile(s, i, kind, occ);
    if (bad) {
      why ??= bad;
      continue;
    }
    if (!canAfford(s.res, unit)) {
      why = `Out of materials (${costText(unit)} per tile).`;
      break;
    }
    pay(s.res, unit);
    if (s.map.overlay[i] === Overlay.Crop) s.map.overlay[i] = s.map.meta[i] = 0;
    if (kind === "pavement") s.map.terrain[i] = Terrain.Pavement;
    else if (kind === "wall") {
      s.map.overlay[i] = Overlay.Wall;
      s.map.meta[i] = wallMeta(1, wallMaxHp(1));
    } else {
      // A gate is paved underneath, so roads run through it.
      s.map.terrain[i] = Terrain.Pavement;
      s.map.overlay[i] = Overlay.Gate;
      s.map.meta[i] = wallMeta(1, wallMaxHp(1, true));
    }
    laid++;
  }
  return laid ? null : why;
}

/**
 * Raises every wall and gate tile given by a level, as far as the stores
 * go: each takes more hits, and every tenth level it is rebuilt grander.
 */
export function upgradeWalls(s: GameState, tiles: number[]): Result {
  let n = 0;
  let why: string | null = null;
  for (const i of tiles) {
    const o = s.map.overlay[i];
    if (o !== Overlay.Wall && o !== Overlay.Gate) continue;
    const lvl = wallLevel(s.map.meta[i]);
    if (lvl >= WALL_MAX_LEVEL) {
      why ??= "At its highest level.";
      continue;
    }
    const cost = wallUpgradeCost(lvl);
    if (!canAfford(s.res, cost)) {
      why = `Out of materials — the next level of that wall takes ${costText(cost)} a tile.`;
      break;
    }
    pay(s.res, cost);
    s.map.meta[i] = wallMeta(lvl + 1, wallMaxHp(lvl + 1, o === Overlay.Gate));
    n++;
  }
  if (!n) return why ?? "Drag over wall or gate to raise it.";
  log(s, `${n} tile${n === 1 ? "" : "s"} of wall raised a level.`, "info");
  return null;
}

/** Removes pavement or a wall piece — the only undo painting has. */
export function unpaint(s: GameState, tiles: number[]): Result {
  for (const i of tiles) {
    if (s.map.overlay[i] === Overlay.Wall || s.map.overlay[i] === Overlay.Gate) {
      s.map.overlay[i] = Overlay.None;
      s.map.meta[i] = 0;
    }
    if (s.map.terrain[i] === Terrain.Pavement) {
      s.map.terrain[i] = Terrain.Grass;
      if (s.map.paving) s.map.paving[i] = 0;
    }
  }
  return null;
}

export function clear(s: GameState, tiles: number[]): Result {
  let n = 0;
  for (const i of tiles) {
    const o = s.map.overlay[i];
    const peat = o === Overlay.None && s.map.terrain[i] === Terrain.Marsh;
    if (o !== Overlay.Tree && o !== Overlay.Rock && o !== Overlay.Debris && o !== Overlay.Crop && !peat) continue;
    if (!inSight(s, i % s.map.w, Math.floor(i / s.map.w))) continue;
    if (!s.clearing.some((j) => j.tile === i)) {
      s.clearing.push({ tile: i, progress: 0 });
      n++;
    }
  }
  if (!n) return "Nothing here to clear.";
  if (!s.villagers.some((v) => v.role === "idle" && !v.work)) return "Marked — with nobody idle it will go slowly, after the day's work.";
  return null;
}

/** What harvesting a tile yields, for the tile panel. */
export function harvestYield(s: GameState, tile: number): { label: string; verb: string; gives: string; effort: number } | null {
  const o = s.map.overlay[tile];
  if (o === Overlay.Tree) {
    const stage = treeStage(s.map.meta[tile]);
    const wood = TREE_WOOD[stage];
    return {
      label: TREE_LABEL[stage], verb: stage === SNAG ? "Fell the snag" : stage <= SEEDLING ? "Pull up" : "Cut down",
      gives: wood ? `${wood} wood` : "nothing but a clear tile", effort: TREE_EFFORT[stage],
    };
  }
  if (o === Overlay.Rock) {
    const kind = s.map.meta[tile];
    const gives = kind === 0 ? "10 stone" : kind === 1 ? "6 coal" : kind === 2 ? "4 iron" : "2 silver";
    const label = ["Stone rock", "Coal rock", "Iron rock", "Silver rock"][kind] ?? "Rock";
    return { label, verb: "Break up", gives, effort: 4 };
  }
  if (o === Overlay.Debris) return { label: "Rubble", verb: "Clear", gives: "3 stone, 2 wood — and the plot is free to build on", effort: 3 };
  if (o === Overlay.None && s.map.terrain[tile] === Terrain.Marsh) {
    return { label: "Marsh", verb: "Cut peat", gives: `${PEAT_CUT} peat to burn, a chance of bog iron — and the cut-over ground drains to a bank`, effort: PEAT_EFFORT };
  }
  if (o === Overlay.Crop) {
    const kind = s.map.meta[tile];
    return { label: `Wild ${wildCrop(kind)}`, verb: "Gather", gives: `${wildAmount(kind)} ${wildCrop(kind)}`, effort: WILD_EFFORT };
  }
  return null;
}

/**
 * Loads a pit fire's grate from the stores. A wood burns one unit of fuel,
 * a coal three; the grate holds only so much.
 */
export function stokeFire(s: GameState, id: number, kind: "wood" | "coal", amount: number): Result {
  const f = byId(s, id);
  if (!f || f.type !== "pitfire") return "That is not a pit fire.";
  if (f.buildUntil) return "The fire pit is still being built.";
  const per = kind === "coal" ? 3 : 1;
  const room = Math.floor((fuelCap(f.level) - (f.fuel ?? 0)) / per);
  const n = Math.min(Math.floor(amount), room, Math.floor(s.res[kind]));
  if (room <= 0) return "The grate is full.";
  if (n <= 0) return `No ${kind} in store.`;
  s.res[kind] -= n;
  f.fuel = (f.fuel ?? 0) + n * per;
  return null;
}

// ── Survival: hearths, chimneys, footings, roofs, policy (design §1, §5) ──

/**
 * Fits a building with a hearth. The heating ladder runs open hearth,
 * chimney fireplace, masonry stove, tiled stove, hypocaust, boiler and
 * radiators, rune hearthstone: each is fitted over the one below it (a
 * charcoal brazier can go in any time, and a building can always go back
 * down).
 */
export function fitHearth(s: GameState, id: number, kind: HearthKind): Result {
  const st = byId(s, id);
  if (!st || !isHeated(st)) return "Only homes, the hall, schools and barracks take a hearth.";
  if (st.hearth === kind) return `It already has a ${HEARTHS[kind].name.toLowerCase()}.`;
  const tier = HEARTHS[st.hearth ?? "open"].tier;
  if (kind !== "brazier" && HEARTHS[kind].tier > tier + 1) {
    const below = Object.values(HEARTHS).find((h) => h.tier === HEARTHS[kind].tier - 1 && h.kind !== "brazier");
    return `Fit a ${below?.name.toLowerCase() ?? "better hearth"} first — heating goes up a level at a time.`;
  }
  const cost = HEARTHS[kind].cost as Cost;
  if (!canAfford(s.res, cost)) return `Needs ${costText(cost)}.`;
  pay(s.res, cost);
  st.hearth = kind;
  if (st.zone) st.zone.creo = 0;
  log(s, `A ${HEARTHS[kind].name.toLowerCase()} is fitted in the ${CATALOG[st.type].name.toLowerCase()} at ${st.x},${st.y}.`);
  return null;
}

/** Sweeps a flue clean of creosote: an hour's work and a couple of coin for the brushes. */
export function sweepChimney(s: GameState, id: number): Result {
  const st = byId(s, id);
  if (!st?.zone) return "Nothing to sweep.";
  if (!st.hearth || !HEARTHS[st.hearth].flued) return "Only a hearth with a flue needs sweeping.";
  if (s.res.coin < 2) return "Needs 2 coin.";
  s.res.coin -= 2;
  st.zone.creo = 0;
  return null;
}

/** Re-founds a building on deeper footings: every post reset, frost heave no longer reaching them. */
export function setFooting(s: GameState, id: number, footing: Footing): Result {
  const st = byId(s, id);
  if (!st || !hasFrame(st)) return "That building has no frame to underpin.";
  if (footingOf(st) === footing) return "Already on those footings.";
  const n = frameNodes(st.w, st.h).length;
  const cost: Cost = Object.fromEntries(Object.entries(FOOTING[footing].cost).map(([k, v]) => [k, (v as number) * n]));
  if (!canAfford(s.res, cost)) return `Needs ${costText(cost)}.`;
  pay(s.res, cost);
  st.footing = footing;
  st.frame = Array(n).fill(1);
  log(s, `The ${CATALOG[st.type].name.toLowerCase()} at ${st.x},${st.y} is underpinned on ${FOOTING[footing].name.toLowerCase()}.`);
  return null;
}

/** Re-roofs a building: turf (warm and heavy, and nothing to catch fire) or back to its grade's roof. */
export function reroof(s: GameState, id: number, kind: "turf" | "default"): Result {
  const st = byId(s, id);
  if (!st || !isZone(st)) return "Only enclosed buildings have a roof to change.";
  const cost: Cost = kind === "turf" ? { wood: 10 + st.w * st.h * 2 } : { wood: 5 + st.w * st.h };
  if (!canAfford(s.res, cost)) return `Needs ${costText(cost)}.`;
  pay(s.res, cost);
  st.roofKind = kind === "turf" ? "turf" : undefined;
  st.roofSnow = 0;
  return null;
}

/** Sets a town policy: heating target, ration, nightsoil, coal first. */
export function setPolicy(s: GameState, patch: Partial<Policy>): Result {
  s.policy = { ...defaultPolicy(), ...s.policy, ...patch };
  if (patch.shift !== undefined && !s.decrees?.includes("shifts") && patch.shift > 14) {
    s.policy.shift = 14;
    return "Longer than fourteen hours takes the extended-shift decree.";
  }
  return null;
}

// ── Earthworks ────────────────────────────────────────────


/**
 * Marks tiles to dig out as river channel, or to fill back in. A channel
 * grows only from water, so each tile must touch the river or a tile
 * already marked. It is slow work: idle villagers do it, a tile at a time.
 */
export function markEarthworks(s: GameState, kind: "dig" | "fill", tiles: number[]): Result {
  s.earthworks ??= [];
  const occ = occupancy(s);
  const queued = new Set(s.earthworks.map((j) => j.tile));
  const wet = (i: number) => s.map.terrain[i] === Terrain.Water || (queued.has(i) && s.earthworks!.some((j) => j.tile === i && j.kind === "dig"));
  const near = (i: number) => {
    const x = i % s.map.w;
    const y = Math.floor(i / s.map.w);
    return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < s.map.w && b < s.map.h).map(([a, b]) => b * s.map.w + a);
  };
  let n = 0;
  let why: string | null = null;
  // Take tiles nearest the water first, so a dragged line grows out from the bank.
  const order = [...tiles].sort((a, b) => (near(a).some(wet) ? 0 : 1) - (near(b).some(wet) ? 0 : 1));
  for (let pass = 0; pass < order.length; pass++) {
    let added = false;
    for (const i of order) {
      if (queued.has(i)) continue;
      const t = s.map.terrain[i];
      if (!inSight(s, i % s.map.w, Math.floor(i / s.map.w))) {
        why ??= "Nobody can see there — light it first.";
        continue;
      }
      if (kind === "dig") {
        if (t === Terrain.Water) continue;
        if (occ[i] || s.map.overlay[i] !== Overlay.None || t === Terrain.Forest) {
          why ??= "Only open ground can be dug — clear it first.";
          continue;
        }
        if (!near(i).some(wet)) {
          why ??= "A channel must run from the river: dig outward from the water.";
          continue;
        }
      } else {
        if (t !== Terrain.Water && t !== Terrain.Marsh) continue;
        if (t === Terrain.Water && !near(i).some((j) => s.map.terrain[j] !== Terrain.Water)) {
          why ??= "Fill from the bank inward.";
          continue;
        }
      }
      s.earthworks.push({ tile: i, kind, progress: 0 });
      queued.add(i);
      n++;
      added = true;
    }
    if (!added) break;
  }
  if (!n) return why ?? "Nothing here to dig or fill.";
  return null;
}

/** Takes tiles off the earthworks list. */
export function cancelEarthworks(s: GameState, tiles: number[]): Result {
  const drop = new Set(tiles);
  s.earthworks = (s.earthworks ?? []).filter((j) => !drop.has(j.tile));
  return null;
}

// ── Trade ─────────────────────────────────────────────────

/** Makes one of the caravan's trades: goods for goods. Gear goes to the forge's store. */
export function trade(s: GameState, offerId: string): Result {
  const c = s.caravan;
  if (!c || c.until <= s.time) return "No caravan in town.";
  const o = c.offers.find((x) => x.id === offerId);
  if (!o || o.left <= 0) return "They have none left.";
  if (!canAfford(s.res, o.give)) return `They want ${costText(o.give)}.`;
  if (o.get.item) {
    if (!forgeOf(s)) return "Build a forge first — gear is kept in its store.";
    pay(s.res, o.give);
    const lost = store(s, o.get.item, o.get.qty);
    if (lost) {
      for (const [k, v] of Object.entries(o.give)) s.res[k as keyof GameState["res"]] += v as number;
      take(s, o.get.item, o.get.qty - lost);
      return "The forge's store is full.";
    }
  } else {
    pay(s.res, o.give);
    s.res[o.get.res!] += o.get.qty;
  }
  o.left -= 1;
  return null;
}

/** Takes a tile off the clearing list. */
export function cancelClear(s: GameState, tile: number): Result {
  s.clearing = s.clearing.filter((j) => j.tile !== tile);
  return null;
}

/**
 * Buildings cannot be moved, only broken down. What stands on the plot
 * becomes rubble that must itself be cleared, and a quarter of the build
 * cost comes back.
 */
export function demolish(s: GameState, id: number): Result {
  const st = byId(s, id);
  if (!st) return "Nothing to demolish.";
  if (st.type === "townhall") return "The town hall cannot be demolished.";
  for (const v of s.villagers) {
    if (v.work === st.id) v.work = null;
    if (v.house === st.id) v.house = null;
    if (v.guard === st.id) v.guard = null;
  }
  s.structures = s.structures.filter((x) => x.id !== id);
  for (let y = st.y; y < st.y + st.h; y++) for (let x = st.x; x < st.x + st.w; x++) s.map.overlay[y * s.map.w + x] = Overlay.Debris;
  for (const [k, v] of Object.entries(CATALOG[st.type].cost)) s.res[k as keyof typeof s.res] += Math.floor((v as number) / 4);
  log(s, `The ${CATALOG[st.type].name.toLowerCase()} is torn down.`);
  return null;
}

/** How long, in real milliseconds, a new build or an upgrade can be called off for a full refund. */
export const CANCEL_MS = 10_000;

/** Real milliseconds left to call off the work on a building, or 0. */
export function cancelLeft(st: Structure, now = Date.now()): number {
  if (!st.undo || !st.buildUntil) return 0;
  return Math.max(0, CANCEL_MS - (now - st.undo.at));
}

/**
 * Calls off a build or an upgrade just ordered: within ten real seconds
 * everything paid is given back — the resources and any monster jewels —
 * and the plot (or the old level) is as it was. After that the builders
 * have started and the order stands.
 */
export function cancelWork(s: GameState, id: number, now = Date.now()): Result {
  const st = byId(s, id);
  if (!st || !st.undo || !st.buildUntil) return "Nothing to call off.";
  if (cancelLeft(st, now) <= 0) return "Too late — the builders have started. An order can be called off only in its first ten seconds.";
  const { kind, cost, jewels } = st.undo;
  for (const [k, v] of Object.entries(cost)) s.res[k as keyof typeof s.res] += v as number;
  if (jewels) store(s, "jewel", jewels);
  const name = CATALOG[st.type].name.toLowerCase();
  if (kind === "build") {
    s.structures = s.structures.filter((x) => x.id !== st.id);
    log(s, `The ${name} is called off before the first stone is laid; everything is returned.`);
  } else {
    st.level -= 1;
    st.buildUntil = undefined;
    st.undo = undefined;
    log(s, `The ${name}'s upgrade is called off; everything is returned.`);
  }
  return null;
}

export function upgrade(s: GameState, ctx: SimContext, id: number): Result {
  const st = byId(s, id);
  if (!st) return "No such building.";
  const def = CATALOG[st.type];
  if (st.buildUntil) return "Already under construction.";
  if (st.level >= def.maxLevel) return "Already at its highest level.";
  const h = hall(s);
  if (st.type !== "townhall" && h && st.level >= h.level + 2) return `Raise the town hall first (it caps others at level ${h.level + 2}).`;
  if (st.type === "farm" || st.type === "waterfarm") {
    const mill = s.structures.filter((m) => m.type === "watermill").reduce((a, m) => Math.max(a, m.level), 0);
    if (st.level >= mill) return "Upgrade a watermill first — farms cannot outgrow the mill that feeds them.";
  }
  const people = upgradePeople(st.type, st.level);
  if (s.villagers.length < people) return `Level ${st.level + 1} needs a town of ${people} people (you have ${s.villagers.length}).`;
  if (st.type === "townhall" && clock(s.time).day < hallMinDay(st.level + 1)) {
    const d = hallMinDay(st.level + 1);
    return `The hall cannot rise to level ${st.level + 1} before day ${d} (year ${Math.floor((d - 1) / YEAR_DAYS) + 1}) — some things take years.`;
  }
  const cost = def.upgrade(st.level);
  if (!canAfford(s.res, cost)) return `Needs ${costText(cost)}.`;
  // The highest levels are set with monster jewels from the forge's store.
  const jewels = jewelCost(st.level + 1, st.type);
  if (jewels && stock(s, "jewel") < jewels) return `Level ${st.level + 1} is set with ${jewels} monster jewel${jewels === 1 ? "" : "s"} — the forge's store has ${stock(s, "jewel")}.`;
  pay(s.res, cost);
  if (jewels) take(s, "jewel", jewels);
  st.undo = { kind: "upgrade", at: Date.now(), cost: { ...cost }, jewels };
  st.level += 1;
  st.buildUntil = s.time + buildMinutes(s, ctx, def.buildHours * upgradeHours(st.type, st.level));
  log(s, `Upgrading the ${def.name.toLowerCase()} to level ${st.level}.`);
  return null;
}

export function setMode(s: GameState, id: number, mode: string): Result {
  const st = byId(s, id);
  if (!st) return "No such building.";
  st.mode = mode;
  return null;
}

// ── Workers ───────────────────────────────────────────────

export function freeWorkers(s: GameState, forType?: StructureType): Villager[] {
  return s.villagers.filter((v) => !v.work && !MILITARY.includes(v.role) && v.health > 20 &&
    (!forType || v.role === "idle" || CATALOG[forType].workRole === v.role ||
      (v.role === "biologist" && (forType === "farm" || forType === "waterfarm")) ||
      (v.role === "scientist" && (forType === "refinery" || forType === "laboratory")) || (v.role === "geologist" && forType === "mine") ||
      (v.role === "chef" && forType === "kitchen")));
}

export function hire(s: GameState, id: number, villagerId?: number): Result {
  const st = byId(s, id);
  if (!st) return "No such building.";
  if (st.buildUntil) return "Finish building it first.";
  const def = CATALOG[st.type];
  if (st.workers.length >= def.slots(st.level)) return "No free positions — upgrade to hire more.";
  if (st.type === "kitchen") {
    const chef = s.villagers.find((v) => (villagerId ? v.id === villagerId : true) && v.role === "chef" && !v.work);
    if (!chef) return "Kitchens need chefs. Train a kitchen hand at the school.";
    assign(s, chef, st);
    return null;
  }
  if (st.type === "armypoint") {
    // A knight leads it: any knight not already leading a camp, not away on a sortie.
    const leading = new Set(s.structures.filter((x) => x.type === "armypoint").map((x) => x.id));
    const k = s.villagers
      .filter((v) => (villagerId ? v.id === villagerId : true) && v.role === "knight" && !leading.has(v.work ?? -1) && !v.deployedUntil && v.health > 20)
      .sort((a, b) => b.rank - a.rank)[0];
    if (!k) return "An army point is led by a knight. Recruit one at the army school.";
    assign(s, k, st);
    return null;
  }
  if (st.type === "museum") {
    const art = s.villagers.find((v) => (villagerId ? v.id === villagerId : true) && v.role === "artist" && !v.work && v.health > 20);
    if (!art) return "A museum is kept by artists. Train one at the school.";
    assign(s, art, st);
    return null;
  }
  if (st.type === "laboratory") {
    const sci = s.villagers.find((v) => (villagerId ? v.id === villagerId : true) && v.role === "scientist" && !v.work && v.health > 20);
    if (!sci) return "Laboratories need scientists. Train one at the school.";
    assign(s, sci, st);
    return null;
  }
  const pool = freeWorkers(s, st.type);
  const v = villagerId ? pool.find((x) => x.id === villagerId) : pool.sort((a, b) => (a.role === "idle" ? 1 : 0) - (b.role === "idle" ? 1 : 0))[0];
  if (!v) return "Nobody free to work — build houses, or wait for new arrivals.";
  assign(s, v, st);
  return null;
}

export function fire(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  unassign(s, v);
  return null;
}

// ── Houses ────────────────────────────────────────────────

export function buyBed(s: GameState, id: number): Result {
  const st = byId(s, id);
  if (!st || !isHome(st)) return "Not a home.";
  const bought = st.bedUpgrades ?? 0;
  if (bought >= maxBedUpgrades(st.level)) return "No room for another bed — upgrade the house.";
  const cost = bedUpgradeCost(bought);
  if (!canAfford(s.res, cost)) return `Needs ${costText(cost)}.`;
  pay(s.res, cost);
  st.bedUpgrades = bought + 1;
  return null;
}

export function addUtility(s: GameState, id: number, utility: string): Result {
  const st = byId(s, id);
  if (!st || !isHome(st)) return "Not a home.";
  const u = UTILITIES.find((x) => x.id === utility);
  if (!u) return "Unknown utility.";
  const have = st.utilities ?? [];
  if (have.includes(utility)) return "Already installed.";
  if (have.length >= utilitySlots(st.level)) return "No room — upgrade the house for another utility slot.";
  if (!canAfford(s.res, u.cost)) return `Needs ${costText(u.cost)}.`;
  pay(s.res, u.cost);
  st.utilities = [...have, utility];
  return null;
}

/** Duplexes that stand flush beside this one, the same size and in line: what it can be joined with. */
export function combinePartners(s: GameState, id: number): Structure[] {
  const a = byId(s, id);
  if (!a || a.type !== "house" || a.level < COMBINE_FROM || a.buildUntil) return [];
  return s.structures.filter((b) => {
    if (b.id === a.id || b.type !== "house" || b.level < COMBINE_FROM || b.buildUntil) return false;
    const sideBySide = b.y === a.y && b.h === a.h && (b.x === a.x + a.w || a.x === b.x + b.w);
    const stacked = b.x === a.x && b.w === a.w && (b.y === a.y + a.h || a.y === b.y + b.h);
    return sideBySide || stacked;
  });
}

/**
 * Joins two neighbouring duplexes into one apartment block. Everyone moves
 * in together; beds bought and utilities fitted carry over. It takes a day
 * of building, and the lower of the two levels.
 */
export function combineHomes(s: GameState, aId: number, bId: number): Result {
  const a = byId(s, aId);
  const b = byId(s, bId);
  if (!a || !b || !combinePartners(s, aId).includes(b)) return "Only two duplexes standing flush side by side can be joined.";
  if (!canAfford(s.res, COMBINE_COST)) return `Needs ${costText(COMBINE_COST)}.`;
  pay(s.res, COMBINE_COST);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(a.x + a.w, b.x + b.w) - x;
  const h = Math.max(a.y + a.h, b.y + b.h) - y;
  s.structures = s.structures.filter((st) => st !== a && st !== b);
  const flat = makeStructure(s, "apartment", x, y, true);
  flat.w = w;
  flat.h = h;
  flat.level = Math.min(a.level, b.level);
  flat.bedUpgrades = (a.bedUpgrades ?? 0) + (b.bedUpgrades ?? 0);
  flat.utilities = [...new Set([...(a.utilities ?? []), ...(b.utilities ?? [])])];
  flat.buildUntil = s.time + 24 * 60;
  flat.hp = 1;
  for (const v of s.villagers) if (v.house === a.id || v.house === b.id) v.house = flat.id;
  log(s, `Two duplexes are joined into an apartment block (level ${flat.level}).`, "good");
  return null;
}

/** Sends a household on break: eight hours off work, happiness recharging. */
export function sendOnBreak(s: GameState, id: number): Result {
  const st = byId(s, id);
  if (!st || !isHome(st)) return "Not a home.";
  if (st.breakUntil && st.breakUntil > s.time) return "They are already resting.";
  st.breakUntil = s.time + 8 * 60;
  log(s, `A household takes the day off (${residents(s, st).length} villagers).`);
  return null;
}

// ── Training ──────────────────────────────────────────────

export function schoolTrain(s: GameState, id: number, role: Role): Result {
  const st = byId(s, id);
  if (!st || st.type !== "school") return "Not a school.";
  if (st.training) return "A lesson is already underway.";
  const course = COURSES.find((c) => c.role === role);
  if (!course) return "Unknown course.";
  const v = s.villagers.find((x) => x.role === "idle" && !x.work && x.health > 20);
  if (!v) return "No idle villager to enrol.";
  if (!canAfford(s.res, course.cost)) return `Needs ${costText(course.cost)}.`;
  pay(s.res, course.cost);
  v.work = st.id;
  st.training = { villagerId: v.id, role, left: (course.hours * 60 * TRAIN_SLOW) / (1 + (st.level - 1) * 0.15) };
  log(s, `${v.name} begins training as a ${course.name.toLowerCase()}.`);
  return null;
}

/** What each military building recruits. Every soldier, bow or spear, is on the one soldier tree. */
const TROOP_FOR: Partial<Record<StructureType, Role>> = {
  barracks: "infantry", archery: "infantry", armoury: "infantry", wizardhut: "wizard", nobleyard: "knight", armyschool: "knight",
};

/**
 * Recruits from a house the barracks reaches by pavement — the brief's rule
 * that houses must connect to a barracks for villagers to be trained.
 */
/** Orders a building's workers on past their day's strength, or lets them stop when spent. */
export function setOvertime(s: GameState, id: number, on: boolean): Result {
  const st = byId(s, id);
  if (!st) return "No such building.";
  st.overtime = on;
  log(s, on
    ? `The ${CATALOG[st.type].name.toLowerCase()}'s workers are driven on past their strength. Some may not get up.`
    : `The ${CATALOG[st.type].name.toLowerCase()}'s workers may stop when they are spent.`, on ? "bad" : "info");
  return null;
}

/** The same for the idle hands clearing ground and digging. */
export function setClearOvertime(s: GameState, on: boolean): Result {
  s.policy = { heat: 12, ration: 1, freshSoil: false, coalFirst: false, shift: 14, ...s.policy, overtime: on };
  return null;
}

/** How long taking on a recruit takes: four game hours. */
export const RECRUIT_MINUTES = 4 * 60;

export function recruit(s: GameState, id: number): Result {
  const st = byId(s, id);
  if (!st || !MILITARY_TYPES.includes(st.type)) return "Not a military building.";
  if (st.buildUntil) return "Finish building it first.";
  if (st.training) return "Already training a recruit.";
  const garrison = s.villagers.filter((v) => v.work === st.id && MILITARY.includes(v.role)).length;
  if (garrison >= 4 * st.level) return "At capacity — upgrade to house more troops.";
  const links = computeLinks(s);
  const v = s.villagers.find((x) => {
    if (x.role !== "idle" || x.work || x.health <= 20) return false;
    const home = byId(s, x.house);
    return !!home && houseReachesBarracks(links, home, st);
  });
  if (!v) return "No idle villager in a house connected to this building by pavement.";
  const knight = TROOP_FOR[st.type] === "knight";
  const cost: Cost = knight ? { ...KNIGHT_RECRUIT } : { coin: 15 * st.level, iron: st.type === "armoury" ? 4 : 0 };
  if (!canAfford(s.res, cost)) return `Needs ${costText(cost)}.`;
  pay(s.res, cost);
  v.work = st.id;
  // Recruitment takes four hours, whatever the building.
  st.training = { villagerId: v.id, role: TROOP_FOR[st.type]!, rank: RECRUIT_RANK[st.type] ?? 1, left: RECRUIT_MINUTES, recruit: true };
  return null;
}

/**
 * Binds one of the player's real emblems to a grand wizard or an emblem
 * knight. The emblem's depth sets how far they can climb; without one they
 * stop at the threshold.
 */
export function bindEmblem(s: GameState, villagerId: number, emblem: Villager["emblem"]): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  if (v.role === "wizard" && v.rank < 15) return "Only grand wizards (level 15+) can hold an emblem.";
  if (v.role === "knight" && v.rank < 22) return "Only knights past level 22 can hold an emblem.";
  if (v.role !== "wizard" && v.role !== "knight") return "Only wizards and knights can hold an emblem.";
  v.emblem = emblem;
  return null;
}

/**
 * Posts a troop to a watchtower, or stands them down with `null`. Only
 * posted troops defend: they wait in the tower and come out when a monster
 * enters its radius.
 */
export function assignGuard(s: GameState, villagerId: number, towerId: number | null): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v || !MILITARY.includes(v.role)) return "Only troops can stand guard.";
  if (towerId === null) {
    v.guard = null;
    return null;
  }
  const t = byId(s, towerId);
  if (!t || !isGuardPost(t)) return "Guards are posted to a watchtower or an army point.";
  if (t.buildUntil) return "It is not finished.";
  const posted = s.villagers.filter((x) => x.guard === t.id && x.id !== v.id).length;
  const cap = guardSlots(t.level, t.type);
  if (posted >= cap) return `This ${t.type === "armypoint" ? "army point" : "tower"} holds ${cap} guards — upgrade it for more.`;
  v.guard = t.id;
  return null;
}

export function sell(s: GameState, ctx: SimContext, key: keyof GameState["res"], qty: number): Result {
  if (s.res[key] < qty) return "Not enough to sell.";
  const market = s.structures.filter((m) => m.type === "market" && !m.buildUntil);
  if (!market.length) return "Build a market to trade.";
  const values: Partial<Record<string, number>> = { onion: 1.4, bean: 1.6, turnip: 1, corn: 1.3, strawberry: 4, garlic: 5, watercress: 2, chestnut: 3.5, fish: 2, tonic: 12, fertiliser: 4, formula: 40, cabbage: 1.6, carrot: 1.3, pumpkin: 3, barley: 1.2, potato: 1, wheat: 1.4, grape: 3, herb: 6, rice: 1.2, taro: 1.6, lotus: 5, reed: 1, meals: 2, planks: 5, bricks: 6, ingots: 14, gunpowder: 20, poison: 24, ice: 3, silver: 18, gold: 40, mithril: 120, wood: 0.5, stone: 0.5, coal: 1.5, iron: 3 };
  const unit = values[key] ?? 1;
  const lvl = market.reduce((a, m) => Math.max(a, m.level), 1);
  const coin = unit * qty * ctx.profile.sellScale * (1 + lvl * 0.05);
  s.res[key] -= qty;
  s.res.coin += coin;
  log(s, `Sold ${qty} ${key} for ${coin.toFixed(1)} coin.`);
  return null;
}

void beds;

// ── Night shift and moving buildings ──────────────────────

/** Puts a worker of level 5 or more in charge of the night shift, or takes them off it. One leads it at a time. */
export function setNightShift(s: GameState, villagerId: number, on: boolean): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  if (on && MILITARY.includes(v.role)) return "Troops keep their own watch.";
  if (on && workLevel(v) < NIGHT_SHIFT_LEVEL) return `Only a worker of level ${NIGHT_SHIFT_LEVEL} or more can lead the night shift.`;
  if (on) for (const o of s.villagers) o.nightShift = false;
  v.nightShift = on;
  log(s, on ? `${v.name} takes the night shift: building goes on through the dark. They sleep by day.` : `${v.name} comes off the night shift. Building stops at dusk again.`, "info");
  return null;
}

/** The level a worker needs to take a building down and carry it elsewhere. */
export const MOVER_LEVEL = 10;
/** Who can move buildings: every worker of level 10 or more, in good health. */
export const movers = (s: GameState) => s.villagers.filter((v) => !MILITARY.includes(v.role) && workLevel(v) >= MOVER_LEVEL && v.health > 20);

/**
 * Hours to move a building: longer the higher it stands — two hours a level
 * on four, and half again for every tenth-level step — shared among up to
 * five movers.
 */
export function moveHours(st: Structure, n: number): number {
  return ((4 + 2 * st.level) * (1 + 0.5 * grade(st.level))) / Math.max(1, Math.min(5, n));
}

/** Orders a building moved: out of use until the movers have it up again on the new plot. */
export function relocate(s: GameState, id: number, x: number, y: number): Result {
  const st = byId(s, id);
  if (!st) return "No such building.";
  if (st.buildUntil) return "It is already being built or moved.";
  const crew = movers(s);
  if (!crew.length) return `Moving a building takes a worker of level ${MOVER_LEVEL}.`;
  if (st.x === x && st.y === y) return "It already stands there.";
  const check = checkMove(s, st, x, y);
  if (!check.ok) return check.reason ?? "It cannot stand there.";
  const h = moveHours(st, crew.length);
  st.moveTo = { x, y };
  st.buildUntil = s.time + Math.round(h * 60);
  log(s, `${crew.length} mover${crew.length > 1 ? "s take" : " takes"} down the ${CATALOG[st.type].name.toLowerCase()} to carry it to ${x},${y}: ${Math.ceil(h)} hours.`);
  return null;
}
