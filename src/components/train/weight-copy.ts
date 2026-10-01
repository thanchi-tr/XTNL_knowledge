/**
 * Body weight card: the words and the chart geometry (pure; scripts/train-check.ts
 * holds them). A record, never a reward: the copy is neutral ('down 0.4 kg
 * in 7 days', never 'good job'), it leads with the smoothed trend, says
 * 'calibrating' when there are too few weigh-ins, and never invents a date.
 * Units are display only: every figure arrives in kg and is shown in the
 * user's unit.
 */
import { addDays, daysBetween, type DayKey } from "@/lib/life-day";
import {
  FLAT_KG_PER_WEEK,
  MAX_KG,
  MIN_KG,
  RATE_WINDOW_DAYS,
  clampKg,
  fromKg,
  toKg,
  type WeightProjection,
  type WeightRate,
  type WeightTrendPoint,
  type WeightUnit,
  type WeightView,
} from "@/lib/weight";

/** The true minus (U+2212), as the kit's format.ts writes debt and falls. */
export const MINUS = "−";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** '12 Dec', with the year when it is not `today`'s ('3 Jan 2027'). */
export function shortDay(day: DayKey, today?: DayKey): string {
  const [y, m, d] = day.split("-").map(Number);
  const base = `${d} ${MONTHS[(m || 1) - 1]}`;
  return today && today.slice(0, 4) !== day.slice(0, 4) ? `${base} ${y}` : base;
}

/** 'Today', 'Yesterday', 'Mon 28 Sep' within the week, else '12 Aug'. */
export function dayLabel(day: DayKey, today: DayKey): string {
  const ago = daysBetween(day, today);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago > 1 && ago < 7) {
    const [y, m, d] = day.split("-").map(Number);
    return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${shortDay(day, today)}`;
  }
  return shortDay(day, today);
}

/** The figure alone, one decimal, in the unit ('72.4'). */
export function figure(kg: number, unit: WeightUnit): string {
  return fromKg(kg, unit).toFixed(1);
}

/** 'down 0.4 kg in 7 days' / 'up 0.2 lb in 7 days' / 'steady over 7 days'; null without a change. */
export function changeSentence(change7Kg: number | null, unit: WeightUnit): string | null {
  if (change7Kg == null || !Number.isFinite(change7Kg)) return null;
  const v = fromKg(change7Kg, unit);
  const shown = Math.abs(v).toFixed(1);
  if (shown === "0.0") return "steady over 7 days";
  return `${v < 0 ? "down" : "up"} ${shown} ${unit} in 7 days`;
}

/** '−0.35 kg a week' / '+0.20 lb a week' / 'steady (under 0.05 kg a week)'; null while calibrating. */
export function rateSentence(rate: WeightRate, unit: WeightUnit): string | null {
  if (rate.kind !== "rate" || !Number.isFinite(rate.kgPerWeek)) return null;
  if (Math.abs(rate.kgPerWeek) < FLAT_KG_PER_WEEK) return `steady (under ${fromKg(FLAT_KG_PER_WEEK, unit).toFixed(2)} ${unit} a week)`;
  const v = fromKg(rate.kgPerWeek, unit);
  return `${v < 0 ? MINUS : "+"}${Math.abs(v).toFixed(2)} ${unit} a week`;
}

/** 'Calibrating — 3 of 5 weigh-ins in the last 4 weeks' (the rate's window, RATE_WINDOW_DAYS). */
export function calibratingSentence(rate: WeightRate): string | null {
  if (rate.kind !== "calibrating") return null;
  const weeks = RATE_WINDOW_DAYS / 7;
  const span = Number.isInteger(weeks) ? `the last ${weeks} weeks` : `the last ${RATE_WINDOW_DAYS} days`;
  return `Calibrating — ${rate.readings} of ${rate.need} weigh-ins in ${span}`;
}

/** A projection past MAX_PROJECTION_WEEKS (104 weeks): the trend moves toward the target, too slowly for an honest date. */
export const FAR_COPY = "More than two years away at this pace";

/**
 * The projection, said plainly; null without a target.
 *   date        'At this pace: about 12 Dec (on track for 31 Dec)' / '(later than 31 Dec)'
 *   calibrating 'Calibrating — 3 of 5 weigh-ins in the last 4 weeks'
 *   flat        'The trend is flat'
 *   far         'More than two years away at this pace'
 *   away        'The trend is moving away from the target'
 *   reached     'Target reached'
 */
export function projectionSentence(projection: WeightProjection, rate: WeightRate, targetDay: DayKey | null, today: DayKey): string | null {
  if (projection.kind === "date") {
    const when = `At this pace: about ${shortDay(projection.day, today)}`;
    if (!targetDay || projection.onTrackForTargetDay == null) return when;
    return `${when} (${projection.onTrackForTargetDay ? "on track for" : "later than"} ${shortDay(targetDay, today)})`;
  }
  switch (projection.why) {
    case "no-target":
      return null;
    case "calibrating":
      return calibratingSentence(rate) ?? "Calibrating";
    case "flat":
      return "The trend is flat";
    case "far":
      return FAR_COPY;
    case "away":
      return "The trend is moving away from the target";
    case "reached":
      return "Target reached";
  }
}

/**
 * The header's line about the latest weigh-in: 'Today 72.6 · trend 72.4'.
 * Stale (no weigh-in for STALE_AFTER_DAYS) it leads instead, and names no
 * trend: 'Last weigh-in 2 Aug · 80.0 kg' (the trend since is only carried).
 */
export function latestLine(view: WeightView, today: DayKey): string | null {
  if (!view.latest) return null;
  if (view.stale) return `Last weigh-in ${shortDay(view.latest.day, today)} · ${figure(view.latest.kg, view.unit)} ${view.unit}`;
  const head = `${dayLabel(view.latest.day, today)} ${figure(view.latest.kg, view.unit)}`;
  return view.trendKg == null ? head : `${head} · trend ${figure(view.trendKg, view.unit)}`;
}

/** 0..100 for the progress bar, or null. */
export function progressPercent(progress: number | null): number | null {
  if (progress == null || !Number.isFinite(progress)) return null;
  return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

/** The progress bar's spoken value: '40% of the way from 80.0 kg to 70.0 kg'. */
export function progressText(view: WeightView): string | null {
  const pct = progressPercent(view.progress);
  const { startKg, targetKg } = view.goal;
  if (pct == null || startKg == null || targetKg == null) return null;
  return `${pct}% of the way from ${figure(startKg, view.unit)} ${view.unit} to ${figure(targetKg, view.unit)} ${view.unit}`;
}

/** The goal sheet's start sentence (setWeightGoalCore records today's trend, or the latest reading). */
export function startSentence(view: WeightView, changingTarget: boolean): string {
  const { startKg, startDay } = view.goal;
  if (!changingTarget && startKg != null) {
    return `Progress stays measured from ${figure(startKg, view.unit)} ${view.unit}${startDay ? ` (${shortDay(startDay)})` : ""}.`;
  }
  const from = view.trendKg ?? view.latest?.kg ?? null;
  if (from == null) return "Progress is measured from your first weigh-in.";
  return `Progress is measured from today's ${view.trendKg != null ? "trend" : "weigh-in"}, ${figure(from, view.unit)} ${view.unit}.`;
}

