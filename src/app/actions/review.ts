"use server";

import { after } from "next/server";
import type { ReviewAnswer } from "@/lib/verification";
import { gradeReview } from "@/lib/answer-judge";
import type { MeaningVerdict } from "@/lib/meaning-match";
import { applyReviewResult, readReviewIdea, undoMissCore, type ReviewOutcome } from "@/lib/srs";
import { loadProgressionFresh } from "@/lib/skill-effects";
import { displayAnswer } from "@/lib/idea-display";
import { daysUntilDue } from "@/lib/due";
import { dayKeyOf, todayKey, type DayKey } from "@/lib/life-day";
import { MASTERY_LEVEL, cleanRecallsTo, comboIsCapped, comboMultiplier, ideaIntervalDays } from "@/lib/xp";
import { historyOf, questTargetOf, trueFactOf, type MissOutcome, type TrueFact } from "@/lib/review-facts";
import { captureSnapshot, detectCelebrations } from "@/lib/celebrations";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { getCurrentUserId } from "@/lib/user";
import { recordCardsForReview } from "@/lib/roadmap-readings";
import { readIdeaHistory, readReviewDay } from "@/app/review/review-data";

export interface SubmitReviewInput {
  ideaId: string;
  userAnswer: ReviewAnswer;
  /**
   * Consecutive correct answers in the current session, before this one.
   *
   * Client-supplied, which is a knowing exception to the server-authority
   * rule below: there is no server-side session record to derive a combo
   * from, and adding one purely to harden a scoring multiplier is not worth
   * the schema. `comboMultiplier` clamps it to the modified cap, so the
   * worst a forged value buys is what a genuine full run would have earned
   * anyway. Grading itself remains entirely server-side.
   */
  combo?: number;
}

/** The combo as the runner prints it: the multiplier paid on this card, and the next one. */
export interface ComboPaid {
  /** Consecutive correct answers before this card, as sent. */
  before: number;
  /** The multiplier this card was paid at (reviewPayout's; 1 on a miss, which pays nothing). */
  multiplier: number;
  /** The modified ceiling (COMBO_CEILING, MOMENTUM, FATIGUED). */
  cap: number;
  /** True when this card was paid at the ceiling. */
  capped: boolean;
  /** The run after this answer (server-decided, COMBO_ANCHOR-aware). */
  next: number;
  /** What the next card pays if it is correct. */
  nextMultiplier: number;
}

export interface SubmitReviewResult {
  correct: boolean;
  outcome: ReviewOutcome;
  /** The stored answer, readable — returned only after grading, so it is earned, never leaked. */
  expected: string;
  /** The Idea's own premise (its "why"), when it has one. */
  explanation: string | null;
  /** Set when the wording missed and the meaning check decided (answer-judge.ts): its verdict and one-line reason. */
  judged: MeaningVerdict | null;
  combo: ComboPaid;
  /** The one true sentence for this recall (review-facts.ts). */
  trueFact: TrueFact;
  /**
   * Today's review quest after this answer: reviews today (this one
   * included) and the capped target, or null before the day's first open
   * fixed it (the runner then keeps the hub's target).
   */
  quest: { done: number; target: number | null };
  /** True when this answer was the day's first deed (it keeps the day). A miss counts: showing up is the streak. */
  streakSecured: boolean;
  /** Life day of the next review, for "One clean recall on 9 Oct masters it". */
  nextDueDay: DayKey;
  /** L3's detectors' events for this answer (T1 in place, T2 into the run's recap, T3 after the run). */
  celebrations: CelebrationEvent[];
}

/** The true fact's miss, from the server's outcome: the day's lapse (with how it moved the spacing) or a retry. */
function missOf(outcome: ReviewOutcome): MissOutcome | undefined {
  switch (outcome.outcome) {
    case "strike":
      return { kind: "strike", strike: outcome.failedAttempts, limit: outcome.strikeLimit, ease: outcome.ease };
    case "degraded":
      return { kind: "degraded", levelBefore: outcome.previousLevel, levelAfter: outcome.newLevel, ease: outcome.ease };
    case "shielded":
      return { kind: "shielded", skillName: outcome.skillName, level: outcome.level, ease: outcome.ease };
    case "retry":
      return { kind: "retry" };
    default:
      return undefined;
  }
}

