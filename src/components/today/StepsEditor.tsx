"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { addSubtask, removeSubtask, renameSubtask } from "@/app/actions/subtasks";
import { STEPS_MAX, STEP_TITLE_MAX, MUST_STEPS_NOTE, PART_STEPS_NOTE, type Subtask } from "@/lib/subtasks";

type Res<T> = { ok: true; value: T } | { ok: false; error: string };
export interface StepsSave {
  add: (templateId: string, title: string) => Promise<Res<Subtask>>;
  rename: (stepId: string, title: string) => Promise<Res<Subtask>>;
  remove: (stepId: string) => Promise<Res<{ templateId: string }>>;
}
const LIVE: StepsSave = { add: addSubtask, rename: renameSubtask, remove: removeSubtask };

/**
 * The drawer's step editor, inside Edit: the only way a task gets steps (none at capture). Add a step at the end,
 * rename one (Enter or leaving the field saves), remove one. Each write re-renders the board. `save` is the fixtures'
 * seam; the board uses the server actions.
 */
export function StepsEditor({ templateId, items, compulsory, disabled = false, save = LIVE }: { templateId: string; items: readonly Subtask[]; compulsory: boolean; disabled?: boolean; save?: StepsSave }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = disabled || pending;
  const full = items.length >= STEPS_MAX;

  const runIt = <T,>(call: () => Promise<Res<T>>, then?: () => void) =>
    start(async () => {
      setError(null);
      const res = await call();
      if (!res.ok) setError(res.error);
      else then?.();
    });

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const title = draft.trim();
    if (!title || full) return;
    runIt(() => save.add(templateId, title), () => setDraft(""));
  };

  return (
    <section className="t-steps-ed" aria-label="Steps">
      <p className="t-eyebrow">Steps</p>
      <p className="today-drawer-note">
        {items.length === 0 ? "Break it into steps: each one you tick pays its share of the task." : compulsory ? MUST_STEPS_NOTE : PART_STEPS_NOTE}
      </p>
      {items.length > 0 && (
        <ol className="t-steps-ed-list">
          {items.map((s, i) => (
            <li key={s.id}>
              <span className="t-steps-ed-n num" aria-hidden="true">
                {i + 1}
              </span>
              <input
                className="today-input t-steps-ed-in"
                defaultValue={s.title}
                maxLength={STEP_TITLE_MAX}
                aria-label={`Step ${i + 1}`}
                disabled={off}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  const title = e.currentTarget.value.trim();
                  if (!title) e.currentTarget.value = s.title;
                  else if (title !== s.title) runIt(() => save.rename(s.id, title));
                }}
              />
              <button type="button" className="today-pill t-steps-ed-btn t-steps-ed-x" disabled={off} onClick={() => runIt(() => save.remove(s.id))} aria-label={`Remove step ${i + 1}: ${s.title}`} title="Remove">
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <form className="today-drawer-row t-steps-ed-row" onSubmit={onAdd}>
        <input
          className="today-input t-steps-ed-in"
          value={draft}
          maxLength={STEP_TITLE_MAX}
          placeholder={full ? `${STEPS_MAX} steps at most` : "Add a step"}
          aria-label="New step"
          disabled={off || full}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="today-pill t-steps-ed-btn" disabled={off || full || !draft.trim()}>
          {pending ? "Saving…" : "Add"}
        </button>
      </form>
      {error && (
        <p className="today-drawer-note" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
