import { HOUR, dropLostPupils } from "./state";
import { RANK_GATES, WAR_KNOWLEDGE, knowledgeFor, ladderCapOf, rankCapOf, readStudy, studyDawn, tellGate, learnedWits, streakTalent } from "./mastery";
import { ATTR_NAME, GROUPS, GROUP_NAME, attrMul, attrsOf, growOnRise, rollAttrs, workMul } from "./attributes";
import { onDeath, recognitionDaily, recognitionOf, recognize, talentOdds } from "./recognition";
import { buildFactor, needsHourly, needsState, thriveFactor } from "./needs";
import { WATCH_WORK, nightThreat } from "./menace";
import {
  CATALOG, CROP_YIELD, DIG_HOURS, DISHES, FARM_LOSS, FILL_HOURS, FISH_CATCH, FISH_SEASON, FOOD_PACE, LAB_RECIPES, LADDERS, RECIPES, TRAIN_CAP,
  grade, knightPay, promotionHours, roleLabel,
  PEAT_CUT, PEAT_EFFORT, ALCHEMY_RECIPES, OBSERVATORY_RECIPES, MYTHIC_RECIPES, type LabRecipe,
} from "./catalog";
import { EFFORT_POINTS, canWork, gainWork, hasNightShift, jobEffort, spend, workDawn, workHourly, type Effort } from "./work";
import { finishWorks, petrify, statuesHourly } from "./champions";
import { omenPace, omensHourly } from "./omens";
import { ELEMENTS } from "./elements";
import { leisureHourly } from "./leisure";
import { checkVictory } from "./endgame";
import { achievementsHourly } from "./achievements";
import { stats } from "./stats";
import { legendMods } from "./legends";
import { MONSTERS, expectedLevel, localizeParty, partyName, raidTable, rollRaid } from "./bestiary";
import {
  byId, clock, countedTroops, isMilitary, log, makeVillager, residents, totalBeds, townPower, beds,
} from "./state";
import {
  BULK, capOf, center, isWarm, checkMove, groundYield, LIGHT_TYPES, RARE_FINDS, isHome, structureMaxHp, burnRate, computeLinks, exposure, hallDistance, mineRareRate, farmReachesMarket, fieldFrozen, fuelCap, growsInWinter, idx, inBounds, irrigation, ringOf, rng, occupancy, unlitBuildings, LAMP_BURN, LAMP_CAP, lampFuel,
} from "./world";
import { TREE_EFFORT, TREE_WOOD, growWoods, treeStage, winterCull, TREE_KINDS, ripe, seasonStamp, treeSpecies } from "./woods";
import { ASCEND_FROM, domainBonus, finishCrafts, gearCap, isAway, isSpecial, returnFromSortie, stock, store, take, xpToNext } from "./loot";
import { prowlChance, summonHaunt, summonProwlers } from "./combat";
import { stepWilds, wildsHourly } from "./wilds";
import { WILD_EFFORT, sowWild, wildAmount, wildCrop } from "./forage";
import { weatherHourly, air } from "./weather";
import { canTakeIn, effOf, illnessHourly, stepBodies, townHunger } from "./body";
import { tripHours, wallHp, wallLevel, wallMaxHp, wallMeta } from "./world";
import { aggroHourly, aggroOf, archetypeOdds, channelAggro, emit, noteLoss, threatForecast, waveLevel, ROSTER } from "./aggro";
import { storesHourly, storesDaily, storesOf, addWood, mixMealTaint, mixMealVitC } from "./stores";
import { soilDaily, soilWorked, soilYield } from "./soil";
import { workTool, type Target } from "./tools";
import { framesDaily, framesHourly } from "./frame";
import { addCorpse, auditAutumn, corpsesHourly, perilAlarms, perilOf, psycheHourly, societyWork, witnessDeath } from "./psyche";
import { noteDawn } from "./runlog";
import { discoverNodes, nodesDaily } from "./wilds";
import { initSurvival } from "./survival";
import { kmod, knowledgeHourly } from "./knowledge";
import { pathsHourly, rateOf, settle, snap, windfall } from "./paths";
import { biomeDef, biomeOf, iceWinter } from "./biomes";
import { climateOf, cropHour } from "./crops";
import { arrivalFor, habitWeight, stormsHourly } from "./habits";
import type { MonsterDef } from "./bestiary";

/** Chance a thunderstorm hails on a field in an hour. */
const HAIL_CHANCE = 0.15;
import { WORK_MAX } from "./work";
import { neglect, nemesisHourly } from "./nemesis";
import { woodFuel, FUEL_UNIT_KG } from "./zones";
import { targetValue } from "./breach";
import { strikingFaction } from "./body";
import { CHANNELS } from "./types";
import {
  DAY_MIN, MAP_H, MILITARY, Overlay, RAW_FOODS, Terrain, type Caravan, type CaravanOffer, type GameState, type ResourceKey, type Structure, type Villager,
} from "./types";
import { musterOf, type Muster, type TownInput, type TownProfile } from "../rules";

/** How long a newcomer takes on the road to town. */
export const NEWCOMER_MINUTES = 3 * 60;

/** Builders down tools at 20:00 and take them up again at 06:00. */
const DUSK = 20 * 60;
const DAWN = 6 * 60;

/**
 * When a job due at `due` really falls due if nobody works it at night: the
 * work left at `from` is done only in the daylight of the step [from, to),
 * and whatever is still left at `to` is due that many minutes after it. The
 * step can be a frame or a whole day; the answer is the same.
 */
export function pastNight(from: number, to: number, due: number): number {
  let left = due - from;
  for (let t = from; t < to; ) {
    const m = ((t % DAY_MIN) + DAY_MIN) % DAY_MIN;
    const end = Math.min(to, t - m + (m < DAWN ? DAWN : m < DUSK ? DUSK : DAY_MIN + DAWN));
    if (m >= DAWN && m < DUSK) {
      if (t + left <= end) return t + left;
      left -= end - t;
    }
    t = end;
  }
  return to + left;
}

/**
 * Time passing. `advance` moves the clock; everything slow happens on the
 * hour, in `hourly`, so a whole day at 60× speed costs 24 ticks rather than
 * thousands. Raids are scheduled here and resolved in combat.ts.
 */

