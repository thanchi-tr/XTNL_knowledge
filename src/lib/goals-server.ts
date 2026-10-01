/**
 * Goals, server half (M5 lane A, F6): read what a close needs, close and pay
 * once, reschedule, the You sheet's ladder, and the launch's goalMp backfill.
 * Server only. The rules are pure in goals.ts (goalProgress, closeDecision);
 * this file reads and writes, and decides nothing on its own.
 *
 * Spec: docs/life-plan/m5-refit.md F6; contract: docs/life-plan/m5-contracts.md §7.
 *
 *   readGoalCloseInput(userId, goalId, now)  → GoalInput | null (one round trip)
 *   closeGoalCore(userId, goalId, now)       → {ok, payout} | {ok: false, error} ('Already closed.' on a replay)
 *   rescheduleGoalCore(userId, goalId, day)  → {ok} | {ok: false, error}
 *   loadGoalLadder(userId, now?)             → GoalLadder, cached 'goalLadder:<user>' on ['life', 'activity']
 *   stateGoalMp(userId)                      → rows updated (the launch script)
 *
 * House rules kept here: closing is explicit and final; one close writes
 * exactly one 'mp:GOAL:<id>' decision row (qty = MP paid, 0 allowed), sink
 * NONE, never a TRACK row; the row's dedupe key is the lock, so a double tap
 * or two devices pay once; nothing pays before launch (closeDecision's first
 * gate); horizon and goalMp never change after creation.
 */
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { isDuplicateActivity } from "./activity";
import { mintLifeMasteryOps } from "./mastery";
import { addDays, dateColumn, dayKeyOf, dayStartOf, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import { GOAL_MINT_PREFIX, goalIdOfMintKey, isCappedReason, isDayKey, lifeLaunchDay, parseMintDetail, round2, statedGoalMp } from "./life-economy";
import { isTrack } from "./life-grade";
import {
  closeDecision,
  goalAsOf,
  goalCloseMint,
  goalDepthAdded,
  goalProgress,
  goalProgressLabel,
  statedPayoutCopy,
  type GoalInput,
  type GoalLadder,
  type GoalLadderItem,
  type GoalMintRow,
  type GoalPayout,
  type GoalProgressRow,
  type GoalStep,
} from "./goals";
import type { Horizon, KrMetric, Track } from "./life-types";

const HORIZONS: readonly Horizon[] = ["SHORT", "MID", "LONG"];
const KR_METRICS: readonly KrMetric[] = ["CHILDREN", "MANUAL", "REVIEWS", "IDEAS", "WORKOUTS", "RUN_KM"];

/** A stored horizon; none reads as MID, as the Today board files it. */
const horizonOf = (h: string | null): Horizon => (HORIZONS.includes(h as Horizon) ? (h as Horizon) : "MID");
const metricOf = (m: string | null): KrMetric | null => (KR_METRICS.includes(m as KrMetric) ? (m as KrMetric) : null);
/** A goal's stored track; an unreadable one reads as DUTY rather than failing the close. */
const trackOf = (t: string | null): Track => (isTrack(t) ? t : "DUTY");

/** Goal decision rows ('mp:GOAL:*') as goals.ts reads them. */
function goalMintRows(rows: readonly { dedupeKey: string | null; templateId: string | null; track: string | null; day: Date; qty: number | null; detail: string | null }[]): GoalMintRow[] {
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

const MINT_SELECT = { dedupeKey: true, templateId: true, track: true, day: true, qty: true, detail: true } as const;

/**
 * Everything closeDecision needs for one open goal, fresh, in one round trip:
 * the goal (own user, kind GOAL, not archived, not closed), its one-off steps
 * (non-recurring, non-goal, non-archived children), Σ GOAL_PROGRESS by day,
 * the goal decision rows (every one dated in the last 91 days plus every
 * paying one, which covers this track's depth), and the capped MP already in
 * the close day's life week. Null when the goal is not open.
 */
export async function readGoalCloseInput(userId: string, goalId: string, now: Date): Promise<GoalInput | null> {
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
  return {
    id: goal.id,
    horizon: horizonOf(goal.horizon),
    track: trackOf(goal.track),
    goalMp: goal.goalMp,
    krMetric: metricOf(goal.krMetric),
    krTarget: goal.krTarget,
    steps: steps.map((s): GoalStep => ({ completedDay: s.completedAt ? dayKeyOf(s.completedAt) : null })),
    progress: progress.map((p): GoalProgressRow => ({ day: keyOfDateColumn(p.day), qty: p._sum.qty ?? 0 })),
    dueDay: goal.dueDay ? keyOfDateColumn(goal.dueDay) : null,
    createdDay: dayKeyOf(goal.createdAt),
    today,
    launchDay: lifeLaunchDay(),
    goalMints: goalMintRows(mints),
    cappedUsedThisWeek: cappedSum(week),
  };
}

/**
 * Closes a goal, once and for good: one $transaction of the template update
 * (closedScore = g ?? 0, completedAt = now, only while still open) and the
 * 'mp:GOAL:<id>' decision row (+ a MasteryLedgerEntry when it pays). A
 * replay raises P2002 on the row and rolls both back: 'Already closed.'
 * Writes only sink-NONE rows; never a TRACK row, never XP.
 */
export async function closeGoalCore(
  userId: string,
  goalId: string,
  now: Date
): Promise<{ ok: true; payout: GoalPayout } | { ok: false; error: string }> {
  const input = await readGoalCloseInput(userId, goalId, now);
  if (!input) {
    const closed = await prisma.taskTemplate.findFirst({ where: { id: goalId, userId, kind: "GOAL", closedScore: { not: null } }, select: { id: true } });
    return { ok: false, error: closed ? "Already closed." : "That goal no longer exists." };
  }
  const payout = closeDecision(input);
  const mint = goalCloseMint({ id: input.id, track: input.track }, payout, input.today);
  try {
    await prisma.$transaction([
      prisma.taskTemplate.updateMany({
        where: { id: goalId, userId, kind: "GOAL", closedScore: null },
        data: { closedScore: payout.g ?? 0, completedAt: now },
      }),
      ...mintLifeMasteryOps(userId, { ...mint, now }),
    ]);
  } catch (err) {
    if (isDuplicateActivity(err)) return { ok: false, error: "Already closed." };
    throw err;
  } finally {
    invalidate("life", "progress", "activity");
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

async function loadGoalLadderUncached(userId: string, now: Date): Promise<GoalLadder> {
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

  const itemOf = (g: (typeof open)[number], isOpen: boolean): GoalLadderItem => {
    const horizon = horizonOf(g.horizon);
    const track = trackOf(g.track);
    const stated = typeof g.goalMp === "number" && Number.isFinite(g.goalMp) ? g.goalMp : statedGoalMp(horizon);
    const dueDay = g.dueDay ? keyOfDateColumn(g.dueDay) : null;
    const input: GoalInput = {
      id: g.id,
      horizon,
      track,
      goalMp: g.goalMp,
      krMetric: metricOf(g.krMetric),
      krTarget: g.krTarget,
      steps: stepsOf.get(g.id) ?? [],
      progress: progressOf.get(g.id) ?? [],
      dueDay,
      createdDay: dayKeyOf(g.createdAt),
      today,
      launchDay,
      goalMints,
      cappedUsedThisWeek,
    };
    const asOf = goalAsOf(today, dueDay);
    const progressLabel = goalProgressLabel({ ...input, krUnit: g.krUnit }, asOf);
    if (isOpen) {
      const g01 = goalProgress(input, asOf);
      const pastDue = dueDay != null && dueDay < today;
      return {
        id: g.id,
        title: g.title,
        horizon,
        track,
        stated,
        copy: statedPayoutCopy(horizon, stated),
        g: g01,
        progressLabel,
        dueDay,
        pastDue,
        carried: pastDue && g01 != null && g01 < 1 ? g01 : null,
        preview: closeDecision(input),
        closed: null,
      };
    }
    const key = `${GOAL_MINT_PREFIX}${g.id}`;
    const row = mintOf.get(key);
    return {
      id: g.id,
      title: g.title,
      horizon,
      track,
      stated,
      copy: statedPayoutCopy(horizon, stated),
      g: g.closedScore,
      progressLabel,
      dueDay,
      pastDue: false,
      carried: null,
      preview: null,
      closed: {
        paid: row ? row.qty : 0,
        depth: row ? goalDepthAdded(goalMints, key) : 0,
        day: row ? row.day : g.completedAt ? dayKeyOf(g.completedAt) : today,
        why: row ? (whyOf.get(key) ?? null) : null,
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
 * (newest first, with what they paid and why). Cached on ['life', 'activity']:
 * ticks, progress and closes invalidate it.
 */
export async function loadGoalLadder(userId: string, now?: Date): Promise<GoalLadder> {
  const at = now ?? new Date();
  return cached(`goalLadder:${userId}:${todayKey(at)}`, ["life", "activity"], () => loadGoalLadderUncached(userId, at));
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
