/**
 * FROZEN CONTRACT (M2 lane 0 shell; lane A implements, F5) — the settlement
 * executor, the one maintenance chain and the life cron's handler.
 *
 *   settleLifeDays(userId, now, opts?) → SettleResult
 *     Writes only when isDutyLaunched(today), the cursor is not null and
 *     (lifeWritesEnabled() || opts.force). dryRun returns the plans and
 *     writes nothing. Two reads, then one $transaction array per chunk of
 *     SETTLE_CHUNK_DAYS (lifeLockOp, a cursor/freeze guard, the grouped
 *     ops). opts.early settles any backlog and then yesterday (refused
 *     before launch).
 *   maybeMaintainLife(userId, now?) → void
 *     The after() entry for /today, /you and /today/week: single flight per
 *     user, settle when the cursor is behind, then maybeJudgeWeeks. Never
 *     throws.
 *
 * Spec: docs/life-plan/m2-refit.md decisions 2, 4, 5 and F5; contract
 * table: docs/life-plan/m2-contracts.md. Server only.
 *
 * Added by lane A (compatible):
 *   SettleOptions.client        the Prisma client to use (the checks pass a recording stub)
 *   maybeMaintainLife(userId, now?, opts?)   opts: { env?, client?, judge? } for the checks
 *   SettlementClient · SettlementRead · readSettlementState(client, userId, now, opts)
 *                               the two reads (the launch script's dry run plans from them)
 *   ChunkGroup · groupChunk(plans) · UpdateBatch · updateBatchesOf(updates) · chunkStatementLabels(group)
 *                               a chunk's ops grouped for statement count, and the statements it issues
 *   SettleGuard · settleGuardSql(userId, guard) · chunkGuardOf(read, chunk, group, ctx)
 *   chargedOneOffsOf(group, state) · guardOfSql(sql)   the guard, and the checks' seam to evaluate it
 *   settlementWritesEnabled(env)  lifeWritesEnabled, and never on a Vercel Preview/development deployment
 *   cronAuthorized(header, secret) · LifeCronDeps · runLifeCron(request, deps?) · lifeLaunchFinished(userId, day)
 *                               the /api/cron/life handler (route.ts may export only GET)
 *   XTNL_IDEA_PROJECT_REF · REHEARSAL_DB_PORT · DatasourceTarget · launchTargetOf(env)
 *   launchDaysFor(target, env?) · launchApplyTooEarly(today, firstDutyDay)
 *                               the launch and rehearsal scripts' database and timing guards (pure)
 *
 * Added by roadmap lane G (docs/life-plan/roadmap.md F16 seam 8; compatible):
 *   RoadmapStepDeps · RoadmapStepContext · runRoadmapStep(userId, now, ctx)
 *                               the third step of the chain and the life cron (settle → judge →
 *                               roadmap): freeze this week's quest set, record readings, finalise
 *                               settled weeks, each in its own try
 *   DegradeRoadmapReport · recordRoadmapAfterDegrade(userId, now, ctx?)
 *                               the degrade cron's readings, once it has degraded
 *   MaintainOptions.roadmap · LifeCronDeps.roadmap   the checks' injected roadmap writers
 *   The roadmap step is gated only by settlementWritesEnabled() (lifeWritesEnabled and the
 *   VERCEL_ENV rule): never by DUTY_LAUNCH_DAY or the settlement cursor, so it runs while Duty
 *   is inert. It never fails its caller, and the cron's status stays what settle and the judge set.
 *
 * Shared-database safety (decision 2): dev and prod share one Supabase
 * database, so nothing here writes unless settlementWritesEnabled()
 * (production, or XTNL_LIFE_JUDGE=1 on the rehearsal server; never a Vercel
 * Preview) or an explicit force (the launch and rehearsal scripts), and never
 * while the cursor is null or before DUTY_LAUNCH_DAY. maybeMaintainLife on a
 * dev server reads nothing for settlement. The cron refuses (401) unless
 * CRON_SECRET is set and the Authorization header carries it.
 *
 * Idempotency: every chunk commits in one $transaction array that opens
 * with the life-complete advisory lock (the completion paths' own), then
 * one guard statement (SELECT 1 / 0 unless the cursor and epochDay are still
 * the ones this run read — the two inputs of duty-economy settledFor — the
 * FREEZE_* row count is unchanged, the moved UNDONE instances are still
 * UNDONE, no compulsory one-off the chunk charges has been done since, and
 * the chunk's days a request can still write to (today − 2; yesterday on an
 * early settle) hold the same rows). A failed guard (22012) or a unique
 * violation (P2002: another run won) rolls the chunk back; the run re-reads
 * and re-plans, up to SETTLE_ATTEMPTS times. So two renders, two devices,
 * the cron and an early settle write every day once, and a quiet day (no
 * keyed row, only the cursor) is protected by the cursor guard alone.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { activityData, isDuplicateActivity } from "./activity";
import { addDays, dateColumn, dayKeyOf, dayStartOf, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import {
  SETTLE_CHUNK_DAYS,
  SETTLE_LAG_DAYS,
  dutyLagging,
  dutyLaunchDay,
  firstDutyDay,
  isDutyLaunched,
  lastSettleableDay,
  settledFor,
  type DutyEnv,
} from "./duty-economy";
import { DECAY_GRACE_REASON, lifeLaunchDay, lifeWritesEnabled, parseWeekRowKey, type LifeEnv } from "./life-economy";
import { parsePendingChange, type RestRow } from "./duty-rule";
import { isTrack, toBand } from "./life-grade";
import { parseRule } from "./recurrence";
import { isStaleGuard } from "./life-tracks-server";
import { judgeClosedWeeks, launchGraceDetail, maybeJudgeWeeks, type JudgeResult } from "./life-weeks-server";
import { getCurrentUserId } from "./user";
import { shortDate, weekdayName } from "./today-board";
import {
  planSettlement,
  settleRange,
  settleReadWindow,
  settledInstanceId,
  type DayPlan,
  type InstanceCreateOp,
  type InstanceUpdateOp,
  type SettlementDayFacts,
  type SettlementInstance,
  type SettlementLedgerRow,
  type SettlementState,
  type SettlementTemplate,
  type TemplateHousekeepingOp,
} from "./settlement-plan";
import type { ActivityInput, ActivitySource, AutoMetric, InstanceSource, InstanceStatus, Receipt, Sink, TaskKind, Track } from "./life-types";
import { recordRoadmapReadings, type ReadingsCaller } from "./roadmap-readings";
import { finalizeQuestWeeks, freezeWeekQuests } from "./roadmap-quests-server";
import { roadmapStepErrorsOf, type QuestFinalizeRun, type QuestFreezeRun, type ReadingsRun, type RoadmapStepReport, type RoadmapWriteOpts, type WeekQuestSource } from "./roadmap-types";

/**
 * The variables settlement and the cron read. Defaults to process.env; the checks inject their own.
 * VERCEL_ENV: a Vercel Preview or development deployment ('preview', 'development') never settles,
 * even with NODE_ENV production, because it shares the live database (settlementWritesEnabled).
 */
export type SettleEnv = LifeEnv & DutyEnv & { CRON_SECRET?: string; VERCEL_ENV?: string };

/** The Prisma surface settlement uses: the real client, or the checks' recording stub. */
export type SettlementClient = Pick<
  PrismaClient,
  "lifeSettings" | "taskTemplate" | "taskInstance" | "activityEvent" | "restDay" | "$transaction" | "$executeRaw" | "$queryRaw"
>;

export interface SettleOptions {
  /** The last day to settle; defaults to today − SETTLE_LAG_DAYS. An early settle passes yesterday. */
  through?: DayKey;
  /** 'Settle yesterday': backlog first, then yesterday; refused before launch. */
  early?: boolean;
  /** Plan only; write nothing. */
  dryRun?: boolean;
  /** Write even when lifeWritesEnabled() is false (the launch and rehearsal scripts only). */
  force?: boolean;
  /** The variables the gates read; defaults to process.env (the checks inject their own). */
  env?: LifeEnv & DutyEnv & { VERCEL_ENV?: string };
  /** Lane A: the client to read and write with; defaults to the app's Prisma client. */
  client?: SettlementClient;
}

