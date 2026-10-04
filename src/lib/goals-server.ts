/**
 * Goals, server half (M5 lane A, F6): read what a close needs, close and pay
 * once, reschedule, the You sheet's ladder, and the launch's goalMp backfill.
 * Server only. The rules are pure in goals.ts (goalProgress, closeDecision);
 * this file reads and writes, and decides nothing on its own.
 *
 * Spec: docs/life-plan/m5-refit.md F6; contract: docs/life-plan/m5-contracts.md §7.
 *
 *   readGoalCloseInput(userId, goalId, now, deps?) → GoalInput | null (one round trip; a ROADMAP goal
 *                                              adds one read of its stored series)
 *   closeGoalCore(userId, goalId, now)       → {ok, payout} | {ok: false, error} ('Already closed.' on a replay); refused before launch
 *   prepareRoadmapGoalClose(userId, goalId, now) → the close preview's input, a ROADMAP goal's
 *                                              readings recorded first (live and labelled with writes off)
 *   loadGoalLineages(userId, goalIds)        → each ROADMAP goal's milestone lineage (fix round)
 *   rescheduleGoalCore(userId, goalId, day)  → {ok} | {ok: false, error}
 *   loadGoalLadder(userId, now?)             → GoalLadder, cached 'goalLadder:<user>' on ['life', 'activity', 'roadmap', 'ideas']
 *   loadGoalLadderUncached(userId, now, deps?) → the same, uncached (for checks that inject the roadmap reads)
 *   stateGoalMp(userId)                      → rows updated (the launch script)
 *
 * scripts/goals-close-check.ts pins this file's roadmap behaviour (lane L's
 * check): every Prisma entry a spy, the roadmap reads injected (GoalCloseDeps,
 * GoalSeriesLoader, GoalLadderDeps).
 *
 * ROADMAP goals (roadmap milestones; docs/life-plan/roadmap.md F10, F16 seam
 * 2, lane L): g is read from the milestone's stored readings, never a live
 * value. The preview first records today's readings (prepareRoadmapGoalClose);
 * the close computes them again (readingOpsFor with `closing`), writes them
 * inside its own transaction and pays from exactly those values, confirming
 * or clearing a pending reach in the same transaction with R1's guarded
 * reach ops. A server with writes off (lifeWritesEnabled) refuses the close,
 * so a dev server sharing the database never mints; its preview shows the
 * live values as "not recorded on this server".
 *
 * The fix round (roadmap-contracts.md §9.4 items 1 to 4):
 *   - Only a final refusal (no milestone, an archived or draft roadmap, a
 *     missing table, a superseded row) closes the goal unmeasured: g null,
 *     pays 0. Any other failure to work out the readings refuses the close
 *     with GOAL_CLOSE_RETRY and writes nothing; the preview throws.
 *   - One due day: milestoneDueDayOf(the milestone's, the goal's).
 *   - The g the close pays from must be the g R1 judged its reach on; if
 *     they differ the close is refused (GOAL_CLOSE_RETRY), never paid.
 *   - At most one goal of a milestone lineage pays: a superseded row
 *     (isSupersededRow) is never measured, a lineage another goal already
 *     paid pays 0 (goals.ts lineagePaidOn), and a paying close's transaction
 *     re-checks the lineage after the life-mint lock.
 *
 * House rules kept here: closing is explicit and final; one close writes
 * exactly one 'mp:GOAL:<id>' decision row (qty = MP paid, 0 allowed), sink
 * NONE, never a TRACK row; the row's dedupe key is the lock, so a double tap
 * or two devices pay once; nothing pays before launch (closeDecision's first
 * gate); horizon and goalMp never change after creation.
 *
 * Two different goals closed at once (M5 review C3): the limits (2 Shorts a
 * life week, 2 Mids in 30 days, 1 Long in 91) and the Short share of the 8 MP
 * cap are decided from a read made before the write. So a paying close's
 * array opens with the life-mint advisory lock (the week judge takes it too)
 * and a guard that re-counts exactly what the decision counted
 * (goals.ts goalLimitWindow) and divides by zero when another write changed
 * it: the close is refused with 'Something changed; try again.' and pays
 * nothing. Closes are serial per player; each is decided against every one
 * committed before it.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { isDuplicateActivity } from "./activity";
import { mintLifeMasteryOps } from "./mastery";
import { addDays, dateColumn, dayKeyOf, dayStartOf, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import {
  CAPPED_REASONS,
  GOAL_MINT_PREFIX,
  MINT_DETAIL_SEP,
  goalIdOfMintKey,
  goalMintKey,
  isCappedReason,
  isDayKey,
  isLaunched,
  lifeLaunchDay,
  lifeWritesEnabled,
  parseMintDetail,
  round2,
  statedGoalMp,
} from "./life-economy";
import { isTrack } from "./life-grade";
import { isStaleGuard, lifeMintLockOp } from "./life-tracks-server";
import {
  GOAL_ALREADY_CLOSED,
  closeDecision,
  closedGoalReading,
  goalAsOf,
  goalCloseMint,
  goalDepthAdded,
  goalLimitWindow,
  goalProgress,
  goalProgressLabel,
  lineagePaidOnOf,
  statedPayoutLine,
  type GoalInput,
  type GoalLadder,
  type GoalLadderItem,
  type GoalLimitWindow,
  type GoalMintRow,
  type GoalPayout,
  type GoalProgressRow,
  type GoalStep,
  type RoadmapGoalEntry,
  type RoadmapSeriesPoint,
} from "./goals";
import { KR_METRICS, type Horizon, type KrMetric, type Track } from "./life-types";
import { loadRoadmapGoalSeries, readingOpsFor, type ReadingOps, type ReadingRow } from "./roadmap-readings";
import { NOT_RECORDED_HERE, ROADMAP_WRITES_OFF, isMissingRoadmapTable, isSupersededRow, milestoneDueDayOf, type RoadmapWriteOpts } from "./roadmap-types";

const HORIZONS: readonly Horizon[] = ["SHORT", "MID", "LONG"];

/** A stored horizon; none reads as MID, as the Today board files it. */
const horizonOf = (h: string | null): Horizon => (HORIZONS.includes(h as Horizon) ? (h as Horizon) : "MID");
/** A stored metric through the one whitelist (life-types KR_METRICS), so 'ROADMAP' never reads as CHILDREN. */
const metricOf = (m: string | null): KrMetric | null => (KR_METRICS.includes(m as KrMetric) ? (m as KrMetric) : null);
/** A goal's stored track; an unreadable one reads as DUTY rather than failing the close. */
const trackOf = (t: string | null): Track => (isTrack(t) ? t : "DUTY");

