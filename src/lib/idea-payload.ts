import type { QuestionType } from "@prisma/client";

/**
 * Runtime submission shape per QuestionType, and how each is encoded into
 * the two columns an Idea actually has (`question`, `answer`).
 *
 * One rule governs every encoding here: **`question` must never contain the
 * answer.** It is sent to the browser before a review is attempted — the
 * review card receives `question` but never `answer` — so anything the
 * learner is supposed to produce has to live on the `answer` side. That is
 * why CLOZE stores blanked text rather than the template it was authored
 * from, and why ORDER stores its items pre-scrambled with the true sequence
 * held in `answer`.
 *
 * Kept separate from prisma/seed.ts because seed-time concerns
 * (dueOffsetDays, failedAttempts) don't belong in a live submission path.
 */
export type IdeaContent =
  | { type: "SHORT"; question: string; answer: string }
  | { type: "FORMULA"; question: string; answer: string }
  | { type: "MULTI"; options: string[]; correct: string }
  | { type: "DIAGRAM"; image: string; hotspots: { id: string; x: number; y: number }[]; labels: Record<string, string> }
  /** `text` carries `{{...}}` markers; each becomes one blank. */
  | { type: "CLOZE"; text: string }
  | { type: "LIST"; prompt: string; items: string[] }
  | { type: "ORDER"; prompt: string; items: string[] }
  | { type: "NUMERIC"; prompt: string; value: number; tolerance: number; unit?: string };

/**
 * Every question type, in the order they should be offered.
 *
 * Built from a Record keyed on the enum rather than written as an array
 * literal, because a `QuestionType[]` accepts a *partial* list and so
 * cannot catch an omission. Adding a member to the enum now breaks this
 * object until it is listed here — which is exactly what failed to happen
 * for the library's type filter, where a hardcoded four-item array silently
 * hid the new formats from search.
 */
const ALL_QUESTION_TYPES: Record<QuestionType, true> = {
  SHORT: true,
  CLOZE: true,
  NUMERIC: true,
  MULTI: true,
  LIST: true,
  ORDER: true,
  FORMULA: true,
  DIAGRAM: true,
};

export const QUESTION_TYPES = Object.keys(ALL_QUESTION_TYPES) as QuestionType[];

/** Marker the learner sees in place of a removed span: `[1]`, `[2]`, … */
export const clozeBlank = (n: number) => `[${n}]`;

const CLOZE_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Splits `The capital of France is {{Paris}}` into the text the learner
 * sees and the spans they must recall.
 *
 * Blanks are numbered rather than rendered as identical `____` runs: with
 * two or more gaps in a sentence, undifferentiated blanks give no way to
 * say which input belongs to which gap.
 */
export function parseCloze(text: string): { blanked: string; answers: string[] } {
  const answers: string[] = [];
  const blanked = text.replace(CLOZE_PATTERN, (_match, inner: string) => {
    answers.push(inner.trim());
    return clozeBlank(answers.length);
  });
  return { blanked, answers };
}

/** How many blanks a cloze template declares — for authoring-time validation. */
export function countClozeBlanks(text: string): number {
  return [...text.matchAll(CLOZE_PATTERN)].length;
}

/**
 * Deterministic shuffle, seeded by the joined items.
 *
 * ORDER stores its items already scrambled, because `question` reaches the
 * client. Seeding from the content rather than `Math.random()` keeps
 * encoding pure, so the same submission always produces the same stored
 * row — which matters to the dedup pipeline, where two identical
 * submissions must embed identically.
 */
function seededShuffle(items: string[]): string[] {
  let seed = 0;
  const key = items.join(" ");
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) | 0;

  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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

    case "CLOZE": {
      const { blanked, answers } = parseCloze(content.text);
      // Only the blanked form is stored: keeping the `{{…}}` template in
      // `question` would ship every answer to the client.
      return { question: blanked, answer: JSON.stringify(answers), questionType: "CLOZE" };
    }

    case "LIST":
      // `count` rides along in `question` so the card can say how many are
      // wanted without being told what they are.
      return {
        question: JSON.stringify({ prompt: content.prompt, count: content.items.length }),
        answer: JSON.stringify(content.items),
        questionType: "LIST",
      };

    case "ORDER":
      return {
        question: JSON.stringify({ prompt: content.prompt, items: seededShuffle(content.items) }),
        answer: JSON.stringify(content.items),
        questionType: "ORDER",
      };

    case "NUMERIC":
      return {
        question: JSON.stringify({ prompt: content.prompt, unit: content.unit ?? null }),
        answer: JSON.stringify({ value: content.value, tolerance: content.tolerance }),
        questionType: "NUMERIC",
      };
  }
}

// ── Decoders, shared by display / review / embedding ────────────────────

export interface ListQuestion {
  prompt: string;
  count: number;
}
export interface OrderQuestion {
  prompt: string;
  items: string[];
}
export interface NumericQuestion {
  prompt: string;
  unit: string | null;
}
export interface NumericAnswer {
  value: number;
  tolerance: number;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const decodeListQuestion = (q: string): ListQuestion => parseJson<ListQuestion>(q, { prompt: q, count: 0 });

export const decodeOrderQuestion = (q: string): OrderQuestion => parseJson<OrderQuestion>(q, { prompt: q, items: [] });

export const decodeNumericQuestion = (q: string): NumericQuestion =>
  parseJson<NumericQuestion>(q, { prompt: q, unit: null });

export const decodeStringArray = (a: string): string[] => parseJson<string[]>(a, []);

export const decodeNumericAnswer = (a: string): NumericAnswer => parseJson<NumericAnswer>(a, { value: NaN, tolerance: 0 });
