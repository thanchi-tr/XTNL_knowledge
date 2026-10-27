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
 *
 * Fixture LiftViews for Train › Exercise, Lift mode (health-2026-10-27.md D12, D14-D19; phase 4): LIFT_FIXTURES on
 * twelve made-up finished lifts (Push day, Legs and Pull day, a week apart each, over four weeks: LIFT_FIXTURE_HISTORY),
 * run through training.ts's own rules (movementRecordsOf, liftMomentsOf, sessionSummaryOf, weekGroupsOf, bigJumpOf),
 * so the ghosts, records, new bests, the big-jump line and the bands are what the rules say. Each opens the card on
 * Lift in a state: start (no open lift: Repeat), ghosts (Push day repeated, every row a ghost), warmup, plates (plate
 * math, the weight's steppers shown), drop (a drop chain and the next drop at −20 %), timer (the rest timer running),
 * jump (the Big jump question), bw and bwNoBody (a bodyweight movement with and without a weigh-in), kinds (the kind
 * menu open), records (the Records panel), picker (search), custom (the user's own movement in use, the new-movement
 * form open), finish (the Finish panel), summary (a new best), summaryHeld (a 2× set held for Confirm), notReady and
 * failed.
 */
import { addDays, daysBetween, zonedToInstant, type DayKey } from "@/lib/life-day";
import { bigJumpLineOf, bigJumpOf, jumpBaselineOf, liftMomentsOf, movementRecordsOf, sessionSummaryOf, summaryLinesOf, weekGroupsOf } from "@/lib/training";
import type { FinishedLift, LiftSessionView, LiftSetView, LiftView, MovementHistory, RecentLift, UserMovementView } from "@/lib/training-server";
import { MIN_READINGS_FOR_RATE, STALE_AFTER_DAYS, TREND_ALPHA, type WeightGoalView, type WeightTrendPoint, type WeightView } from "@/lib/weight";
import { EMPTY_PREFS, emptyMindView, mindViewOf, olderFromOf, receiptLineOf, type MindPrefsView, type MindView, type MoodCheckView } from "@/lib/mind";
import type { LoggedCheck } from "@/lib/mind-server";
import { againLineOf, exerciseWeekOf, sessionLoggedLineOf, sessionRefusalOf, type SessionView } from "@/lib/exercise";
import type { ExerciseView } from "@/lib/exercise-server";
import type { ExerciseCardInitial } from "./ExerciseCard";
import { dropDraftOf, liftResolverOf, rowsOf } from "./lift-model";

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

// ── Exercise: the lift logger (health-2026-10-27.md D12, D14-D19; phase 4) ──

/** The lift fixtures' day (the exercise fixtures' Thursday) and the body weight they log against. */
export const LIFT_FIXTURE_TODAY: DayKey = EXERCISE_FIXTURE_TODAY;
const BODY_KG = 72;
/** The habit "Counts as" pre-selects at Finish. */
const GYM_LINK = { templateId: "t-gym", title: "Gym session" };

/** The user's own movements: a landmine press in use, a sled push never logged. */
const USER_MOVEMENTS: UserMovementView[] = [
  {
    id: "fx-landmine",
    key: "u:fx-landmine",
    name: "Landmine press",
    pattern: "PUSH_V",
    equipment: "OTHER",
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["chest", "triceps"],
    load: "EXT",
    bodyFraction: null,
    unilateral: true,
    stepKg: 2.5,
    restSec: null,
    archived: false,
  },
  {
    id: "fx-sled",
    key: "u:fx-sled",
    name: "Sled push",
    pattern: "SQUAT",
    equipment: "OTHER",
    primaryMuscles: ["quadriceps", "glutes"],
    secondaryMuscles: ["calves"],
    load: "EXT",
    bodyFraction: null,
    unilateral: false,
    stepKg: 10,
    restSec: 120,
    archived: false,
  },
];

export const LIFT_FIXTURE_RESOLVE = liftResolverOf(USER_MOVEMENTS);

/** An instant `ago` days back at hh:mm in the life zone (ISO). */
function liftAt(ago: number, hh: number, mm: number): string {
  const [y, m, d] = addDays(LIFT_FIXTURE_TODAY, -ago).split("-").map(Number);
  return new Date(zonedToInstant(y, m, d, hh).getTime() + mm * 60_000).toISOString();
}

/** A set as written: W a warm-up, S a working set, D a drop, R a rest-pause set; the weight, the reps, then any other field. */
type SetSpec = [kind: "W" | "S" | "D" | "R", weightKg: number | null, reps: number | null, extra?: Partial<LiftSetView>];
const SET_KIND = { W: "WARMUP", S: "WORKING", D: "DROP", R: "MINI" } as const;
const MIN_A_SET = 3;

function liftSetsOf(entryId: string, specs: readonly SetSpec[], fromMs: number): LiftSetView[] {
  let head: number | null = null;
  return specs.map(([k, weightKg, reps, extra], i): LiftSetView => {
    const ord = i + 1;
    const kind = SET_KIND[k];
    if (kind === "WORKING") head = ord;
    return {
      id: `${entryId}-s${ord}`,
      entryId,
      ord,
      kind,
      chainOf: kind === "DROP" || kind === "MINI" ? head : null,
      weightKg,
      reps,
      rir: null,
      toFailure: false,
      amrap: false,
      durationSec: null,
      distanceM: null,
      restSec: null,
      clientId: `${entryId}-c${ord}`,
      doneAt: new Date(fromMs + (i + 1) * MIN_A_SET * 60_000).toISOString(),
      afterFinish: false,
      ...extra,
    };
  });
}

/** One movement as written: its key, its sets, and the body weight it was logged against (a BW movement: 72 kg unless given). */
interface EntrySpec {
  key: string;
  sets: SetSpec[];
  bodyKg?: number | null;
}

/** A lift `ago` days back from 18:02, three minutes a set and two between movements; open, or finished four minutes after its last set. */
function liftOf(id: string, ago: number, label: string | null, specs: readonly EntrySpec[], open = false): LiftSessionView {
  const startedAt = liftAt(ago, 18, 2);
  let minute = 0;
  const entries = specs.map((e, i) => {
    const entryId = `${id}-e${i + 1}`;
    const sets = liftSetsOf(entryId, e.sets, Date.parse(startedAt) + minute * 60_000);
    minute += e.sets.length * MIN_A_SET + 2;
    const bw = LIFT_FIXTURE_RESOLVE(e.key)?.load === "BW";
    return { id: entryId, movementKey: e.key, ord: i + 1, groupNo: null, bodyKg: e.bodyKg !== undefined ? e.bodyKg : bw ? BODY_KG : null, note: null, sets };
  });
  const durationMin = minute + 4;
  return {
    id,
    day: addDays(LIFT_FIXTURE_TODAY, -ago),
    label,
    startedAt,
    endedAt: open ? null : new Date(Date.parse(startedAt) + durationMin * 60_000).toISOString(),
    durationMin: open ? 0 : durationMin,
    backfill: false,
    entries,
  };
}

const sameSets = (k: "W" | "S", kg: number | null, r: number, n: number): SetSpec[] => Array.from({ length: n }, (): SetSpec => [k, kg, r]);
const hold = (sec: number): SetSpec => ["S", null, null, { durationSec: sec }];
const carry = (kg: number, m: number): SetSpec => ["S", kg, null, { distanceM: m }];

/** Four weeks of Push day, Legs and Pull day (a week apart each), oldest first: the history the ghosts, records and bests read. */
export const LIFT_FIXTURE_HISTORY: LiftSessionView[] = [
  liftOf("fx-push-1", 28, "Push day", [
    { key: "bench_press", sets: [["W", 40, 10], ...sameSets("S", 60, 8, 3)] },
    { key: "incline_db_press", sets: [["S", 22, 10], ["S", 22, 10], ["S", 22, 9]] },
    { key: "triceps_pushdown", sets: [["S", 25, 12], ["S", 25, 12], ["S", 25, 11]] },
    { key: "dip", sets: [["S", 0, 10], ["S", 0, 9], ["S", 0, 8]] },
  ]),
  liftOf("fx-legs-1", 26, "Legs", [
    { key: "back_squat", sets: [["W", 60, 5], ["W", 80, 3], ...sameSets("S", 95, 5, 3)] },
    { key: "romanian_deadlift", sets: sameSets("S", 80, 8, 3) },
    { key: "plank", sets: [hold(60), hold(60)] },
  ]),
  liftOf("fx-pull-1", 24, "Pull day", [
    { key: "pull_up", sets: sameSets("S", -20, 8, 3) },
    { key: "barbell_row", sets: sameSets("S", 60, 8, 3) },
    { key: "db_curl", sets: sameSets("S", 12, 10, 3) },
    { key: "farmers_carry", sets: [carry(32, 40), carry(32, 40)] },
  ]),
  liftOf("fx-push-2", 21, "Push day", [
    { key: "bench_press", sets: [["W", 40, 10], ["S", 62.5, 8], ["S", 62.5, 8], ["S", 62.5, 7]] },
    { key: "incline_db_press", sets: sameSets("S", 22, 10, 3) },
    { key: "triceps_pushdown", sets: sameSets("S", 25, 12, 3) },
    { key: "dip", sets: sameSets("S", 5, 8, 3) },
  ]),
  liftOf("fx-legs-2", 19, "Legs", [
    { key: "back_squat", sets: [["W", 60, 5], ["W", 80, 3], ...sameSets("S", 97.5, 5, 3)] },
    { key: "romanian_deadlift", sets: sameSets("S", 80, 8, 3) },
    { key: "plank", sets: [hold(60), hold(70)] },
  ]),
  liftOf("fx-pull-2", 17, "Pull day", [
    { key: "pull_up", sets: sameSets("S", -15, 8, 3) },
    { key: "barbell_row", sets: sameSets("S", 62.5, 8, 3) },
    { key: "db_curl", sets: sameSets("S", 12, 10, 3) },
    { key: "farmers_carry", sets: [carry(32, 40), carry(32, 40)] },
  ]),
  liftOf("fx-push-3", 14, "Push day", [
    { key: "bench_press", sets: [["W", 40, 10], ["S", 62.5, 8], ["S", 65, 6], ["S", 65, 6], ["D", 52.5, 8]] },
    { key: "incline_db_press", sets: [["S", 24, 8], ["S", 24, 8], ["S", 22, 10]] },
    { key: "triceps_pushdown", sets: [["S", 25, 12], ["S", 25, 12], ["S", 25, 10]] },
    { key: "dip", sets: [["S", 5, 8], ["S", 5, 8], ["S", 5, 7]] },
  ]),
  liftOf("fx-legs-3", 12, "Legs", [
    { key: "back_squat", sets: [["W", 60, 5], ["W", 80, 3], ...sameSets("S", 100, 5, 3)] },
    { key: "romanian_deadlift", sets: sameSets("S", 82.5, 8, 3) },
    { key: "plank", sets: [hold(75), hold(70)] },
  ]),
  liftOf("fx-pull-3", 10, "Pull day", [
    { key: "pull_up", sets: sameSets("S", -10, 8, 3) },
    { key: "barbell_row", sets: sameSets("S", 62.5, 8, 3) },
    { key: "db_curl", sets: sameSets("S", 14, 8, 3) },
    { key: "farmers_carry", sets: [carry(34, 40), carry(34, 40)] },
  ]),
  liftOf("fx-push-4", 7, "Push day", [
    { key: "bench_press", sets: [["W", 40, 10], ["S", 65, 8], ["S", 65, 8], ["S", 65, 7]] },
    { key: "incline_db_press", sets: sameSets("S", 24, 8, 3) },
    { key: "triceps_pushdown", sets: sameSets("S", 25, 12, 3) },
    { key: "dip", sets: [["S", 10, 8], ["S", 10, 7], ["S", 10, 6]] },
  ]),
  liftOf("fx-legs-4", 5, "Legs", [
    { key: "back_squat", sets: [["W", 60, 5], ["W", 80, 3], ...sameSets("S", 100, 5, 3)] },
    { key: "romanian_deadlift", sets: sameSets("S", 85, 8, 3) },
    { key: "plank", sets: [hold(75), hold(75)] },
  ]),
  liftOf("fx-pull-4", 3, "Pull day", [
    { key: "pull_up", sets: sameSets("S", -10, 8, 3) },
    { key: "barbell_row", sets: sameSets("S", 65, 8, 3) },
    { key: "db_curl", sets: sameSets("S", 14, 8, 3) },
    { key: "farmers_carry", sets: [carry(34, 40), carry(34, 40)] },
  ]),
];

const newestFirst = (a: Pick<LiftSessionView, "day">, b: Pick<LiftSessionView, "day">) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0);

