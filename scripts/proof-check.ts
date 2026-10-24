/**
 * Proof of work (blueprint 2.6, plan P23; decision D20, harms H9 and H10): the phase's own check. Pure: no database, no
 * network, no clock of its own (every core runs on an injected store and clock).
 *
 *   npx tsx scripts/proof-check.ts      (life:check runs it)
 *
 * It pins:
 *   1. The switch is inert: PROOF_LAUNCH_DAY null in code, the XTNL_ override outside production only, proofOn
 *      forward only.
 *   2. The minutes: clampMinutes' goldens stay (the drawer's clamp, 30 reported as 90 counts 60), and the clock bounds
 *      after the clamp (the plan's min(reported, wall, 480)); tickWallOf: a timer by what it ran, a report by that life
 *      day's previous live tick only, so today's tick and yesterday's record a minute apart count 90 each (H9).
 *   3. The receipt: no proof is the receipt byte for byte ('life-1', 'life-2' with momentum); a proof template's or an
 *      EXERCISE tick's is 'life-3' with `proof`; a 90-minute logged deep-work tick prices exactly as the basket row.
 *   4. The gate: a full tick of a proof template with no minutes and no timer is refused; the minimum version, #play,
 *      a study task, an automatic or a walk's completion are never gated; a chore still ticks in one tap (no row
 *      proof); a work tab's task is never gated; a day before the launch is never gated.
 *   5. BODY's effort, forward only: a receipt with no `proof` (every one before the launch) counts as before, a
 *      'life-3' EXERCISE receipt counts its minutes only when they were reported (momentum-server weekEffortOf,
 *      life-weeks effortMinutesOf, the week judge's rule).
 *   6. The board: with BoardData.proof absent every row and projection is exactly as before; with it, a proof row
 *      carries row.proof and its timer, and nothing else changes.
 *   7. The timers: startTimerCore / stopTimerCore on a fake store (writes off, proof off, one running timer a user,
 *      a resend of a clientId, a stop that is idempotent and works after a rollback); loadBoardProof and
 *      readCompletionProof read nothing while proof is off; a timer survives a reload (it is the store's row). A timer
 *      is a task's segments of one day (Resume adds one; segmentsWith, segmentSharesOf); one left running for days is
 *      stopped by a fresh start; Discard closes it counting nothing; two devices starting at once both get an answer.
 *      A timer sits on its own day's row (timerBelongsTo), and one across 04:00 or past twice the estimate asks first.
 *   8. Capture: '#proof' opts a task or a habit in; a goal or an idea leaves it as text; the server writes the column
 *      only for such a line.
 *   9. The default deep-work set: isDefaultDeepWork's goldens, and scripts/proof-dry-run.ts is read only, guarded, and
 *      never reads or writes TaskTemplate.proof.
 *  10. The migration is additive (BEGIN/COMMIT, a nullable column, a new table, timestamptz, its CHECKs named in the
 *      schema), and the schema carries it; TaskSession is written only by task-sessions-server.ts (and the one column
 *      a tick sets), which writes no ledger row.
 *  11. The web: a proof row draws its timer chip (44 px) and says it takes its minutes; its tick with neither opens the
 *      drawer's chips (focus on the first, the reason announced, the tick's name saying so); a chore row draws exactly
 *      as before and ticks in one tap; the drawer's Done waits for minutes on a proof row only, reads the timer live
 *      (under a minute is none) and prices it as the server counts it; a stopped timer has Resume and Discard; a
 *      Record yesterday row has no timer; the chips span the estimate; the capture chips say what is in force; the
 *      rules page shows its card only once proof is in force.
 */
