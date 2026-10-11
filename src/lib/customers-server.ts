/**
 * Customers on the server (2026-10-12; the rules are customers.ts). Every
 * write checks, in this order, that the work tab is the user's (else
 * WORK_BOARD_GONE), open (WORK_BOARD_ARCHIVED) and keeps a customer list
 * (CRM_OFF), and, for a customer's own rows, that the customer is kept
 * (CUSTOMER_ARCHIVED). One read gates a write (the row with its customer and
 * tab joined), then one write.
 *
 *   setCrmCore(userId, boardId, on)                 the tab's list on or off (off hides; nothing is deleted)
 *   createCustomerCore / editCustomerCore           an ID taken on the tab (ignoring case) is refused:
 *                                                   the partial unique index's P2002 → CUSTOMER_NUMBER_TAKEN
 *   archiveCustomerCore / restoreCustomerCore       archived customers leave the search; restoring
 *                                                   needs their ID free again
 *   addInteractionCore / editInteractionCore / archiveInteractionCore / restoreInteractionCore
 *   addTaskCore / editTaskCore / setTaskDoneCore / archiveTaskCore / restoreTaskCore
 *                                                   a moved time or a reminder switched back on clears
 *                                                   remindSentAt (customers.ts remindSentAtAfterEdit)
 *   loadCustomersPage / loadCustomerPage / customerDueCountCore   the pages' and the tab card's reads
 *
 * Work, never the game: nothing here writes the ledger (ActivityEvent), pays
 * XP, touches the streak or clears a game cache. Every core takes a
 * CustomerDb, so scripts/customers-check.ts runs them against an in-memory
 * one that keeps the same unique index.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, isBoardId } from "./work-boards";
import {
  CRM_OFF,
  CUSTOMER_ARCHIVED,
  CUSTOMER_GONE,
  CUSTOMER_NUMBER_TAKEN,
  CUSTOMER_RESTORE_TAKEN,
  CUSTOMER_TASK_GONE,
  INTERACTION_GONE,
  cleanAction,
  cleanBrief,
  cleanCustomerName,
  cleanCustomerNumber,
  cleanNickname,
  cleanPhone,
  cleanTaskDetail,
  cleanTaskTitle,
  cleanWhen,
  compareNumbers,
  dueCountOf,
  endOfLocalDay,
  idsNumeric,
  isCustomerAction,
  isRowId,
  nextCustomerNumber,
  armedRemindSentAt,
  remindSentAtAfterEdit,
  remindSentAtAfterUndo,
  taskStateOf,
  type ArchivedCustomerItem,
  type CrmBoardView,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerTaskView,
  type DueCount,
  type InteractionView,
  type LinkedCallBackView,
} from "./customers";

export type CustomerResult<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): CustomerResult<T> => ({ ok: true, value });
const fail = <T>(error: string): CustomerResult<T> => ({ ok: false, error });

// ── Rows and the db the cores use ──────────────────────────────────────────

export interface CrmBoardRow {
  id: string;
  userId: string;
  name: string;
  archivedAt: Date | null;
  crmOn: boolean;
}

export interface CustomerRow {
  id: string;
  userId: string;
  boardId: string;
  number: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  archivedAt: Date | null;
}

export interface InteractionRow {
  id: string;
  userId: string;
  customerId: string;
  at: Date;
  action: string;
  brief: string;
  archivedAt: Date | null;
}

export interface CustomerTaskRow {
  id: string;
  userId: string;
  customerId: string;
  dueAt: Date;
  title: string;
  detail: string | null;
  remind: boolean;
  doneAt: Date | null;
  remindSentAt: Date | null;
  archivedAt: Date | null;
}

export interface LinkedCallBackRow {
  id: string;
  at: Date;
  action: string;
  tags: string[];
  remindAt: Date | null;
}

export type CustomerWithBoard = CustomerRow & { board: CrmBoardRow };

export interface CustomerFields {
  number: string;
  name: string;
  nickname: string | null;
  phone: string | null;
}

export interface InteractionFields {
  at: Date;
  action: string;
  brief: string;
}

export interface TaskFields {
  dueAt: Date;
  title: string;
  detail: string | null;
  remind: boolean;
}

/** The reads and writes the cores make: Prisma in the app, an in-memory store in the checks. */
export interface CustomerDb {
  board(userId: string, boardId: string): Promise<CrmBoardRow | null>;
  /** Sets crmOn on an open tab; the number of rows changed. */
  setCrm(userId: string, boardId: string, on: boolean): Promise<number>;
  /** A tab's customers: the open ones (archived false) or the archived ones. */
  customers(userId: string, boardId: string, archived: boolean): Promise<CustomerRow[]>;
  /** One customer, open or archived, with its tab. */
  customer(userId: string, id: string): Promise<CustomerWithBoard | null>;
  /** Throws a P2002 when an open customer on the tab has the same ID ignoring case. */
  createCustomer(userId: string, boardId: string, f: CustomerFields): Promise<CustomerRow>;
  /** An open customer only; the number of rows changed. Throws a P2002 like createCustomer. */
  updateCustomer(userId: string, id: string, f: CustomerFields): Promise<number>;
  /** Archives (at) an open customer or restores (null) an archived one; rows changed. A restore can throw a P2002. */
  setCustomerArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** A customer's kept log entries (any order). */
  interactions(userId: string, customerId: string): Promise<InteractionRow[]>;
  interaction(userId: string, id: string): Promise<(InteractionRow & { customer: CustomerWithBoard }) | null>;
  createInteraction(userId: string, customerId: string, f: InteractionFields): Promise<InteractionRow>;
  /** A kept entry only; rows changed. */
  updateInteraction(userId: string, id: string, f: InteractionFields): Promise<number>;
  setInteractionArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** A customer's kept tasks, done or not (any order). */
  tasks(userId: string, customerId: string): Promise<CustomerTaskRow[]>;
  task(userId: string, id: string): Promise<(CustomerTaskRow & { customer: CustomerWithBoard }) | null>;
  createTask(userId: string, customerId: string, f: TaskFields & { remindSentAt: Date | null }): Promise<CustomerTaskRow>;
  /** A kept task only; rows changed. */
  updateTask(userId: string, id: string, f: Partial<TaskFields & { doneAt: Date | null; remindSentAt: Date | null }>): Promise<number>;
  setTaskArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** The open (not done, kept) tasks of the tab's kept customers due before `before`. */
  dueTasks(userId: string, boardId: string, before: Date): Promise<{ customerId: string; dueAt: Date }[]>;
  /** The call back cards linked to this customer (read-only). */
  callBacks(userId: string, customerId: string): Promise<LinkedCallBackRow[]>;
}

