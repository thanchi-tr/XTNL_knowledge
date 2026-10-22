/**
 * Tasks › Habits (2026-10-15; /today/habits): each personal habit's year as a grid of days in its own hue. Pins:
 *
 *   1. the day states (src/lib/habit-history.ts) from instances and the rule: every day, a weekday set, TARGET n/W
 *      (a met, a short, a held, an open and an unjudged period), AFTER, rest / freeze / skip / excused days held
 *      (and a must kept 'Even on rest days' held by freezes only, through the board's own boardStreakOptionsOf), the
 *      minimum version, the settlement cursor, before the habit began, after it ended, and the future;
 *   2. the maths: the % (done + minimum over due, held in neither; a TARGET's units; decision D15: the minimum counts
 *      1, said "n at minimum" beside the %), the best run, the current
 *      streak equal to habit.ts perDutyStreak (the board's number), this week n of target, the page's summary;
 *   3. the colour: a stable hue by creation order, the 8 hues in tokens.css for Night and Vellum, each done square
 *      ≥ 3:1 on the card, never the Must orange, and the shades habits.css derives from it;
 *   4. the route (page, loading, metadata, no <main>, read-only, one cached wave under 'life' and 'activity'), the
 *      nav (Board · work tabs · + · Weekly review · Habits · Rules), the entry points (the Habits lane's "Year", the
 *      drawer's "Track record ›" and the hash ring);
 *   5. 344 px: the year's computed width against the card, and the scroll inside the card when it is wider;
 *   6. the grid's keyboard semantics (a roving tabindex, the arrow keys, Home/End) and its names, rendered.
 *
 * Pure: no database, no clock, no model.
 *
 *   npx tsx scripts/habit-history-check.ts
 */
import "./_no-model";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HABIT_HUES,
  HUE_NAMES,
  dayDetailOf,
  dayStateWord,
  habitCardOf,
  habitYearOf,
  hueOrderOf,
  moveInGrid,
  readFromOf,
  ruleWords,
  yearGridOf,
  yearOfParam,
  type HabitCardContext,
  type HabitInstanceFacts,
  type HabitTemplateFacts,
  type HabitYearCard,
} from "../src/lib/habit-history";
import { perDutyStreak } from "../src/lib/habit";
import { parseRule } from "../src/lib/recurrence";
import { boardStreakOptionsOf } from "../src/lib/today-board";
import { addDays, type DayKey } from "../src/lib/life-day";
import { SECTIONS, activeSub, addWorkTabAfter, sectionById, sectionOf, subsOf, titleFor } from "../src/components/shell/nav";
import { contrast, deltaE, parseColor } from "../src/app/dev/style/color-lab";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
function eq(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  check(name, a === b, a === b ? "" : `got ${a}, want ${b}`);
}
const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n");
/** Source without comments, so a pin never matches a sentence about the code. */
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// ── Fixtures ───────────────────────────────────────────────────────────────
const TODAY = "2026-10-15"; // a Thursday
const YEAR = 2026;
const SINCE = readFromOf(YEAR, TODAY);
const tpl = (id: string, recurrence: string, startDay: DayKey, p: Partial<HabitTemplateFacts> = {}): HabitTemplateFacts => ({
  id,
  title: id,
  recurrence,
  startDay,
  createdAt: `${startDay}T00:00:00.000Z`,
  sortOrder: 0,
  archivedDay: null,
  mvv: null,
  icon: null,
  ...p,
});
const inst = (templateId: string, day: DayKey, status: string, p: Partial<HabitInstanceFacts> = {}): HabitInstanceFacts => ({ templateId, day, status, completedAt: `${day}T07:12:00.000Z`, xpPaid: 0, ...p });
const ctxOf = (p: Partial<HabitCardContext> = {}): HabitCardContext => ({ year: YEAR, today: TODAY, since: SINCE, hue: 1, opts: {}, restKinds: new Map(), freezeDays: new Set(), tz: "UTC", ...p });
const card = (t: HabitTemplateFacts, insts: HabitInstanceFacts[], p: Partial<HabitCardContext> = {}): HabitYearCard => {
  const c = habitCardOf(t, insts, ctxOf(p));
  if (!c) throw new Error(`no card for ${t.id}`);
  return c;
};
/** The codes of a card's days from `from` to `to`, as one string. */
const codesOf = (c: HabitYearCard, from: DayKey, to: DayKey): string => {
  const i = Math.round((Date.parse(from) - Date.parse(`${YEAR}-01-01`)) / 86_400_000);
  const j = Math.round((Date.parse(to) - Date.parse(`${YEAR}-01-01`)) / 86_400_000);
  return c.days.slice(i, j + 1);
};

