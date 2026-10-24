"use client";

/**
 * You › Skills (blueprint 1.5; P5, decisions D7, D8 and D9): the named competencies, by hours. Each skill shows its
 * tier and the meter through it ("Tier 2 · 100–500 h · 358 h to Tier 3"), its hours in the plan's words ("≈ 142 h (task
 * estimates, not timed)") and what feeds it; it can be renamed, moved to another attribute, given a Field (Intellect)
 * or archived. Below them: a new skill, the suggestions (task families ticked SUGGEST_MIN_COMPLETIONS times or more,
 * one tap makes the skill and links the family), and the roadmaps, each naming the skill its practices feed.
 *
 * A record, never a reward: nothing here pays, and the page says so (a tier-up is a Seal a tick plays; D9). The
 * actions come in as props (the page passes the server actions in src/app/actions/competency.ts), so this imports no
 * server module and a check can render it. On a server whose writes are off it says nothing will be recorded.
 *
 * A roadmap's pick is useSettledPick's (the select stays enabled while it is written, and arrowing through the options
 * writes once). A button whose words change says its visible words first in its accessible name ("Close Writing",
 * "Archive it? Writing"), so a voice user can say what they see (WCAG 2.5.3).
 *
 * Condition (blueprint P28, D24): once DECAY_LAUNCH_DAY is in force the page passes each skill's condition, and a skill
 * idle past the grace says so under its hours ("Guitar 82% · 12 days idle · a tick of a task linked to it restores
 * it"). Its hours and its tier never move: a condition is a reading. Nothing shows at 100% or while the switch is off.
 */
import { useId, useState, useTransition, type FormEvent } from "react";
import { announce } from "@/lib/celebrate";
import {
  EXERCISE_ATTRIBUTE,
  SKILLS_MAX,
  SKILL_ATTRIBUTES,
  SKILL_NAME_MAX,
  SKILL_TIERS,
  SUGGEST_MIN_COMPLETIONS,
  estimatedTicksLine,
  skillCountLabel,
  type SkillAttribute,
  type SkillInput,
  type SkillKind,
  type SkillPatch,
  type SkillResult,
  type SkillSuggestion,
  type SkillView,
} from "@/lib/competency";
import { STATUS_NAME } from "@/lib/status-panel";
import { conditionNoteOf, conditionShows, type Condition } from "@/lib/skill-decay";
import { Button } from "@/components/ui/Button";
import { Meter } from "@/components/ui/Meter";
import { Sigil, type TrackSigil } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";
import { useSettledPick } from "@/components/ui/useSettledPick";

/** The page's writes (src/app/actions/competency.ts), passed in by the page. */
export interface CompetencyActions {
  addSkill: (input: SkillInput, opts?: { refresh?: boolean }) => Promise<SkillResult<{ id: string }>>;
  addSuggestedSkill: (key: string, opts?: { refresh?: boolean }) => Promise<SkillResult<{ id: string; linked: number }>>;
  editSkill: (id: string, patch: SkillPatch, opts?: { refresh?: boolean }) => Promise<SkillResult<{ id: string }>>;
  archiveSkill: (id: string, opts?: { refresh?: boolean }) => Promise<SkillResult<null>>;
  linkRoadmapSkill: (roadmapId: string, competencyId: string | null, opts?: { refresh?: boolean }) => Promise<SkillResult<{ competencyId: string | null }>>;
}

/** What the board reads (competency-server SkillsPage, less the Fields' rows the page draws itself). */
export interface CompetencyBoardData {
  skills: SkillView[];
  fields: { id: string; name: string; level: number }[];
  suggestions: SkillSuggestion[];
  roadmaps: { id: string; name: string; status: string; competencyId: string | null }[];
  writesOn: boolean;
  ready: boolean;
  /** P28: each skill's condition by id, only while condition decay is in force; absent or null otherwise. */
  conditions?: Readonly<Record<string, Pick<Condition, "condition" | "idleDays">>> | null;
}

const REFRESH = { refresh: true };

