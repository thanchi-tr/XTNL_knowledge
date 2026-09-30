import { Prisma } from "@prisma/client";
import { compareTwoStrings } from "string-similarity";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { dueCutoff } from "./due";
import { activityOp, isDuplicateActivity, recordActivity } from "./activity";
import {
  addDays,
  dateColumn,
  dayStartOf,
  keyOfDateColumn,
  monthKeyOf,
  todayKey,
  weekStartKeyOf,
  type DayKey,
} from "./life-day";
import {
  type AutoMetric,
  type Band,
  type CaptureSource,
  type Category,
  type DueKind,
  type GradeSource,
  type Horizon,
  type InstanceSource,
  type InstanceStatus,
  type KrMetric,
  type ParsedCapture,
  type Receipt,
  type Sink,
  type TaskKind,
  type Track,
} from "./life-types";
import type { Attribute } from "@prisma/client";
import { SIZING_PENDING_MS, isGradeFrozen, normTitleOf, sizeLexically } from "./life-lexicon";
import {
  BAND_OVERRIDE_COOLDOWN_DAYS,
  EST_MINUTES_MAX,
  SIZING_MAX_ATTEMPTS,
  clampBandOverride,
  effBand,
  isTrack,
  selfRatingOpen,
  toBand,
} from "./life-grade";
import { allowsCompulsory, occursOn, parseRule } from "./recurrence";
import {
  HISTORY_DAYS,
  STUDY_METRICS,
  UNDO_WINDOW_MS,
  buildBoard,
  canUndo,
  describeTemplate,
  goalMetricOf,
  groupKeyOf,
  horizonFor,
  isDoneStatus,
  planAutoCompletions,
  planCompletion,
  ruleOf,
  statsFor,
  streakDaysFor,
  taskEventInput,
  undoEventInput,
  type BoardData,
  type BoardInstance,
  type BoardTemplate,
  type DayLedger,
  type InboxChoice,
  type LedgerCompletion,
  type PaidRecord,
  type TemplateStats,
} from "./today-board";

export type { InboxChoice } from "./today-board";

/**
 * The task engine's server side: capture, completion, undo, skip, and the
 * Today board's one read wave.
 *
 * ── Shape of every write ─────────────────────────────────
 * One read wave (independent reads issued together), then one
 * `$transaction([...])` array: the instance, its ledger row and the template
 * touch-ups commit or fail together. There is no interactive transaction —
 * each round trip costs 160-800 ms here, and an array needs none of them to
 * be sequential. Idempotency comes from unique keys rather than from reading
 * first: a TASK row's dedupe key is `task:<tpl>:<day>:<slot>:<attempt>`, the
 * instance is unique on (template, day, slot), and a P2002 on either means
 * the tick is already recorded, so the stored receipt is returned. A double
 * tap therefore writes one row.
 *
 * ── Prices ───────────────────────────────────────────────
 * Every completion is priced by `planCompletion` in today-board.ts against
 * the day's ledger as read in the same wave, which is the same function and
 * the same inputs the board used to print the row's '≈ N XP'. Past rows are
 * never repriced; an undo is a new, negating row.
 *
 * ── Instances are lazy ───────────────────────────────────
 * Nothing here pre-creates an expected occurrence. A TaskInstance exists
 * only once someone acts on it (a tick, a skip) or, from M2, once
 * settlement judges it. What is due is a pure function of the rule and the
 * day (recurrence.ts), evaluated on read.
 */

export type LifeResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): LifeResult<T> => ({ ok: true, value });
const fail = <T>(error: string): LifeResult<T> => ({ ok: false, error });

// ── Rows ──────────────────────────────────────────────────────────────────

const TEMPLATE_SELECT = {
  id: true,
  title: true,
  normTitle: true,
  kind: true,
  inbox: true,
  recurrence: true,
  startDay: true,
  dueDay: true,
  dueKind: true,
  horizon: true,
  parentId: true,
  krMetric: true,
  krTarget: true,
  krUnit: true,
  compulsory: true,
  intrinsic: true,
  mvv: true,
  autoMetric: true,
  autoTarget: true,
  track: true,
  category: true,
  band: true,
  lexicalBand: true,
  aiBand: true,
  bandOverride: true,
  bandOverrideAt: true,
  estMinutes: true,
  machineMinutes: true,
  composition: true,
  gradeSource: true,
  gradeConfidence: true,
  gradeBasis: true,
  gradeModel: true,
  gradePromptVersion: true,
  gradeAttempts: true,
  gradeFrozenAt: true,
  note: true,
  completedAt: true,
  archivedAt: true,
  createdAt: true,
  sortOrder: true,
} satisfies Prisma.TaskTemplateSelect;

type TemplateRow = Prisma.TaskTemplateGetPayload<{ select: typeof TEMPLATE_SELECT }>;

const INSTANCE_SELECT = {
  id: true,
  templateId: true,
  day: true,
  slot: true,
  status: true,
  source: true,
  xpPaid: true,
} satisfies Prisma.TaskInstanceSelect;

type InstanceRow = Prisma.TaskInstanceGetPayload<{ select: typeof INSTANCE_SELECT }>;

const asBand = (s: string | null | undefined): Band => toBand(s);
const asTrack = (s: string | null | undefined): Track => (isTrack(s) ? s : "DUTY");
const keyOrNull = (d: Date | null): DayKey | null => (d ? keyOfDateColumn(d) : null);

/** The strongest attribute in a stored composition, for the row's colour dot. */
function topAttributeOf(composition: Prisma.JsonValue): Attribute | null {
  if (!composition || typeof composition !== "object" || Array.isArray(composition)) return null;
  let best: Attribute | null = null;
  let weight = 0;
  for (const [attribute, w] of Object.entries(composition)) {
    if (typeof w === "number" && w > weight) {
      best = attribute as Attribute;
      weight = w;
    }
  }
  return best;
}

