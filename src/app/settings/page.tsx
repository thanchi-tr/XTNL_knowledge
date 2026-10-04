import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { loadFieldFocus } from "@/lib/field-focus";
import { loadDailyFocus } from "@/lib/daily-focus";
import { loadProgression } from "@/lib/skill-effects";
import { dutyLaunchDay } from "@/lib/duty-economy";
import { todayKey } from "@/lib/life-day";
import { SettingsView, type SettingsData } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

/** The default capacity when LifeSettings has no row or no choice yet (tasks.ts reads the same). */
const DEFAULT_CAPACITY_MIN = 240;

/**
 * You › Settings: Feedback (per-person prefs, and per-device sound and
 * haptics), Days, Study and data (Fields of interest, and Settings › Data:
 * Recompute attribution and the resets, which moved here from the old
 * Taxonomy page), How XP works.
 */
export default async function SettingsPage() {
  const userId = getCurrentUserId();
  const [life, fields, progression] = await Promise.all([
    prisma.lifeSettings.findUnique({ where: { userId }, select: { dailyCapacityMin: true, capacitySetAt: true, debtWriteOff: true } }),
    loadFieldFocus(userId),
    loadProgression(userId),
  ]);
  const focus = await loadDailyFocus(userId, progression.activeSkills);

  const data: SettingsData = {
    capacity: { minutes: life?.dailyCapacityMin ?? DEFAULT_CAPACITY_MIN, set: Boolean(life?.capacitySetAt) },
    focus: focus && focus.multiplier > 1 ? { fieldName: focus.fieldName, multiplier: focus.multiplier } : null,
    fields,
    // Duty (M2): Settings › Days shows the live rows (Time off on Today, Accept a loss) once the
    // launch day is reached, and 'From Mon 12 Oct' while it is ahead. The launch day is the
    // server's (the browser cannot see XTNL_DUTY_LAUNCH_DAY), read per request.
    duty: { today: todayKey(), launchDay: dutyLaunchDay(), debtWriteOff: life?.debtWriteOff ?? false },
  };

  // layout.tsx is the page and the `main` container (with the You tabs on compact).
  return (
    <div className="set-page">
      <SettingsView data={data} />
    </div>
  );
}
