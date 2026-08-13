import type { QuestionType } from "@prisma/client";
import { XP_BASE } from "./xp";
import {
  decodeListQuestion,
  decodeOrderQuestion,
  decodeNumericAnswer,
  decodeStringArray,
} from "./idea-payload";
import { embeddingTextFromStored } from "./embedding-text";

/**
 * How hard an Idea is to answer, decided automatically from what it asks.
 *
 * Deliberately *not* how hard it has proved to be for you. Review history
 * already drives level, interval and degradation, and a difficulty that also
 * moved with performance would be the same signal counted twice — a card you
 * keep failing would climb in difficulty, raise its own payout, and reward
 * you for not knowing it. This measures the demand the card makes, which is
 * a property of the card and is fixed the moment it is written.
 *
 * Four independent signals, each saturating so no single one can run away:
 *
 *  1. **Format.** Read from `XP_BASE` rather than a second hand-written
 *     table, so the difficulty ladder and the payout ladder cannot disagree
 *     about whether a DIAGRAM asks more than a CLOZE.
 *  2. **Production.** How much you must generate, in the units the format
 *     actually uses: blanks for a cloze, items for a list, orderings for a
 *     sequence, tokens for prose. Recognising one option among four is not
 *     the same work as producing seven items from nothing.
 *  3. **Vocabulary.** Technical density — long words, notation, digits.
 *     Rough by nature, and weighted accordingly.
 *  4. **Precision.** A numeric answer tolerating ±0.001 demands more than
 *     one tolerating ±10.
 *
 * Deterministic and offline, like the attribute lexicon and for the same
 * reason: this decides game numbers, and two identically-worded cards must
 * score identically on every run.
 */

export type DifficultyBand = "INTRO" | "STANDARD" | "DEMANDING" | "SEVERE";

export interface DifficultyFactor {
  label: string;
  /** 0–1 before weighting, so the UI can show which signal drove the score. */
  value: number;
  weight: number;
}

export interface DifficultyEstimate {
  /** 0–100. Stored on the Idea; the band is derived, never persisted. */
  score: number;
  band: DifficultyBand;
  factors: DifficultyFactor[];
}

const WEIGHTS = { format: 0.4, production: 0.25, vocabulary: 0.25, precision: 0.1 };

/**
 * Saturating curve on a count: the difference between one item and four is
 * large, between fifteen and twenty almost nothing. `half` is the count that
 * scores 0.5.
 */
function saturate(n: number, half: number): number {
  if (n <= 0) return 0;
  return n / (n + half);
}

