import { CATALOG, WARDS, type WardKey } from "./catalog";
import { MONSTERS } from "./bestiary";
import { ELEMENT_NAME, type Element } from "./elements";
import { log } from "./state";
import { stats } from "./stats";
import { structureMaxHp, wallHp, wallLevel, wallMeta } from "./world";
import { Overlay, type GameState, type IncomingMonster } from "./types";

/**
 * Omens: the air a legendary or mythic thing brings with it.
 *
 * When one arrives, the town's air turns to its element for the fight and
 * half a day after (a whole day for a mythic thing), and everything goes
 * harder: ashfall chokes the work and sets roofs smouldering; the drowning
 * mist soaks the stores; tremors crack walls and floors; a gale blows arrows
 * off their mark; a storm throws lightning at the roofs; the glare blinds the
 * defenders; an unnatural night falls at noon; time slips, and building and
 * training crawl; space warps, and the guards see what comes too late.
 *
 * Each omen is turned by its ward, made at the mythic laboratory from an
 * essence of the element that beats it. A ward in store is burnt the moment
 * the omen comes, and it does not take; one burnt later lifts it.
 */

export interface Omen {
  element: Element;
  /** Game minute it lifts. */
  until: number;
  /** 1 for a legendary thing, 2 for a mythic one. */
  power: 1 | 2;
  /** What brought it. */
  source: string;
  /** A ward was burnt against it: it does not take. */
  warded?: boolean;
}

export const OMEN_NAME: Record<Element, string> = {
  fire: "Ashfall", water: "Drowning mist", earth: "Tremors", air: "Gale", thunder: "Storm",
  light: "Blinding glare", dark: "Unnatural night", time: "Time slip", space: "Warped space",
};
export const OMEN_TEXT: Record<Element, string> = {
  fire: "Ash chokes the work, and roofs smoulder: buildings are scorched every hour.",
  water: "A drowning mist: the stores spoil faster, and troops wade slowly.",
  earth: "The ground shakes: walls crack and buildings are shaken every hour.",
  air: "A gale: arrows, bolts and spells fly wide, a third weaker.",
  thunder: "A storm: lightning strikes the roofs, and the towers shoot weaker in the rain.",
  light: "A blinding glare: every defender strikes a fifth weaker.",
  dark: "An unnatural night: the dark falls at noon, and Hope drains away.",
  time: "Time slips: building and training go at half pace.",
  space: "Space warps: guards see what comes too late, and troops lose their way.",
};
/**
 * An omen as it is named and told: a legendary thing's dark is a gloom, not the night — only a
 * mythic thing's dark falls on the sky (map/render environment); what it does to work and Hope is the same.
 */
export const omenName = (e: Element, power: 1 | 2) => (e === "dark" && power === 1 ? "Deep gloom" : OMEN_NAME[e]);
export const omenText = (e: Element, power: 1 | 2) => (e === "dark" && power === 1 ? "A deep gloom that is not night: work slows, and Hope drains away." : OMEN_TEXT[e]);

/** The hit to all work, and the hourly drag on Hope, for a legendary omen; a mythic one is half as bad again. */
const DEBUFF: Record<Element, { production: number; mood: number }> = {
  fire: { production: 0.8, mood: -0.5 }, water: { production: 0.9, mood: -0.3 }, earth: { production: 0.9, mood: -0.3 },
  air: { production: 0.95, mood: -0.2 }, thunder: { production: 0.9, mood: -0.3 }, light: { production: 0.9, mood: -0.3 },
  dark: { production: 0.85, mood: -0.8 }, time: { production: 0.8, mood: -0.3 }, space: { production: 0.9, mood: -0.3 },
};

export const wardFor = (e: Element): WardKey => WARDS.find((w) => w.element === e)!.key;

/** The omen that is on the town now, if one is and it was not warded. */
export function omenOf(s: GameState): Omen | null {
  const o = s.omen;
  return o && !o.warded && o.until > s.time ? o : null;
}
export const omenIs = (s: GameState, e: Element) => omenOf(s)?.element === e;

/** The worst thing in a party, for the omen it brings: mythic before legendary, then the higher level. */
function bringer(party: IncomingMonster[]): IncomingMonster | undefined {
  return [...party]
    .filter((p) => MONSTERS[p.kind].legendary && MONSTERS[p.kind].element)
    .sort((a, b) => Number(!!MONSTERS[b.kind].mythic) - Number(!!MONSTERS[a.kind].mythic) || b.level - a.level)[0];
}

