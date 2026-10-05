/**
 * The feasibility engine and the in-house starter on fixed cases
 * (docs/life-plan/roadmap.md F4 and F7 Tests, lane R2): floors, reach from
 * effective states, the worked example (p = 0.8 and calibrating),
 * IMPOSSIBLE with its copy and earliest day, OVER vs IMPOSSIBLE, FITTED at
 * every intensity, the ramp cap and the unverified fallback, adherence in
 * available time, shared source rates, combined per-week load, allocation
 * (the study practice, "cut a practice"), the aim check, the window split,
 * held weeks, each remedy's promise, refit (lineage, carried rows, n ≤ 6 −
 * carried), refitForStart's delayed start, the per-week plan, the
 * StartSnapshot, and the starter goldens. Fix round 2: a row is never held
 * to its own lineage's floor, a re-plan keeps its carried rows' floor, a
 * started target is judged against today's reach (never FITTED), "Kept at"
 * only when the fit held a target up, and the carried rows the engine is
 * given set the re-split (R4 leaves a dropped original out).
 *
 * Revision 4 fix round (contracts §15): every figure at WRITE_MARGIN 1.3;
 * F-R4-10's final-stretch bound asserted on every corpus fixture (no
 * clean-entry exemption); the split placed toward a final date the hours
 * (or a user's date) hold later, in the ladder and in every re-date; a count
 * gate at the depth ranks two levels below (the depth passed to
 * rankIndexForStage); roadmap-catalog's practiceRoleOf; coverage counts
 * frozen at intake (StageLadderOpts.counts, dateEffectOf's counts); every
 * stage's StartSnapshot carrying the reach model; a count gate's practice.
 *
 * Fix round 2 of revision 4 (contracts §16.10, the WRITE_MARGIN ruling's
 * option (b)): new cards that are only WRITE_MARGIN's spare (every Domain
 * holds its count) need no pace: with none, the plan is dated on the cards
 * held, in either mode, and says so; its floor counts the spare, in the date
 * check and at Start alike. dateEffectOf never reads a plan that isn't dated
 * as past the span.
 *
 * Confirm to unlock (contracts §19, lane R2): the code-built plan honours
 * the gate — stageLadderOf and starterLadder never place an excluded or
 * blocked kind (the verifier's finding #2: "No timed practice" placed Timed
 * practice), a stage keeps its role's practice, a stored AVOID holds without
 * a gate passed, fitPlan and refit never re-add one; a track plan places only
 * the safe kinds until the card is answered under its current words — every
 * BODY or CARE plan, whatever it says (no constraints included), and a CRAFT
 * plan whose words carry a cue (the safety-gaps round, decision 1) — then
 * the kinds the card listed and the user left unticked; CARE places its own
 * safe kinds meanwhile (planning the week, keeping a log: decision 2); a
 * stored per-kind FINE unlocks nothing; syncTrackStarter adds only what the
 * answer changed.
 *
 * Pure: no database, no clock, no model. scripts/_no-model.ts is imported
 * first, like every check that imports a roadmap module.
 *
 *   npx tsx scripts/roadmap-realism-check.ts
 */
import "./_no-model";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { addDays, daysBetween, weekStartKeyOf, weekdayOf, type DayKey } from "../src/lib/life-day";
import { WEEKDAY_SHORT } from "../src/lib/recurrence";
import * as RT from "../src/lib/roadmap-types";
import {
  BUILD_UP_RULE,
  CATALOG,
  PROGRESSION,
  activityAsksOn,
  answerActivityCard,
  catalogEntryOf,
  catalogLabelOf,
  constraintsStateOfIntake,
  cueGatedKindsOf,
  progressionViolationsOf,
  type CatalogKey,
  type CatalogTrack,
  type PracticeKind,
  type Progression,
} from "../src/lib/roadmap-catalog";
import type { Track } from "../src/lib/life-types";
import {
  addStagePracticesOf,
  applyRemedy,
  availableFor,
  blockedKindsOf,
  cardReach,
  coverageOf,
  dateCheckOf,
  dateEffectOf,
  depthTermsOf,
  feasibilityOf,
  fitPlan,
  floorDayOf,
  lineDomainDefaultOf,
  lowerDepthPlanOf,
  manualLadder,
  motivationTimelineOf,
  planProgressionOf,
  productionPlannedFromFluentOf,
  refit,
  refitForStart,
  remedyTargetDay,
  slotProgressionOf,
  splitWindows,
  stageLadderOf,
  startSnapshotOf,
  starterLadder,
  syncStagePractices,
  syncTrackStarter,
  thresholdFor,
  trackStagePlacesOf,
  trackStarterKindsOf,
  writingPlanOf,
  type StageLadderResult,
} from "../src/lib/roadmap-realism";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const json = (v: unknown) => JSON.stringify(v);
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);
const near = (name: string, got: number | null | undefined, want: number, tol = 1e-9) =>
  check(name, got != null && Math.abs(got - want) <= tol, `got ${got}, want ${want}`);

// ═══ Fixtures ════════════════════════════════════════════════════════════════

const MON: DayKey = weekStartKeyOf("2026-11-04");
const D = (n: number): DayKey => addDays(MON, n);
const CAL = { kind: "calibrating" as const, have: 1, need: 4 };

function tp(o: { p?: number | null; tracked?: number | null; adherence?: number | null; clearance?: number | null } = {}): RT.Throughput {
  return {
    finalDay: D(-2),
    trackedMinutes: o.tracked == null ? CAL : { kind: "measured", median: o.tracked, p25: o.tracked, weeks: 8 },
    geminiShare: null,
    playMinutes: CAL,
    trackedByTrack: {},
    trackedByCategory: {},
    completions: CAL,
    activeDays: CAL,
    adherence: o.adherence == null ? { kind: "calibrating", have: 0, need: 8 } : { kind: "measured", value: o.adherence, n: 20 },
    reviewsPerDay: CAL,
    passShare: o.p == null ? { kind: "calibrating", have: 12, need: 30 } : { kind: "measured", value: o.p, n: 120 },
    clearance: o.clearance == null ? { kind: "calibrating", have: 0, need: 1 } : { kind: "measured", value: o.clearance, n: 14 },
    newCards: { total: CAL, byField: {}, byDomain: {} },
  };
}

function input(o: Partial<RT.RealismInput> = {}): RT.RealismInput {
  return {
    today: MON,
    targetDay: D(70),
    scopes: [],
    throughput: tp({ p: 0.8 }),
    hoursPerWeek: 5,
    intensity: "STEADY",
    startPoint: "NEW",
    typicalHours: null,
    typicalHoursSource: null,
    m: 1,
    heldDays: [],
    areaInMaintenance: false,
    practicesAllowed: true,
    trackArea: false,
    ...o,
  };
}

function cardsAt(n: number, level: number, due: DayKey, domainId: string, extra: Partial<RT.CardState> = {}): RT.CardState[] {
  return Array.from({ length: n }, () => ({ level, dueDay: due, graceEndsDay: null, domainId, ...extra }));
}

function scopeOf(ids: string[], cards: RT.CardState[], rateSource: RT.RateSource, rate: number | null, fieldId = "f1"): RT.RealismScope {
  const sorted = [...ids].sort();
  return { key: sorted.join(","), domainIds: sorted, fieldId, cards, rateSource, rate };
}

function item(o: Partial<RT.ItemDraft> & Pick<RT.ItemDraft, "kind" | "label">): RT.ItemDraft {
  return {
    id: null,
    lineageId: `i-${o.kind}-${o.label.replace(/[^A-Za-z0-9]/g, "")}`,
    ord: 0,
    rawLabel: null,
    origin: "GEMINI",
    decision: "CHECKED",
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method: null,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: null,
    checkpointKind: null,
    outOf: null,
    bar: null,
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [],
    ...o,
  };
}
const dom = (id: string, name: string, ord = 0) => item({ kind: "DOMAIN", label: name, domainId: id, ord, lineageId: `dom-${id}` });
const practice = (name: string, method: RT.PracticeMethod, o: Partial<RT.ItemDraft> = {}) => item({ kind: "PRACTICE", label: name, method, ord: 10, ...o });

function ms(o: Partial<RT.MilestoneDraft> & Pick<RT.MilestoneDraft, "lineageId" | "ord">): RT.MilestoneDraft {
  return {
    id: null,
    version: 1,
    title: `Milestone ${o.ord}`,
    titleOrigin: "GEMINI",
    titleDecision: "KEPT",
    windowStart: MON,
    dueDay: D(70),
    status: "DRAFT",
    rankIndex: null,
    overAccepted: false,
    items: [],
    measures: [],
    notes: [],
    ...o,
  };
}

function cardMeasure(ids: string[], level: number, target: number, source: RT.TargetSource, baseline: number | null = null): RT.MeasureSpec {
  return {
    id: null,
    kind: "CARDS_AT_LEVEL",
    role: "PAYS",
    scope: { domainIds: [...ids].sort() },
    minLevel: level,
    target,
    targetSource: source,
    fittedTarget: source === "WORKED_OUT" ? target : null,
    rateSource: null,
    baseline,
    baselineDay: MON,
    unit: "card",
    itemLineageId: null,
    measureKey: RT.cardsAtLevelKey(ids, level),
  };
}

/** The worked example's library: Probability (d1) + Inference (d2); 12 cards at level 6+, 10 at level 4 that can reach 6 by day 70. */
function workedScope(rate = 3): RT.RealismScope {
  return scopeOf(["d1", "d2"], [...cardsAt(6, 6, D(30), "d1"), ...cardsAt(6, 7, D(40), "d2"), ...cardsAt(10, 4, D(50), "d1")], "SCOPE", rate);
}
const workedMilestone = () => ms({ lineageId: "m1", ord: 1, items: [dom("d1", "Probability", 0), dom("d2", "Inference", 1)] });
const cardM = (m: RT.MilestoneDraft) => m.measures.find((x) => x.kind === "CARDS_AT_LEVEL");

// ═══ Floors and effective states ═════════════════════════════════════════════

console.log("— floors and reach —");
{
  eq("floorBase at m = 1: 6/25/69/155/340", [4, 6, 8, 10, 12].map((l) => RT.floorBase(l)), [6, 25, 69, 155, 340]);
  eq("floorStrict at m = 1: 6/22/56/133/318", [4, 6, 8, 10, 12].map((l) => RT.floorStrict(l)), [6, 22, 56, 133, 318]);
  eq("floorBase at m = 1.5: 9/38/104/233/511", [4, 6, 8, 10, 12].map((l) => RT.floorBase(l, 1.5)), [9, 38, 104, 233, 511]);
  const l5 = scopeOf(["x"], cardsAt(1, 5, MON, "x"), "NONE", null);
  const inp = input({ throughput: tp({ p: 1 }) });
  check("an L5 card due today reaches L6 today", cardReach(l5, 6, MON, inp, null).existingBest === 1);
  check("… and L7 18 days later (not 17)", cardReach(l5, 7, D(18), inp, null).existingBest === 1 && cardReach(l5, 7, D(17), inp, null).existingBest === 0);
  check("… strict 14 (the jitter's lower bound)", cardReach(l5, 7, D(14), inp, null).existingStrict === 1 && cardReach(l5, 7, D(13), inp, null).existingStrict === 0);
  const past = scopeOf(["x"], cardsAt(1, 6, D(-20), "x", { graceEndsDay: D(-3) }), "NONE", null);
  const r = cardReach(past, 6, D(10), input({ throughput: tp({ p: 0.8 }) }), null);
  check("a card past its grace projects from level − 1: not counted at L6 now, needs one pass (expected 0.8)", r.existingBest === 1 && Math.abs(r.existingExpected - 0.8) < 1e-9, json(r));
  const within = scopeOf(["x"], cardsAt(1, 6, D(-2), "x", { graceEndsDay: D(3) }), "NONE", null);
  check("an overdue card within grace keeps its level (counts at L6)", cardReach(within, 6, D(1), input(), null).existingExpected === 1);
}

// ═══ The worked example ══════════════════════════════════════════════════════

console.log("— the worked example —");
{
  const sc = workedScope();
  const r = cardReach(sc, 6, D(70), input({ scopes: [sc] }), 3);
  check("lastCardDay = day 70 − 25 = day 45", r.lastCardDay === D(45));
  check("newBest = floor(3/7 × 46) = 19; best = 12 + 10 + 19 = 41", r.newBest === 19 && r.best === 41, json(r));
  near("existingExpected = 12 + 10 × 0.64 = 18.4", r.existingExpected, 18.4, 1e-6);
  check("newExpected = floor(19 × 0.8^5) = 6", r.newExpected === 6);
  near("expected = 24.4", r.expected, 24.4, 1e-6);

  const fitted = fitPlan([workedMilestone()], input({ scopes: [sc] }));
  const m = cardM(fitted[0])!;
  check("Steady: the fitted target is 12 + floor(0.7 × 12.4) = 20 at level 6", m.minLevel === 6 && m.target === 20 && m.targetSource === "WORKED_OUT" && m.baseline === 12, json(m));
  check("its measureKey is the scope at level 6", m.measureKey === "CARDS_AT_LEVEL|d:d1,d2|L6");
  const fe = feasibilityOf(fitted, input({ scopes: [sc] }));
  const k = fe.milestones[0].knowledge[0];
  check("a fitted target reads FITTED with its arithmetic", k.verdict === "FITTED" && k.fitted === 20 && k.expected === 24.4 && k.best === 41);
  check(
    "the basis line: '12 now, plus 70% of the ≈ 12 more … = 20. Best case 41'",
    k.basis[0].startsWith("Fitted at Steady: 12 now, plus 70% of the ≈ 12 more your reviews can be expected to bring to level 6 by") && k.basis[0].includes("= 20. Best case 41, if every review passes on its day."),
    k.basis[0]
  );
  check("p carries 'reads high'", k.basis.some((b) => b.includes("reads high")));

  const cal = input({ scopes: [sc], throughput: tp({ p: null }) });
  const rc = cardReach(sc, 6, D(70), cal, 3);
  check("p calibrating: expected = best = 41, labelled best case", rc.expected === 41 && rc.best === 41 && rc.bestCase);
  const fc = fitPlan([workedMilestone()], cal);
  check("p calibrating: the target is 12 + floor(0.7 × 29) = 32", cardM(fc[0])?.target === 32, json(cardM(fc[0])));
  const kc = feasibilityOf(fc, cal).milestones[0].knowledge[0];
  check("… and the basis says the pass rate is still calibrating", kc.bestCase && kc.basis[0].includes("Best case: your pass rate is still calibrating"), kc.basis[0]);
}

// ═══ IMPOSSIBLE and OVER ═════════════════════════════════════════════════════

console.log("— IMPOSSIBLE and OVER —");
const impossiblePlan = () => [ms({ lineageId: "imp", ord: 1, dueDay: D(40), items: [dom("d9", "Risk")], measures: [cardMeasure(["d9"], 8, 10, "YOURS", 0)] })];
const impossibleInput = () => input({ targetDay: D(40), scopes: [scopeOf(["d9"], [], "FIELD", 7)] });
{
  const fe = feasibilityOf(impossiblePlan(), impossibleInput());
  const k = fe.milestones[0].knowledge[0];
  check("level 8 in 40 days with no cards: IMPOSSIBLE (a new card needs at least 56 days)", k.verdict === "IMPOSSIBLE" && k.strictMax === 0 && fe.impossible, json(k));
  check(
    "the copy: 'The app can't show 10 cards at level 8 by … a new card needs at least 56 days … only 0 of your cards … Move the date or use a lower level.'",
    k.basis[0].startsWith("The app can't show 10 cards at level 8 by ") &&
      k.basis[0].includes("a new card needs at least 56 days to get there here, and only 0 of your cards can make it in time. Move the date or use a lower level."),
    k.basis[0]
  );
  check("its earliest day: day 78 (56 days to level 8, then 10 cards at 1 a day after day 69)", k.earliestDay === D(78), String(k.earliestDay));
  check("the earliest day is in the copy", k.basis.some((b) => b.startsWith("The earliest it fits is ")));
  check("IMPOSSIBLE is the milestone's worst", fe.milestones[0].worst === "IMPOSSIBLE");

  // Five L6 cards due on day 10: strictReach(8) = day 30, bestReach(8) = day 36; due day 33.
  const over = [ms({ lineageId: "ovr", ord: 1, dueDay: D(33), items: [dom("d8", "Sizing")], measures: [cardMeasure(["d8"], 8, 3, "YOURS", 0)] })];
  const overIn = input({ targetDay: D(33), scopes: [scopeOf(["d8"], cardsAt(5, 6, D(10), "d8"), "NONE", null)] });
  const ko = feasibilityOf(over, overIn).milestones[0].knowledge[0];
  check("an ambitious but possible typed target is OVER, not IMPOSSIBLE (best 0, strict 5, target 3)", ko.verdict === "OVER" && ko.best === 0 && ko.strictMax === 5, json(ko));
  const tight = [ms({ lineageId: "tgt", ord: 1, items: [dom("d1", "Probability"), dom("d2", "Inference", 1)], measures: [cardMeasure(["d1", "d2"], 6, 30, "YOURS", 12)] })];
  const sc = workedScope();
  const kt = feasibilityOf(tight, input({ scopes: [sc] })).milestones[0].knowledge[0];
  check("a typed 30 against expected 24.4 and best 41 is TIGHT", kt.verdict === "TIGHT", json(kt.verdict));
  const fits = [ms({ lineageId: "fit", ord: 1, items: [dom("d1", "Probability"), dom("d2", "Inference", 1)], measures: [cardMeasure(["d1", "d2"], 6, 24, "YOURS", 12)] })];
  check("a typed 24 is FITS", feasibilityOf(fits, input({ scopes: [sc] })).milestones[0].knowledge[0].verdict === "FITS");
}

console.log("— no fitted target ever gets a verdict —");
{
  const sc = workedScope();
  const verdicts: string[] = [];
  const times: string[] = [];
  for (const intensity of ["LIGHT", "STEADY", "PUSH"] as RT.Intensity[]) {
    const inp = input({ scopes: [sc], intensity });
    const fe = feasibilityOf(fitPlan([workedMilestone()], inp), inp);
    verdicts.push(fe.milestones[0].knowledge[0].verdict);
    times.push(`${fe.milestones[0].time.verdict}:${fe.milestones[0].time.ratio}`);
  }
  eq("Light, Steady and Push: FITTED each time", verdicts, ["FITTED", "FITTED", "FITTED"]);
  check("the time verdict does not move with intensity (it changes only through load)", new Set(times).size === 1, json(times));
}

// ═══ Capacity: the ramp, adherence, held days ════════════════════════════════

console.log("— capacity —");
const runPlan = (hours: { sessions: number; band: RT.PracticeBand }) => [
  ms({
    lineageId: "run",
    ord: 1,
    dueDay: D(69),
    items: [practice("Run", "WORKOUT", { planSource: "YOURS", sessionsPerWeek: hours.sessions, durationBand: hours.band, rule: `TARGET:${hours.sessions}/W`, origin: "USER" })],
  }),
];
{
  const plan = fitPlan(runPlan({ sessions: 4, band: "D60" }), input({ targetDay: D(69), trackArea: true }));
  const ramp = input({ targetDay: D(69), trackArea: true, hoursPerWeek: 15, throughput: tp({ p: null, tracked: 180 }) });
  const a = availableFor(D(7), ramp);
  check("ramp: declared 15 h with 3 h a week tracked caps available time at 2 h", a.minutes === 120 && a.rampBinds && a.class === "ESTIMATED", json(a));
  const t = feasibilityOf(plan, ramp).milestones[0].time;
  check("… and a 4 h plan is OVER", t.verdict === "OVER" && (t.ratio ?? 0) >= 2, json(t));
  check("… with the ramp line in its basis", t.basis.some((b) => b.startsWith("You've tracked ≈ 3 h a week of tasks (task estimates). Plans may add up to +50% (at least 2 h)")), json(t.basis));
  const fresh = input({ targetDay: D(69), trackArea: true, hoursPerWeek: 15, throughput: tp({ p: null }) });
  const tf = feasibilityOf(plan, fresh).milestones[0].time;
  check("the same plan with no tracked history reads 'Unverified · Fits'", tf.verdict === "FITS" && tf.unverified, json(tf));
  check("… available is the declared fallback, 15 h × 0.7, class YOURS", availableFor(D(7), fresh).minutes === 630 && availableFor(D(7), fresh).class === "YOURS");
  const adh = input({ hoursPerWeek: 10, throughput: tp({ adherence: 0.5, tracked: 2000 }) });
  check("measured adherence scales the declared hours: 10 h × 0.5", availableFor(D(7), adh).minutes === 300 && !availableFor(D(7), adh).unverified);
  check("adherence is clamped at the floor 0.3", availableFor(D(7), input({ hoursPerWeek: 10, throughput: tp({ adherence: 0.1, tracked: 2000 }) })).minutes === 180);
  const held = input({ heldDays: [D(7), D(8), D(9)] });
  check("held vacation days remove available time: 3 held → 4/7 of the week", Math.abs(availableFor(D(7), held).minutes - (210 * 4) / 7) < 1e-9);
  check("a fully held week has none", availableFor(D(14), input({ heldDays: [14, 15, 16, 17, 18, 19, 20].map(D) })).minutes === 0);
  const vac = input({ targetDay: D(69), trackArea: true, heldDays: [14, 15, 16, 17, 18, 19, 20].map(D) });
  const tv = feasibilityOf(fitPlan(runPlan({ sessions: 2, band: "D30" }), vac), vac).milestones[0];
  check("a held week plans no practice and has no time", tv.weeks.find((w) => w.weekStart === D(14))?.practiceMin === 0 && tv.weeks.find((w) => w.weekStart === D(14))?.availableMin === 0);
  check("… and the basis says 7 days are held", tv.time.basis.some((b) => b.startsWith("7 days held (rest, sick or vacation)")), json(tv.time.basis));
}

// ═══ Shared rates and combined load ══════════════════════════════════════════

console.log("— shared rates and per-week load —");
{
  const a = scopeOf(["a"], [], "FIELD", 6);
  const b = scopeOf(["b"], [], "FIELD", 6);
  const plan = [
    ms({ lineageId: "m1", ord: 1, dueDay: D(69), items: [dom("a", "Alpha")], measures: [cardMeasure(["a"], 6, 10, "WORKED_OUT", 0)] }),
    ms({ lineageId: "m2", ord: 2, windowStart: D(70), dueDay: D(139), items: [dom("b", "Beta")], measures: [cardMeasure(["b"], 8, 10, "WORKED_OUT", 0)] }),
  ];
  const inp = input({ targetDay: D(139), scopes: [a, b] });
  const wp = writingPlanOf(plan, inp);
  const byWeek = new Map<string, number>();
  for (const s of wp) for (const w of s.weeks) byWeek.set(w.weekStart, (byWeek.get(w.weekStart) ?? 0) + w.cards);
  check("two concurrent scopes on one Field's pace sum to at most its rate in every week", [...byWeek.values()].every((v) => v <= 6 + 1e-9), json([...byWeek]));
  const first = wp.map((s) => s.weeks[0].cards);
  check("… and split it equally while both write (3 + 3)", first.every((c) => Math.abs(c - 3) < 1e-9), json(first));
  const bLate = wp.find((s) => s.scopeKey === "b")!.weeks.filter((w) => w.weekStart > D(44));
  check("once the first stops writing (day 44), the second has the whole rate", bLate.length > 0 && bLate.every((w) => w.cards <= 6 + 1e-9) && bLate.some((w) => Math.abs(w.cards - 6) < 1e-9), json(bLate.slice(0, 2)));

  const own = scopeOf(["b"], [], "SCOPE", 4);
  const both = [plan[0], { ...plan[1] }];
  const inBoth = input({ targetDay: D(139), scopes: [a, own] });
  const w1 = feasibilityOf(both, inBoth).milestones[0].time.worstWeek!;
  const alone = feasibilityOf([plan[0]], input({ targetDay: D(69), scopes: [a] })).milestones[0].time.worstWeek!;
  check(
    "two overlapping milestones are judged on their combined week: milestone 1's week carries milestone 2's writing too (50 min vs 30)",
    Math.abs(w1.writeMin - 50) < 1e-6 && Math.abs(alone.writeMin - 30) < 1e-6,
    `${w1.writeMin} vs ${alone.writeMin}`
  );
}

// ═══ Allocation ══════════════════════════════════════════════════════════════

console.log("— allocation —");
{
  const sc = workedScope();
  const inp = input({ scopes: [sc] });
  const once = fitPlan([workedMilestone()], inp);
  const twice = fitPlan(once, inp);
  check("the allocation is deterministic and a re-fit changes nothing", json(once) === json(twice));
  const study = once[0].items.find((i) => i.notes.includes("STUDY_ADDED"));
  check(
    "a card milestone with no study practice gets 'Study Probability, Inference' (origin CODE, READING, WORKED_OUT sessions and band)",
    !!study && study.label === "Study Probability, Inference" && study.origin === "CODE" && study.method === "READING" && study.planSource === "WORKED_OUT" && !!study.rule && !!study.durationBand,
    json(study)
  );
  check("its name is CodeText: labelTextOf gives it, provenance WORKED_OUT", !!study && RT.labelTextOf(study.origin, study.decision, study.label) !== null && RT.provenanceOf(study.origin, study.decision) === "WORKED_OUT");
  check("it has its own PRACTICE_KEPT measure (effTarget = round(0.8 × planned))", once[0].measures.some((m) => m.kind === "PRACTICE_KEPT" && m.itemLineageId === study?.lineageId && m.target > 0));

  const three = ms({
    lineageId: "m3p",
    ord: 1,
    items: [dom("d1", "Probability"), dom("d2", "Inference", 1), practice("Build a model", "PROJECT_WORK", { lineageId: "p1" }), practice("Write notes", "WRITING", { lineageId: "p2" }), practice("Tutor", "COACHED_SESSION", { lineageId: "p3" })],
  });
  const f3 = fitPlan([three], inp)[0];
  check("the study practice is not added to a milestone that already has 3, and the note says so", !f3.items.some((i) => i.notes.includes("STUDY_ADDED")) && f3.notes.includes("NO_STUDY_SLOT"), json(f3.notes));
  const two = { ...three, items: three.items.slice(0, 4) };
  const f2 = fitPlan([two], inp)[0];
  check("with 2 practices it takes the 3rd slot", f2.items.filter((i) => i.kind === "PRACTICE").length === 3 && !f2.notes.includes("NO_STUDY_SLOT"));
  const withReading = { ...three, items: [three.items[0], three.items[1], practice("Read the notes", "READING", { lineageId: "r1" })] };
  check("a milestone that already reads gets no study practice", !fitPlan([withReading], inp)[0].items.some((i) => i.notes.includes("STUDY_ADDED")));
  check("practices off: no study practice", !fitPlan([workedMilestone()], input({ scopes: [sc], practicesAllowed: false }))[0].items.some((i) => i.kind === "PRACTICE"));

  const typed = ms({ lineageId: "typ", ord: 1, items: [practice("Backtest", "DELIBERATE_PRACTICE", { planSource: "YOURS", sessionsPerWeek: 3, durationBand: "D45", rule: "TARGET:3/W", lineageId: "bt" })] });
  const ft = fitPlan([typed], input({ trackArea: true }))[0].items[0];
  check("a practice the user set (YOURS) keeps its sessions, band and rule", ft.sessionsPerWeek === 3 && ft.durationBand === "D45" && ft.rule === "TARGET:3/W");

  const tiny = input({ trackArea: true, hoursPerWeek: 1 });
  const cut = fitPlan(
    [ms({ lineageId: "cut", ord: 1, items: [practice("Run", "WORKOUT", { lineageId: "x1" }), practice("Stretch", "WORKOUT", { lineageId: "x2" }), practice("Swim", "WORKOUT", { lineageId: "x3" })] })],
    tiny
  );
  check("a practice-only overload: each practice falls to 1 × D15", cut[0].items.every((i) => i.sessionsPerWeek === 1 && i.durationBand === "D15"), json(cut[0].items.map((i) => [i.sessionsPerWeek, i.durationBand])));
  const tc = feasibilityOf(cut, tiny).milestones[0].time;
  check("… and the verdict is OVER: 'cut a practice or raise hours'", tc.verdict === "OVER" && tc.basis.some((b) => b.includes("cut a practice or raise hours")), json(tc.basis));
  const big = input({ trackArea: true, hoursPerWeek: 10 });
  const one = fitPlan([ms({ lineageId: "one", ord: 1, items: [practice("Run", "WORKOUT", { lineageId: "x1" })] })], big)[0].items[0];
  check("a lone practice with room: its method's band (D45) and up to 7 sessions → DAILY", one.durationBand === "D45" && one.sessionsPerWeek === 7 && one.rule === "DAILY", json(one));
  const mid = fitPlan([ms({ lineageId: "mid", ord: 1, items: [practice("Draw", "PROJECT_WORK", { lineageId: "x1" })] })], input({ trackArea: true, hoursPerWeek: 2 }))[0].items[0];
  check("2 h × 0.7 × 0.8 = 67 min: one D60 session, TARGET:1/W", mid.durationBand === "D60" && mid.sessionsPerWeek === 1 && mid.rule === "TARGET:1/W", json(mid));
}

console.log("— fitting rules —");
{
  const sc = workedScope();
  const inp = input({ scopes: [sc] });
  const once = fitPlan([workedMilestone()], inp);
  const removed = once.map((m) => ({ ...m, items: m.items.map((i) => (i.notes.includes("STUDY_ADDED") ? { ...i, decision: "REMOVED" as const } : i)) }));
  const again = fitPlan(removed, inp)[0];
  check(
    "a study practice the user removed stays removed and is not added again",
    again.items.filter((i) => i.kind === "PRACTICE").length === 1 && again.items.find((i) => i.kind === "PRACTICE")?.decision === "REMOVED" && !again.measures.some((m) => m.kind === "PRACTICE_KEPT")
  );

  const empty = scopeOf(["e1"], [], "NONE", null);
  const small = fitPlan([ms({ lineageId: "sm", ord: 1, items: [dom("e1", "Empty")] })], input({ scopes: [empty] }))[0];
  check("a card measure too small at every level is dropped: CARDS_TOO_SMALL", !cardM(small) && small.notes.includes("CARDS_TOO_SMALL"), json(small.notes));
  check("… the study practice still measures it", small.measures.some((m) => m.kind === "PRACTICE_KEPT") && !small.notes.includes("NOT_MEASURABLE"));
  const bare = fitPlan([ms({ lineageId: "sm", ord: 1, items: [dom("e1", "Empty")] })], input({ scopes: [empty], practicesAllowed: false }))[0];
  check("… and with practices off nothing does: NOT_MEASURABLE", bare.notes.includes("NOT_MEASURABLE") && bare.measures.length === 0);

  // The same scope twice: milestone 1 holds a typed level 10; milestone 2's days alone would give level 8.
  const deep = scopeOf(["k"], cardsAt(20, 9, D(10), "k"), "NONE", null);
  const ladder = [
    ms({ lineageId: "r1", ord: 1, dueDay: D(60), items: [dom("k", "Kernels")], measures: [cardMeasure(["k"], 10, 5, "YOURS", 0)] }),
    ms({ lineageId: "r2", ord: 2, windowStart: D(61), dueDay: D(140), items: [dom("k", "Kernels")] }),
  ];
  const lf = fitPlan(ladder, input({ targetDay: D(140), scopes: [deep] }));
  check("the level never falls along the plan: milestone 2 is held at level 10, noted RAISED", cardM(lf[1])?.minLevel === 10 && lf[1].items[0].notes.includes("RAISED"), json([cardM(lf[1]), lf[1].items[0].notes]));
  check("… a typed target (YOURS) is kept as typed", cardM(lf[0])?.target === 5 && cardM(lf[0])?.targetSource === "YOURS" && cardM(lf[0])?.minLevel === 10);
  const flat = [
    ms({ lineageId: "t1", ord: 1, dueDay: D(60), items: [dom("k", "Kernels")], measures: [cardMeasure(["k"], 8, 15, "YOURS", 0)] }),
    ms({ lineageId: "t2", ord: 2, windowStart: D(61), dueDay: D(140), items: [dom("k", "Kernels")] }),
  ];
  const kscope = scopeOf(["k"], cardsAt(20, 7, D(10), "k"), "NONE", null);
  const ff = fitPlan(flat, input({ targetDay: D(140), scopes: [kscope] }));
  const k2 = feasibilityOf(ff, input({ targetDay: D(140), scopes: [kscope] })).milestones[1].knowledge[0];
  check("the target never falls on the same level: 11 is raised to milestone 1's 15, with the line saying so", cardM(ff[1])?.target === 15 && k2.verdict === "FITTED" && k2.basis.some((b) => b.startsWith("Kept at 15")), json([cardM(ff[1]), k2.basis]));
}

