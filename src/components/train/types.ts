import type { DayKey } from "@/lib/life-day";
import type { WeightUnit } from "@/lib/weight";

/** What a weight action answers (lane A's actions return { ok, value } | { ok: false, error }). */
export type WeightActionResult = { ok: true; value?: unknown } | { ok: false; error: string };

/**
 * The card's writes, passed in by the page (the server actions in
 * src/app/actions/weight.ts) or by a fixture (scripts/train-check.ts,
 * /dev/style/train), so the card never imports a server module itself.
 */
export interface WeightActions {
  logWeight: (input: { value: number; unit?: WeightUnit; day?: DayKey; note?: string }, opts?: WeightActionOpts) => Promise<WeightActionResult>;
  deleteWeight: (day: DayKey, opts?: WeightActionOpts) => Promise<WeightActionResult>;
  setWeightGoal: (input: { unit?: WeightUnit; targetKg?: number | null; targetDay?: DayKey | null }, opts?: WeightActionOpts) => Promise<WeightActionResult>;
}

/** `refresh: true` re-renders the route in the action's own response (next/cache refresh(), as Settings and Today do). */
export interface WeightActionOpts {
  refresh?: boolean;
}

export const REFRESH: WeightActionOpts = { refresh: true };

/** `replaced: true` from logWeight's value, when it says so. */
export function wasReplaced(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { replaced?: unknown }).replaced === true;
}