/** Goal decision rows ('mp:GOAL:*') as goals.ts reads them. */
function goalMintRows(
  rows: readonly { dedupeKey: string | null; templateId: string | null; track: string | null; day: Date; occurredAt: Date; qty: number | null; detail: string | null }[]
): GoalMintRow[] {
  const out: GoalMintRow[] = [];
  for (const r of rows) {
    if (!r.dedupeKey || goalIdOfMintKey(r.dedupeKey) === null) continue;
    out.push({
      key: r.dedupeKey,
      templateId: r.templateId,
      track: isTrack(r.track) ? r.track : null,
      reason: parseMintDetail(r.detail).reason,
      day: keyOfDateColumn(r.day),
      qty: r.qty ?? 0,
      occurredAt: r.occurredAt.getTime(),
    });
  }
  return out;
}

/** Σ capped MP (CAPPED_REASONS) among MP_MINT rows. */
function cappedSum(rows: readonly { qty: number | null; detail: string | null }[]): number {
  let used = 0;
  for (const r of rows) if (isCappedReason(parseMintDetail(r.detail).reason) && (r.qty ?? 0) > 0) used += r.qty ?? 0;
  return round2(used);
}

const MINT_SELECT = { dedupeKey: true, templateId: true, track: true, day: true, occurredAt: true, qty: true, detail: true } as const;

/** The error a close gets when its guard finds the limits or the cap moved since its read. */
export const GOAL_CLOSE_STALE = "Something changed; try again.";

/** The error a close gets before launch (LIFE_LAUNCH_DAY null or still ahead). */
export const GOAL_CLOSE_BEFORE_LAUNCH = "Goals can be closed once life counts.";

/**
 * The error a ROADMAP close gets when its milestone's readings could not be
 * worked out now (a database or code failure, a refusal that is not final,
 * or a g that disagrees with the reach R1 judged): nothing is written, and
 * trying again decides it afresh. Never "closed at 0": that is only for a
 * final refusal (roadmap-contracts.md §9.4 item 1).
 */
export const GOAL_CLOSE_RETRY = "Couldn't close; try again.";

/**
 * Fails the close's transaction (division by zero) unless, after the
 * life-mint lock, the paying rows of this goal's reason in its limit window
 * (its own row excluded) still number what closeDecision counted and, for a
 * SHORT, the capped MP of the close day's life week (its own row excluded
 * too) is still what it read. The same filters as the read: MP_MINT rows,
 * 'mp:GOAL:*' keys, qty > 0, the reason before ' · ' in detail.
 *
 * Both sums leave out the goal's own 'mp:GOAL:<id>' row, exactly: the read
 * was made while the goal was open, so it never held that row. A second
 * close of the same goal racing the first (two devices, a double tap) then
 * passes the guard and meets the row's dedupe key: P2002, 'Already closed.',
 * not 'Something changed; try again.'.
 */
function closeGuardOp(userId: string, goalId: string, w: GoalLimitWindow) {
  const cappedStill = w.cappedWeek
    ? Prisma.sql`AND ROUND(COALESCE((SELECT SUM("qty") FROM "ActivityEvent"
          WHERE "userId" = ${userId} AND "source" = 'MP_MINT' AND "qty" > 0
            AND split_part("detail", ${MINT_DETAIL_SEP}, 1) IN (${Prisma.join([...CAPPED_REASONS])})
            AND "dedupeKey" IS DISTINCT FROM ${goalMintKey(goalId)}
            AND "day" >= ${w.cappedWeek.monday}::date AND "day" <= ${w.cappedWeek.sunday}::date), 0)::numeric, 2)
        = ROUND(${w.cappedWeek.used}::numeric, 2)`
    : Prisma.empty;
  return prisma.$executeRaw`
    SELECT 1 / (CASE WHEN
      (SELECT COUNT(*) FROM "ActivityEvent"
        WHERE "userId" = ${userId} AND "source" = 'MP_MINT' AND "dedupeKey" LIKE ${`${GOAL_MINT_PREFIX}%`}
          AND "dedupeKey" <> ${goalMintKey(goalId)} AND "qty" > 0
          AND split_part("detail", ${MINT_DETAIL_SEP}, 1) = ${w.reason}
          AND "day" >= ${w.from}::date AND "day" <= ${w.to}::date) = ${w.paying}::int
      ${cappedStill}
    THEN 1 ELSE 0 END)
  `;
}

