import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { loadFieldFocus } from "@/lib/field-focus";
import { loadDailyFocus } from "@/lib/daily-focus";
import { loadProgression } from "@/lib/skill-effects";
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
    prisma.lifeSettings.findUnique({ where: { userId }, select: { dailyCapacityMin: true, capacitySetAt: true } }),
    loadFieldFocus(userId),
    loadProgression(userId),
  ]);
  const focus = await loadDailyFocus(userId, progression.activeSkills);

  const data: SettingsData = {
    capacity: { minutes: life?.dailyCapacityMin ?? DEFAULT_CAPACITY_MIN, set: Boolean(life?.capacitySetAt) },
    focus: focus && focus.multiplier > 1 ? { fieldName: focus.fieldName, multiplier: focus.multiplier } : null,
    fields,
  };

  return (
    <div className="page cq-main set-page">
      <SettingsView data={data} />
    </div>
  );
}
