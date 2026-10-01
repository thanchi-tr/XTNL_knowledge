"use client";

/**
 * The target, in a kit Sheet: a figure in the user's unit and an optional
 * by-date. It says where progress is measured from (the server records
 * today's trend as the start when the target is set or changed). Save sends
 * the target only when its figure was changed, so editing just the by-date
 * keeps the start (goalSaveInput). A by-date that has passed is not
 * prefilled: the sheet says so and keeps it unless a new one is picked.
 * Clear target asks once more ('Clear the target?') before it goes.
 *
 * <GoalFields/> is the sheet's body, exported so scripts/train-check.ts can
 * render it (the Sheet itself renders nothing until it opens in a browser).
 */
import { useId, useState, useTransition, type FormEvent } from "react";
import { addDays, type DayKey } from "@/lib/life-day";
import type { WeightView } from "@/lib/weight";
import { announce } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { byDatePassedNote, byDatePrefill, figure, goalSaveInput, sameTargetText, shortDay, startSentence } from "./weight-copy";
import { REFRESH, type WeightActions } from "./types";

export function GoalForm({
  open,
  onClose,
  view,
  today,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  view: WeightView;
  today: DayKey;
  actions: WeightActions;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={view.goal.targetKg != null ? "Change target" : "Set a target"} description="A record, not a race. Change or clear it any time.">
      {open && <GoalFields view={view} today={today} actions={actions} onDone={onClose} />}
    </Sheet>
  );
}

export function GoalFields({ view, today, actions, onDone }: { view: WeightView; today: DayKey; actions: WeightActions; onDone: () => void }) {
  const id = useId();
  const unit = view.unit;
  const has = view.goal.targetKg != null;
  const [text, setText] = useState(has ? figure(view.goal.targetKg as number, unit) : "");
  const [date, setDate] = useState<string>(byDatePrefill(view.goal.targetDay, today));
  const [dateEdited, setDateEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armClear, setArmClear] = useState(false);
  const [pending, startTransition] = useTransition();

  // Changing: the typed figure is not the prefilled one (compared in the unit, not in kg).
  const changing = !has || (text.trim() !== "" && !sameTargetText(text, view));
  const minDay = addDays(today, 1);
  const passedNote = dateEdited ? null : byDatePassedNote(view.goal.targetDay, today);

  function save(e: FormEvent) {
    e.preventDefault();
    const s = goalSaveInput({ text, date, dateEdited, view, today });
    if (!s.ok) {
      setError(s.error);
      return;
    }
    setError(null);
    const by = s.input.targetDay === undefined ? view.goal.targetDay : s.input.targetDay;
    startTransition(async () => {
      const res = await actions.setWeightGoal(s.input, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      announce(`Target set: ${s.value.toFixed(1)} ${unit}${by ? ` by ${shortDay(by as DayKey, today)}` : ""}.`);
      onDone();
    });
  }

  function clear() {
    if (!armClear) {
      setArmClear(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await actions.setWeightGoal({ targetKg: null, targetDay: null }, REFRESH);
      if (!res.ok) {
        setError(res.error);
        setArmClear(false);
        return;
      }
      announce("Target cleared.");
      onDone();
    });
  }

  return (
    <form className="wt-goal" onSubmit={save} noValidate>
      <label htmlFor={`${id}-t`} className="wt-label">
        Target weight
      </label>
      <div className="wt-field">
        <input
          id={`${id}-t`}
          className="wt-input t-num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-autofocus
          value={text}
          placeholder={unit === "kg" ? "70.0" : "154.0"}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-s${error ? ` ${id}-e` : ""}`}
          disabled={pending}
        />
        <span className="wt-unit-tag" aria-hidden="true">
          {unit}
        </span>
      </div>
      <p id={`${id}-s`} className="t-meta wt-hint">
        {startSentence(view, changing)}
      </p>
      <label htmlFor={`${id}-d`} className="wt-label">
        By (optional)
      </label>
      <input
        id={`${id}-d`}
        className="wt-input wt-date"
        type="date"
        min={minDay}
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          setDateEdited(true);
          if (error) setError(null);
        }}
        aria-describedby={passedNote ? `${id}-p` : undefined}
        disabled={pending}
      />
      {passedNote && (
        <p id={`${id}-p`} className="t-meta wt-hint">
          {passedNote}
        </p>
      )}
      {error && (
        <p id={`${id}-e`} role="alert" className="t-error wt-msg">
          {error}
        </p>
      )}
      <div className="wt-row wt-goal-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {has && (
          <Button type="button" variant={armClear ? "secondary" : "quiet"} onClick={clear} onBlur={() => setArmClear(false)} disabled={pending}>
            {armClear ? "Clear the target?" : "Clear target"}
          </Button>
        )}
      </div>
    </form>
  );
}
