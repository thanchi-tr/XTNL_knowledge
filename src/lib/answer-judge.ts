import type { QuestionType } from "@prisma/client";
import { verifyAnswer, type ReviewAnswer } from "./verification";
import { parseShortAnswer } from "./short-answer";
import { judgeByMeaning, type MeaningVerdict } from "./meaning-match";

/**
 * Review grading: the rules first, then — for a plain SHORT answer that
 * missed — the in-house meaning check (meaning-match.ts). No model, no
 * network: it runs in the request, instantly, for free.
 *
 * The rules decide everything they can: a pass is never second-guessed, and
 * the meaning check runs only when
 *   - the card is SHORT and the stored answer is plain text (a [list] or a
 *     |key word| is the author's own rule, so it stands as written);
 *   - the idea isn't case sensitive (an author who asked for exact capitals
 *     asked for exactness);
 *   - something was typed (letters or digits, up to 600 characters).
 * It can only turn a miss into a pass or explain the miss.
 * XTNL_ANSWER_JUDGE=0 turns it off.
 */

export const ANSWER_JUDGE_MAX_CHARS = 600;

export interface ReviewGradeInput {
  questionType: QuestionType;
  answer: string;
  answerCaseSensitive: boolean;
  given: ReviewAnswer;
}

export interface ReviewGrade {
  correct: boolean;
  /** Set when the meaning check ran: its verdict (equal to `correct`) and one-line reason. */
  judged: MeaningVerdict | null;
}

/** Would a miss on this card go to the meaning check? */
export function judgeEligible(input: ReviewGradeInput, env: Record<string, string | undefined> = process.env): boolean {
  if (env.XTNL_ANSWER_JUDGE === "0") return false;
  if (input.questionType !== "SHORT" || input.answerCaseSensitive) return false;
  if (typeof input.given !== "string") return false;
  const given = input.given.trim();
  if (!given || given.length > ANSWER_JUDGE_MAX_CHARS || !/[\p{L}\p{N}]/u.test(given)) return false;
  return parseShortAnswer(input.answer).kind === "text";
}

export function gradeReview(input: ReviewGradeInput, env: Record<string, string | undefined> = process.env): ReviewGrade {
  const strict = verifyAnswer(input.questionType, input.given, input.answer, { caseSensitive: input.answerCaseSensitive });
  if (strict || !judgeEligible(input, env)) return { correct: strict, judged: null };
  const verdict = judgeByMeaning(String(input.given), input.answer);
  return { correct: verdict.correct, judged: verdict };
}