export interface SettleResult {
  /** isDutyLaunched(today). */
  launched: boolean;
  /** Whether anything was written. */
  wrote: boolean;
  cursorBefore: DayKey | null;
  cursorAfter: DayKey | null;
  /** The plans made (written, or only planned on a dry run or when writes are off). */
  plans: DayPlan[];
  /** Why nothing was settled, in words ('Duty starts Mon 12 Oct'); null when it ran. */
  refused: string | null;
}

/** Re-read and re-plan this many times when another run got there first (guard 22012 or P2002). */
const SETTLE_ATTEMPTS = 3;
/** An early settle repeats the run (14 days each) until it reaches yesterday, at most this many times. */
const EARLY_MAX_PASSES = 3;

export const WRITES_OFF_REFUSAL = "Settlement does not write from this server (dev and prod share one database).";
const NO_SETTINGS_REFUSAL = "There is nothing to settle yet.";
const NO_CURSOR_REFUSAL = "Duty is not switched on for this account yet.";
const BUSY_REFUSAL = "Another settlement was running at the same moment. It will finish on the next load.";

function processEnv(): SettleEnv {
  if (typeof process === "undefined" || !process.env) return {};
  return {
    NODE_ENV: process.env.NODE_ENV,
    XTNL_LIFE_LAUNCH_DAY: process.env.XTNL_LIFE_LAUNCH_DAY,
    XTNL_LIFE_JUDGE: process.env.XTNL_LIFE_JUDGE,
    XTNL_DUTY_LAUNCH_DAY: process.env.XTNL_DUTY_LAUNCH_DAY,
    CRON_SECRET: process.env.CRON_SECRET,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

/**
 * Whether settlement may write from this server: lifeWritesEnabled(), i.e.
 * XTNL_LIFE_JUDGE=1 (the rehearsal server), or NODE_ENV production on a
 * deployment that is not a Vercel Preview or development one. A Preview
 * build runs with NODE_ENV production against the same shared database, so
 * without this a pushed branch would settle the live account with its own
 * DUTY_LAUNCH_DAY. The VERCEL_ENV clause is restated here so settlement
 * keeps it whatever lifeWritesEnabled's version; it is the same rule, so
 * settlement and the judge always agree. Local servers have no VERCEL_ENV.
 */
export function settlementWritesEnabled(env: SettleEnv): boolean {
  const vercel = env.VERCEL_ENV?.trim();
  return lifeWritesEnabled(env) && (env.XTNL_LIFE_JUDGE === "1" || !vercel || vercel === "production");
}

/** 'Duty starts Mon 12 Oct', or 'Duty has not started.' without a launch day. */
function notStarted(launchDay: DayKey | null): string {
  return launchDay ? `Duty starts ${weekdayName(launchDay)} ${shortDate(launchDay)}` : "Duty has not started.";
}

// ── The reads ─────────────────────────────────────────────────────────────

export interface SettlementRead {
  state: SettlementState;
  /** TaskTemplate.pendingChange as stored, by id: a housekeeping write lands only while it is unchanged. */
  rawPending: Map<string, Prisma.JsonValue | null>;
  /** Every ActivityEvent row per day in the facts window (COUNT(*)), for the guard's fresh-day clause. */
  dayRows: ReadonlyMap<DayKey, number>;
}

interface RowRaw {
  id: string;
  day: Date;
  source: string;
  sink: string;
  track: string | null;
  templateId: string | null;
  sourceId: string | null;
  xp: number | null;
  rawXp: number | null;
  qty: number | null;
  countsForStreak: boolean;
  dedupeKey: string | null;
  receipt: Prisma.JsonValue;
  tplId: string | null;
  tplNormTitle: string | null;
  tplTitle: string | null;
  tplBand: string | null;
  tplBandOverride: number | null;
  tplAutoMetric: string | null;
}

interface FactsRaw {
  day: Date;
  /** Every row on the day. */
  n: number | null;
  units: number | null;
  reviews: number | null;
  ideas: number | null;
  dayOpens: number | null;
  dayOpenQty: number | null;
}

const AUTO_METRICS: ReadonlySet<string> = new Set(["REVIEWS", "IDEAS", "REVIEW_DUE", "STEPS", "WORKOUT"]);
const DONE_STATUSES = ["DONE", "DONE_LATE", "DONE_MVV"];

const asAutoMetric = (x: string | null): AutoMetric | null => (x && AUTO_METRICS.has(x) ? (x as AutoMetric) : null);
const dayOf = (d: Date | string): DayKey => keyOfDateColumn(new Date(d));
const num = (x: unknown): number => (typeof x === "number" ? x : Number(x ?? 0)) || 0;
const numOrNull = (x: unknown): number | null => (x == null ? null : Number.isFinite(Number(x)) ? Number(x) : null);

function receiptOf(v: Prisma.JsonValue): Receipt | null {
  return v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as { factors?: unknown }).factors) ? (v as unknown as Receipt) : null;
}

/**
 * Read 1 (LifeSettings: cursor and epoch) and, when there is anything to
 * settle, Read 2: one Promise.all of everything in SettlementState for the
 * range settleRange gives. Read-only. `cursor` overrides the stored one (the
 * launch script's dry run plans as if the cursor were already set);
 * `through` caps the range (an early settle passes yesterday). Null when
 * the user has no LifeSettings.
 */
