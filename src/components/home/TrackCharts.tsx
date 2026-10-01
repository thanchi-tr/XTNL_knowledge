/**
 * Stats charts for the life tracks (presentational; You › Stats renders them
 * from judged weeks once life counts, /dev/style/art/you from fixtures):
 *
 *   <TrackLines series/>   track levels over 2–12 judged weeks: ink lines told
 *                          apart by dash pattern, with direct end labels (no
 *                          legend, no hue)
 *   <KeptWeeks rows/>      the kept-weeks heatmap: filled kept, outline not kept
 *                          (hatched held once rest days exist; never colour alone)
 *
 * The geometry is pure (trackLinesGeometry, endLabelTops, keptCellLabel) so
 * scripts/you-check.ts holds it. No recharts.
 */
import { seriesDash } from "@/lib/palette";
import type { WeekMark } from "@/lib/life-tracks";

export interface TrackSeries {
  name: string;
  /** One level per judged week, oldest first. */
  points: number[];
}

/** The plot's viewBox: lines run 24 → 286, so the end labels sit outside it, in HTML. */
const TL_W = 290;
const TL_H = 180;
const X0 = 24;
const X1 = 286;

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

export interface TrackLinesGeometry {
  /** Columns on the x axis (the longest series, at least 2). */
  weeks: number;
  ticks: { value: number; y: number }[];
  lines: { name: string; points: string; dash: string; last: number }[];
  /** End labels: x and the nudged y, both in viewBox units. */
  ends: { name: string; x: number; y: number; text: string }[];
}

/**
 * Where everything goes. Series run left to right over `weeks` columns
 * (default: the longest series), so 2 judged weeks span the plot instead of
 * bunching at its left edge. Non-finite levels read as 0.
 */
export function trackLinesGeometry(series: readonly TrackSeries[], weeks?: number): TrackLinesGeometry {
  const clean = series.map((s) => ({ name: s.name, points: s.points.map((v) => (Number.isFinite(v) ? v : 0)) })).filter((s) => s.points.length > 0);
  const cols = Math.max(2, weeks ?? 0, ...clean.map((s) => s.points.length));
  const all = clean.flatMap((s) => s.points);
  const lo = Math.max(0, Math.floor(Math.min(...all, 0) / 2) * 2);
  const hi = Math.ceil(Math.max(...all, lo + 2) / 2) * 2;
  const x = (i: number) => X0 + (i * (X1 - X0)) / (cols - 1);
  const y = (v: number) => 160 - ((v - lo) / Math.max(1, hi - lo)) * 140;
  const step = Math.max(1, Math.round((hi - lo) / 4));
  const ticks: { value: number; y: number }[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push({ value: v, y: y(v) });
  const lines = clean.map((s, i) => ({
    name: s.name,
    points: s.points.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(" "),
    dash: seriesDash(i),
    last: s.points[s.points.length - 1],
  }));
  const tops = endLabelTops(clean.map((s) => y(s.points[s.points.length - 1])));
  const ends = clean.map((s, i) => ({ name: s.name, x: x(s.points.length - 1) + 8, y: tops[i], text: `${s.name} ${s.points[s.points.length - 1]}` }));
  return { weeks: cols, ticks, lines, ends };
}

export function TrackLines({ series, weeks }: { series: TrackSeries[]; weeks?: number }) {
  const g = trackLinesGeometry(series, weeks);
  const at = (px: number, py: number) => ({ left: `${((px / TL_W) * 100).toFixed(2)}%`, top: `${((py / TL_H) * 100).toFixed(2)}%` });
  const summary = series.map((s) => `${s.name} ${s.points[0]} to ${s.points[s.points.length - 1]}`).join(", ");
  // The SVG scales with the card; its labels are HTML so they stay 12 px at every width.
  return (
    <div className="tl-plot">
      <svg viewBox={`0 0 ${TL_W} ${TL_H}`} role="img" aria-label={`Track levels over ${g.weeks} weeks: ${summary}`}>
        {g.ticks.map((t) => (
          <line key={t.value} x1={X0} x2={X1} y1={t.y} y2={t.y} stroke="var(--line-1)" />
        ))}
        {g.lines.map((l) => (
          <polyline key={l.name} points={l.points} fill="none" stroke="var(--ink-0)" strokeWidth={1.6} strokeDasharray={l.dash || undefined} />
        ))}
      </svg>
      {g.ticks.map((t) => (
        <span key={`t${t.value}`} className="tl-lbl at-end" style={at(16, t.y)} aria-hidden="true">
          {t.value}
        </span>
      ))}
      {g.ends.map((e) => (
        <span key={`s${e.name}`} className="tl-lbl series" style={at(e.x, e.y)} aria-hidden="true">
          {e.text}
        </span>
      ))}
    </div>
  );
}

const WORD: Record<WeekMark, string> = { kept: "kept", held: "held", missed: "not kept" };

/** A heatmap cell's name: 'Week of 28 Sep: kept', or 'Week 3: not kept' without labels. */
export function keptCellLabel(mark: WeekMark, index: number, label?: string): string {
  return `${label ? `Week of ${label}` : `Week ${index + 1}`}: ${WORD[mark]}`;
}

/**
 * The heatmap. Every row has the same columns; `labels` (one per column,
 * '28 Sep' = the week's Monday) names each cell for a screen reader.
 */
export function KeptWeeks({ rows, labels }: { rows: { name: string; weeks: WeekMark[] }[]; labels?: string[] }) {
  const cols = Math.max(1, ...rows.map((r) => r.weeks.length));
  return (
    <div className="heat" role="table" aria-label="Kept weeks by track" style={{ ["--weeks" as string]: cols }}>
      {rows.map((r) => (
        <div key={r.name} role="row" style={{ display: "contents" }}>
          <span role="rowheader">{r.name}</span>
          {r.weeks.map((w, i) => (
            <i key={i} role="cell" aria-label={keptCellLabel(w, i, labels?.[i])} className={w === "kept" ? "k" : w === "held" ? "h" : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
}