import "./_no-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prisma } from "@prisma/client";
import { TaskRow } from "../src/components/today/TaskRow";
import { TaskDrawer } from "../src/components/today/TaskDrawer";
import { CaptureChips } from "../src/components/capture/CaptureChips";
import { tickNameOf } from "../src/components/today/board-ui";
import { MINUTE_CHIPS, type BoardRow } from "../src/lib/today-board";
import { clampMinutes, describeReceipt, priceTask, FORMULA_VERSION, FORMULA_VERSION_MOMENTUM, FORMULA_VERSION_PROOF } from "../src/lib/life-grade";
import {
  DEEP_WORK_CATEGORIES,
  DEEP_WORK_MIN_BAND,
  PROOF_CHIP_LABEL,
  PROOF_COUNTS_NOTE,
  PROOF_LAUNCH_DAY,
  PROOF_LAUNCH_DAY_ENV,
  PROOF_MINUTES_REFUSAL,
  TIMER_CROSSED,
  TIMER_GONE,
  TIMER_OFF,
  TIMER_TEMPLATE_REFUSAL,
  TIMER_WRITES_OFF,
  exerciseMinutesCount,
  groupMinutesOf,
  isDefaultDeepWork,
  openTimersOf,
  pagesCaptureLabelOf,
  priceProofOf,
  proofChipLabelOf,
  proofGated,
  proofLaunchDay,
  proofMinuteChipsOf,
  proofOn,
  proofRefusalOf,
  segmentSharesOf,
  segmentsWith,
  sessionForTick,
  tickWallOf,
  timerBelongsTo,
  timerConfirmOf,
  timerLabelOf,
  timerMinutesOf,
  wallMinutesOf,
  type SessionRow,
  type TimerView,
} from "../src/lib/proof";
import { discardTimerCore, loadBoardProof, readCompletionProof, startTimerCore, stopTimerCore, type SessionStore, type TimerTemplate } from "../src/lib/task-sessions-server";
import { buildBoard, planCompletion, statsFor, type BoardData, type BoardTemplate, type DayLedger } from "../src/lib/today-board";
import { weekEffortOf } from "../src/lib/momentum-server";
import { effortMinutesOf, type WeekTaskRow } from "../src/lib/life-weeks";
import { parseCapture } from "../src/lib/capture-parse";
import { normTitleOf } from "../src/lib/life-lexicon";
import { parseRule } from "../src/lib/recurrence";
import { addDays, type DayKey } from "../src/lib/life-day";
import type { PriceInput, Receipt } from "../src/lib/life-types";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** Source without comments, so a word in a doc comment never passes for code. */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
}
const section = (s: string) => console.log(`\n── ${s}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const LAUNCH: DayKey = "2026-10-26";
const TODAY: DayKey = "2026-10-27";
const YESTERDAY = addDays(TODAY, -1);
const NOW = new Date("2026-10-27T01:00:00.000Z"); // 12:00 Sydney, life day 2026-10-27
const at = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60_000);

// ── 1. The switch ───────────────────────────────────────────────────────────

section("1. the switch is inert");
check("PROOF_LAUNCH_DAY is null in code (flipped only on the user's go)", PROOF_LAUNCH_DAY === null);
check("its override's name is XTNL_PROOF_LAUNCH_DAY", PROOF_LAUNCH_DAY_ENV === "XTNL_PROOF_LAUNCH_DAY");
check("in production the override is ignored", proofLaunchDay({ NODE_ENV: "production", XTNL_PROOF_LAUNCH_DAY: LAUNCH }) === null);
check("outside production a valid override sets it; a bad one is ignored", proofLaunchDay({ NODE_ENV: "development", XTNL_PROOF_LAUNCH_DAY: LAUNCH }) === LAUNCH && proofLaunchDay({ NODE_ENV: "development", XTNL_PROOF_LAUNCH_DAY: "2026-02-30" }) === null);
check("proofOn: forward only, never without a launch day", proofOn(LAUNCH, LAUNCH) && proofOn(TODAY, LAUNCH) && !proofOn(addDays(LAUNCH, -1), LAUNCH) && !proofOn(TODAY, null));

// ── 2. The minutes ──────────────────────────────────────────────────────────

section("2. the minutes: the plan's min(reported, wall, 480), the clamp first");
check("clampMinutes' goldens stay: 30 reported as 90 counts 60, as 10 counts 15, none counts the estimate", clampMinutes(90, 30) === 60 && clampMinutes(10, 30) === 15 && clampMinutes(null, 30) === 30 && clampMinutes(45, 30) === 45);
// Re-pinned (review): the clock applies after the clamp, so it is a real bound (the plan's formula), never a raise.
check(
  "the clock bounds after the clamp: 90 with 40 on the clock counts 40; an Again 5 minutes on reporting 240 of 120 counts 5; at least 1; a long wall changes nothing",
  clampMinutes(90, 90, 40) === 40 && clampMinutes(240, 120, 5) === 5 && clampMinutes(90, 90, 0) === 1 && clampMinutes(60, 90, 75) === 60 && clampMinutes(90, 90, 120) === 90 && clampMinutes(90, 90, null) === 90
);
check("the clock never raises a report past its clamp: 30 of 90 with 600 on the clock counts the clamp's 45", clampMinutes(30, 90, 600) === 45 && clampMinutes(20, 90, 20) === 20);
check("never past 480", clampMinutes(600, 400) === 480 && clampMinutes(480, 300, 900) === 480);
check(
  "wallMinutesOf: from the later of a start and a previous tick; null with neither; 0..480",
  wallMinutesOf({ startedAt: at(90), prevTickAt: at(30), end: NOW }) === 30 &&
    wallMinutesOf({ startedAt: at(30), prevTickAt: at(90), end: NOW }) === 30 &&
    wallMinutesOf({ startedAt: null, prevTickAt: null, end: NOW }) === null &&
    wallMinutesOf({ startedAt: at(900), end: NOW }) === 480 &&
    wallMinutesOf({ startedAt: at(-5), end: NOW }) === 0
);
check("a stopped timer's minutes run to its stop", wallMinutesOf({ startedAt: at(60), end: at(10) }) === 50);
check(
  "tickWallOf: a timer's count is bounded by what it ran; a report by the time since that day's previous tick, live only; a first tick and a record of yesterday by nothing (H9)",
  tickWallOf({ timed: 20, prevTickAt: at(5), day: TODAY, today: TODAY, now: NOW }) === 20 &&
    tickWallOf({ prevTickAt: at(5), day: TODAY, today: TODAY, now: NOW }) === 5 &&
    tickWallOf({ prevTickAt: null, day: TODAY, today: TODAY, now: NOW }) === null &&
    tickWallOf({ prevTickAt: at(1), day: YESTERDAY, today: TODAY, now: NOW }) === null
);
/**
 * The review's repro for the clock (H9's batched-logging trap), run in section 6 once the board's templates exist:
 * today's tick and yesterday's record a minute apart, both at 90 on an estimate of 90. Each tick's bound reads only its
 * own life day's earlier live ticks (task-sessions-server tickFacts(…, day)), so neither is cut, in either order.
 */
const clockRepro = () => {
  const deep = { ...TEMPLATES[0], proof: "MINUTES" as const, dueDay: null, dueKind: null };
  const todayFirst = planCompletion({ template: deep, day: TODAY, today: TODAY, slot: 0, minutes: 90, ledger: ledgerOf(TODAY), streakDays: 0, proof: { launchDay: LAUNCH, wall: tickWallOf({ prevTickAt: null, day: TODAY, today: TODAY, now: NOW }) } });
  const yesterdayAfter = planCompletion({ template: deep, day: YESTERDAY, today: TODAY, slot: 0, minutes: 90, ledger: ledgerOf(YESTERDAY), streakDays: 0, proof: { launchDay: LAUNCH, wall: tickWallOf({ prevTickAt: at(1), day: YESTERDAY, today: TODAY, now: NOW }) } });
  const againSoon = planCompletion({ template: deep, day: TODAY, today: TODAY, slot: 1, minutes: 90, ledger: ledgerOf(TODAY), streakDays: 0, proof: { launchDay: LAUNCH, wall: tickWallOf({ prevTickAt: at(5), day: TODAY, today: TODAY, now: NOW }) } });
  check(
    "today's tick then yesterday's record a minute apart, both 90 on 90, count 90 each (either order); a real Again 5 minutes on counts 5",
    todayFirst.receipt.minutes === 90 && yesterdayAfter.receipt.minutes === 90 && againSoon.receipt.minutes === 5,
    `${todayFirst.receipt.minutes}, ${yesterdayAfter.receipt.minutes}, ${againSoon.receipt.minutes}`
  );
};

// ── 3. The receipt ──────────────────────────────────────────────────────────

section("3. the receipt: 'life-3' only with proof, the price unchanged for a logged tick");
const deepWork: PriceInput = { band: "DEMANDING", bandOverride: 0, machineMinutes: 90, estMinutes: 90, minutes: null, timing: "ON_TIME", recurring: false, streakDays: 0, repeatN: 1, introBefore: 0, mode: "FULL" };
const plain = priceTask(deepWork, { rawBefore: 0 }, "CRAFT");
check("no proof is the receipt byte for byte ('life-1'; null and absent alike)", same(plain, priceTask(deepWork, { rawBefore: 0 }, "CRAFT", null, null)) && plain.v === FORMULA_VERSION && plain.v === "life-1" && !("proof" in plain));
const logged = priceTask({ ...deepWork, minutes: 90 }, { rawBefore: 0 }, "CRAFT", null, { gated: true, wall: null });
check(
  "a 90-minute logged deep-work tick prices exactly as the basket row (25.0), 'life-3', proof {reported 90, gated, no bound}",
  logged.raw === plain.raw && logged.raw === 25 && logged.xp === plain.xp && logged.v === FORMULA_VERSION_PROOF && logged.v === "life-3" && same(logged.proof, { reported: 90, gated: true, wall: null }),
  describeReceipt(logged)
);
const bounded = priceTask({ ...deepWork, minutes: 90 }, { rawBefore: 0 }, "CRAFT", null, { gated: true, wall: 40, session: "ts1" });
// Re-pinned (review): the plan's formula, so the note says what was counted and the two never contradict.
check(
  "the clock bounds a report: 90 with 40 on the clock counts 40, said on E ('reported 90 min, 40 on the clock, counted 40'), the timer named",
  bounded.minutes === 40 && bounded.factors.find((f) => f.key === "E")?.note === "reported 90 min, 40 on the clock, counted 40" && same(bounded.proof, { reported: 90, gated: true, wall: 40, session: "ts1" })
);
const timed20 = priceTask({ ...deepWork, minutes: 20 }, { rawBefore: 0 }, "CRAFT", null, { gated: true, wall: 20, session: "ts1" });
check("a 20-minute timer on a 90-minute task counts its 20 (no half-estimate floor over the clock), with no note", timed20.minutes === 20 && timed20.factors.find((f) => f.key === "E")?.note === undefined);
const exercise = priceTask({ ...deepWork, band: "STANDARD", estMinutes: 30, machineMinutes: 30 }, { rawBefore: 0 }, "BODY", null, { gated: false, wall: 5 });
check("an EXERCISE tick records only whether minutes came: the price as before, no bound (gated false), reported null", exercise.raw === priceTask({ ...deepWork, band: "STANDARD", estMinutes: 30, machineMinutes: 30 }, { rawBefore: 0 }, "BODY").raw && same(exercise.proof, { reported: null, gated: false, wall: null }));
const withMomentum = priceTask(deepWork, { rawBefore: 0 }, "CRAFT", { perks: { mult: 1.04, names: ["Steady hand"] } }, { gated: true, wall: null });
check("momentum and proof together: 'life-3' (the newer formula), S kept", withMomentum.v === "life-3" && withMomentum.factors.some((f) => f.key === "S") && priceTask(deepWork, { rawBefore: 0 }, "CRAFT", { perks: { mult: 1.04, names: ["Steady hand"] } }).v === FORMULA_VERSION_MOMENTUM);

// ── 4. The gate ─────────────────────────────────────────────────────────────

section("4. the gate: deep work only (H9)");
const proofT = { proof: "MINUTES", category: "WORK", boardId: null };
const choreT = { proof: null, category: "CHORE", boardId: null };
const exerciseT = { proof: null, category: "EXERCISE", boardId: null };
check("proofGated: a proof template on the personal Board from the launch day; never a chore, a work tab's task or a day before it", proofGated(proofT, TODAY, LAUNCH) && !proofGated(choreT, TODAY, LAUNCH) && !proofGated({ ...proofT, boardId: "b1" }, TODAY, LAUNCH) && !proofGated(proofT, addDays(LAUNCH, -1), LAUNCH) && !proofGated(proofT, TODAY, null));
check(
  "priceProofOf: null while off and for a chore (the receipt as before); gated for a proof template; recorded (gated false) for EXERCISE",
  priceProofOf(proofT, TODAY, { launchDay: null }) === null &&
    priceProofOf(proofT, TODAY, null) === null &&
    priceProofOf(choreT, TODAY, { launchDay: LAUNCH }) === null &&
    same(priceProofOf(proofT, TODAY, { launchDay: LAUNCH, wall: 33.6, session: "ts1" }), { gated: true, wall: 34, session: "ts1" }) &&
    same(priceProofOf(exerciseT, TODAY, { launchDay: LAUNCH, wall: 33 }), { gated: false, wall: null })
);
check(
  "proofRefusalOf: a full tick with no minutes and no timer is refused ('Log the minutes'); minutes or a timer pass",
  proofRefusalOf({ gated: true, minutes: null }) === PROOF_MINUTES_REFUSAL && PROOF_MINUTES_REFUSAL.startsWith("Log the minutes") && proofRefusalOf({ gated: true, minutes: 45 }) === null && proofRefusalOf({ gated: true, sessionId: "ts1" }) === null && proofRefusalOf({ gated: true, minutes: 0 }) === PROOF_MINUTES_REFUSAL
);
check("the minimum version, an automatic completion and a row that pays nothing (#play, study) are never gated; a chore never", proofRefusalOf({ gated: true, mvv: true }) === null && proofRefusalOf({ gated: true, auto: true }) === null && proofRefusalOf({ gated: true, pays: false }) === null && proofRefusalOf({ gated: false }) === null);
const tasksSrc = code("src/lib/tasks.ts");
check(
  "tasks.ts: the tick reads the proof only while it is in force (readCompletionProof), refuses through proofRefusalOf, prices with the template's kind, and counts its timer once (countSessionOp)",
  /readCompletionProof\(userId, templateId, day\),/.test(tasksSrc) &&
    /const refusal = proofRefusalOf\(\{ gated, mvv: a\.mvv, auto: a\.auto \|\| !!a\.workoutId, pays, minutes \}\);/.test(tasksSrc) &&
    /template: proof\.template,/.test(tasksSrc) &&
    // Re-pinned (review): a timer's segments are counted once, and the row's timers a report replaced are closed.
    /if \(proof\.segments\.length > 0\) ops\.push\(\.\.\.countSessionOps\(userId, proof\.segments, plan\.receipt\.minutes, a\.now\)\);/.test(tasksSrc) &&
    /if \(proof\.closes\.length > 0\) ops\.push\(\.\.\.closeSessionOps\(userId, proof\.closes, a\.now\)\);/.test(tasksSrc)
);
check(
  "tasks.ts: the clock bound is tickWallOf (a timer by what it ran, a report by that day's previous live tick), a named timer must be this row's (TIMER_OTHER_DAY), and a manual tick closes the row's other timers",
  /const wall = gated && minutes != null \? tickWallOf\(\{ timed: fromTimer \? timed : null, prevTickAt: p\.prevTickAt, day: a\.day, today: a\.today, now: a\.now \}\) : null;/.test(tasksSrc) &&
    /if \(!mine\.some\(\(g\) => g\.some\(\(s\) => s\.id === named\.id\)\)\) return fail\(TIMER_OTHER_DAY\);/.test(tasksSrc) &&
    /timerBelongsTo\(groupTimerOf\(g\), a\.day, a\.today\)/.test(tasksSrc) &&
    /const closes = !a\.auto && !a\.workoutId \? mine\.flat\(\)/.test(tasksSrc)
);
check(
  "task-sessions-server: the previous tick is that life day's own (tickFacts(…, day): day: dateColumn(day)), never a record of yesterday's or another day's",
  /tickFacts: async \(userId, templateId, day\) =>/.test(code("src/lib/task-sessions-server.ts")) && /where: \{ userId, templateId, day: dateColumn\(day\), status: \{ in: DONE_STATUSES \}/.test(code("src/lib/task-sessions-server.ts"))
);
// Re-pinned for P24: the same condition also holds a reading task (pagesGated) to its whole tick.
check(
  "tasks.ts: a proof task's steps are a checklist (paid by its whole tick with its minutes)",
  /if \(read\.proof && \(proofGated\(read\.proof\.kind \? \{ \.\.\.t, proof: read\.proof\.kind \} : t, day, read\.proof\.launchDay\) \|\| pagesGated\(t, day, read\.proof\.launchDay\)\)\) \{/.test(tasksSrc)
);
check("tasks.ts: the board reads the proof kinds and timers only through loadBoardProof (null with no read while off)", /loadBoardProof\(userId, day\),/.test(tasksSrc) && /if \(!proof\) return \{ \.\.\.read\.core, dueNow, duty: read\.duty, roadmapGoals, styles, subtasks \};/.test(tasksSrc));

// ── 5. BODY's effort, forward only (H10) ─────────────────────────────────────

section("5. BODY's effort counts an EXERCISE tick's minutes only when reported, from the launch forward (H10)");
const r30: Receipt = { v: "life-1", factors: [{ key: "B", label: "Standard", value: 10 }], minutes: 30, raw: 10, kneeBefore: 0, xp: 10, track: "BODY" };
const r30proofNone: Receipt = { ...r30, v: "life-3", proof: { reported: null, gated: false, wall: null } };
const r30proofReported: Receipt = { ...r30, v: "life-3", proof: { reported: 30, gated: false, wall: null } };
check("exerciseMinutesCount: a receipt with no proof (every one before the launch) counts; a 'life-3' one only with its minutes reported", exerciseMinutesCount(r30) && exerciseMinutesCount(null) && !exerciseMinutesCount(r30proofNone) && exerciseMinutesCount(r30proofReported));
const effortRow = (id: string, receipt: Receipt) => ({ id, source: "TASK", dedupeKey: `task:${id}`, receipt, category: "EXERCISE" });
check(
  "momentum-server weekEffortOf (the Move quest's week): 30 before the launch, 0 unreported after it, 30 reported",
  weekEffortOf([effortRow("a", r30)]) === 30 && weekEffortOf([effortRow("b", r30proofNone)]) === 0 && weekEffortOf([effortRow("c", r30proofReported)]) === 30 && weekEffortOf([effortRow("a", r30), effortRow("b", r30proofNone), effortRow("c", r30proofReported)]) === 60
);
const weekRow = (id: string, day: DayKey, receipt: Receipt): WeekTaskRow => ({ id, source: "TASK", dedupeKey: `task:${id}`, day, track: "BODY", templateId: "gym", rawXp: 10, receipt, category: "EXERCISE" });
const monday: DayKey = "2026-10-19";
check(
  "life-weeks (the kept-week judge's rule): a week before the launch keeps its effort (never re-judged); from the launch an unreported tick adds none",
  effortMinutesOf([weekRow("w1", monday, r30), weekRow("w2", addDays(monday, 1), r30)], monday, addDays(monday, 6)) === 60 &&
    effortMinutesOf([weekRow("w3", addDays(monday, 7), r30proofNone), weekRow("w4", addDays(monday, 8), r30proofReported)], addDays(monday, 7), addDays(monday, 13)) === 30
);
check(
  "momentum-server's day facts and life-weeks read the same rule (exerciseMinutesCount), and the walk's top-up takes off only counted minutes",
  /t\?\.category === "EXERCISE" && exerciseMinutesCount\(e\.receipt as Receipt \| null\)/.test(code("src/lib/momentum-server.ts")) &&
    /if \(!exerciseMinutesCount\(r\.receipt\)\) continue;/.test(code("src/lib/life-weeks.ts")) &&
    /if \(!exerciseMinutesCount\(receipt as Pick<Receipt, "proof">\)\) return 0;/.test(code("src/lib/exercise-server.ts"))
);

// ── 6. The board ────────────────────────────────────────────────────────────

section("6. the board: exactly as before without BoardData.proof; a proof row with it");
function tpl(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: normTitleOf(p.title), recurrence: null, dueDay: null, dueKind: null, intrinsic: false, autoMetric: null, mvv: null, track: "CRAFT", band: "STANDARD", bandOverride: 0,
    estMinutes: 30, machineMinutes: 30, kind: "TASK", inbox: false, startDay: addDays(TODAY, -30), horizon: null, parentId: null, krMetric: null, krTarget: null, krUnit: null,
    compulsory: false, autoTarget: null, category: "OTHER", lexicalBand: p.band ?? "STANDARD", aiBand: null, gradeSource: "LEXICAL", gradeConfidence: 0.4, gradeBasis: null,
    gradeModel: null, gradePromptVersion: null, gradeAttempts: 1, gradeFrozen: true, sizing: false, bandOverrideAt: null, gradeFrozenAt: null, topAttribute: null, note: null,
    completedAt: null, createdAt: "2026-06-01T00:00:00.000Z", sortOrder: 0, ...p,
  };
}
const ledgerOf = (day: DayKey): DayLedger => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null });
const TEMPLATES = [
  tpl({ id: "thesis", title: "Write the thesis chapter", category: "WORK", band: "DEMANDING", estMinutes: 90, machineMinutes: 90, dueDay: TODAY, dueKind: "PLANNED" }),
  tpl({ id: "dishes", title: "Dishes", category: "CHORE", band: "INTRO", estMinutes: 15, machineMinutes: 15, recurrence: "DAILY", track: "DUTY" }),
  tpl({ id: "walk", title: "Walk", category: "EXERCISE", estMinutes: 30, machineMinutes: 30, recurrence: "DAILY", track: "BODY" }),
];
function data(templates: BoardTemplate[], proof?: BoardData["proof"]): BoardData {
  const stats: BoardData["stats"] = {};
  for (const t of templates) {
    const rule = t.recurrence ? parseRule(t.recurrence) : null;
    if (rule) stats[t.id] = statsFor(t, rule, [], TODAY);
  }
  return { today: TODAY, yesterday: YESTERDAY, capacityMin: 240, templates, instances: [], stats, ledger: { today: ledgerOf(TODAY), yesterday: ledgerOf(YESTERDAY) }, paid: {}, goalQty: {}, dueNow: 0, ...(proof ? { proof } : {}) };
}
const rowsOf = (d: BoardData) => {
  const b = buildBoard(d, [], NOW.getTime());
  return [...b.must, ...b.todayRows, ...b.anytime];
};
const off = rowsOf(data(TEMPLATES));
const offWithKinds = rowsOf(data(TEMPLATES.map((t) => (t.id === "thesis" ? { ...t, proof: "MINUTES" as const } : t))));
check(
  "without BoardData.proof: no row carries proof, every projection is 'life-1', and a proof kind on a template changes nothing",
  off.length === 3 && off.every((r) => r.proof === undefined && r.projection.v === "life-1") && same(off.map((r) => r.projection), offWithKinds.map((r) => r.projection)) && offWithKinds.every((r) => r.proof === undefined)
);
const timer = { sessionId: "ts1", templateId: "thesis", day: TODAY, startedAt: at(20).toISOString(), endedAt: null, running: true, priorMinutes: 0 };
const on = rowsOf(data(TEMPLATES.map((t) => (t.id === "thesis" ? { ...t, proof: "MINUTES" as const } : t)), { launchDay: LAUNCH, timers: [timer] }));
const row = (id: string) => on.find((r) => r.template.id === id)!;
check("with it: the proof row carries row.proof and its timer; its projection is 'life-3' at the same price", same(row("thesis").proof, { timer }) && row("thesis").projection.v === "life-3" && row("thesis").projection.raw === off.find((r) => r.template.id === "thesis")!.projection.raw);
check("a chore still ticks in one tap: no row.proof, its projection byte for byte as before", row("dishes").proof === undefined && same(row("dishes").projection, off.find((r) => r.template.id === "dishes")!.projection));
check("an EXERCISE row is not gated (no row.proof) and prices as before; its projection records no reported minutes ('life-3')", row("walk").proof === undefined && row("walk").projection.raw === off.find((r) => r.template.id === "walk")!.projection.raw && row("walk").projection.v === "life-3" && row("walk").projection.proof?.reported === null);
const before = rowsOf(data(TEMPLATES.map((t) => (t.id === "thesis" ? { ...t, proof: "MINUTES" as const } : t)), { launchDay: addDays(TODAY, 1), timers: [] }));
check("a launch day after today gates nothing (forward only)", before.every((r) => r.proof === undefined));
const plan = planCompletion({ template: { ...TEMPLATES[0], proof: "MINUTES" }, day: TODAY, today: TODAY, slot: 0, minutes: 90, ledger: ledgerOf(TODAY), streakDays: 0, proof: { launchDay: LAUNCH, wall: 25, session: "ts1" } });
// Re-pinned (review): the plan's formula, the clock after the clamp (25, not the half estimate's 45).
check("the server's plan: the wall bound and the timer reach the receipt", plan.receipt.v === "life-3" && plan.receipt.minutes === 25 && same(plan.receipt.proof, { reported: 90, gated: true, wall: 25, session: "ts1" }));
clockRepro();
{
  // Review: a timer belongs to its own day's row. A daily proof habit missed yesterday, with today's timer running:
  // the Record yesterday row carries no timer (a timer can only time today; today's never counts for yesterday).
  const habit = tpl({ id: "essay", title: "Essay", category: "WORK", band: "DEMANDING", estMinutes: 90, machineMinutes: 90, recurrence: "DAILY", proof: "MINUTES", startDay: addDays(TODAY, -30) });
  const running = { sessionId: "s1", templateId: "essay", day: TODAY, startedAt: at(20).toISOString(), endedAt: null, running: true, priorMinutes: 0 };
  const b = buildBoard(data([habit], { launchDay: LAUNCH, timers: [running] }), [], NOW.getTime());
  const todayRow = [...b.must, ...b.todayRows, ...b.anytime].find((r) => r.template.id === "essay");
  const yRow = b.yesterdayRows.find((r) => r.template.id === "essay");
  check(
    "today's row carries today's timer; the Record yesterday row of the same habit carries none",
    !!todayRow && todayRow.proof?.timer?.sessionId === "s1" && (!yRow || (yRow.proof != null && yRow.proof.timer === null)),
    `yesterday row: ${yRow ? JSON.stringify(yRow.proof) : "none"}`
  );
  const crossed = { ...running, day: YESTERDAY, startedAt: at(600).toISOString() };
  const stoppedYesterday = { ...running, day: YESTERDAY, endedAt: at(500).toISOString(), running: false };
  check(
    "timerBelongsTo: today's row takes today's timer and one still running from yesterday (across 04:00); yesterday's record takes yesterday's stopped one only",
    timerBelongsTo(running, TODAY, TODAY) && timerBelongsTo(crossed, TODAY, TODAY) && !timerBelongsTo(stoppedYesterday, TODAY, TODAY) &&
      !timerBelongsTo(running, YESTERDAY, TODAY) && !timerBelongsTo(crossed, YESTERDAY, TODAY) && timerBelongsTo(stoppedYesterday, YESTERDAY, TODAY) &&
      !timerBelongsTo({ ...crossed, day: addDays(TODAY, -2) }, TODAY, TODAY)
  );
  check(
    "timerConfirmOf: one tap counts a timer of the row's day inside twice its estimate; one across 04:00, or past twice it, asks first",
    timerConfirmOf(running, TODAY, 90, NOW) === null && timerConfirmOf(crossed, TODAY, 90, NOW) === TIMER_CROSSED && /more than twice its estimate: was it left running\? Done counts at most 180/.test(timerConfirmOf({ ...running, startedAt: at(200).toISOString() }, TODAY, 90, NOW) ?? "")
  );
}

// ── 7. The timers ───────────────────────────────────────────────────────────

section("7. the timers (TaskSession): one at a time, counted once, a row that survives a reload");
function fakeStore() {
  const rows: (SessionRow & { userId: string })[] = [];
  const calls: string[] = [];
  const templates: Record<string, TimerTemplate> = {
    thesis: { id: "thesis", kind: "TASK", boardId: null, archivedAt: null, autoMetric: null },
    essay: { id: "essay", kind: "HABIT", boardId: null, archivedAt: null, autoMetric: null },
    goal: { id: "goal", kind: "GOAL", boardId: null, archivedAt: null, autoMetric: null },
    work: { id: "work", kind: "TASK", boardId: "b1", archivedAt: null, autoMetric: null },
  };
  let n = 0;
  const store: SessionStore = {
    template: async (_u, id) => (calls.push("template"), templates[id] ?? null),
    byClientId: async (u, c) => (calls.push("byClientId"), rows.find((r) => r.userId === u && r.clientId === c) ?? null),
    byId: async (u, id) => (calls.push("byId"), rows.find((r) => r.userId === u && r.id === id) ?? null),
    running: async (u) => (calls.push("running"), rows.filter((r) => r.userId === u && r.endedAt == null)),
    start: async (u, d) => {
      calls.push("start");
      for (const r of rows) if (r.userId === u && r.endedAt == null) r.endedAt = d.startedAt;
      const row = { userId: u, id: `ts${++n}`, templateId: d.templateId, day: d.day, startedAt: d.startedAt, endedAt: null, minutes: null, source: d.source, clientId: d.clientId };
      rows.push(row);
      return row;
    },
    stop: async (u, id, when) => {
      calls.push("stop");
      const r = rows.find((x) => x.userId === u && x.id === id);
      if (r && r.endedAt == null) r.endedAt = when;
      return r ?? null;
    },
    open: async (u, since) => (calls.push("open"), rows.filter((r) => r.userId === u && r.minutes == null && r.day >= since)),
    openOf: async (u, t, since) => (calls.push("openOf"), rows.filter((r) => r.userId === u && r.templateId === t && r.minutes == null && r.day >= since)),
    close: async (u, ids, when) => {
      calls.push("close");
      for (const r of rows) {
        if (r.userId !== u || !ids.includes(r.id) || r.minutes != null) continue;
        if (r.endedAt == null) r.endedAt = when;
        r.minutes = 0;
      }
    },
    proofKinds: async () => (calls.push("proofKinds"), [{ id: "thesis", proof: "MINUTES" }, { id: "odd", proof: "PAGES" }]),
    tickFacts: async (_u, _t, day) => (calls.push(`tickFacts:${day}`), { proof: "MINUTES", prevTickAt: day === TODAY ? at(300) : null }),
  };
  return { store, rows, calls };
}

void (async () => {
  const live = { NODE_ENV: "production" } as const;
  {
    const f = fakeStore();
    const offWrites = await startTimerCore("u1", { templateId: "thesis", clientId: "c1", source: "web" }, { store: f.store, now: () => NOW, launchDay: LAUNCH, env: { NODE_ENV: "development" } });
    const offProof = await startTimerCore("u1", { templateId: "thesis", clientId: "c1", source: "web" }, { store: f.store, now: () => NOW, launchDay: null, env: live });
    check("a start needs live writes (a dev server records nothing) and proof in force (TIMER_OFF), reading nothing first", !offWrites.ok && offWrites.error === TIMER_WRITES_OFF && !offProof.ok && offProof.error === TIMER_OFF && f.calls.length === 0);
  }
  {
    const f = fakeStore();
    const deps = { store: f.store, now: () => NOW, launchDay: LAUNCH, env: live };
    const a = await startTimerCore("u1", { templateId: "thesis", clientId: "c1", source: "web" }, deps);
    const again = await startTimerCore("u1", { templateId: "thesis", clientId: "c1", source: "web" }, deps);
    const sameTpl = await startTimerCore("u1", { templateId: "thesis", clientId: "c2", source: "phone" }, deps);
    check("a start opens one timer; a resend of its clientId and a second start of the same task answer it (no second row)", a.ok && again.ok && sameTpl.ok && a.value.sessionId === again.value.sessionId && a.value.sessionId === sameTpl.value.sessionId && f.rows.length === 1 && a.value.running);
    const later = { ...deps, now: () => new Date(NOW.getTime() + 30 * 60_000) };
    const b = await startTimerCore("u1", { templateId: "essay", clientId: "c3", source: "phone" }, later);
    check("one running timer a user: a start on another task stops the first at that instant", b.ok && f.rows.filter((r) => r.endedAt == null).length === 1 && f.rows[0].endedAt?.getTime() === NOW.getTime() + 30 * 60_000 && f.rows[1].source === "phone");
    const goal = await startTimerCore("u1", { templateId: "goal", clientId: "c4", source: "web" }, deps);
    const work = await startTimerCore("u1", { templateId: "work", clientId: "c5", source: "web" }, deps);
    const gone = await startTimerCore("u1", { templateId: "nope", clientId: "c6", source: "web" }, deps);
    check("a timer runs on a personal task or habit only (never a goal or a work tab's task); a gone one is said", !goal.ok && goal.error === TIMER_TEMPLATE_REFUSAL && !work.ok && work.error === TIMER_TEMPLATE_REFUSAL && !gone.ok && gone.error === "That task no longer exists.");
    const s1 = await stopTimerCore("u1", { sessionId: b.ok ? b.value.sessionId : "" }, { ...deps, now: () => new Date(NOW.getTime() + 64 * 60_000), launchDay: null });
    const s2 = await stopTimerCore("u1", { sessionId: b.ok ? b.value.sessionId : "" }, { ...deps, now: () => new Date(NOW.getTime() + 90 * 60_000) });
    const s3 = await stopTimerCore("u1", { sessionId: "ts99" }, deps);
    check(
      "a stop sets its end (even after a rollback switched proof off, so a timer never stays running); a second stop answers it unchanged; a gone one is TIMER_GONE",
      s1.ok && !s1.value.running && s1.value.endedAt === new Date(NOW.getTime() + 64 * 60_000).toISOString() && s2.ok && s2.value.endedAt === s1.value.endedAt && !s3.ok && s3.error === TIMER_GONE
    );
    check("the timer's words: 34 min stopped reads 'Timed 34 min'", s1.ok && timerMinutesOf(s1.value, NOW) === 34 && timerLabelOf(s1.value, NOW) === "Timed 34 min");
    // A reload: the board reads the store again, and the open timers come back (a row, not a clock in a tab).
    const proofRead = await loadBoardProof("u1", TODAY, deps);
    check(
      "loadBoardProof: the open timers from yesterday on, the latest a task (a reload brings them back), and only the kinds this build knows",
      !!proofRead && proofRead.proof.launchDay === LAUNCH && proofRead.proof.timers.length === 2 && same(proofRead.kinds, { thesis: "MINUTES" })
    );
  }
  {
    const f = fakeStore();
    const offRead = await loadBoardProof("u1", TODAY, { store: f.store, launchDay: null });
    const beforeRead = await loadBoardProof("u1", addDays(LAUNCH, -1), { store: f.store, launchDay: LAUNCH });
    const tickOff = await readCompletionProof("u1", "thesis", TODAY, { store: f.store, launchDay: null });
    check("while proof is off (or before its day) the board and the tick read nothing: null, no store call", offRead === null && beforeRead === null && tickOff === null && f.calls.length === 0);
    const tickOn = await readCompletionProof("u1", "thesis", TODAY, { store: f.store, launchDay: LAUNCH });
    check("from its day the tick reads the kind, that day's previous tick and the timers not yet counted", !!tickOn && tickOn.kind === "MINUTES" && tickOn.prevTickAt?.getTime() === at(300).getTime() && same(f.calls.sort(), ["openOf", `tickFacts:${TODAY}`]));
    const tickY = await readCompletionProof("u1", "thesis", YESTERDAY, { store: f.store, launchDay: LAUNCH });
    check("a record of yesterday reads yesterday's ticks only (today's never bounds it)", !!tickY && tickY.prevTickAt === null && f.calls.includes(`tickFacts:${YESTERDAY}`));
  }
  {
    const s = (id: string, day: DayKey, startedMinAgo: number, minutes: number | null = null, endedMinAgo: number | null = null): SessionRow => ({ id, templateId: "thesis", day, startedAt: at(startedMinAgo), endedAt: endedMinAgo == null ? null : at(endedMinAgo), minutes, source: "web", clientId: id });
    const rows = [s("old", YESTERDAY, 1500, null, 1400), s("used", TODAY, 200, 60, 140), s("before", TODAY, 120, null, 100), s("now", TODAY, 40)];
    check("sessionForTick: the task's own timer of that day, not yet counted, started after its previous tick, the latest", sessionForTick(rows, { templateId: "thesis", day: TODAY, prevTickAt: at(90) })?.id === "now" && sessionForTick(rows, { templateId: "thesis", day: TODAY, prevTickAt: at(30) }) === null && sessionForTick(rows, { templateId: "essay", day: TODAY }) === null);
    // Re-pinned (review): a timer is the task's segments of one life day (Stop, then Resume), drawn as one.
    const today = openTimersOf(rows, TODAY);
    const both = openTimersOf(rows, YESTERDAY);
    check(
      "openTimersOf: one a task a life day, its latest segment with the earlier ones' minutes (Timed 20, then resumed: 20 + 40 = 60)",
      same(today.map((t) => [t.sessionId, t.day, t.priorMinutes, t.running]), [["now", TODAY, 20, true]]) && timerMinutesOf(today[0], NOW) === 60 && timerLabelOf(today[0], NOW) === "Timer 1 h 00" &&
        same(both.map((t) => t.sessionId), ["old", "now"])
    );
    const group = segmentsWith(rows, rows[3], at(150));
    check("segmentsWith: a tick counts the latest with its earlier segments that day (not a counted one, not yesterday's), oldest first", same(group.map((x) => x.id), ["before", "now"]) && groupMinutesOf(group, NOW) === 60);
    check("segmentSharesOf: the counted minutes over the segments, each at most what it ran, adding up", same(segmentSharesOf(group, 60, NOW), [20, 40]) && same(segmentSharesOf(group, 45, NOW), [20, 25]) && same(segmentSharesOf(group, 10, NOW), [10, 0]));
  }
  {
    // Review: a timer left running for days is never a dead end; Resume after a Stop; Discard; two devices at once.
    const f = fakeStore();
    const deps = { store: f.store, now: () => NOW, launchDay: LAUNCH, env: live };
    f.rows.push({ userId: "u1", id: "stale", templateId: "thesis", day: addDays(TODAY, -2), startedAt: at(40 * 60), endedAt: null, minutes: null, source: "web", clientId: "cs" });
    const fresh = await startTimerCore("u1", { templateId: "thesis", clientId: "c1", source: "web" }, deps);
    check(
      "a timer left running from two days back is no answer: the start stops it and opens a fresh one, today's",
      fresh.ok && fresh.value.sessionId !== "stale" && fresh.value.day === TODAY && fresh.value.running && f.rows.find((r) => r.id === "stale")?.endedAt?.getTime() === NOW.getTime()
    );
    const later = (m: number) => ({ ...deps, now: () => new Date(NOW.getTime() + m * 60_000) });
    await stopTimerCore("u1", { sessionId: fresh.ok ? fresh.value.sessionId : "" }, later(30));
    const resumed = await startTimerCore("u1", { templateId: "thesis", clientId: "c2", source: "web" }, later(60));
    check(
      "Resume: a start on a task whose timer is stopped adds a segment; its timer reads the earlier 30 minutes and runs on",
      resumed.ok && resumed.value.running && resumed.value.priorMinutes === 30 && timerMinutesOf(resumed.value, NOW.getTime() + 75 * 60_000) === 45 && f.rows.filter((r) => r.templateId === "thesis" && r.day === TODAY).length === 2
    );
    const discarded = await discardTimerCore("u1", { sessionId: resumed.ok ? resumed.value.sessionId : "" }, later(80));
    const board = await loadBoardProof("u1", TODAY, later(81));
    check(
      "Discard closes every segment of that day's timer counting nothing (minutes 0, stopped): no row shows it and no tick counts it",
      discarded.ok && f.rows.filter((r) => r.templateId === "thesis" && r.day === TODAY).every((r) => r.minutes === 0 && r.endedAt != null) && !!board && board.proof.timers.every((t) => t.templateId !== "thesis")
    );
    const again = await discardTimerCore("u1", { sessionId: resumed.ok ? resumed.value.sessionId : "" }, later(82));
    check("a discarded (or counted) timer is gone", !again.ok && again.error === TIMER_GONE);
    const offW = await discardTimerCore("u1", { sessionId: "x" }, { ...deps, env: { NODE_ENV: "development" } });
    check("a Discard needs live writes, as a stop does", !offW.ok && offW.error === TIMER_WRITES_OFF);
  }
  {
    // Two devices start at the same moment: the second insert hits the one-running-timer index (P2002 on another key).
    const f = fakeStore();
    const deps = { store: f.store, now: () => NOW, launchDay: LAUNCH, env: live };
    const realStart = f.store.start;
    let raced = false;
    f.store.start = async (u, d) => {
      if (!raced) {
        raced = true;
        await realStart(u, { ...d, templateId: "essay", clientId: "other-device" });
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`userId`)", { code: "P2002", clientVersion: "check" });
      }
      return realStart(u, d);
    };
    const r = await startTimerCore("u1", { templateId: "thesis", clientId: "c9", source: "phone" }, deps);
    check(
      "two starts at once: the one that loses the running-timer race starts again once (stopping the other) and answers, never a server error",
      r.ok && r.value.templateId === "thesis" && r.value.running && f.rows.filter((x) => x.endedAt == null).length === 1 && f.rows.find((x) => x.clientId === "other-device")?.endedAt != null
    );
  }

  // ── 8. Capture ────────────────────────────────────────────────────────────

  section("8. capture: '#proof' opts a task in (D20)");
  check("'thesis 90m #proof' and a habit carry proof; a goal or an idea leaves it as text; a line without it has no key", parseCapture("thesis 90m #proof", { today: TODAY }).proof === true && parseCapture("deep work daily #proof", { today: TODAY }).proof === true && !("proof" in parseCapture("goal: finish #proof", { today: TODAY })) && !("proof" in parseCapture("dishes daily", { today: TODAY })));
  check("the server writes TaskTemplate.proof only for such a line, and never on a work tab", /\.\.\.\(parsed\.proof && !boardId && \(kind === "TASK" \|\| kind === "HABIT"\) \? \{ proof: "MINUTES" \} : \{\}\),/.test(tasksSrc));

  // ── 9. The default deep-work set ─────────────────────────────────────────

  section("9. the default deep-work set: a dry run the user approves (D20)");
  const cand = (p: Partial<Parameters<typeof isDefaultDeepWork>[0]> = {}) => ({ kind: "TASK", category: "WORK", band: "DEMANDING", bandOverride: 0, boardId: null, archivedAt: null, intrinsic: false, autoMetric: null, recurrence: null, completedAt: null, ...p });
  check("the rule: WORK, STUDY or CREATIVE at Demanding or above (as a tick pays it), on the personal Board", same(DEEP_WORK_CATEGORIES, ["WORK", "STUDY", "CREATIVE"]) && DEEP_WORK_MIN_BAND === "DEMANDING");
  check(
    "isDefaultDeepWork: in for Demanding work, a Severe study habit, a Creative self-rated up to Demanding; out for Standard, a chore, a work tab, #play, archived, auto, a finished one-off, a goal",
    isDefaultDeepWork(cand()) &&
      isDefaultDeepWork(cand({ kind: "HABIT", category: "STUDY", band: "SEVERE", recurrence: "DAILY" })) &&
      isDefaultDeepWork(cand({ category: "CREATIVE", band: "STANDARD", bandOverride: 1 })) &&
      !isDefaultDeepWork(cand({ band: "STANDARD" })) &&
      !isDefaultDeepWork(cand({ band: "DEMANDING", bandOverride: -1 })) &&
      !isDefaultDeepWork(cand({ category: "CHORE" })) &&
      !isDefaultDeepWork(cand({ boardId: "b1" })) &&
      !isDefaultDeepWork(cand({ intrinsic: true })) &&
      !isDefaultDeepWork(cand({ archivedAt: new Date() })) &&
      !isDefaultDeepWork(cand({ autoMetric: "REVIEWS" })) &&
      !isDefaultDeepWork(cand({ completedAt: new Date() })) &&
      isDefaultDeepWork(cand({ recurrence: "DAILY", completedAt: new Date() })) &&
      !isDefaultDeepWork(cand({ kind: "GOAL" }))
  );
  const dry = code("scripts/proof-dry-run.ts");
  check(
    "scripts/proof-dry-run.ts is read only: findMany only (no create, update, upsert, delete, raw SQL or transaction), the database guard before its first query, the rule's own function, never TaskTemplate.proof",
    !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(|\$executeRaw|\$queryRaw|\$transaction/.test(dry) &&
      /prisma\.taskTemplate\.findMany\(/.test(dry) &&
      dry.indexOf("launchTargetOf(") < dry.indexOf("prisma.taskTemplate.findMany(") &&
      /isDefaultDeepWork\(/.test(dry) &&
      !/\bproof:\s*true|proof: \{|"proof"/.test(dry) &&
      !/life:check|ui:check/.test(read("package.json").match(/"[\w:-]+": "[^"]*proof-dry-run[^"]*"/)?.[0] ?? "")
  );

  // ── 10. The migration and the writers ────────────────────────────────────

  section("10. the migration is additive; one writer of TaskSession, no ledger");
  const sql = read("prisma/migrations/20270101000000_task_proof/migration.sql");
  const stmts = sql.replace(/--.*$/gm, "");
  check(
    "BEGIN/COMMIT; a nullable TaskTemplate.proof and its CHECK; one new table with timestamptz times; nothing dropped, renamed, retyped, backfilled or deleted",
    /^BEGIN;/m.test(stmts) && /^COMMIT;/m.test(stmts) &&
      /ALTER TABLE "public"\."TaskTemplate" ADD COLUMN "proof" TEXT;/.test(stmts) &&
      /"TaskTemplate_proof_check" CHECK \("proof" IS NULL OR "proof" IN \('MINUTES'\)\)/.test(stmts) &&
      /CREATE TABLE "public"\."TaskSession"/.test(stmts) &&
      /"startedAt" TIMESTAMPTZ\(3\) NOT NULL/.test(stmts) && /"endedAt" TIMESTAMPTZ\(3\),/.test(stmts) &&
      !/\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE|INSERT)\b|ALTER COLUMN|TIMESTAMP\(3\)(?!TZ)/i.test(stmts.replace(/TIMESTAMPTZ/g, ""))
  );
  check(
    "the indexes: (userId, clientId) unique, the plan's (userId, endedAt), (userId, templateId), and one running timer a user",
    /CREATE UNIQUE INDEX "TaskSession_userId_clientId_key" ON "public"\."TaskSession"\("userId", "clientId"\);/.test(stmts) &&
      /CREATE INDEX "TaskSession_userId_endedAt_idx" ON "public"\."TaskSession"\("userId", "endedAt"\);/.test(stmts) &&
      /CREATE INDEX "TaskSession_userId_templateId_idx"/.test(stmts) &&
      /CREATE UNIQUE INDEX "TaskSession_userId_running_key" ON "public"\."TaskSession"\("userId"\) WHERE "endedAt" IS NULL;/.test(stmts)
  );
  const schema = read("prisma/schema.prisma");
  check(
    "schema.prisma carries both, and names the CHECKs and the partial index Prisma cannot declare",
    /^\s+proof\s+String\?\r?$/m.test(schema) && /^model TaskSession \{/m.test(schema) && /TaskSession_userId_running_key/.test(schema) && /TaskTemplate_proof_check/.test(schema) && /@@unique\(\[userId, clientId\]\)/.test(schema) && /@@index\(\[userId, endedAt\]\)/.test(schema)
  );
  const writers = ["src/lib/tasks.ts", "src/lib/task-sessions-server.ts", "src/lib/today-board.ts", "src/lib/mobile-api.ts", "src/lib/mobile-api-server.ts", "src/app/actions/tasks.ts"].filter((f) => /taskSession\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(code(f)));
  check("only task-sessions-server.ts writes TaskSession (the tick's one column through its countSessionOp)", same(writers, ["src/lib/task-sessions-server.ts"]) && /countSessionOp/.test(tasksSrc));
  check(
    "task-sessions-server.ts writes no ledger row and pays nothing",
    !/\b(recordActivity|activityOp|activityData|mintLifeMasteryOps|lifeMintData|mintIdeaMasteryOp)\s*\(|activityEvent\s*\.\s*(create|createMany|upsert)|masteryLedgerEntry|capitalLedgerEntry/.test(code("src/lib/task-sessions-server.ts"))
  );

  // ── 11. The web ──────────────────────────────────────────────────────────

  section("11. the web: a proof row takes its minutes; a chore still ticks in one tap");
  const html = (r: BoardRow, withTimer: boolean) =>
    renderToStaticMarkup(
      createElement(TaskRow, {
        row: r,
        projection: r.projection,
        drawerOpen: false,
        undoable: false,
        busy: false,
        receiptOpen: false,
        receiptId: "rcpt",
        onTick: () => {},
        onUndo: () => {},
        onToggleDrawer: () => {},
        onToggleReceipt: () => {},
        timer: withTimer && r.proof ? { onStart: () => {}, onStop: () => {} } : null,
      })
    );
  const noTimerRow = { ...row("thesis"), proof: { timer: null } } as BoardRow;
  const proofHtml = html(noTimerRow, true);
  const runningHtml = html(row("thesis"), true);
  const choreHtml = html(row("dishes"), true);
  const choreOff = html(off.find((r) => r.template.id === "dishes")!, false);
  check("a proof row draws 'Start timer' and says 'log the minutes'", /Start timer/.test(proofHtml) && /log the minutes/.test(proofHtml) && /class="r-act r-timer"/.test(proofHtml));
  check("a running timer draws its minutes and Stop", /Timer \d+ min/.test(runningHtml) && /· Stop/.test(runningHtml) && /data-state="running"/.test(runningHtml));
  check("a chore row draws no timer and no proof words, exactly as with proof off", !/timer|log the minutes/i.test(choreHtml) && choreHtml === choreOff);
  const board = code("src/components/today/TodayBoard.tsx");
  // Re-pinned for P24: the tick also carries the drawer's pages (a reading task's; null on every other row), read first.
  // Re-pinned (review): a timer across 04:00 or past twice the estimate asks first (the drawer's Done confirms), and a
  // tick that opens the drawer moves focus to its first chip and says why.
  check(
    "the board's tick: a proof row with no minutes counts its timer once it has run (unless it must ask), else opens the drawer at its chips; every other row exactly complete(row, { minutes, pages })",
    /function tickRow\(row: BoardRow, minutes: number \| null, from\?: Element \| null, confirmed = false\) \{\s*const timer = row\.proof\?\.timer \?\? null;\s*const pages = openKey === row\.key \? drawerPages : null;[\s\S]*?if \(row\.proof && minutes == null\) \{/.test(board) &&
      /const ask = timer && timed >= 1 && !confirmed \? timerConfirmOf\(timer, row\.day, row\.estMinutes, now\) : null;\s*if \(timer && timed >= 1 && !ask\) return complete\(row, \{ sessionId: timer\.sessionId, timed, pages \}, from\);\s*toChips\(/.test(board) &&
      /\}\s*complete\(row, \{ minutes, pages \}, from\);\s*\}/.test(board) &&
      /setChipFocus\(row\.key\);\s*announce\(`\$\{row\.template\.title\}: \$\{line\}`\);/.test(board) &&
      /onDone=\{\(\) => \(viaSteps\(row\) \? tickSteps\(row, null, true\) : tickRow\(row, minutes, null, true\)\)\}/.test(board)
  );
  check(
    "a tick that counts its timer is priced at the timer's minutes, bounded by them (projectRow's wall), as the server bounds it",
    /projectRow\(current, row, \{ minutes: shownMinutes, \.\.\.\(timerCount \? \{ wall: shownMinutes \} : \{\}\) \}\)/.test(board) && /project: \(m\) => projectRow\(current, row, \{ minutes: m, wall: m \}\)/.test(board)
  );
  {
    // Review: a stopped timer is no dead end (Resume, Discard); a Record yesterday row draws no timer.
    const stopped = { sessionId: "ts1", templateId: "thesis", day: TODAY, startedAt: at(60).toISOString(), endedAt: at(26).toISOString(), running: false, priorMinutes: 0 };
    const stoppedRow = { ...row("thesis"), proof: { timer: stopped } } as BoardRow;
    const stoppedHtml = renderToStaticMarkup(
      createElement(TaskRow, { row: stoppedRow, projection: stoppedRow.projection, drawerOpen: false, undoable: false, busy: false, receiptOpen: false, receiptId: "r", onTick: () => {}, onUndo: () => {}, onToggleDrawer: () => {}, onToggleReceipt: () => {}, timer: { onStart: () => {}, onStop: () => {}, onDiscard: () => {} } })
    );
    check(
      "a stopped timer draws 'Timed 34 min', then Resume and Discard, each a 44 px button with its own name (three items that wrap one by one at 344 px)",
      /<span class="r-timer r-timer-done" data-state="stopped">[\s\S]*?Timed 34 min<\/span><\/span>/.test(stoppedHtml) &&
        /data-state="resume"[^>]*aria-label="Resume the timer for Write the thesis chapter \(Timed 34 min\)">Resume<\/button>/.test(stoppedHtml) &&
        /data-state="discard"[^>]*aria-label="Discard the timer for Write the thesis chapter"/.test(stoppedHtml) &&
        /\.t-row \.r-timer \{ min-height: 44px; font-variant-numeric: tabular-nums; white-space: nowrap; \}/.test(read("src/components/today/today.css")),
      stoppedHtml.match(/<button[^>]*r-timer[\s\S]*?<\/button>/g)?.join(" ") ?? ""
    );
    const yRow = { ...row("thesis"), lane: "yesterday", day: YESTERDAY, proof: { timer: null } } as BoardRow;
    const yHtml = html(yRow, true);
    check("a Record yesterday row draws no timer chip (no 'Start timer': a timer only times today)", !/r-timer|Start timer/.test(yHtml) && /log the minutes/.test(yHtml));
    check(
      "the tick's accessible name says a gated row asks first: 'log the minutes', 'counts its timer', 'log 30 pages'",
      tickNameOf({ ...noTimerRow }) === "Write the thesis chapter, log the minutes" && tickNameOf(row("thesis")) === "Write the thesis chapter, counts its timer" &&
        tickNameOf({ ...row("dishes"), pages: { target: 30 } } as BoardRow) === "Dishes, log 30 pages" && tickNameOf(row("dishes")) === "Dishes"
    );
  }
  {
    // Review: the drawer reads the timer live, treats under a minute as none, prices a timer's count as the server
    // does, offers chips across the estimate, and never lets today's timer count for yesterday.
    const drawerHtml = (r: BoardRow, minutes: number | null, timerView: TimerView | null) =>
      renderToStaticMarkup(
        createElement(TaskDrawer, {
          row: r, now: NOW.getTime(), today: TODAY, minutes, onMinutes: () => {}, projection: r.projection, minimumProjection: null, busy: false, working: null,
          onDone: () => {}, onMinimum: () => {}, onSkip: () => {}, onTomorrow: () => {}, onAgain: () => {}, onRename: () => {}, onArchive: () => {}, onOverride: () => {}, onResize: () => {},
          noMonth: true, onYesterday: () => {},
          proof: { timer: timerView, project: (m: number) => ({ ...r.projection, xp: 70 + m / 10 }) },
        })
      );
    const fresh = { sessionId: "ts1", templateId: "thesis", day: TODAY, startedAt: new Date(Date.now() - 10_000).toISOString(), endedAt: null, running: true, priorMinutes: 0 };
    const zero = drawerHtml({ ...row("thesis"), recordYesterday: { xp: 3 } } as BoardRow, null, fresh);
    check("a timer under a minute is no minutes: Done waits ('pick the minutes'), and so does Did it yesterday", /<button[^>]*disabled=""[^>]*>Done · pick the minutes<\/button>/.test(zero) && /<button[^>]*disabled=""[^>]*>Did it yesterday/.test(zero), zero.match(/<button[^>]*>Done[^<]*<\/button>/)?.[0] ?? "");
    const ran = { ...fresh, startedAt: new Date(Date.now() - 20 * 60_000 - 5_000).toISOString() };
    const twenty = drawerHtml({ ...row("thesis"), recordYesterday: { xp: 3 } } as BoardRow, null, ran);
    check(
      "a timer of 20 min: 'Done · timer 20 min' priced as the server counts it (the project callback), while Did it yesterday still waits for a chip (today's timer never counts there)",
      /Done · timer 20 min · ≈ 72\.0/.test(twenty) && /<button[^>]*disabled=""[^>]*>Did it yesterday/.test(twenty),
      twenty.match(/<button[^>]*>Done[^<]*<\/button>/)?.[0] ?? ""
    );
    check("a proof row's chips are its estimate's shares (45 to 180 on a 90-minute task), each a 44 px chip", same(proofMinuteChipsOf(90), [45, 70, 90, 115, 135, 180]) && same(proofMinuteChipsOf(180), [90, 135, 180, 225, 270, 360]) && /data-chips="minutes"/.test(twenty) && />180 min</.test(twenty) && !/>10 min</.test(twenty));
    check("a non-proof row keeps the fixed chips (10 to 90)", /data-chips="minutes"/.test(renderToStaticMarkup(createElement(TaskDrawer, { row: row("dishes"), now: NOW.getTime(), today: TODAY, minutes: null, onMinutes: () => {}, projection: row("dishes").projection, minimumProjection: null, busy: false, working: null, onDone: () => {}, onMinimum: () => {}, onSkip: () => {}, onTomorrow: () => {}, onAgain: () => {}, onRename: () => {}, onArchive: () => {}, onOverride: () => {}, onResize: () => {}, noMonth: true }))) && same(MINUTE_CHIPS, [10, 20, 30, 45, 60, 90]));
    check(
      "the drawer's words: the clock as it bounds (no 'never more than the clock allows' over a floor), and a done row's Again says nothing of a timer it hasn't",
      twenty.includes(PROOF_COUNTS_NOTE) && !/never more than the clock allows/.test(twenty) &&
        /Deep work counts its time: pick the minutes it took\.<\/p>/.test(drawerHtml({ ...row("thesis"), state: "done", template: { ...row("thesis").template, recurrence: "DAILY" } } as BoardRow, null, null))
    );
    check("the 44 px chip groups: the drawer's minutes and pages chips (today.css [data-chips])", /\.today-drawer-row\[data-chips\] \.today-pill \{ min-height: 44px; \}/.test(read("src/components/today/today.css")));
  }
  {
    // Review: the capture sheet's '#proof' and pages chips say what is in force (and a work tab drops them).
    check(
      "capture chips: 'Proof · log the minutes' only in force; 'Proof · from its launch' before it; '#proof · not on a work tab' there; pages plain until then",
      proofChipLabelOf({ live: true, work: false }) === PROOF_CHIP_LABEL && proofChipLabelOf({ live: false, work: false }) === "Proof · from its launch" && proofChipLabelOf({ live: true, work: true }) === "#proof · not on a work tab" &&
        pagesCaptureLabelOf(30, { live: true, work: false }) === "Proof · 30 pages" && pagesCaptureLabelOf(30, { live: false, work: false }) === "30 pages" && pagesCaptureLabelOf(30, { live: true, work: true }) === "30 pages"
    );
    const chips = (text: string, proofState: { live: boolean; work: boolean }) =>
      renderToStaticMarkup(createElement(CaptureChips, { text, parsed: parseCapture(text, { today: TODAY }), goals: [], rawBefore: 0, onRevert: () => {}, compact: false, feedsOpen: false, onToggleFeeds: () => {}, duplicate: null, mustBlocked: false, mustFixes: [], onFix: () => {}, proof: proofState }));
    const before = chips("thesis 90m #proof", { live: false, work: false });
    const onWork = chips("thesis 90m #proof", { live: true, work: true });
    check(
      "the sheet draws them: before the launch 'Proof · from its launch' (no 'log the minutes'); on a work tab a warned '#proof · not on a work tab'",
      /Proof · from its launch/.test(before) && !/log the minutes/.test(before) && /data-warn="1"[^>]*aria-label="#proof · not on a work tab/.test(onWork),
      onWork.match(/<button[^>]*#proof[^>]*>/)?.[0] ?? ""
    );
    check("QuickCapture passes the launch state and the work tab to the chips", /proof=\{\{ live: !!day && proofOn\(day, proofLaunchDay\(\)\), work: workBoard !== null \}\}/.test(code("src/components/capture/QuickCapture.tsx")));
  }
  const drawerSrc = code("src/components/today/TaskDrawer.tsx");
  // Re-pinned for P24: Done waits on `blocked`, the minutes (a proof row) or the pages (a reading task's, P24).
  check(
    "the drawer's Done waits for minutes on a proof row only (needsMinutes is false without props.proof)",
    /const needsMinutes = !!proof && proofMinutes == null;/.test(drawerSrc) && /const blocked = needsMinutes \|\| needsPages;/.test(drawerSrc) && /disabled=\{busy \|\| blocked\} onClick=\{props\.onDone\}/.test(drawerSrc)
  );
  check("the timer chip is a 44 px target, tokens only", /\.t-row \.r-timer \{ min-height: 44px;/.test(read("src/components/today/today.css")) && !/#[0-9a-f]{3,6}\b/i.test(read("src/components/today/today.css").split("Proof of work (blueprint P23)")[1]?.split("\n").slice(0, 4).join("\n") ?? "#"));
  const rulesSrc = code("src/app/today/rules/page.tsx");
  check("the rules page shows the Proof card only once proof is in force (proofOn), its lines read from proof.ts", /const proofLive = proofLaunch != null && proofOn\(today, proofLaunch\);/.test(rulesSrc) && /\{proofLive && proofLaunch && <ProofRules launchDay=\{proofLaunch\} \/>\}/.test(rulesSrc) && /proofRuleLines\(\)\.map/.test(rulesSrc));

  console.log(`\nproof-check: ${passes} passed, ${failures} failed`);
  if (failures) process.exitCode = 1;
})();
