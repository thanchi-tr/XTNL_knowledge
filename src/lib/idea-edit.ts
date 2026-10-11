/**
 * Editing an idea in place: its wording, its answer and its format, while everything it has earned stays (level,
 * due date, grace, strikes, history, points). The idea page's editor and editIdea (actions/ideas.ts) share this.
 *
 *   editStateOf(idea)            the stored idea back into the add form's fields (idea-handoff.ts AddContentState)
 *   contentOfAddState(state)     the fields → IdeaContent, or null while incomplete (the add form uses it too)
 *   switchEditFormat(state, to)  a format change that carries the prompt (and items, answer) across
 *   cleanEditContent(raw)        the server's check of what the browser sent: trimmed, or the reason it can't be saved
 *   caseSensitiveAfterEdit(...)  the Idea's answerCaseSensitive after the edit
 *
 * Pure. Every format the add form writes can be edited (ADD_FORMATS); DIAGRAM can't (it has no text editor).
 */
import type { QuestionType } from "@prisma/client";
import { ADD_FORMATS, EMPTY_ADD_CONTENT, type AddContentState, type AddFormat } from "./idea-handoff";
import {
  countClozeBlanks,
  decodeListQuestion,
  decodeNumericAnswer,
  decodeNumericQuestion,
  decodeOrderQuestion,
  decodeStringArray,
  type IdeaContent,
} from "./idea-payload";
import { latexToMathjs } from "./latex";
import { shortAnswerProblem } from "./short-answer";

/** The formats an idea can be edited into, and out of. */
export const EDIT_FORMATS: readonly AddFormat[] = ADD_FORMATS;

export function isEditFormat(type: QuestionType | string): type is AddFormat {
  return (EDIT_FORMATS as readonly string[]).includes(type);
}

/** At most this many rows in a list, order or multiple choice (far above any card a person writes). */
export const EDIT_ROWS_MAX = 50;
/** One field's length, at most. */
export const EDIT_TEXT_MAX = 4000;

export interface StoredIdea {
  questionType: QuestionType | string;
  question: string;
  answer: string;
  answerCaseSensitive: boolean;
}

/** `{{…}}` back around each blank: the cloze sentence as it was typed. */
export function clozeTextOf(question: string, answer: string): string {
  const spans = decodeStringArray(answer);
  return question.replace(/\[(\d+)\]/g, (m, n: string) => {
    const span = spans[Number(n) - 1];
    return span === undefined ? m : `{{${span}}}`;
  });
}

const atLeastTwo = (rows: string[]) => (rows.length >= 2 ? rows : [...rows, ...Array(2 - rows.length).fill("")]);

/** The stored idea as the editor's fields. A format the editor doesn't know reads as an empty short answer. */
export function editStateOf(idea: StoredIdea): AddContentState {
  const s: AddContentState = { ...EMPTY_ADD_CONTENT, listItems: ["", ""], orderItems: ["", ""], options: ["", ""], variants: [] };
  switch (idea.questionType) {
    case "SHORT":
      return { ...s, type: "SHORT", shortQuestion: idea.question, shortAnswer: idea.answer, shortCaseSensitive: idea.answerCaseSensitive };
    case "FORMULA":
      return { ...s, type: "FORMULA", formulaQuestion: idea.question, formulaAnswer: idea.answer };
    case "CLOZE":
      return { ...s, type: "CLOZE", clozeText: clozeTextOf(idea.question, idea.answer) };
    case "LIST":
      return { ...s, type: "LIST", listPrompt: decodeListQuestion(idea.question).prompt, listItems: atLeastTwo(decodeStringArray(idea.answer)) };
    case "ORDER":
      // The answer holds the right order; the question only a shuffle of it.
      return { ...s, type: "ORDER", orderPrompt: decodeOrderQuestion(idea.question).prompt, orderItems: atLeastTwo(decodeStringArray(idea.answer)) };
    case "NUMERIC": {
      const q = decodeNumericQuestion(idea.question);
      const a = decodeNumericAnswer(idea.answer);
      return {
        ...s,
        type: "NUMERIC",
        numericPrompt: q.prompt,
        numericUnit: q.unit ?? "",
        numericValue: Number.isFinite(a.value) ? String(a.value) : "",
        numericTolerance: Number.isFinite(a.tolerance) ? String(a.tolerance) : "0",
      };
    }
    case "MULTI": {
      const options = decodeStringArray(idea.question);
      const correct = options.indexOf(idea.answer);
      return { ...s, type: "MULTI", options: atLeastTwo(options), correctIndex: Math.max(0, correct) };
    }
    default:
      return s;
  }
}

