/**
 * The steward: a scripted player who plays the needs (src/lib/town/sim/needs),
 * for the balance checks. Each hour it reads the pyramid and answers the
 * lowest tier that is short — food before fences, fences before feasts —
 * while planning ahead: stores laid in before the season that eats them,
 * homes before the people who need them, defence kept up with the land's
 * answer, and the upper tiers tended once the lower ones hold.
 *
 * It is deliberately modest: it builds at most one thing every few hours,
 * raises at most one building every half day, and never spends below what
 * the lower tiers need to hold. What it proves is not that any one of its
 * choices is clever, but that sensible choices made one after another carry
 * a town a long way — and that the game rewards them.
 */
import { CATALOG, baseBeds, type Cost } from "../src/lib/town/sim/catalog";
import { addUtility, clear, fire, hire, paint, place, recruit, schoolTrain, setFooting, setMode, setPolicy, upgrade, upgradeBlock } from "../src/lib/town/sim/actions";
import { frameUtil } from "../src/lib/town/sim/frame";
import { clock, countedTroops } from "../src/lib/town/sim/state";
import { FESTIVAL_COST, holdFestival, type SimContext } from "../src/lib/town/sim/tick";
import { canAfford, capOf, center, checkPlacement, computeLinks, farmReachesMarket, findPath, idx, inBounds, occupancy } from "../src/lib/town/sim/world";
import { needsOf, needsState, tierOf, unguarded, type Needs } from "../src/lib/town/sim/needs";
import { FIT_HEALTH, candidates, programmesAt, type Programme } from "../src/lib/town/sim/enrol";
import { attrsOf } from "../src/lib/town/sim/attributes";
import { readPlayer, tacticOdds, TACTICS } from "../src/lib/town/sim/nemesis";
import { targetValue } from "../src/lib/town/sim/breach";
import { Overlay, Terrain, type GameState, type Structure, type StructureType } from "../src/lib/town/sim/types";

export interface StewardMemory {
  /** No new building before this (game time): one decision at a time. */
  nextBuildAt: number;
  /** No upgrade before this. */
  nextUpgradeAt: number;
  /** Food-days a day ago, for the trend. */
  foodAgo: number[];
  /** Wood in store at noon, the last few days, for the trend. */
  woodAgo: number[];
  /** Why each decision was taken, for the reports. */
  journal: string[];
  /** A search that found no plot is not tried again before this (game time), per kind. */
  backoff: Record<string, number>;
  /** Whether the town may grow this hour (set by stewardHour). */
  growthOk?: boolean;
}

export const newMemory = (): StewardMemory => ({ nextBuildAt: 0, nextUpgradeAt: 0, foodAgo: [], woodAgo: [], journal: [], backoff: {} });

/** Tries a kind of decision unless it failed lately; a failure rests it for six hours. */
function attempt(s: GameState, mem: StewardMemory, id: string, fn: () => boolean): boolean {
  if (s.time < (mem.backoff[id] ?? 0)) return false;
  const ok = fn();
  if (!ok) mem.backoff[id] = s.time + 6 * 60;
  return ok;
}

const TROOPS = ["infantry", "archer", "heavy", "wizard", "knight"];
/** What keeps the base of the pyramid standing: these are guarded before anything else. */
const LIFELINES: StructureType[] = ["lumbercamp", "fishery", "farm", "watermill", "kitchen", "storehouse", "house", "barracks"];
/** Buildings nothing actually defends (./needs unguarded): lifelines first, then the most tempting. */
const exposed = (s: GameState) => unguarded(s).sort((a, b) =>
  (LIFELINES.includes(a.type) ? 0 : 1) - (LIFELINES.includes(b.type) ? 0 : 1) || targetValue(s, b, "K") - targetValue(s, a, "K"));
const hallOf = (s: GameState) => s.structures.find((x) => x.type === "townhall");
const count = (s: GameState, t: StructureType) => s.structures.filter((x) => x.type === t).length;
const building = (s: GameState) => s.structures.some((x) => x.buildUntil && x.type !== "lamppost");
/** Can the town pay this and still keep a floor under the lower tiers? */
const spare = (s: GameState, cost: Cost, floor: Partial<Record<keyof Cost, number>> = { wood: 60, stone: 30 }) =>
  Object.entries(cost).every(([k, v]) => s.res[k as keyof typeof s.res] - (v as number) >= (floor[k as keyof Cost] ?? 0));

