/**
 * Next week's calibration, the server half (blueprint 5.2d; plan P32, decision D36; every rule is week-calibration.ts's).
 * Server only. Its one automatic write is the frozen audit copy the life cron already writes (week-audit-server
 * freezeWeekAudit, behind settlementWritesEnabled); a quests-2 set is momentum-server's own write-once set. Accept runs
 * the very cores Today's drawer and Settings run; nothing here writes a row of its own.
 *
 *   calibrationFreezeOf(userId, ctx) → AuditExtra
 *       What the freeze adds to the copy: the week's tracked minutes a day (the TASK ticks recorded by the copy's 04:00,
 *       held days null), then, once CALIBRATION.MIN_AUDITS frozen copies are in reach, the calibration itself, from the
 *       copies before it (one indexed read) and the board as it stands (its musts' and habits' strengths, the
 *       declared capacity, the daily quests' cap). Each week says whether it was one of the audit's calibrating weeks
 *       (the frozen audit's own flag; an earlier copy's from the launch day, auditCalibrating), so none is judged
 *       against the target before the audit judges it (H12). Read only. A read that fails freezes the copy without
 *       them (it is logged), never blocks it.
 *   loadCalibration(userId, now?, env?) → WeekCalibration | null
 *       The calibration in force this life week: the one the week before's frozen copy stores, for this week. Null at
 *       once, with no read, while AUDIT_LAUNCH_DAY is not in force; cached per user and week under 'life' and
 *       'activity' (the copy's write clears it).
 *   readQuestSizes(userId, day, now) → QuestSizes | null
 *       Today's three sizes for `day` (momentum-server questSources); null while none is in force. Never throws: a
 *       failed read picks the standard sizes.
 *   loadNextWeek(userId, now?) → NextWeekView | null
 *       The "Next week" card (the weekly review's step 5, Today on Mondays) and the phone's `calibration`: the
 *       calibration with each change's state now, read from the capacity and the changes' templates (one wave, only
 *       when there is a calibration), and what an Accept would do, said before the tap (H13): an ease's day once Duty
 *       is live (duty-rule classifyChange, the drawer's own rule), a step-up's stake once Duty speaks about musts.
 *   acceptCalibrationCore(userId, changeId, now?) → LifeResult<CalibrationAccept>
 *       One tap on a change this week's calibration lists (any other is refused): the capacity through
 *       setDailyCapacityCore, a must eased through setCompulsoryCore ('Not a must': deferred to today + 7 once Duty is
 *       live, as the drawer's pill), a habit stepped up through setMustCore (a strengthening, under the daily quests'
 *       cap). No price, band or kept-week floor is in reach of any of them.
 */
import { prisma } from "./prisma";
import { cached } from "./cache";
import { addDays, dateColumn, keyOfDateColumn, todayKey, weekKeyOf, weekStartKeyOf, type DayKey } from "./life-day";
import { completesItself } from "./life-types";
import { isFixedSchedule, parseRule, scheduledPerWeek } from "./recurrence";
import { classifyChange, parsePendingChange, ruleOn, type DutyTemplate } from "./duty-rule";
import { akrasiaEffectiveDay, dutyLaunchDay, isDutyLaunched } from "./duty-economy";
import { debtFor } from "./life-grade";
import { dutyPhaseOf, formatDebt, stakesFromLine } from "./rituals";
import { mustCapOf, type QuestHeldDays } from "./daily-quests";
import { dayLabel } from "./duty-plan";
import { loadTodayBoard, setCompulsoryCore, setDailyCapacityCore, setMustCore, type LifeResult } from "./tasks";
import { PERSONAL_BOARD } from "./work-boards";
import { AUDIT_SOURCE, auditCalibrating, auditKey, auditLaunchDay, isAuditLaunched, parseAuditReceipt, type AuditEnv, type AuditExtra, type AuditWeek, type WeekAudit } from "./week-audit";
import {
  CALIBRATION,
  calibrationOf,
  nextWeekViewOf,
  questSizesOf,
  trackedMinutesOf,
  type CalibrationChange,
  type CalibrationFacts,
  type CalibrationWeek,
  type NextWeekView,
  type WeekCalibration,
} from "./week-calibration";
import type { QuestSizes } from "./momentum";

// ── The freeze ────────────────────────────────────────────────────────────

/**
 * What the freeze hands over: the week, the audit as frozen, its held days, the copy's 04:00, the cron's clock and the
 * audit's launch day (which weeks were calibrating).
 */
export interface CalibrationFreezeInput {
  week: AuditWeek;
  audit: WeekAudit;
  held: QuestHeldDays | undefined;
  asOf: Date;
  today: DayKey;
  now: Date;
  launchDay: DayKey;
}

