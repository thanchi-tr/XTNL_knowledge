/**
 * Avatar targets: the reads and the only writer (server only; the rules are avatar.ts; blueprint P4, decisions D3 and
 * D4). The AvatarTarget table and the 'AVATAR|a:<lineageId>' readings in RoadmapReading are written here and nowhere
 * else, and nothing here touches the ledger: no ActivityEvent, MasteryLedgerEntry or Domain point, no XP, MP, level,
 * kept week or moment (scripts/status-check.ts pins that this file writes no ledger and imports no writer).
 *
 *   loadAvatar(userId, now?, opts?)               the live targets as the Status card shows them, the Fields a target may
 *                                                 read, and whether writes are on. Fails soft: a missing table (the
 *                                                 migration not applied yet) reads as no targets, and each fact that
 *                                                 can't be read leaves its targets with no value
 *   addAvatarTargetCore(userId, input, deps?)     a new lineage (its first row: id = lineageId), under the caps
 *   editAvatarTargetCore(userId, id, patch, deps?) archives the live row and adds the lineage's next one, atomically
 *                                                 (only while it is still live: a raced edit is refused, never doubled)
 *   archiveAvatarTargetCore(userId, id, deps?)    retires a target; its rows and readings stay
 *   logAvatarReadingCore(userId, id, value, deps?) a MANUAL target's reading for today, SELF (logging again replaces it)
 *   recordAvatarReadings(userId, now, opts?)      today's COMPUTED readings for the measured targets (the degrade cron,
 *                                                 through settlement.ts recordAvatarAfterDegrade); never throws
 *
 * Every write needs lifeWritesEnabled(env) (production, or XTNL_LIFE_JUDGE=1 on the local rehearsal): dev and prod
 * share one database, so a dev server records nothing and says so (AVATAR_WRITES_OFF). The weight target is never
 * written here: it is WeightGoal's own, set on Train › Weight.
 *
 * The store and the fact reads are injectable (AvatarDeps), so scripts/status-check.ts drives every core on fixtures
 * with no database.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { dateColumn, keyOfDateColumn, monthKeyOf, todayKey, type DayKey } from "./life-day";
import { lifeWritesEnabled, type LifeEnv } from "./life-economy";
import { effortMinutesOf, liveWeekRows, type WeekTaskRow } from "./life-weeks";
import { CATEGORIES, TRACKS, type Category, type Receipt, type Track } from "./life-types";
import { loadFieldLevels } from "./queries";
import { loadWeightView } from "./weight-server";
import { loadCapitalDeals } from "./status-panel-server";
import { capitalReadingOf, type CapitalDeal } from "./status-panel";
import {
  AVATAR_METRICS,
  avatarKey,
  avatarTargetsOf,
  capacityError,
  cleanReading,
  cleanTargetInput,
  computedReadingsOf,
  currentOf,
  isAvatarAttribute,
  lastWeekOf,
  planTargetEdit,
  trackMinutesOf,
  type AvatarFacts,
  type AvatarReadingRow,
  type AvatarResult,
  type AvatarTargetData,
  type AvatarTargetInput,
  type AvatarTargetPatch,
  type AvatarTargetRow,
  type AvatarView,
} from "./avatar";

/** A server whose writes are off (a dev server sharing the database, a Preview) says this and records nothing. */
export const AVATAR_WRITES_OFF = "Avatar changes are recorded only on the live app.";
const GONE = "That target is gone.";
const RACED = "That target changed meanwhile. Try again.";
const SAVE_FAILED = "Couldn't save that. Try again.";
const NOT_READY = "Avatar targets aren't set up on this database yet.";

/** A bound on the rows one read takes (the caps keep a user's live targets to 12). */
const ROWS_MAX = 50;

// ── The store ───────────────────────────────────────────────────────────────

/** A new row: the data, its id, its lineage and its place. */
export type AvatarNewRow = AvatarTargetData & { id: string; lineageId: string; sortOrder: number };

