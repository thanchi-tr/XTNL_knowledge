/**
 * The customer list's Phase 2 rules (2026-10-20; migration 20261228000000_crm), pure and client-importable: the cores
 * (crm-server.ts, customers-server.ts, scheduled-tasks-server.ts), the customer pages, the Agenda's Follow up and
 * scripts/crm-check.ts all import it.
 *
 *   A status          LEAD → PROSPECT → CUSTOMER → INACTIVE (every customer before Phase 2 reads CUSTOMER; the database
 *                     holds the four with a CHECK)
 *   Tags              the user's own: lowercase, trimmed, no leading '#', ≤ TAG_MAX_CHARS each, ≤ TAG_MAX a customer;
 *                     the tab's recent tags are offered as you type (the call backs' tag idiom, 781b49d callbacks.ts)
 *   More details      an email (a tap to mail), a company, an address (line breaks kept)
 *   The list          filtered by status and by tag (?status=, ?tag=, kept with replaceState)
 *   A customer's tabs Overview · Tasks · Check · Info · History · Orders · Deals (?tab=; ?task= lands on Tasks)
 *   A check           Rate, Home, Work (each optional, at least one, ≤ CHECK_FIELD_MAX) and Record at (a day, today's
 *                     life day unless picked, never after it); newest first
 *   A collection      a name (≤ 80), optionally an order of the same customer, a note; open or closed; its progress
 *                     ("2 of 5 done") is its tasks (archived ones left out)
 *   Follow-ups        followUpOf: a kept customer, not Inactive, quiet for more than the tab's followUpDays with nothing
 *                     scheduled ahead, OR with an overdue scheduled task; last contact = the latest interaction, else a
 *                     done task's doneAt, else when they were added. Off (null): nobody is flagged (the Agenda's side
 *                     column then lists the overdue ones only, as before Phase 2)
 *
 * "Today" is the life day (life-day.ts todayKey: it turns at 04:00 in LIFE_TZ), as the order list's dates are.
 * Work, never the game: nothing here (or in the cores) pays XP, writes the ledger or touches the streak.
 */
import { LIFE_TZ, dayKeyOf, daysBetween, todayKey, type DayKey } from "./life-day";
import { CUSTOMER_ACTION_LABEL, customerHref, isRowId, localInputOf, whenLabel, type CustomerAction } from "./customers";
import { CHANNEL_WORDS, sectionOfTask, snoozeTarget, type Channel } from "./scheduled-tasks";

export type Clean<T> = { ok: true; value: T } | { ok: false; error: string };
const yes = <T>(value: T): Clean<T> => ({ ok: true, value });
const no = <T>(error: string): Clean<T> => ({ ok: false, error });

const chars = (s: string) => [...s].length;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const oneLine = (raw: unknown) => (typeof raw === "string" ? raw.replace(CONTROL, " ").replace(/[\r\n\t]+/g, " ").trim().replace(/\s+/g, " ") : "");

// ── Status ──────────────────────────────────────────────────────────────────

