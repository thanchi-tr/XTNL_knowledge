/**
 * Order lists on the server (2026-10-14; the rules are work-orders.ts).
 * Every write checks, in this order, that the work tab is the user's (else
 * WORK_BOARD_GONE), open (WORK_BOARD_ARCHIVED) and keeps an order list
 * (ORDERS_OFF), and, for a line's own changes, that the line is kept
 * (ORDER_ARCHIVED). One read gates a write (the line with its tab joined),
 * then one write.
 *
 *   setOrdersOnCore(userId, boardId, on)        the tab's list on or off (off hides; nothing is deleted)
 *   addOrderCore / editOrderCore                 a customer ID links the line to an open customer of THIS
 *                                                tab (matched ignoring case) and fills a blank name and
 *                                                contact; an unknown ID is refused with a line; an edit that
 *                                                leaves the ID as it was keeps the link (even to a customer
 *                                                archived since)
 *   setOrderedCore(userId, id, ordered)          orderedAt now when ticked (today as the date when it had
 *                                                none), cleared when unticked (work-orders.ts orderedPatch)
 *   archiveOrderCore / restoreOrderCore          archived lines leave the list (the page offers Undo)
 *   orderCountCore                               the work frame's Orders count ("n to order")
 *   loadOrdersPage / loadCustomerOrders          the order page's read, and a customer page's section
 *
 * Work, never the game: nothing here writes the ledger (ActivityEvent), pays
 * XP, touches the streak or momentum, or clears a game cache. Every core
 * takes a WorkOrderDb, so scripts/work-orders-check.ts runs them against an
 * in-memory one.
 */
import { prisma } from "./prisma";
import { dateColumn, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, isBoardId } from "./work-boards";
import { isRowId, numberKey } from "./customers";
import {
  ORDERS_OFF,
  ORDER_ARCHIVED,
  ORDER_CUSTOMER_OFF,
  ORDER_GONE,
  cleanOrderContact,
  cleanOrderCustomer,
  cleanOrderDate,
  cleanOrderItem,
  cleanOrderName,
  orderCustomerUnknown,
  orderedPatch,
  sortOrders,
  type OrderCustomerRef,
  type OrderView,
  type OrdersBoardView,
} from "./work-orders";

export type OrderResult<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): OrderResult<T> => ({ ok: true, value });
const fail = <T>(error: string): OrderResult<T> => ({ ok: false, error });

// ── Rows and the db the cores use ──────────────────────────────────────────

export interface OrdersBoardRow {
  id: string;
  userId: string;
  name: string;
  archivedAt: Date | null;
  crmOn: boolean;
  ordersOn: boolean;
}

