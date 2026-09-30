import { Prisma, type ActivityEvent } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate, type CacheTag } from "./cache";
import { dateColumn, dayKeyOf } from "./life-day";
import { TRACKS, type ActivityInput, type ActivitySource, type Sink, type Track } from "./life-types";
import { countsForStreakOf } from "./streak-curve";

/**
 * The life ledger's only writer.
 *
 * Every action a player takes lands in `ActivityEvent` once: a review, a new
 * Idea, an attestation, a Boss fight, a task. The daily streak, the Today
 * board's totals and (later) life levels are all read back from these rows,
 * so there is one account of what happened and nothing else to keep in step
 * with it. Rows are never edited; a correction is a new row.
 *
 * **Sinks keep knowledge from being paid twice.** A REVIEW or IDEA_CREATE row
 * records points srs.ts or ideas.ts has already credited to a Domain; its
 * sink is DOMAIN and nothing that sums life XP ever reads it. Life XP is only
 * ever SUM(xp) WHERE sink = 'TRACK'. NONE rows are records that pay nothing.
 *
 * Two ways in, for the two shapes of write path:
 *
 *   - `activityOp` returns the create un-awaited, to ride inside an existing
 *     `$transaction([...])` array next to the write it records — the same
 *     pattern as `mintReviewFractionOp` in mastery.ts. The row and the points
 *     it describes then commit or fail together.
 *   - `recordActivity` awaits the insert on its own, for writes made after
 *     the fact (usually inside `after()`), and is idempotent on `dedupeKey`.
 */

/** Where each source's XP counts when the writer does not say. */
export const DEFAULT_SINK: Record<ActivitySource, Sink> = {
  REVIEW: "DOMAIN",
  IDEA_CREATE: "DOMAIN",
  ATTESTATION: "NONE",
  BOSS: "NONE",
  LEGACY_DAY: "NONE",
  DAY_OPEN: "NONE",
  // A task pays life XP; its writer sets NONE when it pays 0 (#play,
  // study-linked, completed by a workout).
  TASK: "TRACK",
  UNDO: "TRACK",
  GOAL_PROGRESS: "NONE",
  REFLECTION: "NONE",
  FULL_DAY: "NONE",
  REPAIR: "NONE",
  FREEZE_EARN: "NONE",
  FREEZE_USE: "NONE",
  WEEK: "NONE",
  MP_MINT: "NONE",
  DEBT: "TRACK",
  DEBT_REPAID: "TRACK",
  DEBT_WRITTEN_OFF: "NONE",
  ADJUST: "TRACK",
  WORKOUT: "TRACK",
  PR: "TRACK",
  STEPS: "NONE",
};

/**
 * The knowledge side's own rows. The 'ideas' and 'knowledge' resets delete
 * these (and only these) so a wiped library leaves no reviews or ideas
 * behind in the history, while tasks and their XP survive.
 */
export const KNOWLEDGE_SOURCES: ActivitySource[] = [
  "REVIEW",
  "IDEA_CREATE",
  "ATTESTATION",
  "BOSS",
  "LEGACY_DAY",
  "DAY_OPEN",
];

const DETAIL_MAX = 500;

/** Finite or nothing: a NaN in a ledger row would poison every sum it joins. */
function finiteOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function isTrack(t: unknown): t is Track {
  return typeof t === "string" && (TRACKS as readonly string[]).includes(t);
}

/**
 * The row an input becomes. Exported for the backfill script, which writes
 * with `createMany` and must apply exactly the same defaults.
 *
 * The life day comes from `day` when the writer knows it (a completion
 * recorded for yesterday) and otherwise from when it happened, through the
 * one clock in life-day.ts.
 */
export function activityData(userId: string, e: ActivityInput): Prisma.ActivityEventUncheckedCreateInput {
  const occurredAt = e.occurredAt ?? new Date();
  const sink = e.sink ?? DEFAULT_SINK[e.source];
  let track: Track | null = null;
  if (sink === "TRACK") {
    // A TRACK row with no track would be XP that no level can ever count.
    if (!isTrack(e.track)) throw new Error(`A ${e.source} row paid to TRACK needs a track (got ${String(e.track)}).`);
    track = e.track;
  }
  return {
    userId,
    day: dateColumn(e.day ?? dayKeyOf(occurredAt)),
    occurredAt,
    source: e.source,
    sink,
    track,
    templateId: e.templateId ?? null,
    sourceId: e.sourceId ?? null,
    compositionKey: e.compositionKey ?? null,
    xp: finiteOrNull(e.xp) ?? 0,
    rawXp: finiteOrNull(e.rawXp),
    qty: finiteOrNull(e.qty),
    countsForStreak: countsForStreakOf(e.source, e.countsForStreak),
    receipt: e.receipt ? (e.receipt as unknown as Prisma.InputJsonValue) : undefined,
    detail: e.detail ? e.detail.slice(0, DETAIL_MAX) : null,
    dedupeKey: e.dedupeKey ?? null,
  };
}

/**
 * The cache tags a write of these rows makes stale. Every row changes the
 * streak and the day's totals ('activity'); a TRACK row also moves life XP
 * ('life'). Reviews stay on 'activity' alone, so answering a card never
 * throws away the progression cache.
 */
export function activityTags(...events: Pick<ActivityInput, "source" | "sink">[]): CacheTag[] {
  const trackWrite = events.some((e) => (e.sink ?? DEFAULT_SINK[e.source]) === "TRACK");
  return trackWrite ? ["activity", "life"] : ["activity"];
}

/** Invalidates what a write of these rows makes stale. Call it after the transaction commits. */
export function invalidateActivity(...events: Pick<ActivityInput, "source" | "sink">[]): void {
  invalidate(...activityTags(...events));
}

/**
 * The create, un-awaited, for a `$transaction([...])` array.
 *
 * It invalidates on the way in, which covers a caller that forgets; but a
 * read that lands between this call and the commit would cache the old
 * state, so callers also call `invalidateActivity` once the transaction has
 * resolved. (A Prisma op cannot carry its own post-commit hook: attaching a
 * `.then` would run it outside the transaction.)
 */
export function activityOp(userId: string, e: ActivityInput) {
  const data = activityData(userId, e);
  invalidateActivity(e);
  return prisma.activityEvent.create({ data });
}

/** True for the unique violation a repeated `dedupeKey` raises. */
export function isDuplicateActivity(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Inserts one row and waits for it.
 *
 * Idempotent on `dedupeKey`: a second write with the same key means the
 * thing was already recorded (a double tap, a retried after(), a re-run
 * backfill), so the row already stored is returned instead of an error.
 */
export async function recordActivity(userId: string, e: ActivityInput): Promise<ActivityEvent> {
  const data = activityData(userId, e);
  try {
    return await prisma.activityEvent.create({ data });
  } catch (err) {
    if (!e.dedupeKey || !isDuplicateActivity(err)) throw err;
    const existing = await prisma.activityEvent.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey: e.dedupeKey } },
    });
    if (!existing) throw err;
    return existing;
  } finally {
    invalidateActivity(e);
  }
}
