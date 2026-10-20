/**
 * A work tab's deals on the server (2026-10-20; the rules are deals.ts; migration 20261228000000_crm). Every write
 * checks, in this order: the work tab is the user's (else WORK_BOARD_GONE), open (WORK_BOARD_ARCHIVED) and keeps its
 * customer list (DEALS_CRM_OFF: deals live with it); the deal is the user's and on that tab (DEAL_GONE) and not
 * archived (DEAL_ARCHIVED); a customer is the user's, on the SAME tab (DEAL_CUSTOMER_GONE) and, newly linked, kept
 * (DEAL_CUSTOMER_ARCHIVED); then the fields. One read gates, then one write.
 *
 *   createDealCore / editDealCore        the sheet; a stage change goes through stagePatchOf (Won or Lost stamps
 *                                        closedAt, back clears it) and puts the deal at the end of its new column
 *   moveDealCore(userId, id, stage)      the card's "Move to…" (the same patch)
 *   archiveDealCore / restoreDealCore    archive and its Undo
 *   createOrderFromDealCore              a Won deal with no order yet becomes a line on the tab's order list through
 *                                        work-orders-server addOrderCore (its own gate: the order list must be on),
 *                                        then the deal keeps the order's id (Deal.orderId)
 *   loadDealsPage / loadCustomerDeals    the Deals page's read, and a customer's Deals tab and Overview
 *
 * Deals are read fresh on every page (no cache to clear). Every core takes a DealDb, so scripts/crm-check.ts runs them
 * against an in-memory one. Work, never the game: no ledger, no XP, no streak.
 */
import { prisma } from "./prisma";
import { dateColumn, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, isBoardId } from "./work-boards";
import { isRowId } from "./customers";
import { addOrderCore } from "./work-orders-server";
import {
  DEALS_CRM_OFF,
  DEAL_ARCHIVED,
  DEAL_CUSTOMER_ARCHIVED,
  DEAL_CUSTOMER_GONE,
  DEAL_GONE,
  DEAL_HAS_ORDER,
  DEAL_NOT_WON,
  DEAL_STAGE_BAD,
  cleanDealInput,
  dealStageOf,
  pipelineOf,
  stagePatchOf,
  type DealStage,
  type DealView,
  type DealsBoardView,
} from "./deals";

export type DealResult<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): DealResult<T> => ({ ok: true, value });
const fail = <T>(error: string): DealResult<T> => ({ ok: false, error });

// ── Rows and the db the cores use ───────────────────────────────────────────

export interface DealTabRow {
  id: string;
  userId: string;
  name: string;
  archivedAt: Date | null;
  crmOn: boolean;
  /** Absent in the checks' tables: off. */
  ordersOn?: boolean;
}

export interface DealCustomerRow {
  id: string;
  userId: string;
  boardId: string;
  number: string;
  name: string;
  phone: string | null;
  archivedAt: Date | null;
}

export interface DealRow {
  id: string;
  userId: string;
  boardId: string;
  customerId: string | null;
  title: string;
  valueCents: number;
  stage: string;
  /** A @db.Date column: UTC midnight of the day. */
  expectedCloseDay: Date | null;
  note: string | null;
  closedAt: Date | null;
  orderId: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
}

export type DealListRow = DealRow & {
  customer: { id: string; number: string; name: string; phone: string | null; archivedAt: Date | null } | null;
  order: { id: string; item: string; archivedAt: Date | null } | null;
};
export type DealWithBoard = DealListRow & { board: DealTabRow };

export interface DealFields {
  title: string;
  valueCents: number;
  stage: DealStage;
  expectedCloseDay: Date | null;
  note: string | null;
  customerId: string | null;
  closedAt: Date | null;
}

/** The reads and writes the cores make: Prisma in the app, an in-memory store in the checks. */
export interface DealDb {
  board(userId: string, boardId: string): Promise<DealTabRow | null>;
  customer(userId: string, id: string): Promise<DealCustomerRow | null>;
  /** The tab's kept deals (any order). */
  deals(userId: string, boardId: string): Promise<DealListRow[]>;
  /** One customer's kept deals (any order). */
  customerDeals(userId: string, customerId: string): Promise<DealListRow[]>;
  /** One deal of the user's (kept or archived), with its tab. */
  deal(userId: string, id: string): Promise<DealWithBoard | null>;
  /** The highest sortOrder among the tab's kept deals in a stage (0 with none). */
  maxSortOrder(userId: string, boardId: string, stage: DealStage): Promise<number>;
  createDeal(userId: string, boardId: string, f: DealFields & { sortOrder: number }): Promise<{ id: string }>;
  /** A kept deal only; rows changed. */
  updateDeal(userId: string, id: string, data: Partial<DealFields & { sortOrder: number }>): Promise<number>;
  /** Archives (at) a kept deal or restores (null) an archived one; rows changed. */
  setDealArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** Links the order a Won deal became: only while the deal is kept, Won and has none; rows changed. */
  setDealOrder(userId: string, id: string, orderId: string): Promise<number>;
}

