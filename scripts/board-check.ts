/**
 * The Today board's pure half (src/lib/today-board.ts): which lane a task
 * lands in, what a row projects, that a tick pays that projection, that an
 * undo nets it to zero, the capacity line, the review quest and the study
 * tasks that complete themselves. Also the habit readings the rows print
 * (src/lib/habit.ts), through the same `statsFor` the server runs.
 *
 * M2 (lane D) adds BoardData.duty from fixtures: the owed cards re-priced
 * against the live ledger, a debited one-off shown only as its card, MADE_UP
 * reading done, a pending rule change (its meta line, an archive leaving on
 * its effective day), the early-settle lock, held rows on a rest day, the
 * '· repaired' / '· held' meta, the live Full-day ring against settlement's
 * own input on eight days, and Close the day's list.
 *
 * No database: every fixture is the shape `tasks.ts` reads in its one wave.
 *
 *   npx tsx scripts/board-check.ts
 */
import { addDays, weekdayOf, type DayKey } from "../src/lib/life-day";
import type { Receipt } from "../src/lib/life-types";
import { KNEE_CAP, consistencyFactor, estEff, kneeG, payModeOf, priceTask, roundTo, timingFor } from "../src/lib/life-grade";
import { normTitleOf, repeatNOf } from "../src/lib/life-lexicon";
import { nextDue, occursOn, parseRule } from "../src/lib/recurrence";
import { parseCapture } from "../src/lib/capture-parse";
import { cached, invalidate, invalidateAll } from "../src/lib/cache";
import { rungOf, strengthAfter, type Outcome } from "../src/lib/habit";
import { countsForStreakOf, streakUnitsOf } from "../src/lib/streak-curve";
import { closeItemsOf, goalCardCopy, pendingMetaOf, rollAllKeysOf, upcomingOf, withHeldExcused } from "../src/components/today/board-ui";
import { fullDayInputFor, fullDayInputOf, fullDayOf, isLifeDeed } from "../src/lib/full-day";
import type { DutyBoard, OwedCard } from "../src/lib/duty-view";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { goalAsOf, goalPercent, goalProgress, type GoalLadderItem, type GoalProgressInput } from "../src/lib/goals";
import { goalRowCopy } from "../src/components/home/GoalLadder";
import { captureShapeOf } from "../src/lib/capture-shape";
import { captureGoalFields } from "../src/lib/tasks";
import { PLACE_LANES } from "../src/lib/life-types";
import {
  BOARD_COLUMNS,
  BOARD_SECTIONS,
  applyOps,
  autoStateOf,
  buildBoard,
  placeOf,
  placementOf,
  ruleOf,
  EpochSet,
  canUndo,
  isDoneStatus,
  makeUpPricesOf,
  pendingNextOf,
  ruledTemplateOn,
  streakNoteOf,
  cheapestMovable,
  completionBlockOf,
  goalMetricOf,
  goalProgressQty,
  groupKeyOf,
  horizonFor,
  lastDoneOf,
  moveBlockOf,
  paidIntroOf,
  planAutoCompletions,
  planCompletion,
  questOf,
  startDayFor,
  statsFor,
  streakDaysFor,
  taskDedupeKey,
  taskEventInput,
  undoEventInput,
  yesterdayRecordable,
  type BoardData,
  type BoardInstance,
  type BoardOp,
  type BoardRow,
  type BoardTemplate,
  type DayLedger,
  type LedgerCompletion,
} from "../src/lib/today-board";

// Thursday 1 October 2026.
const TODAY: DayKey = "2026-10-01";
const YESTERDAY = addDays(TODAY, -1);
const ago = (n: number) => addDays(TODAY, -n);

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

// ── Fixtures ──────────────────────────────────────────────────────────────

function tpl(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: normTitleOf(p.title),
    recurrence: null,
    dueDay: null,
    dueKind: null,
    intrinsic: false,
    autoMetric: null,
    mvv: null,
    track: "DUTY",
    band: "STANDARD",
    bandOverride: 0,
    estMinutes: 30,
    machineMinutes: 30,
    kind: "TASK",
    inbox: false,
    startDay: ago(120),
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: p.band ?? "STANDARD",
    aiBand: null,
    gradeSource: "LEXICAL",
    gradeConfidence: 0.4,
    gradeBasis: null,
    gradeModel: null,
    gradePromptVersion: null,
    gradeAttempts: 1,
    gradeFrozen: true,
    sizing: false,
    bandOverrideAt: null,
    gradeFrozenAt: null,
    topAttribute: null,
    note: null,
    completedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    sortOrder: 0,
    ...p,
  };
}

function ledger(day: DayKey, p: Partial<DayLedger> = {}): DayLedger {
  return { day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null, ...p };
}

let instSeq = 0;
function inst(templateId: string, day: DayKey, status: BoardInstance["status"] = "DONE", slot = 0): BoardInstance {
  return { id: `i${++instSeq}`, templateId, day, slot, status, source: "manual", xpPaid: 0 };
}

/** Every fixture board built below: placeOf is checked against buildBoard on all of them at the end. */
const fixtureBoards: BoardData[] = [];

/** Board data as `readBoardCore` assembles it: stats from each recurring template's history, as the server computes them. */
function board(
  templates: BoardTemplate[],
  p: { history?: BoardInstance[]; today?: DayLedger; yesterday?: DayLedger; capacityMin?: number; dueNow?: number | null; goalQty?: Record<string, number>; goalDays?: BoardData["goalDays"] } = {}
): BoardData {
  const history = p.history ?? [];
  const stats: BoardData["stats"] = {};
  for (const t of templates) {
    const rule = t.recurrence ? parseRule(t.recurrence) : null;
    if (rule) stats[t.id] = statsFor(t, rule, history.filter((i) => i.templateId === t.id), TODAY);
  }
  const d: BoardData = {
    today: TODAY,
    yesterday: YESTERDAY,
    capacityMin: p.capacityMin ?? 240,
    templates,
    instances: history.filter((i) => i.day >= ago(40)),
    stats,
    ledger: { today: p.today ?? ledger(TODAY), yesterday: p.yesterday ?? ledger(YESTERDAY) },
    paid: {},
    goalQty: p.goalQty ?? {},
    ...(p.goalDays ? { goalDays: p.goalDays } : {}),
    dueNow: p.dueNow === undefined ? 0 : p.dueNow,
  };
  fixtureBoards.push(d);
  return d;
}

const rowOf = (b: ReturnType<typeof buildBoard>, id: string): BoardRow | undefined =>
  [...b.must, ...b.todayRows, ...b.yesterdayRows, ...b.anytime].find((r) => r.template.id === id);
const laneOf = (b: ReturnType<typeof buildBoard>, id: string, day: DayKey = TODAY): string => {
  if (b.must.some((r) => r.template.id === id && r.day === day)) return "must";
  if (b.todayRows.some((r) => r.template.id === id && r.day === day)) return "today";
  if (b.yesterdayRows.some((r) => r.template.id === id && r.day === day)) return "yesterday";
  if (b.anytime.some((r) => r.template.id === id)) return "anytime";
  if (b.inbox.some((t) => t.id === id)) return "inbox";
  return "none";
};

/** Every day from `from` days ago to `to` days ago (inclusive), newest last. */
function daysBack(from: number, to: number): DayKey[] {
  const out: DayKey[] = [];
  for (let n = from; n >= to; n--) out.push(ago(n));
  return out;
}

/** An independent price for a row: priceTask from first principles, not through planCompletion. */
function priceFrom(t: BoardTemplate, day: DayKey, l: DayLedger, streakDays: number, minutes: number | null = null): Receipt {
  const recurring = !!t.recurrence;
  return priceTask(
    {
      band: t.band,
      bandOverride: t.bandOverride,
      machineMinutes: t.machineMinutes,
      estMinutes: t.estMinutes,
      minutes,
      timing: recurring ? "ON_TIME" : timingFor({ dueKind: t.dueKind, dueDay: t.dueDay, day }),
      recurring,
      streakDays: recurring ? streakDays : 0,
      repeatN: repeatNOf({ templateId: t.id, normTitle: t.normTitle }, l.completions.map((c) => ({ templateId: c.templateId, normTitle: c.groupKey }))),
      introBefore: l.completions.filter((c) => c.intro).length,
      mode: payModeOf(t),
    },
    { rawBefore: l.rawBefore },
    t.track
  );
}

const completion = (templateId: string, groupKey: string, p: Partial<LedgerCompletion> = {}): LedgerCompletion => ({
  eventId: `e-${templateId}-${Math.random().toString(36).slice(2)}`,
  templateId,
  groupKey,
  intro: false,
  raw: 0,
  xp: 0,
  sink: "TRACK",
  ...p,
});

// ── Habit: rungs, misses, and C from the per-duty streak ──────────────────
{
  const kept = (n: number): Outcome[] => Array.from({ length: n }, () => "kept" as const);
  const rungAt = (n: number) => rungOf(strengthAfter(kept(n)));
  check("rung: 5 kept is still Seeded, 6 reaches Forming", rungAt(5) === "Seeded" && rungAt(6) === "Forming", `${rungAt(5)} → ${rungAt(6)}`);
  check("rung: 17 kept Forming, 18 reaches Established", rungAt(17) === "Forming" && rungAt(18) === "Established", `${rungAt(17)} → ${rungAt(18)}`);
  check("rung: 43 kept Established, 44 reaches Automatic", rungAt(43) === "Established" && rungAt(44) === "Automatic", `${rungAt(43)} → ${rungAt(44)}`);
  const s66 = strengthAfter(kept(66));
  check("66 kept from zero gives 0.97", near(s66, 0.97, 0.005), s66.toFixed(4));

  // The same through the board's own path: a daily habit kept the last 66 days.
  const t = tpl({ id: "h66", title: "Stretch", recurrence: "DAILY", startDay: ago(66) });
  const d = board([t], { history: daysBack(66, 1).map((day) => inst(t.id, day)) });
  const s = d.stats[t.id].strength.before;
  check("statsFor: a daily habit kept 66 days reads 0.97 and Automatic", near(s, 0.97, 0.005) && rungOf(s) === "Automatic", s.toFixed(4));
}
{
  // 20 kept, one missed (no instance, long past the record window), 5 kept.
  const t = tpl({ id: "hmiss", title: "Journal", recurrence: "DAILY", startDay: ago(26) });
  const history = daysBack(26, 1)
    .filter((day) => day !== ago(6))
    .map((day) => inst(t.id, day));
  const d = board([t], { history });
  const st = d.stats[t.id];
  const expected = strengthAfter([...Array(20).fill("kept"), "missed", ...Array(5).fill("kept")] as Outcome[]);
  const beforeMiss = strengthAfter(Array(20).fill("kept") as Outcome[]);
  check(
    "a miss lowers strength but never resets it",
    near(st.strength.before, expected, 1e-9) && strengthAfter([...Array(20).fill("kept"), "missed"] as Outcome[]) < beforeMiss && st.strength.before > strengthAfter(Array(5).fill("kept") as Outcome[]),
    `S ${st.strength.before.toFixed(4)}, kept run ${st.streak.before.kept}`
  );
  check("…while the per-duty streak does restart after it", st.streak.before.kept === 5, `kept ${st.streak.before.kept}`);
}
{
  // Mon/Thu: today is a Thursday, so the last ten occurrences before it are
  // the ten Mondays and Thursdays from 28 Sep back; the eleventh has nothing.
  const t = tpl({ id: "gym", title: "Gym legs", recurrence: "DOW:1,4", band: "DEMANDING", estMinutes: 60, machineMinutes: 60, track: "BODY", startDay: ago(60) });
  const occ = daysBack(60, 1).filter((day) => [1, 4].includes(weekdayOf(day)));
  const last10 = occ.slice(-10);
  const d = board([t], { history: last10.map((day) => inst(t.id, day)) });
  const st = d.stats[t.id].streak.before;
  const row = rowOf(buildBoard(d), t.id)!;
  const C = row.projection.factors.find((f) => f.key === "C")?.value ?? 0;
  check("C from perDutyStreak: Mon/Thu kept 10 → 35 days → 1.148", st.kept === 10 && near(st.days, 35) && near(C, 1.148, 0.0005), `kept ${st.kept}, days ${st.days}, C ${C}`);
  check("…and C equals consistencyFactor(35)", near(C, roundTo(consistencyFactor(35), 3)));
}

