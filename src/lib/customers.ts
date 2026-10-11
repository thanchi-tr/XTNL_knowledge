/**
 * Customers (2026-10-12; migration 20261218000000_customers): a work tab's
 * own customer list. A tab switches it on in its menu (WorkBoard.crmOn, off
 * by default; turning it off hides the list and deletes nothing). Pure: the
 * cores (customers-server.ts), the pages under /today/work/<id>/customers,
 * the work tab's card, the shell's title and scripts/customers-check.ts all
 * import it.
 *
 *   A customer      their own ID as typed (Customer.number: trimmed, 1..24, unique on the tab ignoring
 *                   case among open customers; the database holds it too, a partial unique index on
 *                   (boardId, lower(number)) WHERE archivedAt IS NULL), a name (1..60), a nickname (<= 40)
 *                   and a phone (digits, spaces, + - ( ), <= 24; called through a tel: link)
 *   An interaction  a dated entry in their log: Purchase · Inquiry · Complaint · Credit check, and a brief (<= 280)
 *   A task          a scheduled to-do (a date-time, a title 1..80, a detail <= 500) with ONE push reminder at its
 *                   time (CustomerTask.remind; the call backs' dispatcher sends it and stamps remindSentAt)
 *
 *   searchCustomers(list, q)        by ID first: the exact ID, then IDs that start with q; names and
 *                                   nicknames after, as their own group
 *   nextCustomerNumber(numbers)     the next ID to suggest while every ID on the tab is a number
 *   remindSentAtAfterEdit / …Undo   a task's reminder is re-armed when its time moves or it is switched back
 *                                   on (remindSentAt cleared); a time already gone by is never pushed late
 *   customerTaskRemindDue(t, now)   what a reminder dispatcher may send: due, on, not done, not sent, kept
 *   customersHref / customerHref    /today/work/<board>/customers[/<customer>[?task=<task>]] (the reminder's tap URL)
 *
 * Work, never the game: nothing here (or in the cores) pays XP, writes the
 * ledger or touches the streak.
 */
import { LIFE_TZ, zonedToInstant } from "./life-day";
import { WORK_BOARD_PATH, isBoardId } from "./work-boards";

export const CUSTOMER_NUMBER_MAX = 24;
export const CUSTOMER_NAME_MAX = 60;
export const CUSTOMER_NICKNAME_MAX = 40;
export const CUSTOMER_PHONE_MAX = 24;
export const INTERACTION_BRIEF_MAX = 280;
export const CUSTOMER_TASK_TITLE_MAX = 80;
export const CUSTOMER_TASK_DETAIL_MAX = 500;

/** What happened, in a customer's log. Stored as these strings (CustomerInteraction.action). */
export const CUSTOMER_ACTIONS = ["PURCHASE", "INQUIRY", "COMPLAINT", "CREDIT_CHECK"] as const;
export type CustomerAction = (typeof CUSTOMER_ACTIONS)[number];

export const CUSTOMER_ACTION_LABEL: Readonly<Record<CustomerAction, string>> = {
  PURCHASE: "Purchase",
  INQUIRY: "Inquiry",
  COMPLAINT: "Complaint",
  CREDIT_CHECK: "Credit check",
};

/** A one-character mark for each action, always drawn beside its word (never alone). */
export const CUSTOMER_ACTION_GLYPH: Readonly<Record<CustomerAction, string>> = {
  PURCHASE: "$",
  INQUIRY: "?",
  COMPLAINT: "!",
  CREDIT_CHECK: "✓",
};

