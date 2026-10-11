/**
 * Call backs on a work tab (2026-10-12): the rules, pure and client-importable. A call back logs when a call
 * happened, how (a phone call or in person), a brief as tags (per work tab), an optional call-back task (a
 * TaskTemplate on that work board, never in the game) and an optional reminder (a date-time and how to call
 * back) that web push sends once (src/lib/reminders-server.ts) and the bell shows while it is open
 * (src/lib/notifications.ts). The server half is callbacks-server.ts; the UI is components/work/callbacks.
 *
 *   CALLBACK_ACTIONS · ACTION_WORDS · actionOf(raw)        PHONE | IN_PERSON, 'Phone call' | 'In person'
 *   normalizeTag(raw) · cleanTags(raw)                     lowercase, trimmed, spaces collapsed, no leading '#',
 *                                                          ≤ TAG_MAX_CHARS each, ≤ TAG_MAX a call back, deduped
 *   recentTagsOf(rows) · tagSuggestionsOf(recent, typed, chosen)   a tab's own tags, newest first, for autocomplete
 *   cleanCallBackInput(raw, now, prev?)                    the sheet's fields, checked, or the line that says why
 *   remindPatchOf(prev, next)                              the reminder columns to write: moving, setting or
 *                                                          clearing remindAt ALWAYS clears remindSentAt
 *   reminderStateOf(row, now) · reminderOpen(row, now)     none | set | due | sent; open = the bell shows it
 *   callBackTaskParse(title, dueDay)                       the task as a plain capture (a TASK, never a goal)
 *   wallOfInstant · instantOfWall                          <input type="datetime-local"> values in LIFE_TZ
 *   callBackHref · CALLBACK_PARAM · callBackAnchorId       /today/work/<board>?callback=<id>, the card's id
 *   workReminderNotices(rows, now)                         the bell's rows for due call backs and customer tasks
 */
import { LIFE_TZ, dayKeyOf, zonedToInstant, type DayKey } from "./life-day";
import type { ParsedCapture } from "./life-types";
import type { Notice } from "./notifications";

// ── Actions ───────────────────────────────────────────────────────────────

export const CALLBACK_ACTIONS = ["PHONE", "IN_PERSON"] as const;
export type CallBackAction = (typeof CALLBACK_ACTIONS)[number];

/** How the card and the sheet name an action. */
export const ACTION_WORDS: Record<CallBackAction, string> = { PHONE: "Phone call", IN_PERSON: "In person" };

export function actionOf(raw: unknown): CallBackAction | null {
  return raw === "PHONE" || raw === "IN_PERSON" ? raw : null;
}

