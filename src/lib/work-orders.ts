/**
 * Order lists (2026-10-14; migration 20261224000000_work_orders): a work
 * tab's own list of things to order. A tab switches it on in its menu
 * (WorkBoard.ordersOn, off by default; turning it off hides the list and
 * deletes nothing). Pure: the cores (work-orders-server.ts), the page under
 * /today/work/<id>/orders, the work tab's card, a customer's page, the
 * shell's title and scripts/work-orders-check.ts all import it.
 *
 *   An order        who it is for (a name 1..60, a contact <= 60: a phone, an email or any words), what to
 *                   order (an item 1..120), whether it has been ordered (orderedAt when ticked) and a date
 *                   (a calendar day, YYYY-MM-DD; a new line defaults to today). On a tab that keeps a
 *                   customer list, a customer's ID links the line to them and fills a blank name and contact.
 *
 *   contactLinkOf(contact)          a phone → tel:, an email → mailto:, anything else plain words
 *   orderedPatch(prev, on, now, t)  ticked: orderedAt now (kept when already ticked), and today as the date
 *                                   when the line had none; unticked: orderedAt cleared, the date kept
 *   sortOrders(list)                to order first, soonest date first (no date last), then oldest added;
 *                                   ordered after, the newest ordered first
 *   ORDER_FILTERS / orderCountsOf   To order · Ordered · All, each with its count
 *   orderDateLabel(date, today)     "Today", "Tomorrow", "Wed 14 Oct"; "Overdue · 12 Oct" for a line not
 *                                   ordered whose date has gone by
 *   ordersHref / ordersPathOf       /today/work/<board>/orders
 *
 * "Today" is the life day (life-day.ts todayKey: it turns at 04:00 in the
 * user's zone), the same day the work tab's own Today lane shows.
 *
 * Work, never the game: nothing here (or in the cores) pays XP, writes the
 * ledger, or touches the streak or momentum.
 */
import { daysBetween, type DayKey } from "./life-day";
import { WORK_BOARD_PATH, isBoardId } from "./work-boards";
import { CUSTOMER_NUMBER_MAX, numberKey, phoneHref } from "./customers";

export const ORDER_NAME_MAX = 60;
export const ORDER_CONTACT_MAX = 60;
export const ORDER_ITEM_MAX = 120;
/** A customer's ID, as the customer list keeps it. */
export const ORDER_CUSTOMER_MAX = CUSTOMER_NUMBER_MAX;

export const ORDER_NAME_EMPTY = "Say who the order is for.";
export const ORDER_NAME_LONG = `Keep the name to ${ORDER_NAME_MAX} characters.`;
export const ORDER_CONTACT_LONG = `Keep the contact to ${ORDER_CONTACT_MAX} characters.`;
export const ORDER_ITEM_EMPTY = "Say what to order.";
export const ORDER_ITEM_LONG = `Keep the item to ${ORDER_ITEM_MAX} characters.`;
export const ORDER_DATE_BAD = "Pick a date, or leave it empty.";
export const ORDER_CUSTOMER_LONG = `A customer ID is ${ORDER_CUSTOMER_MAX} characters at most.`;
export const ORDER_CUSTOMER_BAD = "A customer ID is one line of text.";
/** A customer ID on a tab whose customer list is off. */
export const ORDER_CUSTOMER_OFF = "This tab keeps no customer list. Leave the customer ID empty.";
/** Every order write on a tab whose list is switched off. */
export const ORDERS_OFF = "The order list is off on this tab. Turn it on in the tab's menu.";
export const ORDER_GONE = "That order no longer exists.";
export const ORDER_ARCHIVED = "That order is archived. Undo the archive to change it.";

/** The refusal for a customer ID no open customer of the tab carries. */
export function orderCustomerUnknown(number: string): string {
  return `No customer “${number}” on this tab. Check the ID, or leave it empty.`;
}

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };
const yes = <T>(value: T): Clean<T> => ({ ok: true, value });
const no = <T>(error: string): Clean<T> => ({ ok: false, error });

const chars = (s: string) => [...s].length;
const oneLine = (raw: unknown) => (typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "");
const CONTROL = /[\u0000-\u001f\u007f]/;

// ── Validation ──────────────────────────────────────────────────────────────

/** Who the order is for: trimmed, spaces collapsed, 1..60 characters. */
export function cleanOrderName(raw: unknown): Clean<string> {
  const n = oneLine(raw);
  if (!n) return no(ORDER_NAME_EMPTY);
  if (chars(n) > ORDER_NAME_MAX) return no(ORDER_NAME_LONG);
  return yes(n);
}

