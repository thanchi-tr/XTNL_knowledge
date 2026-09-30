"use client";

import { useEffect, useId, useRef } from "react";

/** The removal whose Undo last took focus. */
let lastFocused: string | null = null;

interface Props {
  /** Identifies this removal: focus moves to Undo once per id. */
  id: string;
  /** 'Archived', 'Dropped'. */
  verb: string;
  title: string;
  onUndo: () => void;
  /** Inside a sheet: a status line in the sheet rather than a floating toast. */
  inline?: boolean;
}

/**
 * 'Archived · Gym legs · Undo', for ten seconds after an Archive or a Drop.
 *
 * The removal is only sent when the ten seconds are up (TodayBoard holds
 * it), so Undo is free and certain rather than a second write racing the
 * first. The row the player acted on has just disappeared, taking focus
 * with it, so focus moves to Undo: a keyboard user is one Enter from
 * taking it back, and a screen reader hears what happened.
 */
export function UndoToast({ id, verb, title, onUndo, inline = false }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const textId = useId();

  // Once per removal: moving between the sheet and the page (the inbox
  // closing while the Undo lasts) remounts the toast, and must not pull
  // focus away from where the sheet just returned it.
  useEffect(() => {
    if (lastFocused === id) return;
    lastFocused = id;
    ref.current?.focus({ preventScroll: true });
  }, [id]);

  return (
    <div className={inline ? "today-undo-line" : "today-toast"} role="status" aria-live="polite">
      <span id={textId} className="today-toast-text">
        <span style={{ color: "var(--ink-2)" }}>{verb}</span> · <span className="today-toast-title">{title}</span>
      </span>
      <button ref={ref} type="button" className="today-toast-action" onClick={onUndo} aria-describedby={textId}>
        Undo
      </button>
    </div>
  );
}