/**
 * The stored series of open ROADMAP goals, keyed by goal id: roadmap-readings
 * loadRoadmapGoalSeries by default. Checks inject a fixture (no database).
 */
export type GoalSeriesLoader = (userId: string, goalIds: readonly string[], today: DayKey) => Promise<Record<string, RoadmapGoalEntry>>;

/**
 * Everything closeDecision needs for one open goal, fresh, in one round trip:
 * the goal (own user, kind GOAL, not archived, not closed), its one-off steps
 * (non-recurring, non-goal, non-archived children), Σ GOAL_PROGRESS by day,
 * the goal decision rows (every one dated in the last 91 days plus every
 * paying one, which covers this track's depth), and the capped MP already in
 * the close day's life week. Null when the goal is not open. A ROADMAP goal
 * also carries its milestone's stored series (`readings`), read once more
 * (`deps.series`, loadRoadmapGoalSeries by default) only for such a goal; a
 * goal whose roadmap a reset archived has none, so its g is null and it pays
 * 0, "not measured".
 */
export async function readGoalCloseInput(userId: string, goalId: string, now: Date, deps: { series?: GoalSeriesLoader } = {}): Promise<GoalInput | null> {
  const today = todayKey(now);
  const monday = weekStartKeyOf(today);
  const [goal, steps, progress, mints, week] = await Promise.all([
    prisma.taskTemplate.findFirst({
      where: { id: goalId, userId, kind: "GOAL", archivedAt: null, closedScore: null },
      select: { id: true, track: true, horizon: true, goalMp: true, krMetric: true, krTarget: true, dueDay: true, createdAt: true },
    }),
    prisma.taskTemplate.findMany({
      where: { userId, parentId: goalId, archivedAt: null, recurrence: null, kind: { not: "GOAL" } },
      select: { completedAt: true },
    }),
    prisma.activityEvent.groupBy({ by: ["day"], where: { userId, source: "GOAL_PROGRESS", templateId: goalId }, _sum: { qty: true } }),
    prisma.activityEvent.findMany({
      where: {
        userId,
        source: "MP_MINT",
        dedupeKey: { startsWith: GOAL_MINT_PREFIX },
        OR: [{ day: { gt: dateColumn(addDays(today, -91)) } }, { qty: { gt: 0 } }],
      },
      select: MINT_SELECT,
    }),
    prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", day: { gte: dateColumn(monday), lte: dateColumn(addDays(monday, 6)) } },
      select: { qty: true, detail: true },
    }),
  ]);
  if (!goal) return null;
  const krMetric = metricOf(goal.krMetric);
  const readings = krMetric === "ROADMAP" ? ((await (deps.series ?? loadRoadmapGoalSeries)(userId, [goal.id], today))[goal.id]?.series ?? []) : null;
  return {
    id: goal.id,
    horizon: horizonOf(goal.horizon),
    track: trackOf(goal.track),
    goalMp: goal.goalMp,
    krMetric,
    krTarget: goal.krTarget,
    steps: steps.map((s): GoalStep => ({ completedDay: s.completedAt ? dayKeyOf(s.completedAt) : null })),
    progress: progress.map((p): GoalProgressRow => ({ day: keyOfDateColumn(p.day), qty: p._sum.qty ?? 0 })),
    ...(readings ? { readings } : {}),
    dueDay: goal.dueDay ? keyOfDateColumn(goal.dueDay) : null,
    createdDay: dayKeyOf(goal.createdAt),
    today,
    launchDay: lifeLaunchDay(),
    goalMints: goalMintRows(mints),
    cappedUsedThisWeek: cappedSum(week),
  };
}

/** A ROADMAP goal's milestone lineage, as the close and the ladder read it (fix round). */
export interface GoalLineage {
  /** The milestone's own due day: milestoneDueDayOf falls back to it when the goal has none. */
  milestoneDueDay: DayKey | null;
  /** The other goals of its lineage (a dropped milestone and its "Start again" copy share one lineageId). */
  otherGoalIds: string[];
  /** A newer STARTING or STARTED row of its lineage replaced it (roadmap-types isSupersededRow): never measured, pays 0. */
  superseded: boolean;
}

/** The refusal that leaves a superseded milestone's goal unmeasured (R1's words for the same rule). */
const SUPERSEDED_REASON = "replaced by Start again";

/**
 * Each ROADMAP goal's milestone lineage, keyed by goal id, in two queries
 * made only for such goals: the milestones holding these goals (the user's
 * roadmaps only), then every row of their lineages. A goal with no milestone
 * is left out; a missing roadmap table reads as {} (isMissingRoadmapTable).
 */
