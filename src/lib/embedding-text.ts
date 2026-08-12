import type { QuestionType } from "@prisma/client";
import {
  decodeListQuestion,
  decodeOrderQuestion,
  decodeNumericQuestion,
  decodeStringArray,
  decodeNumericAnswer,
} from "./idea-payload";

/**
 * Derives the text actually sent to the embedding model from an Idea's
 * *stored* (already-encoded) question/answer. MULTI's `question` column is
 * a JSON array of options and DIAGRAM's `answer` column is a JSON label
 * map — embedding those raw JSON strings would route on bracket/quote
 * structure rather than semantic content, so this decodes them back into
 * plain text first. Shared by the live submission path (domain-discovery.ts)
 * and the backfill script so both embed the same way.
 */
export function embeddingTextFromStored(questionType: QuestionType, question: string, answer: string): string {
  switch (questionType) {
    case "SHORT":
    case "FORMULA":
      return `${question}\n${answer}`;
    case "MULTI": {
      let options: string[];
      try {
        options = JSON.parse(question);
      } catch {
        options = [question];
      }
      return `${options.join(" / ")}\nCorrect: ${answer}`;
    }
    case "DIAGRAM": {
      let labels: Record<string, string> = {};
      try {
        labels = JSON.parse(answer);
      } catch {
        // leave empty — malformed DIAGRAM answer, embed on structure alone
      }
      return `Diagram labels: ${Object.values(labels).join(", ")}`;
    }
    case "CLOZE":
      // The blanked sentence plus what fills it reconstructs the original
      // claim, which is what the idea is actually *about* — embedding the
      // gapped text alone would route on a sentence with holes in it.
      return `${question}
${decodeStringArray(answer).join(", ")}`;
    case "LIST":
      return `${decodeListQuestion(question).prompt}
${decodeStringArray(answer).join(", ")}`;
    case "ORDER":
      // Correct sequence, not the scrambled display order: the ordering is
      // the knowledge here.
      return `${decodeOrderQuestion(question).prompt}
${decodeStringArray(answer).join(" -> ")}`;
    case "NUMERIC": {
      const q = decodeNumericQuestion(question);
      const a = decodeNumericAnswer(answer);
      return `${q.prompt}
${a.value}${q.unit ? ` ${q.unit}` : ""}`;
    }
  }
}
