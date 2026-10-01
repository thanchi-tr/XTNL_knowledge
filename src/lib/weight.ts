/**
 * Body weight: the pure rules. A record, never a reward — nothing here pays
 * XP or MP, and the economy never reads it.
 *
 * Readings are kept in kilograms (two decimals); the unit is display only.
 * One reading per life day (BodyWeight @@unique([userId, day])).
 *
 * THE TREND (what the card leads with, because a single morning swings by
 * a kilo of water): an exponentially smoothed average of the daily readings
 * (TREND_ALPHA per day; a gap of n days decays by (1-α)^n, so missing days
 * neither stall nor jump it). The weekly rate is the slope of a least-squares
 * line through the trend over the last RATE_WINDOW_DAYS. The projection to a
 * target is honest: it needs MIN_READINGS_FOR_RATE readings in that window
 * and a rate heading toward the target faster than FLAT_KG_PER_WEEK; otherwise
 * it says why there is no date.
 *
 * Contract (frozen; lanes implement the STUBs):
 *   constants  KG_PER_LB, MIN_KG, MAX_KG, TREND_ALPHA, RATE_WINDOW_DAYS,
 *              MIN_READINGS_FOR_RATE, FLAT_KG_PER_WEEK, SAFE_LOSS_KG_PER_WEEK
 *   types      WeightUnit, WeightReading, WeightGoalView, WeightTrendPoint,
 *              WeightRate, WeightProjection, WeightView, ParsedWeightLine
 *   pure       toKg, fromKg, roundKg, formatWeight, clampKg,
 *              trendSeries, weeklyRate, projectTarget, progressToTarget,
 *              weightView, parseWeightLine
 */
import { addDays, daysBetween, type DayKey } from "./life-day";

export type WeightUnit = "kg" | "lb";

export const KG_PER_LB = 0.45359237;
/** Readings outside this range are refused (typos like 724 for 72.4). */
export const MIN_KG = 20;
export const MAX_KG = 400;
/** Daily smoothing weight of the trend (≈ a 10-day average). */
export const TREND_ALPHA = 0.1;
/** The weekly rate is fitted over this many days of trend. */
export const RATE_WINDOW_DAYS = 28;
/** Fewer readings than this in the window: no rate and no projection ('calibrating'). */
export const MIN_READINGS_FOR_RATE = 5;
/** A trend moving slower than this (kg per week) counts as flat: no projected date. */
export const FLAT_KG_PER_WEEK = 0.05;
/** Faster loss than this (kg per week) gets a gentle note (≈ 1 % of body weight for most adults; shown, never enforced). */
export const SAFE_LOSS_KG_PER_WEEK = 1;

export interface WeightReading {
  day: DayKey;
  kg: number;
  source: "manual" | "capture" | "import";
  note?: string | null;
}

export interface WeightGoalView {
  unit: WeightUnit;
  targetKg: number | null;
  targetDay: DayKey | null;
  startKg: number | null;
  startDay: DayKey | null;
}

export interface WeightTrendPoint {
  day: DayKey;
  /** The day's reading, or null on a day with none. */
  kg: number | null;
  /** The smoothed trend on that day. */
  trendKg: number;
}

export type WeightRate =
  | { kind: "calibrating"; readings: number; need: number }
  | { kind: "rate"; kgPerWeek: number };

export type WeightProjection =
  | { kind: "none"; why: "no-target" | "calibrating" | "flat" | "away" | "reached" }
  | { kind: "date"; day: DayKey; weeks: number; onTrackForTargetDay: boolean | null };

/** Everything the card and Today need, from readings + goal + today. */
export interface WeightView {
  unit: WeightUnit;
  latest: WeightReading | null;
  /** Today's trend (null with no readings). */
  trendKg: number | null;
  /** Trend change over the last 7 days (null with under 2 readings). */
  change7Kg: number | null;
  rate: WeightRate;
  goal: WeightGoalView;
  /** 0..1 from startKg toward targetKg along the trend; null without a target or a start. */
  progress: number | null;
  projection: WeightProjection;
  /** The last 90 days, oldest first, for the chart. */
  series: WeightTrendPoint[];
  /** Logged today already (the form says 'Update today'). */
  loggedToday: boolean;
  /** A note when the loss is faster than SAFE_LOSS_KG_PER_WEEK. */
  fastLossNote: string | null;
}

