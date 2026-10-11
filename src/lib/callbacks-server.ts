/**
 * Call backs on the server (2026-10-12; the rules are callbacks.ts):
 *
 *   loadCallBacks(userId, boardId, opts)           the work tab's open call backs, newest first (CALLBACK_LOAD_MAX),
 *                                                  this tab's recent tags, its open customers, the ?callback focus
 *   saveCallBackCore(userId, boardId, id, input)   add (id null) or edit: the board must be open and the user's; a
 *                                                  Customer ID must name an open customer of THIS tab (ignoring
 *                                                  case); a call-back task is a TaskTemplate on THIS work board
 *                                                  (tasks.ts createTemplateCore with its boardId: never in the
 *                                                  game), planned on the reminder's day; moving or setting remindAt
 *                                                  clears remindSentAt (callbacks.ts remindPatchOf)
 *   archiveCallBackCore · restoreCallBackCore      archive (silences its reminder) and its Undo
 *   clearReminderCore · restoreReminderCore        the card's 'Done' on an open reminder, and its Undo (the exact
 *                                                  reminder back, its sent stamp too, so it never fires twice)
 *   loadWorkReminderRows(userId, now)              the bell's due call backs and customer tasks (notifications.ts)
 *
 * Every core takes a CallBackDb, so scripts/callbacks-check.ts runs them against an in-memory one.
 */
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { createTemplateCore, renameCore, rescheduleCore } from "./tasks";
import { WORK_BOARD_ARCHIVED, WORK_BOARD_GONE, isBoardId } from "./work-boards";
import {
  CALLBACK_ARCHIVED,
  CALLBACK_GONE,
  CALLBACK_LOAD_MAX,
  CUSTOMER_OFF,
  actionOf,
  callBackTaskParse,
  cleanCallBackInput,
  customerUnknown,
  focusIdOf,
  recentTagsOf,
  reminderDayOf,
  remindPatchOf,
  type CallBackView,
  type CallBacksData,
  type CustomerRef,
  type DueCallBackRow,
  type DueCustomerTaskRow,
  type ReminderColumns,
} from "./callbacks";
import type { DayKey } from "./life-day";

export type CallBackResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): CallBackResult<T> => ({ ok: true, value });
const fail = <T>(error: string): CallBackResult<T> => ({ ok: false, error });

// ── The table ─────────────────────────────────────────────────────────────

export interface CallBackRecord extends ReminderColumns {
  id: string;
  userId: string;
  boardId: string;
  at: Date;
  action: string;
  tags: string[];
  taskId: string | null;
  customerId: string | null;
  archivedAt: Date | null;
}

/** A linked task as the card reads it. */
export interface CallBackTaskFacts {
  id: string;
  title: string;
  done: boolean;
  archived: boolean;
}

/** A call back with its task and customer, as the list reads it. */
export interface CallBackListRow extends CallBackRecord {
  task: CallBackTaskFacts | null;
  customer: CustomerRef | null;
}

export type CallBackWrite = Partial<Omit<CallBackRecord, "id" | "userId" | "boardId">>;

/** The reads and writes the cores make: Prisma in the app, an in-memory table in the checks. */
export interface CallBackDb {
  board(userId: string, boardId: string): Promise<{ id: string; archivedAt: Date | null; crmOn: boolean } | null>;
  /** The board's open call backs, newest `at` first (then newest id), at most `take`. */
  list(userId: string, boardId: string, take: number): Promise<CallBackListRow[]>;
  /** One call back of the user's (open or archived), with its task and customer. */
  find(userId: string, id: string): Promise<CallBackListRow | null>;
  insert(row: Omit<CallBackRecord, "id" | "archivedAt">): Promise<{ id: string }>;
  /** Writes `data` where the row is the user's and `where` holds; the number of rows changed (0 or 1). */
  patch(userId: string, id: string, where: { open?: boolean; archived?: boolean; noReminder?: boolean }, data: CallBackWrite): Promise<number>;
  /** The board's open customers (crmOn tabs). */
  customers(userId: string, boardId: string): Promise<CustomerRef[]>;
  /** An open customer of the board whose number is `number`, ignoring case. */
  customerByNumber(userId: string, boardId: string, number: string): Promise<CustomerRef | null>;
  /** The call-back task: a TASK on the work board (createTemplateCore with its boardId in the app). */
  createTask(userId: string, input: { title: string; dueDay: DayKey | null; boardId: string; key: string | null }): Promise<{ id: string; title: string }>;
  renameTask(userId: string, taskId: string, title: string): Promise<boolean>;
  /** Moves an open one-off task to `day` (rescheduleCore); false when refused. */
  moveTask(userId: string, taskId: string, day: DayKey): Promise<boolean>;
}

