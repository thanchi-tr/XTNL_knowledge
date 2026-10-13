import { after } from "next/server";
import type { Idea, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import {
  graceEndsAt,
  reviewPayout,
  domainLevelProgress,
  riseIntervalDays,
  riseLine,
  riseStep,
  MAX_LEVEL,
  MASTERY_BONUS,
  MASTERY_LEVEL,
  type ReviewPayout,
  type RiseKind,
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
import { activityOp, invalidateActivity, isDuplicateActivity, recordActivity } from "./activity";
import { daysOverdueOf, forgetDedupeKey, forgetKeyPrefix, levelLossPoints, levelsForgotten } from "./forgetting";
import type { ActivityInput } from "./life-types";
import { getCurrentUserId } from "./user";

// MAX_LEVEL and the interval schedule now live in xp.ts (pure arithmetic,
// no Prisma import) and are re-exported here so existing callers are
// unaffected.
export { MAX_LEVEL, nextIntervalDays } from "./xp";

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
  /**
   * How much of the Domain is still remembered after this review (xp.ts retainedShare, 1 when nothing fades): its
   * level reads its points at this share, so below 1 fading ideas hold the level, not only depth.
   */
  retention?: number;
}

export interface FieldMove {
  id: string;
  name: string;
  level: LevelMove;
}

/**
 * Why a right answer moved the level or held it (xp.ts riseStep): only a clean recall (no miss since the card fell
 * due) raises a level, and from CLEAN_PAIR_FROM up two in a row do. `line` is the result panel's sentence.
 */
export interface ReviewRise {
  kind: RiseKind;
  /** This recall was clean. */
  clean: boolean;
  /** Idea.cleanStreak after it. */
  cleanStreak: number;
  /** Clean recalls in a row the level it was answered at needs to rise. */
  cleanNeeded: 1 | 2;
  /** The level the next rise reaches; null at MAX_LEVEL. */
  nextLevel: number | null;
  /** "Level up: L9" · "1 of 2 clean recalls for L9" · "Level held: a miss this round — …". */
  line: string;
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
      /** Why the level rose or held (newLevel === previousLevel on a held or confirming recall). */
      rise: ReviewRise;
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
  // A lost level takes back what earning it paid (forgetting.ts levelLossPoints); level 1 has nothing to lose.
  const taken = newLevel < idea.level ? levelLossPoints(idea.level) : 0;
  const dueDate = addDays(now, 1);

  await prisma.$transaction([
    prisma.idea.update({
      where: { id: idea.id },
      data: {
        level: newLevel,
        failedAttempts: 0,
        // A lost level starts its clean recalls again.
        cleanStreak: 0,
        dueDate,
        graceEndsAt: graceEndsAt(dueDate, newLevel, graceExtraDays),
      },
    }),
    ...(taken > 0 ? [domainDebitOp(idea.domainId, taken)] : []),
  ]);
  await recalculateLeveling(idea.domainId);

  return { newLevel, dueDate };
}

/** Takes `points` off a Domain's totalPoints, never below 0. */
function domainDebitOp(domainId: string, points: number) {
  return prisma.$executeRaw`UPDATE "public"."Domain" SET "totalPoints" = GREATEST(0, "totalPoints" - ${points}) WHERE "id" = ${domainId}`;
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
    // The ward keeps the level; the miss still breaks the clean recalls in a row.
    await prisma.idea.update({
      where: { id: idea.id },
      data: { failedAttempts: 0, cleanStreak: 0, dueDate },
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
 * Punishment). Correct -> credit the review's price (xp.ts reviewPayout:
 * level base × combo × yield, plus a one-time mastery bonus at level 12 —
 * see xp.ts for why this is no longer the spec's flat +2) and apply the rise
 * rule (xp.ts riseStep): a clean recall (no miss since the card fell due)
 * raises the level, from CLEAN_PAIR_FROM up only the second clean recall in
 * a row does (the first holds it and comes back at the confirm interval); a
 * recall after a miss is paid and holds the level, rescheduled at that
 * level's interval. Incorrect ->
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
  // The miss row's qty: the clean recalls in a row this miss broke (Idea.cleanStreak), or null when a miss earlier in
  // this due cycle had already broken them. undoMissCore restores the clean state from it ("I was right").
  const brokenStreak = idea.failedAttempts > 0 ? null : idea.cleanStreak;
  after(async () => {
    if (lateOutcome) {
      await recordActivity(userId, { ...reviewEvent(ideaId, now, 0, lateOutcome), qty: brokenStreak });
    }
    // Study tasks ('review 20 daily') complete themselves from these rows,
    // so they are checked only once this review's row is in.
    if (landed) {
      const { autoCompleteStudyTasks } = await import("./tasks");
      await autoCompleteStudyTasks(userId, now);
    }
  });

  if (correct) {
    // Clean (no miss since it fell due) raises it; from CLEAN_PAIR_FROM up the second clean recall in a row does.
    const step = riseStep(idea.level, idea.cleanStreak, idea.failedAttempts);
    const newLevel = step.levelAfter;
    const intervalDays = riseIntervalDays(step, modifiers.intervalMultiplier);
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
          cleanStreak: step.cleanStreak,
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
    const { domainLevel: newDomainLevel, fieldLevel: newFieldLevel, domainRetention } = await recalculateLeveling(idea.domainId, { now, graceExtraDays: modifiers.graceExtraDays });

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
      rise: {
        kind: step.kind,
        clean: step.clean,
        cleanStreak: step.cleanStreak,
        cleanNeeded: step.cleanNeeded,
        nextLevel: newLevel < MAX_LEVEL ? newLevel + 1 : null,
        line: riseLine(step),
      },
      masteryMinted,
      domain: {
        id: domainBefore.id,
        name: domainBefore.name,
        level: { before: domainBefore.level, after: newDomainLevel },
        totalPoints: { before: domainBefore.totalPoints, after: pointsAfter },
        progress: { before: domainLevelProgress(domainBefore.totalPoints), after: domainLevelProgress(pointsAfter) },
        retention: domainRetention,
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

/** How long after a miss it can still be counted as right (overrideReview), and on which formats. */
export const OVERRIDE_WINDOW_MS = 10 * 60_000;
export const OVERRIDE_TYPES: readonly string[] = ["SHORT", "LIST"];

/**
 * The reviewer's own call on a miss the checker made (SHORT and LIST, whose checker matches words, not meaning):
 * "I was right". Takes back the miss on the server's own record of it, never on the client's word: the idea's latest
 * REVIEW row must be that miss (xp 0, 'strike', 'degraded' or 'shielded' with the level it was taken at), inside
 * OVERRIDE_WINDOW_MS, and never overridden before (an ADJUST row keyed 'review-override:<row>' marks it, so a second
 * tap does nothing). A degradation is undone: the level comes back and so do the points it took (levelLossPoints).
 * The clean state before the miss comes back too (cleanStateBefore: failedAttempts, and the clean recalls in a row
 * the miss row's qty kept), so the pass that follows (applyReviewResult, correct) is judged clean exactly when that
 * answer would have been. A ward charge a shielded miss spent stays spent. Returns the level the answer was given at.
 */
export async function undoMissCore(userId: string, ideaId: string, now: Date = new Date()): Promise<{ ok: true; levelBefore: number } | { ok: false; error: string }> {
  const read = () =>
    Promise.all([
      prisma.idea.findUnique({ where: { id: ideaId }, select: { id: true, level: true, questionType: true, domainId: true, failedAttempts: true } }),
      prisma.activityEvent.findFirst({ where: { userId, source: "REVIEW", sourceId: ideaId }, orderBy: { occurredAt: "desc" }, select: { id: true, xp: true, detail: true, occurredAt: true, qty: true } }),
    ]);
  let [idea, row] = await read();
  if (!idea) return { ok: false, error: "That idea no longer exists." };
  if (!OVERRIDE_TYPES.includes(idea.questionType)) return { ok: false, error: "Only a short answer or a list can be counted as right by hand." };
  const missOf = (r: typeof row) => (r && r.xp === 0 ? /^(strike|degraded|shielded) · L(\d+)/.exec(r.detail ?? "") : null);
  // The miss's row is written just after its answer is sent: give it a moment once.
  if (!missOf(row)) {
    await new Promise((res) => setTimeout(res, 700));
    [idea, row] = await read();
    if (!idea) return { ok: false, error: "That idea no longer exists." };
  }
  const miss = missOf(row);
  if (!row || !miss) return { ok: false, error: "There's no missed answer on this idea to count as right." };
  if (now.getTime() - row.occurredAt.getTime() > OVERRIDE_WINDOW_MS) return { ok: false, error: "Too late: a miss can be counted as right for 10 minutes after it." };
  const outcome = miss[1];
  const levelBefore = Number(miss[2]);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    activityOp(userId, { source: "ADJUST", sink: "NONE", xp: 0, sourceId: ideaId, occurredAt: now, countsForStreak: false, detail: `override · ${outcome} · L${levelBefore}`, dedupeKey: `review-override:${row.id}` }),
  ];
  const restore = outcome === "degraded" && idea.level < levelBefore;
  if (restore) {
    ops.push(prisma.idea.update({ where: { id: ideaId }, data: { level: levelBefore } }));
    const refund = levelLossPoints(levelBefore);
    if (refund > 0) ops.push(prisma.domain.update({ where: { id: idea.domainId }, data: { totalPoints: { increment: refund } } }));
  }
  ops.push(prisma.idea.update({ where: { id: ideaId }, data: cleanStateBefore(outcome, idea.failedAttempts, row.qty) }));
  try {
    await prisma.$transaction(ops);
  } catch (err) {
    if (isDuplicateActivity(err)) return { ok: false, error: "Already counted as right." };
    throw err;
  }
  if (restore) await recalculateLeveling(idea.domainId);
  return { ok: true, levelBefore };
}

/**
 * The clean state a miss took, from its REVIEW row (undoMissCore). A strike only raised failedAttempts (it never
 * writes cleanStreak: the strike alone makes the next right answer unclean), so it gives back one strike. A
 * degradation or a ward cleared failedAttempts and the clean streak: the row's qty is the streak it broke (null when a
 * miss earlier in the due cycle had already broken it, or on a row written before 2026-10-13), so a qty brings back
 * a clean answer (no strikes, that streak) and null an unclean one (one strike, no streak).
 */
export function cleanStateBefore(outcome: string, failedAttemptsNow: number, brokenStreak: number | null): { failedAttempts: number; cleanStreak?: number } {
  const streak = brokenStreak == null || !Number.isFinite(brokenStreak) ? null : Math.max(0, Math.round(brokenStreak));
  if (outcome === "strike") return { failedAttempts: streak != null ? 0 : Math.max(0, failedAttemptsNow - 1) };
  return streak != null ? { failedAttempts: 0, cleanStreak: streak } : { failedAttempts: 1, cleanStreak: 0 };
}

/**
 * Daily Cron target: forgetting (forgetting.ts). Every card past its grace with a level to lose is read against the
 * forgetting curve: from the level it fell due at and the days it has been overdue since, how many levels it has
 * forgotten by now. Each level not yet taken is taken now: the card's level, the points earning it paid off its
 * Domain (never below 0), and one FORGET row per level on the ledger (sink DOMAIN, xp negative, keyed per card, due
 * date and level, so a second run the same day, or the next, takes nothing twice). The due date is left as it is:
 * it is the anchor the curve is read from, and a review moves it. Routed through the same DEGRADATION_WARD gate as a
 * manual degradation. Levels, then the Field's and the character's, follow (recalculateLeveling, once per Domain).
 *
 * Progression is loaded once for the whole batch: an unattended run is one moment. It never calls
 * recordFieldActivity: forgetting for neglect is the opposite of what a streak measures.
 */
export async function degradeOverdueIdeas(now: Date = new Date()): Promise<{ ideaId: string; outcome: ReviewOutcome }[]> {
  const overdue = await prisma.idea.findMany({
    where: { isArchived: false, level: { gt: 1 }, graceEndsAt: { lt: now } },
  });
  if (overdue.length === 0) return [];

  const userId = getCurrentUserId();
  const [progression, applied] = await Promise.all([
    loadProgressionFresh(userId, now),
    prisma.activityEvent.findMany({
      where: { userId, source: "FORGET", sourceId: { in: overdue.map((i) => i.id) } },
      select: { dedupeKey: true },
    }),
  ]);
  const keys = applied.map((a) => a.dedupeKey ?? "");
  const graceExtra = progression.modifiers.graceExtraDays;

  const results: { ideaId: string; outcome: ReviewOutcome }[] = [];
  const touched = new Set<string>();
  for (const idea of overdue) {
    // What this card already forgot since it fell due: its level then is today's plus those.
    const prefix = forgetKeyPrefix(idea.id, idea.dueDate);
    const done = keys.filter((k) => k.startsWith(prefix)).length;
    const anchor = idea.level + done;
    const want = levelsForgotten(anchor, daysOverdueOf(idea.dueDate, now), graceExtra);
    if (want <= done) continue;

    const anchorWard = await tryConsumeWardCharge(userId, progression.activeSkills, now);
    if (anchorWard) {
      results.push({ ideaId: idea.id, outcome: { outcome: "shielded", level: idea.level, skillName: anchorWard.name, nextCombo: 0, nextDue: idea.dueDate.toISOString() } });
      continue;
    }

    const newLevel = anchor - want;
    // A forgotten level starts its clean recalls again.
    const ops: Prisma.PrismaPromise<unknown>[] = [prisma.idea.update({ where: { id: idea.id }, data: { level: newLevel, cleanStreak: 0 } })];
    let taken = 0;
    for (let n = done + 1; n <= want; n++) {
      const from = anchor - n + 1;
      const points = levelLossPoints(from);
      taken += points;
      ops.push(
        activityOp(userId, {
          source: "FORGET",
          sink: "DOMAIN",
          occurredAt: now,
          sourceId: idea.id,
          xp: -points,
          countsForStreak: false,
          detail: `forgot · L${from} → L${from - 1}`,
          dedupeKey: forgetDedupeKey(idea.id, idea.dueDate, n),
        })
      );
    }
    if (taken > 0) ops.push(domainDebitOp(idea.domainId, taken));
    try {
      await prisma.$transaction(ops);
    } catch (err) {
      // Another run took these levels first: what it wrote stands.
      if (isDuplicateActivity(err)) continue;
      throw err;
    }
    touched.add(idea.domainId);
    results.push({ ideaId: idea.id, outcome: { outcome: "degraded", previousLevel: idea.level, newLevel, nextCombo: 0, nextDue: idea.dueDate.toISOString() } });
  }
  for (const domainId of touched) await recalculateLeveling(domainId);
  if (touched.size > 0) invalidateActivity();
  return results;
}