/** A relearn's facts: relearned, and the interval its level would usually schedule at its ease (to say "sooner"). */
function relearnOf(outcome: ReviewOutcome, intervalMultiplier: number): { relearned: boolean; usualIntervalDays: number | null } {
  if (outcome.outcome !== "advanced" || outcome.rise.kind !== "relearned") return { relearned: false, usualIntervalDays: null };
  return { relearned: true, usualIntervalDays: ideaIntervalDays(outcome.newLevel, outcome.rise.ease.after, { multiplier: intervalMultiplier, jitter: false }) };
}

/**
 * Server-authoritative review submission: grades `userAnswer` against the
 * stored answer via VerificationService, then runs the result through the
 * SRS state machine (reward/strike/degradation). The client never sees the
 * correct answer before grading and never grades — spec section "Server
 * Authority." The answer comes back only in the result.
 *
 * One read wave before the write: the Idea with its Domain and Field (one
 * joined query), fresh progression, this Idea's ledger history, today's
 * ledger counts and L3's before-snapshot, all together. Grading needs the
 * Idea and nothing else, so it waits for nothing extra.
 */
export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const userId = getCurrentUserId();
  const now = new Date();
  const today = todayKey(now);
  const combo = input.combo ?? 0;

  const [idea, progression, historyRows, day, before] = await Promise.all([
    readReviewIdea(input.ideaId),
    loadProgressionFresh(userId, now),
    readIdeaHistory(userId, input.ideaId),
    readReviewDay(userId, today),
    // L3's snapshot is decoration on this path: if it fails, the review still lands.
    // Scoped (levels, mastered, streak: 4 queries), the same scope before and after.
    captureSnapshot(userId, { scope: "review" }).catch(() => null),
  ]);

  // The rules, then for a plain SHORT miss the in-house meaning check (answer-judge.ts).
  const { correct, judged } = gradeReview({ questionType: idea.questionType, answer: idea.answer, answerCaseSensitive: idea.answerCaseSensitive, given: input.userAnswer });
  const outcome = await applyReviewResult(idea.id, correct, now, combo, { idea, progression });

  // After the write (and its leveling), so the diff sees it. Never fails the answer: the points are already in.
  const celebrations: CelebrationEvent[] = before
    ? await captureSnapshot(userId, { scope: "review" })
        .then((afterSnap) => detectCelebrations(before, afterSnap, { cause: "review", now }))
        .catch(() => [])
    : [];

  const cap = progression.modifiers.comboCap;
  const advanced = outcome.outcome === "advanced" ? outcome : null;
  const levelAfter = advanced ? advanced.newLevel : outcome.outcome === "degraded" ? outcome.newLevel : idea.level;
  // A review that moved the card's level records the roadmap's reading at once (roadmap.md F10, F16
  // seam 7), after the answer is sent. The writer is a no-op unless a started milestone or the aim
  // counts this Domain at a level the move crossed, writes only where writes are on, and never fails
  // the answer: its points are already in. The writer logs its own failures and never throws; anything
  // that escapes it anyway is logged here, never swallowed without a trace.
  if (levelAfter !== idea.level) {
    after(() =>
      recordCardsForReview(userId, idea.id, idea.domainId, idea.level, levelAfter, { now }).catch((err: unknown) => {
        console.error("roadmap: the review's reading was not recorded:", err);
      })
    );
  }
  const trueFact = trueFactOf({
    correct,
    today,
    history: historyOf(historyRows, dayKeyOf(idea.createdAt)),
    addedDay: dayKeyOf(idea.createdAt),
    levelBefore: idea.level,
    levelAfter,
    failedAttemptsBefore: idea.failedAttempts,
    mastered: advanced?.mastered ?? false,
    overdueDays: Math.max(0, -daysUntilDue(idea.dueDate, now)),
    intervalDays: advanced ? advanced.intervalDays : 1,
    ...relearnOf(outcome, progression.modifiers.intervalMultiplier),
    // Clean recalls still to mastery: a pass keeps its streak (outcome.rise), a miss breaks it.
    cleanToMastery: cleanRecallsTo(levelAfter, advanced ? advanced.rise.cleanStreak : 0, MASTERY_LEVEL),
    miss: missOf(outcome),
  });

  return {
    correct,
    outcome,
    expected: displayAnswer(idea.questionType, idea.answer),
    explanation: idea.corePremise?.trim() || null,
    judged,
    combo: {
      before: combo,
      multiplier: advanced ? advanced.payout.comboMultiplier : 1,
      cap,
      capped: advanced ? comboIsCapped(combo, cap) : false,
      next: outcome.nextCombo,
      nextMultiplier: comboMultiplier(outcome.nextCombo, cap),
    },
    trueFact,
    // This answer's row is either in (a pass, inside the transaction) or on
    // its way (a miss, in after()); either way it is one more review today.
    quest: { done: day.reviews + 1, target: day.dayOpenQty == null ? null : questTargetOf(day.dayOpenQty, 0, 0) },
    streakSecured: day.streakUnits <= 0,
    nextDueDay: dayKeyOf(new Date(outcome.nextDue)),
    celebrations,
  };
}

