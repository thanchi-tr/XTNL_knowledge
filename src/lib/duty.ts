import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { activityOp, isDuplicateActivity } from "./activity";
import { addDays, dateColumn, dayStartOf, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { MAKEUP_RESTORE_EVERY_DAYS, MAKE_UP_SOURCE, dutyLaunchDay, freezeUseKey, newLifeSettingsData, type RestKind } from "./duty-economy";
import { isTrack } from "./life-grade";
import type { Sink } from "./life-types";
import {
  dutyGateOf,
  freezeSpendOf,
  freezeUseEventOf,
  makeUpAttemptsOf,
  makeUpRowsOf,
  minimumOf,
  planAcceptLoss,
  planMakeUp,
  planUndoMakeUp,
  storedMakeUpOf,
  undoUntilOf,
  weekdayLong,
  type InstanceEventRow,
  type MakeUpOutcome,
} from "./duty-plan";
import {
  restRowsOf,
  restWindowOf,
  validateCancel,
  validateRest,
  validateSick,
  validateVacation,
  type RestRowLite,
  type RestWindow,
} from "./rest-rules";
import {
  TEMPLATE_SELECT,
  freshnessGuardOp,
  isSettledDay,
  isStaleRead,
  kneeRowsOf,
  ledgerOf,
  lifeLockOp,
  readDayTaskEvents,
  readDayTotals,
  settledDayGuardOp,
  toBoardTemplate,
  type LifeResult,
} from "./tasks";
import { WRITES_OFF_REFUSAL, settleLifeDays } from "./settlement";

/**
 * Duty's server cores (M2 lane C: F2 gates, F6, F8's manual spend, F9 and
 * the early settle). The actions in src/app/actions/duty.ts call them.
 *
 * Every core reads fresh (never from the cache), decides through a pure
 * planner (duty-plan.ts, rest-rules.ts), and writes in one $transaction
 * array that opens with the completions' life-complete lock (lifeLockOp)
 * and a guard statement, like a tick: no interactive transaction, and a
 * double tap writes once (dedupe keys, P2002 → the stored answer).
 *
 *   makeUpCore        make up a debtOpen MISSED instance in full or as its minimum
 *                     (decisions 8, 9, 11): TASK dated today keyed on d,
 *                     DEBT_REPAID +debt, the instance DONE_LATE / DONE_MVV
 *                     (repaired) or MADE_UP. The guard holds today's knee rows
 *                     and the instance still owed.
 *   undoMakeUpCore    within 10 minutes, the same life day (decision 10): the TASK's
 *                     UNDO and a negative DEBT_REPAID 'unrepaid:<id>' — never
 *                     an UNDO for the repayment; the debt is open again.
 *   acceptLossCore    'Accept the loss' (debtWriteOff on, the debt ≥ 14 days old).
 *   setMinimumCore    add a minimum version where none exists (immediate).
 *   spendFreezeCore   'Use a freeze for Wed' (decision 12): launched, an unsettled
 *                     yesterday with no activity; the settled-day guard
 *                     (22003) and a balance guard (22012).
 *   settleYesterdayCore  'Settle Wednesday now': settlement's early settle.
 *   declareRestCore · declareSickCore · setVacationCore · cancelRestCore (F9)
 *   setDebtWriteOffCore  Settings › Days 'Accept a loss' (LifeSettings.debtWriteOff).
 *
 * Gates (decision 2): the debt actions work whenever their debt exists,
 * launched or not; the freeze and the early settle need the launch; rest
 * rows need DUTY_LAUNCH_DAY set, for days on or after it (duty-plan.ts
 * dutyGateOf, rest-rules.ts). Server only.
 */

const ok = <T>(value: T): LifeResult<T> => ({ ok: true, value });
const fail = <T>(error: string): LifeResult<T> => ({ ok: false, error });

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ATTEMPTS = 3;
const RACED = "Something changed at the same moment. Try again.";

const MADE_UP_STATUSES: ReadonlySet<string> = new Set(["DONE_LATE", "DONE_MVV", "MADE_UP"]);

/** An instance's own ledger rows (sourceId = the instance): its ticks, undos, debt and repayments. */
const EVENT_SELECT = {
  id: true,
  day: true,
  source: true,
  sink: true,
  track: true,
  templateId: true,
  sourceId: true,
  xp: true,
  rawXp: true,
  occurredAt: true,
  dedupeKey: true,
  receipt: true,
} satisfies Prisma.ActivityEventSelect;

function eventRowsOf(rows: Prisma.ActivityEventGetPayload<{ select: typeof EVENT_SELECT }>[]): InstanceEventRow[] {
  return rows.map((r) => ({ ...r, day: keyOfDateColumn(r.day) }));
}

// ── Make up, do the minimum ───────────────────────────────────────────────

const MAKE_UP_INSTANCE_SELECT = {
  id: true,
  templateId: true,
  day: true,
  slot: true,
  status: true,
  source: true,
  debtXp: true,
  debtOpen: true,
  repaired: true,
  template: { select: TEMPLATE_SELECT },
} satisfies Prisma.TaskInstanceSelect;

/**
 * makeUpCore's one read wave: the instance with its template (archived ones
 * included: read by id, never through the board's live list), its own rows
 * (attempts, a stored make-up), whether its template already spent a
 * restore in (today − 7, today], today's ledger, and the open debts.
 */
async function readForMakeUp(userId: string, instanceId: string, today: DayKey) {
  const [inst, events, repaired, totals, taskEvents, openDebts] = await Promise.all([
    prisma.taskInstance.findFirst({ where: { id: instanceId, userId }, select: MAKE_UP_INSTANCE_SELECT }),
    prisma.activityEvent.findMany({ where: { userId, sourceId: instanceId }, select: EVENT_SELECT, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }),
    prisma.taskInstance.count({
      where: {
        userId,
        repaired: true,
        id: { not: instanceId },
        completedAt: { gte: dayStartOf(addDays(today, -(MAKEUP_RESTORE_EVERY_DAYS - 1))) },
        template: { instances: { some: { id: instanceId } } },
      },
    }),
    readDayTotals(userId, [today]),
    readDayTaskEvents(userId, [today]),
    prisma.taskInstance.count({ where: { userId, debtOpen: true } }),
  ]);
  if (!inst) return null;
  return {
    inst: { ...inst, day: keyOfDateColumn(inst.day) },
    rows: eventRowsOf(events),
    repairedInLast7: repaired > 0,
    ledger: ledgerOf(today, totals, taskEvents),
    kneeRows: kneeRowsOf(today, totals),
    openDebts,
  };
}

/**
 * Makes up a missed must (F6): in full (T 0.85, C 1.00) or as its minimum
 * (K 0.3 too); a study-linked must pays 0 and repays the debt. Restores the
 * occurrence (DONE_LATE / DONE_MVV, repaired) inside the two-day window and
 * the one-a-week budget, else MADE_UP. Idempotent: a repeat returns the
 * stored make-up. Retried when another write moved today's ledger first.
 */
export async function makeUpCore(
  userId: string,
  instanceId: string,
  opts: { minimum: boolean; minutes?: number | null },
  now: Date = new Date()
): Promise<LifeResult<MakeUpOutcome>> {
  const today = todayKey(now);
  for (let attempt = 1; ; attempt++) {
    const read = await readForMakeUp(userId, instanceId, today);
    if (!read) return fail("That debt no longer exists.");
    const { inst } = read;
    const stored = storedMakeUpOf(inst, read.rows, read.openDebts);
    if (stored) return ok(stored);
    if (inst.status !== "MISSED" || !inst.debtOpen) return fail("Nothing is owed there any more.");

    const t = toBoardTemplate(inst.template, now);
    const planned = planMakeUp({
      template: t,
      instance: { id: inst.id, templateId: inst.templateId, day: inst.day, slot: inst.slot, debtXp: inst.debtXp },
      today,
      now,
      minimum: opts.minimum,
      minutes: opts.minutes ?? null,
      ledger: read.ledger,
      repairedInLast7: read.repairedInLast7,
      ...makeUpAttemptsOf(read.rows, inst.id),
    });
    if (!planned.ok) return fail(planned.error);
    const p = planned.value;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      lifeLockOp(userId),
      freshnessGuardOp(userId, today, read.kneeRows, null, { openDebtInstanceId: inst.id }),
      prisma.taskInstance.update({
        where: { id: inst.id },
        data: {
          status: p.instance.status,
          repaired: p.instance.repaired,
          debtOpen: false,
          source: MAKE_UP_SOURCE,
          xpPaid: p.instance.xpPaid,
          completedAt: now,
          minutes: p.instance.minutes ?? null,
        },
      }),
      activityOp(userId, p.taskEvent),
      activityOp(userId, p.repaidEvent),
      // A completion freezes the grade, as a tick does.
      prisma.taskTemplate.updateMany({ where: { id: t.id, gradeFrozenAt: null }, data: { gradeFrozenAt: now } }),
    ];
    if (!t.recurrence) ops.push(prisma.taskTemplate.updateMany({ where: { id: t.id, completedAt: null }, data: { completedAt: now } }));

    try {
      await prisma.$transaction(ops);
    } catch (err) {
      if (isStaleRead(err)) {
        if (attempt >= ATTEMPTS) return fail("Another tick was being recorded at the same moment. Try again.");
        continue;
      }
      if (!isDuplicateActivity(err)) throw err;
      // Another request made it up first (a double tap, a second device): its make-up is the answer.
      const again = await readForMakeUp(userId, instanceId, today);
      const first = again ? storedMakeUpOf(again.inst, again.rows, again.openDebts) : null;
      return first ? ok(first) : fail("That make-up is already being recorded.");
    } finally {
      invalidate("life", "activity");
    }

    const owedLeft = Math.max(0, read.openDebts - 1);
    return ok({
      instanceId: inst.id,
      templateId: t.id,
      day: inst.day,
      status: p.status,
      restored: p.restored,
      receipt: p.receipt ?? p.plan.receipt,
      xp: p.plan.receipt.xp,
      debtXp: inst.debtXp,
      clearedLast: owedLeft === 0,
      owedLeft,
      undoUntil: undoUntilOf(now).toISOString(),
    });
  }
}

