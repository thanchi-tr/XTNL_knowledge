import { after } from "next/server";
import type { Idea, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import {
  graceEndsAt,
  reviewPayout,
  domainLevelProgress,
  nextIntervalDays,
  MAX_LEVEL,
  MASTERY_BONUS,
  MASTERY_LEVEL,
  type ReviewPayout,
} from "./xp";
import { recalculateLeveling } from "./leveling";
import { loadProgressionFresh, tryConsumeWardCharge, type ProgressionState } from "./skill-effects";
import { recordFieldActivity } from "./field-streaks";
import {
  mintIdeaMasteryOp,
  mintReviewFractionOp,
  comboMasteryBonus,
  reviewMasteryFraction,
  IDEA_MASTERY_POINTS,
} from "./mastery";
import { activityOp, invalidateActivity, recordActivity } from "./activity";
import type { ActivityInput } from "./life-types";
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

/**
 * An Idea with the Domain and Field it sits in: everything a review reads
 * before it writes. One query — `relationLoadStrategy: "join"` (the
 * relationJoins preview is on) turns the include into a single joined
 * SELECT, so the grader's read, the SRS read and the "domain before" read
 * that used to be three sequential round trips are now one.
 */
export type ReviewIdea = Idea & {
  domain: {
    id: string;
    name: string;
    level: number;
    totalPoints: number;
    fieldId: string;
    field: { id: string; name: string; level: number };
  };
};

export function readReviewIdea(ideaId: string): Promise<ReviewIdea> {
  return prisma.idea.findUniqueOrThrow({
    where: { id: ideaId },
    relationLoadStrategy: "join",
    include: {
      domain: {
        select: {
          id: true,
          name: true,
          level: true,
          totalPoints: true,
          fieldId: true,
          field: { select: { id: true, name: true, level: true } },
        },
      },
    },
  });
}

/** A level before and after this review. */
export interface LevelMove {
  before: number;
  after: number;
}

/** Points progress inside a Domain's points level (xp.ts domainLevelProgress). */
export type PointsProgress = ReturnType<typeof domainLevelProgress>;

/** Where the Domain sat before this review and where it sits now. */
export interface DomainMove {
  id: string;
  name: string;
  /** Domain.level: points capped by depth (xp.ts domainLevel). */
  level: LevelMove;
  totalPoints: LevelMove;
  /** Points progress toward the next points level, before and after (the result panel's meter). */
  progress: { before: PointsProgress; after: PointsProgress };
}

export interface FieldMove {
  id: string;
  name: string;
  level: LevelMove;
}

export type ReviewOutcome =
  | {
      outcome: "advanced";
      previousLevel: number;
      newLevel: number;
      domainLeveledUp: boolean;
      newDomainLevel: number;
      /** Actual points credited: payout.total (level base × combo × yield, plus any mastery bonus). */
      pointsAwarded: number;
      /** The price in parts, exactly as paid. Nothing in it is random. */
      payout: ReviewPayout;
      /** True only on the review that first reaches MASTERY_LEVEL. */
      mastered: boolean;
      /** Mastery points this review minted (the per-review fraction, plus the mastery lump when mastered). */
      masteryMinted: number;
      domain: DomainMove;
      field: FieldMove;
      /** The interval actually scheduled, in days. */
      intervalDays: number;
      /** ISO instant of the next review. */
      nextDue: string;
      /** Next session combo value — server-authoritative (COMBO_ANCHOR-aware); the client just stores it. */
      nextCombo: number;
    }
  | {
      outcome: "strike";
      failedAttempts: number;
      /** STRIKE_TOLERANCE-adjusted; the actual limit that triggers a Degradation. */
      strikeLimit: number;
      nextCombo: number;
      nextDue: string;
    }
  | { outcome: "degraded"; previousLevel: number; newLevel: number; nextCombo: number; nextDue: string }
  | {
      outcome: "shielded";
      level: number;
      /** Which owned skill absorbed the Degradation — never a hardcoded name. */
      skillName: string;
      nextCombo: number;
      nextDue: string;
    };

/**
 * A review's row in the life ledger (activity.ts). Sink DOMAIN: its points,
 * if any, were credited to the Domain here, so the row records them and no
 * life total ever pays them again. Every outcome counts toward the daily
 * streak — showing up is what a streak measures, not getting it right.
 */
function reviewEvent(ideaId: string, now: Date, xp: number, detail: string): ActivityInput {
  return { source: "REVIEW", sink: "DOMAIN", xp, sourceId: ideaId, countsForStreak: true, occurredAt: now, detail };
}

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
async function degradeIdea(idea: Idea, now: Date, graceExtraDays: number): Promise<{ newLevel: number; dueDate: Date }> {
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

  return { newLevel, dueDate };
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
    const dueDate = addDays(now, 1);
    await prisma.idea.update({
      where: { id: idea.id },
      data: { failedAttempts: 0, dueDate },
    });
    // Reschedules the Idea without touching points, so it never reaches
    // `recalculateLeveling` — the one write path that invalidates for us.
    // The due queue still changed, so it has to be dropped here.
    invalidate("ideas");
    return { outcome: "shielded", level: idea.level, skillName: anchor.name, nextCombo, nextDue: dueDate.toISOString() };
  }

  const { newLevel, dueDate } = await degradeIdea(idea, now, progression.modifiers.graceExtraDays);
  return { outcome: "degraded", previousLevel: idea.level, newLevel, nextCombo, nextDue: dueDate.toISOString() };
}

