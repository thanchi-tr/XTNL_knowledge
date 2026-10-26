/**
 * Fixture WeightViews for the Body weight card (scripts/train-check.ts and
 * /dev/style/train). Hand-written views, not lane A's weightView(): they
 * pin what the card says for each state whatever the rules compute.
 * The trend here is a plain daily exponential average (α 0.1), enough to
 * draw a believable line.
 *
 * Fixture MindViews for Body › Mind and the check-in sheet (/dev/style/train,
 * health-2026-10-27.md phase 1): made-up check-ins run through mind.ts's own
 * mindViewOf, so the strip, the medians, "Changed", "Calibrating" and the
 * low-pattern card are what the rules say for those rows. MIND_FIXTURES:
 * off, offStored (the switch off with check-ins kept from before: Delete
 * all), notReady, failed (the read failed), empty, oldOnly (none in the shown
 * weeks, some kept from before them), calibrating, logged (the receipt with
 * Undo), changed, low and paused; each fixture's `older` holds its rows from
 * before the 14-day list, newest first, for the fake "Show older". MIND_DRAFT
 * starts the sheet already picked.
 *
 * Fixture ExerciseViews for Train › Exercise with every kind (health-2026-10-27.md phase 3; /dev/style/train):
 * EXERCISE_FIXTURES on a fortnight of made-up sessions (two walks, a run, a swim, yoga, a game, a ride, a row),
 * each opening the card on a state: kinds (the picker, Walk picked), empty, again (the Again chip), run (live pace,
 * Counts as), more (a run with More open: the name, incline, heart rates and the RPE chips, 7 pressed), runOffer (a run
 * at a walking pace: "Log it as a walk?"), swim (a 25 m pool, 60 lengths), sport, yoga, longNames (a 40-character game
 * on the Again chip and a 60-character habit on Counts as, wrapping inside the card), counted (a ride counted as the
 * habit), countedDelete (that ride on its Sure? step: the habit stays ticked), refused (a run faster than 25 km/h),
 * recordOnly (no habit due: the record-only line), walkOffer ("Log it as a run?"), lift (the set logger arrives next)
 * and walkOnly (before the strength_sets migration). The saved lines are sessionLoggedLineOf's own, so they read as
 * the server's would.
 */
import { addDays, daysBetween, zonedToInstant, type DayKey } from "@/lib/life-day";
import { MIN_READINGS_FOR_RATE, STALE_AFTER_DAYS, TREND_ALPHA, type WeightGoalView, type WeightTrendPoint, type WeightView } from "@/lib/weight";
import { EMPTY_PREFS, emptyMindView, mindViewOf, olderFromOf, receiptLineOf, type MindPrefsView, type MindView, type MoodCheckView } from "@/lib/mind";
import type { LoggedCheck } from "@/lib/mind-server";
import { exerciseWeekOf, sessionLoggedLineOf, sessionRefusalOf, type SessionView } from "@/lib/exercise";
import type { ExerciseView } from "@/lib/exercise-server";
import type { ExerciseCardInitial } from "./ExerciseCard";

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

// ── Mind ────────────────────────────────────────────────────────────────

/** Body › Mind's fixture day: a Thursday, so this life week has four days in it. */
export const MIND_FIXTURE_TODAY: DayKey = "2026-10-29";

/** [days ago, local hour, valence, energy, stress, extras]: one made-up check-in. */
type CheckRow = [number, number, number, number, number | null, Partial<MoodCheckView>?];

function checksOf(name: string, rows: readonly CheckRow[], today: DayKey = MIND_FIXTURE_TODAY): MoodCheckView[] {
  return rows.map(([ago, hour, valence, energy, stress, extra], i) => {
    const day = addDays(today, -ago);
    const [y, m, d] = day.split("-").map(Number);
    const at = new Date(zonedToInstant(y, m, d, hour).getTime() + ((i * 17) % 50) * 60_000).toISOString();
    return { id: `mc-${name}-${i}`, day, at, valence, energy, stress, word: null, tags: [], trigger: "self", via: "web", ...extra };
  });
}

const LIVE = { live: true, ready: true };
const viewOfChecks = (checks: readonly MoodCheckView[], prefs: MindPrefsView = EMPTY_PREFS): MindView => mindViewOf(checks, prefs, MIND_FIXTURE_TODAY, LIVE);

/** A few days in: three check-ins, under the five the medians wait for. */
const FEW: CheckRow[] = [
  [0, 9, 2, -1, 1, { word: "Rested", tags: ["Work"] }],
  [1, 18, -1, 2, 3, { word: "Restless", tags: ["Work", "People"] }],
  [3, 13, 0, 0, null],
];