export interface SimContext {
  profile: TownProfile;
  input: TownInput;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Mood sets how fast work gets done: half speed at 0, normal at 50, 1.5× at 100. */
export const moodSpeed = (mood: number) => 0.5 + mood / 100;

/** Production multiplier: active debuffs (a sacking, grief), and how well the town is and how well founded (./needs). */
const productionFactor = (s: GameState) => s.debuffs.reduce((a, d) => a * d.production, 1) * thriveFactor(s);

/**
 * Wood a lumberjack fells in an hour at full strength with a good axe. Nine,
 * so that one hand in the forest keeps about two homes' hearths burning
 * through a winter: fuel is a planning problem to solve, not a third of the
 * town lost to the woods.
 */
export const LUMBER_RATE = 9;

/** Build/upgrade minutes, after streak, reviews and mood. */
export function buildMinutes(s: GameState, ctx: SimContext, baseHours: number): number {
  const reviewHaste = Math.min(0.3, ctx.input.reviewsToday * 0.01);
  return (baseHours * 60 * (1 - ctx.profile.streakHaste) * (1 - reviewHaste)) / (moodSpeed(s.mood) * buildFactor(s));
}

// ── Training pace ─────────────────────────────────────────

/** Training's speed while cards are due and nothing of today's muster is answered. */
export const SLOW_PACE = 0.35;
/** Each idea added today, once the reviews are done. */
export const IDEA_BOOST = 0.15;
export const MAX_BOOST = 1.5;

export interface Pace {
  /** Multiplier on all training: courses, recruits, troops levelling. */
  factor: number;
  /** Below full speed: cards are due and today's muster is not yet met. */
  slowed: boolean;
  /** Extra speed from today's new ideas, 0–1.5. */
  boost: number;
  due: number;
  ideas: number;
  /** Today's muster (../rules musterOf): the answers the pace is read from. */
  muster: Muster;
}

/**
 * How fast the town learns. While cards are due it climbs with every answer,
 * from SLOW_PACE with none to full speed once today's muster is met — so
 * each right answer is worth the same, stated share of a day's training, and
 * a backlog of a hundred asks forty of them, not all. With nothing due it
 * runs at full speed, and faster again for every new idea added today.
 */
export function trainingPace(input: SimContext["input"]): Pace {
  const due = input.dueRemaining ?? 0;
  const ideas = input.newIdeasToday ?? 0;
  const muster = musterOf(input);
  const boost = due > 0 ? 0 : Math.min(MAX_BOOST, ideas * IDEA_BOOST);
  // The share is ignored with nothing due: a day of misses and no cards left is still a finished day.
  const factor = due > 0 ? SLOW_PACE + (1 - SLOW_PACE) * muster.share : 1 + boost;
  return { factor, slowed: due > 0 && muster.share < 1, boost, due, ideas, muster };
}

export function advance(s: GameState, minutes: number, ctx: SimContext) {
  initSurvival(s);
  s.time += minutes;
  s.hourAcc += minutes;
  // Bands in the fog and scouts with torches move on the minute.
  stepWilds(s, minutes);
  // Every body, every minute; the rooms every ten (design §8.2–8.3).
  stepBodies(s, minutes);

  // Lessons and drills wear down at the current pace — at half of it while time slips (./omens).
  const pace = trainingPace(ctx.input).factor;
  const slip = omenPace(s);
  for (const st of s.structures) {
    const tr = st.training;
    if (!tr) continue;
    if (tr.left === undefined) tr.left = Math.max(0, (tr.until ?? s.time) - s.time);
    // The building's path (./paths) speeds its lessons and its recruits alike.
    tr.left -= minutes * (tr.recruit ? 1 : pace) * slip * rateOf(st);
  }

  // The forge's anvil, the mythic laboratory's great works and returning riders are on the minute too.
  finishCrafts(s);
  finishWorks(s);
  for (const v of s.villagers) if (v.deployedUntil && v.deployedUntil <= s.time) returnFromSortie(s, v);

  // Construction finishes on the minute, not the hour — and stands still through
  // the night, unless a night shift carries it on by torchlight.
  const nightShift = hasNightShift(s);
  const stepFrom = s.time - minutes;
  for (const st of s.structures) {
    if (!nightShift && st.buildUntil && st.buildUntil > stepFrom) st.buildUntil = pastNight(stepFrom, s.time, st.buildUntil);
    if (slip < 1 && st.buildUntil && st.buildUntil > s.time) st.buildUntil += minutes * (1 - slip);
    if (st.buildUntil && st.buildUntil <= s.time && st.moveTo) {
      // A move: it stands on the new plot if that is still clear, else where it was.
      st.buildUntil = undefined;
      const to = st.moveTo;
      st.moveTo = undefined;
      if (checkMove(s, st, to.x, to.y).ok) {
        st.x = to.x;
        st.y = to.y;
        log(s, `The ${CATALOG[st.type].name.toLowerCase()} stands again at ${to.x},${to.y}.`, "good");
      } else log(s, `The ${CATALOG[st.type].name.toLowerCase()}'s new plot was taken; the movers put it back where it stood.`, "bad");
      stats(s).moved += 1;
    } else if (st.buildUntil && st.buildUntil <= s.time) {
      st.buildUntil = undefined;
      st.hp = structureMaxHp(st);
      log(s, `${CATALOG[st.type].name} ${st.level > 1 ? `reaches level ${st.level}` : "is built"}.`, "good");
      const t = stats(s);
      t.built[st.type] = (t.built[st.type] ?? 0) + 1;
    }
  }

  while (s.hourAcc >= 60) {
    s.hourAcc -= 60;
    hourly(s, ctx);
  }
  dropLostPupils(s);

  // Raid arrival is checked every call, so it lands on time at any speed.
  if (s.raid?.phase === "incoming" && s.time >= s.raid.arrivesAt) {
    // Blizzard stalkers only come in a whiteout: a clearing sky scatters them.
    if (s.raid.archetype === "Wr" && air(s).vis >= 50) {
      log(s, "The blizzard lifts, and whatever was coming in it is gone.", "info");
      s.raid = null;
      return;
    }
    // combat.ts turns the party into combatants on its next step
    s.raid.phase = "fighting";
  }
}

function hourly(s: GameState, ctx: SimContext) {
  HOUR.on = true;
  HOUR.n++;
  try {
    hourlyTick(s, ctx);
  } finally {
    HOUR.on = false;
  }
}

function hourlyTick(s: GameState, ctx: SimContext) {
  const c = clock(s.time);
  // The player's own study, as the town reads it this hour (./mastery); at dawn, yesterday's pays.
  readStudy(s, ctx.input);
  if (c.hour === 6) studyDawn(s, c.day);
  const r = rng(Math.floor(s.time) * 31 + s.seed);
  weatherHourly(s);
  // Dawn: the town's name is reckoned from how it woke (./recognition).
  if (c.hour === 6) recognitionDaily(s);
  // Lightning in a thunderstorm (./habits).
  stormsHourly(s, r);
  // Today's study: buffs from today's ideas, drops for finished dailies (§12).
  knowledgeHourly(s, ctx.input);
  // The player's real emblems, as the King's blows will read them (./champions).
  s.realm = { emblems: (ctx.input.emblems ?? []).map((e) => ({ code: e.code, name: e.name, depth: e.depth, attributes: [...e.attributes] })), at: s.time };
  statuesHourly(s);
  omensHourly(s, r);
  // Every building's path: its rate for the hour, beacons, floods, crates, rest (./paths).
  pathsHourly(s, c.hour, r);
  workHourly(s);
  leisureHourly(s);
  checkVictory(s);
  achievementsHourly(s);
  const a = air(s);
  const km = (attr: Parameters<typeof kmod>[1]) => 1 + kmod(s, attr);
  const [hallX, hallY] = (() => {
    const h = s.structures.find((st) => st.type === "townhall");
    return h ? [h.x + h.w / 2, h.y + h.h / 2] : [40, 30];
  })();
  // Tool use this hour: each tool once.
  const usedTools = new Set<number>();
  const toolFor = (target: Target, intensity = 1) => workTool(s, target, a.T, intensity, usedTools);
  const sw = societyWork(s);
  const striker = s.society?.state === "strike" ? strikingFaction(s) : -1;
  /** A worker's share of a full hour's output: fitness, attendance, the town's temper. */
  // Each worker's attributes serve the job they are at (./attributes workMul).
  const jobType = new Map(s.structures.map((st) => [st.id, st.type] as const));
  const wf = (v: Villager) => (v.body ? effOf(v) * (v.body.presence ?? 1) : 1) * sw * (v.fac === striker ? 0 : 1) * (v.broken && v.broken.until > s.time ? 0 : 1) * (v.nightWatch ? WATCH_WORK : 1) *
    workMul(v, v.work != null ? jobType.get(v.work) : undefined);
  // Bulk goods as they stood, so the hour's gains can be held to what the stores take.
  const held = BULK.map((k) => s.res[k]);
  const prod = productionFactor(s);
  const links = computeLinks(s);
  const live = (st: Structure) => !st.buildUntil;

  // ── Fire and warmth ────────────────────────────────────
  // Each fire burns only what has been loaded into its own grate. Nothing
  // comes from the stores on its own: when the grate is empty, the fire is out.
  for (const f of s.structures.filter((st) => st.type === "pitfire" && live(st))) {
    const had = f.fuel ?? 0;
    // Its path: fuel lasts longer, or some hours it burns nothing at all.
    f.fuel = windfall(s, f, r) ? had : Math.max(0, had - burnRate(c.season, c.night) / rateOf(f));
    const burnt = had - f.fuel;
    if (burnt > 0) {
      const fuel = woodFuel(storesOf(s).woodMC);
      emit(s, "smk", (burnt * FUEL_UNIT_KG * fuel.pm) / 1000, f.x, f.y);
      emit(s, "heat", (burnt * FUEL_UNIT_KG * 14.3) / 3600, f.x, f.y);
    }
    if (had > 0 && f.fuel === 0) log(s, `The pit fire at ${f.x},${f.y} has burnt out. Load it with wood or coal to light it again.`, "bad");
    else if (had >= fuelCap(f.level) * 0.2 && f.fuel < fuelCap(f.level) * 0.2) log(s, `The pit fire at ${f.x},${f.y} is burning low.`, "info");
  }
  // Lamps burn a little through the night hours — a unit a night, far slower than a fire — and
  // go dark when dry. Nothing refills them on its own (./actions fillLamp).
  if (c.night) {
    let dried = 0;
    for (const l of s.structures.filter((st) => st.type === "lamppost" && live(st))) {
      const had = lampFuel(l);
      l.fuel = Math.max(0, had - LAMP_BURN);
      if (had > 0 && l.fuel === 0) dried++;
    }
    if (dried) log(s, dried === 1 ? "A lamp has burnt dry and gone dark. Refill it with wood or coal." : `${dried} lamps have burnt dry and gone dark. Refill them with wood or coal.`, "bad");
  }
  if (c.hour === 18) {
    const lamps = s.structures.filter((st) => st.type === "lamppost" && live(st));
    const low = lamps.filter((l) => lampFuel(l) > 0 && lampFuel(l) < LAMP_CAP * 0.25).length;
    const dry = lamps.filter((l) => lampFuel(l) <= 0).length;
    if (low || dry) log(s, `Dusk: ${[dry && `${dry} lamp${dry === 1 ? " is" : "s are"} dry`, low && `${low} burning low`].filter(Boolean).join(", ")} — refill them before the dark comes.`, dry ? "bad" : "info");
  }
  // Braziers burn coal through the dark hours, and go out without it.
  for (const b of s.structures.filter((st) => st.type === "brazier" && live(st))) {
    if (c.night && !windfall(s, b, r)) b.fuel = Math.max(0, (b.fuel ?? 0) - 0.5 / rateOf(b));
    while ((b.fuel ?? 0) < 3 && s.res.coal >= 1) {
      s.res.coal -= 1;
      b.fuel = (b.fuel ?? 0) + 2;
      emit(s, "smk", 0.12, b.x, b.y);
    }
  }

  // ── Production ─────────────────────────────────────────
  const workersOf = (st: Structure) => st.workers.map((id) => s.villagers.find((v) => v.id === id)).filter(Boolean) as Villager[];
  const onBreak = (v: Villager) => {
    const h = byId(s, v.house);
    return !!h?.breakUntil && h.breakUntil > s.time;
  };
  // A worker who has spent the day's strength stops — unless the building drives them on.
  // Whoever leads the night shift sleeps by day; whoever is away is away.
  const day = c.hour >= 6 && c.hour < 20;
  const working = (st: Structure) => workersOf(st).filter((v) => !onBreak(v) && v.health > 20 && wf(v) > 0 && canWork(v, st) && !(v.nightShift && day) && !(v.awayUntil && v.awayUntil > s.time));
  // Condition, and the tenth-level steps: a quarter more from each.
  const cond = (st: Structure) => (0.5 + st.condition / 200) * (1 + 0.25 * grade(st.level));
  const biologists = s.villagers.filter((v) => v.role === "biologist" || (v.role === "farmhand" && v.rank >= 4)).length;
  const bioBonus = 1 + Math.min(0.3, biologists * 0.03);
  // Each map's growing year (./biomes): the desert's summer scorches, its winter is mild.
  const seasonYield = biomeDef(s).seasonYield[c.season];

  const farms = s.structures.filter((st) => (st.type === "farm" || st.type === "waterfarm") && live(st));
  let hailed = 0;
  for (const f of farms) {
    const ws = working(f);
    if (!ws.length) continue;
    // Iced over: nothing grows until spring, or until a pit fire reaches it.
    if (fieldFrozen(s, f, c.season === "winter")) continue;
    // Even inside the warmth, only potatoes grow through winter.
    if (c.season === "winter" && biomeDef(s).freezes && !growsInWinter(f, s)) continue;
    const w = ws[0];
    const fit = wf(w);
    if (!legendMods(s).soilKeeps) soilWorked(f, fit);
    const rank = w.role === "biologist" ? 4 : Math.min(4, w.rank);
    // Neighbouring blocks growing the same crop raise each other's yield.
    const ring = new Set(ringOf(f.x, f.y, f.w, f.h));
    const same = farms.filter((o) => o !== f && o.mode === f.mode && ringsTouch(o, ring)).length;
    const base = CROP_YIELD[f.mode ?? "potato"] ?? 5;
    const seasonal = f.type === "waterfarm" && c.season === "winter" ? 0.2 : seasonYield;
    // The hour's weather on this crop (./crops): frost, heat, thirst, wind, hail. A field in a fire's warmth is spared the frost.
    const crop = f.mode ?? "potato";
    const fieldT = a.T < climateOf(crop).frost && isWarm(s, center(f)) ? Math.max(a.T, 6) : a.T;
    const hail = a.regime === "thunder" && r() < HAIL_CHANCE;
    if (hail) hailed++;
    const weathered = cropHour(s, crop, { T: fieldT, regime: a.regime }, irrigation(s, f), hail);
    f.cropNow = [weathered.factor, weathered.why];
    // The soil carries the yield now (design §3.5): fertiliser and compost go into it.
    const amount = weathered.factor * rateOf(f) * base * (1 + 0.25 * (f.level - 1)) * ctx.profile.harvestScale * (1 + 0.12 * same) *
      (1 - FARM_LOSS[rank]) * bioBonus * seasonal * irrigation(s, f) * cond(f) * prod * soilYield(f) * fit * toolFor("loam", 0.3) * FOOD_PACE * km("STATISTIC") * groundYield(f) * legendMods(s).farm;
    if (farmReachesMarket(s, links, f)) {
      const key = (f.mode ?? "potato") as keyof typeof s.res;
      // A bumper crop: the windfall path doubles an hour's harvest.
      s.res[key] += windfall(s, f, r) ? amount * 2 : amount;
    }
  }
  if (hailed) log(s, `Hail beats down on ${hailed} field${hailed > 1 ? "s" : ""}.`, "bad");

  const served = new Set<string>();
  for (const st of s.structures.filter(live)) {
    const ws = working(st);
    const n = ws.reduce((acc, v) => acc + wf(v), 0);
    const k = cond(st) * prod;
    // Its path (./paths): how much faster it works, and the goods before its hour, for a windfall or thrift to settle.
    const rate = rateOf(st);
    const before = snap(s, st);
    switch (st.type) {
      case "kitchen": {
        // Each chef cooks the kitchen's dish if they have the standing and
        // the store has the crops; otherwise pottage from whatever is there.
        const dish = DISHES.find((d) => d.id === st.mode) ?? DISHES[0];
        const stores = storesOf(s);
        /** Takes food, the spoiled share first: it goes in the pot before it goes off. */
        const takeFood = (key: ResourceKey, n: number): number => {
          const sp = Math.min(n, stores.spoiled[key] ?? 0);
          stores.spoiled[key] = (stores.spoiled[key] ?? 0) - sp;
          s.res[key] -= n;
          return sp;
        };
        for (const v of ws) {
          // Hard economy: a chef gets through half what they used to.
          let batches = Math.max(1, Math.floor((1 + 0.3 * v.rank) * k * wf(v) * km("CREATIVITY") * legendMods(s).kitchen * rate + 0.5));
          if (dish.id !== "pottage" && v.rank >= dish.rank) {
            while (batches > 0 && Object.entries(dish.input).every(([key, n]) => s.res[key as keyof typeof s.res] >= (n as number))) {
              let spoiled = 0;
              let total = 0;
              for (const [key, n] of Object.entries(dish.input)) {
                spoiled += takeFood(key as ResourceKey, n as number);
                total += n as number;
              }
              s.res.meals += dish.meals;
              mixMealTaint(s, spoiled, total, dish.meals);
              mixMealVitC(s, dish.input, dish.meals);
              served.add(dish.id);
              batches--;
            }
          }
          let cap = batches * 2;
          for (const food of RAW_FOODS) {
            if (cap <= 0) break;
            const take = Math.min(cap, s.res[food]);
            if (take <= 0) continue;
            const spoiled = takeFood(food, take);
            s.res.meals += take * DISHES[0].meals;
            mixMealTaint(s, spoiled, take, take * DISHES[0].meals);
            mixMealVitC(s, { [food]: take }, take * DISHES[0].meals);
            cap -= take;
          }
        }
        break;
      }
      case "mine": {
        if (!n) break;
        const geo = ws.filter((v) => v.role === "geologist").reduce((a, v) => a + v.rank + 1, 0);
        // Picks on rock: each worker's tool, and the strikes ring through the bedrock (§2.1).
        const edge = ws.reduce((acc, v) => acc + wf(v) * toolFor(v.rank % 2 ? "coal" : "limestone"), 0) / Math.max(1e-6, n);
        emit(s, "ac", ws.length * 0.054, st.x, st.y);
        const kk = k * edge * km("PHYSICAL") * groundYield(st) * legendMods(s).mine * rate;
        s.res.stone += n * (2 + st.level) * kk;
        s.res.coal += n * (1 + st.level * 0.5) * kk;
        s.res.iron += n * Math.max(0, st.level - 1) * 0.4 * kk;
        // Precious things are rare, and richer the further the mine lies from the hall.
        const luck = (1 + geo * 0.1) * (1 + 0.1 * (st.level - 1));
        if (r() < mineRareRate(s, st) * luck) {
          if (st.level >= 6 && r() < 0.03) {
            s.res.mithril += 1;
            log(s, "The miners strike a vein of mithril.", "good");
          } else {
            let pick = r() * RARE_FINDS.reduce((a, f) => a + f.weight, 0);
            const find = RARE_FINDS.find((f) => (pick -= f.weight) <= 0) ?? RARE_FINDS[0];
            const qty = find.qty[0] + Math.floor(r() * (find.qty[1] - find.qty[0] + 1));
            s.res[find.res] += qty;
            if (find.res !== "silver") log(s, `The miners bring up ${qty} ${find.res}.`, "good");
          }
        }
        break;
      }
      case "lumbercamp": {
        if (!n) break;
        const edge = ws.reduce((acc, v) => acc + wf(v) * toolFor(v.id % 2 ? "oak" : "softwood"), 0) / Math.max(1e-6, n);
        let want = n * LUMBER_RATE * (1 + 0.2 * (st.level - 1)) * k * edge * km("PHYSICAL") * rate;
        let cut = 0;
        for (const i of forestNear(s, st)) {
          const take = Math.min(want, s.map.meta[i]);
          s.map.meta[i] -= take;
          cut += take;
          want -= take;
          if (want <= 0) break;
        }
        // Green wood into the stock; the canopy torn open (§2.1).
        addWood(s, cut, 0.5);
        emit(s, "can", cut, st.x, st.y);
        break;
      }
      case "refinery": {
        const recipe = RECIPES.find((rc) => rc.id === st.mode) ?? RECIPES[0];
        const crew = recipe.scientist ? ws.filter((v) => v.role === "scientist").reduce((acc, v) => acc + wf(v), 0) : n;
        for (let i = 0; i < Math.round(crew * st.level * km("LOGIC") * rate); i++) {
          if (!Object.entries(recipe.input).every(([key, v]) => s.res[key as keyof typeof s.res] >= (v as number))) break;
          for (const [key, v] of Object.entries(recipe.input)) s.res[key as keyof typeof s.res] -= v as number;
          for (const [key, v] of Object.entries(recipe.output)) {
            if (key === "tools" && recipe.toolMat) for (let t = 0; t < Math.floor((v as number) * k); t++) (s.toolsPending ??= []).push(recipe.toolMat);
            s.res[key as keyof typeof s.res] += (v as number) * k;
          }
          // Kilns and furnaces smoke: 40 g a kilo of wood charred, less for the rest.
          const woodIn = (recipe.input.wood ?? 0) * FUEL_UNIT_KG;
          emit(s, "smk", (woodIn * (recipe.id === "charcoal" ? 40 : 8)) / 1000, st.x, st.y);
        }
        break;
      }
      case "laboratory": {
        // Only scientists work the bench.
        const recipe = LAB_RECIPES.find((rc) => rc.id === st.mode) ?? LAB_RECIPES[0];
        const crew = ws.filter((v) => v.role === "scientist").length;
        for (let i = 0; i < Math.round(crew * st.level * km("LOGIC") * rate); i++) {
          if (!Object.entries(recipe.input).every(([key, v]) => s.res[key as keyof typeof s.res] >= (v as number))) break;
          for (const [key, v] of Object.entries(recipe.input)) s.res[key as keyof typeof s.res] -= v as number;
          for (const [key, v] of Object.entries(recipe.output)) s.res[key as keyof typeof s.res] += (v as number) * k;
        }
        break;
      }
      case "alchemy":
      case "observatory":
      case "mythiclab": {
        // The great works take the mythic laboratory whole while they last.
        if (st.type === "mythiclab" && st.craft) break;
        const list = st.type === "alchemy" ? ALCHEMY_RECIPES : st.type === "observatory" ? OBSERVATORY_RECIPES : MYTHIC_RECIPES;
        // The newer benches stand idle until a recipe is chosen for them.
        const recipe = list.find((rc) => rc.id === st.mode);
        if (!recipe || (recipe.night && !c.night)) break;
        const crew = ws.filter((v) => v.role === "scientist").length;
        // Slower than the bench: once an hour for every two levels, per scientist.
        const runs = Math.round(crew * Math.ceil(st.level / 2) * km("LOGIC") * rate);
        for (let i = 0; i < runs; i++) if (!labRun(s, recipe, k)) break;
        break;
      }
      case "fishery": {
        // Each fisher's catch grows with their rank; the hut's level adds lines in the water.
        for (const v of ws) s.res.fish += (FISH_CATCH + v.rank * 1.2) * (1 + 0.2 * (st.level - 1)) * FISH_SEASON[c.season] * k * wf(v) * FOOD_PACE * rate;
        // Gutting the catch: a little blood into the river.
        if (ws.length) emit(s, "bio", 0.05 * ws.length, st.x, st.y);
        break;
      }
      case "icefactory": {
        if (!iceWinter(s, c.season === "winter")) break;
        for (const v of ws) s.res.ice += (1 + v.rank * 0.6) * st.level * k * wf(v) * toolFor("ice", 0.5) * km("PHYSICAL") * rate;
        break;
      }
      case "forge": {
        if (ws.length) emit(s, "ac", ws.length * 0.032, st.x, st.y);
        break;
      }
      case "market": {
        // Traders turn a little surplus into coin each hour.
        s.res.coin += n * st.level * 0.6 * ctx.profile.sellScale * k * rate;
        break;
      }
    }
    settle(s, st, before, r);
  }


  // ── Eating ─────────────────────────────────────────────
  // People eat at their sittings (./body); the meter shows how fed they are.
  s.hunger = townHunger(s);

  // Good cooking shows: dishes served this hour lift the town that ate them —
  // and every fine dish on the table gives the town a little more heart.
  s.hopeEvents = (s.hopeEvents ?? 0) + 0.1 * served.size;
  for (const id of served) {
    const d = DISHES.find((x) => x.id === id)!;
    if (d.mood) s.mood = clamp(s.mood + d.mood, 0, 100);
    for (const v of s.villagers) {
      if (d.happy) v.happy = clamp(v.happy + d.happy, 0, 100);
      if (d.health) v.health = clamp(v.health + d.health, 0, 100);
    }
  }

  // ── Stores, illness, the dead (design §3, §7) ─────────
  storesHourly(s);
  illnessHourly(s);
  corpsesHourly(s);

  // ── Tonic: the sickest take it first, three doses an hour at most ──
  for (const v of [...s.villagers].sort((a, b) => a.health - b.health).slice(0, 3)) {
    if (v.health >= 70 || s.res.tonic < 1) break;
    s.res.tonic -= 1;
    v.health = clamp(v.health + 25, 0, 100);
  }

  // ── Injuries heal; the gravely hurt die of them ────────
  for (const v of [...s.villagers]) {
    const b = v.body;
    const heal = b && b.vitC < 300 ? 0.2 : 0.4;
    v.health = clamp(v.health + heal, 0, 100);
    if (v.health <= 0) {
      kill(s, v, "died of their injuries");
      log(s, `${v.name} died of their injuries.`, "bad");
    }
  }

  // ── Needs, then minds: sanity, breaks, Hope, discontent, society (§6) ──
  needsHourly(s);
  psycheHourly(s);
  const stars = s.villagers.filter((v) => v.role === "chef" && v.rank >= 3).reduce((a, v) => a + (v.rank - 2), 0);
  s.mood = clamp(s.mood + Math.min(0.5, stars * 0.05) / 24, 0, 100);
  s.debuffs = s.debuffs.filter((d) => d.until > s.time);

  // ── Frames: snow on the roofs, posts checked (§5) ──────
  framesHourly(s);

  // ── Deterioration below half mood ──────────────────────
  for (const st of s.structures) {
    // The hall does not decay with the mood, but it is repaired between raids like everything else.
    if (st.type === "townhall") {
      if (!s.raid) st.hp = Math.min(structureMaxHp(st), st.hp + structureMaxHp(st) * 0.08);
      continue;
    }
    if (s.mood < 50) {
      st.condition -= (50 - s.mood) * 0.04;
      if (st.condition <= 0) {
        if (st.level > 1) {
          st.level -= 1;
          log(s, `The neglected ${CATALOG[st.type].name.toLowerCase()} falls to level ${st.level}.`, "bad");
        }
        st.condition = 50;
      }
    } else st.condition = Math.min(100, st.condition + 0.5);
    // repairs after a raid
    const maxHp = structureMaxHp(st);
    if (!st.buildUntil) st.hp = Math.min(maxHp, st.hp + maxHp * 0.08);
  }

  // ── Promotion and training ─────────────────────────────
  for (const v of s.villagers) {
    if (isMilitary(v)) {
      trainMilitary(s, v, ctx, r);
      continue;
    }
    const ladder = LADDERS[v.role];
    if (!ladder || !v.work || v.health < 20) continue;
    v.xp += 1;
    // A trade's higher titles need a master's emblem (./mastery).
    const top = ladderCapOf(s, v, ladder.length - 1);
    if (v.rank >= top && top < ladder.length - 1 && v.xp >= promotionHours(v.rank)) tellGate(s, v, `${v.role}'s trade`, knowledgeFor(s, v), top >= Math.floor((ladder.length - 1) * 0.75) ? 6 : 3);
    if (v.rank < top && v.xp >= promotionHours(v.rank)) {
      v.xp = 0;
      v.rank += 1;
      const grew = growOnRise(v, Math.floor(s.time));
      log(s, `${v.name} is promoted to ${roleLabel(v.role, v.rank)}${grew ? ` (+1 ${ATTR_NAME[grew]})` : ""}.`, "good");
    }
  }
  for (const st of s.structures) {
    if (st.training && (st.training.left ?? 0) <= 0) {
      const v = s.villagers.find((x) => x.id === st.training!.villagerId);
      if (v) {
        v.role = st.training.role;
        v.rank = MILITARY.includes(v.role) ? st.training.rank ?? 1 : 0;
        if (st.training.heavy) v.heavy = st.training.heavy;
        v.xp = 0;
        v.work = CATALOG[st.type].category === "military" && v.role !== "captain" ? st.id : null;
        // The windfall path: now and then a natural, who comes out a level ahead.
        const gifted = windfall(s, st, r);
        if (gifted) {
          if (MILITARY.includes(v.role)) v.rank += 1;
          else v.level = Math.min(WORK_MAX, (v.level ?? 1) + 1);
          st.lucky = (st.lucky ?? 0) + 1;
        }
        log(s, `${v.name} completes training as ${roleLabel(v.role, v.rank)}${gifted ? " — a natural, a level ahead" : ""}.`, "good");
      }
      st.training = null;
    }
  }

  // ── New arrivals ───────────────────────────────────────
  const free = totalBeds(s) - s.villagers.length;
  // Refugees come to a near-empty town whatever its mood — otherwise a
  // sacked town, whose grief holds mood down, could never be repopulated.
  // Nobody comes to a place without hope, however empty it stands.
  // A town in mourning is not closed: below 40 Hope word travels slowly — one newcomer a
  // day while Hope holds above 15 — so a town that has come through something terrible can
  // rebuild, if its needs are met, rather than dwindle for want of a threshold.
  const mourning = s.mood >= 15 && s.hunger > 30 && s.time - s.lastVillagerAt >= 24 * 60;
  // And no one, refugee or settler, comes to a town that cannot feed them or, in the cold months, keep them warm.
  const room = canTakeIn(s, c.season);
  const welcoming = ((s.mood > 40 && s.hunger > 40) || mourning || (s.villagers.length < 4 && s.mood >= 10)) && room === null;
  if (room && free > 0 && s.incoming === undefined && c.hour === 12) log(s, `Word travels that the town has ${room} to spare: no one comes to settle.`, "bad");
  // A newcomer takes three hours on the road: word goes out when there is a
  // bed and a welcome, and they walk in three hours later if the bed is
  // still free.
  if (s.incoming !== undefined && s.time >= s.incoming) {
    s.incoming = undefined;
    const house = [...s.structures.filter(isHome), ...s.structures.filter((h) => h.type === "townhall")]
      .find((h) => !h.buildUntil && residents(s, h).length < beds(s, h));
    if (house) {
      const v = makeVillager(s, house.id);
      s.lastVillagerAt = s.time;
      // Who comes is rolled as they come: the town's name draws the gifted (./recognition, ./attributes).
      // The town's name draws the gifted; a study streak kept draws more; a learned player's town draws the learned.
      const odds = talentOdds(recognitionOf(s).points);
      const roll = rollAttrs(rng(Math.floor(s.time) * 131 + v.id * 7919 + s.seed), { gifted: odds.gifted + streakTalent(s), prodigy: odds.prodigy });
      v.attrs = roll.attrs;
      v.attrs.wit = Math.min(20, v.attrs.wit + learnedWits(s));
      if (roll.gift) v.gift = roll.gift;
      const best = roll.calling ? GROUPS[roll.calling].filter((k) => roll.attrs[k] >= 14).map((k) => `${ATTR_NAME[k]} ${roll.attrs[k]}`) : [];
      log(s, roll.gift
        ? `${v.name} arrives after three hours on the road — ${roll.gift === "prodigy" ? "a prodigy" : "gifted"} of ${GROUP_NAME[roll.calling!].toLowerCase()} (${best.join(", ")}), drawn by the town's name.`
        : `${v.name} arrives after three hours on the road, and moves in.`, roll.gift ? "good" : "info");
    } else log(s, "The traveller on the road finds no bed free, and turns back.", "bad");
  } else if (s.incoming === undefined && free > 0 && welcoming) {
    s.incoming = s.time + NEWCOMER_MINUTES;
    log(s, "Word has gone out: a newcomer is on the road to town, three hours off.", "info");
  }
  // Rehouse the homeless.
  for (const v of s.villagers.filter((x) => !byId(s, x.house))) {
    const house = [...s.structures.filter(isHome), ...s.structures.filter((h) => h.type === "townhall")]
      .find((h) => !h.buildUntil && residents(s, h).length < beds(s, h));
    if (house) v.house = house.id;
  }

  // ── The day's strength: each worker's hour at the job costs its effort ─
  const shiftH = s.policy?.shift ?? 14;
  for (const st of s.structures.filter(live)) {
    const pts = EFFORT_POINTS[jobEffort(st.type)];
    // An hour at work is an hour's experience, whatever the work: hard work teaches half as fast again.
    for (const v of working(st)) gainWork(s, v, (v.body?.presence ?? 1) * (pts >= 4 ? 1.5 : 1));
    if (!pts) continue;
    for (const v of working(st)) spend(v, (pts * (v.body?.presence ?? 1)) / shiftH);
  }

  // ── Rune-cut walls mend themselves between fights (./world WALL_ORDERS) ─
  if (!s.raid) {
    const o = s.map.overlay;
    const m = s.map.meta;
    for (let i = 0; i < o.length; i++) {
      if (o[i] !== Overlay.Wall && o[i] !== Overlay.Gate) continue;
      const lvl = wallLevel(m[i]);
      if (lvl < 30) continue;
      const max = wallMaxHp(lvl, o[i] === Overlay.Gate);
      const hp = wallHp(m[i]);
      if (hp < max) m[i] = wallMeta(lvl, Math.min(max, hp + max * 0.02));
    }
  }

  // ── Clearing: idle hands clear trees, rocks and rubble ─
  // With nobody idle the town still gets to it after work, only slowly —
  // a marked job never sits forever, and rubble never blocks a plot for good.
  const idlers = s.villagers.filter((v) => v.role === "idle" && !v.work && v.health > 20 && (s.policy?.overtime || canWork(v)));
  const idle = idlers.reduce((acc, v) => acc + wf(v), 0);
  let effort = idle > 0 ? idle : s.clearing.length && s.villagers.length ? 0.5 : 0;
  if (s.clearing.length && idlers.length) effort *= idlers.slice(0, 4).reduce((acc) => acc + toolFor("softwood", 0.5), 0) / Math.min(4, idlers.length);
  for (const job of s.clearing) {
    if (effort <= 0) break;
    const o = s.map.overlay[job.tile];
    // Picking fruit (./actions pickFruit): an hour at the tree and the walk out and back; the tree stands.
    if (job.pick) {
      if (!ripe(s, job.tile, c.season, c.year)) {
        job.done = true;
        continue;
      }
      const needPick = 1 + tripHours(s, job.tile);
      const putPick = Math.min(effort, needPick - job.progress);
      job.progress += putPick;
      effort -= putPick;
      if (idlers.length) for (const v of idlers) spend(v, (EFFORT_POINTS.easy * (putPick / needPick)) / idlers.length);
      if (job.progress >= needPick) {
        const k = TREE_KINDS[treeSpecies(s.map.meta[job.tile])];
        if (k.fruit) s.res[k.fruit] += k.yield ?? 4;
        (s.picked ??= {})[job.tile] = seasonStamp(c.year, c.season);
        job.done = true;
      }
      continue;
    }
    const bog = o === Overlay.None && s.map.terrain[job.tile] === Terrain.Marsh;
    // The work itself, and the walk out to it and home again laden (./actions tripHours).
    const need = (o === Overlay.Tree ? TREE_EFFORT[treeStage(s.map.meta[job.tile])] : o === Overlay.Rock ? 4 : o === Overlay.Crop ? WILD_EFFORT : bog ? PEAT_EFFORT : 3) + tripHours(s, job.tile);
    const put = Math.min(effort, need - job.progress);
    job.progress += put;
    effort -= put;
    // The task's effort, shared among the hands who did it.
    if (idlers.length) {
      const kind: Effort = o === Overlay.Crop ? "easy" : o === Overlay.Rock ? "hard" : o === Overlay.Tree ? (treeStage(s.map.meta[job.tile]) >= 3 ? "medium" : "easy") : "medium";
      for (const v of idlers) spend(v, (EFFORT_POINTS[kind] * (put / need)) / idlers.length);
    }
    if (job.progress >= need) {
      if (o === Overlay.Tree) {
        const stage = treeStage(s.map.meta[job.tile]);
        addWood(s, TREE_WOOD[stage], stage === 4 ? 0.3 : 0.5);
        emit(s, "can", [0, 0.5, 8, 30, 4][stage], job.tile % 360, Math.floor(job.tile / 360));
      }
      else if (o === Overlay.Rock) {
        const kind = s.map.meta[job.tile];
        if (kind === 0) s.res.stone += 10;
        else if (kind === 1) s.res.coal += 6;
        else if (kind === 2) s.res.iron += 4;
        else s.res.silver += 2;
      } else if (o === Overlay.Debris) {
        s.res.stone += 3;
        s.res.wood += 2;
      } else if (o === Overlay.Crop) {
        s.res[wildCrop(s.map.meta[job.tile])] += wildAmount(s.map.meta[job.tile]);
      } else if (bog) {
        // Peat for the fires; now and then a nodule of bog iron. The cut drains to a bank.
        // In the desert the low ground is a salt pan, and what is cut from it is salt.
        if (biomeOf(s) === "desert") s.res.salt += PEAT_CUT / 2;
        else s.res.peat += PEAT_CUT;
        stats(s).peat += 1;
        if (r() < 0.25) s.res.bogiron += 2;
        s.map.terrain[job.tile] = Terrain.Bank;
      }
      s.map.overlay[job.tile] = Overlay.None;
      s.map.meta[job.tile] = 0;
    }
  }
  s.clearing = s.clearing.filter((j) => !j.done && (!j.pick || s.map.overlay[j.tile] === Overlay.Tree)).filter((j) => j.pick || s.map.overlay[j.tile] === Overlay.Tree || s.map.overlay[j.tile] === Overlay.Rock || s.map.overlay[j.tile] === Overlay.Debris || s.map.overlay[j.tile] === Overlay.Crop || (s.map.overlay[j.tile] === Overlay.None && s.map.terrain[j.tile] === Terrain.Marsh));

  // ── Knights' pay ───────────────────────────────────────
  // Knights are paid in silver, a day's pay spread over its hours. Unpaid
  // three days, a knight hangs up the sword and goes home a villager.
  const knights = s.villagers.filter((v) => v.role === "knight");
  if (knights.length) {
    const due = knights.reduce((a, v) => a + knightPay(v.rank) / 24, 0);
    if (s.res.silver >= due) {
      s.res.silver -= due;
      for (const v of knights) v.unpaidSince = null;
    } else {
      s.res.silver = 0;
      for (const v of knights) {
        if (v.unpaidSince == null) {
          v.unpaidSince = s.time;
          log(s, `No silver to pay ${v.name}, ${roleLabel(v.role, v.rank)}. Three days unpaid and a knight leaves.`, "bad");
        } else if (s.time - v.unpaidSince >= 3 * 24 * 60) {
          log(s, `${v.name} leaves the knighthood unpaid and goes back to the fields.`, "bad");
          const post = byId(s, v.work);
          if (post) post.workers = post.workers.filter((id) => id !== v.id);
          v.role = "idle";
          v.rank = 0;
          v.xp = 0;
          v.work = null;
          v.guard = null;
          v.unpaidSince = null;
        }
      }
    }
  }

  // ── Earthworks: digging channels, filling them in ─────
  if (s.earthworks?.length) {
    // Idle hands after clearing, as with trees and rubble; tools double the
    // pace. A tile only has room for a spade or two, so however many turn
    // out, each tile takes the better part of two days.
    const diggers = s.villagers.filter((v) => v.role === "idle" && !v.work && v.health > 20 && (s.policy?.overtime || canWork(v)));
    // Digging is hard work: its effort, hour by hour.
    for (const v of diggers) spend(v, EFFORT_POINTS.hard / shiftH);
    const hands = diggers.length || 0.5;
    const handsN = Math.max(1, Math.round(hands));
    let pace = 0;
    for (let i = 0; i < Math.min(handsN, 6); i++) pace += toolFor("loam", 1) * 2;
    pace = pace / Math.min(handsN, 6);
    emit(s, "ac", hands * 0.012, hallX, hallY);
    let work = hands * pace * km("PHYSICAL") * legendMods(s).earthworks;
    for (const job of s.earthworks) {
      if (work <= 0) break;
      const need = job.kind === "dig" ? DIG_HOURS : FILL_HOURS;
      const put = Math.min(work, need - job.progress, EARTH_PER_TILE * pace);
      job.progress += put;
      work -= put;
      if (job.progress >= need) {
        const was = s.map.terrain[job.tile];
        if (job.kind === "dig") s.map.terrain[job.tile] = Terrain.Water;
        else s.map.terrain[job.tile] = was === Terrain.Marsh ? Terrain.Grass : Terrain.Bank;
        log(s, job.kind === "dig" ? "A new stretch of channel fills with water." : was === Terrain.Marsh ? "A patch of marsh is drained to firm grass." : "A stretch of water is filled in.", "info");
      }
    }
    s.earthworks = s.earthworks.filter((j) => j.progress < (j.kind === "dig" ? DIG_HOURS : FILL_HOURS));
  }

  // ── Caravans ───────────────────────────────────────────
  if (s.caravan && s.caravan.until <= s.time) {
    log(s, `The ${s.caravan.name} ${s.caravan.name.endsWith("s") ? "move" : "moves"} on.`, "info");
    s.caravan = null;
  }
  s.nextCaravanAt ??= s.time + (2 + r() * 3) * 24 * 60;
  if (!s.caravan && s.time >= s.nextCaravanAt) {
    const caravan = makeCaravan(s, r);
    s.caravan = caravan;
    s.nextCaravanAt = s.time + (3 + r() * 4) * 24 * 60;
    log(s, `A caravan — the ${caravan.name} — arrives with goods to trade. They stay a day.`, "good");
  }

  // ── Woods: forests refill, trees seed and grow ────────
  const occ = occupancy(s);
  growWoods(s, c.season, r, (t) => !occ[t]);
  // Winter's first hour settles every loose tree for the season.
  if (c.season === "winter" && s.winterYear !== c.year) {
    s.winterYear = c.year;
    const { gone, snags, stand } = winterCull(s, r);
    log(s, `Winter sets in. ${gone} sprout${gone === 1 ? "" : "s"} and seedling${gone === 1 ? "" : "s"} die${gone === 1 ? "s" : ""}; ${snags} tree${snags === 1 ? "" : "s"} die${snags === 1 ? "s" : ""} standing as snag${snags === 1 ? "" : "s"}; ${stand} live${stand === 1 ? "s" : ""} to spring.`, "info");
  }

  // Wild crops come up at dawn; winter kills all but the potato.
  if (c.hour === 6) sowWild(s, r);

  // ── The day's slow processes, before dawn (§8.5) ───────
  if (c.hour === 5) {
    workDawn(s, r);
    // A winter come through: counted on the first spring dawn after it.
    const t = stats(s);
    if (c.season === "spring" && t.lastSeason === "winter") t.winters += 1;
    t.lastSeason = c.season;
    storesDaily(s);
    soilDaily(s);
    framesDaily(s);
    nodesDaily(s);
  }
  discoverNodes(s);
  // The night watch burns four torches along the perimeter.
  if (c.hour === 20 && s.decrees?.includes("nightwatch")) {
    const n = Math.min(4, s.res.torches);
    s.res.torches -= n;
    emit(s, "smk", n * 0.05, hallX, hallY);
  }

  // ── Night haunts ───────────────────────────────────────
  // A night and a half of grace. A warning at dusk; at nine, maybe, one dark
  // thing for every building no light reaches — the bigger the town, the
  // likelier (./menace nightThreat): a hamlet is mostly left alone at night.
  const nightOf = c.hour < 12 ? c.day - 1 : c.day;
  if (s.time >= 1.5 * 24 * 60) {
    const threat = nightThreat(s);
    const dark = c.hour === 19 || c.hour >= 21 || c.hour < 3 ? unlitBuildings(s).length : 0;
    if (c.hour === 19 && dark && s.hauntDay !== nightOf) log(s, `Dusk. ${dark} building${dark === 1 ? " stands" : "s stand"} beyond any light — the dark may come for ${dark === 1 ? "it" : "them"} tonight.`, "bad");
    if ((c.hour >= 21 || c.hour < 3) && s.hauntDay !== nightOf && !s.raid) {
      s.hauntDay = nightOf;
      if (dark && rng(nightOf * 104729 + s.seed * 13 + 3)() < threat) summonHaunt(s);
    }
    // Prowlers: on any night hour, now and then, something wanders in for a building at random.
    // Their own dice, so a prowl's roll does not reshuffle every other chance of the hour.
    const pr = rng(Math.floor(s.time / 60) * 7919 + s.seed * 31 + 5);
    // A town that keeps up its study keeps a better watch; one that neglects it draws more of them.
    const ng = neglect(s);
    const watch = ng.budget <= 1 ? 0.6 : ng.budget;
    if ((c.hour >= 21 || c.hour < 5) && !s.raid && pr() < prowlChance(c.day) * watch * threat) {
      summonProwlers(s, pr);
    }
  }

  // ── The wilds: lairs breed, bands roam, and strike ─────
  wildsHourly(s, r);

  // ── The land's answer (design §2, §13) ────────────────
  // The nemesis re-reads the town; every act is a stimulus; the director spends what they add up to.
  nemesisHourly(s);
  aggroHourly(s, r);

  // ── Storage ────────────────────────────────────────────
  // What the hour brought in past the room to keep it is lost: the hall's
  // cellar holds only the base goods, and anything else needs a storehouse.
  // Stock already above the room (an older town, a storehouse torn down) is
  // kept, not cut.
  const lost: Partial<Record<ResourceKey, number>> = {};
  BULK.forEach((k, i) => {
    const cap = capOf(s, k);
    if (s.res[k] > cap && s.res[k] > held[i]) {
      const keep = Math.max(cap, held[i]);
      lost[k] = (lost[k] ?? 0) + s.res[k] - keep;
      s.res[k] = keep;
    }
  });
  const wasted = Object.values(lost).reduce((a, n) => a + (n ?? 0), 0);
  // A running tally of what is being lost, fading by a tenth an hour: the inventory shows it.
  const w = (s.wasted ??= {});
  for (const k of Object.keys(w) as ResourceKey[]) {
    w[k] = (w[k] ?? 0) * 0.9;
    if ((w[k] ?? 0) < 0.5) delete w[k];
  }
  for (const [k, n] of Object.entries(lost)) w[k as ResourceKey] = (w[k as ResourceKey] ?? 0) + (n ?? 0);
  if (wasted >= 1 && s.storeWarnDay !== c.day) {
    s.storeWarnDay = c.day;
    const noStore = !s.structures.some((st) => st.type === "storehouse" && !st.buildUntil);
    const what = Object.entries(lost).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3).map(([k, n]) => `${Math.round(n ?? 0)} ${k}`).join(", ");
    log(s, noStore
      ? `Nowhere to keep it: ${what} went to waste. The hall's cellar holds only wood, stone, potatoes and meals — build a storehouse.`
      : `The stores are full: ${what} went to waste this hour — build or raise a storehouse.`, "bad");
  }

