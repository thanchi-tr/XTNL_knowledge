/**
 * Exercise sessions: reads and writes (server only). Every read fails soft — the table may be missing on a database
 * the life_exercise_style migration has not reached — and returns the empty view; every write returns
 * { ok: false, error } instead of throwing. Cache tag 'exercise'. A record, never a reward: nothing here touches the
 * ledger, XP, MP, a streak or a celebration.
 *
 *   loadExerciseView(userId, now?)          → ExerciseView (the last EXERCISE_HISTORY_DAYS of sessions, this week's totals)
 *   logWalkCore(userId, raw, now?)          → { ok, value: ExerciseSessionView } | { ok: false, error }
 *   deleteExerciseCore(userId, id)          → { ok } | { ok: false, error }
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { addDays, dateColumn, keyOfDateColumn, todayKey, type DayKey } from "./life-day";
import { cleanWalkInput, exerciseWeekOf, type ExerciseSessionView, type ExerciseWeek } from "./exercise";

export type ExerciseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const EXERCISE_HISTORY_DAYS = 90;
export const EXERCISE_NOT_READY = "Exercise logging needs a one-time database update first.";
const SAVE_FAILED = "Couldn't save that. Try again.";

export interface ExerciseView {
  today: DayKey;
  sessions: ExerciseSessionView[];
  week: ExerciseWeek;
  /** False when the table isn't there yet (the form says so instead of failing on save). */
  ready: boolean;
}

/** The table is not there yet (the migration has not reached this database). */
export function isMissingExerciseTable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /\b(P2021|42P01)\b|(relation|table) [`"][^`"]*ExerciseSession[`"]? does not exist/i.test(message);
}

type Row = { id: string; day: Date; kind: string; angleDeg: number; distanceKm: number; durationMin: number; note: string | null };
const viewOf = (r: Row): ExerciseSessionView => ({
  id: r.id,
  kind: "WALK",
  day: keyOfDateColumn(r.day),
  angleDeg: r.angleDeg,
  distanceKm: r.distanceKm,
  durationMin: r.durationMin,
  note: r.note,
});

export async function loadExerciseView(userId: string, now: Date = new Date()): Promise<ExerciseView> {
  const today = todayKey(now);
  return cached(`exercise:${userId}:${today}`, ["exercise"], async () => {
    try {
      const rows = await prisma.exerciseSession.findMany({
        where: { userId, day: { gte: dateColumn(addDays(today, -EXERCISE_HISTORY_DAYS)) } },
        orderBy: [{ day: "desc" }, { createdAt: "desc" }],
        select: { id: true, day: true, kind: true, angleDeg: true, distanceKm: true, durationMin: true, note: true },
      });
      const sessions = rows.map(viewOf);
      return { today, sessions, week: exerciseWeekOf(sessions, today), ready: true };
    } catch (err) {
      if (!isMissingExerciseTable(err)) console.error("Exercise: the sessions failed to load; showing none.", err);
      return { today, sessions: [], week: exerciseWeekOf([], today), ready: !isMissingExerciseTable(err) };
    }
  });
}

export async function logWalkCore(userId: string, raw: Parameters<typeof cleanWalkInput>[0], now: Date = new Date()): Promise<ExerciseResult<ExerciseSessionView>> {
  const clean = cleanWalkInput(raw, todayKey(now));
  if (!clean.ok) return clean;
  const v = clean.value;
  try {
    const row = await prisma.exerciseSession.create({
      data: { userId, day: dateColumn(v.day), kind: "WALK", angleDeg: v.angleDeg, distanceKm: v.distanceKm, durationMin: v.durationMin, note: v.note },
      select: { id: true, day: true, kind: true, angleDeg: true, distanceKm: true, durationMin: true, note: true },
    });
    invalidate("exercise");
    return { ok: true, value: viewOf(row) };
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    console.error("Exercise: a walk wasn't saved.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}

export async function deleteExerciseCore(userId: string, id: string): Promise<ExerciseResult<null>> {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, error: "That session is no longer here." };
  try {
    const out = await prisma.exerciseSession.deleteMany({ where: { id, userId } });
    invalidate("exercise");
    return out.count > 0 ? { ok: true, value: null } : { ok: false, error: "That session is no longer here." };
  } catch (err) {
    if (isMissingExerciseTable(err)) return { ok: false, error: EXERCISE_NOT_READY };
    console.error("Exercise: a session wasn't deleted.", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