/** Pave from a new building to the hall's streets, so it counts (farms to market, barracks to towers). */
function connect(s: GameState, st: Structure) {
  const to = s.structures.find((x) => x.type === "market" && !x.buildUntil) ?? hallOf(s);
  if (!to || to === st) return;
  const path = findPath(s, st, to, true, occupancy(s));
  if (!path) return;
  const tiles = path.filter((i) => s.map.terrain[i] !== Terrain.Pavement);
  if (tiles.length && tiles.length <= 60) paint(s, "pavement", tiles);
}

function placed(s: GameState, ctx: SimContext, type: StructureType, x: number, y: number): Structure | null {
  if (!checkPlacement(s, type, x, y).ok) return null;
  if (place(s, ctx, type, x, y)) return null;
  const st = s.structures[s.structures.length - 1];
  connect(s, st);
  return st;
}

/** The nearest good plot to a point, spiralling out. */
function placeNear(s: GameState, ctx: SimContext, type: StructureType, cx: number, cy: number, maxR = 16): Structure | null {
  const def = CATALOG[type];
  for (let r = 0; r <= maxR; r++) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
      const st = placed(s, ctx, type, x - Math.floor(def.w / 2), y - Math.floor(def.h / 2));
      if (st) return st;
    }
  }
  return null;
}

/** A plot on the water's edge, nearest the hall first. */
function placeByWater(s: GameState, ctx: SimContext, type: StructureType, maxR = 34): Structure | null {
  const hall = hallOf(s);
  if (!hall) return null;
  const [cx, cy] = center(hall).map(Math.round);
  const def = CATALOG[type];
  const water: [number, number, number][] = [];
  for (let y = cy - maxR; y <= cy + maxR; y++) for (let x = cx - maxR; x <= cx + maxR; x++) {
    if (!inBounds(x, y) || s.map.terrain[idx(x, y)] !== Terrain.Water) continue;
    water.push([x, y, Math.hypot(x - cx, y - cy)]);
  }
  water.sort((a, b) => a[2] - b[2]);
  // The water's edge only: a tile with land beside it.
  const edge = water.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(x + dx, y + dy) && s.map.terrain[idx(x + dx, y + dy)] !== Terrain.Water));
  for (const [wx, wy] of edge.slice(0, 40)) {
    for (let dy = -def.h; dy <= 1; dy++) for (let dx = -def.w; dx <= 1; dx++) {
      const st = placed(s, ctx, type, wx + dx, wy + dy);
      if (st) return st;
    }
  }
  return null;
}

/** A field beside a watermill, with a road to market. */
function placeFarm(s: GameState, ctx: SimContext): Structure | null {
  const mills = s.structures.filter((m) => m.type === "watermill" && !m.buildUntil).sort((a, b) => b.level - a.level);
  for (const m of mills) {
    for (let y = m.y - 3; y <= m.y + m.h; y++) for (let x = m.x - 3; x <= m.x + m.w; x++) {
      const f = placed(s, ctx, "farm", x, y);
      if (!f) continue;
      if (!farmReachesMarket(s, computeLinks(s), f)) connect(s, f);
      return f;
    }
  }
  return null;
}

/** Food jobs standing empty: if there are any, the answer is hands, not another building. */
function openFoodJobs(s: GameState): number {
  return s.structures
    .filter((x) => !x.buildUntil && (x.type === "farm" || x.type === "fishery" || x.type === "waterfarm"))
    .reduce((a, x) => a + Math.max(0, CATALOG[x.type].slots(x.level) - x.workers.length), 0);
}

/** More food: a field if a mill has room, else a fishing hut, else a new mill. */
function addFood(s: GameState, ctx: SimContext, mem: StewardMemory): boolean {
  if (openFoodJobs(s) > 0) return false;
  const winter = clock(s.time).season === "winter";
  const tries: (() => Structure | null)[] = winter
    ? [() => placeByWater(s, ctx, "fishery")]
    : [() => placeFarm(s, ctx), () => placeByWater(s, ctx, "fishery"), () => placeByWater(s, ctx, "watermill")];
  for (const t of tries) {
    const st = t();
    if (st) {
      mem.journal.push(`D${clock(s.time).day} food: ${st.type}`);
      return true;
    }
  }
  return false;
}

