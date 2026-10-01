/**
 * Body weight's pure rules (src/lib/weight.ts) and the guards around the
 * server (src/lib/weight-server.ts) and the actions (src/app/actions/weight.ts):
 *
 *   - the trend: the first reading seeds it, a gap of n days moves it by
 *     1 − (1 − α)^n (the same as n daily readings of the new weight), days
 *     without a reading carry it, the window slices the tail;
 *   - the weekly rate: 'calibrating' under MIN_READINGS_FOR_RATE in the
 *     window, then the slope of the raw readings (not the lagging trend):
 *     a fresh 7-day ramp and five spaced readings read their true pace, a
 *     carried tail does not pull it toward zero;
 *   - the projection: every 'why' (no-target, calibrating, reached, flat,
 *     far, away) and the date, with onTrackForTargetDay;
 *   - progress from start to target, clamped;
 *   - the whole view: the 7-day change only over a real week with a recent
 *     reading, 'stale' after a week without one, the fast-loss note's
 *     neutral words;
 *   - the goal change (planGoalChange): a re-read figure within 0.05 kg is
 *     not a new target, a by-date edit keeps the start;
 *   - the write (logWriteData): a replace keeps the day's note unless one
 *     is given;
 *   - units, rounding, the clamp, the day rules, the life-day boundary
 *     (03:59 belongs to the day before);
 *   - source guards: the actions clamp every client value, and nothing in
 *     the economy imports weight (a record, never a reward).
 *
 * No database: importing weight-server.ts only builds the idle Prisma
 * client. Today is Thursday 1 October 2026.
 *
 *   npx tsx scripts/weight-check.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { addDays, dayKeyOf, todayKey, zonedToInstant } from "../src/lib/life-day";
import {
  clampKg,
  cleanNote,
  FLAT_KG_PER_WEEK,
  formatWeight,
  fromKg,
  isDayKey,
  isWeightUnit,
  logDayError,
  MAX_NOTE_CHARS,
  MIN_READINGS_FOR_RATE,
  planGoalChange,
  progressToTarget,
  projectTarget,
  roundKg,
  targetDayError,
  toKg,
  trendSeries,
  weeklyRate,
  weightView,
  type WeightGoalView,
  type WeightRate,
  type WeightReading,
} from "../src/lib/weight";
import { EMPTY_GOAL, isMissingTable, logWriteData } from "../src/lib/weight-server";

const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number | null, b: number, eps = 1e-6) => a !== null && Math.abs(a - b) <= eps;

const T = "2026-10-01";
const r = (day: string, kg: number): WeightReading => ({ day, kg, source: "manual" });
const goal = (g: Partial<WeightGoalView>): WeightGoalView => ({ ...EMPTY_GOAL, ...g });
const rate = (kgPerWeek: number): WeightRate => ({ kind: "rate", kgPerWeek });
const calibrating: WeightRate = { kind: "calibrating", readings: 2, need: MIN_READINGS_FOR_RATE };
/** A reading every day for `days` days ending today, from `start` moving `perDay`. */
function ramp(days: number, start: number, perDay: number, end: string = T): WeightReading[] {
  const out: WeightReading[] = [];
  for (let k = days - 1; k >= 0; k--) out.push(r(addDays(end, -k), start + perDay * (days - 1 - k)));
  return out;
}

