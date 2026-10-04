/**
 * M2 lane 0's contract on fixed cases (docs/life-plan/m2-refit.md F1 Tests):
 * the debt and make-up goldens, the rule over time (ruleOn, applyNext), the
 * akrasia classifier, expected occurrences, held days, the habit reads M2
 * extends (MADE_UP, targetUnits, the settlement cursor), the streak flags of
 * settlement rows, the LifeSettings create days, and the launch gate.
 *
 * Pure: no database, no clock, no model. Lane 0 owns this whole file.
 *
 *   npx tsx scripts/duty-check.ts
 */
import { dayEndOf, dayStartOf, addDays, weekdayOf, type DayKey } from "../src/lib/life-day";
import { DEBT_CAP, debtFor } from "../src/lib/life-grade";
import { LIFE_LAUNCH_DAY } from "../src/lib/life-economy";
import {
  DUTY_LAUNCH_DAY,
  MAKEUP_RESTORE_DAYS,
  SETTLE_LAG_DAYS,
  debtKey,
  dutyLagging,
  dutyLaunchDay,
  firstDutyDay,
  freezeEarnKey,
  freezeUseKey,
  fullDayKey,
  fullDayMintKey,
  isDutyLaunched,
  isSettleable,
  lastSettleableDay,
  newLifeSettingsData,
  newLifeSettingsDays,
  reflectionKey,
  repairKey,
  repaidKey,
  restoreDeadlineOf,
  unrepaidKey,
  validateDutyLaunchDay,
  weekReviewKey,
  withinRestoreWindow,
  writeOffKey,
  akrasiaEffectiveDay,
  canWriteOff,
} from "../src/lib/duty-economy";
import {
  appendPrior,
  applyNext,
  classifyChange,
  expectedOn,
  heldDaysOf,
  mustsDueOn,
  nextIsDue,
  parsePendingChange,
  pruneSettledPrior,
  ruleOn,
  withNext,
  withoutNext,
  type DutyTemplate,
  type RestRow,
} from "../src/lib/duty-rule";
import { makeUpStatusOf } from "../src/lib/duty-plan";
import { instanceOutcome, outcomesOf, perDutyStreak, targetUnits, type InstanceLike } from "../src/lib/habit";
import { NEVER_STREAK_SOURCES, countsForStreakOf, foldStreakDays } from "../src/lib/streak-curve";
import { isDoneStatus, planCompletion, taskEventInput, type DayLedger, type PricedTemplate } from "../src/lib/today-board";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const eqSet = (a: ReadonlySet<string>, b: readonly string[]) => a.size === b.length && b.every((x) => a.has(x));

// ═══ §1 Debt and make-up prices ═══════════════════════════════════════════

console.log("— §1 debtFor goldens —");
const dishes = { band: "INTRO", bandOverride: 0, estMinutes: 15, machineMinutes: 15 };
const stretch = { band: "STANDARD", bandOverride: 0, estMinutes: 15, machineMinutes: 15 };
const severe = { band: "SEVERE", bandOverride: 0, estMinutes: 240, machineMinutes: 240 };
check("debtFor: dishes (INTRO, 15 min) is 4.2", debtFor(dishes) === 4.2, String(debtFor(dishes)));
check("debtFor: 'stretch 15m' (STANDARD, 15) is 8.3", debtFor(stretch) === 8.3, String(debtFor(stretch)));
check("debtFor: SEVERE 240 min is capped at 20", debtFor(severe) === DEBT_CAP && DEBT_CAP === 20, String(debtFor(severe)));
check("debtFor: a self-rating moves the band it owes at", debtFor({ ...dishes, bandOverride: 1 }) === 8.3, String(debtFor({ ...dishes, bandOverride: 1 })));
check("debtFor: a typed estimate counts at most 2 × the machine's", debtFor({ ...stretch, estMinutes: 480 }) === debtFor({ ...stretch, estMinutes: 30 }));

