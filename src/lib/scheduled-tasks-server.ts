/**
 * Scheduled tasks on the server (2026-10-20; the rules are scheduled-tasks.ts). Every write checks, in this order:
 * the work tab is the user's (else WORK_BOARD_GONE) and open (WORK_BOARD_ARCHIVED); the task is the user's and on that
 * tab (SCHEDULED_GONE) and not archived (SCHEDULED_ARCHIVED); a customer is the user's, on the SAME tab
 * (SCHEDULED_CUSTOMER_GONE), kept (SCHEDULED_CUSTOMER_ARCHIVED), and newly linked only where the tab keeps its customer
 * list (SCHEDULED_CRM_OFF); a collection (Phase 2, crm.ts) is the user's, on the SAME tab (SCHEDULED_COLLECTION_GONE),
 * the task's own customer's (SCHEDULED_COLLECTION_NO_CUSTOMER, SCHEDULED_COLLECTION_OTHER) and, newly linked, neither
 * archived nor closed (SCHEDULED_COLLECTION_ARCHIVED, SCHEDULED_COLLECTION_CLOSED); then the fields. One read gates, then one write (Done with "Log to history" writes the task
 * and the log entry in ONE transaction). Every write clears the 'life' cache (the bell) and the 'work' cache (the
 * workspace's search index).
 *
 *   createScheduledCore · editScheduledCore      the sheet; moving dueAt ALWAYS clears remindSentAt
 *   doneScheduledCore(…, { log })                Done, and optionally a CustomerInteraction for its customer
 *                                                (an action and a brief, prefilled from the channel and the title)
 *   reopenScheduledCore(…, { interactionId })    Done's Undo (the logged entry archived again); the reminder's sent
 *                                                stamp is kept, so a reopened task never pushes twice
 *   snoozeScheduledCore(…, preset)               +10 min · +1 hour · this evening · tomorrow · next Monday
 *   archiveScheduledCore · restoreScheduledCore  archive and its Undo
 *   loadAgenda(userId, boardId, { now, focus })  the Agenda's rows and the ?task= / ?callback= focus
 *   loadCustomerScheduled(userId, customerId)    a customer page's list
 *   resolveTaskParam(userId, raw)                ?task=<id> by its id, else an old customer task's (legacy) id
 *   loadScheduledBellRows(userId, now)           the bell's due tasks (notifications.ts)
 *   loadBannerTasks(userId, now)                 the in-app reminder's tasks (/api/scheduled/due)
 *   loadWorkIndex(userId, boardId)               the workspace's search index (customers, tasks; since Phase 2 the
 *                                                customers' company, email, status and tags, and their open task
 *                                                collections), cached ('work')
 *   searchWorkCore(userId, boardId, q)           the same match on the server: only when the browser has no index
 *   handleDueRequest(deps?)                      /api/scheduled/due's GET (the route file may export only its methods)
 *
 * A task whose customer is archived is held with them: off the agenda, the bell, the banner and the dispatcher until
 * the customer is restored (as their customer tasks were). Every core takes a ScheduledDb, so
 * scripts/scheduled-tasks-check.ts runs them against an in-memory one. Work, never the game.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { getCurrentUserId } from "./user";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, isBoardId } from "./work-boards";
import { cleanAction, cleanBrief, isRowId } from "./customers";
import {
  BANNER_AHEAD_MS,
  BANNER_BEHIND_MS,
  DONE_DAYS,
  SCHEDULED_ARCHIVED,
  SCHEDULED_COLLECTION_ARCHIVED,
  SCHEDULED_COLLECTION_CLOSED,
  SCHEDULED_COLLECTION_GONE,
  SCHEDULED_COLLECTION_NO_CUSTOMER,
  SCHEDULED_COLLECTION_OTHER,
  SCHEDULED_CRM_OFF,
  SCHEDULED_CUSTOMER_ARCHIVED,
  SCHEDULED_CUSTOMER_GONE,
  SCHEDULED_GONE,
  SCHEDULED_LOG_NO_CUSTOMER,
  SCHEDULED_SNOOZE_BAD,
  channelOf,
  cleanScheduledInput,
  focusParamOf,
  keptDueAt,
  remindSentAtAfter,
  snoozePresetOf,
  snoozeTarget,
  type BannerTask,
  type DueScheduled,
  type ScheduledView,
} from "./scheduled-tasks";
import { addDays, dayStartOf, todayKey } from "./life-day";
import { matchCustomers, matchTitles, prepareIndex, type CustomerMatch, type TaskMatch, type WorkIndex } from "./customer-search";

export type ScheduledResult<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): ScheduledResult<T> => ({ ok: true, value });
const fail = <T>(error: string): ScheduledResult<T> => ({ ok: false, error });

// ── Rows and the db the cores use ───────────────────────────────────────────

export interface ScheduledBoardRow {
  id: string;
  userId: string;
  name: string;
  archivedAt: Date | null;
  crmOn: boolean;
}

export interface ScheduledCustomerRow {
  id: string;
  userId: string;
  boardId: string;
  number: string;
  name: string;
  phone: string | null;
  archivedAt: Date | null;
}

export interface ScheduledRow {
  id: string;
  userId: string;
  boardId: string;
  customerId: string | null;
  dueAt: Date;
  allDay: boolean;
  title: string;
  detail: string | null;
  channel: string;
  remind: boolean;
  remindSentAt: Date | null;
  doneAt: Date | null;
  archivedAt: Date | null;
  /** Its task collection (Phase 2; crm.ts), or null. Absent in the checks' stores: none. */
  collectionId?: string | null;
}

