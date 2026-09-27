import type { IncomingMonster, MonsterKind, Season } from "./types";

/**
 * Every monster class: its level range, stats at level 1, and the conditions
 * under which it comes at all.
 *
 * Level ranges and triggers follow the brief line by line. The ones worth
 * calling out, because they are not simple spawn weights:
 *
 *   - Pit demons come only to towns of more than 120 villagers, and their
 *     level climbs with the population — a bigger town draws a worse demon.
 *   - Dragons come only after too many wyverns fall in a short span, and
 *     elder dragons only after several dragons do. Killing is what summons
 *     the next thing up.
 *   - Liches never come alone: they raise skeletons and golems as escort.
 *   - Goblins come in packs, led by a king at level 7.
 *   - Werewolves, wraiths, minotaurs and demons come only at night.
 */

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  min: number;
  max: number;
  hp: number;
  dmg: number;
  /** Seconds between attacks. */
  interval: number;
  /** Tiles. */
  range: number;
  /** Tiles per second. */
  speed: number;
  flying?: boolean;
  legendary?: boolean;
  night?: boolean;
  seasons?: Season[];
  /** How many come together. */
  pack?: [number, number];
  /** Relative frequency among the eligible. */
  weight: number;
  blurb: string;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  slime: { kind: "slime", name: "Cave Slime", min: 1, max: 3, hp: 30, dmg: 4, interval: 1.4, range: 0.9, speed: 0.8, weight: 10, pack: [1, 3], blurb: "Slow, soft, and never alone for long." },
  bat: { kind: "bat", name: "Blood Bat Swarm", min: 1, max: 3, hp: 18, dmg: 3, interval: 0.7, range: 0.9, speed: 2.2, flying: true, weight: 9, pack: [3, 6], blurb: "Fast and flying — archers make short work of them." },
  spider: { kind: "spider", name: "Blood Spider", min: 1, max: 3, hp: 26, dmg: 5, interval: 1, range: 1, speed: 1.6, weight: 8, pack: [2, 4], blurb: "Skitters in through gaps in the wall." },
  goblin: { kind: "goblin", name: "Goblin", min: 1, max: 7, hp: 40, dmg: 6, interval: 1, range: 1, speed: 1.3, weight: 9, pack: [3, 6], blurb: "Always a pack. At level 7, a king leads it." },
  skeleton: { kind: "skeleton", name: "Risen Skeleton", min: 1, max: 10, hp: 50, dmg: 7, interval: 1.1, range: 1, speed: 1, weight: 7, pack: [2, 5], seasons: ["autumn", "spring", "summer", "winter"], blurb: "Matches your troops' tier. In autumn, they march as an army." },
  wolf: { kind: "wolf", name: "Dire Wolf", min: 3, max: 6, hp: 70, dmg: 10, interval: 0.8, range: 1, speed: 2, weight: 6, pack: [2, 4], blurb: "Hunts in packs and runs down stragglers." },
  werewolf: { kind: "werewolf", name: "Werewolf", min: 5, max: 10, hp: 160, dmg: 18, interval: 0.9, range: 1, speed: 1.8, night: true, weight: 5, blurb: "Only by night." },
  wraith: { kind: "wraith", name: "Barrow Wraith", min: 4, max: 12, hp: 120, dmg: 16, interval: 1.2, range: 1.2, speed: 1.2, flying: true, night: true, weight: 5, blurb: "Drifts over walls by night." },
  minotaur: { kind: "minotaur", name: "Minotaur", min: 7, max: 20, hp: 320, dmg: 30, interval: 1.4, range: 1.2, speed: 1.2, night: true, weight: 4, blurb: "A night charger that tramples walls." },
  troll: { kind: "troll", name: "Bridge Troll", min: 7, max: 16, hp: 420, dmg: 28, interval: 1.6, range: 1.2, speed: 0.9, weight: 4, blurb: "Heals nothing, fears nothing, hits very hard." },
  lich: { kind: "lich", name: "Lich", min: 11, max: 16, hp: 380, dmg: 34, interval: 1.8, range: 4, speed: 0.9, legendary: true, weight: 2, blurb: "Comes with an escort of the dead and of stone." },
  golem: { kind: "golem", name: "Golem", min: 8, max: 22, hp: 600, dmg: 26, interval: 2, range: 1.2, speed: 0.6, weight: 3, blurb: "Past level 15 its runes wake: a rune golem." },
  wyvern: { kind: "wyvern", name: "Wyvern", min: 22, max: 30, hp: 900, dmg: 60, interval: 1.4, range: 2, speed: 1.8, flying: true, legendary: true, weight: 2, blurb: "Kill too many, and something larger notices." },
  serpent: { kind: "serpent", name: "Deep Serpent", min: 30, max: 38, hp: 1500, dmg: 80, interval: 1.6, range: 2, speed: 1, legendary: true, weight: 1.5, blurb: "Rises from the river." },
  demon: { kind: "demon", name: "Pit Demon", min: 35, max: 120, hp: 2000, dmg: 110, interval: 1.3, range: 1.5, speed: 1.4, flying: true, legendary: true, night: true, weight: 1, blurb: "Drawn only to towns of more than 120 souls." },
  dragon: { kind: "dragon", name: "Dragon", min: 40, max: 80, hp: 3500, dmg: 160, interval: 1.6, range: 3, speed: 1.6, flying: true, legendary: true, weight: 0, blurb: "Comes when too many wyverns have died too quickly." },
  elderdragon: { kind: "elderdragon", name: "Elder Dragon", min: 100, max: 1000, hp: 12000, dmg: 420, interval: 1.8, range: 4, speed: 1.5, flying: true, legendary: true, weight: 0, blurb: "Comes only after dragons have fallen." },
  // ── Additional classes ──
  harpy: { kind: "harpy", name: "Harpy", min: 6, max: 14, hp: 110, dmg: 14, interval: 0.9, range: 1, speed: 2.4, flying: true, weight: 4, pack: [2, 4], blurb: "Screaming raiders from the cliffs." },
  ogre: { kind: "ogre", name: "Ogre", min: 10, max: 24, hp: 520, dmg: 36, interval: 1.7, range: 1.3, speed: 0.9, weight: 3, blurb: "Big, slow, and entirely interested in your granary." },
  mimic: { kind: "mimic", name: "Mimic", min: 5, max: 15, hp: 180, dmg: 24, interval: 1.2, range: 1, speed: 0.7, weight: 3, blurb: "Looks like a chest of plunder until it opens." },
  treant: { kind: "treant", name: "Treant", min: 9, max: 20, hp: 480, dmg: 22, interval: 1.8, range: 1.4, speed: 0.6, seasons: ["spring"], weight: 4, blurb: "Spring's growth, walking. Angrier the more trees you felled." },
  salamander: { kind: "salamander", name: "Fire Salamander", min: 12, max: 28, hp: 360, dmg: 30, interval: 1.1, range: 2.5, speed: 1.3, seasons: ["summer"], weight: 4, blurb: "Summer's heat, spitting fire. Sets buildings burning." },
  frostgiant: { kind: "frostgiant", name: "Frost Giant", min: 18, max: 35, hp: 1100, dmg: 70, interval: 2, range: 1.6, speed: 0.8, seasons: ["winter"], weight: 3, blurb: "Walks out of the snow in the dead of winter." },
  banshee: { kind: "banshee", name: "Banshee", min: 8, max: 18, hp: 150, dmg: 20, interval: 1.3, range: 3, speed: 1.6, flying: true, night: true, seasons: ["autumn", "winter"], weight: 3, blurb: "Her wail lowers the whole town's mood." },
  // ── From the west ──
  ghoul: { kind: "ghoul", name: "Ghoul", min: 3, max: 12, hp: 90, dmg: 12, interval: 1, range: 1, speed: 1.5, night: true, pack: [2, 4], weight: 5, blurb: "Graveyard scavengers that come in hungry packs after dark." },
  gargoyle: { kind: "gargoyle", name: "Gargoyle", min: 8, max: 20, hp: 300, dmg: 22, interval: 1.3, range: 1, speed: 1.6, flying: true, weight: 3, blurb: "A roof-spout come alive: stone wings, stone claws." },
  cyclops: { kind: "cyclops", name: "Cyclops", min: 15, max: 32, hp: 1000, dmg: 60, interval: 2, range: 1.4, speed: 0.8, weight: 2, blurb: "One eye, one club, no mercy. Walls fold under it." },
  vampire: { kind: "vampire", name: "Vampire", min: 12, max: 30, hp: 420, dmg: 34, interval: 1, range: 1.2, speed: 2, night: true, weight: 2, blurb: "Old blood in an old cloak. Firelight galls it." },
  hydra: { kind: "hydra", name: "Hydra", min: 25, max: 50, hp: 2200, dmg: 70, interval: 1.2, range: 2, speed: 0.8, legendary: true, seasons: ["summer", "autumn"], weight: 1, blurb: "Five heads from the marsh; strikes with all of them." },
  griffin: { kind: "griffin", name: "Griffin", min: 16, max: 30, hp: 600, dmg: 40, interval: 1.1, range: 1.2, speed: 2.4, flying: true, weight: 2, blurb: "Eagle before, lion behind, and it takes livestock." },
  wisp: { kind: "wisp", name: "Will-o'-the-wisp", min: 2, max: 10, hp: 40, dmg: 8, interval: 1, range: 3, speed: 1.8, flying: true, night: true, pack: [3, 6], weight: 5, blurb: "A marsh-light spirit that leads the lost astray, and burns." },
  wendigo: { kind: "wendigo", name: "Wendigo", min: 14, max: 30, hp: 700, dmg: 45, interval: 1.1, range: 1.2, speed: 2, night: true, seasons: ["winter"], weight: 3, blurb: "The hunger spirit of the frozen woods: antlers and bone." },
  // ── From the east ──
  oni: { kind: "oni", name: "Oni", min: 10, max: 28, hp: 650, dmg: 44, interval: 1.5, range: 1.4, speed: 1, weight: 3, blurb: "A horned ogre-demon with an iron club." },
  kappa: { kind: "kappa", name: "Kappa", min: 4, max: 14, hp: 140, dmg: 14, interval: 1, range: 1, speed: 1.3, seasons: ["spring", "summer"], pack: [2, 3], weight: 4, blurb: "A river imp with a shell and a water-dish crown. Keep off the banks." },
  tengu: { kind: "tengu", name: "Tengu", min: 9, max: 22, hp: 240, dmg: 24, interval: 0.9, range: 1.2, speed: 2.4, flying: true, weight: 3, blurb: "A long-nosed mountain spirit, a swordsman on wings." },
  jiangshi: { kind: "jiangshi", name: "Jiangshi", min: 5, max: 16, hp: 200, dmg: 18, interval: 1.2, range: 1, speed: 1.1, night: true, pack: [2, 4], weight: 4, blurb: "A stiff, hopping corpse in court robes, a talisman on its brow." },
  kitsune: { kind: "kitsune", name: "Nine-tailed Fox", min: 18, max: 40, hp: 800, dmg: 50, interval: 1, range: 3, speed: 2.2, night: true, legendary: true, weight: 2, blurb: "A fox spirit of nine tails, trailing foxfire." },
  yurei: { kind: "yurei", name: "Yūrei", min: 6, max: 18, hp: 130, dmg: 20, interval: 1.3, range: 2.5, speed: 1.3, flying: true, night: true, weight: 4, blurb: "A grieving ghost in white burial robes. It has no feet." },
  gashadokuro: { kind: "gashadokuro", name: "Gashadokuro", min: 30, max: 60, hp: 3000, dmg: 120, interval: 2.2, range: 2, speed: 0.7, night: true, legendary: true, weight: 1, blurb: "A giant skeleton made of the bones of the starved." },
  jorogumo: { kind: "jorogumo", name: "Jorōgumo", min: 10, max: 24, hp: 380, dmg: 30, interval: 1.1, range: 1.2, speed: 1.6, night: true, weight: 3, blurb: "A spider that wears a woman's face." },
  nian: { kind: "nian", name: "Nian", min: 20, max: 40, hp: 1400, dmg: 65, interval: 1.6, range: 1.4, speed: 1.4, legendary: true, seasons: ["winter", "spring"], weight: 2, blurb: "The year-beast of the new year. It fears red and fire." },
  basilisk: { kind: "basilisk", name: "Basilisk", min: 14, max: 26, hp: 700, dmg: 40, interval: 1.5, range: 1.5, speed: 1, weight: 2, blurb: "Its gaze turns troops to stone for a moment." },
};

