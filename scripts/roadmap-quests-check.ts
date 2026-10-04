/**
 * Week quests on fixed cases (docs/life-plan/roadmap.md F13, F14 Tests):
 * generation goldens for every kind (RAISE, ADD, PRACTICE, STEP, CHECKPOINT),
 * the catch-up and capacity caps and QUESTS_BEHIND, HELD and PAST_DUE, the
 * label brands and the digit rule, the freeze (cron first, the dedupe key,
 * empty sets, nothing with writes off, two devices at once), independence
 * from the freeze time, verification at the window edges, finalisation after
 * the settling lag, and the isolation greps.
 *
 * Fix round (roadmap-contracts.md §9): QUESTS_BEHIND is the trigger's alone
 * (never a view note) in R1's one wording; writes off reads a stored set as
 * recorded; one due day (milestoneDueDayOf); positions by lineage and the
 * superseded row never open; a plan-only EDITED item keeps Gemini's number
 * off Today; the freeze and the finaliser return their failures as `error`
 * (roadmapStepErrorsOf); a row's place is today-board's placementOf, in the
 * words of the section TodayBoard's seekPlaceOf opens.
 *
 * Pure: no database, no clock, no model. The server functions run against an
 * in-memory QuestStore that keeps the two write rules (ON CONFLICT DO
 * NOTHING; UPDATE … WHERE finalizedAt IS NULL). scripts/_no-model.ts is
 * imported first, like every check that imports a roadmap module. Lane R6.
 *
 *   npx tsx scripts/roadmap-quests-check.ts
 */
import "./_no-model";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { LIFE_TZ, addDays, dayStartOf, weekdayOf, zonedToInstant, type DayKey } from "../src/lib/life-day";
import type { RestRow } from "../src/lib/duty-rule";
import type { InstanceLike } from "../src/lib/habit";
import {
  CARD_WRITE_MIN,
  WEEK_QUESTS_PER_WEEK_MAX,
  bestReach,
  cardsAtLevelKey,
  checkpointLogPrefix,
  domainName,
  positionCountOf,
  effectiveState,
  existingExpected,
  floorBase,
  interval,
  labelTextOf,
  questWeekKey,
  roadmapStepErrorsOf,
  yoursText,
  type AddQuestSpec,
  type CardState,
  type CheckpointQuestSpec,
  type CodeText,
  type MilestoneFeasibility,
  type PracticeQuestSpec,
  type RaiseQuestSpec,
  type StartSnapshot,
  type StartWeek,
  type StepQuestSpec,
  type WeekQuestCardInput,
  type WeekQuestInput,
  type WeekQuestPracticeInput,
  type WeekQuestSet,
  type WeekQuestSpec,
  type YoursText,
} from "../src/lib/roadmap-types";
import {
  WEEK_QUEST_NOTE_PATTERNS,
  nonHeldShareOf,
  pastWeekOf,
  questProgress,
  questsBehind,
  questsBehindLine,
  scaledCountOf,
  weekDoneShare,
  weekQuestResultsOf,
  weekQuestsFor,
  weekQuestsViewOf,
} from "../src/lib/roadmap-quests";
import { triggersOf } from "../src/lib/roadmap-pace";
import { goalSeriesEntryOf } from "../src/lib/roadmap-readings";
import { seekPlaceOf } from "../src/lib/today-board";
import {
  boardInstancesOf,
  boardTemplateOf,
  checkpointLabelOf,
  finalizeQuestWeeks,
  freezeWeekQuests,
  heldDaysAsOf,
  loadPastWeeks,
  loadWeekQuests,
  openMilestoneOf,
  questErrorText,
  questLabelOf,
  questPlaceOfTemplate,
  questProgressFor,
  raiseEvidenceOf,
  scheduledPlacesOf,
  setOfStored,
  weekQuestInputFor,
  weekQuestSetFor,
  weekQuestsViewFor,
  type QuestCapacity,
  type QuestCardRow,
  type QuestInstanceRow,
  type QuestItemRow,
  type QuestMeasureRow,
  type QuestMilestoneFacts,
  type QuestStore,
  type QuestTemplateRow,
  type StoredQuestWeek,
} from "../src/lib/roadmap-quests-server";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
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
/** JSON with object keys sorted: a stored set and a generated one compare by content, not key order. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const eq = (name: string, got: unknown, want: unknown) => check(name, json(got) === json(want), `got ${json(got)}, want ${json(want)}`);

const ON = { env: { XTNL_LIFE_JUDGE: "1" } };
const OFF = { env: { NODE_ENV: "development" } };

/** A Sydney wall-clock instant (life days turn at 04:00 there). */
function at(day: DayKey, h: number, mi = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(zonedToInstant(y, m, d, h, LIFE_TZ).getTime() + mi * 60_000);
}

const M = "2026-11-02"; // a Monday
check("fixture: M is a Monday", weekdayOf(M) === 1);
const W = (k: number) => addDays(M, 7 * k);

const pick = <K extends WeekQuestSpec["kind"]>(set: WeekQuestSet, kind: K) => set.quests.find((q): q is Extract<WeekQuestSpec, { kind: K }> => q.kind === kind) ?? null;
const hasBasis = (set: WeekQuestSet, re: RegExp) => set.basis.some((b) => re.test(b));
const D = (name: string) => domainName({ id: name.toLowerCase().replace(/\W+/g, "-"), name });
const Y = (s: string) => yoursText("USER", "PENDING", s) as YoursText;
const C = (s: string) => labelTextOf("CODE", "PENDING", s) as CodeText;

// ═══ Fixture builders ═══════════════════════════════════════════════════════

const PLAN_STUB = { kind: "PLAN", knowledge: [{ level: 6 }] } as unknown as MilestoneFeasibility;

function eligible(from: DayKey, to: DayKey, held: ReadonlySet<DayKey>): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!held.has(d)) n++;
  return n;
}

/** A StartSnapshot the way F4 step 13 defines it: needRate_w = newNeeded_start × fw_w ÷ Ww_start. */
function snapshotOf(p: {
  startedDay: DayKey;
  dueDay: DayKey;
  level: number;
  pStart?: number;
  pCalibrating?: boolean;
  newNeededStart?: number;
  rateSource?: StartSnapshot["rateSource"];
  reviewMin?: number;
  held?: DayKey[];
  lastCardDay?: DayKey | null;
}): StartSnapshot {
  const held = new Set(p.held ?? []);
  const lastCardDay = p.lastCardDay === undefined ? addDays(p.dueDay, -floorBase(p.level)) : p.lastCardDay;
  const pStart = p.pStart ?? 0.8;
  const pCalibrating = p.pCalibrating ?? false;
  const wwDays = lastCardDay ? eligible(p.startedDay, lastCardDay, held) : 0;
  const newNeeded = p.newNeededStart ?? 0;
  const weeks: StartWeek[] = [];
  for (let w = addDays(p.startedDay, 1 - weekdayOf(p.startedDay)); w <= p.dueDay; w = addDays(w, 7)) {
    const from = w > p.startedDay ? w : p.startedDay;
    const end = addDays(w, 6);
    const to = lastCardDay && lastCardDay < end ? lastCardDay : end;
    const fwDays = lastCardDay && from <= to ? eligible(from, to, held) : 0;
    weeks.push({
      weekStart: w,
      newPerWeek: 0,
      practiceMin: 0,
      reviewMin: p.reviewMin ?? 30,
      availableMin: 600,
      availableClass: "ESTIMATED",
      fw: fwDays / 7,
      needRate: wwDays > 0 ? (newNeeded * fwDays) / wwDays : 0,
    });
  }
  return {
    kind: "START",
    startedDay: p.startedDay,
    dueDay: p.dueDay,
    weeks,
    lastCardDay,
    pStart,
    pCalibrating,
    yieldStart: pCalibrating ? 1 : Math.pow(pStart, p.level - 1),
    newNeededStart: newNeeded,
    wwStart: wwDays / 7,
    rateSource: p.rateSource ?? "SCOPE",
    m: 1,
    feasibility: PLAN_STUB,
  };
}

const ROOMY: WeekQuestInput["capacity"] = { availableMin: 600, class: "ESTIMATED", calibrating: false };

function inputOf(p: {
  weekStart: DayKey;
  startedDay: DayKey;
  dueDay: DayKey;
  snapshot: StartSnapshot;
  ord?: number;
  card?: WeekQuestCardInput | null;
  capacity?: WeekQuestInput["capacity"];
  heldDays?: DayKey[];
  otherFieldQuotas?: number;
  areaQuotaField?: WeekQuestInput["areaQuotaField"];
  practices?: WeekQuestPracticeInput[];
  steps?: WeekQuestInput["steps"];
  checkpoint?: WeekQuestInput["checkpoint"];
  readAt?: Date;
}): WeekQuestInput {
  return {
    weekStart: p.weekStart,
    weekEnd: addDays(p.weekStart, 6),
    milestone: { id: "ms2", ord: p.ord ?? 2, of: 3, startedDay: p.startedDay, dueDay: p.dueDay, snapshot: p.snapshot },
    heldDays: p.heldDays ?? [],
    card: p.card ?? null,
    capacity: p.capacity ?? ROOMY,
    otherFieldQuotas: p.otherFieldQuotas ?? 0,
    areaQuotaField: p.areaQuotaField ?? null,
    practices: p.practices ?? [],
    steps: p.steps ?? [],
    checkpoint: p.checkpoint ?? null,
    m: 1,
    cardLevelsReadAt: (p.readAt ?? at(p.weekStart, 4, 15)).toISOString(),
  };
}

function cards(n: number, level: number, dueDay: DayKey, extra: Partial<CardState> = {}): CardState[] {
  return Array.from({ length: n }, () => ({ level, dueDay, graceEndsDay: null, createdDay: addDays(M, -60), domainId: "d-risk", ...extra }));
}

// ═══ ADD (F13 worked example): on pace 3, capped by catch-up 4, then 3 ══════

