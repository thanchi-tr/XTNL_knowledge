import { HERO_GATES, heroCapOf, tellGate } from "./mastery";
import { ATTR_NAME, growOnRise } from "./attributes";
import { recognize } from "./recognition";
import { SOLDIER_MAX, soldierTitle } from "./catalog";
import { log } from "./state";
import { stock, take } from "./loot";
import { canAfford, costText, pay } from "./world";
import type { Cost } from "./catalog";
import type { GameState, Villager } from "./types";

/**
 * Heroes: the top of every fighting ladder, and what they choose to become.
 *
 * Six hero kinds. Two come from the old ladders — the emblem knight (a knight
 * past 22) and the grand wizard (a wizard past 15). Four are raised from a
 * soldier who has reached the top of the soldier's ladder (level 20), at the
 * hall, for a price in silver, gold and monster jewels:
 *
 *   Warden    from a bowman      the long shot, the slayer of legends
 *   Warlord   from a blade       the wall, the cleaver, the commander
 *   Cleric    from any soldier   the healer, the town's faith, the wrath
 *   Skald     from any soldier   the war-song, the hearth-song, the dirge
 *
 * Every hero has a skill tree: three branches of three. A point comes at hero
 * levels 1, 3, 6, 10, 15, 21 and 28 — seven in a lifetime, nine skills on the
 * tree — so a hero is the choices made for them. The third skill of a branch
 * (a capstone) needs level 15 and is one per hero.
 *
 * Levelling is meant to be slow and costly (power creep): the four raised
 * classes level only by battle, each level asking a third more than the last
 * (the last level alone asks 190,000 experience, the whole climb about
 * 780,000 — a legend slain is worth a few hundred); knights and wizards climb by their
 * own ladders (sorties, emblems, ascensions), and their hero level follows
 * their rank. And a level is worth little on its own: power grows by the log
 * of the level, not the level (heroPower, and combat.troopStats for the old
 * ladders). What a hero brings is mostly their skills — and a hero who dies is
 * gone, with everything spent on them.
 */

export type HeroClass = "warden" | "warlord" | "cleric" | "skald" | "knight" | "wizard";
export const RAISED: HeroClass[] = ["warden", "warlord", "cleric", "skald"];

export const HERO_NAME: Record<HeroClass, string> = {
  warden: "Warden", warlord: "Warlord", cleric: "Cleric", skald: "Skald", knight: "Emblem Knight", wizard: "Grand Wizard",
};
export const HERO_BLURB: Record<HeroClass, string> = {
  warden: "A bowman become the long shot of the town: reach, volleys, and the killing of legends.",
  warlord: "A blade become a wall and a banner: holds the line, cleaves the pack, drives the troops round them.",
  cleric: "Mends the wounded in the fight, keeps the town's faith, and turns wrath on the things of the dark.",
  skald: "Sings the troops faster and harder, sings the town through its nights, and sings the monsters' courage out of them.",
  knight: "The knight past the Paladin: bound to an emblem, riding out with a battalion.",
  wizard: "The wizard past the threshold, who comes out only for legends.",
};

/** What a hero's skills do, summed: on themselves, on allies near them, on foes near them, on the town. */
export interface HeroMods {
  dmg: number;
  hp: number;
  range: number;
  haste: number;
  vsLegend: number;
  /** Share of a mythic thing's ward their blows pierce (0–1). */
  pierce: number;
  crit: number;
  /** Extra targets struck by each blow, at `volleyShare` of its damage. */
  volley: number;
  volleyShare: number;
  /** Splash onto foes beside the target. */
  cleave: number;
  cleaveR: number;
  /** Damage bonus against dark things (the undead, the shadow). */
  vsDark: number;
  /** Struck foes slowed for two seconds. */
  snare: boolean;
  /** Auras: radius in tiles, and what they give. */
  auraR: number;
  allyDmg: number;
  allyHaste: number;
  /** Damage allies near take, as a multiplier (0.8 = a fifth less). */
  allyGuard: number;
  /** Hit points an ally near is healed a second. */
  heal: number;
  /** Foes near deal this much less (0.1 = a tenth). */
  weaken: number;
  /** Terror of the dark things near is shrugged off by this share (0–1). */
  ward: number;
  /** Extra battalion soldiers (emblem knights). */
  battalion: number;
  /** The town: sanity a head an hour, Hope a day, a floor under Hope, festivals lingering longer, Foundations faster. */
  sanity: number;
  hope: number;
  hopeFloor: number;
  feast: number;
  found: number;
}

