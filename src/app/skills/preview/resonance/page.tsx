import type { Metadata } from "next";
import { SKILL_POOL, type Skill, type SkillRank } from "@/lib/skill-pool";
import { resolveResonance, SOLO_SHARE, SET_SHAPES } from "@/lib/loadout-sets";
import { GRADE_VISUALS } from "@/lib/resonance-visuals";
import { foldEffects, attenuateModifiers } from "@/lib/skill-gates";
import { skyFor } from "@/lib/sky";
import { LoadoutBar } from "@/components/skills/LoadoutBar";
import { ResonanceAtmosphere } from "@/components/skills/ResonanceAtmosphere";
import { LOADOUT_SLOTS } from "@/lib/loadout";

export const metadata: Metadata = { title: "Loadout Resonance" };

/**
 * Reference sheet for the set-bonus ladder.
 *
 * Same reasoning as the emblem ladder next door: the design claim is that
 * each grade is distinguishable from the one below it, and that is precisely
 * what cannot be checked while looking at a single loadout. Every bar here is
 * the real `LoadoutBar` with real skills, so anything true on this page is
 * true in the app — a mock-up would be free to look better than the thing it
 * stands for.
 *
 * Grades are read back from `resolveResonance` rather than asserted, so if
 * the weights are retuned this page reports what actually happens instead of
 * what it was written believing.
 */

const ALL = [...SKILL_POOL];

function pures(tier: number): Skill[] {
  return ALL.filter((s) => s.rank === "PURE" && s.tier === tier);
}

function firstOfRank(rank: SkillRank, n: number): Skill[] {
  return ALL.filter((s) => s.rank === rank).slice(0, n);
}

/** One emblem of each rank — the Spectrum shape. */
function oneOfEachRank(): Skill[] {
  const ranks: SkillRank[] = ["PURE", "SYNERGY", "CAPSTONE", "APEX", "ULTIMATE"];
  return ranks.map((r) => ALL.find((s) => s.rank === r)!).filter(Boolean);
}

function sameArchetype(n: number): Skill[] {
  const code = pures(1)[0].archetypeCode;
  return ALL.filter((s) => s.archetypeCode === code).slice(0, n);
}

/** A tier ladder drawn from distinct archetypes — the Ascension shape. */
function ascensionLadder(): Skill[] {
  const out: Skill[] = [];
  const used = new Set<string>();
  for (let tier = 1; tier <= 5; tier++) {
    const m = ALL.find((s) => s.tier === tier && s.rank === "PURE" && !used.has(s.archetypeCode));
    if (m) {
      used.add(m.archetypeCode);
      out.push(m);
    }
  }
  return out;
}

interface Build {
  caption: string;
  reachableAt: string;
  skills: Skill[];
}

const BUILDS: Build[] = [
  {
    caption: "A single emblem",
    reachableAt: "First unlock",
    skills: pures(1).slice(0, 1),
  },
  {
    caption: "Two unrelated emblems — still nothing in common",
    reachableAt: "Early",
    skills: [pures(1)[0], pures(1)[8]],
  },
  {
    caption: "Three Tier I Pures — Cadre and Triad, built from the cheapest material in the game",
    reachableAt: "First session",
    skills: pures(1).slice(0, 3),
  },
  {
    caption: "A tier ladder from five different archetypes — Ascension",
    reachableAt: "Mid",
    skills: ascensionLadder(),
  },
  {
    caption: "Five emblems of one lineage — Choir",
    reachableAt: "Mid",
    skills: sameArchetype(5),
  },
  {
    caption: "Ten Tier I Pures — breadth without depth",
    reachableAt: "Mid",
    skills: pures(1).slice(0, 10),
  },
  {
    caption: "Ten emblems of one archetype — the most coherent build available",
    reachableAt: "Late",
    skills: sameArchetype(10),
  },
  {
    caption: "One emblem of every rank — Spectrum, which cannot exist without an Ultimate",
    reachableAt: "Endgame",
    skills: oneOfEachRank(),
  },
  {
    caption: "A full endgame spread — Ultimates, Apexes, Capstones and Synergies together",
    reachableAt: "Endgame",
    skills: [
      ...firstOfRank("ULTIMATE", 3),
      ...firstOfRank("APEX", 2),
      ...firstOfRank("CAPSTONE", 2),
      ...firstOfRank("SYNERGY", 2),
      pures(1)[0],
    ],
  },
];

