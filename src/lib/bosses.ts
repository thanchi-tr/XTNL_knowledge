import { cache } from "react";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { applyDebuff } from "./debuffs";
import { drawBoon, grantBoon, type BoonKind } from "./boons";
import { loadMaintenanceIds } from "./field-focus";

/**
 * Bosses — the chance-and-stakes layer, and the app's one real set-piece.
 *
 * **What a Boss actually is.** Not a separate minigame: a Boss is the
 * accumulated review debt of a single Field, personified. It only becomes
 * challengeable once that Field has enough *genuinely due* Ideas to fill an
 * encounter, and fighting it runs those real Ideas through the ordinary
 * `submitReview` path — real grading, real SRS consequences, real XP. Beat
 * the Boss and you have, unavoidably, actually cleared your backlog. The
 * fiction and the work are the same act.
 *
 * **Where the chance lives, and where it deliberately does not.** The draw
 * is random: which of the due Ideas you face, weighted toward the
 * highest-level (hardest-won) ones, is decided per encounter. The *payout*
 * is not random — a victory at a given tier is always worth exactly the
 * same, stated up front before you commit. This is the roguelike split
 * (uncertain challenge, deterministic reward), not the slot-machine one
 * (certain challenge, uncertain reward); the second is the pattern this
 * project has refused elsewhere, and refuses here.
 *
 * **Why it escalates.** Every victory raises the Field's Boss tier: the
 * next encounter draws more cards, demands higher accuracy, pays more, and
 * is a different creature from the bestiary. A Boss is never "done."
 */

/** A Field must reach this level before its Boss is challengeable at all. */
export const BOSS_UNLOCK_LEVEL = 5;

export const BOSS_COOLDOWN_HOURS_AFTER_WIN = 72;
export const BOSS_COOLDOWN_HOURS_AFTER_LOSS = 12;

/** Cards drawn at a given tier — grows, capped so an encounter stays one sitting. */
export function bossBatchSize(tier: number): number {
  return Math.min(12, 4 + tier);
}

/** Accuracy needed to win. Starts demanding and gets harsher, capped short of perfection. */
export function bossRequiredAccuracy(tier: number): number {
  return Math.min(0.9, 0.7 + 0.025 * (tier - 1));
}

/** Mastery points a victory pays. Deterministic and shown before you commit. */
export function bossMasteryReward(tier: number): number {
  return Math.round((2 + 1.5 * tier) * 10) / 10;
}

// ============================================================================
// Bestiary
// ============================================================================
//
// Every entry is a real failure mode of spaced repetition, named. The point
// of the fiction is that the thing you are fighting is the thing that
// actually erodes knowledge — not an invented monster with a health bar
// bolted onto a study app.

export interface BossArchetype {
  name: string;
  /** Second line under the name — what this creature *is*, in-world. */
  story: string;
  /** Said on defeat, in the boss's voice. */
  taunt: string;
}

const BESTIARY: readonly BossArchetype[] = [
  {
    name: "The Forgetting",
    story: "Older than the archive itself. It does not attack — it simply waits for the interval to lapse.",
    taunt: "You will read it again, and again, and still I will take it.",
  },
  {
    name: "The Plateau",
    story: "It does not push back. It removes the sensation of progress and lets you stop on your own.",
    taunt: "Nothing you did today was different from yesterday.",
  },
  {
    name: "The Backlog",
    story: "Every card you deferred, standing together. It grows on the days you look away.",
    taunt: "I am only what you postponed.",
  },
  {
    name: "The Illusion of Fluency",
    story: "It shows you the answer a half-second before you retrieve it, so you believe you knew.",
    taunt: "You recognised it. That was never the same as knowing it.",
  },
  {
    name: "The Comfortable Answer",
    story: "It rewards the shape you already hold and punishes the question that would change it.",
    taunt: "Why reach further? This one has always worked.",
  },
  {
    name: "The Half-Learned",
    story: "Fragments retained without their structure. Confident, load-bearing, and wrong.",
    taunt: "You have most of it. Most has always been enough for you.",
  },
  {
    name: "Entropy",
    story: "Not malice. Just the direction everything unmaintained already travels.",
    taunt: "I require no effort. That is the entire asymmetry.",
  },
  {
    name: "The Unread Margin",
    story: "Everything you marked as important and never returned to.",
    taunt: "You meant to. You still mean to.",
  },
];

/** Deterministic 32-bit string hash — same Field always yields the same bestiary sequence. */
function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Which creature a Field faces at a given tier. Derived, not stored: the
 * same Field at the same tier is always the same Boss on every machine, and
 * each victory advances it to a genuinely different one.
 */
export function bossFor(fieldId: string, tier: number): BossArchetype {
  const index = (hashString(fieldId) + tier - 1) % BESTIARY.length;
  return BESTIARY[index];
}

// ============================================================================
// State
// ============================================================================

export type BossAvailability =
  | { status: "locked"; levelsNeeded: number }
  | { status: "insufficient_material"; have: number; need: number }
  | { status: "cooldown"; until: Date }
  | { status: "ready" };

