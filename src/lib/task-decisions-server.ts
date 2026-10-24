/**
 * Defer and abort on the server (2026-10-13; the rules are task-decisions.ts):
 *
 *   deferCore(userId, templateId, { reason, reasonTag?, until })   off the board until `until`
 *   abortCore(userId, templateId, { reason, reasonTag?, scope })   just this time, or for good (the archive path)
 *   undoDecisionCore(userId, decisionId)                           within ten minutes, the same life day
 *   readBoardDecisions(userId, boardId)                            BoardData.decisions (fails soft: none)
 *   readWeekDecisions(userId, from, to)                            the weekly review's section
 *
 * Shape of a write, as everywhere in the task engine: one read wave, then one `$transaction([...])`
 * array. Its first statement is a guard that fails the transaction (division by zero, like the
 * completions' freshness guard) when the template's deferUntil or planDay moved since the read, or
 * when an Undo's decision is already undone, so nothing half-lands and a race answers "try again".
 * An abort for good goes through tasks.ts archiveCore (the must's akrasia horizon, exactly as
 * Archive), then writes its decision row; its Undo is unarchiveCore. Nothing here writes the
 * ledger: no ActivityEvent, no XP, no lock. Every core takes a DecisionDb, so
 * scripts/task-decisions-check.ts runs them against an in-memory one.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, LIFE_TZ, type DayKey } from "./life-day";
import { parsePendingChange, ruleOn } from "./duty-rule";
import { archiveCore, isStaleRead, unarchiveCore, type LifeResult, type RuleChangeOutcome, type UnarchiveOutcome } from "./tasks";
import {
  DECISION_GONE,
  DECISION_STALE,
  DECISION_UNDO_GONE,
  ABORT_SCOPE_UNKNOWN,
  DEFER_MAX_DAYS,
  cleanReason,
  deferNudgeOf,
  isAbortScope,
  planAbort,
  planDefer,
  planUndo,
  templateDecisionsOf,
  type DecisionInstance,
  type DecisionInsert,
  type DecisionKind,
  type DecisionOutcome,
  type DecisionRowLike,
  type DecisionTemplate,
  type DecisionWrite,
  type TemplateDecisions,
  type UndoneDecision,
  type WeekDecisionRow,
} from "./task-decisions";

export type { DecisionOutcome, UndoneDecision } from "./task-decisions";

const ok = <T>(value: T): LifeResult<T> => ({ ok: true, value });
const fail = <T>(error: string): LifeResult<T> => ({ ok: false, error });

// ── The reads and writes the cores make ───────────────────────────────────

/** A TaskTemplate as a decision reads it (date columns as day keys). */
export interface DecisionTemplateRow {
  id: string;
  title: string;
  kind: string;
  inbox: boolean;
  recurrence: string | null;
  startDay: DayKey;
  dueDay: DayKey | null;
  dueKind: string | null;
  planDay: DayKey | null;
  compulsory: boolean;
  compulsoryOnRest: boolean;
  pendingChange: unknown;
  autoMetric: string | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  deferUntil: Date | null;
  boardId: string | null;
  /** A side quest's key (P31): it is never deferred past its expiry. Absent (the checks' rows): an ordinary task. */
  captureKey?: string | null;
}

/** The reads and writes of the cores: Prisma in the app, an in-memory store in the checks. */
export interface DecisionDb {
  template(userId: string, templateId: string): Promise<DecisionTemplateRow | null>;
  /** The template's instances on days in [from, to], every slot. */
  instances(userId: string, templateId: string, from: DayKey, to: DayKey): Promise<DecisionInstance[]>;
  /** Every decision of the template (undone ones included). */
  decisions(userId: string, templateId: string): Promise<DecisionRowLike[]>;
  decision(userId: string, id: string): Promise<DecisionRowLike | null>;
  /** One transaction; "stale" when its guard found the template (or an Undo's decision) moved since the read. */
  apply(userId: string, w: DecisionWrite): Promise<"ok" | "stale">;
  archive(userId: string, templateId: string, now: Date): Promise<LifeResult<RuleChangeOutcome>>;
  /** A must brought back near or past the cap carries its note (tasks.ts UnarchiveOutcome); null says nothing more. */
  unarchive(userId: string, templateId: string, now: Date): Promise<LifeResult<UnarchiveOutcome | null>>;
}

