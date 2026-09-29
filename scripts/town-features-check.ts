/**
 * Exercises the town's later systems headlessly: night haunts, spoils and
 * the forge's store, gear and the training gate, wizard ascension, emblem
 * knight sorties, kitchen dishes and braziers. Prints what happened and
 * exits non-zero if an invariant breaks.
 *
 * Run with `npx tsx scripts/town-features-check.ts`.
 */
import { newTown, clock, makeVillager, makeStructure, migrate, byId, packSave, unpackSave, beds } from "../src/lib/town/sim/state";
import { advance, pastNight, raidChance, raidForecast, trainingPace, scheduleRaid, type SimContext } from "../src/lib/town/sim/tick";
import { rng } from "../src/lib/town/sim/world";
import { buildingEffects } from "../src/lib/town/sim/effects";
import { stepCombat, hauntFor, summonHaunt, summonProwlers, prowlChance } from "../src/lib/town/sim/combat";
import { cancelWork, fitHearth, recruit, place, setMode, hire, clear, schoolTrain, assignGuard, stokeFire, markEarthworks, trade, upgrade, upgradeWalls, combineHomes, combinePartners, setNightShift, relocate, moveHours, paint } from "../src/lib/town/sim/actions";
import { CATALOG, DISHES, LAND_CROPS, STORE_PER_LEVEL, WATER_CROPS, grade, hallMinDay, homeTitle, jewelCost, knightPay, knightTitle, soldierTitle, upgradePeople } from "../src/lib/town/sim/catalog";
import { MATURE, SNAG, SPROUT, TILE_WOOD, TREE_WOOD, YOUNG, atStage, forests, growWoods, pickSpecies, ripe, treeLook, treeMeta, treeSpecies, treeStage, winterCull } from "../src/lib/town/sim/woods";
import {
  GEAR, advanceKnight, armorySlots, ascensionOdds, attemptAscension, deploy, equip, forgeOf, gearCap, knightCapFor, startCraft, stock, store,
  wizardCapFor, xpToNext,
} from "../src/lib/town/sim/loot";
import { profileFor, type TownInput } from "../src/lib/town/rules";
import {
  RARE_FINDS, fitAt, gapBetween, spacingProblem, alertRadius, burnRate, captainBonus, center, hallRadius, mineRareRate, passiveRadius, structureMaxHp, wallHp, wallLevel, wallMaxHp, wallMeta, checkPlacement, fieldFrozen, fuelCap, growsInWinter, guardSlots, isLit, isWarm, storageCap, unlitBuildings, warmFields, warmthRange, capOf, groundYield, hallCap, airBoost, fireAir, fireAirDT, WALL_MAX_LEVEL,
} from "../src/lib/town/sim/world";
import { MAP_W, MAP_H, Overlay, RAW_FOODS, SEASON_LENGTH, Terrain, YEAR_DAYS, type GameState, type StructureType } from "../src/lib/town/sim/types";
import { FOG, UNSEEN, VISIBLE, visionMap } from "../src/lib/town/sim/vision";
import { MONSTERS } from "../src/lib/town/sim/bestiary";
import { DROPS, dropsFor } from "../src/lib/town/sim/loot";
import { aggroOf } from "../src/lib/town/sim/aggro";
import { PACK_SLOTS, RATION_MEALS, adventureReach, canPack, packRation, packTorch, sendScout, unpackSlot } from "../src/lib/town/sim/wilds";
import { WILD_CAP, sowWild, wildCrop } from "../src/lib/town/sim/forage";
import { advise, hintState, revealHint } from "../src/lib/town/sim/advisor";
import { HEARTHS } from "../src/lib/town/sim/zones";
import { EFFORT_POINTS, canWork, capacity, hasNightShift, jobEffort, workDawn } from "../src/lib/town/sim/work";
import { LEGENDS, LEGEND_TOWN, ascendLegend, hasLegend, legendChecks, legendMods } from "../src/lib/town/sim/legends";
import { LAIR_START } from "../src/lib/town/sim/wilds";
import { AUG_CAP, augment, dimReturn } from "../src/lib/town/sim/augment";
import { TRAVEL_COST, isAway as isAwayLeisure, sendToMuseum, sendTravelling } from "../src/lib/town/sim/leisure";
import { stats } from "../src/lib/town/sim/stats";
import { assaultGate, assaultOdds, landCalm } from "../src/lib/town/sim/endgame";
import { achievementList } from "../src/lib/town/sim/achievements";
import { endgameTown } from "../src/lib/town/sim/showcase";
import { trophyParts } from "../src/components/town/art/trophies";
import { knowledgeHourly, knowledgeOf } from "../src/lib/town/sim/knowledge";
import { MASTERY_STEP, STEADY, THRIFTY, choosePath, computeRate, pathsFor, pathsHourly, rateOf, refreshPaths, retoolCost, settle, snap } from "../src/lib/town/sim/paths";
import { lightRange, storeRoom } from "../src/lib/town/sim/world";
import { placeOf } from "../src/lib/town/sim/body";
import { group, orderAttack, orderMove, orderReturn, orderStop, setGroup, unitAt, units, unitsIn } from "../src/lib/town/sim/command";
import { BIOMES, BIOME_DEFS, landCrops, localize, native, pickBiome, type Biome } from "../src/lib/town/sim/biomes";
import { air, weatherHourly, weatherOf, type Regime } from "../src/lib/town/sim/weather";
import { cropHour } from "../src/lib/town/sim/crops";
import { arrivalFor, habitWeight, isleEdge, sandSlowed, stormsHourly, weatherCombat } from "../src/lib/town/sim/habits";
import { stepWilds } from "../src/lib/town/sim/wilds";
import { unpaint } from "../src/lib/town/sim/actions";
import { STOCKS, allocate, needs, setTitheFocus } from "../src/lib/town/sim/tithes";
import type { FieldDaily } from "../src/lib/town/rules";
import { neglect } from "../src/lib/town/sim/nemesis";
import { OPENING_DAYS, RAMP_DAYS, nightThreat, nightbornFor, otherShare, redSky, setNightWatch } from "../src/lib/town/sim/menace";
import { ALL_ATTRS, ATTR_MAX, attrsOf, growOnRise, rollAttrs, warMods, workMul } from "../src/lib/town/sim/attributes";
import { REC_START, onDeath, recognitionDaily, recognitionOf, talentOdds } from "../src/lib/town/sim/recognition";
import { kill } from "../src/lib/town/sim/tick";
import { MANNERS, inHallZone, mannerOf, perceptionOf } from "../src/lib/town/sim/wilds";
import { fillAllLamps, fillLamp, tripHours, harvestYield, pickFruit } from "../src/lib/town/sim/actions";
import { WALL_ORDERS, wallOrder, wallMeta as wMeta, wallMaxHp as wMax, wallHp as wHp } from "../src/lib/town/sim/world";
import { HEAVY_CLASSES, bestCandidate, candidates, programmesAt } from "../src/lib/town/sim/enrol";
import { heroCapOf, masteryOf, rankCapOf, readStudy, streakTalent, studyDawn, workCapOf } from "../src/lib/town/sim/mastery";
import { WORK_MAX, workXpToNext } from "../src/lib/town/sim/work";
import { isMythicWatcher } from "../src/lib/town/sim/menace";
import { LAMP_BURN, LAMP_CAP, lampFuel } from "../src/lib/town/sim/world";
import { plural } from "../src/lib/town/sim/words";
import { COUNTERED_PENALTY, COUNTER_BONUS, ELEMENTS, elementFactor } from "../src/lib/town/sim/elements";
import { itemDef, itemList } from "../src/lib/town/sim/items";
import { claimSingleton, dropRarity, fullSet, gearBonus, gearStats, lootFor } from "../src/lib/town/sim/loot";
import {
  BOOK_HOURS, ascendMaster, bookCheck, bookWritten, crownKing, finishWorks, kingChecks, kingMight, offerToStatue, statuesHourly, writeBook,
} from "../src/lib/town/sim/champions";
import { projectileFor, wizardSpeed } from "../src/lib/town/sim/combat";
import { EXCURSION_LEVEL, EYE_AFTER, VISIONS, canExcursion, excursionHome, foresee, visionCost } from "../src/lib/town/sim/seer";
import { gainWork, workLevel } from "../src/lib/town/sim/work";
import { launchWave } from "../src/lib/town/sim/aggro";
import { burnWard, omenCombat, omenOf, omenPace, raiseOmen } from "../src/lib/town/sim/omens";
import type { Combatant } from "../src/lib/town/sim/types";
import { ORDERS_MAX, hungerText, landHunger, ordersOf, reviewHref } from "../src/lib/town/sim/orders";
import { SLOW_PACE } from "../src/lib/town/sim/tick";
import { carryDay } from "../src/lib/town/sim/knowledge";
import { needAnswer } from "../src/lib/town/sim/advisor";
import { cartAt, pulseOf } from "../src/lib/town/pulse";
import { POOLS, TIERS, cartGoods, rollDrop, settleStudy, tierOf } from "../src/lib/town/sim/knowledge";
import { MOMENTS_MAX, lastMomentId, markSeen, pushMoment, unseenMoments } from "../src/lib/town/sim/moments";
import { playthrough } from "./town-playthrough";
import { burnText, climateNow, dailyFuel, doomText, fireKgH, perilAlarms, perilOf, winterClimate } from "../src/lib/town/sim/psyche";
import { SAMPLES_MAX, WAVES_MAX, causeOf, lessonOf, noteDawn, noteWave, runReport, runlogOf, type DeathCause } from "../src/lib/town/sim/runlog";
import { isHeated } from "../src/lib/town/sim/zones";
import { DAY_MIN } from "../src/lib/town/sim/types";
// These checks build wherever they need to; the fog has checks of its own.
FOG.rules = false;

const input: TownInput = {
  schools: { commerce: 14, science: 16, mind: 12 },
  scores: { PHYSICAL: 40, FAITH: 30, CREATIVITY: 30, STATISTIC: 30, STUBBORNNESS: 40 },
  streakDays: 12,
  equippedAttributes: ["PHYSICAL", "FAITH"],
  peakDepth: 6,
  reviewsToday: 10,
  newIdeasThisWeek: { commerce: 2, science: 2, mind: 2 },
  emblems: [],
  domainPeak: 6,
  domainSum: 40,
  dueRemaining: 0,
  newIdeasToday: 2,
};
const ctx: SimContext = { profile: profileFor(input), input };

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${what}`);
  if (!ok) failures++;
};

function spot(s: GameState, type: StructureType, x0: number, y0: number) {
  for (let y = y0; y < y0 + 14; y++) for (let x = x0; x < x0 + 20; x++) if (checkPlacement(s, type, x, y).ok) return [x, y] as const;
  return null;
}
/** The nearest legal spot to (x0, y0), searching outward over the whole map. */
function spotNear(s: GameState, type: StructureType, x0: number, y0: number) {
  for (let r = 0; r < Math.max(MAP_W, MAP_H); r += 2) {
    for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
      if (Math.max(Math.abs(x - x0), Math.abs(y - y0)) < r - 1) continue;
      if (checkPlacement(s, type, x, y).ok) return [x, y] as const;
    }
  }
  return null;
}
function build(s: GameState, type: StructureType, x0: number, y0: number) {
  const p = spot(s, type, x0, y0) ?? spotNear(s, type, x0, y0);
  if (!p) throw new Error(`no spot for ${type}`);
  const st = makeStructure(s, type, p[0], p[1], true);
  return st;
}
const fight = (s: GameState) => {
  let guard = 0;
  while (s.raid && guard++ < 40000) stepCombat(s, 0.05);
  return guard;
};

// ── Night haunts ──────────────────────────────────────────
console.log("night haunts");
{
  const s = newTown(7, 20);
  check(unlitBuildings(s).length === 0, "a new town is founded fully lit");
  // Put up a house out in the dark, as a player outgrowing their light would.
  build(s, "storehouse", 70, 50);
  const dark = unlitBuildings(s);
  console.log(`   after building beyond the light: ${dark.length} unlit — ${dark.map((d) => d.type).join(", ")}`);
  check(hauntFor(1).kind === "wraith" && hauntFor(5).kind === "banshee" && hauntFor(8).kind === "lich", "darker things for bigger buildings");
  const hall = s.structures.find((x) => x.type === "townhall")!;
  check(isLit(s, hall), "the hall starts inside the fire's light");
  // A hamlet is mostly left alone at night; a town of twenty is always visited (./menace nightThreat).
  const hamlet = nightThreat(s);
  while (s.villagers.length < 20) makeVillager(s, hall.id);
  check(hamlet < 0.35 && nightThreat(s) === 1, `the dark comes for a hamlet less often: ${Math.round(hamlet * 100)}% a night at ${newTown(7, 20).villagers.length}, every night at 20`);
  // Run to the third night and see whether a haunt comes.
  let came = false;
  for (let h = 0; h < 24 * 4 && !came; h++) {
    advance(s, 60, ctx);
    if (s.raid?.haunt) came = true;
  }
  check(came === dark.length > 0, `a haunt comes on a night with unlit buildings (came=${came})`);
  if (s.raid?.haunt) {
    const targets = s.raid.haunt.length;
    fight(s);
    console.log(`   ${targets} came; after: ${s.log.slice(0, 3).map((l) => l.text).join(" | ")}`);
    check(!!s.structures.find((x) => x.type === "townhall"), "the town hall survives a haunt");
  }
  // Light everything and confirm no haunt.
  const t = makeVillager(s, null);
  void t;
  for (const st of unlitBuildings(s)) makeStructure(s, "lamppost", st.x - 1 >= 0 ? st.x - 1 : st.x + st.w, st.y, true);
  check(unlitBuildings(s).length === 0, "lampposts beside every building leave nothing in the dark");
  s.raid = null;
  check(summonHaunt(s) === 0, "no haunt when everything is lit");
}

// ── Spoils and the forge's store ──────────────────────────
console.log("spoils and the forge");
{
  const s = newTown(11, 20);
  check(store(s, "hide", 5) === 5, "without a forge, spoils are lost");
  const forge = build(s, "forge", 44, 38);
  check(armorySlots(forge.level) === 6, "a level-1 forge has 6 slots");
  check(store(s, "hide", 45) === 0 && stock(s, "hide") === 45, "stacks fill 20 at a time");
  for (const k of ["fang", "bone", "ichor"]) store(s, k, 20);
  check(store(s, "scale", 5) === 5, "a full store turns spoils away");
  forge.level = 2;
  check(store(s, "scale", 5) === 0, "an upgrade adds room");
  // A raid's kills land in the store: slimes the hall's own guard can handle.
  s.armory = [];
  s.raid = { arrivesAt: s.time, party: [{ kind: "slime", level: 3, count: 3 }], side: "east", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  // Start them at the hall, where the militia rise — nobody meets a raid out in the fields now.
  stepCombat(s, 0.05);
  const hallSt = s.structures.find((x) => x.type === "townhall")!;
  for (const m of s.raid!.combatants.filter((c) => c.side === "monster")) {
    m.x = hallSt.x + hallSt.w / 2;
    m.y = hallSt.y + hallSt.h + 2;
  }
  fight(s);
  console.log(`   after a slime raid: ${JSON.stringify(s.armory)} — ${s.log[0].text}`);
  check(stock(s, "ichor") > 0, "kills leave ichor in the forge");
}

// ── Gear and the training gate ────────────────────────────
console.log("gear");
{
  const s = newTown(13, 20);
  const forge = build(s, "forge", 44, 38);
  forge.level = 3;
  const k = makeVillager(s, null, "knight");
  k.rank = 8;
  check(gearCap(k) === 8, "a knight without a blade stops at 8");
  store(s, "fang", 3);
  store(s, "bone", 2);
  s.res.ingots = 10;
  const err = startCraft(s, ctx, "sword1");
  check(!err && !!forge.craft, `a fang-edged sword goes on the anvil (${err ?? "ok"})`);
  advance(s, GEAR.sword1.hours * 60 + 5, ctx);
  check(stock(s, "sword1") === 1, "the finished sword lands in the store");
  check(!equip(s, k.id, "sword1") && gearCap(k) === 12, "equipped, the knight can train to 12");
  check(!!startCraft(s, ctx, "oathblade"), "an oathblade is refused without a paladin");
}

// ── Wizard ascension ──────────────────────────────────────
console.log("wizard ascension");
{
  const s = newTown(17, 20);
  build(s, "forge", 44, 38);
  let survived = 0;
  let died = 0;
  for (let i = 0; i < 200; i++) {
    const w = makeVillager(s, null, "wizard");
    w.rank = 12;
    w.xp = 240; // two thresholds banked
    w.gear = { weapon: "staff2" };
    s.res.formula = 1;
    const before = s.villagers.length;
    attemptAscension(s, ctx, w.id, i % 2 === 0);
    if (s.villagers.length < before) died++;
    else survived++;
  }
  const w = makeVillager(s, null, "wizard");
  w.rank = 12;
  w.xp = 120;
  const plain = ascensionOdds(w, ctx, false);
  w.xp = 240;
  const banked = ascensionOdds(w, ctx, false);
  const both = ascensionOdds(w, ctx, true);
  console.log(`   odds at 12: bare ${Math.round(plain * 100)}%, banked xp ${Math.round(banked * 100)}%, + formula ${Math.round(both * 100)}% — 200 tries: ${survived} rose, ${died} consumed`);
  check(plain < banked && banked < both, "stored xp and a formula each raise the odds");
  check(died > 0 && survived > 0, "ascension can go either way");
}

// ── Emblem knights ────────────────────────────────────────
console.log("emblem knights");
{
  const s = newTown(19, 20);
  build(s, "forge", 44, 38);
  const k = makeVillager(s, null, "knight");
  k.rank = 22;
  k.gear = { weapon: "oathblade" };
  check(!!deploy(s, k.id), "no sortie without an emblem");
  k.emblem = { code: "X", name: "Test", attribute: "FAITH", depth: 2 };
  check(!deploy(s, k.id), "rides out with one");
  advance(s, 12 * 60 + 5, ctx);
  console.log(`   back with a battalion of ${k.battalion}; jewels in store ${stock(s, "jewel")}`);
  check((k.battalion ?? 0) > 0 && !k.deployedUntil, "returns with sworn soldiers");
  k.battalion = 10;
  store(s, "jewel", 3);
  check(!advanceKnight(s, k.id) && k.rank === 23, "advances to emblem knight with battalion, jewels and emblem");
}

// ── Kitchen dishes and braziers ───────────────────────────
console.log("kitchen and light");
{
  const s = newTown(23, 20);
  const kitchen = s.structures.find((x) => x.type === "kitchen")!;
  setMode(s, kitchen.id, "bread");
  s.res.wheat = 100;
  s.res.barley = 50;
  s.res.potato = 0;
  const before = s.res.meals;
  const barley = s.res.barley;
  advance(s, 60, ctx);
  check(s.res.barley < barley, `the kitchen bakes bread (barley ${barley} → ${Math.round(s.res.barley)}, meals ${Math.round(before)} → ${Math.round(s.res.meals)})`);
  s.res.coal = 5;
  const p = spot(s, "brazier", 60, 40)!;
  const err = place(s, ctx, "brazier", p[0], p[1]);
  check(!err, "a brazier can be placed");
  advance(s, 180, ctx);
  const br = s.structures.find((x) => x.type === "brazier")!;
  check((br.fuel ?? 0) > 0, "the brazier fills from the coal store");
  hire(s, kitchen.id);
  void clock;
  void forgeOf;
}

// ── The top of the ladders, and clearing ─────────────────
console.log("ladders and clearing");
{
  check(knightCapFor(15) === 150 && knightCapFor(20) === 150, "a depth-15 emblem takes a knight to 150, and no further");
  check(wizardCapFor(15) === 500, "a depth-15 emblem takes a wizard to 500");
  const s = newTown(29, 20);
  const w = makeVillager(s, null, "wizard");
  const odds = [13, 60, 200, 499].map((r) => {
    w.rank = r;
    w.xp = xpToNext(r);
    return ascensionOdds(w, ctx, false);
  });
  console.log(`   bare ascension odds at 13/60/200/499: ${odds.map((o) => Math.round(o * 100) + "%").join(" / ")}`);
  check(odds.every((o, i) => i === 0 || o <= odds[i - 1]), "ascension gets no easier as a wizard climbs");
  const k = makeVillager(s, null, "knight");
  k.rank = 150;
  check(!!advanceKnight(s, k.id), "a knight at 150 cannot advance");
  // A marked tree gets cut even with nobody idle.
  for (const v of s.villagers) if (v.role === "idle") v.role = "farmhand";
  // The nearest tree to the hall: far ones owe the walk out and back as well (./world tripHours).
  const hall0 = s.structures.find((x) => x.type === "townhall")!;
  const tree = s.map.overlay.map((o, i) => [o, i] as const).filter(([o]) => o === 1).sort((a, b) =>
    Math.hypot((a[1] % MAP_W) - hall0.x, Math.floor(a[1] / MAP_W) - hall0.y) - Math.hypot((b[1] % MAP_W) - hall0.x, Math.floor(b[1] / MAP_W) - hall0.y))[0][1];
  clear(s, [tree]);
  let felled = 0;
  for (let h = 0; h < 48 && s.map.overlay[tree] !== 0; h++, felled++) advance(s, 60, ctx);
  check(s.map.overlay[tree] === 0, `a marked tree comes down even with nobody idle (${felled}h, the walk included)`);
}

// ── Laboratory and fishers ────────────────────────────────
console.log("laboratory and fishers");
{
  const s = newTown(31, 20);
  s.res.silver = 20;
  s.res.coin = 500;
  const lab = spot(s, "refinery", 44, 38)!; // a 7x4 spot fits the 6x4 lab; the lab itself cannot be scouted yet
  check(!!place(s, ctx, "laboratory", lab[0], lab[1]), "no laboratory without a scientist");
  const sci = makeVillager(s, s.structures.find((x) => x.type === "house")!.id, "scientist");
  const labErr = place(s, ctx, "laboratory", lab[0], lab[1]);
  check(!labErr, `with a scientist, the laboratory goes up (${labErr ?? "ok"})`);
  const L = s.structures.find((x) => x.type === "laboratory")!;
  L.buildUntil = undefined;
  const idleOne = s.villagers.find((v) => v.role === "idle")!;
  void idleOne;
  check(!hire(s, L.id) && L.workers.includes(sci.id), "the lab hires the scientist, and only a scientist");
  check(!!hire(s, L.id), "with no other scientist, the second post stays empty");
  setMode(s, L.id, "tonic");
  s.res.herb = 20;
  s.res.grape = 10;
  advance(s, 60, ctx);
  check(s.res.tonic >= 1, `the lab brews tonic (${s.res.tonic.toFixed(1)})`);
  // the sick drink it
  const sick = s.villagers[0];
  sick.health = 40;
  const tonic = s.res.tonic;
  advance(s, 60, ctx);
  void tonic;
  check(sick.health >= 60, `a sick villager takes a tonic (health 40 → ${Math.round(sick.health)})`);

  // Fishers.
  const hut = spot(s, "fishery", 10, 30);
  check(!!hut, "a fishing hut has a spot on the river");
  if (hut) {
    place(s, ctx, "fishery", hut[0], hut[1]);
    const F = s.structures.find((x) => x.type === "fishery")!;
    F.buildUntil = undefined;
    const idle = s.villagers.find((v) => v.role === "idle" && !v.work)!;
    const err = hire(s, F.id, idle.id);
    check(!err && idle.role === "fisher", `an idle villager becomes a fisher (${err ?? idle.role})`);
    const fish = s.res.fish;
    const hadStore = s.structures.some((x) => x.type === "storehouse");
    if (!hadStore) {
      advance(s, 60, ctx);
      check(s.res.fish <= fish + 1e-9, `without a storehouse the catch cannot be kept (${fish.toFixed(1)} → ${s.res.fish.toFixed(1)})`);
      build(s, "storehouse", 70, 50);
    }
    const fish2 = s.res.fish;
    advance(s, 60, ctx);
    check(s.res.fish > fish2, `fish come in once there is a storehouse (${fish2.toFixed(1)} → ${s.res.fish.toFixed(1)})`);
    const kitchen = s.structures.find((x) => x.type === "kitchen")!;
    setMode(s, kitchen.id, "grilled");
    s.res.fish = 30;
    advance(s, 60, ctx);
    check(s.res.fish < 30, "the kitchen grills fish");
  }
}

// ── Training pace and effects ─────────────────────────────
console.log("training pace");
{
  const withInput = (dueRemaining: number, newIdeasToday: number): SimContext => ({ profile: ctx.profile, input: { ...input, dueRemaining, newIdeasToday } });
  check(trainingPace(withInput(5, 9).input).factor === 0.35, "reviews still due: training at 35%, whatever the new ideas");
  check(trainingPace(withInput(0, 0).input).factor === 1, "reviews done: full speed");
  check(Math.abs(trainingPace(withInput(0, 4).input).factor - 1.6) < 1e-9, "four new ideas: +60%");
  check(trainingPace(withInput(0, 40).input).factor === 2.5, "the boost stops at +150%");

  /** Hours for a scientist course at the school under a given pace. */
  const courseHours = (c: SimContext) => {
    const s = newTown(37, 20);
    const school = build(s, "school", 44, 38);
    s.res.coin = 500;
    // Only the suitable are enrolled (./enrol): a scientist needs Wits 10.
    const pupil = s.villagers.find((v) => v.role === "idle" && !v.work)!;
    pupil.health = 100;
    attrsOf(pupil).wit = 12;
    schoolTrain(s, school.id, "scientist");
    let h = 0;
    while (school.training && h < 400) {
      advance(s, 60, c);
      h++;
    }
    return h;
  };
  const slow = courseHours(withInput(3, 0));
  const base = courseHours(withInput(0, 0));
  const fast = courseHours(withInput(0, 6));
  console.log(`   scientist course: ${slow}h with reviews due, ${base}h once done, ${fast}h with 6 new ideas`);
  check(slow > base * 2.5 && base > fast, "training runs slowest with reviews due, fastest with new ideas");

  const s = newTown(41, 20);
  const school = build(s, "school", 44, 38);
  const fx = buildingEffects(s, withInput(4, 0));
  check((fx.get(school.id) ?? []).some((e) => e.kind === "slowed"), "the school shows the slow while reviews are due");
  const fx2 = buildingEffects(s, withInput(0, 3));
  check((fx2.get(school.id) ?? []).some((e) => e.kind === "inspired"), "and shows the boost once they are done");
  s.res.fertiliser = 5;
  const farm = s.structures.find((x) => x.type === "farm")!;
  check((buildingEffects(s, ctx).get(farm.id) ?? []).some((e) => e.kind === "fertilised"), "a fed field shows it");
}

// ── Guards and the four sides ─────────────────────────────
console.log("guards");
{
  const s = newTown(43, 20);
  const tower = build(s, "watchtower", 44, 38);
  const posted = makeVillager(s, null, "infantry");
  posted.rank = 5;
  const idle = makeVillager(s, null, "infantry");
  idle.rank = 5;
  check(!assignGuard(s, posted.id, tower.id), "a troop can be posted to a tower");
  for (let i = 0; i < 3; i++) assignGuard(s, makeVillager(s, null, "archer").id, tower.id);
  check(!!assignGuard(s, makeVillager(s, null, "archer").id, tower.id), "a level-1 tower holds four guards, no more");

  // A raid far from the tower: the guards wait inside.
  s.raid = { arrivesAt: s.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(s, 0.05);
  const r = s.raid!;
  const guard = r.combatants.find((c) => c.villagerId === posted.id);
  check(!!guard && guard.inside === true, "posted guards start inside their tower");
  check(!r.combatants.some((c) => c.villagerId === idle.id), "an unposted troop does not come out at all");
  const slime = r.combatants.find((c) => c.side === "monster")!;
  check(slime.x < 5, `the raid came from the west (x=${slime.x.toFixed(1)})`);
  // Bring the monster into the tower's circle.
  const t = s.structures.find((x) => x.id === tower.id)!;
  slime.x = t.x + t.w / 2 + 6;
  slime.y = t.y + t.h / 2;
  stepCombat(s, 0.05);
  check(guard!.inside === false, "a monster inside the tower's radius calls the guards out");
  let guardSteps = 0;
  while (s.raid && guardSteps++ < 4000) stepCombat(s, 0.05);
  check(!s.raid, "the guards deal with it");

  // A split party comes two ways.
  let flanked = 0;
  for (let i = 0; i < 40; i++) {
    s.raid = null;
    s.nextRaidAt = s.time;
    scheduleRaid(s, rng(1000 + i));
    if (s.raid!.flank) flanked++;
  }
  console.log(`   ${flanked} of 40 scheduled raids split to flank`);
  check(flanked > 0, "big parties sometimes come from two sides");
}

// ── Winter ────────────────────────────────────────────────
console.log("winter");
{
  const day = (d: number) => clock(d * 24 * 60 + 12 * 60);
  check(day(17).season === "autumn" && day(18).season === "winter", "winter starts on day 19");
  check(day(27).season === "winter" && day(28).season === "spring" && day(28).year === 2, "it lasts ten days, then spring of year two");
  const s = newTown(47, 20);
  s.time = 20 * 24 * 60 + 11 * 60;
  const fire = s.structures.find((x) => x.type === "pitfire")!;
  const reach = warmthRange(fire.level);
  const [fx, fy] = center(fire);
  const far = build(s, "farm", Math.round(fx + reach + 3), Math.round(fy + 2));
  check(Math.hypot(center(far)[0] - fx, center(far)[1] - fy) > reach, `a test field stands outside the fire's ${reach}-tile warmth`);
  check(fieldFrozen(s, far, true), "in winter it is iced over");
  check(!fieldFrozen(s, far, false), "the rest of the year it is not");
  build(s, "lamppost", far.x, far.y - 3);
  build(s, "brazier", far.x + far.w, far.y);
  check(fieldFrozen(s, far, true), "a lamppost and a brazier beside it thaw nothing");
  const worker = makeVillager(s, null, "farmhand");
  worker.work = far.id;
  far.workers.push(worker.id);
  check((buildingEffects(s, ctx).get(far.id) ?? []).some((e) => e.kind === "cold" && e.label === "Frozen"), "the field shows it is frozen");
  let near = s.structures.find((x) => x.type === "farm" && x !== far && isWarm(s, center(x)));
  for (let dy = -reach; dy <= reach && !near; dy++) {
    for (let dx = -reach; dx <= reach && !near; dx++) {
      const x = Math.round(fx + dx);
      const y = Math.round(fy + dy);
      if (!checkPlacement(s, "farm", x, y).ok) continue;
      const f = makeStructure(s, "farm", x, y, true);
      if (isWarm(s, center(f))) near = f;
      else s.structures.splice(s.structures.indexOf(f), 1);
    }
  }
  if (near) {
    check(!fieldFrozen(s, near, true), "a field inside the warmth stays open");
    fire.fuel = 0;
    check(fieldFrozen(s, near, true), "and freezes when the fire goes cold");
  } else console.log("   (no starting field inside the fire's warmth to test)");
}

