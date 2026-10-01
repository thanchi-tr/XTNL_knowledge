/**
 * The weight chart (presentational, no motion): weigh-ins as dots, the
 * smoothed trend as a solid ink line, the target as a dashed line. Shape
 * tells them apart, never hue, and a legend names each. The SVG scales with
 * the card; its labels are HTML so they stay 12 px at every width (as
 * TrackLines in components/home/TrackCharts.tsx). A screen reader gets the
 * summary as the image's name and a visually hidden table of the last 14
 * weigh-ins. Nothing animates, so reduced motion has nothing to stop.
 */
import type { DayKey } from "@/lib/life-day";
import type { WeightTrendPoint, WeightUnit } from "@/lib/weight";
import { CH_H, CH_W, dayLabel, figure, recentReadings, weightChartGeometry } from "./weight-copy";

export function WeightChart({
  series,
  unit,
  targetKg,
  today,
}: {
  series: readonly WeightTrendPoint[];
  unit: WeightUnit;
  targetKg: number | null;
  today: DayKey;
}) {
  const g = weightChartGeometry(series, unit, targetKg);
  if (!g) return null;
  const at = (px: number, py: number) => ({ left: `${((px / CH_W) * 100).toFixed(2)}%`, top: `${((py / CH_H) * 100).toFixed(2)}%` });
  const rows = recentReadings(series, 14);
  return (
    <figure className="wt-chart">
      <div className="wt-plot">
        <svg viewBox={`0 0 ${CH_W} ${CH_H}`} role="img" aria-label={g.summary}>
          {g.ticks.map((t) => (
            <line key={`g${t.y}`} x1={4} x2={272} y1={t.y} y2={t.y} stroke="var(--line-1)" vectorEffect="non-scaling-stroke" />
          ))}
          {g.target && (
            <line
              x1={4}
              x2={272}
              y1={g.target.y}
              y2={g.target.y}
              stroke="var(--ink-2)"
              strokeWidth={1.5}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {g.dots.map((d) => (
            <circle key={d.day} cx={d.x} cy={d.y} r={2.4} fill="var(--ink-1)" />
          ))}
          <polyline points={g.trend} fill="none" stroke="var(--ink-0)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {g.ticks.map((t) => (
          <span key={`t${t.y}`} className="wt-lbl" style={at(280, t.y)} aria-hidden="true">
            {t.text}
          </span>
        ))}
        {g.target && (
          <span className="wt-lbl wt-lbl-target" style={at(8, g.target.y)} aria-hidden="true">
            {g.target.text}
          </span>
        )}
      </div>
      <div className="wt-axis" aria-hidden="true">
        <span>{dayLabel(g.from, today)}</span>
        <span>{dayLabel(g.to, today)}</span>
      </div>
      <figcaption className="wt-legend" aria-hidden="true">
        <span>
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="2.6" fill="var(--ink-1)" />
          </svg>
          Weigh-in
        </span>
        <span>
          <svg width="18" height="14" viewBox="0 0 18 14">
            <line x1="1" x2="17" y1="7" y2="7" stroke="var(--ink-0)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Trend
        </span>
        {g.target && (
          <span>
            <svg width="18" height="14" viewBox="0 0 18 14">
              <line x1="0" x2="18" y1="7" y2="7" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="5 3" />
            </svg>
            Target
          </span>
        )}
      </figcaption>
      <table className="sr-only">
        <caption>Last {rows.length} weigh-ins, in {unit}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Weigh-in</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row">{dayLabel(r.day, today)}</th>
              <td>{figure(r.kg, unit)}</td>
              <td>{figure(r.trendKg, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
