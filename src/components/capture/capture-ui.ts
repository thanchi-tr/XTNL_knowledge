/**
 * The capture sheet's view rules, as pure functions (no React, no DOM), so
 * scripts/today-ui-check.ts can hold them. capture.md is the spec; the
 * contracts the sheet consumes are docs/life-plan/capture-contracts.md.
 *
 * What lives here:
 *   - the Enter rule (enterAction): which key saves, which stays open;
 *   - the 'Added here' list (addedReducer) and what the dock says when the
 *     sheet closes (dockToastChoice, summaryCopy);
 *   - Edit (editFill) and the pending line that carries `replaces` (and
 *     its life day: pendingDayNote); the lock an edit on its way puts on
 *     its capture's Edit and Undo (replacingOf);
 *   - the tap-to-add grammar row (insertRowChips, insertMenuOptions,
 *     applyInsert) and the block-once Must gate (mustGate);
 *   - the suggestion row (caretContext, goalSuggestions, tagSuggestions);
 *   - the toast copy by case (toastCopy), the paste split
 *     (splitPastedLines) and its where-guess (wherePreviewOf);
 *   - the vocabulary cache and its refresh scheduler, the Back-closes
 *     history rule, the '#capture=' link, the duplicate note.
 *
 * Nothing here reads a clock, storage or the DOM: every input is a
 * parameter, so the checks can drive each rule with fixed values.
 */
import {
  MAX_CAPTURE_CHARS,
  formatXp,
  isTypingTarget,
  parseCapture,
  sanitizeCaptureInput,
  shiftReverted,
  type CaptureSpan,
  type KeyLike,
  type TargetLike,
} from "../../lib/capture-parse";
import { addDays, todayKey, weekdayOf, type DayKey } from "../../lib/life-day";
import { CAPTURE_BATCH_MAX, CAPTURE_UNDO_MS, type BoardPlace, type ParsedCapture } from "../../lib/life-types";
import { normTitleOf } from "../../lib/life-lexicon";
import { captureShapeOf } from "../../lib/capture-shape";
import { nextDue, parseRule } from "../../lib/recurrence";
import { dayName, placeOf, shortDate, startDayFor, weekdayName, type BoardTemplate } from "../../lib/today-board";
import type { CaptureActiveTitle, CapturedItem } from "../../app/actions/capture";
import type { WeightUnit } from "../../lib/weight";
import { weightToastCopy } from "./weight-capture";

/**
 * Where a repeating capture lands when it is not due today: 'Next: Thu'.
 *
 * Kept for its checks; the toast now names the server's own place
 * (CapturedItem.where, 'Habits · next Thu'), which covers this case. The
 * first day is the server's own (startDayFor). Null when the capture is
 * due today, is not repeating, is a TARGET habit, or was ticked as done.
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

// ── Enter: save and stay, or save and close (burst capture) ──────────────

export type EnterSource = "key" | "submit" | "button";
export type EnterAction = "save-stay" | "save-close" | "close" | "wait-composition" | "ignore";

/**
 * What one press does.
 *
 * Desktop (fine pointer) is as it was: Enter saves and closes, Shift+Enter
 * saves and stays, and an Enter that commits a Telex composition is not a
 * submit. On a phone (coarse pointer) the keyboard's action key saves and
 * stays, so three lines cost one keyboard rise: there is no Shift+Enter on
 * a soft keyboard. An action key pressed mid-composition waits for the
 * composition to end and then saves once. The Add button (and To Inbox)
 * always saves and closes.
 *
 * `done`: the primary button reads Done (primaryAction: an empty line on a
 * phone after lines went in this opening). The action key then does what
 * Done does and closes the sheet, so a burst of n lines costs n + 1
 * presses of the same key (the 300 ms guard keeps the press that saved the
 * last line from also closing).
 *
 * `source` is where the press arrived: the input's keydown, the form's
 * implicit 'submit' (a keyboard whose action key is 'Unidentified'/229
 * and never reaches keydown as Enter), or a button.
 */
export function enterAction(p: { coarse: boolean; shift: boolean; composing: boolean; source: EnterSource; done?: boolean }): EnterAction {
  if (p.source === "button") return "save-close";
  if (p.coarse) {
    if (p.composing) return "wait-composition";
    return p.done ? "close" : "save-stay";
  }
  if (p.composing) return "ignore";
  return p.shift ? "save-stay" : "save-close";
}

/** A keydown and the form's implicit submit can both arrive for one press; the second inside this window is the same press. */
export const SUBMIT_GUARD_MS = 300;

export function submitAllowed(lastSubmitAt: number, now: number): boolean {
  return now - lastSubmitAt >= SUBMIT_GUARD_MS;
}

/**
 * The primary button: what it says, and whether it only closes ('Done': an
 * empty line after lines were added on a phone). `sentThisOpening` counts
 * the lines sent, not the ones the server has confirmed yet, so Done is
 * there the moment the line clears (a slow answer never leaves a disabled
 * Add in its place).
 */
export function primaryAction(p: {
  editing: boolean;
  coarse: boolean;
  empty: boolean;
  sentThisOpening: number;
  parsed: Pick<ParsedCapture, "inbox" | "kind" | "doneNow"> | null;
}): { label: string; done: boolean } {
  if (p.coarse && p.empty && p.sentThisOpening > 0 && !p.editing) return { label: "Done", done: true };
  if (p.editing) return { label: "Save change", done: false };
  const parsed = p.parsed;
  if (!parsed || p.empty) return { label: "Add", done: false };
  if (parsed.inbox || parsed.kind === "IDEA_DRAFT") return { label: "Add to Inbox", done: false };
  if (parsed.kind === "GOAL") return { label: "Add goal", done: false };
  if (parsed.doneNow) return { label: "Add as done", done: false };
  return { label: "Add", done: false };
}

/** The phone's footer line, in place of the key hints a touch screen has no use for. */
export const TOUCH_HINT = "Enter adds the next line · Add closes";
/** The desktop's. */
export const KEY_HINT = "Enter saves · Shift+Enter saves and stays · Esc closes";
/** The grammar, as one line of hint from 600 px while the line is empty (the insert row teaches it below 600). */
export const LEGEND = "! must · ~30m · daily · every mon,thu · 3x/week · by fri · tmr · x done · idea: Q :: A · goal: · #body · ^goal · ? inbox · weight 72.4";
/** 'Tap here to type': a phone opened from the home-screen shortcut whose keyboard did not rise on its own. */
export const POCKET_PLACEHOLDER = "Tap here to type";
export const POCKET_WAIT_MS = 600;

// ── The 'Added here' list ─────────────────────────────────────────────────

/** More than this many is not one sitting; the oldest drop off first. */
export const ADDED_MAX = 30;
/** An undone row reads 'Removed · <title>' this long, then goes. */
export const REMOVED_SHOW_MS = 4_000;
/** Rows shown before '+N more': under 600 px and from 600. */
export const ADDED_SHOWN_COMPACT = 3;
export const ADDED_SHOWN_WIDE = 5;

/** A line exactly as it was sent: its text and the spans the player turned back into text. */
export interface SentLine {
  text: string;
  reverted: CaptureSpan[];
}

export interface AddedEntry {
  /** The line's nonce (its capture key). */
  key: string;
  item: CapturedItem;
  /** What was sent. Edit refills exactly this — never a line rebuilt from the title. */
  line: SentLine;
  /**
   * When the line was sent (epoch ms). The server's ten minutes start at its
   * insert, a moment later, so this clock closes Edit and Undo slightly early,
   * never late.
   */
  at: number;
  /** Set once Undo went through. */
  removedAt?: number;
}

