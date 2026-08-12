import type { QuestionType } from "@prisma/client";
import {
  decodeListQuestion,
  decodeOrderQuestion,
  decodeNumericQuestion,
  decodeStringArray,
  decodeNumericAnswer,
} from "./idea-payload";

/** Human-readable question preview. Safe anywhere — never touches `answer`. */
export function displayQuestion(questionType: QuestionType, question: string): string {
  switch (questionType) {
    case "SHORT":
    case "FORMULA":
      return question;
    case "MULTI":
      try {
        return (JSON.parse(question) as string[]).join(" · ");
      } catch {
        return question;
      }
    case "DIAGRAM":
      try {
        const parsed = JSON.parse(question) as { hotspots: unknown[] };
        const n = parsed.hotspots?.length ?? 0;
        return `Diagram — ${n} hotspot${n === 1 ? "" : "s"}`;
      } catch {
        return "Diagram";
      }
    case "CLOZE":
      // Already stored blanked, so this is safe to show verbatim.
      return question;
    case "LIST": {
      const { prompt, count } = decodeListQuestion(question);
      return count > 0 ? `${prompt} (${count})` : prompt;
    }
    case "ORDER": {
      const { prompt, items } = decodeOrderQuestion(question);
      return items.length > 0 ? `${prompt} (${items.length} steps)` : prompt;
    }
    case "NUMERIC": {
      const { prompt, unit } = decodeNumericQuestion(question);
      return unit ? `${prompt} (${unit})` : prompt;
    }
  }
}

/**
 * Decodes the stored answer into human-readable text. Only for non-review
 * browsing contexts (Library) — never pass this into a component rendered
 * before a review is attempted, since it reveals the correct answer.
 */
export function displayAnswer(questionType: QuestionType, answer: string): string {
  switch (questionType) {
    case "SHORT":
    case "FORMULA":
    case "MULTI":
      return answer;
    case "DIAGRAM":
      try {
        const labels = JSON.parse(answer) as Record<string, string>;
        return Object.entries(labels)
          .map(([id, label]) => `${id}: ${label}`)
          .join(", ");
      } catch {
        return answer;
      }
    case "CLOZE":
      return decodeStringArray(answer)
        .map((blank, i) => `[${i + 1}] ${blank}`)
        .join("  ");
    case "LIST":
      return decodeStringArray(answer).join(", ");
    case "ORDER":
      return decodeStringArray(answer)
        .map((item, i) => `${i + 1}. ${item}`)
        .join("  ");
    case "NUMERIC": {
      const { value, tolerance } = decodeNumericAnswer(answer);
      return tolerance > 0 ? `${value} ± ${tolerance}` : String(value);
    }
  }
}