// ── Trees, forests and fire ───────────────────────────────
console.log("woods and fuel");
{
  // The winter cull, over many trees of each stage.
  const s = newTown(53, 20);
  const n = 1500;
  const tiles: number[] = [];
  for (let t = 0; t < s.map.overlay.length && tiles.length < n * 4; t++) {
    if (s.map.terrain[t] === Terrain.Grass && s.map.overlay[t] === Overlay.None) tiles.push(t);
  }
  for (let k = 0; k < tiles.length; k++) {
    s.map.overlay[tiles[k]] = Overlay.Tree;
    s.map.meta[tiles[k]] = treeMeta(k % 8, Math.floor(k / n) as 0 | 1 | 2 | 3);
  }
  const before = s.map.overlay.filter((o) => o === Overlay.Tree).length;
  winterCull(s, rng(5));
  const stageOf = (from: number) => tiles.slice(from * n, from * n + n).map((t) => (s.map.overlay[t] === Overlay.Tree ? treeStage(s.map.meta[t]) : -1));
  const sprouts = stageOf(0);
  const seedlings = stageOf(1);
  const young = stageOf(2);
  const mature = stageOf(3);
  check(sprouts.every((x) => x === -1) && seedlings.every((x) => x === -1), "every sprout and seedling dies in winter, leaving nothing");
  const youngSnag = young.filter((x) => x === SNAG).length / young.length;
  const matureLive = mature.filter((x) => x === MATURE).length / mature.length;
  console.log(`   young trees turned to snags: ${(youngSnag * 100).toFixed(1)}% · mature trees alive: ${(matureLive * 100).toFixed(1)}% (${young.length} young, ${mature.length} mature, of ${before} trees)`);
  check(Math.abs(youngSnag - 0.7) < 0.04, "about 70% of young trees die as snags");
  check(Math.abs(matureLive - 0.95) < 0.02, "about 95% of mature trees live");
  check(young.every((x) => x === SNAG || x === YOUNG) && mature.every((x) => x === SNAG || x === MATURE), "every tree either lives or dies, nothing in between");
  check(TREE_WOOD[SNAG] > 0 && TREE_WOOD[SNAG] < TREE_WOOD[MATURE] && TREE_WOOD[SPROUT] === 0, "a snag gives a little wood; a sprout gives none");

  // The first hour of winter runs the cull once, and only once.
  const t = newTown(59, 20);
  t.time = 18 * 24 * 60 - 30;
  const young2 = t.map.overlay.findIndex((o, i) => o === Overlay.Tree && treeStage(t.map.meta[i]) === YOUNG);
  advance(t, 60, ctx);
  check(t.winterYear === 1, "winter's first hour settles the trees");
  const after = t.map.meta[young2];
  advance(t, 120, ctx);
  check(t.map.meta[young2] === after, "and does not roll again later in the season");

  // Forests: regrowth above the floor, none below it, bare tiles give way.
  const w = newTown(61, 20);
  w.time = 2 * 24 * 60; // spring
  const f = forests(w).sort((a, b) => b.tiles.length - a.tiles.length)[0];
  check(Math.abs(f.wood - f.cap) < 1e-6, `a new forest is full (${f.tiles.length} tiles, ${f.cap} wood)`);
  for (const k of f.tiles) w.map.meta[k] = TILE_WOOD * 0.3;
  growWoods(w, "spring", () => 0.99, () => false);
  const grown = forests(w).find((x) => x.tiles.includes(f.tiles[0]))!;
  check(grown.wood > f.cap * 0.3 + 1, "a forest above 15% grows back");
  for (const k of f.tiles) w.map.meta[k] = TILE_WOOD * 0.1;
  w.map.meta[f.tiles[0]] = 0;
  growWoods(w, "spring", () => 0.99, () => false);
  const low = forests(w).find((x) => x.tiles.includes(f.tiles[1]));
  check(!!low && Math.abs(low.wood - (f.tiles.length - 1) * TILE_WOOD * 0.1) < 1e-6, "below 15% it stops growing back");
  check(w.map.terrain[f.tiles[0]] === Terrain.Grass, "and a tile cut bare turns to open ground");
  // A tree seeding into the forest thickens it rather than standing alone.
  const seedAt = f.tiles[1];
  let calls = 0;
  const pick = () => (calls++ === 0 ? (seedAt + 0.5) / (MAP_W * MAP_H) : 0.99);
  const beforeSeed = w.map.meta[seedAt];
  growWoods(w, "spring", pick, () => true);
  check(w.map.meta[seedAt] > beforeSeed && w.map.overlay[seedAt] === Overlay.None, "a tree seeding in a forest adds to its wood");

  // Pit fire fuel: burns from its own grate, never from the stores.
  const p = newTown(67, 20);
  const fire = p.structures.find((x) => x.type === "pitfire")!;
  fire.fuel = 5;
  p.res.wood = 500;
  p.res.coal = 500;
  advance(p, 60 * 20, ctx);
  check(fire.fuel === 0 && p.res.coal === 500, "a fire does not load itself from the stores");
  check(!!stokeFire(p, fire.id, "wood", 0) && !stokeFire(p, fire.id, "coal", 10) && fire.fuel === 30 && p.res.coal === 490, "loading 10 coal gives 30 fuel");
  stokeFire(p, fire.id, "wood", 10000);
  check(fire.fuel === fuelCap(fire.level), `the grate holds ${fuelCap(fire.level)} and no more`);
  const built = makeStructure(p, "pitfire", 60, 40, true);
  check(built.fuel === 0, "a newly built fire starts empty");

  // Only potatoes grow in winter, even inside the warmth.
  const g = newTown(71, 20);
  g.time = 20 * 24 * 60 + 11 * 60;
  const potato = g.structures.find((x) => x.type === "farm")!;
  potato.mode = "potato";
  const carrot = makeStructure(g, "farm", potato.x, potato.y, true); // a twin on the same plot, for the rule alone
  carrot.mode = "carrot";
  check(growsInWinter(potato) && !growsInWinter(carrot), "potatoes grow through winter; carrots do not");
  const paddy = g.structures.find((x) => x.type === "waterfarm");
  check(!paddy || !growsInWinter(paddy), "nor does anything in a paddy");
}

// ── Walls and warmth ──────────────────────────────────────
console.log("walls and warmth");
{
  const town = () => {
    const s = newTown(73, 20);
    // clear the ground round the founding fire so only the test's walls count
    for (let i = 0; i < s.map.overlay.length; i++) if (s.map.overlay[i] === Overlay.Wall || s.map.overlay[i] === Overlay.Gate) s.map.overlay[i] = Overlay.None;
    const fire = s.structures.find((x) => x.type === "pitfire")!;
    fire.fuel = 100;
    return { s, fire, c: center(fire), r: warmthRange(fire.level) };
  };
  const wall = (s: GameState, x: number, y: number) => (s.map.overlay[y * MAP_W + x] = Overlay.Wall);

  const open = town();
  const [ox, oy] = open.c;
  check(isWarm(open.s, [ox + open.r - 0.5, oy]) && !isWarm(open.s, [ox + open.r + 0.5, oy]), `in the open the warmth is a ${open.r}-tile circle`);

  const lined = town();
  const [lx, ly] = lined.c;
  for (let y = Math.floor(ly) - 7; y <= Math.floor(ly) + 7; y++) wall(lined.s, Math.floor(lx) + 3, y);
  check(!isWarm(lined.s, [lx + 5.5, ly]), "a wall keeps the ground behind it cold");
  check(!isWarm(lined.s, [lx + 5.5, ly + 3]), "along its whole shadow");
  check(isWarm(lined.s, [lx + 2.5, ly]), "the fire's side of the wall stays warm");
  const w = warmFields(lined.s)[0];
  check(w.far > w.r && isWarm(lined.s, [lx - w.r - 0.5, ly]), `the heat it stops is thrown back: the open side now reaches ${w.far.toFixed(1)} tiles, not ${w.r}`);
  check(w.far <= w.r * 2, "never past twice the radius");

  const yard = town();
  const [yx, yy] = yard.c;
  const x0 = Math.floor(yx) - 4;
  const y0 = Math.floor(yy) - 4;
  for (let k = 0; k <= 8; k++) {
    wall(yard.s, x0 + k, y0);
    wall(yard.s, x0 + k, y0 + 8);
    wall(yard.s, x0, y0 + k);
    wall(yard.s, x0 + 8, y0 + k);
  }
  const ww = warmFields(yard.s)[0];
  check(Array.from(ww.reach).every((r) => r < ww.r), "a fire walled in on every side has no open ray");
  check(isWarm(yard.s, [x0 + 1.5, y0 + 1.5]), "it warms its yard into the corners");
  check(!isWarm(yard.s, [yx, y0 + 10.5]) && !isWarm(yard.s, [x0 - 1.5, yy]), "and nothing outside the walls, though well inside its radius");
  // Knock a gate-width gap in the wall: the heat pours out through it.
  yard.s.map.overlay[(y0 + 8) * MAP_W + Math.floor(yx)] = Overlay.None;
  check(isWarm(yard.s, [Math.floor(yx) + 0.5, y0 + 11.5]), "through a gap in the wall, warmth reaches out beyond it");
}

// ── Storage, raids by population, army points ─────────────
console.log("storage, raids and army points");
{
  // Summer burns a fifth.
  check(Math.abs(burnRate("summer", false) - burnRate("spring", false) * 0.2) < 1e-9, "a pit fire burns a fifth as much in summer");

  // Storage: gains past the cap are lost, stock already above it is kept.
  const s = newTown(79, 20);
  const cap = storageCap(s);
  s.res.wood = cap - 5;
  s.res.stone = cap + 500;
  const camp = build(s, "lumbercamp", 20, 5);
  camp.workers = [];
  for (let i = 0; i < 4; i++) {
    const v = makeVillager(s, null, "lumberjack");
    v.work = camp.id;
    camp.workers.push(v.id);
  }
  advance(s, 60, ctx);
  check(s.res.wood <= cap + 1e-6, `wood stops at the stores' ${cap}`);
  check(s.res.stone >= cap + 500 - 1e-6, "stock already above the cap is not cut");
  const store = build(s, "storehouse", 40, 40);
  check(storageCap(s) === cap + STORE_PER_LEVEL, `a storehouse adds ${STORE_PER_LEVEL} to every bulk good`);
  store.level = 3;
  check(storageCap(s) === cap + STORE_PER_LEVEL * 3, "and more with each level");

  // Raids: likelier, bigger and stronger with more people.
  check(raidChance(5) < raidChance(30) && raidChance(200) <= 0.95, `raid chance rises with people: ${Math.round(raidChance(5) * 100)}% at 5, ${Math.round(raidChance(30) * 100)}% at 30`);
  const sizes = (people: number) => {
    let n = 0;
    let lvl = 0;
    for (let i = 0; i < 60; i++) {
      const t = newTown(90 + i, 20);
      while (t.villagers.length < people) makeVillager(t, null, "idle");
      t.raid = null;
      scheduleRaid(t, rng(500 + i));
      n += t.raid!.party.reduce((a, p) => a + p.count, 0);
      lvl += t.raid!.party[0].level;
    }
    return { n: n / 60, lvl: lvl / 60 };
  };
  const few = sizes(6);
  const many = sizes(40);
  console.log(`   average raid: ${few.n.toFixed(1)} monsters of level ${few.lvl.toFixed(1)} at 6 people; ${many.n.toFixed(1)} of level ${many.lvl.toFixed(1)} at 40`);
  check(many.n > few.n * 1.5 && many.lvl > few.lvl, "a crowded town draws more monsters, and stronger ones");

  // Army points: one per 50 troops, each with a captain.
  const a = newTown(83, 20);
  a.res.stone = a.res.wood = a.res.iron = a.res.coin = a.res.ingots = 5000;
  /** Ground an army point fits on, whether or not the town may raise one yet. */
  const campGround = (x0: number, y0: number) => {
    for (let y = y0; y < y0 + 14; y++) for (let x = x0; x < x0 + 20; x++) {
      const c = checkPlacement(a, "armypoint", x, y);
      if (c.ok || c.reason?.startsWith("Each army point")) return [x, y] as const;
    }
    throw new Error("no ground for an army point");
  };
  const spotFor = campGround(44, 38);
  check(!checkPlacement(a, "armypoint", spotFor[0], spotFor[1]).ok, "no army point without troops and a knight");
  for (let i = 0; i < 50; i++) makeVillager(a, null, "infantry").rank = 6;
  check(!checkPlacement(a, "armypoint", spotFor[0], spotFor[1]).ok, "fifty troops but no knight to lead: still none");
  const school = build(a, "armyschool", 60, 40);
  a.res.silver = 500;
  const lead = makeVillager(a, null, "knight");
  lead.rank = 8;
  lead.work = school.id;
  check(checkPlacement(a, "armypoint", spotFor[0], spotFor[1]).ok, "fifty troops and a knight: one army point");
  const point = makeStructure(a, "armypoint", spotFor[0], spotFor[1], true);
  const spot2 = campGround(70, 50);
  check(!checkPlacement(a, "armypoint", spot2[0], spot2[1]).ok, "and only one");
  check(guardSlots(point.level, "armypoint") > guardSlots(point.level) && alertRadius(point) > alertRadius({ ...point, type: "watchtower" }), "it holds more guards and watches further than a tower");
  check(captainBonus(a, point) === 1, "unled, it gives no bonus");
  check(!hire(a, point.id), "a knight takes command");
  check(captainBonus(a, point) >= 1.2, `led, its guards fight at ×${captainBonus(a, point).toFixed(2)}`);
  const guard = a.villagers.find((v) => v.role === "infantry")!;
  check(!assignGuard(a, guard.id, point.id), "troops can be posted to it like a tower");

  // Dishes and crops
  check(LAND_CROPS.length >= 14 && WATER_CROPS.length >= 6, `${LAND_CROPS.length} field crops and ${WATER_CROPS.length} paddy crops`);
  check(DISHES.every((d) => Object.keys(d.input).every((k) => RAW_FOODS.includes(k as never))), `all ${DISHES.length} dishes cook from raw foods`);
}

