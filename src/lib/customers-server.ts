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
 *   addInfoCore / editInfoCore / archiveInfoCore / restoreInfoCore
 *                                                   an info: a detail and when it was recorded (now by
 *                                                   default; never more than a minute ahead)
 *   addInteractionCore / editInteractionCore / archiveInteractionCore / restoreInteractionCore
 *   loadCustomersPage / loadCustomerPage / customerDueCountCore   the pages' reads
 *   customerFieldsOf(input, prev?)                  a customer's fields (Phase 2, 2026-10-20: a status, tags, an
 *                                                   email, a company, an address, crm.ts; each left out of an edit
 *                                                   keeps its own, and starts at its default on an add)
 *
 * A customer's tasks are scheduled tasks (2026-10-20; scheduled-tasks-server.ts owns their writes): the list's
 * "due today" chips count them, and the customer page lists them (customer tasks, CustomerTask, are read only by the
 * backfill now). Customer and log writes clear the 'work' cache (the Office workspace's search index: names, IDs,
 * the latest activity; and, since Phase 2, the follow-ups' facts: every log write moves a last contact) and archiving
 * or restoring a customer the 'life' one too (the bell holds their tasks with them).
 *
 * Work, never the game: nothing here writes the ledger (ActivityEvent), pays
 * XP, touches the streak or clears a game cache. Every core takes a
 * CustomerDb, so scripts/customers-check.ts runs them against an in-memory
 * one that keeps the same unique index.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, isBoardId } from "./work-boards";
import { loadCustomerScheduled } from "./scheduled-tasks-server";
import type { ScheduledView } from "./scheduled-tasks";
import { cleanAddress, cleanCompany, cleanEmail, cleanStatus, cleanTags, readStatus, type CustomerStatus } from "./crm";
import {
  CRM_OFF,
  CUSTOMER_ARCHIVED,
  CUSTOMER_GONE,
  CUSTOMER_INFO_GONE,
  CUSTOMER_NUMBER_TAKEN,
  CUSTOMER_RESTORE_TAKEN,
  INTERACTION_GONE,
  cleanAction,
  cleanBrief,
  cleanCustomerName,
  cleanCustomerNumber,
  cleanInfoDetail,
  cleanNickname,
  cleanPhone,
  cleanRecordedAt,
  cleanWhen,
  compareNumbers,
  dueCountOf,
  endOfLocalDay,
  idsNumeric,
  infoFirstLine,
  isCustomerAction,
  isRowId,
  nextCustomerNumber,
  sortInfos,
  type ArchivedCustomerItem,
  type CrmBoardView,
  type CustomerDetail,
  type CustomerInfoView,
  type CustomerListItem,
  type DueCount,
  type InteractionView,
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
  /** Phase 2 (migration 20261228000000_crm). Absent in the checks' tables: CUSTOMER, no tags, none. */
  status?: string;
  tags?: string[];
  email?: string | null;
  company?: string | null;
  address?: string | null;
}

