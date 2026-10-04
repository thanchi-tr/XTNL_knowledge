/**
 * The lazy, idempotent week judge (M5 lane A, F4): replaces a settlement's
 * Sunday step. Server only. The rules are pure in life-weeks.ts (planWeeks);
 * this file reads the state fresh, applies the plans and writes.
 *
 * Spec: docs/life-plan/m5-refit.md F4; contract: docs/life-plan/m5-contracts.md §7.
 *
 *   judgeClosedWeeks(userId, now, {force?, dryRun?, moments?, maxWeeks?}) → {launched, plans, committed}
 *   maybeJudgeWeeks(userId, now?)                    → void; the after() entry, never throws
 *   launchGraceDetail(launchDay)                     → 'life launch <day>': the DECAY_GRACE row the
 *                                                      launch script writes last; until it exists
 *                                                      maybeJudgeWeeks judges nothing (M5 review C4)
 *   launchHasFinished(userId, launchDay)             → whether that row exists (M2 review: exported
 *                                                      so the daily cron, which calls judgeClosedWeeks
 *                                                      directly, honours the same marker)
 *
 * Safety, in order:
 *   - Nothing is planned before LIFE_LAUNCH_DAY is set, and nothing is written
 *     before the launch day. A pre-launch week is written as 'backfill · …'
 *     for depth and never mints.
 *   - Writes on read need lifeWritesEnabled() (production, or XTNL_LIFE_JUDGE=1
 *     on the rehearsal server) or an explicit force from scripts/life-launch.ts:
 *     dev and prod share one database, so a local dev server never judges.
 *   - Every row has a dedupe key ('week:<TRACK>:<week>', 'mp:LIFE_WEEK_KEPT:
 *     <TRACK>:<week>'). Each week commits in one $transaction array (no
 *     interactive transaction); a P2002 means another run judged it first, so
 *     this run stops and the next render re-reads. Two renders, two devices or
 *     a render racing the launch script write each key once.
 *   - Weeks commit oldest first, so a judged week means every earlier one is.
 *   - Each week's array opens with the life-mint advisory lock (the one a goal
 *     close takes), so the two never interleave their MP reads and writes.
 *   - Page loads judge nothing until the launch script has finished (its
 *     DECAY_GRACE row 'life launch <day>' exists): the launch judges the
 *     backfill without per-week moments and then plays the one launch moment,
 *     which a page load in between would otherwise pre-empt.
 *
 * M2 (lane B, compatible; m2-refit.md decisions 5, 6, 16, 18, 20 and F11):
 *   - The DUTY gate: a Duty week's DUTY row and its full-day mints wait until
 *     settlement has settled its Sunday (LifeSettings.settledThroughDay);
 *     BODY, CRAFT and CARE are judged on the usual Wednesday. The cheap check
 *     in maybeJudgeWeeks reads the cursor from the cached ledger and returns
 *     without a read while only a gated DUTY is missing.
 *   - The read also takes every TASK or HABIT template with a pendingChange
 *     (with its rule columns), each instance's repaired flag, one-off
 *     instances through Sunday + MAKEUP_RESTORE_DAYS, the mints' keys and,
 *     only when a week of the run is a Duty week, the RestDay rows (through
 *     duty-rule heldDaysOf) and the FREEZE_USE and FULL_DAY days. Still two
 *     round trips.
 *   - A held week's WEEK row carries receipt {mark: 'held', restDays} (qty 0).
 *     Full-day mints ride in the same array as the DUTY row, after the kept
 *     tracks, under the same life-mint lock.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { activityOp, isDuplicateActivity } from "./activity";
import { mintLifeMasteryOps } from "./mastery";
import { captureSnapshot, detectCelebrations } from "./celebrations";
import { withMoments } from "./today-board";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import {
  DECAY_GRACE_REASON,
  WEEK_JUDGE_MAX_WEEKS,
  heldWeekReceipt,
  isLaunched,
  lifeLaunchDay,
  lifeWritesEnabled,
  parseMintDetail,
  weekRowKey,
} from "./life-economy";
import { MAKEUP_RESTORE_DAYS, dutyLaunchDay } from "./duty-economy";
import { heldDaysOf, type RestRow } from "./duty-rule";
import { isTrack } from "./life-grade";
import { lifeMintLockOp, loadLifeLedger } from "./life-tracks-server";
import {
  planWeeks,
  weeksToJudge,
  type DutyGate,
  type WeekInstance,
  type WeekJudgeState,
  type WeekMintRow,
  type WeekPlan,
  type WeekTaskRow,
  type WeekTemplate,
} from "./life-weeks";
import type { Category, InstanceStatus, Receipt, TaskKind } from "./life-types";

export interface JudgeOptions {
  /** Write even where writes on read are off (the launch script's --apply). Still never before the launch day. */
  force?: boolean;
  /** Read and plan, write nothing: the launch script's dry run. Works before the launch day. */
  dryRun?: boolean;
  /**
   * Capture the 'settle' moments around the writes (default true). The launch
   * script passes false: it judges the backfill silently, then captures the
   * one launch moment itself, so per-week Seals never claim its keys first.
   */
  moments?: boolean;
  /**
   * Weeks per run (default WEEK_JUDGE_MAX_WEEKS, 12). Honoured only with
   * dryRun: the launch script's dry run plans every remaining week, so its
   * figures match what the --apply loop writes.
   */
  maxWeeks?: number;
}

