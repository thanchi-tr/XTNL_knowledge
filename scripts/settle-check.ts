/**
 * Lane A's checks (docs/life-plan/m2-refit.md F3 step 11, F4, F5, F10 and
 * the shared-database safety cases of Acceptance):
 *
 *   §1 planSettlement on fixed scenarios: one DEBT per miss, idempotent re-plans, the launch
 *      floor, a reset after launch, the debt caps, freezes (spend, earn, max 2, pre-launch),
 *      rest / sick / vacation and compulsoryOnRest, TARGET periods, study musts, late
 *      one-offs, inbox musts, the make-up day, FULL_DAY, REPAIR, pending rule changes,
 *      early settles, the 14-day cap and the DST switches; every event countsForStreak false.
 *   §2 the Full-day rule (full-day.ts) over eight fixture days.
 *   §3 the executor against a recording stub client: chunk grouping and statement counts,
 *      the cursor guard on a quiet day, retries, dry runs, force, the launch and cursor gates,
 *      and that nothing is written with NODE_ENV development and no XTNL_LIFE_JUDGE.
 *   §4 maybeMaintainLife: no read and no write where writes are off, settle before judge,
 *      single flight, never throws.
 *   §5 the life cron: 401 without CRON_SECRET or with a wrong header; settle, then judge.
 *   §4b, §5b, §5c the roadmap step (docs/life-plan/roadmap.md F16 seam 8, lane G): settle → judge →
 *      roadmap in the chain and the cron, also while Duty is inert, only with writes on; freeze
 *      (CRON from the cron, RENDER from the chain) before readings, then finalisation; a roadmap
 *      failure fails neither caller and leaves the cron's status; the degrade cron's readings.
 *      A failure a writer RETURNS as `error` (they never throw) reaches the errors of the step,
 *      the cron JSON and the degrade JSON as one thrown does (roadmapStepErrorsOf; fix round).
 *
 * Pure: no database (the app's Prisma client is swapped for throwing spies while §3–§5 run,
 * so a missed injection fails loudly instead of reaching the shared database), no network,
 * an injected clock and env. settlement.ts imports the roadmap's writers, so _no-model comes
 * first (roadmap.md F16 seam 22), and every chain and cron call here injects them.
 *
 *   npx tsx scripts/settle-check.ts
 */
import "./_no-model";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Prisma } from "@prisma/client";
import { addDays, dateColumn, dayEndOf, dayStartOf, keyOfDateColumn, todayKey, weekKeyOf, type DayKey } from "../src/lib/life-day";
import {
  DUTY_CRON_PATH,
  DUTY_CRON_SCHEDULE,
  DUTY_LAUNCH_DAY,
  debtKey,
  freezeEarnKey,
  freezeUseKey,
  fullDayKey,
  newLifeSettingsDays,
  repairKey,
} from "../src/lib/duty-economy";
import { debtFor } from "../src/lib/life-grade";
import { LIFE_LAUNCH_DAY } from "../src/lib/life-economy";
import { streakUnitsOf } from "../src/lib/streak-curve";
import type { PendingChange, RestRow } from "../src/lib/duty-rule";
import type { ActivityInput, InstanceStatus } from "../src/lib/life-types";
import {
  planSettlement,
  settleRange,
  settledInstanceId,
  type DayPlan,
  type InstanceCreateOp,
  type InstanceUpdateOp,
  type SettlementInstance,
  type SettlementLedgerRow,
  type SettlementOp,
  type SettlementState,
  type SettlementTemplate,
  type TemplateHousekeepingOp,
} from "../src/lib/settlement-plan";
import { fullDayInputFor, fullDayLine, fullDayOf, isLifeDeed, mustsOfDay, questRingOf, type FullDayInstance } from "../src/lib/full-day";
import { prisma } from "../src/lib/prisma";
import { cached } from "../src/lib/cache";
import {
  REHEARSAL_DB_PORT,
  WRITES_OFF_REFUSAL,
  XTNL_IDEA_PROJECT_REF,
  chargedOneOffsOf,
  chunkGuardOf,
  chunkStatementLabels,
  cronAuthorized,
  groupChunk,
  guardOfSql,
  launchApplyTooEarly,
  launchDaysFor,
  launchTargetOf,
  lifeLaunchFinished,
  maybeMaintainLife,
  readSettlementState,
  recordRoadmapAfterDegrade,
  runLifeCron,
  runRoadmapStep,
  settleGuardSql,
  settleLifeDays,
  settlementWritesEnabled,
  updateBatchesOf,
  type SettleEnv,
  type SettleGuard,
  type SettleOptions,
  type SettleResult,
  type SettlementClient,
  type RoadmapStepDeps,
} from "../src/lib/settlement";
import type { RoadmapStepReport } from "../src/lib/roadmap-types";

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── Fixtures ──────────────────────────────────────────────────────────────

/** The launch Monday the plans are handed (the code constant stays null until the lead sets it). */
const L: DayKey = "2026-10-12";
const EPOCH: DayKey = "2026-10-01";
const d = (n: number): DayKey => addDays(L, n);
/** 10:00 local on a life day (dayStartOf is 04:00). */
const at = (day: DayKey, hours = 6): Date => new Date(dayStartOf(day).getTime() + hours * 3_600_000);

