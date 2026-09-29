import type { Combatant, GameState, MonsterKind } from "./types";
import { MONSTERS } from "./bestiary";
import { canAfford, costText, pay } from "./world";
import { Overlay, Terrain } from "./types";
import type { Cost } from "./catalog";

/**
 * What makes a monster dangerous in the fight, by its kind — and the traps a
 * town can lay against them.
 *
 *   Terror     the dark things: defenders near them strike a quarter weaker,
 *              unless a hero's ward holds them (./heroes)
 *   Cleave     the brutes: a blow lands half again on those beside its target
 *   Frenzy     the packs: harder for every packmate near, to +40%
 *   Regrowth   trolls, hydras, treants and slimes close their wounds
 *   Lifesteal  vampires and their kind drink back what they draw
 *   Breath     dragons and kin: fire splashes the defenders round the target,
 *              and buildings burn under it
 *   Enrage     every legend, below a third of its strength: half again as
 *              hard and a third faster
 *   Roar       every legend, arriving: the defenders near it falter for six
 *              seconds, as under terror
 *
 * The land reckons these into a wave's strength (partyTraits, and
 * ./aggro partyPi), so a wave is never aimed above what the defence can meet:
 * the danger is in what each monster does, not in a rigged count.
 */

export type Trait = "terror" | "cleave" | "frenzy" | "regrowth" | "lifesteal" | "breath";

const TRAITS: Record<string, Trait[]> = {
  wraith: ["terror"], banshee: ["terror"], lich: ["terror"], yurei: ["terror"], vampire: ["terror", "lifesteal"],
  gashadokuro: ["terror", "cleave"], shadowcolossus: ["terror", "cleave"], voidwalker: ["terror"], mummy: ["terror"],
  jiangshi: ["terror", "lifesteal"], wendigo: ["terror", "lifesteal"],
  ogre: ["cleave"], troll: ["cleave", "regrowth"], cyclops: ["cleave"], minotaur: ["cleave"], frostgiant: ["cleave"],
  stormgiant: ["cleave"], golem: ["cleave"], behemoth: ["cleave"], oni: ["cleave"], treant: ["cleave", "regrowth"], sandworm: ["cleave"],
  wolf: ["frenzy"], goblin: ["frenzy"], jackal: ["frenzy"], spider: ["frenzy"], bat: ["frenzy"], ghoul: ["frenzy"],
  scorpion: ["frenzy"], kappa: ["frenzy"], pixie: ["frenzy"],
  hydra: ["regrowth"], slime: ["regrowth"],
  dragon: ["breath"], demon: ["breath"], wyvern: ["breath"], salamander: ["breath"], elderdragon: ["breath"],
  phoenix: ["breath"], djinn: ["breath"], thunderbird: ["breath"], nian: ["breath"],
};

export const traitsOf = (kind: string): Trait[] => TRAITS[kind] ?? [];
export const hasTrait = (c: Combatant, t: Trait) => (TRAITS[c.kind] ?? []).includes(t);

/** Terror's grip: how much weaker a defender near a dark thing strikes, unwarded. */
export const TERROR = 0.25;
export const TERROR_R = 3;
export const ROAR_R = 6;
export const ROAR_S = 6;
export const ENRAGE_AT = 1 / 3;

/** How much harder a party fights than its bare stats say, for the land's reckoning (./aggro partyPi). */
export function partyTraits(kind: string, count: number, legendary: boolean): number {
  const t = traitsOf(kind);
  let f = 1;
  if (t.includes("terror")) f *= 1.15;
  if (t.includes("cleave")) f *= 1.2;
  if (t.includes("frenzy") && count >= 3) f *= 1 + Math.min(0.25, 0.05 * (count - 1));
  if (t.includes("regrowth")) f *= 1.1;
  if (t.includes("lifesteal")) f *= 1.1;
  if (t.includes("breath")) f *= 1.2;
  if (legendary) f *= 1.15;
  return f;
}