function toBoardTemplate(r: TemplateRow, now: Date): BoardTemplate {
  const age = now.getTime() - r.createdAt.getTime();
  const gradeFrozen = isGradeFrozen(r, now);
  return {
    id: r.id,
    title: r.title,
    normTitle: r.normTitle,
    kind: r.kind as TaskKind,
    inbox: r.inbox,
    recurrence: r.recurrence,
    startDay: keyOfDateColumn(r.startDay),
    dueDay: keyOrNull(r.dueDay),
    dueKind: (r.dueKind as DueKind | null) ?? null,
    horizon: (r.horizon as Horizon | null) ?? null,
    parentId: r.parentId,
    krMetric: (r.krMetric as KrMetric | null) ?? null,
    krTarget: r.krTarget,
    krUnit: r.krUnit,
    compulsory: r.compulsory,
    intrinsic: r.intrinsic,
    mvv: r.mvv,
    autoMetric: (r.autoMetric as AutoMetric | null) ?? null,
    autoTarget: r.autoTarget,
    track: asTrack(r.track),
    category: r.category as Category,
    band: asBand(r.band),
    lexicalBand: asBand(r.lexicalBand),
    aiBand: r.aiBand ? asBand(r.aiBand) : null,
    bandOverride: r.bandOverride,
    bandOverrideAt: r.bandOverrideAt?.toISOString() ?? null,
    gradeFrozenAt: r.gradeFrozenAt?.toISOString() ?? null,
    estMinutes: r.estMinutes,
    machineMinutes: r.machineMinutes,
    gradeSource: r.gradeSource as GradeSource,
    gradeConfidence: r.gradeConfidence,
    gradeBasis: r.gradeBasis,
    gradeModel: r.gradeModel,
    gradePromptVersion: r.gradePromptVersion,
    gradeAttempts: r.gradeAttempts,
    gradeFrozen,
    // life-lexicon.ts's 'sizing…': a lexical grade minutes old whose one AI call has not landed yet.
    sizing: r.gradeSource === "LEXICAL" && !gradeFrozen && r.bandOverride === 0 && r.gradeAttempts === 0 && age >= 0 && age <= SIZING_PENDING_MS,
    topAttribute: topAttributeOf(r.composition),
    note: r.note,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    sortOrder: r.sortOrder,
  };
}

function toBoardInstance(i: InstanceRow): BoardInstance {
  return {
    id: i.id,
    templateId: i.templateId,
    day: keyOfDateColumn(i.day),
    slot: i.slot,
    status: i.status as InstanceStatus,
    source: i.source as InstanceSource,
    xpPaid: i.xpPaid,
  };
}

// ── The day's ledger, in two queries ──────────────────────────────────────

interface TaskEventRow {
  id: string;
  day: Date;
  source: string;
  sink: string;
  track: string | null;
  templateId: string | null;
  sourceId: string | null;
  xp: number;
  rawXp: number | null;
  occurredAt: Date;
  dedupeKey: string | null;
  receipt: Prisma.JsonValue;
  normTitle: string | null;
  title: string | null;
  band: string | null;
  bandOverride: number | null;
}

interface DayTotalRow {
  day: Date;
  source: string;
  sink: string;
  n: number;
  xp: number;
  raw: number;
  qty: number | null;
}

const daysSql = (days: DayKey[]) => Prisma.join(days.map((d) => Prisma.sql`${d}::date`));

/**
 * The day's TASK and UNDO rows, each joined to its template's normTitle and
 * band: what repeat decay (D) and the INTRO count (V) read, and what an undo
 * negates.
 */
function readDayTaskEvents(userId: string, days: DayKey[]): Promise<TaskEventRow[]> {
  return prisma.$queryRaw<TaskEventRow[]>`
    SELECT e."id", e."day", e."source", e."sink", e."track", e."templateId", e."sourceId",
           e."xp", e."rawXp", e."occurredAt", e."dedupeKey", e."receipt",
           t."normTitle", t."title", t."band", t."bandOverride"
    FROM "ActivityEvent" e
    LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
    WHERE e."userId" = ${userId} AND e."day" IN (${daysSql(days)}) AND e."source" IN ('TASK', 'UNDO')
    ORDER BY e."occurredAt" ASC, e."id" ASC
  `;
}

/** Per day, source and sink: count, Σ xp, Σ rawXp and the DAY_OPEN qty. The knee base, the tiles and the quest read these. */
function readDayTotals(userId: string, days: DayKey[]): Promise<DayTotalRow[]> {
  return prisma.$queryRaw<DayTotalRow[]>`
    SELECT "day", "source", "sink",
           COUNT(*)::int AS n,
           COALESCE(SUM("xp"), 0)::float8 AS xp,
           COALESCE(SUM("rawXp"), 0)::float8 AS raw,
           MAX("qty")::float8 AS qty
    FROM "ActivityEvent"
    WHERE "userId" = ${userId} AND "day" IN (${daysSql(days)})
    GROUP BY "day", "source", "sink"
    ORDER BY "day", "source", "sink"
  `;
}

/** Ids of TASK rows an UNDO has negated ('undo:<eventId>'). */
function undoneIds(events: readonly TaskEventRow[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.source === "UNDO" && e.dedupeKey?.startsWith("undo:")) out.add(e.dedupeKey.slice(5));
  }
  return out;
}

function ledgerOf(day: DayKey, totals: readonly DayTotalRow[], events: readonly TaskEventRow[]): DayLedger {
  const tot = totals.filter((r) => keyOfDateColumn(r.day) === day);
  const evs = events.filter((e) => keyOfDateColumn(e.day) === day);
  const undone = undoneIds(evs);
  const completions: LedgerCompletion[] = evs
    .filter((e) => e.source === "TASK" && !undone.has(e.id))
    .map((e) => ({
      eventId: e.id,
      templateId: e.templateId,
      groupKey: e.normTitle != null ? groupKeyOf({ normTitle: e.normTitle, title: e.title ?? "" }) : `tpl:${e.templateId ?? e.id}`,
      intro: e.band != null && effBand(asBand(e.band), e.bandOverride ?? 0) === "INTRO",
      raw: e.rawXp ?? 0,
      xp: e.xp,
      sink: e.sink as Sink,
    }));
  const sum = (pick: (r: DayTotalRow) => number, where: (r: DayTotalRow) => boolean = () => true) =>
    tot.filter(where).reduce((s, r) => s + pick(r), 0);
  const dayOpen = tot.find((r) => r.source === "DAY_OPEN");
  return {
    day,
    rawBefore: sum((r) => r.raw),
    lifeXp: sum((r) => r.xp, (r) => r.sink === "TRACK"),
    completions,
    reviews: sum((r) => r.n, (r) => r.source === "REVIEW"),
    reviewXp: sum((r) => r.xp, (r) => r.source === "REVIEW"),
    ideas: sum((r) => r.n, (r) => r.source === "IDEA_CREATE"),
    dayOpenQty: dayOpen?.qty ?? null,
  };
}

/** The TASK row that paid each instance, latest first wins. */
function paidOf(events: readonly TaskEventRow[]): Record<string, PaidRecord> {
  const undone = undoneIds(events);
  const out: Record<string, PaidRecord> = {};
  for (const e of events) {
    if (e.source !== "TASK" || !e.sourceId) continue;
    out[e.sourceId] = {
      eventId: e.id,
      instanceId: e.sourceId,
      receipt: (e.receipt as unknown as Receipt | null) ?? null,
      occurredAt: e.occurredAt.toISOString(),
      xp: e.xp,
      undone: undone.has(e.id),
    };
  }
  return out;
}

