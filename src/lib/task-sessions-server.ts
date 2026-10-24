/**
 * Proof of work's timers and reads (server only; the rules are proof.ts; blueprint P23, decision D20). The TaskSession
 * table (migration 20270101000000_task_proof) is written here and nowhere else, except the one column a tick sets
 * when it counts a timer (tasks.ts settleOnce: `minutes`, and `endedAt` when it was still running), inside the tick's
 * own transaction. Nothing here pays, prices or writes the ledger: a timer is a record of time, and only the tick that
 * counts it pays (tasks.ts, through life-grade priceTask's 'life-3' receipt).
 *
 *   startTimerCore(userId, {templateId, clientId, source}, deps?)   starts a template's timer. One running timer a
 *                                  user at a time: a start stops any other running one first (so two deep-work tasks
 *                                  can never count the same minutes), in one transaction. A template's running timer
 *                                  from today or yesterday is returned as is (a second start never opens a second
 *                                  one); one left running from before that is stopped by the new start, never a dead
 *                                  end. A start on a task whose timer is stopped is its Resume: a new segment the tick
 *                                  counts with the earlier ones. A resend of the same clientId answers the session it
 *                                  started (TaskSession's unique (userId, clientId)), and two devices starting at once
 *                                  both get an answer (the running-timer index's race is retried once).
 *   stopTimerCore(userId, {sessionId}, deps?)   stops it (endedAt); a stopped one answers as it stands.
 *   discardTimerCore(userId, {sessionId}, deps?)   Discard: the task's timer that day (every segment) is closed
 *                                  counting nothing (`minutes` 0, stopped if it ran), so no tick counts it.
 *   loadBoardProof(userId, today, deps?)        BoardData.proof and the templates' proof kinds, read only while proof
 *                                  is in force today (null otherwise, with no read); the open timers from yesterday on.
 *   readCompletionProof(userId, templateId, day, deps?)   what a tick of one template reads while proof is in force:
 *                                  its proof kind, its previous tick that life day and its timers not yet counted.
 *
 * Every write needs lifeWritesEnabled(env) (production, or XTNL_LIFE_JUDGE=1 on the local rehearsal): dev and prod share
 * one database, so a dev server records nothing and says so (TIMER_WRITES_OFF). A start also needs proof in force
 * (PROOF_LAUNCH_DAY, null until the user's go: TIMER_OFF); a stop does not, so a rollback never strands a running timer.
 * A missing table (the migration not applied) reads as no timers and no proof kinds, never as a failed board.
 *
 * The store and the clock are injectable (SessionDeps), so scripts/proof-check.ts drives every core with no database.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { lifeWritesEnabled, type LifeEnv } from "./life-economy";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, type DayKey } from "./life-day";
import {
  TIMER_GONE,
  TIMER_NOT_READY,
  TIMER_OFF,
  TIMER_TEMPLATE_REFUSAL,
  TIMER_WRITES_OFF,
  groupTimerOf,
  openTimersOf,
  proofKindOf,
  proofLaunchDay,
  proofOn,
  segmentSharesOf,
  timerGroupsOf,
  type ProofKind,
  type SessionRow,
  type SessionSource,
  type TimerView,
} from "./proof";
import type { BoardProof } from "./today-board";
import { completesItself } from "./life-types";

export type TimerResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): TimerResult<T> => ({ ok: true, value });
const fail = <T>(error: string): TimerResult<T> => ({ ok: false, error });

/** The statuses a previous tick reads as done (today-board isDoneStatus's). */
const DONE_STATUSES = ["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"];

/** A missing TaskSession table or TaskTemplate.proof column: the migration is not applied yet. */
export function isMissingProofSchema(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2021" || err.code === "P2022")) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|P2022|42P01|42703)\b|(relation|table) [`"][^`"]*TaskSession[`"]? does not exist|column [`"]?[^`"\s]*proof[`"]? does not exist/i.test(message);
}

/** A template as a start reads it. */
export interface TimerTemplate {
  id: string;
  kind: string;
  boardId: string | null;
  archivedAt: Date | null;
  autoMetric: string | null;
}