  // ── Honest endings (./psyche, ./runlog) ────────────────
  // The hour's peril, read once the hour's work is done: its alarms, the dawn's page of the run's log, and on
  // autumn's first dawn the winter audit. They only read the town and record; nothing here draws on the dice.
  if (!s.fallen) {
    const peril = perilOf(s);
    perilAlarms(s, peril);
    if (c.hour === 6) {
      noteDawn(s, peril, neglect(s).budget);
      auditAutumn(s);
    }
  }
}

/** The goods a caravan might bring, and what it asks for them. Everything is barter. */
const CARAVAN_GOODS: { get: CaravanOffer["get"]; give: Partial<Record<ResourceKey, number>>; left: number; weight: number }[] = [
  { get: { res: "silver", qty: 8 }, give: { wood: 90, stone: 40 }, left: 3, weight: 5 },
  { get: { res: "silver", qty: 6 }, give: { meals: 40 }, left: 2, weight: 4 },
  { get: { res: "silver", qty: 12 }, give: { planks: 14, bricks: 8 }, left: 2, weight: 3 },
  { get: { res: "silver", qty: 5 }, give: { platinum: 1 }, left: 3, weight: 2 },
  { get: { res: "tools", qty: 8 }, give: { wood: 50, coal: 20 }, left: 3, weight: 5 },
  { get: { res: "tools", qty: 12 }, give: { ingots: 5 }, left: 2, weight: 3 },
  { get: { res: "iron", qty: 25 }, give: { wood: 70 }, left: 2, weight: 3 },
  { get: { res: "coal", qty: 30 }, give: { wood: 45 }, left: 3, weight: 3 },
  { get: { res: "torches", qty: 10 }, give: { wood: 30, meals: 10 }, left: 3, weight: 5 },
  { get: { item: "sword1", qty: 1 }, give: { ingots: 6, silver: 2 }, left: 1, weight: 2 },
  { get: { item: "bow1", qty: 1 }, give: { planks: 10, silver: 2 }, left: 1, weight: 2 },
  { get: { item: "halberd1", qty: 1 }, give: { ingots: 7, silver: 2 }, left: 1, weight: 2 },
  { get: { item: "hidecoat", qty: 1 }, give: { meals: 30, silver: 1 }, left: 1, weight: 2 },
  { get: { item: "staff1", qty: 1 }, give: { planks: 6, silver: 4 }, left: 1, weight: 1 },
  { get: { item: "sword2", qty: 1 }, give: { platinum: 3, ingots: 8 }, left: 1, weight: 1 },
  { get: { item: "bow2", qty: 1 }, give: { platinum: 2, planks: 12 }, left: 1, weight: 1 },
];
const CARAVAN_NAMES = ["Saltroad merchants", "river traders", "Silverpath company", "hill pedlars", "Eastmarch caravan", "tinkers' wagon"];