export async function loadGoalLineages(userId: string, goalIds: readonly string[]): Promise<Record<string, GoalLineage>> {
  const ids = Array.from(new Set(goalIds));
  if (ids.length === 0) return {};
  try {
    const own = await prisma.roadmapMilestone.findMany({
      where: { goalId: { in: ids }, roadmap: { userId } },
      select: { goalId: true, roadmapId: true, lineageId: true, dueDay: true },
    });
    if (own.length === 0) return {};
    const rows = await prisma.roadmapMilestone.findMany({
      where: { OR: own.map((o) => ({ roadmapId: o.roadmapId, lineageId: o.lineageId })) },
      select: { id: true, roadmapId: true, lineageId: true, version: true, status: true, createdAt: true, goalId: true },
    });
    const out: Record<string, GoalLineage> = {};
    for (const o of own) {
      if (!o.goalId) continue;
      const lineage = rows.filter((r) => r.roadmapId === o.roadmapId && r.lineageId === o.lineageId);
      const self = lineage.find((r) => r.goalId === o.goalId);
      out[o.goalId] = {
        milestoneDueDay: o.dueDay ? keyOfDateColumn(o.dueDay) : null,
        otherGoalIds: lineage.flatMap((r) => (r.goalId && r.goalId !== o.goalId ? [r.goalId] : [])),
        superseded: self ? isSupersededRow(self, lineage) : false,
      };
    }
    return out;
  } catch (err) {
    if (isMissingRoadmapTable(err)) return {};
    throw err;
  }
}

/** What the ROADMAP close path reads through; checks inject them (no database). */
export interface GoalCloseDeps extends RoadmapWriteOpts {
  /** readGoalCloseInput by default. */
  readInput?: (userId: string, goalId: string, now: Date) => Promise<GoalInput | null>;
  /** roadmap-readings readingOpsFor by default; the close passes `closing: true`, the preview does not. */
  readingOps?: (userId: string, goalId: string, now: Date, opts: RoadmapWriteOpts & { closing?: boolean }) => Promise<ReadingOps>;
  /** loadGoalLineages by default (a check with no database injects `async () => ({})` or its fixture). */
  lineages?: (userId: string, goalIds: readonly string[]) => Promise<Record<string, GoalLineage>>;
}

/** A ROADMAP goal's readings computed now, for its close preview and its close. */
interface RoadmapCloseReadings {
  /** The close input: its series carrying the point computed now (seriesWith), its one due day, its lineage's pay. */
  input: GoalInput;
  /** Today's reading upserts (PROFICIENCY included); [] when live or unmeasured. */
  ops: Prisma.PrismaPromise<unknown>[];
  /** R1's guarded reach ops for the close (confirm at g = 1, clear below); [] for the preview, when live or unmeasured. */
  reachOps: Prisma.PrismaPromise<unknown>[];
  /** The other goals of the milestone's lineage: a paying close re-checks them in its transaction. */
  otherGoalIds: string[];
  rows: readonly ReadingRow[];
  point: RoadmapSeriesPoint | null;
  /** Computed where writes are off: written nowhere, labelled NOT_RECORDED_HERE. */
  live: boolean;
  /** The final refusal that left it unmeasured (an archived roadmap, a superseded row); null when measured. */
  refused: string | null;
}

/**
 * A series with the point computed now in place of any stored point of its
 * day, so the preview and the close decide from exactly the values they
 * record. With no point (nothing measurable now), g reads null as of today;
 * a goal past its due day still reads its stored points up to that day,
 * because progress after the due day never counts (goalAsOf).
 */
function seriesWith(series: readonly RoadmapSeriesPoint[], point: RoadmapSeriesPoint | null, asOf: DayKey, today: DayKey): RoadmapSeriesPoint[] {
  if (point) return [...series.filter((p) => p.day !== point.day), point];
  return asOf < today ? series.filter((p) => p.day <= asOf) : [];
}

/** readingOpsFor's deterministic refusal (roadmap-contracts.md §9.4 item 1): only this closes a goal unmeasured. */
function isFinalRefusal(res: Extract<ReadingOps, { ok: false }>): boolean {
  return "final" in res && res.final === true;
}

/**
 * Two g values are one reading: both unmeasured, or equal within float noise
 * and R1's binding tie tolerance (G_EPSILON, 1e-9), far below any figure the
 * close shows or pays from.
 */
const sameG = (a: number | null, b: number | null): boolean => (a == null || b == null ? a == null && b == null : Math.abs(a - b) <= 1e-6);

/**
 * Today's readings for one ROADMAP goal (roadmap-readings readingOpsFor),
 * folded into its close input with the milestone's one due day and its
 * lineage's pay. Unmeasured (series emptied: g null, pays 0, "not measured
 * yet", in the preview and the close alike) only for a final refusal or a
 * superseded row. Throws, so the close refuses with GOAL_CLOSE_RETRY and
 * writes nothing, on anything else: readingOpsFor throwing, a refusal that
 * is not final, or a g that is not the g R1 judged the reach on (the two due
 * days disagreeing, say), because the close never pays from a value other
 * than the one it records and judges.
 */
