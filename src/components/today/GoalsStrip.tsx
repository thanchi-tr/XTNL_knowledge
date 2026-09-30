"use client";

import type { Horizon } from "@/lib/life-types";
import type { GoalCard } from "@/lib/today-board";

interface Props {
  goals: Record<Horizon, GoalCard[]>;
  busy: boolean;
  onProgress: (goalId: string) => void;
}

const HORIZONS: { key: Horizon; label: string; hint: string }[] = [
  { key: "SHORT", label: "Short", hint: "within a month" },
  { key: "MID", label: "Mid", hint: "within six months" },
  { key: "LONG", label: "Long", hint: "further out" },
];

/**
 * Goals in three horizons, each with an honest rollup: a goal measured by
 * its steps shows the share of one-off steps done, one measured by hand
 * shows its count against the target, and a goal with neither says so
 * rather than drawing a bar it cannot justify. Recurring children appear as
 * 'support habits N% kept' — context, not progress. Goals pay nothing yet;
 * their steps do.
 */
export function GoalsStrip({ goals, busy, onProgress }: Props) {
  const total = goals.SHORT.length + goals.MID.length + goals.LONG.length;

  return (
    <section className="card today-lane" aria-labelledby="goals-title">
      <div className="today-lane-head">
        <h2 id="goals-title" className="panel-title">
          Goals
        </h2>
        <span className="today-lane-count">{total === 0 ? "none yet" : `${total} open`}</span>
      </div>

      {total === 0 ? (
        <p className="today-empty">
          Capture one with <span className="mono">goal: read 12 books by dec</span>, then link steps to it with{" "}
          <span className="mono">^read</span>.
        </p>
      ) : (
        <div className="grid gap-3 px-3.5 pb-3.5 sm:grid-cols-3 fold:grid-cols-1">
          {HORIZONS.map((h) => (
            <div key={h.key} className="min-w-0">
              <p className="label-xs" title={h.hint}>
                {h.label} <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>· {goals[h.key].length}</span>
              </p>
              {goals[h.key].length === 0 ? (
                <p className="mt-1" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  —
                </p>
              ) : (
                <ul className="mt-1.5 grid gap-2.5">
                  {goals[h.key].map((g) => (
                    <li key={g.template.id} className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span style={{ fontSize: 12.5, color: "var(--ink-0)", lineHeight: 1.35, overflowWrap: "anywhere" }}>{g.template.title}</span>
                        {g.dueLabel && <span className="today-chip" data-tone={g.dueLabel.startsWith("late") ? "red" : undefined}>{g.dueLabel}</span>}
                      </div>
                      {g.progress != null && (
                        <div
                          className="today-bar mt-1.5"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(g.progress * 100)}
                          aria-label={`${g.template.title}: ${g.label}`}
                        >
                          <div className="today-bar-fill" style={{ width: `${Math.round(g.progress * 100)}%` }} />
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2" style={{ fontSize: 11, color: "var(--ink-2)" }}>
                        <span>{g.label}</span>
                        {g.metric === "MANUAL" && (
                          <button
                            type="button"
                            className="today-pill mono"
                            style={{ minWidth: 44, padding: "0 10px" }}
                            disabled={busy}
                            onClick={() => onProgress(g.template.id)}
                            aria-label={`Add one to ${g.template.title}`}
                          >
                            +1
                          </button>
                        )}
                      </div>
                      {g.support && <p style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{g.support}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