function makeCaravan(s: GameState, r: () => number): Caravan {
  const pool = CARAVAN_GOODS.map((g, i) => ({ ...g, i }));
  const offers: CaravanOffer[] = [];
  const n = 4 + Math.floor(r() * 3);
  while (offers.length < n && pool.length) {
    let pick = r() * pool.reduce((a, g) => a + g.weight, 0);
    const k = pool.findIndex((g) => (pick -= g.weight) <= 0);
    const g = pool.splice(k < 0 ? 0 : k, 1)[0];
    offers.push({ id: `o${g.i}`, get: g.get, give: { ...g.give }, left: g.left });
  }
  // Silver is what the town cannot make easily; a caravan always has some.
  if (!offers.some((o) => o.get.res === "silver")) offers.unshift({ id: "o0", get: CARAVAN_GOODS[0].get, give: CARAVAN_GOODS[0].give, left: 2 });
  return { name: CARAVAN_NAMES[Math.floor(r() * CARAVAN_NAMES.length)], arrivedAt: s.time, until: s.time + 24 * 60, offers };
}

/** Weight a building carries as a raid's target: grows with the square of its distance from the hall. */
export function targetWeight(s: GameState, st: Structure): number {
  if (st.type === "townhall" || LIGHT_TYPES.includes(st.type) || st.buildUntil) return 0;
  return 1 + (hallDistance(s, st) / 12) ** 2;
}