export interface JudgeResult {
  /** isLaunched(today) for the judge's clock. */
  launched: boolean;
  /** The plans read this run (oldest first). Empty when nothing is due. */
  plans: WeekPlan[];
  /** Week keys this run wrote. */
  committed: string[];
}

interface TaskRowRaw {
  id: string;
  source: string;
  dedupeKey: string | null;
  day: Date;
  track: string | null;
  templateId: string | null;
  rawXp: number | null;
  receipt: Prisma.JsonValue;
  category: string | null;
}

const CATEGORY_SET = new Set<string>(["EXERCISE", "HEALTH", "CHORE", "ERRAND", "ADMIN", "WORK", "STUDY", "CREATIVE", "SOCIAL", "CARE", "SPIRIT", "OTHER"]);

function receiptOf(v: Prisma.JsonValue): Receipt | null {
  return v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as { factors?: unknown }).factors) ? (v as unknown as Receipt) : null;
}

interface RestRowRaw {
  day: Date;
  kind: string;
  declaredAt: Date;
  cancelledAt: Date | null;
}

const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);

/**
 * The templates DUTY's occurrences read: every compulsory TASK or HABIT
 * template, plus (M2, decision 16) every one with a pendingChange — a
 * weakening still pending, or a prior segment whose week is not yet judged —
 * each judged per day through duty-rule ruleOn. Archived ones included.
 * "Has a pendingChange" is SQL `IS NOT NULL` (Prisma.DbNull), the same filter
 * settlement reads with: lane C clears the column to a database NULL
 * (pendingChangeJson null → Prisma.DbNull), and a stray JSON null read here
 * is harmless (ruleOn reads it as no history).
 */
const DUTY_TEMPLATES = {
  kind: { in: ["TASK", "HABIT"] },
  OR: [{ compulsory: true }, { pendingChange: { not: Prisma.DbNull } }],
} satisfies Prisma.TaskTemplateWhereInput;

/**
 * The judge's state, fresh, for the weeks this run covers. Two round trips:
 * the epoch, the settlement cursor and every WEEK key first (the weeks a run
 * covers depend on all three), then, in one Promise.all over exactly those
 * weeks' days, the TASK and UNDO rows with sink TRACK (joined to their
 * template's category), the compulsory TASK and HABIT templates and those
 * with a pendingChange (archived ones included), their instances (one-off
 * instances of any earlier day too, and through the last Sunday +
 * MAKEUP_RESTORE_DAYS: done early still keeps a deadline, done by its due
 * day + 2 keeps an M2 one), the MP_MINT rows dated in the range (the
 * life-week cap) and — only when the run holds a Duty week — the RestDay
 * rows and the FREEZE_USE and FULL_DAY days from the Duty launch day on.
 */