export const CUSTOMER_NUMBER_EMPTY = "Give the customer an ID.";
export const CUSTOMER_NUMBER_LONG = `Keep the ID to ${CUSTOMER_NUMBER_MAX} characters.`;
export const CUSTOMER_NUMBER_BAD = "An ID is one line of text.";
/** The partial unique index said no (or the cores saw the same ID, ignoring case). */
export const CUSTOMER_NUMBER_TAKEN = "That ID is already used on this tab";
export const CUSTOMER_RESTORE_TAKEN = "Another customer on this tab now has that ID. Change one of the two IDs, then restore.";
export const CUSTOMER_NAME_EMPTY = "Give the customer a name.";
export const CUSTOMER_NAME_LONG = `Keep the name to ${CUSTOMER_NAME_MAX} characters.`;
export const CUSTOMER_NICKNAME_LONG = `Keep the nickname to ${CUSTOMER_NICKNAME_MAX} characters.`;
export const CUSTOMER_PHONE_BAD = "A phone number holds digits, spaces, +, - and brackets.";
export const CUSTOMER_PHONE_LONG = `Keep the phone number to ${CUSTOMER_PHONE_MAX} characters.`;
export const INTERACTION_ACTION_BAD = "Pick what happened: Purchase, Inquiry, Complaint or Credit check.";
export const INTERACTION_BRIEF_LONG = `Keep the brief to ${INTERACTION_BRIEF_MAX} characters.`;
export const WHEN_BAD = "Pick a date and a time.";
export const CUSTOMER_TASK_TITLE_EMPTY = "Say what the task is.";
export const CUSTOMER_TASK_TITLE_LONG = `Keep the task to ${CUSTOMER_TASK_TITLE_MAX} characters.`;
export const CUSTOMER_TASK_DETAIL_LONG = `Keep the detail to ${CUSTOMER_TASK_DETAIL_MAX} characters.`;
/** Every customer write on a tab whose list is switched off. */
export const CRM_OFF = "The customer list is off on this tab. Turn it on in the tab's menu.";
export const CUSTOMER_GONE = "That customer no longer exists.";
export const CUSTOMER_ARCHIVED = "That customer is archived. Restore them to change anything.";
export const INTERACTION_GONE = "That entry no longer exists.";
export const CUSTOMER_TASK_GONE = "That task no longer exists.";

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };
const yes = <T>(value: T): Clean<T> => ({ ok: true, value });
const no = <T>(error: string): Clean<T> => ({ ok: false, error });

const chars = (s: string) => [...s].length;
const oneLine = (raw: unknown) => (typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "");
const CONTROL = /[\u0000-\u001f\u007f]/;

// ── Validation ──────────────────────────────────────────────────────────────

/** The customer's own ID, as typed: trimmed, 1..24 characters, one line. */
export function cleanCustomerNumber(raw: unknown): Clean<string> {
  const n = typeof raw === "string" ? raw.trim() : "";
  if (!n) return no(CUSTOMER_NUMBER_EMPTY);
  if (CONTROL.test(n)) return no(CUSTOMER_NUMBER_BAD);
  if (chars(n) > CUSTOMER_NUMBER_MAX) return no(CUSTOMER_NUMBER_LONG);
  return yes(n);
}

/** How IDs are compared (the database's lower(number)): "A-12" and "a-12" are one ID. */
export function numberKey(n: string): string {
  return n.trim().toLowerCase();
}

/** A name: trimmed, spaces collapsed, 1..60 characters. */
export function cleanCustomerName(raw: unknown): Clean<string> {
  const n = oneLine(raw);
  if (!n) return no(CUSTOMER_NAME_EMPTY);
  if (chars(n) > CUSTOMER_NAME_MAX) return no(CUSTOMER_NAME_LONG);
  return yes(n);
}

/** A nickname: optional (empty is none), spaces collapsed, at most 40 characters. */
export function cleanNickname(raw: unknown): Clean<string | null> {
  const n = oneLine(raw);
  if (!n) return yes(null);
  if (chars(n) > CUSTOMER_NICKNAME_MAX) return no(CUSTOMER_NICKNAME_LONG);
  return yes(n);
}

const PHONE_RE = /^[0-9+\-() ]+$/;

/** A phone number: optional, digits with spaces, +, - and brackets (at least one digit), at most 24 characters. */
export function cleanPhone(raw: unknown): Clean<string | null> {
  const p = oneLine(raw);
  if (!p) return yes(null);
  if (!PHONE_RE.test(p) || !/\d/.test(p)) return no(CUSTOMER_PHONE_BAD);
  if (chars(p) > CUSTOMER_PHONE_MAX) return no(CUSTOMER_PHONE_LONG);
  return yes(p);
}

