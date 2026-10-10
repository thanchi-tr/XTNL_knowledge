/**
 * Question variants: other wordings of an idea's question, with the same answer. The add form takes them; each
 * review shows the original or one variant, picked at random (pickVariantIndex), so the card is recalled from its
 * meaning rather than from one sentence's shape. Grading never reads the question, so nothing else changes.
 *
 * Which formats: those whose question is a written prompt. SHORT and FORMULA (the whole question), LIST, ORDER and
 * NUMERIC (their prompt; the count, the items and the unit stay). Not CLOZE (every wording would need the same
 * blanks), MULTI (it has no written prompt) or DIAGRAM.
 *
 * Pure: shared by the form, the server (idea-variants-server.ts) and the review loaders. Dedup, the embedding and
 * difficulty keep reading the original question only.
 */
import type { QuestionType } from "@prisma/client";
import { decodeListQuestion, decodeNumericQuestion, decodeOrderQuestion } from "./idea-payload";

/** At most this many variants besides the original. */
export const VARIANTS_MAX = 6;
/** A variant's length, at most (the question fields' own cap is far above any prompt). */
export const VARIANT_MAX_CHARS = 1000;

export const VARIANT_TYPES: readonly QuestionType[] = ["SHORT", "FORMULA", "LIST", "ORDER", "NUMERIC"];

export const VARIANTS_NOT_READY = "Question variants need a one-time database update first. The idea was saved without them.";

export function variantsAllowed(type: QuestionType | string): boolean {
  return (VARIANT_TYPES as readonly string[]).includes(type);
}

/** The variants as typed: trimmed, empty ones and repeats of the original or of each other dropped, VARIANTS_MAX at most. */
export function cleanVariants(raw: unknown, original = ""): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([norm(original)]);
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, VARIANT_MAX_CHARS).trim();
    const k = norm(t);
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= VARIANTS_MAX) break;
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The original's prompt as the form shows it (the text a variant replaces). */
export function promptOfQuestion(type: QuestionType | string, question: string): string {
  if (type === "LIST") return decodeListQuestion(question).prompt;
  if (type === "ORDER") return decodeOrderQuestion(question).prompt;
  if (type === "NUMERIC") return decodeNumericQuestion(question).prompt;
  return question;
}

/** The stored question with a variant's prompt in place of the original's: the whole question, or only its prompt. */
export function withVariantPrompt(type: QuestionType | string, question: string, variant: string): string {
  if (type === "SHORT" || type === "FORMULA") return variant;
  if (type === "LIST") return JSON.stringify({ ...decodeListQuestion(question), prompt: variant });
  if (type === "ORDER") return JSON.stringify({ ...decodeOrderQuestion(question), prompt: variant });
  if (type === "NUMERIC") return JSON.stringify({ ...decodeNumericQuestion(question), prompt: variant });
  return question;
}

/** Which wording a review shows: 0 the original, k the k-th variant; uniform over all of them. */
export function pickVariantIndex(variants: number, rand: () => number = Math.random): number {
  const n = Math.max(0, Math.floor(variants)) + 1;
  return Math.min(n - 1, Math.floor(Math.max(0, Math.min(0.999999, rand())) * n));
}

/**
 * A review card with its wording picked: the original, or one variant in its place (question and preview), with
 * `variant` saying which (0 = the original). `display` re-derives the preview from the new question.
 */
export function pickCardWording<C extends { id: string; questionType: QuestionType | string; question: string; preview: string }>(
  card: C,
  variants: readonly string[] | undefined,
  display: (type: QuestionType, question: string) => string,
  rand: () => number = Math.random
): C & { variant: number; wordings: number } {
  const list = variants && variantsAllowed(card.questionType) ? variants : [];
  const k = pickVariantIndex(list.length, rand);
  if (k === 0) return { ...card, variant: 0, wordings: list.length + 1 };
  const question = withVariantPrompt(card.questionType, card.question, list[k - 1]);
  return { ...card, question, preview: display(card.questionType as QuestionType, question), variant: k, wordings: list.length + 1 };
}