// ── The trend ─────────────────────────────────────────────────────────────
console.log("— trend");
check("no readings: no series", same(trendSeries([], T, 90), []));
check("one reading seeds the trend", same(trendSeries([r(T, 80)], T, 90), [{ day: T, kg: 80, trendKg: 80 }]));
check(
  "a next-day reading moves it by α",
  same(trendSeries([r("2026-09-30", 80), r(T, 79)], T, 90), [
    { day: "2026-09-30", kg: 80, trendKg: 80 },
    { day: T, kg: 79, trendKg: 79.9 },
  ])
);
check(
  "a 3-day gap moves it by 1 − 0.9³ = 0.271 of the gap, and the empty days carry it",
  same(trendSeries([r("2026-09-28", 80), r(T, 78)], T, 90), [
    { day: "2026-09-28", kg: 80, trendKg: 80 },
    { day: "2026-09-29", kg: null, trendKg: 80 },
    { day: "2026-09-30", kg: null, trendKg: 80 },
    { day: T, kg: 78, trendKg: 79.46 },
  ])
);
{
  const gap = trendSeries([r("2026-09-28", 80), r(T, 78)], T, 1)[0].trendKg;
  const daily = trendSeries([r("2026-09-28", 80), r("2026-09-29", 78), r("2026-09-30", 78), r(T, 78)], T, 1)[0].trendKg;
  check("the gap decay equals daily readings of the new weight (neither stalls nor jumps)", gap === daily, `${gap} vs ${daily}`);
}
check(
  "after the last reading the trend carries to today",
  same(trendSeries([r("2026-09-29", 80), r("2026-09-30", 81)], T, 90).map((p) => [p.kg, p.trendKg]), [
    [80, 80],
    [81, 80.1],
    [null, 80.1],
  ])
);
check(
  "a future reading, a bad day and a non-finite weight are ignored; the last of a day wins",
  same(
    trendSeries([r(T, 70), r("2026-10-02", 90), r("2026-13-01", 90), r("2026-09-30", NaN), r(T, 72)], T, 90),
    [{ day: T, kg: 72, trendKg: 72 }]
  )
);
check(
  "unsorted input is sorted",
  same(trendSeries([r(T, 79), r("2026-09-30", 80)], T, 90).map((p) => p.trendKg), [80, 79.9])
);
{
  const s = trendSeries(ramp(120, 100, -0.1), T, 90);
  check("the window keeps the last 90 days, oldest first, ending today", s.length === 90 && s[0].day === addDays(T, -89) && s[89].day === T);
  check("a long steady ramp: the trend lags the readings by slope·(1−α)/α = 0.9 kg", near(s[89].kg! - s[89].trendKg, -0.9, 0.011), `${s[89].kg} vs ${s[89].trendKg}`);
}
check("days ≤ 0: nothing", same(trendSeries([r(T, 80)], T, 0), []));

// ── The weekly rate ───────────────────────────────────────────────────────
console.log("— rate");
check("no readings: calibrating 0 of 5", same(weeklyRate([], T), { kind: "calibrating", readings: 0, need: 5 }));
check("4 readings in the window: calibrating 4 of 5", same(weeklyRate(ramp(4, 80, -0.1), T), { kind: "calibrating", readings: 4, need: 5 }));
check(
  "readings older than 28 days don't count toward the 5",
  same(weeklyRate([...ramp(10, 80, 0, addDays(T, -30)), ...ramp(4, 80, 0)], T), { kind: "calibrating", readings: 4, need: 5 })
);
check("5 flat readings: rate 0", same(weeklyRate(ramp(5, 80, 0), T), { kind: "rate", kgPerWeek: 0 }));
check("a long −0.1 kg/day ramp: −0.7 kg a week", same(weeklyRate(ramp(120, 100, -0.1), T), { kind: "rate", kgPerWeek: -0.7 }));
check("a long +0.05 kg/day ramp: +0.35 kg a week", same(weeklyRate(ramp(120, 60, 0.05), T), { kind: "rate", kgPerWeek: 0.35 }));
check("a fresh 28-day ramp reads its true pace, −0.7 (the trend's slope would still read −0.5)", same(weeklyRate(ramp(28, 90, -0.1), T), { kind: "rate", kgPerWeek: -0.7 }));
check("a fresh 7-day ramp (−0.1 kg/day): −0.7 kg a week from the first week", same(weeklyRate(ramp(7, 80, -0.1), T), { kind: "rate", kgPerWeek: -0.7 }));
{
  // Five readings three days apart, a steady −0.1 kg a day: gaps are wider steps in x, not flat days.
  const spaced = [0, 3, 6, 9, 12].map((d) => r(addDays(T, d - 12), 80 - 0.1 * d));
  check("five readings 3 days apart, −0.1 kg/day: −0.7 kg a week", same(weeklyRate(spaced, T), { kind: "rate", kgPerWeek: -0.7 }), JSON.stringify(weeklyRate(spaced, T)));
}
{
  // A 10-day loss of 0.2 kg a day (1.4 kg a week) is fast from the start, and the note says so.
  const v = weightView(ramp(10, 90, -0.2), EMPTY_GOAL, T);
  check("a fresh 1.4 kg/week loss reads −1.4 and gets the fast-loss note", same(v.rate, rate(-1.4)) && v.fastLossNote !== null, JSON.stringify(v.rate));
  check("the headline trend is still the smoothed one (it lags the readings)", v.trendKg !== null && v.latest !== null && v.trendKg > v.latest.kg + 0.5, `${v.trendKg} vs ${v.latest?.kg}`);
}
{
  // After one week of a −0.7 kg/week loss toward 70 from 80, the projection is about 14 weeks out, not 47.
  const v = weightView(ramp(7, 80, -0.1), goal({ targetKg: 70, startKg: 80, startDay: addDays(T, -6) }), T);
  check(
    "a week of −0.7 kg/week toward a 10 kg loss projects about 14 weeks out",
    v.projection.kind === "date" && v.projection.weeks > 13 && v.projection.weeks < 15,
    JSON.stringify(v.projection)
  );
}
check(
  "no weigh-ins for the last 10 days: the carried tail doesn't flatten the rate",
  same(weeklyRate(ramp(110, 100, -0.1, addDays(T, -10)), T), { kind: "rate", kgPerWeek: -0.7 })
);
check("5 readings every other day are enough", same(weeklyRate(ramp(10, 80, 0).filter((_, i) => i % 2 === 1), T), { kind: "rate", kgPerWeek: 0 }));