// ── Undo a make-up ────────────────────────────────────────────────────────

/**
 * Takes a make-up back within ten minutes on the same life day (decision
 * 10): the TASK row's UNDO and a negative DEBT_REPAID 'unrepaid:<repaidRowId>'
 * (never an UNDO, which would take a second streak unit off the day). The
 * instance is MISSED again with its debt open and not repaired; a one-off is
 * open again. A repeat is a no-op.
 */
export async function undoMakeUpCore(
  userId: string,
  instanceId: string,
  now: Date = new Date()
): Promise<LifeResult<{ instanceId: string; debtXp: number; xp: number }>> {
  const [inst, events] = await Promise.all([
    prisma.taskInstance.findFirst({
      where: { id: instanceId, userId },
      select: { id: true, templateId: true, day: true, slot: true, status: true, source: true, debtXp: true, debtOpen: true, template: { select: { recurrence: true } } },
    }),
    prisma.activityEvent.findMany({ where: { userId, sourceId: instanceId }, select: EVENT_SELECT }),
  ]);
  if (!inst) return fail("That make-up no longer exists.");
  if (inst.status === "MISSED" && inst.debtOpen) return ok({ instanceId, debtXp: inst.debtXp, xp: 0 });
  if (inst.source !== MAKE_UP_SOURCE || !MADE_UP_STATUSES.has(inst.status)) return fail("Only a make-up can be undone here.");

  const day = keyOfDateColumn(inst.day);
  const { task, repaid } = makeUpRowsOf(eventRowsOf(events), instanceId);
  if (!task || !repaid || !repaid.templateId) return fail("That make-up can't be undone any more.");
  const planned = planUndoMakeUp({
    taskRow: {
      id: task.id,
      day: task.day,
      sink: task.sink as Sink,
      track: isTrack(task.track) ? task.track : null,
      templateId: task.templateId,
      sourceId: task.sourceId,
      xp: task.xp,
      rawXp: task.rawXp,
    },
    repaidRow: { id: repaid.id, day: repaid.day, templateId: repaid.templateId, sourceId: repaid.sourceId, xp: repaid.xp },
    instance: { id: inst.id, templateId: inst.templateId, day, slot: inst.slot, debtXp: inst.debtXp },
    now,
    taskOccurredAt: task.occurredAt,
  });
  if (!planned.ok) return fail(planned.error);
  const p = planned.value;

  const ops: Prisma.PrismaPromise<unknown>[] = [
    lifeLockOp(userId),
    activityOp(userId, p.undoEvent),
    activityOp(userId, p.unrepaidEvent),
    prisma.taskInstance.update({
      where: { id: inst.id },
      data: { status: p.instance.status, debtOpen: true, repaired: false, xpPaid: 0, completedAt: null, minutes: null },
    }),
  ];
  if (!inst.template.recurrence) ops.push(prisma.taskTemplate.updateMany({ where: { id: inst.templateId }, data: { completedAt: null } }));
  try {
    await prisma.$transaction(ops);
  } catch (err) {
    // Undone already (a double tap on Undo): the first one's rows stand.
    if (!isDuplicateActivity(err)) throw err;
  } finally {
    invalidate("life", "activity");
  }
  return ok({ instanceId, debtXp: inst.debtXp, xp: -task.xp });
}