export interface OverrideReviewInput {
  ideaId: string;
  /** The run's combo before the card that was missed (the miss broke it; counting the answer as right restores it). */
  combo?: number;
}

/**
 * "I was right": the reviewer overrides the checker on a miss (SHORT and LIST, whose checker matches words, so a
 * right meaning in other words can read as wrong). The miss is taken back on the server's own record (srs.ts
 * undoMissCore: the idea's latest review must be that miss, within 10 minutes, never overridden before; a lost level
 * and its points come back), then the answer is recorded as a pass, paid as any pass is at the level it was given.
 * Returns the same result a right answer returns, so the runner shows it in the miss's place.
 */
export async function overrideReview(input: OverrideReviewInput): Promise<{ ok: true; value: SubmitReviewResult } | { ok: false; error: string }> {
  const userId = getCurrentUserId();
  const now = new Date();
  const today = todayKey(now);
  const combo = input.combo ?? 0;
  try {
    const undone = await undoMissCore(userId, input.ideaId, now);
    if (!undone.ok) return undone;

    const [idea, progression, historyRows, day] = await Promise.all([
      readReviewIdea(input.ideaId),
      loadProgressionFresh(userId, now),
      readIdeaHistory(userId, input.ideaId),
      readReviewDay(userId, today),
    ]);
    const outcome = await applyReviewResult(idea.id, true, now, combo, { idea, progression });
    const advanced = outcome.outcome === "advanced" ? outcome : null;
    const levelAfter = advanced ? advanced.newLevel : idea.level;
    if (levelAfter !== idea.level) {
      after(() =>
        recordCardsForReview(userId, idea.id, idea.domainId, idea.level, levelAfter, { now }).catch((err: unknown) => {
          console.error("roadmap: the override's reading was not recorded:", err);
        })
      );
    }
    const cap = progression.modifiers.comboCap;
    return {
      ok: true,
      value: {
        correct: true,
        outcome,
        expected: displayAnswer(idea.questionType, idea.answer),
        explanation: idea.corePremise?.trim() || null,
        judged: null,
        combo: {
          before: combo,
          multiplier: advanced ? advanced.payout.comboMultiplier : 1,
          cap,
          capped: advanced ? comboIsCapped(combo, cap) : false,
          next: outcome.nextCombo,
          nextMultiplier: comboMultiplier(outcome.nextCombo, cap),
        },
        trueFact: trueFactOf({
          correct: true,
          today,
          history: historyOf(historyRows, dayKeyOf(idea.createdAt)),
          addedDay: dayKeyOf(idea.createdAt),
          levelBefore: idea.level,
          levelAfter,
          failedAttemptsBefore: idea.failedAttempts,
          mastered: advanced?.mastered ?? false,
          overdueDays: 0,
          intervalDays: advanced ? advanced.intervalDays : 1,
          ...relearnOf(outcome, progression.modifiers.intervalMultiplier),
          cleanToMastery: cleanRecallsTo(levelAfter, advanced ? advanced.rise.cleanStreak : 0, MASTERY_LEVEL),
        }),
        // The miss already counted as today's review; the override is the same answer, not another.
        quest: { done: day.reviews, target: day.dayOpenQty == null ? null : questTargetOf(day.dayOpenQty, 0, 0) },
        streakSecured: false,
        nextDueDay: dayKeyOf(new Date(outcome.nextDue)),
        celebrations: [],
      },
    };
  } catch (err) {
    console.error("overrideReview failed:", err);
    return { ok: false, error: "Couldn't count it as right. Try again." };
  }
}