const BOARD_SELECT = { id: true, userId: true, name: true, archivedAt: true, crmOn: true } as const;
const CUSTOMER_SELECT = { id: true, userId: true, boardId: true, number: true, name: true, nickname: true, phone: true, archivedAt: true } as const;
const CUSTOMER_WITH_BOARD = { ...CUSTOMER_SELECT, board: { select: BOARD_SELECT } } as const;
const INTERACTION_SELECT = { id: true, userId: true, customerId: true, at: true, action: true, brief: true, archivedAt: true } as const;
const TASK_SELECT = { id: true, userId: true, customerId: true, dueAt: true, title: true, detail: true, remind: true, doneAt: true, remindSentAt: true, archivedAt: true } as const;
const OPEN_CUSTOMERS_MAX = 5000;
const ARCHIVED_CUSTOMERS_MAX = 50;
const INTERACTIONS_MAX = 200;
const TASKS_MAX = 300;
const CALL_BACKS_MAX = 50;

/** The app's CustomerDb. */
export const prismaCustomerDb: CustomerDb = {
  board: (userId, boardId) => prisma.workBoard.findFirst({ where: { id: boardId, userId }, select: BOARD_SELECT }),
  setCrm: async (userId, boardId, on) => (await prisma.workBoard.updateMany({ where: { id: boardId, userId, archivedAt: null }, data: { crmOn: on } })).count,
  customers: (userId, boardId, archived) =>
    prisma.customer.findMany({
      where: { userId, boardId, archivedAt: archived ? { not: null } : null },
      select: CUSTOMER_SELECT,
      orderBy: archived ? { archivedAt: "desc" } : { createdAt: "asc" },
      take: archived ? ARCHIVED_CUSTOMERS_MAX : OPEN_CUSTOMERS_MAX,
    }),
  customer: (userId, id) => prisma.customer.findFirst({ where: { id, userId }, select: CUSTOMER_WITH_BOARD }),
  createCustomer: (userId, boardId, f) => prisma.customer.create({ data: { userId, boardId, ...f }, select: CUSTOMER_SELECT }),
  updateCustomer: async (userId, id, f) => (await prisma.customer.updateMany({ where: { id, userId, archivedAt: null }, data: f })).count,
  setCustomerArchived: async (userId, id, at) =>
    (await prisma.customer.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  interactions: (userId, customerId) =>
    prisma.customerInteraction.findMany({ where: { userId, customerId, archivedAt: null }, select: INTERACTION_SELECT, orderBy: [{ at: "desc" }, { createdAt: "desc" }], take: INTERACTIONS_MAX }),
  interaction: (userId, id) => prisma.customerInteraction.findFirst({ where: { id, userId }, select: { ...INTERACTION_SELECT, customer: { select: CUSTOMER_WITH_BOARD } } }),
  createInteraction: (userId, customerId, f) => prisma.customerInteraction.create({ data: { userId, customerId, ...f }, select: INTERACTION_SELECT }),
  updateInteraction: async (userId, id, f) => (await prisma.customerInteraction.updateMany({ where: { id, userId, archivedAt: null }, data: f })).count,
  setInteractionArchived: async (userId, id, at) =>
    (await prisma.customerInteraction.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  tasks: (userId, customerId) => prisma.customerTask.findMany({ where: { userId, customerId, archivedAt: null }, select: TASK_SELECT, orderBy: { dueAt: "asc" }, take: TASKS_MAX }),
  task: (userId, id) => prisma.customerTask.findFirst({ where: { id, userId }, select: { ...TASK_SELECT, customer: { select: CUSTOMER_WITH_BOARD } } }),
  createTask: (userId, customerId, f) => prisma.customerTask.create({ data: { userId, customerId, ...f }, select: TASK_SELECT }),
  updateTask: async (userId, id, f) => (await prisma.customerTask.updateMany({ where: { id, userId, archivedAt: null }, data: f })).count,
  setTaskArchived: async (userId, id, at) =>
    (await prisma.customerTask.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  dueTasks: (userId, boardId, before) =>
    prisma.customerTask.findMany({
      where: { userId, doneAt: null, archivedAt: null, dueAt: { lt: before }, customer: { boardId, archivedAt: null } },
      select: { customerId: true, dueAt: true },
    }),
  callBacks: (userId, customerId) =>
    prisma.callBack.findMany({ where: { userId, customerId, archivedAt: null }, select: { id: true, at: true, action: true, tags: true, remindAt: true }, orderBy: { at: "desc" }, take: CALL_BACKS_MAX }),
};

/** A unique violation: here, the partial index on a tab's open IDs (Customer_boardId_number_open_key). */
export function isNumberTaken(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code === "P2002";
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  if (code === "P2002" || code === "23505") return true;
  const message = err instanceof Error ? err.message : "";
  return /Customer_boardId_number_open_key|unique constraint/i.test(message);
}

// ── The gates ──────────────────────────────────────────────────────────────

/** The tab is the user's, open, and keeps a customer list. */
function boardGate(board: CrmBoardRow | null, userId: string): CustomerResult<CrmBoardRow> {
  if (!board || board.userId !== userId) return fail(WORK_BOARD_GONE);
  if (board.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  if (!board.crmOn) return fail(CRM_OFF);
  return ok(board);
}

async function openBoard(db: CustomerDb, userId: string, boardId: string): Promise<CustomerResult<CrmBoardRow>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  return boardGate(await db.board(userId, boardId), userId);
}

/** The customer is the user's, on a gated tab, and (unless `archivedToo`) kept. */
function customerGate(c: CustomerWithBoard | null, userId: string, archivedToo = false): CustomerResult<CustomerWithBoard> {
  if (!c || c.userId !== userId) return fail(CUSTOMER_GONE);
  const b = boardGate(c.board, userId);
  if (!b.ok) return fail(b.error);
  if (c.archivedAt && !archivedToo) return fail(CUSTOMER_ARCHIVED);
  return ok(c);
}

async function openCustomer(db: CustomerDb, userId: string, customerId: string, archivedToo = false): Promise<CustomerResult<CustomerWithBoard>> {
  if (!isRowId(customerId)) return fail(CUSTOMER_GONE);
  return customerGate(await db.customer(userId, customerId), userId, archivedToo);
}

async function openInteraction(db: CustomerDb, userId: string, id: string): Promise<CustomerResult<InteractionRow & { customer: CustomerWithBoard }>> {
  if (!isRowId(id)) return fail(INTERACTION_GONE);
  const row = await db.interaction(userId, id);
  if (!row || row.userId !== userId) return fail(INTERACTION_GONE);
  const c = customerGate(row.customer, userId);
  return c.ok ? ok(row) : fail(c.error);
}

async function openTask(db: CustomerDb, userId: string, id: string): Promise<CustomerResult<CustomerTaskRow & { customer: CustomerWithBoard }>> {
  if (!isRowId(id)) return fail(CUSTOMER_TASK_GONE);
  const row = await db.task(userId, id);
  if (!row || row.userId !== userId) return fail(CUSTOMER_TASK_GONE);
  const c = customerGate(row.customer, userId);
  return c.ok ? ok(row) : fail(c.error);
}

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface CustomerInput {
  number: string;
  name: string;
  nickname?: string | null;
  phone?: string | null;
}

export interface InteractionInput {
  /** An ISO instant. */
  at: string;
  action: string;
  brief?: string | null;
}

export interface TaskInput {
  /** An ISO instant. */
  dueAt: string;
  title: string;
  detail?: string | null;
  /** One push at dueAt (default on). */
  remind?: boolean;
}

function customerFieldsOf(input: unknown): CustomerResult<CustomerFields> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const number = cleanCustomerNumber(i.number);
  if (!number.ok) return fail(number.error);
  const name = cleanCustomerName(i.name);
  if (!name.ok) return fail(name.error);
  const nickname = cleanNickname(i.nickname);
  if (!nickname.ok) return fail(nickname.error);
  const phone = cleanPhone(i.phone);
  if (!phone.ok) return fail(phone.error);
  return ok({ number: number.value, name: name.value, nickname: nickname.value, phone: phone.value });
}

function interactionFieldsOf(input: unknown): CustomerResult<InteractionFields> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const at = cleanWhen(i.at);
  if (!at.ok) return fail(at.error);
  const action = cleanAction(i.action);
  if (!action.ok) return fail(action.error);
  const brief = cleanBrief(i.brief);
  if (!brief.ok) return fail(brief.error);
  return ok({ at: at.value, action: action.value, brief: brief.value });
}

function taskFieldsOf(input: unknown): CustomerResult<TaskFields> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const dueAt = cleanWhen(i.dueAt);
  if (!dueAt.ok) return fail(dueAt.error);
  const title = cleanTaskTitle(i.title);
  if (!title.ok) return fail(title.error);
  const detail = cleanTaskDetail(i.detail);
  if (!detail.ok) return fail(detail.error);
  return ok({ dueAt: dueAt.value, title: title.value, detail: detail.value, remind: i.remind !== false });
}

