/**
 * Throughput on fixed rows (docs/life-plan/roadmap.md F3 Tests, lane R2):
 * the week rule (a 4-day epoch week pro-rated, a mostly held week skipped,
 * calibrating 3 of 4 then measured), UNDO netting and the study-linked
 * exclusion (taskRowsOf, the step the server shares), the median and p25 of
 * an even count, clearance with no DAY_OPEN row, adherence over STANDARD+
 * templates of ≥ 20 min only, the Gemini-sized share, the pass share at 29
 * and 30 reviews, and the pace-source order a card scope reads. Revision 4:
 * the absence persistence ρ over the 90-day clearance series (absences, off
 * days, unobserved days, the series' start, calibrating below 28 days) and
 * its hand-off to the reach model.
 *
 * Pure: no database, no clock, no model. scripts/_no-model.ts is imported
 * first, like every check that imports a roadmap module.
 *
 *   npx tsx scripts/throughput-check.ts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, weekStartKeyOf, weekdayOf, type DayKey } from "../src/lib/life-day";
import type { Category, Track } from "../src/lib/life-types";
import * as RT from "../src/lib/roadmap-types";
import {
  absencePersistenceOf,
  clearanceSeriesStart,
  countsForAdherence,
  scopePaceOf,
  taskRowsOf,
  throughputOf,
  throughputWindowStart,
  trackedEstimate,
  weeklyFigureOf,
  type ThroughputLedgerRow,
  type ThroughputRows,
  type ThroughputTaskRow,
  type ThroughputTemplate,
} from "../src/lib/throughput";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);
const near = (name: string, got: number | null | undefined, want: number, tol = 1e-9) =>
  check(name, got != null && Math.abs(got - want) <= tol, `got ${got}, want ${want}`);

// finalDay is a Sunday, so the 8 window weeks are whole: Mondays W0 (oldest) … W7.
const FINAL: DayKey = "2026-11-29";
const TODAY = addDays(FINAL, RT.THROUGHPUT_LAG_DAYS);
const W = (k: number): DayKey => addDays(weekStartKeyOf(FINAL), -7 * (7 - k));
const day = (k: number, i: number): DayKey => addDays(W(k), i);

function rows(over: Partial<ThroughputRows> = {}): ThroughputRows {
  return {
    today: TODAY,
    finalDay: FINAL,
    epochDay: null,
    settledThroughDay: null,
    heldDays: [],
    tasks: [],
    recurring: [],
    reviews: [],
    dayOpens: [],
    newCards: [],
    ...over,
  };
}
function task(d: DayKey, minutes: number, o: Partial<ThroughputTaskRow> = {}): ThroughputTaskRow {
  return { day: d, minutes, track: "CRAFT" as Track, category: "STUDY" as Category, intrinsic: false, sizedByModel: false, ...o };
}
/** One task of `minutes` on every day of week k. */
const everyDay = (k: number, minutes: number): ThroughputTaskRow[] => Array.from({ length: 7 }, (_, i) => task(day(k, i), minutes));

console.log("— the window —");
{
  check("finalDay is a Sunday; the window starts 7 weeks before its Monday", weekdayOf(FINAL) === 7 && throughputWindowStart(FINAL) === W(0));
  check("finalDay = today − THROUGHPUT_LAG_DAYS (2)", addDays(TODAY, -2) === FINAL);
}

console.log("— weekly figures —");
{
  const fig = weeklyFigureOf([40, 10, 30, 20]);
  check("median and p25 of an even count: [10, 20, 30, 40] → median 25 (mean of the middle two), p25 17.5", fig.kind === "measured" && fig.median === 25 && fig.p25 === 17.5 && fig.weeks === 4, json(fig));
  eq("3 weeks: calibrating 3 of 4", weeklyFigureOf([1, 2, 3]), { kind: "calibrating", have: 3, need: 4 });
  const odd = weeklyFigureOf([5, 1, 9, 3, 7]);
  check("odd count: median is the middle week (5), p25 the 2nd (3)", odd.kind === "measured" && odd.median === 5 && odd.p25 === 3, json(odd));
}