export type AddedAction =
  | { type: "add"; entry: AddedEntry }
  /** An edit landed: the old capture's row gives way to the new one. */
  | { type: "replace"; oldId: string; entry: AddedEntry }
  | { type: "removed"; id: string; now: number }
  /** The capture is no longer the row on the board (an edit replaced it elsewhere): its row goes, with no 'Removed'. */
  | { type: "drop"; id: string }
  | { type: "prune"; now: number };

function liveEntry(e: AddedEntry, now: number): boolean {
  if (e.removedAt !== undefined) return now - e.removedAt < REMOVED_SHOW_MS;
  return now - e.at < CAPTURE_UNDO_MS;
}

/**
 * The list, newest first. It lives in memory for the page's life (the
 * sheet is mounted once in the root layout, so it survives closing and
 * reopening), one row per capture, and is pruned at CAPTURE_UNDO_MS — the
 * moment Edit and Undo stop being on offer.
 */
export function addedReducer(state: readonly AddedEntry[], action: AddedAction): AddedEntry[] {
  switch (action.type) {
    case "add": {
      const rest = state.filter((e) => e.item.id !== action.entry.item.id && e.key !== action.entry.key);
      return [action.entry, ...rest].slice(0, ADDED_MAX);
    }
    case "replace": {
      const rest = state.filter((e) => e.item.id !== action.oldId && e.item.id !== action.entry.item.id && e.key !== action.entry.key);
      return [action.entry, ...rest].slice(0, ADDED_MAX);
    }
    case "removed":
      return state.map((e) => (e.item.id === action.id && e.removedAt === undefined ? { ...e, removedAt: action.now } : e));
    case "drop":
      return state.filter((e) => e.item.id !== action.id);
    case "prune": {
      const next = state.filter((e) => liveEntry(e, action.now));
      return next.length === state.length ? [...state] : next;
    }
  }
}

/** When the next row expires (for one timer), or null. */
export function nextPruneAt(state: readonly AddedEntry[]): number | null {
  let at: number | null = null;
  for (const e of state) {
    const t = e.removedAt !== undefined ? e.removedAt + REMOVED_SHOW_MS : e.at + CAPTURE_UNDO_MS;
    if (at === null || t < at) at = t;
  }
  return at;
}

/** Edit and Undo are on offer while the capture is under ten minutes old and not undone. */
export function canEditEntry(e: AddedEntry, now: number): boolean {
  return e.removedAt === undefined && now - e.at < CAPTURE_UNDO_MS;
}

/** The rows on show: 3 under 600 px, 5 from 600, the rest behind '+N more'. */
export function visibleAdded<T>(entries: readonly T[], wide: boolean, showAll: boolean): { shown: T[]; more: number } {
  const limit = wide ? ADDED_SHOWN_WIDE : ADDED_SHOWN_COMPACT;
  if (showAll || entries.length <= limit) return { shown: [...entries], more: 0 };
  return { shown: entries.slice(0, limit), more: entries.length - limit };
}

/** The live region's sentence for one add. */
export function addedAnnouncement(title: string, where: string, addedThisOpening: number): string {
  return `Added ${title} → ${where}. ${addedThisOpening} added.`;
}

// ── The dock when the sheet closes ────────────────────────────────────────

export type DockChoice = "none" | "single" | "summary";

/** 0 lines added in this opening: nothing new; 1: today's toast with Undo; 2 or more: 'N added' with Show. */
export function dockToastChoice(added: number): DockChoice {
  if (added <= 0) return "none";
  return added === 1 ? "single" : "summary";
}

export const SUMMARY_BODY_MAX = 90;

/** 'N added', and the titles in the order they were added, joined with ' · ' and cut to fit. */
export function summaryCopy(titles: readonly string[]): { title: string; body: string } {
  const joined = titles.join(" · ");
  const body = joined.length > SUMMARY_BODY_MAX ? `${joined.slice(0, SUMMARY_BODY_MAX - 1).trimEnd()}…` : joined;
  return { title: `${titles.length} added`, body };
}

// ── Edit a line just saved ────────────────────────────────────────────────

export const EDIT_BUSY_NOTE = "Finish or clear the line first.";
export const EDIT_TOO_LATE = "Too late to edit (10 min). Save it as a new line?";
export const EDIT_GONE = "That capture is gone. Save it as a new line?";
/** A row whose edit is on its way: Edit and Undo wait for it (a second edit or an Undo now would leave two rows). */
export const EDIT_SAVING_NOTE = "Saving the edit…";
/** A row whose edit was not saved and waits in the unsent list. */
export const EDIT_UNSAVED_NOTE = "Its edit didn't save. See it below.";

export type EditFill = { ok: true; text: string; reverted: CaptureSpan[]; caret: number } | { ok: false; reason: "busy" | "expired" | "pending" };

/** Where a line that replaces a capture stands: sending now, queued to retry, or failed and listed. */
export type ReplacingState = "sending" | "queued" | "failed";

/**
 * The captures an edit is on its way to replace (an unsent line or a line
 * in flight carrying `replaces`), each with what its row says meanwhile.
 * While a capture is in here, its Edit and Undo are off — on the 'Added
 * here' row and on the dock's toast: the server would read a second edit
 * (or an Undo) of a row the first edit has already archived as a fresh
 * capture, and the board would end up with two rows.
 */
export function replacingOf(lines: Iterable<{ replaces?: string; state: ReplacingState }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const l of lines) {
    if (!l.replaces) continue;
    if (l.state !== "failed") out.set(l.replaces, EDIT_SAVING_NOTE);
    else if (!out.has(l.replaces)) out.set(l.replaces, EDIT_UNSAVED_NOTE);
  }
  return out;
}

/**
 * Edit fills an EMPTY line with the capture's exact sent text and reverted
 * spans (kept with the row, never rebuilt from the title), caret at the
 * end. A line with text in it is left alone: the note says to finish or
 * clear it first. A capture whose earlier edit has not landed yet is not
 * offered at all (`replacing`, from replacingOf).
 */
export function editFill(currentLine: string, entry: AddedEntry, now: number, replacing?: ReadonlyMap<string, string>): EditFill {
  if (replacing?.has(entry.item.id)) return { ok: false, reason: "pending" };
  if (currentLine.trim()) return { ok: false, reason: "busy" };
  if (!canEditEntry(entry, now)) return { ok: false, reason: "expired" };
  return { ok: true, text: entry.line.text, reverted: entry.line.reverted.map((s) => ({ start: s.start, end: s.end })), caret: entry.line.text.length };
}

export const EDIT_EXPIRED_NOTE = "Too late to edit (10 min).";

/** What the sheet says when Edit is not on offer, by editFill's reason (`lock`: the row's replacingOf note). */
export function editRefusalNote(reason: "busy" | "expired" | "pending", lock?: string | null): string {
  if (reason === "pending") return lock ?? EDIT_SAVING_NOTE;
  return reason === "busy" ? EDIT_BUSY_NOTE : EDIT_EXPIRED_NOTE;
}

/** An Undo the server refused because an edit had already replaced the row ('gone'): honest, never 'Removed'. */
export function undoGoneCopy(title: string, serverMessage?: string): { head: string; message: string } {
  // The server says which 'gone' it was (an edit replaced the row, or the row no longer exists); its sentence wins.
  const why = serverMessage?.trim();
  return { head: "Not undone", message: why ? `“${title}”: ${why}` : `“${title}” is no longer the row on the board: an edit replaced it.` };
}

