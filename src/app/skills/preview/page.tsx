import type { Metadata } from "next";
import type { Attribute } from "@prisma/client";
import { SKILL_POOL, type Skill } from "@/lib/skill-pool";
import { skinFor, particlesFor, depthOf } from "@/lib/skill-form";
import { SkillLogo } from "@/components/skills/SkillLogo";
import { RANK_META } from "@/lib/skill-visuals";
import { ATTRIBUTE_META } from "@/lib/attributes";

export const metadata: Metadata = { title: "Emblem Ladder" };

/**
 * Reference sheet for the emblem grammar.
 *
 * Exists because the ladder is only judgeable side by side: the whole
 * design claim is that adjacent steps look different, and that is exactly
 * what you cannot check while looking at one skill card at a time. Renders
 * the real `SkillLogo`, so anything true here is true in the app.
 */

function pureLadder(attribute: Attribute): Skill[] {
  return SKILL_POOL.filter(
    (s) => s.rank === "PURE" && s.attributes[0] === attribute && s.archetypeCode === "DIVIDEND"
  ).sort((a, b) => a.tier - b.tier);
}

function firstOfRank(rank: Skill["rank"], count: number): Skill[] {
  return SKILL_POOL.filter((s) => s.rank === rank)
    .sort((a, b) => a.tier - b.tier || a.code.localeCompare(b.code))
    .filter((s, i, arr) => arr.findIndex((x) => x.tier === s.tier) === i)
    .slice(0, count);
}

function Cell({ skill, size = 72 }: { skill: Skill; size?: number }) {
  const skin = skinFor(skill);
  const p = particlesFor(skill);
  const channels = [
    p.orbitals > 0 && `${p.orbitals} orbital`,
    p.counterOrbitals > 0 && `${p.counterOrbitals} counter`,
    p.sparks > 0 && `${p.sparks} spark`,
    p.embers > 0 && `${p.embers} ember`,
    p.arcs > 0 && `${p.arcs} arc`,
    p.rays > 0 && `${p.rays} ray`,
    p.corePulse && "core",
    p.coronaPulse && "corona",
    // Terminal-only channels.
    p.shockwaves > 0 && `${p.shockwaves} shockwave`,
    p.haloRings > 0 && `${p.haloRings} halo`,
    p.sparkleStars > 0 && `${p.sparkleStars} star`,
    p.cometTails && "comet tails",
    p.flare && "flare",
    p.rayPulse && "ray pulse",
    p.conicSweep && "sweep",
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col items-center gap-2 px-1 py-3" style={{ minWidth: size + 36 }}>
      <SkillLogo skill={skill} size={size} />
      <p className="mono" style={{ fontSize: 10, color: "var(--ink-1)" }}>
        d{depthOf(skill)} · {RANK_META[skill.rank].label} {skill.tier}
      </p>
      <p
        className="text-center"
        style={{ fontSize: 9, lineHeight: 1.4, color: "var(--ink-3)", maxWidth: 100 }}
      >
        {channels.length > 0 ? channels.join(" · ") : "static"}
      </p>
      <p className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>
        charge {skin.charge.toFixed(2)}
      </p>
    </div>
  );
}

function Row({
  title,
  note,
  skills,
  size,
}: {
  title: string;
  note: string;
  skills: Skill[];
  /** Terminal ranks get a bigger cell — their detail is the point. */
  size?: number;
}) {
  return (
    <section className="card p-4">
      <h2 className="panel-title">{title}</h2>
      <p className="panel-sub">{note}</p>
      <div className="mt-3 flex flex-wrap items-start" style={{ gap: 4 }}>
        {skills.map((s) => (
          <Cell key={s.code} skill={s} size={size} />
        ))}
      </div>
    </section>
  );
}

export default function EmblemPreviewPage() {
  const logic = pureLadder("LOGIC");
  const synergy = firstOfRank("SYNERGY", 5);
  const capstone = firstOfRank("CAPSTONE", 5);
  const apex = SKILL_POOL.filter((s) => s.rank === "APEX").slice(0, 4);
  const ultimate = SKILL_POOL.filter((s) => s.rank === "ULTIMATE").slice(0, 4);

  // One emblem per attribute at the same depth, to isolate the hue/silhouette
  // channel from the structural one.
  const perAttribute = Object.values(ATTRIBUTE_META)
    .map(({ key }) => SKILL_POOL.find((s) => s.rank === "PURE" && s.attributes[0] === key && s.tier === 6))
    .filter((s): s is Skill => Boolean(s));

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6">
        <p className="section-eyebrow">Design Reference</p>
        <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
          Emblem Ladder
        </h1>
        <p className="mt-1 max-w-2xl" style={{ fontSize: 12, color: "var(--ink-2)" }}>
          Every step differs from the one above by a structural element, never by stroke weight alone.
          Motion is withheld until depth 5 so that the moment a lineage starts moving reads as an event.
        </p>
      </header>

      <div className="fade-up fade-up-1 space-y-3">
        <Row
          title="Pure — the eight-step spine"
          note="Deductive Dividend I through VIII. Echo → vertices → core → ring → spokes → corona."
          skills={logic}
        />
        <Row title="Synergy" note="Two overlapping bodies, one per attribute. No heavy core — it would hide the lens." skills={synergy} />
        <Row title="Capstone" note="Counter-rotation is the signature: two fused paths turning against each other." skills={capstone} />
        <Row
          title="Apex"
          note="Terminal spectacle: shockwaves, two tilted halos, comet tails, sparkle stars and a lens flare — channels no lower rank has at all."
          skills={apex}
          size={128}
        />
        <Row
          title="Ultimate"
          note="Everything Apex has, more of it, plus embers and a conic sweep. The only rank that ends a path."
          skills={ultimate}
          size={128}
        />
        <Row
          title="Hue and silhouette, held at depth 6"
          note="Structure fixed, so the only variables are the attribute's colour and its polygon side count."
          skills={perAttribute}
        />
      </div>
    </main>
  );
}
