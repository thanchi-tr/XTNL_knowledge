/**
 * Defer and abort (2026-10-13; migration 20261222000000_task_defer_abort): the pure rules.
 *
 * A task can be DEFERRED (off the board until an instant, with a reason) or ABORTED (with a
 * reason: just this time, or for good). Every decision is a TaskDecision row; a defer also sets
 * TaskTemplate.deferUntil, which every board read honours (a template whose deferUntil is still
 * ahead is hidden; once it has passed it is just a task again: a past value reads as none).
 *
 * What a decision writes (planDefer / planAbort; the server applies it, task-decisions-server.ts):
 *
 *   DEFER a one-off           deferUntil := until. When it returns on a later day and no put-off is
 *                             set, planDay := that day (the put-off column rescheduleCore uses), so it
 *                             is off the board until then. dueDay and dueKind never move: a deadline
 *                             keeps its day and its late factor (still late after it); an undated or
 *                             planned one-off reads as planned for its return day (today-board
 *                             placementOf: the Today lane, "from Tue" after it).
 *   DEFER a repeating         today's occurrence and every due one before the return day are SKIPPED
 *     non-must                (the streak holds, 0 XP), deferUntil := until.
 *   DEFER any must            nothing is skipped: each of its days before the return counts as NOT
 *                             kept (the Must lane says "1 of 2 kept · 1 deferred"; no Full day). A must
 *                             leaves its day: the return is on a later life day (deferTimeRefusalOf).
 *   ABORT just this time      non-must: today SKIPPED (as Skip). Must: off the board for the rest of
 *     (repeating)             today (deferUntil := the day's end), today counts as not kept.
 *   ABORT for good, or any    the template is archived through the archive path (tasks.ts archiveCore:
 *     one-off                 the must's akrasia horizon applies, and the answer says when).
 *
 * No decision pays or takes XP and none writes the ledger; a done occurrence must be undone first.
 * Undo (10 minutes, the same life day, like a tick's) restores exactly what changed, and every write
 * is chosen so that it can be derived from the decision row and the template (planUndo): deferUntil
 * is cleared only while it is still the decision's instant, planDay only while it is still the return
 * day the decision wrote, and only the instances the decision created (createdAt = the decision's
 * instant) or moved from UNDONE (updatedAt = that instant).
 *
 * Pure: no database, no React. The clock and the zone are parameters. Client-importable.
 */
import { addDays, dayEndOf, dayKeyOf, weekdayOf, zonedToInstant, LIFE_TZ, type DayKey } from "./life-day";
import { isFixedSchedule, occurrencesBetween, parseRule } from "./recurrence";
import { UNDO_WINDOW_MINUTES } from "./life-grade";
import type { MustNote } from "./daily-quests";
import { completesItself } from "./life-types";
import { sideExpiresOf, sideMoveRefusalOf } from "./side-quests";

// ── Kinds, scopes, reasons ────────────────────────────────────────────────

export const DECISION_KINDS = ["DEFER", "ABORT"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const ABORT_SCOPES = ["ONCE", "SERIES"] as const;
export type AbortScope = (typeof ABORT_SCOPES)[number];

export const REASON_TAGS = ["BLOCKED", "NO_TIME", "LOW_ENERGY", "NOT_NEEDED", "PLAN_CHANGED", "WAITING"] as const;
export type ReasonTag = (typeof REASON_TAGS)[number];

/** The reason chips, in the sheet's order. A tapped chip with nothing typed is the reason itself. */
export const REASON_TAG_LABEL: Readonly<Record<ReasonTag, string>> = {
  BLOCKED: "Blocked",
  NO_TIME: "No time",
  LOW_ENERGY: "Low energy",
  NOT_NEEDED: "Not needed",
  PLAN_CHANGED: "Plan changed",
  WAITING: "Waiting on someone",
};

/** A reason is 1 to 200 characters, trimmed. */
export const REASON_MAX = 200;
/** A defer reaches at most this far ahead. */
export const DEFER_MAX_DAYS = 60;
/** From this many defers of one task, the nudge: break it into steps, or abort it. */
export const DEFER_NUDGE_AT = 3;
/** An Undo is accepted this long after the decision, on the same life day (a tick's window). */
export const DECISION_UNDO_MS = UNDO_WINDOW_MINUTES * 60_000;

export const REASON_EMPTY = "Say why in a few words, or tap a reason.";
export const REASON_LONG = `Keep the reason to ${REASON_MAX} characters.`;
export const REASON_TAG_UNKNOWN = "Pick one of the reasons offered.";

export const DEFER_NO_TIME = "Pick when it comes back.";
export const DEFER_PAST = "Pick a time that is still ahead.";
export const DEFER_TOO_FAR = `Pick a time within ${DEFER_MAX_DAYS} days.`;
export const DEFER_MUST_SAME_DAY = "A deferred must leaves its day: pick tomorrow or later. Today still counts as not kept.";

export const DECISION_GONE = "That task no longer exists.";
export const DECISION_GOAL = "A goal moves by its due day: reschedule it instead.";
export const DECISION_INBOX = "Sort it out of the inbox first.";
export const DECISION_DONE_TODAY = "Done today. Undo the tick first: a defer or an abort never takes back what was paid.";
export const DECISION_DONE = "Already done. Undo the tick first.";
export const DEFER_AUTO = "This task completes itself from your activity, so it can't be deferred. Abort it instead.";
export const ABORT_ALREADY_SKIPPED = "Already skipped today.";
export const ABORT_SCOPE_UNKNOWN = "Pick just this time, or stop it for good.";
export const DECISION_UNDO_LATE = `Too late to undo: a defer or an abort can be undone for ${UNDO_WINDOW_MINUTES} minutes, on the same day.`;
export const DECISION_UNDO_GONE = "That decision no longer exists.";
export const DECISION_STALE = "Something changed at the same moment. Try again.";

export function isReasonTag(x: unknown): x is ReasonTag {
  return typeof x === "string" && (REASON_TAGS as readonly string[]).includes(x);
}

export function isAbortScope(x: unknown): x is AbortScope {
  return x === "ONCE" || x === "SERIES";
}

export type ReasonResult = { ok: true; reason: string; reasonTag: ReasonTag | null } | { ok: false; error: string };

/**
 * The reason as stored: the typed text, trimmed and with its runs of white space made one space;
 * when nothing is typed, a tapped chip's own words ("Blocked"). 1 to REASON_MAX characters. An
 * unknown tag is refused, never dropped silently.
 */
export function cleanReason(text: unknown, tag?: unknown): ReasonResult {
  let reasonTag: ReasonTag | null = null;
  if (tag != null && tag !== "") {
    if (!isReasonTag(tag)) return { ok: false, error: REASON_TAG_UNKNOWN };
    reasonTag = tag;
  }
  const typed = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  const reason = typed || (reasonTag ? REASON_TAG_LABEL[reasonTag] : "");
  if (!reason) return { ok: false, error: REASON_EMPTY };
  if (reason.length > REASON_MAX) return { ok: false, error: REASON_LONG };
  return { ok: true, reason, reasonTag };
}

// ── Wall clock in the life zone ───────────────────────────────────────────

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

const formatters = new Map<string, Intl.DateTimeFormat>();
function wallOf(ms: number, tz: string): { y: number; m: number; d: number; h: number; min: number } {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(tz, f);
  }
  const parts = f.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, min: get("minute") };
}