/** The fields as IdeaContent: null until the chosen format is complete (the Save and Create buttons wait on it). */
export function contentOfAddState(s: AddContentState): IdeaContent | null {
  switch (s.type) {
    case "SHORT":
      if (!s.shortQuestion.trim() || !s.shortAnswer.trim() || shortAnswerProblem(s.shortAnswer)) return null;
      return { type: "SHORT", question: s.shortQuestion.trim(), answer: s.shortAnswer.trim(), caseSensitive: s.shortCaseSensitive };
    case "FORMULA":
      if (!s.formulaQuestion.trim() || !s.formulaAnswer.trim()) return null;
      // Normalised to mathjs on the way out: verifyFormula evaluates the stored string (mathjs passes unchanged).
      return { type: "FORMULA", question: s.formulaQuestion.trim(), answer: latexToMathjs(s.formulaAnswer) };
    case "CLOZE": {
      const text = s.clozeText.trim();
      if (!text || countClozeBlanks(text) === 0) return null;
      return { type: "CLOZE", text };
    }
    case "LIST": {
      const items = s.listItems.map((i) => i.trim()).filter(Boolean);
      if (!s.listPrompt.trim() || items.length < 2) return null;
      return { type: "LIST", prompt: s.listPrompt.trim(), items };
    }
    case "ORDER": {
      const items = s.orderItems.map((i) => i.trim()).filter(Boolean);
      if (!s.orderPrompt.trim() || items.length < 2) return null;
      return { type: "ORDER", prompt: s.orderPrompt.trim(), items };
    }
    case "NUMERIC": {
      const value = Number.parseFloat(s.numericValue);
      const tolerance = Number.parseFloat(s.numericTolerance || "0");
      if (!s.numericPrompt.trim() || !Number.isFinite(value) || !Number.isFinite(tolerance)) return null;
      return { type: "NUMERIC", prompt: s.numericPrompt.trim(), value, tolerance: Math.abs(tolerance), unit: s.numericUnit.trim() || undefined };
    }
    case "MULTI": {
      // The right option is read before the empty rows are dropped, so a blank row above it can't shift it.
      const right = (s.options[s.correctIndex] ?? "").trim();
      const cleaned = s.options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2 || !right) return null;
      return { type: "MULTI", options: cleaned, correct: right };
    }
  }
}

/** The prompt each format's fields hold (CLOZE and MULTI have none of their own). */
function promptOf(s: AddContentState): string {
  switch (s.type) {
    case "SHORT":
      return s.shortQuestion;
    case "FORMULA":
      return s.formulaQuestion;
    case "LIST":
      return s.listPrompt;
    case "ORDER":
      return s.orderPrompt;
    case "NUMERIC":
      return s.numericPrompt;
    default:
      return "";
  }
}

/** The one answer the fields hold, where there is one. */
function singleAnswerOf(s: AddContentState): string {
  if (s.type === "SHORT") return s.shortAnswer;
  if (s.type === "FORMULA") return s.formulaAnswer;
  if (s.type === "NUMERIC") return s.numericValue;
  if (s.type === "MULTI") return s.options[s.correctIndex] ?? "";
  return "";
}

const filled = (rows: readonly string[]) => rows.some((r) => r.trim());

/** A short answer written as a list ("He; Ne; Ar", or one per line) as rows; none when it is one answer. */
function rowsOfAnswer(answer: string): string[] {
  const rows = answer.split(/[;\n]/).map((r) => r.trim()).filter(Boolean);
  return rows.length >= 2 ? rows : [];
}

/**
 * The fields with the format changed to `to`. What was typed carries over where the new format has a place for it:
 * the prompt, a list's items as steps (and back), the one answer, and the right option. A field the new format
 * already holds is never overwritten, so switching back and forth loses nothing.
 */
