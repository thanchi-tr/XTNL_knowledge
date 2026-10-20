/**
 * The customer list's Phase 2 on the server (2026-10-20; the rules are crm.ts; migration 20261228000000_crm). Every
 * write checks, in this order: the work tab is the user's (else WORK_BOARD_GONE), open (WORK_BOARD_ARCHIVED) and keeps
 * its customer list (CRM_OFF); the customer is the user's, on that tab, and kept (CUSTOMER_GONE, CUSTOMER_ARCHIVED); the
 * row (a check, a collection) is the user's (CHECK_GONE, COLLECTION_GONE) and not archived (COLLECTION_ARCHIVED); then
 * the fields. One read gates, then one write.
 *
 *   setFollowUpDaysCore(userId, boardId, days)       the tab's follow-up alert: Off, 7, 14, 30, 60 or 90 days
 *   setCustomerStatusCore(userId, customerId, s)     a customer's status from their Overview (Lead · Prospect ·
 *                                                    Customer · Inactive); the edit sheet sets it with the rest
 *   addCheckCore / editCheckCore / archiveCheckCore / restoreCheckCore   a customer's Check log (Record at: today's
 *                                                    life day unless picked; never after it)
 *   createCollectionCore / editCollectionCore / setCollectionClosedCore / archiveCollectionCore / restoreCollectionCore
 *                                                    a customer's task collections; an order linked must be that
 *                                                    customer's on this tab (and the tab's order list on)
 *   customerOrderOptionsCore(userId, customerId)     the customer's kept orders a collection can link (the sheets)
 *   loadCustomerCrm(userId, boardId, customerId, now)   a customer page's Check log, collections and follow-up
 *   loadFollowUps(userId, boardId, now) · followUpCountCore   the Agenda's Follow up, the Customers count
 *
 * The follow-ups read one set of facts per tab (loadFollowUpFacts: each kept customer's status, when they were added,
 * their newest log entry, their newest done task, their open tasks), cached under 'work' (customer, log, scheduled task
 * and collection writes clear it), and are judged against the clock outside the cache (crm.ts followUpsOf). Collection
 * and status writes clear 'work' (the workspace's index carries them). Every core takes a CrmDb, so scripts/crm-check.ts
 * runs them against an in-memory one. Work, never the game: no ledger, no XP, no streak, no game cache.
 */
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { dateColumn, keyOfDateColumn, todayKey } from "./life-day";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, isBoardId } from "./work-boards";
import { CRM_OFF, CUSTOMER_ARCHIVED, CUSTOMER_GONE, isRowId } from "./customers";
import {
  CHECK_GONE,
  COLLECTION_ARCHIVED,
  COLLECTION_GONE,
  COLLECTION_ORDERS_OFF,
  COLLECTION_ORDER_BAD,
  FOLLOW_UP_DEFAULT,
  STATUS_BAD,
  cleanCheckInput,
  cleanCollectionInput,
  cleanFollowUpDays,
  followUpOf,
  followUpsOf,
  sortChecks,
  statusOf,
  type CollectionOrderRef,
  type CollectionView,
  type CustomerCheckView,
  type CustomerStatus,
  type FollowUp,
  type FollowUpFacts,
} from "./crm";

export type CrmResult<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): CrmResult<T> => ({ ok: true, value });
const fail = <T>(error: string): CrmResult<T> => ({ ok: false, error });

// ── Rows and the db the cores use ───────────────────────────────────────────

export interface CrmTabRow {
  id: string;
  userId: string;
  name: string;
  archivedAt: Date | null;
  crmOn: boolean;
  /** Absent in the checks' tables: off, and the default days. */
  ordersOn?: boolean;
  followUpDays?: number | null;
}

export interface CrmCustomerRow {
  id: string;
  userId: string;
  boardId: string;
  number: string;
  name: string;
  archivedAt: Date | null;
  board: CrmTabRow;
}

