import { inHallZone } from "./wilds";
import { rankCapOf } from "./mastery";
import { HEAVY_CLASSES, type HeavyClass } from "./enrol";
import { ATTR_NAME, attrMul, attrsOf, growOnRise, warMods } from "./attributes";
import { recognize } from "./recognition";
import type { Attribute } from "@prisma/client";
import { augBonus, partLabel, wizardSpire } from "./augment";
import { stats } from "./stats";
import { pushMoment } from "./moments";
import { noteWave } from "./runlog";
import { CATALOG } from "./catalog";
import { MONSTERS, VARIANTS, localKind, partyName, statsAt } from "./bestiary";
import { plural } from "./words";
import { byId, clock, countedTroops, dropLostPupils, isMilitary, log, stationedTroops } from "./state";
import { obey, stationWatch } from "./command";
import { rateOf, windfall } from "./paths";
import { DESERT_BORN, SAND_SLOW, isleEdge, sandSlowed, weatherCombat } from "./habits";
import { biomeOf } from "./biomes";

/** Lightning strikes on a fight in a thunderstorm, per second. */
const LIGHTNING_PER_SEC = 0.08;
import {
  alertRadius, captainBonus, center, exposure, idx, inBounds, isGuardPost, lightRange, passiveRadius, rng, structureMaxHp, unlitBuildings,
  wallHp, wallLevel, wallMeta, wallOrder, wallBolt,
} from "./world";
import { SOLDIER_MAX, knightTitle, roleLabel, soldierTitle } from "./catalog";

/** Chance a troop who fought and lived is promoted after a won fight. */
export const FIELD_PROMOTION = 0.3;

/*
 * Firelight against the dark. A monster of the night — or a haunt — that
 * comes into a lit pit fire's light is scorched: it moves and strikes at
 * reduced strength and burns away a little every second. One twenty levels
 * or more below the fire is destroyed outright.
 */
const SCORCH_SLOW = 0.6;
const SCORCH_WEAK = 0.6;
const SCORCH_BURN = 0.03;
export const FIRE_BANISH = 20;
const scorchFactor = (c: Combatant) => (c.scorched ? SCORCH_WEAK : 1);

/** Whether a monster is a thing of the night: firelight hurts it. */
export const isDark = (c: Combatant) => c.side === "monster" && (!!c.haunt || !!MONSTERS[c.kind as MonsterKind]?.night);

/**
 * The things of the dark burn in any light (./menace): a fire most, a
 * brazier nearly as much, a lamp at half — slowed, weakened and burning while
 * they stand in it. Only a great enough fire banishes one outright.
 */
function firelight(s: GameState, monsters: Combatant[], dt: number) {
  const lights = s.structures.filter((f) => (f.type === "pitfire" || f.type === "brazier" || f.type === "lamppost") && lightRange(f) > 0);
  for (const m of monsters) {
    if (!isDark(m)) continue;
    const lit = lights.find((f) => Math.hypot(m.x - center(f)[0], m.y - center(f)[1]) <= lightRange(f));
    if (!lit) {
      m.scorched = false;
      continue;
    }
    if (lit.type === "pitfire" && m.level <= lit.level - FIRE_BANISH) {
      m.hp = 0;
      pop(s, m.x, m.y - 1, "BANISHED", "crit");
      continue;
    }
    if (!m.scorched) pop(s, m.x, m.y - 1, "SCORCHED", "crit");
    m.scorched = true;
    m.hp -= m.maxHp * SCORCH_BURN * dt * (lit.type === "pitfire" ? 1 : lit.type === "brazier" ? 0.8 : 0.5);
  }
}
import { kill } from "./tick";
import { strikeFrame } from "./frame";
import { downhill, fieldAt, flowField, groupOf, type Field } from "./breach";
import { emit, rememberDeath } from "./aggro";
import { bodyOf, effOf } from "./body";
import { scoreWave } from "./nemesis";
import { kmod } from "./knowledge";
import { heroClassOf, heroMods, heroPower, heroesLearn, RAISED, type HeroMods } from "./heroes";
import { ENRAGE_AT, NIGHT_PROWLERS, ROAR_S, asleepFor, hasTrait, isMythicWatcher, isNightHour, monsterAuras, otherShare, trapDamage } from "./menace";
import { claimSingleton, dropsFor, gearBonus, gearStats, isAway, lootFor, store, gearCap } from "./loot";
import { championElement, kingMight, petrify } from "./champions";
import { ELEMENT_NAME, elementFactor, elementOfAttribute, type Element } from "./elements";
import { omenCombat, raiseOmen } from "./omens";
import {
  MAP_H, MAP_W, Overlay,
  type Combatant, type GameState, type MonsterKind, type Projectile, type Raid, type Structure, type Villager,
} from "./types";
import type { SimContext } from "./tick";

/**
 * Invasions, fought out in real time.
 *
 * Every combatant — monster, troop, watchtower — has hit points, damage and
 * an attack interval, and they actually close distance and trade blows. The
 * brief's order of battle: monsters go for troops and defensive structures
 * first, and only reach the rest of the town once those are down or out of
 * reach. Walls physically block anything that does not fly.
 *
 * The rules that make troop choice matter:
 *   - archers deal double damage to flying monsters;
 *   - heavy infantry carry far more hit points;
 *   - wizards deal double damage to legendary monsters;
 *   - grand wizards (15+) take the field only against legendary ones;
 *   - commanders and forge levels raise every troop's damage;
 *   - a blow of the element that beats its target's lands half as hard
 *     again, and one of the element its target beats at six tenths
 *     (./elements); heroes strike with their weapon's element, else their
 *     bound emblem's;
 *   - a mythic thing takes a twentieth of any blow but a champion's;
 *   - wizards fly, and fly faster the higher they climb.
 */

/** What a mythic thing takes of a blow from anyone but a champion. */
export const MYTHIC_WARD = 0.05;

/** A champion's multipliers in the field. The King's blows grow with the player's real emblems. */
export function championMods(s: GameState, v: Villager): { dmg: number; hp: number; range: number; interval: number; speed: number } {
  if (v.champion === "master") return { dmg: 3 + v.rank / 100, hp: 3, range: 3, interval: 0.8, speed: 3.2 };
  if (v.champion === "king") return { dmg: 2 * kingMight(s), hp: 4, range: 0.4, interval: 0.9, speed: 2.9 };
  return { dmg: 1, hp: 1, range: 0, interval: 1, speed: 0 };
}

/** The element a troop strikes with: its weapon's; a hero's bound emblem's if the weapon has none. */
export function troopElement(v: Villager): Element | null {
  const heroic = v.champion || (v.role === "wizard" && v.rank >= 15) || (v.role === "knight" && v.rank >= 22);
  return v.champion ? championElement(v) : gearStats(v).element ?? (heroic ? elementOfAttribute(v.emblem?.attribute ?? null) : null);
}

/** Wizards fly: faster than anything on foot, and faster the higher they climb. */
export const wizardSpeed = (rank: number) => Math.min(3, 2.2 + rank * 0.003);


type Stats = { hp: number; dmg: number; interval: number; range: number; speed: number };

/** The soldier tree, title by title: melee and ranged in turn, harder at every step. */
const SOLDIER_STATS: Record<string, Stats> = {
  levy: { hp: 45, dmg: 6, interval: 1.1, range: 1, speed: 1.5 },
  spearman: { hp: 65, dmg: 9, interval: 1.0, range: 1.3, speed: 1.6 },
  bowman: { hp: 42, dmg: 8, interval: 1.1, range: 5, speed: 1.6 },
  sergeant: { hp: 120, dmg: 12, interval: 1.1, range: 1, speed: 1.4 },
  crossbowman: { hp: 60, dmg: 18, interval: 1.9, range: 6, speed: 1.4 },
  halberdier: { hp: 170, dmg: 17, interval: 1.2, range: 1.4, speed: 1.3 },
  arbalestier: { hp: 150, dmg: 26, interval: 2.1, range: 7, speed: 1.2 },
};
/** Knights by title: mounted from serjeant on — faster, and harder in the charge. */
const KNIGHT_MOD: Record<string, { hp: number; dmg: number; speed: number }> = {
  squire: { hp: 0.8, dmg: 0.8, speed: 1.6 },
  serjeant: { hp: 1, dmg: 1, speed: 2.6 },
  bachelor: { hp: 1.2, dmg: 1.25, speed: 2.4 },
  paladin: { hp: 1.4, dmg: 1.4, speed: 2.4 },
  noble: { hp: 1.6, dmg: 1.6, speed: 2.5 },
  emblem: { hp: 1.8, dmg: 1.8, speed: 2.5 },
};

/** A troop's fighting kind, stats and level multiplier, by title. */
/**
 * Power by rank. Up the ladders it is linear; past the hero thresholds —
 * a knight past 22, a wizard past 15 — it grows by the log of the rank, so
 * a hundred more levels are worth about double, not twenty-fold (power creep:
 * what a hero brings is their skills, ./heroes). A raised hero fights at
 * the soldier's top rank times heroPower(level).
 */
export const rankPower = (lvl: number, threshold: number, spread: number) =>
  lvl <= threshold ? 1 + 0.15 * (lvl - 1) : (1 + 0.15 * (threshold - 1)) * (1 + 0.45 * Math.log(1 + (lvl - threshold) / spread));

export function troopStats(v: Villager): { kind: string; st: Stats; k: number } {
  const lvl = Math.max(1, v.rank);
  if (v.role === "knight") {
    const m = KNIGHT_MOD[knightTitle(lvl).id];
    const b = TROOP_STATS.knight;
    return { kind: "knight", st: { ...b, hp: b.hp * m.hp, dmg: b.dmg * m.dmg, speed: m.speed }, k: rankPower(lvl, 22, 12) };
  }
  if (v.role === "infantry" || v.role === "archer" || v.role === "heavy") {
    const t = soldierTitle(lvl);
    // Ranged titles shoot as archers (double against fliers); armoured ones fight as heavies.
    const kind = t.ranged ? "archer" : lvl >= 7 ? "heavy" : "infantry";
    const hero = v.hero && RAISED.includes(v.hero.cls) ? heroPower(v.hero.level) : 1;
    return { kind, st: SOLDIER_STATS[t.id], k: (1 + 0.06 * (lvl - 1)) * hero };
  }
  if (v.role === "wizard") return { kind: v.role, st: TROOP_STATS[v.role], k: rankPower(lvl, 15, 30) };
  return { kind: v.role, st: TROOP_STATS[v.role], k: 1 + 0.15 * (lvl - 1) };
}