/** The history's moments as the server derives them: one pass over whole lifts (each lift's two-a-session cap holds). */
const LIFT_FIXTURE_MOMENTS = liftMomentsOf(LIFT_FIXTURE_HISTORY, "kg", LIFT_FIXTURE_RESOLVE).moments;

/** A movement's history as the server builds it (training-server historyOf): the last lift's sets, its newest lifts, its records and its new bests. */
function liftHistoryOf(key: string): MovementHistory {
  const withIt = LIFT_FIXTURE_HISTORY.filter((s) => s.entries.some((e) => e.movementKey === key)).map((s) => ({ ...s, entries: s.entries.filter((e) => e.movementKey === key) }));
  const newest = [...withIt].sort(newestFirst);
  const last = newest[0];
  return {
    movementKey: key,
    last: last ? { sessionId: last.id, day: last.day, bodyKg: last.entries[0].bodyKg, sets: last.entries[0].sets } : null,
    recent: newest.slice(0, 5).map((s) => ({ sessionId: s.id, day: s.day, bodyKg: s.entries[0].bodyKg, sets: s.entries.flatMap((e) => e.sets) })),
    records: movementRecordsOf(withIt, key, LIFT_FIXTURE_RESOLVE),
    moments: [...LIFT_FIXTURE_MOMENTS.values()]
      .flat()
      .filter((p) => p.movementKey === key)
      .sort(newestFirst)
      .slice(0, 10),
    since: null,
  };
}

