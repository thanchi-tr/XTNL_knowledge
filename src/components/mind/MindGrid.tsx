"use client";

/**
 * The mood grid (health-2026-10-27.md D1; brief §2.1): pleasantness across, energy up, 9 × 9 steps (−4..+4 each),
 * drawn as four soft quadrants with their corner words and the two axis labels. ONE control, not 81 buttons: at
 * 344 px a cell is about 35 px, under the 44 px floor, and a ±1-cell slip is inside the measurement error anyway.
 *
 *   pointer   a tap snaps to the nearest cell (mind.ts cellAt); a click, so a finger that scrolls the sheet picks nothing
 *   keyboard  the arrow keys move the cell one step (moveCell; one not yet picked starts at the centre), Home and End
 *             to the left and right edges, Page Up and Page Down to the top and bottom; Enter or Space confirms (the
 *             centre, when nothing was picked) and hands focus on (onConfirm: the stress row). A key with Ctrl, Cmd or
 *             Alt held is left to the browser
 *   a11y      role="slider" with an accessible name (GRID_LABEL), aria-valuetext in words (gridValueTextOf) and a
 *             visually hidden description naming the four areas and the keys; the drawn words are aria-hidden.
 *             A touch screen reader's double tap lands on the control's centre, and its swipe up or down moves one
 *             axis at most, so two visually hidden native range inputs sit beside it (outside it), one an axis
 *             (Pleasantness, Energy; AXIS_LABELS), each spoken in words; their increment and decrement are real on
 *             VoiceOver and TalkBack. They take no Tab stop (tabIndex -1): the keyboard has the grid, and a stop no one
 *             can see would hide the focus
 *
 * The quadrants are two neutral shades, diagonal pairs alike, so no area reads as the good one: no hue, no colour
 * judgement. The pick is an ink dot, the same for every cell. Nothing animates.
 *
 * Exports
 *   MindGrid({ value, onChange, onConfirm?, id? })   the control
 *   GridCell                                          { valence, energy }
 *   useOpenClock(open)                                the tookMs clock: () => ms since the sheet opened, or null
 */
import { useEffect, useId, useRef, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  AXIS_LABELS,
  AXIS_WORDS,
  CORNER_WORDS,
  GRID_LABEL,
  GRID_MAX,
  GRID_MIN,
  GRID_STEPS,
  QUADRANTS,
  cellAt,
  cellWordsOf,
  gridValueTextOf,
  moveCell,
  signedStep,
} from "@/lib/mind";

export interface GridCell {
  valence: number;
  energy: number;
}

const CENTRE: GridCell = { valence: 0, energy: 0 };
const NOT_PICKED = "Nothing picked yet. Arrow keys move one step, Enter picks.";
/** A whole axis in one key press (moveCell holds it at the edge). */
const EDGE = GRID_STEPS - 1;
const KEYS: Readonly<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  Home: [-EDGE, 0],
  End: [EDGE, 0],
  PageUp: [0, EDGE],
  PageDown: [0, -EDGE],
};
type Axis = "valence" | "energy";
const AXES: readonly Axis[] = ["valence", "energy"];

/**
 * The 5-second claim is measured, not asserted (D1): the time from the sheet opening to Save, in ms, read when Save is
 * tapped. Monotonic (performance.now), so a clock change mid check-in can't skew it; null before the sheet has opened.
 */
export function useOpenClock(open: boolean): () => number | null {
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    openedAt.current = open ? performance.now() : null;
  }, [open]);
  return () => (openedAt.current == null ? null : Math.round(performance.now() - openedAt.current));
}

