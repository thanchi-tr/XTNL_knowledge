/**
 * The review surface's ledger reads (server only; imported by the /review
 * page and the review actions, never by a client component).
 *
 *   readReviewDay(userId, day)   today's REVIEW count, the DAY_OPEN target and the streak units: ONE groupBy
 *   loadReviewDay(userId, day)   the same, cached under 'activity' (the hub)
 *   readIdeaHistory(userId, id)  one Idea's REVIEW and IDEA_CREATE rows, oldest first (the true facts)
 *   loadLastSeen(userId)         the life day each Idea was last reviewed, cached under 'activity'
 *   loadStudyFocusRows(userId)   the roadmap focus's rows (ruling N14); studyFocusFromRows assembles it
 *
 * Every one is a single round trip, and the action issues its two inside the
 * same Promise.all as the Idea read, so answering a card still costs one read
 * wave before the write.
 */
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import { dateColumn, dayKeyOf, keyOfDateColumn, type DayKey } from "@/lib/life-day";
import type { HistoryRow } from "@/lib/review-facts";
import { studyFocusOf, type StudyFocus } from "@/lib/roadmap-study";
import type { LayerMilestone } from "@/lib/roadmap-types";

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

/** The rows the hub's roadmap focus reads (ruling N14), fetched in the page's first wave; null with no accepted TOPICS goal. */
export interface StudyFocusRows {
  roadmap: { id: string; aim: string; label: string | null; version: number; fieldId: string | null; rating: unknown };
  topics: { key: string; layer: number; name: string; domainId: string | null; chosen: boolean; decision: string; skippedDay: Date | null; heldDay: Date | null }[];
  milestones: { layer: number | null; title: string; status: string; reachedDay: Date | null }[];
}

/**
 * The hub's roadmap focus rows: the first open TOPICS goal (lowest seat), its accepted map's topics and its layer
 * milestones (newest version first). Never throws: a failed read is no focus, never an error on the hub.
 */
export async function loadStudyFocusRows(userId: string): Promise<StudyFocusRows | null> {
  try {
    const roadmap = await prisma.roadmap.findFirst({
      where: { userId, status: "ACTIVE", planKind: "TOPICS" },
      orderBy: [{ slot: "asc" }, { updatedAt: "desc" }],
      select: { id: true, aim: true, label: true, version: true, fieldId: true, rating: true },
    });
    if (!roadmap) return null;
    const [topics, milestones] = await Promise.all([
      prisma.roadmapTopic.findMany({
        where: { roadmapId: roadmap.id, version: roadmap.version },
        orderBy: [{ layer: "asc" }, { createdAt: "asc" }],
        select: { key: true, layer: true, name: true, domainId: true, chosen: true, decision: true, skippedDay: true, heldDay: true },
      }),
      prisma.roadmapMilestone.findMany({
        where: { roadmapId: roadmap.id, chainRole: "LAYER", status: { in: ["PLANNED", "STARTING", "STARTED"] } },
        orderBy: [{ version: "desc" }],
        select: { layer: true, title: true, status: true, reachedDay: true },
      }),
    ]);
    return { roadmap, topics, milestones };
  } catch (err) {
    console.error("review: the roadmap focus wasn't read:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  }
}

/** The focus from its rows and the Field tree the page holds (the Domains' levels and due counts). Pure; never throws. */
export function studyFocusFromRows(
  rows: StudyFocusRows | null,
  fields: readonly { id: string; name: string; domains: readonly { id: string; name: string; level: number; ideas: readonly { dueDate: Date }[] }[] }[],
  isDue: (d: Date) => boolean
): StudyFocus | null {
  if (!rows) return null;
  const r = rows.roadmap;
  const field = fields.find((f) => f.id === r.fieldId) ?? null;
  const domains = fields.flatMap((f) => f.domains.map((d) => ({ id: d.id, name: d.name, level: d.level, cards: d.ideas.length, due: d.ideas.filter((i) => isDue(i.dueDate)).length })));
  // One row per layer: the newest version's.
  const seen = new Set<number>();
  const layerRows = rows.milestones.filter((m): m is typeof m & { layer: number } => {
    if (m.layer == null || seen.has(m.layer)) return false;
    seen.add(m.layer);
    return true;
  });
  const rating = r.rating && typeof r.rating === "object" && !Array.isArray(r.rating) ? (r.rating as { milestones?: unknown }) : null;
  const geminiMilestones = (Array.isArray(rating?.milestones) ? rating.milestones : []).filter(
    (m): m is LayerMilestone => !!m && typeof m === "object" && typeof (m as LayerMilestone).layer === "number" && typeof (m as LayerMilestone).title === "string"
  );
  return studyFocusOf({
    roadmapId: r.id,
    goal: r.label?.trim() || r.aim,
    fieldId: r.fieldId,
    fieldName: field?.name ?? null,
    topics: rows.topics.map((t) => ({ key: t.key, layer: t.layer, name: t.name, domainId: t.domainId, chosen: t.chosen, decision: t.decision, skipped: t.skippedDay != null, held: t.heldDay != null })),
    milestones: layerRows.map((m) => ({ layer: m.layer, title: m.title, status: m.status, reached: m.reachedDay != null })),
    geminiMilestones,
    domains,
  });
}