/** A task collection as the gate reads it (crm.ts; TaskCollection). */
export interface ScheduledCollectionRow {
  id: string;
  userId: string;
  boardId: string;
  customerId: string;
  name: string;
  closedAt: Date | null;
  archivedAt: Date | null;
}

export type ScheduledWithCustomer = ScheduledRow & {
  customer: ScheduledCustomerRow | null;
  /** The collection's name for the row's chip (an archived one draws none). Absent in the checks' store: none. */
  collection?: { id: string; name: string; archivedAt?: Date | null } | null;
};
export type ScheduledWrite = Partial<Omit<ScheduledRow, "id" | "userId" | "boardId">>;

/** Where a patch applies: open (not archived), archived, done, not done. */
export interface PatchWhere {
  open?: boolean;
  archived?: boolean;
  done?: boolean;
  notDone?: boolean;
}

/** The log entry Done's "Log to history" writes. */
export interface DoneLog {
  customerId: string;
  at: Date;
  action: string;
  brief: string;
}

/** The reads and writes the cores make: Prisma in the app, an in-memory store in the checks. */
export interface ScheduledDb {
  board(userId: string, boardId: string): Promise<ScheduledBoardRow | null>;
  customer(userId: string, id: string): Promise<ScheduledCustomerRow | null>;
  /** One task collection of the user's (open, closed or archived). */
  collection(userId: string, id: string): Promise<ScheduledCollectionRow | null>;
  /** One task of the user's (open, done or archived), with its customer and its tab. */
  task(userId: string, id: string): Promise<(ScheduledWithCustomer & { board: ScheduledBoardRow }) | null>;
  /** A task by the CallBack or CustomerTask it was backfilled from (an old link), the user's. */
  byLegacy(userId: string, kind: "callback" | "customerTask", legacyId: string): Promise<{ id: string; boardId: string; customerId: string | null } | null>;
  insert(row: Omit<ScheduledRow, "id" | "remindSentAt" | "doneAt" | "archivedAt">): Promise<{ id: string }>;
  /** Writes `data` where the task is the user's and `where` holds; the rows changed (0 or 1). */
  patch(userId: string, id: string, where: PatchWhere, data: ScheduledWrite): Promise<number>;
  /** Done (on an open, not-done task) and, when given, its log entry: one transaction. */
  markDone(userId: string, id: string, at: Date, log: DoneLog | null): Promise<{ changed: number; interactionId: string | null }>;
  /** Archives a log entry Done made (its Undo); rows changed. */
  archiveInteraction(userId: string, interactionId: string, at: Date): Promise<number>;
  /** A tab's agenda: not archived, customer kept; the open ones, and the ones done since `doneSince`. */
  agenda(userId: string, boardId: string, doneSince: Date): Promise<ScheduledWithCustomer[]>;
  /** One customer's tasks (not archived): the open ones and their newest done ones. */
  forCustomer(userId: string, customerId: string): Promise<ScheduledWithCustomer[]>;
}