/**
 * The monsters' side of the auras, this tick, after the heroes' (./combat):
 * terror and the legends' roars on the defenders near them, a pack's frenzy
 * on itself, and wounds closing.
 */
export function monsterAuras(defenders: Combatant[], monsters: Combatant[], clock: number, dt: number) {
  for (const m of monsters) {
    if (m.hp <= 0) continue;
    const t = traitsOf(m.kind);
    const roaring = m.legendary && m.roarUntil !== undefined && clock < m.roarUntil;
    if (t.includes("terror") || roaring) {
      const r = roaring ? ROAR_R : TERROR_R;
      for (const d of defenders) {
        if (d.hp <= 0 || d.inside || d.structId || Math.hypot(d.x - m.x, d.y - m.y) > r) continue;
        const b = d.buff;
        if (b) b.dmg *= 1 - TERROR * (1 - Math.max(b.ward, d.valor ?? 0));
      }
    }
    if (t.includes("frenzy")) {
      let pack = 0;
      for (const o of monsters) if (o !== m && o.hp > 0 && o.kind === m.kind && Math.hypot(o.x - m.x, o.y - m.y) <= 3) pack++;
      if (m.buff) m.buff.dmg *= 1 + Math.min(0.4, 0.08 * pack);
    }
    if (t.includes("regrowth") && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.008 * dt);
    // A legend at bay: half again as hard (the speed is in ./combat step).
    if (m.legendary && m.hp < m.maxHp * ENRAGE_AT && m.buff) m.buff.dmg *= 1.5;
  }
}

// ── Traps ─────────────────────────────────────────────────

/** A spike pit: sharpened stakes in a covered hole, one monster's worth. */
export const TRAP_COST: Cost = { wood: 3, iron: 1 };
export const TRAP_MAX = 60;
/** What a spike pit does to what falls in it: a fixed wound, and more to the big. */
export const trapDamage = (level: number) => 90 + 14 * level;

const OPEN = new Set<number>([Terrain.Grass, Terrain.Meadow, Terrain.Bank, Terrain.Hill, Terrain.Pavement]);

/**
 * Lays spike pits along the tiles given: open ground or road, nothing built
 * there, no wall or gate, and no trap already. Stops at the first it cannot
 * pay for. Only what walks falls in; fliers pass over.
 */
export function layTraps(s: GameState, tiles: number[], occ?: Int32Array): string | null {
  const traps = (s.traps ??= []);
  let laid = 0;
  let why: string | null = null;
  for (const i of tiles) {
    if (traps.length >= TRAP_MAX) {
      why = `The town keeps ${TRAP_MAX} pits at most.`;
      break;
    }
    if (traps.includes(i)) continue;
    const o = s.map.overlay[i];
    if (!OPEN.has(s.map.terrain[i]) || o === Overlay.Wall || o === Overlay.Gate || o === Overlay.Lair || (occ && occ[i])) continue;
    if (!canAfford(s.res, TRAP_COST)) {
      why = `Out of materials: ${costText(TRAP_COST)} a pit.`;
      break;
    }
    pay(s.res, TRAP_COST);
    traps.push(i);
    laid++;
  }
  if (!laid && !why) return "Nowhere there to dig a pit: open ground or road, clear of buildings and walls.";
  return why;
}

/** Fills the pits under the tiles given, for nothing back. */
export function clearTraps(s: GameState, tiles: number[]) {
  if (!s.traps?.length) return;
  const drop = new Set(tiles);
  s.traps = s.traps.filter((i) => !drop.has(i));
}

// ── The night, and the opening ────────────────────────────

/**
 * The first days belong to the town: for OPENING_DAYS the land sends no
 * raids and the fog's bands do not strike. Only creatures of the dark come,
 * and only at night — the things light burns (./combat firelight), so a town
 * that lights itself has little to fear. After the opening the land's answer
 * turns, slowly, to everything else: over RAMP_DAYS the share of it that is
 * not of the dark rises from nothing to all of it (otherShare).
 */
