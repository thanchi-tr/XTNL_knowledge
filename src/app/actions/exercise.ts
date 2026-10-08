"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { deleteExerciseCore, logWalkCore, type ExerciseResult } from "@/lib/exercise-server";
import type { ExerciseSessionView } from "@/lib/exercise";

/**
 * Train › Exercise: log a walk (incline angle, distance, duration) and take one back. A record, never a reward: none
 * of these pays XP or MP, ticks a streak or returns a celebration. The input is checked again in the core
 * (exercise.ts cleanWalkInput); each answers { ok, value } or { ok: false, error } and never throws. Both re-render the
 * current route.
 */
async function run<T>(label: string, fn: (userId: string) => Promise<ExerciseResult<T>>): Promise<ExerciseResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

export interface LogWalkInput {
  /** A life day; today when omitted. */
  day?: string;
  /** Degrees, 0 = flat. */
  angleDeg: number;
  distanceKm: number;
  durationMin: number;
  note?: string;
}

export async function logWalk(input: LogWalkInput): Promise<ExerciseResult<ExerciseSessionView>> {
  return run("logWalk", async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to log." };
    return logWalkCore(userId, input);
  });
}

export async function deleteExercise(id: string): Promise<ExerciseResult<null>> {
  return run("deleteExercise", (userId) => deleteExerciseCore(userId, id));
}