/** The goal sheet's note when the stored by-date is today or earlier (it is then not prefilled), else null. */
export function byDatePassedNote(targetDay: DayKey | null, today: DayKey): string | null {
  if (!targetDay || targetDay > today) return null;
  return `The by-date ${shortDay(targetDay, today)} has passed. Pick a new one, or save to keep it.`;
}

/** The by-date the goal sheet prefills: the stored one while it is still after today, else empty. */
export function byDatePrefill(targetDay: DayKey | null, today: DayKey): string {
  return targetDay && targetDay > today ? targetDay : "";
}

/** Whether the typed target is the prefilled figure (compared in the user's unit, so '70' is '70.0'). */
export function sameTargetText(text: string, view: WeightView): boolean {
  const target = view.goal.targetKg;
  if (target == null) return false;
  const p = parseFigure(text, view.unit);
  return p.ok && Math.abs(p.value - Number(figure(target, view.unit))) < 1e-9;
}

export type GoalSaveInput = { unit: WeightUnit; targetKg?: number; targetDay?: DayKey | null };

/**
 * What the goal sheet's Save sends. The target only when its text is not
 * the prefilled figure (a stored 70 kg shown as '154.3 lb' re-reads as
 * 69.99 kg, which is not a new target and must not reset its start). The
 * by-date as typed, except a passed one that was never touched: then it is
 * left out and stays as stored.
 */
export function goalSaveInput(f: { text: string; date: string; dateEdited: boolean; view: WeightView; today: DayKey }):
  | { ok: true; input: GoalSaveInput; value: number }
  | { ok: false; error: string } {
  const { view, today } = f;
  const p = parseFigure(f.text, view.unit);
  if (!p.ok) return p;
  const date = f.date.trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date, or leave it empty." };
  if (date && date <= today) return { ok: false, error: "Pick a date after today, or leave it empty." };
  const input: GoalSaveInput = { unit: view.unit };
  if (!sameTargetText(f.text, view)) input.targetKg = p.kg;
  const passedUntouched = byDatePassedNote(view.goal.targetDay, today) !== null && !f.dateEdited;
  if (!passedUntouched) input.targetDay = date ? (date as DayKey) : null;
  return { ok: true, input, value: p.value };
}

/** The last `n` weigh-ins, newest first (the history list and the hidden table). */
export function recentReadings(series: readonly WeightTrendPoint[], n = 14): { day: DayKey; kg: number; trendKg: number }[] {
  const out: { day: DayKey; kg: number; trendKg: number }[] = [];
  for (let i = series.length - 1; i >= 0 && out.length < n; i--) {
    const p = series[i];
    if (p.kg != null) out.push({ day: p.day, kg: p.kg, trendKg: p.trendKg });
  }
  return out;
}

