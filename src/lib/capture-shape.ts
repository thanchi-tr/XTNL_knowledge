/**
 * How a parsed capture line becomes its stored row: its kind, schedule,
 * days, Must, inbox flag and note. Pure and client-importable (no Prisma):
 * the server's createTemplateCore (tasks.ts) stores exactly this, and the
 * sheet's where-preview can read the same function instead of mirroring it,
 * so the place a chip promises is the place the row lands.
 */
import type { DayKey } from "./life-day";
import type { DueKind, ParsedCapture, TaskKind } from "./life-types";
import { allowsCompulsory, parseRule } from "./recurrence";
import { startDayFor } from "./today-board";

/** An idea draft's answer ('idea: Q :: A') is kept whole up to the capture line's own cap. */
export const CAPTURE_NOTE_MAX = 500;

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** What a parsed line becomes on its row: its kind, schedule, days, Must, inbox flag and note. */
export interface CaptureShape {
  kind: TaskKind;
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  dueKind: DueKind | null;
  compulsory: boolean;
  inbox: boolean;
  /** An idea draft's answer ('idea: Q :: A'), whole up to CAPTURE_NOTE_MAX; null for everything else. */
  note: string | null;
}

/**
 * How createTemplateCore stores a parsed line, as a pure function of the
 * parse and the life day: the fields that decide where the row sits on the
 * board (scripts/capture-server-check.ts places real lines through it).
 */
export function captureShapeOf(parsed: ParsedCapture, today: DayKey): CaptureShape {
  const kind: TaskKind = parsed.mode === "GOAL" ? "GOAL" : parsed.mode === "IDEA" ? "IDEA_DRAFT" : parsed.kind;
  const rule = kind === "GOAL" || kind === "IDEA_DRAFT" ? null : parseRule(parsed.recurrence);
  const recurrence = rule ? parsed.recurrence : null;
  const parsedDue = parsed.dueDay && KEY_RE.test(parsed.dueDay) ? parsed.dueDay : null;
  const parsedDueKind: DueKind | null = parsedDue ? (parsed.dueKind ?? "PLANNED") : null;
  // A habit starts on its phase ('every 2 weeks on mon' → the coming Monday)
  // and carries no due day of its own; a one-off or a goal keeps its date.
  const startDay = rule ? startDayFor({ recurrence, dueDay: parsedDue, dueKind: parsedDueKind }, today) : today;
  const dueDay = rule ? null : parsedDue;
  const dueKind: DueKind | null = rule ? null : parsedDueKind;
  // A duty needs something to be judged against: a schedule or a deadline.
  // AFTER rules move with the last completion, so they never can.
  const compulsory =
    parsed.compulsory && kind !== "GOAL" && kind !== "IDEA_DRAFT" && (rule ? allowsCompulsory(rule) : dueKind === "DEADLINE");
  const answer = kind === "IDEA_DRAFT" && typeof parsed.answer === "string" ? parsed.answer.trim().slice(0, CAPTURE_NOTE_MAX) : "";
  return { kind, recurrence, startDay, dueDay, dueKind, compulsory, inbox: parsed.inbox || kind === "IDEA_DRAFT", note: answer || null };
}
