"use client";

import { useState, useTransition } from "react";
import { setFieldFocus } from "@/app/actions/focus";
import { fieldColor } from "@/lib/palette";
import type { FieldFocus } from "@/lib/field-focus";

/**
 * Which subjects are getting active attention right now.
 *
 * Framed as a per-Field toggle rather than a multi-select list, because the
 * decision is genuinely made one subject at a time — you put *this* one down
 * for a while — and because a list you have to re-confirm makes changing your
 * mind about a single Field feel like an edit to a settings page.
 *
 * The consequence of each state is printed on the row instead of being
 * explained once at the top. Maintenance is easy to misread as "archived" or
 * "paused", and it is neither: the Ideas keep coming due exactly as before.
 */

interface Props {
  fields: FieldFocus[];
}

export function FieldFocusPanel({ fields }: Props) {
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState(fields);
  const [error, setError] = useState<string | null>(null);
  // Reconcile when the server sends a fresh list, the same render-time
  // adjustment the loadout bar uses rather than an effect.
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

  return (
    <section className="card" style={{ padding: 16 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="panel-title">Fields of interest</p>
          <p className="panel-sub mt-0.5">
            {focused} of {local.length} active · the rest keep reviewing, but owe nothing new
          </p>
        </div>
        {isPending && (
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
            saving…
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2" style={{ fontSize: 11, color: "var(--red)" }}>
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {local.map((f) => {
          const accent = fieldColor(f.fieldName);
          return (
            <li key={f.fieldId}>
              <button
                type="button"
                onClick={() => toggle(f.fieldId, !f.interested)}
                disabled={isPending}
                aria-pressed={f.interested}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                style={{
                  borderRadius: 10,
                  cursor: "pointer",
                  background: f.interested ? "var(--green-10)" : "var(--sub)",
                  border: `1px solid ${f.interested ? "rgba(0,204,122,.28)" : "var(--line)"}`,
                  opacity: f.interested ? 1 : 0.72,
                  transition: "background .15s ease, border-color .15s ease, opacity .15s ease",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: accent,
                    flexShrink: 0,
                    boxShadow: f.interested ? `0 0 7px ${accent}` : "none",
                  }}
                />

                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate"
                    style={{ fontSize: 12.5, fontWeight: 600, color: f.interested ? "var(--ink-0)" : "var(--ink-1)" }}
                  >
                    {f.fieldName}
                  </span>
                  <span className="block" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 1 }}>
                    {f.interested
                      ? "Weekly quota · encounters enabled"
                      : "Maintenance — reviews continue, no quota, no encounters"}
                  </span>
                </span>

                <span className="mono shrink-0" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                  L{f.fieldLevel.toFixed(1)} · {f.ideaCount}
                </span>

                <span
                  aria-hidden
                  className="shrink-0"
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: f.interested ? "var(--green)" : "var(--ink-3)",
                  }}
                >
                  {f.interested ? "Active" : "Paused"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {focused === 0 && local.length > 0 && (
        <p className="mt-2.5" style={{ fontSize: 10.5, color: "var(--amber)", lineHeight: 1.5 }}>
          Every field is in maintenance. Reviews carry on as normal, but nothing will ask for new ideas and no
          encounters will appear until you mark one active.
        </p>
      )}
    </section>
  );
}