export interface WorkOrderRow {
  id: string;
  userId: string;
  boardId: string;
  name: string;
  contact: string | null;
  item: string;
  ordered: boolean;
  orderedAt: Date | null;
  /** A @db.Date column: UTC midnight of the day. */
  date: Date | null;
  customerId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

/** A line with the customer it links to (id and ID only), when there is one. */
export type WorkOrderListRow = WorkOrderRow & { customer: { id: string; number: string } | null };
export type WorkOrderWithBoard = WorkOrderListRow & { board: OrdersBoardRow };

export interface WorkOrderFields {
  name: string;
  contact: string | null;
  item: string;
  ordered: boolean;
  orderedAt: Date | null;
  date: Date | null;
  customerId: string | null;
}

/** The reads and writes the cores make: Prisma in the app, an in-memory store in the checks. */
export interface WorkOrderDb {
  board(userId: string, boardId: string): Promise<OrdersBoardRow | null>;
  /** Sets ordersOn on an open tab; the number of rows changed. */
  setOrdersOn(userId: string, boardId: string, on: boolean): Promise<number>;
  /** The tab's kept lines (any order). */
  orders(userId: string, boardId: string): Promise<WorkOrderListRow[]>;
  /** One line, kept or archived, with its tab. */
  order(userId: string, id: string): Promise<WorkOrderWithBoard | null>;
  /** The tab's open customers (the sheet matches a typed ID among them). */
  customers(userId: string, boardId: string): Promise<OrderCustomerRef[]>;
  /** An open customer of the tab whose ID is `number`, ignoring case. */
  customerByNumber(userId: string, boardId: string, number: string): Promise<OrderCustomerRef | null>;
  createOrder(userId: string, boardId: string, f: WorkOrderFields): Promise<WorkOrderRow>;
  /** A kept line only; the number of rows changed. */
  updateOrder(userId: string, id: string, f: Partial<WorkOrderFields>): Promise<number>;
  /** Archives (at) a kept line or restores (null) an archived one; rows changed. */
  setOrderArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** How many kept lines on the tab are not ordered yet. */
  todoCount(userId: string, boardId: string): Promise<number>;
  /** One customer's kept lines on the tab (any order). */
  customerOrders(userId: string, boardId: string, customerId: string): Promise<WorkOrderListRow[]>;
}

const BOARD_SELECT = { id: true, userId: true, name: true, archivedAt: true, crmOn: true, ordersOn: true } as const;
const ORDER_SELECT = { id: true, userId: true, boardId: true, name: true, contact: true, item: true, ordered: true, orderedAt: true, date: true, customerId: true, archivedAt: true, createdAt: true } as const;
const ORDER_WITH_CUSTOMER = { ...ORDER_SELECT, customer: { select: { id: true, number: true } } } as const;
const CUSTOMER_REF = { id: true, number: true, name: true, phone: true } as const;
/** The lines still to order come first in the read, so a long list drops old ordered lines before anything to do. */
const LIST_ORDER = [{ ordered: "asc" }, { orderedAt: "desc" }, { createdAt: "desc" }] as const;
const ORDERS_MAX = 2000;
const CUSTOMER_ORDERS_MAX = 50;
const OPEN_CUSTOMERS_MAX = 5000;

/** The app's WorkOrderDb. */
export const prismaWorkOrderDb: WorkOrderDb = {
  board: (userId, boardId) => prisma.workBoard.findFirst({ where: { id: boardId, userId }, select: BOARD_SELECT }),
  setOrdersOn: async (userId, boardId, on) => (await prisma.workBoard.updateMany({ where: { id: boardId, userId, archivedAt: null }, data: { ordersOn: on } })).count,
  orders: (userId, boardId) => prisma.workOrder.findMany({ where: { userId, boardId, archivedAt: null }, select: ORDER_WITH_CUSTOMER, orderBy: [...LIST_ORDER], take: ORDERS_MAX }),
  order: (userId, id) => prisma.workOrder.findFirst({ where: { id, userId }, select: { ...ORDER_WITH_CUSTOMER, board: { select: BOARD_SELECT } } }),
  customers: (userId, boardId) => prisma.customer.findMany({ where: { userId, boardId, archivedAt: null }, select: CUSTOMER_REF, orderBy: { createdAt: "asc" }, take: OPEN_CUSTOMERS_MAX }),
  customerByNumber: (userId, boardId, number) =>
    prisma.customer.findFirst({ where: { userId, boardId, archivedAt: null, number: { equals: number, mode: "insensitive" } }, select: CUSTOMER_REF }),
  createOrder: (userId, boardId, f) => prisma.workOrder.create({ data: { userId, boardId, ...f }, select: ORDER_SELECT }),
  updateOrder: async (userId, id, f) => (await prisma.workOrder.updateMany({ where: { id, userId, archivedAt: null }, data: f })).count,
  setOrderArchived: async (userId, id, at) => (await prisma.workOrder.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  todoCount: (userId, boardId) => prisma.workOrder.count({ where: { userId, boardId, archivedAt: null, ordered: false } }),
  customerOrders: (userId, boardId, customerId) =>
    prisma.workOrder.findMany({ where: { userId, boardId, customerId, archivedAt: null }, select: ORDER_WITH_CUSTOMER, orderBy: [...LIST_ORDER], take: CUSTOMER_ORDERS_MAX }),
};

// ── The gates ──────────────────────────────────────────────────────────────

/** The tab is the user's, open, and keeps an order list. */
function boardGate(board: OrdersBoardRow | null, userId: string): OrderResult<OrdersBoardRow> {
  if (!board || board.userId !== userId) return fail(WORK_BOARD_GONE);
  if (board.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  if (!board.ordersOn) return fail(ORDERS_OFF);
  return ok(board);
}

async function openBoard(db: WorkOrderDb, userId: string, boardId: string): Promise<OrderResult<OrdersBoardRow>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  return boardGate(await db.board(userId, boardId), userId);
}

/** The line is the user's, on a gated tab, and (unless `archivedToo`) kept. */
async function openOrder(db: WorkOrderDb, userId: string, id: string, archivedToo = false): Promise<OrderResult<WorkOrderWithBoard>> {
  if (!isRowId(id)) return fail(ORDER_GONE);
  const row = await db.order(userId, id);
  if (!row || row.userId !== userId) return fail(ORDER_GONE);
  const b = boardGate(row.board, userId);
  if (!b.ok) return fail(b.error);
  if (row.archivedAt && !archivedToo) return fail(ORDER_ARCHIVED);
  return ok(row);
}

// ── The fields ─────────────────────────────────────────────────────────────

const has = (i: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(i, k) && i[k] !== undefined;
const blank = (raw: unknown) => typeof raw !== "string" || raw.trim() === "";

/**
 * A line's fields from the sheet's input, on an add (`prev` null) or an edit.
 * The item and date are checked first, then the customer (a newly linked
 * customer fills a blank name and contact), then the name and contact, then
 * the ordered tick (orderedPatch). A field left out of an edit keeps the
 * line's own value (the item is always sent).
 */
async function fieldsOf(db: WorkOrderDb, userId: string, board: OrdersBoardRow, input: unknown, prev: WorkOrderListRow | null, now: Date): Promise<OrderResult<WorkOrderFields>> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const today = todayKey(now);

  const item = cleanOrderItem(i.item);
  if (!item.ok) return fail(item.error);
  let date: DayKey | null;
  if (has(i, "date")) {
    const d = cleanOrderDate(i.date);
    if (!d.ok) return fail(d.error);
    date = d.value;
  } else date = prev ? (prev.date ? keyOfDateColumn(prev.date) : null) : today;

  // The customer: left out keeps the line's own link (none on an add); the same ID keeps it (even to a customer
  // archived since); a new ID must be an open customer of THIS tab, and fills a blank name and contact.
  let customerId: string | null = prev?.customerId ?? null;
  let fill: OrderCustomerRef | null = null;
  if (has(i, "customer")) {
    const typed = cleanOrderCustomer(i.customer);
    if (!typed.ok) return fail(typed.error);
    if (typed.value === null) customerId = null;
    else if (!(prev?.customer && numberKey(prev.customer.number) === numberKey(typed.value))) {
      if (!board.crmOn) return fail(ORDER_CUSTOMER_OFF);
      const found = await db.customerByNumber(userId, board.id, typed.value);
      if (!found) return fail(orderCustomerUnknown(typed.value));
      customerId = found.id;
      fill = found;
    }
  }

  // The name and contact: left out, an edit keeps the line's own; blank, a newly linked customer's fill them.
  const rawName = has(i, "name") ? i.name : (prev?.name ?? "");
  const rawContact = has(i, "contact") ? i.contact : (prev?.contact ?? "");
  const name = cleanOrderName(blank(rawName) && fill ? fill.name : rawName);
  if (!name.ok) return fail(name.error);
  const contact = cleanOrderContact(blank(rawContact) && fill ? (fill.phone ?? "") : rawContact);
  if (!contact.ok) return fail(contact.error);

  const was = { ordered: prev?.ordered ?? false, orderedAt: prev?.orderedAt ?? null, date };
  const tick = orderedPatch(was, has(i, "ordered") ? i.ordered === true : was.ordered, now, today);
  return ok({
    name: name.value,
    contact: contact.value,
    item: item.value,
    ordered: tick.ordered,
    orderedAt: tick.orderedAt,
    date: tick.date ? dateColumn(tick.date) : null,
    customerId,
  });
}

// ── The tab's switch ───────────────────────────────────────────────────────

/** Switches the tab's order list on or off. Off hides it (the work frame's Orders page, a customer's section); every line is kept. */
export async function setOrdersOnCore(userId: string, boardId: string, on: boolean, db: WorkOrderDb = prismaWorkOrderDb): Promise<OrderResult<{ ordersOn: boolean }>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  const board = await db.board(userId, boardId);
  if (!board || board.userId !== userId) return fail(WORK_BOARD_GONE);
  if (board.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  const want = on === true;
  if (board.ordersOn !== want && (await db.setOrdersOn(userId, boardId, want)) === 0) return fail(WORK_BOARD_ARCHIVED);
  return ok({ ordersOn: want });
}

// ── Lines ──────────────────────────────────────────────────────────────────

/** Adds a line to the tab's list: today as its date unless one is given; ticked, it is stamped ordered now. */
export async function addOrderCore(userId: string, boardId: string, input: unknown, now: Date = new Date(), db: WorkOrderDb = prismaWorkOrderDb): Promise<OrderResult<{ id: string }>> {
  const board = await openBoard(db, userId, boardId);
  if (!board.ok) return fail(board.error);
  const f = await fieldsOf(db, userId, board.value, input, null, now);
  if (!f.ok) return fail(f.error);
  const row = await db.createOrder(userId, boardId, f.value);
  return ok({ id: row.id });
}

/** Edits a kept line: name, contact, item, date, the tick, the customer. */
export async function editOrderCore(userId: string, orderId: string, input: unknown, now: Date = new Date(), db: WorkOrderDb = prismaWorkOrderDb): Promise<OrderResult<{ id: string }>> {
  const row = await openOrder(db, userId, orderId);
  if (!row.ok) return fail(row.error);
  const f = await fieldsOf(db, userId, row.value.board, input, row.value, now);
  if (!f.ok) return fail(f.error);
  if ((await db.updateOrder(userId, orderId, f.value)) === 0) return fail(ORDER_GONE);
  return ok({ id: orderId });
}

/** Ticks a line ordered (orderedAt now; today as its date when it had none) or back to order (orderedAt cleared). */
export async function setOrderedCore(userId: string, orderId: string, ordered: boolean, now: Date = new Date(), db: WorkOrderDb = prismaWorkOrderDb): Promise<OrderResult<{ id: string; ordered: boolean }>> {
  const row = await openOrder(db, userId, orderId);
  if (!row.ok) return fail(row.error);
  const want = ordered === true;
  if (row.value.ordered !== want) {
    const prevDate = row.value.date ? keyOfDateColumn(row.value.date) : null;
    const tick = orderedPatch({ ordered: row.value.ordered, orderedAt: row.value.orderedAt, date: prevDate }, want, now, todayKey(now));
    const patch: Partial<WorkOrderFields> = { ordered: tick.ordered, orderedAt: tick.orderedAt };
    if (tick.date !== prevDate) patch.date = tick.date ? dateColumn(tick.date) : null;
    if ((await db.updateOrder(userId, orderId, patch)) === 0) return fail(ORDER_GONE);
  }
  return ok({ id: orderId, ordered: want });
}

/** Archives a line (the page offers Undo: restoreOrderCore). Again: ok. */
export async function archiveOrderCore(userId: string, orderId: string, now: Date = new Date(), db: WorkOrderDb = prismaWorkOrderDb): Promise<OrderResult<{ id: string }>> {
  const row = await openOrder(db, userId, orderId, true);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.setOrderArchived(userId, orderId, now);
  return ok({ id: orderId });
}

/** Brings an archived line back as it was. Kept: ok. */
export async function restoreOrderCore(userId: string, orderId: string, db: WorkOrderDb = prismaWorkOrderDb): Promise<OrderResult<{ id: string }>> {
  const row = await openOrder(db, userId, orderId, true);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.setOrderArchived(userId, orderId, null);
  return ok({ id: orderId });
}

/** The work frame's Orders count: the kept lines not ordered yet. Off: refused (no Orders page, no count). */
export async function orderCountCore(userId: string, boardId: string, db: WorkOrderDb = prismaWorkOrderDb): Promise<OrderResult<{ todo: number }>> {
  const board = await openBoard(db, userId, boardId);
  if (!board.ok) return fail(board.error);
  return ok({ todo: await db.todoCount(userId, boardId) });
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** A line as the pages hand it to their views. */
export function orderViewOf(r: WorkOrderListRow): OrderView {
  return {
    id: r.id,
    name: r.name,
    contact: r.contact,
    item: r.item,
    ordered: r.ordered,
    orderedAt: r.orderedAt ? r.orderedAt.toISOString() : null,
    date: r.date ? keyOfDateColumn(r.date) : null,
    createdAt: r.createdAt.toISOString(),
    customer: r.customer ? { id: r.customer.id, number: r.customer.number } : null,
  };
}

const boardView = (b: OrdersBoardRow): OrdersBoardView => ({ id: b.id, name: b.name, crmOn: b.crmOn });

export type OrdersPageData =
  | { kind: "gone" }
  | { kind: "archived" | "off"; board: OrdersBoardView }
  | { kind: "ok"; board: OrdersBoardView; orders: OrderView[]; customers: OrderCustomerRef[]; today: DayKey };

/**
 * The order page, in one wave: the tab, its kept lines (sorted: work-orders.ts
 * sortOrders) and, while its customer list is on, its open customers (the
 * sheet matches a typed customer ID among them). An unknown or foreign tab is
 * gone; an archived tab, or one whose list is off, says so.
 */
export async function loadOrdersPage(userId: string, boardId: string, now: Date = new Date(), db: WorkOrderDb = prismaWorkOrderDb): Promise<OrdersPageData> {
  if (!isBoardId(boardId)) return { kind: "gone" };
  const [board, rows] = await Promise.all([db.board(userId, boardId), db.orders(userId, boardId)]);
  if (!board || board.userId !== userId) return { kind: "gone" };
  if (board.archivedAt) return { kind: "archived", board: boardView(board) };
  if (!board.ordersOn) return { kind: "off", board: boardView(board) };
  const customers = board.crmOn ? await db.customers(userId, boardId) : [];
  return {
    kind: "ok",
    board: boardView(board),
    orders: sortOrders(rows.filter((r) => !r.archivedAt && r.boardId === boardId).map(orderViewOf)),
    customers,
    today: todayKey(now),
  };
}

/**
 * A customer page's "Orders" section: that customer's kept lines on the tab
 * (sorted), or null where the tab is not the user's, is archived, or keeps no
 * order list (the section is not drawn). The customer page itself checks the
 * customer is on this tab.
 */
export async function loadCustomerOrders(
  userId: string,
  boardId: string,
  customerId: string,
  now: Date = new Date(),
  db: WorkOrderDb = prismaWorkOrderDb
): Promise<{ orders: OrderView[]; today: DayKey } | null> {
  if (!isBoardId(boardId) || !isRowId(customerId)) return null;
  const [board, rows] = await Promise.all([db.board(userId, boardId), db.customerOrders(userId, boardId, customerId)]);
  if (!boardGate(board, userId).ok) return null;
  return {
    orders: sortOrders(rows.filter((r) => !r.archivedAt && r.boardId === boardId && r.customerId === customerId).map(orderViewOf)),
    today: todayKey(now),
  };
}
