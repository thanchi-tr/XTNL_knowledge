"use client";

/**
 * The task drawer's skill (blueprint 1.5; P5, decision D7): which named skill this task's ticks count toward, picked
 * from the live skills (or none). A task feeds at most one skill: its own pick, else its roadmap's (a practice or step
 * of a roadmap linked on You › Skills), and the pick wins. Linking counts the task's past ticks at once, on read; it
 * pays nothing and moves no price (competency-server is the only writer, and it refuses a work tab's task and a goal).
 *
 * Read through the skillChoices action when the drawer opens (nothing is written); until that answers, and on a task
 * that can't take a skill (a work tab's, a goal), it renders nothing, so a static render (a fixture, a check) is the
 * drawer exactly as before. On a server whose writes are off the pick is shown but can't change.
 *
 * The pick is useSettledPick's: the select stays enabled while it is written (the row is aria-busy), it is written once
 * it settles (arrowing through the options writes once), only the latest pick's reply is shown, and a pick still
 * settling when the drawer closes is written then.
 */
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { linkTemplateSkill, skillChoices } from "@/app/actions/competency";
import type { SkillResult } from "@/lib/competency";
import type { SkillChoices } from "@/lib/competency-server";
import { SKILLS_PATH } from "@/components/shell/nav";
import { useSettledPick } from "@/components/ui/useSettledPick";

type Loader = (templateId: string) => Promise<SkillResult<SkillChoices>>;
type Saver = (templateId: string, competencyId: string | null) => Promise<SkillResult<{ competencyId: string | null }>>;

export function CompetencyLink({ templateId, load = skillChoices, save = linkTemplateSkill }: { templateId: string; load?: Loader; save?: Saver }) {
  const id = useId();
  const [data, setData] = useState<SkillChoices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { chosen, pick } = useSettledPick(async (_key, next, latest) => {
    const res = await save(templateId, next === "" ? null : next);
    if (!latest()) return;
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Read again: an unlinked practice falls back to its roadmap's skill.
    const fresh = await load(templateId);
    if (latest() && fresh.ok) setData(fresh.value);
  });
  useEffect(() => {
    let live = true;
    load(templateId).then((res) => {
      if (!live) return;
      if (res.ok) setData(res.value);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [templateId, load]);

  if (!data || data.refusal) return error ? <p className="today-drawer-note">{error}</p> : null;
  if (data.choices.length === 0) {
    return (
      <div className="today-drawer-row td-skill">
        <span className="today-drawer-note">No skills yet.</span>
        <Link className="td-record" href={SKILLS_PATH}>
          Name one on You › Skills ›
        </Link>
      </div>
    );
  }

  const own = data.current?.via === "own" ? data.current.id : "";
  const viaRoadmap = data.current?.via === "roadmap" ? data.current : null;

  const shown = chosen.skill;
  function choose(next: string) {
    setError(null);
    pick("skill", next);
  }

  return (
    <>
      <div className="today-drawer-row td-skill" aria-busy={shown !== undefined}>
        <label htmlFor={id} className="today-drawer-note">
          Skill
        </label>
        <select id={id} className="today-input" value={shown ?? own} onChange={(e) => choose(e.target.value)} disabled={!data.writesOn}>
          <option value="">{viaRoadmap ? `Its roadmap's: ${viaRoadmap.name}` : "None"}</option>
          {data.choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p className="today-drawer-note">
        {data.writesOn ? "Its ticks' minutes count toward the skill's hours, past ones too. It pays nothing." : "Skill changes are recorded only on the live app."}
      </p>
      {error && (
        <p role="alert" className="today-drawer-note">
          {error}
        </p>
      )}
    </>
  );
}