export const NO_MODS: HeroMods = {
  dmg: 1, hp: 1, range: 0, haste: 1, vsLegend: 1, pierce: 0, crit: 0, volley: 0, volleyShare: 0.5, cleave: 0, cleaveR: 1.5, vsDark: 1, snare: false,
  auraR: 0, allyDmg: 1, allyHaste: 1, allyGuard: 1, heal: 0, weaken: 0, ward: 0, battalion: 0,
  sanity: 0, hope: 0, hopeFloor: 0, feast: 1, found: 1,
};

export interface Skill {
  id: string;
  name: string;
  branch: number;
  tier: 1 | 2 | 3;
  blurb: string;
  apply: (m: HeroMods) => void;
}

const aura = (m: HeroMods, r: number) => {
  m.auraR = Math.max(m.auraR, r);
};

/** The six trees: three branches of three, the branch names first. */
export const TREES: Record<HeroClass, { branches: [string, string, string]; skills: Skill[] }> = {
  warden: {
    branches: ["Hunter", "Volley", "Deadeye"],
    skills: [
      { id: "keen-eye", name: "Keen Eye", branch: 0, tier: 1, blurb: "Reach +1.5.", apply: (m) => { m.range += 1.5; } },
      { id: "hunters-mark", name: "Hunter's Mark", branch: 0, tier: 2, blurb: "+40% against legendary things.", apply: (m) => { m.vsLegend *= 1.4; } },
      { id: "slayer", name: "Slayer", branch: 0, tier: 3, blurb: "+80% against legends, and a third of a mythic thing's ward pierced.", apply: (m) => { m.vsLegend *= 1.8; m.pierce = Math.max(m.pierce, 0.33); } },
      { id: "quick-draw", name: "Quick Draw", branch: 1, tier: 1, blurb: "Shoots 15% faster.", apply: (m) => { m.haste *= 0.85; } },
      { id: "split-shot", name: "Split Shot", branch: 1, tier: 2, blurb: "Every shot strikes one more foe, at half.", apply: (m) => { m.volley += 1; } },
      { id: "arrow-storm", name: "Arrow Storm", branch: 1, tier: 3, blurb: "Every shot strikes three more foes.", apply: (m) => { m.volley += 2; } },
      { id: "steady-hand", name: "Steady Hand", branch: 2, tier: 1, blurb: "+25% damage.", apply: (m) => { m.dmg *= 1.25; } },
      { id: "snare", name: "Snare Shot", branch: 2, tier: 2, blurb: "Struck foes are slowed for two seconds.", apply: (m) => { m.snare = true; } },
      { id: "deadeye", name: "Deadeye", branch: 2, tier: 3, blurb: "One shot in four strikes double.", apply: (m) => { m.crit = Math.max(m.crit, 0.25); } },
    ],
  },
  warlord: {
    branches: ["Vanguard", "Battlelord", "Commander"],
    skills: [
      { id: "iron-hide", name: "Iron Hide", branch: 0, tier: 1, blurb: "+30% hit points.", apply: (m) => { m.hp *= 1.3; } },
      { id: "shield-wall", name: "Shield Wall", branch: 0, tier: 2, blurb: "Allies within 2.5 tiles take a fifth less.", apply: (m) => { m.allyGuard *= 0.8; aura(m, 2.5); } },
      { id: "bulwark", name: "Bulwark", branch: 0, tier: 3, blurb: "Allies within 3 tiles take a third less; +40% hit points.", apply: (m) => { m.allyGuard *= 0.83; m.hp *= 1.4; aura(m, 3); } },
      { id: "heavy-blows", name: "Heavy Blows", branch: 1, tier: 1, blurb: "+25% damage.", apply: (m) => { m.dmg *= 1.25; } },
      { id: "cleave", name: "Cleave", branch: 1, tier: 2, blurb: "Blows splash 40% onto foes beside the target.", apply: (m) => { m.cleave = Math.max(m.cleave, 0.4); } },
      { id: "warbringer", name: "Warbringer", branch: 1, tier: 3, blurb: "Splash 70% within 2 tiles; +25% damage.", apply: (m) => { m.cleave = 0.7; m.cleaveR = 2; m.dmg *= 1.25; } },
      { id: "rally", name: "Rally", branch: 2, tier: 1, blurb: "Allies within 3 tiles strike 10% harder.", apply: (m) => { m.allyDmg *= 1.1; aura(m, 3); } },
      { id: "war-cry", name: "War Cry", branch: 2, tier: 2, blurb: "Allies strike 10% harder again, and half the dark's terror is shrugged off.", apply: (m) => { m.allyDmg *= 1.1; m.ward = Math.max(m.ward, 0.5); aura(m, 3); } },
      { id: "marshal", name: "Marshal", branch: 2, tier: 3, blurb: "Allies within 4 tiles strike 15% harder and 15% faster.", apply: (m) => { m.allyDmg *= 1.15; m.allyHaste *= 0.85; aura(m, 4); } },
    ],
  },
  cleric: {
    branches: ["Mercy", "Faith", "Wrath"],
    skills: [
      { id: "mend", name: "Mend", branch: 0, tier: 1, blurb: "Allies within 2.5 tiles heal 3 a second.", apply: (m) => { m.heal += 3; aura(m, 2.5); } },
      { id: "sanctuary", name: "Sanctuary", branch: 0, tier: 2, blurb: "Heals 5 more a second, within 3 tiles.", apply: (m) => { m.heal += 5; aura(m, 3); } },
      { id: "miracle", name: "Miracle", branch: 0, tier: 3, blurb: "Heals 10 more a second; allies take a tenth less.", apply: (m) => { m.heal += 10; m.allyGuard *= 0.9; aura(m, 3.5); } },
      { id: "blessing", name: "Blessing", branch: 1, tier: 1, blurb: "The town: every mind +0.15 sanity an hour.", apply: (m) => { m.sanity += 0.15; } },
      { id: "consecrate", name: "Consecrate", branch: 1, tier: 2, blurb: "The town: Hope +2 a day.", apply: (m) => { m.hope += 2; } },
      { id: "beacon", name: "Beacon of Hope", branch: 1, tier: 3, blurb: "The town: while the cleric lives, Hope does not fall below 20.", apply: (m) => { m.hopeFloor = Math.max(m.hopeFloor, 20); } },
      { id: "smite", name: "Smite", branch: 2, tier: 1, blurb: "+40% against things of the dark.", apply: (m) => { m.vsDark *= 1.4; } },
      { id: "holy-ward", name: "Holy Ward", branch: 2, tier: 2, blurb: "Allies within 3 tiles shrug off the dark's terror.", apply: (m) => { m.ward = 1; aura(m, 3); } },
      { id: "judgement", name: "Judgement", branch: 2, tier: 3, blurb: "+60% against legends; +40% against the dark again.", apply: (m) => { m.vsLegend *= 1.6; m.vsDark *= 1.4; } },
    ],
  },
  skald: {
    branches: ["War-song", "Hearth-song", "Dirge"],
    skills: [
      { id: "drums", name: "Drums", branch: 0, tier: 1, blurb: "Allies within 3 tiles strike 10% faster.", apply: (m) => { m.allyHaste *= 0.9; aura(m, 3); } },
      { id: "battle-hymn", name: "Battle Hymn", branch: 0, tier: 2, blurb: "Allies strike 10% harder and 5% faster again.", apply: (m) => { m.allyDmg *= 1.1; m.allyHaste *= 0.95; aura(m, 3.5); } },
      { id: "saga", name: "Saga", branch: 0, tier: 3, blurb: "Allies within 4 tiles strike 15% harder and faster again.", apply: (m) => { m.allyDmg *= 1.15; m.allyHaste *= 0.87; aura(m, 4); } },
      { id: "tales", name: "Tales by the Fire", branch: 1, tier: 1, blurb: "The town: every mind +0.2 sanity an hour.", apply: (m) => { m.sanity += 0.2; } },
      { id: "feast-songs", name: "Feast Songs", branch: 1, tier: 2, blurb: "The town: a festival's belonging lingers twice as long.", apply: (m) => { m.feast = Math.max(m.feast, 2); } },
      { id: "keeper", name: "Keeper of Legends", branch: 1, tier: 3, blurb: "The town: Foundations build half as fast again.", apply: (m) => { m.found = Math.max(m.found, 1.5); } },
      { id: "dirge", name: "Dirge", branch: 2, tier: 1, blurb: "Foes within 3 tiles strike 10% weaker.", apply: (m) => { m.weaken = Math.max(m.weaken, 0.1); aura(m, 3); } },
      { id: "lament", name: "Lament", branch: 2, tier: 2, blurb: "Foes strike 20% weaker; allies shrug off half the terror.", apply: (m) => { m.weaken = Math.max(m.weaken, 0.2); m.ward = Math.max(m.ward, 0.5); aura(m, 3); } },
      { id: "requiem", name: "Requiem", branch: 2, tier: 3, blurb: "Foes within 4 tiles strike 30% weaker.", apply: (m) => { m.weaken = Math.max(m.weaken, 0.3); aura(m, 4); } },
    ],
  },
  knight: {
    branches: ["Oath", "Lance", "Banner"],
    skills: [
      { id: "aegis", name: "Aegis", branch: 0, tier: 1, blurb: "+25% hit points.", apply: (m) => { m.hp *= 1.25; } },
      { id: "guardian", name: "Guardian", branch: 0, tier: 2, blurb: "Allies within 2.5 tiles take 15% less.", apply: (m) => { m.allyGuard *= 0.85; aura(m, 2.5); } },
      { id: "oathkeeper", name: "Oathkeeper", branch: 0, tier: 3, blurb: "+50% hit points; allies take a quarter less.", apply: (m) => { m.hp *= 1.5; m.allyGuard *= 0.88; aura(m, 3); } },
      { id: "charge", name: "Charge", branch: 1, tier: 1, blurb: "+25% damage.", apply: (m) => { m.dmg *= 1.25; } },
      { id: "lance-wave", name: "Lance Wave", branch: 1, tier: 2, blurb: "Blows splash 40% onto foes beside.", apply: (m) => { m.cleave = Math.max(m.cleave, 0.4); } },
      { id: "dragonbane", name: "Dragonbane", branch: 1, tier: 3, blurb: "+80% against legends; a third of the mythic ward pierced.", apply: (m) => { m.vsLegend *= 1.8; m.pierce = Math.max(m.pierce, 0.33); } },
      { id: "rally-banner", name: "Rally to the Banner", branch: 2, tier: 1, blurb: "Allies within 3 tiles strike 10% harder.", apply: (m) => { m.allyDmg *= 1.1; aura(m, 3); } },
      { id: "sworn", name: "Sworn Company", branch: 2, tier: 2, blurb: "Two more of the battalion ride into every fight.", apply: (m) => { m.battalion += 2; } },
      { id: "standard", name: "Standard of the Realm", branch: 2, tier: 3, blurb: "Allies within 4 tiles strike 15% harder and fear nothing.", apply: (m) => { m.allyDmg *= 1.15; m.ward = 1; aura(m, 4); } },
    ],
  },
  wizard: {
    branches: ["Evocation", "Warding", "Arcana"],
    skills: [
      { id: "focus", name: "Focus", branch: 0, tier: 1, blurb: "+25% damage.", apply: (m) => { m.dmg *= 1.25; } },
      { id: "chain", name: "Chain Spell", branch: 0, tier: 2, blurb: "Every spell jumps to two more foes, at half.", apply: (m) => { m.volley += 2; } },
      { id: "cataclysm", name: "Cataclysm", branch: 0, tier: 3, blurb: "Spells burst 60% onto foes within 2 tiles.", apply: (m) => { m.cleave = 0.6; m.cleaveR = 2; } },
      { id: "barrier", name: "Barrier", branch: 1, tier: 1, blurb: "Allies within 3 tiles take 15% less.", apply: (m) => { m.allyGuard *= 0.85; aura(m, 3); } },
      { id: "mana-shield", name: "Mana Shield", branch: 1, tier: 2, blurb: "+50% hit points.", apply: (m) => { m.hp *= 1.5; } },
      { id: "aegis-arcana", name: "Aegis Arcana", branch: 1, tier: 3, blurb: "Allies within 3.5 tiles take a further fifth less, and shrug off terror.", apply: (m) => { m.allyGuard *= 0.8; m.ward = 1; aura(m, 3.5); } },
      { id: "far-sight", name: "Far Sight", branch: 2, tier: 1, blurb: "Reach +2.", apply: (m) => { m.range += 2; } },
      { id: "spellbreaker", name: "Spellbreaker", branch: 2, tier: 2, blurb: "+50% against legendary things.", apply: (m) => { m.vsLegend *= 1.5; } },
      { id: "archmagus", name: "Archmagus", branch: 2, tier: 3, blurb: "Half of a mythic thing's ward pierced.", apply: (m) => { m.pierce = Math.max(m.pierce, 0.5); } },
    ],
  },
};

