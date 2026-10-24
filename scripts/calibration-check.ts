/**
 * Blueprint P32 (5.2d; decision D36; harm H13's safer variant): next week's calibration. src/lib/week-calibration.ts
 * (the rules, the words and the card's view), its frozen copy in the AUDIT row (week-audit.ts), Today's three sizes as
 * QUEST_SET quests-2 (momentum.ts, momentum-server.ts), the one-tap changes (duty-plan 'flag', tasks.ts setMustCore,
 * week-calibration-server acceptCalibrationCore) and where it is shown. Pure: no database, no network, no model; the
 * server half is read as source and called only on its inert path (no audit launched: it answers before any read).
 * PASS/FAIL per line; exits 1 on any failure.
 *
 *   npx tsx scripts/calibration-check.ts      (npm run calibration:check; life:check runs it after side-quests-check)
 *
 *   §1 dormant: no calibration until 2 frozen audits are in reach (a gap or an old copy does not count), none read while
 *      AUDIT_LAUNCH_DAY is not in force, and every reader answers at once without a read
 *   §2 Today's three sizes: Move 10/20/30 and any 2/3 from the audited week's rate; quests-2 records them, quests-1 reads
 *      as before; a set picked without sizes is exactly as before
 *   §3 the capacity suggestion: clamp(p50 × rate ÷ target, 120, declared) in 15-minute steps, never above the declared
 *      value; the daily tracked minutes (live ticks, held days out)
 *   §4 the suggestions: ease after 2 frozen weeks under the target (at most 2, the least kept first), step one habit up
 *      only at 95% or more with every daily quest (a weekly target's too) Established and under the cap; a calibrating
 *      week judges nothing (standard sizes, the capacity unscaled, no ease, no step-up); 'flag' is a strengthening,
 *      never retroactive; Accept runs only the change's own core
 *   §5 never prices, bands or kept-week floors: the calibration carries no price, no pay path reads it
 *   §6 the frozen copy: stored with the AUDIT row only by the freeze, read back, and a copy without it as before
 *   §7 the words and the card: neutral, no rate or target on anything Today shows (D17), the card's view and markup,
 *      what an Accept would do said before the tap (an ease's day, a step-up's stake), a Keep taken back with Undo
 *   §8 published: the rules page, Today on Mondays, the review's step 5, the phone, the package
 */