// ── The projection ────────────────────────────────────────────────────────
console.log("— projection");
const lose = goal({ targetKg: 80, startKg: 90, startDay: "2026-09-01" });
const gain = goal({ targetKg: 65, startKg: 60, startDay: "2026-09-01" });
const P = (trend: number | null, rt: WeightRate, g: WeightGoalView) => projectTarget(trend, rt, g, T);
check("no target: no-target", same(P(85, rate(-0.5), EMPTY_GOAL), { kind: "none", why: "no-target" }));
check("no trend yet: calibrating", same(P(null, rate(-0.5), lose), { kind: "none", why: "calibrating" }));
check("too few readings: calibrating", same(P(85, calibrating, lose), { kind: "none", why: "calibrating" }));
check("within 0.2 kg of the target: reached", same(P(80.2, rate(-0.5), lose), { kind: "none", why: "reached" }));
check("within 0.2 kg, even while calibrating: reached", same(P(79.9, calibrating, lose), { kind: "none", why: "reached" }));
check("past a loss target: reached", same(P(78, rate(-0.5), lose), { kind: "none", why: "reached" }));
check("past a gain target: reached", same(P(66, rate(0.3), gain), { kind: "none", why: "reached" }));
check("0.3 kg off: not reached", P(80.3, rate(-0.5), lose).kind === "date");
check(`slower than ${FLAT_KG_PER_WEEK} kg a week: flat`, same(P(85, rate(-0.04), lose), { kind: "none", why: "flat" }));
check("exactly 0.05 kg a week is not flat (100 weeks)", same(P(85, rate(-0.05), lose), { kind: "date", day: addDays(T, 700), weeks: 100, onTrackForTargetDay: null }));
check("more than 104 weeks out: far (no invented date, and not called flat)", same(P(100, rate(-0.1), lose), { kind: "none", why: "far" }));
check("−0.06 kg a week, 20 kg to go (333 weeks): far, not flat", same(P(90, rate(-0.06), goal({ targetKg: 70, startKg: 90 })), { kind: "none", why: "far" }));
check("flat only under FLAT_KG_PER_WEEK, however far the target", same(P(90, rate(-0.049), goal({ targetKg: 70, startKg: 90 })), { kind: "none", why: "flat" }));
check("gaining toward a loss target: away", same(P(85, rate(0.3), lose), { kind: "none", why: "away" }));
check("losing toward a gain target: away", same(P(62, rate(-0.3), gain), { kind: "none", why: "away" }));
check(
  "5 kg to go at −0.5 a week: 10 weeks, 70 days out",
  same(P(85, rate(-0.5), lose), { kind: "date", day: "2026-12-10", weeks: 10, onTrackForTargetDay: null })
);
check(
  "on track: the date is on or before the target day",
  same(P(85, rate(-0.5), { ...lose, targetDay: "2026-12-10" }), { kind: "date", day: "2026-12-10", weeks: 10, onTrackForTargetDay: true })
);
check(
  "not on track: the date is after the target day",
  same(P(85, rate(-0.5), { ...lose, targetDay: "2026-12-01" }), { kind: "date", day: "2026-12-10", weeks: 10, onTrackForTargetDay: false })
);
check(
  "a gain: 4 kg at +0.25 a week, 16 weeks",
  same(P(61, rate(0.25), gain), { kind: "date", day: addDays(T, 112), weeks: 16, onTrackForTargetDay: null })
);
check(
  "a part week rounds the days up and the weeks to one decimal",
  same(P(85, rate(-0.7), lose), { kind: "date", day: addDays(T, 50), weeks: 7.1, onTrackForTargetDay: null })
);
check(
  "no start: the direction is from the trend",
  same(P(85, rate(-0.5), goal({ targetKg: 80 })), { kind: "date", day: "2026-12-10", weeks: 10, onTrackForTargetDay: null })
);