const TROOP_STATS: Record<string, Stats> = {
  infantry: { hp: 60, dmg: 9, interval: 1.0, range: 1, speed: 1.6 },
  archer: { hp: 40, dmg: 7, interval: 1.1, range: 5, speed: 1.6 },
  heavy: { hp: 150, dmg: 10, interval: 1.3, range: 1, speed: 1.1 },
  wizard: { hp: 45, dmg: 14, interval: 1.5, range: 4, speed: 1.3 },
  knight: { hp: 115, dmg: 16, interval: 1.0, range: 1.2, speed: 1.9 },
};

/** A posted guard's hp and damage a second, as the square law counts them (./combat defencePower). */
function guardStrength(s: GameState, v: Villager, bonus: number, vsFlying: boolean, vsMythic: boolean) {
  const { st, k: rankK } = troopStats(v);
  const hm = heroClassOf(v) ? heroMods(v) : null;
  const wm = warMods(v);
  const k = rankK * captainBonus(s, byId(s, v.guard)) * (hm ? Math.sqrt(hm.hp * hm.dmg) : 1) * Math.sqrt(wm.hp * wm.dmg / wm.haste);
  const gear = gearBonus(v);
  const fit = v.body ? Math.max(0.2, effOf(v)) : 1;
  // Against fliers a sword reaches badly and a bow is twice the weapon (the combat rules).
  const air = !vsFlying ? 1 : st.range > 2 || v.role === "wizard" ? (v.role === "archer" || v.role === "infantry" ? 2 : 1) : 0.5;
  const ch = championMods(s, v);
  const ward = vsMythic && !v.champion ? MYTHIC_WARD : 1;
  return {
    hp: st.hp * k * gear.hp * ch.hp,
    dps: ((st.dmg * k * bonus * gear.dmg * ch.dmg) / (st.interval * ch.interval)) * fit * air * ward,
  };
}

/** The troops at their posts, not away: each with its post's centre and outer circle. */
function postedGuards(s: GameState) {
  const out: { v: Villager; x: number; y: number; r: number }[] = [];
  for (const v of countedTroops(s)) {
    if (isAway(s, v)) continue;
    const post = byId(s, v.guard);
    if (!post) continue;
    const [x, y] = center(post);
    out.push({ v, x, y, r: passiveRadius(post) });
  }
  return out;
}

/**
 * The share of a building's walls a shooter at cx,cy with range r covers,
 * sampled at twelve points around it: the fight may be on the far side.
 */
function coverShare(target: Structure, tx: number, ty: number, cx: number, cy: number, r: number) {
  let n = 0;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    if (Math.hypot(cx - (tx + Math.cos(a) * (target.w / 2 + 0.5)), cy - (ty + Math.sin(a) * (target.h / 2 + 0.5))) <= r) n++;
  }
  return n / 12;
}

const shooterRange = (t: Structure) => (t.type === "armypoint" ? 8 : 7);

/** What does not depend on the target: every posted guard's strength, the damage bonus and the militia. */
function defenceTable(s: GameState, vsFlying: boolean, vsMythic: boolean) {
  const bonus = damageBonus(s);
  const guards = postedGuards(s).map((g) => ({ ...g, ...guardStrength(s, g.v, bonus, vsFlying, vsMythic) }));
  const militia = countedTroops(s).length < 3 ? Math.min(6, s.villagers.filter((v) => !isMilitary(v)).length) : 0;
  // Only towers and the hall shoot; the rest of the town is walls to soak blows.
  const shooters = s.structures.filter((t) => !t.buildUntil && (isGuardPost(t) || t.type === "townhall")).map((t) => ({ t, c: center(t) }));
  return { bonus, guards, militia, shooters };
}

function powerWith(s: GameState, table: ReturnType<typeof defenceTable>, target: Structure | undefined, vsFlying: boolean, vsMythic: boolean) {
  const { bonus } = table;
  // Lanchester's square law for mixed forces: (Σ dps) × (Σ hp that can absorb blows).
  let dps = 0;
  let hp = 0;
  const [tx, ty] = target ? center(target) : [0, 0];
  const half = target ? Math.max(target.w, target.h) / 2 : 0;
  for (const g of table.guards) {
    if (target && Math.hypot(g.x - tx, g.y - ty) > g.r + half) continue;
    hp += g.hp;
    dps += g.dps;
  }
  let byHall = !target;
  for (const { t, c: [cx, cy] } of table.shooters) {
    // Towers and the hall shoot at whatever comes within their range of the fight; only the objective's own walls soak blows.
    // A static shooter counts for the share of the objective's walls its range covers: the fight may be on the far side.
    const covers = (r: number) => (target ? coverShare(target, tx, ty, cx, cy, r) : 1);
    if (isGuardPost(t)) {
      const share = covers(shooterRange(t)) * (vsMythic ? MYTHIC_WARD : 1);
      dps += (((t.type === "armypoint" ? 18 : 14) * t.level * bonus) / 1.1) * share;
      if (!target) hp += t.hp;
    }
    if (t.type === "townhall") {
      const share = (t === target ? 1 : covers(6)) * (vsMythic ? MYTHIC_WARD : 1);
      dps += ((10 * t.level * bonus) / 1.2) * share;
      if (share > 0.5) byHall = true;
      if (!target) hp += t.hp;
    }
  }
  if (target) hp += target.hp;
  if (byHall && table.militia) {
    hp += table.militia * 30;
    dps += ((table.militia * 4 * bonus) / 1.2) * (vsFlying ? 0.5 : 1);
  }
  return dps * hp;
}

/**
 * The town's defence as Lanchester strength (design §2.3): Σ hp × dps of
 * every posted guard, tower and the hall, and a militia when guards are few.
 * Given a target, only what can reach a fight there counts: guards whose
 * post's outer circle covers it, towers within range, the hall and its
 * militia if it is by the hall.
 */
export function defencePower(s: GameState, target?: Structure, vsFlying = false, vsMythic = false): number {
  return powerWith(s, defenceTable(s, vsFlying, vsMythic), target, vsFlying, vsMythic);
}

/**
 * Whether anything defends each building — `defencePower(s, b) > 0` — with
 * the guards weighed once for the whole town rather than once a building.
 * The land asks this of every building every hour (./needs unguarded).
 */
export function defendedTest(s: GameState): (b: Structure) => boolean {
  const table = defenceTable(s, false, false);
  return (b) => powerWith(s, table, b, false, false) > 0;
}

// ── Repel rites ───────────────────────────────────────────

const REPEL_ATTR: Record<MonsterKind, Attribute> = {
  slime: "LOGIC", bat: "REASON", spider: "STATISTIC", goblin: "CRITICAL_THINKING", skeleton: "FAITH",
  wolf: "PHYSICAL", werewolf: "FAITH", wraith: "SELF_RESPECT", minotaur: "STUBBORNNESS", troll: "STUBBORNNESS",
  lich: "REBUTTAL", golem: "ABSTRACT", wyvern: "ABSTRACT", serpent: "COMPASSION", demon: "MIND",
  dragon: "CREATIVITY", elderdragon: "CREATIVITY", harpy: "REASON", ogre: "PHYSICAL", mimic: "CRITICAL_THINKING",
  treant: "COMPASSION", salamander: "LOGIC", frostgiant: "STUBBORNNESS", banshee: "SELF_RESPECT", basilisk: "REBUTTAL",
  ghoul: "FAITH", gargoyle: "ABSTRACT", cyclops: "REASON", vampire: "FAITH", hydra: "CRITICAL_THINKING", griffin: "COMPASSION",
  wisp: "LOGIC", wendigo: "SELF_RESPECT", oni: "STUBBORNNESS", kappa: "REASON", tengu: "CRITICAL_THINKING", jiangshi: "MIND",
  kitsune: "CREATIVITY", yurei: "SELF_RESPECT", gashadokuro: "FAITH", jorogumo: "REASON", nian: "CREATIVITY",
  // Mythic things are never turned away; the attribute is only what they answer to.
  phoenix: "CREATIVITY", leviathan: "COMPASSION", behemoth: "PHYSICAL", stormroc: "CRITICAL_THINKING", raiju: "LOGIC",
  seraph: "FAITH", shadowcolossus: "MIND", voidwalker: "ABSTRACT",
  scorpion: "STUBBORNNESS", jackal: "PHYSICAL", mummy: "FAITH", sandworm: "STUBBORNNESS", djinn: "REASON", sphinx: "LOGIC",
  pixie: "CRITICAL_THINKING", skyray: "STATISTIC", cloudjelly: "LOGIC", thunderbird: "REBUTTAL", stormgiant: "PHYSICAL", skyserpent: "ABSTRACT",
};
const SCHOOLS = ["commerce", "science", "mind"] as const;

/**
 * What it takes to turn a party away without a fight: its leader's emblem
 * attribute equipped, and enough new ideas this week in one school. Higher
 * levels ask for more ideas; legendary foes cannot be turned away at all.
 */
export function repelRequirement(kind: MonsterKind, level: number) {
  const def = MONSTERS[kind];
  const school = SCHOOLS[kind.length % 3];
  return {
    possible: !def.legendary,
    attribute: REPEL_ATTR[kind],
    ideas: Math.min(8, 1 + Math.floor(level / 6)),
    school,
  };
}