// ── Accept the loss, add a minimum ────────────────────────────────────────

/** Fails the transaction (22012) unless the instance is still MISSED with its debt open. */
function stillOwedGuardOp(instanceId: string) {
  return prisma.$executeRaw`
    SELECT 1 / (CASE WHEN EXISTS (
      SELECT 1 FROM "TaskInstance" WHERE "id" = ${instanceId} AND "status" = 'MISSED' AND "debtOpen"
    ) THEN 1 ELSE 0 END)
  `;
}

/**
 * 'Accept the loss' (F6): only with LifeSettings.debtWriteOff on and the
 * debt at least 14 days old. WRITTEN_OFF, one DEBT_WRITTEN_OFF row (sink
 * NONE, qty = the debt); the DEBT row stays. A one-off is archived with it.
 */
export async function acceptLossCore(userId: string, instanceId: string, now: Date = new Date()): Promise<LifeResult<{ instanceId: string; debtXp: number }>> {
  const today = todayKey(now);
  const [inst, settings] = await Promise.all([
    prisma.taskInstance.findFirst({
      where: { id: instanceId, userId },
      select: {
        id: true,
        templateId: true,
        day: true,
        slot: true,
        status: true,
        debtOpen: true,
        debtXp: true,
        template: { select: { recurrence: true, archivedAt: true } },
      },
    }),
    prisma.lifeSettings.findUnique({ where: { userId }, select: { debtWriteOff: true } }),
  ]);
  if (!inst) return fail("That debt no longer exists.");
  if (inst.status === "WRITTEN_OFF") return ok({ instanceId, debtXp: inst.debtXp });
  const planned = planAcceptLoss({
    instance: { ...inst, day: keyOfDateColumn(inst.day) },
    debtWriteOff: !!settings?.debtWriteOff,
    oneOff: !inst.template.recurrence,
    archived: !!inst.template.archivedAt,
    today,
    now,
  });
  if (!planned.ok) return fail(planned.error);
  const ops: Prisma.PrismaPromise<unknown>[] = [
    lifeLockOp(userId),
    stillOwedGuardOp(inst.id),
    prisma.taskInstance.update({ where: { id: inst.id }, data: { status: "WRITTEN_OFF", debtOpen: false } }),
    activityOp(userId, planned.value.event),
  ];
  // A one-off has no further occurrence: off the board with its debt (no classifier, nothing weakens).
  if (planned.value.archive) ops.push(prisma.taskTemplate.updateMany({ where: { id: inst.templateId, archivedAt: null }, data: { archivedAt: now } }));
  try {
    await prisma.$transaction(ops);
  } catch (err) {
    if (isStaleRead(err)) return fail("Nothing is owed there any more.");
    if (!isDuplicateActivity(err)) throw err;
  } finally {
    invalidate("life", "activity");
  }
  return ok({ instanceId, debtXp: inst.debtXp });
}

