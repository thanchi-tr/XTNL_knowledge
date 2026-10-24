import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/user";
import { loadSkillsPage, type SkillsPageField } from "@/lib/competency-server";
import { loadConditionBasis } from "@/lib/skill-decay-server";
import { skillConditionOf, type Condition } from "@/lib/skill-decay";
import { addSkill, addSuggestedSkill, archiveSkill, editSkill, linkRoadmapSkill } from "@/app/actions/competency";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { SectionHeader } from "@/components/ui/Tabs";
import { CompetencyBoard } from "@/components/home/CompetencyBoard";

export const metadata: Metadata = { title: "Skills" };

// Hours move on every tick and walk, and a link shows at once.
export const dynamic = "force-dynamic";

/** The page's writes (blueprint P5): the server actions, passed to the client board. */
const SKILL_ACTIONS = { addSkill, addSuggestedSkill, editSkill, archiveSkill, linkRoadmapSkill };

/** A Field's level as the list shows it ("8.4"). */
const levelText = (v: number) => (Math.floor(v * 10) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 });

/** The Fields by level (highest first), each with its Field tier and the level the next one starts at. */
function FieldsCard({ rows }: { rows: readonly SkillsPageField[] }) {
  return (
    <div>
      <SectionHeader title="Fields" aside="by level · Intellect's" />
      <section className="card sk-list" aria-label="Fields">
        {rows.length === 0 && <p className="st-note sk-pad">No Fields yet: they come from the ideas you file and review.</p>}
        {rows.map((f) => (
          <div key={f.id} className="sk-field">
            <b>{f.name}</b>
            <span className="t-meta">
              L{levelText(f.level)} · {f.tier}
              {f.nextAt != null ? ` · next tier at L${f.nextAt}` : ""}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

/**
 * You › Skills (blueprint 1.5; docs/life-plan/blueprint-plan-2026-10-22.md P5; decisions D7, D8 and D9): the real
 * skills, the named competencies, by hours, each with its tier (0–100, 100–500, 500–2,000, 2,000–10,000 h) and what
 * feeds it, then a new skill, the suggestions from the task families ticked often, the roadmaps each feeding a skill,
 * and the Fields by level and Field tier (Intellect's measure). Every figure is read on each load from the ledger
 * (competency-server loadSkillsPage); nothing here pays, and a tier-up is a Seal a tick plays. P28: once
 * DECAY_LAUNCH_DAY is in force, each skill's condition beside it (loadConditionBasis: null at once with no read while it
 * is off; a failed read shows none).
 */
export default async function SkillsPage() {
  const userId = getCurrentUserId();
  const basisRead = loadConditionBasis(userId).catch(() => null);
  const page = await loadSkillsPage(userId);
  const basis = await basisRead;
  const conditions: Record<string, Condition> | null = basis ? Object.fromEntries(page.skills.map((s) => [s.id, skillConditionOf(s, basis)])) : null;
  return (
    <>
      <ShellTitle eyebrow="You" title="Skills" />
      <div className="you-grid sk-grid">
        <div className="you-stack">
          <CompetencyBoard
            data={{ skills: page.skills, fields: page.fields, suggestions: page.suggestions, roadmaps: page.roadmaps, writesOn: page.writesOn, ready: page.ready, conditions }}
            actions={SKILL_ACTIONS}
          />
        </div>
        <div className="you-stack">
          <FieldsCard rows={page.fieldRows} />
        </div>
      </div>
    </>
  );
}
