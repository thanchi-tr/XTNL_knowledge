/**
 * Scheduled tasks on a work tab (2026-10-20; migration 20261227000000_scheduled_tasks): the ONE list that replaced
 * call backs and customer tasks, the rules, pure and client-importable. A scheduled task says when (a time, or a day:
 * all day, its reminder at 09:00 that day), what (a title, a detail), how (a channel: a call, a visit, an email, a
 * message, or other), optionally for whom (a customer of the same tab) and whether to remind (one push, sent once by
 * src/lib/reminders-server.ts; the bell and the in-app banner show it in place). The server half is
 * scheduled-tasks-server.ts; the UI is components/work (the Office workspace's Agenda, the customer page's list, the
 * sheet, the in-app reminder banner).
 *
 *   CHANNELS · CHANNEL_WORDS · CHANNEL_ICON · channelOf(raw)      CALL | VISIT | EMAIL | MESSAGE | OTHER
 *   logActionOf(channel)                 the customer-log action Done's "Log to history" starts from
 *   cleanScheduledInput(raw, tz?)        the sheet's fields, checked (title 1..200, detail ≤ 500, a datetime-local
 *                                        read in LIFE_TZ, all day, remind, channel, customer), or the line saying why
 *   remindSentAtAfter(prev, nextDueAt)   moving dueAt ALWAYS clears remindSentAt (as remindPatchOf did); else kept
 *   reminderStateOf(t, now)              none | set | due | sent
 *   agendaOf(rows, now, tz?)             Overdue · Today · Upcoming (14 days) · Later · Done (today and 7 days back),
 *                                        read on the life day (04:00, life-day.ts)
 *   snoozePresetsOf(now) · snoozeTarget(preset, now)   +10 min (the banner), +1 hour, this evening 18:00, tomorrow
 *                                        09:00, next Monday 09:00; "Pick…" is the sheet
 *   reminderLinesOf · scheduledPayloadOf · scheduledNotices   what the push, the bell and the banner say
 *   scheduledTaskHref · focusParamOf · taskAnchorId    /today/work/<board>?task=<id>; ?callback=<legacy id> still lands
 *   bannerKeyOf · bannerQueueOf · nextBannerInMs · bannerHeadOf   the in-app reminder's once-per-device rules
 *
 * Work, never the game: nothing here pays XP, writes the ledger or touches the streak.
 */
import { LIFE_TZ, addDays, dayKeyOf, todayKey, weekdayOf, zonedToInstant, type DayKey } from "./life-day";
import { instantOfLocalInput, isRowId, localInputOf, phoneHref, wallClockOf, type CustomerAction } from "./customers";
import { customerLabelOf } from "./customer-search";
import type { TaskIcon } from "./task-style";
import type { Notice } from "./notifications";

// ── Channels ────────────────────────────────────────────────────────────────