console.log("— carried milestones never block —");
{
  const behind = ms({ lineageId: "b1", ord: 1, status: "STARTED", dueDay: D(30), items: [dom("d9", "Risk")], measures: [cardMeasure(["d9"], 8, 40, "WORKED_OUT", 0)] });
  const next = ms({ lineageId: "b2", ord: 2, windowStart: D(31), dueDay: D(120), items: [practice("Journal", "WRITING", { lineageId: "j" })] });
  const inp = input({ targetDay: D(120), trackArea: false, scopes: [scopeOf(["d9"], [], "NONE", null)] });
  const fe = feasibilityOf(fitPlan([behind, next], inp), inp);
  check(
    "a STARTED milestone that has fallen behind reads IMPOSSIBLE but never blocks the re-plan of the rest",
    fe.milestones[0].worst === "IMPOSSIBLE" && !fe.impossible && fe.remedies.length === 0,
    json([fe.milestones.map((m) => m.worst), fe.impossible])
  );
}

// ═══ The aim check ═══════════════════════════════════════════════════════════

console.log("— the aim check —");
{
  const plan = fitPlan(runPlan({ sessions: 2, band: "D30" }), input({ targetDay: D(69), trackArea: true }));
  const none = feasibilityOf(plan, input({ targetDay: D(69), trackArea: true }));
  check("without typicalHours: 'Aim not checked'", none.aimCheck.kind === "unchecked" && none.basis.includes("Aim not checked: the app doesn't know how long this usually takes."));
  const withIt = input({ targetDay: D(69), trackArea: true, typicalHours: 150, typicalHoursSource: "SOA study note" });
  const ac = feasibilityOf(plan, withIt).aimCheck;
  // 5 h × 0.7 = 210 min a week over 70 open days = 2,100 min = 35 h.
  check("with it: your hours cover 35 of the 150 h (70 days × 210 min ÷ 7)", ac.kind === "checked" && ac.coverHours === 35 && !ac.coversAll && ac.source === "SOA study note", json(ac));
  check("the line names the source", feasibilityOf(plan, withIt).basis.includes("Your hours cover 35 of the 150 h you entered (source: SOA study note)."));
  const all = feasibilityOf(plan, { ...withIt, typicalHours: 20 }).aimCheck;
  check("cover all of it", all.kind === "checked" && all.coversAll && all.coverHours === 20);
}

// ═══ Windows ═════════════════════════════════════════════════════════════════

console.log("— windows —");
{
  const WED = D(2);
  check("fixture: WED is a Wednesday", weekdayOf(WED) === 3);
  eq("35 days from a Wednesday: one window of 35 days", splitWindows(WED, addDays(WED, 35)), [{ start: WED, end: addDays(WED, 35) }]);
  check("34 days is refused", splitWindows(WED, addDays(WED, 34)) === null);
  check("1,081 days is refused", splitWindows(WED, addDays(WED, 1081)) === null);
  const shape = (start: DayKey, span: number): string | null => {
    const w = splitWindows(start, addDays(start, span));
    if (!w) return `span ${span}: null`;
    if (w.length !== RT.milestoneCountFor(span)) return `span ${span}: ${w.length} windows, want ${RT.milestoneCountFor(span)}`;
    if (w[0].start !== start || w[w.length - 1].end !== addDays(start, span)) return `span ${span}: ends`;
    let prevEnd = start;
    for (let i = 0; i < w.length; i++) {
      const len = daysBetween(prevEnd, w[i].end);
      if (len < RT.MILESTONE_MIN_DAYS || len > RT.MILESTONE_MAX_DAYS) return `span ${span}: window ${i + 1} is ${len} days`;
      if (i > 0 && w[i].start !== addDays(w[i - 1].end, 1)) return `span ${span}: gap`;
      if (i < w.length - 1 && weekdayOf(w[i].end) !== 7) return `span ${span}: window ${i + 1} ends on a weekday`;
      prevEnd = w[i].end;
    }
    return null;
  };
  for (const span of [70, 200, 400, 1080]) {
    const w = splitWindows(WED, addDays(WED, span))!;
    check(`${span} days: ${RT.milestoneCountFor(span)} windows of 35–186 days, intermediate ends on Sundays`, shape(WED, span) === null, shape(WED, span) ?? json(w));
  }
  check("1,080 days: six windows", splitWindows(WED, addDays(WED, 1080))?.length === 6);
  let bad: string | null = null;
  for (let dow = 0; dow < 7 && !bad; dow++) for (let span = RT.SPAN_MIN_DAYS; span <= RT.SPAN_MAX_DAYS && !bad; span++) bad = shape(D(dow), span);
  check("every span from 35 to 1,080 days from every weekday splits by the rules", bad === null, bad ?? "");
  const first = splitWindows(WED, addDays(WED, 120))!;
  check("a first window from mid-week reaches its Sunday (35–41 days … here " + daysBetween(WED, first[0].end) + ")", weekdayOf(first[0].end) === 7 && daysBetween(WED, first[0].end) >= 35);
  const fewer = splitWindows(MON, D(400), 2);
  check("an explicit count re-splits over fewer milestones (2 windows over 400 days; only the 35-day minimum applies)", fewer?.length === 2 && fewer[1].end === D(400));
}

console.log("— thresholds —");
{
  eq("thresholdFor: 35 days NEW → 4; WORKING → 6", [thresholdFor(D(35), MON, "NEW", null), thresholdFor(D(35), MON, "WORKING", null)], [4, 6]);
  eq("thresholdFor: 70 → 6; 120 → 8; 260 → 10; 600 → 12", [70, 120, 260, 600].map((d) => thresholdFor(D(d), MON, "NEW", null)), [6, 8, 10, 12]);
  eq("thresholdFor never falls below the previous milestone's level", thresholdFor(D(70), MON, "NEW", 8), 8);
  eq("at m = 1.5: 70 days → L6 needs 38 ≤ 42, so 6", thresholdFor(D(70), MON, "NEW", null, 1.5), 6);
}

// ═══ Remedies ════════════════════════════════════════════════════════════════

console.log("— remedies —");
{
  const plan = impossiblePlan();
  const inp = impossibleInput();
  const fe = feasibilityOf(plan, inp);
  check("an IMPOSSIBLE plan offers 'move the date'", fe.remedies.includes("MOVE_DATE") && fe.milestones[0].remedies.includes("MOVE_DATE"), json(fe.remedies));
  const day = remedyTargetDay(plan, inp);
  check("the earliest Sunday that fits: day 83 (day 78 is a Tuesday)", day === D(83) && weekdayOf(D(83)) === 7, String(day));
  const moved = applyRemedy(plan, inp, "MOVE_DATE");
  const feM = feasibilityOf(moved, { ...inp, targetDay: day! });
  check("re-run after 'move the date': nothing IMPOSSIBLE, nothing OVER", !feM.impossible && !feM.over && moved[0].dueDay === day, json(feM.milestones.map((m) => m.worst)));

  const over = [ms({ lineageId: "ovr", ord: 1, dueDay: D(40), items: [dom("d8", "Sizing")], measures: [cardMeasure(["d8"], 8, 3, "YOURS", 0)] })];
  const overIn = input({ targetDay: D(40), scopes: [scopeOf(["d8"], cardsAt(5, 6, D(17), "d8"), "NONE", null)] });
  const fo = feasibilityOf(over, overIn);
  check("a typed target OVER offers 're-fit at Light'", fo.over && fo.remedies.includes("REFIT_LIGHT"), json(fo.remedies));
  const light = applyRemedy(over, overIn, "REFIT_LIGHT");
  const fl = feasibilityOf(light, { ...overIn, intensity: "LIGHT" });
  check("re-run after 're-fit at Light': no card target is OVER or IMPOSSIBLE", !fl.milestones.some((m) => m.knowledge.some((k) => k.verdict === "OVER" || k.verdict === "IMPOSSIBLE")), json(fl.milestones[0].knowledge));
  check("… every card target is code's again (WORKED_OUT), or dropped as too small", light[0].measures.every((m) => m.kind !== "CARDS_AT_LEVEL" || m.targetSource === "WORKED_OUT"));

  // Two milestones; the first holds a typed level-8 target it cannot reach in 69 days, but could over the whole span.
  const twoPlan = [
    ms({ lineageId: "a1", ord: 1, dueDay: D(69), items: [dom("d9", "Risk")], measures: [cardMeasure(["d9"], 8, 10, "YOURS", 0)] }),
    ms({ lineageId: "a2", ord: 2, windowStart: D(70), dueDay: D(139), items: [practice("Journal", "WRITING", { lineageId: "j1" })] }),
  ];
  const twoIn = input({ targetDay: D(139), scopes: [scopeOf(["d9"], [], "FIELD", 7)] });
  const ft = feasibilityOf(twoPlan, twoIn);
  check("a plan whose first milestone is too short offers 'move trailing milestones to Later'", ft.remedies.includes("MOVE_TO_LATER"), json(ft.remedies));
  const later = applyRemedy(twoPlan, twoIn, "MOVE_TO_LATER");
  const fLater = feasibilityOf(later, twoIn);
  check(
    "re-run after 'Later': milestone 2 is LATER (no dates, kept), milestone 1 runs to the aim's date, nothing IMPOSSIBLE or OVER",
    later[1].status === "LATER" && later[1].dueDay === null && later[1].lineageId === "a2" && later[0].dueDay === D(139) && !fLater.impossible && !fLater.over,
    json(later.map((m) => [m.status, m.windowStart, m.dueDay]))
  );
  const fine = feasibilityOf(fitPlan([workedMilestone()], input({ scopes: [workedScope()] })), input({ scopes: [workedScope()] }));
  check("a plan with nothing IMPOSSIBLE or OVER offers no remedy", fine.remedies.length === 0 && !fine.impossible && !fine.over);
}

// ═══ Refit ═══════════════════════════════════════════════════════════════════

console.log("— refit —");
{
  const sc = workedScope();
  const started = ms({
    lineageId: "s1",
    ord: 1,
    status: "STARTED",
    dueDay: D(69),
    items: [dom("d1", "Probability"), dom("d2", "Inference", 1)],
    measures: [cardMeasure(["d1", "d2"], 6, 20, "WORKED_OUT", 12)],
    rankIndex: 1,
  });
  const p2 = ms({ lineageId: "s2", ord: 2, status: "PLANNED", windowStart: D(70), dueDay: D(160), items: [dom("d1", "Probability"), dom("d2", "Inference", 1)] });
  const p3 = ms({ lineageId: "s3", ord: 3, status: "PLANNED", windowStart: D(161), dueDay: D(250), items: [dom("d1", "Probability"), dom("d2", "Inference", 1)] });
  const inp = input({ today: D(20), targetDay: D(250), scopes: [sc] });
  const out = refit([started, p2, p3], inp);
  check("refit never touches a STARTED row", json(out[0]) === json(started));
  check("refit keeps lineage ids and order", out.map((m) => m.lineageId).join() === "s1,s2,s3");
  check("the re-fitted rows start after the started milestone's due day and end on the aim's date", out[1].windowStart === D(70) && out[2].dueDay === D(250) && out[1].status === "DRAFT", json(out.map((m) => [m.windowStart, m.dueDay, m.status])));
  const lv = out.map((m) => cardM(m)?.minLevel ?? 0);
  check("levels never fall along the plan", lv[0] <= lv[1] && lv[1] <= lv[2], json(lv));

  const carried = [1, 2, 3].map((i) => ms({ lineageId: `c${i}`, ord: i, status: "STARTED", windowStart: D(-300 + i * 80), dueDay: D(-221 + i * 80), items: [practice(`P${i}`, "WRITING", { lineageId: `cp${i}` })] }));
  const unstarted = [4, 5, 6, 7, 8].map((i) => ms({ lineageId: `u${i}`, ord: i, status: "PLANNED", windowStart: D(i * 10), dueDay: D(i * 10 + 9), items: [practice(`P${i}`, "WRITING", { lineageId: `up${i}` })] }));
  const big = refit([...carried, ...unstarted], input({ today: D(20), targetDay: D(1000), trackArea: true }));
  const scheduled = big.filter((m) => m.status === "DRAFT").length;
  check("refit's n never exceeds 6 minus the carried milestones (3)", scheduled === 3 && big.filter((m) => m.status === "LATER").length === 2, json(big.map((m) => m.status)));
  check("the LATER rows keep their lineage and carry no dates or rank", big.filter((m) => m.status === "LATER").every((m) => m.windowStart === null && m.dueDay === null && m.rankIndex === null && m.lineageId.startsWith("u")));
  const late = ms({ lineageId: "z1", ord: 1, status: "STARTED", dueDay: D(100), items: [practice("P", "WRITING", { lineageId: "zp" })] });
  const rest = ms({ lineageId: "z2", ord: 2, status: "PLANNED", windowStart: D(101), dueDay: D(120), items: [practice("Q", "WRITING", { lineageId: "zq" })] });
  const noRoom = refit([late, rest], input({ today: D(20), targetDay: D(120), trackArea: true }));
  check("no room for a 35-day window after the started milestone: the rest go LATER (kept)", noRoom[1].status === "LATER" && noRoom[1].dueDay === null && noRoom[1].lineageId === "z2");
}

// ═══ Start ═══════════════════════════════════════════════════════════════════

console.log("— Start —");
{
  // 12 cards at level 6+, 6 at level 4 due day 50; 4 new cards a week; p 0.8; due day 70.
  const sc = scopeOf(["d1", "d2"], [...cardsAt(12, 6, D(30), "d1"), ...cardsAt(6, 4, D(50), "d2")], "SCOPE", 4);
  const accepted = fitPlan([workedMilestone()], input({ scopes: [sc] }));
  check("accepted on day 0: the fitted target is 20", cardM(accepted[0])?.target === 20, json(cardM(accepted[0])));
  const planned = { ...accepted[0], status: "PLANNED" as const };
  const at40 = input({ today: D(40), scopes: [sc] });
  const rs = refitForStart(planned, [planned], at40);
  check(
    "started on day 40 with no new cards: 'fitted today it would be 14'",
    rs.todayCheck?.stored === 20 && rs.todayCheck.fittedNow === 14 && rs.todayCheck.reason === "no new cards yet in these Domains",
    json(rs.todayCheck)
  );
  check("the stored target is not IMPOSSIBLE; the sheet keeps it unless the user takes 14", !rs.impossible && cardM(rs.milestone)?.target === 20);
  check("the window now starts at Start", rs.milestone.windowStart === D(40) && rs.feasibility.weeks[0].weekStart === weekStartKeyOf(D(40)));
  const rsNow = refitForStart(planned, [planned], input({ today: D(0), scopes: [sc] }));
  check("started the day it was accepted: no today's check", rsNow.todayCheck === null);

  // The per-week plan (milestone 1 from day 0, the worked example).
  const wsc = workedScope();
  const inp = input({ scopes: [wsc] });
  const fe = feasibilityOf(fitPlan([workedMilestone()], inp), inp).milestones[0];
  const sum = fe.weeks.reduce((s, w) => s + w.newPerWeek, 0);
  check("the per-week plan's new cards sum to newBest (19) over the writing window", sum === 19, json(fe.weeks.map((w) => w.newPerWeek)));
  check("… and are 0 after lastCardDay (day 45)", fe.weeks.filter((w) => w.weekStart > D(45)).every((w) => w.newPerWeek === 0));
  const vac = input({ scopes: [wsc], heldDays: [14, 15, 16, 17, 18, 19, 20].map(D) });
  const fv = feasibilityOf(fitPlan([workedMilestone()], vac), vac).milestones[0];
  check("… and pro-rated in a vacation week (0 that week; floor(3/7 × 39) = 16 in all)", fv.weeks.find((w) => w.weekStart === D(14))?.newPerWeek === 0 && fv.weeks.reduce((s, w) => s + w.newPerWeek, 0) === 16, json(fv.weeks.map((w) => w.newPerWeek)));

  // The StartSnapshot: R6's ADD fixture — T 18, 8 cards at level 6, 10 at level 4 (14.4 expected), due 55 days on, p 0.8.
  const qs = scopeOf(["rm"], [...cardsAt(8, 6, D(40), "rm"), ...cardsAt(10, 4, D(20), "rm")], "SCOPE", 6);
  const qm = ms({ lineageId: "q", ord: 1, status: "PLANNED", dueDay: D(55), items: [dom("rm", "Risk Management")], measures: [cardMeasure(["rm"], 6, 18, "WORKED_OUT", 8)] });
  const qin = input({ targetDay: D(55), scopes: [qs] });
  const qr = refitForStart(qm, [qm], qin);
  const snap = startSnapshotOf(qm, qr, qin, MON);
  check("StartSnapshot: kind START, p_start 0.8 stored, yield_start 0.8^5", snap.kind === "START" && snap.pStart === 0.8 && !snap.pCalibrating && Math.abs(snap.yieldStart - Math.pow(0.8, 5)) < 1e-12);
  check("newNeeded_start = ceil(3.6 ÷ 0.328) = 11; lastCardDay = day 30", snap.newNeededStart === 11 && snap.lastCardDay === D(30), json([snap.newNeededStart, snap.lastCardDay]));
  near("Ww_start = 31 ÷ 7", snap.wwStart, 31 / 7, 1e-12);
  near("needRate in a full writing week = 11 ÷ 4.43 = 2.48", snap.weeks[0].needRate, 11 / (31 / 7), 1e-9);
  near("needRate_w sums to newNeeded_start over the writing weeks", snap.weeks.reduce((s, w) => s + w.needRate, 0), 11, 1e-9);
  check("weeks after lastCardDay need none", snap.weeks.filter((w) => w.weekStart > D(30)).every((w) => w.needRate === 0 && w.fw === 0));
  check("the snapshot keeps the per-week plan's minutes", snap.weeks.every((w) => typeof w.reviewMin === "number" && typeof w.practiceMin === "number"));
  const calSnap = startSnapshotOf(qm, refitForStart(qm, [qm], { ...qin, throughput: tp({ p: null }) }), { ...qin, throughput: tp({ p: null }) }, MON);
  check("p calibrating at Start: p_start 1, yield 1 (best case), flagged", calSnap.pStart === 1 && calSnap.yieldStart === 1 && calSnap.pCalibrating && calSnap.newNeededStart === 0);
}

// ═══ The in-house starter (F7) ═══════════════════════════════════════════════

console.log("— the starter —");
{
  let n = 0;
  const makeId = () => `id${++n}`;
  const names: Record<string, RT.DomainName> = { d1: RT.domainName({ id: "d1", name: "Probability" }), d2: RT.domainName({ id: "d2", name: "Inference" }) };
  const lib = scopeOf(
    ["d1", "d2"],
    [...cardsAt(20, 6, D(30), "d1"), ...cardsAt(10, 7, D(60), "d2"), ...cardsAt(15, 4, D(12), "d1"), ...cardsAt(10, 5, D(40), "d2"), ...cardsAt(8, 2, D(3), "d1")],
    "FIELD",
    5
  );
  const intake = (o: Partial<RT.Intake> = {}): RT.Intake => ({
    aim: "Read statistics papers fluently",
    fieldId: "f1",
    track: "CRAFT",
    domainIds: ["d1", "d2"],
    targetDay: D(182),
    hoursPerWeek: 5,
    newCardsPerWeek: null,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "NEW",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: null,
    examLabel: null,
    ...o,
  });
  const sIn = input({ targetDay: D(182), scopes: [lib] });
  const fromNew = starterLadder(intake(), sIn, names, makeId);
  const summary = (plan: RT.MilestoneDraft[]) =>
    plan.map((m) => {
      const c = cardM(m);
      return { title: m.title, window: [m.windowStart, m.dueDay], level: c?.minLevel ?? null, target: c?.target ?? null, baseline: c?.baseline ?? null };
    });
  // By hand. Milestone 1 (level 6 by day 90): 30 at 6+; expected 30 + 15 × 0.64 + 10 × 0.8 + 8 × 0.8^4 = 50.88,
  // plus floor(floor(5/7 × 66) × 0.8^5) = floor(47 × 0.328) = 15 new → 65.88; 30 + floor(0.7 × 35.88) = 55.
  // Milestone 2 (level 8 by day 182): none at 8+; 10 × 0.8 + 20 × 0.64 + 10 × 0.512 + 15 × 0.41 + 8 × 0.262 = 34.16,
  // plus floor(81 × 0.8^7) = 16 new → 50.16; floor(0.7 × 50.16) = 35.
  const want = [
    { title: "Probability, Inference to level 6+", window: [MON, D(90)], level: 6, target: 55, baseline: 30 },
    { title: "Probability, Inference to level 8+", window: [D(91), D(182)], level: 8, target: 35, baseline: 0 },
  ];
  eq("starter golden, a 6-month span from NEW: two milestones, levels 6 then 8, fitted targets", summary(fromNew), want);
  const fromWorking = starterLadder(intake({ startPoint: "WORKING" }), { ...sIn, startPoint: "WORKING" }, names, makeId);
  eq("starter golden from WORKING (the same here: the span already sets level 6 first)", summary(fromWorking), want);
  const short = starterLadder(intake({ targetDay: D(40) }), input({ targetDay: D(40), scopes: [lib] }), names, makeId);
  const shortW = starterLadder(intake({ targetDay: D(40), startPoint: "WORKING" }), input({ targetDay: D(40), scopes: [lib], startPoint: "WORKING" }), names, makeId);
  check("40 days: NEW starts at level 4, WORKING at level 6", cardM(short[0])?.minLevel === 4 && cardM(shortW[0])?.minLevel === 6, json([summary(short), summary(shortW)]));

  const levels = fromNew.map((m) => cardM(m)?.minLevel ?? 0);
  check("thresholds never fall", levels.every((l, i) => i === 0 || l >= levels[i - 1]));
  check(
    "titles hold no target and no number other than the level",
    fromNew.every((m) => {
      const lv = String(cardM(m)?.minLevel);
      return (m.title.match(/\d+/g) ?? []).every((d) => d === lv) && !m.title.includes(String(cardM(m)?.target));
    })
  );
  check("titles are code's (origin CODE, WORKED_OUT)", fromNew.every((m) => m.titleOrigin === "CODE" && RT.provenanceOf(m.titleOrigin, m.titleDecision) === "WORKED_OUT"));
  const study = fromNew[0].items.find((i) => i.kind === "PRACTICE")!;
  check(
    "the starter's study practice is CodeText ('Study Probability, Inference', READING) and passes Start without a check",
    study.label === "Study Probability, Inference" && study.method === "READING" && RT.labelTextOf(study.origin, study.decision, study.label) !== null && RT.provenanceOf(study.origin, study.decision) === "WORKED_OUT" && !study.notes.includes("PLACEHOLDER"),
    json(study)
  );
  check("the chosen Domains are the user's (YOURS) and every item is decided", fromNew.every((m) => m.items.every((i) => i.decision !== "PENDING") && m.items.filter((i) => i.kind === "DOMAIN").every((i) => RT.provenanceOf(i.origin, i.decision) === "YOURS")));
  check("every milestone has paying measures (cards and the study practice)", fromNew.every((m) => m.measures.filter((x) => x.role === "PAYS").length === 2 && !m.notes.includes("NOT_MEASURABLE")));

  const syllabus = { lines: ["Sets", "Counting", "Conditional probability", "Bayes", "Random variables", "Expectation", "Variance", "Joint laws", "Limit theorems"], source: "Course outline" };
  const withSyl = starterLadder(intake({ syllabus }), sIn, names, makeId);
  const topics = withSyl.map((m) => m.items.filter((i) => i.kind === "TOPIC").map((i) => i.syllabusRef));
  eq("a 9-line syllabus splits in order: 5 then 4", topics, [[0, 1, 2, 3, 4], [5, 6, 7, 8]]);
  check("syllabus topics are the user's lines (origin SYLLABUS, YOURS)", withSyl.flatMap((m) => m.items.filter((i) => i.kind === "TOPIC")).every((i) => i.origin === "SYLLABUS" && RT.provenanceOf(i.origin, i.decision) === "YOURS" && i.label === syllabus.lines[i.syllabusRef!]));

  const body = starterLadder(intake({ fieldId: null, domainIds: [], track: "BODY", aim: "Run a sub-50 10K" }), input({ targetDay: D(182), trackArea: true }), {}, makeId);
  const ph = body[0].items[0];
  check("a track Area: one 'Practice for <aim>' placeholder per milestone, no card measure", body.every((m) => m.items.length === 1 && !cardM(m)) && ph.label === "Practice for Run a sub-50 10K" && ph.method === "WORKOUT", json(body[0].items));
  check("its placeholder does not pass Start: it carries PLACEHOLDER (Start asks to name it)", ph.notes.includes("PLACEHOLDER"));
  check("… its sessions are still worked out, and it pays through PRACTICE_KEPT", !!ph.rule && body[0].measures.some((m) => m.kind === "PRACTICE_KEPT"));
  const nothing = starterLadder(intake({ domainIds: [], practicesAllowed: false }), sIn, names, makeId);
  check("no Domain and no practice: NOT_MEASURABLE ('Pick at least one Domain, or add a practice')", nothing.length > 0 && nothing.every((m) => m.notes.includes("NOT_MEASURABLE")));
  const manual = manualLadder(intake(), sIn, makeId);
  check("'Write it myself': n empty milestones with the code windows", manual.length === 2 && manual.every((m) => m.items.length === 0 && m.title === "" && m.titleOrigin === "USER" && m.notes.includes("NOT_MEASURABLE")));
  check("starter lineage ids come from makeId", fromNew.every((m) => /^id\d+$/.test(m.lineageId)) && fromNew.every((m) => m.items.every((i) => /^id\d+$/.test(i.lineageId))));
}

// ═══ Fix round ═══════════════════════════════════════════════════════════════

console.log("— positions by lineage (fix round) —");
{
  // Every milestone is one position (roadmap-types positionCountOf): a dropped row and its "Start again" copy are one.
  const writing = (lineageId: string, ord: number, o: Partial<RT.MilestoneDraft> = {}) =>
    ms({ lineageId, ord, items: [practice(`P${ord}`, "WRITING", { lineageId: `${lineageId}-p` })], ...o });
  const past = (lineageId: string, ord: number, id: string) => writing(lineageId, ord, { id, status: "STARTED", windowStart: D(-300 + ord * 40), dueDay: D(-261 + ord * 40) });
  const later = (lineageId: string, ord: number) => writing(lineageId, ord, { status: "PLANNED", windowStart: D(ord * 10), dueDay: D(ord * 10 + 9) });
  const longIn = input({ today: D(20), targetDay: D(1000), trackArea: true });

  // m2 was dropped and started again (its copy STARTED too): 3 carried rows, 2 positions.
  const restarted = [past("c1", 1, "r1"), past("c2", 2, "r2"), past("c2", 2, "r2b"), ...[3, 4, 5, 6, 7].map((i) => later(`u${i}`, i))];
  check("fixture: the carried rows hold 2 positions in 3 rows", RT.positionCountOf(restarted.filter((m) => m.status === "STARTED")) === 2);
  const rf = refit(restarted, longIn);
  const sched = rf.filter((m) => m.status === "DRAFT");
  check(
    "refit's room is MAX_MILESTONES − carried positions: a dropped row and its started copy take one place, so 4 re-fitted (rows would allow 3)",
    sched.length === 4 && rf.filter((m) => m.status === "LATER").length === 1 && RT.positionCountOf([...rf.filter((m) => m.status === "STARTED"), ...sched]) === RT.MAX_MILESTONES,
    json(rf.map((m) => m.status))
  );

  // m5 was dropped and its copy is still PLANNED: the copy re-uses its original's place.
  const copyPlan = [past("c1", 1, "k1"), past("c2", 2, "k2"), past("c3", 3, "k3"), past("c4", 4, "k4"), past("c5", 5, "k5"), later("c5", 5), later("u6", 6), later("u7", 7)];
  const rc = refit(copyPlan, input({ today: D(20), targetDay: D(400), trackArea: true }));
  const rcSched = rc.filter((m) => m.status === "DRAFT");
  check(
    "a PLANNED 'Start again' copy re-uses its dropped original's place: the copy and one more fit beside 5 carried positions (6 in all)",
    rcSched.map((m) => m.lineageId).join() === "c5,u6" && rc.find((m) => m.lineageId === "u7")?.status === "LATER" && RT.positionCountOf([...rc.filter((m) => m.status === "STARTED"), ...rcSched]) === 6,
    json(rc.map((m) => [m.lineageId, m.status]))
  );
  check("… and the plan never exceeds MAX_MILESTONES positions", RT.positionCountOf(rc.filter((m) => m.status !== "LATER")) <= RT.MAX_MILESTONES);

  // Judged per row: a PLANNED copy is open although its lineage is carried.
  const dropped = ms({ id: "orig", lineageId: "L2", ord: 2, status: "STARTED", windowStart: D(0), dueDay: D(60), items: [dom("d9", "Risk")], measures: [cardMeasure(["d9"], 4, 1, "WORKED_OUT", 0)] });
  const copy = ms({ id: "copy", lineageId: "L2", ord: 2, status: "PLANNED", windowStart: D(0), dueDay: D(40), items: [dom("d9", "Risk")], measures: [cardMeasure(["d9"], 8, 10, "YOURS", 0)] });
  const cin = input({ targetDay: D(60), scopes: [scopeOf(["d9"], [], "FIELD", 7)] });
  const fe = feasibilityOf([dropped, copy], cin);
  const copyFe = fe.milestones.find((m) => m.lineageId === "L2" && m.knowledge[0]?.level === 8);
  check(
    "a PLANNED copy whose dropped original is carried is still judged: its IMPOSSIBLE target sets the plan's flag and gets the remedies",
    fe.impossible && !!copyFe && copyFe.worst === "IMPOSSIBLE" && copyFe.remedies.length > 0,
    json([fe.impossible, fe.milestones.map((m) => [m.lineageId, m.worst, m.remedies])])
  );
  check(
    "… and a lookup by lineage finds the copy's entry (the row being planned is listed before its carried original)",
    fe.milestones.find((m) => m.lineageId === "L2") === copyFe && fe.milestones.length === 2,
    json(fe.milestones.map((m) => [m.lineageId, m.knowledge[0]?.level]))
  );
  const onlyCarried = feasibilityOf([{ ...copy, status: "STARTED" as const, id: "copy" }], cin);
  check("… while the same row once started is reported, never blocking", onlyCarried.milestones[0].worst === "IMPOSSIBLE" && !onlyCarried.impossible);

  // One due day: the caller passes the goal's (milestoneDueDayOf) for a carried row, and the re-split follows it.
  const open1 = (due: DayKey) => writing("g1", 1, { id: "g1", status: "STARTED", windowStart: D(0), dueDay: due });
  const nextUp = later("g2", 2);
  const asPlanned = refit([open1(D(69)), nextUp], input({ today: D(20), targetDay: D(250), trackArea: true }));
  const rescheduled = refit([open1(RT.milestoneDueDayOf(D(69), D(90))!), nextUp], input({ today: D(20), targetDay: D(250), trackArea: true }));
  check(
    "a carried row's due day moved by a Reschedule (the goal's, through milestoneDueDayOf) moves the re-split: the next milestone starts after it",
    asPlanned[1].windowStart === D(70) && rescheduled[1].windowStart === D(91) && rescheduled[1].dueDay === D(250),
    json([asPlanned[1].windowStart, rescheduled[1].windowStart])
  );
}