export const CUSTOMER_STATUSES = ["LEAD", "PROSPECT", "CUSTOMER", "INACTIVE"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const STATUS_LABEL: Readonly<Record<CustomerStatus, string>> = { LEAD: "Lead", PROSPECT: "Prospect", CUSTOMER: "Customer", INACTIVE: "Inactive" };
/** What a customer is without a choice: every customer from before Phase 2, and the add sheet's start. */
export const DEFAULT_STATUS: CustomerStatus = "CUSTOMER";
export const STATUS_BAD = "Pick a status: Lead, Prospect, Customer or Inactive.";

export function statusOf(raw: unknown): CustomerStatus | null {
  return typeof raw === "string" && (CUSTOMER_STATUSES as readonly string[]).includes(raw) ? (raw as CustomerStatus) : null;
}

/** A stored status, read back (the CHECK holds the four; anything else reads as the default). */
export function readStatus(raw: unknown): CustomerStatus {
  return statusOf(raw) ?? DEFAULT_STATUS;
}

/** A status from a sheet: one of the four; left out (undefined, null, ""): the default. */
export function cleanStatus(raw: unknown): Clean<CustomerStatus> {
  if (raw === undefined || raw === null || raw === "") return yes(DEFAULT_STATUS);
  const s = statusOf(raw);
  return s ? yes(s) : no(STATUS_BAD);
}

// ── Tags ────────────────────────────────────────────────────────────────────

/** A tag's longest form, in characters. */
export const TAG_MAX_CHARS = 24;
/** The most tags one customer carries. */
export const TAG_MAX = 8;
/** How many of the tab's recent tags the field offers at once. */
export const TAG_SUGGEST_MAX = 6;
/** How many distinct recent tags the tab keeps for autocomplete. */
export const RECENT_TAGS_MAX = 40;

export const TAG_LONG = `Keep each tag to ${TAG_MAX_CHARS} characters.`;
export const TAGS_MANY = `Up to ${TAG_MAX} tags on a customer.`;

/** A tag as stored: lowercase, trimmed, inner spaces collapsed, no leading '#' or commas. Empty: ''. */
export function normalizeTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFC").replace(CONTROL, " ").replace(/[\r\n\t]/g, " ").replace(/,/g, " ").trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The tags as stored (normalized, deduped in order), or why not: one too long, or more than TAG_MAX. */
export function cleanTags(raw: unknown): Clean<string[]> {
  const list = Array.isArray(raw) ? raw : [];
  const tags: string[] = [];
  for (const r of list) {
    const t = normalizeTag(r);
    if (!t) continue;
    if (chars(t) > TAG_MAX_CHARS) return no(TAG_LONG);
    if (!tags.includes(t)) tags.push(t);
  }
  if (tags.length > TAG_MAX) return no(TAGS_MANY);
  return yes(tags);
}

/** The tab's tags, the most recently active customer first, each once (the rows are that tab's own). */
export function recentTagsOf(rows: readonly { tags?: readonly string[] | null; activity?: number }[], max: number = RECENT_TAGS_MAX): string[] {
  const sorted = [...rows].sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0));
  const out: string[] = [];
  for (const r of sorted) {
    for (const raw of r.tags ?? []) {
      const t = normalizeTag(raw);
      if (t && !out.includes(t)) out.push(t);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * What the tag field offers: with nothing typed, the tab's newest tags; else those that start with the typed words,
 * then those that contain them. Never a tag already on the customer.
 */
export function tagSuggestionsOf(recent: readonly string[], typed: string, chosen: readonly string[], max: number = TAG_SUGGEST_MAX): string[] {
  const q = normalizeTag(typed);
  const free = recent.filter((t) => !chosen.includes(t));
  if (!q) return free.slice(0, max);
  const starts = free.filter((t) => t.startsWith(q));
  const contains = free.filter((t) => !t.startsWith(q) && t.includes(q));
  return [...starts, ...contains].slice(0, max);
}

/** Each tag on the tab and how many kept customers carry it: the most used first, then by name (the filter's list). */
export function tagCountsOf(rows: readonly { tags?: readonly string[] | null }[]): { tag: string; count: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) for (const t of new Set((r.tags ?? []).map(normalizeTag).filter(Boolean))) by.set(t, (by.get(t) ?? 0) + 1);
  return [...by.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

// ── More details: email, company, address ─────────────────────────────────

export const CUSTOMER_EMAIL_MAX = 120;
export const CUSTOMER_COMPANY_MAX = 80;
export const CUSTOMER_ADDRESS_MAX = 240;

export const CUSTOMER_EMAIL_BAD = "That doesn't look like an email address (name@example.com).";
export const CUSTOMER_EMAIL_LONG = `Keep the email to ${CUSTOMER_EMAIL_MAX} characters.`;
export const CUSTOMER_COMPANY_LONG = `Keep the company to ${CUSTOMER_COMPANY_MAX} characters.`;
export const CUSTOMER_ADDRESS_LONG = `Keep the address to ${CUSTOMER_ADDRESS_MAX} characters.`;

// No spaces, and nothing that would open a mailto: header (?, &, #) or break out of the address (work-orders.ts's rule).
const EMAIL_RE = /^[^\s@<>()"',;:?&#/\\]+@[^\s@<>()"',;:?&#/\\]+\.[A-Za-z]{2,}$/;

/** An email: optional (empty is none), one line, a plausible address, at most 120 characters. */
export function cleanEmail(raw: unknown): Clean<string | null> {
  const e = oneLine(raw);
  if (!e) return yes(null);
  if (chars(e) > CUSTOMER_EMAIL_MAX) return no(CUSTOMER_EMAIL_LONG);
  if (!EMAIL_RE.test(e)) return no(CUSTOMER_EMAIL_BAD);
  return yes(e);
}

/** A company: optional, one line, spaces collapsed, at most 80 characters. */
export function cleanCompany(raw: unknown): Clean<string | null> {
  const c = oneLine(raw);
  if (!c) return yes(null);
  if (chars(c) > CUSTOMER_COMPANY_MAX) return no(CUSTOMER_COMPANY_LONG);
  return yes(c);
}

/** An address: optional, line breaks kept (each line trimmed, blank lines dropped), at most 240 characters. */
export function cleanAddress(raw: unknown): Clean<string | null> {
  const a =
    typeof raw === "string"
      ? raw
          .replace(/\r\n?/g, "\n")
          .replace(CONTROL, " ")
          .split("\n")
          .map((l) => l.trim().replace(/[ \t]+/g, " "))
          .filter((l) => l !== "")
          .join("\n")
      : "";
  if (!a) return yes(null);
  if (chars(a) > CUSTOMER_ADDRESS_MAX) return no(CUSTOMER_ADDRESS_LONG);
  return yes(a);
}

/** The email's tap to mail. */
export function emailHref(email: string): string {
  return `mailto:${email.trim()}`;
}

// ── The Customers page's filters ───────────────────────────────────────────

export const STATUS_PARAM = "status";
export const TAG_PARAM = "tag";

export type StatusFilter = "all" | CustomerStatus;
export const STATUS_FILTERS: readonly StatusFilter[] = ["all", ...CUSTOMER_STATUSES];
export const STATUS_FILTER_LABEL: Readonly<Record<StatusFilter, string>> = { all: "All", ...STATUS_LABEL };

/** ?status= as the address holds it (lower case: ?status=lead), or "all". */
export function statusFilterOf(raw: unknown): StatusFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? (statusOf(v.toUpperCase()) ?? "all") : "all";
}

/** The address's value for a status filter ("" for all). */
export function statusParamOf(f: StatusFilter): string {
  return f === "all" ? "" : f.toLowerCase();
}

/** ?tag= as the address holds it, normalized, or null. */
export function tagFilterOf(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const t = normalizeTag(v);
  return t && chars(t) <= TAG_MAX_CHARS ? t : null;
}

/** The customers a status and a tag filter keep (in their own order). */
export function filterCustomers<T extends { status?: string | null; tags?: readonly string[] | null }>(list: readonly T[], f: { status: StatusFilter; tag: string | null }): T[] {
  return list.filter((c) => (f.status === "all" || readStatus(c.status) === f.status) && (!f.tag || (c.tags ?? []).includes(f.tag)));
}

/** Each status filter's count. */
export function statusCountsOf(list: readonly { status?: string | null }[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: list.length, LEAD: 0, PROSPECT: 0, CUSTOMER: 0, INACTIVE: 0 };
  for (const c of list) out[readStatus(c.status)]++;
  return out;
}

// ── A customer's tabs ──────────────────────────────────────────────────────

export const CUSTOMER_TABS = ["overview", "tasks", "check", "info", "history", "orders", "deals"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];
export const CUSTOMER_TAB_LABEL: Readonly<Record<CustomerTab, string>> = {
  overview: "Overview",
  tasks: "Tasks",
  check: "Check",
  info: "Info",
  history: "History",
  orders: "Orders",
  deals: "Deals",
};
export const TAB_PARAM = "tab";

/** The tabs a customer's page shows: every one, Orders only while the tab keeps an order list. */
export function customerTabsOf(opts: { ordersOn: boolean }): CustomerTab[] {
  return CUSTOMER_TABS.filter((t) => t !== "orders" || opts.ordersOn);
}

/**
 * The tab the address asks for: ?task=<id> (a reminder's or an old customer task's link) always lands on Tasks, so the
 * highlighted task is in view; else ?tab=<one of the shown tabs>; else Overview.
 */
export function customerTabOf(query: { [key: string]: unknown }, opts: { ordersOn: boolean }): CustomerTab {
  const task = Array.isArray(query.task) ? query.task[0] : query.task;
  if (typeof task === "string" && isRowId(task)) return "tasks";
  const raw = Array.isArray(query[TAB_PARAM]) ? (query[TAB_PARAM] as unknown[])[0] : query[TAB_PARAM];
  const tab = typeof raw === "string" ? (raw.toLowerCase() as CustomerTab) : null;
  return tab && customerTabsOf(opts).includes(tab) ? tab : "overview";
}

/** A customer's page on a tab (Overview is the bare page). */
export function customerTabHref(boardId: string, customerId: string, tab: CustomerTab): string {
  const base = customerHref(boardId, customerId);
  return tab === "overview" ? base : `${base}?${TAB_PARAM}=${tab}`;
}

/** The tablist's keys: ←/→ move (wrapping), Home and End jump; anything else is not the tablist's. */
export function nextTabIndex(key: string, at: number, count: number): number | null {
  if (count <= 0) return null;
  if (key === "ArrowRight") return (at + 1) % count;
  if (key === "ArrowLeft") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

// ── A check ────────────────────────────────────────────────────────────────

export const CHECK_FIELD_MAX = 200;
/** The tab's own words for its fields, exactly as the user asked for them. */
export const CHECK_LABELS = { rate: "Rate", home: "Home", work: "Work", recordedAt: "Record at" } as const;
export type CheckField = "rate" | "home" | "work";
export const CHECK_FIELDS: readonly CheckField[] = ["rate", "home", "work"];

export const CHECK_EMPTY = "Fill in at least one of Rate, Home or Work.";
export const CHECK_LONG: Readonly<Record<CheckField, string>> = {
  rate: `Keep Rate to ${CHECK_FIELD_MAX} characters.`,
  home: `Keep Home to ${CHECK_FIELD_MAX} characters.`,
  work: `Keep Work to ${CHECK_FIELD_MAX} characters.`,
};
export const CHECK_DATE_BAD = "Pick the day it was recorded.";
export const CHECK_DATE_FUTURE = "Record at can't be after today.";
export const CHECK_GONE = "That check no longer exists.";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A calendar day 'YYYY-MM-DD' (2000..2099), a real date, or null. */
export function dayOf(raw: unknown): DayKey | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2000 || y > 2099 || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return s;
}

export interface CheckInput {
  rate?: string | null;
  home?: string | null;
  work?: string | null;
  /** 'YYYY-MM-DD'. Left out or "": today (the life day). */
  recordedAt?: string | null;
}

export interface CleanCheck {
  rate: string | null;
  home: string | null;
  work: string | null;
  recordedAt: DayKey;
}

/** The Check sheet's fields: each one line (spaces collapsed, ≤ CHECK_FIELD_MAX), at least one; Record at ≤ today. */
export function cleanCheckInput(raw: unknown, today: DayKey): Clean<CleanCheck> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const v: Record<CheckField, string | null> = { rate: null, home: null, work: null };
  for (const f of CHECK_FIELDS) {
    const s = oneLine(r[f]);
    if (chars(s) > CHECK_FIELD_MAX) return no(CHECK_LONG[f]);
    v[f] = s || null;
  }
  if (!v.rate && !v.home && !v.work) return no(CHECK_EMPTY);
  const rawDay = r.recordedAt;
  let recordedAt: DayKey = today;
  if (rawDay !== undefined && rawDay !== null && rawDay !== "") {
    const d = dayOf(rawDay);
    if (!d) return no(CHECK_DATE_BAD);
    if (d > today) return no(CHECK_DATE_FUTURE);
    recordedAt = d;
  }
  return yes({ rate: v.rate, home: v.home, work: v.work, recordedAt });
}

/** Checks newest recorded first; the same day, the newest added first. */
export function sortChecks<T extends { id: string; recordedAt: string; createdAt?: string | Date }>(list: readonly T[]): T[] {
  const ms = (v: string | Date | undefined) => (v === undefined ? 0 : typeof v === "string" ? Date.parse(v) || 0 : v.getTime());
  return [...list].sort((a, b) => (a.recordedAt !== b.recordedAt ? (a.recordedAt < b.recordedAt ? 1 : -1) : ms(b.createdAt) - ms(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)));
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A calendar day in words: "Today", "Yesterday", "Tomorrow", else "Tue 20 Oct" (and the year when not this one). */
export function dayLabel(day: DayKey, today: DayKey): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const [y, m, d] = day.split("-").map(Number);
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH[m - 1]}${y !== Number(today.slice(0, 4)) ? ` ${y}` : ""}`;
}

// ── Task collections ───────────────────────────────────────────────────────

export const COLLECTION_NAME_MAX = 80;
export const COLLECTION_NOTE_MAX = 500;

export const COLLECTION_NAME_EMPTY = "Name the collection (a service, an order, a job).";
export const COLLECTION_NAME_LONG = `Keep the name to ${COLLECTION_NAME_MAX} characters.`;
export const COLLECTION_NOTE_LONG = `Keep the note to ${COLLECTION_NOTE_MAX} characters.`;
export const COLLECTION_ORDER_BAD = "That order can't be linked: it is not this customer's on this tab.";
export const COLLECTION_ORDERS_OFF = "This tab keeps no order list. Leave the order empty.";
export const COLLECTION_GONE = "That collection no longer exists.";
export const COLLECTION_ARCHIVED = "That collection is archived. Undo the archive to change it.";

export interface CollectionInput {
  name: string;
  note?: string | null;
  /** One of the customer's orders on this tab; "" or null: none. Left out: none on an add, kept on an edit. */
  orderId?: string | null;
}

export interface CleanCollection {
  name: string;
  note: string | null;
  /** undefined: left out. */
  orderId: string | null | undefined;
}

/** A collection's fields: the name one line (1..80), the note (≤ 500, line breaks kept), an order's id or none. */
export function cleanCollectionInput(raw: unknown): Clean<CleanCollection> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = oneLine(r.name);
  if (!name) return no(COLLECTION_NAME_EMPTY);
  if (chars(name) > COLLECTION_NAME_MAX) return no(COLLECTION_NAME_LONG);
  const note = typeof r.note === "string" ? r.note.replace(/\r\n?/g, "\n").replace(CONTROL, " ").trim() : "";
  if (chars(note) > COLLECTION_NOTE_MAX) return no(COLLECTION_NOTE_LONG);
  let orderId: string | null | undefined;
  if (r.orderId === undefined) orderId = undefined;
  else if (r.orderId === null || r.orderId === "") orderId = null;
  else if (isRowId(r.orderId)) orderId = r.orderId;
  else return no(COLLECTION_ORDER_BAD);
  return yes({ name, note: note || null, orderId });
}

/** A collection's progress: its tasks (not archived), and how many are done. */
export function collectionProgressOf(tasks: readonly { doneAt: string | Date | null }[]): { done: number; total: number } {
  return { done: tasks.filter((t) => t.doneAt != null).length, total: tasks.length };
}

/** "2 of 5 done"; "No tasks yet"; "All 3 done". */
export function progressLabel(p: { done: number; total: number }): string {
  if (p.total === 0) return "No tasks yet";
  if (p.done === p.total) return `All ${p.total} done`;
  return `${p.done} of ${p.total} done`;
}

/** An order, as a collection's chip names it. */
export interface CollectionOrderRef {
  id: string;
  item: string;
  ordered: boolean;
}

/** A collection as the pages draw it (plain values: it crosses into the client). */
export interface CollectionView {
  id: string;
  customerId: string;
  name: string;
  note: string | null;
  order: CollectionOrderRef | null;
  /** ISO, or null while open. */
  closedAt: string | null;
  /** ISO. */
  createdAt: string;
}

export interface CollectionGroup<T> {
  /** null: the "No collection" group. */
  collection: CollectionView | null;
  open: T[];
  done: T[];
  progress: { done: number; total: number };
}

/**
 * A customer's tasks grouped by collection: the open collections first (the one whose next task is soonest first,
 * then the ones with nothing open, newest first), then "No collection" (last, and only when it holds a task), then the
 * closed ones (newest closed first). In each group the open tasks soonest first, then the done ones, newest first. A
 * task whose collection is not among `collections` (archived) sits under "No collection".
 */
export function groupByCollection<T extends { id: string; dueAt: string; doneAt: string | null; collection?: { id: string } | null }>(
  tasks: readonly T[],
  collections: readonly CollectionView[]
): { open: CollectionGroup<T>[]; none: CollectionGroup<T> | null; closed: CollectionGroup<T>[] } {
  const known = new Map(collections.map((c) => [c.id, c]));
  const by = new Map<string | null, T[]>();
  for (const t of tasks) {
    const key = t.collection && known.has(t.collection.id) ? t.collection.id : null;
    by.set(key, [...(by.get(key) ?? []), t]);
  }
  const ms = (v: string | null) => (v ? Date.parse(v) || 0 : 0);
  const group = (collection: CollectionView | null): CollectionGroup<T> => {
    const list = by.get(collection?.id ?? null) ?? [];
    return {
      collection,
      open: list.filter((t) => !t.doneAt).sort((a, b) => ms(a.dueAt) - ms(b.dueAt) || (a.id < b.id ? -1 : 1)),
      done: list.filter((t) => t.doneAt).sort((a, b) => ms(b.doneAt) - ms(a.doneAt) || (a.id < b.id ? -1 : 1)),
      progress: collectionProgressOf(list),
    };
  };
  const open = collections
    .filter((c) => !c.closedAt)
    .map(group)
    .sort((a, b) => {
      const na = a.open[0] ? ms(a.open[0].dueAt) : null;
      const nb = b.open[0] ? ms(b.open[0].dueAt) : null;
      if (na !== null && nb !== null && na !== nb) return na - nb;
      if (na !== null && nb === null) return -1;
      if (na === null && nb !== null) return 1;
      return ms(b.collection!.createdAt) - ms(a.collection!.createdAt);
    });
  const closed = collections
    .filter((c) => c.closedAt)
    .map(group)
    .sort((a, b) => ms(b.collection!.closedAt) - ms(a.collection!.closedAt));
  const rest = group(null);
  return { open, none: rest.open.length + rest.done.length > 0 ? rest : null, closed };
}

// ── Follow-ups ─────────────────────────────────────────────────────────────

/** The tab menu's choices: Off, then a week to a quarter. */
export const FOLLOW_UP_CHOICES: readonly (number | null)[] = [null, 7, 14, 30, 60, 90];
/** A tab's start (the column's default). */
export const FOLLOW_UP_DEFAULT = 30;
export const FOLLOW_UP_BAD = "Pick Off, or 7, 14, 30, 60 or 90 days.";

/** One of FOLLOW_UP_CHOICES (null: off). */
export function cleanFollowUpDays(raw: unknown): Clean<number | null> {
  if (raw === null || raw === "off") return yes(null);
  const n = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  return typeof n === "number" && FOLLOW_UP_CHOICES.includes(n) ? yes(n) : no(FOLLOW_UP_BAD);
}

/** "Off" or "30 days". */
export function followUpLabel(days: number | null): string {
  return days === null ? "Off" : `${days} days`;
}

/** What follow-ups read about one kept customer (crm-server loadFollowUpFacts; plain values, cached under 'work'). */
export interface FollowUpFacts {
  id: string;
  number: string;
  name: string;
  phone: string | null;
  status: string;
  /** ms. */
  createdAt: number;
  /** Their newest kept log entry (ms), or null. */
  lastInteractionAt: number | null;
  /** Their newest done scheduled task's doneAt (ms), or null. */
  lastDoneAt: number | null;
  /** Their open scheduled tasks (not done, not archived). */
  open: readonly { dueAt: string; allDay: boolean }[];
}

/** A customer who needs a follow-up, and why. */
export interface FollowUp {
  customer: { id: string; number: string; name: string; phone: string | null };
  /** Open tasks past their time (an all-day one once its day has ended: scheduled-tasks.ts sectionOfTask). */
  overdue: number;
  /** Open tasks still ahead. */
  ahead: number;
  /** Life days since the last contact. */
  quietDays: number;
  /** Quiet for more than the tab's days with nothing ahead. */
  quiet: boolean;
  /** ms. */
  lastContactAt: number;
  /** "2 overdue", "No contact for 42 days" (in that order). */
  reasons: string[];
}

/** Last contact: the newest of their latest interaction and their latest done task; failing both, when they were added. */
export function lastContactAtOf(f: Pick<FollowUpFacts, "createdAt" | "lastInteractionAt" | "lastDoneAt">): number {
  const seen = [f.lastInteractionAt, f.lastDoneAt].filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return seen.length > 0 ? Math.max(...seen) : f.createdAt;
}

/**
 * Whether a customer needs a follow-up, and why (null: they do not). Off (days null) or Inactive: never. Otherwise
 * when they have an overdue scheduled task, or when their last contact is more than `days` life days ago and nothing is
 * scheduled ahead for them.
 */
export function followUpOf(f: FollowUpFacts, days: number | null, now: Date, tz: string = LIFE_TZ): FollowUp | null {
  if (days === null || readStatus(f.status) === "INACTIVE") return null;
  let overdue = 0;
  let ahead = 0;
  for (const t of f.open) {
    if (sectionOfTask({ dueAt: t.dueAt, allDay: t.allDay, doneAt: null }, now, tz) === "overdue") overdue++;
    else ahead++;
  }
  const lastContactAt = lastContactAtOf(f);
  const quietDays = Math.max(0, daysBetween(dayKeyOf(new Date(lastContactAt), tz), todayKey(now, tz)));
  const quiet = quietDays > days && ahead === 0;
  if (overdue === 0 && !quiet) return null;
  const reasons = [overdue > 0 ? `${overdue} overdue` : null, quiet ? `No contact for ${quietDays} day${quietDays === 1 ? "" : "s"}` : null].filter((x): x is string => x !== null);
  return { customer: { id: f.id, number: f.number, name: f.name, phone: f.phone }, overdue, ahead, quietDays, quiet, lastContactAt, reasons };
}

/** Everyone who needs a follow-up: those with an overdue task first (most overdue first), then the quietest. */
export function followUpsOf(facts: readonly FollowUpFacts[], days: number | null, now: Date, tz: string = LIFE_TZ): FollowUp[] {
  return facts
    .map((f) => followUpOf(f, days, now, tz))
    .filter((x): x is FollowUp => x !== null)
    .sort((a, b) => Number(b.overdue > 0) - Number(a.overdue > 0) || b.overdue - a.overdue || b.quietDays - a.quietDays || a.customer.name.localeCompare(b.customer.name, "en", { sensitivity: "base" }) || (a.customer.id < b.customer.id ? -1 : 1));
}

/** "2 overdue · No contact for 42 days". */
export function followUpLineOf(f: Pick<FollowUp, "reasons">): string {
  return f.reasons.join(" · ");
}

/** The work frame's Customers count: "3 to follow up"; null with nobody. */
export function followUpCountText(n: number): string | null {
  return n > 0 ? `${n} to follow up` : null;
}

/** The sub-navigation's Customers count: the due ones and the follow-ups, side by side ("2 due today · 3 to follow up"). */
export function customersCountText(due: string | null, followUps: string | null): string | null {
  return [due, followUps].filter(Boolean).join(" · ") || null;
}

/** "Schedule follow-up": the sheet prefilled (that customer, "Follow up with <name>", tomorrow 09:00, a call). */
export function followUpTaskOf(customer: { name: string }, now: Date, tz: string = LIFE_TZ): { title: string; when: string; channel: Channel } {
  const at = snoozeTarget("tomorrow", now, tz) ?? new Date(now.getTime() + 86_400_000);
  return { title: `Follow up with ${customer.name}`, when: localInputOf(at, tz), channel: "CALL" };
}

/** A follow-up as the views draw it. */
export type FollowUpView = FollowUp;

/** The Agenda shows at most this many follow-ups (the Customers page lists them all). */
export const FOLLOW_UP_SHOWN = 8;

// ── The Overview's last contact ────────────────────────────────────────────

/**
 * The last contact in words: the newest of their latest log entry ("Call · Yesterday 16:10") and their latest done
 * task ("Done: Ring about the quote · Today 09:12"), or null (none yet).
 */
export function lastContactLineOf(
  interactions: readonly { at: string; action: CustomerAction }[],
  done: readonly { doneAt: string | null; title: string; channel: Channel }[],
  now: Date,
  tz: string = LIFE_TZ
): string | null {
  const entry = interactions.reduce<{ at: string; action: CustomerAction } | null>((best, i) => (!best || Date.parse(i.at) > Date.parse(best.at) ? i : best), null);
  const task = done.reduce<{ doneAt: string | null; title: string; channel: Channel } | null>((best, t) => (t.doneAt && (!best || Date.parse(t.doneAt) > Date.parse(best.doneAt as string)) ? t : best), null);
  const ea = entry ? Date.parse(entry.at) : -Infinity;
  const ta = task?.doneAt ? Date.parse(task.doneAt) : -Infinity;
  if (ea === -Infinity && ta === -Infinity) return null;
  if (ea >= ta && entry) return `${CUSTOMER_ACTION_LABEL[entry.action]} · ${whenLabel(new Date(entry.at), now, tz)}`;
  return `${CHANNEL_WORDS[task!.channel]} done: ${task!.title} · ${whenLabel(new Date(task!.doneAt as string), now, tz)}`;
}

/** A check as the customer page hands it over. */
export interface CustomerCheckView {
  id: string;
  rate: string | null;
  home: string | null;
  work: string | null;
  /** 'YYYY-MM-DD'. */
  recordedAt: DayKey;
  /** ISO. */
  createdAt: string;
}
