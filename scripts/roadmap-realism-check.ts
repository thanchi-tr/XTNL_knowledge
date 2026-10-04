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
 * Pure: no database, no clock, no model. scripts/_no-model.ts is imported
 * first, like every check that imports a roadmap module.
 *
 *   npx tsx scripts/roadmap-realism-check.ts
 */
import "./_no-model";
import { addDays, daysBetween, weekStartKeyOf, weekdayOf, type DayKey } from "../src/lib/life-day";
import * as RT from "../src/lib/roadmap-types";
import {
  applyRemedy,
  availableFor,
  cardReach,
  feasibilityOf,
  fitPlan,
  manualLadder,
  refit,
  refitForStart,
  remedyTargetDay,
  splitWindows,
  startSnapshotOf,
  starterLadder,
  thresholdFor,
  writingPlanOf,
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

if (failed > 0) {
  console.log(`\nroadmap-realism-check: ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
console.log(`\nroadmap-realism-check: ${passed} passed, 0 failed`);