/** Hero levels at which a skill point comes: seven in a lifetime, for nine skills. */
export const POINT_AT = [1, 3, 6, 10, 15, 21, 28];
export const CAPSTONE_FROM = 15;
export const HERO_MAX = 30;

/** Experience from one hero level to the next: a third more each level (the last alone ≈ 190,000; the climb ≈ 780,000). */
export const heroXpToNext = (level: number) => Math.round(60 * Math.pow(1.32, level));

/** A hero's power from their level alone: by the log of it, so a level is worth little — skills are the hero. */
export const heroPower = (level: number) => 1 + 0.35 * Math.log(1 + level / 3);

/** The hero kind a villager is, if any. */
export function heroClassOf(v: Villager): HeroClass | null {
  if (v.hero?.cls && RAISED.includes(v.hero.cls)) return v.hero.cls;
  if (v.role === "knight" && v.rank >= 23) return "knight";
  if (v.role === "wizard" && v.rank >= 15) return "wizard";
  return null;
}

/** Hero level: the raised classes by battle; knights and wizards by their own ladders. */
export function heroLevelOf(v: Villager): number {
  const cls = heroClassOf(v);
  if (!cls) return 0;
  if (cls === "knight") return Math.min(HERO_MAX, Math.ceil((v.rank - 22) / 4));
  if (cls === "wizard") return Math.min(HERO_MAX, Math.ceil((v.rank - 14) / 16));
  return v.hero?.level ?? 1;
}

