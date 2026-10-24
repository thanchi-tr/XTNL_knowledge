/**
 * Blueprint P6 (decision D33): a done-now line ('x gym 45m') that names a row on today's personal Board ticks that row,
 * instead of saving a second one-off beside it (the silent duplicate this fixes). Pure and client-importable: the
 * capture sheet's chip ('Ticks: Gym (Habits)') and the server's own write (tasks.ts tickNamedRowCore) read the same
 * rule over the same list (tasks.ts activeTitlesOf, the sheet's 'Already on your board' list), so the chip says what
 * lands.
 *
 *   - Which lines: a plain done-now task line (doneNowAsksTick): 'x', 'did' or 'done', no schedule (a line with one
 *     defines a habit), no Inbox mark, no '#side', no study or pages link. Its Must, day, goal and tags shape a new row
 *     only, so they never stop the match.
 *   - Which rows (doneNowTickOf): a TASK or a HABIT on today's open lanes (Must, Planned, Habits, Anytime), never in
 *     the Inbox, never one that completes itself or counts pages (autoMetric), never deferred now, never on a work
 *     tab (the list is the personal Board's own read). A row ticked today already is matched too ('done'): its tick
 *     stands and nothing is written or paid again, so a resent line (a lost answer, the phone's queue replaying its
 *     clientId) writes once.
 *   - One tap on the chip turns the line back into a new task (the sheet sends it `asNew`), as before P6.
 *
 * Nothing here prices anything: the tick is the board's own (completeInstanceCore), with the line's minutes.
 */
import type { BoardPlace, ParsedCapture, PlaceLane } from "./life-types";
import { isDeferredNow } from "./task-decisions";
import { PLACE_DONE_TODAY, type BoardTemplate } from "./today-board";

/** What a row offers a done-now line: open on today's lanes ('open': the tick), or ticked today already ('done'). */
export type DoneNowTick = "open" | "done";

/** The lanes a row is open on today (today-board placementOf), the ones wherePreviewOf reads as 'Done today' after a tick. */
export const DONE_NOW_LANES: readonly PlaceLane[] = ["must", "habits", "planned", "anytime"];

/**
 * What a done-now line's tick did (CreatedTask.ticked, CapturedItem.ticked): the lane the row was ticked from
 * ('Habits'; 'Done today' when it was ticked already), the tick's instance (the sheet's Undo takes the tick back,
 * never the row), and `earlier` when the row was ticked today already, so nothing was written.
 */
export interface TickedRow {
  from: string;
  instanceId: string;
  earlier?: true;
}

/** Whether the line asks to tick a row it names (see the header): a plain done-now task line. */
export function doneNowAsksTick(parsed: Pick<ParsedCapture, "doneNow" | "mode" | "kind" | "recurrence" | "inbox" | "side" | "autoMetric" | "title">): boolean {
  return (
    parsed.doneNow &&
    parsed.mode === "TASK" &&
    parsed.kind === "TASK" &&
    parsed.recurrence == null &&
    !parsed.inbox &&
    !parsed.side &&
    parsed.autoMetric == null &&
    !!parsed.title.trim()
  );
}

/**
 * What a row offers a done-now line, by its place on today's board (today-board placementOf), or null: it is never
 * ticked by a line. `nowMs`: the clock a deferral is read against (absent: any deferUntil the read kept still hides it).
 */
export function doneNowTickOf(
  t: Pick<BoardTemplate, "kind" | "inbox" | "autoMetric"> & { deferUntil?: string | null; boardId?: string | null },
  place: BoardPlace,
  nowMs?: number | null
): DoneNowTick | null {
  if (t.kind !== "TASK" && t.kind !== "HABIT") return null;
  if (t.inbox || t.autoMetric != null || t.boardId || isDeferredNow(t, nowMs)) return null;
  if (DONE_NOW_LANES.includes(place.lane)) return "open";
  if (place.lane === PLACE_DONE_TODAY.lane && place.label === PLACE_DONE_TODAY.label) return "done";
  return null;
}

/** An open title as both sides list it: its normalised title, its title, its place and what it offers a done-now line. */
export interface DoneNowCandidate {
  normTitle: string;
  title: string;
  where: BoardPlace;
  tick?: DoneNowTick | null;
}

/**
 * The row a done-now line ticks, or null (the line is saved as a new one-off, as before). Equality on the normalised
 * title only (normTitleOf, as the duplicate note), among the rows that offer a tick; an open row before one ticked
 * already, a must before a habit before a planned row before an Anytime one, then the list's own order (newest first).
 * `norm` is normTitleOf(parsed.title), passed in so this module needs no lexicon. Never on a work tab (`work`), and
 * never for a line the user turned back into a new task.
 */
export function doneNowMatchOf<T extends DoneNowCandidate>(
  parsed: Parameters<typeof doneNowAsksTick>[0],
  norm: string,
  active: readonly T[],
  opts: { work?: boolean; asNew?: boolean } = {}
): T | null {
  if (opts.work || opts.asNew || !norm || !doneNowAsksTick(parsed)) return null;
  const rank = (a: T) => (a.tick === "open" ? DONE_NOW_LANES.indexOf(a.where.lane) : DONE_NOW_LANES.length);
  let best: T | null = null;
  for (const a of active) {
    if (a.normTitle !== norm || !a.tick) continue;
    if (!best || rank(a) < rank(best)) best = a;
  }
  return best;
}

/**
 * The sheet's chip for a match in its three parts: what it does ('Ticks:', 'Already ticked:'), the row's title and its
 * lane ('(Habits)'). The chip draws them apart so a long title is the part cut short, never the lane (P6 review).
 */
export function doneNowChipParts(m: Pick<DoneNowCandidate, "title" | "where" | "tick">): { lead: string; title: string; lane: string } {
  return { lead: m.tick === "done" ? "Already ticked:" : "Ticks:", title: m.title, lane: `(${m.where.label})` };
}

/** The sheet's chip for a match: 'Ticks: Gym (Habits)', or 'Already ticked: Gym (Done today)'. */
export function doneNowChipOf(m: Pick<DoneNowCandidate, "title" | "where" | "tick">): string {
  const p = doneNowChipParts(m);
  return `${p.lead} ${p.title} ${p.lane}`;
}

/** What tapping the chip does, for its title and accessible name. */
export const DONE_NOW_AS_NEW = "Tap to add it as a new task instead";

/**
 * The refusal when the named row's tick is refused (nothing is written; the line is kept to fix): the board's own
 * reason, after the row it names. A deep-work row's missing minutes (P23's gate) says how to give them on the line.
 */
export function doneNowRefusalOf(title: string, from: string, error: string, minutesRefusal: string): string {
  if (error === minutesRefusal) return `Not ticked: ${title} (${from}) counts its time. Add its minutes to the line, like 45m, or tick it on Today.`;
  return `Not ticked: ${title} (${from}). ${error}`;
}
