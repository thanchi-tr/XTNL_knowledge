/**
 * The weekly audit (docs/life-plan/blueprint-plan-2026-10-22.md P11; blueprint 5.2a and 5.2b; decisions D12, D15, D16,
 * D17 and D38): the week's completion rate over its daily quests, shipped inert behind AUDIT_LAUNCH_DAY.
 *
 *   §1 the switch: AUDIT_LAUNCH_DAY null in code; the XTNL_AUDIT_LAUNCH_DAY override outside production only; nothing
 *      audited (no week, no card, no freeze) while it is not in force;
 *   §2 when: provisional from Sunday 18:00 (Sydney, either side of DST), the week just ended from Monday; frozen on the
 *      Monday (or Tuesday) cron, final from the judge's Wednesday; calibrating for the first two audited weeks;
 *   §3 the rate: the daily quests counted as the week strip on Tasks › Habits counts them (the minimum counts 1, a skip
 *      and a held day left out and shown, a make-up kept), so the rate equals /today/habits for the same week; the
 *      habits line (never in the rate); the weakest quests; the target met exactly when the whole percent reads 85;
 *   §4 the frozen copy: one AUDIT row per ISO week (sink NONE, xp 0, never a streak day, dated the Sunday, "as of Mon
 *      04:00", and counting only what was set by that 04:00: a tick in the minutes before the cron reads stays out),
 *      read back unchanged after a late tick or a make-up; the only writer, behind settlementWritesEnabled; no XP or
 *      MP written;
 *   §5 the words: neutral, the 85% only on the audit (never on Today), "calibrating", the card's markup and CSS;
 *   §6 /today/week and the package.
 *
 * Pure: no database, no clock, no model. The cron's step itself (its gates and its JSON) is settle-check §5e.
 *
 *   npx tsx scripts/week-audit-check.ts
 */
import "./_no-model";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays, type DayKey } from "../src/lib/life-day";
import { judgeDayOf } from "../src/lib/life-weeks";
import { NEVER_STREAK_SOURCES, countsForStreakOf } from "../src/lib/streak-curve";
import { questWeekOf } from "../src/lib/daily-quests";
import {
  AUDIT_CALIBRATING_WEEKS,
  AUDIT_LAUNCH_DAY,
  AUDIT_LAUNCH_DAY_ENV,
  AUDIT_OPENS_HOUR,
  AUDIT_SOURCE,
  AUDIT_TARGET,
  AUDIT_WEAKEST,
  auditCalibrating,
  auditEventInput,
  auditFinalDay,
  auditFreezeAsOf,
  auditFreezeWeek,
  auditHeadline,
  auditKey,
  auditLaneLine,
  auditLaunchDay,
  auditOpensAt,
  auditReceiptOf,
  auditStatusLine,
  auditStatusOf,
  auditTargetLine,
  auditWeekAt,
  frozenAuditOf,
  habitLaneOf,
  instancesAsOf,
  isAuditLaunched,
  parseAuditReceipt,
  rateOf,
  shortOf,
  weakestOf,
  weekAuditOf,
  weekCompletionOf,
  type AuditTemplate,
  type WeekAudit,
} from "../src/lib/week-audit";
import { checkWeekOf } from "../src/lib/mobile-api";
import { WeekAuditCard } from "../src/components/home/WeekAudit";
import { QuestWeek } from "../src/components/habits/QuestWeek";

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