export const pointsOf = (v: Villager) => POINT_AT.filter((l) => heroLevelOf(v) >= l).length;
export const spentOf = (v: Villager) => v.hero?.skills?.length ?? 0;

/** Everything a hero's skills give. */
export function heroMods(v: Villager): HeroMods {
  const cls = heroClassOf(v);
  const m: HeroMods = { ...NO_MODS };
  if (!cls) return m;
  const tree = TREES[cls];
  for (const id of v.hero?.skills ?? []) tree.skills.find((k) => k.id === id)?.apply(m);
  return m;
}

type Result = string | null;

/** Whether a skill can be learned now, and if not, why. */
export function learnBlock(v: Villager, skillId: string): Result {
  const cls = heroClassOf(v);
  if (!cls) return "Not a hero.";
  const tree = TREES[cls];
  const sk = tree.skills.find((k) => k.id === skillId);
  if (!sk) return "No such skill.";
  const have = v.hero?.skills ?? [];
  if (have.includes(skillId)) return "Already learned.";
  if (spentOf(v) >= pointsOf(v)) {
    const next = POINT_AT.find((l) => l > heroLevelOf(v));
    return next ? `No point to spend — the next comes at hero level ${next}.` : "Every point is spent.";
  }
  if (sk.tier > 1) {
    const below = tree.skills.find((k) => k.branch === sk.branch && k.tier === sk.tier - 1)!;
    if (!have.includes(below.id)) return `Learn ${below.name} first.`;
  }
  if (sk.tier === 3) {
    if (heroLevelOf(v) < CAPSTONE_FROM) return `A capstone needs hero level ${CAPSTONE_FROM}.`;
    if (tree.skills.some((k) => k.tier === 3 && have.includes(k.id))) return "One capstone to a hero.";
  }
  return null;
}

