/**
 * The lazy, idempotent week judge (M5 lane A, F4): replaces a settlement's
 * Sunday step. Server only. The rules are pure in life-weeks.ts (planWeeks);
 * this file reads the state fresh, applies the plans and writes.
 *
 * Spec: docs/life-plan/m5-refit.md F4; contract: docs/life-plan/m5-contracts.md §7.
 *
 *   judgeClosedWeeks(userId, now, {force?, dryRun?}) → {launched, plans, committed}
 *   maybeJudgeWeeks(userId, now?)                    → void; the after() entry, never throws
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
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { activityOp, isDuplicateActivity } from "./activity";
import { mintLifeMasteryOps } from "./mastery";
import { captureSnapshot, detectCelebrations } from "./celebrations";
import { withMoments } from "./today-board";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, weekKeyOf, weekStartKeyOf, type DayKey } from "./life-day";
import { isLaunched, lifeLaunchDay, lifeWritesEnabled, parseMintDetail, weekRowKey } from "./life-economy";
import { isTrack } from "./life-grade";
import { loadLifeLedger } from "./life-tracks-server";
import { judgedWeekKeys } from "./life-tracks";
import {
  lastJudgeableSunday,
  planWeeks,
  weeksToJudge,
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

/**
 * The judge's state, fresh, for the weeks this run covers. Two round trips:
 * the epoch and every WEEK key first (the weeks a run covers depend on both),
 * then, in one Promise.all over exactly those weeks' days, the TASK and UNDO
 * rows with sink TRACK (joined to their template's category), the compulsory
 * TASK and HABIT templates (archived ones included), their instances (one-off
 * instances of any earlier day too: done early still keeps a deadline), and
 * the MP_MINT rows dated in the range (the life-week cap).
 */
async function readJudgeState(userId: string, today: DayKey, launchDay: DayKey): Promise<WeekJudgeState | null> {
  const [settings, weekRows] = await Promise.all([
    prisma.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true } }),
    prisma.activityEvent.findMany({ where: { userId, source: "WEEK", dedupeKey: { not: null } }, select: { dedupeKey: true } }),
  ]);
  if (!settings) return null;
  const epochDay = keyOfDateColumn(settings.epochDay);
  const judged = new Set<string>(weekRows.map((r) => r.dedupeKey!));
  const weeks = weeksToJudge(today, epochDay, judged);
  const base = { today, launchDay, epochDay, judged, heldDays: new Set<DayKey>() };
  if (weeks.length === 0) return { ...base, rows: [], templates: [], instances: [], mints: [] };

  const from = weeks[0].monday;
  const to = weeks[weeks.length - 1].sunday;
  const [rows, templates, instances, mints] = await Promise.all([
    prisma.$queryRaw<TaskRowRaw[]>`
      SELECT e."id", e."source", e."dedupeKey", e."day", e."track", e."templateId", e."rawXp", e."receipt", t."category"
      FROM "ActivityEvent" e
      LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
      WHERE e."userId" = ${userId} AND e."sink" = 'TRACK' AND e."source" IN ('TASK', 'UNDO') AND e."track" IS NOT NULL
        AND e."day" >= ${from}::date AND e."day" <= ${to}::date
    `,
    prisma.taskTemplate.findMany({
      where: { userId, compulsory: true, kind: { in: ["TASK", "HABIT"] }, startDay: { lte: dateColumn(to) } },
      select: { id: true, kind: true, recurrence: true, startDay: true, dueDay: true, archivedAt: true },
    }),
    prisma.taskInstance.findMany({
      where: {
        userId,
        template: { compulsory: true, kind: { in: ["TASK", "HABIT"] } },
        OR: [{ day: { gte: dateColumn(from), lte: dateColumn(to) } }, { day: { lte: dateColumn(to) }, template: { recurrence: null } }],
      },
      select: { templateId: true, day: true, status: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", day: { gte: dateColumn(from), lte: dateColumn(to) } },
      select: { day: true, qty: true, detail: true },
    }),
  ]);

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
    rows: taskRows,
    templates: templates.map(
      (t): WeekTemplate => ({
        id: t.id,
        kind: t.kind as TaskKind,
        recurrence: t.recurrence,
        startDay: keyOfDateColumn(t.startDay),
        dueDay: t.dueDay ? keyOfDateColumn(t.dueDay) : null,
        archivedDay: t.archivedAt ? dayKeyOf(t.archivedAt) : null,
      })
    ),
    instances: instances.map((i): WeekInstance => ({ templateId: i.templateId, day: keyOfDateColumn(i.day), status: i.status as InstanceStatus })),
    mints: mints.map((m): WeekMintRow => ({ day: keyOfDateColumn(m.day), qty: m.qty ?? 0, reason: parseMintDetail(m.detail).reason })),
  };
}

/** One week's rows: a WEEK row per missing track, then its LIFE_WEEK_KEPT mints (each with its ledger entry). */
function weekOps(userId: string, plan: WeekPlan, now: Date): Prisma.PrismaPromise<unknown>[] {
  return [
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
 * most 12 per run. Writes only when launched and (lifeWritesEnabled() ||
 * force); dryRun returns the plans and writes nothing (also before the launch
 * day, for the launch script). The writes run inside withMoments: a 'settle'
 * snapshot before and after and detectCelebrations({cause: 'settle'}), so a
 * week Seal persists as pending and plays on the next load.
 */
export async function judgeClosedWeeks(userId: string, now: Date, opts: JudgeOptions = {}): Promise<JudgeResult> {
  const today = todayKey(now);
  const launchDay = lifeLaunchDay();
  const launched = isLaunched(today, launchDay);
  const none: JudgeResult = { launched, plans: [], committed: [] };
  if (launchDay == null) return none;
  const write = !opts.dryRun && launched && (lifeWritesEnabled() || opts.force === true);
  if (!write && !opts.dryRun) return none;

  const state = await readJudgeState(userId, today, launchDay);
  if (!state) return none;
  const plans = planWeeks(state);
  if (!write || plans.length === 0) return { launched, plans, committed: [] };

  let committed: string[] = [];
  await withMoments({
    snapshot: () => captureSnapshot(userId, { scope: "settle", now }),
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

/**
 * The after() entry for page reads (/you, /today/week; /today from phase B).
 * Returns at once unless writes on read are enabled, life is launched, the
 * user has an epochDay and the week of lastJudgeableSunday is missing from
 * the cached ledger's judged weeks (weeks commit oldest first, so that week
 * judged means every earlier one is). Single flight per user. Never throws:
 * a failure is logged and the next render tries again.
 */
export function maybeJudgeWeeks(userId: string, now: Date = new Date()): Promise<void> {
  try {
    if (!lifeWritesEnabled()) return Promise.resolve();
    const today = todayKey(now);
    if (!isLaunched(today)) return Promise.resolve();
    const running = inflight.get(userId);
    if (running) return running;
    const run = (async () => {
      const ledger = await loadLifeLedger(userId);
      if (!ledger.epochDay) return;
      const sunday = lastJudgeableSunday(today);
      // No week has closed since the epoch's week began: nothing to judge.
      if (sunday < addDays(weekStartKeyOf(ledger.epochDay), 6)) return;
      if (judgedWeekKeys(ledger).includes(weekKeyOf(sunday))) return;
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