const msOf = (at: Date | string | number): number => (typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : at.getTime());

/** The calendar date (not the life day) an instant falls on in the zone. */
function calendarKeyOf(ms: number, tz: string): DayKey {
  const w = wallOf(ms, tz);
  return `${w.y}-${pad2(w.m)}-${pad2(w.d)}`;
}

/** An instant at hh:mm on a calendar date in the zone. */
export function instantAt(day: DayKey, hour: number, minute: number = 0, tz: string = LIFE_TZ): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(zonedToInstant(y, m, d, hour, tz).getTime() + minute * 60_000);
}

/** "2026-10-14T09:30" (a datetime-local field's value) as an instant in the zone; null when unreadable. */
export function parseLocalDateTime(value: unknown, tz: string = LIFE_TZ): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const at = instantAt(`${m[1]}-${m[2]}-${m[3]}`, h, mi, tz);
  // A date that does not exist (31 Feb) rolls over in Date.UTC: refused rather than moved.
  const back = wallOf(at.getTime(), tz);
  return back.y === y && back.m === mo && back.d === d ? at : null;
}

/** An instant as a datetime-local field's value ("2026-10-14T09:30") in the zone. */
export function localInputOf(at: Date | string | number, tz: string = LIFE_TZ): string {
  const w = wallOf(msOf(at), tz);
  return `${w.y}-${pad2(w.m)}-${pad2(w.d)}T${pad2(w.h)}:${pad2(w.min)}`;
}

/** "09:30" in the zone. */
export function clockOf(at: Date | string | number, tz: string = LIFE_TZ): string {
  const w = wallOf(msOf(at), tz);
  return `${pad2(w.h)}:${pad2(w.min)}`;
}

/**
 * When a deferred task comes back, in words true when read: "18:00" on the same calendar day as
 * now, "Tue 09:00" within the next six days, "Tue 3 Nov 09:00" further off.
 */
export function untilLabelOf(at: Date | string | number, now: Date | string | number, tz: string = LIFE_TZ): string {
  const ms = msOf(at);
  const day = calendarKeyOf(ms, tz);
  const today = calendarKeyOf(msOf(now), tz);
  const time = clockOf(ms, tz);
  if (day === today) return time;
  const wd = WEEKDAY_SHORT[weekdayOf(day) - 1];
  const ahead = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (ahead > 0 && ahead <= 6) return `${wd} ${time}`;
  const [, m, d] = day.split("-").map(Number);
  return `${wd} ${d} ${MONTH_SHORT[m - 1]} ${time}`;
}