export interface CheckRow {
  id: string;
  userId: string;
  customerId: string;
  rate: string | null;
  home: string | null;
  work: string | null;
  /** A @db.Date column: UTC midnight of the day. */
  recordedAt: Date;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface CheckFields {
  rate: string | null;
  home: string | null;
  work: string | null;
  recordedAt: Date;
}

export interface OrderRefRow {
  id: string;
  userId: string;
  boardId: string;
  customerId: string | null;
  item: string;
  ordered: boolean;
  archivedAt: Date | null;
}

export interface CollectionRow {
  id: string;
  userId: string;
  boardId: string;
  customerId: string;
  name: string;
  orderId: string | null;
  note: string | null;
  closedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  order: { id: string; item: string; ordered: boolean; archivedAt: Date | null } | null;
}

export type CollectionWrite = Partial<Pick<CollectionRow, "name" | "note" | "orderId" | "closedAt" | "archivedAt">>;

/** The reads and writes the cores make: Prisma in the app, an in-memory store in the checks. */
export interface CrmDb {
  board(userId: string, boardId: string): Promise<CrmTabRow | null>;
  /** Sets followUpDays on an open tab; rows changed. */
  setFollowUpDays(userId: string, boardId: string, days: number | null): Promise<number>;
  /** One customer, kept or archived, with their tab. */
  customer(userId: string, id: string): Promise<CrmCustomerRow | null>;
  /** A kept customer's status; rows changed. */
  setStatus(userId: string, customerId: string, status: CustomerStatus): Promise<number>;
  /** A customer's kept checks (any order). */
  checks(userId: string, customerId: string): Promise<CheckRow[]>;
  check(userId: string, id: string): Promise<(CheckRow & { customer: CrmCustomerRow }) | null>;
  createCheck(userId: string, customerId: string, f: CheckFields): Promise<{ id: string }>;
  /** A kept check only; rows changed. */
  updateCheck(userId: string, id: string, f: CheckFields): Promise<number>;
  /** Archives (at) a kept check or restores (null) an archived one; rows changed. */
  setCheckArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** A customer's collections, open and closed (not archived), each with its order. */
  collections(userId: string, customerId: string): Promise<CollectionRow[]>;
  collection(userId: string, id: string): Promise<(CollectionRow & { customer: CrmCustomerRow }) | null>;
  createCollection(userId: string, f: { boardId: string; customerId: string; name: string; note: string | null; orderId: string | null }): Promise<{ id: string; name: string }>;
  /** Writes `data` where the collection is the user's and `where` holds (open: not archived; archived); rows changed. */
  updateCollection(userId: string, id: string, where: { open?: boolean; archived?: boolean }, data: CollectionWrite): Promise<number>;
  /** One order of the user's. */
  order(userId: string, id: string): Promise<OrderRefRow | null>;
  /** A customer's kept orders on the tab, the ones still to order first. */
  customerOrders(userId: string, boardId: string, customerId: string): Promise<OrderRefRow[]>;
  /** The follow-ups' facts: one per kept customer of the tab. */
  followUpFacts(userId: string, boardId: string): Promise<FollowUpFacts[]>;
}

const TAB_SELECT = { id: true, userId: true, name: true, archivedAt: true, crmOn: true, ordersOn: true, followUpDays: true } as const;
const CUSTOMER_SELECT = { id: true, userId: true, boardId: true, number: true, name: true, archivedAt: true, board: { select: TAB_SELECT } } as const;
const CHECK_SELECT = { id: true, userId: true, customerId: true, rate: true, home: true, work: true, recordedAt: true, archivedAt: true, createdAt: true } as const;
const ORDER_REF = { id: true, userId: true, boardId: true, customerId: true, item: true, ordered: true, archivedAt: true } as const;
const COLLECTION_SELECT = {
  id: true,
  userId: true,
  boardId: true,
  customerId: true,
  name: true,
  orderId: true,
  note: true,
  closedAt: true,
  archivedAt: true,
  createdAt: true,
  order: { select: { id: true, item: true, ordered: true, archivedAt: true } },
} as const;
const CHECKS_MAX = 200;
const COLLECTIONS_MAX = 100;
const CUSTOMER_ORDERS_MAX = 50;
const FACTS_CUSTOMERS_MAX = 5000;
const FACTS_OPEN_TASKS_MAX = 5000;

/** The app's CrmDb. A read with relations loads them in its one round trip (relationJoins: "join"). */
export const prismaCrmDb: CrmDb = {
  board: (userId, boardId) => prisma.workBoard.findFirst({ where: { id: boardId, userId }, select: TAB_SELECT }),
  setFollowUpDays: async (userId, boardId, days) => (await prisma.workBoard.updateMany({ where: { id: boardId, userId, archivedAt: null }, data: { followUpDays: days } })).count,
  customer: (userId, id) => prisma.customer.findFirst({ relationLoadStrategy: "join", where: { id, userId }, select: CUSTOMER_SELECT }),
  setStatus: async (userId, customerId, status) => (await prisma.customer.updateMany({ where: { id: customerId, userId, archivedAt: null }, data: { status } })).count,
  checks: (userId, customerId) =>
    prisma.customerCheck.findMany({ where: { userId, customerId, archivedAt: null }, select: CHECK_SELECT, orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }], take: CHECKS_MAX }),
  check: (userId, id) => prisma.customerCheck.findFirst({ relationLoadStrategy: "join", where: { id, userId }, select: { ...CHECK_SELECT, customer: { select: CUSTOMER_SELECT } } }),
  createCheck: (userId, customerId, f) => prisma.customerCheck.create({ data: { userId, customerId, ...f }, select: { id: true } }),
  updateCheck: async (userId, id, f) => (await prisma.customerCheck.updateMany({ where: { id, userId, archivedAt: null }, data: f })).count,
  setCheckArchived: async (userId, id, at) =>
    (await prisma.customerCheck.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  collections: (userId, customerId) =>
    prisma.taskCollection.findMany({ relationLoadStrategy: "join", where: { userId, customerId, archivedAt: null }, select: COLLECTION_SELECT, orderBy: [{ createdAt: "desc" }], take: COLLECTIONS_MAX }),
  collection: (userId, id) => prisma.taskCollection.findFirst({ relationLoadStrategy: "join", where: { id, userId }, select: { ...COLLECTION_SELECT, customer: { select: CUSTOMER_SELECT } } }),
  createCollection: (userId, f) => prisma.taskCollection.create({ data: { userId, ...f }, select: { id: true, name: true } }),
  updateCollection: async (userId, id, where, data) =>
    (
      await prisma.taskCollection.updateMany({
        where: { id, userId, ...(where.open ? { archivedAt: null } : {}), ...(where.archived ? { archivedAt: { not: null } } : {}) },
        data,
      })
    ).count,
  order: (userId, id) => prisma.workOrder.findFirst({ where: { id, userId }, select: ORDER_REF }),
  customerOrders: (userId, boardId, customerId) =>
    prisma.workOrder.findMany({ where: { userId, boardId, customerId, archivedAt: null }, select: ORDER_REF, orderBy: [{ ordered: "asc" }, { createdAt: "desc" }], take: CUSTOMER_ORDERS_MAX }),
  followUpFacts: async (userId, boardId) => {
    const keptCustomer = { customer: { is: { boardId, archivedAt: null } } } as const;
    const [customers, latest, done, open] = await Promise.all([
      prisma.customer.findMany({ where: { userId, boardId, archivedAt: null }, select: { id: true, number: true, name: true, phone: true, status: true, createdAt: true }, take: FACTS_CUSTOMERS_MAX }),
      prisma.customerInteraction.groupBy({ by: ["customerId"], where: { userId, archivedAt: null, ...keptCustomer }, _max: { at: true } }),
      prisma.scheduledTask.groupBy({ by: ["customerId"], where: { userId, boardId, archivedAt: null, doneAt: { not: null }, ...keptCustomer }, _max: { doneAt: true } }),
      prisma.scheduledTask.findMany({ where: { userId, boardId, archivedAt: null, doneAt: null, ...keptCustomer }, select: { customerId: true, dueAt: true, allDay: true }, take: FACTS_OPEN_TASKS_MAX }),
    ]);
    const lastAt = new Map(latest.map((l) => [l.customerId, l._max.at ? l._max.at.getTime() : null]));
    const lastDone = new Map(done.map((d) => [d.customerId, d._max.doneAt ? d._max.doneAt.getTime() : null]));
    const openBy = new Map<string, { dueAt: string; allDay: boolean }[]>();
    for (const t of open) if (t.customerId) openBy.set(t.customerId, [...(openBy.get(t.customerId) ?? []), { dueAt: t.dueAt.toISOString(), allDay: t.allDay }]);
    return customers.map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      phone: c.phone,
      status: c.status,
      createdAt: c.createdAt.getTime(),
      lastInteractionAt: lastAt.get(c.id) ?? null,
      lastDoneAt: lastDone.get(c.id) ?? null,
      open: openBy.get(c.id) ?? [],
    }));
  },
};

