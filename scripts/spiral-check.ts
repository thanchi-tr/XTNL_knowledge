/**
 * Blueprint P22 (Duty launch prep; decision D18; harm H4 in docs/life-plan/blueprint-plan-2026-10-22.md): the worst
 * week. A persona with five daily musts (the cap) does nothing at all for the seven days after Duty's launch day, and
 * settlement judges every one of them. Pure: no database, no clock (every `now` is built here), no env (every launch day
 * is passed in, so it holds whatever DUTY_LAUNCH_DAY is), no network, no model. PASS/FAIL per line; exits 1 on any
 * failure.
 *
 *   npx tsx scripts/spiral-check.ts      (npm run spiral:check; life:check runs it right after duty-check)
 *
 *   §1 the worst week, settled day by day (the cron) and in one catch-up run: at most 100 XP of debt in all, at most 20
 *      for one miss, at most 3 open for one task; a miss past a cap is still recorded (MISSED, nothing owed); the two
 *      runs owe exactly the same
 *   §2 nothing before the launch day: the persona's empty week before it owes nothing (a cursor set long before the
 *      launch, or none at all), and with no launch day nothing is planned
 *   §3 0 credits: settlement writes no row the credits fold reads or spends, and the persona's wallet is the same after
 *      the spiral as before it (no penalty ever debits credits)
 *   §4 the Rest Token bank (D19): its one token excuses the launch day's missed musts, one a day, and the rest of the
 *      week is charged within the same caps
 *   §5 a make-up: within 2 days it pays ×0.85 (T, with C 1.00), repays the whole debt and counts the day as kept; past
 *      the window it still pays ×0.85 and clears the debt, the day stays missed; one restore per task in 7 days
 *   §6 the weekly review after the spiral: its Owed step and its rest days run (Duty is live), its owed cards are
 *      settlement's open debts (no more than 100), and the Owed notice says so; before the launch neither runs
 */
import "./_no-model";
import { addDays, dayStartOf, weekdayOf, type DayKey } from "../src/lib/life-day";
import { MAKEUP_RESTORE_DAYS, firstDutyDay, isDutyLaunched, restoreDeadlineOf } from "../src/lib/duty-economy";
import { DEBT_CAP, DEBT_OPEN_PER_TEMPLATE, DEBT_OPEN_TOTAL_CAP, TIMING_FACTOR, debtFor } from "../src/lib/life-grade";
import { planSettlement, worstWeekOf, type DayPlan, type SettlementDebt, type SettlementInstance, type SettlementLedgerRow, type SettlementState, type SettlementTemplate } from "../src/lib/settlement-plan";
import type { RestTokenInputs } from "../src/lib/rest-tokens";
import { CREDIT_SOURCES, CREDIT_SPEND_SOURCES, foldCredits, type CreditRow } from "../src/lib/credits";
import { chestRowKey } from "../src/lib/momentum";
import { planCompletion, type DayLedger, type PricedTemplate } from "../src/lib/today-board";
import { dutyBoardOf, planMakeUp, type DutyBoardFacts, type OwedRow } from "../src/lib/duty-plan";
import { nextWeekDays, owedNotice, reviewPlanOf, reviewedWeek } from "../src/lib/rituals";
import type { ActivityInput } from "../src/lib/life-types";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const round1 = (x: number) => Math.round(x * 10) / 10;

// ── The persona ───────────────────────────────────────────────────────────

/** Duty's launch Monday in this check (any Monday: the code constant stays null until the user's go). */
const L: DayKey = "2026-10-26";
const EPOCH: DayKey = "2026-10-01";
const d = (n: number): DayKey => addDays(L, n);
/** 10:00 in Sydney on a life day (the day starts at 04:00). */
const at = (day: DayKey, hours = 6): Date => new Date(dayStartOf(day).getTime() + hours * 3_600_000);

function tpl(id: string, over: Partial<SettlementTemplate>): SettlementTemplate {
  return {
    id,
    kind: "HABIT",
    title: id,
    normTitle: id,
    track: "BODY",
    band: "STANDARD",
    bandOverride: 0,
    estMinutes: 15,
    machineMinutes: 15,
    intrinsic: false,
    mvv: null,
    mvvMinutes: null,
    autoMetric: null,
    autoTarget: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    pendingChange: null,
    recurrence: "DAILY",
    startDay: EPOCH,
    dueDay: null,
    dueKind: null,
    compulsory: true,
    compulsoryOnRest: false,
    inbox: false,
    archivedDay: null,
    ...over,
  };
}