export const SKILLS_TITLE = "Skills";
export const SKILLS_ASIDE = "by hours · a tier pays nothing";
export const SKILLS_WRITES_OFF_NOTE = "This server records nothing: skill changes are recorded only on the live app.";
export const SKILLS_NOT_READY = "Skills aren't set up on this database yet.";
/** How the hours are counted, in one paragraph (every figure read from competency.ts). */
const n0 = (v: number) => v.toLocaleString("en-GB");
const BANDS = SKILL_TIERS.map((t) => `${n0(t.from)}–${n0(t.to)}`);
export const SKILLS_RULE = `A skill's hours are the minutes of the ticks on the tasks linked to it (an undo takes its tick back out), and an exercise skill adds your walks. The tiers run ${BANDS.slice(0, -1).join(", ")} and ${BANDS[BANDS.length - 1]} h. A tier-up is a Seal: it pays no XP or MP.`;

/** The attribute's sigil (the Status card's: Vitality is Body's, Intellect Knowledge's). */
const SIGIL: Readonly<Record<SkillAttribute, TrackSigil>> = { VITALITY: "body", INTELLECT: "know", CRAFT: "craft", DUTY: "duty", CARE: "care" };

export function CompetencyBoard({ data, actions }: { data: CompetencyBoardData; actions: CompetencyActions }) {
  return (
    <div className="sk-board">
      <div>
        <SectionHeader title={SKILLS_TITLE} aside={data.skills.length > 0 ? skillCountLabel(data.skills.length) : SKILLS_ASIDE} />
        <section className="card sk-list" aria-label={SKILLS_TITLE}>
          {!data.ready && <p className="st-note sk-pad">{SKILLS_NOT_READY}</p>}
          {data.ready && !data.writesOn && <p className="st-note sk-pad">{SKILLS_WRITES_OFF_NOTE}</p>}
          {data.ready && data.skills.length === 0 && (
            <p className="st-note sk-pad">No skills yet. A skill is a named practice: link the tasks you tick for it (from a task&apos;s drawer, or a suggestion below), and its hours come from their minutes.</p>
          )}
          {data.skills.map((s) => (
            <SkillRowView key={s.id} skill={s} data={data} actions={actions} />
          ))}
        </section>
        <p className="t-meta sk-rule">{SKILLS_RULE}</p>
      </div>
      {data.ready && <AddSkill data={data} actions={actions} />}
      {data.ready && data.suggestions.length > 0 && <Suggestions data={data} actions={actions} />}
      {data.ready && data.roadmaps.length > 0 && data.skills.length > 0 && <Roadmaps data={data} actions={actions} />}
    </div>
  );
}

function feedsLine(s: SkillView): string {
  const parts: string[] = [];
  if (s.templates > 0) parts.push(s.templates === 1 ? "1 task feeds it" : `${s.templates} tasks feed it`);
  if (s.kind === "EXERCISE") parts.push(s.walks === 1 ? "1 walk" : `${s.walks} walks`);
  if (parts.length === 0) parts.push("No task feeds it yet: link one from its drawer on Today");
  if (s.estimated > 0) parts.push(estimatedTicksLine(s.estimated));
  if (s.fieldName) parts.push(s.fieldName);
  return parts.join(" · ");
}

