/**
 * Daily quests (docs/life-plan/blueprint-plan-2026-10-22.md P9; blueprint 2.3 and 2.4; decisions D14 and D15): the
 * user's Musts are the Daily Quests, at most 5 due on one life day, with a warning from the 4th; binary is a status
 * only (the minimum counts 1, shown "n at minimum"), and XP stays graded.
 *
 *   §1 the cap: mustCapOf over the next 7 life days (the rule in force on each, its daily-quest slots: mustsDueOn's
 *      count, a planned one-off must on its day, a target must on every day), a dated one-off or a rule's first day
 *      past them, the 4th and 5th warned, a 6th capped (a '3× a week!' must too), nothing already a must demoted;
 *   §2 Today's strip: dailyQuestsOf over the Must lane's rows (the lane's own count), the minimum, the hidden musts,
 *      a day over the cap counted as the cap counts (a carried must is in the strip, never over the cap); its words;
 *      DailyStrip's markup;
 *   §3 the week: questWeekOf's cells, one rule with the weekly audit (P11; week-audit-check pins the audit): DONE,
 *      DONE_LATE, DONE_MVV and MADE_UP kept; a skip and an excused or held day left out (D16); MISSED and WRITTEN_OFF
 *      0; open, not due, still to come; a one-off done early, the rule in force per day, Duty's held days, another
 *      week's start; QuestWeek's markup;
 *   §4 the writes, read from the source: capture (insertCapture) counts before its one INSERT and saves a sixth as
 *      an ordinary task; an edit leaves the line it replaces out; an inbox must is counted as it leaves the inbox;
 *      the toast says so (toastCopy); a must brought back (unarchive) is counted and says so, never demoted, on every
 *      path that answers an Undo or a Restore; no price, curve or pay path is read.
 *
 * Pure: no database, no clock, no model. Today is Thursday 22 October 2026.
 *
 *   npx tsx scripts/daily-quests-check.ts
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MUSTS_PER_DAY_MAX, MUSTS_WARN_FROM, MUST_CAP_DAYS } from "../src/lib/duty-economy";
import { mustsDueOn, type DutyTemplate } from "../src/lib/duty-rule";
import { addDays, weekdayOf, type DayKey } from "../src/lib/life-day";
import {
  DAILY_QUESTS_TITLE,
  MUST_CAP_LINE,
  capDaysOf,
  dailyQuestsLabel,
  dailyQuestsOf,
  mustCapOf,
  mustNoteOf,
  mustNoteIn,
  mustNoticeOf,
  mustWarnLineOf,
  questBitOf,
  questOutcomeOf,
  questSlotsOn,
  questWeekLine,
  questWeekOf,
  restoredMustNoteOf,
  restoredNoticeOf,
  takesQuestSlotOn,
  type QuestTemplate,
} from "../src/lib/daily-quests";
import { mustsOfDay } from "../src/lib/full-day";
import type { BoardRow } from "../src/lib/today-board";
import { NOT_MUST_TAIL, toastCopy } from "../src/components/capture/capture-ui";
import { DailyStrip } from "../src/components/today/DailyStrip";
import { QuestWeek } from "../src/components/habits/QuestWeek";
import type { CapturedItem } from "../src/app/actions/capture";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  check(name, g === w, g === w ? "" : `got ${g}, want ${w}`);
}

const TODAY: DayKey = "2026-10-22";
const T = (id: string, over: Partial<DutyTemplate> = {}): DutyTemplate & { id: string } => ({
  id,
  kind: "HABIT",
  recurrence: "DAILY",
  startDay: "2026-10-01",
  dueDay: null,
  dueKind: null,
  compulsory: true,
  compulsoryOnRest: false,
  inbox: false,
  archivedDay: null,
  ...over,
});
const dailies = (n: number) => Array.from({ length: n }, (_, i) => T(`d${i + 1}`));
const NEW_DAILY: DutyTemplate = T("new");

// ═══ §1 The cap ═══════════════════════════════════════════════════════════

console.log("— §1 the cap —");
check("the constants: at most 5 a day, a warning from 4, counted over 7 life days", MUSTS_PER_DAY_MAX === 5 && MUSTS_WARN_FROM === 4 && MUST_CAP_DAYS === 7);
check("Thursday 22 October 2026 is a Thursday (the fixtures' weekdays hold)", weekdayOf(TODAY) === 4);
eq("capDaysOf: today and the six days after it", capDaysOf(NEW_DAILY, TODAY), Array.from({ length: 7 }, (_, i) => addDays(TODAY, i)));
eq("two standing: a third says nothing", mustCapOf(dailies(2), NEW_DAILY, TODAY), { peak: 3, day: TODAY, capped: false, line: null });
eq("three standing: the 4th warns '4 of 5 daily quests'", mustCapOf(dailies(3), NEW_DAILY, TODAY), { peak: 4, day: TODAY, capped: false, line: "4 of 5 daily quests" });
eq("four standing: the 5th warns, the cap reached", mustCapOf(dailies(4), NEW_DAILY, TODAY), { peak: 5, day: TODAY, capped: false, line: "5 of 5 daily quests, the cap" });
eq("five standing: a 6th is capped, with the line", mustCapOf(dailies(5), NEW_DAILY, TODAY), { peak: 6, day: TODAY, capped: true, line: MUST_CAP_LINE });
check("the cap's line, word for word", MUST_CAP_LINE === "Five daily quests is the cap. Soften one first.");
{
  // Four dailies and one Monday must: Monday 26 Oct holds 5, the other days 4.
  const standing = [...dailies(4), T("mon", { recurrence: "DOW:1" })];
  eq("the 7-day look-ahead: a new Monday must is the 6th on Mon 26 Oct", mustCapOf(standing, T("x", { recurrence: "DOW:1" }), TODAY), { peak: 6, day: "2026-10-26", capped: true, line: MUST_CAP_LINE });
  eq("…a new Tuesday must is the 5th on Tue 27 Oct, named", mustCapOf(standing, T("x", { recurrence: "DOW:2" }), TODAY), { peak: 5, day: "2026-10-27", capped: false, line: "5 of 5 daily quests on Tue 27 Oct, the cap" });
  eq("…a new daily peaks on the Monday (the busiest of its days)", mustCapOf(standing, NEW_DAILY, TODAY), { peak: 6, day: "2026-10-26", capped: true, line: MUST_CAP_LINE });
}
{
  // Deadline one-offs count on their day (mustsDueOn: expectedOn's deadline day).
  const fri = (id: string) => T(id, { kind: "TASK", recurrence: null, dueDay: "2026-10-23", dueKind: "DEADLINE" });
  const standing = [...dailies(3), fri("f1"), fri("f2")];
  eq("deadline one-offs due that day are counted: Friday holds 5, a 3rd deadline that day is the 6th", mustCapOf(standing, fri("f3"), TODAY), { peak: 6, day: "2026-10-23", capped: true, line: MUST_CAP_LINE });
  eq("…a deadline on Saturday is the 4th there", mustCapOf(standing, T("s", { kind: "TASK", recurrence: null, dueDay: "2026-10-24", dueKind: "DEADLINE" }), TODAY).peak, 4);
  const far = (id: string) => T(id, { kind: "TASK", recurrence: null, dueDay: "2026-11-20", dueKind: "DEADLINE" });
  eq("a deadline past the 7 days is counted on its own day", capDaysOf(far("x"), TODAY).slice(-1), ["2026-11-20"]);
  eq("…five there already: the 6th there is capped", mustCapOf([far("a"), far("b"), far("c"), far("d"), far("e")], far("x"), TODAY).capped, true);
  // A planned one-off must sits in the Must lane from its day (today-board), so it takes a slot there (D14: every must).
  const planned = (id: string, day: DayKey) => T(id, { kind: "TASK", recurrence: null, dueDay: day, dueKind: "PLANNED" });
  eq("…a planned one-off must takes a slot on its day: five dailies standing, a 6th planned for today is capped", mustCapOf(dailies(5), planned("p", TODAY), TODAY), { peak: 6, day: TODAY, capped: true, line: MUST_CAP_LINE });
  eq("…one planned past the 7 days is counted on its own day", [capDaysOf(planned("p", "2026-11-20"), TODAY).slice(-1), mustCapOf([far("a"), far("b"), far("c")], planned("p", "2026-11-20"), TODAY).peak], [["2026-11-20"], 4]);
}
{
  const monthly = T("m", { recurrence: "MONTHLY:15" });
  eq("a rule due on none of the 7 days is counted on its first day (MONTHLY:15 → 15 Nov)", capDaysOf(monthly, TODAY).slice(-1), ["2026-11-15"]);
  eq("…against the dailies standing that day", mustCapOf(dailies(5), monthly, TODAY), { peak: 6, day: "2026-11-15", capped: true, line: MUST_CAP_LINE });
  eq("a rule that starts later is counted from its start", mustCapOf(dailies(4), T("s", { startDay: "2026-10-25" }), TODAY).day, "2026-10-25");
}
{
  const notCounted = [...dailies(4), T("t", { recurrence: "TARGET:3/W", compulsory: false }), T("i", { inbox: true }), T("n", { compulsory: false }), T("z", { archivedDay: "2026-10-20" })];
  eq("never counted: an inbox must, a non-must (a target that is not a must too), an archived must", mustCapOf(notCounted, NEW_DAILY, TODAY).peak, 5);
  // A pending 'Not a must' still counts until its day (ruleOn): five dailies, one leaving from Sat 24 Oct.
  const leaving = [...dailies(4), T("l", { pendingChange: { v: 1, next: { effectiveDay: "2026-10-24", compulsory: false } } })];
  eq("a pending 'Not a must' counts until its day: a new Friday must is capped, a new Sunday must is not", [mustCapOf(leaving, T("x", { recurrence: "DOW:5" }), TODAY).capped, mustCapOf(leaving, T("x", { recurrence: "DOW:7" }), TODAY).capped], [true, false]);
}
{
  // A weekly or monthly target must ('3× a week!') sits in the Must lane every day of its period until it is met
  // (today-board), so it takes a slot on every day: the cap holds for it as for a daily one (D14's hard cap of 5).
  const target = (id: string, over: Partial<DutyTemplate> = {}) => T(id, { recurrence: "TARGET:3/W", ...over });
  eq("a TARGET must is a daily quest: five dailies standing, a 6th as '3× a week' is capped, with the line", mustCapOf(dailies(5), target("t"), TODAY), { peak: 6, day: TODAY, capped: true, line: MUST_CAP_LINE });
  eq("…the 4th as a target warns, as a daily would", mustCapOf(dailies(3), target("t"), TODAY), { peak: 4, day: TODAY, capped: false, line: "4 of 5 daily quests" });
  eq("…a standing target takes its slot every day: four dailies and a target, a new daily is the 6th", mustCapOf([...dailies(4), target("t")], NEW_DAILY, TODAY), { peak: 6, day: TODAY, capped: true, line: MUST_CAP_LINE });
  eq("…a monthly target too ('4× a month!')", mustCapOf(dailies(5), target("m", { recurrence: "TARGET:4/M" }), TODAY).capped, true);
  eq("…a target that starts later is counted from its start", mustCapOf(dailies(4), target("s", { startDay: "2026-10-26" }), TODAY).day, "2026-10-26");
  eq(
    "takesQuestSlotOn: due (a daily, a deadline on its day), planned for its day, a target every day; not a deadline or a planned one-off carried past its day, an inbox must, a non-must, an AFTER rule",
    [
      takesQuestSlotOn(T("d"), TODAY),
      takesQuestSlotOn(T("dl", { kind: "TASK", recurrence: null, dueDay: TODAY, dueKind: "DEADLINE" }), TODAY),
      takesQuestSlotOn(T("pl", { kind: "TASK", recurrence: null, dueDay: TODAY, dueKind: "PLANNED" }), TODAY),
      takesQuestSlotOn(target("t"), TODAY),
      takesQuestSlotOn(T("dl", { kind: "TASK", recurrence: null, dueDay: "2026-10-20", dueKind: "DEADLINE" }), TODAY),
      takesQuestSlotOn(T("pl", { kind: "TASK", recurrence: null, dueDay: "2026-10-20", dueKind: "PLANNED" }), TODAY),
      takesQuestSlotOn(T("i", { recurrence: "TARGET:3/W", inbox: true }), TODAY),
      takesQuestSlotOn(target("n", { compulsory: false }), TODAY),
      takesQuestSlotOn(T("a", { recurrence: "AFTER:3" }), TODAY),
    ],
    [true, true, true, true, false, false, false, false, false]
  );
  eq("questSlotsOn: mustsDueOn's musts and the target", questSlotsOn([...dailies(2), target("t"), T("n", { compulsory: false })], TODAY).map((t) => t.id), ["d1", "d2", "t"]);
}
{
  // A day already over the cap (six musts) keeps them all: the cap only ever counts a new one.
  const over = dailies(6);
  eq("a day already over the cap keeps its musts (mustsDueOn still owes all six) and a new one there is capped", [mustsDueOn(over, TODAY).length, mustCapOf(over, NEW_DAILY, TODAY).capped], [6, true]);
  eq("…a new must on a day that is not over is not", mustCapOf([...dailies(3), ...Array.from({ length: 3 }, (_, i) => T(`mo${i}`, { recurrence: "DOW:1" }))], T("x", { recurrence: "DOW:3" }), TODAY).capped, false);
}
// A must brought back (unarchive) is never demoted: past the cap it stays a must and says how many that day holds.
eq(
  "restoredMustNoteOf: past the cap 'n of 5 daily quests, over the cap' (never capped: it stays a must), the day named when not today; the 4th and 5th warn as a new must; none below",
  [
    restoredMustNoteOf(mustCapOf(dailies(5), NEW_DAILY, TODAY), TODAY),
    restoredMustNoteOf(mustCapOf([...dailies(4), T("mon", { recurrence: "DOW:1" })], T("x", { recurrence: "DOW:1" }), TODAY), TODAY),
    restoredMustNoteOf(mustCapOf(dailies(3), NEW_DAILY, TODAY), TODAY),
    restoredMustNoteOf(mustCapOf(dailies(1), NEW_DAILY, TODAY), TODAY),
  ],
  [{ capped: false, line: "6 of 5 daily quests, over the cap" }, { capped: false, line: "6 of 5 daily quests on Mon 26 Oct, over the cap" }, { capped: false, line: "4 of 5 daily quests" }, null]
);
eq(
  "the notices: a clarify past the cap, near it; an Undo or a Restore with and without a note; mustNoteIn reads a loose answer",
  [
    mustNoticeOf("Floss", { capped: true, line: MUST_CAP_LINE }),
    mustNoticeOf("Floss", { capped: false, line: "4 of 5 daily quests" }),
    restoredNoticeOf("Floss", { capped: false, line: "6 of 5 daily quests, over the cap" }),
    restoredNoticeOf("Floss", null),
    mustNoteIn({ mustNote: { capped: false, line: "5 of 5 daily quests, the cap" } }),
    [mustNoteIn(null), mustNoteIn({}), mustNoteIn({ mustNote: { line: 5 } })],
  ],
  [
    `Floss is an ordinary task. ${MUST_CAP_LINE}`,
    "Floss: 4 of 5 daily quests.",
    "Floss is back. 6 of 5 daily quests, over the cap.",
    "Floss is back.",
    { capped: false, line: "5 of 5 daily quests, the cap" },
    [null, null, null],
  ]
);
eq("mustWarnLineOf: today, another day, the cap", [mustWarnLineOf(4, null), mustWarnLineOf(4, "2026-10-26"), mustWarnLineOf(5, null)], ["4 of 5 daily quests", "4 of 5 daily quests on Mon 26 Oct", "5 of 5 daily quests, the cap"]);
eq("mustNoteOf: none below the warning, the warning, the cap", [mustNoteOf(mustCapOf(dailies(1), NEW_DAILY, TODAY)), mustNoteOf(mustCapOf(dailies(3), NEW_DAILY, TODAY)), mustNoteOf(mustCapOf(dailies(5), NEW_DAILY, TODAY)), mustNoteOf(null)], [
  null,
  { capped: false, line: "4 of 5 daily quests" },
  { capped: true, line: MUST_CAP_LINE },
  null,
]);

// ═══ §2 Today's strip ═════════════════════════════════════════════════════

console.log("— §2 today's strip —");
// Each row a daily must's (its rule is what "n over the cap" counts by: takesQuestSlotOn on the row's day).
const row = (id: string, state: BoardRow["state"], over: Partial<BoardRow> = {}, rule: Partial<DutyTemplate> = {}): BoardRow =>
  ({ key: `${id}:${TODAY}`, day: TODAY, template: { ...T(id, rule), title: id.toUpperCase() }, state, minimum: false, heldToday: false, ...over }) as unknown as BoardRow;
{
  const must = [row("gym", "done", { minimum: true }), row("meds", "done"), row("rent", "open"), row("walk", "skipped"), row("yoga", "open", { heldToday: true })];
  const deferred = [
    { templateId: "call", title: "CALL", must: true, held: false },
    { templateId: "nap", title: "NAP", must: true, held: true },
    { templateId: "read", title: "READ", must: false, held: false },
  ];
  const d = dailyQuestsOf({ must, deferred });
  eq("one cell per quest asking today, in the lane's order, then a hidden must (not kept); skipped, held and non-musts left out", d.quests.map((q) => `${q.templateId}:${q.kept ? 1 : 0}${q.minimum ? "m" : ""}`), ["gym:1m", "meds:1", "rent:0", "call:0"]);
  eq("kept of total is the lane's count (the minimum counts 1); 1 at minimum; not full; cap 5; none over", [d.kept, d.total, d.minimum, d.full, d.cap, d.over], [2, 4, 1, false, 5, 0]);
  eq("its words", dailyQuestsLabel(d), "Daily quests · 2 of 4 kept · 1 at minimum");
  const html = renderToStaticMarkup(createElement(DailyStrip, { daily: d }));
  check(
    "DailyStrip: an <ol> named in words, a cell per quest with its bit, the minimum marked, each cell named",
    html.startsWith('<ol class="dq-strip" aria-label="Daily quests · 2 of 4 kept · 1 at minimum">') &&
      (html.match(/<li class="dq-cell"/g) ?? []).length === 4 &&
      html.includes('data-bit="1" data-min="" title="GYM: kept at the minimum"') &&
      html.includes('data-bit="0" title="RENT: not kept yet"') &&
      html.includes('<span class="sr-only">MEDS: kept</span>'),
    html.slice(0, 220)
  );
  check("DailyStrip: nothing with no quest today", renderToStaticMarkup(createElement(DailyStrip, { daily: dailyQuestsOf({ must: [] }) })) === "");
  const all = dailyQuestsOf({ must: [row("a", "done"), row("b", "done", { minimum: true })] });
  eq("full: every quest kept, the minimum included", [all.full, all.kept, all.total, dailyQuestsOf({ must: [] }).full], [true, 2, 2, false]);
  const six = dailyQuestsOf({ must: Array.from({ length: 7 }, (_, i) => row(`m${i}`, "open")) });
  eq("a day already over the cap: '2 over the cap'", [six.total, six.over, dailyQuestsLabel(six)], [7, 2, "Daily quests · 0 of 7 kept · 2 over the cap"]);
  // "n over the cap" counts as the cap counts (takesQuestSlotOn), so the chip and the cap never disagree.
  const fiveDailies = Array.from({ length: 5 }, (_, i) => row(`m${i}`, "open"));
  const carried = dailyQuestsOf({ must: [...fiveDailies, row("late", "open", {}, { kind: "TASK", recurrence: null, dueDay: "2026-10-20", dueKind: "DEADLINE" })] });
  eq("a must carried from an earlier day (a deadline gone by) is a cell in the strip, but takes no slot today: none over the cap", [carried.total, carried.over, dailyQuestsLabel(carried)], [6, 0, "Daily quests · 0 of 6 kept"]);
  const withTarget = dailyQuestsOf({ must: [...fiveDailies, row("swim", "open", {}, { recurrence: "TARGET:3/W" })] });
  eq("five dailies and a target must standing: the target takes a slot as the cap counts it, '1 over the cap' (a new one would be saved as an ordinary task, §1)", [withTarget.total, withTarget.over], [6, 1]);
  const withHidden = dailyQuestsOf({ must: fiveDailies, deferred: [{ templateId: "call", title: "CALL", must: true, held: false }] });
  eq("a must due today that a defer hid takes its slot too", [withHidden.total, withHidden.over], [6, 1]);
  check("the lane's name", DAILY_QUESTS_TITLE === "Daily quests");
}

// ═══ §3 The week ══════════════════════════════════════════════════════════

console.log("— §3 the week —");
// Blueprint P11 reconciles the strip with the weekly audit (D15, D16): a make-up was done (kept), a skip and an excused
// day are left out of the count (and shown), not 0.
eq(
  "questOutcomeOf: DONE, DONE_LATE, DONE_MVV and MADE_UP kept; SKIPPED skipped; EXCUSED held; MISSED and WRITTEN_OFF missed; else nothing",
  ["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP", "SKIPPED", "EXCUSED", "MISSED", "WRITTEN_OFF", "UNDONE", "OPEN"].map(questOutcomeOf),
  ["kept", "kept", "kept", "kept", "skipped", "held", "missed", "missed", null, null]
);
eq(
  "questBitOf: kept 1, missed 0; a skip, an excused day and anything else no bit (left out of the count)",
  ["DONE", "DONE_LATE", "DONE_MVV", "EXCUSED", "MISSED", "WRITTEN_OFF", "MADE_UP", "SKIPPED", "UNDONE", "OPEN"].map(questBitOf),
  [1, 1, 1, null, 0, 0, 1, null, null, null]
);
{
  const Q = (id: string, over: Partial<QuestTemplate> = {}): QuestTemplate => ({ ...T(id), title: id, sortOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", ...over });
  const templates: QuestTemplate[] = [
    Q("meds", { sortOrder: 1 }),
    Q("gym", { recurrence: "DOW:1,3,5", sortOrder: 0 }),
    Q("rent", { kind: "TASK", recurrence: null, dueDay: "2026-10-21", dueKind: "DEADLINE", sortOrder: 2 }),
    Q("tax", { kind: "TASK", recurrence: null, dueDay: "2026-10-24", dueKind: "DEADLINE", sortOrder: 3 }),
    // A must until Tuesday ('Not a must' applied from Wednesday): its prior segment says so.
    Q("floss", { compulsory: false, sortOrder: 4, pendingChange: { v: 1, prior: [{ throughDay: "2026-10-20", compulsory: true }] } }),
    Q("plain", { compulsory: false, sortOrder: 5 }),
  ];
  const inst = (templateId: string, day: DayKey, status: string) => ({ templateId, day, status });
  const week = questWeekOf(
    templates,
    [
      inst("meds", "2026-10-19", "DONE"),
      inst("meds", "2026-10-20", "DONE_MVV"),
      inst("meds", "2026-10-21", "DONE"),
      inst("gym", "2026-10-19", "MISSED"),
      inst("gym", "2026-10-21", "DONE_LATE"),
      inst("rent", "2026-10-21", "EXCUSED"),
      inst("tax", "2026-10-18", "DONE"),
      inst("floss", "2026-10-19", "SKIPPED"),
    ],
    TODAY
  );
  eq("the week runs Monday 19 to Sunday 25 October", [week.start, week.days[6]], ["2026-10-19", "2026-10-25"]);
  eq("rows: the musts due on some day of the week, in board order (sortOrder); a non-must left out", week.rows.map((r) => r.templateId), ["gym", "meds", "rent", "tax", "floss"]);
  const cells = Object.fromEntries(week.rows.map((r) => [r.templateId, r.cells.join("")]));
  eq("gym (Mon · Wed · Fri): MISSED 0, DONE_LATE 1, Friday still to come; the other days not due", cells.gym, "0-1-f--");
  eq("meds (daily): DONE 1, DONE_MVV m, DONE 1, today open, the rest to come", cells.meds, "1m1offf");
  eq("rent (a deadline Wednesday): EXCUSED is held (left out of the count), only its day", cells.rent, "--h----");
  eq("tax (a deadline Saturday, done the Sunday before): a one-off done early keeps it, its day still ahead", cells.tax, "-----1-");
  eq("floss (a must through Tuesday): SKIPPED is skipped (left out), Tuesday with nothing and past recording 0, no longer due after", cells.floss, "s0-----");
  eq("counts: kept (the minimum included) of judged; 1 at minimum; 1 skipped, 1 held, 1 open (today's meds)", [week.kept, week.judged, week.minimum, week.skipped, week.held, week.open], [5, 7, 1, 1, 1, 1]);
  const yesterdayOpen = questWeekOf([Q("meds")], [], TODAY).rows[0].cells.join("");
  eq("with nothing recorded, yesterday is still open (the record window), earlier days not kept", yesterdayOpen, "00oofff");
  // The strip agrees with the Full-day Musts ring for a judged day (mustsOfDay: done, the minimum and excused keep a must;
  // the week leaves the excused day out of its count instead, so kept and held together are the ring's).
  const insts = [inst("meds", "2026-10-20", "DONE_MVV"), inst("gym", "2026-10-21", "DONE_LATE"), inst("rent", "2026-10-21", "EXCUSED")];
  const wk = questWeekOf(templates, insts, TODAY);
  const keptOn = (d: DayKey) => wk.rows.filter((r) => ["1", "m", "h"].includes(r.cells[wk.days.indexOf(d)])).length;
  eq("the strip's kept and held on Tue and Wed equal the Musts ring's kept (full-day mustsOfDay)", [keptOn("2026-10-20"), keptOn("2026-10-21")], [mustsOfDay(templates, insts, "2026-10-20").kept, mustsOfDay(templates, insts, "2026-10-21").kept]);
  // A make-up after the restore window (MADE_UP) was done: kept, as the audit counts it.
  eq("MADE_UP keeps the day (the quest was done; the streak still reads it missed, habit.ts)", questWeekOf([Q("meds")], [inst("meds", "2026-10-19", "MADE_UP")], TODAY).rows[0].cells.join(""), "10oofff");
  // Duty's held days (once it is live): a rest day holds a must unless it is kept 'Even on rest days'; a freeze holds every must.
  const held = { restDays: new Set(["2026-10-19"]), freezeDays: new Set(["2026-10-20"]) };
  const heldWeek = questWeekOf([Q("meds"), Q("vitamins", { compulsoryOnRest: true, sortOrder: 1 })], [], TODAY, { held });
  eq(
    "held days: Monday's rest holds meds but not vitamins ('Even on rest days'); Tuesday's freeze holds both; a held day is left out",
    heldWeek.rows.map((r) => r.cells.join("")),
    ["hhoofff", "0hoofff"]
  );
  eq("…counted apart: 3 held, 0 skipped, 1 judged (vitamins on Monday's rest, not kept)", [heldWeek.held, heldWeek.skipped, heldWeek.judged], [3, 0, 1]);
  check("a recorded status still decides a held day first (kept)", questWeekOf([Q("meds")], [inst("meds", "2026-10-19", "DONE")], TODAY, { held }).rows[0].cells[0] === "1");
  // Another week's start (the audit reads the week just ended on Monday): last Sunday is then yesterday, still open.
  const lastWeek = questWeekOf([Q("meds")], [inst("meds", "2026-10-24", "DONE")], "2026-10-26", { start: "2026-10-19" });
  eq("opts.start: last week read on Monday 26 Oct — its Sunday (yesterday) still open, the earlier days 0 unless kept", [lastWeek.start, lastWeek.rows[0].cells.join("")], ["2026-10-19", "000001o"]);
  const html = renderToStaticMarkup(createElement(QuestWeek, { week, today: TODAY }));
  check(
    "QuestWeek: a card titled 'Daily quests · this week' with '5 of 7 kept · 1 at minimum · 1 skipped · 1 held · 1 still open', a table row per must, each cell named",
    html.includes(">Daily quests · this week</h2>") &&
      html.includes('<p class="hh-rule">5 of 7 kept · 1 at minimum · 1 skipped · 1 held · 1 still open</p>') &&
      html.includes('<span class="hh-q" data-q="s" aria-hidden="true"></span><span class="sr-only">skipped, left out</span>') &&
      html.includes('<span class="hh-q" data-q="h" aria-hidden="true"></span><span class="sr-only">held, left out</span>') &&
      (html.match(/<th scope="row" class="hh-q-name">/g) ?? []).length === 5 &&
      html.includes('<span class="hh-q" data-q="m" aria-hidden="true"></span><span class="sr-only">kept at the minimum</span>') &&
      html.includes('title="meds, Tuesday 20 October: kept at the minimum"') &&
      html.includes('data-today=""'),
    html.slice(0, 200)
  );
  check("QuestWeek: nothing when no must falls due this week", renderToStaticMarkup(createElement(QuestWeek, { week: questWeekOf([Q("plain", { compulsory: false })], [], TODAY), today: TODAY })) === "");
  // Early in the week nothing is judged yet (today and yesterday can still be recorded): the line names the open days,
  // never "0 of 0 kept", as the audit's lane line does.
  const two = [Q("meds"), Q("gym", { sortOrder: 1 })];
  const monday = questWeekOf(two, [], "2026-10-19");
  const tuesday = questWeekOf(two, [], "2026-10-20");
  eq(
    "questWeekLine: on Monday with two dailies and nothing ticked, 'Nothing judged yet · 2 still open'; on Tuesday '… 4 still open'",
    [monday.rows.map((r) => r.cells.join("")).join(" "), questWeekLine(monday), tuesday.rows.map((r) => r.cells.join("")).join(" "), questWeekLine(tuesday)],
    ["offffff offffff", "Nothing judged yet · 2 still open", "oofffff oofffff", "Nothing judged yet · 4 still open"]
  );
  eq("questWeekLine: the card's own line (QuestWeek renders it)", questWeekLine(week), "5 of 7 kept · 1 at minimum · 1 skipped · 1 held · 1 still open");
  const css = read("src/components/habits/habits.css").replace(/\/\*[\s\S]*?\*\//g, "");
  check("habits.css: a skipped or held cell is an outline in the strip's hue (the year view's held square)", css.includes('.hh-q:is([data-q="s"], [data-q="h"]) { background: transparent; box-shadow: inset 0 0 0 1px var(--hh-c); }'));
  check(
    "habits.css: an open cell is a faint fill with no outline, as the year grid's open day (an outline is the page legend's 'Held · rest or skip')",
    css.includes('.hh-q[data-q="o"] { background: color-mix(in srgb, var(--hh-c) 20%, transparent); }') && !/\[data-q="o"\][^{]*\{[^}]*box-shadow/.test(css)
  );
}

// ═══ §4 The writes and the toast ═════════════════════════════════════════

console.log("— §4 the writes —");
{
  const tasks = code("src/lib/tasks.ts");
  const insert = tasks.slice(tasks.indexOf("async function insertCapture("), tasks.indexOf("export interface CaptureGoalFields"));
  check(
    "capture: insertCapture counts a would-be must (not an inbox item, not a work tab's) against the standing musts before its one INSERT, and writes compulsory only below the cap",
    /const cap =\s*asMust && !inbox && !boardId\s*\?\s*mustCapOf\(\s*await loadStandingMusts\(userId, opts\.replacing\),/.test(insert) &&
      /const compulsory = asMust && !cap\?\.capped;/.test(insert) &&
      insert.indexOf("mustCapOf(") < insert.indexOf("prisma.taskTemplate\n    .create(") &&
      /\n    compulsory,\n/.test(insert),
    insert.slice(insert.indexOf("const cap ="), insert.indexOf("const cap =") + 160).replace(/\s+/g, " ")
  );
  check("capture: a retried send carries no note (the first send's save stands)", /mustNote: duplicate \? null : mustNoteOf\(cap\)/.test(insert));
  check(
    "the standing musts: the personal Board's live TASK and HABIT musts, never an inbox item, never the row an edit replaces",
    /where: \{ userId, \.\.\.PERSONAL_BOARD, compulsory: true, inbox: false, archivedAt: null, kind: \{ in: \["TASK", "HABIT"\] \}, \.\.\.\(except \? \{ id: \{ not: except \} \} : \{\}\) \}/.test(tasks)
  );
  // Re-pinned for blueprint P31 review: the line's own spans go with it (a work tab's '#side' line is read again with them).
  check("an edit leaves the line it replaces out of the count (recaptureCore: replacing: oldId)", /insertCapture\(userId, parsed, \{ [^}]*replacing: oldId, boardId(?:, reverted: opts\.reverted)? \}\)/.test(tasks));
  const clarify = tasks.slice(tasks.indexOf("export async function clarifyInboxCore("), tasks.indexOf("export interface ClarifyOutcome"));
  check(
    "the board: an inbox must is counted as it leaves the inbox; past the cap it leaves as an ordinary task, written with the clarify, and the outcome says so",
    /row\.compulsory && !row\.boardId && choice !== "idea"\s*\?\s*mustCapOf\(\s*await loadStandingMusts\(userId, templateId\),/.test(clarify) &&
      /const capWrite = mustCap\?\.capped \? \{ compulsory: false \} : \{\};/.test(clarify) &&
      (clarify.match(/\.\.\.pendingChange, \.\.\.capWrite/g) ?? []).length === 6 &&
      /return ok\(\{ href: null, effect: "immediate", effectiveDay: null, \.\.\.\(mustNote \? \{ mustNote \} : \{\}\) \}\);/.test(clarify)
  );
  const board = code("src/components/today/TodayBoard.tsx");
  check("the board says it: a clarified must past the cap is an ordinary task now (mustNoticeOf)", /if \(v\.mustNote\) \{[\s\S]*?setNotice\(mustNoticeOf\(title, v\.mustNote\)\);/.test(board));
  // A must brought back (blueprint P9 review): counted against the standing musts, never demoted, and said on every
  // path that answers an Undo or a Restore.
  const unarchive = tasks.slice(tasks.indexOf("export async function unarchiveCore("), tasks.indexOf("export const ROADMAP_UNARCHIVE_REPLACED"));
  check(
    "unarchive: a must that was archived (on the personal Board, out of the inbox) is counted (mustCapOf over loadStandingMusts, itself left out) after the write, and only noted: no compulsory write",
    /const mustNote = await restoredMustNote\(userId, seen\.row, now\);\s*return ok\(mustNote \? \{ mustNote \} : \{\}\);/.test(unarchive) &&
      /if \(!row \|\| !row\.archivedAt \|\| !row\.compulsory \|\| row\.boardId \|\| row\.inbox \|\| \(row\.kind !== "TASK" && row\.kind !== "HABIT"\)\) return null;/.test(unarchive) &&
      /mustCapOf\(\s*await loadStandingMusts\(userId, row\.id\),/.test(unarchive) &&
      /return restoredMustNoteOf\(cap, today\);/.test(unarchive) &&
      !/compulsory: false/.test(unarchive)
  );
  check(
    "unarchive: the note reaches every Undo and Restore (Today's Archive and decision Undo, the review's Drop Undo, Restore, the roadmap's Undo and pause Undo)",
    /unarchiveTask\(r\.templateId, REFRESH\), \(v\) => \{[\s\S]*?setNotice\(restoredNoticeOf\(r\.title, v\.mustNote\)\);/.test(board) &&
      /undoDecision\(decisionId, REFRESH\), \(v\) => \{[\s\S]*?setNotice\(restoredNoticeOf\(title, v\.mustNote\)\);/.test(board) &&
      /const mustNote = back\.value\?\.mustNote;\s*return ok\(mustNote \? \{ \.\.\.out, mustNote \} : out\);/.test(code("src/lib/task-decisions-server.ts")) &&
      /unarchiveTask\(d\.id, REFRESH\),\s*\(v\) => \{\s*if \(v\.mustNote\) setNotice\(restoredNoticeOf\(d\.title, v\.mustNote\)\);/.test(code("src/components/home/WeekReview.tsx")) &&
      /\{ state: "done", text: res\.value\.mustNote\?\.line \}/.test(code("src/components/home/WeekDecisions.tsx")) &&
      /const note = res\.ok \? mustNoteIn\(res\.value\) : null;\s*if \(note\) pushToast\(\{ title: "Back on Today", body: restoredNoticeOf\(r\.title, note\) \}\);/.test(code("src/components/roadmap/RoadmapView.tsx")) &&
      /const note = r\?\.ok \? mustNoteIn\(r\.value\) : null;/.test(code("src/components/roadmap/ActivityConfirm.tsx"))
  );
  check("the capture action passes the note through (itemOf)", /\.\.\.\(created\.mustNote \? \{ mustNote: created\.mustNote \} : \{\}\),/.test(code("src/app/actions/capture.ts")));

  const item = (over: Partial<CapturedItem> = {}) =>
    ({ id: "t1", title: "Pay the rent", projectedXp: 3, kind: "TASK", doneNow: false, doneNowError: null, duplicate: false, href: null, where: { lane: "planned", label: "Planned" }, ...over }) as CapturedItem;
  const capped = toastCopy(item({ mustNote: { capped: true, line: MUST_CAP_LINE } }));
  eq("toast: a sixth must saved as an ordinary task", [capped.head, capped.body], ["Added (not a Must)", `Pay the rent → Planned · ≈ 3 · ${MUST_CAP_LINE}`]);
  const warned = toastCopy(item({ mustNote: { capped: false, line: "4 of 5 daily quests" } }));
  eq("toast: the 4th says how near the cap it is", [warned.head, warned.body], ["Added", "Pay the rent → Planned · ≈ 3 · 4 of 5 daily quests"]);
  const noDay = toastCopy(item(), { notMust: true });
  eq("toast: a must with no day still reads as before", [noDay.head, noDay.tail], ["Added (not a Must)", NOT_MUST_TAIL]);
  const doneNow = toastCopy(item({ doneNow: true, mustNote: { capped: true, line: MUST_CAP_LINE } }));
  eq("toast: a done-now line past the cap is ticked and says so", [doneNow.head, doneNow.tail], ["Done", MUST_CAP_LINE]);
  check("toast: a retried line says only 'Already saved'", toastCopy(item({ duplicate: true })).tail === null);

  const dq = code("src/lib/daily-quests.ts");
  check("daily-quests.ts reads no price, curve or pay path (XP stays graded) and no Prisma", !/priceTask|planCompletion|life-economy|leveling|xp"|prisma/.test(dq));
  check("tasks.ts's pricing is untouched by the cap: capturedOf still prices with planCompletion as before", /projectedXp: row\.boardId \? 0 : planCompletion\(\{ template: t, day: a\.today, today: a\.today, slot: 0, ledger: ledgerOf\(a\.today, a\.totals, a\.events\), streakDays: 0 \}\)\.receipt\.xp,/.test(tasks));
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  // Blueprint P11: week-audit-check (the weekly audit, on this check's week rule) follows it; P12: audit-decay-check
  // (the audit's decay and delivery) after that, before the rituals.
  check(
    // Re-pinned for blueprint P28: skill-decay-check runs after audit-decay-check, before the rituals; for P29:
    // streak-mult-check right after it; for P30: review-fatigue-check right after that; for P31: side-quests-check; and
    // for P32: calibration-check right after it.
    "package.json: life:check runs this check right after duty-actions-check, then week-audit-check, audit-decay-check, skill-decay-check, streak-mult-check, review-fatigue-check, side-quests-check and calibration-check; daily-quests:check runs it alone",
    pkg.scripts["life:check"].includes("tsx scripts/duty-actions-check.ts && tsx scripts/daily-quests-check.ts && tsx scripts/week-audit-check.ts && tsx scripts/audit-decay-check.ts && tsx scripts/skill-decay-check.ts && tsx scripts/streak-mult-check.ts && tsx scripts/review-fatigue-check.ts && tsx scripts/side-quests-check.ts && tsx scripts/calibration-check.ts && tsx scripts/rituals-check.ts") &&
      pkg.scripts["daily-quests:check"] === "tsx scripts/daily-quests-check.ts"
  );
}

console.log(`\ndaily-quests-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