/** Adds a minimum version (MissPrompt, F6): only where none exists; immediate (decision 17). */
export async function setMinimumCore(
  userId: string,
  templateId: string,
  text: string,
  minutes: number | null = null
): Promise<LifeResult<{ templateId: string; mvv: string; mvvMinutes: number | null }>> {
  const m = minimumOf(text, minutes);
  if (!m.ok) return fail(m.error);
  const res = await prisma.taskTemplate.updateMany({
    where: { id: templateId, userId, mvv: null, archivedAt: null, kind: { in: ["TASK", "HABIT"] } },
    data: { mvv: m.value.mvv, mvvMinutes: m.value.mvvMinutes },
  });
  if (res.count === 0) {
    const row = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { mvv: true, archivedAt: true, kind: true } });
    if (!row || row.archivedAt) return fail("That task no longer exists.");
    if (row.kind !== "TASK" && row.kind !== "HABIT") return fail("Only a task or a habit has a minimum version.");
    if (row.mvv) return fail(`It already has a minimum: ${row.mvv}.`);
    return fail(RACED);
  }
  invalidate("life", "activity");
  return ok({ templateId, ...m.value });
}

// ── Freezes ───────────────────────────────────────────────────────────────

/**
 * Fails the transaction (22012) unless a freeze is still banked (EARN − USE
 * ≥ 1) and `day` still has no activity (net streak units ≤ 0: streak.ts's
 * CASE). After the lock, so it sees an automatic spend or a tick that won.
 */
