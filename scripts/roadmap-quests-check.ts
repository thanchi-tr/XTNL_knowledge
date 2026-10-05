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
 * Revision 4 (roadmap-rev4.md F-R4-14, F-R4-13, F-R4-16; generator 2): RAISE
 * and ADD are one row each with a part per Domain; RAISE's reach is the
 * reach model at Start's figures (priors while calibrating), each part read
 * from its own measure key, so a slip offsets only its part; ADD's need is
 * coverage's (ceil(WRITE_MARGIN × n_d) less the recall cards held), with a
 * per-Domain catch-up cap and the capacity cap shared in proportion; recall
 * cards only; clean entry on an `rc` part; a v1 set renders unchanged; legacy
 * roadmaps have no week quests; a BODY plan's practice rows carry the health
 * line.
 *
 * Fix round of revision 4 (roadmap-contracts.md §15.1, §15.2, §15.15 R6):
 * WRITE_MARGIN is 1.3, so the ADD goldens are worked at it (the fixtures hold
 * enough recall cards that rev 3's worked example, need 11 → pace 3, caught up
 * at 4, then 3, still holds) and the basis reads the spare from the constant
 * ("1.3 × 18 → 24, a 30% spare"); clean entry is roadmap-types' one rule
 * (isRetryEntry, R1's), so a tagged miss days before the pass, a shield and a
 * degrade read as retries and a later strike keeps a retry entry one, and the
 * server reads the ledger over retryReadDaysOf.
 *
 * Fix round 2 of revision 4 (roadmap-contracts.md §16.1, §16.9 R6): the
 * window is lane 0's widened retryReadDaysOf (184 days at L12, m 1), read
 * through it and never as a number; srs.ts's latest retry entry (a degrade
 * from L, the pass after the lower grace, L held to its interval, grace and
 * the cron's day) reads as a retry at L 12/10/8/6 with the loadout's m and
 * grace, one day narrower as clean, and the old 173-day window's cost (the
 * card counted, RAISE asking nothing) is shown; and R6's half of lens 2's
 * gap 8: Start's set from its overrides equals what its written rows give,
 * a render keeps Start's row, and the next cron reads the StartSnapshot back
 * from its JSON column.
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
import { LIFE_TZ, addDays, dayStartOf, daysBetween, weekdayOf, zonedToInstant, type DayKey } from "../src/lib/life-day";
import type { RestRow } from "../src/lib/duty-rule";
import type { InstanceLike } from "../src/lib/habit";
import type { Track } from "../src/lib/life-types";
import {
  CARD_WRITE_MIN,
  C_PRIOR,
  NON_RECALL_TYPES,
  P_PRIOR,
  RHO_PRIOR,
  WRITE_MARGIN,
  WEEK_QUEST_GENERATOR_VERSION,
  WEEK_QUEST_PARTS_TODAY,
  WEEK_QUESTS_PER_WEEK_MAX,
  bestReach,
  cardsAtLevelKey,
  checkpointLogPrefix,
  cueTextsOf,
  domainName,
  positionCountOf,
  floorBase,
  interval,
  isRetryEntry,
  labelTextOf,
  questWeekKey,
  reachProb,
  retryReadDaysOf,
  roadmapStepErrorsOf,
  writeNeedOf,
  yoursText,
  type AddQuestSpec,
  type CardState,
  type CheckpointQuestSpec,
  type CodeText,
  type MilestoneFeasibility,
  type PracticeQuestSpec,
  type RaiseQuestSpec,
  type ReachParams,
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
  addSpareText,
  nonHeldShareOf,
  pastWeekOf,
  questPartsLineOf,
  questProgress,
  questReachOf,
  questsBehind,
  questsBehindLine,
  scaledCountOf,
  shareOutByPace,
  weekDoneShare,
  weekQuestResultsOf,
  weekQuestsFor,
  weekQuestsViewOf,
  type WeekQuestRowV2,
} from "../src/lib/roadmap-quests";
import { triggersOf } from "../src/lib/roadmap-pace";
import { graceDays } from "../src/lib/xp";
import { cleanReadDaysOf, goalSeriesEntryOf } from "../src/lib/roadmap-readings";
import { seekPlaceOf } from "../src/lib/today-board";
import {
  boardInstancesOf,
  boardTemplateOf,
  checkpointLabelOf,
  finalizeQuestWeeks,
  freezeWeekQuests,
  heldDaysAsOf,
  isLegacyFacts,
  loadPastWeeks,
  loadWeekQuests,
  openMilestoneOf,
  questErrorText,
  questLabelOf,
  questPlaceOfTemplate,
  questGateOf,
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
  type QuestReviewRow,
  type QuestRoadmapRow,
  type QuestStore,
  type QuestTemplateRow,
  type StoredQuestWeek,
} from "../src/lib/roadmap-quests-server";
import { activityConfirmOf, answerActivityCard, catalogTrackOf, constraintsStateOf, coverageJsonOf, type CatalogKey } from "../src/lib/roadmap-catalog";

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

/**
 * A StartSnapshot the way F4 step 13 defines it: needRate_w = newNeeded_start
 * × fw_w ÷ Ww_start. Revision 4: the reach figures at Start (c and ρ default
 * to 1 and 0, so a golden reads the review rules alone unless it sets them;
 * a fixture that leaves cStart null reads the priors) and the per-Domain
 * needs (needRate_{d,w} = newNeeded_start_d × fw_w ÷ Ww_start).
 */
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
  pLongStart?: number;
  cStart?: number | null;
  rhoStart?: number | null;
  calibrating?: StartSnapshot["calibrating"];
  newNeededByDomain?: Record<string, number>;
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
      ...(p.newNeededByDomain ? { needRateByDomain: Object.fromEntries(Object.entries(p.newNeededByDomain).map(([d, n]) => [d, wwDays > 0 ? (n * fwDays) / wwDays : 0])) } : {}),
    });
  }
  const snap: StartSnapshot = {
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
    reachModel: 2,
  };
  if (p.pLongStart != null) snap.pLongStart = p.pLongStart;
  if (p.cStart !== null) snap.cStart = p.cStart ?? 1;
  if (p.rhoStart !== null) snap.rhoStart = p.rhoStart ?? 0;
  if (p.calibrating) snap.calibrating = p.calibrating;
  if (p.newNeededByDomain) snap.newNeededByDomain = { ...p.newNeededByDomain };
  return snap;
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

// ═══ ADD (F13's worked example under F-R4-14): on pace 3, capped by catch-up 4, then 3 ══