/** A line on its way to the server, as kept in local storage until the server confirms it. */
export interface PendingLine extends SentLine {
  /** The capture key the server dedupes a retry on. Never repeats, across tabs and devices. */
  nonce: string;
  /** When it was stamped (epoch ms). */
  at: number;
  /** An edit: the capture this line replaces. A retry after a reload repeats the same recapture. */
  replaces?: string;
  /**
   * The life day it was stamped on. The server reads 'tmr', 'fri' and a
   * done-now tick against the day it receives the line, so a line is only
   * ever sent on its own on this day (an entry stored without one counts
   * as another day's).
   */
  day?: DayKey;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Stamps a line for sending. `rand` is a few random characters (the caller
 * draws them); the nonce fits the server's key rule (4–64 of [A-Za-z0-9:_-]).
 * The line carries the life day of `now` (todayKey).
 */
export function stampLine(line: SentLine, seq: number, now: number, rand: string, replaces?: string | null): PendingLine {
  const salt = rand.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "0";
  const out: PendingLine = { text: line.text, reverted: line.reverted, nonce: `${now.toString(36)}-${seq.toString(36)}-${salt}`, at: now, day: todayKey(new Date(now)) };
  if (replaces && ID_RE.test(replaces)) out.replaces = replaces;
  return out;
}

/** The stored pending list, read back defensively: anything malformed is dropped, a valid entry passes unchanged. */
export function parsePendingList(raw: unknown): PendingLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const { text, reverted, nonce, at, replaces, day } = p as Record<string, unknown>;
    if (typeof nonce !== "string" || !/^[A-Za-z0-9:_-]{4,64}$/.test(nonce) || typeof at !== "number" || !Number.isFinite(at)) return [];
    const clean = sanitizeCaptureInput(text, reverted);
    if (!clean.text.trim()) return [];
    const line: PendingLine = { ...clean, nonce, at };
    if (typeof replaces === "string" && ID_RE.test(replaces)) line.replaces = replaces;
    if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) line.day = day;
    return [line];
  });
}

/**
 * Whether a stored or queued line may go on its own: only on the life day
 * it was captured. Null when it may; otherwise the note its unsent row
 * shows ('Captured on Wed 30 Sep · check its day, then Retry'). Such a line
 * is never sent automatically: Edit refills it (the chips redraw for
 * today) and a manual Retry sends it as it stands.
 */
export function pendingDayNote(p: Pick<PendingLine, "day">, today: DayKey): string | null {
  if (p.day === today) return null;
  const when = p.day ? `${weekdayName(p.day)} ${shortDate(p.day)}` : "an earlier day";
  return `Captured on ${when} · check its day, then Retry`;
}

// ── The tap-to-add grammar row ────────────────────────────────────────────

/** The parse field an insert fills (and replaces, when the line already has one). */
export type InsertField = "date" | "recurrence" | "compulsory" | "duration" | "parent" | "inbox" | "mode";

export interface Insert {
  /** The words added: 'tmr', 'every thu', '30m', '^"Run a marathon"', '!', '?', 'idea: '. */
  text: string;
  field: InsertField;
  /** Also close the line with ' !' (the Must options: 'by fri !'), unless it already has one. */
  must?: boolean;
}

export type InsertMenu = "when" | "repeat" | "must" | "time" | "goal";

/** Each ▾ menu's name, for its opener and the live note. */
export const MENU_NAME: Record<InsertMenu, string> = { when: "When", repeat: "Repeat", must: "Must", time: "Time", goal: "Goal" };

/** What the live region says when a ▾ menu opens ('When options') or the row comes back ('Back'). */
export function menuNote(menu: InsertMenu | null): string {
  return menu ? `${MENU_NAME[menu]} options` : "Back";
}

export interface InsertChip {
  id: string;
  label: string;
  /** A ▾ chip: swaps the row for this menu's options. */
  menu?: InsertMenu;
  insert?: Insert;
  disabled?: boolean;
  /** The chip's whole accessible name, when the label alone would read badly ('Tmr · Fri'). */
  name?: string;
  /** Not a chip: a quiet label for the chips after it ('Link to'). */
  eyebrow?: boolean;
}

const WD_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEAK_DAYS = new Set([6, 7]);

function wdWord(key: DayKey): string {
  return WD_SHORT[weekdayOf(key)].toLowerCase();
}

/** 'by today' must not repeat its own 'by' when it lands on a 'by …' already there. */
const DEADLINE_PREFIX = /^(by|due|until|before|trước|truoc|hạn chót|han chot)\s+/i;

function hasToken(parsed: ParsedCapture, field: string): boolean {
  return parsed.tokens.some((t) => t.field === field);
}

/** A planned date or deadline, or a schedule with fixed days: what a Must is judged on. */
export function hasDayToJudge(parsed: ParsedCapture): boolean {
  if (parsed.dueDay) return true;
  const rule = parseRule(parsed.recurrence);
  return !!rule && rule.kind !== "TARGET" && rule.kind !== "AFTER";
}

/**
 * The row's chips for this line: When ▾ · Repeat ▾ · Must · Time ▾ · Goal ▾
 * · Inbox · Idea. A goal line ('goal:') keeps When only (a goal has no
 * schedule, Must, estimate or parent); an idea line has no row (its word
 * hints take the slot). Must inserts ' !' straight away when the line
 * already has a day to be judged on, and otherwise opens the four ways to
 * give it one. Inbox hides on a line already ending in '?', Idea on a line
 * that already has a mode prefix, Must on a line already compulsory or
 * bound for the Inbox (which is off the board, where a Must is judged).
 *
 * `narrow` (under 400 px, the Fold's cover screen): on a line without a
 * goal, Inbox and Idea come before Goal ▾, so the one-tap chips sit nearer
 * the first screenful than the menu that is used least.
 */
export function insertRowChips(parsed: ParsedCapture, text: string, opts: { narrow?: boolean } = {}): InsertChip[] {
  if (parsed.mode === "IDEA") return [];
  const when: InsertChip = { id: "when", label: "When", menu: "when" };
  if (parsed.mode === "GOAL") return [when];
  const chips: InsertChip[] = [when, { id: "repeat", label: "Repeat", menu: "repeat" }];
  if (!parsed.compulsory && !parsed.inbox) {
    chips.push(
      hasDayToJudge(parsed) && !hasToken(parsed, "compulsory")
        ? { id: "must", label: "Must", insert: { text: "!", field: "compulsory" } }
        : { id: "must", label: "Must", menu: "must" }
    );
  }
  chips.push({ id: "time", label: "Time", menu: "time" });
  const goal: InsertChip = { id: "goal", label: "Goal", menu: "goal" };
  const tail: InsertChip[] = [];
  if (!parsed.inbox && !text.trimEnd().endsWith("?")) tail.push({ id: "inbox", label: "Inbox", insert: { text: "?", field: "inbox" } });
  if (!hasToken(parsed, "mode")) tail.push({ id: "idea", label: "Idea", insert: { text: "idea: ", field: "mode" } });
  if (opts.narrow && !hasToken(parsed, "parent")) chips.push(...tail, goal);
  else chips.push(goal, ...tail);
  return chips;
}