/** The table, as the cores use it; the real one is Prisma. */
export interface SessionStore {
  template(userId: string, templateId: string): Promise<TimerTemplate | null>;
  byClientId(userId: string, clientId: string): Promise<SessionRow | null>;
  byId(userId: string, id: string): Promise<SessionRow | null>;
  /** The user's running sessions (endedAt null). */
  running(userId: string): Promise<SessionRow[]>;
  /** In one transaction: stop every running session of the user at `at`, then insert this one. */
  start(userId: string, data: { templateId: string; day: DayKey; startedAt: Date; source: SessionSource; clientId: string }): Promise<SessionRow>;
  /** Stops one running session at `at` (endedAt null only); the row as it then stands. */
  stop(userId: string, id: string, at: Date): Promise<SessionRow | null>;
  /** The user's sessions not yet counted (minutes null) that started on `since` or later. */
  open(userId: string, since: DayKey): Promise<SessionRow[]>;
  /** One template's sessions not yet counted that started on `since` or later. */
  openOf(userId: string, templateId: string, since: DayKey): Promise<SessionRow[]>;
  /** Closes these sessions counting nothing (Discard): `minutes` 0, and stopped at `at` if they still ran. Not-yet-counted ones only. */
  close(userId: string, ids: readonly string[], at: Date): Promise<void>;
  /** The user's live templates carrying a proof kind. */
  proofKinds(userId: string): Promise<{ id: string; proof: string | null }[]>;
  /** One template's proof kind and its latest done tick's instant on life day `day` (an Again's bound; none on other days). */
  tickFacts(userId: string, templateId: string, day: DayKey): Promise<{ proof: string | null; prevTickAt: Date | null }>;
}

const SESSION_SELECT = { id: true, templateId: true, day: true, startedAt: true, endedAt: true, minutes: true, source: true, clientId: true } as const;

type SessionDbRow = { id: string; templateId: string; day: Date; startedAt: Date; endedAt: Date | null; minutes: number | null; source: string; clientId: string };

const rowOf = (r: SessionDbRow): SessionRow => ({ ...r, day: keyOfDateColumn(r.day) });

export const prismaSessionStore: SessionStore = {
  template: (userId, templateId) =>
    prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { id: true, kind: true, boardId: true, archivedAt: true, autoMetric: true } }),
  byClientId: async (userId, clientId) => {
    const r = await prisma.taskSession.findUnique({ where: { userId_clientId: { userId, clientId } }, select: SESSION_SELECT });
    return r ? rowOf(r) : null;
  },
  byId: async (userId, id) => {
    const r = await prisma.taskSession.findFirst({ where: { id, userId }, select: SESSION_SELECT });
    return r ? rowOf(r) : null;
  },
  running: async (userId) => (await prisma.taskSession.findMany({ where: { userId, endedAt: null }, select: SESSION_SELECT })).map(rowOf),
  start: async (userId, data) => {
    const [, created] = await prisma.$transaction([
      prisma.taskSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: data.startedAt } }),
      prisma.taskSession.create({
        data: { userId, templateId: data.templateId, day: dateColumn(data.day), startedAt: data.startedAt, source: data.source, clientId: data.clientId },
        select: SESSION_SELECT,
      }),
    ]);
    return rowOf(created);
  },
  stop: async (userId, id, at) => {
    await prisma.taskSession.updateMany({ where: { id, userId, endedAt: null }, data: { endedAt: at } });
    const r = await prisma.taskSession.findFirst({ where: { id, userId }, select: SESSION_SELECT });
    return r ? rowOf(r) : null;
  },
  open: async (userId, since) =>
    (await prisma.taskSession.findMany({ where: { userId, minutes: null, day: { gte: dateColumn(since) } }, select: SESSION_SELECT })).map(rowOf),
  openOf: async (userId, templateId, since) =>
    (await prisma.taskSession.findMany({ where: { userId, templateId, minutes: null, day: { gte: dateColumn(since) } }, select: SESSION_SELECT })).map(rowOf),
  close: async (userId, ids, at) => {
    if (ids.length === 0) return;
    await prisma.$transaction(closeSessionOps(userId, ids, at));
  },
  proofKinds: (userId) => prisma.taskTemplate.findMany({ where: { userId, archivedAt: null, boardId: null, proof: { not: null } }, select: { id: true, proof: true } }),
  tickFacts: async (userId, templateId, day) => {
    const [t, prev] = await Promise.all([
      prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { proof: true } }),
      // That life day's own ticks only (an Again's bound): a record of yesterday, or yesterday's tick, never bounds today's.
      prisma.taskInstance.findFirst({
        where: { userId, templateId, day: dateColumn(day), status: { in: DONE_STATUSES }, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true },
      }),
    ]);
    return { proof: t?.proof ?? null, prevTickAt: prev?.completedAt ?? null };
  },
};

export interface SessionDeps {
  store?: SessionStore;
  now?: () => Date;
  /** PROOF_LAUNCH_DAY in force; undefined reads proofLaunchDay(). */
  launchDay?: DayKey | null;
  env?: LifeEnv;
}

const depsOf = (d: SessionDeps = {}) => ({
  store: d.store ?? prismaSessionStore,
  now: d.now ?? (() => new Date()),
  launchDay: d.launchDay === undefined ? proofLaunchDay() : d.launchDay,
  writesOn: lifeWritesEnabled(d.env),
});

