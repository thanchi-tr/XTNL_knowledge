/**
 * A movement's records, reachable from its entry in the lift (health-brief §3.4; r-training §11): derived on the
 * server from finished lifts (training.ts movementRecordsOf, liftMomentsOf) and shown quietly, the same words for every
 * value. The heaviest working set, the best e1RM with the set it is estimated from ('estimated from 5 × 100 kg'), the
 * rep-max table (the most lifted for at least 1, 2, 3, 5, 8, 10, 12 and 15 reps), the best session's volume, a hold's
 * longest and a carry's best, its new bests (PR moments: a line each, never a celebration or a ledger row) and its
 * newest lifts set by set. A bodyweight movement with no weigh-in says it counts reps only. A history past one read's
 * cap says from when it is read ('since 12 Mar 2024'), never all time. No hooks.
 */
import type { WeightUnit } from "@/lib/weight";
import {
  REPS_ONLY_COPY,
  REP_MAX_REPS,
  distanceTextOf,
  e1rmTextOf,
  figureOf,
  holdTextOf,
  measureOf,
  metricTextOf,
  sinceTextOf,
  volumeTextOf,
  type LiftMovement,
  type RecordSet,
} from "@/lib/training";
import type { LiftSetView, MovementHistory } from "@/lib/training-server";
import { LIFT_COPY, cellTextOf, dayShortOf } from "./lift-model";

const KIND_MARK = { WARMUP: "W ", WORKING: "", DROP: "D ", MINI: "R " } as const;

/** One set in a recent lift's line: 'W 40 × 10', '65 × 8', 'D 52.5 × 8', '+10 × 8', 'assist 20 × 6', '1:05', '32 × 40 m'. */
function compactSetOf(s: LiftSetView, m: Pick<LiftMovement, "load">, unit: WeightUnit): string {
  const measure = measureOf(m);
  if (measure === "HOLD") return `${KIND_MARK[s.kind]}${holdTextOf(s.durationSec ?? 0)}`;
  const load = m.load === "BW" ? cellTextOf("weight", s, m, unit).replace(/^0$/, "BW") : s.weightKg == null ? "" : figureOf(s.weightKg, unit);
  if (measure === "CARRY") return `${KIND_MARK[s.kind]}${load}${s.distanceM != null ? ` × ${distanceTextOf(s.distanceM)}` : s.durationSec != null ? ` × ${holdTextOf(s.durationSec)}` : ""}`;
  return `${KIND_MARK[s.kind]}${load ? `${load} × ` : ""}${s.reps ?? ""}`;
}

/** 'estimated from 5 × 100 kg', '… 8 × 24 kg per dumbbell', '… 6 × 82 kg with body weight'. */
function estimatedFromOf(set: RecordSet, load: LiftMovement["load"], unit: WeightUnit): string {
  const kg = set.effectiveKg ?? set.weightKg;
  return kg == null || set.reps == null ? "" : `estimated from ${set.reps} × ${metricTextOf(kg, load, unit)}`;
}