/** '^"Run a marathon"' (quoted when the title has a space), '^marathon' otherwise. */
export function goalInsertText(title: string): string {
  const clean = title.replace(/"/g, "").trim();
  return /\s/.test(clean) ? `^"${clean}"` : `^${clean}`;
}

/** The four ways to give a Must its day: by today · by tmr · by fri · every <today's weekday>. */
export function mustFixInserts(today: DayKey): { id: string; label: string; insert: Insert }[] {
  const wd = wdWord(today);
  return [
    { id: "by-today", label: "By today", insert: { text: "by today", field: "date" } },
    { id: "by-tmr", label: "By tmr", insert: { text: "by tmr", field: "date" } },
    { id: "by-fri", label: "By Fri", insert: { text: "by fri", field: "date" } },
    { id: `every-${wd}`, label: `Every ${WD_SHORT[weekdayOf(today)]}`, insert: { text: `every ${wd}`, field: "recurrence" } },
  ];
}

export const TIME_INSERTS = ["10m", "15m", "30m", "45m", "1h", "2h"] as const;

const WD_LONG = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * A ▾ menu's options. When: Today, 'Tmr · Fri' (one chip for tomorrow,
 * named with its weekday), the five days after tomorrow by name (a weak
 * day reads 'on sat' / 'on sun', which the parser always takes for a day),
 * Next week. Repeat: Daily, Weekdays, Every <today's weekday>, 3×/week,
 * Weekly. Must: the four fixes, each closing the line with '!'. Time:
 * 10m … 2h. Goal: 'New goal' (the 'goal: ' prefix; not on a line that
 * already has a mode prefix), then the open goals to link under a quiet
 * 'Link to' (vocab.goals), or a disabled 'No open goals' (or 'Loading
 * goals…' before they arrive).
 */
export function insertMenuOptions(
  menu: InsertMenu,
  ctx: { today: DayKey; goals: readonly { id: string; title: string }[] | null; hasMode?: boolean }
): InsertChip[] {
  const { today } = ctx;
  switch (menu) {
    case "when": {
      const tmr = addDays(today, 1);
      const days: InsertChip[] = [];
      for (let i = 2; i <= 6; i++) {
        const key = addDays(today, i);
        const wd = weekdayOf(key);
        const word = wdWord(key);
        days.push({ id: `when-${word}`, label: WD_SHORT[wd], insert: { text: WEAK_DAYS.has(wd) ? `on ${word}` : word, field: "date" } });
      }
      const tmrInsert: Insert = { text: "tmr", field: "date" };
      return [
        { id: "when-today", label: "Today", insert: { text: "today", field: "date" } },
        {
          id: "when-tmr",
          label: `Tmr · ${WD_SHORT[weekdayOf(tmr)]}`,
          name: `Tomorrow, ${WD_LONG[weekdayOf(tmr)]}: ${insertChipLabel(tmrInsert)}`,
          insert: tmrInsert,
        },
        ...days,
        { id: "when-next-week", label: "Next week", insert: { text: "next week", field: "date" } },
      ];
    }
    case "repeat": {
      const wd = wdWord(today);
      return [
        { id: "repeat-daily", label: "Daily", insert: { text: "daily", field: "recurrence" } },
        { id: "repeat-weekdays", label: "Weekdays", insert: { text: "weekdays", field: "recurrence" } },
        { id: `repeat-every-${wd}`, label: `Every ${WD_SHORT[weekdayOf(today)]}`, insert: { text: `every ${wd}`, field: "recurrence" } },
        { id: "repeat-3w", label: "3×/week", insert: { text: "3x/week", field: "recurrence" } },
        { id: "repeat-weekly", label: "Weekly", insert: { text: "weekly", field: "recurrence" } },
      ];
    }
    case "must":
      return mustFixInserts(today).map((f) => ({ id: `must-${f.id}`, label: f.label, insert: { ...f.insert, must: true } }));
    case "time":
      return TIME_INSERTS.map((t) => ({ id: `time-${t}`, label: t, insert: { text: t, field: "duration" } }));
    case "goal": {
      const out: InsertChip[] = [];
      if (!ctx.hasMode) {
        const newGoal: Insert = { text: "goal: ", field: "mode" };
        out.push({ id: "goal-new", label: "New goal", name: `New goal: ${insertChipLabel(newGoal)}`, insert: newGoal });
      }
      if (ctx.goals === null) out.push({ id: "goal-loading", label: "Loading goals…", disabled: true });
      else if (ctx.goals.length === 0) out.push({ id: "goal-none", label: "No open goals", disabled: true });
      else {
        out.push({ id: "goal-links", label: "Link to", eyebrow: true });
        for (const g of ctx.goals) {
          out.push({ id: `goal-to-${g.id}`, label: g.title, name: `Link to the goal “${g.title}”`, insert: { text: goalInsertText(g.title), field: "parent" } });
        }
      }
      return out;
    }
  }
}

/**
 * Where the line's trailing marks begin: a closing ' ?' or ' !' (or '?!'
 * the parser read off the last word) stays last when something is added.
 * A '!' or '?' that is only part of a word ('wow!') is not a mark.
 */
export function tailStart(text: string, parsed: ParsedCapture): number {
  const isMark = (c: string | undefined) => c === "!" || c === "?";
  let start = text.trimEnd().length;
  for (;;) {
    let s = start;
    while (s > 0 && isMark(text[s - 1])) s--;
    if (s === start) break;
    const alone = s === 0 || /\s/.test(text[s - 1]);
    const read = parsed.tokens.some((t) => (t.field === "compulsory" || t.field === "inbox") && t.start < start && t.end > s);
    if (!alone && !read) break;
    start = s;
    if (!alone) break;
    let w = s;
    while (w > 0 && /\s/.test(text[w - 1])) w--;
    if (w === 0 || !isMark(text[w - 1])) break;
    start = w;
  }
  return start;
}

interface Slot {
  start: number;
  end: number;
  /** A deadline's own word ('by', 'due', 'until', 'before'…), kept when a day replaces it. */
  prefix: string | null;
  deadline: boolean;
}

/** The token an insert of this field replaces, if the line has one. A date and a deadline are one slot. */
function slotOf(parsed: ParsedCapture, field: InsertField, text: string): Slot | null {
  const fields: string[] = field === "date" ? ["date", "deadline"] : field === "recurrence" || field === "duration" || field === "parent" ? [field] : [];
  const t = parsed.tokens.find((x) => fields.includes(x.field));
  if (!t) return null;
  const words = text.slice(t.start, t.end);
  const m = t.field === "deadline" ? DEADLINE_PREFIX.exec(words) : null;
  return { start: t.start, end: t.end, prefix: m ? m[1] : null, deadline: t.field === "deadline" };
}

export interface InsertResult {
  text: string;
  reverted: CaptureSpan[];
  /** Where the caret goes: the end of the line, or the title's place on a line with no title yet. */
  caret: number;
}

/**
 * Where a title is typed on a line that has none yet: after a leading 'x'
 * (done now) or mode prefix ('goal:'), else the very start.
 */
export function titleSlot(text: string, parsed: ParsedCapture): number {
  let at = 0;
  for (const t of [...parsed.tokens].sort((a, b) => a.start - b.start)) {
    if ((t.field === "done" || t.field === "mode") && !text.slice(at, t.start).trim()) at = t.end;
    else break;
  }
  return at;
}

/** The parse fields an insert fills; a date and a deadline are one slot (a '!' turns one into the other). */
function familyOf(field: string): string {
  return field === "deadline" ? "date" : field;
}

/**
 * Closes a line with the Must mark. A trailing '?' (the Inbox mark) stays
 * last: 'call bank by fri ?' → 'call bank by fri ! ?', and an attached one
 * comes apart from its word ('door?' → 'door ! ?'), which the parser reads
 * as both marks. `tail` is the line's trailing marks (tailStart).
 */
function closeWithMust(line: string, tail: string): string {
  const body = line.trimEnd();
  if (tail.includes("?") && body.endsWith(tail)) {
    const head = body.slice(0, body.length - tail.length).trimEnd();
    return `${head}${head ? " " : ""}! ${tail}`;
  }
  return body ? `${body} !` : "!";
}

/** Where the words can go, best first: the place the spec names, then the fallbacks applyInsert may need. */
function insertCandidates(text: string, insert: Insert, parsed: ParsedCapture): string[] {
  if (insert.field === "mode") return [`${insert.text}${text.replace(/^\s+/, "")}`];
  const tail = text.slice(tailStart(text, parsed)).trim();
  // One Must mark is enough: a line that already has one is left as it is.
  if (insert.field === "compulsory") return [hasToken(parsed, "compulsory") ? text : closeWithMust(text, tail)];
  if (insert.field === "inbox") {
    const body = text.trimEnd();
    return [body ? `${body} ${insert.text}` : insert.text];
  }
  const out: string[] = [];
  const slot = slotOf(parsed, insert.field, text);
  if (slot) {
    let words = insert.text;
    if (slot.deadline && insert.field === "date") {
      const core = insert.text.replace(/^(on|by)\s+/i, "");
      const keepPrefix = slot.prefix ?? (hasToken(parsed, "compulsory") ? null : "by");
      words = keepPrefix ? `${keepPrefix} ${core}` : core;
    }
    out.push(text.slice(0, slot.start) + words + text.slice(slot.end));
  } else {
    const at = tailStart(text, parsed);
    const head = text.slice(0, at).trimEnd();
    const tail = text.slice(at).trim();
    const attached = !!tail && at > 0 && !/\s/.test(text[at - 1]);
    const append = (words: string) => `${head}${head ? " " : ""}${words}${tail ? `${attached ? "" : " "}${tail}` : ""}`;
    out.push(append(insert.text));
    // A bare weekday after a schedule joins its day list ('every mon fri'); 'on fri' stays a date.
    if (insert.field === "date" && /^[a-z]{3}$/.test(insert.text)) out.push(append(`on ${insert.text}`));
    // Words that would run into the token before them ('by thu 2h'): put them straight after the title.
    const first = parsed.tokens.filter((t) => t.field !== "mode" && t.field !== "done").sort((a, b) => a.start - b.start)[0];
    if (first && first.start > 0) {
      const before = text.slice(0, first.start).trimEnd();
      out.push(`${before} ${insert.text} ${text.slice(first.start)}`);
    }
  }
  return insert.must && !hasToken(parsed, "compulsory") ? out.map((t) => closeWithMust(t, tail)) : out;
}

/**
 * Whether the line after an insert reads as intended: the inserted field is
 * there (with the inserted words in it), the title is unchanged, and every
 * other field the line had is still read. A Must also makes it compulsory.
 */
export function insertHolds(before: ParsedCapture, after: ParsedCapture, insert: Insert, nextText: string): boolean {
  if (insert.field === "mode") return after.mode === "IDEA" || after.mode === "GOAL";
  const family = familyOf(insert.field);
  const words = insert.text.replace(/^(on|by)\s+/i, "").toLowerCase();
  const landed = after.tokens.some((t) => familyOf(t.field) === family && nextText.slice(t.start, t.end).toLowerCase().includes(words));
  if (!landed) return false;
  if (insert.must && !after.compulsory) return false;
  if (before.title && after.title !== before.title) return false;
  const kept = new Set(after.tokens.map((t) => familyOf(t.field)));
  return before.tokens.every((t) => familyOf(t.field) === family || kept.has(familyOf(t.field)));
}

/**
 * Adds a chip's words to the line (capture.md 'Tap-to-add grammar row').
 *
 * Appended at the end with exactly one space, but a trailing ' ?' or '!'
 * stays last. When the line already has a token of that field (a date or
 * deadline, a schedule, an estimate, a goal), that token's words are
 * REPLACED instead: a day replacing a deadline keeps it a deadline ('by
 * thu' + Fri → 'by fri'). '!' and '?' close the line; 'idea: ' opens it.
 * Reverted spans move with their words (shiftReverted), and a token never
 * overlaps one, so an insert never touches a span the player kept as text.
 *
 * With `opts.today`, the result is read back with the parser, and when the
 * plain placement would change the rest of the parse — a weekday after a
 * schedule joins its day list ('gym every mon fri'), an estimate after a
 * weekday reads as a clock ('by thu 2h') — the next placement that keeps it
 * is used instead ('on fri', or the words straight after the title). Null
 * when the result would pass the line's length cap.
 *
 * A line with no title yet (an empty line, or only grammar so far): the
 * words wait after a space and the caret goes to the title's place
 * (titleSlot), so the title is typed BEFORE the grammar and can never run
 * into it — '' + Must·By Fri is ' by fri !', and typing 'pay rent' gives
 * 'pay rent by fri !' ('!' and '?' stay last). A mode prefix ('idea: ',
 * 'goal: ') opens the line instead, caret at the end.
 *
 * Only text changes: the sheet still sends the line alone, and the server
 * parses it exactly as the chips previewed it.
 */
export function applyInsert(
  text: string,
  reverted: CaptureSpan[],
  insert: Insert,
  parsed: ParsedCapture,
  opts: { today?: DayKey } = {}
): InsertResult | null {
  const candidates = insertCandidates(text, insert, parsed).filter((c) => c.length <= MAX_CAPTURE_CHARS);
  if (candidates.length === 0) return null;
  let chosen = candidates[0];
  if (opts.today) {
    for (const c of candidates) {
      const spans = shiftReverted(text, c, reverted);
      if (insertHolds(parsed, parseCapture(c, { today: opts.today, reverted: spans }), insert, c)) {
        chosen = c;
        break;
      }
    }
  }
  if (insert.field === "mode" && !parsed.title.trim() && text.trim()) {
    // A prefix in front of grammar with no title ('tmr' + Idea): the title goes between them.
    const head = insert.text.trimEnd();
    const spaced = `${head}  ${text.trimStart()}`;
    if (spaced.length <= MAX_CAPTURE_CHARS) {
      return { text: spaced, reverted: shiftReverted(text, spaced, reverted), caret: head.length + 1 };
    }
  }
  // Decide on the line as it will read: a lone 'x' or 'done' is the title
  // before the insert and the done mark after it ('x' + 30m is 'x 30m', no title).
  const after = insert.field !== "mode" && opts.today ? parseCapture(chosen, { today: opts.today, reverted: shiftReverted(text, chosen, reverted) }) : null;
  const titleAfter = after ? after.title.trim() : parsed.title.trim();
  if (insert.field !== "mode" && (!parsed.title.trim() || !titleAfter)) {
    // The title's place, read on the chosen line (the leading 'x' or mode prefix is kept by every insert).
    const lead = after && !titleAfter ? titleSlot(chosen, after) : titleSlot(text, parsed);
    const head = chosen.slice(0, lead).trimEnd();
    const rest = chosen.slice(lead).trimStart();
    const spaced = head ? `${head}  ${rest}` : ` ${rest}`;
    if (spaced.length <= MAX_CAPTURE_CHARS) {
      return { text: spaced, reverted: shiftReverted(text, spaced, reverted), caret: head ? head.length + 1 : 0 };
    }
  }
  return { text: chosen, reverted: shiftReverted(text, chosen, reverted), caret: chosen.length };
}

/** 'Added “tmr” to the line', for the polite live note (never to be mistaken for a save); and the chip's own name. */
export function insertedNote(insert: Insert): string {
  return `Added “${insert.text.trim()}” to the line`;
}
export function insertChipLabel(insert: Insert): string {
  return `Add “${insert.text.trim()}” to the line`;
}

// ── Block-once: a Must with no day ────────────────────────────────────────

export const MUST_WARNING_BEFORE = "A Must needs a day to be judged on.";
export const MUST_WARNING = "A Must needs a day to be judged on. Tap one, or press Enter again to add it as a normal task.";

export type MustGateAction = "save" | "block" | "save-not-must";

/**
 * The first Enter (or Add) on a line whose Must has no day does not save:
 * it shows the warning and the fix chips. A second press on the unchanged
 * text saves it as an ordinary task; any edit blocks again. `blocked` is
 * the text the last block was for.
 */
export function mustGate(blocked: string | null, text: string, warning: boolean): { action: MustGateAction; blocked: string | null } {
  if (!warning) return { action: "save", blocked: null };
  if (blocked === text) return { action: "save-not-must", blocked: null };
  return { action: "block", blocked: text };
}

// ── The suggestion row ────────────────────────────────────────────────────

export type CaretKind = "goal" | "tag" | "empty";

/** The word the caret is in (or at the end of): its bounds and text. */
export function caretWord(text: string, caret: number): { start: number; end: number; word: string } {
  const c = Math.max(0, Math.min(text.length, caret));
  let start = c;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = c;
  while (end < text.length && !/\s/.test(text[end])) end++;
  return { start, end, word: text.slice(start, end) };
}

/**
 * What the suggestion row offers: 'goal' when the caret word starts with
 * '^', 'tag' with '#', 'empty' on an empty line, null otherwise (the insert
 * row shows).
 */
export function caretContext(text: string, caret: number): CaretKind | null {
  if (!text.trim()) return "empty";
  const { word } = caretWord(text, caret);
  if (word.startsWith("^")) return "goal";
  if (word.startsWith("#")) return "tag";
  return null;
}

/** What was typed after the '^' or '#' (a '^"' quote included in the marker). */
export function caretPrefix(word: string): string {
  return word.replace(/^[\^#]"?/, "").replace(/"$/, "");
}

export const SUGGEST_MAX = 6;

/** Open goals for a '^' word: titles starting with the typed prefix first, then any containing it; at most six. */
export function goalSuggestions<G extends { id: string; title: string }>(goals: readonly G[], prefix: string): G[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return goals.slice(0, SUGGEST_MAX);
  const starts = goals.filter((g) => g.title.toLowerCase().startsWith(p));
  const contains = goals.filter((g) => !g.title.toLowerCase().startsWith(p) && g.title.toLowerCase().includes(p));
  return [...starts, ...contains].slice(0, SUGGEST_MAX);
}

/** The tags the parser reads after '#'. */
export const CAPTURE_TAGS = ["body", "duty", "craft", "care", "play", "short", "mid", "long"] as const;

export function tagSuggestions(prefix: string): string[] {
  const p = prefix.trim().toLowerCase();
  return CAPTURE_TAGS.filter((t) => t.startsWith(p) && t !== p).slice(0, SUGGEST_MAX);
}

/** The empty line's 'Recent' chips: distinct, non-empty, at most six. */
export function recentChips(recent: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of recent) {
    const t = typeof r === "string" ? r.trim() : "";
    const k = t.toLowerCase().replace(/\s+/g, " ");
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t.slice(0, MAX_CAPTURE_CHARS));
    if (out.length >= SUGGEST_MAX) break;
  }
  return out;
}

/**
 * Replaces the caret word with a suggestion ('^mar' → '^"Run a marathon"',
 * '#bo' → '#body'). A space follows when the word closed the line, so the
 * next word can be typed straight away.
 */
export function replaceCaretWord(text: string, reverted: CaptureSpan[], caret: number, replacement: string): InsertResult | null {
  const { start, end } = caretWord(text, caret);
  const after = text.slice(end);
  const glue = after.length === 0 ? " " : "";
  const next = `${text.slice(0, start)}${replacement}${glue}${after}`;
  if (next.length > MAX_CAPTURE_CHARS) return null;
  return { text: next, reverted: shiftReverted(text, next, reverted), caret: start + replacement.length + glue.length };
}

// ── What the toast says ───────────────────────────────────────────────────

export interface ToastCopy {
  head: string;
  /** The bold lead: the title (or the idea's question). Empty when the body is a sentence of its own. */
  title: string;
  /** After ' → ': the board place in its own words. */
  where: string | null;
  /** '≈ 8.3' (a projection) or '+8.3' (what a tick paid, exactly). */
  figure: { text: string; exact: boolean } | null;
  /** After ' · ': a reason or a note. */
  tail: string | null;
  /** 'View' (to the row on Today) or 'Finish' (an idea draft's full form). */
  link: { label: string; href: string } | null;
  /** The body as one line of text, for the live region and the checks. */
  body: string;
}

export const NOT_MUST_TAIL = "needs a day or a schedule to be a Must";
export const OLD_KEPT_BODY = "The old one couldn't be removed. Archive it on Today.";
export const FILING_WHERE = "filing now. If it looks like one you have, it waits in your Inbox.";

/**
 * The toast (and the sheet's status line) for one saved capture, by case
 * (capture.md 'Say where it went'). The place and every figure are the
 * server's: where.label from placeOf, the price the server projected or
 * the tick paid. `notMust`: a Must with no day saved as an ordinary task.
 * `update`: the line replaced one saved moments ago. `offToday`: a 'View'
 * link to the row on Today.
 */
export function toastCopy(
  item: Pick<CapturedItem, "id" | "title" | "projectedXp" | "kind" | "doneNow" | "doneNowError" | "duplicate" | "href" | "where" | "filing" | "oldKept" | "weight">,
  ctx: { notMust?: boolean; update?: boolean; offToday?: boolean } = {}
): ToastCopy {
  // A weigh-in is a record, not a task: its own copy, no figure, View goes to Train (weight-capture.ts).
  if (item.weight) return weightToastCopy({ where: item.where, duplicate: item.duplicate, weight: item.weight });
  const where = item.where?.label ?? null;
  const view = ctx.offToday ? { label: "View", href: `/today#t-${item.id}` } : null;
  const priced = Number.isFinite(item.projectedXp) && item.projectedXp > 0;
  let head: string;
  let title = item.title;
  let to: string | null = where;
  let figure: ToastCopy["figure"] = null;
  let tail: string | null = null;
  let link: ToastCopy["link"] = view;

  if (ctx.update && item.oldKept) {
    head = "Saved the new line";
    title = "";
    to = null;
    // A done-now edit is left unticked while the old line stands (never paid twice): say so.
    tail = item.doneNowError ? `${OLD_KEPT_BODY} ${item.doneNowError}` : OLD_KEPT_BODY;
  } else if (ctx.update) {
    head = "Updated";
    // An edited done-now line: what its tick paid, or why it was not ticked.
    if (item.doneNow && priced) figure = { text: `+${formatXp(item.projectedXp)}`, exact: true };
    else if (item.doneNowError) tail = item.doneNowError;
  } else if (item.duplicate) {
    head = "Already saved";
    // A resend of another day's done-now line is not ticked today: the server says why ('Saved on Wed 30 Sep; tick it on Today.').
    if (item.doneNowError) tail = item.doneNowError;
  } else if (item.kind === "IDEA_DRAFT" && item.filing) {
    head = "Idea saved";
    to = FILING_WHERE;
    link = null;
  } else if (item.kind === "IDEA_DRAFT") {
    head = "Idea in Inbox";
    to = "Inbox";
    link = item.href ? { label: "Finish", href: item.href } : null;
  } else if (item.kind === "GOAL") {
    head = "Goal added";
    to = "Goals";
  } else if (item.doneNow) {
    head = "Done";
    to = null;
    if (priced) figure = { text: `+${formatXp(item.projectedXp)}`, exact: true };
  } else if (item.doneNowError) {
    head = "Saved, not ticked";
    tail = item.doneNowError;
  } else {
    head = ctx.notMust ? "Added (not a Must)" : "Added";
    if (priced) figure = { text: `≈ ${formatXp(item.projectedXp)}`, exact: false };
    if (ctx.notMust) tail = NOT_MUST_TAIL;
  }

  const parts: string[] = [];
  if (title) parts.push(to ? `${title} → ${to}` : title);
  else if (to) parts.push(to);
  if (figure) parts.push(figure.text);
  if (tail) parts.push(tail);
  return { head, title, where: to, figure, tail, link, body: parts.join(" · ") };
}

/** A row of the 'Added here' list: title, place, ≈ price (or what a tick paid). */
export function addedRowCopy(item: Pick<CapturedItem, "title" | "projectedXp" | "doneNow" | "where" | "kind">): { title: string; where: string; figure: string | null } {
  const priced = Number.isFinite(item.projectedXp) && item.projectedXp > 0 && item.kind !== "GOAL" && item.kind !== "IDEA_DRAFT";
  const figure = priced ? (item.doneNow ? `+${formatXp(item.projectedXp)}` : `≈ ${formatXp(item.projectedXp)}`) : null;
  return { title: item.title, where: item.where?.label ?? "", figure };
}

/** The auto-retry summary: only when a retried line was actually new (a retry that found its row says nothing). */
export function unsentSavedCopy(newlySaved: number): string | null {
  if (newlySaved <= 0) return null;
  return `${newlySaved} unsent line${newlySaved === 1 ? "" : "s"} saved`;
}

/** The capture buttons' description: 'N line(s) waiting to save', or nothing. */
export function unsentLabel(n: number): string {
  if (n <= 0) return "";
  return `${n} line${n === 1 ? "" : "s"} waiting to save`;
}

// ── Paste a list ──────────────────────────────────────────────────────────

export const PASTE_CAP_NOTE = `Only the first ${CAPTURE_BATCH_MAX} lines are added.`;

/** A list bullet or checkbox: '- ', '* ', '•', '–', '[ ]', '[x]', '1.' / '1)'. */
const BULLET = /^(?:[-*]\s+|[•–]\s*|\[(?: |x|X)\]\s*|\d{1,3}[.)]\s+)/;

