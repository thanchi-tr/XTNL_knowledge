/**
 * Body weight: reads and writes (server only). Contract (frozen; lane A
 * implements the STUBs). Every read fails soft — the tables may be missing
 * on a database the migration has not reached yet — and returns the empty
 * view; every write returns { ok: false, error } instead of throwing.
 * Cache tag 'weight' (src/lib/cache.ts) on reads; writes revalidate it.
 *
 *   loadWeightView(userId, now?)                 → WeightView
 *   logWeightCore(userId, kg, opts?)             → { ok, value: { day, kg, replaced } } | { ok: false, error }
 *        opts: { day?: DayKey; source?: 'manual' | 'capture' | 'import'; note?: string; now?: Date }
 *        one reading per life day: an existing one is replaced (replaced: true)
 *   deleteWeightCore(userId, day)                → { ok } | { ok: false, error }
 *   setWeightGoalCore(userId, input, now?)       → { ok, value: WeightGoalView } | { ok: false, error }
 *        input: { unit?: WeightUnit; targetKg?: number | null; targetDay?: DayKey | null }
 *        setting or changing targetKg records startKg = today's trend (or the latest reading) and startDay = today;
 *        targetKg null clears the target (and its start)
 *   loadWeightGoal(userId)                       → WeightGoalView (unit 'kg', nulls when none)
 *
 * A record, never a reward: nothing here touches the ledger, XP, MP, a
 * streak or a celebration, and none of the economy files import this.
 *
 * The cache is the process cache (cache.ts cached/invalidate under 'weight'),
 * like every other loader here; the actions add refresh() for the route.
 * Readings are read back WEIGHT_HISTORY_DAYS days: at α = 0.1 a reading that
 * old weighs (0.9)^90 ≈ 0.01 % in the 90-day chart's first point, so the
 * trend is the same as one seeded years earlier.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { addDays, dateColumn, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import {
  clampKg,
  cleanNote,
  isDayKey,
  isWeightUnit,
  logDayError,
  roundKg,
  SERIES_DAYS,
  targetDayError,
  weightView,
  MAX_KG,
  MIN_KG,
  type WeightGoalView,
  type WeightReading,
  type WeightUnit,
  type WeightView,
} from "./weight";

export type WeightResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const EMPTY_GOAL: WeightGoalView = { unit: "kg", targetKg: null, targetDay: null, startKg: null, startDay: null };

/** How far back the view reads readings (the 90-day chart plus the trend's warm-up). */
export const WEIGHT_HISTORY_DAYS = SERIES_DAYS + 90;

const SOURCES = ["manual", "capture", "import"] as const;
type WeightSource = (typeof SOURCES)[number];

const NOT_READY = "Weight tracking isn't set up on this database yet.";
const SAVE_FAILED = "Couldn't save that. Try again.";
export const OUT_OF_RANGE = `A weight between ${MIN_KG} and ${MAX_KG} kg, please.`;

/** The tables are not there yet (the migration has not reached this database). */
export function isMissingTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2021") return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*(BodyWeight|WeightGoal)[`"]? does not exist/i.test(message);
}

let warnedMissing = false;
/** Logs a read failure: a missing table once per process, anything else every time. */
function logReadFailure(label: string, err: unknown): void {
  if (isMissingTable(err)) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(`${label}: the weight tables are missing (migration 20261015000000_body_weight not applied); showing nothing logged.`);
    }
    return;
  }
  console.error(`${label} failed:`, err);
}

const toNumber = (d: Prisma.Decimal | number | string | null | undefined): number | null => {
  if (d === null || d === undefined) return null;
  const n = typeof d === "number" ? d : Number(d.toString());
  return Number.isFinite(n) ? roundKg(n) : null;
};

const toDecimal = (kg: number): Prisma.Decimal => new Prisma.Decimal(roundKg(kg).toFixed(2));