/** Repeat's choices: the newest finished lift of each name. */
const LIFT_RECENT: RecentLift[] = (() => {
  const seen = new Set<string>();
  const out: RecentLift[] = [];
  for (const s of [...LIFT_FIXTURE_HISTORY].sort(newestFirst)) {
    const name = (s.label ?? "").toLowerCase();
    if (seen.has(name) || out.length >= 5) continue;
    seen.add(name);
    out.push({
      id: s.id,
      day: s.day,
      label: s.label,
      durationMin: s.durationMin,
      movements: s.entries.map((e) => ({ movementKey: e.movementKey, name: LIFT_FIXTURE_RESOLVE(e.movementKey)?.name ?? e.movementKey })),
      line: againLineOf({ kind: "LIFT", label: s.label, variant: null, distanceKm: 0, durationMin: s.durationMin, avgWatts: null }),
    });
  }
  return out;
})();

const lastSetIsoOf = (s: LiftSessionView): string | null => s.entries.flatMap((e) => e.sets.map((x) => x.doneAt)).reduce<string | null>((m, x) => (m == null || x > m ? x : m), null);

/** The lift view the server would give with `open` open (or none). */
function liftViewOf(open: LiftSessionView | null, over: Partial<LiftView> = {}): LiftView {
  // The server reads history for the open lift's movements; with none open, the fixtures carry Repeat's, so a fake
  // Repeat opens on its ghosts (the server's view has them once its refresh lands).
  const keys = [...new Set(open ? open.entries.map((e) => e.movementKey) : LIFT_RECENT.flatMap((r) => r.movements.map((x) => x.movementKey)))];
  return {
    today: LIFT_FIXTURE_TODAY,
    ready: true,
    unit: "kg",
    body: { kg: BODY_KG, day: addDays(LIFT_FIXTURE_TODAY, -1) },
    open: open ? { ...open, summary: sessionSummaryOf(open, LIFT_FIXTURE_RESOLVE), lastSetAt: lastSetIsoOf(open) } : null,
    recent: LIFT_RECENT,
    history: Object.fromEntries(keys.map((k) => [k, liftHistoryOf(k)])),
    movements: USER_MOVEMENTS,
    week: weekGroupsOf([...LIFT_FIXTURE_HISTORY, ...(open ? [open] : [])], LIFT_FIXTURE_TODAY, LIFT_FIXTURE_RESOLVE),
    closed: [],
    ...over,
  };
}