/** A template a timer may run on: a live task or habit on the personal Board that does not complete itself (a pages task does not: P24). */
export function timerTemplateRefusalOf(t: TimerTemplate | null): string | null {
  if (!t) return "That task no longer exists.";
  if (t.archivedAt) return "That task is archived.";
  if ((t.kind !== "TASK" && t.kind !== "HABIT") || t.boardId != null || completesItself(t.autoMetric)) return TIMER_TEMPLATE_REFUSAL;
  return null;
}

/** A unique-index race (P2002): the clientId's (a resend) or the one-running-timer index's (two devices at once). */
const isUniqueRace = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** A session as the timer it is part of: its group's (the task's segments that life day), with the earlier ones' minutes. */
async function viewOf(store: SessionStore, userId: string, s: SessionRow): Promise<TimerView> {
  if (s.minutes != null) return groupTimerOf([s]);
  const group = timerGroupsOf(await store.openOf(userId, s.templateId, s.day)).find((g) => g.some((x) => x.id === s.id));
  return groupTimerOf(group ?? [s]);
}

/**
 * Starts a template's timer (proof in force, writes on); idempotent on clientId and on a running timer of today or
 * yesterday. A timer of this task left running from before yesterday is no answer (no board shows it and no tick
 * counts it): the start stops it with every other running one and opens a fresh one. A stopped timer of the task
 * today is resumed: the new segment joins it.
 */
export async function startTimerCore(
  userId: string,
  input: { templateId: string; clientId: string; source: SessionSource },
  deps: SessionDeps = {}
): Promise<TimerResult<TimerView>> {
  const d = depsOf(deps);
  const now = d.now();
  const today = dayKeyOf(now);
  if (!d.writesOn) return fail(TIMER_WRITES_OFF);
  if (!proofOn(today, d.launchDay)) return fail(TIMER_OFF);
  const since = addDays(today, -1);
  try {
    const again = await d.store.byClientId(userId, input.clientId);
    if (again) return ok(await viewOf(d.store, userId, again));
    const refusal = timerTemplateRefusalOf(await d.store.template(userId, input.templateId));
    if (refusal) return fail(refusal);
    const runningOf = async () => (await d.store.running(userId)).find((s) => s.templateId === input.templateId && s.day >= since) ?? null;
    const running = await runningOf();
    if (running) return ok(await viewOf(d.store, userId, running));
    const data = { templateId: input.templateId, day: today, startedAt: now, source: input.source, clientId: input.clientId };
    for (let attempt = 1; ; attempt++) {
      try {
        return ok(await viewOf(d.store, userId, await d.store.start(userId, data)));
      } catch (err) {
        if (!isUniqueRace(err)) throw err;
        // The same clientId raced in on another instance: what it started is the answer.
        const raced = await d.store.byClientId(userId, input.clientId);
        if (raced) return ok(await viewOf(d.store, userId, raced));
        // Another device started a timer at the same moment (the one-running-timer index): this task's is the answer,
        // else this start goes again once, stopping that one as any start does.
        const other = await runningOf();
        if (other) return ok(await viewOf(d.store, userId, other));
        if (attempt >= 2) throw err;
      }
    }
  } catch (err) {
    if (isMissingProofSchema(err)) return fail(TIMER_NOT_READY);
    throw err;
  } finally {
    invalidate("life");
  }
}

/** Stops a timer (writes on); a stopped one answers as it stands. */
export async function stopTimerCore(userId: string, input: { sessionId: string }, deps: SessionDeps = {}): Promise<TimerResult<TimerView>> {
  const d = depsOf(deps);
  if (!d.writesOn) return fail(TIMER_WRITES_OFF);
  try {
    const row = await d.store.byId(userId, input.sessionId);
    if (!row) return fail(TIMER_GONE);
    if (row.endedAt) return ok(await viewOf(d.store, userId, row));
    const stopped = await d.store.stop(userId, row.id, d.now());
    return stopped ? ok(await viewOf(d.store, userId, stopped)) : fail(TIMER_GONE);
  } catch (err) {
    if (isMissingProofSchema(err)) return fail(TIMER_NOT_READY);
    throw err;
  } finally {
    invalidate("life");
  }
}

/**
 * Discard (writes on): the task's timer that life day, every segment, closed counting nothing (`minutes` 0, stopped
 * if it still ran), so no tick counts it and no row shows it. One a tick already counted is gone (TIMER_GONE). It
 * needs no proof in force, as a stop doesn't.
 */