/** Five daily musts (the daily-quest cap), heavy ones first: deep work and the gym owe the 20 cap, the others less. */
const PERSONA: SettlementTemplate[] = [
  tpl("deep-work", { title: "Deep work", track: "CRAFT", band: "DEMANDING", estMinutes: 120, machineMinutes: 120 }),
  tpl("gym", { title: "Gym", band: "DEMANDING", estMinutes: 60, machineMinutes: 60, mvv: "10 squats" }),
  tpl("read", { title: "Read", track: "CRAFT", estMinutes: 30, machineMinutes: 30 }),
  tpl("stretch", { title: "Stretch", estMinutes: 15, machineMinutes: 15, mvv: "1 stretch" }),
  tpl("meds", { title: "Meds", track: "CARE", band: "INTRO", estMinutes: 2, machineMinutes: 2 }),
];
const DEBT_OF = new Map(PERSONA.map((t) => [t.id, debtFor(t)]));

function state(today: DayKey, over: Partial<SettlementState> = {}): SettlementState {
  return {
    today,
    now: at(today),
    dutyLaunchDay: L,
    epochDay: EPOCH,
    // The launch script's cursor: firstDutyDay − 1.
    cursor: addDays(L, -1),
    templates: PERSONA,
    instances: [],
    rows: [],
    // Nothing done on any day: no streak units, no reviews, no ideas.
    days: [],
    freezeEarned: 0,
    freezeUsed: 0,
    openDebts: [],
    restRows: [],
    judgedDutyWeeks: new Set<string>(),
    ...over,
  };
}

const eventsOf = (plans: readonly DayPlan[]): ActivityInput[] => plans.flatMap((p) => p.ops.flatMap((o) => (o.kind === "event" ? [o.input] : [])));

let rowSeq = 0;
/** The state after the plans are written, as the next run reads it (the cursor, the instances, the open debts, the rows). */
function apply(s: SettlementState, plans: readonly DayPlan[], today: DayKey): SettlementState {
  const instances: SettlementInstance[] = s.instances.map((i) => ({ ...i }));
  const openDebts: SettlementDebt[] = [...s.openDebts];
  const rows: SettlementLedgerRow[] = [...s.rows];
  let { cursor, freezeUsed } = s;
  for (const p of plans)
    for (const op of p.ops) {
      if (op.kind === "instanceCreate") {
        const x = op.data;
        instances.push({ id: x.id!, templateId: x.templateId, day: x.day, slot: x.slot, status: x.status, source: x.source, debtXp: x.debtXp, debtOpen: x.debtOpen, repaired: false });
        if (x.debtOpen) openDebts.push({ instanceId: x.id!, templateId: x.templateId, day: x.day, slot: x.slot, debtXp: x.debtXp });
      } else if (op.kind === "instanceUpdate") {
        const i = instances.find((x) => x.id === op.id)!;
        Object.assign(i, { status: op.data.status, debtXp: op.data.debtXp, debtOpen: op.data.debtOpen });
        if (op.data.debtOpen) openDebts.push({ instanceId: i.id, templateId: i.templateId, day: i.day, slot: i.slot, debtXp: op.data.debtXp });
      } else if (op.kind === "event") {
        const e = op.input;
        rowSeq += 1;
        rows.push({
          id: `r${rowSeq}`,
          day: e.day!,
          source: e.source,
          sink: e.sink ?? "NONE",
          track: e.track ?? null,
          templateId: e.templateId ?? null,
          sourceId: e.sourceId ?? null,
          xp: e.xp ?? 0,
          rawXp: e.rawXp ?? null,
          qty: e.qty ?? null,
          countsForStreak: !!e.countsForStreak,
          dedupeKey: e.dedupeKey ?? null,
          receipt: null,
          joined: null,
        });
        if (e.source === "FREEZE_USE") freezeUsed += 1;
      } else if (op.kind === "cursor") {
        cursor = op.day;
      }
    }
  return { ...s, today, now: at(today), cursor, instances, openDebts, rows, freezeUsed };
}