export async function readSettlementState(
  client: SettlementClient,
  userId: string,
  now: Date,
  opts: { launchDay: DayKey | null; through?: DayKey; cursor?: DayKey | null }
): Promise<SettlementRead | null> {
  const today = todayKey(now);
  const settings = await client.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true, settledThroughDay: true } });
  if (!settings) return null;
  const epochDay = dayOf(settings.epochDay);
  const cursor = opts.cursor !== undefined ? opts.cursor : settings.settledThroughDay ? dayOf(settings.settledThroughDay) : null;
  const base: SettlementState = {
    today,
    now,
    dutyLaunchDay: opts.launchDay,
    epochDay,
    cursor,
    ...(opts.through ? { through: opts.through } : {}),
    templates: [],
    instances: [],
    rows: [],
    days: [],
    freezeEarned: 0,
    freezeUsed: 0,
    lastFreezeEarnDay: null,
    openDebts: [],
    restRows: [],
    judgedDutyWeeks: new Set<string>(),
  };
  const range = settleRange(base);
  if (!range) return { state: base, rawPending: new Map(), dayRows: new Map() };
  const { from, to, floor } = range;
  const { periodFloor, rowsFrom } = settleReadWindow(range);

  const [templates, instances, rows, facts, freezes, before, debts, rest, dutyWeeks] = await Promise.all([
    client.taskTemplate.findMany({
      where: {
        userId,
        kind: { in: ["TASK", "HABIT"] },
        startDay: { lte: dateColumn(to) },
        AND: [
          // Archived before the range's second day: nothing in the range is expected of it.
          { OR: [{ archivedAt: null }, { archivedAt: { gte: dayStartOf(addDays(from, 1)) } }] },
          { OR: [{ recurrence: { not: null } }, { compulsory: true }, { pendingChange: { not: Prisma.DbNull } }] },
        ],
      },
      select: {
        id: true,
        kind: true,
        title: true,
        normTitle: true,
        track: true,
        band: true,
        bandOverride: true,
        estMinutes: true,
        machineMinutes: true,
        intrinsic: true,
        mvv: true,
        mvvMinutes: true,
        autoMetric: true,
        autoTarget: true,
        createdAt: true,
        recurrence: true,
        startDay: true,
        dueDay: true,
        dueKind: true,
        compulsory: true,
        compulsoryOnRest: true,
        inbox: true,
        archivedAt: true,
        pendingChange: true,
      },
    }),
    client.taskInstance.findMany({
      where: {
        userId,
        OR: [
          { day: { gte: dateColumn(periodFloor), lte: dateColumn(to) } },
          // A deadline one-off due in the range, done on any day: done early or late, it owes nothing (decision 18).
          {
            status: { in: DONE_STATUSES },
            template: { recurrence: null, dueKind: "DEADLINE", dueDay: { gte: dateColumn(from), lte: dateColumn(to) } },
          },
        ],
      },
      select: { id: true, templateId: true, day: true, slot: true, status: true, source: true, debtXp: true, debtOpen: true, repaired: true },
    }),
    client.$queryRaw<RowRaw[]>(Prisma.sql`
      SELECT e."id", e."day", e."source", e."sink", e."track", e."templateId", e."sourceId",
             e."xp", e."rawXp", e."qty", e."countsForStreak", e."dedupeKey", e."receipt",
             t."id" AS "tplId", t."normTitle" AS "tplNormTitle", t."title" AS "tplTitle", t."band" AS "tplBand",
             t."bandOverride" AS "tplBandOverride", t."autoMetric" AS "tplAutoMetric"
      FROM "ActivityEvent" e
      LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
      WHERE e."userId" = ${userId} AND e."day" >= ${rowsFrom}::date AND e."day" <= ${to}::date
        AND (e."source" IN ('TASK', 'UNDO', 'FREEZE_EARN', 'FREEZE_USE', 'REPAIR', 'FULL_DAY', 'DEBT') OR e."rawXp" IS NOT NULL)
      ORDER BY e."day" ASC, e."occurredAt" ASC, e."id" ASC
    `),
    client.$queryRaw<FactsRaw[]>(Prisma.sql`
      SELECT "day",
             COUNT(*)::int AS "n",
             SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END)::int AS "units",
             (COUNT(*) FILTER (WHERE "source" = 'REVIEW'))::int AS "reviews",
             (COUNT(*) FILTER (WHERE "source" = 'IDEA_CREATE'))::int AS "ideas",
             (COUNT(*) FILTER (WHERE "source" = 'DAY_OPEN'))::int AS "dayOpens",
             (MAX("qty") FILTER (WHERE "source" = 'DAY_OPEN'))::float8 AS "dayOpenQty"
      FROM "ActivityEvent"
      WHERE "userId" = ${userId} AND "day" >= ${rowsFrom}::date AND "day" <= ${to}::date
      GROUP BY "day"
    `),
    client.activityEvent.groupBy({
      by: ["source"],
      where: { userId, source: { in: ["FREEZE_EARN", "FREEZE_USE"] } },
      _count: { _all: true },
      _max: { day: true },
    }),
    // Active days before the facts read, since the last earn (and never before firstDutyDay): the freeze count's tail.
    floor < rowsFrom
      ? client.$queryRaw<{ n: number | null }[]>(Prisma.sql`
          SELECT COUNT(*)::int AS "n" FROM (
            SELECT "day" FROM "ActivityEvent"
            WHERE "userId" = ${userId} AND "day" >= ${floor}::date AND "day" < ${rowsFrom}::date
              AND "day" > COALESCE(
                (SELECT MAX("day") FROM "ActivityEvent" WHERE "userId" = ${userId} AND "source" = 'FREEZE_EARN'),
                DATE '0001-01-01')
            GROUP BY "day"
            HAVING SUM(CASE WHEN "countsForStreak" THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END) > 0
          ) AS "active"
        `)
      : Promise.resolve([{ n: 0 }]),
    client.taskInstance.findMany({
      where: { userId, debtOpen: true },
      select: { id: true, templateId: true, day: true, slot: true, debtXp: true },
    }),
    client.restDay.findMany({
      where: { userId, day: { gte: dateColumn(rowsFrom), lte: dateColumn(to) } },
      select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
    }),
    client.activityEvent.findMany({
      where: { userId, source: "WEEK", track: "DUTY", dedupeKey: { not: null } },
      select: { dedupeKey: true },
    }),
  ]);

  const rawPending = new Map<string, Prisma.JsonValue | null>();
  const tpls: SettlementTemplate[] = templates.map((t) => {
    rawPending.set(t.id, t.pendingChange ?? null);
    return {
      id: t.id,
      kind: t.kind as TaskKind,
      title: t.title,
      normTitle: t.normTitle,
      track: isTrack(t.track) ? t.track : "DUTY",
      band: toBand(t.band),
      bandOverride: t.bandOverride,
      estMinutes: t.estMinutes,
      machineMinutes: t.machineMinutes,
      intrinsic: t.intrinsic,
      mvv: t.mvv,
      mvvMinutes: t.mvvMinutes,
      autoMetric: asAutoMetric(t.autoMetric),
      autoTarget: t.autoTarget,
      createdAt: t.createdAt,
      recurrence: t.recurrence,
      startDay: dayOf(t.startDay),
      dueDay: t.dueDay ? dayOf(t.dueDay) : null,
      dueKind: t.dueKind,
      compulsory: t.compulsory,
      compulsoryOnRest: t.compulsoryOnRest,
      inbox: t.inbox,
      archivedDay: t.archivedAt ? dayKeyOf(t.archivedAt) : null,
      pendingChange: parsePendingChange(t.pendingChange),
    };
  });

  const insts: SettlementInstance[] = instances.map((i) => ({
    id: i.id,
    templateId: i.templateId,
    day: dayOf(i.day),
    slot: i.slot,
    status: i.status as InstanceStatus,
    source: i.source as InstanceSource,
    debtXp: i.debtXp,
    debtOpen: i.debtOpen,
    repaired: i.repaired,
  }));

  const ledgerRows: SettlementLedgerRow[] = rows.map((r) => ({
    id: r.id,
    day: dayOf(r.day),
    source: r.source as ActivitySource,
    sink: (r.sink === "TRACK" || r.sink === "DOMAIN" ? r.sink : "NONE") as Sink,
    track: isTrack(r.track) ? (r.track as Track) : null,
    templateId: r.templateId,
    sourceId: r.sourceId,
    xp: num(r.xp),
    rawXp: numOrNull(r.rawXp),
    qty: numOrNull(r.qty),
    countsForStreak: r.countsForStreak === true,
    dedupeKey: r.dedupeKey,
    receipt: receiptOf(r.receipt),
    joined: r.tplId
      ? {
          normTitle: r.tplNormTitle ?? "",
          title: r.tplTitle ?? "",
          band: toBand(r.tplBand),
          bandOverride: num(r.tplBandOverride),
          autoMetric: asAutoMetric(r.tplAutoMetric),
        }
      : null,
  }));

  const days: SettlementDayFacts[] = facts.map((f) => ({
    day: dayOf(f.day),
    streakUnits: num(f.units),
    reviews: num(f.reviews),
    ideas: num(f.ideas),
    dayOpenQty: num(f.dayOpens) > 0 ? num(f.dayOpenQty) : null,
  }));
  const dayRows = new Map<DayKey, number>(facts.map((f) => [dayOf(f.day), num(f.n)]));

  let freezeEarned = 0;
  let freezeUsed = 0;
  let lastFreezeEarnDay: DayKey | null = null;
  for (const g of freezes) {
    const n = num(g._count?._all);
    if (g.source === "FREEZE_EARN") {
      freezeEarned = n;
      lastFreezeEarnDay = g._max?.day ? dayOf(g._max.day) : null;
    } else if (g.source === "FREEZE_USE") freezeUsed = n;
  }

  const restRows: RestRow[] = rest.map((r) => ({ day: dayOf(r.day), kind: r.kind, declaredAt: new Date(r.declaredAt), cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null }));
  const judgedDutyWeeks = new Set<string>();
  for (const w of dutyWeeks) {
    const parsed = parseWeekRowKey(w.dedupeKey);
    if (parsed?.track === "DUTY") judgedDutyWeeks.add(parsed.weekKey);
  }

  return {
    state: {
      ...base,
      templates: tpls,
      instances: insts,
      rows: ledgerRows,
      days,
      freezeEarned,
      freezeUsed,
      lastFreezeEarnDay,
      openDebts: debts.map((d) => ({ instanceId: d.id, templateId: d.templateId, day: dayOf(d.day), slot: d.slot, debtXp: d.debtXp })),
      restRows,
      judgedDutyWeeks,
      activeDaysBefore: num(before[0]?.n),
    },
    rawPending,
    dayRows,
  };
}

// ── Grouping a chunk (pure) ───────────────────────────────────────────────