console.log("— ADD —");
const ADD_DUE = addDays(M, 55); // Sun, 8 weeks
const addSnap = snapshotOf({ startedDay: M, dueDay: ADD_DUE, level: 6, newNeededStart: 11 });
const RISK = [D("Risk Management")];
const addCard = (cs: CardState[]): WeekQuestCardInput => ({
  measureKey: cardsAtLevelKey(["d-risk"], 6),
  domainIds: ["d-risk"],
  domainNames: RISK,
  level: 6,
  target: 18,
  baseline: 8,
  v0: 8,
  cards: cs,
  rateSource: "SCOPE",
  fieldId: "f-trading",
});
const addCards = [...cards(8, 6, addDays(M, 90)), ...cards(10, 4, addDays(M, 40))];
{
  eq("fixture: lastCardDay = due − floorBase(6) = Wed of week 5", addSnap.lastCardDay, addDays(M, 30));
  eq("fixture: 31 writing days at Start (Ww_start 4.43)", Math.round(addSnap.wwStart * 7), 31);
  const eff = addCards.map((c) => effectiveState(c, M));
  check("fixture: existingExpected at p 0.8 is 14.4", Math.abs(existingExpected(eff, 6, ADD_DUE, 0.8) - 14.4) < 1e-9);

  const w1 = weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards) }));
  const a1 = pick(w1, "ADD");
  eq("week 1: Add 3 cards to Risk Management (pace 3 under the cap of 4)", a1 && [a1.label, a1.count, a1.pace, a1.unit, a1.evidence], ["Add 3 cards to Risk Management", 3, 3, "card", "RECORDED"]);
  eq("week 1: no cap bound", w1.cappedBy, null);
  check("week 1: QUESTS_BEHIND does not fire", !questsBehind(w1));
  check("week 1: the basis names the cap 1.5 × 2.5 → 4", hasBasis(w1, /1\.5 × the 2\.5 a week the plan needed at Start \(at least 3\) → 4/));

  const w4 = weekQuestsFor(inputOf({ weekStart: W(3), startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards) }));
  const a4 = pick(w4, "ADD");
  eq("week 4 after three missed weeks: Add 4 cards, capped (pace 8)", a4 && [a4.label, a4.count, a4.pace], ["Add 4 cards to Risk Management", 4, 8]);
  eq("week 4: cappedBy CATCHUP", w4.cappedBy, "CATCHUP");
  check("week 4: writing weeks left 10 ÷ 7 < 2", !!a4 && Math.abs(a4.writingWeeksLeft - 10 / 7) < 1e-9);
  check("week 4: QUESTS_BEHIND fires", questsBehind(w4));
  check("week 4: the basis says 'asks 4 of the 8 new cards needed to stay on plan'", hasBasis(w4, /asks 4 of the 8 new cards needed to stay on plan; 1\.5 × the 2\.5 a week/));
  const line = questsBehindLine(w4, { ord: 2, level: 6, dueDay: ADD_DUE });
  eq(
    "QUESTS_BEHIND's line names the ask, the need, the level, the due day and the end of writing",
    line,
    `Behind on new cards for Milestone 2: this week asks 4 of the 8 needed to stay on plan, and writing that can still reach level 6 by 27 Dec ends Wed 2 Dec.`
  );

  const created = addDays(M, 25);
  const w5Cards = [...addCards, ...cards(4, 1, created, { createdDay: created })];
  const w5 = weekQuestsFor(inputOf({ weekStart: W(4), startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(w5Cards) }));
  const a5 = pick(w5, "ADD");
  eq("week 5 after 4 cards in week 4: newNeeded 7, pace 7, cap 3 → Add 3, capped", a5 && [a5.label, a5.count, a5.pace], ["Add 3 cards to Risk Management", 3, 7]);
  eq("week 5: cappedBy CATCHUP", w5.cappedBy, "CATCHUP");

  const w6 = weekQuestsFor(inputOf({ weekStart: W(5), startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(w5Cards) }));
  check("week 6: no ADD after the writing window, and the note says why", !pick(w6, "ADD") && hasBasis(w6, /^Add: No new cards this week: a card written after Wed 2 Dec can't reach level 6 by 27 Dec\./));

  // A p flip: started while p was calibrating (yield 1), measured at 0.8 later. The set keeps Start's figures.
  const flipCards = [...cards(8, 6, addDays(M, 90)), ...cards(6, 4, addDays(M, 40))];
  const calSnap = snapshotOf({ startedDay: M, dueDay: ADD_DUE, level: 6, pCalibrating: true, newNeededStart: 4 });
  const flipIn = inputOf({ weekStart: W(2), startedDay: M, dueDay: ADD_DUE, snapshot: calSnap, card: addCard(flipCards) });
  const flip = weekQuestsFor(flipIn);
  const af = pick(flip, "ADD");
  eq("p calibrating at Start: best case 14, so 4 new cards in all; week 3 asks ceil(4 × 7 ÷ 17) = 2", af && [af.count, af.pace], [2, 2]);
  eq("the ADD is unchanged by a pass rate measured later (the set reads only Start's p)", weekQuestsFor(flipIn).quests, flip.quests);
  const view = weekQuestsViewOf({
    set: flip,
    progress: [],
    variant: "roadmap",
    milestone: { ord: 2, of: 3, title: "Risk and position sizing", dueDay: ADD_DUE },
    level: 6,
    frozen: true,
    writesOff: false,
    places: {},
    passRate: { start: { p: 1, calibrating: true }, now: { p: 0.78, calibrating: false }, fittedNow: 16 },
  });
  check(
    "the roadmap page notes the newly measured pass rate and keeps Start's figures",
    view.notes.includes("Your pass rate is now measured (78%); fitted today the target would be 16. Week quests keep Start's figures.")
  );
  const todayView = weekQuestsViewOf({
    set: flip,
    progress: [],
    variant: "today",
    milestone: { ord: 2, of: 3, title: "Risk and position sizing", dueDay: ADD_DUE },
    level: 6,
    frozen: true,
    writesOff: false,
    places: {},
    passRate: { start: { p: 1, calibrating: true }, now: { p: 0.78, calibrating: false } },
  });
  check("never on Today: no notes, no basis, no cap", todayView.notes.length === 0 && todayView.basis.length === 0 && todayView.cappedBy === null);
}

// ═══ Capacity ═══════════════════════════════════════════════════════════════

console.log("— capacity —");
{
  const backtest = (n = 3): WeekQuestPracticeInput => ({ templateId: "t-bt", name: Y("Backtest"), rule: `TARGET:${n}/W`, startDay: M, bandMinutes: 45 });
  const drills: WeekQuestPracticeInput = { templateId: "t-dr", name: Y("Drills"), rule: "TARGET:3/W", startDay: M, bandMinutes: 45 };
  const full = weekQuestsFor(
    inputOf({ weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards), capacity: { availableMin: 200, class: "ESTIMATED", calibrating: false }, practices: [backtest(), drills] })
  );
  check("practices fill the room: ADD is 0 and absent", !pick(full, "ADD"));
  eq("… cappedBy CAPACITY", full.cappedBy, "CAPACITY");
  check("… the basis says 'no time left for new cards this week'", hasBasis(full, /^Add: No time left for new cards this week/));
  check("… QUESTS_BEHIND does not fire on a CAPACITY cap", !questsBehind(full));
  check("a time overrun adds its basis line and keeps the practices", hasBasis(full, /^Capacity: This week's plan is more than the time you've shown \(≈ 5 h of ≈ 3 h 20\)/) && full.quests.filter((q) => q.kind === "PRACTICE").length === 2, json(full.basis));

  const tight = { availableMin: 100, class: "ESTIMATED" as const, calibrating: false };
  const base = { weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards), capacity: tight };
  const none = weekQuestsFor(inputOf(base));
  const others = weekQuestsFor(inputOf({ ...base, otherFieldQuotas: 12 }));
  const area = weekQuestsFor(inputOf({ ...base, areaQuotaField: { fieldId: "f-trading", name: "Trading" } }));
  eq("room 100 − 30 of reviews: ADD 3, no cap", [pick(none, "ADD")?.count, none.cappedBy], [3, null]);
  eq("other Fields' quotas (12 cards × 5 min) cut the room to 10 → 2, cappedBy CAPACITY", [pick(others, "ADD")?.count, others.cappedBy], [2, "CAPACITY"]);
  eq("the Area Field's own quota does not cut the room, and the spec carries it", [pick(area, "ADD")?.count, pick(area, "ADD")?.quotaField], [3, { fieldId: "f-trading", name: "Trading" }]);
  const areaView = weekQuestsViewOf({ set: area, progress: [], variant: "today", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {} });
  eq("the ADD row says it counts toward the Area Field's quota too", areaView.rows.find((r) => r.kind === "ADD")?.quotaLine, "counts toward Trading's weekly quota too");

  const measuredCap = weekQuestsFor(inputOf({ ...base, capacity: { availableMin: 40, class: "ESTIMATED", calibrating: false } }));
  eq("a measured capacity caps ADD at room ÷ CARD_WRITE_MIN ((40 − 30) ÷ 5 = 2)", [pick(measuredCap, "ADD")?.count, CARD_WRITE_MIN], [2, 5]);
  const calib = weekQuestsFor(inputOf({ ...base, capacity: { availableMin: 8 * 60 * 0.7, class: "YOURS", calibrating: true } }));
  check("a calibrating capacity uses the declared fallback and says 'unverified'", hasBasis(calib, /^Capacity: ≈ 5 h 35 this week \(your hours × 0\.7 while your tracked time is calibrating; unverified\)/), json(calib.basis));
  const thu = addDays(M, 3);
  const calibThu = weekQuestsFor(
    inputOf({ weekStart: M, startedDay: thu, dueDay: ADD_DUE, snapshot: snapshotOf({ startedDay: thu, dueDay: ADD_DUE, level: 6, newNeededStart: 11 }), card: addCard(addCards), capacity: { availableMin: 8 * 60 * 0.7, class: "YOURS", calibrating: true } })
  );
  check("… pro-rated to the window: a Thursday Start has 8 h × 60 × 0.7 × 4 ÷ 7 ≈ 3 h 10", hasBasis(calibThu, /^Capacity: ≈ 3 h 10 this week/), json(calibThu.basis));
}

// ═══ RAISE (F13 worked example) ═════════════════════════════════════════════

console.log("— RAISE —");
const PS = [D("Position Sizing")];
const raiseDue = addDays(W(6), 13); // two weeks left from W(6)
const raiseSnap = snapshotOf({ startedDay: M, dueDay: raiseDue, level: 6, rateSource: "NONE" });
const raiseCard = (cs: CardState[], over: Partial<WeekQuestCardInput> = {}): WeekQuestCardInput => ({
  measureKey: cardsAtLevelKey(["d-ps"], 6),
  domainIds: ["d-ps"],
  domainNames: PS,
  level: 6,
  target: 20,
  baseline: 10,
  v0: 10,
  cards: cs,
  rateSource: "NONE",
  fieldId: "f-trading",
  ...over,
});
{
  const wk = W(6);
  const wed = addDays(wk, 2);
  const due7 = [...cards(4, 5, wed), ...cards(1, 5, addDays(wk, 3)), ...cards(2, 5, addDays(wk, 4))];
  const set = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard([...cards(10, 6, addDays(wk, 30)), ...due7]) }));
  const r = pick(set, "RAISE");
  eq("pace ceil(10 ÷ 2) = 5 under the reach ceil(7 × 0.8) = 6: Bring 5 cards", r && [r.label, r.count, r.floor, r.unit, r.evidence], ["Bring 5 cards in Position Sizing to level 6+", 5, 10, "card", "TESTED"]);
  eq("its due days, one per reachable card", r?.dueDays.length, 7);
  const v = weekQuestsViewOf({ set, progress: [], variant: "today", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {} });
  eq("the row says '4 come due Wed, 1 Thu, 2 Fri'", v.rows[0]?.dueLine, "4 come due Wed, 1 Thu, 2 Fri");
  check("a card due anyway counts: the sheet says so", hasBasis(set, /a card that was due anyway counts: passing its review is the step/));
  check("no ADD with pace source NONE, and the basis says so", !pick(set, "ADD") && hasBasis(set, /new cards aren't counted: no pace yet/));

  const below = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard(due7, { baseline: 12, v0: 9 }) }));
  const rb = pick(below, "RAISE");
  eq("below the baseline: asks from max(v0, b) = 12 (G = 8, pace 4)", rb && [rb.floor, rb.count], [12, 4]);
  check("… and the basis says the 3 slipped cards don't move the milestone", hasBasis(below, /^Bring: 3 cards already counted when you started have slipped below level 6; bringing them back doesn't move Milestone 2/));
  check("… which the roadmap page shows as a note", weekQuestsViewOf({ set: below, progress: [], variant: "roadmap", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {} }).notes.some((n) => /^3 cards already counted/.test(n)));

  const half = weekQuestsFor(
    inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: snapshotOf({ startedDay: M, dueDay: raiseDue, level: 6, pStart: 0.5, rateSource: "NONE" }), card: raiseCard(cards(3, 5, wed), { target: 30 }) })
  );
  eq("p = 0.5 and 3 reachable one-pass cards: asks at most ceil(1.5) = 2", pick(half, "RAISE")?.count, 2);

  // A fresh level-6 milestone in its first week with no level-5 cards: no RAISE, and the lag line.
  const fresh = weekQuestsFor(
    inputOf({ weekStart: M, startedDay: M, dueDay: addDays(M, 69), snapshot: snapshotOf({ startedDay: M, dueDay: addDays(M, 69), level: 6, rateSource: "NONE" }), card: raiseCard(cards(4, 4, addDays(M, 3)), { target: 8, baseline: 0, v0: 0 }) })
  );
  const reachDay = bestReach({ level: 4, dueDay: addDays(M, 3) }, 6);
  check("a fresh level-6 milestone: no RAISE quest in its first week", !pick(fresh, "RAISE"));
  check("fixture: a level-4 card due Thursday can stand at level 6 one interval(5) later", reachDay === addDays(M, 3 + interval(5)));
  check(
    "... and the lag line names when cards can reach it (roadmap page only)",
    hasBasis(fresh, /^Bring: No card in Position Sizing can reach level 6 this week even if every review passes; 4 can by Tue 17 Nov\./),
    json(fresh.basis)
  );

  const py = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard(due7, { domainNames: [D("Python 3")] }) }));
  eq("a Domain named 'Python 3' is an opaque text slot", pick(py, "RAISE")?.label, "Bring 5 cards in Python 3 to level 6+");
}

// ═══ PRACTICE, STEP, CHECKPOINT ═════════════════════════════════════════════