// ── History: per-duty streaks and habit strength ──────────────────────────

// ── The board read ────────────────────────────────────────────────────────

type BoardCore = Omit<BoardData, "dueNow">;

async function readBoardCore(userId: string, today: DayKey, now: Date): Promise<BoardCore> {
  const yesterday = addDays(today, -1);
  const [settings, templateRows, instanceRows, totals, events, goalQtyRows] = await Promise.all([
    prisma.lifeSettings.findUnique({ where: { userId }, select: { dailyCapacityMin: true } }),
    prisma.taskTemplate.findMany({
      where: {
        userId,
        archivedAt: null,
        // Open work, anything finished since yesterday began (so it can be
        // seen ticked and undone), and every goal's children for its rollup.
        OR: [{ completedAt: null }, { completedAt: { gte: dayStartOf(yesterday) } }, { parentId: { not: null } }],
      },
      select: TEMPLATE_SELECT,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.taskInstance.findMany({
      where: { userId, day: { gte: dateColumn(addDays(today, -HISTORY_DAYS)) } },
      select: INSTANCE_SELECT,
    }),
    readDayTotals(userId, [yesterday, today]),
    readDayTaskEvents(userId, [yesterday, today]),
    prisma.activityEvent.groupBy({
      by: ["templateId"],
      where: { userId, source: "GOAL_PROGRESS" },
      _sum: { qty: true },
    }),
  ]);

  const templates = templateRows.map((r) => toBoardTemplate(r, now));
  const instances = instanceRows.map(toBoardInstance);
  const byTpl = new Map<string, BoardInstance[]>();
  for (const i of instances) {
    const list = byTpl.get(i.templateId);
    if (list) list.push(i);
    else byTpl.set(i.templateId, [i]);
  }

  const stats: Record<string, TemplateStats> = {};
  for (const t of templates) {
    const rule = ruleOf(t);
    if (rule) stats[t.id] = statsFor(t, rule, byTpl.get(t.id) ?? [], today);
  }

  // The browser needs only the current period's instances (TARGET progress
  // reads the month or week, the lanes read today and yesterday); history
  // stays on the server, already folded into `stats`.
  const monthStart = `${monthKeyOf(today)}-01`;
  const weekStart = weekStartKeyOf(today);
  const recentFrom = [monthStart, weekStart, yesterday].sort()[0];

  const goalQty: Record<string, number> = {};
  for (const g of goalQtyRows) if (g.templateId) goalQty[g.templateId] = g._sum.qty ?? 0;

  return {
    today,
    yesterday,
    capacityMin: settings?.dailyCapacityMin ?? 240,
    templates,
    instances: instances.filter((i) => i.day >= recentFrom),
    stats,
    ledger: { today: ledgerOf(today, totals, events), yesterday: ledgerOf(yesterday, totals, events) },
    paid: paidOf(events),
    goalQty,
  };
}

function loadBoardCore(userId: string, day: DayKey, now: Date): Promise<BoardCore> {
  return cached(`boardCore:${userId}:${day}`, ["life", "activity"], () => readBoardCore(userId, day, now));
}

function countDue(now: Date): Promise<number> {
  // `dueCutoff`, as the review queue and the nav button use it, so the quest
  // and the queue it opens agree about what is due.
  return prisma.idea.count({ where: { isArchived: false, dueDate: { lte: dueCutoff(now) } } });
}

/**
 * Everything the Today board is built from, for one life day: templates,
 * recent instances, per-habit history folded into stats, the day's ledger
 * and the review queue's size. Cached per day under the life, activity and
 * ideas tags, since a review changes the quest and a tick changes the rest.
 */
export async function loadTodayBoard(userId: string, day: DayKey, now: Date = new Date()): Promise<BoardData> {
  return cached(`today:${userId}:${day}`, ["life", "activity", "ideas"], async () => {
    const [core, dueNow] = await Promise.all([loadBoardCore(userId, day, now), countDue(now)]);
    return { ...core, dueNow };
  });
}

export interface TodayCounts {
  /** Compulsory items due today still open. */
  musts: number;
  /** Everything else due today still open. */
  due: number;
  inbox: number;
}

/**
 * The nav's 'Today N' and the bell's lines: open musts, open due todos, the
 * inbox. Reads the same core as the board (no Idea count), so a tick that
 * clears the board clears the button.
 */
export async function loadTodayCounts(userId: string, now: Date = new Date()): Promise<TodayCounts> {
  const day = todayKey(now);
  return cached(`todayCount:${userId}:${day}`, ["life", "activity"], async () => {
    const core = await loadBoardCore(userId, day, now);
    return buildBoard({ ...core, dueNow: null }).counts;
  });
}

// ── Capture ───────────────────────────────────────────────────────────────

export interface CreatedTask {
  id: string;
  title: string;
  projectedXp: number;
  describe: string;
}

const TITLE_MAX = 200;
const RAW_MAX = 1000;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Users whose LifeSettings row is known to exist in this process, so capture stays one round trip after the first. */
const settingsKnown = new Set<string>();

function newId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Writes a capture as one template with its lexical grade. One INSERT (plus,
 * the first time in a process, the lazy LifeSettings upsert in the same
 * transaction); the AI sizing is the caller's `after(() => applySizing(id))`.
 *
 * `parsed` is the server's own parse of `rawText` — the authority. Its
 * numbers are clamped anyway. A done-now capture ('x run 30m') is completed
 * here too, so the result's XP is what was paid; completing it again is
 * harmless (idempotent).
 */
export async function createTemplateCore(
  userId: string,
  parsed: ParsedCapture,
  opts: { rawText: string; captureSource: CaptureSource; now?: Date }
): Promise<CreatedTask> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const title = parsed.title.trim().replace(/\s+/g, " ").slice(0, TITLE_MAX);
  if (!title) throw new Error("Nothing to add: the line has no title left once its tokens are read.");

  const typed = typeof parsed.estMinutes === "number" && Number.isFinite(parsed.estMinutes) ? parsed.estMinutes : null;
  const sizing = sizeLexically(title, { tagTrack: parsed.track, minutes: typed });
  const machineMinutes = Math.max(1, Math.round(sizing.machineMinutes));
  const estMinutes = typed != null ? Math.max(1, Math.min(EST_MINUTES_MAX, Math.round(typed))) : machineMinutes;

  const kind: TaskKind = parsed.mode === "GOAL" ? "GOAL" : parsed.mode === "IDEA" ? "IDEA_DRAFT" : parsed.kind;
  const rule = kind === "GOAL" || kind === "IDEA_DRAFT" ? null : parseRule(parsed.recurrence);
  const recurrence = rule ? parsed.recurrence : null;
  const dueDay = parsed.dueDay && KEY_RE.test(parsed.dueDay) ? parsed.dueDay : null;
  const dueKind: DueKind | null = dueDay ? (parsed.dueKind ?? "PLANNED") : null;
  // A duty needs something to be judged against: a schedule or a deadline.
  // AFTER rules move with the last completion, so they never can.
  const compulsory =
    parsed.compulsory && kind !== "GOAL" && kind !== "IDEA_DRAFT" && (rule ? allowsCompulsory(rule) : dueKind === "DEADLINE");

  let parentId: string | null = null;
  if (parsed.parentHint && kind !== "GOAL") parentId = await matchGoal(userId, parsed.parentHint);

  const goal = kind === "GOAL" ? goalMetricOf(title) : null;
  const autoMetric = parsed.autoMetric && kind !== "GOAL" ? parsed.autoMetric : null;
  const autoTarget =
    autoMetric && parsed.autoTarget != null && Number.isFinite(parsed.autoTarget)
      ? Math.max(1, Math.min(500, Math.round(parsed.autoTarget)))
      : null;

  const data: Prisma.TaskTemplateUncheckedCreateInput = {
    userId,
    title,
    normTitle: normTitleOf(title),
    rawText: opts.rawText.slice(0, RAW_MAX),
    kind,
    inbox: parsed.inbox || kind === "IDEA_DRAFT",
    recurrence,
    startDay: dateColumn(today),
    dueDay: dueDay ? dateColumn(dueDay) : null,
    dueKind,
    horizon: kind === "GOAL" ? horizonFor(parsed.horizon, dueDay, today) : null,
    parentId,
    krMetric: goal?.krMetric ?? null,
    krTarget: goal?.krTarget ?? null,
    krUnit: goal?.krUnit ?? null,
    compulsory,
    intrinsic: parsed.intrinsic,
    mvv: parsed.mvv ? parsed.mvv.slice(0, 120) : null,
    autoMetric,
    autoTarget,
    track: parsed.track ?? sizing.track,
    trackSource: parsed.track ? "TAG" : "CATEGORY",
    category: sizing.category,
    band: sizing.band,
    lexicalBand: sizing.band,
    estMinutes,
    machineMinutes,
    minutesSource: typed != null ? "USER" : "LEXICAL",
    composition: sizing.composition as Prisma.InputJsonValue,
    gradeSource: "LEXICAL",
    gradeConfidence: Math.max(0, Math.min(1, sizing.confidence)),
    gradeBasis: sizing.basis.slice(0, 200),
    captureSource: opts.captureSource,
  };

  const create = prisma.taskTemplate.create({ data, select: TEMPLATE_SELECT });
  let row: TemplateRow;
  if (settingsKnown.has(userId)) {
    row = await create;
  } else {
    const [, created] = await prisma.$transaction([
      prisma.lifeSettings.upsert({ where: { userId }, create: { userId, epochDay: dateColumn(today) }, update: {} }),
      create,
    ]);
    row = created;
    settingsKnown.add(userId);
  }
  invalidate("life", "activity");

  const t = toBoardTemplate(row, now);
  let projectedXp = planCompletion({ template: t, day: today, today, slot: 0, ledger: emptyLedger(today), streakDays: 0 }).receipt.xp;

  if (parsed.doneNow && kind !== "GOAL" && kind !== "IDEA_DRAFT") {
    const done = await completeInstanceCore(userId, row.id, { day: "today", minutes: typed, now });
    if (done.ok) projectedXp = done.value.receipt.xp;
  }

  return { id: row.id, title: row.title, projectedXp, describe: describeTemplate(t, today) };
}

/** '^name' against the open goals, by best Dice. Nothing close enough links nothing, rather than a wrong goal. */
async function matchGoal(userId: string, hint: string): Promise<string | null> {
  const h = hint.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  // A bare '^' or one letter would 'start' every title; it names nothing.
  if (h.length < 2) return null;
  const goals = await prisma.taskTemplate.findMany({
    where: { userId, kind: "GOAL", archivedAt: null, closedScore: null },
    select: { id: true, title: true },
  });
  let best: { id: string; score: number } | null = null;
  for (const g of goals) {
    const title = g.title.toLowerCase();
    const score = title.startsWith(h) ? 1 : compareTwoStrings(h, title);
    if (!best || score > best.score) best = { id: g.id, score };
  }
  return best && best.score >= 0.35 ? best.id : null;
}

function emptyLedger(day: DayKey): DayLedger {
  return { day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null };
}

// ── Completion ────────────────────────────────────────────────────────────

export interface CompleteOptions {
  /** Server-computed; 'yesterday' is accepted inside the record window, which is all of today. */
  day?: "today" | "yesterday";
  slot?: number;
  minutes?: number | null;
  mvv?: boolean;
  now?: Date;
}

export interface Completion {
  instanceId: string;
  templateId: string;
  eventId: string | null;
  day: DayKey;
  slot: number;
  receipt: Receipt;
  status: InstanceStatus;
  source: InstanceSource;
  occurredAt: string;
  /** True when this was already recorded (a double tap) and the stored receipt came back. */
  duplicate: boolean;
}

const SLOT_MAX = 20;

function clampSlot(slot: unknown): number {
  return typeof slot === "number" && Number.isFinite(slot) ? Math.max(0, Math.min(SLOT_MAX, Math.floor(slot))) : 0;
}

interface CompletionRead {
  t: BoardTemplate;
  history: BoardInstance[];
  events: TaskEventRow[];
  ledger: DayLedger;
}

/** The one read wave a completion needs: the template, its history, and the day's ledger. */
async function readForCompletion(
  userId: string,
  templateId: string,
  today: DayKey,
  day: DayKey,
  now: Date
): Promise<(CompletionRead & { row: TemplateRow }) | null> {
  const [row, instances, totals, events] = await Promise.all([
    prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: TEMPLATE_SELECT }),
    prisma.taskInstance.findMany({
      where: { templateId, userId, day: { gte: dateColumn(addDays(today, -HISTORY_DAYS)) } },
      select: INSTANCE_SELECT,
    }),
    readDayTotals(userId, [day]),
    readDayTaskEvents(userId, [day]),
  ]);
  if (!row) return null;
  return { row, t: toBoardTemplate(row, now), history: instances.map(toBoardInstance), events, ledger: ledgerOf(day, totals, events) };
}