type GoalRow = {
  unit: string;
  targetKg: Prisma.Decimal | null;
  targetDay: Date | null;
  startKg: Prisma.Decimal | null;
  startDay: Date | null;
};

function goalOfRow(row: GoalRow | null): WeightGoalView {
  if (!row) return EMPTY_GOAL;
  return {
    unit: isWeightUnit(row.unit) ? row.unit : "kg",
    targetKg: toNumber(row.targetKg),
    targetDay: row.targetDay ? keyOfDateColumn(row.targetDay) : null,
    startKg: toNumber(row.startKg),
    startDay: row.startDay ? keyOfDateColumn(row.startDay) : null,
  };
}

async function readGoal(userId: string): Promise<WeightGoalView> {
  const row = await prisma.weightGoal.findUnique({
    where: { userId },
    select: { unit: true, targetKg: true, targetDay: true, startKg: true, startDay: true },
  });
  return goalOfRow(row);
}

async function readReadings(userId: string, today: DayKey): Promise<WeightReading[]> {
  const rows = await prisma.bodyWeight.findMany({
    where: { userId, day: { gte: dateColumn(addDays(today, -WEIGHT_HISTORY_DAYS)), lte: dateColumn(today) } },
    orderBy: { day: "asc" },
    select: { day: true, kg: true, source: true, note: true },
  });
  const out: WeightReading[] = [];
  for (const r of rows) {
    const kg = toNumber(r.kg);
    if (kg === null) continue;
    const source: WeightSource = (SOURCES as readonly string[]).includes(r.source) ? (r.source as WeightSource) : "manual";
    out.push({ day: keyOfDateColumn(r.day), kg, source, note: r.note });
  }
  return out;
}

/** The goal and display unit (EMPTY_GOAL when none, or when the table is missing). */
export async function loadWeightGoal(userId: string): Promise<WeightGoalView> {
  try {
    return await cached(`weightGoal:${userId}`, ["weight"], () => readGoal(userId));
  } catch (err) {
    logReadFailure("loadWeightGoal", err);
    return EMPTY_GOAL;
  }
}

/** The card's view for today (the empty view when the tables are missing or a read fails). */
export async function loadWeightView(userId: string, now: Date = new Date()): Promise<WeightView> {
  const today = todayKey(now);
  try {
    return await cached(`weightView:${userId}:${today}`, ["weight"], async () => {
      const [readings, goal] = await Promise.all([readReadings(userId, today), readGoal(userId)]);
      return weightView(readings, goal, today);
    });
  } catch (err) {
    logReadFailure("loadWeightView", err);
    return weightView([], EMPTY_GOAL, today);
  }
}

function writeError(label: string, err: unknown): { ok: false; error: string } {
  if (isMissingTable(err)) {
    logReadFailure(label, err);
    return { ok: false, error: NOT_READY };
  }
  console.error(`${label} failed:`, err);
  return { ok: false, error: SAVE_FAILED };
}

/**
 * Logs a weigh-in in kg for a life day (today by default). One reading per
 * day: logging again replaces it (replaced: true). The weight is clamped to
 * [MIN_KG, MAX_KG] and the day must be today or up to a year back.
 */