function freezeGuardOp(userId: string, day: DayKey) {
  return prisma.$executeRaw`
    SELECT 1 / (CASE WHEN
      (SELECT COUNT(*) FILTER (WHERE "source" = 'FREEZE_EARN') - COUNT(*) FILTER (WHERE "source" = 'FREEZE_USE')
         FROM "ActivityEvent" WHERE "userId" = ${userId} AND "source" IN ('FREEZE_EARN', 'FREEZE_USE')) >= 1
      AND (SELECT COALESCE(SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END), 0)
         FROM "ActivityEvent" WHERE "userId" = ${userId} AND "day" = ${day}::date) <= 0
    THEN 1 ELSE 0 END)
  `;
}

async function readFreezeState(userId: string, yesterday: DayKey) {
  const [settings, freezeRows, units, spent] = await Promise.all([
    prisma.lifeSettings.findUnique({ where: { userId }, select: { settledThroughDay: true, epochDay: true } }),
    prisma.activityEvent.groupBy({ by: ["source"], where: { userId, source: { in: ["FREEZE_EARN", "FREEZE_USE"] } }, _count: { _all: true } }),
    prisma.$queryRaw<{ units: number }[]>`
      SELECT COALESCE(SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END), 0)::int AS units
      FROM "ActivityEvent" WHERE "userId" = ${userId} AND "day" = ${yesterday}::date
    `,
    prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: freezeUseKey(yesterday) } }, select: { id: true } }),
  ]);
  const count = (source: string) => freezeRows.find((r) => r.source === source)?._count._all ?? 0;
  return {
    cursor: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    epochDay: settings?.epochDay ? keyOfDateColumn(settings.epochDay) : null,
    earned: count("FREEZE_EARN"),
    used: count("FREEZE_USE"),
    yesterdayUnits: units[0]?.units ?? 0,
    alreadyUsed: !!spent,
  };
}