/** The phone's tap-to-call link: the digits, and a leading + when it has one ("+61 (2) 9000-1234" → tel:+61290001234). */
export function phoneHref(phone: string): string {
  const t = phone.trim();
  return `tel:${t.startsWith("+") ? "+" : ""}${t.replace(/\D/g, "")}`;
}

/** One of CUSTOMER_ACTIONS. */
export function cleanAction(raw: unknown): Clean<CustomerAction> {
  return typeof raw === "string" && (CUSTOMER_ACTIONS as readonly string[]).includes(raw) ? yes(raw as CustomerAction) : no(INTERACTION_ACTION_BAD);
}

export function isCustomerAction(raw: unknown): raw is CustomerAction {
  return cleanAction(raw).ok;
}

/** A brief: optional (empty is ""), trimmed, at most 280 characters; line breaks kept. */
export function cleanBrief(raw: unknown): Clean<string> {
  const b = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
  if (chars(b) > INTERACTION_BRIEF_MAX) return no(INTERACTION_BRIEF_LONG);
  return yes(b);
}

/** A task's title: trimmed, spaces collapsed, 1..80 characters. */
export function cleanTaskTitle(raw: unknown): Clean<string> {
  const t = oneLine(raw);
  if (!t) return no(CUSTOMER_TASK_TITLE_EMPTY);
  if (chars(t) > CUSTOMER_TASK_TITLE_MAX) return no(CUSTOMER_TASK_TITLE_LONG);
  return yes(t);
}

/** A task's detail: optional (empty is none), at most 500 characters; line breaks kept. */
export function cleanTaskDetail(raw: unknown): Clean<string | null> {
  const d = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
  if (!d) return yes(null);
  if (chars(d) > CUSTOMER_TASK_DETAIL_MAX) return no(CUSTOMER_TASK_DETAIL_LONG);
  return yes(d);
}

const MIN_WHEN = Date.UTC(2000, 0, 1);
const MAX_WHEN = Date.UTC(2100, 0, 1);

/** An instant (an ISO string or a Date) between 2000 and 2100. */
export function cleanWhen(raw: unknown): Clean<Date> {
  const d = raw instanceof Date ? new Date(raw.getTime()) : typeof raw === "string" && raw.trim() ? new Date(raw.trim()) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getTime() < MIN_WHEN || d.getTime() >= MAX_WHEN) return no(WHEN_BAD);
  return yes(d);
}

/** A row id (a cuid): what the pages, the actions and the tap URL accept. */
export function isRowId(id: unknown): id is string {
  return isBoardId(id);
}

// ── IDs: order, the numeric keyboard, the next one ─────────────────────────

/** IDs in natural order ("2" before "10", "A-9" before "a-10"). */
export function compareNumbers(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);
}

const DIGITS = /^\d+$/;

/** Every ID on the tab is a number (and there is at least one): the ID fields get the numeric keyboard. */
export function idsNumeric(numbers: readonly string[]): boolean {
  return numbers.length > 0 && numbers.every((n) => DIGITS.test(n.trim()));
}

/**
 * The ID to suggest for a new customer while the tab's IDs are all numbers:
 * one past the highest, keeping its zero padding ("0041" → "0042"). None
 * when there is no ID yet, any ID is not a number, or the next would pass 24 digits.
 */
export function nextCustomerNumber(numbers: readonly string[]): string | null {
  if (!idsNumeric(numbers)) return null;
  let best = numbers[0].trim();
  let max = BigInt(best);
  for (const raw of numbers) {
    const n = raw.trim();
    const v = BigInt(n);
    if (v > max || (v === max && n.length > best.length)) {
      max = v;
      best = n;
    }
  }
  let next = (max + BigInt(1)).toString();
  if (best.length > max.toString().length) next = next.padStart(best.length, "0");
  return next.length <= CUSTOMER_NUMBER_MAX ? next : null;
}