/** How to reach them: optional (empty is none), one line, at most 60 characters. */
export function cleanOrderContact(raw: unknown): Clean<string | null> {
  const c = oneLine(raw);
  if (!c) return yes(null);
  if (chars(c) > ORDER_CONTACT_MAX) return no(ORDER_CONTACT_LONG);
  return yes(c);
}

/** What to order: trimmed, spaces collapsed, 1..120 characters. */
export function cleanOrderItem(raw: unknown): Clean<string> {
  const i = oneLine(raw);
  if (!i) return no(ORDER_ITEM_EMPTY);
  if (chars(i) > ORDER_ITEM_MAX) return no(ORDER_ITEM_LONG);
  return yes(i);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar day, 'YYYY-MM-DD' (2000..2099): a real date or none ("" or null). */
export function cleanOrderDate(raw: unknown): Clean<DayKey | null> {
  if (raw === null || raw === undefined) return yes(null);
  if (typeof raw !== "string") return no(ORDER_DATE_BAD);
  const s = raw.trim();
  if (!s) return yes(null);
  const m = DATE_RE.exec(s);
  if (!m) return no(ORDER_DATE_BAD);
  const [y, mo, d] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || y > 2099 || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return no(ORDER_DATE_BAD);
  return yes(s);
}

/** A customer's ID as typed: optional (empty is none), trimmed, one line, at most 24 characters. */
export function cleanOrderCustomer(raw: unknown): Clean<string | null> {
  const n = typeof raw === "string" ? raw.trim() : "";
  if (!n) return yes(null);
  if (CONTROL.test(n)) return no(ORDER_CUSTOMER_BAD);
  if (chars(n) > ORDER_CUSTOMER_MAX) return no(ORDER_CUSTOMER_LONG);
  return yes(n);
}

// ── The contact: tap to call, tap to mail, or words ───────────────────────

export type ContactKind = "tel" | "mail" | "text";
export interface ContactLink {
  kind: ContactKind;
  /** tel:… or mailto:…; null for plain words. */
  href: string | null;
}

// No spaces, and nothing that would open a mailto: header (?, &, #) or break out of the address.
const EMAIL_RE = /^[^\s@<>()"',;:?&#/\\]+@[^\s@<>()"',;:?&#/\\]+\.[A-Za-z]{2,}$/;
// An optional leading +, then digits with spaces, dots, dashes and brackets.
const PHONE_LIKE = /^\+?[0-9()\-. ]+$/;

/** What a contact is: a phone (6..15 digits) is a tel: link, an email a mailto: link, anything else plain words. */
export function contactLinkOf(contact: string): ContactLink {
  const c = contact.trim();
  if (EMAIL_RE.test(c)) return { kind: "mail", href: `mailto:${c}` };
  const digits = c.replace(/\D/g, "").length;
  if (PHONE_LIKE.test(c) && digits >= 6 && digits <= 15) return { kind: "tel", href: phoneHref(c) };
  return { kind: "text", href: null };
}

// ── Ordered, and when ─────────────────────────────────────────────────────

export interface OrderedState {
  ordered: boolean;
  orderedAt: Date | null;
  date: DayKey | null;
}

/**
 * A line ticked (ordered) or unticked. Ticked: orderedAt is now (an already
 * ticked line keeps its own), and a line with no date takes today. Unticked:
 * orderedAt is cleared; the date stays.
 */
export function orderedPatch(prev: OrderedState, ordered: boolean, now: Date, today: DayKey): OrderedState {
  if (ordered) return { ordered: true, orderedAt: prev.ordered && prev.orderedAt ? prev.orderedAt : now, date: prev.date ?? today };
  return { ordered: false, orderedAt: null, date: prev.date };
}

// ── Order, filters, counts ────────────────────────────────────────────────

export interface SortableOrder {
  id: string;
  ordered: boolean;
  orderedAt: Date | string | null;
  date: DayKey | null;
  createdAt: Date | string;
}

const ms = (v: Date | string | null): number => (v == null ? 0 : typeof v === "string" ? Date.parse(v) || 0 : v.getTime());
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The list's order: the lines still to order first, soonest date first (a
 * line with no date after the dated ones), then the oldest added first; the
 * ordered lines after them, the newest ordered first.
 */
export function sortOrders<T extends SortableOrder>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.ordered !== b.ordered) return a.ordered ? 1 : -1;
    if (!a.ordered) {
      if (a.date !== b.date) {
        if (a.date === null) return 1;
        if (b.date === null) return -1;
        return a.date < b.date ? -1 : 1;
      }
      return ms(a.createdAt) - ms(b.createdAt) || byId(a, b);
    }
    return ms(b.orderedAt) - ms(a.orderedAt) || ms(b.createdAt) - ms(a.createdAt) || byId(a, b);
  });
}