function storedCompletion(ev: { id: string; sourceId: string | null; receipt: Prisma.JsonValue; occurredAt: Date }, inst: { id: string; status: string; source: string }, t: BoardTemplate, day: DayKey, slot: number): Completion {
  return {
    instanceId: ev.sourceId ?? inst.id,
    templateId: t.id,
    eventId: ev.id,
    day,
    slot,
    receipt: ev.receipt as unknown as Receipt,
    status: inst.status as InstanceStatus,
    source: inst.source as InstanceSource,
    occurredAt: ev.occurredAt.toISOString(),
    duplicate: true,
  };
}

/**
 * Prices and writes one completion from an already-read wave. The instance
 * upsert, the TASK row and the template touch-ups (freeze the grade; mark a
 * one-off complete) go in one transaction array.
 */
async function settleCompletion(
  userId: string,
  read: CompletionRead,
  a: { day: DayKey; today: DayKey; slot: number; minutes?: number | null; mvv?: boolean; now: Date; auto?: boolean; countsForStreak?: boolean; detail?: string | null }
): Promise<LifeResult<Completion>> {
  const { t, history, events, ledger } = read;
  const existing = history.find((i) => i.day === a.day && i.slot === a.slot) ?? null;
  const undone = undoneIds(events);

  if (existing && isDoneStatus(existing.status)) {
    // Already done: a second tap returns what the first one paid.
    const ev = [...events].reverse().find((e) => e.source === "TASK" && e.sourceId === existing.id && !undone.has(e.id));
    if (ev) return ok(storedCompletion(ev, existing, t, a.day, a.slot));
    return fail("Already done.");
  }

  const rule = ruleOf(t);
  const streakDays = rule && !a.auto ? streakDaysFor(t, rule, history, a.day) : 0;
  const plan = planCompletion({
    template: t,
    day: a.day,
    today: a.today,
    slot: a.slot,
    minutes: a.minutes,
    mvv: a.mvv,
    ledger,
    streakDays,
    auto: a.auto,
  });

  // Each undo of this slot bumps the attempt, so re-completing writes a new
  // row under a new key rather than colliding with the one that was undone.
  const attempt = existing ? events.filter((e) => e.source === "UNDO" && e.sourceId === existing.id).length : 0;
  const instanceId = existing?.id ?? newId();
  const event = taskEventInput(plan, {
    templateId: t.id,
    track: t.track,
    instanceId,
    day: a.day,
    slot: a.slot,
    attempt,
    now: a.now,
    countsForStreak: a.countsForStreak,
    detail: a.detail,
  });
  const minutes = Math.round(plan.receipt.minutes) || null;
  const dayCol = dateColumn(a.day);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.taskInstance.upsert({
      where: { templateId_day_slot: { templateId: t.id, day: dayCol, slot: a.slot } },
      create: {
        id: instanceId,
        userId,
        templateId: t.id,
        day: dayCol,
        slot: a.slot,
        status: plan.status,
        source: plan.source,
        completedAt: a.now,
        minutes,
        xpPaid: plan.receipt.xp,
      },
      update: { status: plan.status, source: plan.source, completedAt: a.now, minutes, xpPaid: plan.receipt.xp },
    }),
    activityOp(userId, event),
    // The grade freezes at the first completion: from here on neither the AI
    // nor a resize can change what this task is worth.
    prisma.taskTemplate.updateMany({ where: { id: t.id, gradeFrozenAt: null }, data: { gradeFrozenAt: a.now } }),
  ];
  if (!rule) {
    ops.push(prisma.taskTemplate.updateMany({ where: { id: t.id, completedAt: null }, data: { completedAt: a.now } }));
  }

  try {
    const [, created] = (await prisma.$transaction(ops)) as [unknown, { id: string }];
    return ok({
      instanceId,
      templateId: t.id,
      eventId: created.id,
      day: a.day,
      slot: a.slot,
      receipt: plan.receipt,
      status: plan.status,
      source: plan.source,
      occurredAt: a.now.toISOString(),
      duplicate: false,
    });
  } catch (err) {
    if (!isDuplicateActivity(err)) throw err;
    // Another request recorded this tick first (a second device, a retried
    // action). Whatever it stored is the answer.
    const [ev, inst] = await Promise.all([
      prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: event.dedupeKey! } } }),
      prisma.taskInstance.findUnique({ where: { templateId_day_slot: { templateId: t.id, day: dayCol, slot: a.slot } }, select: INSTANCE_SELECT }),
    ]);
    if (ev && inst) return ok(storedCompletion(ev, inst, t, a.day, a.slot));
    return fail("That tick is already being recorded.");
  } finally {
    invalidate("life", "activity");
  }
}