const BOARD_SELECT = { id: true, userId: true, name: true, archivedAt: true, crmOn: true } as const;
const CUSTOMER_SELECT = { id: true, userId: true, boardId: true, number: true, name: true, phone: true, archivedAt: true } as const;
const TASK_SELECT = {
  id: true,
  userId: true,
  boardId: true,
  customerId: true,
  dueAt: true,
  allDay: true,
  title: true,
  detail: true,
  channel: true,
  remind: true,
  remindSentAt: true,
  doneAt: true,
  archivedAt: true,
  collectionId: true,
  customer: { select: CUSTOMER_SELECT },
  collection: { select: { id: true, name: true, archivedAt: true } },
} as const;
const COLLECTION_SELECT = { id: true, userId: true, boardId: true, customerId: true, name: true, closedAt: true, archivedAt: true } as const;
/** A tab's open tasks read at most (the agenda's Later counts the rest past it). */
const AGENDA_MAX = 600;
const CUSTOMER_TASKS_MAX = 200;
const KEPT_CUSTOMER: Prisma.ScheduledTaskWhereInput = { OR: [{ customerId: null }, { customer: { is: { archivedAt: null } } }] };

/** The app's ScheduledDb. */
export const prismaScheduledDb: ScheduledDb = {
  board: (userId, boardId) => prisma.workBoard.findFirst({ where: { id: boardId, userId }, select: BOARD_SELECT }),
  customer: (userId, id) => prisma.customer.findFirst({ where: { id, userId }, select: CUSTOMER_SELECT }),
  collection: (userId, id) => prisma.taskCollection.findFirst({ where: { id, userId }, select: COLLECTION_SELECT }),
  // A task's customer, collection and tab in one round trip (relationJoins: a LATERAL JOIN, not a query per relation).
  task: (userId, id) => prisma.scheduledTask.findFirst({ relationLoadStrategy: "join", where: { id, userId }, select: { ...TASK_SELECT, board: { select: BOARD_SELECT } } }),
  byLegacy: (userId, kind, legacyId) =>
    prisma.scheduledTask.findFirst({
      where: { userId, ...(kind === "callback" ? { legacyCallBackId: legacyId } : { legacyCustomerTaskId: legacyId }) },
      select: { id: true, boardId: true, customerId: true },
    }),
  insert: (row) => prisma.scheduledTask.create({ data: row, select: { id: true } }),
  patch: async (userId, id, where, data) =>
    (
      await prisma.scheduledTask.updateMany({
        where: {
          id,
          userId,
          ...(where.open ? { archivedAt: null } : {}),
          ...(where.archived ? { archivedAt: { not: null } } : {}),
          ...(where.done ? { doneAt: { not: null } } : {}),
          ...(where.notDone ? { doneAt: null } : {}),
        },
        data,
      })
    ).count,
  markDone: async (userId, id, at, log) => {
    // One transaction: the task turns done only while open, and the log entry is written with it or not at all.
    return prisma.$transaction(async (tx) => {
      const changed = (await tx.scheduledTask.updateMany({ where: { id, userId, archivedAt: null, doneAt: null }, data: { doneAt: at } })).count;
      if (changed === 0 || !log) return { changed, interactionId: null };
      const entry = await tx.customerInteraction.create({ data: { userId, customerId: log.customerId, at: log.at, action: log.action, brief: log.brief }, select: { id: true } });
      return { changed, interactionId: entry.id };
    });
  },
  archiveInteraction: async (userId, interactionId, at) =>
    (await prisma.customerInteraction.updateMany({ where: { id: interactionId, userId, archivedAt: null }, data: { archivedAt: at } })).count,
  agenda: (userId, boardId, doneSince) =>
    prisma.scheduledTask.findMany({
      relationLoadStrategy: "join",
      where: { userId, boardId, archivedAt: null, AND: [KEPT_CUSTOMER, { OR: [{ doneAt: null }, { doneAt: { gte: doneSince } }] }] },
      select: TASK_SELECT,
      orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }, { id: "asc" }],
      take: AGENDA_MAX,
    }),
  forCustomer: (userId, customerId) =>
    prisma.scheduledTask.findMany({
      relationLoadStrategy: "join",
      where: { userId, customerId, archivedAt: null },
      select: TASK_SELECT,
      orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }],
      take: CUSTOMER_TASKS_MAX,
    }),
};

// ── The view ────────────────────────────────────────────────────────────────

