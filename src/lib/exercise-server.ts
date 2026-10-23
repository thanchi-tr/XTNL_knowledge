/**
 * Exercise sessions: reads and writes (server only). Every read fails soft — the table may be missing on a database
 * the life_exercise_style migration has not reached — and returns the empty view; every write returns
 * { ok: false, error } instead of throwing. Cache tag 'exercise'. Before MOMENTUM_LAUNCH_DAY a walk is a record, never
 * a reward: nothing here touches the ledger, XP, MP, a streak or a celebration.
 *
 *   loadExerciseView(userId, now?, opts?)  → ExerciseView (the last EXERCISE_HISTORY_DAYS of sessions, this week's
 *                                            totals; with { momentum: true } on a live day, also each session's pay
 *                                            and the "Counts as" habit)
 *   logWalkCore(userId, raw, now?, opts?)  → { ok, value: LoggedWalk } | { ok: false, error }
 *   logWalkMomentsCore(userId, raw, now?, opts?)  logWalkCore inside L3's moments on a live day (a PB Seal)
 *   deleteExerciseCore(userId, id, now?)   → { ok, value: WalkDeleteOutcome | null } | { ok: false, error }
 *
 * Momentum (docs/life-plan/momentum.md §A.6, §A.7; INERT until momentumLive(the session's day)). On a live day:
 *   - A logged walk dated today or yesterday writes one WORKOUT row (workout:<sessionId>) through the daily knee,
 *     under tasks.ts lifeLockOp + freshnessGuardOp like a tick (a stale read re-reads and re-prices, 3 tries). One
 *     curve per day (the day's live walks' W), Stride, Peak (the BODY quest done) and a Body spark crit
 *     (momentumRoll(excritKey)) from the perks owned now (lifeModsOf). Refused walks (> 9 km/h, < 5 min) and older
 *     ones are records only.
 *   - Personal bests (§A.7): PR rows (pr:WALK:<metric>:<week>), +15 XP (22 Pacer) outside the knee, in the same
 *     transaction as the walk.
 *   - "Counts as" (§A.6): tasks.ts completeLinkedCore completes the habit's instance (SESSION, paid by the walk); a
 *     habit already ticked is topped up: raw = max(0, raw − the tick's raw).
 *   - A delete on the life day the walk was logged writes reversal rows (momentum.ts reversalSourceOf: UNDO for a
 *     row that counted, a negated row of its own source otherwise), then deletes the record; a later delete keeps
 *     the pay.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { activityOp, isDuplicateActivity } from "./activity";
import { LIFE_TZ, addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, weekKeyOf, type DayKey } from "./life-day";
import {
  bodyQuestDoneBy,
  cleanWalkInput,
  exerciseWeekOf,
  isWalkReceipt,
  linkCandidateOf,
  paidFactsOf,
  personalBestsOf,
  prEventInput,
  priceWalk,
  reversalInputOf,
  walkEventInput,
  walkReceiptOf,
  type ExerciseSessionView,
  type ExerciseWeek,
  type SessionPayView,
  type WalkDeleteOutcome,
  type WalkFactsPaid,
  type WalkPay,
  type WalkReceipt,
  type WalkTopUp,
} from "./exercise";
import {
  PR_METRICS,
  excritKey,
  isQuestSet,
  isQuestSwap,
  lifeModsOf,
  momentumLaunchDay,
  momentumLive,
  ownedPerksOf,
  prRowKey,
  questSetKey,
  questsInForce,
  walkPaysOn,
  walkRefusal,
  type LifeMods,
  type PrMetric,
  type QuestSwap,
} from "./momentum";
import { momentumRoll } from "./momentum-roll";
import { effortWeightOfB } from "./life-economy";
import { needsSettledGuard } from "./duty-plan";
import {
  completeLinkedCore,
  freshnessGuardOp,
  isSettledDay,
  isStaleRead,
  kneeRowsOf,
  lifeLockOp,
  readDayTotals,
  settledDayGuardOp,
} from "./tasks";
import { captureSnapshot, detectCelebrations } from "./celebrations";
import { withMoments } from "./today-board";
import type { SnapshotPart } from "./celebration-detect";
import type { CelebrationEvent } from "./celebration-types";
import type { Track } from "./life-types";

export type ExerciseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const EXERCISE_HISTORY_DAYS = 90;
export const EXERCISE_NOT_READY = "Exercise logging needs a one-time database update first.";
const SAVE_FAILED = "Couldn't save that. Try again.";
const GONE = "That session is no longer here.";

export interface ExerciseView {
  today: DayKey;
  sessions: ExerciseSessionView[];
  week: ExerciseWeek;
  /** False when the table isn't there yet (the form says so instead of failing on save). */
  ready: boolean;
  /** Momentum is live today (only with { momentum: true }): the card shows the pay lines and "Counts as". Absent before launch. */
  live?: boolean;
  /** The personal EXERCISE habit due today and not done: the form pre-selects "Counts as: <title>". Live days only. */
  link?: { templateId: string; title: string } | null;
  /** Each paid session's pay, by session id. Live days only. */
  paid?: Record<string, SessionPayView>;
}