console.log("— §1 planCompletion({makeUp: true}) —");
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
const TODAY = "2026-10-14";
const MISSED = "2026-10-12";
const dishesTpl = tpl({});
const mk0 = planCompletion({ template: dishesTpl, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 0, makeUp: true });
const mk30 = planCompletion({ template: dishesTpl, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 30, makeUp: true });
const onTime30 = planCompletion({ template: dishesTpl, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 30 });
const factor = (r: typeof mk0.receipt, k: string) => r.factors.find((f) => f.key === k)?.value;
check("make-up: dishes pays 3.5", mk0.receipt.raw === 3.5 && mk0.receipt.xp === 3.5, `${mk0.receipt.raw}`);
check("make-up: timing MAKE_UP, T 0.85", mk0.timing === "MAKE_UP" && factor(mk0.receipt, "T") === 0.85);
check("make-up: C is 1.00 whatever streakDays (0 and 30 price the same)", factor(mk30.receipt, "C") === 1 && mk30.receipt.raw === mk0.receipt.raw && JSON.stringify(mk30.receipt) === JSON.stringify(mk0.receipt));
check("make-up: without the flag a 30-day streak does pay C > 1 (the flag is what forces it)", (factor(onTime30.receipt, "C") ?? 1) > 1);
check("make-up: status and source stay planCompletion's (the caller maps them)", mk0.status === "DONE" && mk0.source === "manual");
const stretchTpl = tpl({ id: "tpl-stretch", title: "stretch 15m", normTitle: "stretch", band: "STANDARD", mvv: "stretch 5m" });
const mvv = planCompletion({ template: stretchTpl, day: TODAY, today: TODAY, slot: 0, ledger: ledger(TODAY), streakDays: 12, makeUp: true, mvv: true });
check("minimum make-up: 'stretch 15m' pays 2.1 (K 0.3 × T 0.85)", mvv.receipt.raw === 2.1 && factor(mvv.receipt, "K") === 0.3 && factor(mvv.receipt, "T") === 0.85, `${mvv.receipt.raw}`);
const p = 4.2; // dishes on time at C 1.00 (5 × 0.833)
const nets = -debtFor(dishes) + debtFor(dishes) + mk0.receipt.xp;
check("ledger: missed then made up nets +3.5 = 0.85 × P'", Math.abs(nets - 3.5) < 1e-9 && Math.abs(Math.round(0.85 * (5 * (0.5 + 15 / 45)) * 10) / 10 - 3.5) < 1e-9, `${nets} vs ${p}`);
const ev = taskEventInput(mk0, { templateId: "tpl-dishes", track: "DUTY", instanceId: "inst-1", day: TODAY, keyDay: MISSED, slot: 0, attempt: 1, now: new Date("2026-10-14T01:00:00Z") });
check("taskEventInput keyDay: key on the missed day", ev.dedupeKey === `task:tpl-dishes:${MISSED}:0:1`, String(ev.dedupeKey));
check("taskEventInput keyDay: the row is dated today", ev.day === TODAY);
const evPlain = taskEventInput(mk0, { templateId: "tpl-dishes", track: "DUTY", instanceId: "inst-1", day: TODAY, slot: 0, attempt: 0, now: new Date() });
check("taskEventInput without keyDay: key on the row's day (unchanged)", evPlain.dedupeKey === `task:tpl-dishes:${TODAY}:0:0`);
check("board: MADE_UP reads done", isDoneStatus("MADE_UP") && isDoneStatus("DONE_LATE") && !isDoneStatus("MISSED"));

console.log("— §1 make-up status (decision 8) —");
check("makeUpStatusOf: d + 2 restores (DONE_LATE, repaired)", JSON.stringify(makeUpStatusOf(MISSED, addDays(MISSED, 2), false)) === JSON.stringify({ status: "DONE_LATE", repaired: true }));
check("makeUpStatusOf: a minimum on d + 1 restores held (DONE_MVV)", makeUpStatusOf(MISSED, addDays(MISSED, 1), false, true).status === "DONE_MVV");
check("makeUpStatusOf: d + 3 is MADE_UP", JSON.stringify(makeUpStatusOf(MISSED, addDays(MISSED, 3), false)) === JSON.stringify({ status: "MADE_UP", repaired: false }));
check("makeUpStatusOf: a second restore inside 7 days is MADE_UP", makeUpStatusOf(MISSED, addDays(MISSED, 1), true).status === "MADE_UP");

// ═══ §1 The rule over time ════════════════════════════════════════════════