export interface SpawnContext {
  season: Season;
  night: boolean;
  villagers: number;
  /** Rough strength of the town: hall level plus average troop level. */
  power: number;
  avgTroopLevel: number;
  /** Kills in the recent past, by kind. */
  recentKills: (kind: MonsterKind, withinDays: number) => number;
}

/** Stats at a level. Everything grows from its level-1 base. */
export function statsAt(def: MonsterDef, level: number) {
  return {
    // Hard: everything out there is a fifth tougher than it used to be.
    hp: Math.round(def.hp * 1.2 * (1 + 0.35 * (level - 1))),
    // Damage grows more gently than hit points: a strong monster should take
    // a long time to kill, not one-shot a garrison. Calibrated against the
    // headless run, where the steeper curve let one level-7 mimic sack a
    // town defended by four trained soldiers.
    dmg: Math.round(def.dmg * 0.8 * (1 + 0.2 * (level - 1))),
  };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function levelFor(def: MonsterDef, ctx: SpawnContext, r: () => number): number {
  if (def.kind === "skeleton") return clamp(Math.round(ctx.avgTroopLevel + (r() - 0.5) * 2), def.min, def.max);
  if (def.kind === "demon") return clamp(Math.round(35 + (ctx.villagers - 120) * 0.6 + r() * 6), def.min, def.max);
  if (def.kind === "dragon") return clamp(Math.round(40 + ctx.recentKills("wyvern", 4) * 6 + r() * 8), def.min, def.max);
  if (def.kind === "elderdragon") return clamp(Math.round(100 + ctx.recentKills("dragon", 12) * 120 + r() * 60), def.min, def.max);
  // Raids track the town: about three-quarters of its power, give or take.
  return clamp(Math.round(ctx.power * 0.75 + (r() - 0.5) * 3), def.min, def.max);
}

/**
 * Picks the next raid. Special summons take precedence — they are the
 * consequences the player caused — then the ordinary roll, weighted by
 * rarity, season and time of day, and restricted to what the town is strong
 * enough to have attracted.
 */
export function rollRaid(ctx: SpawnContext, r: () => number): IncomingMonster[] {
  if (ctx.recentKills("dragon", 12) >= 3) {
    return [{ kind: "elderdragon", level: levelFor(MONSTERS.elderdragon, ctx, r), count: 1 }];
  }
  if (ctx.recentKills("wyvern", 4) >= 4) {
    return [{ kind: "dragon", level: levelFor(MONSTERS.dragon, ctx, r), count: 1 }];
  }

  const table = raidTable(ctx);
  if (!table.length) return [{ kind: "slime", level: 1, count: 2 }];
  const total = table.reduce((a, t) => a + t.weight, 0);
  let pick = r() * total;
  let def = table[0].def;
  for (const t of table) {
    pick -= t.weight;
    if (pick <= 0) {
      def = t.def;
      break;
    }
  }

  const level = levelFor(def, ctx, r);
  let count = def.pack ? def.pack[0] + Math.floor(r() * (def.pack[1] - def.pack[0] + 1)) : 1;
  if (def.kind === "skeleton" && ctx.season === "autumn") count = 6 + Math.floor(r() * 7);
  // More people, more of them: a town of thirty draws twice the pack.
  count = Math.min(40, Math.round(count * (1 + ctx.villagers / 30)));
  const party: IncomingMonster[] = [{ kind: def.kind, level, count }];

  if (def.kind === "lich") {
    // Escort: risen skeletons, and golems once the lich is strong enough.
    party.push({ kind: "skeleton", level: clamp(level - 3, 1, 10), count: 3 + Math.floor(r() * 4) });
    if (level >= 13) party.push({ kind: "golem", level: clamp(level - 2, 8, 22), count: 1 + Math.floor(r() * 2) });
  }
  return party;
}

/**
 * Everything the town could draw on the next ordinary raid, with its weight:
 * restricted to what the town is strong enough to attract, weighted by
 * rarity, season and time of day.
 */
export function raidTable(ctx: SpawnContext): { def: MonsterDef; weight: number }[] {
  return Object.values(MONSTERS)
    .filter((d) => {
      if (d.weight <= 0) return false;
      if (d.night && !ctx.night) return false;
      if (d.seasons && !d.seasons.includes(ctx.season)) return false;
      if (d.kind === "demon" && ctx.villagers <= 120) return false;
      // The town has to be strong enough to be worth this monster's attention.
      return d.min <= ctx.power * 0.75 + 2;
    })
    .map((def) => {
      let w = def.weight / Math.sqrt(def.min);
      if (def.kind === "skeleton" && ctx.season === "autumn") w *= 5; // the skeleton army
      return { def, weight: w };
    });
}

/** The level an ordinary raid of this kind would come at, before a far target adds to it. */
export function expectedLevel(def: MonsterDef, ctx: SpawnContext): number {
  return levelFor(def, ctx, () => 0.5);
}

export function partyName(party: IncomingMonster[]): string {
  const lead = party[0];
  const def = MONSTERS[lead.kind];
  let name = def.name;
  if (lead.kind === "goblin" && lead.level >= 7) name = "Goblin King's warband";
  else if (lead.kind === "golem" && lead.level >= 15) name = "Rune Golem";
  else if (lead.kind === "skeleton" && lead.count >= 6) name = "Skeleton Army";
  const plural = lead.count > 1 && !name.endsWith("band") && !name.endsWith("Army") ? ` ×${lead.count}` : "";
  const escort = party.length > 1 ? ` with ${party.slice(1).map((p) => `${p.count} ${MONSTERS[p.kind].name.toLowerCase()}`).join(", ")}` : "";
  return `${name}${plural} (L${lead.level})${escort}`;
}
