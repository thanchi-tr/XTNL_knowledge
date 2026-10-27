"use client";

/**
 * One set row of the lift logger (health-brief §3.5; 344 px first). On one line at 278 px: the number chip (44: 'W', '1',
 * 'D', 'R'; it opens the kind menu), the weight (76+), the reps (56+), ✓ (44), 8 px apart. No steppers on that line:
 * they appear on a second line only while a field is focused (one step a tap, five on a long press), and the tap keeps
 * the field focused. Every target is 44 px or more; inputs are 16 px with a decimal or numeric keyboard.
 *
 *   draft  the fields hold what was typed over a grey ghost (the last lift's set, or the row it copies): ✓ accepts
 *          the ghost where nothing was typed (one tap); Enter on the first field moves to the second (the keyboard's
 *          Next), Enter on the last field logs it (Done)
 *   saved  the logged figures; a figure or the filled ✓ opens Fix (data-done: a plain button, never a toggle)
 *   fix    the fields hold the set's figures; ✓ (or Enter on the last field) saves the change
 *
 * Presentational: the logger owns the values, the chain and the server calls; the lines under the row (plate math, the
 * big-jump question, the kind menu, an error) come in as children. It says which field is focused (onActive) and can
 * be asked to focus one once (autoFocusField: a new drop's reps).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { steppedOf, type FieldKey } from "./lift-model";

export interface SetRowField {
  key: FieldKey;
  /** The field's name for a screen reader, with its row ('Set 2: weight, kg per dumbbell', 'Warm-up: reps'). */
  label: string;
  value: string;
  /** The grey prefill (what ✓ saves where nothing is typed). */
  ghost: string;
  /** A saved set's figure ('62.5', '+10', 'assist 20', '1:05'). */
  cell: string;
  mode: "decimal" | "numeric";
  /** One stepper tap, in the unit shown; null: no stepper. */
  step: number | null;
  /** A bodyweight load may go under 0 (assistance). */
  signed: boolean;
}

export type SetRowState = "draft" | "saved" | "fix";

const LONG_PRESS_MS = 500;
const LONG_PRESS_STEPS = 5;
const stepText = (n: number): string => String(Math.round(n * 1000) / 1000);

function Steps({ field, onChange }: { field: SetRowField; onChange: (key: FieldKey, value: string) => void }) {
  const hold = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });
  const step = field.step;
  if (step == null) return null;
  const apply = (dir: 1 | -1, times: number) => onChange(field.key, steppedOf(field.value, field.ghost, step * dir, times, field.signed));
  const clear = () => {
    if (hold.current.timer != null) window.clearTimeout(hold.current.timer);
    hold.current.timer = null;
  };
  const button = (dir: 1 | -1) => (
    <Button
      variant="secondary"
      className="wt-lift-stepb"
      aria-label={`${dir < 0 ? "Less" : "More"}: ${stepText(step)} (hold for ${stepText(step * LONG_PRESS_STEPS)})`}
      // The field keeps its focus (and the phone its keyboard): the button never takes it.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={() => {
        hold.current.fired = false;
        clear();
        hold.current.timer = window.setTimeout(() => {
          hold.current.fired = true;
          apply(dir, LONG_PRESS_STEPS);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={() => {
        if (hold.current.fired) {
          hold.current.fired = false;
          return;
        }
        apply(dir, 1);
      }}
    >
      {dir < 0 ? "−" : "+"} {stepText(step)}
    </Button>
  );
  return (
    <div className="wt-lift-steps" role="group" aria-label={`${field.label}: steps`}>
      {button(-1)}
      {button(1)}
    </div>
  );
}

export function SetRow({
  id,
  chip,
  chipLabel,
  state,
  a,
  b,
  onChange,
  doneLabel,
  onDone,
  onOpenFix,
  onChip,
  menuOpen,
  busy,
  initialActive = null,
  onActive,
  autoFocusField = null,
  onAutoFocused,
  errorId = null,
  children,
}: {
  id: string;
  chip: string;
  chipLabel: string;
  state: SetRowState;
  a: SetRowField | null;
  b: SetRowField | null;
  onChange: (key: FieldKey, value: string) => void;
  doneLabel: string;
  /** Draft: log it. Fix: save the change. Saved: open Fix. */
  onDone: () => void;
  /** A saved figure tapped: Fix, that field first. */
  onOpenFix?: (key: FieldKey) => void;
  onChip: () => void;
  menuOpen: boolean;
  busy: boolean;
  /** A fixture's focused field (its steppers shown). */
  initialActive?: FieldKey | null;
  /** A field took the focus (its key), or the focus left the row (null). */
  onActive?: (field: FieldKey | null) => void;
  /** Focus this field once (a new drop's reps), then onAutoFocused. */
  autoFocusField?: FieldKey | null;
  onAutoFocused?: () => void;
  /** The row's error line (its id): the fields say they are invalid and are described by it. */
  errorId?: string | null;
  children?: ReactNode;
}) {
  const [active, setActive] = useState<FieldKey | null>(initialActive);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const editing = state !== "saved";
  const focused = editing ? [a, b].find((f) => f && f.key === active) ?? null : null;

  useEffect(() => {
    if (!autoFocusField || busy) return;
    document.getElementById(`${id}-${autoFocusField}`)?.focus();
    onAutoFocused?.();
  }, [autoFocusField, busy, id, onAutoFocused]);

  /** A field; `next` is the field after it on the row (Enter moves there), null on the last one (Enter is ✓). */
  const cell = (f: SetRowField | null, next: SetRowField | null) => {
    if (!f) return <span className="wt-lift-none" aria-hidden="true" />;
    if (!editing) {
      return (
        <Button variant="secondary" className="wt-lift-val t-num" aria-label={`${f.label}: ${f.cell || "none"}. Fix it`} onClick={() => onOpenFix?.(f.key)} disabled={busy}>
          {f.cell || "–"}
        </Button>
      );
    }
    return (
      <input
        id={`${id}-${f.key}`}
        className="wt-input wt-lift-in t-num"
        inputMode={f.mode}
        enterKeyHint={next ? "next" : "done"}
        autoComplete="off"
        aria-label={f.label}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId ?? undefined}
        placeholder={f.ghost}
        value={f.value}
        disabled={busy}
        onChange={(e) => onChange(f.key, e.currentTarget.value)}
        onFocus={() => {
          setActive(f.key);
          onActive?.(f.key);
        }}
        onBlur={() => {
          // A stepper tap keeps the focus here; anything else outside the row closes the steppers.
          window.setTimeout(() => {
            if (boxRef.current?.contains(document.activeElement)) return;
            setActive(null);
            onActive?.(null);
          }, 0);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          // The first field's Enter moves on to the second (its steppers follow the focus); the last one's logs.
          if (next) document.getElementById(`${id}-${next.key}`)?.focus();
          else onDone();
        }}
      />
    );
  };

  return (
    <div ref={boxRef} className={`wt-lift-set${state === "draft" ? " wt-lift-draft" : ""}`} data-row={id}>
      <div className="wt-lift-row">
        <Button variant="secondary" className="wt-lift-chip t-num" aria-label={chipLabel} aria-expanded={menuOpen} onClick={onChip} disabled={busy}>
          {chip}
        </Button>
        {cell(a, b)}
        {cell(b, null)}
        <Button variant="secondary" icon="check" className="wt-lift-done" aria-label={doneLabel} data-done={state === "saved" ? "" : undefined} onClick={onDone} disabled={busy} />
      </div>
      {focused && <Steps field={focused} onChange={onChange} />}
      {children}
    </div>
  );
}
