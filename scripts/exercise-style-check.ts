/**
 * Train › Exercise and task style (migration life_exercise_style): the walk rules (exercise.ts), the icon and colour
 * sets and the month helpers (task-style.ts), the cards rendered (ExerciseCard, MonthDoneCard, TaskMonth,
 * TaskStylePicker), the nav tab, the wiring on Today and You, and the migration (new tables only).
 *
 * Pure: no database, no clock, no model (the cards get fake loaders and actions).
 *
 *   npx tsx scripts/exercise-style-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanWalkInput, durationLabel, exerciseWeekOf, paceLabel, walkFactsOf, weekStartOf, type ExerciseSessionView } from "../src/lib/exercise";
import {
  DEFAULT_TASK_COLOR,
  DEFAULT_TASK_ICON,
  TASK_COLORS,
  TASK_COLOR_NAMES,
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
  check("20 icons and 10 colours, every colour a hex", TASK_ICON_NAMES.length === 20 && TASK_COLOR_NAMES.length === 10 && Object.values(TASK_COLORS).every((h) => /^#[0-9a-f]{6}$/.test(h)));
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
    "TaskStylePicker: 20 icon radios and 10 colour radios, each named; the task's own checked; [Default] while a style is set",
    (pk.match(/aria-label="Icon: /g) ?? []).length === 20 && (pk.match(/aria-label="Colour: /g) ?? []).length === 10 && /aria-checked="true"[^>]*aria-label="Icon: walk"/.test(pk) && /aria-checked="true"[^>]*aria-label="Colour: teal"/.test(pk) && pk.includes("Default")
  );
}

console.log("— wiring —");
{
  const train = SECTIONS.find((s) => s.id === "train");
  check("nav: Train holds the Exercise tab (/train/exercise), titled Train · Exercise", !!train?.subs.some((s) => s.href === "/train/exercise" && s.label === "Exercise") && json(titleFor("/train/exercise")) === json({ eyebrow: "Train", title: "Exercise" }));
  const board = read("src/components/today/TodayBoard.tsx");
  const drawer = read("src/components/today/TaskDrawer.tsx");
  check("Today: each row and its drawer get the task's style; the drawer shows the month and the picker", (board.match(/taskStyle=\{current\.styles\?\.\[row\.template\.id\] \?\? null\}/g) ?? []).length === 2 && /<TaskMonth /.test(drawer) && /<TaskStylePicker /.test(drawer));
  check("the board reads the styles in its own wave, fail soft", /loadTaskStyles\(userId\)/.test(read("src/lib/tasks.ts")));
  check("You: the month's done tasks under the life tracks", /<MonthDoneCard today=\{aimToday\}/.test(read("src/app/you/page.tsx")));
  const sql = read("prisma/migrations/20261201000000_life_exercise_style/migration.sql").replace(/--.*$/gm, "");
  check("the migration only creates the two tables and their indexes (no ALTER, DROP or foreign key)", /CREATE TABLE "public"\."ExerciseSession"/.test(sql) && /CREATE TABLE "public"\."TaskStyle"/.test(sql) && !/\b(ALTER|DROP|REFERENCES)\b/i.test(sql));
}

console.log("");
if (failed > 0) {
  console.log(`exercise-style-check: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`exercise-style-check: ${passed} passed, 0 failed`);