// ── Pricing: the row, the tick and the undo agree ─────────────────────────
{
  // Golden 'Dishes': daily INTRO, est 15, a 30-day streak → 4.7.
  const t = tpl({ id: "dishes", title: "Dishes", recurrence: "DAILY", band: "INTRO", estMinutes: 15, machineMinutes: 15, startDay: ago(30) });
  const d = board([t], { history: daysBack(30, 1).map((day) => inst(t.id, day)) });
  const r = rowOf(buildBoard(d), t.id)!;
  check("golden: 'Dishes' daily INTRO 15 min with a 30-day streak projects 4.7", r.projection.xp === 4.7 && r.streakDays === 30, `xp ${r.projection.xp}, days ${r.streakDays}`);
}
{
  // Golden 'Call mum': STANDARD 20 min, the second call today → 7.7 (D groups by title).
  const first = tpl({ id: "mum1", title: "Call mum", estMinutes: 20, machineMinutes: 20, track: "CARE" });
  const second = tpl({ id: "mum2", title: "call Mum", estMinutes: 20, machineMinutes: 20, track: "CARE" });
  const d = board([second], { today: ledger(TODAY, { completions: [completion(first.id, groupKeyOf(first))] }) });
  const r = rowOf(buildBoard(d), second.id)!;
  check("golden: a second 'call mum' today projects 7.7 (repeat decay across templates)", r.projection.xp === 7.7, `xp ${r.projection.xp}`);
}
{
  // Golden: 7th INTRO today ('bins', 5 min) → 2.9.
  const bins = tpl({ id: "bins", title: "Take out bins", band: "INTRO", estMinutes: 5, machineMinutes: 5 });
  const six = Array.from({ length: 6 }, (_, i) => completion(`x${i}`, `chore ${i} ${"abcdefghij"[i].repeat(6)}`, { intro: true }));
  const r = rowOf(buildBoard(board([bins], { today: ledger(TODAY, { completions: six }) })), bins.id)!;
  check("golden: the 7th INTRO completion today projects 2.9", r.projection.xp === 2.9, `xp ${r.projection.xp}`);
}
{
  const t = tpl({ id: "tax", title: "File tax return", band: "DEMANDING", estMinutes: 120, machineMinutes: 120, dueDay: addDays(TODAY, 3), dueKind: "DEADLINE" });
  const l = ledger(TODAY, { rawBefore: 12.5 });
  const plan = planCompletion({ template: t, day: TODAY, today: TODAY, slot: 0, minutes: 150, ledger: l, streakDays: 0 });
  const direct = priceFrom(t, TODAY, l, 0, 150);
  check("a tick pays exactly what priceTask prices for the same context", JSON.stringify(plan.receipt) === JSON.stringify(direct), `${plan.receipt.xp} vs ${direct.xp}`);
  check("golden: 'File tax return' DEMANDING, 150 min, on time → raw 26.7", plan.receipt.raw === 26.7, `raw ${plan.receipt.raw}`);

  const now = new Date("2026-10-01T02:00:00.000Z"); // 12:00 in Sydney
  const event = taskEventInput(plan, { templateId: t.id, track: t.track, instanceId: "inst1", day: TODAY, slot: 0, attempt: 0, now });
  const undo = undoEventInput(
    { id: "ev1", day: TODAY, sink: event.sink ?? "TRACK", track: event.track ?? null, templateId: t.id, sourceId: "inst1", xp: event.xp ?? 0, rawXp: event.rawXp ?? null },
    new Date(now.getTime() + 60_000)
  );
  const units =
    streakUnitsOf({ source: "TASK", countsForStreak: countsForStreakOf("TASK", event.countsForStreak) }) +
    streakUnitsOf({ source: "UNDO", countsForStreak: countsForStreakOf("UNDO", undo.countsForStreak) });
  check(
    "complete then undo nets zero in XP, knee base and streak units",
    (event.xp ?? 0) + (undo.xp ?? 0) === 0 && (event.rawXp ?? 0) + (undo.rawXp ?? 0) === 0 && units === 0 && undo.dedupeKey === "undo:ev1",
    `xp ${event.xp} + ${undo.xp}, units ${units}`
  );

  const d0 = board([t], { today: l });
  const done = applyOps(d0, [{ id: "c1", kind: "complete", templateId: t.id, day: TODAY, slot: 0, at: now.toISOString() }]);
  const instanceId = done.instances.find((i) => i.templateId === t.id)!.id;
  const undone = applyOps(done, [{ id: "u1", kind: "undo", instanceId }]);
  check(
    "optimistic complete then undo returns the day's ledger to where it was",
    near(undone.ledger.today.rawBefore, l.rawBefore, 1e-9) && near(undone.ledger.today.lifeXp, 0, 1e-9) && undone.ledger.today.completions.length === 0,
    `rawBefore ${undone.ledger.today.rawBefore}, lifeXp ${undone.ledger.today.lifeXp}`
  );
}
{
  const a = taskDedupeKey("tpl", TODAY, 0, 0);
  check("a double tap writes one row: the same slot and attempt give the same dedupe key", a === taskDedupeKey("tpl", TODAY, 0, 0) && a !== taskDedupeKey("tpl", TODAY, 0, 1) && a !== taskDedupeKey("tpl", TODAY, 1, 0));
  const tick = new Date("2026-10-01T02:00:00.000Z");
  const lateNight = new Date("2026-10-01T17:55:00.000Z"); // 03:55 Sydney on the 2nd: still life day the 1st
  check(
    "undo: 9 minutes on is fine, 11 is too late, and never across the 04:00 edge",
    canUndo(tick, new Date(tick.getTime() + 9 * 60_000)) &&
      !canUndo(tick, new Date(tick.getTime() + 11 * 60_000)) &&
      !canUndo(lateNight, new Date(lateNight.getTime() + 6 * 60_000))
  );
}
{
  // A task with no minimum version cannot be ticked 'as its minimum'.
  const t = tpl({ id: "nomvv", title: "Clean garage" });
  const p = planCompletion({ template: t, day: TODAY, today: TODAY, slot: 0, mvv: true, ledger: ledger(TODAY), streakDays: 0 });
  const withMvv = planCompletion({ template: { ...t, mvv: "10 min" }, day: TODAY, today: TODAY, slot: 0, mvv: true, ledger: ledger(TODAY), streakDays: 0 });
  check("the minimum version is only on offer when the task has one", p.mode === "FULL" && withMvv.mode === "MVV" && withMvv.status === "DONE_MVV");
}

