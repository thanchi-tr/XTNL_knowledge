/**
 * Train › Exercise and task style (migration life_exercise_style): the walk rules (exercise.ts), the icon and colour
 * sets and the month helpers (task-style.ts), the cards rendered (ExerciseCard, MonthDoneCard, TaskMonth,
 * TaskStylePicker), the nav tab, the wiring on Today and You, and the migration (new tables only).
 *
 * Momentum lane B (docs/life-plan/momentum.md §A.6, §A.7, §A.8, §G.1): what a walk pays (the §A.6 goldens, split-
 * neutral, refusals, the pay window, the knee, crits and perks, the link top-up), personal bests, same-day reversals,
 * inert before launch; and a planWeeks fixture (walks keep BODY, Iron lungs 21, plan weeks after the tracks, the
 * pre-launch judge mints today's amounts). Launched behaviour is exercised by passing a launch day explicitly.
 *
 * Pure: no database, no clock, no model (the cards get fake loaders and actions).
 *
 *   npx tsx scripts/exercise-style-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  bodyQuestDoneBy,
  cleanWalkInput,
  durationLabel,
  exerciseWeekOf,
  linkCandidateOf,
  paceLabel,
  paidFactsOf,
  personalBestsOf,
  prEventInput,
  priceWalk,
  reversalInputOf,
  walkCountedEffortOf,
  walkDeleteLine,
  walkDeleteNote,
  walkEventInput,
  walkFactsOf,
  walkPayLine,
  walkReceiptOf,
  weekStartOf,
  type ExerciseSessionView,
  type WalkFactsPaid,
  type WalkPriceInput,
} from "../src/lib/exercise";
import { DEFAULT_LIFE_MODS, exerciseDayRaw, lifeModsOf, momentumLaunchDay, momentumLive, sessionRaw, walkPaysOn, walkRefusal, workoutRowKey, type Quest } from "../src/lib/momentum";
import { kneePay } from "../src/lib/life-grade";
import { addDays, weekKeyOf } from "../src/lib/life-day";
import { weekKeptMintKey, weekRowKey } from "../src/lib/life-economy";
import { planWeekKept, planWeeks, type WeekJudgeState, type WeekQuestWeek, type WeekTaskRow } from "../src/lib/life-weeks";
import { TRACKS, type Track } from "../src/lib/life-types";
import {
  DEFAULT_TASK_COLOR,
  DEFAULT_TASK_ICON,
  TASK_COLORS,
  TASK_COLOR_NAMES,
  TASK_ICONS,
  TASK_ICON_NAMES,
  isMonthKey,
  monthDaysOf,
  monthGridOf,
  monthLabelOf,
  shiftMonth,
  shownStyleOf,
  taskMonthMarksOf,
  taskStyleOf,
} from "../src/lib/task-style";
import { ExerciseCard, EXERCISE_NOT_READY_LINE, type ExerciseActions } from "../src/components/train/ExerciseCard";
import { MonthDoneCard } from "../src/components/task-style/MonthDoneCard";
import { TaskMonth } from "../src/components/task-style/TaskMonth";
import { TaskStylePicker } from "../src/components/task-style/TaskStylePicker";
import { SECTIONS, titleFor } from "../src/components/shell/nav";

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const TODAY = "2026-10-08"; // a Thursday

console.log("— walks (exercise.ts) —");
{
  const ok = cleanWalkInput({ angleDeg: "5", distanceKm: "3.456", durationMin: 45 }, TODAY);
  eq("a walk with no day is today's; the numbers rounded (distance 0.01 km, angle and minutes 0.1)", ok.ok ? ok.value : ok, { day: TODAY, angleDeg: 5, distanceKm: 3.46, durationMin: 45, note: null });
  const errs = [
    cleanWalkInput({ day: "2026-10-09", angleDeg: 0, distanceKm: 1, durationMin: 10 }, TODAY),
    cleanWalkInput({ day: "2025-10-01", angleDeg: 0, distanceKm: 1, durationMin: 10 }, TODAY),
    cleanWalkInput({ day: "2026-02-30x", angleDeg: 0, distanceKm: 1, durationMin: 10 }, TODAY),
    cleanWalkInput({ angleDeg: 46, distanceKm: 1, durationMin: 10 }, TODAY),
    cleanWalkInput({ angleDeg: -1, distanceKm: 1, durationMin: 10 }, TODAY),
    cleanWalkInput({ angleDeg: 0, distanceKm: 0, durationMin: 10 }, TODAY),
    cleanWalkInput({ angleDeg: 0, distanceKm: Number.NaN, durationMin: 10 }, TODAY),
    cleanWalkInput({ angleDeg: 0, distanceKm: 1, durationMin: 0.5 }, TODAY),
    cleanWalkInput({ angleDeg: 0, distanceKm: 1, durationMin: 2000 }, TODAY),
  ];
  check("refused, each in words: a future day, more than a year back, not a date, an angle outside 0–45°, a distance of 0 or not a number, a duration under 1 or over a day", errs.every((e) => !e.ok && e.error.length > 0), json(errs));
  check("the angle may be left out (flat)", (() => {
    const r = cleanWalkInput({ distanceKm: 2, durationMin: 20 }, TODAY);
    return r.ok && r.value.angleDeg === 0;
  })());
  eq("walkFactsOf: 3 km in 45 min at 5° is 4 km/h, 15 min a km, an 8.7 % treadmill grade and 261 m climbed", walkFactsOf({ angleDeg: 5, distanceKm: 3, durationMin: 45 }), { speedKmh: 4, paceMinPerKm: 15, gradePct: 8.7, climbM: 261 });
  eq("flat ground climbs nothing", walkFactsOf({ angleDeg: 0, distanceKm: 5, durationMin: 60 }).climbM, 0);
  eq("labels: pace 9:30 /km, durations under and over an hour", [paceLabel(9.5), paceLabel(9.999), durationLabel(45), durationLabel(65)], ["9:30 /km", "10:00 /km", "45 min", "1 h 05 min"]);
  eq("the week starts on Monday (a Thursday's and a Sunday's, and Monday's own)", [weekStartOf("2026-10-08"), weekStartOf("2026-10-11"), weekStartOf("2026-10-05")], ["2026-10-05", "2026-10-05", "2026-10-05"]);
  const s = (id: string, day: string, km: number, min: number, angle = 0): ExerciseSessionView => ({ id, kind: "WALK", day, angleDeg: angle, distanceKm: km, durationMin: min, note: null });
  const week = exerciseWeekOf([s("a", "2026-10-04", 9, 90), s("b", "2026-10-05", 3, 45, 5), s("c", "2026-10-08", 2.5, 30), s("d", "2026-10-12", 9, 90)], TODAY);
  eq("this week's totals count Monday to Sunday only (Sunday before and the Monday after are out)", week, { start: "2026-10-05", sessions: 2, distanceKm: 5.5, durationMin: 75, climbM: 261 });
}

console.log("— task style (task-style.ts) —");
{
  check(
    "55 icons (each one stroke path in the 24 grid) and 18 colours, every colour a distinct hex",
    TASK_ICON_NAMES.length === 55 &&
      TASK_COLOR_NAMES.length === 18 &&
      Object.values(TASK_COLORS).every((h) => /^#[0-9a-f]{6}$/.test(h)) &&
      new Set(Object.values(TASK_COLORS)).size === 18 &&
      Object.values(TASK_ICONS).every((d) => /^M[\d.\s,A-Za-z-]+$/.test(d) && new Set(Object.values(TASK_ICONS)).size === 55)
  );
  eq("taskStyleOf drops names outside the sets", [taskStyleOf({ icon: "walk", color: "teal" }), taskStyleOf({ icon: "rocket", color: "#fff" }), taskStyleOf(null)], [{ icon: "walk", color: "teal" }, { icon: null, color: null }, { icon: null, color: null }]);
  const d = shownStyleOf(null);
  check("no style draws the check in slate", d.icon === DEFAULT_TASK_ICON && d.color === DEFAULT_TASK_COLOR && d.hex === TASK_COLORS.slate);
  eq("months: shift across years, labels, day counts (a leap February)", [shiftMonth("2026-12", 1), shiftMonth("2026-01", -1), shiftMonth("2026-10", -14), monthLabelOf("2026-10"), monthDaysOf("2028-02").length, isMonthKey("2026-13"), isMonthKey("2026-10")], ["2027-01", "2025-12", "2025-08", "October 2026", 29, false, true]);
  const grid = monthGridOf("2026-10");
  check("October 2026 starts on a Thursday: 3 empty cells, 31 days, whole weeks of 7", grid[0].slice(0, 3).every((c) => c === null) && grid[0][3] === "2026-10-01" && grid.flat().filter(Boolean).length === 31 && grid.every((w) => w.length === 7));
  eq(
    "a task's month: done (any kind of done) beats missed on the same day; other months and statuses are left out",
    taskMonthMarksOf(
      [
        { day: "2026-10-01", status: "DONE" },
        { day: "2026-10-02", status: "MISSED" },
        { day: "2026-10-02", status: "MADE_UP" },
        { day: "2026-10-03", status: "MISSED" },
        { day: "2026-10-04", status: "DONE_MVV" },
        { day: "2026-10-05", status: "SKIPPED" },
        { day: "2026-09-30", status: "DONE" },
      ],
      "2026-10"
    ),
    { "2026-10-01": "done", "2026-10-02": "done", "2026-10-03": "missed", "2026-10-04": "done" }
  );
}

console.log("— the cards —");
{
  const actions: ExerciseActions = { logWalk: async () => ({ ok: false, error: "fixture" }), deleteExercise: async () => ({ ok: true, value: null }) };
  const sessions: ExerciseSessionView[] = [{ id: "w1", kind: "WALK", day: TODAY, angleDeg: 5, distanceKm: 3, durationMin: 45, note: null }];
  const view = { today: TODAY, sessions, week: exerciseWeekOf(sessions, TODAY), ready: true };
  const html = renderToStaticMarkup(createElement(ExerciseCard, { view, actions }));
  check(
    "ExerciseCard: the angle, distance, duration and day fields, the quick angles, this week's totals and the walk with its speed, pace and climb",
    ["Angle (°)", "Distance (km)", "Duration (min)", "Day", "Flat", "12°", "Log walk", "3 km", "45 min", "4 km/h", "15:00 /km", "climb 261 m", "Today"].every((w) => html.includes(w)) && !html.includes(EXERCISE_NOT_READY_LINE),
    html.slice(0, 400)
  );
  const notReady = renderToStaticMarkup(createElement(ExerciseCard, { view: { ...view, sessions: [], ready: false }, actions }));
  check("before the migration the card says saving needs the database update, and shows the empty history", notReady.includes(EXERCISE_NOT_READY_LINE.replace(/'/g, "&#x27;")) && notReady.includes("No walks yet"));

  const month = {
    month: "2026-10",
    days: {
      "2026-10-01": [
        { templateId: "t1", title: "Walk 30 min", icon: "walk" as const, color: "teal" as const },
        { templateId: "t2", title: "Read", icon: null, color: null },
      ],
      "2026-10-08": [{ templateId: "t1", title: "Walk 30 min", icon: "walk" as const, color: "teal" as const }],
    },
  };
  const md = renderToStaticMarkup(createElement(MonthDoneCard, { today: TODAY, initial: month, load: async () => ({ ok: true as const, value: month }) }));
  check(
    "MonthDoneCard: each day's done tasks as icons in their colours with the name on hover (title) and in the day's label; a task with no style is the slate check; the legend counts days",
    md.includes('title="Walk 30 min"') &&
      md.includes(`stroke="${TASK_COLORS.teal}"`) &&
      md.includes('data-icon="walk"') &&
      md.includes(`stroke="${TASK_COLORS.slate}"`) &&
      md.includes('aria-label="1: Walk 30 min, Read"') &&
      md.includes("× 2") &&
      md.includes("October 2026") &&
      md.includes("3 done") &&
      md.includes('aria-label="Next month" disabled=""'),
    md.slice(0, 600)
  );
  const tm = renderToStaticMarkup(createElement(TaskMonth, { templateId: "t1", title: "Walk", today: TODAY, style: { icon: "walk", color: "teal" }, load: async () => ({ ok: true as const, value: { month: "2026-10", marks: {} } }) }));
  check("TaskMonth: the month's grid (31 days), today ringed, the next month closed in the current one", (tm.match(/class="tsk-d"/g) ?? []).length === 31 && tm.includes("data-today") && tm.includes('aria-label="Next month" disabled=""') && tm.includes("October 2026"));
  const pk = renderToStaticMarkup(createElement(TaskStylePicker, { templateId: "t1", style: { icon: "walk", color: "teal" }, save: async () => ({ ok: true as const, value: { icon: null, color: null } }) }));
  check(
    "TaskStylePicker: two small buttons (Icon, Colour) that open their pop-ups, closed at first (no option rendered); [Default] while a style is set",
    (pk.match(/aria-haspopup="dialog"/g) ?? []).length === 2 && pk.includes(">Icon<") && pk.includes(">Colour<") && !pk.includes('aria-label="Icon: ') && pk.includes("Default") && pk.includes('aria-expanded="false"')
  );
}

console.log("— wiring —");
{
  const body = SECTIONS.find((s) => s.id === "body");
  check("nav: Body holds the Exercise tab (/train/exercise), titled Body · Exercise", !!body?.subs.some((s) => s.href === "/train/exercise" && s.label === "Exercise") && json(titleFor("/train/exercise")) === json({ eyebrow: "Body", title: "Exercise" }));
  const board = read("src/components/today/TodayBoard.tsx");
  const drawer = read("src/components/today/TaskDrawer.tsx");
  check("Today: each row and its drawer get the task's style; the drawer shows the month and the picker", (board.match(/taskStyle=\{current\.styles\?\.\[row\.template\.id\] \?\? null\}/g) ?? []).length === 2 && /<TaskMonth /.test(drawer) && /<TaskStylePicker /.test(drawer));
  check("the board reads the styles in its own wave, fail soft", /loadTaskStyles\(userId\)/.test(read("src/lib/tasks.ts")));
  check("You: the month's done tasks on Character, read against the page's own life day", /<MonthDoneCard today=\{today\}/.test(read("src/app/you/page.tsx")) && /const today = todayKey\(now\);/.test(read("src/app/you/page.tsx")));
  const sql = read("prisma/migrations/20261201000000_life_exercise_style/migration.sql").replace(/--.*$/gm, "");
  check("the migration only creates the two tables and their indexes (no ALTER, DROP or foreign key)", /CREATE TABLE "public"\."ExerciseSession"/.test(sql) && /CREATE TABLE "public"\."TaskStyle"/.test(sql) && !/\b(ALTER|DROP|REFERENCES)\b/i.test(sql));
}

console.log("— momentum: what a walk pays (§A.6) —");
{
  const walk = (distanceKm: number, durationMin: number, angleDeg = 0) => ({ distanceKm, durationMin, angleDeg });
  const price = (w: ReturnType<typeof walk>, o: Partial<WalkPriceInput> = {}) =>
    priceWalk({ walk: w, wBefore: 0, rawBefore: 0, mods: DEFAULT_LIFE_MODS, peak: false, critU: null, tickedRaw: null, ...o });
  const g = [price(walk(3.75, 45)), price(walk(3, 30, 5)), price(walk(2, 30))];
  eq(
    "pay goldens (§A.6): 45 min 3.75 km flat 16.6 moderate, 30 min 3 km at 5° 20.1 vigorous, 30 min 2 km flat 6.8 light; on a fresh day each pays its raw",
    g.map((p) => [p?.raw, p?.intensity, p?.xp]),
    [
      [16.6, "MODERATE", 16.6],
      [20.1, "VIGOROUS", 20.1],
      [6.8, "LIGHT", 6.8],
    ]
  );
  const a = price(walk(1.25, 15))!;
  const b = price(walk(2.5, 30), { wBefore: a.w, rawBefore: a.raw })!;
  check(
    "split-neutral: one curve per day, so 15 + 30 min at 5 km/h pay the 45-min walk's 16.6 (raw and XP); the curve is additive before rounding",
    Math.round((a.raw + b.raw) * 10) / 10 === 16.6 &&
      Math.abs(a.xp + b.xp - g[0]!.xp) < 0.05 &&
      Math.abs(sessionRaw(0, 15) + sessionRaw(15, 30) - exerciseDayRaw(45)) < 1e-9,
    `${a.raw} + ${b.raw}`
  );
  check(
    "> 9 km/h pays nothing (12 km in 60 min is refused: 'Recorded · faster than a walk'); a walk under 5 minutes pays nothing either",
    price(walk(12, 60)) === null &&
      walkRefusal(walk(12, 60)) === "TOO_FAST" &&
      walkPayLine({ kind: "REFUSED", reason: "TOO_FAST" }) === "Recorded · faster than a walk" &&
      price(walk(0.3, 4)) === null &&
      walkRefusal(walk(0.3, 4)) === "TOO_SHORT"
  );
  check(
    "> 1 day back pays nothing: today and yesterday pay; the day before is a record ('Logged · walks pay only today or yesterday')",
    walkPaysOn(TODAY, TODAY) && walkPaysOn(addDays(TODAY, -1), TODAY) && !walkPaysOn(addDays(TODAY, -2), TODAY) && walkPayLine({ kind: "OLD" }) === "Logged · walks pay only today or yesterday"
  );
  const kneed = price(walk(3.75, 45), { rawBefore: 95 })!;
  check("through the daily knee: on a day already at 95 raw the walk's 16.6 pays kneePay(95, 16.6)", kneed.raw === 16.6 && Math.abs(kneed.xp - kneePay(95, 16.6)) < 0.001 && kneed.xp < 16.6, String(kneed.xp));
  const spark = lifeModsOf(new Set(["V_SPARK"]));
  check(
    "Body spark: a sealed roll under 8 % doubles the walk (33.2), over it pays 16.6; without the perk the roll is ignored",
    price(walk(3.75, 45), { mods: spark, critU: 0.05 })?.raw === 33.2 && price(walk(3.75, 45), { mods: spark, critU: 0.5 })?.raw === 16.6 && price(walk(3.75, 45), { critU: 0.01 })?.raw === 16.6
  );
  check(
    "Stride ×1.05 always, Peak ×1.2 only on a day the BODY quest is done",
    price(walk(3.75, 45), { mods: lifeModsOf(new Set(["V_STRIDE"])) })?.raw === 17.4 &&
      price(walk(3.75, 45), { mods: lifeModsOf(new Set(["V_PEAK"])), peak: true })?.raw === 19.9 &&
      price(walk(3.75, 45), { mods: lifeModsOf(new Set(["V_PEAK"])), peak: false })?.raw === 16.6
  );
  const move20: Quest = { slot: "BODY", kind: "MOVE", minutes: 20, title: "Move 20 min" };
  const habit: Quest = { slot: "BODY", kind: "TEMPLATE", templateId: "t-walk", title: "Walk" };
  const facts = { walkMinutes: 15, linkedTemplateId: null, earlierWalkMinutes: [] as number[], instances: [] };
  check(
    "the BODY quest (Peak): Move 20 is done by this walk or an earlier one of 20 min; a habit quest by its tick or the walk counted as it; no set, no Peak",
    !bodyQuestDoneBy(move20, facts) &&
      bodyQuestDoneBy(move20, { ...facts, walkMinutes: 20 }) &&
      bodyQuestDoneBy(move20, { ...facts, earlierWalkMinutes: [25] }) &&
      bodyQuestDoneBy(habit, { ...facts, linkedTemplateId: "t-walk" }) &&
      bodyQuestDoneBy(habit, { ...facts, instances: [{ templateId: "t-walk", status: "DONE", minutes: 30, exercise: true }] }) &&
      !bodyQuestDoneBy(null, { ...facts, walkMinutes: 90 })
  );

  const p = g[0]!;
  const receipt = walkReceiptOf(p, paidFactsOf({ day: TODAY, distanceKm: 3.75, durationMin: 45, angleDeg: 0 }), "s1", { stride: 1, topUp: null });
  const row = walkEventInput("s1", TODAY, receipt, new Date("2026-10-08T08:00:00Z"));
  check(
    "the WORKOUT row: sink TRACK, track BODY, rawXp = raw (inside the knee), B 10 for a moderate walk, its minutes, 'workout:<sessionId>', counts for the streak from 10 minutes",
    row.source === "WORKOUT" &&
      row.sink === "TRACK" &&
      row.track === "BODY" &&
      row.rawXp === 16.6 &&
      row.xp === 16.6 &&
      row.dedupeKey === workoutRowKey("s1") &&
      row.countsForStreak === true &&
      receipt.factors.length === 1 &&
      receipt.factors[0].key === "B" &&
      receipt.factors[0].value === 10 &&
      receipt.minutes === 45 &&
      walkCountedEffortOf(receipt) === 45 &&
      walkEventInput("s2", TODAY, walkReceiptOf(price(walk(0.7, 8))!, paidFactsOf({ day: TODAY, distanceKm: 0.7, durationMin: 8, angleDeg: 0 }), "s2", { stride: 1, topUp: null }), new Date()).countsForStreak === false,
    JSON.stringify(row).slice(0, 300)
  );

  // "One payment for one walk": a habit already ticked today is topped up.
  const top = price(walk(3.75, 45), { tickedRaw: 11.4 })!;
  const topReceipt = walkReceiptOf(top, paidFactsOf({ day: TODAY, distanceKm: 3.75, durationMin: 45, angleDeg: 0 }), "s3", {
    stride: 1,
    topUp: { templateId: "t-walk", title: "Walk", tickedRaw: 11.4, tickedAt: "07:12", tickedEffort: 30 },
  });
  check(
    "link top-up: raw = max(0, 16.6 − the tick's 11.4) = 5.2 ('tops up Walk (ticked 07:12, 11.4)'); a tick worth more pays 0; BODY's week counts the walk's minutes once (45 − the tick's 30)",
    top.raw === 5.2 &&
      top.xp === 5.2 &&
      price(walk(3.75, 45), { tickedRaw: 20 })?.raw === 0 &&
      walkCountedEffortOf(topReceipt) === 15 &&
      walkPayLine({ kind: "PAID", xp: 5.2, raw: 5.2, intensity: "MODERATE", effortMinutes: 45, crit: false, prs: 0, topUp: { title: "Walk", tickedAt: "07:12", tickedRaw: 11.4 }, linkError: null }) ===
        "Paid +5.2 XP · moderate · 45 effort min · tops up Walk (ticked 07:12, 11.4)"
  );
  eq(
    "the pay line (§E.4): 'Paid +16.6 XP · moderate · 45 effort min', a crit named",
    [
      walkPayLine({ kind: "PAID", xp: 16.6, raw: 16.6, intensity: "MODERATE", effortMinutes: 45, crit: false, prs: 0, topUp: null, linkError: null }),
      walkPayLine({ kind: "PAID", xp: 33.2, raw: 33.2, intensity: "MODERATE", effortMinutes: 45, crit: true, prs: 1, topUp: null, linkError: null }),
    ],
    ["Paid +16.6 XP · moderate · 45 effort min", "Paid +33.2 XP · moderate · 45 effort min · Body spark ×2"]
  );

  // A same-day delete takes the pay back (reversalSourceOf); a later one keeps it.
  const now = new Date("2026-10-08T09:00:00Z");
  const base = { sink: "TRACK", track: "BODY" as Track, day: TODAY, sourceId: "s1" };
  const undoWalk = reversalInputOf({ ...base, id: "e1", source: "WORKOUT", xp: 16.6, rawXp: 16.6, countsForStreak: true }, now);
  const undoShort = reversalInputOf({ ...base, id: "e2", source: "WORKOUT", xp: 4.1, rawXp: 4.1, countsForStreak: false }, now);
  const undoPr = reversalInputOf({ ...base, id: "e3", source: "PR", xp: 15, rawXp: null, countsForStreak: false }, now);
  check(
    "same-day delete reverses: a walk that counted gets an UNDO (−xp, −raw, 'undo:<id>'); a walk under 10 minutes and a PR are negated in their own source, counting for nothing",
    undoWalk.source === "UNDO" &&
      undoWalk.xp === -16.6 &&
      undoWalk.rawXp === -16.6 &&
      undoWalk.dedupeKey === "undo:e1" &&
      undoWalk.day === TODAY &&
      undoShort.source === "WORKOUT" &&
      undoShort.rawXp === -4.1 &&
      undoShort.countsForStreak === false &&
      undoPr.source === "PR" &&
      undoPr.xp === -15 &&
      undoPr.rawXp === null &&
      undoPr.qty === null &&
      undoPr.dedupeKey === "undo:e3"
  );
  eq(
    "the delete's words: taken back the same day, kept later ('Paid Tue · the XP stays')",
    [walkDeleteLine({ kind: "REVERSED", xp: 31.6 }), walkDeleteLine({ kind: "KEPT", xp: 16.6, day: "2026-10-06" }), walkDeleteLine(null), walkDeleteNote({ xp: 16.6, day: "2026-10-06", reversible: false })],
    ["Walk deleted · 31.6 XP taken back", "Walk deleted · Paid Tue · the XP stays", "Walk deleted.", "Paid Tue · the XP stays"]
  );

  const srv = read("src/lib/exercise-server.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(
    "the server: the pay is the knee's (lifeLockOp, the freshness guard, then the WORKOUT row and its PR rows in one array); OLD, then a refusal, then the link, then the pay",
    /lifeLockOp\(userId\),\s*\.\.\.\(needsSettledGuard\(day, today, now\) \? \[settledDayGuardOp\(userId, day\)\] : \[\]\),\s*freshnessGuardOp\(userId, day, kneeRows, null, \{ notFrozen: day < today \}\),\s*activityOp\(userId, walkEventInput\(s\.id, day, receipt, now\)\),\s*\.\.\.pbs\.map/.test(srv) &&
      /if \(!walkPaysOn\(s\.day, today\)\) return \{ kind: "OLD" \};\s*const refusal = walkRefusal\(s\);\s*if \(refusal\) return \{ kind: "REFUSED", reason: refusal \};/.test(srv) &&
      /momentumRoll\(excritKey\(userId, day, dayWalks\.length \+ 1\)\)/.test(srv) &&
      /completeLinkedCore\(\{ userId, templateId, day: s\.day, workoutId: s\.id, minutes: Math\.round\(s\.durationMin\), at: now \}\)/.test(srv)
  );
  check(
    "the server: a delete on the life day it was logged writes the reversals and deletes in one transaction; a later delete keeps the pay",
    /if \(dayKeyOf\(session\.createdAt\) !== today\) return kept\(\);/.test(srv) && /\.\.\.live\.map\(\(r\) =>\s*activityOp\(\s*userId,\s*reversalInputOf\(/.test(srv) && /prisma\.exerciseSession\.deleteMany\(\{ where: \{ id, userId \} \}\),\s*\];/.test(srv)
  );
  check(
    "inert before launch (or with no launch day, an explicit null): a walk is the record alone, no moments are taken, a delete is the record's, the view is the record's",
    !momentumLive(TODAY, null) &&
      !momentumLive("2099-12-31", null) &&
      !momentumLive(TODAY, "2026-10-12") &&
      /if \(!momentumLive\(session\.day\)\) return \{ ok: true, value: session \};/.test(srv) &&
      /if \(!momentumLive\(day\)\) return logWalkCore\(userId, raw, now, opts\);/.test(srv) &&
      /if \(momentumLaunchDay\(\) == null\) return deleteRecord\(userId, id\);/.test(srv) &&
      /if \(!opts\.momentum \|\| !momentumLive\(today\) \|\| !view\.ready\) return view;/.test(srv)
  );
  const prodLaunch = momentumLaunchDay({ NODE_ENV: "production" });
  check(
    "launched: production's launch day is 2026-10-12, so a walk on or after it pays (and one before it, like TODAY's 8 October, is the record alone)",
    prodLaunch === "2026-10-12" && momentumLive("2026-10-12", prodLaunch) && momentumLive("2026-10-20", prodLaunch) && !momentumLive("2026-10-11", prodLaunch) && !momentumLive(TODAY, prodLaunch),
    String(prodLaunch)
  );
}

console.log("— momentum: personal bests (§A.7) —");
{
  const f = (day: string, distanceKm: number, durationMin: number, angleDeg = 0): WalkFactsPaid => paidFactsOf({ day, distanceKm, durationMin, angleDeg });
  const prior = [f("2026-09-28", 5, 60), f("2026-09-30", 6, 70), f("2026-10-01", 7.9, 90)];
  const none = new Set<never>();
  check("no PB before 3 earlier paid walks", personalBestsOf(prior.slice(0, 2), f(TODAY, 9, 100), none).length === 0);
  const pbs = personalBestsOf(prior, f(TODAY, 8.4, 95), none);
  eq(
    "a PB beats its best by ≥ 3 %: 8.4 km over 7.9 (+6.3 %) and 95 min over 90 (+5.6 %), biggest first, at most 2 a session",
    pbs.map((p) => [p.metric, p.detail]),
    [
      ["DISTANCE", "distance 8.4 km (was 7.9)"],
      ["DURATION", "duration 1 h 35 min (was 1 h 30 min)"],
    ]
  );
  check("under 3 % is no PB (8.1 km over 7.9 is +2.5 %)", !personalBestsOf(prior, f(TODAY, 8.1, 60), none).some((p) => p.metric === "DISTANCE"));
  check("once per metric per life week: a metric with a PR row this week is left out", !personalBestsOf(prior, f(TODAY, 8.4, 95), new Set(["DISTANCE"] as const)).some((p) => p.metric === "DISTANCE"));
  const pace = personalBestsOf(prior, f(TODAY, 4, 40), none).find((p) => p.metric === "PACE");
  check("pace on a walk of ≥ 2 km, lower by ≥ 0.15 min/km (10:00 /km against 11:24)", pace?.value === 10 && pace.detail === "pace 10:00 /km (was 11:24 /km)", JSON.stringify(pace));
  const pr = prEventInput(pbs[0], "s9", TODAY, 15, new Date());
  check(
    "a PR row: sink TRACK, track BODY, +15 XP outside the knee (rawXp null), qty = the value, 'pr:WALK:<metric>:<week>', never a streak unit",
    pr.source === "PR" && pr.sink === "TRACK" && pr.track === "BODY" && pr.xp === 15 && pr.rawXp === null && pr.qty === 8.4 && pr.dedupeKey === `pr:WALK:DISTANCE:${weekKeyOf(TODAY)}` && pr.countsForStreak === false
  );
}

console.log("— momentum: 'Counts as' and the card —");
{
  const tpl = (id: string, recurrence: string | null, o: Partial<Parameters<typeof linkCandidateOf>[0][number]> = {}) => ({
    id,
    title: id,
    recurrence,
    startDay: "2026-09-01",
    dueDay: null,
    planDay: null,
    completed: false,
    compulsory: false,
    sortOrder: 0,
    ...o,
  });
  check(
    "'Counts as': a personal exercise habit due today and not done (a must first); one already done today, or a target already met, is not offered",
    linkCandidateOf([tpl("Walk", "DAILY"), tpl("Run", "DAILY", { compulsory: true })], [], TODAY)?.templateId === "Run" &&
      linkCandidateOf([tpl("Walk", "DAILY")], [{ templateId: "Walk", day: TODAY, status: "DONE" }], TODAY) === null &&
      linkCandidateOf([tpl("Walk", "TARGET:2/W")], [{ templateId: "Walk", day: "2026-10-05", status: "DONE" }, { templateId: "Walk", day: "2026-10-06", status: "DONE" }], TODAY) === null &&
      linkCandidateOf([tpl("Hike", null, { dueDay: TODAY })], [], TODAY)?.templateId === "Hike"
  );
  const actions: ExerciseActions = { logWalk: async () => ({ ok: false, error: "fixture" }), deleteExercise: async () => ({ ok: true, value: null }) };
  const sessions: ExerciseSessionView[] = [{ id: "w1", kind: "WALK", day: TODAY, angleDeg: 0, distanceKm: 3.75, durationMin: 45, note: null }];
  const view = { today: TODAY, sessions, week: exerciseWeekOf(sessions, TODAY), ready: true };
  const before = renderToStaticMarkup(createElement(ExerciseCard, { view: { ...view, link: { templateId: "t1", title: "Walk 30 min" }, paid: { w1: { xp: 16.6, day: TODAY, reversible: true } } }, actions }));
  const live = renderToStaticMarkup(createElement(ExerciseCard, { view: { ...view, live: true, link: { templateId: "t1", title: "Walk 30 min" }, paid: { w1: { xp: 16.6, day: TODAY, reversible: true } } }, actions }));
  check("before launch the card is the record: no 'Counts as', no XP", !before.includes("Counts as") && !/\bXP\b/.test(before));
  check(
    "on a live day: 'Counts as: Walk 30 min' pre-selected, and the paid walk shows +16.6 XP",
    live.includes("Counts as: Walk 30 min") && /aria-pressed="true"[^>]*>Counts as: <!-- -->Walk 30 min|aria-pressed="true"[^>]*>Counts as: Walk 30 min/.test(live) && live.includes("+16.6 XP"),
    live.slice(live.indexOf("Counts as") - 120, live.indexOf("Counts as") + 60)
  );
}

console.log("— the week judge: walks, Iron lungs, plan weeks (planWeeks) —");
{
  const MON = "2026-10-12";
  const SUN = addDays(MON, 6);
  const WK = weekKeyOf(MON);
  let n = 0;
  const walkRow = (day: string, durationMin: number, distanceKm: number): WeekTaskRow => {
    const id = `w${++n}`;
    const p = priceWalk({ walk: { distanceKm, durationMin, angleDeg: 0 }, wBefore: 0, rawBefore: 0, mods: DEFAULT_LIFE_MODS, peak: false, critU: null, tickedRaw: null })!;
    const receipt = walkReceiptOf(p, paidFactsOf({ day, distanceKm, durationMin, angleDeg: 0 }), `s-${id}`, { stride: 1, topUp: null });
    return { id, source: "WORKOUT", dedupeKey: workoutRowKey(`s-${id}`), day, track: "BODY", templateId: null, rawXp: receipt.raw, receipt, category: "EXERCISE" };
  };
  const taskRow = (track: Track, d: number): WeekTaskRow => ({
    id: `t${++n}`,
    source: "TASK",
    dedupeKey: null,
    day: addDays(MON, d),
    track,
    templateId: null,
    rawXp: 12,
    receipt: { v: "life-1", factors: [{ key: "B", label: "band", value: 10 }], minutes: 30, raw: 12, kneeBefore: 0, xp: 12, track },
    category: "OTHER",
  });
  const walks = [walkRow(MON, 50, 4.2), walkRow(addDays(MON, 2), 50, 4.2), walkRow(addDays(MON, 4), 50, 4.2)];
  const others = (["DUTY", "CRAFT", "CARE"] as const).flatMap((t) => [0, 1, 2, 3, 4].map((d) => taskRow(t, d)));
  const state = (o: Partial<WeekJudgeState> = {}): WeekJudgeState => ({
    today: addDays(SUN, 3),
    launchDay: "2026-10-01",
    epochDay: MON,
    judged: new Set<string>(),
    rows: [...walks, ...others],
    templates: [],
    instances: [],
    mints: [],
    heldDays: new Set(),
    ...o,
  });
  const body = (s: WeekJudgeState) => planWeeks(s)[0]?.tracks.find((t) => t.track === "BODY");
  check("WORKOUT rows keep BODY: three 50-minute walks are 3 days, 53.7 raw XP and 150 effort min", body(state())?.kept === true && body(state())?.detail === "Kept · 3 days · 53.7 raw XP · 150 effort min", body(state())?.detail);
  const undone: WeekTaskRow = { id: "u1", source: "UNDO", dedupeKey: `undo:${walks[2].id}`, day: walks[2].day, track: "BODY", templateId: null, rawXp: -walks[2].rawXp, receipt: null, category: null };
  check("a walk taken back (its UNDO) no longer counts: 2 days, BODY not kept", body(state({ rows: [...walks, ...others, undone] }))?.kept === false);

  const kept = (s: WeekJudgeState) => planWeeks(s)[0]?.mints.filter((m) => m.reason === "LIFE_WEEK_KEPT").map((m) => [m.track, m.delta]);
  eq("pre-launch the judge mints today's amounts: 1.5 a kept track, no plan week (perks and quest weeks present)", kept(state({ perks: new Set(["V_IRON"]) })), TRACKS.map((t) => [t, 1.5]));
  const qw = (id: string, roadmapId: string, seat: number | null, done: number, total = 3): WeekQuestWeek => ({ id, roadmapId, seat, track: "CRAFT", title: `Goal ${roadmapId}`, weekStart: MON, total, done });
  const quests = [qw("q2", "r2", 2, 3), qw("q1", "r1", 1, 3), qw("q1b", "r1", 1, 3), qw("q4", "r4", 3, 2)];
  const pre = planWeeks(state({ perks: new Set(["V_IRON", "P_RATIONS"]), questWeeks: quests }))[0];
  check("… and writes no PLAN_WEEK row before launch", !pre.planWeekRows && !pre.mints.some((m) => m.reason === "LIFE_PLAN_WEEK"));
  check("… nor with a launch day after the week's Sunday", kept(state({ momentumLaunchDay: addDays(SUN, 1), perks: new Set(["V_IRON"]) }))?.every((m) => m[1] === 1.5) === true);

  const live = { momentumLaunchDay: MON } as const;
  eq("launched: 18 a kept track, BODY 21 with Iron lungs", kept(state({ ...live, perks: new Set(["V_IRON"]) })), [["BODY", 21], ["DUTY", 18], ["CRAFT", 18], ["CARE", 18]]);
  const shorts = [0, 1].map((d) => ({ day: addDays(MON, d), qty: 1, reason: "GOAL_SHORT", key: `mp:GOAL:s${d}` }));
  const plan = planWeeks(state({ ...live, perks: new Set(["V_IRON", "P_RATIONS", "P_SURVEY"]), mints: shorts, questWeeks: quests }))[0];
  const order = plan.mints.map((m) => `${m.reason}:${m.track}:${m.delta}`);
  const lastTrack = plan.mints.map((m) => m.reason).lastIndexOf("LIFE_WEEK_KEPT");
  check(
    "plan weeks mint after every kept track, by seat, one per roadmap a week (r1's second and a 2-of-3 week pay nothing): 2 + 21 + 3 × 18 + 12 = 89, the second roadmap's trimmed to 2, no track trimmed",
    JSON.stringify(order) ===
      JSON.stringify(["LIFE_WEEK_KEPT:BODY:21", "LIFE_WEEK_KEPT:DUTY:18", "LIFE_WEEK_KEPT:CRAFT:18", "LIFE_WEEK_KEPT:CARE:18", "LIFE_PLAN_WEEK:CRAFT:12", "LIFE_PLAN_WEEK:CRAFT:2"]) &&
      plan.mints.findIndex((m) => m.reason === "LIFE_PLAN_WEEK") > lastTrack &&
      plan.mints.find((m) => m.reason === "LIFE_PLAN_WEEK")?.dedupeKey === "mp:LIFE_PLAN_WEEK:q1" &&
      JSON.stringify(plan.planWeekRows?.map((r) => [r.questWeekId, r.xp, r.detail])) ===
        JSON.stringify([
          ["q1", 37.5, "Plan week kept · Goal r1 · 3 of 3 quests"],
          ["q2", 37.5, "Plan week kept · Goal r2 · 3 of 3 quests"],
        ]),
    JSON.stringify(order)
  );
  const dutyJudged = planWeeks(state({ ...live, judged: new Set([weekRowKey("DUTY", WK)]), questWeeks: quests }))[0];
  check(
    "plan weeks wait for the run that writes DUTY: with DUTY judged already, a run writing the other tracks plans none",
    !!dutyJudged && !dutyJudged.planWeekRows && !dutyJudged.mints.some((m) => m.reason === "LIFE_PLAN_WEEK") && dutyJudged.mints.some((m) => m.dedupeKey === weekKeptMintKey("BODY", WK))
  );
  const paidAlready = planWeeks(state({ ...live, questWeeks: quests, mints: [{ day: SUN, qty: 10, reason: "LIFE_PLAN_WEEK", key: "mp:LIFE_PLAN_WEEK:q1" }] }))[0];
  check("a roadmap whose plan week paid this week pays no other", !paidAlready.planWeekRows?.some((r) => r.roadmapId === "r1"));
  check(
    "a plan week is kept with ≥ 2 quests, all done; Forward camp keeps one at ≥ 80 %",
    planWeekKept({ total: 3, done: 3 }) && !planWeekKept({ total: 5, done: 4 }) && planWeekKept({ total: 5, done: 4 }, 0.8) && !planWeekKept({ total: 1, done: 1 }) && !planWeekKept({ total: 0, done: 0 })
  );
  const srv = read("src/lib/life-weeks-server.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(
    "the judge's read takes WORKOUT rows (category EXERCISE), the momentum launch day, and the perks and quest weeks only for a live week",
    /e\."source" IN \('TASK', 'UNDO', 'WORKOUT'\)/.test(srv) &&
      /category: r\.source === "WORKOUT" \? "EXERCISE"/.test(srv) &&
      /momentumLaunchDay: mLaunch,/.test(srv) &&
      /const liveWeeks = weeks\.filter\(\(w\) => momentumLive\(w\.sunday, mLaunch\)\);/.test(srv) &&
      /if \(write && momentumLive\(today\)\) \{/.test(srv) &&
      /source: "PLAN_WEEK",[\s\S]*?dedupeKey: planWeekRowKey\(p\.questWeekId\),/.test(srv)
  );
}

console.log("");
if (failed > 0) {
  console.log(`exercise-style-check: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`exercise-style-check: ${passed} passed, 0 failed`);