/** The words for a stored action; an unknown one reads as its own words, never blank. */
export function actionWords(raw: string | null | undefined): string {
  const a = actionOf(raw);
  if (a) return ACTION_WORDS[a];
  const words = String(raw ?? "").trim().toLowerCase().replace(/_+/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Call";
}

// ── Tags ──────────────────────────────────────────────────────────────────

/** A tag's longest form, in characters. */
export const TAG_MAX_CHARS = 24;
/** The most tags one call back carries. */
export const TAG_MAX = 8;
/** How many of a tab's recent tags the sheet offers at once. */
export const TAG_SUGGEST_MAX = 6;
/** How many distinct recent tags a tab keeps for autocomplete. */
export const RECENT_TAGS_MAX = 40;

export const TAG_LONG = `Keep each tag to ${TAG_MAX_CHARS} characters.`;
export const TAGS_MANY = `Up to ${TAG_MAX} tags on a call back.`;

const CONTROL = /[\u0000-\u001f\u007f]/g;

/** A tag as stored: lowercase, trimmed, inner spaces collapsed, no leading '#' or commas. Empty: ''. */
export function normalizeTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(CONTROL, " ").replace(/,/g, " ").trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

const charCount = (s: string) => [...s].length;

/** The tags as stored (normalized, deduped in order), or why not: one too long, or more than TAG_MAX. */
export function cleanTags(raw: unknown): { ok: true; tags: string[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : [];
  const tags: string[] = [];
  for (const r of list) {
    const t = normalizeTag(r);
    if (!t) continue;
    if (charCount(t) > TAG_MAX_CHARS) return { ok: false, error: TAG_LONG };
    if (!tags.includes(t)) tags.push(t);
  }
  if (tags.length > TAG_MAX) return { ok: false, error: TAGS_MANY };
  return { ok: true, tags };
}

/** A tab's tags, newest call back first, each once (the rows are that tab's own, newest first). */
export function recentTagsOf(rows: readonly { tags: readonly string[] }[], max: number = RECENT_TAGS_MAX): string[] {
  const out: string[] = [];
  for (const r of rows) {
    for (const raw of r.tags) {
      const t = normalizeTag(raw);
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * What the tag field offers: with nothing typed, the tab's newest tags; else those that start with the typed
 * words, then those that contain them. Never a tag already on the call back.
 */
export function tagSuggestionsOf(recent: readonly string[], typed: string, chosen: readonly string[], max: number = TAG_SUGGEST_MAX): string[] {
  const q = normalizeTag(typed);
  const free = recent.filter((t) => !chosen.includes(t));
  if (!q) return free.slice(0, max);
  const starts = free.filter((t) => t.startsWith(q));
  const contains = free.filter((t) => !t.startsWith(q) && t.includes(q));
  return [...starts, ...contains].slice(0, max);
}

// ── Times ─────────────────────────────────────────────────────────────────

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function partsIn(d: Date, tz: string): Record<string, string> {
  const out: Record<string, string> = {};
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  for (const p of f.formatToParts(d)) if (p.type !== "literal") out[p.type] = p.value;
  return out;
}

/** An instant as a datetime-local value ('2026-10-12T15:30') on the wall clock of `tz`. */
export function wallOfInstant(d: Date, tz: string = LIFE_TZ): string {
  const p = partsIn(d, tz);
  const hour = String(Number(p.hour) % 24).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

/** A datetime-local value read on the wall clock of `tz`, or null when it is not one. */
export function instantOfWall(value: unknown, tz: string = LIFE_TZ): Date | null {
  if (typeof value !== "string") return null;
  const m = WALL_RE.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const base = zonedToInstant(y, mo, d, h, tz);
  const at = new Date(base.getTime() + mi * 60_000);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** The reminder the sheet suggests when it is turned on: tomorrow at 09:00 on the user's clock. */
export function defaultRemindWall(now: Date, tz: string = LIFE_TZ): string {
  const p = partsIn(now, tz);
  const next = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T09:00`;
}

/** 'Today · 15:30', 'Tomorrow · 09:00', 'Yesterday · 11:05', else 'Mon 12 Oct · 15:30' (in `tz`). */
export function whenLabel(iso: string | Date, now: Date, tz: string = LIFE_TZ): string {
  const at = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(at.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const dayOf = (d: Date) => wallOfInstant(d, tz).slice(0, 10);
  const day = dayOf(at);
  const shift = (n: number) => dayOf(new Date(now.getTime() + n * 86_400_000));
  if (day === shift(0)) return `Today · ${time}`;
  if (day === shift(1)) return `Tomorrow · ${time}`;
  if (day === shift(-1)) return `Yesterday · ${time}`;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(at).replace(/,/g, "");
  return `${date} · ${time}`;
}

/** '15:30' on the same calendar day as `now`, else '12 Oct 15:30' (the bell's and the notification's words). */
export function shortTime(at: Date, now: Date, tz: string = LIFE_TZ): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  if (wallOfInstant(at, tz).slice(0, 10) === wallOfInstant(now, tz).slice(0, 10)) return time;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(at);
  return `${date} ${time}`;
}

// ── The sheet's input ─────────────────────────────────────────────────────

/** A call-back task's title, at most (tasks.ts TITLE_MAX). */
export const CALLBACK_TASK_MAX = 200;
/** A customer ID as typed, at most. */
export const CUSTOMER_ID_MAX = 40;
/** A call back's time may sit this far from now either way. */
const AT_RANGE_MS = 2 * 366 * 86_400_000;
/** A new or moved reminder may start this far in the past (it is then sent on the next run). */
export const REMIND_GRACE_MS = 5 * 60_000;

export const AT_BAD = "Pick when the call happened.";
export const ACTION_BAD = "Pick Phone call or In person.";
export const TASK_LONG = `Keep the call back task to ${CALLBACK_TASK_MAX} characters.`;
export const REMIND_BAD = "Pick when to be reminded, and how to call back.";
export const REMIND_PAST = "Pick a reminder time from now on.";
export const CUSTOMER_LONG = `A customer ID is ${CUSTOMER_ID_MAX} characters at most.`;
export const CUSTOMER_OFF = "This tab keeps no customer list.";
export const CALLBACK_GONE = "That call back no longer exists.";
export const CALLBACK_ARCHIVED = "That call back was archived.";

/** The refusal for a customer ID no open customer of the tab carries. */
export function customerUnknown(number: string): string {
  return `No customer “${number}” on this tab. Check the ID, or leave it empty.`;
}

/** What the sheet sends (the browser's words; the server checks every field). */
export interface CallBackInput {
  /** When the call happened (ISO). */
  at: string;
  action: string;
  tags: string[];
  /** The call-back task's title; '' for none. */
  task: string;
  /** The reminder, or null for none. */
  remind: { at: string; action: string } | null;
  /** A customer ID of this tab ('' for none); only on a tab with its customer list on. */
  customer: string;
  /** The sheet's nonce for this save (the task's capture key, so a retry never adds a second task). */
  key?: string;
}

export interface CleanCallBack {
  at: Date;
  action: CallBackAction;
  tags: string[];
  task: string | null;
  remind: { at: Date; action: CallBackAction } | null;
  customer: string | null;
  key: string | null;
}

const KEY_RE = /^[A-Za-z0-9_-]{4,48}$/;

function isoDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The sheet's fields, checked. `prevRemindAt` (an edit) lets an unmoved reminder stay in the past; a new or
 * moved one must be from now on (REMIND_GRACE_MS of slack).
 */
export function cleanCallBackInput(raw: unknown, now: Date, prevRemindAt: Date | null = null): { ok: true; value: CleanCallBack } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const at = isoDate(r.at);
  if (!at || Math.abs(at.getTime() - now.getTime()) > AT_RANGE_MS) return { ok: false, error: AT_BAD };
  const action = actionOf(r.action);
  if (!action) return { ok: false, error: ACTION_BAD };
  const tags = cleanTags(r.tags);
  if (!tags.ok) return tags;
  const taskRaw = typeof r.task === "string" ? r.task.replace(CONTROL, " ").trim().replace(/\s+/g, " ") : "";
  if (charCount(taskRaw) > CALLBACK_TASK_MAX) return { ok: false, error: TASK_LONG };
  let remind: CleanCallBack["remind"] = null;
  if (r.remind != null) {
    const rr = (typeof r.remind === "object" ? r.remind : {}) as Record<string, unknown>;
    const rAt = isoDate(rr.at);
    const rAction = actionOf(rr.action);
    if (!rAt || !rAction || Math.abs(rAt.getTime() - now.getTime()) > AT_RANGE_MS) return { ok: false, error: REMIND_BAD };
    const moved = !prevRemindAt || prevRemindAt.getTime() !== rAt.getTime();
    if (moved && rAt.getTime() < now.getTime() - REMIND_GRACE_MS) return { ok: false, error: REMIND_PAST };
    remind = { at: rAt, action: rAction };
  }
  const customerRaw = typeof r.customer === "string" ? r.customer.replace(CONTROL, " ").trim() : "";
  if (charCount(customerRaw) > CUSTOMER_ID_MAX) return { ok: false, error: CUSTOMER_LONG };
  const key = typeof r.key === "string" && KEY_RE.test(r.key) ? r.key : null;
  return { ok: true, value: { at, action, tags: tags.tags, task: taskRaw || null, remind, customer: customerRaw || null, key } };
}

// ── The reminder's columns ────────────────────────────────────────────────

export interface ReminderColumns {
  remindAt: Date | null;
  remindAction: string | null;
  remindSentAt: Date | null;
}

/**
 * The reminder columns an edit writes. Setting, moving or clearing remindAt clears remindSentAt (a moved
 * reminder is sent again at its new time; a cleared one starts fresh if set later). Only the action changing
 * keeps remindSentAt: the reminder already went at that time.
 */
export function remindPatchOf(prev: ReminderColumns | null, next: { at: Date; action: string } | null): Partial<ReminderColumns> {
  if (!next) return { remindAt: null, remindAction: null, remindSentAt: null };
  if (prev?.remindAt && prev.remindAt.getTime() === next.at.getTime()) return { remindAction: next.action };
  return { remindAt: next.at, remindAction: next.action, remindSentAt: null };
}

/** The life day a reminder falls on: the call-back task's due day. */
export function reminderDayOf(at: Date): DayKey {
  return dayKeyOf(at);
}

export type ReminderState = "none" | "set" | "due" | "sent";

/** none: no reminder; set: ahead; due: its time has come and it is waiting for the next run; sent: pushed. */
export function reminderStateOf(row: { remindAt: string | Date | null; remindSentAt: string | Date | null }, now: Date): ReminderState {
  if (!row.remindAt) return "none";
  if (row.remindSentAt) return "sent";
  return new Date(row.remindAt).getTime() <= now.getTime() ? "due" : "set";
}

/**
 * A reminder the bell shows (and the card offers 'Done' on): its time has come, the call back is not archived,
 * and its task (when it has one) is neither done nor archived. Sent or not: push is a nudge, the bell the list.
 */
export function reminderOpen(
  row: { remindAt: string | Date | null; archived?: boolean; task?: { done: boolean; archived?: boolean } | null },
  now: Date
): boolean {
  if (!row.remindAt || row.archived) return false;
  if (new Date(row.remindAt).getTime() > now.getTime()) return false;
  return !row.task || (!row.task.done && !row.task.archived);
}

// ── The call-back task ────────────────────────────────────────────────────

/**
 * The call-back task as the capture path stores it (tasks.ts createTemplateCore with the board's id): the title
 * as typed, read as plain words (no grammar, so 'idea:' or 'goal:' in it never makes an idea or a goal), a
 * TASK, planned on the reminder's day when it has one, else undated (Anytime).
 */
export function callBackTaskParse(title: string, dueDay: DayKey | null): ParsedCapture {
  return {
    title,
    mode: "TASK",
    kind: "TASK",
    recurrence: null,
    dueDay,
    dueKind: dueDay ? "PLANNED" : null,
    estMinutes: null,
    compulsory: false,
    compulsoryWarning: null,
    inbox: false,
    horizon: null,
    track: null,
    intrinsic: false,
    mvv: null,
    autoMetric: null,
    autoTarget: null,
    doneNow: false,
    parentHint: null,
    answer: null,
    tokens: [],
  };
}

// ── What the work tab draws ───────────────────────────────────────────────

/** A call back as the work tab's card shows it (plain values: it crosses into the client). */
export interface CallBackView {
  id: string;
  /** ISO. */
  at: string;
  action: CallBackAction;
  tags: string[];
  task: { id: string; title: string; done: boolean } | null;
  customer: { id: string; number: string; name: string } | null;
  remindAt: string | null;
  remindAction: CallBackAction | null;
  remindSentAt: string | null;
}

/** A customer of the tab, for the Customer ID field's match. */
export interface CustomerRef {
  id: string;
  number: string;
  name: string;
}

/** The work tab's call backs (TodayBoard's `callBacks`). */
export interface CallBacksData {
  boardId: string;
  /** Newest first (by when the call happened). */
  rows: CallBackView[];
  /** The tab holds older open call backs than these. */
  older: boolean;
  /** This tab's tags, newest first: the tag field's autocomplete. */
  recentTags: string[];
  /** The tab keeps a customer list: the sheet shows the Customer ID field. */
  crmOn: boolean;
  /** The tab's open customers (crmOn only). */
  customers: CustomerRef[];
  /** The ?callback=<id> asked for, when it names one of this tab's open call backs. */
  focus: string | null;
  /** ?callback=<id> named something that is not here (archived, gone, another tab's). */
  focusMissing: boolean;
  /** The render's clock (ISO): every label is read against it, so the server and browser agree. */
  nowIso: string;
}

/** The newest this many load with the page; the rest say so. */
export const CALLBACK_LOAD_MAX = 100;
/** The section shows this many first, and this many more per 'Show more'. */
export const CALLBACK_SHOWN = 8;

/** The tap URL's parameter, and the card's element id. */
export const CALLBACK_PARAM = "callback";

export function callBackAnchorId(id: string): string {
  return `cb-${id}`;
}

/** A call back on its work tab, highlighted (the bell's link; the push opens /today?board=…, which redirects here). */
export function callBackHref(boardId: string, id: string): string {
  return `/today/work/${encodeURIComponent(boardId)}?${CALLBACK_PARAM}=${encodeURIComponent(id)}`;
}

/** A customer task on its customer's page (the CRM's; the reminder's tap URL and the bell's link). */
export function customerTaskHref(boardId: string, customerId: string, taskId: string): string {
  return `/today/work/${encodeURIComponent(boardId)}/customers/${encodeURIComponent(customerId)}?task=${encodeURIComponent(taskId)}`;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** A ?callback= value that can be an id, or null. */
export function focusIdOf(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && ID_RE.test(v) ? v : null;
}

/** The brief as one line: 'acme, pricing'. */
export function briefOf(tags: readonly string[]): string {
  return tags.filter(Boolean).join(", ");
}

/** The Customer ID field's match among the tab's customers (ignoring case), or null. */
export function matchCustomer(customers: readonly CustomerRef[], typed: string): CustomerRef | null {
  const q = typed.trim().toLowerCase();
  if (!q) return null;
  return customers.find((c) => c.number.trim().toLowerCase() === q) ?? null;
}

// ── The bell ──────────────────────────────────────────────────────────────

/** A due call back reminder as the bell reads it. */
export interface DueCallBackRow {
  id: string;
  boardId: string;
  boardName: string;
  action: string;
  remindAction: string | null;
  tags: string[];
  remindAt: Date;
  taskTitle: string | null;
}

/** A due customer task as the bell reads it. */
export interface DueCustomerTaskRow {
  id: string;
  boardId: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  title: string;
  dueAt: Date;
}

/** The bell shows this many work reminders one by one; the rest are one line. */
export const BELL_WORK_MAX = 4;
export const WORK_REMINDERS_MORE_ID = "work-reminders-more";

/**
 * The bell's rows: each open call back reminder ('Call back · Phone call') and each due customer task
 * ('Customer task'), oldest first, at most BELL_WORK_MAX, then one 'N more' line. Warnings: they ask something
 * of you, so the bell counts them. Today's own Asks never repeat them (board-ui todayAsksOf reads named ids).
 */
export function workReminderNotices(rows: { callBacks: readonly DueCallBackRow[]; customerTasks: readonly DueCustomerTaskRow[] }, now: Date, tz: string = LIFE_TZ): Notice[] {
  type Item = { at: number; notice: Notice };
  const items: Item[] = [
    ...rows.callBacks.map((c): Item => {
      const brief = [briefOf(c.tags), (c.taskTitle ?? "").trim()].filter(Boolean).join(" · ");
      return {
        at: c.remindAt.getTime(),
        notice: {
          id: `callback-${c.id}`,
          group: "Due",
          tone: "warn",
          title: `Call back · ${actionWords(c.remindAction ?? c.action)}`,
          detail: [brief, c.boardName, `due ${shortTime(c.remindAt, now, tz)}`].filter(Boolean).join(" · "),
          href: callBackHref(c.boardId, c.id),
          action: "Open",
        },
      };
    }),
    ...rows.customerTasks.map((t): Item => ({
      at: t.dueAt.getTime(),
      notice: {
        id: `customer-task-${t.id}`,
        group: "Due",
        tone: "warn",
        title: "Customer task",
        detail: [t.title.trim(), `${t.customerName} (#${t.customerNumber})`, `due ${shortTime(t.dueAt, now, tz)}`].filter(Boolean).join(" · "),
        href: customerTaskHref(t.boardId, t.customerId, t.id),
        action: "Open",
      },
    })),
  ].sort((a, b) => a.at - b.at || a.notice.id.localeCompare(b.notice.id));
  const shown = items.slice(0, BELL_WORK_MAX).map((i) => i.notice);
  const rest = items.length - shown.length;
  if (rest > 0) {
    const first = items[BELL_WORK_MAX].notice;
    shown.push({
      id: WORK_REMINDERS_MORE_ID,
      group: "Due",
      tone: "warn",
      title: `${rest} more work reminder${rest === 1 ? "" : "s"}`,
      detail: "Call backs and customer tasks that are due.",
      href: first.href,
      action: "Open",
    });
  }
  return shown;
}
