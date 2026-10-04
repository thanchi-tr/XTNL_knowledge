"use server";

import { verifyAnswer, type ReviewAnswer } from "@/lib/verification";
import { applyReviewResult, readReviewIdea, type ReviewOutcome } from "@/lib/srs";
import { loadProgressionFresh } from "@/lib/skill-effects";
import { displayAnswer } from "@/lib/idea-display";
import { daysUntilDue } from "@/lib/due";
import { dayKeyOf, todayKey, type DayKey } from "@/lib/life-day";
import { comboIsCapped, comboMultiplier } from "@/lib/xp";
import { historyOf, questTargetOf, trueFactOf, type TrueFact } from "@/lib/review-facts";
import { captureSnapshot, detectCelebrations } from "@/lib/celebrations";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { getCurrentUserId } from "@/lib/user";
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

  const correct = verifyAnswer(idea.questionType, input.userAnswer, idea.answer, { caseSensitive: idea.answerCaseSensitive });
  const outcome = await applyReviewResult(idea.id, correct, now, combo, { idea, progression });

  // After the write (and its leveling), so the diff sees it. Never fails the answer: the points are already in.
  const celebrations: CelebrationEvent[] = before
    ? await captureSnapshot(userId, { scope: "review" })
        .then((afterSnap) => detectCelebrations(before, afterSnap, { cause: "review", now }))
        .catch(() => [])
    : [];

  const cap = progression.modifiers.comboCap;
  const advanced = outcome.outcome === "advanced" ? outcome : null;
  const trueFact = trueFactOf({
    correct,
    today,
    history: historyOf(historyRows, dayKeyOf(idea.createdAt)),
    addedDay: dayKeyOf(idea.createdAt),
    levelBefore: idea.level,
    levelAfter: advanced ? advanced.newLevel : outcome.outcome === "degraded" ? outcome.newLevel : idea.level,
    failedAttemptsBefore: idea.failedAttempts,
    mastered: advanced?.mastered ?? false,
    overdueDays: Math.max(0, -daysUntilDue(idea.dueDate, now)),
    intervalDays: advanced ? advanced.intervalDays : 1,
    miss:
      outcome.outcome === "strike"
        ? { kind: "strike", strike: outcome.failedAttempts, limit: outcome.strikeLimit }
        : outcome.outcome === "degraded"
          ? { kind: "degraded", levelBefore: outcome.previousLevel, levelAfter: outcome.newLevel }
          : outcome.outcome === "shielded"
            ? { kind: "shielded", skillName: outcome.skillName, level: outcome.level }
            : undefined,
  });

  return {
    correct,
    outcome,
    expected: displayAnswer(idea.questionType, idea.answer),
    explanation: idea.corePremise?.trim() || null,
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