// ── Progress ──────────────────────────────────────────────────────────────
console.log("— progress");
check("halfway from 90 to 80", progressToTarget(85, lose) === 0.5);
check("above the start: 0", progressToTarget(92, lose) === 0);
check("past the target: 1", progressToTarget(79, lose) === 1);
check("a gain: 60 → 65 at 61 is 0.2", near(progressToTarget(61, gain), 0.2));
check("no target, no start or no trend: null", [progressToTarget(85, EMPTY_GOAL), progressToTarget(85, goal({ targetKg: 80 })), progressToTarget(null, lose)].every((p) => p === null));
check("start equals target: 1 within 0.2 kg, else 0", progressToTarget(80.1, goal({ targetKg: 80, startKg: 80 })) === 1 && progressToTarget(81, goal({ targetKg: 80, startKg: 80 })) === 0);

// ── The view ──────────────────────────────────────────────────────────────
console.log("— view");
{
  const v = weightView([], EMPTY_GOAL, T);
  check(
    "empty: nothing logged, calibrating, no target, no note",
    v.latest === null && v.trendKg === null && v.change7Kg === null && v.progress === null && v.series.length === 0 &&
      !v.loggedToday && v.fastLossNote === null && same(v.rate, { kind: "calibrating", readings: 0, need: 5 }) &&
      same(v.projection, { kind: "none", why: "no-target" }) && v.unit === "kg"
  );
}
{
  const v = weightView([r(T, 80)], goal({ unit: "lb" }), T);
  check("one reading: trend, logged today, no 7-day change, the goal's unit", v.trendKg === 80 && v.loggedToday && v.change7Kg === null && v.unit === "lb" && v.latest?.kg === 80);
}
{
  const v = weightView([r("2026-09-24", 80), r(T, 79)], EMPTY_GOAL, T);
  check("7-day change on the trend: 80 → 79.48 (gap of 7: 1 − 0.9⁷ = 0.522) is −0.52", v.change7Kg === -0.52 && v.trendKg === 79.48, `${v.change7Kg} ${v.trendKg}`);
  check("logged a week ago, not today", weightView([r("2026-09-24", 80), r("2026-09-25", 79)], EMPTY_GOAL, T).loggedToday === false);
  check("a reading 6 days ago is recent: not stale", weightView([r("2026-09-24", 80), r("2026-09-25", 79)], EMPTY_GOAL, T).stale === false);
}
{
  // Short history: two readings two days apart are not a week's change.
  const v = weightView([r("2026-09-29", 75), r(T, 74)], EMPTY_GOAL, T);
  check("short history (first reading 2 days ago): no 7-day change", v.change7Kg === null && !v.stale, `${v.change7Kg}`);
  check("short history: a first reading exactly 7 days back is a week", weightView([r("2026-09-24", 75), r(T, 74)], EMPTY_GOAL, T).change7Kg !== null);
}
{
  // Stale: seven readings that ended 60 days ago. The trend since is only carried.
  const v = weightView(ramp(7, 80, -0.1, addDays(T, -60)), EMPTY_GOAL, T);
  check("stale (last weigh-in 60 days ago): no 7-day change, stale, latest is that day", v.change7Kg === null && v.stale && v.latest?.day === addDays(T, -60), `${v.change7Kg} ${v.stale}`);
  const edge = weightView([r(addDays(T, -20), 80), r(addDays(T, -7), 79)], EMPTY_GOAL, T);
  check("a last weigh-in exactly 7 days ago: stale, no 7-day change (none in the last 7 days)", edge.stale && edge.change7Kg === null);
  check("no readings: stale (nothing measured)", weightView([], EMPTY_GOAL, T).stale);
}
{
  const v = weightView(ramp(120, 120, -0.2), goal({ targetKg: 80, startKg: 110, startDay: "2026-08-01" }), T);
  check(
    "a fast ramp (−0.2/day): trend 98, −1.4 a week, progress 0.4, 12.9 weeks out",
    v.trendKg === 98 && v.change7Kg === -1.4 && same(v.rate, rate(-1.4)) && near(v.progress, 0.4) &&
      same(v.projection, { kind: "date", day: "2026-12-30", weeks: 12.9, onTrackForTargetDay: null }) && v.series.length === 90
  );
  const note = v.fastLossNote ?? "";
  check("losing faster than 1 kg a week: a note, in plain numbers", note === "The trend is down 1.4 kg a week, quicker than the 1.0 kg a week often suggested as a steady pace.", note);
  check("the note has no praise, blame or alarm", !/good|great|well done|bad|fail|danger|warning|must|should|!/i.test(note));
  const lb = weightView(ramp(120, 120, -0.2), goal({ unit: "lb" }), T).fastLossNote ?? "";
  check("the note speaks the user's unit", lb.includes("3.1 lb") && lb.includes("2.2 lb"), lb);
}
check("losing 0.7 a week: no note", weightView(ramp(120, 100, -0.1), EMPTY_GOAL, T).fastLossNote === null);
check("gaining fast: no loss note", weightView(ramp(120, 60, 0.3), EMPTY_GOAL, T).fastLossNote === null);
{
  const v = weightView([r("2026-09-20", 90), r("2026-09-25", 88)], goal({ targetKg: 80, startKg: null, startDay: "2026-09-21" }), T);
  check("a target set before any weigh-in starts from the first reading on or after its day", v.goal.startKg === 88 && v.progress !== null);
}