export function canRepel(s: GameState, ctx: SimContext): { emblem: boolean; ideas: boolean; possible: boolean } {
  const lead = s.raid?.party[0];
  if (!lead) return { emblem: false, ideas: false, possible: false };
  const req = repelRequirement(lead.kind, lead.level);
  return {
    possible: req.possible,
    emblem: ctx.input.equippedAttributes.includes(req.attribute),
    ideas: ctx.input.newIdeasThisWeek[req.school] >= req.ideas,
  };
}

export function performRite(s: GameState, ctx: SimContext): boolean {
  const c = canRepel(s, ctx);
  if (!s.raid || s.raid.phase !== "incoming" || !c.possible || !c.emblem || !c.ideas) return false;
  s.raid.phase = "repelled";
  log(s, "The rite is performed. The raiders turn back before they reach the walls.", "good");
  s.raid = null;
  return true;
}

// ── Night haunts ──────────────────────────────────────────

/**
 * What the dark sends for a building, by the building's level: a barrow
 * wraith for the small ones, a banshee for the middling, a lich for the
 * great. The bigger the thing left unlit, the worse what comes for it.
 */
export function hauntFor(buildingLevel: number): { kind: MonsterKind; level: number } {
  if (buildingLevel <= 3) return { kind: "wraith", level: 4 + (buildingLevel - 1) * 2 };
  if (buildingLevel <= 6) return { kind: "banshee", level: 8 + (buildingLevel - 4) * 2 };
  return { kind: "lich", level: Math.min(16, 11 + (buildingLevel - 7)) };
}

/**
 * At night, one dark thing for every building no light reaches. They come
 * straight for their building, fight whoever stands in the way, and are
 * gone the moment it falls. Returns how many came.
 */
export function summonHaunt(s: GameState): number {
  if (s.raid) return 0;
  const dark = unlitBuildings(s);
  if (!dark.length) return 0;
  // The further out a dark building stands, the worse what comes for it.
  const haunt = dark.map((st) => {
    const h = hauntFor(st.level);
    return { structId: st.id, kind: localKind(s, h.kind), level: h.level + exposure(s, st) };
  });
  const party = new Map<MonsterKind, { kind: MonsterKind; level: number; count: number }>();
  for (const h of haunt) {
    const p = party.get(h.kind) ?? { kind: h.kind, level: 0, count: 0 };
    p.level = Math.max(p.level, h.level);
    p.count += 1;
    party.set(h.kind, p);
  }
  s.raid = {
    arrivesAt: s.time, party: [...party.values()].sort((a, b) => b.count - a.count), side: "north", phase: "fighting",
    combatants: [], projectiles: [], clock: 0, nextId: 1, haunt,
  };
  const n = haunt.length;
  log(s, `Out of the dark: ${n} ${n === 1 ? "thing comes" : "things come"} for the unlit ${n === 1 ? "building" : "buildings"}.`, "bad");
  return n;
}

/** What wanders in out of the dark: small things, and one or two of them. */
const PROWLERS: MonsterKind[] = ["wolf", "goblin", "ghoul", "bat", "wisp", "kappa", "spider"];

/** The chance, on a night hour, that something prowls in: rising with the days, never more than about one hour in four. */
export const prowlChance = (day: number) => Math.min(0.26, 0.08 + 0.006 * day);

/**
 * Night prowlers. On any night hour something may wander in out of the
 * dark for one building — any building, lit or not, chosen at random. They
 * are one or two small things, far less than a raid, but they come often,
 * and a fire's light only scorches them. Returns how many came.
 */
export function summonProwlers(s: GameState, r: () => number): number {
  if (s.raid) return 0;
  const targets = s.structures.filter((st) => !st.buildUntil && st.type !== "townhall" && st.type !== "farm" && st.type !== "waterfarm" && st.type !== "lamppost");
  if (!targets.length) return 0;
  const day = Math.floor(s.time / (24 * 60));
  // In the opening only the things of the dark prowl, and they make for what the light does not reach
  // (./menace); after it, more and more of what comes is anything at all.
  const ofDark = r() >= otherShare(day + 1);
  const unlit = ofDark ? targets.filter((t) => unlitBuildings(s).includes(t)) : [];
  const pool = unlit.length ? unlit : targets;
  const st = pool[Math.floor(r() * pool.length)];
  const list = ofDark ? NIGHT_PROWLERS : PROWLERS;
  const kind = localKind(s, list[Math.floor(r() * list.length)]);
  const def = MONSTERS[kind];
  const level = Math.max(def.min, Math.min(def.max, 1 + Math.floor(day / 4) + Math.floor(exposure(s, st) / 2)));
  const count = r() < 0.35 ? 2 : 1;
  const haunt = Array.from({ length: count }, () => ({ structId: st.id, kind, level }));
  s.raid = {
    arrivesAt: s.time, party: [{ kind, level, count }], side: "north", phase: "fighting",
    combatants: [], projectiles: [], clock: 0, nextId: 1, haunt, prowl: true,
  };
  log(s, `Something prowls in out of the dark: ${count === 1 ? "a" : "two"} ${count > 1 ? plural(def.name) : def.name} (L${level}), making for the ${CATALOG[st.type].name.toLowerCase()} at ${st.x},${st.y}.`, "bad");
  return count;
}

// ── Setup ─────────────────────────────────────────────────

/**
 * Where a raid enters. With a target, it comes out of the wilds some way off
 * that building on the given side; without one, from the map's edge.
 */
function spawnPoint(side: "east" | "south" | "north" | "west", r: () => number, aim?: Structure): [number, number] {
  if (aim) {
    const [cx, cy] = center(aim);
    const d = 22 + r() * 8;
    const [dx, dy] = side === "east" ? [1, 0] : side === "west" ? [-1, 0] : side === "north" ? [0, -1] : [0, 1];
    const jitter = (r() - 0.5) * 10;
    return [
      Math.max(1.5, Math.min(MAP_W - 1.5, cx + dx * d + dy * jitter)),
      Math.max(1.5, Math.min(MAP_H - 1.5, cy + dy * d + dx * jitter)),
    ];
  }
  if (side === "east") return [MAP_W - 1.5, 18 + r() * (MAP_H - 36)];
  if (side === "south") return [30 + r() * (MAP_W - 50), MAP_H - 1.5];
  if (side === "north") return [30 + r() * (MAP_W - 50), 1.5];
  return [1.5, 18 + r() * (MAP_H - 36)];
}

function damageBonus(s: GameState) {
  const commanders = s.villagers.filter((v) => v.role === "commander").length;
  const forge = s.structures.filter((st) => st.type === "forge" && !st.buildUntil).reduce((a, st) => a + st.level, 0);
  return (1 + Math.min(0.6, commanders * 0.08)) * (1 + forge * 0.04) * (1 + kmod(s, "REBUTTAL"));
}