// ── The board: order, lanes, capacity, projections ────────────────────────
{
  const flat = [...BOARD_COLUMNS[0], ...BOARD_COLUMNS[1]];
  check(
    "ordering: review quest > must > today > yesterday > goals > anytime > inbox",
    BOARD_SECTIONS.join() === "quest,must,today,yesterday,goals,anytime,inbox" && flat.join() === BOARD_SECTIONS.join()
  );
}
{
  const t = (id: string, p: Partial<BoardTemplate>) => tpl({ id, title: `Task ${id}`, ...p });
  const templates = [
    t("planToday", { dueDay: TODAY, dueKind: "PLANNED" }),
    t("planCarried", { dueDay: ago(2), dueKind: "PLANNED" }),
    t("planLater", { dueDay: addDays(TODAY, 3), dueKind: "PLANNED" }),
    t("dlToday", { dueDay: TODAY, dueKind: "DEADLINE" }),
    t("dlMust", { dueDay: TODAY, dueKind: "DEADLINE", compulsory: true }),
    t("dlSoon", { dueDay: addDays(TODAY, 2), dueKind: "DEADLINE" }),
    t("dlFar", { dueDay: addDays(TODAY, 5), dueKind: "DEADLINE" }),
    t("dlLate", { dueDay: ago(2), dueKind: "DEADLINE" }),
    t("dlYesterday", { dueDay: YESTERDAY, dueKind: "DEADLINE" }),
    t("undated", {}),
    t("inboxed", { inbox: true }),
    t("target", { recurrence: "TARGET:3/W" }),
    t("targetMet", { recurrence: "TARGET:3/W" }),
    t("daily", { recurrence: "DAILY" }),
    t("dailyMust", { recurrence: "DAILY", compulsory: true }),
    t("monOnly", { recurrence: "DOW:1" }),
  ];
  // This week began Monday 28 Sep: 'target' has one day done, 'targetMet' three (none today).
  const history = [
    inst("target", ago(2)),
    inst("targetMet", ago(3)),
    inst("targetMet", ago(2)),
    inst("targetMet", ago(1)),
    // Two ticks on one day count once toward a TARGET.
    inst("target", ago(2), "DONE", 1),
  ];
  const b = buildBoard(board(templates, { history }));
  const lanes = Object.fromEntries(templates.map((x) => [x.id, laneOf(b, x.id)]));
  const late = rowOf(b, "dlLate")!;
  const carried = rowOf(b, "planCarried")!;
  const tgt = rowOf(b, "target")!;
  check("PLANNED: due today → Today; carried → Today, tagged; later → off the board", lanes.planToday === "today" && lanes.planCarried === "today" && carried.carriedFrom === ago(2) && carried.dueLabel === "from Tue" && lanes.planLater === "none" && b.later === 1, `${lanes.planToday}/${lanes.planCarried} '${carried.dueLabel}'/${lanes.planLater}`);
  check(
    "DEADLINE: today → Today (Must when compulsory); within 2 days → Today; further → Anytime",
    lanes.dlToday === "today" && lanes.dlMust === "must" && lanes.dlSoon === "today" && lanes.dlFar === "anytime",
    `${lanes.dlToday}/${lanes.dlMust}/${lanes.dlSoon}/${lanes.dlFar}`
  );
  check("DEADLINE passed → Today, late, priced at T 0.85", lanes.dlLate === "today" && late.late && late.projection.factors.find((f) => f.key === "T")?.value === 0.85, `late ${late.late}`);
  const yRow = b.yesterdayRows.find((r) => r.template.id === "dlYesterday");
  const tRow = b.todayRows.find((r) => r.template.id === "dlYesterday");
  const tOf = (r?: BoardRow) => r?.projection.factors.find((f) => f.key === "T")?.value;
  check(
    "DEADLINE yesterday: recordable as done yesterday at T 1.00, or late today at T 0.85",
    !!yRow && !!tRow && tOf(yRow) === 1 && tOf(tRow) === 0.85 && laneOf(b, "dlLate", YESTERDAY) === "none",
    `yesterday T ${tOf(yRow)}, today T ${tOf(tRow)}`
  );
  check("TARGET: short of target → Today with '1/3 this week' (two ticks on a day count once)", lanes.target === "today" && tgt.progress?.label === "1/3 this week", `${lanes.target} '${tgt.progress?.label}'`);
  check("TARGET: already met this week → Anytime", lanes.targetMet === "anytime");
  check("recurring: due today → Today, compulsory → Must, not scheduled today → off", lanes.daily === "today" && lanes.dailyMust === "must" && lanes.monOnly === "none");
  check(
    "yesterday: a daily habit with nothing recorded yesterday is recordable there",
    laneOf(b, "daily", YESTERDAY) === "yesterday" && laneOf(b, "dailyMust", YESTERDAY) === "yesterday" && laneOf(b, "monOnly", YESTERDAY) === "none"
  );
  check("undated → Anytime; inbox → Inbox", lanes.undated === "anytime" && lanes.inboxed === "inbox");
  // Musts: dlMust, dailyMust. Due: planToday, planCarried, dlToday, dlSoon, dlLate, dlYesterday, target, daily.
  check("counts: open musts and open due todos, for the nav", b.counts.musts === 2 && b.counts.due === 8 && b.counts.inbox === 1, `musts ${b.counts.musts}, due ${b.counts.due}, inbox ${b.counts.inbox}`);
}
{
  const templates = [
    tpl({ id: "garage", title: "Clean garage", estMinutes: 90, machineMinutes: 60 }),
    tpl({ id: "bins2", title: "Take out bins", band: "INTRO", estMinutes: 5, machineMinutes: 5 }),
    tpl({ id: "report", title: "Write report", band: "DEMANDING", estMinutes: 120, machineMinutes: 90 }),
    tpl({ id: "meds", title: "Refill prescription", band: "INTRO", estMinutes: 10, machineMinutes: 10, compulsory: true, dueDay: TODAY, dueKind: "DEADLINE" }),
  ].map((t) => ({ ...t, dueDay: t.dueDay ?? TODAY, dueKind: t.dueKind ?? ("PLANNED" as const) }));
  const b = buildBoard(board(templates, { capacityMin: 200 }));
  const planned = templates.reduce((s, t) => s + estEff(t.estMinutes, t.machineMinutes), 0);
  check("capacity: planned is Σ est_eff over Must and Today", b.planned === planned && b.over === planned - 200, `planned ${b.planned}, over ${b.over}`);
  const cheapest = [...b.todayRows].filter((r) => !r.template.compulsory).sort((x, y) => x.projection.xp - y.projection.xp)[0];
  check(
    "capacity: the suggested move is the lowest projected-XP card, never a compulsory one",
    b.suggestion?.template.id === cheapest.template.id && b.suggestion.template.id === "bins2",
    `suggest ${b.suggestion?.template.title} (${b.suggestion?.projection.xp})`
  );
  const within = buildBoard(board(templates, { capacityMin: 600 }));
  check("capacity: within it, no suggestion", within.over === 0 && within.suggestion === null);
}
{
  // Every open row's projection is priceTask for the same context: a busy
  // day (knee base 96, an earlier 'wash dishes' and INTRO work already done).
  const templates = [
    tpl({ id: "dish", title: "Wash the dishes", band: "INTRO", estMinutes: 15, machineMinutes: 15, recurrence: "DAILY", startDay: ago(12) }),
    tpl({ id: "run", title: "Run 5k", band: "DEMANDING", estMinutes: 30, machineMinutes: 30, track: "BODY", recurrence: "DOW:1,4", startDay: ago(30) }),
    tpl({ id: "form", title: "Visa paperwork", band: "DEMANDING", estMinutes: 120, machineMinutes: 120, dueDay: ago(1), dueKind: "DEADLINE" }),
    tpl({ id: "play", title: "Guitar #play", band: "STANDARD", intrinsic: true }),
    tpl({ id: "self", title: "Tidy desk", band: "STANDARD", bandOverride: 1 }),
  ];
  const history = [...daysBack(12, 1).map((d) => inst("dish", d)), inst("run", ago(3)), inst("run", ago(7))];
  const today = ledger(TODAY, {
    rawBefore: 96,
    completions: [completion("other-dish", normTitleOf("wash dishes"), { intro: true }), completion("x1", "zzz", { intro: true })],
  });
  const d = board(templates, { history, today });
  const b = buildBoard(d);
  let allEqual = true;
  const diffs: string[] = [];
  for (const r of [...b.must, ...b.todayRows, ...b.anytime]) {
    if (r.state !== "open") continue;
    const direct = priceFrom(r.template, r.day, d.ledger.today, r.streakDays);
    if (JSON.stringify(direct) !== JSON.stringify(r.projection)) {
      allEqual = false;
      diffs.push(r.template.id);
    }
  }
  check("every row's projection equals priceTask for the same context", allEqual, diffs.length ? `differs: ${diffs.join(", ")}` : `${b.todayRows.length + b.anytime.length} rows`);

  // After an optimistic tick of 'run', every other row re-prices on the new knee base.
  const runRow = rowOf(b, "run")!;
  const op: BoardOp = { id: "opt1", kind: "complete", templateId: "run", day: TODAY, slot: runRow.slot, at: "2026-10-01T02:00:00.000Z" };
  const after = buildBoard(d, [op]);
  const newBase = roundTo(96 + runRow.projection.raw, 3);
  const dishAfter = rowOf(after, "dish")!;
  check(
    "after an optimistic completion the next projections use the new R_before",
    near(dishAfter.projection.kneeBefore, newBase, 1e-9) && after.lifeXpToday === runRow.projection.xp && rowOf(after, "run")!.state === "done",
    `kneeBefore ${dishAfter.projection.kneeBefore} (want ${newBase})`
  );
  const expectDish = priceFrom(dishAfter.template, TODAY, applyOps(d, [op]).ledger.today, dishAfter.streakDays);
  check("…and equal priceTask against that new context", JSON.stringify(expectDish) === JSON.stringify(dishAfter.projection), `${dishAfter.projection.xp}`);
  check("#play projects 0 and a self-rating shows on its receipt", rowOf(b, "play")!.projection.xp === 0 && rowOf(b, "self")!.projection.selfRated === true);
}

// ── The review quest and study tasks ──────────────────────────────────────
{
  const q = questOf({ dayOpenQty: 17, reviews: 12, dueNow: 5, reviewXp: 30 });
  check("quest: 17 due at DAY_OPEN with 12 reviews reads 12/17, not complete", q.target === 17 && q.progress === 12 && !q.complete, `${q.progress}/${q.target}`);
  const done = questOf({ dayOpenQty: 17, reviews: 17, dueNow: 0, reviewXp: 47 });
  check("quest: reviewing everything completes it", done.complete && done.paidByReviews === 47);
  const noOpen = questOf({ dayOpenQty: null, reviews: 4, dueNow: 9, reviewXp: 8 });
  const rest = questOf({ dayOpenQty: 0, reviews: 0, dueNow: 0, reviewXp: 0 });
  check("quest: without DAY_OPEN the target is reviews + due; nothing due reads as rest", noOpen.target === 13 && rest.rest && rest.complete);

  // The quest writes nothing: the day's life XP is untouched by 17 reviews.
  const b = buildBoard(board([], { today: ledger(TODAY, { reviews: 17, reviewXp: 47, dayOpenQty: 17 }), dueNow: 0 }));
  check("quest: the Σ TRACK delta of clearing the queue is 0", b.lifeXpToday === 0 && b.reviewXpToday === 47);
}
{
  const t = tpl({ id: "rev20", title: "review 20", recurrence: "DAILY", autoMetric: "REVIEWS", autoTarget: 20, compulsory: true, band: "STANDARD", track: "CRAFT", startDay: ago(5) });
  const at19 = board([t], { today: ledger(TODAY, { reviews: 19 }), dueNow: 3 });
  const plan19 = planAutoCompletions({ templates: [t], today: TODAY, counts: { reviews: 19, ideas: 0, dueNow: 3 }, doneToday: new Set(), lastDone: {} });
  const row19 = rowOf(buildBoard(at19), t.id)!;
  check("a REVIEWS:20 task stays open (locked) at 19", plan19.length === 0 && row19.state === "locked" && row19.lane === "must", `${row19.state} in ${row19.lane}`);

  const plan20 = planAutoCompletions({ templates: [t], today: TODAY, counts: { reviews: 20, ideas: 0, dueNow: 3 }, doneToday: new Set(), lastDone: {} });
  const paid = planCompletion({ template: t, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY, { reviews: 20, rawBefore: 40 }), streakDays: 0, auto: true });
  check(
    "…and completes at 20 with xp 0, sink NONE, source auto:reviews",
    plan20.length === 1 && paid.receipt.xp === 0 && paid.receipt.raw === 0 && paid.sink === "NONE" && paid.source === "auto:reviews" && paid.mode === "STUDY",
    `xp ${paid.receipt.xp}, sink ${paid.sink}`
  );
  const cleared = autoStateOf(t, { reviews: 12, ideas: 0, dueNow: 0 });
  const idle = autoStateOf(t, { reviews: 0, ideas: 0, dueNow: 0 });
  check("a study task is also met when the queue is clear, and counts for the streak only if work was done", !!cleared?.met && cleared.worked && !!idle?.met && !idle.worked);

  // The audit: no TRACK row ever shares a sourceId with a REVIEW row.
  const reviews = ["idea-1", "idea-2", "idea-3"].map((id) => ({ source: "REVIEW", sink: "DOMAIN", sourceId: id }));
  const autoEvent = taskEventInput(paid, { templateId: t.id, track: t.track, instanceId: "inst-auto", day: TODAY, slot: 0, attempt: 0, now: new Date("2026-10-01T02:00:00Z") });
  const chore = tpl({ id: "chore", title: "Vacuum", band: "INTRO", estMinutes: 15, machineMinutes: 15 });
  const chorePlan = planCompletion({ template: chore, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 0 });
  const choreEvent = taskEventInput(chorePlan, { templateId: chore.id, track: chore.track, instanceId: "inst-chore", day: TODAY, slot: 0, attempt: 0, now: new Date("2026-10-01T02:00:00Z") });
  const rows = [...reviews, autoEvent, choreEvent];
  const reviewIds = new Set(reviews.map((r) => r.sourceId));
  const leaks = rows.filter((r) => r.sink === "TRACK" && r.sourceId && reviewIds.has(r.sourceId));
  check("audit: no TRACK row has a REVIEW sourceId; the study tick is sink NONE", leaks.length === 0 && autoEvent.sink === "NONE" && choreEvent.sink === "TRACK", `${leaks.length} leaks`);
}

