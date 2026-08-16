import type { Metadata } from "next";
import Link from "next/link";
import { SKILL_POOL, type Skill, type SkillRank } from "@/lib/skill-pool";
import { skinFor, depthOf } from "@/lib/skill-form";
import { SkillLogo } from "@/components/skills/SkillLogo";
import { RANK_META, RANK_ORDER } from "@/lib/skill-visuals";
import { ATTRIBUTE_META } from "@/lib/attributes";
import { augmentCost } from "@/lib/augments";

export const metadata: Metadata = { title: "Every Emblem" };

/**
 * The complete emblem gallery — all 749, nothing sampled.
 *
 * `/skills/preview` already showed the *ladder*: one archetype per
 * attribute, which is the right tool for judging whether adjacent tiers
 * look different. It cannot answer the other question, which is whether the
 * grammar holds across the whole pool — whether every attribute's silhouette
 * stays distinct at every rank, and whether any emblem comes out
 * indistinguishable from a neighbour it should not resemble. That is only
 * checkable by looking at all of them.
 *
 * A server component rendering ~749 inline SVGs. Three things keep that
 * affordable: `SkillLogo` is already server-renderable (its gradient ids
 * derive from `skill.code`, not `useId`), the pool is a pure in-memory
 * constant so there is no database work at all, and every group sits in a
 * `.card`, which globals.css gives `content-visibility: auto` — so the
 * browser skips layout and paint for every group scrolled off screen.
 */

function byRank(rank: SkillRank): Skill[] {
  return SKILL_POOL.filter((s) => s.rank === rank).sort(
    (a, b) => depthOf(a) - depthOf(b) || a.name.localeCompare(b.name)
  );
}

/** One emblem plus the facts that explain why it looks the way it does. */
function EmblemCell({ skill }: { skill: Skill }) {
  const { charge, motes } = skinFor(skill);
  return (
    <li
      className="flex flex-col items-center gap-1.5 p-2"
      style={{ borderRadius: 10, background: "var(--sub)", border: "1px solid var(--line)" }}
      title={`${skill.name}\n${skill.effectText}\ncharge ${(charge * 100).toFixed(0)}% · depth ${depthOf(skill)}/15 · ${motes} motes\naugment from ${augmentCost(skill, "PRESTIGE")} capital`}
    >
      <SkillLogo skill={skill} size={44} />
      <span
        className="w-full truncate text-center"
        style={{ fontSize: 9.5, color: "var(--ink-1)", lineHeight: 1.3 }}
      >
        {skill.name}
      </span>
      <span className="mono" style={{ fontSize: 8.5, color: "var(--ink-3)" }}>
        d{depthOf(skill)} · {(charge * 100).toFixed(0)}%
      </span>
    </li>
  );
}

export default function AllEmblemsPage() {
  const total = SKILL_POOL.length;

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6">
        <p className="section-eyebrow">Reference</p>
        <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
          Every Emblem
        </h1>
        <p className="panel-sub mt-1" style={{ maxWidth: "68ch" }}>
          All {total} marks in the pool, grouped by rank and ordered by depth on the 15-rung ladder. Hover any
          emblem for its effect, charge and augment price. The{" "}
          <Link href="/skills/preview" style={{ color: "var(--green)" }}>
            ladder sheet
          </Link>{" "}
          is the better tool for judging one lineage step by step; this one is for checking the grammar holds
          across the whole pool.
        </p>
      </header>

      {/* Attribute legend — silhouette is a function of attribute, so this is
          the key that makes the grid readable. */}
      <section className="card fade-up mb-4" style={{ padding: 14 }}>
        <p className="panel-title">Silhouette by attribute</p>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {Object.entries(ATTRIBUTE_META).map(([key, meta]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span style={{ fontSize: 10.5, color: "var(--ink-2)" }}>{meta.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-4">
        {RANK_ORDER.map((rank) => {
          const skills = byRank(rank);
          if (skills.length === 0) return null;
          const meta = RANK_META[rank];
          return (
            <section key={rank} className="card fade-up" style={{ padding: 14 }}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="panel-title" style={{ color: meta.color }}>
                  {meta.label}
                </p>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                  {skills.length} emblems
                </span>
              </div>

              <ul
                className="grid gap-1.5"
                style={{ gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))" }}
              >
                {skills.map((s) => (
                  <EmblemCell key={s.code} skill={s} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
