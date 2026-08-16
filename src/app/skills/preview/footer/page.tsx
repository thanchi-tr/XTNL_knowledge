import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SKILL_POOL } from "@/lib/skill-pool";
import { depthOf } from "@/lib/skill-form";
import { LOADOUT_SLOTS } from "@/lib/loadout";
import { FooterPreview } from "@/components/skills/FooterPreview";

export const metadata: Metadata = { title: "Footer — Live Bench" };

/**
 * Forced dynamic so the guard below runs per request rather than once at
 * build time. Statically rendered, `notFound()` is evaluated on the build
 * machine and the page then serves happily on Vercel — the exact failure
 * the attach-all preview hit.
 */
export const dynamic = "force-dynamic";

/**
 * The real sticky footer, with every emblem in the pool on the bench.
 *
 * The existing attach-bar preview builds a *mock* bar, which is right for
 * comparing three charge concepts side by side but cannot answer the
 * question this page exists for: how the actual footer behaves — its
 * resonance grade, its set chips, its atmosphere, the picker, the page-scale
 * cataclysms — when you slot things into it for real.
 *
 * So this mounts `LoadoutBar` itself, not a copy. The only difference is
 * `persist={false}`: equipping and detaching stay local and never reach the
 * database. Every animation in the bar is driven by the optimistic update
 * that already runs *before* the round trip, so a non-persisting bar is
 * visually identical to a real one — which is what makes it safe to put all
 * 749 emblems in front of it without touching a real loadout.
 *
 * Local only, like the other preview routes.
 */
function assertLocal() {
  if (process.env.VERCEL) notFound();
}

export default function FooterPreviewPage() {
  assertLocal();

  // Deepest first: the terminal ranks are what anyone opening this page is
  // here to fire, and burying them under 312 Pure I emblems would make the
  // picker a scrolling exercise.
  const bench = [...SKILL_POOL].sort(
    (a, b) => depthOf(b) - depthOf(a) || a.name.localeCompare(b.name)
  );

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-5">
        <p className="section-eyebrow">Local reference</p>
        <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
          Footer — Live Bench
        </h1>
        <p className="panel-sub mt-1" style={{ maxWidth: "74ch" }}>
          The real sticky footer with all {SKILL_POOL.length} emblems unlocked. Click an empty slot to open the
          picker, choose an emblem, and watch the full attach — slot burst, bar charge, page surge, and the
          terminal cataclysms — plus the resonance grade and set chips reacting as the loadout takes shape.
          Nothing here is written: this bar runs with <code className="mono">persist=false</code>, so your real
          loadout is untouched. Not deployed — it 404s anywhere <code className="mono">VERCEL</code> is set.
        </p>
      </header>

      <FooterPreview bench={bench} slotCount={LOADOUT_SLOTS} />
    </main>
  );
}