console.log("— the week rule —");
{
  // 8 full weeks of 10 min a day = 70 a week.
  const full = throughputOf(rows({ tasks: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => everyDay(k, 10)) }));
  check("8 full weeks of 10 min a day: median 70, 8 weeks", full.trackedMinutes.kind === "measured" && full.trackedMinutes.median === 70 && full.trackedMinutes.weeks === 8, json(full.trackedMinutes));

  // The epoch on W4's Thursday: W4 has 4 eligible days (Thu–Sun) and is pro-rated × 7 ÷ 4.
  const epoch = day(4, 3);
  const t = throughputOf(rows({ epochDay: epoch, tasks: [...[3, 4, 5, 6].map((i) => task(day(4, i), 10)), ...[5, 6, 7].flatMap((k) => everyDay(k, 20))] }));
  check(
    "a 4-day epoch week counts, pro-rated: 4 × 10 min → 70 a week, beside three weeks of 140 (median 140, p25 122.5)",
    t.trackedMinutes.kind === "measured" && t.trackedMinutes.weeks === 4 && t.trackedMinutes.median === 140 && t.trackedMinutes.p25 === 122.5,
    json(t.trackedMinutes)
  );
  // The epoch on W4's Friday: W4 has 3 eligible days and does not count → 3 of 4.
  const three = throughputOf(rows({ epochDay: day(4, 4), tasks: [5, 6, 7].flatMap((k) => everyDay(k, 20)) }));
  eq("calibrating 3 of 4 while only three weeks count", three.trackedMinutes, { kind: "calibrating", have: 3, need: 4 });
  const four = throughputOf(rows({ epochDay: W(4), tasks: [5, 6, 7].flatMap((k) => everyDay(k, 20)) }));
  check("measured from the 4th counted week (an empty week counts as 0)", four.trackedMinutes.kind === "measured" && four.trackedMinutes.weeks === 4, json(four.trackedMinutes));

  // 5 held days in W6: 2 eligible days, so W6 is skipped; 4 held days in W5: 3 eligible, also skipped; 3 held in W7: 4 eligible, counted and pro-rated.
  const held = [0, 1, 2, 3, 4].map((i) => day(6, i));
  const h = throughputOf(rows({ epochDay: W(4), heldDays: held, tasks: [4, 5, 6, 7].flatMap((k) => everyDay(k, 10)) }));
  eq("a week with ≥ 5 held days is skipped (3 of 4)", h.trackedMinutes, { kind: "calibrating", have: 3, need: 4 });
  const h2 = throughputOf(rows({ epochDay: W(4), heldDays: [0, 1, 2].map((i) => day(7, i)), tasks: [4, 5, 6, 7].flatMap((k) => everyDay(k, 10)) }));
  check(
    "a week with 3 held days counts on its 4 open days, pro-rated (70, the same as a full week)",
    h2.trackedMinutes.kind === "measured" && h2.trackedMinutes.weeks === 4 && h2.trackedMinutes.median === 70 && h2.trackedMinutes.p25 === 70,
    json(h2.trackedMinutes)
  );
  const after = throughputOf(rows({ finalDay: day(7, 2), today: addDays(day(7, 2), 2), tasks: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => everyDay(k, 10)) }));
  check("days after finalDay never count (finalDay a Wednesday: its week has 3 days and is skipped)", after.trackedMinutes.kind === "measured" && after.trackedMinutes.weeks === 7, json(after.trackedMinutes));
}