async function roadmapCloseReadings(userId: string, input: GoalInput, now: Date, deps: GoalCloseDeps, closing: boolean): Promise<RoadmapCloseReadings> {
  const lineage = (await (deps.lineages ?? loadGoalLineages)(userId, [input.id]))[input.id] ?? null;
  const otherGoalIds = lineage?.otherGoalIds ?? [];
  const lineagePaidOn = lineagePaidOnOf(input.goalMints, otherGoalIds);
  const based: GoalInput = {
    ...input,
    dueDay: milestoneDueDayOf(lineage?.milestoneDueDay ?? null, input.dueDay),
    ...(lineagePaidOn ? { lineagePaidOn } : {}),
  };
  const unmeasured = (refused: string): RoadmapCloseReadings => ({
    input: { ...based, readings: [] },
    ops: [],
    reachOps: [],
    otherGoalIds,
    rows: [],
    point: null,
    live: false,
    refused,
  });
  // Never measured again, whatever its goal does (an unarchive included): no reading is computed or written.
  if (lineage?.superseded) return unmeasured(SUPERSEDED_REASON);

  const res = await (deps.readingOps ?? readingOpsFor)(userId, input.id, now, closing ? { env: deps.env, closing: true } : { env: deps.env });
  if (!res.ok) {
    if (!isFinalRefusal(res)) throw new Error(`the milestone's readings were refused but not for good: ${res.reason}`);
    return unmeasured(res.reason);
  }
  // Both gates: R1's own and this server's, so a value computed live is never written or paid from.
  const live = res.live || !lifeWritesEnabled(deps.env);
  const readings = seriesWith(input.readings ?? [], res.point, goalAsOf(based.today, based.dueDay), based.today);
  const next: GoalInput = { ...based, readings, ...(live ? { readingNote: NOT_RECORDED_HERE } : {}) };
  if (res.g !== undefined) {
    const paid = goalProgress(next, goalAsOf(next.today, next.dueDay));
    if (!sameG(paid, res.g)) throw new Error(`the close would pay from g ${String(paid)}, but its reach was judged on g ${String(res.g)}`);
  }
  return {
    input: next,
    ops: live ? [] : res.ops,
    reachOps: closing && !live ? (res.reachOps ?? []) : [],
    otherGoalIds,
    rows: res.rows,
    point: res.point,
    live,
    refused: null,
  };
}

/**
 * Fails a paying ROADMAP close's transaction (division by zero) when one of
 * the other goals of its milestone's lineage holds a paying 'mp:GOAL:<id>'
 * row by now, after the life-mint lock: two goals of one lineage never both
 * pay, even closed at once. The close is refused with GOAL_CLOSE_STALE, and
 * trying again reads the other's pay (lineagePaidOn) and pays 0.
 */
function lineageGuardOp(userId: string, otherGoalIds: readonly string[]) {
  return prisma.$executeRaw`
    SELECT 1 / (CASE WHEN EXISTS (SELECT 1 FROM "ActivityEvent"
      WHERE "userId" = ${userId} AND "source" = 'MP_MINT' AND "qty" > 0
        AND "dedupeKey" IN (${Prisma.join(otherGoalIds.map(goalMintKey))}))
    THEN 0 ELSE 1 END)
  `;
}

/** prepareRoadmapGoalClose's result: what the Close sheet's preview decides from, and what it recorded. */
export interface RoadmapGoalClosePrep {
  /** The goal's close input (today's point in a ROADMAP goal's series); null when the goal is not open. */
  input: GoalInput | null;
  /** The point computed now (before the steps' share); null when not measured or not a ROADMAP goal. */
  point: RoadmapSeriesPoint | null;
  /** The rows computed now: recorded where writes are on, else shown live. */
  rows: readonly ReadingRow[];
  /** Reading rows the preview wrote (unchanged values write nothing). */
  written: number;
  /** Computed on a server with writes off: nothing written. */
  live: boolean;
  /** NOT_RECORDED_HERE when live, else null (also on input.readingNote, so the payout carries it). */
  note: string | null;
  /** The final refusal that left it unmeasured (an archived roadmap, a superseded row): g then reads null, "not measured". */
  refused: string | null;
}

/**
 * The close preview's input (F10, F16 seam 2). For a ROADMAP goal it first
 * computes the milestone's readings and Proficiency (roadmap-readings
 * readingOpsFor), writes them where writes are on, and returns the input with
 * them, so the preview and the close read the same values. With writes off
 * it writes nothing and returns the live values, labelled "not recorded on
 * this server". Any other goal comes back exactly as readGoalCloseInput reads
 * it, so the preview can call this for every goal:
 *   const prep = await prepareRoadmapGoalClose(userId, goalId, now);
 *   … prep.input ? closeDecision(prep.input) : null
 * No reach transition is applied here: only the close confirms or clears one.
 * Where the close would refuse with GOAL_CLOSE_RETRY (the readings could not
 * be worked out now), this throws rather than preview a figure the close
 * cannot pay.
 */
export async function prepareRoadmapGoalClose(userId: string, goalId: string, now: Date, deps: GoalCloseDeps = {}): Promise<RoadmapGoalClosePrep> {
  const read = await (deps.readInput ?? readGoalCloseInput)(userId, goalId, now);
  if (!read || read.krMetric !== "ROADMAP") return { input: read, point: null, rows: [], written: 0, live: false, note: null, refused: null };
  const r = await roadmapCloseReadings(userId, read, now, deps, false);
  let written = 0;
  if (r.ops.length > 0) {
    try {
      const results: unknown[] = await prisma.$transaction(r.ops);
      written = results.reduce<number>((n, x) => n + (typeof x === "number" ? x : 0), 0);
    } finally {
      invalidate("roadmap");
    }
  }
  return { input: r.input, point: r.point, rows: r.rows, written, live: r.live, note: r.live ? NOT_RECORDED_HERE : null, refused: r.refused };
}