// ── The tab's switch ───────────────────────────────────────────────────────

/** Switches the tab's customer list on or off. Off hides it (the tab card, the pages); every row is kept. */
export async function setCrmCore(userId: string, boardId: string, on: boolean, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ crmOn: boolean }>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  const board = await db.board(userId, boardId);
  if (!board || board.userId !== userId) return fail(WORK_BOARD_GONE);
  if (board.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  const want = on === true;
  if (board.crmOn !== want && (await db.setCrm(userId, boardId, want)) === 0) return fail(WORK_BOARD_ARCHIVED);
  return ok({ crmOn: want });
}

// ── Customers ──────────────────────────────────────────────────────────────

/** Adds a customer to the tab. An ID already used on it (ignoring case) is refused. */
export async function createCustomerCore(userId: string, boardId: string, input: unknown, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string; number: string }>> {
  const board = await openBoard(db, userId, boardId);
  if (!board.ok) return fail(board.error);
  const f = customerFieldsOf(input);
  if (!f.ok) return fail(f.error);
  try {
    const row = await db.createCustomer(userId, boardId, f.value);
    return ok({ id: row.id, number: row.number });
  } catch (err) {
    if (isNumberTaken(err)) return fail(CUSTOMER_NUMBER_TAKEN);
    throw err;
  }
}

