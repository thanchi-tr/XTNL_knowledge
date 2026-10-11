"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { deleteExerciseCore, logWalkMomentsCore, type ExerciseResult, type LoggedWalk } from "@/lib/exercise-server";
import type { WalkDeleteOutcome } from "@/lib/exercise";
import type { CelebrationEvent } from "@/lib/celebration-types";

/**
 * Train › Exercise: log a walk (incline angle, distance, duration) and take one back. Before MOMENTUM_LAUNCH_DAY a
 * record, never a reward: none of these pays XP or MP, ticks a streak or returns a celebration. On a live day
 * (momentum.md §A.6, §A.7) a walk dated today or yesterday pays BODY XP through the daily knee, may write personal
 * bests and returns its moments as `celebrations` (the card presents the T2/T3s); a delete on the day it was logged
 * takes the pay back. The input is checked again in the core (exercise.ts cleanWalkInput); each answers { ok, value }
 * or { ok: false, error } and never throws. Both re-render the current route.
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
  /** Live days only: the personal EXERCISE habit this walk counts as (a walk dated today). Ignored before launch. */
  countsAs?: string | null;
}

export async function logWalk(input: LogWalkInput): Promise<ExerciseResult<LoggedWalk & { celebrations?: CelebrationEvent[] }>> {
  return run("logWalk", async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to log." };
    const countsAs = typeof input.countsAs === "string" && input.countsAs.length > 0 && input.countsAs.length <= 64 ? input.countsAs : null;
    return logWalkMomentsCore(userId, input, new Date(), { countsAs });
  });
}

export async function deleteExercise(id: string): Promise<ExerciseResult<WalkDeleteOutcome | null>> {
  return run("deleteExercise", (userId) => deleteExerciseCore(userId, id));
}
