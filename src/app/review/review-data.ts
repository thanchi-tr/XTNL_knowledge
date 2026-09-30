/**
 * The review surface's ledger reads (server only; imported by the /review
 * page and the review actions, never by a client component).
 *
 *   readReviewDay(userId, day)   today's REVIEW count, the DAY_OPEN target and the streak units: ONE groupBy
 *   loadReviewDay(userId, day)   the same, cached under 'activity' (the hub)
 *   readIdeaHistory(userId, id)  one Idea's REVIEW and IDEA_CREATE rows, oldest first (the true facts)
 *   loadLastSeen(userId)         the life day each Idea was last reviewed, cached under 'activity'
 *
 * Every one is a single round trip, and the action issues its two inside the
 * same Promise.all as the Idea read, so answering a card still costs one read
 * wave before the write.
 */
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { dateColumn, dayKeyOf, keyOfDateColumn, type DayKey } from "@/lib/life-day";
import type { HistoryRow } from "@/lib/review-facts";

export interface ReviewDay {
  /** REVIEW rows today: the quest's progress (today-board.ts reads the same count). */
  reviews: number;
  /** The DAY_OPEN row's qty: the quest's fixed target, or null before the day's first open. */
  dayOpenQty: number | null;
  /** Net streak units today (+1 per counting row, −1 per UNDO): > 0 means the day is already kept. */
  streakUnits: number;
}

export async function readReviewDay(userId: string, day: DayKey): Promise<ReviewDay> {
  const rows = await prisma.activityEvent.groupBy({
    by: ["source", "countsForStreak"],
    where: { userId, day: dateColumn(day) },
    _count: { _all: true },
    _max: { qty: true },
  });
  let reviews = 0;
  let dayOpenQty: number | null = null;
  let streakUnits = 0;
  for (const r of rows) {
    const n = r._count._all;
    if (r.source === "REVIEW") reviews += n;
    if (r.source === "DAY_OPEN") dayOpenQty = r._max.qty ?? dayOpenQty;
    // The same CASE as streak.ts: a counting row adds one, an UNDO takes one back.
    if (r.countsForStreak) streakUnits += n;
    else if (r.source === "UNDO") streakUnits -= n;
  }
  return { reviews, dayOpenQty, streakUnits };
}

export function loadReviewDay(userId: string, day: DayKey): Promise<ReviewDay> {
  return cached(`reviewDay:${userId}:${day}`, ["activity"], () => readReviewDay(userId, day));
}

/** How far back an Idea's history is read: enough for every real gap, bounded for a card reviewed daily for years. */
const HISTORY_ROWS = 120;

export async function readIdeaHistory(userId: string, ideaId: string): Promise<HistoryRow[]> {
  const rows = await prisma.activityEvent.findMany({
    where: { userId, sourceId: ideaId, source: { in: ["REVIEW", "IDEA_CREATE"] } },
    orderBy: { occurredAt: "desc" },
    take: HISTORY_ROWS,
    select: { source: true, detail: true, day: true },
  });
  return rows.reverse().map((r) => ({ source: r.source, detail: r.detail, day: keyOfDateColumn(r.day) }));
}

export interface LastSeen {
  /** ideaId → the life day it was last reviewed. */
  byIdea: Record<string, DayKey>;
  /** Idea ids, most recently reviewed first (the hub's Recent). */
  recent: string[];
}

export function loadLastSeen(userId: string): Promise<LastSeen> {
  return cached(`reviewLastSeen:${userId}`, ["activity"], async () => {
    const rows = await prisma.activityEvent.groupBy({
      by: ["sourceId"],
      where: { userId, source: "REVIEW", sourceId: { not: null } },
      _max: { occurredAt: true },
    });
    const byIdea: Record<string, DayKey> = {};
    const stamped: { id: string; at: number }[] = [];
    for (const r of rows) {
      if (!r.sourceId || !r._max.occurredAt) continue;
      byIdea[r.sourceId] = dayKeyOf(r._max.occurredAt);
      stamped.push({ id: r.sourceId, at: r._max.occurredAt.getTime() });
    }
    stamped.sort((a, b) => b.at - a.at);
    return { byIdea, recent: stamped.slice(0, 12).map((s) => s.id) };
  });
}