function pickTarget(s: GameState, r: () => number): Structure | undefined {
  const pool = s.structures.map((st) => ({ st, w: targetWeight(s, st) })).filter((x) => x.w > 0);
  const total = pool.reduce((a, x) => a + x.w, 0);
  let pick = r() * total;
  for (const x of pool) if ((pick -= x.w) <= 0) return x.st;
  return pool[0]?.st;
}

/**
 * What the next raid could be, for the player to see at any time: the chance
 * one comes at the next check, each monster's share of the draw (for day and
 * night alike), the level it would come at, and which buildings stand most
 * exposed.
 */
export function raidForecast(s: GameState): {
  chance: number;
  nextCheckIn: number;
  monsters: { kind: string; name: string; pct: number; level: number; night: boolean }[];
  exposed: { st: Structure; share: number; bonus: number }[];
} {
  const c = clock(Math.max(s.time, s.nextRaidAt));
  const { power, avgTroopLevel } = townPower(s);
  const base = { season: c.season, villagers: s.villagers.length, power, avgTroopLevel, biome: s.biome, weightBy: (d: MonsterDef) => habitWeight(biomeOf(s), d, c.hour, air(s).regime, c.season), recentKills: (kind: string, days: number) => s.kills.filter((k) => k.kind === kind && s.time - k.at <= days * 24 * 60).length };
  const merged = new Map<string, { kind: string; name: string; w: number; level: number; night: boolean }>();
  for (const night of [false, true]) {
    for (const t of raidTable({ ...base, night } as Parameters<typeof raidTable>[0])) {
      const m = merged.get(t.def.kind) ?? { kind: t.def.kind, name: t.def.name, w: 0, level: expectedLevel(t.def, { ...base, night } as Parameters<typeof raidTable>[0]), night: !!t.def.night };
      m.w += t.weight / 2;
      merged.set(t.def.kind, m);
    }
  }
  void merged;
  // The director's view (design §2): what each of the land's answers would send, and how likely each is.
  const odds = archetypeOdds(s);
  const A = channelAggro(s);
  const days = s.time / 1440;
  const monsters = CHANNELS.map((ch, j) => {
    const level = waveLevel(A[j], days);
    const band = ROSTER[ch].filter((u) => level >= u.min);
    const kind = (band[band.length - 1] ?? ROSTER[ch][0]).kind;
    return { kind, name: MONSTERS[kind].name, pct: odds[j], level, night: !!MONSTERS[kind].night };
  }).filter((m) => m.pct > 0).sort((a, b) => b.pct - a.pct);
  const pool = s.structures.map((st) => ({ st, w: targetValue(s, st, "K") })).filter((x) => x.w > 0);
  const wsum = pool.reduce((a, x) => a + x.w, 0) || 1;
  const exposed = pool.map((x) => ({ st: x.st, share: x.w / wsum, bonus: exposure(s, x.st) })).sort((a, b) => b.share - a.share);
  const f = threatForecast(s);
  const ag = aggroOf(s);
  const chance = s.time < s.nextRaidAt ? 0 : Math.min(0.99, ag.trigger > 0 ? ag.purse / ag.trigger : 0);
  return { chance, nextCheckIn: Number.isFinite(f.hoursToWave) ? f.hoursToWave * 60 : 99 * 60, monsters, exposed };
}

