import { cache } from "react";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { gradeMasteryAttestation } from "./gemini";
import { SKILL_POOL } from "./skill-pool";
import { loadProgressionFresh, unlockBlockers } from "./skill-effects";

/**
 * The mastery-point economy. `MasteryLedgerEntry` is append-only (see its
 * schema doc comment) — this module is the only place that writes to it,
 * across three income paths and one expense:
 *
 *   1. **Every passed review** mints a small *fraction* of a point,
 *      scaling with the level cleared (`reviewMasteryFraction`). This is
 *      what makes routine review feel like it accrues toward the skill
 *      tree instead of only paying Domain XP.
 *   2. **Mastering an Idea** (level 12, once ever) mints a whole point,
 *      scaled by MASTERY_YIELD.
 *   3. **Attestation** — a written account of what the user understands,
 *      graded by the one legitimate model call in this system
 *      (gemini.ts's gradeMasteryAttestation — judges the writing, never
 *      invents a rule). Rate-limited to once per UTC day.
 *
 *   4. **Decay** debits idle points — see `decayStaleMastery`.
 *
 * All four paths are deliberately slow. Driving one Idea from level 1 to
 * mastery yields ~2.3 points total, and the top of the tree costs
 * thousands, so reaching an Ultimate is a campaign measured in real months
 * and — because Ultimates also gate on breadth attributes — one that
 * cannot be finished inside a single subject.
 */

export const IDEA_MASTERY_POINTS = 1;
const ATTESTATION_MAX_POINTS = 3;

/**
 * Fraction of a mastery point minted per passed review, scaled by the level
 * being cleared. Linear at 0.02/level: clearing a level-1 card is worth
 * 0.02, a level-11 card 0.22, and an Idea's whole 1→12 climb sums to ~1.32
 * — meaningful in aggregate, negligible per click, which is what keeps
 * grinding easy cards from being a viable strategy against the far larger
 * costs at the top of the tree.
 */
export const REVIEW_MASTERY_PER_LEVEL = 0.02;

export function reviewMasteryFraction(ideaLevel: number): number {
  return REVIEW_MASTERY_PER_LEVEL * Math.max(1, ideaLevel);
}

/** A Prisma op, not awaited — pushed into srs.ts's existing mastery-transition `$transaction([...])` array. */
export function mintIdeaMasteryOp(userId: string, ideaId: string, multiplier: number) {
  return prisma.masteryLedgerEntry.create({
    data: { userId, delta: IDEA_MASTERY_POINTS * multiplier, reason: "IDEA_MASTERED", ideaId },
  });
}

/** Ditto, for the per-review fraction. Same transaction, so a review's XP and its mastery income can never disagree. */
export function mintReviewFractionOp(userId: string, ideaId: string, ideaLevel: number, multiplier: number) {
  return prisma.masteryLedgerEntry.create({
    data: {
      userId,
      delta: reviewMasteryFraction(ideaLevel) * multiplier,
      reason: "REVIEW_FRACTION",
      ideaId,
    },
  });
}

export const getMasteryBalance = cache(async (userId: string): Promise<number> => {
  return cached(`masteryBalance:${userId}`, ["progress"], () => getMasteryBalanceFresh(userId));
});

/** Uncached. Spending paths must never price a purchase off a stale balance. */
export async function getMasteryBalanceFresh(userId: string): Promise<number> {
  const agg = await prisma.masteryLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } });
  // Float column — round to 2dp so a long tail of 0.02s never surfaces as
  // 4.800000000000001 in the UI or in a cost comparison.
  return Math.round((agg._sum.delta ?? 0) * 100) / 100;
}

export type AttestationResult =
  | { status: "graded"; points: number; rationale: string }
  | { status: "rate_limited"; nextAvailableAt: Date };

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Grades and records one attestation. The rate-limit check runs, and can
 * reject, before `gradeMasteryAttestation` is ever called — a blocked
 * attempt costs nothing.
 */