console.log("— receipts: UNDO, study rows, play, tracks, the Gemini share —");
{
  const base: Omit<ThroughputLedgerRow, "id" | "source" | "dedupeKey" | "day"> = {
    track: "CRAFT",
    minutes: 30,
    autoMetric: null,
    intrinsic: false,
    category: "WORK",
    minutesSource: "USER",
    reportedMinutes: null,
  };
  const ledger: ThroughputLedgerRow[] = [
    { ...base, id: "t1", source: "TASK", dedupeKey: "task:a:1", day: day(7, 0) },
    { ...base, id: "t2", source: "TASK", dedupeKey: "task:a:2", day: day(7, 0) },
    { ...base, id: "u1", source: "UNDO", dedupeKey: "undo:t2", day: day(7, 0), minutes: null },
    { ...base, id: "t3", source: "TASK", dedupeKey: "task:r:1", day: day(7, 1), autoMetric: "REVIEWS" },
    { ...base, id: "t4", source: "TASK", dedupeKey: "task:i:1", day: day(7, 1), autoMetric: "IDEAS" },
    { ...base, id: "t5", source: "TASK", dedupeKey: "task:d:1", day: day(7, 1), autoMetric: "REVIEW_DUE" },
    { ...base, id: "t6", source: "TASK", dedupeKey: "task:s:1", day: day(7, 1), autoMetric: "STEPS" },
    { ...base, id: "t7", source: "TASK", dedupeKey: "task:p:1", day: day(7, 2), intrinsic: true, track: "BODY", category: "EXERCISE" },
    { ...base, id: "t8", source: "TASK", dedupeKey: "task:g:1", day: day(7, 2), minutesSource: "AI" },
    { ...base, id: "t9", source: "TASK", dedupeKey: "task:g:2", day: day(7, 3), minutesSource: "AI", reportedMinutes: 25 },
    { ...base, id: "t10", source: "TASK", dedupeKey: null, day: day(7, 3), minutes: null },
    { ...base, id: "t11", source: "TASK", dedupeKey: null, day: day(7, 3), track: null },
  ];
  const tasks = taskRowsOf(ledger);
  const ids = tasks.map((t) => `${t.day}:${t.minutes}:${t.track}:${t.sizedByModel ? "ai" : "-"}`);
  check("an UNDO nets its TASK row out (t2), and the UNDO itself counts nothing", tasks.length === 5, json(ids));
  check("study-linked auto rows (REVIEWS, IDEAS, REVIEW_DUE) are left out; a STEPS auto task counts", tasks.filter((t) => t.day === day(7, 1)).length === 1);
  check("a row with no receipt minutes (t10) or no track (t11) is left out; t9 stays", tasks.filter((t) => t.day === day(7, 3)).length === 1);
  check("sized by Gemini: minutesSource AI with nothing reported (t8 yes; t9 reported 25 min, so no)", tasks.filter((t) => t.sizedByModel).length === 1);
  check("#play stays in, labelled intrinsic", tasks.some((t) => t.intrinsic && t.track === "BODY"));

  const four = [4, 5, 6].flatMap((k) => everyDay(k, 0));
  const t = throughputOf(
    rows({
      epochDay: W(4),
      tasks: [
        ...four,
        task(day(7, 0), 40, { sizedByModel: true }),
        task(day(7, 1), 60),
        task(day(7, 2), 20, { intrinsic: true, track: "BODY", category: "EXERCISE" }),
      ],
    })
  );
  near("the Gemini-sized share: 40 of 120 minutes", t.geminiShare, 40 / 120);
  check("play minutes are a figure of their own (median 0 over 4 weeks, the last week 20)", t.playMinutes.kind === "measured" && t.playMinutes.weeks === 4);
  check("by track: CRAFT and BODY figures exist, CARE does not", t.trackedByTrack.CRAFT != null && t.trackedByTrack.BODY != null && t.trackedByTrack.CARE == null);
  check("by category: STUDY and EXERCISE figures exist", t.trackedByCategory.STUDY != null && t.trackedByCategory.EXERCISE != null);
  const noMinutes = throughputOf(rows({ epochDay: W(4) }));
  check("the Gemini share is null with no minutes", noMinutes.geminiShare === null);
  check(
    "trackedEstimate brands the median ESTIMATED; null while calibrating",
    trackedEstimate(t) === (t.trackedMinutes.kind === "measured" ? t.trackedMinutes.median : -1) && trackedEstimate(throughputOf(rows({ epochDay: W(5) }))) === null
  );
  check("completions: 1 a day on 3 days of the last week counted, plus the zero rows of the other weeks", t.completions.kind === "measured");
}