function stripBullets(line: string): string {
  let s = line.trim();
  for (let i = 0; i < 3; i++) {
    const m = BULLET.exec(s);
    if (!m) break;
    s = s.slice(m[0].length).trimStart();
  }
  return s;
}

/**
 * A pasted block, one task per line: split on CR/LF, trimmed, list marks
 * stripped, blank lines dropped, NFC, each line cut to the line cap, and
 * at most CAPTURE_BATCH_MAX lines (`truncated` says more were dropped).
 */
export function splitPastedLines(raw: string): { lines: string[]; truncated: boolean } {
  const all = (typeof raw === "string" ? raw : "")
    .normalize("NFC")
    .split(/\r\n|\r|\n/)
    .map(stripBullets)
    .filter((l) => l.length > 0);
  return { lines: all.slice(0, CAPTURE_BATCH_MAX).map((l) => l.slice(0, MAX_CAPTURE_CHARS)), truncated: all.length > CAPTURE_BATCH_MAX };
}

const PREVIEW_TEMPLATE: Omit<BoardTemplate, "title" | "kind" | "recurrence" | "startDay" | "dueDay" | "dueKind" | "compulsory" | "inbox"> = {
  id: "preview",
  normTitle: "",
  intrinsic: false,
  autoMetric: null,
  mvv: null,
  track: "DUTY",
  band: "STANDARD",
  bandOverride: 0,
  estMinutes: 30,
  machineMinutes: 30,
  horizon: null,
  parentId: null,
  krMetric: null,
  krTarget: null,
  krUnit: null,
  autoTarget: null,
  category: "OTHER",
  lexicalBand: "STANDARD",
  aiBand: null,
  gradeSource: "LEXICAL",
  gradeConfidence: 0,
  gradeBasis: null,
  gradeModel: null,
  gradePromptVersion: null,
  gradeAttempts: 0,
  gradeFrozen: false,
  sizing: false,
  bandOverrideAt: null,
  gradeFrozenAt: null,
  topAttribute: null,
  note: null,
  completedAt: null,
  createdAt: "1970-01-01T00:00:00.000Z",
  sortOrder: 0,
};