// The week of Monday 19 to Sunday 25 October 2026 (W43, AEDT), launched Monday 19 October in the rehearsal.
const MON: DayKey = "2026-10-19";
const SUN: DayKey = "2026-10-25";
const LAUNCH: DayKey = "2026-10-19";
const W43 = { weekKey: "2026-W43", monday: MON, sunday: SUN };
const sydney = (day: DayKey, hh: number, mm = 0) => new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+11:00`);

const T = (id: string, over: Partial<AuditTemplate> = {}): AuditTemplate => ({
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
  sortOrder: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  autoMetric: null,
  intrinsic: false,
  ...over,
});
const I = (templateId: string, day: DayKey, status: string) => ({ templateId, day, status });

const TEMPLATES: AuditTemplate[] = [
  T("gym", { sortOrder: 0 }),
  T("meds", { sortOrder: 1, compulsoryOnRest: true }),
  T("rent", { kind: "TASK", recurrence: null, dueKind: "DEADLINE", dueDay: "2026-10-23", sortOrder: 2 }),
  // A must through Tuesday ('Not a must' from Wednesday): Monday is a daily quest, Wednesday and Friday a habit's days.
  T("floss", { recurrence: "DOW:1,3,5", compulsory: false, sortOrder: 3, pendingChange: { v: 1, prior: [{ throughDay: "2026-10-20", compulsory: true }] } }),
  T("walk", { recurrence: "DOW:1,3,5", compulsory: false, sortOrder: 4 }),
  T("swim", { recurrence: "TARGET:3/W", compulsory: false, sortOrder: 5 }),
  T("study", { compulsory: false, autoMetric: "reviews", sortOrder: 6 }),
  T("play", { compulsory: false, intrinsic: true, sortOrder: 7 }),
  T("books", { recurrence: "TARGET:4/M", compulsory: false, sortOrder: 8 }),
];
const INSTANCES = [
  I("gym", "2026-10-19", "DONE"),
  I("gym", "2026-10-20", "DONE_MVV"),
  I("gym", "2026-10-21", "SKIPPED"),
  I("gym", "2026-10-22", "MISSED"),
  I("gym", "2026-10-23", "DONE_LATE"),
  I("gym", "2026-10-24", "MADE_UP"),
  ...["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((d) => I("meds", d, "DONE")),
  I("rent", "2026-10-23", "EXCUSED"),
  I("floss", "2026-10-19", "DONE"),
  I("floss", "2026-10-21", "DONE"),
  I("walk", "2026-10-19", "DONE"),
  I("walk", "2026-10-21", "DONE_MVV"),
  I("swim", "2026-10-20", "DONE"),
  I("swim", "2026-10-22", "DONE"),
  I("study", "2026-10-20", "DONE"),
  I("play", "2026-10-20", "DONE"),
  I("books", "2026-10-20", "DONE"),
];
const audit = (today: DayKey, now: Date, instances = INSTANCES, launchDay = LAUNCH) =>
  weekAuditOf({ week: W43, launchDay, templates: TEMPLATES, instances, today, now });

// ═══ §1 The switch ════════════════════════════════════════════════════════

console.log("— §1 the switch —");
check("AUDIT_LAUNCH_DAY is null in code: the audit ships inert (D38; flipped only on the user's go)", AUDIT_LAUNCH_DAY === null);
check("its override is XTNL_AUDIT_LAUNCH_DAY", AUDIT_LAUNCH_DAY_ENV === "XTNL_AUDIT_LAUNCH_DAY");
eq(
  "auditLaunchDay: none as shipped; the override outside production; production reads the constant only; a bad day is ignored",
  [auditLaunchDay({}), auditLaunchDay({ NODE_ENV: "development", XTNL_AUDIT_LAUNCH_DAY: LAUNCH }), auditLaunchDay({ NODE_ENV: "production", XTNL_AUDIT_LAUNCH_DAY: LAUNCH }), auditLaunchDay({ XTNL_AUDIT_LAUNCH_DAY: "2026-02-30" })],
  [null, LAUNCH, null, null]
);
eq("isAuditLaunched: never with no launch day; on and after it", [isAuditLaunched(SUN, null), isAuditLaunched("2026-10-18", LAUNCH), isAuditLaunched(LAUNCH, LAUNCH)], [false, false, true]);
check("as shipped there is no audited week, whatever the clock (so no card, no `week`, no freeze)", auditWeekAt(sydney(SUN, 20), SUN, AUDIT_LAUNCH_DAY) === null && auditWeekAt(sydney("2026-10-26", 10), "2026-10-26", auditLaunchDay({})) === null);

// ═══ §2 When ══════════════════════════════════════════════════════════════

console.log("— §2 when —");
eq("it opens Sunday 18:00 in Sydney, either side of DST (AEDT 07:00Z, AEST 08:00Z)", [AUDIT_OPENS_HOUR, auditOpensAt(SUN).toISOString(), auditOpensAt("2026-07-05").toISOString()], [18, "2026-10-25T07:00:00.000Z", "2026-07-05T08:00:00.000Z"]);
const wk = (now: Date, today: DayKey, launch: DayKey | null = LAUNCH) => auditWeekAt(now, today, launch)?.weekKey ?? null;
eq(
  "the week shown: Sunday 17:59 the week before (W42, before the launch: none); 18:00 this week (provisional); Monday to Saturday the week just ended; the next Sunday 18:00 the next",
  [wk(sydney(SUN, 17, 59), SUN), wk(sydney(SUN, 18), SUN), wk(sydney("2026-10-26", 10), "2026-10-26"), wk(sydney("2026-10-31", 22), "2026-10-31"), wk(sydney("2026-11-01", 18), "2026-11-01")],
  [null, "2026-W43", "2026-W43", "2026-W43", "2026-W44"]
);
eq("a launch midweek audits its whole week (from its Sunday 18:00)", wk(sydney(SUN, 19), SUN, "2026-10-22"), "2026-W43");
eq(
  "the cron freezes the week just ended on its Monday, or the Tuesday after a missed Monday; never on Wednesday (the judge's day) or later, nor on Sunday",
  [auditFreezeWeek("2026-10-26")?.weekKey, auditFreezeWeek("2026-10-27")?.weekKey, auditFreezeWeek("2026-10-28"), auditFreezeWeek(SUN), auditFreezeWeek("2026-10-31")],
  ["2026-W43", "2026-W43", null, null, null]
);
check("final from the judge's Wednesday (life-weeks judgeDayOf: Sunday + 3)", auditFinalDay(SUN) === judgeDayOf(SUN) && auditFinalDay(SUN) === "2026-10-28");
eq(
  "status: provisional without a frozen copy (whatever the day); with one, frozen Monday and Tuesday, final from Wednesday",
  [auditStatusOf(SUN, SUN, false), auditStatusOf(SUN, "2026-11-04", false), auditStatusOf(SUN, "2026-10-26", true), auditStatusOf(SUN, "2026-10-27", true), auditStatusOf(SUN, "2026-10-28", true)],
  ["provisional", "provisional", "frozen", "frozen", "final"]
);
eq(
  "calibrating: the first two audited weeks (counted from the launch day's week), not the third",
  [AUDIT_CALIBRATING_WEEKS, auditCalibrating(MON, LAUNCH), auditCalibrating("2026-10-26", LAUNCH), auditCalibrating("2026-11-02", LAUNCH), auditCalibrating(MON, "2026-10-22")],
  [2, true, true, false, true]
);

// ═══ §3 The rate ══════════════════════════════════════════════════════════

console.log("— §3 the rate —");
const sundayNight = audit(SUN, sydney(SUN, 20));
const d = sundayNight.daily;
eq(
  "the daily quests on Sunday night: gym (1, m, skip, 0, late 1, made up 1, Sunday open), meds 7 of 7, rent excused (held), floss's must Monday",
  [d.kept, d.due, d.minimum, d.skipped, d.held, d.open],
  [12, 14, 1, 1, 1, 1]
);
eq("…rows: the quests with something due, in board order (rent, all held, has none)", d.rows.map((r) => `${r.templateId}:${r.kept}/${r.due}`), ["gym:4/6", "meds:7/7", "floss:1/1"]);
eq("rate: kept of due as a whole percent, rounded down (12 of 14 = 85.7% reads 85); short 0", [sundayNight.rate, sundayNight.short, sundayNight.target], [85, 0, AUDIT_TARGET]);
const strip = questWeekOf(TEMPLATES, INSTANCES, SUN);
check(
  "the rate is the week strip's own count (/today/habits, the same week): kept equal, due = judged + still open, the same skips and held days",
  weekCompletionOf(strip).kept === strip.kept && d.kept === strip.kept && d.due === strip.judged + strip.open && d.skipped === strip.skipped && d.held === strip.held,
  JSON.stringify({ kept: strip.kept, judged: strip.judged, open: strip.open })
);
const recorded = [...INSTANCES, I("gym", SUN, "DONE")];
const allIn = audit(SUN, sydney(SUN, 21), recorded);
const allStrip = questWeekOf(TEMPLATES, recorded, SUN);
const html = renderToStaticMarkup(createElement(QuestWeek, { week: allStrip, today: SUN }));
check(
  "acceptance: once nothing is open, the audit's kept of due is /today/habits' kept of judged for the week (and its card's line says so)",
  allIn.daily.kept === allStrip.kept && allIn.daily.due === allStrip.judged && allIn.daily.open === 0 && html.includes(`<p class="hh-rule">${allStrip.kept} of ${allStrip.judged} kept · 1 at minimum · 1 skipped · 1 held</p>`) && allIn.rate === 92,
  JSON.stringify([allIn.daily.kept, allIn.daily.due, allStrip.kept, allStrip.judged])
);
const h = sundayNight.habits;
eq(
  "the habits line (never in the rate): walk 2 of 3 (the minimum counts), swim 2 of 3 units (Sunday's still open), floss's habit days 1 of 2; study, #play, a monthly target and the musts' days left out",
  [h.kept, h.due, h.minimum, h.open, h.skipped, h.held],
  [5, 8, 1, 1, 0, 0]
);
const lane = habitLaneOf(TEMPLATES, INSTANCES, SUN, { start: MON });
eq("…its rows", lane.rows.map((r) => `${r.templateId}:${r.kept}/${r.due}`), ["floss:1/2", "walk:2/3", "swim:2/3"]);
eq(
  "a weekly target counts its n units: a skip and a held day come off what is due; kept days never exceed n",
  [
    habitLaneOf([T("x", { recurrence: "TARGET:2/W", compulsory: false })], ["2026-10-19", "2026-10-20", "2026-10-21"].map((dd) => I("x", dd, "DONE")), SUN, { start: MON }).rows[0],
    habitLaneOf([T("x", { recurrence: "TARGET:3/W", compulsory: false })], [I("x", "2026-10-19", "SKIPPED")], SUN, { start: MON, held: { restDays: new Set(["2026-10-20"]), freezeDays: new Set() } }),
  ].map((x) => ("rows" in x ? [x.kept, x.due, x.skipped, x.held] : [x.kept, x.due])),
  [[2, 2], [0, 1, 1, 1]]
);
eq("the weakest: the quests not all kept, lowest share first, at most AUDIT_WEAKEST", sundayNight.weakest.map((r) => r.templateId), ["gym"]);
eq(
  "…ordered by share, then by the most not kept, then board order; three at most",
  weakestOf({ rows: [{ templateId: "a", title: "a", kept: 2, due: 4 }, { templateId: "b", title: "b", kept: 0, due: 1 }, { templateId: "c", title: "c", kept: 3, due: 6 }, { templateId: "d", title: "d", kept: 5, due: 5 }, { templateId: "e", title: "e", kept: 1, due: 3 }] }).map((r) => r.templateId),
  ["b", "e", "c"]
);
check("AUDIT_WEAKEST is 3 and AUDIT_TARGET 85", AUDIT_WEAKEST === 3 && AUDIT_TARGET === 85);
let agree = true;
for (let due = 1; due <= 60; due++)
  for (let kept = 0; kept <= due; kept++) {
    const r = rateOf({ kept, due }) ?? -1;
    const met = 100 * kept >= AUDIT_TARGET * due;
    if (r >= AUDIT_TARGET !== met || (shortOf({ kept, due }) === 0) !== met || (!met && kept + shortOf({ kept, due }) < (AUDIT_TARGET * due) / 100)) agree = false;
  }
check("the whole percent reads 85 or more exactly when the target is met, and `short` more kept reach it (every week up to 60 quests)", agree);
eq("nothing due: no rate, nothing short", [rateOf({ kept: 0, due: 0 }), shortOf({ kept: 0, due: 0 })], [null, 0]);

// ═══ §4 The frozen copy ═══════════════════════════════════════════════════

console.log("— §4 the frozen copy —");
const MONDAY: DayKey = "2026-10-26";
const turn = sydney(MONDAY, 4, 15);
const live = audit(MONDAY, turn);
const input = auditEventInput(live, MONDAY, turn);
eq(
  "the copy is one ledger row: source AUDIT, sink NONE, no track, xp 0, no raw XP, never a streak day, dated the Sunday, keyed by the ISO week, qty the rate",
  [input.source, input.sink, input.track, input.xp, input.rawXp, input.countsForStreak, input.day, input.dedupeKey, input.qty],
  [AUDIT_SOURCE, "NONE", null, 0, null, false, SUN, auditKey("2026-W43"), 85]
);
check("…'audit:<YYYY-Www>', and it says \"as of Mon 04:00\"", auditKey("2026-W43") === "audit:2026-W43" && input.detail === "85% · 12 of 14 kept · as of Mon 04:00", String(input.detail));
check("AUDIT is never a streak day, whatever a writer asks; DEFAULT_SINK NONE", NEVER_STREAK_SOURCES.has("AUDIT") && countsForStreakOf("AUDIT", true) === false && /\n\s*AUDIT: "NONE",/.test(read("src/lib/activity.ts")));
check("one row per ISO week: ActivityEvent is unique on (userId, dedupeKey)", /model ActivityEvent \{[\s\S]*?@@unique\(\[userId, dedupeKey\]\)/.test(read("prisma/schema.prisma")));
const stored = parseAuditReceipt(JSON.parse(JSON.stringify(input.receipt)));
check("the receipt reads back as written", stored !== null && JSON.stringify(stored) === JSON.stringify(auditReceiptOf(live, MONDAY)));
const copy = stored ? frozenAuditOf(stored, MONDAY, LAUNCH) : null;
eq("read back on Monday: frozen, as of Monday, the same counts", [copy?.status, copy?.asOfDay, copy?.rate, copy?.daily.kept, copy?.daily.due, copy?.weakest.map((r) => r.templateId)], ["frozen", MONDAY, 85, 12, 14, ["gym"]]);
// A late tick (Sunday's gym recorded on Monday) and a make-up later in the week reach the live read, never the copy (D12).
const later = audit("2026-10-28", sydney("2026-10-28", 9), [...INSTANCES.filter((i) => !(i.templateId === "gym" && i.day === "2026-10-22")), I("gym", SUN, "DONE"), I("gym", "2026-10-22", "MADE_UP")]);
const finalCopy = stored ? frozenAuditOf(stored, "2026-10-28", LAUNCH) : null;
check(
  "D12: a late tick and a make-up move the live read (14 of 14) but never the written copy (still 12 of 14), which is final from Wednesday",
  later.daily.kept === 14 && finalCopy?.daily.kept === 12 && finalCopy.status === "final" && finalCopy.rate === 85,
  JSON.stringify([later.daily.kept, finalCopy?.daily.kept, finalCopy?.status])
);
// The cron reads at 04:15 AEST or 05:15 AEDT, after the turn the copy names: only what was set by 04:00 is in it (D12).
eq(
  "auditFreezeAsOf: a copy is as of its day's 04:00 turn in Sydney (AEDT and AEST), whatever minute the cron reads",
  [auditFreezeAsOf(MONDAY).toISOString(), auditFreezeAsOf("2026-06-15").toISOString()],
  ["2026-10-25T17:00:00.000Z", "2026-06-14T18:00:00.000Z"]
);
{
  const asOf = auditFreezeAsOf(MONDAY);
  const stamped = INSTANCES.map((i) => ({ ...i, at: sydney(i.day, 20) }));
  const tickAt = (hh: number, mm: number) => ({ ...I("gym", SUN, "DONE_LATE"), at: sydney(MONDAY, hh, mm) });
  const lateCopy = audit(MONDAY, asOf, instancesAsOf([...stamped, tickAt(4, 30)], asOf));
  const earlyCopy = audit(MONDAY, asOf, instancesAsOf([...stamped, tickAt(3, 59)], asOf));
  check(
    "a Sunday quest ticked at 04:30 on Monday (before the 05:15 AEDT cron) stays out of the copy: Sunday open when frozen, 12 of 14; ticked at 03:59 it is in (13 of 14)",
    lateCopy.daily.kept === 12 && lateCopy.daily.open === 1 && earlyCopy.daily.kept === 13 && earlyCopy.daily.open === 0,
    JSON.stringify([lateCopy.daily.kept, lateCopy.daily.open, earlyCopy.daily.kept, earlyCopy.daily.open])
  );
  check("…and the copy records the turn it is as of, not the cron's minute", lateCopy.asOf === asOf.toISOString() && auditEventInput(lateCopy, MONDAY, turn).occurredAt === turn);
  eq("instancesAsOf: set by the instant (inclusive) kept, after it left out, no stamp kept", instancesAsOf([{ at: asOf }, { at: new Date(asOf.getTime() + 1) }, { at: null }, {}], asOf).length, 3);
}
check(
  "freezeWeekAudit counts the instances set by the copy's 04:00 (each read with when its status was set) and records that turn as its moment",
  // Re-pinned for blueprint P32: the copy also takes the freeze's additions (the week's tracked minutes and next week's
  // calibration, week-calibration-server calibrationFreezeOf), read from the audit just built, before the one write.
  // Re-pinned for blueprint P32 review: with the launch day, so a calibrating week is never judged against the target.
  /const asOf = auditFreezeAsOf\(today\);\s*const audit = weekAuditOf\(\{[^}]*instances: instancesAsOf\(facts\.instances, asOf\)[^}]*now: asOf \}\);\s*const extra = await calibrationFreezeOf\(userId, \{ week, audit, held: facts\.held, asOf, today, now, launchDay \}\);\s*const input = auditEventInput\(audit, today, now, extra\);/.test(code("src/lib/week-audit-server.ts")) &&
    /select: \{ templateId: true, day: true, status: true, completedAt: true, updatedAt: true \}/.test(code("src/lib/daily-quests-server.ts")) &&
    /at: i\.completedAt \?\? i\.updatedAt/.test(code("src/lib/daily-quests-server.ts"))
);
// Blueprint P31 (D35): side quests are out of the rate, on a lane of their own, kept with the copy only when the week had one.
{
  const plain = audit(SUN, sydney(SUN, 19));
  const withSide = weekAuditOf({ week: W43, launchDay: LAUNCH, templates: TEMPLATES, instances: INSTANCES, side: { offered: 2, done: 1 }, today: SUN, now: sydney(SUN, 19) });
  check(
    "P31: the week's side quests never move the rate (one-offs are never daily quests); the audit and its copy carry them only when the week had one",
    withSide.rate === plain.rate &&
      withSide.daily.due === plain.daily.due &&
      !("side" in plain) &&
      !("side" in auditReceiptOf(plain, "2026-10-26")) &&
      JSON.stringify(auditReceiptOf(withSide, "2026-10-26").side) === JSON.stringify({ offered: 2, done: 1 })
  );
  check("P31: the phone's `week.side` only when the week had one", JSON.stringify(checkWeekOf(withSide)?.side) === JSON.stringify({ done: 1, offered: 2 }) && !("side" in (checkWeekOf(plain) ?? {})));
}
eq(
  "a receipt this version did not write reads as none (then the week reads live, provisional)",
  [parseAuditReceipt(null), parseAuditReceipt({ ...(input.receipt as object), v: 2 }), parseAuditReceipt({ ...(input.receipt as object), daily: { kept: -1 } })],
  [null, null, null]
);
const server = code("src/lib/week-audit-server.ts");
check(
  "the only write is the copy: one activityEvent.create (no update, delete, upsert, raw SQL, ledger or MP row); a second write is a unique violation and the first copy stands",
  (server.match(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g) ?? []).join() === "prisma.activityEvent.create(" &&
    !/\$executeRaw|\$queryRaw|masteryLedgerEntry|MP_MINT/.test(server) &&
    /if \(isDuplicateActivity\(err\)\) return \{ weekKey: week\.weekKey, froze: false, skipped: "FROZEN" \};/.test(server)
);
check("freezeWeekAudit reads the week just ended once it is due, and freezes it only once (an existing copy is FROZEN)", /const week = auditFreezeWeek\(today\);\s*if \(!week \|\| week\.sunday < launchDay\) return \{ weekKey: null, froze: false, skipped: "NOT_DUE" \};/.test(server) && /if \(existing\) return \{ weekKey: week\.weekKey, froze: false, skipped: "FROZEN" \};/.test(server));
const callers = (function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
})("src").filter((f) => f !== "src/lib/week-audit-server.ts" && /\bfreezeWeekAudit\b/.test(code(f)));
eq("the freeze has one caller, the life cron's audit step (settlement.ts)", callers, ["src/lib/settlement.ts"]);
const settlement = code("src/lib/settlement.ts");
const step = settlement.slice(settlement.indexOf("export async function runAuditStep("), settlement.indexOf("const maintaining ="));
check(
  "runAuditStep: the launch day first, then settlementWritesEnabled (never on dev or a Preview), and only then the freeze; never Duty's gate",
  step.indexOf("isAuditLaunched(") > 0 && step.indexOf("isAuditLaunched(") < step.indexOf("settlementWritesEnabled(ctx.env)") && step.indexOf("settlementWritesEnabled(ctx.env)") < step.indexOf("freezeWeekAudit") && !/Duty/i.test(step.replace(/never on dev/, "")),
  step.slice(0, 120).replace(/\s+/g, " ")
);
check("the audit's rules hold no Prisma, no clock and no randomness (week-audit.ts)", !/from "\.\/prisma"|@prisma\/client|new Date\(\)|Date\.now|Math\.random/.test(code("src/lib/week-audit.ts")));

// ═══ §5 The words ═════════════════════════════════════════════════════════

console.log("— §5 the words —");
const calibrating = audit(SUN, sydney(SUN, 20));
const settled = audit(SUN, sydney(SUN, 20), INSTANCES, "2026-10-05");
const under = audit(SUN, sydney(SUN, 20), INSTANCES.filter((i) => !(i.templateId === "meds" && i.day >= "2026-10-23")), "2026-10-05");
eq(
  "the headline and the lines (provisional on Sunday night)",
  [auditHeadline(settled), auditStatusLine(settled, SUN), auditTargetLine(settled), auditLaneLine(settled.daily), auditLaneLine(settled.habits)],
  [
    "85% · 12 of 14 kept",
    "Provisional: the week as it stands now. It is frozen just after Monday 04:00.",
    "Target 85% · met",
    "12 of 14 kept · 1 at minimum · 1 skipped · 1 held · 1 still open",
    "5 of 8 kept · 1 at minimum · 1 still open",
  ]
);
eq("a frozen copy's open quests were open when it was frozen", [copy ? auditLaneLine(copy.daily, true) : ""], ["12 of 14 kept · 1 at minimum · 1 skipped · 1 held · 1 open when frozen"]);
eq("below the target it says how many more would reach it, never a verdict", [auditHeadline(under), auditTargetLine(under)], ["64% · 9 of 14 kept", "Target 85% · 3 more kept would reach it"]);
eq(
  "frozen, final, a week with no copy kept, and calibrating (the first two weeks)",
  [
    copy ? auditStatusLine(copy, MONDAY) : "",
    finalCopy ? auditStatusLine(finalCopy, "2026-10-28") : "",
    auditStatusLine({ ...settled }, "2026-10-28"),
    auditTargetLine(calibrating),
    stored ? auditTargetLine({ ...frozenAuditOf(stored, "2026-10-28", "2026-10-05"), short: 2 }) : "",
  ],
  [
    "As of Mon 04:00. Later ticks and make-ups don't change it; the week is judged Wednesday.",
    "As of Mon 04:00 · final.",
    "Provisional: read as it stands now; no frozen copy was kept for this week.",
    "Calibrating · week 1 of 2. The 85% target applies from week 3.",
    "Target 85% · 2 more kept would have reached it",
  ]
);
const words = [settled, under, calibrating, copy, finalCopy].filter((x): x is WeekAudit => x != null).flatMap((a) => [auditHeadline(a), auditStatusLine(a, SUN), auditTargetLine(a), auditLaneLine(a.daily)]);
check("neutral copy (H12): no fail, bad, poor, lazy, shame, behind, must do better, and no '!'", words.every((w) => !/\bfail|\bbad\b|\bpoor|\blazy|shame|\bbehind\b|do better|!/i.test(w)), words.find((w) => /\bfail|\bbad\b|\bpoor|\blazy|shame|\bbehind\b|do better|!/i.test(w)) ?? "");
const walkSrc = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(join(ROOT, p)).isDirectory() ? walkSrc(p) : /\.(tsx?|css)$/.test(n) ? [p] : [];
  });
const todayFiles = [...walkSrc("src/components/today"), "src/app/today/page.tsx", "src/lib/today-board.ts", "src/lib/daily-quests.ts"];
const onToday = todayFiles.filter((f) => /AUDIT_TARGET|week-audit|\b85 ?%/.test(code(f)));
check("D17: the 85% target is never on Today (no Today file reads the audit or names 85%)", onToday.length === 0, onToday.join(", "));
const targetUsers = walkSrc("src").filter((f) => /\bAUDIT_TARGET\b/.test(code(f)));
eq("…AUDIT_TARGET is read only by the audit's own rules", targetUsers, ["src/lib/week-audit.ts"]);
const card = renderToStaticMarkup(createElement(WeekAuditCard, { audit: settled, today: SUN }));
check(
  "the card: 'Week audit · Week of 19 Oct', the headline, when it is from, the target, the lanes (the habits 'not in the rate'), the quests kept least",
  card.includes(">Week audit</h2>") &&
    card.includes('<span class="aside">Week of 19 Oct</span>') &&
    card.includes('<p class="wa-rate">85% · 12 of 14 kept</p>') &&
    card.includes("Provisional: the week as it stands now.") &&
    card.includes("Target 85% · met") &&
    card.includes("<b>Daily quests</b>") &&
    card.includes("5 of 8 kept · 1 at minimum · 1 still open · not in the rate") &&
    card.includes('<span class="wa-weak-title">gym</span><span class="wa-weak-count">4 of 6</span>'),
  card.slice(card.indexOf('<ul class="wa-lanes"'))
);
// P12: "Decaying this week" adds links (its rows, audit-decay-check §5); a card read without the decay has none.
check("…without the decay block, no control on it (read-only): no button, no link, no input", settled.decaying === null && !/<(button|a|input)\b/.test(card));
const css = read("src/components/home/week-audit.css");
const cssBody = css.replace(/\/\*[\s\S]*?\*\//g, "");
const sizes = [...cssBody.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
check(
  "week-audit.css: tokens only, in @layer components after the layer order, no text under 12 px, every line free to wrap",
  !/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i.test(cssBody) &&
    css.startsWith("@layer theme, base, components, art, effects, utilities;") &&
    /@layer components \{/.test(cssBody) &&
    sizes.length > 0 &&
    sizes.every((n) => n >= 12) &&
    !/\bwidth:\s*\d{3,}px/.test(cssBody) &&
    (cssBody.match(/overflow-wrap: anywhere/g) ?? []).length >= 4,
  sizes.join(",")
);
eq("the phone's `week` is the same audit (checkWeekOf); null while inert", [checkWeekOf(null), checkWeekOf(settled)?.rate, checkWeekOf(settled)?.status, checkWeekOf(settled)?.label], [null, 85, "provisional", "Week of 19 Oct"]);

// ═══ §6 /today/week and the package ═══════════════════════════════════════

console.log("— §6 /today/week and the package —");
const page = code("src/app/today/week/page.tsx");
check(
  "/today/week reads the audit beside its other reads (a failed read leaves the card out, never the page) and shows it under the last week",
  /const auditRead = loadWeekAudit\(userId, now\)\.catch\(\(err: unknown\): WeekAudit \| null => \{/.test(page) &&
    /\{audit && <WeekAuditCard audit=\{audit\} today=\{today\} \/>\}/.test(page) &&
    page.indexOf("<WeekAuditCard audit={audit} today={today} />") > page.indexOf("<LastWeekCard week={week} today={life.today} />") &&
    page.indexOf("<WeekAuditCard audit={audit} today={today} />") < page.indexOf("<ReviewCard week={review}") &&
    page.includes('import "@/components/home/week-audit.css";')
);
check(
  "the run's step 1 shows the reviewed week's audit only (with or without Duty), never another week's",
  /const auditCard = audit && audit\.weekKey === w\.weekKey \? <WeekAuditCard audit=\{audit\} today=\{today\} headingId="wa-run-h" \/> : null;/.test(page) &&
    (page.match(/\{auditCard\}/g) ?? []).length === 2 &&
    /audit=\{audit\} today=\{today\} \/>\}/.test(page)
);
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
const life = pkg.scripts["life:check"].split("&&").map((s) => s.trim());
check(
  "package.json: life:check runs this check right after daily-quests-check; week-audit:check runs it alone",
  life[life.indexOf("tsx scripts/daily-quests-check.ts") + 1] === "tsx scripts/week-audit-check.ts" && pkg.scripts["week-audit:check"] === "tsx scripts/week-audit-check.ts"
);
check("no migration for it: the copy is an ActivityEvent row (source is a free string)", !readdirSync(join(ROOT, "prisma/migrations")).some((dd) => /audit/i.test(dd)) && /\n\s*source\s+String\n/.test(read("prisma/schema.prisma")));
check("the week's dates: W43 runs Monday 19 to Sunday 25 October", addDays(MON, 6) === SUN);

console.log(`\nweek-audit-check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
