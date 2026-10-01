/**
 * Fixture WeightViews for the Body weight card (scripts/train-check.ts and
 * /dev/style/train). Hand-written views, not lane A's weightView(): they
 * pin what the card says for each state whatever the rules compute.
 * The trend here is a plain daily exponential average (α 0.1), enough to
 * draw a believable line.
 */
import { addDays, daysBetween, type DayKey } from "@/lib/life-day";
import { MIN_READINGS_FOR_RATE, STALE_AFTER_DAYS, TREND_ALPHA, type WeightGoalView, type WeightTrendPoint, type WeightView } from "@/lib/weight";

export const FIXTURE_TODAY: DayKey = "2026-10-01";

/** 90 days ending today; `readings` maps days-ago → kg. */
function seriesOf(readings: Record<number, number>, today: DayKey = FIXTURE_TODAY, days = 90): WeightTrendPoint[] {
  const ago = Object.keys(readings).map(Number);
  const firstAgo = ago.length ? Math.max(...ago) : -1;
  let trend = firstAgo >= 0 ? readings[firstAgo] : 0;
  const out: WeightTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const kg = readings[i] ?? null;
    if (kg != null) trend += TREND_ALPHA * (kg - trend);
    out.push({ day: addDays(today, -i), kg, trendKg: Math.round(trend * 100) / 100 });
  }
  return firstAgo >= 0 ? out : [];
}

/** A steady slide from `startKg` by `perDay`, with a deterministic ±0.4 kg wobble, weighed on most days. */
function slide(startKg: number, perDay: number, daysBack: number, skipEvery = 4): Record<number, number> {
  const out: Record<number, number> = {};
  for (let a = daysBack; a >= 0; a--) {
    if (a % skipEvery === 2) continue;
    const wobble = (((a * 37) % 9) - 4) / 10;
    out[a] = Math.round((startKg + perDay * (daysBack - a) + wobble) * 10) / 10;
  }
  return out;
}

const NO_GOAL: WeightGoalView = { unit: "kg", targetKg: null, targetDay: null, startKg: null, startDay: null };

function viewOf(series: WeightTrendPoint[], over: Partial<WeightView>): WeightView {
  const withReading = series.filter((p) => p.kg != null);
  const lastP = withReading[withReading.length - 1];
  const goal = over.goal ?? NO_GOAL;
  return {
    unit: goal.unit,
    latest: lastP ? { day: lastP.day, kg: lastP.kg as number, source: "manual" } : null,
    trendKg: series.length ? series[series.length - 1].trendKg : null,
    // As weightView: a week's change needs a reading in the last 7 days and a first reading at least a week back.
    change7Kg:
      lastP && withReading[0].day <= addDays(FIXTURE_TODAY, -7) && lastP.day > addDays(FIXTURE_TODAY, -7) && series.length > 7
        ? Math.round((series[series.length - 1].trendKg - series[series.length - 8].trendKg) * 100) / 100
        : null,
    stale: !lastP || daysBetween(lastP.day, FIXTURE_TODAY) >= STALE_AFTER_DAYS,
    rate: { kind: "calibrating", readings: withReading.length, need: MIN_READINGS_FOR_RATE },
    goal,
    progress: null,
    projection: { kind: "none", why: "no-target" },
    series,
    loggedToday: lastP?.day === FIXTURE_TODAY,
    fastLossNote: null,
    ...over,
  };
}

export type WeightFixtureName = "empty" | "calibrating" | "onTrack" | "away" | "reached" | "lb" | "stale";

export const WEIGHT_FIXTURES: Record<WeightFixtureName, { label: string; view: WeightView }> = {
  empty: {
    label: "Empty",
    view: viewOf([], { rate: { kind: "calibrating", readings: 0, need: MIN_READINGS_FOR_RATE } }),
  },
  calibrating: {
    label: "Calibrating, with a target",
    view: viewOf(seriesOf({ 4: 72.9, 2: 72.5, 1: 72.6 }), {
      goal: { unit: "kg", targetKg: 70, targetDay: "2026-12-31", startKg: 72.8, startDay: "2026-09-27" },
      progress: 0.08,
      projection: { kind: "none", why: "calibrating" },
      loggedToday: false,
    }),
  },
  onTrack: {
    label: "On track for the target date",
    view: viewOf(seriesOf(slide(76, -0.05, 80)), {
      goal: { unit: "kg", targetKg: 70, targetDay: "2026-12-31", startKg: 75.2, startDay: "2026-08-20" },
      rate: { kind: "rate", kgPerWeek: -0.35 },
      progress: 0.4,
      projection: { kind: "date", day: "2026-12-12", weeks: 10, onTrackForTargetDay: true },
    }),
  },
  away: {
    label: "Moving away from the target",
    view: viewOf(seriesOf(slide(71, 0.03, 60)), {
      goal: { unit: "kg", targetKg: 70, targetDay: null, startKg: 71.4, startDay: "2026-08-15" },
      rate: { kind: "rate", kgPerWeek: 0.2 },
      progress: 0,
      projection: { kind: "none", why: "away" },
    }),
  },
  reached: {
    label: "Target reached",
    view: viewOf(seriesOf(slide(74, -0.03, 70)), {
      goal: { unit: "kg", targetKg: 72.5, targetDay: "2026-11-30", startKg: 74, startDay: "2026-07-25" },
      rate: { kind: "rate", kgPerWeek: -0.2 },
      progress: 1,
      projection: { kind: "none", why: "reached" },
    }),
  },
  lb: {
    label: "Pounds, no target, a fast loss",
    view: viewOf(seriesOf(slide(95, -0.2, 40, 3)), {
      goal: { unit: "lb", targetKg: null, targetDay: null, startKg: null, startDay: null },
      rate: { kind: "rate", kgPerWeek: -1.3 },
      fastLossNote: "This is faster than about 1 kg a week. A slower pace is easier to keep.",
    }),
  },
  stale: {
    label: "No weigh-in for two months",
    // Weighed most days from 90 to 60 days ago, then nothing: the trend since is only carried.
    view: viewOf(seriesOf(Object.fromEntries(Object.entries(slide(80.5, -0.02, 30)).map(([a, kg]) => [Number(a) + 60, kg]))), {
      goal: { unit: "kg", targetKg: 75, targetDay: null, startKg: 80.4, startDay: "2026-07-03" },
      rate: { kind: "calibrating", readings: 0, need: MIN_READINGS_FOR_RATE },
      progress: 0.1,
      projection: { kind: "none", why: "calibrating" },
    }),
  },
};
