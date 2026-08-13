import type { Metadata } from "next";
import { SKILL_POOL, type Skill } from "@/lib/skill-pool";
import { skinFor } from "@/lib/skill-form";
import { BarChargePreview } from "@/components/skills/BarChargePreview";

export const metadata: Metadata = { title: "Attach — Bar Concepts" };

/**
 * Three concepts for the loadout bar reacting to an attach, for choosing
 * between rather than for shipping.
 *
 * None of these is wired into the real footer. Picking one is a taste
 * decision that should be made by looking at all three replaying the same
 * attach, which is exactly what cannot be done in the app itself — the real
 * bar equips through it, and comparing would mean writing to the database
 * dozens of times.
 */

/**
 * One skill per rung, ascending.
 *
 * The top two are pinned to APEX and ULTIMATE by rank rather than taken from
 * the charge ladder by fraction: those two are exactly the ranks that carry
 * an aftermath, and sampling by fraction could miss them entirely.
 */
function samples(): Skill[] {
  const byCharge = [...SKILL_POOL].sort((a, b) => skinFor(a).charge - skinFor(b).charge);
  const lower = ["PURE", "SYNERGY", "CAPSTONE"].map(
    (rank) => byCharge.filter((s) => s.rank === rank)[Math.floor(byCharge.filter((s) => s.rank === rank).length / 2)]
  );
  const apex = byCharge.find((s) => s.rank === "APEX")!;
  const ultimate = byCharge.find((s) => s.rank === "ULTIMATE")!;
  return [byCharge[0], ...lower.slice(1), apex, ultimate].filter(Boolean);
}

export default function AttachBarPreviewPage() {
  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6">
        <p className="section-eyebrow">Design Reference</p>
        <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
          Attach — Bar Concepts
        </h1>
        <p className="mt-1 max-w-2xl" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          The slot burst is thirty-four pixels of event on a bar that spans the viewport, so the most
          consequential action in the app happens in a corner. These three treat the bar itself as the thing
          that gains power. They differ in what is happening, not in styling — that is the choice worth
          making.
        </p>
      </header>

      <div className="fade-up fade-up-1">
        <BarChargePreview samples={samples()} />
      </div>
    </main>
  );
}
