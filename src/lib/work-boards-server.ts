/**
 * Work tabs on the server (2026-10-12; the rules are work-boards.ts):
 *
 *   listOpenWorkBoards(userId)          the open tabs by slot (cached under 'life'; the shell's strip reads it)
 *   listArchivedWorkBoards(userId)      the archived ones, newest first (Settings › Work tabs)
 *   loadWorkBoard(userId, id)           one tab, open or archived, or null (the work board page)
 *   createWorkBoardCore(userId, name)   the lowest free slot; a 4th is refused (WORK_BOARD_FULL)
 *   renameWorkBoardCore(userId, id, n)  an open tab only; 1..24 characters
 *   archiveWorkBoardCore(userId, id)    frees the slot, keeps every task (idempotent)
 *   restoreWorkBoardCore(userId, id)    only while a slot is free; its own slot when that is free
 *
 * Race-safe through the database: two adds that read the same free slot both
 * try it, and the partial unique index on (userId, slot) WHERE archivedAt IS
 * NULL lets one in; the other's P2002 re-reads and takes the next slot (or is
 * refused once all three are taken). A restore does the same. Every core
 * takes a WorkBoardDb, so scripts/work-boards-check.ts runs them against an
 * in-memory one that keeps the same index.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import {
  WORK_BOARD_ARCHIVED,
  WORK_BOARD_BUSY,
  WORK_BOARD_FULL,
  WORK_BOARD_GONE,
  WORK_BOARD_RESTORE_FULL,
  cleanWorkBoardName,
  freeSlotOf,
  isBoardId,
  restoreSlotOf,
  type ArchivedWorkBoard,
  type WorkBoardRef,
} from "./work-boards";

export type WorkBoardResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): WorkBoardResult<T> => ({ ok: true, value });
const fail = <T>(error: string): WorkBoardResult<T> => ({ ok: false, error });

/** A WorkBoard row as the cores read it. */
export interface WorkBoardRow {
  id: string;
  name: string;
  slot: number;
  archivedAt: Date | null;
  /** The tab keeps a customer list (customers, migration 20261218000000). Absent in the checks' table: false. */
  crmOn?: boolean;
}

/** The writes and reads the cores make: Prisma in the app, an in-memory table in the checks. */
export interface WorkBoardDb {
  /** The open boards (archivedAt null), any order. */
  listOpen(userId: string): Promise<WorkBoardRow[]>;
  find(userId: string, id: string): Promise<WorkBoardRow | null>;
  /** Inserts an open board in `slot`; throws a P2002 when the slot is taken by an open board. */
  create(userId: string, name: string, slot: number): Promise<WorkBoardRow>;
  /** Renames an open board; the number of rows changed (0 or 1). */
  rename(userId: string, id: string, name: string): Promise<number>;
  /** Archives an open board at `at`; the number of rows changed. */
  archive(userId: string, id: string, at: Date): Promise<number>;
  /** Re-opens an archived board in `slot`; the number of rows changed. Throws a P2002 when the slot is taken. */
  restore(userId: string, id: string, slot: number): Promise<number>;
}

const SELECT = { id: true, name: true, slot: true, archivedAt: true, crmOn: true } as const;

/** The app's WorkBoardDb. */
export const prismaWorkBoardDb: WorkBoardDb = {
  listOpen: (userId) => prisma.workBoard.findMany({ where: { userId, archivedAt: null }, select: SELECT, orderBy: { slot: "asc" } }),
  find: (userId, id) => prisma.workBoard.findFirst({ where: { id, userId }, select: SELECT }),
  create: (userId, name, slot) => prisma.workBoard.create({ data: { userId, name, slot }, select: SELECT }),
  rename: async (userId, id, name) => (await prisma.workBoard.updateMany({ where: { id, userId, archivedAt: null }, data: { name } })).count,
  archive: async (userId, id, at) => (await prisma.workBoard.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: at } })).count,
  restore: async (userId, id, slot) => (await prisma.workBoard.updateMany({ where: { id, userId, archivedAt: { not: null } }, data: { archivedAt: null, slot } })).count,
};

/** A unique violation: here, the partial index on open slots (another add or restore took the slot first). */
export function isSlotTaken(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code === "P2002";
  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  if (code === "P2002" || code === "23505") return true;
  const message = err instanceof Error ? err.message : "";
  return /WorkBoard_userId_slot_open_key|unique constraint/i.test(message);
}

const refOf = (r: WorkBoardRow): WorkBoardRef => ({ id: r.id, name: r.name, slot: r.slot });

/** Tries a slot write this many times: each P2002 means another write took the slot, so the open set is read again. */
const SLOT_ATTEMPTS = 3;

/** The open tabs, by slot. Cached under 'life', which every work board write clears. */
export function listOpenWorkBoards(userId: string, db: WorkBoardDb = prismaWorkBoardDb): Promise<WorkBoardRef[]> {
  const load = async () => (await db.listOpen(userId)).map(refOf).sort((a, b) => a.slot - b.slot);
  return db === prismaWorkBoardDb ? cached(`workBoards:${userId}`, ["life"], load) : load();
}