/** Six weeks of steady check-ins (about one every other day), then a lower-energy week: energy is marked "Changed". */
const STEADY_THEN_TIRED: CheckRow[] = [
  ...Array.from({ length: 22 }, (_, k): CheckRow => {
    const ago = 46 - 2 * k;
    return [ago, 9 + ((k * 5) % 11), 1 + (k % 3 === 0 ? 1 : 0) - (k % 4 === 0 ? 1 : 0), 1 + (k % 2), 1 + (k % 3 === 1 ? 1 : 0), k % 7 === 3 ? { trigger: "prompted" } : undefined];
  }),
  [3, 10, 1, -2, 2, { word: "Tired", tags: ["Slept badly"] }],
  [2, 15, 0, -2, 2],
  [1, 9, 1, -3, 1, { tags: ["Slept badly", "Study"] }],
  [1, 19, 1, -1, 2, { trigger: "prompted" }],
  [0, 11, 0, -2, 2, { word: "Flat" }],
];

/** A heavy week: six days with a check-in, five of them at −3 or below (or stress 4), after steadier weeks. */
const HEAVY_WEEK: CheckRow[] = [
  ...Array.from({ length: 14 }, (_, k): CheckRow => [34 - 2 * k, 10 + ((k * 3) % 9), (k % 3) - 1, k % 2, 2]),
  [5, 20, -3, -2, 3, { word: "Worn out", tags: ["Work"] }],
  [4, 21, -1, 1, 4, { word: "Overwhelmed", tags: ["Work"] }],
  [3, 19, -4, -3, 3, { tags: ["Alone"] }],
  [2, 9, -1, 0, 2],
  [2, 22, -3, -2, 3, { word: "Sad" }],
  [1, 18, -3, -1, 3, { tags: ["Slept badly"] }],
  [0, 10, -2, -2, 3, { word: "Tired" }],
];

const LOGGED_CHECKS = checksOf("logged", [...FEW, [0, 14, 2, -2, 1, { word: "Relaxed" }]]);
const LOGGED_VIEW = viewOfChecks(LOGGED_CHECKS);
const LOGGED_ROW = LOGGED_VIEW.recent[0];

/** Ten check-ins from 13 to 17 weeks ago: before the shown weeks and their baseline, so the view's window holds none. */
const LONG_AGO: CheckRow[] = Array.from({ length: 10 }, (_, k): CheckRow => [92 + 3 * k, 9 + ((k * 4) % 10), (k % 5) - 2, (k % 3) - 1, k % 4, k % 3 === 0 ? { word: "Busy", tags: ["Work"] } : undefined]);
const LONG_AGO_CHECKS = checksOf("old", LONG_AGO);

/** A fixture's check-ins from before the 14-day list, newest first (what "Show older" pages through). */
function olderOf(checks: readonly MoodCheckView[]): MoodCheckView[] {
  const from = olderFromOf(MIND_FIXTURE_TODAY);
  return checks.filter((c) => c.day < from).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
}

const CHANGED_CHECKS = checksOf("changed", STEADY_THEN_TIRED);
const LOW_CHECKS = checksOf("low", HEAVY_WEEK);

export type MindFixtureName = "off" | "offStored" | "notReady" | "failed" | "empty" | "oldOnly" | "calibrating" | "logged" | "changed" | "low" | "paused";

export interface MindFixture {
  label: string;
  view: MindView;
  receipt?: LoggedCheck;
  /** The rows before the 14-day list, newest first (the fake "Show older" pages through them). */
  older?: MoodCheckView[];
  /** While the switch is off: how many check-ins are stored from before (the page's countChecks). */
  stored?: number;
}

export const MIND_FIXTURES: Record<MindFixtureName, MindFixture> = {
  off: { label: "Mind · switch off (arrives with the next update)", view: emptyMindView(MIND_FIXTURE_TODAY, { live: false, ready: false }) },
  offStored: {
    label: "Mind · switch off, check-ins kept from before (Delete all)",
    view: emptyMindView(MIND_FIXTURE_TODAY, { live: false, ready: false }),
    stored: LONG_AGO_CHECKS.length,
  },
  notReady: { label: "Mind · the table isn't on this database yet", view: emptyMindView(MIND_FIXTURE_TODAY, { live: true, ready: false }) },
  failed: { label: "Mind · the read failed (never the empty card)", view: emptyMindView(MIND_FIXTURE_TODAY, { live: true, ready: false, failed: true }) },
  empty: { label: "Mind · empty", view: viewOfChecks([]) },
  oldOnly: {
    label: "Mind · none in the last 8 weeks, older ones kept",
    view: emptyMindView(MIND_FIXTURE_TODAY, { live: true, ready: true, storedCount: LONG_AGO_CHECKS.length }),
    older: olderOf(LONG_AGO_CHECKS),
  },
  calibrating: { label: "Mind · calibrating (3 of 5)", view: viewOfChecks(checksOf("few", FEW)) },
  logged: {
    label: "Mind · just logged, with Undo",
    view: LOGGED_VIEW,
    receipt: { ...LOGGED_ROW, line: receiptLineOf(LOGGED_ROW), replay: false },
  },
  changed: { label: "Mind · weekly medians, energy changed", view: viewOfChecks(CHANGED_CHECKS), older: olderOf(CHANGED_CHECKS) },
  low: { label: "Mind · the low-pattern card", view: viewOfChecks(LOW_CHECKS), older: olderOf(LOW_CHECKS) },
  paused: {
    label: "Mind · paused for a week",
    view: viewOfChecks(checksOf("paused", FEW), { pausedUntil: addDays(MIND_FIXTURE_TODAY, 7), lowSeenAt: null }),
  },
};

