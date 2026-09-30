/**
 * M5-ready Stats charts (presentational; real pages render them once life
 * tracks exist, /dev/style/art/you renders them from fixtures):
 *
 *   <TrackLines series/>   track levels over 12 weeks: ink lines told apart by
 *                          dash pattern, with direct end labels (no legend, no hue)
 *   <KeptWeeks rows/>      the kept-weeks heatmap: filled kept, hatched held,
 *                          outline not kept (never colour alone)
 */
import { seriesDash } from "@/lib/palette";
import type { WeekPip } from "./SheetSections";

export interface TrackSeries {
  name: string;
  /** One level per week, oldest first. */
  points: number[];
}

export function TrackLines({ series, weeks = 12 }: { series: TrackSeries[]; weeks?: number }) {
  const all = series.flatMap((s) => s.points);
  const lo = Math.max(0, Math.floor(Math.min(...all, 0) / 2) * 2);
  const hi = Math.ceil(Math.max(...all, lo + 2) / 2) * 2;
  const x = (i: number) => 24 + (i * 262) / Math.max(1, weeks - 1);
  const y = (v: number) => 160 - ((v - lo) / Math.max(1, hi - lo)) * 140;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 4))) ticks.push(v);
  const summary = series.map((s) => `${s.name} ${s.points[0]} to ${s.points[s.points.length - 1]}`).join(", ");
  return (
    <svg viewBox="0 0 360 180" role="img" aria-label={`Track levels over ${weeks} weeks: ${summary}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={24} x2={286} y1={y(v)} y2={y(v)} stroke="var(--line-1)" />
          <text x={16} y={y(v) + 4} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {series.map((s, i) => {
        const last = s.points[s.points.length - 1];
        return (
          <g key={s.name}>
            <polyline
              points={s.points.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke="var(--ink-0)"
              strokeWidth={1.6}
              strokeDasharray={seriesDash(i) || undefined}
            />
            <text x={x(s.points.length - 1) + 8} y={y(last) + 4} style={{ fill: "var(--ink-1)" }}>
              {s.name} {last}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const WORD: Record<WeekPip, string> = { kept: "kept", held: "held", missed: "not kept" };

export function KeptWeeks({ rows }: { rows: { name: string; weeks: WeekPip[] }[] }) {
  return (
    <div className="heat" role="table" aria-label="Kept weeks by track">
      {rows.map((r) => (
        <div key={r.name} role="row" style={{ display: "contents" }}>
          <span role="rowheader">{r.name}</span>
          {r.weeks.map((w, i) => (
            <i key={i} role="cell" aria-label={`Week ${i + 1}: ${WORD[w]}`} className={w === "kept" ? "k" : w === "held" ? "h" : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
}
