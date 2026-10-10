/**
 * A task's or habit's steps (subtasks): the pure rules. Shared by the server (src/lib/subtasks-server.ts, the tick in
 * src/lib/tasks.ts stepTickCore) and the board.
 *
 *   - No task has steps until the user adds them in its drawer (Edit → Steps). Capture never makes one.
 *   - Ticking steps pays a share of the task's own price: done ÷ total, through the K factor of its one TASK row
 *     (life-grade priceTask), re-priced each time the share changes. Every step done pays the whole price.
 *   - A compulsory task (a must) pays nothing for a part: only once every step is done, and then in full.
 *   - Once a task was paid by a whole tick (Done, its minimum, a make-up), its steps are a checklist only.
 */
import type { StepShare } from "./life-types";

/** At most this many steps on one task. */
export const STEPS_MAX = 12;
/** A step's title, at most. */
export const STEP_TITLE_MAX = 80;

export const STEPS_NOT_READY = "Steps need a one-time database update first.";

export interface Subtask {
  id: string;
  title: string;
  ord: number;
}

/** A template's steps and which of them are ticked on the board's day. */
export interface SubtaskDay {
  items: Subtask[];
  /** The ids ticked on the day (only ids among `items`). */
  done: string[];
}

/** What a set of ticked steps pays: nothing, or its share of the price. */
export type StepPay = { kind: "none" } | { kind: "pay"; steps: StepShare };

/**
 * The rule. Nothing ticked pays nothing; a must pays only when every step is done (then in full); anything else pays
 * the share ticked.
 */
export function stepPayOf(p: { compulsory: boolean; done: number; total: number }): StepPay {
  const total = Math.max(0, Math.floor(p.total));
  const done = Math.max(0, Math.min(total, Math.floor(p.done)));
  if (total === 0 || done === 0) return { kind: "none" };
  if (p.compulsory && done < total) return { kind: "none" };
  return { kind: "pay", steps: { done, total } };
}

/** "2 of 5 steps". */
export function stepsLine(done: number, total: number): string {
  return `${done} of ${total} step${total === 1 ? "" : "s"}`;
}

/** A must's note under its steps. */
export const MUST_STEPS_NOTE = "A must pays only when every step is done.";
/** A task's note under its steps. */
export const PART_STEPS_NOTE = "Each step you tick pays its share of the task.";

/** A step's title as typed: trimmed, inner whitespace folded, at most STEP_TITLE_MAX; null when empty. */
export function cleanStepTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim().slice(0, STEP_TITLE_MAX).trim();
  return t.length > 0 ? t : null;
}

/** Which tasks can have steps: tasks and habits, never a goal, an idea draft or a study task (reviews complete it). */
export function stepsAllowed(t: { kind: string; autoMetric: string | null }): boolean {
  return (t.kind === "TASK" || t.kind === "HABIT") && !t.autoMetric;
}

/** The next tick set: one step on or off, or every step on (null id, done) or off (null id, not done). */
export function nextTicks(ids: readonly string[], ticked: ReadonlySet<string>, change: { stepId: string | null; done: boolean }): Set<string> {
  const valid = new Set(ids);
  const out = new Set([...ticked].filter((id) => valid.has(id)));
  if (change.stepId === null) return change.done ? new Set(ids) : new Set();
  if (!valid.has(change.stepId)) return out;
  if (change.done) out.add(change.stepId);
  else out.delete(change.stepId);
  return out;
}

/** Whether a stored receipt was paid through steps (so it is re-priced as they change). */
export function paidByStepsOf(receipt: unknown): StepShare | null {
  if (!receipt || typeof receipt !== "object") return null;
  const s = (receipt as { steps?: unknown }).steps;
  if (!s || typeof s !== "object") return null;
  const { done, total } = s as { done?: unknown; total?: unknown };
  return typeof done === "number" && typeof total === "number" ? { done, total } : null;
}
