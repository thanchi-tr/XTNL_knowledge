import { attrsOf, ATTR_NAME, type AttrKey } from "./attributes";
import { COURSES, RECRUIT_RANK, TRAIN_CAP } from "./catalog";
import type { GameState, Role, StructureType, Villager } from "./types";

/**
 * Who may be taught what. Every training building runs a programme: who may
 * enrol (the bar — the attributes the calling needs, and a body fit to
 * start), how the training runs, and what they pass out as. The building
 * enrols the best-suited of those who clear the bar; no one else.
 *
 *   school      a course for each trade — Wits for the scientist, Dexterity
 *               for the kitchen, Valor and Wits for a commander…
 *   barracks    foot soldiers: Might, and not much of it — most can serve
 *   archery     bowmen: Agility
 *   armoury     the heavy classes (below): each its own bar
 *   wizard hut  Arcana and Lore
 *   army school, noble yard   knights: Valor, Might, Vitality
 */

export interface Bar {
  attr: AttrKey;
  min: number;
}

export interface Programme {
  id: string;
  /** What they pass out as. */
  title: string;
  /** The role they take. */
  role: Role;
  bars: Bar[];
  /** The procedure, step by step, for the panel. */
  steps: string[];
  blurb: string;
}

/** Fit to start: not hurt, not starving, not already at a trade or in training. */
export const FIT_HEALTH = 50;

// ── The heavy armoury's classes ───────────────────────────

export type HeavyClass = "shieldbearer" | "pikeman" | "juggernaut" | "breaker" | "warden";

export interface HeavyDef {
  name: string;
  blurb: string;
  bars: Bar[];
  /** In the fight: hit points, blows, reach (tiles added), pace; blows against the legendary and mythic; inside the hall's circle. */
  hp: number;
  dmg: number;
  reach: number;
  pace: number;
  vsGreat: number;
  atHall: number;
}

export const HEAVY_CLASSES: Record<HeavyClass, HeavyDef> = {
  shieldbearer: {
    name: "Shieldbearer", blurb: "A tower shield and a short blade: the hardest thing on the field to kill, and slow to kill anything.",
    bars: [{ attr: "vit", min: 10 }, { attr: "str", min: 9 }], hp: 1.7, dmg: 0.75, reach: 0, pace: 0.9, vsGreat: 1, atHall: 1,
  },
  pikeman: {
    name: "Pikeman", blurb: "An eighteen-foot pike: strikes first, and from further off than any blade.",
    bars: [{ attr: "agi", min: 9 }, { attr: "mig", min: 9 }], hp: 1.1, dmg: 1.1, reach: 0.9, pace: 1, vsGreat: 1.1, atHall: 1,
  },
  juggernaut: {
    name: "Juggernaut", blurb: "Plate on plate on plate: slow, and all but unstoppable.",
    bars: [{ attr: "mig", min: 11 }, { attr: "vit", min: 11 }, { attr: "end", min: 9 }], hp: 2.1, dmg: 1.25, reach: 0, pace: 0.7, vsGreat: 1, atHall: 1,
  },
  breaker: {
    name: "Giant-breaker", blurb: "A great maul made for the legendary: blows half again as heavy against anything legendary or mythic.",
    bars: [{ attr: "mig", min: 12 }], hp: 1.25, dmg: 1, reach: 0, pace: 0.9, vsGreat: 1.6, atHall: 1,
  },
  warden: {
    name: "Iron Warden", blurb: "Sworn to the hall: a third stronger inside its circle, where the town's heart is.",
    bars: [{ attr: "val", min: 11 }, { attr: "vit", min: 9 }], hp: 1.3, dmg: 1, reach: 0, pace: 1, vsGreat: 1, atHall: 1.35,
  },
};
export const HEAVY_ORDER: HeavyClass[] = ["shieldbearer", "pikeman", "juggernaut", "breaker", "warden"];

// ── Programmes ────────────────────────────────────────────

const COURSE_BARS: Partial<Record<Role, Bar[]>> = {
  scientist: [{ attr: "wit", min: 10 }],
  chef: [{ attr: "dex", min: 8 }],
  geologist: [{ attr: "wit", min: 9 }, { attr: "end", min: 8 }],
  commander: [{ attr: "val", min: 9 }, { attr: "wit", min: 9 }],
  biologist: [{ attr: "wit", min: 9 }, { attr: "str", min: 7 }],
  artist: [{ attr: "dex", min: 9 }],
};

