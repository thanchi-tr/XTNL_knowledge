/**
 * The capture sheet's view rules, as pure functions (no React, no DOM), so
 * scripts/today-ui-check.ts can hold them.
 */
import { isTypingTarget, type KeyLike, type TargetLike } from "../../lib/capture-parse";
import type { DayKey } from "../../lib/life-day";
import type { ParsedCapture } from "../../lib/life-types";
import { nextDue, parseRule } from "../../lib/recurrence";
import { dayName, startDayFor } from "../../lib/today-board";

/**
 * Where a repeating capture lands when it is not due today: 'Next: Thu'.
 *
 * A habit captured on a day it does not run is on no lane of today's board,
 * so the toast says when it will be. The first day is the server's own
 * (startDayFor: the phase the line gave — 'every 2 weeks on mon' starts on
 * that Monday — or today). Null when the capture is due today (its row is
 * on the board), is not repeating, is a TARGET habit (eligible every day),
 * or was ticked as done.
 */
export function nextOccurrenceNote(
  parsed: Pick<ParsedCapture, "recurrence" | "dueDay" | "dueKind" | "doneNow" | "inbox" | "kind">,
  today: DayKey
): string | null {
  if (!parsed.recurrence || parsed.doneNow || parsed.inbox || parsed.kind === "GOAL" || parsed.kind === "IDEA_DRAFT") return null;
  const rule = parseRule(parsed.recurrence);
  if (!rule || rule.kind === "TARGET") return null;
  const start = startDayFor(parsed, today);
  const next = nextDue(rule, start, today, null);
  if (!next || next <= today) return null;
  return `Next: ${dayName(next, today)}`;
}

/**
 * Ctrl/Cmd+Z undoes the capture the toast is showing — the keyboard path
 * for someone who captured with 'c' and Enter. Never while typing
 * somewhere (the field's own undo wins), never with Shift (redo) or Alt,
 * never for a key another handler already took, and never mid-review,
 * where any key also dismisses the card's result.
 */
export function isUndoCaptureKey(e: KeyLike, target: TargetLike | null | undefined, reviewSessionActive: boolean): boolean {
  if (e.defaultPrevented || e.isComposing || e.repeat || reviewSessionActive) return false;
  if (e.key.toLowerCase() !== "z" || e.shiftKey || e.altKey) return false;
  if (e.ctrlKey === e.metaKey) return false;
  return !isTypingTarget(target);
}

/**
 * "To Inbox": the line with the parser's own inbox mark closing it (a
 * trailing " ?", rule 10 in capture-parse.ts), so the save goes through the
 * same grammar as a typed '?'. The space keeps it apart from a '?' the
 * player chose to keep as text.
 */
export function toInboxLine(text: string): string {
  return `${text.trimEnd()} ?`;
}