export async function submitAttestation(
  userId: string,
  ideaId: string | null,
  text: string,
  now: Date = new Date()
): Promise<AttestationResult> {
  const todayStart = utcDayStart(now);
  const usedToday = await prisma.masteryLedgerEntry.findFirst({
    where: { userId, reason: "ATTESTATION", createdAt: { gte: todayStart } },
  });

  if (usedToday) {
    const tomorrow = new Date(todayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return { status: "rate_limited", nextAvailableAt: tomorrow };
  }

  const graded = await gradeMasteryAttestation(text);
  // The model's own cap is stated in the prompt; this clamp is the one that
  // actually matters, since a returned score is never trusted past it.
  const points = Math.max(0, Math.min(ATTESTATION_MAX_POINTS, Math.round(graded.points)));

  await prisma.masteryLedgerEntry.create({
    data: { userId, delta: points, reason: "ATTESTATION", detail: graded.rationale, ideaId: ideaId ?? undefined },
  });
  invalidate("progress");

  return { status: "graded", points, rationale: graded.rationale };
}

// ============================================================================
// Idle-point decay
// ============================================================================

/** Days of not spending before idle points start eroding. */
export const MASTERY_IDLE_GRACE_DAYS = 10;
/** Fraction of the balance lost per decay tick (one tick per day, from the Cron). */
export const MASTERY_DECAY_RATE = 0.05;
/** Below this, decay stops entirely — a small balance is never worth eroding to nothing. */
export const MASTERY_DECAY_FLOOR = 1;

export type DecayResult =
  | { status: "decayed"; amount: number; balanceAfter: number; idleDays: number }
  | { status: "skipped"; why: "no_balance" | "within_grace" | "already_today" | "saving_toward_locked" };

/**
 * Erodes hoarded mastery points — but only points that are genuinely idle.
 *
 * The distinction that makes this fair rather than punitive: decay fires
 * only when the player can *already afford something they have not bought*.
 * Every non-mastery gate on that skill is clear and the points are simply
 * sitting there. If the balance is being saved toward something still
 * locked by attributes or prerequisites — the normal state of anyone
 * working toward an Apex or Ultimate, which cost thousands — nothing
 * decays, no matter how long it takes. Without that check this mechanic
 * would make the top of the tree mathematically unreachable, since no
 * realistic income rate outruns 5%/day compounding.
 *
 * Idempotent per UTC day, so running the Cron twice cannot double-charge.
 */
export async function decayStaleMastery(userId: string, now: Date = new Date()): Promise<DecayResult> {
  // Fresh throughout: this debits real points, so it must not price the
  // decision off a cached balance or a cached skill list.
  const balance = await getMasteryBalanceFresh(userId);
  if (balance <= MASTERY_DECAY_FLOOR) return { status: "skipped", why: "no_balance" };

  const todayStart = utcDayStart(now);
  const decayedToday = await prisma.masteryLedgerEntry.findFirst({
    where: { userId, reason: "DECAY", createdAt: { gte: todayStart } },
  });
  if (decayedToday) return { status: "skipped", why: "already_today" };

  // The idle clock resets on any real spend, and on the previous decay tick
  // so erosion is paced daily rather than compounding from one old date.
  const lastActivity = await prisma.masteryLedgerEntry.findFirst({
    where: { userId, reason: { in: ["SKILL_UNLOCK", "DECAY"] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const since = lastActivity?.createdAt ?? (await earliestLedgerDate(userId, now));
  const idleDays = Math.floor((now.getTime() - since.getTime()) / 86_400_000);
  if (idleDays < MASTERY_IDLE_GRACE_DAYS) return { status: "skipped", why: "within_grace" };

  const progression = await loadProgressionFresh(userId, now);
  const canAffordSomething = SKILL_POOL.some(
    (skill) =>
      unlockBlockers(skill, progression.scores, progression.ownedCodes, balance, progression.modifiers).length === 0
  );
  if (!canAffordSomething) return { status: "skipped", why: "saving_toward_locked" };

  const amount = Math.round(balance * MASTERY_DECAY_RATE * 100) / 100;
  if (amount <= 0) return { status: "skipped", why: "no_balance" };

  await prisma.masteryLedgerEntry.create({
    data: {
      userId,
      delta: -amount,
      reason: "DECAY",
      detail: `Idle ${idleDays}d with unspent points that could already be spent.`,
    },
  });
  invalidate("progress");

  return { status: "decayed", amount, balanceAfter: Math.round((balance - amount) * 100) / 100, idleDays };
}

async function earliestLedgerDate(userId: string, fallback: Date): Promise<Date> {
  const first = await prisma.masteryLedgerEntry.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return first?.createdAt ?? fallback;
}