/** Whether `number` is already another kept customer's ID on the tab (ignoring case): the add sheet's early word. */
export function numberUsed(customers: readonly { id: string; number: string }[], number: string, except?: string | null): boolean {
  const key = numberKey(number);
  return customers.some((c) => c.id !== except && numberKey(c.number) === key);
}

// ── Search ─────────────────────────────────────────────────────────────────

export interface SearchableCustomer {
  id: string;
  number: string;
  name: string;
  nickname: string | null;
  archivedAt?: Date | string | null;
}

export interface CustomerSearch<C> {
  query: string;
  /** The customer whose ID is exactly the query (ignoring case): Enter opens them. */
  exact: C | null;
  /** IDs that start with the query, in natural order (the exact one not repeated). */
  byId: C[];
  /** Name or nickname matches not already listed by ID: word starts first, then anywhere, then by name. */
  byName: C[];
}

export const SEARCH_ID_MAX = 30;
export const SEARCH_NAME_MAX = 20;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The customer search, by ID first. An archived customer is never found
 * (they are listed apart, to restore). An empty query is no search (null).
 */
export function searchCustomers<C extends SearchableCustomer>(list: readonly C[], raw: string): CustomerSearch<C> | null {
  const query = (raw ?? "").trim();
  if (!query) return null;
  const key = numberKey(query);
  const open = list.filter((c) => !c.archivedAt);
  const exact = open.find((c) => numberKey(c.number) === key) ?? null;
  const byId = open
    .filter((c) => c !== exact && numberKey(c.number).startsWith(key))
    .sort((a, b) => compareNumbers(a.number, b.number))
    .slice(0, SEARCH_ID_MAX);
  const listed = new Set<C>([...(exact ? [exact] : []), ...byId]);
  const q = fold(query);
  const rank = (c: C): number => {
    let best = 3;
    for (const field of [c.name, c.nickname ?? ""]) {
      const f = fold(field);
      if (!f) continue;
      if (f.startsWith(q)) best = Math.min(best, 0);
      else if (f.split(/[\s'’-]+/).some((w) => w.startsWith(q))) best = Math.min(best, 1);
      else if (f.includes(q)) best = Math.min(best, 2);
    }
    return best;
  };
  const byName = open
    .filter((c) => !listed.has(c))
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name, "en", { sensitivity: "base" }) || compareNumbers(a.c.number, b.c.number))
    .slice(0, SEARCH_NAME_MAX)
    .map((x) => x.c);
  return { query, exact, byId, byName };
}

/** What Enter in the search opens: the exact ID, else the only customer found, else nothing. */
export function searchPick<C>(s: CustomerSearch<C> | null): C | null {
  if (!s) return null;
  if (s.exact) return s.exact;
  const all = [...s.byId, ...s.byName];
  return all.length === 1 ? all[0] : null;
}

// ── Time: the user's own zone (LIFE_TZ), the same on the server and in the browser ─

const MS_DAY = 86_400_000;
const wallFormatters = new Map<string, Intl.DateTimeFormat>();
function wallFormatter(tz: string): Intl.DateTimeFormat {
  let f = wallFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    wallFormatters.set(tz, f);
  }
  return f;
}