export const CHANNELS = ["CALL", "VISIT", "EMAIL", "MESSAGE", "OTHER"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_WORDS: Readonly<Record<Channel, string>> = { CALL: "Call", VISIT: "Visit", EMAIL: "Email", MESSAGE: "Message", OTHER: "Other" };

/** Each channel's glyph: the app's own task icons (task-style.ts TASK_ICONS), always beside its word or in a label. */
export const CHANNEL_ICON: Readonly<Record<Channel, TaskIcon>> = { CALL: "phone", VISIT: "people", EMAIL: "mail", MESSAGE: "chat", OTHER: "calendar" };

export function channelOf(raw: unknown): Channel | null {
  return typeof raw === "string" && (CHANNELS as readonly string[]).includes(raw) ? (raw as Channel) : null;
}

/** The call backs' old actions: PHONE → CALL, IN_PERSON → VISIT (the backfill's own mapping). */
export function channelOfLegacyAction(action: string | null | undefined): Channel {
  return action === "IN_PERSON" ? "VISIT" : "CALL";
}

/** The customer-log action Done's "Log to history" starts from (OTHER: the user picks one). */
export function logActionOf(channel: Channel): CustomerAction | null {
  return channel === "OTHER" ? null : channel;
}

// ── The sheet's input ───────────────────────────────────────────────────────

/** A title's longest form: the call-back task's cap (tasks.ts TITLE_MAX), so every backfilled title stays editable. */
export const SCHEDULED_TITLE_MAX = 200;
export const SCHEDULED_DETAIL_MAX = 500;
/** An all-day task's reminder hour (and the hour its dueAt holds), in LIFE_TZ. */
export const ALL_DAY_HOUR = 9;

export const SCHEDULED_TITLE_EMPTY = "Say what the task is.";
export const SCHEDULED_TITLE_LONG = `Keep the task to ${SCHEDULED_TITLE_MAX} characters.`;
export const SCHEDULED_DETAIL_LONG = `Keep the detail to ${SCHEDULED_DETAIL_MAX} characters.`;
export const SCHEDULED_WHEN_BAD = "Pick a date and a time.";
export const SCHEDULED_DAY_BAD = "Pick a date.";
export const SCHEDULED_CHANNEL_BAD = "Pick how: a call, a visit, an email, a message or other.";
export const SCHEDULED_CUSTOMER_BAD = "That customer can't be linked here.";
export const SCHEDULED_GONE = "That scheduled task no longer exists.";
export const SCHEDULED_ARCHIVED = "That scheduled task was archived.";
export const SCHEDULED_CUSTOMER_GONE = "That customer is not on this tab.";
export const SCHEDULED_CUSTOMER_ARCHIVED = "That customer is archived. Restore them first.";
export const SCHEDULED_CRM_OFF = "This tab keeps no customer list. Turn it on in the tab's menu.";
export const SCHEDULED_LOG_NO_CUSTOMER = "Only a task for a customer can be logged to their history.";
export const SCHEDULED_SNOOZE_BAD = "Pick when to be reminded again.";

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };
const yes = <T>(value: T): Clean<T> => ({ ok: true, value });
const no = <T>(error: string): Clean<T> => ({ ok: false, error });

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const chars = (s: string) => [...s].length;

/** What the sheet sends (the browser's words; the server checks every field again). */
export interface ScheduledTaskInput {
  title: string;
  detail?: string | null;
  /** A datetime-local value on the user's clock ('2026-10-20T14:30'); with allDay only its date is read ('2026-10-20' too). */
  when: string;
  allDay?: boolean;
  channel?: string;
  /** One reminder at its time (default on). */
  remind?: boolean;
  /** A customer of this tab (its row id); null or "" for none. */
  customerId?: string | null;
}

export interface CleanScheduledTask {
  title: string;
  detail: string | null;
  dueAt: Date;
  allDay: boolean;
  channel: Channel;
  remind: boolean;
  customerId: string | null;
}

const MIN_WHEN = Date.UTC(2000, 0, 1);
const MAX_WHEN = Date.UTC(2100, 0, 1);
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** The instant an all-day task holds: ALL_DAY_HOUR on that date, on the user's clock. */
export function allDayInstantOf(day: DayKey, tz: string = LIFE_TZ): Date {
  const [y, m, d] = day.split("-").map(Number);
  return zonedToInstant(y, m, d, ALL_DAY_HOUR, tz);
}

/** The sheet's fields, checked: the same rules on both sides. */
export function cleanScheduledInput(raw: unknown, tz: string = LIFE_TZ): Clean<CleanScheduledTask> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.replace(CONTROL, " ").replace(/\s+/g, " ").trim() : "";
  if (!title) return no(SCHEDULED_TITLE_EMPTY);
  if (chars(title) > SCHEDULED_TITLE_MAX) return no(SCHEDULED_TITLE_LONG);
  const detailRaw = typeof r.detail === "string" ? r.detail.replace(/\r\n?/g, "\n").replace(CONTROL, " ").trim() : "";
  if (chars(detailRaw) > SCHEDULED_DETAIL_MAX) return no(SCHEDULED_DETAIL_LONG);
  const allDay = r.allDay === true;
  const whenRaw = typeof r.when === "string" ? r.when.trim() : "";
  let dueAt: Date | null = null;
  if (allDay) {
    const m = DAY_RE.exec(whenRaw);
    const day = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    if (day && Number(m![2]) >= 1 && Number(m![2]) <= 12 && Number(m![3]) >= 1 && Number(m![3]) <= 31) dueAt = allDayInstantOf(day, tz);
    if (!dueAt || Number.isNaN(dueAt.getTime()) || dueAt.getTime() < MIN_WHEN || dueAt.getTime() >= MAX_WHEN) return no(SCHEDULED_DAY_BAD);
  } else {
    dueAt = instantOfLocalInput(whenRaw, tz);
    if (!dueAt || Number.isNaN(dueAt.getTime()) || dueAt.getTime() < MIN_WHEN || dueAt.getTime() >= MAX_WHEN) return no(SCHEDULED_WHEN_BAD);
  }
  const channel = r.channel === undefined || r.channel === null || r.channel === "" ? "OTHER" : channelOf(r.channel);
  if (!channel) return no(SCHEDULED_CHANNEL_BAD);
  const customerRaw = typeof r.customerId === "string" ? r.customerId.trim() : "";
  if (customerRaw && !isRowId(customerRaw)) return no(SCHEDULED_CUSTOMER_BAD);
  return yes({ title, detail: detailRaw || null, dueAt, allDay, channel, remind: r.remind !== false, customerId: customerRaw || null });
}