/** The archived tabs, newest first (Settings › Work tabs). */
export async function listArchivedWorkBoards(userId: string): Promise<ArchivedWorkBoard[]> {
  const rows = await prisma.workBoard.findMany({
    where: { userId, archivedAt: { not: null } },
    select: { id: true, name: true, archivedAt: true },
    orderBy: { archivedAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({ id: r.id, name: r.name, archivedAt: (r.archivedAt as Date).toISOString() }));
}

/** One tab, open or archived, or null (a malformed or foreign id reads as none). */
export async function loadWorkBoard(userId: string, id: string, db: WorkBoardDb = prismaWorkBoardDb): Promise<(WorkBoardRef & { archived: boolean; crmOn: boolean }) | null> {
  if (!isBoardId(id)) return null;
  const row = await db.find(userId, id);
  return row ? { ...refOf(row), archived: row.archivedAt != null, crmOn: row.crmOn ?? false } : null;
}

/**
 * Adds a work tab in the lowest free slot. A 4th open tab is refused with
 * WORK_BOARD_FULL. Two adds racing for one slot: the index lets one in, and
 * the other re-reads and takes the next free slot (or is refused when none
 * is left). Nothing else changes: a new tab starts empty.
 */
export async function createWorkBoardCore(userId: string, rawName: unknown, db: WorkBoardDb = prismaWorkBoardDb): Promise<WorkBoardResult<WorkBoardRef>> {
  const name = cleanWorkBoardName(rawName);
  if (!name.ok) return fail(name.error);
  for (let attempt = 1; attempt <= SLOT_ATTEMPTS; attempt++) {
    const slot = freeSlotOf(await db.listOpen(userId));
    if (slot === null) return fail(WORK_BOARD_FULL);
    try {
      const row = await db.create(userId, name.name, slot);
      invalidate("life");
      return ok(refOf(row));
    } catch (err) {
      if (!isSlotTaken(err)) throw err;
    }
  }
  return fail(WORK_BOARD_BUSY);
}

/** Renames an open tab (1..24 characters). An archived tab is restored before it is renamed. */
export async function renameWorkBoardCore(userId: string, id: string, rawName: unknown, db: WorkBoardDb = prismaWorkBoardDb): Promise<WorkBoardResult<WorkBoardRef>> {
  if (!isBoardId(id)) return fail(WORK_BOARD_GONE);
  const name = cleanWorkBoardName(rawName);
  if (!name.ok) return fail(name.error);
  const changed = await db.rename(userId, id, name.name);
  const row = await db.find(userId, id);
  if (!row) return fail(WORK_BOARD_GONE);
  if (changed === 0 && row.archivedAt) return fail(WORK_BOARD_ARCHIVED);
  invalidate("life");
  return ok(refOf(row));
}

/**
 * Archives a tab: its slot is free at once, and every task, habit and
 * instance on it stays (nothing is deleted; Settings restores it). Already
 * archived: ok, nothing changes.
 */
export async function archiveWorkBoardCore(userId: string, id: string, now: Date = new Date(), db: WorkBoardDb = prismaWorkBoardDb): Promise<WorkBoardResult<{ id: string }>> {
  if (!isBoardId(id)) return fail(WORK_BOARD_GONE);
  const changed = await db.archive(userId, id, now);
  if (changed === 0) {
    const row = await db.find(userId, id);
    if (!row) return fail(WORK_BOARD_GONE);
  }
  invalidate("life");
  return ok({ id });
}

/**
 * Restores an archived tab, only while a slot is free (WORK_BOARD_RESTORE_FULL
 * otherwise): its own slot when that is still free, else the lowest free one.
 * Already open: ok. A race for the slot re-reads, as an add does.
 */
export async function restoreWorkBoardCore(userId: string, id: string, db: WorkBoardDb = prismaWorkBoardDb): Promise<WorkBoardResult<WorkBoardRef>> {
  if (!isBoardId(id)) return fail(WORK_BOARD_GONE);
  const row = await db.find(userId, id);
  if (!row) return fail(WORK_BOARD_GONE);
  if (!row.archivedAt) return ok(refOf(row));
  for (let attempt = 1; attempt <= SLOT_ATTEMPTS; attempt++) {
    const slot = restoreSlotOf(row.slot, await db.listOpen(userId));
    if (slot === null) return fail(WORK_BOARD_RESTORE_FULL);
    try {
      const changed = await db.restore(userId, id, slot);
      invalidate("life");
      if (changed === 0) {
        const now = await db.find(userId, id);
        return now && !now.archivedAt ? ok(refOf(now)) : fail(WORK_BOARD_GONE);
      }
      return ok({ id: row.id, name: row.name, slot });
    } catch (err) {
      if (!isSlotTaken(err)) throw err;
    }
  }
  return fail(WORK_BOARD_BUSY);
}