function SkillRowView({ skill: s, data, actions }: { skill: SkillView; data: CompetencyBoardData; actions: CompetencyActions }) {
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pct = Math.floor(Math.max(0, Math.min(0.999, s.progress)) * 100);
  const condition = data.conditions?.[s.id] ?? null;

  function archive() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.archiveSkill(s.id, REFRESH);
      setArmed(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${s.name} archived.`);
    });
  }

  return (
    <div className="trk-row sk-row">
      <Sigil track={SIGIL[s.attribute]} />
      <div>
        <div className="trk-h">
          <b>{s.name}</b>
          <span className="trk-sub">· {s.attributeName}</span>
          <span className="lv sk-tier" aria-label={`Tier ${s.tier}`}>
            T{s.tier}
          </span>
        </div>
        <Meter value={s.progress} label={`${s.name}, tier ${s.tier}, ${pct}% through it`} valueText={`${pct}% through tier ${s.tier}`} />
        <div className="t-meta">{s.line}</div>
        {condition && conditionShows(condition) && (
          <div className="t-meta status-cond">{conditionNoteOf({ kind: "skill", key: s.id, attribute: s.attribute, skillKind: s.kind, name: s.name, condition: condition.condition, idleDays: condition.idleDays })}</div>
        )}
        <div className="t-meta">{s.tierLine}</div>
        <div className="t-meta">{feedsLine(s)}</div>
        {data.writesOn && (
          <div className="st-row sk-acts">
            <Button variant="quiet" onClick={() => setEditing((e) => !e)} disabled={pending} aria-expanded={editing} aria-label={editing ? `Close ${s.name}` : `Edit ${s.name}`}>
              {editing ? "Close" : "Edit"}
            </Button>
            <Button variant={armed ? "secondary" : "quiet"} onClick={archive} onBlur={() => setArmed(false)} disabled={pending} aria-label={armed ? `Archive it? ${s.name}` : `Archive ${s.name}`}>
              {armed ? "Archive it?" : "Archive"}
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="st-error">
            {error}
          </p>
        )}
        {editing && <EditSkill skill={s} data={data} actions={actions} onDone={() => setEditing(false)} />}
      </div>
    </div>
  );
}

function EditSkill({ skill: s, data, actions, onDone }: { skill: SkillView; data: CompetencyBoardData; actions: CompetencyActions; onDone: () => void }) {
  const id = useId();
  const [name, setName] = useState(s.name);
  const [attribute, setAttribute] = useState<SkillAttribute>(s.attribute);
  const [fieldId, setFieldId] = useState(s.fieldId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await actions.editSkill(s.id, { name, attribute, fieldId: attribute === "INTELLECT" && fieldId ? fieldId : null }, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${name.trim() || s.name} saved.`);
      onDone();
    });
  }

  return (
    <form className="av-form sk-form" onSubmit={save} noValidate>
      <label htmlFor={`${id}-n`} className="st-label">
        Name
      </label>
      <input id={`${id}-n`} className="st-input" type="text" maxLength={SKILL_NAME_MAX} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} />
      <label htmlFor={`${id}-a`} className="st-label">
        Attribute
      </label>
      <select id={`${id}-a`} className="st-input" value={attribute} onChange={(e) => setAttribute(e.target.value as SkillAttribute)} disabled={pending || s.kind === "EXERCISE"} aria-describedby={s.kind === "EXERCISE" ? `${id}-ah` : undefined}>
        {SKILL_ATTRIBUTES.map((a) => (
          <option key={a} value={a}>
            {STATUS_NAME[a]}
          </option>
        ))}
      </select>
      {s.kind === "EXERCISE" && (
        <p id={`${id}-ah`} className="st-hint">
          Walks are Vitality&apos;s, so an exercise skill stays there.
        </p>
      )}
      {attribute === "INTELLECT" && <FieldPick id={`${id}-f`} fields={data.fields} value={fieldId} onChange={setFieldId} disabled={pending} />}
      {error && (
        <p role="alert" className="st-error">
          {error}
        </p>
      )}
      <div className="st-row">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        <Button variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function FieldPick({ id, fields, value, onChange, disabled }: { id: string; fields: CompetencyBoardData["fields"]; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <>
      <label htmlFor={id} className="st-label">
        Field (optional)
      </label>
      <select id={id} className="st-input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">None</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </>
  );
}

