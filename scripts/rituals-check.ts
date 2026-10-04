/**
 * rituals-check: M2 lane E (docs/life-plan/m2-refit.md F13, F14, F15) on
 * fixed cases. Pure: no database, no server, no clock (every instant is
 * built from a Sydney wall time), no model.
 *
 *   §1 reviewedWeek on each weekday, at 03:59 and 04:00 on Saturday, Monday
 *      and Thursday, and across the 2026-10-04 and 2027-04-04 DST switches;
 *      the marker key uses it; when the review is offered; how it ends.
 *   §2 the week's facts: 'settled through' labelling, a day counted only
 *      when duty-economy settledFor holds (nothing past the cursor or before
 *      the first judged day, even with a launch cursor set ahead of the
 *      launch), made up counts as kept late, excused and the minimum as held
 *      (a late minimum by dueDay + 2 too), TARGET units once the week is
 *      settled and only when a must on both its Monday and Sunday, held per
 *      day under that day's rule, Duty XP 'of which −12.5 debt', and never a
 *      verdict for an unjudged week (the week card shows a held track as
 *      Held).
 *   §3 the reflection and the review marker: REFLECTION, sink NONE, xp 0,
 *      countsForStreak false; the note and mood rules; the day it may be for.
 *   §4 capture: the Must chip's stake ('≈ −' + debtFor live, 'stakes from
 *      Mon 12 Oct' before) and the '?' + '!' note.
 *   §5 copy: the pre-launch notice, the lag line, step 5's days and the rest
 *      cap, the tour's Today step once Duty is live, and source guards on
 *      the pages and actions this lane wires.
 *
 *   npx tsx scripts/rituals-check.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, todayKey, zonedToInstant, type DayKey } from "../src/lib/life-day";
import {
  MAKEUP_RESTORE_DAYS,
  REST_PER_WEEK,
  WEEK_REVIEW_DETAIL,
  reflectionKey,
  settledFor,
  weekReviewKey,
  type RestKind,
} from "../src/lib/duty-economy";
import type { RestRow } from "../src/lib/duty-rule";
import { debtFor } from "../src/lib/life-grade";
import { sizeLexically } from "../src/lib/life-lexicon";
import { parseCapture } from "../src/lib/capture-parse";
import { countsForStreakOf } from "../src/lib/streak-curve";
import {
  DAY_EDGE,
  MOOD_MAX,
  MOOD_MIN,
  REFLECTION_NOTE_MAX,
  REVIEW_LAST_STEP,
  dayMonthLabel,
  dutyPhaseOf,
  dutySettledLine,
  dutyStandingOf,
  dutyXpLine,
  formatDebt,
  isMood,
  mustTallyLine,
  nextWeekDays,
  normaliseReflectionNote,
  owedFromLine,
  parseReviewStep,
  preLaunchNotice,
  reflectionDayAllowed,
  reflectionEventInput,
  reflectionNonce,
  restRefusalOf,
  reviewEndOf,
  reviewPendingText,
  reviewedWeek,
  stakesFromLine,
  weekFactsOf,
  weekReviewEventInput,
  weekReviewOffered,
  weekReviewProgressKey,
  weekdayDateLabel,
  type WeekFactsInput,
  type WeekFactsInstance,
  type WeekFactsRow,
  type WeekFactsTemplate,
} from "../src/lib/rituals";
import { INBOX_MUST_NOTE, inboxMustNote, mustStakeLabel } from "../src/components/capture/capture-ui";
import { TODAY_COPY, TODAY_DUTY_COPY, copyText, tourSteps } from "../src/components/tour/tour-steps";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Source without comments, so a guard never trips on prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const TZ = "Australia/Sydney";
/** A Sydney wall time as an instant ('2026-10-17', 3, 59). */
function at(day: DayKey, h: number, m = 0): Date {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(zonedToInstant(y, mo, d, h, TZ).getTime() + m * 60_000);
}
const reviewAt = (day: DayKey, h: number, m = 0) => reviewedWeek(todayKey(at(day, h, m), TZ))?.weekKey ?? null;