/** Edits a kept customer: ID, name, nickname, phone. Their own ID in another case is fine; another customer's is refused. */
export async function editCustomerCore(userId: string, customerId: string, input: unknown, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = customerFieldsOf(input);
  if (!f.ok) return fail(f.error);
  try {
    const changed = await db.updateCustomer(userId, customerId, f.value);
    if (changed === 0) return fail(CUSTOMER_ARCHIVED);
    return ok({ id: customerId });
  } catch (err) {
    if (isNumberTaken(err)) return fail(CUSTOMER_NUMBER_TAKEN);
    throw err;
  }
}

/** Archives a customer: out of the search and the due counts, their ID free for another; everything kept. Again: ok. */
export async function archiveCustomerCore(userId: string, customerId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId, true);
  if (!c.ok) return fail(c.error);
  if (!c.value.archivedAt) await db.setCustomerArchived(userId, customerId, now);
  return ok({ id: customerId });
}

/** Restores an archived customer, while their ID is free on the tab (CUSTOMER_RESTORE_TAKEN otherwise). Kept: ok. */
export async function restoreCustomerCore(userId: string, customerId: string, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId, true);
  if (!c.ok) return fail(c.error);
  if (!c.value.archivedAt) return ok({ id: customerId });
  try {
    await db.setCustomerArchived(userId, customerId, null);
    return ok({ id: customerId });
  } catch (err) {
    if (isNumberTaken(err)) return fail(CUSTOMER_RESTORE_TAKEN);
    throw err;
  }
}

