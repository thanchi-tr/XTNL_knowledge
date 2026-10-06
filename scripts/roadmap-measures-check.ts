/**
 * Lane R1's goldens (docs/life-plan/roadmap.md F10, F11, F12, F20): the
 * measures and their readings, the one-source-of-truth rule, the reach rules,
 * pace and the re-plan triggers, Proficiency and its basis, and the Aim rank.
 * Revision 4 (docs/life-plan/roadmap-rev4.md F-R4-8, F-R4-9, F-R4-12, F-R4-16):
 * recall-only and clean-entry (`r`, `rc`) counts with the REVIEW-ledger read,
 * the aim's reach and Paragon's conditions, ranks by stage (held rows give
 * none, track place ranks), Proficiency v2 and its basis label, pace on the
 * reach model, CALIBRATED, the legacy skip and the pre-migration fallback.
 * Revision 4 fix round (roadmap-contracts.md §15): clean entry is roadmap-types'
 * one definition (backfill and unknown rows skipped, R6's `at` order); the
 * acceptance reads break a version tie on acceptedAt (a lowered depth's
 * record); production practice is practiceRoleOf (a typed WRITING practice
 * counts); a PART at the depth gives the gate below's rank; a same-version
 * end-state change rebuilds the Proficiency basis and words it as a depth
 * change; ProficiencyToward is the contract's.
 * Revision 5 (roadmap-contracts.md §23.3, §23.4; lane 3): the writers run every
 * ACTIVE goal on its own context, in seat order, each guarded on its own (an
 * error named by its seat); one goal through the goal list is the one-context
 * run byte for byte; the scope map is the goals' union and a hook runs only
 * the goals whose scope matched; the real reads ask for ACTIVE goals only (a
 * PAUSED goal is never read); RESUMED rebases on the same basis, never a
 * gain; Today's goal chip and the goal series' seat show only with 2 or more
 * goals open (nothing more is read while GOALS_MAX is 1). Re-pinned: the
 * hooks' injected scope maps are unions of one goal.
 *
 * No database, no clock, no model: scripts/_no-model.ts is imported first;
 * DATABASE_URL is blanked to an unroutable address before the server module
 * loads; every writer runs on injected fixtures (loadContext, loadScopeMap)
 * and an in-memory stub client whose upserts follow the same rule the SQL's
 * ON CONFLICT … WHERE encodes (roadmap-readings upsertDecision).
 *
 *   npx tsx scripts/roadmap-measures-check.ts
 */
import "./_no-model";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { addDays, dateColumn, dayStartOf, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "../src/lib/life-day";
import { goalPercent, goalProgress, stepsDoneAsOf, type GoalStep } from "../src/lib/goals";
import type { InstanceLike } from "../src/lib/habit";
import * as M from "../src/lib/roadmap-measures";
import * as P from "../src/lib/roadmap-pace";
import * as PF from "../src/lib/roadmap-proficiency";
import * as Q from "../src/lib/roadmap-quests";
import * as RT from "../src/lib/roadmap-types";
import { statedForMilestone } from "../src/lib/roadmap-economy";
import { RESET_ARCHIVE_NOTE, resetArchiveReason } from "../src/lib/reset-scopes";
import { ZERO_REASON_LINE, zeroReasonWords } from "../src/components/roadmap/roadmap-copy";
import { roadmapGoalCardOf } from "../src/lib/today-board";
import type * as RR from "../src/lib/roadmap-readings";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0;
let failed = 0;
const pending: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);
const near = (name: string, got: number | null | undefined, want: number, tol = 1e-4) => check(name, got != null && Math.abs(got - want) <= tol, `got ${got}, want ${want}`);
const throws = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
/** Rejects (a thrown error, never a value). */
const rejects = async (fn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};
/** Runs fn with console.error silenced (a writer logs the failures these cases cause on purpose). */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

// ═══ Fixtures ═══════════════════════════════════════════════════════════════

const UID = "u1";
const RID = "r1";
const D_P = "dProb";
const D_I = "dInf";
const D_X = "dOther";
const NAMES: Record<string, string> = { [D_P]: "Probability", [D_I]: "Inference", [D_X]: "Elsewhere" };
const ON = { XTNL_LIFE_JUDGE: "1" };
const OFF = { NODE_ENV: "development" };
const MON = "2026-10-05"; // a Monday (life week start)
/** An instant on a life day at hh:mm local (fixture days avoid the DST turn). */
const at = (day: DayKey, hh = 9, mm = 0) => new Date(dayStartOf(day).getTime() + ((hh - 4) * 60 + mm) * 60_000);

function cardsMeasure(id: string, domainIds: string[], level: number, target: number, baseline: number): RT.MeasureSpec {
  return {
    id,
    kind: "CARDS_AT_LEVEL",
    role: "PAYS",
    scope: { domainIds },
    minLevel: level,
    target,
    targetSource: "WORKED_OUT",
    fittedTarget: target,
    rateSource: "SCOPE",
    baseline,
    baselineDay: MON,
    unit: "card",
    itemLineageId: null,
    measureKey: RT.cardsAtLevelKey(domainIds, level),
  };
}
function practiceMeasure(id: string, lineage: string, tpl: string, from: DayKey, effTarget: number): RT.MeasureSpec {
  return {
    id,
    kind: "PRACTICE_KEPT",
    role: "PAYS",
    scope: { itemLineageIds: [lineage], templateIds: [tpl] },
    minLevel: null,
    target: effTarget,
    targetSource: "WORKED_OUT",
    fittedTarget: null,
    rateSource: null,
    baseline: null,
    baselineDay: null,
    unit: "session",
    itemLineageId: lineage,
    measureKey: RT.practiceKeptKey([tpl], from),
  };
}
function item(p: Partial<RT.ItemDraft> & { lineageId: string; kind: RT.ItemKind }): RT.ItemDraft {
  return {
    id: `i-${p.lineageId}`,
    ord: 0,
    label: "Item",
    rawLabel: null,
    origin: "USER",
    decision: "EDITED",
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method: null,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: "WORKED_OUT",
    checkpointKind: null,
    outOf: null,
    bar: null,
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [],
    ...p,
  };
}
function ms(p: Partial<RR.CtxMilestone> & { id: string; ord: number }): RR.CtxMilestone {
  return {
    lineageId: `L-${p.id}`,
    version: 1,
    title: "Milestone",
    titleOrigin: "CODE",
    titleDecision: "KEPT",
    windowStart: MON,
    dueDay: addDays(MON, 41),
    status: "STARTED",
    rankIndex: p.ord,
    overAccepted: false,
    items: [],
    measures: [],
    notes: [],
    startedDay: MON,
    goalId: `g-${p.id}`,
    reachedDay: null,
    reachPendingDay: null,
    feasibility: null,
    goal: { open: true, archived: false },
    steps: [],
    ...p,
  };
}
function ctxOf(p: Partial<RR.RoadmapContext> = {}): RR.RoadmapContext {
  return {
    roadmap: { id: RID, status: "ACTIVE", version: 1, reachedDay: null, archiveReason: null },
    acceptance: { version: 1, endState: [] },
    milestones: [],
    readings: [],
    previousProficiency: null,
    histogram: {},
    domainNames: NAMES,
    templates: {},
    heldDays: [],
    ...p,
  };
}
const reading = (measureKey: string, day: DayKey, value: number, detail: unknown = null, observedAt = at(day).toISOString(), source: RT.ReadingSource = "COMPUTED"): RT.Reading => ({
  measureKey,
  day,
  value,
  detail,
  source,
  observedAt,
});
/** A histogram from "domain:level×count" triples. */
function hist(...rows: [string, number, number][]): Record<string, Record<number, number>> {
  const h: Record<string, Record<number, number>> = {};
  for (const [d, l, n] of rows) (h[d] ??= {})[l] = ((h[d] ??= {})[l] ?? 0) + n;
  return h;
}

// ═══ The in-memory store behind the stub client ═════════════════════════════

interface Stored {
  measureKey: string;
  day: DayKey;
  value: number;
  detail: unknown;
  source: string;
  observedAt: Date;
}
class Store {
  readings = new Map<string, Stored>();
  milestones = new Map<string, { reachedDay: DayKey | null; reachPendingDay: DayKey | null }>();
  roadmaps = new Map<string, { reachedDay: DayKey | null }>();
  sql: string[] = [];
  transactions = 0;
  ops = 0;
  latest(today: DayKey): RT.Reading[] {
    const best = new Map<string, Stored>();
    for (const r of this.readings.values()) {
      if (r.day > today) continue;
      const b = best.get(r.measureKey);
      if (!b || r.day > b.day) best.set(r.measureKey, r);
    }
    return Array.from(best.values()).map((r) => ({ measureKey: r.measureKey, day: r.day, value: r.value, detail: r.detail, source: r.source as RT.ReadingSource, observedAt: r.observedAt.toISOString() }));
  }
  get(key: string, day: DayKey): Stored | undefined {
    return this.readings.get(`${key}|${day}`);
  }
}
type Op = { apply: () => unknown };
const dayOf = (v: unknown): DayKey | null => (v instanceof Date ? keyOfDateColumn(v) : null);
function stubClient(store: Store): RR.RoadmapReadingsClient {
  const matchMs = (row: { reachedDay: DayKey | null; reachPendingDay: DayKey | null }, where: Record<string, unknown>) => {
    if ("reachedDay" in where && where.reachedDay === null && row.reachedDay != null) return false;
    if ("reachPendingDay" in where) {
      const w = where.reachPendingDay;
      if (w === null && row.reachPendingDay != null) return false;
      if (w && typeof w === "object" && "not" in w && row.reachPendingDay == null) return false;
      if (w instanceof Date && row.reachPendingDay !== dayOf(w)) return false;
    }
    return true;
  };
  const client = {
    $executeRaw(sql: Prisma.Sql): Op {
      store.sql.push(sql.sql);
      const [, , measureKey, day, value, detail, observedAt] = sql.values as [string, string, string, string, number, string | null, Date];
      return {
        apply: () => {
          const key = `${measureKey}|${day}`;
          const existing = store.readings.get(key) ?? null;
          const incoming = { source: "COMPUTED", observedAt, value, detail: detail == null ? null : JSON.parse(detail) };
          const d = upsertDecision(existing, incoming);
          if (d === "skip") return 0;
          store.readings.set(key, { measureKey, day, ...incoming });
          return 1;
        },
      };
    },
    roadmapMilestone: {
      updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Op {
        return {
          apply: () => {
            const id = String(args.where.id);
            const row = store.milestones.get(id) ?? { reachedDay: null, reachPendingDay: null };
            if (!matchMs(row, args.where)) return { count: 0 };
            if ("reachedDay" in args.data) row.reachedDay = dayOf(args.data.reachedDay);
            if ("reachPendingDay" in args.data) row.reachPendingDay = dayOf(args.data.reachPendingDay);
            store.milestones.set(id, row);
            return { count: 1 };
          },
        };
      },
    },
    roadmap: {
      updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Op {
        return {
          apply: () => {
            const id = String(args.where.id);
            const row = store.roadmaps.get(id) ?? { reachedDay: null };
            if (args.where.reachedDay === null && row.reachedDay != null) return { count: 0 };
            row.reachedDay = dayOf(args.data.reachedDay);
            store.roadmaps.set(id, row);
            return { count: 1 };
          },
        };
      },
    },
    async $transaction(ops: Op[]) {
      store.transactions += 1;
      store.ops += ops.length;
      return ops.map((o) => o.apply());
    },
  };
  return client as unknown as RR.RoadmapReadingsClient;
}
/** Runs a stub client's deferred ops as one transaction (the ops a writer would hand a real $transaction). */
const runOps = (client: RR.RoadmapReadingsClient, ops: readonly unknown[]) => (client.$transaction as unknown as (ops: readonly unknown[]) => Promise<unknown[]>)(ops);
/** The context as the store holds it: reach facts and readings read back (what a real reload would see). */
function fromStore(store: Store, base: RR.RoadmapContext, today: DayKey): RR.RoadmapContext {
  const readings = store.latest(today);
  return {
    ...base,
    roadmap: { ...base.roadmap, reachedDay: store.roadmaps.get(base.roadmap.id)?.reachedDay ?? base.roadmap.reachedDay },
    milestones: base.milestones.map((m) => ({ ...m, ...(store.milestones.get(m.id) ?? {}) })),
    readings: [...base.readings, ...readings],
    previousProficiency: readings.find((r) => r.measureKey === RT.proficiencyKey(base.roadmap.id)) ?? base.previousProficiency,
  };
}

let upsertDecision: typeof RR.upsertDecision;