function addFuel(s: GameState, ctx: SimContext, mem: StewardMemory): boolean {
  const hall = hallOf(s);
  if (!hall) return false;
  const cold = ["autumn", "winter"].includes(clock(s.time).season);
  if (count(s, "lumbercamp") < 1 + Math.floor(s.villagers.length / 10) + (cold ? 1 : 0)) {
    const [cx, cy] = center(hall).map(Math.round);
    // The nearest forest edge.
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let y = cy - 30; y <= cy + 30; y++) for (let x = cx - 30; x <= cx + 30; x++) {
      if (!inBounds(x, y) || s.map.terrain[idx(x, y)] !== Terrain.Forest) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) [bd, best] = [d, [x, y]];
    }
    if (best) {
      const st = placeNear(s, ctx, "lumbercamp", best[0], best[1], 8);
      if (st) {
        mem.journal.push(`D${clock(s.time).day} fuel: lumber camp`);
        return true;
      }
    }
  }
  // Otherwise idle hands fell the trees nearest the hall — with the woodpile empty, a hand is spared for it.
  if (s.res.wood < 20 && !s.villagers.some((v) => v.role === "idle" && !v.work)) freeHand(s, ["fisher", "farmhand", "trader", "miner", "refiner"]);
  const [cx, cy] = center(hall).map(Math.round);
  const trees: number[] = [];
  for (let y = cy - 14; y <= cy + 14 && trees.length < 12; y++) for (let x = cx - 14; x <= cx + 14 && trees.length < 12; x++) {
    if (inBounds(x, y) && s.map.overlay[idx(x, y)] === Overlay.Tree && !s.clearing.some((j) => j.tile === idx(x, y))) trees.push(idx(x, y));
  }
  if (trees.length && !clear(s, trees)) {
    mem.journal.push(`D${clock(s.time).day} fuel: fell ${trees.length} trees`);
    return true;
  }
  return false;
}

/** Beds that will be there when the work in hand is done: homes being built or raised count at their new size. */
function bedsSoon(s: GameState): number {
  return s.structures.filter((h) => h.type === "house" || h.type === "apartment").reduce((a, h) => a + baseBeds(h.level) + (h.bedUpgrades ?? 0), 0);
}

function addHouse(s: GameState, ctx: SimContext, mem: StewardMemory, homeless = false): boolean {
  const hall = hallOf(s);
  if (!hall) return false;
  // Another level on a home the town already heats is more beds for no more fires — but not for
  // the homeless: a home under work has no beds until it is done.
  const home = homeless ? undefined : s.structures.filter((h) => h.type === "house" && !h.buildUntil && !upgradeBlock(s, h.id)).sort((a, b) => a.level - b.level)[0];
  if (home && spare(s, CATALOG.house.upgrade(home.level), { wood: 60, stone: 40, coin: 10 }) && !upgrade(s, ctx, home.id)) {
    mem.journal.push(`D${clock(s.time).day} beds: house to ${home.level}`);
    return true;
  }
  if (!canAfford(s.res, CATALOG.house.cost)) return false;
  const [cx, cy] = center(hall).map(Math.round);
  const st = placeNear(s, ctx, "house", cx, cy + 6, 14);
  if (st) mem.journal.push(`D${clock(s.time).day} beds: house`);
  return !!st;
}

/** A tower by whatever is most tempting and least guarded — the hall first. */
function addTower(s: GameState, ctx: SimContext, mem: StewardMemory): boolean {
  if (!spare(s, CATALOG.watchtower.cost)) return false;
  const m = readPlayer(s);
  const hall = hallOf(s);
  const aim = hall && m.hallWeak >= 0.5 ? hall : exposed(s)[0];
  if (!aim) return false;
  const st = placeNear(s, ctx, "watchtower", Math.round(center(aim)[0]), Math.round(center(aim)[1]), 5);
  if (st) mem.journal.push(`D${clock(s.time).day} defence: tower by the ${CATALOG[aim.type].name.toLowerCase()}`);
  return !!st;
}