/**
 * Closes a goal, once and for good: one $transaction of the life-mint lock,
 * (when it pays) the guard that its limits and cap still read as decided,
 * the template update (closedScore = g ?? 0, completedAt = now, only while
 * still open) and the 'mp:GOAL:<id>' decision row (+ a MasteryLedgerEntry
 * when it pays). A replay raises P2002 on the row and rolls all back:
 * 'Already closed.' A guard that finds another close (or a week's mints)
 * landed in between rolls all back: GOAL_CLOSE_STALE. A close that pays
 * nothing needs no guard: other writes only ever raise the counts it was
 * refused on. Writes only sink-NONE rows; never a TRACK row, never XP.
 *
 * A ROADMAP goal (F10, F16 seam 2) is refused where writes are off
 * (ROADMAP_WRITES_OFF): a dev server sharing the database never mints. Else
 * its milestone's readings are computed again now (readingOpsFor with
 * `closing`, so the PROFICIENCY row counts the reach this close confirms),
 * and their upserts ride in the same transaction (after the lock and the
 * guard, before the closedScore update) with R1's guarded reach ops
 * (confirmed at g = 1, cleared below) and, when it pays, the lineage guard.
 * The close pays from exactly those values. A final refusal (an archived
 * roadmap) or a superseded row closes it unmeasured: g null, pays 0. Any
 * other failure to work out the readings refuses the close with
 * GOAL_CLOSE_RETRY before anything is written.
 */
export async function closeGoalCore(
  userId: string,
  goalId: string,
  now: Date,
  launchDay: DayKey | null = lifeLaunchDay(),
  deps: GoalCloseDeps = {}
): Promise<{ ok: true; payout: GoalPayout } | { ok: false; error: string }> {
  // M5 stays inert while life does not count: a server action is reachable
  // whatever the UI renders, so a close before launch is refused here, before
  // any read or write (it would otherwise record a permanent 0 decision).
  if (!isLaunched(todayKey(now), launchDay)) return { ok: false, error: GOAL_CLOSE_BEFORE_LAUNCH };
  const read = await (deps.readInput ?? readGoalCloseInput)(userId, goalId, now);
  if (!read) {
    const closed = await prisma.taskTemplate.findFirst({ where: { id: goalId, userId, kind: "GOAL", closedScore: { not: null } }, select: { id: true } });
    return { ok: false, error: closed ? GOAL_ALREADY_CLOSED : "That goal no longer exists." };
  }
  const isRoadmap = read.krMetric === "ROADMAP";
  if (isRoadmap && !lifeWritesEnabled(deps.env)) return { ok: false, error: ROADMAP_WRITES_OFF };
  let roadmap: RoadmapCloseReadings | null = null;
  if (isRoadmap) {
    try {
      roadmap = await roadmapCloseReadings(userId, read, now, deps, true);
    } catch (err) {
      // A transient failure never closes the milestone at 0 for good: nothing is written.
      console.error("[roadmap] closeGoal: the milestone's readings could not be worked out; nothing was written", err);
      return { ok: false, error: GOAL_CLOSE_RETRY };
    }
  }
  // Never pay from a value this close does not record (readingOpsFor saw writes off where this server did not).
  if (roadmap?.live) return { ok: false, error: ROADMAP_WRITES_OFF };
  const input = roadmap ? roadmap.input : read;
  const payout = closeDecision(input);
  const mint = goalCloseMint({ id: input.id, track: input.track }, payout, input.today);
  const lineageGuard = roadmap && payout.pays > 0 && roadmap.otherGoalIds.length > 0 ? [lineageGuardOp(userId, roadmap.otherGoalIds)] : [];
  const roadmapOps = roadmap ? [...lineageGuard, ...roadmap.ops, ...roadmap.reachOps] : [];
  try {
    await prisma.$transaction([
      lifeMintLockOp(userId),
      ...(payout.pays > 0 ? [closeGuardOp(userId, input.id, goalLimitWindow(input))] : []),
      ...roadmapOps,
      prisma.taskTemplate.updateMany({
        where: { id: goalId, userId, kind: "GOAL", closedScore: null },
        data: { closedScore: payout.g ?? 0, completedAt: now },
      }),
      ...mintLifeMasteryOps(userId, { ...mint, now }),
    ]);
  } catch (err) {
    if (isDuplicateActivity(err)) return { ok: false, error: GOAL_ALREADY_CLOSED };
    if (isStaleGuard(err)) return { ok: false, error: GOAL_CLOSE_STALE };
    throw err;
  } finally {
    invalidate("life", "progress", "activity");
    if (isRoadmap) invalidate("roadmap");
  }
  return { ok: true, payout };
}

/** The furthest a goal's due day may move: ten years out. */
const RESCHEDULE_MAX_DAYS = 3650;

/**
 * Moves an open goal's due day to `day` (today ≤ day ≤ today + 3650). Only
 * dueDay changes: horizon and goalMp stay as stated when it was set.
 */
