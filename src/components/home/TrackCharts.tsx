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

/** The plot's viewBox: lines run 24 → 286, so the end labels sit outside it, in HTML. */
const TL_W = 290;
const TL_H = 180;

/**
 * End-label rows, nudged apart so two tracks ending a level apart do not
 * print on top of each other: at least `gap` viewBox units between centres,
 * kept inside 0..TL_H, order preserved. Pure (you-check).
 */
export function endLabelTops(ys: readonly number[], gap = 18, h = TL_H): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const placed = order.map((o) => o.y);
  for (let k = 1; k < placed.length; k++) placed[k] = Math.max(placed[k], placed[k - 1] + gap);
  const over = placed.length ? placed[placed.length - 1] - (h - gap / 2) : 0;
  if (over > 0) for (let k = placed.length - 1; k >= 0; k--) placed[k] = Math.max(gap / 2, Math.min(placed[k] - over, k + 1 < placed.length ? placed[k + 1] - gap : Infinity));
  const out = new Array<number>(ys.length);
  order.forEach((o, k) => (out[o.i] = placed[k]));
  return out;
}

export function TrackLines({ series, weeks = 12 }: { series: TrackSeries[]; weeks?: number }) {
  const all = series.flatMap((s) => s.points);
  const lo = Math.max(0, Math.floor(Math.min(...all, 0) / 2) * 2);
  const hi = Math.ceil(Math.max(...all, lo + 2) / 2) * 2;
  const x = (i: number) => 24 + (i * 262) / Math.max(1, weeks - 1);
  const y = (v: number) => 160 - ((v - lo) / Math.max(1, hi - lo)) * 140;
  const at = (px: number, py: number) => ({ left: `${((px / TL_W) * 100).toFixed(2)}%`, top: `${((py / TL_H) * 100).toFixed(2)}%` });
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 4))) ticks.push(v);
  const summary = series.map((s) => `${s.name} ${s.points[0]} to ${s.points[s.points.length - 1]}`).join(", ");
  // The SVG scales with the card; its labels are HTML so they stay 12 px at every width.
  return (
    <div className="tl-plot">
      <svg viewBox={`0 0 ${TL_W} ${TL_H}`} role="img" aria-label={`Track levels over ${weeks} weeks: ${summary}`}>
        {ticks.map((v) => (
          <line key={v} x1={24} x2={286} y1={y(v)} y2={y(v)} stroke="var(--line-1)" />
        ))}
        {series.map((s, i) => (
          <polyline
            key={s.name}
            points={s.points.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--ink-0)"
            strokeWidth={1.6}
            strokeDasharray={seriesDash(i) || undefined}
          />
        ))}
      </svg>
      {ticks.map((v) => (
        <span key={`t${v}`} className="tl-lbl at-end" style={at(16, y(v))} aria-hidden="true">
          {v}
        </span>
      ))}
      {endLabelTops(series.map((s) => y(s.points[s.points.length - 1]))).map((top, i) => {
        const s = series[i];
        return (
          <span key={`s${s.name}`} className="tl-lbl series" style={at(x(s.points.length - 1) + 8, top)} aria-hidden="true">
            {s.name} {s.points[s.points.length - 1]}
          </span>
        );
      })}
    </div>
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