console.log("— available(w) for the week quests (fix round) —");
{
  // 5 h × 0.7 = 210 min a full week. R6 passes today = weekStart and scales by |E| ÷ the week's non-held days.
  const aimMidWeek = input({ today: D(63), targetDay: D(66) });
  check("the aim's final week keeps the whole week's capacity (not cut at the aim's Thursday)", availableFor(D(63), aimMidWeek).minutes === 210, json(availableFor(D(63), aimMidWeek)));
  const pastAim = input({ today: D(77), targetDay: D(66) });
  check("a week a Reschedule moved past the aim's date still has capacity", availableFor(D(77), pastAim).minutes === 210, json(availableFor(D(77), pastAim)));
  const held = input({ today: D(63), targetDay: D(66), heldDays: [D(64), D(68)] });
  near("… and its held days still remove theirs: 2 held → 5/7", availableFor(D(63), held).minutes, (210 * 5) / 7);
  near("the current week from today (Thursday): 4 of 7 days", availableFor(D(0), input({ today: D(3) })).minutes, (210 * 4) / 7);
}

console.log("— step 8's notes reach each milestone (fix round) —");
{
  const sc = workedScope();
  const inp = input({ scopes: [sc], m: 1.5, areaInMaintenance: true });
  const fe = feasibilityOf(fitPlan([workedMilestone()], inp), inp);
  const mb = fe.milestones[0].basis;
  check("m ≠ 1: 'Review spacing is × 1.5 with your loadout.' is in the milestone's own basis (the page renders that list)", mb.includes("Review spacing is × 1.5 with your loadout."), json(mb));
  check("the Area in maintenance: its note too", mb.includes("This Field is in maintenance: it is excused from quotas and Boss."), json(mb));
  check("… and both stay in the plan's basis", fe.basis.includes("Review spacing is × 1.5 with your loadout.") && fe.basis.includes("This Field is in maintenance: it is excused from quotas and Boss."));
  const plain = feasibilityOf(fitPlan([workedMilestone()], input({ scopes: [sc] })), input({ scopes: [sc] })).milestones[0].basis;
  check("m = 1 and no maintenance: no such line", !plain.some((b) => b.startsWith("Review spacing") || b.startsWith("This Field is in maintenance")), json(plain));
  const track = input({ targetDay: D(69), trackArea: true, m: 1.5 });
  const tb = feasibilityOf(fitPlan(runPlan({ sessions: 2, band: "D30" }), track), track);
  check("a track Area (no cards): no review-spacing line", !tb.milestones[0].basis.some((b) => b.startsWith("Review spacing")) && !tb.basis.some((b) => b.startsWith("Review spacing")));
}

console.log("— a validated draft's skeletons (R3 handoff, fix round) —");
{
  // validateSample (and R4's syncMeasures) hand fitPlan CARDS_AT_LEVEL skeletons: minLevel null, target 0, no key.
  const skeleton = (ids: string[]): RT.MeasureSpec => ({ ...cardMeasure(["x"], 4, 0, "WORKED_OUT"), scope: { domainIds: ids }, minLevel: null, target: 0, fittedTarget: null, baseline: null, baselineDay: null, measureKey: null, id: "sk1" });
  const proposed = (name: string, ord: number) => item({ kind: "DOMAIN", label: name, domainId: null, proposedName: name, ord, origin: "GEMINI", decision: "PENDING", lineageId: `prop-${ord}` });
  const sc = workedScope();
  const allProposed = ms({ lineageId: "sk", ord: 1, items: [proposed("Market Microstructure", 0), proposed("Order Flow", 1)], measures: [skeleton([])] });
  let threw: unknown = null;
  let fp: RT.MilestoneDraft[] = [];
  try {
    fp = fitPlan([allProposed], input({ scopes: [sc] }));
  } catch (err) {
    threw = err;
  }
  check("every Domain still a proposal (empty scope): fitPlan doesn't throw", threw === null, String(threw));
  check(
    "… the skeleton is not kept as a card measure, no 'too small' note, no study practice (no Domain resolved yet), NOT_MEASURABLE",
    fp.length === 1 && !fp[0].measures.some((m) => m.kind === "CARDS_AT_LEVEL") && !fp[0].notes.includes("CARDS_TOO_SMALL") && !fp[0].items.some((i) => i.kind === "PRACTICE") && fp[0].notes.includes("NOT_MEASURABLE"),
    json([fp[0]?.measures, fp[0]?.notes])
  );
  const fpe = feasibilityOf(fp, input({ scopes: [sc] })).milestones[0];
  check("… and its checks run with no knowledge part", !!fpe && fpe.knowledge.length === 0, json(fpe));
  const half = ms({ lineageId: "sk2", ord: 1, items: [dom("d1", "Probability", 0), dom("d2", "Inference", 1), proposed("Order Flow", 2)], measures: [skeleton(["d1", "d2"])] });
  const fh = cardM(fitPlan([half], input({ scopes: [sc] }))[0]);
  check(
    "resolved Domains beside a proposal: the skeleton is fitted over the resolved ones only (the worked example's 20 at level 6)",
    fh?.minLevel === 6 && fh.target === 20 && json(fh.scope.domainIds) === json(["d1", "d2"]) && fh.measureKey === "CARDS_AT_LEVEL|d:d1,d2|L6",
    json(fh)
  );
  const w = splitWindows(MON, D(400), 3);
  check(
    "a reply with fewer milestones re-splits over its count (validateSample's resplit): 3 contiguous windows of ≥ 35 days ending on the aim's date",
    !!w && w.length === 3 && w[0].start === MON && w[2].end === D(400) && w.every((x, i) => i === 0 || x.start === addDays(w[i - 1].end, 1)) && w.every((x, i) => daysBetween(i === 0 ? x.start : w[i - 1].end, x.end) >= RT.MILESTONE_MIN_DAYS),
    json(w)
  );
  const tooMany = splitWindows(MON, D(100), 4);
  check("a count that can't fit 35-day windows falls back to fewer (4 asked over 100 days → 2, never null)", !!tooMany && tooMany.length === 2 && tooMany[1].end === D(100), json(tooMany));
}

console.log("— lineage and carried rows (fix round 2) —");
{
  const sc = workedScope();
  const inp = input({ scopes: [sc] });
  const both = [dom("d1", "Probability", 0), dom("d2", "Inference", 1)];
  const anyRaised = (m: RT.MilestoneDraft) => m.items.some((i) => i.notes.includes("RAISED"));

  // A "Start again" copy re-attempts its dropped original's place: the original's level and target never floor it.
  const original = ms({ id: "orig", lineageId: "m1", ord: 1, status: "STARTED", windowStart: D(-30), dueDay: D(70), items: both, measures: [cardMeasure(["d1", "d2"], 6, 30, "WORKED_OUT", 12)] });
  const copy: RT.MilestoneDraft = { ...workedMilestone(), id: "copy", status: "PLANNED" };
  const alone = fitPlan([copy], inp)[0];
  const besideOriginal = fitPlan([original, copy], inp)[1];
  const originalAfter = fitPlan([copy, original], inp)[0];
  check(
    "a 'Start again' copy is never held to its own original's floor: beside its carried original (level 6, 30) it fits what it fits alone (level 6, 20), not RAISED",
    cardM(alone)?.target === 20 && json(cardM(besideOriginal)) === json(cardM(alone)) && !anyRaised(besideOriginal),
    json([cardM(besideOriginal), besideOriginal.items.map((i) => i.notes)])
  );
  check("… whichever order the caller passes them in", json(cardM(originalAfter)) === json(cardM(alone)) && !anyRaised(originalAfter), json(cardM(originalAfter)));
  const copyKnowledge = feasibilityOf([original, besideOriginal], inp).milestones.find((m) => m.lineageId === "m1")!.knowledge[0];
  check("… and its basis claims no 'Kept at …, never fall along the plan'", copyKnowledge.verdict === "FITTED" && !copyKnowledge.basis.some((b) => b.startsWith("Kept at")), json(copyKnowledge.basis));
  const earlier = { ...original, id: "w0", lineageId: "w0", ord: 0 };
  const held = fitPlan([earlier, copy], inp)[1];
  check("a carried milestone of another lineage before it still holds it: RAISED to 30 at level 6", cardM(held)?.minLevel === 6 && cardM(held)?.target === 30 && anyRaised(held), json(cardM(held)));

  // R4's rewrite() fits a re-plan draft with its carried rows ([...carried, ...drafts]), then keeps the draft rows.
  const running = ms({ id: "s1", lineageId: "S1", ord: 1, status: "STARTED", windowStart: D(-30), dueDay: D(30), items: both, measures: [cardMeasure(["d1", "d2"], 6, 30, "WORKED_OUT", 12)] });
  const replanned = ms({ lineageId: "S2", ord: 2, version: 2, windowStart: D(31), dueDay: D(70), items: both });
  const withCarried = fitPlan([running, replanned], inp);
  const withoutCarried = fitPlan([replanned], inp);
  check(
    "a re-plan draft fitted with its carried rows keeps the floor they set (30 at level 6, RAISED); fitted alone it falls to 20",
    cardM(withCarried[1])?.target === 30 && anyRaised(withCarried[1]) && cardM(withoutCarried[0])?.target === 20,
    json([cardM(withCarried[1])?.target, cardM(withoutCarried[0])?.target])
  );
  check("… and the carried rows come back unchanged, in place, so the caller keeps only the draft rows", json(withCarried[0]) === json(running) && withCarried[1].lineageId === "S2");

  // A carried row's target was frozen at Start: judged against today's reach, never FITTED (a verdict is no longer true by construction).
  const startedAt = (target: number, source: RT.TargetSource = "WORKED_OUT") =>
    ms({ id: "st", lineageId: "st", ord: 1, status: "STARTED", windowStart: D(-30), dueDay: D(70), items: both, measures: [cardMeasure(["d1", "d2"], 6, target, source, 12)] });
  const kTight = feasibilityOf([startedAt(30)], inp).milestones[0].knowledge[0];
  check(
    "a started milestone's 30 at level 6, against expected 24.4 and best 41, reads TIGHT (never FITTED)",
    kTight.verdict === "TIGHT" && kTight.fitted === 30 && kTight.expected === 24.4 && kTight.best === 41,
    json(kTight)
  );
  check(
    "… in words that say it was fixed at Start, with no 'Fitted at …' arithmetic and no 'Kept at …' reason",
    kTight.basis[0] === "Target 30, fixed when this milestone started: reachable only if every review passes on its day. Expected ≈ 24; best case 41." &&
      !kTight.basis.some((b) => b.startsWith("Fitted at") || b.startsWith("Kept at")),
    json(kTight.basis)
  );
  check("… 20 reads FITS", feasibilityOf([startedAt(20)], inp).milestones[0].knowledge[0].verdict === "FITS");
  const kTyped = feasibilityOf([startedAt(30, "YOURS")], inp).milestones[0].knowledge[0];
  check("… a typed one keeps 'Your target' (and fitted null)", kTyped.verdict === "TIGHT" && kTyped.fitted === null && kTyped.basis[0].startsWith("Your target 30: "), json(kTyped.basis[0]));
  const plannedKnowledge = feasibilityOf([{ ...startedAt(30), status: "PLANNED" }], inp).milestones[0].knowledge[0];
  check("… while the same code target on a row not yet started reads FITTED", plannedKnowledge.verdict === "FITTED", plannedKnowledge.verdict);
  // Five L6 cards due on day 10: best 0, strict 5 by day 33 (the OVER fixture above), now on a started row.
  const overStarted = ms({ id: "os", lineageId: "os", ord: 1, status: "STARTED", windowStart: D(-20), dueDay: D(33), items: [dom("d8", "Sizing")], measures: [cardMeasure(["d8"], 8, 3, "WORKED_OUT", 0)] });
  const feOver = feasibilityOf([overStarted], input({ targetDay: D(33), scopes: [scopeOf(["d8"], cardsAt(5, 6, D(10), "d8"), "NONE", null)] }));
  check(
    "a started target beyond the best case reads OVER, and still never blocks (no flag, no remedy)",
    feOver.milestones[0].knowledge[0].verdict === "OVER" && feOver.milestones[0].worst === "OVER" && !feOver.over && !feOver.impossible && feOver.remedies.length === 0,
    json([feOver.milestones[0].knowledge[0].verdict, feOver.over, feOver.remedies])
  );

  // REFIT_LIGHT's promise is about the targets it can change: a started milestone's frozen target never withholds it.
  const frozen = ms({ id: "fz", lineageId: "fz", ord: 0, status: "STARTED", windowStart: D(-30), dueDay: D(30), items: [dom("d9", "Risk")], measures: [cardMeasure(["d9"], 8, 10, "WORKED_OUT", 0)] });
  const typedOver = ms({ lineageId: "ovr", ord: 1, dueDay: D(40), items: [dom("d8", "Sizing")], measures: [cardMeasure(["d8"], 8, 3, "YOURS", 0)] });
  const remIn = input({ targetDay: D(40), scopes: [scopeOf(["d8"], cardsAt(5, 6, D(17), "d8"), "NONE", null), scopeOf(["d9"], [], "NONE", null)] });
  const fr = feasibilityOf([frozen, typedOver], remIn);
  check(
    "a started milestone's frozen IMPOSSIBLE target never withholds 're-fit at Light' from an open typed target that is OVER",
    fr.over && !fr.impossible && fr.milestones.find((m) => m.lineageId === "fz")?.worst === "IMPOSSIBLE" && fr.remedies.includes("REFIT_LIGHT") && !!fr.milestones.find((m) => m.lineageId === "ovr")?.remedies.includes("REFIT_LIGHT"),
    json([fr.remedies, fr.milestones.map((m) => [m.lineageId, m.worst, m.remedies])])
  );

  // refitForStart judges the milestone being started as accepted, whatever its row's status (a claim-first Start finishes on a STARTING row).
  const sc4 = scopeOf(["d1", "d2"], [...cardsAt(12, 6, D(30), "d1"), ...cardsAt(6, 4, D(50), "d2")], "SCOPE", 4);
  const planned: RT.MilestoneDraft = { ...fitPlan([workedMilestone()], input({ scopes: [sc4] }))[0], status: "PLANNED" };
  const at40 = input({ today: D(40), scopes: [sc4] });
  const sheet = refitForStart(planned, [planned], at40);
  const finish = refitForStart({ ...planned, status: "STARTING" }, [planned], at40);
  check(
    "refitForStart on the STARTING row reads exactly what the Start sheet read on the PLANNED one (FITTED)",
    sheet.feasibility.knowledge[0].verdict === "FITTED" && json(finish.feasibility) === json(sheet.feasibility) && json(finish.todayCheck) === json(sheet.todayCheck),
    json([sheet.feasibility.knowledge[0].verdict, finish.feasibility.knowledge[0].verdict])
  );

  // "Kept at …, never fall along the plan" only when the fit held the target up (RAISED); a target worked out on an earlier day says so.
  const startBasis = sheet.feasibility.knowledge[0].basis;
  check(
    "the Start sheet's re-check on day 40: the stored 20 reads 'Worked out at 20 on an earlier day; with today's figures it would be 14' (todayCheck's 14), never 'Kept at'",
    sheet.todayCheck?.fittedNow === 14 && startBasis.includes("Worked out at 20 on an earlier day; with today's figures it would be 14.") && !startBasis.some((b) => b.startsWith("Kept at")),
    json(startBasis)
  );
  const fittedDay0 = fitPlan([workedMilestone()], inp);
  const laterBasis = feasibilityOf(fittedDay0, input({ today: D(5), scopes: [sc] })).milestones[0].knowledge[0].basis;
  check(
    "a draft reviewed 5 days after its fit (20): 'with today's figures it would be 19', no false 'Kept at 20'",
    laterBasis.includes("Worked out at 20 on an earlier day; with today's figures it would be 19.") && !laterBasis.some((b) => b.startsWith("Kept at")),
    json(laterBasis)
  );
  const sameDayBasis = feasibilityOf(fittedDay0, inp).milestones[0].knowledge[0].basis;
  check("… while on the day it was fitted neither line appears", !sameDayBasis.some((b) => b.startsWith("Kept at") || b.startsWith("Worked out at")), json(sameDayBasis));

  // The engine follows the carried rows it is given (R4 passes only the live ones; a MilestoneDraft has no goal or createdAt).
  const writing = (lineageId: string, ord: number, o: Partial<RT.MilestoneDraft> = {}) =>
    ms({ lineageId, ord, items: [practice(`P${ord}`, "WRITING", { lineageId: `${lineageId}-p` })], ...o });
  const dropped = writing("X", 2, { id: "x-orig", status: "STARTED", windowStart: D(0), dueDay: D(100) });
  const restart = writing("X", 2, { id: "x-copy", status: "PLANNED", windowStart: D(20), dueDay: D(120) });
  const after = writing("Y", 3, { status: "PLANNED", windowStart: D(121), dueDay: D(250) });
  const li = input({ today: D(20), targetDay: D(250), trackArea: true });
  const leftOut = refit([restart, after], li);
  check(
    "a dropped original the caller leaves out no longer holds back its copy: the copy re-splits from today (day 20)",
    leftOut[0].lineageId === "X" && leftOut[0].status === "DRAFT" && leftOut[0].windowStart === D(20) && leftOut[1].dueDay === D(250),
    json(leftOut.map((m) => [m.lineageId, m.windowStart, m.dueDay]))
  );
  const passedIn = refit([dropped, restart, after], li);
  check(
    "… passed in, its due day (day 100) is the re-split's base like any carried row's, so the copy would wait until day 101: R4 must leave it out",
    passedIn[1].lineageId === "X" && passedIn[1].windowStart === D(101),
    json(passedIn.map((m) => [m.lineageId, m.status, m.windowStart]))
  );
  const past = (lineageId: string, ord: number) => writing(lineageId, ord, { id: lineageId, status: "STARTED", windowStart: D(-300 + ord * 40), dueDay: D(-261 + ord * 40) });
  const planned6 = (lineageId: string, ord: number) => writing(lineageId, ord, { status: "PLANNED", windowStart: D(ord * 60), dueDay: D(ord * 60 + 59) });
  const sixIn = input({ today: D(20), targetDay: D(400), trackArea: true });
  const six = refit([past("m1", 1), past("m2", 2), planned6("m3", 3), planned6("m4", 4), planned6("m5", 5), planned6("m6", 6)], sixIn);
  const sixDraft = six.filter((m) => m.status === "DRAFT");
  check(
    "drop milestone 3, Start again, then Re-fit (the dropped original left out): 2 carried + the copy + 3 more hold 6 positions, none to Later, the copy first from today",
    sixDraft.length === 4 && !six.some((m) => m.status === "LATER") && RT.positionCountOf(six) === 6 && sixDraft[0].lineageId === "m3" && sixDraft[0].windowStart === D(20),
    json(six.map((m) => [m.lineageId, m.status, m.windowStart]))
  );
  const sixWithOriginal = refit([past("m1", 1), past("m2", 2), writing("m3", 3, { id: "m3-orig", status: "STARTED", windowStart: D(0), dueDay: D(10) }), planned6("m3", 3), planned6("m4", 4), planned6("m5", 5), planned6("m6", 6)], sixIn);
  check(
    "… and with the original passed in, still 6 positions (a dropped row and its copy take one place)",
    sixWithOriginal.filter((m) => m.status === "DRAFT").length === 4 && RT.positionCountOf(sixWithOriginal.filter((m) => m.status !== "LATER")) === 6,
    json(sixWithOriginal.map((m) => [m.lineageId, m.status]))
  );
}

// ═══ Revision 4: depth plans (roadmap-rev4.md F-R4-8 to F-R4-13, F-R4-21) ═══
//
// Fixtures: lane 0's §14.5 (contracts) — the spec's pack (Probability 42 cards on its D-line, n 34; Inference 9 at level 2, n 25,
// p 0.8, 3 a week) and the new learner (two new Domains of 25, a source of 6 a week, p 0.85) — at c = 1 with no held day.
// Fix round (contracts §15.2): WRITE_MARGIN is 1.3, so new_d is ceil(1.3 × n_d) − live_d: Inference 24, Probability 3, a new
// 25-card Domain 33. Every figure below is that model's; the 1.1 figures stay pinned in roadmap-contract-check as the reason.

const T4: DayKey = "2026-10-05"; // a Monday
const at4 = (k: number): DayKey => addDays(T4, k);
/**
 * An intake whose activity card the user answered under its current words
 * (contracts §19: roadmap-catalog answerActivityCard, as R4 stores it): the
 * kinds ticked to avoid, or "Nothing to avoid" when none. `key` overrides the
 * answer's key (an answer given under other words).
 */
function answeredIntake(intake: RT.Intake, avoid: readonly string[] = [], key?: string): RT.Intake {
  const state = constraintsStateOfIntake(intake);
  const res = answerActivityCard(intake.activities ?? null, state, { key: state.key, avoid: [...avoid] as CatalogKey[], nothingToAvoid: avoid.length === 0 }, T4);
  if (!res.ok) throw new Error(`fixture answer: ${res.error}`);
  return { ...intake, activities: key ? { ...res.value, key } : res.value };
}
const dd4 = (x: DayKey | null | undefined): number | null => (x ? daysBetween(T4, x) : null);
const P = (p: number, o: Partial<RT.ReachParams> = {}): RT.ReachParams => ({ p, pLong: Math.min(p, RT.P_LONG_CAP), c: 1, rho: 0, m: 1, strikeLimit: 2, graceExtra: 0, ...o });
function tp4(o: { adherence?: number | null; p?: number | null; c?: number | null } = {}): RT.Throughput {
  const cal = { kind: "calibrating" as const, have: 1, need: 4 };
  return {
    finalDay: at4(-2),
    trackedMinutes: cal,
    geminiShare: null,
    playMinutes: cal,
    trackedByTrack: {},
    trackedByCategory: {},
    completions: cal,
    activeDays: cal,
    adherence: o.adherence === null ? { kind: "calibrating", have: 0, need: 8 } : { kind: "measured", value: o.adherence ?? 1, n: 20 },
    reviewsPerDay: cal,
    passShare: o.p === null ? { kind: "calibrating", have: 3, need: 30 } : { kind: "measured", value: o.p ?? 0.85, n: 120 },
    clearance: o.c === null ? { kind: "calibrating", have: 0, need: 1 } : { kind: "measured", value: o.c ?? 1, n: 14 },
    newCards: { total: cal, byField: {}, byDomain: {} },
  };
}
const card4 = (n: number, level: number, dueIn: (i: number) => number, domainId: string, extra: Partial<RT.CardState> = {}): RT.CardState[] =>
  Array.from({ length: n }, (_, i) => ({ level, dueDay: at4(dueIn(i)), graceEndsDay: null, domainId, ...extra }));