/** The table and the readings, as the cores use them (the real one is Prisma; the checks pass their own). */
export interface AvatarStore {
  /** The user's live rows (archivedAt null). */
  live(userId: string): Promise<AvatarTargetRow[]>;
  /** One of the user's rows by id, live or archived. */
  byId(userId: string, id: string): Promise<AvatarTargetRow | null>;
  /** A lineage's first row. */
  insert(userId: string, row: AvatarNewRow, at: Date): Promise<void>;
  /** Archive `oldId` while it is live and add the lineage's next row, in one transaction; "stale" when it was not live. */
  replace(userId: string, oldId: string, next: AvatarNewRow, at: Date): Promise<"ok" | "stale">;
  /** Archive one live row; how many changed (0 or 1). */
  archive(userId: string, id: string, at: Date): Promise<number>;
  /** Today's SELF reading under the key (logging again replaces it; a COMPUTED row is never overwritten). */
  logSelf(userId: string, row: AvatarReadingRow, at: Date): Promise<void>;
  /** The latest SELF reading per key, on or before `today`. */
  latestSelf(userId: string, keys: readonly string[], today: DayKey): Promise<Record<string, { day: DayKey; value: number }>>;
  /** Today's COMPUTED readings (insert, or update a COMPUTED row of today that is older and differs); rows written. */
  upsertComputed(userId: string, rows: readonly AvatarReadingRow[], observedAt: Date): Promise<number>;
}

/** The facts the metrics read, each injectable. */
export interface AvatarFactReads {
  /** Every Field's id, name and level now (queries.ts loadFieldLevels). */
  fields: () => Promise<readonly { id: string; name: string; level: number }[]>;
  /** The judge's rows (TASK, UNDO, WORKOUT on a track) for [from, to]. */
  weekRows: (userId: string, from: DayKey, to: DayKey) => Promise<WeekTaskRow[]>;
  /** The won deals of the Capital window (status-panel-server loadCapitalDeals). */
  deals: (userId: string, today: DayKey) => Promise<readonly CapitalDeal[]>;
  /** Train › Weight's trend and goal (weight-server loadWeightView). */
  weight: (userId: string, now: Date) => Promise<AvatarFacts["weight"]>;
}

export interface AvatarDeps {
  store?: AvatarStore;
  reads?: Partial<AvatarFactReads>;
  /** The variables the write gate reads (process.env by default). */
  env?: LifeEnv;
  now?: () => Date;
  /** A new row's id (a UUID by default; the checks pass a counter). */
  newId?: () => string;
}

/** Whether a database error says the AvatarTarget table isn't there (the migration not applied yet), or the client predates it. */
export function isMissingAvatarTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; meta?: unknown };
  const text = `${typeof e.message === "string" ? e.message : ""} ${JSON.stringify(e.meta ?? {})}`;
  if (/column/i.test(text)) return false;
  const missing = e.code === "P2021" || /\b42P01\b/.test(text) || /(relation|table) \W{0,2}(public\.)?\W?AvatarTarget\W{0,2} does not exist/i.test(text);
  if (missing) return /AvatarTarget/.test(text);
  // A Prisma client generated before the migration has no avatarTarget delegate.
  return err instanceof TypeError && /\b(findMany|findFirst|create|updateMany)\b/.test(text) && /undefined/.test(text);
}

let warnedMissing = false;
function warnMissing(label: string): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(`${label}: the AvatarTarget table is missing (migration 20261229000000_avatar_targets not applied); showing no targets.`);
}

const ROW_SELECT = {
  id: true,
  lineageId: true,
  attribute: true,
  label: true,
  metric: true,
  scope: true,
  unit: true,
  direction: true,
  baselineValue: true,
  baselineDay: true,
  targetValue: true,
  targetDay: true,
  sortOrder: true,
  createdAt: true,
  archivedAt: true,
} as const;