async function readJudgeState(userId: string, today: DayKey, launchDay: DayKey, maxWeeks: number): Promise<WeekJudgeState | null> {
  const [settings, weekRows] = await Promise.all([
    prisma.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true, settledThroughDay: true } }),
    prisma.activityEvent.findMany({ where: { userId, source: "WEEK", dedupeKey: { not: null } }, select: { dedupeKey: true } }),
  ]);
  if (!settings) return null;
  const epochDay = keyOfDateColumn(settings.epochDay);
  const gate: DutyGate = {
    dutyLaunchDay: dutyLaunchDay(),
    settledThroughDay: settings.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    epochDay,
  };
  const judged = new Set<string>(weekRows.map((r) => r.dedupeKey!));
  const weeks = weeksToJudge(today, epochDay, judged, maxWeeks, gate);
  const base = {
    today,
    launchDay,
    epochDay,
    judged,
    heldDays: new Set<DayKey>(),
    maxWeeks,
    dutyLaunchDay: gate.dutyLaunchDay,
    settledThroughDay: gate.settledThroughDay,
    restDays: new Set<DayKey>(),
    fullDays: [] as DayKey[],
  };
  if (weeks.length === 0) return { ...base, rows: [], templates: [], instances: [], mints: [] };

  const from = weeks[0].monday;
  const to = weeks[weeks.length - 1].sunday;
  // M2's reads, only for the Duty weeks of the run (none before DUTY_LAUNCH_DAY is set).
  const dutyFrom = gate.dutyLaunchDay != null && to >= gate.dutyLaunchDay ? maxDay(from, gate.dutyLaunchDay) : null;
  const noRest: RestRowRaw[] = [];
  const noDays: { source: string; day: Date }[] = [];
  const [rows, templates, instances, mints, restRows, dutyRows] = await Promise.all([
    prisma.$queryRaw<TaskRowRaw[]>`
      SELECT e."id", e."source", e."dedupeKey", e."day", e."track", e."templateId", e."rawXp", e."receipt", t."category"
      FROM "ActivityEvent" e
      LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
      WHERE e."userId" = ${userId} AND e."sink" = 'TRACK' AND e."source" IN ('TASK', 'UNDO') AND e."track" IS NOT NULL
        AND e."day" >= ${from}::date AND e."day" <= ${to}::date
    `,
    prisma.taskTemplate.findMany({
      where: { userId, ...DUTY_TEMPLATES, startDay: { lte: dateColumn(to) } },
      select: {
        id: true,
        kind: true,
        recurrence: true,
        startDay: true,
        dueDay: true,
        archivedAt: true,
        compulsory: true,
        compulsoryOnRest: true,
        inbox: true,
        dueKind: true,
        pendingChange: true,
      },
    }),
    prisma.taskInstance.findMany({
      where: {
        userId,
        template: DUTY_TEMPLATES,
        OR: [
          { day: { gte: dateColumn(from), lte: dateColumn(to) } },
          { day: { lte: dateColumn(addDays(to, MAKEUP_RESTORE_DAYS)) }, template: { recurrence: null } },
        ],
      },
      select: { templateId: true, day: true, status: true, repaired: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", day: { gte: dateColumn(from), lte: dateColumn(to) } },
      select: { day: true, qty: true, detail: true, dedupeKey: true },
    }),
    dutyFrom
      ? prisma.restDay.findMany({
          where: { userId, day: { gte: dateColumn(dutyFrom), lte: dateColumn(to) } },
          select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
        })
      : Promise.resolve(noRest),
    dutyFrom
      ? prisma.activityEvent.findMany({
          where: { userId, source: { in: ["FREEZE_USE", "FULL_DAY"] }, day: { gte: dateColumn(dutyFrom), lte: dateColumn(to) } },
          select: { source: true, day: true },
        })
      : Promise.resolve(noDays),
  ]);

  // Held days: the declared ones (pro-rate the floors) and the freeze days (hold, never pro-rate).
  const restDays = new Set<DayKey>();
  const heldDays = new Set<DayKey>();
  const fullDays = new Set<DayKey>();
  if (dutyFrom) {
    const rest: RestRow[] = restRows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
    for (const d of heldDaysOf(rest, dutyFrom, to)) {
      restDays.add(d);
      heldDays.add(d);
    }
    for (const r of dutyRows) {
      const day = keyOfDateColumn(r.day);
      if (r.source === "FREEZE_USE") heldDays.add(day);
      else if (r.source === "FULL_DAY") fullDays.add(day);
    }
  }

  const taskRows: WeekTaskRow[] = [];
  for (const r of rows) {
    if (!isTrack(r.track) || (r.source !== "TASK" && r.source !== "UNDO")) continue;
    taskRows.push({
      id: r.id,
      source: r.source,
      dedupeKey: r.dedupeKey,
      day: keyOfDateColumn(new Date(r.day)),
      track: r.track,
      templateId: r.templateId,
      rawXp: Number(r.rawXp ?? 0),
      receipt: receiptOf(r.receipt),
      category: r.category && CATEGORY_SET.has(r.category) ? (r.category as Category) : null,
    });
  }
  return {
    ...base,
    heldDays,
    restDays,
    fullDays: [...fullDays].sort(),
    rows: taskRows,
    templates: templates.map(
      (t): WeekTemplate => ({
        id: t.id,
        kind: t.kind as TaskKind,
        recurrence: t.recurrence,
        startDay: keyOfDateColumn(t.startDay),
        dueDay: t.dueDay ? keyOfDateColumn(t.dueDay) : null,
        archivedDay: t.archivedAt ? dayKeyOf(t.archivedAt) : null,
        compulsory: t.compulsory,
        compulsoryOnRest: t.compulsoryOnRest,
        inbox: t.inbox,
        dueKind: t.dueKind,
        pendingChange: t.pendingChange,
      })
    ),
    instances: instances.map(
      (i): WeekInstance => ({ templateId: i.templateId, day: keyOfDateColumn(i.day), status: i.status as InstanceStatus, repaired: i.repaired })
    ),
    mints: mints.map((m): WeekMintRow => ({ day: keyOfDateColumn(m.day), qty: m.qty ?? 0, reason: parseMintDetail(m.detail).reason, key: m.dedupeKey })),
  };
}