function start(s: GameState) {
  const raid = s.raid!;
  const r = rng(Math.floor(s.time) + 7);
  const legendary = !raid.haunt && raid.party.some((p) => MONSTERS[p.kind].legendary);
  // A legendary or mythic thing turns the air as it comes (./omens).
  if (legendary) raiseOmen(s, raid.party);
  const om = omenCombat(s);
  // The weather takes sides (./habits): reach and aim, the pace of what flies, the heat, the thunder.
  const wc = weatherCombat(s);
  const biome = biomeOf(s);

  // A haunt rises around its buildings rather than marching in from an edge.
  for (const h of raid.haunt ?? []) {
    const st = byId(s, h.structId);
    if (!st) continue;
    const def = MONSTERS[h.kind];
    const [cx, cy] = center(st);
    const a = r() * Math.PI * 2;
    // A haunt rises close by its building; prowlers wander in from further out.
    const d = raid.prowl ? 12 + r() * 5 : 6 + r() * 3;
    const { hp, dmg } = statsAt(def, h.level);
    raid.combatants.push({
      id: raid.nextId++, side: "monster", kind: h.kind, level: h.level,
      x: Math.max(1, Math.min(MAP_W - 2, cx + Math.cos(a) * d)), y: Math.max(1, Math.min(MAP_H - 2, cy + Math.sin(a) * d)),
      hp, maxHp: hp, dmg, interval: def.interval, cooldown: r() * def.interval,
      range: def.range, speed: def.speed, flying: !!def.flying, legendary: false, targetStruct: st.id, haunt: true,
      variant: Math.floor(r() * VARIANTS),
    });
  }

  const aim = raid.target ? byId(s, raid.target) : undefined;
  for (const p of raid.haunt ? [] : raid.party) {
    const def = MONSTERS[p.kind];
    const main: [number, number] = raid.origin ? [raid.origin[0], raid.origin[1]] : spawnPoint(raid.side, r, aim);
    const flank = raid.flank ? spawnPoint(raid.flank, r, aim) : main;
    for (let i = 0; i < p.count; i++) {
      const { hp, dmg } = statsAt(def, p.level);
      // A split party sends every other member round the second side.
      // On the isles a walker climbs out of the clouds at the edge of the town's island (./habits).
      const edge = !def.flying && !def.burrows && !raid.origin ? isleEdge(s, aim, i % 2 && raid.flank ? raid.flank : raid.side, (r() - 0.5) * 12) : null;
      const base = edge ?? (i % 2 ? flank : main);
      raid.combatants.push({
        id: raid.nextId++, side: "monster", kind: p.kind, level: p.level,
        x: base[0] + (r() - 0.5) * 4, y: base[1] + (r() - 0.5) * 4,
        hp, maxHp: hp, dmg: Math.round(dmg * (def.element === "thunder" ? wc.thunder : 1)),
        interval: def.interval * (DESERT_BORN.has(p.kind) ? 1 : wc.heat), cooldown: r() * def.interval,
        range: def.range, speed: def.speed * (def.flying ? wc.flyerSpeed : 1) * (sandSlowed(biome, p.kind, !!def.flying) ? SAND_SLOW : 1),
        flying: !!def.flying, legendary: !!def.legendary,
        targetStruct: aim?.id ?? null, element: def.element ?? null, mythic: !!def.mythic, variant: Math.floor(r() * VARIANTS), burrow: def.burrows || undefined,
        roarUntil: def.legendary ? ROAR_S : undefined,
      });

    }
  }

  // Posted guards defend, and start inside their tower: they come out when
  // something enters its radius (see wakeGuards). Troops the player has
  // stationed out on the map (./command) stand where they were put, and hold
  // the ground around it.
  const bonus = damageBonus(s);
  const troops = [...new Set([...countedTroops(s), ...stationedTroops(s)])];
  // By night only the night watch answers; by day the watch sleeps from nine to five (./menace).
  const hour = clock(s.time).hour;
  const sleeping = (v: Villager) => asleepFor(v, hour);
  if (isNightHour(hour) && !raid.haunt && !s.villagers.some((v) => v.nightWatch)) log(s, "No one keeps the night watch: only the towers and the hall answer the alarm.", "bad");
  else if (isNightHour(hour) && raid.haunt && !s.villagers.some((v) => v.nightWatch)) log(s, "No one keeps the night watch: the town sleeps through it, and only the towers answer.", "bad");
  // The mythic watch: anything mythic, and the town's grand wizards, emblem knights and champions
  // ride out to meet it themselves — posted or not, awake or not — from wherever they are in town.
  const mythicComes = !raid.haunt && raid.party.some((p) => MONSTERS[p.kind]?.mythic);
  const watchers = mythicComes ? s.villagers.filter((v) => isMythicWatcher(v) && !v.scout && !(v.awayUntil && v.awayUntil > s.time) && !isAway(s, v)) : [];
  if (watchers.length) {
    const names = watchers.slice(0, 3).map((v) => v.name).join(", ") + (watchers.length > 3 ? ` and ${watchers.length - 3} more` : "");
    log(s, `Something mythic comes — ${names} ${watchers.length === 1 ? "rides" : "ride"} out to meet it, unbidden.`, "good");
  }
  for (const v of [...new Set([...troops, ...watchers])]) {
    const called = watchers.includes(v);
    if (sleeping(v) && !called) continue;
    // Grand wizards stay in the hut unless something legendary comes — or they were sent out.
    if (v.role === "wizard" && v.rank >= 15 && !legendary && !v.stand && !called) continue;
    // A knight out on a sortie is not here to fight.
    if (isAway(s, v)) continue;
    const tower = byId(s, v.guard);
    const from = called && !tower && !v.stand ? byId(s, v.work) ?? s.structures.find((st) => st.type === "townhall") : undefined;
    const at = v.stand ?? (tower ? center(tower) : from ? center(from) : null);
    if (!at) continue;
    const [x, y] = at;
    const field = v.stand ? { anchor: [v.stand[0], v.stand[1]] as [number, number], inside: false } : called ? { inside: false } : { inside: true };
    const { kind: fightAs, st, k: rankK } = troopStats(v);
    const lvl = Math.max(1, v.rank);
    // An army point's knight leads its guards: harder hitting, harder to kill.
    const k = rankK * captainBonus(s, tower);
    const gs = gearStats(v);
    const ch = championMods(s, v);
    // A hero's skills (./heroes): on themselves here; their auras each tick of the fight.
    const hm0: HeroMods | undefined = heroClassOf(v) ? heroMods(v) : undefined;
    // Their attributes (./attributes): blows, speed, hit points and valor; a healer's Spirit, a wizard's Insight.
    const wm = warMods(v);
    const va = attrsOf(v);
    const hm: HeroMods | undefined = hm0 ? { ...hm0, heal: hm0.heal * attrMul(va.spi) } : undefined;
    // A heavy soldier's class (./enrol): the shieldbearer's bulk, the juggernaut's plate, the pike's reach.
    const hc = v.role === "heavy" && v.heavy ? HEAVY_CLASSES[v.heavy] : undefined;
    const hp = Math.round(st.hp * k * gs.hp * ch.hp * (hm?.hp ?? 1) * wm.hp * (hc?.hp ?? 1));
    // Wizards fight with the parts set into the town's best mage spire: its jewels, and its eyes and heart for reach.
    const spire = v.role === "wizard" ? wizardSpire(s) : undefined;
    const sb = augBonus(spire);
    const reach = st.range + (spire ? sb.eye + sb.heart / 3 : 0) + gs.range + ch.range + (hm?.range ?? 0) + (wm.arcane ? 0.1 * (va.ins - 8) : 0) + (hc?.reach ?? 0);
    // Bows and spells see short in fog, rain and blown sand.
    const range = reach > 2 ? reach * wc.range : reach;
    const flies = v.role === "wizard";
    const pace = (v.champion ? ch.speed : flies ? wizardSpeed(v.rank) : st.speed) * gs.speed * om.speed * (hc?.pace ?? 1);
    raid.combatants.push({
      id: raid.nextId++, side: "defender", kind: fightAs, level: lvl,
      x, y, hp, maxHp: hp, dmg: Math.round(st.dmg * k * bonus * gs.dmg * (1 + sb.jewel) * ch.dmg * om.dmg * (range > 2 ? om.ranged * wc.rangedDmg : 1) * rateOf(tower) * (hm?.dmg ?? 1) * wm.dmg * (hc?.dmg ?? 1)),
      interval: st.interval * (1 - gs.haste) * ch.interval * wc.heat * (hm?.haste ?? 1) * wm.haste, cooldown: 0, range, speed: pace, augFrom: spire?.id,
      valor: wm.valor,
      flying: flies, legendary: v.role === "wizard" && v.rank >= 15, villagerId: v.id, post: called ? undefined : tower?.id, ...field,
      mythicWatch: called || undefined,
      heavyCls: hc ? v.heavy : undefined,
      element: troopElement(v), champion: v.champion ?? undefined,
      hm, heroCls: v.hero && RAISED.includes(v.hero.cls) ? v.hero.cls : undefined,
    });
    // An emblem knight's battalion rides with them: sworn soldiers, not villagers.
    for (let i = 0; i < Math.min(8 + (hm?.battalion ?? 0), (v.battalion ?? 0) + (hm?.battalion ?? 0)); i++) {
      const bl = Math.max(1, Math.floor(lvl / 2));
      const bk = 1 + 0.15 * (bl - 1);
      raid.combatants.push({
        id: raid.nextId++, side: "defender", kind: "battalion", level: bl,
        x: x + (r() - 0.5) * 3, y: y + 0.5 + r(), hp: Math.round(60 * bk), maxHp: Math.round(60 * bk),
        dmg: Math.round(9 * bk * bonus * om.dmg), interval: 1, cooldown: r(), range: 1, speed: 1.5 * om.speed,
        flying: false, legendary: false, post: tower?.id, leader: v.id, ...field,
      });
    }
  }

  // Militia: with fewer than three guards posted, villagers take up
  // pitchforks — but like guards they wait, and only rise when something
  // comes near the hall itself.
  const troopCount = raid.combatants.filter((c) => c.side === "defender").length;
  const hall = s.structures.find((st) => st.type === "townhall");
  if (troopCount < 3 && hall) {
    const [hx, hy] = center(hall);
    const levies = s.villagers.filter((v) => !isMilitary(v) && v.health > 30 && !sleeping(v)).slice(0, 6);
    for (const v of levies) {
      raid.combatants.push({
        id: raid.nextId++, side: "defender", kind: "militia", level: 1,
        x: hx + (r() - 0.5) * 6, y: hy + 4 + r() * 2,
        hp: 30, maxHp: 30, dmg: Math.round(4 * bonus * rateOf(hall)), interval: 1.2, cooldown: r(), range: 1, speed: 1.5,
        flying: false, legendary: false, villagerId: v.id, post: hall.id, inside: true,
      });
    }
  }

  // The town hall keeps a guard post of its own.
  const hallSt = s.structures.find((st) => st.type === "townhall");
  if (hallSt) {
    const [cx, cy] = center(hallSt);
    raid.combatants.push({
      id: raid.nextId++, side: "defender", kind: "hall", level: hallSt.level,
      x: cx, y: cy, hp: hallSt.hp, maxHp: structureMaxHp(hallSt),
      dmg: Math.round(10 * hallSt.level * bonus * rateOf(hallSt)), interval: 1.2, cooldown: 0, range: 6, speed: 0,
      flying: false, legendary: false, structId: hallSt.id,
    });
  }

  for (const t of s.structures.filter((st) => isGuardPost(st) && !st.buildUntil)) {
    const [cx, cy] = center(t);
    const camp = t.type === "armypoint";
    raid.combatants.push({
      id: raid.nextId++, side: "defender", kind: "tower", level: t.level,
      x: cx, y: cy - 1, hp: t.hp, maxHp: structureMaxHp(t),
      dmg: Math.round((camp ? 18 : 14) * t.level * bonus * (1 + augBonus(t).jewel) * om.towers * om.ranged * om.dmg * rateOf(t) * wc.rangedDmg), interval: 1.1, cooldown: 0, range: ((camp ? 8 : 7) + augBonus(t).eye) * wc.range, speed: 0,
      flying: false, legendary: false, structId: t.id, augFrom: t.aug ? t.id : undefined,
    });
  }
  raid.started = true;
  raid.pops = [];
  // Every legend announces itself (./menace): the roar that makes the defenders near it falter.
  for (const m of raid.combatants) if (m.side === "monster" && m.legendary) pop(s, m.x, m.y - 2, m.mythic ? "IT ROARS" : "ROAR", "crit");
  raid.spoils = { kept: {}, lost: 0 };
  if (!raid.haunt) log(s, "They are here. To arms!", "bad");
}

