import { compareTwoStrings } from "string-similarity";
import { create, all } from "mathjs";
import type { QuestionType } from "@prisma/client";
import { decodeStringArray, decodeNumericAnswer } from "./idea-payload";

const math = create(all);

// ============================================================================
// SHORT — Dice's-coefficient string similarity (spec: pass > 0.85)
// ============================================================================
const SHORT_PASS_THRESHOLD = 0.85;

export function verifyShort(userInput: string, correctAnswer: string): boolean {
  return compareTwoStrings(userInput.trim(), correctAnswer.trim()) > SHORT_PASS_THRESHOLD;
}

// ============================================================================
// MULTI — strict exact match
// ============================================================================
export function verifyMulti(userInput: string, correctAnswer: string): boolean {
  return userInput === correctAnswer;
}

// ============================================================================
// FORMULA — mathjs algebraic equivalence via random-variable trials
// ============================================================================
const FORMULA_TRIALS = 6;
const FORMULA_MAX_ATTEMPTS = FORMULA_TRIALS * 5; // allow retries past domain errors (log of negative, etc.)
const FORMULA_TOLERANCE_REL = 1e-6;

/**
 * Free variables in a mathjs expression = SymbolNodes whose name isn't a
 * function/constant already defined on the mathjs instance (sqrt, pi, e,
 * log, ...). Using `name in math` to tell "x" apart from "sqrt" avoids
 * hand-maintaining a list of every mathjs builtin.
 */
function extractVariables(expr: string): string[] {
  const node = math.parse(expr);
  const names = new Set<string>();
  node.filter((n) => n.type === "SymbolNode").forEach((n) => {
    const name = (n as unknown as { name: string }).name;
    if (!(name in math)) names.add(name);
  });
  return [...names];
}

function randomScope(variables: string[]): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const v of variables) {
    scope[v] = 0.5 + Math.random() * 4.5; // 0.5..5 — avoids 0 for most operations without excluding negatives-adjacent behavior
  }
  return scope;
}

/**
 * Proves (probabilistically) that `userExpr` and `correctExpr` are the same
 * function by evaluating both at several random points and comparing
 * outputs, rather than comparing the expressions as strings/ASTs — spec:
 * "evaluating them using a set of random test variables to prove
 * mathematical equivalence." Domain errors (e.g. log of a negative number
 * with that trial's random values) are retried with fresh random values
 * rather than counted as a mismatch. A single valid trial where the two
 * expressions disagree is conclusive — genuinely different functions almost
 * never agree at a random point — so that returns false immediately.
 * Failing to gather enough valid trials at all fails closed (returns false).
 */
export function verifyFormula(userInput: string, correctAnswer: string, trials = FORMULA_TRIALS): boolean {
  let variables: string[];
  try {
    variables = [...new Set([...extractVariables(userInput), ...extractVariables(correctAnswer)])];
  } catch {
    return false; // user input isn't parseable as a mathjs expression
  }

  let validTrials = 0;
  for (let attempt = 0; attempt < FORMULA_MAX_ATTEMPTS && validTrials < trials; attempt++) {
    const scope = randomScope(variables);

    let a: unknown;
    let b: unknown;
    try {
      a = math.evaluate(userInput, scope);
      b = math.evaluate(correctAnswer, scope);
    } catch {
      continue; // domain error at this random point — try a different point
    }

    if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) {
      continue;
    }

    const tolerance = FORMULA_TOLERANCE_REL * Math.max(1, Math.abs(a), Math.abs(b));
    if (Math.abs(a - b) > tolerance) {
      return false;
    }
    validTrials++;
  }

  return validTrials >= trials;
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
export function verifyCloze(userBlanks: string[], correctAnswerJson: string): boolean {
  const correct = decodeStringArray(correctAnswerJson);
  if (correct.length === 0 || userBlanks.length !== correct.length) return false;
  return correct.every((expected, i) => verifyShort(userBlanks[i] ?? "", expected));
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
export function verifyList(userItems: string[], correctAnswerJson: string): boolean {
  const correct = decodeStringArray(correctAnswerJson);
  if (correct.length === 0) return false;

  const remaining = userItems.map((s) => s.trim()).filter(Boolean);
  if (remaining.length !== correct.length) return false;

  for (const expected of correct) {
    const idx = remaining.findIndex((given) => verifyShort(given, expected));
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

export function verifyAnswer(
  questionType: QuestionType,
  userAnswer: ReviewAnswer,
  correctAnswer: string
): boolean {
  switch (questionType) {
    case "SHORT":
      return verifyShort(String(userAnswer), correctAnswer);
    case "MULTI":
      return verifyMulti(String(userAnswer), correctAnswer);
    case "FORMULA":
      return verifyFormula(String(userAnswer), correctAnswer);
    case "DIAGRAM":
      // DIAGRAM answers are a label map, not a string or a list.
      if (typeof userAnswer === "string" || Array.isArray(userAnswer)) return false;
      return verifyDiagram(userAnswer, correctAnswer);
    case "CLOZE":
      return Array.isArray(userAnswer) ? verifyCloze(userAnswer, correctAnswer) : false;
    case "LIST":
      return Array.isArray(userAnswer) ? verifyList(userAnswer, correctAnswer) : false;
    case "ORDER":
      return Array.isArray(userAnswer) ? verifyOrder(userAnswer, correctAnswer) : false;
    case "NUMERIC":
      return typeof userAnswer === "string" ? verifyNumeric(userAnswer, correctAnswer) : false;
  }
}