/**
 * Where a pasted line will probably go, before it is saved: the server's
 * own shaping (tasks.ts captureShapeOf, mirrored) and the board's own
 * filing rule (today-board placeOf) on a row with no history. A done-now
 * line that will be on today's board reads 'Done today'. It is a guess for
 * the preview only — the toast names the place the server computed.
 */
export function wherePreviewOf(parsed: ParsedCapture, today: DayKey): BoardPlace {
  // The server's own shaping (src/lib/capture-shape.ts), so the preview and the stored row cannot drift.
  const t: BoardTemplate = { ...PREVIEW_TEMPLATE, title: parsed.title, ...captureShapeOf(parsed, today) };
  const place = placeOf(t, today);
  if (parsed.doneNow && (place.lane === "must" || place.lane === "planned" || place.lane === "habits" || place.lane === "anytime")) {
    return { lane: "done", label: "Done today" };
  }
  return place;
}

/** The paste preview's dashed note on a Must that has no day (it saves as an ordinary task). */
export const PASTE_MUST_NOTE = "Must · needs a day";

// ── The vocabulary cache and its refresh ──────────────────────────────────

export const VOCAB_CACHE_KEY = "xtnl:capture:vocab";
/** A cached ≈ price older than this is not shown; the chip says 'priced on save' until the refresh. */
export const VOCAB_FRESH_MS = 5 * 60_000;
/** With no save in flight, the background refresh starts this long after opening. */
export const VOCAB_REFRESH_DELAY_MS = 1_500;
/** The cached 'active' list is capped like the server's. */
export const ACTIVE_SCAN_MAX = 300;