/** A new skill: a name, an attribute, practice or exercise (Vitality only, while no skill takes the walks), a Field for Intellect. */
function AddSkill({ data, actions }: { data: CompetencyBoardData; actions: CompetencyActions }) {
  const id = useId();
  const [name, setName] = useState("");
  const [attribute, setAttribute] = useState<SkillAttribute>("CRAFT");
  const [kind, setKind] = useState<SkillKind>("PRACTICE");
  const [fieldId, setFieldId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const walksTaken = data.skills.some((s) => s.kind === "EXERCISE");
  const canExercise = attribute === EXERCISE_ATTRIBUTE && !walksTaken;
  const full = data.skills.length >= SKILLS_MAX;

  function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await actions.addSkill({ name, attribute, kind: canExercise ? kind : "PRACTICE", fieldId: attribute === "INTELLECT" && fieldId ? fieldId : null }, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${name.trim()} added.`);
      setName("");
      setKind("PRACTICE");
    });
  }

  return (
    <div>
      <SectionHeader title="New skill" aside={full ? `${SKILLS_MAX} is the most` : undefined} />
      <form className="card av-form sk-pad" onSubmit={save} noValidate aria-label="New skill">
        <label htmlFor={`${id}-n`} className="st-label">
          Name
        </label>
        <input id={`${id}-n`} className="st-input" type="text" maxLength={SKILL_NAME_MAX} autoComplete="off" value={name} placeholder="Writing, guitar, Spanish…" onChange={(e) => setName(e.target.value)} disabled={pending || !data.writesOn || full} />
        <label htmlFor={`${id}-a`} className="st-label">
          Attribute
        </label>
        <select id={`${id}-a`} className="st-input" value={attribute} onChange={(e) => setAttribute(e.target.value as SkillAttribute)} disabled={pending || !data.writesOn || full}>
          {SKILL_ATTRIBUTES.map((a) => (
            <option key={a} value={a}>
              {STATUS_NAME[a]}
            </option>
          ))}
        </select>
        {attribute === EXERCISE_ATTRIBUTE && (
          <fieldset className="av-dir">
            <legend className="st-label">Walks</legend>
            <div className="st-row">
              {(["PRACTICE", "EXERCISE"] as const).map((k) => (
                <Button key={k} type="button" variant={(canExercise ? kind : "PRACTICE") === k ? "secondary" : "quiet"} aria-pressed={(canExercise ? kind : "PRACTICE") === k} onClick={() => setKind(k)} disabled={pending || !data.writesOn || (k === "EXERCISE" && !canExercise)}>
                  {k === "EXERCISE" ? "Walks count" : "Tasks only"}
                </Button>
              ))}
            </div>
            {walksTaken && <p className="st-hint">Walks already count toward {data.skills.find((s) => s.kind === "EXERCISE")?.name}.</p>}
          </fieldset>
        )}
        {attribute === "INTELLECT" && <FieldPick id={`${id}-f`} fields={data.fields} value={fieldId} onChange={setFieldId} disabled={pending || !data.writesOn || full} />}
        {error && (
          <p role="alert" className="st-error">
            {error}
          </p>
        )}
        <div className="st-row">
          <Button type="submit" variant="primary" disabled={pending || !data.writesOn || full || name.trim() === ""}>
            Add the skill
          </Button>
        </div>
        <p className="st-note">Then link its tasks from each task&apos;s drawer on Today: their past ticks count at once.</p>
      </form>
    </div>
  );
}

/** Task families ticked often enough to be a skill: one tap names it and links the family. */
function Suggestions({ data, actions }: { data: CompetencyBoardData; actions: CompetencyActions }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function take(s: SkillSuggestion) {
    setError(null);
    startTransition(async () => {
      const res = await actions.addSuggestedSkill(s.key, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`${s.name} is a skill now.`);
    });
  }
  return (
    <div>
      <SectionHeader title="From your tasks" aside={`ticked ${SUGGEST_MIN_COMPLETIONS}+ times`} />
      <section className="card sk-list" aria-label="Suggested skills">
        {data.suggestions.map((s) => (
          <div key={s.key} className="sk-sug">
            <div className="sk-sug-t">
              <b>{s.name}</b>
              <span className="t-meta">
                {s.completions} ticks · {STATUS_NAME[s.attribute]}
                {s.kind === "EXERCISE" ? " · walks count" : ""}
                {s.templateIds.length > 1 ? ` · ${s.templateIds.length} tasks` : ""}
              </span>
            </div>
            <Button variant="secondary" onClick={() => take(s)} disabled={pending || !data.writesOn} aria-label={`Make it a skill: ${s.name}`}>
              Make it a skill
            </Button>
          </div>
        ))}
        {error && (
          <p role="alert" className="st-error sk-pad">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

/** Each roadmap and the skill its practices and steps feed (a practice linked to a skill of its own keeps that one). */
function Roadmaps({ data, actions }: { data: CompetencyBoardData; actions: CompetencyActions }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const { chosen, pick } = useSettledPick(async (roadmapId, value, latest) => {
    const competencyId = value || null;
    const res = await actions.linkRoadmapSkill(roadmapId, competencyId, REFRESH);
    if (!latest()) return;
    if (!res.ok) setError(res.error);
    else announce(competencyId ? "Roadmap linked." : "Roadmap unlinked.");
  });
  function link(roadmapId: string, value: string) {
    setError(null);
    pick(roadmapId, value);
  }
  return (
    <div>
      <SectionHeader title="Roadmaps" aside="their practices feed a skill" />
      <section className="card av-form sk-pad" aria-label="Roadmaps and skills">
        {data.roadmaps.map((r, i) => (
          <div key={r.id} className="sk-road" aria-busy={chosen[r.id] !== undefined}>
            <label htmlFor={`${id}-${i}`} className="st-label">
              {r.name}
            </label>
            <select id={`${id}-${i}`} className="st-input" value={chosen[r.id] ?? r.competencyId ?? ""} onChange={(e) => link(r.id, e.target.value)} disabled={!data.writesOn}>
              <option value="">No skill</option>
              {data.skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        {error && (
          <p role="alert" className="st-error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