/** The programmes a building runs. */
export function programmesAt(type: StructureType): Programme[] {
  const drill = TRAIN_CAP[type];
  const drillTo = drill ? `Drill here, on the building's pace, to level ${drill}; higher ranks are won in battle.` : "Study here, on the building's pace.";
  switch (type) {
    case "school":
      return COURSES.map((c) => ({
        id: c.role, title: c.name, role: c.role, bars: COURSE_BARS[c.role] ?? [], blurb: c.blurb,
        steps: [`Enrol: an idle villager who clears the bar`, `Lessons: ${c.hours} hours, faster at a higher school and with the day's reviews done`, `Pass out as a ${c.name.toLowerCase()}, to a trade that needs one`],
      }));
    case "barracks":
      return [{ id: "infantry", title: "Foot soldier", role: "infantry", bars: [{ attr: "mig", min: 6 }], blurb: "Spear and shield: the town's first line — most can serve in it.", steps: ["Enrol: an idle villager from a house joined to the barracks by road, who clears the bar", "Muster: four hours", drillTo] }];
    case "archery":
      return [{ id: "archer", title: "Bowman", role: "infantry", bars: [{ attr: "agi", min: 9 }], blurb: `A bow, and the eye for it: joins at rank ${RECRUIT_RANK.archery ?? 1}.`, steps: ["Enrol: an idle villager from a joined house with the eye for a bow", "Muster: four hours", drillTo] }];
    case "armoury":
      return HEAVY_ORDER.map((k) => ({
        id: `heavy:${k}`, title: HEAVY_CLASSES[k].name, role: "heavy" as Role, bars: HEAVY_CLASSES[k].bars, blurb: HEAVY_CLASSES[k].blurb,
        steps: ["Enrol: an idle villager from a joined house with the frame for it", "Fitting and muster: four hours, and the iron for the harness", drillTo],
      }));
    case "wizardhut":
      return [{ id: "wizard", title: "Apprentice wizard", role: "wizard", bars: [{ attr: "arc", min: 10 }, { attr: "lor", min: 8 }], blurb: "The spark, and the patience for books.", steps: ["Enrol: an idle villager with the spark (Arcana) and the patience (Lore)", "Initiation: four hours", "Study here, rising on their own — at 15 a grand wizard"] }];
    case "armyschool":
    case "nobleyard":
      return [{ id: "knight", title: "Noble squire", role: "knight", bars: [{ attr: "val", min: 10 }, { attr: "mig", min: 9 }, { attr: "vit", min: 8 }], blurb: "Courage first, then an arm and a frame for plate.", steps: ["Enrol: an idle villager of courage, from a joined house", "Oath and muster: four hours, paid in coin and silver", drillTo] }];
    default:
      return [];
  }
}

export interface Candidate {
  v: Villager;
  ok: boolean;
  /** What stops them, in words. */
  fails: string[];
  /** How well suited: the sum of the bar's attributes. */
  fit: number;
}

/** Everyone who might be enrolled in a programme, the best-suited first, and why each can or cannot be. */
export function candidates(s: GameState, prog: Programme, reach?: (v: Villager) => boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const v of s.villagers) {
    if (v.role !== "idle" || v.champion) continue;
    const a = attrsOf(v);
    const fails: string[] = [];
    if (v.work) fails.push("already enrolled");
    if (v.health < FIT_HEALTH) fails.push(`health ${Math.round(v.health)} (needs ${FIT_HEALTH})`);
    for (const b of prog.bars) if (a[b.attr] < b.min) fails.push(`${ATTR_NAME[b.attr]} ${a[b.attr]} (needs ${b.min})`);
    if (reach && !reach(v)) fails.push("no road from their house");
    out.push({ v, ok: !fails.length, fails, fit: prog.bars.reduce((t, b) => t + a[b.attr], 0) });
  }
  return out.sort((x, y) => Number(y.ok) - Number(x.ok) || y.fit - x.fit);
}

/** The one a programme enrols: the best-suited who clears the bar. */
export function bestCandidate(s: GameState, prog: Programme, reach?: (v: Villager) => boolean): Villager | null {
  return candidates(s, prog, reach).find((c) => c.ok)?.v ?? null;
}

export const barText = (bars: Bar[]) => (bars.length ? bars.map((b) => `${ATTR_NAME[b.attr]} ${b.min}+`).join(", ") : "anyone fit to start");