/** The cron: one run a day from L + 2 (Monday is first judged at 04:00 on Wednesday) through `last`. */
function daily(last: DayKey, start: SettlementState = state(d(2)), tokens?: RestTokenInputs): { s: SettlementState; plans: DayPlan[]; maxOpen: number; maxPerTask: number } {
  let s = { ...start, ...(tokens ? { tokens } : {}) };
  const all: DayPlan[] = [];
  let maxOpen = 0;
  let maxPerTask = 0;
  for (let today = start.today; today <= last; today = addDays(today, 1)) {
    s = { ...s, today, now: at(today) };
    const plans = planSettlement(s);
    all.push(...plans);
    s = apply(s, plans, today);
    // The bank's FREEZE_USE days, as the next read sees them.
    if (tokens) s = { ...s, tokens: { ...tokens, spent: new Set(s.rows.filter((r) => r.source === "FREEZE_USE").map((r) => r.day)) } };
    maxOpen = Math.max(maxOpen, s.openDebts.reduce((t, x) => t + x.debtXp, 0));
    const per = new Map<string, number>();
    for (const x of s.openDebts) per.set(x.templateId, (per.get(x.templateId) ?? 0) + 1);
    maxPerTask = Math.max(maxPerTask, ...per.values(), 0);
  }
  return { s, plans: all, maxOpen, maxPerTask };
}

// ══ §1 the worst week ═════════════════════════════════════════════════════

console.log("— §1 the worst week: every must missed for seven days after the launch —");
const WEEK_END = d(6);
const SETTLED_ALL = addDays(WEEK_END, 2);
const uncapped = PERSONA.reduce((t, x) => t + (DEBT_OF.get(x.id) ?? 0), 0) * 7;
check(
  "the persona: five daily musts (the cap), two of them owe the 20 cap for a miss, and uncapped the week would owe far more than 100 (so the caps are what hold it)",
  PERSONA.length === 5 && DEBT_OF.get("deep-work") === DEBT_CAP && DEBT_OF.get("gym") === DEBT_CAP && uncapped > 3 * DEBT_OPEN_TOTAL_CAP && weekdayOf(L) === 1,
  `uncapped ${round1(uncapped)}; ${JSON.stringify([...DEBT_OF])}`
);
const cron = daily(SETTLED_ALL);
const debts = eventsOf(cron.plans).filter((e) => e.source === "DEBT");
const owedTotal = round1(-debts.reduce((t, e) => t + (e.xp ?? 0), 0));
check("the cron settled Monday to Sunday, one day a run, and nothing more (the cursor on Sunday)", same(cron.plans.map((p) => p.day), [d(0), d(1), d(2), d(3), d(4), d(5), d(6)]) && cron.s.cursor === WEEK_END, JSON.stringify(cron.plans.map((p) => p.day)));
check(`at most 100 XP of debt in all: ${owedTotal} (and never more open at any point)`, owedTotal <= DEBT_OPEN_TOTAL_CAP + 1e-9 && cron.maxOpen <= DEBT_OPEN_TOTAL_CAP + 1e-9 && DEBT_OPEN_TOTAL_CAP === 100, `${owedTotal}, peak ${cron.maxOpen}`);
check(
  "the total cap is what binds: the week stops within one miss of 100 (a miss that would cross it owes nothing), well short of the uncapped week",
  owedTotal > DEBT_OPEN_TOTAL_CAP - DEBT_CAP && owedTotal < uncapped / 3,
  String(owedTotal)
);
check(
  "at most 20 for one miss, each DEBT row exactly the must's own min(20, B × E), true minus",
  debts.length > 0 && debts.every((e) => (e.xp ?? 0) < 0 && -(e.xp ?? 0) <= DEBT_CAP && -(e.xp ?? 0) === DEBT_OF.get(e.templateId ?? "") && e.track === "DUTY" && e.countsForStreak === false),
  JSON.stringify(debts.map((e) => [e.templateId, e.xp]))
);
const perTask = new Map<string, number>();
for (const x of cron.s.openDebts) perTask.set(x.templateId, (perTask.get(x.templateId) ?? 0) + 1);
check(`at most 3 open for one task (the most at any point: ${cron.maxPerTask})`, cron.maxPerTask <= DEBT_OPEN_PER_TEMPLATE && [...perTask.values()].every((n) => n <= DEBT_OPEN_PER_TEMPLATE) && DEBT_OPEN_PER_TEMPLATE === 3, JSON.stringify([...perTask]));
const judged = cron.s.instances.filter((i) => i.day >= L && i.day <= WEEK_END);
check(
  "every miss is recorded (35 MISSED instances: five a day for seven days); a miss past a cap owes nothing (debt 0, not open), never a second charge",
  judged.length === 35 && judged.every((i) => i.status === "MISSED") && judged.filter((i) => !i.debtOpen).every((i) => i.debtXp === 0) && judged.filter((i) => i.debtOpen).length === debts.length,
  `${judged.length} instances, ${debts.length} debts`
);
const notes = cron.plans.flatMap((p) => p.notes);
check("the capped misses say so in the run's notes ('debt capped'), never as a debt", notes.filter((n) => /debt capped/.test(n)).length === 35 - debts.length && notes.filter((n) => /owed$/.test(n)).length === debts.length);
check("nothing but DEBT rows: no other penalty, no level-down, no HP pool", eventsOf(cron.plans).every((e) => e.source === "DEBT"), [...new Set(eventsOf(cron.plans).map((e) => e.source))].join(", "));
const catchUp = planSettlement(state(SETTLED_ALL));
const catchUpDebts = eventsOf(catchUp).filter((e) => e.source === "DEBT");
check(
  "one catch-up run (the seven days at once) owes exactly what the cron owed, debt for debt",
  same(catchUp.map((p) => p.day), cron.plans.map((p) => p.day)) && same(catchUpDebts.map((e) => e.dedupeKey).sort(), debts.map((e) => e.dedupeKey).sort()) && same(catchUpDebts.map((e) => e.xp), debts.map((e) => e.xp)),
  `${catchUpDebts.length} vs ${debts.length}`
);
check("re-planning over the written week plans nothing (idempotent)", planSettlement(cron.s).length === 0);
const worst = worstWeekOf(PERSONA, { launchDay: L, epochDay: EPOCH, now: at(SETTLED_ALL) });
check(
  "the launch dry run's worst week (settlement-plan worstWeekOf, what duty-launch.ts prints) is this same week: the same misses, debts and total",
  worst != null && worst.from === L && worst.to === WEEK_END && worst.misses === 35 && worst.owed === owedTotal && worst.capped === 35 - debts.length &&
    Math.abs(worst.uncapped - uncapped) < 1e-6 && same(worst.debts.map((x) => `${x.day}:${x.templateId}:${x.debt}`), debts.map((e) => `${e.day}:${e.templateId}:${-(e.xp ?? 0)}`)),
  JSON.stringify(worst && { ...worst, debts: worst.debts.length })
);
check("…and with no launch day there is none (the dry run says so instead)", worstWeekOf(PERSONA, { launchDay: null, epochDay: EPOCH, now: at(SETTLED_ALL) }) === null);