export interface CustomerInfoRow {
  id: string;
  userId: string;
  customerId: string;
  detail: string;
  recordedAt: Date;
  archivedAt: Date | null;
  createdAt: Date;
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

export type CustomerWithBoard = CustomerRow & { board: CrmBoardRow };

export interface CustomerFields {
  number: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  status: CustomerStatus;
  tags: string[];
  email: string | null;
  company: string | null;
  address: string | null;
}

export interface InfoFields {
  detail: string;
  recordedAt: Date;
}

export interface InteractionFields {
  at: Date;
  action: string;
  brief: string;
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
  /** A customer's kept infos (any order). */
  infos(userId: string, customerId: string): Promise<CustomerInfoRow[]>;
  info(userId: string, id: string): Promise<(CustomerInfoRow & { customer: CustomerWithBoard }) | null>;
  createInfo(userId: string, customerId: string, f: InfoFields): Promise<CustomerInfoRow>;
  /** A kept info only; rows changed. */
  updateInfo(userId: string, id: string, f: InfoFields): Promise<number>;
  setInfoArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** The newest kept info of each of the tab's kept customers: its first 160 characters (the list's subtitle). */
  latestInfos(userId: string, boardId: string): Promise<{ customerId: string; detail: string }[]>;
  /** A customer's kept log entries (any order). */
  interactions(userId: string, customerId: string): Promise<InteractionRow[]>;
  interaction(userId: string, id: string): Promise<(InteractionRow & { customer: CustomerWithBoard }) | null>;
  createInteraction(userId: string, customerId: string, f: InteractionFields): Promise<InteractionRow>;
  /** A kept entry only; rows changed. */
  updateInteraction(userId: string, id: string, f: InteractionFields): Promise<number>;
  setInteractionArchived(userId: string, id: string, at: Date | null): Promise<number>;
  /** The open (not done, not archived) scheduled tasks of the tab's kept customers due before `before`. */
  dueTasks(userId: string, boardId: string, before: Date): Promise<{ customerId: string; dueAt: Date }[]>;
  /** Each kept customer's latest activity on the tab (their last change, their newest log entry), ms. */
  activity(userId: string, boardId: string): Promise<{ customerId: string; at: number }[]>;
  /** A customer's scheduled tasks (scheduled-tasks-server loadCustomerScheduled in the app). */
  scheduled(userId: string, customerId: string): Promise<ScheduledView[]>;
}

