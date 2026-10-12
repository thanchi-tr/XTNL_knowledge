import type { QuestionType } from "@prisma/client";
import { decodeStringArray, decodeNumericAnswer } from "./idea-payload";
import { gradeShortAnswer, matchesText, parseShortAnswer, type ShortGradeOptions } from "./short-answer";
import { formulasEquivalent, looksLikeFormula } from "./formula-equivalence";

// ============================================================================
// SHORT — normalised text, typos pass on similarity (> 0.85), and the
// `[a, b]` / `2 of [a, b, c]` list syntax (short-answer.ts). A plain answer
// that reads as a formula (looksLikeFormula: `a*b*c`, `F = m*a`) also passes
// when what was typed is the same formula written another way.
// ============================================================================
export function verifyShort(userInput: string, correctAnswer: string, opts: ShortGradeOptions = {}): boolean {
  if (gradeShortAnswer(userInput, correctAnswer, opts)) return true;
  return parseShortAnswer(correctAnswer).kind === "text" && looksLikeFormula(correctAnswer) && formulasEquivalent(userInput, correctAnswer, { caseSensitive: opts.caseSensitive });
}

// ============================================================================
// MULTI — strict exact match
// ============================================================================
export function verifyMulti(userInput: string, correctAnswer: string): boolean {
  return userInput === correctAnswer;
}

// ============================================================================
// FORMULA — equivalence by evaluation at random points (formula-equivalence.ts):
// any arrangement of the same formula passes (b*a*c for a*b*c, b*a = y for
// y = a*b, bac, ×/·, other capitals, an opaque Std(sample) on both sides)
// ============================================================================
const FORMULA_TRIALS = 6;

/**
 * Proves (probabilistically) that `userInput` and `correctAnswer` are the same
 * formula by evaluating both at several random points, rather than comparing
 * them as text — spec: "evaluating them using a set of random test variables
 * to prove mathematical equivalence." Both may be mathjs, LaTeX or the
 * everyday spellings. Fails closed.
 */
export function verifyFormula(userInput: string, correctAnswer: string, trials = FORMULA_TRIALS, opts: Pick<ShortGradeOptions, "caseSensitive"> = {}): boolean {
  return formulasEquivalent(userInput, correctAnswer, { trials, caseSensitive: opts.caseSensitive });
}

// ============================================================================
// DIAGRAM — strict key-value hotspot label match (spec: 100% must match)
// ============================================================================
export function verifyDiagram(userLabels: Record<string, string>, correctAnswerJson: string): boolean {
  let correct: Record<string, string>;
  try {
    correct = JSON.parse(correctAnswerJson);
  } catch {
    return false;
  }

  const correctKeys = Object.keys(correct);
  const userKeys = Object.keys(userLabels);
  if (correctKeys.length !== userKeys.length) return false;

  return correctKeys.every((key) => {
    const expected = correct[key]?.trim().toLowerCase();
    const actual = userLabels[key]?.trim().toLowerCase();
    return expected !== undefined && expected === actual;
  });
}

// ============================================================================
// CLOZE — every blank graded like a SHORT answer
// ============================================================================
/**
 * Blanks are graded with the same similarity threshold as SHORT, and all of
 * them must pass. A partially-filled sentence is not partial knowledge of
 * the claim; it is the claim not recalled.
 */
export function verifyCloze(userBlanks: string[], correctAnswerJson: string, opts: ShortGradeOptions = {}): boolean {
  const correct = decodeStringArray(correctAnswerJson);
  if (correct.length === 0 || userBlanks.length !== correct.length) return false;
  return correct.every((expected, i) => matchesText(userBlanks[i] ?? "", expected, opts));
}

// ============================================================================
// LIST — set equality, order irrelevant
// ============================================================================
/**
 * Greedy one-to-one match on similarity: each expected item must be claimed
 * by exactly one distinct user item. Matching without consuming would let a
 * learner list the same correct item four times and pass a four-item
 * question.
 */
export function verifyList(userItems: string[], correctAnswerJson: string, opts: ShortGradeOptions = {}): boolean {
  const correct = decodeStringArray(correctAnswerJson);
  if (correct.length === 0) return false;

  const remaining = userItems.map((s) => s.trim()).filter(Boolean);
  if (remaining.length !== correct.length) return false;

  for (const expected of correct) {
    const idx = remaining.findIndex((given) => matchesText(given, expected, opts));
    if (idx === -1) return false;
    remaining.splice(idx, 1);
  }
  return true;
}

// ============================================================================
// ORDER — exact sequence
// ============================================================================
/**
 * Compared position by position against the stored sequence. Items are
 * chosen from a fixed set rather than typed, so this is an identity check
 * on ordering, not a spelling test — similarity grading would be the wrong
 * tool and would let two similarly-named steps swap places undetected.
 */
export function verifyOrder(userOrder: string[], correctAnswerJson: string): boolean {
  const correct = decodeStringArray(correctAnswerJson);
  if (correct.length === 0 || userOrder.length !== correct.length) return false;
  return correct.every((item, i) => item.trim() === userOrder[i]?.trim());
}

// ============================================================================
// NUMERIC — value within tolerance
// ============================================================================
/**
 * `tolerance` is absolute and set by the author, so "9.8 ± 0.1" and
 * "6.02e23 ± 1e21" both express what they mean. A zero tolerance is a
 * legitimate demand for exactness rather than an error.
 */
export function verifyNumeric(userInput: string, correctAnswerJson: string): boolean {
  const { value, tolerance } = decodeNumericAnswer(correctAnswerJson);
  if (!Number.isFinite(value)) return false;

  // Accept what a person actually types: thousands separators, stray unit
  // text, and a leading `=`. Anything left over that is not a number fails.
  const cleaned = userInput.replace(/[,\s]/g, "").replace(/^=/, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return false;

  return Math.abs(parsed - value) <= Math.abs(tolerance);
}

// ============================================================================
// Dispatch
// ============================================================================
export type ReviewAnswer = string | string[] | Record<string, string>;

/**
 * `opts.caseSensitive` is the Idea's `answerCaseSensitive`: capitals count
 * for SHORT answers, cloze blanks and list items only when it is set.
 */
export function verifyAnswer(
  questionType: QuestionType,
  userAnswer: ReviewAnswer,
  correctAnswer: string,
  opts: ShortGradeOptions = {}
): boolean {
  switch (questionType) {
    case "SHORT":
      return verifyShort(String(userAnswer), correctAnswer, opts);
    case "MULTI":
      return verifyMulti(String(userAnswer), correctAnswer);
    case "FORMULA":
      // The review field accepts LaTeX as well as mathjs (frac-style LaTeX or a/b);
      // the stored answer is already mathjs (AnswerExpressionField). Both are normalised in formula-equivalence.
      return verifyFormula(String(userAnswer), correctAnswer, FORMULA_TRIALS, opts);
    case "DIAGRAM":
      // DIAGRAM answers are a label map, not a string or a list.
      if (typeof userAnswer === "string" || Array.isArray(userAnswer)) return false;
      return verifyDiagram(userAnswer, correctAnswer);
    case "CLOZE":
      return Array.isArray(userAnswer) ? verifyCloze(userAnswer, correctAnswer, opts) : false;
    case "LIST":
      return Array.isArray(userAnswer) ? verifyList(userAnswer, correctAnswer, opts) : false;
    case "ORDER":
      return Array.isArray(userAnswer) ? verifyOrder(userAnswer, correctAnswer) : false;
    case "NUMERIC":
      return typeof userAnswer === "string" ? verifyNumeric(userAnswer, correctAnswer) : false;
  }
}