export function scheduledViewOf(r: ScheduledWithCustomer): ScheduledView {
  return {
    id: r.id,
    boardId: r.boardId,
    dueAt: r.dueAt.toISOString(),
    allDay: r.allDay,
    title: r.title,
    detail: r.detail,
    channel: channelOf(r.channel) ?? "OTHER",
    remind: r.remind,
    remindSentAt: r.remindSentAt ? r.remindSentAt.toISOString() : null,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    customer: r.customer ? { id: r.customer.id, number: r.customer.number, name: r.customer.name, phone: r.customer.phone } : null,
    collection: r.collection && !r.collection.archivedAt ? { id: r.collection.id, name: r.collection.name } : null,
  };
}

// ── The gates ───────────────────────────────────────────────────────────────

function boardGate(b: ScheduledBoardRow | null, userId: string): ScheduledResult<ScheduledBoardRow> {
  if (!b || b.userId !== userId) return fail(WORK_BOARD_GONE);
  if (b.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  return ok(b);
}

async function openBoard(db: ScheduledDb, userId: string, boardId: string): Promise<ScheduledResult<ScheduledBoardRow>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  return boardGate(await db.board(userId, boardId), userId);
}

/** The task is the user's, its tab open, it is not archived (unless `archivedToo`), and its customer (if any) kept. */
async function openTask(db: ScheduledDb, userId: string, id: string, archivedToo = false): Promise<ScheduledResult<ScheduledWithCustomer & { board: ScheduledBoardRow }>> {
  if (!isRowId(id)) return fail(SCHEDULED_GONE);
  const row = await db.task(userId, id);
  if (!row || row.userId !== userId) return fail(SCHEDULED_GONE);
  const b = boardGate(row.board, userId);
  if (!b.ok) return fail(b.error);
  if (row.archivedAt && !archivedToo) return fail(SCHEDULED_ARCHIVED);
  if (row.customer?.archivedAt) return fail(SCHEDULED_CUSTOMER_ARCHIVED);
  return ok(row);
}

/**
 * The customer a write links: none; the one already linked (kept); or a new one, which must be the user's, on THIS
 * tab, kept, and the tab must keep its customer list.
 */
async function customerGate(db: ScheduledDb, userId: string, board: ScheduledBoardRow, customerId: string | null, prevId: string | null): Promise<ScheduledResult<string | null>> {
  if (!customerId) return ok(null);
  const c = await db.customer(userId, customerId);
  if (!c || c.userId !== userId || c.boardId !== board.id) return fail(SCHEDULED_CUSTOMER_GONE);
  if (c.archivedAt) return fail(SCHEDULED_CUSTOMER_ARCHIVED);
  if (customerId !== prevId && !board.crmOn) return fail(SCHEDULED_CRM_OFF);
  return ok(c.id);
}

/**
 * The collection a write links (Phase 2): none; the one already linked (kept, even closed or archived since); or a new
 * one, which must be the user's, on THIS tab, the task's own customer's, and neither archived nor closed.
 */
async function collectionGate(db: ScheduledDb, userId: string, board: ScheduledBoardRow, collectionId: string | null, customerId: string | null, prevId: string | null): Promise<ScheduledResult<string | null>> {
  if (!collectionId) return ok(null);
  if (!customerId) return fail(SCHEDULED_COLLECTION_NO_CUSTOMER);
  const c = await db.collection(userId, collectionId);
  if (!c || c.userId !== userId || c.boardId !== board.id) return fail(SCHEDULED_COLLECTION_GONE);
  if (c.customerId !== customerId) return fail(SCHEDULED_COLLECTION_OTHER);
  if (c.id === prevId) return ok(c.id);
  if (c.archivedAt) return fail(SCHEDULED_COLLECTION_ARCHIVED);
  if (c.closedAt) return fail(SCHEDULED_COLLECTION_CLOSED);
  return ok(c.id);
}

function changed() {
  // The bell (notifications, cached under 'life') and the workspace's search index ('work').
  invalidate("life", "work");
}

