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
  // Blueprint P28 (D24b): a frozen slot carries its thaw line (never while condition decay is off).
  const slots = progression.loadout.map((e, slot) => ({ slot, skill: e?.skill ?? null, active: e?.active ?? false, ...(e?.frozen ? { frozen: e.frozen } : {}) }));
  return (
    <div className="you-grid">
      <div className="you-stack">
        {/* P28: the frozen emblems, for the bench's marks; the prop is left out while condition decay is off. */}
        <LoadoutGrid slots={slots} bench={progression.benchedSkills} {...(Object.keys(progression.frozen).length > 0 ? { frozen: progression.frozen } : {})} />
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
