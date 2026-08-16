import { prisma } from "./prisma";
import { cached } from "./cache";
import { loadMaintenanceIds } from "./field-focus";
import { depthOf } from "./skill-form";
import type { Skill } from "./skill-pool";

/**
 * The daily focus Field: one subject a day pays more for new Ideas.
 *
 * The weekly quota says *how much* to write; this says *where today*, and
 * the two pull in the same direction — a focus day is the cheapest time to
 * clear a Field's quota. It also gives the "add an idea" action a reason to
 * happen today rather than eventually, which nothing else in the app did.
 *
 * **Stored nowhere.** The pick is a pure function of the UTC date and the
 * candidate Fields, so every read agrees without a row, a cron, or any
 * chance of the UI and the reward disagreeing about which Field it is. It
 * also cannot be re-rolled by reloading, which a stored-and-regenerated
 * version would be vulnerable to.
 *
 * **Skew, not control.** Rare emblems bias the draw toward the Fields they
 * train and raise the payout, but nothing pins it: the weight of a deep
 * loadout is capped so a Field can never be guaranteed. A daily bonus you
 * can force is just a permanent bonus with extra steps.
 */

/** Base bonus on points earned for an Idea added to today's focus Field. */
export const FOCUS_BONUS = 0.32;
/** Each qualifying rare emblem adds this to the bonus, capped. */
const RARE_BONUS_STEP = 0.06;
const MAX_BONUS = 0.6;
/** Ceiling on how far a loadout can bias the draw, as a multiple of a plain Field's weight. */
const MAX_SKEW = 3;

/** Deep emblems only — the skew is meant to be a property of rare things. */
const SKEW_MIN_DEPTH = 11;

function isRare(skill: Skill): boolean {
  return depthOf(skill) >= SKEW_MIN_DEPTH;
}

/**
 * A stable 32-bit hash. Used to turn "this date plus this candidate" into a
 * score, so the winner is reproducible on any machine and in any process
 * without seeding a global RNG.
 */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface DailyFocus {
  fieldId: string;
  fieldName: string;
  /** Multiplier applied to points for Ideas added here today. 1.32 at base. */
  multiplier: number;
  /** Emblems that raised the bonus, for the UI to name. */
  boostedBy: string[];
  dayKey: string;
}

interface Candidate {
  id: string;
  name: string;
  weight: number;
}

/**
 * Picks the day's Field by weighted draw.
 *
 * Pure and exported so the choice can be tested directly rather than only
 * observed through the database.
 */
export function drawFocus(candidates: Candidate[], dayKey: string): Candidate | null {
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return candidates[0];

  // One roll for the day, then walk the weighted line.
  let roll = hash(`${dayKey}:focus`) * total;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

export async function loadDailyFocus(
  userId: string,
  activeSkills: Skill[],
  now: Date = new Date()
): Promise<DailyFocus | null> {
  const dayKey = utcDayKey(now);

  const [fields, maintained] = await Promise.all([
    cached("focusCandidates", ["fields"], () =>
      prisma.field.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, attributes: { select: { attribute: true, weight: true } } },
      })
    ),
    loadMaintenanceIds(userId),
  ]);

  // A Field in maintenance is excused new Ideas entirely, so making it
  // today's focus would be pointing at the one place nothing is owed.
  const eligible = fields.filter((f) => !maintained.has(f.id));
  if (eligible.length === 0) return null;

  // Rare emblems bias the draw toward what they train.
  const rare = activeSkills.filter(isRare);
  const skewByAttribute = new Map<string, number>();
  for (const s of rare) {
    for (const a of s.attributes) skewByAttribute.set(a, (skewByAttribute.get(a) ?? 0) + 1);
  }

  const candidates: Candidate[] = eligible.map((f) => {
    // A Field's affinity for the loadout: its own attribute split, weighted
    // by how many rare emblems train each attribute.
    const affinity = f.attributes.reduce(
      (sum, a) => sum + (skewByAttribute.get(a.attribute) ?? 0) * (a.weight / 100),
      0
    );
    return { id: f.id, name: f.name, weight: Math.min(MAX_SKEW, 1 + affinity) };
  });

  const won = drawFocus(candidates, dayKey);
  if (!won) return null;

  // Rare emblems that actually train the winning Field raise the payout.
  const winner = eligible.find((f) => f.id === won.id)!;
  const winnerAttributes = new Set(winner.attributes.filter((a) => a.weight > 0).map((a) => a.attribute));
  const boosters = rare.filter((s) => s.attributes.some((a) => winnerAttributes.has(a)));

  return {
    fieldId: won.id,
    fieldName: won.name,
    multiplier: 1 + Math.min(MAX_BONUS, FOCUS_BONUS + boosters.length * RARE_BONUS_STEP),
    boostedBy: boosters.map((s) => s.name),
    dayKey,
  };
}