/** The sheet's starting `when` for a new task: the next whole hour today, or 09:00 tomorrow after 17:00. */
export function defaultWhenOf(now: Date, tz: string = LIFE_TZ): string {
  const w = wallClockOf(now, tz);
  const at = w.h >= 17 ? zonedToInstant(w.y, w.m, w.d + 1, 9, tz) : zonedToInstant(w.y, w.m, w.d, w.h + 1, tz);
  return localInputOf(at, tz);
}

/** A task's `when` as the sheet shows it again: the datetime-local value (an all-day task's date at its hour). */
export function whenInputOf(dueAt: Date | string, tz: string = LIFE_TZ): string {
  return localInputOf(typeof dueAt === "string" ? new Date(dueAt) : dueAt, tz);
}

// ── The reminder ────────────────────────────────────────────────────────────

/**
 * remindSentAt after a write: moving dueAt ALWAYS clears it (the reminder is armed for the new time, as callbacks'
 * remindPatchOf did); anything else keeps it, so a reminder already sent is never sent twice for the same time.
 */
export function remindSentAtAfter(prev: { dueAt: Date; remindSentAt: Date | null }, nextDueAt: Date): Date | null {
  return prev.dueAt.getTime() === nextDueAt.getTime() ? prev.remindSentAt : null;
}

/**
 * The dueAt an edit writes: the sheet reads and writes whole minutes, so a time it shows unchanged (the same minute)
 * keeps the stored instant exactly (a snoozed or backfilled task's seconds), and an edit of anything else never
 * counts as a move (it never re-arms a sent reminder).
 */
export function keptDueAt(prevDueAt: Date, nextDueAt: Date): Date {
  return Math.floor(prevDueAt.getTime() / 60_000) === Math.floor(nextDueAt.getTime() / 60_000) ? prevDueAt : nextDueAt;
}

export type ReminderState = "none" | "set" | "due" | "sent";

/** none: off, done or archived; set: ahead; due: its time has come and the next run sends it; sent: pushed. */
export function reminderStateOf(
  t: { remind: boolean; dueAt: Date | string; remindSentAt: Date | string | null; doneAt?: Date | string | null; archivedAt?: Date | string | null },
  now: Date
): ReminderState {
  if (!t.remind || t.doneAt || t.archivedAt) return "none";
  if (t.remindSentAt) return "sent";
  return new Date(t.dueAt).getTime() <= now.getTime() ? "due" : "set";
}

/** Whether the push dispatcher may send it now (the claim's own test, in TypeScript). */
export function scheduledRemindDue(
  t: { remind: boolean; dueAt: Date; remindSentAt: Date | null; doneAt: Date | null; archivedAt: Date | null },
  now: Date,
  scope: { boardArchived?: boolean; customerArchived?: boolean } = {}
): boolean {
  if (scope.boardArchived || scope.customerArchived) return false;
  return t.remind && !t.remindSentAt && !t.doneAt && !t.archivedAt && t.dueAt.getTime() <= now.getTime();
}

// ── The agenda ──────────────────────────────────────────────────────────────

export interface ScheduledCustomerRef {
  id: string;
  number: string;
  name: string;
  phone: string | null;
}

/** A scheduled task as the views draw it (plain values: it crosses into the client). */
export interface ScheduledView {
  id: string;
  boardId: string;
  /** ISO. */
  dueAt: string;
  allDay: boolean;
  title: string;
  detail: string | null;
  channel: Channel;
  remind: boolean;
  remindSentAt: string | null;
  doneAt: string | null;
  customer: ScheduledCustomerRef | null;
}

export type AgendaSectionId = "overdue" | "today" | "upcoming" | "later" | "done";