export async function logWeightCore(
  userId: string,
  kg: number,
  opts: { day?: DayKey; source?: "manual" | "capture" | "import"; note?: string; now?: Date } = {}
): Promise<WeightResult<{ day: DayKey; kg: number; replaced: boolean }>> {
  const now = opts.now ?? new Date();
  const today = todayKey(now);
  const value = typeof kg === "number" ? clampKg(kg) : null;
  if (value === null) return { ok: false, error: OUT_OF_RANGE };
  const day = opts.day ?? today;
  const dayError = logDayError(day, today);
  if (dayError) return { ok: false, error: dayError };
  const source: WeightSource = (SOURCES as readonly unknown[]).includes(opts.source) ? (opts.source as WeightSource) : "manual";
  const note = cleanNote(opts.note);

  try {
    const where = { userId_day: { userId, day: dateColumn(day) } };
    const existing = await prisma.bodyWeight.findUnique({ where, select: { id: true } });
    const data = { kg: toDecimal(value), measuredAt: now, source, note };
    await prisma.bodyWeight.upsert({
      where,
      create: { userId, day: dateColumn(day), ...data },
      update: data,
    });
    invalidate("weight");
    return { ok: true, value: { day, kg: value, replaced: existing !== null } };
  } catch (err) {
    // A concurrent first log of the same day won the unique race: replace it instead.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      try {
        await prisma.bodyWeight.update({
          where: { userId_day: { userId, day: dateColumn(day) } },
          data: { kg: toDecimal(value), measuredAt: now, source, note },
        });
        invalidate("weight");
        return { ok: true, value: { day, kg: value, replaced: true } };
      } catch (retryErr) {
        return writeError("logWeightCore", retryErr);
      }
    }
    return writeError("logWeightCore", err);
  }
}

/** Removes the reading of a life day (no reading there is not an error). */
export async function deleteWeightCore(userId: string, day: DayKey): Promise<WeightResult<null>> {
  // Any real day may be cleared, even one older than the log window.
  if (!isDayKey(day)) return { ok: false, error: "That isn't a date." };
  try {
    await prisma.bodyWeight.deleteMany({ where: { userId, day: dateColumn(day) } });
    invalidate("weight");
    return { ok: true, value: null };
  } catch (err) {
    return writeError("deleteWeightCore", err);
  }
}

/**
 * Sets the display unit, the target and its day. Setting or changing the
 * target records today's trend (or the latest reading) as its start; null
 * clears the target, its day and its start. A target day needs a target and
 * must be after today.
 */
export async function setWeightGoalCore(
  userId: string,
  input: { unit?: WeightUnit; targetKg?: number | null; targetDay?: DayKey | null },
  now: Date = new Date()
): Promise<WeightResult<WeightGoalView>> {
  const today = todayKey(now);
  if (input.unit !== undefined && !isWeightUnit(input.unit)) return { ok: false, error: "Pick kg or lb." };

  let target: number | null | undefined = undefined;
  if (input.targetKg === null) target = null;
  else if (input.targetKg !== undefined) {
    target = typeof input.targetKg === "number" ? clampKg(input.targetKg) : null;
    if (target === null) return { ok: false, error: OUT_OF_RANGE };
  }
  if (input.targetDay !== undefined && input.targetDay !== null) {
    const err = targetDayError(input.targetDay, today);
    if (err) return { ok: false, error: err };
  }

  try {
    const [current, readings] = await Promise.all([readGoal(userId), readReadings(userId, today)]);
    const next: WeightGoalView = { ...current };
    if (input.unit !== undefined) next.unit = input.unit;

    if (target === null) {
      next.targetKg = null;
      next.targetDay = null;
      next.startKg = null;
      next.startDay = null;
    } else if (target !== undefined && target !== current.targetKg) {
      const view = weightView(readings, current, today);
      next.targetKg = target;
      next.startKg = view.trendKg ?? view.latest?.kg ?? null;
      next.startDay = today;
    }

    if (input.targetDay !== undefined) {
      if (input.targetDay !== null && next.targetKg === null) return { ok: false, error: "Set a target weight first." };
      next.targetDay = input.targetDay;
    }

    const data = {
      unit: next.unit,
      targetKg: next.targetKg === null ? null : toDecimal(next.targetKg),
      targetDay: next.targetDay === null ? null : dateColumn(next.targetDay),
      startKg: next.startKg === null ? null : toDecimal(next.startKg),
      startDay: next.startDay === null ? null : dateColumn(next.startDay),
    };
    await prisma.weightGoal.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    invalidate("weight");
    return { ok: true, value: next };
  } catch (err) {
    return writeError("setWeightGoalCore", err);
  }
}