/** The copy's additions (P32): the week's tracked minutes, and the calibration once MIN_AUDITS copies are in reach. */
export async function calibrationFreezeOf(userId: string, input: CalibrationFreezeInput): Promise<AuditExtra> {
  try {
    const { week, audit, held, asOf, today, now, launchDay } = input;
    const heldDays = held ? new Set([...held.restDays, ...held.freezeDays]) : null;
    const [rows, earlier] = await Promise.all([readTrackedRows(userId, week, asOf), readEarlierCopies(userId, week, launchDay)]);
    const tracked = trackedMinutesOf(rows, week.monday, heldDays);
    // A calibrating week (the audit's first two) is never judged against the target here either (H12).
    const self: CalibrationWeek = { weekKey: audit.weekKey, monday: audit.monday, target: audit.target, daily: audit.daily, tracked, calibrating: audit.calibrating };
    if (earlier.length + 1 < CALIBRATION.MIN_AUDITS) return { tracked };
    const calibration = calibrationOf(self, earlier, await readCalibrationFacts(userId, today, now));
    return calibration ? { tracked, calibration } : { tracked };
  } catch (err) {
    console.error("Week audit: next week's calibration failed to read; the copy is frozen without it.", err);
    return {};
  }
}

/** The week's TASK ticks and their undos recorded by the copy's 04:00 (a work tab's task writes no ledger row). */
async function readTrackedRows(userId: string, week: AuditWeek, asOf: Date) {
  const rows = await prisma.activityEvent.findMany({
    where: { userId, source: { in: ["TASK", "UNDO"] }, day: { gte: dateColumn(week.monday), lte: dateColumn(week.sunday) }, occurredAt: { lte: asOf } },
    select: { id: true, source: true, day: true, dedupeKey: true, receipt: true },
  });
  return rows.map((r) => ({ id: r.id, source: r.source, day: keyOfDateColumn(r.day), dedupeKey: r.dedupeKey, receipt: r.receipt as unknown }));
}

/** The frozen copies of the WEEKS − 1 weeks before (one indexed read by key), each saying whether it was calibrating. */
async function readEarlierCopies(userId: string, week: AuditWeek, launchDay: DayKey): Promise<CalibrationWeek[]> {
  const keys = Array.from({ length: CALIBRATION.WEEKS - 1 }, (_, i) => auditKey(weekKeyOf(addDays(week.monday, -7 * (i + 1)))));
  const rows = await prisma.activityEvent.findMany({ where: { userId, source: AUDIT_SOURCE, dedupeKey: { in: keys } }, select: { receipt: true } });
  return rows.flatMap((r) => {
    const copy = parseAuditReceipt(r.receipt);
    return copy ? [{ ...copy, calibrating: auditCalibrating(copy.monday, launchDay) }] : [];
  });
}

/**
 * The board as it stands at the freeze (the personal Board, Today's own read): the declared capacity, each must with a
 * repeat rule and its strength (whether a 'Not a must' is pending; `flexible` when it has no fixed days, so it counts in
 * the step-up's Established test and is never eased), and each habit with a fixed schedule that could step up, with
 * whether the daily quests' cap would refuse it as a must.
 */
async function readCalibrationFacts(userId: string, today: DayKey, now: Date): Promise<CalibrationFacts> {
  const data = await loadTodayBoard(userId, today, now);
  const duty = (t: (typeof data.templates)[number]): DutyTemplate => ({
    kind: t.kind,
    recurrence: t.recurrence,
    startDay: t.startDay,
    dueDay: t.dueDay,
    dueKind: t.dueKind,
    compulsory: t.compulsory,
    compulsoryOnRest: t.compulsoryOnRest ?? false,
    inbox: t.inbox,
    archivedDay: null,
    pendingChange: t.pendingChange ?? null,
  });
  const live = data.templates.filter((t) => (t.kind === "TASK" || t.kind === "HABIT") && !t.inbox);
  const standing = live.filter((t) => t.compulsory).map(duty);
  const musts: CalibrationFacts["musts"][number][] = [];
  const habits: CalibrationFacts["habits"][number][] = [];
  for (const t of live) {
    const rule = parseRule(t.recurrence);
    if (!rule || t.intrinsic || completesItself(t.autoMetric)) continue;
    const fixed = isFixedSchedule(rule);
    const strength = data.stats[t.id]?.strength.before ?? 0;
    if (ruleOn(duty(t), today).compulsory) {
      // Every daily quest with a repeat rule is in the Established test (a weekly target takes a slot too); one with no
      // fixed days is never offered to ease.
      musts.push({ templateId: t.id, title: t.title, strength, pending: parsePendingChange(t.pendingChange)?.next?.compulsory === false, ...(fixed ? {} : { flexible: true }) });
    } else if (fixed && !t.compulsory && scheduledPerWeek(rule) >= 1) {
      habits.push({ templateId: t.id, title: t.title, strength, capped: mustCapOf(standing, duty(t), today).capped });
    }
  }
  return { declared: data.capacityMin, musts, habits };
}

// ── The reads ─────────────────────────────────────────────────────────────