console.log("— ADD —");
const ADD_DUE = addDays(M, 55); // Sun, 8 weeks
const addSnap = snapshotOf({ startedDay: M, dueDay: ADD_DUE, level: 6, newNeededStart: 11 });
const RISK = [D("Risk Management")];
/** Generator 2 reads the parts' Domain names from the Domain rows at view time. */
const NAMES: Record<string, ReturnType<typeof D>> = { "d-risk": D("Risk Management"), "d-ps": D("Position Sizing"), "d-prob": D("Probability"), "d-inf": D("Inference"), "d-x": D("Python 3") };
const addCard = (cs: CardState[]): WeekQuestCardInput => ({
  measureKey: cardsAtLevelKey(["d-risk"], 6, "r"),
  domainIds: ["d-risk"],
  domainNames: RISK,
  level: 6,
  target: 18,
  baseline: 8,
  v0: 8,
  cards: cs,
  rateSource: "SCOPE",
  fieldId: "f-trading",
  domainId: "d-risk",
  segment: "r",
});
// 13 recall cards held: the coverage need is ceil(1.3 × 18) − 13 = 24 − 13 = 11 (rev 3's yield gave 11 from 18 cards; F-R4-14 sets it by
// coverage). Fix round (WRITE_MARGIN 1.1 → 1.3, contracts §15.2): the 4 extra level-4 cards, due well after the window, keep rev 3's worked
// example (need 11 → pace 3, caught up at 4, then 3) and leave RAISE's "1 can by Thu 24 Dec" as it was.
const addCards = [...cards(8, 6, addDays(M, 90)), ...cards(1, 4, addDays(M, 40)), ...cards(4, 4, addDays(M, 90))];
{
  eq("fixture: WRITE_MARGIN is 1.3 (contracts §15.2); every ADD golden below is worked at it", WRITE_MARGIN, 1.3);
  eq("fixture: lastCardDay = due − floorBase(6) = Wed of week 5", addSnap.lastCardDay, addDays(M, 30));
  eq("fixture: 31 writing days at Start (Ww_start 4.43)", Math.round(addSnap.wwStart * 7), 31);
  eq("fixture: the coverage need is writeNeedOf(18, 13) = 24 − 13 = 11 (ceil(1.3 × 18), 23.4 rounded up)", writeNeedOf(18, 13), 11);
  eq("… the build round's 9 cards held would need 24 − 9 = 15 at 1.3 (11 at 1.1)", writeNeedOf(18, 9), 15);

  const w1 = weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards) }));
  const a1 = pick(w1, "ADD");
  eq("week 1: Add 3 cards (pace 3 under the cap of 4)", a1 && [a1.label, a1.count, a1.pace, a1.unit, a1.evidence], ["Add 3 cards", 3, 3, "card", "RECORDED"]);
  eq("week 1: one part, for Risk Management", a1?.parts, [{ domainId: "d-risk", count: 3, pace: 3, cappedBy: null }]);
  eq("week 1: generator 2 is stored on the set", [w1.generator, WEEK_QUEST_GENERATOR_VERSION], [2, 2]);
  eq("week 1: no cap bound", w1.cappedBy, null);
  check("week 1: QUESTS_BEHIND does not fire", !questsBehind(w1));
  check("week 1: the basis names the cap 1.5 × 2.5 → 4", hasBasis(w1, /1\.5 × the 2\.5 a week the plan needed at Start \(at least 3\) → 4/));
  check(
    "week 1: the basis names the coverage need from WRITE_MARGIN (1.3 × 18 → 24, a 30% spare, less the 13 cards held)",
    hasBasis(w1, /^Add: Risk Management: still needed 11 new cards \(1\.3 × 18 → 24, a 30% spare because some cards lag, less the 13 cards it holds\) · pace 11 × 7 ÷ 31 days → 3 · /),
    json(w1.basis)
  );
  check("… and never a typed '10%' nor a rounded figure written as an equation ('1.3 × 18 = 24')", !w1.basis.some((b) => /10% spare|× 18 = /.test(b)));
  check("week 1: and that multiple-choice cards don't count", hasBasis(w1, /^Add: multiple-choice cards don't count/));

  const w4 = weekQuestsFor(inputOf({ weekStart: W(3), startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(addCards) }));
  const a4 = pick(w4, "ADD");
  eq("week 4 after three missed weeks: Add 4 cards, capped (pace 8)", a4 && [a4.label, a4.count, a4.pace, a4.parts?.[0]?.cappedBy], ["Add 4 cards", 4, 8, "CATCHUP"]);
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
  eq("week 5 after 4 cards in week 4: newNeeded 24 − 17 = 7, pace 7, cap 3 → Add 3, capped", a5 && [a5.label, a5.count, a5.pace], ["Add 3 cards", 3, 7]);
  eq("week 5: cappedBy CATCHUP", w5.cappedBy, "CATCHUP");

  const w6 = weekQuestsFor(inputOf({ weekStart: W(5), startedDay: M, dueDay: ADD_DUE, snapshot: addSnap, card: addCard(w5Cards) }));
  check("week 6: no ADD after the writing window, and the note says why", !pick(w6, "ADD") && hasBasis(w6, /^Add: No new cards this week: a card written after Wed 2 Dec can't reach level 6 by 27 Dec\./));

  // A p flip: started while p was calibrating, measured later. ADD's need is coverage's, so the pass rate changes nothing in it.
  const calSnap = snapshotOf({ startedDay: M, dueDay: ADD_DUE, level: 6, pCalibrating: true, newNeededStart: 11 });
  const flipIn = inputOf({ weekStart: W(2), startedDay: M, dueDay: ADD_DUE, snapshot: calSnap, card: addCard(addCards) });
  const flip = weekQuestsFor(flipIn);
  const measuredFlip = weekQuestsFor({ ...flipIn, milestone: { ...flipIn.milestone, snapshot: addSnap } });
  eq(
    "ADD by coverage: a pass rate calibrating at Start asks what a measured one does (pace ceil(11 × 7 ÷ 17) = 5, catch-up cap 4)",
    [pick(flip, "ADD")?.count, pick(flip, "ADD")?.pace, pick(measuredFlip, "ADD")?.count, pick(measuredFlip, "ADD")?.pace],
    [4, 5, 4, 5]
  );
  eq("the ADD is unchanged by a pass rate measured later (the set reads only Start's figures)", weekQuestsFor(flipIn).quests, flip.quests);
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

// ═══ RAISE (F13's worked example under F-R4-14) ═════════════════════════════

console.log("— RAISE —");
const PS = [D("Position Sizing")];
const raiseDue = addDays(W(6), 13); // two weeks left from W(6)
const raiseSnap = snapshotOf({ startedDay: M, dueDay: raiseDue, level: 6, rateSource: "NONE" });
const raiseCard = (cs: CardState[], over: Partial<WeekQuestCardInput> = {}): WeekQuestCardInput => ({
  measureKey: cardsAtLevelKey(["d-ps"], 6, "r"),
  domainIds: ["d-ps"],
  domainNames: PS,
  level: 6,
  target: 20,
  baseline: 10,
  v0: 10,
  cards: cs,
  rateSource: "NONE",
  fieldId: "f-trading",
  domainId: "d-ps",
  segment: "r",
  ...over,
});
/** The review rules at c = 1, p 0.8: a one-pass card with slack s reaches level 6 with 0.8 (s = 0) or 0.8 + 0.2 × 0.8 = 0.96 (a next-day retry fits). */
const RULES_08: ReachParams = { p: 0.8, pLong: 0.8, c: 1, rho: 0, m: 1, strikeLimit: 2, graceExtra: 0 };
{
  const wk = W(6);
  const wed = addDays(wk, 2);
  const due7 = [...cards(4, 5, wed), ...cards(1, 5, addDays(wk, 3)), ...cards(2, 5, addDays(wk, 4))];
  const set = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard([...cards(10, 6, addDays(wk, 30)), ...due7]) }));
  const r = pick(set, "RAISE");
  const expected = due7.reduce((s, c) => s + reachProb(RULES_08, 5, 6, daysBetween(c.dueDay, addDays(wk, 6))), 0);
  check("fixture: the review rules give 0.96 for a card due Wed–Fri (a miss retries the next day), so 7 cards reach about 6.72", Math.abs(expected - 7 * 0.96) < 1e-9, String(expected));
  eq("pace ceil(10 ÷ 2) = 5 under the reach ceil(6.72) = 7: Bring 5 cards to level 6+", r && [r.label, r.count, r.floor, r.unit, r.evidence], ["Bring 5 cards to level 6+", 5, 10, "card", "TESTED"]);
  eq("one part, for Position Sizing, with its own key, floor and due days", r?.parts?.map((p) => [p.domainId, p.measureKey, p.floor, p.count, p.dueDays.length]), [["d-ps", "CARDS_AT_LEVEL|d:d-ps|L6|r", 10, 5, 7]]);
  eq("its due days, one per reachable card", r?.dueDays.length, 7);
  const v = weekQuestsViewOf({ set, progress: [], variant: "today", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {}, domainNames: NAMES });
  eq("the row says '4 come due Wed, 1 Thu, 2 Fri'", v.rows[0]?.dueLine, "4 come due Wed, 1 Thu, 2 Fri");
  eq("the parts line names the Domain: '5 in Position Sizing'", (v.rows[0] as WeekQuestRowV2 | undefined)?.partsLine, "5 in Position Sizing");
  check("a card due anyway counts: the sheet says so", hasBasis(set, /a card that was due anyway counts: passing its review is the step/));
  check("the reach line names the review rules and Start's figures", hasBasis(set, /^Bring: reach follows the app's review rules \(a miss costs a day, two in a row cost a level, a card overdue past its grace drops a level\) at Start's figures: your 80% pass rate, the 100% of your due reviews you clear/), json(set.basis));
  check("no ADD with pace source NONE, and the basis says so", !pick(set, "ADD") && hasBasis(set, /new cards aren't counted: no pace yet/));

  const below = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard(due7, { baseline: 12, v0: 9 }) }));
  const rb = pick(below, "RAISE");
  eq("below the baseline: asks from max(v0, b) = 12 (G = 8, pace 4)", rb && [rb.parts?.[0]?.floor, rb.count], [12, 4]);
  check("… and the basis says the 3 slipped cards don't move the milestone", hasBasis(below, /^Bring: Position Sizing: 3 cards already counted when you started have slipped below level 6; bringing them back doesn't move Milestone 2/));
  check(
    "… which the roadmap page shows as a note",
    weekQuestsViewOf({ set: below, progress: [], variant: "roadmap", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {} }).notes.some((n) => /^Position Sizing: 3 cards already counted/.test(n))
  );

  // p = 0.5: one-pass cards due Wednesday reach with 0.5 + 0.25 = 0.75 (rev 3's p^k said 0.5); due Sunday, with no day to retry, 0.5.
  const halfSnap = snapshotOf({ startedDay: M, dueDay: raiseDue, level: 6, pStart: 0.5, rateSource: "NONE" });
  const halfWed = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: halfSnap, card: raiseCard(cards(3, 5, wed), { target: 30 }) }));
  const halfSun = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: halfSnap, card: raiseCard(cards(3, 5, addDays(wk, 6)), { target: 30 }) }));
  eq("p = 0.5, 3 one-pass cards: due Wednesday asks ceil(3 × 0.75) = 3 (the retry counts); due Sunday ceil(3 × 0.5) = 2", [pick(halfWed, "RAISE")?.count, pick(halfSun, "RAISE")?.count], [3, 2]);

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

  const py = weekQuestsFor(inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard(due7, { domainNames: [D("Python 3")], domainId: "d-x", domainIds: ["d-x"] }) }));
  const pyRow = weekQuestsViewOf({ set: py, progress: [], variant: "roadmap", milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {}, domainNames: NAMES }).rows[0] as WeekQuestRowV2;
  eq("a Domain named 'Python 3' is an opaque text slot of the parts line; the label holds only {n} and {L}", [pick(py, "RAISE")?.label, pyRow?.partsLine], ["Bring 5 cards to level 6+", "5 in Python 3"]);
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
  const four = ["Area 51", "B2", "C3", "D4"].map((n, i) => ({ ...addCard(addCards), domainId: `d4-${i}`, domainIds: [`d4-${i}`], domainNames: [D(n)], measureKey: cardsAtLevelKey([`d4-${i}`], 6, "r") }));
  const fourNames = Object.fromEntries(four.map((c) => [c.domainId as string, c.domainNames[0]]));
  const sets: WeekQuestSet[] = [
    weekQuestsFor(inputOf({ weekStart: W(6), startedDay: M, dueDay: raiseDue, snapshot: raiseSnap, card: raiseCard(cards(7, 5, addDays(W(6), 2)), { domainNames: [D("Python 3"), D("R 4.2")] }) })),
    weekQuestsFor({ ...inputOf({ weekStart: M, startedDay: M, dueDay: ADD_DUE, snapshot: addSnap }), cards: four }),
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
  // Generator 2: RAISE and ADD labels hold no text slot; the Domains are in the parts line, DomainNames only.
  const addFour = pick(sets[1], "ADD");
  eq("a four-Domain ADD: 'Add 12 cards', one part per Domain", [addFour?.label, addFour?.parts?.map((p) => p.count)], ["Add 12 cards", [3, 3, 3, 3]]);
  const lineOf = (variant: "today" | "aim" | "roadmap") =>
    (weekQuestsViewOf({ set: sets[1], progress: [], variant, milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {}, domainNames: fourNames }).rows.find((r) => r.kind === "ADD") as WeekQuestRowV2 | undefined)?.partsLine;
  eq(
    `the parts line: Today and the Aim card show the first ${WEEK_QUEST_PARTS_TODAY} and '+n more', the roadmap page all, with the multiple-choice clause`,
    [lineOf("today"), lineOf("aim"), lineOf("roadmap")],
    [
      "3 to Area 51 · 3 to B2 · +2 more Domains · multiple choice not counted",
      "3 to Area 51 · 3 to B2 · +2 more Domains · multiple choice not counted",
      "3 to Area 51 · 3 to B2 · 3 to C3 · 3 to D4 · multiple choice not counted",
    ]
  );
  check("NON_RECALL_TYPES is multiple choice (the clause's condition)", json(NON_RECALL_TYPES) === json(["MULTI"]));
  const bare: string[] = [];
  for (const variant of ["today", "aim", "roadmap"] as const) {
    for (const s of sets) {
      const v = weekQuestsViewOf({ set: s, progress: [], variant, milestone: { ord: 2, of: 3, title: "t" }, level: 6, frozen: true, writesOff: false, places: {}, domainNames: { ...NAMES, ...fourNames } });
      for (const row of v.rows as WeekQuestRowV2[]) if (row.partsLine && (/\b\d+ of \d+\b/.test(row.partsLine) || /\d+\s*\/\s*\d+/.test(row.partsLine))) bare.push(row.partsLine);
    }
  }
  check("the parts line never shows a bare 'n of N'", bare.length === 0, bare.join(" | "));
  eq("questPartsLineOf: one RAISE part, and no line for a row without parts (v1) or of another kind", [questPartsLineOf({ kind: "RAISE", parts: [{ name: D("Probability"), count: 1 }] }, "today"), questPartsLineOf({ kind: "RAISE" }, "today"), questPartsLineOf({ kind: "PRACTICE", parts: [{ name: D("X"), count: 1 }] }, "roadmap")], ["1 in Probability", null, null]);
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
  /** Absent: a recall type. */
  questionType?: string;
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
  /** REVIEW ledger rows (the clean-entry read). */
  reviews?: QuestReviewRow[];
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
    async addedByDomain(domainIds, from, to) {
      await tick();
      const out: Record<string, number> = {};
      for (const i of db.ideas) {
        if (!domainIds.includes(i.domainId) || i.isArchived || i.createdAt < from || i.createdAt >= to) continue;
        if (i.questionType != null && (NON_RECALL_TYPES as readonly string[]).includes(i.questionType)) continue;
        out[i.domainId] = (out[i.domainId] ?? 0) + 1;
      }
      return out;
    },
    async reviewRows(_u, ideaIds, from) {
      await tick();
      return (db.reviews ?? []).filter((r) => ideaIds.includes(r.ideaId) && r.day >= from);
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
  const key = cardsAtLevelKey(["d-risk"], 6, "r");
  const facts: QuestMilestoneFacts = {
    roadmap: { id: "rm1", status: "ACTIVE", fieldId: "f-trading", track: "CRAFT", hoursPerWeek: 8, intensity: "STEADY", startPoint: "BASICS", typicalHours: null, typicalHoursSource: null, targetDay: addDays(M, 300), practicesAllowed: true, depth: 12 },
    milestone: { id: "ms2", lineageId: "lin-ms2", ord: 2, title: "Risk and position sizing", status: over.status ?? "STARTED", startedDay, dueDay: ADD_DUE, feasibility: snap, goalId: "g2", stage: "FAMILIAR" },
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
    reviews: [],
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

  // Fix round (contracts §15.1, §15.2, §15.15 R6): one clean-entry rule, and the spare read from the constant.
  const quests = read("src/lib/roadmap-quests.ts");
  const questsServer = read("src/lib/roadmap-quests-server.ts");
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  check(
    "no second clean-entry rule: neither quest module defines isRetryEntry or ReviewRowLike; the server imports roadmap-types' isRetryEntry and retryReadDaysOf",
    !/\b(?:function|const)\s+isRetryEntry\b|\b(?:interface|type)\s+ReviewRowLike\b/.test(code(quests) + code(questsServer)) &&
      /import\s*\{[^}]*\bisRetryEntry\b[^}]*\bretryReadDaysOf\b[^}]*\}\s*from\s*"\.\/roadmap-types"/.test(questsServer) &&
      /retryReadDaysOf\(L, m,/.test(code(questsServer))
  );
  check(
    "the ADD basis names the spare from WRITE_MARGIN (addSpareText: pct(WRITE_MARGIN − 1) and writeNeedOf), never a typed percentage",
    !/\d+% spare/.test(code(quests)) && /pct\(WRITE_MARGIN - 1\)\}% spare/.test(code(quests)) && /\$\{addSpareText\(r\.c\.target\)\}/.test(code(quests))
  );
  // Fix round 2, R6 → R4 (landed in the finishing round). Start's set reads its v0 from Start's overrides, and every later
  // read of Start's week from the started-day reading, so both count a key as R1 does: recall cards only with a segment, no
  // first `rc` reading (acceptCore leaves that to R1's ledger read), per key. roadmap-server-check pins the behaviour (3
  // multiple-choice cards at or above L: Start's reading and v0 are the recall count); this pins the shape R6 reads.
  {
    const server = code(read("src/lib/roadmap-server.ts"));
    const finish = /export async function finishStartCore\([\s\S]*?\n\}\n/.exec(server)?.[0] ?? "";
    const counts = /function startCountsOf\([\s\S]*?\n\}\n/.exec(server)?.[0] ?? "";
    check(
      "R4's finishStartCore and startPreview hand R6 v0ByKey from startCountsOf (R1's cardsAtLevelValue per key, no `rc` count), never one v0 counted over every card",
      finish.length > 0 &&
        /startCountsOf\(ctx, row\.measures\)/.test(finish) &&
        /v0ByKey: v0ByKeyOf\(counts\)/.test(finish) &&
        !/\bliveCount\(/.test(finish) &&
        !/\bv0\s*[:=]/.test(finish) &&
        /segment === "rc"\) continue;/.test(counts) &&
        /measures\.cardsAtLevelValue\(/.test(counts) &&
        /v0ByKey: v0ByKeyOf\(startCountsOf\(ctx, row\.measures\)\)/.test(server) &&
        !/\bv0: f\.hw\.live\b/.test(server),
      json({ finish: finish.length, counts: counts.length })
    );
  }

  console.log("— SQL against the migration —");
  const migration = read("prisma/migrations/20261101000000_life_roadmap/migration.sql");
  // Revision 4's additive columns (Roadmap.depth, RoadmapMilestone.stage, …), which the milestone query reads.
  const rev4 = read("prisma/migrations/20261106000000_life_roadmap_rev4/migration.sql");
  const tableCols = (table: string) => {
    const m = new RegExp(`CREATE TABLE "public"\\."${table}" \\(([\\s\\S]*?)\\n\\);`).exec(migration);
    const cols = new Set(m ? [...m[1].matchAll(/^\s*"(\w+)"/gm)].map((x) => x[1]) : []);
    for (const a of rev4.matchAll(new RegExp(`ALTER TABLE "public"\\."${table}" ADD COLUMN "(\\w+)"`, "g"))) cols.add(a[1]);
    return cols;
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

// ═══ Revision 4 (F-R4-14, F-R4-13, F-R4-16): parts, the reach model, coverage, clean entry ══

/** A one-Domain card measure of a depth plan (key segment `r`, or `rc` at the final gate). */
function measureOf(domainId: string, name: string, p: { level: number; target: number; baseline: number; v0?: number; cards: CardState[]; segment?: "r" | "rc"; rateSource?: WeekQuestCardInput["rateSource"] }): WeekQuestCardInput {
  const segment = p.segment ?? "r";
  return {
    measureKey: cardsAtLevelKey([domainId], p.level, segment),
    domainIds: [domainId],
    domainNames: [D(name)],
    level: p.level,
    target: p.target,
    baseline: p.baseline,
    v0: p.v0 ?? p.baseline,
    cards: p.cards,
    rateSource: p.rateSource ?? "SCOPE",
    fieldId: "f-stats",
    domainId,
    segment,
  };
}
const inDomain = (domainId: string, n: number, level: number, due: DayKey, extra: Partial<CardState> = {}) => cards(n, level, due, { domainId, ...extra });
const viewOfSet = (set: WeekQuestSet, variant: "today" | "aim" | "roadmap", progress: ReturnType<typeof questProgress>[] = [], extra: Partial<Parameters<typeof weekQuestsViewOf>[0]> = {}) =>
  weekQuestsViewOf({ set, progress, variant, milestone: { ord: 2, of: 5, title: "Familiar: Probability, Inference to level 6+" }, level: 6, frozen: true, writesOff: false, places: {}, domainNames: NAMES, ...extra });

async function rev4() {
  const U = "user1";

  console.log("— rev 4: RAISE parts —");
  const wk = W(6);
  const wed = addDays(wk, 2);
  const thu = addDays(wk, 3);
  const twoRaise = (snap: StartSnapshot) =>
    weekQuestsFor({
      ...inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: snap }),
      cards: [
        measureOf("d-prob", "Probability", { level: 6, target: 34, baseline: 20, cards: [...inDomain("d-prob", 20, 6, addDays(wk, 40)), ...inDomain("d-prob", 6, 5, wed)], rateSource: "NONE" }),
        measureOf("d-inf", "Inference", { level: 6, target: 25, baseline: 22, cards: [...inDomain("d-inf", 22, 6, addDays(wk, 40)), ...inDomain("d-inf", 4, 5, thu)], rateSource: "NONE" }),
        measureOf("d-risk", "Risk Management", { level: 6, target: 18, baseline: 18, cards: inDomain("d-risk", 18, 6, addDays(wk, 40)), rateSource: "NONE" }),
      ],
    });
  {
    const set = twoRaise(raiseSnap);
    const r = pick(set, "RAISE");
    const want = (n: number, slack: number) => n * reachProb(RULES_08, 5, 6, slack);
    check("fixture: 6 Probability cards due Wed reach about 5.76; 4 Inference cards due Thu about 3.84", Math.abs(want(6, 4) - 5.76) < 1e-9 && Math.abs(want(4, 3) - 3.84) < 1e-9);
    eq(
      "a two-Domain RAISE splits by gap and reach: Probability min(pace 7, reach 6) = 6, Inference min(pace 2, reach 4) = 2; Risk Management at its target gives no part",
      r && [r.label, r.count, r.parts?.map((p) => [p.domainId, p.floor, p.count, p.measureKey])],
      ["Bring 8 cards to level 6+", 8, [["d-prob", 20, 6, "CARDS_AT_LEVEL|d:d-prob|L6|r"], ["d-inf", 22, 2, "CARDS_AT_LEVEL|d:d-inf|L6|r"]]]
    );
    check("… and the held Domain says so in the basis", hasBasis(set, /^Bring: Risk Management: target held — 18 at level 6\+ are already counted; keep reviewing when due\./), json(set.basis));
    eq("the row's due days merge the parts' (6 Wed, 4 Thu)", [r?.dueDays.length, viewOfSet(set, "today").rows[0]?.dueLine], [10, "6 come due Wed, 4 Thu"]);
    eq(
      "the parts line: '6 in Probability · 2 in Inference' (Today shows the first two, here all of them)",
      [(viewOfSet(set, "today").rows[0] as WeekQuestRowV2).partsLine, (viewOfSet(set, "roadmap").rows[0] as WeekQuestRowV2).partsLine],
      ["6 in Probability · 2 in Inference", "6 in Probability · 2 in Inference"]
    );
    eq(
      "the row's parts carry each Domain's name (DomainName), count, progress and done",
      viewOfSet(set, "roadmap").rows[0]?.parts?.map((p) => [p.domainId, String(p.name), p.count, p.progress, p.done]),
      [["d-prob", "Probability", 6, 0, false], ["d-inf", "Inference", 2, 0, false]]
    );
    const gone = viewOfSet(set, "roadmap", [], { domainNames: { "d-prob": D("Probability") } }).rows[0] as WeekQuestRowV2;
    eq("a part whose Domain row is gone keeps its count in the row and leaves the parts list", [gone.count, gone.parts?.map((p) => p.domainId), gone.partsLine], [8, ["d-prob"], "6 in Probability"]);

    // Reach at c = 0.8 asks no more than at c = 1 (and its expected reach is strictly lower).
    const at08 = twoRaise(snapshotOf({ startedDay: M, dueDay: raiseDue, level: 6, rateSource: "NONE", cStart: 0.8, rhoStart: 0.2 }));
    const at08b = twoRaise(snapshotOf({ startedDay: M, dueDay: raiseDue, level: 6, rateSource: "NONE", cStart: 0.8, rhoStart: 0.6 }));
    const partsOf = (s: WeekQuestSet) => pick(s, "RAISE")?.parts?.map((p) => p.count) ?? [];
    check(
      `reach at c = 0.8 asks no more than at c = 1, part by part (${json(partsOf(at08))}, ${json(partsOf(at08b))} vs ${json(partsOf(set))})`,
      partsOf(at08).every((n, i) => n <= (partsOf(set)[i] ?? 0)) && partsOf(at08b).every((n, i) => n <= (partsOf(set)[i] ?? 0)) && (pick(at08, "RAISE")?.count ?? 0) <= (r?.count ?? 0)
    );
    const p08 = { ...RULES_08, c: 0.8, rho: 0.2 };
    check("… its expected reach is strictly lower, and lower still when missed days bunch (ρ 0.6)", reachProb(p08, 5, 6, 4) < reachProb(RULES_08, 5, 6, 4) && reachProb({ ...p08, rho: 0.6 }, 5, 6, 4) < reachProb(p08, 5, 6, 4));
  }

  console.log("— rev 4: a part's slip offsets only that part —");
  {
    const spec: RaiseQuestSpec = {
      ord: 1,
      kind: "RAISE",
      label: "Bring 8 cards to level 6+",
      count: 8,
      unit: "card",
      evidence: "TESTED",
      from: wk,
      to: addDays(wk, 6),
      measureKey: "CARDS_AT_LEVEL|d:d-prob|L6|r",
      domainIds: ["d-prob", "d-inf"],
      minLevel: 6,
      floor: 42,
      dueDays: [],
      bestCase: false,
      parts: [
        { domainId: "d-prob", measureKey: "CARDS_AT_LEVEL|d:d-prob|L6|r", floor: 20, count: 6, dueDays: [] },
        { domainId: "d-inf", measureKey: "CARDS_AT_LEVEL|d:d-inf|L6|r", floor: 22, count: 2, dueDays: [] },
      ],
    };
    const p = questProgress(spec, {
      kind: "RAISE",
      value: null,
      high: null,
      slipDay: null,
      byDomain: { "d-prob": { value: 26, high: 26, slipDay: null }, "d-inf": { value: 21, high: 23, slipDay: thu } },
    });
    eq(
      "Probability up 6 and Inference slipped below its floor: progress 6 + 0 = 6 (a net over one key would read 5), not done",
      [p.progress, p.done, p.parts?.map((x) => [x.domainId, x.progress, x.done]), p.slipped],
      [6, false, [["d-prob", 6, true], ["d-inf", 0, false]], { from: 7, day: thu }]
    );
    const all = questProgress(spec, { kind: "RAISE", value: null, high: null, slipDay: null, byDomain: { "d-prob": { value: 40, high: 40, slipDay: null }, "d-inf": { value: 24, high: 24, slipDay: null } } });
    eq("the row is done when every part is (each clamped to its count: 6 + 2)", [all.progress, all.done], [8, true]);
    const proto = questProgress(spec, { kind: "RAISE", value: 30, high: 30, slipDay: null, byDomain: JSON.parse('{"__proto__": {"value": 99, "high": 99, "slipDay": null}}') });
    eq("evidence without the part's Domain reads 0 for it, and '__proto__' never resolves as a Domain", [proto.progress, proto.done], [0, false]);
    const row = viewOfSet({ weekStart: wk, milestoneId: "m", state: "OPEN", generator: 2, quests: [spec], basis: [], cappedBy: null }, "today", [p]).rows[0];
    eq("the row's figure is the parts' sum, and the slip caption counts the slipped cards", [row?.figure.value, row?.slipLine, row?.parts?.map((x) => x.progress)], [6, "1 card slipped back to level 5 on Thu", [6, 0]]);
  }

  console.log("— rev 4: ADD by coverage, per Domain —");
  const addTwoSnap = snapshotOf({ startedDay: M, dueDay: ADD_DUE, level: 6, newNeededStart: 0, newNeededByDomain: { "d-inf": 13, "d-risk": 3 } });
  const addTwo = (weekStart: DayKey, capacity: WeekQuestInput["capacity"] = ROOMY) =>
    weekQuestsFor({
      ...inputOf({ weekStart, startedDay: M, dueDay: ADD_DUE, snapshot: addTwoSnap, capacity }),
      cards: [
        measureOf("d-inf", "Inference", {
          level: 6,
          target: 25,
          baseline: 10,
          // Fix round (WRITE_MARGIN 1.3): 5 more level-4 cards, due after the window, keep the 13 left (33 − 20) of the build round's 28 − 15.
          cards: [...inDomain("d-inf", 10, 6, addDays(M, 60)), ...inDomain("d-inf", 5, 4, addDays(M, 40)), ...inDomain("d-inf", 5, 4, addDays(M, 90)), ...inDomain("d-inf", 3, 6, addDays(M, 60), { recall: false })],
        }),
        // … and 4 more here keep Risk Management's 3 left (24 − 21).
        measureOf("d-risk", "Risk Management", { level: 6, target: 18, baseline: 8, cards: [...inDomain("d-risk", 8, 6, addDays(M, 60)), ...inDomain("d-risk", 9, 4, addDays(M, 40)), ...inDomain("d-risk", 4, 4, addDays(M, 90))] }),
      ],
    });
  {
    eq("fixture: Inference needs ceil(1.3 × 25) = 33 (32.5 rounded up) and holds 20 recall cards (3 multiple choice not counted): 13 left", [writeNeedOf(25, 20), writeNeedOf(25, 0)], [13, 33]);
    eq("fixture: Risk Management needs ceil(1.3 × 18) = 24 and holds 21: 3 left", writeNeedOf(18, 21), 3);
    eq(
      "addSpareText words the goal from WRITE_MARGIN, rounded up with '→' as the pace is (never '1.3 × 25 = 33', which is 32.5)",
      [addSpareText(25), addSpareText(18), addSpareText(10)],
      ["1.3 × 25 → 33, a 30% spare because some cards lag", "1.3 × 18 → 24, a 30% spare because some cards lag", "1.3 × 10 → 13, a 30% spare because some cards lag"]
    );
    check(
      "… its spare is pct(WRITE_MARGIN − 1) of the constant itself (a changed margin changes the words)",
      addSpareText(25).includes(`${WRITE_MARGIN} × 25 → ${writeNeedOf(25, 0)}, a ${Math.round((WRITE_MARGIN - 1) * 100)}% spare`)
    );
    const w1 = addTwo(M);
    const a1 = pick(w1, "ADD");
    eq(
      "week 1: Inference ceil(13 × 7 ÷ 31) = 3, Risk Management ceil(3 × 7 ÷ 31) = 1: 'Add 4 cards'",
      a1 && [a1.label, a1.count, a1.pace, a1.parts],
      ["Add 4 cards", 4, 4, [{ domainId: "d-inf", count: 3, pace: 3, cappedBy: null }, { domainId: "d-risk", count: 1, pace: 1, cappedBy: null }]]
    );
    check(
      "… the basis names Inference's coverage need over the remaining writing weeks",
      hasBasis(w1, /^Add: Inference: still needed 13 new cards \(1\.3 × 25 → 33, a 30% spare because some cards lag, less the 20 cards it holds\) · pace 13 × 7 ÷ 31 days → 3/),
      json(w1.basis)
    );
    eq(
      "the parts line: '3 to Inference · 1 to Risk Management · multiple choice not counted'",
      (viewOfSet(w1, "roadmap").rows.find((r) => r.kind === "ADD") as WeekQuestRowV2 | undefined)?.partsLine,
      "3 to Inference · 1 to Risk Management · multiple choice not counted"
    );
    eq("the link goes to /add for the part with the largest count", viewOfSet(w1, "aim").rows.find((r) => r.kind === "ADD")?.href, "/add?field=f-stats&domain=d-inf");

    // Week 4 (10 writing days left): Inference pace ceil(13 × 7 ÷ 10) = 10 over its cap max(3, ceil(1.5 × 2.94)) = 5; Risk Management pace 3 at its cap 3.
    const w4 = addTwo(W(3));
    const a4 = pick(w4, "ADD");
    eq(
      "the per-Domain catch-up cap: Inference 5 of its 10 (CATCHUP), Risk Management 3 of 3",
      a4 && [a4.count, a4.pace, a4.parts?.map((p) => [p.domainId, p.count, p.pace, p.cappedBy])],
      [8, 13, [["d-inf", 5, 10, "CATCHUP"], ["d-risk", 3, 3, null]]]
    );
    eq("… the set reads CATCHUP and QUESTS_BEHIND fires (a part capped by catch-up with Ww < 2)", [w4.cappedBy, questsBehind(w4)], ["CATCHUP", true]);
    check("… and the catch-up line names the Domain", hasBasis(w4, /^Add: Inference: asks 5 of the 10 new cards needed to stay on plan; 1\.5 × the 2\.9 a week the plan needed at Start/), json(w4.basis));
    const tm = { ord: 2, cardPaces: [], pays: [], practice: null, carried: false, checkpoint: null, id: "ms2", dueDay: ADD_DUE, level: 6 };
    eq("R1's trigger reads the same set: QUESTS_BEHIND, in the one wording", triggersOf({ milestones: [tm], paceAtAcceptance: "SCOPE", paceNow: "SCOPE", questWeek: w4 }).map((h) => [h.trigger, h.line]), [["QUESTS_BEHIND", questsBehindLine(w4, { ord: 2, level: 6, dueDay: ADD_DUE })]]);

    // The capacity cap on the total, shared out in proportion to pace_d (10 : 3).
    const tight = addTwo(W(3), { availableMin: 50, class: "ESTIMATED", calibrating: false });
    const at = pick(tight, "ADD");
    eq(
      "a capacity of 4 cards ((50 − 30) ÷ 5) shared 10 : 3 → Inference 3, Risk Management 1, both CAPACITY",
      at && [at.count, at.parts?.map((p) => [p.domainId, p.count, p.cappedBy])],
      [4, [["d-inf", 3, "CAPACITY"], ["d-risk", 1, "CAPACITY"]]]
    );
    eq("… the set reads CAPACITY and QUESTS_BEHIND does not fire", [tight.cappedBy, questsBehind(tight)], ["CAPACITY", false]);
    check("… and the basis says how it was shared", hasBasis(tight, /^Add: Practices and reviews fill this week's time, so it asks 4 of the 13 new cards the plan needs, shared in proportion: 3 to Inference · 1 to Risk Management\./), json(tight.basis));
    const mixed = addTwo(W(3), { availableMin: 60, class: "ESTIMATED", calibrating: false });
    eq(
      "a capacity of 6: Inference keeps its catch-up 5 (CATCHUP), Risk Management gets 1 (CAPACITY); the set reads CATCHUP",
      [pick(mixed, "ADD")?.parts?.map((p) => [p.domainId, p.count, p.cappedBy]), mixed.cappedBy, questsBehind(mixed)],
      [[["d-inf", 5, "CATCHUP"], ["d-risk", 1, "CAPACITY"]], "CATCHUP", true]
    );
    eq(
      "shareOutByPace: floors, then the largest remainders under each part's want; never above a want; nothing for nothing",
      [shareOutByPace(6, [5, 3], [10, 3]), shareOutByPace(4, [5, 3], [10, 3]), shareOutByPace(20, [5, 3], [10, 3]), shareOutByPace(0, [5, 3], [10, 3]), shareOutByPace(5, [2, 2, 2], [1, 1, 1])],
      [[5, 1], [3, 1], [5, 3], [0, 0], [2, 2, 1]]
    );

    // ADD verification by part: recall cards per Domain; a multiple-choice card added doesn't advance it.
    const spec = a1 as AddQuestSpec;
    const pr = questProgress(spec, { kind: "ADD", added: 9, addedByDomain: { "d-inf": 6, "d-risk": 0 } });
    eq("ADD by part: Inference 6 (of 3, read honestly), Risk Management 0 of 1: progress min-summed 3, not done", [pr.progress, pr.done, pr.parts?.map((x) => [x.domainId, x.progress, x.done])], [3, false, [["d-inf", 6, true], ["d-risk", 0, false]]]);
    eq("… done once every part is", questProgress(spec, { kind: "ADD", added: 4, addedByDomain: { "d-inf": 3, "d-risk": 1 } }).done, true);
  }

  console.log("— rev 4: clean entry (`rc`) —");
  {
    const finalDue = addDays(W(6), 13);
    const finalSnap = snapshotOf({ startedDay: M, dueDay: finalDue, level: 12, rateSource: "NONE" });
    const final = (segment: "r" | "rc", extra: CardState[] = []) =>
      weekQuestsFor({
        ...inputOf({ weekStart: wk, startedDay: M, dueDay: finalDue, snapshot: finalSnap }),
        cards: [measureOf("d-prob", "Probability", { level: 12, target: 34, baseline: 20, segment, cards: [...inDomain("d-prob", 5, 11, wed), ...extra], rateSource: "NONE" })],
      });
    const plain = pick(final("r"), "RAISE");
    const clean = pick(final("rc"), "RAISE");
    eq(
      "five level-11 cards due Wed: a plain key counts a next-day retry (5 × 0.96 → 5); the depth term's `rc` counts only a first-try pass (5 × 0.8 → 4)",
      [plain?.count, clean?.count],
      [5, 4]
    );
    check("… the `rc` basis says a retry counts after its next review", hasBasis(final("rc"), /^Bring: at level 12 a card counts once it entered on a first-try pass; one that got there on a next-day retry counts after its next review\./));
    // A card at exactly 12 that entered on a retry: the `rc` reading counts it at 11, so this week asks for its next review.
    const withRetry = final("rc", inDomain("d-prob", 1, 12, thu, { retryEntry: true }));
    const rr = pick(withRetry, "RAISE");
    eq("a retry-entry card at level 12 due Thu is reachable: its next pass (0.8 + a retry) brings it in", [rr?.count, rr?.dueDays.length], [5, 6]);
    check("… and the basis names it", hasBasis(withRetry, /^Bring: Probability: 1 card reached level 12 on a retry: it counts after its next review, which this week can bring\./), json(withRetry.basis));
    const plainRetry = pick(final("r", inDomain("d-prob", 1, 12, thu, { retryEntry: true })), "RAISE");
    eq("… a plain key counts that card already (not reachable)", plainRetry?.dueDays.length, 5);

    // Clean entry is roadmap-types' one rule (fix round, contracts §15.1: R1's, which the reach DP follows); R6 keeps no copy.
    eq(
      "isRetryEntry (roadmap-types): 'strike · L11' then 'advanced · L11→12' the next day; untagged rows read the same; one life day ordered by `at`",
      [
        isRetryEntry([{ day: wk, detail: "strike · L11" }, { day: addDays(wk, 1), detail: "advanced · L11→12" }], 12),
        isRetryEntry([{ day: wk, detail: "strike" }, { day: addDays(wk, 1), detail: "advanced" }], 12),
        isRetryEntry([{ day: wk, at: 2, detail: "advanced · L11→12" }, { day: wk, at: 1, detail: "strike · L11" }], 12),
      ],
      [true, true, true]
    );
    eq(
      "… not a first-try pass, a pass after it, another level, or a degrade that took it down a level before the pass; a backfill row between them is skipped",
      [
        isRetryEntry([{ day: wk, detail: "advanced · L11→12" }], 12),
        isRetryEntry([{ day: wk, detail: "strike · L11" }, { day: addDays(wk, 1), detail: "advanced · L11→12" }, { day: addDays(wk, 110), detail: "advanced · L12→13" }], 12),
        isRetryEntry([{ day: wk, detail: "strike · L9" }, { day: addDays(wk, 1), detail: "advanced · L9→10" }], 12),
        isRetryEntry([{ day: wk, detail: "strike · L11" }, { day: addDays(wk, 1), detail: "degraded · L11" }, { day: addDays(wk, 2), detail: "advanced · L10→11" }], 12),
        isRetryEntry([{ day: wk, detail: "strike · L11" }, { day: addDays(wk, 1), detail: "backfill: passed review" }, { day: addDays(wk, 1), detail: "advanced · L11→12" }], 12),
      ],
      [false, false, false, false, true]
    );
    // The three cases where R6's own rule differed from R1's (contracts §15.1, §15.16 item 5): each now follows R1.
    eq(
      "R1's rule where R6's differed: tagged rows 3 days apart are a retry (the tags place the miss on this climb); a shield or a degrade from 12 just before the pass is a retry; a later 'strike · L12' keeps a retry entry one until its next pass",
      [
        isRetryEntry([{ day: wk, detail: "strike · L11" }, { day: addDays(wk, 3), detail: "advanced · L11→12" }], 12),
        isRetryEntry([{ day: wk, detail: "shielded · L11" }, { day: addDays(wk, 1), detail: "advanced · L11→12" }], 12),
        isRetryEntry([{ day: wk, detail: "degraded · L12" }, { day: addDays(wk, 1), detail: "advanced · L11→12" }], 12),
        isRetryEntry([{ day: wk, detail: "strike · L11" }, { day: addDays(wk, 1), detail: "advanced · L11→12" }, { day: addDays(wk, 112), detail: "strike · L12" }], 12),
      ],
      [true, true, true, true]
    );
    eq(
      "… untagged rows keep the day window: a miss 3 days before the pass is not a retry, an untagged shield the day before is",
      [
        isRetryEntry([{ day: wk, detail: "strike" }, { day: addDays(wk, 3), detail: "advanced" }], 12),
        isRetryEntry([{ day: wk, detail: "shielded" }, { day: addDays(wk, 1), detail: "advanced" }], 12),
      ],
      [false, true]
    );
    eq(
      "… a first-try pass followed by a later strike at 12 is still clean (the pass, not the last row, decides)",
      isRetryEntry([{ day: wk, detail: "advanced · L11→12" }, { day: addDays(wk, 112), detail: "strike · L12" }], 12),
      false
    );
  }

  console.log("— rev 4: the reach inputs at Start —");
  {
    const base = snapshotOf({ startedDay: M, dueDay: ADD_DUE, level: 12 });
    const cal = questReachOf({ ...base, calibrating: ["p", "c", "rho"], pStart: 1, cStart: 1, rhoStart: 0 }, 1);
    eq("calibrating at Start: the priors (p 0.80, pLong 0.80, c 0.85, ρ 0.6), never 1, each named as assumed", [cal.params.p, cal.params.pLong, cal.params.c, cal.params.rho, cal.assumed], [P_PRIOR, 0.8, C_PRIOR, RHO_PRIOR, ["p", "c", "rho"]]);
    const rev3 = { ...base, pCalibrating: true, pStart: 1 } as StartSnapshot;
    delete (rev3 as Partial<StartSnapshot>).cStart;
    delete (rev3 as Partial<StartSnapshot>).rhoStart;
    eq("a snapshot without the rev-4 figures (rev 3's pCalibrating, p 1): the priors too", [questReachOf(rev3, 1).params.p, questReachOf(rev3, 1).params.c, questReachOf(rev3, 1).params.rho, questReachOf(rev3, 1).assumed], [0.8, 0.85, 0.6, ["p", "c", "rho"]]);
    const measuredReach = questReachOf({ ...base, pStart: 0.9, pLongStart: 0.8, cStart: 0.92, rhoStart: 0.3 }, 1.5, { extraStrikes: 1, graceExtraDays: 2 });
    eq("measured at Start: p 0.9, pLong 0.8, c 0.92, ρ 0.3, m 1.5, the loadout's 3 strikes and 2 grace days", [measuredReach.params, measuredReach.assumed], [{ p: 0.9, pLong: 0.8, c: 0.92, rho: 0.3, m: 1.5, strikeLimit: 3, graceExtra: 2 }, []]);
    eq("pLong is never above p, nor above the cap", [questReachOf({ ...base, pStart: 0.7 }, 1).params.pLong, questReachOf({ ...base, pStart: 0.95, pLongStart: 0.9 }, 1).params.pLong], [0.7, 0.8]);
    const calSet = weekQuestsFor({
      ...inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: snapshotOf({ startedDay: M, dueDay: raiseDue, level: 6, rateSource: "NONE", calibrating: ["p", "c", "rho"], cStart: null, rhoStart: null }) }),
      cards: [measureOf("d-prob", "Probability", { level: 6, target: 34, baseline: 20, cards: inDomain("d-prob", 6, 5, wed), rateSource: "NONE" })],
    });
    check(
      "the basis names what was assumed: 'an 80% pass rate (the app's assumption until 30 reviews are measured)', the clearance and the bunching",
      hasBasis(calSet, /an 80% pass rate \(the app's assumption until 30 reviews are measured\), 85% of your due reviews cleared \(the app's assumption\), missed days bunching together at the app's assumed rate\.$/),
      json(calSet.basis)
    );
    const lvl12 = weekQuestsFor({ ...inputOf({ weekStart: wk, startedDay: M, dueDay: raiseDue, snapshot: raiseSnap }), cards: [measureOf("d-prob", "Probability", { level: 12, target: 34, baseline: 20, segment: "rc", cards: inDomain("d-prob", 5, 11, wed), rateSource: "NONE" })] });
    check("a level-12 plan's basis names the long-gap rate as the app's policy", hasBasis(lvl12, /80% for gaps of 50 days and more \(the app's policy: none of your reviews has tested gaps that long yet\)/), json(lvl12.basis));
  }

  console.log("— rev 4: a v1 frozen set renders unchanged —");
  {
    const v1: WeekQuestSet = {
      weekStart: wk,
      milestoneId: "m1",
      state: "OPEN",
      generator: 1,
      basis: [],
      cappedBy: null,
      quests: [
        { ord: 1, kind: "RAISE", label: "Bring 5 cards in Position Sizing to level 6+", count: 5, unit: "card", evidence: "TESTED", from: wk, to: addDays(wk, 6), measureKey: "CARDS_AT_LEVEL|d:d-ps|L6", domainIds: ["d-ps"], minLevel: 6, floor: 10, dueDays: [wed], bestCase: false },
        { ord: 2, kind: "ADD", label: "Add 3 cards to Risk Management", count: 3, unit: "card", evidence: "RECORDED", from: wk, to: addDays(wk, 6), domainIds: ["d-risk"], fieldId: "f-trading", quotaField: null, pace: 3, writingWeeksLeft: 3, lastCardDay: null },
        { ord: 3, kind: "PRACTICE", label: "Backtest · 3 sessions × 45 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: wk, to: addDays(wk, 6), templateId: "t-bt", minutes: 45 },
      ],
    };
    const prog = [
      questProgress(v1.quests[0], { kind: "RAISE", value: 13, high: 14, slipDay: thu }),
      questProgress(v1.quests[1], { kind: "ADD", added: 4 }),
      questProgress(v1.quests[2], { kind: "PRACTICE", rule: "TARGET:3/W", startDay: M, instances: [{ day: wk, status: "DONE" }] }),
    ];
    eq("v1 progress is rev 3's: RAISE net of its one floor (3 of 5, slipped from 4), ADD what the rows say (4 of 3)", prog.map((p) => [p.progress, p.done, p.slipped, "parts" in p]), [[3, false, { from: 4, day: thu }, false], [4, true, null, false], [1, false, null, false]]);
    const REV3_ROW_KEYS = ["ord", "kind", "label", "count", "unit", "evidence", "figure", "done", "dueLine", "quotaLine", "slipLine", "seekTemplateId", "place", "href"];
    for (const variant of ["today", "aim", "roadmap"] as const) {
      const v = viewOfSet(v1, variant, prog);
      check(`a v1 row has rev 3's fields only (no parts, no parts line) on ${variant}`, v.rows.every((r) => json(Object.keys(r)) === json(REV3_ROW_KEYS)), json(v.rows.map((r) => Object.keys(r))));
    }
    const v = viewOfSet(v1, "roadmap", prog);
    eq(
      "… its labels, captions and links as rev 3 rendered them",
      v.rows.map((r) => [r.label, r.figure.caption, r.dueLine, r.slipLine, r.href]),
      [
        ["Bring 5 cards in Position Sizing to level 6+", "tested by your reviews", "1 comes due Wed", "1 card slipped back to level 5 on Thu", null],
        ["Add 3 cards to Risk Management", "counted by the app; it doesn't judge them", null, null, "/add?field=f-trading&domain=d-risk"],
        ["Backtest · 3 sessions × 45 min", "from your ticks · the milestone counts 80% of these", null, null, "/today#t-t-bt"],
      ]
    );
    const res = weekQuestResultsOf(v1, prog, null, 0, 7);
    eq("… and its results are unchanged", res.rows, [{ ord: 1, progress: 3, done: false }, { ord: 2, progress: 4, done: true }, { ord: 3, progress: 1, done: false }]);
    eq("questsBehind on a v1 set keeps rev 3's rule (cappedBy CATCHUP and Ww < 2)", [questsBehind({ ...v1, cappedBy: "CATCHUP" }), questsBehind({ ...v1, cappedBy: "CATCHUP", quests: v1.quests.map((q) => (q.kind === "ADD" ? { ...q, writingWeeksLeft: 1.4 } : q)) })], [false, true]);
  }

  console.log("— rev 4: practices the app adds, and the health line —");
  {
    const added = { origin: "CODE", decision: "PENDING", label: "Explain it in your own words: Probability", flags: [] as string[] };
    const name = questLabelOf(added);
    eq("a PRODUCTION_ADDED practice (origin CODE) is CodeText, with no check needed", name, "Explain it in your own words: Probability");
    const set = weekQuestsFor(inputOf({ weekStart: M, startedDay: M, dueDay: LONG_DUE, snapshot: longSnap, practices: name ? [{ templateId: "t-ex", name, rule: "TARGET:2/W", startDay: M, bandMinutes: 45 }] : [] }));
    eq("… and yields a PRACTICE week quest", pick(set, "PRACTICE")?.label, "Explain it in your own words: Probability · 2 sessions × 45 min");
    const body = viewOfSet(set, "today", [], { health: true }).rows as WeekQuestRowV2[];
    const field = viewOfSet(set, "today", [], { health: false }).rows as WeekQuestRowV2[];
    eq("a BODY plan's PRACTICE rows carry the health line (HEALTH_LINE, R5), a Field plan's don't", [body.map((r) => r.health ?? null), field.map((r) => r.health ?? null)], [[true], [null]]);
  }

  console.log("— rev 4: the server reads every Domain's measure —");
  const dbTwo = (): FakeDb => {
    const db = dbOf();
    const snap = snapshotOf({ startedDay: M, dueDay: ADD_DUE, level: 6, newNeededStart: 0, newNeededByDomain: { "d-inf": 13, "d-risk": 3 } });
    db.facts[0].milestone.feasibility = snap;
    const kInf = cardsAtLevelKey(["d-inf"], 6, "r");
    const kRisk = cardsAtLevelKey(["d-risk"], 6, "r");
    const dom = db.items.ms2.find((i) => i.kind === "DOMAIN") as QuestItemRow;
    db.items.ms2 = [{ ...dom, id: "dom-risk", lineageId: "lin-dom-risk", ord: 2, domainId: "d-risk" }, { ...dom, id: "dom-inf", lineageId: "lin-dom-inf", ord: 1, label: "Inference", domainId: "d-inf" }, ...db.items.ms2.filter((i) => i.kind !== "DOMAIN")];
    // The Risk measure first: the read orders them by the DOMAIN items (Inference is ord 1).
    db.measures.ms2 = [
      { kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: ["d-risk"] }, minLevel: 6, target: 18, baseline: 8, rateSource: "SCOPE", measureKey: kRisk },
      { kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: ["d-inf"] }, minLevel: 6, target: 25, baseline: 10, rateSource: "SCOPE", measureKey: kInf },
    ];
    db.domains = [
      { id: "d-risk", name: "Risk Management", fieldId: "f-stats" },
      { id: "d-inf", name: "Inference", fieldId: "f-stats" },
    ];
    const idea = (id: string, domainId: string, level: number, due: DayKey, questionType?: string): Idea => ({ id, domainId, level, dueDate: at(due, 9), graceEndsAt: null, createdAt: at(addDays(M, -60), 10), isArchived: false, ...(questionType ? { questionType } : {}) });
    db.ideas = [
      ...Array.from({ length: 10 }, (_, i) => idea(`inf6-${i}`, "d-inf", 6, addDays(M, 60), "SHORT")),
      ...Array.from({ length: 5 }, (_, i) => idea(`inf4-${i}`, "d-inf", 4, addDays(M, 40), "SHORT")),
      // Fix round (WRITE_MARGIN 1.3): as in addTwo, 5 and 4 more level-4 cards keep 13 and 3 left.
      ...Array.from({ length: 5 }, (_, i) => idea(`inf4b-${i}`, "d-inf", 4, addDays(M, 90), "SHORT")),
      ...Array.from({ length: 3 }, (_, i) => idea(`infmc-${i}`, "d-inf", 6, addDays(M, 60), "MULTI")),
      ...Array.from({ length: 8 }, (_, i) => idea(`risk6-${i}`, "d-risk", 6, addDays(M, 60))),
      ...Array.from({ length: 9 }, (_, i) => idea(`risk4-${i}`, "d-risk", 4, addDays(M, 40))),
      ...Array.from({ length: 4 }, (_, i) => idea(`risk4b-${i}`, "d-risk", 4, addDays(M, 90))),
    ];
    db.readings = [
      { measureKey: kInf, day: M, value: 10 },
      { measureKey: kRisk, day: M, value: 8 },
    ];
    return db;
  };
  {
    const db = dbTwo();
    const input = await weekQuestInputFor(storeOf(db), U, db.facts[0], M, at(M, 4, 15));
    eq(
      "weekQuestInputFor: one card input per PAYS measure, in the DOMAIN items' order, each with its Domain, key segment, v0 and target",
      input?.cards?.map((c) => [c.domainId, c.segment, c.measureKey, c.v0, c.target, c.cards.length, String(c.domainNames[0])]),
      [["d-inf", "r", "CARDS_AT_LEVEL|d:d-inf|L6|r", 10, 25, 23, "Inference"], ["d-risk", "r", "CARDS_AT_LEVEL|d:d-risk|L6|r", 8, 18, 21, "Risk Management"]]
    );
    eq("… `card` is the first (for v1 readers), and a multiple-choice card reads recall false", [input?.card?.domainId, input?.cards?.[0].cards.filter((c) => c.recall === false).length], ["d-inf", 3]);
    const set = input ? weekQuestsFor(input) : null;
    eq("… so ADD asks Inference 3 (13 left) and Risk Management 1 (3 left)", set ? pick(set, "ADD")?.parts?.map((p) => [p.domainId, p.count]) : null, [["d-inf", 3], ["d-risk", 1]]);
    const startWeek = await weekQuestInputFor(storeOf(db), U, db.facts[0], M, at(M, 4, 15), { v0ByKey: { [cardsAtLevelKey(["d-risk"], 6, "r")]: 9 } });
    eq("Start's v0 per measure key wins over the live count only when no reading of that day exists", startWeek?.cards?.map((c) => c.v0), [10, 8]);
    const noReading = dbTwo();
    noReading.readings = [];
    const sw = await weekQuestInputFor(storeOf(noReading), U, noReading.facts[0], M, at(M, 4, 15), { v0ByKey: { [cardsAtLevelKey(["d-risk"], 6, "r")]: 9 } });
    eq("… with none: v0ByKey, else the measure's own count (recall cards at level 6+: Inference 10, multiple choice left out)", sw?.cards?.map((c) => c.v0), [10, 9]);
  }
  {
    // Freeze-time independence with parts: the cron's set (Mon 04:15) and a render's (Wed 10:00) agree.
    const a = dbTwo();
    const b = dbTwo();
    const wk1 = W(1);
    const push = (db: FakeDb, id: string, domainId: string, questionType: string | undefined, created: Date) =>
      db.ideas.push({ id, domainId, level: 1, dueDate: created, graceEndsAt: null, createdAt: created, isArchived: false, ...(questionType ? { questionType } : {}) });
    push(b, "late-inf-1", "d-inf", "SHORT", at(addDays(wk1, 1), 11));
    push(b, "late-inf-2", "d-inf", "SHORT", at(addDays(wk1, 1), 12));
    push(b, "late-inf-mc", "d-inf", "MULTI", at(addDays(wk1, 1), 13));
    push(b, "late-risk-mc", "d-risk", "MULTI", at(addDays(wk1, 1), 13));
    b.rest.push({ day: addDays(wk1, 4), kind: "REST", declaredAt: at(addDays(wk1, 1), 12), cancelledAt: null });
    await freezeWeekQuests(U, at(wk1, 4, 15), "CRON", { ...ON, store: storeOf(a) });
    await freezeWeekQuests(U, at(addDays(wk1, 2), 10), "RENDER", { ...ON, store: storeOf(b) });
    const sa = setOfStored(a.weeks[0]);
    const sb = setOfStored(b.weeks[0]);
    eq("the cron's set and a Wednesday render's ask the same quests, parts included", sb.quests, sa.quests);
    eq("… with the same basis but the read-at line", sb.basis.slice(1), sa.basis.slice(1));
    eq("… and generator 2 is stored", [a.weeks[0].generator, sa.quests.find((q) => q.kind === "ADD")?.label], [2, "Add 5 cards"]);
    const lb = await loadWeekQuests(U, at(addDays(wk1, 2), 11), { ...ON, store: storeOf(b) });
    const addRow = lb?.progress.find((p) => p.ord === sb.quests.find((q) => q.kind === "ADD")?.ord);
    eq("the 2 recall cards added to Inference advance its part; the multiple-choice cards advance nothing", [addRow?.progress, addRow?.parts?.map((p) => [p.domainId, p.progress])], [2, [["d-inf", 2], ["d-risk", 0]]]);
    eq(
      "the Today view names the parts from the Domain rows",
      (lb?.view.rows.find((r) => r.kind === "ADD") as WeekQuestRowV2 | undefined)?.partsLine,
      "4 to Inference · 1 to Risk Management · multiple choice not counted"
    );
  }
  {
    // RAISE progress reads each part's own key: the `rc` reading counts a retry entry at 12 after its next pass.
    const db = dbTwo();
    const kRc = cardsAtLevelKey(["d-inf"], 12, "rc");
    const kPlain = cardsAtLevelKey(["d-inf"], 12);
    const wk1 = W(1);
    const spec: RaiseQuestSpec = {
      ord: 1,
      kind: "RAISE",
      label: "Bring 1 card to level 12+",
      count: 1,
      unit: "card",
      evidence: "TESTED",
      from: wk1,
      to: addDays(wk1, 6),
      measureKey: kRc,
      domainIds: ["d-inf"],
      minLevel: 12,
      floor: 20,
      dueDays: [addDays(wk1, 2)],
      bestCase: false,
      parts: [{ domainId: "d-inf", measureKey: kRc, floor: 20, count: 1, dueDays: [addDays(wk1, 2)] }],
    };
    const set: WeekQuestSet = { weekStart: wk1, milestoneId: "ms2", state: "OPEN", generator: 2, quests: [spec], basis: [], cappedBy: null };
    // Tue: a level-11 card passed on its next-day retry: the plain key reads 21, the `rc` key still 20.
    db.readings.push({ measureKey: kPlain, day: addDays(wk1, 1), value: 21 }, { measureKey: kRc, day: addDays(wk1, 1), value: 20 });
    const before = (await questProgressFor(storeOf(db), U, set)).progress[0];
    eq("a retry-entry card at level 12 doesn't advance the final-stage part (its `rc` reading counts it at 11)", [before.progress, before.done], [0, false]);
    db.readings.push({ measureKey: kRc, day: addDays(wk1, 5), value: 21 });
    const after = (await questProgressFor(storeOf(db), U, set)).progress[0];
    eq("… until its next pass: the `rc` reading reaches 21 and the part is done", [after.progress, after.done], [1, true]);

    // The server's clean-entry read: a level-12 card whose last rows are 'strike · L11' then 'advanced · L11→12'.
    const fin = dbTwo();
    fin.measures.ms2 = [{ kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: ["d-inf"] }, minLevel: 12, target: 25, baseline: 20, rateSource: "SCOPE", measureKey: kRc }];
    const card12 = (id: string) => ({ id, domainId: "d-inf", level: 12, dueDate: at(addDays(wk1, 100), 9), graceEndsAt: null, createdAt: at(addDays(M, -200), 9), isArchived: false });
    fin.ideas = [card12("c-retry"), card12("c-clean"), card12("c-shield"), card12("c-later"), card12("c-apart")];
    const rv = (ideaId: string, back: number, detail: string): QuestReviewRow => ({ ideaId, day: addDays(wk1, -back), occurredAt: at(addDays(wk1, -back), 9), detail });
    fin.reviews = [
      rv("c-retry", 10, "strike · L11"),
      rv("c-retry", 9, "advanced · L11→12"),
      rv("c-clean", 9, "advanced · L11→12"),
      // Fix round (roadmap-types' one rule, contracts §15.1): a shield before the pass, a later strike at 12, tagged rows 4 days apart.
      rv("c-shield", 20, "shielded · L11"),
      rv("c-shield", 19, "advanced · L11→12"),
      rv("c-later", 150, "strike · L11"),
      rv("c-later", 149, "advanced · L11→12"),
      rv("c-later", 3, "strike · L12"),
      rv("c-apart", 40, "strike · L11"),
      rv("c-apart", 36, "advanced · L11→12"),
    ];
    const froms: DayKey[] = [];
    const spy = (db: FakeDb, loadout?: { intervalMultiplier: number; extraStrikes: number; graceExtraDays: number }): QuestStore => {
      const s = storeOf(db);
      return {
        ...s,
        async reviewRows(u, ids, from) {
          froms.push(from);
          return s.reviewRows(u, ids, from);
        },
        ...(loadout ? { reachLoadout: async () => loadout } : {}),
      };
    };
    const fi = await weekQuestInputFor(spy(fin), U, fin.facts[0], wk1, at(wk1, 4, 15));
    eq(
      "weekQuestInputFor marks retry entries by roadmap-types' rule: a strike, a shield, a later strike at 12 (still a retry until its next pass) and tagged rows 4 days apart; a first-try pass is clean",
      fi?.cards?.[0].cards.map((c) => [c.level, c.retryEntry ?? false]),
      [[12, true], [12, false], [12, true], [12, true], [12, true]]
    );
    await weekQuestInputFor(spy(fin, { intervalMultiplier: 1.5, extraStrikes: 0, graceExtraDays: 2 }), U, fin.facts[0], wk1, at(wk1, 4, 15));
    eq(
      `… reading the REVIEW rows over retryReadDaysOf, the window R1 and R4 read (fix round 2, contracts §16.1): ${retryReadDaysOf(12, 1)} days at m 1 ((interval 160 + grace 11 + 1) + (grace 10 + 2) = 172 + 12), and retryReadDaysOf(12, 1.5, 2) with a loadout`,
      froms,
      [addDays(wk1, -retryReadDaysOf(12, 1)), addDays(wk1, -retryReadDaysOf(12, 1.5, 2))]
    );
    const plainFin = dbTwo();
    plainFin.measures.ms2 = [{ ...fin.measures.ms2[0], measureKey: kPlain }];
    plainFin.ideas = fin.ideas;
    plainFin.reviews = fin.reviews;
    froms.length = 0;
    const pf = await weekQuestInputFor(spy(plainFin), U, plainFin.facts[0], wk1, at(wk1, 4, 15));
    eq("… and only on an `rc` measure: a plain key reads no ledger and marks nothing", [froms.length, pf?.cards?.[0].cards.some((c) => c.retryEntry) ?? null], [0, false]);
  }
  {
    // Fix round 2 (contracts §16.1; the lens 2 minor R6 handed to lane 0): the read holds srs.ts's latest retry entry. A degrade
    // from L (due the next day), the pass L−1→L at the end of the lower level's grace plus the cron's day, then L held to its
    // interval (the jitter's top at levels 5–8), its grace and the cron's day. R6 reads it as a retry; one day narrower it reads
    // clean, and so did the fix round's 173-day window at L12, which counted the card in the `rc` measure and left RAISE nothing to ask.
    const wk1 = W(1);
    const now = at(wk1, 4, 15);
    const latest = (L: number, m: number, g: number): { db: FakeDb; back: number } => {
      const db = dbTwo();
      db.measures.ms2 = [{ kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: ["d-inf"] }, minLevel: L, target: 25, baseline: 20, rateSource: "SCOPE", measureKey: cardsAtLevelKey(["d-inf"], L, "rc") }];
      const back = retryReadDaysOf(L, m, g);
      const d0 = addDays(wk1, -back);
      const passDay = addDays(d0, 1 + graceDays(L - 1) + g + 1);
      db.ideas = [{ id: "c-edge", domainId: "d-inf", level: L, dueDate: at(addDays(wk1, 2), 9), graceEndsAt: null, createdAt: at(addDays(d0, -400), 9), isArchived: false, questionType: "SHORT" }];
      db.reviews = [
        { ideaId: "c-edge", day: d0, occurredAt: at(d0, 9), detail: `degraded · L${L}` },
        { ideaId: "c-edge", day: passDay, occurredAt: at(passDay, 9), detail: `advanced · L${L - 1}→${L}` },
      ];
      return { db, back };
    };
    /** The store with the loadout (m, grace extension), reading the ledger from where R6 asks, or `later` days after it (a narrower read). */
    const storeAt = (db: FakeDb, m: number, g: number, later = 0, seen?: DayKey[]): QuestStore => {
      const s = storeOf(db);
      return {
        ...s,
        reachLoadout: async () => ({ intervalMultiplier: m, extraStrikes: 0, graceExtraDays: g }),
        async reviewRows(u, ids, from) {
          seen?.push(from);
          return s.reviewRows(u, ids, addDays(from, later));
        },
      };
    };
    const retryOf = async (store: QuestStore, db: FakeDb) => (await weekQuestInputFor(store, U, db.facts[0], wk1, now))?.cards?.[0].cards[0]?.retryEntry ?? false;
    const fails: string[] = [];
    for (const L of [12, 10, 8, 6])
      for (const [m, g] of [[1, 0], [1.5, 0], [1, 2]] as const) {
        const { db, back } = latest(L, m, g);
        const seen: DayKey[] = [];
        const exact = await retryOf(storeAt(db, m, g, 0, seen), db);
        const narrower = await retryOf(storeAt(db, m, g, 1), db);
        if (!(exact && !narrower && json(seen) === json([addDays(wk1, -back)]))) fails.push(`L${L} m${m} g${g}: back ${back}, read from ${seen.join(",")}, exact ${exact}, narrower ${narrower}`);
      }
    check(
      "weekQuestInputFor reads srs.ts's latest retry entry (a degrade from L, the pass after the lower grace, L held to its interval — the jitter's top at 5–8 — its grace and the cron's day) as a retry at L 12/10/8/6, m 1 and 1.5, grace extension 0 and 2, reading from today − retryReadDaysOf(L, m, extension); one day narrower it reads clean",
      fails.length === 0,
      fails.join("; ")
    );
    const { db } = latest(12, 1, 0);
    const raiseOf = async (store: QuestStore) => {
      const input = await weekQuestInputFor(store, U, db.facts[0], wk1, now);
      const raise = input ? weekQuestsFor(input).quests.find((q) => q.kind === "RAISE") : undefined;
      return [input?.cards?.[0].cards[0]?.retryEntry ?? false, raise && raise.kind === "RAISE" ? (raise.parts ?? []).map((p) => [p.domainId, p.count, p.dueDays]) : null];
    };
    eq(
      "… what the old window cost at L12: over 173 days the card read clean (counted at level 12, nothing to bring); over the shared window it is a retry due Wednesday, and RAISE asks its next pass",
      [await raiseOf(storeAt(db, 1, 0, retryReadDaysOf(12, 1) - 173)), await raiseOf(storeAt(db, 1, 0))],
      [[false, null], [true, [["d-inf", 1, [addDays(wk1, 2)]]]]]
    );
  }
  {
    // Final round (the clean-entry window): the wider of the current acceptance's m and the live one, R1's cleanReadDaysOf.
    // A card entered level 12 on a retry 200 days ago, its interval set under an interval multiplier of 1.5 (recorded on the
    // acceptance) since unequipped (live m 1): the live window (184 days) misses both rows, the acceptance's (264) holds them.
    const wk1 = W(1);
    const now = at(wk1, 4, 15);
    const dbOld = (key = cardsAtLevelKey(["d-inf"], 12, "rc"), withCard = true): FakeDb => {
      const db = dbTwo();
      db.measures.ms2 = [{ kind: "CARDS_AT_LEVEL", role: "PAYS", scope: { domainIds: ["d-inf"] }, minLevel: 12, target: 25, baseline: 20, rateSource: "SCOPE", measureKey: key }];
      db.ideas = withCard ? [{ id: "c-old", domainId: "d-inf", level: 12, dueDate: at(addDays(wk1, 2), 9), graceEndsAt: null, createdAt: at(addDays(wk1, -400), 9), isArchived: false, questionType: "SHORT" }] : [];
      db.reviews = [
        { ideaId: "c-old", day: addDays(wk1, -200), occurredAt: at(addDays(wk1, -200), 9), detail: "strike · L11" },
        { ideaId: "c-old", day: addDays(wk1, -199), occurredAt: at(addDays(wk1, -199), 9), detail: "advanced · L11→12" },
      ];
      return db;
    };
    type Acc = number | null | "rejects" | "throwsAtOnce" | "absent";
    const run = async (db: FakeDb, o: { acc: Acc; liveM?: number; grace?: number }) => {
      const s = storeOf(db);
      const froms: DayKey[] = [];
      const accReads: string[][] = [];
      const store: QuestStore = {
        ...s,
        reachLoadout: async () => ({ intervalMultiplier: o.liveM ?? 1, extraStrikes: 0, graceExtraDays: o.grace ?? 0 }),
        async reviewRows(u, ids, from) {
          froms.push(from);
          return s.reviewRows(u, ids, from);
        },
        ...(o.acc === "absent"
          ? {}
          : {
              acceptanceMultiplier: (u: string, roadmapId: string): Promise<number | null> => {
                accReads.push([u, roadmapId]);
                if (o.acc === "throwsAtOnce") throw new Error("acceptance read failed at once");
                if (o.acc === "rejects") return Promise.reject(new Error("acceptance read failed"));
                return Promise.resolve(o.acc as number | null);
              },
            }),
      };
      const errors: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => void errors.push(args.map(String).join(" "));
      let input: Awaited<ReturnType<typeof weekQuestInputFor>> = null;
      let threw = "";
      try {
        input = await weekQuestInputFor(store, U, db.facts[0], wk1, now);
      } catch (err) {
        threw = String(err);
      } finally {
        console.error = origError;
      }
      const raise = input ? weekQuestsFor(input).quests.find((q) => q.kind === "RAISE") : undefined;
      return {
        backs: froms.map((f) => daysBetween(f, wk1)),
        accReads,
        retry: input?.cards?.[0].cards[0]?.retryEntry ?? false,
        raise: raise && raise.kind === "RAISE" ? (raise.parts ?? []).map((p) => [p.domainId, p.count, p.dueDays]) : null,
        errors,
        threw,
      };
    };
    const wide = await run(dbOld(), { acc: 1.5 });
    eq(
      "weekQuestInputFor reads an `rc` part's ledger over the wider of the acceptance's m (1.5) and the live one (1): 264 days, R1's cleanReadDaysOf(12, 1.5, the live loadout)",
      [wide.backs, cleanReadDaysOf(12, 1.5, { intervalMultiplier: 1, graceExtraDays: 0 })],
      [[264], 264]
    );
    eq("… the acceptance read once, by the user and the milestone's roadmap", wide.accReads, [[U, dbOld().facts[0].roadmap.id]]);
    eq("… so the card that entered 12 on a retry under the since-unequipped loadout is a retry, and RAISE asks its next pass (Wednesday)", [wide.retry, wide.raise], [true, [["d-inf", 1, [addDays(wk1, 2)]]]]);
    const before = await run(dbOld(), { acc: "absent" });
    eq("a store with no acceptance read (as before this round) reads the live m alone: 184 days, the retry entry read clean and RAISE asks nothing of it", [before.backs, before.retry, before.raise], [[184], false, null]);
    const narrowAcc = await run(dbOld(), { acc: 1, liveM: 1.5, grace: 2 });
    eq("a live m wider than the acceptance's (1.5 over 1), grace +2: 268 days, R1's figure", [narrowAcc.backs, cleanReadDaysOf(12, 1, { intervalMultiplier: 1.5, graceExtraDays: 2 }), narrowAcc.retry], [[268], 268, true]);
    const grid: string[] = [];
    for (const acc of [1, 1.25, 1.5, null, Number.NaN, 0, -2])
      for (const liveM of [1, 1.5])
        for (const grace of [0, 2]) {
          const r = await run(dbOld(), { acc, liveM, grace });
          const want = cleanReadDaysOf(12, acc, { intervalMultiplier: liveM, graceExtraDays: grace });
          if (json(r.backs) !== json([want])) grid.push(`acc ${acc} live ${liveM} g${grace}: ${json(r.backs)} ≠ ${want}`);
        }
    check("the quests' window equals R1's cleanReadDaysOf on every case (acceptance m 1, 1.25, 1.5, none, NaN, 0, −2 × live m 1, 1.5 × grace 0, 2)", grid.length === 0, grid.join("; "));
    const rejects = await run(dbOld(), { acc: "rejects" });
    const atOnce = await run(dbOld(), { acc: "throwsAtOnce" });
    check(
      "an acceptance read that rejects, or throws at once, is logged and the window reads the live m (184 days); the input is still built",
      [rejects, atOnce].every((r) => json(r.backs) === json([184]) && !r.threw && r.errors.some((e) => /acceptance's interval multiplier is unavailable/.test(e))),
      json([rejects, atOnce].map((r) => ({ backs: r.backs, threw: r.threw, errors: r.errors.slice(0, 1) })))
    );
    const plainKey = await run(dbOld(cardsAtLevelKey(["d-inf"], 12)), { acc: 1.5 });
    const noCard = await run(dbOld(undefined, false), { acc: 1.5 });
    eq("… and the acceptance is read only when an `rc` measure has a card at L: none for a plain key, none with no card at 12", [plainKey.accReads.length, plainKey.backs.length, noCard.accReads.length, noCard.backs.length], [0, 0, 0, 0]);
    const server = read("src/lib/roadmap-quests-server.ts");
    const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    const storeRead = /async acceptanceMultiplier\(userId, roadmapId\) \{[\s\S]{0,400}?\n {2}\},/.exec(server)?.[0] ?? "";
    check(
      "the Prisma quest store reads the current acceptance as R1 does: the user's roadmap, undone ones skipped, acceptanceOrderBy (newest version, then newest record)",
      /prisma\.roadmapAcceptance\.findFirst\(/.test(storeRead) && /undoneAt: null/.test(storeRead) && /roadmap: \{ userId \}/.test(storeRead) && /orderBy: acceptanceOrderBy\(\)/.test(storeRead),
      storeRead
    );
    check(
      "one window in the quest server: retryReadDaysOf is called once, in cleanWindowDaysOf at the wider m, which wave 3 calls with the milestone's roadmap",
      (code(server).match(/retryReadDaysOf\(/g) ?? []).length === 1 &&
        /async function cleanWindowDaysOf\([\s\S]*?const m = Math\.max\(liveM,[\s\S]*?return retryReadDaysOf\(L, m, loadout\.graceExtraDays \|\| 0\);/.test(code(server)) &&
        /await cleanWindowDaysOf\(store, userId, facts\.roadmap\.id, L, m, loadout\)/.test(code(server))
    );
  }
  {
    // Lens 2 gap 8, R6's half (the server half, through R4's startCore, is R4's roadmap-server-check): Start → its rows →
    // loadWeekQuests. Start freezes its week from overrides (the StartSnapshot, the started day, the lineage → template map)
    // before its finish transaction writes them. Once written (the snapshot through the JSON column), the rows give the same
    // set, a render finds Start's row and writes nothing, and next Monday's cron reads the stored snapshot's per-Domain need.
    const wk1 = W(1);
    const thu = addDays(wk1, 3);
    const db = dbTwo();
    const ms = db.facts[0].milestone;
    const snap = snapshotOf({ startedDay: thu, dueDay: ADD_DUE, level: 6, newNeededStart: 0, newNeededByDomain: { "d-inf": 13, "d-risk": 3 } });
    // Before the finish transaction: STARTING, no snapshot, no goal, the templates made (from Thursday) but not on the items, no Start reading.
    ms.status = "STARTING";
    ms.startedDay = null;
    ms.feasibility = PLAN_STUB;
    db.facts[0].goal = null;
    for (const it of db.items.ms2) it.templateId = null;
    db.templates = db.templates.map((t) => ({ ...t, startDay: thu }));
    db.readings = [];
    const store = storeOf(db);
    const startAt = at(thu, 10);
    // Start's v0 per key, as R4's finishStartCore hands it over (startCountsOf: each key's recall count, the Start readings below).
    const startV0 = { [cardsAtLevelKey(["d-inf"], 6, "r")]: 10, [cardsAtLevelKey(["d-risk"], 6, "r")]: 8 };
    const started = await weekQuestSetFor(U, "ms2", wk1, startAt, { store, overrides: { startedDay: thu, snapshot: snap, templateIds: { "lin-p1": "t-bt", "lin-s1": "t-s1" }, v0ByKey: startV0 } });
    // The count before the finishing round (every card, Inference's 3 multiple-choice cards too): 13.
    const overCounted = await weekQuestSetFor(U, "ms2", wk1, startAt, { store, overrides: { startedDay: thu, snapshot: snap, templateIds: { "lin-p1": "t-bt", "lin-s1": "t-s1" }, v0ByKey: { ...startV0, [cardsAtLevelKey(["d-inf"], 6, "r")]: 13 } } });
    // The finish transaction: STARTED with the snapshot (a JSON column), the goal, the items' templates, the Start readings
    // (each measure's recall cards at level 6+: Inference 10, its 3 multiple-choice cards left out; Risk Management 8), Start's set.
    ms.status = "STARTED";
    ms.startedDay = thu;
    ms.feasibility = JSON.parse(JSON.stringify(snap));
    db.facts[0].goal = { id: "g2", dueDay: ADD_DUE, closed: false, closedDay: null, archivedDay: null };
    for (const it of db.items.ms2) it.templateId = it.lineageId === "lin-p1" ? "t-bt" : it.lineageId === "lin-s1" ? "t-s1" : null;
    db.readings = [
      { measureKey: cardsAtLevelKey(["d-inf"], 6, "r"), day: thu, value: 10 },
      { measureKey: cardsAtLevelKey(["d-risk"], 6, "r"), day: thu, value: 8 },
    ];
    const wrote = started ? await store.insertQuestWeek(U, "rm1", started, "START", startAt) : 0;
    const later = at(thu, 11);
    const fromRows = await weekQuestSetFor(U, "ms2", wk1, later, { store });
    const partsOf = (set: WeekQuestSet | null | undefined, kind: "RAISE" | "ADD") => {
      const q = set?.quests.find((x) => x.kind === kind);
      return q && (q.kind === "RAISE" || q.kind === "ADD") ? (q.parts ?? []).map((p) => p.domainId) : null;
    };
    eq(
      "Start's set (from its overrides) is generator 2, with an ADD part per Domain, and is the set its rows give once written (quests and basis but the read-at line)",
      [wrote, started?.generator, partsOf(started, "ADD"), canon(fromRows?.quests) === canon(started?.quests), canon(fromRows?.basis.slice(1)) === canon(started?.basis.slice(1))],
      [1, 2, ["d-inf", "d-risk"], true, true]
    );
    eq(
      "… Start's v0 per key is its readings' recall count, so its set is the rows' set; a v0 counted over every card (Inference 13, multiple choice in) would freeze another set",
      [canon(overCounted?.quests) === canon(fromRows?.quests) && canon(overCounted?.basis.slice(1)) === canon(fromRows?.basis.slice(1))],
      [false]
    );
    const render = await freezeWeekQuests(U, later, "RENDER", { ...ON, store });
    const load = await loadWeekQuests(U, later, { ...ON, store });
    eq(
      "… a render finds Start's row and writes nothing; loadWeekQuests shows that row, frozen, with the Domains' parts named",
      [render, db.weeks.map((w) => w.source), load?.frozen, canon(load?.set.quests) === canon(started?.quests), (load?.view.rows.find((r) => r.kind === "ADD") as WeekQuestRowV2 | undefined)?.partsLine ?? null],
      [{ froze: 0, skipped: null }, ["START"], true, true, "3 to Inference · 1 to Risk Management · multiple choice not counted"]
    );
    const mon2 = at(W(2), 4, 15);
    const cron = await freezeWeekQuests(U, mon2, "CRON", { ...ON, store });
    const stored = db.weeks[1] ? setOfStored(db.weeks[1]) : null;
    const direct = await weekQuestSetFor(U, "ms2", W(2), mon2, { store, overrides: { snapshot: snap } });
    eq(
      "… and next Monday's cron freezes from the stored snapshot as read back from JSON: the set the in-memory snapshot gives, an ADD part per Domain from needRateByDomain",
      [cron, canon(stored) === canon(direct), partsOf(stored, "ADD")],
      [{ froze: 1, skipped: null }, true, ["d-inf", "d-risk"]]
    );
  }
  {
    // Legacy roadmaps (F-R4-16): no week quests, nothing frozen.
    const legacy = dbOf();
    legacy.facts[0].roadmap.depth = null;
    const store = storeOf(legacy);
    eq("a Field roadmap with depth null is legacy: loadWeekQuests is null and the freeze skips it", [await loadWeekQuests(U, at(W(1), 9), { ...ON, store }), await freezeWeekQuests(U, at(W(1), 4, 15), "CRON", { ...ON, store }), legacy.weeks.length], [null, { froze: 0, skipped: "NO_ROADMAP" }, 0]);
    const f = dbOf().facts[0];
    const row = (stage: string | null | undefined, id = "x"): QuestMilestoneFacts => ({ ...f, milestone: { ...f.milestone, id, stage } });
    eq(
      "isLegacyFacts: depth set and every row staged is not legacy; a row with no stage is; a read without the rev-4 columns is",
      [
        isLegacyFacts(f, [f, row("FLUENT")]),
        isLegacyFacts(f, [f, row(null)]),
        isLegacyFacts({ ...f, roadmap: { ...f.roadmap, depth: undefined } }, [f]),
        isLegacyFacts(row(undefined, "ms2"), [row(undefined, "ms2")]),
      ],
      [false, true, true, true]
    );
    const track = { ...f, roadmap: { ...f.roadmap, fieldId: null, track: "BODY", depth: null }, milestone: { ...f.milestone, stage: "STAGE_1" } };
    eq("a track plan (depth null by design) with its stages set is not legacy", isLegacyFacts(track, [track]), false);
  }
  {
    // A BODY track plan: its practice row on Today carries the health line.
    const body = dbOf();
    body.facts[0].roadmap = { ...body.facts[0].roadmap, fieldId: null, track: "BODY", depth: null };
    body.facts[0].milestone.stage = "STAGE_1";
    body.measures.ms2 = [];
    body.items.ms2 = body.items.ms2.filter((i) => i.kind !== "DOMAIN");
    const load = await loadWeekQuests(U, at(addDays(W(1), 2), 10), { ...ON, store: storeOf(body) });
    eq("a BODY plan's PRACTICE row on Today carries `health`; nothing else does", load?.view.rows.map((r) => [r.kind, (r as WeekQuestRowV2).health ?? null]), [["PRACTICE", true]]);
    const field = await loadWeekQuests(U, at(addDays(W(1), 2), 10), { ...ON, store: storeOf(dbOf()) });
    check("… a Field plan's rows never do", !!field && field.view.rows.every((r) => (r as WeekQuestRowV2).health === undefined));
  }
}

/**
 * Confirm to unlock (contracts §19, the safety-gaps round; lane R4's cases
 * on R6's own reading): the week reads the plan's gate from the roadmap row's
 * words and stored answer (questGateOf). Every BODY or CARE plan asks
 * whatever its words (decision 1), a CRAFT plan on a cue, a Field Area never;
 * only the card's answer under the current words releases a kind (a stored
 * per-kind FINE never does), an AVOID stands across new words, and CARE's
 * safe kinds never wait (decision 2).
 */
async function gate19() {
  console.log("— confirm to unlock (§19): the week's own gate —");
  const U = "user1";
  const DAY: DayKey = "2026-10-05";
  const row = (o: Partial<QuestRoadmapRow> = {}): QuestRoadmapRow => ({
    id: "rm1",
    status: "ACTIVE",
    fieldId: null,
    track: "BODY",
    depth: null,
    hoursPerWeek: 5,
    intensity: "STEADY",
    startPoint: "BASICS",
    typicalHours: null,
    typicalHoursSource: null,
    targetDay: addDays(M, 300),
    practicesAllowed: true,
    aim: "Run a sub-50 10K",
    constraints: null,
    examLabel: null,
    syllabus: null,
    coverage: null,
    ...o,
  });
  const stateOf = (r: QuestRoadmapRow) =>
    constraintsStateOf({
      track: catalogTrackOf({ fieldId: r.fieldId, track: r.track as Track }),
      texts: cueTextsOf({ constraints: r.constraints ?? null, aim: r.aim ?? "", examLabel: r.examLabel ?? null, typicalHoursSource: r.typicalHoursSource, syllabus: null }),
      exam: !!r.examLabel,
      practicesAllowed: r.practicesAllowed,
    });
  /** The row once the user answered its card under its words (R4 stores answerActivityCard's result in Roadmap.coverage). */
  const answered = (r: QuestRoadmapRow, avoid: readonly string[] = []): QuestRoadmapRow => {
    const st = stateOf(r);
    const res = answerActivityCard(activityConfirmOf(r.coverage), st, { key: st.key, avoid: [...avoid] as CatalogKey[], nothingToAvoid: avoid.length === 0 }, DAY);
    if (!res.ok) throw new Error(`fixture answer: ${res.error}`);
    return { ...r, coverage: coverageJsonOf(null, res.value) };
  };
  const blocked = (r: QuestRoadmapRow): string[] | null => questGateOf(r)?.blocked ?? null;
  const has = (r: QuestRoadmapRow, k: string) => (blocked(r) ?? []).includes(k);
  const body = row();
  eq(
    "decision 1: a BODY plan with no constraints and a plain aim holds every gated kind until its card is answered; the safe sessions never wait",
    [["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION", "FULL_ATTEMPT", "PERFORMANCE_CHECK"].every((k) => has(body, k)), ["EASY_SESSION", "MOBILITY_SESSION", "TECHNIQUE_SESSION"].some((k) => has(body, k))],
    [true, false]
  );
  eq("…after “Nothing to avoid” only the Mock test the card never listed (no exam) still waits", blocked(answered(body)), ["MOCK_TEST"]);
  const avoided = answered(body, ["STRENGTH_SESSION"]);
  eq("…an answer ticking Strength holds Strength and releases Longer", [has(avoided, "STRENGTH_SESSION"), has(avoided, "LONGER_SESSION")], [true, false]);
  const reworded = { ...avoided, constraints: "Shin splints flare up if I run more than twice a week." };
  eq("…new words ask again: Longer waits once more, and the AVOID on Strength stands", [has(reworded, "LONGER_SESSION"), has(reworded, "STRENGTH_SESSION")], [true, true]);
  const oldFine = row({ coverage: { $activities: { key: stateOf(body).key, kinds: { LONGER_SESSION: { verdict: "FINE", day: DAY, reason: "" } } } } });
  check("a per-kind FINE stored by the earlier card releases nothing (it may have been a row the user left unticked)", has(oldFine, "LONGER_SESSION"));
  const care = row({ track: "CARE", aim: "Support Mum's care at home" });
  eq("decision 2: a CARE plan with no constraints waits on its card for its care sessions, never for planning the week or keeping a log", [has(care, "SET_TIME"), has(care, "PLAN_AHEAD"), has(care, "KEEP_A_LOG")], [true, false, false]);
  const craft = row({ track: "CRAFT", aim: "Play a piece on the piano" });
  const wrist = { ...craft, constraints: "Wrist tendinitis, can't play more than 20 minutes." };
  eq("decision 1: a CRAFT plan waits only on a cue ('Wrist tendinitis, …'); its technique session never waits", [blocked(craft), has(wrist, "RUN_THROUGHS"), has(wrist, "TECHNIQUE_SESSION")], [[], true, false]);
  eq("a Field Area never waits on a body cue", blocked(row({ fieldId: "f-trading", track: "CRAFT", constraints: "Bad knee, my back hurts." })), []);

  // End to end: a BODY plan's week holds no quest for a practice of a kind that waits on the card, and holds it once answered.
  const rowsFor = async (roadmap: Partial<QuestRoadmapRow>) => {
    const db = dbOf();
    db.facts[0].roadmap = { ...db.facts[0].roadmap, fieldId: null, track: "BODY", depth: null, aim: "Run a sub-50 10K", constraints: null, examLabel: null, syllabus: null, ...roadmap };
    db.facts[0].milestone.stage = "STAGE_1";
    db.measures.ms2 = [];
    db.items.ms2 = db.items.ms2.filter((i) => i.kind !== "DOMAIN").map((i) => (i.kind === "PRACTICE" ? { ...i, catalogKey: "LONGER_SESSION" } : i));
    const load = await loadWeekQuests(U, at(addDays(W(1), 2), 10), { ...ON, store: storeOf(db) });
    return (load?.view.rows ?? []).map((r) => r.kind);
  };
  eq(
    "a BODY plan's Longer session gets no quest while the card waits (no constraints at all), and gets one once the user answered “Nothing to avoid”",
    [await rowsFor({}), await rowsFor({ coverage: answered(body).coverage })],
    [[], ["PRACTICE"]]
  );
}

async function main() {
  await server();
  await fixRound();
  fixRound2();
  await rev4();
  await gate19();
  greps();
  if (failed > 0) {
    console.log(`\nroadmap-quests-check: ${passed} passed, ${failed} FAILED`);
    process.exit(1);
  }
  console.log(`\nroadmap-quests-check: ${passed} passed, 0 failed`);
}

void main();