console.log("— adherence —");
{
  const daily = (id: string, band: string, estMinutes: number, kept: number[], startDay = W(4)): ThroughputTemplate => ({
    id,
    rule: "DAILY",
    startDay,
    band,
    estMinutes,
    instances: kept.map((k) => ({ day: addDays(startDay, k), status: "DONE" })),
  });
  // W4..W7 = 28 days, finalDay W7's Sunday; record window days near today are not in range (finalDay = today − 2).
  const keptHalf = Array.from({ length: 28 }, (_, i) => i).filter((i) => i % 2 === 0);
  const std = daily("std", "STANDARD", 30, keptHalf);
  const intro = daily("intro", "INTRO", 30, []);
  const short = daily("short", "STANDARD", 10, []);
  check("countsForAdherence: STANDARD 30 min yes; INTRO no; a 10-minute task no; DEMANDING 20 min yes", countsForAdherence(std) && !countsForAdherence(intro) && !countsForAdherence(short) && countsForAdherence({ band: "DEMANDING", estMinutes: 20 }));
  const a = throughputOf(rows({ recurring: [std, intro, short] }));
  check("adherence ignores an INTRO habit and a 10-minute task: 14 of 28", a.adherence.kind === "measured" && a.adherence.n === 28 && Math.abs(a.adherence.value - 0.5) < 1e-9, json(a.adherence));
  const held = throughputOf(rows({ recurring: [std], heldDays: [addDays(W(4), 1), addDays(W(4), 3)] }));
  check("a held day with nothing recorded is held, not missed (26 judged)", held.adherence.kind === "measured" && held.adherence.n === 26, json(held.adherence));
  const few = throughputOf(rows({ recurring: [daily("new", "STANDARD", 30, [0, 1, 2], addDays(FINAL, -6))] }));
  eq("calibrating below 8 judged occurrences (7 days: 3 kept, 4 missed)", few.adherence, { kind: "calibrating", have: 7, need: 8 });
  const target: ThroughputTemplate = {
    id: "tgt",
    rule: "TARGET:3/W",
    startDay: W(4),
    band: "STANDARD",
    estMinutes: 45,
    instances: [0, 2, 4, 7, 9, 14, 21, 22, 23, 24].map((i) => ({ day: addDays(W(4), i), status: "DONE" })),
  };
  const tg = throughputOf(rows({ recurring: [target] }));
  check("a TARGET:3/W judges whole periods: 3 + 2 + 1 + 3 kept, 0 + 1 + 2 + 0 short → 9 of 12", tg.adherence.kind === "measured" && tg.adherence.n === 12 && Math.abs(tg.adherence.value - 0.75) < 1e-9, json(tg.adherence));
  const cursor = throughputOf(rows({ recurring: [std], settledThroughDay: addDays(W(6), 6) }));
  check(
    "an empty day after the settlement cursor reads pending, never missed: W7's 4 empty days drop out, its 3 kept days stay (14 of 24)",
    cursor.adherence.kind === "measured" && cursor.adherence.n === 24 && Math.abs(cursor.adherence.value - 14 / 24) < 1e-9,
    json(cursor.adherence)
  );
}

