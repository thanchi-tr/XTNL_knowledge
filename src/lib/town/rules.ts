import type { Attribute } from "@prisma/client";

/**
 * The rules of the town, with no rendering and no database in them.
 *
 * Everything the town does is a function of what the player actually knows:
 * which Fields they have levelled decides which tree the settlement grows
 * into, attribute scores decide how efficiently troops are kept, the review
 * streak decides how fast work completes, and the equipped emblems decide
 * which monsters can be turned away and which weapons can be forged. The town
 * is a picture of the player's knowledge — not a second game bolted beside it.
 *
 * Pure and client-safe (type-only Prisma import), so the renderer, the page
 * and any future server-side tick all evaluate the same rules.
 */

// ── Knowledge schools ──────────────────────────────────────

/**
 * The three families a Field can belong to. Classified by name rather than
 * by a new column, because the Field list is the player's own and grows —
 * a keyword pass keeps "Behavioural Economics" landing in commerce without
 * anyone remembering to tag it.
 */
export type School = "commerce" | "science" | "mind";

const SCHOOL_PATTERNS: Record<School, RegExp> = {
  commerce: /trad|business|financ|econom|market|account|sales|invest/i,
  science: /bio|chem|math|stat|computer|physic|engineer|science|medic/i,
  mind: /personal|self|psych|mental|mind|habit|help|philos|wellbe/i,
};

export function schoolOf(fieldName: string): School | null {
  for (const school of ["commerce", "mind", "science"] as School[]) {
    if (SCHOOL_PATTERNS[school].test(fieldName)) return school;
  }
  return null;
}

export interface TownInput {
  /** Summed Field level per school. */
  schools: Record<School, number>;
  scores: Partial<Record<Attribute, number>>;
  streakDays: number;
  /** Attributes carried by every active, equipped emblem (a Synergy counts twice). */
  equippedAttributes: Attribute[];
  /** Deepest equipped emblem, 0–15. */
  peakDepth: number;
  /** Reviews passed today — each one shaves a little off running timers. */
  reviewsToday: number;
  /** New ideas this week, per school — the currency of repelling monsters. */
  newIdeasThisWeek: Record<School, number>;
  /** The equipped emblems themselves, for binding to grand wizards and emblem knights. */
  emblems: { code: string; name: string; attributes: Attribute[]; depth: number }[];
  /** Highest Domain level, and all Domain levels summed — they steady troop training. */
  domainPeak: number;
  domainSum: number;
  /** Cards still due today. While any remain, training in town runs slow. */
  dueRemaining: number;
  /** Ideas added today — each one speeds training once the reviews are done. */
  newIdeasToday: number;
}

// ── The tree the town grows into ──────────────────────────

export type TownArchetype = "hamlet" | "merchant-port" | "alchemist-grove" | "forge-hold" | "arcane-citadel";

export interface TownProfile {
  archetype: TownArchetype;
  title: string;
  motto: string;
  /** Multiplier on every sale. Below 1.0 the town sells at a loss. */
  sellScale: number;
  /** Multiplier on every harvest. */
  harvestScale: number;
  /** Highest tool/weapon tier the town can make itself. 0 = must buy everything. */
  forgeTier: number;
  /** Merchant supply: units per purchase batch, and hours before the batch refills. */
  batchSize: number;
  batchResetHours: number;
  /** 0–0.5, applied to every build and craft timer. */
  streakHaste: number;
}

const TOOL_TIERS = ["none", "hand tools", "iron plough", "drill", "firearm", "runeforged arms"] as const;
export const toolTierName = (t: number) => TOOL_TIERS[Math.max(0, Math.min(TOOL_TIERS.length - 1, t))];

/**
 * Streak shortens every timer by 5%–50%.
 *
 * Log-shaped rather than linear: the first fortnight of a streak is where
 * most people fall off, so that is where each day should be worth the most.
 * A year-long streak lands on the cap; a week is already a fifth of the way.
 */
export function streakHaste(days: number): number {
  if (days <= 0) return 0;
  return Math.min(0.5, 0.05 + 0.1 * Math.log2(1 + days / 3));
}