async function main() {
  // Belt and braces: nothing below reaches a database (every writer is injected), and if one ever tried, it could not connect.
  process.env.DATABASE_URL = "postgresql://no-db:no-db@127.0.0.1:9/no_db";
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  const R = await import("../src/lib/roadmap-readings");
  upsertDecision = R.upsertDecision;

  // ═══ §measures (F10) ════════════════════════════════════════════════════

  console.log("— measures —");
  {
    const cards: M.CardLevelRow[] = [
      { domainId: D_P, level: 6 },
      { domainId: D_P, level: 13 },
      { domainId: D_P, level: 20 },
      { domainId: D_P, level: 5 },
      { domainId: D_P, level: 6, isArchived: true },
      { domainId: D_I, level: 7 },
      { domainId: D_X, level: 9 },
    ];
    const v = M.cardsAtLevelValue(cards, [D_P, D_I], 6);
    eq("CARDS_AT_LEVEL: levels 13–20 count, an archived card and another Domain do not", v, { value: 4, byDomain: { [D_P]: 3, [D_I]: 1 } });
    eq("the histogram gives the same value as the card list", M.cardsAtLevelFromHistogram(M.histogramOf(cards), [D_P, D_I], 6), v);
    const before = M.cardsAtLevelFromHistogram(hist([D_P, 6, 20]), [D_P], 6).value;
    const after = M.cardsAtLevelFromHistogram(hist([D_P, 6, 19], [D_P, 5, 1]), [D_P], 6).value;
    check("a degraded card (6 → 5) makes CARDS_AT_LEVEL fall 20 → 19", before === 20 && after === 19);
    eq("a reached milestone stays reached whatever g does (reachedDay is never cleared)", M.reachActionOf({ g: 0.4, today: "2026-11-04", selfReported: false, reachedDay: "2026-11-01", reachPendingDay: null }), { kind: "none" });
  }
  {
    const due = addDays(MON, 41);
    const tpl = (instances: InstanceLike[]): M.PracticeTemplateRow[] => [{ templateId: "t1", rule: "TARGET:3/W", startDay: MON, instances }];
    const w = { startedDay: MON, dueDay: due, asOf: addDays(MON, 6) };
    eq("practice: two ticks on one day count once", M.practiceKeptValue(tpl([{ day: MON, status: "DONE" }, { day: MON, status: "DONE" }]), w, []).kept, 1);
    const four = [0, 1, 2, 3].map((i) => ({ day: addDays(MON, i), status: "DONE" }));
    eq("practice: a 4th tick in a 3/W week counts nothing", M.practiceKeptValue(tpl(four), w, []).kept, 3);
    eq("practice: the minimum version (DONE_MVV) holds and never keeps", M.practiceKeptValue(tpl([{ day: MON, status: "DONE_MVV" }]), w, []).kept, 0);
    const plain = M.practiceKeptValue(tpl([]), w, []);
    eq("practice: 6 weeks of 3/W plan 18; effTarget = round(0.8 × 18) = 14", [plain.planned, plain.held, plain.effTarget], [18, 0, 14]);
    const vacation = Array.from({ length: 7 }, (_, i) => addDays(MON, 7 + i));
    const held = M.practiceKeptValue(tpl([]), w, vacation);
    eq("practice: a vacation week lowers effTarget (3 units held: round(0.8 × 15) = 12)", [held.planned, held.held, held.effTarget], [18, 3, 12]);
    near("measureFraction reads effTarget from the reading's detail", M.measureFraction({ kind: "PRACTICE_KEPT", baseline: null, target: 14 }, 6, { effTarget: 12 }), 0.5);
    near("measureFraction: a card measure is (v − b) ÷ (T − b), clamped", M.measureFraction({ kind: "CARDS_AT_LEVEL", baseline: 10, target: 20 }, 16), 0.6);
    eq("measureFraction clamps below the baseline and above the target", [M.measureFraction({ kind: "CARDS_AT_LEVEL", baseline: 10, target: 20 }, 8), M.measureFraction({ kind: "CARDS_AT_LEVEL", baseline: 10, target: 20 }, 25)], [0, 1]);
  }
  {
    // Checkpoint: context only, never part of g.
    const K = RT.cardsAtLevelKey([D_P], 6);
    const lin = "chk1";
    const chk: RT.MeasureSpec = { ...cardsMeasure("mc", [D_P], 6, 1, 0), kind: "CHECKPOINT", role: "CONTEXT", scope: { itemLineageIds: [lin] }, measureKey: null, itemLineageId: lin, target: 100 };
    const sm: M.SeriesMilestone = { id: "m", measures: [cardsMeasure("m1", [D_P], 6, 20, 10), chk], labels: {} };
    const base = [reading(K, "2026-11-02", 20)];
    const log100 = reading(RT.checkpointLogKey(lin, "n1"), "2026-11-03", 100, { outOf: 100 }, at("2026-11-03").toISOString(), "SELF");
    const log40 = reading(RT.checkpointLogKey(lin, "n2"), "2026-11-04", 40, { outOf: 100 }, at("2026-11-04").toISOString(), "SELF");
    const g0 = M.milestoneGOn(sm, base, [], "2026-11-04").g;
    check("a self-logged checkpoint at 100% changes no g", M.milestoneGOn(sm, [...base, log100], [], "2026-11-04").g === g0 && g0 === 1);
    const standing = M.checkpointStandingOf([log100, log40], lin, 100, 70);
    eq("checkpointStandingOf reads the latest log under the item's SELF prefix", standing, { score: 40, outOf: 100, bar: 70, met: false, day: "2026-11-04" });
    const hits = P.triggersOf({
      milestones: [{ ord: 1, cardPaces: [], pays: [{ value: 20, baseline: 10, met: true }], practice: null, carried: false, checkpoint: { score: standing!.score, bar: standing!.bar! } }],
      paceAtAcceptance: "SCOPE",
      paceNow: "SCOPE",
      questWeek: null,
    });
    eq("a checkpoint at 40% with every PAYS measure met fires CHECKPOINT_MISMATCH", hits.map((h) => h.trigger), ["CHECKPOINT_MISMATCH"]);
    check("CHECKPOINT_MISMATCH's line is the spec's", hits[0]?.line === "Your plan says ready; your checkpoint says not yet — the plan may be missing something.");
  }
  {
    // The series: null before the first reading; the last reading ≤ day across gaps; min(parts) and its binding class.
    const K = RT.cardsAtLevelKey([D_P], 6);
    const KP = RT.practiceKeptKey(["t1"], MON);
    const sm: M.SeriesMilestone = { id: "m", measures: [cardsMeasure("m1", [D_P], 6, 20, 10), practiceMeasure("m2", "pl1", "t1", MON, 10)], labels: { [K]: "cards at level 6+", [KP]: "Backtest sessions" } };
    const rs = [reading(K, "2026-11-01", 12), reading(KP, "2026-11-02", 2, { effTarget: 10 }), reading(K, "2026-11-04", 16), reading(KP, "2026-11-05", 9, { effTarget: 10 })];
    const series = M.milestoneGoalSeries(sm, rs, []);
    eq("the series has no point before every PAYS measure has a reading", series.map((p) => p.day), ["2026-11-02", "2026-11-04", "2026-11-05"]);
    eq("each point is min(parts), with the binding class (a tie goes to the weaker class)", series.map((p) => [p.g, p.bindingClass, p.bindingLabel]), [
      [0.2, "SELF_REPORTED", "Backtest sessions"],
      [0.2, "SELF_REPORTED", "Backtest sessions"],
      [0.6, "MEASURED", "cards at level 6+"],
    ]);
    eq("g is null before the first reading", M.milestoneGOn(sm, rs, [], "2026-10-31").g, null);
    near("g on a gap day reads the last reading ≤ that day (Nov 3: 0.2)", M.milestoneGOn(sm, rs, [], "2026-11-03").g, 0.2);
    const steps: GoalStep[] = [{ completedDay: "2026-11-01" }, { completedDay: null }];
    const g = M.milestoneGOn(sm, rs, steps, "2026-11-05");
    const head = M.milestoneHeadlineOf(g);
    const mins = g.parts.map((p) => p.fraction ?? 1);
    check("the headline equals goalPercent(min(parts)) (steps 1 of 2 bind at 50%)", head != null && head.percent === goalPercent(Math.min(...mins)) && head.percent === 50, json({ head, mins }));
    check("the binding class follows the minimum (steps → from your ticks)", g.binding?.class === "SELF_REPORTED" && g.binding.label === "steps" && head!.figure.caption === "slowest part is from your ticks");
    const cardsOnly: M.SeriesMilestone = { id: "c", measures: [cardsMeasure("m1", [D_P], 6, 20, 10)], labels: {} };
    eq("a cards-only headline is captioned 'tested by your reviews'", M.milestoneHeadlineOf(M.milestoneGOn(cardsOnly, rs, [], "2026-11-04"))?.figure.caption, "tested by your reviews");
  }

  console.log("— readings: the upsert —");
  {
    const store = new Store();
    const client = stubClient(store);
    const K = RT.cardsAtLevelKey([D_P], 6);
    const day = "2026-11-04";
    const newer = R.readingUpsertOp(UID, { measureKey: K, day, value: 5, detail: null }, at(day, 9, 5), client);
    const older = R.readingUpsertOp(UID, { measureKey: K, day, value: 3, detail: null }, at(day, 9, 0), client);
    await client.$transaction([newer, older]);
    eq("race order: an older computation (09:00) written after a newer one (09:05) leaves the 09:05 value", store.get(K, day)?.value, 5);
    const text = store.sql[0] ?? "";
    check(
      "the upsert's SQL carries the guards: ON CONFLICT (userId, measureKey, day), same source, observedAt ≤, value or detail distinct",
      /ON CONFLICT \("userId", "measureKey", "day"\) DO UPDATE/.test(text) &&
        /"RoadmapReading"\."source" = EXCLUDED\."source"/.test(text) &&
        /"RoadmapReading"\."observedAt" <= EXCLUDED\."observedAt"/.test(text) &&
        /"value" IS DISTINCT FROM EXCLUDED\."value" OR "RoadmapReading"\."detail" IS DISTINCT FROM EXCLUDED\."detail"/.test(text) &&
        /'COMPUTED'/.test(text)
    );
    const again = await client.$transaction([R.readingUpsertOp(UID, { measureKey: K, day, value: 5, detail: null }, at(day, 9, 10), client)]);
    eq("an unchanged value writes nothing", again, [0]);
    eq("upsertDecision: a different source never overwrites (a SELF row is never touched by a computed one)", R.upsertDecision({ source: "SELF", observedAt: at(day, 8), value: 40, detail: null }, { source: "COMPUTED", observedAt: at(day, 9), value: 1, detail: null }), "skip");
    eq("upsertDecision: a changed detail with the same value is written (effTarget, the Proficiency basis)", R.upsertDecision({ source: "COMPUTED", observedAt: at(day, 8), value: 4, detail: { effTarget: 14 } }, { source: "COMPUTED", observedAt: at(day, 9), value: 4, detail: { effTarget: 12 } }), "update");
    check("a computed writer refuses a SELF key (checkpoint logs are never touched)", throws(() => R.readingUpsertOp(UID, { measureKey: RT.checkpointLogKey("chk1", "n1"), day, value: 1, detail: null }, at(day), client)));
    check("a past day's reading is never rewritten (only today is written)", throws(() => R.readingUpsertOp(UID, { measureKey: K, day: addDays(day, -1), value: 1, detail: null }, at(day), client)));
    const wrote = await R.writeReadings(UID, [{ measureKey: K, day: addDays(day, -1), value: 9, detail: null }], at(day), { env: ON, client, clock: () => at(day) });
    eq("writeReadings drops a row that is not today's", wrote, 0);
    eq("stableJson ignores key order", R.stableJson({ b: 1, a: [1, { d: 2, c: 3 }] }), R.stableJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
  }

  // ── The writers on fixtures ────────────────────────────────────────────

  const K6 = RT.cardsAtLevelKey([D_P], 6);
  /** A cards-only milestone (Probability to level 6+, 10 → 20) and a practice milestone (Backtest 1/W, effTarget 5). */
  const due = addDays(MON, 41); // Sun 15 Nov
  const cardsMs = () => ms({ id: "mc", ord: 1, measures: [cardsMeasure("mc1", [D_P], 6, 20, 10)] });
  const practiceMs = () =>
    ms({
      id: "mp",
      ord: 2,
      measures: [practiceMeasure("mp1", "pl", "tb", MON, 5)],
      items: [item({ lineageId: "pl", kind: "PRACTICE", label: "Backtest", templateId: "tb", rule: "TARGET:1/W", sessionsPerWeek: 1, durationBand: "D45" })],
    });
  const ticks = (n: number): InstanceLike[] => Array.from({ length: n }, (_, i) => ({ day: addDays(MON, 7 * i), status: "DONE" }));

  console.log("— readings: the writers —");
  {
    // Cards-only: reachedDay at once.
    const store = new Store();
    const client = stubClient(store);
    const today = "2026-11-04";
    const base = ctxOf({ milestones: [cardsMs()], histogram: hist([D_P, 6, 20], [D_P, 3, 4]) });
    let loads = 0;
    const run = await R.recordRoadmapReadings(UID, at(today), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => (loads++, fromStore(store, base, today)) });
    eq("a cards-only milestone at g = 1 sets reachedDay at once", store.milestones.get("mc")?.reachedDay, today);
    check("the run reports its writes (the measure, PROFICIENCY) and the reach", run.written === 2 && run.reaches >= 1 && run.skipped === null, json(run));
    check("every writer that writes a roadmap's reading writes its PROFICIENCY reading too", store.get(RT.proficiencyKey(RID), today) != null && store.get(K6, today)?.value === 20);
    check("every stored row is today's", Array.from(store.readings.values()).every((r) => r.day === today));
    eq("the aim of a one-milestone, cards-only plan is reached with it", store.roadmaps.get(RID)?.reachedDay, today);
    const second = await R.recordRoadmapReadings(UID, at(today, 9, 30), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, base, today) });
    eq("a second run on unchanged values writes nothing", [second.written, second.reaches], [0, 0]);
    // The degrade cron: a degraded card's reading the same day; the reach stays.
    const degraded = { ...base, histogram: hist([D_P, 6, 19], [D_P, 5, 1], [D_P, 3, 4]) };
    const d1 = await R.recordRoadmapReadings(UID, at(today, 9, 31), { env: ON, caller: "DEGRADE_CRON", client, loadContext: async () => fromStore(store, degraded, today) });
    check("the degrade cron's step records a degraded card's reading the same day (20 → 19), unthrottled", d1.skipped === null && store.get(K6, today)?.value === 19, json(d1));
    eq("a degradation after the reach leaves reachedDay set", store.milestones.get("mc")?.reachedDay, today);
    // The chain throttle.
    R.resetReadingsThrottle();
    let chainLoads = 0;
    const chain = (t: Date) => R.recordRoadmapReadings(UID, t, { env: ON, caller: "CHAIN", client, loadContext: async () => (chainLoads++, fromStore(store, degraded, today)) });
    const c1 = await chain(at(today, 10));
    const c2 = await chain(at(today, 10, 5));
    const c3 = await chain(at(today, 10, 11));
    check("the chain runs at most once per 10 minutes per user", c1.skipped === null && c2.skipped === "THROTTLED" && c3.skipped === null, json([c1, c2, c3]));
    check("a throttled chain run reads nothing; the crons were never throttled", chainLoads === 2 && loads === 1);
  }
  {
    // Practice: pending, then confirmed 2 days later while g still 1.
    const store = new Store();
    const client = stubClient(store);
    const X = addDays(MON, 28); // Mon 2 Nov: the 5th weekly tick
    const base = (n: number, extra: InstanceLike[] = []) => ctxOf({ milestones: [practiceMs()], templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: [...ticks(n), ...extra] } } });
    const go = (day: DayKey, c: RR.RoadmapContext) => R.recordRoadmapReadings(UID, at(day), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, c, day) });
    await go(X, base(5));
    eq("a practice milestone at g = 1 sets reachPendingDay, not reachedDay", store.milestones.get("mp"), { reachedDay: null, reachPendingDay: X });
    await go(addDays(X, 1), base(5));
    eq("one day later it is still pending", store.milestones.get("mp"), { reachedDay: null, reachPendingDay: X });
    await go(addDays(X, 2), base(5));
    eq("the roadmap step confirms it 2 days later while g is still 1 (reachedDay = the pending day)", store.milestones.get("mp"), { reachedDay: X, reachPendingDay: null });
    const p = store.get(RT.proficiencyKey(RID), addDays(X, 2));
    const d = p ? PF.parseProficiencyDetail(p.detail) : null;
    check("the confirmed reach counts in Proficiency's milestones part (1 of 1) and makes it SELF_REPORTED", d?.reached === 1 && d.parts.milestones === 1 && d.class === "SELF_REPORTED", json(d && { reached: d.reached, parts: d.parts }));
    eq("the new rank shows from the confirmed day", PF.aimRankOf({ milestones: [{ ord: 2, rankIndex: 1, reachedDay: X, reachPendingDay: null, scheduled: true }], roadmapReachedDay: null, maxScheduled: 1, today: addDays(X, 2) }).newSince, X);
  }
  {
    // A tick that completes a practice milestone, undone within 48 hours: nothing is left behind.
    const store = new Store();
    const client = stubClient(store);
    const X = addDays(MON, 28);
    const undone: InstanceLike[] = [...ticks(4), { day: X, status: "UNDONE" }];
    const c5 = ctxOf({ milestones: [practiceMs()], templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: ticks(5) } } });
    const c4 = ctxOf({ milestones: [practiceMs()], templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: undone } } });
    let loads = 0;
    // Revision 5 (lane 3 re-pin): the scope map is the goals' union; one goal is a union of one.
    const deps = (day: DayKey, c: RR.RoadmapContext) => ({ env: ON, client, now: at(day), loadScopeMap: async () => ({ goals: [R.scopeMapOf({ roadmapId: RID, milestones: c.milestones, endState: [] })] }), loadContext: async () => (loads++, fromStore(store, c, day)) });
    await R.recordPracticeForTemplate(UID, "tb", deps(X, c5));
    eq("the tick pends the reach", store.milestones.get("mp")?.reachPendingDay, X);
    await R.recordPracticeForTemplate(UID, "tb", deps(addDays(X, 1), c4));
    eq("its undo within 48 hours clears it", store.milestones.get("mp"), { reachedDay: null, reachPendingDay: null });
    await R.recordRoadmapReadings(UID, at(addDays(X, 2)), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, c4, addDays(X, 2)) });
    const p = store.get(RT.proficiencyKey(RID), addDays(X, 2));
    const d = p ? PF.parseProficiencyDetail(p.detail) : null;
    const rank = PF.aimRankOf({ milestones: [{ ord: 2, rankIndex: 1, ...store.milestones.get("mp")!, scheduled: true }], roadmapReachedDay: null, maxScheduled: 1, today: addDays(X, 2) });
    check("… leaving no reachedDay, no rank, no reached count and a milestones part of 0", store.milestones.get("mp")?.reachedDay == null && rank.index === 0 && d?.reached === 0 && d.parts.milestones === 0, json({ rank: rank.index, d: d && d.parts }));
    const before = loads;
    await R.recordPracticeForTemplate(UID, "elsewhere", deps(X, c5));
    check("recordPracticeForTemplate returns without a read for a template outside the scope map", loads === before);
    // A degradation during the pending days clears it too.
    const both = () =>
      ms({
        id: "mb",
        ord: 1,
        measures: [cardsMeasure("mb1", [D_P], 6, 20, 10), practiceMeasure("mb2", "pl", "tb", MON, 5)],
        items: [item({ lineageId: "pl", kind: "PRACTICE", label: "Backtest", templateId: "tb", rule: "TARGET:1/W" })],
      });
    const s2 = new Store();
    const cl2 = stubClient(s2);
    const full = ctxOf({ milestones: [both()], histogram: hist([D_P, 6, 20]), templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: ticks(5) } } });
    await R.recordRoadmapReadings(UID, at(X), { env: ON, caller: "LIFE_CRON", client: cl2, loadContext: async () => fromStore(s2, full, X) });
    const pended = s2.milestones.get("mb")?.reachPendingDay === X;
    const slipped = { ...full, histogram: hist([D_P, 6, 19], [D_P, 5, 1]) };
    await R.recordRoadmapReadings(UID, at(addDays(X, 1)), { env: ON, caller: "DEGRADE_CRON", client: cl2, loadContext: async () => fromStore(s2, slipped, addDays(X, 1)) });
    check("a degradation during the pending days clears the pending reach", pended && s2.milestones.get("mb")?.reachPendingDay == null && s2.milestones.get("mb")?.reachedDay == null, json(s2.milestones.get("mb")));
  }
  {
    // recordCardsForReview: only on a crossing; an evening review on the due day writes the due day's reading.
    const store = new Store();
    const client = stubClient(store);
    // Revision 5 (lane 3 re-pin): the scope map is the goals' union; one goal is a union of one.
    const map: RR.RoadmapScopeUnion = { goals: [{ roadmapId: RID, cards: [{ measureKey: K6, domainIds: [D_P], level: 6 }], templateIds: [] }] };
    let loads = 0;
    const base = ctxOf({ milestones: [cardsMs()], histogram: hist([D_P, 6, 14]) });
    const deps = (now: Date) => ({ env: ON, client, now, loadScopeMap: async () => map, loadContext: async () => (loads++, fromStore(store, base, todayKey(now))) });
    await R.recordCardsForReview(UID, "idea1", D_P, 3, 4, deps(at("2026-11-04")));
    await R.recordCardsForReview(UID, "idea1", D_X, 5, 6, deps(at("2026-11-04")));
    await R.recordCardsForReview(UID, "idea1", D_P, 6, 7, deps(at("2026-11-04")));
    check("recordCardsForReview reads nothing without a crossing of L in scope (3 → 4, another Domain, 6 → 7)", loads === 0 && store.transactions === 0);
    const evening = at(due, 23, 30);
    await R.recordCardsForReview(UID, "idea1", D_P, 5, 6, deps(evening));
    check("a crossing (5 → 6) runs once, and an evening review on the due day writes the due day's reading", loads === 1 && todayKey(evening) === due && store.get(K6, due)?.value === 14);
    await R.recordCardsForReview(UID, "idea1", D_P, 6, 5, deps(at("2026-11-04")));
    check("a crossing downward (6 → 5) runs too", loads === 2);
    eq("crossesLevel", [R.crossesLevel(5, 6, 6), R.crossesLevel(6, 5, 6), R.crossesLevel(6, 7, 6), R.crossesLevel(3, 13, 12)], [true, true, false, true]);
  }
  {
    // The write gate: NODE_ENV development and no XTNL_LIFE_JUDGE → no writer writes.
    const store = new Store();
    const client = stubClient(store);
    let loads = 0;
    const base = ctxOf({ milestones: [cardsMs()], histogram: hist([D_P, 6, 20]) });
    const loadContext = async () => (loads++, base);
    const loadScopeMap = async () => (loads++, { goals: [R.scopeMapOf({ roadmapId: RID, milestones: base.milestones, endState: [] })] });
    const full = await R.recordRoadmapReadings(UID, at("2026-11-04"), { env: OFF, caller: "LIFE_CRON", client, loadContext });
    await R.recordCardsForReview(UID, "i", D_P, 5, 6, { env: OFF, client, loadContext, loadScopeMap, now: at("2026-11-04") });
    await R.recordPracticeForTemplate(UID, "tb", { env: OFF, client, loadContext, loadScopeMap, now: at("2026-11-04") });
    const w = await R.writeReadings(UID, [{ measureKey: K6, day: "2026-11-04", value: 1, detail: null }], at("2026-11-04"), { env: OFF, client, clock: () => at("2026-11-04") });
    check("writes off: every writer writes nothing and reads nothing", full.skipped === "WRITES_OFF" && w === 0 && loads === 0 && store.transactions === 0 && store.sql.length === 0, json({ full, w, loads }));
    const preview = await R.readingOpsFor(UID, "g-mc", at("2026-11-04"), { env: OFF, client, loadContext: async () => base });
    check("writes off: readingOpsFor computes live values, labelled, with nothing to write", preview.ok && preview.live && preview.ops.length === 0 && (preview.reachOps ?? []).length === 0 && preview.rows.length > 0);
    const prodPreview = await R.recordRoadmapReadings(UID, at("2026-11-04"), { env: { NODE_ENV: "production", VERCEL_ENV: "preview" }, caller: "LIFE_CRON", client, loadContext });
    eq("writes off on a Vercel preview build too", prodPreview.skipped, "WRITES_OFF");
  }
  {
    // One fixture read by the Today seam, the ladder seam and the close gives the same g.
    const K = RT.cardsAtLevelKey([D_P], 6);
    const steps: GoalStep[] = [{ completedDay: "2026-10-20" }, { completedDay: null }, { completedDay: "2026-11-03" }];
    const m = ms({ id: "ms", ord: 1, measures: [cardsMeasure("ms1", [D_P], 6, 20, 10)], steps });
    const today = "2026-11-04";
    const stored = [reading(K, "2026-10-28", 13), reading(K, "2026-11-02", 15)];
    const c = ctxOf({ milestones: [m], readings: stored, histogram: hist([D_P, 6, 16]) });
    const entry = R.goalSeriesEntryOf({ milestone: m, roadmap: { status: "ACTIVE", archiveReason: null, scheduled: [{ lineageId: m.lineageId, ord: 1 }] }, stated: 6, readings: stored });
    const asOf = today;
    const seamModel = (series: readonly RT.RoadmapSeriesPoint[]) => {
      const last = [...series].filter((p) => p.day <= asOf).pop();
      if (!last) return null;
      const { done, total } = stepsDoneAsOf(steps, asOf);
      return Math.min(last.g, total > 0 ? done / total : 1);
    };
    const gStored = M.milestoneGOn(R.seriesMilestoneOf(m), stored, steps, asOf).g;
    check("Today's and the ladder's seam rule (last point ≤ as-of, min with the steps' share) equals milestoneGOn on the stored rows", gStored != null && Math.abs((seamModel(entry.series) ?? -1) - gStored) < 1e-12, json({ seam: seamModel(entry.series), gStored }));
    const close = await R.readingOpsFor(UID, m.goalId!, at(today), { env: ON, client: stubClient(new Store()), loadContext: async () => c, closing: true });
    check("the close pays from the rows it computes: its point and g agree with the series those rows extend", close.ok && close.point != null && close.g != null && Math.abs(close.g - Math.min(close.point.g, 2 / 3)) < 1e-12 && Math.abs(close.point.g - 0.6) < 1e-12, json(close.ok && { point: close.point, g: close.g }));
    const seam = goalProgress({ krMetric: "ROADMAP", krTarget: null, steps, progress: [], readings: entry.series }, asOf);
    if (seam === null) pending.push("goals.ts ROADMAP branch (lane L, F16 seam 1): goalProgress returns null for ROADMAP until it lands; this check then compares it");
    else check("goals.ts goalProgress (lane L's ROADMAP branch) gives the same g as the series", Math.abs(seam - gStored!) < 1e-12, json({ seam, gStored }));
  }
  {
    // A close at g = 1 confirms a pending reach inside its transaction; below 1 it clears.
    const X = addDays(MON, 28);
    const pendingMs = () => ({ ...practiceMs(), reachPendingDay: X });
    const c = (n: number) => ctxOf({ milestones: [pendingMs()], templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: ticks(n) } } });
    for (const [n, want] of [
      [5, { reachedDay: X, reachPendingDay: null }],
      [4, { reachedDay: null, reachPendingDay: null }],
    ] as const) {
      const store = new Store();
      store.milestones.set("mp", { reachedDay: null, reachPendingDay: X });
      const client = stubClient(store);
      const ops = await R.readingOpsFor(UID, "g-mp", at(addDays(X, 1)), { env: ON, client, loadContext: async () => fromStore(store, c(n), addDays(X, 1)), closing: true });
      if (!ops.ok) {
        check("readingOpsFor answers for an open ROADMAP goal", false, ops.reason);
        continue;
      }
      await runOps(client, [...ops.ops, ...(ops.reachOps ?? [])]);
      eq(`a close at g = ${n === 5 ? "1 confirms the pending reach" : "0.8 clears it"} in the same transaction`, store.milestones.get("mp"), want);
      eq(`… and its reach is the close's (${n === 5 ? "confirm" : "clear"})`, ops.reach.kind, n === 5 ? "confirm" : "clear");
    }
  }
  {
    // The preview applies no reach, so its PROFICIENCY counts none; the close counts the reach it applies.
    const c = ctxOf({ milestones: [cardsMs()], histogram: hist([D_P, 6, 20]) });
    const preview = await R.readingOpsFor(UID, "g-mc", at("2026-11-04"), { env: ON, client: stubClient(new Store()), loadContext: async () => c });
    const close = await R.readingOpsFor(UID, "g-mc", at("2026-11-04"), { env: ON, client: stubClient(new Store()), loadContext: async () => c, closing: true });
    const reachedOf = (o: RR.ReadingOps) => (o.ok ? PF.parseProficiencyDetail(o.rows.find((r) => r.measureKey === RT.proficiencyKey(RID))?.detail)?.reached : -1);
    eq("the preview's PROFICIENCY counts no reach it does not apply (0); the close's counts the one it applies (1)", [reachedOf(preview), reachedOf(close), close.ok && close.reach.kind], [0, 1, "reach"]);
  }
  {
    // PRACTICE_KEPT stores kept per lineage (Proficiency's kept_p) beside kept per template.
    const c = ctxOf({ milestones: [practiceMs()], templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: ticks(3) } } });
    const plan = R.planRoadmapWrite(c, at(addDays(MON, 15)));
    const row = plan.rows.find((r) => r.measureKey === RT.practiceKeptKey(["tb"], MON));
    eq("a PRACTICE_KEPT row's detail: kept, planned, held, effTarget, byTemplate and byLineage", row?.detail, { kept: 3, planned: 6, held: 0, effTarget: 5, byTemplate: { tb: 3 }, byLineage: { pl: 3 } });
    const split = M.practiceDetailOf({ kept: 5, planned: 10, held: 0, effTarget: 8, byTemplate: { t1: 2, t2: 3 } }, { a: "t1", b: "t2" });
    eq("a measure over two practices splits byLineage by template", split.byLineage, { a: 2, b: 3 });
  }
  {
    // The PROFICIENCY row goes through the same upsert: today only, race order, unchanged writes nothing.
    const store = new Store();
    const client = stubClient(store);
    const key = RT.proficiencyKey(RID);
    const day = "2026-11-04";
    const row = (value: number) => ({ measureKey: key, day, value, detail: { v: 1 } });
    await runOps(client, [R.readingUpsertOp(UID, row(0.42), at(day, 9, 5), client), R.readingUpsertOp(UID, row(0.39), at(day, 9, 0), client)]);
    const again = await runOps(client, [R.readingUpsertOp(UID, row(0.42), at(day, 9, 6), client)]);
    check("PROFICIENCY: an older computation never overwrites a newer one, and an unchanged one writes nothing", store.get(key, day)?.value === 0.42 && json(again) === "[0]");
  }
  {
    // A past-due open milestone is judged as of its due day: a reading after it moves nothing.
    const X = addDays(due, -3);
    const late = addDays(due, 2);
    const K = RT.cardsAtLevelKey([D_P], 6);
    const m = { ...cardsMs(), measures: [cardsMeasure("mc1", [D_P], 6, 20, 10), practiceMeasure("mp1", "pl", "tb", MON, 5)], items: practiceMs().items, reachPendingDay: X };
    const c = ctxOf({
      milestones: [m],
      histogram: hist([D_P, 6, 15]),
      templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: ticks(6) } },
      readings: [reading(K, due, 20), reading(RT.practiceKeptKey(["tb"], MON), due, 6, { effTarget: 5 })],
    });
    const plan = R.planRoadmapWrite(c, at(late));
    eq("past due: the pending reach is confirmed on the due day's readings, though cards slipped after it", plan.reaches.map((r) => r.action), [{ kind: "confirm", day: X }]);
    // The aim: the final lineage counts when its "Start again" copy is the reached row.
    const dropped = ms({ id: "f1", ord: 2, lineageId: "LF", goal: { open: false, archived: true }, measures: [cardsMeasure("f11", [D_P], 6, 20, 10)] });
    const copy = ms({ id: "f2", ord: 2, lineageId: "LF", reachedDay: "2026-11-01", measures: [cardsMeasure("f21", [D_P], 6, 20, 10)] });
    const first = ms({ id: "f0", ord: 1, reachedDay: "2026-10-20", measures: [] });
    const aim = R.planRoadmapWrite(ctxOf({ milestones: [first, dropped, copy], histogram: hist([D_P, 6, 20]) }), at("2026-11-04"));
    eq("the aim is reached once the final lineage is, whichever of its rows reached it", aim.aimReachedDay, "2026-11-04");
  }
  {
    const on = (day: DayKey): RT.PaceResult => ({ kind: "on-pace", day, pipeline: 3, bestCase: false });
    const late = (day: DayKey): RT.PaceResult => ({ kind: "behind", day, daysLate: 20, expectedByDue: 4, target: 9, bestCase: false });
    eq("slowestPaceOf: the slowest part decides (far > behind > on pace; the later day within a kind)", [
      P.slowestPaceOf([on("2026-12-01"), on("2026-12-09")]),
      P.slowestPaceOf([on("2026-12-30"), late("2026-12-20")]),
      P.slowestPaceOf([late("2027-01-01"), { kind: "far" }]),
      P.slowestPaceOf([{ kind: "reached", day: "2026-11-01" }, on("2026-12-01")]),
      P.slowestPaceOf([]),
    ], [on("2026-12-09"), late("2026-12-20"), { kind: "far" }, on("2026-12-01"), { kind: "not-measured" }]);
  }
  {
    // A reset-archived roadmap: no series, the note, and readingOpsFor refuses it.
    const m = cardsMs();
    const entry = R.goalSeriesEntryOf({
      milestone: m,
      roadmap: { status: "ARCHIVED", archiveReason: "measures removed by a reset on 2026-11-02", scheduled: [{ lineageId: m.lineageId, ord: 1 }] },
      stated: 0,
      readings: [reading(K6, "2026-11-01", 15)],
    });
    check("a reset-archived roadmap's goal gets no series (g null, pays 0) and the note", entry.series.length === 0 && entry.note === "measures removed by a reset", json(entry));
    const refused = await R.readingOpsFor(UID, "g-mc", at("2026-11-04"), { env: ON, client: stubClient(new Store()), loadContext: async () => ctxOf({ roadmap: { id: RID, status: "ARCHIVED", version: 1, reachedDay: null, archiveReason: "measures removed by a reset on 2026-11-02" }, milestones: [m] }) });
    check("readingOpsFor refuses a reset-archived roadmap", !refused.ok && /reset/.test(refused.reason), json(refused));
    const live = R.goalSeriesEntryOf({ milestone: m, roadmap: { status: "ACTIVE", archiveReason: null, scheduled: [{ lineageId: "L-x", ord: 1 }, { lineageId: m.lineageId, ord: 2 }, { lineageId: "L-y", ord: 3 }] }, stated: 0, readings: [reading(K6, "2026-11-01", 15)] });
    eq("the board's entry: milestone 2 of 3, the zero reason in words, no note", [live.ord, live.of, live.zeroReason, live.note, live.series.length], [2, 3, "knowledge is paid by reviews", null, 1]);
  }
  {
    // Zero reasons from the frozen stated value and the plan.
    eq("zeroReasonOf: stated 6 → none; cards only; under an hour; under a third; else the lineage paid", [
      M.zeroReasonOf({ stated: 6, practiceMinutesPerWeek: 90, plannedTrackedMinutesPerWeek: 200 }),
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 0, plannedTrackedMinutesPerWeek: 200 }),
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 45, plannedTrackedMinutesPerWeek: 200 }),
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 60, plannedTrackedMinutesPerWeek: 240 }),
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 90, plannedTrackedMinutesPerWeek: 200 }),
    ], [null, "KNOWLEDGE_ONLY", "PRACTICE_UNDER_HOUR", "PRACTICE_UNDER_SHARE", "LINEAGE_PAID"]);
  }

  // ═══ §pace (F11) ════════════════════════════════════════════════════════

  console.log("— pace —");
  const today = "2026-11-04";
  {
    // F4's worked example: 12 at L6+, 10 at L4 due today (2 passes, reach L6 in 12 days), pace 3 a week, p = 0.8, due in 70 days.
    const cards: RT.EffectiveCard[] = [...Array.from({ length: 12 }, () => ({ level: 6, dueDay: addDays(today, 5) })), ...Array.from({ length: 10 }, () => ({ level: 4, dueDay: today }))];
    const d = addDays(today, 70);
    const x = P.cardsExpectedBy(cards, 6, d, 0.8, 3, today);
    near("the pipeline at p = 0.8: expected 24.4 (12 + 10 × 0.64 + floor(19 × 0.8⁵))", x.expected, 24.4);
    eq("… best 41, 10 in the pipeline, 19 new by lastCardDay", [x.best, x.pipeline, x.newBest], [41, 10, 19]);
    near("with p calibrating, expected = best = 41", P.cardsExpectedBy(cards, 6, d, null, 3, today).expected, 41);
    const m20 = { minLevel: 6, target: 20, baseline: 12, dueDay: d, reachedDay: null };
    eq("projectCards: target 20 is met on day 41, on pace for the due day", P.projectCards(m20, cards, 0.8, 3, today), { kind: "on-pace", day: addDays(today, 41), pipeline: 10, bestCase: false });
    const m30 = { ...m20, target: 30 };
    eq("projectCards: target 30 at p = 0.8 is behind (day 111, 41 days late, about 24 of 30 by the due day)", P.projectCards(m30, cards, 0.8, 3, today), { kind: "behind", day: addDays(today, 111), daysLate: 41, expectedByDue: 24, target: 30, bestCase: false });
    eq("projectCards: the same with p calibrating is on pace (best case) from day 43", P.projectCards(m30, cards, null, 3, today), { kind: "on-pace", day: addDays(today, 43), pipeline: 10, bestCase: true });
    eq("projectCards: a reached measure reads reached", P.projectCards({ ...m20, reachedDay: "2026-11-01" }, cards, 0.8, 3, today), { kind: "reached", day: "2026-11-01" });
    eq("projectCards: beyond 104 weeks reads far", P.projectCards({ minLevel: 8, target: 5, baseline: 0, dueDay: d, reachedDay: null }, [], 0.8, null, today), { kind: "far" });
    const behind = P.triggersOf({ milestones: [{ ord: 2, cardPaces: [P.projectCards(m30, cards, 0.8, 3, today)], pays: [], practice: null, carried: false, checkpoint: null }], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: null });
    eq("BEHIND fires on it with its words", behind.map((h) => h.line), [`About 6 weeks behind: at your pace about 24 of 30 by ${Number(d.slice(8))} Jan`]);
  }
  {
    // A fresh level-6 milestone at day 21 with new cards in flight fires no trigger.
    const startedDay = addDays(today, -21);
    const dueDay = addDays(today, 60);
    const inFlight: RT.EffectiveCard[] = [2, 3, 4].flatMap((l) => Array.from({ length: 5 }, (_, i) => ({ level: l, dueDay: addDays(today, i) })));
    const cards: RT.EffectiveCard[] = [...Array.from({ length: 5 }, () => ({ level: 6, dueDay: addDays(today, 9) })), ...inFlight];
    const pace = P.projectCards({ minLevel: 6, target: 15, baseline: 5, dueDay, reachedDay: null }, cards, 0.8, 5, today);
    const hits = P.triggersOf({ milestones: [{ ord: 1, cardPaces: [pace], pays: [{ value: 5, baseline: 5, met: false }], practice: null, carried: false, checkpoint: null }], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: null });
    check(`a fresh L6 milestone at day 21 (started ${startedDay}, still 5 of 15) with cards in flight is on pace and fires no trigger`, pace.kind === "on-pace" && hits.length === 0, json({ pace, hits }));
  }
  {
    eq("projectPractice: 7 kept + 12 left × 0.5 against 19 is about 6 sessions short", P.projectPractice(7, 12, 0.5, 19), { kind: "short", sessions: 6 });
    eq("projectPractice: 10 + 12 × 0.8 against 19 is on pace", P.projectPractice(10, 12, 0.8, 19), { kind: "on-pace" });
    eq("projectPractice: met already is on pace; no kept share yet is not measured", [P.projectPractice(19, 0, null, 19), P.projectPractice(3, 12, null, 19)], [{ kind: "on-pace" }, { kind: "not-measured" }]);
  }
  {
    // Each trigger fires on its fixture and only on it.
    const quiet: P.TriggerMilestone = { ord: 2, id: "m2", dueDay: "2026-12-13", level: 6, cardPaces: [{ kind: "on-pace", day: "2026-12-01", pipeline: 9, bestCase: false }], pays: [{ value: 12, baseline: 10, met: false }], practice: { keptShare: 0.9, planned: 12 }, carried: false, checkpoint: null };
    const only = (name: string, m: Partial<P.TriggerMilestone>, extra: Partial<P.TriggerInput> = {}) =>
      P.triggersOf({ milestones: [{ ...quiet, ...m }], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: null, ...extra }).map((h) => h.trigger);
    eq("the quiet fixture fires nothing", only("", {}), []);
    eq("BEHIND only on a pipeline more than 14 days late", [only("", { cardPaces: [{ kind: "behind", day: "2027-01-23", daysLate: 41, expectedByDue: 24, target: 30, bestCase: false }] }), only("", { cardPaces: [{ kind: "behind", day: "2026-12-23", daysLate: 10, expectedByDue: 18, target: 20, bestCase: false }] })], [["BEHIND"], []]);
    eq("SLIPPED only below the baseline", only("", { pays: [{ value: 9, baseline: 10, met: false }] }), ["SLIPPED"]);
    eq("PRACTICE_LOW only under half with ≥ 8 planned", [only("", { practice: { keptShare: 0.4, planned: 12 } }), only("", { practice: { keptShare: 0.4, planned: 7 } })], [["PRACTICE_LOW"], []]);
    eq("CARRIED", only("", { carried: true }), ["CARRIED"]);
    eq("CHECKPOINT_MISMATCH only with every PAYS measure met", [only("", { pays: [{ value: 20, baseline: 10, met: true }], checkpoint: { score: 40, bar: 70 } }), only("", { checkpoint: { score: 40, bar: 70 } })], [["CHECKPOINT_MISMATCH"], []]);
    eq("PACE_MEASURED: typed or none at acceptance, measured now", [
      only("", {}, { paceAtAcceptance: "NONE", paceNow: "SCOPE" }),
      only("", {}, { paceAtAcceptance: "YOURS", paceNow: "FIELD" }),
      only("", {}, { paceAtAcceptance: "NONE", paceNow: "YOURS" }),
    ], [["PACE_MEASURED"], ["PACE_MEASURED"], []]);
    const add = (writingWeeksLeft: number): RT.AddQuestSpec => ({ ord: 2, kind: "ADD", label: "Add 4 cards to Risk Management", count: 4, unit: "card", evidence: "RECORDED", from: "2026-11-16", to: "2026-11-22", domainIds: [D_P], fieldId: null, quotaField: null, pace: 8, writingWeeksLeft, lastCardDay: "2026-11-22" });
    const set = (p: Partial<RT.WeekQuestSet>, w = 10 / 7): RT.WeekQuestSet => ({ weekStart: "2026-11-16", milestoneId: "m2", state: "OPEN", generator: 1, quests: [add(w)], basis: [], cappedBy: "CATCHUP", ...p });
    const qb = P.triggersOf({ milestones: [quiet], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: set({}) });
    eq("QUESTS_BEHIND: CATCHUP with under 2 writing weeks left", qb.map((h) => h.trigger), ["QUESTS_BEHIND"]);
    check("QUESTS_BEHIND's line names the ask, the need, the level, the due day and the writing end", qb[0]?.line === "Behind on new cards for Milestone 2: this week asks 4 of the 8 needed to stay on plan, and writing that can still reach level 6 by 13 Dec ends Sun 22 Nov.", qb[0]?.line);
    check(
      "QUESTS_BEHIND's line is R6's questsBehindLine (one wording: the trigger and the week quests' note never differ; R6 handoff 7)",
      qb[0]?.line === Q.questsBehindLine(set({}), { ord: 2, level: 6, dueDay: "2026-12-13" }) &&
        P.triggersOf({ milestones: [{ ...quiet, level: null }], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: set({}) })[0]?.line === Q.questsBehindLine(set({}), { ord: 2, level: null, dueDay: "2026-12-13" }),
      json(qb[0]?.line)
    );
    eq("QUESTS_BEHIND never on week 1 (4.43 writing weeks), a CAPACITY cap, a HELD or a PAST_DUE week", [
      only("", {}, { questWeek: set({}, 31 / 7) }),
      only("", {}, { questWeek: set({ cappedBy: "CAPACITY" }) }),
      only("", {}, { questWeek: set({ state: "HELD" }) }),
      only("", {}, { questWeek: set({ state: "PAST_DUE" }) }),
    ], [[], [], [], []]);
    check("no trigger line names the review quest or 'earn'", [...qb, ...P.triggersOf({ milestones: [{ ...quiet, carried: true, pays: [{ value: 9, baseline: 10, met: false }] }], paceAtAcceptance: "NONE", paceNow: "SCOPE", questWeek: null })].every((h) => !/\bquests?\b/i.test(h.line.replace(/week quests?/gi, "")) && !/earns?\b/i.test(h.line)));
  }

  // ═══ §proficiency (F12) ═════════════════════════════════════════════════

  console.log("— proficiency —");
  const K8 = RT.cardsAtLevelKey([D_P, D_I], 8);
  const term30: RT.ProficiencyCardTerm = { measureKey: K8, domainIds: [D_I, D_P].sort(), level: 8, target: 30 };
  const basis30: RT.ProficiencyBasis = { basisVersion: 1, cards: [term30], practice: [{ itemLineageId: "pl", planned: 72 }], scheduled: 3 };
  // The 30 best: 10 at level 8 or above (6 at 8, 2 at 10, 2 at 15), 12 at level 6, 8 at level 4.
  const H41 = hist([D_P, 8, 6], [D_P, 10, 2], [D_I, 15, 2], [D_P, 6, 12], [D_I, 4, 8]);
  const levels = (h: Record<string, Record<number, number>>) => M.levelsInScope(h, [D_P, D_I]);
  const pf = (h: Record<string, Record<number, number>>, basis = basis30, kept = 19, reached = 1, onTicks = false) =>
    PF.proficiencyOf({ basis, cardLevels: { [K8]: levels(h) }, kept: { pl: kept }, reached, reachedOnTicks: onTicks });
  {
    const r = pf(H41);
    near("the worked example: cards 1,038 ÷ 2,070 = 0.5014", r.parts.cards, 1038 / 2070);
    near("practice 19 ÷ 72 = 0.2639, milestones 1 ÷ 3", r.parts.practice, 19 / 72);
    near("value = 0.6 × 0.5014 + 0.25 × 0.2639 + 0.15 × 0.3333 = 0.4168", r.value, 0.6 * (1038 / 2070) + 0.25 * (19 / 72) + 0.15 / 3, 1e-12);
    near("… which is 0.41684", r.value, 0.416842, 1e-6);
    eq("… shown as 41%", PF.proficiencyPercent(r.value), 41);
    eq("depth 1,038", r.depth, 1038);
    const deg = pf(hist([D_P, 8, 6], [D_P, 10, 2], [D_I, 15, 2], [D_P, 6, 6], [D_P, 5, 6], [D_I, 4, 8]));
    check("six level-6 cards degrade to 5: depth 966, cards 0.4667, 39%", deg.depth === 966 && Math.abs(deg.parts.cards! - 966 / 2070) < 1e-9 && PF.proficiencyPercent(deg.value) === 39, json(deg));
    const rank = PF.aimRankOf({ milestones: [{ ord: 1, rankIndex: 1, reachedDay: "2026-10-20", reachPendingDay: null, scheduled: true }, { ord: 2, rankIndex: 2, reachedDay: null, reachPendingDay: null, scheduled: true }, { ord: 3, rankIndex: 3, reachedDay: null, reachPendingDay: null, scheduled: true }], roadmapReachedDay: null, maxScheduled: 3, today });
    eq("… and the rank does not change (Aspirant)", rank.name, "Aspirant");
    const fifty = pf({ ...H41, [D_P]: { ...H41[D_P], 1: 50 } });
    check("fifty new cards with no review leave the cards part and 41% unchanged", fifty.parts.cards === r.parts.cards && PF.proficiencyPercent(fifty.value) === 41);
    const b5: RT.ProficiencyBasis = { basisVersion: 1, cards: [{ ...term30, target: 5 }], practice: [], scheduled: 1 };
    const once = PF.proficiencyOf({ basis: b5, cardLevels: { [K8]: [2, 2, 2, 2, 2] }, kept: {}, reached: 0, reachedOnTicks: false });
    eq("a card passed once on its first day (level 2) adds nothing", once.parts.cards, 0);
    const bT2: RT.ProficiencyBasis = { basisVersion: 1, cards: [{ ...term30, target: 2 }], practice: [], scheduled: 1 };
    eq("cards beyond T add nothing, and levels 13–20 count as L (three at 8, 15, 20 with T 2: 1)", PF.proficiencyOf({ basis: bT2, cardLevels: { [K8]: [8, 15, 20] }, kept: {}, reached: 0, reachedOnTicks: false }).parts.cards, 1);
    const bT4: RT.ProficiencyBasis = { basisVersion: 1, cards: [{ ...term30, target: 4 }], practice: [], scheduled: 1 };
    eq("fewer cards than T count the missing ones 0 (two at 8 with T 4: 0.5)", PF.proficiencyOf({ basis: bT4, cardLevels: { [K8]: [8, 8] }, kept: {}, reached: 0, reachedOnTicks: false }).parts.cards, 0.5);
    const noPractice = PF.proficiencyOf({ basis: { ...basis30, practice: [] }, cardLevels: { [K8]: levels(H41) }, kept: {}, reached: 1, reachedOnTicks: false });
    check("a Field Area without practices renormalises to cards 0.8, milestones 0.2 (0.6 ÷ 0.75, 0.15 ÷ 0.75)", noPractice.shares.practice === null && Math.abs(noPractice.shares.cards! - 0.8) < 1e-12 && Math.abs(noPractice.shares.milestones! - 0.2) < 1e-12, json(noPractice.shares));
    const track = PF.proficiencyOf({ basis: { ...basis30, cards: [] }, cardLevels: {}, kept: { pl: 19 }, reached: 1, reachedOnTicks: true });
    check("a track Area renormalises to practice 0.625, milestones 0.375", track.shares.cards === null && Math.abs(track.shares.practice! - 0.625) < 1e-12 && Math.abs(track.shares.milestones! - 0.375) < 1e-12, json(track.shares));
    check("the shares sum to 1", Math.abs((noPractice.shares.cards ?? 0) + (noPractice.shares.milestones ?? 0) - 1) < 1e-12 && Math.abs((track.shares.practice ?? 0) + (track.shares.milestones ?? 0) - 1) < 1e-12);
    eq("the class: MEASURED without practice or a tick-bound reach; SELF_REPORTED with either", [noPractice.class, r.class, PF.proficiencyOf({ basis: { ...basis30, practice: [] }, cardLevels: { [K8]: levels(H41) }, kept: {}, reached: 1, reachedOnTicks: true }).class], ["MEASURED", "SELF_REPORTED", "SELF_REPORTED"]);
    const undone = pf(H41, basis30, 15);
    check("an undone tick lowers the practice part (19 → 15 of 72)", Math.abs(undone.parts.practice! - 15 / 72) < 1e-12 && undone.value < r.value);
    eq("extra sessions of one practice never make up for another", PF.proficiencyOf({ basis: { ...basis30, practice: [{ itemLineageId: "a", planned: 10 }, { itemLineageId: "b", planned: 10 }] }, cardLevels: {}, kept: { a: 30, b: 0 }, reached: 0, reachedOnTicks: false }).parts.practice, 0.5);
  }
  {
    // The basis.
    const window = { windowStart: MON, dueDay: addDays(MON, 7 * 30 - 1) };
    const m1 = ms({ id: "b1", ord: 1, ...window, status: "PLANNED", items: [item({ lineageId: "pl", kind: "PRACTICE", rule: "TARGET:3/W", sessionsPerWeek: 3 }), item({ lineageId: "pl2", kind: "PRACTICE", sessionsPerWeek: 2, decision: "REMOVED" })] });
    const later = ms({ id: "b2", ord: 2, status: "LATER", windowStart: null, dueDay: null });
    const basis = PF.proficiencyBasisOf({ basisVersion: 1, endState: [{ measureKey: K8, target: 30, baseline: 4, baselineDay: MON, label: "x" }], feasibility: null, milestones: [m1, later, ms({ id: "b3", ord: 3, status: "PLANNED" }), ms({ id: "b4", ord: 4, status: "STARTED" })], switchedOff: [] });
    eq("the basis: 3/W over 30 weeks plans round(0.8 × 90) = 72; a removed practice is out; LATER is not scheduled", basis, { basisVersion: 1, cards: [term30], practice: [{ itemLineageId: "pl", planned: 72 }], scheduled: 3 });
    eq("a switched-off practice leaves the basis", PF.proficiencyBasisOf({ basisVersion: 1, endState: [], feasibility: null, milestones: [m1], switchedOff: ["pl"] }).practice, []);
  }
  {
    // Rebases: a plan decision is a change of plan, never progress.
    const sunday = addDays(weekStartKeyOf(today), -1);
    const make = (basis: RT.ProficiencyBasis, h: Record<string, Record<number, number>>, day: DayKey, previous: RT.Reading | null, decision: PF.ProficiencyReadingInput["decision"] = null, kept = 19) => {
      const row = PF.proficiencyReadingOf({ roadmapId: RID, today: day, basis, histogram: h, domainNames: NAMES, kept: { pl: kept }, reached: 1, reachedOnTicks: false, previous, decision });
      return reading(row.measureKey, row.day, row.value, row.detail, at(day).toISOString());
    };
    const v1 = make(basis30, H41, sunday, null);
    eq("the first reading after acceptance carries no rebase", (v1.detail as RT.ProficiencyDetail).rebased, null);
    const basis25: RT.ProficiencyBasis = { ...basis30, basisVersion: 2, cards: [{ ...term30, target: 25 }] };
    const v2 = make(basis25, H41, today, v1, { cause: "REPLAN" });
    const d2 = v2.detail as RT.ProficiencyDetail;
    near("lowering the end target 30 → 25: cards 1,008 ÷ 1,725, value 0.4666", v2.value, 0.6 * (1008 / 1725) + 0.25 * (19 / 72) + 0.15 / 3, 1e-12);
    eq("… shown as 46%", PF.proficiencyPercent(v2.value), 46);
    eq("… written as a rebased reading with the earlier figure", d2.rebased && { on: d2.rebased.on, from: Math.round(d2.rebased.from * 10000) / 10000, cause: d2.rebased.cause, detail: d2.rebased.detail }, { on: today, from: 0.4168, cause: "REPLAN", detail: "the re-plan lowered the end target 30 → 25" });
    const change = PF.proficiencyChangeOf(v2, v1, today);
    check("… shown as a change of plan ('Changed on … (was 41%)'), never as a gain", change?.kind === "rebased" && PF.proficiencyPercent(change.rebase.from) === 41, json(change));
    const view = PF.proficiencyViewOf(v2, v1, today, false);
    check("the view carries the rebase, 46%, and its caption", view.percent === 46 && view.change?.kind === "rebased" && view.figure.caption === "tested by your reviews and your ticks" && view.measuredAt === v2.observedAt);
    const nextWeek = addDays(today, 7);
    const carried = make(basis25, H41, nextWeek, v2);
    check("the rebase is carried forward but shows only in its own week", (carried.detail as RT.ProficiencyDetail).rebased?.on === today && PF.proficiencyChangeOf(carried, v2, nextWeek) === null);
    const undo = make(basis30, H41, today, v2, { cause: "UNDO" });
    check("an Undo restores the earlier basis, again rebased", PF.basisSignature((undo.detail as RT.ProficiencyDetail).basis) === PF.basisSignature(basis30) && (undo.detail as RT.ProficiencyDetail).rebased?.cause === "UNDO" && PF.proficiencyPercent(undo.value) === 41);
    const two: RT.ProficiencyBasis = { ...basis30, practice: [{ itemLineageId: "pl", planned: 72 }, { itemLineageId: "pb", planned: 24 }] };
    const w2 = make(two, H41, sunday, null);
    const off = make(PF.basisWithout(two, ["pb"]), H41, today, w2, { cause: "SWITCHED_OFF", names: { pb: "Backtest" } });
    eq("switching a practice off at Start writes a rebased reading with that cause", (off.detail as RT.ProficiencyDetail).rebased && { cause: (off.detail as RT.ProficiencyDetail).rebased!.cause, detail: (off.detail as RT.ProficiencyDetail).rebased!.detail }, { cause: "SWITCHED_OFF", detail: "Backtest was switched off at Start" });
    // Causes from the parts diff.
    const slipped = make(basis30, hist([D_P, 8, 6], [D_P, 10, 2], [D_I, 15, 2], [D_P, 6, 6], [D_P, 5, 6], [D_I, 4, 8]), today, v1);
    eq("a degradation reads '↓ 2 since Sun · card levels slipped in Probability'", PF.proficiencyChangeOf(slipped, v1, today), { kind: "fall", points: 2, since: sunday, cause: "LEVELS_SLIPPED", domains: ["Probability"] });
    const archived = make(basis30, hist([D_P, 8, 6], [D_P, 10, 2], [D_I, 15, 2], [D_P, 6, 6], [D_I, 4, 8]), today, v1);
    eq("archived cards read 'cards archived or moved out of Probability'", PF.proficiencyChangeOf(archived, v1, today), { kind: "fall", points: 4, since: sunday, cause: "CARDS_ARCHIVED", domains: ["Probability"] });
    const unticked = make(basis30, H41, today, v1, null, 15);
    eq("an undone tick reads 'a ticked session was undone'", PF.proficiencyChangeOf(unticked, v1, today), { kind: "fall", points: 1, since: sunday, cause: "TICK_UNDONE", domains: [] });
    const rise = make(basis30, H41, today, v1, null, 30);
    eq("a rise carries no change line (the meter moves, the parts say why)", PF.proficiencyChangeOf(rise, v1, today), null);
    const otherV = { ...v1, detail: { ...(v1.detail as object), v: 99 } };
    eq("a reading whose detail.v differs shows no delta", PF.proficiencyChangeOf(slipped, otherV, today), null);
  }
  {
    // The writers keep the basis between plan decisions: a late Start and a moved due day change nothing.
    const store = new Store();
    const client = stubClient(store);
    const plannedMs = ms({
      id: "m1",
      ord: 1,
      status: "PLANNED",
      startedDay: null,
      goalId: null,
      goal: null,
      windowStart: MON,
      dueDay: addDays(MON, 7 * 30 - 1),
      measures: [cardsMeasure("m11", [D_P, D_I], 8, 30, 4)],
      items: [item({ lineageId: "pl", kind: "PRACTICE", rule: "TARGET:3/W", sessionsPerWeek: 3 })],
    });
    const acceptance = { version: 1, endState: [{ measureKey: K8, target: 30, baseline: 4, baselineDay: MON, label: "x" }] };
    const base = ctxOf({ acceptance, milestones: [plannedMs, ms({ id: "m2", ord: 2, status: "PLANNED" }), ms({ id: "m3", ord: 3, status: "PLANNED" })], histogram: H41 });
    await R.recordRoadmapReadings(UID, at(MON), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, base, MON) });
    const first = store.get(RT.proficiencyKey(RID), MON)!;
    const day = addDays(MON, 40);
    const lateStart = { ...plannedMs, status: "STARTED" as const, startedDay: addDays(MON, 40), goalId: "g1", goal: { open: true, archived: false }, dueDay: addDays(MON, 7 * 30 + 20), measures: [cardsMeasure("m11", [D_P, D_I], 8, 30, 4)] };
    const later = { ...base, milestones: [lateStart, base.milestones[1], base.milestones[2]] };
    await R.recordRoadmapReadings(UID, at(day), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, later, day) });
    const second = store.get(RT.proficiencyKey(RID), day)!;
    const d1 = PF.parseProficiencyDetail(first.detail)!;
    const d2 = PF.parseProficiencyDetail(second.detail)!;
    check("a late Start and a moved due day leave the basis and the value unchanged (no rebase)", PF.basisSignature(d1.basis) === PF.basisSignature(d2.basis) && first.value === second.value && d2.rebased === null, json({ a: first.value, b: second.value, rebased: d2.rebased }));
    eq("the stored basis is the acceptance's: planned 72, 3 scheduled", [d2.basis.practice, d2.basis.scheduled], [[{ itemLineageId: "pl", planned: 72 }], 3]);
    check("the PROFICIENCY row is today's only, and an unchanged recompute writes nothing", store.get(RT.proficiencyKey(RID), day)?.day === day && (await R.recordRoadmapReadings(UID, at(day, 11), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, later, day) })).written === 0);
    // A switch-off at Start that no decision recorded is rebased by the writer.
    const offItem = { ...lateStart, items: [item({ lineageId: "pl", kind: "PRACTICE", rule: "TARGET:3/W", sessionsPerWeek: 3, addToToday: false })] };
    const offCtx = { ...later, milestones: [offItem, base.milestones[1], base.milestones[2]] };
    const day2 = addDays(day, 1);
    await R.recordRoadmapReadings(UID, at(day2), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, offCtx, day2) });
    const d3 = PF.parseProficiencyDetail(store.get(RT.proficiencyKey(RID), day2)!.detail)!;
    eq("a practice switched off at Start leaves the basis, rebased SWITCHED_OFF", [d3.basis.practice.length, d3.rebased?.cause], [0, "SWITCHED_OFF"]);
  }
  {
    // "Start again" never counts a day twice: an older practice window counts up to the day before the next start.
    const S2 = addDays(MON, 21);
    const oldKey = RT.practiceKeptKey(["tOld"], MON);
    const newKey = RT.practiceKeptKey(["tNew"], S2);
    const dropped = ms({ id: "d1", ord: 1, lineageId: "LM", goal: { open: false, archived: true }, measures: [{ ...practiceMeasure("x1", "pl", "tOld", MON, 20) }], items: [item({ lineageId: "pl", kind: "PRACTICE", templateId: "tOld", rule: "TARGET:3/W" })] });
    const again = ms({ id: "d2", ord: 1, lineageId: "LM", startedDay: S2, measures: [{ ...practiceMeasure("x2", "pl", "tNew", S2, 20) }], items: [item({ lineageId: "pl", kind: "PRACTICE", templateId: "tNew", rule: "TARGET:3/W" })] });
    const c = ctxOf({
      milestones: [dropped, again],
      readings: [reading(oldKey, addDays(S2, -1), 6), reading(oldKey, addDays(S2, 3), 9), reading(newKey, addDays(S2, 3), 2)],
      previousProficiency: null,
      templates: { tNew: { rule: "TARGET:3/W", startDay: S2, instances: [{ day: S2, status: "DONE" }, { day: addDays(S2, 1), status: "DONE" }] } },
    });
    const plan = R.planRoadmapWrite(c, at(addDays(S2, 3)));
    const d = PF.parseProficiencyDetail(plan.proficiency!.detail)!;
    eq("kept for the lineage = the old window to the day before the restart (6) + the new one (2), never 9 + 2", d.kept, 8);
  }
  {
    // The rank.
    const fresh = (n: number) => Array.from({ length: n }, (_, i): RT.RankRow => ({ id: `r${i + 1}`, lineageId: `l${i + 1}`, ord: i + 1, carried: false, later: false, rankIndex: null }));
    const goldens = [1, 2, 3, 4, 5, 6].map((n) => {
      const idx = PF.assignRankIndices(fresh(n), {});
      return [fresh(n).map((r) => idx[r.id]), RT.aimRankName(RT.topRankIndexOf(n))];
    });
    eq("rank goldens for a first acceptance, n = 1–6", goldens, [
      [[1], "Aspirant"],
      [[1, 2], "Journeyman"],
      [[1, 2, 3], "Specialist"],
      [[1, 2, 3, 4], "Paragon"],
      [[1, 2, 3, 4, 5], "Paragon"],
      [[1, 2, 3, 4, 5, 5], "Paragon"],
    ]);
    const replan: RT.RankRow[] = [
      { id: "a1", lineageId: "l1", ord: 1, carried: true, later: false, rankIndex: 1 },
      { id: "b2", lineageId: "l2", ord: 2, carried: false, later: false, rankIndex: null },
      ...[3, 4, 5, 6].map((o): RT.RankRow => ({ id: `n${o}`, lineageId: `new${o}`, ord: o, carried: false, later: false, rankIndex: null })),
    ];
    const rp = PF.assignRankIndices(replan, { l1: 1, l2: 2 });
    eq("re-plan: a reached milestone 1 carried, milestone 2 kept, 4 added → [1, 2, 3, 4, 5, 5]", replan.map((r) => rp[r.id]), [1, 2, 3, 4, 5, 5]);
    const shrink: RT.RankRow[] = [
      { id: "a1", lineageId: "l1", ord: 1, carried: true, later: false, rankIndex: 1 },
      { id: "s2", lineageId: "l2", ord: 2, carried: false, later: false, rankIndex: null },
      { id: "s3", lineageId: "l3", ord: 3, carried: false, later: false, rankIndex: null },
      ...[4, 5, 6].map((o): RT.RankRow => ({ id: `s${o}`, lineageId: `l${o}`, ord: o, carried: false, later: true, rankIndex: null })),
    ];
    const sh = PF.assignRankIndices(shrink, { l1: 1, l2: 2, l3: 3, l4: 4, l5: 5, l6: 5 });
    eq("shrink: milestones 4–6 to Later keep nothing, 2 and 3 keep 2 and 3, nothing rises", shrink.map((r) => sh[r.id]), [1, 2, 3, null, null, null]);
    check("… and the plan has had 6, so Paragon still needs the aim", RT.topRankIndexOf(6) === RT.RANK_TOP && PF.aimRankOf({ milestones: [{ ord: 1, rankIndex: 1, reachedDay: "2026-10-01", reachPendingDay: null, scheduled: true }, { ord: 2, rankIndex: 2, reachedDay: null, reachPendingDay: null, scheduled: true }, { ord: 3, rankIndex: 3, reachedDay: null, reachPendingDay: null, scheduled: true }], roadmapReachedDay: null, maxScheduled: 6, today }).top.withAim);
    const capped = PF.assignRankIndices([{ id: "c1", lineageId: "l1", ord: 1, carried: true, later: false, rankIndex: 1 }, { id: "x", lineageId: "l5", ord: 2, carried: false, later: false, rankIndex: null }], { l1: 1, l5: 1 });
    eq("a re-plan never raises a lineage above its first value (place 2, first 1 → 1)", capped.x, 1);
    const archived = PF.aimRankOf({ milestones: [{ ord: 1, rankIndex: 1, reachedDay: null, reachPendingDay: null, scheduled: true }], roadmapReachedDay: null, maxScheduled: 1, today });
    eq("archive then a new 35-day aim: Initiate, top Aspirant (nothing carries between roadmaps)", [archived.name, archived.top.name], ["Initiate", "Aspirant"]);
    const all3 = [1, 2, 3].map((o) => ({ ord: o, rankIndex: o, reachedDay: "2026-10-30", reachPendingDay: null, scheduled: true }));
    eq("Paragon is not given on a 3-milestone plan whose aim is reached", PF.aimRankOf({ milestones: all3, roadmapReachedDay: "2026-11-01", maxScheduled: 3, today }).name, "Specialist");
    const all4 = [1, 2, 3, 4].map((o) => ({ ord: o, rankIndex: o, reachedDay: "2026-10-30", reachPendingDay: null, scheduled: true }));
    const p4 = PF.aimRankOf({ milestones: all4, roadmapReachedDay: "2026-11-01", maxScheduled: 4, today });
    const p4b = PF.aimRankOf({ milestones: all4, roadmapReachedDay: null, maxScheduled: 4, today });
    eq("on a 4-milestone plan Paragon comes with Roadmap.reachedDay, not with the last milestone alone", [p4.name, p4.newSince, p4b.name, p4b.next.kind], ["Paragon", "2026-11-01", "Expert", "paragon"]);
  }
  {
    // A 12-step series: the rank never falls.
    type S = { ord: number; rankIndex: number | null; reachedDay: string | null; reachPendingDay: string | null; scheduled: boolean };
    const steps: [string, S[], number, string | null][] = [];
    const row = (ord: number, rankIndex: number | null, reachedDay: string | null = null, scheduled = true, reachPendingDay: string | null = null): S => ({ ord, rankIndex, reachedDay, reachPendingDay, scheduled });
    steps.push(["accept a 2-milestone plan", [row(1, 1), row(2, 2)], 2, null]);
    steps.push(["reach milestone 1", [row(1, 1, "2026-10-10"), row(2, 2)], 2, null]);
    steps.push(["a degradation (reachedDay stays)", [row(1, 1, "2026-10-10"), row(2, 2)], 2, null]);
    steps.push(["a re-plan grows n to 6", [row(1, 1, "2026-10-10"), row(2, 2), row(3, 3), row(4, 4), row(5, 5), row(6, 5)], 6, null]);
    steps.push(["reach milestone 2", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3), row(4, 4), row(5, 5), row(6, 5)], 6, null]);
    steps.push(["move 4–6 to Later", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3), row(4, null, null, false), row(5, null, null, false), row(6, null, null, false)], 6, null]);
    steps.push(["drop milestone 3", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3)], 6, null]);
    steps.push(["Start again (rankIndex copied)", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3), row(3, 3)], 6, null]);
    steps.push(["a pending reach of the copy", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3), row(3, 3, null, true, "2026-12-30")], 6, null]);
    steps.push(["its tick undone (pending cleared)", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3), row(3, 3)], 6, null]);
    steps.push(["reach the copy", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3), row(3, 3, "2027-01-04")], 6, null]);
    steps.push(["Undo of a re-plan (reached rows unchanged)", [row(1, 1, "2026-10-10"), row(2, 2, "2026-11-20"), row(3, 3, "2027-01-04")], 6, null]);
    const ranks = steps.map(([, milestones, maxScheduled, aim]) => PF.aimRankOf({ milestones, roadmapReachedDay: aim, maxScheduled, today: "2027-02-01" }).index);
    check("the rank never falls over the 12-step series", ranks.every((r, i) => i === 0 || r >= ranks[i - 1]) && json(ranks) === json([0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3]), json(ranks));
    const waiting = PF.aimRankOf({ milestones: steps[8][1], roadmapReachedDay: null, maxScheduled: 6, today: "2026-12-30" });
    eq("a pending reach moves no rank and reads 'counts from' + 2 days", [waiting.index, waiting.pending], [2, { milestoneOrd: 3, countsFrom: "2027-01-01" }]);
  }
  {
    // Next rank, keeps, top, the ladder, and the "new" marker (F20).
    const r3 = [1, 2, 3].map((o) => ({ ord: o, rankIndex: o, reachedDay: null as string | null, reachPendingDay: null as string | null, scheduled: true }));
    const v = PF.aimRankOf({ milestones: r3, roadmapReachedDay: null, maxScheduled: 3, today });
    eq("next rank: Aspirant at milestone 1; top on this plan: Specialist", [v.next, v.top], [{ kind: "milestone", index: 1, name: "Aspirant", milestoneOrd: 1 }, { index: 3, name: "Specialist", withAim: false }]);
    eq("the ladder: Initiate given, Aspirant next, Journeyman and Specialist later, no Paragon", v.ladder.map((l) => [l.name, l.milestoneOrd, l.state]), [
      ["Initiate", null, "given"],
      ["Aspirant", 1, "next"],
      ["Journeyman", 2, "later"],
      ["Specialist", 3, "later"],
    ]);
    const six = [1, 2, 3, 4, 5, 5].map((r, i) => ({ ord: i + 1, rankIndex: r, reachedDay: i < 5 ? "2026-10-01" : null, reachPendingDay: null, scheduled: true }));
    eq("milestone 6 keeps your rank", PF.aimRankOf({ milestones: six, roadmapReachedDay: null, maxScheduled: 6, today }).next, { kind: "keeps", milestoneOrd: 6 });
    const all6 = six.map((m) => ({ ...m, reachedDay: "2026-10-01" }));
    eq("every milestone reached, not the aim: next rank Paragon when the aim is reached", PF.aimRankOf({ milestones: all6, roadmapReachedDay: null, maxScheduled: 6, today }).next, { kind: "paragon" });
    const ladder6 = PF.aimRankOf({ milestones: all6, roadmapReachedDay: null, maxScheduled: 6, today }).ladder;
    eq("a 6-plan's ladder lists Virtuoso at milestone 5 and Paragon with the aim, next", ladder6.slice(-2).map((l) => [l.name, l.milestoneOrd, l.state]), [
      ["Virtuoso", 5, "given"],
      ["Paragon", null, "next"],
    ]);
    const newDay = addDays(today, -3);
    const shown = (d: DayKey, t: DayKey) => PF.aimRankOf({ milestones: [{ ord: 1, rankIndex: 1, reachedDay: d, reachPendingDay: null, scheduled: true }], roadmapReachedDay: null, maxScheduled: 2, today: t }).newSince;
    eq("the 'new' marker shows for 7 days from the confirmed reachedDay", [shown(newDay, today), shown(today, addDays(today, 6)), shown(today, addDays(today, 7))], [newDay, today, null]);
    eq("… and never for a pending reach", PF.aimRankOf({ milestones: [{ ord: 1, rankIndex: 1, reachedDay: null, reachPendingDay: today, scheduled: true }], roadmapReachedDay: null, maxScheduled: 2, today }).newSince, null);
  }

  // ═══ Fix round (roadmap-contracts.md §9.4; the three reviews) ═══════════

  console.log("— fix round: a fully held window (Lens 1 minor 8, R1-5) —");
  {
    const window = { startedDay: MON, dueDay: addDays(MON, 41), asOf: addDays(MON, 20) };
    const everyDay = Array.from({ length: 42 }, (_, i) => addDays(MON, i));
    const v = M.practiceKeptValue([{ templateId: "tb", rule: "TARGET:1/W", startDay: MON, instances: [] }], window, everyDay);
    eq("a window held from start to due plans nothing: effTarget 0", [v.planned, v.held, v.effTarget], [6, 6, 0]);
    eq("measureFraction: nothing planned is nothing kept (0, never 1); nothingPlanned reads effTarget ≤ 0", [
      M.measureFraction({ kind: "PRACTICE_KEPT", baseline: null, target: 5 }, 3, { effTarget: 0 }),
      M.measureFraction({ kind: "PRACTICE_KEPT", baseline: null, target: 0 }, 0),
      M.nothingPlanned({ kind: "PRACTICE_KEPT", target: 5 }, { effTarget: 0 }),
      M.nothingPlanned({ kind: "PRACTICE_KEPT", target: 5 }, { effTarget: 4 }),
      M.nothingPlanned({ kind: "CARDS_AT_LEVEL", target: 0 }, null),
    ], [0, 0, true, false, false]);
    const KP = RT.practiceKeptKey(["tb"], MON);
    const day = addDays(MON, 20);
    const held0 = [reading(KP, day, 0, { kept: 0, planned: 6, held: 6, effTarget: 0 })];
    const onlyPractice: M.SeriesMilestone = { id: "p", measures: [practiceMeasure("p1", "pl", "tb", MON, 5)], labels: {} };
    const g0 = M.milestoneGOn(onlyPractice, held0, [], day);
    eq("a practice-only milestone over a fully held window reads 0, 'no planned sessions' (pays 0), never 1", [g0.g, g0.binding?.label, g0.binding?.class], [0, M.NO_PLANNED_SESSIONS, "SELF_REPORTED"]);
    eq("… and its stored series reads the same point, so Today, the ladder and the close agree", M.milestoneGoalSeries(onlyPractice, held0, []).map((p) => [p.day, p.g, p.bindingLabel]), [[day, 0, M.NO_PLANNED_SESSIONS]]);
    // A window held after the fact (a freeze on the days still planned): the older reading kept 5 of 5, the newer plans nothing.
    const later = addDays(day, 2);
    const retro = [reading(KP, day, 5, { kept: 5, planned: 6, held: 0, effTarget: 5 }), reading(KP, later, 5, { kept: 5, planned: 6, held: 6, effTarget: 0 })];
    const lastPoint = M.milestoneGoalSeries(onlyPractice, retro, []).filter((p) => p.day <= later).pop();
    check(
      "the seam rule (the last point ≤ as-of) equals milestoneGOn when the newest reading plans nothing (0, never the older point's 1)",
      lastPoint?.g === 0 && M.milestoneGOn(onlyPractice, retro, [], later).g === 0,
      json({ lastPoint, g: M.milestoneGOn(onlyPractice, retro, [], later).g })
    );
    const both: M.SeriesMilestone = { id: "b", measures: [cardsMeasure("b1", [D_P], 6, 20, 10), practiceMeasure("b2", "pl", "tb", MON, 5)], labels: {} };
    const gb = M.milestoneGOn(both, [reading(K6, day, 16), ...held0], [], day);
    check(
      "a milestone with cards binds on its cards when its practice has nothing planned (0.6, 'tested by your reviews'; the practice part reads null)",
      gb.g != null && Math.abs(gb.g - 0.6) < 1e-12 && gb.binding?.class === "MEASURED" && M.milestoneHeadlineOf(gb)?.figure.caption === "tested by your reviews" && gb.parts.some((p) => p.measureKey === KP && p.fraction === null),
      json(gb)
    );
    const plan = R.planRoadmapWrite(ctxOf({ milestones: [practiceMs()], heldDays: everyDay, templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: [] } } }), at(day));
    const row = plan.rows.find((r) => r.measureKey === RT.practiceKeptKey(["tb"], MON));
    check(
      "the writer: a practice-only milestone held from start to due writes effTarget 0, reads g 0 and pends no reach (it used to read g = 1)",
      (row?.detail as M.PracticeKeptDetail | undefined)?.effTarget === 0 && plan.g["mp"]?.g === 0 && plan.reaches.length === 0,
      json({ detail: row?.detail, g: plan.g["mp"]?.g, reaches: plan.reaches })
    );
  }

  console.log("— fix round: one due day (Lens 1 major 2, R1-2) —");
  {
    const rowDue = "2026-10-01";
    const goalDue = "2026-11-01";
    const t5 = "2026-10-05";
    const resched = (goal: RR.CtxMilestone["goal"]) =>
      ms({ id: "mr", ord: 1, windowStart: "2026-09-01", startedDay: "2026-09-01", dueDay: rowDue, goalId: "g-mr", goal, measures: [cardsMeasure("mr1", [D_P], 6, 20, 10)] });
    const moved = resched({ open: true, archived: false, dueDay: goalDue });
    eq("dueOf: the goal's due day once started (a Reschedule moves only that), else the row's", [R.dueOf(moved), R.dueOf(resched({ open: true, archived: false })), R.dueOf(resched(null))], [goalDue, rowDue, rowDue]);
    const c = (m: RR.CtxMilestone) => ctxOf({ milestones: [m], readings: [reading(K6, "2026-09-30", 12)], histogram: hist([D_P, 6, 20]) });
    const store = new Store();
    const client = stubClient(store);
    const close = await R.readingOpsFor(UID, "g-mr", at(t5), { env: ON, client, loadContext: async () => c(moved), closing: true });
    check(
      "a rescheduled goal (row due 1 Oct, goal due 1 Nov) closes on today's rows: its point is today's (5 Oct), g = 1, and the close reaches",
      close.ok && close.point?.day === t5 && close.point.g === 1 && close.g === 1 && close.reach.kind === "reach",
      json(close.ok ? { point: close.point, g: close.g, reach: close.reach } : close)
    );
    if (close.ok) await runOps(client, [...close.ops, ...(close.reachOps ?? [])]);
    eq("… and its transaction confirms the reach (reachedDay = today) beside the rows it pays from", [store.milestones.get("mr")?.reachedDay, store.get(K6, t5)?.value], [t5, 20]);
    const old = await R.readingOpsFor(UID, "g-mr", at(t5), { env: ON, client: stubClient(new Store()), loadContext: async () => c(resched({ open: true, archived: false })), closing: true });
    check(
      "… where the row's own due day alone judges it as of 1 Oct (the stored 12: g 0.2, no reach)",
      old.ok && old.point?.day === rowDue && old.g != null && Math.abs(old.g - 0.2) < 1e-12 && old.reach.kind === "none",
      json(old.ok ? { point: old.point, g: old.g, reach: old.reach } : old)
    );
    const writer = R.planRoadmapWrite(c(moved), at(t5));
    eq("the writer judges the reach on the goal's due day too (a cards-only reach today)", writer.reaches.map((r) => r.action), [{ kind: "reach", day: t5 }]);
    const pm = { ...practiceMs(), goal: { open: true, archived: false, dueDay: addDays(MON, 55) } };
    const pplan = R.planRoadmapWrite(ctxOf({ milestones: [pm], templates: { tb: { rule: "TARGET:1/W", startDay: MON, instances: ticks(3) } } }), at(addDays(MON, 15)));
    const prow = pplan.rows.find((r) => r.measureKey === RT.practiceKeptKey(["tb"], MON))?.detail as M.PracticeKeptDetail | undefined;
    eq("PRACTICE_KEPT's window runs to the goal's due day after a Reschedule (8 weeks of 1/W plan 8, effTarget 6)", [prow?.planned, prow?.effTarget], [8, 6]);
  }

  console.log("— fix round: positions by lineage (Lens 1 majors 3–5, R1-3, R1-4) —");
  {
    const S2 = addDays(MON, 21);
    const KI6 = RT.cardsAtLevelKey([D_I], 6);
    // Milestone 2 dropped (its goal archived), started again as a copy, then the original goal unarchived (open again).
    const orig = ms({ id: "o1", ord: 2, lineageId: "LS", createdAt: "2026-10-05T01:00:00.000Z", goalId: "g-o1", goal: { open: true, archived: false }, measures: [cardsMeasure("o11", [D_P], 6, 20, 10)] });
    const copyPlanned = ms({ id: "o2", ord: 2, lineageId: "LS", status: "PLANNED", startedDay: null, goalId: null, goal: null, createdAt: "2026-10-20T01:00:00.000Z", measures: [cardsMeasure("o21", [D_I], 6, 20, 10)] });
    const copyStarted = ms({ ...copyPlanned, status: "STARTED", startedDay: S2, goalId: "g-o2", goal: { open: true, archived: false } });
    const h = hist([D_P, 6, 20], [D_I, 6, 14]);
    const day = addDays(S2, 3);
    const planned = R.planRoadmapWrite(ctxOf({ milestones: [orig, copyPlanned], histogram: h }), at(day));
    check("a PLANNED copy supersedes nothing: the unarchived original is measured (unarchiving undoes DROPPED)", planned.rows.some((r) => r.measureKey === K6) && planned.g["o1"]?.g === 1, json(planned.rows.map((r) => r.measureKey)));
    const both = ctxOf({ milestones: [orig, copyStarted], histogram: h });
    eq("supersededIdsOf: once the copy starts, the original is superseded (createdAt orders them)", Array.from(R.supersededIdsOf(both.milestones)), ["o1"]);
    const plan = R.planRoadmapWrite(both, at(day));
    check(
      "the writers skip a superseded row: no reading and no reach for the original, the copy measured",
      !plan.rows.some((r) => r.measureKey === K6) && plan.rows.some((r) => r.measureKey === KI6) && plan.g["o1"] === undefined && !plan.reaches.some((r) => r.milestoneId === "o1"),
      json({ rows: plan.rows.map((r) => r.measureKey), reaches: plan.reaches })
    );
    const closeOrig = await R.readingOpsFor(UID, "g-o1", at(day), { env: ON, client: stubClient(new Store()), loadContext: async () => both, closing: true });
    const closeCopy = await R.readingOpsFor(UID, "g-o2", at(day), { env: ON, client: stubClient(new Store()), loadContext: async () => both, closing: true });
    check(
      "drop → Start again → unarchive → close: the original's close is refused for good ('replaced by Start again', so it pays 0), the copy's is measured — one lineage pays once",
      !closeOrig.ok && closeOrig.final === true && closeOrig.reason === R.SUPERSEDED_NOTE && closeCopy.ok && closeCopy.g != null && Math.abs(closeCopy.g - 0.4) < 1e-12,
      json({ closeOrig, copyG: closeCopy.ok && closeCopy.g })
    );
    const positions: RT.PositionRow[] = [orig, copyStarted].map((m) => ({ id: m.id, lineageId: m.lineageId, version: m.version, status: m.status, rankIndex: m.rankIndex, createdAt: m.createdAt }));
    const scheduled = [{ lineageId: "L1", ord: 1 }, { lineageId: "LS", ord: 2 }, { lineageId: "LS", ord: 2 }, { lineageId: "L3", ord: 3 }];
    const entryOf = (m: RR.CtxMilestone) => R.goalSeriesEntryOf({ milestone: m, roadmap: { status: "ACTIVE", archiveReason: null, scheduled, positions }, stated: 6, readings: [reading(K6, day, 20), reading(KI6, day, 14)] });
    const eo = entryOf(orig);
    const ec = entryOf(copyStarted);
    eq("the goal series: the superseded original gets no points and the note; the copy keeps its series; both read milestone 2 of 3", [eo.series.length, eo.note, ec.series.length, ec.note, eo.ord, eo.of, ec.ord, ec.of], [0, "replaced by Start again", 1, null, 2, 3, 2, 3]);
    // assignRankIndices: one place per lineage.
    const rows: RT.RankRow[] = [
      { id: "a1", lineageId: "l1", ord: 1, carried: true, later: false, rankIndex: 1 },
      { id: "a2", lineageId: "l2", ord: 2, carried: true, later: false, rankIndex: 2 },
      { id: "a2b", lineageId: "l2", ord: 2, carried: true, later: false, rankIndex: 2 },
      { id: "n3", lineageId: "l3", ord: 3, carried: false, later: false, rankIndex: null },
      { id: "n4", lineageId: "l4", ord: 4, carried: false, later: false, rankIndex: null },
    ];
    const idx = PF.assignRankIndices(rows, { l1: 1, l2: 2 });
    eq("assignRankIndices: a dropped row and its started copy take one place, so the re-plan's new milestones get places 3 and 4 (never 4 and 5)", rows.map((r) => idx[r.id]), [1, 2, 2, 3, 4]);
    const draftOfCarried: RT.RankRow[] = [
      { id: "a1", lineageId: "l1", ord: 1, carried: true, later: false, rankIndex: 1 },
      { id: "a2", lineageId: "l2", ord: 2, carried: true, later: false, rankIndex: 2 },
      { id: "d2", lineageId: "l2", ord: 3, carried: false, later: false, rankIndex: null },
      { id: "d5", lineageId: "l5", ord: 4, carried: false, later: false, rankIndex: null },
    ];
    const idx2 = PF.assignRankIndices(draftOfCarried, { l1: 1 });
    eq("… and a draft row of a carried lineage (its PLANNED copy re-planned) shares that lineage's place: [1, 2, 2, 3]", draftOfCarried.map((r) => idx2[r.id]), [1, 2, 2, 3]);
    eq("… while LATER rows still take no place", PF.assignRankIndices([...rows.slice(0, 3), { id: "z", lineageId: "lz", ord: 3, carried: false, later: true, rankIndex: null }, rows[3]], { l1: 1, l2: 2 }), { a1: 1, a2: 2, a2b: 2, n3: 3, z: null });
  }

  console.log("— fix round: readingOpsFor refuses only for good (Lens 1 major 1, R1-1) —");
  {
    const day = "2026-11-04";
    const deps = (loadContext: RR.ReadingsDeps["loadContext"]) => ({ env: ON, client: stubClient(new Store()), loadContext, closing: true });
    const missing = Object.assign(new Error("The table `public.RoadmapMilestone` does not exist in the current database."), { code: "P2021", meta: { table: "public.RoadmapMilestone" } });
    const timeout = Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024" });
    const noTable = await R.readingOpsFor(UID, "g-mc", at(day), deps(async () => { throw missing; }));
    const noCtx = await R.readingOpsFor(UID, "g-mc", at(day), deps(async () => null));
    const draft = await R.readingOpsFor(UID, "g-mc", at(day), deps(async () => ctxOf({ roadmap: { id: RID, status: "DRAFT", version: 0, reachedDay: null, archiveReason: null }, milestones: [cardsMs()] })));
    const noRow = await R.readingOpsFor(UID, "g-other", at(day), deps(async () => ctxOf({ milestones: [cardsMs()] })));
    const reset = await R.readingOpsFor(UID, "g-mc", at(day), deps(async () => ctxOf({ roadmap: { id: RID, status: "ARCHIVED", version: 1, reachedDay: null, archiveReason: resetArchiveReason("Mon 2 Nov") }, milestones: [cardsMs()] })));
    const mine = await R.readingOpsFor(UID, "g-mc", at(day), deps(async () => ctxOf({ roadmap: { id: RID, status: "ARCHIVED", version: 1, reachedDay: null, archiveReason: "I want to reset my approach" }, milestones: [cardsMs()] })));
    const refusals = [noTable, noCtx, draft, noRow, reset, mine];
    check("every deterministic refusal is final (a missing table, no roadmap, a DRAFT roadmap, no milestone, an archived roadmap)", refusals.every((r) => !r.ok && r.final === true), json(refusals));
    eq("… with its words", refusals.map((r) => (r.ok ? null : r.reason)), [R.MISSING_TABLES, R.NOT_A_MILESTONE, RT.ROADMAP_NOT_YET, R.NOT_A_MILESTONE, RESET_ARCHIVE_NOTE, "This roadmap is archived: its measures are no longer recorded"]);
    check("a reset is told by reset-scopes isResetArchiveReason: a user's own archive reason that says 'reset' is not one", !mine.ok && mine.reason !== RESET_ARCHIVE_NOTE);
    check("a transient failure (a pool timeout, P2024) is thrown, never a refusal: the close fails and writes nothing", await rejects(() => R.readingOpsFor(UID, "g-mc", at(day), deps(async () => { throw timeout; }))));
    check("a code error inside the loader is thrown too", await rejects(() => R.readingOpsFor(UID, "g-mc", at(day), deps(async () => { throw new TypeError("Cannot read properties of undefined"); }))));
  }

  console.log("— fix round: the writers report their failures (Lens 1 minor 7, R1-6) —");
  {
    const day = "2026-11-04";
    const run = (loadContext: RR.ReadingsDeps["loadContext"]) => quietly(() => R.recordRoadmapReadings(UID, at(day), { env: ON, caller: "LIFE_CRON", client: stubClient(new Store()), loadContext }));
    const boom = await run(async () => { throw new Error("connection reset"); });
    check("a failed run never throws and returns its error", boom.written === 0 && boom.skipped === null && boom.error === "connection reset", json(boom));
    eq("… which the step's errors carry (roadmapStepErrorsOf)", RT.roadmapStepErrorsOf({ readings: boom }), ["readings: connection reset"]);
    const blank = await run(async () => { throw new Error(""); });
    check("an error with no message still reports (never blank, so it reaches the cron's errors)", typeof blank.error === "string" && blank.error.trim().length > 0 && RT.roadmapStepErrorsOf({ readings: blank }).length === 1, json(blank));
    const missing = Object.assign(new Error("relation \"RoadmapReading\" does not exist"), { code: "P2010", meta: { code: "42P01" } });
    const gone = await run(async () => { throw missing; });
    check("a missing table is skipped MISSING_TABLE, not an error", gone.skipped === "MISSING_TABLE" && gone.error === undefined && RT.roadmapStepErrorsOf({ readings: gone }).length === 0, json(gone));
  }

  console.log("— fix round: the zero reason reads back the Start arithmetic (Lens 1 major 6, Lens 2 minor 19, R1-7) —");
  {
    eq("zeroReasonOf follows statedForMilestone: a paid lineage comes first; no practice and no cards is under an hour", [
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 90, plannedTrackedMinutesPerWeek: 200, lineagePaidOn: "2026-03-03" }),
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 30, plannedTrackedMinutesPerWeek: 200, lineagePaidOn: "2026-03-03" }),
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 0, plannedTrackedMinutesPerWeek: 0, hasCards: false }),
      M.zeroReasonOf({ stated: 0, practiceMinutesPerWeek: 0, plannedTrackedMinutesPerWeek: 0, hasCards: true }),
      M.zeroReasonOf({ stated: 6, practiceMinutesPerWeek: 0, plannedTrackedMinutesPerWeek: 0, lineagePaidOn: "2026-03-03" }),
    ], ["LINEAGE_PAID", "LINEAGE_PAID", "PRACTICE_UNDER_HOUR", "KNOWLEDGE_ONLY", null]);
    eq("LINEAGE_PAID's words carry its day; the others are unchanged", [M.zeroReasonWordsOf("LINEAGE_PAID", "2026-03-03"), M.zeroReasonWordsOf("LINEAGE_PAID", null), M.zeroReasonWordsOf("PRACTICE_UNDER_HOUR", "2026-03-03")], [
      "this milestone already paid on 3 Mar",
      "this milestone already paid",
      "practice under an hour a week",
    ]);
    // Two 40-minute practices (2 × 20 min a week each), one switched off at Start; reviews 60 and 4 new cards (× 5 min) a week.
    const weeks = [{ reviewMin: 60, newPerWeek: 4, practiceMin: 80 }] as unknown as RT.StartWeek[];
    const snap = { kind: "START", weeks } as unknown as RT.StartSnapshot;
    const practice = (lineageId: string, addToToday: boolean) => item({ lineageId, kind: "PRACTICE", sessionsPerWeek: 2, durationBand: "D20", addToToday });
    const oneOff = { items: [practice("pa", true), practice("pb", false)], measures: [cardsMeasure("z1", [D_P], 6, 20, 10)] };
    const bothOn = { items: [practice("pa", true), practice("pb", true)], measures: oneOff.measures };
    const basis: RT.StartPayBasis = { otherMinutesPerWeek: RT.otherTrackedMinutesOf(weeks), hasCards: true, lineagePaidOn: null };
    const rowsOf = [{ lineageId: "pa", weeklyMinutes: 40 }, { lineageId: "pb", weeklyMinutes: 40 }];
    eq("statedReadBackOf is startStatedInputOf over the same switches (the arithmetic the sheet and finishStartCore use)", [M.statedReadBackOf(oneOff, snap), M.statedReadBackOf(bothOn, snap)], [RT.startStatedInputOf(basis, rowsOf, ["pb"]), RT.startStatedInputOf(basis, rowsOf, [])]);
    eq("… so it states what Start froze: one practice off is 0 'practice under an hour', both on is 6", [statedForMilestone(M.statedReadBackOf(oneOff, snap)), statedForMilestone(M.statedReadBackOf(bothOn, snap)).stated], [{ stated: 0, zeroReason: "PRACTICE_UNDER_HOUR", paidOn: null }, 6]);
    const entry = (items: RT.ItemDraft[], stated: number, lineagePaidOn: DayKey | null = null) =>
      R.goalSeriesEntryOf({
        milestone: { id: "z", lineageId: "LZ", ord: 1, items, measures: oneOff.measures, feasibility: snap },
        roadmap: { status: "ACTIVE", archiveReason: null, scheduled: [{ lineageId: "LZ", ord: 1 }] },
        stated,
        readings: [],
        lineagePaidOn,
      }).zeroReason;
    eq("the board's words: switched under the floor; a paid lineage with its day; a paying goal none", [entry(oneOff.items, 0), entry(bothOn.items, 0, "2026-03-03"), entry(bothOn.items, 0), entry(bothOn.items, 6)], [
      "practice under an hour a week",
      "this milestone already paid on 3 Mar",
      "this milestone already paid",
      null,
    ]);
    // Fix round 2: with today, a paid day in another year carries its year (as the roadmap page's dayLabel words it).
    const entryOn = (today: DayKey) =>
      R.goalSeriesEntryOf({
        milestone: { id: "z", lineageId: "LZ", ord: 1, items: bothOn.items, measures: oneOff.measures, feasibility: snap },
        roadmap: { status: "ACTIVE", archiveReason: null, scheduled: [{ lineageId: "LZ", ord: 1 }] },
        stated: 0,
        readings: [],
        lineagePaidOn: "2025-12-20",
        today,
      }).zeroReason;
    eq("fix round 2: a goal's paid lineage reads its year across a year ('… on 20 Dec 2025' on 5 Jan 2026), none within it", [entryOn("2026-01-05"), entryOn("2025-12-28")], [
      "this milestone already paid on 20 Dec 2025",
      "this milestone already paid on 20 Dec",
    ]);
  }

  console.log("— fix round 2: one wording with the roadmap page (lane T's handoff, §11.4.6) —");
  {
    // The four reasons word for word; "practice under a third …" lost its "is", so Today, the You
    // ladder (R1's words through loadRoadmapGoalSeries) and the roadmap page and Aim card (R5's
    // ZERO_REASON_LINE) read one milestone's reason the same.
    eq("ZERO_REASON_WORDS word for word (no 'practice is under a third')", M.ZERO_REASON_WORDS, {
      KNOWLEDGE_ONLY: "knowledge is paid by reviews",
      PRACTICE_UNDER_HOUR: "practice under an hour a week",
      PRACTICE_UNDER_SHARE: "practice under a third of this milestone's planned time",
      LINEAGE_PAID: "this milestone already paid",
    });
    const codes = Object.keys(ZERO_REASON_LINE) as (keyof typeof ZERO_REASON_LINE)[];
    const drift = codes.filter((c) => M.ZERO_REASON_WORDS[c] !== ZERO_REASON_LINE[c]);
    check(
      "every zero reason equals the roadmap page's (roadmap-copy ZERO_REASON_LINE), and both word the same four codes",
      codes.length === 4 && drift.length === 0 && json(Object.keys(M.ZERO_REASON_WORDS).sort()) === json([...codes].sort()),
      drift.map((c) => `${c}: '${M.ZERO_REASON_WORDS[c]}' vs '${ZERO_REASON_LINE[c]}'`).join("; ")
    );
    // LINEAGE_PAID's day: the year only when today is in another year; no today (or garbage) reads as before.
    eq("zeroReasonWordsOf with today: the year across a year only; the other reasons ignore it", [
      M.zeroReasonWordsOf("LINEAGE_PAID", "2025-12-20", "2026-01-05"),
      M.zeroReasonWordsOf("LINEAGE_PAID", "2026-03-03", "2026-11-05"),
      M.zeroReasonWordsOf("LINEAGE_PAID", "2025-12-20"),
      M.zeroReasonWordsOf("LINEAGE_PAID", "2025-12-20", null),
      M.zeroReasonWordsOf("LINEAGE_PAID", "2025-12-20", "garbage" as DayKey),
      M.zeroReasonWordsOf("LINEAGE_PAID", null, "2026-01-05"),
      M.zeroReasonWordsOf("PRACTICE_UNDER_SHARE", "2025-12-20", "2026-01-05"),
    ], [
      "this milestone already paid on 20 Dec 2025",
      "this milestone already paid on 3 Mar",
      "this milestone already paid on 20 Dec",
      "this milestone already paid on 20 Dec",
      "this milestone already paid on 20 Dec",
      "this milestone already paid",
      "practice under a third of this milestone's planned time",
    ]);
    // The same reason on Today and on the page: R1's words equal R5's zeroReasonWords for every code, with and without today.
    const cases: [keyof typeof ZERO_REASON_LINE, DayKey | null, DayKey | undefined][] = [];
    for (const c of codes) for (const paidOn of ["2025-12-20", "2026-03-03", null] as (DayKey | null)[]) for (const today of ["2026-01-05", "2026-12-31", undefined] as (DayKey | undefined)[]) cases.push([c, paidOn, today]);
    const differ = cases.filter(([c, paidOn, today]) => M.zeroReasonWordsOf(c, paidOn, today) !== zeroReasonWords(c, paidOn, today));
    check(
      `zeroReasonWordsOf equals the roadmap page's zeroReasonWords on all ${cases.length} cases (4 codes × paid day × today, across a year)`,
      cases.length === 36 && differ.length === 0,
      differ.map(([c, p, t]) => `${c} ${p} ${t}: '${M.zeroReasonWordsOf(c, p, t)}' vs '${zeroReasonWords(c, p, t)}'`).join("; ")
    );
  }

  console.log("— fix round: a reset is reset-scopes' own (lane G handoff 3) —");
  {
    const m = cardsMs();
    const note = (archiveReason: string | null) => R.goalSeriesEntryOf({ milestone: m, roadmap: { status: "ARCHIVED", archiveReason, scheduled: [{ lineageId: m.lineageId, ord: 1 }] }, stated: 6, readings: [reading(K6, "2026-11-01", 15)] }).note;
    eq("the note: RESET_ARCHIVE_NOTE for resetArchiveReason(…), 'roadmap archived' for the user's own words (even with 'reset' in them)", [note(resetArchiveReason("Mon 2 Nov")), note("I want to reset my approach"), note(null)], [RESET_ARCHIVE_NOTE, "roadmap archived", "roadmap archived"]);
  }

  console.log("— fix round: the loaders on a stub client (no database) —");
  {
    // loadRoadmapContext: the goal's due day, createdAt, the as-of read of a goal rescheduled to a day now past, and held days to the goal's due day.
    const today = "2026-11-05";
    const rowDue = "2026-10-01";
    const goalDue = "2026-11-01";
    const msRow = {
      id: "mr",
      roadmapId: RID,
      version: 1,
      lineageId: "LR",
      ord: 1,
      title: "Milestone 1",
      titleOrigin: "USER",
      titleDecision: "EDITED",
      windowStart: dateColumn("2026-09-01"),
      dueDay: dateColumn(rowDue),
      status: "STARTED",
      goalId: "g-mr",
      startedDay: dateColumn("2026-09-01"),
      startingAt: null,
      reachedDay: null,
      reachPendingDay: null,
      overAccepted: false,
      feasibility: null,
      rankIndex: 1,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      items: [],
      measures: [{ id: "mr1", milestoneId: "mr", kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: [D_P] }, minLevel: 6, target: 20, targetSource: "WORKED_OUT", fittedTarget: 20, rateSource: "SCOPE", baseline: 10, baselineDay: dateColumn("2026-09-01"), unit: "card", itemLineageId: null, measureKey: K6 }],
    };
    const history = [
      { measureKey: K6, day: "2026-09-30", value: 12 },
      { measureKey: K6, day: "2026-10-31", value: 20 },
      { measureKey: K6, day: "2026-11-04", value: 15 },
    ].map((r) => ({ ...r, day: dateColumn(r.day), detail: null, source: "COMPUTED", observedAt: at(r.day) }));
    const findFirsts: { key: string; until: DayKey }[] = [];
    const restWheres: unknown[] = [];
    const loaderStub = {
      roadmap: { findFirst: async () => ({ id: RID, status: "ACTIVE", version: 1, reachedDay: null, archiveReason: null, milestones: [msRow], acceptances: [] }) },
      $queryRaw: async () => history.filter((r) => keyOfDateColumn(r.day) <= today).slice(-1),
      roadmapReading: {
        findFirst: async (args: { where: { measureKey: string; day: { lte: Date } } }) => {
          const until = keyOfDateColumn(args.where.day.lte);
          findFirsts.push({ key: args.where.measureKey, until });
          return history.filter((r) => r.measureKey === args.where.measureKey && keyOfDateColumn(r.day) <= until).pop() ?? null;
        },
      },
      idea: { groupBy: async () => [{ domainId: D_P, level: 6, _count: { _all: 15 } }] },
      domain: { findMany: async () => [{ id: D_P, name: "Probability" }] },
      taskTemplate: {
        findMany: async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) =>
          args.select.closedScore ? [{ id: "g-mr", closedScore: null, archivedAt: null, dueDay: dateColumn(goalDue) }] : [],
      },
      taskInstance: { findMany: async () => [] },
      restDay: {
        findMany: (args: { where: unknown }) => {
          restWheres.push(args.where);
          return Promise.resolve([{ day: dateColumn("2026-10-20"), kind: "REST", declaredAt: new Date("2026-10-10T00:00:00.000Z"), cancelledAt: null }]);
        },
      },
      activityEvent: { findMany: async () => [] },
    } as unknown as RR.RoadmapReadingsClient;
    const ctx = await R.loadRoadmapContext(loaderStub, { userId: UID, goalId: "g-mr" }, today);
    const m = ctx?.milestones[0];
    eq("the loader reads the goal's due day and the row's createdAt", [m?.goal?.dueDay, m?.createdAt, m ? R.dueOf(m) : null], [goalDue, "2026-09-01T00:00:00.000Z", goalDue]);
    check("a goal rescheduled to a day now past gets its as-of read on the goal's due day (1 Nov), beside the row's own (1 Oct)", findFirsts.some((f) => f.until === goalDue) && findFirsts.some((f) => f.until === rowDue), json(findFirsts));
    check("held days run to the goal's due day: a rest day on 20 Oct (after the row's 1 Oct) is held; the rest read has no upper bound", !!ctx?.heldDays.includes("2026-10-20") && restWheres.every((w) => !(w as { day?: { lte?: unknown } }).day?.lte), json({ held: ctx?.heldDays, restWheres }));
    const plan = ctx ? R.planRoadmapWrite(ctx, at(today)) : null;
    check("past due on the goal's day: g reads the 31 Oct reading (20 → 1), not the slip after it (15) nor the row's day (12)", plan?.g["mr"]?.g === 1, json(plan?.g["mr"]));

    // loadRoadmapGoalSeries: a superseded original and its copy; a copy that states 0 because its lineage paid.
    const dbMs = (id: string, goalId: string, createdAt: string, items: unknown[] = [], feasibility: unknown = null) => ({
      ...msRow,
      id,
      lineageId: "LS",
      ord: 2,
      goalId,
      createdAt: new Date(createdAt),
      items,
      feasibility,
      measures: [{ ...msRow.measures[0], id: `${id}-m`, milestoneId: id }],
    });
    const siblings = [
      { id: "o1", lineageId: "LS", ord: 2, status: "STARTED", version: 1, rankIndex: 2, createdAt: new Date("2026-10-05T01:00:00.000Z"), goalId: "g-o1" },
      { id: "o2", lineageId: "LS", ord: 2, status: "STARTED", version: 1, rankIndex: 2, createdAt: new Date("2026-10-20T01:00:00.000Z"), goalId: "g-o2" },
      { id: "m1", lineageId: "L1", ord: 1, status: "STARTED", version: 1, rankIndex: 1, createdAt: new Date("2026-09-01T01:00:00.000Z"), goalId: "g-m1" },
    ];
    const roadmapOf = { status: "ACTIVE", archiveReason: null, milestones: siblings };
    let mintReads = 0;
    let mintKeys: unknown = null;
    const seriesStub = (rows: unknown[], stated: { id: string; stated: number | null }[], mints: { dedupeKey: string; day: Date }[]) =>
      ({
        roadmapMilestone: { findMany: async () => rows },
        $queryRaw: async (sql: Prisma.Sql) => (/goalMp/.test(sql.sql) ? stated : [{ measureKey: K6, day: dateColumn("2026-11-04"), value: 15, detail: null, source: "COMPUTED", observedAt: at("2026-11-04") }]),
        activityEvent: {
          findMany: async (args: { where: { dedupeKey: { in: string[] } } }) => {
            mintReads += 1;
            mintKeys = args.where.dedupeKey.in;
            return mints;
          },
        },
      }) as unknown as RR.RoadmapReadingsClient;
    const two = await R.loadRoadmapGoalSeries(UID, ["g-o1", "g-o2"], today, {
      client: seriesStub([{ ...dbMs("o1", "g-o1", "2026-10-05T01:00:00.000Z"), roadmap: roadmapOf }, { ...dbMs("o2", "g-o2", "2026-10-20T01:00:00.000Z"), roadmap: roadmapOf }], [{ id: "g-o1", stated: 6 }, { id: "g-o2", stated: 6 }], []),
    });
    eq("loadRoadmapGoalSeries: the superseded original's goal gets no points and 'replaced by Start again'; its copy keeps its series", [two["g-o1"]?.series.length, two["g-o1"]?.note, two["g-o2"]?.series.length, two["g-o2"]?.note], [0, "replaced by Start again", 1, null]);
    eq("… and no paid-day read when no goal states 0", mintReads, 0);
    const practiceRow = { id: "pi", milestoneId: "o2", lineageId: "pl", kind: "PRACTICE", ord: 1, label: "Backtest", rawLabel: null, origin: "USER", decision: "EDITED", domainId: null, proposedName: null, syllabusRef: null, method: null, sessionsPerWeek: 3, durationBand: "D30", rule: "TARGET:3/W", planSource: "YOURS", checkpointKind: null, outOf: null, bar: null, addToToday: true, templateId: "tb", flags: [], notes: [] };
    const paidCopy = { ...dbMs("o2", "g-o2", "2026-10-20T01:00:00.000Z", [practiceRow], { kind: "START", weeks: [{ reviewMin: 30, newPerWeek: 2, practiceMin: 90 }] }), roadmap: roadmapOf };
    const paid = await R.loadRoadmapGoalSeries(UID, ["g-o2"], today, {
      client: seriesStub([paidCopy], [{ id: "g-o2", stated: 0 }], [{ dedupeKey: "mp:GOAL:g-o1", day: dateColumn("2026-10-15") }]),
    });
    eq("a copy that states 0 because its lineage paid reads 'this milestone already paid on 15 Oct' (one read of the lineage's other goals' mints)", [paid["g-o2"]?.zeroReason, mintReads, mintKeys], ["this milestone already paid on 15 Oct", 1, ["mp:GOAL:g-o1"]]);
    const nextYear = await R.loadRoadmapGoalSeries(UID, ["g-o2"], "2027-01-04", {
      client: seriesStub([paidCopy], [{ id: "g-o2", stated: 0 }], [{ dedupeKey: "mp:GOAL:g-o1", day: dateColumn("2026-10-15") }]),
    });
    eq("fix round 2: the loader passes its day, so in the next year the same copy reads '… already paid on 15 Oct 2026'", nextYear["g-o2"]?.zeroReason, "this milestone already paid on 15 Oct 2026");

    // Revision 5 (lane 3): once GOALS_MAX > 1 each entry carries its goal's seat (one count in the same wave); while it is 1, nothing more is read.
    let seatCounts = 0;
    const seatStub = (status: string, slot: number | null) =>
      ({
        ...(seriesStub([{ ...dbMs("o2", "g-o2", "2026-10-20T01:00:00.000Z"), roadmap: { ...roadmapOf, status, slot } }], [{ id: "g-o2", stated: 6 }], []) as unknown as Record<string, unknown>),
        roadmap: { count: async () => (seatCounts++, 2) },
      }) as unknown as RR.RoadmapReadingsClient;
    const oneSeat = await R.loadRoadmapGoalSeries(UID, ["g-o2"], today, { client: seatStub("ACTIVE", 2) });
    const manySeats = await R.loadRoadmapGoalSeries(UID, ["g-o2"], today, { client: seatStub("ACTIVE", 2), goalsMax: 3 });
    const pausedSeat = await R.loadRoadmapGoalSeries(UID, ["g-o2"], today, { client: seatStub("PAUSED", 2), goalsMax: 3 });
    eq(
      "goals: the goal series reads no seat while GOALS_MAX is 1 (the entry exactly as before); once GOALS_MAX > 1, its seat and the open goals' count; a paused goal shows no seat (ruling 55)",
      ["seat" in (oneSeat["g-o2"] ?? {}), manySeats["g-o2"]?.seat, pausedSeat["g-o2"]?.seat, seatCounts, RT.GOALS_MAX],
      [false, { slot: 2, open: 2 }, { slot: null, open: 2 }, 2, 1]
    );
  }

  // ═══ Revision 4 (F-R4-8, F-R4-9, F-R4-12, F-R4-16; roadmap-contracts.md §14) ═══

  console.log("— rev 4: recall cards and clean entry —");
  const segMeasure = (id: string, domainIds: string[], level: number, target: number, segment: RT.CardSegment, baseline = 0): RT.MeasureSpec => ({
    ...cardsMeasure(id, domainIds, level, target, baseline),
    targetSource: "DEPTH",
    measureKey: RT.cardsAtLevelKey(domainIds, level, segment),
  });
  {
    const cards: M.CardLevelRow[] = [
      ...Array.from({ length: 3 }, () => ({ domainId: D_P, level: 8 })),
      ...Array.from({ length: 2 }, () => ({ domainId: D_P, level: 8, recall: false })),
      { domainId: D_P, level: 6 },
      { domainId: D_I, level: 12, retryEntry: true },
      { domainId: D_I, level: 12 },
      { domainId: D_I, level: 12 },
      { domainId: D_I, level: 13, retryEntry: true },
      { domainId: D_I, level: 12, recall: false },
    ];
    eq("no segment counts every card, as in rev 3: 5 at level 8+ in Probability", M.cardsAtLevelValue(cards, [D_P], 8), { value: 5, byDomain: { [D_P]: 5 } });
    eq("`r` counts recall cards only: 3, with 2 multiple choice not counted", M.cardsAtLevelValue(cards, [D_P], 8, "r"), {
      value: 3,
      byDomain: { [D_P]: 3 },
      retryEntries: 0,
      retryByDomain: { [D_P]: 0 },
      notCounted: { [D_P]: 2 },
    });
    eq("`rc` at 12 leaves out the retry entry at exactly 12 (one at 13 counts): 3", M.cardsAtLevelValue(cards, [D_I], 12, "rc"), {
      value: 3,
      byDomain: { [D_I]: 3 },
      retryEntries: 1,
      retryByDomain: { [D_I]: 1 },
      notCounted: { [D_I]: 1 },
    });
    eq("… and `r` at 12 counts it: 4", M.cardsAtLevelValue(cards, [D_I], 12, "r").value, 4);
    eq("a Domain id that is a prototype name never counts (own keys only)", M.cardsAtLevelValue([{ domainId: "toString", level: 9 }], [D_P], 8).value, 0);

    const counts = M.cardCountsOf(
      [
        { domainId: D_P, level: 8, questionType: "SHORT", count: 3 },
        { domainId: D_P, level: 8, questionType: "MULTI", count: 2 },
        { domainId: D_P, level: 6, questionType: "SHORT", count: 1 },
        { domainId: D_I, level: 12, questionType: "SHORT", count: 3 },
        { domainId: D_I, level: 13, questionType: "SHORT", count: 1 },
        { domainId: D_I, level: 12, questionType: "MULTI", count: 1 },
      ],
      { [D_I]: { 12: 1 } }
    );
    check(
      "the grouped read (Domain, level, type) gives the card rows' figures for every segment",
      json(M.cardsAtLevelFromCounts(counts, [D_P], 8)) === json(M.cardsAtLevelValue(cards, [D_P], 8)) &&
        json(M.cardsAtLevelFromCounts(counts, [D_P], 8, "r")) === json(M.cardsAtLevelValue(cards, [D_P], 8, "r")) &&
        json(M.cardsAtLevelFromCounts(counts, [D_I], 12, "rc")) === json(M.cardsAtLevelValue(cards, [D_I], 12, "rc")) &&
        json(M.cardsAtLevelFromCounts(counts, [D_I], 12, "r")) === json(M.cardsAtLevelValue(cards, [D_I], 12, "r")),
      json([M.cardsAtLevelFromCounts(counts, [D_I], 12, "rc"), M.cardsAtLevelValue(cards, [D_I], 12, "rc")])
    );
    eq("levelEntriesOf: `rc` weighs a retry entry at 12 as 11", M.levelEntriesOf(counts, D_I, 12, "rc"), [
      [13, 1],
      [12, 2],
      [11, 1],
    ]);
    eq("… `r` keeps it at 12, and no segment counts multiple choice too", [M.levelEntriesOf(counts, D_I, 12, "r"), M.levelEntriesOf(counts, D_I, 12)], [
      [
        [13, 1],
        [12, 3],
      ],
      [
        [13, 1],
        [12, 4],
      ],
    ]);
    const plain = M.countsOfHistogram(hist([D_P, 8, 5]));
    eq("a rev-3 histogram reads every card as recall (a fixture with no type)", M.cardsAtLevelFromCounts(plain, [D_P], 8, "r").value, 5);
  }
  {
    // Clean entry from the REVIEW ledger (F-R4-12).
    const row = (day: DayKey, detail: string, hh = 9): M.ReviewLedgerRow => ({ day, detail, occurredAt: at(day, hh).toISOString() });
    const d0 = "2026-12-01";
    const tagged = [row("2026-08-13", "advanced · L10→11"), row(d0, "strike · L11"), row(addDays(d0, 1), "advanced · L11→12")];
    eq("'strike · L11' then 'advanced · L11→12' the next day: a retry entry", M.isRetryEntry(tagged, 12), true);
    eq("… an older pair without level tags reads the same", M.isRetryEntry([row("2026-08-13", "advanced"), row(d0, "strike"), row(addDays(d0, 1), "advanced")], 12), true);
    eq("a first-try pass into 12 is clean", M.isRetryEntry([row("2026-08-13", "advanced · L10→11"), row(d0, "advanced · L11→12")], 12), false);
    eq("a pass after it (12 → 13) counts it", M.isRetryEntry([...tagged, row("2027-05-10", "advanced · L12→13")], 12), false);
    eq("a miss at 12 after a retry entry keeps it one until its next pass", M.isRetryEntry([...tagged, row("2027-05-10", "strike · L12")], 12), true);
    eq("untagged rows: a miss more than RETRY_ENTRY_DAYS before the pass is not read as its retry", M.isRetryEntry([row(d0, "strike"), row(addDays(d0, 5), "advanced")], 12), false);
    eq("tagged rows: the level tags place a later retry on the same climb (strike · L11, advanced · L11→12 five days on)", M.isRetryEntry([row(d0, "strike · L11"), row(addDays(d0, 5), "advanced · L11→12")], 12), true);
    eq(
      "a 'shielded' miss, and a degrade from 12, make the re-entry a retry too",
      [M.isRetryEntry([row(d0, "shielded · L11"), row(addDays(d0, 1), "advanced · L11→12")], 12), M.isRetryEntry([row(d0, "degraded · L12"), row(addDays(d0, 1), "advanced · L11→12")], 12)],
      [true, true]
    );
    eq("a card that came down to 12 (its last pass took it to 13) is no retry entry; no rows read clean", [M.isRetryEntry([row(d0, "strike · L12"), row(addDays(d0, 1), "advanced · L12→13")], 12), M.isRetryEntry([], 12)], [false, false]);
    eq("two rows on one day are ordered by their time, not by the list", M.isRetryEntry([row(d0, "advanced · L11→12", 10), row(d0, "strike · L11", 9)], 12), true);
    eq(
      "the read looks back (interval 160 + grace 11 + 1) + (grace 10 + 2) = 172 + 12 (m 1.5: 252 + 12) days (fix round 2, contracts §16.1)",
      [M.retryReadDaysOf(12, 1), M.retryReadDaysOf(12, 1.5)],
      [184, 264]
    );
    // Fix round (contracts §15.1): ONE definition of clean entry, roadmap-types'. R1 re-exports it, so the readings,
    // R6's RAISE parts and R4's CardState.retryEntry can never disagree on whether a card counts.
    check("clean entry has one definition: roadmap-measures re-exports roadmap-types' isRetryEntry and retryReadDaysOf", M.isRetryEntry === RT.isRetryEntry && M.retryReadDaysOf === RT.retryReadDaysOf);
    check(
      "… roadmap-measures.ts defines neither itself (no second copy to drift)",
      !/export\s+function\s+(isRetryEntry|retryReadDaysOf)\b|const\s+(isRetryEntry|retryReadDaysOf)\s*=/.test(read("src/lib/roadmap-measures.ts")) && /export\s*\{[^}]*\bisRetryEntry\b[^}]*\}\s*from\s*["']\.\/roadmap-types["']/.test(read("src/lib/roadmap-measures.ts"))
    );
    eq(
      "a backfill row between the miss and the pass is no review: skipped, so 'strike · L11', backfill, 'advanced · L11→12' is still a retry entry (untagged: within 2 days)",
      [M.isRetryEntry([row(d0, "strike · L11", 9), row(d0, "backfill: passed review", 10), row(addDays(d0, 1), "advanced · L11→12")], 12), M.isRetryEntry([row(d0, "strike", 9), row(d0, "backfill: passed review", 10), row(addDays(d0, 1), "advanced")], 12)],
      [true, true]
    );
    eq("… and an unrecognised detail is skipped the same way", M.isRetryEntry([row(d0, "strike · L11", 9), row(d0, "something else", 10), row(addDays(d0, 1), "advanced · L11→12")], 12), true);
    eq(
      "R6's rows ordered by `at` (epoch ms) read the same as R1's by occurredAt",
      M.isRetryEntry([{ day: d0, detail: "advanced · L11→12", at: at(d0, 10).getTime() }, { day: d0, detail: "strike · L11", at: at(d0, 9).getTime() }], 12),
      true
    );

    // The card counts on a stub client (no database): one grouped read, the cards at exactly 12, ONE ledger read.
    const today4 = "2027-01-04";
    let ledgerReads = 0;
    let ideaReads = 0;
    let ledgerWhere: unknown = null;
    let ideaWhere: unknown = null;
    const events = [
      { sourceId: "c1", day: dateColumn("2026-12-30"), detail: "strike · L11", occurredAt: at("2026-12-30") },
      { sourceId: "c1", day: dateColumn("2026-12-31"), detail: "advanced · L11→12", occurredAt: at("2026-12-31") },
      { sourceId: "c2", day: dateColumn("2026-12-31"), detail: "advanced · L11→12", occurredAt: at("2026-12-31") },
    ];
    const countStub = {
      idea: {
        groupBy: async () => [
          { domainId: D_I, level: 12, questionType: "SHORT", _count: { _all: 3 } },
          { domainId: D_I, level: 12, questionType: "MULTI", _count: { _all: 1 } },
          { domainId: D_P, level: 9, questionType: "SHORT", _count: { _all: 2 } },
        ],
        findMany: async (args: { where: unknown }) => {
          ideaReads += 1;
          ideaWhere = args.where;
          return [
            { id: "c1", domainId: D_I },
            { id: "c2", domainId: D_I },
            { id: "c3", domainId: D_I },
          ];
        },
      },
      activityEvent: {
        findMany: async (args: { where: unknown }) => {
          ledgerReads += 1;
          ledgerWhere = args.where;
          return events;
        },
      },
    } as unknown as RR.RoadmapReadingsClient;
    const counted = await R.loadCardCounts(countStub, UID, { domainIds: [D_I, D_P], clean: [{ level: 12, domainIds: [D_I] }], m: 1 }, today4);
    eq("loadCardCounts: every card, the recall cards, and one retry entry at 12 in Inference", [counted.all[D_I], counted.recall[D_I], counted.retry], [{ 12: 4 }, { 12: 3 }, { [D_I]: { 12: 1 } }]);
    const lw = ledgerWhere as { source?: string; sourceId?: { in?: string[] }; day?: { gte?: Date }; userId?: string };
    const iw = ideaWhere as { level?: number; questionType?: { notIn?: string[] }; isArchived?: boolean };
    check(
      `… one ledger read of REVIEW rows by the cards at exactly 12 (recall only), over the last retryReadDaysOf(12, 1) = ${RT.retryReadDaysOf(12, 1)} days`,
      ledgerReads === 1 && ideaReads === 1 && lw.source === "REVIEW" && lw.userId === UID && json(lw.sourceId?.in) === json(["c1", "c2", "c3"]) && keyOfDateColumn(lw.day!.gte!) === addDays(today4, -RT.retryReadDaysOf(12, 1)) && iw.level === 12 && json(iw.questionType?.notIn) === json(["MULTI"]) && iw.isArchived === false,
      json({ ledgerWhere, ideaWhere })
    );
    await R.loadCardCounts(countStub, UID, { domainIds: [D_I] }, today4);
    eq("… and none of it without an `rc` level", [ledgerReads, ideaReads], [1, 1]);
  }

  console.log("— fix round 2: the clean-entry window (contracts §16.1) —");
  {
    // A stub whose ledger read honours `day.gte` as the SQL does, so the window decides what isRetryEntry sees.
    const today6 = "2027-06-07";
    type Ev = { sourceId: string; day: DayKey; detail: string };
    const windowStub = (events: Ev[], seen: { gte: DayKey | null; liveCalls: number }, cards = [{ id: "c1", domainId: D_I }]) =>
      ({
        idea: {
          groupBy: async () => [{ domainId: D_I, level: 12, questionType: "SHORT", _count: { _all: cards.length } }],
          findMany: async () => cards,
        },
        activityEvent: {
          findMany: async (args: { where: { day: { gte: Date } } }) => {
            const gte = keyOfDateColumn(args.where.day.gte);
            seen.gte = gte;
            return events.filter((e) => e.day >= gte).map((e) => ({ sourceId: e.sourceId, day: dateColumn(e.day), detail: e.detail, occurredAt: at(e.day) }));
          },
        },
      }) as unknown as RR.RoadmapReadingsClient;
    const q12 = { domainIds: [D_I], clean: [{ level: 12, domainIds: [D_I] }] };
    const daysFrom = (a: DayKey, b: DayKey) => Math.round((dayStartOf(a).getTime() - dayStartOf(b).getTime()) / 86_400_000);
    const retryAt12 = async (events: Ev[], m: number | undefined, live?: RR.ReachWindowMods | null | "throws" | "throwsAtOnce") => {
      const seen = { gte: null as DayKey | null, liveCalls: 0 };
      const liveFn: (() => Promise<RR.ReachWindowMods | null>) | undefined =
        live === undefined
          ? undefined
          : live === "throwsAtOnce"
            ? () => {
                seen.liveCalls += 1;
                throw new Error("loadout reader threw before its promise");
              }
            : async () => {
                seen.liveCalls += 1;
                if (live === "throws") throw new Error("loadout read failed");
                return live;
              };
      const counts = await quietly(() => R.loadCardCounts(windowStub(events, seen), UID, { ...q12, m, live: liveFn }, today6));
      return { retry: counts.retry[D_I]?.[12] ?? 0, back: seen.gte ? -daysFrom(seen.gte, today6) : null, liveCalls: seen.liveCalls };
    };

    // srs.ts's late case at L12, m 1: a strike at L11 on its due day keeps graceEndsAt, so the retry can wait out
    // graceDays(11) = 10 days plus the cron's lag: the pass 11 days after the strike. Then 172 days at 12
    // (interval 160 + grace 11 + 1) before the cron degrades it. The miss lies 183 days back: outside the old
    // 173-day window, inside the new 184.
    const pass = addDays(today6, -172);
    const lateFar: Ev[] = [
      { sourceId: "c1", day: addDays(pass, -11), detail: "strike · L11" },
      { sourceId: "c1", day: pass, detail: "advanced · L11→12" },
    ];
    eq("the late retry entry: the miss is 183 days back, the pass 172 (the fixture's own arithmetic)", [daysFrom(today6, lateFar[0].day), daysFrom(today6, lateFar[1].day)], [183, 172]);
    eq(
      "a strike at L11 11 days before its retry pass (graceDays(11) + 1), the pass 172 days back: R1 reads a retry entry over 184 days",
      await retryAt12(lateFar, 1),
      { retry: 1, back: 184, liveCalls: 0 }
    );
    check(
      "… the old 173-day window would have missed the strike and read the card clean (isRetryEntry with the pass alone)",
      RT.isRetryEntry(lateFar.filter((e) => e.day >= addDays(today6, -173)).map((e) => ({ day: e.day, detail: e.detail, occurredAt: at(e.day).toISOString() })), 12) === false &&
        lateFar.filter((e) => e.day >= addDays(today6, -173)).length === 1
    );
    eq("a first-try entry 172 days back stays clean over the wider window", await retryAt12([{ sourceId: "c1", day: pass, detail: "advanced · L11→12" }], 1), { retry: 0, back: 184, liveCalls: 0 });

    // The live loadout widens R1's window. Since the finishing round R4's planContext and R6's quests read the same window
    // (retryReadDaysOf(L, the wider of the acceptance's m and the live m, live grace)), so all three are identical.
    eq("cleanReadDaysOf with no loadout is retryReadDaysOf at the acceptance's m: 184 (m 1), 264 (m 1.5)", [R.cleanReadDaysOf(12, 1), R.cleanReadDaysOf(12, 1.5), R.cleanReadDaysOf(12, undefined)], [184, 264, 184]);
    eq(
      "… a GRACE_EXTENSION of 2 widens it by 4 (188), the live m 1.5 over an acceptance at 1 reads 264, an acceptance at 1.5 over a live 1 keeps 264, both: 268",
      [
        R.cleanReadDaysOf(12, 1, { intervalMultiplier: 1, graceExtraDays: 2 }),
        R.cleanReadDaysOf(12, 1, { intervalMultiplier: 1.5, graceExtraDays: 0 }),
        R.cleanReadDaysOf(12, 1.5, { intervalMultiplier: 1, graceExtraDays: 0 }),
        R.cleanReadDaysOf(12, 1, { intervalMultiplier: 1.5, graceExtraDays: 2 }),
      ],
      [188, 264, 264, 268]
    );
    eq(
      "… a bad loadout figure reads as none (m 1, no grace): NaN, 0 and negatives",
      [R.cleanReadDaysOf(12, 1, { intervalMultiplier: NaN, graceExtraDays: -3 }), R.cleanReadDaysOf(12, 0, { intervalMultiplier: 0, graceExtraDays: NaN })],
      [184, 184]
    );
    {
      let narrower = 0;
      let cases = 0;
      for (const L of [2, 4, 5, 6, 8, 10, 11, 12, 13, 16]) {
        for (const accM of [1, 1.25, 1.5]) {
          for (const liveM of [1, 1.25, 1.5, 2]) {
            for (const g of [0, 1, 2, 5]) {
              cases += 1;
              const r1 = R.cleanReadDaysOf(L, accM, { intervalMultiplier: liveM, graceExtraDays: g });
              // The live-m-only window (R4's and R6's before the finishing round) and the acceptance-only one. R4 and R6 now
              // read the wider of the two, the same window as R1's, so this bound still holds.
              if (r1 < RT.retryReadDaysOf(L, liveM, g) || r1 < RT.retryReadDaysOf(L, accM, g)) narrower += 1;
            }
          }
        }
      }
      eq(`R1's window is never narrower than the live-m window or the acceptance-m window alone (R4 and R6 read the wider of the two, as R1 does) (${cases} cases over L, the acceptance's m, the live m and the grace)`, narrower, 0);
    }
    // A grace extension of 2 holds the card at 12 four days longer (srs.ts graceEndsAt: + graceExtraDays at L11 and at L12).
    const graced: Ev[] = [
      { sourceId: "c1", day: addDays(today6, -187), detail: "strike · L11" },
      { sourceId: "c1", day: addDays(today6, -174), detail: "advanced · L11→12" },
    ];
    eq(
      "with the loadout's grace +2 (graceDays(11) + 2 + 1 = 13 days between, the pass 174 back): a retry entry over 188 days, the loadout read once",
      await retryAt12(graced, 1, { intervalMultiplier: 1, graceExtraDays: 2 }),
      { retry: 1, back: 188, liveCalls: 1 }
    );
    eq("… the same rows without the loadout (the acceptance's m, no grace: 184 days) read clean, as before this fix", await retryAt12(graced, 1), { retry: 0, back: 184, liveCalls: 0 });
    eq(
      "… an unreadable loadout (a rejected read, or a reader that throws at once) is logged and reads as none: 184 days, never a throw",
      [await retryAt12(graced, 1, "throws"), await retryAt12(graced, 1, "throwsAtOnce")],
      [
        { retry: 0, back: 184, liveCalls: 1 },
        { retry: 0, back: 184, liveCalls: 1 },
      ]
    );
    {
      const seen = { gte: null as DayKey | null, liveCalls: 0 };
      await R.loadCardCounts(
        windowStub([], seen, []),
        UID,
        {
          ...q12,
          m: 1,
          live: async () => {
            seen.liveCalls += 1;
            return { intervalMultiplier: 1, graceExtraDays: 2 };
          },
        },
        today6
      );
      eq("no card at exactly 12: neither the ledger nor the loadout is read", [seen.gte, seen.liveCalls], [null, 0]);
    }

    // The writers' loader passes the loadout: ReadingsDeps.reachModifiers on an injected client; none without it.
    {
      const KI12rc = RT.cardsAtLevelKey([D_I], 12, "rc");
      const row = {
        id: RID,
        status: "ACTIVE",
        version: 1,
        reachedDay: null,
        archiveReason: null,
        fieldId: "f1",
        depth: 12,
        milestones: [
          {
            id: "mw",
            roadmapId: RID,
            version: 1,
            lineageId: "L-mw",
            ord: 1,
            title: "x",
            titleOrigin: "CODE",
            titleDecision: "KEPT",
            windowStart: dateColumn(addDays(today6, -30)),
            dueDay: dateColumn(addDays(today6, 30)),
            status: "STARTED",
            goalId: "g-mw",
            startedDay: dateColumn(addDays(today6, -30)),
            startingAt: null,
            reachedDay: null,
            reachPendingDay: null,
            overAccepted: false,
            feasibility: null,
            rankIndex: 5,
            createdAt: new Date("2026-10-05T00:00:00.000Z"),
            stage: "MASTERED",
            items: [],
            measures: [{ id: "mw1", milestoneId: "mw", kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: [D_I] }, minLevel: 12, target: 25, targetSource: "DEPTH", fittedTarget: null, rateSource: "SCOPE", baseline: 0, baselineDay: dateColumn(addDays(today6, -30)), unit: "card", itemLineageId: null, measureKey: KI12rc }],
          },
        ],
        acceptances: [{ version: 1, endState: [], intervalMultiplier: 1 }],
      };
      const seen = { gte: null as DayKey | null, liveCalls: 0 };
      const base = windowStub(graced, seen) as unknown as Record<string, unknown>;
      const full = {
        ...base,
        roadmap: { findFirst: async () => row },
        $queryRaw: async () => [],
        roadmapReading: { findFirst: async () => null, findMany: async () => [] },
        domain: { findMany: async () => [{ id: D_I, name: "Inference" }] },
        taskTemplate: { findMany: async (args: { select: Record<string, unknown> }) => (args.select.closedScore ? [{ id: "g-mw", closedScore: null, archivedAt: null, dueDay: dateColumn(addDays(today6, 30)) }] : []) },
        taskInstance: { findMany: async () => [] },
        restDay: { findMany: async () => [] },
        activityEvent: {
          findMany: async (args: { where: { source?: string; day: { gte: Date } } }) =>
            args.where.source === "REVIEW" ? (base.activityEvent as { findMany: (a: unknown) => Promise<unknown> }).findMany(args) : [],
        },
      } as unknown as RR.RoadmapReadingsClient;
      const direct = await R.loadRoadmapContext(full, { userId: UID, statuses: ["ACTIVE"] }, today6, async (userId) => {
        seen.liveCalls += 1;
        return userId === UID ? { intervalMultiplier: 1, graceExtraDays: 2 } : null;
      });
      eq("loadRoadmapContext passes its loadout reader (for its user) to the card counts: the graced retry entry counts", [direct?.counts?.retry, seen.gte, seen.liveCalls], [{ [D_I]: { 12: 1 } }, addDays(today6, -188), 1]);
      seen.liveCalls = 0;
      const ops = await R.readingOpsFor(UID, "g-mw", at(today6), {
        env: OFF,
        client: full,
        reachModifiers: async () => {
          seen.liveCalls += 1;
          return { intervalMultiplier: 1, graceExtraDays: 2 };
        },
      });
      const rcRow = (o: Awaited<ReturnType<typeof R.readingOpsFor>>) => (o.ok ? o.rows.find((r) => r.measureKey === KI12rc) : undefined);
      const withLoadout = rcRow(ops);
      check(
        "the writers' loader (readingOpsFor here) reads with ReadingsDeps.reachModifiers: the window is 188 days and the `rc` count (0 of 1) leaves the retry entry out",
        seen.liveCalls === 1 && seen.gte === addDays(today6, -188) && withLoadout?.value === 0 && (withLoadout?.detail as { retryEntries?: number } | undefined)?.retryEntries === 1,
        json({ liveCalls: seen.liveCalls, gte: seen.gte, row: withLoadout })
      );
      seen.liveCalls = 0;
      const without = rcRow(await R.readingOpsFor(UID, "g-mw", at(today6), { env: OFF, client: full }));
      eq(
        "… an injected client with no reachModifiers reads no loadout (the acceptance's m, 184 days, so the card counts): a check never reaches the database",
        [seen.liveCalls, seen.gte, without?.value],
        [0, addDays(today6, -184), 1]
      );
      const src = read("src/lib/roadmap-readings.ts");
      check(
        "on the real client the loader reads the loadout with skill-effects loadModifiers (as R4's reachModifiers and R6's reachLoadout do)",
        /import\(["']\.\/skill-effects["']\)/.test(src) && /loadModifiers\(userId\)/.test(src) && /d\.reachModifiers\s*\?\?\s*\(d\.client\s*\?\s*undefined\s*:\s*loadLiveReachMods\)/.test(src) && /loadRoadmapContext\(clientOf\(d\),\s*q,\s*today,\s*liveModsOf\(d\)\)/.test(src)
      );
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      check(
        "the readings compute no window but cleanReadDaysOf (no bare retryReadDaysOf call outside it)",
        (code.match(/retryReadDaysOf\(/g) ?? []).length === 1 && /return retryReadDaysOf\(level,/.test(code) && /cleanReadDaysOf\(c\.level,\s*q\.m,\s*live\)/.test(code),
        json(code.match(/.*retryReadDaysOf\(.*/g))
      );
      check(
        "R4's planContext and R6's quests still call retryReadDaysOf with their m and the live grace (that m is the wider of the acceptance's and the live m, as R1's; server-check and quests-check pin it)",
        /retryReadDaysOf\(depth,\s*m,\s*graceExtraDays\)/.test(read("src/lib/roadmap-server.ts")) && /retryReadDaysOf\(L,\s*m,\s*loadout\.graceExtraDays/.test(read("src/lib/roadmap-quests-server.ts"))
      );
    }
  }

  console.log("— rev 4: readings and the aim's reach —");
  const KP12 = RT.cardsAtLevelKey([D_P], 12, "rc");
  const KI12 = RT.cardsAtLevelKey([D_I], 12, "rc");
  {
    // The `rc` row and its detail; a key without a segment keeps rev 3's.
    const counts = M.cardCountsOf(
      [
        { domainId: D_P, level: 12, questionType: "SHORT", count: 34 },
        { domainId: D_I, level: 12, questionType: "SHORT", count: 25 },
        { domainId: D_I, level: 12, questionType: "MULTI", count: 3 },
      ],
      { [D_I]: { 12: 2 } }
    );
    const K12 = RT.cardsAtLevelKey([D_I], 12);
    const c = ctxOf({
      depth: 12,
      counts,
      histogram: counts.all,
      acceptance: { version: 1, endState: [] },
      milestones: [ms({ id: "mr", ord: 1, stage: "MASTERED", measures: [segMeasure("x1", [D_P], 12, 34, "rc"), segMeasure("x2", [D_I], 12, 25, "rc"), cardsMeasure("x3", [D_I], 12, 25, 0)] })],
    });
    const plan = R.planRoadmapWrite(c, at(MON));
    const rc = plan.rows.find((r) => r.measureKey === KI12);
    eq("an `rc` row leaves out the 2 retry entries and the 3 multiple choice: 23, with the detail that says so", rc && [rc.value, rc.detail], [23, { byDomain: { [D_I]: 23 }, retryEntries: 2, retryByDomain: { [D_I]: 2 }, notCounted: { [D_I]: 3 } }]);
    eq("… a key without a segment counts all 28 with rev 3's detail {byDomain}", plan.rows.find((r) => r.measureKey === K12) && [plan.rows.find((r) => r.measureKey === K12)!.value, plan.rows.find((r) => r.measureKey === K12)!.detail], [28, { byDomain: { [D_I]: 28 } }]);
    eq("a review moves an `rc` count at L + 1 too (a retry entry counts at its next pass); an `r` count only at L", [R.movesCardCount(12, 13, { level: 12, segment: "rc" }), R.movesCardCount(12, 13, { level: 12, segment: "r" }), R.movesCardCount(11, 12, { level: 12 })], [true, false, true]);
    eq("the scope map keeps the key's segment", R.scopeMapOf({ roadmapId: RID, milestones: c.milestones, endState: [] }).cards.map((x) => x.segment ?? null), ["rc", "rc", null]);
  }

  // The depth plan the aim's reach is judged on (F-R4-12): Familiar closed short (85%), Fluent reached, Mastered pending.
  const S1 = MON;
  const S2 = addDays(MON, 28);
  const S3 = addDays(MON, 56);
  const DUE3 = addDays(S3, 27);
  const twiceAWeek = (from: DayKey): InstanceLike[] => [0, 2, 7, 9, 14, 16, 21, 23].map((k) => ({ day: addDays(from, k), status: "DONE" }));
  const practiceItem = (lineageId: string, templateId: string, catalogKey: RT.ItemDraft["catalogKey"]) => item({ lineageId, kind: "PRACTICE", templateId, rule: "TARGET:2/W", sessionsPerWeek: 2, catalogKey });
  const keptReading = (tpl: string, from: DayKey, kept: number) => reading(RT.practiceKeptKey([tpl], from), addDays(from, 27), kept, { kept, planned: 8, held: 0, effTarget: 6, byTemplate: { [tpl]: kept } });
  const depthCtx = (o: { pCards?: number; iRetry?: number; m1Kept?: number; m2Kept?: number; logScore?: number | null; pending?: DayKey | null; standard?: boolean; due3?: DayKey } = {}) => {
    const counts = M.cardCountsOf(
      [
        { domainId: D_P, level: 12, questionType: "SHORT", count: o.pCards ?? 34 },
        { domainId: D_P, level: 11, questionType: "SHORT", count: 34 - (o.pCards ?? 34) },
        { domainId: D_I, level: 12, questionType: "SHORT", count: 25 },
        { domainId: D_I, level: 12, questionType: "MULTI", count: 3 },
      ],
      o.iRetry ? { [D_I]: { 12: o.iRetry } } : {}
    );
    const m1 = ms({
      id: "f1",
      ord: 1,
      lineageId: "LF",
      stage: "FAMILIAR",
      rankIndex: 2,
      windowStart: S1,
      startedDay: S1,
      dueDay: addDays(S1, 27),
      goal: { open: false, archived: false },
      measures: [segMeasure("f11", [D_P], 6, 34, "r"), segMeasure("f12", [D_I], 6, 25, "r"), practiceMeasure("f13", "p1", "t1", S1, 6)],
      items: [practiceItem("p1", "t1", "RECALL_DRILLS")],
    });
    const m2 = ms({
      id: "f2",
      ord: 2,
      lineageId: "LV",
      stage: "FLUENT",
      rankIndex: 4,
      windowStart: S2,
      startedDay: S2,
      dueDay: addDays(S2, 27),
      reachedDay: addDays(S2, 27),
      goal: { open: false, archived: false },
      measures: [segMeasure("f21", [D_P], 10, 34, "r"), segMeasure("f22", [D_I], 10, 25, "r"), practiceMeasure("f23", "p2", "t2", S2, 6)],
      items: [practiceItem("p2", "t2", "EXPLAIN_IT")],
    });
    const m3 = ms({
      id: "f3",
      ord: 3,
      lineageId: "LM",
      stage: "MASTERED",
      rankIndex: 5,
      windowStart: S3,
      startedDay: S3,
      dueDay: o.due3 ?? DUE3,
      reachPendingDay: o.pending === undefined ? addDays(DUE3, -2) : o.pending,
      measures: [segMeasure("f31", [D_P], 12, 34, "rc"), segMeasure("f32", [D_I], 12, 25, "rc"), practiceMeasure("f33", "p3", "t3", S3, 6)],
      items: [practiceItem("p3", "t3", "EXPLAIN_IT"), ...(o.standard === false ? [] : [item({ lineageId: "cp", kind: "CHECKPOINT", checkpointKind: "PERFORMANCE_CHECK", bar: 70, outOf: 100 })])],
    });
    const score = o.logScore === undefined ? 75 : o.logScore;
    return ctxOf({
      depth: 12,
      counts,
      histogram: counts.all,
      acceptance: {
        version: 1,
        endState: [
          { measureKey: KP12, target: 34, baseline: 0, baselineDay: S1, label: "Probability · cards at level 12+", targetSource: "DEPTH" },
          { measureKey: KI12, target: 25, baseline: 0, baselineDay: S1, label: "Inference · cards at level 12+", targetSource: "DEPTH" },
        ],
      },
      milestones: [m1, m2, m3],
      readings: [keptReading("t1", S1, o.m1Kept ?? 8), keptReading("t2", S2, o.m2Kept ?? 8)],
      templates: {
        t1: { rule: "TARGET:2/W", startDay: S1, instances: twiceAWeek(S1) },
        t2: { rule: "TARGET:2/W", startDay: S2, instances: twiceAWeek(S2) },
        t3: { rule: "TARGET:2/W", startDay: S3, instances: twiceAWeek(S3) },
      },
      checkpointLogs: score == null ? [] : [reading(RT.checkpointLogKey("cp", "n1"), addDays(S3, 20), score, { score, outOf: 100 }, at(addDays(S3, 20)).toISOString(), "SELF")],
    });
  };
  const depthRank = (o: Partial<RT.DepthRankInput> = {}): RT.DepthRankInput => ({
    depth: 12,
    track: false,
    hasStandard: true,
    keptStages: 3,
    spanDays: 84,
    coverageBelowPolicy: false,
    productionPlannedFromFluent: true,
    ...o,
  });
  const rankAfter = (plan: RR.RoadmapWritePlan, dr: RT.DepthRankInput) =>
    PF.aimRankOf({
      milestones: [
        { ord: 1, rankIndex: 2, reachedDay: null, reachPendingDay: null, scheduled: true },
        { ord: 2, rankIndex: 4, reachedDay: addDays(S2, 27), reachPendingDay: null, scheduled: true },
        { ord: 3, rankIndex: 5, reachedDay: plan.reaches.some((r) => r.milestoneId === "f3" && r.action.kind === "confirm") ? addDays(DUE3, -2) : null, reachPendingDay: null, scheduled: true },
      ],
      roadmapReachedDay: plan.aimReachedDay,
      maxScheduled: 3,
      today: DUE3,
      depthRank: dr,
    });
  {
    const plan = R.planRoadmapWrite(depthCtx(), at(DUE3));
    eq("the aim is reached: the final stage confirmed, the depth held (34 and 25 recall cards at 12), the practice kept, the standard logged 75 ≥ 70", [plan.reaches.find((r) => r.milestoneId === "f3")?.action.kind, plan.aimReachedDay], ["confirm", DUE3]);
    eq("… Familiar closed short (85%) on the way doesn't block it: Paragon, given on the aim's day", [rankAfter(plan, depthRank()).name, rankAfter(plan, depthRank()).newSince], ["Paragon", DUE3]);
    const fails: [string, Parameters<typeof depthCtx>[0]][] = [
      ["the standard logged below its bar (60 < 70)", { logScore: 60 }],
      ["the standard not logged at all", { logScore: null }],
      ["one Domain 1 card short (33 of 34 in Probability)", { pCards: 33 }],
      ["one Domain complete only by counting a retry-entry card", { iRetry: 1 }],
      ["the plan's practice overall under KEEP_SHARE (18 of 24)", { m1Kept: 2 }],
      ["its production practice from Fluent on under KEEP_SHARE (12 of 16)", { m2Kept: 4 }],
      ["the reach rests on ticks and is 1 day old", { pending: addDays(DUE3, -1) }],
    ];
    for (const [why, o] of fails) {
      const p = R.planRoadmapWrite(depthCtx(o), at(DUE3));
      check(`Paragon is withheld: ${why}`, p.aimReachedDay === null && rankAfter(p, depthRank()).name !== "Paragon", json({ aim: p.aimReachedDay, rank: rankAfter(p, depthRank()).name }));
    }
    const later = R.planRoadmapWrite(depthCtx({ pending: addDays(DUE3, -1), due3: addDays(DUE3, 7) }), at(addDays(DUE3, 1)));
    eq("… and given after the hold (the next day the reach is 2 days old)", later.aimReachedDay, addDays(DUE3, 1));
    const noStandard = R.planRoadmapWrite(depthCtx({ standard: false, logScore: null }), at(DUE3));
    eq("a plan with no standard reaches its aim on the depth and the practice, and tops out at Virtuoso", [noStandard.aimReachedDay, rankAfter(noStandard, depthRank({ hasStandard: false })).name], [DUE3, "Virtuoso"]);
    // Through the writer: Roadmap.reachedDay is set once.
    const store = new Store();
    const client = stubClient(store);
    const base = depthCtx();
    await R.recordRoadmapReadings(UID, at(DUE3), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => fromStore(store, base, DUE3) });
    eq("the writer sets Roadmap.reachedDay and writes the depth terms' rows", [store.roadmaps.get(RID)?.reachedDay, store.get(KP12, DUE3)?.value, store.get(KI12, DUE3)?.value], [DUE3, 34, 25]);
  }
  {
    // Production practice, one definition (roadmap-catalog practiceRoleOf, contracts §15.9): by catalog type first,
    // else by method. A "Write it myself" plan's typed WRITING practice from Fluent on is production, as R2's basis
    // line and R4's top-rank facts say: kept under KEEP_SHARE it holds Paragon back (before the fix it was not read
    // at all, so the aim was "reached" with its production practice 12 of 16).
    const typed = (catalogKey: RT.ItemDraft["catalogKey"], method: RT.PracticeMethod | null) => {
      const c = depthCtx({ m2Kept: 4 });
      return { ...c, milestones: c.milestones.map((m) => (m.id === "f1" ? m : { ...m, items: m.items.map((i) => (i.kind === "PRACTICE" ? { ...i, catalogKey, method } : i)) })) };
    };
    const writing = R.planRoadmapWrite(typed(null, "WRITING"), at(DUE3));
    const project = R.planRoadmapWrite(typed(null, "PROJECT_WORK"), at(DUE3));
    check("a typed WRITING (or PROJECT_WORK) practice with no catalog type, from Fluent on, is production: kept 12 of 16 withholds the aim", writing.aimReachedDay === null && project.aimReachedDay === null, json([writing.aimReachedDay, project.aimReachedDay]));
    const reading12 = R.planRoadmapWrite(typed(null, "READING"), at(DUE3));
    const drills = R.planRoadmapWrite(typed("RECALL_DRILLS", "WRITING"), at(DUE3));
    eq(
      "… a READING practice, and a retrieval catalog type whatever its method (the type comes first), plan no production: the overall practice (20 of 24) decides",
      [reading12.aimReachedDay, drills.aimReachedDay],
      [DUE3, DUE3]
    );
    check("roadmap-readings.ts reads production through practiceRoleOf, with no PRODUCTION_KINDS set of its own", /practiceRoleOf\(/.test(read("src/lib/roadmap-readings.ts")) && !/PRODUCTION_KINDS/.test(read("src/lib/roadmap-readings.ts")));
  }
  {
    // A lowered depth (F-R4-11 LOWER_DEPTH): the dropped stages leave the plan; the new final stage and terms decide.
    const K10P = RT.cardsAtLevelKey([D_P], 10, "rc");
    const K10I = RT.cardsAtLevelKey([D_I], 10, "rc");
    const base = depthCtx({ standard: false, logScore: null });
    const [m1, m2] = base.milestones;
    const fluentFinal = { ...m2, reachedDay: null, goal: { open: true, archived: false }, reachPendingDay: addDays(DUE3, -2), dueDay: DUE3, measures: [segMeasure("v1", [D_P], 10, 34, "rc"), segMeasure("v2", [D_I], 10, 25, "rc"), practiceMeasure("f23", "p2", "t2", S2, 6)] };
    const dropped = ms({ id: "f3", ord: 3, lineageId: "LM", stage: "MASTERED", status: "PLANNED", startedDay: null, goalId: null, goal: null, notes: ["DEPTH_LOWERED"], measures: [segMeasure("f31", [D_P], 12, 34, "rc")] });
    const lowered = {
      ...base,
      depth: 10,
      milestones: [m1, fluentFinal, dropped],
      acceptance: { version: 1, endState: [{ measureKey: K10P, target: 34, baseline: 0, baselineDay: S1, label: "x", targetSource: "DEPTH" as const }, { measureKey: K10I, target: 25, baseline: 0, baselineDay: S1, label: "x", targetSource: "DEPTH" as const }] },
      readings: [keptReading("t1", S1, 8)],
      // Fluent now runs to DUE3 (8 weeks): its practice twice a week throughout.
      templates: { ...base.templates, t2: { rule: "TARGET:2/W", startDay: S2, instances: [...twiceAWeek(S2), ...twiceAWeek(addDays(S2, 28))] } },
    };
    const lp = R.planRoadmapWrite(lowered, at(DUE3));
    eq("after Lower the depth, the stage it dropped (DEPTH_LOWERED) is not the final one: Fluent decides the aim", lp.aimReachedDay, DUE3);
    const b = PF.proficiencyBasisOf({ basisVersion: 1, endState: lowered.acceptance.endState, feasibility: null, milestones: lowered.milestones, switchedOff: [] });
    eq("… and it leaves Proficiency's positions (2 stages, not 3)", b.scheduled, 2);
    // A plan decision's new basis gets its own clean-entry read.
    let asked: RR.ContextQuery | null = null;
    await R.proficiencyReadingFor(UID, RID, at(DUE3), { basis: b, decision: { cause: "REPLAN" } }, {
      loadContext: async (q) => {
        asked = q;
        return lowered;
      },
    });
    eq("proficiencyReadingFor asks the loader for the new basis's keys (their `rc` levels get the clean-entry read)", (asked as RR.ContextQuery | null)?.extraKeys, [K10I, K10P]);

    // Fix round (contracts §15.7): the lowering's record sits inside version 1. Should its own Proficiency row not land,
    // the writer's next run must not carry the version's old basis (toward Mastered): it rebuilds from the acceptance
    // it reads and rebases as a plan decision in the depth's words, never as "switched off at Start".
    const mastered = PF.proficiencyBasisOf({ basisVersion: 1, endState: base.acceptance!.endState, feasibility: null, milestones: base.milestones, switchedOff: [] });
    const prevRow = PF.proficiencyReadingOf({ roadmapId: RID, today: addDays(DUE3, -1), basis: mastered, histogram: base.histogram, counts: base.counts, domainNames: NAMES, kept: {}, reached: 1, reachedOnTicks: false, previous: null });
    const prevReading = reading(prevRow.measureKey, prevRow.day, prevRow.value, prevRow.detail, at(addDays(DUE3, -1)).toISOString());
    const stale = R.planRoadmapWrite({ ...lowered, previousProficiency: prevReading }, at(DUE3));
    const sd = PF.parseProficiencyDetail(stale.proficiency!.detail)!;
    eq(
      "a same-version end-state change: the writer rebuilds the basis toward Fluent (level 10), rebased REPLAN 'depth lowered Mastered → Fluent'",
      [sd.basis.cards.map((c) => c.measureKey), sd.toward, sd.rebased?.cause, sd.rebased?.detail],
      [[K10I, K10P], { level: 10, name: "Fluent" }, "REPLAN", "depth lowered Mastered → Fluent"]
    );
    // Non-vacuity: while the basis still measures the acceptance's end state, the version's basis is carried as it is.
    const carriedBasis: RT.ProficiencyBasis = { ...mastered, practice: [{ itemLineageId: "only-in-the-stored-basis", planned: 9 }] };
    const carriedRow = PF.proficiencyReadingOf({ roadmapId: RID, today: addDays(DUE3, -1), basis: carriedBasis, histogram: base.histogram, counts: base.counts, domainNames: NAMES, kept: {}, reached: 1, reachedOnTicks: false, previous: null });
    const kept = R.planRoadmapWrite({ ...base, previousProficiency: reading(carriedRow.measureKey, carriedRow.day, carriedRow.value, carriedRow.detail, at(addDays(DUE3, -1)).toISOString()) }, at(DUE3));
    const kd = PF.parseProficiencyDetail(kept.proficiency!.detail)!;
    eq("… and a basis that still matches is carried within its version, unrebased", [kd.basis.practice.map((p) => p.itemLineageId), kd.rebased], [["only-in-the-stored-basis"], null]);
    eq("basisMatchesEndState: the Mastered basis matches its own end state and not the lowered one", [PF.basisMatchesEndState(mastered, base.acceptance!.endState), PF.basisMatchesEndState(mastered, lowered.acceptance.endState)], [true, false]);
    const fluentB = PF.proficiencyBasisOf({ basisVersion: 1, endState: lowered.acceptance.endState, feasibility: null, milestones: lowered.milestones, switchedOff: [] });
    eq(
      "rebaseCauseOf: a higher version REPLAN, a lower UNDO; within a version changed card terms REPLAN and a practice change alone SWITCHED_OFF",
      [PF.rebaseCauseOf(mastered, { ...fluentB, basisVersion: 2 }), PF.rebaseCauseOf({ ...mastered, basisVersion: 2 }, fluentB), PF.rebaseCauseOf(mastered, fluentB), PF.rebaseCauseOf(mastered, { ...mastered, practice: [] })],
      ["REPLAN", "UNDO", "REPLAN", "SWITCHED_OFF"]
    );
    // Plan history's words for the lowering's record (roadmap-types isDepthLoweringRecord; R4's historyOf reads them).
    eq(
      "depthChangeLineOf: 'lowered the depth Mastered → Fluent'; the other way 'raised'; null for a coverage-only change or a rev-3 end state",
      [
        PF.depthChangeLineOf(base.acceptance!.endState, lowered.acceptance.endState),
        PF.depthChangeLineOf(lowered.acceptance.endState, base.acceptance!.endState),
        PF.depthChangeLineOf(base.acceptance!.endState, base.acceptance!.endState.map((t) => ({ ...t, target: 5 }))),
        PF.depthChangeLineOf([{ measureKey: RT.cardsAtLevelKey([D_P], 12) }], [{ measureKey: RT.cardsAtLevelKey([D_P], 10) }]),
      ],
      ["lowered the depth Mastered → Fluent", "raised the depth Fluent → Mastered", null, null]
    );
    eq("isDepthLoweringRecord marks the lowering's record (previousVersion = version), not a re-plan's", [RT.isDepthLoweringRecord({ version: 1, previousVersion: 1 }), RT.isDepthLoweringRecord({ version: 2, previousVersion: 1 })], [true, false]);
  }
  {
    // A legacy roadmap is never measured (F-R4-16).
    const store = new Store();
    const client = stubClient(store);
    const legacy = ctxOf({ legacy: true, milestones: [ms({ id: "lg", ord: 1, measures: [cardsMeasure("lg1", [D_P], 6, 20, 10)] })], histogram: hist([D_P, 6, 15]) });
    const run = await R.recordRoadmapReadings(UID, at(MON), { env: ON, caller: "LIFE_CRON", client, loadContext: async () => legacy });
    eq("a legacy roadmap: the writer writes nothing and runs no transaction", [run.written, run.reaches, run.skipped, store.transactions], [0, 0, "NO_ROADMAP", 0]);
  }
  {
    // The loader on a stub client: a depth plan's facts, and the fallback before the migration.
    const today5 = DUE3;
    let calls = 0;
    const selects: unknown[] = [];
    let logReads = 0;
    const msRow = (id: string, ord: number, stage: string | null, measures: unknown[], items: unknown[] = [], extra: Record<string, unknown> = {}) => ({
      id,
      roadmapId: RID,
      version: 1,
      lineageId: `L-${id}`,
      ord,
      title: "x",
      titleOrigin: "CODE",
      titleDecision: "KEPT",
      windowStart: dateColumn(S3),
      dueDay: dateColumn(DUE3),
      status: "STARTED",
      goalId: `g-${id}`,
      startedDay: dateColumn(S3),
      startingAt: null,
      reachedDay: null,
      reachPendingDay: null,
      overAccepted: false,
      feasibility: { kind: "START", notes: ["HELD_AT_START", "NOT_A_NOTE"] },
      rankIndex: ord,
      createdAt: new Date("2026-10-05T00:00:00.000Z"),
      stage,
      items,
      measures,
      ...extra,
    });
    const meas = (id: string, key: string, level: number) => ({ id, milestoneId: "x", kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: [D_I] }, minLevel: level, target: 25, targetSource: "DEPTH", fittedTarget: null, rateSource: "SCOPE", baseline: 0, baselineDay: dateColumn(S3), unit: "card", itemLineageId: null, measureKey: key });
    const cpItem = { id: "cpi", milestoneId: "x", lineageId: "cp", kind: "CHECKPOINT", ord: 1, label: "Check", rawLabel: null, origin: "CODE", decision: "KEPT", domainId: null, proposedName: null, syllabusRef: null, method: null, sessionsPerWeek: null, durationBand: null, rule: null, planSource: "WORKED_OUT", checkpointKind: "PERFORMANCE_CHECK", outOf: 100, bar: 70, addToToday: true, templateId: null, flags: [], notes: [], catalogKey: "PERFORMANCE_CHECK" };
    const rowRev4 = { id: RID, status: "ACTIVE", version: 1, reachedDay: null, archiveReason: null, fieldId: "f1", depth: 12, milestones: [msRow("m12", 1, "MASTERED", [meas("a", KI12, 12)], [cpItem])], acceptances: [{ version: 1, endState: [], intervalMultiplier: 1 }] };
    const stub = (findFirst: (args: unknown) => Promise<unknown>) =>
      ({
        roadmap: { findFirst },
        $queryRaw: async () => [],
        roadmapReading: {
          findFirst: async () => null,
          findMany: async (args: { where: { source?: string; measureKey?: { startsWith?: string } } }) => {
            logReads += 1;
            return args.where.source === "SELF" && args.where.measureKey?.startsWith === RT.checkpointLogPrefix("cp")
              ? [{ measureKey: RT.checkpointLogKey("cp", "n1"), day: dateColumn(addDays(S3, 20)), value: 75, detail: { score: 75, outOf: 100 }, source: "SELF", observedAt: at(addDays(S3, 20)) }]
              : [];
          },
        },
        idea: {
          groupBy: async () => [{ domainId: D_I, level: 12, questionType: "SHORT", _count: { _all: 25 } }],
          findMany: async () => [{ id: "c1", domainId: D_I }],
        },
        domain: { findMany: async () => [{ id: D_I, name: "Inference" }] },
        taskTemplate: { findMany: async (args: { select: Record<string, unknown> }) => (args.select.closedScore ? [{ id: "g-m12", closedScore: null, archivedAt: null, dueDay: dateColumn(DUE3) }] : []) },
        taskInstance: { findMany: async () => [] },
        restDay: { findMany: async () => [] },
        activityEvent: {
          findMany: async (args: { where: { source?: string } }) =>
            args.where.source === "REVIEW"
              ? [
                  { sourceId: "c1", day: dateColumn("2026-12-20"), detail: "strike · L11", occurredAt: at("2026-12-20") },
                  { sourceId: "c1", day: dateColumn("2026-12-21"), detail: "advanced · L11→12", occurredAt: at("2026-12-21") },
                ]
              : [],
        },
      }) as unknown as RR.RoadmapReadingsClient;
    const ctx = await R.loadRoadmapContext(
      stub(async (args) => {
        selects.push(args);
        return rowRev4;
      }),
      { userId: UID, statuses: ["ACTIVE"] },
      today5
    );
    eq(
      "the loader reads a depth plan: depth 12, not legacy, the stage, the notes kept in feasibility, the counts with the retry entry, the standard's logs",
      ctx && [ctx.depth, ctx.legacy, ctx.milestones[0].stage, ctx.milestones[0].notes, ctx.counts?.retry, ctx.checkpointLogs?.length, logReads],
      [12, false, "MASTERED", ["HELD_AT_START"], { [D_I]: { 12: 1 } }, 1, 1]
    );
    const missingColumn = Object.assign(new Error("The column `RoadmapMilestone.stage` does not exist in the current database."), { code: "P2022", meta: { column: "RoadmapMilestone.stage" } });
    const old = await R.loadRoadmapContext(
      stub(async (args) => {
        calls += 1;
        selects.push(args);
        if (calls === 1) throw missingColumn;
        const withoutStage = Object.fromEntries(Object.entries(msRow("m12", 1, null, [meas("a", KI12, 12)])).filter(([k]) => k !== "stage"));
        return { id: RID, status: "ACTIVE", version: 1, reachedDay: null, archiveReason: null, fieldId: "f1", milestones: [withoutStage], acceptances: rowRev4.acceptances };
      }),
      { userId: UID, statuses: ["ACTIVE"] },
      today5
    );
    const second = selects[selects.length - 1] as { select: { depth?: unknown; milestones: { omit?: { stage?: boolean }; include: { items: { omit?: { catalogKey?: boolean } } } } } };
    check(
      "before the migration (P2022 naming RoadmapMilestone.stage) it re-reads without the new columns, and the roadmap reads as legacy",
      calls === 2 && old != null && old.depth === null && old.legacy === true && second.select.depth === undefined && second.select.milestones.omit?.stage === true && second.select.milestones.include.items.omit?.catalogKey === true,
      json({ calls, depth: old?.depth, legacy: old?.legacy })
    );
    let other = 0;
    const rethrown = await rejects(() =>
      R.loadRoadmapContext(
        stub(async () => {
          other += 1;
          throw Object.assign(new Error("The column `Roadmap.colour` does not exist"), { code: "P2022" });
        }),
        { userId: UID },
        today5
      )
    );
    check("… and any other missing column is not swallowed", rethrown && other === 1);

    // Two acceptances of one version (fix round, contracts §15.7): lowerDepthCore writes its record inside the
    // version, so `version` alone ties. The stub honours the query's orderBy and take as Prisma does (a stable
    // sort: equal keys keep the stored order, the pre-lowering record first).
    type Acc = { version: number; acceptedAt: Date; endState: unknown; intervalMultiplier: number };
    const K10I = RT.cardsAtLevelKey([D_I], 10, "rc");
    const term = (measureKey: string) => ({ measureKey, target: 25, baseline: 0, baselineDay: S3, label: "Inference · cards", targetSource: "DEPTH" });
    const accs: Acc[] = [
      { version: 1, acceptedAt: at(S3, 9), endState: [term(KI12)], intervalMultiplier: 1 },
      { version: 1, acceptedAt: at(addDays(S3, 3), 9), endState: [term(K10I)], intervalMultiplier: 1 },
    ];
    const ordered = (list: Acc[], orderBy: unknown, take?: number): Acc[] => {
      const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, "asc" | "desc">[];
      const out = [...list].sort((a, b) => {
        for (const k of keys) {
          const [f, dir] = Object.entries(k)[0] as [keyof Acc, "asc" | "desc"];
          const x = a[f] instanceof Date ? (a[f] as Date).getTime() : (a[f] as number);
          const y = b[f] instanceof Date ? (b[f] as Date).getTime() : (b[f] as number);
          if (x !== y) return dir === "desc" ? y - x : x - y;
        }
        return 0;
      });
      return take == null ? out : out.slice(0, take);
    };
    check("(the stub reproduces the tie: ordered by version alone, take 1 reads the pre-lowering record)", json(ordered(accs, { version: "desc" }, 1)[0].endState) === json([term(KI12)]));
    let accArgs: { orderBy?: unknown; take?: number } | null = null;
    const tied = await R.loadRoadmapContext(
      stub(async (args) => {
        const a = (args as { select: { acceptances: { orderBy?: unknown; take?: number } } }).select.acceptances;
        accArgs = a;
        return { ...rowRev4, acceptances: ordered(accs, a.orderBy, a.take) };
      }),
      { userId: UID, statuses: ["ACTIVE"] },
      today5
    );
    eq("two acceptances of one version: the loader reads the later record's end state (the lowered depth's)", tied?.acceptance?.endState.map((t) => t.measureKey), [K10I]);
    eq("… ordering by version, then acceptedAt (acceptanceOrderBy), newest first, take 1", [(accArgs as { orderBy?: unknown } | null)?.orderBy, (accArgs as { take?: number } | null)?.take], [RT.acceptanceOrderBy(), 1]);
    const scopeArgs: unknown[] = [];
    // Revision 5 (lane 3 re-pin): the scope map reads every ACTIVE goal (findMany) and answers the goals' union.
    const scope = await R.loadScopeMap("u-acceptance-tie", {
      roadmap: {
        findMany: async (args: { select: { acceptances: { orderBy?: unknown; take?: number } } }) => {
          scopeArgs.push(args.select.acceptances);
          return [{ id: RID, slot: 1, milestones: [], acceptances: ordered(accs, args.select.acceptances.orderBy, args.select.acceptances.take) }];
        },
      },
    } as unknown as RR.RoadmapReadingsClient);
    eq("… and so does the event writers' scope map (its end-state card keys are the lowered depth's)", [scope?.goals.map((g) => g.cards.map((c) => c.measureKey)), (scopeArgs[0] as { orderBy?: unknown }).orderBy], [[[K10I]], RT.acceptanceOrderBy()]);
    check(
      "roadmap-readings.ts has no `take: 1` acceptance read ordered by version alone",
      !/orderBy\s*:\s*\{\s*version\s*:\s*"desc"(\s+as\s+const)?\s*\}\s*,\s*take\s*:\s*1/.test(read("src/lib/roadmap-readings.ts")) && (read("src/lib/roadmap-readings.ts").match(/orderBy:\s*acceptanceOrderBy\(\)/g) ?? []).length === 2
    );
  }

  console.log("— rev 4: ranks by stage —");
  {
    type SR = PF.StageRankRow;
    const stageRows = (stages: [string, number | null][]): SR[] => stages.map(([stage, gateLevel], i) => ({ id: `s${i + 1}`, lineageId: `ls${i + 1}`, ord: i + 1, carried: false, later: false, rankIndex: null, stage, gateLevel }));
    const ranks = (rows: SR[], first: Record<string, number> = {}) => {
      const idx = PF.assignRankIndices(rows, first);
      return rows.map((r) => idx[r.id]);
    };
    eq("the pack's [L6, L8, L10, L11, L12] gives [2, 3, 4, 4, 5] (Foundation merged: its name is skipped)", ranks(stageRows([["FAMILIAR", 6], ["RETAINED", 8], ["FLUENT", 10], ["BETWEEN", 11], ["MASTERED", 12]])), [2, 3, 4, 4, 5]);
    eq("the new learner's [PART(L6), L6, L8, L10, L11, L12] gives [2, 2, 3, 4, 4, 5]", ranks(stageRows([["PART", 6], ["FAMILIAR", 6], ["RETAINED", 8], ["FLUENT", 10], ["BETWEEN", 11], ["MASTERED", 12]])), [2, 2, 3, 4, 4, 5]);
    eq("a gate needs no level; a BETWEEN or PART without one falls back to its place", ranks(stageRows([["FOUNDATION", null], ["BETWEEN", null], ["FLUENT", null]])), [1, 2, 4]);
    eq("never above the lineage's first value (Fluent first given 3 stays 3)", ranks(stageRows([["FLUENT", 10]]), { ls1: 3 }), [3]);
    eq("a track plan ranks its k-th kept stage k, whatever its key", ranks(stageRows([["STAGE_2", null], ["STAGE_4", null], ["STAGE_5", null]])), [1, 2, 3]);
    eq("rows with no stage (rev 3) keep the place rule", ranks(stageRows([["", null], ["", null]]).map((r) => ({ ...r, stage: null }))), [1, 2]);

    // Fix round (contracts §15.4): a PART at the depth never gives the depth's rank. Its target is n − 1 cards or fewer
    // counted on `r` (retry entries included), and a rank is never lost, so it gives the rank of the gate below.
    const withDepth = (rows: SR[], depth: number | null, first: Record<string, number> = {}) => {
      const idx = PF.assignRankIndices(rows, first, depth);
      return rows.map((r) => idx[r.id]);
    };
    const holdingFluent = stageRows([["FOUNDATION", 4], ["FAMILIAR", 6], ["RETAINED", 8], ["FLUENT", 10], ["PART", 12], ["MASTERED", 12]]);
    eq("a library holding Fluent, depth 12: [held ×4, PART(L12), Mastered] ranks [1, 2, 3, 4, 4, 5]: the PART gives Expert, not Virtuoso", withDepth(holdingFluent, 12), [1, 2, 3, 4, 4, 5]);
    eq("… the depth omitted reads 12 (a PART at 12 is always at the depth)", ranks(holdingFluent), [1, 2, 3, 4, 4, 5]);
    eq(
      "a Fluent depth (10): PART(L10) gives Specialist, Fluent then Expert; without the depth it would give Expert early",
      [withDepth(stageRows([["FAMILIAR", 6], ["RETAINED", 8], ["PART", 10], ["FLUENT", 10]]), 10), ranks(stageRows([["FAMILIAR", 6], ["RETAINED", 8], ["PART", 10], ["FLUENT", 10]]))],
      [
        [2, 3, 3, 4],
        [2, 3, 4, 4],
      ]
    );
    eq("a Retained depth (8): PART(L8) gives Journeyman; a PART below the depth keeps its stage's rank (PART(L6) at depth 12: Journeyman)", [withDepth(stageRows([["FAMILIAR", 6], ["PART", 8], ["RETAINED", 8]]), 8), withDepth(stageRows([["PART", 6], ["FAMILIAR", 6]]), 12)], [
      [2, 2, 3],
      [2, 2],
    ]);
    {
      const idx = PF.assignRankIndices(holdingFluent, {}, 12);
      const rows = holdingFluent.map((r, i) => ({ ord: r.ord, rankIndex: idx[r.id], reachedDay: i < 4 ? MON : null, reachPendingDay: null, scheduled: true, held: i < 4 }));
      const partReached = PF.aimRankOf({ milestones: rows.map((m) => (m.ord === 5 ? { ...m, reachedDay: today } : m)), roadmapReachedDay: null, maxScheduled: 6, today, depthRank: depthRank({ keptStages: 6 }) });
      const masteredReached = PF.aimRankOf({ milestones: rows.map((m) => (m.ord >= 5 ? { ...m, reachedDay: today } : m)), roadmapReachedDay: null, maxScheduled: 6, today, depthRank: depthRank({ keptStages: 6 }) });
      eq(
        "a library holding Fluent never shows Virtuoso before Mastered is reached: the PART gives Expert, Mastered then Virtuoso",
        [partReached.name, partReached.next, masteredReached.name],
        ["Expert", { kind: "milestone", index: 5, name: "Virtuoso", milestoneOrd: 6 }, "Virtuoso"]
      );
    }
    check(
      "assignRankIndices passes the plan's depth to rankIndexForStage",
      /rankIndexForStage\((?:[^()]|\([^()]*\))*,(?:[^()]|\([^()]*\))*,(?:[^()]|\([^()]*\))*\)/.test(read("src/lib/roadmap-proficiency.ts"))
    );
    {
      // Fix round 2 (contracts §16.9): roadmap-types' AssignRankIndices types the depth, so a call through the
      // contract (R4's RoadmapLanes) reaches R1's rule without a re-rank after it.
      const typed: RT.AssignRankIndices = PF.assignRankIndices;
      const fluentDepth = stageRows([["FAMILIAR", 6], ["RETAINED", 8], ["PART", 10], ["FLUENT", 10]]);
      const viaContract = (depth?: number | null) => {
        const idx = depth === undefined ? typed(fluentDepth, {}) : typed(fluentDepth, {}, depth);
        return fluentDepth.map((r) => idx[r.id]);
      };
      eq("through the contract type: depth 10 gives the PART Specialist [2, 3, 3, 4]; omitted (12) or null reads [2, 3, 4, 4]", [viaContract(10), viaContract(), viaContract(null)], [
        [2, 3, 3, 4],
        [2, 3, 4, 4],
        [2, 3, 4, 4],
      ]);
    }
    const learner = [2, 2, 3, 4, 4, 5].map((r, i) => ({ ord: i + 1, rankIndex: r, reachedDay: null as DayKey | null, reachPendingDay: null, scheduled: true }));
    const v0 = PF.aimRankOf({ milestones: learner, roadmapReachedDay: null, maxScheduled: 6, today, depthRank: depthRank({ keptStages: 6 }) });
    const v1 = PF.aimRankOf({ milestones: learner.map((m) => (m.ord === 1 ? { ...m, reachedDay: today } : m)), roadmapReachedDay: null, maxScheduled: 6, today, depthRank: depthRank({ keptStages: 6 }) });
    eq("the count gate gives Journeyman first; its stage then keeps your rank", [v0.next, v1.name, v1.next], [{ kind: "milestone", index: 2, name: "Journeyman", milestoneOrd: 1 }, "Journeyman", { kind: "milestone", index: 3, name: "Specialist", milestoneOrd: 3 }]);
    eq("the learner's ladder: Initiate, Journeyman (part 1), Specialist, Expert, Virtuoso, Paragon", v0.ladder.map((l) => [l.name, l.milestoneOrd]), [
      ["Initiate", null],
      ["Journeyman", 1],
      ["Specialist", 3],
      ["Expert", 4],
      ["Virtuoso", 6],
      ["Paragon", null],
    ]);

    // The top rank by depth (topRankIndexOfDepth through aimRankOf).
    const allReached = [2, 3, 4, 4, 5].map((r, i) => ({ ord: i + 1, rankIndex: r, reachedDay: "2027-06-01", reachPendingDay: null, scheduled: true }));
    const top = (dr: RT.DepthRankInput, aim: DayKey | null = "2027-06-05") => {
      const v = PF.aimRankOf({ milestones: allReached.filter((m) => m.rankIndex <= (dr.depth === 12 ? 5 : dr.depth === 10 ? 4 : 3)), roadmapReachedDay: aim, maxScheduled: 5, today: "2027-06-05", depthRank: dr });
      return [v.name, v.top.name, v.next.kind];
    };
    eq("a Fluent-depth plan tops out at Expert and never gives Paragon, even with its aim reached", top(depthRank({ depth: 10 })), ["Expert", "Expert", "top"]);
    eq("a Mastered plan with no standard tops out at Virtuoso", top(depthRank({ hasStandard: false })), ["Virtuoso", "Virtuoso", "top"]);
    eq("so does one with a Domain below the coverage policy", top(depthRank({ coverageBelowPolicy: true })), ["Virtuoso", "Virtuoso", "top"]);
    eq("so does one with no production practice planned from Fluent on", top(depthRank({ productionPlannedFromFluent: false })), ["Virtuoso", "Virtuoso", "top"]);
    eq("with all four, the aim gives Paragon; before the aim, the next rank is Paragon", [top(depthRank())[0], top(depthRank(), null)], ["Paragon", ["Virtuoso", "Paragon", "paragon"]]);

    // Held stages give no rank (a STRONG library holding Retained at acceptance).
    const strong = [1, 2, 3, 4, 4, 5].map((r, i) => ({ ord: i + 1, rankIndex: r, reachedDay: i < 3 ? "2026-10-05" : null, reachPendingDay: null, scheduled: true, held: i < 3 }));
    const atStart = PF.aimRankOf({ milestones: strong, roadmapReachedDay: null, maxScheduled: 6, today, depthRank: depthRank({ keptStages: 6 }) });
    const atFluent = PF.aimRankOf({ milestones: strong.map((m) => (m.ord === 4 ? { ...m, reachedDay: today } : m)), roadmapReachedDay: null, maxScheduled: 6, today, depthRank: depthRank({ keptStages: 6 }) });
    eq("held stages give no rank: Initiate, the next rank Expert at Fluent; then Expert once Fluent is reached", [atStart.name, atStart.next, atFluent.name, atFluent.newSince], ["Initiate", { kind: "milestone", index: 4, name: "Expert", milestoneOrd: 4 }, "Expert", today]);
    eq("… and no ladder row for a held stage's rank", atStart.ladder.map((l) => l.name), ["Initiate", "Expert", "Virtuoso", "Paragon"]);
    // … but they count as reached in Proficiency's stages part.
    const heldRow = (id: string, ord: number, stage: RT.StageKey) => ms({ id, ord, stage, status: "PLANNED", startedDay: null, goalId: null, goal: null, reachedDay: MON, notes: ["HELD_AT_START"], measures: [] });
    const openRow = (id: string, ord: number, stage: RT.StageKey) => ms({ id, ord, stage, status: "PLANNED", startedDay: null, goalId: null, goal: null, measures: [] });
    const heldCtx = ctxOf({
      depth: 12,
      acceptance: { version: 1, endState: [{ measureKey: KP12, target: 34, baseline: 0, baselineDay: MON, label: "x", targetSource: "DEPTH" }] },
      milestones: [heldRow("h1", 1, "FOUNDATION"), heldRow("h2", 2, "FAMILIAR"), heldRow("h3", 3, "RETAINED"), openRow("h4", 4, "FLUENT"), openRow("h5", 5, "BETWEEN"), openRow("h6", 6, "MASTERED")],
      counts: M.cardCountsOf([{ domainId: D_P, level: 8, questionType: "SHORT", count: 34 }]),
    });
    const hp = PF.parseProficiencyDetail(R.planRoadmapWrite(heldCtx, at(MON)).proficiency!.detail)!;
    eq("held stages count as reached in the stages part (3 of 6 positions)", [hp.reached, hp.scheduled, hp.parts.milestones], [3, 6, 0.5]);

    // Track plans (HM-3).
    const trackTop = (keptStages: number, spanDays: number, hasStandard = true) => RT.aimRankName(RT.topRankIndexOfDepth({ depth: null, track: true, hasStandard, keptStages, spanDays, coverageBelowPolicy: false, productionPlannedFromFluent: false }));
    eq("track plans: 35 days, one kept stage and a standard → at most Aspirant; 200 days, 5 kept → Paragon; 3 kept → Specialist", [trackTop(1, 35), trackTop(5, 200), trackTop(3, 200), trackTop(5, 179)], ["Aspirant", "Paragon", "Specialist", "Virtuoso"]);
    const archivedThenNew = [1, 1].map(() => PF.aimRankOf({ milestones: [{ ord: 1, rankIndex: 1, reachedDay: "2026-11-01", reachPendingDay: null, scheduled: true }], roadmapReachedDay: "2026-11-09", maxScheduled: 1, today: "2026-11-10", depthRank: { depth: null, track: true, hasStandard: true, keptStages: 1, spanDays: 35, coverageBelowPolicy: false, productionPlannedFromFluent: false } }));
    eq("archiving a 35-day aim and setting another gives each roadmap at most Aspirant", archivedThenNew.map((v) => v.name), ["Aspirant", "Aspirant"]);

    // Monotone over a series: a degradation, a lowered depth, a re-date and an Undo.
    type Row = { ord: number; rankIndex: number; reachedDay: DayKey | null; reachPendingDay: DayKey | null; scheduled: boolean };
    const plan5 = (reached: number, scheduled = 5): Row[] => [2, 3, 4, 4, 5].slice(0, scheduled).map((r, i) => ({ ord: i + 1, rankIndex: r, reachedDay: i < reached ? "2027-01-01" : null, reachPendingDay: null, scheduled: true }));
    const series: [string, Row[], RT.DepthRankInput][] = [
      ["accept a Mastered plan", plan5(0), depthRank()],
      ["reach Familiar", plan5(1), depthRank()],
      ["a degradation (reachedDay stays)", plan5(1), depthRank()],
      ["reach Retained", plan5(2), depthRank()],
      ["lower the depth to Fluent (Toward Mastered and Mastered dropped)", plan5(2, 3), depthRank({ depth: 10 })],
      ["a re-date of the unstarted stages", plan5(2, 3), depthRank({ depth: 10 })],
      ["Undo of the re-plan", plan5(2), depthRank()],
      ["reach Fluent", plan5(3), depthRank()],
    ];
    const views = series.map(([, rows, dr]) => PF.aimRankOf({ milestones: rows, roadmapReachedDay: null, maxScheduled: 5, today: "2027-02-01", depthRank: dr }));
    const idx = views.map((v) => v.index);
    check("the rank never falls over the series, and the top shown is never below it", json(idx) === json([0, 2, 2, 3, 3, 3, 3, 4]) && views.every((v) => v.top.index >= v.index), json(views.map((v) => [v.index, v.top.index])));
    eq("a lower depth caps the top (Expert) and keeps every rank given", [views[4].name, views[4].top.name], ["Specialist", "Expert"]);
  }

  console.log("— rev 4: Proficiency v2 —");
  {
    // The worked example: 5 milestones, 72 planned sessions, every coverage card (34 + 25) at exactly level 8, practice 30 of 72, stages 2 of 5.
    const basis: RT.ProficiencyBasis = {
      basisVersion: 1,
      cards: [
        { measureKey: KI12, domainIds: [D_I], level: 12, target: 25 },
        { measureKey: KP12, domainIds: [D_P], level: 12, target: 34 },
      ],
      practice: [{ itemLineageId: "pl", planned: 72 }],
      scheduled: 5,
    };
    const counts = M.cardCountsOf([
      { domainId: D_P, level: 8, questionType: "SHORT", count: 34 },
      { domainId: D_I, level: 8, questionType: "SHORT", count: 25 },
      { domainId: D_I, level: 12, questionType: "MULTI", count: 9 },
    ]);
    const make = (b: RT.ProficiencyBasis, previous: RT.Reading | null = null, decision: PF.ProficiencyReadingInput["decision"] = null, c = counts, day = today) => {
      const row = PF.proficiencyReadingOf({ roadmapId: RID, today: day, basis: b, histogram: c.all, counts: c, domainNames: NAMES, kept: { pl: 30 }, reached: 2, reachedOnTicks: false, previous, decision });
      return reading(row.measureKey, row.day, row.value, row.detail, at(day).toISOString());
    };
    const w = make(basis);
    near("cards 59 × 69 ÷ (59 × 340) = 0.2029 (9 multiple-choice cards at 12 not counted)", (w.detail as RT.ProficiencyDetail).parts.cards, 69 / 340);
    near("value = 0.6 × 0.2029 + 0.25 × 0.4167 + 0.15 × 0.4 = 0.2859", w.value, 0.6 * (69 / 340) + 0.25 * (30 / 72) + 0.15 * 0.4, 1e-12);
    const view = PF.proficiencyViewOf(w, null, today, false);
    eq("shown as 'Proficiency toward Mastered (level 12): 28%', labelled with its basis", [view.label, view.percent, PF.proficiencyLineOf(view.toward, w.value), (w.detail as PF.ProficiencyDetailR1).toward], [
      "Proficiency toward Mastered (level 12)",
      28,
      "Proficiency toward Mastered (level 12): 28%",
      { level: 12, name: "Mastered" },
    ]);
    const full = make(basis, null, null, M.cardCountsOf([
      { domainId: D_P, level: 12, questionType: "SHORT", count: 34 },
      { domainId: D_I, level: 13, questionType: "SHORT", count: 25 },
    ]));
    eq("the cards part is exactly 1 when the depth is held", (full.detail as RT.ProficiencyDetail).parts.cards, 1);
    const retry = make(basis, null, null, M.cardCountsOf([{ domainId: D_P, level: 12, questionType: "SHORT", count: 34 }, { domainId: D_I, level: 12, questionType: "SHORT", count: 25 }], { [D_I]: { 12: 1 } }));
    near("a retry-entry card at 12 weighs as 11 until its next pass", (retry.detail as RT.ProficiencyDetail).parts.cards, (58 * 340 + 230) / (59 * 340), 1e-12);
    eq(
      "the floor table at depth 12: Foundation 1.8, Familiar 7.4, Retained 20.3, Fluent 45.6, Toward Mastered 67.6, Mastered 100",
      [4, 6, 8, 10, 11, 12].map((l) => PF.floorPercentOf(PF.stageFloorOf(l, 12))),
      [1.8, 7.4, 20.3, 45.6, 67.6, 100]
    );
    // Fix round (contracts §15.11): ProficiencyToward is roadmap-types' (ProficiencyView.toward reads it), R1 re-exports it.
    const towardOnContract: RT.ProficiencyToward = view.toward!;
    const towardHere: PF.ProficiencyToward = towardOnContract;
    const contractView: RT.ProficiencyView = view;
    eq("ProficiencyToward is the contract's type (no copy of its own), and the view fills the contract's toward and label", [towardHere, contractView.toward, contractView.label], [{ level: 12, name: "Mastered" }, { level: 12, name: "Mastered" }, "Proficiency toward Mastered (level 12)"]);
    check("roadmap-proficiency.ts declares no ProficiencyToward of its own", !/interface\s+ProficiencyToward\b|type\s+ProficiencyToward\s*=/.test(read("src/lib/roadmap-proficiency.ts")));
    eq("a rev-3 basis and a track basis read 'Proficiency' alone", [PF.proficiencyLabelOf(PF.proficiencyTowardOf({ cards: [{ measureKey: RT.cardsAtLevelKey([D_P], 8), domainIds: [D_P], level: 8, target: 30 }] })), PF.proficiencyLabelOf(PF.proficiencyTowardOf({ cards: [] }))], ["Proficiency", "Proficiency"]);

    // A version-2 reading shows no delta against version 1, and never rebases against it.
    // A v1 reading of the rev-3 shape (one union term, no segment): another formula and another basis.
    const v1Basis: RT.ProficiencyBasis = { ...basis, cards: [{ measureKey: RT.cardsAtLevelKey([D_I, D_P], 12), domainIds: [D_I, D_P].sort(), level: 12, target: 59 }] };
    const v1 = { ...w, day: addDays(weekStartKeyOf(today), -1), value: 0.5, detail: { ...(w.detail as object), v: 1, basis: v1Basis, basisVersion: 1 } };
    const after1 = make(basis, v1);
    eq("a v2 reading shows no delta against a v1 reading and carries no rebase", [PF.proficiencyChangeOf(after1, v1, today), (after1.detail as RT.ProficiencyDetail).rebased], [null, null]);

    // A depth change and a coverage choice are plan decisions: rebased, and the label names the new basis.
    const K10P = RT.cardsAtLevelKey([D_P], 10, "rc");
    const K10I = RT.cardsAtLevelKey([D_I], 10, "rc");
    const fluent: RT.ProficiencyBasis = { ...basis, cards: [{ measureKey: K10I, domainIds: [D_I], level: 10, target: 25 }, { measureKey: K10P, domainIds: [D_P], level: 10, target: 34 }], scheduled: 3 };
    const lowered = make(fluent, w, { cause: "REPLAN" });
    const lv = PF.proficiencyViewOf(lowered, w, today, false);
    eq("lowering the depth: rebased 'depth lowered Mastered → Fluent', labelled toward Fluent (level 10)", [(lowered.detail as RT.ProficiencyDetail).rebased?.detail, lv.label, lv.change?.kind], ["depth lowered Mastered → Fluent", "Proficiency toward Fluent (level 10)", "rebased"]);
    check("… a higher figure after a lowering is never shown as a gain (it is a change of plan)", lowered.value > w.value && lv.change?.kind === "rebased" && PF.proficiencyPercent((lv.change as { rebase: RT.ProficiencyRebase }).rebase.from) === 28);
    const choice: RT.ProficiencyBasis = { ...basis, cards: basis.cards.map((c) => (c.measureKey === KP12 ? { ...c, target: 5 } : c)) };
    const chosen = make(choice, w, { cause: "REPLAN" });
    eq("a coverage choice: rebased 'coverage in Probability lowered 34 → 5', still toward Mastered (level 12)", [(chosen.detail as RT.ProficiencyDetail).rebased?.detail, PF.proficiencyViewOf(chosen, w, today, false).label], ["coverage in Probability lowered 34 → 5", "Proficiency toward Mastered (level 12)"]);
    eq("the Proficiency label never says 'Mastered' without its level", /Mastered(?! \(level 12\))/.test(view.label + lv.label), false);
  }

  console.log("— rev 4: pace with the reach model, and the triggers —");
  {
    const calib = RT.reachInputsOf({ passShare: { kind: "calibrating", have: 3, need: 30 }, clearance: { kind: "calibrating", have: 2, need: 14 } }, 1);
    eq("calibrating: the published priors (0.80, 0.85, 0.6), never p = 1", [calib.params.p, calib.params.c, calib.params.rho, calib.calibrating], [0.8, 0.85, 0.6, ["p", "c", "rho"]]);
    const measure: P.CardPaceMeasure = { minLevel: 8, target: 8, baseline: 0, dueDay: addDays(today, 120), reachedDay: null };
    const cards: P.PaceCard[] = Array.from({ length: 10 }, (_, i) => ({ level: 4, dueDay: addDays(today, i) }));
    const dayOf = (p: RT.PaceResult) => ("day" in p ? p.day : "far");
    const best = P.projectCards(measure, cards, null, null, today, 1);
    const priors = P.projectCards(measure, cards, null, null, today, 1, { reach: calib.params, calibrating: calib.calibrating });
    check("with the reach model a calibrating projection uses the priors: not the best case, and never earlier", best.kind !== "far" && priors.kind !== "far" && "bestCase" in priors && priors.bestCase === false && dayOf(priors) >= dayOf(best), json({ best, priors }));
    const c1 = P.projectCards(measure, cards, null, null, today, 1, { reach: { ...calib.params, c: 1, rho: 0 } });
    const c8 = P.projectCards(measure, cards, null, null, today, 1, { reach: { ...calib.params, c: 0.8 } });
    check("missing days cost time: c 0.8 dates no earlier than c 1", dayOf(c8) >= dayOf(c1), json({ c1, c8 }));
    const bestReach = P.projectCards(measure, cards, null, null, today, 1, { reach: RT.bestCaseParams(1) });
    eq("the best-case params give rev 3's best-case day", dayOf(bestReach), dayOf(best));
    const mc: P.PaceCard[] = [...cards, ...Array.from({ length: 10 }, () => ({ level: 8, dueDay: today, recall: false }))];
    eq(
      "a key with a segment counts no multiple-choice card; a key without one counts them (rev 3)",
      [dayOf(P.projectCards({ ...measure, segment: "r" }, mc, null, null, today, 1, { reach: calib.params })), dayOf(P.projectCards(measure, mc, null, null, today, 1, { reach: calib.params }))],
      [dayOf(priors), today]
    );
    const m12: P.CardPaceMeasure = { minLevel: 12, target: 1, baseline: 0, dueDay: addDays(today, 30), reachedDay: null, segment: "rc" };
    const clean = P.projectCards(m12, [{ level: 12, dueDay: addDays(today, 100) }], null, null, today, 1, { reach: calib.params });
    const retried = P.projectCards(m12, [{ level: 12, dueDay: addDays(today, 100), retryEntry: true }], null, null, today, 1, { reach: calib.params });
    check("`rc`: a clean card at 12 counts today; a retry entry needs its next pass first", dayOf(clean) === today && dayOf(retried) !== today, json({ clean, retried }));

    const trig = (extra: Partial<P.TriggerInput>) => P.triggersOf({ milestones: [], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: null, ...extra });
    eq("CALIBRATED: a pass rate the date assumed is measured now", trig({ calibrated: { atAcceptance: ["p"], calibratingNow: [], p: 0.76 } }), [
      { trigger: "CALIBRATED", milestoneOrd: null, line: "Your pass rate is now measured (76%). Re-date the stages you haven't started?" },
    ]);
    eq("… two inputs at once", trig({ calibrated: { atAcceptance: ["p", "c", "pace"], calibratingNow: ["pace"], p: 0.76, c: 0.92 } })[0]?.line, "Your pass rate (76%) and the share of your due queue you clear (92%) are now measured. Re-date the stages you haven't started?");
    eq("… none while still calibrating, and none for the pace alone (PACE_MEASURED's)", [trig({ calibrated: { atAcceptance: ["p"], calibratingNow: ["p"] } }), trig({ calibrated: { atAcceptance: ["pace"], calibratingNow: [] } })], [[], []]);
    eq(
      "PACE_MEASURED first, then CALIBRATED; on a depth plan the lines re-date",
      trig({ paceAtAcceptance: "YOURS", depthPlan: true, calibrated: { atAcceptance: ["rho"], calibratingNow: [] } }).map((h) => [h.trigger, h.line]),
      [
        ["PACE_MEASURED", "Your pace of new cards is now measured: re-dating the stages you haven't started can use it"],
        ["CALIBRATED", "How your missed days bunch together is now measured. Re-date the stages you haven't started?"],
      ]
    );
    // today is Wed 4 Nov 2026: a due day 20 days on is 24 Nov.
    const behind: RT.PaceResult = { kind: "behind", day: addDays(today, 41), daysLate: 21, expectedByDue: 16, target: 20, bestCase: false };
    eq(
      "BEHIND names what it assumed",
      trig({ assumed: ["p"], milestones: [{ ord: 2, cardPaces: [behind], pays: [], practice: null, carried: false, checkpoint: null }] })[0]?.line,
      "About 3 weeks behind: at your pace about 16 of 20 by 24 Nov (assumes an 80% pass rate until 30 reviews are measured)"
    );
    eq("CALIBRATED is the last of REPLAN_TRIGGERS (roadmap-pace's loop finds it)", RT.REPLAN_TRIGGERS[RT.REPLAN_TRIGGERS.length - 1], "CALIBRATED");
  }
  {
    // Every parser of a measure key honours its segment: R1's files read keys only through parseMeasureKey.
    const offenders = ["src/lib/roadmap-measures.ts", "src/lib/roadmap-pace.ts", "src/lib/roadmap-proficiency.ts", "src/lib/roadmap-readings.ts"].filter((f) =>
      /CARDS_AT_LEVEL\\\||PRACTICE_KEPT\\\||startsWith\(["'`]CARDS_AT_LEVEL|startsWith\(["'`]PRACTICE_KEPT|measureKey\.split\(/.test(read(f))
    );
    check("R1's files parse measure keys only through parseMeasureKey (which honours `r` and `rc`)", offenders.length === 0, offenders.join(", "));
  }

  // ═══ Revision 5: readings per goal (contracts §23.3, §23.4; lane 3) ═══════

  console.log("— revision 5: readings per goal, the scope union, RESUMED and Today's goal chip (§23.3, §23.4; lane 3) —");
  {
    const R2 = "r2";
    const today = "2026-11-04";
    const K6X = RT.cardsAtLevelKey([D_X], 6);
    const tb = { tb: { rule: "TARGET:1/W", startDay: MON, instances: ticks(2) } };
    const goal1 = ctxOf({ milestones: [cardsMs(), practiceMs()], templates: tb, histogram: hist([D_P, 6, 14], [D_X, 6, 3]) });
    const goal2 = ctxOf({
      roadmap: { id: R2, status: "ACTIVE", version: 1, reachedDay: null, archiveReason: null },
      milestones: [ms({ id: "mx", ord: 1, measures: [cardsMeasure("mx1", [D_X], 6, 20, 0)] })],
      histogram: hist([D_P, 6, 14], [D_X, 6, 3]),
    });
    const byId: Record<string, RR.RoadmapContext> = { [RID]: goal1, [R2]: goal2 };
    const goalDeps = (store: Store, seen: string[] = []) => ({
      env: ON,
      client: stubClient(store),
      loadGoals: async () => [RID, R2],
      loadContext: async (q: RR.ContextQuery, day: DayKey) => {
        seen.push(q.roadmapId ?? "?");
        const c = q.roadmapId ? byId[q.roadmapId] : undefined;
        return c ? fromStore(store, c, day) : null;
      },
    });

    // runForActiveGoals: one context per ACTIVE goal, in seat order, each written on its own.
    const store = new Store();
    const seen: string[] = [];
    const run = await R.recordRoadmapReadings(UID, at(today), { ...goalDeps(store, seen), caller: "LIFE_CRON" });
    eq(
      "goals: the full writer runs every ACTIVE goal on its own context, in seat order, each goal's readings and PROFICIENCY written",
      [seen, run.skipped, run.error ?? null, store.get(K6, today)?.value, store.get(K6X, today)?.value, store.get(RT.proficiencyKey(RID), today) != null, store.get(RT.proficiencyKey(R2), today) != null],
      [[RID, R2], null, null, 14, 3, true, true]
    );
    const solo = new Store();
    const soloList = await R.recordRoadmapReadings(UID, at(today), { env: ON, caller: "LIFE_CRON", client: stubClient(solo), loadGoals: async () => [RID], loadContext: async (_q, day) => fromStore(solo, goal1, day) });
    const single = new Store();
    const singleRun = await R.recordRoadmapReadings(UID, at(today), { env: ON, caller: "LIFE_CRON", client: stubClient(single), loadContext: async (_q, day) => fromStore(single, goal1, day) });
    eq(
      "goals: one goal through the goal list writes exactly what the one-context run writes (the same run, rows and SQL)",
      [json(soloList) === json(singleRun), json([...solo.readings.values()].map((r) => [r.measureKey, r.value])) === json([...single.readings.values()].map((r) => [r.measureKey, r.value])), json(solo.sql) === json(single.sql)],
      [true, true, true]
    );

    // Each goal is guarded on its own: one goal's failure never stops another's readings, and its error names its seat.
    const s2 = new Store();
    const failing = await quietly(() =>
      R.recordRoadmapReadings(UID, at(today), {
        env: ON,
        caller: "LIFE_CRON",
        client: stubClient(s2),
        loadGoals: async () => [RID, R2],
        loadContext: async (q, day) => {
          if (q.roadmapId === RID) throw new Error("connection reset");
          return fromStore(s2, goal2, day);
        },
      })
    );
    eq(
      "goals: goal 1's failure leaves goal 2's readings written, and comes back named by its seat (roadmapStepErrorsOf carries it)",
      [failing.skipped, failing.error, s2.get(K6X, today)?.value, s2.get(K6, today) ?? null, RT.roadmapStepErrorsOf({ readings: failing })],
      [null, "goal 1: connection reset", 3, null, ["readings: goal 1: connection reset"]]
    );
    const none = await R.recordRoadmapReadings(UID, at(today), { env: ON, caller: "LIFE_CRON", client: stubClient(new Store()), loadGoals: async () => [], loadContext: async () => goal1 });
    eq("goals: no ACTIVE goal reads NO_ROADMAP, as before", none, { written: 0, reaches: 0, skipped: "NO_ROADMAP" });

    // The scope union: a hook runs only the goals whose scope matched.
    const union: RR.RoadmapScopeUnion = {
      goals: [R.scopeMapOf({ roadmapId: RID, milestones: goal1.milestones, endState: [] }), R.scopeMapOf({ roadmapId: R2, milestones: goal2.milestones, endState: [] })],
    };
    eq(
      "goals: the union's tests — a level change in Elsewhere moves goal 2's scope only, the Backtest template is goal 1's, a Domain in no scope moves none",
      [R.goalsMovedByReview(union, D_X, 5, 6), R.goalsMovedByReview(union, D_P, 5, 6), R.goalsHoldingTemplate(union, "tb"), R.goalsMovedByReview(union, D_I, 5, 6), R.goalsMovedByReview(null, D_X, 5, 6)],
      [[R2], [RID], [RID], [], []]
    );
    const s3 = new Store();
    const hookSeen: string[] = [];
    const hook = { ...goalDeps(s3, hookSeen), now: at(today), loadScopeMap: async () => union };
    await R.recordCardsForReview(UID, "idea1", D_X, 5, 6, hook);
    eq("goals: a review in goal 2's Domain runs only goal 2", [hookSeen, s3.get(K6X, today)?.value, s3.get(K6, today) ?? null], [[R2], 3, null]);
    hookSeen.length = 0;
    await R.recordPracticeForTemplate(UID, "tb", hook);
    eq("goals: a tick of goal 1's practice runs only goal 1", [hookSeen, s3.get(K6, today)?.value], [[RID], 14]);
    hookSeen.length = 0;
    await R.recordCardsForReview(UID, "idea1", D_I, 5, 6, hook);
    await R.recordPracticeForTemplate(UID, "elsewhere", hook);
    eq("goals: a review or a tick in no goal's scope reads nothing", hookSeen, []);

    // The real reads: every ACTIVE goal in one wave-1 query, never a PAUSED one, in seat order.
    const scopeWhere: unknown[] = [];
    const real = await R.loadScopeMap("u-goals-scope", {
      roadmap: {
        findMany: async (args: { where: unknown }) => {
          scopeWhere.push(args.where);
          return [
            { id: "rB", slot: 2, milestones: [], acceptances: [] },
            { id: "rN", slot: null, milestones: [], acceptances: [] },
            { id: "rA", slot: 1, milestones: [], acceptances: [] },
          ];
        },
      },
    } as unknown as RR.RoadmapReadingsClient);
    eq(
      "goals: loadScopeMap reads the ACTIVE goals only (a PAUSED goal has no scope) and answers them in seat order, a NULL slot last",
      [scopeWhere, real?.goals.map((g) => g.roadmapId)],
      [[{ userId: "u-goals-scope", status: "ACTIVE" }], ["rA", "rB", "rN"]]
    );
    const fullWhere: unknown[] = [];
    const noGoal = await R.recordRoadmapReadings("u-goals-none", at(today), {
      env: ON,
      caller: "LIFE_CRON",
      client: { roadmap: { findMany: async (args: { where: unknown }) => (fullWhere.push(args.where), []) } } as unknown as RR.RoadmapReadingsClient,
    });
    eq(
      "goals: the full writer's one wave-1 read asks for the ACTIVE goals only (PAUSED skipped), and with none reads NO_ROADMAP",
      [fullWhere, noGoal],
      [[{ userId: "u-goals-none", status: { in: ["ACTIVE"] } }], { written: 0, reaches: 0, skipped: "NO_ROADMAP" }]
    );
    eq("goals: bySeatOf orders by slot, a NULL slot last, then id", R.bySeatOf([{ id: "b", slot: null }, { id: "c", slot: 3 }, { id: "a", slot: null }, { id: "d", slot: 1 }]).map((x) => x.id), ["d", "c", "a", "b"]);

    // RESUMED (contracts §23.4): the first reading after a resume is a rebase, never a gain, even on the same basis.
    const basis: RT.ProficiencyBasis = { basisVersion: 1, cards: [{ measureKey: K6, domainIds: [D_P], level: 6, target: 20 }], practice: [], scheduled: 1 };
    const pin = (day: DayKey, histogram: Record<string, Record<number, number>>, previous: RT.Reading | null, decision?: { cause: RT.ProficiencyRebaseCause }) =>
      PF.proficiencyReadingOf({ roadmapId: RID, today: day, basis, histogram, domainNames: NAMES, kept: {}, reached: 0, reachedOnTicks: false, previous, ...(decision ? { decision } : {}) });
    const paused = pin("2026-10-06", hist([D_P, 6, 8]), null);
    const prev = reading(paused.measureKey, paused.day, paused.value, paused.detail);
    const plain = pin(today, hist([D_P, 6, 16]), prev);
    const resumed = pin(today, hist([D_P, 6, 16]), prev, { cause: "RESUMED" });
    eq(
      "RESUMED: a resume's reading rebases 'since you resumed' from the paused value, even on the same basis; the same basis without it never rebases",
      [plain.detail.rebased, resumed.detail.rebased, resumed.value === plain.value],
      [null, { on: today, from: paused.value, cause: "RESUMED", detail: "since you resumed" }, true]
    );
    const cur = reading(resumed.measureKey, resumed.day, resumed.value, JSON.parse(JSON.stringify(resumed.detail)));
    eq(
      "RESUMED: the stored detail reads its cause back, and the week shows the rebase, never a gain",
      [PF.parseProficiencyDetail(cur.detail)?.rebased?.cause, PF.proficiencyChangeOf(cur, prev, today)?.kind, PF.rebaseDetailOf(basis, basis, "RESUMED")],
      ["RESUMED", "rebased", "since you resumed"]
    );

    // Today's goal chip (contracts §23.3; D39): the seat only with 2 or more goals open.
    const entry = { series: [], ord: 2, of: 5, zeroReason: null, note: null };
    const chip = (seat?: { slot: RT.GoalSlot | null; open: number }) => roadmapGoalCardOf({ goalMp: 6 }, { steps: [], readings: [] }, today, today, seat ? { ...entry, seat } : entry);
    eq(
      "Today's goal chip: one goal reads 'Roadmap · milestone 2 of 5' with no seat (as before); with 2 or more open, '2 of 5' after its seat glyph; a paused goal's entry shows none",
      [chip().chip, "slot" in chip(), chip({ slot: 1, open: 1 }).chip, chip({ slot: 2, open: 2 }).chip, chip({ slot: 2, open: 2 }).slot, chip({ slot: null, open: 3 }).chip, "slot" in chip({ slot: null, open: 3 })],
      ["Roadmap · milestone 2 of 5", false, "Roadmap · milestone 2 of 5", "2 of 5", 2, "Roadmap · milestone 2 of 5", false]
    );
  }

  // ═══ Greps: isolation and names ═════════════════════════════════════════

  console.log("— greps —");
  const MINE = ["src/lib/roadmap-measures.ts", "src/lib/roadmap-pace.ts", "src/lib/roadmap-proficiency.ts", "src/lib/roadmap-readings.ts"];
  const strip = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g, "``")
      .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
      .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
  {
    const goalsSrc = read("src/lib/goals.ts") + (existsSync(join(ROOT, "src/lib/goals-server.ts")) ? read("src/lib/goals-server.ts") : "");
    check("the Proficiency figure never appears in a goals.ts input (it pays nothing and sets no g)", !/proficiency/i.test(strip(goalsSrc)) && !/roadmap-proficiency/.test(goalsSrc));
    const roadmapFiles = [
      ...readdirSync(join(ROOT, "src/lib"))
        .filter((f) => /^(roadmap-[\w-]+|throughput(-server)?)\.ts$/.test(f))
        .map((f) => `src/lib/${f}`),
      ...(existsSync(join(ROOT, "src/components/roadmap")) ? readdirSync(join(ROOT, "src/components/roadmap")).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => `src/components/roadmap/${f}`) : []),
    ];
    const celebrating = roadmapFiles.filter((f) => /from\s+["'][^"']*(celebrations|celebration-detect)["']/.test(read(f)));
    check("no roadmap module imports celebrations.ts or celebration-detect.ts (F20)", celebrating.length === 0, celebrating.join(", "));
  }
  for (const f of MINE) {
    const src = read(f);
    const code = strip(src);
    const declared = new Set<string>();
    for (const m of code.matchAll(/\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
    for (const m of code.matchAll(/^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/gm)) declared.add(m[1]);
    for (const m of code.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*:/g)) declared.add(m[1]);
    const bad = [...declared].filter((n) => /skill|mastery|Mp/.test(n) || /^(quest|Quest|questOf|questTargetOf|QuestState|questStateOf|QUEST_CAP)$/.test(n) || /^QUEST_/.test(n));
    check(`${f}: no declared name contains skill, mastery or Mp, and none takes a review quest name`, bad.length === 0, bad.join(", "));
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const banned = imports.filter((i) => /(review-facts|board-ui|full-day|titles|field-tier|skill-visuals|celebrations|celebration-detect|roadmap-model|roadmap-validate|roadmap-evidence|gemini)$/.test(i));
    check(`${f}: no forbidden import (review quest, ladders, celebrations, model modules)`, banned.length === 0, banned.join(", "));
    const constructors = /\b(measured|recorded|selfReported|estimated|workedOut)\(/.test(code);
    const allowedBrand = /roadmap-(measures|proficiency)\.ts$/.test(f);
    check(`${f}: the number-brand constructors are called only where allowed`, allowedBrand || !constructors);
    check(`${f}: yoursText(), labelTextOf() and codeText() are not called here, and the origin 'CODE' is not written`, !/\b(yoursText|labelTextOf|codeText)\(/.test(code) && !/["']CODE["']/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")));
    check(`${f}: no STUB marker left`, !/STUB: lane R1/.test(src));
  }

  if (pending.length) for (const p of pending) console.log(`PENDING ${p}`);
  if (failed > 0) {
    console.log(`\nroadmap-measures-check: ${passed} passed, ${failed} FAILED`);
    process.exit(1);
  }
  console.log(`\nroadmap-measures-check: ${passed} passed, 0 failed${pending.length ? `, ${pending.length} pending another lane` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