/** The sections, in order, and their headings. Phase 2 (follow-ups, deals) adds its own sections to this list. */
export const AGENDA_SECTIONS: readonly { id: AgendaSectionId; title: string }[] = [
  { id: "overdue", title: "Overdue" },
  { id: "today", title: "Today" },
  { id: "upcoming", title: "Upcoming" },
  { id: "later", title: "Later" },
  { id: "done", title: "Done" },
];

/** Upcoming: the next this many life days after today. */
export const UPCOMING_DAYS = 14;
/** Done: today and this many life days back. */
export const DONE_DAYS = 7;

/**
 * The section a task is in on the agenda, or null (done longer ago than DONE_DAYS). Read on the life day (the day
 * turns at 04:00): a timed task is overdue once its time has passed; an all-day task once its day has ended.
 */
export function sectionOfTask(t: { dueAt: string | Date; allDay: boolean; doneAt: string | Date | null }, now: Date, tz: string = LIFE_TZ): AgendaSectionId | null {
  const today = todayKey(now, tz);
  if (t.doneAt) return dayKeyOf(new Date(t.doneAt), tz) >= addDays(today, -DONE_DAYS) ? "done" : null;
  const due = new Date(t.dueAt);
  const day = dayKeyOf(due, tz);
  if (t.allDay ? day < today : due.getTime() < now.getTime()) return "overdue";
  if (day <= today) return "today";
  return day <= addDays(today, UPCOMING_DAYS) ? "upcoming" : "later";
}

export interface Agenda<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
  later: T[];
  done: T[];
}