/** What a caller that already read the Idea (the review action, grading it) hands over, so nothing is read twice. */
export interface ReviewPreload {
  idea: ReviewIdea;
  progression: ProgressionState;
}

/**
 * Applies the result of an attempted review (spec section 5, Reward &
 * Punishment). Correct -> advance level, credit the review's price
 * (xp.ts reviewPayout: level base × combo × yield, plus a one-time mastery
 * bonus at level 12 — see xp.ts for why this is no longer the spec's flat
 * +2), next dueDate from the interval schedule. Incorrect ->
 * failedAttempts++, then either a plain Strike (24h reschedule, no other
 * change) or — if failedAttempts hit the limit or the grace period has
 * already lapsed — a Degradation.
 *
 * There is no reward roll: a review pays its stated price every time (the
 * old ±12% variance had an expected value of exactly 1.0, so removing it
 * moved no one's expected income; scripts/review-check.ts proves both).
 *
 * Loads the caller's full skill progression once and threads its
 * `ActiveModifiers` through every formula below (REVIEW_YIELD, MASTERY_YIELD,
 * GRACE_EXTENSION, INTERVAL_DILATION, COMBO_CEILING/ANCHOR, STRIKE_TOLERANCE,
 * DEGRADATION_WARD) — this is the one place in the engine all of them meet.
 * Also records this Field's daily activity streak (field-streaks.ts) on
 * every real review, correct or not; showing up is what's measured. And every
 * review lands once in the life ledger as a REVIEW row, which is what the
 * daily streak and the Today board read.
 *
 * One read wave before the write: the Idea with its Domain and Field (one
 * joined query) and the progression, together — or neither, when the action
 * already read both in its own wave and passes them as `preload`.
 */
