/**
 * Review fatigue's write and read (blueprint 3.3b; plan P30; decision D26). Server only; the rules are review-fatigue.ts.
 *
 *   applyReviewFatigue(client, userId, now, opts?)   after every landed answer (srs.ts applyReviewResult's after()):
 *                                                     once the day's REVIEW rows reach FATIGUE_ANSWERS, writes the day's
 *                                                     one FATIGUED row (its id the day's key); nothing at once, with no
 *                                                     read, while FATIGUE_LAUNCH_DAY is not in force or writes are off
 *   loadFatigue(client, userId, now, opts?)          the fatigue in effect, for the phone's /review/queue and /check:
 *                                                     undefined at once (no read) while not in force, else {until} | null
 *
 * The apply's read is one wave: the day's REVIEW count and the day's key, together. A REVIEW row is one answer, a pass
 * or a miss alike (a FORGET row, a card forgotten while overdue, is not one), so the count is the answers and nothing
 * else. The write is the debuff's own row (applyDebuff's shape: FATIGUED's magnitude and duration from DEBUFF_META), with
 * the day's key as its id: a second apply the same day, from a race or any later answer, finds the key or fails on it
 * (P2002), and writes nothing. It never throws for that; any other failure is the caller's to log (an answer's points are
 * already in by then). Like every new write it sits behind lifeWritesEnabled (dev and prod share one database).
 */
import type { PrismaClient } from "@prisma/client";
import { invalidate as invalidateCache } from "./cache";
import { dateColumn, todayKey, type DayKey } from "./life-day";
import { lifeWritesEnabled } from "./life-economy";
import {
  FATIGUE_KIND,
  FATIGUE_MAGNITUDE,
  fatigueDueOf,
  fatigueIdOf,
  fatigueLaunchDay,
  fatigueOn,
  fatigueReasonOf,
  fatigueUntilOf,
  type FatigueRead,
} from "./review-fatigue";

/** The Prisma surface both use: the real client, or a check's stub. */
export type FatigueClient = Pick<PrismaClient, "activityEvent" | "activeDebuff">;

export interface FatigueOptions {
  /** FATIGUE_LAUNCH_DAY in force (default fatigueLaunchDay()). */
  launch?: DayKey | null;
  /** May this server write (default lifeWritesEnabled()). */
  writes?: boolean;
  /** The cache's invalidate (default cache.ts's): the progression folds the new row on its next read. */
  invalidate?: (tag: "progress") => void;
}

export type FatigueApplied =
  | { status: "off" }
  | { status: "writes-off" }
  | { status: "under"; answers: number }
  | { status: "already"; answers: number }
  | { status: "applied"; answers: number; until: Date };

/** A unique violation (P2002), duck-typed so a check's stub can raise one. */
function keyTaken(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * The day's check after an answer landed: applies Fatigued once the day's answers reach FATIGUE_ANSWERS, once a day.
 * Off (no launch day, or before it) or with writes off it returns at once and reads nothing.
 */
export async function applyReviewFatigue(client: FatigueClient, userId: string, now: Date, opts: FatigueOptions = {}): Promise<FatigueApplied> {
  const day = todayKey(now);
  const launch = opts.launch === undefined ? fatigueLaunchDay() : opts.launch;
  if (!fatigueOn(day, launch)) return { status: "off" };
  if (!(opts.writes ?? lifeWritesEnabled())) return { status: "writes-off" };
  const id = fatigueIdOf(userId, day);
  const [answers, key] = await Promise.all([
    client.activityEvent.count({ where: { userId, source: "REVIEW", day: dateColumn(day) } }),
    client.activeDebuff.findUnique({ where: { id }, select: { id: true } }),
  ]);
  if (!fatigueDueOf({ on: true, answers, applied: key != null })) return key != null ? { status: "already", answers } : { status: "under", answers };
  const until = fatigueUntilOf(now);
  try {
    await client.activeDebuff.create({
      data: { id, userId, kind: FATIGUE_KIND, magnitude: FATIGUE_MAGNITUDE, reason: fatigueReasonOf(day), expiresAt: until },
    });
  } catch (err) {
    // Another answer's check took the day's key first: what it wrote stands.
    if (keyTaken(err)) return { status: "already", answers };
    throw err;
  }
  (opts.invalidate ?? invalidateCache)("progress");
  return { status: "applied", answers, until };
}

/** The fatigue in effect for the phone (the FATIGUED row that lifts last); undefined at once, with no read, while off. */
export async function loadFatigue(client: FatigueClient, userId: string, now: Date, opts: Pick<FatigueOptions, "launch"> = {}): Promise<FatigueRead> {
  const launch = opts.launch === undefined ? fatigueLaunchDay() : opts.launch;
  if (!fatigueOn(todayKey(now), launch)) return undefined;
  const row = await client.activeDebuff.findFirst({
    where: { userId, kind: FATIGUE_KIND, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
    select: { expiresAt: true },
  });
  return row ? { until: new Date(row.expiresAt) } : null;
}