/** What a fallen monster leaves, into the forge if there is one and it has room. */
function spoil(s: GameState, m: Combatant) {
  const raid = s.raid!;
  const r = rng(m.id * 7919 + Math.floor(s.time));
  const kind = m.kind as MonsterKind;
  const drops: Record<string, number> = { ...dropsFor(kind, m.level, m.legendary, r) };
  for (const [id, n] of Object.entries(lootFor(kind, m.level, r))) drops[id] = (drops[id] ?? 0) + n;
  for (const [item, n] of Object.entries(drops)) {
    const lost = store(s, item, n);
    raid.spoils!.lost += lost;
    if (n > lost) raid.spoils!.kept[item] = (raid.spoils!.kept[item] ?? 0) + n - lost;
  }
  // A mythic thing's first fall gives up one of the singular artifacts of its element; later ones, now and then.
  if (m.mythic) {
    const first = s.kills.filter((k) => k.kind === kind).length <= 1;
    if (first || r() < 0.15) {
      const id = claimSingleton(s, r, MONSTERS[kind].element);
      if (id) {
        if (store(s, id, 1) > 0) s.singletons = (s.singletons ?? []).filter((x) => x !== id);
        else {
          raid.spoils!.kept[id] = 1;
          log(s, `Among what the ${MONSTERS[kind].name.toLowerCase()} leaves is something singular.`, "good");
        }
      }
    }
  }
}

function spoilsText(sp: { kept: Record<string, number>; lost: number } | undefined): string {
  if (!sp) return "";
  const kept = Object.entries(sp.kept).map(([k, n]) => `${n} ${(partLabel(k) ?? k).toLowerCase()}`).join(", ");
  const why = Object.keys(sp.kept).length ? "the forge is full" : "no forge to keep them";
  const lost = sp.lost ? ` (${sp.lost} left on the field: ${why})` : "";
  return kept || lost ? ` Spoils: ${kept || "nothing kept"}${lost}.` : "";
}

// ── Step ──────────────────────────────────────────────────

const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from a point to a structure's footprint edge. */
function distToStruct(a: { x: number; y: number }, st: Structure) {
  const cx = Math.max(st.x, Math.min(a.x, st.x + st.w));
  const cy = Math.max(st.y, Math.min(a.y, st.y + st.h));
  return Math.hypot(a.x - cx, a.y - cy);
}

function pop(s: GameState, x: number, y: number, text: string, tone: "hit" | "crit" | "heal" = "hit") {
  const raid = s.raid!;
  raid.pops!.push({ x, y, text, at: raid.clock, tone });
  if (raid.pops!.length > 40) raid.pops!.shift();
}

export function destroyStructure(s: GameState, st: Structure) {
  for (const v of s.villagers) if (v.guard === st.id) v.guard = null;
  s.structures = s.structures.filter((x) => x.id !== st.id);
  for (let y = st.y; y < st.y + st.h; y++) for (let x = st.x; x < st.x + st.w; x++) {
    if (!inBounds(x, y)) continue;
    const i = idx(x, y);
    s.map.overlay[i] = Overlay.Debris;
  }
  for (const v of s.villagers) {
    if (v.work === st.id) v.work = null;
    if (v.house === st.id) v.house = null;
  }
  log(s, `The ${CATALOG[st.type].name.toLowerCase()} is destroyed.`, "bad");
}

/** A town this small or smaller is finished when its hall falls; a larger one is looted and lives. */
export const HALL_FALL_FINAL = 3;
/** What the raiders carry off when the hall falls: this share of every store. */
export const HALL_FALL_LOOT = 0.35;

/**
 * The hall falls. A heavy blow, not the end: the raiders loot the stores,
 * cut down a quarter of the town — those who stood nearest the hall first —
 * and grief and ruin hang over it for days. Whether it recovers is the work
 * of the days after, not of the one fight (./needs): a town whose needs are
 * met rebuilds; one already failing does not. Only a town down to a handful
 * is finished outright.
 */
function sack(s: GameState) {
  if (s.villagers.length <= HALL_FALL_FINAL) return sackAll(s);
  const hall = s.structures.find((st) => st.type === "townhall");
  const [hx, hy] = hall ? center(hall) : [40, 30];
  const at = (v: Villager) => {
    const post = byId(s, v.guard) ?? byId(s, v.work) ?? byId(s, v.house);
    return post ? Math.hypot(center(post)[0] - hx, center(post)[1] - hy) : 99;
  };
  const toll = Math.ceil(s.villagers.length / 4);
  const fallen = s.villagers.filter((v) => !v.champion).sort((a, b) => at(a) - at(b)).slice(0, toll);
  for (const v of fallen) kill(s, v, "cut down when the hall fell");
  let carried = 0;
  for (const k of Object.keys(s.res) as (keyof typeof s.res)[]) {
    const take = Math.floor(s.res[k] * HALL_FALL_LOOT);
    if (take <= 0) continue;
    s.res[k] -= take;
    carried += take;
  }
  if (hall) hall.hp = Math.round(structureMaxHp(hall) * 0.3);
  s.debuffs.push({ id: "sacked", label: "The hall fell — grief and ruin", until: s.time + 2 * 24 * 60, moodPerHour: -0.3, production: 0.8 });
  s.mood = Math.max(0, s.mood - 8);
  s.hallFalls = (s.hallFalls ?? 0) + 1;
  recognize(s, -15, "the hall fell");
  // The next wave gives the town time to pick itself up.
  s.nextRaidAt = s.time + 3 * 24 * 60;
  log(s, `The hall falls. The raiders loot the stores — ${carried} goods carried off — and ${fallen.length} ${fallen.length === 1 ? "is" : "are"} killed before they go. The town reels, but it stands.`, "bad");
  scoreWave(s, true);
  if (s.raid) noteWave(s, partyName(s.raid.party), "hall", 0, fellFighting(s.raid) + fallen.length, s.villagers.length);
  s.raid = null;
}

/** Townsfolk who fell in the fight itself, before the hall did (for the run's log). */
const fellFighting = (raid: Raid) => raid.combatants.filter((c) => c.side === "defender" && c.villagerId && c.hp <= 0).length;

/**
 * The town is sacked: every villager dies, every specialty with them, and a
 * grief that lingers. The hall itself survives as a shell to rebuild from.
 */
function sackAll(s: GameState) {
  const people = s.villagers.length;
  for (const v of s.villagers.filter((x) => x.champion)) petrify(s, v, "is overwhelmed as the town falls");
  s.villagers = [];
  for (const st of s.structures) {
    st.workers = [];
    st.training = null;
  }
  const hall = s.structures.find((st) => st.type === "townhall");
  if (hall) hall.hp = Math.round(structureMaxHp(hall) * 0.3);
  s.debuffs.push({ id: "sacked", label: "Sacked — grief and ruin", until: s.time + 3 * 24 * 60, moodPerHour: -0.4, production: 0.7 });
  s.mood = Math.min(s.mood, 30);
  // The next raid gives the survivors' successors time to arrive.
  s.nextRaidAt = s.time + 4 * 24 * 60;
  log(s, "The monsters broke through. The town is sacked; everyone is gone.", "bad");
  scoreWave(s, true);
  if (s.raid) noteWave(s, partyName(s.raid.party), "sacked", 0, fellFighting(s.raid) + people, 0);
  // The run is over. The ruins can be rebuilt, but the tally stops here: a town already fallen keeps the first cause.
  if (!s.fallen) {
    s.fallCause = "sacked";
    s.fallen = { at: s.time, day: clock(s.time).day };
  }
  s.raid = null;
}

export function stepCombat(s: GameState, dt: number) {
  fightStep(s, dt);
  dropLostPupils(s);
}