/** The exercise card around the logger: the lifts listed as sessions (a finished lift is a LIFT session), and a walk. */
const LIFT_EX_VIEW: ExerciseView = exerciseViewOf(
  [
    ...LIFT_FIXTURE_HISTORY.map((s) => sessionOf(s.id, daysBetween(s.day, LIFT_FIXTURE_TODAY), { kind: "LIFT", label: s.label, durationMin: s.durationMin, startedAt: s.startedAt, endedAt: s.endedAt })),
    EXERCISE_SESSIONS[5],
  ].sort(newestFirst),
  { link: GYM_LINK, paid: {} }
);

const OPEN_ID = "fx-now";
const entryIdOf = (i: number) => `${OPEN_ID}-e${i}`;
const pushWith = (bench: SetSpec[]) =>
  liftOf(OPEN_ID, 0, "Push day", [
    { key: "bench_press", sets: bench },
    { key: "incline_db_press", sets: [] },
    { key: "triceps_pushdown", sets: [] },
  ], true);

const GHOSTS = pushWith([]);
const DROP_LIFT = pushWith([["W", 40, 10], ["S", 67.5, 8], ["S", 67.5, 6], ["D", 52.5, 8]]);
const TIMER_LIFT = pushWith([["W", 40, 10], ["S", 67.5, 8]]);
const JUMP_LIFT = pushWith([["W", 40, 10], ["S", 85, 5]]);
const LEGS_WARMUP = liftOf(OPEN_ID, 0, "Legs", [{ key: "back_squat", sets: [["W", 60, 5]] }, { key: "romanian_deadlift", sets: [] }, { key: "plank", sets: [] }], true);
const LEGS_PLATES = liftOf(OPEN_ID, 0, "Legs", [{ key: "back_squat", sets: [["W", 60, 5], ["W", 80, 3]] }, { key: "romanian_deadlift", sets: [] }], true);
const bwLift = (bodyKg: number | null) =>
  liftOf(OPEN_ID, 0, "Bodyweight", [
    { key: "dip", sets: [["S", 10, 8]], bodyKg },
    { key: "pull_up", sets: [["S", -10, 8]], bodyKg },
  ], true);