// ── The goal change ───────────────────────────────────────────────────────
console.log("— goal change");
{
  const readings = ramp(30, 85, -0.05);
  const stored = goal({ unit: "lb", targetKg: 70, targetDay: "2026-12-31", startKg: 84, startDay: "2026-09-01" });
  const G = (input: Parameters<typeof planGoalChange>[1], cur: WeightGoalView = stored) => planGoalChange(cur, input, readings, T);
  const drift = G({ unit: "lb", targetKg: roundKg(toKg(154.3, "lb")) });
  check(
    "70 kg shown as '154.3 lb' reads back as 69.99 kg: the same target, its start kept",
    roundKg(toKg(154.3, "lb")) === 69.99 && drift.ok && drift.value.targetKg === 70 && drift.value.startKg === 84 && drift.value.startDay === "2026-09-01",
    JSON.stringify(drift)
  );
  const kgRound = G({ targetKg: 70.3 }, goal({ targetKg: 70.25, startKg: 84, startDay: "2026-09-01" }));
  check("70.25 kg prefilled as '70.3': the same target, its start kept", kgRound.ok && kgRound.value.targetKg === 70.25 && kgRound.value.startKg === 84, JSON.stringify(kgRound));
  const dateOnly = G({ unit: "lb", targetDay: "2027-01-31" });
  check(
    "editing only the by-date keeps the target, startKg and startDay",
    dateOnly.ok && dateOnly.value.targetKg === 70 && dateOnly.value.startKg === 84 && dateOnly.value.startDay === "2026-09-01" && dateOnly.value.targetDay === "2027-01-31",
    JSON.stringify(dateOnly)
  );
  const real = G({ targetKg: 68 });
  const trendNow = weightView(readings, stored, T).trendKg;
  check("a real change (70 → 68) records today's trend as the new start", real.ok && real.value.targetKg === 68 && real.value.startKg === trendNow && real.value.startDay === T, JSON.stringify(real));
  const cleared = G({ targetKg: null });
  check("null clears the target, its day and its start", cleared.ok && same(cleared.value, { ...stored, targetKg: null, targetDay: null, startKg: null, startDay: null }));
  check("a by-date without a target is refused", !G({ targetDay: "2027-01-31" }, EMPTY_GOAL).ok);
  const fresh = G({ targetKg: 75 }, EMPTY_GOAL);
  check("a first target starts from today's trend", fresh.ok && fresh.value.startKg === trendNow && fresh.value.startDay === T);
}