async function viewById(db: ScheduledDb, userId: string, id: string): Promise<ScheduledResult<ScheduledView>> {
  const row = await db.task(userId, id);
  return row ? ok(scheduledViewOf(row)) : fail(SCHEDULED_GONE);
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Adds a scheduled task to an open tab. Its reminder starts unsent. */
export async function createScheduledCore(userId: string, boardId: string, raw: unknown, db: ScheduledDb = prismaScheduledDb): Promise<ScheduledResult<ScheduledView>> {
  const board = await openBoard(db, userId, boardId);
  if (!board.ok) return fail(board.error);
  const input = cleanScheduledInput(raw);
  if (!input.ok) return fail(input.error);
  const v = input.value;
  const customer = await customerGate(db, userId, board.value, v.customerId, null);
  if (!customer.ok) return fail(customer.error);
  const collection = await collectionGate(db, userId, board.value, v.collectionId ?? null, customer.value, null);
  if (!collection.ok) return fail(collection.error);
  const row = await db.insert({ userId, boardId, customerId: customer.value, dueAt: v.dueAt, allDay: v.allDay, title: v.title, detail: v.detail, channel: v.channel, remind: v.remind, collectionId: collection.value });
  changed();
  return viewById(db, userId, row.id);
}

/**
 * Edits a task: every field. A moved dueAt clears remindSentAt (it is armed again for the new time). A collection left
 * out stays while the customer does (another customer, or none, takes the task out of it).
 */
export async function editScheduledCore(userId: string, id: string, raw: unknown, db: ScheduledDb = prismaScheduledDb): Promise<ScheduledResult<ScheduledView>> {
  const prev = await openTask(db, userId, id);
  if (!prev.ok) return fail(prev.error);
  const input = cleanScheduledInput(raw);
  if (!input.ok) return fail(input.error);
  const v = input.value;
  const customer = await customerGate(db, userId, prev.value.board, v.customerId, prev.value.customerId);
  if (!customer.ok) return fail(customer.error);
  const had = prev.value.collectionId ?? null;
  const wanted = v.collectionId !== undefined ? v.collectionId : customer.value === prev.value.customerId ? had : null;
  const collection = await collectionGate(db, userId, prev.value.board, wanted, customer.value, had);
  if (!collection.ok) return fail(collection.error);
  const dueAt = keptDueAt(prev.value.dueAt, v.dueAt);
  const n = await db.patch(userId, id, { open: true }, {
    customerId: customer.value,
    collectionId: collection.value,
    dueAt,
    allDay: v.allDay,
    title: v.title,
    detail: v.detail,
    channel: v.channel,
    remind: v.remind,
    remindSentAt: remindSentAtAfter(prev.value, dueAt),
  });
  if (n === 0) return fail(SCHEDULED_ARCHIVED);
  changed();
  return viewById(db, userId, id);
}

export interface DoneOptions {
  /** "Log to history": the customer log's action and brief (the task must have a customer). */
  log?: { action: unknown; brief: unknown } | null;
}

/**
 * Done. With `log`, the task's customer gets a log entry (now, the action, the brief) in the same transaction. Already
 * done: ok, nothing written. Answers the entry's id for the Undo.
 */
export async function doneScheduledCore(userId: string, id: string, opts: DoneOptions = {}, now: Date = new Date(), db: ScheduledDb = prismaScheduledDb): Promise<ScheduledResult<{ id: string; doneAt: string; interactionId: string | null }>> {
  const row = await openTask(db, userId, id);
  if (!row.ok) return fail(row.error);
  if (row.value.doneAt) return ok({ id, doneAt: row.value.doneAt.toISOString(), interactionId: null });
  let log: DoneLog | null = null;
  if (opts.log) {
    if (!row.value.customerId) return fail(SCHEDULED_LOG_NO_CUSTOMER);
    const action = cleanAction(opts.log.action);
    if (!action.ok) return fail(action.error);
    const brief = cleanBrief(opts.log.brief);
    if (!brief.ok) return fail(brief.error);
    log = { customerId: row.value.customerId, at: now, action: action.value, brief: brief.value };
  }
  const res = await db.markDone(userId, id, now, log);
  if (res.changed === 0) {
    const again = await db.task(userId, id);
    if (again?.doneAt) return ok({ id, doneAt: again.doneAt.toISOString(), interactionId: null });
    return fail(SCHEDULED_ARCHIVED);
  }
  changed();
  return ok({ id, doneAt: now.toISOString(), interactionId: res.interactionId });
}

/** Done's Undo: open again (its sent stamp kept: it never pushes twice), and the entry Done logged archived. */
export async function reopenScheduledCore(userId: string, id: string, opts: { interactionId?: string | null } = {}, now: Date = new Date(), db: ScheduledDb = prismaScheduledDb): Promise<ScheduledResult<{ id: string }>> {
  const row = await openTask(db, userId, id);
  if (!row.ok) return fail(row.error);
  if (row.value.doneAt) await db.patch(userId, id, { open: true, done: true }, { doneAt: null });
  if (opts.interactionId && isRowId(opts.interactionId)) await db.archiveInteraction(userId, opts.interactionId, now);
  changed();
  return ok({ id });
}

/**
 * Snooze: the task moves to a preset's time (snoozeTarget) and becomes timed; its reminder is armed again
 * (remindSentAt cleared: dueAt moved). An open task only.
 */
export async function snoozeScheduledCore(userId: string, id: string, presetRaw: unknown, now: Date = new Date(), db: ScheduledDb = prismaScheduledDb): Promise<ScheduledResult<{ id: string; dueAt: string }>> {
  const row = await openTask(db, userId, id);
  if (!row.ok) return fail(row.error);
  const preset = snoozePresetOf(presetRaw);
  const at = preset ? snoozeTarget(preset, now) : null;
  if (!at) return fail(SCHEDULED_SNOOZE_BAD);
  if (row.value.doneAt) return fail(SCHEDULED_SNOOZE_BAD);
  const n = await db.patch(userId, id, { open: true, notDone: true }, { dueAt: at, allDay: false, remindSentAt: remindSentAtAfter(row.value, at) });
  if (n === 0) return fail(SCHEDULED_ARCHIVED);
  changed();
  return ok({ id, dueAt: at.toISOString() });
}

/** Archives a task (it leaves every list, its reminder goes quiet). Again: ok. */
export async function archiveScheduledCore(userId: string, id: string, now: Date = new Date(), db: ScheduledDb = prismaScheduledDb): Promise<ScheduledResult<{ id: string }>> {
  const row = await openTask(db, userId, id, true);
  if (!row.ok) return fail(row.error);
  if (!row.value.archivedAt) await db.patch(userId, id, { open: true }, { archivedAt: now });
  changed();
  return ok({ id });
}

/** Archive's Undo (its tab open, its customer kept). Already open: ok. */
export async function restoreScheduledCore(userId: string, id: string, db: ScheduledDb = prismaScheduledDb): Promise<ScheduledResult<{ id: string }>> {
  const row = await openTask(db, userId, id, true);
  if (!row.ok) return fail(row.error);
  if (row.value.archivedAt) await db.patch(userId, id, { archived: true }, { archivedAt: null });
  changed();
  return ok({ id });
}

// ── Reads ───────────────────────────────────────────────────────────────────

export interface AgendaBoardView {
  id: string;
  name: string;
  crmOn: boolean;
}

export type AgendaData =
  | { kind: "gone" }
  | { kind: "archived"; board: AgendaBoardView }
  | {
      kind: "ok";
      board: AgendaBoardView;
      /** Open tasks and those done today and DONE_DAYS back; agendaOf sorts them into sections. */
      rows: ScheduledView[];
      /** The task ?task= or ?callback= asked for, when it is on this agenda. */
      focus: string | null;
      /** ?task= or ?callback= named something not on this agenda (archived, done long ago, another tab's, unknown). */
      focusMissing: boolean;
      /** The render's clock (ISO): every label is read against it. */
      nowIso: string;
    };

/** The task id ?task= names: the id itself, else the scheduled task an old customer task became. */
export async function resolveTaskParam(userId: string, raw: string, db: ScheduledDb = prismaScheduledDb): Promise<{ id: string; boardId: string; customerId: string | null } | null> {
  if (!isRowId(raw)) return null;
  const own = await db.task(userId, raw);
  if (own) return { id: own.id, boardId: own.boardId, customerId: own.customerId };
  return db.byLegacy(userId, "customerTask", raw);
}

/** The work tab's agenda (the Office workspace's home): the tab, its rows, and the ?task= / ?callback= focus. */
export async function loadAgenda(userId: string, boardId: string, opts: { now: Date; query?: { [key: string]: unknown } }, db: ScheduledDb = prismaScheduledDb): Promise<AgendaData> {
  if (!isBoardId(boardId)) return { kind: "gone" };
  const doneSince = dayStartOf(addDays(todayKey(opts.now), -DONE_DAYS));
  const [board, rows] = await Promise.all([db.board(userId, boardId), db.agenda(userId, boardId, doneSince)]);
  if (!board || board.userId !== userId) return { kind: "gone" };
  const view: AgendaBoardView = { id: board.id, name: board.name, crmOn: board.crmOn };
  if (board.archivedAt) return { kind: "archived", board: view };
  const asked = focusParamOf(opts.query ?? {});
  let focus: string | null = null;
  if (asked) {
    const target = asked.kind === "task" ? await resolveTaskParam(userId, asked.id, db) : await db.byLegacy(userId, "callback", asked.id);
    if (target && target.boardId === boardId && rows.some((r) => r.id === target.id)) focus = target.id;
  }
  return { kind: "ok", board: view, rows: rows.map(scheduledViewOf), focus, focusMissing: asked != null && focus == null, nowIso: opts.now.toISOString() };
}

/** A customer page's scheduled tasks: open soonest first, then the newest done (the page sorts them into its lists). */
export async function loadCustomerScheduled(userId: string, customerId: string, db: ScheduledDb = prismaScheduledDb): Promise<ScheduledView[]> {
  if (!isRowId(customerId)) return [];
  return (await db.forCustomer(userId, customerId)).map(scheduledViewOf);
}

const BELL_READ = 25;
const OPEN_BOARD = { board: { is: { archivedAt: null } } } as const;

type DueRowRead = {
  id: string;
  userId: string;
  boardId: string;
  title: string;
  channel: string;
  dueAt: Date;
  allDay: boolean;
  board: { name: string };
  customer: { id: string; name: string; number: string } | null;
};

const DUE_SELECT = {
  id: true,
  userId: true,
  boardId: true,
  title: true,
  channel: true,
  dueAt: true,
  allDay: true,
  board: { select: { name: true } },
  customer: { select: { id: true, name: true, number: true } },
} as const;

/**
 * The bell's scheduled tasks (notifications.ts): reminder on, due, not done, not archived, on an open tab, their
 * customer (if any) kept. Sent or not: push is a nudge, the bell the list.
 */
export async function loadScheduledBellRows(userId: string, now: Date): Promise<DueScheduled[]> {
  const rows: DueRowRead[] = await prisma.scheduledTask.findMany({
    where: { userId, remind: true, doneAt: null, archivedAt: null, dueAt: { lte: now }, ...OPEN_BOARD, ...KEPT_CUSTOMER },
    select: DUE_SELECT,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: BELL_READ,
  });
  return rows.map((r) => ({ id: r.id, userId: r.userId, boardId: r.boardId, boardName: r.board.name, title: r.title, channel: r.channel, dueAt: r.dueAt, allDay: r.allDay, customer: r.customer }));
}

const BANNER_READ = 50;

/**
 * The in-app reminder's tasks (/api/scheduled/due): reminder on, not done or archived, on an open tab, customer kept,
 * due from BANNER_BEHIND_MS ago to BANNER_AHEAD_MS ahead. It never touches remindSentAt (that is the push's).
 */
export async function loadBannerTasks(userId: string, now: Date): Promise<BannerTask[]> {
  const rows: DueRowRead[] = await prisma.scheduledTask.findMany({
    where: {
      userId,
      remind: true,
      doneAt: null,
      archivedAt: null,
      dueAt: { gte: new Date(now.getTime() - BANNER_BEHIND_MS), lte: new Date(now.getTime() + BANNER_AHEAD_MS) },
      ...OPEN_BOARD,
      ...KEPT_CUSTOMER,
    },
    select: DUE_SELECT,
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: BANNER_READ,
  });
  return rows.map((r) => ({
    id: r.id,
    boardId: r.boardId,
    boardName: r.board.name,
    title: r.title,
    channel: channelOf(r.channel) ?? "OTHER",
    dueAt: r.dueAt.toISOString(),
    allDay: r.allDay,
    customer: r.customer ? { id: r.customer.id, name: r.customer.name, number: r.customer.number } : null,
  }));
}

// ── The workspace's search index ────────────────────────────────────────────


const INDEX_CUSTOMERS_MAX = 5000;
const INDEX_TASKS_MAX = 500;
const INDEX_COLLECTIONS_MAX = 2000;

type IndexCustomerRead = { id: string; number: string; name: string; nickname: string | null; phone: string | null; updatedAt: Date; company: string | null; email: string | null; status: string; tags: string[] };

async function readWorkIndex(userId: string, boardId: string): Promise<WorkIndex | null> {
  const board = await prisma.workBoard.findFirst({ where: { id: boardId, userId }, select: { id: true, crmOn: true, archivedAt: true } });
  if (!board || board.archivedAt) return null;
  const doneSince = dayStartOf(addDays(todayKey(), -DONE_DAYS));
  const [customers, latest, tasks, collections] = await Promise.all([
    board.crmOn
      ? prisma.customer.findMany({
          where: { userId, boardId, archivedAt: null },
          select: { id: true, number: true, name: true, nickname: true, phone: true, updatedAt: true, company: true, email: true, status: true, tags: true },
          take: INDEX_CUSTOMERS_MAX,
        })
      : Promise.resolve([]),
    board.crmOn
      ? prisma.customerInteraction.groupBy({ by: ["customerId"], where: { userId, archivedAt: null, customer: { is: { boardId, archivedAt: null } } }, _max: { at: true } })
      : Promise.resolve([]),
    prisma.scheduledTask.findMany({
      where: { userId, boardId, archivedAt: null, AND: [KEPT_CUSTOMER, { OR: [{ doneAt: null }, { doneAt: { gte: doneSince } }] }] },
      select: { id: true, title: true, dueAt: true, allDay: true, doneAt: true },
      orderBy: [{ dueAt: "asc" }],
      take: INDEX_TASKS_MAX,
    }),
    // The kept customers' open collections (the sheet's Collection picker), newest first.
    board.crmOn
      ? prisma.taskCollection.findMany({
          where: { userId, boardId, archivedAt: null, closedAt: null, customer: { is: { archivedAt: null } } },
          select: { id: true, customerId: true, name: true },
          orderBy: { createdAt: "desc" },
          take: INDEX_COLLECTIONS_MAX,
        })
      : Promise.resolve([]),
  ]);
  const lastAt = new Map<string, number>(latest.map((l: { customerId: string; _max: { at: Date | null } }) => [l.customerId, l._max.at ? l._max.at.getTime() : 0]));
  return {
    customers: (customers as IndexCustomerRead[]).map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      nickname: c.nickname,
      phone: c.phone ? c.phone.replace(/\D/g, "") : null,
      activity: Math.max(c.updatedAt.getTime(), lastAt.get(c.id) ?? 0),
      company: c.company,
      email: c.email,
      status: c.status,
      tags: c.tags,
    })),
    tasks: tasks.map((t: { id: string; title: string; dueAt: Date; allDay: boolean; doneAt: Date | null }) => ({ id: t.id, title: t.title, dueAt: t.dueAt.toISOString(), allDay: t.allDay, done: t.doneAt != null })),
    collections: (collections as { id: string; customerId: string; name: string }[]).map((c) => ({ id: c.id, customerId: c.customerId, name: c.name })),
  };
}