/** A refinery set to bricks: chimneys for the homes before the winter, so they can burn coal. */
function addRefinery(s: GameState, ctx: SimContext, mem: StewardMemory): boolean {
  const hall = hallOf(s);
  if (!hall || count(s, "refinery") || !spare(s, CATALOG.refinery.cost, { wood: 60, stone: 40, iron: 0 })) return false;
  const st = placeNear(s, ctx, "refinery", Math.round(center(hall)[0]) - 12, Math.round(center(hall)[1]) - 2, 16);
  if (!st) return false;
  setMode(s, st.id, "bricks");
  mem.journal.push(`D${clock(s.time).day} planning: refinery for bricks`);
  return true;
}

function addSchool(s: GameState, ctx: SimContext, mem: StewardMemory): boolean {
  const hall = hallOf(s);
  if (!hall || count(s, "school") || !spare(s, CATALOG.school.cost)) return false;
  const st = placeNear(s, ctx, "school", Math.round(center(hall)[0]) + 8, Math.round(center(hall)[1]), 14);
  if (st) mem.journal.push(`D${clock(s.time).day} learning: school`);
  return !!st;
}

/** Frees the least practised labourer from a job the town can spare them from, or null. */
function freeHand(s: GameState, from: string[], prog?: Programme): number | null {
  // For a programme (./../src/lib/town/sim/enrol), the hand best suited to it who clears its bar; else the least ranked.
  const pool = s.villagers.filter((x) => from.includes(x.role) && x.work);
  const fits = prog ? pool.filter((x) => x.health >= FIT_HEALTH && prog.bars.every((b) => attrsOf(x)[b.attr] >= b.min)) : pool;
  const v = prog
    ? fits.sort((a, b) => prog.bars.reduce((t, k) => t + attrsOf(b)[k.attr] - attrsOf(a)[k.attr], 0))[0]
    : pool.sort((a, b) => a.rank - b.rank)[0];
  if (!v || fire(s, v.id)) return null;
  return v.id;
}

/**
 * Where the town's hands go, decided each morning and changed one hand at a
 * time: at least three under arms, a cook in the kitchen, enough in the
 * forest for the season, and the rest to food. A town that cannot move its
 * people to what it lacks cannot answer anything.
 */
function labourPlan(s: GameState, mem: StewardMemory, g: { cold: boolean; woodGoal: number; foodGoal: number; foodDays: number }) {
  const day = clock(s.time).day;
  const pop = s.villagers.length;
  const troops = s.villagers.filter((v) => TROOPS.includes(v.role)).length;
  const inTraining = s.structures.some((b) => (b.type === "barracks" || b.type === "archery") && b.training);
  // A garrison of three at the least: a hand from the fields or the river if nobody stands idle.
  const soldierProg = programmesAt("barracks")[0];
  if (troops < 3 && !inTraining && pop >= 5 && !candidates(s, soldierProg).some((c) => c.ok) && g.foodDays >= 2) {
    const id = freeHand(s, ["fisher", "farmhand", "miner", "trader"], soldierProg);
    if (id !== null) mem.journal.push(`D${day} labour: a hand to the barracks`);
  }
  // A cook: the kitchen takes only trained cooks, and nobody eats well without one.
  const chefs = s.villagers.filter((v) => v.role === "chef").length;
  const school = s.structures.find((x) => x.type === "school" && !x.buildUntil);
  if (!chefs && school && !school.training) {
    // Only the deft are taken for the kitchen (./enrol): free the deftest hand if no one idle will do.
    const cook = programmesAt("school").find((p) => p.role === "chef")!;
    if (!candidates(s, cook).some((c) => c.ok)) freeHand(s, ["fisher", "farmhand", "miner", "trader", "lumberjack"], cook);
    if (!schoolTrain(s, school.id, "chef")) mem.journal.push(`D${day} labour: a cook to the school`);
  }
  // Fuel against food: whichever stands further below its goal gets the next hand.
  const jacks = s.villagers.filter((v) => v.role === "lumberjack").length;
  const jackGoal = Math.ceil(pop / (g.cold ? 5 : 7));
  const woodR = s.res.wood / g.woodGoal;
  const foodR = g.foodDays / g.foodGoal;
  const openCamp = s.structures.find((b) => b.type === "lumbercamp" && !b.buildUntil && b.workers.length < CATALOG.lumbercamp.slots(b.level));
  const openFood = s.structures.find((b) => (b.type === "fishery" || b.type === "farm") && !b.buildUntil && b.workers.length < CATALOG[b.type].slots(b.level));
  if (woodR < 1 && woodR < foodR - 0.15 && jacks < jackGoal && openCamp) {
    // An empty woodpile takes whoever can be spared, the mine included.
    const id = freeHand(s, s.res.wood < 20 ? ["fisher", "farmhand", "trader", "miner", "refiner"] : ["fisher", "farmhand", "trader"]);
    if (id !== null) {
      hire(s, openCamp.id, id);
      mem.journal.push(`D${day} labour: a hand to the lumber camp`);
    }
  } else if (foodR < 1 && foodR < woodR - 0.15 && jacks > 1 && openFood) {
    const id = freeHand(s, ["lumberjack"]);
    if (id !== null) {
      hire(s, openFood.id, id);
      mem.journal.push(`D${day} labour: a hand back to food`);
    }
  }
}