export function profileFor(input: TownInput): TownProfile {
  const { commerce: c, science: s, mind: m } = input.schools;
  const total = c + s + m;
  const share = (x: number) => (total === 0 ? 0 : x / total);

  let archetype: TownArchetype = "hamlet";
  if (total >= 12) {
    if (Math.min(share(c), share(s), share(m)) >= 0.22) archetype = "arcane-citadel";
    else if (share(c) >= 0.5) archetype = "merchant-port";
    else if (share(s) + share(m) >= 0.7 && share(m) >= 0.2) archetype = "alchemist-grove";
    else if (share(s) >= 0.5) archetype = "forge-hold";
    else archetype = c >= s ? "merchant-port" : "forge-hold";
  }

  // Selling is a commerce skill. A town of scholars with no business sense
  // sells below value — the spec's "negative scale" — while a trading town
  // compounds on every exchange.
  const sellScale = Math.max(0.4, Math.min(3.2, 0.62 + c * 0.055 - (c < 4 ? 0.12 : 0)));
  // Harvest is the mind's yield (patience, method) on top of the science of it.
  const harvestScale = 1 + m * 0.045 + s * 0.02;
  // Making tools needs science; the tier ladder climbs every ~6 science levels.
  const forgeTier = Math.min(5, Math.floor(s / 6));

  const titles: Record<TownArchetype, [string, string]> = {
    hamlet: ["Hamlet", "A few roofs and a well. Everything is still possible."],
    "merchant-port": ["Merchant Port", "Buys its steel, sells its grain dear."],
    "alchemist-grove": ["Alchemist Grove", "Grows more than it can sell for."],
    "forge-hold": ["Forge-Hold", "Makes everything it needs, trades little."],
    "arcane-citadel": ["Arcane Citadel", "Grows, forges and trades alike."],
  };

  return {
    archetype,
    title: titles[archetype][0],
    motto: titles[archetype][1],
    sellScale,
    harvestScale,
    forgeTier,
    batchSize: 1 + Math.floor(c / 3),
    batchResetHours: Math.max(1, 12 - c * 0.35),
    streakHaste: streakHaste(input.streakDays),
  };
}

// ── Buildings ─────────────────────────────────────────────

export type Produce = "potato" | "grape" | "wheat" | "herb";
export const PRODUCE_BASE: Record<Produce, number> = { potato: 10, grape: 5, wheat: 8, herb: 3 };
export const PRODUCE_VALUE: Record<Produce, number> = { potato: 1, grape: 3, wheat: 1.4, herb: 6 };

export type Ore = "coal" | "iron" | "silver" | "gold" | "mithril";
export const MINE_TIERS: Ore[][] = [["coal"], ["coal", "iron"], ["iron", "silver"], ["silver", "gold"], ["gold", "mithril"]];

export type BuildingKind = "hall" | "farm" | "mine" | "forge" | "market" | "barracks" | "tower" | "wall";

export interface Building {
  id: string;
  kind: BuildingKind;
  level: number;
  /** Farm: one produce per slot. Slot count = level. */
  slots?: Produce[];
  /** Epoch ms an upgrade finishes, if one is running. */
  upgradingUntil?: number;
}

/**
 * Farm output per hour, by produce.
 *
 * Slots planted with the same crop stack: n slots of one crop yield
 * n × base × (1 + 0.15 × (n − 1)). Specialising pays, but only in proportion
 * to how much ground you commit — two potato slots are 2.3×, four are 5.8×.
 */
export function farmYield(slots: Produce[], harvestScale: number): Record<Produce, number> {
  const counts = new Map<Produce, number>();
  for (const p of slots) counts.set(p, (counts.get(p) ?? 0) + 1);
  const out = { potato: 0, grape: 0, wheat: 0, herb: 0 } as Record<Produce, number>;
  for (const [p, n] of counts) out[p] = n * PRODUCE_BASE[p] * (1 + 0.15 * (n - 1)) * harvestScale;
  return out;
}

export interface Recipe {
  wood: number;
  stone: number;
  /** Precious metal, needed from level 3 upward — which is what makes the mine matter. */
  metal: Partial<Record<Ore, number>>;
  /** Base hours, before streak and review haste. */
  hours: number;
}

export function upgradeRecipe(kind: BuildingKind, level: number): Recipe {
  const next = level + 1;
  const weight = kind === "hall" ? 2 : kind === "tower" || kind === "forge" ? 1.5 : 1;
  const metal: Partial<Record<Ore, number>> = {};
  if (next >= 3) metal.iron = Math.round(4 * next * weight);
  if (next >= 5) metal.silver = Math.round(2 * next * weight);
  if (next >= 8) metal.gold = Math.round(next * weight);
  if (next >= 12) metal.mithril = Math.round((next - 10) * weight);
  return {
    wood: Math.round(20 * next * weight),
    stone: Math.round(12 * next * weight),
    metal,
    hours: Math.round(2 * Math.pow(next, 1.5) * weight * 10) / 10,
  };
}