/** The open tasks soonest first, an all-day task before the timed ones of its day; Done most recent first. */
export function agendaOf<T extends { id: string; dueAt: string | Date; allDay: boolean; doneAt: string | Date | null }>(rows: readonly T[], now: Date, tz: string = LIFE_TZ): Agenda<T> {
  const out: Agenda<T> = { overdue: [], today: [], upcoming: [], later: [], done: [] };
  for (const r of rows) {
    const s = sectionOfTask(r, now, tz);
    if (s) out[s].push(r);
  }
  const ms = (v: string | Date) => new Date(v).getTime();
  const open = (a: T, b: T) => {
    const da = dayKeyOf(new Date(a.dueAt), tz);
    const db = dayKeyOf(new Date(b.dueAt), tz);
    if (da !== db) return da < db ? -1 : 1;
    return Number(b.allDay) - Number(a.allDay) || ms(a.dueAt) - ms(b.dueAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
  out.overdue.sort(open);
  out.today.sort(open);
  out.upcoming.sort(open);
  out.later.sort(open);
  out.done.sort((a, b) => ms(b.doneAt as string | Date) - ms(a.doneAt as string | Date) || (a.id < b.id ? -1 : 1));
  return out;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A row's time column: its day ("Today", "Tomorrow", "Yesterday", else "Tue 22 Oct", the year when it is not this
 * one) and its time ("14:30", or "All day"). Days are life days (an 01:30 task is the evening before's).
 */
export function rowWhenOf(t: { dueAt: string | Date; allDay: boolean }, now: Date, tz: string = LIFE_TZ): { day: string; time: string } {
  const at = new Date(t.dueAt);
  const key = dayKeyOf(at, tz);
  const today = todayKey(now, tz);
  const w = wallClockOf(at, tz);
  const time = t.allDay ? "All day" : `${pad(w.h)}:${pad(w.mi)}`;
  if (key === today) return { day: "Today", time };
  if (key === addDays(today, 1)) return { day: "Tomorrow", time };
  if (key === addDays(today, -1)) return { day: "Yesterday", time };
  const [y, m, d] = key.split("-").map(Number);
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { day: `${weekday} ${d} ${MONTH[m - 1]}${y !== Number(today.slice(0, 4)) ? ` ${y}` : ""}`, time };
}

/** The row's one-line when: "Today · 14:30", "Tue 22 Oct · All day". */
export function whenLineOf(t: { dueAt: string | Date; allDay: boolean }, now: Date, tz: string = LIFE_TZ): string {
  const w = rowWhenOf(t, now, tz);
  return `${w.day} · ${w.time}`;
}

/** The detail's first line, spaces collapsed (the row's preview). */
export function detailPreviewOf(detail: string | null | undefined): string | null {
  const line = (detail ?? "").split(/\r?\n/).map((l) => l.trim().replace(/\s+/g, " ")).find((l) => l !== "");
  return line ?? null;
}

/** The text a customer chip shows: "Jane Nguyen · C-1042". */
export const customerChipOf = customerLabelOf;

/** A phone's tap to text (sms:, the digits and a leading +). */
export function smsHref(phone: string): string {
  return phoneHref(phone).replace(/^tel:/, "sms:");
}

/** Customers to watch (the agenda's side column until Phase 2's follow-ups): those with an overdue task, most overdue first. */
export function customersToWatchOf(overdue: readonly ScheduledView[]): { customer: ScheduledCustomerRef; overdue: number; oldest: string }[] {
  const by = new Map<string, { customer: ScheduledCustomerRef; overdue: number; oldest: string }>();
  for (const t of overdue) {
    if (!t.customer) continue;
    const had = by.get(t.customer.id);
    if (had) {
      had.overdue++;
      if (t.dueAt < had.oldest) had.oldest = t.dueAt;
    } else by.set(t.customer.id, { customer: t.customer, overdue: 1, oldest: t.dueAt });
  }
  return [...by.values()].sort((a, b) => (a.oldest < b.oldest ? -1 : a.oldest > b.oldest ? 1 : 0) || b.overdue - a.overdue);
}

// ── Snooze ──────────────────────────────────────────────────────────────────

export type SnoozePreset = "10min" | "hour" | "evening" | "tomorrow" | "monday";

/** The agenda's Snooze menu, in order ("Pick…" opens the sheet). The banner's "Snooze 10 min" is its own. */
export const SNOOZE_MENU: readonly SnoozePreset[] = ["hour", "evening", "tomorrow", "monday"];
export const SNOOZE_LABEL: Readonly<Record<SnoozePreset, string>> = {
  "10min": "Snooze 10 min",
  hour: "+1 hour",
  evening: "This evening 18:00",
  tomorrow: "Tomorrow 09:00",
  monday: "Next Monday 09:00",
};
export const EVENING_HOUR = 18;
export const MORNING_HOUR = 9;

export function snoozePresetOf(raw: unknown): SnoozePreset | null {
  return raw === "10min" || raw === "hour" || raw === "evening" || raw === "tomorrow" || raw === "monday" ? raw : null;
}

/** A life day's hour as an instant. */
function hourOn(day: DayKey, hour: number, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return zonedToInstant(y, m, d, hour, tz);
}

/**
 * Where a preset moves a task, from now: +10 min, +1 hour (each up to the whole minute), 18:00 this life day, 09:00 the next life day, 09:00 on the
 * Monday after this life day's week day (a Monday goes to the next one). Null when it would not be ahead (this evening
 * after 18:00).
 */
export function snoozeTarget(preset: SnoozePreset, now: Date, tz: string = LIFE_TZ): Date | null {
  const today = todayKey(now, tz);
  let at: Date;
  switch (preset) {
    case "10min":
      at = new Date(Math.ceil((now.getTime() + 10 * 60_000) / 60_000) * 60_000);
      break;
    case "hour":
      at = new Date(Math.ceil((now.getTime() + 60 * 60_000) / 60_000) * 60_000);
      break;
    case "evening":
      at = hourOn(today, EVENING_HOUR, tz);
      break;
    case "tomorrow":
      at = hourOn(addDays(today, 1), MORNING_HOUR, tz);
      break;
    case "monday":
      at = hourOn(addDays(today, 8 - weekdayOf(today)), MORNING_HOUR, tz);
      break;
  }
  return at.getTime() > now.getTime() ? at : null;
}

/** The Snooze menu's presets that are ahead of now, with where each lands. */
export function snoozePresetsOf(now: Date, tz: string = LIFE_TZ): { preset: SnoozePreset; label: string; at: Date }[] {
  return SNOOZE_MENU.flatMap((preset) => {
    const at = snoozeTarget(preset, now, tz);
    return at ? [{ preset, label: SNOOZE_LABEL[preset], at }] : [];
  });
}

// ── Links ───────────────────────────────────────────────────────────────────

/** The agenda's highlight parameter (a reminder's tap, the bell, the search). */
export const TASK_PARAM = "task";
/** The call backs' old parameter: ?callback=<CallBack id> resolves to the scheduled task with that legacyCallBackId. */
export const LEGACY_CALLBACK_PARAM = "callback";

/** A scheduled task on its tab's agenda, highlighted: /today/work/<board>?task=<id>. */
export function scheduledTaskHref(boardId: string, id: string): string {
  return `/today/work/${encodeURIComponent(boardId)}?${TASK_PARAM}=${encodeURIComponent(id)}`;
}

/** A row's element id on the agenda (and on a customer's page). */
export function taskAnchorId(id: string): string {
  return `st-${id}`;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const idParam = (raw: unknown): string | null => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && ID_RE.test(v) ? v : null;
};

/** What the address asks the agenda to show: ?task=<id> (a task's id, or an old customer task's), else ?callback=<id>. */
export function focusParamOf(query: { [key: string]: unknown }): { kind: "task" | "callback"; id: string } | null {
  const task = idParam(query[TASK_PARAM]);
  if (task) return { kind: "task", id: task };
  const cb = idParam(query[LEGACY_CALLBACK_PARAM]);
  return cb ? { kind: "callback", id: cb } : null;
}

// ── What a reminder says (the push, the bell, the banner) ──────────────────

/** A due task as the push, the bell and the banner read it. */
export interface DueScheduled {
  id: string;
  userId?: string;
  boardId: string;
  boardName?: string;
  title: string;
  channel: string;
  dueAt: Date;
  allDay: boolean;
  customer: { name: string; number: string } | null;
}

function timeWords(at: Date, allDay: boolean, now: Date, tz: string): string {
  const w = wallClockOf(at, tz);
  const n = wallClockOf(now, tz);
  const sameDay = w.y === n.y && w.m === n.m && w.d === n.d;
  const time = allDay ? "today" : `${pad(w.h)}:${pad(w.mi)}`;
  if (sameDay) return time;
  return `${w.d} ${MONTH[w.m - 1]}${allDay ? "" : ` ${time}`}`;
}

/**
 * The reminder's lines: the task's title, and "Call · Jane Nguyen · C-1042 · 14:30" (the channel, the customer by
 * name and ID, when: the time on its own day, else the date; an all-day task "today").
 */
export function reminderLinesOf(t: DueScheduled, now: Date, tz: string = LIFE_TZ): { title: string; body: string } {
  const channel = CHANNEL_WORDS[channelOf(t.channel) ?? "OTHER"];
  return {
    title: t.title.trim() || "Scheduled task",
    body: [channel, t.customer ? customerLabelOf(t.customer) : null, timeWords(t.dueAt, t.allDay, now, tz)].filter(Boolean).join(" · "),
  };
}

/** The web push (push-server PushPayload's shape): one tag per task, its agenda row on a tap. */
export function scheduledPayloadOf(t: DueScheduled, now: Date, tz: string = LIFE_TZ): { title: string; body: string; tag: string; url: string } {
  const lines = reminderLinesOf(t, now, tz);
  return { ...lines, tag: `scheduled-${t.id}`, url: scheduledTaskHref(t.boardId, t.id) };
}

/** The bell shows this many scheduled tasks one by one; the rest are one line. */
export const BELL_SCHEDULED_MAX = 4;
export const SCHEDULED_MORE_ID = "scheduled-more";

/**
 * The bell's rows: each open, due scheduled task with its reminder on ("Scheduled task · Call"), oldest first, at most
 * BELL_SCHEDULED_MAX, then one "N more" line. Warnings: they ask something of you, so the bell counts them.
 */
export function scheduledNotices(rows: readonly DueScheduled[], now: Date, tz: string = LIFE_TZ): Notice[] {
  const sorted = [...rows].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || (a.id < b.id ? -1 : 1));
  const shown: Notice[] = sorted.slice(0, BELL_SCHEDULED_MAX).map((t) => ({
    id: `scheduled-${t.id}`,
    group: "Due",
    tone: "warn",
    title: `Scheduled task · ${CHANNEL_WORDS[channelOf(t.channel) ?? "OTHER"]}`,
    detail: [t.title.trim(), t.customer ? customerLabelOf(t.customer) : null, t.boardName ?? null, `due ${timeWords(t.dueAt, t.allDay, now, tz)}`].filter(Boolean).join(" · "),
    href: scheduledTaskHref(t.boardId, t.id),
    action: "Open",
  }));
  const rest = sorted.length - shown.length;
  if (rest > 0) {
    const first = sorted[BELL_SCHEDULED_MAX];
    shown.push({
      id: SCHEDULED_MORE_ID,
      group: "Due",
      tone: "warn",
      title: `${rest} more scheduled task${rest === 1 ? "" : "s"} due`,
      detail: "On the work tabs' agendas.",
      href: scheduledTaskHref(first.boardId, first.id),
      action: "Open",
    });
  }
  return shown;
}

// ── The in-app reminder banner (once per device per due time) ──────────────

/** What /api/scheduled/due answers: the user's open tasks with a reminder, due in the next day or the last day. */
export interface BannerTask {
  id: string;
  boardId: string;
  boardName: string;
  title: string;
  channel: Channel;
  /** ISO. */
  dueAt: string;
  allDay: boolean;
  customer: { id: string; name: string; number: string } | null;
}

/** The route reads tasks due up to this far ahead (local timers fire them on time)… */
export const BANNER_AHEAD_MS = 24 * 60 * 60_000;
/** …and overdue ones up to this far back (older ones are on the agenda, not worth a banner). */
export const BANNER_BEHIND_MS = 24 * 60 * 60_000;
/** The banner refetches this often while the page is visible (and on focus and visibilitychange). */
export const BANNER_POLL_MS = 60_000;
/** This device's record of what it has shown (localStorage; read and written in try/catch). */
export const BANNER_STORAGE_KEY = "xtnl:work:reminders-shown";
/** Shown keys older than this are pruned. */
export const BANNER_KEEP_MS = 3 * 24 * 60 * 60_000;
/** A local timer is never set further ahead than this (the next poll re-arms it). */
export const BANNER_TIMER_MAX_MS = 6 * 60 * 60_000;

/** Once per device per due time: a moved task (a new dueAt) shows again. */
export function bannerKeyOf(t: { id: string; dueAt: string }): string {
  return `${t.id}@${new Date(t.dueAt).toISOString()}`;
}

/** The tasks the banner shows now: due (dueAt ≤ now), within BANNER_BEHIND_MS, not yet shown on this device, oldest first. */
export function bannerQueueOf<T extends { id: string; dueAt: string }>(tasks: readonly T[], now: number, shown: ReadonlySet<string>): T[] {
  return tasks
    .filter((t) => {
      const at = Date.parse(t.dueAt);
      return Number.isFinite(at) && at <= now && now - at <= BANNER_BEHIND_MS && !shown.has(bannerKeyOf(t));
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || (a.id < b.id ? -1 : 1));
}

/** How long until the next not-yet-shown task comes due (capped), or null when none is ahead. */
export function nextBannerInMs(tasks: readonly { id: string; dueAt: string }[], now: number, shown: ReadonlySet<string>): number | null {
  let best: number | null = null;
  for (const t of tasks) {
    const at = Date.parse(t.dueAt);
    if (!Number.isFinite(at) || at <= now || shown.has(bannerKeyOf(t))) continue;
    if (best === null || at - now < best) best = at - now;
  }
  return best === null ? null : Math.min(best, BANNER_TIMER_MAX_MS);
}

/** The banner's head line: one task's title, or "3 due · Next: <title>" for a stack. */
export function bannerHeadOf(stack: readonly { title: string }[]): string {
  if (stack.length === 0) return "";
  if (stack.length === 1) return stack[0].title;
  return `${stack.length} due · Next: ${stack[0].title}`;
}

/** The banner's meta line for its first task: the customer (name · ID), when, and the channel. */
export function bannerMetaOf(t: BannerTask, now: Date, tz: string = LIFE_TZ): string {
  return [t.customer ? customerLabelOf(t.customer) : null, whenLineOf(t, now, tz), CHANNEL_WORDS[t.channel]].filter(Boolean).join(" · ");
}

/** The device's shown keys, pruned (keys of tasks due more than BANNER_KEEP_MS ago go). */
export function prunedShown(raw: unknown, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && now - v <= BANNER_KEEP_MS) out[k] = v;
  }
  return out;
}

/** The banner's soft sound (two quiet sine partials, under celebrate.ts SOUND_GAIN_MAX) and its short haptic. */
export const REMINDER_TONES: readonly (readonly [freq: number, delay: number, len: number, gain: number])[] = [
  [587.33, 0, 0.28, 0.03],
  [880, 0.12, 0.34, 0.025],
];
export const REMINDER_HAPTIC: readonly number[] = [12, 60, 12];