function tokens(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Format demand, normalised across the payout table.
 *
 * `XP_BASE` already encodes the design's view of which formats ask more —
 * SHORT 10 up to DIAGRAM 40 — so deriving from it keeps one source of truth.
 * A new question type gets a difficulty the moment it gets a payout.
 */
function formatLoad(questionType: QuestionType): number {
  const values = Object.values(XP_BASE);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 0.5;
  return (XP_BASE[questionType] - min) / (max - min);
}

/** How much the answerer must generate, in each format's own units. */
function productionLoad(questionType: QuestionType, question: string, answer: string): number {
  switch (questionType) {
    case "CLOZE":
      // Counted from the answers, not the question. The stored question is
      // the *already blanked* text — the `{{…}}` template never survives
      // encoding, so counting markers on it returned zero for every cloze
      // ever written, and a four-blank card scored below a one-blank one.
      return saturate(decodeStringArray(answer).length, 3);

    case "LIST":
      return saturate(decodeListQuestion(question).count, 4);

    case "ORDER": {
      // Orderings, not items: the space of wrong answers is n!, so five items
      // is far more than a fifth harder than one. Normalised against 8!,
      // beyond which the difference stops being meaningful.
      const n = decodeOrderQuestion(question).items.length;
      if (n <= 1) return 0;
      let logFact = 0;
      for (let i = 2; i <= n; i++) logFact += Math.log2(i);
      const max = 15.3; // log2(8!)
      return Math.min(1, logFact / max);
    }

    case "MULTI": {
      // Recognition, not recall. More options narrow the guess, but picking
      // one of anything is bounded work — capped well below the others.
      const options = decodeStringArray(question).length;
      return Math.min(0.5, saturate(options, 8));
    }

    case "DIAGRAM": {
      const labels = Object.keys(safeObject(answer)).length;
      return saturate(labels, 4);
    }

    case "NUMERIC":
      return 0.3; // A single figure, whatever it is. Precision carries the rest.

    case "SHORT":
    case "FORMULA":
    default:
      return saturate(tokens(answer), 18);
  }
}

function safeObject(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Technical density of the wording.
 *
 * Three cheap proxies that correlate with specialist material: long words,
 * mathematical or logical notation, and numbers. None is reliable alone,
 * which is why this carries a quarter of the weight and not more.
 */
function vocabularyLoad(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const long = words.filter((w) => w.replace(/\W/g, "").length >= 9).length / words.length;
  const notation = (text.match(/[=<>≤≥±∑∫√^_{}\\/|·×÷→∀∃∈≠]/g) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;

  // Each capped before mixing so a formula dense in symbols cannot alone
  // push a trivial card to the top of the scale.
  return Math.min(1, long * 2.2 * 0.5 + saturate(notation, 6) * 0.3 + saturate(digits, 8) * 0.2);
}

/** Tightness of a numeric tolerance, relative to the value itself. */
function precisionLoad(questionType: QuestionType, answer: string): number {
  if (questionType !== "NUMERIC") return 0;
  const { value, tolerance } = decodeNumericAnswer(answer);
  if (!Number.isFinite(value) || !Number.isFinite(tolerance)) return 0;
  const magnitude = Math.abs(value);
  // An exact-match requirement is the hardest case there is.
  if (tolerance <= 0) return 1;
  if (magnitude === 0) return tolerance < 0.01 ? 1 : 0.4;
  const relative = tolerance / magnitude;
  // 0.1% -> ~1, 10% -> ~0.2, anything looser -> negligible.
  return Math.max(0, Math.min(1, 1 - Math.log10(relative * 1000) / 3));
}

/**
 * Bands, calibrated against what the scorer actually produces.
 *
 * The score is a weighted mean of four signals that in practice never peak
 * together — a diagram carries no numeric precision, a dense formula is
 * short, a long list is plainly worded. Measured across the format range the
 * observed spread runs from 1 to about 60, so the obvious quartiles at
 * 25/50/75 put SEVERE out of reach entirely and left almost everything in
 * one band. These thresholds are set where the material actually falls.
 *
 * Deliberately not normalised by dividing through by an observed maximum:
 * that would make every card's score depend on the hardest card ever scored,
 * so writing one brutal diagram would quietly demote everything else.
 */
export function bandFor(score: number): DifficultyBand {
  if (score < 18) return "INTRO";
  if (score < 34) return "STANDARD";
  if (score < 50) return "DEMANDING";
  return "SEVERE";
}

/**
 * Scores a card from its *stored* form, so the same function serves creation
 * and any later backfill — nothing has to reconstruct the authoring shape.
 */
export function estimateDifficulty(
  questionType: QuestionType,
  question: string,
  answer: string
): DifficultyEstimate {
  const factors: DifficultyFactor[] = [
    { label: "Format", value: formatLoad(questionType), weight: WEIGHTS.format },
    {
      label: "Production",
      value: productionLoad(questionType, question, answer),
      weight: WEIGHTS.production,
    },
    {
      // Measured on the rendered prose, never the stored form. Several types
      // store JSON, and its braces, quotes and slashes register as heavy
      // notation — a three-item ORDER card with items "a", "b", "c" scored
      // 0.81 on vocabulary purely from its own envelope.
      label: "Vocabulary",
      value: vocabularyLoad(embeddingTextFromStored(questionType, question, answer)),
      weight: WEIGHTS.vocabulary,
    },
    { label: "Precision", value: precisionLoad(questionType, answer), weight: WEIGHTS.precision },
  ];

  const raw = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
  const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);
  return { score, band: bandFor(score), factors };
}

export const DIFFICULTY_META: Record<DifficultyBand, { label: string; color: string; blurb: string }> = {
  INTRO: { label: "Intro", color: "#5a7490", blurb: "A single fact, cued." },
  STANDARD: { label: "Standard", color: "#00cc7a", blurb: "Ordinary recall or a short derivation." },
  DEMANDING: { label: "Demanding", color: "#f0a030", blurb: "Several parts, or exact production." },
  SEVERE: { label: "Severe", color: "#f03a57", blurb: "Long, precise, or heavily structured." },
};