/** A legendary or mythic thing arrives: the air turns, unless a ward is burnt. */
export function raiseOmen(s: GameState, party: IncomingMonster[]) {
  const b = bringer(party);
  if (!b) return;
  const def = MONSTERS[b.kind];
  const element = def.element!;
  const power: 1 | 2 = def.mythic ? 2 : 1;
  const omen: Omen = { element, until: s.time + (power === 2 ? 24 : 12) * 60, power, source: def.name };
  const ward = wardFor(element);
  if (s.res[ward] >= 1) {
    s.res[ward] -= 1;
    omen.warded = true;
    stats(s).wards = (stats(s).wards ?? 0) + 1;
    log(s, `The ${def.name.toLowerCase()} brings ${omenName(element, power).toLowerCase()} — a ${ELEMENT_NAME[element].toLowerCase()} ward is burnt on the walls, and it does not take.`, "good");
  } else {
    const d = DEBUFF[element];
    const k = power === 2 ? 1.5 : 1;
    s.debuffs = s.debuffs.filter((x) => !x.id.startsWith("omen-"));
    s.debuffs.push({
      id: `omen-${element}`, label: `${omenName(element, power)} — the ${def.name.toLowerCase()}'s ${ELEMENT_NAME[element].toLowerCase()}`, until: omen.until,
      moodPerHour: d.mood * k, production: 1 - (1 - d.production) * k,
    });
    log(s, `The ${def.name.toLowerCase()} brings ${omenName(element, power).toLowerCase()} with it. ${omenText(element, power)} A ${ELEMENT_NAME[element].toLowerCase()} ward from the mythic laboratory would turn it.`, "bad");
  }
  s.omen = omen;
}

/** Burns a ward against the omen that is on the town, and lifts it. */
export function burnWard(s: GameState): string | null {
  const o = omenOf(s);
  if (!o) return "There is no omen on the town to ward.";
  const ward = wardFor(o.element);
  if (s.res[ward] < 1) return `No ${ELEMENT_NAME[o.element].toLowerCase()} ward in store: the mythic laboratory makes them.`;
  s.res[ward] -= 1;
  o.warded = true;
  stats(s).wards = (stats(s).wards ?? 0) + 1;
  s.debuffs = s.debuffs.filter((x) => x.id !== `omen-${o.element}`);
  log(s, `A ${ELEMENT_NAME[o.element].toLowerCase()} ward is burnt, and the ${omenName(o.element, o.power).toLowerCase()} lifts.`, "good");
  return null;
}

/** How an omen bends a fight: damage of all defenders, of shots, of towers; pace; how far guards see. */
export function omenCombat(s: GameState): { dmg: number; ranged: number; towers: number; speed: number; alert: number } {
  const o = omenOf(s);
  const out = { dmg: 1, ranged: 1, towers: 1, speed: 1, alert: 1 };
  if (!o) return out;
  const k = o.power === 2 ? 1.5 : 1;
  const worse = (f: number) => 1 - (1 - f) * k;
  if (o.element === "light") out.dmg = worse(0.8);
  if (o.element === "air") out.ranged = worse(0.7);
  if (o.element === "thunder") out.towers = worse(0.8);
  if (o.element === "water") out.speed = worse(0.7);
  if (o.element === "space") {
    out.speed = worse(0.8);
    out.alert = worse(0.6);
  }
  return out;
}

/** Building and training pace under the omen: half while time slips. */
export const omenPace = (s: GameState) => (omenIs(s, "time") ? (omenOf(s)!.power === 2 ? 0.35 : 0.5) : 1);

/** The hour under an omen: what the fire, the ground and the storm do to the town. */
export function omensHourly(s: GameState, r: () => number) {
  const o = omenOf(s);
  if (!o) {
    if (s.omen && s.omen.until <= s.time) {
      if (!s.omen.warded) log(s, `The ${OMEN_NAME[s.omen.element].toLowerCase()} lifts.`, "info");
      s.omen = null;
    }
    return;
  }
  const hits = o.power === 2 ? 3 : 2;
  const standing = s.structures.filter((st) => !st.buildUntil && st.type !== "townhall");
  if (o.element === "fire" || o.element === "earth" || o.element === "thunder") {
    for (let i = 0; i < hits && standing.length; i++) {
      const st = standing[Math.floor(r() * standing.length)];
      const share = o.element === "thunder" ? 0.08 : 0.03;
      st.hp = Math.max(1, st.hp - structureMaxHp(st) * share);
      if (o.element === "earth") st.condition = Math.max(0, st.condition - 3);
      if (o.element === "thunder" && i === 0) log(s, `Lightning strikes the ${CATALOG[st.type].name.toLowerCase()} at ${st.x},${st.y}.`, "bad");
    }
  }
  if (o.element === "earth") {
    // The walls crack: a few tiles lose a tenth of their stone.
    const walls: number[] = [];
    for (let t = 0; t < s.map.overlay.length; t++) if (s.map.overlay[t] === Overlay.Wall) walls.push(t);
    for (let i = 0; i < Math.min(walls.length, 6 * o.power); i++) {
      const t = walls[Math.floor(r() * walls.length)];
      const m = s.map.meta[t];
      s.map.meta[t] = wallMeta(wallLevel(m), Math.max(1, Math.round(wallHp(m) * 0.9)));
    }
  }
}
