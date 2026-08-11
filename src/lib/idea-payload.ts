import type { QuestionType } from "@prisma/client";

/**
 * Runtime submission shape for the four QuestionTypes (spec section
 * "Question Formats & Answer Verification Engine"). Mirrors the JSON
 * encoding prisma/seed.ts uses for MULTI/DIAGRAM, kept as a separate module
 * (rather than importing from the seed script) because seed-time concerns
 * like dueOffsetDays/failedAttempts don't belong in a live submission path.
 */
export type IdeaContent =
  | { type: "SHORT"; question: string; answer: string }
  | { type: "FORMULA"; question: string; answer: string }
  | { type: "MULTI"; options: string[]; correct: string }
  | { type: "DIAGRAM"; image: string; hotspots: { id: string; x: number; y: number }[]; labels: Record<string, string> };

export function encodeIdeaContent(content: IdeaContent): {
  question: string;
  answer: string;
  questionType: QuestionType;
} {
  switch (content.type) {
    case "SHORT":
    case "FORMULA":
      return { question: content.question, answer: content.answer, questionType: content.type };
    case "MULTI":
      return { question: JSON.stringify(content.options), answer: content.correct, questionType: "MULTI" };
    case "DIAGRAM":
      return {
        question: JSON.stringify({ image: content.image, hotspots: content.hotspots }),
        answer: JSON.stringify(content.labels),
        questionType: "DIAGRAM",
      };
  }
}