export function LiftRecords({ m, history, unit, id }: { m: LiftMovement; history: MovementHistory | undefined; unit: WeightUnit; id: string }) {
  const r = history?.records ?? null;
  const recent = history?.recent ?? [];
  const moments = history?.moments ?? [];
  const measure = measureOf(m);
  const empty = !r || r.sessions === 0;
  return (
    <div id={id} className="wt-lift-rec" role="region" aria-label={`${m.name}: records`}>
      {empty ? (
        <p className="t-meta wt-lift-msg">{LIFT_COPY.NO_RECORDS}</p>
      ) : (
        <>
          <p className="t-meta wt-lift-msg">
            {r.sessions} {r.sessions === 1 ? "lift" : "lifts"} with it{history?.since ? ` since ${sinceTextOf(history.since)}` : ""}
          </p>
          {r.repsOnly === "NO_BODY_WEIGHT" && <p className="t-meta wt-lift-msg">{REPS_ONLY_COPY.NO_BODY_WEIGHT}</p>}
          <dl className="wt-lift-best">
            {r.heaviest && (
              <div>
                <dt>Heaviest</dt>
                <dd>
                  <span className="t-num">{metricTextOf(r.heaviest.kg, m.load, unit)}</span>
                  <span className="t-meta wt-lift-best-s">
                    {r.heaviest.set.reps != null ? `× ${r.heaviest.set.reps} · ` : ""}
                    {dayShortOf(r.heaviest.set.day)}
                  </span>
                </dd>
              </div>
            )}
            {r.bestE1rm && (
              <div>
                <dt>Best e1RM</dt>
                <dd>
                  <span className="t-num">{e1rmTextOf(r.bestE1rm.kg, m.load, unit).slice("e1RM ".length)}</span>
                  <span className="t-meta wt-lift-best-s">
                    {estimatedFromOf(r.bestE1rm.set, m.load, unit)} · {dayShortOf(r.bestE1rm.set.day)}
                  </span>
                </dd>
              </div>
            )}
            {r.bestSessionVolume && (
              <div>
                <dt>Best session</dt>
                <dd>
                  <span className="t-num">volume {volumeTextOf(r.bestSessionVolume.kg, unit)}</span>
                  <span className="t-meta wt-lift-best-s">{dayShortOf(r.bestSessionVolume.day)}</span>
                </dd>
              </div>
            )}
            {r.longestHold && (
              <div>
                <dt>Longest hold</dt>
                <dd>
                  <span className="t-num">{holdTextOf(r.longestHold.sec)}</span>
                  <span className="t-meta wt-lift-best-s">{dayShortOf(r.longestHold.set.day)}</span>
                </dd>
              </div>
            )}
            {r.bestCarry && (
              <div>
                <dt>Best carry</dt>
                <dd>
                  <span className="t-num">{metricTextOf(r.bestCarry.kg, "CARRY", unit)}</span>
                  <span className="t-meta wt-lift-best-s">
                    {r.bestCarry.distanceM != null ? distanceTextOf(r.bestCarry.distanceM) : r.bestCarry.durationSec != null ? holdTextOf(r.bestCarry.durationSec) : ""} · {dayShortOf(r.bestCarry.set.day)}
                  </span>
                </dd>
              </div>
            )}
            {r.repsOnly && r.mostReps.length > 0 && (
              <div>
                <dt>Most reps</dt>
                <dd>
                  <span className="t-num">
                    {r.mostReps
                      .slice(0, 3)
                      .map((x) => `${x.reps} at ${cellTextOf("weight", { weightKg: x.atKg, reps: null, durationSec: null, distanceM: null }, m, unit).replace(/^0$/, "body weight")}`)
                      .join(" · ")}
                  </span>
                </dd>
              </div>
            )}
          </dl>
          {measure === "REPS" && r.repMax.length > 0 && (
            <div className="wt-lift-rm-box">
              <h5 className="wt-lift-h5">Rep maxes ({m.load === "PAIR" ? `${unit} per dumbbell` : m.load === "BW" ? `${unit} with body weight` : unit})</h5>
              <dl className="wt-lift-rm">
                {REP_MAX_REPS.map((n) => {
                  const cell = r.repMax.find((x) => x.reps === n);
                  return (
                    <div key={n}>
                      <dt>
                        {n} {n === 1 ? "rep" : "reps"}
                      </dt>
                      <dd className="t-num">{cell ? figureOf(cell.kg, unit) : "–"}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </>
      )}
      {moments.length > 0 && (
        <div>
          <h5 className="wt-lift-h5">New bests</h5>
          <ul className="wt-lift-lines">
            {moments.map((p) => (
              <li key={`${p.sessionId}:${p.metric}`}>
                {p.metric === "E1RM" ? e1rmTextOf(p.valueKg, p.load, unit) : `heaviest ${metricTextOf(p.valueKg, p.load, unit)}`} (was{" "}
                {p.metric === "E1RM" ? e1rmTextOf(p.wasKg, "EXT", unit).slice("e1RM ".length, -` ${unit}`.length) : figureOf(p.wasKg, unit)}) · {dayShortOf(p.day)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recent.length > 0 && (
        <div>
          <h5 className="wt-lift-h5">Recent lifts</h5>
          <ul className="wt-lift-lines">
            {recent.map((s) => (
              <li key={s.sessionId}>
                <b>{dayShortOf(s.day)}</b> · {s.sets.map((x) => compactSetOf(x, m, unit).replace(/ /g, "\u00a0")).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
