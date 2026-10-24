"use server";

/**
 * Next week's calibration, its one action (blueprint 5.2d; plan P32, decision D36): Accept on a change the "Next week"
 * card lists (components/home/NextWeekCard.tsx). Keep writes nothing: it is the viewer's own note on the card.
 *
 * Same conventions as actions/duty.ts: `{ok, value} | {ok, error}`, never throws, `refresh()` on `{refresh: true}`.
 * It takes only the change's id and reads the rest on the server: this week's frozen calibration, which must list it
 * (lib/week-calibration-server acceptCalibrationCore), then the core the same change runs anywhere else (Settings'
 * capacity, the drawer's 'Not a must', a must made by the step-up under the daily quests' cap).
 */
import { refresh } from "next/cache";
import { getCurrentUserId } from "@/lib/user";
import { acceptCalibrationCore, type CalibrationAccept } from "@/lib/week-calibration-server";

export type CalibrationActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

const SAVE_FAILED = "Couldn't save that. Try again.";

/** Accept one change of this week's calibration (its id: 'capacity', 'ease:<templateId>' or 'step:<templateId>'). */
export async function acceptCalibration(changeId: string, opts?: { refresh?: boolean }): Promise<CalibrationActionResult<CalibrationAccept>> {
  if (typeof changeId !== "string" || changeId.length === 0 || changeId.length > 80) return { ok: false, error: "Nothing was given." };
  try {
    const res = await acceptCalibrationCore(getCurrentUserId(), changeId);
    if (res.ok && opts?.refresh === true) refresh();
    return res;
  } catch (err) {
    console.error("acceptCalibration failed:", err);
    return { ok: false, error: SAVE_FAILED };
  }
}