const TAB_SELECT = { id: true, userId: true, name: true, archivedAt: true, crmOn: true, ordersOn: true } as const;
const CUSTOMER_SELECT = { id: true, userId: true, boardId: true, number: true, name: true, phone: true, archivedAt: true } as const;
const DEAL_SELECT = {
  id: true,
  userId: true,
  boardId: true,
  customerId: true,
  title: true,
  valueCents: true,
  stage: true,
  expectedCloseDay: true,
  note: true,
  closedAt: true,
  orderId: true,
  sortOrder: true,
  archivedAt: true,
  createdAt: true,
  customer: { select: { id: true, number: true, name: true, phone: true, archivedAt: true } },
  order: { select: { id: true, item: true, archivedAt: true } },
} as const;
const DEALS_MAX = 1000;
const CUSTOMER_DEALS_MAX = 100;

/** The app's DealDb. A read with relations loads them in its one round trip (relationJoins: "join"). */
export const prismaDealDb: DealDb = {
  board: (userId, boardId) => prisma.workBoard.findFirst({ where: { id: boardId, userId }, select: TAB_SELECT }),
  customer: (userId, id) => prisma.customer.findFirst({ where: { id, userId }, select: CUSTOMER_SELECT }),
  deals: (userId, boardId) => prisma.deal.findMany({ relationLoadStrategy: "join", where: { userId, boardId, archivedAt: null }, select: DEAL_SELECT, orderBy: [{ stage: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }], take: DEALS_MAX }),
  customerDeals: (userId, customerId) => prisma.deal.findMany({ relationLoadStrategy: "join", where: { userId, customerId, archivedAt: null }, select: DEAL_SELECT, orderBy: [{ createdAt: "desc" }], take: CUSTOMER_DEALS_MAX }),
  deal: (userId, id) => prisma.deal.findFirst({ relationLoadStrategy: "join", where: { id, userId }, select: { ...DEAL_SELECT, board: { select: TAB_SELECT } } }),
  maxSortOrder: async (userId, boardId, stage) => (await prisma.deal.aggregate({ where: { userId, boardId, stage, archivedAt: null }, _max: { sortOrder: true } }))._max.sortOrder ?? 0,
  createDeal: (userId, boardId, f) => prisma.deal.create({ data: { userId, boardId, ...f }, select: { id: true } }),
  updateDeal: async (userId, id, data) => (await prisma.deal.updateMany({ where: { id, userId, archivedAt: null }, data })).count,
  setDealArchived: async (userId, id, at) => (await prisma.deal.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  setDealOrder: async (userId, id, orderId) => (await prisma.deal.updateMany({ where: { id, userId, archivedAt: null, stage: "WON", orderId: null }, data: { orderId } })).count,
};

// ── The view ────────────────────────────────────────────────────────────────

export function dealViewOf(r: DealListRow): DealView {
  return {
    id: r.id,
    boardId: r.boardId,
    title: r.title,
    valueCents: r.valueCents,
    stage: dealStageOf(r.stage) ?? "NEW",
    expectedCloseDay: r.expectedCloseDay ? keyOfDateColumn(r.expectedCloseDay) : null,
    note: r.note,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    order: r.order && !r.order.archivedAt ? { id: r.order.id, item: r.order.item } : null,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    customer: r.customer ? { id: r.customer.id, number: r.customer.number, name: r.customer.name, phone: r.customer.phone } : null,
  };
}

// ── The gates ───────────────────────────────────────────────────────────────

function tabGate(b: DealTabRow | null, userId: string): DealResult<DealTabRow> {
  if (!b || b.userId !== userId) return fail(WORK_BOARD_GONE);
  if (b.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  if (!b.crmOn) return fail(DEALS_CRM_OFF);
  return ok(b);
}

async function openTab(db: DealDb, userId: string, boardId: string): Promise<DealResult<DealTabRow>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  return tabGate(await db.board(userId, boardId), userId);
}

/** The deal is the user's, its tab gated, and (unless `archivedToo`) kept. */
async function openDeal(db: DealDb, userId: string, id: string, archivedToo = false): Promise<DealResult<DealWithBoard>> {
  if (!isRowId(id)) return fail(DEAL_GONE);
  const row = await db.deal(userId, id);
  if (!row || row.userId !== userId || row.board.id !== row.boardId) return fail(DEAL_GONE);
  const b = tabGate(row.board, userId);
  if (!b.ok) return fail(b.error);
  if (row.archivedAt && !archivedToo) return fail(DEAL_ARCHIVED);
  return ok(row);
}

/** The customer a deal links: none; the one already linked (kept, even archived since); or a kept one of THIS tab. */
async function customerGate(db: DealDb, userId: string, board: DealTabRow, customerId: string | null, prevId: string | null): Promise<DealResult<string | null>> {
  if (!customerId) return ok(null);
  if (customerId === prevId) return ok(customerId);
  const c = await db.customer(userId, customerId);
  if (!c || c.userId !== userId || c.boardId !== board.id) return fail(DEAL_CUSTOMER_GONE);
  if (c.archivedAt) return fail(DEAL_CUSTOMER_ARCHIVED);
  return ok(c.id);
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Adds a deal at the end of its column (New unless a stage is given; Won or Lost is stamped closed now). */
export async function createDealCore(userId: string, boardId: string, input: unknown, now: Date = new Date(), db: DealDb = prismaDealDb): Promise<DealResult<{ id: string }>> {
  const tab = await openTab(db, userId, boardId);
  if (!tab.ok) return fail(tab.error);
  const f = cleanDealInput(input);
  if (!f.ok) return fail(f.error);
  const customer = await customerGate(db, userId, tab.value, f.value.customerId ?? null, null);
  if (!customer.ok) return fail(customer.error);
  const stage = stagePatchOf({ stage: "NEW", closedAt: null }, f.value.stage, now);
  const sortOrder = (await db.maxSortOrder(userId, boardId, stage.stage)) + 1;
  const row = await db.createDeal(userId, boardId, {
    title: f.value.title,
    valueCents: f.value.valueCents,
    stage: stage.stage,
    expectedCloseDay: f.value.expectedCloseDay ? dateColumn(f.value.expectedCloseDay) : null,
    note: f.value.note,
    customerId: customer.value,
    closedAt: stage.closedAt,
    sortOrder,
  });
  return ok({ id: row.id });
}

/** Edits a kept deal: every field (a customer left out keeps the deal's own). A new stage moves it to that column's end. */
export async function editDealCore(userId: string, dealId: string, input: unknown, now: Date = new Date(), db: DealDb = prismaDealDb): Promise<DealResult<{ id: string }>> {
  const row = await openDeal(db, userId, dealId);
  if (!row.ok) return fail(row.error);
  const f = cleanDealInput(input);
  if (!f.ok) return fail(f.error);
  const wanted = f.value.customerId === undefined ? row.value.customerId : f.value.customerId;
  const customer = await customerGate(db, userId, row.value.board, wanted, row.value.customerId);
  if (!customer.ok) return fail(customer.error);
  const prevStage = dealStageOf(row.value.stage) ?? "NEW";
  const stage = stagePatchOf({ stage: prevStage, closedAt: row.value.closedAt }, f.value.stage, now);
  const data: Partial<DealFields & { sortOrder: number }> = {
    title: f.value.title,
    valueCents: f.value.valueCents,
    stage: stage.stage,
    expectedCloseDay: f.value.expectedCloseDay ? dateColumn(f.value.expectedCloseDay) : null,
    note: f.value.note,
    customerId: customer.value,
    closedAt: stage.closedAt,
  };
  if (stage.stage !== prevStage) data.sortOrder = (await db.maxSortOrder(userId, row.value.boardId, stage.stage)) + 1;
  if ((await db.updateDeal(userId, dealId, data)) === 0) return fail(DEAL_ARCHIVED);
  return ok({ id: dealId });
}

/** "Move to…": the deal goes to the end of that column; Won or Lost stamps closedAt now, back to New or Quoted clears it. */
export async function moveDealCore(userId: string, dealId: string, stageRaw: unknown, now: Date = new Date(), db: DealDb = prismaDealDb): Promise<DealResult<{ id: string; stage: DealStage; closedAt: string | null }>> {
  const row = await openDeal(db, userId, dealId);
  if (!row.ok) return fail(row.error);
  const next = dealStageOf(stageRaw);
  if (!next) return fail(DEAL_STAGE_BAD);
  const prevStage = dealStageOf(row.value.stage) ?? "NEW";
  const p = stagePatchOf({ stage: prevStage, closedAt: row.value.closedAt }, next, now);
  if (p.stage !== prevStage) {
    const sortOrder = (await db.maxSortOrder(userId, row.value.boardId, p.stage)) + 1;
    if ((await db.updateDeal(userId, dealId, { stage: p.stage, closedAt: p.closedAt, sortOrder })) === 0) return fail(DEAL_ARCHIVED);
  }
  return ok({ id: dealId, stage: p.stage, closedAt: p.closedAt ? p.closedAt.toISOString() : null });
}

/** Archives a deal (the page offers Undo). Again: ok. */
export async function archiveDealCore(userId: string, dealId: string, now: Date = new Date(), db: DealDb = prismaDealDb): Promise<DealResult<{ id: string }>> {
  const row = await openDeal(db, userId, dealId, true);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.setDealArchived(userId, dealId, now);
  return ok({ id: dealId });
}

export async function restoreDealCore(userId: string, dealId: string, db: DealDb = prismaDealDb): Promise<DealResult<{ id: string }>> {
  const row = await openDeal(db, userId, dealId, true);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.setDealArchived(userId, dealId, null);
  return ok({ id: dealId });
}

export interface OrderFromDealDeps {
  /** The order list's own add (work-orders-server addOrderCore): its gate holds the order list being on. */
  addOrder?: (userId: string, boardId: string, input: unknown, now: Date) => Promise<{ ok: true; value: { id: string } } | { ok: false; error: string }>;
}

/**
 * "Create order" on a Won deal with none yet: the order sheet's input (prefilled from the customer and the deal's
 * title: deals.ts orderPrefillOf) goes through the order list's own core, then the deal keeps the new order's id. The
 * two writes are not one transaction: the link is written only where the deal still has none (setDealOrder), so a
 * second tap that raced the first leaves the deal on its first order.
 */
export async function createOrderFromDealCore(
  userId: string,
  dealId: string,
  input: unknown,
  now: Date = new Date(),
  db: DealDb = prismaDealDb,
  deps: OrderFromDealDeps = {}
): Promise<DealResult<{ dealId: string; orderId: string }>> {
  const row = await openDeal(db, userId, dealId);
  if (!row.ok) return fail(row.error);
  if (row.value.stage !== "WON") return fail(DEAL_NOT_WON);
  if (row.value.orderId) return fail(DEAL_HAS_ORDER);
  const made = await (deps.addOrder ?? ((u, b, i, n) => addOrderCore(u, b, i, n)))(userId, row.value.boardId, input, now);
  if (!made.ok) return fail(made.error);
  await db.setDealOrder(userId, dealId, made.value.id);
  return ok({ dealId, orderId: made.value.id });
}

// ── Reads ──────────────────────────────────────────────────────────────────

export type DealsPageData =
  | { kind: "gone" }
  | { kind: "archived" | "off"; board: DealsBoardView }
  | { kind: "ok"; board: DealsBoardView; deals: DealView[]; today: DayKey };

const boardView = (b: DealTabRow): DealsBoardView => ({ id: b.id, name: b.name, ordersOn: b.ordersOn ?? false });

/** The Deals page, in one wave: the tab and its kept deals (pipelineOf sorts them into columns). */
export async function loadDealsPage(userId: string, boardId: string, now: Date = new Date(), db: DealDb = prismaDealDb): Promise<DealsPageData> {
  if (!isBoardId(boardId)) return { kind: "gone" };
  const [b, rows] = await Promise.all([db.board(userId, boardId), db.deals(userId, boardId)]);
  if (!b || b.userId !== userId) return { kind: "gone" };
  if (b.archivedAt) return { kind: "archived", board: boardView(b) };
  if (!b.crmOn) return { kind: "off", board: boardView(b) };
  const views = rows.filter((r) => !r.archivedAt && r.boardId === boardId).map(dealViewOf);
  const columns = pipelineOf(views);
  return { kind: "ok", board: boardView(b), deals: [...columns.NEW, ...columns.QUOTED, ...columns.WON, ...columns.LOST], today: todayKey(now) };
}

/**
 * A customer's deals (their Deals tab, their Overview's open value): the open ones first (the pipeline's order), then
 * Won and Lost, the newest closed first. Null where the tab is not the user's, is archived, or keeps no customer list.
 */
export async function loadCustomerDeals(userId: string, boardId: string, customerId: string, db: DealDb = prismaDealDb): Promise<DealView[] | null> {
  if (!isBoardId(boardId) || !isRowId(customerId)) return null;
  const [b, rows] = await Promise.all([db.board(userId, boardId), db.customerDeals(userId, customerId)]);
  if (!tabGate(b, userId).ok) return null;
  const views = rows.filter((r) => !r.archivedAt && r.boardId === boardId && r.customerId === customerId).map(dealViewOf);
  const col = pipelineOf(views);
  const closed = [...col.WON, ...col.LOST].sort((a, c) => Date.parse(c.closedAt ?? c.createdAt) - Date.parse(a.closedAt ?? a.createdAt));
  return [...col.NEW, ...col.QUOTED, ...closed];
}
