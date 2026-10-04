/**
 * M2 lane C on fixed cases (docs/life-plan/m2-refit.md F2, F3, F6, F7, F8,
 * F9, F18): the launch gates of the Duty actions, the akrasia horizon of the
 * rule edits, the make-up and its undo (prices, keys, statuses, the ledger
 * invariant, streak units), accepting a loss, the settled-day guard's error
 * apart from the freshness guard's, yesterday's open musts, the manual
 * freeze, rest / sick / vacation, the Today board's Duty part, and the
 * reset's order. After the M2 review: the one settled-day rule (settledFor
 * with its floor) at every tick, record, undo and guard — a cursor the
 * launch script sets to launch − 1 before the launch locks nothing — the
 * guards' SQL, a frozen yesterday, the debited one-off's late-tick race, the
 * nav and bell counts against the board, the early settle's errors, and the
 * reset before the RestDay table exists.
 *
 * Pure: no database, no clock, no model. Importing tasks.ts creates only the
 * idle Prisma client (as capture-server-check does); nothing here runs a
 * query (the early settle runs against an injected settle). Lane C owns
 * this whole file.
 *
 *   npx tsx scripts/duty-actions-check.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { addDays, dayEndOf, dayStartOf, type DayKey } from "../src/lib/life-day";
import { debtFor } from "../src/lib/life-grade";
import { akrasiaEffectiveDay, debtKey, freezeUseKey, repaidKey, unrepaidKey, writeOffKey } from "../src/lib/duty-economy";
import { expectedOn, mustsDueOn, parsePendingChange, ruleOn, type DutyTemplate, type RestRow } from "../src/lib/duty-rule";
import {
  DEBITED_ONE_OFF,
  MAKE_UP_UNDO_ELSEWHERE,
  SETTLED_GUARD_EDGE_MS,
  dutyBoardOf,
  dutyGateOf,
  freezeSpendOf,
  freezeUseEventOf,
  frozenDayMessage,
  isSettledDayFor,
  makeUpAttemptsOf,
  makeUpRowsOf,
  minimumOf,
  needsSettledGuard,
  planAcceptLoss,
  planClarifyRule,
  planMakeUp,
  planRuleEdit,
  planUndoMakeUp,
  settledFloorOf,
  settledTickMessage,
  settledUndoMessage,
  storedMakeUpOf,
  tickRefusalOf,
  undoUntilOf,
  weekdayLong,
  yesterdayMustsOf,
  type DutyBoardFacts,
  type FreezeSpendState,
  type InstanceEventRow,
  type MakeUpInput,
  type RuleRow,
  type TickDutyFacts,
} from "../src/lib/duty-plan";
import {
  isMissingRestDayTable,
  restLaunchBlockOf,
  restRowsOf,
  restWindowOf,
  validateCancel,
  validateRest,
  validateSick,
  validateVacation,
  vacationBudgetOf,
  type RestRowLite,
} from "../src/lib/rest-rules";
import { LIFE_RESET_ORDER, lifeResetOrder } from "../src/lib/reset-scopes";
import { countsForStreakOf, foldStreakDays } from "../src/lib/streak-curve";
import type { ActivityInput } from "../src/lib/life-types";
import type { DutyBoard } from "../src/lib/duty-view";
import { planCompletion, type BoardData, type BoardTemplate, type DayLedger, type PricedTemplate } from "../src/lib/today-board";
import { freshnessGuardSql, isSettledDay, isStaleRead, settledDayGuardSql, todayCountsOf } from "../src/lib/tasks";
import { SETTLE_WRITES_OFF, settleYesterdayCore } from "../src/lib/duty";
import { WRITES_OFF_REFUSAL, type SettleResult } from "../src/lib/settlement";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const json = (x: unknown) => JSON.stringify(x);
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LAUNCH: DayKey = "2026-10-12"; // Monday
const TODAY: DayKey = "2026-10-14"; // Wednesday
const YESTERDAY = addDays(TODAY, -1);
const D: DayKey = "2026-10-12"; // the missed day: today = d + 2
const NOW = new Date(dayStartOf(TODAY).getTime() + 6 * 3_600_000); // 10:00 on TODAY
const at = (day: DayKey, hours: number) => new Date(dayStartOf(day).getTime() + hours * 3_600_000);

const ledger = (day: DayKey): DayLedger => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null });
const tpl = (over: Partial<PricedTemplate>): PricedTemplate => ({
  id: "tpl-dishes",
  title: "dishes",
  normTitle: "dishes",
  recurrence: "DAILY",
  dueDay: null,
  dueKind: null,
  intrinsic: false,
  autoMetric: null,
  mvv: null,
  track: "DUTY",
  band: "INTRO",
  bandOverride: 0,
  estMinutes: 15,
  machineMinutes: 15,
  ...over,
});
const dishes = tpl({});
const stretch = tpl({ id: "tpl-stretch", title: "stretch 15m", normTitle: "stretch", band: "STANDARD", mvv: "stretch 5m" });
const DISHES_DEBT = debtFor(dishes);
const STRETCH_DEBT = debtFor(stretch);

// ═══ F2 The launch gates of the actions ═══════════════════════════════════

console.log("— F2 launch gates —");
{
  const weekAhead = addDays(LAUNCH, -7);
  check("gate: rest for the launch Monday is allowed a week before launch", dutyGateOf("declareRest", { today: weekAhead, launchDay: LAUNCH, day: LAUNCH }) === null);
  check(
    "gate: and the rule itself accepts it (a day after today, on the launch day)",
    validateRest({ day: LAUNCH, today: weekAhead, launchDay: LAUNCH, rows: [] }) === null
  );
  const preLaunchRest = dutyGateOf("declareRest", { today: weekAhead, launchDay: LAUNCH, day: addDays(LAUNCH, -1) });
  check("gate: rest for a pre-launch day is refused ('Duty starts Mon 12 Oct.')", preLaunchRest === "Duty starts Mon 12 Oct.", String(preLaunchRest));
  check("gate: rest with no launch day set is refused", dutyGateOf("declareRest", { today: TODAY, launchDay: null, day: addDays(TODAY, 1) }) === "Duty hasn't started yet.");
  check("gate: a vacation starting before the launch is refused", dutyGateOf("setVacation", { today: weekAhead, launchDay: LAUNCH, day: addDays(LAUNCH, -2) }) !== null);
  check("gate: sick before launch is refused, on the launch day allowed", dutyGateOf("declareSick", { today: addDays(LAUNCH, -1), launchDay: LAUNCH }) !== null && dutyGateOf("declareSick", { today: LAUNCH, launchDay: LAUNCH }) === null);
  check("gate: a freeze before launch is refused", dutyGateOf("spendFreeze", { today: weekAhead, launchDay: LAUNCH }) === "Duty starts Mon 12 Oct.");
  check("gate: settling early before launch is refused", dutyGateOf("settleYesterday", { today: weekAhead, launchDay: LAUNCH }) === "Duty starts Mon 12 Oct.");
  check("gate: a freeze and an early settle after launch pass the gate", dutyGateOf("spendFreeze", { today: TODAY, launchDay: LAUNCH }) === null && dutyGateOf("settleYesterday", { today: TODAY, launchDay: LAUNCH }) === null);
  for (const a of ["makeUp", "doMinimum", "undoMakeUp", "acceptLoss", "setMinimum"] as const) {
    check(`gate: ${a} works whatever the launch (a debt card is never stranded)`, dutyGateOf(a, { today: TODAY, launchDay: null }) === null && dutyGateOf(a, { today: weekAhead, launchDay: LAUNCH }) === null);
  }
  check("gate: cancelling rest is never gated", dutyGateOf("cancelRest", { today: TODAY, launchDay: null }) === null);
  // A make-up plans with no launch day at all: it reads only the debt.
  const plan = planMakeUp(makeUpInput({}));
  check("gate: a make-up plans pre-launch too (planMakeUp reads no launch)", plan.ok);
}

// ═══ F6 Make-ups ══════════════════════════════════════════════════════════

function makeUpInput(over: Partial<MakeUpInput>): MakeUpInput {
  return {
    template: dishes,
    instance: { id: "inst-1", templateId: dishes.id, day: D, slot: 0, debtXp: DISHES_DEBT },
    today: TODAY,
    now: NOW,
    minimum: false,
    ledger: ledger(TODAY),
    repairedInLast7: false,
    taskAttempt: 0,
    repaidAttempt: 0,
    ...over,
  };
}
const factor = (r: { factors: { key: string; value: number }[] }, k: string) => r.factors.find((f) => f.key === k)?.value;

console.log("— F6 make-up —");
const mk = planMakeUp(makeUpInput({}));
if (!mk.ok) throw new Error(`planMakeUp failed: ${mk.error}`);
{
  const p = mk.value;
  check("make-up on d + 2: DEBT_REPAID equals the debt (4.2)", p.repaidEvent.source === "DEBT_REPAID" && p.repaidEvent.xp === DISHES_DEBT && DISHES_DEBT === 4.2, String(p.repaidEvent.xp));
  check(
    "make-up: DEBT_REPAID is TRACK DUTY, rawXp null, compositionKey 'debt', countsForStreak false, dated today",
    p.repaidEvent.sink === "TRACK" && p.repaidEvent.track === "DUTY" && p.repaidEvent.rawXp === null && p.repaidEvent.compositionKey === "debt" && p.repaidEvent.countsForStreak === false && p.repaidEvent.day === TODAY
  );
  check("make-up: repaid key 'repaid:<tpl>:<d>:<slot>:0'", p.repaidEvent.dedupeKey === repaidKey(dishes.id, D, 0, 0) && p.repaidEvent.dedupeKey === `repaid:${dishes.id}:${D}:0:0`);
  check("make-up: TASK pays 3.5 at T 0.85, C 1.00", p.taskEvent.xp === 3.5 && factor(p.plan.receipt, "T") === 0.85 && factor(p.plan.receipt, "C") === 1, String(p.taskEvent.xp));
  check("make-up: TASK dated today with the key on d", p.taskEvent.day === TODAY && p.taskEvent.dedupeKey === `task:${dishes.id}:${D}:0:0`, String(p.taskEvent.dedupeKey));
  check("make-up: TASK counts for today's streak (today's work)", p.taskEvent.countsForStreak === true && p.taskEvent.source === "TASK");
  check("make-up on d + 2: DONE_LATE, repaired, restored", p.status === "DONE_LATE" && p.repaired && p.restored);
  check(
    "make-up: the instance update — debtOpen false, source 'make-up', xpPaid = the TASK's xp",
    p.instance.debtOpen === false && p.instance.source === "make-up" && p.instance.xpPaid === 3.5 && p.instance.completedAt === NOW
  );
  const rc = p.taskEvent.receipt as unknown as { makeUp?: { day: DayKey; restored: boolean } };
  check("make-up: the receipt carries 'make-up' and the restored flag", rc.makeUp?.day === D && rc.makeUp?.restored === true && p.plan.receipt.factors.some((f) => f.key === "T" && /make-up/.test(f.label)));
  const streaky = planMakeUp(makeUpInput({}));
  check("make-up: C stays 1.00 whatever the streak (the input carries none)", streaky.ok && streaky.value.taskEvent.xp === 3.5);
}
{
  const late = planMakeUp(makeUpInput({ today: addDays(D, 3), ledger: ledger(addDays(D, 3)) }));
  check("make-up on d + 3: MADE_UP, not repaired; the debt is still repaid in full", late.ok && late.value.status === "MADE_UP" && !late.value.repaired && late.value.repaidEvent.xp === DISHES_DEBT);
  const second = planMakeUp(makeUpInput({ repairedInLast7: true }));
  check("make-up: a second restore inside 7 days for one template is MADE_UP", second.ok && second.value.status === "MADE_UP" && !second.value.restored);
  const min = planMakeUp(makeUpInput({ template: stretch, instance: { id: "inst-s", templateId: stretch.id, day: D, slot: 0, debtXp: STRETCH_DEBT }, minimum: true }));
  check(
    "minimum make-up: pays 2.1 on the golden and repays the debt in full (8.3), DONE_MVV repaired",
    min.ok && min.value.taskEvent.xp === 2.1 && min.value.repaidEvent.xp === 8.3 && min.value.status === "DONE_MVV" && min.value.repaired,
    min.ok ? `${min.value.taskEvent.xp} / ${min.value.repaidEvent.xp}` : min.error
  );
  check("minimum make-up: K 0.3 × T 0.85 on the receipt", min.ok && factor(min.value.plan.receipt, "K") === 0.3 && factor(min.value.plan.receipt, "T") === 0.85);
  const noMvv = planMakeUp(makeUpInput({ minimum: true }));
  check("minimum make-up without a minimum version is refused", !noMvv.ok && /minimum/.test(noMvv.error));
  const study = planMakeUp(makeUpInput({ template: tpl({ id: "tpl-study", autoMetric: "REVIEWS" }), instance: { id: "inst-q", templateId: "tpl-study", day: D, slot: 0, debtXp: 4.2 } }));
  check(
    "study must: the make-up pays 0 (sink NONE) and repays the debt",
    study.ok && study.value.taskEvent.xp === 0 && study.value.taskEvent.sink === "NONE" && study.value.repaidEvent.xp === 4.2
  );
  const future = planMakeUp(makeUpInput({ instance: { id: "inst-1", templateId: dishes.id, day: addDays(TODAY, 1), slot: 0, debtXp: 4.2 } }));
  check("make-up of a day not yet lived is refused", !future.ok);
  const slot2 = planMakeUp(makeUpInput({ instance: { id: "inst-t", templateId: dishes.id, day: D, slot: 2, debtXp: 4.2 }, taskAttempt: 1, repaidAttempt: 1 }));
  check(
    "make-up of a TARGET slot: keys carry the slot and the attempts",
    slot2.ok && slot2.value.taskEvent.dedupeKey === `task:${dishes.id}:${D}:2:1` && slot2.value.repaidEvent.dedupeKey === `repaid:${dishes.id}:${D}:2:1`
  );
}

console.log("— F6 undo of a make-up —");
const TASK_ROW_ID = "ev-task-1";
const REPAID_ROW_ID = "ev-repaid-1";
const madeAt = new Date(NOW.getTime() - 3 * 60_000);
const undo = planUndoMakeUp({
  taskRow: { id: TASK_ROW_ID, day: TODAY, sink: "TRACK", track: "DUTY", templateId: dishes.id, sourceId: "inst-1", xp: 3.5, rawXp: 3.5 },
  repaidRow: { id: REPAID_ROW_ID, day: TODAY, templateId: dishes.id, sourceId: "inst-1", xp: DISHES_DEBT },
  instance: { id: "inst-1", templateId: dishes.id, day: D, slot: 0, debtXp: DISHES_DEBT },
  now: NOW,
  taskOccurredAt: madeAt,
});
if (!undo.ok) throw new Error(`planUndoMakeUp failed: ${undo.error}`);
{
  const u = undo.value;
  check("undo: the TASK row's UNDO 'undo:<taskRowId>'", u.undoEvent.source === "UNDO" && u.undoEvent.dedupeKey === `undo:${TASK_ROW_ID}` && u.undoEvent.xp === -3.5 && u.undoEvent.rawXp === -3.5);
  check(
    "undo: the repayment is reversed by a negative DEBT_REPAID 'unrepaid:<repaidRowId>', never an UNDO",
    u.unrepaidEvent.source === "DEBT_REPAID" && u.unrepaidEvent.dedupeKey === unrepaidKey(REPAID_ROW_ID) && u.unrepaidEvent.xp === -DISHES_DEBT
  );
  check(
    "undo: the reversal has rawXp null, compositionKey 'debt', countsForStreak false, TRACK DUTY",
    u.unrepaidEvent.rawXp === null && u.unrepaidEvent.compositionKey === "debt" && u.unrepaidEvent.countsForStreak === false && u.unrepaidEvent.sink === "TRACK" && u.unrepaidEvent.track === "DUTY"
  );
  check("undo: the instance back to MISSED, debt open, not repaired, xpPaid 0", json(u.instance) === json({ status: "MISSED", debtOpen: true, repaired: false, xpPaid: 0, completedAt: null }));
  const late = planUndoMakeUp({
    taskRow: { id: TASK_ROW_ID, day: TODAY, sink: "TRACK", track: "DUTY", templateId: dishes.id, sourceId: "inst-1", xp: 3.5, rawXp: 3.5 },
    repaidRow: { id: REPAID_ROW_ID, day: TODAY, templateId: dishes.id, sourceId: "inst-1", xp: DISHES_DEBT },
    instance: { id: "inst-1", templateId: dishes.id, day: D, slot: 0, debtXp: DISHES_DEBT },
    now: NOW,
    taskOccurredAt: new Date(NOW.getTime() - 11 * 60_000),
  });
  check("undo: past 10 minutes it is refused", !late.ok && /Too late/.test(late.error));
  const mismatch = planUndoMakeUp({
    taskRow: { id: "x", day: TODAY, sink: "TRACK", track: "DUTY", templateId: dishes.id, sourceId: "other", xp: 3.5, rawXp: 3.5 },
    repaidRow: { id: REPAID_ROW_ID, day: TODAY, templateId: dishes.id, sourceId: "inst-1", xp: DISHES_DEBT },
    instance: { id: "inst-1", templateId: dishes.id, day: D, slot: 0, debtXp: DISHES_DEBT },
    now: NOW,
  });
  check("undo: rows of another instance are refused", !mismatch.ok);
}
{
  // The instance's own rows after a make-up and its undo.
  const row = (id: string, e: ActivityInput, occurredAt: Date): InstanceEventRow => ({
    id,
    day: e.day ?? TODAY,
    source: e.source,
    sink: e.sink ?? "TRACK",
    track: e.track ?? null,
    templateId: e.templateId ?? null,
    sourceId: e.sourceId ?? null,
    xp: e.xp ?? 0,
    rawXp: e.rawXp ?? null,
    occurredAt,
    dedupeKey: e.dedupeKey ?? null,
    receipt: e.receipt ?? null,
  });
  const rows1 = [row(TASK_ROW_ID, mk.value.taskEvent, madeAt), row(REPAID_ROW_ID, mk.value.repaidEvent, madeAt)];
  const live = makeUpRowsOf(rows1, "inst-1");
  check("makeUpRowsOf: the live TASK row and the live repayment", live.task?.id === TASK_ROW_ID && live.repaid?.id === REPAID_ROW_ID);
  const rows2 = [...rows1, row("ev-undo-1", undo.value.undoEvent, NOW), row("ev-unrepaid-1", undo.value.unrepaidEvent, NOW)];
  const after = makeUpRowsOf(rows2, "inst-1");
  check("makeUpRowsOf: after the undo nothing is live", after.task === null && after.repaid === null);
  const attempts = makeUpAttemptsOf(rows2, "inst-1");
  check("attempts after one undo: TASK attempt 1, repaid n 1", attempts.taskAttempt === 1 && attempts.repaidAttempt === 1, json(attempts));
  const again = planMakeUp(makeUpInput({ ...attempts, repairedInLast7: false }));
  check(
    "the next make-up's repaid key is ':1' and its TASK key ':1' (no collision with the undone pair)",
    again.ok && again.value.repaidEvent.dedupeKey === `repaid:${dishes.id}:${D}:0:1` && again.value.taskEvent.dedupeKey === `task:${dishes.id}:${D}:0:1`
  );
  const stored = storedMakeUpOf(
    { id: "inst-1", templateId: dishes.id, day: D, status: "DONE_LATE", source: "make-up", repaired: true, debtXp: DISHES_DEBT, debtOpen: false },
    rows1,
    0
  );
  check("a repeated make-up returns the stored one (duplicate), cleared-last when nothing is owed", !!stored && stored.duplicate === true && stored.xp === 3.5 && stored.restored && stored.clearedLast);
  check(
    "a debt still open is not a stored make-up",
    storedMakeUpOf({ id: "inst-1", templateId: dishes.id, day: D, status: "MISSED", source: "make-up", repaired: false, debtXp: 4.2, debtOpen: true }, rows2, 1) === null
  );

  console.log("— F6 the ledger invariant —");
  const sum = (es: ActivityInput[]) => Math.round(es.reduce((s, e) => s + (e.xp ?? 0), 0) * 10) / 10;
  const debtRow: ActivityInput = { source: "DEBT", sink: "TRACK", track: "DUTY", xp: -DISHES_DEBT, rawXp: null, compositionKey: "debt", countsForStreak: false, day: D, dedupeKey: debtKey(dishes.id, D, 0) };
  // On time, at C 1.00: P = 5 × 0.833 = 4.2 (one TASK row, nothing owed).
  const onTime = planCompletion({ template: dishes, day: D, today: D, slot: 0, ledger: ledger(D), streakDays: 0 });
  const p = onTime.receipt.xp;
  check("ledger: on time +P (4.2), one TASK row and no debt", p === 4.2 && onTime.status === "DONE", String(p));
  check(
    "ledger: the make-up pays round1(0.85 · P') with P' unrounded at C 1.00 (5 × 0.833 × 0.85 = 3.5)",
    mk.value.taskEvent.xp === Math.round(0.85 * 5 * (0.5 + 15 / 45) * 10) / 10 && mk.value.taskEvent.xp === 3.5
  );
  check("ledger: missed then made up nets +0.85 · P' (3.5)", sum([debtRow, mk.value.repaidEvent, mk.value.taskEvent]) === 3.5);
  check("ledger: missed −debt", sum([debtRow]) === -4.2);
  check(
    "ledger: made up then undone −debt",
    sum([debtRow, mk.value.repaidEvent, mk.value.taskEvent, undo.value.undoEvent, undo.value.unrepaidEvent]) === -4.2
  );
  const units = (es: ActivityInput[]) =>
    foldStreakDays(es.map((e) => ({ day: e.day ?? TODAY, source: e.source, countsForStreak: countsForStreakOf(e.source, e.countsForStreak) })));
  const makeUpDay = units([mk.value.taskEvent, mk.value.repaidEvent, undo.value.undoEvent, undo.value.unrepaidEvent]);
  check("streak: a make-up then its undo nets 0 units on the make-up day (not active)", !makeUpDay.active.has(TODAY));
  const otherTick: ActivityInput = { source: "TASK", day: TODAY, countsForStreak: true, xp: 1 };
  const withTick = units([mk.value.taskEvent, mk.value.repaidEvent, undo.value.undoEvent, undo.value.unrepaidEvent, otherTick]);
  check("streak: a make-up, its undo and one other tick: the day stays active", withTick.active.has(TODAY));
}
{
  const until = undoUntilOf(NOW);
  check("undoUntil: ten minutes after the make-up", until.getTime() === NOW.getTime() + 10 * 60_000);
  const nearEnd = new Date(dayEndOf(TODAY).getTime() - 3 * 60_000);
  check("undoUntil: never past the end of its life day (04:00)", undoUntilOf(nearEnd).getTime() === dayEndOf(TODAY).getTime());
}

console.log("— F6 accept the loss, add a minimum —");
{
  const inst = { id: "inst-old", templateId: dishes.id, day: addDays(TODAY, -14), slot: 0, status: "MISSED", debtOpen: true, debtXp: 4.2 };
  const base = { instance: inst, debtWriteOff: true, oneOff: false, archived: false, today: TODAY, now: NOW };
  const okLoss = planAcceptLoss(base);
  check(
    "accept the loss at 14 days: WRITTEN_OFF and DEBT_WRITTEN_OFF {sink NONE, qty = debt, countsForStreak false}",
    okLoss.ok &&
      okLoss.value.instance.status === "WRITTEN_OFF" &&
      okLoss.value.event.source === "DEBT_WRITTEN_OFF" &&
      okLoss.value.event.sink === "NONE" &&
      okLoss.value.event.qty === 4.2 &&
      okLoss.value.event.xp === 0 &&
      okLoss.value.event.countsForStreak === false &&
      okLoss.value.event.dedupeKey === writeOffKey(dishes.id, inst.day, 0)
  );
  check("accept the loss: refused with the setting off", !planAcceptLoss({ ...base, debtWriteOff: false }).ok);
  const young = planAcceptLoss({ ...base, instance: { ...inst, day: addDays(TODAY, -13) } });
  check("accept the loss: refused when the debt is 13 days old (says when)", !young.ok && /Thu 15 Oct/.test(young.error), young.ok ? "" : young.error);
  check("accept the loss: a one-off is archived with it", planAcceptLoss({ ...base, oneOff: true }).ok && (planAcceptLoss({ ...base, oneOff: true }) as { ok: true; value: { archive: boolean } }).value.archive);
  check("accept the loss: nothing owed is refused", !planAcceptLoss({ ...base, instance: { ...inst, debtOpen: false } }).ok);
  const m = minimumOf("  10   pushups ", 4.6);
  check("minimum: one line, spaces collapsed, minutes rounded", m.ok && m.value.mvv === "10 pushups" && m.value.mvvMinutes === 5);
  check("minimum: an empty text is refused; no minutes is null", !minimumOf("   ", null).ok && minimumOf("walk", undefined).ok && (minimumOf("walk", undefined) as { ok: true; value: { mvvMinutes: number | null } }).value.mvvMinutes === null);
}

// ═══ F3 The akrasia horizon ═══════════════════════════════════════════════

console.log("— F3 rule edits —");
const OLD = new Date(NOW.getTime() - 2 * 86_400_000);
const mustRow = (over: Partial<RuleRow> = {}): RuleRow => ({
  compulsory: true,
  compulsoryOnRest: false,
  inbox: false,
  kind: "HABIT",
  recurrence: "DAILY",
  startDay: "2026-09-01",
  dueDay: null,
  dueKind: null,
  archivedAt: null,
  createdAt: OLD,
  pendingChange: null,
  ...over,
});
const live = { today: TODAY, now: NOW, launched: true };
const EFF = akrasiaEffectiveDay(TODAY);
const asDuty = (r: RuleRow, write: { compulsory?: boolean; compulsoryOnRest?: boolean; archivedAt?: Date | null; pendingChange?: unknown } | null): DutyTemplate => ({
  kind: r.kind,
  recurrence: r.recurrence,
  startDay: r.startDay,
  dueDay: r.dueDay,
  dueKind: r.dueKind,
  compulsory: write?.compulsory ?? r.compulsory,
  compulsoryOnRest: write?.compulsoryOnRest ?? r.compulsoryOnRest,
  inbox: r.inbox,
  archivedDay: (write?.archivedAt !== undefined ? write.archivedAt : r.archivedAt) ? TODAY : null,
  pendingChange: write?.pendingChange !== undefined ? write.pendingChange : r.pendingChange,
});
{
  const un = planRuleEdit(mustRow(), { kind: "unflag" }, live);
  const w = un.ok ? un.value.write : null;
  check(
    "un-flag once live: deferred to today + 7 as next {compulsory: false}; the column is not written",
    un.ok && un.value.effect === "deferred" && un.value.effectiveDay === EFF && !!w && w.compulsory === undefined && json(parsePendingChange(w.pendingChange)?.next) === json({ effectiveDay: EFF, compulsory: false })
  );
  check("un-flag: pendingChangeAt = the start of its effective day", !!w && w.pendingChangeAt?.getTime() === dayStartOf(EFF).getTime());
  const t = asDuty(mustRow(), w);
  check("un-flag pending: still a must through effectiveDay − 1, not from it", ruleOn(t, addDays(EFF, -1)).compulsory && !ruleOn(t, EFF).compulsory);
  const pre = planRuleEdit(mustRow(), { kind: "unflag" }, { ...live, launched: false });
  check("un-flag before launch is immediate (the column)", pre.ok && pre.value.effect === "immediate" && pre.value.write?.compulsory === false);
  const young = planRuleEdit(mustRow({ createdAt: new Date(NOW.getTime() - 59 * 60_000) }), { kind: "unflag" }, live);
  const older = planRuleEdit(mustRow({ createdAt: new Date(NOW.getTime() - 61 * 60_000) }), { kind: "unflag" }, live);
  check("un-flag: 59 minutes old is immediate (typo grace), 61 deferred", young.ok && young.value.effect === "immediate" && older.ok && older.value.effect === "deferred");
  const pending = mustRow({ pendingChange: { v: 1, next: { effectiveDay: "2026-10-21", compulsory: false } } });
  const second = planRuleEdit(pending, { kind: "archive" }, live);
  check(
    "a second weakening while one pends is refused: 'A change is already pending (Wed 21 Oct). Keep it or cancel it.'",
    !second.ok && second.error === "A change is already pending (Wed 21 Oct). Keep it or cancel it.",
    second.ok ? "" : second.error
  );
  const restOffWhilePending = planRuleEdit(mustRow({ compulsoryOnRest: true, pendingChange: pending.pendingChange }), { kind: "rest", on: false }, live);
  check("'Even on rest days' off while an un-flag pends is refused the same way", !restOffWhilePending.ok && /already pending/.test(restOffWhilePending.error));
  const repeat = planRuleEdit(pending, { kind: "unflag" }, live);
  check("the same un-flag again is the pending one (no second write)", repeat.ok && repeat.value.effect === "deferred" && repeat.value.write === null && repeat.value.effectiveDay === "2026-10-21");
  const notMust = planRuleEdit(mustRow({ compulsory: false }), { kind: "unflag" }, live);
  check("un-flag on a non-must writes nothing", notMust.ok && notMust.value.write === null);
}
{
  const on = planRuleEdit(mustRow(), { kind: "rest", on: true }, live);
  const w = on.ok ? on.value.write : null;
  check(
    "'Even on rest days' on: immediate from today, with the prior segment {throughDay: today − 1, compulsoryOnRest: false}",
    on.ok && on.value.effect === "immediate" && w?.compulsoryOnRest === true && json(parsePendingChange(w?.pendingChange)?.prior) === json([{ throughDay: YESTERDAY, compulsoryOnRest: false }])
  );
  const t = asDuty(mustRow(), w);
  check("'Even on rest days' on is never retroactive: yesterday reads off, today on", !ruleOn(t, YESTERDAY).compulsoryOnRest && ruleOn(t, TODAY).compulsoryOnRest);
  const off = planRuleEdit(mustRow({ compulsoryOnRest: true }), { kind: "rest", on: false }, live);
  check(
    "'Even on rest days' off: deferred as next {compulsoryOnRest: false}",
    off.ok && off.value.effect === "deferred" && json(parsePendingChange(off.value.write?.pendingChange)?.next) === json({ effectiveDay: EFF, compulsoryOnRest: false })
  );
  const offPending = mustRow({ compulsoryOnRest: true, pendingChange: { v: 1, next: { effectiveDay: EFF, compulsoryOnRest: false } } });
  const back = planRuleEdit(offPending, { kind: "rest", on: true }, live);
  check("turning it back on while 'off' pends cancels the pending change", back.ok && back.value.effect === "immediate" && back.value.write?.pendingChange === null && back.value.write?.pendingChangeAt === null);
  const nonMust = planRuleEdit(mustRow({ compulsory: false }), { kind: "rest", on: true }, live);
  check("'Even on rest days' on a non-must is refused", !nonMust.ok);
}
{
  const withPrior = mustRow({ pendingChange: { v: 1, next: { effectiveDay: EFF, archive: true }, prior: [{ throughDay: "2026-10-05", compulsoryOnRest: true }] } });
  const cancel = planRuleEdit(withPrior, { kind: "cancel" }, live);
  check(
    "'Keep it' cancels next at once and keeps the prior segments",
    cancel.ok && cancel.value.effect === "immediate" && json(cancel.value.write?.pendingChange) === json({ v: 1, prior: [{ throughDay: "2026-10-05", compulsoryOnRest: true }] }) && cancel.value.write?.pendingChangeAt === null
  );
  const nothing = planRuleEdit(mustRow(), { kind: "cancel" }, live);
  check("'Keep it' with nothing pending writes nothing", nothing.ok && nothing.value.write === null);
}
{
  const arch = planRuleEdit(mustRow(), { kind: "archive" }, live);
  check(
    "archive of a must once live: deferred as next {archive: true}; archivedAt is NOT set early",
    arch.ok && arch.value.effect === "deferred" && arch.value.write?.archivedAt === undefined && parsePendingChange(arch.value.write?.pendingChange)?.next?.archive === true
  );
  const t = asDuty(mustRow(), arch.ok ? arch.value.write : null);
  check("a pending archive: expected until effectiveDay − 1, never from it", expectedOn(t, addDays(EFF, -1)) && !expectedOn(t, EFF));
  const plain = planRuleEdit(mustRow({ compulsory: false }), { kind: "archive" }, live);
  check("archive of a non-must: immediate (its 10 s Undo stays)", plain.ok && plain.value.effect === "immediate" && plain.value.write?.archivedAt === NOW);
  const link = new Date(NOW.getTime() - 5_000);
  const capture = planRuleEdit(mustRow({ createdAt: new Date(NOW.getTime() - 4 * 60_000) }), { kind: "archive", at: link }, live);
  check("a capture's Undo of a must (minutes old): immediate, stamped with the edit's link", capture.ok && capture.value.effect === "immediate" && capture.value.write?.archivedAt === link);
  const pre = planRuleEdit(mustRow(), { kind: "archive" }, { ...live, launched: false });
  check("archive of a must before launch: immediate", pre.ok && pre.value.effect === "immediate" && pre.value.write?.archivedAt === NOW);
  const again = planRuleEdit(mustRow({ pendingChange: arch.ok ? arch.value.write?.pendingChange : null }), { kind: "archive" }, live);
  check("archive again while its archive pends: the pending one, no write", again.ok && again.value.effect === "deferred" && again.value.write === null);
}
{
  const pendingArchive = mustRow({ pendingChange: { v: 1, next: { effectiveDay: EFF, archive: true } } });
  const undoArchive = planRuleEdit(pendingArchive, { kind: "unarchive" }, live);
  check("Undo of a deferred archive cancels it", undoArchive.ok && undoArchive.value.write?.pendingChange === null && undoArchive.value.write?.pendingChangeAt === null);
  // Archived at once three days ago (before launch, say), brought back today.
  const archivedDay = addDays(TODAY, -3);
  const row = mustRow({ archivedAt: new Date(dayStartOf(archivedDay).getTime() + 3_600_000) });
  const back = planRuleEdit(row, { kind: "unarchive" }, live);
  const w = back.ok ? back.value.write : null;
  const t: DutyTemplate = { ...asDuty(row, w), archivedDay: null };
  check("unarchive clears archivedAt", w?.archivedAt === null);
  check(
    "unarchive is never retroactive: the archived days are not musts, the days before keep theirs",
    ruleOn(t, addDays(archivedDay, -1)).compulsory && !ruleOn(t, archivedDay).compulsory && !ruleOn(t, YESTERDAY).compulsory && ruleOn(t, TODAY).compulsory
  );
  check("…so yesterday owes nothing after an unarchive today", mustsDueOn([{ ...t, id: "x" }], YESTERDAY).length === 0 && mustsDueOn([{ ...t, id: "x" }], TODAY).length === 1);
  const sameDay = planRuleEdit(mustRow({ archivedAt: new Date(NOW.getTime() - 5_000) }), { kind: "unarchive" }, live);
  check("unarchive within the same day (the 10 s Undo) adds no segment", sameDay.ok && parsePendingChange(sameDay.value.write?.pendingChange) === null);
}
{
  const inboxMust = mustRow({ inbox: true, startDay: addDays(TODAY, -3) });
  const out = planClarifyRule(inboxMust, "today", live);
  check(
    "clarify an inbox must into the board: owed from today, never before (prior {today − 1, compulsory: false})",
    out.ok && json(parsePendingChange(out.value.pendingChange)?.prior) === json([{ throughDay: YESTERDAY, compulsory: false }])
  );
  const t = asDuty({ ...inboxMust, inbox: false }, { pendingChange: out.ok ? out.value.pendingChange : null });
  check("…so yesterday is not a must and today is", mustsDueOn([{ ...t, id: "x" }], YESTERDAY).length === 0 && mustsDueOn([{ ...t, id: "x" }], TODAY).length === 1);
  const fresh = planClarifyRule(mustRow({ inbox: true, startDay: TODAY }), "tomorrow", live);
  check("clarify an inbox must captured today: nothing to write", fresh.ok && fresh.value.pendingChange === undefined);
  const idea = planClarifyRule(mustRow(), "idea", live);
  check("a scheduled must sent back to the inbox as an idea is refused (it would weaken)", !idea.ok && /Not a must/.test(idea.error));
  const ideaInbox = planClarifyRule(mustRow({ inbox: true }), "idea", live);
  check("an inbox must becoming an idea weakens nothing: allowed", ideaInbox.ok);
  const ideaPre = planClarifyRule(mustRow(), "idea", { ...live, launched: false });
  check("before launch an idea is allowed", ideaPre.ok);
  const nonMust = planClarifyRule(mustRow({ compulsory: false, inbox: true, startDay: addDays(TODAY, -3) }), "anytime", live);
  check("a non-must leaving the inbox writes no segment", nonMust.ok && nonMust.value.pendingChange === undefined);
  const drop = planClarifyRule(mustRow({ inbox: true }), "drop", live);
  check("a drop is left to archiveCore (the archive edit)", drop.ok && drop.value.pendingChange === undefined);
}

// ═══ F7 Completion seams ══════════════════════════════════════════════════

console.log("— F7 the settled-day guard —");
{
  const err = (code: string, message: string) => new Prisma.PrismaClientKnownRequestError(message, { code: "P2010", clientVersion: "6.19.0", meta: { code, message } });
  const settled = err("22003", "Raw query failed. Code: `22003`. Message: `smallint out of range`");
  const stale = err("22012", "Raw query failed. Code: `22012`. Message: `division by zero`");
  check("isSettledDay: 22003 (smallint out of range) is the settled-day guard", isSettledDay(settled) && !isStaleRead(settled));
  check("isStaleRead: 22012 (division by zero) is the freshness guard, retried", isStaleRead(stale) && !isSettledDay(stale));
  check("neither claims a duplicate key or a plain error", !isSettledDay(new Error("P2002 unique")) && !isStaleRead(new Error("P2002 unique")));
  check("the settled message: 'Wednesday is settled. Make it up from its card.'", settledTickMessage(TODAY) === "Wednesday is settled. Make it up from its card." && weekdayLong(TODAY) === "Wednesday");
  check("the undo message: 'Wednesday is settled; this tick stands.'", settledUndoMessage(TODAY) === "Wednesday is settled; this tick stands.");
  check("a debited one-off: 'Make it up from its card.'", DEBITED_ONE_OFF === "Make it up from its card.");

  const tasks = code(read("src/lib/tasks.ts"));
  const settle = tasks.slice(tasks.indexOf("async function settleOnce"), tasks.indexOf("async function settleCompletion"));
  const lockAt = settle.indexOf("lifeLockOp(userId)");
  const guardAt = settle.indexOf("settledDayGuardOp(userId, a.day)");
  const freshAt = settle.indexOf("freshnessGuardOp(userId, a.day");
  check("completion array: the settled-day guard is its own statement after the lock, before the freshness guard", lockAt > 0 && guardAt > lockAt && freshAt > guardAt);
  check(
    "completion array: the TASK row's index follows the guards (4 with the settled guard, 3 without)",
    /const EVENT_AT = ops\.length - 2;/.test(settle) && /\.\.\.\(needsSettledGuard\(a\.day, a\.today, a\.now\) \? \[settledDayGuardOp\(userId, a\.day\)\] : \[\]\)/.test(settle)
  );
  check("completion: 22003 maps to the settled message, never a retry", /if \(isSettledDay\(err\)\) return fail\(settledTickMessage\(a\.day\)\);\s*if \(isStaleRead\(err\)\) return RETRY;/.test(settle));
  check(
    "completion: the write re-checks the read (tickRefusalFor) and the freshness guard holds a yesterday record unfrozen",
    /const refusal = tickRefusalFor\(read, a\.day, a\.today, !!rule\);\s*if \(refusal\) return fail\(refusal\);/.test(settle) &&
      /freshnessGuardOp\(userId, a\.day, read\.kneeRows, rule \? null : t\.id, \{ notFrozen: a\.day < a\.today \}\)/.test(settle)
  );
  const complete = tasks.slice(tasks.indexOf("export async function completeInstanceCore"), tasks.indexOf("export async function againCore"));
  check(
    "completeInstanceCore (and record yesterday) refuse a settled day, a frozen yesterday and a debited one-off up front (tickRefusalOf)",
    /const refusal = tickRefusalFor\(read, day, today, !!rule\);\s*if \(refusal\) return fail\(refusal\);/.test(complete)
  );
  const readFn = tasks.slice(tasks.indexOf("async function readForCompletion"), tasks.indexOf("function tickRefusalFor"));
  check(
    "the completion read takes the epoch with the cursor, and the freeze of a yesterday record",
    /select: \{ settledThroughDay: true, epochDay: true \}/.test(readFn) && /day < today\s*\? prisma\.activityEvent\.findUnique\(\{ where: \{ userId_dedupeKey: \{ userId, dedupeKey: freezeUseKey\(day\) \} \}/.test(readFn)
  );
  const refusalFn = tasks.slice(tasks.indexOf("function tickRefusalFor"), tasks.indexOf("function storedCompletion"));
  check("tickRefusalFor reads the launch day, the cursor and the epoch (the settledFor floor)", /launchDay: dutyLaunchDay\(\)/.test(refusalFn) && /cursor: read\.settledThrough/.test(refusalFn) && /epochDay: read\.epochDay/.test(refusalFn));
  const undoCore = tasks.slice(tasks.indexOf("export async function undoCompletionCore"), tasks.indexOf("// ── Skip, reschedule, archive"));
  check(
    "undoCompletionCore: refuses a settled day by settledFor (epoch read), guards at write time, and hands a make-up to its own undo",
    /select: \{ settledThroughDay: true, epochDay: true \}/.test(undoCore) &&
      /const settled = isSettledDayFor\(instDay, \{/.test(undoCore) &&
      /if \(settled\) return fail\(settledUndoMessage\(instDay\)\)/.test(undoCore) &&
      /needsSettledGuard\(instDay, todayKey\(now\), now\) \? \[settledDayGuardOp\(userId, instDay\)\] : \[\]/.test(undoCore) &&
      /source === "make-up"\) return fail\(MAKE_UP_UNDO_ELSEWHERE\)/.test(undoCore)
  );
  check(
    "no settled-day test compares a day with the cursor alone any more (settledFor everywhere)",
    !/settledThrough && (a\.)?day <= read\.settledThrough/.test(tasks) && !/cursor && instDay <= cursor/.test(tasks) && !/cursor >= day\) return fail/.test(code(read("src/lib/duty-plan.ts")))
  );
  const actions = code(read("src/app/actions/tasks.ts"));
  check("undoCompletion routes MAKE_UP_UNDO_ELSEWHERE to undoMakeUpCore", /res\.error !== MAKE_UP_UNDO_ELSEWHERE/.test(actions) && /undoMakeUpCore\(userId, instanceId\)/.test(actions) && MAKE_UP_UNDO_ELSEWHERE.length > 0);
  check("the study task's done list counts MADE_UP", /status: \{ in: \["DONE", "DONE_LATE", "DONE_MVV", "MADE_UP"\] \}/.test(tasks));
  check("loadTodayCounts fills yesterdayMusts from the board core's read", /yesterdayMusts: read\.yesterdayMusts/.test(tasks));
  check(
    "loadTodayCounts counts through todayCountsOf with the board's Duty part (debited one-offs, held musts)",
    /\.\.\.todayCountsOf\(\{ \.\.\.read\.core, dueNow, duty: read\.duty \}\)/.test(tasks) && !/buildBoard\(\{ \.\.\.read\.core, dueNow \}\)/.test(tasks)
  );
}

// ═══ F7 after review: the one settled-day rule (settledFor with its floor) ═

console.log("— F7 settledFor: the launch floor —");
{
  // The launch script's cursor (launch − 1), set days before the launch (F20 step 7 on Thu 8 Oct).
  const CURSOR = addDays(LAUNCH, -1); // Sun 11 Oct
  const EPOCH = "2026-09-01";
  const tick = (over: Partial<TickDutyFacts>): string | null =>
    tickRefusalOf({ day: TODAY, today: TODAY, launchDay: LAUNCH, cursor: CURSOR, epochDay: EPOCH, oneOff: false, debited: false, frozen: false, ...over });
  for (const today of ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"] as DayKey[]) {
    const yesterday = addDays(today, -1);
    check(
      `cursor = launch − 1 before the launch (${today}): a tick today and a record of yesterday are allowed`,
      tick({ day: today, today }) === null && tick({ day: yesterday, today }) === null,
      `${tick({ day: today, today })} / ${tick({ day: yesterday, today })}`
    );
  }
  check("the launch Monday: the pre-launch Sunday is still recordable (it carried no stakes)", tick({ day: CURSOR, today: LAUNCH }) === null);
  check("launch day + 1: the launch Monday is open until settled", tick({ day: LAUNCH, today: addDays(LAUNCH, 1) }) === null);
  check(
    "once settled, a day on or after the floor is refused: 'Monday is settled. Make it up from its card.'",
    tick({ day: LAUNCH, today: addDays(LAUNCH, 1), cursor: LAUNCH }) === "Monday is settled. Make it up from its card."
  );
  check("after a reset (epoch today, cursor today − 1): yesterday, before the new epoch, is never locked", tick({ day: YESTERDAY, today: TODAY, cursor: YESTERDAY, epochDay: TODAY }) === null);
  check("a later epoch floors it too: the cursor at the epoch locks the epoch day", tick({ day: TODAY, cursor: TODAY, epochDay: TODAY }) !== null);
  check("a rollback (no launch day): the cursor alone locks, as before", tick({ day: YESTERDAY, launchDay: null, cursor: YESTERDAY }) === settledTickMessage(YESTERDAY));
  check("no settings row read: nothing is settled", tick({ day: YESTERDAY, cursor: undefined, epochDay: undefined }) === null);
  check("settledFloorOf: max(launch, epoch); the launch day without a row; null without a launch day", settledFloorOf(EPOCH, LAUNCH) === LAUNCH && settledFloorOf(TODAY, LAUNCH) === TODAY && settledFloorOf(null, LAUNCH) === LAUNCH && settledFloorOf(EPOCH, null) === null);
  check(
    "undo uses the same rule: an undo on the launch Monday of a pre-launch Sunday tick is not 'settled'",
    !isSettledDayFor(CURSOR, { cursor: CURSOR, epochDay: EPOCH, launchDay: LAUNCH }) && isSettledDayFor(LAUNCH, { cursor: LAUNCH, epochDay: EPOCH, launchDay: LAUNCH })
  );
  check("a frozen yesterday takes no record: 'Tuesday is frozen: a freeze covers a day with nothing done.'", tick({ day: YESTERDAY, frozen: true }) === frozenDayMessage(YESTERDAY) && frozenDayMessage(YESTERDAY) === "Tuesday is frozen: a freeze covers a day with nothing done.");
  check("…and settled wins over frozen (one message)", tick({ day: YESTERDAY, frozen: true, cursor: YESTERDAY }) === settledTickMessage(YESTERDAY));
  check("a debited one-off is refused; a debited recurring template is not (its next occurrence is new work)", tick({ oneOff: true, debited: true }) === DEBITED_ONE_OFF && tick({ oneOff: false, debited: true }) === null);

  // The guard's SQL holds the same floor at write time (no database: the statement's text and values).
  const g = settledDayGuardSql("u1", YESTERDAY, LAUNCH);
  check(
    "settledDayGuardSql with a launch day: 22003 on settledThroughDay >= day AND day >= GREATEST(launch, epochDay)",
    /THEN 40000 ELSE 1 END\)::smallint/.test(g.text) && /"settledThroughDay" >= \$\d+::date/.test(g.text) && /AND \$\d+::date >= GREATEST\(\$\d+::date, "epochDay"\)/.test(g.text) && g.values.includes(LAUNCH) && g.values.includes(YESTERDAY),
    g.text.replace(/\s+/g, " ")
  );
  const g0 = settledDayGuardSql("u1", YESTERDAY, null);
  check("settledDayGuardSql without a launch day: the cursor alone (no GREATEST)", !/GREATEST/.test(g0.text) && /"settledThroughDay" >= \$\d+::date/.test(g0.text) && !g0.values.includes(LAUNCH));
  const tasks = code(read("src/lib/tasks.ts"));
  check(
    "settledDayGuardOp runs settledDayGuardSql with the launch day in force (dutyLaunchDay())",
    /export function settledDayGuardOp\(userId: string, day: DayKey, launchDay: DayKey \| null = dutyLaunchDay\(\)\) \{\s*return prisma\.\$executeRaw\(settledDayGuardSql\(userId, day, launchDay\)\);/.test(tasks)
  );
  check(
    "spendFreezeCore shares it: the same guard, with the launch day it gated on",
    /settledDayGuardOp\(userId, yesterday, launchDay\)/.test(code(read("src/lib/duty.ts")))
  );
  check("freezeSpendOf: the launch Tuesday may cover the launch Monday under the launch script's cursor", (() => {
    const r = freezeSpendOf({ today: addDays(LAUNCH, 1), launchDay: LAUNCH, epochDay: EPOCH, cursor: CURSOR, yesterdayUnits: 0, earned: 1, used: 0, alreadyUsed: false });
    return r.ok && r.value.day === LAUNCH;
  })());
  const musts = [
    { id: "m", kind: "HABIT", recurrence: "DAILY", startDay: EPOCH, dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null, pendingChange: null },
  ];
  const ym = (today: DayKey) => yesterdayMustsOf({ today, launchDay: LAUNCH, cursor: CURSOR, epochDay: EPOCH, templates: musts, freezeUsedYesterday: false, restRows: [], instances: [] });
  check("yesterday's musts: none on the launch Monday (Sunday carried none), one on the launch Tuesday", ym(LAUNCH) === 0 && ym(addDays(LAUNCH, 1)) === 1);
  const facts0 = {
    today: LAUNCH,
    launchDay: LAUNCH,
    cursor: CURSOR,
    epochDay: EPOCH,
    debtWriteOff: false,
    owed: [],
    instances: [],
    repairedRecently: new Set<string>(),
    ledger: ledger(LAUNCH),
    restRows: [],
    freezeEarned: 0,
    freezeUsed: 0,
    units: {},
    heldByLedger: new Set<DayKey>(),
    freezeUsedYesterday: false,
    templates: [],
    settledRows: [],
  } satisfies DutyBoardFacts;
  check(
    "the board carries the floor (settledFor's), so its yesterday lane locks by the server's rule",
    dutyBoardOf(facts0).floor === LAUNCH && dutyBoardOf({ ...facts0, epochDay: TODAY, today: TODAY }).floor === TODAY && dutyBoardOf({ ...facts0, launchDay: null }).floor === null
  );

  // The write-time guard only where a settled day can be met.
  const edge = dayStartOf(addDays(TODAY, 1)).getTime(); // 04:00 ending TODAY
  check("needsSettledGuard: a record of yesterday always carries it", needsSettledGuard(YESTERDAY, TODAY, NOW));
  check("needsSettledGuard: a tick today at 10:00 does not (today cannot be settled until 04:00)", !needsSettledGuard(TODAY, TODAY, NOW));
  check(
    `needsSettledGuard: a tick today within ${SETTLED_GUARD_EDGE_MS / 60_000} minutes of 04:00 does (it may commit after the day turns)`,
    needsSettledGuard(TODAY, TODAY, new Date(edge - 5 * 60_000)) && needsSettledGuard(TODAY, TODAY, new Date(edge - SETTLED_GUARD_EDGE_MS)) && !needsSettledGuard(TODAY, TODAY, new Date(edge - SETTLED_GUARD_EDGE_MS - 60_000))
  );
}

console.log("— F7 the late tick of a debited one-off, and a frozen yesterday, at write time —");
{
  const f = freshnessGuardSql("u1", TODAY, 3, "tpl-invoice");
  check(
    "a one-off's freshness guard also needs no open debt: settlement charged it first → 22012, the retry reads 'debited'",
    /AND EXISTS \(SELECT 1 FROM "TaskTemplate" WHERE "id" = \$\d+ AND "completedAt" IS NULL\)/.test(f.text) &&
      /AND NOT EXISTS \(SELECT 1 FROM "TaskInstance" WHERE "templateId" = \$\d+ AND "debtOpen"\)/.test(f.text) &&
      f.values.filter((v) => v === "tpl-invoice").length === 2,
    f.text.replace(/\s+/g, " ")
  );
  const r = freshnessGuardSql("u1", TODAY, 3, null);
  check("a recurring tick's guard has no one-off clauses (its debts never block a new occurrence)", !/TaskTemplate|debtOpen/.test(r.text) && /SELECT 1 \/ \(CASE WHEN/.test(r.text));
  const m = freshnessGuardSql("u1", TODAY, 3, null, { openDebtInstanceId: "inst-1" });
  check("a make-up's guard: the instance still MISSED and owed, and no 'not debited' clause", /"status" = 'MISSED' AND "debtOpen"\)/.test(m.text) && !/NOT EXISTS \(SELECT 1 FROM "TaskInstance"/.test(m.text));
  const y = freshnessGuardSql("u1", YESTERDAY, 2, null, { notFrozen: true });
  check(
    "a record of yesterday: no FREEZE_USE may land under it ('freeze-use:<yesterday>')",
    /AND NOT EXISTS \(SELECT 1 FROM "ActivityEvent" WHERE "userId" = \$\d+ AND "dedupeKey" = \$\d+\)/.test(y.text) && y.values.includes(freezeUseKey(YESTERDAY))
  );
  check("a tick today carries no freeze clause", !/dedupeKey/.test(freshnessGuardSql("u1", TODAY, 2, null, { notFrozen: false }).text));
}

console.log("— F7 the nav and bell counts agree with the board —");
{
  const btpl = (p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate => ({
    normTitle: p.title.toLowerCase(),
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
    startDay: "2026-09-01",
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: "STANDARD",
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
    createdAt: "2026-09-01T00:00:00.000Z",
    sortOrder: 0,
    ...p,
  });
  const gym = btpl({ id: "gym", title: "Gym", kind: "HABIT", recurrence: "DAILY", compulsory: true });
  const meds = btpl({ id: "meds", title: "Meds", kind: "HABIT", recurrence: "DAILY", compulsory: true, compulsoryOnRest: true });
  const invoice = btpl({ id: "invoice", title: "Invoice", dueKind: "DEADLINE", dueDay: addDays(TODAY, -2), compulsory: true });
  const data = (templates: BoardTemplate[], duty?: DutyBoard): BoardData => ({
    today: TODAY,
    yesterday: YESTERDAY,
    capacityMin: 240,
    templates,
    instances: [],
    stats: {},
    ledger: { today: ledger(TODAY), yesterday: ledger(YESTERDAY) },
    paid: {},
    goalQty: {},
    dueNow: 0,
    ...(duty ? { duty } : {}),
  });
  const base: DutyBoardFacts = {
    today: TODAY,
    launchDay: LAUNCH,
    cursor: addDays(TODAY, -2),
    epochDay: "2026-09-01",
    debtWriteOff: false,
    owed: [],
    instances: [],
    repairedRecently: new Set(),
    ledger: ledger(TODAY),
    restRows: [],
    freezeEarned: 0,
    freezeUsed: 0,
    units: {},
    heldByLedger: new Set(),
    freezeUsedYesterday: false,
    templates: [],
    settledRows: [],
  };
  const restToday: RestRow[] = [{ day: TODAY, kind: "REST", declaredAt: at(YESTERDAY, 2), cancelledAt: null }];
  const rest = dutyBoardOf({ ...base, restRows: restToday });
  check("fixture: today is a declared rest day", rest.rest.today === "REST");
  check("counts: before Duty data, both musts are open (pre-M2, unchanged)", todayCountsOf(data([gym, meds])).musts === 2);
  check(
    "counts: on a rest day a held must is not open; an 'Even on rest days' must still is",
    todayCountsOf(data([gym, meds], rest)).musts === 1,
    String(todayCountsOf(data([gym, meds], rest)).musts)
  );
  check("counts: on a rest day with only held musts the bell says none", todayCountsOf(data([gym], rest)).musts === 0);
  check("counts: without Duty the overdue compulsory deadline is an open must (the pre-M2 count)", todayCountsOf(data([invoice])).musts === 1);
  const debited = dutyBoardOf({
    ...base,
    owed: [
      {
        instanceId: "inv-1",
        day: addDays(TODAY, -2),
        slot: 0,
        debtXp: 8.3,
        template: { ...invoice, startDay: invoice.startDay, archived: false, compulsory: true, createdAt: invoice.createdAt },
      },
    ],
  });
  check("counts: a debited one-off is not an open must (its card is; the Owed notice counts it)", todayCountsOf(data([invoice], debited)).musts === 0);
  check("counts: the due and inbox counts are the board's own", (() => {
    const c = todayCountsOf(data([gym, meds, invoice], debited));
    return c.musts === 2 && typeof c.due === "number" && c.inbox === 0;
  })());
}

console.log("— F7 yesterday's open musts —");
{
  const t = (id: string, over: Partial<DutyTemplate> = {}): DutyTemplate & { id: string } => ({
    id,
    kind: "HABIT",
    recurrence: "DAILY",
    startDay: "2026-09-01",
    dueDay: null,
    dueKind: null,
    compulsory: true,
    compulsoryOnRest: false,
    inbox: false,
    archivedDay: null,
    pendingChange: null,
    ...over,
  });
  const templates = [t("a"), t("b"), t("meds", { compulsoryOnRest: true }), t("inbox", { inbox: true }), t("habit", { compulsory: false })];
  const base = {
    today: TODAY,
    launchDay: LAUNCH,
    cursor: addDays(TODAY, -2),
    epochDay: "2026-09-01",
    templates,
    freezeUsedYesterday: false,
    restRows: [] as RestRow[],
    instances: [{ templateId: "a", day: YESTERDAY, status: "DONE" }],
  };
  check("yesterday: 3 musts due, one done, an inbox must and a habit not counted → 2", yesterdayMustsOf(base) === 2, String(yesterdayMustsOf(base)));
  check("yesterday: 0 once yesterday is settled", yesterdayMustsOf({ ...base, cursor: YESTERDAY }) === 0);
  check("yesterday: 0 before launch", yesterdayMustsOf({ ...base, launchDay: addDays(TODAY, 5) }) === 0 && yesterdayMustsOf({ ...base, launchDay: null }) === 0);
  check("yesterday: 0 when it was before the first Duty day", yesterdayMustsOf({ ...base, launchDay: TODAY }) === 0);
  check("yesterday: 0 when a freeze covers it", yesterdayMustsOf({ ...base, freezeUsedYesterday: true }) === 0);
  const rest: RestRow[] = [{ day: YESTERDAY, kind: "REST", declaredAt: at(addDays(YESTERDAY, -1), 2), cancelledAt: null }];
  check("yesterday a rest day: only the 'Even on rest days' must is open", yesterdayMustsOf({ ...base, restRows: rest }) === 1);
  check(
    "yesterday: an excused or written-off occurrence is not open",
    yesterdayMustsOf({ ...base, instances: [...base.instances, { templateId: "b", day: YESTERDAY, status: "EXCUSED" }, { templateId: "meds", day: YESTERDAY, status: "WRITTEN_OFF" }] }) === 0
  );
}

// ═══ F8 The manual freeze ═════════════════════════════════════════════════

console.log("— F8 spend a freeze —");
{
  const s = (over: Partial<FreezeSpendState> = {}): FreezeSpendState => ({
    today: TODAY,
    launchDay: LAUNCH,
    epochDay: "2026-09-01",
    cursor: addDays(TODAY, -2),
    yesterdayUnits: 0,
    earned: 2,
    used: 0,
    alreadyUsed: false,
    ...over,
  });
  const okSpend = freezeSpendOf(s());
  check("freeze: an unsettled, empty yesterday with 2 banked → spent for yesterday, 1 left", okSpend.ok && okSpend.value.day === YESTERDAY && okSpend.value.left === 1 && !okSpend.value.already);
  const active = freezeSpendOf(s({ yesterdayUnits: 1 }));
  check("freeze: refused for an active yesterday", !active.ok && /has activity/.test(active.error), active.ok ? "" : active.error);
  check("freeze: an undone tick nets to no activity (units 0): allowed", freezeSpendOf(s({ yesterdayUnits: 0 })).ok);
  check("freeze: refused for a settled yesterday", !freezeSpendOf(s({ cursor: YESTERDAY })).ok);
  check("freeze: refused with nothing banked", !freezeSpendOf(s({ earned: 1, used: 1 })).ok);
  check("freeze: refused before launch", !freezeSpendOf(s({ launchDay: addDays(TODAY, 3) })).ok);
  check("freeze: refused for a day before the first Duty day", !freezeSpendOf(s({ launchDay: TODAY })).ok && !freezeSpendOf(s({ epochDay: TODAY })).ok);
  const twice = freezeSpendOf(s({ alreadyUsed: true, used: 1 }));
  check("freeze: already spent for yesterday → the same answer (idempotent)", twice.ok && twice.value.already && twice.value.left === 1);
  const ev = freezeUseEventOf(YESTERDAY, NOW);
  check(
    "freeze: FREEZE_USE 'freeze-use:<yesterday>', sink NONE, dated yesterday, never a streak unit",
    ev.source === "FREEZE_USE" && ev.dedupeKey === `freeze-use:${YESTERDAY}` && ev.sink === "NONE" && ev.day === YESTERDAY && countsForStreakOf("FREEZE_USE", ev.countsForStreak) === false
  );
  const duty = code(read("src/lib/duty.ts"));
  const spend = duty.slice(duty.indexOf("export async function spendFreezeCore"), duty.indexOf("export async function settleYesterdayCore"));
  check(
    "freeze: one array — lock, the settled-day guard (with its launch floor), the balance guard, the row",
    /lifeLockOp\(userId\),\s*settledDayGuardOp\(userId, yesterday, launchDay\),\s*freezeGuardOp\(userId, yesterday\),\s*activityOp\(userId, freezeUseEventOf\(yesterday, now\)\)/.test(spend)
  );
  const fg = duty.slice(duty.indexOf("function freezeGuardOp"), duty.indexOf("async function readFreezeState"));
  check("freeze: the balance guard is EARN − USE ≥ 1 and no activity, by division by zero (22012)", /SELECT 1 \/ \(CASE WHEN/.test(fg) && />= 1/.test(fg) && /<= 0/.test(fg));
}

// ═══ F9 Rest, sick and vacation ═══════════════════════════════════════════

console.log("— F9 rest, sick, vacation —");
{
  const row = (day: DayKey, kind: string, cancelled = false): RestRowLite => ({ day, kind, cancelledAt: cancelled ? NOW : null });
  check("rest the same day is rejected", validateRest({ day: TODAY, today: TODAY, launchDay: LAUNCH, rows: [] }) !== null);
  check("rest in the past is rejected", validateRest({ day: YESTERDAY, today: TODAY, launchDay: LAUNCH, rows: [] }) === "That day has passed.");
  check("rest tomorrow is allowed", validateRest({ day: addDays(TODAY, 1), today: TODAY, launchDay: LAUNCH, rows: [] }) === null);
  const week = restWindowOf({ kind: "REST", day: "2026-10-15" });
  check("rest: the window is its life week (Mon..Sun)", week.from === "2026-10-12" && week.to === "2026-10-18");
  const two = [row("2026-10-16", "REST"), row("2026-10-17", "REST")];
  check("rest: a third in one week is rejected", validateRest({ day: "2026-10-18", today: TODAY, launchDay: LAUNCH, rows: two }) !== null);
  check("rest: a cancelled one frees its place", validateRest({ day: "2026-10-18", today: TODAY, launchDay: LAUNCH, rows: [row("2026-10-16", "REST"), row("2026-10-17", "REST", true)] }) === null);
  check("rest: the next week starts afresh", validateRest({ day: "2026-10-19", today: TODAY, launchDay: LAUNCH, rows: two }) === null);
  check("rest on a vacation day is rejected (cancel the vacation day first)", validateRest({ day: "2026-10-16", today: TODAY, launchDay: LAUNCH, rows: [row("2026-10-16", "VACATION")] }) !== null);
  check("rest: re-declaring the same rest day is fine", validateRest({ day: "2026-10-16", today: TODAY, launchDay: LAUNCH, rows: two }) === null);

  const sickToday = "2026-10-01";
  check("sick the same day is allowed", validateSick({ today: sickToday, launchDay: "2026-09-21", rows: [] }) === null);
  const sickAgain = validateSick({ today: sickToday, launchDay: "2026-09-21", rows: [row("2026-09-22", "SICK")] });
  check("a second sick day within 14 days is rejected: 'Sick used on 22 Sep; next from 6 Oct.'", sickAgain === "Sick used on 22 Sep; next from 6 Oct.", String(sickAgain));
  check("sick 14 days after the last is allowed", validateSick({ today: "2026-10-06", launchDay: "2026-09-21", rows: [row("2026-09-22", "SICK")] }) === null);
  check("sick on a day already rested is rejected (already held)", validateSick({ today: TODAY, launchDay: LAUNCH, rows: [row(TODAY, "REST")] }) !== null);
  check("sick before launch is rejected", validateSick({ today: "2026-10-05", launchDay: LAUNCH, rows: [] }) !== null);

  const from = addDays(TODAY, 1);
  check("a 31-day vacation is rejected", !validateVacation({ from, to: addDays(from, 30), today: TODAY, launchDay: LAUNCH, rows: [] }).ok);
  check("a 2-day vacation is rejected", !validateVacation({ from, to: addDays(from, 1), today: TODAY, launchDay: LAUNCH, rows: [] }).ok);
  const thirty = validateVacation({ from, to: addDays(from, 29), today: TODAY, launchDay: LAUNCH, rows: [] });
  check("a 30-day vacation is allowed, budget 0 left", thirty.ok && thirty.days.length === 30 && thirty.budgetLeft === 0);
  check("a vacation starting today is rejected (tomorrow at the earliest)", !validateVacation({ from: TODAY, to: addDays(TODAY, 3), today: TODAY, launchDay: LAUNCH, rows: [] }).ok);
  // 28 vacation days earlier in the year: 2 left.
  const past: RestRowLite[] = [];
  for (let i = 0; i < 28; i++) past.push(row(addDays("2026-11-01", i), "VACATION"));
  const later = "2027-03-01";
  const over = validateVacation({ from: later, to: addDays(later, 2), today: "2027-02-20", launchDay: LAUNCH, rows: past });
  check(
    "a vacation past the 30-day yearly budget is rejected: 'Vacation left this year: 2 days (more from 1 Nov).'",
    !over.ok && over.error === "Vacation left this year: 2 days (more from 1 Nov).",
    over.ok ? "" : over.error
  );
  const refunded = past.map((r, i) => (i < 1 ? { ...r, cancelledAt: NOW } : r));
  const allowed = validateVacation({ from: later, to: addDays(later, 2), today: "2027-02-20", launchDay: LAUNCH, rows: refunded });
  check("…and allowed again once a cancelled day is refunded", allowed.ok && allowed.budgetLeft === 0);
  const budget = vacationBudgetOf(past, later, addDays(later, 2));
  check("vacation budget: the window is [from − 364, to]", budget.used === 28 && budget.left === 2 && budget.moreFrom === "2027-11-01");
  const outside = vacationBudgetOf([row("2026-02-28", "VACATION")], later, addDays(later, 2));
  check("vacation budget: a day before from − 364 does not count", outside.used === 0);
  const replace = validateVacation({ from: "2026-11-05", to: "2026-11-07", today: TODAY, launchDay: LAUNCH, rows: past });
  check("re-declaring days already on vacation does not count them twice", replace.ok);

  const cancelToday = validateCancel({ from: TODAY, to: addDays(TODAY, 2), today: TODAY, rows: [] });
  check("cancelling a started day is rejected", !cancelToday.ok && /started/.test(cancelToday.error));
  const cancel = validateCancel({ from: addDays(TODAY, 1), to: addDays(TODAY, 3), today: TODAY, rows: [row(addDays(TODAY, 1), "VACATION"), row(addDays(TODAY, 2), "VACATION", true), row(addDays(TODAY, 3), "REST")] });
  check("cancel: the standing future days are cancelled", cancel.ok && json(cancel.days) === json([addDays(TODAY, 1), addDays(TODAY, 3)]));

  const data = restRowsOf([addDays(TODAY, 1)], "REST", NOW);
  check("the upsert data resets declaredAt (now) and cancelledAt (null)", data.length === 1 && data[0].declaredAt === NOW && data[0].cancelledAt === null && data[0].kind === "REST");
  const duty = code(read("src/lib/duty.ts"));
  check(
    "the writes: an upsert by (userId, day) whose update sets kind, declaredAt and cancelledAt null; a vacation's reused rows likewise",
    /update: \{ kind: d\.kind, declaredAt: d\.declaredAt, cancelledAt: null \}/.test(duty) && /data: \{ kind, declaredAt: now, cancelledAt: null \}/.test(duty)
  );
  check("the writes take the life lock and a window guard first", /\[lifeLockOp\(userId\), restGuardOp\(userId, w, standingCount\(rows\)\)\]/.test(duty));
  check("rest launch rule: none before the launch day is set or before it", restLaunchBlockOf(TODAY, null) !== null && restLaunchBlockOf("2026-10-11", LAUNCH) !== null && restLaunchBlockOf(LAUNCH, LAUNCH) === null);
}

// ═══ The Today board's Duty part (BoardData.duty) ═════════════════════════

console.log("— the board's Duty read —");
{
  const CREATED = "2026-09-01T00:00:00.000Z";
  const owedTemplate = { ...dishes, startDay: "2026-09-01", archived: false, compulsory: true, createdAt: CREATED };
  const facts = (over: Partial<DutyBoardFacts> = {}): DutyBoardFacts => ({
    today: TODAY,
    launchDay: LAUNCH,
    cursor: addDays(TODAY, -2),
    epochDay: "2026-09-01",
    debtWriteOff: false,
    owed: [{ instanceId: "inst-1", day: D, slot: 0, debtXp: 4.2, template: owedTemplate }],
    instances: [
      { templateId: dishes.id, day: addDays(TODAY, -5), status: "DONE" },
      { templateId: dishes.id, day: addDays(TODAY, -4), status: "DONE" },
      { templateId: dishes.id, day: addDays(TODAY, -3), status: "DONE" },
      { templateId: dishes.id, day: D, status: "MISSED" },
      { templateId: dishes.id, day: YESTERDAY, status: "DONE" },
    ],
    repairedRecently: new Set(),
    ledger: ledger(TODAY),
    restRows: [],
    freezeEarned: 1,
    freezeUsed: 0,
    units: { [YESTERDAY]: 0, [addDays(TODAY, -2)]: 2 },
    heldByLedger: new Set(),
    freezeUsedYesterday: false,
    templates: [],
    settledRows: [],
    ...over,
  });
  const b = dutyBoardOf(facts());
  const card = b.owed[0];
  check("board: live after launch, the cursor carried", b.live && b.cursor === addDays(TODAY, -2) && b.launchDay === LAUNCH);
  check("owed card: the make-up's price (3.5) and no minimum without an mvv", card.makeUpXp === 3.5 && card.minimumXp === null && card.debtXp === 4.2);
  check("owed card: restore by d + 2; restores today", card.restoreBy === addDays(D, 2) && card.restoresToday);
  check("owed card: brings back the 5-day run (3 kept before, d repaired, 1 after)", card.restoresStreak === 5, String(card.restoresStreak));
  check(
    "owed card: carries what the board re-prices and prompts with (template, compulsory, createdAt, the miss run)",
    card.template?.id === dishes.id && card.template?.startDay === "2026-09-01" && card.compulsory === true && card.createdAt === CREATED && card.missRun === 0 && card.lastMissDay === null
  );
  const threeMissed = dutyBoardOf(
    facts({
      instances: [
        { templateId: dishes.id, day: addDays(D, -2), status: "MISSED" },
        { templateId: dishes.id, day: addDays(D, -1), status: "MISSED" },
        { templateId: dishes.id, day: D, status: "MISSED" },
      ],
    })
  ).owed[0];
  check("owed card: three misses in a row → missRun 3, keyed to the latest", threeMissed.missRun === 3 && threeMissed.lastMissDay === D, `${threeMissed.missRun} ${threeMissed.lastMissDay}`);
  check("owed card: 'Accept the loss' only with the setting on and 14 days", !card.canWriteOff && dutyBoardOf(facts({ debtWriteOff: true, today: addDays(D, 14), ledger: ledger(addDays(D, 14)) })).owed[0].canWriteOff);
  const spent = dutyBoardOf(facts({ repairedRecently: new Set([dishes.id]) })).owed[0];
  check("owed card: a restore already spent this week → no restore today, no streak promised", !spent.restoresToday && spent.restoresStreak === null);
  const minCard = dutyBoardOf(facts({ owed: [{ instanceId: "s", day: D, slot: 0, debtXp: STRETCH_DEBT, template: { ...stretch, startDay: "2026-09-01", archived: true, compulsory: true, createdAt: CREATED } }] })).owed[0];
  check("owed card: the minimum's price (2.1) and '(archived)'", minCard.minimumXp === 2.1 && minCard.archived && minCard.mvv === "stretch 5m");
  const pre = dutyBoardOf(facts({ launchDay: null, cursor: null }));
  check("board: before launch (or after a rollback) the debts still show", !pre.live && pre.owed.length === 1 && !pre.freezes.willCover);
  check("freezes: the real balance, and a freeze will cover an empty yesterday after a live day", b.freezes.banked === 1 && b.freezes.willCover);
  check("freezes: no cover for an active yesterday", !dutyBoardOf(facts({ units: { [YESTERDAY]: 1 } })).freezes.willCover);
  check("freezes: no cover with nothing banked", !dutyBoardOf(facts({ freezeEarned: 0 })).freezes.willCover);
  check("freezes: no cover for a dead streak with no must due (the freeze is kept)", !dutyBoardOf(facts({ units: {} })).freezes.willCover);
  check("freezes: a spend already made covers it", dutyBoardOf(facts({ units: {}, freezeEarned: 1, freezeUsed: 1, freezeUsedYesterday: true })).freezes.willCover);
  check("freezes: banked shows at most 2", dutyBoardOf(facts({ freezeEarned: 5, freezeUsed: 0 })).freezes.banked === 2);
  check("freezes: usedYesterday says a spend is already dated yesterday", dutyBoardOf(facts({ freezeUsedYesterday: true })).freezes.usedYesterday === true && b.freezes.usedYesterday === false);
  check("board: the latest repair day is carried for the Full-day strip", dutyBoardOf(facts({ lastRepairDay: "2026-10-01" })).lastRepairDay === "2026-10-01" && b.lastRepairDay === null);
  const rest = dutyBoardOf(
    facts({
      restRows: [
        { day: TODAY, kind: "VACATION", declaredAt: at(addDays(TODAY, -3), 1), cancelledAt: null },
        { day: addDays(TODAY, 1), kind: "VACATION", declaredAt: at(addDays(TODAY, -3), 1), cancelledAt: null },
        { day: addDays(TODAY, 2), kind: "VACATION", declaredAt: at(addDays(TODAY, -3), 1), cancelledAt: null },
        { day: YESTERDAY, kind: "REST", declaredAt: at(YESTERDAY, 1), cancelledAt: null },
      ],
    })
  );
  check(
    "rest: today and tomorrow on vacation until d + 2; a rest declared after its day began is ignored",
    rest.rest.today === "VACATION" && rest.rest.tomorrow === "VACATION" && rest.rest.vacationUntil === addDays(TODAY, 2) && rest.rest.yesterday === null
  );
  check("rest: the declared days are the valid ones, oldest first", json(rest.declared?.map((d) => d.day)) === json([TODAY, addDays(TODAY, 1), addDays(TODAY, 2)]));
  const settledRows = [
    { source: "DEBT" as const, day: addDays(TODAY, -2), xp: -4.2, qty: null, templateId: dishes.id, dedupeKey: "debt:x" },
    { source: "FREEZE_USE" as const, day: YESTERDAY, xp: 0, qty: 1, templateId: null, dedupeKey: `freeze-use:${YESTERDAY}` },
  ];
  const sb = dutyBoardOf(facts({ settledRows }));
  check("settled facts: only rows on settled days (an unsettled day's freeze is not one)", sb.settled.length === 1 && sb.settled[0].source === "DEBT");
  const pending = dutyBoardOf(facts({ templates: [{ id: "p", kind: "HABIT", recurrence: "DAILY", startDay: "2026-09-01", dueDay: null, dueKind: null, compulsory: true, compulsoryOnRest: false, inbox: false, archivedDay: null, pendingChange: { v: 1, next: { effectiveDay: EFF, archive: true } } }] }));
  check("pending: the drawer's pending changes by template", json(pending.pending) === json({ p: { effectiveDay: EFF, archive: true } }));
}

// ═══ F18 The reset ════════════════════════════════════════════════════════

console.log("— F18 reset —");
{
  check("the reset plan lists RestDay before LifeSettings", LIFE_RESET_ORDER.indexOf("restDays") >= 0 && LIFE_RESET_ORDER.indexOf("restDays") < LIFE_RESET_ORDER.indexOf("lifeSettings"));
  check(
    "the reset plan is in foreign-key order: TaskInstance, TaskTemplate, RestDay, ActivityEvent, LifeSettings",
    json(LIFE_RESET_ORDER) === json(["taskInstances", "tasks", "restDays", "activityEvents", "lifeSettings"])
  );
  const reset = code(read("src/app/actions/reset.ts"));
  check(
    "the 'life' scope deletes through LIFE_RESET_ORDER (lifeResetOrder(true)), RestDay included",
    /tables\.map\(\(table\) => lifeDeleteOp\(table, userId\)\)/.test(reset) && /return await run\(lifeResetOrder\(true\)\);/.test(reset) && /prisma\.restDay\.deleteMany\(\{ where: \{ userId \} \}\)/.test(reset)
  );
  check("getResetPreview counts RestDay", /prisma\.restDay\.count\(\{ where: \{ userId \} \}\)/.test(reset) && /countRestDays\(userId\),/.test(reset) && /restDays,\s*\};/.test(reset));

  // Before the life_duty migration is applied the RestDay table is missing (F20 step 2 after a deploy).
  const known = (errCode: string, message: string, meta: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError(message, { code: errCode, clientVersion: "6.19.0", meta });
  const p2021 = known("P2021", "The table `public.RestDay` does not exist in the current database.", { modelName: "RestDay", table: "public.RestDay" });
  const raw42P01 = known("P2010", 'Raw query failed. Code: `42P01`. Message: `relation "RestDay" does not exist`', { code: "42P01", message: 'relation "RestDay" does not exist' });
  check("a missing RestDay table is recognised: P2021 naming it, or 42P01 about it", isMissingRestDayTable(p2021) && isMissingRestDayTable(raw42P01));
  check(
    "anything else still throws: another missing table, a missing column, a unique violation, a plain error",
    !isMissingRestDayTable(known("P2021", "The table `public.Idea` does not exist in the current database.", { table: "public.Idea" })) &&
      !isMissingRestDayTable(known("P2022", 'The column `RestDay.kind` does not exist in the current database.', { column: "RestDay.kind" })) &&
      !isMissingRestDayTable(known("P2002", "Unique constraint failed", { target: ["userId", "day"] })) &&
      !isMissingRestDayTable(new Error("boom")) &&
      !isMissingRestDayTable(null)
  );
  check("without the table the reset runs the same order minus RestDay", json(lifeResetOrder(false)) === json(["taskInstances", "tasks", "activityEvents", "lifeSettings"]) && lifeResetOrder(true) === LIFE_RESET_ORDER);
  check(
    "the reset retries without RestDay only on a missing RestDay table, and reports 0 rest days",
    /if \(!isMissingRestDayTable\(err\)\) throw err;\s*return \{ \.\.\.\(await run\(lifeResetOrder\(false\)\)\), restDays: 0 \};/.test(reset)
  );
  check("the danger zone's RestDay count is 0, not an error, before the migration", /if \(isMissingRestDayTable\(err\)\) return 0;\s*throw err;/.test(reset));
  const boardRead = code(read("src/lib/tasks.ts"));
  check(
    "the board's rest read (only with a launch day) reads no rest, not an error, before the migration",
    /prisma\.restDay\s*\.findMany\(\{[\s\S]{0,400}\}\)\s*\.catch\(\(err: unknown\) => \{\s*if \(!isMissingRestDayTable\(err\)\) throw err;/.test(boardRead)
  );
  const everything = reset.slice(reset.indexOf("const deleted: Record<string, number> = {};"));
  check(
    "'everything' empties the life tables first (one transaction: a failure deletes nothing else)",
    everything.indexOf('if (scope === "everything") Object.assign(deleted, await deleteLifeRows(userId));') > 0 &&
      everything.indexOf('if (scope === "everything") Object.assign(deleted, await deleteLifeRows(userId));') < everything.indexOf("prisma.idea.deleteMany") &&
      (reset.match(/await deleteLifeRows\(userId\)/g) ?? []).length === 2
  );
  {
    // One writer of LifeSettings.debtWriteOff (M2 review): setDebtWriteOffCore; every action delegates to it.
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(resolve(__dirname, "..", dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(resolve(__dirname, "..", rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(name) && /update: \{ debtWriteOff/.test(code(read(rel)))) writers.push(rel);
      }
    };
    walk("src");
    check("one writer of debtWriteOff: lib/duty.ts setDebtWriteOffCore", json(writers) === json(["src/lib/duty.ts"]), writers.join(", "));
  }
  const tasks = code(read("src/lib/tasks.ts"));
  check(
    "the reset keeps the cursor: both LifeSettings creates spread newLifeSettingsData (the next row after a reset starts at epoch − 1)",
    (tasks.match(/create: \{ userId, \.\.\.newLifeSettingsData\(/g) ?? []).length === 2 && /create: \{ userId, \.\.\.newLifeSettingsData\(/.test(code(read("src/lib/duty.ts")))
  );
}

// ═══ F5 The early settle's answers (settleYesterdayCore, an injected settle) ═

async function earlySettleChecks(): Promise<void> {
  console.log("— F5 settle yesterday —");
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, XTNL_DUTY_LAUNCH_DAY: env.XTNL_DUTY_LAUNCH_DAY };
  env.NODE_ENV = "test";
  env.XTNL_DUTY_LAUNCH_DAY = LAUNCH;
  try {
    const result = (over: Partial<SettleResult>): SettleResult => ({ launched: true, wrote: true, cursorBefore: addDays(TODAY, -2), cursorAfter: YESTERDAY, plans: [], refused: null, ...over });
    let called = 0;
    const settle = (r: SettleResult | Error) => async () => {
      called += 1;
      if (r instanceof Error) throw r;
      return r;
    };
    const quiet = console.error;
    console.error = () => {};
    let thrown: Awaited<ReturnType<typeof settleYesterdayCore>>;
    try {
      thrown = await settleYesterdayCore("u1", NOW, settle(new Error("connection reset")));
    } finally {
      console.error = quiet;
    }
    check(
      "a database error inside settlement is answered, never thrown: 'Tuesday couldn't be settled just now. Try again in a moment.'",
      !thrown.ok && thrown.error === "Tuesday couldn't be settled just now. Try again in a moment.",
      thrown.ok ? "ok" : thrown.error
    );
    const off = await settleYesterdayCore("u1", NOW, settle(result({ wrote: false, cursorAfter: addDays(TODAY, -2), refused: WRITES_OFF_REFUSAL })));
    check("writes off on this server: 'Settling is off on this server: it runs on the live app.'", !off.ok && off.error === SETTLE_WRITES_OFF);
    const busy = await settleYesterdayCore("u1", NOW, settle(result({ wrote: false, refused: "Another settlement was running at the same moment. It will finish on the next load." })));
    check("any other refusal is said as settlement words it", !busy.ok && /Another settlement/.test(busy.error));
    const done = await settleYesterdayCore("u1", NOW, settle(result({})));
    check("settled through yesterday: ok with the cursor", done.ok && done.value.settledThrough === YESTERDAY);
    const short = await settleYesterdayCore("u1", NOW, settle(result({ cursorAfter: addDays(TODAY, -2) })));
    check("short of yesterday: 'Tuesday isn't settled yet. Try again.'", !short.ok && short.error === "Tuesday isn't settled yet. Try again.");
    called = 0;
    const launchMonday = await settleYesterdayCore("u1", new Date(dayStartOf(LAUNCH).getTime() + 6 * 3_600_000), settle(result({})));
    check(
      "the launch Monday: Sunday carried no stakes, so there is nothing to settle (and settlement is not called)",
      !launchMonday.ok && launchMonday.error === "Sunday came before Duty started: there is nothing to settle." && called === 0,
      launchMonday.ok ? "ok" : launchMonday.error
    );
    check("the gate says the same, pure", dutyGateOf("settleYesterday", { today: LAUNCH, launchDay: LAUNCH }) === "Sunday came before Duty started: there is nothing to settle." && dutyGateOf("settleYesterday", { today: addDays(LAUNCH, 1), launchDay: LAUNCH }) === null);
  } finally {
    env.NODE_ENV = saved.NODE_ENV;
    env.XTNL_DUTY_LAUNCH_DAY = saved.XTNL_DUTY_LAUNCH_DAY;
    if (saved.NODE_ENV === undefined) delete env.NODE_ENV;
    if (saved.XTNL_DUTY_LAUNCH_DAY === undefined) delete env.XTNL_DUTY_LAUNCH_DAY;
  }
}

earlySettleChecks()
  .catch((err) => {
    failed++;
    console.log(`FAIL the early-settle checks threw — ${err instanceof Error ? err.message : String(err)}`);
  })
  .then(() => {
    if (failed > 0) {
      console.log(`\n${failed} FAILED`);
      process.exit(1);
    }
    console.log("\nall passed");
  });