// ── The write ─────────────────────────────────────────────────────────────
console.log("— write");
{
  const now = new Date("2026-10-01T00:00:00Z");
  const keep = logWriteData(72.4, now, "capture", undefined);
  check("a replace with no note given leaves the day's note alone (no 'note' in the update)", !("note" in keep.update) && keep.create.note === null && Number(keep.update.kg) === 72.4);
  const clear = logWriteData(72.4, now, "manual", null);
  check("note null clears it on a replace", "note" in clear.update && clear.update.note === null);
  const given = logWriteData(72.4, now, "manual", "  after run  ");
  check("a given note is cleaned and written on create and replace", given.update.note === "after run" && given.create.note === "after run");
}

// ── Units, rounding, the clamp, the days ──────────────────────────────────
console.log("— units and limits");
check("160 lb is 72.57 kg", roundKg(toKg(160, "lb")) === 72.57);
check("72.4 kg is 159.6 lb", formatWeight(72.4, "lb") === "159.6 lb" && formatWeight(72.4, "kg") === "72.4 kg");
check("kg → lb → kg round-trips", near(toKg(fromKg(81.23, "lb"), "lb"), 81.23, 1e-9));
check("kg is kg", toKg(72.4, "kg") === 72.4 && fromKg(72.4, "kg") === 72.4);
check("rounds to two decimals", roundKg(72.346) === 72.35 && roundKg(72.344) === 72.34);
check(
  "the clamp: 20..400 kg, finite, two decimals",
  clampKg(19.99) === null && clampKg(20) === 20 && clampKg(400) === 400 && clampKg(400.01) === null &&
    clampKg(724) === null && clampKg(NaN) === null && clampKg(Infinity) === null && clampKg(-72) === null && clampKg(72.456) === 72.46
);
check("units: kg and lb only", isWeightUnit("kg") && isWeightUnit("lb") && !isWeightUnit("st") && !isWeightUnit(undefined) && !isWeightUnit("KG"));
check("day keys: real dates only", isDayKey(T) && isDayKey("2028-02-29") && !isDayKey("2026-02-30") && !isDayKey("2026-10-1") && !isDayKey(20261001) && !isDayKey("2026-10-01T00:00"));
check(
  "a weigh-in day: today or up to 365 days back",
  logDayError(T, T) === null && logDayError(addDays(T, -365), T) === null && logDayError(addDays(T, -366), T) !== null &&
    logDayError(addDays(T, 1), T) !== null && logDayError("nope", T) !== null
);
check(
  "a target day: after today, within five years",
  targetDayError(T, T) !== null && targetDayError(addDays(T, 1), T) === null && targetDayError(addDays(T, 1825), T) === null &&
    targetDayError(addDays(T, 1826), T) !== null && targetDayError("2026-02-30", T) !== null
);
check(
  "notes: trimmed, capped, empty is null",
  cleanNote("  after run  ") === "after run" && cleanNote("   ") === null && cleanNote(5) === null && (cleanNote("x".repeat(500)) ?? "").length === MAX_NOTE_CHARS
);

// ── The life-day boundary ─────────────────────────────────────────────────
console.log("— life day");
{
  const four = zonedToInstant(2026, 10, 2, 4, "Australia/Sydney");
  const before = new Date(four.getTime() - 60_000);
  check("03:59 on 2 Oct belongs to 1 Oct; 04:00 to 2 Oct", dayKeyOf(before, "Australia/Sydney") === T && dayKeyOf(four, "Australia/Sydney") === "2026-10-02");
  const today = todayKey(before);
  check(
    "a 03:59 weigh-in counts for the day before: it is 'logged today' then, not after 04:00",
    weightView([r(today, 80)], EMPTY_GOAL, today).loggedToday && !weightView([r(today, 80)], EMPTY_GOAL, todayKey(four)).loggedToday
  );
  check("at 03:59 the next date is still the future", logDayError("2026-10-02", today) !== null && logDayError("2026-10-02", todayKey(four)) === null);
}

// ── The server's soft failure ─────────────────────────────────────────────
console.log("— server");
{
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6" });
  check(
    "a missing table is P2021 or Postgres 42P01, nothing else",
    isMissingTable(known("P2021")) && !isMissingTable(known("P2002")) &&
      isMissingTable(new Error('relation "public.BodyWeight" does not exist (42P01)')) && !isMissingTable(new Error("timeout"))
  );
  check("the empty goal is kg with no target", same(EMPTY_GOAL, { unit: "kg", targetKg: null, targetDay: null, startKg: null, startDay: null }));
}