import "./_no-model";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addDays, type DayKey } from "../src/lib/life-day";
import { HABIT_RUNGS } from "../src/lib/habit";
import { QUEST, bodyMoveMinutes, isQuestSet, questsInForce, type QuestSet } from "../src/lib/momentum";
import { pickQuests, questRowsOf, type QuestCandidate, type QuestSources } from "../src/lib/momentum-server";
import { planRuleEdit, type RuleRow } from "../src/lib/duty-plan";
import { AUDIT_TARGET, auditEventInput, auditReceiptOf, parseAuditReceipt, rateOf, weekAuditOf, type AuditTemplate } from "../src/lib/week-audit";
import {
  CALIBRATION,
  CALIBRATION_AUTO_NOTE,
  calibrationOf,
  calibrationRateOf,
  calibrationRuleLines,
  capacityOf,
  changeTitleOf,
  medianOf,
  nextWeekViewOf,
  parseCalibration,
  parseTracked,
  questSizesOf,
  sizesOf,
  trackedMinutesOf,
  type CalibrationFacts,
  type CalibrationWeek,
  type WeekCalibration,
} from "../src/lib/week-calibration";
import { CALIBRATION_NONE, acceptCalibrationCore, loadCalibration, loadNextWeek, readQuestSizes } from "../src/lib/week-calibration-server";
import { CALIBRATION_UNKEEP_WORD } from "../src/lib/week-calibration";
import { checkCalibrationOf } from "../src/lib/mobile-api";
import { KEPT_LINE, NextWeekBody, itemLineOf } from "../src/components/home/NextWeekBody";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function eq(name: string, got: unknown, want: unknown): void {
  check(name, same(got, want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// The audited week W43 (Monday 19 October 2026) and the weeks before it.
const M43: DayKey = "2026-10-19";
const week = (monday: DayKey, weekKey: string, rows: { templateId: string; title: string; kept: number; due: number }[], tracked: (number | null)[] | null = [200, 220, 180, 240, 210, 90, null]): CalibrationWeek => ({
  weekKey,
  monday,
  target: AUDIT_TARGET,
  daily: { kept: rows.reduce((s, r) => s + r.kept, 0), due: rows.reduce((s, r) => s + r.due, 0), rows },
  tracked,
});
const row = (templateId: string, kept: number, due = 7) => ({ templateId, title: templateId, kept, due });
const facts = (over: Partial<CalibrationFacts> = {}): CalibrationFacts => ({
  declared: 240,
  musts: [
    { templateId: "gym", title: "Gym", strength: 0.7, pending: false },
    { templateId: "floss", title: "Floss", strength: 0.65, pending: false },
  ],
  habits: [{ templateId: "read", title: "Read", strength: 0.72, capped: false }],
  ...over,
});
const W43 = (rows = [row("gym", 7), row("floss", 7)], tracked?: (number | null)[] | null) => week(M43, "2026-W43", rows, tracked);
const W42 = (rows = [row("gym", 7), row("floss", 7)], tracked?: (number | null)[] | null) => week("2026-10-12", "2026-W42", rows, tracked);
const W41 = (rows = [row("gym", 7), row("floss", 7)]) => week("2026-10-05", "2026-W41", rows);
const W40 = (rows = [row("gym", 7), row("floss", 7)]) => week("2026-09-28", "2026-W40", rows);
const W39 = (rows = [row("gym", 7), row("floss", 7)]) => week("2026-09-21", "2026-W39", rows);

void (async () => {
  // ═══ §1 dormant ══════════════════════════════════════════════════════════
  console.log("— §1 dormant —");
  eq("CALIBRATION: 2 frozen audits, 4 weeks, floor 120, step 15, ease 2 weeks (2 a week at most), step up from 95%, Established 0.6", CALIBRATION, {
    MIN_AUDITS: 2,
    WEEKS: 4,
    CAPACITY_FLOOR: 120,
    CAPACITY_STEP: 15,
    EASE_WEEKS: 2,
    EASE_MAX: 2,
    STEP_UP_FROM: 95,
    ESTABLISHED: 0.6,
  });
  check("…ESTABLISHED is habit.ts's Established floor", CALIBRATION.ESTABLISHED === HABIT_RUNGS.find((r) => r.rung === "Established")?.from);
  check("one frozen week alone calibrates nothing (D36: dormant until 2 frozen audits)", calibrationOf(W43(), [], facts()) === null);
  check("…nor with only a copy 4 or more weeks back (out of reach), nor one not a whole week back", calibrationOf(W43(), [W39()], facts()) === null && calibrationOf(W43(), [week("2026-10-14", "2026-W42", [])], facts()) === null);
  const two = calibrationOf(W43(), [W42()], facts());
  check("the second frozen copy calibrates the week after it (W44, Monday 26 Oct), from W43, reading both", !!two && two.weekKey === "2026-W44" && two.monday === "2026-10-26" && two.from === "2026-W43" && same(two.weeks, ["2026-W43", "2026-W42"]), JSON.stringify(two));
  const five = calibrationOf(W43(), [W39(), W41(), W40(), W42(), W42()], facts());
  check("it reads at most 4 weeks, newest first, each once (a gap still counts copies in reach)", !!five && same(five.weeks, ["2026-W43", "2026-W42", "2026-W41", "2026-W40"]), JSON.stringify(five?.weeks));
  {
    // Every reader answers at once while the audit is not launched: none of these reaches the database.
    const saved = process.env.XTNL_AUDIT_LAUNCH_DAY;
    process.env.XTNL_AUDIT_LAUNCH_DAY = "";
    try {
      const now = new Date("2026-10-26T01:00:00.000Z");
      const results = await Promise.all([loadCalibration("u1", now), loadNextWeek("u1", now), readQuestSizes("u1", "2026-10-26", now), acceptCalibrationCore("u1", "capacity", now)]);
      check(
        "while AUDIT_LAUNCH_DAY is not in force: loadCalibration, loadNextWeek and readQuestSizes answer null, Accept is refused (none of them reads)",
        results[0] === null && results[1] === null && results[2] === null && !results[3].ok && (results[3] as { error: string }).error === CALIBRATION_NONE
      );
    } finally {
      if (saved === undefined) delete process.env.XTNL_AUDIT_LAUNCH_DAY;
      else process.env.XTNL_AUDIT_LAUNCH_DAY = saved;
    }
  }
  const srv = code("src/lib/week-calibration-server.ts");
  check(
    "loadCalibration returns before any read while the audit is not launched; the week's calibration only (the week before's copy, for this Monday)",
    /const today = todayKey\(now\);\s*if \(!isAuditLaunched\(today, auditLaunchDay\(env\)\)\) return null;/.test(srv) &&
      srv.indexOf("if (!isAuditLaunched(today, auditLaunchDay(env))) return null;") < srv.indexOf("prisma.activityEvent.findUnique") &&
      /return calibration && calibration\.monday === monday \? calibration : null;/.test(srv)
  );
  check("loadNextWeek reads nothing more without a calibration", /const c = await loadCalibration\(userId, now\);\s*if \(!c\) return null;/.test(srv));
  check("the freeze reads the calibration's facts only once MIN_AUDITS copies are in reach", /if \(earlier\.length \+ 1 < CALIBRATION\.MIN_AUDITS\) return \{ tracked \};\s*const calibration = calibrationOf\(self, earlier, await readCalibrationFacts\(userId, today, now\)\);/.test(srv));

  // ═══ §2 Today's three sizes ═══════════════════════════════════════════════
  console.log("— §2 Today's three sizes —");
  check("QUEST: Move 10/20/30 (the standard 20 and the met-floor 10 among them), any 2/3 (the standard 2 among them)", same(QUEST.MOVE_SIZES, [10, 20, 30]) && same(QUEST.ANY_SIZES, [2, 3]) && QUEST.MOVE_MINUTES === 20 && QUEST.MOVE_EASY_MINUTES === 10 && QUEST.ANY_TASKS === 2);
  eq(
    "sizesOf: no rate the standard; under the target lighter (Move 10, any 2); at the target standard; from 95% more (Move 30, any 3)",
    [null, 0, 84, 85, 94, 95, 100].map((r) => { const s = sizesOf(r, AUDIT_TARGET); return `${r}:${s.level}:${s.move}/${s.any}`; }),
    ["null:standard:20/2", "0:lighter:10/2", "84:lighter:10/2", "85:standard:20/2", "94:standard:20/2", "95:more:30/3", "100:more:30/3"]
  );
  eq("bodyMoveMinutes: as before without a size (20, then 10 once the 150 is met); a size under 150, never over 10 once met", [bodyMoveMinutes(149), bodyMoveMinutes(150), bodyMoveMinutes(149, 30), bodyMoveMinutes(150, 30), bodyMoveMinutes(149, 10), bodyMoveMinutes(150, 10)], [20, 10, 30, 10, 10, 10]);
  const cand = (o: Partial<QuestCandidate> & { templateId: string }): QuestCandidate => ({
    title: o.templateId, track: "DUTY", kind: "TASK", category: "HOME", intrinsic: false, autoMetric: null, inbox: false, lane: "today", open: true, dueKind: "PLANNED", dueDay: "2026-10-26", recurring: false, raw: 10, ...o,
  });
  const src = (o: Partial<QuestSources> = {}): QuestSources => ({ day: "2026-10-26", candidates: [cand({ templateId: "t-later", dueDay: "2026-10-28" })], weekEffortMinutes: 40, reviewsDue: 0, plan: { hasRoadmap: false, practices: [], checkpoints: [], adds: [] }, ...o });
  const tie = () => 0.5;
  const plain = pickQuests(src(), tie);
  const standard = pickQuests(src({ sizes: { move: 20, any: 2, from: "2026-W43" } }), tie);
  const more = pickQuests(src({ sizes: { move: 30, any: 3, from: "2026-W43" } }), tie);
  const lighter = pickQuests(src({ sizes: { move: 10, any: 2, from: "2026-W43" } }), tie);
  eq("without sizes the fallbacks are exactly as before", plain.map((q) => [q.title, q.why]), [["Capture one idea", "Nothing else is planned today"], ["Move 20 min", "40 of 150 effort min this week"], ["Finish any 2 tasks", "Nothing big is due today"]]);
  check("the standard sizes pick the same three, word for word", same(plain, standard), JSON.stringify(standard));
  eq(
    "Move 30 and any 3 (a calibrated week, 95% or more), each saying it was sized from last week's audit; the lighter Move 10 too",
    [more.map((q) => [q.title, q.why]).slice(1), lighter[1].title, lighter[1].why],
    [[["Move 30 min", "40 of 150 effort min this week · sized from last week's audit"], ["Finish any 3 tasks", "Nothing big is due today · sized from last week's audit"]], "Move 10 min", "40 of 150 effort min this week · sized from last week's audit"]
  );
  const met = pickQuests(src({ weekEffortMinutes: 160, sizes: { move: 30, any: 3, from: "2026-W43" } }), tie);
  check("once the week's 150 is met a calibrated Move is 10, worded as the standard one", met[1].title === "Move 10 min" && met[1].why === "160 of 150 effort min this week");
  const set2: QuestSet = { v: "quests-2", day: "2026-10-26", quests: more, sizes: { move: 30, any: 3, from: "2026-W43" } };
  const set1: QuestSet = { v: "quests-1", day: "2026-10-26", quests: plain };
  check("isQuestSet reads quests-1 and quests-2 alike (every reader goes through it), and nothing else", isQuestSet(set1) && isQuestSet(set2) && !isQuestSet({ ...set2, v: "quests-3" }) && !isQuestSet({ v: "quests-2", day: "2026-10-26" }));
  const rows = [{ source: "QUEST_SET", day: "2026-10-26", receipt: set2 as unknown }];
  check("a quests-2 set is in force as stored: its quests carry their own minutes and count (never re-sized)", same(questRowsOf(rows, "2026-10-26").inForce, questsInForce(set2, [])) && questsInForce(set2, []).some((q) => q.kind === "MOVE" && q.minutes === 30));
  eq("questSizesOf: the calibration's sizes and the week it came from", questSizesOf({ sizes: sizesOf(97, AUDIT_TARGET), from: "2026-W43" }), { move: 30, any: 3, from: "2026-W43" });
  const ms = code("src/lib/momentum-server.ts");
  check(
    "ensureQuestSet: quests-2 with the sizes only when the sources carry them; otherwise quests-1 exactly as before",
    /const set: QuestSet = sources\.sizes\s*\? \{ v: "quests-2", day, quests: pickQuests\(sources, tieOf\(ctx, userId, day\)\), sizes: sources\.sizes \}\s*: \{ v: "quests-1", day, quests: pickQuests\(sources, tieOf\(ctx, userId, day\)\) \};/.test(ms)
  );
  check("the real sources read the week's sizes (null with no read while dormant) and add the key only with them", /readQuestSizes\(userId, day, now\),\s*\]\);/.test(ms) && /\.\.\.\(sizes \? \{ sizes \} : \{\}\),/.test(ms));
  check("readQuestSizes never throws: a failed read picks the standard sizes", /export async function readQuestSizes[\s\S]*?try \{[\s\S]*?\} catch \(err\) \{[\s\S]*?return null;/.test(srv));

  // ═══ §3 the capacity suggestion ═══════════════════════════════════════════
  console.log("— §3 the capacity suggestion —");
  eq("medianOf: odd, even (the middle two's mean), none", [medianOf([3, 1, 2]), medianOf([4, 1, 3, 2]), medianOf([])], [2, 2.5, 0]);
  const cap = (median: number, rate: number | null, declared: number) => capacityOf([median], 1, rate, AUDIT_TARGET, declared)?.suggested ?? null;
  eq(
    "clamp(p50 × rate ÷ 85, 120, declared) in 15s: 180 at 80% → 165; 300 at 100% → 240 (never above 240); 60 → 120; declared 90 → 90; 200 at 85% → 195; no rate → none",
    [cap(180, 80, 240), cap(300, 100, 240), cap(60, 90, 240), cap(500, 90, 90), cap(200, 85, 240), cap(180, null, 240)],
    [165, 240, 120, 90, 195, null]
  );
  let bounded = true;
  for (let m = 0; m <= 600; m += 7) for (const r of [0, 33, 70, 85, 99, 100]) for (const d of [30, 90, 120, 200, 240, 480]) {
    const s = cap(m, r, d);
    if (s == null || s > d || (d >= CALIBRATION.CAPACITY_FLOOR && s < CALIBRATION.CAPACITY_FLOOR) || (s !== d && s % CALIBRATION.CAPACITY_STEP !== 0)) bounded = false;
  }
  check("over a grid it is never above the declared capacity, never under the floor (unless the declared is), and in 15-minute steps", bounded);
  check("no tracked day: no suggestion", capacityOf([], 0, 90, AUDIT_TARGET, 240) === null);
  const TR = (id: string, day: DayKey, minutes: number, source = "TASK", dedupeKey: string | null = `task:${id}`) => ({ id, source, day, dedupeKey, receipt: { minutes } });
  eq(
    "trackedMinutesOf: Σ the live TASK ticks' minutes a day (an undone tick and the undo itself out, other sources out), a held day null",
    trackedMinutesOf([TR("a", M43, 30), TR("b", M43, 45.4), TR("c", addDays(M43, 1), 60), { id: "u", source: "UNDO", day: addDays(M43, 1), dedupeKey: "undo:c", receipt: { minutes: -60 } }, TR("w", addDays(M43, 2), 50, "WORKOUT"), TR("d", addDays(M43, 3), 20)], M43, new Set([addDays(M43, 4)])),
    [75, 0, 0, 20, null, 0, 0]
  );
  const capWeeks = calibrationOf(W43(undefined, [100, 100, 100, 100, 100, null, null]), [W42(undefined, [300, 300, 300, 300, 300, 300, 300])], facts({ declared: 480 }));
  check("the median reads every tracked day of the weeks in reach (held days out): 5 + 7 days, median 300 at 100% → 352.9, so 360", capWeeks?.capacity?.days === 12 && capWeeks.capacity.median === 300 && capWeeks.capacity.suggested === 360, JSON.stringify(capWeeks?.capacity));
  const basis = capacityOf([210], 2, 100, AUDIT_TARGET, 300)!;
  eq(
    "the capacity's basis says the arithmetic in words (median × rate ÷ target: 210 at 100% → 240, above the median), never 'scaled by the share kept', and names no rate or target number",
    [basis.suggested, basis.basis, capacityOf([210], 2, 71, AUDIT_TARGET, 300)?.suggested],
    [240, "A median of 210 tracked min a day over 2 weeks, scaled by how last week's daily quests compare with the audit's target. You set 300.", 180]
  );
  const stands = calibrationOf(W43(), [W42()], facts({ declared: 120 }));
  check("a suggestion equal to the declared capacity is no change, only a reading ('…stands')", !!stands && !stands.changes.some((c) => c.kind === "capacity") && /your 120 min a day stands\.$/.test(stands.capacity?.basis ?? ""), JSON.stringify(stands?.capacity));

  // ═══ §4 the suggestions ═══════════════════════════════════════════════════
  console.log("— §4 the suggestions —");
  const eased = calibrationOf(W43([row("gym", 3), row("floss", 7)]), [W42([row("gym", 5), row("floss", 7)])], facts());
  eq("ease: a daily quest kept under the target two frozen weeks running (Gym 3 of 7, then 5 of 7) is offered 'not a must'", eased?.changes.filter((c) => c.kind === "ease").map((c) => [c.id, changeTitleOf(c), c.basis]), [["ease:gym", "Gym: not a must", "Kept 3 of 7 last week and 5 of 7 the week before: under the audit's target both weeks."]]);
  check("…not after one week under (the week before at 6 of 7 = 85%)", !calibrationOf(W43([row("gym", 3), row("floss", 7)]), [W42([row("gym", 6), row("floss", 7)])], facts())?.changes.some((c) => c.kind === "ease"));
  check("…not when the week before is not frozen (a gap: the copy two weeks back does not run on)", !calibrationOf(W43([row("gym", 3), row("floss", 7)]), [W41([row("gym", 2), row("floss", 7)])], facts())?.changes.some((c) => c.kind === "ease"));
  check("…not when it is no longer a must, or its 'Not a must' is already pending", !calibrationOf(W43([row("gym", 3)]), [W42([row("gym", 2)])], facts({ musts: [] }))?.changes.some((c) => c.kind === "ease") && !calibrationOf(W43([row("gym", 3)]), [W42([row("gym", 2)])], facts({ musts: [{ templateId: "gym", title: "Gym", strength: 0.3, pending: true }] }))?.changes.some((c) => c.kind === "ease"));
  const three = calibrationOf(W43([row("a", 1), row("b", 3), row("c", 2)]), [W42([row("a", 1), row("b", 1), row("c", 0)])], facts({ musts: ["a", "b", "c"].map((id) => ({ templateId: id, title: id, strength: 0.2, pending: false })), declared: 120 }));
  eq("…at most 2 a week, the least kept last week first (then the week before)", three?.changes.map((c) => c.id), ["ease:a", "ease:c"]);
  const up = calibrationOf(W43(), [W42()], facts({ habits: [{ templateId: "read", title: "Read", strength: 0.72, capped: false }, { templateId: "walk", title: "Walk", strength: 0.95, capped: false }, { templateId: "yoga", title: "Yoga", strength: 0.99, capped: true }] }));
  eq("step up: at 100% with every daily quest Established, the strongest Established habit the cap allows (Walk; Yoga is capped)", up?.changes.filter((c) => c.kind === "step-up").map((c) => [c.id, changeTitleOf(c), c.basis]), [["step:walk", "Walk: make it a must", "Nearly every daily quest was kept last week, and each is Established; Walk is Automatic."]]);
  check("…one at most", (up?.changes.filter((c) => c.kind === "step-up").length ?? 0) === 1);
  check("…none at 94%", !calibrationOf(W43([row("gym", 15, 16)]), [W42()], facts({ musts: [{ templateId: "gym", title: "Gym", strength: 0.9, pending: false }] }))?.changes.some((c) => c.kind === "step-up"));
  check("…none while a daily quest is under Established, or with no daily quest at all", !calibrationOf(W43(), [W42()], facts({ musts: [{ templateId: "gym", title: "Gym", strength: 0.59, pending: false }] }))?.changes.some((c) => c.kind === "step-up") && !calibrationOf(W43([]), [W42([])], facts({ musts: [] }))?.changes.some((c) => c.kind === "step-up"));
  check("…none with only habits under Established", !calibrationOf(W43(), [W42()], facts({ habits: [{ templateId: "read", title: "Read", strength: 0.5, capped: false }] }))?.changes.some((c) => c.kind === "step-up"));
  // H12 (the audit's 'calibrating' weeks): the first calibration is set from two weeks the audit did not judge.
  const cal1 = (w: CalibrationWeek) => ({ ...w, calibrating: true });
  const first = calibrationOf(cal1(W43([row("gym", 3), row("floss", 7)], [300, 300, 300, 300, 300, 300, 300])), [cal1(W42([row("gym", 5), row("floss", 7)]))], facts({ declared: 480 }));
  eq(
    "a calibrating audited week judges nothing: the standard sizes (said why), the capacity the median alone (300, never scaled to 255 at 71%), no ease after two calibrating weeks under the target",
    [first?.sizes.level, first?.sizes.move, first?.sizes.basis, first?.capacity?.suggested, first?.capacity?.basis, first?.changes.map((c) => c.id)],
    ["standard", 20, "The audit was still calibrating last week, so the standard sizes.", 300, "A median of 300 tracked min a day over 2 weeks. You set 480.", ["capacity"]]
  );
  check("…and no step-up from a calibrating week at 100%", !calibrationOf(cal1(W43()), [cal1(W42())], facts())?.changes.some((c) => c.kind === "step-up"));
  check(
    "an ease needs two judged weeks running: the third week (judged) after a calibrating second is under the target alone, so nothing is eased yet; the fourth can be",
    !calibrationOf(W43([row("gym", 3), row("floss", 7)]), [cal1(W42([row("gym", 2), row("floss", 7)]))], facts())?.changes.some((c) => c.kind === "ease") &&
      !!calibrationOf(W43([row("gym", 3), row("floss", 7)]), [W42([row("gym", 2), row("floss", 7)]), cal1(W41([row("gym", 1), row("floss", 7)]))], facts())?.changes.some((c) => c.kind === "ease")
  );
  const csrv = code("src/lib/week-calibration-server.ts");
  check(
    "the freeze says which weeks were calibrating: the frozen audit's own flag, each earlier copy's from the launch day (week-audit auditCalibrating)",
    /tracked, calibrating: audit\.calibrating \};/.test(csrv) && /return copy \? \[\{ \.\.\.copy, calibrating: auditCalibrating\(copy\.monday, launchDay\) \}\] : \[\];/.test(csrv) && /readEarlierCopies\(userId, week, launchDay\)/.test(csrv)
  );
  const weekly = { templateId: "gym3", title: "Gym 3 a week", strength: 0.4, pending: false, flexible: true };
  check(
    "the step-up's Established test reads every daily quest with a repeat rule: a weekly target under Established blocks it",
    !calibrationOf(W43(), [W42()], facts({ musts: [...facts().musts, weekly] }))?.changes.some((c) => c.kind === "step-up") &&
      !!calibrationOf(W43(), [W42()], facts({ musts: [...facts().musts, { ...weekly, strength: 0.7 }] }))?.changes.some((c) => c.kind === "step-up")
  );
  check(
    "…while a must with no fixed days is never offered to ease (its audit row is the period's)",
    !calibrationOf(W43([row("gym3", 1)]), [W42([row("gym3", 1)])], facts({ musts: [weekly] }))?.changes.some((c) => c.kind === "ease")
  );
  check(
    "readCalibrationFacts: every must with a repeat rule (not #play, not a study task) is read, `flexible` without fixed days; only fixed-schedule habits may step up",
    /if \(!rule \|\| t\.intrinsic \|\| completesItself\(t\.autoMetric\)\) continue;\s*const fixed = isFixedSchedule\(rule\);/.test(csrv) && /\.\.\.\(fixed \? \{\} : \{ flexible: true \}\)/.test(csrv) && /\} else if \(fixed && !t\.compulsory && scheduledPerWeek\(rule\) >= 1\) \{/.test(csrv)
  );
  // duty-plan 'flag': the step-up's own edit.
  const NOW = new Date("2026-10-26T01:00:00.000Z");
  const TODAY: DayKey = "2026-10-26";
  const ruleRow = (over: Partial<RuleRow> = {}): RuleRow => ({ compulsory: false, compulsoryOnRest: false, inbox: false, kind: "HABIT", recurrence: "DAILY", startDay: "2026-09-01", dueDay: null, dueKind: null, archivedAt: null, createdAt: new Date("2026-09-01T00:00:00.000Z"), pendingChange: null, ...over });
  const ctx = { today: TODAY, now: NOW, launched: true };
  const flag = planRuleEdit(ruleRow(), { kind: "flag" }, ctx);
  check(
    "'flag' is a strengthening: immediate, a must from today, never retroactive (a prior segment {through yesterday, not a must})",
    flag.ok && flag.value.effect === "immediate" && flag.value.write?.compulsory === true && same(flag.value.write?.pendingChange, { v: 1, prior: [{ throughDay: "2026-10-25", compulsory: false }] }),
    JSON.stringify(flag)
  );
  const fresh = planRuleEdit(ruleRow({ startDay: TODAY }), { kind: "flag" }, ctx);
  check("…a habit starting today needs no segment", fresh.ok && same(fresh.value.write, { compulsory: true }));
  const pend = planRuleEdit(ruleRow({ compulsory: true, pendingChange: { v: 1, next: { effectiveDay: "2026-11-02", compulsory: false } } }), { kind: "flag" }, ctx);
  check("…on a must with a pending 'Not a must' it cancels that; on a must it writes nothing; an inbox item is refused", pend.ok && pend.value.write?.pendingChange === null && (() => { const m = planRuleEdit(ruleRow({ compulsory: true }), { kind: "flag" }, ctx); return m.ok && m.value.write === null; })() && !planRuleEdit(ruleRow({ inbox: true }), { kind: "flag" }, ctx).ok);
  const tasks = code("src/lib/tasks.ts");
  check(
    "setMustCore: the 'flag' edit through applyRuleEdit's compare-and-set, refused on a work tab and past the daily quests' cap (MUST_CAP_LINE), never on an archived task",
    /export function setMustCore\(userId: string, templateId: string, now: Date = new Date\(\)\): Promise<LifeResult<RuleChangeOutcome>> \{\s*return applyRuleEdit\(userId, templateId, \{ kind: "flag" \}, now, async \(row\) => \{/.test(tasks) &&
      /return mustCapOf\(await loadStandingMusts\(userId, row\.id\), candidate, todayKey\(now\)\)\.capped \? MUST_CAP_LINE : null;/.test(tasks) &&
      /edit\.kind === "cancel" \|\| edit\.kind === "flag"\)\) return fail\("That task is archived\."\);/.test(tasks)
  );
  const callers = (function walk(dir: string): string[] {
    return readdirSync(join(ROOT, dir)).flatMap((n) => {
      const p = `${dir}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
  })("src");
  eq("setMustCore's one caller is the calibration's Accept", callers.filter((f) => f !== "src/lib/tasks.ts" && /\bsetMustCore\b/.test(code(f))), ["src/lib/week-calibration-server.ts"]);
  const accept = srv.slice(srv.indexOf("export async function acceptCalibrationCore("));
  check(
    "Accept: only a change this week's calibration lists, each through its own core (Settings' capacity, the drawer's 'Not a must', setMustCore); nothing else is written",
    /if \(!c\) return fail\(CALIBRATION_NONE\);\s*const ch = c\.changes\.find\(\(x\) => x\.id === changeId\);\s*if \(!ch\) return fail\(CALIBRATION_NOT_OFFERED\);/.test(accept) &&
      /setDailyCapacityCore\(userId, ch\.minutes, now\)/.test(accept) &&
      /setCompulsoryCore\(userId, ch\.templateId, now\)/.test(accept) &&
      /setMustCore\(userId, ch\.templateId, now\)/.test(accept) &&
      !/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw/.test(srv)
  );
  const action = code("src/app/actions/calibration.ts");
  check("the action takes only the change's id and runs acceptCalibrationCore (refresh on request)", /"use server";/.test(read("src/app/actions/calibration.ts")) && /const res = await acceptCalibrationCore\(getCurrentUserId\(\), changeId\);/.test(action) && (action.match(/export async function/g) ?? []).length === 1);

  // ═══ §5 never prices, bands or kept-week floors ═══════════════════════════
  console.log("— §5 never prices —");
  const all = [two, five, eased, up, three, capWeeks].filter((x): x is WeekCalibration => !!x);
  const keys = new Set<string>();
  const walkKeys = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walkKeys);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        keys.add(k);
        walkKeys(x);
      }
  };
  all.forEach(walkKeys);
  check("a calibration carries no price, XP, MP, band, raw or floor: its keys are counts, sizes and words", ![...keys].some((k) => /^(xp|rawXp|mp|price|priced|band|bandOverride|raw|floor|floors|knee|receipt|factors)$/i.test(k)), [...keys].sort().join(","));
  const readers = callers.filter((f) => /from "(\.\/|@\/lib\/|\.\.\/(\.\.\/)?lib\/)week-calibration(-server)?"/.test(read(f)));
  eq(
    "who reads it: the audit's copy, its own server half, Today's three sources, the cards, the pages, the dev fixtures and the phone; never a pay path (life-grade, today-board's prices, settlement, the week judge, credits)",
    readers.sort(),
    [
      "src/app/actions/calibration.ts",
      "src/app/dev/style/today/TodayFixtures.tsx",
      "src/app/today/page.tsx",
      "src/app/today/rules/page.tsx",
      "src/app/today/week/page.tsx",
      "src/components/home/NextWeekBody.tsx",
      "src/components/home/NextWeekCard.tsx",
      "src/components/home/WeekReview.tsx",
      "src/lib/mobile-api-cores.ts",
      "src/lib/mobile-api-server.ts",
      "src/lib/mobile-api.ts",
      "src/lib/momentum-server.ts",
      "src/lib/week-audit-server.ts",
      "src/lib/week-audit.ts",
      "src/lib/week-calibration-server.ts",
    ]
  );
  check("the rules hold no Prisma, no clock and no randomness (week-calibration.ts)", !/from "\.\/prisma"|@prisma\/client|new Date\(\)|Date\.now|Math\.random/.test(code("src/lib/week-calibration.ts")));
  const priced = ["src/lib/life-grade.ts", "src/lib/today-board.ts", "src/lib/settlement-plan.ts", "src/lib/life-weeks.ts", "src/lib/credits.ts", "src/lib/streak-mult.ts", "src/lib/proof.ts"].filter((f) => /\bsizes\b|QuestSizes|calibration/i.test(code(f)));
  check("…and no pay path names the sizes or the calibration (life-grade, today-board, settlement-plan, life-weeks, credits, streak-mult, proof)", priced.length === 0, priced.join(", "));
  check("in momentum-server the sizes reach only the BODY and TASK fallbacks and the set's record", /function bodyOptions[\s\S]*?bodyMoveMinutes\(src\.weekEffortMinutes, src\.sizes\?\.move\)[\s\S]*?function taskOptions[\s\S]*?const any = src\.sizes\?\.any \?\? QUEST\.ANY_TASKS;/.test(ms) && (ms.match(/src\.sizes/g) ?? []).length === 3);

  // ═══ §6 the frozen copy ═══════════════════════════════════════════════════
  console.log("— §6 the frozen copy —");
  const T: AuditTemplate[] = [{ id: "gym", title: "Gym", kind: "HABIT", recurrence: "DAILY", startDay: "2026-10-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null }];
  const I = Array.from({ length: 7 }, (_, i) => ({ templateId: "gym", day: addDays(M43, i), status: i < 6 ? "DONE" : "MISSED" }));
  const audit = weekAuditOf({ week: { weekKey: "2026-W43", monday: M43, sunday: addDays(M43, 6) }, launchDay: "2026-10-05", templates: T, instances: I, today: "2026-10-26", now: new Date("2026-10-25T17:00:00.000Z") });
  const tracked = [200, 220, 180, 240, 210, 90, null];
  const cal = calibrationOf({ weekKey: audit.weekKey, monday: audit.monday, target: audit.target, daily: audit.daily, tracked }, [W42()], facts());
  const plainCopy = auditReceiptOf(audit, "2026-10-26");
  const fullCopy = auditReceiptOf(audit, "2026-10-26", { tracked, calibration: cal });
  check("a copy without the freeze's additions is exactly as before (no `tracked`, no `calibration` key)", !("tracked" in plainCopy) && !("calibration" in plainCopy) && same(auditReceiptOf(audit, "2026-10-26", {}), plainCopy));
  check("the freeze's copy keeps both, and they read back unchanged (version 1 still)", same(parseAuditReceipt(JSON.parse(JSON.stringify(fullCopy)))?.calibration, cal) && same(parseAuditReceipt(fullCopy)?.tracked, tracked) && fullCopy.v === 1);
  check("the ledger row is the same row with them: sink NONE, xp 0, never a streak day", (() => { const e = auditEventInput(audit, "2026-10-26", new Date(), { tracked, calibration: cal }); return e.sink === "NONE" && e.xp === 0 && e.countsForStreak === false && same((e.receipt as unknown as { calibration: unknown }).calibration, cal); })());
  check("a calibration this version did not write reads as none (the copy then has none); a bad size or a malformed tracked week too", parseCalibration({ ...cal, v: 2 }) === null && parseCalibration({ ...cal, sizes: { ...cal!.sizes, move: 25 } }) === null && parseTracked([1, 2, 3]) === null && parseTracked([1, 2, 3, 4, 5, 6, -1]) === null && !("calibration" in (parseAuditReceipt({ ...fullCopy, calibration: { v: 9 } }) ?? {})));
  check("calibrationRateOf is the audit's own rateOf", [0, 1, 5, 6, 11, 12, 13, 14].every((k) => calibrationRateOf({ kept: k, due: 14 }) === rateOf({ kept: k, due: 14 })) && calibrationRateOf({ kept: 0, due: 0 }) === rateOf({ kept: 0, due: 0 }));
  const was = code("src/lib/week-audit-server.ts");
  check(
    "freezeWeekAudit adds them after the week's facts (the read wave unchanged), then writes its one copy; the addition is soft (a failure freezes the copy without it)",
    // Re-pinned for blueprint P32 review: the audit's launch day goes with it (which weeks were calibrating).
    /const extra = await calibrationFreezeOf\(userId, \{ week, audit, held: facts\.held, asOf, today, now, launchDay \}\);\s*const input = auditEventInput\(audit, today, now, extra\);/.test(was) &&
      /\} catch \(err\) \{\s*console\.error\("Week audit: next week's calibration failed to read; the copy is frozen without it\.", err\);\s*return \{\};/.test(srv)
  );
  check("the tracked minutes are the ticks recorded by the copy's 04:00 (occurredAt ≤ asOf), held days left out", /occurredAt: \{ lte: asOf \}/.test(srv) && /const heldDays = held \? new Set\(\[\.\.\.held\.restDays, \.\.\.held\.freezeDays\]\) : null;/.test(srv));

  // ═══ §7 the words and the card ════════════════════════════════════════════
  console.log("— §7 the words and the card —");
  const words = all.flatMap((c) => [c.sizes.basis, c.capacity?.basis ?? "", ...c.changes.flatMap((ch) => [changeTitleOf(ch), ch.basis])]).concat([CALIBRATION_AUTO_NOTE, KEPT_LINE]);
  check("D17 / H12: no word the card shows names a rate or the audit's target (no '%' at all), Today included", words.every((w) => !/%/.test(w)), words.find((w) => /%/.test(w)) ?? "");
  check("neutral (H12): no fail, bad, poor, lazy, shame, behind, must do better, and no '!'", words.every((w) => !/\bfail|\bbad\b|\bpoor|\blazy|shame|\bbehind\b|do better|!/i.test(w)), words.find((w) => /\bfail|\bbad\b|\bpoor|\blazy|shame|\bbehind\b|do better|!/i.test(w)) ?? "");
  const view = nextWeekViewOf(eased!, { capacity: 240, templates: [{ id: "gym", compulsory: true, archived: false, pendingNotMustDay: null }] });
  eq("the card's view: the week, the sizes (lighter at 71%), each change open", [view.label, view.sizes.line, view.items.map((i) => `${i.id}:${i.state}`)], ["Week of 26 Oct", "Move 10 min · Finish any 2 tasks", ["capacity:open", "ease:gym:open"]]);
  const after = nextWeekViewOf(eased!, { capacity: eased!.capacity!.suggested, templates: [{ id: "gym", compulsory: true, archived: false, pendingNotMustDay: "2026-11-02" }] });
  eq("…accepted once it stands: the capacity planned, 'Not a must from Mon 2 Nov.' (pending, the akrasia horizon)", after.items.map((i) => [i.state, i.line]), [["accepted", `Planned at ${eased!.capacity!.suggested} min a day.`], ["accepted", "Not a must from Mon 2 Nov."]]);
  eq("…gone when its task left the board; a step-up accepted once it is a must", [nextWeekViewOf(eased!, { capacity: 240, templates: [] }).items[1].state, nextWeekViewOf(up!, { capacity: 240, templates: [{ id: "walk", compulsory: true, archived: false, pendingNotMustDay: null }] }).items.find((i) => i.kind === "step-up")?.line], ["gone", "A must now."]);
  check("itemLineOf: the Accept's own words first, then what stands, then Kept, else on offer", itemLineOf(view.items[0], { capacity: "Daily capacity set to 165 minutes." }, new Set()) === "Daily capacity set to 165 minutes." && itemLineOf(view.items[0], {}, new Set(["capacity"])) === KEPT_LINE && itemLineOf(view.items[0], {}, new Set()) === null && itemLineOf(after.items[1], {}, new Set(["ease:gym"])) === "Not a must from Mon 2 Nov.");
  const html = renderToStaticMarkup(createElement(NextWeekBody, { view, title: "Next week", headingId: "nw-h", busy: false, error: null, done: {}, kept: new Set(["ease:gym"]), onAccept: () => {}, onKeep: () => {} }));
  check(
    "the card: 'Next week · Week of 26 Oct', Today's three and why, then each suggestion with its basis and Accept / Keep (secondary and quiet, 44 px), a Keep reading 'Kept as it is.'",
    html.includes('<h2 id="nw-h"') &&
      html.includes('<span class="aside">Week of 26 Oct</span>') &&
      html.includes('<p class="nw-sizes">Move 10 min · Finish any 2 tasks</p>') &&
      html.includes(CALIBRATION_AUTO_NOTE.replace(/'/g, "&#x27;")) &&
      /<li class="nw-item" data-kind="capacity"><b class="nw-title">Plan \d+ min a day<\/b><span class="nw-basis">A median of [^<]+<\/span><div class="nw-acts"><button[^>]*class="btn btn-secondary"[^>]*>Accept<\/button><button[^>]*class="btn btn-quiet"[^>]*>Keep<\/button><\/div><\/li>/.test(html) &&
      /<li class="nw-item" data-kind="ease"><b class="nw-title">Gym: not a must<\/b><span class="nw-basis">[^<]+<\/span><span class="nw-state" role="status">Kept as it is\.<\/span><\/li>/.test(html),
    html.slice(0, 900)
  );
  check("…no '%' in the rendered card either", !/%/.test(html));
  const undoHtml = renderToStaticMarkup(createElement(NextWeekBody, { view, title: "Next week", headingId: "nw-h", busy: false, error: null, done: {}, kept: new Set(["ease:gym"]), onAccept: () => {}, onKeep: () => {}, onUnkeep: () => {} }));
  check(
    "a Keep can be taken back: 'Kept as it is.' with a quiet 44 px Undo beside it (a mis-tap never hides the offer for the week); an Accept's line has none",
    /<li class="nw-item" data-kind="ease"><b class="nw-title">Gym: not a must<\/b><span class="nw-basis">[^<]+<\/span><div class="nw-kept"><span class="nw-state" role="status">Kept as it is\.<\/span><button[^>]*class="btn btn-quiet"[^>]*>Undo<\/button><\/div><\/li>/.test(undoHtml) &&
      CALIBRATION_UNKEEP_WORD === "Undo" &&
      !/>Undo</.test(renderToStaticMarkup(createElement(NextWeekBody, { view, title: "Next week", headingId: "nw-h", busy: false, error: null, done: { "ease:gym": "Gym is not a must." }, kept: new Set(["ease:gym"]), onAccept: () => {}, onKeep: () => {}, onUnkeep: () => {} }))),
    undoHtml.slice(0, 1400)
  );
  const card = read("src/components/home/NextWeekCard.tsx");
  check(
    "NextWeekCard's Undo takes the id out of the stored list and out of this visit's Keeps",
    /writeKept\(keptKey, idsOf\(readKept\(keptKey\)\)\.filter\(\(id\) => id !== item\.id\)\);/.test(card) && /setKeptNow\(\(k\) => \(\{ \.\.\.k, \[item\.id\]: false \}\)\);/.test(card) && /onUnkeep=\{unkeep\}/.test(card)
  );
  const preTap = nextWeekViewOf(eased!, { capacity: 240, templates: [{ id: "gym", compulsory: true, archived: false, pendingNotMustDay: null, unflagFrom: "2026-11-02" }] });
  const upTap = nextWeekViewOf(up!, { capacity: 240, templates: [{ id: "walk", compulsory: false, archived: false, pendingNotMustDay: null, stake: "As a must, ≈ −4.2 if missed." }] });
  eq(
    "said before the tap (H13): an open ease names the day it would take effect once Duty is live, as the drawer's pill; an open step-up says what a must costs",
    [preTap.items.find((i) => i.kind === "ease")?.title, upTap.items.find((i) => i.kind === "step-up")?.basis, view.items.find((i) => i.kind === "ease")?.title],
    ["Gym: not a must from Mon 2 Nov", "Nearly every daily quest was kept last week, and each is Established; Walk is Automatic. As a must, ≈ −4.2 if missed.", "Gym: not a must"]
  );
  check(
    "loadNextWeek reads them by the drawer's own rule (classifyChange, akrasiaEffectiveDay) and the Must chip's (debtFor while Duty is live, the stakes line while announced); nothing while Duty is off",
    /const unflag = classifyChange\(\{ compulsory: t\.compulsory, compulsoryOnRest: t\.compulsoryOnRest \}, \{ compulsory: false \}, \{ createdAt: t\.createdAt, now, launched \}\);/.test(csrv) &&
      /unflagFrom: unflag === "deferred" \? akrasiaEffectiveDay\(today\) : null,/.test(csrv) &&
      /phase === "live"\s*\? `As a must, ≈ −\$\{formatDebt\(debtFor\(/.test(csrv) &&
      /: phase === "announced" && dutyLaunch\s*\? `\$\{stakesFromLine\(dutyLaunch\)\}\.`\s*: null;/.test(csrv)
  );
  const css = read("src/components/home/next-week.css");
  check("its CSS: tokens only (no hex, no rgb), every line free to wrap, the buttons wrap under the words", !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css) && /\.nw-acts \{ display: flex; flex-wrap: wrap;/.test(css) && (css.match(/overflow-wrap: anywhere/g) ?? []).length >= 5);
  const phone = checkCalibrationOf(view);
  check("the phone's `calibration` is the card's view, with no rate or target", same(phone?.changes.map((c) => c.id), view.items.map((i) => i.id)) && !/"rate"|"target"|%/.test(JSON.stringify(phone)) && checkCalibrationOf(null) === null);

  // ═══ §8 published ═════════════════════════════════════════════════════════
  console.log("— §8 published —");
  const lines = calibrationRuleLines();
  check(
    "the rules page's lines read every figure from the code (2 audits, 4 weeks, Move 10/20/30, any 2/3, 150, 15, 120, 7 days, 5 a day) and name the target in words only",
    lines.join(" ").includes("Once 2 weekly audits are frozen") &&
      lines.join(" ").includes("Move 10 min and any 2 tasks") &&
      lines.join(" ").includes("Move 30 min and any 3") &&
      lines.join(" ").includes("in 15-minute steps, at least 120") &&
      lines.join(" ").includes("it waits 7 days") &&
      lines.join(" ").includes("never past 5 daily quests a day") &&
      lines.includes("A calibration set from one of the audit's calibrating weeks (its first, before the target applies) keeps the standard sizes and the capacity unscaled, and offers no must or habit change.") &&
      !/\b85\b/.test(lines.join(" ")),
    lines.join(" | ")
  );
  const rules = code("src/app/today/rules/page.tsx");
  check("the rules page shows the card only once the weekly audit is in force", /const calibrationLive = isAuditLaunched\(today, auditLaunchDay\(\)\);/.test(rules) && /\{calibrationLive && <CalibrationRules \/>\}/.test(rules) && /\{calibrationRuleLines\(\)\.map\(\(line\) => \(/.test(rules));
  const todayPage = code("src/app/today/page.tsx");
  check("Today: the card on Mondays only ('This week'), started with the wave; a failure reads as none", /const nextWeekLoad = weekdayOf\(day\) === 1 \? loadNextWeek\(userId, now\)\.catch\(\(\) => null\) : Promise\.resolve\(null\);/.test(todayPage) && /nextWeek=\{nextWeek \? <NextWeekCard view=\{nextWeek\} title="This week" headingId="nw-today-h" \/> : null\}/.test(todayPage));
  check("TodayBoard draws it in the side column above the Main quest, never on a work tab", /\{!isWork && nextWeek != null && nextWeek !== false && <div className="o9">\{nextWeek\}<\/div>\}/.test(code("src/components/today/TodayBoard.tsx")));
  const weekPage = code("src/app/today/week/page.tsx");
  // Re-pinned for blueprint P32 review: after the rest list and the capacity (the step's meta line speaks of them), under its own heading.
  const review = code("src/components/home/WeekReview.tsx");
  check(
    "the review's step 5: only the calibration for the week after the reviewed one, after the rest list and CapacityPanel, headed 'Calibrated from last week' (the step is 'Next week')",
    /const nextWeek = calibrated && calibrated\.monday === addDays\(review\.monday, 7\) \? calibrated : null;/.test(weekPage) &&
      /nextWeek=\{nextWeek\}/.test(weekPage) &&
      /<\/section>\s*(?:\{\}\s*)?\{props\.nextWeek && <NextWeekCard view=\{props\.nextWeek\} title="Calibrated from last week" headingId="nw-run-h" \/>\}\s*\{feedback\}/.test(review) &&
      review.indexOf("<CapacityPanel") < review.indexOf('title="Calibrated from last week"')
  );
  const models = read("android/app/src/main/java/com/xtnl/app/data/Models.kt");
  const line = read("android/app/src/main/java/com/xtnl/app/core/CalibrationLine.kt");
  const screen = read("android/app/src/main/java/com/xtnl/app/ui/check/CheckScreen.kt");
  check(
    "Android: /check's `calibration` in Models.kt (the week, the sizes, the capacity note, each change's state), absent from an older server",
    /val calibration: CheckCalibration\? = null,/.test(models) &&
      /data class CalibrationSizes\(val move: Int = 20, val any: Int = 2, val line: String = "", val basis: String = ""\)/.test(models) &&
      /data class CalibrationChange\(\s*val id: String = "",\s*val kind: String = "",\s*val title: String = "",\s*val basis: String = "",\s*val state: String = "open",\s*val line: String\? = null,\s*\)/.test(models)
  );
  check("Android: the card's sizes note is the web card's word for word", line.includes(`const val SIZES_NOTE = "${CALIBRATION_AUTO_NOTE}"`));
  check(
    "Android: the card on both displays, right under the Week card (the cover screen's one column, the main display's second pane), only while the server sends one",
    (screen.match(/week\(data\.week\)\s*calibration\(data\.calibration\)\s*condition\(data\.skills\)/g) ?? []).length === 2 &&
      /if \(!CalibrationLine\.shows\(c\) \|\| c == null\) return/.test(screen)
  );
  check("Android: the demo sends a calibration (as a server with the audit on and two weeks frozen)", /calibration = calibration\(now\),/.test(read("android/app/src/main/java/com/xtnl/app/data/DemoApi.kt")));
  check("Android: versionCode 28 (2.16) or later for the calibration card", Number(/versionCode (\d+)\b/.exec(read("android/app/build.gradle"))?.[1] ?? 0) >= 28);
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check(
    "life:check runs this check right after side-quests-check; npm run calibration:check runs it alone",
    /tsx scripts\/side-quests-check\.ts && tsx scripts\/calibration-check\.ts && /.test(pkg.scripts["life:check"]) && pkg.scripts["calibration:check"] === "tsx scripts/calibration-check.ts"
  );

  console.log(`\ncalibration-check: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