/**
 * One week's rows, after the life-mint lock: a WEEK row per missing track
 * (a held one with receipt {mark: 'held', restDays}), then its
 * LIFE_WEEK_KEPT mints and, in the run that writes DUTY, its LIFE_FULL_DAY
 * mints (each with its ledger entry when it pays).
 */
function weekOps(userId: string, plan: WeekPlan, now: Date): Prisma.PrismaPromise<unknown>[] {
  return [
    lifeMintLockOp(userId),
    ...plan.tracks.map((t) =>
      activityOp(userId, {
        source: "WEEK",
        sink: "NONE",
        track: t.track,
        day: plan.sunday,
        occurredAt: now,
        qty: t.kept ? 1 : 0,
        countsForStreak: false,
        detail: t.detail,
        dedupeKey: weekRowKey(t.track, plan.weekKey),
        // The held mark is structural (life-tracks weekMarkOf); the receipt column is free JSON on a WEEK row.
        ...(t.held ? { receipt: heldWeekReceipt(t.restDays ?? 0) as unknown as Receipt } : {}),
      })
    ),
    ...plan.mints.flatMap((m) => mintLifeMasteryOps(userId, { ...m, now })),
  ];
}

/** Commits the plans oldest first; stops at the first week another run already judged. */
async function commitPlans(userId: string, plans: readonly WeekPlan[], now: Date): Promise<string[]> {
  const committed: string[] = [];
  try {
    for (const plan of plans) {
      try {
        await prisma.$transaction(weekOps(userId, plan, now));
        committed.push(plan.weekKey);
      } catch (err) {
        if (isDuplicateActivity(err)) break;
        throw err;
      }
    }
  } finally {
    invalidate("life", "progress", "activity");
  }
  return committed;
}

/**
 * Judges every closed life week still missing a verdict, oldest first, at
 * most 12 per run (a dry run: maxWeeks). Writes only when launched and
 * (lifeWritesEnabled() || force); dryRun returns the plans and writes nothing
 * (also before the launch day, for the launch script). Unless moments is
 * false, the writes run inside withMoments: a 'settle' snapshot before and
 * after (each with its own Date, so nothing keyed by identity can hand the
 * after one the before one's read) and detectCelebrations({cause: 'settle'}),
 * so a week Seal persists as pending and plays on the next load.
 */