console.log("— §1 ruleOn / applyNext —");
const base: DutyTemplate = {
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
};
const EFF = "2026-10-21";
{
  const archiving: DutyTemplate = { ...base, pendingChange: { v: 1, next: { effectiveDay: EFF, archive: true } } };
  check("pending archive: invisible the day before", ruleOn(archiving, addDays(EFF, -1)).archivedDay === null && expectedOn(archiving, addDays(EFF, -1)));
  check("pending archive: archived from its effective day", ruleOn(archiving, EFF).archivedDay === EFF && !expectedOn(archiving, EFF) && !expectedOn(archiving, addDays(EFF, 5)));
  const applied = applyNext(archiving);
  check("applyNext (archive): archivedDay = effectiveDay, no segment, nothing left", !!applied && applied.archivedDay === EFF && applied.prior === null && applied.pendingChange === null);
}
{
  const unflagging: DutyTemplate = { ...base, pendingChange: { v: 1, next: { effectiveDay: EFF, compulsory: false } } };
  check("pending un-flag: a must through effectiveDay − 1", ruleOn(unflagging, addDays(EFF, -1)).compulsory === true);
  check("pending un-flag: not a must from effectiveDay", ruleOn(unflagging, EFF).compulsory === false);
  const applied = applyNext(unflagging);
  check(
    "applyNext writes the prior segment {throughDay: effectiveDay − 1, compulsory: true}",
    !!applied &&
      applied.compulsory === false &&
      JSON.stringify(applied.prior) === JSON.stringify({ throughDay: addDays(EFF, -1), compulsory: true }) &&
      JSON.stringify(applied.pendingChange) === JSON.stringify({ v: 1, prior: [{ throughDay: addDays(EFF, -1), compulsory: true }] })
  );
  const after: DutyTemplate = { ...base, compulsory: false, pendingChange: applied!.pendingChange };
  check("applied: the same answers as while pending (days before stay a must)", ruleOn(after, addDays(EFF, -1)).compulsory === true && ruleOn(after, EFF).compulsory === false);
  check("a prior segment reaches no day after its throughDay", ruleOn(after, addDays(EFF, -1)).compulsory && !ruleOn(after, EFF).compulsory && !ruleOn(after, addDays(EFF, 30)).compulsory);
  // A re-flag (a strengthening) on T: the old value (false) through T − 1, the column true from T.
  const T = "2026-10-30";
  const reflagged: DutyTemplate = { ...after, compulsory: true, pendingChange: appendPrior(after.pendingChange, { throughDay: addDays(T, -1), compulsory: false }) };
  check(
    "two segments (an applied un-flag, then a re-flag) each govern their own days",
    ruleOn(reflagged, addDays(EFF, -1)).compulsory === true &&
      ruleOn(reflagged, EFF).compulsory === false &&
      ruleOn(reflagged, addDays(T, -1)).compulsory === false &&
      ruleOn(reflagged, T).compulsory === true
  );
  check("mustsDueOn follows the segments", mustsDueOn([reflagged], addDays(EFF, -1)).length === 1 && mustsDueOn([reflagged], EFF).length === 0 && mustsDueOn([reflagged], T).length === 1);
  const pruned = pruneSettledPrior(reflagged.pendingChange, new Set(["2026-W43"]));
  check("pruneSettledPrior drops only segments whose week is judged", JSON.stringify(pruned) === JSON.stringify({ v: 1, prior: [{ throughDay: addDays(T, -1), compulsory: false }] }), JSON.stringify(pruned));
  check("pruneSettledPrior: nothing left reads null", pruneSettledPrior(pruned, new Set(["2026-W44"])) === null);
}
{
  const restOff: DutyTemplate = { ...base, compulsoryOnRest: true, pendingChange: withNext(null, { effectiveDay: EFF, compulsoryOnRest: false }) };
  check("pending 'Even on rest days' off: on until effectiveDay", ruleOn(restOff, addDays(EFF, -1)).compulsoryOnRest && !ruleOn(restOff, EFF).compulsoryOnRest);
  const a = applyNext(restOff);
  check("applyNext ('Even on rest days' off): segment {compulsoryOnRest: true}", !!a && JSON.stringify(a.prior) === JSON.stringify({ throughDay: addDays(EFF, -1), compulsoryOnRest: true }) && a.compulsoryOnRest === false);
  check("withoutNext cancels the pending change", withoutNext(restOff.pendingChange) === null && ruleOn({ ...restOff, pendingChange: null }, EFF).compulsoryOnRest);
  check("nextIsDue: once effectiveDay − 1 is settled", !nextIsDue(restOff.pendingChange, addDays(EFF, -2)) && nextIsDue(restOff.pendingChange, addDays(EFF, -1)) && !nextIsDue(restOff.pendingChange, null));
}
{
  check("parsePendingChange: garbage reads null", parsePendingChange("x") === null && parsePendingChange({ next: { effectiveDay: "soon" } }) === null && parsePendingChange(null) === null);
  check("parsePendingChange: a next with no weakening is dropped", parsePendingChange({ v: 1, next: { effectiveDay: EFF } }) === null);
  const sorted = parsePendingChange({ prior: [{ throughDay: "2026-11-02", compulsory: false }, { throughDay: "2026-10-20", compulsory: true }] });
  check("parsePendingChange: prior sorted by throughDay", sorted?.prior?.[0].throughDay === "2026-10-20" && sorted?.prior?.[1].throughDay === "2026-11-02");
  const twice = appendPrior(appendPrior(null, { throughDay: "2026-10-20", compulsoryOnRest: false }), { throughDay: "2026-10-20", compulsoryOnRest: true, compulsory: false });
  const seg = twice.prior?.[0];
  check(
    "appendPrior: same throughDay keeps the first recorded value, merges new fields",
    twice.prior?.length === 1 && seg?.throughDay === "2026-10-20" && seg.compulsoryOnRest === false && seg.compulsory === false,
    JSON.stringify(twice.prior)
  );
  check("akrasiaEffectiveDay is today + 7", akrasiaEffectiveDay("2026-10-14") === "2026-10-21");
}

