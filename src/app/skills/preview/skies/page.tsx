import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SKILL_POOL } from "@/lib/skill-pool";
import { depthOf } from "@/lib/skill-form";
import { resolveResonance, NO_RESONANCE } from "@/lib/loadout-sets";
import { SKY_LADDER } from "@/lib/sky";
import { ResonanceAtmosphere } from "@/components/skills/ResonanceAtmosphere";

export const metadata: Metadata = { title: "The Fifteen Skies" };

/**
 * Forced dynamic so the guard below runs per request rather than once at
 * build time. Statically rendered, `notFound()` is evaluated on the build
 * machine and the page then serves happily on Vercel.
 */
export const dynamic = "force-dynamic";

function assertLocal() {
  if (process.env.VERCEL) notFound();
}

/** An emblem at each rung, so every row is labelled with something real. */
function exemplarFor(depth: number) {
  return SKILL_POOL.find((s) => depthOf(s) === depth) ?? null;
}

export default function SkiesPreview() {
  assertLocal();

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6">
        <p className="section-eyebrow">Local reference</p>
        <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
          The Fifteen Skies
        </h1>
        <p className="panel-sub mt-1" style={{ maxWidth: "76ch" }}>
          One background per rung of the depth ladder, chosen by the deepest emblem equipped. The run goes
          futuristic at d1 to primordial at d15 — the further you go, the further back you reach — and no two
          neighbours share a motif or a direction of travel. Each panel below is rendered at full rarity;
          in the app the same sky is faint when you carry one emblem of its rung and full when you carry ten.
          The black hole is not on this ladder: it is reserved for an Ultimate or a full d14 combo, and mounts
          on top of whichever sky you are already under. Not deployed — it 404s anywhere{" "}
          <code className="mono">VERCEL</code> is set.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {SKY_LADDER.map((sky) => {
          const exemplar = exemplarFor(sky.depth);
          return (
            <section
              key={sky.id}
              className="card overflow-hidden"
              // Sixteen full sky stacks on one page is a load no real route
              // ever carries — the app mounts exactly one. `content-visibility`
              // lets the browser skip rendering, and skip running the
              // animations of, every card that is not on screen.
              style={{
                position: "relative",
                padding: 0,
                borderRadius: 12,
                contentVisibility: "auto",
                containIntrinsicSize: "auto 220px",
              }}
            >
              <div className="sky-frame" style={{ height: 220, background: "var(--canvas)" }}>
                <ResonanceAtmosphere
                  resonance={NO_RESONANCE}
                  active={[]}
                  scoped
                  forceSky={sky}
                  forceRarity={1}
                />
                <div className="absolute inset-x-0 bottom-0 p-3" style={{ zIndex: 1 }}>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: `rgb(${sky.rgb})`, letterSpacing: ".08em" }}
                    >
                      d{sky.depth}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>{sky.name}</span>
                    <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                      {sky.era}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>{sky.tagline}</p>
                  <p className="mono" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 3 }}>
                    {sky.motif} · drifts {sky.drift}
                    {exemplar ? ` · e.g. ${exemplar.name}` : ""}
                  </p>
                </div>
              </div>
            </section>
          );
        })}

        {/* The reserve, shown last and shown on top of its own sky, which is
            exactly how it appears in the app. */}
        <section
          className="card overflow-hidden md:col-span-2"
          style={{ position: "relative", padding: 0, borderRadius: 12 }}
        >
          <div className="sky-frame" style={{ height: 300, background: "var(--canvas)" }}>
            <ResonanceAtmosphere
              resonance={resolveResonance([])}
              active={[]}
              scoped
              forceSky={SKY_LADDER[14]}
              forceRarity={1}
              forceSingularity
            />
            <div className="absolute inset-x-0 bottom-0 p-3" style={{ zIndex: 1 }}>
              <div className="flex items-baseline gap-2">
                <span className="mono" style={{ fontSize: 10, color: "var(--amber)", letterSpacing: ".08em" }}>
                  RESERVED
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-0)" }}>Singularity</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>
                One Ultimate equipped, or a satisfied set of three or more d14+ emblems. Nothing else reaches
                it — not ten Apexes, not any number of completed shapes below that depth.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