const CUSTOM_LIFT = liftOf(OPEN_ID, 0, null, [{ key: "u:fx-landmine", sets: [["S", 30, 10], ["S", 30, 10]] }, { key: "bench_press", sets: [] }], true);
const FINISH_LIFT = liftOf(OPEN_ID, 0, "Push day", [
  { key: "bench_press", sets: [["W", 40, 10], ["S", 67.5, 8], ["S", 67.5, 8], ["S", 67.5, 7]] },
  { key: "incline_db_press", sets: [["S", 24, 9], ["S", 24, 8], ["S", 24, 8]] },
  { key: "triceps_pushdown", sets: [["S", 27.5, 12], ["S", 27.5, 11]] },
], true);

/** The big jump the jump fixture's 85 × 5 asks about (against the 8 weeks before today). */
const BENCH = LIFT_FIXTURE_RESOLVE("bench_press");
const JUMP_SET = JUMP_LIFT.entries[0].sets[1];
const JUMP = BENCH ? bigJumpOf(JUMP_SET, BENCH, null, jumpBaselineOf(LIFT_FIXTURE_HISTORY, "bench_press", LIFT_FIXTURE_TODAY, LIFT_FIXTURE_RESOLVE)) : null;

/** A lift finished at 19:00 (closed), summed up as finishLiftCore sums it (its new bests over the four weeks before it). */
function finishedOf(current: LiftSessionView): FinishedLift & { closed: LiftSessionView } {
  const closed: LiftSessionView = { ...current, endedAt: liftAt(0, 19, 0), durationMin: 58 };
  const lm = liftMomentsOf([...LIFT_FIXTURE_HISTORY, closed], "kg", LIFT_FIXTURE_RESOLVE);
  const moments = lm.moments.get(closed.id) ?? [];
  const held = lm.held.get(closed.id) ?? [];
  const session = sessionOf(closed.id, 0, { kind: "LIFT", label: closed.label, durationMin: 58, startedAt: closed.startedAt, endedAt: closed.endedAt });
  const link = { kind: "COUNTED" as const, title: GYM_LINK.title };
  const summary = sessionSummaryOf(closed, LIFT_FIXTURE_RESOLVE);
  return { session, by: "CLOCK", refusal: null, link, replay: false, unit: "kg", summary, moments, held, records: [], line: sessionLoggedLineOf(session, null, link), lines: summaryLinesOf(summary, "kg", moments, held), closed };
}

