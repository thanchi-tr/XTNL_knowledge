/**
 * The one-line loadout strip (redesign: the LoadoutBar left the layout). For
 * the Study hub and the runner footer (L2 renders it), linking to
 * You › Loadout. Ten mini coins (dashed rings for empty slots), "7 of 10",
 * and how much of their printed effect the emblems realise. Static: no
 * loops, no particles. Blueprint P28 (D24b): a frozen emblem is drawn owned
 * and dimmed with the freeze glyph, never as the locked coin (it is still
 * yours); the strip's label counts the frozen ones.
 *
 *   <LoadoutStripSlot/>          async server component: reads progression itself
 *                                (wrap it in <Suspense fallback={null}>); renders
 *                                nothing until the first emblem is owned
 *   <LoadoutStrip slots/>        presentational, for a caller that already has them
 */
import Link from "next/link";
import "./loadout-strip.css";
import { resolveResonance } from "@/lib/loadout-sets";
import { GRADE_VISUALS } from "@/lib/resonance-visuals";
import { loadProgression } from "@/lib/skill-effects";
import { depthOf } from "@/lib/skill-form";
import type { Skill } from "@/lib/skill-pool";
import { getCurrentUserId } from "@/lib/user";
import { EmblemCoin } from "@/components/ui/Crest";
import { HeldGlyph, Icon } from "@/components/ui/Icon";
import { SkillLogo } from "./SkillLogo";

export interface StripSlot {
  slot: number;
  skill: Skill | null;
  active: boolean;
  /** P28 (D24b): its line when it is frozen (EquippedEntry.frozen); absent while condition decay is off. */
  frozen?: string | null;
}

export function LoadoutStrip({ slots, className }: { slots: StripSlot[]; className?: string }) {
  const filled = slots.filter((s) => s.skill).length;
  const resonance = resolveResonance(slots.filter((s) => s.skill && s.active).map((s) => s.skill!));
  const grade = resonance.sets.length > 0 ? GRADE_VISUALS[resonance.grade].label : null;
  const frozen = slots.filter((s) => s.skill && s.frozen).length;
  return (
    <Link
      href="/you/loadout"
      className={`card lo-strip${className ? ` ${className}` : ""}`}
      aria-label={`Loadout: ${filled} of ${slots.length} slots filled${frozen > 0 ? `, ${frozen} frozen` : ""}. Open Loadout`}
    >
      <span className="coins" aria-hidden="true">
        {slots.map((s) =>
          s.skill && s.frozen ? (
            <span key={s.slot} className="lo-frozen">
              <EmblemCoin rank={s.skill.rank} depth={depthOf(s.skill)} size={32}>
                <SkillLogo skill={s.skill} size={18} animated={false} />
              </EmblemCoin>
              <HeldGlyph kind="freeze" className="lo-freeze" />
            </span>
          ) : s.skill ? (
            <EmblemCoin key={s.slot} rank={s.skill.rank} depth={depthOf(s.skill)} size={32} state={s.active ? "owned" : "locked"}>
              <SkillLogo skill={s.skill} size={18} animated={false} />
            </EmblemCoin>
          ) : (
            <span key={s.slot} className="lo-empty" />
          )
        )}
      </span>
      <span className="t-meta" style={{ whiteSpace: "nowrap" }}>
        <b className="ink-0 num">{filled}</b> of {slots.length}
        {grade ? ` · ${grade}` : ""}
      </span>
      <Icon name="chev" size={18} />
    </Link>
  );
}

async function readSlots(): Promise<StripSlot[] | null> {
  try {
    const progression = await loadProgression(getCurrentUserId());
    if (progression.ownedCodes.length === 0) return null;
    // P28: a frozen slot carries its line (never while condition decay is off), so it draws owned, not locked.
    return progression.loadout.map((e, slot) => ({ slot, skill: e?.skill ?? null, active: e?.active ?? false, ...(e?.frozen ? { frozen: e.frozen } : {}) }));
  } catch {
    // The strip is furniture: a failed read never takes the hub or the runner down.
    return null;
  }
}

export async function LoadoutStripSlot({ className }: { className?: string }) {
  const slots = await readSlots();
  return slots ? <LoadoutStrip slots={slots} className={className} /> : null;
}