// ── Interactions ───────────────────────────────────────────────────────────

/** Logs an interaction: when, what happened (one of the four), and a brief. */
export async function addInteractionCore(userId: string, customerId: string, input: unknown, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = interactionFieldsOf(input);
  if (!f.ok) return fail(f.error);
  const row = await db.createInteraction(userId, customerId, f.value);
  return ok({ id: row.id });
}

export async function editInteractionCore(userId: string, interactionId: string, input: unknown, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInteraction(db, userId, interactionId);
  if (!row.ok) return fail(row.error);
  const f = interactionFieldsOf(input);
  if (!f.ok) return fail(f.error);
  if ((await db.updateInteraction(userId, interactionId, f.value)) === 0) return fail(INTERACTION_GONE);
  return ok({ id: interactionId });
}

/** Archives a log entry (the page offers Undo: restoreInteractionCore). Again: ok. */
export async function archiveInteractionCore(userId: string, interactionId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInteraction(db, userId, interactionId);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.setInteractionArchived(userId, interactionId, now);
  return ok({ id: interactionId });
}

export async function restoreInteractionCore(userId: string, interactionId: string, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInteraction(db, userId, interactionId);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.setInteractionArchived(userId, interactionId, null);
  return ok({ id: interactionId });
}

// ── Scheduled tasks ────────────────────────────────────────────────────────