// ═══ §1 The akrasia classifier ════════════════════════════════════════════

console.log("— §1 classifyChange —");
{
  const created = new Date("2026-10-14T00:00:00Z");
  const at = (min: number) => new Date(created.getTime() + min * 60_000);
  const must = { compulsory: true, compulsoryOnRest: false, recurrence: "DAILY" };
  check("un-flag at 59 min: immediate (typo grace)", classifyChange(must, { compulsory: false }, { createdAt: created, now: at(59), launched: true }) === "immediate");
  check("un-flag at 61 min: deferred", classifyChange(must, { compulsory: false }, { createdAt: created, now: at(61), launched: true }) === "deferred");
  check("before launch every edit is immediate", classifyChange(must, { compulsory: false }, { createdAt: created, now: at(6000), launched: false }) === "immediate");
  check("'Even on rest days' on: immediate", classifyChange(must, { compulsoryOnRest: true }, { createdAt: created, now: at(6000), launched: true }) === "immediate");
  check(
    "'Even on rest days' off: deferred",
    classifyChange({ ...must, compulsoryOnRest: true }, { compulsoryOnRest: false }, { createdAt: created, now: at(6000), launched: true }) === "deferred"
  );
  const ctx = { createdAt: created, now: at(6000), launched: true };
  check("archive of a must: deferred", classifyChange(must, { archived: true }, ctx) === "deferred");
  check("archive of a non-must: immediate", classifyChange({ compulsory: false }, { archived: true }, ctx) === "immediate");
  check("flagging a must: immediate (a strengthening)", classifyChange({ compulsory: false }, { compulsory: true }, ctx) === "immediate");
  check("fewer days (DAILY → DOW:1,3): deferred", classifyChange(must, { recurrence: "DOW:1,3" }, ctx) === "deferred");
  check("longer EVERY (EVERY:2 → EVERY:3): deferred", classifyChange({ ...must, recurrence: "EVERY:2" }, { recurrence: "EVERY:3" }, ctx) === "deferred");
  check("more days (DOW:1 → DAILY): immediate", classifyChange({ ...must, recurrence: "DOW:1" }, { recurrence: "DAILY" }, ctx) === "immediate");
  check("lower TARGET: deferred", classifyChange({ ...must, recurrence: "TARGET:3/W" }, { recurrence: "TARGET:2/W" }, ctx) === "deferred");
  check("a later deadline: deferred; an earlier one: immediate", classifyChange({ compulsory: true, dueDay: "2026-10-20" }, { dueDay: "2026-10-22" }, ctx) === "deferred" && classifyChange({ compulsory: true, dueDay: "2026-10-20" }, { dueDay: "2026-10-18" }, ctx) === "immediate");
  check("to the inbox on a must: deferred", classifyChange(must, { inbox: true }, ctx) === "deferred");
}

