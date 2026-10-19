/**
 * Work tabs (2026-10-12): up to three boards beside the personal Board, each
 * with its own tasks, habits and musts, and its scheduled tasks (the Office workspace's Agenda). Pure:
 * the server (work-boards-server.ts, tasks.ts), the shell (nav.ts, the '+'),
 * the capture sheet and scripts/work-boards-check.ts all import it.
 *
 *   BoardScope               null = the personal Board (TaskTemplate.boardId null), else a WorkBoard id
 *   WORK_BOARD_CAP           3 open at once (slot 1..3; the database holds it too: a CHECK and a
 *                            partial unique index on (userId, slot) WHERE archivedAt IS NULL)
 *   freeSlotOf(open)         the lowest free slot, or null when all three are taken
 *   canAddWorkBoard(open)    a slot is free: the strip shows its '+'
 *   cleanWorkBoardName(raw)  trimmed, spaces collapsed, 1..24 characters, or the reason
 *   restoreSlotOf(...)       the slot an archived board comes back to (its own when free), or null
 *   workBoardHref / workBoardIdOf   /today/work/<id> (the tab's Agenda, its Office workspace's home) and back
 *   workTasksHref            /today/work/<id>/tasks: the tab's own board (its tasks, habits and musts)
 *   workKindRefusalOf(kind)  a work tab holds tasks and habits: goals and idea drafts stay personal
 *
 * Work is kept SEPARATE from the game (the user's choice): a work task pays no
 * life XP and writes no ledger row, so it never counts for the streak, kept
 * weeks, tracks, goals, quests, rituals, the Full day or the roadmap; every
 * reader of TaskTemplate or TaskInstance in the life economy reads the
 * personal Board only (PERSONAL_BOARD, boardId null). Archiving a work tab
 * frees its slot and keeps everything; Settings restores it.
 */

/** null: the personal Board. A string: a WorkBoard's id. */
export type BoardScope = string | null;

/** The personal Board's scope. */
export const PERSONAL_SCOPE: BoardScope = null;

/** At most this many work tabs open at once (slots 1..3). */
export const WORK_BOARD_CAP = 3;

/** A work tab's name: 1..24 characters after trimming. */
export const WORK_BOARD_NAME_MAX = 24;

/** The work board pages live under this path: /today/work/<id>. */
export const WORK_BOARD_PATH = "/today/work";

/**
 * The Prisma where fragment every life-economy reader of TaskTemplate adds
 * (and every TaskInstance reader adds as `template: PERSONAL_BOARD`): the
 * personal Board only. With no work board ever made, every row matches, so
 * the game reads exactly what it read before work tabs existed.
 */
export const PERSONAL_BOARD = { boardId: null } as const;

/** A board's where fragment: PERSONAL_BOARD, or one work board's. */
export function boardWhereOf(scope: BoardScope): { boardId: string | null } {
  return { boardId: scope ?? null };
}

/** A work tab as the strip, the page and Settings show it. */
export interface WorkBoardRef {
  id: string;
  name: string;
  slot: number;
}

/** An archived work tab, as Settings lists it. */
export interface ArchivedWorkBoard {
  id: string;
  name: string;
  /** When it was archived (ISO). */
  archivedAt: string;
}

export const WORK_BOARD_FULL = `You have ${WORK_BOARD_CAP} work tabs. Archive one to add another.`;
export const WORK_BOARD_RESTORE_FULL = `All ${WORK_BOARD_CAP} work tabs are in use. Archive one, then restore this one.`;
export const WORK_BOARD_NAME_EMPTY = "Give the work tab a name.";
export const WORK_BOARD_NAME_LONG = `Keep the name to ${WORK_BOARD_NAME_MAX} characters.`;
export const WORK_BOARD_GONE = "That work tab no longer exists.";
export const WORK_BOARD_ARCHIVED = "That work tab is archived. Restore it in Settings to use it again.";
export const WORK_BOARD_BUSY = "Another work tab was added at the same moment. Try again.";
/** A capture into a work tab that would make a goal or an idea draft. */
export const WORK_KIND_REFUSAL = "A work tab holds tasks and habits. Capture goals and ideas on your Board.";
/** A work task has no size: sizing prices XP, and work pays none. */
export const WORK_NO_SIZE = "A work task has no size: work pays no XP.";
/** A work inbox item cannot become a goal step or an idea draft. */
export const WORK_CLARIFY_REFUSAL = "On a work tab an item goes to Today, Tomorrow or Anytime, or is dropped.";

/** The lowest free slot (1..WORK_BOARD_CAP) among the open boards' slots, or null when all are taken. */
export function freeSlotOf(open: readonly { slot: number }[]): number | null {
  const taken = new Set(open.map((b) => b.slot));
  for (let s = 1; s <= WORK_BOARD_CAP; s++) if (!taken.has(s)) return s;
  return null;
}

/** Whether another work tab can be added: fewer than WORK_BOARD_CAP open (the strip's '+'). */
export function canAddWorkBoard(open: readonly { slot: number }[]): boolean {
  return freeSlotOf(open) !== null;
}

/**
 * The slot an archived board comes back to: its own when still free, else the
 * lowest free one; null when all three are taken (restore refused).
 */
export function restoreSlotOf(own: number, open: readonly { slot: number }[]): number | null {
  const free = freeSlotOf(open);
  if (free === null) return null;
  return open.some((b) => b.slot === own) || own < 1 || own > WORK_BOARD_CAP ? free : own;
}

/** A name as stored: trimmed, inner spaces collapsed, 1..WORK_BOARD_NAME_MAX characters; else why not. */
export function cleanWorkBoardName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, error: WORK_BOARD_NAME_EMPTY };
  if ([...name].length > WORK_BOARD_NAME_MAX) return { ok: false, error: WORK_BOARD_NAME_LONG };
  return { ok: true, name };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether a string can be a board id (what the page, the actions and the capture line accept). */
export function isBoardId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/** A work tab's home: its Agenda (the Office workspace, 2026-10-20). Every strip and old link lands here. */
export function workBoardHref(id: string): string {
  return `${WORK_BOARD_PATH}/${id}`;
}

/** A work tab's own board (its tasks, habits and musts): the workspace's Tasks page. */
export function workTasksHref(id: string): string {
  return `${WORK_BOARD_PATH}/${id}/tasks`;
}

/** The work board a path is on (/today/work/<id>, or deeper), or null. */
export function workBoardIdOf(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const m = /^\/today\/work\/([^/?#]+)(?:[/?#]|$)/.exec(pathname);
  return m && isBoardId(m[1]) ? m[1] : null;
}

/** A work tab takes tasks and habits only: why a capture of `kind` is refused there, or null. */
export function workKindRefusalOf(kind: string): string | null {
  return kind === "GOAL" || kind === "IDEA_DRAFT" ? WORK_KIND_REFUSAL : null;
}

/** The inbox choices a work tab offers (no 'goal', no 'idea'): today, tomorrow, anytime, drop. */
export function workClarifyAllowed(choice: string): boolean {
  return choice === "today" || choice === "tomorrow" || choice === "anytime" || choice === "drop";
}