// ── Goals ─────────────────────────────────────────────────────────────────
{
  check(
    "goal horizon: a tag may lower it, never raise it past what the deadline implies",
    horizonFor("LONG", "2026-12-31", TODAY) === "MID" && horizonFor("SHORT", "2027-09-01", TODAY) === "SHORT" && horizonFor(null, "2026-10-20", TODAY) === "SHORT" && horizonFor(null, null, TODAY) === "MID"
  );
  const books = goalMetricOf("read 12 books");
  check("'read 12 books' measures itself (MANUAL, 12 books); 'learn piano' is its steps", books.krMetric === "MANUAL" && books.krTarget === 12 && books.krUnit === "books" && goalMetricOf("learn piano").krMetric === "CHILDREN");

  const goal = tpl({ id: "g1", title: "Ship the thesis", kind: "GOAL", horizon: "LONG", krMetric: "CHILDREN" });
  const kids = [
    tpl({ id: "k1", title: "Outline", parentId: "g1", completedAt: "2026-09-20T00:00:00.000Z" }),
    tpl({ id: "k2", title: "Draft ch 1", parentId: "g1", completedAt: "2026-09-25T00:00:00.000Z" }),
    tpl({ id: "k3", title: "Draft ch 2", parentId: "g1" }),
    tpl({ id: "k4", title: "Draft ch 3", parentId: "g1" }),
  ];
  const manual = tpl({ id: "g2", title: "Read 12 books", kind: "GOAL", horizon: "MID", krMetric: "MANUAL", krTarget: 12, krUnit: "books" });
  const b = buildBoard(board([goal, ...kids, manual], { goalQty: { g2: 7 } }));
  const g1 = b.goals.LONG.find((g) => g.template.id === "g1");
  const g2 = b.goals.MID.find((g) => g.template.id === "g2");
  check("goal rollup: 2 of 4 one-off steps done; a hand-counted goal reads 7 of 12", g1?.progress === 0.5 && g1.label === "2 of 4 steps" && g2?.label === "7 of 12 books", `${g1?.label} / ${g2?.label}`);
  check("finished steps stay off the board", laneOf(b, "k1") === "none" && laneOf(b, "k3") === "anytime");
}

// ── Goals on Today, M5 phase B (m5-refit F15) ─────────────────────────────
{
  // A Mid goal due five days ago: one step done before its due day, one
  // after (which never counts), two open. A hand-counted goal due three days
  // ago with 4 logged before and 5 after. A Long goal due ahead, 2 of 3.
  const due = ago(5);
  const late = tpl({ id: "gl", title: "Ship the paper", kind: "GOAL", horizon: "MID", krMetric: "CHILDREN", dueDay: due, track: "CRAFT", goalMp: 6 });
  const lateKids = [
    tpl({ id: "gl1", title: "Outline", parentId: "gl", completedAt: "2026-09-20T00:00:00.000Z" }),
    tpl({ id: "gl2", title: "Draft", parentId: "gl", completedAt: "2026-09-29T00:00:00.000Z" }),
    tpl({ id: "gl3", title: "Edit", parentId: "gl" }),
    tpl({ id: "gl4", title: "Submit", parentId: "gl" }),
  ];
  const counted = tpl({ id: "gm", title: "Run 10 km", kind: "GOAL", horizon: "SHORT", krMetric: "MANUAL", krTarget: 10, krUnit: "km", dueDay: ago(3), goalMp: 1 });
  const ahead = tpl({ id: "ga", title: "Learn piano", kind: "GOAL", horizon: "LONG", krMetric: "CHILDREN", dueDay: addDays(TODAY, 200), goalMp: 20, track: "CARE" });
  const aheadKids = [
    tpl({ id: "ga1", title: "Scales", parentId: "ga", completedAt: "2026-09-10T00:00:00.000Z" }),
    tpl({ id: "ga2", title: "Chords", parentId: "ga", completedAt: "2026-09-12T00:00:00.000Z" }),
    tpl({ id: "ga3", title: "A piece", parentId: "ga" }),
  ];
  const closed = tpl({ id: "gc", title: "Old goal", kind: "GOAL", horizon: "MID", krMetric: "CHILDREN", closedScore: 0.8, completedAt: "2026-09-30T00:00:00.000Z", goalMp: 6 });
  const closedKid = tpl({ id: "gc1", title: "Old step", parentId: "gc", completedAt: "2026-09-01T00:00:00.000Z" });
  const goalDays = { gm: [{ day: ago(10), qty: 4 }, { day: ago(1), qty: 5 }] };
  const d = board([late, ...lateKids, counted, ahead, ...aheadKids, closed, closedKid], { goalQty: { gm: 9 }, goalDays });
  const b = buildBoard(d);
  const card = (id: string) => Object.values(b.goals).flat().find((g) => g.template.id === id);

  // goals.ts goalProgress over an input built here, by hand, from the same fixture.
  const stepsOf = (days: (DayKey | null)[]): GoalProgressInput["steps"] => days.map((completedDay) => ({ completedDay }));
  const expected: [string, GoalProgressInput, DayKey | null][] = [
    ["gl", { krMetric: "CHILDREN", krTarget: null, steps: stepsOf(["2026-09-20", "2026-09-29", null, null]), progress: [] }, due],
    ["gm", { krMetric: "MANUAL", krTarget: 10, steps: [], progress: goalDays.gm }, ago(3)],
    ["ga", { krMetric: "CHILDREN", krTarget: null, steps: stepsOf(["2026-09-10", "2026-09-12", null]), progress: [] }, addDays(TODAY, 200)],
  ];
  const off = expected.filter(([id, input, dueDay]) => card(id)?.progress !== goalProgress(input, goalAsOf(TODAY, dueDay)));
  check(
    "goal card: progress is goals.ts goalProgress as of min(today, due day) (0.25, 0.4, 2/3)",
    off.length === 0 && card("gl")?.progress === 0.25 && card("gm")?.progress === 0.4 && near(card("ga")?.progress ?? 0, 2 / 3),
    off.map(([id]) => `${id}: ${card(id)?.progress}`).join("; ")
  );
  check("goal card: a step done after the due day never counts (1 of 4, not 2 of 4)", card("gl")?.label === "1 of 4 steps", card("gl")?.label);
  check("goal card: a number logged after the due day never counts (4 of 10 km, not 9)", card("gm")?.label === "4 of 10 km", card("gm")?.label);
  check(
    "goal card: carried is g when past due and below 1, else null",
    card("gl")?.carried === 0.25 && card("gm")?.carried === 0.4 && card("ga")?.carried === null,
    `${card("gl")?.carried} / ${card("gm")?.carried} / ${card("ga")?.carried}`
  );
  const done = buildBoard(board([tpl({ ...late, id: "gd" }), ...lateKids.map((k) => tpl({ ...k, id: `d${k.id}`, parentId: "gd", completedAt: "2026-09-20T00:00:00.000Z" }))]));
  check("goal card: past due at 100% is not carried", done.goals.MID[0]?.progress === 1 && done.goals.MID[0]?.carried === null);

  // A closed goal leaves the strip (and placeOf agrees: it is closed, not on the board).
  check("closed goal: off the strip", !card("gc") && Object.values(b.goals).flat().length === 3);
  const place = placeOf(closed, TODAY);
  check("closed goal: placeOf files it as Closed, not Goals", place.lane === "done" && place.label === "Closed", `${place.lane} '${place.label}'`);
  check("closed goal: its steps stay off the board too", laneOf(b, "gc1") === "none");

  // Older fixtures without goalDays: goalQty counts from the day the goal was set.
  const legacy = buildBoard(board([tpl({ ...counted, id: "gq", dueDay: null })], { goalQty: { gq: 7 } }));
  check("goal card: without goalDays, goalQty counts (7 of 10 km)", legacy.goals.SHORT[0]?.progress === 0.7 && legacy.goals.SHORT[0]?.label === "7 of 10 km");

  // A metric goals.ts does not measure says so, with no meter.
  const reviews = buildBoard(board([tpl({ id: "gr", title: "Review 500 cards", kind: "GOAL", horizon: "MID", krMetric: "REVIEWS" }), tpl({ id: "gr1", title: "Step", parentId: "gr" })]));
  check("goal card: a REVIEWS goal is not measured (no meter, 'not measured')", reviews.goals.MID[0]?.progress === null && reviews.goals.MID[0]?.label === "not measured");

  // Percentages: goalPercent (floored), so Today and the You sheet print one number. 2 of 3 is 66%, never 67%.
  const pianoCopy = goalCardCopy(card("ga")!, true);
  check("goal card: the percentage is goalPercent, floored (2 of 3 → 66%)", pianoCopy.percent === `${goalPercent(card("ga")!.progress!)}%` && pianoCopy.percent === "66%", pianoCopy.percent ?? "null");
  const ladderItem: GoalLadderItem = {
    id: "ga",
    title: "Learn piano",
    horizon: "LONG",
    track: "CARE",
    stated: 20,
    copy: "",
    g: goalProgress(expected[2][1], goalAsOf(TODAY, expected[2][2])),
    progressLabel: "2 of 3 steps",
    dueDay: addDays(TODAY, 200),
    pastDue: false,
    carried: null,
    preview: null,
    closed: null,
  };
  const youMeta = goalRowCopy(ladderItem, true, TODAY).meta;
  check("goal card: Today and the You sheet read the same percentage", youMeta.includes(` ${pianoCopy.percent} `), youMeta);
  const manualCopy = goalCardCopy(card("gm")!, true);
  check("goal card: a hand-counted goal shows its count, not a percentage", manualCopy.percent === null);
  const sixtyNine = goalCardCopy({ ...card("ga")!, progress: 0.695 }, true);
  check("goal card: 0.695 reads 69%, never 70% (it pays 0 below 70%)", sixtyNine.percent === "69%", sixtyNine.percent ?? "null");

  // A new goal states its MP, frozen at creation: Short 1, Mid 6, Long 20.
  const goalOf = (text: string) => {
    const parsed = parseCapture(text, { today: TODAY });
    const shape = captureShapeOf(parsed, TODAY);
    return captureGoalFields(shape.kind, parsed.title, parsed.horizon, shape.dueDay, TODAY);
  };
  const short = goalOf("goal: file the tax return by 20 oct");
  const mid = goalOf("goal: read 12 books by 15 dec");
  const long = goalOf("goal: learn piano #long");
  const task = goalOf("buy milk");
  check(
    "new goal: stores goalMp = statedGoalMp(horizon): Short 1, Mid 6, Long 20",
    short.horizon === "SHORT" && short.goalMp === 1 && mid.horizon === "MID" && mid.goalMp === 6 && long.horizon === "LONG" && long.goalMp === 20,
    `${short.horizon} ${short.goalMp} / ${mid.horizon} ${mid.goalMp} / ${long.horizon} ${long.goalMp}`
  );
  check("new goal: a task stores no goal fields (goalMp null)", task.goalMp === null && task.horizon === null && task.krMetric === null);
  check("new goal: 'read 12 books' still measures itself (MANUAL, 12 books)", mid.krMetric === "MANUAL" && mid.krTarget === 12 && mid.krUnit === "books");
  const tasksSrc = readFileSync(resolve(__dirname, "../src/lib/tasks.ts"), "utf8");
  const select = /const TEMPLATE_SELECT = \{([\s\S]*?)\} satisfies/.exec(tasksSrc)?.[1] ?? "";
  check("new goal: the INSERT writes goalMp; TEMPLATE_SELECT reads goalMp and closedScore", /goalMp: goal\.goalMp,/.test(tasksSrc) && /goalMp: true/.test(select) && /closedScore: true/.test(select));
  check("board read: toBoardTemplate carries goalMp and closedScore", /goalMp: r\.goalMp,/.test(tasksSrc) && /closedScore: r\.closedScore,/.test(tasksSrc));
  check("board read: GOAL_PROGRESS is grouped by goal and day (goalDays)", /by: \["templateId", "day"\],\s*where: \{ userId, source: "GOAL_PROGRESS" \}/.test(tasksSrc) && /goalDays,\r?\n/.test(tasksSrc));
  check("closed goal: +1 and linking a step refuse it (closedScore: null in both reads)", (tasksSrc.match(/kind: "GOAL", archivedAt: null, closedScore: null \}/g) ?? []).length >= 2);
}