const scope4 = (ids: string[], cards: RT.CardState[], rate: number | null = 6, rateSource: RT.RateSource = "FIELD"): RT.RealismScope => ({
  key: [...ids].sort().join(","),
  domainIds: [...ids].sort(),
  fieldId: "f1",
  cards,
  rateSource: rate == null ? "NONE" : rateSource,
  rate,
});
function in4(o: Partial<RT.RealismInput>, scopes: RT.RealismScope[]): RT.RealismInput {
  return {
    today: T4,
    targetDay: at4(365),
    scopes,
    throughput: tp4(),
    hoursPerWeek: 10,
    intensity: "STEADY",
    startPoint: "NEW",
    typicalHours: null,
    typicalHoursSource: null,
    m: 1,
    heldDays: [],
    areaInMaintenance: false,
    practicesAllowed: true,
    trackArea: false,
    depth: 12,
    dateMode: "REALISTIC",
    reach: P(0.85),
    calibrating: [],
    sourceRate: 6,
    ...o,
  };
}
function ik4(o: Partial<RT.Intake>): RT.Intake {
  return {
    aim: "Pass the probability exam",
    fieldId: "f1",
    track: "CRAFT",
    domainIds: ["a", "b"],
    targetDay: at4(365),
    hoursPerWeek: 10,
    newCardsPerWeek: null,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "NEW",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: null,
    examLabel: null,
    depth: 12,
    dateMode: "REALISTIC",
    ...o,
  };
}
let idSeq = 0;
const mk4 = () => `r4-${++idSeq}`;
const names4 = { prob: "Probability", inf: "Inference", a: "Alpha", b: "Beta", c: "Gamma", d: "Delta", e: "Epsilon", f: "Zeta" } as unknown as Record<string, RT.DomainName>;
type Ok = Extract<StageLadderResult, { ok: true }>;
function ladder4(label: string, r: StageLadderResult): Ok {
  if (!r.ok) throw new Error(`${label}: refused ${r.reason}: ${r.error}`);
  return r;
}
const MONTHS4 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sun 7 Nov 2027", as the date check writes a day. */
const dowText4 = (d: DayKey): string => `${WEEKDAY_SHORT[weekdayOf(d) - 1]} ${Number(d.slice(8, 10))} ${MONTHS4[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const shape = (plan: readonly RT.MilestoneDraft[]): string[] => plan.map((m) => `${m.stage}@${dd4(m.dueDay)}`);
const cardMeasures = (m: RT.MilestoneDraft) => m.measures.filter((x) => x.kind === "CARDS_AT_LEVEL");
const finalOf = (plan: readonly RT.MilestoneDraft[]) => plan.filter((m) => m.status !== "DISCARDED")[plan.filter((m) => m.status !== "DISCARDED").length - 1];
const stageDaysOf = (r: Ok) => Object.fromEntries(Object.entries(r.stageDays).map(([k, v]) => [k, dd4(v)]));
/** The input that judges a built ladder (its final due as the target, the same mode). */
const judgeIn = (base: RT.RealismInput, plan: readonly RT.MilestoneDraft[]): RT.RealismInput => ({ ...base, targetDay: finalOf(plan).dueDay! });

// The spec's pack (lane 0's fixture): rate 3 a week = 50% (Light) of a source of 6.
const probCards = [
  ...card4(2, 12, (i) => 40 + i, "prob"),
  ...card4(6, 8, (i) => 5 + 5 * i, "prob"),
  ...card4(5, 7, (i) => 3 + 4 * i, "prob"),
  ...card4(5, 6, (i) => 2 + 3 * i, "prob"),
  ...card4(8, 5, (i) => 1 + i, "prob"),
  ...card4(8, 4, (i) => i, "prob"),
  ...card4(8, 3, (i) => i % 4, "prob"),
];
const infCards = card4(9, 2, () => 0, "inf");
const packScope = scope4(["prob", "inf"], [...probCards, ...infCards]);
const packIn = in4({ intensity: "LIGHT", reach: P(0.8) }, [packScope]);
const packIk = ik4({ domainIds: ["prob", "inf"], intensity: "LIGHT" });
const learnerScope = scope4(["a", "b"], []);
const learnerIn = (o: Partial<RT.RealismInput> = {}) => in4(o, [learnerScope]);

console.log("— rev 4: coverage and the depth terms (F-R4-9) —");
{
  const cov = coverageOf({
    domains: [
      { id: "prob", name: "Probability", live: 42, nonRecall: 0 },
      { id: "inf", name: "Inference", live: 9, nonRecall: 0 },
      { id: "mc", name: "Mixed", live: 32, nonRecall: 10 },
      { id: "new", name: "New", live: 0, nonRecall: 0 },
    ],
    lineDomains: [],
    typed: null,
  });
  eq("n_d: Probability 42 → 34, Inference 9 → 25 (the floor), 42 cards with 10 multiple choice → 26, a new Domain → 25", cov.map((c) => c.n), [34, 25, 26, 25]);
  check("each row shows all three terms and where n came from (Probability: floor 25, 80% of 42 = 34, outline 0)", cov[0].floor === 25 && cov[0].share === 34 && cov[0].outline === 0 && cov[0].policy === 34 && cov[0].typed === null && !cov[0].belowPolicy, json(cov[0]));
  const twelve = coverageOf({ domains: [{ id: "a", name: "A", live: 0, nonRecall: 0 }, { id: "b", name: "B", live: 0, nonRecall: 0 }], lineDomains: Array(12).fill("a"), typed: null });
  eq("12 outline lines tied to one Domain give 36 (and the other Domain its floor)", [twelve[0].n, twelve[0].linesTied, twelve[1].n], [36, 12, 25]);
  const six = coverageOf({ domains: [{ id: "a", name: "A", live: 0, nonRecall: 0 }, { id: "b", name: "B", live: 0, nonRecall: 0 }], lineDomains: [null, null, null, null, "zz", null], typed: null });
  eq("6 lines tied to no Domain in R (one to a Domain outside it) add 3 lines' worth (9 cards) to each Domain's outline term", six.map((c) => [c.linesShared, c.outline]), [[3, 9], [3, 9]]);
  const typed = coverageOf({ domains: [{ id: "p", name: "P", live: 42, nonRecall: 0 }, { id: "q", name: "Q", live: 42, nonRecall: 0 }], lineDomains: [], typed: { p: 40, q: 5 } });
  eq("a typed 40 stays 40 (YOURS); a typed 5 under the policy's 34 is a coverage choice (belowPolicy)", typed.map((c) => [c.n, c.typed, c.policy, c.belowPolicy]), [[40, 40, 34, false], [5, 5, 34, true]]);
  const bad = coverageOf({ domains: [{ id: "p", name: "P", live: 42, nonRecall: 0 }], lineDomains: [], typed: { p: 0, __proto__: 7 } as unknown as Record<string, number> });
  check("a typed figure outside COVER_MIN..COVER_MAX is ignored (the policy stands)", bad[0].n === 34 && bad[0].typed === null);
  const chosen = [
    { id: "prob", name: "Probability" },
    { id: "inf", name: "Inference" },
  ];
  eq(
    "lineDomainDefaultOf: 'Conditional probability and Bayes' → Probability; a line naming both chosen Domains, or neither, → null; stems match ('Inferences')",
    [lineDomainDefaultOf("Conditional probability and Bayes", chosen), lineDomainDefaultOf("Probability for inference", chosen), lineDomainDefaultOf("Calculus refresher", chosen), lineDomainDefaultOf("Bayesian inferences", chosen)],
    ["prob", null, null, "inf"]
  );
  check("a Domain named only with stop words ('Basics') matches nothing", lineDomainDefaultOf("Basics of everything", [{ id: "x", name: "Basics" }]) === null);
  const terms = depthTermsOf(12, typed, { p: 2 }, T4);
  eq(
    "depthTermsOf: one term per Domain, CARDS_AT_LEVEL|d:<id>|L12|rc, target n_d, DEPTH or YOURS, baselines as given",
    terms.map((t) => [t.measureKey, t.target, t.targetSource, t.baseline, t.baselineDay]),
    [
      ["CARDS_AT_LEVEL|d:p|L12|rc", 40, "YOURS", 2, T4],
      ["CARDS_AT_LEVEL|d:q|L12|rc", 5, "YOURS", 0, T4],
    ]
  );
  check("depthTermsOf with the policy's figures reads DEPTH", depthTermsOf(10, cov.slice(0, 1), {}, T4)[0].targetSource === "DEPTH" && depthTermsOf(10, cov.slice(0, 1), {}, T4)[0].measureKey === "CARDS_AT_LEVEL|d:prob|L10|rc");

  const pack = ladder4("pack", stageLadderOf(packIk, packIn, names4, mk4));
  eq("the pack's coverage: Probability 34, Inference 25", pack.coverage?.map((c) => [c.domainId, c.n]), [["prob", 34], ["inf", 25]]);
  // Coverage frozen at intake (contracts §15.3, lens 2): a ladder R4 rebuilds after the first draft (a re-plan's redraft) is
  // given the intake's counts (opts.counts, roadmap-types frozenCoverageCountsOf); n_d reads them, the writing need today's cards.
  const frozenProb: RT.CoverageCounts[] = [{ id: "prob", live: 42, nonRecall: 0 }];
  const grown = in4({ intensity: "LIGHT", reach: P(0.8) }, [scope4(["prob", "inf"], [...probCards, ...card4(18, 1, () => 0, "prob"), ...infCards])]);
  const shrunk = in4({ intensity: "LIGHT", reach: P(0.8) }, [scope4(["prob", "inf"], [...probCards.slice(0, 22), ...infCards])]);
  const viaToday = ladder4("written 18, today's counts", stageLadderOf(packIk, grown, names4, mk4));
  const afterWrite = ladder4("written 18, frozen", stageLadderOf(packIk, grown, names4, mk4, { counts: frozenProb }));
  const afterArchive = ladder4("archived 20, frozen", stageLadderOf(packIk, shrunk, names4, mk4, { counts: frozenProb }));
  const finalCounts = (r: Ok) => cardMeasures(finalOf(r.plan)).map((x) => [x.scope.domainIds![0], x.target]);
  const writesOf = (r: Ok, base: RT.RealismInput, key: string) => (writingPlanOf(r.plan, judgeIn(base, r.plan)).find((w) => w.scopeKey === key)?.weeks ?? []).reduce((s, w) => s + w.cards, 0);
  check(
    "n_d frozen at intake: 18 Probability cards written since (60 live) leave n at 34 with the intake's counts (48 from today's), the final stage asks 34 = the end state's term, and the need reads today's cards (writeNeedOf(34, 60) = 0)",
    json(viaToday.coverage?.map((c) => [c.domainId, c.n])) === json([["prob", 48], ["inf", 25]]) &&
      json(afterWrite.coverage?.map((c) => [c.domainId, c.n, c.live])) === json([["prob", 34, 42], ["inf", 25, 9]]) &&
      json(finalCounts(afterWrite)) === json([["prob", 34], ["inf", 25]]) &&
      json(afterWrite.endState?.map((t) => t.target)) === json([34, 25]) &&
      writesOf(afterWrite, grown, "prob") === 0,
    json([viaToday.coverage?.map((c) => c.n), afterWrite.coverage?.map((c) => [c.n, c.live]), finalCounts(afterWrite), writesOf(afterWrite, grown, "prob")])
  );
  check(
    "… 20 Probability cards archived (22 live) leave n at 34, and the plan writes the 23 the library now lacks (writeNeedOf(34, 22)); Inference, with no frozen entry (new to R), reads today's",
    json(finalCounts(afterArchive)) === json([["prob", 34], ["inf", 25]]) && writesOf(afterArchive, shrunk, "prob") === RT.writeNeedOf(34, 22) && RT.writeNeedOf(34, 22) === 23 && afterArchive.coverage?.[1].live === 9,
    json([finalCounts(afterArchive), writesOf(afterArchive, shrunk, "prob")])
  );
  const malformed = ladder4("malformed frozen entry", stageLadderOf(packIk, grown, names4, mk4, { counts: [{ id: "prob", live: Number.NaN, nonRecall: 0 }] }));
  const effectFrozen = dateEffectOf(packIk, grown, ["c"], frozenProb);
  const effectToday = dateEffectOf(packIk, grown, ["c"]);
  check(
    "a malformed frozen entry reads today's counts (48); dateEffectOf with the frozen counts dates an addition against n 34, not 48 (an earlier or equal date)",
    malformed.coverage?.[0].n === 48 && effectFrozen.length === 2 && !!effectFrozen[0].dateWith && !!effectToday[0].dateWith && effectFrozen[0].dateWith! <= effectToday[0].dateWith!,
    json([malformed.coverage?.[0].n, effectFrozen.map((e) => dd4(e.dateWith)), effectToday.map((e) => dd4(e.dateWith))])
  );
  const writes = writingPlanOf(pack.plan, judgeIn(packIn, pack.plan));
  const total = (key: string) => (writes.find((w) => w.scopeKey === key)?.weeks ?? []).reduce((s, w) => s + w.cards, 0);
  eq(
    "new_d at WRITE_MARGIN 1.3 (contracts §15.2): the pack writes 24 new cards in Inference (ceil(1.3 × 25) − 9) and 3 in Probability (ceil(1.3 × 34) − 42)",
    [total("inf"), total("prob"), RT.WRITE_MARGIN],
    [24, 3, 1.3]
  );
  const fin = finalOf(pack.plan);
  eq(
    "the final milestone's PAYS card measures are exactly the depth terms, with the rc segment",
    cardMeasures(fin).map((x) => [x.measureKey, x.target, x.role]),
    pack.endState?.map((t) => [t.measureKey, t.target, "PAYS"])
  );
  const tiers = (["LIGHT", "STEADY", "PUSH"] as const).map((intensity) => ladder4(intensity, stageLadderOf(ik4({ intensity }), learnerIn({ intensity }), names4, mk4)));
  check("LIGHT, STEADY and PUSH give byte-identical endState", json(tiers[0].endState) === json(tiers[1].endState) && json(tiers[1].endState) === json(tiers[2].endState));
  const lines = { lines: Array.from({ length: 12 }, (_, i) => `Alpha topic ${i + 1}`), source: null };
  const withLines = ladder4("lines starter", stageLadderOf(ik4({ syllabus: lines }), learnerIn(), names4, mk4));
  const skeleton = ladder4("lines skeleton", stageLadderOf(ik4({ syllabus: lines }), learnerIn(), names4, mk4, { items: "NONE" }));
  eq(
    "12 outline lines tied to Alpha give it 36 on the starter and on a skeleton a Gemini run fills alike (a line's Domain is the user's, never the reply's)",
    [cardMeasures(finalOf(withLines.plan)).map((x) => x.target), cardMeasures(finalOf(skeleton.plan)).map((x) => x.target)],
    [[36, 25], [36, 25]]
  );
  const ladderIn = judgeIn(learnerIn(), tiers[1].plan);
  const before = json(tiers[1].plan.map(cardMeasures).map((ms) => ms.map((x) => [x.measureKey, x.target])));
  const after = (["USE_REALISTIC_DATE", "LOWER_DEPTH", "REFIT_LIGHT", "MOVE_TO_LATER", "MOVE_DATE"] as RT.Remedy[]).map((r) =>
    json(applyRemedy(tiers[1].plan, ladderIn, r).map(cardMeasures).map((ms) => ms.map((x) => [x.measureKey, x.target])))
  );
  check("no remedy changes a depth term (or any stage's count or level)", after.every((a) => a === before));
  // g is the minimum over Domains: 40 Probability cards at level 12 and none in Inference is not held.
  // At WRITE_MARGIN 1.3 Probability still writes writeNeedOf(32, 40) = 2 (COVER_SHARE × WRITE_MARGIN = 1.04 > 1), so Inference
  // writes 33 of the 35 new cards: a plan of Inference alone is compared at that share of the source rate.
  const half = scope4(["prob", "inf"], card4(40, 13, () => 100, "prob"));
  const g = ladder4("min over Domains", stageLadderOf(ik4({ domainIds: ["prob", "inf"] }), in4({}, [half]), names4, mk4));
  const infOnly = ladder4("Inference only", stageLadderOf(ik4({ domainIds: ["inf"] }), in4({ sourceRate: (6 * 33) / 35 }, [half]), names4, mk4));
  check(
    "g is the minimum over Domains: 40 Probability cards at level 12+ and none in Inference hold nothing (no held stage, no refusal); every stage waits for Inference, as a plan of Inference alone does at its share of the writing (33 of 35: Probability's 40 still need 2)",
    !g.plan.some((m) => m.notes.includes("HELD_AT_START")) &&
      json(stageDaysOf(g)) === json(stageDaysOf(infOnly)) &&
      json(g.coverage?.map((c) => [c.n, RT.writeNeedOf(c.n, c.live)])) === json([[32, 2], [25, 33]]),
    json([stageDaysOf(g), stageDaysOf(infOnly), g.coverage?.map((c) => [c.n, c.live])])
  );
}

console.log("— rev 4: the stage ladder (F-R4-10) —");
{
  const pack = ladder4("pack", stageLadderOf(packIk, packIn, names4, mk4));
  const steady = ladder4("learner Steady", stageLadderOf(ik4({}), learnerIn(), names4, mk4));
  const push = ladder4("learner Push", stageLadderOf(ik4({ intensity: "PUSH" }), learnerIn({ intensity: "PUSH" }), names4, mk4));
  console.log(`  pack ${json(stageDaysOf(pack))} · learner Steady ${json(stageDaysOf(steady))} · Push ${json(stageDaysOf(push))}`);
  eq(
    "the worked examples' stage days under the final model at WRITE_MARGIN 1.3 (contracts §15.2's table): the pack 68 114 205 282 430 (L4's 48 merged)",
    stageDaysOf(pack),
    { 6: 68, 8: 114, 10: 205, 11: 282, 12: 430 }
  );
  eq(
    "… the new learner at Steady 108 153 242 321 460 (about 15 months, question 9), at Push 89 135 224 302 446",
    [stageDaysOf(steady), stageDaysOf(push)],
    [
      { 6: 108, 8: 153, 10: 242, 11: 321, 12: 460 },
      { 6: 89, 8: 135, 10: 224, 11: 302, 12: 446 },
    ]
  );
  check("the writing reduces to the reference plan (roadmap-types referenceWriteDaysOf): pack 3 a week, learner 4.2 and 5.4", pack.rate === 3 && steady.rate === 4.2 && push.rate === 5.4, json([pack.rate, steady.rate, push.rate]));
  eq(
    "their milestones after the Sunday snap: the pack Familiar 69 (Foundation merged), Retained 118, Fluent 209, Toward Mastered 286, Mastered 433",
    shape(pack.plan),
    ["FAMILIAR@69", "RETAINED@118", "FLUENT@209", "BETWEEN@286", "MASTERED@433"]
  );
  eq(
    "… the learner: Familiar, part 1 on 55, Familiar 111, Retained 153, Fluent 244, Toward Mastered 321, Mastered 461; Push: part 1 on 48, then 90 139 230 307 447",
    [shape(steady.plan), shape(push.plan)],
    [
      ["PART@55", "FAMILIAR@111", "RETAINED@153", "FLUENT@244", "BETWEEN@321", "MASTERED@461"],
      ["PART@48", "FAMILIAR@90", "RETAINED@139", "FLUENT@230", "BETWEEN@307", "MASTERED@447"],
    ]
  );
  eq(
    "titles are code's templates: 'Familiar, part 1: Alpha, Beta to level 6+', 'Toward Mastered: Alpha, Beta to level 11+', 'Mastered: Alpha, Beta to level 12+'",
    [steady.plan[0].title, steady.plan[4].title, steady.plan[5].title, steady.plan[0].titleOrigin, steady.plan[5].titleDecision],
    ["Familiar, part 1: Alpha, Beta to level 6+", "Toward Mastered: Alpha, Beta to level 11+", "Mastered: Alpha, Beta to level 12+", "CODE", "KEPT"]
  );
  const part = steady.plan[0];
  check(
    "the count gate: the learner's 108-day first window gets PART, targets under 25 and ≥ 3 per Domain, key segment r, worked out (never DEPTH)",
    part.stage === "PART" && cardMeasures(part).every((x) => x.target >= 3 && x.target < 25 && x.measureKey!.endsWith("|L6|r") && x.targetSource === "WORKED_OUT"),
    json(cardMeasures(part))
  );
  check("PART never changes a gate stage's count: every gate and BETWEEN stage asks n_d (25), the final with rc", steady.plan.slice(1).every((m) => cardMeasures(m).every((x) => x.target === 25)) && cardMeasures(steady.plan[5]).every((x) => x.measureKey!.endsWith("|rc")));
  check("the pack's 63-day first window gets no count gate", pack.plan.every((m) => m.stage !== "PART"));
  check(
    "the split: the pack's 224-day Fluent → Mastered window gets one BETWEEN at level 11, on its own stage day (the reach sets the final date)",
    pack.plan.filter((m) => m.stage === "BETWEEN").length === 1 && cardMeasures(pack.plan[3]).every((x) => x.minLevel === 11) && dd4(pack.plan[3].dueDay) === 286 && daysBetween(pack.plan[2].dueDay!, pack.plan[4].dueDay!) === 224
  );
  // A first gate under 35 days merges into the next: 30 cards at level 3 due now hold the counts at L4 within days and L6 in about 3 weeks.
  const early = ladder4("early gates", stageLadderOf(ik4({ domainIds: ["a"] }), in4({}, [scope4(["a"], card4(30, 3, (i) => i % 3, "a"))]), names4, mk4));
  check("the merge rule: a first gate due within 35 days (Foundation, and Familiar at about day 21) merges into the next", early.plan[0].stage === "RETAINED" && !early.plan.some((m) => m.stage === "FOUNDATION" || m.stage === "FAMILIAR"), json(shape(early.plan)));
  // The count gate's halves after the Sunday snap: a 76-day first window (a library holding Fluent, the user's date 76 days out).
  // A pace of 3 a week: at WRITE_MARGIN 1.3 the 30 cards still ask writeNeedOf(25, 30) = 3 new ones. With no pace those 3 are
  // the spare alone (30 ≥ n 25), so a CHOSEN plan is dated on the cards held (contracts §16.10 option (b)); a library short of
  // its count (20 cards) with no pace is "Not dated" (no count gate at all).
  const fluentHeld = (today: DayKey, n = 30) => scope4(["a"], Array.from({ length: n }, () => ({ level: 11, dueDay: addDays(today, 3), graceEndsDay: null, domainId: "a" })), 3);
  const halvesIn = (today: DayKey) => in4({ today, dateMode: "CHOSEN", userDate: addDays(today, 76), targetDay: addDays(today, 76), sourceRate: 3 }, [fluentHeld(today)]);
  const halves = (today: DayKey) =>
    ladder4(`76-day window from ${today}`, stageLadderOf(ik4({ domainIds: ["a"], dateMode: "CHOSEN", targetDay: addDays(today, 76) }), halvesIn(today), names4, mk4));
  const noPaceOf = (n: number) =>
    stageLadderOf(
      ik4({ domainIds: ["a"], dateMode: "CHOSEN", targetDay: at4(76) }),
      in4({ dateMode: "CHOSEN", userDate: at4(76), targetDay: at4(76), sourceRate: null }, [scope4(["a"], fluentHeld(T4, n).cards, null)]),
      names4,
      mk4
    );
  const noPace = noPaceOf(30);
  const noPaceShort = noPaceOf(20);
  check(
    "a library holding Fluent (30 cards, n 25) with no pace: its writeNeedOf(25, 30) = 3 new cards are the spare alone, so a CHOSEN plan is dated on the cards held (no 'Not dated', no new card counted)",
    RT.writeNeedOf(25, 30) === 3 &&
      noPace.ok &&
      noPace.rate === null &&
      json(shape(noPace.plan)) === json(["FOUNDATION@0", "FAMILIAR@0", "RETAINED@0", "FLUENT@0", "PART@41", "MASTERED@76"]) &&
      noPace.dateCheck!.basis[0].startsWith("With only the cards you hold") &&
      !noPace.dateCheck!.basis.some((b) => b.startsWith("Not dated")),
    json(noPace.ok ? [shape(noPace.plan), noPace.dateCheck!.basis] : noPace)
  );
  check(
    "… a library short of its count (20 cards, n 25) with no pace still reads 'Not dated' and places no count gate",
    noPaceShort.ok && !noPaceShort.plan.some((m) => m.stage === "PART") && noPaceShort.dateCheck!.basis[0].startsWith("Not dated: no writing pace yet"),
    json(noPaceShort.ok ? shape(noPaceShort.plan) : noPaceShort)
  );
  const fromFriday = halves(at4(4));
  const fromMonday = halves(T4);
  check(
    "a 76-day first window from a Friday: the count gate would fall on the Sunday of day 44, leaving 32 days (< 35): none",
    !fromFriday.plan.some((m) => m.stage === "PART") && fromFriday.plan.filter((m) => m.notes.includes("HELD_AT_START")).length === 4,
    json(fromFriday.plan.map((m) => `${m.stage}@${daysBetween(at4(4), m.dueDay!)}`))
  );
  check("… from a Monday it falls on day 41, leaving 35: placed", fromMonday.plan.some((m) => m.stage === "PART" && dd4(m.dueDay) === 41), json(shape(fromMonday.plan)));
  // A count gate toward the depth's own gate (contracts §15.4): its target is at most n − 1 on `r` (retry entries count), so it
  // gives the rank of the gate two levels below (Expert under Mastered), never the depth's; motivationTimelineOf passes the depth.
  const partAtDepth = fromMonday.plan.find((m) => m.stage === "PART");
  const monMt = motivationTimelineOf(fromMonday.plan, judgeIn(halvesIn(T4), fromMonday.plan));
  check(
    "a library holding Fluent (depth 12): the count gate at level 12 (24 of 25 on r) gives Expert on day 41 and Mastered Virtuoso on day 76 — two ranks on the timeline, never Virtuoso before the depth is held",
    !!partAtDepth &&
      cardMeasures(partAtDepth).every((x) => x.minLevel === 12 && x.target === 24 && x.measureKey!.endsWith("|L12|r")) &&
      RT.rankIndexForStage("PART", 12, 12) === RT.STAGE_RANK.FLUENT &&
      json(monMt.rankDays) === json([41, 76]),
    json([shape(fromMonday.plan), monMt.rankDays])
  );
  // At a Fluent depth: a library holding Retained (30 cards at level 9), the user's date 110 days out.
  const retIn = in4({ depth: 10, dateMode: "CHOSEN", userDate: at4(110), targetDay: at4(110), sourceRate: 3 }, [scope4(["a"], card4(30, 9, (i) => 3 + (i % 5), "a"), 3)]);
  const atFluent = ladder4("Fluent depth, Retained held", stageLadderOf(ik4({ domainIds: ["a"], depth: 10, dateMode: "CHOSEN", targetDay: at4(110) }), retIn, names4, mk4));
  const fluentMt = motivationTimelineOf(atFluent.plan, judgeIn(retIn, atFluent.plan));
  check(
    "… at a Fluent depth (a library holding Retained) the count gate at level 10 gives Specialist, then Fluent Expert: ranks on days 55 and 110 (without the depth it would give Expert at once)",
    json(shape(atFluent.plan)) === json(["FOUNDATION@0", "FAMILIAR@0", "RETAINED@0", "PART@55", "FLUENT@110"]) &&
      json(fluentMt.rankDays) === json([55, 110]) &&
      RT.rankIndexForStage("PART", 10, 10) === RT.STAGE_RANK.RETAINED &&
      RT.rankIndexForStage("PART", 10) === RT.STAGE_RANK.FLUENT,
    json([shape(atFluent.plan), fluentMt.rankDays])
  );
  // A long first window: six new Domains share 4.2 new cards a week (168 to write, about 40 weeks).
  const sixIds = ["a", "b", "c", "d", "e", "f"];
  const six = ladder4("six Domains", stageLadderOf(ik4({ domainIds: sixIds }), in4({}, [scope4(sixIds, [])]), names4, mk4));
  check(
    "a long first window keeps LONG_WINDOW after its count gate (part 1 by day 76, then Familiar's window over 186 days)",
    six.plan[0].stage === "PART" && dd4(six.plan[0].dueDay)! <= RT.FIRST_RANK_MAX_DAYS + 6 && six.plan[1].notes.includes("LONG_WINDOW") && daysBetween(six.plan[0].dueDay!, six.plan[1].dueDay!) > RT.MILESTONE_MAX_DAYS,
    json(shape(six.plan))
  );
  eq("{domains} past three names reads 'A, B and four more' (no digit)", six.plan[1].title, "Familiar: Alpha, Beta and four more to level 6+");
  const counts = sixIds.map((_, k) => stageLadderOf(ik4({ domainIds: sixIds.slice(0, k + 1) }), in4({}, [scope4(sixIds.slice(0, k + 1), [])]), names4, mk4));
  check("≤ 6 milestones for every plan of 1 to 6 Domains", counts.every((r) => r.ok && r.plan.length <= RT.MAX_MILESTONES), json(counts.map((r) => (r.ok ? r.plan.length : r.reason))));
  // A STRONG library already holding Retained's coverage.
  const strong = scope4(["a", "b"], [...card4(30, 8, (i) => 10 + 2 * i, "a"), ...card4(30, 8, (i) => 11 + 2 * i, "b")]);
  const held = ladder4("strong", stageLadderOf(ik4({ startPoint: "STRONG" }), in4({}, [strong]), names4, mk4));
  eq(
    "a STRONG library holding level 8: Foundation, Familiar and Retained are 'Held when you began' (due today, no items, no measures), and the plan schedules from Fluent on",
    held.plan.map((m) => [m.stage, dd4(m.dueDay), m.notes.includes("HELD_AT_START"), m.items.length + m.measures.length > 0]),
    [
      ["FOUNDATION", 0, true, false],
      ["FAMILIAR", 0, true, false],
      ["RETAINED", 0, true, false],
      ["FLUENT", 118, false, true],
      ["BETWEEN", 195, false, true],
      // 349 at WRITE_MARGIN 1.3 (412 at 1.1): the 30 cards per Domain now write writeNeedOf(25, 30) = 3 more each, a spare that reaches the depth sooner.
      ["MASTERED", 349, false, true],
    ]
  );
  eq("… its slots go to the next kept stage: Foundation, Familiar and Retained's items to Fluent", [held.slotTo?.FOUNDATION, held.slotTo?.RETAINED, held.slotTo?.FLUENT].map((x) => x === held.plan[3].lineageId), [true, true, true]);
  const holds = stageLadderOf(ik4({}), in4({}, [scope4(["a", "b"], [...card4(30, 13, () => 50, "a"), ...card4(30, 13, () => 50, "b")])]), names4, mk4);
  check("a library already holding the depth is refused (HELD) with its copy", !holds.ok && holds.reason === "HELD" && holds.error.startsWith("You already hold this depth in these Domains."), json(holds));
  const near = stageLadderOf(ik4({}), in4({}, [scope4(["a", "b"], [...card4(40, 11, () => 0, "a"), ...card4(40, 11, () => 0, "b")])]), names4, mk4);
  check("… and one whose realistic date is days away (TOO_SOON, in the spec's words)", !near.ok && near.reason === "TOO_SOON" && near.error === "This depth is only weeks away: add a Domain, raise coverage or choose a deeper aim.", json(near));
  const soon = stageLadderOf(ik4({ dateMode: "CHOSEN", targetDay: at4(30) }), learnerIn({ dateMode: "CHOSEN", userDate: at4(30), targetDay: at4(30) }), names4, mk4);
  check("a CHOSEN date under 35 days away is refused for its date", !soon.ok && soon.reason === "TOO_SOON" && soon.error === "A plan needs at least 5 weeks: choose a later date.", json(soon));
  // A gate short by 2 isn't a milestone, and isn't held: Alpha holds 23 of its 25 at level 4.
  const gap2 = ladder4("gap of 2", stageLadderOf(ik4({ domainIds: ["a"] }), in4({}, [scope4(["a"], [...card4(23, 4, (i) => 20 + i, "a"), ...card4(2, 2, () => 0, "a")])]), names4, mk4));
  check("a gap of 2 at a gate merges it and doesn't hold it (no Foundation row)", !gap2.plan.some((m) => m.stage === "FOUNDATION"), json(shape(gap2.plan)));
  const all = [pack, steady, push, six, held, gap2, fromMonday];
  const titleDigits = all.flatMap((r) => r.plan.map((m) => m.title.replace(/level \d{1,2}\+/, "").replace(/, part 1:/, ":"))).filter((t) => /\d/.test(t));
  check("titles hold no digit but {L} (and the count gate's 'part 1')", titleDigits.length === 0, json(titleDigits));
  // (REALISTIC plans: a CHOSEN date before the realistic one is the user's, and the date check says so.)
  const early2 = [pack, steady, push, six, held, gap2].flatMap((r) => r.plan.filter((m) => !m.notes.includes("HELD_AT_START") && m.stage !== "PART").map((m) => ({ due: m.dueDay!, sd: r.stageDays[rowLevel(m)] }))).filter((x) => x.sd && x.due < x.sd);
  check("due days are never before their stage day", early2.length === 0, json(early2));
  check(
    "every row carries its stage (no legacy row), and held rows give no rank to fit or judge",
    all.every((r) => r.plan.every((m) => m.stage != null)) && feasibilityOf(held.plan, judgeIn(in4({}, [strong]), held.plan)).milestones.every((x) => !held.plan.slice(0, 3).some((m) => m.lineageId === x.lineageId))
  );
}

function rowLevel(m: RT.MilestoneDraft): number {
  return Math.max(0, ...m.measures.map((x) => x.minLevel ?? 0));
}

console.log("— rev 4: motivation timelines of the corpus fixtures (decision 54) —");
{
  const DIR = join(process.cwd(), "scripts/fixtures/roadmap-corpus");
  const files = readdirSync(DIR).filter((f) => /^[a-z0-9-]+\.json$/.test(f) && !f.startsWith("probe-")).sort();
  const firstBad: string[] = [];
  const stretchBad: string[] = [];
  const finalStretches: string[] = [];
  const finalBad: string[] = [];
  const splitEarly: string[] = [];
  const hoursBound: string[] = [];
  const dd4f = (from: DayKey, x: DayKey | null | undefined): number | null => (x ? daysBetween(from, x) : null);
  let fixtures = 0;
  for (const f of files) {
    const j = JSON.parse(readFileSync(join(DIR, f), "utf8")) as {
      today: DayKey;
      input: { intake: RT.Intake; domains: { id: string; name: string; cards: number; atSix: number; atTop: number }[] };
    };
    if (!j?.input?.intake) continue;
    fixtures++;
    const today = j.today;
    const ik = j.input.intake;
    const track = ik.fieldId == null;
    const doms = j.input.domains.filter((d) => ik.domainIds.includes(d.id));
    // Cards from each Domain's D-line (cards, at level 6+, at the top level), due over the next weeks; a typed pace where none is given (fixture choice: 3 a week).
    const cards: RT.CardState[] = [];
    for (const d of doms) {
      for (let i = 0; i < d.atTop; i++) cards.push({ level: 12, dueDay: addDays(today, 30 + i), graceEndsDay: null, domainId: d.id });
      for (let i = 0; i < d.atSix - d.atTop; i++) cards.push({ level: 6 + (i % 3), dueDay: addDays(today, 1 + (i % 30)), graceEndsDay: null, domainId: d.id });
      for (let i = 0; i < d.cards - d.atSix; i++) cards.push({ level: 1 + (i % 5), dueDay: addDays(today, i % 10), graceEndsDay: null, domainId: d.id });
    }
    const ids = doms.map((d) => d.id).sort();
    const rate = ik.newCardsPerWeek ?? 3;
    const input: RT.RealismInput = {
      today,
      targetDay: ik.targetDay,
      scopes: track ? [] : [{ key: ids.join(","), domainIds: ids, fieldId: ik.fieldId, cards, rateSource: "YOURS", rate }],
      throughput: { ...tp4({ adherence: null, p: null, c: null }), finalDay: addDays(today, -2) },
      hoursPerWeek: ik.hoursPerWeek,
      intensity: ik.intensity,
      startPoint: ik.startPoint,
      typicalHours: ik.typicalHours,
      typicalHoursSource: ik.typicalHoursSource,
      m: 1,
      heldDays: [],
      areaInMaintenance: false,
      practicesAllowed: ik.practicesAllowed,
      trackArea: track,
      depth: track ? null : 12,
      dateMode: track ? "CHOSEN" : "REALISTIC",
    };
    const names = Object.fromEntries(doms.map((d) => [d.id, d.name])) as unknown as Record<string, RT.DomainName>;
    const res = stageLadderOf({ ...ik, depth: track ? null : 12, dateMode: track ? "CHOSEN" : "REALISTIC" }, input, names, mk4);
    if (!res.ok) {
      firstBad.push(`${f}: refused ${res.reason}`);
      continue;
    }
    const judged = { ...input, targetDay: finalOf(res.plan).dueDay! };
    const mt = motivationTimelineOf(res.plan, judged);
    // The stretch before the final stage, were the final gate dated without clean entry (the reach model's tail, F-R4-8).
    let tail = "";
    if (!track) {
      const fin = finalOf(res.plan);
      const prev = res.plan.filter((m) => m.status !== "DISCARDED" && !m.notes.includes("HELD_AT_START"));
      const before = prev[prev.length - 2];
      const need = Object.fromEntries((res.coverage ?? []).map((c) => [c.domainId, RT.writeNeedOf(c.n, cards.filter((x) => x.domainId === c.domainId).length)]));
      const w = RT.referenceWriteDaysOf(need, res.rate ?? 0, today);
      const params = RT.reachInputsOf(judged.throughput, 1).params;
      const plain = RT.stageDayOf(
        (res.coverage ?? []).map((c) => ({ n: c.n, cards: cards.filter((x) => x.domainId === c.domainId).map((x) => RT.effectiveState(x, today)), writeDays: w[c.domainId] ?? [] })),
        12,
        today,
        params
      );
      const plainStretch = plain && before ? daysBetween(before.dueDay!, plain) : null;
      const cleanStretch = before ? daysBetween(before.dueDay!, fin.dueDay!) : null;
      tail = ` · final stretch ${cleanStretch} (without clean entry ${plainStretch})`;
      if (cleanStretch != null) finalStretches.push(`${f} ${cleanStretch}`);
      if (cleanStretch != null && cleanStretch > RT.MILESTONE_MAX_DAYS + 6 && !mt.longWindow) finalBad.push(`${f}: ${cleanStretch}`);
      // A split never before its stage day (the hours bound moves it later, never earlier).
      for (const m of res.plan) if (m.stage === "BETWEEN" && res.stageDays[rowLevel(m)] && m.dueDay! < res.stageDays[rowLevel(m)]!) splitEarly.push(`${f} ${dd4f(today, m.dueDay)} < ${dd4f(today, res.stageDays[rowLevel(m)])}`);
      if (res.dateCheck?.basis.some((b) => /^Your [\d.]+ h, at the hours you have, take until/.test(b))) hoursBound.push(`${f} ${cleanStretch}`);
    }
    if (mt.longestGap > RT.MILESTONE_MAX_DAYS + 6 && !mt.longWindow) stretchBad.push(`${f}: ${mt.longestGap}`);
    console.log(`  ${f.padEnd(26)} ${shape(res.plan).join(" ")} | first rank ${mt.firstRankDay}, ranks ${mt.rankDays.join(",")}, ⬡6 ${mt.payDays.join(",")}, Paragon ${mt.paragonDay}, longest ${mt.longestGap}${tail}`);
    if (!mt.longWindow && (mt.firstRankDay == null || mt.firstRankDay > RT.FIRST_RANK_MAX_DAYS + 6)) firstBad.push(`${f}: ${mt.firstRankDay}`);
  }
  check(`every corpus fixture's first rank comes by day ${RT.FIRST_RANK_MAX_DAYS + 6} (${fixtures} fixtures)`, fixtures >= 11 && firstBad.length === 0, firstBad.join("; "));
  // F-R4-10's bound, now asserted (fix round: WRITE_MARGIN 1.3, contracts §15.2, and the split placed toward a final date the hours hold later).
  check(`no stretch without a rank, a ⬡6 milestone or Paragon is over ${RT.MILESTONE_MAX_DAYS + 6} days, the final stretch to Mastered included (no exemption)`, stretchBad.length === 0, stretchBad.join("; "));
  check(`every depth fixture's final stretch (the stage before Mastered → Mastered) is within ${RT.MILESTONE_MAX_DAYS + 6} days: ${finalStretches.join(", ")}`, finalStretches.length >= 7 && finalBad.length === 0, finalBad.join("; "));
  check(
    "actuarial-probability, whose Mastered the hours hold (typicalHours 300 at 6 h a week, day 503), places Toward Mastered toward it (day 321, not its stage day 307): a 182-day final stretch, not 196",
    hoursBound.length === 1 && hoursBound[0] === "actuarial-probability.json 182" && splitEarly.length === 0,
    json([hoursBound, splitEarly])
  );
  const steady = ladder4("learner", stageLadderOf(ik4({}), learnerIn(), names4, mk4));
  const sIn = judgeIn(learnerIn(), steady.plan);
  const mt = motivationTimelineOf(steady.plan, sIn);
  eq("the learner's timeline: the first rank on day 55 (the count gate), ranks 55 153 244 461, Paragon on 461 (its performance check is the standard)", [mt.firstRankDay, mt.rankDays, mt.paragonDay], [55, [55, 153, 244, 461], 461]);
  check("… without a standard Paragon is off the timeline", motivationTimelineOf(steady.plan, sIn, { hasStandard: false }).paragonDay === null && motivationTimelineOf(steady.plan, sIn, { coverageBelowPolicy: true }).paragonDay === null);
}

