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
 *   An info         a note on what is known about them (a detail, 1..1000, line breaks kept) and when it was
 *                   recorded (recordedAt: now by default, editable, never more than a minute ahead);
 *                   their page lists it newest first, above the log (2026-10-14, migration 20261225000000)
 *   An interaction  a dated entry in their log: Call · Visit · Email · Message (2026-10-20) · Purchase · Inquiry ·
 *                   Complaint · Credit check, and a brief (<= 280). An action outside the list (none today) is left out
 *                   of the log, never shown blank.
 *   Their tasks     scheduled tasks (src/lib/scheduled-tasks.ts, 2026-10-20) replaced the customer tasks
 *                   (CustomerTask, kept for the backfill): the customer page lists the tab's scheduled tasks for them
 *
 *   The search      src/lib/customer-search.ts, the one engine (the work header, this list, the sheet's picker)
 *   nextCustomerNumber(numbers)     the next ID to suggest while every ID on the tab is a number
 *   dueCountOf / dueChipText        the scheduled tasks due by tonight per customer (the list's chips)
 *   customersHref / customerHref    /today/work/<board>/customers[/<customer>[?task=<task>]] (an old customer task
 *                                   reminder's tap URL: ?task= resolves to its scheduled task)
 *   cleanInfoDetail / cleanRecordedAt / sortInfos / infoRecordedLabel / infoFirstLine   an info's rules
 *   Phase 2 (2026-10-20)            a status, tags, an email, a company, an address; a Check log, task collections,
 *                                   deals and follow-ups: src/lib/crm.ts and src/lib/deals.ts
 *
 * Work, never the game: nothing here (or in the cores) pays XP, writes the
 * ledger or touches the streak.
 */
import { LIFE_TZ, zonedToInstant } from "./life-day";
import { WORK_BOARD_PATH, isBoardId } from "./work-boards";
import type { TaskIcon } from "./task-style";
import type { CustomerStatus } from "./crm";

export const CUSTOMER_NUMBER_MAX = 24;
export const CUSTOMER_NAME_MAX = 60;
export const CUSTOMER_NICKNAME_MAX = 40;
export const CUSTOMER_PHONE_MAX = 24;
export const INTERACTION_BRIEF_MAX = 280;
export const CUSTOMER_INFO_MAX = 1000;
/** How far ahead of now an info's "Recorded at" may be (a clock a little ahead, a minute typed early). */
export const RECORDED_AHEAD_MS = 60_000;

/**
 * What happened, in a customer's log. Stored as these strings (CustomerInteraction.action, plain text: the four
 * contact actions were added 2026-10-20 with no change to the column, and every older entry reads as before).
 */
export const CUSTOMER_ACTIONS = ["CALL", "VISIT", "EMAIL", "MESSAGE", "PURCHASE", "INQUIRY", "COMPLAINT", "CREDIT_CHECK"] as const;
export type CustomerAction = (typeof CUSTOMER_ACTIONS)[number];

export const CUSTOMER_ACTION_LABEL: Readonly<Record<CustomerAction, string>> = {
  CALL: "Call",
  VISIT: "Visit",
  EMAIL: "Email",
  MESSAGE: "Message",
  PURCHASE: "Purchase",
  INQUIRY: "Inquiry",
  COMPLAINT: "Complaint",
  CREDIT_CHECK: "Credit check",
};

/** A one-character mark for each action, always drawn beside its word (never alone). */
export const CUSTOMER_ACTION_GLYPH: Readonly<Record<CustomerAction, string>> = {
  CALL: "C",
  VISIT: "V",
  EMAIL: "@",
  MESSAGE: "M",
  PURCHASE: "$",
  INQUIRY: "?",
  COMPLAINT: "!",
  CREDIT_CHECK: "✓",
};

/** The contact actions draw the app's own task icon (task-style.ts TASK_ICONS) in place of their character. */
export const CUSTOMER_ACTION_ICON: Readonly<Partial<Record<CustomerAction, TaskIcon>>> = { CALL: "phone", VISIT: "people", EMAIL: "mail", MESSAGE: "chat" };

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
export const INTERACTION_ACTION_BAD = "Pick what happened: a call, a visit, an email, a message, a purchase, an inquiry, a complaint or a credit check.";
export const INTERACTION_BRIEF_LONG = `Keep the brief to ${INTERACTION_BRIEF_MAX} characters.`;
export const WHEN_BAD = "Pick a date and a time.";
/** Every customer write on a tab whose list is switched off. */
export const CRM_OFF = "The customer list is off on this tab. Turn it on in the tab's menu.";
export const CUSTOMER_GONE = "That customer no longer exists.";
export const CUSTOMER_ARCHIVED = "That customer is archived. Restore them to change anything.";
export const INTERACTION_GONE = "That entry no longer exists.";
export const CUSTOMER_INFO_EMPTY = "Write the info.";
export const CUSTOMER_INFO_LONG = `Keep the info to ${CUSTOMER_INFO_MAX} characters.`;
export const RECORDED_FUTURE = "Recorded at can't be in the future.";
export const CUSTOMER_INFO_GONE = "That info no longer exists.";

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

/** An info's detail: trimmed, line breaks kept, 1..1000 characters. */
export function cleanInfoDetail(raw: unknown): Clean<string> {
  const d = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
  if (!d) return no(CUSTOMER_INFO_EMPTY);
  if (chars(d) > CUSTOMER_INFO_MAX) return no(CUSTOMER_INFO_LONG);
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

/** When an info was recorded: an instant (cleanWhen) no more than a minute ahead of now. */
export function cleanRecordedAt(raw: unknown, now: Date): Clean<Date> {
  const at = cleanWhen(raw);
  if (!at.ok) return at;
  if (at.value.getTime() > now.getTime() + RECORDED_AHEAD_MS) return no(RECORDED_FUTURE);
  return at;
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

// ── Info ───────────────────────────────────────────────────────────────────

/** "Recorded Wed 14 Oct · 15:20" (and the year when it is not this one), in the user's zone. */
export function infoRecordedLabel(at: Date, now: Date, tz: string = LIFE_TZ): string {
  const a = wallClockOf(at, tz);
  const n = wallClockOf(now, tz);
  const weekday = WEEKDAY[new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay()];
  return `Recorded ${weekday} ${a.d} ${MONTH[a.m - 1]}${a.y !== n.y ? ` ${a.y}` : ""} · ${pad(a.h)}:${pad(a.mi)}`;
}

/** Infos newest recorded first (the newest added first within the same minute). */
export function sortInfos<T extends { id: string; recordedAt: Date | string; createdAt?: Date | string }>(infos: readonly T[]): T[] {
  const ms = (v: Date | string | undefined) => (v === undefined ? 0 : typeof v === "string" ? Date.parse(v) || 0 : v.getTime());
  return [...infos].sort((a, b) => ms(b.recordedAt) - ms(a.recordedAt) || ms(b.createdAt) - ms(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** An info's first written line (the customer list's quiet subtitle), spaces collapsed. */
export function infoFirstLine(detail: string): string {
  return (
    detail
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/\s+/g, " "))
      .find((l) => l !== "") ?? ""
  );
}

/** Long enough that three lines may not hold it on a phone: the row offers "More" before it is measured. */
export function infoLooksLong(detail: string): boolean {
  return [...detail].length > 110 || detail.split("\n").length > 3;
}

// ── Their scheduled tasks due today (the list's chips) ─────────────────────

/** Open scheduled tasks due by the end of today (overdue included), and how many of them are overdue. */
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

/** A customer row's chip: "2 due today", "1 overdue", "1 overdue · 2 today"; null with nothing due. */
export function dueChipText(c: DueCount): string | null {
  if (c.due <= 0) return null;
  if (c.overdue <= 0) return `${c.due} due today`;
  if (c.overdue >= c.due) return `${c.overdue} overdue`;
  return `${c.overdue} overdue · ${c.due - c.overdue} today`;
}

// ── Paths ──────────────────────────────────────────────────────────────────

/** A work tab's customer list. */
export function customersHref(boardId: string): string {
  return `${WORK_BOARD_PATH}/${boardId}/customers`;
}

/** The query parameter a customer page highlights a task by (an old customer task reminder's tap URL carries it). */
export const TASK_PARAM = "task";

/** A customer's page; with a task, that task highlighted (/today/work/<b>/customers/<c>?task=<t>). */
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
  /** Open scheduled tasks due by the end of today (overdue included), and the overdue ones. */
  due: number;
  overdue: number;
  /** The first line of their newest info (a quiet subtitle), or null. */
  info: string | null;
  /** Their latest activity (ms; the search's tie-break, customer-search.ts). */
  activity: number;
  /** Phase 2 (crm.ts): where they stand, their tags, and the search's secondary fields. */
  status: CustomerStatus;
  tags: string[];
  email: string | null;
  company: string | null;
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
  /** Phase 2 (crm.ts). */
  status: CustomerStatus;
  tags: string[];
  email: string | null;
  company: string | null;
  address: string | null;
}

export interface CustomerInfoView {
  id: string;
  detail: string;
  recordedAt: string;
}

export interface InteractionView {
  id: string;
  at: string;
  action: CustomerAction;
  brief: string;
}

/** The work tab, as the customer pages name it. */
export interface CrmBoardView {
  id: string;
  name: string;
}