/**
 * 'Use a freeze for Wed' (F8, decision 12): FREEZE_USE 'freeze-use:<yesterday>'
 * (sink NONE, countsForStreak false) — the automatic spend's own key, so
 * both can never land for one day. Settlement then excuses all of that day's
 * musts, 'Even on rest days' ones included. Refused before launch, for a
 * settled or active yesterday, or with nothing banked.
 */
export async function spendFreezeCore(userId: string, now: Date = new Date()): Promise<LifeResult<{ day: DayKey; left: number }>> {
  const today = todayKey(now);
  const yesterday = addDays(today, -1);
  const launchDay = dutyLaunchDay();
  const gate = dutyGateOf("spendFreeze", { today, launchDay });
  if (gate) return fail(gate);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const state = await readFreezeState(userId, yesterday);
    const plan = freezeSpendOf({ today, launchDay, ...state });
    if (!plan.ok) return fail(plan.error);
    if (plan.value.already) return ok({ day: plan.value.day, left: plan.value.left });
    try {
      await prisma.$transaction([
        lifeLockOp(userId),
        // The one settled-day rule (settledFor), floored at the first Duty day like every tick's.
        settledDayGuardOp(userId, yesterday, launchDay),
        freezeGuardOp(userId, yesterday),
        activityOp(userId, freezeUseEventOf(yesterday, now)),
      ]);
    } catch (err) {
      if (isSettledDay(err)) return fail(`${weekdayLong(yesterday)} is settled.`);
      // A tick, a spend or a settle landed first: read again, and the plan says why (or that it is done).
      if (isStaleRead(err) || isDuplicateActivity(err)) continue;
      throw err;
    } finally {
      invalidate("life", "activity");
    }
    return ok({ day: plan.value.day, left: plan.value.left });
  }
  return fail(RACED);
}

/** settleYesterdayCore's answer when settlement writes nothing from this server (lifeWritesEnabled: dev and prod share one database). */
export const SETTLE_WRITES_OFF = "Settling is off on this server: it runs on the live app.";

/**
 * 'Settle Wednesday now' (F5's early settle, F12): settles any backlog,
 * then yesterday, and locks it (decision 25). Refused before launch, and on
 * the launch day (yesterday carried no stakes). The cron then finds the
 * cursor past it and writes nothing. Never throws: settleLifeDays throws on
 * an unexpected database error (only its guard failures and duplicate keys
 * come back as `refused`), and that is answered in words here.
 */
export async function settleYesterdayCore(
  userId: string,
  now: Date = new Date(),
  settle: typeof settleLifeDays = settleLifeDays
): Promise<LifeResult<{ settledThrough: DayKey }>> {
  const today = todayKey(now);
  const yesterday = addDays(today, -1);
  const gate = dutyGateOf("settleYesterday", { today, launchDay: dutyLaunchDay() });
  if (gate) return fail(gate);
  let res: Awaited<ReturnType<typeof settleLifeDays>>;
  try {
    res = await settle(userId, now, { early: true, through: yesterday });
  } catch (err) {
    console.error("settleYesterday: settlement failed:", err);
    return fail(`${weekdayLong(yesterday)} couldn't be settled just now. Try again in a moment.`);
  }
  if (res.refused === WRITES_OFF_REFUSAL) return fail(SETTLE_WRITES_OFF);
  if (res.refused) return fail(res.refused);
  const through = res.cursorAfter ?? res.cursorBefore;
  if (through && through >= yesterday) return ok({ settledThrough: through });
  return fail(`${weekdayLong(yesterday)} isn't settled yet. Try again.`);
}

// ── Rest, sick and vacation (F9) ──────────────────────────────────────────

async function readRestRows(userId: string, w: RestWindow): Promise<(RestRowLite & { declaredAt: Date })[]> {
  const rows = await prisma.restDay.findMany({
    where: { userId, day: { gte: dateColumn(w.from), lte: dateColumn(w.to) } },
    select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
  });
  return rows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
}

