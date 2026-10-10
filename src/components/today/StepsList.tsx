"use client";

import { MUST_STEPS_NOTE, PART_STEPS_NOTE, stepsLine } from "@/lib/subtasks";
import type { RowSteps } from "@/lib/today-board";
import { fmtXp } from "./format";

/**
 * A row's steps under its title (today's rows only): one checkbox per step, ticked today or not. A tick goes to the
 * board, which sends it to the server (tickStep) to re-price what the task pays: the share of its steps ticked, or,
 * for a must, nothing until every step is done. A task already paid by a whole tick keeps its steps as a checklist.
 */
export function StepsList({
  steps,
  compulsory,
  paidXp,
  busy,
  onStep,
}: {
  steps: RowSteps;
  compulsory: boolean;
  /** What the task pays now through its steps (the partial paid row), or null. */
  paidXp: number | null;
  busy: boolean;
  onStep: (stepId: string, done: boolean, from: Element | null) => void;
}) {
  const done = new Set(steps.done);
  const n = steps.items.filter((s) => done.has(s.id)).length;
  const note = steps.checklist ? "Done in full: the steps are a checklist." : compulsory ? MUST_STEPS_NOTE : PART_STEPS_NOTE;
  return (
    <div className="t-steps" role="group" aria-label={`Steps: ${stepsLine(n, steps.items.length)}`}>
      <ul className="t-steps-list">
        {steps.items.map((s) => {
          const on = done.has(s.id);
          return (
            <li key={s.id}>
              <label className="t-step" data-done={on ? "1" : undefined}>
                <input
                  type="checkbox"
                  className="t-step-box"
                  checked={on}
                  disabled={busy}
                  onChange={(e) => onStep(s.id, e.currentTarget.checked, e.currentTarget)}
                />
                <span className="t-step-title">{s.title}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="t-steps-note">
        <span className="num">{stepsLine(n, steps.items.length)}</span>
        {paidXp != null && paidXp > 0 && steps.partial && <span> · paid {fmtXp(paidXp)} so far</span>}
        <span> · {note}</span>
      </p>
    </div>
  );
}