// ── Views ───────────────────────────────────────────────────────────────────

export function checkViewOf(r: CheckRow): CustomerCheckView {
  return { id: r.id, rate: r.rate, home: r.home, work: r.work, recordedAt: keyOfDateColumn(r.recordedAt), createdAt: r.createdAt.toISOString() };
}

export function collectionViewOf(r: CollectionRow): CollectionView {
  const order: CollectionOrderRef | null = r.order && !r.order.archivedAt ? { id: r.order.id, item: r.order.item, ordered: r.order.ordered } : null;
  return { id: r.id, customerId: r.customerId, name: r.name, note: r.note, order, closedAt: r.closedAt ? r.closedAt.toISOString() : null, createdAt: r.createdAt.toISOString() };
}

// ── The gates ───────────────────────────────────────────────────────────────

/** The tab is the user's, open, and keeps a customer list. */
function tabGate(b: CrmTabRow | null, userId: string): CrmResult<CrmTabRow> {
  if (!b || b.userId !== userId) return fail(WORK_BOARD_GONE);
  if (b.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  if (!b.crmOn) return fail(CRM_OFF);
  return ok(b);
}

/** The customer is the user's, on a gated tab, and (unless `archivedToo`) kept. */
function customerGate(c: CrmCustomerRow | null, userId: string, archivedToo = false): CrmResult<CrmCustomerRow> {
  if (!c || c.userId !== userId || c.board.userId !== userId) return fail(CUSTOMER_GONE);
  const b = tabGate(c.board, userId);
  if (!b.ok) return fail(b.error);
  if (c.archivedAt && !archivedToo) return fail(CUSTOMER_ARCHIVED);
  return ok(c);
}

async function openCustomer(db: CrmDb, userId: string, customerId: string): Promise<CrmResult<CrmCustomerRow>> {
  if (!isRowId(customerId)) return fail(CUSTOMER_GONE);
  return customerGate(await db.customer(userId, customerId), userId);
}

async function openCheck(db: CrmDb, userId: string, id: string): Promise<CrmResult<CheckRow & { customer: CrmCustomerRow }>> {
  if (!isRowId(id)) return fail(CHECK_GONE);
  const row = await db.check(userId, id);
  if (!row || row.userId !== userId || row.customer.id !== row.customerId) return fail(CHECK_GONE);
  const c = customerGate(row.customer, userId);
  return c.ok ? ok(row) : fail(c.error);
}

async function openCollection(db: CrmDb, userId: string, id: string, archivedToo = false): Promise<CrmResult<CollectionRow & { customer: CrmCustomerRow }>> {
  if (!isRowId(id)) return fail(COLLECTION_GONE);
  const row = await db.collection(userId, id);
  if (!row || row.userId !== userId || row.customer.id !== row.customerId || row.boardId !== row.customer.boardId) return fail(COLLECTION_GONE);
  const c = customerGate(row.customer, userId);
  if (!c.ok) return fail(c.error);
  if (row.archivedAt && !archivedToo) return fail(COLLECTION_ARCHIVED);
  return ok(row);
}

/**
 * The order a collection links: none; the one already linked (kept, even archived since); or a new one, which must be
 * the user's, on THIS tab, the same customer's and kept, on a tab whose order list is on.
 */
async function orderGate(db: CrmDb, userId: string, board: CrmTabRow, customerId: string, orderId: string | null, prevId: string | null): Promise<CrmResult<string | null>> {
  if (!orderId) return ok(null);
  if (orderId === prevId) return ok(orderId);
  if (!board.ordersOn) return fail(COLLECTION_ORDERS_OFF);
  const o = await db.order(userId, orderId);
  if (!o || o.userId !== userId || o.boardId !== board.id || o.customerId !== customerId || o.archivedAt) return fail(COLLECTION_ORDER_BAD);
  return ok(o.id);
}

// ── The tab's follow-up alert, a customer's status ─────────────────────────

/** The tab's follow-up alert: Off (null) or 7, 14, 30, 60, 90 days. The customer list need not be on (it is kept). */
export async function setFollowUpDaysCore(userId: string, boardId: string, raw: unknown, db: CrmDb = prismaCrmDb): Promise<CrmResult<{ followUpDays: number | null }>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  const days = cleanFollowUpDays(raw);
  if (!days.ok) return fail(days.error);
  const b = await db.board(userId, boardId);
  if (!b || b.userId !== userId) return fail(WORK_BOARD_GONE);
  if (b.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  if (b.followUpDays !== days.value && (await db.setFollowUpDays(userId, boardId, days.value)) === 0) return fail(WORK_BOARD_ARCHIVED);
  // The header's tab and counts read it.
  invalidate("life", "work");
  return ok({ followUpDays: days.value });
}

/** A kept customer's status (their Overview's quick change). */
export async function setCustomerStatusCore(userId: string, customerId: string, raw: unknown, db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string; status: CustomerStatus }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  // One of the four, always (an empty one is no choice here: the edit sheet's default is not this menu's).
  const s = statusOf(raw);
  if (!s) return fail(STATUS_BAD);
  if ((await db.setStatus(userId, customerId, s)) === 0) return fail(CUSTOMER_ARCHIVED);
  // The index (the sheets) and the follow-ups (an Inactive customer is never flagged) read it.
  invalidate("work");
  return ok({ id: customerId, status: s });
}