/** "Tue" of a key, "Tue 3 Nov" when it is not this week. For the weekly review's lines. */
function dayWord(day: DayKey): string {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY_SHORT[weekdayOf(day) - 1]} ${d} ${MONTH_SHORT[m - 1]}`;
}

// ── When it comes back ────────────────────────────────────────────────────

export type DeferPickId = "hour" | "evening" | "tomorrow" | "monday";

export const DEFER_PICK_LABEL: Readonly<Record<DeferPickId, string>> = {
  hour: "In 1 hour",
  evening: "This evening 18:00",
  tomorrow: "Tomorrow 09:00",
  monday: "Next Monday 09:00",
};

export interface DeferPick {
  id: DeferPickId;
  label: string;
  /** The instant (ISO). */
  at: string;
}

/** The Monday after a life day (a Monday's next Monday is a week on). */
export function nextMondayOf(day: DayKey): DayKey {
  return addDays(day, 8 - weekdayOf(day));
}

/**
 * The sheet's quick picks, relative to now in the life zone, by the life day (so 02:00 is still
 * the night before: "Tomorrow" is this morning's 09:00): in an hour; this evening at 18:00 while
 * it is still ahead; tomorrow at 09:00; next Monday at 09:00. Two picks on one instant keep the
 * first. For a must (`must`), only picks on a later life day: a must deferred leaves its day.
 */
export function deferPicksOf(now: Date | number, opts: { must?: boolean } = {}, tz: string = LIFE_TZ): DeferPick[] {
  const nowMs = msOf(now);
  const today = dayKeyOf(new Date(nowMs), tz);
  const raw: [DeferPickId, number][] = [
    ["hour", nowMs + 3_600_000],
    ["evening", instantAt(today, 18, 0, tz).getTime()],
    ["tomorrow", instantAt(addDays(today, 1), 9, 0, tz).getTime()],
    ["monday", instantAt(nextMondayOf(today), 9, 0, tz).getTime()],
  ];
  const seen = new Set<number>();
  const out: DeferPick[] = [];
  for (const [id, ms] of raw) {
    if (seen.has(ms) || deferTimeRefusalOf(ms, nowMs, opts, tz)) continue;
    seen.add(ms);
    out.push({ id, label: DEFER_PICK_LABEL[id], at: new Date(ms).toISOString() });
  }
  return out;
}

/**
 * Why `until` cannot be a defer's return, or null when it can: it must be ahead of now, at most
 * DEFER_MAX_DAYS away, and for a must on a later life day than today's (a must deferred leaves
 * its day, so its day counts as not kept and is never kept by a return later that day).
 */
export function deferTimeRefusalOf(until: Date | string | number | null | undefined, now: Date | number, opts: { must?: boolean } = {}, tz: string = LIFE_TZ): string | null {
  if (until == null) return DEFER_NO_TIME;
  const ms = msOf(until);
  const nowMs = msOf(now);
  if (!Number.isFinite(ms)) return DEFER_NO_TIME;
  if (ms <= nowMs) return DEFER_PAST;
  if (ms - nowMs > DEFER_MAX_DAYS * 86_400_000) return DEFER_TOO_FAR;
  if (opts.must && dayKeyOf(new Date(ms), tz) <= dayKeyOf(new Date(nowMs), tz)) return DEFER_MUST_SAME_DAY;
  return null;
}

// ── What a defer does, per kind of task ───────────────────────────────────

/** The template facts a decision reads. `compulsory` is the rule in force today (duty-rule ruleOn). */
export interface DecisionTemplate {
  id: string;
  kind: string;
  inbox: boolean;
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  dueKind: string | null;
  planDay: DayKey | null;
  compulsory: boolean;
  autoMetric: string | null;
  /** A one-off already done. */
  completed: boolean;
  archived: boolean;
  /** TaskTemplate.deferUntil as stored (a past value reads as none). */
  deferUntil: Date | null;
  /** A pending archive's day (the must's akrasia horizon), or null. */
  pendingArchiveDay: DayKey | null;
  /** A work tab's task: the same rules, and nothing of the game either way. */
  boardId?: string | null;
  /** TaskTemplate.captureKey: a side quest's (P31) says so, and it is never deferred past its expiry. */
  captureKey?: string | null;
}

export type DeferShape = "must" | "repeating" | "deadline" | "one-off";

/** Which of the four defers this is: a must (any), a repeating task, a deadline, another one-off. */
export function deferShapeOf(t: Pick<DecisionTemplate, "compulsory" | "recurrence" | "dueKind" | "dueDay">): DeferShape {
  if (t.compulsory) return "must";
  if (parseRule(t.recurrence)) return "repeating";
  if (t.dueKind === "DEADLINE" && t.dueDay) return "deadline";
  return "one-off";
}

/**
 * The days a repeating non-must's defer skips: today's occurrence and every one due before the
 * return day — a fixed schedule's own days (recurrence occurrencesBetween), and for AFTER and
 * TARGET rules (no fixed days) today only. None before its start day.
 */
export function skipDaysOf(t: Pick<DecisionTemplate, "recurrence" | "startDay">, today: DayKey, returnDay: DayKey): DayKey[] {
  const rule = parseRule(t.recurrence);
  if (!rule) return [];
  if (!isFixedSchedule(rule)) return t.startDay <= today ? [today] : [];
  const last = returnDay > today ? addDays(returnDay, -1) : today;
  return occurrencesBetween(rule, t.startDay, today, last);
}

/** The sheet's one line on what this defer does, before the tap. */
export function deferLineOf(shape: DeferShape, opts: { recurring?: boolean; dueLabel?: string | null; work?: boolean } = {}): string {
  switch (shape) {
    case "must":
      if (opts.work) return "It leaves the board until then.";
      return opts.recurring
        ? "It leaves the board until then. Today, and each day it is due before then, counts as not kept: nothing is skipped."
        : "It leaves the board until then. Today counts as not kept: nothing is skipped.";
    case "repeating":
      return opts.work ? "Skipped until then; its streak holds." : "Skipped until then: 0 XP, and its streak holds.";
    case "deadline":
      return `It leaves the board until then. Its deadline stays${opts.dueLabel ? ` (${opts.dueLabel})` : ""}: done after it, it is late.`;
    case "one-off":
      return "It leaves the board until then, and comes back planned for that day.";
  }
}

/** The abort sheet's line for a choice, before the tap. */
export function abortLineOf(p: { recurring: boolean; must: boolean; scope: AbortScope; endsOn?: string | null; work?: boolean }): string {
  if (!p.recurring || p.scope === "SERIES") {
    if (p.endsOn) return `A must takes seven days to stop: it leaves Today on ${p.endsOn}. Undo brings it back.`;
    return p.recurring ? "The series ends. It is archived with your reason; Undo brings it back." : "It is archived with your reason; Undo brings it back.";
  }
  if (p.must && !p.work) return "Off the board for the rest of today. Today still counts as not kept.";
  return p.work ? "Today is skipped; its streak holds." : "Today is skipped: 0 XP, and its streak holds.";
}

// ── Counts and the nudge ──────────────────────────────────────────────────

/** "Deferred 3 times — break it into steps or abort it?" from the third defer of one task. */
export function deferNudgeOf(defers: number | null | undefined): string | null {
  return defers != null && defers >= DEFER_NUDGE_AT ? `Deferred ${defers} times — break it into steps or abort it?` : null;
}

/** One decision as the board reads it (BoardData.decisions[templateId].last). */
export interface DecisionFact {
  id: string;
  kind: DecisionKind;
  scope: AbortScope | null;
  reason: string;
  reasonTag: ReasonTag | null;
  /** The life day it was decided on. */
  day: DayKey;
  /** When it comes back (ISO): a defer's target, or the day's end for a must aborted just this time. */
  untilAt: string | null;
  compulsory: boolean;
  /** When it was decided (ISO): the Undo's window. */
  at: string;
}

/** A template's decisions as the board reads them: how often it was deferred, and the latest one. */
export interface TemplateDecisions {
  /** DEFER decisions not undone: "Deferred n×". */
  defers: number;
  last: DecisionFact | null;
}

/** A TaskDecision row as read (dates as Date or ISO). */
export interface DecisionRowLike {
  id: string;
  templateId: string;
  kind: string;
  scope: string | null;
  reason: string;
  reasonTag: string | null;
  day: DayKey;
  untilAt: Date | string | null;
  compulsory: boolean;
  createdAt: Date | string;
  undoneAt?: Date | string | null;
}

const isoOrNull = (x: Date | string | null | undefined): string | null => (x == null ? null : new Date(msOf(x)).toISOString());

export function decisionFactOf(r: DecisionRowLike): DecisionFact {
  return {
    id: r.id,
    kind: r.kind === "ABORT" ? "ABORT" : "DEFER",
    scope: isAbortScope(r.scope) ? r.scope : null,
    reason: r.reason,
    reasonTag: isReasonTag(r.reasonTag) ? r.reasonTag : null,
    day: r.day,
    untilAt: isoOrNull(r.untilAt),
    compulsory: r.compulsory,
    at: isoOrNull(r.createdAt) ?? new Date(0).toISOString(),
  };
}

/** Per template: the defers not undone, and the latest decision not undone. */
export function templateDecisionsOf(rows: readonly DecisionRowLike[]): Record<string, TemplateDecisions> {
  const out: Record<string, TemplateDecisions> = {};
  const sorted = [...rows].filter((r) => r.undoneAt == null).sort((a, b) => msOf(a.createdAt) - msOf(b.createdAt) || a.id.localeCompare(b.id));
  for (const r of sorted) {
    const cur = (out[r.templateId] ??= { defers: 0, last: null });
    if (r.kind === "DEFER") cur.defers += 1;
    cur.last = decisionFactOf(r);
  }
  return out;
}

/** Whether a decision can still be undone: inside ten minutes and on the same life day (a tick's rule). */
export function canUndoDecision(at: Date | string | number, now: Date | string | number, tz: string = LIFE_TZ): boolean {
  const atMs = msOf(at);
  const nowMs = msOf(now);
  const age = nowMs - atMs;
  return Number.isFinite(age) && age >= -60_000 && age <= DECISION_UNDO_MS && dayKeyOf(new Date(atMs), tz) === dayKeyOf(new Date(nowMs), tz);
}

/** The first instant a decision made at `at` can no longer be undone (the board's clock re-renders then). */
export function decisionUndoExpiryOf(at: Date | string | number, tz: string = LIFE_TZ): number {
  const atMs = msOf(at);
  return Math.min(atMs + DECISION_UNDO_MS + 1, dayEndOf(dayKeyOf(new Date(atMs), tz), tz).getTime());
}

/** Whether a template's deferUntil hides it now. `nowMs` absent: any value the server sent is still ahead. */
export function isDeferredNow(t: { deferUntil?: string | null }, nowMs?: number | null): boolean {
  if (!t.deferUntil) return false;
  if (nowMs == null) return true;
  const ms = Date.parse(t.deferUntil);
  return Number.isFinite(ms) && ms > nowMs;
}

/**
 * A row's meta on the day a deferred task is back: "Deferred until Tue 09:00 · 2×". Null on any
 * other day, before its return, and when its latest decision is not a defer.
 */
export function deferNoteOf(facts: TemplateDecisions | null | undefined, today: DayKey, nowMs?: number | null, tz: string = LIFE_TZ): string | null {
  const last = facts?.last;
  if (!last || last.kind !== "DEFER" || !last.untilAt) return null;
  const ms = Date.parse(last.untilAt);
  if (!Number.isFinite(ms) || dayKeyOf(new Date(ms), tz) !== today) return null;
  if (nowMs != null && ms > nowMs) return null;
  return `Deferred until ${WEEKDAY_SHORT[weekdayOf(calendarKeyOf(ms, tz)) - 1]} ${clockOf(ms, tz)} · ${facts!.defers}×`;
}

// ── Hidden tasks on the board ─────────────────────────────────────────────

/** A task the board hides for a decision: in the Must lane (a must due today) or Anytime's Deferred list. */
export interface DeferredItem {
  templateId: string;
  title: string;
  /** When it comes back (ISO). */
  until: string;
  /** DEFER, or ABORT (a must aborted just this time: back once today ends). */
  kind: DecisionKind;
  reason: string | null;
  /** A must due today: drawn in the Must lane and counted there as not kept. */
  must: boolean;
  /** Today's declared rest holds it (nothing is owed): not counted against the lane. */
  held: boolean;
  /** Its latest decision, for the Undo (null when the board has no decision for it). */
  decisionId: string | null;
  decidedAt: string | null;
  defers: number;
}

/** "Deferred to Tue 09:00 · No time", "Aborted today · Not needed · back tomorrow". */
export function deferredLineOf(item: Pick<DeferredItem, "until" | "kind" | "reason">, nowMs: number, tz: string = LIFE_TZ): string {
  const reason = item.reason ? ` · ${item.reason}` : "";
  if (item.kind === "ABORT") return `Aborted today${reason} · back tomorrow`;
  return `Deferred to ${untilLabelOf(item.until, nowMs, tz)}${reason}`;
}

/** The Must lane's count with its hidden musts: "1 of 2 kept · 1 deferred" (a held one is not asked). */
export function mustCountOf(tally: { kept: number; total: number }, items: readonly Pick<DeferredItem, "must" | "held" | "kind">[]): { kept: number; total: number; deferred: number; aborted: number; text: string } {
  const asked = items.filter((i) => i.must && !i.held);
  const deferred = asked.filter((i) => i.kind === "DEFER").length;
  const aborted = asked.length - deferred;
  const total = tally.total + asked.length;
  const tail = `${deferred > 0 ? ` · ${deferred} deferred` : ""}${aborted > 0 ? ` · ${aborted} aborted` : ""}`;
  return { kept: tally.kept, total, deferred, aborted, text: `${tally.kept} of ${total} kept${tail}` };
}

/**
 * When the board's clock next needs to move for a decision: a hidden task's return, or an Undo's
 * window closing. Null when none is ahead.
 */
export function nextDecisionTick(items: readonly Pick<DeferredItem, "until" | "decidedAt">[], clockMs: number, tz: string = LIFE_TZ): number | null {
  const ahead: number[] = [];
  for (const i of items) {
    const back = Date.parse(i.until);
    if (Number.isFinite(back) && back > clockMs) ahead.push(back);
    if (i.decidedAt) {
      const exp = decisionUndoExpiryOf(i.decidedAt, tz);
      if (exp > clockMs) ahead.push(exp);
    }
  }
  return ahead.length > 0 ? Math.min(...ahead) : null;
}

// ── Plans (the server applies them) ───────────────────────────────────────

/** An instance as a decision reads it. createdAt and updatedAt tell the Undo which ones the decision wrote. */
export interface DecisionInstance {
  id: string;
  day: DayKey;
  slot: number;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** A decision row to insert. */
export interface DecisionInsert {
  id: string;
  templateId: string;
  kind: DecisionKind;
  scope: AbortScope | null;
  reason: string;
  reasonTag: ReasonTag | null;
  day: DayKey;
  untilAt: Date | null;
  compulsory: boolean;
  createdAt: Date;
}

/**
 * One transaction's writes. `expect` is the compare-and-set: the template's deferUntil and planDay
 * as read; the write fails (and nothing lands) when either moved. `at` stamps every instance the
 * decision writes (createdAt on the new SKIPPED ones, updatedAt on those moved from UNDONE), so the
 * Undo finds exactly them.
 */
export interface DecisionWrite {
  templateId: string;
  at: Date;
  expect: { deferUntil: Date | null; planDay: DayKey | null } | null;
  template: { deferUntil?: Date | null; planDay?: DayKey | null } | null;
  /** New SKIPPED slot-0 instances, one per day. */
  createSkipped: DayKey[];
  /** UNDONE instances moved to SKIPPED. */
  skipUndone: string[];
  /** Undo: SKIPPED instances the decision created, deleted. */
  removeSkipped: string[];
  /** Undo: SKIPPED instances the decision moved from UNDONE, back to UNDONE. */
  reopen: string[];
  insert: DecisionInsert | null;
  /** Undo: the decision marked undone (compare-and-set on undoneAt null). */
  undo: { id: string } | null;
}

const emptyWrite = (templateId: string, at: Date): DecisionWrite => ({
  templateId,
  at,
  expect: null,
  template: null,
  createSkipped: [],
  skipUndone: [],
  removeSkipped: [],
  reopen: [],
  insert: null,
  undo: null,
});

type Plan<T> = { ok: true; value: T } | { ok: false; error: string };
const planOk = <T>(value: T): Plan<T> => ({ ok: true, value });
const planFail = <T>(error: string): Plan<T> => ({ ok: false, error });

const DONE: ReadonlySet<string> = new Set(["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"]);

/** The refusals every decision shares: gone, a goal, the inbox. */
function commonRefusal(t: DecisionTemplate | null): string | null {
  if (!t || t.archived) return DECISION_GONE;
  if (t.kind === "GOAL") return DECISION_GOAL;
  if (t.inbox || t.kind === "IDEA_DRAFT") return DECISION_INBOX;
  return null;
}

/** Slot-0 writes that skip `days`: a new SKIPPED where nothing is, an UNDONE moved; anything settled is left. */
function skipWritesOf(days: readonly DayKey[], instances: readonly DecisionInstance[]): { createSkipped: DayKey[]; skipUndone: string[] } {
  const createSkipped: DayKey[] = [];
  const skipUndone: string[] = [];
  for (const day of days) {
    const inst = instances.find((i) => i.day === day && i.slot === 0);
    if (!inst) createSkipped.push(day);
    else if (inst.status === "UNDONE") skipUndone.push(inst.id);
  }
  return { createSkipped, skipUndone };
}

export interface DeferPlan {
  shape: DeferShape;
  write: DecisionWrite;
  untilAt: Date;
  skipped: number;
}

/** What a defer writes (see the header), or why it is refused. */
export function planDefer(
  t: DecisionTemplate | null,
  instances: readonly DecisionInstance[],
  input: { id: string; until: Date; now: Date; reason: string; reasonTag: ReasonTag | null },
  tz: string = LIFE_TZ
): Plan<DeferPlan> {
  const common = commonRefusal(t);
  if (common || !t) return planFail(common ?? DECISION_GONE);
  const { now, until } = input;
  const today = dayKeyOf(now, tz);
  if (t.deferUntil && t.deferUntil.getTime() > now.getTime()) return planFail(`Already deferred until ${untilLabelOf(t.deferUntil, now, tz)}.`);
  // A pages task (P24) is ticked by hand, so it defers like any task; every other metric completes itself.
  if (completesItself(t.autoMetric)) return planFail(DEFER_AUTO);
  const rule = parseRule(t.recurrence);
  if (!rule && t.completed) return planFail(DECISION_DONE);
  if (rule && instances.some((i) => i.day === today && DONE.has(i.status))) return planFail(DECISION_DONE_TODAY);
  const shape = deferShapeOf(t);
  const work = !!t.boardId;
  const refusal = deferTimeRefusalOf(until, now, { must: shape === "must" && !work }, tz);
  if (refusal) return planFail(refusal);

  const returnDay = dayKeyOf(until, tz);
  // A side quest (blueprint P31) comes back by its expiry at the latest: deferred past it, it would only be gone.
  const sideDay = sideExpiresOf(t);
  if (sideDay && returnDay > sideDay) return planFail(sideMoveRefusalOf(sideDay, today));
  const write = emptyWrite(t.id, now);
  write.expect = { deferUntil: t.deferUntil, planDay: t.planDay };
  write.template = { deferUntil: until };
  // A one-off returning on a later day: planDay, unless a put-off is already set (then it is kept, and Undo can tell).
  if (!rule && t.planDay == null && returnDay > today) write.template.planDay = returnDay;
  if (shape === "repeating") Object.assign(write, skipWritesOf(skipDaysOf(t, today, returnDay), instances));
  write.insert = {
    id: input.id,
    templateId: t.id,
    kind: "DEFER",
    scope: null,
    reason: input.reason,
    reasonTag: input.reasonTag,
    day: today,
    untilAt: until,
    compulsory: t.compulsory,
    createdAt: now,
  };
  return planOk({ shape, write, untilAt: until, skipped: write.createSkipped.length + write.skipUndone.length });
}

export type AbortPlan =
  /** The series ends (or a one-off goes): the archive path, then the decision row. */
  | { kind: "archive"; insert: DecisionInsert }
  /** Just this time: today skipped (a non-must) or hidden until the day ends (a must). */
  | { kind: "write"; write: DecisionWrite; untilAt: Date | null; skipped: number };

/** What an abort writes (see the header), or why it is refused. A one-off is always for good. */
export function planAbort(
  t: DecisionTemplate | null,
  instances: readonly DecisionInstance[],
  input: { id: string; scope: AbortScope; now: Date; reason: string; reasonTag: ReasonTag | null },
  tz: string = LIFE_TZ
): Plan<AbortPlan> {
  const common = commonRefusal(t);
  if (common || !t) return planFail(common ?? DECISION_GONE);
  const { now } = input;
  const today = dayKeyOf(now, tz);
  const rule = parseRule(t.recurrence);
  const doneToday = instances.some((i) => i.day === today && DONE.has(i.status));
  const insert = (scope: AbortScope, untilAt: Date | null): DecisionInsert => ({
    id: input.id,
    templateId: t.id,
    kind: "ABORT",
    scope,
    reason: input.reason,
    reasonTag: input.reasonTag,
    day: today,
    untilAt,
    compulsory: t.compulsory,
    createdAt: now,
  });

  if (!rule || input.scope === "SERIES") {
    if (!rule && t.completed) return planFail(DECISION_DONE);
    if (t.pendingArchiveDay) return planFail(`Already ending: it leaves Today on ${dayWord(t.pendingArchiveDay)}.`);
    return planOk({ kind: "archive", insert: insert("SERIES", null) });
  }

  if (doneToday) return planFail(DECISION_DONE_TODAY);
  if (t.deferUntil && t.deferUntil.getTime() > now.getTime()) return planFail(`Already off the board until ${untilLabelOf(t.deferUntil, now, tz)}.`);
  const write = emptyWrite(t.id, now);
  if (t.compulsory && !t.boardId) {
    // A must, just this time: off the board until today ends; nothing is skipped, so today counts as not kept.
    const end = dayEndOf(today, tz);
    write.expect = { deferUntil: t.deferUntil, planDay: t.planDay };
    write.template = { deferUntil: end };
    write.insert = insert("ONCE", end);
    return planOk({ kind: "write", write, untilAt: end, skipped: 0 });
  }
  const slot0 = instances.find((i) => i.day === today && i.slot === 0);
  if (slot0?.status === "SKIPPED") return planFail(ABORT_ALREADY_SKIPPED);
  Object.assign(write, skipWritesOf([today], instances));
  write.expect = { deferUntil: t.deferUntil, planDay: t.planDay };
  write.insert = insert("ONCE", null);
  return planOk({ kind: "write", write, untilAt: null, skipped: write.createSkipped.length + write.skipUndone.length });
}

export type UndoPlan =
  /** Already undone (a second tap): nothing to write. */
  | { kind: "noop" }
  /** An abort for good: the unarchive path (it also cancels a pending archive), then the decision marked undone. */
  | { kind: "unarchive" }
  | { kind: "write"; write: DecisionWrite };

/**
 * What an Undo writes, derived from the decision and the template as they stand: deferUntil back
 * to none while it is still the decision's instant; planDay back to none while it is still the
 * return day this decision wrote (it writes one only on a later day, over none); the instances it
 * created deleted and those it moved from UNDONE moved back. Ten minutes, the same life day.
 */
export function planUndo(
  d: DecisionRowLike,
  t: Pick<DecisionTemplate, "deferUntil" | "planDay" | "recurrence"> | null,
  instances: readonly DecisionInstance[],
  now: Date,
  tz: string = LIFE_TZ
): Plan<UndoPlan> {
  if (d.undoneAt != null) return planOk({ kind: "noop" });
  if (!canUndoDecision(d.createdAt, now, tz)) return planFail(DECISION_UNDO_LATE);
  if (d.kind === "ABORT" && d.scope === "SERIES") return planOk({ kind: "unarchive" });
  if (!t) return planFail(DECISION_GONE);
  const at = msOf(d.createdAt);
  const untilMs = d.untilAt == null ? null : msOf(d.untilAt);
  const write = emptyWrite(d.templateId, now);
  write.expect = { deferUntil: t.deferUntil, planDay: t.planDay };
  const template: NonNullable<DecisionWrite["template"]> = {};
  if (untilMs != null && t.deferUntil && t.deferUntil.getTime() === untilMs) template.deferUntil = null;
  if (d.kind === "DEFER" && untilMs != null && !parseRule(t.recurrence)) {
    const returnDay = dayKeyOf(new Date(untilMs), tz);
    if (t.planDay === returnDay && returnDay > d.day) template.planDay = null;
  }
  write.template = Object.keys(template).length > 0 ? template : null;
  for (const i of instances) {
    if (i.status !== "SKIPPED") continue;
    if (i.createdAt && i.createdAt.getTime() === at) write.removeSkipped.push(i.id);
    else if (i.updatedAt && i.updatedAt.getTime() === at) write.reopen.push(i.id);
  }
  write.undo = { id: d.id };
  return planOk({ kind: "write", write });
}

// ── What a decision did (the actions' answer) ─────────────────────────────

/** What a decision did, for the board's toast, its Undo and its words (task-decisions-server.ts). */
export interface DecisionOutcome {
  decisionId: string;
  templateId: string;
  title: string;
  kind: DecisionKind;
  scope: AbortScope | null;
  /** When it comes back on the board (ISO): a defer's return, or a must aborted just this time (once today ends). */
  untilAt: string | null;
  /** Occurrences marked skipped (the streak holds). */
  skipped: number;
  /** A must's day (or days) now count as not kept. */
  notKept: boolean;
  /** Defers of this task, this one included: "Deferred n×". */
  defers: number;
  /** "Deferred 3 times — break it into steps or abort it?" from the third defer. */
  nudge: string | null;
  /** An abort for good: when the archive takes effect (a must waits out its akrasia horizon: deferred, and its day). */
  archive: { effect: "immediate" | "deferred"; effectiveDay: DayKey | null } | null;
  /** A work tab's task: nothing of the game either way. */
  work: boolean;
}

/** What an Undo brought back. */
export interface UndoneDecision {
  decisionId: string;
  templateId: string;
  title: string;
  kind: DecisionKind;
  /** Daily quests (D14): an abort for good undone brings a must back near or past the cap (tasks.ts unarchiveCore). */
  mustNote?: MustNote;
}

/** The toast after a decision (its Undo is the action): "Deferred · Call the bank · back Tue 09:00". */
export function decisionToastOf(out: DecisionOutcome, nowMs: number, tz: string = LIFE_TZ): { title: string; body: string } {
  const parts: string[] = [out.title];
  let title: string;
  if (out.kind === "DEFER") {
    title = "Deferred";
    if (out.untilAt) parts.push(`back ${untilLabelOf(out.untilAt, nowMs, tz)}`);
    if (out.skipped > 0) parts.push(`${out.skipped} skipped, streak holds`);
    if (out.notKept) parts.push("today not kept");
  } else if (out.scope === "ONCE") {
    title = "Aborted just this time";
    parts.push(out.notKept ? "back tomorrow, today not kept" : out.work ? "skipped today" : "skipped today, streak holds");
  } else if (out.archive?.effect === "deferred" && out.archive.effectiveDay) {
    title = "Aborted for good";
    parts.push(`leaves Today on ${dayWord(out.archive.effectiveDay)}`);
  } else {
    title = "Aborted for good";
    parts.push("archived");
  }
  const body = parts.join(" · ");
  return { title, body: out.nudge ? `${body}. ${out.nudge}` : body };
}

/** The optimistic hold for a decision's answer (today-board BoardOp, minus its id): hidden, skipped, gone, or none. */
export function decisionOpOf(out: DecisionOutcome, today: DayKey): { kind: "defer"; templateId: string; until: string } | { kind: "skip"; templateId: string; day: DayKey } | { kind: "hide"; templateId: string } | null {
  if (out.untilAt) return { kind: "defer", templateId: out.templateId, until: out.untilAt };
  if (out.kind === "ABORT" && out.scope === "ONCE") return { kind: "skip", templateId: out.templateId, day: today };
  if (out.kind === "ABORT" && out.archive?.effect === "immediate") return { kind: "hide", templateId: out.templateId };
  return null;
}

// ── The weekly review's section ───────────────────────────────────────────

/** A decision as the weekly review reads it. */
export interface WeekDecisionRow {
  id: string;
  templateId: string;
  title: string;
  kind: string;
  scope: string | null;
  reason: string;
  day: DayKey;
  untilAt: Date | string | null;
  compulsory: boolean;
  /** The task is archived (aborted for good, or archived since): no link, a Restore instead. */
  archived: boolean;
  createdAt: Date | string;
}

export interface WeekDecisionItem {
  id: string;
  templateId: string;
  title: string;
  /** "Deferred to Tue 09:00", "Aborted just this time", "Aborted for good". */
  what: string;
  /** "Mon 12 Oct". */
  day: string;
  reason: string;
  /** Today's board, at the task (/today#t-<id>); null for an archived one. */
  href: string | null;
  /** Archived by this abort: the weekly review offers Restore (the archive's own unarchive). */
  restorable: boolean;
}

export interface WeekDecisionsView {
  deferred: number;
  aborted: number;
  /** "Deferred 2 · Aborted 1". */
  head: string;
  items: WeekDecisionItem[];
}

/** The weekly review's "Deferred n · Aborted m" section, newest first. */
export function weekDecisionsViewOf(rows: readonly WeekDecisionRow[], now: Date | number, tz: string = LIFE_TZ): WeekDecisionsView {
  const sorted = [...rows].sort((a, b) => msOf(b.createdAt) - msOf(a.createdAt) || a.id.localeCompare(b.id));
  const items = sorted.map((r): WeekDecisionItem => {
    const series = r.kind === "ABORT" && r.scope === "SERIES";
    const what =
      r.kind === "DEFER"
        ? r.untilAt
          ? `Deferred to ${untilLabelOf(r.untilAt, now, tz)}`
          : "Deferred"
        : series
          ? "Aborted for good"
          : "Aborted just this time";
    return {
      id: r.id,
      templateId: r.templateId,
      title: r.title,
      what: r.compulsory && !series ? `${what} · must, not kept` : what,
      day: dayWord(r.day),
      reason: r.reason,
      href: r.archived ? null : `/today#t-${r.templateId}`,
      restorable: r.archived && series,
    };
  });
  const deferred = rows.filter((r) => r.kind === "DEFER").length;
  const aborted = rows.length - deferred;
  return { deferred, aborted, head: `Deferred ${deferred} · Aborted ${aborted}`, items };
}