function completableReason(t: BoardTemplate, row: TemplateRow): string | null {
  if (row.archivedAt) return "That task is archived.";
  if (t.kind === "GOAL") return "Goals move through their steps, not a tick.";
  if (t.kind === "IDEA_DRAFT") return "An idea draft is finished on the Add page.";
  return null;
}

/**
 * Completes a task on today or yesterday (the day is the server's, never the
 * client's), at its estimate or at reported minutes, in full or as its
 * minimum version. Pays exactly the price the board projected against the
 * same ledger. Idempotent on a double tap.
 */
export async function completeInstanceCore(userId: string, templateId: string, opts: CompleteOptions = {}): Promise<LifeResult<Completion>> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const day = opts.day === "yesterday" ? addDays(today, -1) : today;
  const slot = clampSlot(opts.slot);

  const read = await readForCompletion(userId, templateId, today, day, now);
  if (!read) return fail("That task no longer exists.");
  const { t, row } = read;
  const reason = completableReason(t, row);
  if (reason) return fail(reason);
  if (t.startDay > day) return fail("That task didn't exist yet on that day.");
  if (!ruleOf(t) && t.completedAt && !read.history.some((i) => i.day === day && i.slot === slot && isDoneStatus(i.status))) {
    return fail("Already done.");
  }

  // A study task completes itself; a manual tick is accepted only once its
  // target is met (and then pays 0, like the auto-completion would).
  if (t.autoMetric && STUDY_METRICS.has(t.autoMetric)) {
    if (day !== today) return fail("A study task only completes on its own day.");
    const needsDue = t.autoMetric !== "IDEAS";
    const dueNow = needsDue ? await countDue(now) : null;
    const plans = planAutoCompletions({
      templates: [t],
      today,
      counts: { reviews: read.ledger.reviews, ideas: read.ledger.ideas, dueNow },
      doneToday: new Set(),
      lastDone: {},
    });
    if (plans.length === 0) return fail("This completes itself when your reviews reach the target.");
    return settleCompletion(userId, read, {
      day,
      today,
      slot,
      now,
      auto: true,
      countsForStreak: plans[0].state.worked,
      detail: plans[0].state.label,
    });
  }

  return settleCompletion(userId, read, { day, today, slot, minutes: opts.minutes, mvv: opts.mvv, now });
}