// ══ §2 nothing before the launch day ═════════════════════════════════════

console.log("— §2 nothing before the launch day —");
{
  // The week before the launch was just as empty, and the cursor sits a week before it (an old row, a cursor set early).
  const early = planSettlement(state(SETTLED_ALL, { cursor: addDays(L, -8) }));
  const earlyEvents = eventsOf(early);
  check(
    "a cursor set long before the launch: no day before the launch is judged, owed or recorded (firstDutyDay is the floor)",
    early.length > 0 && early.every((p) => p.day >= L) && earlyEvents.every((e) => (e.day ?? L) >= L) && firstDutyDay(EPOCH, L) === L,
    JSON.stringify(early.map((p) => p.day))
  );
  check("…and it owes what the launch cursor's run owes, no more", same(eventsOf(early).filter((e) => e.source === "DEBT").map((e) => e.dedupeKey).sort(), debts.map((e) => e.dedupeKey).sort()));
  check("on the launch day itself, and the day after, nothing is judged yet (a day is judged at 04:00 two days on)", planSettlement(state(L)).length === 0 && planSettlement(state(d(1))).length === 0);
  check("no launch day (DUTY_LAUNCH_DAY null): nothing is planned at all, whatever the cursor", planSettlement(state(SETTLED_ALL, { dutyLaunchDay: null })).length === 0 && planSettlement(state(SETTLED_ALL, { dutyLaunchDay: null, cursor: addDays(L, -30) })).length === 0);
  check("no cursor (the launch script has not run): nothing is planned", planSettlement(state(SETTLED_ALL, { cursor: null })).length === 0);
  check("a launch day still ahead: nothing is planned before it", planSettlement(state(d(-1), { dutyLaunchDay: L, cursor: addDays(L, -1) })).length === 0 && !isDutyLaunched(d(-1), L));
}

