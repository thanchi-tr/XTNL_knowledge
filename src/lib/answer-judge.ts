import type { QuestionType } from "@prisma/client";
import { verifyAnswer, type ReviewAnswer } from "./verification";
import { parseShortAnswer } from "./short-answer";
import { withModelTimeout, type AnswerJudgement } from "./gemini";

/**
 * Review grading: the rules first, then — for a plain SHORT answer that
 * missed — a judge that reads for meaning (gemini.ts judgeShortAnswer).
 *
 * The rules decide everything they can: a pass is never second-guessed, and
 * the judge is asked only when
 *   - the card is SHORT and the stored answer is plain text (a [list] or a
 *     |key word| is the author's own rule, so it stands as written);
 *   - the idea isn't case sensitive (an author who asked for exact capitals
 *     asked for exactness);
 *   - something was typed (letters or digits, up to 600 characters).
 * The judge can only turn a miss into a pass or confirm it. If it fails or
 * takes too long, the miss stands: no answer ever passes because the model
 * was unavailable. XTNL_ANSWER_JUDGE=0 turns it off.
 */

export const ANSWER_JUDGE_MAX_CHARS = 600;
const JUDGE_BACKSTOP_MS = 5_500;

export interface ReviewGradeInput {
  questionType: QuestionType;
  question: string;
  answer: string;
  answerCaseSensitive: boolean;
  given: ReviewAnswer;
}

export interface ReviewGrade {
  correct: boolean;
  /** Set when the judge was asked and answered (its verdict is `correct`). */
  judged: AnswerJudgement | null;
}

export type AnswerJudge = (input: { question: string; expected: string; given: string }) => Promise<AnswerJudgement>;

/** Would a miss on this card go to the judge? */
export function judgeEligible(input: ReviewGradeInput, env: Record<string, string | undefined> = process.env): boolean {
  if (env.XTNL_ANSWER_JUDGE === "0") return false;
  if (input.questionType !== "SHORT" || input.answerCaseSensitive) return false;
  if (typeof input.given !== "string") return false;
  const given = input.given.trim();
  if (!given || given.length > ANSWER_JUDGE_MAX_CHARS || !/[\p{L}\p{N}]/u.test(given)) return false;
  return parseShortAnswer(input.answer).kind === "text";
}

export async function gradeReview(
  input: ReviewGradeInput,
  deps: { judge: AnswerJudge; timeoutMs?: number; env?: Record<string, string | undefined> }
): Promise<ReviewGrade> {
  const strict = verifyAnswer(input.questionType, input.given, input.answer, { caseSensitive: input.answerCaseSensitive });
  if (strict || !judgeEligible(input, deps.env)) return { correct: strict, judged: null };

  const res = await withModelTimeout(
    Promise.resolve().then(() => deps.judge({ question: input.question, expected: input.answer, given: String(input.given) })),
    deps.timeoutMs ?? JUDGE_BACKSTOP_MS
  );
  if (!res.ok) {
    console.warn("gradeReview: the answer judge failed; the miss stands:", res.error);
    return { correct: false, judged: null };
  }
  return { correct: res.value.correct, judged: res.value };
}