/** 'Again': the same habit once more today, in the next slot. Repeat decay prices it lower. */
export async function againCore(userId: string, templateId: string, opts: CompleteOptions = {}): Promise<LifeResult<Completion>> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const read = await readForCompletion(userId, templateId, today, today, now);
  if (!read) return fail("That task no longer exists.");
  const reason = completableReason(read.t, read.row);
  if (reason) return fail(reason);
  if (!ruleOf(read.t)) return fail("Again is for repeating tasks.");
  if (read.t.autoMetric) return fail("A study task completes once a day.");
  const onDay = read.history.filter((i) => i.day === today);
  if (!onDay.some((i) => isDoneStatus(i.status))) return fail("Do it once first.");
  const slot = Math.max(...onDay.map((i) => i.slot)) + 1;
  if (slot > SLOT_MAX) return fail("That's plenty for one day.");
  return settleCompletion(userId, read, { day: today, today, slot, minutes: opts.minutes, mvv: opts.mvv, now });
}

// ── Undo ──────────────────────────────────────────────────────────────────

/**
 * Undoes a tick within ten minutes on the same life day by appending an
 * UNDO row that negates it exactly (xp, rawXp, and −1 streak unit), so the
 * day nets to zero. The instance reads UNDONE and is reused if ticked again.
 * The grade stays frozen: a tick is what freezes it, and undoing one is not
 * a way to re-size.
 */
export async function undoCompletionCore(userId: string, instanceId: string, now: Date = new Date()): Promise<LifeResult<{ instanceId: string; xp: number }>> {
  const [inst, events] = await Promise.all([
    prisma.taskInstance.findFirst({
      where: { id: instanceId, userId },
      select: { id: true, templateId: true, status: true, source: true, template: { select: { recurrence: true } } },
    }),
    prisma.activityEvent.findMany({
      where: { userId, sourceId: instanceId, source: { in: ["TASK", "UNDO"] } },
      orderBy: { occurredAt: "desc" },
      select: { id: true, day: true, source: true, sink: true, track: true, templateId: true, sourceId: true, xp: true, rawXp: true, occurredAt: true, dedupeKey: true },
    }),
  ]);
  if (!inst) return fail("That tick no longer exists.");
  if (!isDoneStatus(inst.status)) return ok({ instanceId, xp: 0 });
  if (inst.source.startsWith("auto:")) return fail("Your reviews completed this one; it can't be undone.");

  const undone = new Set(events.filter((e) => e.source === "UNDO" && e.dedupeKey?.startsWith("undo:")).map((e) => e.dedupeKey!.slice(5)));
  const ev = events.find((e) => e.source === "TASK" && !undone.has(e.id));
  if (!ev) return ok({ instanceId, xp: 0 });
  if (!canUndo(ev.occurredAt, now)) {
    return fail(`Too late to undo: a tick can be undone for ${UNDO_WINDOW_MS / 60_000} minutes, on the same day.`);
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    activityOp(
      userId,
      undoEventInput(
        {
          id: ev.id,
          day: keyOfDateColumn(ev.day),
          sink: ev.sink as Sink,
          track: ev.track ? asTrack(ev.track) : null,
          templateId: ev.templateId,
          sourceId: ev.sourceId,
          xp: ev.xp,
          rawXp: ev.rawXp,
        },
        now
      )
    ),
    prisma.taskInstance.update({ where: { id: inst.id }, data: { status: "UNDONE", xpPaid: 0, completedAt: null, minutes: null } }),
  ];
  if (!inst.template.recurrence) {
    ops.push(prisma.taskTemplate.updateMany({ where: { id: inst.templateId }, data: { completedAt: null } }));
  }
  try {
    await prisma.$transaction(ops);
  } catch (err) {
    // Undone already (a double tap on Undo): the first one's row stands.
    if (!isDuplicateActivity(err)) throw err;
  } finally {
    invalidate("life", "activity");
  }
  return ok({ instanceId, xp: -ev.xp });
}

// ── Skip, reschedule, archive ─────────────────────────────────────────────

/**
 * Skips today's occurrence of a repeating task: 0 XP, and its per-duty
 * streak holds rather than breaks. A compulsory task can't be skipped —
 * that is what its minimum version is for.
 */
export async function skipCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<null>> {
  const today = todayKey(now);
  const [row, existing] = await Promise.all([
    prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { recurrence: true, compulsory: true, archivedAt: true, mvv: true } }),
    prisma.taskInstance.findUnique({
      where: { templateId_day_slot: { templateId, day: dateColumn(today), slot: 0 } },
      select: { status: true, userId: true },
    }),
  ]);
  if (!row || row.archivedAt) return fail("That task no longer exists.");
  if (!row.recurrence) return fail("Only a repeating task can be skipped. Move a one-off to tomorrow instead.");
  if (row.compulsory) {
    return fail(row.mvv ? "A compulsory task can't be skipped. Do its minimum version instead." : "A compulsory task can't be skipped.");
  }
  if (existing && existing.userId !== userId) return fail("That task no longer exists.");
  if (existing && isDoneStatus(existing.status)) return fail("Already done today. Undo it first.");
  if (existing?.status === "SKIPPED") return ok(null);

  await prisma.taskInstance.upsert({
    where: { templateId_day_slot: { templateId, day: dateColumn(today), slot: 0 } },
    create: { userId, templateId, day: dateColumn(today), slot: 0, status: "SKIPPED", source: "manual", xpPaid: 0 },
    update: { status: "SKIPPED", completedAt: null, xpPaid: 0, minutes: null },
  });
  invalidate("life", "activity");
  return ok(null);
}

/**
 * Moves a one-off to another day (PLANNED unless it already has a
 * deadline). A compulsory deadline can only move earlier: pushing a
 * commitment back is the one change that has to wait (the M2 akrasia
 * horizon). 'Tomorrow' on a repeating task skips today instead.
 */
export async function rescheduleCore(userId: string, templateId: string, to: "tomorrow" | DayKey, now: Date = new Date()): Promise<LifeResult<{ dueDay: DayKey } | null>> {
  const today = todayKey(now);
  const row = await prisma.taskTemplate.findFirst({
    where: { id: templateId, userId },
    select: { recurrence: true, compulsory: true, dueDay: true, dueKind: true, completedAt: true, archivedAt: true, kind: true },
  });
  if (!row || row.archivedAt) return fail("That task no longer exists.");
  if (row.recurrence) {
    if (to !== "tomorrow") return fail("A repeating task follows its rule; skip today instead.");
    return skipCore(userId, templateId, now);
  }
  if (row.completedAt) return fail("Already done.");
  const target = to === "tomorrow" ? addDays(today, 1) : to;
  if (!KEY_RE.test(target) || target < today) return fail("Pick today or a later day.");
  if (row.compulsory && row.dueKind === "DEADLINE" && row.dueDay && target > keyOfDateColumn(row.dueDay)) {
    return fail("A compulsory deadline can only move earlier.");
  }
  await prisma.taskTemplate.update({
    where: { id: templateId },
    data: {
      dueDay: dateColumn(target),
      dueKind: row.dueKind ?? "PLANNED",
      inbox: false,
      kind: row.kind === "IDEA_DRAFT" ? "TASK" : undefined,
    },
  });
  invalidate("life", "activity");
  return ok({ dueDay: target });
}