export async function rescheduleGoalCore(
  userId: string,
  goalId: string,
  day: DayKey,
  now: Date = new Date()
): Promise<{ ok: true } | { ok: false; error: string }> {
  const today = todayKey(now);
  if (!isDayKey(day) || day < today) return { ok: false, error: "Pick today or a later day." };
  if (day > addDays(today, RESCHEDULE_MAX_DAYS)) return { ok: false, error: "Pick a day within ten years." };
  const res = await prisma.taskTemplate.updateMany({
    where: { id: goalId, userId, kind: "GOAL", archivedAt: null, closedScore: null },
    data: { dueDay: dateColumn(day) },
  });
  invalidate("life", "activity");
  return res.count > 0 ? { ok: true } : { ok: false, error: "That goal is closed or no longer exists." };
}

const LADDER_CLOSED_DAYS = 30;
const HORIZON_ORDER: Record<Horizon, number> = { LONG: 0, MID: 1, SHORT: 2 };

const GOAL_SELECT = {
  id: true,
  title: true,
  horizon: true,
  track: true,
  goalMp: true,
  krMetric: true,
  krTarget: true,
  krUnit: true,
  dueDay: true,
  createdAt: true,
  closedScore: true,
  completedAt: true,
} as const;

/** What the ladder's open ROADMAP goals read through; checks inject them (no database). */
export interface GoalLadderDeps {
  /** loadRoadmapGoalSeries by default. */
  series?: GoalSeriesLoader;
  /** loadGoalLineages by default. */
  lineages?: (userId: string, goalIds: readonly string[]) => Promise<Record<string, GoalLineage>>;
}

/**
 * loadGoalLadder without the cache. Exported for checks, which inject the
 * roadmap reads (`deps`) and spy the rest; every page reads loadGoalLadder.
 */