/** Villager-hours of digging one tile can take in an hour: a spade or two at a time. */
export const EARTH_PER_TILE = 1.5;

/** Hours between the wilds' chances to send a raid. */
export const RAID_PERIOD = 6;

/** The chance, each period, that a town of this many draws a raid. */
export function raidChance(people: number): number {
  return Math.min(0.95, 0.3 + people * 0.02);
}

function ringsTouch(o: Structure, ring: Set<number>) {
  for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) if (ring.has(idx(x, y))) return true;
  return false;
}

function forestNear(s: GameState, st: Structure): number[] {
  const out: number[] = [];
  for (let y = st.y - 4; y < st.y + st.h + 4; y++) for (let x = st.x - 4; x < st.x + st.w + 4; x++) {
    if (inBounds(x, y) && s.map.terrain[idx(x, y)] === Terrain.Forest) out.push(idx(x, y));
  }
  return out;
}


/**
 * Troops train passively at their building. Tier is capped by the building's
 * level (three ranks per level) and, for special troops, by the weapon they
 * carry: none past 8 without one.
 *
 * Past 8 a special troop's step up is a roll, not a certainty; the player's
 * real Domain levels steady it. Wizards stop at 12 and bank experience —
 * every step beyond is an ascension the player chooses to attempt. Knights
 * stop at 22; beyond is the emblem knight's road (see ./loot).
 */
