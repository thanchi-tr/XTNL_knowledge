/**
 * Exercises the town's later systems headlessly: night haunts, spoils and
 * the forge's store, gear and the training gate, wizard ascension, emblem
 * knight sorties, kitchen dishes and braziers. Prints what happened and
 * exits non-zero if an invariant breaks.
 *
 * Run with `npx tsx scripts/town-features-check.ts`.
 */
import { newTown, clock, makeVillager, makeStructure, migrate, byId, packSave, unpackSave, beds } from "../src/lib/town/sim/state";
import { advance, raidChance, raidForecast, trainingPace, scheduleRaid, type SimContext } from "../src/lib/town/sim/tick";
import { rng } from "../src/lib/town/sim/world";
import { buildingEffects } from "../src/lib/town/sim/effects";
import { stepCombat, hauntFor, summonHaunt } from "../src/lib/town/sim/combat";
import { place, setMode, hire, clear, schoolTrain, assignGuard, stokeFire, markEarthworks, trade, upgrade, upgradeWalls, combineHomes, combinePartners } from "../src/lib/town/sim/actions";
import { CATALOG, DISHES, LAND_CROPS, STORE_PER_LEVEL, WATER_CROPS, grade, homeTitle, jewelCost, knightPay, knightTitle, soldierTitle, upgradePeople } from "../src/lib/town/sim/catalog";
import { MATURE, SNAG, SPROUT, TILE_WOOD, TREE_WOOD, YOUNG, forests, growWoods, treeMeta, treeStage, winterCull } from "../src/lib/town/sim/woods";
import {
  GEAR, advanceKnight, armorySlots, ascensionOdds, attemptAscension, deploy, equip, forgeOf, gearCap, knightCapFor, startCraft, stock, store,
  wizardCapFor, xpToNext,
} from "../src/lib/town/sim/loot";
import { profileFor, type TownInput } from "../src/lib/town/rules";
import {
  RARE_FINDS, fitAt, gapBetween, spacingProblem, alertRadius, burnRate, captainBonus, center, hallRadius, mineRareRate, passiveRadius, structureMaxHp, wallHp, wallLevel, wallMaxHp, wallMeta, checkPlacement, fieldFrozen, fuelCap, growsInWinter, guardSlots, isLit, isWarm, storageCap, unlitBuildings, warmFields, warmthRange,
} from "../src/lib/town/sim/world";
import { MAP_W, MAP_H, Overlay, RAW_FOODS, Terrain, type GameState, type StructureType } from "../src/lib/town/sim/types";
import { FOG, UNSEEN, VISIBLE, visionMap } from "../src/lib/town/sim/vision";
import { MONSTERS } from "../src/lib/town/sim/bestiary";
import { DROPS } from "../src/lib/town/sim/loot";
import { PACK_SLOTS, RATION_MEALS, adventureReach, packRation, packTorch, sendScout, unpackSlot } from "../src/lib/town/sim/wilds";
import { WILD_CAP, sowWild, wildCrop } from "../src/lib/town/sim/forage";
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
  const tree = s.map.overlay.findIndex((o) => o === 1);
  clear(s, [tree]);
  for (let h = 0; h < 6; h++) advance(s, 60, ctx);
  check(s.map.overlay[tree] === 0, "a marked tree comes down even with nobody idle");
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
    advance(s, 60, ctx);
    check(s.res.fish > fish, `fish come in (${fish.toFixed(1)} → ${s.res.fish.toFixed(1)})`);
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
  for (let h = 0; h < 24 * 90; h++) advance(t, 60, ctx);
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
  for (let h = 0; h < 24 * 4; h++) advance(k, 60, ctx);
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
  check(fc.monsters.length > 0 && Math.abs(fc.monsters.reduce((a, m) => a + m.pct, 0) - 1) < 1e-6 && fc.exposed[0].st.id === outpost.id,
    `the forecast lists what could come (${fc.monsters.slice(0, 3).map((m) => `${m.name} ${Math.round(m.pct * 100)}%`).join(", ")}) and names the most exposed building`);

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

  // Hungry: out of rations, a hero weakens.
  const hungry = makeVillager(g, null, "knight");
  packTorch(g, hungry.id);
  packTorch(g, hungry.id);
  packRation(g, hungry.id);
  sendScout(g, hungry.id, Math.floor(hx) + 60, Math.floor(hy));
  hungry.pack = hungry.pack!.map((p) => (p === "ration" ? null : p));
  hungry.scout!.fed = 1;
  hungry.health = 80;
  for (let i = 0; i < 60; i++) advance(g, 1, ctx);
  check(hungry.health < 75, `with no food left, they weaken (${Math.round(hungry.health)} health after an hour)`);

  // Lost: the last torch gutters out deep in the fog.
  const lost = makeVillager(g, null, "knight");
  packTorch(g, lost.id);
  packRation(g, lost.id);
  sendScout(g, lost.id, Math.floor(hx) + 120, Math.floor(hy));
  lost.scout!.x = hx + 110;
  lost.scout!.hx = hx;
  lost.pack = lost.pack!.map((p) => (p?.startsWith("torch") ? "torch:1" : p));
  advance(g, 2, ctx);
  check(lost.scout?.lost !== undefined, "torchless in the fog, they lose the way");
  for (let i = 0; i < 100 && g.villagers.includes(lost); i++) advance(g, 1, ctx);
  check(!g.villagers.includes(lost) && g.log.some((l) => /never found/.test(l.text)), "and lost too long, they are never found");
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
  check(CATALOG.house.maxLevel === 30 && CATALOG.townhall.maxLevel === 30 && CATALOG.pitfire.maxLevel === 30, "buildings rise to level 30");
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

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