const BOARD_SELECT = { id: true, userId: true, name: true, archivedAt: true, crmOn: true } as const;
const CUSTOMER_SELECT = { id: true, userId: true, boardId: true, number: true, name: true, nickname: true, phone: true, archivedAt: true, status: true, tags: true, email: true, company: true, address: true } as const;
const CUSTOMER_WITH_BOARD = { ...CUSTOMER_SELECT, board: { select: BOARD_SELECT } } as const;
const INFO_SELECT = { id: true, userId: true, customerId: true, detail: true, recordedAt: true, archivedAt: true, createdAt: true } as const;
const INTERACTION_SELECT = { id: true, userId: true, customerId: true, at: true, action: true, brief: true, archivedAt: true } as const;
const OPEN_CUSTOMERS_MAX = 5000;
const ARCHIVED_CUSTOMERS_MAX = 50;
const INFOS_MAX = 200;
const INTERACTIONS_MAX = 200;

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
  infos: (userId, customerId) =>
    prisma.customerInfo.findMany({ where: { userId, customerId, archivedAt: null }, select: INFO_SELECT, orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }], take: INFOS_MAX }),
  info: (userId, id) => prisma.customerInfo.findFirst({ where: { id, userId }, select: { ...INFO_SELECT, customer: { select: CUSTOMER_WITH_BOARD } } }),
  createInfo: (userId, customerId, f) => prisma.customerInfo.create({ data: { userId, customerId, ...f }, select: INFO_SELECT }),
  updateInfo: async (userId, id, f) => (await prisma.customerInfo.updateMany({ where: { id, userId, archivedAt: null }, data: f })).count,
  setInfoArchived: async (userId, id, at) =>
    (await prisma.customerInfo.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  // One row per customer (Postgres DISTINCT ON, over the (customerId, recordedAt) index), 160 characters at most.
  latestInfos: (userId, boardId) => prisma.$queryRaw<{ customerId: string; detail: string }[]>`
    SELECT DISTINCT ON (i."customerId") i."customerId" AS "customerId", left(i."detail", 160) AS "detail"
    FROM "CustomerInfo" i JOIN "Customer" c ON c."id" = i."customerId"
    WHERE i."userId" = ${userId} AND i."archivedAt" IS NULL AND c."boardId" = ${boardId} AND c."archivedAt" IS NULL
    ORDER BY i."customerId", i."recordedAt" DESC, i."createdAt" DESC`,
  interactions: (userId, customerId) =>
    prisma.customerInteraction.findMany({ where: { userId, customerId, archivedAt: null }, select: INTERACTION_SELECT, orderBy: [{ at: "desc" }, { createdAt: "desc" }], take: INTERACTIONS_MAX }),
  interaction: (userId, id) => prisma.customerInteraction.findFirst({ where: { id, userId }, select: { ...INTERACTION_SELECT, customer: { select: CUSTOMER_WITH_BOARD } } }),
  createInteraction: (userId, customerId, f) => prisma.customerInteraction.create({ data: { userId, customerId, ...f }, select: INTERACTION_SELECT }),
  updateInteraction: async (userId, id, f) => (await prisma.customerInteraction.updateMany({ where: { id, userId, archivedAt: null }, data: f })).count,
  setInteractionArchived: async (userId, id, at) =>
    (await prisma.customerInteraction.updateMany({ where: { id, userId, archivedAt: at ? null : { not: null } }, data: { archivedAt: at } })).count,
  dueTasks: (userId, boardId, before) =>
    prisma.scheduledTask.findMany({
      where: { userId, boardId, doneAt: null, archivedAt: null, dueAt: { lt: before }, customer: { is: { archivedAt: null } } },
      select: { customerId: true, dueAt: true },
    }) as Promise<{ customerId: string; dueAt: Date }[]>,
  activity: async (userId, boardId) => {
    const [customers, latest] = await Promise.all([
      prisma.customer.findMany({ where: { userId, boardId, archivedAt: null }, select: { id: true, updatedAt: true }, take: OPEN_CUSTOMERS_MAX }),
      prisma.customerInteraction.groupBy({ by: ["customerId"], where: { userId, archivedAt: null, customer: { is: { boardId, archivedAt: null } } }, _max: { at: true } }),
    ]);
    const last = new Map(latest.map((l) => [l.customerId, l._max.at ? l._max.at.getTime() : 0]));
    return customers.map((c) => ({ customerId: c.id, at: Math.max(c.updatedAt.getTime(), last.get(c.id) ?? 0) }));
  },
  scheduled: (userId, customerId) => loadCustomerScheduled(userId, customerId),
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

async function openInfo(db: CustomerDb, userId: string, id: string): Promise<CustomerResult<CustomerInfoRow & { customer: CustomerWithBoard }>> {
  if (!isRowId(id)) return fail(CUSTOMER_INFO_GONE);
  const row = await db.info(userId, id);
  if (!row || row.userId !== userId) return fail(CUSTOMER_INFO_GONE);
  const c = customerGate(row.customer, userId);
  return c.ok ? ok(row) : fail(c.error);
}

async function openInteraction(db: CustomerDb, userId: string, id: string): Promise<CustomerResult<InteractionRow & { customer: CustomerWithBoard }>> {
  if (!isRowId(id)) return fail(INTERACTION_GONE);
  const row = await db.interaction(userId, id);
  if (!row || row.userId !== userId) return fail(INTERACTION_GONE);
  const c = customerGate(row.customer, userId);
  return c.ok ? ok(row) : fail(c.error);
}

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface CustomerInput {
  number: string;
  name: string;
  nickname?: string | null;
  phone?: string | null;
  /** Phase 2 (crm.ts). Left out: the customer's own on an edit; CUSTOMER, no tags, none on an add. */
  status?: string;
  tags?: string[];
  email?: string | null;
  company?: string | null;
  address?: string | null;
}

export interface InfoInput {
  detail: string;
  /** An ISO instant. Left out: now on an add, kept on an edit. */
  recordedAt?: string | null;
}

export interface InteractionInput {
  /** An ISO instant. */
  at: string;
  action: string;
  brief?: string | null;
}

const has = (i: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(i, k) && i[k] !== undefined;
const kept = <T>(value: T): CustomerResult<T> => ({ ok: true, value });

/**
 * A customer's fields from a sheet: the ID, name, nickname and phone as before; then (Phase 2, crm.ts) the status, the
 * tags, the email, the company and the address, each one left out keeping the customer's own on an edit (`prev`) and
 * starting at its default on an add (CUSTOMER, no tags, none).
 */
export function customerFieldsOf(input: unknown, prev?: Pick<CustomerRow, "status" | "tags" | "email" | "company" | "address"> | null): CustomerResult<CustomerFields> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const number = cleanCustomerNumber(i.number);
  if (!number.ok) return fail(number.error);
  const name = cleanCustomerName(i.name);
  if (!name.ok) return fail(name.error);
  const nickname = cleanNickname(i.nickname);
  if (!nickname.ok) return fail(nickname.error);
  const phone = cleanPhone(i.phone);
  if (!phone.ok) return fail(phone.error);
  const status = has(i, "status") ? cleanStatus(i.status) : kept(readStatus(prev?.status));
  if (!status.ok) return fail(status.error);
  const tags = has(i, "tags") ? cleanTags(i.tags) : kept<string[]>([...(prev?.tags ?? [])]);
  if (!tags.ok) return fail(tags.error);
  const email = has(i, "email") ? cleanEmail(i.email) : kept(prev?.email ?? null);
  if (!email.ok) return fail(email.error);
  const company = has(i, "company") ? cleanCompany(i.company) : kept(prev?.company ?? null);
  if (!company.ok) return fail(company.error);
  const address = has(i, "address") ? cleanAddress(i.address) : kept(prev?.address ?? null);
  if (!address.ok) return fail(address.error);
  return ok({ number: number.value, name: name.value, nickname: nickname.value, phone: phone.value, status: status.value, tags: tags.value, email: email.value, company: company.value, address: address.value });
}

/** An info's fields: the detail, and when it was recorded (left out: `fallback`, now on an add, the info's own on an edit). */
function infoFieldsOf(input: unknown, now: Date, fallback: Date): CustomerResult<InfoFields> {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const detail = cleanInfoDetail(i.detail);
  if (!detail.ok) return fail(detail.error);
  if (i.recordedAt === undefined || i.recordedAt === null || i.recordedAt === "") return ok({ detail: detail.value, recordedAt: fallback });
  const at = cleanRecordedAt(i.recordedAt, now);
  if (!at.ok) return fail(at.error);
  return ok({ detail: detail.value, recordedAt: at.value });
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
    invalidate("work");
    return ok({ id: row.id, number: row.number });
  } catch (err) {
    if (isNumberTaken(err)) return fail(CUSTOMER_NUMBER_TAKEN);
    throw err;
  }
}