// ── §1 The reviewed week (decision 26) ─────────────────────────────────────
console.log("── §1 reviewedWeek");
{
  // Week of Mon 5 Oct 2026 is 2026-W41; of Mon 12 Oct, 2026-W42.
  const byDay: [DayKey, string, string | null][] = [
    ["2026-10-12", "Monday", "2026-W41"],
    ["2026-10-13", "Tuesday", "2026-W41"],
    ["2026-10-14", "Wednesday", "2026-W41"],
    ["2026-10-15", "Thursday", null],
    ["2026-10-16", "Friday", null],
    ["2026-10-17", "Saturday", "2026-W42"],
    ["2026-10-18", "Sunday", "2026-W42"],
  ];
  for (const [day, name, want] of byDay) eq(`${name} ${day} reviews ${want ?? "nothing"}`, reviewedWeek(day)?.weekKey ?? null, want);
  const sat = reviewedWeek("2026-10-17")!;
  eq("Saturday: the week holding today, Mon 12 – Sun 18 Oct, judged Wed 21 Oct", [sat.monday, sat.sunday, sat.judgeDay], ["2026-10-12", "2026-10-18", "2026-10-21"]);
  const mon = reviewedWeek("2026-10-12")!;
  eq("Monday: the week just ended, Mon 5 – Sun 11 Oct, judged Wed 14 Oct", [mon.monday, mon.sunday, mon.judgeDay], ["2026-10-05", "2026-10-11", "2026-10-14"]);

  eq("Saturday 03:59 is still Friday: nothing under review", reviewAt("2026-10-17", 3, 59), null);
  eq("Saturday 04:00: the week holding it", reviewAt("2026-10-17", 4), "2026-W42");
  eq("Monday 03:59 is still Sunday: the week holding Sunday", reviewAt("2026-10-19", 3, 59), "2026-W42");
  eq("Monday 04:00: the week just ended, the same week (the marker survives the Monday edge)", reviewAt("2026-10-19", 4), "2026-W42");
  eq("Thursday 03:59 is still Wednesday: the week before", reviewAt("2026-10-15", 3, 59), "2026-W41");
  eq("Thursday 04:00: the window has closed", reviewAt("2026-10-15", 4), null);
  // DST began Sun 4 Oct 2026 at 02:00 AEST (to 03:00 AEDT); it ends Sun 4 Apr 2027 at 03:00 AEDT (to 02:00 AEST).
  eq("DST start: Sun 4 Oct 03:59 AEDT is still Saturday 3 Oct (2026-W40)", [todayKey(at("2026-10-04", 3, 59), TZ), reviewAt("2026-10-04", 3, 59)], ["2026-10-03", "2026-W40"]);
  eq("DST start: Sun 4 Oct 04:00 is Sunday, the same week", [todayKey(at("2026-10-04", 4), TZ), reviewAt("2026-10-04", 4)], ["2026-10-04", "2026-W40"]);
  eq("DST start: Mon 5 Oct 03:59 and 04:00 both review 2026-W40", [reviewAt("2026-10-05", 3, 59), reviewAt("2026-10-05", 4)], ["2026-W40", "2026-W40"]);
  eq("DST end: Sun 4 Apr 2027 03:59 AEST is still Saturday; 04:00 is Sunday; both 2027-W13", [todayKey(at("2027-04-04", 3, 59), TZ), todayKey(at("2027-04-04", 4), TZ), reviewAt("2027-04-04", 3, 59), reviewAt("2027-04-04", 4)], ["2027-04-03", "2027-04-04", "2027-W13", "2027-W13"]);
  eq("DST end: Thu 8 Apr 2027 04:00 closes the window", reviewAt("2027-04-08", 4), null);

  // The marker uses reviewedWeek, whatever day of its window the review is done on.
  const marks = ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"].map((d) => weekReviewEventInput({ weekKey: reviewedWeek(d)!.weekKey, day: d, now: at(d, 9) }).dedupeKey);
  eq("marker: Sat to Wed of one window write one key, 'week-review:2026-W42'", [...new Set(marks)], [weekReviewKey("2026-W42")]);
  eq("marker: the key is lane 0's builder", weekReviewKey("2026-W42"), "week-review:2026-W42");

  check("offered: live, in the window, unmarked", weekReviewOffered("2026-10-17", true, false));
  check("offered: never once marked, never before launch, never Thursday or Friday", !weekReviewOffered("2026-10-17", true, true) && !weekReviewOffered("2026-10-17", false, false) && !weekReviewOffered("2026-10-15", true, false) && !weekReviewOffered("2026-10-16", true, false));
  eq("end: not judged → no verdict, when it is judged", reviewEndOf(sat, false), { kind: "pending", text: "The week of 12 Oct is judged Wednesday; its card will show on Today" });
  eq("end: the spec's own example (week of 5 Oct)", reviewPendingText(mon), "The week of 5 Oct is judged Wednesday; its card will show on Today");
  eq("end: judged → the week card", reviewEndOf(mon, true), { kind: "card" });
  eq("progress: a step is kept per week", weekReviewProgressKey("2026-W42"), "week-review:2026-W42:step");
  eq("progress: stored steps clamp to 1..6; anything unreadable is 1", ["3", "0", "9", "x", null, "2.5"].map((r) => parseReviewStep(r)), [3, 1, REVIEW_LAST_STEP, 1, 1, 1]);
}