const LIST_INCLUDE = {
  task: { select: { id: true, title: true, completedAt: true, archivedAt: true } },
  customer: { select: { id: true, number: true, name: true } },
} as const;

type PrismaListRow = {
  id: string;
  userId: string;
  boardId: string;
  at: Date;
  action: string;
  tags: string[];
  taskId: string | null;
  customerId: string | null;
  remindAt: Date | null;
  remindAction: string | null;
  remindSentAt: Date | null;
  archivedAt: Date | null;
  task: { id: string; title: string; completedAt: Date | null; archivedAt: Date | null } | null;
  customer: { id: string; number: string; name: string } | null;
};

function listRowOf(r: PrismaListRow): CallBackListRow {
  return {
    id: r.id,
    userId: r.userId,
    boardId: r.boardId,
    at: r.at,
    action: r.action,
    tags: r.tags ?? [],
    taskId: r.taskId,
    customerId: r.customerId,
    remindAt: r.remindAt,
    remindAction: r.remindAction,
    remindSentAt: r.remindSentAt,
    archivedAt: r.archivedAt,
    task: r.task ? { id: r.task.id, title: r.task.title, done: r.task.completedAt != null, archived: r.task.archivedAt != null } : null,
    customer: r.customer ? { id: r.customer.id, number: r.customer.number, name: r.customer.name } : null,
  };
}

/** The app's CallBackDb. */
export const prismaCallBackDb: CallBackDb = {
  board: (userId, boardId) => prisma.workBoard.findFirst({ where: { id: boardId, userId }, select: { id: true, archivedAt: true, crmOn: true } }),
  list: async (userId, boardId, take) =>
    (
      await prisma.callBack.findMany({
        where: { userId, boardId, archivedAt: null },
        include: LIST_INCLUDE,
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take,
      })
    ).map(listRowOf),
  find: async (userId, id) => {
    const r = await prisma.callBack.findFirst({ where: { id, userId }, include: LIST_INCLUDE });
    return r ? listRowOf(r) : null;
  },
  insert: (row) => prisma.callBack.create({ data: row, select: { id: true } }),
  patch: async (userId, id, where, data) =>
    (
      await prisma.callBack.updateMany({
        where: {
          id,
          userId,
          ...(where.open ? { archivedAt: null } : {}),
          ...(where.archived ? { archivedAt: { not: null } } : {}),
          ...(where.noReminder ? { remindAt: null } : {}),
        },
        data,
      })
    ).count,
  customers: (userId, boardId) =>
    prisma.customer.findMany({ where: { userId, boardId, archivedAt: null }, select: { id: true, number: true, name: true }, orderBy: { number: "asc" }, take: 2000 }),
  customerByNumber: (userId, boardId, number) =>
    prisma.customer.findFirst({ where: { userId, boardId, archivedAt: null, number: { equals: number, mode: "insensitive" } }, select: { id: true, number: true, name: true } }),
  createTask: async (userId, input) => {
    // The capture path, scoped to the work board: one INSERT with boardId, a TASK (never a goal or an idea).
    const created = await createTemplateCore(userId, callBackTaskParse(input.title, input.dueDay), {
      rawText: input.title,
      captureSource: "form",
      captureKey: input.key,
      boardId: input.boardId,
    });
    return { id: created.id, title: created.title };
  },
  renameTask: async (userId, taskId, title) => (await renameCore(userId, taskId, title)).ok,
  moveTask: async (userId, taskId, day) => (await rescheduleCore(userId, taskId, day)).ok,
};