/** The calibration in force this life week, or null (dormant: no read while the audit is not launched). */
export async function loadCalibration(userId: string, now: Date = new Date(), env?: AuditEnv): Promise<WeekCalibration | null> {
  const today = todayKey(now);
  if (!isAuditLaunched(today, auditLaunchDay(env))) return null;
  const monday = weekStartKeyOf(today);
  const from = weekKeyOf(addDays(monday, -7));
  return cached(`calibration:${userId}:${from}`, ["life", "activity"], async () => {
    const row = await prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: auditKey(from) } }, select: { receipt: true } });
    const calibration = row ? (parseAuditReceipt(row.receipt)?.calibration ?? null) : null;
    return calibration && calibration.monday === monday ? calibration : null;
  });
}

/** Today's three sizes for `day` (its week's calibration), or null: the standard sizes. */
export async function readQuestSizes(userId: string, day: DayKey, now: Date): Promise<QuestSizes | null> {
  try {
    const c = await loadCalibration(userId, now);
    return c && c.monday === weekStartKeyOf(day) ? questSizesOf(c) : null;
  } catch (err) {
    console.error("[momentum] the week's calibrated sizes failed to read; the standard sizes are picked", err);
    return null;
  }
}

/** The "Next week" card's view: this week's calibration with each change's state now; null with none. */
export async function loadNextWeek(userId: string, now: Date = new Date()): Promise<NextWeekView | null> {
  const c = await loadCalibration(userId, now);
  if (!c) return null;
  const ids = c.changes.flatMap((ch) => (ch.kind === "capacity" ? [] : [ch.templateId]));
  const today = todayKey(now);
  // What an Accept would do, said before the tap (H13): the drawer's rule for an ease's day, the Must chip's for a stake.
  const dutyLaunch = dutyLaunchDay();
  const launched = isDutyLaunched(today, dutyLaunch);
  const phase = dutyPhaseOf(today, dutyLaunch);
  return cached(`nextWeek:${userId}:${c.weekKey}:${today}`, ["life", "activity"], async () => {
    const [settings, rows] = await Promise.all([
      prisma.lifeSettings.findUnique({ where: { userId }, select: { dailyCapacityMin: true } }),
      ids.length > 0
        ? prisma.taskTemplate.findMany({
            where: { userId, ...PERSONAL_BOARD, id: { in: ids } },
            select: { id: true, compulsory: true, compulsoryOnRest: true, archivedAt: true, pendingChange: true, createdAt: true, band: true, bandOverride: true, estMinutes: true, machineMinutes: true },
          })
        : Promise.resolve([]),
    ]);
    return nextWeekViewOf(c, {
      capacity: settings?.dailyCapacityMin ?? 0,
      templates: rows.map((t) => {
        const next = parsePendingChange(t.pendingChange)?.next;
        const unflag = classifyChange({ compulsory: t.compulsory, compulsoryOnRest: t.compulsoryOnRest }, { compulsory: false }, { createdAt: t.createdAt, now, launched });
        const stake =
          phase === "live"
            ? `As a must, ≈ −${formatDebt(debtFor({ band: t.band, bandOverride: t.bandOverride, estMinutes: t.estMinutes, machineMinutes: t.machineMinutes }))} if missed.`
            : phase === "announced" && dutyLaunch
              ? `${stakesFromLine(dutyLaunch)}.`
              : null;
        return {
          id: t.id,
          compulsory: t.compulsory,
          archived: t.archivedAt != null,
          pendingNotMustDay: next?.compulsory === false ? next.effectiveDay : null,
          unflagFrom: unflag === "deferred" ? akrasiaEffectiveDay(today) : null,
          stake,
        };
      }),
    });
  });
}

// ── Accept ────────────────────────────────────────────────────────────────

/** What one Accept did, in the words the card says back. */
export interface CalibrationAccept {
  id: string;
  kind: CalibrationChange["kind"];
  line: string;
}

export const CALIBRATION_NONE = "There is no calibration for this week.";
export const CALIBRATION_NOT_OFFERED = "That change isn't on this week's calibration.";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Accept one change this week's calibration lists, through the core the same change runs anywhere else. */
export async function acceptCalibrationCore(userId: string, changeId: string, now: Date = new Date()): Promise<LifeResult<CalibrationAccept>> {
  const c = await loadCalibration(userId, now);
  if (!c) return fail(CALIBRATION_NONE);
  const ch = c.changes.find((x) => x.id === changeId);
  if (!ch) return fail(CALIBRATION_NOT_OFFERED);
  if (ch.kind === "capacity") {
    const res = await setDailyCapacityCore(userId, ch.minutes, now);
    return res.ok ? { ok: true, value: { id: ch.id, kind: ch.kind, line: `Daily capacity set to ${res.value.minutes} minutes.` } } : res;
  }
  if (ch.kind === "ease") {
    const res = await setCompulsoryCore(userId, ch.templateId, now);
    if (!res.ok) return res;
    const when = res.value.effect === "deferred" && res.value.effectiveDay ? ` from ${dayLabel(res.value.effectiveDay)}` : "";
    return { ok: true, value: { id: ch.id, kind: ch.kind, line: `${ch.name} is not a must${when}.` } };
  }
  const res = await setMustCore(userId, ch.templateId, now);
  return res.ok ? { ok: true, value: { id: ch.id, kind: ch.kind, line: `${ch.name} is a must from today.` } } : res;
}