/** Archives a template. Never deletes: its instances and ledger rows are history, and debts (M2) outlive it. */
export async function archiveCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<null>> {
  const res = await prisma.taskTemplate.updateMany({ where: { id: templateId, userId, archivedAt: null }, data: { archivedAt: now } });
  if (res.count === 0) {
    const exists = await prisma.taskTemplate.count({ where: { id: templateId, userId } });
    if (!exists) return fail("That task no longer exists.");
  }
  invalidate("life", "activity");
  return ok(null);
}

/** How long the capture toast's Undo is honoured. */
const CAPTURE_UNDO_MS = 10 * 60_000;

/**
 * The capture toast's Undo: within ten minutes, takes a capture back. A
 * done-now capture's tick is undone first, so the XP nets to zero, then the
 * template is archived.
 */
export async function undoCaptureCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<null>> {
  const [row, instances] = await Promise.all([
    prisma.taskTemplate.findFirst({ where: { id: templateId, userId }, select: { createdAt: true, archivedAt: true } }),
    prisma.taskInstance.findMany({ where: { templateId, userId }, select: { id: true, status: true } }),
  ]);
  if (!row) return fail("That capture no longer exists.");
  if (row.archivedAt) return ok(null);
  if (now.getTime() - row.createdAt.getTime() > CAPTURE_UNDO_MS) return fail("Too late to undo the capture. Archive it from Today instead.");
  for (const i of instances) {
    if (!isDoneStatus(i.status)) continue;
    const undone = await undoCompletionCore(userId, i.id, now);
    if (!undone.ok) return fail(undone.error);
  }
  return archiveCore(userId, templateId, now);
}


/**
 * One-tap clarify for an inbox item. 'idea' keeps it in the inbox as an idea
 * draft and hands back the Add page that finishes it.
 */
export async function clarifyInboxCore(
  userId: string,
  templateId: string,
  choice: InboxChoice,
  parentId: string | null = null,
  now: Date = new Date()
): Promise<LifeResult<{ href: string | null }>> {
  const today = todayKey(now);
  const row = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId, archivedAt: null }, select: { kind: true, recurrence: true } });
  if (!row) return fail("That item no longer exists.");
  const asTask = row.kind === "IDEA_DRAFT" ? "TASK" : undefined;

  switch (choice) {
    case "today":
    case "tomorrow": {
      const day = choice === "today" ? today : addDays(today, 1);
      await prisma.taskTemplate.update({
        where: { id: templateId },
        data: row.recurrence
          ? { inbox: false, kind: asTask }
          : { inbox: false, kind: asTask, dueDay: dateColumn(day), dueKind: "PLANNED" },
      });
      break;
    }
    case "anytime":
      await prisma.taskTemplate.update({ where: { id: templateId }, data: { inbox: false, kind: asTask, dueDay: null, dueKind: null } });
      break;
    case "goal": {
      if (!parentId) return fail("Pick a goal.");
      const goal = await prisma.taskTemplate.findFirst({ where: { id: parentId, userId, kind: "GOAL", archivedAt: null }, select: { id: true } });
      if (!goal) return fail("That goal no longer exists.");
      await prisma.taskTemplate.update({ where: { id: templateId }, data: { inbox: false, kind: asTask, parentId: goal.id } });
      break;
    }
    case "idea":
      await prisma.taskTemplate.update({ where: { id: templateId }, data: { kind: "IDEA_DRAFT", inbox: true } });
      invalidate("life", "activity");
      return ok({ href: `/add?draft=${encodeURIComponent(templateId)}` });
    case "drop":
      return (await archiveCore(userId, templateId, now)).ok ? ok({ href: null }) : fail("That item no longer exists.");
    default:
      return fail("Unknown choice.");
  }
  invalidate("life", "activity");
  return ok({ href: null });
}

/** Renames a task. The normTitle (its repeat-decay group) and its frozen grade stay: a new name is not a new task. */
export async function renameCore(userId: string, templateId: string, title: string): Promise<LifeResult<{ title: string }>> {
  const clean = title.trim().replace(/\s+/g, " ").slice(0, TITLE_MAX);
  if (!clean) return fail("A task needs a title.");
  const res = await prisma.taskTemplate.updateMany({ where: { id: templateId, userId, archivedAt: null }, data: { title: clean } });
  if (res.count === 0) return fail("That task no longer exists.");
  invalidate("life", "activity");
  return ok({ title: clean });
}

// ── Goals ─────────────────────────────────────────────────────────────────

const GOAL_QTY_MAX = 1000;

/**
 * '+1' on a goal measured by hand: a GOAL_PROGRESS row with its qty. Counts
 * for the day's streak (it is real work); pays nothing until M5. A negative
 * qty is a correction and counts for nothing.
 */
export async function goalProgressCore(userId: string, templateId: string, qty: number = 1, now: Date = new Date()): Promise<LifeResult<{ qty: number }>> {
  const n = Number.isFinite(qty) ? Math.max(-GOAL_QTY_MAX, Math.min(GOAL_QTY_MAX, Math.round(qty * 10) / 10)) : 0;
  if (n === 0) return fail("Nothing to add.");
  const goal = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId, kind: "GOAL", archivedAt: null }, select: { id: true } });
  if (!goal) return fail("That goal no longer exists.");
  await recordActivity(userId, {
    source: "GOAL_PROGRESS",
    sink: "NONE",
    occurredAt: now,
    templateId,
    sourceId: templateId,
    qty: n,
    countsForStreak: n > 0,
  });
  invalidate("life", "activity");
  return ok({ qty: n });
}

// ── Self-rating ───────────────────────────────────────────────────────────

/**
 * Sets the self-rating (life-grade.ts's clamp): the effective band never
 * above the machine band + 1, never below INTRO. It affects future
 * completions only, prints 'self-rated' on every receipt, and after the
 * first completion can change at most once a week. The first completion is
 * when the grade froze, since a tick is the only thing that writes
 * `gradeFrozenAt`.
 */