// ═══ §1 Expected occurrences ══════════════════════════════════════════════

console.log("— §1 expectedOn / mustsDueOn —");
{
  check("expectedOn: a DAILY template on a day after its start", expectedOn(base, "2026-10-14"));
  check("expectedOn: never before its start day", !expectedOn(base, "2026-08-31"));
  check("expectedOn: an inbox template is never expected", !expectedOn({ ...base, inbox: true }, "2026-10-14"));
  check("expectedOn: no launch floor (a day before any DUTY_LAUNCH_DAY is expected if the rule says so)", expectedOn(base, "2026-09-02"));
  check("expectedOn: a TARGET has no expected single day", !expectedOn({ ...base, recurrence: "TARGET:3/W" }, "2026-10-14"));
  check("expectedOn: an AFTER rule has no expected single day", !expectedOn({ ...base, compulsory: false, recurrence: "AFTER:3" }, "2026-10-14"));
  const deadline: DutyTemplate = { ...base, kind: "TASK", recurrence: null, dueDay: "2026-10-16", dueKind: "DEADLINE" };
  check("expectedOn: a deadline one-off on its due day only", expectedOn(deadline, "2026-10-16") && !expectedOn(deadline, "2026-10-15") && !expectedOn(deadline, "2026-10-17"));
  check("expectedOn: a PLANNED one-off is never expected", !expectedOn({ ...deadline, dueKind: "PLANNED" }, "2026-10-16"));
  check("expectedOn: a GOAL is never expected", !expectedOn({ ...deadline, kind: "GOAL" }, "2026-10-16"));
  check("expectedOn: not on or after the archive day", expectedOn({ ...base, archivedDay: "2026-10-15" }, "2026-10-14") && !expectedOn({ ...base, archivedDay: "2026-10-15" }, "2026-10-15"));
  check("expectedOn: DOW:1,4 on Monday, not Tuesday", expectedOn({ ...base, recurrence: "DOW:1,4" }, "2026-10-12") && !expectedOn({ ...base, recurrence: "DOW:1,4" }, "2026-10-13"));
  const all = [base, { ...base, compulsory: false }, { ...base, recurrence: "TARGET:3/W" }, deadline, { ...base, inbox: true }];
  check("mustsDueOn: compulsory and expected only (TARGET, non-musts, inbox out)", mustsDueOn(all, "2026-10-16").length === 2 && mustsDueOn(all, "2026-10-15").length === 1);
}

// ═══ §1 Held days ═════════════════════════════════════════════════════════

console.log("— §1 heldDaysOf —");
{
  const D = "2026-10-15";
  const start = dayStartOf(D);
  const before = new Date(start.getTime() - 60_000);
  const after = new Date(start.getTime() + 60_000);
  const row = (o: Partial<RestRow>): RestRow => ({ day: D, kind: "REST", declaredAt: before, cancelledAt: null, ...o });
  check("REST declared before its day started counts", eqSet(heldDaysOf([row({})], D, D), [D]));
  check("REST declared after its day started is ignored", heldDaysOf([row({ declaredAt: after })], D, D).size === 0);
  check("VACATION declared after its day started is ignored", heldDaysOf([row({ kind: "VACATION", declaredAt: after })], D, D).size === 0);
  check("a cancelled row is ignored", heldDaysOf([row({ cancelledAt: before })], D, D).size === 0);
  check("cancelled then re-declared after the day started is ignored (its declaredAt is the new one)", heldDaysOf([row({ declaredAt: after, cancelledAt: null })], D, D).size === 0);
  check("SICK declared during its day counts", eqSet(heldDaysOf([row({ kind: "SICK", declaredAt: new Date(start.getTime() + 8 * 3_600_000) })], D, D), [D]));
  check("SICK declared after its day ended is ignored", heldDaysOf([row({ kind: "SICK", declaredAt: dayEndOf(D) })], D, D).size === 0);
  check("an unknown kind is ignored", heldDaysOf([row({ kind: "HOLIDAY" })], D, D).size === 0);
  check("rows outside [from, to] are ignored", heldDaysOf([row({})], addDays(D, 1), addDays(D, 3)).size === 0);
  // 2026-10-04 is DST's first day in Sydney (a 23-hour day): its start is 04:00 AEST, still a key-based day.
  const dst = "2026-10-04";
  check("DST start day: a REST declared at 03:59 that morning counts", eqSet(heldDaysOf([{ day: dst, kind: "REST", declaredAt: new Date(dayStartOf(dst).getTime() - 60_000), cancelledAt: null }], dst, dst), [dst]));
}