// ── The view ──────────────────────────────────────────────────────────────

export function viewOf(r: CallBackListRow): CallBackView {
  return {
    id: r.id,
    at: r.at.toISOString(),
    action: actionOf(r.action) ?? "PHONE",
    tags: [...r.tags],
    task: r.task && !r.task.archived ? { id: r.task.id, title: r.task.title, done: r.task.done } : null,
    customer: r.customer,
    remindAt: r.remindAt ? r.remindAt.toISOString() : null,
    remindAction: actionOf(r.remindAction),
    remindSentAt: r.remindSentAt ? r.remindSentAt.toISOString() : null,
  };
}

/**
 * The work tab's call backs: the newest CALLBACK_LOAD_MAX open ones (older: more exist), this tab's tags (from
 * its own call backs only: tags are per tab), its open customers, and the ?callback focus (an open call back of
 * this tab; one older than the newest page is read on its own and added at the end).
 */
export async function loadCallBacks(
  userId: string,
  boardId: string,
  opts: { focus?: unknown; now: Date },
  db: CallBackDb = prismaCallBackDb
): Promise<CallBacksData> {
  const focusId = focusIdOf(opts.focus);
  const [listed, customers] = await Promise.all([db.list(userId, boardId, CALLBACK_LOAD_MAX + 1), db.customers(userId, boardId)]);
  const older = listed.length > CALLBACK_LOAD_MAX;
  const rows = listed.slice(0, CALLBACK_LOAD_MAX);
  let focus: string | null = null;
  if (focusId) {
    if (rows.some((r) => r.id === focusId)) focus = focusId;
    else {
      const one = await db.find(userId, focusId);
      if (one && one.boardId === boardId && !one.archivedAt) {
        rows.push(one);
        focus = focusId;
      }
    }
  }
  return {
    boardId,
    rows: rows.map(viewOf),
    older,
    recentTags: recentTagsOf(listed),
    crmOn: false,
    customers,
    focus,
    focusMissing: focusId != null && focus == null,
    nowIso: opts.now.toISOString(),
  };
}

/** The page's data once the tab is read: the customer list only where the tab keeps one. */
export function withCrm(data: CallBacksData, crmOn: boolean): CallBacksData {
  return { ...data, crmOn, customers: crmOn ? data.customers : [] };
}

// ── Writes ────────────────────────────────────────────────────────────────