/**
 * Fails the transaction (22012) unless the window still holds the standing
 * declarations it was validated against: after the lock, so two
 * declarations can never both pass the week's, the sick or the vacation cap.
 */
function restGuardOp(userId: string, w: RestWindow, standing: number) {
  return prisma.$executeRaw`
    SELECT 1 / (CASE WHEN
      (SELECT COUNT(*) FROM "RestDay"
        WHERE "userId" = ${userId} AND "day" BETWEEN ${w.from}::date AND ${w.to}::date AND "cancelledAt" IS NULL) = ${standing}::int
    THEN 1 ELSE 0 END)
  `;
}

const standingCount = (rows: readonly RestRowLite[]) => rows.filter((r) => r.cancelledAt == null).length;

/**
 * Writes the declared days as one array: the lock, the window guard, and the
 * rows (an upsert by (userId, day) for one day; for a vacation one update of
 * the days that have a row and one insert of those that do not). Every row
 * gets kind, declaredAt = now and cancelledAt = null (rest-rules restRowsOf).
 * 'stale' when the guard or a concurrent insert says another write won.
 */
async function writeRestDays(
  userId: string,
  days: readonly DayKey[],
  kind: RestKind,
  now: Date,
  w: RestWindow,
  rows: readonly RestRowLite[]
): Promise<"ok" | "stale"> {
  const data = restRowsOf(days, kind, now);
  const ops: Prisma.PrismaPromise<unknown>[] = [lifeLockOp(userId), restGuardOp(userId, w, standingCount(rows))];
  if (data.length === 1) {
    const d = data[0];
    ops.push(
      prisma.restDay.upsert({
        where: { userId_day: { userId, day: dateColumn(d.day) } },
        create: { userId, day: dateColumn(d.day), kind: d.kind, declaredAt: d.declaredAt, cancelledAt: null },
        update: { kind: d.kind, declaredAt: d.declaredAt, cancelledAt: null },
      })
    );
  } else {
    const existing = new Set(rows.map((r) => r.day));
    const reuse = data.filter((d) => existing.has(d.day));
    const fresh = data.filter((d) => !existing.has(d.day));
    if (reuse.length) {
      ops.push(
        prisma.restDay.updateMany({
          where: { userId, day: { in: reuse.map((d) => dateColumn(d.day)) } },
          data: { kind, declaredAt: now, cancelledAt: null },
        })
      );
    }
    if (fresh.length) {
      ops.push(
        prisma.restDay.createMany({
          data: fresh.map((d) => ({ userId, day: dateColumn(d.day), kind: d.kind, declaredAt: d.declaredAt, cancelledAt: null })),
        })
      );
    }
  }
  try {
    await prisma.$transaction(ops);
    return "ok";
  } catch (err) {
    if (isStaleRead(err) || isDuplicateActivity(err)) return "stale";
    throw err;
  } finally {
    invalidate("life", "activity");
  }
}

/** 'Rest Thu': a day after today, on or after DUTY_LAUNCH_DAY, at most two in its life week. */
export async function declareRestCore(userId: string, day: DayKey, now: Date = new Date()): Promise<LifeResult<{ day: DayKey; kind: RestKind }>> {
  if (typeof day !== "string" || !KEY_RE.test(day)) return fail("Pick a day.");
  const today = todayKey(now);
  const launchDay = dutyLaunchDay();
  const gate = dutyGateOf("declareRest", { today, launchDay, day });
  if (gate) return fail(gate);
  const w = restWindowOf({ kind: "REST", day });
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const rows = await readRestRows(userId, w);
    const why = validateRest({ day, today, launchDay, rows });
    if (why) return fail(why);
    if (rows.some((r) => r.day === day && r.kind === "REST" && r.cancelledAt == null)) return ok({ day, kind: "REST" });
    if ((await writeRestDays(userId, [day], "REST", now, w, rows)) === "ok") return ok({ day, kind: "REST" });
  }
  return fail(RACED);
}