export interface ChunkGroup {
  /** Every instance create in the chunk: one taskInstance.createMany. */
  creates: InstanceCreateOp["data"][];
  /** UNDONE instances moved, by id (later wins); written in batches of identical data (updateBatchesOf), one guarded updateMany per batch. Rare: a tick undone and never redone. */
  updates: { id: string; data: InstanceUpdateOp["data"] }[];
  /** Every ledger row in the chunk: one activityEvent.createMany. */
  events: ActivityInput[];
  /** Template housekeeping merged per template (later wins): one guarded updateMany each (rare: a rule change taking effect). */
  templates: { templateId: string; data: TemplateHousekeepingOp["data"] }[];
  /** The chunk's last day: the cursor it leaves. */
  cursor: DayKey;
  /** FREEZE_EARN and FREEZE_USE rows the chunk writes (the next chunk's guard expects them). */
  freezeRows: number;
}

/** A chunk's ops grouped for statement count (F5): creates, updates, events, template housekeeping, the cursor. */
export function groupChunk(plans: readonly DayPlan[]): ChunkGroup {
  const creates: ChunkGroup["creates"] = [];
  const updates = new Map<string, InstanceUpdateOp["data"]>();
  const events: ActivityInput[] = [];
  const templates = new Map<string, TemplateHousekeepingOp["data"]>();
  let cursor = plans[plans.length - 1]?.day ?? "";
  for (const p of plans) {
    for (const op of p.ops) {
      switch (op.kind) {
        case "instanceCreate":
          creates.push(op.data);
          break;
        case "instanceUpdate":
          updates.set(op.id, { ...(updates.get(op.id) ?? {}), ...op.data });
          break;
        case "event":
          events.push(op.input);
          break;
        case "templateHousekeeping":
          templates.set(op.templateId, { ...(templates.get(op.templateId) ?? {}), ...op.data });
          break;
        case "cursor":
          if (op.day > cursor) cursor = op.day;
          break;
      }
    }
  }
  return {
    creates,
    updates: [...updates].map(([id, data]) => ({ id, data })),
    events,
    templates: [...templates].map(([templateId, data]) => ({ templateId, data })),
    cursor,
    freezeRows: events.filter((e) => e.source === "FREEZE_EARN" || e.source === "FREEZE_USE").length,
  };
}

export interface UpdateBatch {
  ids: string[];
  data: InstanceUpdateOp["data"];
}

/**
 * A chunk's moved instances batched by identical data, so the statement
 * count follows the distinct outcomes (EXCUSED, one MISSED per debt amount,
 * a rebuilt study row), not the number of instances: one typed, guarded
 * updateMany per batch (the spec's single UPDATE … FROM (VALUES) without
 * untested raw SQL). Batches in first-seen order, ids in plan order.
 */
export function updateBatchesOf(updates: ChunkGroup["updates"]): UpdateBatch[] {
  const iso = (x: Date | null | undefined) => (x === undefined ? "∅" : x === null ? null : x.toISOString());
  const batches = new Map<string, UpdateBatch>();
  for (const u of updates) {
    const d = u.data;
    const key = JSON.stringify([d.status, d.debtXp, d.debtOpen, iso(d.judgedAt), d.source ?? null, iso(d.completedAt), d.xpPaid ?? null]);
    const batch = batches.get(key);
    if (batch) batch.ids.push(u.id);
    else batches.set(key, { ids: [u.id], data: d });
  }
  return [...batches.values()];
}

/** The statements one chunk's $transaction issues, in order: 'lock', 'guard', then the grouped writes and 'cursor'. A quiet chunk is 3. */
export function chunkStatementLabels(g: ChunkGroup): string[] {
  return [
    "lock",
    "guard",
    ...(g.creates.length ? ["instances.createMany"] : []),
    ...updateBatchesOf(g.updates).map((b) => `instances.updateMany:${b.ids.join(",")}`),
    ...(g.events.length ? ["events.createMany"] : []),
    ...g.templates.map((t) => `template.update:${t.templateId}`),
    "cursor",
  ];
}

// ── The writes ────────────────────────────────────────────────────────────

/**
 * What the guard statement asserts before a chunk writes: every fact the
 * chunk's plans were made from that another writer could have changed since
 * the read. Each clause mirrors exactly what the read returned (a clause the
 * read could not reproduce would fail on every retry and stall settlement).
 */
export interface SettleGuard {
  /**
   * settledThroughDay must still be this (IS NOT DISTINCT FROM) and epochDay
   * still `epochDay`: the two inputs of the one settled-day rule
   * (duty-economy settledFor, floor = firstDutyDay(epochDay)), so the days
   * this chunk settles are still exactly the unsettled ones it planned.
   */
  cursor: DayKey;
  epochDay: DayKey;
  /** count(FREEZE_EARN) + count(FREEZE_USE), all history, must still be this. */
  freezeRows: number;
  /**
   * The chunk's days a request can still write to while settlement runs:
   * today − 2 (a 'record yesterday' that straddled 04:00) and, on an early
   * settle, yesterday. Their ActivityEvent rows (all of them), TaskInstance
   * rows and non-cancelled RestDay rows must still number what was read, so
   * a tick, undo, record or same-day SICK landing after the read re-plans
   * the day (activity, Full day, repair, freeze, study musts, misses).
   * Null when the chunk has no such day.
   */
  fresh: { from: DayKey; to: DayKey; events: number; instances: number; rest: number } | null;
  /** Instances this chunk moves must all still be UNDONE. */
  undone: string[];
  /**
   * Compulsory deadline one-offs this chunk marks MISSED: none may have a
   * done instance (DONE, DONE_LATE, DONE_MVV) on any day. A late tick that
   * committed after the read then fails the chunk and the re-plan charges
   * nothing (decision 18: one path only). The opposite order is the tick's
   * guard (tasks.ts freshnessGuardOp refuses once the one-off is MISSED).
   */
  oneOffs: string[];
}

/** Guard statements by the SettleGuard they were built from: the checks' stub client evaluates a guard through guardOfSql. */
const GUARDS = new WeakMap<object, SettleGuard>();

/** The SettleGuard a guard statement was built from; null for any other SQL. The checks' seam (scripts/settle-check.ts). */
export function guardOfSql(sql: unknown): SettleGuard | null {
  return sql != null && typeof sql === "object" ? GUARDS.get(sql) ?? null : null;
}

