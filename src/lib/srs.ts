import { after } from "next/server";
import type { Idea, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import {
  graceEndsAt,
  reviewReward,
  rollRewardVariance,
  type RewardBand,
  domainLevelProgress,
  nextIntervalDays,
  MAX_LEVEL,
  MASTERY_BONUS,
  MASTERY_LEVEL,
} from "./xp";
import { recalculateLeveling } from "./leveling";
import { loadProgressionFresh, tryConsumeWardCharge, type ProgressionState } from "./skill-effects";
import { recordFieldActivity } from "./field-streaks";
import { mintIdeaMasteryOp, mintReviewFractionOp, comboMasteryBonus } from "./mastery";
import { getCurrentUserId } from "./user";

// MAX_LEVEL and the interval schedule now live in xp.ts (pure arithmetic,
// no Prisma import) and are re-exported here so existing callers are
// unaffected.
export { MAX_LEVEL, nextIntervalDays } from "./xp";

const DEGRADATION_YIELD_MULTIPLIER = 0.9;
const STRIKE_LIMIT = 2; // spec: "If failedAttempts == 2 ... subtract 1 from Idea.level"

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Where the Domain now sits relative to its next level threshold. */
export interface DomainProgress {
  domainName: string;
  level: number;
  /** 0..1 toward the next level. */
  progress: number;
  pointsIntoLevel: number;
  pointsForNextLevel: number;
}

export type ReviewOutcome =
  | {
      outcome: "advanced";
      newLevel: number;
      domainLeveledUp: boolean;
      newDomainLevel: number;
      /** Actual points credited, including level scaling, combo and any mastery bonus. */
      pointsAwarded: number;
      /** True only on the review that first reaches MASTERY_LEVEL. */
      mastered: boolean;
      /** Where this payout landed inside the variance band — lets the card call out a good roll. */
      rewardBand: RewardBand;
      domainProgress: DomainProgress;
      /** Next session combo value — server-authoritative (COMBO_ANCHOR-aware); the client just stores it. */
      nextCombo: number;
    }
  | { outcome: "strike"; failedAttempts: number; /** STRIKE_TOLERANCE-adjusted; the actual limit that triggers a Degradation. */ strikeLimit: number; nextCombo: number }
  | { outcome: "degraded"; newLevel: number; nextCombo: number }
  | { outcome: "shielded"; level: number; /** Which owned skill absorbed the Degradation — never a hardcoded name. */ skillName: string; nextCombo: number };

/**
 * Degradation (spec section 5): level -1 (floored at 1), yieldPoints *= 0.9
 * (permanently reducing the Domain's totalPoints by the difference),
 * failedAttempts reset, rescheduled +24h, then the Domain/Field levels
 * recalculated from the new totalPoints (spec section 6). Shared by both
 * the manual review-failure path (applyReviewResult) and the daily
 * unattended-downgrade Cron (degradeOverdueIdeas) so there's exactly one
 * implementation of what "degrade" means.
 *
 * `graceExtraDays` is the GRACE_EXTENSION skill hook, applied to the grace
 * period the *newly degraded* level gets.
 */
async function degradeIdea(idea: Idea, now: Date, graceExtraDays: number): Promise<number> {
  const newLevel = Math.max(1, idea.level - 1);
  const newYield = idea.yieldPoints * DEGRADATION_YIELD_MULTIPLIER;
  const yieldDelta = newYield - idea.yieldPoints; // negative
  const dueDate = addDays(now, 1);

  await prisma.$transaction([
    prisma.idea.update({
      where: { id: idea.id },
      data: {
        level: newLevel,
        yieldPoints: newYield,
        failedAttempts: 0,
        dueDate,
        graceEndsAt: graceEndsAt(dueDate, newLevel, graceExtraDays),
      },
    }),
    prisma.domain.update({
      where: { id: idea.domainId },
      data: { totalPoints: { increment: yieldDelta } },
    }),
  ]);
  await recalculateLeveling(idea.domainId);

  return newLevel;
}

/**
 * Gate in front of degradeIdea: any owned, active DEGRADATION_WARD skill
 * (skill-pool.ts's WARD archetype lineage — replaces the old hardcoded
 * "Memory Domain Lv 3" Shield, which only ever fired for one literal Domain
 * name) can intercept a Degradation entirely, up to its own weekly charge
 * count. When it fires, the Idea still reschedules +24h (matching a normal
 * Strike) but keeps its level and yieldPoints untouched.
 */
async function attemptDegradation(
  idea: Idea,
  now: Date,
  userId: string,
  progression: ProgressionState,
  nextCombo: number
): Promise<ReviewOutcome> {
  const anchor = await tryConsumeWardCharge(userId, progression.activeSkills, now);

  if (anchor) {
    await prisma.idea.update({
      where: { id: idea.id },
      data: { failedAttempts: 0, dueDate: addDays(now, 1) },
    });
    // Reschedules the Idea without touching points, so it never reaches
    // `recalculateLeveling` — the one write path that invalidates for us.
    // The due queue still changed, so it has to be dropped here.
    invalidate("ideas");
    return { outcome: "shielded", level: idea.level, skillName: anchor.name, nextCombo };
  }

  const newLevel = await degradeIdea(idea, now, progression.modifiers.graceExtraDays);
  return { outcome: "degraded", newLevel, nextCombo };
}

/**
 * Applies the result of an attempted review (spec section 5, Reward &
 * Punishment). Correct -> advance level, credit `reviewReward` (level-scaled
 * and combo-multiplied, plus a one-time mastery bonus at level 12 — see
 * xp.ts for why this is no longer the spec's flat +2), next dueDate from the
 * interval schedule above. Incorrect -> failedAttempts++, then either a
 * plain Strike (24h reschedule, no other change) or — if failedAttempts hit
 * the limit or the grace period has already lapsed — a Degradation.
 *
 * Loads the caller's full skill progression once and threads its
 * `ActiveModifiers` through every formula below (REVIEW_YIELD, MASTERY_YIELD,
 * GRACE_EXTENSION, INTERVAL_DILATION, COMBO_CEILING/ANCHOR, STRIKE_TOLERANCE,
 * DEGRADATION_WARD) — this is the one place in the engine all of them meet.
 * Also records this Field's daily activity streak (field-streaks.ts) on
 * every real review, correct or not; showing up is what's measured.
 */
export async function applyReviewResult(
  ideaId: string,
  correct: boolean,
  now: Date = new Date(),
  /** Consecutive correct answers *before* this one; clamped inside `reviewReward`. */
  combo = 0
): Promise<ReviewOutcome> {
  const userId = getCurrentUserId();
  // Three independent reads — issued together rather than in sequence,
  // because each round trip to the database costs far more than the query.
  const [idea, progression] = await Promise.all([
    prisma.idea.findUniqueOrThrow({ where: { id: ideaId } }),
    // Fresh: this is a write path, and it prices real rewards off these
    // modifiers. A cached ward charge or yield multiplier could be seconds
    // stale, which is fine for display and not fine here.
    loadProgressionFresh(userId, now),
  ]);
  const domainBefore = await prisma.domain.findUniqueOrThrow({ where: { id: idea.domainId } });
  const modifiers = progression.modifiers;

  // Streak bookkeeping affects nothing this response returns, so it runs
  // after the answer has already been sent. `after` keeps the review loop
  // snappy without dropping the write.
  after(async () => {
    await recordFieldActivity(userId, domainBefore.fieldId, now);
  });

  if (correct) {
    const newLevel = Math.min(MAX_LEVEL, idea.level + 1);
    const dueDate = addDays(now, nextIntervalDays(newLevel, modifiers.intervalMultiplier));

    // Reward scales with the level being *cleared*, not the one being
    // entered — you are paid for the recall you just performed.
    // Variance applies to the review payout only — never to the mastery
    // lump, which is a once-per-Idea milestone and should read as a fixed
    // reward for reaching the top of the ladder rather than a roll.
    const roll = rollRewardVariance();
    const base = reviewReward(idea.level, combo, modifiers.comboCap, modifiers.reviewYieldMultiplier) * roll.factor;
    // Mastery fires only on the transition, so re-reviewing a capped Idea
    // (level 12 -> Math.min keeps it at 12) never re-pays the bonus.
    const mastered = newLevel === MASTERY_LEVEL && idea.level < MASTERY_LEVEL;
    const pointsAwarded = base + (mastered ? MASTERY_BONUS * modifiers.masteryMultiplier : 0);

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.idea.update({
        where: { id: ideaId },
        data: {
          level: newLevel,
          failedAttempts: 0,
          dueDate,
          graceEndsAt: graceEndsAt(dueDate, newLevel, modifiers.graceExtraDays),
        },
      }),
      prisma.domain.update({
        where: { id: idea.domainId },
        data: { totalPoints: { increment: pointsAwarded } },
      }),
    ];
    // Every passed review mints a fraction of a mastery point, scaled by
    // the level just cleared — the slow, steady income the skill tree runs
    // on. Same transaction as the XP credit, so the two can never disagree.
    // `comboMasteryBonus` layers on top: a longer run of correct answers
    // mints slightly more, capped and sub-linear so a single long session
    // cannot out-earn the economy this is meant to trickle into.
    ops.push(
      mintReviewFractionOp(userId, ideaId, idea.level, modifiers.masteryMultiplier * comboMasteryBonus(combo))
    );
    // The whole point on top, once per Idea ever, at the mastery transition.
    if (mastered) {
      ops.push(mintIdeaMasteryOp(userId, ideaId, modifiers.masteryMultiplier));
    }
    await prisma.$transaction(ops);
    const { domainLevel: newDomainLevel } = await recalculateLeveling(idea.domainId);

    const domainAfter = await prisma.domain.findUniqueOrThrow({ where: { id: idea.domainId } });
    const progress = domainLevelProgress(domainAfter.totalPoints);

    return {
      outcome: "advanced",
      newLevel,
      domainLeveledUp: newDomainLevel > domainBefore.level,
      newDomainLevel,
      pointsAwarded,
      mastered,
      rewardBand: roll.band,
      domainProgress: {
        domainName: domainAfter.name,
        level: progress.level,
        progress: progress.progress,
        pointsIntoLevel: progress.pointsIntoLevel,
        pointsForNextLevel: progress.pointsForNextLevel,
      },
      nextCombo: combo + 1,
    };
  }

  const failedAttempts = idea.failedAttempts + 1;
  const pastGrace = idea.graceEndsAt !== null && now > idea.graceEndsAt;
  const strikeLimit = STRIKE_LIMIT + modifiers.extraStrikes;
  const shouldDegrade = failedAttempts >= strikeLimit || pastGrace;
  // COMBO_ANCHOR: a wrong answer no longer necessarily zeroes the run.
  const nextCombo = Math.floor(combo * modifiers.comboRetained);

  if (!shouldDegrade) {
    await prisma.idea.update({
      where: { id: ideaId },
      data: { failedAttempts, dueDate: addDays(now, 1) },
    });
    // Same as the shielded path: the Idea moved out of the due window
    // without any points changing, so nothing else will invalidate for us.
    invalidate("ideas");
    return { outcome: "strike", failedAttempts, strikeLimit, nextCombo };
  }

  return attemptDegradation({ ...idea, failedAttempts }, now, userId, progression, nextCombo);
}