// ── Checks ─────────────────────────────────────────────────────────────────

/** Records a check: Rate, Home, Work (at least one) and Record at (today's life day unless one is picked). */
export async function addCheckCore(userId: string, customerId: string, input: unknown, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = cleanCheckInput(input, todayKey(now));
  if (!f.ok) return fail(f.error);
  const row = await db.createCheck(userId, customerId, { rate: f.value.rate, home: f.value.home, work: f.value.work, recordedAt: dateColumn(f.value.recordedAt) });
  return ok({ id: row.id });
}

/** Edits a check: its three fields and its day (left out: today's; the sheet always sends it). */
export async function editCheckCore(userId: string, checkId: string, input: unknown, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string }>> {
  const row = await openCheck(db, userId, checkId);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) return fail(CHECK_GONE);
  const f = cleanCheckInput(input, todayKey(now));
  if (!f.ok) return fail(f.error);
  if ((await db.updateCheck(userId, checkId, { rate: f.value.rate, home: f.value.home, work: f.value.work, recordedAt: dateColumn(f.value.recordedAt) })) === 0) return fail(CHECK_GONE);
  return ok({ id: checkId });
}

/** Archives a check (the page offers Undo: restoreCheckCore). Again: ok. */
export async function archiveCheckCore(userId: string, checkId: string, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string }>> {
  const row = await openCheck(db, userId, checkId);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.setCheckArchived(userId, checkId, now);
  return ok({ id: checkId });
}