export async function judgeClosedWeeks(userId: string, now: Date, opts: JudgeOptions = {}): Promise<JudgeResult> {
  const today = todayKey(now);
  const launchDay = lifeLaunchDay();
  const launched = isLaunched(today, launchDay);
  const none: JudgeResult = { launched, plans: [], committed: [] };
  if (launchDay == null) return none;
  const write = !opts.dryRun && launched && (lifeWritesEnabled() || opts.force === true);
  if (!write && !opts.dryRun) return none;

  const maxWeeks = opts.dryRun && typeof opts.maxWeeks === "number" && opts.maxWeeks >= 1 ? Math.floor(opts.maxWeeks) : WEEK_JUDGE_MAX_WEEKS;
  const state = await readJudgeState(userId, today, launchDay, maxWeeks);
  if (!state) return none;
  const plans = planWeeks(state);
  if (!write || plans.length === 0) return { launched, plans, committed: [] };

  if (opts.moments === false) return { launched, plans, committed: await commitPlans(userId, plans, now) };

  let committed: string[] = [];
  await withMoments({
    snapshot: () => captureSnapshot(userId, { scope: "settle", now: new Date(now.getTime()) }),
    detect: (before, after) => detectCelebrations(before, after, { cause: "settle", now }),
    write: async () => {
      committed = await commitPlans(userId, plans, now);
      return { ok: true as const, value: { committed } };
    },
    changed: (v) => v.committed.length > 0,
  });
  return { launched, plans, committed };
}

/** In-flight judge runs, one per user: two renders at once share one run. */
const inflight = new Map<string, Promise<void>>();

/** The detail of the launch script's DECAY_GRACE row ('life launch 2026-10-05'): its idempotency key and the launch-finished marker. */
export function launchGraceDetail(launchDay: DayKey): string {
  return `life launch ${launchDay}`;
}

/** Users whose launch has finished, by '<user>:<launch day>'. The marker is permanent, so a process reads it once. */
const launchFinished = new Set<string>();

/**
 * Whether scripts/life-launch.ts --apply has finished for this user: its
 * DECAY_GRACE row exists. False with no launch day. Exported for the daily
 * cron (settlement.ts runLifeCron), which judges through judgeClosedWeeks
 * directly and must skip the judge until this is true, as page loads do.
 */
export async function launchHasFinished(userId: string, launchDay: DayKey | null): Promise<boolean> {
  if (launchDay == null) return false;
  const key = `${userId}:${launchDay}`;
  if (launchFinished.has(key)) return true;
  const row = await prisma.masteryLedgerEntry.findFirst({
    where: { userId, reason: DECAY_GRACE_REASON, detail: launchGraceDetail(launchDay) },
    select: { id: true },
  });
  if (row) launchFinished.add(key);
  return row != null;
}

/**
 * The after() entry for page reads (/you, /today/week; /today from phase B;
 * M2: through settlement.ts maybeMaintainLife, settle first). Returns at once
 * unless writes on read are enabled, life is launched, the user has an
 * epochDay, some closed week from the epoch's on still misses a track in the
 * cached ledger (weeksToJudge over its WEEK rows; M2: a Duty week's DUTY that
 * settlement is still holding back — its Sunday after the cached
 * settledThroughDay — does not count, so a DUTY-only gap never re-reads on
 * every render) and the launch script has finished (its DECAY_GRACE row
 * 'life launch <day>' exists: between the deploy and --apply, page loads
 * leave the backfill and the one launch moment to it). Single flight per
 * user. Never throws: a failure is logged and the next render tries again.
 */
export function maybeJudgeWeeks(userId: string, now: Date = new Date()): Promise<void> {
  try {
    if (!lifeWritesEnabled()) return Promise.resolve();
    const today = todayKey(now);
    const launchDay = lifeLaunchDay();
    if (launchDay == null || !isLaunched(today, launchDay)) return Promise.resolve();
    const running = inflight.get(userId);
    if (running) return running;
    const run = (async () => {
      const ledger = await loadLifeLedger(userId);
      if (!ledger.epochDay) return;
      // Nothing to judge: no closed week misses a track, or only a DUTY that settlement still holds back.
      const judged = new Set(ledger.weeks.map((w) => weekRowKey(w.track, w.weekKey)));
      const gate: DutyGate = { dutyLaunchDay: dutyLaunchDay(), settledThroughDay: ledger.settledThroughDay ?? null, epochDay: ledger.epochDay };
      if (weeksToJudge(today, ledger.epochDay, judged, 1, gate).length === 0) return;
      if (!(await launchHasFinished(userId, launchDay))) return;
      await judgeClosedWeeks(userId, now);
    })()
      .catch((err) => {
        console.error("[life-weeks] judge failed", err);
      })
      .finally(() => {
        inflight.delete(userId);
      });
    inflight.set(userId, run);
    return run;
  } catch (err) {
    console.error("[life-weeks] judge failed", err);
    return Promise.resolve();
  }
}