/**
 * A typed figure in the unit → kg, or the reason it is refused.
 * Accepts a decimal comma ('72,4').
 */
export function parseFigure(text: string, unit: WeightUnit): { ok: true; kg: number; value: number } | { ok: false; error: string } {
  const t = text.trim().replace(",", ".");
  if (!t) return { ok: false, error: "Type a weight first." };
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return { ok: false, error: `That is not a number. Type it like 72.4.` };
  const value = Number(t);
  const kg = clampKg(toKg(value, unit));
  if (kg == null) {
    const lo = Math.ceil(fromKg(MIN_KG, unit));
    const hi = Math.floor(fromKg(MAX_KG, unit));
    return { ok: false, error: `Weights between ${lo} and ${hi} ${unit} only.` };
  }
  return { ok: true, kg, value };
}

/** The log button: 'Log weight', or 'Update today' / 'Update yesterday' when that day has one. */
export function logLabel(loggedToday: boolean, yesterday: boolean, loggedYesterday: boolean): string {
  if (yesterday) return loggedYesterday ? "Update yesterday" : "Log for yesterday";
  return loggedToday ? "Update today" : "Log weight";
}

// ─── chart geometry ─────────────────────────────────────────────────────────

/** The plot's viewBox. Lines run X0 → X1; the tick labels sit right of X1, in HTML. */
export const CH_W = 320;
export const CH_H = 150;
const X0 = 4;
const X1 = 272;
const Y_TOP = 10;
const Y_BOT = 140;
/** The chart shows at least this many days, so three weigh-ins do not fill the width. */
export const MIN_SPAN_DAYS = 14;

export interface WeightChartGeometry {
  /** The first and last day drawn. */
  from: DayKey;
  to: DayKey;
  days: number;
  dots: { day: DayKey; x: number; y: number }[];
  /** The trend polyline, from the first weigh-in on. */
  trend: string;
  target: { y: number; text: string } | null;
  ticks: { y: number; text: string }[];
  /** For the aria-label. */
  summary: string;
}

/**
 * Where everything goes, in the user's unit. The x axis runs from the first
 * weigh-in in the series (at least MIN_SPAN_DAYS before today) to the last
 * day; the y axis spans the readings, the trend and the target, padded.
 * null when there is nothing to draw.
 */
export function weightChartGeometry(series: readonly WeightTrendPoint[], unit: WeightUnit, targetKg: number | null): WeightChartGeometry | null {
  const first = series.findIndex((p) => p.kg != null);
  if (first < 0 || series.length === 0) return null;
  const last = series[series.length - 1].day;
  const start = Math.max(0, Math.min(first, series.length - MIN_SPAN_DAYS));
  const from = series[start].day;
  const span = Math.max(1, daysBetween(from, last));
  const pts = series.slice(Math.max(start, first));
  const vals: number[] = [];
  for (const p of pts) {
    if (p.kg != null) vals.push(fromKg(p.kg, unit));
    vals.push(fromKg(p.trendKg, unit));
  }
  if (targetKg != null) vals.push(fromKg(targetKg, unit));
  let lo = Math.floor(Math.min(...vals) - 0.5);
  let hi = Math.ceil(Math.max(...vals) + 0.5);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const x = (day: DayKey) => X0 + (daysBetween(from, day) / span) * (X1 - X0);
  const y = (v: number) => Y_BOT - ((v - lo) / (hi - lo)) * (Y_BOT - Y_TOP);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const dots = pts.filter((p) => p.kg != null).map((p) => ({ day: p.day, x: r1(x(p.day)), y: r1(y(fromKg(p.kg as number, unit))) }));
  const trend = pts.map((p) => `${r1(x(p.day))},${r1(y(fromKg(p.trendKg, unit)))}`).join(" ");
  const mid = (lo + hi) / 2;
  const ticks = [hi, mid, lo].map((v) => ({ y: r1(y(v)), text: v.toFixed(Number.isInteger(v) ? 0 : 1) }));
  const target = targetKg != null ? { y: r1(y(fromKg(targetKg, unit))), text: `target ${figure(targetKg, unit)}` } : null;
  const lastPt = pts[pts.length - 1];
  const summary =
    `Weight since ${shortDay(from)}, in ${unit}: ${dots.length} weigh-in${dots.length === 1 ? "" : "s"}, ` +
    `trend ${figure(pts[0].trendKg, unit)} to ${figure(lastPt.trendKg, unit)}` +
    (targetKg != null ? `, target ${figure(targetKg, unit)}` : "") +
    ". The last 14 weigh-ins are listed in the table below.";
  return { from, to: last, days: span + 1, dots, trend, target, ticks, summary };
}

/** Yesterday's key (the form's 'Yesterday' toggle). */
export function yesterdayOf(today: DayKey): DayKey {
  return addDays(today, -1);
}