console.log("— sessions, steps, checkpoint —");
const LONG_DUE = addDays(M, 76); // Sun, 11 weeks
const longSnap = snapshotOf({ startedDay: M, dueDay: LONG_DUE, level: 6, rateSource: "NONE" });
{
  const bt: WeekQuestPracticeInput = { templateId: "t-bt", name: Y("Backtest"), rule: "TARGET:3/W", startDay: M, bandMinutes: 45 };
  const full = weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: [bt] }));
  const p = pick(full, "PRACTICE");
  eq("Backtest · 3 sessions × 45 min", p && [p.label, p.count, p.unit, p.evidence, p.minutes], ["Backtest · 3 sessions × 45 min", 3, "session", "SELF_REPORTED", 45]);
  const thu = addDays(M, 3);
  const late = weekQuestsFor(inputOf({ weekStart: M, startedDay: thu, dueDay: LONG_DUE, snapshot: snapshotOf({ startedDay: thu, dueDay: LONG_DUE, level: 6, rateSource: "NONE" }), practices: [{ ...bt, startDay: thu }] }));
  eq("after a Thursday Start the same template asks round(3 × 4 ÷ 7) = 2", pick(late, "PRACTICE")?.label, "Backtest · 2 sessions × 45 min");
  const vac = weekQuestsFor(inputOf({ weekStart: W(1), startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: [bt], heldDays: [addDays(W(1), 2), addDays(W(1), 3)] }));
  eq("a week with two vacation days asks round(3 × 5 ÷ 7) = 2", pick(vac, "PRACTICE")?.count, 2);
  const daily: WeekQuestPracticeInput = { templateId: "t-st", name: Y("Stretch"), rule: "DAILY", startDay: M, bandMinutes: 30 };
  const dvac = weekQuestsFor(inputOf({ weekStart: W(1), startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: [daily], heldDays: [addDays(W(1), 2)] }));
  eq("a DAILY practice over a week with one vacation day: 'Stretch · 6 days × 30 min'", [pick(dvac, "PRACTICE")?.label, pick(dvac, "PRACTICE")?.unit], ["Stretch · 6 days × 30 min", "day"]);
  const study: WeekQuestPracticeInput = { templateId: "t-study", name: C("Study Probability"), rule: "TARGET:2/W", startDay: M, bandMinutes: 30 };
  eq("a starter plan's 'Study Probability' (CodeText) yields a PRACTICE quest", pick(weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: [study] })), "PRACTICE")?.label, "Study Probability · 2 sessions × 30 min");
  const four = weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: [bt, { ...bt, templateId: "b" }, { ...bt, templateId: "c" }, { ...bt, templateId: "d" }] }));
  check("a 4th practice (never, by F4 step 5) gets no quest, and the cap holds", four.quests.length <= WEEK_QUESTS_PER_WEEK_MAX && four.quests.filter((q) => q.kind === "PRACTICE").length === 3);

  // STEP spread over 3 steps on a 76-day window: step i from the week its share i ÷ 4 has passed at Sunday.
  const steps = (done: (DayKey | null)[]) =>
    done.map((d, i) => ({ templateId: `t-s${i + 1}`, title: Y(`Write rule ${String.fromCharCode(65 + i)}`), ord: i + 1, doneDay: d, minutes: 30 }));
  const stepAt = (k: number, done: (DayKey | null)[]) => pick(weekQuestsFor(inputOf({ weekStart: W(k), startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, steps: steps(done) })), "STEP");
  eq("step 1 of 3 waits in week 2 (elapsed 17%)", stepAt(1, [null, null, null]), null);
  eq("step 1 of 3 is asked from week 3 (elapsed 26% ≥ 25%)", stepAt(2, [null, null, null])?.label, "Step: Write rule A");
  eq("step 2 of 3 waits in week 5 (elapsed 45% < 50%) once step 1 is done", stepAt(4, [W(3), null, null]), null);
  eq("step 2 of 3 is asked from week 6 (elapsed 54%)", stepAt(5, [W(3), null, null])?.label, "Step: Write rule B");
  eq("step 3 of 3 is asked from week 9 (elapsed 82% ≥ 75%), not week 8", [stepAt(7, [W(3), W(5), null])?.label ?? null, stepAt(8, [W(3), W(5), null])?.label], [null, "Step: Write rule C"]);
  eq("a step done this week is still open as of Monday (it stays the week's step)", stepAt(5, [W(3), addDays(W(5), 2), null])?.label, "Step: Write rule B");
  const s1 = stepAt(2, [null, null, null]);
  eq("a STEP counts 1 step, from your ticks", s1 && [s1.count, s1.unit, s1.evidence], [1, "step", "SELF_REPORTED"]);

  const cp = (last: DayKey | null) => ({ itemLineageId: "lin-cp", label: Y("Mock test"), lastLogDay: last });
  const cpAt = (k: number, last: DayKey | null) => pick(weekQuestsFor(inputOf({ weekStart: W(k), startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, checkpoint: cp(last) })), "CHECKPOINT");
  eq("CHECKPOINT waits in the week the window is still under 80% (week 8)", cpAt(7, null), null);
  eq("CHECKPOINT in the week the window passes 80%: 'Checkpoint: Mock test · log your score'", cpAt(8, null)?.label, "Checkpoint: Mock test · log your score");
  eq("… not asked again once logged since then", cpAt(9, addDays(M, 61)), null);
  eq("… asked again when the last log is older than the 80% day", cpAt(9, addDays(M, 50))?.label, "Checkpoint: Mock test · log your score");
  const cpSet = weekQuestsFor(inputOf({ weekStart: W(8), startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, checkpoint: cp(null) }));
  const cpRow = weekQuestsViewOf({ set: cpSet, progress: [], variant: "roadmap", milestone: { ord: 2, of: 3, title: "t" }, level: null, frozen: true, writesOff: false, places: {} }).rows[0];
  check("the CHECKPOINT row says it doesn't move your progress", /doesn't move your progress/.test(cpRow?.figure.caption ?? ""), cpRow?.figure.caption);
}

// ═══ HELD, PAST_DUE, order ══════════════════════════════════════════════════

console.log("— held, past due, order —");
{
  const bt: WeekQuestPracticeInput = { templateId: "t-bt", name: Y("Backtest"), rule: "TARGET:3/W", startDay: M, bandMinutes: 45 };
  const allHeld = Array.from({ length: 7 }, (_, i) => addDays(W(2), i));
  const held = weekQuestsFor(inputOf({ weekStart: W(2), startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: [bt], heldDays: allHeld }));
  eq("a fully held week: HELD, an empty set", [held.state, held.quests.length], ["HELD", 0]);
  check("… the basis says 'held week'", hasBasis(held, /held week/));

  const pastDue = weekQuestsFor(inputOf({ weekStart: W(11), startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: [bt] }));
  eq("PAST_DUE: due Sunday, still open on Monday: no quests", [pastDue.state, pastDue.quests.length], ["PAST_DUE", 0]);
  const pdView = (variant: "today" | "roadmap") =>
    weekQuestsViewOf({ set: pastDue, progress: [], variant, milestone: { ord: 2, of: 3, title: "t", dueDay: LONG_DUE }, level: 6, frozen: true, writesOff: false, places: {} });
  eq("… the roadmap note, in ink", pdView("roadmap").notes, ["Milestone 2 was due Sun 17 Jan — close or reschedule it"]);
  check("… and nothing on Today (no rows, no notes)", pdView("today").rows.length === 0 && pdView("today").notes.length === 0);

  const all = weekQuestsFor(
    inputOf({
      weekStart: W(8),
      startedDay: M,
      dueDay: LONG_DUE,
      snapshot: snapshotOf({ startedDay: M, dueDay: LONG_DUE, level: 6, newNeededStart: 20 }),
      card: { ...addCard([...cards(10, 6, addDays(M, 120)), ...cards(5, 5, addDays(W(8), 2))]), target: 30, v0: 10, baseline: 10 },
      practices: [bt, { ...bt, templateId: "t-st", name: C("Study Risk Management"), rule: "TARGET:2/W", bandMinutes: 30 }],
      steps: [{ templateId: "t-s1", title: Y("Draft the risk rules"), ord: 1, doneDay: null, minutes: 30 }],
      checkpoint: { itemLineageId: "lin-cp", label: Y("Mock test"), lastLogDay: null },
    })
  );
  eq("issue order: RAISE, PRACTICE (in ord), STEP, CHECKPOINT; ords 1..n", all.quests.map((q) => `${q.ord}:${q.kind}`), ["1:RAISE", "2:PRACTICE", "3:PRACTICE", "4:STEP", "5:CHECKPOINT"]);
  const tv = weekQuestsViewOf({
    set: all,
    progress: all.quests.map((q) => ({ ord: q.ord, progress: q.kind === "PRACTICE" && q.ord === 2 ? q.count : 0, count: q.count, done: q.kind === "PRACTICE" && q.ord === 2, slipped: null })),
    variant: "today",
    milestone: { ord: 2, of: 3, title: "t" },
    level: 6,
    frozen: true,
    writesOff: false,
    places: { "t-bt": "in Habits", "t-s1": "in Anytime", "t-st": "in Habits" },
  });
  eq("Today: open rows first, in Today's order (Bring, the step, sessions, the checkpoint), done rows last", tv.rows.map((r) => r.kind + (r.done ? "✓" : "")), ["RAISE", "STEP", "PRACTICE", "CHECKPOINT", "PRACTICE✓"]);
  check("Today: sessions and the step seek their task and say where it lives; no row links to /review", tv.rows.every((r) => !(r.href ?? "").includes("/review")) && tv.rows.filter((r) => r.kind === "PRACTICE" || r.kind === "STEP").every((r) => r.seekTemplateId && r.place && r.href === null));
  const rv = weekQuestsViewOf({ set: all, progress: [], variant: "roadmap", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {} });
  check("roadmap and Aim card: sessions and steps link to /today#t-<id>; the checkpoint opens its sheet", rv.rows.filter((r) => r.kind === "PRACTICE" || r.kind === "STEP").every((r) => r.href?.startsWith("/today#t-") && r.seekTemplateId === null) && rv.rows.find((r) => r.kind === "CHECKPOINT")?.href === null);
  check("the roadmap variant says 'the milestone counts 80% of these' on sessions", rv.rows.filter((r) => r.kind === "PRACTICE").every((r) => /the milestone counts 80% of these/.test(r.figure.caption)));
  const add = weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards) }));
  eq("ADD links to /add?field=&domain= for the first Domain in scope, on every surface", weekQuestsViewOf({ set: add, progress: [], variant: "aim", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {} }).rows[0]?.href, "/add?field=f-trading&domain=d-risk");
}

// ═══ Labels: the brands and the digit rule ══════════════════════════════════

console.log("— labels —");
{
  const kept = labelTextOf("GEMINI", "KEPT", "Backtest");
  const ok: WeekQuestPracticeInput = { templateId: "t", name: Y("Backtest"), rule: "DAILY", startDay: M, bandMinutes: 30 };
  // @ts-expect-error a KEPT_SUGGESTION name (labelTextOf gives null) is not a quest label
  const bad1: WeekQuestPracticeInput = { ...ok, name: kept };
  // @ts-expect-error a plain string is not a quest label
  const bad2: WeekQuestPracticeInput = { ...ok, name: "Backtest" };
  // @ts-expect-error a plain string is not a DomainName
  const bad3: WeekQuestCardInput = { ...raiseCard([]), domainNames: ["Position Sizing"] };
  void bad1;
  void bad2;
  void bad3;
  check("labelTextOf: Gemini's kept words are null; the user's are YoursText; code's are CodeText", kept === null && labelTextOf("USER", "PENDING", "x") === "x" && labelTextOf("CODE", "KEPT", "Study X") === "Study X");
  const item = (origin: string, decision: string, flags: string[] = []) => ({ origin, decision, label: "Do 3 mock tests", flags });
  eq(
    "questLabelOf: a NUMBER-flagged label never reaches a quest unless the words are the user's or the syllabus's",
    [questLabelOf(item("GEMINI", "CHECKED", ["NUMBER"])), questLabelOf(item("GEMINI", "KEPT")), questLabelOf(item("USER", "PENDING", ["NUMBER"])), questLabelOf(item("SYLLABUS", "CHECKED", ["NUMBER"]))],
    [null, null, "Do 3 mock tests", "Do 3 mock tests"]
  );
  // Fix round (Lens 2 major; §9.3 "EDITED means the words changed"): EDITED with the NUMBER flag still set is a
  // plan-only edit (sessions, band, bar), so the words are still Gemini's; a label edit clears the flags.
  eq(
    "questLabelOf: EDITED with NUMBER still flagged (a plan-only edit) is not a label; EDITED with the flags cleared is",
    [questLabelOf(item("GEMINI", "EDITED", ["NUMBER"])), questLabelOf(item("GEMINI", "EDITED", ["NUMBER", "PROPER_NOUN"])), questLabelOf(item("GEMINI", "EDITED", [])), questLabelOf(item("CODE", "KEPT", ["NUMBER"]))],
    [null, null, "Do 3 mock tests", null]
  );
  eq(
    "checkpointLabelOf: the same NUMBER rule (a plan-only 'Set the bar' edit keeps Gemini's number off Today)",
    [checkpointLabelOf(item("GEMINI", "EDITED", ["NUMBER"])), checkpointLabelOf(item("GEMINI", "EDITED")), checkpointLabelOf(item("USER", "EDITED", ["NUMBER"])), checkpointLabelOf(item("SYLLABUS", "CHECKED", ["NUMBER"]))],
    [null, "Do 3 mock tests", "Do 3 mock tests", "Do 3 mock tests"]
  );
  eq("questLabelOf: a removed item, an unknown origin and a blank label are never labels", [questLabelOf(item("CODE", "REMOVED")), questLabelOf(item("MODEL", "CHECKED")), questLabelOf({ origin: "USER", decision: "EDITED", label: "  " })], [null, null, null]);
  eq("checkpointLabelOf: YoursText only (code never writes a checkpoint label)", [checkpointLabelOf(item("GEMINI", "CHECKED")), checkpointLabelOf(item("CODE", "PENDING")), checkpointLabelOf(item("GEMINI", "KEPT"))], ["Do 3 mock tests", null, null]);

  // Every label of every fixture: no digit outside the template's {n}, {L} and {min} slots.
  const sets: WeekQuestSet[] = [
    weekQuestsFor(inputOf({ weekStart: W(6), startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard(cards(7, 5, addDays(W(6), 2)), { domainNames: [D("Python 3"), D("R 4.2")] }) })),
    weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: { ...addCard(addCards), domainNames: [D("Area 51"), D("B2"), D("C3"), D("D4")] } })),
    weekQuestsFor(
      inputOf({
        weekStart: W(8),
        startedDay: M,
        dueDay: LONG_DUE,
        snapshot: longSnap,
        practices: [{ templateId: "t", name: Y("5k intervals"), rule: "TARGET:3/W", startDay: M, bandMinutes: 45 }, { templateId: "u", name: Y("Mobility 2.0"), rule: "DAILY", startDay: M, bandMinutes: 15 }],
        steps: [{ templateId: "s", title: Y("Run 10k at 50:00"), ord: 1, doneDay: null, minutes: 60 }],
        checkpoint: { itemLineageId: "c", label: Y("Test 2"), lastLogDay: null },
      })
    ),
  ];
  const textParts = ["Python 3", "R 4.2", "Area 51", "B2", "C3", "D4", "5k intervals", "Mobility 2.0", "Run 10k at 50:00", "Test 2"];
  const offenders: string[] = [];
  let labels = 0;
  for (const s of sets) {
    for (const q of s.quests) {
      labels++;
      let skeleton = q.label;
      for (const t of [...textParts].sort((a, b) => b.length - a.length)) skeleton = skeleton.split(t).join("‹text›");
      skeleton = skeleton
        .replace(/^(Bring|Add) \d+ /, "$1 ‹n› ")
        .replace(/ level \d+\+$/, " level ‹L›+")
        .replace(/ · \d+ (sessions?|days?) × \d+ min$/, " · ‹n› $1 × ‹min› min");
      if (/\d/.test(skeleton)) offenders.push(`${q.label} → ${skeleton}`);
      if (/Quest \d+ of/i.test(q.label)) offenders.push(`'Quest n of' in ${q.label}`);
    }
  }
  check(`no digit outside the {n}, {L} and {min} slots of a template (${labels} labels)`, offenders.length === 0 && labels >= 6, offenders.join(" | "));
  eq("a label over four Domains reads 'A, B, C or D'", pick(sets[1], "ADD")?.label, "Add 3 cards to Area 51, B2, C3 or D4");
}