export function learnSkill(s: GameState, villagerId: number, skillId: string): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  const why = learnBlock(v, skillId);
  if (why) return why;
  const cls = heroClassOf(v)!;
  v.hero ??= { cls, level: 1, xp: 0, skills: [] };
  v.hero.cls = cls;
  v.hero.skills = [...(v.hero.skills ?? []), skillId];
  log(s, `${v.name} learns ${TREES[cls].skills.find((k) => k.id === skillId)!.name}.`, "good");
  return null;
}

/** Unlearning costs dearly: every point back, for gold. */
export const RESPEC_COST: Cost = { gold: 10 };
export function respec(s: GameState, villagerId: number): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v?.hero?.skills?.length) return "Nothing to unlearn.";
  if (!canAfford(s.res, RESPEC_COST)) return `Needs ${costText(RESPEC_COST)}.`;
  pay(s.res, RESPEC_COST);
  v.hero.skills = [];
  log(s, `${v.name} unlearns every skill, to choose again.`, "info");
  return null;
}

// ── Raising a hero ───────────────────────────────────────

/** The price of a hero, and how many the town may keep: one, and one more for every five levels of the hall. */
export const RAISE_COST: Cost = { silver: 30, gold: 5 };
export const RAISE_JEWELS = 2;
export const RAISE_HALL = 6;
export const heroCap = (hallLevel: number) => 1 + Math.floor(hallLevel / 5);
export const raisedHeroes = (s: GameState) => s.villagers.filter((v) => v.hero && RAISED.includes(v.hero.cls)).length;