export async function discardTimerCore(userId: string, input: { sessionId: string }, deps: SessionDeps = {}): Promise<TimerResult<TimerView>> {
  const d = depsOf(deps);
  if (!d.writesOn) return fail(TIMER_WRITES_OFF);
  try {
    const row = await d.store.byId(userId, input.sessionId);
    if (!row || row.minutes != null) return fail(TIMER_GONE);
    const now = d.now();
    const group = timerGroupsOf(await d.store.openOf(userId, row.templateId, row.day)).find((g) => g.some((x) => x.id === row.id)) ?? [row];
    const view = groupTimerOf(group);
    await d.store.close(userId, group.map((s) => s.id), now);
    return ok({ ...view, endedAt: view.endedAt ?? now.toISOString(), running: false });
  } catch (err) {
    if (isMissingProofSchema(err)) return fail(TIMER_NOT_READY);
    throw err;
  } finally {
    invalidate("life");
  }
}

/**
 * BoardData.proof and the templates' proof kinds, read only while proof is in force today (null, with no read,
 * otherwise): the open timers (running, or stopped and not yet counted) from yesterday on, the latest a template.
 * A failure reads as no timers and no kinds (logged), never as a failed board.
 */
export async function loadBoardProof(userId: string, today: DayKey, deps: SessionDeps = {}): Promise<{ proof: BoardProof; kinds: Record<string, ProofKind> } | null> {
  const d = depsOf(deps);
  const launchDay = d.launchDay;
  if (launchDay == null || !proofOn(today, launchDay)) return null;
  try {
    const [kinds, open] = await Promise.all([d.store.proofKinds(userId), d.store.open(userId, addDays(today, -1))]);
    const byId: Record<string, ProofKind> = {};
    for (const k of kinds) {
      const kind = proofKindOf(k.proof);
      if (kind) byId[k.id] = kind;
    }
    return { proof: { launchDay, timers: openTimersOf(open, addDays(today, -1)) }, kinds: byId };
  } catch (err) {
    console.error(isMissingProofSchema(err) ? "Today board: proof of work isn't set up on this database; no row is gated." : "Today board: the proof reads failed; no row is gated.", err);
    return { proof: { launchDay, timers: [] }, kinds: {} };
  }
}

/** What a tick of one template reads while proof is in force (tasks.ts readForCompletion). */
export interface CompletionProof {
  launchDay: DayKey;
  kind: ProofKind | null;
  /** The template's latest done tick on the completion's own life day (an Again's bound: proof.ts tickWallOf); null with none. */
  prevTickAt: Date | null;
  /** Its timers not yet counted, from the day before the completion's day on. */
  sessions: SessionRow[];
}

/** The tick's proof read, only when proof is in force on `day` (null, with no read, otherwise). A failure reads as ungated (logged). */
export async function readCompletionProof(userId: string, templateId: string, day: DayKey, deps: SessionDeps = {}): Promise<CompletionProof | null> {
  const d = depsOf(deps);
  const launchDay = d.launchDay;
  if (launchDay == null || !proofOn(day, launchDay)) return null;
  try {
    const [facts, sessions] = await Promise.all([d.store.tickFacts(userId, templateId, day), d.store.openOf(userId, templateId, addDays(day, -1))]);
    return { launchDay, kind: proofKindOf(facts.proof), prevTickAt: facts.prevTickAt, sessions };
  } catch (err) {
    console.error(isMissingProofSchema(err) ? "A tick: proof of work isn't set up on this database; it is not gated." : "A tick: the proof read failed; it is not gated.", err);
    return { launchDay, kind: null, prevTickAt: null, sessions: [] };
  }
}

/**
 * The ops a tick adds when it counts a timer: each segment's share of the counted minutes (proof.ts segmentSharesOf;
 * they add up to what the receipt counted), and its stop when it was still running. Not-yet-counted ones only, so a
 * timer is counted once.
 */
export function countSessionOps(userId: string, segments: readonly Pick<SessionRow, "id" | "startedAt" | "endedAt">[], minutes: number, at: Date) {
  const shares = segmentSharesOf(segments, minutes, at);
  return segments.map((s, i) => prisma.taskSession.updateMany({ where: { id: s.id, userId, minutes: null }, data: { minutes: shares[i], endedAt: s.endedAt ?? at } }));
}

/**
 * The ops that close sessions counting nothing (a tick that reported its minutes instead, a Discard): stopped at `at`
 * if they still ran, then `minutes` 0. Not-yet-counted ones only.
 */
export function closeSessionOps(userId: string, ids: readonly string[], at: Date) {
  const where = { id: { in: [...ids] }, userId, minutes: null };
  return [prisma.taskSession.updateMany({ where: { ...where, endedAt: null }, data: { endedAt: at } }), prisma.taskSession.updateMany({ where, data: { minutes: 0 } })];
}