// ═══ Verification (F14) ═════════════════════════════════════════════════════

console.log("— verification —");
{
  const wk = W(6);
  const raise: RaiseQuestSpec = { ord: 1, kind: "RAISE", label: "Bring 5 cards in X to level 6+", count: 5, unit: "card", evidence: "TESTED", from: wk, to: addDays(wk, 6), measureKey: "k", domainIds: ["d"], minLevel: 6, floor: 10, dueDays: [], bestCase: false };
  const ev = raiseEvidenceOf([
    { day: addDays(wk, 1), value: 13 },
    { day: addDays(wk, 2), value: 15 },
    { day: addDays(wk, 3), value: 14 },
  ]);
  eq("raiseEvidenceOf: the last value, the week's high, and the day it first read lower", [ev.value, ev.high, ev.slipDay], [14, 15, addDays(wk, 3)]);
  const p = questProgress({ ...raise }, ev);
  eq("a degradation offsets RAISE (net): 15 → 14 above the floor 10 is 4 of 5, not done", [p.progress, p.done, p.slipped], [4, false, { from: 5, day: addDays(wk, 3) }]);
  const set: WeekQuestSet = { weekStart: wk, milestoneId: "m", state: "OPEN", generator: 1, quests: [{ ...raise }], basis: [], cappedBy: null };
  const row = weekQuestsViewOf({ set, progress: [p], variant: "today", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {} }).rows[0];
  eq("the slip caption, in ink: '1 card slipped back to level 5 on Thu'", [row.slipLine, row.done, row.figure.caption], ["1 card slipped back to level 5 on Thu", false, "tested by your reviews"]);
  eq("RAISE with no reading in the window is 0 (v0 is at or below the floor)", questProgress({ ...raise }, { kind: "RAISE", value: null, high: null, slipDay: null }).progress, 0);
  eq("RAISE is clamped to the count", questProgress({ ...raise }, { kind: "RAISE", value: 30, high: 30, slipDay: null }).progress, 5);

  const practice: PracticeQuestSpec = { ord: 2, kind: "PRACTICE", label: "Backtest · 3 sessions × 45 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: wk, to: addDays(wk, 6), templateId: "t", minutes: 45 };
  const ticks = (statuses: string[]): InstanceLike[] => statuses.map((s, i) => ({ day: addDays(wk, i), status: s }));
  eq("a 4th tick in a 3/W week counts nothing", questProgress({ ...practice }, { kind: "PRACTICE", rule: "TARGET:3/W", startDay: M, instances: ticks(["DONE", "DONE", "DONE", "DONE"]) }).progress, 3);
  eq("the minimum version (MVV) does not keep", questProgress({ ...practice }, { kind: "PRACTICE", rule: "TARGET:3/W", startDay: M, instances: ticks(["DONE_MVV", "DONE"]) }).progress, 1);
  eq("two ticks on one day are one session", questProgress({ ...practice }, { kind: "PRACTICE", rule: "TARGET:3/W", startDay: M, instances: [{ day: wk, status: "DONE" }, { day: wk, status: "DONE" }] }).progress, 1);
  eq("a tick outside the window counts nothing", questProgress({ ...practice }, { kind: "PRACTICE", rule: "TARGET:3/W", startDay: M, instances: [{ day: addDays(wk, -1), status: "DONE" }] }).progress, 0);

  const step: StepQuestSpec = { ord: 3, kind: "STEP", label: "Step: x", count: 1, unit: "step", evidence: "SELF_REPORTED", from: wk, to: addDays(wk, 6), templateId: "s", minutes: 30 };
  eq("a step ticked last week does not count; this week's does", [questProgress({ ...step }, { kind: "STEP", doneDays: [addDays(wk, -2)] }).progress, questProgress({ ...step }, { kind: "STEP", doneDays: [addDays(wk, 6)] }).progress], [0, 1]);
  const cp: CheckpointQuestSpec = { ord: 4, kind: "CHECKPOINT", label: "Checkpoint: x · log your score", count: 1, unit: "log", evidence: "SELF_REPORTED", from: wk, to: addDays(wk, 6), itemLineageId: "c" };
  eq("a checkpoint log in the window marks it done; two logs are still 1", questProgress({ ...cp }, { kind: "CHECKPOINT", logDays: [addDays(wk, 1), addDays(wk, 2)] }).progress, 1);
  const addSpec: AddQuestSpec = { ord: 5, kind: "ADD", label: "Add 8 cards to X", count: 8, unit: "card", evidence: "RECORDED", from: wk, to: addDays(wk, 6), domainIds: ["d"], fieldId: null, quotaField: null, pace: 8, writingWeeksLeft: 3, lastCardDay: null };
  eq("ADD counts what the rows say (10 of 8 reads honestly)", questProgress({ ...addSpec }, { kind: "ADD", added: 10 }), { ord: 5, progress: 10, count: 8, done: true, slipped: null });
  eq("evidence of another kind reads as no progress", questProgress({ ...addSpec }, { kind: "STEP", doneDays: [wk] }).progress, 0);
}

// ═══ Results, done share, past weeks ════════════════════════════════════════

console.log("— results —");
{
  const wk = W(1);
  const specs: WeekQuestSpec[] = [
    { ord: 1, kind: "PRACTICE", label: "Backtest · 3 sessions × 45 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: wk, to: addDays(wk, 6), templateId: "t", minutes: 45 },
    { ord: 2, kind: "STEP", label: "Step: x", count: 1, unit: "step", evidence: "SELF_REPORTED", from: wk, to: addDays(wk, 6), templateId: "s", minutes: 30 },
  ];
  const set: WeekQuestSet = { weekStart: wk, milestoneId: "m", state: "OPEN", generator: 1, quests: specs, basis: [], cappedBy: "CATCHUP" };
  const prog = [
    { ord: 1, progress: 2, count: 3, done: false, slipped: null },
    { ord: 2, progress: 1, count: 1, done: true, slipped: null },
  ];
  const plain = weekQuestResultsOf(set, prog, null, 0, 7);
  eq("results: one row per quest, written as issued", plain.rows, [{ ord: 1, progress: 2, done: false }, { ord: 2, progress: 1, done: true }]);
  check("done share = Σ min(progress, count) ÷ Σ count = 3 ÷ 4", Math.abs(weekDoneShare(set, plain, 1) - 0.75) < 1e-9);
  eq("past week: 'Week of … · 1 of 2 done · capped'", pastWeekOf(set, plain, 2, addDays(wk, 10)), { weekStart: wk, milestoneOrd: 2, capped: true, settled: true, done: 1, total: 2, heldDays: 0 });
  const sick = weekQuestResultsOf(set, prog, null, 2, 7);
  check("two days held after the freeze: the non-held share is 5 ÷ 7", Math.abs(nonHeldShareOf(set, sick) - 5 / 7) < 1e-9);
  check("… the done share scales each count (3 × 5/7 = 2.14): 2 sessions and the step read about 0.97", Math.abs(weekDoneShare(set, sick, 5 / 7) - (2 + 5 / 7) / (3 * (5 / 7) + 5 / 7)) < 1e-9);
  eq("… so the past line reads 2 of 2 done · 2 days held (a sick week is not a missed one)", [pastWeekOf(set, sick, 2, addDays(wk, 10)).done, pastWeekOf(set, sick, 2, addDays(wk, 10)).total, pastWeekOf(set, sick, 2, addDays(wk, 10)).heldDays], [2, 2, 2]);
  eq("scaledCountOf: round half up, 0 is excused", [scaledCountOf(3, 5 / 7), scaledCountOf(1, 0.4), scaledCountOf(1, 0.5), scaledCountOf(3, 1)], [2, 0, 1, 3]);
  eq("a week not yet written reads 'still settling'", pastWeekOf(set, null, 2, addDays(wk, 8)).settled, false);
  const empty: WeekQuestSet = { ...set, quests: [], state: "HELD", cappedBy: null };
  eq("an empty week reads 0 of 0, and its done share is 1 (nothing was asked)", [pastWeekOf(empty, weekQuestResultsOf(empty, [], null, 0, 0), 2, addDays(wk, 10)).total, weekDoneShare(empty, weekQuestResultsOf(empty, [], null, 0, 0), 1)], [0, 1]);
}

// ═══ The in-memory store ════════════════════════════════════════════════════

interface Idea {
  id: string;
  domainId: string;
  level: number;
  dueDate: Date;
  graceEndsAt: Date | null;
  createdAt: Date;
  isArchived: boolean;
}

interface FakeDb {
  facts: QuestMilestoneFacts[];
  items: Record<string, QuestItemRow[]>;
  measures: Record<string, QuestMeasureRow[]>;
  templates: QuestTemplateRow[];
  instances: QuestInstanceRow[];
  domains: { id: string; name: string; fieldId: string }[];
  ideas: Idea[];
  readings: { measureKey: string; day: DayKey; value: number }[];
  rest: RestRow[];
  capacity: QuestCapacity;
  quotas: { fieldId: string; name: string; quota: number }[];
  weeks: StoredQuestWeek[];
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function storeOf(db: FakeDb): QuestStore {
  return {
    async milestones(_userId, scope) {
      await tick();
      if ("active" in scope) return db.facts.filter((f) => f.roadmap.status === "ACTIVE");
      const roadmaps = new Set(db.facts.filter((f) => scope.milestoneIds.includes(f.milestone.id)).map((f) => f.roadmap.id));
      return db.facts.filter((f) => roadmaps.has(f.roadmap.id));
    },
    async parts(id) {
      await tick();
      return { items: db.items[id] ?? [], measures: db.measures[id] ?? [] };
    },
    async templates(_u, ids) {
      await tick();
      return db.templates.filter((t) => ids.includes(t.id));
    },
    async instances(_u, ids, from, to) {
      await tick();
      return db.instances.filter((i) => ids.includes(i.templateId) && i.day >= from && i.day <= to);
    },
    async domains(ids) {
      await tick();
      return db.domains.filter((d) => ids.includes(d.id));
    },
    async cards(domainIds, before): Promise<QuestCardRow[]> {
      await tick();
      return db.ideas.filter((i) => domainIds.includes(i.domainId) && !i.isArchived && i.createdAt < before);
    },
    async lastReadingBefore(_u, key, day) {
      await tick();
      const rows = db.readings.filter((r) => r.measureKey === key && r.day < day).sort((a, b) => (a.day < b.day ? 1 : -1));
      return rows[0] ? { day: rows[0].day, value: rows[0].value } : null;
    },
    async readingOn(_u, key, day) {
      await tick();
      const r = db.readings.find((x) => x.measureKey === key && x.day === day);
      return r ? { day: r.day, value: r.value } : null;
    },
    async readingsBetween(_u, key, from, to) {
      await tick();
      return db.readings.filter((r) => r.measureKey === key && r.day >= from && r.day <= to).map((r) => ({ day: r.day, value: r.value }));
    },
    async logDays(_u, prefix, from, to) {
      await tick();
      return db.readings.filter((r) => r.measureKey.startsWith(prefix) && (from == null || r.day >= from) && r.day <= to).map((r) => r.day);
    },
    async countAdded(domainIds, from, to) {
      await tick();
      return db.ideas.filter((i) => domainIds.includes(i.domainId) && !i.isArchived && i.createdAt >= from && i.createdAt < to).length;
    },
    async restRows(_u, from, to) {
      await tick();
      return db.rest.filter((r) => r.day >= from && r.day <= to);
    },
    async capacity() {
      await tick();
      return (held) => ({ ...db.capacity, availableMin: (db.capacity.availableMin * (7 - held.length)) / 7 });
    },
    async quotas() {
      await tick();
      return db.quotas;
    },
    async intervalMultiplier() {
      await tick();
      return 1;
    },
    async questWeeks(_u, filter) {
      await tick();
      return db.weeks.filter((w) => (!filter.roadmapId || w.roadmapId === filter.roadmapId) && (!filter.unfinalized || w.finalizedAt == null) && (!filter.weekStart || w.weekStart === filter.weekStart));
    },
    async insertQuestWeek(userId, roadmapId, set, source, now) {
      await tick();
      const key = questWeekKey(set.milestoneId, set.weekStart);
      if (db.weeks.some((w) => w.dedupeKey === key)) return 0; // ON CONFLICT ("userId","dedupeKey") DO NOTHING
      const copy = JSON.parse(JSON.stringify(set)) as WeekQuestSet;
      db.weeks.push({ id: `w${db.weeks.length + 1}`, userId, roadmapId, milestoneId: set.milestoneId, weekStart: set.weekStart, dedupeKey: key, source, state: copy.state, generator: copy.generator, quests: copy.quests, basis: copy.basis, cappedBy: copy.cappedBy, results: null, finalizedAt: null, createdAt: now });
      return 1;
    },
    async finalizeQuestWeek(id, results, now) {
      await tick();
      const w = db.weeks.find((x) => x.id === id);
      if (!w || w.finalizedAt != null) return 0; // WHERE "finalizedAt" IS NULL
      w.results = JSON.parse(JSON.stringify(results));
      w.finalizedAt = now;
      return 1;
    },
  };
}

/** The ADD milestone as rows: Risk Management to level 6+, started Monday M, a practice, a step and a checkpoint. */
function dbOf(over: { status?: string; domainDecision?: string; goalClosedDay?: DayKey | null; startedDay?: DayKey } = {}): FakeDb {
  const startedDay = over.startedDay ?? M;
  const snap = snapshotOf({ startedDay, dueDay: ADD_DUE, level: 6, newNeededStart: 11 });
  const key = cardsAtLevelKey(["d-risk"], 6);
  const facts: QuestMilestoneFacts = {
    roadmap: { id: "rm1", status: "ACTIVE", fieldId: "f-trading", track: "CRAFT", hoursPerWeek: 8, intensity: "STEADY", startPoint: "BASICS", typicalHours: null, typicalHoursSource: null, targetDay: addDays(M, 300), practicesAllowed: true },
    milestone: { id: "ms2", lineageId: "lin-ms2", ord: 2, title: "Risk and position sizing", status: over.status ?? "STARTED", startedDay, dueDay: ADD_DUE, feasibility: snap, goalId: "g2" },
    goal: { id: "g2", dueDay: ADD_DUE, closed: over.goalClosedDay != null, closedDay: over.goalClosedDay ?? null, archivedDay: null },
    place: 2,
    of: 3,
  };
  const item = (p: Partial<QuestItemRow> & Pick<QuestItemRow, "id" | "kind" | "label">): QuestItemRow => ({
    lineageId: `lin-${p.id}`,
    ord: 1,
    origin: "USER",
    decision: "EDITED",
    domainId: null,
    proposedName: null,
    flags: [],
    templateId: null,
    rule: null,
    durationBand: null,
    outOf: null,
    bar: null,
    addToToday: true,
    ...p,
  });
  const ideas: Idea[] = addCards.map((c, i) => ({ id: `i${i}`, domainId: "d-risk", level: c.level, dueDate: at(c.dueDay, 9), graceEndsAt: null, createdAt: at(addDays(M, -60), 10), isArchived: false }));
  return {
    facts: [facts],
    items: {
      ms2: [
        item({ id: "dom", kind: "DOMAIN", label: "Risk Management", origin: "GEMINI", decision: over.domainDecision ?? "CHECKED", domainId: "d-risk" }),
        item({ id: "p1", kind: "PRACTICE", label: "Backtest", templateId: "t-bt", rule: "TARGET:3/W", durationBand: "D45" }),
        item({ id: "s1", kind: "STEP", label: "Draft the risk rules", origin: "GEMINI", decision: "CHECKED", templateId: "t-s1" }),
        item({ id: "cp", kind: "CHECKPOINT", label: "Mock test", outOf: 100, bar: 70 }),
      ],
    },
    measures: { ms2: [{ kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: ["d-risk"] }, minLevel: 6, target: 18, baseline: 8, rateSource: "SCOPE", measureKey: key }] },
    templates: [
      { id: "t-bt", recurrence: "TARGET:3/W", startDay: startedDay, estMinutes: 45, completedAt: null, archivedAt: null },
      { id: "t-s1", recurrence: null, startDay: startedDay, estMinutes: 30, completedAt: null, archivedAt: null },
    ],
    instances: [],
    domains: [{ id: "d-risk", name: "Risk Management", fieldId: "f-trading" }],
    ideas,
    readings: [{ measureKey: key, day: startedDay, value: 8 }],
    rest: [],
    capacity: { availableMin: 600, class: "ESTIMATED", calibrating: false },
    quotas: [{ fieldId: "f-trading", name: "Trading", quota: 3 }],
    weeks: [],
  };
}

// ═══ The freeze (decision 23) ═══════════════════════════════════════════════

async function server() {
  console.log("— freeze —");
  const U = "user1";
  {
    const db = dbOf();
    const store = storeOf(db);
    const mon = at(W(1), 4, 15);
    const cron = await freezeWeekQuests(U, mon, "CRON", { ...ON, store });
    eq("the life cron freezes Monday's set (source CRON)", [cron, db.weeks.length, db.weeks[0]?.source, db.weeks[0]?.dedupeKey], [{ froze: 1, skipped: null }, 1, "CRON", `rq:ms2:${W(1)}`]);
    const render = await freezeWeekQuests(U, at(addDays(W(1), 2), 10), "RENDER", { ...ON, store });
    const start = await store.insertQuestWeek(U, "rm1", setOfStored(db.weeks[0]), "START", at(addDays(W(1), 2), 10));
    eq("a later render and Start find it and write nothing", [render.froze, start, db.weeks.length], [0, 0, 1]);
    const generated = await weekQuestSetFor(U, "ms2", W(1), mon, { store });
    check("the stored set equals the generated set", canon(setOfStored(db.weeks[0])) === canon(generated), canon(generated));
    const first = setOfStored(db.weeks[0]);

    // Inputs change mid-week: a card added, capacity edited, a rest day declared.
    db.ideas.push({ id: "new1", domainId: "d-risk", level: 1, dueDate: at(addDays(W(1), 1), 9), graceEndsAt: null, createdAt: at(addDays(W(1), 1), 9), isArchived: false });
    db.capacity = { availableMin: 60, class: "ESTIMATED", calibrating: false };
    db.rest.push({ day: addDays(W(1), 4), kind: "REST", declaredAt: at(addDays(W(1), 1), 12), cancelledAt: null });
    const load = await loadWeekQuests(U, at(addDays(W(1), 2), 10), { ...ON, store });
    check("a later render returns the stored set after the inputs changed", !!load && load.frozen && canon(load.set) === canon(first));
    eq("… and the new card counts as ADD progress", load?.progress.find((p) => p.ord === first.quests.find((q) => q.kind === "ADD")?.ord)?.progress, 1);
    check("loadWeekQuests: the Today view has rows, labelled as recorded (frozen)", !!load && load.view.rows.length > 0 && !load.view.writesOff && load.view.frozen);
    const roadmapView = load ? weekQuestsViewFor(load, "roadmap", { p: 0.8, calibrating: false }) : null;
    check("weekQuestsViewFor renders the roadmap variant from the same load (basis kept)", !!roadmapView && roadmapView.basis.length > 0 && json(roadmapView.rows.map((r) => r.ord)) === json(first.quests.map((q) => q.ord)));
  }
  {
    const db = dbOf();
    const store = storeOf(db);
    const mon = at(W(1), 4, 15);
    const [a, b] = await Promise.all([freezeWeekQuests(U, mon, "CRON", { ...ON, store }), freezeWeekQuests(U, mon, "RENDER", { ...ON, store })]);
    eq("two concurrent freezes leave one row", [a.froze + b.froze, db.weeks.length], [1, 1]);
  }
  {
    // Two devices open Today at once before any freeze: both read the live set, both schedule the fallback freeze.
    const db = dbOf();
    const store = storeOf(db);
    const t = at(addDays(W(1), 1), 7);
    const [l1, l2] = await Promise.all([loadWeekQuests(U, t, { ...ON, store }), loadWeekQuests(U, t, { ...ON, store })]);
    check("two devices: both read the same live set, unfrozen", !!l1 && !!l2 && !l1.frozen && !l2.frozen && canon(l1.set) === canon(l2.set));
    const [f1, f2] = await Promise.all([freezeWeekQuests(U, t, "RENDER", { ...ON, store }), freezeWeekQuests(U, t, "RENDER", { ...ON, store })]);
    const after = await loadWeekQuests(U, at(addDays(W(1), 1), 9), { ...ON, store });
    eq("… their fallback freezes leave one row, and the next read is that row", [f1.froze + f2.froze, db.weeks.length, after?.frozen, canon(after?.set) === canon(l1?.set)], [1, 1, true, true]);
  }
  {
    const db = dbOf();
    db.rest = Array.from({ length: 7 }, (_, i) => ({ day: addDays(W(1), i), kind: "VACATION", declaredAt: at(addDays(M, -10), 9), cancelledAt: null }));
    const store = storeOf(db);
    await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...ON, store });
    eq("an empty (HELD) set is frozen", [db.weeks.length, db.weeks[0]?.state, json(db.weeks[0]?.quests)], [1, "HELD", "[]"]);
    db.rest = [];
    const load = await loadWeekQuests(U, at(addDays(W(1), 2), 9), { ...ON, store });
    eq("… and not regenerated when the holds are gone", [load?.frozen, load?.set.state, load?.set.quests.length], [true, "HELD", 0]);
  }
  {
    const db = dbOf();
    const store = storeOf(db);
    const off = await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...OFF, store });
    const fin = await finalizeQuestWeeks(U, at(W(3), 9), { ...OFF, store });
    const load = await loadWeekQuests(U, at(addDays(W(1), 1), 9), { ...OFF, store });
    eq("writes off: nothing is frozen or finalised", [off, fin.skipped, db.weeks.length], [{ froze: 0, skipped: "WRITES_OFF" }, "WRITES_OFF", 0]);
    check("… and the live set is labelled 'not recorded on this server' (view.writesOff)", !!load && !load.frozen && load.view.writesOff);
  }
  {
    const db = dbOf({ domainDecision: "KEPT" });
    const store = storeOf(db);
    const f = await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...ON, store });
    eq("a milestone whose Domain is still Gemini's kept words never has a set", [f.froze, db.weeks.length, await loadWeekQuests(U, at(W(1), 9), { ...ON, store })], [0, 0, null]);
  }
  {
    const db = dbOf();
    db.facts[0].roadmap.status = "ARCHIVED";
    const store = storeOf(db);
    eq("an archived roadmap: no open milestone, nothing frozen", [await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...ON, store }), await loadWeekQuests(U, at(W(1), 9), { ...ON, store })], [{ froze: 0, skipped: "NO_ROADMAP" }, null]);
  }
  {
    // PAST_DUE: frozen as an empty set; Today shows nothing; the note is the roadmap's.
    const db = dbOf();
    const store = storeOf(db);
    const wk = addDays(ADD_DUE, 1);
    await freezeWeekQuests(U, at(wk, 4, 15), "CRON", { ...ON, store });
    const load = await loadWeekQuests(U, at(wk, 9), { ...ON, store });
    eq("PAST_DUE is frozen as an empty set", [db.weeks[0]?.state, load?.view.rows.length, load?.view.notes.length], ["PAST_DUE", 0, 0]);
    eq("… with the roadmap note on the roadmap variant", load ? weekQuestsViewFor(load, "roadmap").notes : null, ["Milestone 2 was due Sun 27 Dec — close or reschedule it"]);
  }

  console.log("— Start's own freeze —");
  {
    // finishStartCore computes the set before its finish transaction writes RoadmapItem.templateId.
    const db = dbOf();
    for (const it of db.items.ms2) it.templateId = null;
    const store = storeOf(db);
    const t = at(addDays(M, 0), 10);
    const bare = await weekQuestSetFor(U, "ms2", M, t, { store });
    const withMap = await weekQuestSetFor(U, "ms2", M, t, { store, overrides: { templateIds: { "lin-p1": "t-bt", "lin-s1": "t-s1" } } });
    eq("before the item rows carry their templates, the set has no session row …", bare?.quests.map((q) => q.kind), ["ADD"]);
    eq("… and with Start's lineage → template map it has (overrides keyed by lineage id)", withMap?.quests.map((q) => q.kind), ["ADD", "PRACTICE"]);
    // startPreview: nothing exists yet; the preview's snapshot, today and placeholder ids.
    const pre = dbOf({ status: "PLANNED" });
    pre.facts[0].milestone.startedDay = null;
    pre.facts[0].milestone.feasibility = PLAN_STUB;
    pre.facts[0].goal = null;
    pre.templates = [];
    for (const it of pre.items.ms2) it.templateId = null;
    const thu = addDays(M, 3);
    const preStore = storeOf(pre);
    eq("a PLANNED milestone with no snapshot has no set without overrides", await weekQuestSetFor(U, "ms2", M, at(thu, 10), { store: preStore }), null);
    const facts = (await preStore.milestones(U, { milestoneIds: ["ms2"] }))[0];
    eq("weekQuestInputFor: not started and no snapshot → null", await weekQuestInputFor(preStore, U, facts, M, at(thu, 10)), null);
    const preview = await weekQuestSetFor(U, "ms2", M, at(thu, 10), {
      store: preStore,
      overrides: { startedDay: thu, snapshot: snapshotOf({ startedDay: thu, dueDay: ADD_DUE, level: 6, newNeededStart: 11 }), templateIds: { "lin-p1": "preview-p1", "lin-s1": "preview-s1" } },
    });
    eq("the Start preview: 'Week quests if you start now' from the item's own rule, Thursday to Sunday", preview && pick(preview, "PRACTICE")?.label, "Backtest · 2 sessions × 45 min");
  }

  console.log("— independence from the freeze time —");
  {
    const a = dbOf();
    const b = dbOf();
    // Between Monday 04:00 and Wednesday 10:00 on store b: 3 cards added, a rest day declared for Friday, a cancellation of Thursday's.
    const wk = W(1);
    b.rest.push({ day: addDays(wk, 3), kind: "REST", declaredAt: at(addDays(M, 3), 9), cancelledAt: at(addDays(wk, 1), 9) });
    a.rest.push({ day: addDays(wk, 3), kind: "REST", declaredAt: at(addDays(M, 3), 9), cancelledAt: null });
    for (let i = 0; i < 3; i++) b.ideas.push({ id: `late${i}`, domainId: "d-risk", level: 1, dueDate: at(addDays(wk, 1), 9), graceEndsAt: null, createdAt: at(addDays(wk, 1), 11), isArchived: false });
    b.rest.push({ day: addDays(wk, 4), kind: "REST", declaredAt: at(addDays(wk, 1), 12), cancelledAt: null });
    await freezeWeekQuests(U, at(wk, 4, 15), "CRON", { ...ON, store: storeOf(a) });
    await freezeWeekQuests(U, at(addDays(wk, 2), 10), "RENDER", { ...ON, store: storeOf(b) });
    const sa = setOfStored(a.weeks[0]);
    const sb = setOfStored(b.weeks[0]);
    eq("the cron's set (Mon 04:15) and a render's (Wed 10:00) ask the same quests", sb.quests, sa.quests);
    eq("… with the same basis except the line naming when card levels were read", sb.basis.slice(1), sa.basis.slice(1));
    check("… which names it: 'card levels, read Mon 04:15' vs 'read Wed 10:00'", /read Mon 04:15\./.test(sa.basis[0]) && /read Wed 10:00\./.test(sb.basis[0]), `${sa.basis[0]} | ${sb.basis[0]}`);
    const lb = await loadWeekQuests(U, at(addDays(wk, 2), 11), { ...ON, store: storeOf(b) });
    const addOrd = sb.quests.find((q) => q.kind === "ADD")?.ord;
    eq("… and the 3 cards added count as ADD progress, not as existing cards", lb?.progress.find((p) => p.ord === addOrd)?.progress, 3);
    const held = heldDaysAsOf(b.rest, dayStartOf(wk), wk, addDays(wk, 6));
    eq("heldDaysAsOf: a hold cancelled after Monday still holds; one declared after Monday doesn't", [...held], [addDays(wk, 3)]);
    // A review that passed in between changes only card levels, which the basis names.
    const c = dbOf();
    c.ideas = c.ideas.map((i) => (i.level === 4 ? { ...i, level: 5, dueDate: at(addDays(wk, 2), 9) } : i));
    await freezeWeekQuests(U, at(addDays(wk, 2), 10), "RENDER", { ...ON, store: storeOf(c) });
    const sc = setOfStored(c.weeks[0]);
    const levelFree = (set: WeekQuestSet) => set.quests.filter((q) => q.kind !== "RAISE" && q.kind !== "ADD").map((q) => ({ ...q, ord: 0 }));
    check("a review between the turn and the freeze moves only what card levels move", json(levelFree(sc)) === json(levelFree(sa)) && /read Wed 10:00/.test(sc.basis[0]), json(sc.basis[0]));
  }

  console.log("— window edges —");
  {
    const db = dbOf();
    const store = storeOf(db);
    const wk = W(1);
    await freezeWeekQuests(U, at(wk, 4, 15), "CRON", { ...ON, store });
    const sun = addDays(wk, 6);
    const nextMon = addDays(wk, 7);
    const push = (id: string, createdAt: Date, over: Partial<Idea> = {}) => db.ideas.push({ id, domainId: "d-risk", level: 1, dueDate: createdAt, graceEndsAt: null, createdAt, isArchived: false, ...over });
    push("sun2330", at(sun, 23, 30));
    push("mon0359", at(nextMon, 3, 59));
    push("mon0400", at(nextMon, 4, 0));
    push("mon0359before", at(wk, 3, 59));
    push("archived", at(addDays(wk, 2), 9), { isArchived: true });
    push("refiled", at(addDays(wk, 2), 9), { domainId: "d-other" });
    const load = await loadWeekQuests(U, at(nextMon, 3, 30), { ...ON, store });
    const addOrd = load?.set.quests.find((q) => q.kind === "ADD")?.ord;
    eq(
      "ADD: Sunday 23:30 and Monday 03:59 count for the week; Monday 04:00 doesn't, nor last Monday 03:59, an archived or a re-filed card",
      load?.progress.find((p) => p.ord === addOrd)?.progress,
      2
    );
  }

  console.log("— finalisation —");
  {
    const db = dbOf();
    const store = storeOf(db);
    const wk = W(1);
    await freezeWeekQuests(U, at(wk, 4, 15), "CRON", { ...ON, store });
    const set = setOfStored(db.weeks[0]);
    const pOrd = set.quests.find((q) => q.kind === "PRACTICE")?.ord;
    // Sessions: Tue, Thu, and Sunday's recorded on Monday at 08:00 (record-yesterday).
    db.instances.push({ templateId: "t-bt", day: addDays(wk, 1), status: "DONE", repaired: false });
    db.instances.push({ templateId: "t-bt", day: addDays(wk, 3), status: "DONE", repaired: false });
    db.instances.push({ templateId: "t-bt", day: addDays(wk, 6), status: "DONE", repaired: false, createdAt: at(addDays(wk, 7), 8) });
    // A sick day and a rest day declared after the freeze.
    db.rest.push({ day: addDays(wk, 4), kind: "SICK", declaredAt: at(addDays(wk, 4), 9), cancelledAt: null });
    db.rest.push({ day: addDays(wk, 5), kind: "REST", declaredAt: at(addDays(wk, 4), 9), cancelledAt: null });
    const tue = await finalizeQuestWeeks(U, at(addDays(wk, 8), 20), { ...ON, store });
    const wed0359 = await finalizeQuestWeeks(U, at(addDays(wk, 9), 3, 59), { ...ON, store });
    eq("nothing is written before Wednesday 04:00", [tue.finalized, wed0359.finalized, db.weeks[0].finalizedAt], [0, 0, null]);
    const settling = await loadPastWeeks(U, "rm1", addDays(wk, 8), { store });
    eq("… and the week reads 'still settling'", settling.map((p) => [p.weekStart, p.settled]), [[wk, false]]);
    const wed = await finalizeQuestWeeks(U, at(addDays(wk, 9), 4), { ...ON, store });
    const again = await finalizeQuestWeeks(U, at(addDays(wk, 9), 5), { ...ON, store });
    eq("Wednesday 04:00 writes the results once; a second run is a no-op", [wed.finalized, again.finalized], [1, 0]);
    const results = db.weeks[0].results as { rows: { ord: number; progress: number }[]; heldAfterFreeze: number; closedDay: DayKey | null; eligibleDays: number };
    eq("a Sunday session recorded on Monday at 08:00 counts: 3 of 3 sessions", results.rows.find((r) => r.ord === pOrd)?.progress, 3);
    eq("days held after the freeze are counted, with the window's eligible days", [results.heldAfterFreeze, results.eligibleDays, results.closedDay], [2, 7, null]);
    const { progress } = await questProgressFor(store, U, set);
    eq("the rows match questProgress over the closed window", results.rows.map((r) => r.progress), progress.map((p) => p.progress));
    const past = await loadPastWeeks(U, "rm1", addDays(wk, 9), { store });
    eq("the past line: settled, with '· 2 days held'", past.map((p) => [p.settled, p.heldDays]), [[true, 2]]);
  }
  {
    // A mid-week close: the closed window ends on the close day; final 3 days after it; the next milestone's set is apart.
    const wk = W(1);
    const db = dbOf();
    const store = storeOf(db);
    await freezeWeekQuests(U, at(wk, 4, 15), "CRON", { ...ON, store });
    db.instances.push({ templateId: "t-bt", day: addDays(wk, 1), status: "DONE", repaired: false });
    db.instances.push({ templateId: "t-bt", day: addDays(wk, 4), status: "DONE", repaired: false });
    db.facts[0].goal = { id: "g2", dueDay: ADD_DUE, closed: true, closedDay: addDays(wk, 2), archivedDay: null };
    const early = await finalizeQuestWeeks(U, at(addDays(wk, 4), 9), { ...ON, store });
    const done = await finalizeQuestWeeks(U, at(addDays(wk, 5), 9), { ...ON, store });
    const results = db.weeks[0].results as { closedDay: DayKey; rows: { ord: number; progress: number }[] };
    const pOrd = setOfStored(db.weeks[0]).quests.find((q) => q.kind === "PRACTICE")?.ord;
    eq("a milestone closed Wednesday: final from Saturday 04:00, closedDay set, Friday's session not counted", [early.finalized, done.finalized, results.closedDay, results.rows.find((r) => r.ord === pOrd)?.progress], [0, 1, addDays(wk, 2), 1]);
    const open = await loadWeekQuests(U, at(addDays(wk, 5), 10), { ...ON, store });
    eq("… and Today shows no set for the closed milestone", open, null);
  }

  console.log("— past weeks —");
  {
    const db = dbOf();
    const store = storeOf(db);
    for (const k of [1, 2, 3]) await freezeWeekQuests(U, at(W(k), 4, 15), "CRON", { ...ON, store });
    const list = await loadPastWeeks(U, "rm1", addDays(W(3), 2), { store });
    eq("past weeks: newest first, without this week's open set", list.map((p) => p.weekStart), [W(2), W(1)]);
    check("past week lines never carry an owed or missed word (the shape has none)", list.every((p) => Object.keys(p).every((k) => !/owed|miss/i.test(k))));
  }
}