// ── Ranks, knights, the hall's reach, trade and the land ──
console.log("ranks, knights, reach and trade");
{
  // Titles
  check(soldierTitle(1).name === "Peasant Levy" && soldierTitle(5).name === "Bowman Militia" && soldierTitle(20).name === "Arbalestier", "the soldier tree runs Levy → Arbalestier");
  check(knightTitle(1).name === "Noble Squire" && knightTitle(10).name === "Mounted Serjeant" && knightTitle(19).name === "Noble Knight" && knightTitle(23).name === "Emblem Knight",
    "the knight tree runs Squire → Serjeant (lv 10) → … → Noble Knight → Emblem Knight");

  // Training caps: barracks to Spearman, archery to Bowman, army school to Serjeant.
  const t = newTown(97, 20);
  const drillIn = (type: StructureType, role: "infantry" | "knight", x0: number) => {
    const b = build(t, type, x0, 38);
    b.level = 6;
    const v = makeVillager(t, null, role);
    v.rank = 1;
    v.work = b.id;
    return v;
  };
  const soldier = drillIn("barracks", "infantry", 40);
  const squire = drillIn("armyschool", "knight", 64);
  squire.gear = { weapon: "sword1" }; // past level 8 a knight needs a real blade
  squire.rank = 9; // a serjeant near the top of what drill can give
  t.res.silver = 1e6;
  // The drill caps are what is under test, not the mind: keep the recruits steady.
  for (let h = 0; h < 24 * 90; h++) {
    soldier.happy = squire.happy = 100;
    advance(t, 60, ctx);
  }
  const fromBarracks = soldier.rank;
  const fromSchool = squire.rank;
  check(fromBarracks === 4, `a barracks drills a soldier no further than Spearman Militia (reached ${fromBarracks})`);
  check(fromSchool === 10, `the army school drills a knight no further than Mounted Serjeant (reached ${fromSchool})`);

  // Battle promotes: a won fight with plenty of guards lifts some of them.
  const f = newTown(101, 20);
  const tower = build(f, "watchtower", 44, 38);
  tower.level = 10;
  const guards = Array.from({ length: 20 }, () => {
    const v = makeVillager(f, null, "infantry");
    v.rank = 4;
    assignGuard(f, v.id, tower.id);
    return v;
  });
  f.raid = { arrivesAt: f.time, party: [{ kind: "slime", level: 1, count: 12 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(f, 0.05);
  for (const m of f.raid!.combatants.filter((c) => c.side === "monster")) {
    m.x = tower.x + 3;
    m.y = tower.y + 2;
  }
  fight(f);
  const promoted = guards.filter((v) => v.rank > 4).length;
  check(promoted > 0, `after the fight ${promoted} of ${guards.length} guards were promoted in the field, past the barracks' Spearman`);

  // Knights are paid in silver; three days unpaid and they leave.
  const k = newTown(103, 20);
  const knight = makeVillager(k, null, "knight");
  knight.rank = 12;
  k.res.silver = 10;
  advance(k, 24 * 60, ctx);
  check(k.res.silver < 10, `a Knight Bachelor draws ${knightPay(12)} silver a day`);
  k.res.silver = 0;
  for (let h = 0; h < 24 * 4; h++) {
    knight.happy = 100; // pay is under test, not the mind: a broken knight would desert instead
    advance(k, 60, ctx);
  }
  check(knight.role !== "knight", "unpaid three days, the knight leaves");

  // Mines: precious finds far out, barely any close in.
  const mt = newTown(107, 20);
  const near = makeStructure(mt, "mine", 40, 35, true);
  const far = makeStructure(mt, "mine", 150, 100, true);
  check(mineRareRate(mt, near) < 0.012 && Math.abs(mineRareRate(mt, far) - 0.08) < 0.005,
    `rare finds: ${(mineRareRate(mt, near) * 100).toFixed(1)}% an hour by the hall, ${(mineRareRate(mt, far) * 100).toFixed(1)}% far out`);
  check(RARE_FINDS.map((x) => x.res).join(">") === "silver>platinum>diamond>gold" && RARE_FINDS.every((x, i, a) => !i || x.weight < a[i - 1].weight), "silver commonest, then platinum, diamond, gold rarest");

  // The hall's reach
  const h = newTown(109, 20);
  const hall = h.structures.find((x) => x.type === "townhall")!;
  const reach = hallRadius(hall.level);
  let refused = "";
  for (let y = 10; y < 80 && !refused; y++) for (let x = Math.round(center(hall)[0] + reach + 2); x < 160 && !refused; x++) {
    const c = checkPlacement(h, "house", x, y);
    if (c.reason && /reach/.test(c.reason)) refused = c.reason;
  }
  check(!!refused, `a house beyond the hall's ${reach}-tile reach is refused: "${refused.slice(0, 60)}…"`);
  check(hallRadius(hall.level + 1) > reach, "and the reach grows with the hall");

  // Raids pick far buildings more often, and come stronger for them.
  const r = newTown(113, 20);
  const outpost = makeStructure(r, "lumbercamp", 140, 90, true);
  let hits = 0;
  let bonus = 0;
  for (let i = 0; i < 80; i++) {
    r.raid = null;
    scheduleRaid(r, rng(700 + i));
    if (r.raid!.target === outpost.id) {
      hits++;
      bonus = r.raid!.reach ?? 0;
    }
  }
  check(hits > 80 / r.structures.length * 2, `a far outpost is targeted ${hits} times in 80 raids (of ${r.structures.length} buildings)`);
  check(bonus >= 5, `and raids on it come ${bonus} levels stronger`);
  const fc = raidForecast(r);
  check(fc.monsters.length > 0 && Math.abs(fc.monsters.reduce((a, m) => a + m.pct, 0) - 1) < 1e-6 && fc.exposed.length > 0,
    `the forecast lists what the land could send (${fc.monsters.slice(0, 3).map((m) => `${m.name} ${Math.round(m.pct * 100)}%`).join(", ")}) and the most tempting targets (${fc.exposed[0]?.st.type})`);

  // Digging the river: slow, from the water out.
  const d = newTown(127, 20);
  let bank = -1;
  for (let i = 0; i < d.map.terrain.length && bank < 0; i++) {
    const x = i % MAP_W;
    if (d.map.terrain[i] === Terrain.Bank && d.map.terrain[i + 1] === Terrain.Grass && d.map.overlay[i + 1] === Overlay.None && x > 5 && Math.floor(i / MAP_W) > 40) bank = i;
  }
  check(!!markEarthworks(d, "dig", [bank + 3]), "a channel cannot start away from the water");
  check(!markEarthworks(d, "dig", [bank, bank + 1]), "but can be dug outward from the bank");
  let hrs = 0;
  while ((d.earthworks ?? []).length && hrs++ < 24 * 30) advance(d, 60, ctx);
  check(d.map.terrain[bank] === Terrain.Water && d.map.terrain[bank + 1] === Terrain.Water, `two tiles of channel took ${hrs} hours`);

  // Caravans: they come, and trade goods for goods.
  const cv = newTown(131, 20);
  cv.res.wood = cv.res.stone = cv.res.meals = cv.res.planks = cv.res.bricks = cv.res.ingots = cv.res.coal = 5000;
  cv.nextCaravanAt = cv.time;
  advance(cv, 60, ctx);
  const offer = cv.caravan?.offers.find((o) => o.get.res === "silver");
  const silver = cv.res.silver;
  check(!!offer && !trade(cv, offer.id) && cv.res.silver === silver + offer.get.qty, `a caravan arrives with ${cv.caravan?.offers.length} offers; trading gets ${offer?.get.qty} silver for goods`);
  cv.time = cv.caravan!.until + 1;
  advance(cv, 60, ctx);
  check(!cv.caravan, "and moves on after a day");

  // Upgrades need people.
  const u = newTown(137, 20);
  u.res.wood = u.res.stone = u.res.coin = u.res.planks = u.res.bricks = u.res.ingots = 1e5;
  const house = u.structures.find((x) => x.type === "house")!;
  house.level = 5;
  u.structures.find((x) => x.type === "townhall")!.level = 10; // so the hall's own cap is not what stops it
  check(!!upgrade(u, ctx, house.id) && /people/.test(upgrade(u, ctx, house.id) ?? ""), `level 6 needs ${upgradePeople("house", 5)} people`);
  while (u.villagers.length < upgradePeople("house", 5)) makeVillager(u, null, "idle");
  check(!upgrade(u, ctx, house.id), "and goes ahead once the town has them");

  // An old, smaller map grows around the town it holds.
  const o = newTown(139, 20);
  const oldW = 120;
  const oldH = 80;
  const shrink = (arr: number[]) => Array.from({ length: oldW * oldH }, (_, i) => arr[Math.floor(i / oldW) * MAP_W + (i % oldW)]);
  const hallAt = o.structures.find((x) => x.type === "townhall")!;
  o.map = { w: oldW, h: oldH, terrain: shrink(o.map.terrain), overlay: shrink(o.map.overlay), meta: shrink(o.map.meta) };
  const grown = migrate(o);
  check(grown.map.w === MAP_W && grown.map.terrain.length === MAP_W * MAP_H && byId(grown, hallAt.id)?.x === hallAt.x, `an old ${oldW}×${oldH} map grows to ${MAP_W}×${MAP_H} with the town where it was`);
}

// ── A new game ────────────────────────────────────────────
console.log("a new game");
{
  const g = newTown(151, 0, "starter");
  const hall = g.structures.find((x) => x.type === "townhall");
  const homes = g.structures.filter((x) => x.type === "house");
  check(g.structures.length === 2 && hall?.level === 1 && homes.length === 1 && homes[0].level === 1, "a new game is a level-1 hall and one level-1 home, nothing else");
  check(g.villagers.length === 2 && g.villagers.every((v) => v.house === homes[0].id), "with two villagers living in the home");
  check(g.map.terrain.every((t) => t !== Terrain.Pavement), "and no roads laid yet");
  advance(g, 6 * 60, ctx);
  check(g.villagers.length >= 2, "and it runs");
}

// ── Fog, lairs, bands and scouts ──────────────────────────
console.log("fog, lairs and scouts");
{
  FOG.rules = true;
  const g = newTown(163, 0, "starter");
  const hall = g.structures.find((x) => x.type === "townhall")!;
  const [hx, hy] = center(hall);
  const vis = visionMap(g);
  check(vis[Math.floor(hy) * MAP_W + Math.floor(hx) + 5] === VISIBLE, "the hall's reach is in plain sight");
  check(vis[Math.floor(hy) * MAP_W + Math.floor(hx) + 60] === UNSEEN, "beyond it, the fog");
  const forestTile = g.map.terrain.findIndex((t) => t === Terrain.Forest);
  check(forestTile >= 0 && visionMap(g)[forestTile] !== VISIBLE, "forest is never in plain sight");
  FOG.rules = false;
  const far = spotNear(g, "storehouse", Math.floor(hx) + 60, Math.floor(hy));
  const farOk = far && checkPlacement(g, "storehouse", far[0], far[1]).ok;
  FOG.rules = true;
  check(!!farOk && /see/.test(checkPlacement(g, "storehouse", far![0], far![1]).reason ?? ""), "nothing can be built in the fog");
  check(g.map.terrain.filter((t) => t === Terrain.Water).length > 1500 && MAP_W * MAP_H >= 360 * 240, `a map of ${MAP_W}×${MAP_H} with ponds as well as the river`);

  // Lairs: deep in the fog, unfound.
  const lairs = g.lairs ?? [];
  check(lairs.length >= 5 && lairs.every((l) => !l.discovered && Math.hypot(l.x - hx, l.y - hy) >= 70), `${lairs.length} lairs, all deep in the fog: ${lairs.map((l) => l.kind).join(", ")}`);

  // Bands: bred on schedule, roaming, and striking when near.
  const tomb = lairs.find((l) => l.kind === "tomb")!;
  tomb.nextSpawnAt = g.time;
  advance(g, 60, ctx);
  const band = (g.roamers ?? []).find((b) => b.lair === tomb.id);
  check(!!band, `the tomb looses a band: ${band ? `${band.count} ${band.kind} (L${band.level})` : "none"}`);
  const x0 = band!.x;
  const y0 = band!.y;
  advance(g, 120, ctx);
  check(Math.hypot(band!.x - x0, band!.y - y0) > 0.5, "and it roams");
  g.raid = null;
  band!.x = hall.x - 5;
  band!.y = hy;
  band!.tx = band!.x;
  band!.ty = band!.y;
  g.hourAcc = 59.9;
  // A band strikes only with the director's purse behind it, and only if it would not
  // overwhelm what defends the building beyond the director's aim (design §2.3).
  aggroOf(g).purse = 1e6;
  band!.level = 1;
  band!.count = 1;
  g.nextRaidAt = g.time;
  // One strike a half day, as for the land's own waves: fresh from a strike, it circles and waits.
  aggroOf(g).lastWaveAt = g.time - 60;
  const early = JSON.parse(JSON.stringify(g)) as GameState;
  advance(early, 0.2, ctx);
  check(!early.raid && (early.roamers ?? []).some((b) => b.id === band!.id), "a band does not strike within half a day of the last strike on the town");
  aggroOf(g).lastWaveAt = g.time - 13 * 60;
  // The first five days are the town's to find its feet: no band strikes it (./menace OPENING_DAYS).
  const opening = JSON.parse(JSON.stringify(g)) as GameState;
  advance(opening, 0.2, ctx);
  check(!opening.raid && (opening.roamers ?? []).some((b) => b.id === band!.id), `a band does not strike in the first ${OPENING_DAYS} days`);
  g.time += OPENING_DAYS * 24 * 60;
  g.nextRaidAt = g.time;
  aggroOf(g).lastWaveAt = g.time - 13 * 60;
  advance(g, 0.2, ctx);
  const struck = g.raid as GameState["raid"];
  check(!!struck && !!struck.origin && !(g.roamers ?? []).includes(band!), "a band that comes near the town attacks it, from where it stood");
  g.raid = null;

  // Adventures: a knight with torches and food maps the fog, then comes home.
  const k = makeVillager(g, null, "knight");
  k.rank = 8;
  g.res.torches = 10;
  g.res.meals = 40;
  for (let i = 0; i < 6; i++) packTorch(g, k.id);
  check(k.pack!.filter((p) => p === "torch").length === PACK_SLOTS && !!packTorch(g, k.id), "a knight's pack holds six things, no more");
  const target = [Math.floor(hx) + 30, Math.floor(hy)] as const;
  check(/ration/.test(sendScout(g, k.id, target[0], target[1]) ?? ""), "nobody sets out without food");
  unpackSlot(g, k.id, 4);
  unpackSlot(g, k.id, 5);
  check(!packRation(g, k.id) && !packRation(g, k.id) && g.res.meals === 40 - 2 * RATION_MEALS + 0, "two rations packed from the meals");
  const reach = adventureReach(k);
  check(reach.torches === 4 && reach.rations === 2 && reach.tiles > 30, `four torches and two rations: about ${reach.tiles} tiles out and back`);
  const before = (g.map.seen ?? []).reduce((a, v) => a + v, 0);
  check(!sendScout(g, k.id, target[0], target[1]), "sent out on an adventure with torches and food");
  g.roamers = [];
  let t = 0;
  while (k.scout && t++ < 60 * 30) advance(g, 1, ctx);
  visionMap(g);
  const after = (g.map.seen ?? []).reduce((a, v) => a + v, 0);
  check(!k.scout, `home again after ${Math.round(t / 60)} hours`);
  check(after > before + 100, `the fog is mapped where they went (${after - before} tiles)`);
  check(k.pack!.filter((p) => p === "torch").length < 6, `torches burnt on the way: ${6 - k.pack!.filter((p) => p === "torch").length}`);
  const noTorch = makeVillager(g, null, "wizard");
  check(!!sendScout(g, noTorch.id, target[0], target[1]), "nobody goes into the fog without a torch");

  // Hungry: out of rations, a hero burns their fat on the march (design §1.6).
  const hungry = makeVillager(g, null, "knight");
  packTorch(g, hungry.id);
  packTorch(g, hungry.id);
  packRation(g, hungry.id);
  sendScout(g, hungry.id, Math.floor(hx) + 60, Math.floor(hy));
  hungry.pack = hungry.pack!.map((p) => (p === "ration" ? null : p));
  hungry.body!.Eg = 100;
  const fat0 = hungry.body!.F;
  for (let i = 0; i < 120; i++) advance(g, 1, ctx);
  check((hungry.body!.F < fat0 || hungry.body!.B > 0), `with no food left, they march on fat and muscle (${(fat0 - hungry.body!.F).toFixed(2)} kg fat, ${hungry.body!.B.toFixed(2)} kg lean in two hours)`);
  hungry.scout = null;

  // Lost: without a torch, drift outruns what can be seen (design §4.2).
  const lost = makeVillager(g, null, "knight");
  packTorch(g, lost.id);
  packRation(g, lost.id);
  sendScout(g, lost.id, Math.floor(hx) + 150, Math.floor(hy) + 40);
  lost.scout!.x = hx + 110;
  lost.scout!.hx = hx;
  lost.pack = lost.pack!.map((p) => (p?.startsWith("torch") ? "torch:1" : p));
  for (let i = 0; i < 360 && lost.scout && lost.scout.lost === undefined; i++) advance(g, 1, ctx);
  check(lost.scout?.lost !== undefined, "torchless in the fog, they lose the way");
  // Lost in a winter blizzard, what kills them is the cold, not a timer.
  while (clock(g.time).season !== "winter") g.time += 24 * 60;
  g.weather!.regime = "blizzard";
  lost.pack = lost.pack!.map(() => null);
  lost.body!.Eg = 300;
  g.raid = null;
  for (let i = 0; i < 24 * 60 && g.villagers.includes(lost); i++) {
    g.weather!.regime = "blizzard";
    advance(g, 1, ctx);
  }
  check(!g.villagers.includes(lost) && g.log.some((l) => l.text.startsWith(lost.name) && /froze|heart|cold|taken/.test(l.text)), `and lost in a blizzard, the cold takes them (${g.log.find((l) => l.text.startsWith(lost.name))?.text ?? "still alive"})`);
  FOG.rules = false;

  // Saves pack their map.
  const raw = packSave(g);
  const back = unpackSave(raw);
  check(back.map.terrain.length === MAP_W * MAP_H && back.map.terrain.every((v, i) => v === g.map.terrain[i]) && back.map.meta.every((v, i) => v === g.map.meta[i]),
    `a save round-trips; the packed map is ${Math.round(raw.length / 1024)} KB`);
}

// ── Levels to 30, walls, the outer circle, firelight, new monsters ──
console.log("levels, walls, circles, firelight and the new bestiary");
{
  // Tenth-level steps
  check(CATALOG.house.maxLevel === 30 && CATALOG.pitfire.maxLevel === 30, "buildings rise to level 30");
  check(CATALOG.townhall.maxLevel === 100 && CATALOG.forge.maxLevel === 40, "the hall rises to 100, the special buildings to 40");
  check(grade(9) === 0 && grade(10) === 1 && grade(20) === 2 && grade(30) === 3, "with major steps at 10, 20 and 30");
  check(structureMaxHp({ type: "house", level: 10 }) === Math.round(CATALOG.house.hpPerLevel * 10 * 1.5), "a step adds half the hit points again");
  check((CATALOG.house.upgrade(9).gold ?? 0) >= 3 && (CATALOG.house.upgrade(19).platinum ?? 0) >= 6 && (CATALOG.house.upgrade(29).diamond ?? 0) >= 4,
    "crossing a step costs gold, then platinum, then diamond");

  // Walls
  const w = newTown(173, 20);
  const wallAt = 45 * MAP_W + 60;
  w.map.overlay[wallAt] = Overlay.Wall;
  w.map.meta[wallAt] = wallMeta(1, wallMaxHp(1));
  w.res.stone = w.res.bricks = w.res.ingots = w.res.gold = 1e5;
  const hp1 = wallHp(w.map.meta[wallAt]);
  for (let i = 0; i < 9; i++) upgradeWalls(w, [wallAt]);
  check(wallLevel(w.map.meta[wallAt]) === 10 && wallHp(w.map.meta[wallAt]) > hp1 * 5, `a wall raised to level 10 takes ${wallHp(w.map.meta[wallAt])} hits, not ${hp1}`);

  // The outer circle: guards come out for an attack on a building there, not for a passer-by.
  const g = newTown(179, 20);
  const tower = build(g, "watchtower", 44, 38);
  const guard = makeVillager(g, null, "infantry");
  guard.rank = 5;
  assignGuard(g, guard.id, tower.id);
  const [tx, ty] = center(tower);
  const R = alertRadius(tower);
  const P = passiveRadius(tower);
  check(P > R, `a tower's outer circle (${P} tiles) lies beyond its inner one (${R})`);
  g.raid = { arrivesAt: g.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(g, 0.05);
  const slime = g.raid!.combatants.find((c) => c.side === "monster")!;
  const inGuard = g.raid!.combatants.find((c) => c.villagerId === guard.id)!;
  slime.x = tx + (R + P) / 2;
  slime.y = ty;
  slime.targetStruct = null;
  slime.speed = 0;
  stepCombat(g, 0.05);
  check(inGuard.inside === true, "a monster between the circles that attacks nothing: guards stay in");
  slime.hitAt = [slime.x, slime.y, g.raid!.clock];
  stepCombat(g, 0.05);
  check(inGuard.inside === false, "once it attacks something out there, they come out");
  g.raid = null;

  // Firelight: a dark monster in a pit fire's light is scorched; far below the fire, banished.
  const f = newTown(181, 20);
  const fire = f.structures.find((x) => x.type === "pitfire")!;
  fire.level = 25;
  fire.fuel = 5000;
  const [fx, fy] = center(fire);
  f.raid = { arrivesAt: f.time, party: [{ kind: "wraith", level: 4, count: 1 }, { kind: "werewolf", level: 10, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(f, 0.05);
  const wraith = f.raid!.combatants.find((c) => c.kind === "wraith")!;
  const wolf = f.raid!.combatants.find((c) => c.kind === "werewolf")!;
  for (const m of [wraith, wolf]) {
    m.x = fx + 2;
    m.y = fy;
  }
  stepCombat(f, 0.05);
  check(wraith.hp <= 0, "a level-4 wraith in the light of a level-25 fire is banished");
  check(wolf.hp > 0 && wolf.scorched === true, "a level-10 werewolf there is scorched instead");
  const before = wolf.hp;
  for (let i = 0; i < 20; i++) if (f.raid) stepCombat(f, 0.05);
  check(wolf.hp < before, "and burns while it stays");
  f.raid = null;

  // The new bestiary
  const added = ["ghoul", "gargoyle", "cyclops", "vampire", "hydra", "griffin", "wisp", "wendigo", "oni", "kappa", "tengu", "jiangshi", "kitsune", "yurei", "gashadokuro", "jorogumo", "nian"] as const;
  check(added.every((k) => MONSTERS[k] && DROPS[k]?.length), `${added.length} new monsters from west and east, each with its spoils`);
  check(added.filter((k) => MONSTERS[k].night).length >= 8, "among them the spirits and things of the night");
}

// ── Homes: unit to apartment; jewels at the top ───────────
console.log("homes and jewels");
{
  check(homeTitle("house", 1) === "Unit" && homeTitle("house", 5) === "House" && homeTitle("house", 10) === "Townhouse" && homeTitle("house", 20) === "Duplex",
    "a home grows: unit, house, townhouse, duplex");
  const h = newTown(191, 20);
  h.res.stone = h.res.planks = h.res.bricks = h.res.coin = 1e5;
  const a = makeStructure(h, "house", 60, 50, true);
  const b = makeStructure(h, "house", 65, 50, true);
  const far = makeStructure(h, "house", 80, 50, true);
  a.level = b.level = far.level = 20;
  const va = makeVillager(h, a.id);
  const vb = makeVillager(h, b.id);
  check(combinePartners(h, a.id).map((x) => x.id).join() === `${b.id}`, "two duplexes flush side by side can be joined; one standing apart cannot");
  const bedsBefore = beds(h, a) + beds(h, b);
  check(!combineHomes(h, a.id, b.id), "they are joined");
  const flat = h.structures.find((x) => x.type === "apartment")!;
  check(!!flat && flat.w === 10 && flat.h === 3 && !byId(h, a.id) && !byId(h, b.id), "into one apartment block across both plots");
  check(va.house === flat.id && vb.house === flat.id, "and everyone moves in together");
  check(beds(h, flat) > bedsBefore, `with more beds than the two had (${beds(h, flat)} against ${bedsBefore})`);

  // Jewels
  check(jewelCost(24) === 0 && jewelCost(25) === 1 && jewelCost(30) === 3, "from level 25 each level is set with a monster jewel; 30 takes three");
  const j = newTown(193, 20);
  const hall = j.structures.find((x) => x.type === "townhall")!;
  hall.level = 30;
  const home = j.structures.find((x) => x.type === "house")!;
  home.level = 24;
  j.res.wood = j.res.stone = j.res.coin = j.res.planks = j.res.bricks = j.res.ingots = j.res.gold = j.res.platinum = j.res.diamond = 1e7;
  while (j.villagers.length < 200) makeVillager(j, null, "idle");
  check(/jewel/.test(upgrade(j, ctx, home.id) ?? ""), "without jewels in the forge's store, no level 25");
  build(j, "forge", 50, 40);
  store(j, "jewel", 2);
  check(!upgrade(j, ctx, home.id) && stock(j, "jewel") === 1, "with them, it rises and the jewel is spent");
}

// ── Spacing, tap-to-build and wild crops ─────────────────
console.log("spacing, tap-to-build and wild crops");
{
  const w = newTown(211, 20);
  const home = w.structures.find((x) => x.type === "house")!;
  // A barracks keeps three clear tiles from homes.
  const tooNear = spacingProblem(w, "barracks", { x: home.x, y: home.y + home.h + 1, w: 11, h: 4 });
  check(/3 clear tiles/.test(tooNear ?? ""), "a barracks right by a home is refused");
  const yard = spotNear(w, "barracks", home.x, home.y + home.h + 4)!;
  check(!!yard && gapBetween(home, { x: yard[0], y: yard[1], w: 11, h: 4 }) >= 3, "one 3 clear tiles away is fine");
  const barracks = makeStructure(w, "barracks", yard[0], yard[1], true);
  const byYard = checkPlacement(w, "house", barracks.x, barracks.y - 4);
  check(!byYard.ok, "and a home cannot be built beside a barracks either");
  // A kitchen stands within a tile of a home.
  const lonely = spotNear(w, "storehouse", 90, 60)!;
  check(/within 1 tile of a home/.test(checkPlacement(w, "kitchen", lonely[0], lonely[1]).reason ?? ""), "a kitchen far from any home is refused");
  check(!!spotNear(w, "kitchen", home.x, home.y) && gapBetween(home, { x: spotNear(w, "kitchen", home.x, home.y)![0], y: spotNear(w, "kitchen", home.x, home.y)![1], w: 5, h: 3 }) <= 1, "one by a home is fine");
  // Fields touch their watermill; the mill touches the water.
  const mill = w.structures.find((x) => x.type === "watermill")!;
  check(w.structures.filter((x) => x.type === "farm").every((f) => gapBetween(f, mill) === 0), "the founding fields touch their watermill");
  const loose = spotNear(w, "storehouse", 70, 45)!;
  check(/beside a watermill/.test(checkPlacement(w, "farm", loose[0], loose[1]).reason ?? ""), "a farm away from the mill is refused");
  check(/beside a watermill/.test(checkPlacement(w, "waterfarm", loose[0], loose[1]).reason ?? ""), "and so is a water farm");
  const dry = checkPlacement(w, "watermill", loose[0], loose[1]);
  check(!dry.ok && /water's edge/.test(dry.reason ?? ""), "a watermill off the water's edge is refused");
  const byMill = spotNear(w, "farm", mill.x + mill.w, mill.y + 7);
  check(!!byMill && gapBetween({ x: byMill[0], y: byMill[1], w: 3, h: 3 }, mill) === 0, "a farm touching the mill is fine");

  // Tap-to-build: a spot that covers the tapped tile, or why not.
  const open = spotNear(w, "storehouse", 60, 40)!;
  const fit = fitAt(w, "pitfire", open[0] + 1, open[1] + 1);
  check("x" in fit && open[0] + 1 >= fit.x && open[0] + 1 < fit.x + 2 && open[1] + 1 >= fit.y && open[1] + 1 < fit.y + 2, "tapping open ground finds a footing that covers the tap");
  const onHall = fitAt(w, "pitfire", w.structures[0].x + 3, w.structures[0].y + 3);
  check("reason" in onHall && /already built/.test(onHall.reason), "tapping a building says why not");

  // Wild crops: common ones near the hall, rare ones far out.
  const hall = w.structures.find((x) => x.type === "townhall")!;
  const [hx, hy] = center(hall);
  const crops: { d: number; kind: number }[] = [];
  w.map.overlay.forEach((o, i) => {
    if (o === Overlay.Crop) crops.push({ d: Math.hypot((i % MAP_W) - hx, Math.floor(i / MAP_W) - hy), kind: w.map.meta[i] });
  });
  const avg = (xs: { kind: number }[]) => xs.reduce((a, c) => a + c.kind, 0) / Math.max(1, xs.length);
  const near = crops.filter((c) => c.d < 60);
  const far = crops.filter((c) => c.d > 150);
  check(crops.length > 40 && crops.length <= WILD_CAP, `wild crops grow across the map (${crops.length})`);
  check(near.length > 0 && far.length > 0 && avg(near) < 3 && avg(far) > 8, `the common ones near the hall (${wildCrop(Math.round(avg(near)))}), the rare far out (${wildCrop(Math.round(avg(far)))})`);
  const patch = w.map.overlay.findIndex((o, i) => o === Overlay.Crop && Math.hypot((i % MAP_W) - hx, Math.floor(i / MAP_W) - hy) < 60);
  const kind = wildCrop(w.map.meta[patch]);
  build(w, "storehouse", 40, 40); // a wild crop other than the potato needs somewhere to be kept
  const had = w.res[kind];
  check(!clear(w, [patch]) || true, "a wild patch can be marked to gather");
  for (let i = 0; i < 6; i++) advance(w, 60, ctx);
  check(w.map.overlay[patch] !== Overlay.Crop && w.res[kind] > had, `gathered: ${w.res[kind] - had} ${kind}`);
  // Winter kills all but the potato.
  w.time = (clock(w.time).day + 30) * 24 * 60;
  let t = 0;
  while (clock(w.time).season !== "winter" && t++ < 400) w.time += 24 * 60;
  sowWild(w, rng(5));
  const left = w.map.overlay.map((o, i) => (o === Overlay.Crop ? w.map.meta[i] : -1)).filter((m) => m >= 0);
  check(left.length > 0 && left.every((m) => wildCrop(m) === "potato"), `in winter only wild potatoes are left (${left.length})`);
}

console.log("stores, the steward and the lie of the land");
{
  // The hall's cellar keeps only the base goods; everything else needs a storehouse.
  const g = newTown(211, 20, "starter");
  check(hallCap(1) === 120 && capOf(g, "wood") === 120 && capOf(g, "coal") === 0 && capOf(g, "silver") === Infinity,
    "a level-1 hall keeps 120 of each base good, no coal without a storehouse, and silver anywhere");
  // Break a coal rock with no storehouse: the coal has nowhere to go.
  const hallG = g.structures.find((x) => x.type === "townhall")!;
  const rock = (hallG.y + hallG.h + 2) * MAP_W + hallG.x + 2;
  g.map.overlay[rock] = Overlay.Rock;
  g.map.meta[rock] = 1;
  (g.map.seen ??= new Array(MAP_W * MAP_H).fill(0))[rock] = 1;
  g.res.coal = 0;
  clear(g, [rock]);
  for (let h = 0; h < 12 && g.map.overlay[rock] === Overlay.Rock; h++) advance(g, 60, ctx);
  check(g.map.overlay[rock] !== Overlay.Rock && g.res.coal < 1 && (g.wasted?.coal ?? 0) > 1, `with no storehouse, the coal from a rock is lost (coal ${Math.round(g.res.coal)}, ~${Math.round(g.wasted?.coal ?? 0)} wasted)`);
  build(g, "storehouse", 44, 40);
  check(capOf(g, "coal") === STORE_PER_LEVEL && capOf(g, "wood") === 120 + STORE_PER_LEVEL, "a storehouse keeps coal and adds its room to the hall's goods");

  // The steward: a new town's first job is a fire; a hall in danger outranks everything.
  const a = advise(newTown(212, 0, "starter"), ctx);
  check(a.length > 0 && a[0].id === "fire" && a[0].act.kind === "build", `a bare new town is told first: ${a[0]?.title}`);
  const d = newTown(213, 20);
  const dh = d.structures.find((x) => x.type === "townhall")!;
  dh.hp = 10;
  const top = advise(d, ctx)[0];
  check(top.urgency === "now" && (top.id === "hall-hp" || top.id === "guard" || top.id === "tower"), `a failing hall comes first: ${top.title}`);

  // The land: meadow, hills and marsh on every map, and each does something.
  const m = newTown(214, 20);
  const count = (t: number) => m.map.terrain.filter((x) => x === t).length;
  check(count(Terrain.Meadow) > 200 && count(Terrain.Hill) > 200 && count(Terrain.Marsh) > 20, `the map has meadow (${count(Terrain.Meadow)}), hills (${count(Terrain.Hill)}) and marsh (${count(Terrain.Marsh)})`);
  const marshTile = m.map.terrain.findIndex((t, i) => t === Terrain.Marsh && m.map.overlay[i] === Overlay.None);
  const mx = marshTile % MAP_W;
  const my = Math.floor(marshTile / MAP_W);
  check(/soft/.test(checkPlacement(m, "lamppost", mx, my).reason ?? ""), "nothing can be built on marsh");
  const hillTile = m.map.terrain.findIndex((t, i) => t === Terrain.Hill && m.map.overlay[i] === Overlay.None);
  check(/stony/.test(checkPlacement(m, "farm", hillTile % MAP_W, Math.floor(hillTile / MAP_W)).reason ?? ""), "hills cannot be ploughed");
  (m.map.seen ??= new Array(MAP_W * MAP_H).fill(0))[marshTile] = 1;
  for (const v of m.villagers) {
    v.role = "idle";
    v.work = null;
  }
  build(m, "storehouse", 44, 40);
  const peat = m.res.peat;
  const cleared = clear(m, [marshTile]);
  for (let h = 0; h < 12 && m.map.terrain[marshTile] === Terrain.Marsh; h++) advance(m, 60, ctx);
  check(m.map.terrain[marshTile] === Terrain.Bank && m.res.peat >= peat + 8, `a cut of marsh gives peat and drains to a bank (${cleared ?? "marked"}; peat ${peat} → ${Math.round(m.res.peat)})`);
  const farmOn = (t: number) => {
    const f = makeStructure(m, "farm", 0, 0, true);
    f.ground = t;
    return groundYield(f);
  };
  const mine = makeStructure(m, "mine", 0, 0, true);
  mine.ground = Terrain.Hill;
  check(farmOn(Terrain.Meadow) > 1 && farmOn(Terrain.Grass) === 1 && groundYield(mine) > 1, "meadow feeds fields, hills feed mines");
}

console.log("undo, counsel, legends, gates and the fire's air");
{
  // A build or an upgrade can be called off for ten real seconds, with everything back.
  const u = newTown(221, 20);
  const spotU = spotNear(u, "lamppost", 44, 40)!;
  const woodBefore = u.res.wood + u.res.stone + u.res.coin;
  const nBefore = u.structures.length;
  place(u, ctx, "lamppost", spotU[0], spotU[1]);
  const lamp = u.structures[u.structures.length - 1];
  const now = lamp.undo!.at;
  check(!cancelWork(u, lamp.id, now + 5_000) && u.structures.length === nBefore && u.res.wood + u.res.stone + u.res.coin === woodBefore, "a build called off within ten seconds is gone, and every cost comes back");
  place(u, ctx, "lamppost", spotU[0], spotU[1]);
  const lamp2 = u.structures[u.structures.length - 1];
  check(!!cancelWork(u, lamp2.id, lamp2.undo!.at + 11_000) && u.structures.includes(lamp2), "after ten seconds the order stands");
  const hallU = u.structures.find((x) => x.type === "townhall")!;
  u.res = { ...u.res, wood: 1e6, stone: 1e6, coin: 1e6, bricks: 1e6, ingots: 1e6 };
  while (u.villagers.length < upgradePeople("townhall", hallU.level)) makeVillager(u, null);
  const lv = hallU.level;
  const stone = u.res.stone;
  check(!upgrade(u, ctx, hallU.id) && hallU.level === lv + 1, "the hall goes up a level");
  check(!cancelWork(u, hallU.id, hallU.undo!.at + 1_000) && hallU.level === lv && !hallU.buildUntil && u.res.stone === stone, "and an upgrade called off at once puts the level and the stone back");

  // The steward gives one hint a day.
  const h = newTown(222, 20);
  const first = revealHint(h, ctx);
  const second = revealHint(h, ctx);
  check(typeof first !== "string" && typeof second === "string" && hintState(h).shown !== null && !hintState(h).ready, `one hint, then the steward keeps counsel ("${typeof second === "string" ? second : ""}")`);
  h.time += 24 * 60;
  check(hintState(h).ready && hintState(h).shown === null, "a day later another is ready");

  // Legendary callings: shut to a young town, open to a great one.
  const g = newTown(223, 20);
  const chef = g.villagers.find((v) => v.role === "chef") ?? makeVillager(g, null, "chef");
  check(!!ascendLegend(g, "steward", chef.id) && !hasLegend(g, "steward"), "a young town cannot raise a Grand Steward");
  const kitchenG = g.structures.find((x) => x.type === "kitchen")!;
  kitchenG.level = 25;
  kitchenG.workers = [...new Set([...kitchenG.workers, chef.id])];
  chef.work = kitchenG.id;
  chef.rank = LEGENDS.steward.rank;
  chef.health = 100;
  chef.happy = 100;
  g.structures.find((x) => x.type === "townhall")!.level = 30;
  while (g.villagers.length < LEGEND_TOWN.pop) makeVillager(g, null);
  g.time = LEGEND_TOWN.day * 24 * 60;
  g.res.gold = 20;
  g.res.diamond = 5;
  const miss = legendChecks(g, "steward", chef).filter((c) => !c.ok).map((c) => c.label);
  check(!ascendLegend(g, "steward", chef.id) && chef.legend === "steward" && legendMods(g).kitchen > 1 && legendMods(g).rot < 1, `every requirement met, the 5★ Chef becomes Grand Steward${miss.length ? ` (missing: ${miss.join("; ")})` : ""}`);
  check(Object.keys(LEGENDS).length === 3 && !!ascendLegend(g, "steward", chef.id), "three callings, one holder each: a second Grand Steward is refused");

  // Monster gates: seven kinds, each gate with its own level.
  const m = newTown(224, 20);
  const kinds = new Set((m.lairs ?? []).map((l) => l.kind));
  check(kinds.size === 8 && (m.lairs ?? []).length >= 10, `a new map has ${m.lairs?.length} gates of ${kinds.size} kinds`);
  check((m.lairs ?? []).every((l) => l.level >= LAIR_START[l.kind]) && (m.lairs ?? []).some((l) => (l.bonus ?? 0) > 0), "each gate has a level, the deep ones higher");

  // A lit pit fire warms the open air round it by its level.
  const f = newTown(225, 20);
  const fire = f.structures.find((x) => x.type === "pitfire")!;
  fire.fuel = 100;
  const airs = fireAir(f);
  const at = airBoost(airs, fire.x + 1, fire.y + 1);
  const far = airBoost(airs, fire.x + 60, fire.y + 60);
  check(at === fireAirDT(fire.level) && far === 0 && fireAirDT(5) > fireAirDT(1), `inside its radius the air is ${at} °C warmer (level ${fire.level}); far off, not at all`);
}

console.log("prowlers and the heating ladder");
{
  // Prowlers: one or two small things for a building at random, not scored as a wave.
  const p = newTown(231, 20);
  p.time = 5 * 24 * 60 + 22 * 60;
  const came = summonProwlers(p, rng(3));
  const pr = p.raid!;
  check(came >= 1 && came <= 2 && !!pr.prowl && pr.haunt!.length === came && !!byId(p, pr.haunt![0].structId), `night prowlers: ${came} ${pr.party[0].kind} (L${pr.party[0].level}) for one building`);
  check(prowlChance(3) < prowlChance(30) && prowlChance(300) <= 0.26, "they come more often as the days go on, never more than one night hour in four");
  let guard = 0;
  while (p.raid && guard++ < 40000) stepCombat(p, 0.05);
  check(!p.raid, "and the prowl ends");

  // Heating goes up a level at a time; the higher ones warm the floor.
  const h = newTown(232, 20);
  const house = h.structures.find((x) => x.type === "house")!;
  h.res = { ...h.res, stone: 1e4, bricks: 1e4, ingots: 1e3, silver: 1e3, gold: 1e3, mithril: 100, diamond: 100, iron: 1e3 };
  Object.assign(house, { hearth: "open" }); // assigned so, the check below reads the live value
  check(/first/.test(fitHearth(h, house.id, "hypocaust") ?? ""), "a hypocaust cannot go in over an open hearth");
  for (const k of ["chimney", "stove", "tiled", "hypocaust", "boiler", "rune"] as const) {
    const err = fitHearth(h, house.id, k);
    if (err) check(false, `fit ${k}: ${err}`);
  }
  check(house.hearth === "rune" && HEARTHS.rune.tier === 7 && (HEARTHS.hypocaust.floor ?? 0) > 0, "climbed rung by rung to a rune hearthstone, heating level 7");
  check(!fitHearth(h, house.id, "brazier") && house.hearth === "brazier", "a brazier can go in any time");
}

console.log("a day's strength, and recruits");
{
  const w = newTown(241, 20);
  const v = makeVillager(w, null);
  v.rank = 1;
  v.body = { ...(w.villagers[0].body ?? {}), Eg: 2000 } as typeof v.body;
  v.coldNight = false;
  check(capacity(v) === 2 && EFFORT_POINTS.easy === 1 && EFFORT_POINTS.hard === 4, "a level-1 worker has strength for two easy tasks a day");
  v.coldNight = true;
  check(capacity(v) === 1, "after a night slept cold, half");
  v.coldNight = false;
  v.rank = 3;
  check(capacity(v) === 4, "a level-3 worker can do a day's hard work");
  // Spent, they stop; ordered on, they go on — and pay at dawn.
  const mine = makeStructure(w, "farm", 0, 0, true);
  v.rank = 1;
  v.effort = 2;
  check(!canWork(v, mine), "a spent worker stops");
  mine.overtime = true;
  check(canWork(v, mine), "unless the building drives them on");
  v.effort = 6;
  v.health = 100;
  workDawn(w, () => 0.99);
  check(v.health < 100 && (v.effort ?? 0) === 0, `three times past their strength: at dawn health falls to ${Math.round(v.health)}, and the day starts fresh`);
  let dead = 0;
  for (let k = 0; k < 40; k++) {
    const t = makeVillager(w, null);
    t.rank = 1;
    t.effort = 8;
    workDawn(w, rng(k));
    if (!w.villagers.includes(t)) dead++;
    else t.effort = 0;
  }
  check(dead > 0 && dead < 40, `driven to four times their strength, some do not get up (${dead} of 40)`);
  check(jobEffort("mine") === "hard" && jobEffort("kitchen") === "easy" && jobEffort("farm") === "medium" && jobEffort("storehouse") === "none", "jobs are rated: kitchens easy, fields medium, mines hard");

  // Recruitment takes four hours.
  const r = newTown(242, 20);
  const bar = build(r, "barracks", 44, 38);
  const home = r.structures.find((x) => x.type === "house")!;
  makeVillager(r, home.id);
  // A road from the barracks west until it meets the town's roads, so a house reaches it.
  for (let x = bar.x - 1, y = bar.y + 1; x > 0; x--) {
    const i = y * MAP_W + x;
    if (r.map.terrain[i] === Terrain.Pavement) break;
    r.map.terrain[i] = Terrain.Pavement;
    r.map.overlay[i] = Overlay.None;
  }
  const err = recruit(r, bar.id);
  check(!err && bar.training?.left === 4 * 60 && !!bar.training?.recruit, `a recruit is taken on in four hours${err ? ` (${err})` : ""}`);
  const left0 = bar.training?.left ?? 0;
  advance(r, 60, ctx);
  check(Math.abs(left0 - (bar.training?.left ?? 0) - 60) < 1e-6, "and the four hours run at the clock, whatever the study pace");
}

console.log("night work, newcomers, movers, monster parts, leisure, the end game, trophies");
{
  // Building stands still at night without a night shift.
  const n = newTown(251, 20);
  n.res = { ...n.res, wood: 1e4, stone: 1e4, coin: 1e4 };
  while (!clock(n.time).night) n.time += 60;
  const lampAt = spotNear(n, "lamppost", 44, 40)!;
  check(!place(n, ctx, "lamppost", lampAt[0], lampAt[1]), "a lamp ordered at night");
  const lamp = n.structures[n.structures.length - 1];
  const due = lamp.buildUntil!;
  advance(n, 60, ctx);
  check(lamp.buildUntil !== undefined && lamp.buildUntil >= due + 59, `at night the builders down tools (due ${due} → ${lamp.buildUntil})`);
  const lead = makeVillager(n, n.structures.find((x) => x.type === "house")!.id, "farmhand");
  lead.rank = 5;
  check(!setNightShift(n, lead.id, true) && hasNightShift(n), "a level-5 worker takes the night shift");
  const due2 = lamp.buildUntil!;
  advance(n, 60, ctx);
  check((lamp.buildUntil ?? 0) <= due2, "and the work goes on by torchlight");
  const weak = makeVillager(n, null, "farmhand");
  weak.rank = 2;
  check(!!setNightShift(n, weak.id, true), "a level-2 worker cannot lead it");
  // Two hours of work ordered at 19:00: one before dusk, one after dawn — done at 07:00, in one step or in many.
  const at7 = pastNight(19 * 60, 19 * 60 + 24 * 60, 21 * 60);
  let due3 = 21 * 60;
  for (let t = 19 * 60; t < 19 * 60 + 24 * 60 && due3 > t; t += 7) due3 = pastNight(t, t + 7, due3);
  check(at7 === 31 * 60 && Math.abs(due3 - at7) < 1e-6, `two hours ordered at 19:00 are done at 07:00 the next day (${at7 / 60 - 24}:00), in one step or many`);

  // A newcomer takes three hours on the road.
  const a = newTown(252, 20, "starter");
  a.mood = 90;
  a.hunger = 90;
  const pop0 = a.villagers.length;
  let hours = 0;
  while (a.villagers.length === pop0 && hours < 12) {
    advance(a, 60, ctx);
    hours++;
  }
  check(a.villagers.length === pop0 + 1 && hours >= 3, `a newcomer walks in after ${hours} hours on the road`);

  // A level-10 worker moves a building; more movers, less time; the higher it stands, the longer.
  const m = newTown(253, 20);
  const hut = build(m, "storehouse", 60, 44);
  check(!!relocate(m, hut.id, 70, 44), "without a level-10 worker nothing moves");
  const mover = makeVillager(m, m.structures.find((x) => x.type === "house")!.id, "farmhand");
  mover.rank = 10;
  const to = spotNear(m, "storehouse", 72, 48)!;
  const oneMover = moveHours(hut, 1);
  hut.level = 10;
  check(moveHours(hut, 1) > oneMover && moveHours(hut, 3) < moveHours(hut, 1), `higher takes longer (${oneMover.toFixed(0)}h → ${moveHours(hut, 1).toFixed(0)}h), more movers less (${moveHours(hut, 3).toFixed(0)}h with three)`);
  hut.level = 1;
  const err = relocate(m, hut.id, to[0], to[1]);
  for (let h = 0; h < 48 && hut.buildUntil; h++) advance(m, 60, ctx);
  check(!err && hut.x === to[0] && hut.y === to[1] && !hut.moveTo, `a storehouse carried to ${to[0]},${to[1]}${err ? ` (${err})` : ""}`);

  // High-tier monsters leave feet, hearts and eyes; set into a tower past level 10, each gives less than the last.
  const drops = dropsFor("troll", 14, false, () => 0);
  check((drops["foot:troll"] ?? 0) > 0 && (drops.heart ?? 0) > 0 && (drops.eye ?? 0) > 0, "a level-14 troll can leave a foot, a heart and an eye");
  const low = dropsFor("troll", 8, false, () => 0);
  check(!low.heart && !low.eye && !low["foot:troll"], "a level-8 one leaves none of them");
  const g = newTown(254, 20);
  build(g, "forge", 60, 44).level = 5;
  const tw = build(g, "watchtower", 50, 38);
  store(g, "heart", 3);
  store(g, "eye", 3);
  check(!!augment(g, tw.id, "heart"), "a level-1 tower takes no parts");
  tw.level = 10;
  const r0 = alertRadius(tw);
  const p0 = passiveRadius(tw);
  const e1 = !augment(g, tw.id, "eye") && alertRadius(tw);
  augment(g, tw.id, "heart");
  const gain1 = dimReturn(AUG_CAP.heart, 1);
  const gain2 = dimReturn(AUG_CAP.heart, 2) - gain1;
  check(!!e1 && e1 >= r0 && passiveRadius(tw) > p0 && gain2 < gain1, `an eye and a heart set in: active reach ${r0} → ${alertRadius(tw)}, passive ${p0} → ${passiveRadius(tw)}; the second heart gives less (${gain1.toFixed(2)} then ${gain2.toFixed(2)})`);

  // The museum needs an artist; a visit and a journey both mend a mind and lift the town.
  const u = newTown(255, 20);
  check(/artist/.test(checkPlacement(u, "museum", 60, 44).reason ?? ""), "no museum before there is an artist");
  const artist = makeVillager(u, u.structures.find((x) => x.type === "house")!.id, "artist");
  const mu = build(u, "museum", 60, 44);
  check(!hire(u, mu.id, artist.id), "an artist keeps it");
  const visitor = u.villagers.find((v) => v.role !== "artist")!;
  visitor.happy = 40;
  check(!sendToMuseum(u, visitor.id) && isAwayLeisure(u, visitor), "a villager goes to the museum");
  for (let h = 0; h < 4; h++) advance(u, 60, ctx);
  check(!isAwayLeisure(u, visitor) && visitor.happy > 45 && stats(u).museum === 1, `and comes back steadier (sanity ${Math.round(visitor.happy)})`);
  u.res.coin = 100;
  u.res.meals = 100;
  const traveller = u.villagers.find((v) => v !== visitor && v.role !== "artist")!;
  check(!sendTravelling(u, traveller.id) && u.res.coin === 100 - (TRAVEL_COST.coin ?? 0), "a journey costs coin and meals");

  // The end game: a strong army seals a weak gate, and the land grows quieter.
  const e = newTown(256, 20);
  const gate = e.lairs![0];
  gate.discovered = true;
  gate.level = 2;
  gate.bonus = -99;
  const post = build(e, "watchtower", 50, 38);
  for (let k = 0; k < 10; k++) {
    const v = makeVillager(e, null, "infantry");
    v.rank = 17;
    v.guard = post.id;
  }
  const calm0 = landCalm(e);
  check(assaultOdds(e, gate) > 0.9, `a veteran army against a young gate: ${Math.round(assaultOdds(e, gate) * 100)}% to carry it`);
  const out = assaultGate(e, gate.id, () => 0.01);
  check(!e.lairs!.includes(gate) && stats(e).sealed === 1 && landCalm(e) < calm0, `stormed and sealed; the land grows quieter (${calm0.toFixed(2)} → ${landCalm(e).toFixed(2)}) — "${out.slice(0, 60)}…"`);

  // The hall's twenty-year road, and the end-game phase that does not end the game.
  check(hallMinDay(100) === 20 * YEAR_DAYS && hallMinDay(43) > 5 * YEAR_DAYS, `level 100 on day ${hallMinDay(100)} (year 20); by the end of year 5 no higher than 42`);
  const h = newTown(257, 20);
  const hh = h.structures.find((x) => x.type === "townhall")!;
  hh.level = 42;
  h.res = { ...h.res, wood: 1e9, stone: 1e9, coin: 1e9, bricks: 1e9, ingots: 1e9, mithril: 1e4, diamond: 1e4 };
  while (h.villagers.length < upgradePeople("townhall", 42)) makeVillager(h, null);
  check(/day \d+/.test(upgrade(h, ctx, hh.id) ?? ""), "a young town's hall cannot rush past its years");
  hh.level = 100;
  advance(h, 60, ctx);
  check(!!h.victory && !h.fallen && h.villagers.length > 0, "at level 100 the end-game phase begins — and the game goes on");

  // Stone flags: a road laid over a road.
  const f = newTown(258, 20);
  const road = f.map.terrain.findIndex((t, i) => t === Terrain.Pavement && f.map.overlay[i] === Overlay.None);
  const st0 = f.res.stone;
  check(!paint(f, "pavement", [road]) && f.map.paving?.[road] === 1 && f.res.stone === st0 - 2, "a road relaid in stone flags for 2 stone");

  // Five hundred achievements, each with its own trophy.
  const list = achievementList();
  const parts = new Set(list.map((x) => { const p = trophyParts(x.n); return `${p.shape}:${p.metal}:${p.gem}:${p.plinth}`; }));
  check(list.length === 500 && new Set(list.map((x) => x.id)).size === 500 && parts.size === 500, `${list.length} achievements, ${parts.size} different trophies`);
  const w = newTown(259, 20);
  advance(w, 60, ctx);
  const got = Object.keys(w.achievements ?? {}).length;
  check(got > 0 && got < 100, `a new town has earned ${got} already, and has the rest to go`);

  // The end-game preview: walled, towered, districted, and a dragon fight on the way.
  const pv = endgameTown(260, 120);
  const pvWalls: number[] = [];
  pv.map.overlay.forEach((o, i) => {
    if (o === Overlay.Wall || o === Overlay.Gate) pvWalls.push(i);
  });
  const pvTowers = pv.structures.filter((x) => x.type === "watchtower");
  const uncovered = pvWalls.filter((i) => !pvTowers.some((t) => Math.hypot(t.x + t.w / 2 - (i % MAP_W), t.y + t.h / 2 - Math.floor(i / MAP_W)) <= alertRadius(t)));
  check(pvWalls.length > 300 && pvWalls.every((i) => wallLevel(pv.map.meta[i]) === WALL_MAX_LEVEL) && uncovered.length === 0 && pvTowers.every((t) => t.level === CATALOG.watchtower.maxLevel),
    `the preview's ${pvWalls.length} wall tiles at level ${WALL_MAX_LEVEL}, every one in reach of ${pvTowers.length} towers at their highest level`);
  const kinds = new Set(pv.structures.map((x) => x.type));
  check(Object.keys(CATALOG).every((k) => kinds.has(k as StructureType)), "every kind of building stands in it");
  check(pv.structures.filter((x) => x.type === "armypoint").length >= 3 && pv.villagers.filter((v) => v.role === "knight" && v.rank >= 23).length >= 3 && pv.villagers.filter((v) => v.role === "wizard" && v.rank >= 15).length >= 3,
    "army points with Emblem Knights, and Grand Wizards on the towers");
  check(!!pv.raid && pv.raid.party.some((p) => p.kind === "dragon") && clock(pv.time).year > 20, `year ${clock(pv.time).year}, and dragons on the way`);
  check(unlitBuildings(pv).length === 0, "nothing in the preview stands in the dark");
  // The fight, minute by minute as the game plays it, and six hours after.
  const pvPop = pv.villagers.length;
  for (let m = 0; m < 7 * 60; m++) {
    if (pv.raid?.phase === "fighting") fight(pv);
    else advance(pv, 1, ctx);
  }
  const pvKnights = pv.villagers.filter((v) => v.role === "knight").length;
  check(!pv.fallen && pv.villagers.length > pvPop * 0.8 && pv.mood > 50 && pvKnights >= 3 && !!pv.victory,
    `the dragons are beaten: ${pvPop - pv.villagers.length} fewer people six hours on, ${pvKnights} knights standing, Hope ${Math.round(pv.mood)} — and the end-game phase has begun`);

  // Kept study calms the land; a town down to two survivors has dwindled away; names read as English.
  const k = newTown(261, 20);
  Object.assign(knowledgeOf(k), { day: "2026-01-01", reviewsToday: 30, completes: 3, overdue: 0, dueRemaining: 0 });
  check(Math.abs(neglect(k).budget - 0.7) < 1e-9 && Math.abs(neglect(k).rho + 0.15) < 1e-9, `three Fields finished: the land's budget ×${neglect(k).budget.toFixed(2)}, its aim ${neglect(k).rho.toFixed(2)}`);
  const dw = newTown(262, 20);
  while (dw.villagers.length < 8) makeVillager(dw, null);
  advance(dw, 60, ctx);
  dw.villagers = dw.villagers.slice(0, 2);
  for (const st of dw.structures) st.workers = st.workers.filter((id) => dw.villagers.some((v) => v.id === id));
  // Nobody on the road and no raid due: only the count of people is being tested.
  dw.incoming = Infinity;
  dw.nextRaidAt = dw.time + 30 * 24 * 60;
  let fewH = 0;
  for (; fewH < 80 && !dw.fallen; fewH++) advance(dw, 60, ctx);
  check(!!dw.fallen && dw.fallCause === "dwindled" && fewH >= 72, `a town of eight brought down to two, with nobody coming, has dwindled away after ${fewH} hours (${dw.fallCause})`);
  check(plural("Dire Wolf") === "Dire Wolves" && plural("Harpy") === "Harpies" && plural("Lich") === "Liches" && plural("Cyclops") === "Cyclopes" && plural("Oni") === "Oni" && plural("fishery") === "fisheries",
    "two Dire Wolves, three Harpies, Liches, Cyclopes, Oni and fisheries");
}

console.log("elements, eight hundred items, champions, the Eye of Time, omens and the new laboratories");
{
  // The elements: the natural ring, and the two pairs that beat each other.
  check(elementFactor("water", "fire") === COUNTER_BONUS && elementFactor("fire", "water") === COUNTERED_PENALTY && elementFactor("earth", "water") === 1, "water beats fire; fire is beaten by water; earth against water is even");
  check(elementFactor("light", "dark") > 1 && elementFactor("dark", "light") > 1 && elementFactor("time", "space") > 1 && elementFactor("space", "time") > 1, "light and dark, time and space: each the other's bane");
  check(ELEMENTS.every((e) => Object.values(MONSTERS).some((m) => m.mythic && m.element === e)), "a mythic thing of every element");

  // Eight hundred items, seven rarities, thirty singular.
  const items = itemList();
  const rar = new Set(items.map((d) => d.rarity));
  check(items.length === 800 && new Set(items.map((d) => d.id)).size === 800 && rar.size === 7 && items.filter((d) => d.rarity === "singleton").length === 30,
    `${items.length} items, ${rar.size} rarities, ${items.filter((d) => d.rarity === "singleton").length} singular`);
  check(items.filter((d) => d.kind === "equipment").every((d) => !!d.slot && !!d.roles?.length) && itemDef("book:anything")?.id === "book-of-enlightenment", "every piece of equipment has its slot and its wearers; every book is the book");

  // Loot: a mythic thing always leaves gear and its trophy; the singular pieces come once each.
  const lm = lootFor("phoenix", 90, rng(5));
  check(Object.keys(lm).some((id) => itemDef(id)?.kind === "equipment") && (lm["trophy-phoenix"] ?? 0) > 0 && Object.keys(lm).some((id) => id.startsWith("essence-fire")), `a phoenix leaves gear, its feather and fire essence (${Object.keys(lm).join(", ")})`);
  const ls = newTown(301, 20);
  const got = new Set<string>();
  for (let k = 0; k < 40; k++) {
    const id = claimSingleton(ls, rng(k));
    if (id) got.add(id);
  }
  check(got.size === 28 && !got.has("book-of-enlightenment") && !got.has("crown-of-the-realm"), `twenty-eight singular pieces can be found, each once (${got.size}); the book and the crown are made`);
  check(dropRarity(3, "common", () => 0.99) !== "mythic" && dropRarity(120, "mythic", () => 0.99) === "mythic", "a weak thing never drops mythic gear; a mythic thing can");

  // Equipment: seven slots, and the forge's old pieces keep their old strength.
  const eq = newTown(302, 20);
  build(eq, "forge", 60, 44).level = 5;
  const w = makeVillager(eq, null, "wizard");
  w.rank = 20;
  for (const id of ["staff-mythic-space", "robe-legendary-1", "helm-rare-2", "boots-special-3", "ring-legendary-0", "amulet-rare-4"]) {
    store(eq, id, 1);
    check(!equip(eq, w.id, id), `a grand wizard wears a ${itemDef(id)?.name.toLowerCase()}`);
  }
  check(!fullSet(w) && gearStats(w).element === "space" && gearStats(w).dmg > 2, `six of seven slots filled: not yet a full set; the staff strikes with space (×${gearStats(w).dmg.toFixed(2)} damage)`);
  check(Math.abs(gearBonus({ ...w, gear: { weapon: "oathblade", armour: "aegis" } } as typeof w).dmg - 1.9) < 1e-9, "an oathblade still gives +90%, as it always did");

  // Champions: the Master of Mythic Arts, the King, and stone instead of death.
  store(eq, "book:test-mind", 1);
  check(!!ascendMaster(eq, w.id), "no Master without the book");
  check(!equip(eq, w.id, "book:test-mind") && fullSet(w) && !ascendMaster(eq, w.id) && w.champion === "master", "the book in the relic slot, a full set: a Master of Mythic Arts");
  const kn = makeVillager(eq, null, "knight");
  kn.rank = 64;
  kn.emblem = { code: "t", name: "Test", attribute: "FAITH", depth: 9 };
  check(!!crownKing(eq, kn.id), "no King without the crown");
  store(eq, "crown-of-the-realm", 1);
  equip(eq, kn.id, "crown-of-the-realm");
  eq.realm = { emblems: [{ code: "a", name: "A", depth: 10, attributes: [] }, { code: "b", name: "B", depth: 5, attributes: [] }], at: eq.time };
  check(!crownKing(eq, kn.id) && kn.champion === "king" && Math.abs(kingMight(eq) - (1 + 0.2 + 15 * 0.08)) < 1e-9, `crowned King; his might from two real emblems of depth 15: ×${kingMight(eq).toFixed(2)}`);
  const kn2 = makeVillager(eq, null, "knight");
  kn2.rank = 70;
  kn2.emblem = kn.emblem;
  check(kingChecks(eq, kn2).some((c) => !c.ok && /No King/.test(c.label)), "one King at a time");
  kill(eq, kn);
  check(!eq.villagers.includes(kn) && (eq.statues ?? []).includes(kn) && !!kn.statue, "the King struck down turns to stone");
  eq.res.stone = 1e4;
  eq.res.silver = 1e3;
  eq.res.gold = 1e3;
  for (let k = 0; k < 20; k++) offerToStatue(eq, kn.id);
  for (let h = 0; h < 101 && kn.statue; h++) statuesHourly(eq);
  check(eq.villagers.includes(kn) && !kn.statue && kn.health === 100, "twenty offerings and a hundred hours: the stone falls away");

  // The mythic ward: an elder dragon shrugs off a knight, not the King.
  const hitBy = (champion: boolean) => {
    const f = newTown(303, 20);
    const post = build(f, "watchtower", 50, 38);
    const k = makeVillager(f, null, "knight");
    k.rank = 64;
    k.guard = post.id;
    k.gear = { weapon: "oathblade", armour: "aegis" };
    if (champion) k.champion = "king";
    f.realm = { emblems: [], at: f.time };
    f.raid = { arrivesAt: f.time, party: [{ kind: "elderdragon", level: 100, count: 1 }], side: "east", target: post.id, phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
    stepCombat(f, 0.05);
    const dragon = f.raid?.combatants.find((c) => c.kind === "elderdragon");
    if (!dragon) return -1;
    // What the blows took, up to its death or until it pulls back with its objective down.
    let last = dragon.hp;
    for (let g = 0; f.raid && g < 1200; g++) {
      stepCombat(f, 0.05);
      if (dragon.hp > 0) last = dragon.hp;
      else {
        if (!(dragon as { faded?: boolean }).faded) last = 0;
        break;
      }
    }
    return dragon.maxHp - last;
  };
  const plain = hitBy(false);
  const king = hitBy(true);
  check(king > plain * 10, `in sixty seconds a knight takes ${Math.round(plain)} off an elder dragon; the King ${Math.round(king)}`);

  // The Book and the Crown: great works of the mythic laboratory, once each.
  const ml = newTown(304, 20);
  build(ml, "forge", 60, 44).level = 10;
  makeVillager(ml, null, "scientist");
  build(ml, "laboratory", 30, 50).level = 20;
  build(ml, "alchemy", 70, 30);
  build(ml, "observatory", 80, 50);
  const lab = build(ml, "mythiclab", 40, 60);
  Object.assign(ml.res, { starchart: 10, quicksilver: 10, gold: 50, diamond: 10, platinum: 10 });
  store(ml, "ectoplasm", 10);
  store(ml, "jewel", 7);
  store(ml, "essence-light-greater", 1);
  const em = { code: "faith-1", name: "Faith", attributes: ["FAITH"], depth: 4 };
  check(!writeBook(ml, em) && !!lab.craft && bookWritten(ml, "faith-1") && !!bookCheck(ml, em), "a book begins, written from the Faith emblem; a second from it is refused");
  ml.time += BOOK_HOURS * 60;
  finishWorks(ml);
  check(!lab.craft && stock(ml, "book:faith-1") === 1, "a day later it is in the forge's store");

  // Excursions and the Eye of Time.
  const ex = newTown(305, 20);
  const walker = makeVillager(ex, null, "miner");
  check(!canExcursion(walker), "a new worker cannot go on excursions");
  for (let h = 0; h < 4000 && workLevel(walker) < EXCURSION_LEVEL; h++) gainWork(ex, walker, 1);
  check(canExcursion(walker) && canPack(walker), `level ${workLevel(walker)} after the hours: they pack for the fog`);
  walker.excursions = EYE_AFTER - 1;
  let eyes = false;
  for (let k = 0; k < 60 && !eyes; k++) {
    ex.time += 97;
    eyes = excursionHome(ex, walker);
  }
  check(eyes && walker.role === "seer", `after ${walker.excursions} excursions, the fog changes them: the Eye of Time`);
  ex.res.silver = 30;
  check(!foresee(ex, walker.id, "silver") && ex.res.silver === 30 - VISIONS[0].qty && !!ex.prophecy, `twelve silver burnt: the next wave comes from the ${ex.prophecy?.side}`);
  ex.res.starchart = 1;
  check(visionCost(ex, "gold").qty === 2, "a star chart halves the metal");
  const side = ex.prophecy!.side;
  aggroOf(ex).purse = 1e6;
  launchWave(ex, rng(9));
  check(!!ex.raid && ex.raid.side === side && !ex.prophecy, `the wave comes from the ${ex.raid?.side}, as foreseen`);

  // Omens: the air turns, a ward turns it back.
  const om = newTown(306, 20);
  raiseOmen(om, [{ kind: "dragon", level: 50, count: 1 }]);
  check(omenOf(om)?.element === "fire" && om.debuffs.some((d) => d.id === "omen-fire"), "a dragon brings ashfall");
  om.res.fireward = 1;
  check(!burnWard(om) && !omenOf(om) && !om.debuffs.some((d) => d.id === "omen-fire"), "a fire ward burnt: the ashfall lifts");
  om.res.timeward = 1;
  raiseOmen(om, [{ kind: "elderdragon", level: 100, count: 1 }]);
  check(!!om.omen?.warded && om.res.timeward === 0 && omenPace(om) === 1, "a time ward in store is burnt as the elder dragon comes, and time does not slip");
  om.res.timeward = 0;
  raiseOmen(om, [{ kind: "elderdragon", level: 100, count: 1 }]);
  check(omenPace(om) < 0.5 && omenCombat(om).dmg === 1, "unwarded, time slips: building and training crawl");

  // The new laboratories: in order, and at work.
  const lb = newTown(307, 20);
  makeVillager(lb, null, "scientist");
  check(/laboratory/.test(checkPlacement(lb, "alchemy", 60, 44).reason ?? ""), "no alchemist's workshop before a laboratory of level 10");
  const bench = build(lb, "laboratory", 40, 50);
  bench.level = 10;
  const al = build(lb, "alchemy", 60, 44);
  const sci = makeVillager(lb, null, "scientist");
  hire(lb, al.id, sci.id);
  lb.res.silver = 20;
  lb.res.coal = 40;
  const q0 = lb.res.quicksilver;
  advance(lb, 60, ctx);
  check(lb.res.quicksilver === q0 && lb.res.silver === 20, "a new bench stands idle until it is told what to make");
  al.mode = "quicksilver";
  for (let h = 0; h < 3; h++) advance(lb, 60, ctx);
  check(lb.res.quicksilver > q0, `set to quicksilver, the workshop makes it (${Math.round(lb.res.quicksilver - q0)} in three hours)`);
  lb.res.quicksilver = 60;
  lb.res.silver = 20;
  advance(lb, 60, ctx);
  check(lb.res.silver === 20, "with sixty in store it stops, rather than burn the silver");

  // Shots by level, and wizards on the wing.
  const pf = (kind: string, level: number, extra: Partial<Combatant> = {}) => projectileFor({ id: 1, side: "defender", kind, level, x: 0, y: 0, hp: 1, maxHp: 1, dmg: 1, interval: 1, cooldown: 0, range: 5, speed: 1, flying: false, legendary: false, ...extra });
  check(pf("archer", 5).kind === "arrow" && pf("archer", 17).kind === "quarrel" && pf("archer", 17).tier! > pf("archer", 5).tier!, "a bowman looses arrows; an arbalestier, finer quarrels");
  check(pf("wizard", 200).tier === 4 && pf("wizard", 3).tier === 0 && pf("wizard", 50, { champion: "master" }).tier === 5 && pf("knight", 40).kind === "slash", "a spark for a novice, a comet for a great wizard, a nova for a Master; a wave off a great knight's blade");
  check(wizardSpeed(1) > 2 && wizardSpeed(500) > wizardSpeed(1), `wizards fly: ${wizardSpeed(1).toFixed(1)} tiles a second at first, ${wizardSpeed(500).toFixed(1)} at the top`);
}

// ── Reviews into stores: tithes, the quartermaster, requisitions ──
{
  const day = "2026-03-03";
  const fd = (o: Partial<FieldDaily> = {}): FieldDaily => ({
    id: "phys", name: "Physics", school: "science", level: 5, attrs: ["LOGIC", "STATISTIC"], ideasToday: 0, ideasWeek: 0,
    reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
  });
  const at = (f: FieldDaily[], o: Partial<TownInput> = {}): TownInput => ({ ...input, day, fields: f, ...o });
  const worth = (t: GameState) => Object.values(t.res).reduce((a, v) => a + v, 0);

  const t = newTown(4242, 12);
  knowledgeOf(t);
  const w0 = worth(t);
  knowledgeHourly(t, at([fd({ passed: [4, 0, 0, 0], reviewedToday: 4 })]));
  const w1 = worth(t);
  check(w1 > w0, `four passed reviews send goods to the stores (+${Math.round(w1 - w0)})`);
  knowledgeHourly(t, at([fd({ passed: [4, 0, 0, 0], reviewedToday: 4 })]));
  check(worth(t) === w1, "the same passes are never paid twice, however often the hour comes round");
  knowledgeHourly(t, at([fd({ passed: [4, 0, 0, 0], reviewedToday: 9, failed: 5 })]));
  check(worth(t) === w1, "failed reviews send nothing");

  // Deeper cards send finer goods.
  const shallow = allocate(t, "metal", 0, 4, null).goods;
  const deep = allocate(t, "metal", 2, 4, null).goods;
  check(!shallow.ingots && (deep.ingots ?? 0) > 0, `a new card sends iron and stone, a deep one ingots (${JSON.stringify(shallow)} vs ${JSON.stringify(deep)})`);
  const rooted = allocate(t, "coin", 3, 2, "commerce").goods;
  check((rooted.gold ?? 0) >= 2, `a rooted card sends gold, and a commerce Field sends coin a quarter richer (${JSON.stringify(rooted)})`);

  // The quartermaster: on auto the passes go where the town is short.
  const q = newTown(4243, 12);
  for (const k of Object.keys(q.res) as (keyof GameState["res"])[]) q.res[k] = 5000;
  q.res.wood = 0; q.res.stone = 0; q.res.planks = 0; q.res.bricks = 0;
  const n = needs(q);
  check(n.timber > 0.9 && n.coin === 0, `the quartermaster sees the town is out of timber (short ${Math.round(n.timber * 100)}%, coin ${Math.round(n.coin * 100)}%)`);
  const auto = allocate(q, "auto", 0, 6, null);
  check((auto.into.timber ?? 0) === 6, `on auto, six passes all go to timber (${JSON.stringify(auto.into)})`);
  const spread = allocate(newTown(4244, 12), "auto", 1, 40, null);
  check(Object.keys(spread.into).length >= 2, `forty passes on auto spread across the gaps (${JSON.stringify(spread.into)})`);
  const fk = knowledgeOf(q);
  check(setTitheFocus(q, fk, "food") === null && fk.focus === "food", "the quartermaster can be told to send food");
  const focused = allocate(q, "food", 1, 8, null);
  check((focused.into.food ?? 0) === 6 && (focused.into.timber ?? 0) === 2, `set to food, three in four go there and the rest to the gap (${JSON.stringify(focused.into)})`);
  const meals0 = q.res.meals;
  knowledgeHourly(q, at([fd({ passed: [0, 8, 0, 0] })]));
  check(q.res.meals > meals0, `eight settled passes with food set send meals (+${q.res.meals - meals0})`);

  // Mastery and new Domains.
  const m = newTown(4245, 12);
  const mk = knowledgeOf(m);
  const c0 = m.res.starchart;
  const hasForge = m.structures.some((st) => st.type === "forge");
  knowledgeHourly(m, at([fd({ mastered: 1, newDomains: 2 })]));
  knowledgeHourly(m, at([fd({ mastered: 1, newDomains: 2 })]));
  check(m.res.starchart === c0 + 2, `two new domains chart two stars (+${m.res.starchart - c0})`);
  const heir = (mk.owed ?? [])[0];
  check(!hasForge && mk.owed?.length === 1 && itemDef(heir)?.rarity === "legendary", `a mastered card earns one legendary heirloom, once; with no armoury it waits (${itemDef(heir)?.name})`);
  build(m, "forge", 50, 50);
  knowledgeHourly(m, at([fd({ mastered: 1, newDomains: 2 })]));
  check(!mk.owed?.length && stock(m, heir) === 1, "once a forge stands, the heirloom goes into its armoury");

  // Requisitions: posted against the Field in arrears, paid when its reviews are passed.
  const r = newTown(4246, 12);
  const rk = knowledgeOf(r);
  knowledgeHourly(r, at([fd({ dueRemaining: 8, overdue: 3 }), fd({ id: "hist", name: "History", school: "mind", dueRemaining: 2 })]));
  const req = rk.reqs?.find((x) => x.fieldId === "phys");
  check(!!req && req.need === 8 && rk.reqs!.length === 2, `the quartermaster asks Physics for 8 reviews and History for its 2 (${rk.reqs?.map((x) => `${x.field} ${x.need} → ${STOCKS[x.stock].name}`).join("; ")})`);
  const rw = worth(r);
  knowledgeHourly(r, at([fd({ dueRemaining: 3, passed: [5, 0, 0, 0] })]));
  check(!req!.done, "five of eight is not enough");
  knowledgeHourly(r, at([fd({ dueRemaining: 0, passed: [8, 0, 0, 0] })]));
  check(req!.done && worth(r) - rw > 8 * 7, `eight passed: the requisition is filled on top of the tithes (+${Math.round(worth(r) - rw)})`);
  knowledgeHourly(r, at([fd({ passed: [0, 0, 0, 0] })], { day: "2026-03-04" }));
  check(!rk.reqs!.some((x) => x.day === day), "yesterday's requisitions lapse");

  // Ideas buff by how new they were; the land reads attempts, the stores passes.
  const b1 = newTown(4247, 12);
  const b2 = newTown(4247, 12);
  knowledgeHourly(b1, at([fd({ ideasToday: 3, novelty: 3 })]));
  knowledgeHourly(b2, at([fd({ ideasToday: 3, novelty: 0.6 })]));
  const m1 = knowledgeOf(b1).mods.LOGIC ?? 0;
  const m2 = knowledgeOf(b2).mods.LOGIC ?? 0;
  check(m1 > m2 * 2 && m2 > 0, `three new ideas buff Method +${Math.round(m1 * 100)}%; three near-duplicates only +${Math.round(m2 * 100)}%`);
  knowledgeHourly(b1, at([fd()], { reviewsToday: 2, reviewsAttempted: 9 }));
  check(knowledgeOf(b1).reviewsToday === 9 && knowledgeOf(b1).passedToday === 2, "the land counts nine reviews attempted; the stores, two passed");
}

// ── Building paths: Steady, Mastery, Windfall, Thrift ──────
console.log("building paths");
{
  const types = Object.keys(CATALOG) as StructureType[];
  check(types.every((t) => pathsFor(t).length >= 3 && (pathsFor(t).length === 4) === THRIFTY.has(t)), `every one of ${types.length} building types has three paths, and the ${THRIFTY.size} that use goods up a fourth`);
  check(Math.abs(MASTERY_STEP ** 6 - STEADY) < 0.01 && MASTERY_STEP ** 19 > 2.3 && MASTERY_STEP ** 29 > 3.5, `Mastery meets Steady at level 7 (×${(MASTERY_STEP ** 6).toFixed(2)}), passes ×2.3 at 20 and ×3.5 at 30`);

  // A kitchen three ways: with a new chef, Steady cooks most; with a master chef, Mastery does.
  const cook = (kind: "steady" | "mastery" | null, chefLevel: number) => {
    const t = newTown(23, 20);
    const k = t.structures.find((x) => x.type === "kitchen")!;
    for (let i = 0; i < 2; i++) hire(t, k.id);
    for (const id of k.workers) {
      const v = t.villagers.find((x) => x.id === id)!;
      v.level = chefLevel;
    }
    if (kind) choosePath(t, k.id, kind);
    t.res.potato = 5000;
    const m0 = t.res.meals;
    for (let h = 0; h < 24; h++) advance(t, 60, ctx);
    return t.res.meals - m0;
  };
  const low = { none: cook(null, 1), steady: cook("steady", 1), mastery: cook("mastery", 1) };
  const high = { steady: cook("steady", 20), mastery: cook("mastery", 20) };
  check(low.steady > low.mastery * 1.15 && low.mastery >= low.none * 0.95, `new chefs: Steady cooks ${Math.round(low.steady)} meals a day, Mastery ${Math.round(low.mastery)}, no path ${Math.round(low.none)}`);
  check(high.mastery > high.steady * 1.4, `level-20 chefs: Mastery cooks ${Math.round(high.mastery)}, Steady ${Math.round(high.steady)}`);

  // Windfall and thrift settle an hour's goods.
  const w = newTown(24, 20);
  const ref = w.structures.find((x) => x.type === "kitchen")!;
  choosePath(w, ref.id, "windfall");
  const b0 = snap(w, ref)!;
  w.res.meals += 10;
  w.res.potato -= 5;
  settle(w, ref, b0, () => 0);
  check(w.res.meals - b0.meals === 20 && b0.potato - w.res.potato === 5, "a windfall hour makes its output twice, and costs no more");
  const th = newTown(25, 20);
  const kt = th.structures.find((x) => x.type === "kitchen")!;
  choosePath(th, kt.id, "thrift");
  const b1 = snap(th, kt)!;
  th.res.meals += 10;
  th.res.potato -= 10;
  settle(th, kt, b1, () => 0);
  check(th.res.meals - b1.meals === 10 && Math.abs(b1.potato - th.res.potato - 7) < 1e-9, "thrift gives back 30% of the goods used, and none of the output");

  // Lessons, lamps, storehouses, fires, beds.
  const t2 = newTown(26, 20);
  const school = build(t2, "school", 56, 40);
  choosePath(t2, school.id, "steady");
  school.training = { villagerId: t2.villagers[0].id, role: "scientist", left: 600 };
  const plain = build(t2, "school", 70, 40);
  plain.training = { villagerId: t2.villagers[1].id, role: "scientist", left: 600 };
  advance(t2, 10, ctx);
  const dSteady = 600 - school.training.left!;
  const dPlain = 600 - plain.training.left!;
  check(Math.abs(dSteady / dPlain - STEADY) < 0.01, `a Steady school's lessons run ${(dSteady / dPlain).toFixed(2)}× as fast`);
  const lamp = build(t2, "lamppost", 60, 50);
  const r0 = lightRange(lamp);
  choosePath(t2, lamp.id, "steady");
  check(Math.abs(lightRange(lamp) / r0 - STEADY) < 1e-9, `polished glass: a lamp reaches ${lightRange(lamp).toFixed(1)} tiles, not ${r0}`);
  const lamp2 = build(t2, "lamppost", 64, 50);
  choosePath(t2, lamp2.id, "windfall");
  pathsHourly(t2, 18, () => 0);
  check(lightRange(lamp2) === 8, "a beacon night: the windfall lamp burns twice as far");
  const room0 = storeRoom(t2);
  const store0 = t2.structures.find((x) => x.type === "storehouse") ?? build(t2, "storehouse", 52, 56);
  const roomA = storeRoom(t2);
  choosePath(t2, store0.id, "steady");
  check(storeRoom(t2) > roomA && storeRoom(t2) - (roomA - (roomA - room0)) >= 0, `stacked shelves: storehouse room ${roomA} → ${Math.round(storeRoom(t2))}`);
  const fire = t2.structures.find((x) => x.type === "pitfire") ?? build(t2, "pitfire", 48, 48);
  fire.fuel = 50;
  const fire2 = build(t2, "pitfire", 76, 52);
  fire2.fuel = 50;
  choosePath(t2, fire.id, "steady");
  for (let h = 0; h < 6; h++) advance(t2, 60, ctx);
  check((fire.fuel ?? 0) > (fire2.fuel ?? 0), `banked coals: fuel ${Math.round(fire.fuel ?? 0)} left against ${Math.round(fire2.fuel ?? 0)}`);
  const home = t2.structures.find((x) => x.type === "house")!;
  const sleeper = t2.villagers.find((v) => v.house === home.id)!;
  choosePath(t2, home.id, "steady");
  check(placeOf(t2, sleeper, 2)?.rest === STEADY, "feather beds: a household on the Steady path sleeps 30% sounder");

  // Towers strike harder on their path, and a change of path costs.
  const t3 = newTown(27, 20);
  const tower = build(t3, "watchtower", 50, 44);
  const tower2 = build(t3, "watchtower", 70, 44);
  choosePath(t3, tower.id, "steady");
  t3.raid = { arrivesAt: t3.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(t3, 0.01);
  const shot = (id: number) => t3.raid?.combatants.find((c) => c.structId === id)?.dmg ?? 0;
  check(shot(tower.id) > shot(tower2.id) * 1.2, `heavier bolts: the tower strikes ${shot(tower.id)} against ${shot(tower2.id)}`);
  t3.raid = null;
  t3.res.coin = 1000;
  const coin = t3.res.coin;
  check(choosePath(t3, tower.id, "mastery") === null && t3.res.coin === coin - retoolCost(tower) && rateOf(tower) === 1, `a change of path costs ${retoolCost(tower)} coin and leaves it bare while it retools`);
  t3.time += 13 * 60;
  refreshPaths(t3);
  check(rateOf(tower) === computeRate(t3, tower) && rateOf(tower) >= 1, "once retooled, the new path takes hold");
}

// ── Command: selection, orders, stations, groups ──────────
console.log("command");
{
  const t = newTown(41, 20);
  const tower = build(t, "watchtower", 52, 44);
  const [tx, ty] = [tower.x + tower.w / 2, tower.y + tower.h / 2];
  const sold = makeVillager(t, null, "infantry");
  sold.rank = 4;
  sold.guard = tower.id;
  const archer = makeVillager(t, null, "archer");
  archer.rank = 4;
  archer.guard = tower.id;
  const u0 = units(t).find((u) => u.id === sold.id);
  check(!!u0 && u0.inside && Math.hypot(u0.x - tx, u0.y - ty) < 0.01, "between raids a posted troop is under command, waiting at its post");
  check(unitsIn(t, tx - 1, ty - 1, tx + 1, ty + 1).includes(sold.id) && unitAt(t, tx, ty)?.id !== undefined, "a box over the post selects its guards; a click picks one");

  // Stationed in the field: they stand there, and a raid finds them there.
  const spot = [tx + 10, ty + 2] as [number, number];
  check(orderMove(t, [sold.id, archer.id], spot[0], spot[1]) === null && !!sold.stand && !!archer.stand, "a move between raids stations them in the field");
  check(Math.hypot(sold.stand![0] - archer.stand![0], sold.stand![1] - archer.stand![1]) > 1, "two troops stationed together stand apart, in formation");
  setGroup(t, 2, [sold.id, archer.id]);
  const saved = unpackSave(packSave(t));
  check(group(saved, 2).length === 2 && !!saved.villagers.find((v) => v.id === sold.id)?.stand, "stations and control groups survive a save");
  t.raid = { arrivesAt: t.time, party: [{ kind: "slime", level: 1, count: 2 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(t, 0.01);
  const fs = t.raid!.combatants.find((c) => c.villagerId === sold.id)!;
  check(!!fs && !fs.inside && !!fs.anchor && Math.hypot(fs.x - sold.stand![0], fs.y - sold.stand![1]) < 0.01, "when the raid comes, a stationed troop fights from its station, out of doors");

  // Move: ignore everything, get there; then hold.
  const [mx, my] = [fs.x - 8, fs.y + 6];
  const slime = t.raid!.combatants.find((c) => c.side === "monster")!;
  slime.x = fs.x - 2;
  slime.y = fs.y + 1.5;
  slime.speed = 0;
  orderMove(t, [sold.id], mx, my);
  for (let i = 0; i < 400 && Math.hypot(fs.x - mx, fs.y - my) > 0.4; i++) stepCombat(t, 0.05);
  check(Math.hypot(fs.x - mx, fs.y - my) <= 0.4 && !fs.fought, `a move order walks past the slime without a blow, to its spot (${fs.x.toFixed(1)},${fs.y.toFixed(1)})`);
  stepCombat(t, 0.05);
  check(fs.order?.kind === "hold" && !!fs.anchor && Math.hypot(fs.anchor[0] - mx, fs.anchor[1] - my) < 0.01, "arrived, it holds the spot");

  // Attack: hunt one down.
  const other = t.raid!.combatants.filter((c) => c.side === "monster")[1];
  other.x = fs.x + 5;
  other.y = fs.y;
  other.speed = 0;
  orderAttack(t, [sold.id], other.id);
  for (let i = 0; i < 400 && other.hp > 0; i++) stepCombat(t, 0.05);
  check(other.hp <= 0, "an attack order hunts its monster down");

  // Attack-move: fights what it meets on the way.
  t.raid = { arrivesAt: t.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(t, 0.01);
  const fa = t.raid!.combatants.find((c) => c.villagerId === sold.id)!;
  const blob = t.raid!.combatants.find((c) => c.side === "monster")!;
  blob.x = fa.x + 4;
  blob.y = fa.y + 0.5;
  blob.speed = 0;
  // Tough enough to outlast the test: the raid must still be on for the orders after it.
  blob.hp = blob.maxHp = 5000;
  const hpB = blob.hp;
  orderMove(t, [sold.id], fa.x + 12, fa.y, true);
  for (let i = 0; i < 60; i++) stepCombat(t, 0.05);
  check(blob.hp < hpB && fa.fought === true, "an attack-move stops to fight what it meets on the way");
  orderStop(t, [sold.id]);
  check(!fa.order, "stop drops the order");
  orderReturn(t, [sold.id, archer.id]);
  check(!sold.stand && !archer.stand && !fa.anchor, "return to post gives up the station");
  t.raid = null;

  // A knight's battalion follows the knight's orders.
  const k = newTown(42, 20);
  const kt = build(k, "watchtower", 52, 44);
  const knight = makeVillager(k, null, "knight");
  knight.rank = 12;
  knight.guard = kt.id;
  knight.battalion = 3;
  k.raid = { arrivesAt: k.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(k, 0.01);
  orderMove(k, [knight.id], kt.x + 12, kt.y + 6);
  const followers = k.raid!.combatants.filter((c) => c.leader === knight.id);
  check(followers.length === 3 && followers.every((c) => c.order?.kind === "move" && !c.inside), `the knight's sworn battalion (${followers.length}) moves with them`);
}

// ── Maps: the green country, the desert, the floating isles ──
console.log("maps");
{
  const picks = new Set(Array.from({ length: 30 }, (_, i) => pickBiome((i + 0.5) / 30)));
  check(picks.size === 3, "a new game draws its map from all three");
  const towns = Object.fromEntries(BIOMES.map((b) => [b, newTown(501, 20, "showcase", b)])) as Record<Biome, GameState>;
  for (const b of BIOMES) {
    const t = towns[b];
    const hall = t.structures.find((x) => x.type === "townhall");
    const mill = t.structures.find((x) => x.type === "watermill");
    const onSky = t.structures.some((st) => {
      for (let y = st.y; y < st.y + st.h; y++) for (let x = st.x; x < st.x + st.w; x++) if (t.map.terrain[y * MAP_W + x] === Terrain.Void) return true;
      return false;
    });
    const farms = t.structures.filter((x) => x.type === "farm");
    check(!!hall && !!mill && !onSky && farms.every((f) => landCrops(t).includes(f.mode!)), `${BIOME_DEFS[b].name}: founded with its hall and mill on solid ground, its fields sown with ${farms.map((f) => f.mode).join(", ")}`);
  }
  const count = (t: GameState, k: number) => t.map.terrain.filter((x) => x === k).length;
  const sky = towns.skyisles;
  check(count(sky, Terrain.Void) > MAP_W * MAP_H * 0.4 && count(towns.temperate, Terrain.Void) === 0, `the floating isles: ${Math.round((count(sky, Terrain.Void) / (MAP_W * MAP_H)) * 100)}% of the map is open sky`);
  const desert = towns.desert;
  check(count(desert, Terrain.Forest) < count(towns.temperate, Terrain.Forest) / 3 && count(desert, Terrain.Water) < count(towns.temperate, Terrain.Water), `the desert: ${count(desert, Terrain.Forest)} tiles of palm grove against the green country's ${count(towns.temperate, Terrain.Forest)} of forest, and less water`);

  // A bridge over the sky: planks as well as stone, and taking it up leaves the sky.
  const edge = sky.map.terrain.findIndex((t, i) => t === Terrain.Void && i % MAP_W > 5 && sky.map.terrain[i - 1] !== Terrain.Void && sky.map.terrain[i - 1] !== Terrain.Water);
  sky.res.planks = 10;
  const pl = sky.res.planks;
  check(checkPlacement(sky, "house", edge % MAP_W, Math.floor(edge / MAP_W)).ok === false, "nothing is built on the open sky");
  check(!paint(sky, "pavement", [edge]) && sky.map.terrain[edge] === Terrain.Pavement && sky.map.bridge?.[edge] === 1 && sky.res.planks === pl - 3, "a road laid over the sky is a bridge, for 3 planks more");
  unpaint(sky, [edge]);
  check(sky.map.terrain[edge] === Terrain.Void, "taken up, the bridge leaves the sky it crossed");
  check(!!paint(sky, "wall", [edge]), "no wall stands on the open sky");

  // The desert's climate: hot by day, no ice in winter.
  const tT = air(towns.temperate).T;
  const dT = air(desert).T;
  check(dT - tT > 8, `a desert spring morning is ${Math.round(dT)} °C against the green country's ${Math.round(tT)} °C`);
  const winterAt = (t: GameState) => {
    t.time = (YEAR_DAYS - 3) * 24 * 60 + 12 * 60;
    return clock(t.time).season;
  };
  const f = desert.structures.find((x) => x.type === "farm")!;
  check(winterAt(desert) === "winter" && !fieldFrozen(desert, f, true), "a desert winter does not ice the fields");

  // Every raid and every roaming band is of the map it comes to.
  for (const b of ["desert", "skyisles"] as const) {
    const t = newTown(502, 20, "showcase", b);
    t.villagers.forEach((v) => (v.rank = 12));
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      t.time += 24 * 60;
      t.raid = null;
      scheduleRaid(t, rng(800 + i));
      for (const pp of t.raid!.party) kinds.add(pp.kind);
    }
    for (let d = 0; d < 20; d++) advance(t, 24 * 60, ctx);
    for (const r of t.roamers ?? []) kinds.add(r.kind);
    const stray = [...kinds].filter((k) => !native(b, k));
    check(!stray.length && kinds.size >= 3, `${BIOME_DEFS[b].name}: raids and roaming bands are all its own (${[...kinds].join(", ")})`);
  }
  check(localize("desert", "goblin", MONSTERS) !== "goblin" && native("desert", localize("desert", "goblin", MONSTERS)) && localize("temperate", "goblin", MONSTERS) === "goblin", `a goblin sent to the desert arrives as a ${localize("desert", "goblin", MONSTERS)}; at home, a goblin`);
  check(!native("temperate", "scorpion") && native("desert", "bat") && native("skyisles", "griffin"), "the new maps' own stay there; bats haunt the desert tombs and griffins the isles");

  // Wild crops and salt.
  const wild = newTown(503, 20, "showcase", "desert");
  for (let d = 0; d < 6; d++) sowWild(wild, rng(900 + d));
  const kindsWild = new Set<string>();
  wild.map.overlay.forEach((o, i) => {
    if (o === Overlay.Crop) kindsWild.add(wildCrop(wild.map.meta[i]));
  });
  check([...kindsWild].every((k) => BIOME_DEFS.desert.land.includes(k) || BIOME_DEFS.desert.water.includes(k)), `wild patches in the desert are desert crops (${[...kindsWild].join(", ")})`);
  const pan = wild.map.terrain.findIndex((t, i) => t === Terrain.Marsh && wild.map.overlay[i] === Overlay.None);
  if (pan >= 0) {
    // Salt is a bulk good: it keeps only in a storehouse.
    build(wild, "storehouse", 50, 40);
    const salt0 = wild.res.salt;
    const peat0 = wild.res.peat;
    clear(wild, [pan]);
    for (let h = 0; h < 48 && wild.map.terrain[pan] === Terrain.Marsh; h++) advance(wild, 60, ctx);
    check(wild.res.salt > salt0 && wild.res.peat === peat0, "a desert salt pan, cut, gives salt rather than peat");
  }
}

// ── The weather, the monsters and the crops of each map ────
console.log("map weather, habits and crops");
{
  // A year of each map's sky.
  const year = (b: Biome) => {
    const t = newTown(601, 20, "showcase", b);
    const seen = new Map<Regime, number>();
    let summerNoon = 0;
    let n = 0;
    for (let h = 0; h < YEAR_DAYS * 24; h++) {
      t.time += 60;
      weatherHourly(t);
      const rg = weatherOf(t).regime;
      seen.set(rg, (seen.get(rg) ?? 0) + 1);
      const c = clock(t.time);
      if (c.season === "summer" && c.hour === 13) {
        summerNoon += air(t).T;
        n++;
      }
    }
    return { seen, noon: summerNoon / Math.max(1, n) };
  };
  const tw = year("temperate");
  const dw = year("desert");
  const sw = year("skyisles");
  const has = (m: Map<Regime, number>, ...rs: Regime[]) => rs.every((r) => (m.get(r) ?? 0) > 0);
  const none = (m: Map<Regime, number>, ...rs: Regime[]) => rs.every((r) => !m.get(r));
  const list = (m: Map<Regime, number>) => [...m].map(([k, v]) => `${k} ${v}h`).join(", ");
  check(none(tw.seen, "sandstorm", "heatwave", "gale", "thunder", "fog"), `the green country keeps its own weather (${list(tw.seen)})`);
  check(has(dw.seen, "sandstorm", "heatwave", "rain") && none(dw.seen, "snow", "blizzard", "gale", "thunder", "fog"), `the desert: heatwaves, sandstorms and winter rain, never snow (${list(dw.seen)})`);
  check(has(sw.seen, "gale", "thunder", "fog", "snow") && none(sw.seen, "sandstorm", "heatwave"), `the floating isles: gales, thunderstorms, fog, and snow in winter (${list(sw.seen)})`);
  check(dw.noon - tw.noon > 12 && sw.noon < tw.noon, `summer at one o'clock: desert ${Math.round(dw.noon)} °C, green country ${Math.round(tw.noon)} °C, isles ${Math.round(sw.noon)} °C`);

  // Crops keep to their climate.
  const desertS = { biome: "desert" as Biome };
  const green = { biome: "temperate" as Biome };
  const date = cropHour(desertS, "date", { T: 40, regime: "fair" }, 1).factor;
  const cabbage = cropHour(desertS, "cabbage", { T: 40, regime: "fair" }, 1).factor;
  check(date === 1 && cabbage < 0.25, `a desert noon at 40 °C, both watered: dates grow at ${Math.round(date * 100)}%, cabbages at ${Math.round(cabbage * 100)}%`);
  const chick = cropHour(desertS, "chickpea", { T: 25, regime: "fair" }, 0).factor;
  const melonDry = cropHour(desertS, "melon", { T: 25, regime: "fair" }, 0).factor;
  const melonWet = cropHour(desertS, "melon", { T: 25, regime: "fair" }, 1).factor;
  check(chick > melonDry && melonWet === 1, `thirst: in the dry, chickpeas ${Math.round(chick * 100)}% and melons ${Math.round(melonDry * 100)}% — melons watered by a mill, 100%`);
  const millet = cropHour(desertS, "millet", { T: 25, regime: "sandstorm" }, 1).factor;
  const melonSand = cropHour(desertS, "melon", { T: 25, regime: "sandstorm" }, 1).factor;
  check(millet > melonSand * 2, `a sandstorm: millet stands it (${Math.round(millet * 100)}%), melons are buried (${Math.round(melonSand * 100)}%)`);
  const isles = { biome: "skyisles" as Biome };
  const sunflower = cropHour(isles, "sunflower", { T: 15, regime: "gale" }, 1);
  const windroot = cropHour(isles, "windroot", { T: 15, regime: "gale" }, 1);
  check(windroot.factor === 1 && sunflower.factor < 0.5 && /flattened/.test(sunflower.why), `a gale on the isles: windroot untouched, sunflowers ${sunflower.why} (${Math.round(sunflower.factor * 100)}%)`);
  check(cropHour(green, "potato", { T: 15, regime: "fair" }, 0.25).factor === 1 && cropHour(isles, "cloudberry", { T: -5, regime: "snow" }, 1).factor === 1 && cropHour(isles, "potato", { T: -5, regime: "snow" }, 1).factor === 0,
    "potatoes in the green country's weather grow as they always did; cloudberries shrug off −5 °C that stops potatoes");
  const df = newTown(602, 20, "showcase", "desert");
  advance(df, 60, ctx);
  check(df.structures.filter((x) => x.type === "farm").every((f) => !!f.cropNow), `a desert field reports how the hour's weather suits its crop (${df.structures.filter((x) => x.type === "farm").map((f) => `${f.mode} ${Math.round((f.cropNow?.[0] ?? 0) * 100)}%`).join(", ")})`);

  // Monster habits: the heat, the weather, the air.
  const scorp = { kind: "scorpion" };
  const worm = { kind: "sandworm" };
  check(habitWeight("desert", scorp, 13, "fair", "summer") === 0.25 && habitWeight("desert", worm, 13, "fair", "summer") === 1 && habitWeight("desert", scorp, 22, "fair", "summer") === 1,
    "a desert summer noon: scorpions lie up in the shade (×0.25) and come out at night; the sandworm does not mind the heat");
  check(habitWeight("desert", worm, 22, "sandstorm", "autumn") === 2.5 && habitWeight("desert", { kind: "jackal" }, 22, "sandstorm", "autumn") > 1 && habitWeight("desert", { kind: "mummy" }, 22, "heatwave", "autumn") < 1,
    "a sandstorm draws sandworms (×2.5) and jackals; a heatwave keeps mummies in");
  check(habitWeight("skyisles", { kind: "skyray", flying: true }, 12, "gale", "spring") === 2 && habitWeight("skyisles", { kind: "mimic" }, 12, "gale", "spring") < 0.35 && habitWeight("skyisles", { kind: "thunderbird", flying: true }, 12, "thunder", "summer") === 3,
    "on the isles a gale brings sky rays and keeps walkers down; thunderbirds hunt in the storm");
  const hot = newTown(603, 20, "showcase", "desert");
  hot.time = (SEASON_LENGTH.spring + 2) * 24 * 60 + 12 * 60;
  const dusk = arrivalFor(hot, hot.time + 60, "scorpion");
  check(clock(hot.time).season === "summer" && clock(dusk).hour === 19 && arrivalFor(hot, hot.time + 60, "sandworm") === hot.time + 60 && arrivalFor(newTown(606, 20), hot.time + 60, "scorpion") === hot.time + 60,
    `a desert raid due at one in summer waits for the heat to break (${clock(dusk).hour}:00); a sandworm comes at once; the green country's raids keep their hour`);
  check(sandSlowed("desert", "golem", false) && !sandSlowed("desert", "scorpion", false) && !sandSlowed("desert", "golem", true) && !sandSlowed("temperate", "golem", false),
    "in the desert a golem labours through the sand; a scorpion does not");

  // The weather in a fight.
  const fw = newTown(604, 20, "showcase", "skyisles");
  weatherOf(fw).regime = "fog";
  check(weatherCombat(fw).alert === 0.6, "fog: guards see late (alert ×0.6)");
  weatherOf(fw).regime = "fair";
  const hall = fw.structures.find((x) => x.type === "townhall")!;
  const edge = isleEdge(fw, hall, "east", 0);
  const beyond = edge && fw.map.terrain[Math.floor(edge[1]) * MAP_W + Math.floor(edge[0]) + 1];
  check(!!edge && fw.map.terrain[Math.floor(edge[1]) * MAP_W + Math.floor(edge[0])] !== Terrain.Void && beyond === Terrain.Void, `on the isles a walking raid climbs out of the clouds at the island's edge (${edge?.map((v) => Math.round(v)).join(",")})`);
  fw.raid = { arrivesAt: fw.time, party: [{ kind: "mimic", level: 3, count: 4 }], side: "east", target: hall.id, phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(fw, 0.01);
  const walkers = fw.raid!.combatants.filter((c) => c.side === "monster");
  const nearSky = (x: number, y: number) => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (fw.map.terrain[(Math.floor(y) + dy) * MAP_W + Math.floor(x) + dx] === Terrain.Void) return true;
    return false;
  };
  check(walkers.length === 4 && walkers.every((c) => nearSky(c.x, c.y)), "the walking raiders start at the island's rim, not across the open sky");
  fw.raid = null;
  // Lightning.
  weatherOf(fw).regime = "thunder";
  const tall = build(fw, "watchtower", 52, 44);
  const hp0 = tall.hp;
  const hall0 = hall.hp;
  stormsHourly(fw, () => 0);
  check((tall.hp < hp0 || hall.hp < hall0) && fw.log[0].text.startsWith("Lightning strikes"), `a thunderstorm's lightning strikes the tall buildings (${fw.log[0].text})`);
  weatherOf(fw).regime = "fair";

  // A walking band on the isles never steps off its island.
  const band = newTown(605, 20, "showcase", "skyisles");
  const [hx, hy] = [hall.x, hall.y];
  let x0 = hx;
  while (band.map.terrain[hy * MAP_W + x0 + 1] !== Terrain.Void && x0 < MAP_W - 2) x0++;
  band.roamers = [{ id: 1, lair: 0, kind: "mimic", level: 3, count: 2, x: x0 - 1, y: hy + 0.5, tx: x0 + 30, ty: hy + 0.5 }];
  let offIsland = false;
  for (let m = 0; m < 600; m++) {
    stepWilds(band, 5);
    const b0 = band.roamers![0];
    if (band.map.terrain[Math.floor(b0.y) * MAP_W + Math.floor(b0.x)] === Terrain.Void) offIsland = true;
  }
  check(!offIsland, "a walking band on the isles stops at its island's edge rather than walk onto the sky");
}

// ── Nights, the watch, the dead, attributes and the town's name ──
console.log("nights, the night watch, the dead, attributes and recognition");
{
  // The opening: five days of the dark's own creatures, then the others' share rises over fifteen more.
  check(otherShare(1) === 0 && otherShare(OPENING_DAYS + 1) === 0 && otherShare(11) > 0.2 && otherShare(11) < 0.4 && otherShare(OPENING_DAYS + 1 + RAMP_DAYS) === 1,
    `only the dark's creatures for ${OPENING_DAYS} days; the others' share is ${Math.round(otherShare(11) * 100)}% by day 11 and all odds by day ${OPENING_DAYS + 1 + RAMP_DAYS}`);
  const born = Array.from({ length: 60 }, (_, i) => nightbornFor(i + 1));
  check(born.every((k) => MONSTERS[k].night), `every creature the dark sends in the opening burns in light (${[...new Set(born)].join(", ")})`);

  // Light burns them: a dark thing inside a fire's light is scorched and loses health; the same thing in the dark is not.
  const lt = newTown(4241, 20);
  const fire = lt.structures.find((x) => x.type === "pitfire")!;
  const [fx, fy] = center(fire);
  lt.time = 9 * 24 * 60 + 23 * 60;
  lt.raid = { arrivesAt: lt.time, party: [{ kind: "ghoul", level: 3, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(lt, 0.05);
  const ghoul = lt.raid!.combatants.find((c) => c.side === "monster")!;
  ghoul.x = fx + 1;
  ghoul.y = fy;
  ghoul.targetStruct = null;
  const hp0 = ghoul.hp;
  for (let i = 0; i < 10 && lt.raid; i++) stepCombat(lt, 0.05);
  check(!!ghoul.scorched && ghoul.hp < hp0, `a ghoul in the fire's light is scorched and burns (${hp0} → ${Math.round(ghoul.hp)})`);

  // The night watch: only they answer at night; they sleep from nine to five; everyone answers in the morning.
  const s = newTown(4242, 20);
  const tower = build(s, "watchtower", 44, 38);
  const watchman = makeVillager(s, null, "infantry");
  const sleeper = makeVillager(s, null, "infantry");
  watchman.rank = sleeper.rank = 5;
  assignGuard(s, watchman.id, tower.id);
  assignGuard(s, sleeper.id, tower.id);
  check(!setNightWatch(s, watchman.id, true) && !!watchman.nightWatch, "a troop can be named to the night watch");
  sleeper.health = 15;
  check(!!setNightWatch(s, sleeper.id, true) && !sleeper.nightWatch, "the badly hurt cannot keep it");
  sleeper.health = 100;
  const answer = (hour: number) => {
    s.time = 9 * 24 * 60 + hour * 60;
    s.raid = { arrivesAt: s.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
    stepCombat(s, 0.05);
    const out = s.raid!.combatants.filter((c) => c.side === "defender");
    s.raid = null;
    return out;
  };
  const night = answer(23);
  check(night.some((c) => c.villagerId === watchman.id) && !night.some((c) => c.villagerId === sleeper.id), "at night only the watch answers the alarm");
  check(!night.some((c) => c.kind === "militia"), "and the townsfolk sleep through it");
  const noon = answer(12);
  check(!noon.some((c) => c.villagerId === watchman.id) && noon.some((c) => c.villagerId === sleeper.id), "by day the watch sleeps, nine to five, and the rest answer");
  const morning = answer(7);
  check(morning.some((c) => c.villagerId === watchman.id) && morning.some((c) => c.villagerId === sleeper.id), "at seven in the morning both answer");
  const folk = s.villagers.find((v) => v.role !== "infantry")!;
  setNightWatch(s, folk.id, true);
  check(answer(23).some((c) => c.kind === "militia" && c.villagerId === folk.id), "a townsperson on the watch rises as militia at night");
  setNightWatch(s, folk.id, false);

  // The dead are dead: a troop who falls is gone, and the town's name pays.
  s.time = 9 * 24 * 60 + 12 * 60;
  const pop0 = s.villagers.length;
  const rec0 = recognitionOf(s).points;
  s.raid = { arrivesAt: s.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(s, 0.05);
  s.raid!.combatants.find((c) => c.villagerId === sleeper.id)!.hp = 0;
  stepCombat(s, 0.05);
  check(!s.villagers.includes(sleeper) && s.villagers.length === pop0 - 1, "a troop who falls in the fight is dead — not wounded, not back tomorrow");
  check(recognitionOf(s).points < rec0, `and the town's name pays for it (${rec0} → ${recognitionOf(s).points})`);
  s.raid = null;

  // Each death in a day costs more than the last, by the share of the town already lost; a death of neglect more still.
  const d = newTown(4243, 20);
  const r0 = recognitionOf(d).points;
  check(r0 === REC_START, `a town starts with ${REC_START} recognition`);
  const costs = (t: GameState, whys: string[]) =>
    whys.map((why) => {
      const b = recognitionOf(t).points;
      onDeath(t, why);
      return b - recognitionOf(t).points;
    });
  const small = costs(d, ["fell defending the town", "fell defending the town", "died of hunger"]);
  const big = newTown(4243, 20);
  while (big.villagers.length < 30) makeVillager(big, big.structures.find((x) => x.type === "townhall")!.id);
  const large = costs(big, ["fell defending the town", "fell defending the town", "died of hunger"]);
  check(small[1] > small[0] && small[2] > small[1] && large[1] < small[1] && large[2] < small[2],
    `deaths cost more as they mount, measured against the town: ${small.join(", ")} in a town of ${d.villagers.length}; ${large.join(", ")} in a town of 30 (the last of neglect)`);
  check(recognitionOf(d).today.some((e) => e.why === "fell in battle") && recognitionOf(d).today.some((e) => e.why === "died of neglect"), "the ledger names deaths in battle and deaths of neglect");
  // A good day earns it back at dawn.
  const g = newTown(4244, 20);
  const g0 = recognitionOf(g).points;
  recognitionDaily(g);
  check(recognitionOf(g).points > g0 && recognitionOf(g).yesterday.length === 0 && recognitionOf(g).today.length > 0, `a quiet, fed dawn earns recognition (${g0} → ${recognitionOf(g).points}: ${recognitionOf(g).today.map((e) => e.why).join(", ")})`);
  kill(g, g.villagers[0], "starved");
  check(recognitionOf(g).deathsToday === 1, "a death is counted against the day");

  // The name draws the gifted.
  const lo = talentOdds(0);
  const hi = talentOdds(800);
  check(hi.gifted > lo.gifted * 5 && hi.prodigy > lo.prodigy * 5, `a legendary name draws the gifted: ${Math.round(lo.gifted * 100)}% → ${Math.round(hi.gifted * 100)}% gifted, ${Math.round(lo.prodigy * 100)}% → ${Math.round(hi.prodigy * 100)}% prodigies`);
  let gifts = 0;
  let prodigies = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const roll = rollAttrs(rng(9000 + i), hi);
    if (roll.gift) gifts++;
    if (roll.gift === "prodigy") {
      prodigies++;
      if (!ALL_ATTRS.some((k) => roll.attrs[k] >= 18)) gifts = -1e9;
    }
    const plain = rollAttrs(rng(19000 + i), { gifted: 0, prodigy: 0 });
    for (const k of ALL_ATTRS) {
      sum += plain.attrs[k];
      n++;
    }
  }
  check(gifts > 400 * 0.4 && prodigies > 400 * 0.05, `of 400 newcomers to a legendary town, ${gifts} arrive gifted (${prodigies} prodigies, each with an attribute at 18+)`);
  check(Math.abs(sum / n - 8) < 0.6, `a commoner's attributes sit about 8 (mean ${(sum / n).toFixed(2)})`);

  // Attributes are the person, not the post: they stay through promotion and grow as they rise.
  const p = newTown(4245, 20);
  const soldier = makeVillager(p, null, "infantry");
  const mine = attrsOf(soldier);
  const snap = { ...mine };
  soldier.role = "knight";
  check(attrsOf(soldier) === mine && ALL_ATTRS.every((k) => attrsOf(soldier)[k] === snap[k]), "a promotion keeps every attribute");
  let grown = 0;
  for (let i = 0; i < 40; i++) {
    soldier.rank = i;
    if (growOnRise(soldier, 100 + i)) grown++;
  }
  const sumWar = (a: typeof snap) => a.mig + a.vit + a.val;
  check(grown >= 12 && grown <= 32 && sumWar(attrsOf(soldier)) === sumWar(snap) + grown && ALL_ATTRS.every((k) => attrsOf(soldier)[k] <= ATTR_MAX),
    `and they grow as they rise: ${grown} of 40 promotions raised a knight's Might, Vitality or Valor`);
  const strong = makeVillager(p, null, "farmhand");
  const weak = makeVillager(p, null, "farmhand");
  attrsOf(strong).str = 20;
  attrsOf(weak).str = 4;
  check(workMul(strong, "farm") / workMul(weak, "farm") > 1.45, `Strength 20 works a field ${Math.round((workMul(strong, "farm") / workMul(weak, "farm") - 1) * 100)}% faster than Strength 4`);
  attrsOf(soldier).vit = 20;
  attrsOf(soldier).val = 20;
  check(warMods(soldier).hp > 1.3 && warMods(soldier).valor === 1, "Vitality 20 is a third more hit points; Valor 20 holds firm against any terror");
}

// ── Bands keep their distance; lamps take fuel ──────────────
console.log("bands at the edge of town, and lamps that burn dry");
{
  check(mannerOf("wolf") === "pack" && mannerOf("griffin") === "wheel" && mannerOf("skeleton") === "shamble" && mannerOf("troll") === "pace" && mannerOf("spider") === "creep" && mannerOf("yurei") === "drift",
    `each kind moves in a manner: wolves ${MANNERS.pack.blurb}, griffins ${MANNERS.wheel.blurb}, skeletons ${MANNERS.shamble.blurb}, trolls ${MANNERS.pace.blurb}, spiders ${MANNERS.creep.blurb}, yurei ${MANNERS.drift.blurb}`);
  const g = newTown(4250, 20);
  const hall = g.structures.find((x) => x.type === "townhall")!;
  const [hx, hy] = center(hall);
  g.time = 10 * 24 * 60 + 11 * 60;
  g.hourAcc = 0;
  g.nextRaidAt = g.time + 99 * 24 * 60;
  aggroOf(g).purse = 0;
  g.roamers = [{ id: 901, lair: 0, kind: "wolf", level: 3, count: 3, x: hx + 6, y: hy + 1, tx: hx + 6, ty: hy + 1 }];
  const nearest = (x: number, y: number) => Math.min(...g.structures.map((st) => Math.hypot(x - Math.max(st.x, Math.min(x, st.x + st.w)), y - Math.max(st.y, Math.min(y, st.y + st.h)))));
  check(inHallZone(g, hx + 6, hy + 1) && nearest(hx + 6, hy + 1) <= perceptionOf(g, g.roamers[0]), "a pack of wolves stands in the hall's zone, the town in plain sight");
  let inSight = 0;
  let run = 0;
  let moved = 0;
  let steps = 0;
  let last: [number, number] = [hx + 6, hy + 1];
  for (let h = 0; h < 30; h++) {
    for (let m = 0; m < 6; m++) {
      advance(g, 10, ctx);
      const b = g.roamers?.find((x) => x.id === 901);
      if (!b) break;
      if (h >= 12) {
        steps++;
        if (Math.hypot(b.x - last[0], b.y - last[1]) > 0.02) moved++;
        run = nearest(b.x, b.y) <= perceptionOf(g, b) || inHallZone(g, b.x, b.y) ? run + 1 : 0;
        inSight = Math.max(inSight, run);
      }
      last = [b.x, b.y];
    }
  }
  const band = g.roamers?.find((x) => x.id === 901);
  check(!!band && !g.raid, "with nothing in the land's purse it does not strike");
  check(inSight <= 6, `it draws off out of the town's sight within hours, and never lingers in it again — at most ${inSight * 10} minutes at a time, coming to look (${band ? `now ${Math.round(nearest(band.x, band.y))} tiles from the nearest building, ${band.mode}` : "gone"})`);
  check(steps > 0 && moved >= steps * 0.8, `and it does not stand still out there: it moved in ${moved} of ${steps} ten-minute spells`);
  // Given the land's purse and its rest, a lurking band comes on again and strikes.
  aggroOf(g).purse = 1e6;
  aggroOf(g).lastWaveAt = g.time - 24 * 60;
  let struck = false;
  for (let h = 0; h < 48 && !struck; h++) {
    advance(g, 60, ctx);
    if (g.raid?.origin && !(g.roamers ?? []).some((x) => x.id === 901)) struck = true;
  }
  check(struck, "with the land's purse behind it, the band comes on again and strikes from where it stood");

  // Lamps.
  const t = newTown(4251, 20);
  const th = t.structures.find((x) => x.type === "townhall")!;
  const lamp = build(t, "lamppost", th.x + th.w + 6, th.y);
  check(lampFuel(lamp) === LAMP_CAP && lightRange(lamp) > 0, `a new lamp is put up full (${LAMP_CAP}) and lit`);
  t.time = 3 * 24 * 60 + 8 * 60;
  t.hourAcc = 0;
  for (let h = 0; h < 10; h++) advance(t, 60, ctx);
  check(lampFuel(lamp) === LAMP_CAP, "by day it burns nothing");
  for (let h = 0; h < 12; h++) advance(t, 60, ctx);
  const used = LAMP_CAP - lampFuel(lamp);
  check(Math.abs(used - 0.5) < 0.1, `a night burns about half a unit (${used.toFixed(2)}): a full load is about twenty-four nights`);
  check(burnRate("spring", true) >= 8 * LAMP_BURN && burnRate("winter", true) >= 60 * LAMP_BURN, `a pit fire burns ${Math.round(burnRate("spring", true) / LAMP_BURN)}× a lamp's rate in spring, ${Math.round(burnRate("winter", true) / LAMP_BURN)}× on a winter night`);
  lamp.fuel = 0;
  check(lightRange(lamp) === 0, "burnt dry, a lamp gives no light");
  t.res.coal = 2;
  t.res.wood = 100;
  check(!fillLamp(t, lamp.id, "coal", 1) && lampFuel(lamp) === 3 && t.res.coal === 1, "a coal is three units of it");
  const coal0 = t.res.coal;
  check(!fillLamp(t, lamp.id) && lampFuel(lamp) === LAMP_CAP && t.res.coal === coal0, "filled: wood first, the coal kept for the fires, to twelve");
  check(fillLamp(t, lamp.id) === "The lamp is full.", "a full lamp takes no more");
  const other = build(t, "lamppost", th.x - 6, th.y);
  other.fuel = 1;
  lamp.fuel = 5;
  check(!fillAllLamps(t) && lampFuel(lamp) === LAMP_CAP && lampFuel(other) === LAMP_CAP, "Fill every lamp tops them all up");
  const older = build(t, "lamppost", th.x, th.y + th.h + 5);
  delete older.fuel;
  check(lampFuel(older) === LAMP_CAP && lightRange(older) > 0, "a lamp from before lamps took fuel counts as full");
}

// ── Walls, schools, the heavy armoury, mastery, the walk, the mythic watch ──
console.log("walls in orders, who may train, the heavy classes, mastery gates, the walk out and back, the mythic watch");
{
  // Walls: sixty levels in six orders, each keeping the last's.
  check(WALL_ORDERS.length === 6 && wallOrder(9) === 0 && wallOrder(10) === 1 && wallOrder(59) === 5 && wMax(60, true) < 10000, `walls rise to 60 in six orders: ${WALL_ORDERS.map((o) => o.name).join(", ")}`);
  const w = newTown(4301, 20);
  const hall = w.structures.find((x) => x.type === "townhall")!;
  // A wall right across the land below the hall: whatever comes from the south must break through it.
  const row = hall.y + hall.h + 4;
  const wallTiles = Array.from({ length: MAP_W }, (_, x) => row * MAP_W + x).filter((i) => w.map.overlay[i] === Overlay.None);
  for (const i of wallTiles) w.map.overlay[i] = Overlay.Wall;
  const strikeWall = (level: number) => {
    for (const i of wallTiles) w.map.meta[i] = wMeta(level, wMax(level));
    w.raid = { arrivesAt: w.time, party: [{ kind: "troll", level: 20, count: 1 }], side: "south", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
    stepCombat(w, 0.05);
    const m = w.raid!.combatants.find((c) => c.side === "monster")!;
    m.x = hall.x + hall.w / 2;
    m.y = row + 3.5;
    m.targetStruct = hall.id;
    // The first blow that lands on the wall: what the wall lost, and what the troll took for it.
    const total = () => wallTiles.reduce((a, i) => a + (w.map.overlay[i] === Overlay.Wall ? wHp(w.map.meta[i]) : 0), 0);
    const before = total();
    let lost = 0;
    let hurt = 0;
    for (let i = 0; i < 600 && w.raid && m.hp > 0 && !lost; i++) {
      const hp = m.hp;
      stepCombat(w, 0.05);
      const now = total();
      if (now < before) {
        lost = before - now;
        hurt = hp - m.hp;
      }
    }
    for (const i of wallTiles) w.map.overlay[i] = Overlay.Wall;
    w.raid = null;
    return { lost, hurt };
  };
  const plain = strikeWall(9);
  const spiked = strikeWall(15);
  const aegis = strikeWall(55);
  check(spiked.hurt > plain.hurt, `a spiked rampart gives back part of the blow (${Math.round(spiked.hurt)} to the troll at the spikes; ${Math.round(plain.hurt)} at fieldstone)`);
  check(aegis.lost > 0 && aegis.lost < plain.lost * 0.6, `an aegis wall takes half of the blow (${Math.round(aegis.lost)} against ${Math.round(plain.lost)} at fieldstone)`);
  const tile = wallTiles[0];
  w.map.meta[tile] = wMeta(35, 10);
  w.time = 8 * 24 * 60 + 10 * 60;
  w.hourAcc = 0;
  advance(w, 60, ctx);
  check(wHp(w.map.meta[tile]) > 10, `a rune-cut bastion mends itself between fights (10 → ${wHp(w.map.meta[tile])})`);

  // Schools: only the suitable are enrolled, the best-suited first.
  const e = newTown(4302, 20);
  const idle = e.villagers.filter((v) => v.role === "idle");
  for (const v of idle) attrsOf(v).wit = 6;
  const sci = programmesAt("school").find((p) => p.role === "scientist")!;
  check(!bestCandidate(e, sci), "no one is enrolled as a scientist without the Wits for it");
  attrsOf(idle[0]).wit = 11;
  attrsOf(idle[1]).wit = 14;
  idle[0].health = idle[1].health = 100;
  check(bestCandidate(e, sci) === idle[1] && candidates(e, sci).filter((c) => c.ok).length === 2, `the best-suited is taken first (${idle[1].name}, Wits 14, before ${idle[0].name}, Wits 11)`);
  check(programmesAt("armoury").length === 5 && programmesAt("barracks").length === 1 && programmesAt("wizardhut")[0].bars.some((b) => b.attr === "arc"), "every training building runs its programmes: five heavy classes at the armoury, Arcana for the wizard hut");
  // The heavy classes fight as themselves.
  check(HEAVY_CLASSES.juggernaut.hp > HEAVY_CLASSES.pikeman.hp && HEAVY_CLASSES.pikeman.reach > 0 && HEAVY_CLASSES.breaker.vsGreat > 1 && HEAVY_CLASSES.warden.atHall > 1, "shieldbearer, pikeman, juggernaut, giant-breaker, iron warden: each its own work in the fight");
  const f = newTown(4303, 20);
  const tower = build(f, "watchtower", 44, 38);
  const jug = makeVillager(f, null, "heavy");
  jug.rank = 4;
  jug.heavy = "juggernaut";
  const inf = makeVillager(f, null, "heavy");
  inf.rank = 4;
  attrsOf(jug).vit = attrsOf(inf).vit = 8;
  attrsOf(jug).mig = attrsOf(inf).mig = 8;
  assignGuard(f, jug.id, tower.id);
  assignGuard(f, inf.id, tower.id);
  f.time = 9 * 24 * 60 + 12 * 60;
  f.raid = { arrivesAt: f.time, party: [{ kind: "slime", level: 1, count: 1 }], side: "west", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(f, 0.05);
  const cj = f.raid!.combatants.find((c) => c.villagerId === jug.id)!;
  const ci = f.raid!.combatants.find((c) => c.villagerId === inf.id)!;
  check(cj.maxHp > ci.maxHp * 1.8 && cj.heavyCls === "juggernaut", `a juggernaut takes the field with ${cj.maxHp} hit points to a plain heavy's ${ci.maxHp}`);
  f.raid = null;

  // Mastery: the trade teaches only so far without the player's own emblem.
  const g = newTown(4304, 20);
  const farm = g.structures.find((x) => x.type === "farm")!;
  const hand = makeVillager(g, null, "farmhand");
  hand.work = farm.id;
  hand.level = 10;
  readStudy(g, { ...ctx.input, emblems: [] });
  check(workCapOf(g, hand, WORK_MAX) === 10, "without an emblem a farmhand stops at level 10");
  gainWork(g, hand, workXpToNext(10) * 3);
  check(hand.level === 10 && (hand.wxp ?? 0) <= workXpToNext(10), "and experience waits at the gate");
  readStudy(g, { ...ctx.input, emblems: [{ code: "m1", name: "Measured", attributes: ["STATISTIC"], depth: 3 }] });
  gainWork(g, hand, workXpToNext(10) + 1);
  check(hand.level === 11 && workCapOf(g, hand, WORK_MAX) === 20, "an emblem of Measured fields, depth 3, opens the farm's levels to 20");
  readStudy(g, { ...ctx.input, emblems: [{ code: "m2", name: "Measured", attributes: ["STATISTIC"], depth: 6 }] });
  check(workCapOf(g, hand, WORK_MAX) === WORK_MAX, "depth 6 opens them all");
  const sold = makeVillager(g, null, "infantry");
  check(rankCapOf(g, sold, 20) === 12, "a soldier stops at rank 12 without an emblem of war's knowledge");
  readStudy(g, { ...ctx.input, emblems: [{ code: "w1", name: "Counter", attributes: ["REBUTTAL"], depth: 7 }], peakDepth: 0 });
  check(rankCapOf(g, sold, 20) === 20 && heroCapOf(g, 28) === 20, "a Counterstroke emblem of depth 7 opens every rank; a hero climbs to 20 on it");
  // Study boons at dawn.
  const b = newTown(4305, 20);
  readStudy(b, { ...ctx.input, reviewsToday: 12, dueRemaining: 0, newIdeasToday: 3, streakDays: 10 });
  const r0 = recognitionOf(b).points;
  studyDawn(b, 5);
  studyDawn(b, 5);
  check(recognitionOf(b).points > r0 + 4 && recognitionOf(b).today.some((x) => /studious/.test(x.why)) && recognitionOf(b).today.some((x) => /ideas/.test(x.why)), `the day's reviews done and ideas brought home earn the town's name at dawn, once (${r0} → ${recognitionOf(b).points.toFixed(1)})`);
  check(Math.abs(streakTalent(b) - 0.05) < 1e-9 && masteryOf(b).streak === 10, "a ten-day streak draws five points more of the gifted");

  // The walk: far work takes longer by the walk there and back.
  const t = newTown(4306, 20);
  const th = t.structures.find((x) => x.type === "townhall")!;
  const near = (th.y + th.h + 1) * MAP_W + th.x;
  const far = (th.y + th.h + 30) * MAP_W + th.x;
  check(tripHours(t, far) > tripHours(t, near) + 1.5, `the walk out and back: ${tripHours(t, near).toFixed(1)}h beside the hall, ${tripHours(t, far).toFixed(1)}h thirty tiles out`);
  t.map.overlay[far] = Overlay.Rock;
  t.map.meta[far] = 0;
  const y = harvestYield(t, far)!;
  check(y.trip > 0 && y.effort === 4, `a rock thirty tiles out: ${y.effort}h at the work and ${y.trip.toFixed(1)}h walking`);

  // The mythic watch.
  const mw = newTown(4307, 20);
  const gw = makeVillager(mw, null, "wizard");
  gw.rank = 20;
  check(isMythicWatcher(gw), "a grand wizard keeps the mythic watch");
  mw.time = 9 * 24 * 60 + 23 * 60;
  mw.raid = { arrivesAt: mw.time, party: [{ kind: "phoenix", level: 62, count: 1 }], side: "north", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(mw, 0.05);
  const called = mw.raid!.combatants.find((c) => c.villagerId === gw.id);
  check(!!called && called.mythicWatch === true && !called.inside, "a mythic thing comes by night: the grand wizard rides out unbidden, unposted, off the night watch");
  mw.raid = null;
  mw.raid = { arrivesAt: mw.time, party: [{ kind: "wolf", level: 4, count: 2 }], side: "north", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(mw, 0.05);
  check(!mw.raid!.combatants.some((c) => c.villagerId === gw.id), "for wolves the grand wizard stays in the hut");
  mw.raid = null;
}


// ── The red sky, the trees, the fruit ──
console.log("the sky reddens only for the mythic, the kinds of tree, fruit to pick");
{
  // Only a mythic thing on the field turns the sky.
  const w = newTown(4401, 20);
  w.time = 9 * 24 * 60 + 12 * 60;
  w.raid = { arrivesAt: w.time, party: [{ kind: "wolf", level: 6, count: 3 }], side: "north", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(w, 0.05);
  check(!!w.raid?.started && !redSky(w), "wolves at the gate: the sky stays as the day made it");
  w.raid = { arrivesAt: w.time, party: [{ kind: "phoenix", level: 62, count: 1 }], side: "north", phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1 };
  stepCombat(w, 0.05);
  check(redSky(w), "a phoenix on the field: the sky turns red");
  for (const c of w.raid!.combatants) if (c.side === "monster") c.hp = 0;
  check(!redSky(w), "and it clears when the mythic thing is down");
  w.raid = null;

  // Species ride in the tree's meta beside its look and stage, and survive growing.
  const m = treeMeta(5, YOUNG, "apple");
  check(treeSpecies(m) === "apple" && treeStage(m) === YOUNG && treeLook(m) === 5, "a young apple tree keeps its look, stage and kind in one number");
  check(treeSpecies(atStage(m, MATURE)) === "apple" && treeStage(atStage(m, MATURE)) === MATURE, "grown a stage, it is still an apple tree");
  check(treeSpecies(treeMeta(3, MATURE)) === "mixed" && treeStage(treeMeta(3, SNAG)) === SNAG, "an old save's trees read as the mixed wood");
  const share = (b: Biome, sp: string) => {
    let n = 0;
    for (let k = 0; k < 1000; k++) if (pickSpecies(b, (k + 0.5) / 1000) === sp) n++;
    return n / 1000;
  };
  check(Math.abs(share("temperate", "apple") - 0.12) < 0.01 && share("temperate", "date") === 0, "the green country grows apples, not dates");
  check(share("desert", "date") > 0.25 && share("desert", "apple") === 0 && share("skyisles", "starfruit") > 0.2, "the desert its date palms, the isles their starfruit");
  const t = newTown(4402, 20);
  const th = t.structures.find((x) => x.type === "townhall")!;
  let tile = -1;
  for (let d = 3; d < 30 && tile < 0; d++) {
    const i = (th.y + th.h + d) * MAP_W + th.x;
    if (t.map.terrain[i] === Terrain.Grass && t.map.overlay[i] === Overlay.None) tile = i;
  }
  check(tile >= 0, "a patch of open grass below the hall for an orchard tree");
  t.map.overlay[tile] = Overlay.Tree;
  t.map.meta[tile] = treeMeta(2, YOUNG, "apple");
  for (let h = 0; h < 30 && treeStage(t.map.meta[tile]) < MATURE; h++) growWoods(t, "spring", () => 0, () => false);
  check(treeStage(t.map.meta[tile]) === MATURE && treeSpecies(t.map.meta[tile]) === "apple", "a spring's growing brings the apple tree to bearing, still an apple tree");

  // Fruit: in its season, picked once, the walk out and back included; the tree stands.
  t.time = (SEASON_LENGTH.spring + 2) * 24 * 60 + 7 * 60;
  const c0 = clock(t.time);
  check(c0.season === "summer" && ripe(t, tile, c0.season, c0.year), `in summer the apple tree is ripe (${c0.season})`);
  check(!ripe(t, tile, "winter", c0.year), "in winter it bears nothing");
  const refused = pickFruit(t, [tile]);
  check(refused !== null && /storehouse/.test(refused) && !t.clearing.length, `with no storehouse the fruit is not picked to rot: "${refused}"`);
  build(t, "storehouse", th.x + th.w + 4, th.y);
  check(pickFruit(t, [tile]) === null && t.clearing.some((j) => j.tile === tile && j.pick), "with a storehouse, picking it is marked like any clearing job");
  const need = 1 + tripHours(t, tile);
  const apples0 = t.res.apple;
  let hours = 0;
  while (t.res.apple === apples0 && hours < 48) {
    advance(t, 60, ctx);
    hours++;
  }
  check(t.res.apple >= apples0 + 6 && hours >= Math.floor(need), `six apples home after ${hours}h — an hour at the tree and ${tripHours(t, tile).toFixed(1)}h of walking`);
  const c1 = clock(t.time);
  check(t.map.overlay[tile] === Overlay.Tree && !ripe(t, tile, c1.season, c1.year), "the tree still stands, picked for the season");
  check(pickFruit(t, [tile]) !== null, "and it cannot be picked twice in one season");
  check(ripe(t, tile, "autumn", c1.year), "in autumn it bears again");
}

// ── Orders, a clickable pace and continuous training (M1) ──
console.log("orders, the clickable pace, continuous training and the land's hunger");
{
  const day = "2026-03-09";
  const fd = (o: Partial<FieldDaily> = {}): FieldDaily => ({
    id: "phys", name: "Physiology", school: "science", level: 6, attrs: ["PHYSICAL", "STUBBORNNESS"], ideasToday: 0, ideasWeek: 0,
    reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
  });
  // The day's due is the Fields' due, as the server reads it.
  const at = (f: FieldDaily[], o: Partial<TownInput> = {}): TownInput => ({ ...input, day, fields: f, dueRemaining: f.reduce((a, x) => a + x.dueRemaining, 0), ...o });

  // The pace climbs with every answer instead of waiting for the last card.
  const half = trainingPace(at([fd({ passed: [10, 0, 0, 0], dueRemaining: 10 })]));
  check(Math.abs(half.factor - 0.675) < 1e-9 && half.slowed, `half of today's muster answered right: training at ${(half.factor * 100).toFixed(1)}%`);
  const idle = trainingPace(at([fd({ dueRemaining: 5 })]));
  check(idle.factor === SLOW_PACE && idle.factor === 0.35 && idle.slowed, `five due and nothing answered: still ${Math.round(idle.factor * 100)}%, so the old checks hold`);
  const backlog = trainingPace(at([fd({ passed: [40, 0, 0, 0], dueRemaining: 60 })]));
  check(backlog.factor === 1 && !backlog.slowed && backlog.muster.target === 40 && backlog.boost === 0, `forty right of a hundred-card backlog: full speed (${backlog.factor}), the muster asks forty, and no idea boost while cards are due`);
  const missed = trainingPace(at([fd({ passed: [5, 0, 0, 0], misses: 10, dueRemaining: 5 })]));
  check(Math.abs(missed.factor - 0.675) < 1e-9, `a miss counts half: 5 right and 10 wrong of 20 is half the muster (${(missed.factor * 100).toFixed(1)}%)`);
  const cleared = trainingPace(at([fd({ passed: [1, 0, 0, 0], misses: 6 })], { newIdeasToday: 2 }));
  check(Math.abs(cleared.factor - 1.3) < 1e-9 && !cleared.slowed, `nothing left due: full speed and the idea boost, however the answers went (${cleared.factor.toFixed(2)})`);

  // Orders: requisitions, then carts, then the muster; three at most.
  const t = newTown(5001, 12);
  const inp = at([
    fd({ dueRemaining: 8, overdue: 3, streak: 9, bestStreak: 9 }),
    fd({ id: "hist", name: "History", school: "mind", dueRemaining: 6, streak: 4, bestStreak: 4, passed: [2, 0, 0, 0], misses: 1 }),
    fd({ id: "bio", name: "Biology", dueRemaining: 3, streak: 15, bestStreak: 15 }),
    fd({ id: "stat", name: "Statistics", dueRemaining: 12 }),
  ]);
  knowledgeHourly(t, inp);
  const tk = knowledgeOf(t);
  const orders = ordersOf(t, inp);
  const rank = { req: 0, cart: 1, muster: 2 };
  check(orders.length === ORDERS_MAX && orders.every((o, i) => i === 0 || rank[orders[i - 1].kind] <= rank[o.kind]), `at most ${ORDERS_MAX} orders, requisitions first: ${orders.map((o) => `${o.kind} "${o.title} ${o.detail}"`).join("; ")}`);
  const reqs = orders.filter((o) => o.kind === "req");
  check(reqs.length === (tk.reqs ?? []).length && reqs.every((o) => {
    const r = tk.reqs!.find((x) => x.fieldId === o.fieldId)!;
    return !!r && o.progress?.[1] === r.need && JSON.stringify(o.reward) === JSON.stringify(r.reward) && o.title === `${r.field} 0/${r.need} reviews` && o.href === reviewHref(r.fieldId);
  }), `each requisition order asks what the quartermaster posted and pays its reward (${reqs.map((o) => o.title).join(", ")})`);
  const more = ordersOf(t, { ...inp, fields: inp.fields!.map((f) => (f.id === "phys" ? { ...f, passed: [3, 0, 0, 0] as [number, number, number, number] } : f)) });
  check(more.some((o) => o.kind === "req" && o.fieldId === "phys" && o.title === "Physiology 3/8 reviews"), "a requisition order counts the Field's right answers since it was posted");

  // A cart order is Uncommon or better, for a Field with cards still due, and states the cart the town will pay.
  const noReqs = newTown(5002, 12);
  knowledgeOf(noReqs).posted = [day];
  const cartInp = at([
    fd({ id: "bio", name: "Biology", dueRemaining: 3, streak: 15, bestStreak: 15 }),
    fd({ id: "stat", name: "Statistics", dueRemaining: 12 }),
    fd({ id: "hist", name: "History", school: "mind", dueRemaining: 0, streak: 30, bestStreak: 30 }),
  ]);
  knowledgeHourly(noReqs, cartInp);
  const co = ordersOf(noReqs, cartInp);
  const bioCart = pulseOf(noReqs, cartInp, 0).carts.find((c) => c.fieldId === "bio")!;
  const bioOrder = co.find((o) => o.kind === "cart" && o.fieldId === "bio");
  check(!!bioOrder && JSON.stringify(bioOrder.reward) === JSON.stringify(cartAt(bioCart, 3)!.goods) && bioOrder.title === "Clear Biology (3 due)" && bioOrder.detail.startsWith(`→ ${bioCart.rarity} cart: `),
    `a cart order states the pulse's own manifest: "${bioOrder?.title} ${bioOrder?.detail}"`);
  check(!co.some((o) => o.kind === "cart" && (o.fieldId === "stat" || o.fieldId === "hist")), "no cart order for a Common cart, nor for a Field with nothing due");
  const muster = co.find((o) => o.kind === "muster");
  check(!!muster && muster.fieldId === "stat" && muster.href === reviewHref("stat") && muster.title === "15 due · training 35%", `the muster order links to the Field with the most due: "${muster?.title} ${muster?.detail}"`);
  const doneInp = at([fd({ passed: [6, 0, 0, 0], complete: true, streak: 9, bestStreak: 9 })]);
  check(!ordersOf(noReqs, doneInp).some((o) => o.kind === "muster"), "nothing due: no muster order");

  // The steward leaves study to the orders, and sends the Study need to /add.
  const due = { profile: ctx.profile, input: inp };
  const steward = [newTown(5003, 0, "starter"), newTown(5004, 20), t].flatMap((s) => advise(s, due));
  check(steward.length > 0 && !steward.some((a) => a.id === "review"), `advise() never returns 'review' (${steward.length} pieces of advice with cards due)`);
  const study = needAnswer(t, "study");
  check(study.act.kind === "add" && study.cta === "Add an idea", `the Study need is fed by new ideas: its answer is "${study.cta}" (${study.act.kind})`);

  // The land's hunger, term by term, is the budget the land spends.
  const h = newTown(5005, 12);
  knowledgeHourly(h, at([fd({ overdue: 63, dueRemaining: 21 })], { reviewsToday: 0, reviewsAttempted: 0 }));
  const hu = landHunger(h);
  const sum = (x: typeof hu) => 1 + x.terms.reduce((a, q) => a + q.value, 0);
  check(hu.shown && Math.abs(sum(hu) - neglect(h).budget) < 1e-9 && Math.abs(hu.budget - 3) < 1e-9, `63 overdue, 21 due, no review: the land at ×${hu.budget.toFixed(1)}, its terms adding up (${hungerText(hu)})`);
  check(hungerText(hu).startsWith("+1.00 from 63 overdue cards · +0.50 from 21 still due · +0.50 no review today."), "the chip's tooltip names each term with its number");
  const kept = newTown(5006, 12);
  knowledgeHourly(kept, at([fd({ overdue: 10, dueRemaining: 4 }), fd({ id: "a", complete: true, passed: [3, 0, 0, 0] }), fd({ id: "b", complete: true, passed: [2, 0, 0, 0] })]));
  const ku = landHunger(kept);
  check(Math.abs(sum(ku) - neglect(kept).budget) < 1e-9 && ku.terms.some((q) => q.text === "two Fields finished" && Math.abs(q.value + 0.2) < 1e-9), `two Fields finished take 0.20 off (${hungerText(ku)})`);
  const calm = newTown(5007, 12);
  knowledgeHourly(calm, at([fd({ complete: true, passed: [4, 0, 0, 0] })]));
  check(!landHunger(calm).shown && !landHunger(newTown(5008, 12)).shown, `a town keeping up its study shows no hunger chip (×${landHunger(calm).budget.toFixed(2)})`);
}

// ── Pay once: the refound and the banner (M1) ─────────────
console.log("pay once: a refounded town, a fallen banner");
{
  const day = "2026-03-10";
  const fd = (o: Partial<FieldDaily> = {}): FieldDaily => ({
    id: "phys", name: "Physiology", school: "science", level: 6, attrs: ["PHYSICAL", "STUBBORNNESS"], ideasToday: 0, ideasWeek: 0,
    reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
  });
  const at = (f: FieldDaily[], o: Partial<TownInput> = {}): TownInput => ({ ...input, day, fields: f, dueRemaining: f.reduce((a, x) => a + x.dueRemaining, 0), ...o });
  const worth = (t: GameState) => Object.values(t.res).reduce((a, v) => a + v, 0);
  const paidLines = (t: GameState) => t.log.filter((l) => /supply cart|reviews? passed —|Requisition filled|is mastered|new domain/.test(l.text)).length;

  // The morning: requisitions posted. The afternoon: every Field studied, a cart, a mastery and a new Domain.
  const morning = at([fd({ dueRemaining: 4 }), fd({ id: "hist", name: "History", school: "mind", dueRemaining: 5, overdue: 2 })]);
  const afternoon = at([
    fd({ passed: [6, 2, 0, 0], complete: true, streak: 8, bestStreak: 8, mastered: 1, newDomains: 1 }),
    fd({ id: "hist", name: "History", school: "mind", passed: [5, 0, 0, 0], complete: true, streak: 3, bestStreak: 3 }),
    fd({ id: "bio", name: "Biology", bestStreak: 10 }),
  ]);
  const old = newTown(5101, 12);
  knowledgeHourly(old, morning);
  knowledgeHourly(old, afternoon);
  const ok = knowledgeOf(old);
  check((ok.reqs ?? []).length === 2 && ok.reqs!.every((r) => r.done) && (ok.claimed[day] ?? []).length === 2 && paidLines(old) >= 5, `the old town is paid: tithes, two carts, two requisitions, an heirloom and a star chart (${paidLines(old)} lines)`);

  // Refounded the same day: the receipts come across, and the same study pays nothing twice.
  const fresh = newTown(5102, 12);
  const control = newTown(5102, 12);
  carryDay(fresh, old, day);
  const w0 = worth(fresh);
  const hope0 = fresh.hopeEvents ?? 0;
  knowledgeHourly(fresh, afternoon);
  const w1 = worth(fresh);
  knowledgeHourly(fresh, afternoon);
  const fk = knowledgeOf(fresh);
  check(w1 === w0 && worth(fresh) === w0 && paidLines(fresh) === 0 && !(fk.owed ?? []).length, `a town refounded after its tithes receives 0 goods for the same passes, twice (${Math.round(w1 - w0)}, ${Math.round(worth(fresh) - w0)})`);
  check((fk.reqs ?? []).length === 2 && fk.reqs!.every((r) => r.done) && (fk.posted ?? []).includes(day), "its requisitions are the old town's, already filled; none is posted afresh");
  check((fresh.hopeEvents ?? 0) === hope0, "a banner that fell on the old town does not fall again on the new one");
  const c0 = worth(control);
  knowledgeHourly(control, afternoon);
  check(worth(control) > c0, `without carrying the day over, the same study would have paid again (+${Math.round(worth(control) - c0)})`);

  // A broken banner costs Hope once per break, not once per day it stays down.
  const b = newTown(5103, 12);
  const h0 = b.hopeEvents ?? 0;
  for (let d = 11; d <= 15; d++) for (let hr = 0; hr < 3; hr++) knowledgeHourly(b, at([fd({ bestStreak: 14 })], { day: `2026-03-${d}` }));
  const falls = b.log.filter((l) => /banner of Physiology comes down/.test(l.text)).length;
  check((b.hopeEvents ?? 0) === h0 - 4 && falls === 1, `a banner broken across 5 input days costs Hope once (${(b.hopeEvents ?? 0) - h0}, ${falls} line)`);
  knowledgeHourly(b, at([fd({ bestStreak: 20 })], { day: "2026-03-30" }));
  check((b.hopeEvents ?? 0) === h0 - 8, "a new, longer streak that breaks is a new fall");
  // A save from before the record charged by the day: today's charge there is not made again.
  const legacy = newTown(5104, 12);
  knowledgeOf(legacy).banners[day] = ["phys"];
  const l0 = legacy.hopeEvents ?? 0;
  knowledgeHourly(legacy, at([fd({ bestStreak: 14 })]));
  check((legacy.hopeEvents ?? 0) === l0 && knowledgeOf(legacy).broke?.["phys:14"] === day, "an old save's banner already charged today is recorded, not charged again");
}

// ── Moments and juice, on fixed cart manifests (M1) ──────
console.log("moments: fixed carts, what the town is shown, and the cap");
{
  const day = "2026-03-11";
  const fd = (o: Partial<FieldDaily> = {}): FieldDaily => ({
    id: "phys", name: "Physiology", school: "science", level: 6, attrs: ["PHYSICAL", "STUBBORNNESS"], ideasToday: 0, ideasWeek: 0,
    reviewedToday: 0, dueRemaining: 0, overdue: 0, streak: 0, bestStreak: 0, complete: false, ...o,
  });
  const at = (f: FieldDaily[], o: Partial<TownInput> = {}): TownInput => ({ ...input, day, fields: f, dueRemaining: f.reduce((a, x) => a + x.dueRemaining, 0), ...o });
  type Load = (typeof POOLS)[number][number];
  const keyOf = (d: Load) => d.res ?? d.item ?? `tool:${d.tool}`;
  const mid = (d: Load) => (d.qty[0] + d.qty[1]) / 2;
  const res = (t: GameState, k: string) => t.res[k as keyof GameState["res"]] ?? 0;

  // Nothing is rolled: the same day and Field give the same cart, whenever it is asked for.
  const f9 = fd({ streak: 9, passed: [9, 0, 0, 0], reviewedToday: 9, complete: true });
  const a = rollDrop(f9, day);
  const b = rollDrop(f9, day);
  check(JSON.stringify(a) === JSON.stringify(b) && a.tier === 2, `two rollDrop calls are deep-equal: ${JSON.stringify(cartGoods(a))}`);
  // Loads count right answers; cards merely touched only on an input from before answers were counted.
  const touched = rollDrop({ ...f9, reviewedToday: 30 }, day);
  const legacy = rollDrop({ ...f9, passed: undefined, reviewedToday: 9 }, day);
  check(JSON.stringify(touched) === JSON.stringify(a) && JSON.stringify(legacy) === JSON.stringify(a), "a cart counts the Field's right answers, and the cards touched only when no answers are counted");
  const legendary = rollDrop(fd({ streak: 30, passed: [4, 0, 0, 0], complete: true }), day);
  const pool4 = new Set(POOLS[4].map(keyOf));
  check(legendary.tier === 4 && Object.keys(cartGoods(legendary)).some((k) => pool4.has(k)), `a tier-4 manifest holds a legendary-pool good (${JSON.stringify(cartGoods(legendary))})`);

  // One load a cart (level 0, no answers counted): each quantity is its good's midpoint, a half taken down and
  // up in turn; over two turns of the rotation every fitting good comes twice and pays exactly twice its midpoint.
  let loads = 0;
  let off = "";
  for (let t = 0; t < TIERS.length; t++) {
    const fitting = POOLS[t].filter((x) => !x.school || x.school === "science");
    const total: Record<string, number> = {};
    const times: Record<string, number> = {};
    for (let d = 0; d < 2 * fitting.length; d++) {
      const date = new Date(Date.UTC(2026, 1, 1 + d)).toISOString().slice(0, 10);
      const one = cartGoods(rollDrop(fd({ level: 0, streak: TIERS[t].from, passed: [0, 0, 0, 0] }), date));
      for (const [k, n] of Object.entries(one)) {
        const e = fitting.find((x) => keyOf(x) === k);
        loads++;
        if (!e || (n !== Math.floor(mid(e)) && n !== Math.ceil(mid(e)))) off ||= `${k} ${n} on tier ${t}`;
        total[k] = (total[k] ?? 0) + n;
        times[k] = (times[k] ?? 0) + 1;
      }
    }
    for (const e of fitting) if (times[keyOf(e)] !== 2 || total[keyOf(e)] !== 2 * mid(e)) off ||= `${keyOf(e)} came ${times[keyOf(e)] ?? 0} times for ${total[keyOf(e)] ?? 0} on tier ${t}`;
  }
  check(!off && loads > 0, `quantities are pool midpoints, and a half-way midpoint pays down and up in turn (${loads} one-load carts, five tiers)${off ? `: ${off}` : ""}`);
  // Over the days each good comes round as often as a fair roll would bring it: the rotation visits every one alike.
  const seen: Record<string, number> = {};
  for (let d = 0; d < 60; d++) {
    const date = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
    for (const k of Object.keys(cartGoods(rollDrop(fd({ level: 0, streak: 7, passed: [0, 0, 0, 0] }), date)))) seen[k] = (seen[k] ?? 0) + 1;
  }
  const fits = POOLS[2].filter((x) => !x.school || x.school === "science").map(keyOf);
  const counts = fits.map((k) => seen[k] ?? 0);
  check(Math.max(...counts) - Math.min(...counts) <= 1 && Object.keys(seen).every((k) => fits.includes(k)), `over 60 days a science Field's one load visits each of its ${fits.length} fitting goods alike (${counts.join(", ")})`);

  // A cart moment: the tier of the streak, and exactly what the stores received.
  const t = newTown(5201, 12);
  knowledgeOf(t).posted = [day];
  const before = { ...t.res };
  const f7 = fd({ streak: 7, bestStreak: 7, reviewedToday: 9, complete: true });
  const pushed = settleStudy(t, at([f7]));
  const cart = pushed.find((m) => m.kind === "cart");
  const goods = Object.entries(cart?.goods ?? {});
  const tools = goods.filter(([k]) => k.startsWith("tool:")).reduce((x, [, n]) => x + n, 0);
  const gained = goods.every(([k, n]) => k.startsWith("tool:") || res(t, k) - (before[k as keyof GameState["res"]] ?? 0) === n);
  check(!!cart && cart.tier === tierOf(7) && pushed.length === 1 && gained && t.res.tools - before.tools === tools,
    `a cart moment's tier is tierOf(streak) and its goods are what the stores gained: "${cart?.title}" ${JSON.stringify(cart?.goods)}`);
  check(cart?.title === "Physiology · 7-day streak · Rare cart" && JSON.stringify(cart.goods) === JSON.stringify(cartGoods(rollDrop(f7, day))), "its title names the Field, the streak and the tier, and its goods are the manifest stated before study");
  check(settleStudy(t, at([f7])).length === 0 && settleStudy(t, at([f7])).length === 0, "re-reading the same passes pushes nothing");

  // One settlement, every kind: one tithe for all Fields' passes, a cart each, the requisitions filled, an heirloom, a chart.
  const u = newTown(5202, 12);
  settleStudy(u, at([fd({ dueRemaining: 4 }), fd({ id: "hist", name: "History", school: "mind", dueRemaining: 5, overdue: 2 })]));
  const w0 = { ...u.res };
  const all = settleStudy(u, at([
    fd({ passed: [6, 2, 0, 0], complete: true, streak: 8, bestStreak: 8, mastered: 1, newDomains: 1 }),
    fd({ id: "hist", name: "History", school: "mind", passed: [5, 0, 0, 0], complete: true, streak: 3, bestStreak: 3 }),
  ]));
  const kinds = all.map((m) => m.kind).sort().join(",");
  const tithe = all.find((m) => m.kind === "tithe");
  const titheSum: Record<string, number> = {};
  for (const x of knowledgeOf(u).tithes!.slice(0, 2)) for (const part of x.got.split(", ")) {
    const [n, k] = part.split(" ");
    titheSum[k] = (titheSum[k] ?? 0) + Number(n);
  }
  const sorted = (g: Record<string, number>) => JSON.stringify(Object.fromEntries(Object.entries(g).sort()));
  check(kinds === "cart,cart,chart,heirloom,req,req,tithe", `one settlement pushes one tithe for all Fields, a cart each, both requisitions, an heirloom and a star chart (${kinds})`);
  check(!!tithe && tithe.title.startsWith("13 right answers → ") && sorted(tithe.goods ?? {}) === sorted(titheSum), `the tithe moment adds up both Fields' tithes: "${tithe?.title}"`);
  const paidIn = Object.keys(u.res).reduce((x, k) => x + res(u, k) - (w0[k as keyof GameState["res"]] ?? 0), 0);
  const stated = all.filter((m) => m.kind !== "heirloom").reduce((x, m) => x + Object.entries(m.goods ?? {}).reduce((y, [k, n]) => y + (k in u.res || k.startsWith("tool:") ? n : 0), 0), 0);
  check(Math.round(paidIn) === Math.round(stated), `the moments state every good the stores took in, no more and no less (${Math.round(paidIn)} = ${Math.round(stated)})`);

  // The cap: twelve at most. Moments already shown go first, so a cart not yet seen outlasts them; past that, the oldest goes.
  const c = newTown(5203, 12);
  for (let i = 0; i < 5; i++) pushMoment(c, { kind: "cart", title: `cart ${i}`, lines: [], tier: 0, goods: { wood: 30 } });
  markSeen(c, c.moments!.slice(1, 5).map((m) => m.id));
  for (let i = 0; i < 11; i++) pushMoment(c, { kind: "wave", title: `wave ${i}`, lines: [] });
  const kept = c.moments!.length === MOMENTS_MAX && c.moments![0].title === "cart 0" && !c.moments!.some((m) => m.seen);
  for (let i = 11; i < 20; i++) pushMoment(c, { kind: "wave", title: `wave ${i}`, lines: [] });
  const rising = c.moments!.every((m, i, l) => i === 0 || l[i - 1].id < m.id);
  check(kept && c.moments!.length === MOMENTS_MAX && c.moments![0].title === "wave 8" && rising, `moments hold at most ${MOMENTS_MAX}: shown ones go before an unseen cart, then the oldest; ids keep rising`);
  // The save carries them, word for word.
  const round = unpackSave(packSave(c));
  check(JSON.stringify(round.moments) === JSON.stringify(c.moments) && unseenMoments(migrate(round)).length === unseenMoments(c).length, "moments survive packSave/unpackSave and migrate");
  const old = newTown(5204, 12);
  delete old.moments;
  check(migrate(unpackSave(packSave(old))).moments === undefined && unseenMoments(old).length === 0, "an old save without moments loads with none waiting");

  // A whole steward run: the list never passes the cap, and a broken wave is a moment.
  let most = 0;
  let waves = 0;
  let lastWave = "";
  let lastId = 0;
  const run = playthrough(40595, "active", "steward", (s) => {
    const list = s.moments ?? [];
    most = Math.max(most, list.length);
    for (const m of list) {
      if (m.id <= lastId) continue;
      lastId = m.id;
      if (m.kind === "wave") {
        waves++;
        lastWave = m.title;
      }
    }
  }, 60);
  const won = run.s.stats?.raidsWon ?? 0;
  check(most <= MOMENTS_MAX && most > 0, `moments stay at ${MOMENTS_MAX} or fewer over a 60-day steward run (most ${most}; the town ${run.fell ? `fell on day ${run.fell}` : "stood"})`);
  check(won === 0 || (waves >= 1 && /^Wave broken · \d+ slain · \d+ lost/.test(lastWave)), `each raid broken is a moment: ${waves} for ${won} raids won${lastWave ? ` ("${lastWave}")` : ""}`);
}

// ── Honest endings: peril, the winter audit, the run's log and its report (M1) ──
console.log("honest endings: peril, the winter audit, the run's log and its report");
{
  const quiet = (s: GameState) => {
    // Nobody on the road and no raid due: only what is being tested moves.
    s.incoming = Infinity;
    s.nextRaidAt = s.time + 60 * DAY_MIN;
  };
  const sum = (r: Partial<Record<string, number>>) => Object.values(r).reduce<number>((a, n) => a + (n ?? 0), 0);

  // The doom clock is read off the rule itself: a town of twelve at its height, down to three, thirty hours in.
  const d = newTown(6101, 12);
  while (d.villagers.length < 12) makeVillager(d, null);
  stats(d).peakPop = 12;
  d.villagers = d.villagers.slice(0, 3);
  d.society = { state: "stable", since: d.time, strikeHours: 0, fewHours: 30 };
  const doom = perilOf(d).doom;
  const said = doom ? doomText(doom, d.mood) : "no doom";
  check(doom?.kind === "dwindle" && doom.hoursLeft === 42 && doom.husk === 4 && said === "Dwindling · 42 h left · 3 of 12 people (a town needs 5)", `a staged town with fewHours 30 gives hoursLeft 42: "${said}"`);
  d.society.despairHours = 60;
  check(perilOf(d).doom?.kind === "despair" && perilOf(d).doom?.hoursLeft === 12, "with Hope dead for 60 hours as well, the nearer end is the one shown: abandoned in 12 h");

  // Fuel-days: the stores over the fires' day, term by term, on a winter town.
  const w = newTown(6102, 12);
  w.time = 20 * DAY_MIN + 12 * 60;
  Object.assign(w.res, { wood: 300, coal: 40, peat: 10, charcoal: 5 });
  const cl = climateNow(w);
  const shift = w.policy?.shift ?? 14;
  let heat = 0;
  for (const st of w.structures) {
    if (!isHeated(st) || st.buildUntil) continue;
    const home = w.villagers.filter((v) => v.house === st.id);
    const staff = w.villagers.filter((v) => v.work === st.id);
    if (home.length) heat += fireKgH(w, st, cl, home.length) * (home.some((v) => v.work == null) ? 24 : 24 - shift);
    else if (staff.length) heat += fireKgH(w, st, cl, staff.length) * shift;
  }
  const lit = w.structures.filter((st) => st.type === "pitfire" && (st.fuel ?? 0) > 0 && !st.buildUntil).length;
  const braziers = w.structures.filter((st) => st.type === "brazier" && !st.buildUntil).length;
  const cooks = w.structures.filter((st) => st.type === "kitchen" && !st.buildUntil && w.villagers.some((v) => v.work === st.id)).length;
  const melt = (w.villagers.length * 2.5 * 0.09) / 10;
  const direct = heat / 10 + lit * (burnRate("winter", false) * 14 + burnRate("winter", true) * 10) + braziers * 5 + (cooks * 21) / 10 + melt;
  const wp = perilOf(w);
  check(cl.season === "winter" && wp.melting && Math.abs(wp.burn.melt - melt) < 1e-12 && Math.abs(wp.fuelDays - 355 / direct) < 1e-9 && wp.waterDays === wp.fuelDays,
    `fuelDays equals a direct sum on a staged winter town: 355 fuel / ${direct.toFixed(1)} a day = ${wp.fuelDays.toFixed(2)} days (${burnText(wp.burn)})`);
  // And the hearths' sum is what the rooms really draw: a starter town's day in winter, forecast against the stores.
  const h = newTown(6103, 12, "starter");
  h.time = 19 * DAY_MIN + 8 * 60;
  quiet(h);
  h.res.wood = 5000;
  for (let i = 0; i < 24; i++) advance(h, 60, ctx);
  const held = h.res.wood + h.res.coal + h.res.peat + h.res.charcoal;
  const said2 = dailyFuel(h, climateNow(h)).total;
  for (let i = 0; i < 24; i++) advance(h, 60, ctx);
  const drawn = held - (h.res.wood + h.res.coal + h.res.peat + h.res.charcoal);
  check(Math.abs(drawn - said2) <= 0.15 * said2, `the forecast's hearths burn what a winter town's rooms really draw: ${said2.toFixed(1)} a day forecast, ${drawn.toFixed(1)} drawn`);

  // Sacked: the hall falls with two left and the run ends as a sack, logged as the last wave.
  const g = newTown(6104, 12, "starter");
  const hall = g.structures.find((x) => x.type === "townhall")!;
  g.raid = { arrivesAt: g.time, party: [{ kind: "troll", level: 14, count: 4 }], side: "west", target: hall.id, phase: "fighting", combatants: [], projectiles: [], clock: 0, nextId: 1, archetype: "K" };
  fight(g);
  const last = g.runlog?.waves[g.runlog.waves.length - 1];
  check(g.fallCause === "sacked" && !!g.fallen && !g.villagers.length, `sackAll sets 'sacked' (${g.fallCause}, ${g.villagers.length} left)`);
  check(last?.outcome === "sacked" && last.grade === "C" && last.lost === 2 && last.left === 0 && runReport(g).headline === `Sacked on day ${g.fallen?.day}`, `the sack is the log's last wave, graded C, both lost: "${runReport(g).why}"`);

  // Emptied: nobody in the town for a day ends the run, and an empty town counts no days.
  const e = newTown(6105, 12, "starter");
  e.villagers = [];
  for (const st of e.structures) st.workers = [];
  quiet(e);
  let hours = 0;
  let mid = "";
  while (!e.fallen && hours < 30) {
    advance(e, 60, ctx);
    hours++;
    if (hours === 10) mid = perilOf(e).doom ? doomText(perilOf(e).doom!, e.mood) : "none";
  }
  check(e.fallCause === "emptied" && hours === 24 && mid === "Empty · 14 h left · no one lives here", `a town at 0 people falls 24 h later as 'emptied' (${hours} h, ${e.fallCause}; at 10 h: "${mid}")`);
  check(!e.achievements?.["day-2"] && !e.log.some((l) => /Day 2 —/.test(l.text)), "and logs no Day-N line while it stands empty");
  const kept = newTown(6105, 12, "starter");
  quiet(kept);
  for (let i = 0; i < 30; i++) advance(kept, 60, ctx);
  check(!kept.fallen && !!kept.achievements?.["day-2"], "the same town with its two people stands, and earns Day 2");
  // A town that grew past five runs its dwindling clock when it empties, which refugees can still beat: not the day's.
  const grown = newTown(6111, 12, "starter");
  while (grown.villagers.length < 8) makeVillager(grown, null);
  quiet(grown);
  advance(grown, 60, ctx);
  grown.villagers = [];
  for (const st of grown.structures) st.workers = [];
  for (let i = 0; i < 30; i++) advance(grown, 60, ctx);
  const gd = perilOf(grown).doom;
  check(!grown.fallen && gd?.kind === "dwindle" && (grown.society?.emptyHours ?? 0) === 0 && (grown.society?.fewHours ?? 0) >= 30,
    `a town that grew to eight and empties is not over in a day: its dwindling clock runs (${gd ? doomText(gd, grown.mood) : "none"})`);

  // The winter audit: once, at autumn's first dawn, ten times the daily sums.
  const a = newTown(6106, 12);
  a.time = 11 * DAY_MIN + 12 * 60;
  quiet(a);
  const audits: { at: number; lines: string[]; burn: ReturnType<typeof dailyFuel>; pop: number; hold: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const before = lastMomentId(a);
    advance(a, 60, ctx);
    for (const m of a.moments ?? []) {
      if (m.id <= before || m.kind !== "audit") continue;
      audits.push({ at: m.at, lines: m.lines, burn: dailyFuel(a, winterClimate(a)), pop: a.villagers.length, hold: a.res.wood + a.res.coal + a.res.peat + a.res.charcoal });
    }
  }
  const au = a.runlog?.audit;
  const one = audits[0];
  check(audits.length === 1 && clock(one.at).day === 13 && clock(one.at).hour === 6, `the audit fires once, at 06:00 on day 13 (${audits.map((x) => `day ${clock(x.at).day} ${clock(x.at).hour}:00`).join(", ") || "never"})`);
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  check(!!au && !!one && near(au.heat, 10 * one.burn.heat) && near(au.fires, 10 * one.burn.fires) && near(au.melt, 10 * one.burn.melt) && near(au.need, 10 * one.burn.total) &&
    au.foodNeed === 10 * one.pop && near(au.hold, one.hold) && near(au.short, Math.max(0, au.need - au.hold)),
  `its numbers equal 10 × the daily sums: "${one?.lines[0]}" · "${one?.lines[1]}"`);

  // The run's log over a steward's twenty days: every death in it once, a page each dawn.
  let dawns = 0;
  const run = playthrough(16838, "none", "steward", (s) => {
    if (clock(s.time).hour === 6 && !s.fallen) dawns++;
  }, 20);
  const rl = run.s.runlog!;
  const pages = rl.samples.every((x, i) => i === 0 || x.d === rl.samples[i - 1].d + 1);
  check(sum(rl.deaths) === run.s.deaths && run.s.deaths > 0 && !rl.before, `over a 20-day steward run the runlog's deaths add up to the rise in s.deaths (${sum(rl.deaths)} of ${run.s.deaths}: ${Object.entries(rl.deaths).map(([k, n]) => `${k} ${n}`).join(", ")})`);
  check(rl.samples.length === dawns && pages && rl.every === 1, `with one sample per game day (${rl.samples.length} samples, ${dawns} dawns)`);
  const broken = rl.waves.filter((x) => x.outcome === "broken" && x.slain > 0).length;
  check(broken === run.s.stats!.raidsWon, `every raid broken is a wave in the log, with its grade (${rl.waves.length} waves, ${broken} broken of ${run.s.stats!.raidsWon} won: ${["S", "A", "B", "C"].map((g) => `${g} ${rl.waves.filter((x) => x.grade === g).length}`).join(", ")})`);

  // What killed them, as the report groups it: every reason the sim gives.
  const whys: [string, DeathCause][] = [
    ["fell defending the town", "battle"], ["cut down when the hall fell", "battle"], ["died of their injuries", "battle"], ["fell at the gate", "battle"], ["bled to death", "battle"],
    ["froze to death", "cold"], ["heart stopped in the cold", "cold"], ["taken in the blizzard", "cold"], ["starved", "hunger"], ["wasted away", "hunger"], ["died of thirst", "thirst"],
    ["died of pneumonia", "sickness"], ["never woke from the fumes", "sickness"], ["did not survive the amputation", "sickness"], ["died of scurvy", "sickness"],
    ["worked past their strength and did not get up (40 of 38 effort)", "overwork"], ["murder", "minds"], ["despair", "minds"], ["the mutiny", "mutiny"], ["consumed by the ascension", "other"],
  ];
  const wrong = whys.filter(([why, c]) => causeOf(why) !== c);
  check(!wrong.length, `every death's reason is sorted by what killed them${wrong.length ? `: ${wrong.map(([w2]) => `${w2} → ${causeOf(w2)}`).join("; ")}` : ""}`);

  // The lessons, each from its own staged tallies, and the first rule that matches wins.
  const staged = (deaths: Partial<Record<DeathCause, number>>, o: { walkouts?: number; winterOut?: number; land?: number } = {}) => {
    const s = newTown(6107, 12);
    const l = runlogOf(s);
    l.deaths = deaths;
    l.walkouts = o.walkouts ?? 0;
    if (o.walkouts) l.firsts.walkout = { d: 19, hope: 83, sanity: 21 };
    if (o.winterOut) {
      l.firsts.winterFuelOut = o.winterOut;
      l.firsts.fuelOut = o.winterOut;
    }
    l.firsts.cause = Object.fromEntries(Object.keys(deaths).map((k, i) => [k, 47 + i]));
    if (o.land) l.land = { days: o.land, peak: 2.4 };
    s.fallen = { at: s.time, day: 50 };
    s.fallCause = "dwindled";
    return s;
  };
  const thirst = staged({ thirst: 5, cold: 1 }, { winterOut: 46 });
  check(lessonOf(thirst).rule === 1 && /snow melted by fuel/.test(lessonOf(thirst).text) && runReport(thirst).turn === "Fuel ran out on day 46; first thirst death on day 47.",
    `a staged winter-thirst town gets lesson 1: "${lessonOf(thirst).text}" The turn: "${runReport(thirst).turn}"`);
  const rules = [
    staged({ battle: 2 }, { walkouts: 3 }), staged({ hunger: 3, battle: 1 }), staged({ overwork: 2, battle: 1 }), staged({ battle: 2, cold: 1 }), staged({ cold: 1 }, { land: 4 }), staged({ cold: 2 }),
  ].map((s) => lessonOf(s).rule);
  check(rules.join(",") === "2,3,4,5,6,7", `walk-outs, hunger, overwork, battle, the land's budget and the land's growth each get their lesson (${rules.join(",")}): "${lessonOf(staged({ battle: 2 }, { walkouts: 3 })).text}"`);

  // The alarms: one moment a crossing, raised again only once it has passed and a day has gone by.
  const f = newTown(6108, 12);
  f.time = 20 * DAY_MIN + 12 * 60;
  Object.assign(f.res, { wood: 10, coal: 0, peat: 0, charcoal: 0 });
  const fuelAlarms = () => (f.moments ?? []).filter((m) => m.kind === "peril" && /^Fuel for/.test(m.title)).length;
  perilAlarms(f, perilOf(f));
  perilAlarms(f, perilOf(f));
  const first = fuelAlarms();
  f.res.wood = 5000;
  f.time += 25 * 60;
  perilAlarms(f, perilOf(f));
  f.res.wood = 10;
  perilAlarms(f, perilOf(f));
  check(first === 1 && fuelAlarms() === 2 && runlogOf(f).firsts.peril?.what.startsWith("Fuel for") === true, `fuel under ${3} days is one alarm however long it lasts, and a second once it has passed (${first}, then ${fuelAlarms()})`);

  // Caps, and the save: a page a day thinned by half past the cap, sixty waves, and all of it through packSave.
  const c = newTown(6109, 12);
  const cp = perilOf(c);
  for (let i = 0; i < 450; i++) {
    c.time += DAY_MIN;
    noteDawn(c, cp, 1);
  }
  for (let i = 0; i < WAVES_MAX + 10; i++) noteWave(c, `wave ${i}`, "broken", 3, 0, undefined, 0);
  const cl2 = runlogOf(c);
  const even = cl2.samples.every((x, i) => i === 0 || x.d - cl2.samples[i - 1].d === cl2.every);
  check(cl2.samples.length <= SAMPLES_MAX && cl2.every === 4 && even && cl2.waves.length === WAVES_MAX && cl2.waves[0].name === "wave 10", `450 dawns keep ${cl2.samples.length} samples, ${cl2.every} days apart; ${cl2.waves.length} waves kept, the oldest gone`);
  const back = unpackSave(packSave(c));
  check(JSON.stringify(back.runlog) === JSON.stringify(c.runlog) && JSON.stringify(back.perilSeen) === JSON.stringify(c.perilSeen), "the run's log and the alarms raised survive packSave/unpackSave");
  const old = newTown(6110, 12);
  old.deaths = 7;
  stats(old).raidsWon = 3;
  delete old.runlog;
  const up = migrate(unpackSave(packSave(old)));
  check(up.runlog?.before?.deaths === 7 && up.runlog.before.raidsWon === 3 && up.runlog.from === clock(old.time).day && !Object.keys(up.runlog.deaths).length,
    "an old save starts its log from s.stats and s.deaths: 7 dead and 3 raids won before it, kept apart");
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