console.log("— rev 4: keep the depth, move the date (F-R4-11) —");
{
  const real = ladder4("learner", stageLadderOf(ik4({}), learnerIn(), names4, mk4));
  const dc = real.dateCheck!;
  eq("REALISTIC mode is FITS by construction, with the last stage on D_real (the Sunday on or after day 460: 461)", [dc.verdict, dd4(dc.D_real), dd4(finalOf(real.plan).dueDay), dc.dateOrigin.origin], ["FITS", 461, 461, "REALISTIC"]);
  console.log(`  learner dates: D_real ${dd4(dc.D_real)}, D_full ${dd4(dc.D_full)}, D_best_pace ${dd4(dc.D_best_pace)}, D_best_2x ${dd4(dc.D_best_2x)}, D_floor ${dd4(dc.D_floor)}`);
  check("D_best_pace ≥ D_best_2x, and the Date copy names D_best_pace", dc.D_best_pace! >= dc.D_best_2x! && dc.basis.some((b) => b.includes("Earliest if every review passes, at this pace:") && b.includes(dowText4(dc.D_best_pace!))));
  check("the schedule-bound line shows for the new learner", dc.scheduleBound && dc.basis.some((b) => b.startsWith("This date is set by the review schedule, not your hours: a new card needs at least 340 days to reach level 12.")));
  // The new learner with a CHOSEN 1-year date.
  const yr = at4(365);
  const chosenIn = learnerIn({ dateMode: "CHOSEN", userDate: yr, targetDay: yr });
  const chosen = ladder4("chosen 1y", stageLadderOf(ik4({ dateMode: "CHOSEN", targetDay: yr }), chosenIn, names4, mk4));
  const fe = feasibilityOf(chosen.plan, chosenIn);
  check(
    "a CHOSEN 1-year date: never FITS; the offers are the realistic date and a lower depth (Keep my date asks more than 4.2 a week)",
    chosen.dateCheck!.verdict !== "FITS" && fe.remedies.includes("USE_REALISTIC_DATE") && fe.remedies.includes("LOWER_DEPTH") && (chosen.dateCheck!.rateAsked ?? 0) > 4.2,
    json([chosen.dateCheck!.verdict, fe.remedies, chosen.dateCheck!.rateAsked])
  );
  eq("… no depth term changes: the final stage still asks 25 recall cards at level 12 (rc) in each Domain", cardMeasures(finalOf(chosen.plan)).map((x) => [x.measureKey, x.target]), cardMeasures(finalOf(real.plan)).map((x) => [x.measureKey, x.target]));
  eq("… reachByUserDate is level 11, Toward Mastered (its stage day 321 ≤ 364 < Mastered's)", [chosen.dateCheck!.reachByUserDate, chosen.dateCheck!.basis.some((b) => b === "By your date the plan reaches level 11, on the way to Mastered (level 12).")], [11, true]);
  check("REFIT_LIGHT and MOVE_TO_LATER are never offered on a depth plan", ![...fe.remedies, ...fe.milestones.flatMap((m) => m.remedies)].some((r) => r === "REFIT_LIGHT" || r === "MOVE_TO_LATER"));
  // Each verdict boundary, on the realistic ladder.
  const verdictAt = (k: DayKey | null) => dateCheckOf(real.plan, chosenIn, "CHOSEN", k).verdict;
  const D = dc;
  eq(
    "the verdict at each boundary: D_real FITS, a day before TIGHT; D_full TIGHT, a day before OVER; D_best_2x OVER, a day before IMPOSSIBLE",
    [verdictAt(D.D_real), verdictAt(addDays(D.D_real!, -1)), verdictAt(D.D_full), verdictAt(addDays(D.D_full!, -1)), verdictAt(D.D_best_2x), verdictAt(addDays(D.D_best_2x!, -1))],
    ["FITS", "TIGHT", "TIGHT", "OVER", "OVER", "IMPOSSIBLE"]
  );
  check("… and a day before D_floor is IMPOSSIBLE (the bound is the later of D_best_2x and D_floor)", verdictAt(addDays(D.D_floor!, -1)) === "IMPOSSIBLE" && D.D_floor! <= D.D_best_2x!);
  const tight = dateCheckOf(real.plan, chosenIn, "CHOSEN", addDays(D.D_real!, -1));
  const over = dateCheckOf(real.plan, chosenIn, "CHOSEN", addDays(D.D_full!, -1));
  check("the rates are monotone: TIGHT asks between 4.2 and your usual 6, OVER at most twice it", tight.rateAsked! >= 4.2 && tight.rateAsked! <= 6 && over.rateAsked! > 6 && over.rateAsked! <= 12, json([tight.rateAsked, over.rateAsked]));
  check("TIGHT's line: 'Uses your full usual pace: no margin for a lean week.'; IMPOSSIBLE names the floor", tight.basis.includes("Uses your full usual pace: no margin for a lean week.") && dateCheckOf(real.plan, chosenIn, "CHOSEN", at4(200)).basis.some((b) => b.includes("a new card needs at least 318 days to reach level 12 here")));
  const tiers = (["LIGHT", "STEADY", "PUSH"] as const).map((intensity) => ladder4(intensity, stageLadderOf(ik4({ intensity }), learnerIn({ intensity }), names4, mk4)).dateCheck!.D_real!);
  check("Light gives dates ≥ Steady ≥ Push (the pace share moves the date, never the depth)", tiers[0] >= tiers[1] && tiers[1] >= tiers[2] && tiers[0] > tiers[2], json(tiers.map(dd4)));
  const far = stageLadderOf(ik4({ domainIds: ["a", "b", "c", "d", "e", "f"] }), in4({ sourceRate: 1 }, [scope4(["a", "b", "c", "d", "e", "f"], [], 1)]), names4, mk4);
  check("a realistic date past 1,080 days is refused with its copy (TOO_FAR)", !far.ok && far.reason === "TOO_FAR" && far.error.startsWith("At your pace this depth is realistic in more than 3 years."), json(far));
  // While calibrating: the priors, never p = 1, and what was assumed.
  const calIn = learnerIn({ reach: undefined, calibrating: undefined, throughput: tp4({ p: null, c: null }) });
  const cal = ladder4("calibrating", stageLadderOf(ik4({}), calIn, names4, mk4));
  check(
    "p calibrating dates at the priors (0.80, 0.85, 0.6), later than with them measured, and records 'p', 'c' and 'rho' in dateOrigin.calibrating",
    cal.dateCheck!.D_real! > dc.D_real! && json(cal.dateCheck!.dateOrigin.calibrating) === json(["p", "c", "rho"]) && cal.dateCheck!.basis.some((b) => b.startsWith("This date is an estimate: it assumes an 80% pass rate until 30 reviews are measured")),
    json(cal.dateCheck)
  );
  // Question 9's months (contracts §16.10): a brand-new learner has nothing measured, so the priors date the plan. The figure
  // the spec's "about 11–15 months" must be checked against (30.44 days a month).
  eq(
    "a new learner on the priors (2 Domains, 0 cards, 6 a week at Steady): Mastered's stage day 479 and D_real 482, about 15.8 months (question 9)",
    [cal.stageDays[12] != null ? dd4(cal.stageDays[12]) : null, dd4(cal.dateCheck!.D_real), Math.round((dd4(cal.dateCheck!.D_real)! / 30.44) * 10) / 10],
    [479, 482, 15.8]
  );
  const typed = ladder4("typed pace", stageLadderOf(ik4({ newCardsPerWeek: 6 }), in4({ calibrating: undefined, sourceRate: undefined }, [scope4(["a", "b"], [], 6, "YOURS")]), names4, mk4));
  check("a typed pace records 'pace'", typed.dateCheck!.dateOrigin.calibrating.includes("pace") && typed.dateCheck!.basis.some((b) => b.includes("your typed 6 new cards a week isn't measured yet")), json(typed.dateCheck!.dateOrigin));
  const noPaceChosen = ladder4("no pace, chosen", stageLadderOf(ik4({ dateMode: "CHOSEN", targetDay: at4(730) }), in4({ dateMode: "CHOSEN", userDate: at4(730), sourceRate: null }, [scope4(["a", "b"], [], null)]), names4, mk4));
  check(
    "pace NONE in CHOSEN mode: the stages spread evenly to the date and read 'Not dated: no writing pace yet'",
    noPaceChosen.dateCheck!.D_real === null && noPaceChosen.dateCheck!.basis[0].startsWith("Not dated: no writing pace yet") && finalOf(noPaceChosen.plan).dueDay === at4(730),
    json(shape(noPaceChosen.plan))
  );
  const noPaceReal = stageLadderOf(ik4({}), in4({ sourceRate: null }, [scope4(["a", "b"], [], null)]), names4, mk4);
  check("… and REALISTIC mode needs the typed rate (NO_PACE)", !noPaceReal.ok && noPaceReal.reason === "NO_PACE");

  // The spare alone with no pace (the WRITE_MARGIN ruling's option (b), contracts §16.10). COVER_SHARE × WRITE_MARGIN = 1.04 > 1,
  // so a Domain at its share always asks a few spare cards, and before this every REALISTIC plan with no measured or typed
  // pace was refused NO_PACE. A Domain that already holds its count n_d needs no pace: the plan is dated on the cards held.
  const spareSizes = Array.from({ length: 476 }, (_, i) => i + 25);
  check(
    "every library of 25 to 500 recall cards (no outline) holds its own count (live ≥ n_d, so its new cards are the spare alone), and at WRITE_MARGIN 1.3 every one still asks some",
    spareSizes.every((live) => RT.coveragePolicyOf(live, 0).n <= live) && (RT.WRITE_MARGIN * RT.COVER_SHARE <= 1 || spareSizes.every((live) => RT.writeNeedOf(RT.coveragePolicyOf(live, 0).n, live) > 0)),
    json(spareSizes.filter((live) => RT.writeNeedOf(RT.coveragePolicyOf(live, 0).n, live) === 0).slice(0, 5))
  );
  const probIk = ik4({ domainIds: ["prob"] });
  const probNoPaceIn = in4({ sourceRate: null }, [scope4(["prob"], probCards, null)]);
  const probPaceIn = in4({}, [scope4(["prob"], probCards, 6)]);
  const spareR = stageLadderOf(probIk, probNoPaceIn, names4, mk4);
  check("Probability alone (42 cards, n 34: writeNeedOf(34, 42) = 3, the spare alone) with no pace is dated in REALISTIC mode, not refused NO_PACE", spareR.ok, json(spareR));
  const spared = ladder4("Probability, pace 6", stageLadderOf(probIk, probPaceIn, names4, mk4));
  if (spareR.ok) {
    const spare = spareR;
    const spareWrites = writingPlanOf(spare.plan, judgeIn(probNoPaceIn, spare.plan)).reduce((s, w) => s + w.weeks.reduce((t, x) => t + x.cards, 0), 0);
    check(
      "… rate null, no card written, D_full = D_real, no rate asked, nothing assumed about a pace",
      RT.writeNeedOf(34, 42) === 3 &&
        spare.rate === null &&
        spareWrites === 0 &&
        spare.dateCheck!.verdict === "FITS" &&
        spare.dateCheck!.D_full === spare.dateCheck!.D_real &&
        spare.dateCheck!.rateAsked === null &&
        !spare.dateCheck!.dateOrigin.calibrating.includes("pace"),
      json([spare.rate, spareWrites, spare.dateCheck])
    );
    eq(
      "… its realistic day is 412 on the cards held, the same plan writing its spare at a pace of 6 (4.2 a week at Steady) 370: a pace only brings the date closer, and the stages below the depth are the same",
      [dd4(spare.dateCheck!.D_real), dd4(spared.dateCheck!.D_real), json(shape(spare.plan).slice(0, -1)) === json(shape(spared.plan).slice(0, -1)), spared.rate],
      [412, 370, true, 4.2]
    );
    check(
      "… its basis says what it counted: 'With only the cards you hold, …', the best case 'on the cards you hold', and the 3 spare cards not counted, with the 30% read from WRITE_MARGIN",
      spare.dateCheck!.basis[0].startsWith("With only the cards you hold, your 85% pass rate") &&
        spare.dateCheck!.basis[0].includes("Earliest if every review passes, on the cards you hold:") &&
        spare.dateCheck!.basis.includes(
          `No writing pace yet, so the 3 spare new cards the plan would write (${Math.round((RT.WRITE_MARGIN - 1) * 100)}% over the count, because some cards lag) aren't counted. Enter how many new cards a week you'll write, and the date may come closer.`
        ) &&
        !spared.dateCheck!.basis.some((b) => b.startsWith("No writing pace yet")),
      json(spare.dateCheck!.basis)
    );
    const mixed = stageLadderOf(packIk, in4({ intensity: "LIGHT", reach: P(0.8), sourceRate: null }, [scope4(["prob", "inf"], [...probCards, ...infCards], null)]), names4, mk4);
    check("… the pack with no pace is still refused NO_PACE: Inference (9 cards) is short of its 25, so its new cards are needed, not a spare", !mixed.ok && mixed.reason === "NO_PACE", json(mixed));
    const chosenSpare = { ...probNoPaceIn, dateMode: "CHOSEN" as const };
    const sv = (k: number) => dateCheckOf(spare.plan, chosenSpare, "CHOSEN", at4(k));
    const svs = [300, 312, 400, 411, 412].map((k) => [k, sv(k).verdict, sv(k).rateAsked]);
    eq(
      "… a date of the user's on it: before D_floor (day 312, the spare written today) IMPOSSIBLE, from it to D_real OVER, from D_real (412) FITS; never a rate asked",
      [dd4(spare.dateCheck!.D_floor), svs],
      [312, [[300, "IMPOSSIBLE", null], [312, "OVER", null], [400, "OVER", null], [411, "OVER", null], [412, "FITS", null]]]
    );
    check(
      "… IMPOSSIBLE never says 'twice your pace' with no pace (with one it still does), and OVER offers the pace",
      sv(300).basis.some((b) => b.includes("even if every review passes and the new cards are written today: a new card needs at least 318 days")) &&
        !sv(300).basis.some((b) => b.includes("twice your pace")) &&
        dateCheckOf(real.plan, chosenIn, "CHOSEN", at4(200)).basis.some((b) => b.includes("even at twice your pace: a new card needs at least 318 days")) &&
        sv(400).basis.includes("Your date comes before the realistic one: it works only if nearly every review passes, or with new cards written: enter how many a week you'll write."),
      json([sv(300).basis, sv(400).basis])
    );
    const startSpare = refitForStart(spare.plan.find((m) => !m.notes.includes("HELD_AT_START"))!, spare.plan, { ...chosenSpare, targetDay: finalOf(spare.plan).dueDay! });
    check(
      "… Start on it: the stage date FITS on its own planned day, and the card check says new cards aren't counted with no pace",
      startSpare.stageDate?.verdict === "FITS" &&
        !startSpare.impossible &&
        startSpare.feasibility.knowledge.some((k) => k.basis.includes("New cards aren't counted: no pace yet — enter a weekly number or re-date after 4 weeks.")),
      json([startSpare.stageDate, startSpare.feasibility.knowledge.map((k) => k.verdict)])
    );
  }
  // The floor counts the spare: 30 cards at level 3 due every 10 days (n 25, spare 3): written today, the 3 spare cards beat
  // the last existing ones, so the floor (532) comes before the held cards' best case (562). The date check and the Start
  // check agree on it: only a day before the floor is IMPOSSIBLE; from it to the realistic day, OVER.
  const spreadIn = in4({ sourceRate: null }, [scope4(["a"], card4(30, 3, (i) => 10 * (i + 1), "a"), null)]);
  const spreadR = stageLadderOf(ik4({ domainIds: ["a"] }), spreadIn, names4, mk4);
  if (spreadR.ok) {
    const fin = finalOf(spreadR.plan);
    const startOn = (k: number) => refitForStart({ ...fin, dueDay: at4(k) }, spreadR.plan, { ...spreadIn, dateMode: "CHOSEN", targetDay: fin.dueDay! }).stageDate?.verdict;
    eq(
      "the spare only, its floor before the held cards' best case (532 < 562): the date check reads day 540 OVER and 531 IMPOSSIBLE, and Start on the final stage due 540 OVER, due 531 IMPOSSIBLE",
      [dd4(spreadR.dateCheck!.D_floor), dd4(spreadR.dateCheck!.D_best_pace), dateCheckOf(spreadR.plan, { ...spreadIn, dateMode: "CHOSEN" }, "CHOSEN", at4(540)).verdict, dateCheckOf(spreadR.plan, { ...spreadIn, dateMode: "CHOSEN" }, "CHOSEN", at4(531)).verdict, startOn(540), startOn(531)],
      [532, 562, "OVER", "IMPOSSIBLE", "OVER", "IMPOSSIBLE"]
    );
  } else check("the spread library (30 cards at level 3, spare 3) with no pace is dated on the cards held", false, json(spreadR));
  // When the cards held can't reach the depth within SPAN_MAX_DAYS (a 30% pass rate), the spare can't be left out: as before.
  const lowIn = (o: Partial<RT.RealismInput>) => in4({ sourceRate: null, reach: P(0.3), ...o }, [scope4(["prob"], probCards, null)]);
  const lowReal = stageLadderOf(probIk, lowIn({}), names4, mk4);
  const lowChosen = stageLadderOf(ik4({ domainIds: ["prob"], dateMode: "CHOSEN", targetDay: at4(700) }), lowIn({ dateMode: "CHOSEN", userDate: at4(700), targetDay: at4(700) }), names4, mk4);
  check(
    "… a spare-only library whose cards held can't reach the depth within 3 years (30% pass rate): REALISTIC is refused NO_PACE, CHOSEN reads 'Not dated', as before",
    !lowReal.ok && lowReal.reason === "NO_PACE" && lowChosen.ok && lowChosen.dateCheck!.D_real === null && lowChosen.dateCheck!.basis[0].startsWith("Not dated: no writing pace yet"),
    json([lowReal, lowChosen.ok ? lowChosen.dateCheck!.basis : lowChosen])
  );
  // The date core's memo (a page of views dates the same model many times): a hit is the same answer, handed out as a copy,
  // and an input that differs anywhere (here the pace) is never answered from another's entry.
  {
    const yrA = chosenIn;
    const yrB = { ...chosenIn, sourceRate: 3 };
    const day = addDays(dc.D_real!, -30);
    const a1 = dateCheckOf(real.plan, yrA, "CHOSEN", day);
    const b1 = dateCheckOf(real.plan, yrB, "CHOSEN", day);
    const keep = json(a1);
    a1.basis.push("edited by a caller");
    a1.dateOrigin.calibrating.push("pace");
    const a2 = dateCheckOf(real.plan, yrA, "CHOSEN", day);
    const b2 = dateCheckOf(real.plan, yrB, "CHOSEN", day);
    check(
      "the date core's memo: a repeated call is the same answer, a caller's edit to a returned check never reaches the next, and a different pace (6 vs 3) is never answered from the other's entry",
      json(a2) === keep && json(b2) === json(b1) && json(a2) !== json(b2) && a2.rateAsked !== b2.rateAsked && a2 !== a1,
      json([a2.verdict, a2.rateAsked, b2.verdict, b2.rateAsked])
    );
  }
  // dateEffectOf on a plan that isn't dated (CHOSEN, no pace, new cards needed): there is no date to be past, so no addition is
  // blocked PAST_SPAN with a "past 3 years" it can't know (it was, before: D_real null read as past the span).
  const undated = in4({ sourceRate: null, dateMode: "CHOSEN", userDate: at4(700), targetDay: at4(700) }, [scope4(["a", "b", "c"], [], null)]);
  const undatedEffect = dateEffectOf(ik4({ dateMode: "CHOSEN", targetDay: at4(700) }), undated, ["c"]);
  const datedEffect = dateEffectOf(ik4({}), in4({}, [scope4(["a", "b", "c"], [], 6)]), ["c"]);
  const farEffect = dateEffectOf(ik4({ domainIds: ["a", "b", "c", "d", "e"] }), in4({ sourceRate: 1 }, [scope4(["a", "b", "c", "d", "e", "f"], [], 1)]), ["f"]);
  check(
    "dateEffectOf with no pace and new cards needed: dateWith null and pastSpan false for each addition and the set (no toggle blocked); with a pace it dates them, and past 3 years is still PAST_SPAN",
    json(undatedEffect) === json([{ domainId: "c", dateWith: null, pastSpan: false }, { domainId: null, dateWith: null, pastSpan: false }]) &&
      datedEffect.every((e) => e.dateWith != null && !e.pastSpan) &&
      farEffect.every((e) => e.pastSpan),
    json([undatedEffect, datedEffect, farEffect])
  );
  // typicalHours 300 at 5 h a week (your recurring tasks kept 70%: 210 minutes a week) moves D_real to D_hours.
  const hoursIn = learnerIn({ typicalHours: 300, hoursPerWeek: 5, throughput: tp4({ adherence: 0.7 }) });
  const hours = ladder4("typicalHours", stageLadderOf(ik4({ typicalHours: 300, hoursPerWeek: 5 }), hoursIn, names4, mk4));
  check(
    "typicalHours 300 at 5 h a week moves D_real to D_hours (day 599, Sunday 601), says so, and drops the schedule-bound line",
    dd4(hours.dateCheck!.D_real) === 601 && hours.dateCheck!.basis.some((b) => b.startsWith("Your 300 h, at the hours you have, take until")) && !hours.dateCheck!.scheduleBound,
    json(hours.dateCheck)
  );
  // The split when the hours hold Mastered later than the reach would (fix round, contracts §15.15): Toward Mastered goes no
  // earlier than Mastered − 186 days (Sunday-snapped), never before its own stage day, ≥ 35 days from both neighbours.
  const hoursShape = ["PART@55", "FAMILIAR@111", "RETAINED@153", "FLUENT@244", "BETWEEN@419", "MASTERED@601"];
  const hoursJudged = judgeIn(hoursIn, hours.plan);
  check(
    "… and the split goes toward the date the hours hold: Toward Mastered on 419, not its stage day 321, so neither half of the 357-day Fluent → Mastered window is over 186 days (321 would leave 280); the longest stretch is 182",
    json(shape(hours.plan)) === json(hoursShape) && dd4(hours.stageDays[11]) === 321 && motivationTimelineOf(hours.plan, hoursJudged).longestGap === 182,
    json([shape(hours.plan), stageDaysOf(hours), motivationTimelineOf(hours.plan, hoursJudged)])
  );
  const hoursAcc = hours.plan.map((m) => ({ ...m, status: "PLANNED" as RT.MilestoneStatus }));
  const hoursAccIn: RT.RealismInput = { ...hoursJudged, dateMode: "CHOSEN", userDate: finalOf(hoursAcc).dueDay };
  const reHours = [refit(hoursAcc, hoursAccIn), applyRemedy(hoursAcc, hoursAccIn, "USE_REALISTIC_DATE")];
  check(
    "… a re-date (refit, USE_REALISTIC_DATE) places it the same way, and Mastered's window starts the day after it",
    reHours.every((p) => json(shape(p)) === json(hoursShape) && p[5].windowStart === addDays(p[4].dueDay!, 1)),
    json(reHours.map((p) => p.map((m) => `${m.stage}:${dd4(m.windowStart)}-${dd4(m.dueDay)}`)))
  );
  // A CHOSEN date past D_real (FITS): the slack sits in the final window; one split can't hold both halves under 186 days, so it
  // goes to the window's middle (never before its stage day), and every stage still FITS.
  const slackIn = learnerIn({ dateMode: "CHOSEN", userDate: at4(700), targetDay: at4(700) });
  const slack = ladder4("slack to day 700", stageLadderOf(ik4({ dateMode: "CHOSEN", targetDay: at4(700) }), slackIn, names4, mk4));
  const slackFe = feasibilityOf(slack.plan, judgeIn(slackIn, slack.plan));
  check(
    "a CHOSEN date at day 700 (D_real 461): Toward Mastered at the 456-day window's middle (475, its stage day 321), Mastered on 700, every stage FITS",
    json(shape(slack.plan)) === json(["PART@55", "FAMILIAR@111", "RETAINED@153", "FLUENT@244", "BETWEEN@475", "MASTERED@700"]) && slack.dateCheck!.verdict === "FITS" && slackFe.milestones.every((m) => m.worst === "FITS"),
    json([shape(slack.plan), slackFe.milestones.map((m) => m.worst)])
  );
  // An exam date at day 180: a waypoint inside the plan.
  const examIk = ik4({ examLabel: "JLPT N2", exam: true, examDay: at4(180) });
  const exam = ladder4("exam", stageLadderOf(examIk, learnerIn({ examDay: at4(180) }), names4, mk4));
  const checkpoints = exam.plan.map((m) => m.items.filter((i) => i.kind === "CHECKPOINT").map((i) => i.catalogKey).join(""));
  // The practice progression (contracts §20): checkpoints escalate (self-tests, then the exam itself on its stage; none between a
  // dated exam and the last stage but the last's performance check), BOOK_EXAM on the first stage.
  eq(
    "an exam on day 180: the depth stays Mastered; EXAM_DAY sits in the stage holding it (Fluent, due 244), a self-test before, the mock test on the stage before the exam's (its run-up, contracts §20.11); after the exam the plan climbs on toward the depth, measured again (a self-test, then the performance check on the last: the lead's ruling 3, contracts §20.12); BOOK_EXAM in the first; reachByExam level 8",
    [cardMeasures(finalOf(exam.plan))[0].measureKey, checkpoints, exam.plan[0].items.some((i) => i.catalogKey === "BOOK_EXAM"), exam.dateCheck!.reachByExam, exam.dateCheck!.verdict],
    ["CARDS_AT_LEVEL|d:a|L12|rc", ["", "SELF_TEST", "MOCK_TEST", "EXAM_DAY", "SELF_TEST", "PERFORMANCE_CHECK"], true, 8, "FITS"]
  );
  check(
    "… timed practice on the exam's stage alone (its rehearsal, contracts §20.3), never another; the exam line stays on the plan",
    exam.plan.every((m, i) => m.items.some((x) => x.catalogKey === "TIMED_PRACTICE") === (i === 3)) && exam.dateCheck!.basis.some((b) => b.startsWith("By your exam (") && b.endsWith("the plan reaches Retained (level 8). The depth goes on past it."))
  );
  eq("the exam leaves the verdict on the aim's own date as it was", [exam.dateCheck!.D_real, exam.dateCheck!.verdict], [dc.D_real, dc.verdict]);
  const late = ladder4("exam after D_real", stageLadderOf(ik4({ examLabel: "JLPT N2", exam: true, examDay: at4(700) }), learnerIn({ examDay: at4(700) }), names4, mk4));
  check("an examDay after D_real puts EXAM_DAY on the final milestone", finalOf(late.plan).items.some((i) => i.catalogKey === "EXAM_DAY") && late.dateCheck!.reachByExam === 12);
  // LOWER_DEPTH.
  const acc = real.plan.map((m) => ({ ...m, status: "PLANNED" as RT.MilestoneStatus, rankIndex: RT.rankIndexForStage(m.stage, rowLevel(m)) }));
  const accIn = learnerIn({ dateMode: "CHOSEN", userDate: finalOf(acc).dueDay, targetDay: finalOf(acc).dueDay! });
  const startedM = acc.map((m) => (m.stage === "MASTERED" ? { ...m, status: "STARTED" as RT.MilestoneStatus } : m));
  const refused = lowerDepthPlanOf(startedM, accIn, 10);
  check("LOWER_DEPTH is refused while a started stage works above the new depth", !refused.ok && refused.error === "Close or drop milestone 6 first: it is working toward a level above Fluent.", json(refused));
  const startedF = acc.map((m) => (m.stage === "FLUENT" ? { ...m, status: "STARTED" as RT.MilestoneStatus } : m));
  const lowered = lowerDepthPlanOf(startedF, accIn, 10);
  check(
    "with Fluent STARTED and Mastered unstarted, lowering to Fluent drops Mastered and Toward Mastered (DEPTH_LOWERED), keeps Fluent's measures as started, and leaves every given rank in place",
    lowered.ok &&
      json(lowered.plan.map((m) => [m.stage, m.status, m.notes.includes("DEPTH_LOWERED")])) ===
        json([["PART", "PLANNED", false], ["FAMILIAR", "PLANNED", false], ["RETAINED", "PLANNED", false], ["FLUENT", "STARTED", false], ["BETWEEN", "DISCARDED", true], ["MASTERED", "DISCARDED", true]]) &&
      json(cardMeasures(lowered.plan[3])) === json(cardMeasures(startedF[3])) &&
      lowered.plan.slice(0, 4).every((m, i) => m.rankIndex === acc[i].rankIndex) &&
      json(lowered.dropped) === json([acc[4].lineageId, acc[5].lineageId]),
    json(lowered)
  );
  const unstarted = lowerDepthPlanOf(acc, accIn, 10);
  check("an unstarted Fluent becomes the final stage with the depth terms (rc at level 10)", unstarted.ok && cardMeasures(unstarted.plan[3]).every((x) => x.measureKey!.endsWith("|L10|rc") && x.target === 25));
  const toEight = lowerDepthPlanOf(acc, accIn, 8);
  check("lowering to Retained drops Fluent too, and no count ever changes", toEight.ok && toEight.plan.filter((m) => m.status === "DISCARDED").length === 3 && toEight.plan.every((m) => cardMeasures(m).every((x) => x.target === cardMeasures(acc[toEight.plan.indexOf(m)]).find((y) => y.scope.domainIds![0] === x.scope.domainIds![0])!.target)));
  const strongAcc = ladder4("strong", stageLadderOf(ik4({}), in4({}, [scope4(["a", "b"], [...card4(30, 8, (i) => 10 + 2 * i, "a"), ...card4(30, 8, (i) => 11 + 2 * i, "b")])]), names4, mk4));
  const toHeld = lowerDepthPlanOf(strongAcc.plan, in4({}, [scope4(["a", "b"], [])]), 8);
  check("lowering to a depth already held when you began is refused", !toHeld.ok && toHeld.error.startsWith("You already hold Retained (level 8)"), json(toHeld));
  // CALIBRATED: a plan accepted while p calibrated is re-dated once p is measured; only unstarted stages move.
  const calAcc = cal.plan.map((m, i) => ({ ...m, status: (i === 0 ? "STARTED" : "PLANNED") as RT.MilestoneStatus }));
  const calIn2 = { ...calIn, dateMode: "CHOSEN" as const, userDate: finalOf(calAcc).dueDay, targetDay: finalOf(calAcc).dueDay! };
  const redated = refit(calAcc, { ...calIn2, reach: P(0.92), calibrating: [], throughput: tp4({ p: 0.92 }) });
  check(
    "CALIBRATED re-dating (refit) with p measured at 92% moves only the unstarted stages, never a count or a level; the started one keeps its dates",
    redated[0].dueDay === calAcc[0].dueDay &&
      redated[0].status === "STARTED" &&
      redated.slice(1).some((m, i) => m.dueDay !== calAcc[i + 1].dueDay) &&
      redated.every((m, i) => json(cardMeasures(m).map((x) => [x.minLevel, x.target])) === json(cardMeasures(calAcc[i]).map((x) => [x.minLevel, x.target]))),
    json([shape(calAcc), shape(redated)])
  );
  const useReal = applyRemedy(chosen.plan, chosenIn, "USE_REALISTIC_DATE");
  eq("USE_REALISTIC_DATE re-dates the stages, the last on D_real; remedyTargetDay is D_real", [dd4(finalOf(useReal).dueDay), dd4(remedyTargetDay(chosen.plan, chosenIn))], [461, 461]);
  // Start: a date check, never a lower count.
  const startIn = learnerIn({ today: at4(30), dateMode: "CHOSEN", userDate: finalOf(acc).dueDay, targetDay: finalOf(acc).dueDay! });
  const st = refitForStart(acc[1], acc, startIn);
  check(
    "the Start check offers a date, never a lower count: no todayCheck, the counts as accepted, and the stage date (planned 111, realistic later at today's cards)",
    st.todayCheck === null && st.stageDate != null && dd4(st.stageDate.planned) === 111 && (dd4(st.stageDate.realistic) ?? 0) > 111 && st.stageDate.verdict !== "FITS" && json(cardMeasures(st.milestone).map((x) => x.target)) === json(cardMeasures(acc[1]).map((x) => x.target)),
    json(st.stageDate)
  );
  const onTime = refitForStart(acc[1], acc, learnerIn({ dateMode: "CHOSEN", userDate: finalOf(acc).dueDay, targetDay: finalOf(acc).dueDay! }));
  check("… started on time it FITS", onTime.stageDate?.verdict === "FITS" && !onTime.impossible, json(onTime.stageDate));
  // The date effect of adding Domains (F-R4-21) and the floor day (F-R4-4's chips).
  const extra = scope4(["a", "b", "c", "d"], card4(40, 3, () => 2, "d"));
  const effect = dateEffectOf(ik4({}), in4({}, [learnerScope, extra]), ["c", "d"]);
  check(
    "dateEffectOf: each Domain and the set, shown before anything is confirmed; a new 25-card Domain moves the date later; none pass 3 years",
    effect.length === 3 && effect[2].domainId === null && dd4(effect[0].dateWith)! > dd4(dc.D_real)! && effect.every((e) => !e.pastSpan),
    json(effect.map((e) => [e.domainId, dd4(e.dateWith), e.pastSpan]))
  );
  const crowd = dateEffectOf(ik4({}), in4({ sourceRate: 2 }, [scope4(["a", "b", "c", "d", "e", "f"], [], 2)]), ["c", "d", "e", "f"]);
  check("… an addition that would take the plan past 3 years reads pastSpan", crowd.some((e) => e.pastSpan), json(crowd.map((e) => [e.domainId, dd4(e.dateWith), e.pastSpan])));
  const floor = (depth: RT.AimDepth) => dd4(floorDayOf({ today: T4, depth, m: 1, newCardsNeeded: 56, ratePerWeek: 4.2 }));
  eq("floorDayOf: a new learner (56 new at 4.2 a week) can reach level 12 from day 431 and level 10 from day 246", [floor(12), floor(10)], [431, 246]);
  check(
    "the chips: at Mastered 6 and 12 months are before level 12 is possible and 24 months possible; at Fluent 12 months is possible",
    floor(12)! > 182 && floor(12)! > 365 && floor(12)! <= 730 && floor(10)! <= 365 && dd4(floorDayOf({ today: T4, depth: 12, m: 1.5, newCardsNeeded: 0, ratePerWeek: null })) === RT.floorBase(12, 1.5)
  );
}