function tpl(id: string, over: Partial<SettlementTemplate> = {}): SettlementTemplate {
  return {
    id,
    kind: "TASK",
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

function st(today: DayKey, over: Partial<SettlementState> = {}): SettlementState {
  return {
    today,
    now: at(today),
    dutyLaunchDay: L,
    epochDay: EPOCH,
    cursor: addDays(L, -1),
    templates: [],
    instances: [],
    rows: [],
    days: [],
    freezeEarned: 0,
    freezeUsed: 0,
    lastFreezeEarnDay: null,
    openDebts: [],
    restRows: [],
    judgedDutyWeeks: new Set<string>(),
    ...over,
  };
}

const fact = (day: DayKey, over: { units?: number; reviews?: number; ideas?: number; dayOpenQty?: number | null } = {}) => ({
  day,
  streakUnits: over.units ?? 1,
  reviews: over.reviews ?? 0,
  ideas: over.ideas ?? 0,
  dayOpenQty: over.dayOpenQty === undefined ? null : over.dayOpenQty,
});
const activeOn = (...days: DayKey[]) => days.map((day) => fact(day));
const span = (from: DayKey, to: DayKey): DayKey[] => {
  const out: DayKey[] = [];
  for (let x = from; x <= to; x = addDays(x, 1)) out.push(x);
  return out;
};

function inst(templateId: string, day: DayKey, status: InstanceStatus, over: Partial<SettlementInstance> = {}): SettlementInstance {
  return { id: `i-${templateId}-${day}-${over.slot ?? 0}`, templateId, day, slot: 0, status, source: "manual", debtXp: 0, debtOpen: false, repaired: false, ...over };
}

let rowSeq = 0;
function row(day: DayKey, over: Partial<SettlementLedgerRow> = {}): SettlementLedgerRow {
  rowSeq += 1;
  return {
    id: `r${rowSeq}`,
    day,
    source: "TASK",
    sink: "TRACK",
    track: "BODY",
    templateId: null,
    sourceId: null,
    xp: 5,
    rawXp: 5,
    qty: null,
    countsForStreak: true,
    dedupeKey: null,
    receipt: null,
    joined: null,
    ...over,
  };
}
/** A non-study life deed on a day: a TASK row of a chore template. */
const deed = (day: DayKey, over: Partial<SettlementLedgerRow> = {}) =>
  row(day, { templateId: "chore", joined: { normTitle: "chore", title: "chore", band: "STANDARD", bandOverride: 0, autoMetric: null }, ...over });

const restRow = (day: DayKey, kind = "REST", declaredAt: Date = new Date(dayStartOf(day).getTime() - 3_600_000), cancelledAt: Date | null = null): RestRow => ({
  day,
  kind,
  declaredAt,
  cancelledAt,
});

/** Every event every plan in this file made, for the countsForStreak sweep. */
const allEvents: ActivityInput[] = [];
function plan(s: SettlementState): DayPlan[] {
  const plans = planSettlement(s);
  for (const p of plans) for (const op of p.ops) if (op.kind === "event") allEvents.push(op.input);
  return plans;
}
const ops = (plans: readonly DayPlan[]): SettlementOp[] => plans.flatMap((p) => p.ops);
const creates = (plans: readonly DayPlan[]) => ops(plans).filter((o): o is InstanceCreateOp => o.kind === "instanceCreate").map((o) => o.data);
const updates = (plans: readonly DayPlan[]) => ops(plans).filter((o): o is InstanceUpdateOp => o.kind === "instanceUpdate");
const events = (plans: readonly DayPlan[], source?: string) =>
  ops(plans)
    .filter((o): o is Extract<SettlementOp, { kind: "event" }> => o.kind === "event")
    .map((o) => o.input)
    .filter((e) => !source || e.source === source);
const housekeeping = (plans: readonly DayPlan[]) => ops(plans).filter((o): o is TemplateHousekeepingOp => o.kind === "templateHousekeeping");
const planOf = (plans: readonly DayPlan[], day: DayKey) => plans.find((p) => p.day === day);
const kinds = (p: DayPlan | undefined) => (p ? p.ops.map((o) => (o.kind === "event" ? `event:${o.input.source}` : o.kind)) : null);

/** The state after the plans' ops are written (what the next read would see). */
function apply(s: SettlementState, plans: readonly DayPlan[], today: DayKey = s.today): SettlementState {
  const instances = s.instances.map((i) => ({ ...i }));
  const rows = [...s.rows];
  const templates = s.templates.map((t) => ({ ...t }));
  const openDebts = [...s.openDebts];
  let { freezeEarned, freezeUsed, lastFreezeEarnDay, cursor } = s;
  for (const p of plans) {
    for (const op of p.ops) {
      if (op.kind === "instanceCreate") {
        const x = op.data;
        instances.push({ id: x.id!, templateId: x.templateId, day: x.day, slot: x.slot, status: x.status, source: x.source, debtXp: x.debtXp, debtOpen: x.debtOpen, repaired: false });
        if (x.debtOpen) openDebts.push({ instanceId: x.id!, templateId: x.templateId, day: x.day, slot: x.slot, debtXp: x.debtXp });
      } else if (op.kind === "instanceUpdate") {
        const i = instances.find((x) => x.id === op.id)!;
        Object.assign(i, { status: op.data.status, debtXp: op.data.debtXp, debtOpen: op.data.debtOpen }, op.data.source ? { source: op.data.source } : {});
        if (op.data.debtOpen) openDebts.push({ instanceId: i.id, templateId: i.templateId, day: i.day, slot: i.slot, debtXp: op.data.debtXp });
      } else if (op.kind === "event") {
        const e = op.input;
        rows.push(row(e.day!, { source: e.source, sink: e.sink ?? "NONE", track: e.track ?? null, templateId: e.templateId ?? null, sourceId: e.sourceId ?? null, xp: e.xp ?? 0, rawXp: e.rawXp ?? null, qty: e.qty ?? null, countsForStreak: !!e.countsForStreak, dedupeKey: e.dedupeKey ?? null }));
        if (e.source === "FREEZE_EARN") {
          freezeEarned += 1;
          lastFreezeEarnDay = e.day!;
        }
        if (e.source === "FREEZE_USE") freezeUsed += 1;
      } else if (op.kind === "templateHousekeeping") {
        const t = templates.find((x) => x.id === op.templateId)!;
        if (op.data.compulsory !== undefined) t.compulsory = op.data.compulsory;
        if (op.data.compulsoryOnRest !== undefined) t.compulsoryOnRest = op.data.compulsoryOnRest;
        if (op.data.archivedDay !== undefined) t.archivedDay = op.data.archivedDay;
        t.pendingChange = op.data.pendingChange;
      } else {
        cursor = op.day;
      }
    }
  }
  return { ...s, today, now: at(today), cursor, instances, rows, templates, openDebts, freezeEarned, freezeUsed, lastFreezeEarnDay };
}

const STRETCH_DEBT = debtFor({ band: "STANDARD", bandOverride: 0, estMinutes: 15, machineMinutes: 15 });

// ══ §1 the plan ═══════════════════════════════════════════════════════════

console.log("— §1 a miss, and re-planning —");
{
  eq("golden: 'stretch 15m' (STANDARD, 15) owes 8.3", STRETCH_DEBT, 8.3);
  const s = st(d(2), { templates: [tpl("stretch")] });
  const p = plan(s);
  eq("a miss: one day planned (L), judged at 04:00 on d + 2", p.map((x) => x.day), [L]);
  const c = creates(p);
  check(
    "a miss: one MISSED instance, slot 0, with its debt open and judgedAt = now",
    c.length === 1 && c[0].status === "MISSED" && c[0].slot === 0 && c[0].debtXp === 8.3 && c[0].debtOpen && c[0].judgedAt.getTime() === s.now.getTime() && c[0].id === settledInstanceId("stretch", L, 0),
    JSON.stringify(c)
  );
  const debt = events(p, "DEBT");
  check("a miss: exactly one DEBT row", debt.length === 1 && events(p).length === 1, JSON.stringify(events(p)));
  const e = debt[0];
  check(
    "DEBT row: sink TRACK, track DUTY, xp −debt, rawXp NULL, compositionKey 'debt', countsForStreak false",
    e.sink === "TRACK" && e.track === "DUTY" && e.xp === -8.3 && e.rawXp === null && e.compositionKey === "debt" && e.countsForStreak === false,
    JSON.stringify(e)
  );
  check("DEBT row: dated d, keyed 'debt:<tpl>:<d>:<slot>', sourceId = the instance", e.day === L && e.dedupeKey === debtKey("stretch", L, 0) && e.dedupeKey === "debt:stretch:2026-10-12:0" && e.sourceId === c[0].id && e.templateId === "stretch");
  eq("a day's ops end with the cursor move", kinds(p[0]), ["instanceCreate", "event:DEBT", "cursor"]);
  check("a missed day is not held", p[0].held === false);
  eq("re-planning over the written result plans nothing", plan(apply(s, p)).length, 0);
  eq("re-planning over the result a day later plans only the new day", plan(apply(s, p, d(3))).map((x) => x.day), [d(1)]);
  eq("before d + 2 nothing is planned (today = d + 1)", plan(st(d(1), { templates: [tpl("stretch")] })).length, 0);
  eq("on d itself nothing is planned", plan(st(L, { templates: [tpl("stretch")] })).length, 0);
  const dishes = creates(plan(st(d(2), { templates: [tpl("dishes", { band: "INTRO" })] })));
  eq("golden: dishes (INTRO, 15) owes 4.2", dishes[0]?.debtXp, 4.2);
}

console.log("— §1 the launch gate and the first judged day —");
{
  eq("no launch day: nothing", plan(st(d(5), { dutyLaunchDay: null, templates: [tpl("stretch")] })).length, 0);
  eq("no cursor: nothing", plan(st(d(5), { cursor: null, templates: [tpl("stretch")] })).length, 0);
  eq("launch day still ahead: nothing", plan(st(d(-1), { cursor: d(-4), templates: [tpl("stretch")] })).length, 0);
  // An old cursor, pre-launch activity that would earn a freeze, a pre-launch Full-day shape and a pre-launch break.
  const s = st(d(2), {
    cursor: d(-10),
    templates: [],
    days: [...activeOn(...span(d(-6), d(-2))), fact(L, { dayOpenQty: 0 }), fact(d(-3), { dayOpenQty: 0 })],
    rows: [deed(L), deed(d(-3))],
  });
  const p = plan(s);
  eq("the first plan after launch judges nothing before firstDutyDay", p.map((x) => x.day), [L]);
  check("no row is dated before the launch day", events(p).every((e) => (e.day ?? "") >= L), JSON.stringify(events(p).map((e) => e.day)));
  eq("pre-launch active days earn no freeze on the launch day", events(p, "FREEZE_EARN").length, 0);
  eq("the launch day can be a Full day", events(p, "FULL_DAY").map((e) => e.dedupeKey), [fullDayKey(L)]);
  eq("a pre-launch break (L − 1) is never repaired", events(p, "REPAIR").length, 0);
}

console.log("— §1 a reset after launch —");
{
  const epoch = d(10);
  const fresh = newLifeSettingsDays(epoch, L);
  eq("newLifeSettingsDays after launch: cursor = epoch − 1", fresh, { epochDay: epoch, settledThroughDay: d(9) });
  const s = st(d(13), { epochDay: fresh.epochDay, cursor: fresh.settledThroughDay, templates: [tpl("stretch")] });
  eq("settlement resumes at the new epoch", plan(s).map((x) => x.day), [d(10), d(11)]);
  eq("a stale cursor before the new epoch still starts at the epoch", plan({ ...s, cursor: L }).map((x) => x.day), [d(10), d(11)]);
}

console.log("— §1 the debt caps —");
{
  const open = [L, d(1), d(2)].map((day, k) => ({ instanceId: `o${k}`, templateId: "stretch", day, slot: 0, debtXp: 8.3 }));
  const p = plan(st(d(8), { cursor: d(5), templates: [tpl("stretch")], openDebts: open }));
  const c = creates(p);
  check("a 4th open miss on one template is MISSED with debtXp 0 and nothing owed", c.length === 1 && c[0].status === "MISSED" && c[0].debtXp === 0 && !c[0].debtOpen, JSON.stringify(c));
  check("…with no DEBT row and a 'debt capped' note", events(p, "DEBT").length === 0 && p[0].notes.some((n) => n.includes("debt capped")), JSON.stringify(p[0].notes));

  const others = [1, 2, 3, 4, 5].map((k) => ({ instanceId: `x${k}`, templateId: `x${k}`, day: L, slot: 0, debtXp: 17 }));
  const q = plan(st(d(8), { cursor: d(5), templates: [tpl("b"), tpl("a")], openDebts: others }));
  const debts = events(q, "DEBT").map((e) => e.dedupeKey);
  eq("total open debt above 100 is capped in templateId order ('a' owes, 'b' is capped)", debts, [debtKey("a", d(6), 0)]);
  const b = creates(q).find((x) => x.templateId === "b");
  check("…the capped one is MISSED with debtXp 0", b?.status === "MISSED" && b.debtXp === 0 && !b.debtOpen, JSON.stringify(b));
  // A Sunday: 'a' is a TARGET one short, 'b' a daily must; the cap still applies in templateId order across both.
  const sunday = plan(st(d(8), { cursor: d(5), templates: [tpl("b"), tpl("a", { recurrence: "TARGET:1/W" })], openDebts: others }));
  eq("the caps apply in templateId, slot order across fixed misses and TARGET slots", events(sunday, "DEBT").map((e) => e.dedupeKey), [debtKey("a", d(6), 0)]);
}

console.log("— §1 freezes —");
{
  const base = { cursor: L, templates: [tpl("stretch")], days: activeOn(L) };
  const withFreeze = plan(st(d(3), { ...base, freezeEarned: 1 }));
  const use = events(withFreeze, "FREEZE_USE");
  check("no-activity day with a freeze banked: FREEZE_USE 'freeze-use:<d>', sink NONE", use.length === 1 && use[0].dedupeKey === freezeUseKey(d(1)) && use[0].sink === "NONE" && use[0].day === d(1), JSON.stringify(use));
  check("…its musts are EXCUSED, nothing is owed, the day is held", creates(withFreeze).every((c) => c.status === "EXCUSED") && events(withFreeze, "DEBT").length === 0 && withFreeze[0].held);
  const without = plan(st(d(3), base));
  check("without a freeze: MISSED and a DEBT", creates(without)[0]?.status === "MISSED" && events(without, "DEBT").length === 1 && !without[0].held);

  const dead = plan(st(d(3), { cursor: L, templates: [tpl("walk", { compulsory: false })], freezeEarned: 1 }));
  check("a dead streak with no musts due keeps its freeze", events(dead, "FREEZE_USE").length === 0 && creates(dead).length === 0, JSON.stringify(kinds(dead[0])));
  const deadMust = plan(st(d(3), { cursor: L, templates: [tpl("stretch"), tpl("walk", { compulsory: false })], freezeEarned: 1 }));
  check("a dead streak with a must due spends it (it protects the must) and excuses everything", events(deadMust, "FREEZE_USE").length === 1 && creates(deadMust).length === 2 && creates(deadMust).every((c) => c.status === "EXCUSED"));

  const nothingDue = plan(st(d(3), { cursor: L, templates: [tpl("due", { autoMetric: "REVIEW_DUE" })], days: [fact(d(1), { units: 0, dayOpenQty: 0 })], freezeEarned: 1 }));
  check("a dead streak whose only must is met with nothing due (REVIEW_DUE, DAY_OPEN 0) keeps its freeze", events(nothingDue, "FREEZE_USE").length === 0 && creates(nothingDue)[0]?.status === "DONE");
  const spentYesterday = plan(st(d(3), { ...base, freezeEarned: 1, freezeUsed: 1 }));
  check("a freeze already spent (a manual spend for yesterday) is not spent twice: the balance never goes below 0", events(spentYesterday, "FREEZE_USE").length === 0 && events(spentYesterday, "DEBT").length === 1);

  const manualUse = row(d(1), { source: "FREEZE_USE", sink: "NONE", track: null, xp: 0, rawXp: null, countsForStreak: false, dedupeKey: freezeUseKey(d(1)) });
  const manualState = (days: ReturnType<typeof fact>[]) =>
    st(d(3), { cursor: L, templates: [tpl("meds", { compulsoryOnRest: true }), tpl("stretch")], days, rows: [manualUse], freezeEarned: 1, freezeUsed: 1 });
  const manual = plan(manualState([fact(L), fact(d(1), { units: 0 })]));
  check("a manual FREEZE_USE dated d (no activity) excuses every must, compulsoryOnRest included, and plans no second one", events(manual, "FREEZE_USE").length === 0 && creates(manual).length === 2 && creates(manual).every((c) => c.status === "EXCUSED") && manual[0].held);
  // Decision 12 (review: a freeze spent, then yesterday recorded): a freeze covers a no-activity day only.
  const recordedAfter = plan(manualState(activeOn(L, d(1))));
  check(
    "a manual FREEZE_USE on a day recorded afterwards (active) holds nothing: its musts are MISSED with their debt",
    creates(recordedAfter).length === 2 && creates(recordedAfter).every((c) => c.status === "MISSED") && events(recordedAfter, "DEBT").length === 2 && !recordedAfter[0].held,
    JSON.stringify(creates(recordedAfter).map((c) => c.status))
  );
  check("…no second FREEZE_USE is planned, and the note says why", events(recordedAfter, "FREEZE_USE").length === 0 && recordedAfter[0].notes.some((n) => n.includes("holds nothing")), JSON.stringify(recordedAfter[0].notes));

  const seven = plan(st(d(8), { days: activeOn(...span(L, d(6))) }));
  eq("freeze earned on the 7th active day after launch", events(seven, "FREEZE_EARN").map((e) => e.dedupeKey), [freezeEarnKey(d(6))]);
  check("…sink NONE, countsForStreak false", events(seven, "FREEZE_EARN").every((e) => e.sink === "NONE" && e.countsForStreak === false));
  eq("at a balance of 2 nothing is earned", events(plan(st(d(8), { days: activeOn(...span(L, d(6))), freezeEarned: 2 })), "FREEZE_EARN").length, 0);
  eq("14 active days earn two, the second after 7 more", events(plan(st(d(15), { days: activeOn(...span(L, d(13))) })), "FREEZE_EARN").map((e) => e.day), [d(6), d(13)]);
  eq("max 2: from a balance of 1 only one more is earned", events(plan(st(d(15), { days: activeOn(...span(L, d(13))), freezeEarned: 1 })), "FREEZE_EARN").map((e) => e.day), [d(6)]);
  eq("pre-launch active days earn nothing (the 7th counts from launch)", events(plan(st(d(8), { cursor: d(-1), days: activeOn(...span(d(-6), d(6))) })), "FREEZE_EARN").map((e) => e.day), [d(6)]);
  eq(
    "an inactive day earns nothing, however many came before",
    events(plan(st(d(9), { days: [...activeOn(...span(L, d(6))).map((f) => (f.day === d(6) ? fact(d(6), { units: 0 }) : f)), fact(d(7))] })), "FREEZE_EARN").map((e) => e.day),
    [d(7)]
  );
  const tail = st(d(24), { cursor: d(20), lastFreezeEarnDay: d(2), freezeEarned: 1, days: activeOn(d(21), d(22)), activeDaysBefore: 5 });
  eq("active days before the facts read count toward the next freeze (5 + 2 = 7)", events(plan(tail), "FREEZE_EARN").map((e) => e.day), [d(22)]);
  eq("…and without them nothing is earned", events(plan({ ...tail, activeDaysBefore: undefined }), "FREEZE_EARN").length, 0);
}

console.log("— §1 rest, sick, vacation and compulsoryOnRest —");
{
  const tpls = [tpl("meds", { compulsoryOnRest: true }), tpl("stretch"), tpl("walk", { compulsory: false })];
  const rest = plan(st(d(3), { cursor: L, templates: tpls, days: activeOn(L), freezeEarned: 1, restRows: [restRow(d(1))] }));
  const by = (p: DayPlan[], id: string) => creates(p).find((c) => c.templateId === id);
  check("a rest day: a must is EXCUSED, a non-must habit is EXCUSED", by(rest, "stretch")?.status === "EXCUSED" && by(rest, "walk")?.status === "EXCUSED");
  check("…compulsoryOnRest is owed (MISSED with its DEBT)", by(rest, "meds")?.status === "MISSED" && events(rest, "DEBT").map((e) => e.dedupeKey).join() === debtKey("meds", d(1), 0));
  check("…a rest day spends no freeze and is held", events(rest, "FREEZE_USE").length === 0 && rest[0].held);
  const freeze = plan(st(d(3), { cursor: L, templates: tpls, days: activeOn(L), freezeEarned: 1 }));
  check("a freeze day excuses compulsoryOnRest too, and nothing is owed", ["meds", "stretch", "walk"].every((id) => by(freeze, id)?.status === "EXCUSED") && events(freeze, "DEBT").length === 0);

  const late = plan(st(d(3), { cursor: L, templates: [tpl("stretch")], restRows: [restRow(d(1), "REST", new Date(dayStartOf(d(1)).getTime() + 3_600_000))] }));
  check("a rest row declared after the day started is ignored: the must is owed", creates(late)[0]?.status === "MISSED" && events(late, "DEBT").length === 1 && !late[0].held);
  const sick = plan(st(d(3), { cursor: L, templates: [tpl("stretch")], restRows: [restRow(d(1), "SICK", new Date(dayStartOf(d(1)).getTime() + 5 * 3_600_000))] }));
  check("a SICK day declared during the day holds it", creates(sick)[0]?.status === "EXCUSED" && sick[0].held);
  const vac = plan(st(d(3), { cursor: L, templates: [tpl("stretch")], restRows: [restRow(d(1), "VACATION")] }));
  check("a vacation day holds it", creates(vac)[0]?.status === "EXCUSED");
  const cancelled = plan(st(d(3), { cursor: L, templates: [tpl("stretch")], restRows: [restRow(d(1), "REST", undefined, new Date(dayStartOf(d(1)).getTime() - 60_000))] }));
  check("a cancelled rest row holds nothing", creates(cancelled)[0]?.status === "MISSED");
}

console.log("— §1 TARGET periods —");
{
  const gym = tpl("gym", { recurrence: "TARGET:3/W" });
  const base = { cursor: d(5), templates: [gym] };
  const one = plan(st(d(8), { ...base, instances: [inst("gym", d(2), "DONE")] }));
  const c = creates(one);
  check("TARGET:3/W with 1 done → 2 MISSED slots on the period's last day", c.length === 2 && c.every((x) => x.status === "MISSED" && x.day === d(6)) && c.map((x) => x.slot).join() === "0,1", JSON.stringify(c));
  eq("…each with its DEBT, keyed per slot", events(one, "DEBT").map((e) => e.dedupeKey), [debtKey("gym", d(6), 0), debtKey("gym", d(6), 1)]);
  const rested = plan(st(d(8), { ...base, instances: [inst("gym", d(2), "DONE")], restRows: [restRow(d(3))] }));
  eq("with 1 done and 1 rest day → 1 slot", creates(rested).length, 1);
  const onRest = plan(st(d(8), { ...base, templates: [tpl("gym", { recurrence: "TARGET:3/W", compulsoryOnRest: true })], instances: [inst("gym", d(2), "DONE")], restRows: [restRow(d(3))] }));
  eq("a compulsoryOnRest TARGET is not held by a rest day", creates(onRest).length, 2);
  const lastDay = plan(st(d(8), { ...base, instances: [inst("gym", d(2), "DONE"), inst("gym", d(6), "DONE")] }));
  check("slots go after the highest existing one on that day", creates(lastDay).length === 1 && creates(lastDay)[0].slot === 1, JSON.stringify(creates(lastDay)));
  const madeUp = plan(st(d(8), { ...base, instances: [inst("gym", d(2), "DONE"), inst("gym", d(4), "DONE"), inst("gym", d(5), "DONE")] }));
  eq("a met period owes nothing", creates(madeUp).length, 0);
  eq("a period ending mid-run is judged only on its last day", creates(plan(st(d(8), { cursor: d(2), templates: [gym], instances: [inst("gym", d(2), "DONE")] }))).map((x) => x.day), [d(6), d(6)]);
  const monthly = plan(st(addDays("2026-10-31", 2), { cursor: "2026-10-30", templates: [tpl("m", { recurrence: "TARGET:4/M" })] }));
  check("a period that started before the first judged day is not judged", monthly.length === 1 && creates(monthly).length === 0, JSON.stringify(kinds(monthly[0])));
  const nonMust = plan(st(d(8), { ...base, templates: [tpl("gym", { recurrence: "TARGET:3/W", compulsory: false })] }));
  eq("a TARGET that is not a must owes nothing", creates(nonMust).length, 0);

  // The judge's rule (life-weeks dutyOccurrencesM2): a must under ruleOn on the period's first AND last day (decision 16).
  const strengthened = plan(
    st(d(8), { ...base, templates: [tpl("gym", { recurrence: "TARGET:3/W", pendingChange: { v: 1, prior: [{ throughDay: d(2), compulsory: false }] } })], instances: [inst("gym", d(5), "DONE")] })
  );
  check(
    "a TARGET made a must mid-period (not a must on its Monday) owes nothing for that period, as the judge reads it",
    creates(strengthened).length === 0 && events(strengthened, "DEBT").length === 0,
    JSON.stringify(strengthened[0]?.notes)
  );
  const weakened = plan(st(d(8), { ...base, templates: [tpl("gym", { recurrence: "TARGET:3/W", pendingChange: { v: 1, next: { effectiveDay: d(3), compulsory: false } } })], instances: [inst("gym", d(2), "DONE")] }));
  eq("a TARGET un-flagged before its Sunday (a pending weakening in force by then) owes nothing", creates(weakened).length, 0);
  const nextWeek = plan(st(d(15), { cursor: d(12), templates: [tpl("gym", { recurrence: "TARGET:3/W", pendingChange: { v: 1, prior: [{ throughDay: d(2), compulsory: false }] } })], instances: [inst("gym", d(9), "DONE")] }));
  eq("…and the next whole period is judged as usual (2 short)", creates(nextWeek).map((c) => c.status), ["MISSED", "MISSED"]);
  // Held days go per day: 'Even on rest days' switched on mid-period does not reach back to Monday's and Tuesday's rest.
  const restOnLater = plan(
    st(d(8), {
      ...base,
      templates: [tpl("gym", { recurrence: "TARGET:3/W", compulsoryOnRest: true, pendingChange: { v: 1, prior: [{ throughDay: d(1), compulsoryOnRest: false }] } })],
      instances: [inst("gym", d(4), "DONE")],
      restRows: [restRow(L), restRow(d(1))],
    })
  );
  eq("'Even on rest days' turned on mid-period: the rest days before it still hold (1 done + 2 held = 3, nothing owed)", [creates(restOnLater).length, events(restOnLater, "DEBT").length], [0, 0]);
}

console.log("— §1 study musts (decision 19) —");
{
  const review = tpl("review20", { autoMetric: "REVIEWS", autoTarget: 20, track: "CRAFT" });
  const met = plan(st(d(3), { cursor: L, templates: [review], days: [fact(d(1), { units: 20, reviews: 20 })] }));
  const c = creates(met)[0];
  check("a study must met by reviews: a DONE instance (auto:reviews, 0 XP), no debt", c?.status === "DONE" && c.source === "auto:reviews" && c.xpPaid === 0 && events(met, "DEBT").length === 0, JSON.stringify(c));
  const task = events(met, "TASK")[0];
  check(
    "…and the auto-completer's TASK row: sink NONE, 0 XP, countsForStreak false, the same dedupe key",
    task?.sink === "NONE" && task.xp === 0 && task.countsForStreak === false && task.dedupeKey === `task:review20:${d(1)}:0:0` && task.sourceId === c?.id && task.day === d(1),
    JSON.stringify(task)
  );
  eq("…with the auto-completer's label", task?.detail, "20/20 reviews");
  const cleared = plan(st(d(3), { cursor: L, templates: [review], days: [fact(d(1), { reviews: 12, dayOpenQty: 12 })] }));
  check("reviews reaching the day-open target meet it (the queue was clear)", creates(cleared)[0]?.status === "DONE" && events(cleared, "TASK")[0]?.detail === "12/20 · queue clear");
  const short = plan(st(d(3), { cursor: L, templates: [review], days: [fact(d(1), { reviews: 12 })] }));
  check("12 of 20 reviews with no DAY_OPEN row: missed and owed", creates(short)[0]?.status === "MISSED" && events(short, "DEBT").length === 1);

  const due = tpl("due", { autoMetric: "REVIEW_DUE" });
  const noOpen = plan(st(d(3), { cursor: L, templates: [due], days: [fact(d(1), { reviews: 40 })] }));
  check("REVIEW_DUE without DAY_OPEN is missed", creates(noOpen)[0]?.status === "MISSED" && events(noOpen, "DEBT").length === 1);
  const zero = plan(st(d(3), { cursor: L, templates: [due], days: [fact(d(1), { units: 0, dayOpenQty: 0 })] }));
  check("REVIEW_DUE with DAY_OPEN 0 is met", creates(zero)[0]?.status === "DONE" && events(zero, "DEBT").length === 0);
  check("REVIEW_DUE with reviews ≥ the DAY_OPEN qty is met", creates(plan(st(d(3), { cursor: L, templates: [due], days: [fact(d(1), { reviews: 30, dayOpenQty: 30 })] })))[0]?.status === "DONE");
  check("REVIEW_DUE one review short is missed", creates(plan(st(d(3), { cursor: L, templates: [due], days: [fact(d(1), { reviews: 29, dayOpenQty: 30 })] })))[0]?.status === "MISSED");

  const undone = plan(
    st(d(3), {
      cursor: L,
      templates: [review],
      instances: [inst("review20", d(1), "UNDONE", { id: "u1" })],
      rows: [row(d(1), { id: "t1", templateId: "review20", sourceId: "u1", sink: "NONE", xp: 0, rawXp: 0 }), row(d(1), { source: "UNDO", sourceId: "u1", sink: "NONE", xp: 0, rawXp: 0, countsForStreak: false, dedupeKey: "undo:t1" })],
      days: [fact(d(1), { reviews: 25, units: 25 })],
    })
  );
  check("an UNDONE slot 0 is moved (not created) and the TASK key's attempt counts its undo", creates(undone).length === 0 && updates(undone)[0]?.id === "u1" && updates(undone)[0].data.status === "DONE" && events(undone, "TASK")[0]?.dedupeKey === `task:review20:${d(1)}:0:1`);
}

console.log("— §1 deadline one-offs (decision 18), inbox musts, PLANNED musts —");
{
  const ts = tpl("ts", { recurrence: null, dueKind: "DEADLINE", dueDay: d(1) });
  eq("done on d + 1 (DONE_LATE): owes nothing", kinds(plan(st(d(3), { cursor: L, templates: [ts], instances: [inst("ts", d(2), "DONE_LATE")] }))[0]), ["cursor"]);
  const lateRun = plan(st(d(5), { cursor: L, templates: [ts], instances: [inst("ts", d(4), "DONE_LATE")] }));
  check("done on d + 3 before settlement ran: owes nothing", creates(lateRun).length === 0 && events(lateRun, "DEBT").length === 0, JSON.stringify(kinds(lateRun[0])));
  eq("done before its due day: owes nothing", creates(plan(st(d(3), { cursor: L, templates: [ts], instances: [inst("ts", d(-1), "DONE")] }))).length, 0);
  const missed = plan(st(d(3), { cursor: L, templates: [ts] }));
  check("not done when its due day settles: MISSED on the due day and a DEBT", creates(missed)[0]?.status === "MISSED" && creates(missed)[0].day === d(1) && events(missed, "DEBT")[0]?.dedupeKey === debtKey("ts", d(1), 0));
  const held = plan(st(d(3), { cursor: L, templates: [ts], restRows: [restRow(d(1))] }));
  check("due on a rest day: EXCUSED, no debt", creates(held)[0]?.status === "EXCUSED" && events(held, "DEBT").length === 0);
  eq("an inbox must is never owed", kinds(plan(st(d(3), { cursor: L, templates: [tpl("stretch", { inbox: true })] }))[0]), ["cursor"]);
  eq("a PLANNED compulsory one-off is never judged", kinds(plan(st(d(3), { cursor: L, templates: [tpl("p", { recurrence: null, dueKind: "PLANNED", dueDay: d(1) })] }))[0]), ["cursor"]);
  eq("a template that starts later is not expected", kinds(plan(st(d(3), { cursor: L, templates: [tpl("stretch", { startDay: d(2) })] }))[0]), ["cursor"]);
  eq("an archived template is not expected from its archive day", kinds(plan(st(d(3), { cursor: L, templates: [tpl("stretch", { archivedDay: d(1) })] }))[0]), ["cursor"]);
  const moved = plan(st(d(3), { cursor: L, templates: [tpl("stretch")], instances: [inst("stretch", d(1), "UNDONE", { id: "u9" })] }));
  check("an UNDONE slot 0 moves to MISSED (an update, not a create) and its DEBT names it", creates(moved).length === 0 && updates(moved)[0]?.id === "u9" && updates(moved)[0].data.status === "MISSED" && events(moved, "DEBT")[0]?.sourceId === "u9");
}

console.log("— §1 the make-up day —");
{
  const mkRows: SettlementLedgerRow[] = [
    row(d(2), { id: "mk", templateId: "stretch", sourceId: "miss0", dedupeKey: `task:stretch:${L}:0:0`, xp: 3.5, rawXp: 3.5 }),
    row(d(2), { source: "UNDO", templateId: "stretch", sourceId: "miss0", dedupeKey: "undo:mk", xp: -3.5, rawXp: -3.5, countsForStreak: false }),
    row(d(2), { id: "rp", source: "DEBT_REPAID", track: "DUTY", templateId: "stretch", sourceId: "miss0", dedupeKey: `repaid:stretch:${L}:0:0`, xp: 8.3, rawXp: null, countsForStreak: false }),
    row(d(2), { source: "DEBT_REPAID", track: "DUTY", templateId: "stretch", sourceId: "miss0", dedupeKey: "unrepaid:rp", xp: -8.3, rawXp: null, countsForStreak: false }),
    row(d(2), { id: "tk", templateId: "stretch", sourceId: "tick2", dedupeKey: `task:stretch:${d(2)}:0:0`, xp: 8.3, rawXp: 8.3 }),
  ];
  const units = mkRows.reduce((s, r) => s + streakUnitsOf(r), 0);
  eq("a make-up, its undo and one other tick: the day's net streak units are 1 (active)", units, 1);
  const p = plan(
    st(d(4), {
      cursor: d(1),
      templates: [tpl("stretch")],
      instances: [inst("stretch", L, "MISSED", { id: "miss0", debtXp: 8.3, debtOpen: true }), inst("stretch", d(1), "DONE"), inst("stretch", d(2), "DONE", { id: "tick2" })],
      openDebts: [{ instanceId: "miss0", templateId: "stretch", day: L, slot: 0, debtXp: 8.3 }],
      rows: mkRows,
      days: [fact(d(2), { units })],
    })
  );
  eq("…nothing extra is planned for the make-up day", kinds(p[0]), ["cursor"]);
}

console.log("— §1 Full days and repairs —");
{
  const full = (over: Parameters<typeof fact>[1], rows: SettlementLedgerRow[] = [deed(d(1))]) => plan(st(d(3), { cursor: L, days: [fact(d(1), over)], rows }));
  const zero = full({ dayOpenQty: 0 });
  const fd = events(zero, "FULL_DAY")[0];
  check("FULL_DAY: quest met by DAY_OPEN 0", fd?.dedupeKey === fullDayKey(d(1)) && fd.sink === "NONE" && fd.qty === 1 && fd.countsForStreak === false, JSON.stringify(fd));
  eq("…its detail is the rings' line", fd?.detail, "Musts None today · Quest Nothing due · Life 1 of 1");
  eq("FULL_DAY: quest met by min(15, qty) reviews (qty 40, 15 reviews)", events(full({ dayOpenQty: 40, reviews: 15 }), "FULL_DAY").length, 1);
  eq("FULL_DAY: a small target is its own (qty 8, 8 reviews)", events(full({ dayOpenQty: 8, reviews: 8 }), "FULL_DAY").length, 1);
  eq("FULL_DAY: refused with no DAY_OPEN and 14 reviews", events(full({ reviews: 14 }), "FULL_DAY").length, 0);
  eq("FULL_DAY: with no DAY_OPEN, 15 reviews meet it", events(full({ reviews: 15 }), "FULL_DAY").length, 1);
  eq("a weigh-in alone is not a life deed (no ledger row at all)", events(full({ dayOpenQty: 0 }, []), "FULL_DAY").length, 0);
  const study = row(d(1), { sink: "NONE", xp: 0, rawXp: 0, templateId: "rev", joined: { normTitle: "review", title: "Review", band: "STANDARD", bandOverride: 0, autoMetric: "REVIEWS" } });
  eq("a study-only day is not a life deed", events(full({ dayOpenQty: 0 }, [study]), "FULL_DAY").length, 0);
  const play = row(d(1), { sink: "NONE", xp: 0, rawXp: 0, templateId: "guitar", joined: { normTitle: "guitar", title: "Guitar", band: "STANDARD", bandOverride: 0, autoMetric: null } });
  eq("a #play task is a life deed", events(full({ dayOpenQty: 0 }, [play]), "FULL_DAY").length, 1);
  const undoneDeed = [deed(d(1), { id: "dd" }), row(d(1), { source: "UNDO", dedupeKey: "undo:dd", xp: -5, rawXp: -5, countsForStreak: false })];
  eq("an undone tick is not a life deed", events(full({ dayOpenQty: 0 }, undoneDeed), "FULL_DAY").length, 0);
  const mustMissed = plan(st(d(3), { cursor: L, templates: [tpl("stretch")], days: [fact(d(1), { dayOpenQty: 0 })], rows: [deed(d(1))] }));
  eq("a missed must is no Full day", events(mustMissed, "FULL_DAY").length, 0);

  const repair = plan(st(d(5), { cursor: L, days: [fact(d(1)), fact(d(3), { dayOpenQty: 0 })], rows: [deed(d(3))] }));
  const rep = events(repair, "REPAIR");
  check("REPAIR: a Full day after a one-day break, dated d − 1", rep.length === 1 && rep[0].day === d(2) && rep[0].dedupeKey === repairKey(d(2)) && rep[0].dedupeKey === "repair:2026-10-14", JSON.stringify(rep));
  check("…written in the Full day's plan, sink NONE, countsForStreak false", planOf(repair, d(3))?.ops.some((o) => o.kind === "event" && o.input.source === "REPAIR") === true && rep[0]?.sink === "NONE" && rep[0].countsForStreak === false);
  const repairRow = row(d(2), { source: "REPAIR", sink: "NONE", track: null, xp: 0, rawXp: null, countsForStreak: false, dedupeKey: repairKey(d(2)) });
  const second = plan(st(d(10), { cursor: d(6), days: [fact(d(6)), fact(d(8), { dayOpenQty: 0 })], rows: [repairRow, deed(d(8))] }));
  check("a second repair inside 7 days is refused", events(second, "REPAIR").length === 0 && events(second, "FULL_DAY").length === 1);
  const week = plan(st(d(12), { cursor: d(8), days: [fact(d(8)), fact(d(10), { dayOpenQty: 0 })], rows: [repairRow, deed(d(10))] }));
  eq("…and allowed once the last one is 7 days back", events(week, "REPAIR").map((e) => e.day), [d(9)]);
  const restBefore = plan(st(d(5), { cursor: L, days: [fact(d(1)), fact(d(3), { dayOpenQty: 0 })], rows: [deed(d(3))], restRows: [restRow(d(2))] }));
  eq("a held day before the Full day needs no repair", events(restBefore, "REPAIR").length, 0);
  const twoDays = plan(st(d(5), { cursor: L, days: [fact(d(3), { dayOpenQty: 0 })], rows: [deed(d(3))] }));
  eq("a two-day break is not repaired", events(twoDays, "REPAIR").length, 0);
}

console.log("— §1 pending rule changes (F3 step 11) —");
{
  const unflag: PendingChange = { v: 1, next: { effectiveDay: d(7), compulsory: false } };
  const s = st(d(9), { templates: [tpl("stretch", { pendingChange: unflag })] });
  const p = plan(s);
  eq("an un-flag on day 0 still judges days 0–6 as compulsory and stops at day 7", creates(p).map((c) => c.day), span(L, d(6)));
  const hk = housekeeping(p);
  check("…applied after settling effectiveDay − 1 (day 6's plan)", hk.length === 1 && planOf(p, d(6))?.ops.includes(hk[0]) === true, JSON.stringify(hk));
  eq("…writing compulsory false and the prior segment {throughDay: effectiveDay − 1, compulsory: true}", hk[0]?.data, {
    compulsory: false,
    compulsoryOnRest: false,
    pendingChange: { v: 1, prior: [{ throughDay: d(6), compulsory: true }] },
  });
  eq("a pending change is not applied before effectiveDay − 1 is settled", housekeeping(plan(st(d(7), { templates: [tpl("stretch", { pendingChange: unflag })] }))).length, 0);
  const after = apply(s, p, d(10));
  eq("after it applies, day 7 on owes nothing", creates(plan(after)).length, 0);
  eq("a later run keeps the prior segment while its DUTY week is unjudged", housekeeping(plan(after)).length, 0);
  const judged = plan({ ...after, judgedDutyWeeks: new Set([weekKeyOf(d(6))]) });
  eq("…and drops it once the DUTY WEEK row of its week exists", housekeeping(judged).map((h) => h.data), [{ pendingChange: null }]);

  const archive: PendingChange = { v: 1, next: { effectiveDay: d(3), archive: true } };
  const arch = plan(st(d(6), { templates: [tpl("stretch", { pendingChange: archive })] }));
  eq("a pending archive yields no occurrence from its effective day", creates(arch).map((c) => c.day), [L, d(1), d(2)]);
  const ah = housekeeping(arch)[0];
  check("…and its application sets archivedDay = effectiveDay and clears the change", ah?.data.archivedDay === d(3) && ah.data.pendingChange === null && planOf(arch, d(2))?.ops.includes(ah) === true, JSON.stringify(ah));

  const onToday: PendingChange = { v: 1, prior: [{ throughDay: d(2), compulsoryOnRest: false }] };
  const r = plan(st(d(5), { cursor: d(1), templates: [tpl("meds", { compulsoryOnRest: true, pendingChange: onToday })], restRows: [restRow(d(2)), restRow(d(3))] }));
  check("'Even on rest days' turned on today does not make yesterday's (rest-day) must owed", creates(r).find((c) => c.day === d(2))?.status === "EXCUSED" && !events(r, "DEBT").some((e) => e.day === d(2)));
  check("…it binds from the day it was turned on", creates(r).find((c) => c.day === d(3))?.status === "MISSED" && events(r, "DEBT").some((e) => e.day === d(3)));
}

console.log("— §1 early settles, the 14-day cap, the DST switches —");
{
  eq("an early settle (through = yesterday) settles yesterday", plan(st(d(2), { cursor: L, through: d(1), templates: [tpl("stretch")] })).map((p) => p.day), [d(1)]);
  eq("through is never later than yesterday", plan(st(d(2), { cursor: L, through: d(9) })).map((p) => p.day), [d(1)]);
  eq("settleRange agrees", settleRange(st(d(2), { cursor: L, through: d(9) })), { from: d(1), to: d(1), floor: L });
  const many = plan(st(d(30), { templates: [] }));
  check("at most 14 days a run, oldest first", many.length === 14 && many[0].day === L && many[13].day === d(13));

  // DST began at 02:00 on Sun 4 Oct 2026 and ends at 03:00 on Sun 4 Apr 2027. Life days turn at 04:00, so the
  // short (23-hour) life day is Sat 3 Oct 2026 and the long (25-hour) one Sat 3 Apr 2027: only key arithmetic decides.
  eq("life day 2026-10-03 is 23 hours (it spans the DST start)", (dayEndOf("2026-10-03").getTime() - dayStartOf("2026-10-03").getTime()) / 3_600_000, 23);
  eq("life day 2027-04-03 is 25 hours (it spans the DST end)", (dayEndOf("2027-04-03").getTime() - dayStartOf("2027-04-03").getTime()) / 3_600_000, 25);
  const early = { dutyLaunchDay: "2026-09-28", epochDay: "2026-09-20", templates: [tpl("stretch", { startDay: "2026-09-20" })] };
  const dst = (cursor: DayKey, now: Date) => plan({ ...st(todayKey(now), { ...early, cursor }), now });
  const plus = (day: DayKey, minutes: number) => new Date(dayStartOf(day).getTime() + minutes * 60_000);
  eq("04:30 on 5 Oct settles 3 Oct (the 23-hour day)", dst("2026-10-02", plus("2026-10-05", 30)).map((p) => p.day), ["2026-10-03"]);
  eq("03:59 on 5 Oct is still 4 Oct: 3 Oct is not judged yet", dst("2026-10-02", plus("2026-10-05", -1)).length, 0);
  eq("…its debt is keyed by the day", events(dst("2026-10-02", plus("2026-10-05", 30)), "DEBT").map((e) => e.dedupeKey), ["debt:stretch:2026-10-03:0"]);
  eq("04:30 on 6 Oct (the first whole AEDT day after) settles 4 Oct", dst("2026-10-03", plus("2026-10-06", 30)).map((p) => p.day), ["2026-10-04"]);
  eq("04:30 on 5 Apr 2027 settles 3 Apr (the 25-hour day)", dst("2027-04-02", plus("2027-04-05", 30)).map((p) => p.day), ["2027-04-03"]);
  eq("03:59 on 5 Apr 2027 is still 4 Apr", dst("2027-04-02", plus("2027-04-05", -1)).length, 0);
  const restDst = plan({ ...st("2026-10-05", { ...early, cursor: "2026-10-02", restRows: [restRow("2026-10-03")] }), now: plus("2026-10-05", 30) });
  eq("a rest day declared before the 23-hour day started holds it", creates(restDst)[0]?.status, "EXCUSED");
}

console.log("— §1 every planned row —");
{
  check("plans were made in this file (the sweep is not empty)", allEvents.length > 30, String(allEvents.length));
  check("every planned event has countsForStreak false", allEvents.every((e) => e.countsForStreak === false), JSON.stringify(allEvents.filter((e) => e.countsForStreak !== false).slice(0, 2)));
  check("every planned event has a dedupe key and a day", allEvents.every((e) => !!e.dedupeKey && !!e.day));
  check("no planned event is a TRACK row except DEBT (0-XP study rows go to NONE)", allEvents.every((e) => e.source === "DEBT" || e.sink !== "TRACK"));
}

// ══ §2 the Full-day rule (F10) ════════════════════════════════════════════

console.log("— §2 fullDayOf over eight fixture days —");
{
  const X = d(1);
  const meds = tpl("meds");
  const gym = tpl("gym", { recurrence: "TARGET:3/W" });
  const walk = tpl("walk", { compulsory: false });
  const templates = [meds, gym, walk];
  const day = (instances: FullDayInstance[], reviews: number, dayOpenQty: number | null, lifeDeeds: number) =>
    fullDayOf(fullDayInputFor({ templates, instances, day: X, reviews, dayOpenQty, lifeDeeds }));
  const done: FullDayInstance[] = [{ templateId: "meds", day: X, status: "DONE" }];

  const queueClearButShort = day(done, 10, 30, 1);
  check("queue clear but short of min(15, qty): no Quest, no Full day", !queueClearButShort.full && queueClearButShort.rings[1].caption === "10 of 15");
  check("no DAY_OPEN: 14 reviews are not enough, 15 are", !day(done, 14, null, 1).full && day(done, 15, null, 1).full);
  check("a rest day: an EXCUSED must is kept", day([{ templateId: "meds", day: X, status: "EXCUSED" }], 15, null, 1).full);
  check("an MVV must: DONE_MVV is kept", day([{ templateId: "meds", day: X, status: "DONE_MVV" }], 0, 0, 1).full);
  check("a #play deed closes the Life ring", isLifeDeed({ sink: "NONE", studyLinked: false }) && day(done, 0, 0, 1).rings[2].met);
  check("a study-only day: its completion is no life deed", !isLifeDeed({ sink: "NONE", studyLinked: true }) && !day(done, 20, 20, 0).full);
  check("a weigh-in only day: no deed, no Life ring", !day(done, 0, 0, 0).rings[2].met);
  const target = mustsOfDay(templates, done, X);
  check("a TARGET must present is not in the Musts ring (meds only)", target.total === 1 && target.kept === 1, JSON.stringify(target));
  check("MADE_UP keeps no must", mustsOfDay(templates, [{ templateId: "meds", day: X, status: "MADE_UP" }], X).kept === 0);
  const oneOff = tpl("ts", { recurrence: null, dueKind: "DEADLINE", dueDay: X });
  check("a one-off done before its due day is kept", mustsOfDay([oneOff], [{ templateId: "ts", day: L, status: "DONE" }], X).kept === 1);
  check("a one-off done after its due day is not kept for that day", mustsOfDay([oneOff], [{ templateId: "ts", day: d(2), status: "DONE_LATE" }], X).kept === 0);
  const archived = tpl("meds", { pendingChange: { v: 1, next: { effectiveDay: X, archive: true } } });
  eq("a pending archive is no must from its effective day", mustsOfDay([archived], [], X).total, 0);
  eq("unknown templates count by sink", [isLifeDeed({ sink: "TRACK", studyLinked: null }), isLifeDeed({ sink: "NONE", studyLinked: null })], [true, false]);
  // Lane D's optional handoff: held days folded into the rule itself (a reader with no EXCUSED rows yet).
  const restMeds = tpl("rmeds", { compulsoryOnRest: true });
  const restMusts = [meds, restMeds];
  eq("held { rest }: a rest day's must is kept, an 'Even on rest days' must is not", mustsOfDay(restMusts, [], X, { rest: true }), { kept: 1, total: 2 });
  eq("held { freeze }: every must is kept", mustsOfDay(restMusts, [], X, { freeze: true }), { kept: 2, total: 2 });
  eq("held and an EXCUSED row for the same must count it once", mustsOfDay(restMusts, [{ templateId: "meds", day: X, status: "EXCUSED" }], X, { rest: true }), { kept: 1, total: 2 });
  eq("no held option: unchanged", mustsOfDay(restMusts, [], X), { kept: 0, total: 2 });
  check(
    "fullDayInputFor passes held through: a rest day with the quest and a deed is full when only held musts are due",
    fullDayOf(fullDayInputFor({ templates: [meds], instances: [], day: X, reviews: 0, dayOpenQty: 0, lifeDeeds: 1, held: { rest: true } })).full
  );
  eq("questRingOf: DAY_OPEN 0 is 'Nothing due'", questRingOf({ reviews: 0, target: 0 }).caption, "Nothing due");
  eq("fullDayLine", fullDayLine(day(done, 15, 40, 1)), "Musts 1 of 1 · Quest 15 of 15 · Life 1 of 1");
}

// ══ §6 the launch script's guards (pure; duty-launch.ts and the lead's duty-rehearse.ts) ══

console.log("— §6 the database guard: xtnl-idea or the rehearsal mirror, nothing else —");
{
  const REF = XTNL_IDEA_PROJECT_REF;
  eq("the xtnl-idea project ref", REF, "xvlkujmtdcpaoxdftgpl");
  const direct = `postgresql://postgres:pw-secret@db.${REF}.supabase.co:5432/postgres`;
  const pooled = `postgresql://postgres.${REF}:pw-secret@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  const session = `postgresql://postgres.${REF}:pw-secret@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`;
  const thesis = "postgresql://postgres.abcdefghijklmnopqrst:pw-secret@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";
  const mirror = `postgresql://postgres:postgres@localhost:${REHEARSAL_DB_PORT}/postgres`;
  const kinds = (env: { DATABASE_URL?: string; DIRECT_URL?: string }) => launchTargetOf(env).kind;
  eq("direct host db.<ref>.supabase.co: production", kinds({ DATABASE_URL: direct }), "production");
  eq("pooler user postgres.<ref> (transaction and session ports): production", kinds({ DATABASE_URL: pooled, DIRECT_URL: session }), "production");
  eq("localhost:55432 (and 127.0.0.1, [::1]): the rehearsal mirror", [kinds({ DATABASE_URL: mirror }), kinds({ DATABASE_URL: mirror, DIRECT_URL: `postgresql://p:p@127.0.0.1:${REHEARSAL_DB_PORT}/postgres` }), kinds({ DATABASE_URL: `postgresql://p:p@[::1]:${REHEARSAL_DB_PORT}/postgres` })], ["rehearsal", "rehearsal", "rehearsal"]);
  const other = launchTargetOf({ DATABASE_URL: thesis });
  check("another Supabase project (XTNL_thesis, say): refused, naming its ref", other.kind === "refused" && other.ref === "abcdefghijklmnopqrst" && other.problems.some((p) => p.includes("not the xtnl-idea project")), JSON.stringify(other));
  eq("a local database on another port: refused", kinds({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres" }), "refused");
  const mixed = launchTargetOf({ DATABASE_URL: pooled, DIRECT_URL: mirror });
  check("DATABASE_URL and DIRECT_URL on different databases: refused", mixed.kind === "refused" && mixed.problems.some((p) => p.includes("different databases")), JSON.stringify(mixed.problems));
  eq("the xtnl-idea pooler with a DIRECT_URL on another project: refused", kinds({ DATABASE_URL: pooled, DIRECT_URL: thesis }), "refused");
  eq("no DATABASE_URL, an unreadable one, an unknown host: refused", [kinds({}), kinds({ DATABASE_URL: "not a url" }), kinds({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/x" })], ["refused", "refused", "refused"]);
  check("a ref in the host and a different one in the user is refused", kinds({ DATABASE_URL: `postgresql://postgres.abcdefghijklmnopqrst:p@db.${REF}.supabase.co:5432/postgres` }) === "refused");
  check("the label names hosts and the ref, never a password", [direct, pooled, thesis, mirror].every((u) => !JSON.stringify(launchTargetOf({ DATABASE_URL: u })).includes("pw-secret")) && launchTargetOf({ DATABASE_URL: pooled }).label.includes(REF));

  const overrides = { XTNL_DUTY_LAUNCH_DAY: "2026-10-19", XTNL_LIFE_LAUNCH_DAY: "2026-10-05" };
  eq("on the rehearsal mirror the XTNL_ overrides are honoured", launchDaysFor({ kind: "rehearsal" }, overrides), { duty: "2026-10-19", life: "2026-10-05", ignored: [] });
  const prodDays = launchDaysFor({ kind: "production" }, overrides);
  check(
    "against xtnl-idea the code constants decide and each override is reported as ignored",
    prodDays.duty === DUTY_LAUNCH_DAY && prodDays.life === LIFE_LAUNCH_DAY && prodDays.ignored.length === 2 && prodDays.ignored.every((l) => l.includes("ignored")),
    JSON.stringify(prodDays)
  );
  eq("…and with no override nothing is reported", launchDaysFor({ kind: "production" }, {}).ignored, []);
  eq("an unknown target uses the constants too", launchDaysFor({ kind: "refused" }, overrides).duty, DUTY_LAUNCH_DAY);

  // Review blocker: --apply never before firstDutyDay + 1 (Thu 8 Oct would lock nothing now, but the cursor would sit ahead of lived days).
  check("--apply on Thu 8 Oct for a Mon 12 Oct launch: refused, naming Tue 13 Oct", launchApplyTooEarly("2026-10-08", L)?.includes("2026-10-13") === true);
  check("…on the launch Monday itself: refused", launchApplyTooEarly(L, L) != null);
  eq("…from firstDutyDay + 1 on: allowed (later is harmless: settlement catches up)", [launchApplyTooEarly(d(1), L), launchApplyTooEarly(d(9), L)], [null, null]);
  const resetFirst = "2026-10-20";
  check("after a reset, firstDutyDay = epoch: refused until epoch + 1", launchApplyTooEarly(resetFirst, resetFirst) != null && launchApplyTooEarly(addDays(resetFirst, 1), resetFirst) == null);
}

// ══ §3–§5 the executor, the chain and the cron (stub client; the real one throws) ══

/** A recording stand-in for the Prisma client: rows in memory, reads answered, $transaction arrays checked and applied. */
interface Desc {
  __op: string;
  args: unknown;
}
interface FakeInstance {
  id: string;
  templateId: string;
  day: Date;
  slot: number;
  status: string;
  source: string;
  debtXp: number;
  debtOpen: boolean;
  repaired: boolean;
  [k: string]: unknown;
}
type FakeEvent = ReturnType<typeof Object> & { id: string; day: Date; source: string; sink: string; countsForStreak: boolean; dedupeKey: string | null; templateId: string | null; [k: string]: unknown };

const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`userId`,`dedupeKey`)", { code: "P2002", clientVersion: "test" });
const guardFailure = () => new Error("Invalid `prisma.$executeRaw()` invocation: Raw query failed. Code: `22012`. Message: `ERROR: division by zero`");

class FakeDb {
  settings: { epochDay: Date; settledThroughDay: Date | null } | null;
  templates: Record<string, unknown>[] = [];
  instances: FakeInstance[] = [];
  events: FakeEvent[] = [];
  rest: { day: Date; kind: string; declaredAt: Date; cancelledAt: Date | null }[] = [];
  reads: string[] = [];
  built: string[] = [];
  transactions: Desc[][] = [];
  /** The next settings read returns this cursor (a stale read), once. */
  staleCursor: DayKey | null | undefined = undefined;
  /** Fail the next n transactions this way. */
  fail: { kind: "guard" | "p2002"; times: number } | null = null;
  throwOnRead = false;
  /** Runs as a transaction arrives, before its guard: another writer landing between the read and the write. */
  onTransaction: (() => void) | null = null;
  private seq = 0;

  constructor(cursor: DayKey | null, templates: SettlementTemplate[] = [], epoch: DayKey = EPOCH) {
    this.settings = { epochDay: dateColumn(epoch), settledThroughDay: cursor ? dateColumn(cursor) : null };
    this.templates = templates.map((t) => ({
      ...t,
      startDay: dateColumn(t.startDay),
      dueDay: t.dueDay ? dateColumn(t.dueDay) : null,
      archivedAt: t.archivedDay ? dayStartOf(t.archivedDay) : null,
      pendingChange: t.pendingChange ?? null,
    }));
  }

  get cursor(): DayKey | null {
    return this.settings?.settledThroughDay ? keyOfDateColumn(this.settings.settledThroughDay) : null;
  }

  private read(name: string) {
    if (this.throwOnRead) throw new Error("database unreachable");
    this.reads.push(name);
  }

  private desc(op: string, args: unknown): Desc {
    this.built.push(op);
    return { __op: op, args };
  }

  get writes(): number {
    return this.built.length + this.transactions.length;
  }

  private freezeCount(): number {
    return this.events.filter((e) => e.source === "FREEZE_EARN" || e.source === "FREEZE_USE").length;
  }

  private dbg(): unknown[] {
    return this.events.map((e) => ({
      ...e,
      tplId: null,
      tplNormTitle: null,
      tplTitle: null,
      tplBand: null,
      tplBandOverride: null,
      tplAutoMetric: null,
    }));
  }

  /** The guard statement, evaluated against the rows in memory (what Postgres would answer). */
  guardHolds(g: SettleGuard): boolean {
    if (!this.settings || this.cursor !== g.cursor || keyOfDateColumn(this.settings.epochDay) !== g.epochDay) return false;
    if (this.freezeCount() !== g.freezeRows) return false;
    if (g.fresh) {
      const f = g.fresh;
      const inside = (x: Date) => keyOfDateColumn(x) >= f.from && keyOfDateColumn(x) <= f.to;
      if (this.events.filter((e) => inside(e.day)).length !== f.events) return false;
      if (this.instances.filter((i) => inside(i.day)).length !== f.instances) return false;
      if (this.rest.filter((r) => inside(r.day) && r.cancelledAt == null).length !== f.rest) return false;
    }
    if (!g.undone.every((id) => this.instances.some((i) => i.id === id && i.status === "UNDONE"))) return false;
    if (this.instances.some((i) => g.oneOffs.includes(i.templateId) && ["DONE", "DONE_LATE", "DONE_MVV"].includes(i.status))) return false;
    return true;
  }

  private facts(): unknown[] {
    const by = new Map<string, { day: Date; n: number; units: number; reviews: number; ideas: number; dayOpens: number; dayOpenQty: number | null }>();
    for (const e of this.events) {
      const k = keyOfDateColumn(e.day);
      const f = by.get(k) ?? { day: e.day, n: 0, units: 0, reviews: 0, ideas: 0, dayOpens: 0, dayOpenQty: null };
      f.n += 1;
      f.units += e.countsForStreak ? 1 : e.source === "UNDO" ? -1 : 0;
      if (e.source === "REVIEW") f.reviews += 1;
      if (e.source === "IDEA_CREATE") f.ideas += 1;
      if (e.source === "DAY_OPEN") {
        f.dayOpens += 1;
        f.dayOpenQty = Number(e.qty ?? 0);
      }
      by.set(k, f);
    }
    return [...by.values()];
  }

  client(): SettlementClient {
    const db = this as FakeDb;
    const c = {
      lifeSettings: {
        findUnique: async () => {
          db.read("lifeSettings.findUnique");
          if (!db.settings) return null;
          if (db.staleCursor !== undefined) {
            const stale = db.staleCursor;
            db.staleCursor = undefined;
            return { ...db.settings, settledThroughDay: stale ? dateColumn(stale) : null };
          }
          return { ...db.settings };
        },
        update: (args: unknown) => db.desc("lifeSettings.update", args),
      },
      taskTemplate: {
        findMany: async () => {
          db.read("taskTemplate.findMany");
          return db.templates.map((t) => ({ ...t }));
        },
        updateMany: (args: unknown) => db.desc("taskTemplate.updateMany", args),
      },
      taskInstance: {
        findMany: async (args: { where: { debtOpen?: boolean } }) => {
          db.read("taskInstance.findMany");
          const list = args.where.debtOpen ? db.instances.filter((i) => i.debtOpen) : db.instances;
          return list.map((i) => ({ ...i }));
        },
        createMany: (args: unknown) => db.desc("taskInstance.createMany", args),
        updateMany: (args: unknown) => db.desc("taskInstance.updateMany", args),
      },
      activityEvent: {
        groupBy: async () => {
          db.read("activityEvent.groupBy");
          const out: unknown[] = [];
          for (const source of ["FREEZE_EARN", "FREEZE_USE"]) {
            const rows = db.events.filter((e) => e.source === source);
            if (rows.length) out.push({ source, _count: { _all: rows.length }, _max: { day: rows.map((r) => r.day).sort((a, b) => b.getTime() - a.getTime())[0] } });
          }
          return out;
        },
        findMany: async () => {
          db.read("activityEvent.findMany");
          return [];
        },
        createMany: (args: unknown) => db.desc("activityEvent.createMany", args),
      },
      restDay: {
        findMany: async () => {
          db.read("restDay.findMany");
          return db.rest.map((r) => ({ ...r }));
        },
      },
      $queryRaw: async (sql: Prisma.Sql) => {
        db.read("$queryRaw");
        const text = sql.strings.join("?");
        if (text.includes('LEFT JOIN "TaskTemplate"')) return db.dbg();
        if (text.includes("HAVING")) return [{ n: 0 }];
        return db.facts();
      },
      $executeRaw: (sql: Prisma.Sql) => db.desc("$executeRaw", sql),
      $transaction: async (list: Desc[]) => {
        db.transactions.push(list);
        const hook = db.onTransaction;
        db.onTransaction = null;
        hook?.();
        if (db.fail && db.fail.times > 0) {
          db.fail.times -= 1;
          throw db.fail.kind === "guard" ? guardFailure() : p2002();
        }
        const guard = guardOfSql(list[1].args);
        if (!guard || !db.guardHolds(guard)) throw guardFailure();
        const saved = { settings: db.settings && { ...db.settings }, instances: db.instances.map((i) => ({ ...i })), events: [...db.events] };
        try {
          for (const op of list.slice(2)) db.apply(op);
        } catch (err) {
          Object.assign(db, saved);
          throw err;
        }
        return list.map(() => 1);
      },
    };
    return c as unknown as SettlementClient;
  }

  private apply(op: Desc): void {
    const a = op.args as { where?: Record<string, unknown>; data: unknown };
    if (op.__op === "lifeSettings.update") {
      this.settings!.settledThroughDay = (a.data as { settledThroughDay: Date }).settledThroughDay;
    } else if (op.__op === "taskInstance.createMany") {
      for (const x of a.data as FakeInstance[]) {
        if (this.instances.some((i) => i.templateId === x.templateId && i.day.getTime() === x.day.getTime() && i.slot === x.slot)) throw p2002();
        this.instances.push({ ...x });
      }
    } else if (op.__op === "taskInstance.updateMany") {
      const where = a.where!.id as string | { in: string[] };
      const ids = typeof where === "string" ? [where] : where.in;
      for (const i of this.instances) if (ids.includes(i.id) && i.status === "UNDONE") Object.assign(i, a.data);
    } else if (op.__op === "activityEvent.createMany") {
      for (const e of a.data as FakeEvent[]) {
        if (e.dedupeKey && this.events.some((x) => x.dedupeKey === e.dedupeKey)) throw p2002();
        this.seq += 1;
        this.events.push({ ...e, id: `ev${this.seq}` });
      }
    } else if (op.__op === "taskTemplate.updateMany") {
      // Prisma's Json equals: the row must still hold the pendingChange the run read, or nothing is updated.
      const jsonOf = (v: unknown) => JSON.stringify(v === Prisma.DbNull || v === undefined ? null : v);
      const want = (a.where!.pendingChange as { equals: unknown }).equals;
      const t = this.templates.find((x) => x.id === a.where!.id && jsonOf(x.pendingChange) === jsonOf(want));
      if (t) {
        const data = a.data as Record<string, unknown>;
        Object.assign(t, data, { pendingChange: data.pendingChange === Prisma.DbNull ? null : data.pendingChange });
      }
    }
  }
}

/** Every Prisma entry settlement could reach on the app's real client, swapped for a spy that records and throws. */
const db = prisma as unknown as Record<string, unknown>;
const ENTRIES = [
  "$transaction",
  "$executeRaw",
  "$queryRaw",
  "lifeSettings",
  "taskTemplate",
  "taskInstance",
  "activityEvent",
  "restDay",
  "masteryLedgerEntry",
  // Roadmap (F16 seam 8): the roadmap step's real writers would read these; every call here injects them.
  "roadmap",
  "roadmapRun",
  "roadmapMilestone",
  "roadmapItem",
  "roadmapMeasure",
  "roadmapReading",
  "roadmapAcceptance",
  "roadmapQuestWeek",
] as const;
const savedEntries = ENTRIES.map((k) => [k, db[k]] as const);
const touchedReal: string[] = [];
function spyOnRealClient() {
  const spy = (name: string) => () => {
    touchedReal.push(name);
    throw new Error(`the real database was reached: ${name}`);
  };
  for (const k of ENTRIES) db[k] = k.startsWith("$") ? spy(k) : new Proxy({}, { get: (_t, m) => spy(`${k}.${String(m)}`) });
}
function restoreRealClient() {
  for (const [k, v] of savedEntries) db[k] = v;
}

const WRITE_ENV: SettleEnv = { XTNL_LIFE_JUDGE: "1", XTNL_DUTY_LAUNCH_DAY: L };
const DEV_ENV: SettleEnv = { NODE_ENV: "development", XTNL_DUTY_LAUNCH_DAY: L };
const USER = "u-settle-check";

/** The roadmap step's writers, quiet: every chain and cron call injects them, so the real ones never run here. */
const NO_ROADMAP: RoadmapStepDeps = {
  freeze: async () => ({ froze: 0, skipped: null }),
  readings: async () => ({ written: 0, reaches: 0, skipped: null }),
  finalize: async () => ({ finalized: 0, skipped: null }),
};

type RoadmapPart = "freeze" | "readings" | "finalize";

/**
 * Roadmap writers that record each call in `order` ('freeze:<source>', 'readings:<caller>',
 * 'finalize'), with the env and instant they were handed; `fail` makes that part throw.
 * `returned` makes those parts return their failure as `error` (with nothing written), as the
 * real writers do: they never throw (roadmap-types ReadingsRun / QuestFreezeRun / QuestFinalizeRun).
 */
function roadmapRecorder(order: string[], fail?: RoadmapPart, returned: readonly RoadmapPart[] = []) {
  const envs: unknown[] = [];
  const instants: number[] = [];
  const seen = (what: string, env: unknown, now: Date) => {
    order.push(what);
    envs.push(env);
    instants.push(now.getTime());
  };
  const gone = (part: RoadmapPart) => (returned.includes(part) ? { error: `${part} caught` } : {});
  const deps: RoadmapStepDeps = {
    freeze: async (_u, now, source, o) => {
      seen(`freeze:${source}`, o.env, now);
      if (fail === "freeze") throw new Error("freeze boom");
      return returned.includes("freeze") ? { froze: 0, skipped: null, ...gone("freeze") } : { froze: 1, skipped: null };
    },
    readings: async (_u, now, o) => {
      seen(`readings:${o.caller}`, o.env, now);
      if (fail === "readings") throw new Error("readings boom");
      return returned.includes("readings") ? { written: 0, reaches: 0, skipped: null, ...gone("readings") } : { written: 2, reaches: 0, skipped: null };
    },
    finalize: async (_u, now, o) => {
      seen("finalize", o.env, now);
      if (fail === "finalize") throw new Error("finalize boom");
      return returned.includes("finalize") ? { finalized: 0, skipped: null, ...gone("finalize") } : { finalized: 1, skipped: null };
    },
  };
  return { deps, envs, instants };
}

/** Runs f with console.error held (the expected failures log), restoring it after. */
async function quietly<T>(f: () => Promise<T>): Promise<T> {
  const err = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = err;
  }
}

async function executor(): Promise<void> {
  console.log("— §3 chunk grouping and statement count —");
  {
    const p = plan(st(d(9), { templates: [tpl("stretch", { pendingChange: { v: 1, next: { effectiveDay: d(7), compulsory: false } } })] }));
    const g1 = groupChunk(p.slice(0, 7));
    eq("a chunk of 7 days: one createMany, one events createMany, one template update, the cursor", chunkStatementLabels(g1), ["lock", "guard", "instances.createMany", "events.createMany", "template.update:stretch", "cursor"]);
    check("…grouping keeps every op: 7 creates, 3 DEBT rows, cursor at day 6", g1.creates.length === 7 && g1.events.length === 3 && g1.cursor === d(6) && g1.freezeRows === 0);
    eq("a quiet chunk (nothing owed) is 3 statements", chunkStatementLabels(groupChunk(plan(st(d(3), { cursor: L })))), ["lock", "guard", "cursor"]);
    const withFreeze = groupChunk(plan(st(d(8), { days: activeOn(...span(L, d(6))) })));
    eq("FREEZE_* rows are counted for the next chunk's guard", withFreeze.freezeRows, 1);
    const full: SettleGuard = { cursor: L, epochDay: EPOCH, freezeRows: 2, fresh: { from: d(1), to: d(2), events: 4, instances: 3, rest: 1 }, undone: ["u1", "u2"], oneOffs: ["ts"] };
    const guard = settleGuardSql(USER, full);
    const text = guard.strings.join("?");
    check(
      "the guard: cursor and epoch (settledFor's inputs), the FREEZE_* count, the fresh days' rows, the UNDONE instances, the charged one-offs",
      /"settledThroughDay" IS NOT DISTINCT FROM \?::date AND "epochDay" = \?::date/.test(text) &&
        /COALESCE\(/.test(text) &&
        /'FREEZE_EARN', 'FREEZE_USE'/.test(text) &&
        /FROM "ActivityEvent" WHERE "userId" = \? AND "day" >= \?::date AND "day" <= \?::date\)/.test(text) &&
        /FROM "TaskInstance" WHERE "userId" = \? AND "day" >= /.test(text) &&
        /FROM "RestDay" WHERE .*"cancelledAt" IS NULL/.test(text) &&
        /'UNDONE'/.test(text) &&
        /NOT EXISTS \(SELECT 1 FROM "TaskInstance" WHERE .*"templateId" IN \(.*'DONE', 'DONE_LATE', 'DONE_MVV'/.test(text) &&
        /SELECT 1 \/ \(CASE WHEN/.test(text),
      text
    );
    eq("…its first values: cursor, epoch, user, user, freeze rows", guard.values.slice(0, 5), [L, EPOCH, USER, USER, 2]);
    check("…and guardOfSql hands the checks the guard it was built from", guardOfSql(guard) === full && guardOfSql(Prisma.sql`SELECT 1`) === null);
    const bare = settleGuardSql(USER, { cursor: L, epochDay: EPOCH, freezeRows: 0, fresh: null, undone: [], oneOffs: [] }).strings.join("?");
    check("…with no fresh day, no moved instance and no charged one-off it is the cursor, epoch and freeze clauses only", !/"day" >=/.test(bare) && !/'UNDONE'/.test(bare) && !/NOT EXISTS/.test(bare));

    // Which days are fresh: today − 2 always (a straddling 'record yesterday'), yesterday on an early settle.
    const lateRead = { state: st(d(4), { cursor: L, instances: [inst("x", d(2), "DONE")], restRows: [restRow(d(2)), restRow(d(1), "REST", undefined, new Date())] }), dayRows: new Map([[d(1), 5], [d(2), 3]]) };
    const lateChunk = plan(lateRead.state);
    const lg = chunkGuardOf(lateRead, lateChunk, groupChunk(lateChunk), { cursor: L, freezeRows: 0, today: d(4) });
    eq("a normal settle (d + 2): only today − 2 is fresh, with its rows, instances and live rest rows", lg.fresh, { from: d(2), to: d(2), events: 3, instances: 1, rest: 1 });
    const oldChunk = plan(st(d(9), { cursor: L }));
    eq("…a chunk wholly before today − 2 has no fresh day", chunkGuardOf({ state: st(d(9), { cursor: L }), dayRows: new Map() }, oldChunk.slice(0, 3), groupChunk(oldChunk.slice(0, 3)), { cursor: L, freezeRows: 0, today: d(9) }).fresh, null);
    const earlyState = st(d(3), { cursor: L, through: d(2) });
    const earlyChunk = plan(earlyState);
    eq(
      "an early settle: today − 2 and yesterday are fresh (all their rows counted)",
      chunkGuardOf({ state: earlyState, dayRows: new Map([[L, 9], [d(1), 2], [d(2), 7]]) }, earlyChunk, groupChunk(earlyChunk), { cursor: L, freezeRows: 0, today: d(3) }).fresh,
      { from: d(1), to: d(2), events: 9, instances: 0, rest: 0 }
    );

    // Charged one-offs: MISSED creates and MISSED moves of templates with no recurrence; an EXCUSED one-off or a recurring miss is not one.
    const ts = tpl("ts", { recurrence: null, dueKind: "DEADLINE", dueDay: d(1) });
    const tu = tpl("tu", { recurrence: null, dueKind: "DEADLINE", dueDay: d(1) });
    const tr = tpl("tr", { recurrence: null, dueKind: "DEADLINE", dueDay: d(1) });
    const oneOffState = st(d(3), { cursor: L, templates: [ts, tu, tr, tpl("stretch")], instances: [inst("tu", d(1), "UNDONE", { id: "u-tu" })], restRows: [] });
    const charged = plan(oneOffState);
    eq("chargedOneOffsOf: the one-offs a chunk marks MISSED (created or moved), not a recurring miss", chargedOneOffsOf(groupChunk(charged), oneOffState), ["tr", "ts", "tu"]);
    eq("…an EXCUSED one-off (a rest day) is not charged", chargedOneOffsOf(groupChunk(plan({ ...oneOffState, restRows: [restRow(d(1))] })), oneOffState), []);

    // Moved instances are batched by identical data (the spec's one UPDATE … FROM (VALUES), typed).
    const moved = plan(
      st(d(3), {
        cursor: L,
        templates: [tpl("a1"), tpl("a2"), tpl("b1", { band: "INTRO" }), tpl("w", { compulsory: false })],
        instances: ["a1", "a2", "b1", "w"].map((id) => inst(id, d(1), "UNDONE", { id: `u-${id}` })),
        restRows: [],
      })
    );
    const batches = updateBatchesOf(groupChunk(moved).updates);
    eq("…two misses at 8.3 share one updateMany, the 4.2 miss its own", batches.map((b) => [b.ids, b.data.status, b.data.debtXp]), [
      [["u-a1", "u-a2"], "MISSED", 8.3],
      [["u-b1"], "MISSED", 4.2],
    ]);
    eq("…and the statement labels follow the batches", chunkStatementLabels(groupChunk(moved)).filter((l) => l.startsWith("instances.updateMany")), ["instances.updateMany:u-a1,u-a2", "instances.updateMany:u-b1"]);
  }

  console.log("— §3 writes, re-runs and the cursor guard —");
  {
    const fake = new FakeDb(d(-1), [tpl("stretch")]);
    const r = await settleLifeDays(USER, at(d(10)), { env: WRITE_ENV, client: fake.client() });
    check("a 9-day catch-up writes in two chunks (7 + 2), oldest first", r.wrote && fake.transactions.length === 2 && r.cursorAfter === d(8) && fake.cursor === d(8), JSON.stringify({ r: { ...r, plans: r.plans.length }, tx: fake.transactions.length }));
    eq("…each chunk opens with the lock and the guard, and ends with the cursor", fake.transactions.map((t) => [t[0].__op, t[1].__op, t[t.length - 1].__op]), [
      ["$executeRaw", "$executeRaw", "lifeSettings.update"],
      ["$executeRaw", "$executeRaw", "lifeSettings.update"],
    ]);
    eq("…5 statements then 4 (no rows owed past the cap of 3 open debts)", fake.transactions.map((t) => t.length), [5, 4]);
    check("…the lock is the completion paths' 'life-complete:<user>'", (fake.transactions[0][0].args as Prisma.Sql).values.includes(`life-complete:${USER}`));
    eq("…the rows written: 9 instances, 3 DEBT rows", [fake.instances.length, fake.events.filter((e) => e.source === "DEBT").length], [9, 3]);
    const again = await settleLifeDays(USER, at(d(10)), { env: WRITE_ENV, client: fake.client() });
    check("settling twice writes 0 rows (no transaction at all)", !again.wrote && fake.transactions.length === 2 && fake.instances.length === 9 && again.plans.length === 0);

    const quiet = new FakeDb(L);
    quiet.staleCursor = d(-1);
    const dup = await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: quiet.client() });
    check(
      "a duplicate run on a quiet day (no keyed rows, only the cursor) is stopped by the cursor guard",
      quiet.transactions.length === 1 && quiet.transactions[0].length === 3 && !dup.wrote && quiet.cursor === L && quiet.events.length === 0,
      JSON.stringify({ tx: quiet.transactions.map((t) => t.map((x) => x.__op)), dup: { ...dup, plans: dup.plans.length } })
    );
    check("…it re-read and found nothing left to do", dup.cursorBefore === d(-1) && dup.cursorAfter === L && dup.refused === null);

    const raced = new FakeDb(d(-1), [tpl("stretch")]);
    raced.fail = { kind: "p2002", times: 1 };
    const won = await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: raced.client() });
    check("a unique violation (another run won) re-reads and re-plans", won.wrote && raced.transactions.length === 2 && raced.cursor === L && raced.events.length === 1);
    const busy = new FakeDb(d(-1), [tpl("stretch")]);
    busy.fail = { kind: "guard", times: 5 };
    const gave = await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: busy.client() });
    check("the guard failing every time gives up after 3 tries, having written nothing", !gave.wrote && busy.transactions.length === 3 && busy.cursor === d(-1) && !!gave.refused);

    const early = new FakeDb(L, [tpl("stretch")]);
    const e = await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: early.client(), early: true });
    const g = guardOfSql(early.transactions[0]?.[1]?.args);
    check("an early settle settles yesterday", e.wrote && early.cursor === d(1));
    eq("…with yesterday's rows, instances and rest rows in its guard (the fresh day)", g?.fresh, { from: d(1), to: d(1), events: 0, instances: 0, rest: 0 });
  }

  console.log("— §3 races: a late tick, a straddling record, a reset (decision 18, review F5) —");
  {
    // Decision 18, one path only. The tick commits first (it took the life-complete lock first): settlement's
    // read is older, so its guard's one-off clause fails and the re-plan sees the done instance.
    const due = tpl("ts", { recurrence: null, dueKind: "DEADLINE", dueDay: L });
    const plain = new FakeDb(d(-1), [due]);
    await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: plain.client() });
    check(
      "a compulsory one-off not done when its due day settles: MISSED on that day with its DEBT (the control)",
      plain.instances.some((i) => i.templateId === "ts" && i.status === "MISSED" && i.debtOpen) && plain.events.filter((x) => x.source === "DEBT").length === 1
    );
    const raced = new FakeDb(d(-1), [due]);
    raced.onTransaction = () => {
      raced.instances.push({ id: "late", templateId: "ts", day: dateColumn(d(2)), slot: 0, status: "DONE_LATE", source: "manual", debtXp: 0, debtOpen: false, repaired: false });
    };
    const r = await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: raced.client() });
    check(
      "a late tick landing between settlement's read and write: the guard fails and the re-plan charges nothing (paid ×0.85 once, never also owed)",
      r.wrote && raced.transactions.length === 2 && raced.events.every((x) => x.source !== "DEBT") && raced.instances.every((i) => i.status !== "MISSED") && raced.cursor === L,
      JSON.stringify({ tx: raced.transactions.length, events: raced.events.map((x) => x.source), instances: raced.instances.map((i) => i.status) })
    );
    eq("…the first attempt's guard named the one-off", guardOfSql(raced.transactions[0][1].args)?.oneOffs, ["ts"]);

    // A 'record yesterday' that straddled 04:00 lands on today − 2 after the read: the day is re-planned.
    const ev = (id: string, day: DayKey, over: Partial<FakeEvent> = {}): FakeEvent =>
      ({ id, day: dateColumn(day), source: "TASK", sink: "TRACK", countsForStreak: true, dedupeKey: null, templateId: null, ...over }) as FakeEvent;
    const straddle = new FakeDb(d(-1), [tpl("stretch")]);
    straddle.events.push(ev("fe", d(-5), { source: "FREEZE_EARN", sink: "NONE", countsForStreak: false, dedupeKey: freezeEarnKey(d(-5)) }));
    straddle.onTransaction = () => {
      straddle.instances.push({ id: "rec", templateId: "stretch", day: dateColumn(L), slot: 0, status: "DONE", source: "record-yesterday", debtXp: 0, debtOpen: false, repaired: false });
      straddle.events.push(ev("rec-ev", L, { templateId: "stretch", dedupeKey: `task:stretch:${L}:0:0` }));
    };
    const sr = await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: straddle.client() });
    check(
      "a straddling record of today − 2 after the read: the guard fails, and the re-plan spends no freeze on a day that is now active",
      sr.wrote && straddle.transactions.length === 2 && straddle.events.every((x) => x.source !== "FREEZE_USE") && straddle.instances.every((i) => i.status !== "EXCUSED") && straddle.cursor === L,
      JSON.stringify({ tx: straddle.transactions.length, events: straddle.events.map((x) => x.source) })
    );
    const staleWrite = straddle.transactions[0].find((x) => x.__op === "activityEvent.createMany")?.args as { data: { source: string }[] } | undefined;
    check(
      "…the first attempt had planned the spend from the stale read, under a guard on today − 2's counts",
      !!staleWrite?.data.some((x) => x.source === "FREEZE_USE") &&
        JSON.stringify(guardOfSql(straddle.transactions[0][1].args)?.fresh) === JSON.stringify({ from: L, to: L, events: 0, instances: 0, rest: 0 })
    );

    const older = new FakeDb(d(-1), [tpl("walk", { compulsory: false })]);
    older.onTransaction = () => {
      older.events.push(ev("old", d(-3)));
    };
    await settleLifeDays(USER, at(d(3)), { env: WRITE_ENV, client: older.client() });
    check("a write dated before today − 2 does not touch the guard (no retry for days no request can reach)", older.transactions.length === 1 && older.cursor === d(1));

    const reset = new FakeDb(d(-1), [tpl("stretch")]);
    reset.onTransaction = () => {
      // A 'life' reset and a capture on the launch day: a new row, epoch L, cursor L − 1 (the same cursor value).
      reset.settings = { epochDay: dateColumn(L), settledThroughDay: dateColumn(d(-1)) };
    };
    await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: reset.client() });
    const firstGuard = guardOfSql(reset.transactions[0][1].args);
    check(
      "a reset between the read and the write (a new epoch, the same cursor value) fails the guard's epoch clause and re-plans",
      reset.transactions.length === 2 && firstGuard?.epochDay === EPOCH && guardOfSql(reset.transactions[1][1].args)?.epochDay === L && reset.cursor === L
    );
  }

  console.log("— §3 the caches are dropped after a commit, and only then —");
  {
    let loads = 0;
    const probe = () => cached("settle-check:probe", ["life"], async () => ++loads);
    await probe();
    const fake = new FakeDb(d(-1), [tpl("stretch")]);
    await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: fake.client() });
    await probe();
    eq("a committed chunk drops the 'life' cache (the judge's DUTY gate reads the new cursor)", loads, 2);
    await settleLifeDays(USER, at(d(2)), { env: WRITE_ENV, client: fake.client() });
    await settleLifeDays(USER, at(d(3)), { env: DEV_ENV, client: new FakeDb(d(-1), [tpl("stretch")]).client() });
    await probe();
    eq("…a run that commits nothing (caught up, or writes off) drops nothing", loads, 2);
  }

  console.log("— §3 a rule change taking effect —");
  {
    const unflag: PendingChange = { v: 1, next: { effectiveDay: d(7), compulsory: false } };
    const fake = new FakeDb(d(-1), [tpl("stretch", { pendingChange: unflag })]);
    await settleLifeDays(USER, at(d(10)), { env: WRITE_ENV, client: fake.client() });
    const upd = fake.transactions[0].find((x) => x.__op === "taskTemplate.updateMany");
    const where = (upd?.args as { where: { pendingChange: { equals: unknown } } } | undefined)?.where;
    check("the template update is guarded by the pendingChange the run read", JSON.stringify(where?.pendingChange.equals) === JSON.stringify(unflag));
    const t = fake.templates[0] as { compulsory: boolean; pendingChange: unknown; pendingChangeAt: unknown };
    check(
      "…and writes compulsory false, the prior segment, and pendingChangeAt null",
      t.compulsory === false && JSON.stringify(t.pendingChange) === JSON.stringify({ v: 1, prior: [{ throughDay: d(6), compulsory: true }] }) && t.pendingChangeAt === null,
      JSON.stringify(t)
    );
    const raced = new FakeDb(d(-1), [tpl("stretch", { pendingChange: unflag })]);
    raced.onTransaction = () => {
      (raced.templates[0] as { pendingChange: unknown }).pendingChange = null;
    };
    const r = await settleLifeDays(USER, at(d(10)), { env: WRITE_ENV, client: raced.client() });
    check("a cancel landing between the read and the write wins: the template is left as the user set it", r.wrote && (raced.templates[0] as { compulsory: boolean }).compulsory === true && raced.cursor === d(8));

    const pre = new FakeDb(null, [tpl("stretch")]);
    const read = await readSettlementState(pre.client(), USER, at(d(3)), { launchDay: L, cursor: d(-1) });
    check("the launch script's dry run plans with a cursor it has not written yet", read?.state.cursor === d(-1) && planSettlement(read.state).map((p) => p.day).join() === [L, d(1)].join() && pre.writes === 0);
  }

  console.log("— §3 the gates (shared database) —");
  {
    const dev = new FakeDb(d(-1), [tpl("stretch")]);
    const r = await settleLifeDays(USER, at(d(3)), { env: DEV_ENV, client: dev.client() });
    check("NODE_ENV development, no XTNL_LIFE_JUDGE: settleLifeDays plans …", r.plans.length === 2 && r.plans.every((p) => p.ops.length > 0));
    check("…but issues no write (no statement built, no transaction)", dev.writes === 0 && !r.wrote && r.refused === WRITES_OFF_REFUSAL, JSON.stringify(dev.built));
    const dry = new FakeDb(d(-1), [tpl("stretch")]);
    const dr = await settleLifeDays(USER, at(d(3)), { env: WRITE_ENV, client: dry.client(), dryRun: true });
    check("a dry run plans and writes nothing even where writes are on", dr.plans.length === 2 && dry.writes === 0 && dr.refused === null);
    const forced = new FakeDb(d(-1), [tpl("stretch")]);
    const fr = await settleLifeDays(USER, at(d(3)), { env: DEV_ENV, client: forced.client(), force: true });
    check("force writes where writes are off (the launch and rehearsal scripts only)", fr.wrote && forced.cursor === d(1));
    eq(
      "settlementWritesEnabled: Production and the rehearsal flag write; a Vercel Preview or development build never does",
      [
        settlementWritesEnabled({ NODE_ENV: "production" }),
        settlementWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "production" }),
        settlementWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
        settlementWritesEnabled({ NODE_ENV: "production", VERCEL_ENV: "development" }),
        settlementWritesEnabled({ XTNL_LIFE_JUDGE: "1" }),
        settlementWritesEnabled({ XTNL_LIFE_JUDGE: "1", VERCEL_ENV: "development" }),
        settlementWritesEnabled({ NODE_ENV: "development" }),
      ],
      [true, true, false, false, true, true, false]
    );
    const previewEnv: SettleEnv = { NODE_ENV: "production", VERCEL_ENV: "preview", XTNL_DUTY_LAUNCH_DAY: L };
    const preview = new FakeDb(d(-1), [tpl("stretch")]);
    const pv = await settleLifeDays(USER, at(d(3)), { env: previewEnv, client: preview.client() });
    check("a Preview deployment (NODE_ENV production, VERCEL_ENV 'preview') writes nothing", preview.writes === 0 && !pv.wrote, JSON.stringify({ ...pv, plans: pv.plans.length }));
    const previewChain = new FakeDb(d(-1), [tpl("stretch")]);
    await maybeMaintainLife(USER, at(d(3)), { env: previewEnv, client: previewChain.client(), judge: async () => {}, roadmap: NO_ROADMAP });
    check("…and its maintenance chain reads nothing for settlement", previewChain.reads.length === 0 && previewChain.writes === 0);
    const before = new FakeDb(d(-1), [tpl("stretch")]);
    const br = await settleLifeDays(USER, at(d(-1)), { env: WRITE_ENV, client: before.client() });
    eq("before the launch day: refused in words, nothing read", [br.refused, before.reads.length, before.writes], ["Duty starts Mon 12 Oct", 0, 0]);
    const be = await settleLifeDays(USER, at(d(-1)), { env: WRITE_ENV, client: before.client(), early: true });
    eq("an early settle before launch is refused the same way", be.refused, "Duty starts Mon 12 Oct");
    const none = new FakeDb(d(-1));
    eq("no launch day at all: 'Duty has not started.'", (await settleLifeDays(USER, at(d(3)), { env: { XTNL_LIFE_JUDGE: "1" }, client: none.client() })).refused, DUTY_LAUNCH_DAY == null ? "Duty has not started." : null);
    if (DUTY_LAUNCH_DAY == null) {
      const prod = new FakeDb(d(-1), [tpl("stretch")]);
      const pr = await settleLifeDays(USER, at(d(3)), { env: { NODE_ENV: "production", XTNL_DUTY_LAUNCH_DAY: L }, client: prod.client() });
      check("production ignores XTNL_DUTY_LAUNCH_DAY: with the constant null nothing is read or written", pr.refused === "Duty has not started." && prod.reads.length === 0 && prod.writes === 0);
    }
    const nullCursor = new FakeDb(null, [tpl("stretch")]);
    const nullWarned: string[] = [];
    const warnBefore = console.warn;
    console.warn = (...args: unknown[]) => void nullWarned.push(args.join(" "));
    let nc: SettleResult;
    let ncLaunchDay: SettleResult;
    try {
      nc = await settleLifeDays(USER, at(d(3)), { env: WRITE_ENV, client: nullCursor.client() });
      ncLaunchDay = await settleLifeDays(USER, at(d(1)), { env: WRITE_ENV, client: new FakeDb(null, [tpl("stretch")]).client() });
    } finally {
      console.warn = warnBefore;
    }
    check("a null cursor settles nothing (the launch script sets it)", !nc.wrote && nullCursor.writes === 0 && nc.refused === "Duty is not switched on for this account yet." && nullCursor.reads.length === 1);
    check(
      "…and once firstDutyDay is judgeable (d + 2) a null cursor is logged once per run, naming duty-launch --apply; not before",
      nullWarned.length === 1 && nullWarned[0].includes("duty-launch.ts --apply") && nullWarned[0].includes(L) && ncLaunchDay.refused === nc.refused,
      JSON.stringify(nullWarned)
    );
    const lag = new FakeDb(d(-1));
    const warned: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void warned.push(args.join(" "));
    try {
      await settleLifeDays(USER, at(d(30)), { env: WRITE_ENV, client: lag.client() });
    } finally {
      console.warn = warn;
    }
    check("a 14-day run that leaves the cursor behind logs the lag", lag.cursor === d(13) && warned.some((w) => w.includes(`settled through ${d(13)}`)), JSON.stringify(warned));
  }

  console.log("— §4 maybeMaintainLife —");
  {
    const dev = new FakeDb(d(-1), [tpl("stretch")]);
    let judged = 0;
    await maybeMaintainLife(USER, at(d(3)), { env: DEV_ENV, client: dev.client(), judge: async () => void (judged += 1), roadmap: NO_ROADMAP });
    check("writes off: maybeMaintainLife reads nothing and writes nothing for settlement", dev.reads.length === 0 && dev.writes === 0, JSON.stringify(dev.reads));
    eq("…and still runs the judge step (which has its own gate)", judged, 1);

    const live = new FakeDb(d(-1), [tpl("stretch")]);
    const order: string[] = [];
    await maybeMaintainLife(USER, at(d(3)), {
      env: WRITE_ENV,
      client: live.client(),
      judge: async () => void order.push(`judge after ${live.transactions.length} settlement transaction(s)`),
      roadmap: NO_ROADMAP,
    });
    check("settles first, then judges", live.cursor === d(1) && order.length === 1 && order[0] === "judge after 1 settlement transaction(s)", JSON.stringify(order));

    const caughtUp = new FakeDb(d(1), [tpl("stretch")]);
    await maybeMaintainLife(USER, at(d(3)), { env: WRITE_ENV, client: caughtUp.client(), judge: async () => {}, roadmap: NO_ROADMAP });
    check("a cursor already caught up costs one settings read and nothing else", caughtUp.reads.length === 1 && caughtUp.writes === 0, JSON.stringify(caughtUp.reads));

    const flight = new FakeDb(d(-1), [tpl("stretch")]);
    let calls = 0;
    const opts = { env: WRITE_ENV, client: flight.client(), judge: async () => void (calls += 1), roadmap: NO_ROADMAP };
    const a = maybeMaintainLife(USER, at(d(3)), opts);
    const b = maybeMaintainLife(USER, at(d(3)), opts);
    await Promise.all([a, b]);
    check("single flight: two renders at once share one chain", a === b && calls === 1 && flight.transactions.length === 1);

    const broken = new FakeDb(d(-1));
    broken.throwOnRead = true;
    let after = 0;
    const err = console.error;
    console.error = () => {};
    let threw = false;
    try {
      await maybeMaintainLife(USER, at(d(3)), { env: WRITE_ENV, client: broken.client(), judge: async () => void (after += 1), roadmap: NO_ROADMAP });
    } catch {
      threw = true;
    } finally {
      console.error = err;
    }
    check("never throws, and a settlement failure does not stop the judge", !threw && after === 1);
  }

  console.log("— §5 the life cron —");
  {
    const route = await import("../src/app/api/cron/life/route");
    const env = process.env as Record<string, string | undefined>;
    const saved = env.CRON_SECRET;
    try {
      delete env.CRON_SECRET;
      const r1 = await route.GET(new Request("https://x.test/api/cron/life", { headers: { authorization: "Bearer anything" } }));
      eq("GET with no CRON_SECRET set: 401", r1.status, 401);
      env.CRON_SECRET = "top-secret";
      const r2 = await route.GET(new Request("https://x.test/api/cron/life", { headers: { authorization: "Bearer wrong" } }));
      eq("GET with a wrong header: 401", r2.status, 401);
      const r3 = await route.GET(new Request("https://x.test/api/cron/life"));
      eq("GET with no header: 401", r3.status, 401);
      eq("…its body says so", await r3.json(), { error: "Unauthorized" });
    } finally {
      if (saved === undefined) delete env.CRON_SECRET;
      else env.CRON_SECRET = saved;
    }
    eq("cronAuthorized: an empty secret never matches", [cronAuthorized("Bearer ", ""), cronAuthorized("Bearer x", undefined), cronAuthorized("Bearer xy", "x"), cronAuthorized("Bearer x", "x")], [false, false, false, true]);

    const seen: string[] = [];
    let settleEnv: SettleOptions["env"] | undefined;
    const ok = await runLifeCron(new Request("https://x.test/api/cron/life", { headers: { authorization: "Bearer k" } }), {
      env: { CRON_SECRET: "k", XTNL_LIFE_JUDGE: "1" },
      now: () => at(d(3)),
      userId: () => USER,
      settle: async (_u, _n, o): Promise<SettleResult> => {
        seen.push("settle");
        settleEnv = o.env;
        return { launched: true, wrote: true, cursorBefore: L, cursorAfter: d(1), plans: [], refused: null };
      },
      judge: async () => {
        seen.push("judge");
        return { launched: true, committed: [] };
      },
      launchFinished: async () => true,
      roadmap: NO_ROADMAP,
    });
    check("authorized: settles, then judges, and answers 200", ok.status === 200 && seen.join() === "settle,judge" && settleEnv?.XTNL_LIFE_JUDGE === "1", JSON.stringify(seen));

    // Review F6: the cron calls judgeClosedWeeks directly, so it checks the M5 launch marker itself.
    const seen3: string[] = [];
    let askedFor = null as string | null;
    const unfinished = await runLifeCron(new Request("https://x.test/api/cron/life", { headers: { authorization: "Bearer k" } }), {
      env: { CRON_SECRET: "k", XTNL_LIFE_JUDGE: "1" },
      now: () => at(d(3)),
      userId: () => USER,
      settle: async (): Promise<SettleResult> => {
        seen3.push("settle");
        return { launched: true, wrote: false, cursorBefore: L, cursorAfter: L, plans: [], refused: null };
      },
      judge: async () => {
        seen3.push("judge");
        return { launched: true, committed: [] };
      },
      launchFinished: async (_u, day) => {
        askedFor = day;
        return false;
      },
      roadmap: NO_ROADMAP,
    });
    const body = (await unfinished.json()) as { judge: { skipped?: string } };
    check(
      "the M5 launch not finished (its DECAY_GRACE marker missing, e.g. after an 'everything' reset): settles, skips the judge, answers 200",
      unfinished.status === 200 && seen3.join() === "settle" && body.judge.skipped === "life launch not finished" && askedFor === LIFE_LAUNCH_DAY,
      JSON.stringify({ seen3, body, askedFor })
    );
    let markerWhere: unknown = null;
    const marker = (found: boolean) =>
      ({ masteryLedgerEntry: { findFirst: async (args: { where: unknown }) => ((markerWhere = args.where), found ? { id: "m" } : null) } }) as unknown as Parameters<typeof lifeLaunchFinished>[2];
    eq("lifeLaunchFinished reads the life-launch marker row", [await lifeLaunchFinished(USER, "2026-10-01", marker(true)), await lifeLaunchFinished(USER, "2026-10-01", marker(false))], [true, false]);
    eq("…by reason DECAY_GRACE and detail 'life launch <day>'", markerWhere, { userId: USER, reason: "DECAY_GRACE", detail: "life launch 2026-10-01" });
    const err = console.error;
    console.error = () => {};
    const seen2: string[] = [];
    const bad = await runLifeCron(new Request("https://x.test/api/cron/life", { headers: { authorization: "Bearer k" } }), {
      env: { CRON_SECRET: "k" },
      userId: () => USER,
      settle: async () => {
        throw new Error("boom");
      },
      judge: async () => {
        seen2.push("judge");
        return { launched: true, committed: [] };
      },
      launchFinished: async () => true,
      roadmap: NO_ROADMAP,
    }).finally(() => {
      console.error = err;
    });
    check("a settlement failure still judges (BODY, CRAFT, CARE never wait on it) and answers 500", bad.status === 500 && seen2.join() === "judge");
  }

  console.log("— §4b the roadmap step in the chain (roadmap.md F16 seam 8) —");
  {
    const order: string[] = [];
    const live = new FakeDb(d(-1), [tpl("stretch")]);
    const r = roadmapRecorder(order);
    const now = at(d(3));
    await maybeMaintainLife(USER, now, {
      env: WRITE_ENV,
      client: live.client(),
      judge: async () => void order.push(`judge after ${live.transactions.length} settlement transaction(s)`),
      roadmap: r.deps,
    });
    eq(
      "settle → judge → roadmap: the chain freezes the week (RENDER, its fallback), records readings (CHAIN), then finalises",
      order,
      ["judge after 1 settlement transaction(s)", "freeze:RENDER", "readings:CHAIN", "finalize"]
    );
    check(
      "…every roadmap writer is handed the chain's own env and instant, so its own gate agrees",
      r.envs.length === 3 && r.envs.every((e) => e === WRITE_ENV) && r.instants.every((t) => t === now.getTime())
    );

    // Duty inert: no launch day at all (DUTY_LAUNCH_DAY is null in code; no XTNL_DUTY_LAUNCH_DAY here).
    const inertOrder: string[] = [];
    const inert = new FakeDb(null, [tpl("stretch")]);
    const ri = roadmapRecorder(inertOrder);
    await maybeMaintainLife(USER, at(d(3)), { env: { XTNL_LIFE_JUDGE: "1" }, client: inert.client(), judge: async () => void inertOrder.push("judge"), roadmap: ri.deps });
    check(
      "while Duty is inert (no launch day, no cursor) settlement writes nothing, and the roadmap step still runs after the judge",
      inert.writes === 0 && inertOrder.join() === "judge,freeze:RENDER,readings:CHAIN,finalize" && (DUTY_LAUNCH_DAY != null || inert.reads.length === 0),
      JSON.stringify({ inertOrder, reads: inert.reads, writes: inert.writes })
    );

    // Writes off: a local dev server (NODE_ENV development) and a Vercel Preview build.
    for (const [label, env] of [
      ["NODE_ENV development, no XTNL_LIFE_JUDGE", DEV_ENV],
      ["a Vercel Preview (NODE_ENV production, VERCEL_ENV preview)", { NODE_ENV: "production", VERCEL_ENV: "preview", XTNL_DUTY_LAUNCH_DAY: L } as SettleEnv],
    ] as const) {
      const offOrder: string[] = [];
      const off = new FakeDb(d(-1), [tpl("stretch")]);
      const ro = roadmapRecorder(offOrder);
      await maybeMaintainLife(USER, at(d(3)), { env, client: off.client(), judge: async () => void offOrder.push("judge"), roadmap: ro.deps });
      const report = await runRoadmapStep(USER, at(d(3)), { env, source: "RENDER", caller: "CHAIN", deps: ro.deps });
      check(
        `writes off (${label}): the roadmap step calls no writer and reports WRITES_OFF`,
        offOrder.join() === "judge" &&
          report.freeze?.skipped === "WRITES_OFF" &&
          report.readings?.skipped === "WRITES_OFF" &&
          report.finalize?.skipped === "WRITES_OFF" &&
          report.errors.length === 0,
        JSON.stringify({ offOrder, report })
      );
    }

    // A part that throws: reported with its message, the later parts still run, nothing throws.
    for (const part of ["freeze", "readings", "finalize"] as const) {
      const failOrder: string[] = [];
      const rf = roadmapRecorder(failOrder, part);
      const report: RoadmapStepReport = await quietly(() => runRoadmapStep(USER, at(d(3)), { env: WRITE_ENV, source: "RENDER", caller: "CHAIN", deps: rf.deps }));
      check(
        `a failed ${part} is null in the report with its message, and every other part still runs`,
        failOrder.join() === "freeze:RENDER,readings:CHAIN,finalize" &&
          report[part] === null &&
          report.errors.length === 1 &&
          report.errors[0] === `${part}: ${part} boom` &&
          (["freeze", "readings", "finalize"] as const).filter((x) => x !== part).every((x) => report[x] !== null),
        JSON.stringify(report)
      );
    }

    // A part that RETURNS its failure (the real writers never throw: review Lens 1, R1 handoff 2,
    // lane 0 G2): the result is kept, and its message joins errors all the same.
    for (const part of ["freeze", "readings", "finalize"] as const) {
      const retOrder: string[] = [];
      const rr = roadmapRecorder(retOrder, undefined, [part]);
      const report: RoadmapStepReport = await runRoadmapStep(USER, at(d(3)), { env: WRITE_ENV, source: "RENDER", caller: "CHAIN", deps: rr.deps });
      check(
        `a ${part} that returns its failure as error (never throws) keeps its result, and 'error' reaches the report's errors`,
        retOrder.join() === "freeze:RENDER,readings:CHAIN,finalize" &&
          report[part] !== null &&
          (report[part] as { error?: string }).error === `${part} caught` &&
          JSON.stringify(report.errors) === JSON.stringify([`${part}: ${part} caught`]),
        JSON.stringify(report)
      );
    }
    {
      // Mixed: freeze and finalize return errors, readings throws; errors keep the parts' order.
      const mixOrder: string[] = [];
      const rm = roadmapRecorder(mixOrder, "readings", ["freeze", "finalize"]);
      const report: RoadmapStepReport = await quietly(() => runRoadmapStep(USER, at(d(3)), { env: WRITE_ENV, source: "RENDER", caller: "CHAIN", deps: rm.deps }));
      eq(
        "returned and thrown failures together: errors read freeze, readings, finalize in the step's order",
        report.errors,
        ["freeze: freeze caught", "readings: readings boom", "finalize: finalize caught"]
      );
      const missing: RoadmapStepDeps = {
        freeze: async () => ({ froze: 0, skipped: "MISSING_TABLE" }),
        readings: async () => ({ written: 0, reaches: 0, skipped: "MISSING_TABLE" }),
        finalize: async () => ({ finalized: 0, skipped: "MISSING_TABLE", error: "  " }),
      };
      const none = await runRoadmapStep(USER, at(d(3)), { env: WRITE_ENV, source: "RENDER", caller: "CHAIN", deps: missing });
      check(
        "a missing table (life_roadmap not applied) is a skip, never an error; a blank error reports nothing",
        none.errors.length === 0 && none.readings?.skipped === "MISSING_TABLE" && none.freeze?.skipped === "MISSING_TABLE",
        JSON.stringify(none)
      );
    }
    let threw = false;
    const chainFail: string[] = [];
    try {
      await quietly(() =>
        maybeMaintainLife(USER, at(d(3)), { env: WRITE_ENV, client: new FakeDb(d(1), [tpl("stretch")]).client(), judge: async () => {}, roadmap: roadmapRecorder(chainFail, "readings").deps })
      );
    } catch {
      threw = true;
    }
    check("a roadmap failure never fails the chain (maybeMaintainLife resolves; finalisation still ran)", !threw && chainFail.join() === "freeze:RENDER,readings:CHAIN,finalize");
  }

  console.log("— §5b the roadmap step in the life cron —");
  {
    const auth = () => new Request("https://x.test/api/cron/life", { headers: { authorization: "Bearer k" } });
    // The cron's run just after the Monday turn: 04:15 on a life Monday (L + 7 is a Monday).
    const monday = d(7);
    const turn = new Date(dayStartOf(monday).getTime() + 15 * 60_000);
    const order: string[] = [];
    const r = roadmapRecorder(order);
    const env: SettleEnv = { CRON_SECRET: "k", XTNL_LIFE_JUDGE: "1" };
    const res = await runLifeCron(auth(), {
      env,
      now: () => turn,
      userId: () => USER,
      settle: async (): Promise<SettleResult> => {
        order.push("settle");
        return { launched: true, wrote: false, cursorBefore: L, cursorAfter: L, plans: [], refused: null };
      },
      judge: async () => {
        order.push("judge");
        return { launched: true, committed: [] };
      },
      launchFinished: async () => true,
      roadmap: r.deps,
    });
    const body = (await res.json()) as { roadmap: RoadmapStepReport };
    check(
      "the cron runs settle → judge → roadmap: on a Monday at 04:15 it freezes the week (CRON) before it records readings (LIFE_CRON), then finalises",
      res.status === 200 &&
        order.join() === "settle,judge,freeze:CRON,readings:LIFE_CRON,finalize" &&
        weekKeyOf(monday) !== weekKeyOf(addDays(monday, -1)) &&
        r.instants.every((t) => t === turn.getTime()) &&
        r.envs.every((e) => e === env),
      JSON.stringify(order)
    );
    eq("…and its JSON carries the roadmap step's report", body.roadmap, { freeze: { froze: 1, skipped: null }, readings: { written: 2, reaches: 0, skipped: null }, finalize: { finalized: 1, skipped: null }, errors: [] });

    const failOrder: string[] = [];
    const failing = await quietly(() =>
      runLifeCron(auth(), {
        env,
        now: () => turn,
        userId: () => USER,
        settle: async (): Promise<SettleResult> => ({ launched: true, wrote: false, cursorBefore: L, cursorAfter: L, plans: [], refused: null }),
        judge: async () => ({ launched: true, committed: [] }),
        launchFinished: async () => true,
        roadmap: roadmapRecorder(failOrder, "readings").deps,
      })
    );
    const failBody = (await failing.json()) as { roadmap: RoadmapStepReport };
    check(
      "a roadmap failure leaves the cron at 200 when settle and the judge passed, reported in its JSON (finalisation still ran)",
      failing.status === 200 && failBody.roadmap.readings === null && failBody.roadmap.errors.join() === "readings: readings boom" && failOrder.join() === "freeze:CRON,readings:LIFE_CRON,finalize",
      JSON.stringify(failBody.roadmap)
    );

    // The real writers never throw: a freeze (R6) or readings (R1) failure comes back as `error`.
    // It must still reach the cron JSON's errors (F16 seam 8: "logged and reported there").
    const retOrder: string[] = [];
    const returning = await runLifeCron(auth(), {
      env,
      now: () => turn,
      userId: () => USER,
      settle: async (): Promise<SettleResult> => ({ launched: true, wrote: false, cursorBefore: L, cursorAfter: L, plans: [], refused: null }),
      judge: async () => ({ launched: true, committed: [] }),
      launchFinished: async () => true,
      roadmap: roadmapRecorder(retOrder, undefined, ["freeze", "readings"]).deps,
    });
    const retBody = (await returning.json()) as { roadmap: RoadmapStepReport };
    check(
      "a freeze and a readings failure returned as error (not thrown) show in the cron JSON's errors, at 200, with their results kept",
      returning.status === 200 &&
        JSON.stringify(retBody.roadmap.errors) === JSON.stringify(["freeze: freeze caught", "readings: readings caught"]) &&
        retBody.roadmap.freeze?.error === "freeze caught" &&
        retBody.roadmap.readings?.error === "readings caught" &&
        retBody.roadmap.finalize?.finalized === 1 &&
        retOrder.join() === "freeze:CRON,readings:LIFE_CRON,finalize",
      JSON.stringify(retBody.roadmap)
    );

    const offOrder: string[] = [];
    const off = await runLifeCron(auth(), {
      env: { CRON_SECRET: "k", NODE_ENV: "development" },
      now: () => turn,
      userId: () => USER,
      settle: async (): Promise<SettleResult> => ({ launched: false, wrote: false, cursorBefore: null, cursorAfter: null, plans: [], refused: "Duty has not started." }),
      judge: async () => ({ launched: true, committed: [] }),
      launchFinished: async () => true,
      roadmap: roadmapRecorder(offOrder).deps,
    });
    const offBody = (await off.json()) as { roadmap: RoadmapStepReport };
    check(
      "with writes off the cron's roadmap step calls no writer and reports WRITES_OFF",
      off.status === 200 && offOrder.length === 0 && offBody.roadmap.readings?.skipped === "WRITES_OFF" && offBody.roadmap.freeze?.skipped === "WRITES_OFF",
      JSON.stringify(offBody.roadmap)
    );

    const badOrder: string[] = [];
    const bad = await quietly(() =>
      runLifeCron(auth(), {
        env,
        now: () => turn,
        userId: () => USER,
        settle: async () => {
          throw new Error("boom");
        },
        judge: async () => ({ launched: true, committed: [] }),
        launchFinished: async () => true,
        roadmap: roadmapRecorder(badOrder).deps,
      })
    );
    check("a settlement failure still answers 500, and the roadmap step still runs (it never waits on Duty)", bad.status === 500 && badOrder.join() === "freeze:CRON,readings:LIFE_CRON,finalize");
  }

  console.log("— §5c the degrade cron's roadmap readings —");
  {
    const now = at(d(3));
    const calls: { caller?: string; env: unknown; now: number }[] = [];
    const readings: RoadmapStepDeps["readings"] = async (_u, n, o) => {
      calls.push({ caller: o.caller, env: o.env, now: n.getTime() });
      return { written: 1, reaches: 0, skipped: null };
    };
    const on = await recordRoadmapAfterDegrade(USER, now, { env: WRITE_ENV, readings });
    check(
      "with writes on, the degrade cron records roadmap readings (caller DEGRADE_CRON, its env and instant) and reports them",
      calls.length === 1 && calls[0].caller === "DEGRADE_CRON" && calls[0].env === WRITE_ENV && calls[0].now === now.getTime() && on.readings?.written === 1 && on.errors.length === 0
    );
    const offCalls = calls.length;
    const offDev = await recordRoadmapAfterDegrade(USER, now, { env: DEV_ENV, readings });
    const offPreview = await recordRoadmapAfterDegrade(USER, now, { env: { NODE_ENV: "production", VERCEL_ENV: "preview" }, readings });
    check(
      "with writes off (a dev server, a Preview) it records nothing and reports WRITES_OFF",
      calls.length === offCalls && offDev.readings?.skipped === "WRITES_OFF" && offPreview.readings?.skipped === "WRITES_OFF"
    );
    let threw = false;
    let failed: Awaited<ReturnType<typeof recordRoadmapAfterDegrade>> | null = null;
    try {
      failed = await quietly(() =>
        recordRoadmapAfterDegrade(USER, now, {
          env: WRITE_ENV,
          readings: async () => {
            throw new Error("degrade boom");
          },
        })
      );
    } catch {
      threw = true;
    }
    check("a roadmap failure never fails the degrade cron: no throw, reported in its JSON", !threw && failed?.readings === null && failed.errors.join() === "readings: degrade boom");
    const caught = await recordRoadmapAfterDegrade(USER, now, {
      env: WRITE_ENV,
      readings: async () => ({ written: 0, reaches: 0, skipped: null, error: "pool timeout" }),
    });
    check(
      "a readings failure the writer returns as error (it never throws) is reported in the degrade JSON's errors too, its result kept",
      caught.readings?.error === "pool timeout" && JSON.stringify(caught.errors) === JSON.stringify(["readings: pool timeout"]),
      JSON.stringify(caught)
    );
    const skippedOnly = await recordRoadmapAfterDegrade(USER, now, { env: WRITE_ENV, readings: async () => ({ written: 0, reaches: 0, skipped: "MISSING_TABLE" }) });
    check("…while a missing table is a skip with no error", skippedOnly.errors.length === 0 && skippedOnly.readings?.skipped === "MISSING_TABLE");
  }
}