/** The sheet opened already picked (the "sheet, picked" state): calm and a little tired, a little stressed, a word. */
export const MIND_DRAFT = { cell: { valence: 2, energy: -1 }, stress: 1, word: "Relaxed", tags: ["Work"] };

// ── Exercise: every kind (health-2026-10-27.md D10-D13; phase 3) ──────────

/** Train › Exercise's fixture day: the Mind fixtures' Thursday, after MOMENTUM_LAUNCH_DAY, so the view is a live one. */
export const EXERCISE_FIXTURE_TODAY: DayKey = MIND_FIXTURE_TODAY;

/** A made-up session: `ago` days back, the rest as stored (every added column null unless given). */
function sessionOf(id: string, ago: number, s: Partial<SessionView> & Pick<SessionView, "kind" | "durationMin">): SessionView {
  return {
    id,
    day: addDays(EXERCISE_FIXTURE_TODAY, -ago),
    angleDeg: 0,
    distanceKm: 0,
    note: null,
    variant: null,
    label: null,
    poolM: null,
    avgWatts: null,
    avgHr: null,
    maxHr: null,
    sessionRpe: null,
    startedAt: null,
    endedAt: null,
    clientId: null,
    ...s,
  };
}

/** A fortnight of mixed sessions, newest first (as the server lists them): two walks, a run, a swim, a game, yoga, a ride, a row. */
const EXERCISE_SESSIONS: SessionView[] = [
  sessionOf("ex-w1", 0, { kind: "WALK", distanceKm: 3.2, durationMin: 42, angleDeg: 5 }),
  sessionOf("ex-r1", 1, { kind: "RUN", distanceKm: 5, durationMin: 27, variant: "ROAD", avgHr: 152, maxHr: 171, sessionRpe: 7 }),
  sessionOf("ex-s1", 2, { kind: "SWIM", distanceKm: 1.5, durationMin: 32, variant: "FREESTYLE", poolM: 25 }),
  sessionOf("ex-y1", 2, { kind: "YOGA", durationMin: 45, variant: "VINYASA", label: "Morning flow" }),
  sessionOf("ex-g1", 3, { kind: "SPORT", durationMin: 60, variant: "TENNIS", avgHr: 138 }),
  sessionOf("ex-w2", 5, { kind: "WALK", distanceKm: 5, durationMin: 58 }),
  sessionOf("ex-c1", 7, { kind: "CYCLE", durationMin: 40, variant: "STATIONARY", avgWatts: 150 }),
  sessionOf("ex-o1", 8, { kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60 }),
];

const EX_LINK = { templateId: "t-cardio", title: "Cardio 30 min" };

function exerciseViewOf(sessions: readonly SessionView[], over: Partial<ExerciseView> = {}): ExerciseView {
  const walks = sessions.filter((s) => s.kind === "WALK");
  return {
    today: EXERCISE_FIXTURE_TODAY,
    sessions: [...sessions],
    week: exerciseWeekOf(walks, EXERCISE_FIXTURE_TODAY),
    ready: true,
    kindsReady: true,
    live: true,
    link: EX_LINK,
    paid: { "ex-w1": { xp: 14.2, day: EXERCISE_FIXTURE_TODAY, reversible: true } },
    ...over,
  };
}

const MIXED = exerciseViewOf(EXERCISE_SESSIONS);
/** A 10 km "run" in 20 minutes: 30 km/h, past the 25 km/h a run can count at. */
const FAST_RUN = sessionOf("ex-fast", 0, { kind: "RUN", distanceKm: 10, durationMin: 20 });
const A_ROW = sessionOf("ex-row", 0, { kind: "ROW", distanceKm: 2, durationMin: 8 + 10 / 60 });
const A_RIDE = sessionOf("ex-ride", 0, { kind: "CYCLE", distanceKm: 18.4, durationMin: 45, variant: "ROAD" });
/** A game under its own name at the 40 characters a name may have (SESSION_LIMITS), for the Again chip's longest line. */
const LONG_GAME = sessionOf("ex-long", 1, { kind: "SPORT", variant: "OTHER", label: "Ultimate frisbee with the Thursday group", durationMin: 90 });
/** A 60-character habit title on "Counts as". */
const LONG_LINK = { templateId: "t-long", title: "Cardio intervals on the bike, the rower or the treadmill 30m" };