export const ORDER_FILTERS = ["todo", "ordered", "all"] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export const ORDER_FILTER_LABEL: Readonly<Record<OrderFilter, string>> = {
  todo: "To order",
  ordered: "Ordered",
  all: "All",
};

export function isOrderFilter(raw: unknown): raw is OrderFilter {
  return typeof raw === "string" && (ORDER_FILTERS as readonly string[]).includes(raw);
}

/** The lines a filter shows (in the list's own order). */
export function filterOrders<T extends { ordered: boolean }>(list: readonly T[], filter: OrderFilter): T[] {
  return filter === "all" ? [...list] : list.filter((o) => o.ordered === (filter === "ordered"));
}

/** Each filter's count. */
export function orderCountsOf(list: readonly { ordered: boolean }[]): Record<OrderFilter, number> {
  const ordered = list.filter((o) => o.ordered).length;
  return { todo: list.length - ordered, ordered, all: list.length };
}

/** A line not ordered whose date has gone by. */
export function isOrderOverdue(o: { ordered: boolean; date: DayKey | null }, today: DayKey): boolean {
  return !o.ordered && o.date !== null && o.date < today;
}

/** The work tab card's chip: "3 to order"; null with nothing to order. */
export function ordersChipText(todo: number): string | null {
  return todo > 0 ? `${todo} to order` : null;
}

// ── The date's words ──────────────────────────────────────────────────────

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A line's date in words: "Today", "Tomorrow", "Yesterday", else "Wed 14 Oct"
 * (the year when it is not this one). A line not yet ordered whose date has
 * gone by reads "Overdue · 12 Oct". No date: "No date".
 */
export function orderDateLabel(date: DayKey | null, today: DayKey, ordered = false): string {
  if (!date) return "No date";
  const [y, m, d] = date.split("-").map(Number);
  const year = y !== Number(today.slice(0, 4)) ? ` ${y}` : "";
  const diff = daysBetween(today, date);
  if (!ordered && diff < 0) return `Overdue · ${d} ${MONTH[m - 1]}${year}`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH[m - 1]}${year}`;
}

// ── A customer of the tab, by their ID ────────────────────────────────────

export interface OrderCustomerRef {
  id: string;
  number: string;
  name: string;
  phone: string | null;
}

/** The tab's customer whose ID is `typed`, ignoring case (the sheet's early word; the server decides). */
export function matchOrderCustomer<C extends { number: string }>(customers: readonly C[], typed: string): C | null {
  const key = numberKey(typed ?? "");
  if (!key) return null;
  return customers.find((c) => numberKey(c.number) === key) ?? null;
}

// ── Paths ──────────────────────────────────────────────────────────────────

/** A work tab's order list. */
export function ordersHref(boardId: string): string {
  return `${WORK_BOARD_PATH}/${boardId}/orders`;
}

/** The order list a path is on, or null. */
export function ordersPathOf(pathname: string | null | undefined): { boardId: string } | null {
  if (!pathname) return null;
  const m = /^\/today\/work\/([^/?#]+)\/orders\/?(?:[?#]|$)/.exec(pathname);
  return m && isBoardId(m[1]) ? { boardId: m[1] } : null;
}

// ── What the pages hand their client views (instants as ISO strings) ──────

export interface OrderView {
  id: string;
  name: string;
  contact: string | null;
  item: string;
  ordered: boolean;
  orderedAt: string | null;
  /** 'YYYY-MM-DD', or null. */
  date: DayKey | null;
  createdAt: string;
  /** The customer this line is linked to (same tab), or null. */
  customer: { id: string; number: string } | null;
}

/** The work tab, as the order pages name it. */
export interface OrdersBoardView {
  id: string;
  name: string;
  /** The tab keeps a customer list: the sheet offers a customer ID. */
  crmOn: boolean;
}

/** What the sheet sends (the browser's words; the server checks every field). */
export interface WorkOrderInput {
  /** Left out: kept on an edit. Blank with a newly linked customer: theirs. */
  name?: string | null;
  /** "" or null is none. Left out: kept on an edit. Blank with a newly linked customer: their phone. */
  contact?: string | null;
  item: string;
  /** 'YYYY-MM-DD'; "" or null is no date. Left out: today on an add, kept on an edit. */
  date?: string | null;
  /** Left out: not ordered on an add, kept on an edit. */
  ordered?: boolean;
  /**
   * A customer's ID on this tab: links the line to them and fills a blank
   * name and contact. "" or null: no customer. Left out: none on an add, the
   * line's own link kept on an edit.
   */
  customer?: string | null;
}