function fightStep(s: GameState, dt: number) {
  const raid = s.raid;
  if (!raid || raid.phase !== "fighting") return;
  if (!raid.started) start(s);
  raid.clock += dt;

  const alive = raid.combatants.filter((c) => c.hp > 0);
  const monsters = alive.filter((c) => c.side === "monster");
  const defenders = alive.filter((c) => c.side === "defender");

  wakeGuards(s, monsters, defenders);
  heroAuras(defenders, monsters, dt);
  monsterAuras(defenders, monsters, raid.clock, dt);
  firelight(s, monsters, dt);
  // A thunderstorm's lightning falls on the field, on either side (./habits).
  if (weatherCombat(s).lightning && rng(Math.floor(raid.clock * 10) * 7 + raid.nextId)() < LIGHTNING_PER_SEC * dt) {
    const field = alive.filter((c) => !c.structId && !c.inside);
    if (field.length) {
      const hit = field[Math.floor(rng(Math.floor(raid.clock * 100))() * field.length)];
      const burn = Math.max(1, Math.round(hit.maxHp * 0.12));
      hit.hp -= burn;
      raid.flashAt = raid.clock;
      pop(s, hit.x, hit.y - 1.5, `LIGHTNING -${burn}`, "crit");
    }
  }

  // A sack ends the raid mid-step; nobody may act on a raid that is over.
  for (const m of monsters) {
    if (!s.raid) return;
    moveMonster(s, m, defenders, dt);
  }
  for (const d of defenders) {
    if (!s.raid) return;
    moveDefender(s, d, monsters, dt);
  }

  // Projectiles in flight: each at its own pace.
  raid.projectiles = raid.projectiles.filter((p) => (p.t += dt * 3 * (p.v ?? 1)) < 1);

  // Deaths.
  for (const c of raid.combatants) {
    if (c.hp > 0 || (c as { dead?: boolean }).dead) continue;
    // The phoenix burns down and rises from its ashes, once.
    if (c.side === "monster" && c.kind === "phoenix" && !c.reborn && !(c as { faded?: boolean }).faded) {
      c.reborn = true;
      c.hp = Math.round(c.maxHp * 0.5);
      pop(s, c.x, c.y - 1, "REBORN", "crit");
      continue;
    }
    (c as { dead?: boolean }).dead = true;
    if (c.side === "monster" && (c as { faded?: boolean }).faded) continue;
    if (c.side === "monster") {
      s.kills.push({ kind: c.kind as MonsterKind, at: s.time });
      s.res.coin += c.level * 4;
      spoil(s, c);
      // Blood on the snow, and the land remembers where its own fell.
      emit(s, "bio", Math.min(40, 2 + c.level * 0.8), c.x, c.y);
      rememberDeath(s, c.x, c.y);
    } else if (c.villagerId) {
      const v = s.villagers.find((x) => x.id === c.villagerId);
      if (v?.champion) {
        pop(s, c.x, c.y - 1, "TURNED TO STONE", "crit");
        petrify(s, v, "falls in the fight");
      } else if (v) {
        // The dead are dead: whoever falls in the fight is gone, with all they were (./recognition counts it).
        kill(s, v, "fell defending the town");
        log(s, `${v.name} falls defending the town.`, "bad");
      }
    } else if (c.structId) {
      const t = byId(s, c.structId);
      if (t?.type === "townhall") return sack(s);
      if (t) destroyStructure(s, t);
    }
  }
  if (!s.raid) return; // sacked mid-step

  if (!raid.combatants.some((c) => c.side === "monster" && c.hp > 0)) {
    const slain = raid.combatants.filter((c) => c.side === "monster" && !(c as { faded?: boolean }).faded);
    const levels = slain.reduce((a, c) => a + c.level, 0);
    const spoils = spoilsText(raid.spoils);
    const purse = levels * 4;
    if (slain.length) {
      const t = stats(s);
      if (raid.prowl) t.prowlsWon += 1;
      else if (raid.haunt) t.hauntsWon += 1;
      else if (!raid.retreated) t.raidsWon += 1;
    }
    if (raid.prowl) log(s, slain.length ? `The prowlers are driven off. ${levels * 4} coin.${spoils}` : "The prowlers slink back into the dark, their work done.", slain.length ? "good" : "bad");
    else if (raid.haunt) log(s, slain.length ? `The night haunt is driven off. ${levels * 4} coin.${spoils}` : "The haunt fades, its work done.", slain.length ? "good" : "bad");
    else if (raid.retreated) log(s, `Having brought down the ${raid.retreated}, they drag off into the fog.${slain.length ? ` ${slain.length} did not make it: ${levels * 4} coin.${spoils}` : ""}`, "bad");
    else log(s, `The raid is broken.${purse > 0 ? ` ${purse} coin taken from the fallen.` : ""}${spoils}`, "good");
    const lost = raid.combatants.filter((c) => c.side === "defender" && c.villagerId && c.hp <= 0).length;
    // A wave broken is a moment the screen shows (./moments); the night's skirmishes are only logged.
    if (!raid.prowl && !raid.haunt && !raid.retreated && slain.length) {
      pushMoment(s, { kind: "wave", title: `Wave broken · ${slain.length} slain · ${lost} lost${purse > 0 ? ` · +${purse} coin` : ""}`, lines: spoils ? [spoils.trim()] : [], goods: purse > 0 ? { coin: purse } : undefined });
    }
    if (!raid.haunt && !raid.retreated && slain.length) s.hopeEvents = (s.hopeEvents ?? 0) + 5;
    // The town's name (./recognition): a raid broken, a night held, a legend slain.
    if (slain.length && !raid.retreated) recognize(s, raid.haunt ? 1 : 3, raid.haunt ? "a night held" : "a raid broken");
    if (slain.some((c) => c.legendary)) recognize(s, 10, "a legend slain");
    // Time served: everyone who fought and lived has a chance to be promoted
    // in the field. It is the only way past what the barracks and the army
    // school can teach.
    // The land scores the wave; the run's log keeps it with its grade (./runlog). A band out of the fog was never scored.
    const scored = !raid.haunt && !!s.nemesis?.before;
    if (!raid.haunt) scoreWave(s);
    if (!raid.prowl && !raid.haunt) noteWave(s, partyName(raid.party), raid.retreated ? "withdrew" : "broken", slain.length, lost, undefined, scored ? s.nemesis?.history[0]?.reward : undefined);
    // The heroes who stood in it and lived learn from it (./heroes): by the levels slain, squared.
    if (!raid.haunt) {
      const stood = raid.combatants
        .filter((c) => c.side === "defender" && c.villagerId && c.fought && c.hp > 0)
        .map((c) => s.villagers.find((v) => v.id === c.villagerId))
        .filter((v): v is Villager => !!v);
      heroesLearn(s, stood, slain.map((c) => c.level));
    }
    const pr = rng(Math.floor(s.time) * 13 + raid.nextId);
    for (const c of raid.combatants) {
      if (c.side !== "defender" || !c.villagerId || !c.fought || c.hp <= 0) continue;
      const v = s.villagers.find((x) => x.id === c.villagerId);
      if (!v) continue;
      const soldier = v.role === "infantry" || v.role === "archer" || v.role === "heavy";
      const knight = v.role === "knight";
      if (!(soldier && v.rank < Math.min(SOLDIER_MAX, rankCapOf(s, v, SOLDIER_MAX))) && !(knight && v.rank < 22)) continue;
      if (v.rank >= gearCap(v)) continue; // past level 8, rank needs a weapon to match
      // A scuffle with a prowler in the dark teaches little: a tenth of a battle's chance.
      if (pr() >= FIELD_PROMOTION * (raid.prowl ? 0.1 : 1)) continue;
      const before = roleLabel(v.role, v.rank);
      v.rank += 1;
      v.xp = 0;
      const grew = growOnRise(v, Math.floor(s.time) + raid.nextId);
      const now = roleLabel(v.role, v.rank);
      const newTitle = before.replace(/ \d+$/, "") !== now.replace(/ \d+$/, "");
      const plus = grew ? ` (+1 ${ATTR_NAME[grew]})` : "";
      log(s, newTitle ? `${v.name} is promoted in the field: now ${now}${plus}.` : `${v.name} rises to ${now} for service in the fight${plus}.`, "good");
    }
    // Survivors carry their wounds home; towers keep theirs.
    for (const c of raid.combatants) {
      if (c.structId) {
        const t = byId(s, c.structId);
        if (t) t.hp = Math.max(1, c.hp);
      }
    }
    s.raid = null;
  }
}

/**
 * Guards inside a post come out the moment a monster crosses its alert
 * radius — measured from the post's centre — or the post itself falls.
 */
function wakeGuards(s: GameState, monsters: Combatant[], defenders: Combatant[]) {
  const called = new Set<number>();
  for (const d of defenders) {
    if (!d.inside || d.post === undefined) continue;
    const post = byId(s, d.post);
    if (!post) {
      d.inside = false;
      continue;
    }
    const [cx, cy] = center(post);
    // The omen, and the weather: guards see late in fog and blown sand (./habits).
    const warp = omenCombat(s).alert * weatherCombat(s).alert;
    const R = alertRadius(post) * warp;
    const P = passiveRadius(post) * warp;
    // Inner circle: anything that comes in. Outer circle: anything that
    // attacks a building or the wall out there.
    const clock = s.raid!.clock;
    if (monsters.some((m) => Math.hypot(m.x - cx, m.y - cy) <= R || (!!m.hitAt && clock - m.hitAt[2] < 3 && Math.hypot(m.hitAt[0] - cx, m.hitAt[1] - cy) <= P))) {
      d.inside = false;
      if (!called.has(post.id)) {
        called.add(post.id);
        pop(s, cx, cy - 2, post.type === "townhall" ? "RISE" : "TO ARMS", "crit");
      }
    }
  }
}

/**
 * The heroes' auras, this tick (./heroes): every ally within a hero's reach
 * strikes harder and faster, takes less and is mended; every foe within it
 * strikes weaker; and the dark's terror is shrugged off. Buffs are recomputed
 * each tick from where everyone stands.
 */
function heroAuras(defenders: Combatant[], monsters: Combatant[], dt: number) {
  for (const c of defenders) c.buff = { dmg: 1, haste: 1, guard: 1, weaken: 0, ward: 0 };
  for (const m of monsters) m.buff = { dmg: 1, haste: 1, guard: 1, weaken: 0, ward: 0 };
  for (const h of defenders) {
    const a = h.hm;
    if (!a || a.auraR <= 0 || h.hp <= 0 || h.inside || h.structId) continue;
    for (const o of defenders) {
      if (o.hp <= 0 || o.inside || o.structId || Math.hypot(o.x - h.x, o.y - h.y) > a.auraR) continue;
      const b = o.buff!;
      b.dmg *= a.allyDmg;
      b.haste *= a.allyHaste;
      b.guard *= a.allyGuard;
      b.ward = Math.max(b.ward, a.ward);
      if (a.heal > 0 && o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + a.heal * dt);
    }
    if (a.weaken > 0) for (const m of monsters) {
      if (m.hp > 0 && Math.hypot(m.x - h.x, m.y - h.y) <= a.auraR) m.buff!.weaken = Math.max(m.buff!.weaken, a.weaken);
    }
  }
}