// ── Source guards ─────────────────────────────────────────────────────────
console.log("— guards");
const server = read("src/lib/weight-server.ts");
const actionsPath = "src/app/actions/weight.ts";
const actions = existsSync(resolve(ROOT, actionsPath)) ? read(actionsPath) : "";
const fnBody = (src: string, name: string) => {
  const at = src.indexOf(`export async function ${name}(`);
  if (at < 0) return "";
  const next = src.indexOf("\nexport ", at + 1);
  return src.slice(at, next < 0 ? undefined : next);
};
check("the actions file is a server action module", actions.startsWith('"use server";'));
{
  const log = fnBody(actions, "logWeight");
  check(
    "logWeight: a finite number, the unit enum, kg clamped after converting, the day checked, the note cleaned",
    /isNumber\(input\.value\)/.test(log) && /isWeightUnit\(input\.unit\)/.test(log) && /clampKg\(toKg\(input\.value, unit\)\)/.test(log) &&
      /logDayError\(day, todayKey\(now\)\)/.test(log) && /cleanNote\(input\.note\)/.test(log) && /source: "manual"/.test(log)
  );
  const goalFn = fnBody(actions, "setWeightGoal");
  check(
    "setWeightGoal: the unit enum, the target a finite number clamped after converting, the target day after today",
    /isWeightUnit\(input\.unit\)/.test(goalFn) && /isNumber\(raw\)/.test(goalFn) && /clampKg\(toKg\(raw, unit\)\)/.test(goalFn) &&
      /targetDayError\(input\.targetDay, todayKey\(\)\)/.test(goalFn)
  );
  check("deleteWeight: a real day key", /isDayKey\(day\)/.test(fnBody(actions, "deleteWeight")));
  check("the actions refresh only when asked, like the task actions", /if \(res\.ok && opts\?\.refresh === true\) refresh\(\);/.test(actions));
}
check(
  "the cores clamp again: logWeightCore clamps kg and checks the day, setWeightGoalCore clamps the target and checks its day",
  /clampKg\(kg\)/.test(server) && /logDayError\(day, today\)/.test(server) && /clampKg\(input\.targetKg\)/.test(server) && /targetDayError\(input\.targetDay, today\)/.test(server)
);
check("logWeightCore writes logWriteData (a replace keeps the note unless one is given)", /logWriteData\(value, now, source, opts\.note\)/.test(server) && /update: data\.update/.test(server) && !/note = cleanNote\(opts\.note\)/.test(server));
check("setWeightGoalCore decides with planGoalChange (a target within 0.05 kg is not a change)", /planGoalChange\(current, /.test(fnBody(server, "setWeightGoalCore")) && !/target !== current\.targetKg/.test(server));
check(
  "reads are cached under 'weight' and every write invalidates it",
  (server.match(/cached\(`weight\w+:\$\{userId\}[^`]*`, \["weight"\]/g) ?? []).length === 2 &&
    (server.match(/invalidate\("weight"\)/g) ?? []).length >= 4
);
check("reads fail soft: both loaders catch and return the empty goal or view", /return EMPTY_GOAL;/.test(server) && /return weightView\(\[\], EMPTY_GOAL, today\);/.test(server));

const ECONOMY = [
  "life-economy",
  "life-tracks",
  "life-tracks-server",
  "activity",
  "mastery",
  "celebrations",
  "celebration-detect",
  "celebration-types",
  "xp",
  "streak",
  "today-board",
  "goals",
  "goals-server",
];
const IMPORTS_WEIGHT = /from\s+["'](?:\.\/|@\/lib\/|\.\.\/lib\/)weight(?:-server)?["']|import\(\s*["'](?:\.\/|@\/lib\/)weight(?:-server)?["']\s*\)/;
const economyHits = ECONOMY.filter((f) => existsSync(resolve(ROOT, `src/lib/${f}.ts`)) && IMPORTS_WEIGHT.test(read(`src/lib/${f}.ts`)));
check("no economy file imports weight (no XP, MP, streak or celebration from it)", economyHits.length === 0, economyHits.join(", "));
const ECON_IMPORT = new RegExp(`from\\s+["'](?:\\./|@/lib/)(?:${ECONOMY.join("|")})["']`);
check(
  "weight's own files import nothing from the economy",
  [read("src/lib/weight.ts"), server, actions].every((src) => !ECON_IMPORT.test(src) && !/recordActivity|celebrat|\bxp\b|\bmp\b/i.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
);

console.log(failed ? `\n${failed} failed` : "\nall pass");
process.exit(failed ? 1 : 0);