/**
 * Time remaining after every acceleration the player has earned.
 * Streak haste is a flat cut; each review today takes another 1%, capped at
 * 30%, so the fastest way to finish a building is to go and study.
 */
export function hastedHours(baseHours: number, profile: TownProfile, reviewsToday: number): number {
  const reviewHaste = Math.min(0.3, reviewsToday * 0.01);
  return baseHours * (1 - profile.streakHaste) * (1 - reviewHaste);
}

// ── Troops ────────────────────────────────────────────────

export type TroopKind = "footman" | "knight" | "ranger" | "witch" | "paladin";

export interface TroopSpec {
  name: string;
  tier: number;
  attribute: Attribute;
  power: number;
  trainHours: number;
  /** Food + coin per hour, before attribute efficiency. */
  upkeep: number;
}

export const TROOPS: Record<TroopKind, TroopSpec> = {
  footman: { name: "Footman", tier: 1, attribute: "PHYSICAL", power: 8, trainHours: 1, upkeep: 1 },
  ranger: { name: "Ranger", tier: 2, attribute: "STATISTIC", power: 14, trainHours: 3, upkeep: 2 },
  knight: { name: "Knight", tier: 3, attribute: "STUBBORNNESS", power: 26, trainHours: 6, upkeep: 4 },
  witch: { name: "Witch", tier: 3, attribute: "CREATIVITY", power: 22, trainHours: 5, upkeep: 3 },
  paladin: { name: "Paladin", tier: 4, attribute: "FAITH", power: 44, trainHours: 12, upkeep: 7 },
};

/** Upkeep falls as the troop's attribute rises: up to 60% cheaper at score 120. */
export function troopUpkeep(kind: TroopKind, scores: TownInput["scores"]): number {
  const spec = TROOPS[kind];
  const score = scores[spec.attribute] ?? 0;
  return spec.upkeep * (1 - Math.min(0.6, score / 200));
}

/** Special structures need a minimum troop tier stationed to operate. */
export const TOWER_CREW: Record<string, { needs: TroopKind; label: string }> = {
  "mage-spire": { needs: "witch", label: "Mage Spire — needs a Witch to operate" },
  "dragon-ballista": { needs: "paladin", label: "Dragon Ballista — needs a Paladin to crew" },
};

export function attackPower(troops: Partial<Record<TroopKind, number>>): number {
  let sum = 0;
  for (const [k, n] of Object.entries(troops) as [TroopKind, number][]) sum += TROOPS[k].power * n;
  return sum;
}

/**
 * A strong town is a safe place to trade, and buyers pay for it: sale value
 * rises with attack power. Selling weapons out raises the neighbours' power
 * too, which is the cost that keeps arms dealing from being free money.
 */
export function saleValue(base: number, profile: TownProfile, power: number): number {
  return base * profile.sellScale * (1 + Math.min(0.5, power / 1200));
}

// ── Monsters ──────────────────────────────────────────────

export interface MonsterSpec {
  kind:
    | "slime" | "bat" | "goblin" | "skeleton" | "wolf" | "spider" | "werewolf" | "wraith"
    | "minotaur" | "troll" | "lich" | "golem" | "wyvern" | "serpent" | "demon" | "dragon";
  name: string;
  level: number;
  hp: number;
  damage: number;
  /** Turned away without a fight if all of these hold before the timer ends. */
  repel: { attribute: Attribute; newIdeas: number; school: School; label: string };
  /** Minutes before it arrives. */
  arrivesIn: number;
}

/**
 * Sixteen classes across fifteen levels. Each repel rite asks for a
 * different attribute, so no single loadout turns every raid away — a
 * player who wants to stop fighting has to know broadly, not deeply.
 */