// ── 1 and 2. Day states and the maths ──────────────────────────────────────
function states() {
  console.log("— day states and the maths (habit-history.ts) —");

  // Every day, 1 Oct (Thu) on: each status once.
  const water = tpl("water", "DAILY", "2026-10-01", { mvv: "one glass" });
  const waterI = [
    inst("water", "2026-10-01", "DONE", { xpPaid: 8.3 }),
    inst("water", "2026-10-02", "DONE_LATE", { repaired: true }),
    inst("water", "2026-10-03", "DONE_MVV", { xpPaid: 2.1 }),
    inst("water", "2026-10-04", "SKIPPED"),
    inst("water", "2026-10-05", "EXCUSED"),
    inst("water", "2026-10-06", "MISSED"),
    inst("water", "2026-10-07", "MADE_UP"),
    // 8 Oct: nothing, a week ago: missed.
    inst("water", "2026-10-09", "DONE"),
    inst("water", "2026-10-09", "DONE", { completedAt: "2026-10-09T19:00:00.000Z" }),
    inst("water", "2026-10-10", "UNDONE"),
    inst("water", "2026-10-11", "DONE"),
    inst("water", "2026-10-12", "DONE"),
    inst("water", "2026-10-13", "DONE"),
    // 14 Oct (yesterday) and 15 Oct (today): nothing yet.
  ];
  const w = card(water, waterI);
  eq("every day: the codes 30 Sep → 16 Oct (before · kept · late kept · minimum · skipped · excused · MISSED · MADE_UP · nothing · Again · UNDONE · kept ×3 · yesterday · today · future)", codesOf(w, "2026-09-30", "2026-10-16"), "bddmhhxxxdxdddoof");
  eq("every day: 365 codes, one a day", [w.days.length, /^[dmhxonbfz]+$/.test(w.days)], [365, true]);
  eq("every day: notes say the time, the pay, a make-up, Again, why held, a made-up debt", [w.notes["2026-10-01"], w.notes["2026-10-02"], w.notes["2026-10-04"], w.notes["2026-10-05"], w.notes["2026-10-07"], w.notes["2026-10-09"]], [
    { at: "07:12", xp: 8.3 },
    { at: "07:12", late: true },
    { held: "skipped" },
    { held: "excused" },
    { madeUp: true },
    { at: "07:12", times: 2 },
  ]);
  eq("every day: counts (6 kept, 1 minimum, 2 held, 4 missed)", w.counts, { done: 6, minimum: 1, held: 2, missed: 4 });
  eq("%: (6 + 1 minimum, which counts 1: D15) / (6 + 1 + 4) due, held in neither → 64%; '1 at minimum' beside it", [w.credit, w.due, w.percent, w.atMinimum], [7, 11, 64, "1 at minimum"]);
  const wHistory = waterI.map((i) => ({ day: i.day, status: i.status, repaired: i.repaired }));
  eq("streak: current is habit.ts perDutyStreak (the board's number): 3; best run of the year 3", [w.current, perDutyStreak(parseRule("DAILY"), water.startDay, TODAY, wHistory).kept, w.best], [3, 3, 3]);
  eq("this week (Mon 12 → Sun 18): 2 of 7 so far", w.period, { label: "this week", kept: 2, target: 7 });
  eq("footer and rule words", [w.foot, w.rule], ["Current 3 · best 3 · this week 2 of 7", "every day"]);
  check("summary: the card in words for screen readers", /^water, every day, 2026: 64% kept\. 6 days kept, 1 at the minimum, 4 missed, 2 held\. Current streak 3, best 3\. This week: 2 of 7\.$/.test(w.summary), w.summary);

  // A weekday set (Mon · Wed · Fri), 28 Sep (Mon) on, with an extra day.
  const gym = tpl("gym", "DOW:1,3,5", "2026-09-28");
  const gymI = ["2026-09-28", "2026-09-29", "2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12", "2026-10-14"].map((d) => inst("gym", d, "DONE"));
  gymI.push(inst("gym", "2026-10-02", "DONE_MVV"));
  const g = card(gym, gymI);
  eq("weekday set: Tue, Thu, Sat, Sun are not due; a Tuesday tick is an extra day; Wed 30 Sep missed", codesOf(g, "2026-09-28", "2026-10-15"), "ddxnmnndndndnndndn");
  eq("weekday set: the extra day is shown, never counted", [g.notes["2026-09-29"]?.extra, g.due, g.credit, g.percent], [true, 8, 7, 88]);
  eq("weekday set: the minimum holds the run; current 5 = perDutyStreak; best 5", [g.current, perDutyStreak(parseRule("DOW:1,3,5"), gym.startDay, TODAY, gymI).kept, g.best], [5, 5, 5]);
  eq("weekday set: this week Mon 12 · Wed 14 · Fri 16 → 2 of 3; words 'Mon · Wed · Fri'", [g.period, g.rule], [{ label: "this week", kept: 2, target: 3 }, "Mon · Wed · Fri"]);

  // TARGET 3 a week, from Mon 21 Sep: met · short · held by a rest day · open.
  const read3 = tpl("read", "TARGET:3/W", "2026-09-21");
  const readI = [
    ...["2026-09-21", "2026-09-23", "2026-09-25"].map((d) => inst("read", d, "DONE")),
    inst("read", "2026-09-28", "DONE"),
    inst("read", "2026-09-30", "DONE_MVV"),
    ...["2026-10-05", "2026-10-06", "2026-10-12", "2026-10-13"].map((d) => inst("read", d, "DONE")),
  ];
  const restCtx = { live: true, cursor: null, restDays: new Set(["2026-10-08"]), freezeDays: new Set<DayKey>() };
  const r = card(read3, readI, { opts: boardStreakOptionsOf({ compulsory: false, compulsoryOnRest: false }, restCtx), restKinds: new Map([["2026-10-08", "REST"]]) });
  eq("TARGET 3/W: a met week has no miss (its other days not due)", codesOf(r, "2026-09-21", "2026-09-27"), "dndndnn");
  eq("TARGET 3/W: a short week (1 kept + 1 minimum of 3) shows its 1 shortfall on its last empty day", [codesOf(r, "2026-09-28", "2026-10-04"), r.notes["2026-10-04"]], ["dnmnnnx", { short: { kept: 1, target: 3, per: "week" } }]);
  eq("TARGET 3/W: a rest day holds the third unit: no miss", [codesOf(r, "2026-10-05", "2026-10-11"), r.notes["2026-10-08"]], ["ddnhnnn", { held: "rest" }]);
  eq("TARGET 3/W: the running week: yesterday and today open, the rest to come", codesOf(r, "2026-10-12", "2026-10-18"), "ddoofff");
  eq("TARGET 3/W: % in units: met 3/3 + short 2/3 (the minimum counts 1) + held 2/2 + open 2/2 → 9/10 → 90%", [r.credit, r.due, r.percent], [9, 10, 90]);
  eq("TARGET 3/W: streaks in weeks (met · missed · held · open): current 0 = perDutyStreak, best 1", [r.current, perDutyStreak(parseRule("TARGET:3/W"), read3.startDay, TODAY, readI, { heldDays: new Set(["2026-10-08"]) }).kept, r.best, r.unit], [0, 0, 1, "week"]);
  eq("TARGET 3/W: this week 2 of 3 (the board's periodProgress); footer and words", [r.period, r.foot, r.rule], [{ label: "this week", kept: 2, target: 3 }, "Current 0 weeks · best 1 week · this week 2 of 3", "3× a week"]);

  // A TARGET that began mid-week: that week is unjudged (no shortfall), only what was done counts.
  const late = card(tpl("late", "TARGET:2/W", "2026-10-07"), [inst("late", "2026-10-12", "DONE")]);
  eq("TARGET unjudged: began Wed 7 Oct, nothing that week → no miss; this week 1 done, open", [codesOf(late, "2026-10-05", "2026-10-15"), late.due, late.percent], ["bbnnnnndnoo", 1, 100]);

  // Rest, sick and freeze days through the board's options; a must kept 'Even on rest days' is held by freezes only.
  const ctx = { live: true, cursor: null, restDays: new Set(["2026-10-08", "2026-10-10"]), freezeDays: new Set(["2026-10-09"]) };
  const kinds = new Map<DayKey, "REST" | "SICK" | "VACATION">([["2026-10-08", "REST"], ["2026-10-10", "SICK"]]);
  const habitHeld = card(tpl("walk", "DAILY", "2026-10-07"), [inst("walk", "2026-10-07", "DONE")], { opts: boardStreakOptionsOf({ compulsory: false, compulsoryOnRest: false }, ctx), restKinds: kinds, freezeDays: ctx.freezeDays });
  eq("held: a rest day, a freeze and a sick day hold a habit (outlined, never against it)", [codesOf(habitHeld, "2026-10-07", "2026-10-10"), habitHeld.notes["2026-10-08"], habitHeld.notes["2026-10-09"], habitHeld.notes["2026-10-10"]], ["dhhh", { held: "rest" }, { held: "freeze" }, { held: "sick" }]);
  const mustHeld = card(tpl("meds", "DAILY", "2026-10-07"), [inst("meds", "2026-10-07", "DONE")], { opts: boardStreakOptionsOf({ compulsory: true, compulsoryOnRest: true }, ctx), restKinds: kinds, freezeDays: ctx.freezeDays });
  eq("held: a must kept 'Even on rest days' is held by the freeze only (its rest days read missed)", codesOf(mustHeld, "2026-10-07", "2026-10-10"), "dxhx");
  const before = card(tpl("walk", "DAILY", "2026-10-07"), [inst("walk", "2026-10-07", "DONE")], { opts: boardStreakOptionsOf({ compulsory: false, compulsoryOnRest: false }, { ...ctx, live: false }) });
  eq("held: before Duty is live the board's options are none, and so are the held days", codesOf(before, "2026-10-08", "2026-10-10"), "xxx");

  // The settlement cursor: a day after it with nothing is not settled yet, never missed.
  const cur = card(tpl("cur", "DAILY", "2026-10-10"), [inst("cur", "2026-10-10", "DONE")], { opts: { settledThroughDay: "2026-10-11" } });
  eq("cursor: settled through 11 Oct → 11 missed, 12 and 13 not settled yet (open)", codesOf(cur, "2026-10-10", "2026-10-15"), "dxoooo");
  eq("cursor: the words for an unsettled day, yesterday and today", [dayStateWord("o", undefined, "2026-10-12", TODAY), dayStateWord("o", undefined, "2026-10-14", TODAY), dayStateWord("o", undefined, TODAY, TODAY)], ["not settled yet", "not recorded yet", "due today"]);

  // Ended (archived): nothing after its archive day; no current streak; it goes to the Ended fold.
  const endedT = tpl("ended", "DAILY", "2026-10-01", { archivedDay: "2026-10-04" });
  const ended = card(endedT, ["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => inst("ended", d, "DONE")));
  eq("ended: kept 1–3 Oct, after its archive day empty ('z'); no current streak", [codesOf(ended, "2026-10-01", "2026-10-06"), ended.current, ended.best, ended.foot], ["dddzzz", null, 3, "Ended Sun 4 Oct · best 3 · 3 kept, 0 missed"]);

  // AFTER: due N days after done; a late completion makes its due day a miss; an overdue due day is missed once it can no longer be recorded.
  const after = card(tpl("after", "AFTER:3", "2026-10-01"), ["2026-10-01", "2026-10-04", "2026-10-09"].map((d) => inst("after", d, "DONE")));
  eq("AFTER 3: on time (4 Oct), late (7 Oct missed, done 9), overdue (12 Oct missed, today still due)", codesOf(after, "2026-10-01", "2026-10-15"), "dnndnnxndnnxnno");
  eq("AFTER 3: % = 3 / 5", [after.credit, after.due, after.percent], [3, 5, 60]);

  // A schedule that cannot be read has no card.
  check("no rule: a template without a schedule has no card", habitCardOf(tpl("x", "", "2026-10-01", { recurrence: null }), [], ctxOf()) === null);

  // A past year: no open day, no current streak, no week count.
  const past = habitCardOf(tpl("old", "DAILY", "2025-12-30"), [inst("old", "2025-12-30", "DONE"), inst("old", "2025-12-31", "DONE")], ctxOf({ year: 2025, since: readFromOf(2025, TODAY) }))!;
  eq("past year: 30–31 Dec kept, the rest before it began; no current streak, no week", [past.days.slice(-3), past.current, past.period, past.foot, past.percent], ["bdd", null, null, "Best 2 · 2 kept, 0 missed", 100]);

  // The page.
  const view = habitYearOf({
    year: YEAR,
    today: TODAY,
    since: SINCE,
    templates: [
      { ...water, sortOrder: 2 },
      { ...gym, sortOrder: 1 },
      endedT,
      tpl("norule", "", "2026-10-01", { recurrence: null }),
      tpl("future", "DAILY", "2027-01-04"),
      tpl("old", "DAILY", "2024-03-01", { archivedDay: "2025-06-01" }),
    ],
    instances: [...waterI, ...gymI, ...["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => inst("ended", d, "DONE"))],
    options: {},
    tz: "UTC",
  });
  eq("page: active cards in board order (sortOrder), ended ones apart; no card for no rule, next year's or an earlier year's", [view.habits.map((c) => c.id), view.ended.map((c) => c.id)], [["gym", "water"], ["ended"]]);
  eq("page: '2 habits · 1 ended · 77% kept this year' ((7 + 7 + 3) / (8 + 11 + 3))", view.summary, "2 habits · 1 ended · 77% kept this year");
  eq("page: the year switcher goes back to the earliest habit's year, never past this one", [view.prev, view.next, habitYearOf({ year: 2024, today: TODAY, since: readFromOf(2024, TODAY), templates: [tpl("old", "DAILY", "2024-03-01")], instances: [], options: {} }).prev], [2025, null, null]);
  eq("year param: four digits from 2000 to this year; anything else is this year", [yearOfParam("2025", TODAY), yearOfParam("2027", TODAY), yearOfParam("1999", TODAY), yearOfParam("abc", TODAY), yearOfParam(["2024"], TODAY), yearOfParam(undefined, TODAY)], [2025, 2026, 2026, 2026, 2024, 2026]);
  eq("read window: the week before New Year, and the board's 400 days for this year", [readFromOf(2025, TODAY), readFromOf(2026, TODAY)], ["2024-12-25", addDays(TODAY, -399)]);

  // The popover's words.
  eq("popover: the state in words", [
    dayDetailOf("d", { at: "07:12", xp: 8.3 }, "2026-10-01", TODAY, null),
    dayDetailOf("d", { at: "07:12", late: true }, "2026-10-02", TODAY, null),
    dayDetailOf("m", { at: "06:40", xp: 2.1 }, "2026-10-03", TODAY, "10 pushups"),
    dayDetailOf("h", { held: "rest" }, "2026-10-08", TODAY, null),
    dayDetailOf("x", undefined, "2026-10-06", TODAY, null),
    dayDetailOf("x", { short: { kept: 1, target: 3, per: "week" } }, "2026-10-04", TODAY, null),
    dayDetailOf("n", undefined, "2026-10-06", TODAY, null),
    dayDetailOf("o", undefined, "2026-10-14", TODAY, null),
    dayDetailOf("o", undefined, TODAY, TODAY, null),
  ], [
    "Kept 07:12 · paid 8.3",
    "Kept late (a make-up) 07:12",
    "Minimum version · 10 pushups · 06:40 · paid 2.1",
    "Rest day · the streak holds",
    "Missed",
    "Missed · the week kept 1 of 3",
    "Not due",
    "Not recorded yet",
    "Due today · not done yet",
  ]);
  eq("rule words: every day, weekdays, a weekday set, a target, an interval, monthly", ["DAILY", "WEEKDAYS", "DOW:1,3,5", "TARGET:3/W", "TARGET:2/M", "EVERY:3", "MONTHLY:15"].map((x) => ruleWords(parseRule(x)!)), [
    "every day",
    "weekdays",
    "Mon · Wed · Fri",
    "3× a week",
    "twice a month",
    "every 3 days",
    "monthly on the 15th",
  ]);
}

// ── 3. The colour ──────────────────────────────────────────────────────────
function colour() {
  console.log("— the colour (tokens.css --hab-1..8, habits.css) —");
  const t = (id: string, createdAt: string) => ({ id, createdAt });
  const base = [t("b", "2026-01-02T00:00:00.000Z"), t("a", "2026-01-01T00:00:00.000Z"), t("c", "2026-01-02T00:00:00.000Z")];
  eq("hue: by creation order, then id (a 1 · b 2 · c 3), whatever order the rows come in", [hueOrderOf(base), hueOrderOf([...base].reverse())], [{ a: 1, b: 2, c: 3 }, { a: 1, b: 2, c: 3 }]);
  const more = [...base, t("d", "2026-02-01T00:00:00.000Z")];
  check("hue: a newer habit never recolours an older one", ["a", "b", "c"].every((id) => hueOrderOf(more)[id] === hueOrderOf(base)[id]) && hueOrderOf(more).d === 4);
  const nine = Array.from({ length: 9 }, (_, i) => t(`h${i}`, `2026-01-0${i + 1}T00:00:00.000Z`));
  eq("hue: eight hues, then round again", Object.values(hueOrderOf(nine)), [1, 2, 3, 4, 5, 6, 7, 8, 1]);
  eq("hue: the palette is 8 named hues", [HABIT_HUES, HUE_NAMES.length, new Set(HUE_NAMES).size], [8, 8, 8]);

  const css = read("src/app/styles/tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (selector: string): Record<string, string> => {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`, "m").exec(css);
    const out: Record<string, string> = {};
    for (const decl of (m?.[1] ?? "").split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    return out;
  };
  const night = block(":root, .theme-night");
  const vellumOwn = block(':root[data-theme="vellum"]');
  const vellum = { ...night, ...vellumOwn };
  const rgb = (v: string) => parseColor(v)!.rgb;
  for (const [label, theme, own] of [["Night", night, night], ["Vellum", vellum, vellumOwn]] as const) {
    const hues = Array.from({ length: HABIT_HUES }, (_, i) => `--hab-${i + 1}`);
    const missing = hues.filter((h) => !own[h] || !parseColor(own[h]));
    check(`${label}: --hab-1..8 are declared in its own block as colours`, missing.length === 0, missing.join(", "));
    if (missing.length > 0) continue;
    const card = rgb(theme["--card"]);
    const low = hues.map((h) => [h, contrast(rgb(theme[h]), card)] as const).filter(([, r]) => r < 3);
    check(`${label}: every done square (its hue at 100%) is ≥ 3:1 on the card`, low.length === 0, low.map(([h, r]) => `${h} ${r.toFixed(2)}`).join(", "));
    const must = rgb(theme["--must"]);
    const near = hues.map((h) => [h, deltaE(rgb(theme[h]), must)] as const).filter(([, d]) => d < 15);
    check(`${label}: no hue is the Must orange (ΔE ≥ 15 from --must)`, near.length === 0, near.map(([h, d]) => `${h} ${d.toFixed(1)}`).join(", "));
    const values = hues.map((h) => theme[h].toLowerCase());
    check(`${label}: eight different hues, none of them --must or --habit`, new Set(values).size === 8 && !values.includes(theme["--must"].toLowerCase()) && !values.includes(theme["--habit"].toLowerCase()));
    let closest = Infinity;
    for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) closest = Math.min(closest, deltaE(rgb(theme[hues[i]]), rgb(theme[hues[j]])));
    check(`${label}: the hues are told apart (ΔE ≥ 6 between any two; each card also names its habit)`, closest >= 6, closest.toFixed(1));
  }

  const hh = read("src/components/habits/habits.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("habits.css: a card wears --hab-1 unless its data-hue says 2..8", /\.hh-card \{ --hh-c: var\(--hab-1\);/.test(hh) && [2, 3, 4, 5, 6, 7, 8].every((n) => hh.includes(`.hh-card[data-hue="${n}"] { --hh-c: var(--hab-${n}); }`)));
  check(
    "habits.css: done is the hue at 100%, the minimum ~55% of it, held an outline in it, missed a neutral at low alpha, not due a faint base",
    hh.includes(':is(.hh-d, .hh-sq)[data-s="d"] { background: var(--hh-c); }') &&
      hh.includes(':is(.hh-d, .hh-sq)[data-s="m"] { background: color-mix(in srgb, var(--hh-c) 55%, var(--card)); }') &&
      hh.includes(':is(.hh-d, .hh-sq)[data-s="h"] { background: transparent; box-shadow: inset 0 0 0 1px var(--hh-c); }') &&
      hh.includes(':is(.hh-d, .hh-sq)[data-s="x"] { background: color-mix(in srgb, var(--ink-2) 38%, transparent); }') &&
      hh.includes(':is(.hh-d, .hh-sq)[data-s="n"] { background: var(--line-2); }')
  );
  check("habits.css: tokens only (no hex, rgb() or hsl()), never --must, in @layer components after the layer order", !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(hh) && !/--must\b/.test(hh) && read("src/components/habits/habits.css").startsWith("@layer theme, base, components, art, effects, utilities;") && /@layer components \{/.test(hh));
  const sizes = [...hh.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  check("habits.css: no text under 12 px", sizes.every((n) => n >= 12), sizes.join(","));
}

// ── 4. The route, the nav and the entry points ─────────────────────────────
function wiring() {
  console.log("— the route, the nav, the entry points —");
  const dir = "src/app/today/habits";
  check("route: page, loading skeleton, metadata 'Habits', never prerendered, no <main>", existsSync(join(ROOT, dir, "page.tsx")) && existsSync(join(ROOT, dir, "loading.tsx")) && /export const metadata: Metadata = \{ title: "Habits" \};/.test(code(`${dir}/page.tsx`)) && /export const dynamic = "force-dynamic";/.test(code(`${dir}/page.tsx`)) && !/<main\b/.test(code(`${dir}/page.tsx`)) && !/<main\b/.test(code(`${dir}/loading.tsx`)) && !/<main\b/.test(code("src/components/habits/HabitCard.tsx")));
  const loading = code(`${dir}/loading.tsx`);
  check("route: the skeleton says it is loading (aria-busy, a status line) and draws the cards' shape", /aria-busy="true"/.test(loading) && /role="status"/.test(loading) && /className="card hh-card"/.test(loading) && /className="hh-gridwrap"/.test(loading));
  const page = code(`${dir}/page.tsx`);
  check("route: ?year= read (searchParams awaited), one cached read of the year, a failure says so instead of throwing", /searchParams: Promise</.test(page) && /await searchParams/.test(page) && /yearOfParam\(query\.year, today\)/.test(page) && /loadHabitYear\(getCurrentUserId\(\), year, now\)\.catch\(/.test(page) && /Couldn&apos;t load your habits/.test(page));
  check(
    "route: this week's daily quests (P9, D14 and D15) beside it, this year only, read in the same wave, a failure leaving them out",
    /thisYear\s*\?\s*loadQuestWeek\(getCurrentUserId\(\), now\)\.catch\(\(err: unknown\): QuestWeekView \| null => \{/.test(page) &&
      /await Promise\.all\(\[\s*loadHabitYear\(/.test(page) &&
      /\{quests && <QuestWeek week=\{quests\} today=\{today\} \/>\}/.test(page)
  );
  check("route: the year switcher ‹ prev · year · next ›, the summary, the legend, the Ended fold, the hash ring", /aria-label="Year"/.test(page) && /‹ \{view\.prev\}/.test(page) && /\{view\.next\} ›/.test(page) && /\{view\.summary\}/.test(page) && /className="hh-legend"/.test(page) && /<details className="hh-ended">\s*<summary>Ended · \{view\.ended\.length\}<\/summary>/.test(page) && /<HabitHash \/>/.test(page));
  check("route: the top bar's title is nav.ts's (no ShellTitle)", !/ShellTitle/.test(page));

  const server = code("src/lib/habit-history-server.ts");
  check("read: cached per user, year and life day under 'life' and 'activity'", /cached\(`habitYear:\$\{userId\}:\$\{year\}:\$\{today\}`, \["life", "activity"\]/.test(server));
  check("read: one wave (a single Promise.all, no other query awaited)", (server.match(/await Promise\.all\(/g) ?? []).length === 1 && !/await prisma\./.test(server));
  check("read: the personal Board's HABIT templates (not inbox items), archived ones too; their instances from readFromOf to 31 Dec", /const HABIT_WHERE = \{ kind: "HABIT", inbox: false, \.\.\.PERSONAL_BOARD \} as const;/.test(server) && /where: \{ userId, \.\.\.HABIT_WHERE \}/.test(server) && !/archivedAt: null/.test(server) && /where: \{ userId, day: range, template: HABIT_WHERE \}/.test(server) && /const since = readFromOf\(year, today\);/.test(server));
  check("read: the held days and the cursor reach each habit as the board's own options (boardStreakOptionsOf), only once Duty is live", /options\[t\.id\] = boardStreakOptionsOf\(t, streakCtx\)/.test(server) && /const live = isDutyLaunched\(today, launchDay\);/.test(server) && /validRestDays\(rest, since, end\)/.test(server) && /source: "FREEZE_USE"/.test(server));
  check("read-only: no write, no invalidate, no settlement or judging anywhere on the page", !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|invalidate\(/.test(server) && ![page, code("src/components/habits/HabitCard.tsx"), code("src/components/habits/HabitHash.tsx")].some((s) => /maybeMaintainLife|settleLifeDays|after\(|"use server"|@\/app\/actions/.test(s)));
  check("pure: habit-history.ts reads no database and no clock", !/prisma|new Date\(\)|Date\.now\(/.test(code("src/lib/habit-history.ts")));

  // The nav.
  eq("nav: Tasks' sub-pages Board · Weekly review · Habits · Rules", sectionById("tasks").subs.map((s) => [s.label, s.href]), [["Board", "/today"], ["Weekly review", "/today/week"], ["Habits", "/today/habits"], ["Rules", "/today/rules"]]);
  eq(
    "nav: with work tabs the strip is Board · <work tabs> · + · Weekly review · Habits · Rules",
    [subsOf("tasks", [{ id: "w1", name: "Acme" }]).map((s) => s.label), addWorkTabAfter([{ id: "w1", name: "Acme" }])],
    [["Board", "Acme", "Weekly review", "Habits", "Rules"], "/today/work/w1"]
  );
  eq("nav: /today/habits is Tasks, its own current tab, titled Tasks · Habits", [sectionOf("/today/habits"), activeSub("/today/habits"), titleFor("/today/habits")], ["tasks", "/today/habits", { eyebrow: "Tasks", title: "Habits" }]);
  check("nav: only Tasks gained the sub-page", SECTIONS.filter((s) => s.id !== "tasks").every((s) => !s.subs.some((x) => x.href === "/today/habits")));

  // The entry points.
  const lane = code("src/components/today/Lane.tsx");
  check("Lane: an optional action at the end of its header (after the count)", /action\?: ReactNode;/.test(lane) && /\{count != null && <span className="lane-count num">\{count\}<\/span>\}\s*\{action\}\s*<\/div>/.test(lane));
  const board = code("src/components/today/TodayBoard.tsx");
  check("Today: the Habits lane's header has a quiet 'Year' link to /today/habits, on the personal Board only", /id="habits"[\s\S]{0,600}?action=\{\s*isWork \? undefined : \(\s*<Link className="lane-link" href="\/today\/habits"[^>]*>\s*Year\s*<\/Link>/.test(board));
  const drawer = code("src/components/today/TaskDrawer.tsx");
  check("drawer: 'Track record ›' deep-links /today/habits#<templateId>, for a personal habit with a rule only", /\{!props\.work && t\.kind === "HABIT" && recurring && \(\s*<div className="today-drawer-row">\s*<Link className="td-record" href=\{`\/today\/habits#\$\{encodeURIComponent\(t\.id\)\}`\}>\s*Track record ›\s*<\/Link>/.test(drawer));
  const hash = code("src/components/habits/HabitHash.tsx");
  check("hash: the card named by the hash is opened (the Ended fold), ringed (data-target), scrolled to and its name focused, on load and on hashchange", /card\.closest\("details"\)/.test(hash) && /fold\.open = true/.test(hash) && /card\.setAttribute\("data-target", ""\)/.test(hash) && /scrollIntoView\(\{ block: "start" \}\)/.test(hash) && /\.hh-title"\)\?\.focus\(/.test(hash) && /addEventListener\("hashchange", go\)/.test(hash));
  const today = read("src/components/today/today.css");
  check("today.css: the lane link and Track record › are 44 px targets", /\.today-lane \.lane-link \{[^}]*min-height: 44px;/.test(today) && /\.today-drawer \.td-record \{[^}]*min-height: 44px;/.test(today));

  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  const ui = pkg.scripts["ui:check"].split("&&").map((s) => s.trim());
  // scheduled-tasks-check (2026-10-20) runs between this check and push-check.
  check("package.json: ui:check runs this check after word-model-check, then scheduled-tasks-check, then push-check; habit-history:check runs it alone", ui[ui.indexOf("tsx scripts/habit-history-check.ts") + 1] === "tsx scripts/scheduled-tasks-check.ts" && ui[ui.indexOf("tsx scripts/habit-history-check.ts") + 2] === "tsx scripts/push-check.ts" && ui[ui.indexOf("tsx scripts/habit-history-check.ts") - 1] === "tsx scripts/word-model-check.ts" && pkg.scripts["habit-history:check"] === "tsx scripts/habit-history-check.ts");
}

// ── 5. 344 px ──────────────────────────────────────────────────────────────
function fit() {
  console.log("— 344 px —");
  const hh = read("src/components/habits/habits.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const comp = read("src/app/styles/components.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (src: string, sel: string) => new RegExp(`(?:^|[}\\n])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m").exec(src)?.[1] ?? "";
  const px = (body: string, prop: string) => /(\d+(?:\.\d+)?)px/.exec(new RegExp(`(?:^|;|\\{)\\s*${prop}:\\s*([^;]+)`).exec(body)?.[1] ?? "")?.[1];
  const pagePad = Number(/padding:\s*\d+px (\d+)px/.exec(rule(comp, ".page"))?.[1] ?? NaN);
  const cardBorder = Number(/border:\s*(\d+)px/.exec(rule(comp, ".card"))?.[1] ?? NaN);
  const cardPad = Number(px(rule(hh, ".hh-card"), "padding"));
  const scrollPad = Number(/padding:\s*\d+px (\d+)px/.exec(rule(hh, ".hh-scroll"))?.[1] ?? NaN);
  const year = rule(hh, ".hh-year");
  const gap = Number(/--hh-gap:\s*(\d+(?:\.\d+)?)px/.exec(year)?.[1] ?? NaN);
  const clamp = /--hh-sq:\s*clamp\((\d+)px,[^;]*,\s*(\d+)px\)/.exec(year);
  const sqMin = Number(clamp?.[1] ?? NaN);
  const sqMax = Number(clamp?.[2] ?? NaN);
  eq("css read: the page's 16 px gutter, the card's 1 px border and 12 px padding, the scroller's 2 px, 1 px gaps, squares clamp(5px … 12px)", [pagePad, cardBorder, cardPad, scrollPad, gap, sqMin, sqMax], [16, 1, 12, 2, 1, 5, 12]);
  const inner = 344 - 2 * pagePad - 2 * cardBorder - 2 * cardPad - 2 * scrollPad;
  for (const y of [2026, 2012]) {
    const { cols } = yearGridOf(y);
    const sq = Math.min(sqMax, Math.max(sqMin, (inner - (cols - 1) * gap) / cols));
    const width = cols * sq + (cols - 1) * gap;
    check(`344 px, ${y} (${cols} weeks): squares ${sq} px (5–6), gaps ${gap} px`, sq >= 5 && sq <= 6 && gap >= 1 && gap <= 2);
    const scrolls = /overflow-x:\s*auto/.test(rule(hh, ".hh-scroll")) && /container-type:\s*inline-size/.test(rule(hh, ".hh-scroll"));
    check(`344 px, ${y}: the year (${width} px) fits the card (${inner} px inside) or scrolls inside it, a size container that cannot widen the page`, width <= inner || scrolls, `${width} > ${inner}`);
  }
  check("344 px: the card can shrink (.card min-width: 0) and the year is as wide as its weeks (max-content)", /min-width:\s*0/.test(rule(comp, ".card")) && /width:\s*max-content/.test(rule(hh, ".hh-year")));
  const desk = 760;
  const { cols } = yearGridOf(2026);
  const sqDesk = Math.min(sqMax, Math.max(sqMin, (desk - (cols - 1) * 2) / cols));
  check(`desktop (760 px inside): ${sqDesk.toFixed(1)} px squares, the year fits without a scroll`, cols * sqDesk + (cols - 1) * 2 <= desk && sqDesk >= 12);
  const cardSrc = code("src/components/habits/HabitCard.tsx");
  check("344 px: the year opens scrolled to the current month (the focused square at the right edge) when it is wider than the card", /scroller\.scrollWidth <= scroller\.clientWidth\) return;\s*scroller\.scrollLeft = Math\.max\(0, cell\.offsetLeft \+ cell\.offsetWidth \+ 24 - scroller\.clientWidth\);/.test(cardSrc));
}

// ── 6. The grid: keys, names, the render ───────────────────────────────────
async function grid() {
  console.log("— the grid (keyboard, names, render) —");
  const g26 = yearGridOf(2026);
  eq("grid 2026: 1 Jan is a Thursday (row 3), 365 days in 53 Monday-first weeks", [g26.offset, g26.days, g26.cols], [3, 365, 53]);
  eq("grid 2012 (a leap year from a Sunday): 54 weeks; 2028: 53", [yearGridOf(2012).cols, yearGridOf(2028).cols], [54, 53]);
  eq("grid: month labels at their columns (Jan 0, Feb 5, Oct 39, Dec 48)", [g26.months[0], g26.months[1], g26.months[9], g26.months[11]], [{ label: "Jan", col: 0 }, { label: "Feb", col: 5 }, { label: "Oct", col: 39 }, { label: "Dec", col: 48 }]);
  const at = 286; // 14 Oct 2026, a Wednesday (row 2)
  eq("keys: → a week on, ← a week back, ↓ the next day, ↑ the day before", ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].map((k) => moveInGrid(at, k, false, g26)), [293, 279, 287, 285]);
  eq("keys: ↓ stops at Sunday (18 Oct), ↑ at Monday (12 Oct): no wrap", [moveInGrid(290, "ArrowDown", false, g26), moveInGrid(284, "ArrowUp", false, g26)], [null, null]);
  eq("keys: Home / End the row's first and last day, Ctrl+Home / Ctrl+End the year's", [moveInGrid(at, "Home", false, g26), moveInGrid(at, "End", false, g26), moveInGrid(at, "Home", true, g26), moveInGrid(at, "End", true, g26)], [6, 363, 0, 364]);
  eq("keys: never out of the year; other keys do not move", [moveInGrid(2, "ArrowLeft", false, g26), moveInGrid(362, "ArrowRight", false, g26), moveInGrid(at, "a", false, g26), moveInGrid(at, "Tab", false, g26)], [null, null, null, null]);

  const src = code("src/components/habits/HabitCard.tsx");
  check("grid: role grid > row > gridcell; one tab stop (tabIndex 0 on the focused day, -1 on the rest)", /role="grid"/.test(src) && /role="row"/.test(src) && /role="gridcell"/.test(src) && /tabIndex=\{current \? 0 : -1\}/.test(src));
  check("grid: the keys go through moveInGrid; Enter or Space opens the day; Escape closes it and gives the square its focus back", /const j = moveInGrid\(focus, e\.key, e\.ctrlKey \|\| e\.metaKey, grid\);/.test(src) && /if \(e\.key === "Enter" \|\| e\.key === " "\)/.test(src) && /if \(e\.key !== "Escape" \|\| !open\) return;\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*close\(\);/.test(src));
  check("popover: a dialog under the grid with the date, the state in words, ‹ › a day, Close; a press outside closes it", /role="dialog"/.test(src) && /dayLongLabel\(day\)/.test(src) && /dayDetailOf\(code, card\.notes\[day\], day, today, card\.mvv\)/.test(src) && /aria-label="Previous day"/.test(src) && /aria-label="Next day"/.test(src) && /aria-label="Close"/.test(src) && /document\.addEventListener\("pointerdown", onDown\)/.test(src));
  check("popover: Record yesterday only for yesterday, while it is still open to record", /\{day === yesterday && code === "o" \? \(\s*<Link className="hh-pop-link" href=\{RECORD_YESTERDAY_HREF\}>\s*Record yesterday ›/.test(src));

  const { HabitCard } = await import("../src/components/habits/HabitCard");
  const water = habitCardOf(
    { id: "c-water", title: "Drink water", recurrence: "DAILY", startDay: "2026-10-01", createdAt: "2026-10-01T00:00:00.000Z", sortOrder: 0, archivedDay: null, mvv: "one glass", icon: "water" },
    [inst("c-water", "2026-10-01", "DONE"), inst("c-water", "2026-10-03", "DONE_MVV"), inst("c-water", "2026-10-04", "SKIPPED"), inst("c-water", "2026-10-13", "DONE")],
    ctxOf({ hue: 3 })
  )!;
  const html = renderToStaticMarkup(createElement(HabitCard, { card: water, year: YEAR, today: TODAY }));
  check("render: the card is the template's anchor (#<templateId>), in its hue, named by its heading", /<article class="card hh-card" id="c-water" data-hue="3" aria-labelledby="[^"]+">/.test(html) && /<h2 id="[^"]+" class="hh-title" tabindex="-1">Drink water<\/h2>/.test(html));
  check(
    "render: the header says the rule and the minimum, and the % on the right with 'n at minimum' under it (D15)",
    /<p class="hh-rule">every day · minimum: one glass<\/p>/.test(html) &&
      /<div class="hh-score" aria-hidden="true"><p class="hh-pct">\d+%<\/p><p class="hh-min">1 at minimum<\/p><\/div>/.test(html)
  );
  check("render: the glyph is the habit's own icon, drawn in its hue", html.includes(`<path d="M12 3.5c3.5 4.5`));
  const cells = html.match(/role="gridcell"/g) ?? [];
  const pads = html.match(/data-pad="" aria-hidden="true"/g) ?? [];
  eq("render: 7 rows × 53 weeks of cells, the 6 outside the year hidden", [(html.match(/role="row"/g) ?? []).length, cells.length, pads.length], [7, 371, 6]);
  const stops = [...html.matchAll(/<div role="gridcell"[^>]*tabindex="0"[^>]*>/g)].map((m) => m[0]);
  check("render: exactly one tab stop, on today (ringed)", stops.length === 1 && /data-today=""/.test(stops[0]) && /aria-label="Thu 15 Oct: due today"/.test(stops[0]), stops.join(" | "));
  check(
    "render: every square is named for its date and state",
    ["Thu 1 Oct: kept", "Fri 2 Oct: missed", "Sat 3 Oct: minimum version", "Sun 4 Oct: skipped", "Tue 13 Oct: kept", "Wed 14 Oct: not recorded yet", "Fri 16 Oct: still to come", "Wed 30 Sep: before it began"].every((l) => html.includes(`aria-label="${l}"`))
  );
  check("render: each square opens a dialog (aria-haspopup), the focused one says whether it is open", /aria-haspopup="dialog"/.test(html) && /tabindex="0" aria-label="Thu 15 Oct: due today" aria-haspopup="dialog" aria-expanded="false"/.test(html));
  check("render: the grid is named and described by the card's summary in words", /role="grid" class="hh-grid" aria-label="Drink water, 2026: a square a day" aria-describedby="([^"]+)"/.test(html) && /<p id="[^"]+" class="sr-only">Drink water, every day, 2026: \d+% kept\./.test(html));
  check("render: month labels above (hidden from screen readers; each square carries its date)", /<div class="hh-months" aria-hidden="true"><span style="--col:0">Jan<\/span>/.test(html));
  check("render: the footer line, each part kept together", /<p class="hh-foot"><span class="hh-keep">Current 1<\/span> · <span class="hh-keep">best 1<\/span> · <span class="hh-keep">this week 1 of 7<\/span><\/p>/.test(html), /<p class="hh-foot">.*?<\/p>/.exec(html)?.[0]);
  check("render: no popover until a day is opened; no <main>", !/hh-pop/.test(html) && !/<main\b/.test(html));

  const { Lane } = await import("../src/components/today/Lane");
  const lane = renderToStaticMarkup(createElement(Lane, { id: "habits", title: "Habits", habit: true, count: "1 of 2", action: createElement("a", { className: "lane-link", href: "/today/habits" }, "Year") }));
  check("render: the Habits lane's header ends with its Year link", /<span class="lane-count num">1 of 2<\/span><a class="lane-link" href="\/today\/habits">Year<\/a><\/div>/.test(lane));
}

async function main() {
  states();
  colour();
  wiring();
  fit();
  await grid();
  console.log(`habit-history-check: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