// ── The server accepts exactly what the board offers ─────────────────────
{
  const t = (id: string, p: Partial<BoardTemplate>) => tpl({ id, title: `Task ${id}`, ...p });
  const templates = [
    t("planToday", { dueDay: TODAY, dueKind: "PLANNED" }),
    t("planCarried", { dueDay: ago(2), dueKind: "PLANNED" }),
    t("planYesterday", { dueDay: YESTERDAY, dueKind: "PLANNED" }),
    t("dlYesterday", { dueDay: YESTERDAY, dueKind: "DEADLINE" }),
    t("dlYesterdayPutOff", { dueDay: YESTERDAY, dueKind: "DEADLINE", planDay: TODAY }),
    t("dlToday", { dueDay: TODAY, dueKind: "DEADLINE" }),
    t("undated", {}),
    t("daily", { recurrence: "DAILY" }),
    t("dailyNew", { recurrence: "DAILY", startDay: TODAY }),
    t("monOnly", { recurrence: "DOW:1" }),
    t("wedOnly", { recurrence: "DOW:3" }),
    t("target", { recurrence: "TARGET:3/W" }),
    t("after30", { recurrence: "AFTER:30", startDay: ago(40) }),
    t("every100", { recurrence: "EVERY:100", startDay: ago(40) }),
    t("studyDaily", { recurrence: "DAILY", autoMetric: "REVIEWS", autoTarget: 20 }),
    t("skippedY", { recurrence: "DAILY" }),
  ];
  const history = [inst("after30", ago(5)), inst("skippedY", YESTERDAY, "SKIPPED")];
  const d = board(templates, { history, dueNow: 5 });
  const b = buildBoard(d);
  const gate = (x: BoardTemplate, day: DayKey) =>
    completionBlockOf({
      t: x,
      rule: parseRule(x.recurrence),
      day,
      today: TODAY,
      lastDone: lastDoneOf(history.filter((i) => i.templateId === x.id)),
      onDay: history.filter((i) => i.templateId === x.id && i.day === day),
    });
  const openOn = (day: DayKey) => [...b.must, ...b.todayRows, ...b.yesterdayRows, ...b.anytime].filter((r) => r.day === day && r.state === "open");
  const offeredButRefused = [...openOn(TODAY), ...openOn(YESTERDAY)].filter((r) => gate(r.template, r.day) !== null).map((r) => `${r.template.id}@${r.day}`);
  check("every open row the board offers, today or yesterday, the server accepts", offeredButRefused.length === 0, offeredButRefused.join(", "));
  const yesterdayOffered = new Set(b.yesterdayRows.map((r) => r.template.id));
  const mismatched = templates.filter((x) => (gate(x, YESTERDAY) === null) !== yesterdayOffered.has(x.id)).map((x) => x.id);
  check(
    "yesterday: the server books exactly the Yesterday lane — nothing unscheduled, put off, skipped or study-linked",
    mismatched.length === 0 && yesterdayOffered.has("daily") && yesterdayOffered.has("dlYesterday") && yesterdayOffered.has("wedOnly"),
    mismatched.length ? `mismatch: ${mismatched.join(", ")}` : [...yesterdayOffered].join(", ")
  );
  const notDue = ["monOnly", "after30", "every100"].map((id) => [id, gate(templates.find((x) => x.id === id)!, TODAY)] as const);
  check(
    "today: a repeating task its rule does not expect today is refused (a board-less forged tick)",
    notDue.every(([, why]) => why === "It isn't due today."),
    notDue.map(([id, why]) => `${id}: ${why}`).join("; ")
  );
  check("a day that is neither today nor yesterday is refused (a board left open across 04:00)", gate(templates[0], ago(2))?.includes("Refresh") === true);
  check("a one-off already done is refused on any day", gate({ ...templates[6], completedAt: "2026-09-30T02:00:00.000Z" }, TODAY) === "Already done.");

  // The farm the review found: a sparse rule ticked on consecutive days would
  // count kept × N day-equivalents (AFTER:30 → 60, EVERY:100 → 100 after two
  // ticks, against DAILY's 2). The gate refuses the second day outright.
  const after = templates.find((x) => x.id === "after30")!;
  const farmed = streakDaysFor(after, parseRule("AFTER:30")!, [inst("after30", ago(2)), inst("after30", ago(1))], TODAY);
  check("AFTER:30 ticked two days running would farm C (60 day-equivalents); the next day's tick is refused", farmed === 60 && gate(after, TODAY) !== null, `farmed ${farmed}`);
  check("…and yesterdayRecordable never offers AFTER, TARGET or a study task", !yesterdayRecordable(after, parseRule("AFTER:30"), YESTERDAY, null) && !yesterdayRecordable(templates[11], parseRule("TARGET:3/W"), YESTERDAY, null) && !yesterdayRecordable(templates[14], parseRule("DAILY"), YESTERDAY, null));
}

// ── Concurrent completions: why each one is priced after the last ─────────
{
  // Fifty DEMANDING 60-minute one-offs. Priced one after another against the
  // ledger each earlier one left (what the per-user lock and freshness guard
  // guarantee), the day totals g(ΣR) and stops at the 300 cap. Priced all
  // against the same read (parallel requests without the guard), they paid
  // 50 × 23.3.
  // Titles with nothing in common, so repeat decay never applies and only the knee can hold the day.
  let seed = 11;
  const letter = () => "abcdefghijklmnopqrstuvwxyz"[(seed = (seed * 48271) % 2147483647) % 26];
  const word = () => Array.from({ length: 9 }, letter).join("");
  const tasks = Array.from({ length: 50 }, (_, i) => tpl({ id: `d${i}`, title: `${word()} ${word()}`, band: "DEMANDING", estMinutes: 60, machineMinutes: 60 }));
  const groups = new Set(tasks.map((x) => repeatNOf({ templateId: x.id, normTitle: x.normTitle }, tasks.filter((y) => y !== x).map((y) => ({ templateId: y.id, normTitle: y.normTitle })))));
  let l = ledger(TODAY);
  let serial = 0;
  let parallel = 0;
  let rawSum = 0;
  for (const x of tasks) {
    const p = planCompletion({ template: x, day: TODAY, today: TODAY, slot: 0, ledger: l, streakDays: 0 });
    const alone = planCompletion({ template: x, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 0 });
    serial += p.receipt.xp;
    parallel += alone.receipt.xp;
    rawSum += p.receipt.raw;
    l = { ...l, rawBefore: l.rawBefore + p.receipt.raw, completions: [...l.completions, { ...p.completion, eventId: `e-${x.id}` }] };
  }
  check(
    "serialised completions: a forged day of 50 demanding tasks pays g(ΣR), never past the 300 cap",
    groups.size === 1 && groups.has(1) && serial <= KNEE_CAP + 0.05 && serial >= KNEE_CAP - 0.05 && Math.abs(serial - kneeG(rawSum)) <= 0.05,
    `serial ${serial.toFixed(1)}, g(ΣR) ${kneeG(rawSum).toFixed(1)}, same-read ${parallel.toFixed(1)}`
  );
  check("…where pricing them all against one read would have paid 1165", Math.abs(parallel - 1165) < 0.5, parallel.toFixed(1));
}

// ── V counts the band a completion was paid as ────────────────────────────
{
  const introReceipt = planCompletion({ template: tpl({ id: "b", title: "Bins", band: "INTRO", estMinutes: 5, machineMinutes: 5 }), day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 0 }).receipt;
  check(
    "a ticked INTRO task self-rated +1 afterwards still counts toward today's INTRO volume",
    paidIntroOf(introReceipt, { band: "INTRO", bandOverride: 1 }) === true && paidIntroOf(null, { band: "INTRO", bandOverride: 1 }) === false,
    `receipt band ${introReceipt.factors[0].label}`
  );
}

// ── Capture: the habit's phase, and the toast priced like the row ─────────
{
  const start = (line: string) => {
    const p = parseCapture(line, { today: TODAY });
    return { p, start: startDayFor(p, TODAY) };
  };
  const g = start("every 2 weeks on mon clean gutters");
  const rule = parseRule(g.p.recurrence)!;
  check(
    "'every 2 weeks on mon', captured on a Thursday, starts the next Monday and runs on Mondays",
    g.start === "2026-10-05" && !occursOn(rule, g.start, TODAY) && nextDue(rule, g.start, TODAY) === "2026-10-05" && occursOn(rule, g.start, "2026-10-19") && weekdayOf(nextDue(rule, g.start, "2026-10-06")!) === 1,
    `start ${g.start}`
  );
  check("'every other sat' starts on the coming Saturday", start("every other sat long run").start === "2026-10-03");
  check("a plain habit starts today; a deadline ('until fri') is not a start", start("stretch daily").start === TODAY && start("stretch daily until fri").start === TODAY);

  // The toast's '≈ N XP' is the row's price against today's real ledger.
  const busy = ledger(TODAY, { rawBefore: 150, completions: [completion("x", "zzz")] });
  const x = tpl({ id: "new", title: "Gym legs", band: "DEMANDING", estMinutes: 60, machineMinutes: 60, track: "BODY" });
  const toast = planCompletion({ template: x, day: TODAY, today: TODAY, slot: 0, ledger: busy, streakDays: 0 }).receipt.xp;
  const rowXp = rowOf(buildBoard(board([x], { today: busy })), "new")!.projection.xp;
  const empty = planCompletion({ template: x, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 0 }).receipt.xp;
  check("the capture toast's price equals the row's on a busy day (not an empty day's)", toast === rowXp && toast < empty, `toast ${toast}, row ${rowXp}, empty-day ${empty}`);
}