// ══ §3 0 credits ═══════════════════════════════════════════════════════════

console.log("— §3 0 credits: no penalty debits credits —");
{
  const sources = new Set(eventsOf(cron.plans).map((e) => e.source));
  check(
    "settlement writes no row the credits fold reads or spends (CREDIT_SOURCES, CREDIT_SPEND_SOURCES)",
    [...CREDIT_SOURCES, ...CREDIT_SPEND_SOURCES].every((src) => !sources.has(src as never)),
    [...sources].join(", ")
  );
  // The persona earned credits before the spiral (a chest the Sunday before the launch, a kept week): the wallet after
  // the spiral, its DEBT rows read beside them, is the wallet before it.
  const LAUNCH_CREDITS = addDays(L, -14);
  const earned: CreditRow[] = [
    { source: "CHEST", day: addDays(L, -1), dedupeKey: chestRowKey(addDays(L, -1)), qty: 1, detail: null, templateId: null },
    { source: "WEEK", day: addDays(L, -1), dedupeKey: `week:BODY:${"2026-W43"}`, qty: 1, detail: null, templateId: null },
  ];
  const spiral: CreditRow[] = eventsOf(cron.plans).map((e) => ({ source: e.source, day: e.day!, dedupeKey: e.dedupeKey ?? null, qty: e.qty ?? null, detail: e.detail ?? null, templateId: e.templateId ?? null }));
  const questDays = Array.from({ length: 7 }, (_, i) => ({ day: d(i), inForce: 3, done: 0 }));
  const before = foldCredits({ today: addDays(L, -1), launchDay: LAUNCH_CREDITS, questDays: [], rows: earned, goalScores: new Map() });
  const after = foldCredits({ today: SETTLED_ALL, launchDay: LAUNCH_CREDITS, questDays, rows: [...earned, ...spiral], goalScores: new Map() });
  check(
    `the wallet after the spiral is the wallet before it: ${before.balance} cr, nothing spent (0 credits lost)`,
    before.balance > 0 && after.balance === before.balance && after.spent === 0 && after.earned === before.earned && spiral.length > 0,
    JSON.stringify({ before: before.balance, after: after.balance, spent: after.spent })
  );
  check("…and a wallet at 0 stays at 0 (a debt never takes it below)", foldCredits({ today: SETTLED_ALL, launchDay: LAUNCH_CREDITS, questDays, rows: spiral, goalScores: new Map() }).balance === 0);
}

// ══ §4 the Rest Token bank (D19) ═══════════════════════════════════════════

console.log("— §4 the Rest Token bank: a token excuses one day's missed musts —");
{
  // Momentum's fold opens the bank on its launch day (here the Duty launch) with MOMENTUM_START_FREEZES (1): no momentum
  // day follows, so nothing more is earned.
  const tokens: RestTokenInputs = { launch: L, active: new Set(), extra: new Map(), max: new Map(), spent: new Set(), rest: new Set() };
  const banked = daily(SETTLED_ALL, state(d(2)), tokens);
  const ev = eventsOf(banked.plans);
  const uses = ev.filter((e) => e.source === "FREEZE_USE");
  const tokenDebts = ev.filter((e) => e.source === "DEBT");
  check("the one token is spent on the launch day (FREEZE_USE, sink NONE, never a streak unit), and at most one a day", uses.length === 1 && uses[0].day === L && uses[0].sink === "NONE" && uses[0].countsForStreak === false, JSON.stringify(uses.map((u) => u.day)));
  const monday = banked.s.instances.filter((i) => i.day === L);
  check("it excuses every must of that day (EXCUSED, nothing owed)", monday.length === 5 && monday.every((i) => i.status === "EXCUSED" && !i.debtOpen) && !tokenDebts.some((e) => e.day === L));
  const tokenTotal = round1(-tokenDebts.reduce((t, e) => t + (e.xp ?? 0), 0));
  check(
    `the rest of the week is charged within the same caps: ${tokenTotal} owed (≤ 100), ≤ 20 a miss, ≤ 3 open a task`,
    tokenTotal <= DEBT_OPEN_TOTAL_CAP + 1e-9 && banked.maxPerTask <= DEBT_OPEN_PER_TEMPLATE && tokenDebts.every((e) => -(e.xp ?? 0) <= DEBT_CAP) && tokenDebts.every((e) => (e.day ?? L) > L)
  );
}

