import type { Attribute } from "@prisma/client";
import { CATALOG } from "./catalog";
import { MONSTERS, statsAt } from "./bestiary";
import { byId, countedTroops, isMilitary, log } from "./state";
import { alertRadius, captainBonus, center, exposure, idx, inBounds, isGuardPost, rng, unlitBuildings } from "./world";
import { SOLDIER_MAX, knightTitle, roleLabel, soldierTitle } from "./catalog";

/** Chance a troop who fought and lived is promoted after a won fight. */
export const FIELD_PROMOTION = 0.3;
import { kill } from "./tick";
import { dropsFor, gearBonus, isAway, store, gearCap } from "./loot";
import {
  MAP_H, MAP_W, Overlay,
  type Combatant, type GameState, type MonsterKind, type Structure, type Villager,
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
 *   - commanders and forge levels raise every troop's damage.
 */


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
function troopStats(v: Villager): { kind: string; st: Stats; k: number } {
  const lvl = Math.max(1, v.rank);
  if (v.role === "knight") {
    const m = KNIGHT_MOD[knightTitle(lvl).id];
    const b = TROOP_STATS.knight;
    return { kind: "knight", st: { ...b, hp: b.hp * m.hp, dmg: b.dmg * m.dmg, speed: m.speed }, k: 1 + 0.15 * (lvl - 1) };
  }
  if (v.role === "infantry" || v.role === "archer" || v.role === "heavy") {
    const t = soldierTitle(lvl);
    // Ranged titles shoot as archers (double against fliers); armoured ones fight as heavies.
    const kind = t.ranged ? "archer" : lvl >= 7 ? "heavy" : "infantry";
    return { kind, st: SOLDIER_STATS[t.id], k: 1 + 0.06 * (lvl - 1) };
  }
  return { kind: v.role, st: TROOP_STATS[v.role], k: 1 + 0.15 * (lvl - 1) };
}

const TROOP_STATS: Record<string, Stats> = {
  infantry: { hp: 60, dmg: 9, interval: 1.0, range: 1, speed: 1.6 },
  archer: { hp: 40, dmg: 7, interval: 1.1, range: 5, speed: 1.6 },
  heavy: { hp: 150, dmg: 10, interval: 1.3, range: 1, speed: 1.1 },
  wizard: { hp: 45, dmg: 14, interval: 1.5, range: 4, speed: 1.3 },
  knight: { hp: 115, dmg: 16, interval: 1.0, range: 1.2, speed: 1.9 },
};

// ── Repel rites ───────────────────────────────────────────

const REPEL_ATTR: Record<MonsterKind, Attribute> = {
  slime: "LOGIC", bat: "REASON", spider: "STATISTIC", goblin: "CRITICAL_THINKING", skeleton: "FAITH",
  wolf: "PHYSICAL", werewolf: "FAITH", wraith: "SELF_RESPECT", minotaur: "STUBBORNNESS", troll: "STUBBORNNESS",
  lich: "REBUTTAL", golem: "ABSTRACT", wyvern: "ABSTRACT", serpent: "COMPASSION", demon: "MIND",
  dragon: "CREATIVITY", elderdragon: "CREATIVITY", harpy: "REASON", ogre: "PHYSICAL", mimic: "CRITICAL_THINKING",
  treant: "COMPASSION", salamander: "LOGIC", frostgiant: "STUBBORNNESS", banshee: "SELF_RESPECT", basilisk: "REBUTTAL",
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
    return { structId: st.id, kind: h.kind, level: h.level + exposure(s, st) };
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
  return (1 + Math.min(0.6, commanders * 0.08)) * (1 + forge * 0.04);
}

function start(s: GameState) {
  const raid = s.raid!;
  const r = rng(Math.floor(s.time) + 7);
  const legendary = !raid.haunt && raid.party.some((p) => MONSTERS[p.kind].legendary);

  // A haunt rises around its buildings rather than marching in from an edge.
  for (const h of raid.haunt ?? []) {
    const st = byId(s, h.structId);
    if (!st) continue;
    const def = MONSTERS[h.kind];
    const [cx, cy] = center(st);
    const a = r() * Math.PI * 2;
    const d = 6 + r() * 3;
    const { hp, dmg } = statsAt(def, h.level);
    raid.combatants.push({
      id: raid.nextId++, side: "monster", kind: h.kind, level: h.level,
      x: Math.max(1, Math.min(MAP_W - 2, cx + Math.cos(a) * d)), y: Math.max(1, Math.min(MAP_H - 2, cy + Math.sin(a) * d)),
      hp, maxHp: hp, dmg, interval: def.interval, cooldown: r() * def.interval,
      range: def.range, speed: def.speed, flying: !!def.flying, legendary: false, targetStruct: st.id, haunt: true,
    });
  }

  const aim = raid.target ? byId(s, raid.target) : undefined;
  for (const p of raid.haunt ? [] : raid.party) {
    const def = MONSTERS[p.kind];
    const main = spawnPoint(raid.side, r, aim);
    const flank = raid.flank ? spawnPoint(raid.flank, r, aim) : main;
    for (let i = 0; i < p.count; i++) {
      const { hp, dmg } = statsAt(def, p.level);
      // A split party sends every other member round the second side.
      const base = i % 2 ? flank : main;
      raid.combatants.push({
        id: raid.nextId++, side: "monster", kind: p.kind, level: p.level,
        x: base[0] + (r() - 0.5) * 4, y: base[1] + (r() - 0.5) * 4,
        hp, maxHp: hp, dmg, interval: def.interval, cooldown: r() * def.interval,
        range: def.range, speed: def.speed, flying: !!def.flying, legendary: !!def.legendary,
        targetStruct: aim?.id ?? null,
      });
    }
  }

  // Only posted guards defend, and they start inside their tower: they come
  // out when something enters its radius (see wakeGuards).
  const bonus = damageBonus(s);
  for (const v of countedTroops(s)) {
    // Grand wizards stay in the hut unless something legendary comes.
    if (v.role === "wizard" && v.rank >= 15 && !legendary) continue;
    // A knight out on a sortie is not here to fight.
    if (isAway(s, v)) continue;
    const tower = byId(s, v.guard)!;
    const [x, y] = center(tower);
    const { kind: fightAs, st, k: rankK } = troopStats(v);
    const lvl = Math.max(1, v.rank);
    // An army point's knight leads its guards: harder hitting, harder to kill.
    const k = rankK * captainBonus(s, tower);
    const gear = gearBonus(v);
    const hp = Math.round(st.hp * k * gear.hp);
    raid.combatants.push({
      id: raid.nextId++, side: "defender", kind: fightAs, level: lvl,
      x, y, hp, maxHp: hp, dmg: Math.round(st.dmg * k * bonus * gear.dmg),
      interval: st.interval, cooldown: 0, range: st.range, speed: st.speed,
      flying: false, legendary: v.role === "wizard" && v.rank >= 15, villagerId: v.id, post: tower.id, inside: true,
    });
    // An emblem knight's battalion rides with them: sworn soldiers, not villagers.
    for (let i = 0; i < Math.min(8, v.battalion ?? 0); i++) {
      const bl = Math.max(1, Math.floor(lvl / 2));
      const bk = 1 + 0.15 * (bl - 1);
      raid.combatants.push({
        id: raid.nextId++, side: "defender", kind: "battalion", level: bl,
        x: x + (r() - 0.5) * 3, y: y + 0.5 + r(), hp: Math.round(60 * bk), maxHp: Math.round(60 * bk),
        dmg: Math.round(9 * bk * bonus), interval: 1, cooldown: r(), range: 1, speed: 1.7,
        flying: false, legendary: false, post: tower.id, inside: true,
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
    const levies = s.villagers.filter((v) => !isMilitary(v) && v.health > 30).slice(0, 6);
    for (const v of levies) {
      raid.combatants.push({
        id: raid.nextId++, side: "defender", kind: "militia", level: 1,
        x: hx + (r() - 0.5) * 6, y: hy + 4 + r() * 2,
        hp: 30, maxHp: 30, dmg: Math.round(4 * bonus), interval: 1.2, cooldown: r(), range: 1, speed: 1.5,
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
      x: cx, y: cy, hp: hallSt.hp, maxHp: CATALOG.townhall.hpPerLevel * hallSt.level,
      dmg: Math.round(10 * hallSt.level * bonus), interval: 1.2, cooldown: 0, range: 6, speed: 0,
      flying: false, legendary: false, structId: hallSt.id,
    });
  }

  for (const t of s.structures.filter((st) => isGuardPost(st) && !st.buildUntil)) {
    const [cx, cy] = center(t);
    const camp = t.type === "armypoint";
    raid.combatants.push({
      id: raid.nextId++, side: "defender", kind: "tower", level: t.level,
      x: cx, y: cy - 1, hp: t.hp, maxHp: CATALOG[t.type].hpPerLevel * t.level,
      dmg: Math.round((camp ? 18 : 14) * t.level * bonus), interval: 1.1, cooldown: 0, range: camp ? 8 : 7, speed: 0,
      flying: false, legendary: false, structId: t.id,
    });
  }
  raid.started = true;
  raid.pops = [];
  raid.spoils = { kept: {}, lost: 0 };
  if (!raid.haunt) log(s, "They are here. To arms!", "bad");
}

/** What a fallen monster leaves, into the forge if there is one and it has room. */
function spoil(s: GameState, m: Combatant) {
  const raid = s.raid!;
  const r = rng(m.id * 7919 + Math.floor(s.time));
  for (const [item, n] of Object.entries(dropsFor(m.kind as MonsterKind, m.level, m.legendary, r))) {
    const lost = store(s, item, n);
    raid.spoils!.lost += lost;
    if (n > lost) raid.spoils!.kept[item] = (raid.spoils!.kept[item] ?? 0) + n - lost;
  }
}

function spoilsText(sp: { kept: Record<string, number>; lost: number } | undefined): string {
  if (!sp) return "";
  const kept = Object.entries(sp.kept).map(([k, n]) => `${n} ${k}`).join(", ");
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

/**
 * The town is sacked: every villager dies, every specialty with them, and a
 * grief that lingers. The hall itself survives as a shell to rebuild from.
 */
function sack(s: GameState) {
  s.villagers = [];
  for (const st of s.structures) {
    st.workers = [];
    st.training = null;
  }
  const hall = s.structures.find((st) => st.type === "townhall");
  if (hall) hall.hp = Math.round(CATALOG.townhall.hpPerLevel * hall.level * 0.3);
  s.debuffs.push({ id: "sacked", label: "Sacked — grief and ruin", until: s.time + 3 * 24 * 60, moodPerHour: -0.4, production: 0.7 });
  s.mood = Math.min(s.mood, 30);
  // The next raid gives the survivors' successors time to arrive.
  s.nextRaidAt = s.time + 4 * 24 * 60;
  log(s, "The monsters broke through. The town is sacked; everyone is gone.", "bad");
  s.raid = null;
}

export function stepCombat(s: GameState, dt: number) {
  const raid = s.raid;
  if (!raid || raid.phase !== "fighting") return;
  if (!raid.started) start(s);
  raid.clock += dt;

  const alive = raid.combatants.filter((c) => c.hp > 0);
  const monsters = alive.filter((c) => c.side === "monster");
  const defenders = alive.filter((c) => c.side === "defender");

  wakeGuards(s, monsters, defenders);

  // A sack ends the raid mid-step; nobody may act on a raid that is over.
  for (const m of monsters) {
    if (!s.raid) return;
    moveMonster(s, m, defenders, dt);
  }
  for (const d of defenders) {
    if (!s.raid) return;
    moveDefender(s, d, monsters, dt);
  }

  // Projectiles in flight.
  raid.projectiles = raid.projectiles.filter((p) => (p.t += dt * 3) < 1);

  // Deaths.
  for (const c of raid.combatants) {
    if (c.hp > 0 || (c as { dead?: boolean }).dead) continue;
    (c as { dead?: boolean }).dead = true;
    if (c.side === "monster" && (c as { faded?: boolean }).faded) continue;
    if (c.side === "monster") {
      s.kills.push({ kind: c.kind as MonsterKind, at: s.time });
      s.res.coin += c.level * 4;
      spoil(s, c);
    } else if (c.villagerId) {
      const v = s.villagers.find((x) => x.id === c.villagerId);
      if (v) {
        kill(s, v);
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
    if (raid.haunt) log(s, slain.length ? `The night haunt is driven off. ${levels * 4} coin.${spoils}` : "The haunt fades, its work done.", slain.length ? "good" : "bad");
    else log(s, `The raid is broken. ${levels * 4} coin taken from the fallen.${spoils}`, "good");
    // Time served: everyone who fought and lived has a chance to be promoted
    // in the field. It is the only way past what the barracks and the army
    // school can teach.
    const pr = rng(Math.floor(s.time) * 13 + raid.nextId);
    for (const c of raid.combatants) {
      if (c.side !== "defender" || !c.villagerId || !c.fought || c.hp <= 0) continue;
      const v = s.villagers.find((x) => x.id === c.villagerId);
      if (!v) continue;
      const soldier = v.role === "infantry" || v.role === "archer" || v.role === "heavy";
      const knight = v.role === "knight";
      if (!(soldier && v.rank < SOLDIER_MAX) && !(knight && v.rank < 22)) continue;
      if (v.rank >= gearCap(v)) continue; // past level 8, rank needs a weapon to match
      if (pr() >= FIELD_PROMOTION) continue;
      const before = roleLabel(v.role, v.rank);
      v.rank += 1;
      v.xp = 0;
      const now = roleLabel(v.role, v.rank);
      const newTitle = before.replace(/ \d+$/, "") !== now.replace(/ \d+$/, "");
      log(s, newTitle ? `${v.name} is promoted in the field: now ${now}.` : `${v.name} rises to ${now} for service in the fight.`, "good");
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
    const R = alertRadius(post);
    if (monsters.some((m) => Math.hypot(m.x - cx, m.y - cy) <= R)) {
      d.inside = false;
      if (!called.has(post.id)) {
        called.add(post.id);
        pop(s, cx, cy - 2, post.type === "townhall" ? "RISE" : "TO ARMS", "crit");
      }
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
    step(s, m, cx, cy, dt);
  } else if (m.cooldown <= 0) {
    m.cooldown = m.interval;
    m.swingAt = s.raid!.clock;
    target.hp -= m.dmg;
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
      s.raid!.projectiles.push({ x: m.x, y: m.y, tx: cx, ty: cy, kind: "fire", t: 0 });
    }
    if (target.hp <= 0) {
      m.targetStruct = null;
      if (target.type === "townhall") return sack(s);
      destroyStructure(s, target);
    }
  }
}

/** Moves toward a point; walls stop anything that walks, and get attacked. */
function step(s: GameState, c: Combatant, x: number, y: number, dt: number) {
  const dx = x - c.x;
  const dy = y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = c.x + (dx / len) * c.speed * dt;
  const ny = c.y + (dy / len) * c.speed * dt;
  if (!c.flying && c.side === "monster") {
    const tile = idx(Math.floor(nx), Math.floor(ny));
    if (inBounds(Math.floor(nx), Math.floor(ny)) && s.map.overlay[tile] === Overlay.Wall) {
      if (c.cooldown <= 0) {
        c.cooldown = c.interval;
        c.swingAt = s.raid!.clock;
        s.map.meta[tile] -= c.dmg;
        pop(s, nx, ny, `-${c.dmg}`);
        if (s.map.meta[tile] <= 0) {
          s.map.overlay[tile] = Overlay.Debris;
          s.map.meta[tile] = 0;
        }
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
  // A guard fights inside its post's circle (with a little room to chase),
  // and walks back in when the circle is clear.
  if (d.post !== undefined && !d.structId) {
    const post = byId(s, d.post);
    if (post) {
      const [cx, cy] = center(post);
      const reach = alertRadius(post) * 1.25;
      const near = monsters.filter((m) => Math.hypot(m.x - cx, m.y - cy) <= reach);
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
  a.cooldown = a.interval;
  if (a.side === "defender") a.fought = true;
  a.swingAt = s.raid!.clock;
  let dmg = a.dmg;
  let crit = false;
  if (a.kind === "archer" && b.flying) {
    dmg *= 2;
    crit = true;
  }
  if (a.kind === "wizard" && b.legendary) {
    dmg *= 2;
    crit = true;
  }
  if (a.side === "defender" && a.range <= 1.5 && b.flying) dmg *= 0.5; // swords reach a low flyer, badly
  dmg = Math.round(dmg);
  b.hp -= dmg;
  pop(s, b.x, b.y - 1, `-${dmg}`, crit ? "crit" : "hit");
  if (a.range > 2) {
    const kind = a.kind === "archer" || a.kind === "tower" || a.kind === "hall" ? "arrow" : a.kind === "wizard" ? "bolt" : "fire";
    s.raid!.projectiles.push({ x: a.x, y: a.y - 0.6, tx: b.x, ty: b.y - 0.4, kind, t: 0 });
  }
  if (b.structId) {
    const t = byId(s, b.structId);
    if (t) t.hp = b.hp;
  }
}

/** Villagers who would take the field, for the pre-raid readout. */
export function readyDefenders(s: GameState): Villager[] {
  return countedTroops(s);
}