// ═══ Isolation, names and the SQL against the migration ═════════════════════

function greps() {
  console.log("— isolation and names —");
  const files = ["src/lib/roadmap-quests.ts", "src/lib/roadmap-quests-server.ts"];
  const src = files.map(read).join("\n");
  check("roadmap-quests* import nothing from roadmap-model, roadmap-validate, roadmap-evidence or gemini", !/from\s+["'][^"']*(roadmap-(model|validate|evidence)|gemini)["']/.test(src) && !/import\(\s*["'][^"']*(roadmap-(model|validate|evidence)|gemini)["']/.test(src));

  // Transitively: no module either file reaches imports a model module.
  const reached = new Set<string>();
  const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](\.{1,2}\/[^"']+)["']|import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  const walk = (file: string) => {
    if (reached.has(file)) return;
    reached.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const base = resolve(dirname(file), m[1] ?? m[2]);
      const hit = [".ts", ".tsx", "/index.ts"].map((e) => base + e).find((p) => existsSync(p));
      if (hit) walk(hit);
    }
  };
  for (const f of files) walk(join(ROOT, f));
  const models = [...reached].filter((f) => /(roadmap-(model|validate|evidence)|gemini|life-sizing)\.ts$/.test(f));
  check(`no week quest path reaches a model module (${reached.size} modules walked)`, models.length === 0, models.join(", "));

  check("neither file imports review-facts, board-ui, full-day, titles, field-tier or skill-visuals", !/from\s+["'][^"']*\/(review-facts|board-ui|full-day|titles|field-tier|skill-visuals)["']/.test(src));
  const decl = /\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  const names = [...src.matchAll(decl)].map((m) => m[1]);
  const bad = names.filter((n) => /^(quest|Quest|questOf|questTargetOf|QuestState|questStateOf|QUEST_CAP)$/.test(n) || /^QUEST_/.test(n) || /skill|mastery/i.test(n) || /^Mp$|^mp$/.test(n));
  check("no declared identifier takes a review-quest name, or says skill, mastery or Mp", bad.length === 0, bad.join(", "));
  check("no 'Quest n of' anywhere in the quest modules", !/Quest \d+ of|Quest \$\{[^}]+\} of/.test(src));
  check("the brand constructors measured/recorded/selfReported are used only for evidence figures here; codeText() never", !/\bcodeText\(/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")));
  check("no href to /review in the quest modules", !/["'`]\/review/.test(src));
  check("the pattern list picks out the PAST_DUE, lag and capacity lines", WEEK_QUEST_NOTE_PATTERNS.length === 8);

  console.log("— SQL against the migration —");
  const migration = read("prisma/migrations/20261101000000_life_roadmap/migration.sql");
  const tableCols = (table: string) => {
    const m = new RegExp(`CREATE TABLE "public"\\."${table}" \\(([\\s\\S]*?)\\n\\);`).exec(migration);
    return new Set(m ? [...m[1].matchAll(/^\s*"(\w+)"/gm)].map((x) => x[1]) : []);
  };
  const server = read("src/lib/roadmap-quests-server.ts");
  const insert = /INSERT INTO "public"\."RoadmapQuestWeek"\s*\(([^)]*)\)/.exec(server);
  const insertCols = insert ? [...insert[1].matchAll(/"(\w+)"/g)].map((x) => x[1]) : [];
  const qw = tableCols("RoadmapQuestWeek");
  check("the freeze INSERT names only RoadmapQuestWeek's columns, every NOT NULL one without a default", insertCols.length === 13 && insertCols.every((c) => qw.has(c)) && ["id", "userId", "roadmapId", "milestoneId", "weekStart", "dedupeKey", "source", "generator", "quests", "basis"].every((c) => insertCols.includes(c)), insertCols.join(","));
  check("the freeze is ON CONFLICT (\"userId\", \"dedupeKey\") DO NOTHING, the unique index's columns", /ON CONFLICT \("userId", "dedupeKey"\) DO NOTHING/.test(server) && /UNIQUE INDEX "RoadmapQuestWeek_userId_dedupeKey_key" ON "public"\."RoadmapQuestWeek"\("userId", "dedupeKey"\)/.test(migration));
  check("finalisation is guarded on finalizedAt IS NULL (updateMany where finalizedAt: null)", /updateMany\(\{\s*where: \{ id, finalizedAt: null \}/.test(server));
  const rCols = tableCols("Roadmap");
  const mCols = tableCols("RoadmapMilestone");
  const used = (alias: string) => [...server.matchAll(new RegExp(`\\b${alias}\\."(\\w+)"`, "g"))].map((x) => x[1]);
  const missingR = used("r").filter((c) => !rCols.has(c));
  const missingM = used("m").filter((c) => !mCols.has(c));
  const schema = read("prisma/schema.prisma");
  const tt = /model TaskTemplate \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
  const missingT = used("t").filter((c) => !new RegExp(`^\\s+${c}\\s`, "m").test(tt));
  check("the milestone query names only real Roadmap, RoadmapMilestone and TaskTemplate columns", missingR.length + missingM.length + missingT.length === 0, [...missingR, ...missingM, ...missingT].join(","));
  check("the checkpoint log prefix is the SELF key space", checkpointLogPrefix("lin-cp") === "SELF|CHECKPOINT|i:lin-cp|n:");
}

// ═══ Fix round (roadmap-contracts.md §9; the three reviews) ═════════════════

async function fixRound() {
  const U = "user1";

  console.log("— fix: QUESTS_BEHIND is the trigger's, rendered once —");
  {
    const behindSet = weekQuestsFor(inputOf({ weekStart: W(3), startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards) }));
    const onPace = weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards) }));
    const viewOf = (set: WeekQuestSet, variant: "roadmap" | "aim") =>
      weekQuestsViewOf({ set, progress: [], variant, milestone: { ord: 2, of: 3, title: "Risk and position sizing", dueDay: ADD_DUE }, level: 6, frozen: true, writesOff: false, places: {} });
    check("fixture: the week-4 set is behind", questsBehind(behindSet));
    check(
      "the roadmap and Aim variants never carry the QUESTS_BEHIND sentence in their notes (the trigger banner is its one place)",
      [viewOf(behindSet, "roadmap"), viewOf(behindSet, "aim")].every((v) => v.notes.every((n) => !/^Behind on new cards/.test(n))),
      json(viewOf(behindSet, "roadmap").notes)
    );
    check("… while the basis keeps the catch-up line for the 'How these were set' sheet", viewOf(behindSet, "roadmap").basis.some((b) => /asks 4 of the 8 new cards needed to stay on plan/.test(b)));
    const tm = { ord: 2, cardPaces: [], pays: [], practice: null, carried: false, checkpoint: null, id: "ms2", dueDay: ADD_DUE, level: 6 };
    const hits = triggersOf({ milestones: [tm], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: behindSet });
    eq(
      "R1's trigger fires once on the same frozen set, in the one wording (questsBehindLine)",
      hits.map((h) => [h.trigger, h.milestoneOrd, h.line]),
      [["QUESTS_BEHIND", 2, questsBehindLine(behindSet, { ord: 2, level: 6, dueDay: ADD_DUE })]]
    );
    eq("… and neither fires on the on-pace week", [triggersOf({ milestones: [tm], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: onPace }).length, questsBehind(onPace)], [0, false]);
  }

  console.log("— fix: writes off shows stored sets as recorded —");
  {
    // §9.3: only values computed on the request read "not recorded on this server"; a set the live app froze is its record.
    const db = dbOf();
    const store = storeOf(db);
    await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...ON, store });
    const off = await loadWeekQuests(U, at(addDays(W(1), 1), 9), { ...OFF, store });
    eq(
      "writes off: a frozen set reads as recorded on every variant (frozen, writesOff false)",
      [off?.frozen, off?.view.writesOff, off ? weekQuestsViewFor(off, "roadmap").writesOff : null, off ? weekQuestsViewFor(off, "aim").writesOff : null],
      [true, false, false, false]
    );
  }

  console.log("— fix: one due day (milestoneDueDayOf) —");
  {
    // Rescheduled: the milestone was due ADD_DUE, its goal now 14 days later. The goal's day wins everywhere here.
    const db = dbOf();
    const later = addDays(ADD_DUE, 14);
    db.facts[0].goal = { id: "g2", dueDay: later, closed: false, closedDay: null, archivedDay: null };
    const store = storeOf(db);
    const wk = addDays(ADD_DUE, 1); // the Monday after the milestone's own due day
    const input = await weekQuestInputFor(store, U, db.facts[0], wk, at(wk, 9));
    eq("weekQuestInputFor reads the goal's due day after a Reschedule", input?.milestone.dueDay, later);
    await freezeWeekQuests(U, at(wk, 4, 15), "CRON", { ...ON, store });
    const load = await loadWeekQuests(U, at(wk, 9), { ...ON, store });
    eq("… so the week after the old due day is OPEN, not PAST_DUE", [db.weeks[0]?.state, load?.set.state], ["OPEN", "OPEN"]);
    eq("… and the view's milestone due day is the goal's (no 'was due' note)", [load?.viewInput.milestone.dueDay, load ? weekQuestsViewFor(load, "roadmap").notes.filter((n) => /was due/.test(n)).length : -1], [later, 0]);
    const noGoal = dbOf();
    noGoal.facts[0].goal = { id: "g2", dueDay: null, closed: false, closedDay: null, archivedDay: null };
    eq("a goal with no due day falls back to the milestone's", (await weekQuestInputFor(storeOf(noGoal), U, noGoal.facts[0], W(1), at(W(1), 9)))?.milestone.dueDay, ADD_DUE);
  }

  console.log("— fix: positions and the superseded row —");
  {
    const rows = [
      { id: "m1", lineageId: "L1", ord: 1, status: "STARTED", version: 1 },
      { id: "m2", lineageId: "L2", ord: 2, status: "STARTED", version: 1 }, // dropped
      { id: "m2b", lineageId: "L2", ord: 2, status: "PLANNED", version: 1 }, // its "Start again" copy
      { id: "m3", lineageId: "L3", ord: 3, status: "PLANNED", version: 1 },
      { id: "m3old", lineageId: "L3", ord: 3, status: "SUPERSEDED", version: 1 },
      { id: "m4d", lineageId: "L4", ord: 4, status: "PLANNED", version: 2 }, // a re-plan draft row above the roadmap's version
    ];
    const { placeOf, of } = scheduledPlacesOf(rows, 1);
    eq("a dropped row and its copy share one place, and 'of' counts positions (3, not 4)", [placeOf.get("m1"), placeOf.get("m2"), placeOf.get("m2b"), placeOf.get("m3"), placeOf.get("m4d") ?? null, of], [1, 2, 2, 3, null, 3]);

    // Drop, Start again, the copy starts, then the original's goal is unarchived: the copy is the open milestone.
    const db = dbOf();
    const orig = db.facts[0];
    orig.milestone.version = 1;
    orig.milestone.createdAt = at(addDays(M, -30), 9);
    const copySnap = snapshotOf({ startedDay: W(1), dueDay: addDays(ADD_DUE, 7), level: 6, newNeededStart: 11 });
    const copy: QuestMilestoneFacts = {
      roadmap: orig.roadmap,
      milestone: { ...orig.milestone, id: "ms2b", status: "STARTED", startedDay: W(1), dueDay: addDays(ADD_DUE, 7), feasibility: copySnap, goalId: "g2b", createdAt: at(addDays(W(1), -1), 9) },
      goal: { id: "g2b", dueDay: addDays(ADD_DUE, 7), closed: false, closedDay: null, archivedDay: null },
      place: 2,
      of: 3,
    };
    db.facts.push(copy);
    db.items.ms2b = db.items.ms2.map((i) => ({ ...i }));
    db.measures.ms2b = db.measures.ms2.map((x) => ({ ...x }));
    const store = storeOf(db);
    eq("the unarchived original is superseded once its copy has started: the copy is the open milestone", openMilestoneOf(db.facts)?.milestone.id, "ms2b");
    const f = await freezeWeekQuests(U, at(addDays(W(1), 1), 9), "RENDER", { ...ON, store });
    const load = await loadWeekQuests(U, at(addDays(W(1), 1), 10), { ...ON, store });
    eq("… so the week freezes and loads the copy's set, never the original's", [f.froze, db.weeks.map((w) => w.dedupeKey), load?.set.milestoneId], [1, [`rq:ms2b:${W(1)}`], "ms2b"]);
    copy.milestone.status = "PLANNED";
    eq("a copy still PLANNED supersedes nothing: the unarchived original stays open (it undoes DROPPED)", openMilestoneOf(db.facts)?.milestone.id, "ms2");
    copy.milestone.status = "STARTING";
    eq("a copy mid-Start (STARTING) supersedes the original, and is not open itself yet", openMilestoneOf(db.facts), null);
  }

  console.log("— fix: a plan-only edit keeps Gemini's number off Today —");
  {
    const edited = dbOf();
    const p1 = edited.items.ms2.find((i) => i.id === "p1") as QuestItemRow;
    Object.assign(p1, { label: "Backtest 50 trades", origin: "GEMINI", decision: "EDITED", flags: ["NUMBER"] });
    const cp = edited.items.ms2.find((i) => i.id === "cp") as QuestItemRow;
    Object.assign(cp, { label: "Score 70 on a mock test", origin: "GEMINI", decision: "EDITED", flags: ["NUMBER"] });
    const cpWeek = W(6); // the window passes 80% this week, so the checkpoint is asked
    const plan = await weekQuestSetFor(U, "ms2", cpWeek, at(cpWeek, 9), { store: storeOf(edited) });
    check(
      "EDITED with the NUMBER flag still set (sessions or the bar changed, not the words): no PRACTICE or CHECKPOINT quest carries it",
      !!plan && !plan.quests.some((q) => q.kind === "PRACTICE" || q.kind === "CHECKPOINT") && plan.quests.every((q) => !/50|70/.test(q.label)),
      json(plan?.quests.map((q) => q.label))
    );
    p1.flags = [];
    cp.flags = [];
    const words = await weekQuestSetFor(U, "ms2", cpWeek, at(cpWeek, 9), { store: storeOf(edited) });
    eq(
      "… once the words were edited (R4 clears the flags) they are the user's and reach the set",
      words?.quests.filter((q) => q.kind === "PRACTICE" || q.kind === "CHECKPOINT").map((q) => q.label),
      ["Backtest 50 trades · 3 sessions × 45 min", "Checkpoint: Score 70 on a mock test · log your score"]
    );
  }

  console.log("— fix: the freeze and the finaliser report their failures —");
  {
    const boom = (msg: unknown) => {
      throw msg;
    };
    // The failures below are intended: capture what they log instead of printing it.
    const logged: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => void logged.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    const db = dbOf();
    const broken: QuestStore = { ...storeOf(db), milestones: async () => boom(new Error("connection reset\n    at Socket.onclose")) };
    const fr = await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...ON, store: broken });
    eq("a failing freeze returns its error in words (one line) and writes nothing", [fr, db.weeks.length], [{ froze: 0, skipped: null, error: "connection reset at Socket.onclose" }, 0]);
    const missing = Object.assign(new Error("The table `public.RoadmapQuestWeek` does not exist in the current database."), { code: "P2021", meta: { table: "public.RoadmapQuestWeek" } });
    const gone: QuestStore = { ...storeOf(db), milestones: async () => boom(missing) };
    const fm = await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...ON, store: gone });
    eq("a missing table stays a skip, not an error", [fm.skipped, "error" in fm], ["MISSING_TABLE", false]);

    // Two settled weeks; the second write fails: the first stays written and the run says why.
    const db2 = dbOf();
    const s2 = storeOf(db2);
    for (const k of [1, 2]) await freezeWeekQuests(U, at(W(k), 4, 15), "CRON", { ...ON, store: s2 });
    let calls = 0;
    const flaky: QuestStore = {
      ...s2,
      finalizeQuestWeek: async (id, results, now) => {
        calls += 1;
        if (calls === 2) boom("disk full");
        return s2.finalizeQuestWeek(id, results, now);
      },
    };
    const fin = await finalizeQuestWeeks(U, at(addDays(W(3), 2), 4), { ...ON, store: flaky });
    eq("a failing finalisation keeps the weeks it wrote and returns the error", [fin, db2.weeks.map((w) => w.finalizedAt != null)], [{ finalized: 1, skipped: null, error: "disk full" }, [true, false]]);
    const rerun = await finalizeQuestWeeks(U, at(addDays(W(3), 2), 5), { ...ON, store: s2 });
    eq("… and a rerun writes only the rest", [rerun, db2.weeks.map((w) => w.finalizedAt != null)], [{ finalized: 1, skipped: null }, [true, true]]);
    eq(
      "the roadmap step's errors name both (roadmapStepErrorsOf, lane G's report)",
      roadmapStepErrorsOf({ freeze: fr, readings: { written: 0, reaches: 0, skipped: null }, finalize: fin }),
      ["freeze: connection reset at Socket.onclose", "finalize: disk full"]
    );
    console.error = realError;
    eq("… and each failure is logged too (a missing table is not)", logged.map((l) => l.split(":")[0]), ["week quests not frozen", "week quests not finalised"]);
    const long = questErrorText(new Error("x".repeat(1000)));
    eq("questErrorText caps a long message at 300 characters", [long.length, long.endsWith("…"), questErrorText(""), questErrorText(new Error(""))], [300, true, "unknown error", "Error"]);
  }

  console.log("— fix: a row's place is the board's own (placementOf) —");
  {
    const wk = W(1);
    const wed = addDays(wk, 2);
    const thu = addDays(wk, 3);
    const tpl = (over: Partial<QuestTemplateRow>): QuestTemplateRow => ({ id: "tp", recurrence: null, startDay: M, estMinutes: 30, completedAt: null, archivedAt: null, ...over });
    const done = (day: DayKey): QuestInstanceRow => ({ templateId: "tp", day, status: "DONE", repaired: false });
    const cases: [string, QuestTemplateRow, DayKey, QuestInstanceRow[], string | null][] = [
      ["a TARGET:3/W habit short of its target", tpl({ recurrence: "TARGET:3/W" }), wed, [done(wk)], "in Habits"],
      ["a TARGET:3/W habit already met this week, not today (the board files it in Anytime)", tpl({ recurrence: "TARGET:3/W" }), thu, [done(wk), done(addDays(wk, 1)), done(wed)], "in Anytime"],
      ["a habit done today (its row stays in Habits, ticked)", tpl({ recurrence: "TARGET:3/W" }), wed, [done(wed)], "in Habits"],
      ["a DOW:1,4 habit on a Wednesday (Coming up, under Anytime)", tpl({ recurrence: "DOW:1,4" }), wed, [], "in Anytime"],
      ["the same on its Thursday", tpl({ recurrence: "DOW:1,4" }), thu, [], "in Habits"],
      ["a compulsory daily habit", tpl({ recurrence: "DAILY", compulsory: true }), wed, [], "in Must"],
      ["an undated step", tpl({}), wed, [], "in Anytime"],
      ["a step put off to Friday (Planned later, under Anytime)", tpl({ planDay: addDays(wk, 4), dueDay: addDays(wk, 5), dueKind: "DEADLINE" }), wed, [], "in Anytime"],
      ["a step planned for today", tpl({ dueDay: wed, dueKind: "PLANNED" }), wed, [], "in Planned"],
      ["a step ticked today (its row stays in Planned)", tpl({ dueDay: wed, dueKind: "PLANNED", completedAt: at(wed, 9) }), wed, [done(wed)], "in Planned"],
      ["an inbox item", tpl({ inbox: true }), wed, [], "in Inbox"],
      ["a step done on an earlier day (off the board)", tpl({ completedAt: at(addDays(wk, 1), 9) }), wed, [], null],
    ];
    for (const [name, t, day, insts, want] of cases) {
      const text = questPlaceOfTemplate(t, day, insts);
      eq(`place: ${name} → ${want ?? "none"}`, text, want);
      if (text == null) continue;
      const seek = seekPlaceOf({ templates: [boardTemplateOf(t)], instances: boardInstancesOf(t.id, insts), stats: {}, today: day } as unknown as Parameters<typeof seekPlaceOf>[0], t.id);
      check(
        `… and TodayBoard's seek opens the same section (${text})`,
        seek.found && (text.startsWith("in Anytime") ? seek.open === "anytime" : text === "in Inbox" ? seek.open === "inbox" : seek.open === null),
        json(seek)
      );
    }

    // Through the load: the fixture's TARGET:3/W practice sits in Habits on a Wednesday with nothing ticked.
    const db = dbOf();
    const store = storeOf(db);
    const load = await loadWeekQuests(U, at(wed, 10), { ...ON, store });
    eq("loadWeekQuests: the Today session row says 'in Habits'", load?.view.rows.find((r) => r.kind === "PRACTICE")?.place, "in Habits");
    // The fixture's one step isn't asked until half the window has passed; read the place map with it added.
    const set = load?.set;
    const withStep: WeekQuestSet | null = set ? { ...set, quests: [...set.quests, { ord: 99, kind: "STEP", label: "Step: Draft the risk rules", count: 1, unit: "step", evidence: "SELF_REPORTED", from: wk, to: addDays(wk, 6), templateId: "t-s1", minutes: 30 }] } : null;
    const placed = withStep ? await questProgressFor(store, U, withStep, wed) : null;
    eq("questProgressFor with a day: places for the session and the step", placed?.places, { "t-bt": "in Habits", "t-s1": "in Anytime" });
    eq("questProgressFor without a day (the finaliser): no places", withStep ? (await questProgressFor(store, U, withStep)).places : null, {});
    // A TARGET /M habit met earlier in the month: the read starts at the month's start, so the board's 'met' holds.
    const monthly = dbOf();
    const bt = monthly.templates.find((x) => x.id === "t-bt") as QuestTemplateRow;
    bt.recurrence = "TARGET:8/M";
    for (let i = 0; i < 8; i++) monthly.instances.push({ templateId: "t-bt", day: addDays(M, i), status: "DONE", repaired: false });
    const mView = (await loadWeekQuests(U, at(wed, 10), { ...ON, store: storeOf(monthly) }))?.view;
    const mRow = mView?.rows.find((r) => r.kind === "PRACTICE");
    check("a TARGET:8/M practice met before this week (8 ticks from 2 Nov) reads 'in Anytime', as the board files it", !!mRow && mRow.place === "in Anytime", json(mRow ?? mView?.rows));
  }
}