/**
 * Edits a kept customer: ID, name, nickname, phone, and (Phase 2) status, tags, email, company, address (each left out
 * keeps its own). Their own ID in another case is fine; another customer's is refused.
 */
export async function editCustomerCore(userId: string, customerId: string, input: unknown, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = customerFieldsOf(input, c.value);
  if (!f.ok) return fail(f.error);
  try {
    const changed = await db.updateCustomer(userId, customerId, f.value);
    if (changed === 0) return fail(CUSTOMER_ARCHIVED);
    invalidate("work");
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
  // Their scheduled tasks are held with them: off the search, the agenda and the bell.
  invalidate("work", "life");
  return ok({ id: customerId });
}

/** Restores an archived customer, while their ID is free on the tab (CUSTOMER_RESTORE_TAKEN otherwise). Kept: ok. */
export async function restoreCustomerCore(userId: string, customerId: string, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId, true);
  if (!c.ok) return fail(c.error);
  if (!c.value.archivedAt) return ok({ id: customerId });
  try {
    await db.setCustomerArchived(userId, customerId, null);
    invalidate("work", "life");
    return ok({ id: customerId });
  } catch (err) {
    if (isNumberTaken(err)) return fail(CUSTOMER_RESTORE_TAKEN);
    throw err;
  }
}

// ── Info ───────────────────────────────────────────────────────────────────

/** Records an info about a kept customer: a detail, recorded now unless a time (not ahead of now) is given. */
export async function addInfoCore(userId: string, customerId: string, input: unknown, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = infoFieldsOf(input, now, now);
  if (!f.ok) return fail(f.error);
  const row = await db.createInfo(userId, customerId, f.value);
  return ok({ id: row.id });
}