type DbRow = {
  id: string;
  lineageId: string;
  attribute: string;
  label: string;
  metric: string;
  scope: Prisma.JsonValue;
  unit: string;
  direction: string;
  baselineValue: number | null;
  baselineDay: Date | null;
  targetValue: number;
  targetDay: Date | null;
  sortOrder: number;
  createdAt: Date;
  archivedAt: Date | null;
};

function rowOf(r: DbRow): AvatarTargetRow {
  return {
    ...r,
    scope: r.scope ?? {},
    baselineDay: r.baselineDay ? keyOfDateColumn(r.baselineDay) : null,
    targetDay: r.targetDay ? keyOfDateColumn(r.targetDay) : null,
    createdAt: r.createdAt.toISOString(),
    archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
  };
}

function dataOf(userId: string, row: AvatarNewRow) {
  return {
    id: row.id,
    userId,
    lineageId: row.lineageId,
    attribute: row.attribute,
    label: row.label,
    metric: row.metric,
    scope: row.scope as Prisma.InputJsonValue,
    unit: row.unit,
    direction: row.direction,
    baselineValue: row.baselineValue,
    baselineDay: row.baselineDay ? dateColumn(row.baselineDay) : null,
    targetValue: row.targetValue,
    targetDay: row.targetDay ? dateColumn(row.targetDay) : null,
    sortOrder: row.sortOrder,
  };
}

/** Raced: the row was no longer live when the edit ran. */
class StaleEdit extends Error {}