console.log("— reviews, pass share, clearance —");
{
  const reviews = (n: number) => Array.from({ length: n }, (_, i) => ({ day: addDays(FINAL, -(i % 20)), attempts: 1, passes: i % 5 === 0 ? 0 : 1 }));
  eq("p is calibrating at 29 reviews", throughputOf(rows({ reviews: reviews(29) })).passShare, { kind: "calibrating", have: 29, need: 30 });
  const p30 = throughputOf(rows({ reviews: reviews(30) })).passShare;
  check("measured at 30: 24 passes of 30 = 0.8", p30.kind === "measured" && p30.n === 30 && Math.abs(p30.value - 0.8) < 1e-9, json(p30));
  const old = throughputOf(rows({ reviews: [{ day: addDays(FINAL, -28), attempts: 50, passes: 50 }] })).passShare;
  eq("reviews older than 28 days don't count", old, { kind: "calibrating", have: 0, need: 30 });
  const before = throughputOf(rows({ finalDay: "2026-08-20", today: "2026-08-22", reviews: [{ day: "2026-08-05", attempts: 40, passes: 40 }, { day: "2026-08-15", attempts: 10, passes: 9 }] })).passShare;
  eq("passes count only since REVIEW_PASSES_SINCE (2026-08-12)", before, { kind: "calibrating", have: 10, need: 30 });

  eq("clearance with no DAY_OPEN row reads calibrating", throughputOf(rows()).clearance, { kind: "calibrating", have: 0, need: 1 });
  const c = throughputOf(rows({ dayOpens: [{ day: FINAL, open: 10, reviews: 7 }, { day: addDays(FINAL, -1), open: 10, reviews: 15 }, { day: addDays(FINAL, -20), open: 50, reviews: 0 }] })).clearance;
  check("clearance = Σ min(reviews, open) ÷ Σ open over 14 days: (7 + 10) ÷ 20", c.kind === "measured" && Math.abs(c.value - 0.85) < 1e-9 && c.n === 2, json(c));

  const rpd = throughputOf(rows({ epochDay: W(4), reviews: [4, 5, 6, 7].flatMap((k) => Array.from({ length: 7 }, (_, i) => ({ day: day(k, i), attempts: k * 2, passes: k }))) })).reviewsPerDay;
  check("reviews a day: the median week's daily attempts (weeks of 8, 10, 12, 14 a day → 11)", rpd.kind === "measured" && rpd.median === 11, json(rpd));
  const active = throughputOf(rows({ epochDay: W(4), tasks: [task(day(7, 0), 10)], reviews: [{ day: day(7, 1), attempts: 3, passes: 3 }] })).activeDays;
  check("active days: a day with a completion or a review attempt (W7: 2; the other weeks 0)", active.kind === "measured" && active.weeks === 4, json(active));
}

console.log("— new cards and the pace source —");
{
  // Field f1: Domains a and b. a gets 2 cards a week for 6 weeks; b gets 1 card in one week; f2's c gets 3 a week.
  const cards: { day: DayKey; fieldId: string; domainId: string }[] = [];
  for (let k = 2; k <= 7; k++) for (let i = 0; i < 2; i++) cards.push({ day: day(k, i), fieldId: "f1", domainId: "a" });
  cards.push({ day: day(7, 3), fieldId: "f1", domainId: "b" });
  for (let k = 0; k <= 7; k++) for (let i = 0; i < 3; i++) cards.push({ day: day(k, i), fieldId: "f2", domainId: "c" });
  const r = rows({ newCards: cards });
  const t = throughputOf(r);
  check("new cards by Domain: a measured, median 2", t.newCards.byDomain.a?.kind === "measured" && t.newCards.byDomain.a.median === 2, json(t.newCards.byDomain.a));
  check("new cards by Field: f2 median 3 over 8 weeks", t.newCards.byField.f2?.kind === "measured" && t.newCards.byField.f2.median === 3 && t.newCards.byField.f2.weeks === 8);
  const scope = scopePaceOf(r, ["a", "b"], "f1", 5);
  check("pace 1 — SCOPE: the scope's own weekly sums (a + b), median 2", scope.rateSource === "SCOPE" && scope.rate === 2, json(scope));
  const field = scopePaceOf(r, ["b"], "f1", 5);
  check("pace 2 — FIELD: b alone has a median of 0, so the Area Field's median (2) is used", field.rateSource === "FIELD" && field.rate === 2, json(field));
  const yours = scopePaceOf(r, ["z"], "f9", 5);
  check("pace 3 — YOURS: no measured scope or Field pace, the typed rate", yours.rateSource === "YOURS" && yours.rate === 5 && yours.figure === null);
  const none = scopePaceOf(r, ["z"], null, null);
  check("pace 4 — NONE: nothing measured and nothing typed", none.rateSource === "NONE" && none.rate === null);
  const zero = scopePaceOf(r, ["z"], null, 0);
  check("a typed 0 is the user's rate (YOURS 0), not 'none'", zero.rateSource === "YOURS" && zero.rate === 0);
  const pre = rows({ finalDay: "2026-08-30", today: "2026-09-01", newCards: Array.from({ length: 40 }, (_, i) => ({ day: addDays("2026-07-06", i), fieldId: "f1", domainId: "a" })) });
  const early = throughputOf(pre).newCards.byDomain.a;
  check("new-card weeks start at NEW_CARDS_SINCE (2026-07-28): only the weeks from then count", early?.kind === "measured" && early.weeks === 5, json(early));
}