export async function setBandOverrideCore(userId: string, templateId: string, override: number, now: Date = new Date()): Promise<LifeResult<{ bandOverride: number }>> {
  const row = await prisma.taskTemplate.findFirst({
    where: { id: templateId, userId, archivedAt: null },
    select: { band: true, bandOverride: true, bandOverrideAt: true, gradeFrozenAt: true },
  });
  if (!row) return fail("That task no longer exists.");
  const clamped = clampBandOverride(asBand(row.band), override);
  if (clamped === row.bandOverride) return ok({ bandOverride: clamped });
  if (!selfRatingOpen({ firstCompletedAt: row.gradeFrozenAt, bandOverrideAt: row.bandOverrideAt }, now)) {
    const next = new Date(row.bandOverrideAt!.getTime() + BAND_OVERRIDE_COOLDOWN_DAYS * 86_400_000);
    return fail(`The size can change again from ${next.toISOString().slice(0, 10)}.`);
  }
  await prisma.taskTemplate.update({ where: { id: templateId }, data: { bandOverride: clamped, bandOverrideAt: now } });
  invalidate("life", "activity");
  return ok({ bandOverride: clamped });
}

/** Whether a template may still be re-sized by the AI: not frozen, and its one retry unused. */
export async function resizableCore(userId: string, templateId: string, now: Date = new Date()): Promise<LifeResult<null>> {
  const row = await prisma.taskTemplate.findFirst({
    where: { id: templateId, userId, archivedAt: null },
    select: { gradeFrozenAt: true, createdAt: true, gradeAttempts: true },
  });
  if (!row) return fail("That task no longer exists.");
  if (isGradeFrozen(row, now)) {
    return fail("The size is frozen: it was completed, or captured over a day ago. Self-rate it instead.");
  }
  if (row.gradeAttempts >= SIZING_MAX_ATTEMPTS) return fail("It has already been re-sized once.");
  return ok(null);
}

// ── The revision loop ─────────────────────────────────────────────────────

/** Life days whose DAY_OPEN this process has already written, so a page render writes at most once a day. */
const dayOpened = new Set<string>();

/**
 * The first render of /today or /review in a life day records how many
 * cards were due: the quest's fixed target for the day. Call it inside
 * `after()`. Sink NONE, never counts for the streak (opening the app is not
 * work), and idempotent on 'dayopen:<day>'.
 */
export async function recordDayOpen(userId: string, dueCount: number, now: Date = new Date()): Promise<void> {
  const day = todayKey(now);
  const key = `${userId}:${day}`;
  if (dayOpened.has(key)) return;
  dayOpened.add(key);
  try {
    await recordActivity(userId, {
      source: "DAY_OPEN",
      sink: "NONE",
      occurredAt: now,
      day,
      qty: Math.max(0, Math.round(dueCount)),
      countsForStreak: false,
      dedupeKey: `dayopen:${day}`,
    });
  } catch (err) {
    dayOpened.delete(key);
    console.error("DAY_OPEN not recorded:", err);
  }
}

/** Study tasks this process has seen recorded as done, by 'templateId:day'. Small, and cleared as it grows. */
const autoDoneToday = new Set<string>();

function rememberAutoDone(templateId: string, day: DayKey): void {
  if (autoDoneToday.size > 500) autoDoneToday.clear();
  autoDoneToday.add(`${templateId}:${day}`);
}

/** Whether a study task could be due today, judged from the template alone (no instances needed). */
function mayBeDueToday(t: BoardTemplate, today: DayKey): boolean {
  if (t.startDay > today) return false;
  const rule = ruleOf(t);
  if (!rule) return !t.completedAt && !(t.dueKind === "PLANNED" && t.dueDay !== null && t.dueDay > today);
  return rule.kind === "AFTER" || rule.kind === "TARGET" || occursOn(rule, t.startDay, today);
}

/** Templates that complete themselves from study, cached so the review path pays nothing when there are none. */
function loadAutoTemplates(userId: string, now: Date): Promise<BoardTemplate[]> {
  return cached(`autoTasks:${userId}`, ["life"], async () => {
    const rows = await prisma.taskTemplate.findMany({
      where: { userId, archivedAt: null, autoMetric: { in: [...STUDY_METRICS] } },
      select: TEMPLATE_SELECT,
    });
    return rows.map((r) => toBoardTemplate(r, now));
  });
}

/**
 * Completes today's study-linked tasks whose target today's activity has
 * met ('review 20 daily', 'add 3 ideas by fri', 'review due'). Each writes a
 * DONE instance (source auto:reviews / auto:ideas) and a 0-XP TASK row with
 * sink NONE — the reviews already paid, through the Domain. Runs in the
 * review path's after() and after a /today render; a no-op, with no query,
 * when no such task exists. Returns how many it completed.
 */
export async function autoCompleteStudyTasks(userId: string, now: Date = new Date()): Promise<number> {
  const today = todayKey(now);
  // Every review lands here, so the common cases must cost nothing: no study
  // tasks at all, none scheduled today, or all of today's already recorded.
  const autos = (await loadAutoTemplates(userId, now)).filter((t) => !autoDoneToday.has(`${t.id}:${today}`) && mayBeDueToday(t, today));
  if (autos.length === 0) return 0;

  const ids = autos.map((a) => a.id);
  const needsDue = autos.some((a) => a.autoMetric !== "IDEAS");
  const [instances, totals, events, dueNow, lastDoneRows] = await Promise.all([
    prisma.taskInstance.findMany({ where: { userId, templateId: { in: ids }, day: dateColumn(today) }, select: INSTANCE_SELECT }),
    readDayTotals(userId, [today]),
    readDayTaskEvents(userId, [today]),
    needsDue ? countDue(now) : Promise.resolve(null),
    prisma.taskInstance.groupBy({
      by: ["templateId"],
      where: { userId, templateId: { in: ids }, status: { in: ["DONE", "DONE_LATE", "DONE_MVV"] } },
      _max: { day: true },
    }),
  ]);

  const ledger = ledgerOf(today, totals, events);
  const history = instances.map(toBoardInstance);
  const doneToday = new Set(history.filter((i) => isDoneStatus(i.status)).map((i) => i.templateId));
  for (const id of doneToday) rememberAutoDone(id, today);
  const lastDone: Record<string, DayKey | null> = {};
  for (const r of lastDoneRows) lastDone[r.templateId] = r._max.day ? keyOfDateColumn(r._max.day) : null;

  const plans = planAutoCompletions({
    templates: autos,
    today,
    counts: { reviews: ledger.reviews, ideas: ledger.ideas, dueNow },
    doneToday,
    lastDone,
  });

  let completed = 0;
  for (const p of plans) {
    const read: CompletionRead = {
      t: p.template,
      history: history.filter((i) => i.templateId === p.template.id),
      events,
      ledger,
    };
    try {
      const res = await settleCompletion(userId, read, {
        day: today,
        today,
        slot: 0,
        now,
        auto: true,
        countsForStreak: p.state.worked,
        detail: p.state.label,
      });
      if (res.ok) rememberAutoDone(p.template.id, today);
      if (res.ok && !res.value.duplicate) completed += 1;
    } catch (err) {
      console.error("Study task not auto-completed:", err);
    }
  }
  return completed;
}
