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
 *                                            (blueprint P27: opts.ingest writes a Health Connect walk's dedupe row
 *                                            in the session's own transaction; opts.recordOnly, the backfill, is a
 *                                            record on any day: no pay, no personal best; a walk typed by hand
 *                                            that Health Connect already brought in that day is refused with
 *                                            what is there, importedTwinOf, so it is never paid twice)
 *   logWalkMomentsCore(userId, raw, now?, opts?)  logWalkCore inside L3's moments on a live day (a PB Seal)
 *   deleteExerciseCore(userId, id, now?)   → { ok, value: WalkDeleteOutcome | null } | { ok: false, error }
 *
 * Every other kind (health-2026-10-27.md D10-D13; health-brief-2026-10-27.md §3.6 H2, H3). The view lists every
 * kind (viewOf keeps the row's kind) while its `week` and every walk reader stay walks only: the view's week, the
 * walks' pay, the hand-log twin guard (importedWalksOn) and Health Connect's match (health-ingest-server sessionsOn)
 * read kind 'WALK' alone, and the ledger readers (readLiveWalks, competency-server, snapshot) are untouched, so a
 * record is never a walk's twin, never on the walks' curve and never a walk's personal best.
 *   logSessionCore(userId, raw, now?, opts?)  → { ok, value: LoggedSession } | { ok: false, error }
 *                                            a run, a ride, a swim, a row, an elliptical, HIIT or circuit session, a
 *                                            game, yoga or mobility (never a walk, never a lift: the set logger is
 *                                            next): the ExerciseSession row alone, with its kind, variant, name and
 *                                            clientId (a resend answers the row it wrote, once). A RECORD: no
 *                                            ActivityEvent, no pay, no streak, quest, kept week, skill hour, Vitality,
 *                                            side quest or calibration input. "Counts as" (a session dated today and
 *                                            not refused) ticks the user's own linked EXERCISE habit as a manual tick
 *                                            would, at the habit's own price (tasks.ts completeLinkedCore asTick); a
 *                                            habit ticked already that day (by hand or by a walk) is left as it is; a
 *                                            resend answers from the habit its first save ticked, never a second one;
 *                                            a walk's refusal words are said for a record (recordLinkErrorOf)
 *   logSessionMomentsCore(userId, raw, now?, opts?)  logSessionCore, and for a "Counts as" tick on a live day the
 *                                            moments a manual tick returns (a streak milestone, a habit rung, the
 *                                            BODY quest done); the record has no moments of its own
 *   deleteSessionCore(userId, id)          → { ok, value: null } | { ok: false, error }  a record's delete: the row
 *                                            alone, since nothing was paid (a walk's delete is deleteExerciseCore's);
 *                                            the view names the habit a record ticked (view.counted), which stays
 * The added columns (migration 20270104000000_strength_sets) may be missing on a database it has not reached: the
 * view then falls back to the walk-only read (kindsReady false: the card is the walking card it always was), and
 * logSessionCore says so in one plain line (KINDS_NOT_READY). A walk never reads or writes an added column.
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
import { activityOp, invalidateActivity, isDuplicateActivity } from "./activity";
import { HC_WALK_INGESTED, alreadyHereLineOf, importedTwinOf, ingestEventInput, isIngestReceipt, type IngestReceipt, type SameDaySession } from "./health-ingest";
import { LIFE_TZ, addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, weekKeyOf, type DayKey } from "./life-day";
import {
  RECORD_KINDS,
  bodyQuestDoneBy,
  cleanSessionInput,
  cleanWalkInput,
  exerciseWeekOf,
  isExerciseKind,
  isWalkReceipt,
  linkCandidateOf,
  paidFactsOf,
  personalBestsOf,
  prEventInput,
  priceWalk,
  reversalInputOf,
  sessionRefusalOf,
  walkEventInput,
  walkReceiptOf,
  type ExerciseKind,
  type ExerciseSessionView,
  type ExerciseWeek,
  type RawSessionInput,
  type SessionLinkOutcome,
  type SessionPayView,
  type SessionRefusal,
  type SessionView,
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
import { exerciseMinutesCount } from "./proof";
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
import { LINKED_KIND_REFUSAL, LINKED_NOT_EXERCISE, LINKED_NOT_LIVE, LINKED_WORK_REFUSAL, isDoneStatus, withMoments } from "./today-board";
import type { SnapshotPart } from "./celebration-detect";
import type { CelebrationEvent } from "./celebration-types";
import type { Receipt, Track } from "./life-types";

export type ExerciseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const EXERCISE_HISTORY_DAYS = 90;
export const EXERCISE_NOT_READY = "Exercise logging needs a one-time database update first.";
/** logSessionCore before the strength_sets migration: the added columns aren't there, so only a walk can be saved. */
export const KINDS_NOT_READY = "Kinds other than walking need a one-time database update first. Walks log as before.";
/** logSessionCore is never a walk's path: a walk is priced and paid by logWalkCore alone. */
export const SESSION_WALK_ELSEWHERE = "A walk is logged with Log walk.";
/** LIFT is a placeholder in this phase (health-2026-10-27.md D24 phase 4): no lift is written until the set logger. */
export const LIFT_NOT_YET = "The lift logger arrives next. Lifts can't be saved here yet.";
const SAVE_FAILED = "Couldn't save that. Try again.";
const GONE = "That session is no longer here.";

/**
 * A listed session: every ExerciseSessionView field, and the added columns when the view read them (kindsReady). The
 * fallback read (before the migration) lists walks with none of them; a check's fixture may leave them out too.
 */
export type ListedSession = ExerciseSessionView & Partial<Omit<SessionView, keyof ExerciseSessionView>>;

export interface ExerciseView {
  today: DayKey;
  /** The last EXERCISE_HISTORY_DAYS of sessions of every kind (walks only before the migration), newest first. */
  sessions: ListedSession[];
  /** This week's walks (exerciseWeekOf over the walks alone). */
  week: ExerciseWeek;
  /** False when the table isn't there yet (the form says so instead of failing on save). */
  ready: boolean;
  /**
   * The added columns are there (migration 20270104000000_strength_sets): the card offers every kind. False or absent:
   * the walk-only fallback, and the card is the walking card it always was.
   */
  kindsReady?: boolean;
  /** Momentum is live today (only with { momentum: true }): the card shows the pay lines and "Counts as". Absent before launch. */
  live?: boolean;
  /** The personal EXERCISE habit due today and not done: the form pre-selects "Counts as: <title>". Live days only. */
  link?: { templateId: string; title: string } | null;
  /** Each paid session's pay, by session id. Live days only. */
  paid?: Record<string, SessionPayView>;
  /**
   * The habit each record session ticked ("Counts as"), by session id: its title. Live days only. Its tick stays when the
   * record is deleted, and the card says so on the Sure? step.
   */
  counted?: Record<string, string>;
}

/** A logged walk, with what it paid on a live day (absent before launch: a record, as always). */
export interface LoggedWalk extends ExerciseSessionView {
  pay?: WalkPay;
}

/** A logged record session (logSessionCore): the row, why it would never count (null: it would), and "Counts as". */
export interface LoggedSession extends SessionView {
  refusal: SessionRefusal | null;
  /** What "Counts as" did; null when it was not asked for (or the session is not dated today). */
  link: SessionLinkOutcome | null;
  /** A resend of the same clientId: the row that key wrote first, nothing new written. */
  replay: boolean;
}

/** The table is not there yet (the migration has not reached this database). */
export function isMissingExerciseTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*ExerciseSession[`"]? does not exist/i.test(message);
}

/** The ExerciseSession columns migration 20270104000000_strength_sets adds. */
const ADDED_COLUMNS = /\b(variant|label|startedAt|endedAt|avgHr|maxHr|avgWatts|poolM|sessionRpe|clientId)\b/;

/**
 * The added ExerciseSession columns are not there yet (the strength_sets migration has not reached this database:
 * P2022, Postgres 42703), or the client predates them (competency-server.ts isMissingSkillSchema's pattern).
 */
export function isMissingSessionColumns(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (err instanceof Prisma.PrismaClientValidationError) return ADDED_COLUMNS.test(message);
  return /\b(P2022|42703)\b|column [`"]?[^`"\s]*[`"]? does not exist/i.test(message);
}

/** A unique index refused the row (P2002): for a session, its (userId, clientId). */
function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2002|23505)\b|Unique constraint failed/i.test(message);
}

type Row = { id: string; day: Date; kind: string; angleDeg: number; distanceKm: number; durationMin: number; note: string | null };
/** The row as it is, its kind kept (H2: never forced to a walk). A kind outside EXERCISE_KINDS is never listed (loadExerciseView). */
const viewOf = (r: Row): ExerciseSessionView => ({
  id: r.id,
  kind: isExerciseKind(r.kind) ? r.kind : "WALK",
  day: keyOfDateColumn(r.day),
  angleDeg: r.angleDeg,
  distanceKm: r.distanceKm,
  durationMin: r.durationMin,
  note: r.note,
});

type FullRow = Row & {
  variant: string | null;
  label: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  avgHr: number | null;
  maxHr: number | null;
  avgWatts: number | null;
  poolM: number | null;
  sessionRpe: number | null;
  clientId: string | null;
};

/** Every column, the added ones included: read only where the fallback to the walk-only read is in place. */
const FULL_SELECT = {
  id: true,
  day: true,
  kind: true,
  angleDeg: true,
  distanceKm: true,
  durationMin: true,
  note: true,
  variant: true,
  label: true,
  startedAt: true,
  endedAt: true,
  avgHr: true,
  maxHr: true,
  avgWatts: true,
  poolM: true,
  sessionRpe: true,
  clientId: true,
} as const;

/** A full row as a SessionView. poolM is a float4 (REAL), so it is rounded back to the 0.01 m it was written to. */
const sessionViewOf = (r: FullRow): SessionView => ({
  ...viewOf(r),
  variant: r.variant,
  label: r.label,
  poolM: r.poolM == null ? null : Math.round(r.poolM * 100) / 100,
  avgWatts: r.avgWatts,
  avgHr: r.avgHr,
  maxHr: r.maxHr,
  sessionRpe: r.sessionRpe,
  startedAt: r.startedAt ? r.startedAt.toISOString() : null,
  endedAt: r.endedAt ? r.endedAt.toISOString() : null,
  clientId: r.clientId,
});

const isWalk = (s: { kind: string }): boolean => s.kind === "WALK";

/**
 * Before the strength_sets migration the full read fails on every load (a wasted round trip): once it has, the view
 * reads walks only for this long, then tries the full read again (so the kinds appear soon after the migration).
 */
const COLUMNS_RETRY_MS = 10 * 60_000;
let columnsMissingUntil = 0;

export async function loadExerciseView(userId: string, now: Date = new Date(), opts: { momentum?: boolean } = {}): Promise<ExerciseView> {
  const today = todayKey(now);
  const view = await cached(`exercise:${userId}:${today}`, ["exercise"], async (): Promise<ExerciseView> => {
    const where = { userId, day: { gte: dateColumn(addDays(today, -EXERCISE_HISTORY_DAYS)) } };
    const orderBy = [{ day: "desc" as const }, { createdAt: "desc" as const }];
    try {
      let sessions: ListedSession[] | null = null;
      let kindsReady = false;
      if (Date.now() >= columnsMissingUntil) {
        try {
          const rows = await prisma.exerciseSession.findMany({ where, orderBy, select: FULL_SELECT });
          sessions = rows.filter((r) => isExerciseKind(r.kind)).map(sessionViewOf);
          kindsReady = true;
        } catch (err) {
          if (!isMissingSessionColumns(err)) throw err;
          columnsMissingUntil = Date.now() + COLUMNS_RETRY_MS;
        }
      }
      // Before the strength_sets migration: the walks alone, with the columns they always had (the card is walking only).
      if (!sessions) sessions = (await prisma.exerciseSession.findMany({ where: { ...where, kind: "WALK" }, orderBy, select: SESSION_SELECT })).map(viewOf);
      return { today, sessions, week: exerciseWeekOf(sessions.filter(isWalk), today), ready: true, kindsReady };
    } catch (err) {
      if (!isMissingExerciseTable(err)) console.error("Exercise: the sessions failed to load; showing none.", err);
      return { today, sessions: [], week: exerciseWeekOf([], today), ready: !isMissingExerciseTable(err), kindsReady: false };
    }
  });
  // Momentum's parts only where asked for (Train › Exercise) and only on a live day: before launch the view is exactly the record.
  if (!opts.momentum || !momentumLive(today) || !view.ready) return view;
  return { ...view, ...(await loadWalkMomentum(userId, today, view.sessions)) };
}

/**
 * The live day's extras: each listed walk's pay (live WORKOUT and PR rows; a record kind writes none) and the "Counts
 * as" habit (a walk's, and a record session's, which ticks it at its own price), and the habit each listed record
 * ticked (recordTicksOf). Fail soft.
 */
async function loadWalkMomentum(userId: string, today: DayKey, sessions: readonly ExerciseSessionView[]): Promise<Pick<ExerciseView, "live" | "link" | "paid" | "counted">> {
  const ids = sessions.filter(isWalk).map((s) => s.id);
  // Records only: a walk's SESSION tick carries its id too, and its pay line already says what it did.
  const recordIds = sessions.filter((s) => !isWalk(s)).map((s) => s.id);
  // Logging and deleting invalidate 'exercise'; a tick or an undo on the board, 'life' and 'activity'.
  return cached(`exerciseMomentum:${userId}:${today}`, ["exercise", "life", "activity"], async () => {
    const counted = await recordTicksOf(userId, today, recordIds);
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
      return { live: true, link, paid, counted };
    } catch (err) {
      console.error("Exercise: the walks' pay failed to load; showing none.", err);
      return { live: true, link: null, paid: {}, counted };
    }
  });
}

/**
 * The habit each listed record session ticked ("Counts as": its done instance carries the session's id), by session id:
 * the habit's title. On the (userId, day) index: a record ticks its habit on its own day, inside the view's days. Fail
 * soft: none.
 */
async function recordTicksOf(userId: string, today: DayKey, ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  try {
    const rows = await prisma.taskInstance.findMany({
      where: { userId, day: { gte: dateColumn(addDays(today, -EXERCISE_HISTORY_DAYS)) }, workoutId: { in: [...ids] } },
      select: { workoutId: true, status: true, template: { select: { title: true } } },
    });
    const out: Record<string, string> = {};
    for (const r of rows) if (r.workoutId && isDoneStatus(r.status)) out[r.workoutId] = r.template.title;
    return out;
  } catch (err) {
    console.error("Exercise: the records' habit ticks failed to load; showing none.", err);
    return {};
  }
}

/** How far back the "Counts as" read looks for a habit's done days (an AFTER rule's last done, a target's week). */
const LINK_HISTORY_DAYS = 400;

export interface LogWalkOptions {
  /** "Counts as": the personal EXERCISE template this walk completes (live days, a walk dated today only). */
  countsAs?: string | null;
  /**
   * Health Connect (blueprint P27; health-ingest.ts): the walk's dedupe row ('ingest:hc:<externalId>', an INGEST row),
   * written in one transaction with the session, so a resend writes nothing twice (HC_WALK_INGESTED).
   */
  ingest?: IngestReceipt;
  /** P27 (H17): the history backfill is a record only, whatever its day: no pay and no personal bests. */
  recordOnly?: boolean;
}

const SESSION_SELECT = { id: true, day: true, kind: true, angleDeg: true, distanceKm: true, durationMin: true, note: true } as const;

export async function logWalkCore(userId: string, raw: Parameters<typeof cleanWalkInput>[0], now: Date = new Date(), opts: LogWalkOptions = {}): Promise<ExerciseResult<LoggedWalk>> {
  const clean = cleanWalkInput(raw, todayKey(now));
  if (!clean.ok) return clean;
  const v = clean.value;
  // P27: a walk typed by hand that Health Connect already brought in that day (the import's match, the other way
  // round): refused with what is there, nothing written, so one walk is never paid twice.
  if (!opts.ingest) {
    const twin = importedTwinOf(v, await importedWalksOn(userId, v.day));
    if (twin) return { ok: false, error: alreadyHereLineOf(twin) };
  }
  let session: ExerciseSessionView;
  try {
    const data = { userId, day: dateColumn(v.day), kind: "WALK", angleDeg: v.angleDeg, distanceKm: v.distanceKm, durationMin: v.durationMin, note: v.note };
    const row = opts.ingest ? await createIngested(userId, data, v.day, opts.ingest, now) : await prisma.exerciseSession.create({ data, select: SESSION_SELECT });
    invalidate("exercise");
    session = viewOf(row);
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    // P27: the walk's key landed first (a raced resend): it is here already, and nothing was written.
    if (opts.ingest && isDuplicateActivity(err)) return { ok: false, error: HC_WALK_INGESTED };
    console.error("Exercise: a walk wasn't saved.", err);
    return { ok: false, error: SAVE_FAILED };
  }
  // Before launch (and on any day before it) the walk is a record, never a reward: exactly as it always was.
  if (!momentumLive(session.day)) return { ok: true, value: session };
  // P27 (H17): a Health Connect walk from before the sync was switched on is history: recorded, never paid, no PB.
  if (opts.recordOnly) return { ok: true, value: session };
  // The record is saved whatever the pay does next.
  const pay = await payWalkCore(userId, session, now, opts);
  return { ok: true, value: { ...session, pay } };
}

/**
 * The walks Health Connect brought in on one life day (each with its own INGEST row naming it, not a match), as
 * health-ingest.ts reads them: the hand-log guard's read. Walks only (H3): a run or a swim is never a walk's twin.
 * A failed read is none (logged): it never blocks a walk.
 */
async function importedWalksOn(userId: string, day: DayKey): Promise<SameDaySession[]> {
  try {
    const sessions = await prisma.exerciseSession.findMany({ where: { userId, day: dateColumn(day), kind: "WALK" }, select: { id: true, durationMin: true, distanceKm: true } });
    if (sessions.length === 0) return [];
    const rows = await prisma.activityEvent.findMany({ where: { userId, source: "INGEST", sourceId: { in: sessions.map((s) => s.id) } }, select: { sourceId: true, receipt: true } });
    const at = new Map<string, { start: Date; end: Date }>();
    for (const r of rows) {
      if (r.sourceId && isIngestReceipt(r.receipt) && !r.receipt.matched) at.set(r.sourceId, { start: new Date(r.receipt.start), end: new Date(r.receipt.end) });
    }
    return sessions.filter((s) => at.has(s.id)).map((s) => ({ id: s.id, day, durationMin: s.durationMin, distanceKm: s.distanceKm, at: at.get(s.id) ?? null, claimed: false }));
  } catch (err) {
    if (!isMissingExerciseTable(err)) console.error("Exercise: the Health Connect walks of a day weren't read; the walk is logged.", err);
    return [];
  }
}

/**
 * A Health Connect walk's session and its INGEST row ('ingest:hc:<externalId>', health-ingest.ts ingestEventInput) in
 * one transaction: the session's id is minted here, so the row names it. The key's unique index refuses a second one
 * (P2002), and the session goes with it.
 */
async function createIngested(
  userId: string,
  data: Prisma.ExerciseSessionUncheckedCreateInput,
  day: DayKey,
  receipt: IngestReceipt,
  now: Date
): Promise<Row> {
  const id = globalThis.crypto.randomUUID();
  const event = ingestEventInput(id, day, receipt, now);
  try {
    const [row] = await prisma.$transaction([prisma.exerciseSession.create({ data: { ...data, id }, select: SESSION_SELECT }), activityOp(userId, event)]);
    return row;
  } finally {
    invalidateActivity(event);
  }
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

/**
 * A tick receipt's effort minutes (minutes × the WHO weight of its B), for an EXERCISE habit a walk tops up. Proof of
 * work (blueprint P23; forward only): a tick priced from PROOF_LAUNCH_DAY with no minutes reported counted none, so
 * there is nothing to take off the walk's (proof.ts exerciseMinutesCount).
 */
function effortOfReceipt(receipt: Prisma.JsonValue): number {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return 0;
  if (!exerciseMinutesCount(receipt as Pick<Receipt, "proof">)) return 0;
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

// ── Every other kind: records (health-2026-10-27.md D10-D13) ───────────────

/** The kinds logSessionCore writes: every record kind but LIFT, whose sessions the set logger writes (phase 4). */
const SESSION_CORE_KINDS: readonly ExerciseKind[] = RECORD_KINDS.filter((k) => k !== "LIFT");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface LogSessionOptions {
  /** "Counts as": the personal EXERCISE habit this session ticks (a session dated today), at the habit's own price. */
  countsAs?: string | null;
}

/** The session a clientId wrote first (a resend), or null. */
async function sessionByClientId(userId: string, clientId: string): Promise<SessionView | null> {
  const row = await prisma.exerciseSession.findFirst({ where: { userId, clientId }, select: FULL_SELECT });
  return row && isExerciseKind(row.kind) ? sessionViewOf(row) : null;
}

/**
 * The habit a record session's first save ticked (its done instance carries the session's id), or null: a resend
 * answers from that habit. On the (userId, day) index. Fail soft: null.
 */
async function habitCountedBy(userId: string, s: SessionView): Promise<string | null> {
  const rows = await prisma.taskInstance.findMany({ where: { userId, day: dateColumn(s.day), workoutId: s.id }, select: { templateId: true, status: true } }).catch(() => []);
  return rows.find((r) => isDoneStatus(r.status))?.templateId ?? null;
}

/** completeLinkedCore's refusals are a walk's words (the walk keeps them): a record says its own. Any other as it is. */
const RECORD_LINK_WORDS: Readonly<Record<string, string>> = {
  [LINKED_NOT_EXERCISE]: "Only an exercise task or habit can be counted",
  [LINKED_KIND_REFUSAL]: "Only a task or a habit can be counted",
  [LINKED_WORK_REFUSAL]: "A work tab's task is kept out of the game",
  [LINKED_NOT_LIVE]: "It counts only once momentum is live on its day",
};

/** A record's "not counted" reason in its own words (sessionLoggedLineOf says it after "not counted as the habit:"). */
export function recordLinkErrorOf(error: string): string {
  return RECORD_LINK_WORDS[error] ?? error;
}

/**
 * "Counts as" for a record session: tasks.ts completeLinkedCore with asTick, the habit's own tick as a manual one
 * would be (its price, its proof rules with the session's minutes, its streak unit), never SESSION and never a
 * walk's top-up. The same session again (a resend) answers as the first call; a habit ticked already that day
 * writes nothing and says so. Never throws: the session is saved whatever happens here.
 */
async function linkRecord(userId: string, templateId: string, s: SessionView, now: Date): Promise<SessionLinkOutcome> {
  try {
    const res = await completeLinkedCore({ userId, templateId, day: s.day, workoutId: s.id, minutes: Math.max(1, Math.round(s.durationMin)), at: now, asTick: true });
    if (!res.ok) return { kind: "NOT_COUNTED", error: recordLinkErrorOf(res.error) };
    const t = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { title: true } });
    const title = t?.title ?? "the habit";
    return res.tickedRaw == null ? { kind: "COUNTED", title } : { kind: "ALREADY", title };
  } catch (err) {
    console.error("Exercise: a session wasn't counted as its habit.", err);
    return { kind: "NOT_COUNTED", error: "Couldn't count it as the habit." };
  }
}

/**
 * Logs a session of a record kind (a run, a ride, a swim, a row, an elliptical, HIIT or circuit session, a game, yoga
 * or mobility): exercise.ts cleanSessionInput checks it, then one ExerciseSession row with its kind, variant, name
 * and clientId. A RECORD: no ActivityEvent of its own (no WORKOUT, PR or INGEST row), no pay, and nothing for the
 * streak, a quest, a kept week, a skill hour, Vitality, a side quest or calibration (SESSION_PAY_LAUNCH_DAY is null and
 * nothing here reads it). A walk is refused here (logWalkCore is its one path), and so is a lift (the set logger is
 * next). A clientId already written answers the row it wrote (replay), and "Counts as" runs again only through its
 * own idempotent path, on the habit the first save ticked (habitCountedBy) whatever the resend asks: one session
 * never ticks a second habit. "Counts as" (opts.countsAs) is tried for a session dated today that sessionRefusalOf
 * does not refuse (a walk's rule: a refused walk counts as no habit either).
 */
export async function logSessionCore(userId: string, raw: RawSessionInput, now: Date = new Date(), opts: LogSessionOptions = {}): Promise<ExerciseResult<LoggedSession>> {
  const today = todayKey(now);
  const clean = cleanSessionInput(raw ?? {}, today);
  if (!clean.ok) return clean;
  const v = clean.value;
  if (v.kind === "WALK") return { ok: false, error: SESSION_WALK_ELSEWHERE };
  if (!SESSION_CORE_KINDS.includes(v.kind)) return { ok: false, error: LIFT_NOT_YET };
  let session: SessionView;
  let replay = false;
  try {
    const row = await prisma.exerciseSession.create({
      data: {
        userId,
        day: dateColumn(v.day),
        kind: v.kind,
        angleDeg: v.angleDeg,
        distanceKm: v.distanceKm,
        durationMin: v.durationMin,
        note: v.note,
        variant: v.variant,
        label: v.label,
        poolM: v.poolM,
        avgWatts: v.avgWatts,
        avgHr: v.avgHr,
        maxHr: v.maxHr,
        sessionRpe: v.sessionRpe,
        clientId: v.clientId,
      },
      select: FULL_SELECT,
    });
    invalidate("exercise");
    session = sessionViewOf(row);
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    if (isMissingSessionColumns(err)) return { ok: false, error: KINDS_NOT_READY };
    // The clientId landed first (a retried save, a double tap): that row is the answer, and nothing new is written.
    const prior = v.clientId && isUniqueViolation(err) ? await sessionByClientId(userId, v.clientId).catch(() => null) : null;
    if (!prior) {
      console.error("Exercise: a session wasn't saved.", err);
      return { ok: false, error: SAVE_FAILED };
    }
    session = prior;
    replay = true;
  }
  const refusal = sessionRefusalOf(session);
  const asked = typeof opts.countsAs === "string" && ID_RE.test(opts.countsAs) ? opts.countsAs : null;
  // A resend answers from the habit its first save ticked (a "Counts as" changed since never ticks a second one).
  const counted = replay && !refusal && session.day === today ? await habitCountedBy(userId, session) : null;
  const countsAs = counted ?? asked;
  let link: SessionLinkOutcome | null = null;
  if (countsAs && session.day === today) {
    link = refusal ? { kind: "NOT_COUNTED", error: "this session can't count" } : await linkRecord(userId, countsAs, session, now);
  }
  return { ok: true, value: { ...session, refusal, link, replay } };
}

/**
 * logSession's path (actions/exercise.ts): logSessionCore, and for a "Counts as" tick on a live day the moments a
 * manual tick returns (actions/tasks.ts completeTask's aroundTick: a streak milestone, a habit rung, the BODY quest
 * done), from the snapshot a manual tick takes (scope 'tick', the habit's template), returned as `celebrations`. The
 * record has no moments of its own: with no "Counts as", a session not dated today, or a day momentum is not live,
 * it is logSessionCore exactly (no snapshot, no extra read); a refused, repeated or already-ticked link takes no
 * second snapshot.
 */
export async function logSessionMomentsCore(
  userId: string,
  raw: RawSessionInput,
  now: Date = new Date(),
  opts: LogSessionOptions = {}
): Promise<ExerciseResult<LoggedSession & { celebrations?: CelebrationEvent[] }>> {
  const today = todayKey(now);
  const countsAs = typeof opts.countsAs === "string" && ID_RE.test(opts.countsAs) ? opts.countsAs : null;
  const day = raw && typeof raw.day === "string" && raw.day !== "" ? raw.day : today;
  if (!countsAs || day !== today || !momentumLive(today)) return logSessionCore(userId, raw, now, opts);
  return withMoments({
    snapshot: () => captureSnapshot(userId, { scope: "tick", templateIds: [countsAs] }),
    detect: (before, after) => detectCelebrations(before, after, { cause: "tick", now }),
    write: () => logSessionCore(userId, raw, now, { countsAs }),
    changed: (v) => v.link?.kind === "COUNTED" && !v.replay,
  });
}

/**
 * Deletes a record session (a kind logSessionCore writes): the row alone, since a record wrote no ledger row and paid
 * nothing; a habit it counted as stays ticked, as a manual tick does (its own Undo is on Today). A walk is never
 * deleted here (deleteExerciseCore takes its pay back first), nor a lift (its entries and sets go with it, phase 4).
 */
export async function deleteSessionCore(userId: string, id: string): Promise<ExerciseResult<null>> {
  if (typeof id !== "string" || !ID_RE.test(id)) return { ok: false, error: GONE };
  try {
    const out = await prisma.exerciseSession.deleteMany({ where: { id, userId, kind: { in: [...SESSION_CORE_KINDS] } } });
    invalidate("exercise");
    return out.count > 0 ? { ok: true, value: null } : { ok: false, error: GONE };
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    console.error("Exercise: a session wasn't deleted.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
