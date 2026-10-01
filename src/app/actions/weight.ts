"use server";

import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { todayKey, type DayKey } from "@/lib/life-day";
import { clampKg, cleanNote, isDayKey, isWeightUnit, logDayError, targetDayError, toKg, type WeightGoalView, type WeightUnit } from "@/lib/weight";
import {
  deleteWeightCore,
  loadWeightGoal,
  logWeightCore,
  OUT_OF_RANGE,
  setWeightGoalCore,
  type WeightResult,
} from "@/lib/weight-server";

/**
 * The weight actions: log a weigh-in, take one back, set the unit and the
 * target. A record, never a reward — none of these pays XP or MP, ticks a
 * streak or returns a celebration.
 *
 * Nothing the browser sends is trusted: every number is checked finite and
 * clamped to [MIN_KG, MAX_KG] here (clampKg, after converting from the unit),
 * the unit must be 'kg' or 'lb', a log day must be a real life day that is
 * not in the future and at most a year back, and a target day must be after
 * today. The cores (src/lib/weight-server.ts) check again. The writes
 * invalidate the process cache's 'weight' tag (that is this codebase's
 * revalidateTag); like the task actions, `{ refresh: true }` also re-renders
 * the current route in the same response. Each returns { ok, value } or
 * { ok: false, error } and never throws.
 */

export interface WeightActionOptions {
  /** Re-render the current route in this response (the card sets it). */
  refresh?: boolean;
}

export interface LogWeightInput {
  /** The weight in `unit` (or the user's display unit when omitted). */
  value: number;
  unit?: WeightUnit;
  /** A life day; today when omitted. */
  day?: DayKey;
  note?: string;
}

export interface SetWeightGoalInput {
  /** The display unit. */
  unit?: WeightUnit;
  /** The target in kg; null clears the target (and its day and start). */
  targetKg?: number | null;
  /** Or the target in `unit` (the stored unit when omitted), as typed; null clears. Not with targetKg. */
  target?: number | null;
  /** A life day after today to reach it by; null clears. */
  targetDay?: DayKey | null;
}

async function run<T>(label: string, opts: WeightActionOptions | undefined, fn: (userId: string) => Promise<WeightResult<T>>): Promise<WeightResult<T>> {
  try {
    const res = await fn(getCurrentUserId());
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return { ok: false, error: "Couldn't save that. Try again." };
  }
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Logs today's (or a recent day's) weigh-in. Logging a day again replaces its reading. */
export async function logWeight(
  input: LogWeightInput,
  opts?: WeightActionOptions
): Promise<WeightResult<{ day: DayKey; kg: number; replaced: boolean }>> {
  return run("logWeight", opts, async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "No weight given." };
    if (!isNumber(input.value)) return { ok: false, error: "That isn't a number." };
    if (input.unit !== undefined && !isWeightUnit(input.unit)) return { ok: false, error: "Pick kg or lb." };
    const unit: WeightUnit = input.unit ?? (await loadWeightGoal(userId)).unit;
    const kg = clampKg(toKg(input.value, unit));
    if (kg === null) return { ok: false, error: OUT_OF_RANGE };
    const now = new Date();
    const day = input.day === undefined ? todayKey(now) : input.day;
    const dayError = logDayError(day, todayKey(now));
    if (dayError) return { ok: false, error: dayError };
    const note = cleanNote(input.note) ?? undefined;
    return logWeightCore(userId, kg, { day, source: "manual", note, now });
  });
}

/** Takes back a day's reading. */
export async function deleteWeight(day: DayKey, opts?: WeightActionOptions): Promise<WeightResult<null>> {
  return run("deleteWeight", opts, async (userId) => {
    if (!isDayKey(day)) return { ok: false, error: "That isn't a date." };
    return deleteWeightCore(userId, day);
  });
}

/** Sets the display unit, the target weight and the day to reach it by. Omitted fields stay. */
export async function setWeightGoal(input: SetWeightGoalInput, opts?: WeightActionOptions): Promise<WeightResult<WeightGoalView>> {
  return run("setWeightGoal", opts, async (userId) => {
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to change." };
    if (input.unit !== undefined && !isWeightUnit(input.unit)) return { ok: false, error: "Pick kg or lb." };
    if (input.targetKg !== undefined && input.target !== undefined) return { ok: false, error: "Give the target once." };

    let targetKg: number | null | undefined = undefined;
    const raw = input.targetKg !== undefined ? input.targetKg : input.target;
    if (raw === null) targetKg = null;
    else if (raw !== undefined) {
      if (!isNumber(raw)) return { ok: false, error: "That isn't a number." };
      const unit: WeightUnit = input.targetKg !== undefined ? "kg" : (input.unit ?? (await loadWeightGoal(userId)).unit);
      targetKg = clampKg(toKg(raw, unit));
      if (targetKg === null) return { ok: false, error: OUT_OF_RANGE };
    }

    let targetDay: DayKey | null | undefined = undefined;
    if (input.targetDay === null) targetDay = null;
    else if (input.targetDay !== undefined) {
      const dayError = targetDayError(input.targetDay, todayKey());
      if (dayError) return { ok: false, error: dayError };
      targetDay = input.targetDay;
    }

    return setWeightGoalCore(userId, { unit: input.unit, targetKg, targetDay });
  });
}