const TEMPLATE_READ = {
  id: true,
  title: true,
  kind: true,
  inbox: true,
  recurrence: true,
  startDay: true,
  dueDay: true,
  dueKind: true,
  planDay: true,
  compulsory: true,
  compulsoryOnRest: true,
  pendingChange: true,
  autoMetric: true,
  completedAt: true,
  archivedAt: true,
  deferUntil: true,
  boardId: true,
  captureKey: true,
} satisfies Prisma.TaskTemplateSelect;

const DECISION_READ = {
  id: true,
  templateId: true,
  kind: true,
  scope: true,
  reason: true,
  reasonTag: true,
  day: true,
  untilAt: true,
  compulsory: true,
  createdAt: true,
  undoneAt: true,
} satisfies Prisma.TaskDecisionSelect;

type DecisionRead = Prisma.TaskDecisionGetPayload<{ select: typeof DECISION_READ }>;
const decisionRowOf = (r: DecisionRead): DecisionRowLike => ({ ...r, day: keyOfDateColumn(r.day) });

const keyOr = (d: Date | null): DayKey | null => (d ? keyOfDateColumn(d) : null);

/**
 * The write's guard (its first statement): division by zero unless the template's deferUntil and
 * planDay are still what was read, it is still not archived, and (an Undo) the decision is still
 * not undone. deferUntil is compared in epoch milliseconds, so no time zone can bend it.
 */