/** Edits an info: its detail and when it was recorded (left out: kept). */
export async function editInfoCore(userId: string, infoId: string, input: unknown, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInfo(db, userId, infoId);
  if (!row.ok) return fail(row.error);
  const f = infoFieldsOf(input, now, row.value.recordedAt);
  if (!f.ok) return fail(f.error);
  if ((await db.updateInfo(userId, infoId, f.value)) === 0) return fail(CUSTOMER_INFO_GONE);
  return ok({ id: infoId });
}

/** Archives an info (the page offers Undo: restoreInfoCore). Again: ok. */
export async function archiveInfoCore(userId: string, infoId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInfo(db, userId, infoId);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.setInfoArchived(userId, infoId, now);
  return ok({ id: infoId });
}

export async function restoreInfoCore(userId: string, infoId: string, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInfo(db, userId, infoId);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.setInfoArchived(userId, infoId, null);
  return ok({ id: infoId });
}

// ── Interactions ───────────────────────────────────────────────────────────

/** Logs an interaction: when, what happened (one of the four), and a brief. */
export async function addInteractionCore(userId: string, customerId: string, input: unknown, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const c = await openCustomer(db, userId, customerId);
  if (!c.ok) return fail(c.error);
  const f = interactionFieldsOf(input);
  if (!f.ok) return fail(f.error);
  const row = await db.createInteraction(userId, customerId, f.value);
  // Their latest activity: the search's tie-break.
  invalidate("work");
  return ok({ id: row.id });
}

export async function editInteractionCore(userId: string, interactionId: string, input: unknown, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInteraction(db, userId, interactionId);
  if (!row.ok) return fail(row.error);
  const f = interactionFieldsOf(input);
  if (!f.ok) return fail(f.error);
  if ((await db.updateInteraction(userId, interactionId, f.value)) === 0) return fail(INTERACTION_GONE);
  // A moved entry moves their last contact (the follow-ups' facts, cached under 'work').
  invalidate("work");
  return ok({ id: interactionId });
}

/** Archives a log entry (the page offers Undo: restoreInteractionCore). Again: ok. */
export async function archiveInteractionCore(userId: string, interactionId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInteraction(db, userId, interactionId);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.setInteractionArchived(userId, interactionId, now);
  invalidate("work");
  return ok({ id: interactionId });
}