/** The one upgrade most worth making now, if any. */
function bestUpgrade(s: GameState, nd: Needs, barracksFull = false, growthOk = false): Structure | null {
  const hall = hallOf(s);
  const surv = tierOf(nd, "survival").sat;
  const want: Structure[] = [];
  if (barracksFull) {
    const b = s.structures.filter((x) => x.type === "barracks").sort((a, c) => a.level - c.level)[0];
    if (b) want.push(b);
  }
  const m = readPlayer(s);
  // Food capacity: the mill first (fields cannot outgrow it), then its fields.
  if (m.foodDays < 8 && surv < 0.9) {
    const mill = s.structures.filter((x) => x.type === "watermill").sort((a, b) => a.level - b.level)[0];
    const farm = s.structures.filter((x) => x.type === "farm").sort((a, b) => a.level - b.level)[0];
    if (farm && mill && farm.level < mill.level) want.push(farm);
    if (mill) want.push(mill);
    const fish = s.structures.filter((x) => x.type === "fishery").sort((a, b) => a.level - b.level)[0];
    if (fish) want.push(fish);
  }
  // A kitchen that cannot keep up with the crops.
  const raw = ["potato", "wheat", "fish", "barley", "corn", "bean", "rice"].reduce((a, k) => a + s.res[k as keyof typeof s.res], 0);
  const kitchen = s.structures.filter((x) => x.type === "kitchen").sort((a, b) => a.level - b.level)[0];
  if (kitchen && raw > 40 && s.res.meals < s.villagers.length * 3) want.push(kitchen);
  // Standing: the hall keeps pace with the town, and the towers with the threat.
  if (hall) want.push(hall);
  const tower = s.structures.filter((x) => x.type === "watchtower").sort((a, b) => a.level - b.level)[0];
  if (tower && tierOf(nd, "safety").sat < 0.8) want.push(tower);
  // More beds in the homes the town already has, before sprawling.
  const home = s.structures.filter((x) => x.type === "house").sort((a, b) => a.level - b.level)[0];
  if (home && growthOk && bedsSoon(s) <= s.villagers.length + 1) want.push(home);
  for (const st of want) {
    if (upgradeBlock(s, st.id)) continue;
    if (!spare(s, CATALOG[st.type].upgrade(st.level), { wood: 80, stone: 50, coin: 20 })) continue;
    return st;
  }
  return null;
}

/**
 * One hour of the steward. The chores (hiring, guards, fires, lamps) are
 * done by the caller, as for every scripted player; this is the thinking.
 *
 * Policy first (hours, heat, fuel), then the people (troops, hands, feasts,
 * lessons), then at most one upgrade every half day and at most one new
 * building every few hours — chosen by scoring what each tier of the
 * pyramid is short of, the base weighing most, and taking the best that
 * can be done. Growth waits until the base holds and nothing stands bare.
 */