export interface BossState {
  fieldId: string;
  fieldName: string;
  fieldLevel: number;
  tier: number;
  victories: number;
  archetype: BossArchetype;
  batchSize: number;
  requiredAccuracy: number;
  masteryReward: number;
  /** Due, non-archived Ideas in this Field right now — the Boss's actual body. */
  dueCount: number;
  availability: BossAvailability;
}

export const loadBossStates = cache(async (userId: string): Promise<BossState[]> => {
  return cached(`bossStates:${userId}`, ["fields", "ideas", "progress"], () => loadBossStatesUncached(userId, new Date()));
});

async function loadBossStatesUncached(userId: string, now: Date): Promise<BossState[]> {
  const [allFields, encounters, maintained] = await Promise.all([
    prisma.field.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        level: true,
        domains: { select: { _count: { select: { ideas: true } } } },
      },
    }),
    prisma.bossEncounter.findMany({ where: { userId } }),
    loadMaintenanceIds(userId),
  ]);

  // A Field in maintenance fields no Boss at all — not a locked or cooling
  // one. Challenges are the part of this system that asks for active
  // attention, and maintenance is the statement that this subject is not
  // getting any right now. Any encounter row it already had is left intact,
  // so bringing the Field back restores its tier and victory count rather
  // than resetting the fight.
  const fields = allFields.filter((f) => !maintained.has(f.id));

  const dueByField = await dueCountsByField(now);
  const encounterByField = new Map(encounters.map((e) => [e.fieldId, e]));

  return fields.map((field) => {
    const encounter = encounterByField.get(field.id);
    const tier = encounter?.tier ?? 1;
    const batchSize = bossBatchSize(tier);
    const dueCount = dueByField.get(field.id) ?? 0;

    let availability: BossAvailability;
    if (field.level < BOSS_UNLOCK_LEVEL) {
      availability = { status: "locked", levelsNeeded: Math.ceil(BOSS_UNLOCK_LEVEL - field.level) };
    } else if (encounter?.cooldownUntil && encounter.cooldownUntil > now) {
      availability = { status: "cooldown", until: encounter.cooldownUntil };
    } else if (dueCount < batchSize) {
      availability = { status: "insufficient_material", have: dueCount, need: batchSize };
    } else {
      availability = { status: "ready" };
    }

    return {
      fieldId: field.id,
      fieldName: field.name,
      fieldLevel: field.level,
      tier,
      victories: encounter?.victories ?? 0,
      archetype: bossFor(field.id, tier),
      batchSize,
      requiredAccuracy: bossRequiredAccuracy(tier),
      masteryReward: bossMasteryReward(tier),
      dueCount,
      availability,
    };
  });
}

async function dueCountsByField(now: Date): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ fieldId: string; n: bigint }[]>`
    SELECT d."fieldId" AS "fieldId", COUNT(*) AS n
    FROM "Idea" i
    JOIN "Domain" d ON d.id = i."domainId"
    WHERE i."isArchived" = false AND i."dueDate" <= ${now}
    GROUP BY d."fieldId"
  `;
  return new Map(rows.map((r) => [r.fieldId, Number(r.n)]));
}

// ============================================================================
// Drawing an encounter
// ============================================================================

export interface DrawnCard {
  id: string;
  level: number;
}

/**
 * The random half. Draws `size` of the Field's due Ideas, weighted toward
 * higher level — a Boss should be made of the material you have invested
 * most in and would lose most by forgetting, but not *only* that, or every
 * encounter at a given tier would be identical.
 *
 * Weighted sampling without replacement (`weight = level^1.5`), so a
 * level-10 card is ~5.6x likelier to appear than a level-3 one while a
 * level-1 straggler is never impossible.
 */
export async function drawBossBatch(fieldId: string, size: number, now: Date = new Date()): Promise<DrawnCard[]> {
  const candidates = await prisma.idea.findMany({
    where: { isArchived: false, dueDate: { lte: now }, domain: { fieldId } },
    select: { id: true, level: true },
  });

  const pool = [...candidates];
  const drawn: DrawnCard[] = [];

  while (drawn.length < size && pool.length > 0) {
    const weights = pool.map((c) => Math.pow(Math.max(1, c.level), 1.5));
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = Math.random() * total;

    let pickedIndex = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        pickedIndex = i;
        break;
      }
    }

    drawn.push(pool[pickedIndex]);
    pool.splice(pickedIndex, 1);
  }

  return drawn;
}

// ============================================================================
// Resolution
// ============================================================================

export type BossResolution =
  | {
      outcome: "victory";
      accuracy: number;
      required: number;
      masteryAwarded: number;
      newTier: number;
      defeated: BossArchetype;
      nextBoss: BossArchetype;
      cooldownUntil: Date;
      /** The Spoils Cache this victory opened — see boons.ts for why its contents vary but its worth does not. */
      spoils: { kind: BoonKind; magnitude: number; expiresAt: Date };
    }
  | {
      outcome: "defeat";
      accuracy: number;
      required: number;
      taunt: string;
      debuff: "SHAKEN";
      cooldownUntil: Date;
    }
  | { outcome: "rejected"; why: string };