function BuildRow({ build }: { build: Build }) {
  const r = resolveResonance(build.skills);
  const v = GRADE_VISUALS[r.grade];
  const modifiers = attenuateModifiers(foldEffects(build.skills), r.powerShare);
  const printed = foldEffects(build.skills);

  const slots = Array.from({ length: LOADOUT_SLOTS }, (_, slot) => ({
    slot,
    skill: build.skills[slot] ?? null,
    active: build.skills[slot] !== undefined,
  }));

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 p-4 pb-2">
        <div>
          <h2 className="panel-title" style={{ color: v.color }}>
            {v.label}
            <span className="mono ml-2" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
              score {r.score}
            </span>
          </h2>
          <p className="panel-sub">{build.caption}</p>
        </div>
        <div className="text-right">
          <p className="mono" style={{ fontSize: 13, color: v.color }}>
            {(r.powerShare * 100).toFixed(0)}%
          </p>
          <p className="label-xs">of printed effect</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-4 pb-2" style={{ fontSize: 10.5, color: "var(--ink-2)" }}>
        <span>{build.reachableAt}</span>
        <span>·</span>
        <span>{build.skills.length} equipped</span>
        <span>·</span>
        <span>
          review yield {printed.reviewYieldMultiplier.toFixed(2)}× printed →{" "}
          <span style={{ color: v.color }}>{modifiers.reviewYieldMultiplier.toFixed(3)}× realised</span>
        </span>
      </div>

      {/* The atmosphere this loadout would put across the whole app, boxed so
          nine of them can be compared at once. `ambient={false}` on the bar
          below stops each one also claiming the real full-viewport layer. */}
      <div
        className="sky-frame"
        style={{
          height: 260,
          overflow: "hidden",
          background: "var(--canvas)",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <ResonanceAtmosphere resonance={r} active={build.skills} scoped />
        <p
          className="mono absolute left-4 top-3"
          style={{ zIndex: 1, fontSize: 10.5, color: "var(--ink-3)" }}
        >
          {skyFor(build.skills, r).sky?.name ?? "no sky — bare"}
          {skyFor(build.skills, r).singularity ? " · singularity" : ""}
        </p>
      </div>

      {/* The real bar. Sticky inside its own wrapper, so each sits in its own
          row rather than nine of them fighting over the viewport floor. */}
      <div style={{ position: "relative" }}>
        <LoadoutBar slots={slots} bench={[]} ambient={false} />
      </div>
    </section>
  );
}

export default function ResonancePreview() {
  return (
    <main className="site-container py-8">
      <p className="section-eyebrow">Reference</p>
      <h1 className="mb-1 text-2xl font-semibold">Loadout Resonance</h1>
      <p className="panel-sub mb-6" style={{ maxWidth: "68ch" }}>
        An emblem on its own realises {(SOLO_SHARE * 100).toFixed(0)}% of what it prints. The rest is
        unlocked by composition — the shapes below — so ten unrelated Ultimates are worth less than a
        loadout that means something. Each bar is the real component; grades are read back from the
        scorer rather than asserted, so this page reports what actually happens.
      </p>

      <section className="card mb-8 p-4">
        <h2 className="panel-title mb-2">Shapes</h2>
        <ul className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
          {SET_SHAPES.map((s) => (
            <li key={s.id} className="flex gap-2" style={{ fontSize: 11.5 }}>
              <span className="mono shrink-0" style={{ color: "var(--ink-3)", minWidth: 30 }}>
                ×{s.weight}
              </span>
              <span>
                <strong style={{ color: "var(--ink-0)" }}>{s.name}</strong>
                <span style={{ color: "var(--ink-2)" }}> — {s.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {BUILDS.map((b, i) => (
        <BuildRow key={i} build={b} />
      ))}
    </main>
  );
}