export function stewardHour(s: GameState, ctx: SimContext, mem: StewardMemory): Needs {
  const nd = needsOf(s);
  const c = clock(s.time);
  const m = readPlayer(s);
  const pop = s.villagers.length;
  if (c.hour === 12) {
    mem.foodAgo.push(m.foodDays);
    if (mem.foodAgo.length > 3) mem.foodAgo.shift();
    mem.woodAgo.push(s.res.wood);
    if (mem.woodAgo.length > 3) mem.woodAgo.shift();
  }
  const falling = mem.foodAgo.length >= 2 && m.foodDays < mem.foodAgo[mem.foodAgo.length - 2] - 0.3;
  const cold = c.season === "autumn" || c.season === "winter";
  // What the stores should hold: a working week of food, and a winter's worth by the end of autumn; wood to match.
  const foodGoal = c.season === "autumn" ? 12 : c.season === "winter" ? 5 : 7;
  const woodGoal = cold ? 120 + 14 * pop : 100 + 6 * pop;
  const surv = tierOf(nd, "survival");
  const safety = tierOf(nd, "safety");
  const belong = tierOf(nd, "belonging");
  const accord = belong.parts.find((p) => p.id === "accord")!.sat;
  // Every free bed is a newcomer within hours, and every newcomer eats and needs a fire:
  // the town grows only in the warm months, and only while food and wood both hold up.
  const woodFalling = mem.woodAgo.length >= 2 && s.res.wood < mem.woodAgo[0] - 20;
  // And only as far as the winter to come can be carried: a hand in the forest for every five mouths.
  const winterReady = s.villagers.filter((v) => v.role === "lumberjack").length * 5 >= pop + 2;
  mem.growthOk = !cold && winterReady && m.foodDays >= foodGoal && !falling && s.res.wood >= woodGoal && !woodFalling && unguarded(s).length === 0;

  // ── Policy: hours against accord, heat against fuel ──
  const pol = s.policy ?? { shift: 14, heat: 12, coalFirst: false };
  const shift = accord < 0.55 ? 12 : accord > 0.7 && m.foodDays < 3 ? 14 : pol.shift ?? 14;
  const heat = s.res.wood + s.res.coal < 30 * pop ? 8 : s.res.wood > woodGoal * 1.5 ? 12 : 10;
  const coalFirst = s.res.coal > s.res.wood;
  if (shift !== pol.shift || heat !== pol.heat || coalFirst !== pol.coalFirst) setPolicy(s, { shift, heat, coalFirst });

  // ── Hands first: food, fuel and the kitchen are staffed before anyone is sent to the barracks ──
  const lifeJobs: StructureType[] = ["farm", "fishery", "lumbercamp", "kitchen"];
  for (const t of lifeJobs) for (const b of s.structures) if (b.type === t && !b.buildUntil) hire(s, b.id);
  const openLife = s.structures
    .filter((b) => !b.buildUntil && lifeJobs.includes(b.type))
    .reduce((a, b) => a + Math.max(0, CATALOG[b.type].slots(b.level) - b.workers.length), 0);

  // ── Labour plan, each morning: a garrison, a cook, fuel, then food — one hand moved at a time ──
  if (c.hour === 6) labourPlan(s, mem, { cold, woodGoal, foodGoal, foodDays: m.foodDays });

  // ── Troops: enough to man the towers, a fifth of the town or more, a third at most ──
  const troops = s.villagers.filter((v) => TROOPS.includes(v.role)).length;
  const towersUp = s.structures.filter((t) => t.type === "watchtower" && !t.buildUntil).length;
  const troopGoal = Math.max(3, towersUp * 2, Math.ceil(pop * (safety.parts.find((p) => p.id === "defence")!.sat < 0.6 ? 0.25 : 0.2)));
  let barracksFull = false;
  if (troops < troopGoal && troops < pop * 0.33 && m.foodDays >= 2 && (openLife === 0 || troops < 3)) {
    const halls = s.structures.filter((b) => !b.buildUntil && (b.type === "barracks" || b.type === "archery"));
    const said = halls.map((b) => recruit(s, b.id));
    barracksFull = halls.length > 0 && said.every((r) => r?.startsWith("At capacity"));
  }
  // Rubble from what the land brought down blocks the best plots: idle hands clear it.
  if (c.hour === 7) {
    const [hx0, hy0] = hallOf(s) ? center(hallOf(s)!).map(Math.round) : [40, 30];
    const rubble: number[] = [];
    for (let y = hy0 - 30; y <= hy0 + 30; y++) for (let x = hx0 - 36; x <= hx0 + 36; x++) {
      if (inBounds(x, y) && s.map.overlay[idx(x, y)] === Overlay.Debris && !s.clearing.some((j) => j.tile === idx(x, y))) rubble.push(idx(x, y));
    }
    if (rubble.length) clear(s, rubble.slice(0, 60));
  }

  // ── Hands: the lower tiers are staffed first ──
  const order: StructureType[] = ["farm", "fishery", "kitchen", "lumbercamp", "watermill", "mine", "market"];
  for (const t of order) for (const b of s.structures) if (b.type === t && !b.buildUntil) hire(s, b.id);

  // ── Belonging: a feast when the town needs one and can spare it ──
  const feastAgo = s.time - (needsState(s).festAt ?? -1e9);
  if (belong.sat < 0.55 && surv.sat > 0.65 && feastAgo > 4 * 1440 && canAfford(s.res, FESTIVAL_COST) && s.res.meals - FESTIVAL_COST.meals >= pop * 3 && !holdFestival(s)) {
    mem.journal.push(`D${c.day} belonging: festival`);
  }
  // A comfort for a home that has none, when the stone is spare.
  if (c.hour === 10 && s.res.stone > 150) {
    const home = s.structures.find((h) => h.type === "house" && !h.buildUntil && !(h.utilities?.length));
    if (home) addUtility(s, home.id, "well");
  }
  // The school teaches whoever stands idle: cooks and biologists feed the base of the pyramid.
  const school = s.structures.find((x) => x.type === "school" && !x.buildUntil && !x.training);
  const idle = s.villagers.filter((v) => v.role === "idle" && !v.work && v.health > 20).length;
  if (school && idle >= 2 && s.res.coin >= 80) schoolTrain(s, school.id, count(s, "kitchen") && !s.villagers.some((v) => v.role === "biologist") ? "biologist" : "chef");

  // ── Footings under the most loaded roof, before the snow and the siege find it ──
  if (c.hour === 6) {
    const loaded = [...s.structures].filter((b) => !b.buildUntil).sort((a, b) => frameUtil(s, b) - frameUtil(s, a))[0];
    if (loaded && frameUtil(s, loaded) > 0.9) setFooting(s, loaded.id, "trench");
  }

  // ── One upgrade every half day at most ──
  if (s.time >= mem.nextUpgradeAt && surv.sat > 0.6) {
    const st = bestUpgrade(s, nd, barracksFull, !!mem.growthOk);
    if (st && !upgrade(s, ctx, st.id)) {
      mem.nextUpgradeAt = s.time + 12 * 60;
      mem.journal.push(`D${c.day} upgrade: ${st.type} to ${st.level}`);
    }
  }

  // ── One new building every few hours: score what each tier is short of, take the best ──
  const plans: { id: string; score: number; run: () => boolean }[] = [];
  const want = (id: string, score: number, run: () => boolean) => {
    if (score > 0) plans.push({ id, score, run });
  };
  const hall = hallOf(s);
  const [hx, hy] = hall ? center(hall).map(Math.round) : [40, 30];
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  // Survival. The store is not the harvest: a store that falls day on day is a harvest too small,
  // however full it looks — and the cold half of the year is no time to find out.
  want("food", 100 * clamp01((foodGoal - m.foodDays) / foodGoal + (falling ? 0.2 : 0)), () => addFood(s, ctx, mem));
  if (falling && c.season !== "winter" && m.foodDays < 30) want("food", c.season === "autumn" ? 72 : 58, () => addFood(s, ctx, mem));
  // Homeless now, counting the beds already being built.
  if (bedsSoon(s) + 2 < pop) want("house", 85, () => addHouse(s, ctx, mem, true));
  const lumberGoal = 1 + Math.floor(pop / 10) + (cold ? 1 : 0);
  const woodShort = clamp01((woodGoal - s.res.wood) / woodGoal);
  want("fuel", count(s, "lumbercamp") === 0 ? 95 : 92 * woodShort * (count(s, "lumbercamp") < lumberGoal ? 1 : 0.6), () => addFuel(s, ctx, mem));
  // Safety: whatever stands outside a tower's reach is what the fog's bands take, one a half day.
  const bare = exposed(s).length;
  const lifelineBare = exposed(s).some((b) => LIFELINES.includes(b.type));
  const towerRoom = s.structures.filter((t) => t.type === "watchtower").length < 2 + Math.floor(pop / 4);
  if (m.hallWeak >= 0.5) want("tower", 88, () => addTower(s, ctx, mem));
  else if (bare && towerRoom && s.res.wood >= 60) want("tower", (lifelineBare ? 82 : 55) + 3 * Math.min(4, bare), () => addTower(s, ctx, mem));
  if (!count(s, "storehouse")) want("store", 50, () => !!placeNear(s, ctx, "storehouse", hx + 10, hy + 4, 14));
  if (!count(s, "barracks") && pop >= 6 && spare(s, CATALOG.barracks.cost)) want("barracks", 60, () => !!placeNear(s, ctx, "barracks", hx - 8, hy + 6, 14));
  // Bowmen against fliers and night swarms, once the land favours them.
  if (!count(s, "archery") && pop >= 10 && spare(s, CATALOG.archery.cost)) {
    const odds = tacticOdds(s);
    const top = TACTICS[odds.indexOf(Math.max(...odds))];
    if (top === "flyers" || top === "night" || top === "swarm") want("archery", 40, () => !!placeNear(s, ctx, "archery", hx - 10, hy + 10, 16));
  }
  // A reserve cannot outgrow its store: room for the winter, before the goods press against the roof.
  const pressing = (["wood", "wheat", "potato", "fish", "meals", "barley", "corn"] as const).some((k) => s.res[k] >= 0.85 * capOf(s, k));
  if (pressing && c.season !== "winter") {
    const store = s.structures.filter((x) => x.type === "storehouse" && !x.buildUntil).sort((a, b) => a.level - b.level)[0];
    if (store && !upgradeBlock(s, store.id) && spare(s, CATALOG.storehouse.upgrade(store.level), { wood: 40, stone: 30, coin: 0 }))
      want("storeup", 66, () => !upgrade(s, ctx, store.id));
    else if (count(s, "storehouse") < 3) want("store2", 62, () => !!placeNear(s, ctx, "storehouse", hx + 12, hy - 4, 16));
  }
  // No cook and no school to train one: the town eats raw crops, and its minds show it.
  if (!count(s, "school") && !s.villagers.some((v) => v.role === "chef")) want("school", 78, () => addSchool(s, ctx, mem));
  // Long-term planning: bricks in the warm months, so every home has a chimney (and burns coal) by winter.
  const openHearths = s.structures.filter((h) => (h.type === "house" || h.type === "apartment") && !h.buildUntil && h.hearth === "open").length;
  if (!count(s, "refinery") && openHearths && count(s, "lumbercamp") && m.foodDays >= 3) want("refinery", c.season === "summer" || c.season === "autumn" ? 70 : 45, () => addRefinery(s, ctx, mem));

  // Growth, once the base holds and nothing stands bare: a school, homes, and food ahead of need.
  const secure = bare === 0 && m.hallWeak < 0.5;
  if (secure && surv.sat > 0.75 && safety.sat > 0.6) {
    if (pop >= 8 && !count(s, "school")) want("school", 30, () => addSchool(s, ctx, mem));
    if (mem.growthOk && bedsSoon(s) < pop + 2) want("house", 28, () => addHouse(s, ctx, mem));
    if (m.foodDays < foodGoal + 4) want("food", 25, () => addFood(s, ctx, mem));
  }
  plans.sort((a, b) => b.score - a.score);
  // Hunger, cold or homelessness may jump the queue — by an hour, not by a spree.
  const urgent = (plans[0]?.score ?? 0) >= 80;
  if (s.time < (urgent ? mem.nextBuildAt - 2 * 60 : mem.nextBuildAt)) return nd;
  if (building(s) && !urgent) return nd;
  for (const p of plans) {
    if (attempt(s, mem, p.id, p.run)) {
      mem.nextBuildAt = s.time + 3 * 60;
      break;
    }
  }
  return nd;
}

void countedTroops;