/** The guard statement: SELECT 1 / 0 (SQLSTATE 22012) unless every clause still holds. A missing LifeSettings row fails it too. */
export function settleGuardSql(userId: string, g: SettleGuard): Prisma.Sql {
  const clauses: Prisma.Sql[] = [
    Prisma.sql`COALESCE((SELECT "settledThroughDay" IS NOT DISTINCT FROM ${g.cursor}::date AND "epochDay" = ${g.epochDay}::date FROM "LifeSettings" WHERE "userId" = ${userId}), FALSE)`,
    Prisma.sql`(SELECT COUNT(*) FROM "ActivityEvent" WHERE "userId" = ${userId} AND "source" IN ('FREEZE_EARN', 'FREEZE_USE')) = ${g.freezeRows}::int`,
  ];
  if (g.fresh) {
    const f = g.fresh;
    clauses.push(
      Prisma.sql`(SELECT COUNT(*) FROM "ActivityEvent" WHERE "userId" = ${userId} AND "day" >= ${f.from}::date AND "day" <= ${f.to}::date) = ${f.events}::int`,
      Prisma.sql`(SELECT COUNT(*) FROM "TaskInstance" WHERE "userId" = ${userId} AND "day" >= ${f.from}::date AND "day" <= ${f.to}::date) = ${f.instances}::int`,
      Prisma.sql`(SELECT COUNT(*) FROM "RestDay" WHERE "userId" = ${userId} AND "day" >= ${f.from}::date AND "day" <= ${f.to}::date AND "cancelledAt" IS NULL) = ${f.rest}::int`
    );
  }
  if (g.undone.length > 0) {
    clauses.push(
      Prisma.sql`(SELECT COUNT(*) FROM "TaskInstance" WHERE "userId" = ${userId} AND "id" IN (${Prisma.join(g.undone)}) AND "status" = 'UNDONE') = ${g.undone.length}::int`
    );
  }
  if (g.oneOffs.length > 0) {
    clauses.push(
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "TaskInstance" WHERE "userId" = ${userId} AND "templateId" IN (${Prisma.join(g.oneOffs)}) AND "status" IN ('DONE', 'DONE_LATE', 'DONE_MVV'))`
    );
  }
  const sql = Prisma.sql`SELECT 1 / (CASE WHEN ${Prisma.join(clauses, " AND ")} THEN 1 ELSE 0 END)`;
  GUARDS.set(sql, g);
  return sql;
}

/** The one-off templates (no recurrence) a chunk marks MISSED, created or moved from UNDONE, sorted: the guard's oneOffs. */
export function chargedOneOffsOf(g: Pick<ChunkGroup, "creates" | "updates">, state: Pick<SettlementState, "templates" | "instances">): string[] {
  const oneOff = new Set(state.templates.filter((t) => parseRule(t.recurrence) == null).map((t) => t.id));
  const templateOf = new Map(state.instances.map((i) => [i.id, i.templateId]));
  const ids = new Set<string>();
  for (const c of g.creates) if (c.status === "MISSED" && oneOff.has(c.templateId)) ids.add(c.templateId);
  for (const u of g.updates) {
    const tpl = templateOf.get(u.id);
    if (u.data.status === "MISSED" && tpl && oneOff.has(tpl)) ids.add(tpl);
  }
  return [...ids].sort();
}

/**
 * The guard for one chunk of a run: `cursor` and `freezeRows` are what the
 * chunk before it left (the read's for the first); the fresh-day counts come
 * from the read (an earlier chunk of the same run never writes a row dated
 * in a later chunk: its rows are dated on its own days, a REPAIR on the day
 * before one of them).
 */
export function chunkGuardOf(
  read: Pick<SettlementRead, "state" | "dayRows">,
  chunk: readonly DayPlan[],
  g: ChunkGroup,
  ctx: { cursor: DayKey; freezeRows: number; today: DayKey }
): SettleGuard {
  const first = chunk[0].day;
  const last = chunk[chunk.length - 1].day;
  const openFrom = addDays(ctx.today, -SETTLE_LAG_DAYS);
  const openTo = addDays(ctx.today, -1);
  const from = first > openFrom ? first : openFrom;
  const to = last < openTo ? last : openTo;
  let fresh: SettleGuard["fresh"] = null;
  if (from <= to) {
    let events = 0;
    for (const [day, n] of read.dayRows) if (day >= from && day <= to) events += n;
    fresh = {
      from,
      to,
      events,
      instances: read.state.instances.filter((i) => i.day >= from && i.day <= to).length,
      rest: read.state.restRows.filter((r) => r.day >= from && r.day <= to && r.cancelledAt == null).length,
    };
  }
  return {
    cursor: ctx.cursor,
    epochDay: read.state.epochDay,
    freezeRows: ctx.freezeRows,
    fresh,
    undone: g.updates.map((u) => u.id),
    oneOffs: chargedOneOffsOf(g, read.state),
  };
}

/** The completion paths' own lock (tasks.ts lifeLockOp: 'life-complete:<user>'), so settlement and a tick never interleave. Settlement never mints, so it never takes life-mint. */
function lifeCompleteLockSql(userId: string): Prisma.Sql {
  return Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`life-complete:${userId}`}::text))`;
}

function pendingFilter(raw: Prisma.JsonValue | null | undefined) {
  return raw == null ? { equals: Prisma.DbNull } : { equals: raw as Prisma.InputJsonValue };
}

function templateData(h: TemplateHousekeepingOp["data"]): Prisma.TaskTemplateUpdateManyMutationInput {
  const next = h.pendingChange?.next;
  const data: Prisma.TaskTemplateUpdateManyMutationInput = {
    pendingChange: h.pendingChange ? (h.pendingChange as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    pendingChangeAt: next ? dayStartOf(next.effectiveDay) : null,
  };
  if (h.compulsory !== undefined) data.compulsory = h.compulsory;
  if (h.compulsoryOnRest !== undefined) data.compulsoryOnRest = h.compulsoryOnRest;
  if (h.archivedDay !== undefined) data.archivedAt = h.archivedDay ? dayStartOf(h.archivedDay) : null;
  return data;
}

/**
 * One chunk's $transaction array (no interactive transaction): the lock, the
 * guard, then the grouped writes, the cursor last. createMany without
 * skipDuplicates, so a conflict rolls the chunk back. A template update lands
 * only while its pendingChange is the one read (a cancel in between wins).
 */
function chunkOps(client: SettlementClient, userId: string, g: ChunkGroup, guard: SettleGuard, rawPending: ReadonlyMap<string, Prisma.JsonValue | null>): Prisma.PrismaPromise<unknown>[] {
  const ops: Prisma.PrismaPromise<unknown>[] = [client.$executeRaw(lifeCompleteLockSql(userId)), client.$executeRaw(settleGuardSql(userId, guard))];
  if (g.creates.length > 0) {
    ops.push(
      client.taskInstance.createMany({
        data: g.creates.map((c) => ({
          id: c.id ?? settledInstanceId(c.templateId, c.day, c.slot),
          userId,
          templateId: c.templateId,
          day: dateColumn(c.day),
          slot: c.slot,
          status: c.status,
          source: c.source,
          debtXp: c.debtXp,
          debtOpen: c.debtOpen,
          judgedAt: c.judgedAt,
          completedAt: c.completedAt ?? null,
          xpPaid: c.xpPaid ?? 0,
        })),
      })
    );
  }
  for (const b of updateBatchesOf(g.updates)) {
    ops.push(
      client.taskInstance.updateMany({
        where: { id: { in: b.ids }, userId, status: "UNDONE" },
        data: {
          status: b.data.status,
          debtXp: b.data.debtXp,
          debtOpen: b.data.debtOpen,
          judgedAt: b.data.judgedAt,
          ...(b.data.source ? { source: b.data.source } : {}),
          ...(b.data.completedAt !== undefined ? { completedAt: b.data.completedAt } : {}),
          ...(b.data.xpPaid !== undefined ? { xpPaid: b.data.xpPaid } : {}),
        },
      })
    );
  }
  if (g.events.length > 0) {
    ops.push(client.activityEvent.createMany({ data: g.events.map((e) => activityData(userId, e) as Prisma.ActivityEventCreateManyInput) }));
  }
  for (const t of g.templates) {
    ops.push(
      client.taskTemplate.updateMany({
        where: { id: t.templateId, userId, pendingChange: pendingFilter(rawPending.get(t.templateId)) },
        data: templateData(t.data),
      })
    );
  }
  ops.push(client.lifeSettings.update({ where: { userId }, data: { settledThroughDay: dateColumn(g.cursor) } }));
  return ops;
}

/**
 * Commits the plans chunk by chunk, oldest first; each committed chunk is
 * reported. Right after each commit (and only then) the 'life', 'activity'
 * and 'progress' caches are dropped, so the judge's DUTY gate, which reads
 * the cursor from the cached life ledger, and the next render see the new
 * cursor and rows. Throws the guard's or a unique violation's error.
 */
async function commitPlans(
  client: SettlementClient,
  userId: string,
  read: SettlementRead,
  plans: readonly DayPlan[],
  ctx: { today: DayKey },
  committed: (chunk: DayPlan[]) => void
): Promise<void> {
  let cursor = read.state.cursor as DayKey;
  let freezeRows = read.state.freezeEarned + read.state.freezeUsed;
  const rawPending = new Map(read.rawPending);
  for (let i = 0; i < plans.length; i += SETTLE_CHUNK_DAYS) {
    const chunk = plans.slice(i, i + SETTLE_CHUNK_DAYS);
    const g = groupChunk(chunk);
    const guard = chunkGuardOf(read, chunk, g, { cursor, freezeRows, today: ctx.today });
    await client.$transaction(chunkOps(client, userId, g, guard, rawPending));
    invalidate("life", "activity", "progress");
    cursor = g.cursor;
    freezeRows += g.freezeRows;
    for (const t of g.templates) rawPending.set(t.templateId, (t.data.pendingChange as unknown as Prisma.JsonValue) ?? null);
    committed(chunk);
  }
}

/**
 * The settled-day rule (duty-economy settledFor) applied to a run's plans:
 * a plan never re-judges a day already settled for this epoch. planSettlement
 * starts at max(cursor + 1, firstDutyDay), so this never fires; it is the
 * invariant the guard's cursor-and-epoch clause keeps true at commit time.
 */
function assertUnsettled(state: SettlementState, plans: readonly DayPlan[]): void {
  const floor = firstDutyDay(state.epochDay, state.dutyLaunchDay);
  const settled = plans.find((p) => settledFor(p.day, state.cursor, floor));
  if (settled) throw new Error(`[settlement] refusing to settle ${settled.day} again: settled through ${state.cursor}`);
}

/**
 * Settles the life days that are due (F5): the oldest first, at most 14 per
 * run (an early settle repeats until yesterday is settled). Writes only when
 * Duty is launched, the cursor is set and writes are enabled here (or
 * forced); a dry run, or a server where writes are off, returns the plans
 * and writes nothing. Never in render: callers are after(), the cron, the
 * 'Settle yesterday' action and the scripts.
 */
export async function settleLifeDays(userId: string, now: Date, opts: SettleOptions = {}): Promise<SettleResult> {
  const env: SettleEnv = opts.env ?? processEnv();
  const today = todayKey(now);
  const launchDay = dutyLaunchDay(env);
  const launched = isDutyLaunched(today, launchDay);
  const result: SettleResult = { launched, wrote: false, cursorBefore: null, cursorAfter: null, plans: [], refused: null };
  if (!launched) return { ...result, refused: notStarted(launchDay) };

  const client = opts.client ?? prisma;
  const write = !opts.dryRun && (settlementWritesEnabled(env) || opts.force === true);
  const through = opts.early ? addDays(today, -1) : opts.through;
  let first = true;
  let tries = 0;
  let passes = 0;
  for (;;) {
    const read = await readSettlementState(client, userId, now, { launchDay, through });
    if (!read) return { ...result, refused: NO_SETTINGS_REFUSAL };
    if (first) {
      result.cursorBefore = read.state.cursor;
      first = false;
    }
    result.cursorAfter = read.state.cursor;
    if (read.state.cursor == null) {
      // duty-launch --apply runs from firstDutyDay + 1; once firstDutyDay is judgeable and the cursor is still
      // null, nothing else will set it (a reset after launch creates its row with one), so say so in the log.
      const first = firstDutyDay(read.state.epochDay, launchDay);
      if (first && today >= addDays(first, SETTLE_LAG_DAYS)) {
        console.warn(`[settlement] Duty is live from ${first} but settledThroughDay is null: run scripts/duty-launch.ts --apply (settlement then catches up from ${first}).`);
      }
      return { ...result, refused: NO_CURSOR_REFUSAL };
    }

    const plans = planSettlement(read.state);
    if (!write) {
      result.plans.push(...plans);
      if (!opts.dryRun) result.refused = WRITES_OFF_REFUSAL;
      break;
    }
    if (plans.length === 0) break;
    assertUnsettled(read.state, plans);
    try {
      await commitPlans(client, userId, read, plans, { today }, (chunk) => {
        result.plans.push(...chunk);
        result.wrote = true;
        result.cursorAfter = chunk[chunk.length - 1].day;
      });
    } catch (err) {
      if (!isStaleGuard(err) && !isDuplicateActivity(err)) throw err;
      // Another run (a second render, the cron, a manual freeze or a tick) got there first: re-read and re-plan.
      tries += 1;
      if (tries >= SETTLE_ATTEMPTS) {
        result.refused = BUSY_REFUSAL;
        break;
      }
      continue;
    }
    passes += 1;
    if (!opts.early || through == null || (result.cursorAfter != null && result.cursorAfter >= through) || passes >= EARLY_MAX_PASSES) break;
  }

  if (write && result.cursorAfter != null && dutyLagging(result.cursorAfter, today)) {
    console.warn(`[settlement] Duty is settled through ${result.cursorAfter}, more than the notice allows behind ${lastSettleableDay(today)}.`);
  }
  return result;
}

// ── The maintenance chain (after() on /today, /you, /today/week) ──────────

export interface MaintainOptions {
  /** The variables the gates read; defaults to process.env. */
  env?: SettleEnv;
  /** The client settlement reads and writes with (the checks' stub); its cursor read is then not cached. */
  client?: SettlementClient;
  /** The judge step; defaults to life-weeks-server maybeJudgeWeeks. */
  judge?: (userId: string, now: Date) => Promise<void>;
  /** Roadmap lane G: the roadmap step's writers; each defaults to the real one (R6's freeze and finaliser, R1's readings). */
  roadmap?: RoadmapStepDeps;
}

// ── The roadmap step (roadmap.md F16 seam 8: settle → judge → roadmap) ────

/** The roadmap step's writers, injectable for the checks; each defaults to the real one. */
export interface RoadmapStepDeps {
  /** roadmap-quests-server freezeWeekQuests: this life week's set, inserted only when none exists. */
  freeze?: (userId: string, now: Date, source: WeekQuestSource, opts: RoadmapWriteOpts) => Promise<QuestFreezeRun>;
  /** roadmap-readings recordRoadmapReadings: readings, Proficiency and the reach rules (throttled for CHAIN). */
  readings?: (userId: string, now: Date, opts: RoadmapWriteOpts & { caller?: ReadingsCaller }) => Promise<ReadingsRun>;
  /** roadmap-quests-server finalizeQuestWeeks: the results of weeks that have settled, written once. */
  finalize?: (userId: string, now: Date, opts: RoadmapWriteOpts) => Promise<QuestFinalizeRun>;
}

/** Where the roadmap step runs: the maintenance chain (a render's after()) or the life cron. */
export interface RoadmapStepContext {
  env: SettleEnv;
  /** RENDER from the chain (its fallback freeze), CRON from the life cron (the freeze just after Monday 04:00). */
  source: Extract<WeekQuestSource, "CRON" | "RENDER">;
  caller: Extract<ReadingsCaller, "CHAIN" | "LIFE_CRON">;
  deps?: RoadmapStepDeps;
}

/** A failure's message for a cron's report (never the stack). */
const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * The roadmap step (F16 seam 8; decision 13): first this life week's quest
 * set is frozen when none exists (F14: the cron's CRON freeze just after
 * Monday 04:00, else the chain's RENDER fallback), then readings,
 * Proficiency and the reach rules are recorded (F10), then the week quest
 * results of every settled week are written once (F14). Each part sits in
 * its own try: a failed part is null in the report with its message in
 * errors, and the parts after it still run. Never throws.
 *
 * The writers never throw either (roadmap-types: a caught failure comes back
 * as the result's `error`), so a try alone would report nothing. A part that
 * returned an `error` keeps its result, and its message joins errors too
 * (roadmapStepErrorsOf: "freeze: …", "readings: …", "finalize: …", in the
 * parts' order), so the cron's JSON reports every roadmap failure (F16 seam
 * 8). A missing table is `skipped: "MISSING_TABLE"`, never an error.
 *
 * Gated only by settlementWritesEnabled(env) (lifeWritesEnabled with the
 * VERCEL_ENV rule): with writes off it reads and writes nothing and reports
 * WRITES_OFF. It does not wait for Duty's launch or the settlement cursor:
 * maybeSettle returns early while Duty is inert, and the roadmap still runs.
 * Every writer is handed the same env, so its own gate agrees.
 */
export async function runRoadmapStep(userId: string, now: Date, ctx: RoadmapStepContext): Promise<RoadmapStepReport> {
  if (!settlementWritesEnabled(ctx.env)) {
    return {
      freeze: { froze: 0, skipped: "WRITES_OFF" },
      readings: { written: 0, reaches: 0, skipped: "WRITES_OFF" },
      finalize: { finalized: 0, skipped: "WRITES_OFF" },
      errors: [],
    };
  }
  const opts: RoadmapWriteOpts = { env: ctx.env };
  const deps = ctx.deps ?? {};
  const report: RoadmapStepReport = { freeze: null, readings: null, finalize: null, errors: [] };
  try {
    report.freeze = await (deps.freeze ?? freezeWeekQuests)(userId, now, ctx.source, opts);
    report.errors.push(...roadmapStepErrorsOf({ freeze: report.freeze }));
  } catch (err) {
    console.error("[roadmap] week quest freeze failed", err);
    report.errors.push(`freeze: ${errorText(err)}`);
  }
  try {
    report.readings = await (deps.readings ?? recordRoadmapReadings)(userId, now, { ...opts, caller: ctx.caller });
    report.errors.push(...roadmapStepErrorsOf({ readings: report.readings }));
  } catch (err) {
    console.error("[roadmap] readings failed", err);
    report.errors.push(`readings: ${errorText(err)}`);
  }
  try {
    report.finalize = await (deps.finalize ?? finalizeQuestWeeks)(userId, now, opts);
    report.errors.push(...roadmapStepErrorsOf({ finalize: report.finalize }));
  } catch (err) {
    console.error("[roadmap] week quest finalisation failed", err);
    report.errors.push(`finalize: ${errorText(err)}`);
  }
  return report;
}

/** The degrade cron's roadmap report: its one roadmap writer, the readings. */
export interface DegradeRoadmapReport {
  readings: ReadingsRun | null;
  errors: string[];
}

/**
 * The degrade cron's roadmap step (F16 seam 8): once it has degraded cards
 * and judged quotas, record roadmap readings (caller DEGRADE_CRON, never
 * throttled), so a degradation reaches g, RAISE and Proficiency the same
 * day. Gated by settlementWritesEnabled like the chain's step; never throws,
 * so a roadmap failure never fails the degrade cron. A failure the writer
 * caught and returned as `error` is reported in errors as "readings: …"
 * (roadmapStepErrorsOf), like one it threw.
 */
export async function recordRoadmapAfterDegrade(
  userId: string,
  now: Date,
  ctx: { env?: SettleEnv; readings?: RoadmapStepDeps["readings"] } = {}
): Promise<DegradeRoadmapReport> {
  const env = ctx.env ?? processEnv();
  if (!settlementWritesEnabled(env)) return { readings: { written: 0, reaches: 0, skipped: "WRITES_OFF" }, errors: [] };
  try {
    const readings = await (ctx.readings ?? recordRoadmapReadings)(userId, now, { env, caller: "DEGRADE_CRON" });
    return { readings, errors: roadmapStepErrorsOf({ readings }) };
  } catch (err) {
    console.error("[roadmap] readings after the degrade failed", err);
    return { readings: null, errors: [`readings: ${errorText(err)}`] };
  }
}

/** In-flight maintenance runs, one per user: two renders at once share one chain. */
const maintaining = new Map<string, Promise<void>>();

async function readCursor(client: SettlementClient, userId: string): Promise<{ cursor: DayKey | null; epochDay: DayKey } | null> {
  const s = await client.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true, settledThroughDay: true } });
  return s ? { cursor: s.settledThroughDay ? dayOf(s.settledThroughDay) : null, epochDay: dayOf(s.epochDay) } : null;
}

/** Settles when writes are on, Duty is live and the cached cursor is behind; otherwise reads nothing. */
async function maybeSettle(userId: string, now: Date, opts: MaintainOptions): Promise<void> {
  const env = opts.env ?? processEnv();
  if (!settlementWritesEnabled(env)) return;
  const today = todayKey(now);
  const launchDay = dutyLaunchDay(env);
  if (!isDutyLaunched(today, launchDay)) return;
  const client = opts.client ?? prisma;
  const s = opts.client ? await readCursor(client, userId) : await cached(`dutyCursor:${userId}`, ["life"], () => readCursor(client, userId));
  if (!s || s.cursor == null) return;
  if (!settleRange({ today, dutyLaunchDay: launchDay, epochDay: s.epochDay, cursor: s.cursor })) return;
  await settleLifeDays(userId, now, { env, client });
}

/**
 * The after() entry for /today, /you and /today/week (decision 4): settle
 * first, then judge, then the roadmap step (roadmap F16 seam 8), in one
 * single-flight chain per user. Never throws: a failure is logged and the
 * next render tries again. Settlement's own failure never stops the judge
 * (BODY, CRAFT and CARE are judged whatever settlement is doing; decision
 * 5), and neither stops the roadmap step, which runs whatever Duty's launch
 * state, gated only by settlementWritesEnabled (runRoadmapStep).
 */
export function maybeMaintainLife(userId: string, now: Date = new Date(), opts: MaintainOptions = {}): Promise<void> {
  try {
    const running = maintaining.get(userId);
    if (running) return running;
    const run = (async () => {
      try {
        await maybeSettle(userId, now, opts);
      } catch (err) {
        console.error("[settlement] settle failed", err);
      }
      try {
        await (opts.judge ?? maybeJudgeWeeks)(userId, now);
      } catch (err) {
        console.error("[settlement] judge failed", err);
      }
      try {
        await runRoadmapStep(userId, now, { env: opts.env ?? processEnv(), source: "RENDER", caller: "CHAIN", deps: opts.roadmap });
      } catch (err) {
        console.error("[settlement] roadmap step failed", err);
      }
    })().finally(() => {
      maintaining.delete(userId);
    });
    maintaining.set(userId, run);
    return run;
  } catch (err) {
    console.error("maybeMaintainLife failed:", err);
    return Promise.resolve();
  }
}

// ── The life cron (/api/cron/life, '15 18 * * *' UTC) ─────────────────────

/**
 * Whether the request carries the cron secret. Refuses when the secret is
 * unset or empty: unlike the degrade cron, this one writes, so it never
 * skips the check. Compares in constant time.
 */
export function cronAuthorized(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const got = header ?? "";
  let diff = got.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (got.charCodeAt(i) || 0);
  return diff === 0;
}

export interface LifeCronDeps {
  env?: SettleEnv;
  now?: () => Date;
  userId?: () => string;
  settle?: (userId: string, now: Date, opts: SettleOptions) => Promise<SettleResult>;
  judge?: (userId: string, now: Date) => Promise<Pick<JudgeResult, "launched" | "committed">>;
  /** Whether the M5 launch script has finished for this life launch day; defaults to lifeLaunchFinished. */
  launchFinished?: (userId: string, lifeLaunchDay: DayKey) => Promise<boolean>;
  /** Roadmap lane G: the roadmap step's writers (runRoadmapStep); each defaults to the real one. */
  roadmap?: RoadmapStepDeps;
}

/**
 * Whether scripts/life-launch.ts --apply has finished for this user: its
 * DECAY_GRACE row 'life launch <day>' exists. The same marker read as
 * life-weeks-server's private launchHasFinished, which gates maybeJudgeWeeks;
 * the cron calls judgeClosedWeeks directly, so it checks the marker itself.
 * After an 'everything' reset deletes the marker, the cron leaves the
 * backfill and the one launch moment to life-launch, as page loads do.
 */
export async function lifeLaunchFinished(
  userId: string,
  launchDay: DayKey,
  client: Pick<PrismaClient, "masteryLedgerEntry"> = prisma
): Promise<boolean> {
  const row = await client.masteryLedgerEntry.findFirst({
    where: { userId, reason: DECAY_GRACE_REASON, detail: launchGraceDetail(launchDay) },
    select: { id: true },
  });
  return row != null;
}

/**
 * The daily life cron: 401 unless CRON_SECRET is set and matches; then, for
 * the single user, settleLifeDays and then judgeClosedWeeks (settle first,
 * so the DUTY gate sees the new cursor). The judge runs only once the M5
 * launch has finished (lifeLaunchFinished), like maybeJudgeWeeks; settlement
 * does not wait for it. A settlement failure does not stop the judge. Day
 * keys are computed at run time, so a Hobby-plan cron firing anywhere in its
 * hour is still right.
 *
 * Then the roadmap step (roadmap F16 seam 8, runRoadmapStep with source
 * CRON): the week's quest set is frozen just after the Monday turn, before
 * readings are recorded, then settled weeks are finalised. Its report is the
 * JSON's roadmap; a roadmap failure is logged and reported there, and the
 * status stays what settle and the judge set (200 when they passed).
 */
export async function runLifeCron(request: Request, deps: LifeCronDeps = {}): Promise<Response> {
  const env = deps.env ?? processEnv();
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = deps.now ? deps.now() : new Date();
  const userId = (deps.userId ?? getCurrentUserId)();
  let settle: Record<string, unknown>;
  let failed = false;
  try {
    const r = await (deps.settle ?? settleLifeDays)(userId, now, { env });
    settle = { launched: r.launched, wrote: r.wrote, cursorBefore: r.cursorBefore, cursorAfter: r.cursorAfter, days: r.plans.length, refused: r.refused };
  } catch (err) {
    failed = true;
    console.error("[cron/life] settle failed", err);
    settle = { error: err instanceof Error ? err.message : String(err) };
  }
  let judge: Record<string, unknown>;
  try {
    const lifeDay = lifeLaunchDay(env);
    if (lifeDay == null) judge = { skipped: "life has no launch day" };
    else if (!(await (deps.launchFinished ?? lifeLaunchFinished)(userId, lifeDay))) judge = { skipped: "life launch not finished" };
    else {
      const j = await (deps.judge ?? judgeClosedWeeks)(userId, now);
      judge = { launched: j.launched, committed: j.committed };
    }
  } catch (err) {
    failed = true;
    console.error("[cron/life] judge failed", err);
    judge = { error: err instanceof Error ? err.message : String(err) };
  }
  let roadmap: RoadmapStepReport | { error: string };
  try {
    roadmap = await runRoadmapStep(userId, now, { env, source: "CRON", caller: "LIFE_CRON", deps: deps.roadmap });
  } catch (err) {
    // runRoadmapStep never throws; this only keeps the status settle's and the judge's.
    console.error("[cron/life] roadmap step failed", err);
    roadmap = { error: errorText(err) };
  }
  return Response.json({ settle, judge, roadmap }, { status: failed ? 500 : 200 });
}

// ── The launch and rehearsal scripts' database guard (pure) ──────────────

/** The xtnl-idea Supabase project: the one database dev and production share. Never XTNL_thesis. */
export const XTNL_IDEA_PROJECT_REF = "xvlkujmtdcpaoxdftgpl";
/** The local rehearsal mirror (xtnl-rehearsal): a localhost database on this port, and only that. */
export const REHEARSAL_DB_PORT = 55432;

/** Where a script's writes would land: xtnl-idea, the rehearsal mirror, or somewhere a write is refused. */
export interface DatasourceTarget {
  kind: "production" | "rehearsal" | "refused";
  /** 'xtnl-idea (ref …)' or 'rehearsal (localhost:55432)', then each URL's host:port (never a password). */
  label: string;
  /** The Supabase project ref the URLs name, when they name one. */
  ref: string | null;
  /** Why a write is refused; empty for production and rehearsal. */
  problems: string[];
}

type UrlKind = "production" | "rehearsal" | "local" | "supabase" | "unknown";

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** One connection URL, read for its host, port and user only. */
function urlTargetOf(name: string, raw: string): { kind: UrlKind; ref: string | null; where: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const port = u.port || "5432";
  const where = `${name} ${host}:${port}`;
  if (LOCAL_HOSTS.has(host)) return { kind: port === String(REHEARSAL_DB_PORT) ? "rehearsal" : "local", ref: null, where };
  if (!host.endsWith(".supabase.co") && !host.endsWith(".supabase.com")) return { kind: "unknown", ref: null, where };
  let user = u.username;
  try {
    user = decodeURIComponent(user);
  } catch {
    // keep it raw
  }
  // Direct: db.<ref>.supabase.co (user postgres). Pooler: <region>.pooler.supabase.com with user postgres.<ref>.
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host)?.[1] ?? null;
  const pooled = /^postgres\.([a-z0-9]+)$/.exec(user)?.[1] ?? null;
  if (direct && pooled && direct !== pooled) return { kind: "supabase", ref: null, where: `${where} (host ref ${direct}, user ref ${pooled})` };
  const ref = direct ?? pooled;
  return { kind: ref === XTNL_IDEA_PROJECT_REF ? "production" : "supabase", ref, where: ref ? `${where} (ref ${ref})` : where };
}

/**
 * The project-ref guard of scripts that write (duty-launch --apply, the
 * lead's duty-rehearse): production when DATABASE_URL, and DIRECT_URL when
 * set, both name the xtnl-idea project (db.<ref>.supabase.co, or a pooler
 * user postgres.<ref>); rehearsal when both are localhost:55432; otherwise
 * refused, with the reasons. Reads hosts and users only, never a password.
 */
export function launchTargetOf(env: { DATABASE_URL?: string; DIRECT_URL?: string }): DatasourceTarget {
  if (!env.DATABASE_URL) return { kind: "refused", label: "DATABASE_URL unset", ref: null, problems: ["DATABASE_URL is not set."] };
  const named: [string, string][] = [["DATABASE_URL", env.DATABASE_URL], ...(env.DIRECT_URL ? [["DIRECT_URL", env.DIRECT_URL] as [string, string]] : [])];
  const problems: string[] = [];
  const urls: { kind: UrlKind; ref: string | null; where: string }[] = [];
  for (const [name, raw] of named) {
    const t = urlTargetOf(name, raw);
    if (t) urls.push(t);
    else problems.push(`${name} is not a readable URL.`);
  }
  const label = urls.map((u) => u.where).join(" · ") || "unreadable";
  const ref = urls.find((u) => u.ref)?.ref ?? null;
  if (problems.length === 0 && urls.every((u) => u.kind === "rehearsal")) return { kind: "rehearsal", label: `rehearsal (localhost:${REHEARSAL_DB_PORT}) · ${label}`, ref: null, problems };
  if (problems.length === 0 && urls.every((u) => u.kind === "production")) return { kind: "production", label: `xtnl-idea (ref ${XTNL_IDEA_PROJECT_REF}) · ${label}`, ref: XTNL_IDEA_PROJECT_REF, problems };
  const kinds = new Set(urls.map((u) => u.kind));
  if (kinds.size > 1) problems.push("DATABASE_URL and DIRECT_URL point at different databases.");
  for (const u of urls) {
    if (u.kind === "local") problems.push(`${u.where}: a local database that is not the rehearsal mirror (localhost:${REHEARSAL_DB_PORT}).`);
    else if (u.kind === "supabase") problems.push(`${u.where}: not the xtnl-idea project (${XTNL_IDEA_PROJECT_REF}).`);
    else if (u.kind === "unknown") problems.push(`${u.where}: neither the xtnl-idea project (${XTNL_IDEA_PROJECT_REF}) nor the rehearsal mirror (localhost:${REHEARSAL_DB_PORT}).`);
  }
  return { kind: "refused", label, ref, problems };
}

/**
 * The launch days a script uses for a target. The non-production overrides
 * XTNL_DUTY_LAUNCH_DAY and XTNL_LIFE_LAUNCH_DAY are for the rehearsal mirror
 * only: against any other database the code constants decide (as on the
 * production server), and an override that would have changed the day is
 * reported in `ignored`.
 */
export function launchDaysFor(
  target: Pick<DatasourceTarget, "kind">,
  env: LifeEnv & DutyEnv = processEnv()
): { duty: DayKey | null; life: DayKey | null; ignored: string[] } {
  const own = { duty: dutyLaunchDay(env), life: lifeLaunchDay(env) };
  if (target.kind === "rehearsal") return { ...own, ignored: [] };
  const constants: LifeEnv & DutyEnv = { NODE_ENV: "production" };
  const duty = dutyLaunchDay(constants);
  const life = lifeLaunchDay(constants);
  const ignored: string[] = [];
  if (own.duty !== duty) ignored.push(`XTNL_DUTY_LAUNCH_DAY=${own.duty} is ignored (rehearsal mirror only); DUTY_LAUNCH_DAY is ${duty ?? "null"}.`);
  if (own.life !== life) ignored.push(`XTNL_LIFE_LAUNCH_DAY=${own.life} is ignored (rehearsal mirror only); LIFE_LAUNCH_DAY is ${life ?? "null"}.`);
  return { duty, life, ignored };
}

/**
 * duty-launch --apply's timing rule: not before firstDutyDay + 1. The cursor
 * it writes (firstDutyDay − 1) then never sits ahead of a day still lived
 * without stakes, and every LifeSettings row a reset creates afterwards is
 * created after launch with its own cursor. Later is harmless: settlement
 * catches up from firstDutyDay, 14 days a run. Null when it may run.
 */
export function launchApplyTooEarly(today: DayKey, first: DayKey): string | null {
  const from = addDays(first, 1);
  return today < from ? `Run --apply on ${from} or later (settlement catches up from ${first}); today is ${today}.` : null;
}