/** A logged walk, with what it paid on a live day (absent before launch: a record, as always). */
export interface LoggedWalk extends ExerciseSessionView {
  pay?: WalkPay;
}

/** The table is not there yet (the migration has not reached this database). */
export function isMissingExerciseTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*ExerciseSession[`"]? does not exist/i.test(message);
}

type Row = { id: string; day: Date; kind: string; angleDeg: number; distanceKm: number; durationMin: number; note: string | null };
const viewOf = (r: Row): ExerciseSessionView => ({
  id: r.id,
  kind: "WALK",
  day: keyOfDateColumn(r.day),
  angleDeg: r.angleDeg,
  distanceKm: r.distanceKm,
  durationMin: r.durationMin,
  note: r.note,
});

export async function loadExerciseView(userId: string, now: Date = new Date(), opts: { momentum?: boolean } = {}): Promise<ExerciseView> {
  const today = todayKey(now);
  const view = await cached(`exercise:${userId}:${today}`, ["exercise"], async () => {
    try {
      const rows = await prisma.exerciseSession.findMany({
        where: { userId, day: { gte: dateColumn(addDays(today, -EXERCISE_HISTORY_DAYS)) } },
        orderBy: [{ day: "desc" }, { createdAt: "desc" }],
        select: { id: true, day: true, kind: true, angleDeg: true, distanceKm: true, durationMin: true, note: true },
      });
      const sessions = rows.map(viewOf);
      return { today, sessions, week: exerciseWeekOf(sessions, today), ready: true };
    } catch (err) {
      if (!isMissingExerciseTable(err)) console.error("Exercise: the sessions failed to load; showing none.", err);
      return { today, sessions: [], week: exerciseWeekOf([], today), ready: !isMissingExerciseTable(err) };
    }
  });
  // Momentum's parts only where asked for (Train › Exercise) and only on a live day: before launch the view is exactly the record.
  if (!opts.momentum || !momentumLive(today) || !view.ready) return view;
  return { ...view, ...(await loadWalkMomentum(userId, today, view.sessions)) };
}

/** The live day's extras: each listed session's pay (live WORKOUT and PR rows) and the "Counts as" habit. Fail soft. */
async function loadWalkMomentum(userId: string, today: DayKey, sessions: readonly ExerciseSessionView[]): Promise<Pick<ExerciseView, "live" | "link" | "paid">> {
  const ids = sessions.map((s) => s.id);
  // Logging and deleting invalidate 'exercise'; a tick or an undo on the board, 'life' and 'activity'.
  return cached(`exerciseMomentum:${userId}:${today}`, ["exercise", "life", "activity"], async () => {
    try {
      const [rows, logged, templates] = await Promise.all([
        ids.length
          ? prisma.activityEvent.findMany({
              where: { userId, sourceId: { in: ids }, source: { in: ["WORKOUT", "PR", "UNDO"] } },
              select: { id: true, source: true, sourceId: true, day: true, xp: true, dedupeKey: true },
            })
          : Promise.resolve([]),
        ids.length ? prisma.exerciseSession.findMany({ where: { userId, id: { in: ids } }, select: { id: true, createdAt: true } }) : Promise.resolve([]),
        prisma.taskTemplate.findMany({
          // The personal Board only (work-boards.ts): a work tab's task is never a walk's habit. Nor is a deferred one,
          // while it is off the board (task-decisions.ts).
          where: {
            userId,
            boardId: null,
            category: "EXERCISE",
            kind: { in: ["TASK", "HABIT"] },
            archivedAt: null,
            intrinsic: false,
            inbox: false,
            autoMetric: null,
            OR: [{ deferUntil: null }, { deferUntil: { lte: new Date() } }],
          },
          select: { id: true, title: true, recurrence: true, startDay: true, dueDay: true, planDay: true, completedAt: true, compulsory: true, sortOrder: true },
        }),
      ]);
      const reversed = new Set(rows.filter((r) => r.dedupeKey?.startsWith("undo:")).map((r) => r.dedupeKey!.slice(5)));
      const loggedDay = new Map(logged.map((s) => [s.id, dayKeyOf(s.createdAt)]));
      const paid: Record<string, SessionPayView> = {};
      for (const r of rows) {
        if ((r.source !== "WORKOUT" && r.source !== "PR") || r.dedupeKey?.startsWith("undo:") || reversed.has(r.id) || !r.sourceId) continue;
        const prev = paid[r.sourceId];
        const day = r.source === "WORKOUT" || !prev ? keyOfDateColumn(r.day) : prev.day;
        paid[r.sourceId] = { xp: Math.round(((prev?.xp ?? 0) + r.xp) * 1000) / 1000, day, reversible: loggedDay.get(r.sourceId) === today };
      }
      const instances = templates.length
        ? await prisma.taskInstance.findMany({
            where: { userId, templateId: { in: templates.map((t) => t.id) }, day: { gte: dateColumn(addDays(today, -LINK_HISTORY_DAYS)) } },
            select: { templateId: true, day: true, status: true },
          })
        : [];
      const link = linkCandidateOf(
        templates.map((t) => ({
          id: t.id,
          title: t.title,
          recurrence: t.recurrence,
          startDay: keyOfDateColumn(t.startDay),
          dueDay: t.dueDay ? keyOfDateColumn(t.dueDay) : null,
          planDay: t.planDay ? keyOfDateColumn(t.planDay) : null,
          completed: t.completedAt != null,
          compulsory: t.compulsory,
          sortOrder: t.sortOrder,
        })),
        instances.map((i) => ({ templateId: i.templateId, day: keyOfDateColumn(i.day), status: i.status })),
        today
      );
      return { live: true, link, paid };
    } catch (err) {
      console.error("Exercise: the walks' pay failed to load; showing none.", err);
      return { live: true, link: null, paid: {} };
    }
  });
}

/** How far back the "Counts as" read looks for a habit's done days (an AFTER rule's last done, a target's week). */
const LINK_HISTORY_DAYS = 400;

export interface LogWalkOptions {
  /** "Counts as": the personal EXERCISE template this walk completes (live days, a walk dated today only). */
  countsAs?: string | null;
}

export async function logWalkCore(userId: string, raw: Parameters<typeof cleanWalkInput>[0], now: Date = new Date(), opts: LogWalkOptions = {}): Promise<ExerciseResult<LoggedWalk>> {
  const clean = cleanWalkInput(raw, todayKey(now));
  if (!clean.ok) return clean;
  const v = clean.value;
  let session: ExerciseSessionView;
  try {
    const row = await prisma.exerciseSession.create({
      data: { userId, day: dateColumn(v.day), kind: "WALK", angleDeg: v.angleDeg, distanceKm: v.distanceKm, durationMin: v.durationMin, note: v.note },
      select: { id: true, day: true, kind: true, angleDeg: true, distanceKm: true, durationMin: true, note: true },
    });
    invalidate("exercise");
    session = viewOf(row);
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    console.error("Exercise: a walk wasn't saved.", err);
    return { ok: false, error: SAVE_FAILED };
  }
  // Before launch (and on any day before it) the walk is a record, never a reward: exactly as it always was.
  if (!momentumLive(session.day)) return { ok: true, value: session };
  // The record is saved whatever the pay does next.
  const pay = await payWalkCore(userId, session, now, opts);
  return { ok: true, value: { ...session, pay } };
}

/** What a walk's moments read: the streak, the habits (a linked one's rung), goals, levels, tracks and the PR rows. */
// "momentum" (lane D): a walk that is the day's first momentum action chimes momentum-kept / quest-done, and a
// run milestone reached by a walk is detected here (the next diff's "before" would already hold the new run).
// "competencies" (blueprint P5): a walk adds its minutes to the exercise skill, so it can cross an hour tier.
const WALK_PARTS: readonly SnapshotPart[] = ["streak", "goals", "levels", "tracks", "ledger", "momentum", "competencies"];
const WALK_PARTS_LINKED: readonly SnapshotPart[] = ["streak", "habits", "goals", "levels", "tracks", "ledger", "momentum", "competencies"];

/**
 * logWalkCore with L3's moments around it on a live day (today-board withMoments): a snapshot before, the walk and
 * its pay, a snapshot after, the diff — a personal best's T2 'pr' Seal, a streak milestone, a habit rung, a track
 * level. Returned as `celebrations`; the card presents only those (T2/T3). Before launch it is logWalkCore exactly:
 * no snapshot, no moments.
 */
export async function logWalkMomentsCore(
  userId: string,
  raw: Parameters<typeof cleanWalkInput>[0],
  now: Date = new Date(),
  opts: LogWalkOptions = {}
): Promise<ExerciseResult<LoggedWalk & { celebrations?: CelebrationEvent[] }>> {
  const day = typeof raw.day === "string" && raw.day !== "" ? raw.day : todayKey(now);
  if (!momentumLive(day)) return logWalkCore(userId, raw, now, opts);
  const linked = typeof opts.countsAs === "string" && opts.countsAs.length > 0 ? opts.countsAs : null;
  return withMoments({
    snapshot: () => captureSnapshot(userId, { scope: linked ? WALK_PARTS_LINKED : WALK_PARTS, ...(linked ? { templateIds: [linked] } : {}) }),
    detect: (before, after) => detectCelebrations(before, after, { cause: "tick", now }),
    write: () => logWalkCore(userId, raw, now, opts),
    changed: (v) => v.pay?.kind === "PAID",
  });
}

// ── Pay (live days only) ────────────────────────────────────────────────────

/** Tries a walk's pay makes when another write lands on its day between the read and the write. */
const PAY_ATTEMPTS = 3;
const RETRY = Symbol("retry");

/** A live WORKOUT row (never reversed), with its walk's facts from the receipt. */
interface LiveWalk {
  id: string;
  sessionId: string | null;
  day: DayKey;
  receipt: WalkReceipt;
}

/** Every live WORKOUT row of the user: the day's curve (W before, the crit's k) and the PB history read these. */
async function readLiveWalks(userId: string): Promise<LiveWalk[]> {
  const rows = await prisma.$queryRaw<{ id: string; day: Date; sourceId: string | null; receipt: Prisma.JsonValue }[]>`
    SELECT e."id", e."day", e."sourceId", e."receipt"
    FROM "ActivityEvent" e
    WHERE e."userId" = ${userId} AND e."source" = 'WORKOUT' AND e."dedupeKey" LIKE 'workout:%'
      AND NOT EXISTS (SELECT 1 FROM "ActivityEvent" u WHERE u."userId" = e."userId" AND u."dedupeKey" = 'undo:' || e."id")
  `;
  const out: LiveWalk[] = [];
  for (const r of rows) {
    if (!isWalkReceipt(r.receipt)) continue;
    out.push({ id: r.id, sessionId: r.sourceId, day: keyOfDateColumn(new Date(r.day)), receipt: r.receipt });
  }
  return out;
}

const factsOfReceipt = (r: WalkReceipt): WalkFactsPaid => ({
  day: r.walk.day,
  distanceKm: r.walk.distanceKm,
  durationMin: r.walk.durationMin,
  angleDeg: r.walk.angleDeg,
  climbM: r.walk.climbM,
  paceMinPerKm: r.walk.paceMinPerKm,
});

/** A stored walk's pay, as the card states it (a retried or concurrent pay of the same session). */
function storedPay(r: WalkReceipt, prs: number): WalkPay {
  const t = r.walk.topUp;
  return {
    kind: "PAID",
    xp: r.xp,
    raw: r.raw,
    intensity: r.walk.intensity,
    effortMinutes: r.walk.effort,
    crit: r.walk.crit?.hit === true,
    prs,
    topUp: t ? { title: t.title, tickedAt: t.tickedAt, tickedRaw: t.tickedRaw } : null,
    linkError: null,
  };
}

/** 'HH:MM' on the life clock. */
function clockOf(at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: LIFE_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/** A tick receipt's effort minutes (minutes × the WHO weight of its B), for an EXERCISE habit a walk tops up. */
function effortOfReceipt(receipt: Prisma.JsonValue): number {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return 0;
  const r = receipt as { minutes?: unknown; factors?: { key?: unknown; value?: unknown }[] };
  const minutes = Number(r.minutes);
  const b = Array.isArray(r.factors) ? r.factors.find((f) => f?.key === "B")?.value : undefined;
  return Number.isFinite(minutes) && minutes > 0 && typeof b === "number" ? minutes * effortWeightOfB(b) : 0;
}

type LinkOutcome = { templateId: string; title: string; topUp: WalkTopUp | null } | { error: string };

/**
 * "Counts as" (§A.6, one payment for one walk): lane A's completeLinkedCore completes the habit's instance for the
 * walk (source auto:workout, pay mode SESSION: the walk pays). A habit already ticked comes back with its raw, and the
 * walk tops it up; the tick's time and effort are read from its TASK row for the note and BODY's week.
 */
async function linkWalk(userId: string, templateId: string, s: ExerciseSessionView, now: Date): Promise<LinkOutcome> {
  try {
    const res = await completeLinkedCore({ userId, templateId, day: s.day, workoutId: s.id, minutes: Math.round(s.durationMin), at: now });
    if (!res.ok) return { error: res.error };
    const t = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { title: true } });
    const title = t?.title ?? "the habit";
    // Completed for this walk (null), or by a tick that paid nothing (an earlier walk's SESSION row): no top-up.
    if (res.tickedRaw == null || !(res.tickedRaw > 0)) return { templateId, title, topUp: null };
    const rows = await prisma.activityEvent.findMany({
      where: { userId, sourceId: res.instanceId, source: { in: ["TASK", "UNDO"] } },
      orderBy: { occurredAt: "desc" },
      select: { id: true, source: true, dedupeKey: true, occurredAt: true, receipt: true },
    });
    const undone = new Set(rows.filter((r) => r.source === "UNDO" && r.dedupeKey?.startsWith("undo:")).map((r) => r.dedupeKey!.slice(5)));
    const tick = rows.find((r) => r.source === "TASK" && !undone.has(r.id));
    return {
      templateId,
      title,
      topUp: { templateId, title, tickedRaw: res.tickedRaw, tickedAt: tick ? clockOf(tick.occurredAt) : "earlier", tickedEffort: tick ? effortOfReceipt(tick.receipt) : 0 },
    };
  } catch (err) {
    console.error("Exercise: the walk wasn't counted as its habit.", err);
    return { error: "Couldn't count it as the habit." };
  }
}

/** Is Today's BODY quest done with this walk (the Peak perk)? Read only when Peak is owned. */
async function peakOn(userId: string, day: DayKey, s: ExerciseSessionView, linkedTemplateId: string | null, dayWalks: readonly LiveWalk[]): Promise<boolean> {
  const [questRows, instances] = await Promise.all([
    prisma.activityEvent.findMany({ where: { userId, source: "QUEST_SET", day: dateColumn(day) }, select: { dedupeKey: true, receipt: true } }),
    prisma.taskInstance.findMany({ where: { userId, day: dateColumn(day) }, select: { templateId: true, status: true, minutes: true, template: { select: { category: true } } } }),
  ]);
  const set = questRows.find((r) => r.dedupeKey === questSetKey(day))?.receipt;
  if (!isQuestSet(set)) return false;
  const swaps: QuestSwap[] = [];
  for (const r of questRows) if (isQuestSwap(r.receipt)) swaps.push(r.receipt);
  const body = questsInForce(set, swaps).find((q) => q.slot === "BODY");
  return bodyQuestDoneBy(body, {
    walkMinutes: Math.min(180, s.durationMin),
    linkedTemplateId,
    earlierWalkMinutes: dayWalks.map((w) => w.receipt.minutes),
    instances: instances.map((i) => ({ templateId: i.templateId, status: i.status, minutes: i.minutes, exercise: i.template.category === "EXERCISE" })),
  });
}

const metricOfPrKey = (key: string | null): PrMetric | null => {
  const m = key?.split(":")[2];
  return m && (PR_METRICS as readonly string[]).includes(m) ? (m as PrMetric) : null;
};

/**
 * One try at a walk's pay: read the day (knee base and rows, the day's live walks, this week's PR keys, the perks),
 * price it on the day's curve, and write the WORKOUT row and its PR rows after the lock and the freshness guard (and
 * the settled-day guard where a tick would carry it). RETRY when the day moved under it.
 */
async function payOnce(userId: string, s: ExerciseSessionView, link: LinkOutcome | null, now: Date): Promise<WalkPay | typeof RETRY> {
  const today = todayKey(now);
  const day = s.day;
  const week = weekKeyOf(day);
  const [totals, liveWalks, prRows, perkRows] = await Promise.all([
    readDayTotals(userId, [day]),
    readLiveWalks(userId),
    prisma.activityEvent.findMany({ where: { userId, dedupeKey: { in: PR_METRICS.map((m) => prRowKey(m, week)) } }, select: { dedupeKey: true } }),
    prisma.activityEvent.findMany({ where: { userId, source: { in: ["PERK", "RESPEC"] } }, select: { source: true, detail: true, occurredAt: true } }),
  ]);
  // Paid already (a retried action): what was stored is the answer.
  const mine = liveWalks.find((w) => w.sessionId === s.id);
  if (mine) {
    const prs = await prisma.activityEvent.count({ where: { userId, source: "PR", sourceId: s.id, dedupeKey: { startsWith: "pr:" } } });
    return storedPay(mine.receipt, prs);
  }
  const mods: LifeMods = lifeModsOf(ownedPerksOf(perkRows, now));
  const rawBefore = totals.filter((r) => keyOfDateColumn(r.day) === day).reduce((n, r) => n + r.raw, 0);
  const kneeRows = kneeRowsOf(day, totals);
  const dayWalks = liveWalks.filter((w) => w.day === day);
  const wBefore = dayWalks.reduce((n, w) => n + w.receipt.walk.w, 0);
  const linked = link && "templateId" in link ? link : null;
  // Body spark: k = 1 + the day's earlier paid walks, so a delete and a re-log meet the same roll.
  const critU = mods.exerciseCrit ? momentumRoll(excritKey(userId, day, dayWalks.length + 1)) : null;
  const peak = mods.peakMult !== 1 ? await peakOn(userId, day, s, linked?.templateId ?? null, dayWalks) : false;
  const price = priceWalk({ walk: s, wBefore, rawBefore, mods, peak, critU, tickedRaw: linked?.topUp?.tickedRaw ?? null });
  if (!price) return { kind: "REFUSED", reason: walkRefusal(s) ?? "INVALID" };
  const facts = paidFactsOf(s);
  const receipt = walkReceiptOf(price, facts, s.id, { stride: mods.exerciseMult, topUp: linked?.topUp ?? null });
  const taken = new Set(prRows.map((r) => metricOfPrKey(r.dedupeKey)).filter((m): m is PrMetric => m != null));
  const pbs = personalBestsOf(
    liveWalks.map((w) => factsOfReceipt(w.receipt)),
    facts,
    taken
  );

  const ops: Prisma.PrismaPromise<unknown>[] = [
    lifeLockOp(userId),
    ...(needsSettledGuard(day, today, now) ? [settledDayGuardOp(userId, day)] : []),
    freshnessGuardOp(userId, day, kneeRows, null, { notFrozen: day < today }),
    activityOp(userId, walkEventInput(s.id, day, receipt, now)),
    ...pbs.map((pb) => activityOp(userId, prEventInput(pb, s.id, day, mods.prXp, now))),
  ];
  try {
    await prisma.$transaction(ops);
  } catch (err) {
    if (isSettledDay(err)) return { kind: "SETTLED" };
    // Another write landed on the day (the knee moved), or a PR week key was claimed first: re-read and re-price.
    if (isStaleRead(err) || isDuplicateActivity(err)) return RETRY;
    throw err;
  } finally {
    invalidate("life", "activity", "exercise");
  }
  return {
    kind: "PAID",
    xp: price.xp,
    raw: price.raw,
    intensity: price.intensity,
    effortMinutes: price.effort,
    crit: price.crit,
    prs: pbs.length,
    topUp: linked?.topUp ? { title: linked.topUp.title, tickedAt: linked.topUp.tickedAt, tickedRaw: linked.topUp.tickedRaw } : null,
    linkError: link && "error" in link ? link.error : null,
  };
}

/**
 * A live day's pay for a saved walk (§A.6): older than yesterday is a record; a refused walk (> 9 km/h, < 5 min)
 * pays nothing; otherwise "Counts as" first (lane A's link, a walk dated today only), then the pay, re-read when
 * the day moves under it. Never throws: the walk is saved whatever happens here.
 */
async function payWalkCore(userId: string, s: ExerciseSessionView, now: Date, opts: LogWalkOptions): Promise<WalkPay> {
  const today = todayKey(now);
  if (!walkPaysOn(s.day, today)) return { kind: "OLD" };
  const refusal = walkRefusal(s);
  if (refusal) return { kind: "REFUSED", reason: refusal };
  try {
    const countsAs = typeof opts.countsAs === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(opts.countsAs) ? opts.countsAs : null;
    const link = countsAs && s.day === today ? await linkWalk(userId, countsAs, s, now) : null;
    for (let attempt = 1; attempt <= PAY_ATTEMPTS; attempt++) {
      const res = await payOnce(userId, s, link, now);
      if (res !== RETRY) return res;
    }
  } catch (err) {
    console.error("Exercise: a walk's pay wasn't recorded.", err);
  }
  return { kind: "UNPAID" };
}

// ── Delete ──────────────────────────────────────────────────────────────────

async function deleteRecord(userId: string, id: string): Promise<ExerciseResult<null>> {
  try {
    const out = await prisma.exerciseSession.deleteMany({ where: { id, userId } });
    invalidate("exercise");
    return out.count > 0 ? { ok: true, value: null } : { ok: false, error: GONE };
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    console.error("Exercise: a session wasn't deleted.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * Deletes a walk. With no momentum launch day this is exactly the record's delete. Once there is one, a paid walk
 * deleted on the life day it was logged is taken back first (reversal rows for its WORKOUT and PR rows, one
 * transaction with the delete); deleted later, the record goes and the pay stays ("Paid Tue · the XP stays").
 */
export async function deleteExerciseCore(userId: string, id: string, now: Date = new Date()): Promise<ExerciseResult<WalkDeleteOutcome | null>> {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, error: GONE };
  if (momentumLaunchDay() == null) return deleteRecord(userId, id);
  try {
    const [session, rows] = await Promise.all([
      prisma.exerciseSession.findFirst({ where: { id, userId }, select: { id: true, createdAt: true } }),
      prisma.activityEvent.findMany({
        where: { userId, sourceId: id, source: { in: ["WORKOUT", "PR", "UNDO"] } },
        select: { id: true, source: true, sink: true, track: true, day: true, sourceId: true, xp: true, rawXp: true, countsForStreak: true, dedupeKey: true },
      }),
    ]);
    if (!session) return { ok: false, error: GONE };
    const reversed = new Set(rows.filter((r) => r.dedupeKey?.startsWith("undo:")).map((r) => r.dedupeKey!.slice(5)));
    const live = rows.filter((r) => (r.source === "WORKOUT" || r.source === "PR") && !r.dedupeKey?.startsWith("undo:") && !reversed.has(r.id));
    if (live.length === 0) return deleteRecord(userId, id);
    const xp = Math.round(live.reduce((n, r) => n + r.xp, 0) * 1000) / 1000;
    const paidDay = keyOfDateColumn((live.find((r) => r.source === "WORKOUT") ?? live[0]).day);
    const today = todayKey(now);
    const kept = async (): Promise<ExerciseResult<WalkDeleteOutcome | null>> => {
      const del = await deleteRecord(userId, id);
      return del.ok ? { ok: true, value: { kind: "KEPT", xp, day: paidDay } } : del;
    };
    if (dayKeyOf(session.createdAt) !== today) return kept();

    const ops: Prisma.PrismaPromise<unknown>[] = [
      lifeLockOp(userId),
      ...(needsSettledGuard(paidDay, today, now) ? [settledDayGuardOp(userId, paidDay)] : []),
      ...live.map((r) =>
        activityOp(
          userId,
          reversalInputOf(
            {
              id: r.id,
              source: r.source,
              sink: r.sink,
              track: (r.track as Track | null) ?? null,
              day: keyOfDateColumn(r.day),
              sourceId: r.sourceId,
              xp: r.xp,
              rawXp: r.rawXp,
              countsForStreak: r.countsForStreak,
            },
            now
          )
        )
      ),
      prisma.exerciseSession.deleteMany({ where: { id, userId } }),
    ];
    try {
      await prisma.$transaction(ops);
    } catch (err) {
      // Settled between the read and the write: the pay stands, the record goes.
      if (isSettledDay(err)) return kept();
      // Taken back already (a double tap on Delete): the first one's rows stand.
      if (!isDuplicateActivity(err)) throw err;
      await deleteRecord(userId, id);
    } finally {
      invalidate("exercise", "life", "activity");
    }
    return { ok: true, value: { kind: "REVERSED", xp } };
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    console.error("Exercise: a session wasn't deleted.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