// ═══ §1 Habit reads ═══════════════════════════════════════════════════════

console.log("— §1 habit.ts (MADE_UP, targetUnits, the cursor) —");
{
  check("instanceOutcome(['MADE_UP']) is missed", instanceOutcome(["MADE_UP"]) === "missed");
  check("instanceOutcome: a kept slot beside MADE_UP keeps the day", instanceOutcome(["MADE_UP", "DONE"]) === "kept");
  const MON = "2026-10-12";
  const SUN = "2026-10-18";
  const week = { start: MON, end: SUN };
  const two: InstanceLike[] = [
    { day: MON, status: "DONE" },
    { day: SUN, status: "DONE_LATE", repaired: true },
    { day: SUN, status: "DONE_LATE", repaired: true },
  ];
  const u = targetUnits("TARGET:3/W", week, two);
  check("targetUnits counts two made-up Sunday slots as two units", u.kept === 3 && u.held === 0 && u.short === 0, JSON.stringify(u));
  const late = targetUnits("TARGET:3/W", week, [{ day: MON, status: "DONE" }, { day: SUN, status: "MADE_UP" }, { day: SUN, status: "MADE_UP" }]);
  check("targetUnits: MADE_UP slots count nothing", late.kept === 1 && late.short === 2, JSON.stringify(late));
  const twice = targetUnits("TARGET:3/W", week, [{ day: MON, status: "DONE" }, { day: MON, status: "DONE" }]);
  check("targetUnits: two ordinary ticks on one day are one unit", twice.kept === 1 && twice.short === 2);
  const rested = targetUnits("TARGET:3/W", week, [{ day: MON, status: "DONE" }], new Set(["2026-10-14"]));
  check("targetUnits: 1 done + 1 rest day → short 1", rested.kept === 1 && rested.held === 1 && rested.short === 1, JSON.stringify(rested));
  const restOnKept = targetUnits("TARGET:3/W", week, [{ day: MON, status: "DONE" }], new Set([MON]));
  check("targetUnits: a rest day already kept is not held twice", restOnKept.kept === 1 && restOnKept.held === 0);
  const minimum = targetUnits("TARGET:2/W", week, [{ day: MON, status: "DONE" }, { day: SUN, status: "DONE_MVV", repaired: true }]);
  check("targetUnits: a repaired minimum make-up slot holds one unit", minimum.kept === 1 && minimum.held === 1 && minimum.short === 0);
  const capped = targetUnits("TARGET:2/W", week, two);
  check("targetUnits: kept is capped at n", capped.kept === 2 && capped.short === 0);

  // DAILY habit from 1 Oct, nothing recorded 10–12 Oct; today 15 Oct (RECORD_WINDOW 1: 14 Oct is pending).
  const today = "2026-10-15";
  const inst: InstanceLike[] = [];
  for (let d = "2026-10-01"; d <= "2026-10-09"; d = addDays(d, 1)) inst.push({ day: d, status: "DONE" });
  const plain = outcomesOf("DAILY", "2026-10-01", today, inst).filter((o) => o.day >= "2026-10-10");
  check("no cursor: an old empty day reads missed (M1 behaviour)", plain.find((o) => o.day === "2026-10-12")?.outcome === "missed");
  const cursor = outcomesOf("DAILY", "2026-10-01", today, inst, { settledThroughDay: "2026-10-11" });
  check("with the cursor: a day > settledThroughDay reads pending", cursor.find((o) => o.day === "2026-10-12")?.outcome === "pending" && cursor.find((o) => o.day === "2026-10-13")?.outcome === "pending");
  check("with the cursor: a settled empty day still reads missed", cursor.find((o) => o.day === "2026-10-11")?.outcome === "missed");
  const held = outcomesOf("DAILY", "2026-10-01", today, inst, { heldDays: new Set(["2026-10-10", "2026-10-11"]), settledThroughDay: "2026-10-11" });
  check("with held days: a held day reads held", held.find((o) => o.day === "2026-10-10")?.outcome === "held");
  const s = perDutyStreak("DAILY", "2026-10-01", today, inst, { heldDays: new Set(["2026-10-10", "2026-10-11"]), settledThroughDay: "2026-10-11" });
  check("perDutyStreak: held then unsettled days do not break the run", s.kept === 9 && s.held === 2, JSON.stringify(s));
  const broken = perDutyStreak("DAILY", "2026-10-01", today, inst);
  check("perDutyStreak: without them the run is broken (unchanged)", broken.kept === 0);
  const nullCursor = outcomesOf("DAILY", "2026-10-01", today, inst, { settledThroughDay: null });
  check("a null cursor (Duty off) behaves as no cursor", nullCursor.find((o) => o.day === "2026-10-12")?.outcome === "missed");
}