export async function restoreCheckCore(userId: string, checkId: string, db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string }>> {
  const row = await openCheck(db, userId, checkId);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.setCheckArchived(userId, checkId, null);
  return ok({ id: checkId });
}

// ── Task collections ───────────────────────────────────────────────────────

/** Starts a collection for a kept customer: a name, optionally one of their orders on this tab, a note. */
export async function createCollectionCore(userId: string, customerId: string, input: unknown, db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string; name: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = cleanCollectionInput(input);
  if (!f.ok) return fail(f.error);
  const order = await orderGate(db, userId, c.value.board, customerId, f.value.orderId ?? null, null);
  if (!order.ok) return fail(order.error);
  const row = await db.createCollection(userId, { boardId: c.value.boardId, customerId, name: f.value.name, note: f.value.note, orderId: order.value });
  invalidate("work");
  return ok({ id: row.id, name: row.name });
}

/** Edits a collection: its name, note and order (left out: its own). */
export async function editCollectionCore(userId: string, collectionId: string, input: unknown, db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string }>> {
  const row = await openCollection(db, userId, collectionId);
  if (!row.ok) return fail(row.error);
  const f = cleanCollectionInput(input);
  if (!f.ok) return fail(f.error);
  const wanted = f.value.orderId === undefined ? row.value.orderId : f.value.orderId;
  const order = await orderGate(db, userId, row.value.customer.board, row.value.customerId, wanted, row.value.orderId);
  if (!order.ok) return fail(order.error);
  if ((await db.updateCollection(userId, collectionId, { open: true }, { name: f.value.name, note: f.value.note, orderId: order.value })) === 0) return fail(COLLECTION_ARCHIVED);
  invalidate("work");
  return ok({ id: collectionId });
}

/** Closes a collection (its work is done: no new tasks join it) or opens it again. Its tasks are untouched. */
export async function setCollectionClosedCore(userId: string, collectionId: string, closed: boolean, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string; closed: boolean }>> {
  const row = await openCollection(db, userId, collectionId);
  if (!row.ok) return fail(row.error);
  const want = closed === true;
  if ((row.value.closedAt != null) !== want && (await db.updateCollection(userId, collectionId, { open: true }, { closedAt: want ? now : null })) === 0) return fail(COLLECTION_ARCHIVED);
  invalidate("work");
  return ok({ id: collectionId, closed: want });
}