export interface VocabCache {
  day: DayKey;
  goals: { id: string; title: string }[];
  recent: string[];
  rawBefore: number;
  active: CaptureActiveTitle[];
  /** The unit a bare weigh-in number is read in; absent in a cache written before weigh-ins (then 'kg'). */
  weightUnit?: WeightUnit;
  /** When the server answered (epoch ms). */
  at: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The stored cache, read back defensively (null when missing or malformed; bad entries dropped). */
export function parseVocabCache(raw: unknown): VocabCache | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.day !== "string" || !DAY_RE.test(r.day) || typeof r.at !== "number" || !Number.isFinite(r.at)) return null;
  const rawBefore = typeof r.rawBefore === "number" && Number.isFinite(r.rawBefore) && r.rawBefore >= 0 ? r.rawBefore : 0;
  const goals = Array.isArray(r.goals)
    ? r.goals.flatMap((g) => (g && typeof g === "object" && typeof (g as { id?: unknown }).id === "string" && typeof (g as { title?: unknown }).title === "string" ? [{ id: (g as { id: string }).id, title: (g as { title: string }).title }] : []))
    : [];
  const recent = Array.isArray(r.recent) ? r.recent.filter((x): x is string => typeof x === "string") : [];
  const active = Array.isArray(r.active)
    ? r.active
        .flatMap((a) => {
          if (!a || typeof a !== "object") return [];
          const x = a as Record<string, unknown>;
          const w = x.where as Record<string, unknown> | undefined;
          if (typeof x.normTitle !== "string" || typeof x.title !== "string" || !w || typeof w.lane !== "string" || typeof w.label !== "string") return [];
          return [{ normTitle: x.normTitle, title: x.title, where: { lane: w.lane, label: w.label } as BoardPlace }];
        })
        .slice(0, ACTIVE_SCAN_MAX)
    : [];
  const weightUnit: WeightUnit | undefined = r.weightUnit === "kg" || r.weightUnit === "lb" ? r.weightUnit : undefined;
  return { day: r.day, goals, recent, rawBefore, active, ...(weightUnit ? { weightUnit } : {}), at: r.at };
}

