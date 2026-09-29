"use client";

import { useMemo } from "react";
import type { GameState } from "@/lib/town/sim/types";
import { PERIL_ALARM, runReport, type Dawn, type Grade } from "@/lib/town/sim/runlog";
import { TIERS } from "@/lib/town/sim/knowledge";
import { goodName } from "@/lib/town/pulse-core";

/**
 * The Run Report (design M1, "Honest endings"): what a fallen town is told
 * in place of the two-line end. The cause in words and the rule's own
 * numbers, the turn where it began to go wrong, the run drawn day by day,
 * the toll by what killed them, the waves, what the player's study gave the
 * town, and one lesson tied to a count the run's log kept (lib/town/sim/runlog).
 * Then found the next town, or stay and rebuild from the ruins.
 */

/** The five series, each drawn to its own scale; days past DAYS_CAP are drawn at the cap, a fortnight being plenty. */
const DAYS_CAP = 14;
const SERIES: { key: keyof Dawn; label: string; max: (xs: Dawn[]) => number; text: (v: number) => string; alarm?: number }[] = [
  { key: "pop", label: "People", max: (xs) => Math.max(1, ...xs.map((x) => x.pop)), text: (v) => `${v}` },
  { key: "foodDays", label: "Food-days", max: () => DAYS_CAP, text: (v) => (v >= 99 ? "—" : `${v}`), alarm: PERIL_ALARM },
  { key: "fuelDays", label: "Fuel-days", max: () => DAYS_CAP, text: (v) => (v >= 99 ? "—" : `${v}`), alarm: PERIL_ALARM },
  { key: "hope", label: "Hope", max: () => 100, text: (v) => `${v}%` },
  { key: "sanity", label: "Sanity", max: () => 100, text: (v) => `${v}` },
];

function Spark({ xs, series }: { xs: Dawn[]; series: (typeof SERIES)[number] }) {
  const max = series.max(xs);
  const y = (v: number) => 20 - (Math.min(max, Math.max(0, v)) / max) * 19;
  const pts = xs.map((x, i) => `${xs.length > 1 ? (i / (xs.length - 1)) * 100 : 50},${y(x[series.key]).toFixed(1)}`).join(" ");
  const last = xs[xs.length - 1][series.key];
  return (
    <li>
      <span className="tg-rr-label">{series.label}</span>
      <svg viewBox="0 0 100 21" preserveAspectRatio="none" aria-hidden>
        {series.alarm !== undefined && <line x1="0" x2="100" y1={y(series.alarm)} y2={y(series.alarm)} className="tg-rr-alarm" />}
        <polyline points={pts} />
      </svg>
      <b>{series.text(last)}</b>
    </li>
  );
}

const GRADES: Grade[] = ["S", "A", "B", "C"];
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function RunReport({ s, best, onFound, onRebuild }: { s: GameState; best: number; onFound: () => void; onRebuild: () => void }) {
  const r = useMemo(() => runReport(s), [s]);
  const st = r.study;
  const carts = st.carts.map((n, i) => (n ? `${n} ${TIERS[i]?.name ?? `tier ${i}`}` : "")).filter(Boolean);
  const goods = Object.entries(st.goods).filter(([k]) => !k.startsWith("tool:")).sort((a, b) => b[1] - a[1]);
  const total = Object.values(st.goods).reduce((a, n) => a + n, 0);
  const gave = st.passes || total || st.heirlooms || st.reqs;
  const w = r.waves;

  return (
    <div className="tg-fallen tg-report" role="dialog" aria-label={`Run report: ${r.headline}`}>
      <p className="town-kicker">The run is over</p>
      <h2 className="town-title">{r.headline}</h2>
      <p className="town-sub">{r.why}</p>
      {r.turn && <p className="tg-rr-turn"><b>The turn:</b> {r.turn}</p>}

      {r.samples.length > 1 ? (
        <section>
          <h3>Day {r.samples[0].d} to day {r.day}</h3>
          <ul className="tg-rr-chart">
            {SERIES.map((x) => <Spark key={x.key} xs={r.samples} series={x} />)}
          </ul>
        </section>
      ) : null}

      <section>
        <h3>The toll</h3>
        {r.toll.length ? (
          <ul className="tg-rr-chips">
            {r.toll.map((t) => <li key={t.label}><b>{t.n}</b> {t.label}</li>)}
          </ul>
        ) : <p className="town-dim">No one died and no one walked out.</p>}
        {r.before > 0 && <p className="town-dim">{plural(r.before, "death")} before this log began on day {r.from} are not broken down.</p>}
      </section>

      <section>
        <h3>The waves</h3>
        {w.all ? (
          <p className="tg-rr-line">
            {plural(w.all, "wave")}: {w.broken} broken{w.withdrew ? `, ${w.withdrew} took their target and withdrew` : ""}
            {w.hall ? `, the hall fell ${plural(w.hall, "time")}` : ""}{w.sacked ? ", and the last sacked the town" : ""}.{" "}
            <span className="tg-rr-grades">
              {GRADES.filter((g) => w.grades[g]).map((g) => <span key={g} className={`g-${g}`}>{g} {w.grades[g]}</span>)}
            </span>
          </p>
        ) : <p className="town-dim">No wave reached the town.</p>}
      </section>

      <section>
        <h3>What your study gave this town</h3>
        {gave ? (
          <ul className="tg-rr-study">
            {st.passes > 0 && <li><b>{st.passes}</b> right answer{st.passes === 1 ? "" : "s"} settled into goods</li>}
            {carts.length > 0 && <li><b>{st.carts.reduce((a, n) => a + n, 0)}</b> supply cart{st.carts.reduce((a, n) => a + n, 0) === 1 ? "" : "s"}: {carts.join(", ")}</li>}
            {total > 0 && <li><b>{Math.round(total)}</b> goods in all{goods.length ? `: ${goods.slice(0, 4).map(([k, n]) => `${Math.round(n)} ${goodName(k, n)}`).join(", ")}${goods.length > 4 ? ", …" : ""}` : ""}</li>}
            {st.heirlooms > 0 && <li><b>{st.heirlooms}</b> heirloom{st.heirlooms === 1 ? "" : "s"} from mastered cards</li>}
            {st.reqs > 0 && <li><b>{st.reqs}</b> requisition{st.reqs === 1 ? "" : "s"} filled</li>}
            {st.charts > 0 && <li><b>{st.charts}</b> star chart{st.charts === 1 ? "" : "s"} of new domains</li>}
          </ul>
        ) : <p className="town-dim">Nothing: no right answer reached this town. Each one sends goods, and a Field cleared sends a cart.</p>}
      </section>

      <p className="tg-rr-lesson"><b>The lesson</b> {r.lesson.text}</p>
      <p className="town-dim">{best > r.day ? `Your best is day ${best}.` : "Your longest yet."} Stay and rebuild from the ruins and the tally stays where it fell.</p>
      <div className="town-row">
        <button className="town-btn" onClick={onFound}>Found the next town</button>
        <button className="town-btn ghost" onClick={onRebuild}>Rebuild from the ruins</button>
      </div>
    </div>
  );
}