// ── §2 The week's facts (F14 step 1) ───────────────────────────────────────
console.log("\n── §2 The week as far as it is settled");
{
  const week = reviewedWeek("2026-10-17")!; // Mon 12 – Sun 18 Oct
  const tpl = (id: string, over: Partial<WeekFactsTemplate>): WeekFactsTemplate => ({
    id,
    title: id,
    kind: "HABIT",
    recurrence: "DAILY",
    startDay: "2026-10-01",
    dueDay: null,
    dueKind: null,
    compulsory: true,
    compulsoryOnRest: false,
    inbox: false,
    archivedDay: null,
    pendingChange: null,
    ...over,
  });
  const templates: WeekFactsTemplate[] = [
    tpl("meds", {}),
    tpl("gym", { recurrence: "DOW:1,3,5" }),
    tpl("rent", { kind: "TASK", recurrence: null, dueDay: "2026-10-14", dueKind: "DEADLINE" }),
    tpl("report", { kind: "TASK", recurrence: null, dueDay: "2026-10-13", dueKind: "DEADLINE" }),
    tpl("inbox-must", { inbox: true }),
    tpl("habit", { compulsory: false }),
    tpl("target", { recurrence: "TARGET:3/W" }),
  ];
  const inst = (templateId: string, day: DayKey, status: string, slot = 0, repaired = false): WeekFactsInstance => ({ templateId, day, slot, status, repaired });
  const instances: WeekFactsInstance[] = [
    inst("meds", "2026-10-12", "DONE"),
    inst("meds", "2026-10-13", "DONE_LATE", 0, true), // made up inside the window: kept late
    inst("meds", "2026-10-14", "MADE_UP"), // made up late: still kept late in the review
    inst("meds", "2026-10-15", "EXCUSED"), // a rest day: held
    inst("meds", "2026-10-16", "MISSED"),
    inst("meds", "2026-10-17", "MISSED"), // after a Friday cursor: never counted
    inst("meds", "2026-10-18", "DONE"),
    inst("gym", "2026-10-12", "DONE_MVV"), // the minimum: held
    inst("gym", "2026-10-14", "DONE"),
    // gym on Fri 16: nothing recorded on a settled day reads missed
    inst("rent", "2026-10-15", "DONE_LATE"), // due Wed, done Thu: late, inside dueDay + 2
    inst("report", "2026-10-12", "DONE"), // due Tue, done Mon: kept
    inst("target", "2026-10-13", "DONE"),
    inst("target", "2026-10-15", "DONE"),
    inst("target", "2026-10-18", "MADE_UP", 1), // the unit short, made up late
    inst("habit", "2026-10-16", "MISSED"), // not a must: never counted
  ];
  const row = (day: DayKey, source: string, over: Partial<WeekFactsRow> = {}): WeekFactsRow => ({ day, source, sink: "NONE", track: null, xp: 0, countsForStreak: false, ...over });
  const rows: WeekFactsRow[] = [
    row("2026-10-12", "TASK", { sink: "TRACK", track: "DUTY", xp: 4.7, countsForStreak: true }),
    row("2026-10-13", "TASK", { sink: "TRACK", track: "DUTY", xp: 3.5, countsForStreak: true }),
    row("2026-10-14", "TASK", { sink: "TRACK", track: "DUTY", xp: 5, countsForStreak: true }),
    row("2026-10-14", "UNDO", { sink: "TRACK", track: "DUTY", xp: -5 }), // ticked and undone: not a day shown up
    row("2026-10-14", "DEBT_REPAID", { sink: "TRACK", track: "DUTY", xp: 4.2 }),
    row("2026-10-16", "TASK", { sink: "TRACK", track: "CRAFT", xp: 10, countsForStreak: true }),
    row("2026-10-16", "DEBT", { sink: "TRACK", track: "DUTY", xp: -4.2 }),
    row("2026-10-16", "DEBT", { sink: "TRACK", track: "DUTY", xp: -8.3 }),
    row("2026-10-17", "DEBT", { sink: "TRACK", track: "DUTY", xp: -4.2 }), // after a Friday cursor
  ];
  const restRows: RestRow[] = [
    { day: "2026-10-15", kind: "REST", declaredAt: at("2026-10-14", 20), cancelledAt: null },
    { day: "2026-10-16", kind: "REST", declaredAt: at("2026-10-16", 9), cancelledAt: null }, // declared after its day started: ignored
  ];
  const base: WeekFactsInput = { week, cursor: "2026-10-16", firstDutyDay: "2026-10-12", templates, instances, rows, restRows };

  const f = weekFactsOf(base);
  eq("settled through Fri: the label, the span and five days", [f.label, f.from, f.through, f.complete, f.days], ["settled through Fri", "2026-10-12", "2026-10-16", false, 5]);
  eq("days: Mon, Tue and Fri shown up (Wed's tick was undone); Thu held by a rest declared the day before; Fri's late rest ignored", [f.shownUp, f.held, f.freezesUsed], [3, 1, 0]);
  eq("musts: made up counts as kept late, excused and the minimum as held, nothing past the cursor", f.musts, { kept: 3, late: 3, held: 2, missed: 2, total: 10, pct: 75 });
  eq("musts: in words", mustTallyLine(f.musts), "6 of 8 musts kept (3 late) · 2 held · 2 missed · 75%");
  eq("Duty XP: Σ Duty rows in the span (Craft ignored, Saturday's debt not yet), of which debt", [f.dutyXp, f.debtXp, dutyXpLine(f)], [-0.1, -12.5, "Duty XP −0.1 · of which −12.5 debt"]);
  eq("Duty XP: no debt, no 'of which'", dutyXpLine({ dutyXp: 34.2, debtXp: 0 }), "Duty XP +34.2");

  const whole = weekFactsOf({ ...base, cursor: "2026-10-18" });
  eq("settled through Sun: complete, seven days", [whole.label, whole.complete, whole.days], ["settled through Sun", true, 7]);
  eq("complete: Sat's miss and Sun's tick count; the weekly TARGET counts its units (2 kept, the made-up unit late)", whole.musts, { kept: 6, late: 4, held: 2, missed: 3, total: 15, pct: 77 });
  eq("complete: the inbox must and the non-compulsory habit are never musts", whole.musts.total, 15);
  const later = weekFactsOf({ ...base, cursor: "2026-10-25" });
  eq("a cursor past Sunday counts the week only", [later.through, later.days, later.musts.total], ["2026-10-18", 7, 15]);

  const none = weekFactsOf({ ...base, cursor: null });
  eq("no cursor: nothing settled, nothing counted", [none.label, none.through, none.days, none.musts.total, none.dutyXp], ["nothing settled yet", null, 0, 0, 0]);
  const early = weekFactsOf({ ...base, cursor: "2026-10-11" });
  eq("cursor before the Monday: nothing settled yet", [early.label, early.through], ["nothing settled yet", null]);
  const before = weekFactsOf({ ...base, cursor: "2026-10-25", firstDutyDay: "2026-10-19" });
  eq("a week before the first judged day: before Duty started, nothing counted", [before.label, before.through, before.musts.total], ["before Duty started", null, 0]);
  const noLaunch = weekFactsOf({ ...base, firstDutyDay: null });
  eq("no launch day: nothing counted", [noLaunch.through, noLaunch.musts.total], [null, 0]);
  const midWeek = weekFactsOf({ ...base, firstDutyDay: "2026-10-14" });
  eq("an epoch mid-week: Mon and Tue are never counted", [midWeek.from, midWeek.days, midWeek.musts.total, midWeek.shownUp], ["2026-10-14", 3, 6, 1]);
  const midWhole = weekFactsOf({ ...base, firstDutyDay: "2026-10-14", cursor: "2026-10-18" });
  eq("an epoch mid-week: Wed to Sun only, and the weekly TARGET is not judged on part of a week", midWhole.musts, { kept: 2, late: 2, held: 1, missed: 3, total: 8, pct: 57 });

  const freeze = weekFactsOf({ ...base, rows: [...rows, row("2026-10-16", "FREEZE_USE")], cursor: "2026-10-16" });
  eq("a freeze used is counted (Fri is active anyway, so not held)", [freeze.freezesUsed, freeze.held], [1, 1]);
  const lateDeadline = weekFactsOf({ ...base, instances: [...instances.filter((i) => i.templateId !== "rent"), inst("rent", "2026-10-14", "MISSED"), inst("rent", "2026-10-17", "DONE_LATE")] });
  check("a deadline done after dueDay + 2 is not late: the MISSED on its day stands", lateDeadline.musts.missed === 3 && lateDeadline.musts.late === 2, JSON.stringify(lateDeadline.musts));
  const madeUpDeadline = weekFactsOf({ ...base, instances: [...instances.filter((i) => i.templateId !== "rent"), inst("rent", "2026-10-14", "MADE_UP")] });
  check("a debited deadline made up from its card counts kept late", madeUpDeadline.musts.late === 3 && madeUpDeadline.musts.missed === 2, JSON.stringify(madeUpDeadline.musts));
  const undone = weekFactsOf({ ...base, instances: [...instances, inst("gym", "2026-10-16", "UNDONE")] });
  check("an UNDONE row reads as absent (Fri's gym stays missed)", undone.musts.missed === 2, JSON.stringify(undone.musts));

  // The one settled-day rule (duty-economy settledFor; the lead's review blocker): a day is counted
  // exactly when settledFor(day, cursor, firstDutyDay) holds, whatever the cursor and the floor.
  {
    const weekDays: DayKey[] = Array.from({ length: 7 }, (_, i) => addDays(week.monday, i));
    const cursors: (DayKey | null)[] = [null, "2026-10-04", "2026-10-11", "2026-10-12", "2026-10-14", "2026-10-18", "2026-10-25"];
    const floors: (DayKey | null)[] = ["2026-10-05", "2026-10-12", "2026-10-14", "2026-10-19"];
    const bad: string[] = [];
    for (const cursor of cursors) {
      for (const floor of floors) {
        const ff = weekFactsOf({ ...base, cursor, firstDutyDay: floor });
        const want = weekDays.filter((d) => settledFor(d, cursor, floor));
        const through = ff.through;
        const got = through == null ? [] : weekDays.filter((d) => d >= ff.from && d <= through);
        if (JSON.stringify(got) !== JSON.stringify(want) || ff.days !== want.length) bad.push(`${cursor}/${floor}: got ${got.join(",")}, want ${want.join(",")}`);
      }
    }
    check(`settledFor: the counted days are exactly settledFor's, over ${cursors.length * floors.length} cursor/floor pairs`, bad.length === 0, bad.join("; "));
    // The launch script may set the cursor to firstDutyDay − 1 before the launch: no day before the launch reads settled.
    const launchWeek = reviewedWeek("2026-10-10")!; // Sat 10 Oct: the week of 5 Oct, before a Mon 12 Oct launch
    const ahead = weekFactsOf({ ...base, week: launchWeek, cursor: "2026-10-11", firstDutyDay: "2026-10-12" });
    eq("a launch cursor set ahead (Sun 11 Oct) settles no pre-launch day: the week of 5 Oct is before Duty started", [ahead.label, ahead.through, ahead.days, ahead.musts.total], ["before Duty started", null, 0, 0]);
    const launchMon = weekFactsOf({ ...base, cursor: "2026-10-11", firstDutyDay: "2026-10-12" });
    eq("on the launch week with the cursor at launch − 1: nothing settled yet", [launchMon.label, launchMon.through, launchMon.days], ["nothing settled yet", null, 0]);
  }

  // A deadline one-off's minimum done late (decision 18: 'whichever path recorded it'): held by dueDay + 2, as
  // the judge's HOLDS and settlement (which charges nothing for a DONE_MVV) read it; later, missed.
  {
    const only = (extra: WeekFactsInstance[]) => weekFactsOf({ ...base, cursor: "2026-10-18", instances: [...instances.filter((i) => i.templateId !== "rent"), ...extra] });
    const onTime = whole.musts;
    const mvvThu = only([inst("rent", "2026-10-15", "DONE_MVV")]).musts;
    const mvvFri = only([inst("rent", "2026-10-16", "DONE_MVV")]).musts;
    const mvvSat = only([inst("rent", "2026-10-17", "DONE_MVV")]).musts;
    eq("late minimum: due Wed, its minimum on Thu (due + 1) is held", [mvvThu.held - onTime.held, mvvThu.late - onTime.late, mvvThu.missed - onTime.missed], [1, -1, 0]);
    eq("late minimum: on Fri (due + 2) still held", [mvvFri.held - onTime.held, mvvFri.missed - onTime.missed], [1, 0]);
    eq("late minimum: on Sat (due + 3) it no longer counts: missed", [mvvSat.held - onTime.held, mvvSat.missed - onTime.missed], [0, 1]);
  }

  // Weekly TARGET musts read the judge's rule: a must on both Monday and Sunday (decision 16), held per day.
  {
    const gymT = (over: Partial<WeekFactsTemplate>) => tpl("gymT", { recurrence: "TARGET:3/W", ...over });
    const one = (t: WeekFactsTemplate, extra: WeekFactsInstance[], rest: RestRow[] = []) =>
      weekFactsOf({ week, cursor: "2026-10-18", firstDutyDay: "2026-10-12", templates: [t], instances: extra, rows: [], restRows: rest });
    const strengthened = one(gymT({ pendingChange: { v: 1, prior: [{ throughDay: "2026-10-14", compulsory: false }] } }), [inst("gymT", "2026-10-17", "DONE")]);
    eq("TARGET strengthened mid-week (not a must on Monday): not judged that week, never retroactive", strengthened.musts.total, 0);
    const weakened = one(gymT({ compulsory: false, pendingChange: { v: 1, prior: [{ throughDay: "2026-10-16", compulsory: true }] } }), [inst("gymT", "2026-10-17", "DONE")]);
    eq("TARGET weakened before Sunday (no longer a must on Sunday): not judged", weakened.musts.total, 0);
    const steady = one(gymT({}), [inst("gymT", "2026-10-17", "DONE")]);
    eq("TARGET a must all week: 3 units, 1 kept, 2 missed", [steady.musts.kept, steady.musts.held, steady.musts.missed], [1, 0, 2]);
    const restMonTue: RestRow[] = [
      { day: "2026-10-12", kind: "REST", declaredAt: at("2026-10-11", 20), cancelledAt: null },
      { day: "2026-10-13", kind: "REST", declaredAt: at("2026-10-11", 20), cancelledAt: null },
    ];
    const onRestFromWed = one(gymT({ compulsoryOnRest: true, pendingChange: { v: 1, prior: [{ throughDay: "2026-10-13", compulsoryOnRest: false }] } }), [inst("gymT", "2026-10-16", "DONE")], restMonTue);
    eq("TARGET: rest on Mon and Tue, 'Even on rest days' only from Wed: both rest days hold (1 kept, 2 held, none missed)", [onRestFromWed.musts.kept, onRestFromWed.musts.held, onRestFromWed.musts.missed], [1, 2, 0]);
    const onRestAllWeek = one(gymT({ compulsoryOnRest: true }), [inst("gymT", "2026-10-16", "DONE")], restMonTue);
    eq("TARGET 'Even on rest days' all week: rest days hold nothing (1 kept, 2 missed)", [onRestAllWeek.musts.kept, onRestAllWeek.musts.held, onRestAllWeek.musts.missed], [1, 0, 2]);
  }

  // A held day with no instance (settlement writes EXCUSED there; the fallback agrees with the judge's): held,
  // except for an 'Even on rest days' must, which a rest day never holds.
  {
    const restThu: RestRow[] = [{ day: "2026-10-15", kind: "REST", declaredAt: at("2026-10-14", 20), cancelledAt: null }];
    const daily = (over: Partial<WeekFactsTemplate>) =>
      weekFactsOf({ week, cursor: "2026-10-15", firstDutyDay: "2026-10-12", templates: [tpl("pills", over)], instances: [], rows: [], restRows: restThu }).musts;
    eq("held fallback: a daily must on a rest day with nothing recorded is held (Mon–Wed missed)", [daily({}).held, daily({}).missed], [1, 3]);
    eq("held fallback: an 'Even on rest days' must is not held by rest", [daily({ compulsoryOnRest: true }).held, daily({ compulsoryOnRest: true }).missed], [0, 4]);
    const frozen = weekFactsOf({ week, cursor: "2026-10-15", firstDutyDay: "2026-10-12", templates: [tpl("pills", { compulsoryOnRest: true })], instances: [], rows: [row("2026-10-15", "FREEZE_USE")], restRows: restThu });
    eq("held fallback: a freeze holds even an 'Even on rest days' must", [frozen.musts.held, frozen.musts.missed], [1, 3]);
    const missedOnRest = weekFactsOf({ week, cursor: "2026-10-15", firstDutyDay: "2026-10-12", templates: [tpl("pills", {})], instances: [inst("pills", "2026-10-15", "MISSED")], rows: [], restRows: restThu });
    eq("held fallback: a recorded MISSED is never turned into held", [missedOnRest.musts.held, missedOnRest.musts.missed], [0, 4]);
  }

  // Never a verdict: the facts carry no kept/not-kept mark, and the page shows none for an unjudged week.
  check("no verdict: WeekFacts has no kept, held or verdict field", !["kept", "held_week", "verdict", "mark"].some((k) => k in f) && !/Not kept|"Kept"/.test(JSON.stringify(f)));
  const page = code(read("src/app/today/week/page.tsx"));
  const stepOne = page.slice(page.indexOf("function StepOne("), page.indexOf("function weekCardOf("));
  check("no verdict: step 1 renders no Kept/Not kept chip of its own (only the judged week's card)", stepOne.length > 200 && !/<Chip\b/.test(stepOne) && !/"(Kept|Not kept)"/.test(stepOne) && /<LastWeekCard week=\{lastWeek\}/.test(stepOne));
  check("no verdict: the run ends on the week card only when the judge has written every track of that week", /ledger && life\.judgedWeeks\.includes\(review\.weekKey\) \? weekCardOf\(ledger, review\) : null/.test(page) && /end=\{card \? \{ kind: "card", card \} : \{ kind: "pending", text: reviewPendingText\(review\) \}\}/.test(page));
  check("settled-through labelling: step 1's eyebrow is the facts' label", /The week of \{dayMonthLabel\(w\.monday\)\} · \{facts\.label\}/.test(stepOne));
  check("week card: a held track is passed through as held (weekMarkOf), never dropped", /kept: r\.kept, held: r\.held \}/.test(page));
  const runner = code(read("src/components/today/m2/WeekRunner.tsx"));
  check(
    "week card: a held track renders a Held chip (tone held, with its hatch) and the heading adds '· n held', never 'not kept'",
    /!t\.kept && t\.held \? \(\s*<Chip key=\{t\.name\} tone="held" held="rest"/.test(runner) && /tracks kept\$\{held > 0 \? ` · \$\{held\} held` : ""\}/.test(runner)
  );
  check("last week: the heading adds '· n held' when a track's week was held", /\{held > 0 && ` · \$\{held\} held`\}/.test(page));

  eq("standing: '31 in a row · Established'", dutyStandingOf({ streak: { kept: 31, days: 31, held: 0, unit: "occurrence", lastKept: "2026-10-16" }, strength: 0.7 }), "31 in a row · Established");
  eq("standing: weeks, with held", dutyStandingOf({ streak: { kept: 4, days: 28, held: 1, unit: "week", lastKept: null }, strength: 0.3 }), "4 weeks in a row, 1 held · Forming");
}