/** The wall clock an instant reads in a zone. */
export function wallClockOf(instant: Date, tz: string = LIFE_TZ): { y: number; m: number; d: number; h: number; mi: number } {
  const p: Record<string, number> = {};
  for (const part of wallFormatter(tz).formatToParts(instant)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** A datetime-local field's value for an instant, in the zone: "2026-10-12T14:30". */
export function localInputOf(instant: Date, tz: string = LIFE_TZ): string {
  const w = wallClockOf(instant, tz);
  return `${pad(w.y, 4)}-${pad(w.m)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** The instant a datetime-local value names in the zone, or null when it is not one. */
export function instantOfLocalInput(value: string, tz: string = LIFE_TZ): Date | null {
  const m = LOCAL_INPUT.exec((value ?? "").trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return new Date(zonedToInstant(y, mo, d, h, tz).getTime() + mi * 60_000);
}

/** The next local midnight: a task due before it is due today. */
export function endOfLocalDay(now: Date, tz: string = LIFE_TZ): Date {
  const w = wallClockOf(now, tz);
  return zonedToInstant(w.y, w.m, w.d + 1, 0, tz);
}

/** A new task's time when the sheet opens: tomorrow at 09:00. */
export function defaultTaskDue(now: Date, tz: string = LIFE_TZ): Date {
  const w = wallClockOf(now, tz);
  return zonedToInstant(w.y, w.m, w.d + 1, 9, tz);
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today 14:30", "Tomorrow 09:00", "Yesterday 16:10", "Tue 14 Oct, 09:00" (and the year when it is not this one). */
export function whenLabel(at: Date, now: Date, tz: string = LIFE_TZ): string {
  const a = wallClockOf(at, tz);
  const n = wallClockOf(now, tz);
  const diff = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(n.y, n.m - 1, n.d)) / MS_DAY);
  const time = `${pad(a.h)}:${pad(a.mi)}`;
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  if (diff === -1) return `Yesterday ${time}`;
  const weekday = WEEKDAY[new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay()];
  return `${weekday} ${a.d} ${MONTH[a.m - 1]}${a.y !== n.y ? ` ${a.y}` : ""}, ${time}`;
}

// ── Tasks and their one reminder ───────────────────────────────────────────

export type CustomerTaskState = "done" | "overdue" | "today" | "upcoming";

/** Done; overdue (its time has passed); due later today; or upcoming. */
export function taskStateOf(t: { dueAt: Date; doneAt: Date | null }, now: Date, tz: string = LIFE_TZ): CustomerTaskState {
  if (t.doneAt) return "done";
  if (t.dueAt.getTime() < now.getTime()) return "overdue";
  return t.dueAt.getTime() < endOfLocalDay(now, tz).getTime() ? "today" : "upcoming";
}

/** The open tasks soonest first (the overdue ones lead, flagged), then the done ones, most recent first. */
export function sortTasks<T extends { id: string; dueAt: Date; doneAt: Date | null }>(tasks: readonly T[]): { open: T[]; done: T[] } {
  const open = tasks.filter((t) => !t.doneAt).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || (a.id < b.id ? -1 : 1));
  const done = tasks.filter((t) => t.doneAt).sort((a, b) => (b.doneAt as Date).getTime() - (a.doneAt as Date).getTime());
  return { open, done };
}

/** Open tasks due by the end of today (overdue included), and how many of them are overdue. */
export interface DueCount {
  due: number;
  overdue: number;
}

export function dueCountOf(dueAts: readonly Date[], now: Date, tz: string = LIFE_TZ): DueCount {
  const end = endOfLocalDay(now, tz).getTime();
  let due = 0;
  let overdue = 0;
  for (const d of dueAts) {
    if (d.getTime() >= end) continue;
    due++;
    if (d.getTime() < now.getTime()) overdue++;
  }
  return { due, overdue };
}

/** The work tab card's chip: "2 due today", "1 overdue", "1 overdue · 2 today"; null with nothing due. */
export function dueChipText(c: DueCount): string | null {
  if (c.due <= 0) return null;
  if (c.overdue <= 0) return `${c.due} due today`;
  if (c.overdue >= c.due) return `${c.overdue} overdue`;
  return `${c.overdue} overdue · ${c.due - c.overdue} today`;
}

/** A reminder whose time is further back than this when it is armed is not sent late (it is marked spent). */
export const REMIND_LATE_MS = 2 * 60_000;

/**
 * remindSentAt for a reminder armed for `dueAt`: null (the dispatcher sends
 * it at its time), or `now` when that time is already gone by (more than
 * REMIND_LATE_MS ago): a task typed in for this morning shows as overdue and
 * pushes nothing.
 */
export function armedRemindSentAt(dueAt: Date, now: Date): Date | null {
  return dueAt.getTime() > now.getTime() - REMIND_LATE_MS ? null : now;
}

/**
 * remindSentAt after an edit: re-armed (armedRemindSentAt) when the time
 * moved or the reminder was switched back on; otherwise kept, so a reminder
 * already sent is never sent twice for the same time.
 */
export function remindSentAtAfterEdit(
  prev: { dueAt: Date; remind: boolean; remindSentAt: Date | null },
  next: { dueAt: Date; remind: boolean },
  now: Date
): Date | null {
  const moved = prev.dueAt.getTime() !== next.dueAt.getTime();
  const backOn = next.remind && !prev.remind;
  return moved || backOn ? armedRemindSentAt(next.dueAt, now) : prev.remindSentAt;
}

/** remindSentAt when a done task is opened again: kept when sent; a time gone by is not pushed late. */
export function remindSentAtAfterUndo(t: { dueAt: Date; remindSentAt: Date | null }, now: Date): Date | null {
  return t.remindSentAt ?? armedRemindSentAt(t.dueAt, now);
}

/**
 * Whether a reminder dispatcher may send this task's push now: its time has
 * come, the reminder is on, it is not done, not sent, not archived; and its
 * customer is kept on an open tab whose list is on.
 */
export function customerTaskRemindDue(
  t: { dueAt: Date; remind: boolean; doneAt: Date | null; remindSentAt: Date | null; archivedAt: Date | null },
  now: Date,
  scope: { customerArchived?: boolean; boardArchived?: boolean; crmOn?: boolean } = {}
): boolean {
  if (scope.customerArchived || scope.boardArchived || scope.crmOn === false) return false;
  return t.remind && !t.doneAt && !t.remindSentAt && !t.archivedAt && t.dueAt.getTime() <= now.getTime();
}

// ── Paths ──────────────────────────────────────────────────────────────────

/** A work tab's customer list. */
export function customersHref(boardId: string): string {
  return `${WORK_BOARD_PATH}/${boardId}/customers`;
}

/** The tap URL's query parameter: the task a reminder was for. */
export const TASK_PARAM = "task";

/** A customer's page; with a task, the reminder's tap URL (/today/work/<b>/customers/<c>?task=<t>: that task is highlighted). */
export function customerHref(boardId: string, customerId: string, taskId?: string | null): string {
  const base = `${customersHref(boardId)}/${customerId}`;
  return taskId ? `${base}?${TASK_PARAM}=${encodeURIComponent(taskId)}` : base;
}

/** The customer list or a customer page a path is on, or null. */
export function customersPathOf(pathname: string | null | undefined): { boardId: string; customerId: string | null } | null {
  if (!pathname) return null;
  const m = /^\/today\/work\/([^/?#]+)\/customers(?:\/([^/?#]+))?\/?(?:[?#]|$)/.exec(pathname);
  if (!m || !isBoardId(m[1])) return null;
  if (m[2] !== undefined && !isRowId(m[2])) return null;
  return { boardId: m[1], customerId: m[2] ?? null };
}

/** The `?task=` of the tap URL: a task id, or null (several, or a malformed one, read as none). */
export function taskParamOf(raw: string | string[] | undefined | null): string | null {
  return typeof raw === "string" && isRowId(raw) ? raw : null;
}

// ── What the pages hand their client views (dates as ISO strings) ──────────

export interface CustomerListItem {
  id: string;
  number: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  /** Open tasks due by the end of today (overdue included), and the overdue ones. */
  due: number;
  overdue: number;
}

export interface ArchivedCustomerItem {
  id: string;
  number: string;
  name: string;
  archivedAt: string;
}

export interface CustomerDetail {
  id: string;
  number: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  archived: boolean;
}

export interface CustomerTaskView {
  id: string;
  dueAt: string;
  title: string;
  detail: string | null;
  remind: boolean;
  doneAt: string | null;
  state: CustomerTaskState;
}

export interface InteractionView {
  id: string;
  at: string;
  action: CustomerAction;
  brief: string;
}

/** A call back card linked to this customer (read-only here; the call backs own it). */
export interface LinkedCallBackView {
  id: string;
  at: string;
  action: string;
  tags: string[];
  remindAt: string | null;
}

/** The work tab, as the customer pages name it. */
export interface CrmBoardView {
  id: string;
  name: string;
}