/** Schedules a task. Its one reminder is armed for its time (a time already gone by is not pushed). */
export async function addTaskCore(userId: string, customerId: string, input: unknown, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = taskFieldsOf(input);
  if (!f.ok) return fail(f.error);
  const row = await db.createTask(userId, customerId, { ...f.value, remindSentAt: armedRemindSentAt(f.value.dueAt, now) });
  return ok({ id: row.id });
}

/** Edits a task. A moved time, or the reminder switched back on, re-arms it (remindSentAt cleared). */
export async function editTaskCore(userId: string, taskId: string, input: unknown, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openTask(db, userId, taskId);
  if (!row.ok) return fail(row.error);
  const f = taskFieldsOf(input);
  if (!f.ok) return fail(f.error);
  const remindSentAt = remindSentAtAfterEdit(row.value, f.value, now);
  if ((await db.updateTask(userId, taskId, { ...f.value, remindSentAt })) === 0) return fail(CUSTOMER_TASK_GONE);
  return ok({ id: taskId });
}

/** Marks a task done (a done task is never reminded) or open again (its reminder kept, never pushed late). */
export async function setTaskDoneCore(userId: string, taskId: string, done: boolean, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string; done: boolean }>> {
  const row = await openTask(db, userId, taskId);
  if (!row.ok) return fail(row.error);
  const want = done === true;
  if (want && !row.value.doneAt) await db.updateTask(userId, taskId, { doneAt: now });
  else if (!want && row.value.doneAt) await db.updateTask(userId, taskId, { doneAt: null, remindSentAt: remindSentAtAfterUndo(row.value, now) });
  return ok({ id: taskId, done: want });
}

/** Archives a task (the page offers Undo). An archived task is never reminded. Again: ok. */
export async function archiveTaskCore(userId: string, taskId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openTask(db, userId, taskId);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.setTaskArchived(userId, taskId, now);
  return ok({ id: taskId });
}

/** Undoes an archive. A reminder whose time went by meanwhile is not pushed late. */
export async function restoreTaskCore(userId: string, taskId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openTask(db, userId, taskId);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) {
    await db.setTaskArchived(userId, taskId, null);
    if (!row.value.doneAt && !row.value.remindSentAt) {
      const spent = armedRemindSentAt(row.value.dueAt, now);
      if (spent) await db.updateTask(userId, taskId, { remindSentAt: spent });
    }
  }
  return ok({ id: taskId });
}

// ── Reads ──────────────────────────────────────────────────────────────────

const boardView = (b: CrmBoardRow): CrmBoardView => ({ id: b.id, name: b.name });

export type CustomersPageData =
  | { kind: "gone" }
  | { kind: "archived" | "off"; board: CrmBoardView }
  | { kind: "ok"; board: CrmBoardView; customers: CustomerListItem[]; archived: ArchivedCustomerItem[]; numeric: boolean; suggestion: string | null };

/**
 * The customer list page, in one wave: the tab, its kept customers, its
 * archived ones and the tasks due by tonight. Customers by ID (natural order).
 */