export function decisionGuardSql(userId: string, w: Pick<DecisionWrite, "templateId" | "expect" | "undo">): Prisma.Sql {
  const template = w.expect
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "TaskTemplate" WHERE "id" = ${w.templateId} AND "userId" = ${userId} AND "archivedAt" IS NULL
        AND ROUND(EXTRACT(EPOCH FROM "deferUntil") * 1000)::bigint IS NOT DISTINCT FROM ${w.expect.deferUntil ? String(w.expect.deferUntil.getTime()) : null}::bigint
        AND "planDay" IS NOT DISTINCT FROM ${w.expect.planDay}::date)`
    : Prisma.empty;
  const undo = w.undo ? Prisma.sql`AND EXISTS (SELECT 1 FROM "TaskDecision" WHERE "id" = ${w.undo.id} AND "userId" = ${userId} AND "undoneAt" IS NULL)` : Prisma.empty;
  return Prisma.sql`SELECT 1 / (CASE WHEN TRUE ${template} ${undo} THEN 1 ELSE 0 END)`;
}

const isUniqueClash = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** The app's DecisionDb. */
export const prismaDecisionDb: DecisionDb = {
  async template(userId, templateId) {
    const r = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: TEMPLATE_READ });
    if (!r) return null;
    return { ...r, startDay: keyOfDateColumn(r.startDay), dueDay: keyOr(r.dueDay), planDay: keyOr(r.planDay) };
  },
  async instances(userId, templateId, from, to) {
    const rows = await prisma.taskInstance.findMany({
      where: { userId, templateId, day: { gte: dateColumn(from), lte: dateColumn(to) } },
      select: { id: true, day: true, slot: true, status: true, createdAt: true, updatedAt: true },
    });
    return rows.map((i) => ({ ...i, day: keyOfDateColumn(i.day) }));
  },
  async decisions(userId, templateId) {
    return (await prisma.taskDecision.findMany({ where: { userId, templateId }, select: DECISION_READ })).map(decisionRowOf);
  },
  async decision(userId, id) {
    const r = await prisma.taskDecision.findFirst({ where: { id, userId }, select: DECISION_READ });
    return r ? decisionRowOf(r) : null;
  },
  async apply(userId, w) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (w.expect || w.undo) ops.push(prisma.$executeRaw(decisionGuardSql(userId, w)));
    if (w.template) {
      const data: Prisma.TaskTemplateUpdateManyMutationInput = {};
      if (w.template.deferUntil !== undefined) data.deferUntil = w.template.deferUntil;
      if (w.template.planDay !== undefined) data.planDay = w.template.planDay ? dateColumn(w.template.planDay) : null;
      ops.push(prisma.taskTemplate.updateMany({ where: { id: w.templateId, userId }, data }));
    }
    if (w.createSkipped.length > 0) {
      ops.push(
        prisma.taskInstance.createMany({
          data: w.createSkipped.map((day) => ({
            id: globalThis.crypto.randomUUID(),
            userId,
            templateId: w.templateId,
            day: dateColumn(day),
            slot: 0,
            status: "SKIPPED",
            source: "manual",
            xpPaid: 0,
            createdAt: w.at,
            updatedAt: w.at,
          })),
        })
      );
    }
    if (w.skipUndone.length > 0) {
      ops.push(
        prisma.taskInstance.updateMany({
          where: { id: { in: w.skipUndone }, userId, status: "UNDONE" },
          data: { status: "SKIPPED", completedAt: null, minutes: null, xpPaid: 0, updatedAt: w.at },
        })
      );
    }
    if (w.removeSkipped.length > 0) ops.push(prisma.taskInstance.deleteMany({ where: { id: { in: w.removeSkipped }, userId, status: "SKIPPED" } }));
    if (w.reopen.length > 0) ops.push(prisma.taskInstance.updateMany({ where: { id: { in: w.reopen }, userId, status: "SKIPPED" }, data: { status: "UNDONE" } }));
    if (w.insert) ops.push(prisma.taskDecision.create({ data: insertData(userId, w.insert) }));
    if (w.undo) ops.push(prisma.taskDecision.updateMany({ where: { id: w.undo.id, userId, undoneAt: null }, data: { undoneAt: w.at } }));
    if (ops.length === 0) return "ok";
    try {
      await prisma.$transaction(ops);
      return "ok";
    } catch (err) {
      // The guard (the template or the decision moved), or an instance another write created first.
      if (isStaleRead(err) || isUniqueClash(err)) return "stale";
      throw err;
    }
  },
  archive: (userId, templateId, now) => archiveCore(userId, templateId, now),
  unarchive: (userId, templateId, now) => unarchiveCore(userId, templateId, now),
};

function insertData(userId: string, d: DecisionInsert): Prisma.TaskDecisionUncheckedCreateInput {
  return {
    id: d.id,
    userId,
    templateId: d.templateId,
    kind: d.kind,
    scope: d.scope,
    reason: d.reason,
    reasonTag: d.reasonTag,
    day: dateColumn(d.day),
    untilAt: d.untilAt,
    compulsory: d.compulsory,
    createdAt: d.createdAt,
  };
}

// ── The cores ─────────────────────────────────────────────────────────────

/** The template as the planners read it: today's rule (a pending un-flag still a must today), its pending archive. */
function planTemplateOf(r: DecisionTemplateRow, today: DayKey): DecisionTemplate {
  const ruled = ruleOn(
    {
      kind: r.kind,
      recurrence: r.recurrence,
      startDay: r.startDay,
      dueDay: r.dueDay,
      dueKind: r.dueKind,
      compulsory: r.compulsory,
      compulsoryOnRest: r.compulsoryOnRest,
      inbox: r.inbox,
      archivedDay: r.archivedAt ? dayKeyOf(r.archivedAt) : null,
      pendingChange: r.pendingChange,
    },
    today
  );
  const next = parsePendingChange(r.pendingChange)?.next;
  return {
    id: r.id,
    kind: r.kind,
    inbox: r.inbox,
    recurrence: r.recurrence,
    startDay: r.startDay,
    dueDay: r.dueDay,
    dueKind: r.dueKind,
    planDay: r.planDay,
    compulsory: ruled.compulsory,
    autoMetric: r.autoMetric,
    completed: r.completedAt != null,
    archived: r.archivedAt != null,
    deferUntil: r.deferUntil,
    pendingArchiveDay: next?.archive ? next.effectiveDay : null,
    boardId: r.boardId,
    captureKey: r.captureKey ?? null,
  };
}

const newDecisionId = (): string => globalThis.crypto.randomUUID();

/** Defers of a template (not undone), with `plus` more. */
function defersOf(rows: readonly DecisionRowLike[], templateId: string, plus: number): number {
  const facts: TemplateDecisions | undefined = templateDecisionsOf(rows)[templateId];
  return (facts?.defers ?? 0) + plus;
}

/**
 * Defers a task until `until` (an ISO instant), with a reason (task-decisions.ts planDefer): a
 * one-off is off the board until then; a repeating non-must skips its occurrences until then; a
 * must skips nothing and its day counts as not kept. Returns the decision for the Undo.
 */
export async function deferCore(
  userId: string,
  templateId: string,
  input: { reason?: unknown; reasonTag?: unknown; until?: unknown },
  now: Date = new Date(),
  db: DecisionDb = prismaDecisionDb,
  tz: string = LIFE_TZ
): Promise<LifeResult<DecisionOutcome>> {
  const reason = cleanReason(input.reason, input.reasonTag);
  if (!reason.ok) return fail(reason.error);
  const until = typeof input.until === "string" || input.until instanceof Date ? new Date(input.until) : null;
  const today = dayKeyOf(now, tz);
  const [row, instances, decisions] = await Promise.all([
    db.template(userId, templateId),
    db.instances(userId, templateId, today, addDays(today, DEFER_MAX_DAYS + 1)),
    db.decisions(userId, templateId),
  ]);
  if (!row) return fail(DECISION_GONE);
  const t = planTemplateOf(row, today);
  const id = newDecisionId();
  const plan = planDefer(t, instances, { id, until: until ?? new Date(Number.NaN), now, reason: reason.reason, reasonTag: reason.reasonTag }, tz);
  if (!plan.ok) return fail(plan.error);
  try {
    if ((await db.apply(userId, plan.value.write)) === "stale") return fail(DECISION_STALE);
  } finally {
    invalidate("life", "activity");
  }
  const defers = defersOf(decisions, templateId, 1);
  return ok({
    decisionId: id,
    templateId,
    title: row.title,
    kind: "DEFER",
    scope: null,
    untilAt: plan.value.untilAt.toISOString(),
    skipped: plan.value.skipped,
    notKept: plan.value.shape === "must" && !row.boardId,
    defers,
    nudge: deferNudgeOf(defers),
    archive: null,
    work: !!row.boardId,
  });
}

/**
 * Aborts a task with a reason (task-decisions.ts planAbort). Just this time (a repeating task):
 * today is skipped, or for a must, off the board until today ends and not kept. For good, or any
 * one-off: archived through archiveCore (a must's archive waits out its akrasia horizon, and the
 * answer says when), then the decision row is written.
 */
export async function abortCore(
  userId: string,
  templateId: string,
  input: { reason?: unknown; reasonTag?: unknown; scope?: unknown },
  now: Date = new Date(),
  db: DecisionDb = prismaDecisionDb,
  tz: string = LIFE_TZ
): Promise<LifeResult<DecisionOutcome>> {
  const reason = cleanReason(input.reason, input.reasonTag);
  if (!reason.ok) return fail(reason.error);
  if (!isAbortScope(input.scope)) return fail(ABORT_SCOPE_UNKNOWN);
  const today = dayKeyOf(now, tz);
  const [row, instances, decisions] = await Promise.all([db.template(userId, templateId), db.instances(userId, templateId, today, today), db.decisions(userId, templateId)]);
  if (!row) return fail(DECISION_GONE);
  const t = planTemplateOf(row, today);
  const id = newDecisionId();
  const plan = planAbort(t, instances, { id, scope: input.scope, now, reason: reason.reason, reasonTag: reason.reasonTag }, tz);
  if (!plan.ok) return fail(plan.error);
  const base = {
    decisionId: id,
    templateId,
    title: row.title,
    kind: "ABORT" as const,
    defers: defersOf(decisions, templateId, 0),
    nudge: null,
    work: !!row.boardId,
  };
  if (plan.value.kind === "archive") {
    const archived = await db.archive(userId, templateId, now);
    if (!archived.ok) return fail(archived.error);
    const insert = plan.value.insert;
    try {
      await db.apply(userId, { templateId, at: now, expect: null, template: null, createSkipped: [], skipUndone: [], removeSkipped: [], reopen: [], insert, undo: null });
    } finally {
      invalidate("life", "activity");
    }
    return ok({
      ...base,
      scope: "SERIES",
      untilAt: null,
      skipped: 0,
      notKept: false,
      archive: { effect: archived.value.effect, effectiveDay: archived.value.effectiveDay },
    });
  }
  const { write, untilAt, skipped } = plan.value;
  try {
    if ((await db.apply(userId, write)) === "stale") return fail(DECISION_STALE);
  } finally {
    invalidate("life", "activity");
  }
  return ok({ ...base, scope: "ONCE", untilAt: untilAt ? untilAt.toISOString() : null, skipped, notKept: t.compulsory && !row.boardId, archive: null });
}

/**
 * Undoes a defer or an abort within ten minutes, on the same life day, restoring exactly what it
 * changed (task-decisions.ts planUndo); an abort for good is unarchived (which also cancels a
 * pending archive). A second tap answers as the first. The decision row stays, marked undone.
 */
export async function undoDecisionCore(userId: string, decisionId: string, now: Date = new Date(), db: DecisionDb = prismaDecisionDb, tz: string = LIFE_TZ): Promise<LifeResult<UndoneDecision>> {
  const d = await db.decision(userId, decisionId);
  if (!d) return fail(DECISION_UNDO_GONE);
  const from = d.day;
  const to = d.untilAt ? dayKeyOf(new Date(d.untilAt), tz) : d.day;
  const [row, instances] = await Promise.all([db.template(userId, d.templateId), db.instances(userId, d.templateId, from, to > from ? to : from)]);
  const kind: DecisionKind = d.kind === "ABORT" ? "ABORT" : "DEFER";
  const out: UndoneDecision = { decisionId, templateId: d.templateId, title: row?.title ?? "That task", kind };
  const plan = planUndo(d, row ? { deferUntil: row.deferUntil, planDay: row.planDay, recurrence: row.recurrence } : null, instances, now, tz);
  if (!plan.ok) return fail(plan.error);
  if (plan.value.kind === "noop") return ok(out);
  try {
    if (plan.value.kind === "unarchive") {
      const back = await db.unarchive(userId, d.templateId, now);
      if (!back.ok) return fail(back.error);
      // "stale" here is another tap that marked it first: the unarchive above changed nothing that one had not.
      await db.apply(userId, { templateId: d.templateId, at: now, expect: null, template: null, createSkipped: [], skipUndone: [], removeSkipped: [], reopen: [], insert: null, undo: { id: d.id } });
      // Daily quests (D14): a must brought back near or past the cap says so, as Archive's Undo does.
      const mustNote = back.value?.mustNote;
      return ok(mustNote ? { ...out, mustNote } : out);
    }
    if ((await db.apply(userId, plan.value.write)) === "stale") {
      const again = await db.decision(userId, decisionId);
      return again?.undoneAt != null ? ok(out) : fail(DECISION_STALE);
    }
    return ok(out);
  } finally {
    invalidate("life", "activity");
  }
}

// ── The weekly review's read (the board's is tasks.ts readBoardDecisions) ─

/** The weekly review's decisions: the personal Board's, decided on a day in [from, to], not undone. Fails soft: none. */
export async function readWeekDecisions(userId: string, from: DayKey, to: DayKey): Promise<WeekDecisionRow[]> {
  try {
    const rows = await prisma.taskDecision.findMany({
      where: { userId, undoneAt: null, day: { gte: dateColumn(from), lte: dateColumn(to) }, template: { boardId: null } },
      select: { ...DECISION_READ, template: { select: { title: true, archivedAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      title: r.template.title,
      kind: r.kind,
      scope: r.scope,
      reason: r.reason,
      day: keyOfDateColumn(r.day),
      untilAt: r.untilAt,
      compulsory: r.compulsory,
      archived: r.template.archivedAt != null,
      createdAt: r.createdAt,
    }));
  } catch (err) {
    console.error("Weekly review: the task decisions failed to load; showing none.", err);
    return [];
  }
}