// ── Moving a deadline keeps its day and its lateness ──────────────────────
{
  const sat = addDays(TODAY, 2);
  const putOff = tpl({ id: "tax2", title: "Tax return", band: "DEMANDING", estMinutes: 120, machineMinutes: 120, dueDay: sat, dueKind: "DEADLINE", planDay: addDays(TODAY, 1) });
  const b = buildBoard(board([putOff]));
  check("a deadline put off to tomorrow leaves today's board (counted as later)", laneOf(b, "tax2") === "none" && b.later === 1);
  const tOn = (day: DayKey) => planCompletion({ template: putOff, day, today: day, slot: 0, ledger: ledger(day), streakDays: 0 }).timing;
  check("…and keeps its real deadline: on time on Saturday, late on Sunday", tOn(sat) === "ON_TIME" && tOn(addDays(sat, 1)) === "LATE");
  const late = tpl({ id: "late2", title: "Visa form", dueDay: ago(2), dueKind: "DEADLINE", planDay: TODAY });
  const lateRow = rowOf(buildBoard(board([late])), "late2");
  check("a late deadline put off is still late when it comes back (T 0.85)", lateRow?.late === true && lateRow.projection.factors.find((f) => f.key === "T")?.value === 0.85);
  const mustToday = tpl({ id: "m", title: "Rent", compulsory: true, dueDay: TODAY, dueKind: "DEADLINE" });
  check(
    "a compulsory deadline is never put off past its day; an ordinary one may be; a compulsory habit can't be skipped",
    moveBlockOf(mustToday, addDays(TODAY, 1), TODAY) !== null &&
      moveBlockOf({ ...mustToday, dueDay: sat }, addDays(TODAY, 1), TODAY) === null &&
      moveBlockOf({ ...mustToday, compulsory: false }, addDays(TODAY, 1), TODAY) === null &&
      moveBlockOf(tpl({ id: "h", title: "Meds", recurrence: "DAILY", compulsory: true }), addDays(TODAY, 1), TODAY) !== null
  );
  const dueToday = tpl({ id: "dt", title: "Report", estMinutes: 30, machineMinutes: 30, dueDay: TODAY, dueKind: "DEADLINE" });
  const planned = tpl({ id: "pl", title: "Tidy shed", band: "STANDARD", estMinutes: 300, machineMinutes: 240, dueDay: TODAY, dueKind: "PLANNED" });
  const cheap = buildBoard(board([dueToday, planned], { capacityMin: 60 }));
  check("the capacity tile never suggests moving a deadline due today", cheapestMovable(cheap.todayRows)?.template.id === "pl", cheapestMovable(cheap.todayRows)?.template.id ?? "none");
}

// ── In-process memos forget everything a reset deletes ────────────────────
{
  let seq = 0;
  const epoch = () => cached("board-check:memoEpoch", [], async () => ++seq, 365 * 86_400_000);
  const memo = new EpochSet();
  (async () => {
    const e1 = await epoch();
    memo.add(e1, "user:2026-10-01");
    invalidate("life", "activity", "ideas", "fields", "progress");
    const e2 = await epoch();
    const keptThroughWrites = e2 === e1 && memo.has(e2, "user:2026-10-01");
    invalidateAll(); // what every reset does
    const e3 = await epoch();
    const forgotten = e3 !== e1 && !memo.has(e3, "user:2026-10-01");
    check("a memo survives ordinary writes but not a reset (DAY_OPEN is rewritten after one)", keptThroughWrites && forgotten, `epochs ${e1}/${e2}/${e3}`);
    finish();
  })();
}

// ── Goal progress and the nav's study count ───────────────────────────────
{
  check(
    "goal progress only goes up: negatives and zero are refused, the rest rounded and capped",
    goalProgressQty(-1) === null && goalProgressQty(0) === null && goalProgressQty(Number.NaN) === null && goalProgressQty(1.23) === 1.2 && goalProgressQty(5000) === 1000
  );
  const s = tpl({ id: "rq", title: "Reviews", recurrence: "DAILY", autoMetric: "REVIEW_DUE", compulsory: true });
  const cleared = buildBoard(board([s], { dueNow: 0 })).counts;
  const unknown = buildBoard(board([s], { dueNow: null })).counts;
  check("a study task met by an empty queue is not an open must (the nav reads the due count too)", cleared.musts === 0 && unknown.musts === 1, `with count ${cleared.musts}, without ${unknown.musts}`);
}

// ── Where a capture went: placeOf names the lane buildBoard files it in ───
{
  const sat = addDays(TODAY, 2);
  const t = (id: string, p: Partial<BoardTemplate>) => tpl({ id, title: `Task ${id}`, ...p });
  const templates = [
    t("undated", {}),
    t("laterFri", { dueDay: addDays(TODAY, 1), dueKind: "PLANNED" }),
    t("laterFar", { dueDay: "2026-10-15", dueKind: "PLANNED" }),
    t("monHabit", { recurrence: "DOW:1", startDay: TODAY }),
    t("dl10", { dueDay: addDays(TODAY, 10), dueKind: "DEADLINE" }),
    t("dl4", { dueDay: addDays(TODAY, 4), dueKind: "DEADLINE" }),
    t("putOff", { dueDay: sat, dueKind: "DEADLINE", planDay: addDays(TODAY, 1) }),
    t("inbox", { inbox: true }),
    t("draft", { kind: "IDEA_DRAFT", inbox: true }),
    t("goal", { kind: "GOAL", horizon: "MID" }),
    t("doneNow", { completedAt: "2026-09-30T23:00:00.000Z" }),
    t("habitDone", { recurrence: "DAILY", startDay: TODAY }),
    t("must", { dueDay: TODAY, dueKind: "DEADLINE", compulsory: true }),
    t("mustSoon", { dueDay: sat, dueKind: "DEADLINE", compulsory: true }),
    t("planned", { dueDay: TODAY, dueKind: "PLANNED" }),
    t("habit", { recurrence: "DAILY", startDay: TODAY }),
    t("phase", { recurrence: "EVERY:14", startDay: "2026-10-05" }),
    t("targetLater", { recurrence: "TARGET:3/W", startDay: "2026-10-05" }),
    t("targetMet", { recurrence: "TARGET:2/W", startDay: ago(30) }),
    t("doneLong", { completedAt: "2026-09-20T02:00:00.000Z" }),
  ];
  const history = [inst("doneNow", TODAY), inst("habitDone", TODAY), inst("targetMet", ago(3)), inst("targetMet", ago(2))];
  const d = board(templates, { history });
  const b = buildBoard(d);
  const where = (id: string) => {
    const x = templates.find((y) => y.id === id)!;
    return placeOf(x, TODAY, d.instances.filter((i) => i.templateId === id), d.stats[id]?.lastDone ?? null);
  };
  const expect: Record<string, string> = {
    undated: "anytime|Anytime",
    laterFri: "later|Planned later · Fri 2 Oct",
    laterFar: "later|Planned later · Thu 15 Oct",
    monHabit: "upcoming|Habits · next Mon",
    dl10: "anytime|Anytime · by 11 Oct",
    dl4: "anytime|Anytime · by Mon",
    putOff: "later|Planned later · Fri 2 Oct",
    inbox: "inbox|Inbox",
    draft: "inbox|Inbox",
    goal: "goals|Goals",
    doneNow: "done|Done today",
    habitDone: "done|Done today",
    must: "must|Must",
    mustSoon: "planned|Planned",
    planned: "planned|Planned",
    habit: "habits|Habits",
    phase: "upcoming|Habits · from Mon",
    targetLater: "upcoming|Habits · from Mon",
    targetMet: "anytime|Anytime",
    doneLong: "done|Done",
  };
  const wrong = Object.entries(expect)
    .map(([id, want]) => [id, want, `${where(id).lane}|${where(id).label}`] as const)
    .filter(([, want, got]) => want !== got);
  check(
    "where labels: undated, planned later, a habit not due today, a deadline in 10 days, a put-off deadline, inbox, goal, done-now",
    wrong.length === 0,
    wrong.map(([id, want, got]) => `${id}: want '${want}', got '${got}'`).join("; ")
  );
  check("…every label names a PLACE_LANES lane", templates.every((x) => PLACE_LANES.includes(where(x.id).lane)));

  // Anytime's 'Planned later': by the day each returns, then title; a put-off deadline keeps its own day in view.
  check(
    "laterRows: sorted by day, then title, and counted by `later`",
    b.laterRows.map((l) => l.templateId).join(",") === "laterFri,putOff,laterFar" && b.later === 3,
    b.laterRows.map((l) => `${l.templateId}@${l.day}`).join(",")
  );
  const putOff = b.laterRows.find((l) => l.templateId === "putOff");
  const far = b.laterRows.find((l) => l.templateId === "laterFar");
  check("laterRows: labels read 'tomorrow · by Sat' (put-off deadline) and '15 Oct'", putOff?.label === "tomorrow · by Sat" && far?.label === "15 Oct", `${putOff?.label} / ${far?.label}`);
  const ties = buildBoard(board([t("b", { title: "Beta", dueDay: "2026-10-03", dueKind: "PLANNED" }), t("a", { title: "Alpha", dueDay: "2026-10-03", dueKind: "PLANNED" }), t("c", { title: "Aardvark", dueDay: "2026-10-02", dueKind: "PLANNED" })]));
  check("laterRows: same day sorts by title", ties.laterRows.map((l) => l.title).join(",") === "Aardvark,Alpha,Beta", ties.laterRows.map((l) => l.title).join(","));
}
{
  // placeOf against buildBoard on every fixture board above: the lane it
  // names is the lane the board actually put the template in.
  type Board = ReturnType<typeof buildBoard>;
  const disagree: string[] = [];
  let templates = 0;
  for (const d of fixtureBoards) {
    let b: Board;
    try {
      b = buildBoard(d);
    } catch (err) {
      disagree.push(`buildBoard threw: ${String(err)}`);
      continue;
    }
    const byTpl = new Map<string, BoardInstance[]>();
    for (const i of d.instances) byTpl.set(i.templateId, [...(byTpl.get(i.templateId) ?? []), i]);
    const onTodayIds = new Set([...b.must, ...b.todayRows].map((r) => r.template.id));
    const upcomingIds = new Set(upcomingOf(d, onTodayIds).map((u) => u.templateId));
    for (const t of d.templates) {
      templates += 1;
      const insts = byTpl.get(t.id) ?? [];
      const lastDone = d.stats[t.id]?.lastDone ?? null;
      const place = placeOf(t, d.today, insts, lastDone);
      const full = placementOf(t, { today: d.today, yesterday: d.yesterday, instances: insts, lastDone }).place;
      const on = (rows: BoardRow[]) => rows.some((r) => r.template.id === t.id && r.day === d.today);
      const inMust = on(b.must);
      const inToday = on(b.todayRows);
      const inAnytime = b.anytime.some((r) => r.template.id === t.id);
      const anyRow = [...b.must, ...b.todayRows, ...b.yesterdayRows, ...b.anytime].filter((r) => r.template.id === t.id);
      const inLater = b.laterRows.some((l) => l.templateId === t.id);
      let ok: boolean;
      switch (place.lane) {
        case "must":
          ok = inMust && !inToday && !inAnytime;
          break;
        case "planned":
          ok = inToday && !ruleOf(t) && !inMust;
          break;
        case "habits":
          ok = inToday && !!ruleOf(t) && !inMust;
          break;
        case "done":
          ok = anyRow.some((r) => r.state === "done") || (anyRow.length === 0 && !!t.completedAt);
          break;
        case "anytime":
          ok = inAnytime && !inMust && !inToday;
          break;
        case "later":
          ok = inLater && !inMust && !inToday && !inAnytime;
          break;
        case "upcoming":
          ok = upcomingIds.has(t.id) && !inMust && !inToday && !inAnytime;
          break;
        case "inbox":
          ok = b.inbox.some((x) => x.id === t.id);
          break;
        case "goals":
          ok = Object.values(b.goals).some((cards) => cards.some((g) => g.template.id === t.id));
          break;
      }
      if (!ok || full.lane !== place.lane || full.label !== place.label) disagree.push(`${t.id} → ${place.lane} '${place.label}'`);
    }
  }
  check(
    `placeOf agrees with buildBoard's lane for every fixture template (${templates} across ${fixtureBoards.length} boards)`,
    disagree.length === 0 && templates > 50,
    disagree.slice(0, 8).join("; ")
  );
}