/** The summary as a FinishedLift (the closed lift kept apart, for the fakes' replay). */
const asFinished = ({ closed: _closed, ...f }: FinishedLift & { closed: LiftSessionView }): FinishedLift => (void _closed, f);

const DONE = finishedOf({ ...FINISH_LIFT, id: "fx-done" });
/** A pushdown at 60 kg, over twice the best of 25: recorded, held for Confirm. */
const HELD = finishedOf(
  liftOf("fx-held", 0, "Push day", [
    { key: "bench_press", sets: [["W", 40, 10], ["S", 67.5, 8], ["S", 67.5, 8]] },
    { key: "triceps_pushdown", sets: [["S", 60, 8], ["S", 25, 12]] },
  ], true)
);

const DROP_ENTRY = DROP_LIFT.entries[0];
const NEXT_DROP = BENCH ? dropDraftOf(rowsOf(DROP_ENTRY.sets, []), BENCH, "kg", null, liftHistoryOf("bench_press").last?.sets ?? null, `${DROP_ENTRY.id}:d1`) : null;

export type LiftFixtureName =
  | "start"
  | "ghosts"
  | "warmup"
  | "plates"
  | "drop"
  | "timer"
  | "jump"
  | "bw"
  | "bwNoBody"
  | "kinds"
  | "records"
  | "picker"
  | "custom"
  | "finish"
  | "summary"
  | "summaryHeld"
  | "notReady"
  | "failed";

export interface LiftFixture {
  label: string;
  view: ExerciseView;
  lift: LiftView;
  initial: ExerciseCardInitial;
  /** A finished lift the summary shows: the fakes replay Finish on it (the summary's Keep or Confirm). */
  ended?: LiftSessionView;
}

const onLift = (lift: ExerciseCardInitial["lift"] = {}): ExerciseCardInitial => ({ kind: "LIFT", lift });