export async function loadGoalLadderUncached(userId: string, now: Date, deps: GoalLadderDeps = {}): Promise<GoalLadder> {
  const today = todayKey(now);
  const monday = weekStartKeyOf(today);
  const closedSince = dayStartOf(addDays(today, -LADDER_CLOSED_DAYS));
  const [open, closed, steps, progress, mintRows, week] = await Promise.all([
    prisma.taskTemplate.findMany({
      where: { userId, kind: "GOAL", archivedAt: null, closedScore: null },
      select: GOAL_SELECT,
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskTemplate.findMany({
      where: { userId, kind: "GOAL", closedScore: { not: null }, completedAt: { gte: closedSince } },
      select: GOAL_SELECT,
    }),
    prisma.taskTemplate.findMany({
      where: { userId, parentId: { not: null }, archivedAt: null, recurrence: null, kind: { not: "GOAL" }, parent: { kind: "GOAL" } },
      select: { parentId: true, completedAt: true },
    }),
    prisma.activityEvent.groupBy({ by: ["templateId", "day"], where: { userId, source: "GOAL_PROGRESS" }, _sum: { qty: true } }),
    prisma.activityEvent.findMany({ where: { userId, source: "MP_MINT", dedupeKey: { startsWith: GOAL_MINT_PREFIX } }, select: MINT_SELECT }),
    prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", day: { gte: dateColumn(monday), lte: dateColumn(addDays(monday, 6)) } },
      select: { qty: true, detail: true },
    }),
  ]);

  const stepsOf = new Map<string, GoalStep[]>();
  for (const s of steps) {
    if (!s.parentId) continue;
    const list = stepsOf.get(s.parentId) ?? [];
    list.push({ completedDay: s.completedAt ? dayKeyOf(s.completedAt) : null });
    stepsOf.set(s.parentId, list);
  }
  const progressOf = new Map<string, GoalProgressRow[]>();
  for (const p of progress) {
    if (!p.templateId) continue;
    const list = progressOf.get(p.templateId) ?? [];
    list.push({ day: keyOfDateColumn(p.day), qty: p._sum.qty ?? 0 });
    progressOf.set(p.templateId, list);
  }
  const goalMints = goalMintRows(mintRows);
  const mintOf = new Map(goalMints.map((m) => [m.key, m]));
  const whyOf = new Map(mintRows.map((r) => [r.dedupeKey ?? "", parseMintDetail(r.detail).why]));
  const cappedUsedThisWeek = cappedSum(week);
  const launchDay = lifeLaunchDay();
  // Open ROADMAP goals read their milestone's stored series and lineage, only when such a goal exists
  // (one wave, side by side), so the ladder's preview is the close's: one due day, a superseded row
  // unmeasured, a lineage another goal paid at 0. A closed one reads its closedScore instead
  // (closedGoalReading), so it needs neither. The lineage is a backstop the close re-reads, so a
  // failed read is logged and the ladder still renders.
  const roadmapIds = open.filter((g) => metricOf(g.krMetric) === "ROADMAP").map((g) => g.id);
  const [roadmapOf, lineageOf]: [Record<string, RoadmapGoalEntry>, Record<string, GoalLineage>] =
    roadmapIds.length > 0
      ? await Promise.all([
          (deps.series ?? loadRoadmapGoalSeries)(userId, roadmapIds, today),
          (deps.lineages ?? loadGoalLineages)(userId, roadmapIds).catch((err: unknown) => {
            console.error("[roadmap] the goal ladder's lineage read failed", err);
            return {};
          }),
        ])
      : [{}, {}];

  const itemOf = (g: (typeof open)[number], isOpen: boolean): GoalLadderItem => {
    const horizon = horizonOf(g.horizon);
    const track = trackOf(g.track);
    const stated = typeof g.goalMp === "number" && Number.isFinite(g.goalMp) ? g.goalMp : statedGoalMp(horizon);
    const krMetric = metricOf(g.krMetric);
    const openRoadmap = isOpen && krMetric === "ROADMAP";
    const entry = openRoadmap ? roadmapOf[g.id] : undefined;
    const lineage = openRoadmap ? lineageOf[g.id] : undefined;
    const goalDue = g.dueDay ? keyOfDateColumn(g.dueDay) : null;
    const dueDay = openRoadmap ? milestoneDueDayOf(lineage?.milestoneDueDay ?? null, goalDue) : goalDue;
    const lineagePaidOn = lineage ? lineagePaidOnOf(goalMints, lineage.otherGoalIds) : null;
    const input: GoalInput & { closedScore: number | null } = {
      id: g.id,
      horizon,
      track,
      goalMp: g.goalMp,
      krMetric,
      krTarget: g.krTarget,
      steps: stepsOf.get(g.id) ?? [],
      progress: progressOf.get(g.id) ?? [],
      ...(openRoadmap ? { readings: lineage?.superseded ? [] : (entry?.series ?? []) } : {}),
      dueDay,
      ...(lineagePaidOn ? { lineagePaidOn } : {}),
      createdDay: dayKeyOf(g.createdAt),
      today,
      launchDay,
      goalMints,
      cappedUsedThisWeek,
      closedScore: g.closedScore,
    };
    if (isOpen) {
      const asOf = goalAsOf(today, dueDay);
      const progressLabel = goalProgressLabel({ ...input, krUnit: g.krUnit }, asOf);
      const g01 = goalProgress(input, asOf);
      const pastDue = dueDay != null && dueDay < today;
      return {
        id: g.id,
        title: g.title,
        horizon,
        track,
        stated,
        copy: statedPayoutLine(horizon, stated, entry?.zeroReason),
        g: g01,
        progressLabel,
        dueDay,
        pastDue,
        carried: pastDue && g01 != null && g01 < 1 ? g01 : null,
        preview: closeDecision(input),
        closed: null,
        // The board's entry, for the ladder's chip, note and "measured" time; none (a missing table) draws no chip.
        ...(entry ? { roadmap: entry } : {}),
      };
    }
    // A closed goal reads as it stood when it was closed (g as of min(close day,
    // due day)), so its percentage and its progress label are one measurement;
    // a close made while it was not measured shows no percentage at all.
    const key = goalMintKey(g.id);
    const row = mintOf.get(key);
    const closeDay = row ? row.day : g.completedAt ? dayKeyOf(g.completedAt) : today;
    const why = row ? (whyOf.get(key) ?? null) : null;
    const reading = closedGoalReading({ ...input, krUnit: g.krUnit }, closeDay, why);
    return {
      id: g.id,
      title: g.title,
      horizon,
      track,
      stated,
      copy: statedPayoutLine(horizon, stated),
      g: reading.g,
      progressLabel: reading.progressLabel,
      dueDay,
      pastDue: false,
      carried: null,
      preview: null,
      closed: {
        paid: row ? row.qty : 0,
        depth: row ? goalDepthAdded(goalMints, key) : 0,
        day: closeDay,
        why,
      },
    };
  };

  const openItems = open
    .map((g) => itemOf(g, true))
    .sort((a, b) => HORIZON_ORDER[a.horizon] - HORIZON_ORDER[b.horizon] || (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999"));
  const closedItems = closed
    .map((g) => itemOf(g, false))
    .sort((a, b) => (b.closed!.day < a.closed!.day ? -1 : b.closed!.day > a.closed!.day ? 1 : 0));
  return { open: openItems, closed: closedItems };
}

/**
 * The You sheet's goals: open ones (LONG → MID → SHORT, then by due day, each
 * with its g, progress label, stated payout copy, Carried figure when past
 * due, and what closing now would pay) and those closed in the last 30 days
 * (newest first, with what they paid and why). Cached on ['life', 'activity',
 * 'roadmap', 'ideas']: ticks, progress and closes invalidate it, and so do a
 * ROADMAP goal's readings and the reviews and cards that move them. An open
 * ROADMAP goal's preview is the close's: its milestone's one due day, no g
 * once superseded, and 0 once another goal of its lineage paid.
 */
export async function loadGoalLadder(userId: string, now?: Date): Promise<GoalLadder> {
  const at = now ?? new Date();
  return cached(`goalLadder:${userId}:${todayKey(at)}`, ["life", "activity", "roadmap", "ideas"], () => loadGoalLadderUncached(userId, at));
}

/**
 * The launch's backfill of stated amounts: every open goal with no goalMp
 * gets statedGoalMp(horizon) (no horizon reads as MID, as the board files
 * it). Idempotent: a second run updates 0 rows. Returns the rows updated.
 */
export async function stateGoalMp(userId: string): Promise<number> {
  const base = { userId, kind: "GOAL", goalMp: null, closedScore: null } as const;
  const results = await prisma.$transaction([
    ...HORIZONS.map((h) =>
      prisma.taskTemplate.updateMany({ where: { ...base, horizon: h }, data: { goalMp: statedGoalMp(h) } })
    ),
    prisma.taskTemplate.updateMany({ where: { ...base, OR: [{ horizon: null }, { horizon: { notIn: [...HORIZONS] } }] }, data: { goalMp: statedGoalMp("MID") } }),
  ]);
  invalidate("life", "activity");
  return results.reduce((s, r) => s + r.count, 0);
}