/** A capture line that is a weigh-in, not a task: 'weight 72.4', 'w 72.4kg', '72.4 kg', 'weight 160 lb yesterday'. */
export interface ParsedWeightLine {
  kg: number;
  /** The unit the line was typed in (for the toast), or null when it had none (the user's unit applies). */
  typedUnit: WeightUnit | null;
  day: DayKey;
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

export function roundKg(kg: number): number {
  return Math.round(kg * 100) / 100;
}

/** null when out of [MIN_KG, MAX_KG] or not finite. */
export function clampKg(kg: number): number | null {
  return Number.isFinite(kg) && kg >= MIN_KG && kg <= MAX_KG ? roundKg(kg) : null;
}

/** '72.4 kg' / '159.6 lb' (one decimal). */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${fromKg(kg, unit).toFixed(1)} ${unit}`;
}

// ── Lane A: limits the server and the actions share ─────────────────────────

/** The trend counts as at the target within this many kg (a morning's water is more). */
export const REACHED_WITHIN_KG = 0.2;
/** Days of trend the card's chart shows. */
export const SERIES_DAYS = 90;
/** A weigh-in may be logged for today or up to this many days back. */
export const MAX_BACKDATE_DAYS = 365;
/** A target day may be at most this many days ahead. */
export const MAX_TARGET_DAYS_AHEAD = 1825;
/** A projection further out than this is not a projection: it reads as 'flat'. */
export const MAX_PROJECTION_WEEKS = 104;
/** A reading's note is cut to this many characters. */
export const MAX_NOTE_CHARS = 200;

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === "kg" || value === "lb";
}

/** A real calendar date 'YYYY-MM-DD' (2026-02-30 is not one). */
export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1970 && year <= 2999 && addDays(value, 0) === value;
}

/** Why a weigh-in can't be booked on this day, or null when it can (today, or up to a year back). */
export function logDayError(day: unknown, today: DayKey): string | null {
  if (!isDayKey(day)) return "That isn't a date.";
  if (day > today) return "A weigh-in can't be logged ahead of time.";
  if (daysBetween(day, today) > MAX_BACKDATE_DAYS) return "That's more than a year back.";
  return null;
}

/** Why this can't be a target day, or null when it can (after today, within five years). */
export function targetDayError(day: unknown, today: DayKey): string | null {
  if (!isDayKey(day)) return "That isn't a date.";
  if (day <= today) return "Pick a day after today.";
  if (daysBetween(today, day) > MAX_TARGET_DAYS_AHEAD) return "Pick a day within five years.";
  return null;
}

/** A trimmed note of at most MAX_NOTE_CHARS, or null. */
export function cleanNote(note: unknown): string | null {
  if (typeof note !== "string") return null;
  const t = note.trim().slice(0, MAX_NOTE_CHARS).trim();
  return t.length > 0 ? t : null;
}

/** Two decimals, and never -0. */
const round2 = (n: number): number => Math.round(n * 100) / 100 || 0;

/** The usable readings up to today: valid days and weights, oldest first, the last one of a day kept. */
function normalize(readings: readonly WeightReading[], today: DayKey): WeightReading[] {
  const byDay = new Map<DayKey, WeightReading>();
  for (const r of readings) {
    if (!isDayKey(r.day) || r.day > today || !Number.isFinite(r.kg) || r.kg <= 0) continue;
    byDay.set(r.day, r);
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

interface RawTrendDay {
  day: DayKey;
  kg: number | null;
  trend: number;
}

/**
 * Every day from the first reading through `to`, with the unrounded trend.
 * The first reading seeds it; a reading n days after the previous one moves
 * it by 1 − (1 − α)^n of the gap; a day with no reading carries it.
 */
function trendDays(sorted: readonly WeightReading[], to: DayKey): RawTrendDay[] {
  if (sorted.length === 0) return [];
  const first = sorted[0].day;
  const span = daysBetween(first, to);
  const out: RawTrendDay[] = [];
  let i = 0;
  let trend = sorted[0].kg;
  let lastDay = first;
  for (let k = 0; k <= span; k++) {
    const day = addDays(first, k);
    let kg: number | null = null;
    if (i < sorted.length && sorted[i].day === day) {
      kg = sorted[i].kg;
      if (i > 0) trend += (1 - Math.pow(1 - TREND_ALPHA, daysBetween(lastDay, day))) * (kg - trend);
      lastDay = day;
      i++;
    }
    out.push({ day, kg, trend });
  }
  return out;
}

/**
 * The last `days` days of trend ending today, oldest first, starting no
 * earlier than the first reading. Weights rounded to two decimals.
 */
export function trendSeries(readings: readonly WeightReading[], today: DayKey, days: number): WeightTrendPoint[] {
  const n = Math.floor(days);
  if (!(n > 0)) return [];
  return trendDays(normalize(readings, today), today)
    .slice(-n)
    .map((p) => ({ day: p.day, kg: p.kg === null ? null : roundKg(p.kg), trendKg: roundKg(p.trend) }));
}

/**
 * The trend's slope in kg per week: a least-squares line through the daily
 * trend over the last RATE_WINDOW_DAYS, up to the last reading in it (a
 * carried tail after the last weigh-in holds no news, so it does not pull
 * the slope toward zero). Under MIN_READINGS_FOR_RATE readings in the window
 * it is 'calibrating'.
 */
export function weeklyRate(readings: readonly WeightReading[], today: DayKey): WeightRate {
  const sorted = normalize(readings, today);
  const windowStart = addDays(today, -(RATE_WINDOW_DAYS - 1));
  const inWindow = sorted.filter((r) => r.day >= windowStart);
  if (inWindow.length < MIN_READINGS_FOR_RATE) {
    return { kind: "calibrating", readings: inWindow.length, need: MIN_READINGS_FOR_RATE };
  }
  const pts = trendDays(sorted, inWindow[inWindow.length - 1].day).filter((p) => p.day >= windowStart);
  const xs = pts.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / pts.length;
  const meanY = pts.reduce((s, p) => s + p.trend, 0) / pts.length;
  let num = 0;
  let den = 0;
  pts.forEach((p, i) => {
    num += (i - meanX) * (p.trend - meanY);
    den += (i - meanX) * (i - meanX);
  });
  const perDay = den > 0 ? num / den : 0;
  return { kind: "rate", kgPerWeek: round2(perDay * 7) };
}

/**
 * When the trend reaches the target at the current rate — or why there is
 * no date: no target, too few readings ('calibrating'), already there
 * ('reached': within REACHED_WITHIN_KG, or past it in the goal's direction),
 * slower than FLAT_KG_PER_WEEK or further out than MAX_PROJECTION_WEEKS
 * ('flat'), or moving the other way ('away').
 */
export function projectTarget(trendKg: number | null, rate: WeightRate, goal: WeightGoalView, today: DayKey): WeightProjection {
  const target = goal.targetKg;
  if (target === null || !Number.isFinite(target)) return { kind: "none", why: "no-target" };
  if (trendKg === null || !Number.isFinite(trendKg)) return { kind: "none", why: "calibrating" };

  const from = goal.startKg ?? trendKg;
  const direction = Math.sign(target - from) || Math.sign(target - trendKg);
  const needed = target - trendKg;
  if (
    Math.abs(needed) <= REACHED_WITHIN_KG + 1e-9 ||
    (direction < 0 && trendKg <= target) ||
    (direction > 0 && trendKg >= target)
  ) {
    return { kind: "none", why: "reached" };
  }
  if (rate.kind === "calibrating") return { kind: "none", why: "calibrating" };
  if (Math.abs(rate.kgPerWeek) < FLAT_KG_PER_WEEK) return { kind: "none", why: "flat" };
  if (Math.sign(rate.kgPerWeek) !== Math.sign(needed)) return { kind: "none", why: "away" };

  const weeks = needed / rate.kgPerWeek;
  if (weeks > MAX_PROJECTION_WEEKS) return { kind: "none", why: "flat" };
  const day = addDays(today, Math.ceil(weeks * 7));
  return {
    kind: "date",
    day,
    weeks: Math.round(weeks * 10) / 10,
    onTrackForTargetDay: goal.targetDay ? day <= goal.targetDay : null,
  };
}

/** 0..1 from startKg toward targetKg along the trend; null without a target, a start or a trend. */
export function progressToTarget(trendKg: number | null, goal: WeightGoalView): number | null {
  const { targetKg, startKg } = goal;
  if (targetKg === null || startKg === null || trendKg === null) return null;
  if (![targetKg, startKg, trendKg].every(Number.isFinite)) return null;
  const total = targetKg - startKg;
  if (Math.abs(total) < 1e-9) return Math.abs(trendKg - targetKg) <= REACHED_WITHIN_KG + 1e-9 ? 1 : 0;
  return Math.min(1, Math.max(0, (trendKg - startKg) / total));
}

/**
 * The card's whole view. A goal with a target but no recorded start (it was
 * set before any weigh-in) starts from the first reading on or after its
 * startDay.
 */
export function weightView(readings: readonly WeightReading[], goal: WeightGoalView, today: DayKey): WeightView {
  const sorted = normalize(readings, today);
  const all = trendDays(sorted, today);
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const trendKg = all.length > 0 ? roundKg(all[all.length - 1].trend) : null;

  let change7Kg: number | null = null;
  if (sorted.length >= 2 && all.length > 0) {
    const weekAgo = addDays(today, -7);
    const base = all.find((p) => p.day === weekAgo) ?? all[0];
    change7Kg = round2(all[all.length - 1].trend - base.trend);
  }

  let effective = goal;
  if (goal.targetKg !== null && goal.startKg === null && goal.startDay !== null) {
    const first = sorted.find((r) => r.day >= goal.startDay!);
    if (first) effective = { ...goal, startKg: roundKg(first.kg) };
  }

  const rate = weeklyRate(sorted, today);
  const fastLossNote =
    rate.kind === "rate" && rate.kgPerWeek < -SAFE_LOSS_KG_PER_WEEK
      ? `The trend is down ${formatWeight(-rate.kgPerWeek, goal.unit)} a week, quicker than the ${formatWeight(SAFE_LOSS_KG_PER_WEEK, goal.unit)} a week often suggested as a steady pace.`
      : null;

  return {
    unit: goal.unit,
    latest,
    trendKg,
    change7Kg,
    rate,
    goal: effective,
    progress: progressToTarget(trendKg, effective),
    projection: projectTarget(trendKg, rate, effective, today),
    series: all
      .slice(-SERIES_DAYS)
      .map((p) => ({ day: p.day, kg: p.kg === null ? null : roundKg(p.kg), trendKg: roundKg(p.trend) })),
    loggedToday: latest?.day === today,
    fastLossNote,
  };
}

/**
 * STUB: lane B implements. A whole-line weigh-in, or null (then the line is
 * an ordinary capture). Only an exact shape counts — 'weight training 60m'
 * and 'buy 2kg rice' stay tasks. `unit` is the user's unit for a bare number.
 */
export function parseWeightLine(text: string, today: DayKey, unit: WeightUnit): ParsedWeightLine | null {
  if (typeof text !== "string" || text.length > WEIGH_IN_MAX_CHARS) return null;
  const line = text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  const m = WEIGH_IN_WORD_RE.exec(line) ?? WEIGH_IN_BARE_RE.exec(line);
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  const typedUnit: WeightUnit | null = m[2] ? (m[2].startsWith("lb") ? "lb" : "kg") : null;
  const kg = clampKg(toKg(value, typedUnit ?? unit));
  if (kg === null) return null;
  const day = m[3] && YESTERDAY_WORDS.has(m[3]) ? dayBeforeKey(today) : today;
  if (day === null) return null;
  return { kg, typedUnit, day };
}

// ── parseWeightLine's grammar (private) ──────────────────────────────────
//
// The whole line, and nothing else, after NFC, trimming, single spaces and
// lower case:
//   <word>[:] <number>[ ]<unit>?[ <day>]   word: weight | weigh | wt | w |
//                                          cân | cân nặng | can nặng | can nang
//   <number>[ ]<unit>[ <day>]              a bare reading needs its unit
// number: digits with an optional decimal point or comma ('72,4'); unit:
// kg | kgs | lb | lbs (none: the user's unit); day: today | hôm nay |
// hom nay (today) or yesterday | yday | hôm qua | hom qua (the life day
// before). Plain 'can' is not a word here: it is English. Anything after the
// reading ('weight training 60m', 'w 5 sets', 'buy 2kg rice') is a task.

const WEIGH_IN_MAX_CHARS = 64;
const WEIGH_IN_NUM = "(\\d+(?:[.,]\\d+)?)";
const WEIGH_IN_UNIT = "(kgs?|lbs?)";
const WEIGH_IN_DAY = "(?: (today|hôm nay|hom nay|yesterday|yday|hôm qua|hom qua))?";
const WEIGH_IN_WORD_RE = new RegExp(`^(?:weight|weigh|wt|w|cân nặng|can nặng|can nang|cân)(?: ?: ?| )${WEIGH_IN_NUM} ?${WEIGH_IN_UNIT}?${WEIGH_IN_DAY}$`, "u");
const WEIGH_IN_BARE_RE = new RegExp(`^${WEIGH_IN_NUM} ?${WEIGH_IN_UNIT}${WEIGH_IN_DAY}$`, "u");
const YESTERDAY_WORDS: ReadonlySet<string> = new Set(["yesterday", "yday", "hôm qua", "hom qua"]);

/** The calendar day before a 'YYYY-MM-DD' key (a life day's key is its calendar date), or null for a malformed key. */
function dayBeforeKey(key: DayKey): DayKey | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1));
  return d.toISOString().slice(0, 10);
}