// ═══ Fix round 2 (roadmap-contracts.md §11): one count of milestones ════════

/**
 * "Week quests · Milestone n" (the PAST_DUE line, the "How these were set"
 * sheet, past weeks) and its "of" must read as every other surface counts:
 * RoadmapView.positions (contracts §11.2: positionCountOf over R4's plan rows,
 * a dropped milestone included, LATER excluded) and Today's chip (R1's
 * goalSeriesEntryOf: the place among the PLANNED, STARTING and STARTED
 * lineages). Pinned on the cases where a raw ord or a row count would differ.
 */
function fixRound2() {
  console.log("— fix round 2: 'Milestone n of m' is the positions count and Today's chip —");
  type Row = { id: string; lineageId: string; ord: number; status: string; version: number };
  const SCHED = new Set(["PLANNED", "STARTING", "STARTED"]);
  /** RoadmapView.positions as contracts §11.2 defines it: R4's planRowsOf (carried rows of any version; the accepted version's PLANNED and LATER), LATER excluded. */
  const positionsOf = (rows: readonly Row[], v: number) =>
    positionCountOf(rows.filter((r) => r.status === "STARTING" || r.status === "STARTED" || (v > 0 && r.version === v && r.status === "PLANNED")));
  /** Today's chip for one row ("Roadmap · milestone 2 of 3"), from R1's own entry builder. */
  const chipOf = (rows: readonly Row[], r: Row): [number, number] => {
    const e = goalSeriesEntryOf({
      milestone: { id: r.id, lineageId: r.lineageId, ord: r.ord, measures: [], items: [], feasibility: null },
      roadmap: { status: "ACTIVE", archiveReason: null, scheduled: rows.filter((x) => SCHED.has(x.status)) },
      stated: null,
      readings: [],
    });
    return [e.ord, e.of];
  };
  const row = (id: string, lineageId: string, ord: number, status: string, version = 1): Row => ({ id, lineageId, ord, status, version });
  const scenarios: { name: string; rows: Row[]; v: number; places: Record<string, number | null>; of: number }[] = [
    {
      // Lens 2 (fix round 2): the roadmap page counted rows that are not DROPPED and read "of 5"; every other surface reads 6.
      name: "a dropped milestone with no copy still holds its place",
      rows: [
        row("m1", "L1", 1, "STARTED"),
        row("m2", "L2", 2, "STARTED"), // dropped: its goal is archived, the row stays STARTED
        row("m3", "L3", 3, "PLANNED"),
        row("m4", "L4", 4, "PLANNED"),
        row("m5", "L5", 5, "PLANNED"),
        row("m6", "L6", 6, "PLANNED"),
        row("m7", "L7", 7, "LATER"),
      ],
      v: 1,
      places: { m1: 1, m2: 2, m3: 3, m4: 4, m5: 5, m6: 6, m7: null },
      of: 6,
    },
    {
      name: "a dropped row and its started copy share one place",
      rows: [row("m1", "L1", 1, "STARTED"), row("m2", "L2", 2, "STARTED"), row("c2", "L2", 2, "STARTED"), row("m3", "L3", 3, "PLANNED")],
      v: 1,
      places: { m1: 1, m2: 2, c2: 2, m3: 3 },
      of: 3,
    },
    {
      // acceptCore numbers the accepted draft from the highest carried ord + 1, so the re-planned copy of the dropped
      // milestone 2 takes ord 3 and milestone 6 ord 7: a surface printing the raw ord reads "Milestone 7 of 6".
      name: "drop, Start again, re-plan, accept (the draft's ords follow the carried rows)",
      rows: [
        row("m1", "L1", 1, "STARTED"),
        row("m2", "L2", 2, "STARTED"),
        row("s2", "L2", 2, "SUPERSEDED"),
        row("s3", "L3", 3, "SUPERSEDED"),
        row("s6", "L6", 6, "SUPERSEDED"),
        row("c2", "L2", 3, "PLANNED", 2),
        row("n3", "L3", 4, "PLANNED", 2),
        row("n4", "L4", 5, "PLANNED", 2),
        row("n5", "L5", 6, "PLANNED", 2),
        row("n6", "L6", 7, "PLANNED", 2),
      ],
      v: 2,
      places: { m1: 1, m2: 2, c2: 2, n3: 3, n4: 4, n5: 5, n6: 6, s2: 2, s3: 3, s6: 6 },
      of: 6,
    },
    {
      name: "a milestone moved to Later between two scheduled ones takes no place",
      rows: [row("m1", "L1", 1, "STARTED"), row("m2", "L2", 2, "LATER"), row("m3", "L3", 3, "PLANNED")],
      v: 1,
      places: { m1: 1, m2: null, m3: 2 },
      of: 2,
    },
  ];
  for (const s of scenarios) {
    const { placeOf, of } = scheduledPlacesOf(s.rows, s.v);
    const got = [Object.fromEntries(s.rows.map((r) => [r.id, placeOf.get(r.id) ?? null])), of];
    check(`${s.name}: the places and 'of'`, canon(got) === canon([s.places, s.of]), `got ${canon(got)}, want ${canon([s.places, s.of])}`);
    eq(`… 'of' is RoadmapView.positions (contracts §11.2)`, of, positionsOf(s.rows, s.v));
    const sched = s.rows.filter((r) => SCHED.has(r.status) && r.version <= s.v);
    eq(
      `… each scheduled row reads as Today's chip does (R1 goalSeriesEntryOf)`,
      sched.map((r) => [r.id, placeOf.get(r.id), of]),
      sched.map((r) => [r.id, ...chipOf(s.rows, r)])
    );
  }
}

async function main() {
  await server();
  await fixRound();
  fixRound2();
  greps();
  if (failed > 0) {
    console.log(`\nroadmap-quests-check: ${passed} passed, ${failed} FAILED`);
    process.exit(1);
  }
  console.log(`\nroadmap-quests-check: ${passed} passed, 0 failed`);
}

void main();