export async function loadCustomersPage(userId: string, boardId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomersPageData> {
  if (!isBoardId(boardId)) return { kind: "gone" };
  const [board, open, archived, due] = await Promise.all([
    db.board(userId, boardId),
    db.customers(userId, boardId, false),
    db.customers(userId, boardId, true),
    db.dueTasks(userId, boardId, endOfLocalDay(now)),
  ]);
  if (!board || board.userId !== userId) return { kind: "gone" };
  if (board.archivedAt) return { kind: "archived", board: boardView(board) };
  if (!board.crmOn) return { kind: "off", board: boardView(board) };
  const byCustomer = new Map<string, Date[]>();
  for (const t of due) byCustomer.set(t.customerId, [...(byCustomer.get(t.customerId) ?? []), t.dueAt]);
  const customers = open
    .filter((c) => !c.archivedAt)
    .map((c): CustomerListItem => ({ id: c.id, number: c.number, name: c.name, nickname: c.nickname, phone: c.phone, ...dueCountOf(byCustomer.get(c.id) ?? [], now) }))
    .sort((a, b) => compareNumbers(a.number, b.number));
  const numbers = customers.map((c) => c.number);
  return {
    kind: "ok",
    board: boardView(board),
    customers,
    archived: archived.filter((c) => c.archivedAt).map((c) => ({ id: c.id, number: c.number, name: c.name, archivedAt: (c.archivedAt as Date).toISOString() })),
    numeric: idsNumeric(numbers),
    suggestion: nextCustomerNumber(numbers),
  };
}

export type CustomerPageData =
  | { kind: "gone" }
  | { kind: "archived" | "off"; board: CrmBoardView }
  | { kind: "ok"; board: CrmBoardView; customer: CustomerDetail; tasks: CustomerTaskView[]; interactions: InteractionView[]; callBacks: LinkedCallBackView[] };

/**
 * One customer's page, in one wave: the customer with their tab, their tasks
 * (open soonest first, then done), their log (newest first) and the call
 * backs linked to them. A customer on another tab (or another user's) is gone.
 */
export async function loadCustomerPage(userId: string, boardId: string, customerId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerPageData> {
  if (!isBoardId(boardId) || !isRowId(customerId)) return { kind: "gone" };
  const [c, tasks, interactions, callBacks] = await Promise.all([db.customer(userId, customerId), db.tasks(userId, customerId), db.interactions(userId, customerId), db.callBacks(userId, customerId)]);
  if (!c || c.userId !== userId || c.boardId !== boardId || c.board.userId !== userId) return { kind: "gone" };
  if (c.board.archivedAt) return { kind: "archived", board: boardView(c.board) };
  if (!c.board.crmOn) return { kind: "off", board: boardView(c.board) };
  const kept = tasks.filter((t) => !t.archivedAt);
  const open = kept.filter((t) => !t.doneAt).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || (a.id < b.id ? -1 : 1));
  const done = kept.filter((t) => t.doneAt).sort((a, b) => (b.doneAt as Date).getTime() - (a.doneAt as Date).getTime());
  return {
    kind: "ok",
    board: boardView(c.board),
    customer: { id: c.id, number: c.number, name: c.name, nickname: c.nickname, phone: c.phone, archived: c.archivedAt != null },
    tasks: [...open, ...done].map((t) => ({
      id: t.id,
      dueAt: t.dueAt.toISOString(),
      title: t.title,
      detail: t.detail,
      remind: t.remind,
      doneAt: t.doneAt ? t.doneAt.toISOString() : null,
      state: taskStateOf(t, now),
    })),
    interactions: interactions
      .filter((i) => !i.archivedAt)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .flatMap((i): InteractionView[] => (isCustomerAction(i.action) ? [{ id: i.id, at: i.at.toISOString(), action: i.action, brief: i.brief }] : [])),
    callBacks: callBacks.map((cb) => ({ id: cb.id, at: cb.at.toISOString(), action: cb.action, tags: cb.tags, remindAt: cb.remindAt ? cb.remindAt.toISOString() : null })),
  };
}

/** The work tab card's count: open tasks due by tonight on the tab's kept customers, and the overdue ones. Off: none. */
export async function customerDueCountCore(userId: string, boardId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<DueCount>> {
  const board = await openBoard(db, userId, boardId);
  if (!board.ok) return fail(board.error);
  const due = await db.dueTasks(userId, boardId, endOfLocalDay(now));
  return ok(dueCountOf(due.map((t) => t.dueAt), now));
}
