/**
 * FROZEN CONTRACT — Tick (L0-foundation).
 *
 *   <Tick shape="circle|diamond" state="open|done|minimum" label="Morning meds" onClick={toggle}/>
 *
 *   A 44 target around a 24 circle (todos) or a 21 diamond (musts). Ring border
 *   is line-ctl. role=checkbox with aria-checked (minimum counts as kept).
 *   Press scales the ring to .88; done fills kept and the check draws via
 *   stroke-dashoffset in 220 ms; minimum is a half-filled ring (pair it with
 *   the words "Minimum kept" in the row's meta). Resting CSS is the final
 *   state, so Still shows the finished tick with no motion.
 */
import type { ComponentProps } from "react";
import { cx } from "./cx";

export type TickState = "open" | "done" | "minimum";

interface TickProps extends Omit<ComponentProps<"button">, "children" | "role"> {
  shape?: "circle" | "diamond";
  state: TickState;
  /** What is being kept ("Morning meds"). */
  label: string;
}

export function Tick({ shape = "circle", state, label, className, type = "button", ...rest }: TickProps) {
  const kept = state !== "open";
  return (
    <button
      {...rest}
      type={type}
      role="checkbox"
      aria-checked={kept}
      aria-label={state === "minimum" ? `${label}, minimum kept` : label}
      className={cx("tick", className)}
      data-shape={shape}
      data-state={state}
    >
      <span className="ring" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </button>
  );
}