console.log("— rev 4: stage practices and the band floors (F-R4-13) —");
{
  const real = ladder4("learner", stageLadderOf(ik4({}), learnerIn(), names4, mk4));
  // The practice progression (contracts §20): each stage's focus climbs (retrieval, then production, then putting it
  // together), the stage before's focus is carried, recall drills are the spaced review throughout; every one the app's.
  eq(
    "the starter's kinds are the practice progression's: the count gate copies Familiar's (recall drills, then the partner), problem sets from Retained (going over mistakes as the spaced review there, recall drills already carried), explaining from Fluent, building from Toward Mastered, each carrying the one before and keeping recall drills (each added by the app)",
    real.plan.map((m) => m.items.filter((i) => i.kind === "PRACTICE").map((i) => `${i.catalogKey}:${i.notes.join("")}`).join(",")),
    [
      "RECALL_DRILLS:STUDY_ADDED,READ_AND_CARD:STUDY_ADDED",
      "RECALL_DRILLS:STUDY_ADDED,READ_AND_CARD:STUDY_ADDED",
      "PROBLEM_SETS:PRODUCTION_ADDED,RECALL_DRILLS:STUDY_ADDED,MISTAKE_REVIEW:PRODUCTION_ADDED",
      "EXPLAIN_IT:PRODUCTION_ADDED,PROBLEM_SETS:PRODUCTION_ADDED,RECALL_DRILLS:STUDY_ADDED",
      "BUILD_SOMETHING:PRODUCTION_ADDED,EXPLAIN_IT:PRODUCTION_ADDED,RECALL_DRILLS:STUDY_ADDED",
      "BUILD_SOMETHING:PRODUCTION_ADDED,EXPLAIN_IT:PRODUCTION_ADDED,RECALL_DRILLS:STUDY_ADDED",
    ]
  );
  const floorOf = (m: RT.MilestoneDraft) => RT.PRACTICE_BANDS.indexOf(m.stage === "FLUENT" || m.stage === "MASTERED" || m.stage === "BETWEEN" ? "D45" : m.stage === "RETAINED" ? "D30" : "D15");
  check(
    "no practice drops under its band floor: Retained D30, Fluent, Toward Mastered and Mastered D45 (a building session keeps its own D60)",
    real.plan.every((m) => m.items.filter((i) => i.kind === "PRACTICE").every((i) => RT.PRACTICE_BANDS.indexOf(i.durationBand!) >= floorOf(m))) &&
      json(real.plan.map((m) => m.items.find((i) => i.kind === "PRACTICE")!.durationBand)) === json(["D30", "D30", "D30", "D45", "D60", "D60"]),
    json(real.plan.map((m) => m.items.filter((i) => i.kind === "PRACTICE").map((i) => i.durationBand)))
  );
  check("productionPlannedFromFluentOf: true with the starter's practices", productionPlannedFromFluentOf(real.plan));
  const fluent = real.plan[3];
  const userRead: RT.ItemDraft = { ...fluent.items.find((i) => i.kind === "PRACTICE")!, lineageId: "u-read", catalogKey: "READ_AND_CARD", label: "Study Alpha, Beta", origin: "USER", decision: "EDITED", method: "READING", notes: [] };
  const onlyRead = { ...fluent, items: [...fluent.items.filter((i) => i.kind !== "PRACTICE"), userRead] };
  // syncStagePractices reads the stage within its plan (the carry and its place in the chain are the plan's).
  const inPlan = { plan: real.plan };
  const realIn = judgeIn(learnerIn(), real.plan);
  const synced = syncStagePractices(onlyRead, realIn, names4, mk4, [], inPlan);
  const added = synced.items.filter((i) => i.notes.includes("PRODUCTION_ADDED"));
  check(
    "a Fluent stage with only the user's READ_AND_CARD gets the progression's production practices (its focus, explain it, and the carry, problem sets: PRODUCTION_ADDED) in the room the user's leaves; the user's stays",
    json(added.map((i) => i.catalogKey)) === json(["EXPLAIN_IT", "PROBLEM_SETS"]) && added.every((i) => i.origin === "CODE") && synced.items.some((i) => i.lineageId === "u-read" && i.decision === "EDITED") && synced.items.filter((i) => i.kind === "PRACTICE").length === 3,
    json(synced.items.map((i) => i.catalogKey))
  );
  const fitted = fitPlan(real.plan.map((m, i) => (i === 3 ? synced : m)), realIn);
  check("… at D45 or more once fitted", ["D45", "D60", "D90", "D120"].includes(fitted[3].items.find((i) => i.notes.includes("PRODUCTION_ADDED"))!.durationBand ?? ""));
  const full = { ...onlyRead, items: [...onlyRead.items, { ...userRead, lineageId: "u-2" }, { ...userRead, lineageId: "u-3" }] };
  const noSlot = syncStagePractices(full, realIn, names4, mk4, [], inPlan);
  check("… and the note when no slot is free (NO_PRODUCTION_SLOT)", noSlot.notes.includes("NO_PRODUCTION_SLOT") && !noSlot.items.some((i) => i.notes.includes("PRODUCTION_ADDED")));
  const found = real.plan[1];
  const build: RT.ItemDraft = { ...userRead, lineageId: "u-build", catalogKey: "BUILD_SOMETHING", label: "Build something with Alpha, Beta", method: "PROJECT_WORK" };
  const onlyBuild = syncStagePractices({ ...found, items: [...found.items.filter((i) => i.kind !== "PRACTICE"), build] }, realIn, names4, mk4, [], inPlan);
  check("a Familiar stage with only BUILD_SOMETHING gets a retrieval practice (STUDY_ADDED)", onlyBuild.items.some((i) => i.catalogKey === "RECALL_DRILLS" && i.notes.includes("STUDY_ADDED")), json(onlyBuild.items.map((i) => i.catalogKey)));
  // One definition of retrieval or production practice (contracts §15.9): roadmap-catalog's practiceRoleOf, catalog type first,
  // then the method. A "Write it myself" practice typed WRITING (no catalog type) is production in R2, R4's top rank and R1 alike.
  const realismSrc = readFileSync(join(process.cwd(), "src/lib/roadmap-realism.ts"), "utf8");
  check(
    "roadmap-realism reads roadmap-catalog's practiceRoleOf (imported; no second definition)",
    !/function\s+practiceRoleOf\b/.test(realismSrc) && /import\s*\{[^}]*\bpracticeRoleOf\b[^}]*\}\s*from\s*"\.\/roadmap-catalog"/.test(realismSrc)
  );
  const typedWriting: RT.ItemDraft = { ...userRead, lineageId: "u-write", catalogKey: null, label: "Write up a worked example", method: "WRITING" };
  const typedFluent = syncStagePractices({ ...fluent, items: [...fluent.items.filter((i) => i.kind !== "PRACTICE"), typedWriting] }, realIn, names4, mk4, [], inPlan);
  const typedPlan = real.plan.map((m) =>
    (rowLevel(m) >= 10 ? { ...m, items: [...m.items.filter((i) => i.kind !== "PRACTICE"), { ...typedWriting, lineageId: `u-write-${m.lineageId}` }] } : m)
  );
  const easyPlan = real.plan.map((m) =>
    (rowLevel(m) >= 10 ? { ...m, items: [...m.items.filter((i) => i.kind !== "PRACTICE"), { ...userRead, lineageId: `u-easy-${m.lineageId}`, catalogKey: "EASY_SESSION" as RT.ItemDraft["catalogKey"], method: "WRITING" as RT.PracticeMethod }] } : m)
  );
  check(
    "a typed WRITING practice with no catalog type is production: a Fluent stage keeps it beside the progression's, in the room it leaves, and a plan whose stages from Fluent on hold it keeps Paragon open; a catalog type outside both lists (EASY_SESSION) is neither, whatever its method",
    typedFluent.items.some((i) => i.lineageId === "u-write") &&
      typedFluent.items.filter((i) => i.kind === "PRACTICE").length === 3 &&
      !typedFluent.notes.includes("NO_PRODUCTION_SLOT") &&
      productionPlannedFromFluentOf(typedPlan) &&
      !productionPlannedFromFluentOf(easyPlan),
    json(typedFluent.items.map((i) => [i.catalogKey, i.method, i.notes]))
  );
  const off = ladder4("practices off", stageLadderOf(ik4({ practicesAllowed: false }), learnerIn({ practicesAllowed: false }), names4, mk4));
  const offFe = feasibilityOf(off.plan, judgeIn(learnerIn({ practicesAllowed: false }), off.plan));
  check(
    "practices switched off: no practice, productionPlannedFromFluent false, and the plan says Paragon needs them",
    off.plan.every((m) => !m.items.some((i) => i.kind === "PRACTICE")) && !productionPlannedFromFluentOf(off.plan) && offFe.basis.includes("Paragon needs practice that uses what you know from Fluent on. Allow practices to keep it open.")
  );
  // A tight week slows the writing (a later date) before a practice drops under its floor; with no room even then, OVER.
  // Four new Domains on a source of 12 a week (8.4 at Steady): 10 h a week hold it; 1.25 h don't while the cards are being written.
  const quad = ["a", "b", "c", "d"];
  const quadIn = (hours: number) => in4({ hoursPerWeek: hours, sourceRate: 12 }, [scope4(quad, [], 12)]);
  const roomy = ladder4("roomy", stageLadderOf(ik4({ domainIds: quad, hoursPerWeek: 10 }), quadIn(10), names4, mk4));
  const tight = ladder4("tight", stageLadderOf(ik4({ domainIds: quad, hoursPerWeek: 1.25 }), quadIn(1.25), names4, mk4));
  const tightFe = feasibilityOf(tight.plan, judgeIn(quadIn(1.25), tight.plan));
  console.log(`  capacity: 10 h → ${roomy.rate} a week, D_real ${dd4(roomy.dateCheck?.D_real)}; 1.25 h → ${tight.rate} a week, D_real ${dd4(tight.dateCheck?.D_real)}, time ${tightFe.milestones.map((m) => m.time.verdict).join(" ")}`);
  check(
    "a tight week slows the writing first (8.4 → 3.95 a week): a later realistic date, every practice at its band floor or above, and no stage reads OVER",
    roomy.rate === 8.4 &&
      tight.rate === 3.95 &&
      tight.dateCheck!.D_real! > roomy.dateCheck!.D_real! &&
      tightFe.milestones.every((m) => m.time.verdict !== "OVER") &&
      tight.plan.every((m) => m.items.filter((i) => i.kind === "PRACTICE").every((i) => RT.PRACTICE_BANDS.indexOf(i.durationBand!) >= RT.PRACTICE_BANDS.indexOf(m.stage === "FLUENT" || m.stage === "MASTERED" || m.stage === "BETWEEN" ? "D45" : m.stage === "RETAINED" ? "D30" : "D15"))),
    json([tight.rate, dd4(tight.dateCheck?.D_real), shape(tight.plan)])
  );
  const noneIn = learnerIn({ hoursPerWeek: 1, throughput: tp4({ adherence: 0.3 }) });
  const none = ladder4("no room", stageLadderOf(ik4({ hoursPerWeek: 1 }), noneIn, names4, mk4));
  const noneFe = feasibilityOf(none.plan, judgeIn(noneIn, none.plan));
  check(
    "… with no room even with no new cards, the writing isn't slowed (it can't help) and the time check reads OVER ('cut a practice or raise hours')",
    none.rate === 4.2 && noneFe.over && noneFe.milestones.some((m) => m.time.verdict === "OVER" && m.time.basis.some((b) => b.endsWith("cut a practice or raise hours."))),
    json(noneFe.milestones.map((m) => m.time.verdict))
  );
  // CODE labels: catalogLabelOf(key, fill) exactly, and they follow a renamed Domain.
  const labels = real.plan.flatMap((m) => m.items.filter((i) => i.origin === "CODE" && i.catalogKey && i.kind === "PRACTICE").map((i) => [i.label, catalogLabelOf(i.catalogKey!, { track: "FIELD", domains: ["Alpha", "Beta"] as unknown as RT.DomainName[] })]));
  check("every CODE label equals its catalog template's render", labels.length > 0 && labels.every(([a, b]) => a === b), json(labels.slice(0, 2)));
  const renamed = real.plan.map((m) => ({ ...m, items: m.items.map((i) => (i.kind === "DOMAIN" && i.domainId === "a" ? { ...i, label: "Algebra" } : i)) }));
  const refitted = fitPlan(renamed, judgeIn(learnerIn(), real.plan));
  check(
    "… and re-renders after a Domain rename (titles too)",
    refitted[2].items.find((i) => i.catalogKey === "PROBLEM_SETS")?.label === "Problem sets: Algebra, Beta" && refitted[3].items.find((i) => i.catalogKey === "EXPLAIN_IT")?.label === "Explain it in your own words: Algebra, Beta" && refitted[2].title === "Retained: Algebra, Beta to level 8+",
    json([refitted[2].title, refitted[2].items.map((i) => i.label)])
  );
}

console.log("— rev 4: judging a depth plan, Start and the snapshot —");
{
  const real = ladder4("learner", stageLadderOf(ik4({}), learnerIn(), names4, mk4));
  const inp = judgeIn(learnerIn(), real.plan);
  const fe = feasibilityOf(real.plan, inp);
  const verdicts = fe.milestones.flatMap((m) => m.knowledge.map((k) => k.verdict));
  check("a depth plan is never FITTED: every count is judged against the reach model (FITS on the realistic plan)", verdicts.length === 12 && verdicts.every((v) => v === "FITS"), json(verdicts));
  const words = JSON.stringify(fe).match(/Fitted|FITTED|Kept at/g);
  check("no 'Fitted' (or 'Kept at') anywhere in a depth plan's checks", words === null, json(words));
  check("the checks carry the date check and the reach model's version", fe.dateCheck?.verdict === "FITS" && fe.reachModel === RT.REACH_MODEL_VERSION && fe.basis[0].startsWith("Expected reach follows the app's review rules"));
  const rc = fe.milestones[5].knowledge[0];
  check("the final stage's check says how clean entry counts", rc.basis.some((b) => b.startsWith("At level 12 a card counts once it got there at the first try")) && rc.basis.includes("Multiple-choice cards don't count: recognising an answer isn't recalling it."));
  const mc = in4({}, [scope4(["a", "b"], [...card4(20, 6, () => 3, "a", { recall: false }), ...card4(20, 6, () => 3, "b", { recall: false })])]);
  const mcPlan = ladder4("multiple choice", stageLadderOf(ik4({}), mc, names4, mk4));
  check("multiple-choice cards don't count: 20 at level 6 in each Domain leave the coverage at the floor and the baselines at 0", mcPlan.coverage!.every((c) => c.live === 0 && c.nonRecall === 20 && c.n === 25) && mcPlan.plan.every((m) => cardMeasures(m).every((x) => x.baseline === 0)));
  const st = refitForStart(real.plan[1], real.plan, inp);
  const snap = startSnapshotOf(st.milestone, st, inp, T4);
  check(
    "the StartSnapshot (Familiar) carries the reach model at Start (version 2; p 0.85, pLong 0.80, c 1, ρ 0) and each Domain's new cards still needed (writeNeedOf(25, 0) = 33 each at WRITE_MARGIN 1.3), the weekly needs summing to the total",
    snap.reachModel === RT.REACH_MODEL_VERSION &&
      snap.pStart === 0.85 &&
      snap.pLongStart === 0.8 &&
      snap.cStart === 1 &&
      snap.rhoStart === 0 &&
      json(snap.newNeededByDomain) === json({ a: 33, b: 33 }) &&
      snap.newNeededStart === 66 &&
      snap.weeks.every((w) => Math.abs(Object.values(w.needRateByDomain ?? {}).reduce((s, x) => s + x, 0) - w.needRate) < 1e-9),
    json({ ...snap, weeks: snap.weeks.length, feasibility: null })
  );
  // Every Start path of a depth plan (the count gate, each gate, BETWEEN, the final) carries the reach model and the per-Domain
  // need R6's quests read (lens 2's gap 8: no stage falls back to the priors or to rev 3's needRate).
  const snaps = real.plan.map((m) => {
    const r = refitForStart(m, real.plan, inp);
    return { stage: m.stage, s: startSnapshotOf(r.milestone, r, inp, T4), ids: cardMeasures(m).map((x) => x.scope.domainIds![0]).sort() };
  });
  check(
    "every stage's StartSnapshot (PART, the gates, BETWEEN, Mastered) carries reachModel 2, pLong, c and ρ at Start, and newNeededByDomain and needRateByDomain for each of its Domains",
    snaps.length === 6 &&
      snaps.every(
        ({ s, ids }) =>
          s.reachModel === RT.REACH_MODEL_VERSION &&
          s.pLongStart === 0.8 &&
          s.cStart === 1 &&
          s.rhoStart === 0 &&
          json(Object.keys(s.newNeededByDomain ?? {}).sort()) === json(ids) &&
          s.weeks.every((w) => json(Object.keys(w.needRateByDomain ?? {}).sort()) === json(ids))
      ),
    json(snaps.map(({ stage, s }) => [stage, s.reachModel, s.newNeededByDomain]))
  );
  // A count gate's ⬡6 (lead's ruling, PART pay): it holds the app's retrieval practice on the starter, and on a skeleton (items NONE,
  // where R4 copies no Gemini slot practice into it) once fitPlan syncs the stage shape, so the timeline's ⬡6 on its day is the
  // practice the plan holds (the Start sheet then says it rests on a practice the app added).
  const skeleton = ladder4("learner skeleton", stageLadderOf(ik4({}), learnerIn(), names4, mk4, { items: "NONE" }));
  const fittedSkeleton = fitPlan(skeleton.plan, judgeIn(learnerIn(), skeleton.plan));
  const partPractice = (m: RT.MilestoneDraft) => m.items.filter((i) => i.kind === "PRACTICE").map((i) => `${i.catalogKey}:${i.origin}:${i.notes.join("")}`);
  const learnerMt = motivationTimelineOf(real.plan, inp);
  check(
    "a count gate holds the app's retrieval practices (its gate's: recall drills and the partner, origin CODE, STUDY_ADDED; contracts §20) on the starter and on a fitted skeleton, and the timeline counts its ⬡6 on day 55",
    real.plan[0].stage === "PART" &&
      json(partPractice(real.plan[0])) === json(["RECALL_DRILLS:CODE:STUDY_ADDED", "READ_AND_CARD:CODE:STUDY_ADDED"]) &&
      skeleton.plan[0].items.every((i) => i.kind !== "PRACTICE") &&
      json(partPractice(fittedSkeleton[0])) === json(["RECALL_DRILLS:CODE:STUDY_ADDED", "READ_AND_CARD:CODE:STUDY_ADDED"]) &&
      learnerMt.payDays[0] === 55,
    json([partPractice(real.plan[0]), partPractice(fittedSkeleton[0]), learnerMt.payDays])
  );
  const calIn = learnerIn({ reach: undefined, calibrating: undefined, throughput: tp4({ p: null }) });
  const calSnap = startSnapshotOf(st.milestone, st, calIn, T4);
  check("while calibrating, p_start is the prior 0.80 (never 1), flagged", calSnap.pStart === RT.P_PRIOR && calSnap.pCalibrating && calSnap.calibrating!.includes("p"));
  const carried = real.plan.map((m, i) => (i === 0 ? { ...m, status: "STARTED" as RT.MilestoneStatus } : m));
  const cfe = feasibilityOf(carried, inp);
  check("a started stage is reported (its load counts) but never blocks the rest", cfe.milestones.some((m) => m.lineageId === carried[0].lineageId) && !cfe.impossible);
}