async function openBoard(userId: string, boardId: string, db: CallBackDb): Promise<CallBackResult<{ crmOn: boolean }>> {
  if (!isBoardId(boardId)) return fail(WORK_BOARD_GONE);
  const board = await db.board(userId, boardId);
  if (!board) return fail(WORK_BOARD_GONE);
  if (board.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  return ok({ crmOn: board.crmOn });
}

/**
 * Adds (id null) or edits a call back on an open work tab. The order keeps a refusal free of writes: the tab,
 * the fields, the customer are checked first; then the task (new, renamed, or moved to the reminder's new day);
 * then the call back. A retry of a lost add carries the same `key`, so its task is found, not added twice.
 */
export async function saveCallBackCore(
  userId: string,
  boardId: string,
  id: string | null,
  raw: unknown,
  now: Date = new Date(),
  db: CallBackDb = prismaCallBackDb
): Promise<CallBackResult<CallBackView>> {
  const board = await openBoard(userId, boardId, db);
  if (!board.ok) return board;

  let prev: CallBackListRow | null = null;
  if (id != null) {
    if (!isBoardId(id)) return fail(CALLBACK_GONE);
    prev = await db.find(userId, id);
    if (!prev || prev.boardId !== boardId) return fail(CALLBACK_GONE);
    if (prev.archivedAt) return fail(CALLBACK_ARCHIVED);
  }

  const input = cleanCallBackInput(raw, now, prev?.remindAt ?? null);
  if (!input.ok) return input;
  const v = input.value;

  // The customer: unchanged keeps its link (even if since archived); a new ID must be an open customer of THIS tab.
  let customerId: string | null = null;
  if (v.customer) {
    const same = prev?.customer && prev.customer.number.trim().toLowerCase() === v.customer.toLowerCase();
    if (same) customerId = prev!.customer!.id;
    else {
      if (!board.value.crmOn) return fail(CUSTOMER_OFF);
      const found = await db.customerByNumber(userId, boardId, v.customer);
      if (!found) return fail(customerUnknown(v.customer));
      customerId = found.id;
    }
  }

  const patch = remindPatchOf(prev, v.remind ? { at: v.remind.at, action: v.remind.action } : null);
  const remindMoved = v.remind != null && "remindAt" in patch;
  const dueDay = v.remind ? reminderDayOf(v.remind.at) : null;

  // The task: on THIS board, never the game's.
  const liveTask = prev?.task && !prev.task.archived ? prev.task : null;
  let taskId: string | null = liveTask?.id ?? null;
  if (v.task) {
    if (liveTask) {
      if (liveTask.title !== v.task) await db.renameTask(userId, liveTask.id, v.task);
      if (remindMoved && dueDay && !liveTask.done) await db.moveTask(userId, liveTask.id, dueDay);
    } else {
      const created = await db.createTask(userId, { title: v.task, dueDay, boardId, key: v.key ? `cb:${v.key}` : null });
      taskId = created.id;
    }
  } else {
    // Cleared: the call back lets go of it; the task stays on the board (archive it there if it is not wanted).
    taskId = null;
  }

  let callBackId: string;
  if (prev) {
    const changed = await db.patch(userId, prev.id, { open: true }, { at: v.at, action: v.action, tags: v.tags, taskId, customerId, ...patch });
    if (changed === 0) return fail(CALLBACK_ARCHIVED);
    callBackId = prev.id;
  } else {
    const row = await db.insert({
      userId,
      boardId,
      at: v.at,
      action: v.action,
      tags: v.tags,
      taskId,
      customerId,
      remindAt: v.remind?.at ?? null,
      remindAction: v.remind?.action ?? null,
      remindSentAt: null,
    });
    callBackId = row.id;
  }
  invalidate("life");
  const saved = await db.find(userId, callBackId);
  return saved ? ok(viewOf(saved)) : fail(CALLBACK_GONE);
}

/** Archives a call back (its reminder goes quiet; its task stays on the board). Already archived: ok. */
export async function archiveCallBackCore(userId: string, id: string, now: Date = new Date(), db: CallBackDb = prismaCallBackDb): Promise<CallBackResult<{ id: string }>> {
  if (!isBoardId(id)) return fail(CALLBACK_GONE);
  const changed = await db.patch(userId, id, { open: true }, { archivedAt: now });
  if (changed === 0 && !(await db.find(userId, id))) return fail(CALLBACK_GONE);
  invalidate("life");
  return ok({ id });
}

/** Archive's Undo. Already open: ok. */
export async function restoreCallBackCore(userId: string, id: string, db: CallBackDb = prismaCallBackDb): Promise<CallBackResult<{ id: string }>> {
  if (!isBoardId(id)) return fail(CALLBACK_GONE);
  const row = await db.find(userId, id);
  if (!row) return fail(CALLBACK_GONE);
  const board = await db.board(userId, row.boardId);
  if (!board) return fail(WORK_BOARD_GONE);
  if (board.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  await db.patch(userId, id, { archived: true }, { archivedAt: null });
  invalidate("life");
  return ok({ id });
}

/** The reminder a 'Done' cleared, so its Undo can put it back exactly (ISO strings: it crosses the wire). */
export interface ReminderSnapshot {
  remindAt: string;
  remindAction: string | null;
  remindSentAt: string | null;
}

/**
 * 'Done' on an open reminder: the call back keeps its log, the reminder goes (the bell stops asking). Answers
 * what it cleared, for the Undo.
 */
export async function clearReminderCore(userId: string, id: string, db: CallBackDb = prismaCallBackDb): Promise<CallBackResult<ReminderSnapshot>> {
  if (!isBoardId(id)) return fail(CALLBACK_GONE);
  const row = await db.find(userId, id);
  if (!row || row.archivedAt) return fail(CALLBACK_GONE);
  if (!row.remindAt) return fail("That call back has no reminder.");
  await db.patch(userId, id, { open: true }, remindPatchOf(row, null));
  invalidate("life");
  return ok({ remindAt: row.remindAt.toISOString(), remindAction: row.remindAction, remindSentAt: row.remindSentAt ? row.remindSentAt.toISOString() : null });
}

/** The Undo of 'Done': the same reminder, sent stamp and all, only while the call back has none. */
export async function restoreReminderCore(userId: string, id: string, snap: unknown, db: CallBackDb = prismaCallBackDb): Promise<CallBackResult<{ id: string }>> {
  if (!isBoardId(id)) return fail(CALLBACK_GONE);
  const s = (snap && typeof snap === "object" ? snap : {}) as Record<string, unknown>;
  const at = typeof s.remindAt === "string" ? new Date(s.remindAt) : null;
  const sent = typeof s.remindSentAt === "string" ? new Date(s.remindSentAt) : null;
  if (!at || Number.isNaN(at.getTime()) || (sent && Number.isNaN(sent.getTime()))) return fail("Couldn't put that reminder back.");
  const changed = await db.patch(userId, id, { open: true, noReminder: true }, { remindAt: at, remindAction: actionOf(s.remindAction), remindSentAt: sent });
  if (changed === 0) return fail("That call back has another reminder now.");
  invalidate("life");
  return ok({ id });
}

// ── The bell ──────────────────────────────────────────────────────────────

/** The bell reads at most this many of each. */
const BELL_READ = 25;

/**
 * The bell's work reminders (notifications.ts): call backs whose reminder time has come, open, on an open tab,
 * whose task (if any) is neither done nor archived; customer tasks with a reminder, due, not done, not
 * archived, of an open customer on an open tab. Sent or not: the bell lists what is still open.
 */
export async function loadWorkReminderRows(userId: string, now: Date): Promise<{ callBacks: DueCallBackRow[]; customerTasks: DueCustomerTaskRow[] }> {
  const [callBacks, customerTasks] = await Promise.all([
    prisma.callBack.findMany({
      where: {
        userId,
        archivedAt: null,
        remindAt: { lte: now },
        board: { archivedAt: null },
        OR: [{ taskId: null }, { task: { is: { completedAt: null, archivedAt: null } } }],
      },
      select: { id: true, boardId: true, action: true, remindAction: true, tags: true, remindAt: true, task: { select: { title: true } }, board: { select: { name: true } } },
      orderBy: [{ remindAt: "asc" }, { id: "asc" }],
      take: BELL_READ,
    }),
    prisma.customerTask.findMany({
      where: {
        userId,
        remind: true,
        doneAt: null,
        archivedAt: null,
        dueAt: { lte: now },
        customer: { is: { archivedAt: null, board: { is: { archivedAt: null, crmOn: true } } } },
      },
      select: { id: true, title: true, dueAt: true, customer: { select: { id: true, number: true, name: true, boardId: true } } },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: BELL_READ,
    }),
  ]);
  return {
    callBacks: callBacks.map((c) => ({
      id: c.id,
      boardId: c.boardId,
      boardName: c.board.name,
      action: c.action,
      remindAction: c.remindAction,
      tags: c.tags ?? [],
      remindAt: c.remindAt as Date,
      taskTitle: c.task?.title ?? null,
    })),
    customerTasks: customerTasks.map((t) => ({
      id: t.id,
      boardId: t.customer.boardId,
      customerId: t.customer.id,
      customerName: t.customer.name,
      customerNumber: t.customer.number,
      title: t.title,
      dueAt: t.dueAt,
    })),
  };
}