// ═══ M2 on the board (lane D: F3 UI, F7, F10, F12, F13) ═══════════════════
// BoardData.duty from fixtures: the owed cards, a debited one-off, a pending
// rule change, a rest day, the settlement cursor; and the live Full-day ring
// against settlement's own input on the same eight days.
{
  const LAUNCH: DayKey = "2026-09-28";
  const dutyOf = (p: Partial<DutyBoard> = {}): DutyBoard => ({
    live: true,
    launchDay: LAUNCH,
    cursor: ago(2),
    owed: [],
    rest: { yesterday: null, today: null, tomorrow: null, vacationUntil: null },
    freezes: { banked: 0, willCover: false },
    pending: {},
    settled: [],
    ...p,
  });
  const card = (t: BoardTemplate, day: DayKey, p: Partial<OwedCard> = {}): OwedCard => ({
    instanceId: `debt-${t.id}-${day}`,
    templateId: t.id,
    title: t.title,
    archived: false,
    day,
    slot: 0,
    debtXp: 4.2,
    restoreBy: addDays(day, 2),
    restoresToday: true,
    restoresStreak: null,
    mvv: t.mvv,
    makeUpXp: 999,
    minimumXp: null,
    studyLinked: false,
    canWriteOff: false,
    template: t,
    ...p,
  });
  const withDuty = (d: BoardData, duty: DutyBoard): BoardData => ({ ...d, duty });

  // F12: BoardData.duty from fixtures; the owed cards re-priced against the live ledger.
  const dishes = tpl({ id: "dishes", title: "dishes", band: "INTRO", estMinutes: 15, machineMinutes: 15, recurrence: "DAILY", compulsory: true });
  const stretch = tpl({ id: "stretch15", title: "stretch 15m", band: "STANDARD", estMinutes: 15, machineMinutes: 15, recurrence: "DAILY", compulsory: true, mvv: "5 min" });
  check("make-up price: the dishes golden 3.5 (T 0.85, C 1.00)", makeUpPricesOf(dishes, ledger(TODAY), TODAY).makeUpXp === 3.5, String(makeUpPricesOf(dishes, ledger(TODAY), TODAY).makeUpXp));
  check("make-up price: the 'stretch 15m' minimum golden 2.1 (K 0.3 × T 0.85)", makeUpPricesOf(stretch, ledger(TODAY), TODAY).minimumXp === 2.1, String(makeUpPricesOf(stretch, ledger(TODAY), TODAY).minimumXp));
  const d0 = withDuty(board([dishes]), dutyOf({ owed: [card(dishes, ago(2))] }));
  const b0 = buildBoard(d0);
  check("DutyBoard: the board carries the debt, re-priced (never the stale figure it was read with)", b0.owed.length === 1 && b0.owed[0].makeUpXp === 3.5 && b0.dutyLive);
  const busyDay = ledger(TODAY, { rawBefore: 220, completions: [completion("x1", "chores", { intro: true, raw: 6, xp: 6 }), completion("x2", "dishes", { raw: 4, xp: 4 })] });
  const b1 = buildBoard({ ...d0, ledger: { today: busyDay, yesterday: ledger(YESTERDAY) } });
  check("DutyBoard: a tick today moves a make-up's price as it moves a row's (the same pricer)", b1.owed[0].makeUpXp === makeUpPricesOf(dishes, busyDay, TODAY).makeUpXp && b1.owed[0].makeUpXp < 3.5, String(b1.owed[0].makeUpXp));
  const onlyDebts = buildBoard(withDuty(board([]), dutyOf({ owed: [card(dishes, ago(2))] })));
  check("must lane: with debts only, no Must rows and the debt still on the board", onlyDebts.must.length === 0 && onlyDebts.owed.length === 1);
  check("before Duty data, the board has no debts, no rest day and is not live", (() => {
    const b = buildBoard(board([dishes]));
    return b.owed.length === 0 && b.restToday === null && !b.dutyLive;
  })());

  // Decision 18: a debited one-off shows only its MakeUpCard, never a late row.
  const invoice = tpl({ id: "invoice", title: "Invoice", dueKind: "DEADLINE", dueDay: ago(2), compulsory: true });
  const invoiceY = tpl({ id: "invoiceY", title: "Report", dueKind: "DEADLINE", dueDay: YESTERDAY, compulsory: true });
  const plain = buildBoard(board([invoice, invoiceY]));
  check("a late compulsory one-off is a late Must row without a debt", laneOf(plain, "invoice") === "must" && laneOf(plain, "invoiceY", YESTERDAY) === "yesterday");
  const debited = buildBoard(withDuty(board([invoice, invoiceY]), dutyOf({ cursor: YESTERDAY, owed: [card(invoice, ago(2)), card(invoiceY, YESTERDAY)] })));
  check(
    "a debited one-off shows its card and no late row (nor a yesterday row)",
    laneOf(debited, "invoice") === "none" && laneOf(debited, "invoiceY") === "none" && laneOf(debited, "invoiceY", YESTERDAY) === "none" && debited.owed.length === 2
  );

  // F7: MADE_UP reads done on the board while its streak reads missed.
  const madeUp = tpl({ id: "mu", title: "Meditate", recurrence: "DAILY" });
  const mb = buildBoard(board([madeUp], { history: [inst("mu", TODAY, "MADE_UP")] }));
  check("MADE_UP reads done on the board", isDoneStatus("MADE_UP") && rowOf(mb, "mu")?.state === "done");

  // F3: the pending meta line; a pending archive leaves the board on its effective day.
  const archiveOn = (day: DayKey) => ({ v: 1 as const, next: { effectiveDay: day, archive: true as const } });
  const later = tpl({ id: "later", title: "Stretch", recurrence: "DAILY", compulsory: true, pendingChange: archiveOn(addDays(TODAY, 3)) });
  const gone = tpl({ id: "gone", title: "Floss", recurrence: "DAILY", compulsory: true, pendingChange: archiveOn(TODAY) });
  const pb = buildBoard(board([later, gone]));
  const laterRow = rowOf(pb, "later");
  check("pending: the row stays, with 'must · ends Sun 4 Oct'", laneOf(pb, "later") === "must" && !!laterRow?.pendingNext && pendingMetaOf(laterRow.pendingNext) === "must · ends Sun 4 Oct");
  check("pending: an archive leaves the board on its effective day (before settlement writes archivedAt)", laneOf(pb, "gone") === "none" && !upcomingOf(board([gone]), new Set()).some((u) => u.templateId === "gone"));
  const unflagToday = tpl({ id: "uf", title: "Journal", recurrence: "DAILY", compulsory: true, pendingChange: { v: 1, next: { effectiveDay: TODAY, compulsory: false } } });
  const unflagLater = tpl({ id: "ufl", title: "Read", recurrence: "DAILY", compulsory: true, pendingChange: { v: 1, next: { effectiveDay: addDays(TODAY, 1), compulsory: false } } });
  const ub = buildBoard(board([unflagToday, unflagLater]));
  check("pending: an un-flag lands on its effective day (a habit from then), and not before", laneOf(ub, "uf") === "today" && laneOf(ub, "ufl") === "must" && rowOf(ub, "ufl")?.pendingNext?.compulsory === false);
  check(
    "pending: ruledTemplateOn and pendingNextOf read the rule per day",
    ruledTemplateOn(gone, YESTERDAY) !== null && ruledTemplateOn(gone, TODAY) === null && pendingNextOf(later, TODAY)?.effectiveDay === addDays(TODAY, 3) && pendingNextOf(gone, TODAY) === null
  );

  // Early settle locks yesterday: no yesterday row once the cursor reaches it.
  const walk = tpl({ id: "walkY", title: "Walk", recurrence: "DAILY" });
  check("yesterday is recordable while unsettled", laneOf(buildBoard(withDuty(board([walk]), dutyOf())), "walkY", YESTERDAY) === "yesterday");
  check("an early settle locks yesterday: no row to record", laneOf(buildBoard(withDuty(board([walk]), dutyOf({ cursor: YESTERDAY }))), "walkY", YESTERDAY) === "none");
  // M2 review blocker: the lock is duty-economy.ts settledFor(day, cursor, floor), the server's own rule. The launch
  // script sets the cursor to firstDutyDay − 1, possibly days before the launch: no pre-Duty day is ever locked by it.
  const yRow = (duty: DutyBoard) => laneOf(buildBoard(withDuty(board([walk]), duty)), "walkY", YESTERDAY);
  check("launch Monday: the cursor is the pre-Duty Sunday (firstDutyDay − 1), and Sunday stays recordable", yRow(dutyOf({ launchDay: TODAY, floor: TODAY, cursor: YESTERDAY })) === "yesterday");
  check(
    "before launch with the cursor already set ahead (--apply on Thu for a Mon launch): yesterday stays recordable",
    yRow(dutyOf({ live: false, launchDay: addDays(TODAY, 4), floor: addDays(TODAY, 4), cursor: addDays(TODAY, 3) })) === "yesterday"
  );
  check("without DutyBoard.floor the launch day stands in for it (its lower bound)", yRow(dutyOf({ launchDay: TODAY, cursor: YESTERDAY })) === "yesterday");
  check("after a post-launch reset (floor = the epoch = today, cursor = yesterday): yesterday stays recordable", yRow(dutyOf({ floor: TODAY, cursor: YESTERDAY })) === "yesterday");
  check("on or after the floor, at or before the cursor: locked", yRow(dutyOf({ floor: LAUNCH, cursor: YESTERDAY })) === "none");
  check("no launch day (a rollback) keeps the cursor-only lock, as the server's settledFor does", yRow(dutyOf({ live: false, launchDay: null, floor: null, cursor: YESTERDAY })) === "none");
  // Decision 12 (M2 review): a freeze covers a no-activity day, so once one is spent on yesterday nothing more is recorded on it.
  check("a freeze spent on yesterday: no row to record", yRow(dutyOf({ freezes: { banked: 0, willCover: true, usedYesterday: true } })) === "none");
  check("before launch a freeze flag changes nothing (the pre-M2 lane)", yRow(dutyOf({ live: false, launchDay: null, cursor: null, freezes: { banked: 0, willCover: false, usedYesterday: true } })) === "yesterday");

  // A rest day: musts are held (nothing owed), 'Even on rest days' musts are not.
  const meds = tpl({ id: "meds", title: "Meds", recurrence: "DAILY", compulsory: true, compulsoryOnRest: true });
  const gym = tpl({ id: "gym", title: "Gym", recurrence: "DAILY", compulsory: true });
  const readH = tpl({ id: "readH", title: "Read", recurrence: "DAILY" });
  const errand = tpl({ id: "errand", title: "Post office", dueKind: "PLANNED", dueDay: TODAY });
  const rb = buildBoard(withDuty(board([meds, gym, readH, errand]), dutyOf({ rest: { yesterday: null, today: "REST", tomorrow: null, vacationUntil: null } })));
  check(
    "rest day: a must and a habit are held today; an 'Even on rest days' must and a plain one-off are not",
    rowOf(rb, "gym")?.heldToday === true && rowOf(rb, "readH")?.heldToday === true && rowOf(rb, "meds")?.heldToday === false && rowOf(rb, "errand")?.heldToday === false && rb.restToday === "REST"
  );
  // M2 review: TodayCounts (the bell, the nav's Today badge, the evening musts notice) never counts a held row as open.
  const plainRest = buildBoard(board([meds, gym, readH, errand]));
  check(
    "rest day: counts.musts holds only the 'Even on rest days' must; counts.due skips the held habit",
    plainRest.counts.musts === 2 && rb.counts.musts === 1 && plainRest.counts.due === 2 && rb.counts.due === 1,
    JSON.stringify({ plain: plainRest.counts, rest: rb.counts })
  );

  // Row meta: '12 days · repaired' after a restoring make-up, '· held' after the minimum or an excused day.
  const daily = (id: string) => tpl({ id, title: id, recurrence: "DAILY", startDay: ago(30) });
  const runUp = (id: string, last: BoardInstance["status"], repaired = false) => {
    const h = daysBack(20, 2).map((d) => inst(id, d));
    h.push({ ...inst(id, YESTERDAY, last), repaired });
    return h;
  };
  const noteOf = (id: string, last: BoardInstance["status"], repaired = false, live = true) =>
    rowOf(buildBoard(live ? withDuty(board([daily(id)], { history: runUp(id, last, repaired) }), dutyOf()) : board([daily(id)], { history: runUp(id, last, repaired) })), id)?.streakNote ?? null;
  check("row meta: '· repaired' after a restoring make-up", noteOf("nr", "DONE_LATE", true) === "repaired");
  check("row meta: '· held' after the minimum or an excused day", noteOf("nm", "DONE_MVV") === "held" && noteOf("ne", "EXCUSED") === "held");
  check("row meta: nothing after an ordinary tick", noteOf("nd", "DONE") === null);
  check("row meta: before launch, no note (the pre-M2 row)", noteOf("np", "DONE_MVV", false, false) === null);
  check("row meta: a rest day yesterday, not yet settled, reads held", streakNoteOf([inst("x", ago(2))], TODAY, true) === "held" && streakNoteOf([inst("x", ago(2))], TODAY, false) === null);

  // F10: the board's live ring and settlement read one rule (full-day.ts), on eight days.
  const dutyTpl = (t: BoardTemplate) => ({
    id: t.id,
    kind: t.kind,
    recurrence: t.recurrence,
    startDay: t.startDay,
    dueDay: t.dueDay,
    dueKind: t.dueKind,
    compulsory: t.compulsory,
    compulsoryOnRest: t.compulsoryOnRest ?? false,
    inbox: t.inbox,
    archivedDay: null,
    pendingChange: t.pendingChange ?? null,
  });
  const studyT = tpl({ id: "studyT", title: "Review 20", autoMetric: "REVIEWS", autoTarget: 20, recurrence: "DAILY" });
  const playT = tpl({ id: "playT", title: "Guitar", intrinsic: true });
  const choreT = tpl({ id: "choreT", title: "Bins" });
  const mustT = tpl({ id: "mustT", title: "Meds", recurrence: "DAILY", compulsory: true, mvv: "1 pill" });
  const targetT = tpl({ id: "targetT", title: "Run", recurrence: "TARGET:3/W", compulsory: true });
  type Day = { name: string; templates: BoardTemplate[]; history?: BoardInstance[]; today: DayLedger; rest?: boolean };
  const deed = (id: string, sink: "TRACK" | "NONE" = "TRACK") => completion(id, id, { sink, raw: 3, xp: sink === "TRACK" ? 3 : 0 });
  const days: Day[] = [
    { name: "queue clear but short of the day-open target", templates: [choreT], today: ledger(TODAY, { reviews: 5, dayOpenQty: 30, completions: [deed("choreT")] }) },
    { name: "no DAY_OPEN row and 14 reviews", templates: [choreT], today: ledger(TODAY, { reviews: 14, dayOpenQty: null, completions: [deed("choreT")] }) },
    { name: "a rest day with its must open", templates: [mustT, choreT], today: ledger(TODAY, { reviews: 0, dayOpenQty: 0, completions: [deed("choreT")] }), rest: true },
    { name: "a must kept by its minimum", templates: [mustT, choreT], history: [inst("mustT", TODAY, "DONE_MVV")], today: ledger(TODAY, { reviews: 15, dayOpenQty: 40, completions: [deed("choreT")] }) },
    { name: "a #play deed", templates: [playT], today: ledger(TODAY, { reviews: 0, dayOpenQty: 0, completions: [deed("playT", "NONE")] }) },
    { name: "a study-only day", templates: [studyT], history: [inst("studyT", TODAY)], today: ledger(TODAY, { reviews: 25, dayOpenQty: 25, completions: [deed("studyT", "NONE")] }) },
    { name: "a weigh-in alone", templates: [choreT], today: ledger(TODAY, { reviews: 0, dayOpenQty: 0, completions: [] }) },
    { name: "a TARGET must present (never in the Musts ring)", templates: [targetT, choreT], today: ledger(TODAY, { reviews: 0, dayOpenQty: 0, completions: [deed("choreT")] }) },
  ];
  const disagree: string[] = [];
  for (const day of days) {
    const base = board(day.templates, { history: day.history ?? [], today: day.today });
    const data = day.rest ? withDuty(base, dutyOf({ rest: { yesterday: null, today: "REST", tomorrow: null, vacationUntil: null } })) : base;
    const b = buildBoard(data);
    const quest = questOf({ dayOpenQty: data.ledger.today.dayOpenQty, reviews: data.ledger.today.reviews, dueNow: data.dueNow ?? 0, reviewXp: 0 });
    const live = fullDayOf(fullDayInputOf(withHeldExcused(data, b.must), b, quest));
    // Settlement's side: the settled day's facts, with the EXCUSED rows it writes on a held day.
    const excused = day.rest ? day.templates.filter((t) => t.compulsory && !t.compulsoryOnRest && t.recurrence && !t.recurrence.startsWith("TARGET")).map((t) => inst(t.id, TODAY, "EXCUSED")) : [];
    const byId = new Map(day.templates.map((t) => [t.id, t]));
    const lifeDeeds = data.ledger.today.completions.filter((c) => {
      const t = c.templateId ? byId.get(c.templateId) : undefined;
      return isLifeDeed({ sink: c.sink, studyLinked: t ? !!t.autoMetric : null });
    }).length;
    const settled = fullDayOf(
      fullDayInputFor({
        templates: day.templates.map(dutyTpl),
        instances: [...(day.history ?? []), ...excused],
        day: TODAY,
        reviews: data.ledger.today.reviews,
        dayOpenQty: data.ledger.today.dayOpenQty,
        lifeDeeds,
      })
    );
    const sig = (f: ReturnType<typeof fullDayOf>) => f.rings.map((r) => `${r.kind}:${r.met}:${r.caption}`).join(" | ");
    if (sig(live) !== sig(settled)) disagree.push(`${day.name}: board ${sig(live)} / settled ${sig(settled)}`);
  }
  check("full day: the board's live rings and settlement agree on the eight fixture days", disagree.length === 0, disagree.join("; "));
  const restDay = days[2];
  const rd = withDuty(board(restDay.templates, { today: restDay.today }), dutyOf({ rest: { yesterday: null, today: "REST", tomorrow: null, vacationUntil: null } }));
  const rdb = buildBoard(rd);
  check("full day: a rest day's held must closes the Musts ring (it will be EXCUSED)", fullDayOf(fullDayInputOf(withHeldExcused(rd, rdb.must), rdb, questOf({ dayOpenQty: 0, reviews: 0, dueNow: 0, reviewXp: 0 }))).rings[0].met);

  // F13: Close the day lists what is open; 'Roll all' never makes an item late.
  const planned = tpl({ id: "cPlanned", title: "Call mum", dueKind: "PLANNED", dueDay: TODAY });
  const deadline = tpl({ id: "cDeadline", title: "Send invoice", dueKind: "DEADLINE", dueDay: TODAY });
  const cb = buildBoard(board([planned, deadline, mustT]));
  const items = closeItemsOf({ must: cb.must, todayRows: cb.todayRows, today: TODAY, live: true });
  check("close: every open item with the moves the server accepts", items.length === 3 && items.some((i) => i.choices.some((c) => c.id === "minimum")));
  check("close: 'Roll all' moves the PLANNED one-off and never the deadline (it would make it late)", rollAllKeysOf(items).join() === `cPlanned:${TODAY}`);
}

function finish(): void {
  console.log(failed ? `\n${failed} failed` : "\nall pass");
  process.exit(failed ? 1 : 0);
}