const BESTIARY: Omit<MonsterSpec, "arrivesIn">[] = [
  { kind: "slime", name: "Cave Slime", level: 1, hp: 30, damage: 4, repel: { attribute: "LOGIC", newIdeas: 1, school: "science", label: "Logic emblem + 1 new science idea" } },
  { kind: "bat", name: "Blood Bat Swarm", level: 1, hp: 24, damage: 5, repel: { attribute: "REASON", newIdeas: 1, school: "mind", label: "Reason emblem + 1 new mind idea" } },
  { kind: "goblin", name: "Goblin Raiders", level: 2, hp: 60, damage: 8, repel: { attribute: "CRITICAL_THINKING", newIdeas: 1, school: "commerce", label: "Critical Thinking emblem + 1 new trade idea" } },
  { kind: "skeleton", name: "Risen Skeleton", level: 3, hp: 90, damage: 11, repel: { attribute: "FAITH", newIdeas: 1, school: "mind", label: "Faith emblem + 1 new mind idea" } },
  { kind: "wolf", name: "Dire Wolf Pack", level: 3, hp: 110, damage: 12, repel: { attribute: "PHYSICAL", newIdeas: 1, school: "mind", label: "Physical emblem + 1 new mind idea" } },
  { kind: "spider", name: "Brood Spider", level: 4, hp: 150, damage: 16, repel: { attribute: "STATISTIC", newIdeas: 2, school: "science", label: "Statistic emblem + 2 new science ideas" } },
  { kind: "werewolf", name: "Werewolf", level: 5, hp: 220, damage: 22, repel: { attribute: "FAITH", newIdeas: 2, school: "science", label: "Faith emblem + 2 new science ideas" } },
  { kind: "wraith", name: "Barrow Wraith", level: 6, hp: 280, damage: 26, repel: { attribute: "SELF_RESPECT", newIdeas: 2, school: "mind", label: "Self Respect emblem + 2 new mind ideas" } },
  { kind: "minotaur", name: "Minotaur", level: 7, hp: 380, damage: 34, repel: { attribute: "STUBBORNNESS", newIdeas: 3, school: "commerce", label: "Stubbornness emblem + 3 new trade ideas" } },
  { kind: "troll", name: "Bridge Troll", level: 8, hp: 480, damage: 40, repel: { attribute: "STUBBORNNESS", newIdeas: 3, school: "commerce", label: "Stubbornness emblem + 3 new trade ideas" } },
  { kind: "lich", name: "Lich", level: 9, hp: 620, damage: 52, repel: { attribute: "REBUTTAL", newIdeas: 3, school: "science", label: "Rebuttal emblem + 3 new science ideas" } },
  { kind: "golem", name: "Rune Golem", level: 10, hp: 780, damage: 60, repel: { attribute: "ABSTRACT", newIdeas: 4, school: "science", label: "Abstract emblem + 4 new science ideas" } },
  { kind: "wyvern", name: "Wyvern", level: 11, hp: 900, damage: 70, repel: { attribute: "ABSTRACT", newIdeas: 4, school: "science", label: "Abstract emblem + 4 new science ideas" } },
  { kind: "serpent", name: "Deep Serpent", level: 12, hp: 1100, damage: 84, repel: { attribute: "COMPASSION", newIdeas: 5, school: "mind", label: "Compassion emblem + 5 new mind ideas" } },
  { kind: "demon", name: "Pit Demon", level: 13, hp: 1450, damage: 104, repel: { attribute: "MIND", newIdeas: 5, school: "mind", label: "Mind emblem + 5 new mind ideas" } },
  { kind: "dragon", name: "Elder Dragon", level: 15, hp: 2200, damage: 140, repel: { attribute: "CREATIVITY", newIdeas: 6, school: "mind", label: "Creativity emblem + 6 new mind ideas" } },
];

/**
 * Rolls the next raid. Weight falls with the square of level, so a dragon is
 * roughly 1-in-225 against a slime — rare enough to be an event, never so
 * rare that a decade-long town does not meet one.
 */
export function rollMonster(rand: number): MonsterSpec {
  const weights = BESTIARY.map((m) => 1 / (m.level * m.level));
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = rand * sum;
  for (let i = 0; i < BESTIARY.length; i++) {
    t -= weights[i];
    if (t <= 0) return { ...BESTIARY[i], arrivesIn: 20 + BESTIARY[i].level * 8 };
  }
  const last = BESTIARY[BESTIARY.length - 1];
  return { ...last, arrivesIn: 20 + last.level * 8 };
}

export const MONSTER_KINDS = BESTIARY.map((m) => ({ kind: m.kind, name: m.name, level: m.level }));

export const monsterByKind = (kind: MonsterSpec["kind"]): MonsterSpec => {
  const m = BESTIARY.find((b) => b.kind === kind)!;
  return { ...m, arrivesIn: 20 + m.level * 8 };
};