console.log("— absence persistence ρ (revision 4, F-R4-8) —");
{
  // The series: the last CLEARANCE_SERIES_DAYS (90) life days up to finalDay, from the first DAY_OPEN row in it.
  const start = clearanceSeriesStart(FINAL);
  check("ρ's series starts 89 days before finalDay (90 life days)", start === addDays(FINAL, -89) && RT.CLEARANCE_SERIES_DAYS === 90);
  const on = (dd: DayKey) => ({ day: dd, open: 10, reviews: 10 });
  const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => addDays(start, from + i));
  eq("no DAY_OPEN row: calibrating 0 of 28 (the reach model then uses RHO_PRIOR, labelled)", absencePersistenceOf(rows()), { kind: "calibrating", have: 0, need: RT.RHO_MIN_DAYS });
  eq("27 observed days: still calibrating, 27 of 28", absencePersistenceOf(rows({ dayOpens: span(63, 89).map(on) })), { kind: "calibrating", have: 27, need: 28 });
  const allOn = absencePersistenceOf(rows({ dayOpens: span(0, 89).map(on) }));
  eq("90 days all on: measured, no off day to bunch → ρ 0 (the independent-days value, 1 − on-share)", allOn, { kind: "measured", value: 0, n: 90 });
  // An absence: 60 days on, 10 days with no DAY_OPEN row and no review (off), 20 on. off→off 9 of off→any 10 → 0.9.
  const absent = rows({ dayOpens: [...span(0, 59), ...span(70, 89)].map(on) });
  const a = absencePersistenceOf(absent);
  check("a 10-day absence (no DAY_OPEN, no review) reads as off days that bunch: ρ = 9 ÷ 10 = 0.9 over 90 observed days", a.kind === "measured" && Math.abs(a.value - 0.9) < 1e-12 && a.n === 90, json(a));
  // Scattered single misses (2 on, 1 off by clearing under half), no bunching: ρ = 0.
  const scattered = span(0, 89).map((dd, i) => (i % 3 === 2 ? { day: dd, open: 10, reviews: 4 } : on(dd)));
  const s1 = absencePersistenceOf(rows({ dayOpens: scattered }));
  check("a day clearing under half its queue (4 of 10) is off; single scattered misses → ρ 0", s1.kind === "measured" && s1.value === 0 && s1.n === 90, json(s1));
  const half = absencePersistenceOf(rows({ dayOpens: span(0, 89).map((dd, i) => (i % 3 === 2 ? { day: dd, open: 10, reviews: 5 } : on(dd))) }));
  check("clearing exactly half (5 of 10) is on (an off day clears under OFF_DAY_CLEAR_SHARE)", half.kind === "measured" && half.value === 0 && RT.OFF_DAY_CLEAR_SHARE === 0.5);
  // The series starts at the first DAY_OPEN row: 40 days before it are never read as an absence.
  const late = absencePersistenceOf(rows({ dayOpens: span(40, 89).map(on) }));
  eq("days before the first DAY_OPEN row in the window are not counted (50 observed, all on)", late, { kind: "measured", value: 0, n: 50 });
  // A day with reviews but no DAY_OPEN row (its queue is unknown) and a held day are not observed: they break the pairs.
  const gaps = rows({
    dayOpens: span(0, 89)
      .filter((_, i) => i !== 30 && i !== 31 && i !== 50)
      .map(on),
    reviews: [{ day: addDays(start, 31), attempts: 5, passes: 4 }],
    heldDays: [addDays(start, 50)],
  });
  const g = absencePersistenceOf(gaps);
  // Day 30: no row, no review → off; day 31: reviews but no row → not observed (so day 30's pair is broken); day 50: held.
  check("an off day followed by an unobserved day (reviews, no DAY_OPEN) forms no pair; a held day isn't observed: 88 observed, ρ = 1 − 87/88", g.kind === "measured" && g.n === 88 && Math.abs(g.value - (1 - 87 / 88)) < 1e-12, json(g));
  const nothingOpen = absencePersistenceOf(rows({ dayOpens: span(0, 89).map((dd, i) => (i < 40 ? { day: dd, open: 0, reviews: 0 } : on(dd))) }));
  eq("a day with nothing open isn't observed (a DAY_OPEN row with open 0)", nothingOpen, { kind: "measured", value: 0, n: 50 });
  const epoch = absencePersistenceOf(rows({ epochDay: addDays(start, 70), dayOpens: span(0, 89).map(on) }));
  eq("the life epoch cuts the series (20 days: calibrating)", epoch, { kind: "calibrating", have: 20, need: 28 });
  const t = throughputOf(absent);
  check("throughputOf carries it as absencePersistence", t.absencePersistence?.kind === "measured" && Math.abs((t.absencePersistence?.kind === "measured" ? t.absencePersistence.value : 0) - 0.9) < 1e-12);
  const inputs = RT.reachInputsOf(t, 1);
  check("the reach model reads it: ρ 0.9 measured, not the prior, and 'rho' not calibrating", inputs.params.rho === 0.9 && !inputs.calibrating.includes("rho"), json(inputs));
  const cal = RT.reachInputsOf(throughputOf(rows()), 1);
  check("with no series the reach model uses RHO_PRIOR 0.6 and records 'rho'", cal.params.rho === RT.RHO_PRIOR && cal.calibrating.includes("rho"));
  const server = readFileSync(join(process.cwd(), "src/lib/throughput-server.ts"), "utf8");
  check(
    "throughput-server reads DAY_OPEN, review attempts and held days from the start of ρ's series (clearanceSeriesStart)",
    /clearanceSeriesStart\(finalDay\)/.test(server) && /day: \{ gte: dateColumn\(openFrom\)/.test(server) && /e\."day" >= \$\{readFrom\}::date/.test(server) && /heldDaysOf\(rest, readFrom, finalDay\)/.test(server)
  );
  // The other figures read their own windows, so reading 90 days of rows leaves them as they were.
  const wide = rows({ dayOpens: [{ day: addDays(FINAL, -40), open: 50, reviews: 0 }, { day: FINAL, open: 10, reviews: 7 }], reviews: [{ day: addDays(FINAL, -60), attempts: 99, passes: 0 }] });
  const tw = throughputOf(wide);
  check("rows older than clearance's 14 days and the pass share's 28 change neither", tw.clearance.kind === "measured" && Math.abs(tw.clearance.value - 0.7) < 1e-12 && tw.passShare.kind === "calibrating" && tw.passShare.have === 0, json([tw.clearance, tw.passShare]));
}

if (failed > 0) {
  console.log(`\nthroughput-check: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
console.log(`\nthroughput-check: ${passed} passed, 0 failed`);