export function switchEditFormat(s: AddContentState, to: AddFormat): AddContentState {
  if (s.type === to) return s;
  const prompt = promptOf(s);
  const answer = singleAnswerOf(s);
  const next: AddContentState = { ...s, type: to };
  const keep = (cur: string, carried: string) => (cur.trim() ? cur : carried);
  switch (to) {
    case "SHORT":
      next.shortQuestion = keep(s.shortQuestion, prompt);
      next.shortAnswer = keep(s.shortAnswer, answer || (s.type === "LIST" ? s.listItems.filter((i) => i.trim()).join("; ") : ""));
      break;
    case "FORMULA":
      next.formulaQuestion = keep(s.formulaQuestion, prompt);
      next.formulaAnswer = keep(s.formulaAnswer, answer);
      break;
    case "LIST":
      next.listPrompt = keep(s.listPrompt, prompt);
      if (!filled(s.listItems)) {
        if (s.type === "ORDER" && filled(s.orderItems)) next.listItems = [...s.orderItems];
        else if (s.type === "MULTI" && filled(s.options)) next.listItems = [...s.options];
        else if (rowsOfAnswer(answer).length) next.listItems = rowsOfAnswer(answer);
      }
      break;
    case "ORDER":
      next.orderPrompt = keep(s.orderPrompt, prompt);
      if (!filled(s.orderItems)) {
        if (s.type === "LIST" && filled(s.listItems)) next.orderItems = [...s.listItems];
        else if (s.type === "MULTI" && filled(s.options)) next.orderItems = [...s.options];
        else if (rowsOfAnswer(answer).length) next.orderItems = rowsOfAnswer(answer);
      }
      break;
    case "NUMERIC":
      next.numericPrompt = keep(s.numericPrompt, prompt);
      if (!s.numericValue.trim() && Number.isFinite(Number.parseFloat(answer))) next.numericValue = answer.trim();
      break;
    case "CLOZE":
      // A cloze needs its blanks marked by hand; the prompt is a starting point.
      next.clozeText = keep(s.clozeText, prompt);
      break;
    case "MULTI":
      if (!filled(s.options)) {
        const rows = s.type === "LIST" ? s.listItems : s.type === "ORDER" ? s.orderItems : answer.trim() ? [answer, ""] : ["", ""];
        next.options = atLeastTwo([...rows]);
        next.correctIndex = 0;
      }
      break;
  }
  return next;
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length <= EDIT_TEXT_MAX;
const rowsOf = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= EDIT_ROWS_MAX && v.every(isText) ? v.map((x) => x.trim()).filter(Boolean) : null;

export type CleanEdit = { ok: true; content: IdeaContent } | { ok: false; error: string };

/** What the browser sent, checked as the server must: any shape, any format; trimmed, or why it can't be saved. */
export function cleanEditContent(raw: unknown): CleanEdit {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Nothing to save." };
  const c = raw as Record<string, unknown>;
  const type = c.type;
  if (typeof type !== "string" || !isEditFormat(type)) return { ok: false, error: "That format can't be edited here." };
  switch (type) {
    case "SHORT": {
      if (!isText(c.question) || !isText(c.answer)) return { ok: false, error: "That's too long to save." };
      const question = c.question.trim();
      const answer = c.answer.trim();
      if (!question || !answer) return { ok: false, error: "Both the question and the answer are needed." };
      const problem = shortAnswerProblem(answer);
      if (problem) return { ok: false, error: problem };
      return { ok: true, content: { type: "SHORT", question, answer, caseSensitive: c.caseSensitive === true } };
    }
    case "FORMULA": {
      if (!isText(c.question) || !isText(c.answer)) return { ok: false, error: "That's too long to save." };
      const question = c.question.trim();
      const answer = latexToMathjs(c.answer);
      if (!question || !answer) return { ok: false, error: "Both the question and the formula are needed." };
      return { ok: true, content: { type: "FORMULA", question, answer } };
    }
    case "CLOZE": {
      if (!isText(c.text)) return { ok: false, error: "That's too long to save." };
      const text = c.text.trim();
      if (!text || countClozeBlanks(text) === 0) return { ok: false, error: "Wrap at least one part in {{double braces}} to blank it." };
      return { ok: true, content: { type: "CLOZE", text } };
    }
    case "LIST":
    case "ORDER": {
      const items = rowsOf(c.items);
      if (!isText(c.prompt) || !items) return { ok: false, error: "That's too long to save." };
      const prompt = c.prompt.trim();
      if (!prompt) return { ok: false, error: "The question is needed." };
      if (items.length < 2) return { ok: false, error: type === "LIST" ? "A list needs at least two items." : "An order needs at least two steps." };
      return { ok: true, content: { type, prompt, items } };
    }
    case "NUMERIC": {
      if (!isText(c.prompt) || (c.unit !== undefined && c.unit !== null && !isText(c.unit))) return { ok: false, error: "That's too long to save." };
      const prompt = c.prompt.trim();
      const value = typeof c.value === "number" ? c.value : NaN;
      const tolerance = typeof c.tolerance === "number" ? Math.abs(c.tolerance) : 0;
      if (!prompt) return { ok: false, error: "The question is needed." };
      if (!Number.isFinite(value) || !Number.isFinite(tolerance)) return { ok: false, error: "The value and the tolerance must be numbers." };
      const unit = typeof c.unit === "string" && c.unit.trim() ? c.unit.trim() : undefined;
      return { ok: true, content: { type: "NUMERIC", prompt, value, tolerance, unit } };
    }
    case "MULTI": {
      const options = rowsOf(c.options);
      if (!options || !isText(c.correct)) return { ok: false, error: "That's too long to save." };
      const correct = c.correct.trim();
      if (options.length < 2) return { ok: false, error: "Multiple choice needs at least two options." };
      if (!options.includes(correct)) return { ok: false, error: "Mark which option is right." };
      return { ok: true, content: { type: "MULTI", options, correct } };
    }
  }
}

/**
 * The Idea's answerCaseSensitive after an edit: a short answer says so itself; another format keeps the idea's own
 * choice while the format stays (cloze blanks and list items are graded with it too), and drops it when the format
 * changes (the add form only offers it on short answers).
 */
export function caseSensitiveAfterEdit(before: { questionType: string; answerCaseSensitive: boolean }, content: IdeaContent): boolean {
  if (content.type === "SHORT") return content.caseSensitive === true;
  return before.questionType === content.type ? before.answerCaseSensitive : false;
}
