/**
 * The weekly audit's reads and its one write (server only; every rule is week-audit.ts's). The facts are the week
 * strip's own (daily-quests-server readQuestFacts), so the audit's rate is what Tasks › Habits counts for the week.
 *
 *   loadWeekAudit(userId, now?, env?) → WeekAudit | null
 *       /today/week's card and the phone's `week`. Null while AUDIT_LAUNCH_DAY is not in force, or before the first
 *       audited week. The week's frozen copy when it has one (read back, never recomputed: frozen, then final from
 *       its judge's Wednesday); otherwise the week read live (provisional), with "Decaying this week" read beside it
 *       (audit-decay-server readAuditDecay; P12). Cached per user, week and life day under 'life' and 'activity' (a
 *       tick, a skip, a rule change or the copy's write clears it), and 'fields', 'ideas' and 'progress' (a review, a
 *       level drop, an idle-decay tick) for the decay.
 *   freezeWeekAudit(userId, now, opts?) → AuditFreezeRun
 *       The life cron's write, just after the Monday 04:00 turn: the week just ended, as it stood at that turn (the
 *       instances set by 04:00 only, week-audit.ts auditFreezeAsOf and instancesAsOf: the cron reads at 04:15 or
 *       05:15, and a tick in between is left out), stored once as 'audit:<YYYY-Www>' (week-audit.ts
 *       auditEventInput: sink NONE, xp 0, never a streak day), its decay (read when the cron runs) with it. A copy already
 *       there stands (a second write is a unique violation, reported FROZEN); a later tick or make-up never reaches it.
 *       Only settlement.ts runAuditStep calls it, behind settlementWritesEnabled (never on dev or a Preview: dev and
 *       prod share one database), so this file holds no write gate of its own beyond the launch day.
 */
import { prisma } from "./prisma";
import { cached } from "./cache";
import { activityData, invalidateActivity, isDuplicateActivity } from "./activity";
import { todayKey, type DayKey } from "./life-day";
import { readQuestFacts } from "./daily-quests-server";
import { readAuditDecay } from "./audit-decay-server";
import {
  auditEventInput,
  auditFreezeAsOf,
  auditFreezeWeek,
  auditKey,
  auditLaunchDay,
  auditWeekAt,
  frozenAuditOf,
  instancesAsOf,
  isAuditLaunched,
  parseAuditReceipt,
  weekAuditOf,
  type AuditEnv,
  type AuditWeek,
  type WeekAudit,
} from "./week-audit";

export async function loadWeekAudit(userId: string, now: Date = new Date(), env?: AuditEnv): Promise<WeekAudit | null> {
  const today = todayKey(now);
  const launchDay = auditLaunchDay(env);
  const week = auditWeekAt(now, today, launchDay);
  if (!week || launchDay == null) return null;
  return cached(`weekAudit:${userId}:${week.weekKey}:${today}`, ["life", "activity", "fields", "ideas", "progress"], () => readWeekAudit(userId, week, launchDay, today, now));
}

/** The frozen copy once the week has ended (none can exist before its Monday), else the week read live. */
async function readWeekAudit(userId: string, week: AuditWeek, launchDay: DayKey, today: DayKey, now: Date): Promise<WeekAudit> {
  if (today > week.sunday) {
    const row = await prisma.activityEvent.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey: auditKey(week.weekKey) } },
      select: { receipt: true },
    });
    const copy = row ? parseAuditReceipt(row.receipt) : null;
    if (copy) return frozenAuditOf(copy, today, launchDay);
  }
  const [facts, decaying] = await Promise.all([readQuestFacts(userId, week.monday, today, { habits: true }), decayOf(userId, week, now)]);
  return weekAuditOf({ week, launchDay, templates: facts.templates, instances: facts.instances, held: facts.held, decaying, today, now });
}

/** "Decaying this week" (P12): each source soft on its own; a read that still throws leaves the block out (null). */
function decayOf(userId: string, week: AuditWeek, now: Date) {
  return readAuditDecay(userId, week, now).catch((err: unknown) => {
    console.error("Week audit: the decay failed to read; the block is left out.", err);
    return null;
  });
}

/** What the cron's audit step did: the week it froze (or found frozen), or why it froze none. */
export interface AuditFreezeRun {
  weekKey: string | null;
  froze: boolean;
  /** NOT_LAUNCHED (AUDIT_LAUNCH_DAY not in force), NOT_DUE (not the Monday or Tuesday after an audited week), FROZEN (its copy stands). */
  skipped: "NOT_LAUNCHED" | "NOT_DUE" | "FROZEN" | null;
}

export async function freezeWeekAudit(userId: string, now: Date, opts: { env?: AuditEnv } = {}): Promise<AuditFreezeRun> {
  const today = todayKey(now);
  const launchDay = auditLaunchDay(opts.env);
  if (launchDay == null || !isAuditLaunched(today, launchDay)) return { weekKey: null, froze: false, skipped: "NOT_LAUNCHED" };
  const week = auditFreezeWeek(today);
  if (!week || week.sunday < launchDay) return { weekKey: null, froze: false, skipped: "NOT_DUE" };
  const key = auditKey(week.weekKey);
  const existing = await prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: key } }, select: { id: true } });
  if (existing) return { weekKey: week.weekKey, froze: false, skipped: "FROZEN" };
  const [facts, decaying] = await Promise.all([readQuestFacts(userId, week.monday, today, { habits: true }), decayOf(userId, week, now)]);
  // As of the 04:00 turn the copy names, not the cron's own minute: a tick set after it is left out.
  const asOf = auditFreezeAsOf(today);
  const audit = weekAuditOf({ week, launchDay, templates: facts.templates, instances: instancesAsOf(facts.instances, asOf), held: facts.held, decaying, today, now: asOf });
  const input = auditEventInput(audit, today, now);
  try {
    await prisma.activityEvent.create({ data: activityData(userId, input) });
  } catch (err) {
    // Another run wrote it first: its copy stands.
    if (isDuplicateActivity(err)) return { weekKey: week.weekKey, froze: false, skipped: "FROZEN" };
    throw err;
  } finally {
    invalidateActivity(input);
  }
  return { weekKey: week.weekKey, froze: true, skipped: null };
}