// ═══ §1 Streak flags of settlement rows ═══════════════════════════════════

console.log("— §1 NEVER_STREAK_SOURCES —");
check("NEVER_STREAK_SOURCES holds DEBT_REPAID, DEBT_WRITTEN_OFF, FULL_DAY and REPAIR", ["DEBT_REPAID", "DEBT_WRITTEN_OFF", "FULL_DAY", "REPAIR"].every((x) => NEVER_STREAK_SOURCES.has(x as never)));
check("countsForStreakOf('REPAIR', true) is false", countsForStreakOf("REPAIR", true) === false);
check("countsForStreakOf('DEBT_REPAID', true) and ('FULL_DAY', true) are false", !countsForStreakOf("DEBT_REPAID", true) && !countsForStreakOf("FULL_DAY", true));
check("countsForStreakOf('TASK') is still true", countsForStreakOf("TASK") === true);
{
  const f = foldStreakDays([{ day: "2026-10-13", source: "REPAIR", countsForStreak: false }]);
  check("REPAIR still holds its day (HELD_SOURCES)", f.held.has("2026-10-13") && !f.active.has("2026-10-13"));
}

// ═══ §1 LifeSettings create days ══════════════════════════════════════════

console.log("— §1 newLifeSettingsDays —");
{
  const L = "2026-10-12";
  check("before launch: null cursor", newLifeSettingsDays("2026-10-11", L).settledThroughDay === null && newLifeSettingsDays("2026-10-11", L).epochDay === "2026-10-11");
  check("no launch day: null cursor", newLifeSettingsDays("2026-11-01", null).settledThroughDay === null);
  check("after launch: cursor = epochDay − 1", newLifeSettingsDays("2026-11-03", L).settledThroughDay === "2026-11-02" && newLifeSettingsDays("2026-11-03", L).epochDay === "2026-11-03");
  check("on the launch day: cursor = launch − 1", newLifeSettingsDays(L, L).settledThroughDay === "2026-10-11");
  const data = newLifeSettingsData("2026-11-03", L);
  check("newLifeSettingsData: @db.Date values", data.epochDay.toISOString() === "2026-11-03T00:00:00.000Z" && data.settledThroughDay?.toISOString() === "2026-11-02T00:00:00.000Z");
  check("newLifeSettingsData before launch: settledThroughDay null", newLifeSettingsData("2026-10-11", L).settledThroughDay === null);
  check("firstDutyDay = max(launch, epoch)", firstDutyDay("2026-10-01", L) === L && firstDutyDay("2026-11-03", L) === "2026-11-03" && firstDutyDay("2026-11-03", null) === null);
}

// ═══ §1 Keys and windows ══════════════════════════════════════════════════