export async function applyReviewResult(
  ideaId: string,
  correct: boolean,
  now: Date = new Date(),
  /** Consecutive correct answers *before* this one; clamped inside `reviewPayout`. */
  combo = 0,
  preload?: ReviewPreload
): Promise<ReviewOutcome> {
  const userId = getCurrentUserId();
  const [idea, progression] = preload
    ? [preload.idea, preload.progression]
    : await Promise.all([
        readReviewIdea(ideaId),
        // Fresh: this is a write path, and it prices real rewards off these
        // modifiers. A cached ward charge or yield multiplier could be seconds
        // stale, which is fine for display and not fine here.
        loadProgressionFresh(userId, now),
      ]);
  const domainBefore = idea.domain;
  const modifiers = progression.modifiers;

  // Streak bookkeeping affects nothing this response returns, so it runs
  // after the answer has already been sent. `after` keeps the review loop
  // snappy without dropping the write.
  after(async () => {
    await recordFieldActivity(userId, domainBefore.fieldId, now);
  });

  // The ledger row. A passed review writes it inside the points transaction
  // below, so its DOMAIN xp is always exactly the Domain's increment and it
  // can never be lost. A strike, a degradation or a ward pays nothing, so
  // its row (xp 0) waits for `after`, off the answer's critical path; the
  // outcome is noted here once it is known. A review that threw before
  // landing notes nothing, and is not activity.
  // The miss row's detail: its outcome, then (roadmap rev 4) the level it was taken at, " · L11", appended so every prefix reader still matches.
  let lateOutcome: `${ReviewOutcome["outcome"]} · L${number}` | null = null;
  let landed = false;
  after(async () => {
    if (lateOutcome) {
      await recordActivity(userId, reviewEvent(ideaId, now, 0, lateOutcome));
    }
    // Study tasks ('review 20 daily') complete themselves from these rows,
    // so they are checked only once this review's row is in.
    if (landed) {
      const { autoCompleteStudyTasks } = await import("./tasks");
      await autoCompleteStudyTasks(userId, now);
    }
  });

  if (correct) {
    const newLevel = Math.min(MAX_LEVEL, idea.level + 1);
    const intervalDays = nextIntervalDays(newLevel, modifiers.intervalMultiplier);
    const dueDate = addDays(now, intervalDays);

    // Mastery fires only on the transition, so re-reviewing a capped Idea
    // (level 12 -> Math.min keeps it at 12) never re-pays the bonus.
    const mastered = newLevel === MASTERY_LEVEL && idea.level < MASTERY_LEVEL;
    // Reward scales with the level being *cleared*, not the one being
    // entered — you are paid for the recall you just performed. The mastery
    // lump is a once-per-Idea milestone and is never multiplied by the combo.
    const payout = reviewPayout(
      idea.level,
      combo,
      modifiers.comboCap,
      modifiers.reviewYieldMultiplier,
      mastered ? MASTERY_BONUS * modifiers.masteryMultiplier : 0
    );
    const pointsAwarded = payout.total;
    const fractionMultiplier = modifiers.masteryMultiplier * comboMasteryBonus(combo);
    const masteryMinted =
      reviewMasteryFraction(idea.level) * fractionMultiplier + (mastered ? IDEA_MASTERY_POINTS * modifiers.masteryMultiplier : 0);

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
    ops.push(mintReviewFractionOp(userId, ideaId, idea.level, fractionMultiplier));
    // The whole point on top, once per Idea ever, at the mastery transition.
    if (mastered) {
      ops.push(mintIdeaMasteryOp(userId, ideaId, modifiers.masteryMultiplier));
    }
    // Roadmap rev 4: the level is appended at the end (" · L11→12"), so every prefix reader still matches.
    const review = reviewEvent(ideaId, now, pointsAwarded, `${mastered ? "advanced · mastered" : "advanced"} · L${idea.level}→${newLevel}`);
    ops.push(activityOp(userId, review));
    await prisma.$transaction(ops);
    // Reviews invalidate 'activity' only (recalculateLeveling below clears
    // the knowledge tags), so the progression cache stays warm.
    invalidateActivity(review);
    landed = true;
    const { domainLevel: newDomainLevel, fieldLevel: newFieldLevel } = await recalculateLeveling(idea.domainId);

    // The Domain's new total is the one read before plus this credit: the
    // increment is atomic in the transaction above, so re-reading the row
    // only to print it cost a round trip on every answer.
    const pointsAfter = domainBefore.totalPoints + pointsAwarded;

    return {
      outcome: "advanced",
      previousLevel: idea.level,
      newLevel,
      domainLeveledUp: newDomainLevel > domainBefore.level,
      newDomainLevel,
      pointsAwarded,
      payout,
      mastered,
      masteryMinted,
      domain: {
        id: domainBefore.id,
        name: domainBefore.name,
        level: { before: domainBefore.level, after: newDomainLevel },
        totalPoints: { before: domainBefore.totalPoints, after: pointsAfter },
        progress: { before: domainLevelProgress(domainBefore.totalPoints), after: domainLevelProgress(pointsAfter) },
      },
      field: {
        id: domainBefore.field.id,
        name: domainBefore.field.name,
        level: { before: domainBefore.field.level, after: newFieldLevel },
      },
      intervalDays,
      nextDue: dueDate.toISOString(),
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
    const dueDate = addDays(now, 1);
    await prisma.idea.update({
      where: { id: ideaId },
      data: { failedAttempts, dueDate },
    });
    // Same as the shielded path: the Idea moved out of the due window
    // without any points changing, so nothing else will invalidate for us.
    invalidate("ideas");
    lateOutcome = `strike · L${idea.level}`;
    landed = true;
    return { outcome: "strike", failedAttempts, strikeLimit, nextCombo, nextDue: dueDate.toISOString() };
  }

  const outcome = await attemptDegradation({ ...idea, failedAttempts }, now, userId, progression, nextCombo);
  lateOutcome = `${outcome.outcome} · L${idea.level}`;
  landed = true;
  return outcome;
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
 * and, deliberately, never calls `recordFieldActivity` or writes a ledger
 * row: an automatic degradation for neglect is the opposite of the thing a
 * streak measures. (The old daily streak read `Idea.updatedAt`, which this
 * bumps, so the cron used to keep a streak alive on its own.)
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