/** The real store: Prisma. */
export const prismaAvatarStore: AvatarStore = {
  async live(userId) {
    const rows = await prisma.avatarTarget.findMany({ where: { userId, archivedAt: null }, select: ROW_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: ROWS_MAX });
    return rows.map(rowOf);
  },
  async byId(userId, id) {
    const r = await prisma.avatarTarget.findFirst({ where: { id, userId }, select: ROW_SELECT });
    return r ? rowOf(r) : null;
  },
  async insert(userId, row) {
    await prisma.avatarTarget.create({ data: dataOf(userId, row) });
  },
  async replace(userId, oldId, next, at) {
    try {
      await prisma.$transaction(async (tx) => {
        const changed = (await tx.avatarTarget.updateMany({ where: { id: oldId, userId, archivedAt: null }, data: { archivedAt: at } })).count;
        if (changed !== 1) throw new StaleEdit();
        await tx.avatarTarget.create({ data: dataOf(userId, next) });
      });
      return "ok";
    } catch (err) {
      // Raced: archived meanwhile, or another edit's row holds the lineage's one live place (the partial unique index).
      if (err instanceof StaleEdit) return "stale";
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "stale";
      throw err;
    }
  },
  async archive(userId, id, at) {
    return (await prisma.avatarTarget.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: at } })).count;
  },
  async logSelf(userId, row, at) {
    // Raw INSERTs supply their own id (RoadmapReading has no database default). Only a SELF row is replaced.
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RoadmapReading" ("id", "userId", "measureKey", "day", "value", "detail", "source", "observedAt", "createdAt")
      VALUES (${globalThis.crypto.randomUUID()}, ${userId}, ${row.measureKey}, ${row.day}::date, ${row.value}, ${JSON.stringify(row.detail)}::jsonb, 'SELF', ${at}, ${at})
      ON CONFLICT ("userId", "measureKey", "day") DO UPDATE
        SET "value" = EXCLUDED."value", "detail" = EXCLUDED."detail", "observedAt" = EXCLUDED."observedAt"
        WHERE "RoadmapReading"."source" = 'SELF'
    `);
  },
  async latestSelf(userId, keys, today) {
    if (keys.length === 0) return {};
    const rows = await prisma.roadmapReading.findMany({
      where: { userId, source: "SELF", measureKey: { in: [...keys] }, day: { lte: dateColumn(today) } },
      orderBy: [{ day: "desc" }, { observedAt: "desc" }],
      distinct: ["measureKey"],
      select: { measureKey: true, day: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.measureKey, { day: keyOfDateColumn(r.day), value: r.value }]));
  },
  async upsertComputed(userId, rows, observedAt) {
    if (rows.length === 0) return 0;
    // The roadmap readings' upsert rule (roadmap-readings readingUpsertOp): today only, COMPUTED, and a stored row is
    // updated only when it has the same source, is not newer, and differs; an unchanged row writes nothing.
    const counts = await prisma.$transaction(
      rows.map(
        (r) => prisma.$executeRaw(Prisma.sql`
          INSERT INTO "RoadmapReading" ("id", "userId", "measureKey", "day", "value", "detail", "source", "observedAt")
          VALUES (${globalThis.crypto.randomUUID()}, ${userId}, ${r.measureKey}, ${r.day}::date, ${r.value}, ${JSON.stringify(r.detail)}::jsonb, 'COMPUTED', ${observedAt})
          ON CONFLICT ("userId", "measureKey", "day") DO UPDATE
            SET "value" = EXCLUDED."value", "detail" = EXCLUDED."detail", "observedAt" = EXCLUDED."observedAt"
            WHERE "RoadmapReading"."source" = EXCLUDED."source"
              AND "RoadmapReading"."observedAt" <= EXCLUDED."observedAt"
              AND ("RoadmapReading"."value" IS DISTINCT FROM EXCLUDED."value" OR "RoadmapReading"."detail" IS DISTINCT FROM EXCLUDED."detail")
        `)
      )
    );
    return counts.reduce((a, b) => a + b, 0);
  },
};

// ── The fact reads ──────────────────────────────────────────────────────────

const CATEGORY_SET = new Set<string>(CATEGORIES);
const TRACK_SET = new Set<string>(TRACKS);

type WeekRowRaw = { id: string; source: string; dedupeKey: string | null; day: Date; track: string; templateId: string | null; rawXp: number | null; receipt: Prisma.JsonValue; category: string | null };

const receiptOf = (v: Prisma.JsonValue): Receipt | null =>
  v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as { factors?: unknown }).factors) ? (v as unknown as Receipt) : null;

/** The real fact reads. */
export const prismaAvatarReads: AvatarFactReads = {
  fields: async () => (await loadFieldLevels()).map((f) => ({ id: f.id, name: f.name, level: f.level })),
  async weekRows(userId, from, to) {
    // The week judge's own read (life-weeks-server): TRACK rows of TASK, UNDO and WORKOUT, with the template's category.
    const rows = await prisma.$queryRaw<WeekRowRaw[]>`
      SELECT e."id", e."source", e."dedupeKey", e."day", e."track", e."templateId", e."rawXp", e."receipt", t."category"
      FROM "ActivityEvent" e
      LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
      WHERE e."userId" = ${userId} AND e."sink" = 'TRACK' AND e."source" IN ('TASK', 'UNDO', 'WORKOUT') AND e."track" IS NOT NULL
        AND e."day" >= ${from}::date AND e."day" <= ${to}::date
    `;
    return rows.flatMap((r): WeekTaskRow[] =>
      TRACK_SET.has(r.track) && (r.source === "TASK" || r.source === "UNDO" || r.source === "WORKOUT")
        ? [
            {
              id: r.id,
              source: r.source,
              dedupeKey: r.dedupeKey,
              day: keyOfDateColumn(new Date(r.day)),
              track: r.track as Track,
              templateId: r.templateId,
              rawXp: Number(r.rawXp ?? 0),
              receipt: receiptOf(r.receipt),
              // A walk has no template: it is exercise (as the judge reads it).
              category: r.source === "WORKOUT" ? "EXERCISE" : r.category && CATEGORY_SET.has(r.category) ? (r.category as Category) : null,
            },
          ]
        : []
    );
  },
  deals: (userId, today) => loadCapitalDeals(userId, today),
  async weight(userId, now) {
    const v = await loadWeightView(userId, now);
    return { unit: v.unit, trendKg: v.trendKg, progress: v.progress, goal: v.goal };
  },
};

const soft =
  <T>(what: string, fallback: T) =>
  (err: unknown): T => {
    console.error(`[avatar] ${what} unavailable`, err);
    return fallback;
  };

/** The live rows; none when the table is missing (the migration not applied yet). */
async function liveRows(store: AvatarStore, userId: string): Promise<AvatarTargetRow[]> {
  try {
    return await store.live(userId);
  } catch (err) {
    if (!isMissingAvatarTable(err)) throw err;
    warnMissing("loadAvatar");
    return [];
  }
}

/**
 * The facts the rows' metrics need, each read only when a row needs it (the Fields and the weight always: the editor
 * lists the Fields, and Train's weight target shows whenever one is set). A failed read is that fact alone (null).
 * `deals`: the Capital read already made (null when it failed); omitted, it is read here when a row needs it.
 */
async function factsFor(
  userId: string,
  now: Date,
  rows: readonly AvatarTargetRow[],
  store: AvatarStore,
  reads: AvatarFactReads,
  deals?: readonly CapitalDeal[] | null
): Promise<AvatarFacts> {
  const today = todayKey(now);
  const needs = new Set(rows.map((r) => r.metric));
  const week = lastWeekOf(today);
  const manualKeys = rows.filter((r) => r.metric === "MANUAL").map((r) => avatarKey(r.lineageId));
  const noLogs: Record<string, { day: DayKey; value: number }> = {};
  const [fields, weekRows, dealRows, manual, weight] = await Promise.all([
    reads.fields().catch(soft("the Field levels", null)),
    needs.has("EFFORT_MINUTES") || needs.has("TRACK_HOURS") ? reads.weekRows(userId, week.from, week.to).catch(soft("last week's rows", null)) : Promise.resolve(null),
    needs.has("REVENUE_MONTH") ? (deals !== undefined ? Promise.resolve(deals) : reads.deals(userId, today).catch(soft("the won deals", null))) : Promise.resolve(null),
    manualKeys.length > 0 ? store.latestSelf(userId, manualKeys, today).catch(soft("the logged readings", noLogs)) : Promise.resolve(noLogs),
    reads.weight(userId, now).catch(soft("the weight", null)),
  ]);
  const live = weekRows ? liveWeekRows(weekRows) : null;
  const byLineage: Record<string, { day: DayKey; value: number }> = {};
  for (const r of rows) {
    const hit = manual[avatarKey(r.lineageId)];
    if (r.metric === "MANUAL" && hit) byLineage[r.lineageId] = hit;
  }
  return {
    fields: fields ? [...fields] : null,
    effortMinutes: weekRows ? effortMinutesOf(weekRows, week.from, week.to) : null,
    trackMinutes: live ? trackMinutesOf(live, week.from, week.to) : null,
    revenueCents: dealRows ? capitalReadingOf(dealRows, monthKeyOf(today)).wonCents : null,
    manual: byLineage,
    weight,
  };
}

const depsOf = (deps: AvatarDeps = {}) => ({
  store: deps.store ?? prismaAvatarStore,
  reads: { ...prismaAvatarReads, ...deps.reads },
  now: deps.now ?? (() => new Date()),
  newId: deps.newId ?? (() => globalThis.crypto.randomUUID()),
  writesOn: lifeWritesEnabled(deps.env),
});

// ── The read ────────────────────────────────────────────────────────────────

/**
 * The live targets as the Status card shows them (avatar.ts avatarTargetsOf: Train's weight target when one is set,
 * then every live row, in the panel's order), the Fields a target may read, and whether writes are on. Fresh on every
 * read (no cache to clear after an edit). `deals`: the /you page's own Capital read, so it is read once.
 */
export async function loadAvatar(userId: string, now: Date = new Date(), opts: AvatarDeps & { deals?: readonly CapitalDeal[] | null } = {}): Promise<AvatarView> {
  const d = depsOf(opts);
  const rows = await liveRows(d.store, userId);
  const facts = await factsFor(userId, now, rows, d.store, d.reads, opts.deals);
  return {
    targets: avatarTargetsOf(rows, facts, todayKey(now)),
    fields: [...(facts.fields ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    writesOn: d.writesOn,
  };
}

// ── The writes ──────────────────────────────────────────────────────────────

function writeFailed(label: string, err: unknown): { ok: false; error: string } {
  if (isMissingAvatarTable(err)) {
    warnMissing(label);
    return { ok: false, error: NOT_READY };
  }
  console.error(`[avatar] ${label} failed:`, err);
  return { ok: false, error: SAVE_FAILED };
}

/**
 * Adds a target: a new lineage whose first row's id is its lineage id. Refused when writes are off, past the caps
 * (avatar.ts capacityError; Train's weight target counts under Vitality), or when the input isn't one
 * (cleanTargetInput: a computed metric with no baseline given starts from its value now, as Train's weight target
 * starts from the trend). It goes last among its attribute's targets.
 */
export async function addAvatarTargetCore(userId: string, input: AvatarTargetInput, deps: AvatarDeps = {}): Promise<AvatarResult<{ id: string }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: AVATAR_WRITES_OFF };
  try {
    const now = d.now();
    const today = todayKey(now);
    const live = await d.store.live(userId);
    const attribute = input?.attribute;
    // The value now, for a computed metric's default baseline: the same facts the card reads, for this one metric.
    const probe: AvatarTargetRow = {
      id: "probe",
      lineageId: "probe",
      attribute: String(attribute ?? ""),
      label: "",
      metric: String(input?.metric ?? ""),
      scope: { fieldId: input?.fieldId ?? undefined },
      unit: "",
      direction: "UP",
      baselineValue: null,
      baselineDay: null,
      targetValue: 0,
      targetDay: null,
      sortOrder: 0,
      createdAt: now.toISOString(),
      archivedAt: null,
    };
    const facts = await factsFor(userId, now, [probe], d.store, d.reads);
    const weightSet = facts.weight?.goal.targetKg != null;
    const cap = isAvatarAttribute(attribute) ? capacityError(live, attribute, weightSet) : null;
    if (cap) return { ok: false, error: cap };
    const clean = cleanTargetInput(input, { today, fields: facts.fields ?? [], current: currentOf(probe, facts, today).value });
    if (!clean.ok) return clean;
    const id = d.newId();
    const sortOrder = Math.max(-1, ...live.filter((r) => r.attribute === clean.value.attribute).map((r) => r.sortOrder)) + 1;
    await d.store.insert(userId, { ...clean.value, id, lineageId: id, sortOrder }, now);
    return { ok: true, value: { id } };
  } catch (err) {
    return writeFailed("addAvatarTargetCore", err);
  }
}

/**
 * Edits a target: the live row is archived and its lineage's next row added in one transaction (avatar.ts
 * planTargetEdit plans it: the label, the baseline, the target and its day; the attribute, metric, scope and unit
 * stay). The archived row is the history. A row that is gone or archived is refused; an edit that raced another is
 * refused, never doubled (the partial unique index holds one live row a lineage).
 */
export async function editAvatarTargetCore(userId: string, id: string, patch: AvatarTargetPatch, deps: AvatarDeps = {}): Promise<AvatarResult<{ id: string }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: AVATAR_WRITES_OFF };
  try {
    const now = d.now();
    const row = await d.store.byId(userId, id);
    if (!row || row.archivedAt != null) return { ok: false, error: GONE };
    const plan = planTargetEdit(row, patch, todayKey(now));
    if (!plan.ok) return plan;
    const next = d.newId();
    const res = await d.store.replace(userId, row.id, { ...plan.value, id: next, lineageId: row.lineageId, sortOrder: row.sortOrder }, now);
    return res === "ok" ? { ok: true, value: { id: next } } : { ok: false, error: RACED };
  } catch (err) {
    return writeFailed("editAvatarTargetCore", err);
  }
}

/** Retires a target: archivedAt is set; the row and its readings stay. */
export async function archiveAvatarTargetCore(userId: string, id: string, deps: AvatarDeps = {}): Promise<AvatarResult<null>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: AVATAR_WRITES_OFF };
  try {
    const changed = await d.store.archive(userId, id, d.now());
    return changed === 1 ? { ok: true, value: null } : { ok: false, error: GONE };
  } catch (err) {
    return writeFailed("archiveAvatarTargetCore", err);
  }
}

/**
 * A MANUAL target's reading for today, in its unit: a SELF row under 'AVATAR|a:<lineageId>' (its line says
 * "self-reported"). Logging again today replaces today's. Only a live MANUAL target takes one: a measured target's
 * readings are the app's own.
 */
export async function logAvatarReadingCore(userId: string, id: string, value: number, deps: AvatarDeps = {}): Promise<AvatarResult<{ day: DayKey; value: number }>> {
  const d = depsOf(deps);
  if (!d.writesOn) return { ok: false, error: AVATAR_WRITES_OFF };
  const clean = cleanReading(value);
  if (!clean.ok) return clean;
  try {
    const now = d.now();
    const row = await d.store.byId(userId, id);
    if (!row || row.archivedAt != null) return { ok: false, error: GONE };
    if (row.metric !== "MANUAL") return { ok: false, error: "The app measures this one itself." };
    const day = todayKey(now);
    await d.store.logSelf(userId, { measureKey: avatarKey(row.lineageId), day, value: clean.value, detail: { v: 1, metric: "MANUAL", unit: row.unit } }, now);
    return { ok: true, value: { day, value: clean.value } };
  } catch (err) {
    return writeFailed("logAvatarReadingCore", err);
  }
}

/** recordAvatarReadings' result, for the degrade cron's JSON. */
export interface AvatarReadingsRun {
  written: number;
  skipped: "WRITES_OFF" | "MISSING_TABLE" | null;
  /** A failure it caught (it never throws). */
  error?: string;
}

/**
 * Today's COMPUTED readings: one per live measured target with a value (avatar.ts computedReadingsOf), keyed by its
 * lineage, with the roadmap readings' upsert rule (a rerun the same day writes nothing new). Gated by
 * lifeWritesEnabled(env); never throws (a failure comes back as `error`); a missing table is a skip.
 */
export async function recordAvatarReadings(userId: string, now: Date = new Date(), opts: Pick<AvatarDeps, "store" | "reads" | "env"> = {}): Promise<AvatarReadingsRun> {
  const d = depsOf(opts);
  if (!d.writesOn) return { written: 0, skipped: "WRITES_OFF" };
  try {
    let rows: AvatarTargetRow[];
    try {
      rows = await d.store.live(userId);
    } catch (err) {
      if (isMissingAvatarTable(err)) return { written: 0, skipped: "MISSING_TABLE" };
      throw err;
    }
    if (!rows.some((r) => AVATAR_METRICS[r.metric as keyof typeof AVATAR_METRICS]?.source === "COMPUTED")) return { written: 0, skipped: null };
    const today = todayKey(now);
    const facts = await factsFor(userId, now, rows, d.store, d.reads);
    const readings = computedReadingsOf(avatarTargetsOf(rows, facts, today), today);
    return { written: await d.store.upsertComputed(userId, readings, now), skipped: null };
  } catch (err) {
    console.error("[avatar] the readings failed", err);
    return { written: 0, skipped: null, error: err instanceof Error ? err.message : String(err) };
  }
}