function moveMonster(s: GameState, m: Combatant, defenders: Combatant[], dt: number) {
  m.cooldown -= dt;
  // A haunt has one errand. Once its building is gone, so is it.
  if (m.haunt && (!m.targetStruct || !byId(s, m.targetStruct))) {
    m.hp = 0;
    (m as { faded?: boolean }).faded = true;
    return;
  }
  // 1. A defender within reach of its senses; a haunt notices only those in its way.
  let foe: Combatant | undefined;
  let best = m.haunt ? 2.5 : 7;
  for (const d of defenders) {
    // Static posts are engaged at their walls, like any building; guards still inside are out of reach.
    const post = d.structId ? byId(s, d.structId) : undefined;
    if (post || d.inside) continue;
    const dist = d2(m, d);
    if (dist < best) {
      best = dist;
      foe = d;
    }
  }
  if (foe) {
    if (best > m.range) step(s, m, foe.x, foe.y, dt);
    else if (m.cooldown <= 0) strike(s, m, foe);
    return;
  }
  // 2. A structure: whatever it was already breaking, else the nearest.
  let target = m.targetStruct ? byId(s, m.targetStruct) : undefined;
  if (!target) {
    let bestD = Infinity;
    for (const st of s.structures) {
      const dd = distToStruct(m, st);
      if (dd < bestD) {
        bestD = dd;
        target = st;
      }
    }
    m.targetStruct = target?.id ?? null;
  }
  if (!target) return;
  if (distToStruct(m, target) > m.range) {
    const [cx, cy] = center(target);
    // Night haunts rise beside their building; everything else walks the breach field.
    const f = !m.flying && !m.haunt ? fieldFor(s, target) : null;
    const next = f && Number.isFinite(fieldAt(f, m.x, m.y)) ? downhill(f, m.x, m.y) : null;
    if (next) step(s, m, next[0], next[1], dt);
    else step(s, m, cx, cy, dt);
  } else if (s.raid!.archetype === "B" && !m.haunt) {
    // Burrowers (§2.5): at the stores they gorge and carry off, then dig back down.
    raidStores(s, m, target);
  } else if (m.cooldown <= 0) {
    m.cooldown = m.interval;
    m.swingAt = s.raid!.clock;
    const [hx, hy] = center(target);
    m.hitAt = [hx, hy, s.raid!.clock];
    target.hp -= Math.round(m.dmg * scorchFactor(m) * (m.buff?.dmg ?? 1) * (1 - (m.buff?.weaken ?? 0)) * (hasTrait(m, "breath") ? 1.5 : 1));
    // Siege beasts go for the posts that hold the roof up (§2.5).
    if (s.raid!.archetype === "K") {
      strikeFrame(s, target, m.x, m.y, m.dmg * 4);
      if (!s.structures.includes(target)) {
        m.targetStruct = null;
        return;
      }
    }
    // The dark takes buildings, not towns: a haunt cannot bring the hall down.
    if (m.haunt && target.type === "townhall" && target.hp <= 0) {
      target.hp = 1;
      m.hp = 0;
      (m as { faded?: boolean }).faded = true;
      log(s, "The hall's old stones hold against the dark.", "info");
      return;
    }
    // Keep the building's guard post on the same hit points as the building.
    const post = s.raid!.combatants.find((c) => c.structId === target!.id);
    if (post) post.hp = target.hp;
    pop(s, m.x, m.y - 1, `-${m.dmg}`);
    if (MONSTERS[m.kind as MonsterKind].range > 2) {
      const [cx, cy] = center(target);
      s.raid!.projectiles.push({ x: m.x, y: m.y, tx: cx, ty: cy, t: 0, ...projectileFor(m) });
    }
    if (target.hp <= 0) {
      m.targetStruct = null;
      if (target.type === "townhall") return sack(s);
      const objective = !m.haunt && s.raid!.target === target.id;
      destroyStructure(s, target);
      // Their objective down, they pillage and go (§2.5): the rest of the town is not what they came for.
      if (objective) retreat(s, CATALOG[target.type].name.toLowerCase());
    }
  }
}

const fields = new WeakMap<object, Map<number, { f: Field; at: number }>>();
/** Raids whose walls have changed since their field was cast. */
const wallsBroken = new WeakSet<object>();

/**
 * The breach field for a raid's target (§5.6), cached per raid and rebuilt
 * when a wall falls or every five seconds of fighting.
 */
function fieldFor(s: GameState, target: Structure): Field | null {
  const raid = s.raid;
  if (!raid) return null;
  let byTarget = fields.get(raid);
  if (!byTarget) fields.set(raid, (byTarget = new Map()));
  if (wallsBroken.has(raid)) {
    byTarget.clear();
    wallsBroken.delete(raid);
  }
  const hit = byTarget.get(target.id);
  if (hit && raid.clock - hit.at < 5) return hit.f;
  const party = raid.party.length ? raid.party : [{ kind: "troll" as MonsterKind, level: 1, count: 1 }];
  const f = flowField(s, target, groupOf(party), raid.archetype ?? "K");
  byTarget.set(target.id, { f, at: raid.clock });
  return f;
}

/** Every monster still standing withdraws: the raid ends when the step's deaths are counted. */
function retreat(s: GameState, what: string) {
  const raid = s.raid;
  if (!raid) return;
  raid.retreated = what;
  for (const c of raid.combatants) {
    if (c.side !== "monster" || c.hp <= 0) continue;
    c.hp = 0;
    (c as { faded?: boolean }).faded = true;
  }
}

/**
 * A burrower at its target: it takes food from the stores — twenty units a
 * level, grain and meals first — and goes back down the way it came. What it
 * takes is gone; the building is left standing.
 */
function raidStores(s: GameState, m: Combatant, target: Structure) {
  let want = 20 * m.level;
  const taken: Record<string, number> = {};
  for (const k of ["meals", "wheat", "barley", "potato", "corn", "rice", "bean", "fish", "meat"] as const) {
    if (want <= 0) break;
    const n = Math.min(want, s.res[k]);
    if (n <= 0) continue;
    s.res[k] -= n;
    want -= n;
    taken[k] = (taken[k] ?? 0) + n;
  }
  m.hp = 0;
  (m as { faded?: boolean }).faded = true;
  const what = Object.entries(taken).map(([k, n]) => `${Math.round(n)} ${k}`).join(", ");
  pop(s, m.x, m.y - 1, "DIGS DOWN", "crit");
  log(s, `Something breaks up through the floor of the ${CATALOG[target.type].name.toLowerCase()}${what ? ` and drags down ${what}` : ", finds nothing, and is gone"}.`, "bad");
}

/** Moves toward a point; walls stop anything that walks, and get attacked. */
function step(s: GameState, c: Combatant, x: number, y: number, dt: number) {
  const dx = x - c.x;
  const dy = y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  // Never past the point: at speed a whole step can be longer than what is left.
  const snared = c.slowUntil !== undefined && !!s.raid && s.raid.clock < c.slowUntil;
  const enraged = c.side === "monster" && c.legendary && c.hp < c.maxHp * ENRAGE_AT;
  const pace = Math.min(len, c.speed * dt * (c.scorched ? SCORCH_SLOW : 1) * (snared ? 0.6 : 1) * (enraged ? 1.3 : 1));
  const nx = c.x + (dx / len) * pace;
  const ny = c.y + (dy / len) * pace;
  // A spike pit under a walking monster's foot: it falls in, and the pit is spent (./menace).
  if (c.side === "monster" && !c.flying && s.traps?.length) {
    const tile = idx(Math.floor(nx), Math.floor(ny));
    const at = s.traps.indexOf(tile);
    if (at >= 0) {
      s.traps.splice(at, 1);
      c.hp -= trapDamage(c.level);
      c.slowUntil = (s.raid?.clock ?? 0) + 3;
      pop(s, nx, ny - 1, "SPIKES", "crit");
    }
  }
  // Walls stop anything that walks — not what flies, and not what tunnels under them.
  if (!c.flying && !c.burrow && c.side === "monster") {
    const tile = idx(Math.floor(nx), Math.floor(ny));
    if (inBounds(Math.floor(nx), Math.floor(ny)) && s.map.overlay[tile] === Overlay.Wall) {
      const lvl = wallLevel(s.map.meta[tile]);
      const order = wallOrder(lvl);
      // A loopholed curtain shoots whatever stands at it (./world WALL_ORDERS).
      if (order >= 2 && s.raid && s.raid.clock - (c.boltAt ?? -9) >= 1.5) {
        c.boltAt = s.raid.clock;
        c.hp -= wallBolt(lvl);
        pop(s, nx, ny - 1, `-${wallBolt(lvl)}`);
      }
      if (c.cooldown <= 0) {
        // Frostbound: the blows come half again as slowly.
        c.cooldown = c.interval * (order >= 4 ? 1.5 : 1);
        c.swingAt = s.raid!.clock;
        const blow = Math.round(c.dmg * scorchFactor(c));
        // The aegis takes half of every blow.
        const dmg = order >= 5 ? Math.round(blow / 2) : blow;
        // Spikes give back a fifth of it; runes scorch a thing of the night.
        if (order >= 1) c.hp -= Math.round(blow * 0.2);
        if (order >= 3 && isDark(c)) {
          c.scorched = true;
          c.hp -= c.maxHp * 0.02;
        }
        const left = wallHp(s.map.meta[tile]) - dmg;
        c.hitAt = [nx, ny, s.raid!.clock];
        pop(s, nx, ny, `-${dmg}`);
        if (left <= 0) {
          s.map.overlay[tile] = Overlay.Debris;
          s.map.meta[tile] = 0;
          if (s.raid) wallsBroken.add(s.raid);
        } else s.map.meta[tile] = wallMeta(wallLevel(s.map.meta[tile]), left);
      }
      return;
    }
  }
  c.x = nx;
  c.y = ny;
}

function moveDefender(s: GameState, d: Combatant, monsters: Combatant[], dt: number) {
  d.cooldown -= dt;
  if (d.inside) return;
  // The player's order comes first (./command); a stationed troop holds its circle.
  const stepTo = (x: number, y: number) => step(s, d, x, y, dt);
  if (obey(s, d, monsters, dt, stepTo, (foe) => strike(s, d, foe), (m) => d2(d, m))) return;
  // The mythic watch goes for the mythic thing first, wherever it is.
  if (d.mythicWatch) {
    const myth = monsters.filter((m) => m.mythic);
    if (myth.length) monsters = myth;
  }
  const watch = d.mythicWatch ? null : stationWatch(d, monsters, stepTo);
  if (watch) {
    if (!watch.length) return;
    monsters = watch;
  } else if (d.post !== undefined && !d.structId) {
    // A guard fights inside its post's circle (with a little room to chase),
    // and walks back in when the circle is clear.
    const post = byId(s, d.post);
    if (post) {
      const [cx, cy] = center(post);
      const reach = alertRadius(post) * 1.25;
      const outer = passiveRadius(post) * 1.1;
      const clock = s.raid!.clock;
      // In the inner circle, anything; out to the outer one, whatever is still attacking there.
      const near = monsters.filter((m) => {
        const d = Math.hypot(m.x - cx, m.y - cy);
        return d <= reach || (d <= outer && !!m.hitAt && clock - m.hitAt[2] < 6);
      });
      if (!near.length) {
        if (Math.hypot(d.x - cx, d.y - cy) < 0.8) d.inside = true;
        else step(s, d, cx, cy, dt);
        return;
      }
      monsters = near;
    }
  }
  // A building shoots from its walls, not its centre: a 14-tile hall
  // measured from the middle could not hit a slime chewing on its east wall.
  const home = d.structId ? byId(s, d.structId) : undefined;
  let foe: Combatant | undefined;
  let best = Infinity;
  for (const m of monsters) {
    const dist = home ? distToStruct(m, home) : d2(d, m);
    if (dist < best) {
      best = dist;
      foe = m;
    }
  }
  if (!foe) return;
  if (best > d.range) {
    if (d.speed > 0) step(s, d, foe.x, foe.y, dt);
    return;
  }
  if (d.cooldown <= 0) strike(s, d, foe);
}