export function MindGrid({
  value,
  onChange,
  onConfirm,
  id,
}: {
  value: GridCell | null;
  /** A tap or an arrow key: the cell now picked. */
  onChange: (cell: GridCell) => void;
  /** Enter or Space on the grid: the pick is made, move on. */
  onConfirm?: () => void;
  id?: string;
}) {
  const autoId = useId();
  const gid = id ?? autoId;
  const col = value ? value.valence - GRID_MIN : null;
  const row = value ? GRID_MAX - value.energy : null;
  // One number for aria-valuenow (row-major, 0..80); the words are aria-valuetext.
  const index = value ? (GRID_MAX - value.energy) * GRID_STEPS + (value.valence - GRID_MIN) : Math.floor((GRID_STEPS * GRID_STEPS) / 2);

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const cell = cellAt(e.clientX - box.left, e.clientY - box.top, box.width, box.height);
    if (cell) onChange(cell);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = KEYS[e.key];
    if (step) {
      e.preventDefault();
      onChange(moveCell(value, step[0], step[1]));
      return;
    }
    // A modified key is the browser's (the house binds no chord but undo), so the grid never picks the centre under it.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!value) onChange(CENTRE);
      onConfirm?.();
    }
  }

  /** One axis from its range input; the other axis is kept (the centre's 0 when nothing is picked yet). */
  function onAxis(axis: Axis, e: ChangeEvent<HTMLInputElement>) {
    const n = Math.round(Number(e.target.value));
    if (!Number.isFinite(n)) return;
    const from = value ?? CENTRE;
    onChange({ ...from, [axis]: Math.min(GRID_MAX, Math.max(GRID_MIN, n)) });
  }

  /** The range input's words: 'Pleasantness +2 · Calm, content', or that nothing is picked yet. */
  const axisText = (axis: Axis): string =>
    value ? `${AXIS_LABELS[axis]} ${signedStep(value[axis])} · ${cellWordsOf(value.valence, value.energy)}` : `${AXIS_LABELS[axis]}: nothing picked yet`;

  return (
    <div className="mind-grid-box">
      <p className="mind-axis mind-axis-top" aria-hidden="true">
        ↑ {AXIS_WORDS.energy.high}
      </p>
      <div
        id={gid}
        role="slider"
        tabIndex={0}
        data-autofocus=""
        aria-label={GRID_LABEL}
        aria-roledescription="mood grid"
        aria-describedby={`${gid}-d`}
        aria-valuemin={0}
        aria-valuemax={GRID_STEPS * GRID_STEPS - 1}
        aria-valuenow={index}
        aria-valuetext={value ? gridValueTextOf(value.valence, value.energy) : NOT_PICKED}
        className="mind-grid"
        data-picked={value ? "" : undefined}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {QUADRANTS.map((q) => (
          <span key={q} className="mind-q" data-q={q} aria-hidden="true">
            {CORNER_WORDS[q]}
          </span>
        ))}
        <span className="mind-line mind-line-v" aria-hidden="true" />
        <span className="mind-line mind-line-h" aria-hidden="true" />
        {col != null && row != null && <span className="mind-pick" style={{ ["--c" as string]: col, ["--r" as string]: row }} aria-hidden="true" />}
      </div>
      <p className="mind-axis mind-axis-bottom" aria-hidden="true">
        <span>← {AXIS_WORDS.valence.low}</span>
        <span>↓ {AXIS_WORDS.energy.low}</span>
        <span>{AXIS_WORDS.valence.high} →</span>
      </p>
      <p id={`${gid}-d`} className="sr-only">
        Four areas: {CORNER_WORDS.tense} at the top left, {CORNER_WORDS.excited} at the top right, {CORNER_WORDS.low} at the bottom left,{" "}
        {CORNER_WORDS.calm} at the bottom right. Arrow keys move one step, Home, End, Page Up and Page Down go to an edge; Enter or Space picks.
        On a touch screen reader, the Pleasantness and Energy sliders after this set one axis each.
      </p>
      {AXES.map((axis) => (
        <input
          key={axis}
          type="range"
          className="sr-only"
          tabIndex={-1}
          min={GRID_MIN}
          max={GRID_MAX}
          step={1}
          value={value ? value[axis] : 0}
          aria-label={AXIS_LABELS[axis]}
          aria-valuetext={axisText(axis)}
          onChange={(e) => onAxis(axis, e)}
        />
      ))}
    </div>
  );
}