console.log("— rev 4: track plans (F-R4-10) —");
{
  const body = ladder4(
    "body",
    stageLadderOf(ik4({ aim: "Walk 10 km easily", fieldId: null, track: "BODY", domainIds: [], constraints: "knee injury, no running", dateMode: "CHOSEN" }), in4({ trackArea: true, depth: null }, []), names4, mk4)
  );
  eq(
    "a 12-month BODY plan: five stages at 20% steps of its open days (Sundays), STAGE_1..STAGE_5, titled '{aim} · stage k of n'",
    body.plan.map((m) => [m.stage, dd4(m.dueDay), m.title]),
    [
      ["STAGE_1", 76, "Walk 10 km easily · stage 1 of 5"],
      ["STAGE_2", 146, "Walk 10 km easily · stage 2 of 5"],
      ["STAGE_3", 223, "Walk 10 km easily · stage 3 of 5"],
      ["STAGE_4", 293, "Walk 10 km easily · stage 4 of 5"],
      ["STAGE_5", 365, "Walk 10 km easily · stage 5 of 5"],
    ]
  );
  check(
    "with constraints the starter places only easy, mobility and technique sessions (and the progression's setting up on the first stage), no full attempt or performance check, and HEALTH_LINE on every stage",
    body.plan.every(
      (m, i) =>
        m.notes.includes("HEALTH_LINE") &&
        m.items.some((x) => x.kind === "PRACTICE") &&
        m.items.every((x) => (x.kind === "PRACTICE" && ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"].includes(x.catalogKey ?? "")) || (i === 0 && x.catalogKey === "SET_UP"))
    ),
    json(body.plan.map((m) => m.items.map((i) => i.catalogKey)))
  );
  // A CARE plan asks whatever its words (contracts §19, decision 1): the user's "Nothing to avoid" lets the performance check in.
  const short = ladder4("125 days", stageLadderOf(answeredIntake(ik4({ aim: "Keep the house running", fieldId: null, track: "CARE", domainIds: [], targetDay: at4(125), dateMode: "CHOSEN" })), in4({ trackArea: true, depth: null, targetDay: at4(125) }, []), names4, mk4));
  eq(
    "the merge rule on a 125-day track plan keeps two rows, which climb consecutive stages from the base (the lead's ruling 4: STAGE_1 then STAGE_2, never a jump to STAGE_5), the last with its performance check (the card answered)",
    [shape(short.plan), finalOf(short.plan).items.some((i) => i.catalogKey === "PERFORMANCE_CHECK")],
    [["STAGE_1@76", "STAGE_2@125"], true]
  );
  const mt = motivationTimelineOf(short.plan, in4({ trackArea: true, depth: null, targetDay: at4(125) }, []));
  eq("… a track plan ranks its k-th kept stage k, and can't give Paragon in 125 days", [mt.rankDays, mt.paragonDay], [[76, 125], null]);
  const tiny = ladder4("40 days", stageLadderOf(ik4({ aim: "Play a piece", fieldId: null, track: "CRAFT", domainIds: [], targetDay: at4(40), dateMode: "CHOSEN" }), in4({ trackArea: true, depth: null, targetDay: at4(40) }, []), names4, mk4));
  check("a 40-day track plan is one stage ('stage 1 of 1'), dated on the aim's date", tiny.plan.length === 1 && tiny.plan[0].title === "Play a piece · stage 1 of 1" && tiny.plan[0].dueDay === at4(40));
  check("a track ladder has no date check (its date is the user's)", body.dateCheck === null && dateCheckOf(body.plan, in4({ trackArea: true, depth: null }, []), "CHOSEN", at4(365)).verdict === "FITS");
}

console.log("— confirm to unlock (contracts §19): the code-built plan honours the gate —");
{
  // The verifier's finding (hardening round, ver.still_open #2): starterLadder and stageLadderOf were called without the
  // constraint exclusions, so "No timed practice" still placed Timed practice. Every kind code places now goes through the gate.
  const kindsOf = (plan: readonly RT.MilestoneDraft[]): string[][] => plan.map((m) => m.items.filter((i) => i.decision !== "REMOVED" && i.catalogKey).map((i) => i.catalogKey as string));
  const examIk = ik4({ examLabel: "JLPT N2", exam: true, examDay: at4(180) });
  const examIn = learnerIn({ examDay: at4(180) });
  const control = ladder4("exam", stageLadderOf(examIk, examIn, names4, mk4));
  const noTimed = ladder4("no timed", stageLadderOf(examIk, examIn, names4, mk4, { excluded: ["TIMED_PRACTICE"] }));
  const roleOk = (rows: string[][]) => rows.every((r, i) => control.plan[i].items.every((x) => x.kind !== "PRACTICE") || r.some((k) => ["RECALL_DRILLS", "READ_AND_CARD", "LISTEN_AND_REPEAT", "EXPLAIN_IT", "PROBLEM_SETS", "WRITING_PRACTICE", "MISTAKE_REVIEW", "SAY_IT_ALOUD", "BUILD_SOMETHING", "RUN_THROUGHS"].includes(k)));
  // A dated exam's stage holds the exam itself and its rehearsal (contracts §20.10, point 1); an undated one, the mock test.
  const undated = ladder4("undated exam", stageLadderOf(ik4({ examLabel: "JLPT N2", exam: true }), learnerIn(), names4, mk4));
  check(
    "control: the exam ladder places Timed practice and the exam (EXAM_DAY); with no day, a Mock test on the last stage",
    kindsOf(control.plan).flat().includes("TIMED_PRACTICE") && kindsOf(control.plan).flat().includes("EXAM_DAY") && kindsOf(undated.plan)[undated.plan.length - 1].includes("MOCK_TEST"),
    json([kindsOf(control.plan), kindsOf(undated.plan)])
  );
  check(
    "stageLadderOf with excluded TIMED_PRACTICE: no row holds it, and every stage still holds its retrieval or production practice",
    !kindsOf(noTimed.plan).flat().includes("TIMED_PRACTICE") && roleOk(kindsOf(noTimed.plan)),
    json(kindsOf(noTimed.plan))
  );
  const starter = starterLadder(examIk, examIn, names4, mk4, { excluded: ["TIMED_PRACTICE", "MOCK_TEST"] });
  check("starterLadder (\"Build from my numbers\") passes them on: no Timed practice, no Mock test", starter.length > 0 && !kindsOf(starter).flat().some((k) => k === "TIMED_PRACTICE" || k === "MOCK_TEST"), json(kindsOf(starter)));
  const viaGate = ladder4("gate", stageLadderOf(examIk, examIn, names4, mk4, { gate: { blocked: ["RECALL_DRILLS", "EXPLAIN_IT", "TIMED_PRACTICE"] } }));
  check(
    "the caller's gate blocks like `excluded`: a stage's required practice is the next kind of its role it leaves in (Read and card, Problem sets)",
    !kindsOf(viaGate.plan).flat().some((k) => k === "RECALL_DRILLS" || k === "EXPLAIN_IT" || k === "TIMED_PRACTICE") && kindsOf(viaGate.plan).flat().includes("READ_AND_CARD") && roleOk(kindsOf(viaGate.plan)),
    json(kindsOf(viaGate.plan))
  );
  // The user's stored AVOID is honoured with no gate passed: realism works out the intake's own (activityGateOf).
  const avoided = ladder4(
    "avoid",
    stageLadderOf({ ...examIk, activities: { key: "k1-00000000", kinds: { TIMED_PRACTICE: { verdict: "AVOID", day: T4, reason: "" }, MOCK_TEST: { verdict: "AVOID", day: T4, reason: "" } } } }, examIn, names4, mk4)
  );
  check("a stored AVOID (never stale) keeps its kind out with no gate passed", !kindsOf(avoided.plan).flat().some((k) => k === "TIMED_PRACTICE" || k === "MOCK_TEST"), json(kindsOf(avoided.plan)));
  // A re-fit never adds a blocked required practice: the stage that lost its code-added practice gets the next kind of its role.
  const bare = control.plan.map((m) => ({ ...m, items: m.items.filter((i) => !(i.kind === "PRACTICE" && (i.notes.includes("STUDY_ADDED") || i.notes.includes("PRODUCTION_ADDED")))) }));
  const fitIn = judgeIn(examIn, control.plan);
  const refitAll = fitPlan(bare, fitIn);
  const refitGated = fitPlan(bare, fitIn, { excluded: ["RECALL_DRILLS", "EXPLAIN_IT"] });
  check(
    "fitPlan re-adds each stage's practice, and with the gate's blocked kinds passed never one of them (Read and card, Problem sets instead)",
    kindsOf(refitAll).flat().includes("RECALL_DRILLS") && !kindsOf(refitGated).flat().some((k) => k === "RECALL_DRILLS" || k === "EXPLAIN_IT") && kindsOf(refitGated).flat().includes("READ_AND_CARD"),
    json([kindsOf(refitAll), kindsOf(refitGated)])
  );
  const redated = refit(bare, fitIn, { excluded: ["RECALL_DRILLS", "EXPLAIN_IT"] });
  check("…refit (a re-date) too", !kindsOf(redated).flat().some((k) => k === "RECALL_DRILLS" || k === "EXPLAIN_IT"), json(kindsOf(redated)));
}
{
  // Track plans: the gate replaces F-R4-17's non-empty-constraints test. The safety-gaps round (contracts §19, the lead's
  // decisions 1 and 2): every BODY or CARE plan asks whatever its words, and only the card's answer unlocks.
  const kindsOf = (plan: readonly RT.MilestoneDraft[]): string[][] => plan.map((m) => m.items.filter((i) => i.decision !== "REMOVED" && i.catalogKey).map((i) => i.catalogKey as string));
  const trackIn = in4({ trackArea: true, depth: null, dateMode: "CHOSEN" }, []);
  const body = (o: Partial<RT.Intake>) => ik4({ aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [], dateMode: "CHOSEN", depth: null, ...o });
  const plain = ladder4("body plain", stageLadderOf(body({}), trackIn, {}, mk4));
  // The practice progression (contracts §20, §20.11) through the gate: while the card waits, each stage's focus gives way
  // to the stage before's placeable candidate at or above its rung (Technique for Longer and Harder), else a safe stand-in;
  // the easy session is kept, setting up opens the plan.
  const SAFE_ROWS = [["EASY_SESSION", "MOBILITY_SESSION", "SET_UP"], ["TECHNIQUE_SESSION", "EASY_SESSION"], ["TECHNIQUE_SESSION", "EASY_SESSION"], ["TECHNIQUE_SESSION", "EASY_SESSION"], ["TECHNIQUE_SESSION", "EASY_SESSION"]];
  const UNLOCKED = [
    ["EASY_SESSION", "MOBILITY_SESSION", "SET_UP"],
    ["TECHNIQUE_SESSION", "EASY_SESSION"],
    ["LONGER_SESSION", "TECHNIQUE_SESSION", "EASY_SESSION"],
    ["HARDER_SESSION", "LONGER_SESSION", "EASY_SESSION"],
    ["HARDER_SESSION", "LONGER_SESSION", "EASY_SESSION", "FULL_ATTEMPT", "PERFORMANCE_CHECK"],
  ];
  eq("decision 1: a BODY plan with no constraints and no cue asks too — only the safe sessions (each stage's focus stood in for), no full attempt or performance check", kindsOf(plain.plan), SAFE_ROWS);
  eq("…after the user's “Nothing to avoid”: the climb (Longer from the third stage, Harder from the fourth, each carrying the one before, the easy session kept), the full attempt and the performance check", kindsOf(ladder4("body plain answered", stageLadderOf(answeredIntake(body({})), trackIn, {}, mk4)).plan), UNLOCKED);
  eq("a cue the parser reads nothing from ('Running causes me knee pain.'): only the safe sessions, no performance check", kindsOf(ladder4("cue", stageLadderOf(body({ constraints: "Running causes me knee pain." }), trackIn, {}, mk4)).plan), SAFE_ROWS);
  eq("a cue in the aim alone ('Run again after knee surgery', no constraints) gates the same", kindsOf(ladder4("aim cue", stageLadderOf(body({ aim: "Run again after knee surgery" }), trackIn, {}, mk4)).plan), SAFE_ROWS);
  eq("words the app can't read ('Đau đầu gối khi chạy') gate the same", kindsOf(ladder4("vi", stageLadderOf(body({ constraints: "Đau đầu gối khi chạy" }), trackIn, {}, mk4)).plan), SAFE_ROWS);
  eq("cue-less constraints ('Evenings only') gate the same", kindsOf(ladder4("evenings", stageLadderOf(body({ constraints: "Evenings only" }), trackIn, {}, mk4)).plan), SAFE_ROWS);
  const cued = body({ constraints: "Running causes me knee pain." });
  const key = RT.cueKeyOf(RT.cueTextsOf(cued), "BODY");
  /** AVOIDs stored with no answer to the card (the card still asks: every gated kind waits). */
  const avoidedOnly = (kinds: readonly string[]): RT.Intake => ({
    ...cued,
    activities: { key, kinds: Object.fromEntries(kinds.map((kind) => [kind, { verdict: "AVOID" as const, day: T4, reason: "Running causes me knee pain." }])) },
  });
  eq(
    "after the user's answer ticking Strength (the card listed Longer and the performance check, left unticked): exactly those are placed where the starter places them",
    kindsOf(ladder4("answered", stageLadderOf(answeredIntake(cued, ["STRENGTH_SESSION"]), trackIn, {}, mk4)).plan),
    UNLOCKED
  );
  eq("an answer given under other words is stale: the kinds it released wait again", kindsOf(ladder4("stale", stageLadderOf(answeredIntake(cued, [], "k1-00000000"), trackIn, {}, mk4)).plan), SAFE_ROWS);
  eq(
    "a per-kind FINE stored by the earlier card unlocks nothing (it may have been a row the user left unticked)",
    kindsOf(ladder4("old fine", stageLadderOf({ ...cued, activities: { key, kinds: { LONGER_SESSION: { verdict: "FINE", day: T4, reason: "" }, PERFORMANCE_CHECK: { verdict: "FINE", day: T4, reason: "" } } } }, trackIn, {}, mk4)).plan),
    SAFE_ROWS
  );
  eq(
    "an AVOID on a safe kind (Easy) is honoured too: the next safe kind takes its place",
    kindsOf(ladder4("avoid easy", stageLadderOf(avoidedOnly(["EASY_SESSION"]), trackIn, {}, mk4)).plan),
    [["MOBILITY_SESSION", "TECHNIQUE_SESSION", "SET_UP"], ["TECHNIQUE_SESSION", "MOBILITY_SESSION"], ["TECHNIQUE_SESSION", "MOBILITY_SESSION"], ["TECHNIQUE_SESSION", "MOBILITY_SESSION"], ["TECHNIQUE_SESSION", "MOBILITY_SESSION"]]
  );
  const care = ik4({ aim: "Support Mum's care at home", fieldId: null, track: "CARE", domainIds: [], dateMode: "CHOSEN", depth: null, constraints: "No visits on weekdays, phone calls only." });
  eq(
    "decision 2: CARE places its own safe kinds while the card waits — planning the week and keeping a log on every stage; no care session and no performance check",
    kindsOf(ladder4("care", stageLadderOf(care, trackIn, {}, mk4)).plan),
    [["PLAN_AHEAD", "KEEP_A_LOG", "SET_UP"], ["KEEP_A_LOG", "PLAN_AHEAD"], ["PLAN_AHEAD", "KEEP_A_LOG"], ["PLAN_AHEAD", "KEEP_A_LOG"], ["PLAN_AHEAD", "KEEP_A_LOG"]]
  );
  eq("…a CARE plan with no constraints at all asks the same", kindsOf(ladder4("care plain", stageLadderOf({ ...care, constraints: null }, trackIn, {}, mk4)).plan), kindsOf(ladder4("care again", stageLadderOf(care, trackIn, {}, mk4)).plan));
  eq(
    "…after the user's answer leaving Check-in ticked (the parser pre-ticked it): Set time is placed on every stage, Check-in never (Set time, the stage's next type, in its place), the admin session from the fourth with the log kept, the performance check on the last stage",
    kindsOf(ladder4("care answered", stageLadderOf(answeredIntake(care, ["CHECK_IN"]), trackIn, {}, mk4)).plan),
    [["SET_TIME", "KEEP_A_LOG", "SET_UP"], ["SET_TIME", "KEEP_A_LOG"], ["SET_TIME", "KEEP_A_LOG"], ["ADMIN_SESSION", "SET_TIME", "KEEP_A_LOG"], ["SET_TIME", "ADMIN_SESSION", "KEEP_A_LOG", "PERFORMANCE_CHECK"]]
  );
  eq(
    "decision 1: a CRAFT plan asks only on a cue — a plain one is built as before; 'Wrist tendinitis, can't play more than 20 minutes.' places the technique session alone, with no performance check",
    [
      kindsOf(ladder4("craft", stageLadderOf(ik4({ aim: "Play a piece on the piano", fieldId: null, track: "CRAFT", domainIds: [], dateMode: "CHOSEN", depth: null }), trackIn, {}, mk4)).plan),
      kindsOf(ladder4("craft cue", stageLadderOf(ik4({ aim: "Play a piece on the piano", fieldId: null, track: "CRAFT", domainIds: [], dateMode: "CHOSEN", depth: null, constraints: "Wrist tendinitis, can't play more than 20 minutes." }), trackIn, {}, mk4)).plan),
    ],
    [
      [
        ["SLOW_DRILLS", "TECHNIQUE_SESSION", "SET_UP"],
        ["SLOW_DRILLS", "TECHNIQUE_SESSION"],
        ["RUN_THROUGHS", "SLOW_DRILLS", "TECHNIQUE_SESSION"],
        ["WITH_A_PARTNER", "RUN_THROUGHS", "SLOW_DRILLS"],
        ["RUN_THROUGHS", "WITH_A_PARTNER", "SLOW_DRILLS", "FULL_ATTEMPT", "PERFORMANCE_CHECK"],
      ],
      [["TECHNIQUE_SESSION", "SET_UP"], ["TECHNIQUE_SESSION"], ["TECHNIQUE_SESSION"], ["TECHNIQUE_SESSION"], ["TECHNIQUE_SESSION"]],
    ]
  );
  eq(
    "trackStarterKindsOf is the progression's practices on that stage: a blocked focus takes the stage's next placeable type (Strength for Longer; CARE's admin for set time), then the stage before's at or above its rung (Technique), then the track's safe stand-in (planning the week and the log)",
    [
      trackStarterKindsOf("BODY", 3, new Set(["LONGER_SESSION"])),
      trackStarterKindsOf("BODY", 3, new Set(["EASY_SESSION", "LONGER_SESSION"])),
      trackStarterKindsOf("CARE", 3, new Set(["SET_TIME", "CHECK_IN"])),
      trackStarterKindsOf("BODY", 1, new Set()),
      trackStarterKindsOf("BODY", 3, new Set(["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION"])),
      trackStarterKindsOf("CARE", 3, new Set(["SET_TIME", "CHECK_IN", "ADMIN_SESSION"])),
    ],
    [
      ["STRENGTH_SESSION", "TECHNIQUE_SESSION", "EASY_SESSION"],
      ["STRENGTH_SESSION", "TECHNIQUE_SESSION"],
      ["ADMIN_SESSION", "PLAN_AHEAD", "KEEP_A_LOG"],
      ["EASY_SESSION", "MOBILITY_SESSION"],
      ["TECHNIQUE_SESSION", "EASY_SESSION"],
      ["PLAN_AHEAD", "KEEP_A_LOG"],
    ]
  );
  check(
    "blockedKindsOf: the caller's gate and `excluded` together; without a gate, the intake's own (a BODY plan waits on its card, whatever its words; after “Nothing to avoid” only the Mock test the card never listed, with no exam, still waits)",
    json([...blockedKindsOf(null, { gate: { blocked: ["HARDER_SESSION"] }, excluded: ["MOCK_TEST"] })].sort()) === json(["HARDER_SESSION", "MOCK_TEST"]) &&
      blockedKindsOf(cued).has("LONGER_SESSION") &&
      blockedKindsOf(body({})).has("LONGER_SESSION") &&
      json([...blockedKindsOf(answeredIntake(body({})))]) === json(["MOCK_TEST"]),
    json([...blockedKindsOf(answeredIntake(body({})))])
  );
  // syncTrackStarter (R4's re-sync after the answer): only what the answer changed is added; nothing the user removed comes back.
  const gated = ladder4("gated", stageLadderOf(cued, trackIn, {}, mk4)).plan;
  const since = [...blockedKindsOf(cued)];
  const synced = syncTrackStarter(gated, answeredIntake(cued, ["STRENGTH_SESSION"]), mk4, { since, input: trackIn });
  const sortedRows = (rows: string[][]) => json(rows.map((r) => [...r].sort()));
  check(
    "syncTrackStarter after the answer released the climb and the check: each stage holds what a fresh build of the answered plan places (Longer from the third, Harder from the fourth, the full attempt and the check on the last); the stand-ins leave",
    sortedRows(kindsOf(synced)) === sortedRows(UNLOCKED) && synced.every((m) => m.items.filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED").length <= RT.PRACTICES_PER_MILESTONE),
    json(kindsOf(synced))
  );
  const removed = gated.map((m, i) => (i === 2 ? { ...m, items: [...m.items, { ...m.items[0], lineageId: "gone", catalogKey: "LONGER_SESSION" as const, decision: "REMOVED" as const }] } : m));
  check(
    "…a stage where the user removed Longer gets none back; an unchanged gate adds nothing",
    !kindsOf(syncTrackStarter(removed, answeredIntake(cued, ["STRENGTH_SESSION"]), mk4, { since, input: trackIn }))[2].includes("LONGER_SESSION") && json(kindsOf(syncTrackStarter(gated, cued, mk4, { since, input: trackIn }))) === json(kindsOf(gated))
  );
  check("…a Field plan comes back as it was", json(syncTrackStarter(gated, { ...cued, fieldId: "f1" }, mk4, {})) === json(gated));
  check("the realism file has no bodySafeOf left (the gate holds F-R4-17's rule)", !/const bodySafeOf\b/.test(readFileSync(join(__dirname, "../src/lib/roadmap-realism.ts"), "utf8")));
}

console.log("— the practice progression on every built plan (contracts §20; R2) —");
{
  // Code owns the practice progression on every plan path. A plan R2 builds or re-syncs holds, on every DRAFT stage, exactly
  // what roadmap-catalog's progressionOf places there (planProgressionOf reads the plan's chain: held rows held, accepted and
  // started rows carried, the exam's stage, Gemini's picks), and that progression keeps every rule progressionViolationsOf
  // checks (the carry and the climb, the escalation, the exam and last-stage placement, the gate, the caps). Read here at
  // each stage's own room (its live practices), so the comparison is exact; the room itself is the budget's (checked below).
  const live = (m: RT.MilestoneDraft) => m.items.filter((i) => i.decision !== "REMOVED" && !!i.catalogKey);
  const livePractices = (m: RT.MilestoneDraft) => live(m).filter((i) => i.kind === "PRACTICE");
  const kindsOfRow = (m: RT.MilestoneDraft) => live(m).map((i) => i.catalogKey as string).sort();
  const wantOf = (sp: Progression["stages"][number]) => [...sp.practices, ...sp.steps, ...(sp.checkpoint ? [sp.checkpoint] : [])].map((x) => x.kind as string).sort();
  const trackOf = (intake: RT.Intake): CatalogTrack => (intake.fieldId != null ? "FIELD" : intake.track);
  /** Whether the gate leaves the track a practice to place (it always does on a track: its safe kinds; on a Field plan unless every kind is held). */
  const placeableLeft = (intake: RT.Intake, blocked: ReadonlySet<string>) =>
    CATALOG.some((e) => e.slot === "PRACTICE" && e.tracks.includes(trackOf(intake)) && !e.codeOnly && !e.examOnly && !blocked.has(e.key));
  /** Every breach of a plan: a DRAFT stage whose kinds aren't its progression's, one with no practice the gate leaves, a placed kind the gate holds, a lastStageOnly kind early, and every progressionViolationsOf line. */
  const breachesOf = (plan: readonly RT.MilestoneDraft[], intake: RT.Intake, input: RT.RealismInput, gate?: { blocked: CatalogKey[] }, picks?: unknown): string[] => {
    const pp = planProgressionOf(plan, intake, input, { gate, picks, room: (m) => livePractices(m).length || null });
    const blocked = blockedKindsOf(intake, { gate });
    const out: string[] = [];
    const lastLive = pp.rows.map((m, k) => (pp.progression.stages[k].held ? -1 : k)).filter((k) => k >= 0).pop();
    pp.rows.forEach((m, k) => {
      const sp = pp.progression.stages[k];
      if (sp.held) {
        if (live(m).length) out.push(`HELD ${m.stage} holds ${kindsOfRow(m)}`);
        return;
      }
      for (const i of live(m)) {
        if (m.status === "DRAFT" && blocked.has(i.catalogKey as CatalogKey)) out.push(`GATE ${m.stage}: ${i.catalogKey}`);
        if (catalogEntryOf(i.catalogKey)?.lastStageOnly && k !== lastLive) out.push(`LAST ${m.stage}: ${i.catalogKey}`);
      }
      if (m.status !== "DRAFT") return;
      if (json(kindsOfRow(m)) !== json(wantOf(sp))) out.push(`ROWS ${m.stage}@${k}: ${kindsOfRow(m).join(" ")} ≠ ${wantOf(sp).join(" ")}`);
      if (input.practicesAllowed && placeableLeft(intake, blocked) && livePractices(m).length === 0) out.push(`EMPTY ${m.stage}@${k}`);
    });
    out.push(...progressionViolationsOf(pp.input, pp.progression));
    return out;
  };

  // Field plans: the shapes (a count gate and a split; an exam with and without its day; a lower depth; practices off; few
  // hours; a held Foundation) × the gate (nothing, each practice kind avoided alone, every retrieval kind, every production
  // kind but one, every Mastered candidate).
  const FIELD_PRACTICES = CATALOG.filter((e) => e.slot === "PRACTICE" && e.tracks.includes("FIELD")).map((e) => e.key);
  const fieldGates: CatalogKey[][] = [
    [],
    ...FIELD_PRACTICES.map((k) => [k]),
    ["RECALL_DRILLS", "READ_AND_CARD", "LISTEN_AND_REPEAT"],
    ["EXPLAIN_IT", "PROBLEM_SETS", "WRITING_PRACTICE", "MISTAKE_REVIEW", "SAY_IT_ALOUD", "BUILD_SOMETHING"],
    ["BUILD_SOMETHING", "WITH_A_PARTNER", "RUN_THROUGHS"],
  ];
  const fieldCases: { label: string; intake: RT.Intake; input: RT.RealismInput }[] = [
    { label: "learner", intake: ik4({}), input: learnerIn() },
    { label: "pack (held stages)", intake: packIk, input: packIn },
    { label: "exam on day 180", intake: ik4({ examLabel: "JLPT N2", exam: true, examDay: at4(180) }), input: learnerIn({ examDay: at4(180) }) },
    { label: "exam with no day", intake: ik4({ examLabel: "JLPT N2", exam: true }), input: learnerIn() },
    { label: "depth 8", intake: ik4({ depth: 8 }), input: learnerIn({ depth: 8 }) },
    { label: "depth 10, a CHOSEN date", intake: ik4({ depth: 10, dateMode: "CHOSEN", targetDay: at4(400) }), input: learnerIn({ depth: 10, dateMode: "CHOSEN", userDate: at4(400), targetDay: at4(400) }) },
    { label: "practices off", intake: ik4({ practicesAllowed: false }), input: learnerIn({ practicesAllowed: false }) },
    { label: "3 hours a week", intake: ik4({ hoursPerWeek: 3 }), input: learnerIn({ hoursPerWeek: 3 }) },
    { label: "1.5 hours a week", intake: ik4({ hoursPerWeek: 1.5 }), input: learnerIn({ hoursPerWeek: 1.5 }) },
    // The practice families (contracts §20.11): the plan reads the user's answer (Intake.practiceFamily) through R2.
    { label: "a language", intake: ik4({ practiceFamily: "LANGUAGE" }), input: learnerIn() },
    { label: "a performance, an exam on day 180", intake: ik4({ practiceFamily: "PERFORM", examLabel: "ABRSM Grade 5", exam: true, examDay: at4(180) }), input: learnerIn({ examDay: at4(180) }) },
    { label: "building", intake: ik4({ practiceFamily: "BUILD" }), input: learnerIn() },
  ];
  let fieldPlans = 0;
  const fieldBreaches: string[] = [];
  const fieldStable: string[] = [];
  let emptyStages = 0;
  for (const c of fieldCases) {
    for (const blocked of fieldGates) {
      const gate = { blocked };
      const r = stageLadderOf(c.intake, c.input, names4, mk4, { gate });
      if (!r.ok) {
        fieldBreaches.push(`${c.label}: refused ${r.error}`);
        continue;
      }
      fieldPlans += 1;
      const judge = judgeIn(c.input, r.plan);
      for (const b of breachesOf(r.plan, c.intake, judge, gate)) fieldBreaches.push(`${c.label} [${blocked.join(",")}] ${b}`);
      emptyStages += r.plan.filter((m) => !m.notes.includes("HELD_AT_START") && c.input.practicesAllowed && livePractices(m).length === 0).length;
      // The re-sync is stable: a re-fit of the built plan (R4's path on every edit) keeps every stage's kinds.
      if (blocked.length <= 1) {
        const again = fitPlan(r.plan, judge, { intake: c.intake, excluded: blocked });
        if (json(again.map(kindsOfRow)) !== json(r.plan.map(kindsOfRow))) fieldStable.push(`${c.label} [${blocked.join(",")}]`);
      }
    }
  }
  check(
    `every Field plan built (${fieldPlans}: ${fieldCases.length} shapes × ${fieldGates.length} gates) holds the practice progression on every stage, which keeps every rule (carry, climb, escalation, exam and last-stage placement, the gate, the caps)`,
    fieldPlans === fieldCases.length * fieldGates.length && fieldBreaches.length === 0,
    fieldBreaches.slice(0, 6).join(" | ")
  );
  check("…every stage of every one of them carries practice while practices are allowed (the gate always leaves one here)", emptyStages === 0, String(emptyStages));
  // R2 passes the family: a language plan trains listening and speaking, a performance full run-throughs, building builds.
  const famPlan = (family: RT.PracticeFamily) => ladder4(family, stageLadderOf(ik4({ practiceFamily: family }), learnerIn(), names4, mk4)).plan.flatMap((m) => livePractices(m).map((i) => i.catalogKey as string));
  const lang = famPlan("LANGUAGE");
  const perform = famPlan("PERFORM");
  check(
    "the plan's family reaches the progression (planProgressionOf reads it): a language plan says it aloud and works with a partner, a performance plan runs it through",
    ["SAY_IT_ALOUD", "WITH_A_PARTNER"].every((k) => lang.includes(k)) &&
      perform.includes("RUN_THROUGHS") &&
      planProgressionOf(ladder4("language", stageLadderOf(ik4({ practiceFamily: "LANGUAGE" }), learnerIn(), names4, mk4)).plan, ik4({ practiceFamily: "LANGUAGE" }), learnerIn()).input.family === "LANGUAGE",
    json({ lang, perform })
  );
  check("…and a re-fit of each (R4's path on every edit) keeps every stage's kinds (the re-sync is stable)", fieldStable.length === 0, fieldStable.join(" | "));

  // Track plans: five, two (merged) and one stage × the gate as the intake's own words and answers hold it (waiting, “Nothing
  // to avoid”, each gated kind avoided alone, every gated kind avoided, a safe kind avoided).
  const trackIn = (days: number) => in4({ trackArea: true, depth: null, dateMode: "CHOSEN", targetDay: at4(days) }, []);
  const trackIk = (track: Track, o: Partial<RT.Intake> = {}) => ik4({ aim: "Get there", fieldId: null, track, domainIds: [], dateMode: "CHOSEN", depth: null, ...o });
  const trackCases: { label: string; intake: RT.Intake }[] = [
    { label: "BODY", intake: trackIk("BODY", { aim: "Run a sub-50 10K" }) },
    { label: "BODY with a cue", intake: trackIk("BODY", { aim: "Run a sub-50 10K", constraints: "Running causes me knee pain." }) },
    { label: "CARE", intake: trackIk("CARE", { aim: "Support Mum's care at home", constraints: "No visits on weekdays, phone calls only." }) },
    { label: "CRAFT", intake: trackIk("CRAFT", { aim: "Play a piece on the piano" }) },
    { label: "CRAFT with a cue", intake: trackIk("CRAFT", { aim: "Play a piece on the piano", constraints: "Wrist tendinitis, can't play more than 20 minutes." }) },
    { label: "DUTY with an exam", intake: trackIk("DUTY", { aim: "Pass the driving test", examLabel: "the driving test", exam: true }) },
  ];
  let trackPlans = 0;
  const trackBreaches: string[] = [];
  const trackStable: string[] = [];
  let trackEmpty = 0;
  for (const c of trackCases) {
    const gated = cueGatedKindsOf(c.intake.track);
    const safe = CATALOG.filter((e) => e.safe && e.slot === "PRACTICE" && e.tracks.includes(c.intake.track)).map((e) => e.key);
    const asked = activityAsksOn(constraintsStateOfIntake(c.intake));
    const answers: (RT.Intake | null)[] = [c.intake, ...(asked ? [answeredIntake(c.intake), ...gated.map((k) => answeredIntake(c.intake, [k])), answeredIntake(c.intake, gated), answeredIntake(c.intake, [safe[0]])] : [])];
    for (const intake of answers) {
      if (!intake) continue;
      for (const days of [300, 125, 40]) {
        const input = trackIn(days);
        const r = stageLadderOf({ ...intake, targetDay: at4(days) }, input, {}, mk4);
        if (!r.ok) {
          trackBreaches.push(`${c.label} ${days}: refused ${r.error}`);
          continue;
        }
        trackPlans += 1;
        const ik = { ...intake, targetDay: at4(days) };
        for (const b of breachesOf(r.plan, ik, input)) trackBreaches.push(`${c.label} ${days} [${json(intake.activities?.kinds ?? null)}] ${b}`);
        trackEmpty += r.plan.filter((m) => livePractices(m).length === 0).length;
        const again = fitPlan(r.plan, input, { intake: ik });
        if (json(again.map(kindsOfRow)) !== json(r.plan.map(kindsOfRow))) trackStable.push(`${c.label} ${days}`);
      }
    }
  }
  check(
    `every track plan built (${trackPlans}: BODY, CARE, CRAFT and DUTY; five, two and one stage; every gate state its card can hold) holds the practice progression on every stage, which keeps every rule`,
    trackPlans >= 90 && trackBreaches.length === 0,
    `${trackPlans} plans; ${trackBreaches.slice(0, 6).join(" | ")}`
  );
  check("…every stage of every one of them carries practice (while the card waits, the track's safe kinds)", trackEmpty === 0, String(trackEmpty));
  console.log(`  the progression's property: ${fieldPlans} Field plans and ${trackPlans} track plans built, every DRAFT stage compared`);
  check("…and a re-fit of each with its intake keeps every stage's kinds", trackStable.length === 0, trackStable.join(" | "));

  // The room is the stage's budget's (practicesThatFitOf at its band floor): read without an override, each plan's
  // progression is its rows. At 10 h a week every stage has room for three (the progression places two or three); at
  // 1.5 h the budget binds, so a stage holds fewer, never under one, each at its band floor or above.
  const fromBudget = (plan: readonly RT.MilestoneDraft[], intake: RT.Intake, input: RT.RealismInput) => {
    const pp = planProgressionOf(plan, intake, input);
    const rooms = (pp.input.maxPractices as (number | null)[]).filter((x): x is number => x != null);
    const same = pp.rows.every((m, k) => pp.progression.stages[k].held || json(kindsOfRow(m)) === json(wantOf(pp.progression.stages[k])));
    return { rooms, same, counts: plan.filter((m) => !m.notes.includes("HELD_AT_START")).map((m) => livePractices(m).length) };
  };
  const learner = ladder4("learner", stageLadderOf(ik4({}), learnerIn(), names4, mk4));
  const learnerIn0 = judgeIn(learnerIn(), learner.plan);
  const roomy = fromBudget(learner.plan, ik4({}), learnerIn0);
  const fewIn = learnerIn({ hoursPerWeek: 1.5 });
  const few = ladder4("1.5 h", stageLadderOf(ik4({ hoursPerWeek: 1.5 }), fewIn, names4, mk4));
  const tight = fromBudget(few.plan, ik4({ hoursPerWeek: 1.5 }), judgeIn(fewIn, few.plan));
  check(
    "each stage's room is what its weekly practice budget holds (practicesThatFitOf): read from the budget, the progression is the built plan's; 10 h a week leaves room for three on every stage",
    roomy.same && roomy.rooms.every((r) => r === 3) && roomy.counts.every((c, k) => c <= roomy.rooms[k]),
    json(roomy)
  );
  check(
    "…at 1.5 h a week the budget binds: some stage's room is under three, every stage holds as many as its room allows and at least one, and every practice sits at its band floor or above",
    tight.same &&
      tight.rooms.some((r) => r < 3) &&
      tight.counts.every((c, k) => c >= 1 && c <= tight.rooms[k]) &&
      few.plan.every((m) => livePractices(m).every((i) => RT.PRACTICE_BANDS.indexOf(i.durationBand!) >= RT.PRACTICE_BANDS.indexOf(m.stage === "FLUENT" || m.stage === "MASTERED" || m.stage === "BETWEEN" ? "D45" : m.stage === "RETAINED" ? "D30" : "D15"))),
    json(tight)
  );

  // The build-up rule, named and read off the plan: each later gate stage holds the kind the stage before trained, and its
  // focus is never less demanding (BUILD_UP_RULE, "carry and climb").
  const chain = learner.plan.filter((m) => m.stage !== "PART" && m.stage !== "BETWEEN");
  const focusOf = (m: RT.MilestoneDraft) => livePractices(m)[0]?.catalogKey as string;
  check(
    `the learner's plan builds up (${BUILD_UP_RULE}): each later stage keeps the one before's focus, and the foci climb (recall drills → problem sets → explaining → building)`,
    BUILD_UP_RULE === "carry and climb" &&
      chain.every((m, k) => k === 0 || livePractices(m).some((i) => i.catalogKey === focusOf(chain[k - 1]))) &&
      json(chain.map(focusOf)) === json(["RECALL_DRILLS", "PROBLEM_SETS", "EXPLAIN_IT", "BUILD_SOMETHING"]) &&
      chain.every((m, k) => k === 0 || (PROGRESSION.FIELD.rung[focusOf(m) as PracticeKind] ?? 0) >= (PROGRESSION.FIELD.rung[focusOf(chain[k - 1]) as PracticeKind] ?? 0)),
    json(chain.map((m) => livePractices(m).map((i) => i.catalogKey)))
  );

  // A re-plan (refit) and an "Edit by hand" re-plan's re-sync carry the started stages: the progression reads them, never changes them.
  const started = learner.plan.map((m, k) => (k <= 1 ? { ...m, status: "STARTED" as RT.MilestoneStatus } : { ...m, status: "PLANNED" as RT.MilestoneStatus }));
  const replanned = refit(
    started.map((m) => (m.status === "PLANNED" ? { ...m, status: "DRAFT" as RT.MilestoneStatus } : m)),
    learnerIn0,
    { intake: ik4({}) }
  );
  const firstDraft = replanned.find((m) => m.status === "DRAFT")!;
  check(
    "a re-plan with the first two stages started: the DRAFT stages are the progression with those carried (no opening step again, the first DRAFT stage carries the last started stage's focus), and the started ones are untouched",
    breachesOf(replanned, ik4({}), learnerIn0).length === 0 &&
      !live(firstDraft).some((i) => i.catalogKey === "CHOOSE_MATERIAL") &&
      livePractices(firstDraft).some((i) => i.catalogKey === focusOf(started[1])) &&
      json(replanned.slice(0, 2).map((m) => m.items)) === json(started.slice(0, 2).map((m) => m.items)),
    json([breachesOf(replanned, ik4({}), learnerIn0), replanned.map((m) => [m.status, kindsOfRow(m)])])
  );
  const synced = syncStagePractices({ ...firstDraft, items: firstDraft.items.filter((i) => i.kind !== "PRACTICE") }, learnerIn0, names4, mk4, [], { plan: replanned, intake: ik4({}) });
  check("…syncStagePractices within that plan gives the stage back its progression", json(kindsOfRow(synced)) === json(kindsOfRow(firstDraft)), json([kindsOfRow(synced), kindsOfRow(firstDraft)]));

  // The re-sync rules (every re-fit, contracts §20.8): code's rows follow the plan (a stage that becomes first gains the
  // opening and the partner, and loses them when it no longer is), the user's rows stay, a kind the user removed on a
  // stage never comes back, and a practice whose sessions the user set keeps its plan.
  const learnerIk = ik4({});
  const asLater = learner.plan.map((m, k) => (k === 0 ? { ...m, status: "LATER" as RT.MilestoneStatus, windowStart: null, dueDay: null } : m));
  const firstNow = fitPlan(asLater, learnerIn0, { intake: learnerIk });
  const backAgain = fitPlan(firstNow.map((m, k) => (k === 0 ? learner.plan[0] : m)), learnerIn0, { intake: learnerIk });
  check(
    "a stage that becomes the chain's first gains the opening step and the partner (Familiar once the count gate is set aside), and loses them when it no longer is (code's rows the progression stops wanting leave)",
    kindsOfRow(firstNow[1]).includes("CHOOSE_MATERIAL") &&
      json(kindsOfRow(firstNow[1])) === json(kindsOfRow(learner.plan[0]).filter((k) => k !== "CHOOSE_MATERIAL").concat("CHOOSE_MATERIAL", "OUTLINE").sort()) &&
      json(backAgain.map(kindsOfRow)) === json(learner.plan.map(kindsOfRow)),
    json([kindsOfRow(firstNow[1]), backAgain.map(kindsOfRow)])
  );
  const fam = learner.plan[1];
  const removedFocus = fam.items.map((i) => (i.catalogKey === "RECALL_DRILLS" ? { ...i, decision: "REMOVED" as RT.Decision } : i.catalogKey === "READ_AND_CARD" ? { ...i, planSource: "YOURS" as const, sessionsPerWeek: 2, rule: "TARGET:2/W" } : i));
  const userRow: RT.ItemDraft = { ...fam.items.find((i) => i.kind === "PRACTICE")!, lineageId: "u-mine", catalogKey: null, label: "My own flashcard game", origin: "USER", decision: "EDITED", method: "DELIBERATE_PRACTICE", notes: [] };
  const edited = fitPlan(learner.plan.map((m, k) => (k === 1 ? { ...m, items: [...removedFocus, userRow] } : m)), learnerIn0, { intake: learnerIk })[1];
  check(
    "the user's own row stays, a kind they removed on the stage never comes back (recall drills stay out), and a practice whose sessions they set keeps them; the stage holds at most three",
    edited.items.some((i) => i.lineageId === "u-mine" && i.decision === "EDITED") &&
      !livePractices(edited).some((i) => i.catalogKey === "RECALL_DRILLS") &&
      edited.items.filter((i) => i.catalogKey === "RECALL_DRILLS").every((i) => i.decision === "REMOVED") &&
      edited.items.some((i) => i.catalogKey === "READ_AND_CARD" && i.planSource === "YOURS" && i.sessionsPerWeek === 2) &&
      edited.items.filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED").length <= RT.PRACTICES_PER_MILESTONE,
    json(edited.items.map((i) => [i.catalogKey ?? i.label, i.decision, i.planSource, i.sessionsPerWeek]))
  );

  // The user's type change (roadmap-server catalogPickOf: the row re-typed in place, EDITED, its notes cleared) covers the
  // kind it replaced: a re-fit never adds that kind back beside it, and the room counts it in that kind's place, so no
  // other code row leaves for it. Read for the focus, a carry and Gemini's pick, each re-fitted twice.
  const retype = (row: RT.ItemDraft, to: CatalogKey): RT.ItemDraft => ({
    ...row,
    catalogKey: to,
    label: catalogLabelOf(to, { track: "FIELD", domains: ["Alpha", "Beta"] as unknown as RT.DomainName[] }),
    decision: "EDITED",
    notes: row.notes.filter((n) => n !== "GEMINI_PICK" && n !== "STUDY_ADDED" && n !== "PRODUCTION_ADDED"),
  });
  const swapCase = (plan: readonly RT.MilestoneDraft[], at: number, from: CatalogKey, to: CatalogKey, picks?: unknown) => {
    const before = plan[at];
    const row = before.items.find((i) => i.catalogKey === from && i.decision !== "REMOVED")!;
    const swappedPlan = plan.map((m, k) => (k === at ? { ...m, items: m.items.map((i) => (i === row ? retype(i, to) : i)) } : m));
    const judge = judgeIn(learnerIn(), plan);
    const once = fitPlan(swappedPlan, judge, { intake: learnerIk, picks });
    const twice = fitPlan(once, judge, { intake: learnerIk, picks });
    const others = (m: RT.MilestoneDraft) => kindsOfRow(m).filter((k) => k !== from && k !== to);
    return {
      gone: [once, twice].every((p) => !live(p[at]).some((i) => i.catalogKey === from)),
      kept: [once, twice].every((p) => p[at].items.some((i) => i.lineageId === row.lineageId && i.catalogKey === to && i.decision === "EDITED")),
      room: [once, twice].every((p) => livePractices(p[at]).length === livePractices(before).length),
      rest: [once, twice].every((p) => json(others(p[at])) === json(others(before))),
      stable: json(twice.map(kindsOfRow)) === json(once.map(kindsOfRow)),
      rows: twice.map(kindsOfRow)[at],
    };
  };
  const retained = learner.plan.findIndex((m) => m.stage === "RETAINED");
  const fluent = learner.plan.findIndex((m) => m.stage === "FLUENT");
  const swaps = [
    { what: "the focus to another candidate (Retained: problem sets → writing)", r: swapCase(learner.plan, retained, "PROBLEM_SETS", "WRITING_PRACTICE") },
    { what: "the focus to a kind the stage doesn't list (Retained: problem sets → a teacher or partner)", r: swapCase(learner.plan, retained, "PROBLEM_SETS", "WITH_A_PARTNER") },
    { what: "the carry (Fluent: problem sets → saying it aloud)", r: swapCase(learner.plan, fluent, "PROBLEM_SETS", "SAY_IT_ALOUD") },
  ];
  const pickedPlan = ladder4("picked for a swap", stageLadderOf(ik4({}), learnerIn(), names4, mk4, { picks: { RETAINED: "WRITING_PRACTICE" } }));
  swaps.push({ what: "Gemini's pick (Retained: writing, picked beside code's default → explaining)", r: swapCase(pickedPlan.plan, retained, "WRITING_PRACTICE", "EXPLAIN_IT") });
  check(
    "a type the user changed on a stage is the user's: re-fitted twice, the kind they replaced never comes back, their row stays (EDITED), the stage holds as many practices as before and every other code row stays (the focus, a carry, Gemini's pick)",
    swaps.every((x) => x.r.gone && x.r.kept && x.r.room && x.r.rest && x.r.stable),
    json(swaps.map((x) => [x.what, x.r]))
  );

  // Gemini's picks (a v4 reply's `picks`, contracts §20.11): added beside the stage's focus (code's default) when the pick is
  // one of its candidates (GEMINI_PICK, left for the user to decide; never copied); anything else adds nothing. Read back
  // off the rows by a re-sync.
  const picks = { FAMILIAR: "SLOW_DRILLS", RETAINED: "WRITING_PRACTICE", FLUENT: "BUILD_SOMETHING", MASTERED: "TIMED_PRACTICE", FOUNDATION: "__proto__" };
  const picked = ladder4("picked", stageLadderOf(ik4({}), learnerIn(), names4, mk4, { picks }));
  const pickRows = picked.plan.map((m) => livePractices(m).filter((i) => i.notes.includes("GEMINI_PICK")).map((i) => `${i.catalogKey}:${i.decision}`));
  eq(
    "picks (contracts §20.11): Familiar's slow drills, Retained's writing and Fluent's building are added beside code's default on those stages (GEMINI_PICK, PENDING), never in its place (each stage's focus stays code's default) and never copied into the count gate or Toward Mastered; Mastered's timed practice (no exam, not a candidate) and a prototype key give nothing",
    [pickRows, picked.plan.map((m) => focusOf(m))],
    [
      [[], ["SLOW_DRILLS:PENDING"], ["WRITING_PRACTICE:PENDING"], ["BUILD_SOMETHING:PENDING"], [], []],
      ["RECALL_DRILLS", "RECALL_DRILLS", "PROBLEM_SETS", "EXPLAIN_IT", "BUILD_SOMETHING", "BUILD_SOMETHING"],
    ]
  );
  check(
    "…the picked plan keeps every rule (the climb holds: no pick steps a focus back), and a re-fit reads the picks back off the rows (stable)",
    breachesOf(picked.plan, ik4({}), judgeIn(learnerIn(), picked.plan)).length === 0 &&
      json(fitPlan(picked.plan, judgeIn(learnerIn(), picked.plan), { intake: ik4({}) }).map(kindsOfRow)) === json(picked.plan.map(kindsOfRow)),
    json(breachesOf(picked.plan, ik4({}), judgeIn(learnerIn(), picked.plan)))
  );

  const samePick = fitPlan(learner.plan, learnerIn0, { intake: learnerIk, picks: { RETAINED: "PROBLEM_SETS" } })[2];
  check(
    "…a pick of the kind code had placed (Retained's problem sets, its default) turns that row into Gemini's choice (GEMINI_PICK, PENDING), the row kept",
    livePractices(samePick).some((i) => i.catalogKey === "PROBLEM_SETS" && i.notes.includes("GEMINI_PICK") && i.decision === "PENDING" && i.lineageId === learner.plan[2].items.find((x) => x.catalogKey === "PROBLEM_SETS")?.lineageId),
    json(samePick.items.map((i) => [i.catalogKey, i.decision, i.notes]))
  );

  // A short track plan keeps its base and climbs consecutive stages (the lead's ruling 4: never the later merged key, never
  // a jump): the first row is STAGE_1 (STAGE_2 from a working or strong start), each next row the next stage; five rows are 1..5.
  eq(
    "trackStagePlacesOf: n rows → consecutive stages from the base (a new start, then a working one)",
    [[1, 2, 3, 4, 5].map((n) => trackStagePlacesOf(n, "NEW")), [1, 2, 3, 4, 5].map((n) => trackStagePlacesOf(n, "WORKING")), trackStagePlacesOf(2, "STRONG"), trackStagePlacesOf(0, "NEW"), trackStagePlacesOf(7, "NEW")],
    [[[1], [1, 2], [1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4, 5]], [[2], [2, 3], [2, 3, 4], [2, 3, 4, 5], [1, 2, 3, 4, 5]], [2, 3], [], [1, 2, 3, 4, 5]]
  );
  const runIk = (days: number, startPoint: RT.StartPoint) => answeredIntake(ik4({ aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [], targetDay: at4(days), dateMode: "CHOSEN", depth: null, startPoint }));
  const runIn = (days: number, startPoint: RT.StartPoint) => in4({ trackArea: true, depth: null, dateMode: "CHOSEN", targetDay: at4(days), startPoint }, []);
  const run4 = ladder4("a 4-month 10K", stageLadderOf(runIk(120, "NEW"), runIn(120, "NEW"), {}, mk4));
  const run4w = ladder4("a 4-month 10K, working", stageLadderOf(runIk(120, "WORKING"), runIn(120, "WORKING"), {}, mk4));
  const kinds0 = (r: Ok) => livePractices(r.plan[0]).map((i) => i.catalogKey);
  const kindsLast = (r: Ok) => live(r.plan[r.plan.length - 1]).map((i) => i.catalogKey);
  eq(
    "a 4-month 10K for a new runner (“Nothing to avoid”) opens on the base (STAGE_1: easy and mobility), never longer sessions from week 1, and climbs to STAGE_2 (technique, the easy base carried, the full attempt and the check there), never jumping to STAGE_5's harder sessions; from a working start it opens on technique and climbs to STAGE_3 (the longer session)",
    [shape(run4.plan), kinds0(run4), kindsLast(run4), shape(run4w.plan), kinds0(run4w), kindsLast(run4w)],
    [
      ["STAGE_1@76", "STAGE_2@120"],
      ["EASY_SESSION", "MOBILITY_SESSION"],
      ["TECHNIQUE_SESSION", "EASY_SESSION", "FULL_ATTEMPT", "PERFORMANCE_CHECK"],
      ["STAGE_2@76", "STAGE_3@120"],
      ["TECHNIQUE_SESSION", "MOBILITY_SESSION", "EASY_SESSION"],
      ["LONGER_SESSION", "TECHNIQUE_SESSION", "EASY_SESSION", "FULL_ATTEMPT", "PERFORMANCE_CHECK"],
    ]
  );
  check(
    "…every short track plan keeps every rule of the progression, and each stage key's slot goes to the row that holds it",
    breachesOf(run4.plan, runIk(120, "NEW"), runIn(120, "NEW")).length === 0 &&
      json(["STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4", "STAGE_5"].map((k) => run4.plan.findIndex((m) => m.lineageId === run4.slotTo?.[k as RT.StageKey]))) === json([0, 1, 1, 1, 1]),
    json([breachesOf(run4.plan, runIk(120, "NEW"), runIn(120, "NEW")), run4.slotTo])
  );
  // Gemini's pick for a stage key merged into a row reaches that row when it is one of the row's own candidates.
  const craftIk = ik4({ aim: "Play a piece", fieldId: null, track: "CRAFT", domainIds: [], targetDay: at4(120), dateMode: "CHOSEN", depth: null });
  const craftIn = in4({ trackArea: true, depth: null, dateMode: "CHOSEN", targetDay: at4(120) }, []);
  const merged = ladder4("a merged CRAFT plan with picks", stageLadderOf(craftIk, craftIn, {}, mk4, { picks: { STAGE_4: "WITH_A_PARTNER", STAGE_3: "SLOW_DRILLS" } }));
  eq(
    "a pick made for a merged stage key (STAGE_3: slow drills) reaches the row that holds it (STAGE_2, where it is a candidate: its default, so the focus reads as Gemini's), GEMINI_PICK; one that isn't a candidate there (STAGE_4: a teacher or partner) is left out",
    [shape(merged.plan), merged.plan.map((m) => livePractices(m).filter((i) => i.notes.includes("GEMINI_PICK")).map((i) => i.catalogKey))],
    [["STAGE_1@76", "STAGE_2@120"], [[], ["SLOW_DRILLS"]]]
  );

  // The lead's ruling 6: a plan the user writes stays theirs. A re-fit with PlaceOpts.manual sizes what its stages hold and
  // places nothing; "Add the app's practice" (addStagePracticesOf) adds one practice at a tap to one stage only, the next
  // the progression places there, read with every other stage as it stands (the stage before's own practice is what it carries).
  {
    const skeleton = ladder4("a skeleton", stageLadderOf(learnerIk, learnerIn(), names4, mk4, { items: "NONE" }));
    const judge = judgeIn(learnerIn(), skeleton.plan);
    const once = fitPlan(skeleton.plan, judge, { intake: learnerIk, manual: true });
    const twice = fitPlan(once, judge, { intake: learnerIk, manual: true });
    const runSkIk = runIk(300, "NEW");
    const runSk = ladder4("a track skeleton", stageLadderOf(runSkIk, runIn(300, "NEW"), {}, mk4, { items: "NONE" }));
    const runOnce = fitPlan(runSk.plan, runIn(300, "NEW"), { intake: runSkIk, manual: true });
    check(
      "“Write it myself” stays the user's (the lead's ruling 6): a re-fit with PlaceOpts.manual places nothing on a depth or a track skeleton, twice over, where a re-fit without it puts the progression on every stage",
      [once, twice, runOnce].every((p) => p.every((m) => live(m).length === 0)) && fitPlan(skeleton.plan, judge, { intake: learnerIk }).every((m) => livePractices(m).length > 0),
      json([once.map(kindsOfRow), runOnce.map(kindsOfRow)])
    );
    const famAt = once.findIndex((m) => m.stage === "FAMILIAR");
    const retAt = once.findIndex((m) => m.stage === "RETAINED");
    const recallRow = learner.plan.flatMap((m) => m.items).find((i) => i.catalogKey === "RECALL_DRILLS") as RT.ItemDraft;
    const mine: RT.ItemDraft = { ...recallRow, lineageId: "u-recall", origin: "USER", decision: "EDITED", notes: [], planSource: "WORKED_OUT" };
    const withOwn = once.map((m, k) => (k === famAt ? { ...m, items: [...m.items, { ...mine, ord: m.items.length }] } : m));
    const tap = (p: readonly RT.MilestoneDraft[]) => addStagePracticesOf(p, p[retAt].lineageId, learnerIk, judge, names4, mk4);
    const taps = [tap(withOwn)];
    for (let k = 0; k < 4; k++) taps.push(tap(taps[taps.length - 1]));
    const added = taps[taps.length - 1];
    // What the progression places on Retained with every other stage read as it stands (planProgressionOf: an accepted row is carried).
    const asRead = planProgressionOf(
      withOwn.map((m, k) => (k === retAt ? m : { ...m, status: "PLANNED" as RT.MilestoneStatus })),
      learnerIk,
      judge
    );
    const wantInOrder = (asRead.progression.stages[asRead.rows.findIndex((m) => m.lineageId === withOwn[retAt].lineageId)]?.practices ?? []).map((x) => x.kind as string);
    const wantRet = [...wantInOrder].sort();
    const addedRows = added[retAt].items.filter((i) => i.decision !== "REMOVED" && i.kind === "PRACTICE");
    // One practice a tap, in the progression's priority (the focus first), until the stage holds them all; then nothing changes.
    const perTap = taps.map((p) => livePractices(p[retAt]).map((i) => i.catalogKey as string));
    const oneAtATap = wantInOrder.every((_, k) => json(perTap[k]) === json(wantInOrder.slice(0, k + 1))) && json(taps[wantInOrder.length]) === json(taps[wantInOrder.length - 1]);
    const again = tap(added);
    const sized = fitPlan(added, judge, { intake: learnerIk, manual: true });
    const minutesOfRow = (i: RT.ItemDraft) => (i.sessionsPerWeek ?? 0) * RT.practiceBandMinutes(i.durationBand!);
    const sizedRet = livePractices(sized[retAt]);
    const noFocus = withOwn.map((m, k) => (k === retAt ? { ...m, items: [...m.items, { ...recallRow, lineageId: "u-gone", catalogKey: "PROBLEM_SETS" as CatalogKey, decision: "REMOVED" as RT.Decision }] } : m));
    const afterNo = [0, 1, 2, 3].reduce<readonly RT.MilestoneDraft[]>((p) => tap(p), noFocus);
    const gatedTap = (p: readonly RT.MilestoneDraft[]) => addStagePracticesOf(p, p[retAt].lineageId, learnerIk, judge, names4, mk4, { excluded: ["MISTAKE_REVIEW"] });
    const gated = [0, 1, 2, 3].reduce<readonly RT.MilestoneDraft[]>((p) => gatedTap(p), withOwn);
    check(
      "“Add the app's practice” on Retained (the lead's ruling 6): one practice a tap, the progression's for that stage alone in its priority (problem sets, its role's kind, first; then the carry of the user's own recall drills on Familiar; then the spaced review), code's words, no step or checkpoint; every other stage as it was; once all are in place a tap changes nothing",
      oneAtATap &&
        wantInOrder[0] === "PROBLEM_SETS" &&
        json(addedRows.map((i) => i.catalogKey as string).sort()) === json(wantRet) &&
        wantRet.includes("PROBLEM_SETS") &&
        wantRet.includes("RECALL_DRILLS") &&
        addedRows.every((i) => i.origin === "CODE" && i.decision === "KEPT") &&
        !added[retAt].items.some((i) => i.kind === "STEP" || i.kind === "CHECKPOINT") &&
        added.every((m, k) => k === retAt || json(m) === json(withOwn[k])) &&
        json(again) === json(added),
      json({ perTap, wantInOrder })
    );
    check(
      "…sized by the manual re-fit (its focus weighed: problem sets train at least as long a week as each other practice), a kind the user removed there never comes back, and a kind the gate holds is never placed",
      sizedRet.length === addedRows.length &&
        sizedRet.every((i) => !!i.durationBand && (i.sessionsPerWeek ?? 0) >= 1) &&
        sizedRet.every((i) => minutesOfRow(sizedRet.find((x) => x.catalogKey === "PROBLEM_SETS")!) >= minutesOfRow(i)) &&
        !livePractices(afterNo[retAt]).some((i) => i.catalogKey === "PROBLEM_SETS") &&
        !livePractices(gated[retAt]).some((i) => i.catalogKey === "MISTAKE_REVIEW") &&
        livePractices(gated[retAt]).length >= 1,
      json({ sized: sizedRet.map((i) => `${i.catalogKey} ${i.sessionsPerWeek}x${i.durationBand}`), afterNo: kindsOfRow(afterNo[retAt]), gated: kindsOfRow(gated[retAt]) })
    );
  }

  // The lead's ruling 7: what the validator's progression reads of the dated plan (KeysOnlyContext.progression, R4's
  // runDraftCore): each slot's room (the row holding it), and a dated exam's stage and run-up as slots, a BETWEEN row's as
  // the gate before it (so the slots after it read as after the exam, as the rows after it do).
  {
    const SLOTS = ["FOUNDATION", "FAMILIAR", "RETAINED", "FLUENT", "MASTERED"];
    const slotsOf = (days: number | null, hours = 10) => {
      const ik = ik4({ hoursPerWeek: hours, ...(days != null ? { examLabel: "JLPT N2", exam: true, examDay: at4(days) } : {}) });
      const inp = learnerIn({ hoursPerWeek: hours, ...(days != null ? { examDay: at4(days) } : {}) });
      const r = ladder4(`slots ${days}`, stageLadderOf(ik, inp, names4, mk4));
      const judge = judgeIn(inp, r.plan);
      const pp = planProgressionOf(r.plan, ik, judge);
      return { r, pp, sp: slotProgressionOf(r.plan, ik, judge, SLOTS) };
    };
    const onFluent = slotsOf(180);
    const inBetween = slotsOf(300);
    const none = slotsOf(null);
    const few = slotsOf(null, 1.5);
    const roomsMatch = (x: ReturnType<typeof slotsOf>) =>
      SLOTS.every((slot, j) => {
        const k = x.pp.rows.findIndex((m, i) => m.stage === slot && !x.pp.progression.stages[i].held);
        return k < 0 || x.sp.maxPractices[j] === (x.pp.input.maxPractices as (number | null)[])[k];
      });
    eq(
      "slotProgressionOf: an exam in Fluent's window is the Fluent slot; one inside Toward Mastered reads as Fluent's slot (Mastered after it); no exam, none; each slot's room is its row's (at 1.5 h some under three)",
      [
        [onFluent.pp.rows[onFluent.pp.input.examStage as number]?.stage, onFluent.sp.examStage, (onFluent.sp.examPrepStage ?? 99) <= (onFluent.sp.examStage ?? -1)],
        [inBetween.pp.rows[inBetween.pp.input.examStage as number]?.stage, inBetween.sp.examStage],
        [none.sp.examStage, none.sp.examPrepStage],
        [roomsMatch(onFluent) && roomsMatch(none) && roomsMatch(few), few.sp.maxPractices.some((r) => r != null && r < 3), few.sp.maxPractices.length],
      ],
      [["FLUENT", 3, true], ["BETWEEN", 3], [null, null], [true, true, 5]]
    );
  }

  // One figure for a stage's room and its sizes (roomOf over allocate's ceiling): every stage holding two or more
  // practices gives its focus at least two sessions a week (the room's promise), at every number of hours, with and
  // without an exam, in every family; a focus whose method's band would leave it one session trains twice at a shorter band.
  {
    const thin: string[] = [];
    let built = 0;
    for (const hours of [1.5, 3, 4, 6])
      for (const family of ["KNOW", "LANGUAGE", "PERFORM", "BUILD"] as const)
        for (const day of [null, 180] as const) {
          const ik = ik4({ hoursPerWeek: hours, practiceFamily: family, ...(day != null ? { examLabel: "IELTS", exam: true, examDay: at4(day) } : {}) });
          const r = stageLadderOf(ik, learnerIn({ hoursPerWeek: hours, ...(day != null ? { examDay: at4(day) } : {}) }), names4, mk4);
          if (!r.ok) continue;
          built += 1;
          for (const m of r.plan) {
            const ps = livePractices(m);
            if (ps.length >= 2 && (ps[0].sessionsPerWeek ?? 0) < 2) thin.push(`${hours}h ${family} ${day ?? "-"} ${m.stage}: ${ps.map((i) => `${i.catalogKey} ${i.sessionsPerWeek}x${i.durationBand}`).join(", ")}`);
          }
        }
    check(
      `the room and the sizes read one figure: in ${built} plans (1.5 to 6 h a week, four families, with and without an exam) every stage with two or more practices trains its focus at least twice a week`,
      built >= 24 && thin.length === 0,
      thin.slice(0, 4).join(" | ")
    );
  }

  // A body plan's longer session stays a band above the easy one after allocate's leftover pass (it once raised the easy
  // session to the longer one's band at 3 h a week): at 3, 4 and 5 h a week over 300 days, on every stage holding both;
  // a longer session never past D90, a harder or longer one at most twice a week.
  {
    const bandAt = (i: RT.ItemDraft | undefined) => (i ? RT.PRACTICE_BANDS.indexOf(i.durationBand!) : -1);
    const bodyAt = (hours: number) => {
      const ik = answeredIntake(ik4({ aim: "Run a sub-50 10K", fieldId: null, track: "BODY", domainIds: [], targetDay: at4(300), dateMode: "CHOSEN", depth: null, hoursPerWeek: hours }));
      return ladder4(`10K at ${hours} h`, stageLadderOf(ik, in4({ trackArea: true, depth: null, dateMode: "CHOSEN", targetDay: at4(300), hoursPerWeek: hours }, []), {}, mk4)).plan;
    };
    const bad: string[] = [];
    let both = 0;
    const plans = [3, 4, 5].map((h) => ({ h, plan: bodyAt(h) }));
    for (const { h, plan } of plans)
      for (const m of plan) {
        const ps = livePractices(m);
        const easy = ps.find((i) => i.catalogKey === "EASY_SESSION");
        const longer = ps.find((i) => i.catalogKey === "LONGER_SESSION");
        if (easy && longer) {
          both += 1;
          if (!(bandAt(longer) > bandAt(easy))) bad.push(`${h}h ${m.stage}: longer ${longer.durationBand} vs easy ${easy.durationBand}`);
        }
        if (longer && bandAt(longer) > RT.PRACTICE_BANDS.indexOf("D90")) bad.push(`${h}h ${m.stage}: longer ${longer.durationBand}`);
        for (const i of ps) if ((i.catalogKey === "HARDER_SESSION" || i.catalogKey === "LONGER_SESSION") && (i.sessionsPerWeek ?? 0) > 2) bad.push(`${h}h ${m.stage}: ${i.catalogKey} ${i.sessionsPerWeek}/wk`);
      }
    const at3 = plans[0].plan.find((m) => m.stage === "STAGE_3");
    check(
      "a body plan's longer session stays a band above the easy one after the leftover pass (300 days at 3, 4 and 5 h a week: every stage holding both), never past D90, a harder or longer session at most twice a week; at 3 h Stage 3's longer session is the long one (D60 beside an easy D30, not two D45s)",
      both >= 6 &&
        bad.length === 0 &&
        !!at3 &&
        livePractices(at3).find((i) => i.catalogKey === "LONGER_SESSION")?.durationBand === "D60" &&
        bandAt(livePractices(at3).find((i) => i.catalogKey === "EASY_SESSION")) < RT.PRACTICE_BANDS.indexOf("D60"),
      json([bad, plans.map(({ h, plan }) => [h, plan.map((m) => livePractices(m).map((i) => `${i.catalogKey} ${i.sessionsPerWeek}x${i.durationBand}`))])])
    );
  }

  // The allocation weighs the focus (contracts §20.6; the third practice never thins it to the others' size): on every
  // stage of the learner's plan at 10 h the focus trains at least as long a week as any other practice, every week of
  // the plan still FITS, and on a body plan a harder or longer session is at most twice a week and the longer one sits a
  // band above the easy one.
  const minutesOf = (i: RT.ItemDraft) => (i.sessionsPerWeek ?? 0) * RT.practiceBandMinutes(i.durationBand!);
  const weighed = learner.plan.filter((m) => livePractices(m).length >= 2).every((m) => {
    const ps = livePractices(m);
    const f = ps.find((i) => i.catalogKey === focusOf(m)) ?? ps[0];
    return ps.every((i) => minutesOf(f) >= minutesOf(i));
  });
  const learnerFe = feasibilityOf(learner.plan, learnerIn0);
  const fullRun = ladder4("a 300-day 10K", stageLadderOf(runIk(300, "NEW"), runIn(300, "NEW"), {}, mk4));
  const bandIx = (i: RT.ItemDraft) => RT.PRACTICE_BANDS.indexOf(i.durationBand!);
  const bodyOk = fullRun.plan.every((m) => {
    const ps = livePractices(m);
    const easy = ps.find((i) => i.catalogKey === "EASY_SESSION");
    const longer = ps.find((i) => i.catalogKey === "LONGER_SESSION");
    return ps.every((i) => !(i.catalogKey === "HARDER_SESSION" || i.catalogKey === "LONGER_SESSION") || (i.sessionsPerWeek ?? 0) <= 2) && (!easy || !longer || bandIx(longer) > bandIx(easy));
  });
  check(
    "the focus is weighed: on every stage of the learner's plan it trains at least as long a week as any other practice, and every stage's time still FITS",
    weighed && learnerFe.milestones.every((m) => m.time.verdict === "FITS"),
    json([learner.plan.map((m) => livePractices(m).map((i) => `${i.catalogKey} ${i.sessionsPerWeek}x${i.durationBand}`)), learnerFe.milestones.map((m) => m.time.verdict)])
  );
  // Start re-sizes the stage it starts as the plan sized it: its focus (its first catalog practice) still weighed.
  const startedAt = learner.plan.findIndex((m) => m.stage === "FLUENT");
  const startRefit = refitForStart({ ...learner.plan[startedAt], status: "PLANNED" }, learner.plan.map((m) => ({ ...m, status: "PLANNED" as RT.MilestoneStatus })), learnerIn0);
  const startPs = startRefit.milestone.items.filter((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED");
  check(
    "…and Start's re-fit keeps the focus weighed (Fluent's explaining still trains at least as long a week as each other practice)",
    startPs.length >= 2 && startPs[0].catalogKey === focusOf(learner.plan[startedAt]) && startPs.every((i) => minutesOf(startPs[0]) >= minutesOf(i)),
    json(startPs.map((i) => `${i.catalogKey} ${i.sessionsPerWeek}x${i.durationBand}`))
  );
  check(
    "…on a 300-day 10K (“Nothing to avoid”), harder and longer sessions are at most twice a week, and a longer session is a band above the easy one",
    bodyOk && fullRun.plan.some((m) => livePractices(m).some((i) => i.catalogKey === "LONGER_SESSION")),
    json(fullRun.plan.map((m) => livePractices(m).map((i) => `${i.catalogKey} ${i.sessionsPerWeek}x${i.durationBand}`)))
  );

  // The outline in Gemini's order (a v4 reply's `order`, as line indices): split across the kept stages in that order.
  const outline = { lines: ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"], source: null } as RT.Intake["syllabus"];
  const ordered = ladder4("ordered", stageLadderOf(ik4({ syllabus: outline }), learnerIn(), names4, mk4, { order: [7, 6, 5, 4, 3, 2, 1, 0, 9, 7] }));
  const plain = ladder4("plain order", stageLadderOf(ik4({ syllabus: outline }), learnerIn(), names4, mk4));
  const linesOf = (plan: readonly RT.MilestoneDraft[]) => plan.map((m) => m.items.filter((i) => i.kind === "TOPIC").map((i) => i.syllabusRef));
  eq(
    "order: the outline split across the six kept stages in the reply's order (each line once; an unknown or repeated entry left out), every label the user's line; without one, the user's order",
    [linesOf(ordered.plan), ordered.plan.flatMap((m) => m.items.filter((i) => i.kind === "TOPIC").map((i) => i.label === outline!.lines[i.syllabusRef!])).every(Boolean), linesOf(plain.plan)],
    [[[7, 6], [5, 4], [3], [2], [1], [0]], true, [[0, 1], [2, 3], [4], [5], [6], [7]]]
  );
}

if (failed > 0) {
  console.log(`\nroadmap-realism-check: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
console.log(`\nroadmap-realism-check: ${passed} passed, 0 failed`);
