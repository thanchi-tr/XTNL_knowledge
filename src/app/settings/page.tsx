import type { Metadata } from "next";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { loadFieldFocus } from "@/lib/field-focus";
import { loadDailyFocus } from "@/lib/daily-focus";
import { loadProgression } from "@/lib/skill-effects";
import { dutyLaunchDay } from "@/lib/duty-economy";
import { todayKey } from "@/lib/life-day";
import { AIM_PROMPT_COOKIE, isMissingRev4Column } from "@/lib/roadmap-types";
import { aimPromptOf } from "@/lib/roadmap-invite";
import { SettingsView, type SettingsData } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

/** The default capacity when LifeSettings has no row or no choice yet (tasks.ts reads the same). */
const DEFAULT_CAPACITY_MIN = 240;

/**
 * The LifeSettings fields Settings shows, with revision 4's aimSuggestions
 * (roadmap-rev4.md F-R4-5, the stored "Aim suggestions" switch). Code can
 * deploy before migration 20261106000000_life_roadmap_rev4 is applied: a read
 * that fails only because that column is missing (isMissingRev4Column) is
 * read again without it, and the switch then reads as never set (on). Any
 * other error is thrown, as before.
 */
async function loadLifeSettings(userId: string) {
  try {
    return await prisma.lifeSettings.findUnique({ where: { userId }, select: { dailyCapacityMin: true, capacitySetAt: true, debtWriteOff: true, aimSuggestions: true } });
  } catch (err) {
    if (!isMissingRev4Column(err)) throw err;
    const life = await prisma.lifeSettings.findUnique({ where: { userId }, select: { dailyCapacityMin: true, capacitySetAt: true, debtWriteOff: true } });
    return life && { ...life, aimSuggestions: null };
  }
}

/**
 * You › Settings: Feedback (per-person prefs, and per-device sound and
 * haptics), Days, Study and data (Fields of interest, and Settings › Data:
 * Recompute attribution and the resets, which moved here from the old
 * Taxonomy page), How XP works.
 */
export default async function SettingsPage() {
  const userId = getCurrentUserId();
  const [life, fields, progression, jar] = await Promise.all([loadLifeSettings(userId), loadFieldFocus(userId), loadProgression(userId), cookies()]);
  const focus = await loadDailyFocus(userId, progression.activeSkills);
  const today = todayKey();

  const data: SettingsData = {
    capacity: { minutes: life?.dailyCapacityMin ?? DEFAULT_CAPACITY_MIN, set: Boolean(life?.capacitySetAt) },
    focus: focus && focus.multiplier > 1 ? { fieldName: focus.fieldName, multiplier: focus.multiplier } : null,
    fields,
    // Duty (M2): Settings › Days shows the live rows (Time off on Today, Accept a loss) once the
    // launch day is reached, and 'From Mon 12 Oct' while it is ahead. The launch day is the
    // server's (the browser cannot see XTNL_DUTY_LAUNCH_DAY), read per request.
    duty: { today: todayKey(), launchDay: dutyLaunchDay(), debtWriteOff: life?.debtWriteOff ?? false },
    // Aim suggestions (roadmap rev 4, F-R4-5): off when the stored switch is false or a legacy
    // 'off' cookie stands (rev 3's year-long ×, still a no until the switch is turned on, which
    // deletes it). The one rule /you and Today read: roadmap-invite aimPromptOf; a 4-week
    // "Not now" snooze (LATER, or HIDDEN after the line's own × or Today's) is not a no, so the switch reads on.
    aimSuggestions: aimPromptOf(jar.get(AIM_PROMPT_COOKIE)?.value, life?.aimSuggestions ?? null, today) !== "OFF",
  };

  // layout.tsx is the page and the `main` container (with the You tabs on compact).
  return (
    <div className="set-page">
      <SettingsView data={data} />
    </div>
  );
}