/** Whether this soldier can be raised to this class now, and if not, why. */
export function raiseBlock(s: GameState, v: Villager, cls: HeroClass): Result {
  if (!RAISED.includes(cls)) return "Knights and wizards rise by their own ladders.";
  if (v.hero && RAISED.includes(v.hero.cls)) return "Already a hero.";
  if (!["infantry", "archer", "heavy"].includes(v.role)) return "Only a soldier can be raised.";
  if (v.rank < SOLDIER_MAX) return `Only a soldier at the top of the ladder (level ${SOLDIER_MAX}) — this one is ${v.rank}.`;
  const ranged = !!soldierTitle(v.rank).ranged;
  if (cls === "warden" && !ranged) return "A Warden is raised from a bowman.";
  if (cls === "warlord" && ranged) return "A Warlord is raised from a blade, not a bow.";
  const hall = s.structures.find((b) => b.type === "townhall");
  if (!hall || hall.level < RAISE_HALL) return `The hall must stand at level ${RAISE_HALL}.`;
  if (raisedHeroes(s) >= heroCap(hall.level)) return `The town keeps ${heroCap(hall.level)} hero${heroCap(hall.level) === 1 ? "" : "es"} at its hall's level — raise the hall for another.`;
  if (!canAfford(s.res, RAISE_COST)) return `Needs ${costText(RAISE_COST)}.`;
  if (stock(s, "jewel") < RAISE_JEWELS) return `Needs ${RAISE_JEWELS} monster jewels in the forge's store.`;
  return null;
}

export function raiseHero(s: GameState, villagerId: number, cls: HeroClass): Result {
  const v = s.villagers.find((x) => x.id === villagerId);
  if (!v) return "No such villager.";
  const why = raiseBlock(s, v, cls);
  if (why) return why;
  pay(s.res, RAISE_COST);
  take(s, "jewel", RAISE_JEWELS);
  v.hero = { cls, level: 1, xp: 0, skills: [] };
  recognize(s, 6, "a hero raised");
  log(s, `${v.name} is raised a ${HERO_NAME[cls]}.`, "good");
  return null;
}

/**
 * The fight's lesson for the heroes who stood in it and lived: a share of
 * what was slain, by its level squared — a scuffle teaches nothing, a legend
 * a great deal.
 */
export function heroesLearn(s: GameState, fought: Villager[], slainLevels: number[]) {
  const pool = slainLevels.reduce((a, l) => a + (l * l) / 8, 0);
  const heroes = fought.filter((v) => v.hero && RAISED.includes(v.hero.cls));
  if (!heroes.length || pool <= 0) return;
  const share = pool / Math.max(1, heroes.length / 1.5);
  for (const v of heroes) {
    const h = v.hero!;
    h.xp += share;
    // A hero's higher levels need the player's own emblems, deep enough (./mastery).
    const cap = heroCapOf(s, HERO_MAX);
    if (h.level >= cap && h.level < HERO_MAX) {
      h.xp = Math.min(h.xp, heroXpToNext(h.level));
      tellGate(s, v, "hero's road", "any", HERO_GATES.find((g) => g.from === cap)?.depth ?? 5);
    }
    while (h.level < cap && h.xp >= heroXpToNext(h.level)) {
      h.xp -= heroXpToNext(h.level);
      h.level += 1;
      const point = POINT_AT.includes(h.level);
      const grew = growOnRise(v, Math.floor(s.time) + h.level);
      log(s, `${v.name} rises to ${HERO_NAME[h.cls]} ${h.level}${grew ? ` (+1 ${ATTR_NAME[grew]})` : ""}${point ? " — a skill to choose" : ""}.`, "good");
    }
  }
}

/** The town's share of its heroes' gifts: the living heroes' town skills, summed. */
export function townGifts(s: GameState): { sanity: number; hope: number; hopeFloor: number; feast: number; found: number } {
  const g = { sanity: 0, hope: 0, hopeFloor: 0, feast: 1, found: 1 };
  for (const v of s.villagers) {
    if (!heroClassOf(v) || !v.hero?.skills?.length) continue;
    const m = heroMods(v);
    g.sanity += m.sanity;
    g.hope += m.hope;
    g.hopeFloor = Math.max(g.hopeFloor, m.hopeFloor);
    g.feast = Math.max(g.feast, m.feast);
    g.found = Math.max(g.found, m.found);
  }
  return g;
}