export const LIFT_FIXTURES: Record<LiftFixtureName, LiftFixture> = {
  start: { label: "Lift · no open lift: Repeat a lift (one tap) or start an empty one; this week's hard sets as bands", view: LIFT_EX_VIEW, lift: liftViewOf(null), initial: onLift() },
  ghosts: { label: "Lift · Push day repeated: every row a ghost from last week ('last 40 × 10'); ✓ accepts it", view: LIFT_EX_VIEW, lift: liftViewOf(GHOSTS), initial: onLift() },
  warmup: { label: "Lift · a warm-up logged ('W'), the next warm-up a ghost with its plate math", view: LIFT_EX_VIEW, lift: liftViewOf(LEGS_WARMUP), initial: onLift() },
  plates: {
    label: "Lift · plate math ('per side 25 + 15') and the weight's steppers, shown while the field is focused",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(LEGS_PLATES),
    initial: onLift({ active: { row: `${entryIdOf(1)}:g2`, field: "weight" } }),
  },
  drop: {
    label: "Lift · a drop chain (D after set 2) and the next drop added at −20 %, rounded down to the step",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(DROP_LIFT),
    initial: onLift({ drafts: { [DROP_ENTRY.id]: NEXT_DROP ? [NEXT_DROP] : [] } }),
  },
  timer: {
    label: "Lift · the rest timer running after set 1 (3:00, the bench press's rest); Skip",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(TIMER_LIFT),
    initial: onLift({ timer: { entryId: entryIdOf(1), totalSec: 180, remainingSec: 154, endsAt: null } }),
  },
  jump: {
    label: "Lift · the Big jump question: 85 kg against a best of 65 (Keep or Fix)",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(JUMP_LIFT),
    initial: onLift({ book: { jumps: JUMP ? { [JUMP_SET.id]: { jump: JUMP, line: bigJumpLineOf(JUMP, "EXT", "kg"), movementKey: "bench_press" } } : {}, answers: {} } }),
  },
  bw: { label: "Lift · bodyweight movements with a weigh-in: 'body weight 72 kg + 10', and assistance", view: LIFT_EX_VIEW, lift: liftViewOf(bwLift(BODY_KG)), initial: onLift() },
  bwNoBody: { label: "Lift · bodyweight movements with no weigh-in: reps only, and the screen says so", view: LIFT_EX_VIEW, lift: liftViewOf(bwLift(null), { body: null }), initial: onLift() },
  kinds: {
    label: "Lift · the number chip's kind menu open on the next row (Warm-up, Working, Drop, Rest-pause, and the two flags)",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(TIMER_LIFT),
    initial: onLift({ menu: `${entryIdOf(1)}:g2` }),
  },
  records: {
    label: "Lift · the bench press's Records: heaviest, best e1RM and what it is estimated from, rep maxes, new bests, recent lifts",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(GHOSTS),
    initial: onLift({ records: entryIdOf(1) }),
  },
  picker: { label: "Lift · Add a movement: a search ('press'), the ones lifted lately first, the user's own marked", view: LIFT_EX_VIEW, lift: liftViewOf(GHOSTS), initial: onLift({ picker: { query: "press" } }) },
  custom: {
    label: "Lift · the user's own movement in the lift (Landmine press), and the new-movement form open",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(CUSTOM_LIFT),
    initial: onLift({ picker: { create: { name: "Cable lateral raise", pattern: "ISOLATION", equipment: "CABLE", load: "EXT", primary: ["shoulders"], unilateral: true, bodyFraction: "" } } }),
  },
  finish: {
    label: "Lift · Finish: the minutes it counts, how hard (7), Counts as pre-selected",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(FINISH_LIFT),
    initial: onLift({ finish: { label: "Push day", minutes: "", rpe: 7, countsAs: true, nowMs: Date.parse(lastSetIsoOf(FINISH_LIFT) ?? liftAt(0, 19, 0)) + 4 * 60_000 } }),
  },
  summary: {
    label: "Lift · the Finish summary: sets, volume, each top set and the new bests (no XP, no celebration)",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(null),
    initial: onLift({ finished: asFinished(DONE) }),
    ended: DONE.closed,
  },
  summaryHeld: {
    label: "Lift · the summary with a set over twice the best, held until Confirm",
    view: LIFT_EX_VIEW,
    lift: liftViewOf(null),
    initial: onLift({ finished: asFinished(HELD) }),
    ended: HELD.closed,
  },
  notReady: { label: "Lift · before the lift tables: the set logger arrives next (nothing is saved)", view: LIFT_EX_VIEW, lift: { ...liftViewOf(null), ready: false }, initial: onLift() },
  failed: { label: "Lift · the lift view failed to load (never the empty logger)", view: LIFT_EX_VIEW, lift: { ...liftViewOf(null), ready: false, failed: true }, initial: onLift() },
};
