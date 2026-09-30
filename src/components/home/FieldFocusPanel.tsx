"use client";

import { useState, useTransition } from "react";
import { setFieldFocus } from "@/app/actions/focus";
import type { FieldFocus } from "@/lib/field-focus";
import { Switch } from "@/components/ui/Tabs";
import "@/components/settings/settings.css";

/**
 * Which subjects are getting active attention right now (Settings › Study).
 *
 * A per-Field switch rather than a multi-select list: the decision is made one
 * subject at a time (you put *this* one down for a while), and a list you have
 * to re-confirm makes changing your mind about one Field feel like an edit.
 *
 * Each row prints its consequence. Maintenance is easy to misread as
 * "archived" or "paused", and it is neither: the Ideas keep coming due
 * exactly as before; the Field just owes no new ideas and raises no
 * encounters.
 *
 * `variant="card"` (default) is the standalone panel; `"bare"` drops the card
 * and heading for a sheet that already has its own.
 */

interface Props {
  fields: FieldFocus[];
  variant?: "card" | "bare";
}

export function FieldFocusPanel({ fields, variant = "card" }: Props) {
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState(fields);
  const [error, setError] = useState<string | null>(null);
  // Reconcile when the server sends a fresh list (a render-time adjustment, not an effect).
  const [lastProps, setLastProps] = useState(fields);
  if (lastProps !== fields) {
    setLastProps(fields);
    setLocal(fields);
  }

  function toggle(fieldId: string, next: boolean) {
    setError(null);
    setLocal((prev) => prev.map((f) => (f.fieldId === fieldId ? { ...f, interested: next } : f)));
    startTransition(async () => {
      const res = await setFieldFocus(fieldId, next);
      if (!res.ok) {
        setError(res.error);
        setLocal(fields);
      }
    });
  }

  const focused = local.filter((f) => f.interested).length;
  const level = (l: number) => {
    const r = Math.round(l * 10) / 10;
    return `L${Number.isInteger(r) ? r : r.toFixed(1)}`;
  };

  const body = (
    <>
      <p className="t-meta" aria-live="polite">
        {focused} of {local.length} active. The rest keep reviewing, but owe nothing new.
        {isPending ? " Saving…" : ""}
      </p>
      {error && (
        <p role="alert" className="t-meta" style={{ color: "var(--owed)", marginTop: 6 }}>
          {error}
        </p>
      )}
      <ul className="foc-list" style={{ marginTop: 8 }}>
        {local.map((f) => (
          <li key={f.fieldId}>
            <div className="foc-row" data-on={f.interested}>
              <div className="n">
                <b>{f.fieldName}</b>
                <span>
                  {level(f.fieldLevel)} · {f.ideaCount.toLocaleString("en-GB")} idea{f.ideaCount === 1 ? "" : "s"} ·{" "}
                  {f.interested ? "weekly quota and encounters on" : "maintenance: reviews continue, no quota, no encounters"}
                </span>
              </div>
              <Switch
                checked={f.interested}
                onChange={(next) => toggle(f.fieldId, next)}
                disabled={isPending}
                label={`${f.fieldName} active`}
              />
            </div>
          </li>
        ))}
      </ul>
      {focused === 0 && local.length > 0 && (
        <p className="t-meta ink-1" style={{ marginTop: 10 }}>
          Every field is in maintenance. Reviews carry on as normal, but nothing will ask for new ideas and no encounters will
          appear until you switch one on.
        </p>
      )}
    </>
  );

  if (variant === "bare") return <div>{body}</div>;

  return (
    <section className="card pad-l" aria-labelledby="foc-h">
      <h2 id="foc-h" className="t-display-s" style={{ margin: "0 0 4px" }}>
        Fields of interest
      </h2>
      {body}
    </section>
  );
}