function strike(s: GameState, a: Combatant, b: Combatant) {
  // A foot of the same kind set into the tower or spire: strikes at that kind come faster.
  a.cooldown = (a.augFrom ? a.interval / (1 + augBonus(byId(s, a.augFrom)).foot(b.kind)) : a.interval) * (a.buff?.haste ?? 1);
  if (a.side === "defender") a.fought = true;
  if (a.side === "monster" && b.structId) {
    const st = byId(s, b.structId);
    if (st) a.hitAt = [center(st)[0], center(st)[1], s.raid!.clock];
  }
  a.swingAt = s.raid!.clock;
  let dmg = a.dmg * scorchFactor(a) * (a.buff?.dmg ?? 1) * (a.side === "monster" ? 1 - (a.buff?.weaken ?? 0) : 1);
  let crit = false;
  // A heavy class's blow (./enrol): the giant-breaker against the great, the iron warden inside the hall's circle.
  if (a.heavyCls) {
    const hc = HEAVY_CLASSES[a.heavyCls as HeavyClass];
    if (hc && (b.legendary || b.mythic)) dmg *= hc.vsGreat;
    if (hc && hc.atHall !== 1 && inHallZone(s, b.x, b.y)) dmg *= hc.atHall;
  }
  // A hero's skills on the blow itself (./heroes).
  const hm = a.hm;
  if (hm) {
    if (b.legendary) dmg *= hm.vsLegend;
    if (b.element === "dark") dmg *= hm.vsDark;
    if (hm.crit > 0 && rng(Math.floor(s.raid!.clock * 1000) * 13 + a.id)() < hm.crit) {
      dmg *= 2;
      crit = true;
    }
  }
  // A post on the windfall path (./paths): it and the guards it holds strike double three times in ten.
  const keep = a.side === "defender" ? byId(s, a.structId ?? a.post) : undefined;
  if (keep?.path === "windfall" && windfall(s, keep, rng(Math.floor(s.raid!.clock * 1000) * 7 + a.id))) {
    dmg *= 2;
    crit = true;
  }
  if (a.kind === "archer" && b.flying) {
    dmg *= 2;
    crit = true;
  }
  if (a.kind === "wizard" && b.legendary) {
    dmg *= 2;
    crit = true;
  }
  if (a.side === "defender" && a.range <= 1.5 && b.flying && !a.champion) dmg *= 0.5; // swords reach a low flyer, badly
  // The elements: a blow that beats its target's element bites deep; one it beats, shallow.
  const ef = elementFactor(a.element, b.element);
  dmg *= ef;
  if (ef > 1 && a.side === "defender") {
    crit = true;
    pop(s, b.x, b.y - 1.8, `${ELEMENT_NAME[a.element!].toUpperCase()} COUNTERS`, "crit");
  } else if (ef < 1 && a.side === "defender") pop(s, b.x, b.y - 1.8, "RESISTED", "hit");
  // A mythic thing shrugs off all but a champion's blows — a hero's skill pierces some of that ward.
  if (b.mythic && a.side === "defender" && !a.champion) dmg *= MYTHIC_WARD + (1 - MYTHIC_WARD) * (hm?.pierce ?? 0);
  // Guarded allies take less.
  if (b.side === "defender") dmg *= b.buff?.guard ?? 1;
  dmg = Math.round(dmg);
  b.hp -= dmg;
  // A hero's volleys and cleaves: more foes struck by the one blow.
  if (hm && s.raid && (hm.volley > 0 || hm.cleave > 0)) {
    const near = s.raid.combatants
      .filter((o) => o !== b && o.side === b.side && o.hp > 0 && !o.inside && !o.structId)
      .map((o) => ({ o, d: Math.hypot(o.x - b.x, o.y - b.y) }))
      .sort((p, q) => p.d - q.d);
    let n = 0;
    for (const { o, d } of near) {
      if (n >= hm.volley || d > 3.5) break;
      o.hp -= Math.round(dmg * hm.volleyShare);
      n++;
    }
    if (hm.cleave > 0) for (const { o, d } of near.filter((x) => x.d <= hm.cleaveR).slice(0, 4)) o.hp -= Math.round(dmg * hm.cleave * (d <= hm.cleaveR ? 1 : 0));
  }
  if (hm?.snare && s.raid) b.slowUntil = s.raid.clock + 2;
  // A monster's blow (./menace): a brute's cleave, a dragon's fire round the target, a vampire's drink.
  if (a.side === "monster" && s.raid) {
    const cleave = hasTrait(a, "cleave");
    const breath = hasTrait(a, "breath");
    if (cleave || breath) {
      const r = breath ? 1.6 : 1.3;
      const share = breath ? 0.4 : 0.5;
      let n = 0;
      for (const o of s.raid.combatants) {
        if (o === b || o.side !== "defender" || o.hp <= 0 || o.inside || o.structId || n >= (breath ? 4 : 3)) continue;
        if (Math.hypot(o.x - b.x, o.y - b.y) > r) continue;
        o.hp -= Math.round(dmg * share * (o.buff?.guard ?? 1));
        n++;
      }
      if (n && breath) pop(s, b.x, b.y - 1.6, "BURNING", "crit");
    }
    if (hasTrait(a, "lifesteal")) a.hp = Math.min(a.maxHp, a.hp + dmg * 0.3);
  }
  // A Master's spells burst on those around the target; the King's blade cleaves the ones beside it.
  if (a.champion && s.raid) {
    const splash = a.champion === "master" ? { r: 2, share: 0.5, n: 6 } : { r: 1.6, share: 0.6, n: 2 };
    let n = 0;
    for (const o of s.raid.combatants) {
      if (o === b || o.side !== b.side || o.hp <= 0 || o.inside || o.structId || n >= splash.n) continue;
      if (Math.hypot(o.x - b.x, o.y - b.y) > splash.r) continue;
      o.hp -= Math.round(a.dmg * splash.share * elementFactor(a.element, o.element));
      n++;
    }
  }
  // A villager hit bleeds: minor, major or an artery (design §7).
  if (b.villagerId && a.side === "monster") {
    const v = s.villagers.find((x) => x.id === b.villagerId);
    if (v) {
      const body = bodyOf(v);
      const roll = rng(Math.floor(s.raid!.clock * 100) + b.id)();
      const bleed = roll < 0.05 ? 0.2 : roll < 0.3 ? 0.03 : 0.005;
      body.bleed = Math.max(body.bleed, bleed);
      v.health = Math.max(1, v.health - (dmg / Math.max(1, b.maxHp)) * 60);
    }
  }
  pop(s, b.x, b.y - 1, `-${dmg}`, crit ? "crit" : "hit");
  // Shots and spells fly; a great knight's blade throws a wave of light at what it strikes.
  if (a.range > 2 || (a.kind === "knight" && (a.level >= 40 || a.champion))) {
    s.raid!.projectiles.push({ x: a.x, y: a.y - 0.6, tx: b.x, ty: b.y - 0.4, t: 0, ...projectileFor(a) });
  }
  if (b.structId) {
    const t = byId(s, b.structId);
    if (t) t.hp = b.hp;
  }
}

/**
 * What a shooter throws, and how fancy: the higher the level, the finer the
 * shot. Bowmen loose arrows (quarrels from crossbowmen and arbalestiers),
 * wizards cast spells, great knights throw a wave off the blade, towers and
 * the hall a ballista bolt; legendary and mythic things breathe their element.
 */
export function projectileFor(a: Combatant): Pick<Projectile, "kind" | "tier" | "element" | "v"> {
  const lv = a.level;
  if (a.side === "monster") return { kind: a.element ? "breath" : "rock", tier: a.mythic ? 5 : a.legendary ? 3 : Math.min(2, Math.floor(lv / 15)), element: a.element ?? null, v: a.element ? 1.1 : 0.8 };
  switch (a.kind) {
    case "archer": {
      // Bowmen loose arrows; crossbowmen (10) and arbalestiers (17) quarrels.
      const quarrel = lv >= 10;
      return { kind: quarrel ? "quarrel" : "arrow", tier: Math.min(4, (lv >= 17 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0) + (a.element ? 1 : 0)), element: a.element ?? null, v: quarrel ? 1.5 : 1.3 };
    }
    case "wizard":
      return { kind: "spell", tier: a.champion ? 5 : lv < 5 ? 0 : lv < 15 ? 1 : lv < 50 ? 2 : lv < 150 ? 3 : 4, element: a.element ?? null, v: 1.6 };
    case "knight":
      return { kind: "slash", tier: a.champion ? 5 : lv >= 110 ? 4 : lv >= 80 ? 3 : 2, element: a.element ?? null, v: 2 };
    case "tower":
    case "hall":
      return { kind: "ballista", tier: Math.min(4, Math.floor(lv / 10)), element: null, v: 1.2 };
    default:
      return { kind: "arrow", tier: 0, element: null, v: 1.3 };
  }
}

/** Villagers who would take the field, for the pre-raid readout. */
export function readyDefenders(s: GameState): Villager[] {
  return countedTroops(s);
}