/** Fired on window after the weight unit changes on Train (detail: the unit): the sheet reads bare weigh-in numbers in it at once. */
export const WEIGHT_UNIT_EVENT = "xtnl:weight-unit";

/** The cache with the user's new weight unit (null stays null: the next load brings the unit). */
export function withWeightUnit(v: VocabCache | null, unit: WeightUnit): VocabCache | null {
  return v ? { ...v, weightUnit: unit } : null;
}

/**
 * Whether a cached vocabulary may price the grade chip: only for today's
 * life day (a different day is stale — its knee base was another day's),
 * and only while fresh. Goals and recent lines are usable either way.
 */
export function vocabPriceable(v: Pick<VocabCache, "day" | "at"> | null, today: DayKey, now: number): boolean {
  return !!v && v.day === today && now - v.at < VOCAB_FRESH_MS;
}

/** Whether the cache wants a refresh at all (another day, or older than VOCAB_FRESH_MS). */
export function vocabStale(v: Pick<VocabCache, "day" | "at"> | null, today: DayKey, now: number): boolean {
  return !v || v.day !== today || now - v.at >= VOCAB_FRESH_MS;
}

/**
 * The vocabulary as a fresh opening may use it: whether it may price the
 * grade chip is decided again (vocabPriceable), so a long-lived page never
 * shows a ≈ priced on an hours-old knee base. Until this opening's refresh
 * lands, a stale one reads 'priced on save'.
 */
export function vocabOnOpen<V extends Pick<VocabCache, "day" | "at"> & { priced: boolean }>(v: V | null, today: DayKey, now: number): V | null {
  if (!v) return v;
  const priced = vocabPriceable(v, today, now);
  return priced === v.priced ? v : { ...v, priced };
}

/** On an open phone sheet, the refresh waits until the line has been empty this long (a pause between lines). */
export const VOCAB_IDLE_MS = 2_000;

export type RefreshDecision = "start" | "wait" | "skip";

/**
 * When the background vocabulary refresh may start. Next runs a client's
 * server actions one at a time, so a refresh in flight would queue the
 * next save behind it: it never starts while a save is in flight. It runs
 * after the opening's first save resolves (goals, recent lines and the knee
 * base have moved), or VOCAB_REFRESH_DELAY_MS after opening when the cache
 * is stale; once per opening.
 *
 * On a phone mid-burst the next line usually follows within a second or
 * two, so while a coarse sheet is open (`coarseOpen`) the refresh also
 * waits until the line has stayed empty for VOCAB_IDLE_MS; the sheet asks
 * again when it closes, where it may start at once.
 */
export function vocabRefreshDecision(s: {
  now: number;
  openedAt: number;
  savesInFlight: number;
  savedThisOpening: boolean;
  refreshedThisOpening: boolean;
  stale: boolean;
  /** The sheet is open on a coarse pointer. */
  coarseOpen: boolean;
  lineEmpty: boolean;
  /** How long the line has been empty (0 when it is not). */
  emptyForMs: number;
}): RefreshDecision {
  if (s.refreshedThisOpening) return "skip";
  if (s.savesInFlight > 0) return "wait";
  if (!s.savedThisOpening) {
    if (!s.stale) return "skip";
    if (s.now - s.openedAt < VOCAB_REFRESH_DELAY_MS) return "wait";
  }
  if (s.coarseOpen && !(s.lineEmpty && s.emptyForMs >= VOCAB_IDLE_MS)) return "wait";
  return "start";
}

// ── Back closes the sheet (phones) ────────────────────────────────────────

/** The hash-only history entry the sheet pushes on a phone, so the Back gesture closes it. */
export const CAPTURE_OPEN_HASH = "#capture-open";

export type CloseReason = "back" | "escape" | "scrim" | "button" | "save" | "done" | "navigate";

/** On open: a phone pushes one hash-only entry (never twice, never on a fine pointer). */
export function historyOnOpen(p: { coarse: boolean; hash: string; pushed: boolean }): "push" | "none" {
  return p.coarse && !p.pushed && p.hash !== CAPTURE_OPEN_HASH ? "push" : "none";
}

/** A popstate while open, with the hash no longer #capture-open: the Back gesture, so close. */
export function historyOnPop(p: { open: boolean; hash: string }): "close" | "none" {
  return p.open && p.hash !== CAPTURE_OPEN_HASH ? "close" : "none";
}

/**
 * On close: take the pushed entry back off with history.back() — unless
 * Back itself closed it, a link is navigating away (the Idea form, View,
 * Finish), it was never pushed, or this is a fine pointer.
 */
export function historyOnClose(p: { reason: CloseReason; hash: string; coarse: boolean; pushed: boolean }): "back" | "none" {
  if (!p.coarse || !p.pushed) return "none";
  if (p.reason === "back" || p.reason === "navigate") return "none";
  return p.hash === CAPTURE_OPEN_HASH ? "back" : "none";
}

// ── Prefill from a link: '#capture=<encoded>' ─────────────────────────────

export const CAPTURE_FRAGMENT = "#capture=";
export const FRAGMENT_BUSY_NOTE = "You have an unsent line, so the link's text wasn't used.";

/**
 * The text a '#capture=' link carries, or null for anything else. Decoded
 * ('+' is a space, as search keywords send it; %2B is a plus), NFC, control
 * characters as spaces, trimmed, at most MAX_CAPTURE_CHARS. It only ever
 * fills the line: a link can never save anything.
 */
export function readCaptureFragment(hash: string): string | null {
  if (typeof hash !== "string" || !hash.startsWith(CAPTURE_FRAGMENT)) return null;
  let text: string;
  try {
    text = decodeURIComponent(hash.slice(CAPTURE_FRAGMENT.length).replace(/\+/g, " "));
  } catch {
    return null;
  }
  text = text.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, MAX_CAPTURE_CHARS) : null;
}

// ── The quiet duplicate note ──────────────────────────────────────────────

/**
 * An open template with the same normalised title, or null. Equality on
 * normTitle only (a habit and a one-off may share a title, so this only
 * informs). `skipNorm`: the capture being edited, which is on the board
 * until the edit lands.
 */
export function duplicateOf(title: string, active: readonly CaptureActiveTitle[], skipNorm?: string | null): CaptureActiveTitle | null {
  if (!title.trim()) return null;
  const norm = normTitleOf(title);
  if (!norm || norm === skipNorm) return null;
  const list = active.length > ACTIVE_SCAN_MAX ? active.slice(0, ACTIVE_SCAN_MAX) : active;
  return list.find((a) => a.normTitle === norm) ?? null;
}

export function duplicateNote(a: Pick<CaptureActiveTitle, "title" | "where">): string {
  return `Already on your board: ${a.title} · ${a.where.label}`;
}

// ── The idea chip ─────────────────────────────────────────────────────────

/**
 * Mirrors capture.ts IDEA_SELF_FILING (a "use server" module cannot export
 * a constant): an 'idea: Q :: A' line files itself only when the server
 * does. Flip both together; today-ui-check holds them equal.
 */
export const IDEA_SELF_FILING_UI = false;

/** The idea line's chip: honest about whether it files itself. */
export function ideaChipLabel(hasAnswer: boolean, selfFiling = IDEA_SELF_FILING_UI): string {
  if (hasAnswer && selfFiling) return "Files itself as an Idea";
  // Off, the answer still travels: the server keeps it as the draft's note.
  if (hasAnswer) return "Inbox draft with its answer · finish it in the full form";
  return "Inbox draft · finish it in the full form";
}
