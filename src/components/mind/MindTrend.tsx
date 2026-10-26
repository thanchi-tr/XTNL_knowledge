/**
 * Body › Mind's trend (brief §2.5; deterministic words from mind.ts, never Gemini). Presentational, no motion.
 *
 *   MindStrip({ strip })                the last STRIP_DAYS days as three bands (pleasantness, energy, stress), one
 *                                       column a day, each check-in a dot at its value; every dot the same ink, so
 *                                       no value is coloured as better. Labels are HTML, so they stay 12 px at every
 *                                       width; a screen reader gets the summary as the figure's name (the list below
 *                                       the card says each check-in in words)
 *   MindWeeks({ trend, today, promptedLine })
 *                                       "Calibrating — 3 of 5 check-ins in the last 8 weeks", or the weeks with a
 *                                       check-in, newest first (WEEKS_SHOWN open, the rest folded under "Earlier
 *                                       weeks"): each axis's median and its interquartile range (when it is a range),
 *                                       and a "Changed" mark with its plain line (changeLineOf) when weeksOf set one
 *   axisFigure(axis, n)                 '+1.5', '−2', '0' on the grid's axes; '2.5' for stress (0..4, no sign)
 *   calibratingLine(trend)              the calibrating sentence, or null
 */
import { addDays, weekStartKeyOf, type DayKey } from "@/lib/life-day";
import {
  AXIS_LABELS,
  GRID_MAX,
  GRID_MIN,
  MIND_AXES,
  MIND_WEEKS,
  STRIP_DAYS,
  changeLineOf,
  dayLabelOf,
  signedStep,
  type AxisStat,
  type MindAxis,
  type MindStripDay,
  type MindTrend,
  type MindWeek,
} from "@/lib/mind";
import { Chip } from "@/components/ui/Chip";

/** Weeks shown open; older ones with a check-in fold under "Earlier weeks". */
export const WEEKS_SHOWN = 4;

const COL = 20;
const BAND_W = COL * STRIP_DAYS;
const BAND_H = 36;
const PAD = 5;

/** A value's height in a band: the grid's axes run GRID_MIN..GRID_MAX, stress 0..4 (more is higher). */
function yOf(axis: MindAxis, v: number): number {
  const [lo, hi] = axis === "stress" ? [0, 4] : [GRID_MIN, GRID_MAX];
  const t = (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo);
  return BAND_H - PAD - t * (BAND_H - 2 * PAD);
}

export function axisFigure(axis: MindAxis, n: number): string {
  if (axis !== "stress") return signedStep(n);
  const r = Math.round(n * 10) / 10;
  return String(r);
}

export function MindStrip({ strip }: { strip: readonly MindStripDay[] }) {
  if (strip.length === 0) return null;
  const n = strip.reduce((k, d) => k + d.dots.length, 0);
  const days = strip.filter((d) => d.dots.length > 0).length;
  const summary = `Last ${strip.length} days: ${n} ${n === 1 ? "check-in" : "check-ins"} on ${days} ${days === 1 ? "day" : "days"}.`;
  return (
    <figure className="mind-strip-fig" role="img" aria-label={summary}>
      {MIND_AXES.map((axis) => (
        <div key={axis} className="mind-band" aria-hidden="true">
          <p className="mind-band-l">{AXIS_LABELS[axis]}</p>
          <svg viewBox={`0 0 ${BAND_W} ${BAND_H}`}>
            <rect x={0} y={0} width={BAND_W} height={BAND_H} rx={6} fill="var(--sunken)" />
            <line x1={4} x2={BAND_W - 4} y1={yOf(axis, 0)} y2={yOf(axis, 0)} stroke="var(--line-2)" strokeDasharray={axis === "stress" ? undefined : "3 3"} vectorEffect="non-scaling-stroke" />
            {strip.map((d, col) =>
              d.dots.map((dot, i) => {
                const v = axis === "stress" ? dot.stress : dot[axis];
                if (v == null) return null;
                const spread = Math.min(4, 12 / Math.max(1, d.dots.length));
                const x = col * COL + COL / 2 + (i - (d.dots.length - 1) / 2) * spread;
                return <circle key={dot.id} cx={x} cy={yOf(axis, v)} r={3.2} fill="var(--ink-1)" />;
              })
            )}
          </svg>
        </div>
      ))}
      <div className="mind-strip-axis" aria-hidden="true">
        <span>{dayLabelOf(strip[0].day)}</span>
        <span>Today</span>
      </div>
    </figure>
  );
}

export function calibratingLine(trend: MindTrend): string | null {
  if (trend.kind !== "calibrating") return null;
  return `Calibrating — ${trend.checks} of ${trend.need} check-ins in the last ${MIND_WEEKS} weeks`;
}

function weekLabel(start: DayKey, today: DayKey): string {
  const current = weekStartKeyOf(today);
  if (start === current) return "This week";
  if (start === addDays(current, -7)) return "Last week";
  return `Week of ${dayLabelOf(start)}`;
}

function Stat({ axis, stat }: { axis: MindAxis; stat: AxisStat | null }) {
  return (
    <div>
      <dt>{AXIS_LABELS[axis]}</dt>
      {stat ? (
        <dd>
          <span className="mind-med t-num">{axisFigure(axis, stat.median)}</span>
          {stat.q1 !== stat.q3 && (
            <span className="mind-iqr t-num">
              {axisFigure(axis, stat.q1)} to {axisFigure(axis, stat.q3)}
            </span>
          )}
        </dd>
      ) : (
        <dd>
          <span className="mind-iqr">Not rated</span>
        </dd>
      )}
    </div>
  );
}

function Week({ week, today }: { week: MindWeek; today: DayKey }) {
  return (
    <li className="mind-week">
      <p className="mind-week-h">
        <span>{weekLabel(week.start, today)}</span>
        <span className="t-num">
          {week.n} {week.n === 1 ? "check-in" : "check-ins"}
        </span>
      </p>
      <dl className="mind-week-stats">
        {MIND_AXES.map((axis) => (
          <Stat key={axis} axis={axis} stat={week[axis]} />
        ))}
      </dl>
      {week.changed.map((c) => (
        <p key={c.axis} className="mind-changed">
          <Chip>Changed</Chip>
          <span>{changeLineOf(c)}</span>
        </p>
      ))}
    </li>
  );
}

export function MindWeeks({ trend, today, promptedLine }: { trend: MindTrend; today: DayKey; promptedLine: string | null }) {
  const calibrating = calibratingLine(trend);
  const weeks = trend.kind === "weeks" ? trend.weeks.filter((w) => w.n > 0).reverse() : [];
  const open = weeks.slice(0, WEEKS_SHOWN);
  const folded = weeks.slice(WEEKS_SHOWN);
  return (
    <div className="mind-weeks">
      <h3 className="t-eyebrow">Weekly medians</h3>
      {calibrating ? (
        <p className="t-meta t-num">{calibrating}</p>
      ) : (
        <>
          <p className="t-meta">The middle of each week, and the range the middle half of check-ins fall in.</p>
          <ul className="mind-week-list">
            {open.map((w) => (
              <Week key={w.start} week={w} today={today} />
            ))}
          </ul>
          {folded.length > 0 && (
            <details className="mind-more">
              <summary>Earlier weeks</summary>
              <ul className="mind-week-list">
                {folded.map((w) => (
                  <Week key={w.start} week={w} today={today} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {promptedLine && <p className="t-meta t-num">{promptedLine}</p>}
    </div>
  );
}
