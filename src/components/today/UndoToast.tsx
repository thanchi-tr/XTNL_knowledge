"use client";

import { useEffect, useId, useRef } from "react";

/** The removal whose Undo last took focus. */
let lastFocused: string | null = null;

/** Moves focus to an Undo once per removal id (the row that held focus has just gone). */
export function focusUndoOnce(id: string, el: HTMLElement | null | undefined): void {
  if (!el || lastFocused === id) return;
  lastFocused = id;
  el.focus({ preventScroll: true });
}

interface Props {
  /** Identifies this removal: focus moves to Undo once per id. */
  id: string;
  /** 'Archived', 'Dropped'. */
  verb: string;
  title: string;
  onUndo: () => void;
}

/**
 * 'Dropped · Book dentist · Undo', as a status line inside a sheet, for ten
 * seconds after a Drop made there. (On the board the same Undo is a toast
 * in the app's ToastDock; inside a sheet the dock would sit under the
 * scrim, so the sheet carries its own line.)
 *
 * The row the player acted on has just disappeared, taking focus with it,
 * so focus moves to Undo: a keyboard user is one Enter from taking it back,
 * and a screen reader hears what happened.
 */
export function UndoToast({ id, verb, title, onUndo }: Props) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const textId = useId();

  // Once per removal: the sheet closing while the Undo lasts moves it to the
  // dock, and must not pull focus away from where the sheet returned it.
  useEffect(() => {
    focusUndoOnce(id, ref.current);
  }, [id]);

  return (
    <div className="today-undo-line" role="status" aria-live="polite">
      <span id={textId} className="txt">
        <span className="ink-2">{verb}</span> · <b>{title}</b>
      </span>
      <button ref={ref} type="button" className="btn btn-quiet" onClick={onUndo} aria-describedby={textId}>
        Undo
      </button>
    </div>
  );
}
