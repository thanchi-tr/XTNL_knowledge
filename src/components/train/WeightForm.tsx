"use client";

/**
 * Log a weigh-in: one figure in the user's unit (the suffix button switches
 * kg/lb and saves the unit), a 'Yesterday' toggle, and one 44 px button that
 * reads 'Update today' once today has a reading (one per life day: a second
 * one replaces it). Errors are said inline; a save is announced politely and
 * the action re-renders the page in its own response (refresh: true). A
 * saved unit is handed to the capture sheet as well (saveWeightUnit). Nothing
 * is paid for a weigh-in.
 */
import { useId, useState, useTransition, type FormEvent } from "react";
import type { DayKey } from "@/lib/life-day";
import type { WeightUnit, WeightView } from "@/lib/weight";
import { announce } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";
import { saveWeightUnit } from "@/components/capture/capture-store";
import { ChipButton } from "@/components/ui/Chip";
import { logLabel, parseFigure, yesterdayOf } from "./weight-copy";
import { REFRESH, wasReplaced, type WeightActions } from "./types";

export function WeightForm({ view, today, actions }: { view: WeightView; today: DayKey; actions: WeightActions }) {
  const id = useId();
  const [text, setText] = useState("");
  const [yesterday, setYesterday] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>(view.unit);
  const [seenUnit, setSeenUnit] = useState<WeightUnit>(view.unit);
  const [pending, startTransition] = useTransition();
  const [unitPending, startUnit] = useTransition();

  // The saved unit wins once the server answers (adjusting state during render, not in an effect).
  if (seenUnit !== view.unit) {
    setSeenUnit(view.unit);
    setUnit(view.unit);
  }

  const yKey = yesterdayOf(today);
  const loggedYesterday = view.series.some((p) => p.day === yKey && p.kg != null);
  const label = logLabel(view.loggedToday, yesterday, loggedYesterday);

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(null);
    const parsed = parseFigure(text, unit);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    const day = yesterday ? yKey : undefined;
    startTransition(async () => {
      const res = await actions.logWeight({ value: parsed.value, unit, day }, REFRESH);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const when = yesterday ? "yesterday" : "today";
      const said = `${wasReplaced(res.value) ? `Updated ${when} to` : "Logged"} ${parsed.value.toFixed(1)} ${unit}${wasReplaced(res.value) ? "" : ` for ${when}`}.`;
      setSaved(said);
      announce(said);
      setText("");
      setYesterday(false);
    });
  }

  function switchUnit() {
    const next: WeightUnit = unit === "kg" ? "lb" : "kg";
    setUnit(next);
    setError(null);
    startUnit(async () => {
      const res = await actions.setWeightGoal({ unit: next }, REFRESH);
      if (!res.ok) {
        setUnit(view.unit);
        setError(res.error);
        return;
      }
      // The capture sheet reads a bare 'w 72.4' in the unit too: tell it now, not at its next vocabulary load.
      saveWeightUnit(next);
      announce(`Weights now show in ${next === "kg" ? "kilograms" : "pounds"}.`);
    });
  }

  return (
    <form className="wt-form" onSubmit={submit} noValidate aria-labelledby={`${id}-l`}>
      <label id={`${id}-l`} htmlFor={`${id}-v`} className="wt-label">
        {yesterday ? "Yesterday's weight" : "Today's weight"}
      </label>
      <div className="wt-field">
        <input
          id={`${id}-v`}
          className="wt-input t-num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={unit === "kg" ? "72.4" : "159.6"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : undefined}
          disabled={pending}
        />
        <button
          type="button"
          className="wt-unit-btn"
          onClick={switchUnit}
          disabled={unitPending || pending}
          aria-label={`Unit: ${unit}. Switch to ${unit === "kg" ? "lb" : "kg"}`}
        >
          {unit}
        </button>
      </div>
      <div className="wt-row">
        <ChipButton pressed={yesterday} onClick={() => setYesterday((v) => !v)} disabled={pending}>
          Yesterday
        </ChipButton>
        <Button type="submit" variant="primary" className="wt-log" disabled={pending}>
          {pending ? "Saving…" : label}
        </Button>
      </div>
      {error && (
        <p id={`${id}-e`} role="alert" className="t-error wt-msg">
          {error}
        </p>
      )}
      {saved && !error && <p className="t-meta wt-msg">{saved}</p>}
    </form>
  );
}