// ── §3 Reflection and the review marker (F13, F14) ─────────────────────────
console.log("\n── §3 Reflection");
{
  const now = at("2026-10-14", 21, 30);
  const r = reflectionEventInput({ day: "2026-10-14", note: "  Long day.\nGood run. ", mood: 4, nonce: "abc123", now });
  eq("reflection: REFLECTION, sink NONE, xp 0, rawXp null, never for the streak", [r.source, r.sink, r.xp, r.rawXp, r.countsForStreak, r.track], ["REFLECTION", "NONE", 0, null, false, null]);
  eq("reflection: the mood is qty, the note one line in detail, the key 'reflection:<d>:<nonce>'", [r.qty, r.detail, r.dedupeKey, r.day], [4, "Long day. Good run.", reflectionKey("2026-10-14", "abc123"), "2026-10-14"]);
  check("reflection: the ledger writer agrees it never counts for the streak", countsForStreakOf("REFLECTION", true) === false && countsForStreakOf(r.source, r.countsForStreak) === false);
  eq("reflection: no mood and no note store nulls", [reflectionEventInput({ day: "2026-10-14", note: "   ", mood: null, nonce: "n1", now }).qty, reflectionEventInput({ day: "2026-10-14", note: "   ", mood: null, nonce: "n1", now }).detail], [null, null]);
  eq("reflection: an out-of-range mood is dropped, never clamped into a grade", reflectionEventInput({ day: "2026-10-14", note: "x", mood: 9, nonce: "n2", now }).qty, null);
  eq("mood: 1 to 5, whole", [MOOD_MIN, MOOD_MAX, [0, 1, 3, 5, 6, 2.5, Number.NaN].map(isMood)], [1, 5, [false, true, true, true, false, false, false]]);
  eq("note: cut to its maximum", normaliseReflectionNote("a".repeat(REFLECTION_NOTE_MAX + 40)).length, REFLECTION_NOTE_MAX);
  eq("note: a non-string is empty", normaliseReflectionNote(42), "");
  eq("day: today, or yesterday (a sheet opened before 04:00), never older or later", ["2026-10-14", "2026-10-13", "2026-10-12", "2026-10-15"].map((d) => reflectionDayAllowed(d, "2026-10-14")), [true, true, false, false]);
  eq("nonce: the caller's op id, else the instant in base 36 (never random)", [reflectionNonce(now, "op-123456"), reflectionNonce(now, "bad id!"), reflectionNonce(now)], ["op-123456", now.getTime().toString(36), now.getTime().toString(36)]);
  check("later save supersedes: two saves are two rows with two keys (append-only)", reflectionEventInput({ day: "2026-10-14", note: "a", mood: 3, nonce: reflectionNonce(now), now }).dedupeKey !== reflectionEventInput({ day: "2026-10-14", note: "b", mood: 3, nonce: reflectionNonce(new Date(now.getTime() + 1000)), now }).dedupeKey);
  const m = weekReviewEventInput({ weekKey: "2026-W42", day: "2026-10-17", now });
  eq("marker: REFLECTION 'week review', sink NONE, xp 0, never for the streak, dated the day it was done", [m.source, m.sink, m.xp, m.countsForStreak, m.detail, m.day, m.dedupeKey], ["REFLECTION", "NONE", 0, false, WEEK_REVIEW_DETAIL, "2026-10-17", "week-review:2026-W42"]);

  const actions = read("src/app/actions/rituals.ts");
  const body = code(actions);
  check("actions: 'use server' first, and only async functions are exported", /^"use server";/.test(actions) && !/export (const|let|function(?!\s*\*)|class)\b(?! async)/.test(body.replace(/export async function/g, "")));
  check("actions: saveReflection writes reflectionEventInput through the idempotent recordActivity, for today or yesterday only", /recordActivity\(userId, input\)/.test(body) && /reflectionEventInput\(\{/.test(body) && /reflectionDayAllowed\(day, todayKey\(now\)\)/.test(body));
  check("actions: markWeekReviewed keys reviewedWeek(today) on the server, refused before launch", /isDutyLaunched\(today\)/.test(body) && /reviewedWeek\(today\)/.test(body) && /weekReviewEventInput\(\{ weekKey: week\.weekKey, day: today, now \}\)/.test(body));
  check(
    "actions: setDebtWriteOff only delegates to lane C's one action (actions/duty.ts; its core spreads newLifeSettingsData) and writes nothing itself",
    /import \{ setDebtWriteOff as setDebtWriteOffAction[^}]*\} from "\.\/duty";/.test(body) &&
      /export async function setDebtWriteOff\(on: boolean, opts\?: DutyActionOptions\): Promise<DutyActionResult<\{ debtWriteOff: boolean \}>> \{\s*return setDebtWriteOffAction\(on, opts\);\s*\}/.test(body) &&
      !/prisma\./.test(body)
  );
  const dutyActions = code(read("src/app/actions/duty.ts"));
  check("actions: the one writer is actions/duty.ts setDebtWriteOff → setDebtWriteOffCore", /export async function setDebtWriteOff\(on: boolean[\s\S]*?setDebtWriteOffCore\(userId, on\)/.test(dutyActions));
}

// ── §4 Capture: the Must chip's stake and the Inbox must (decisions 29, 31) ─
console.log("\n── §4 Capture");
{
  const TODAY = "2026-10-14";
  const LAUNCH = "2026-10-12";
  const line = "wash dishes daily !";
  const parsed = parseCapture(line, { today: TODAY });
  const sizing = sizeLexically(parsed.title, { tagTrack: parsed.track, minutes: parsed.estMinutes });
  const grade = { band: sizing.band, machineMinutes: sizing.machineMinutes, estMinutes: parsed.estMinutes ?? sizing.machineMinutes };
  const debt = debtFor({ ...grade, bandOverride: 0 });
  check("fixture: 'wash dishes daily !' is a scheduled must, Intro 15 min (the dishes golden 4.2)", parsed.compulsory && !parsed.inbox && sizing.band === "INTRO" && grade.estMinutes === 15 && debt === 4.2, `${parsed.compulsory} ${sizing.band} ${grade.estMinutes} ${debt}`);
  eq("live: 'Must · ≈ −' + debtFor + ' if missed'", mustStakeLabel(parsed, grade, { today: TODAY, launchDay: LAUNCH }), `Must · ≈ −${formatDebt(debt)} if missed`);
  eq("live: the dishes chip reads 'Must · ≈ −4.2 if missed'", mustStakeLabel(parsed, grade, { today: TODAY, launchDay: LAUNCH }), "Must · ≈ −4.2 if missed");
  const severe = { band: "SEVERE" as const, machineMinutes: 240, estMinutes: 240 };
  eq("live: the cap shows as 20, not 48.6", mustStakeLabel(parsed, severe, { today: TODAY, launchDay: LAUNCH }), "Must · ≈ −20 if missed");
  eq("before launch with the day set: 'Must · stakes from Mon 12 Oct'", mustStakeLabel(parsed, grade, { today: "2026-10-05", launchDay: LAUNCH }), "Must · stakes from Mon 12 Oct");
  eq("no launch day: the chip keeps its own label", mustStakeLabel(parsed, grade, { today: TODAY, launchDay: null }), null);
  eq("live but not yet priced: the chip keeps its own label", mustStakeLabel(parsed, null, { today: TODAY, launchDay: LAUNCH }), null);
  const noDay = parseCapture("call the bank !", { today: TODAY });
  eq("a must with no day to be judged on states no stake", [noDay.compulsoryWarning !== null, mustStakeLabel(noDay, grade, { today: TODAY, launchDay: LAUNCH })], [true, null]);
  const inboxMust = parseCapture("renew passport daily !?", { today: TODAY });
  eq("'!' and '?': bound for the Inbox, no stake, and the note 'A must once you clarify it'", [inboxMust.inbox, mustStakeLabel(inboxMust, grade, { today: TODAY, launchDay: LAUNCH }), inboxMustNote(inboxMust)], [true, null, INBOX_MUST_NOTE]);
  eq("the note's words", INBOX_MUST_NOTE, "A must once you clarify it");
  eq("'?' alone: no note", inboxMustNote(parseCapture("renew passport?", { today: TODAY })), null);
  eq("'!' alone: no note", inboxMustNote(parsed), null);
  const chips = code(read("src/components/capture/CaptureChips.tsx"));
  check("CaptureChips: the compulsory chip's label is the stake when there is one", /let label = t\.field === "compulsory" && stake \? stake : t\.label;/.test(chips) && /mustStakeLabel\(/.test(chips));
  check("CaptureChips: the Inbox-must note renders under the chips", /inboxMustNote\(parsed\)/.test(chips) && /\{inboxMust && \(/.test(chips));
  check("CaptureChips: the default context reads the code's launch day (dutyLaunchDay) and today", /duty \?\? \{ today: todayKey\(\), launchDay: dutyLaunchDay\(\) \}/.test(chips));
}

// ── §5 Copy and source guards ──────────────────────────────────────────────
console.log("\n── §5 Copy and wiring");
{
  eq("pre-launch: 'Musts carry stakes from Mon 12 Oct' while the day is ahead", preLaunchNotice("2026-10-05", "2026-10-12"), "Musts carry stakes from Mon 12 Oct");
  eq("pre-launch: nothing on or after the day, nothing without one", [preLaunchNotice("2026-10-12", "2026-10-12"), preLaunchNotice("2026-10-05", null)], [null, null]);
  eq("phase: off, announced, live", [dutyPhaseOf("2026-10-05", null), dutyPhaseOf("2026-10-05", "2026-10-12"), dutyPhaseOf("2026-10-12", "2026-10-12")], ["off", "announced", "live"]);
  eq("stakes line", stakesFromLine("2026-10-19"), "Musts carry stakes from Mon 19 Oct");
  eq("lag: 'Duty is settled through …' only when more than 3 days behind today − 2", [dutySettledLine("2026-10-09", "2026-10-14"), dutySettledLine("2026-10-08", "2026-10-14"), dutySettledLine(null, "2026-10-14")], [null, "Duty is settled through Thu 8 Oct", null]);
  eq("owed from: a must open on Tue is owed from Thu 04:00", owedFromLine("2026-10-13"), `Thu ${DAY_EDGE}`);
  eq("labels", [weekdayDateLabel("2026-10-12"), dayMonthLabel("2026-10-05"), formatDebt(12.5), formatDebt(-4.25), formatDebt(20)], ["Mon 12 Oct", "5 Oct", "12.5", "4.3", "20"]);

  const sat = reviewedWeek("2026-10-17")!;
  eq("next week (Saturday): the coming Monday to Sunday", nextWeekDays(sat, "2026-10-17", "2026-10-12"), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  const mon = reviewedWeek("2026-10-13")!;
  eq("next week (Tuesday): the rest of this week, from tomorrow", nextWeekDays(mon, "2026-10-13", "2026-10-12"), ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  eq("next week: never a day before the launch day, none without one", [nextWeekDays(sat, "2026-10-17", "2026-10-22").length, nextWeekDays(sat, "2026-10-17", null).length], [4, 0]);
  const declared = new Map<DayKey, RestKind>([
    ["2026-10-19", "REST"],
    ["2026-10-21", "REST"],
    ["2026-10-24", "VACATION"],
    ["2026-10-13", "REST"],
  ]);
  check(`rest cap: a third REST in a life week is refused (${REST_PER_WEEK} a week)`, restRefusalOf("2026-10-23", declared) === `${REST_PER_WEEK} rest days already that week`);
  check("rest cap: re-declaring a day already rest is not counted against itself, and another week's rest does not count", restRefusalOf("2026-10-19", new Map([["2026-10-19", "REST"], ["2026-10-13", "REST"], ["2026-10-14", "REST"]])) === null);
  check("rest cap: vacation days are not REST", restRefusalOf("2026-10-26", new Map([["2026-10-27", "VACATION"], ["2026-10-28", "VACATION"]])) === null);

  // The tour's Today step once Duty is live (F15): within the 160-character budget, the stake and the way back.
  const liveToday = copyText(tourSteps({ keyboard: true, dutyLive: true }).find((s) => s.id === "today")!.body);
  check("tour: live Today step ≤ 160 characters and says what a miss costs and how it comes back", liveToday.length <= 160 && liveToday === TODAY_DUTY_COPY && /A must you miss is owed; make it up within two days and its streak comes back\./.test(liveToday), `${liveToday.length}: ${liveToday}`);
  check("tour: 'two days' is MAKEUP_RESTORE_DAYS", MAKEUP_RESTORE_DAYS === 2);
  check("tour: before Duty the Today step is unchanged", copyText(tourSteps({ keyboard: true }).find((s) => s.id === "today")!.body) === TODAY_COPY && TODAY_COPY.startsWith("Must, Planned and Habits. Ticking a task pays life XP"));
  check("tour: still seven steps either way", tourSteps({ keyboard: true, dutyLive: true }).length === 7 && tourSteps({ keyboard: false, dutyLive: true }).length === 7);

  const rules = code(read("src/app/today/rules/page.tsx"));
  check("rules: Duty's cards only once live; the old 'Not yet in force' card before", /\{dutyLive \? \(\s*<DutyRules edge=\{edge\} \/>\s*\) : \(\s*<Card title="Not yet in force"/.test(rules));
  check("rules: the pre-launch notice and the lag line", /preLaunchNotice\(today, dutyLaunch\)/.test(rules) && /dutySettledLine\(await loadDutyCursor\(getCurrentUserId\(\)\), today\)/.test(rules));
  check("rules: the Full-day row reads 'paid when the week is judged' once live", /paid when the week is judged, after the kept tracks/.test(rules) && /pays from daily settlement/.test(rules));
  const dutyCard = rules.slice(rules.indexOf("function DutyRules("), rules.indexOf("export default async function RulesPage"));
  let text = "";
  let depth = 0;
  for (const ch of dutyCard.slice(dutyCard.indexOf("return ("))) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) text += ch;
  }
  const typed = [...text.matchAll(/\d+/g)].map((x) => x[0]);
  check("rules: Duty's cards type no number by hand (every figure from duty-economy and life-grade)", dutyCard.length > 1000 && typed.length === 0, typed.join(", "));
  check("rules: no promise of a knee reconcile (deferred)", !/KNEE_RECONCILE_TOLERANCE/.test(rules) && /that drift is not\s+corrected yet/.test(rules));
  check(
    "rules: the pre-launch Full day no longer offers 'the queue clear' (decision 7: the day-open target, up to the cap)",
    !/queue\s+clear/.test(rules) && /as many reviews as the\s+day opened with due, up to \{QUEST_CAP\}; nothing due counts as met/.test(rules)
  );
  check(
    "rules: 'Changing a must' names only weakenings an action makes (no 'sending it back to the Inbox')",
    !/sending it back to the Inbox/.test(rules) && /no longer a must, Even on rest days off, or archiving or dropping it/.test(rules)
  );

  const week = code(read("src/app/today/week/page.tsx"));
  check("week: after() runs the one maintenance chain (settle, then judge)", /after\(async \(\) => \{\s*await maybeMaintainLife\(userId\);/.test(week) && !/maybeJudgeWeeks/.test(week));
  check("week: the runner only while Duty is live and a week is under review, at ?view=run", /if \(dutyLive && review && \(await searchParams\)\.view === "run"\)/.test(week));
  check("week: before Duty is live the review placeholder is unchanged", /\{weekReviewPromise\(life\.launched\)\}/.test(week) && /Weekly review · arrives with daily settlement/.test(week));
  check("week: RestDay is read with a fallback (the table ships with Duty's migration)", /Promise\.resolve\(\)\s*\.then\(\(\) =>\s*prisma\.restDay\.findMany\([\s\S]*?\.catch\(\(\) => \[\]\)/.test(week));
  const you = code(read("src/app/you/page.tsx"));
  check("you: after() runs the snapshot, then the maintenance chain", /recordTodaySnapshot\(\);[\s\S]{0,40}finally \{\s*await maybeMaintainLife\(userId\)/.test(you));
  const review = code(read("src/components/home/WeekReview.tsx"));
  check("runner: progress per viewer in localStorage, every access in try/catch", (review.match(/try \{\s*(const raw = )?window\.localStorage\./g) ?? []).length === 2 && /useSyncExternalStore\(/.test(review));
  check("runner: the done marker is written once, on reaching the end", /if \(s === REVIEW_LAST_STEP && !marked\)/.test(review) && (review.match(/markWeekReviewed\(\)/g) ?? []).length === 1);
  check("runner: the owed step reads the board's frozen DutyBoard.owed", /data\.duty\?\.owed \?\? \[\]/.test(review));
  const settings = code(read("src/components/settings/SettingsView.tsx"));
  check("settings: Accept a loss is live from the launch day, wired to setDebtWriteOff; standing rest weekdays stay 'Not yet'", /<AcceptLossRow checked=\{on\} onChange=\{change\}/.test(settings) && /setDebtWriteOff\(next, \{ refresh: true \}\)/.test(settings) && /name="Rest weekdays"\s*when="Not yet"/.test(settings));
  check("settings: setDebtWriteOff is imported from actions/duty (one action, one answer shape)", /import \{ setDebtWriteOff \} from "@\/app\/actions\/duty";/.test(settings) && !/@\/app\/actions\/rituals/.test(settings));
  check(
    "runner: Accept the loss resolves the card as MakeUpCard's 'written-off' (quiet, the miss stays), never as 'repaid'",
    /acceptLoss\(card\.instanceId, REFRESH\), \(\) => wroteOff\(card\)/.test(review) &&
      /function wroteOff\(card: OwedCard\) \{\s*setResolved\(\(r\) => \(\{ \.\.\.r, \[card\.instanceId\]: \{ card, state: "written-off"/.test(review) &&
      !/state: "repaid", line: "Written off/.test(review)
  );
}

console.log(`\nrituals-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