export type ExerciseFixtureName =
  | "kinds"
  | "empty"
  | "again"
  | "run"
  | "more"
  | "runOffer"
  | "swim"
  | "sport"
  | "yoga"
  | "longNames"
  | "counted"
  | "countedDelete"
  | "refused"
  | "recordOnly"
  | "walkOffer"
  | "lift"
  | "walkOnly";

export interface ExerciseFixture {
  label: string;
  view: ExerciseView;
  initial?: ExerciseCardInitial;
}

export const EXERCISE_FIXTURES: Record<ExerciseFixtureName, ExerciseFixture> = {
  kinds: { label: "Exercise · every kind: the picker, the week, the list (Walk picked)", view: MIXED },
  empty: { label: "Exercise · every kind, nothing logged yet", view: exerciseViewOf([], { link: null, paid: {} }) },
  again: { label: "Exercise · Run picked: the Again chip (the last run, on today's date)", view: MIXED, initial: { kind: "RUN" } },
  run: {
    label: "Exercise · a run typed in: live pace and speed, Counts as pre-selected",
    view: MIXED,
    initial: { kind: "RUN", draft: { distance: "5", duration: "26:30", variant: "ROAD" } },
  },
  more: {
    label: "Exercise · a run with More open: the name, incline, heart rates and how hard (7)",
    view: MIXED,
    initial: { kind: "RUN", draft: { distance: "5", duration: "26:30", avgHr: "152", maxHr: "171", rpe: 7 }, more: true },
  },
  runOffer: {
    label: "Exercise · a run at a walking pace (3 km in 45 min): Log it as a walk?",
    view: MIXED,
    initial: { kind: "RUN", draft: { distance: "3", duration: "45" } },
  },
  swim: {
    label: "Exercise · a swim in a 25 m pool: 60 lengths, its pace per 100 m",
    view: MIXED,
    initial: { kind: "SWIM", draft: { poolM: "25", lengths: "60", duration: "32", variant: "FREESTYLE" } },
  },
  sport: { label: "Exercise · a game: the sport from the list", view: MIXED, initial: { kind: "SPORT", draft: { variant: "TENNIS", duration: "60" } } },
  yoga: { label: "Exercise · yoga: the style chips (Hatha unless picked)", view: MIXED, initial: { kind: "YOGA", draft: { variant: "VINYASA", duration: "45" } } },
  longNames: {
    label: "Exercise · long names: a 40-character game on Again, a 60-character habit on Counts as (they wrap)",
    view: exerciseViewOf([EXERCISE_SESSIONS[0], LONG_GAME, ...EXERCISE_SESSIONS.slice(1)], { link: LONG_LINK }),
    initial: { kind: "SPORT" },
  },
  counted: {
    label: "Exercise · a ride saved, counted as the habit",
    view: MIXED,
    initial: { kind: "CYCLE", saved: sessionLoggedLineOf(A_RIDE, null, { kind: "COUNTED", title: EX_LINK.title }) },
  },
  countedDelete: {
    label: "Exercise · a ride that counted as the habit, on its Sure? step: the habit stays ticked",
    view: exerciseViewOf([A_RIDE, ...EXERCISE_SESSIONS], { link: null, counted: { [A_RIDE.id]: EX_LINK.title } }),
    initial: { kind: "CYCLE", confirm: A_RIDE.id },
  },
  refused: {
    label: "Exercise · a refusal: a run faster than 25 km/h, saved as a record that never counts",
    view: MIXED,
    initial: { kind: "RUN", saved: sessionLoggedLineOf(FAST_RUN, sessionRefusalOf(FAST_RUN), { kind: "NOT_COUNTED", error: "this session can't count" }) },
  },
  recordOnly: {
    label: "Exercise · the record-only line (no habit due): a row saved",
    view: exerciseViewOf(EXERCISE_SESSIONS, { link: null }),
    initial: { kind: "ROW", saved: sessionLoggedLineOf(A_ROW, null, null) },
  },
  walkOffer: {
    label: "Exercise · a walk faster than a walk: Log it as a run?",
    view: MIXED,
    initial: { kind: "WALK", draft: { distance: "5", duration: "28" } },
  },
  lift: { label: "Exercise · Lift: the set logger arrives next (nothing is saved)", view: MIXED, initial: { kind: "LIFT" } },
  walkOnly: {
    label: "Exercise · before the strength_sets migration: walking only, as always",
    view: exerciseViewOf(
      EXERCISE_SESSIONS.filter((s) => s.kind === "WALK"),
      { kindsReady: false }
    ),
  },
};