// ══ §5 a make-up ══════════════════════════════════════════════════════════

console.log("— §5 a make-up: ×0.85 within two days, the whole debt repaid —");
{
  const t = PERSONA.find((x) => x.id === "stretch")!;
  const priced: PricedTemplate = {
    id: t.id,
    title: t.title,
    normTitle: t.normTitle ?? t.title,
    recurrence: t.recurrence,
    dueDay: t.dueDay,
    dueKind: null,
    intrinsic: t.intrinsic,
    autoMetric: t.autoMetric,
    mvv: t.mvv,
    track: t.track,
    band: t.band,
    bandOverride: t.bandOverride,
    estMinutes: t.estMinutes,
    machineMinutes: t.machineMinutes,
  };
  const debt = DEBT_OF.get("stretch")!;
  const ledger = (day: DayKey): DayLedger => ({ day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null });
  const missed = d(2);
  const makeUpOn = (today: DayKey, repairedInLast7 = false, minimum = false) =>
    planMakeUp({
      template: priced,
      instance: { id: "i-stretch", templateId: t.id, day: missed, slot: 0, debtXp: debt },
      today,
      now: at(today),
      minimum,
      ledger: ledger(today),
      repairedInLast7,
      taskAttempt: 0,
      repaidAttempt: 0,
    });
  const onTime = (today: DayKey) => planCompletion({ template: priced, day: today, today, slot: 0, ledger: ledger(today), streakDays: 0 }).receipt;
  const factor = (r: { factors: { key: string; value: number }[] }, k: string) => r.factors.find((f) => f.key === k)?.value;
  for (const gap of [1, MAKEUP_RESTORE_DAYS]) {
    const day = addDays(missed, gap);
    const m = makeUpOn(day);
    check(
      `made up ${gap} day${gap === 1 ? "" : "s"} later (inside the window to ${restoreDeadlineOf(missed)}): T ×0.85 and C 1.00 on its receipt, ${m.ok ? m.value.plan.receipt.xp : "?"} XP ≈ 0.85 × the on-time ${onTime(day).xp}, the day restored (DONE_LATE, repaired)`,
      m.ok &&
        factor(m.value.plan.receipt, "T") === TIMING_FACTOR.MAKE_UP &&
        TIMING_FACTOR.MAKE_UP === 0.85 &&
        factor(m.value.plan.receipt, "C") === 1 &&
        Math.abs(m.value.plan.receipt.xp - 0.85 * onTime(day).xp) <= 0.051 &&
        m.value.status === "DONE_LATE" &&
        m.value.restored === true,
      m.ok ? JSON.stringify(m.value.plan.receipt.factors) : m.error
    );
    check(`…and it repays the whole debt (DEBT_REPAID +${debt}, dated the make-up's day, never a streak unit)`, m.ok && m.value.repaidEvent.xp === debt && m.value.repaidEvent.day === day && m.value.repaidEvent.countsForStreak === false);
  }
  const late = makeUpOn(addDays(missed, MAKEUP_RESTORE_DAYS + 1));
  check(
    "past the two-day window: still ×0.85 and the whole debt repaid, but the day stays missed (MADE_UP, not repaired)",
    late.ok && factor(late.value.plan.receipt, "T") === 0.85 && late.value.status === "MADE_UP" && late.value.restored === false && late.value.repaidEvent.xp === debt
  );
  const budget = makeUpOn(addDays(missed, 1), true);
  check("one restore per task in 7 days: a second one inside the window clears the debt only (MADE_UP)", budget.ok && budget.value.status === "MADE_UP" && budget.value.repaidEvent.xp === debt);
  const min = makeUpOn(addDays(missed, 1), false, true);
  check("the minimum version: ×0.85 and ×0.3, the whole debt repaid, the day held (DONE_MVV)", min.ok && factor(min.value.plan.receipt, "T") === 0.85 && factor(min.value.plan.receipt, "K") === 0.3 && min.value.status === "DONE_MVV" && min.value.repaidEvent.xp === debt);
}