export async function restoreInteractionCore(userId: string, interactionId: string, db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<{ id: string }>> {
  const row = await openInteraction(db, userId, interactionId);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.setInteractionArchived(userId, interactionId, null);
  invalidate("work");
  return ok({ id: interactionId });
}

// ── Reads ──────────────────────────────────────────────────────────────────

const boardView = (b: CrmBoardRow): CrmBoardView => ({ id: b.id, name: b.name });

export type CustomersPageData =
  | { kind: "gone" }
  | { kind: "archived" | "off"; board: CrmBoardView }
  | { kind: "ok"; board: CrmBoardView; customers: CustomerListItem[]; archived: ArchivedCustomerItem[]; numeric: boolean; suggestion: string | null };

/**
 * The customer list page, in one wave: the tab, its kept customers, its
 * archived ones, the scheduled tasks due by tonight, each customer's newest
 * info (its first line, the row's quiet subtitle) and their latest activity
 * (the search's tie-break). Customers by ID (natural order).
 */
export async function loadCustomersPage(userId: string, boardId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomersPageData> {
  if (!isBoardId(boardId)) return { kind: "gone" };
  const [board, open, archived, due, infos, activity] = await Promise.all([
    db.board(userId, boardId),
    db.customers(userId, boardId, false),
    db.customers(userId, boardId, true),
    db.dueTasks(userId, boardId, endOfLocalDay(now)),
    db.latestInfos(userId, boardId),
    db.activity(userId, boardId),
  ]);
  if (!board || board.userId !== userId) return { kind: "gone" };
  if (board.archivedAt) return { kind: "archived", board: boardView(board) };
  if (!board.crmOn) return { kind: "off", board: boardView(board) };
  const byCustomer = new Map<string, Date[]>();
  for (const t of due) byCustomer.set(t.customerId, [...(byCustomer.get(t.customerId) ?? []), t.dueAt]);
  const infoOf = new Map(infos.map((i) => [i.customerId, infoFirstLine(i.detail) || null]));
  const activityOf = new Map(activity.map((a) => [a.customerId, a.at]));
  const customers = open
    .filter((c) => !c.archivedAt)
    .map(
      (c): CustomerListItem => ({
        id: c.id,
        number: c.number,
        name: c.name,
        nickname: c.nickname,
        phone: c.phone,
        ...dueCountOf(byCustomer.get(c.id) ?? [], now),
        info: infoOf.get(c.id) ?? null,
        activity: activityOf.get(c.id) ?? 0,
        status: readStatus(c.status),
        tags: c.tags ?? [],
        email: c.email ?? null,
        company: c.company ?? null,
      })
    )
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
  | { kind: "ok"; board: CrmBoardView; customer: CustomerDetail; tasks: ScheduledView[]; infos: CustomerInfoView[]; interactions: InteractionView[] };

/**
 * One customer's page, in one wave: the customer with their tab, their
 * scheduled tasks (open soonest first, then the done ones, newest first),
 * their infos (newest recorded first) and their log (newest first; an action
 * outside CUSTOMER_ACTIONS is left out). A customer on another tab (or
 * another user's) is gone.
 */
export async function loadCustomerPage(userId: string, boardId: string, customerId: string, db: CustomerDb = prismaCustomerDb): Promise<CustomerPageData> {
  if (!isBoardId(boardId) || !isRowId(customerId)) return { kind: "gone" };
  const [c, tasks, infos, interactions] = await Promise.all([
    db.customer(userId, customerId),
    db.scheduled(userId, customerId),
    db.infos(userId, customerId),
    db.interactions(userId, customerId),
  ]);
  if (!c || c.userId !== userId || c.boardId !== boardId || c.board.userId !== userId) return { kind: "gone" };
  if (c.board.archivedAt) return { kind: "archived", board: boardView(c.board) };
  if (!c.board.crmOn) return { kind: "off", board: boardView(c.board) };
  const ms = (iso: string | null) => (iso ? Date.parse(iso) : 0);
  const open = tasks.filter((t) => !t.doneAt).sort((a, b) => ms(a.dueAt) - ms(b.dueAt) || (a.id < b.id ? -1 : 1));
  const done = tasks.filter((t) => t.doneAt).sort((a, b) => ms(b.doneAt) - ms(a.doneAt));
  return {
    kind: "ok",
    board: boardView(c.board),
    customer: {
      id: c.id,
      number: c.number,
      name: c.name,
      nickname: c.nickname,
      phone: c.phone,
      archived: c.archivedAt != null,
      status: readStatus(c.status),
      tags: c.tags ?? [],
      email: c.email ?? null,
      company: c.company ?? null,
      address: c.address ?? null,
    },
    tasks: [...open, ...done],
    infos: sortInfos(infos.filter((i) => !i.archivedAt)).map((i) => ({ id: i.id, detail: i.detail, recordedAt: i.recordedAt.toISOString() })),
    interactions: interactions
      .filter((i) => !i.archivedAt)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .flatMap((i): InteractionView[] => (isCustomerAction(i.action) ? [{ id: i.id, at: i.at.toISOString(), action: i.action, brief: i.brief }] : [])),
  };
}

/** The work frame's Customers count: open scheduled tasks due by tonight for the tab's kept customers, and the overdue ones. */
export async function customerDueCountCore(userId: string, boardId: string, now: Date = new Date(), db: CustomerDb = prismaCustomerDb): Promise<CustomerResult<DueCount>> {
  const board = await openBoard(db, userId, boardId);
  if (!board.ok) return fail(board.error);
  const due = await db.dueTasks(userId, boardId, endOfLocalDay(now));
  return ok(dueCountOf(due.map((t) => t.dueAt), now));
}
