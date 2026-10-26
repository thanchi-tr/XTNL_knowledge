"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { deleteExerciseCore, deleteSessionCore, logSessionMomentsCore, logWalkMomentsCore, type ExerciseResult, type LoggedSession, type LoggedWalk } from "@/lib/exercise-server";
import type { WalkDeleteOutcome } from "@/lib/exercise";
import type { CelebrationEvent } from "@/lib/celebration-types";

/**
 * Train › Exercise: log a walk (incline angle, distance, duration) and take one back. Before MOMENTUM_LAUNCH_DAY a
 * record, never a reward: none of these pays XP or MP, ticks a streak or returns a celebration. On a live day
 * (momentum.md §A.6, §A.7) a walk dated today or yesterday pays BODY XP through the daily knee, may write personal
 * bests and returns its moments as `celebrations` (the card presents the T2/T3s); a delete on the day it was logged
 * takes the pay back. The input is checked again in the core (exercise.ts cleanWalkInput); each answers { ok, value }
 * or { ok: false, error } and never throws. Each re-renders the current route.
 *
 * Every other kind (health-2026-10-27.md D10-D13): logSession saves a run, a ride, a swim, a row, an elliptical, HIIT
 * or circuit session, a game, yoga or mobility as a RECORD (no ledger row of its own, no pay, no moments of its own),
 * checked again in the core (exercise.ts cleanSessionInput); its "Counts as" ticks the linked habit as a manual tick
 * would, and returns that tick's moments as `celebrations` as a manual tick does (exercise-server
 * logSessionMomentsCore). deleteSession takes one back (nothing was paid, so nothing is reversed). A walk never goes
 * through either.
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

/** A record session as the form sends it: strings or numbers, checked again in the core (cleanSessionInput). */
export interface LogSessionInput {
  kind: string;
  /** A life day; today when omitted. */
  day?: string;
  durationMin?: number | string;
  distanceKm?: number | string;
  /** A swim's or a row's distance in metres. */
  distanceM?: number | string;
  /** A swim's whole lengths, with poolM. */
  lengths?: number | string;
  poolM?: number | string;
  angleDeg?: number | string;
  variant?: string;
  label?: string;
  avgWatts?: number | string;
  avgHr?: number | string;
  maxHr?: number | string;
  sessionRpe?: number | string;
  note?: string;
  /** The form's key for this save: a resend answers the row it wrote, once. */
  clientId?: string;
  /** Live days only: the personal EXERCISE habit this session ticks (a session dated today), at its own price. */
  countsAs?: string | null;
}

export async function logSession(input: LogSessionInput): Promise<ExerciseResult<LoggedSession & { celebrations?: CelebrationEvent[] }>> {
  return run("logSession", async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to log." };
    const { countsAs: asked, ...raw } = input;
    const countsAs = typeof asked === "string" && asked.length > 0 && asked.length <= 64 ? asked : null;
    return logSessionMomentsCore(userId, raw, new Date(), { countsAs });
  });
}

export async function deleteSession(id: string): Promise<ExerciseResult<null>> {
  return run("deleteSession", (userId) => deleteSessionCore(userId, id));
}