function trainMilitary(s: GameState, v: Villager, ctx: SimContext, r: () => number) {
  if (isAway(s, v)) return;
  const g = byId(s, v.work);
  const buildingCap = g ? g.level * 3 : 1;
  // Soldiers and knights train only so far in their building; past that, battle promotes them.
  const drill = g ? TRAIN_CAP[g.type] ?? 0 : 0;
  let cap = Math.min(Math.max(buildingCap, 2), drill, gearCap(v));
  if (v.role === "wizard") cap = Math.min(ASCEND_FROM, Math.max(buildingCap, 3), gearCap(v));
  if (v.role === "knight") {
    if (v.unpaidSince != null) return; // an unpaid knight does not drill
    cap = Math.min(drill, Math.max(buildingCap, 3), gearCap(v));
  }
  const gain = (v.role === "wizard" ? attrMul(attrsOf(v).lor) : 0.5) * trainingPace(ctx.input).factor * rateOf(g) * (v.nightWatch ? WATCH_WORK : 1);
  // A wizard at the threshold keeps studying: stored experience steadies the ascension.
  if (v.role === "wizard" && v.rank >= ASCEND_FROM) {
    v.xp = Math.min(xpToNext(v.rank) * 2, v.xp + gain);
    return;
  }
  v.xp += gain;
  // A soldier's higher ranks need an emblem of war's knowledge (./mastery).
  if (v.role === "infantry" || v.role === "archer" || v.role === "heavy") {
    const gate = rankCapOf(s, v, 99);
    if (v.rank >= gate && v.xp >= xpToNext(v.rank)) tellGate(s, v, "soldier's drill", WAR_KNOWLEDGE, RANK_GATES.find((g) => g.from === gate)?.depth ?? 4);
    cap = Math.min(cap, gate);
  }
  if (v.rank >= cap || v.xp < xpToNext(v.rank)) return;
  const odds = isSpecial(v) && v.rank >= 8 ? Math.max(0.2, Math.min(0.95, 0.55 + domainBonus(ctx) - 0.01 * (v.rank - 8))) : 1;
  if (r() < odds) {
    v.xp = 0;
    v.rank += 1;
    growOnRise(v, Math.floor(s.time));
  } else v.xp = xpToNext(v.rank) * 0.5; // a setback, not a loss
}