/** 'Sick today': today only (on or after DUTY_LAUNCH_DAY), one per rolling 14 life days. */
export async function declareSickCore(userId: string, now: Date = new Date()): Promise<LifeResult<{ day: DayKey; kind: RestKind }>> {
  const today = todayKey(now);
  const launchDay = dutyLaunchDay();
  const gate = dutyGateOf("declareSick", { today, launchDay });
  if (gate) return fail(gate);
  const w = restWindowOf({ kind: "SICK", today });
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const rows = await readRestRows(userId, w);
    const why = validateSick({ today, launchDay, rows });
    if (why) return fail(why);
    if (rows.some((r) => r.day === today && r.kind === "SICK" && r.cancelledAt == null)) return ok({ day: today, kind: "SICK" });
    if ((await writeRestDays(userId, [today], "SICK", now, w, rows)) === "ok") return ok({ day: today, kind: "SICK" });
  }
  return fail(RACED);
}

/** A vacation from..to: 3 to 30 days from tomorrow (and from DUTY_LAUNCH_DAY), within 30 days per rolling 365. */
export async function setVacationCore(
  userId: string,
  from: DayKey,
  to: DayKey,
  now: Date = new Date()
): Promise<LifeResult<{ from: DayKey; to: DayKey; days: number; budgetLeft: number }>> {
  if (typeof from !== "string" || typeof to !== "string" || !KEY_RE.test(from) || !KEY_RE.test(to)) return fail("Pick the days.");
  const today = todayKey(now);
  const launchDay = dutyLaunchDay();
  const gate = dutyGateOf("setVacation", { today, launchDay, day: from });
  if (gate) return fail(gate);
  if (to < from) return fail("A vacation ends on or after its first day.");
  const w = restWindowOf({ kind: "VACATION", from, to });
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const rows = await readRestRows(userId, w);
    const v = validateVacation({ from, to, today, launchDay, rows });
    if (!v.ok) return fail(v.error);
    if ((await writeRestDays(userId, v.days, "VACATION", now, w, rows)) === "ok") {
      return ok({ from, to, days: v.days.length, budgetLeft: v.budgetLeft });
    }
  }
  return fail(RACED);
}

/** Cancels declarations from..to (one day when `to` is absent): only days after today; their vacation days are refunded. */
export async function cancelRestCore(userId: string, from: DayKey, to: DayKey | null = null, now: Date = new Date()): Promise<LifeResult<{ cancelled: DayKey[] }>> {
  const last = to ?? from;
  if (typeof from !== "string" || !KEY_RE.test(from) || typeof last !== "string" || !KEY_RE.test(last)) return fail("Pick the days.");
  const today = todayKey(now);
  // Nothing to cancel while Duty has no launch day (no RestDay row can exist yet).
  if (dutyLaunchDay() == null) return ok({ cancelled: [] });
  const rows = await readRestRows(userId, { from, to: last });
  const v = validateCancel({ from, to: last, today, rows });
  if (!v.ok) return fail(v.error);
  if (v.days.length === 0) return ok({ cancelled: [] });
  await prisma.restDay.updateMany({
    where: { userId, day: { in: v.days.map(dateColumn), gt: dateColumn(today) }, cancelledAt: null },
    data: { cancelledAt: now },
  });
  invalidate("life", "activity");
  return ok({ cancelled: v.days });
}

// ── Settings › Days ───────────────────────────────────────────────────────

/** 'Accept a loss' (LifeSettings.debtWriteOff). The row is created like every other: newLifeSettingsData (decision 1). */
export async function setDebtWriteOffCore(userId: string, on: boolean, now: Date = new Date()): Promise<LifeResult<{ debtWriteOff: boolean }>> {
  await prisma.lifeSettings.upsert({
    where: { userId },
    create: { userId, ...newLifeSettingsData(todayKey(now)), debtWriteOff: on },
    update: { debtWriteOff: on },
  });
  invalidate("life", "activity");
  return ok({ debtWriteOff: on });
}