// ── Static: the cron is scheduled, the route stays a thin GET, nothing settles in render ──

function staticChecks(): void {
  console.log("— §5 vercel.json and the route file —");
  const root = join(__dirname, "..");
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
  check("vercel.json schedules /api/cron/life at '15 18 * * *' UTC", vercel.crons.some((c) => c.path === DUTY_CRON_PATH && c.schedule === DUTY_CRON_SCHEDULE));
  check("…beside the degrade cron", vercel.crons.some((c) => c.path === "/api/cron/degrade"));
  const route = readFileSync(join(root, "src/app/api/cron/life/route.ts"), "utf8");
  const exported = [...route.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map((m) => m[1]);
  eq("route.ts exports only GET and its segment config", exported.sort(), ["GET", "dynamic"]);
  check("route.ts sets no maxDuration (Fluid's 300 s default)", !/maxDuration/.test(route.replace(/\/\*[\s\S]*?\*\//g, "")));

  console.log("— §5c the degrade route and the roadmap step's gate (static) —");
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const degrade = strip(readFileSync(join(root, "src/app/api/cron/degrade/route.ts"), "utf8"));
  const step = degrade.indexOf("recordRoadmapAfterDegrade(userId, new Date())");
  check(
    "the degrade route records roadmap readings after it degrades and judges quotas, and reports them in its JSON",
    step > 0 && degrade.indexOf("degradeOverdueIdeas()") < step && degrade.indexOf("enforceWeeklyQuotas(userId)") < step && /NextResponse\.json\(\{[^}]*\broadmap\b[^}]*\}\)/.test(degrade)
  );
  eq(
    "the degrade route still exports only GET and its segment config",
    [...degrade.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map((m) => m[1]).sort(),
    ["GET", "dynamic"]
  );
  const settlementSrc = strip(readFileSync(join(root, "src/lib/settlement.ts"), "utf8"));
  const stepFn = settlementSrc.slice(settlementSrc.indexOf("export async function runRoadmapStep("), settlementSrc.indexOf("export interface DegradeRoadmapReport"));
  check(
    "the roadmap step is gated by settlementWritesEnabled only: never by DUTY_LAUNCH_DAY, the launch or the settlement cursor",
    /if \(!settlementWritesEnabled\(ctx\.env\)\)/.test(stepFn) && !/dutyLaunchDay|isDutyLaunched|DUTY_LAUNCH_DAY|settledThroughDay|readCursor|cursor/.test(stepFn)
  );
  const chain = settlementSrc.slice(settlementSrc.indexOf("export function maybeMaintainLife("), settlementSrc.indexOf("export function cronAuthorized("));
  const cron = settlementSrc.slice(settlementSrc.indexOf("export async function runLifeCron("), settlementSrc.indexOf("export const XTNL_IDEA_PROJECT_REF"));
  check(
    "the chain and the cron run the roadmap step after the judge, and the cron's status is still settle's and the judge's alone",
    chain.indexOf("runRoadmapStep(") > chain.indexOf("maybeJudgeWeeks)(userId, now)") &&
      /source: "RENDER", caller: "CHAIN"/.test(chain) &&
      cron.indexOf("runRoadmapStep(") > cron.indexOf("judgeClosedWeeks)(userId, now)") &&
      /source: "CRON", caller: "LIFE_CRON"/.test(cron) &&
      (cron.match(/failed = true/g) ?? []).length === 2 &&
      /Response\.json\(\{ settle, judge, roadmap \}, \{ status: failed \? 500 : 200 \}\)/.test(cron)
  );

  console.log("— §6 duty-launch.ts and the shared lock (static) —");
  const launch = readFileSync(join(root, "scripts/duty-launch.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const firstRead = launch.indexOf("prisma.");
  check(
    "duty-launch: the database guard runs first, and --apply on a refused target stops before any read",
    /launchTargetOf\(\{ DATABASE_URL: process\.env\.DATABASE_URL, DIRECT_URL: process\.env\.DIRECT_URL \}\)/.test(launch) &&
      launch.indexOf('APPLY && target.kind === "refused"') > 0 &&
      launch.indexOf('APPLY && target.kind === "refused"') < firstRead
  );
  check("duty-launch: launch days come from launchDaysFor (the XTNL_ overrides on the rehearsal mirror only)", /launchDaysFor\(target\)/.test(launch) && !/\bdutyLaunchDay\(|\blifeLaunchDay\(/.test(launch));
  check("duty-launch: --apply refuses before firstDutyDay + 1 and before writing", /launchApplyTooEarly\(today, first\)/.test(launch) && launch.indexOf("if (tooEarly)") < launch.indexOf("lifeSettings.updateMany"));
  check("duty-launch: the cursor write is conditional on a null cursor and the epoch it read", /updateMany\(\{[\s\S]*?settledThroughDay: null, epochDay: settings\.epochDay/.test(launch));
  const lockSql = "pg_advisory_xact_lock(hashtext(${`life-complete:${userId}`}::text))";
  check(
    "settlement takes the completion paths' own lock (tasks.ts lifeLockOp's key; it builds on the global client, so settlement keeps its own copy for the injected one)",
    readFileSync(join(root, "src/lib/tasks.ts"), "utf8").includes(lockSql) && readFileSync(join(root, "src/lib/settlement.ts"), "utf8").includes(lockSql)
  );

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(root, "src/app"));
  walk(join(root, "src/components"));
  const offenders: string[] = [];
  for (const f of files) {
    const rel = relative(root, f).replace(/\\/g, "/");
    const src = readFileSync(f, "utf8");
    if (/\bsettleLifeDays\s*\(/.test(src) && !rel.startsWith("src/app/actions/")) offenders.push(`${rel}: settleLifeDays outside a server action`);
    // Every call (not the import) must sit inside an open after( … ): more '(' than ')' since the last 'after('.
    for (const m of src.matchAll(/\bmaybeMaintainLife\s*\(/g)) {
      const opened = src.lastIndexOf("after(", m.index);
      const between = opened < 0 ? "" : src.slice(opened, m.index);
      const depth = [...between].reduce((n, ch) => n + (ch === "(" ? 1 : ch === ")" ? -1 : 0), 0);
      if (opened < 0 || depth <= 0) offenders.push(`${rel}: maybeMaintainLife outside after()`);
    }
  }
  check("nothing settles in render: settleLifeDays only from server actions, maybeMaintainLife only inside after()", offenders.length === 0, offenders.join("; "));
}

spyOnRealClient();
executor()
  .catch((err) => check("§3–§5 ran", false, err instanceof Error ? `${err.message}\n${err.stack}` : String(err)))
  .finally(() => {
    restoreRealClient();
    check("the app's real Prisma client was never reached", touchedReal.length === 0, touchedReal.join(", "));
    staticChecks();
    if (failed > 0) {
      console.log(`\n${failed} FAILED, ${passed} passed`);
      process.exit(1);
    }
    console.log(`\nall ${passed} passed`);
    process.exit(0);
  });
