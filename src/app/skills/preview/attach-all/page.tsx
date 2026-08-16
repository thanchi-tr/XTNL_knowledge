import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Attribute } from "@prisma/client";
import { SKILL_POOL, type Skill } from "@/lib/skill-pool";
import { depthOf } from "@/lib/skill-form";
import { ATTRIBUTES } from "@/lib/attributes";
import { AttachAllPreview } from "@/components/skills/AttachAllPreview";

export const metadata: Metadata = { title: "Attach — All Emblems" };

/**
 * Forced dynamic, and this is load-bearing rather than cautious.
 *
 * With the default static rendering the guard below runs once at *build*
 * time, where `VERCEL` is whatever the build machine had — so the page was
 * prerendered to HTML and then served happily on Vercel, gate and all.
 * Verified: a production server started with VERCEL=1 returned 200 for this
 * route until this line existed. Rendering per request is what makes the
 * check actually run against the environment serving it.
 */
export const dynamic = "force-dynamic";

/**
 * Local-only reference for the attach animation.
 *
 * Gated on Vercel's own `VERCEL` environment variable rather than on
 * `NODE_ENV`. `next build && next start` runs with NODE_ENV=production
 * locally, so a NODE_ENV check would hide this page on exactly the machine
 * it exists to serve, while `VERCEL` is set in every Vercel environment and
 * nowhere else — which is precisely the "local only" line being drawn.
 *
 * `notFound()` rather than a redirect or a notice, so the route is
 * indistinguishable from one that was never deployed.
 */
function assertLocal() {
  if (process.env.VERCEL) notFound();
}

const firstOf = (pred: (s: Skill) => boolean): Skill | undefined => SKILL_POOL.find(pred);

/** The Pure ladder for one archetype — the charge axis, held to a single silhouette. */
function chargeLadder(): Skill[] {
  return SKILL_POOL.filter((s) => s.rank === "PURE" && s.archetypeCode === "DIVIDEND" && s.attributes[0] === "MIND")
    .sort((a, b) => a.tier - b.tier);
}

/** One emblem per attribute at a fixed tier — the silhouette axis, charge held constant. */
function silhouetteRow(): Skill[] {
  return ATTRIBUTES.map((a: Attribute) =>
    firstOf((s) => s.rank === "PURE" && s.tier === 5 && s.attributes[0] === a)
  ).filter((s): s is Skill => s !== undefined);
}

/** One of every rank, ordered by depth — the escalation the whole system is built around. */
function rankSpectrum(): Skill[] {
  const picks = [
    firstOf((s) => s.rank === "PURE" && s.tier === 1),
    firstOf((s) => s.rank === "PURE" && s.tier === 8),
    firstOf((s) => s.rank === "SYNERGY" && s.tier === 1),
    firstOf((s) => s.rank === "SYNERGY" && s.tier === 5),
    firstOf((s) => s.rank === "CAPSTONE" && s.tier === 1),
    firstOf((s) => s.rank === "CAPSTONE" && s.tier === 5),
    firstOf((s) => s.rank === "APEX"),
    firstOf((s) => s.rank === "ULTIMATE"),
  ].filter((s): s is Skill => s !== undefined);
  return picks.sort((a, b) => depthOf(a) - depthOf(b));
}

export default function AttachAllPage() {
  assertLocal();

  const groups = [
    {
      label: "Rank spectrum",
      note: "One of every rank, ordered by depth. The claim this page exists to test: a Pure I and an Ultimate should be recognisably different events, not the same event at two sizes. Watch the ring count, reach, duration and which extra layers appear at all.",
      skills: rankSpectrum(),
    },
    {
      label: "Charge ladder — Pure I through VIII",
      note: "One archetype, one attribute, all eight tiers. Silhouette is held constant so the only variable is charge: rings go 1→4, reach 1.8→3.2, duration 620→1140ms, and the shard/shock/beam/flash layers switch on at their thresholds.",
      skills: chargeLadder(),
    },
    {
      label: "Silhouette — every attribute at Tier V",
      note: "Charge held constant so the only variable is attribute. Spoke count comes from the same number that decides the emblem's polygon, so each burst is that emblem's own shape flying apart rather than a generic ring.",
      skills: silhouetteRow(),
    },
  ];

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-5">
        <p className="section-eyebrow">Local reference</p>
        <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
          Attach Animation — All Emblems
        </h1>
        <p className="panel-sub mt-1" style={{ maxWidth: "72ch" }}>
          Click any emblem to fire its full attach: the slot burst, the bar charge, and the page surge together.
          Group buttons replay without the page surge, so a grid stays readable. This route is not deployed —
          it 404s anywhere <code className="mono">VERCEL</code> is set.
        </p>
      </header>

      <AttachAllPreview groups={groups} />
    </main>
  );
}
