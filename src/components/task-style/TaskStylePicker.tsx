"use client";

/**
 * The task drawer's icon and colour: a row of icons and a row of colour swatches (each with its name for screen
 * readers and on hover), saved on tap through setTaskStyle; [Default] clears both. The board re-renders with the
 * style on the row.
 */
import { useState, useTransition } from "react";
import { TASK_COLORS, TASK_COLOR_NAMES, TASK_ICON_NAMES, type TaskColor, type TaskIcon as IconName, type TaskStyle } from "@/lib/task-style";
import { setTaskStyle } from "@/app/actions/task-style";
import { TaskIcon } from "./TaskIcon";

type Saver = (templateId: string, style: { icon: string | null; color: string | null }) => Promise<{ ok: true; value: TaskStyle } | { ok: false; error: string }>;

export function TaskStylePicker({ templateId, style, save = setTaskStyle }: { templateId: string; style?: TaskStyle | null; save?: Saver }) {
  const [shown, setShown] = useState<TaskStyle>({ icon: style?.icon ?? null, color: style?.color ?? null });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const apply = (next: TaskStyle) => {
    const before = shown;
    setShown(next);
    setError(null);
    start(async () => {
      const res = await save(templateId, next);
      if (!res.ok) {
        setShown(before);
        setError(res.error);
      }
    });
  };
  return (
    <div className="tsk-pick" aria-busy={pending}>
      <div className="tsk-pick-row" role="radiogroup" aria-label="Icon">
        {TASK_ICON_NAMES.map((name: IconName) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={shown.icon === name}
            className="tsk-opt"
            title={name}
            aria-label={`Icon: ${name}`}
            onClick={() => apply({ ...shown, icon: name })}
          >
            <TaskIcon style={{ icon: name, color: shown.color }} size={18} />
          </button>
        ))}
      </div>
      <div className="tsk-pick-row" role="radiogroup" aria-label="Colour">
        {TASK_COLOR_NAMES.map((name: TaskColor) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={shown.color === name}
            className="tsk-opt tsk-sw"
            title={name}
            aria-label={`Colour: ${name}`}
            style={{ ["--tsk-sw" as string]: TASK_COLORS[name] }}
            onClick={() => apply({ ...shown, color: name })}
          >
            <span aria-hidden="true" />
          </button>
        ))}
        {(shown.icon || shown.color) && (
          <button type="button" className="today-pill tsk-reset" onClick={() => apply({ icon: null, color: null })}>
            Default
          </button>
        )}
      </div>
      {error && <p className="t-meta tsk-err" role="alert">{error}</p>}
    </div>
  );
}