/**
 * Daily Cron target (spec section 3.4): degrade every Idea whose grace
 * period has lapsed with nobody having attempted it — driven purely by
 * `now > graceEndsAt`, independent of failedAttempts, since an Idea nobody
 * ever reviews never accumulates failed attempts in the first place. Routed
 * through the same DEGRADATION_WARD gate as a manual-failure degradation.
 *
 * Progression is loaded once for the whole batch, not per-Idea — an
 * unattended Cron run is one consistent moment, not N independent ones —
 * and, deliberately, never calls `recordFieldActivity`: an automatic
 * degradation for neglect is the opposite of the thing a streak measures.
 */
export async function degradeOverdueIdeas(now: Date = new Date()): Promise<{ ideaId: string; outcome: ReviewOutcome }[]> {
  const overdue = await prisma.idea.findMany({
    where: { isArchived: false, graceEndsAt: { lt: now } },
  });
  if (overdue.length === 0) return [];

  const userId = getCurrentUserId();
  const progression = await loadProgressionFresh(userId, now);

  const results: { ideaId: string; outcome: ReviewOutcome }[] = [];
  for (const idea of overdue) {
    const outcome = await attemptDegradation(idea, now, userId, progression, 0);
    results.push({ ideaId: idea.id, outcome });
  }
  return results;
}