console.log("— §1 dedupe keys and day windows —");
check("debtKey", debtKey("t", "2026-10-12", 0) === "debt:t:2026-10-12:0");
check("repaidKey carries the attempt", repaidKey("t", "2026-10-12", 0, 1) === "repaid:t:2026-10-12:0:1");
check("unrepaidKey", unrepaidKey("ev1") === "unrepaid:ev1");
check("writeOffKey", writeOffKey("t", "2026-10-12", 2) === "writeoff:t:2026-10-12:2");
check("freeze keys", freezeEarnKey("2026-10-12") === "freeze-earn:2026-10-12" && freezeUseKey("2026-10-12") === "freeze-use:2026-10-12");
check("repairKey names the repaired day", repairKey("2026-10-11") === "repair:2026-10-11");
check("full-day keys", fullDayKey("2026-10-12") === "fullday:2026-10-12" && fullDayMintKey("2026-10-12") === "mp:LIFE_FULL_DAY:2026-10-12");
check("reflectionKey and weekReviewKey", reflectionKey("2026-10-12", "n1") === "reflection:2026-10-12:n1" && weekReviewKey("2026-W42") === "week-review:2026-W42");
check("lastSettleableDay is today − 2", lastSettleableDay("2026-10-14") === "2026-10-12" && SETTLE_LAG_DAYS === 2);
check("isSettleable: d ≤ today − 2", isSettleable("2026-10-12", "2026-10-14") && !isSettleable("2026-10-13", "2026-10-14"));
check("settlement across the DST start: 3 Oct settles on 5 Oct (keys, not hours)", isSettleable("2026-10-03", "2026-10-05") && !isSettleable("2026-10-04", "2026-10-05"));
check("settlement across the DST end: 3 Apr 2027 settles on 5 Apr", isSettleable("2027-04-03", "2027-04-05") && lastSettleableDay("2027-04-05") === "2027-04-03");
check("restore window: d + 2", restoreDeadlineOf("2026-10-03") === "2026-10-05" && withinRestoreWindow("2026-10-03", "2026-10-05") && !withinRestoreWindow("2026-10-03", "2026-10-06") && MAKEUP_RESTORE_DAYS === 2);
check("write-off: today ≥ d + 14", canWriteOff("2026-10-01", "2026-10-15") && !canWriteOff("2026-10-01", "2026-10-14"));
check("dutyLagging: cursor < today − 2 − 3", dutyLagging("2026-10-08", "2026-10-14") && !dutyLagging("2026-10-09", "2026-10-14") && !dutyLagging(null, "2026-10-14"));

// ═══ §2 Launch gate ═══════════════════════════════════════════════════════

console.log("— §2 launch gate —");
check("DUTY_LAUNCH_DAY is null until the lead sets it", DUTY_LAUNCH_DAY === null);
check("dutyLaunchDay ignores the env in production", dutyLaunchDay({ NODE_ENV: "production", XTNL_DUTY_LAUNCH_DAY: "2026-10-12" }) === DUTY_LAUNCH_DAY);
check("dutyLaunchDay honours a valid env day outside production", dutyLaunchDay({ NODE_ENV: "development", XTNL_DUTY_LAUNCH_DAY: " 2026-10-12 " }) === "2026-10-12");
check("dutyLaunchDay ignores an invalid env day", dutyLaunchDay({ NODE_ENV: "development", XTNL_DUTY_LAUNCH_DAY: "2026-02-30" }) === DUTY_LAUNCH_DAY);
check("isDutyLaunched: never without a launch day", !isDutyLaunched("2030-01-01", null));
check("isDutyLaunched: from the launch day on", !isDutyLaunched("2026-10-11", "2026-10-12") && isDutyLaunched("2026-10-12", "2026-10-12"));
{
  const ctx = { deployDay: "2026-10-08", lifeLaunchDay: LIFE_LAUNCH_DAY };
  const ok = validateDutyLaunchDay("2026-10-12", ctx);
  check("validator: Mon 12 Oct after an 8 Oct deploy is valid", ok.valid && ok.problems.length === 0 && weekdayOf("2026-10-12") === 1, ok.problems.join(" "));
  const tue = validateDutyLaunchDay("2026-10-13", ctx);
  check("validator: a non-Monday is invalid", !tue.valid && tue.problems.some((p) => p.includes("Monday")));
  const early = validateDutyLaunchDay("2026-09-28", { deployDay: "2026-09-20", lifeLaunchDay: LIFE_LAUNCH_DAY });
  check("validator: a day before LIFE_LAUNCH_DAY is invalid", !early.valid && early.problems.some((p) => p.includes("LIFE_LAUNCH_DAY")));
  const beforeDeploy = validateDutyLaunchDay("2026-10-12", { deployDay: "2026-10-14", lifeLaunchDay: LIFE_LAUNCH_DAY });
  check("validator: a launch day before the deploy day is invalid", !beforeDeploy.valid && beforeDeploy.problems.some((p) => p.includes("deploy")));
  check("validator: null is invalid", !validateDutyLaunchDay(null, ctx).valid);
}

if (failed > 0) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\nall passed");