// ══ §6 the weekly review after the spiral ══════════════════════════════════

console.log("— §6 the weekly review: its Owed and rest steps —");
{
  const today = SETTLED_ALL; // Tuesday after the week: the review of the launch week is open (Monday to Wednesday)
  const week = reviewedWeek(today);
  const live = reviewPlanOf(isDutyLaunched(today, L));
  check("the reviewed week is the launch week", week?.monday === L && week?.sunday === WEEK_END, JSON.stringify(week));
  check("Duty live: the run holds its Owed step (4) and rest days for next week (step 5)", live.steps.some((s) => s.n === 4 && s.name === "Owed") && live.restDays && live.settledFacts);
  const days = week ? nextWeekDays(week, today, L) : [];
  check("step 5 offers rest for next week's days still ahead (from tomorrow, never before the launch)", days.length > 0 && days.every((x) => x > today && x >= L && x <= addDays(L, 13)), JSON.stringify(days));
  const pre = reviewPlanOf(isDutyLaunched(addDays(L, -1), L));
  check("before the launch day neither runs (the four-step review)", !pre.steps.some((s) => s.n === 4) && !pre.restDays && pre.steps.length === 4);

  // The review's Owed step reads the board's owed cards (BoardData.duty.owed): the persona's open debts, as dutyBoardOf builds them.
  const byId = new Map(PERSONA.map((x) => [x.id, x]));
  const owed: OwedRow[] = cron.s.openDebts.map((o) => {
    const x = byId.get(o.templateId)!;
    return {
      instanceId: o.instanceId,
      day: o.day,
      slot: o.slot,
      debtXp: o.debtXp,
      template: {
        id: x.id,
        title: x.title,
        normTitle: x.normTitle ?? x.title,
        recurrence: x.recurrence,
        dueDay: x.dueDay,
        dueKind: null,
        intrinsic: x.intrinsic,
        autoMetric: x.autoMetric,
        mvv: x.mvv,
        track: x.track,
        band: x.band,
        bandOverride: x.bandOverride,
        estMinutes: x.estMinutes,
        machineMinutes: x.machineMinutes,
        startDay: x.startDay,
        mvvMinutes: x.mvvMinutes,
        archived: false,
        compulsory: true,
        createdAt: x.createdAt.toISOString(),
      },
    };
  });
  const facts: DutyBoardFacts = {
    today,
    launchDay: L,
    cursor: cron.s.cursor,
    epochDay: EPOCH,
    debtWriteOff: false,
    owed,
    instances: cron.s.instances.map((i) => ({ templateId: i.templateId, day: i.day, status: i.status, repaired: i.repaired })),
    repairedRecently: new Set(),
    ledger: { day: today, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null },
    restRows: [],
    restTokens: null,
    units: {},
    heldByLedger: new Set(),
    freezeUsedYesterday: false,
    templates: PERSONA.map((x) => ({ ...x })),
    settledRows: [],
  };
  const board = dutyBoardOf(facts);
  const total = round1(board.owed.reduce((t, c) => t + c.debtXp, 0));
  check(
    `the Owed step's cards are settlement's open debts: ${board.owed.length} cards, −${total} in all (≤ 100), oldest first`,
    board.live && board.owed.length === cron.s.openDebts.length && total === owedTotal && total <= DEBT_OPEN_TOTAL_CAP && board.owed.every((c, i, a) => i === 0 || a[i - 1].day <= c.day)
  );
  check(
    "each card offers its make-up at ×0.85 (a positive price, the whole debt repaid); the days still inside their window restore",
    board.owed.every((c) => c.makeUpXp > 0) && board.owed.filter((c) => c.restoresToday).every((c) => c.day >= addDays(today, -MAKEUP_RESTORE_DAYS)) && board.owed.some((c) => !c.restoresToday)
  );
  const notice = owedNotice({ count: board.owed.length, debt: total });
  check(`the Owed notice says it plainly, never a reproach: '${notice?.title}'`, notice != null && notice.title === `Owed: ${board.owed.length} · −${total.toFixed(1)} XP` && !/fail|lost|penalt|shame/i.test(`${notice.title} ${notice.detail}`), JSON.stringify(notice));
}

console.log(`\nspiral-check: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
