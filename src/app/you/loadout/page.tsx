import type { Metadata } from "next";
import { describeModifiers } from "@/lib/modifier-display";
import { loadProgression } from "@/lib/skill-effects";
import { getCurrentUserId } from "@/lib/user";
import { SectionHeader } from "@/components/ui/Tabs";
import { LoadoutGrid } from "@/components/skills/LoadoutGrid";
import { LoadoutEffects } from "@/components/skills/ActiveEffects";

export const metadata: Metadata = { title: "Loadout" };

export const dynamic = "force-dynamic";

/**
 * You › Loadout (final-you.html ?tab=loadout): the 5×2 grid, the resonance
 * line, and every modifier the ten slots fold into the engine (with the
 * boons and penalties acting on it). Equip is Tier 0: one slot glint.
 */
export default async function LoadoutPage() {
  const progression = await loadProgression(getCurrentUserId());
  const slots = progression.loadout.map((e, slot) => ({ slot, skill: e?.skill ?? null, active: e?.active ?? false }));
  return (
    <div className="you-grid">
      <div className="you-stack">
        <LoadoutGrid slots={slots} bench={progression.benchedSkills} />
      </div>
      <div className="you-stack">
        <div>
          <SectionHeader title="Active effects" aside="only equipped emblems count" />
          <LoadoutEffects lines={describeModifiers(progression.modifiers)} debuffs={progression.debuffs} boons={progression.boons} />
        </div>
      </div>
    </div>
  );
}