export function kill(s: GameState, v: Villager, why = "fell") {
  // A champion is not killed: they turn to stone (./champions).
  if (v.champion) return petrify(s, v);
  onDeath(s, why);
  const st = byId(s, v.work);
  if (st) st.workers = st.workers.filter((id) => id !== v.id);
  s.villagers = s.villagers.filter((x) => x.id !== v.id);
  s.deaths += 1;
  noteLoss(s);
  const home = byId(s, v.house);
  const [x, y] = home ? [home.x + home.w / 2, home.y + home.h / 2] : [40, 30];
  addCorpse(s, v.name, x, y);
  witnessDeath(s, v);
}

/**
 * One run of a newer laboratory's recipe: goods and store items in, goods and
 * items out. Refining takes three lesser essences of whichever element the
 * store holds most of, and gives a greater one. False when the inputs are short.
 */
function labRun(s: GameState, recipe: LabRecipe, k: number): boolean {
  if (!Object.entries(recipe.input).every(([key, v]) => s.res[key as keyof typeof s.res] >= (v as number))) return false;
  if (recipe.keep !== undefined && Object.keys(recipe.output).some((key) => s.res[key as keyof typeof s.res] >= recipe.keep!)) return false;
  if (recipe.items && !Object.entries(recipe.items).every(([id, n]) => stock(s, id) >= n)) return false;
  let refine: string | null = null;
  if (recipe.refine) {
    const best = ELEMENTS.map((e) => ({ e, n: stock(s, `essence-${e}-lesser`) })).filter((x) => x.n >= 3).sort((a, b) => b.n - a.n)[0];
    if (!best) return false;
    refine = best.e;
  }
  for (const [key, v] of Object.entries(recipe.input)) s.res[key as keyof typeof s.res] -= v as number;
  for (const [id, n] of Object.entries(recipe.items ?? {})) take(s, id, n);
  for (const [key, v] of Object.entries(recipe.output)) s.res[key as keyof typeof s.res] += (v as number) * k;
  for (const [id, n] of Object.entries(recipe.outItems ?? {})) store(s, id, n);
  if (refine) {
    take(s, `essence-${refine}-lesser`, 3);
    store(s, `essence-${refine}-greater`, 1);
  }
  return true;
}

export function scheduleRaid(s: GameState, r: () => number) {
  const arrivesAt = s.time + 120 + Math.floor(r() * 240);
  const c = clock(arrivesAt);
  const { power, avgTroopLevel } = townPower(s);
  const party = rollRaid(
    {
      season: c.season,
      night: c.night,
      villagers: s.villagers.length,
      power,
      avgTroopLevel,
      recentKills: (kind, days) => s.kills.filter((k) => k.kind === kind && s.time - k.at <= days * 24 * 60).length,
      biome: s.biome,
      // Habits (./habits): what this map's weather and hour draw out, and what they keep in.
      weightBy: (d) => habitWeight(biomeOf(s), d, c.hour, air(s).regime, c.season),
    },
    r
  );
  // Escorts too are of this map (./biomes).
  localizeParty(s, party);
  // The raid makes for one building — outlying ones far likelier — and
  // grows stronger the further out it stands.
  const target = pickTarget(s, r);
  const reach = target ? exposure(s, target) : 0;
  if (reach) for (const p of party) p.level += reach;
  // Any of the four sides; a big party may split and come two ways at once.
  const sides = ["east", "south", "north", "west"] as const;
  const side = sides[Math.floor(r() * sides.length)];
  const total = party.reduce((a, p) => a + p.count, 0);
  const others = sides.filter((x) => x !== side);
  const flank = total >= 4 && r() < 0.5 ? others[Math.floor(r() * others.length)] : undefined;
  s.raid = {
    // In the desert's heat, a party that does not love it waits for dusk.
    arrivesAt: arrivalFor(s, arrivesAt, party[0].kind),
    party,
    side,
    flank,
    target: target?.id,
    reach,
    phase: "incoming",
    combatants: [],
    projectiles: [],
    clock: 0,
    nextId: 1,
  };
  log(s, `Scouts report ${partyName(party)} — arriving in ${Math.round((s.raid.arrivesAt - s.time) / 60)} hours${s.raid.arrivesAt > arrivesAt ? ", when the heat breaks" : ""}.`, "bad");
  // Spring brings them more often.
  const gap = (clock(s.time).season === "spring" ? 14 : 22) + r() * 20;
  s.nextRaidAt = arrivesAt + gap * 60;
  void MONSTERS;
}

/** Throws a festival: costs a great deal, lifts mood hard for half a day. */
export const FESTIVAL_COST = { meals: 120, coin: 100, wood: 60 };

export function holdFestival(s: GameState): string | null {
  for (const [k, v] of Object.entries(FESTIVAL_COST)) if (s.res[k as keyof typeof s.res] < v) return `Not enough ${k}.`;
  for (const [k, v] of Object.entries(FESTIVAL_COST)) s.res[k as keyof typeof s.res] -= v;
  s.festivalUntil = s.time + 12 * 60;
  stats(s).festivals += 1;
  // No sudden cure: a festival is a lift through its twelve hours, and a belonging that
  // lingers for days after (./needs) — worth most to a town whose other needs are met.
  needsState(s).festAt = s.time;
  recognize(s, 4, "a feast");
  log(s, "A festival! Music, lanterns and far too much food.", "good");
  return null;
}

void countedTroops;
void MAP_H;