export const OPENING_DAYS = 5;
export const RAMP_DAYS = 15;
/** The share of the land's answer that is not of the dark, on a (1-based) day. */
export const otherShare = (day: number) => Math.max(0, Math.min(1, (day - 1 - OPENING_DAYS) / RAMP_DAYS));
export const inOpening = (s: GameState) => s.time < OPENING_DAYS * 24 * 60;

/**
 * How much the night notices a town: a hamlet of a handful is mostly left
 * alone, a town of twenty draws the dark every night it can. Scales the
 * chance of the night's haunts and prowlers (./tick). 0.12 at six people,
 * 0.5 at twelve, 1 from twenty.
 */
export const nightThreat = (s: GameState) => Math.max(0.12, Math.min(1, (s.villagers.length - 4) / 16));

/** Night hours: from eight in the evening to six in the morning. */
export const isNightHour = (hour: number) => hour >= 20 || hour < 6;

/** The night watch rest by day, from nine to five: their work and drill run at half. */
export const WATCH_REST: [number, number] = [9, 17];
export const WATCH_WORK = 0.5;

/**
 * Who is asleep when an alarm sounds: by night, everyone not on the night
 * watch; by day, the night watch in their rest hours. The towers and the
 * hall do not sleep.
 */
export const asleepFor = (v: { nightWatch?: boolean }, hour: number) =>
  isNightHour(hour) ? !v.nightWatch : !!v.nightWatch && hour >= WATCH_REST[0] && hour < WATCH_REST[1];

/** Puts a villager on the night watch, or takes them off it. */
export function setNightWatch(s: GameState, villagerId: number, on: boolean): string | null {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  if (v.health <= 20 && on) return `${v.name} is too hurt to keep watch.`;
  v.nightWatch = on || undefined;
  return null;
}

/**
 * The mythic watch: a grand wizard (a wizard past level 15), an emblem knight
 * (a knight past 22) and every champion keep it always. When something
 * mythic comes they answer it themselves — posted or not, on the night watch
 * or asleep — unless they are away from the town.
 */
export const isMythicWatcher = (v: { role: string; rank: number; champion?: unknown }) =>
  (v.role === "wizard" && v.rank >= 15) || (v.role === "knight" && v.rank >= 22) || !!v.champion;

/** The small things of the dark that prowl in the opening: all of them burn in light. */
export const NIGHT_PROWLERS: MonsterKind[] = ["wisp", "ghoul", "wraith"];

/** The creatures of the dark, by the level they come at: what the land sends in place of others, early on. */
const NIGHTBORN: MonsterKind[] = ["wisp", "ghoul", "wraith", "mummy", "werewolf", "jiangshi", "yurei", "banshee", "vampire", "wendigo", "jorogumo", "kitsune", "gashadokuro"];

/**
 * Only a mythic thing turns the sky red (map/render): its omen's cast and unnatural dark
 * (./omens, power 2), and the red of the fight while it still stands on the field. Any
 * lesser raid — a wave, a band, a legend, a haunt — leaves the sky as the day and the weather made it.
 */
export function redSky(s: GameState): boolean {
  return !!s.raid?.started && s.raid.combatants.some((u) => u.side === "monster" && u.mythic && u.hp > 0);
}

/** A creature of the dark fit for a level: the first whose range reaches it, else the last. */
export function nightbornFor(level: number): MonsterKind {
  for (const k of NIGHTBORN) {
    const d = MONSTERS[k];
    if (d && level <= d.max) return k;
  }
  return NIGHTBORN[NIGHTBORN.length - 1];
}

/** A time moved on to nine that evening, if it falls in daylight: the dark comes at night. */
export function toNight(t: number): number {
  const minute = ((t % 1440) + 1440) % 1440;
  const hour = Math.floor(minute / 60);
  if (isNightHour(hour)) return t;
  return t - minute + 21 * 60;
}