/** Archives a collection: it leaves the customer's page and the picker; its tasks stay, shown under "No collection". */
export async function archiveCollectionCore(userId: string, collectionId: string, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string }>> {
  const row = await openCollection(db, userId, collectionId, true);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.updateCollection(userId, collectionId, { open: true }, { archivedAt: now });
  invalidate("work");
  return ok({ id: collectionId });
}

export async function restoreCollectionCore(userId: string, collectionId: string, db: CrmDb = prismaCrmDb): Promise<CrmResult<{ id: string }>> {
  const row = await openCollection(db, userId, collectionId, true);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.updateCollection(userId, collectionId, { archived: true }, { archivedAt: null });
  invalidate("work");
  return ok({ id: collectionId });
}

/** The customer's kept orders a collection can link (the sheets' order picker); none while the order list is off. */
export async function customerOrderOptionsCore(userId: string, customerId: string, db: CrmDb = prismaCrmDb): Promise<CrmResult<CollectionOrderRef[]>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  if (!c.value.board.ordersOn) return ok([]);
  const rows = await db.customerOrders(userId, c.value.boardId, customerId);
  return ok(rows.filter((o) => o.userId === userId && o.boardId === c.value.boardId && o.customerId === customerId && !o.archivedAt).map((o) => ({ id: o.id, item: o.item, ordered: o.ordered })));
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** The tab's follow-up facts, cached under 'work' (the clock is applied outside the cache). */
export function loadFollowUpFacts(userId: string, boardId: string, db: CrmDb = prismaCrmDb): Promise<FollowUpFacts[]> {
  const load = () => db.followUpFacts(userId, boardId);
  return db === prismaCrmDb ? cached(`followUps:${userId}:${boardId}`, ["work"], load) : load();
}

const daysOf = (b: CrmTabRow) => (b.followUpDays === undefined ? FOLLOW_UP_DEFAULT : b.followUpDays);

/**
 * The Agenda's Follow up: the tab's kept customers who need one (crm.ts followUpsOf), with the tab's days. Null where
 * the tab is not the user's, is archived, or keeps no customer list (no section is drawn).
 */
export async function loadFollowUps(userId: string, boardId: string, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<{ days: number | null; rows: FollowUp[] } | null> {
  if (!isBoardId(boardId)) return null;
  const [b, facts] = await Promise.all([db.board(userId, boardId), loadFollowUpFacts(userId, boardId, db)]);
  const gate = tabGate(b, userId);
  if (!gate.ok) return null;
  const days = daysOf(gate.value);
  return { days, rows: followUpsOf(facts, days, now) };
}

/** The work frame's Customers count: how many need a follow-up. */
export async function followUpCountCore(userId: string, boardId: string, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<CrmResult<{ count: number }>> {
  const f = await loadFollowUps(userId, boardId, now, db);
  return f ? ok({ count: f.rows.length }) : fail(WORK_BOARD_GONE);
}

export interface CustomerCrmData {
  checks: CustomerCheckView[];
  /** Open and closed, not archived. */
  collections: CollectionView[];
  /** Whether they need a follow-up now, and why. */
  followUp: FollowUp | null;
  followUpDays: number | null;
}

/**
 * A customer page's Phase 2 parts, in one wave: their checks (newest recorded first), their collections (each with its
 * order) and their follow-up (the tab's cached facts). Null where the customer is not the user's on this tab, or the
 * tab is archived or keeps no customer list (the page says so through its own read).
 */
export async function loadCustomerCrm(userId: string, boardId: string, customerId: string, now: Date = new Date(), db: CrmDb = prismaCrmDb): Promise<CustomerCrmData | null> {
  if (!isBoardId(boardId) || !isRowId(customerId)) return null;
  const [c, checks, collections, facts] = await Promise.all([db.customer(userId, customerId), db.checks(userId, customerId), db.collections(userId, customerId), loadFollowUpFacts(userId, boardId, db)]);
  if (!c || c.userId !== userId || c.boardId !== boardId) return null;
  const gate = tabGate(c.board, userId);
  if (!gate.ok) return null;
  const days = daysOf(gate.value);
  const mine = facts.find((f) => f.id === customerId);
  return {
    checks: sortChecks(checks.filter((k) => !k.archivedAt && k.customerId === customerId).map(checkViewOf)),
    collections: collections.filter((k) => !k.archivedAt && k.customerId === customerId && k.boardId === boardId).map(collectionViewOf),
    followUp: mine && !c.archivedAt ? followUpOf(mine, days, now) : null,
    followUpDays: days,
  };
}
