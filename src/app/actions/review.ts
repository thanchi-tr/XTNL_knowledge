"use server";

import { prisma } from "@/lib/prisma";
import { verifyAnswer, type ReviewAnswer } from "@/lib/verification";
import { applyReviewResult, type ReviewOutcome } from "@/lib/srs";

export interface SubmitReviewInput {
  ideaId: string;
  userAnswer: ReviewAnswer;
  /**
   * Consecutive correct answers in the current session, before this one.
   *
   * Client-supplied, which is a knowing exception to the server-authority
   * rule below: there is no server-side session record to derive a combo
   * from, and adding one purely to harden a scoring multiplier is not worth
   * the schema. `reviewReward` clamps it to COMBO_CAP, so the worst a
   * forged value buys is the +50% a genuine 10-run would have earned
   * anyway. Grading itself remains entirely server-side.
   */
  combo?: number;
}

export interface SubmitReviewResult {
  correct: boolean;
  outcome: ReviewOutcome;
}

/**
 * Server-authoritative review submission: grades `userAnswer` against the
 * stored answer via VerificationService, then runs the result through the
 * SRS state machine (reward/strike/degradation). The client never sees the
 * correct answer or performs grading itself — spec section "Server
 * Authority."
 */
export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const idea = await prisma.idea.findUniqueOrThrow({ where: { id: input.ideaId } });
  const correct = verifyAnswer(idea.questionType, input.userAnswer, idea.answer);
  const outcome = await applyReviewResult(idea.id, correct, new Date(), input.combo ?? 0);
  return { correct, outcome };
}