/**
 * Judges a finished encounter.
 *
 * The tally is client-reported, which is the same bounded exception to
 * server authority that `SubmitReviewInput.combo` already documents — but
 * unlike combo it is corroborated: the server counts how many Ideas in this
 * Field were actually touched since the encounter began and refuses to
 * resolve if that is fewer than the tally claims. A fabricated victory
 * therefore requires genuinely having done the reviews, which is the only
 * property that matters here. Grading of each individual answer never left
 * the server in the first place.
 */
export async function resolveBossAttempt(
  userId: string,
  fieldId: string,
  correct: number,
  total: number,
  now: Date = new Date()
): Promise<BossResolution> {
  const encounter = await prisma.bossEncounter.findUnique({
    where: { userId_fieldId: { userId, fieldId } },
  });
  if (!encounter?.lastAttemptAt) {
    return { outcome: "rejected", why: "No encounter is in progress for this field." };
  }
  if (encounter.cooldownUntil && encounter.cooldownUntil > now) {
    return { outcome: "rejected", why: "This boss is still on cooldown." };
  }

  const tier = encounter.tier;
  const expected = bossBatchSize(tier);
  if (total < expected) {
    return { outcome: "rejected", why: `Encounter incomplete — ${total}/${expected} cards answered.` };
  }

  const touched = await prisma.idea.count({
    where: { domain: { fieldId }, updatedAt: { gte: encounter.lastAttemptAt } },
  });
  if (touched < total) {
    return { outcome: "rejected", why: "Reported results do not match reviews actually recorded." };
  }

  const accuracy = total > 0 ? correct / total : 0;
  const required = bossRequiredAccuracy(tier);

  if (accuracy < required) {
    const cooldownUntil = new Date(now.getTime() + BOSS_COOLDOWN_HOURS_AFTER_LOSS * 3_600_000);
    await prisma.bossEncounter.update({
      where: { userId_fieldId: { userId, fieldId } },
      data: { cooldownUntil },
    });
    await applyDebuff(userId, "SHAKEN", "BOSS_DEFEAT", now);
    invalidate("progress");

    return {
      outcome: "defeat",
      accuracy,
      required,
      taunt: bossFor(fieldId, tier).taunt,
      debuff: "SHAKEN",
      cooldownUntil,
    };
  }

  const newTier = tier + 1;
  const masteryAwarded = bossMasteryReward(tier);
  const cooldownUntil = new Date(now.getTime() + BOSS_COOLDOWN_HOURS_AFTER_WIN * 3_600_000);

  await prisma.$transaction([
    prisma.bossEncounter.update({
      where: { userId_fieldId: { userId, fieldId } },
      data: { tier: newTier, victories: { increment: 1 }, lastVictoryAt: now, cooldownUntil },
    }),
    prisma.masteryLedgerEntry.create({
      data: {
        userId,
        delta: masteryAwarded,
        reason: "BOSS_VICTORY",
        detail: `${bossFor(fieldId, tier).name} (tier ${tier})`,
      },
    }),
  ]);

  // The Spoils Cache. Minted after the mastery award, never instead of it —
  // the payout you were promised before the fight is unconditional, and
  // this is variety on top.
  const spoils = await grantBoon(userId, drawBoon(), "BOSS_SPOILS", now);
  invalidate("progress");

  return {
    outcome: "victory",
    accuracy,
    required,
    masteryAwarded,
    newTier,
    defeated: bossFor(fieldId, tier),
    nextBoss: bossFor(fieldId, newTier),
    cooldownUntil,
    spoils: { kind: spoils.kind, magnitude: spoils.magnitude, expiresAt: spoils.expiresAt },
  };
}

/** Opens an encounter: stamps the start time the resolver corroborates against, and returns the draw. */
export async function beginBossAttempt(
  userId: string,
  fieldId: string,
  now: Date = new Date()
): Promise<{ ok: true; cards: DrawnCard[]; tier: number } | { ok: false; error: string }> {
  // Fresh, not cached: this opens a real encounter and must not admit one
  // against a cooldown or a due-count that expired seconds ago.
  const states = await loadBossStatesUncached(userId, now);
  const state = states.find((s) => s.fieldId === fieldId);
  if (!state) return { ok: false, error: "No such field." };

  switch (state.availability.status) {
    case "locked":
      return { ok: false, error: `This field must reach level ${BOSS_UNLOCK_LEVEL} first.` };
    case "cooldown":
      return { ok: false, error: `On cooldown until ${state.availability.until.toUTCString()}.` };
    case "insufficient_material":
      return {
        ok: false,
        error: `Needs ${state.availability.need} due ideas to form an encounter — ${state.availability.have} available.`,
      };
  }

  const cards = await drawBossBatch(fieldId, state.batchSize, now);
  if (cards.length < state.batchSize) {
    return { ok: false, error: "Not enough due ideas to form an encounter." };
  }

  await prisma.bossEncounter.upsert({
    where: { userId_fieldId: { userId, fieldId } },
    create: { userId, fieldId, tier: state.tier, lastAttemptAt: now },
    update: { lastAttemptAt: now },
  });
  invalidate("progress");

  return { ok: true, cards, tier: state.tier };
}
