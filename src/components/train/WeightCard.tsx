"use client";

/**
 * Train › Body weight: a record, never a reward (no XP, MP, streak or
 * celebration; nothing in the economy reads it).
 *
 *   header   the smoothed trend (large), 'Today 72.6 · trend 72.4', the
 *            change over 7 days in neutral words; with no weigh-in for a
 *            week it leads with 'Last weigh-in 2 Aug · 80.0 kg' instead and
 *            shows no trend figure (a carried trend is not today's)
 *   target   target and by-date, progress from start to target
 *            (role=progressbar), the projection sentence, the weekly rate,
 *            the gentle fast-loss note; without a target a quiet 'Set a target'
 *   chart    the last 90 days: dots, trend line, dashed target (WeightChart)
 *   log      WeightForm; history: the last 14 weigh-ins, Delete asks twice
 *
 * Everything it shows comes from the WeightView (src/lib/weight.ts); the
 * words come from weight-copy.ts. `actions` are the server actions (page)
 * or fakes (fixtures, train-check).
 */
import { useId, useState, useTransition } from "react";
import type { DayKey } from "@/lib/life-day";
import type { WeightUnit, WeightView } from "@/lib/weight";
import { announce } from "@/lib/celebrate";
import { Button } from "@/components/ui/Button";
import {
  calibratingSentence,
  changeSentence,
  dayLabel,
  figure,
  latestLine,
  progressPercent,
  progressText,
  projectionSentence,
  rateSentence,
  recentReadings,
  shortDay,
} from "./weight-copy";
import { WeightChart } from "./WeightChart";
import { WeightForm } from "./WeightForm";
import { GoalForm } from "./GoalForm";
import { REFRESH, type WeightActions } from "./types";

export const EMPTY_COPY = "No weigh-ins yet. Log one here, or type “weight 72.4” in the capture sheet.";

export function WeightCard({ view, today, actions }: { view: WeightView; today: DayKey; actions: WeightActions }) {
  const id = useId();
  const [goalOpen, setGoalOpen] = useState(false);
  const unit = view.unit;
  const hasTarget = view.goal.targetKg != null;
  const latest = latestLine(view, today);
  const change = changeSentence(view.change7Kg, unit);
  const rate = rateSentence(view.rate, unit);

  return (
    <section className="card pad-l wt-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="t-eyebrow wt-eyebrow">
        Body weight
      </h2>

      {view.latest == null ? (
        <p className="t-body wt-empty">{EMPTY_COPY}</p>
      ) : (
        <div className="wt-head">
          {view.stale && latest && <p className="t-body t-num ink-1">{latest}</p>}
          {!view.stale && view.trendKg != null && (
            <p className="wt-trend">
              <span className="t-numeral-l t-num">{figure(view.trendKg, unit)}</span>
              <span className="wt-trend-unit">{unit}</span>
              <span className="t-meta">trend</span>
            </p>
          )}
          {!view.stale && latest && <p className="t-meta t-num ink-1">{latest}</p>}
          {change && <p className="t-meta t-num">{change}</p>}
          {!hasTarget && (rate || view.rate.kind === "calibrating") && (
            <p className="t-meta t-num">{rate ? `Weekly rate: ${rate}` : calibratingSentence(view.rate)}</p>
          )}
        </div>
      )}

      {hasTarget ? (
        <TargetBlock view={view} today={today} onChange={() => setGoalOpen(true)} />
      ) : (
        <div className="wt-set">
          {view.fastLossNote && <p className="t-meta wt-note">{view.fastLossNote}</p>}
          <Button variant="quiet" onClick={() => setGoalOpen(true)}>
            Set a target
          </Button>
        </div>
      )}

      <WeightChart series={view.series} unit={unit} targetKg={view.goal.targetKg} today={today} />

      <WeightForm view={view} today={today} actions={actions} />

      <WeightHistory view={view} today={today} actions={actions} />

      <GoalForm open={goalOpen} onClose={() => setGoalOpen(false)} view={view} today={today} actions={actions} />
    </section>
  );
}

function TargetBlock({ view, today, onChange }: { view: WeightView; today: DayKey; onChange: () => void }) {
  const unit = view.unit;
  const { targetKg, targetDay, startKg } = view.goal;
  const pct = progressPercent(view.progress);
  const said = projectionSentence(view.projection, view.rate, targetDay, today);
  const rate = rateSentence(view.rate, unit);
  return (
    <div className="wt-target sunk">
      <div className="wt-target-h">
        <p className="t-body">
          Target <b className="t-num">{figure(targetKg as number, unit)} {unit}</b>
          {targetDay && <> by {shortDay(targetDay, today)}</>}
        </p>
        <Button variant="quiet" onClick={onChange} aria-label="Change target">
          Change
        </Button>
      </div>
      {pct != null && startKg != null && (
        <>
          <div
            className="meter wt-progress"
            role="progressbar"
            aria-label="Progress to target"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={progressText(view) ?? `${pct}%`}
          >
            <i className="base" style={{ ["--v" as string]: pct / 100 }} />
          </div>
          <div className="wt-ends t-num" aria-hidden="true">
            <span>{figure(startKg, unit)}</span>
            <span>{pct}%</span>
            <span>{figure(targetKg as number, unit)}</span>
          </div>
        </>
      )}
      {said && <p className="t-body wt-proj">{said}</p>}
      {rate && <p className="t-meta t-num">Weekly rate: {rate}</p>}
      {view.fastLossNote && <p className="t-meta wt-note">{view.fastLossNote}</p>}
    </div>
  );
}

function WeightHistory({ view, today, actions }: { view: WeightView; today: DayKey; actions: WeightActions }) {
  const id = useId();
  const rows = recentReadings(view.series, 14);
  const [armed, setArmed] = useState<DayKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (rows.length === 0) return null;

  function del(day: DayKey, kg: number, unit: WeightUnit) {
    if (armed !== day) {
      setArmed(day);
      setError(null);
      return;
    }
    startTransition(async () => {
      const res = await actions.deleteWeight(day, REFRESH);
      setArmed(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const when = dayLabel(day, today);
      announce(`Deleted the weigh-in of ${figure(kg, unit)} ${unit} for ${when === "Today" || when === "Yesterday" ? when.toLowerCase() : when}.`);
    });
  }

  return (
    <div className="wt-hist">
      <h3 id={`${id}-h`} className="t-eyebrow">
        Last {rows.length} weigh-in{rows.length === 1 ? "" : "s"}
      </h3>
      <ul className="wt-list" aria-labelledby={`${id}-h`}>
        {rows.map((r) => {
          const v = figure(r.kg, view.unit);
          const isArmed = armed === r.day;
          return (
            <li key={r.day} className="wt-item">
              <span className="wt-day">{dayLabel(r.day, today)}</span>
              <span className="wt-val t-num">
                {v} <span className="wt-u">{view.unit}</span>
              </span>
              <button
                type="button"
                className={isArmed ? "wt-del wt-armed" : "wt-del"}
                onClick={() => del(r.day, r.kg, view.unit)}
                onBlur={() => setArmed((a) => (a === r.day ? null : a))}
                disabled={pending}
                aria-label={isArmed ? `Delete ${v}? Tap again to delete the weigh-in for ${dayLabel(r.day, today)}` : `Delete the weigh-in for ${dayLabel(r.day, today)}, ${v} ${view.unit}`}
              >
                {isArmed ? `Delete ${v}?` : "Delete"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="t-error wt-msg">
          {error}
        </p>
      )}
    </div>
  );
}
