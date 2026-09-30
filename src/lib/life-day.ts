/**
 * The one day clock. Every "day" in the app — todos, the daily streak, the
 * review cutoff, the once-a-day limits, the life ledger — turns over at
 * 04:00 in the user's own time zone, so a late night still belongs to the
 * day it started in and a DST change can never split or merge a day.
 *
 * Pure, dependency-free and client-importable: the server and the browser
 * must agree on which day it is, so the zone is a NEXT_PUBLIC_ variable
 * (inlined at build time) with the user's zone as the default. Nothing here
 * throws.
 *
 * A day is named by its key, 'YYYY-MM-DD': the local calendar date of its
 * 04:00 start. The key is the unit everything else stores and compares;
 * instants are only converted at the edges.
 */

export const LIFE_TZ: string = process.env.NEXT_PUBLIC_USER_TIMEZONE || "Australia/Sydney";

/** The local hour a life day starts. */
export const DAY_START_HOUR = 4;

/** 'YYYY-MM-DD': a life day. */
export type DayKey = string;

const MS_DAY = 86_400_000;

// Intl formatters are costly to build; one per zone.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

interface Wall {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

/** The wall-clock reading of an instant in a zone. */
function wallOf(instant: Date, tz: string): Wall {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(instant)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

/** The zone's offset from UTC at an instant, in minutes (local − UTC). */
function offsetMinutes(instant: Date, tz: string): number {
  const w = wallOf(instant, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const keyOfParts = (y: number, m: number, d: number): DayKey => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

function partsOfKey(key: DayKey): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

/**
 * The instant a local wall-clock time names. Two passes over the offset,
 * so a time either side of a DST change resolves; 04:00 is never inside a
 * transition in any zone this app is used in.
 */
export function zonedToInstant(y: number, m: number, d: number, h: number, tz: string = LIFE_TZ): Date {
  const guess = Date.UTC(y, m - 1, d, h);
  const first = offsetMinutes(new Date(guess), tz);
  let t = guess - first * 60_000;
  const second = offsetMinutes(new Date(t), tz);
  if (second !== first) t = guess - second * 60_000;
  return new Date(t);
}

/**
 * The life day an instant belongs to: its local calendar date, or the day
 * before when the local hour is earlier than 04:00. Reading the local wall
 * clock (rather than subtracting four hours of real time) keeps a DST
 * morning in the right day.
 */
export function dayKeyOf(instant: Date, tz: string = LIFE_TZ): DayKey {
  const w = wallOf(instant, tz);
  if (w.h >= DAY_START_HOUR) return keyOfParts(w.y, w.m, w.d);
  const prev = new Date(Date.UTC(w.y, w.m - 1, w.d) - MS_DAY);
  return keyOfParts(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
}

/** Today's key. */
export function todayKey(now: Date = new Date(), tz: string = LIFE_TZ): DayKey {
  return dayKeyOf(now, tz);
}

/** Calendar arithmetic on keys; DST never enters into it. */
export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = partsOfKey(key);
  const t = new Date(Date.UTC(y, m - 1, d) + n * MS_DAY);
  return keyOfParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = partsOfKey(a);
  const [by, bm, bd] = partsOfKey(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_DAY);
}

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(key: DayKey): number {
  const [y, m, d] = partsOfKey(key);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** When a life day starts: 04:00 local on its date. */
export function dayStartOf(key: DayKey, tz: string = LIFE_TZ): Date {
  const [y, m, d] = partsOfKey(key);
  return zonedToInstant(y, m, d, DAY_START_HOUR, tz);
}

/** When a life day ends: the next day's start (23, 24 or 25 hours later). */
export function dayEndOf(key: DayKey, tz: string = LIFE_TZ): Date {
  return dayStartOf(addDays(key, 1), tz);
}

/** The Monday key of the life week a day is in. */
export function weekStartKeyOf(key: DayKey): DayKey {
  return addDays(key, 1 - weekdayOf(key));
}

/** When the life week an instant is in started: Monday 04:00 local. */
export function weekStartOf(now: Date = new Date(), tz: string = LIFE_TZ): Date {
  return dayStartOf(weekStartKeyOf(dayKeyOf(now, tz)), tz);
}

/** The ISO week a life day falls in, e.g. '2026-W41'. */
export function weekKeyOf(key: DayKey): string {
  // ISO 8601: the week belongs to the year its Thursday is in.
  const thursday = addDays(key, 4 - weekdayOf(key));
  const [ty] = partsOfKey(thursday);
  const week = Math.floor(daysBetween(keyOfParts(ty, 1, 1), thursday) / 7) + 1;
  return `${ty}-W${pad(week)}`;
}

/** The value for a Prisma @db.Date column: UTC midnight of the key's date. */
export function dateColumn(key: DayKey): Date {
  const [y, m, d] = partsOfKey(key);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The key a @db.Date column holds. */
export function keyOfDateColumn(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

/** The key of the local calendar month, 'YYYY-MM', for a life day. */
export function monthKeyOf(key: DayKey): string {
  return key.slice(0, 7);
}