export function canRepel(m: MonsterSpec, input: TownInput): { emblem: boolean; ideas: boolean } {
  return {
    emblem: input.equippedAttributes.includes(m.repel.attribute),
    ideas: input.newIdeasThisWeek[m.repel.school] >= m.repel.newIdeas,
  };
}

export interface RaidEvent {
  text: string;
  buildingId?: string;
  outcome: "repelled" | "defeated" | "damaged" | "destroyed" | "reset";
}

/**
 * Resolves a raid that was not repelled in time.
 *
 * The garrison strikes first: troop count × power comes off the monster's
 * HP. If it survives, it hits a random building:
 *   - building level above the monster's: the building holds but is knocked
 *     back to level 1, and the monster is spent;
 *   - otherwise the building is destroyed, the monster loses that many
 *     levels, and — if any remain — attacks again.
 * Losing the town hall resets the town.
 */
export function resolveRaid(
  monster: MonsterSpec,
  buildings: Building[],
  troops: Partial<Record<TroopKind, number>>,
  rand: () => number
): { buildings: Building[]; events: RaidEvent[]; reset: boolean } {
  const events: RaidEvent[] = [];
  const garrison = attackPower(troops);
  const hp = monster.hp - garrison;
  if (hp <= 0) {
    events.push({ text: `The garrison (${garrison} power) cut down the ${monster.name}.`, outcome: "defeated" });
    return { buildings, events, reset: false };
  }
  events.push({ text: `The garrison dealt ${garrison} — the ${monster.name} breaks through with ${hp} HP.`, outcome: "damaged" });

  let level = monster.level;
  let standing = buildings.map((b) => ({ ...b }));
  while (level > 0 && standing.length > 0) {
    const target = standing[Math.floor(rand() * standing.length)];
    if (target.level > level) {
      events.push({ text: `It strikes the ${labelOf(target.kind)} (lv ${target.level}); it holds but falls to lv 1.`, buildingId: target.id, outcome: "damaged" });
      target.level = 1;
      target.upgradingUntil = undefined;
      break;
    }
    events.push({ text: `It razes the ${labelOf(target.kind)} (lv ${target.level}) and weakens to lv ${level - target.level}.`, buildingId: target.id, outcome: "destroyed" });
    if (target.kind === "hall") {
      events.push({ text: "The town hall has fallen. The town must be rebuilt from its foundations.", outcome: "reset" });
      return { buildings: standing, events, reset: true };
    }
    level -= target.level;
    standing = standing.filter((b) => b.id !== target.id);
  }
  return { buildings: standing, events, reset: false };
}

export function labelOf(kind: BuildingKind): string {
  return { hall: "Town Hall", farm: "Farm", mine: "Mine", forge: "Forge", market: "Market", barracks: "Barracks", tower: "Watchtower", wall: "Wall" }[kind];
}

// ── Emblem crafting ───────────────────────────────────────

export interface WeaponRecipe {
  id: string;
  name: string;
  /** Every attribute must be carried by an equipped emblem for the whole timer. */
  needs: Attribute[];
  forgeTier: number;
  hours: number;
  power: number;
  metal: Partial<Record<Ore, number>>;
}

export const WEAPON_RECIPES: WeaponRecipe[] = [
  { id: "oathblade", name: "Oathblade", needs: ["FAITH", "STUBBORNNESS"], forgeTier: 2, hours: 6, power: 60, metal: { iron: 20, silver: 6 } },
  { id: "hexstaff", name: "Hexstaff", needs: ["CREATIVITY", "ABSTRACT"], forgeTier: 3, hours: 10, power: 90, metal: { silver: 14, gold: 4 } },
  { id: "logic-crossbow", name: "Logician's Crossbow", needs: ["LOGIC", "STATISTIC"], forgeTier: 3, hours: 9, power: 80, metal: { iron: 30, silver: 8 } },
  { id: "dragonbane", name: "Dragonbane", needs: ["PHYSICAL", "FAITH", "CRITICAL_THINKING"], forgeTier: 5, hours: 24, power: 260, metal: { gold: 20, mithril: 8 } },
];

/**
 * A craft only survives if its emblems stay equipped. Detaching any one of
 * them resets the timer, and the metal already in the crucible is lost —
 * which is what makes holding a loadout for a day a real decision.
 */
export function craftIntact(recipe: WeaponRecipe, equipped: Attribute[]): boolean {
  return recipe.needs.every((a) => equipped.includes(a));
}