/** The workspace's search index, loaded once with the work frame. Cached under 'work' (customer and task writes clear it). */
export function loadWorkIndex(userId: string, boardId: string): Promise<WorkIndex | null> {
  if (!isBoardId(boardId)) return Promise.resolve(null);
  return cached(`workIndex:${userId}:${boardId}`, ["work"], () => readWorkIndex(userId, boardId));
}

/** The header's search on the server, only when the browser could not load the index (the same engine and caps). */
export async function searchWorkCore(userId: string, boardId: string, q: unknown): Promise<ScheduledResult<{ customers: CustomerMatch[]; more: number; tasks: TaskMatch[] }>> {
  if (typeof q !== "string" || q.length > 120) return ok({ customers: [], more: 0, tasks: [] });
  const index = await loadWorkIndex(userId, boardId);
  if (!index) return fail(WORK_BOARD_GONE);
  const found = matchCustomers(prepareIndex(index.customers), q);
  const tasks = matchTitles(index.tasks, q);
  return ok({ customers: found?.results ?? [], more: found ? found.total - found.results.length : 0, tasks: tasks?.results ?? [] });
}

// ── /api/scheduled/due ──────────────────────────────────────────────────────

export interface DueRouteDeps {
  userId?: () => string;
  now?: () => Date;
  load?: (userId: string, now: Date) => Promise<BannerTask[]>;
}

/**
 * GET: the current user's tasks for the in-app reminder banner (loadBannerTasks) and the server's clock, never cached.
 * A failed read answers 500 with no tasks (the banner keeps what it had and asks again on the next poll).
 */
export async function handleDueRequest(deps: DueRouteDeps = {}): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    const userId = (deps.userId ?? getCurrentUserId)();
    const now = (deps.now ?? (() => new Date()))();
    const tasks = await (deps.load ?? loadBannerTasks)(userId, now);
    return Response.json({ nowIso: now.toISOString(), tasks }, { headers });
  } catch (err) {
    console.error("[scheduled] due read failed", err);
    return Response.json({ error: "Could not read", tasks: [] }, { status: 500, headers });
  }
}
