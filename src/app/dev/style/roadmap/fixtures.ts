/**
 * /dev/style/roadmap fixtures (lane R5; F23): pure, made-up data in the
 * mockups' example (a trading aim, a Body aim, a credential aim). Nothing here
 * reads the user's roadmap or any database. The figures are cast to their
 * evidence brands HERE ONLY, by `fig` below: no real surface ever builds a
 * branded figure (the views arrive branded from R1 and R6), and
 * roadmap-ui-check asserts that no file under src/components/roadmap or
 * src/app/you/roadmap casts one.
 *
 * States (the audits' twelve, plus the intake form with a key, an ACTIVE
 * roadmap with a pending re-plan, and a live-shaped draft):
 *   empty · no-key · running · draft-mixed · draft-credential · accepted ·
 *   active · behind · past-due · start-refit · body-practice · done · intake ·
 *   active-replan · draft-live
 * Revision 4 (roadmap-rev4.md; the spec's Statistics pack aimed at a depth):
 *   depth-realistic · depth-calibrating · depth-over · depth-lowered ·
 *   coverage-choice · exam-waypoint · count-gate · held-stages · legacy ·
 *   legacy-draft · done-depth · archived · draft-v3 (the keys-only
 *   "draft-mixed-3") · draft-exam · draft-v4 (contracts §20: code's practice
 *   progression, built with the real progressionOf, and Gemini's choices
 *   among each stage's options) · draft-manual ("Write it myself": the plan
 *   stays the user's, each stage offering "Add the app's practice") ·
 *   draft-low-hours (the app's plan at 3 h a week: one practice per stage,
 *   two kinds taking turns week about where a stage's role needs both) ·
 *   draft-body · draft-rejected ·
 *   draft-impossible · draft-gaps · intake-depth · intake-empty-library ·
 *   intake-gemini. draft-gaps and intake-gemini are lead-only: drawn with a
 *   switch on (RoadmapFixture.gates) that is off in this build.
 * Confirm to unlock (contracts §19; CONFIRM_STATES, built with the real gate):
 *   draft-confirm · draft-words · draft-care · draft-craft · active-confirm ·
 *   active-answered · intake-confirm.
 *
 * draft-live is shaped like R4's view builder output with none of the fields
 * the server derives on read: no `library`, no `struck`/`reasons`, no title
 * flags, no `wrote`/`capped`, no `stepDone`/`practiceKept`/`label`, no
 * `acceptedRun`/`positions`/`titleStruck`, and no Aim card `acceptedDay`. It shows
 * how the live page degrades (no Map to…, no Add a Domain, numbers struck by
 * the device's own re-check) where the other fixtures carry every field.
 * Each fixture's "measured" time sits on its own today, never after it.
 */
import {
  AIM_RANKS,
  ORIGINS,
  cardsAtLevelKey,
  domainName,
  outlineOrderOf,
  outlineStagesOf,
  practiceMinutesPerWeekOf,
  provenanceOf,
  type ActivityConfirm,
  type ActivityConfirmView,
  type AimCardView,
  type AimRankName,
  type AimRankView,
  type CheckpointKind,
  type ConstraintExclusion,
  type CoverageBreakdown,
  type DateCheck,
  type DepthView,
  type DomainAddition,
  type DraftView,
  type EvidenceValue,
  type Feasibility,
  type Intake,
  type IntakeFieldOption,
  type IntakeView,
  type ItemDraft,
  type KnowledgeCheck,
  type LibraryDomain,
  type Measured,
  type MeasureRowView,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneFeasibility,
  type MilestoneRowView,
  type ProficiencyView,
  type Recorded,
  type RoadmapHeader,
  type RoadmapView,
  type RunView,
  type SelfReported,
  type StageKey,
  type StartPreview,
  type Throughput,
  type WeekQuestRow,
  type WeekQuestsView,
  type YoursText,
} from "@/lib/roadmap-types";
import {
  activityConfirmViewOf,
  allowedKindsFor,
  catalogEntryOf,
  constraintsStateOf,
  practiceSizeOf,
  progressionLabelOf,
  progressionNotesOf,
  progressionOf,
  stageBandFloorOf,
  type CatalogKey,
  type CatalogTrack,
  type ProgressionInput,
} from "@/lib/roadmap-catalog";
import { addDays } from "@/lib/life-day";
import {
  SEEN_WHAT,
  daySeenValue,
  proficiencyBasisKeyOf,
  seenBasesOfRoadmap,
  seenMeasureWhat,
  seenQuestWhat,
  seenSeedsOf,
  undecidedOf,
  type AimCardMotionFields,
  type ProficiencyBasisField,
  type SeenBases,
  type SeenSeed,
  type WeekQuestMotionFields,
} from "@/components/roadmap/roadmap-ui-model";

/**
 * Every state, as one literal list: scripts/ui-audit.mjs and roadmap-contract-check
 * read the quoted names between these brackets, so a state added here is audited
 * without an ui-audit edit. The revision-4 states follow the rev-3 ones.
 */
export const FIXTURE_STATES = [
  "empty",
  "no-key",
  "running",
  "draft-mixed",
  "draft-credential",
  "accepted",
  "active",
  "behind",
  "past-due",
  "start-refit",
  "body-practice",
  "done",
  "intake",
  "active-replan",
  "draft-live",
  "depth-realistic",
  "depth-calibrating",
  "depth-over",
  "depth-lowered",
  "coverage-choice",
  "exam-waypoint",
  "count-gate",
  "held-stages",
  "legacy",
  "legacy-draft",
  "done-depth",
  "archived",
  "draft-v3",
  "draft-exam",
  "draft-v4",
  "draft-manual",
  "draft-low-hours",
  "draft-body",
  "draft-rejected",
  "draft-impossible",
  "draft-gaps",
  "intake-depth",
  "intake-empty-library",
  "intake-gemini",
  "draft-confirm",
  "draft-words",
  "draft-care",
  "draft-craft",
  "active-confirm",
  "active-answered",
  "intake-confirm",
  "rank-new",
  "reach-new",
  "reach-pending",
  "closed-unreached",
  "closed-unreached-aim",
  "quest-done-new",
  "date-moved",
  "horizon-unmeasured",
  "horizon-self-reported",
  "rebase-switched-off-seen-before",
  "capacity-calibrating",
  "since-line",
  "run-stale",
  "writes-off",
] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

/** Revision 4's states (roadmap-rev4.md F-R4-15's ui-audit list, then the drafts, the intake and the lead-only switches); roadmap-ui-check pins that each is in FIXTURE_STATES. */
export const REV4_STATES = [
  "depth-realistic",
  "depth-calibrating",
  "depth-over",
  "depth-lowered",
  "coverage-choice",
  "exam-waypoint",
  "count-gate",
  "held-stages",
  "legacy",
  "legacy-draft",
  "done-depth",
  "archived",
  "draft-v3",
  "draft-exam",
  "draft-v4",
  "draft-manual",
  "draft-low-hours",
  "draft-body",
  "draft-rejected",
  "draft-impossible",
  "draft-gaps",
  "intake-depth",
  "intake-empty-library",
  "intake-gemini",
  "draft-confirm",
  "draft-words",
  "draft-care",
  "draft-craft",
  "active-confirm",
  "active-answered",
  "intake-confirm",
] as const satisfies readonly FixtureState[];
type Rev4State = (typeof REV4_STATES)[number];

/** Constraint safety's states (contracts §19: the activity card on a body, care and craft draft, a Field plan's suggestions, the living roadmap asking again and answered, the intake); each is in REV4_STATES. */
export const CONFIRM_STATES = ["draft-confirm", "draft-words", "draft-care", "draft-craft", "active-confirm", "active-answered", "intake-confirm"] as const satisfies readonly Rev4State[];
type ConfirmState = (typeof CONFIRM_STATES)[number];

/**
 * UI motion's states (ui-motion.md §9.3, R0; contracts §21): the spec's list,
 * three of which predate it (past-due, depth-calibrating, archived). Each new
 * one is an existing view with one fact changed and, for a SEEN event, what
 * the viewer last saw (RoadmapFixture.seen): the page seeds the seen store
 * with it, so the event plays once. A pending reach, a closed-unreached
 * milestone or aim and a rebase play nothing by construction.
 */
export const MOTION_STATES = [
  "rank-new",
  "reach-new",
  "reach-pending",
  "closed-unreached",
  "closed-unreached-aim",
  "past-due",
  "quest-done-new",
  "date-moved",
  "horizon-unmeasured",
  "horizon-self-reported",
  "rebase-switched-off-seen-before",
  "depth-calibrating",
  "capacity-calibrating",
  "since-line",
  "run-stale",
  "archived",
  "writes-off",
] as const satisfies readonly FixtureState[];
/** The ones R0 adds (the rest are rev-3 and rev-4 states). */
export const MOTION_NEW_STATES = [
  "rank-new",
  "reach-new",
  "reach-pending",
  "closed-unreached",
  "closed-unreached-aim",
  "quest-done-new",
  "date-moved",
  "horizon-unmeasured",
  "horizon-self-reported",
  "rebase-switched-off-seen-before",
  "capacity-calibrating",
  "since-line",
  "run-stale",
  "writes-off",
] as const satisfies readonly (typeof MOTION_STATES)[number][];
type MotionNewState = (typeof MOTION_NEW_STATES)[number];

function isMotionNewState(s: FixtureState): s is MotionNewState {
  return (MOTION_NEW_STATES as readonly string[]).includes(s);
}

function isConfirmState(s: FixtureState): s is ConfirmState {
  return (CONFIRM_STATES as readonly string[]).includes(s);
}

function isRev4State(s: FixtureState): s is Rev4State {
  return (REV4_STATES as readonly string[]).includes(s);
}

export function fixtureStateOf(raw: unknown): FixtureState {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return (FIXTURE_STATES as readonly string[]).includes(String(s)) ? (s as FixtureState) : "active";
}

/** The fixtures' only brand casts (made-up figures for a style page). */
type Evidence = "MEASURED" | "RECORDED" | "SELF";
export function fig(n: number, caption: string, kind: Evidence = "MEASURED"): EvidenceValue {
  const value = kind === "MEASURED" ? (n as Measured) : kind === "RECORDED" ? (n as Recorded) : (n as SelfReported);
  return { value, caption };
}

/** ORIGINS[1] is the code origin (names the app writes from closed templates). */
const APP = ORIGINS[1];

export const TODAY = "2027-01-28";
const MEASURED_AT = "2027-01-27T22:12:00.000Z"; // 09:12 Sydney (AEDT)

/** 09:12 (AEDT) or 08:12 (AEST) Sydney on `day`: a fixture's reading is taken on its own today, never after it. */
export function measuredAtOn(day: string): string {
  return `${addDays(day, -1)}T22:12:00.000Z`;
}

const LIB: LibraryDomain[] = [
  { id: "d-bt", name: "Algorithmic Backtesting", fieldId: "f-tr", fieldName: "Trading", cards: 46, atSix: 19, atTop: 4, level: 5, sample: ["Walk-forward windows", "Out-of-sample decay", "Survivorship in FX data"] },
  { id: "d-rm", name: "Risk Management", fieldId: "f-tr", fieldName: "Trading", cards: 47, atSix: 24, atTop: 5, level: 5, sample: ["Kelly sizing with estimation error", "Correlated drawdowns", "Daily loss limits"] },
  { id: "d-ps", name: "Position Sizing", fieldId: "f-tr", fieldName: "Trading", cards: 14, atSix: 2, atTop: 0, level: 1 },
  { id: "d-qs", name: "Quantitative System Dev", fieldId: "f-tr", fieldName: "Trading", cards: 33, atSix: 9, atTop: 2, level: 3 },
  { id: "d-mp", name: "Market Psychology", fieldId: "f-tr", fieldName: "Trading", cards: 29, atSix: 12, atTop: 2, level: 4 },
  { id: "d-pt", name: "Probability Theory", fieldId: "f-ms", fieldName: "Mathematics & Statistics", cards: 41, atSix: 14, atTop: 3, level: 4 },
];

let seq = 0;
function item(p: Partial<ItemDraft> & Pick<ItemDraft, "kind" | "label">): ItemDraft {
  seq += 1;
  return {
    id: `it${seq}`,
    lineageId: `li${seq}`,
    ord: seq,
    rawLabel: null,
    origin: "GEMINI",
    decision: "PENDING",
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
    ...p,
  };
}

function cardsMeasure(id: string, domainIds: string[], level: number, target: number, baseline: number | null, source: "WORKED_OUT" | "YOURS" = "WORKED_OUT"): MeasureSpec {
  return {
    id,
    kind: "CARDS_AT_LEVEL",
    role: "PAYS",
    scope: { domainIds },
    minLevel: level,
    target,
    targetSource: source,
    fittedTarget: target,
    rateSource: "SCOPE",
    baseline,
    baselineDay: baseline != null ? "2026-10-04" : null,
    unit: "cards",
    itemLineageId: null,
    measureKey: `CARDS_AT_LEVEL|d:${[...domainIds].sort().join(",")}|L${level}`,
  };
}

function practiceMeasure(id: string, target: number): MeasureSpec {
  return { id, kind: "PRACTICE_KEPT", role: "PAYS", scope: { itemLineageIds: [] }, minLevel: null, target, targetSource: "WORKED_OUT", fittedTarget: null, rateSource: null, baseline: null, baselineDay: null, unit: "sessions", itemLineageId: null, measureKey: null };
}

function milestone(p: Partial<MilestoneDraft> & Pick<MilestoneDraft, "ord" | "title">): MilestoneDraft {
  return {
    id: `m${p.ord}`,
    lineageId: `ml${p.ord}`,
    version: 1,
    titleOrigin: "GEMINI",
    titleDecision: "PENDING",
    windowStart: null,
    dueDay: null,
    status: "DRAFT",
    rankIndex: null,
    overAccepted: false,
    items: [],
    measures: [],
    notes: [],
    ...p,
  };
}

function knowledge(measureKey: string, level: number, verdict: KnowledgeCheck["verdict"], target: number, baseline: number, expected: number, best: number, strictMax: number, earliestDay: string | null = null): KnowledgeCheck {
  return { measureKey, level, verdict, target, fitted: verdict === "FITTED" ? target : null, baseline, expected, best, strictMax, bestCase: false, earliestDay, lastCardDay: null, basis: [] };
}

function mfOf(m: MilestoneDraft, k: KnowledgeCheck[], time: Partial<MilestoneFeasibility["time"]> = {}, worst: MilestoneFeasibility["worst"] = "FITS"): MilestoneFeasibility {
  return {
    kind: "PLAN",
    lineageId: m.lineageId,
    ord: m.ord,
    knowledge: k,
    time: {
      verdict: "FITS",
      unverified: false,
      ratio: 0.74,
      worstWeek: { weekStart: "2026-11-16", reviewMin: 95, writeMin: 25, practiceMin: 80, availableMin: 270, availableClass: "ESTIMATED" },
      basis: ["You've tracked ≈ 9 h 10 a week of tasks (task estimates). Plans may add up to +50% (≈ 4 h 30) until your tracked time grows; you said 8 h."],
      ...time,
    },
    worst,
    basis: [],
    remedies: worst === "IMPOSSIBLE" ? ["MOVE_DATE", "REFIT_LIGHT", "MOVE_TO_LATER"] : [],
    weeks: [],
    lastCardDay: null,
  };
}

const THROUGHPUT: Throughput = {
  finalDay: "2027-01-26",
  trackedMinutes: { kind: "measured", median: 550, p25: 380, weeks: 8 },
  geminiShare: 0.38,
  playMinutes: { kind: "measured", median: 40, p25: 0, weeks: 8 },
  trackedByTrack: {},
  trackedByCategory: {},
  completions: { kind: "measured", median: 31, p25: 22, weeks: 8 },
  activeDays: { kind: "measured", median: 6, p25: 5, weeks: 8 },
  adherence: { kind: "measured", value: 0.74, n: 38 },
  reviewsPerDay: { kind: "measured", median: 27, p25: 19, weeks: 8 },
  passShare: { kind: "measured", value: 0.84, n: 142 },
  clearance: { kind: "measured", value: 0.92, n: 14 },
  newCards: { total: { kind: "measured", median: 9, p25: 5, weeks: 8 }, byField: {}, byDomain: {} },
};

const CALIBRATING_TP: Throughput = {
  ...THROUGHPUT,
  trackedMinutes: { kind: "calibrating", have: 1, need: 4 },
  geminiShare: null,
  adherence: { kind: "calibrating", have: 3, need: 8 },
  passShare: { kind: "calibrating", have: 12, need: 30 },
  reviewsPerDay: { kind: "calibrating", have: 1, need: 4 },
  newCards: { total: { kind: "calibrating", have: 1, need: 4 }, byField: {}, byDomain: {} },
};

const TRADING_AIM = "Become a consistently profitable systematic EUR/USD trader by 2028";

function header(p: Partial<RoadmapHeader> = {}): RoadmapHeader {
  return {
    id: "rm1",
    aim: TRADING_AIM,
    area: { kind: "FIELD", fieldId: "f-tr", name: "Trading", level: 6 },
    status: "ACTIVE",
    startDay: "2026-10-04",
    targetDay: "2027-12-31",
    version: 1,
    acceptedDay: "2026-10-04",
    firstAcceptedDay: "2026-10-04",
    reachedDay: null,
    doneDay: null,
    doneReason: null,
    archivedDay: null,
    archiveReason: null,
    hoursPerWeek: 8,
    intensity: "STEADY",
    track: "CRAFT",
    credential: false,
    nonEnglish: false,
    hasSyllabus: false,
    constraints: "Full-time job: evenings and Sunday mornings only. No money for paid courses or signals.",
    examLabel: null,
    aimCheck: { kind: "unchecked" },
    over: false,
    targetLowered: null,
    ...p,
  };
}

function ladder(given: number, next: number | null, count = 6): AimRankView["ladder"] {
  const rows: AimRankView["ladder"] = [{ index: 0, name: AIM_RANKS[0], milestoneOrd: null, state: "given" }];
  for (let i = 1; i <= Math.min(5, count); i++) rows.push({ index: i, name: AIM_RANKS[i], milestoneOrd: i, state: i <= given ? "given" : i === next ? "next" : "later" });
  if (count >= 4) rows.push({ index: 6, name: AIM_RANKS[6], milestoneOrd: null, state: "later" });
  return rows;
}

function rank(given: number, count = 6, p: Partial<AimRankView> = {}): AimRankView {
  const next = given + 1 <= Math.min(5, count) ? given + 1 : null;
  return {
    index: given,
    name: AIM_RANKS[given],
    newSince: null,
    next: next ? { kind: "milestone", index: next, name: AIM_RANKS[next], milestoneOrd: next } : count >= 4 ? { kind: "paragon" } : { kind: "top" },
    top: count >= 4 ? { index: 6, name: AIM_RANKS[6], withAim: true } : { index: Math.min(5, count), name: AIM_RANKS[Math.min(5, count)], withAim: false },
    pending: null,
    ladder: ladder(given, next, count),
    ...p,
  };
}

/**
 * The fixtures' Proficiency basis keys (UI motion, D8): made up as the lib
 * makes them (proficiencyBasisKeyOf over a version and a basis signature), so
 * a re-plan (version 2) and a practice switched off at Start (same version,
 * another signature) each read as a new basis and never animate.
 */
export const FIXTURE_BASIS = {
  v1: proficiencyBasisKeyOf(1, "fixture:basis:v1"),
  v1SwitchedOff: proficiencyBasisKeyOf(1, "fixture:basis:v1:backtest-off"),
  v1DepthLowered: proficiencyBasisKeyOf(1, "fixture:basis:v1:depth-10"),
  v2: proficiencyBasisKeyOf(2, "fixture:basis:v2"),
} as const;

function proficiency(value: number, parts: ProficiencyView["parts"], reached: number, scheduled: number, p: Partial<ProficiencyView & ProficiencyBasisField> = {}, today = TODAY): ProficiencyView & ProficiencyBasisField {
  const tick = parts.practice != null;
  return {
    figure: fig(value, tick ? (parts.cards != null ? "tested by your reviews and your ticks" : "from your ticks") : "tested by your reviews", tick ? "SELF" : "MEASURED"),
    percent: Math.floor(value * 100 + 1e-9),
    class: tick ? "SELF_REPORTED" : "MEASURED",
    parts,
    shares: { cards: parts.cards != null ? 0.6 : null, practice: parts.practice != null ? 0.25 : null, milestones: 0.15 },
    reached,
    scheduled,
    measuredAt: measuredAtOn(today),
    change: null,
    live: false,
    basisKey: FIXTURE_BASIS.v1,
    ...p,
  };
}

// ── The trading plan: milestone 1 as accepted (nothing on Today yet) ──────────

/** Milestone 1 accepted and not started: its own items, kept or checked at Accept, with no task on Today. */
const M1 = (): MilestoneDraft =>
  milestone({
    ord: 1,
    title: "Backtests that hold up",
    titleDecision: "KEPT",
    windowStart: "2026-10-04",
    dueDay: "2026-12-20",
    status: "PLANNED",
    rankIndex: 1,
    items: [
      item({ kind: "DOMAIN", label: "Algorithmic Backtesting", domainId: "d-bt", decision: "CHECKED" }),
      item({ kind: "DOMAIN", label: "Quantitative System Dev", domainId: "d-qs", decision: "KEPT" }),
      item({ kind: "TOPIC", label: "Walk-forward testing", domainId: "d-bt", decision: "KEPT" }),
      item({ kind: "TOPIC", label: "Look-ahead and survivorship bias", domainId: "d-bt", decision: "CHECKED" }),
      item({ kind: "PRACTICE", label: "Drill reading backtest reports", method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W", planSource: "WORKED_OUT", decision: "KEPT", lineageId: "lp-dr" }),
      item({ kind: "STEP", label: "Write the entry and exit rules of your EUR/USD system", decision: "EDITED", lineageId: "ls-er" }),
      item({ kind: "CHECKPOINT", label: "Explain a backtest report aloud", checkpointKind: "SELF_TEST", bar: 7, outOf: 10, decision: "KEPT", lineageId: "lc-er" }),
    ],
    measures: [cardsMeasure("ms1c", ["d-bt", "d-qs"], 6, 43, 28), practiceMeasure("ms1p", 26)],
  });

// ── The trading plan, milestone 2 started ──────────────────────────────────────

function m2Items(): ItemDraft[] {
  return [
    item({ kind: "DOMAIN", label: "Risk Management", domainId: "d-rm", decision: "CHECKED" }),
    item({ kind: "DOMAIN", label: "Position Sizing", domainId: "d-ps", origin: "USER", decision: "EDITED" }),
    item({ kind: "TOPIC", label: "Kelly sizing and its limits", domainId: "d-ps", decision: "CHECKED" }),
    item({ kind: "TOPIC", label: "Correlated positions", domainId: "d-rm", decision: "KEPT" }),
    item({ kind: "TOPIC", label: "Maximum adverse excursion", domainId: "d-rm", origin: "USER", decision: "EDITED" }),
    item({ kind: "PRACTICE", label: "Backtest", method: "DELIBERATE_PRACTICE", sessionsPerWeek: 3, durationBand: "D45", rule: "TARGET:3/W", planSource: "WORKED_OUT", decision: "EDITED", templateId: "t-bt", lineageId: "lp-bt" }),
    item({ kind: "PRACTICE", label: "Study Risk Management, Position Sizing", method: "READING", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W", planSource: "WORKED_OUT", origin: APP, decision: "KEPT", templateId: "t-st", lineageId: "lp-st", notes: ["STUDY_ADDED"] }),
    item({ kind: "STEP", label: "Write the position-sizing rule for the system", decision: "EDITED", templateId: "t-s1", lineageId: "ls1" }),
    item({ kind: "STEP", label: "Set a maximum daily loss", decision: "CHECKED", templateId: "t-s2", lineageId: "ls2" }),
    item({ kind: "STEP", label: "Write the exit rule for a losing streak", decision: "EDITED", templateId: "t-s3", lineageId: "ls3" }),
    item({ kind: "CHECKPOINT", label: "Size historical trades by hand", checkpointKind: "PERFORMANCE_CHECK", bar: 8, outOf: 10, decision: "EDITED", lineageId: "lc1" }),
  ];
}

const M2 = (): MilestoneDraft =>
  milestone({
    ord: 2,
    title: "Risk and position sizing",
    titleDecision: "CHECKED",
    windowStart: "2026-12-21",
    dueDay: "2027-03-07",
    status: "STARTED",
    rankIndex: 2,
    items: m2Items(),
    measures: [cardsMeasure("ms2c", ["d-rm", "d-ps"], 6, 42, 21), practiceMeasure("ms2p", 44)],
  });

function weekRow(p: Partial<WeekQuestRow> & Pick<WeekQuestRow, "ord" | "kind" | "label" | "count" | "unit" | "figure">): WeekQuestRow {
  return {
    evidence: p.kind === "RAISE" ? "TESTED" : p.kind === "ADD" ? "RECORDED" : "SELF_REPORTED",
    done: false,
    dueLine: null,
    quotaLine: null,
    slipLine: null,
    seekTemplateId: null,
    place: null,
    href: null,
    ...p,
  };
}

export function weekQuestsFixture(p: Partial<WeekQuestsView> = {}, rows?: WeekQuestRow[]): WeekQuestsView {
  const r =
    rows ??
    [
      weekRow({ ord: 1, kind: "RAISE", label: "Bring 3 cards in Risk Management or Position Sizing to level 6+", count: 3, unit: "card", figure: fig(1, "tested by your reviews · measured 09:12"), dueLine: "1 comes due Tue, 2 Wed, 1 Sat", href: "/you/roadmap#now" }),
      weekRow({ ord: 2, kind: "ADD", label: "Add 5 cards to Risk Management or Position Sizing", count: 5, unit: "card", figure: fig(2, "counted by the app; it doesn't judge them", "RECORDED"), quotaLine: "counts toward Trading's weekly quota too", href: "/add?field=f-tr&domain=d-rm" }),
      weekRow({ ord: 3, kind: "PRACTICE", label: "Backtest · 3 sessions × 45 min", count: 3, unit: "session", figure: fig(1, "from your ticks", "SELF"), seekTemplateId: "t-bt", place: "in Habits", href: "/today#t-t-bt" }),
      weekRow({ ord: 4, kind: "PRACTICE", label: "Study Risk Management, Position Sizing · 2 sessions × 30 min", count: 2, unit: "session", figure: fig(2, "from your ticks", "SELF"), done: true, seekTemplateId: "t-st", place: "in Habits", href: "/today#t-t-st" }),
      weekRow({ ord: 5, kind: "STEP", label: "Step: Set a maximum daily loss", count: 1, unit: "step", figure: fig(0, "you tick it", "SELF"), seekTemplateId: "t-s2", place: "in Anytime", href: "/today#t-t-s2" }),
    ];
  return {
    milestoneId: "m2",
    milestoneOrd: 2,
    milestoneOf: 6,
    milestoneTitle: "Risk and position sizing",
    weekStart: "2027-01-25",
    weekEnd: "2027-01-31",
    state: "OPEN",
    rows: r,
    done: r.filter((x) => x.done).length,
    total: r.length,
    level: 6,
    frozen: true,
    writesOff: false,
    basis: [
      "Everything is read as of Mon 04:00 except card levels, read Mon 04:15. The set doesn't change this week; finished weeks keep it as issued.",
      "Gap: 42 − 25 = 17 cards to bring to level 6+ (your Sunday reading 25; the milestone's baseline 21).",
      "Weeks left: 6, this one included · pace 17 ÷ 6 → 3.",
      "Reach: 4 cards can reach level 6 this week if passed on their day; at the 84% pass rate stored at Start, about 3.4 (best case 4). Asked: 3.",
      "Still needed: 11 new cards · writing weeks left 2.4 · pace 11 ÷ 2.4 → 5. Most a week asks: 1.5 × the 3.0 a week the plan needed at Start → 5. Asked: 5; no cap bound.",
      "Capacity ≈ 4 h 30: your 8 h × 74% kept, capped at +50% of the ≈ 9 h 10 you track (task estimates, not timed).",
    ],
    cappedBy: null,
    notes: [],
    ...p,
  };
}

function rowsActive(): MilestoneRowView[] {
  const r = (ord: number, title: string, state: MilestoneRowView["state"], ws: string | null, due: string | null, percent: number | null, extra: Partial<MilestoneRowView> = {}): MilestoneRowView => ({
    id: `m${ord}`,
    lineageId: `ml${ord}`,
    ord,
    title,
    state,
    windowStart: ws,
    dueDay: due,
    percent,
    rankIndex: Math.min(ord, 5),
    gaveRank: null,
    reachedDay: null,
    countsFrom: null,
    closedPercent: null,
    titleClass: state === "OUTLINE" ? "DRAFT" : "YOURS",
    ...extra,
  });
  return [
    r(1, "Backtests that hold up", "REACHED", "2026-10-04", "2026-12-20", 100, { reachedDay: "2026-12-18" }),
    r(2, "Risk and position sizing", "CURRENT", "2026-12-21", "2027-03-07", 23),
    r(3, "Forward-testing on a demo account", "OUTLINE", "2027-03-08", "2027-05-16", null),
    r(4, "Execution and costs", "OUTLINE", "2027-05-17", "2027-08-01", null),
    r(5, "Live trading at small size", "OUTLINE", "2027-08-02", "2027-10-17", null),
    r(6, "Consistency review", "OUTLINE", "2027-10-18", "2027-12-31", null),
  ];
}

function feasibilityActive(): Feasibility {
  const m2 = M2();
  const others = [3, 4, 5, 6].map((ord) => mfOf(milestone({ ord, title: "" }), [knowledge(`k${ord}`, 8, "FITTED", 30, 10, 26, 38, 44)], ord === 4 ? { verdict: "TIGHT" } : {}));
  return {
    today: TODAY,
    m: 1,
    milestones: [mfOf(m2, [knowledge(m2.measures[0].measureKey!, 6, "FITTED", 42, 21, 51, 61, 68)]), ...others],
    aimCheck: { kind: "unchecked" },
    basis: [],
    remedies: [],
    impossible: false,
    over: false,
  };
}

function cardsRow(p: Partial<MeasureRowView> = {}): MeasureRowView {
  return {
    measureKey: "CARDS_AT_LEVEL|d:d-ps,d-rm|L6",
    kind: "CARDS_AT_LEVEL",
    role: "PAYS",
    target: 42,
    baseline: 21,
    figure: fig(26, "tested by your reviews"),
    gained: 5,
    needed: 21,
    alreadyCounted: 21,
    pace: { kind: "on-pace", day: "2027-03-07", pipeline: 19, bestCase: false },
    measuredAt: MEASURED_AT,
    basisClass: "WORKED_OUT",
    ...p,
  };
}

/** The Gemini run that wrote the accepted version 1 of the trading plan (RoadmapView.acceptedRun; also the latest run until a re-plan). */
function acceptedGeminiRun(): RunView {
  return { id: "r1", kind: "GEMINI", status: "OK", startedAt: "2026-10-03T22:12:00.000Z", finishedAt: "2026-10-03T22:12:14.200Z", model: "gemini-3.5-flash-lite", modelVersion: "gemini-3.5-flash-lite", promptVersion: 2, drafts: 1, stale: false, usualSeconds: null, error: null, report: { dropped: [], flagged: [], notes: [] }, wrote: "GEMINI", capped: false };
}

function activeView(p: Partial<RoadmapView> = {}): RoadmapView {
  const m2 = M2();
  const current = {
    milestone: m2,
    measures: [
      cardsRow(),
      { measureKey: "PRACTICE_KEPT|t:t-bt,t-st|from:2026-12-21", kind: "PRACTICE_KEPT" as const, role: "PAYS" as const, target: 44, baseline: null, figure: fig(22, "from your ticks", "SELF"), gained: null, needed: null, alreadyCounted: null, pace: { kind: "on-pace" as const }, measuredAt: MEASURED_AT, basisClass: "SELF_REPORTED" as const },
    ],
    headline: fig(0.238, "tested by your reviews"),
    goalId: "g2",
    starting: false,
    stated: 6,
    zeroReason: null,
    checkpointLog: null,
    pastDue: false,
    stepDone: { ls1: "2027-01-12" },
    practiceKept: { "lp-bt": { kept: 10, of: 16 }, "lp-st": { kept: 12, of: 12 } },
  };
  return {
    state: "ACTIVE",
    today: TODAY,
    hasKey: true,
    keyTier: "FREE",
    writesOff: false,
    goalsLive: true,
    header: header(),
    run: acceptedGeminiRun(),
    acceptedRun: acceptedGeminiRun(),
    positions: 6,
    draft: null,
    rank: rank(1),
    proficiency: proficiency(0.4189, { cards: 0.55, practice: 0.23, milestones: 1 / 6 }, 1, 6),
    toward: {
      measures: [
        cardsRow({
          measureKey: "CARDS_AT_LEVEL|d:d-bt,d-mp,d-qs,d-rm|L10",
          label: "Algorithmic Backtesting, Quantitative System Dev, Risk Management, Market Psychology · cards at level 10+",
          target: 46,
          baseline: 6,
          figure: fig(12, "tested by your reviews"),
          gained: 6,
          needed: 40,
          alreadyCounted: null,
          pace: { kind: "on-pace", day: "2027-12-31", pipeline: 0, bestCase: false },
        }),
      ],
      reached: 1,
      scheduled: 6,
      practiceKept: { share: 0.76, sessions: 39 },
      weightLine: null,
    },
    current,
    milestones: rowsActive(),
    weekQuests: weekQuestsFixture(),
    pastWeeks: [
      { weekStart: "2027-01-18", milestoneOrd: 2, settled: true, done: 4, total: 5, capped: false, heldDays: 0 },
      { weekStart: "2027-01-11", milestoneOrd: 2, settled: true, done: 5, total: 5, capped: false, heldDays: 0 },
      { weekStart: "2027-01-04", milestoneOrd: 2, settled: true, done: 3, total: 5, capped: false, heldDays: 2 },
      { weekStart: "2026-12-28", milestoneOrd: 2, settled: true, done: 2, total: 4, capped: false, heldDays: 0 },
      { weekStart: "2026-12-21", milestoneOrd: 2, settled: true, done: 3, total: 4, capped: false, heldDays: 0 },
    ],
    throughput: THROUGHPUT,
    feasibility: feasibilityActive(),
    history: [{ version: 1, day: "2026-10-04", undone: false, changes: [] }],
    triggers: [],
    aftercare: [],
    questWeekUnfrozen: false,
    library: LIB,
    ...p,
  };
}

// ── The draft (milestone 1 to decide, 2–6 in outline) ──────────────────────────

function draftMilestones(credential: boolean): MilestoneDraft[] {
  const m1 = milestone({
    ord: 1,
    title: credential ? "Charting foundations" : "Backtests that hold up",
    windowStart: "2026-10-04",
    dueDay: "2026-12-20",
    items: credential
      ? [
          item({ kind: "DOMAIN", label: "Forex 101", domainId: "d-bt" }),
          item({ kind: "TOPIC", label: "Moving averages and momentum", domainId: "d-bt" }),
          item({ kind: "TOPIC", label: "Dow Theory and trend analysis", domainId: "d-bt", flags: ["PROPER_NOUN"] }),
          item({ kind: "TOPIC", label: "CMT Level I syllabus: chart pattern rules", domainId: "d-bt", flags: ["CLAIM_WORDS"] }),
        ]
      : [
          item({ kind: "DOMAIN", label: "Algorithmic Backtesting", domainId: "d-bt" }),
          item({ kind: "DOMAIN", label: "Quantitative System Dev", domainId: "d-qs" }),
          item({ kind: "DOMAIN", label: "Execution cost modelling", proposedName: "Execution cost modelling" }),
          item({ kind: "TOPIC", label: "Walk-forward testing", domainId: "d-bt" }),
          item({ kind: "TOPIC", label: "Look-ahead and survivorship bias", domainId: "d-bt", notes: ["CHECK_LINK"] }),
          item({ kind: "TOPIC", label: "Spread and slippage on EUR/USD", domainId: "d-qs" }),
          item({ kind: "TOPIC", label: "Essential robustness checks", domainId: "d-bt", flags: ["CLAIM_WORDS"] }),
          item({ kind: "TOPIC", label: "Overfitting, from the Kestrel backtesting course", domainId: "d-bt", flags: ["LOOKS_LIKE_RESOURCE", "PROPER_NOUN"] }),
          item({ kind: "PRACTICE", label: "Drill reading backtest reports", method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W", planSource: "WORKED_OUT" }),
          item({ kind: "PRACTICE", label: "Rebuild one strategy test from scratch", method: "PROJECT_WORK", sessionsPerWeek: 1, durationBand: "D60", rule: "TARGET:1/W", planSource: "WORKED_OUT", flags: ["NUMBER"], struck: [[8, 11]] }),
          item({ kind: "STEP", label: "Write the entry and exit rules of your EUR/USD system", flags: ["ABOUT_YOU"] }),
          item({ kind: "STEP", label: "Trade the system profitably and consistently", flags: ["AIM_STEP_EARLY"] }),
          item({ kind: "CHECKPOINT", label: "Explain a backtest report aloud", checkpointKind: "SELF_TEST" }),
        ],
    measures: [cardsMeasure("md1", ["d-bt", "d-qs"], 6, 43, 28)],
  });
  if (!credential) m1.measures.push(practiceMeasure("md1p", 26));
  const outline = (ord: number, title: string, ws: string, due: string, items: ItemDraft[], level: number, target: number, now: number) =>
    milestone({ ord, title, windowStart: ws, dueDay: due, items, measures: [cardsMeasure(`md${ord}`, ["d-rm", "d-mp"], level, target, now)] });
  return [
    m1,
    outline(2, "Risk and position sizing", "2026-12-21", "2027-03-07", [
      item({ kind: "DOMAIN", label: "Risk Management", domainId: "d-rm", flags: ["MATCHED_EXISTING"] }),
      item({ kind: "DOMAIN", label: "Probability Theory", domainId: "d-pt", notes: ["ADDED_TO_SCOPE"] }),
      item({ kind: "TOPIC", label: "Expectancy and its spread", domainId: "d-pt" }),
      item({ kind: "PRACTICE", label: "Study Risk Management, Probability Theory", origin: APP, method: "READING", notes: ["STUDY_ADDED"] }),
      item({ kind: "PRACTICE", label: "Hard workout to max heart rate before the London open", method: "WORKOUT", flags: ["HEALTH", "PROPER_NOUN"] }),
    ], 8, 49, 23),
    numberTitle(outline(3, "Forward-testing on a demo account for 8 weeks", "2027-03-08", "2027-05-16", [item({ kind: "PRACTICE", label: "Code the rules in MetaTrader", method: "PROJECT_WORK", flags: ["PROPER_NOUN"] })], 8, 36, 7)),
    outline(4, "Execution and costs", "2027-05-17", "2027-08-01", [], 10, 12, 2),
    outline(5, "Live trading at small size", "2027-08-02", "2027-10-17", [item({ kind: "STEP", label: "Join a funded-trader challenge", flags: ["CONSTRAINT_CONFLICT"] })], 10, 17, 4),
    outline(6, "Consistency review", "2027-10-18", "2027-12-31", [], 10, 46, 6),
  ];
}

/** A Gemini title with a number in it: the flags, spans and reasons R4 derives on read (MilestoneDraft.titleFlags …). */
function numberTitle(m: MilestoneDraft): MilestoneDraft {
  const at = m.title.search(/\d/);
  return at < 0 ? m : { ...m, titleFlags: ["NUMBER"], titleStruck: [[at, at + 1]], titleReasons: { NUMBER: "Gemini wrote a number; numbers here come from your records or from you" } };
}

function draftView(credential: boolean): RoadmapView {
  const ms = draftMilestones(credential);
  const f: Feasibility = {
    today: "2026-10-04",
    m: 1,
    milestones: ms.map((m) => mfOf(m, [knowledge(m.measures[0].measureKey!, m.measures[0].minLevel ?? 6, "FITTED", m.measures[0].target, m.measures[0].baseline ?? 0, m.measures[0].target + 6, m.measures[0].target + 29, m.measures[0].target + 40)], m.ord === 4 ? { verdict: "TIGHT" } : {})),
    aimCheck: { kind: "unchecked" },
    basis: [],
    remedies: [],
    impossible: false,
    over: false,
  };
  const draft: DraftView = {
    version: 1,
    milestones: ms,
    feasibility: f,
    bulkKeepOff: credential,
    credential,
    nonEnglish: false,
    alarm: credential,
    uncoveredSyllabus: [],
    nextLineageId: ms[0].lineageId,
    acceptable: false,
    nextToDecide: ms[0].id,
  };
  return {
    ...activeView(),
    // Nothing is accepted yet: no run wrote an accepted plan, and the positions aren't read before acceptance.
    acceptedRun: null,
    positions: undefined,
    state: "DRAFT",
    today: "2026-10-04",
    header: header(credential ? { aim: "Pass the CMT Level I exam by June 2027", examLabel: "CMT Level I", credential: true, status: "DRAFT", version: 0, acceptedDay: null, firstAcceptedDay: null, targetDay: "2027-06-27" } : { status: "DRAFT", version: 0, acceptedDay: null, firstAcceptedDay: null }),
    run: {
      id: "r1",
      kind: "GEMINI",
      status: "OK",
      startedAt: "2026-10-03T22:12:00.000Z",
      finishedAt: "2026-10-03T22:12:14.200Z",
      model: "gemini-3.5-flash-lite",
      modelVersion: "gemini-3.5-flash-lite",
      promptVersion: 2,
      drafts: 1,
      stale: false,
      usualSeconds: null,
      error: null,
      wrote: "GEMINI",
      capped: false,
      report: {
        dropped: [
          { milestoneOrd: 1, kind: "TOPIC", label: "Read https://example.test/backtesting", code: "CONTAINED_LINK", reason: "It contained a link. Links are never shown or kept." },
          { milestoneOrd: 4, kind: "DOMAIN", label: "D9", code: "UNKNOWN_KEY", reason: "Not one of the keys sent in this draft." },
        ],
        flagged: [{ milestoneOrd: 2, kind: "DOMAIN", label: "Risk management basics", code: "MATCHED_EXISTING", reason: "Matched to your Domain 'Risk Management' (47 cards). Needs your tap." }],
        notes: [],
      },
    },
    draft,
    rank: null,
    proficiency: null,
    toward: null,
    current: null,
    milestones: [],
    weekQuests: null,
    pastWeeks: [],
    feasibility: null,
    history: [],
  };
}

// ── Other states ──────────────────────────────────────────────────────────────

function bodyView(): RoadmapView {
  const m2 = milestone({
    ord: 2,
    title: "Build an aerobic base",
    titleDecision: "EDITED",
    windowStart: "2026-12-14",
    dueDay: "2027-02-14",
    status: "STARTED",
    rankIndex: 2,
    items: [
      item({ kind: "PRACTICE", label: "Easy runs", method: "WORKOUT", sessionsPerWeek: 3, durationBand: "D45", rule: "TARGET:3/W", decision: "EDITED", templateId: "t-run", lineageId: "lp-run" }),
      item({ kind: "PRACTICE", label: "Strength for knees and hips", method: "WORKOUT", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W", decision: "CHECKED", templateId: "t-str", lineageId: "lp-str" }),
      item({ kind: "STEP", label: "Run a timed 5 km", decision: "EDITED", templateId: "t-5k", lineageId: "ls-5k" }),
    ],
    measures: [practiceMeasure("mb2", 24)],
    notes: ["HEALTH_LINE"],
  });
  const base = activeView();
  return {
    ...base,
    today: "2027-01-07",
    header: header({ id: "rm2", aim: "Run 10 km in under 50 minutes", area: { kind: "TRACK", track: "BODY" }, track: "BODY", targetDay: "2027-04-25", constraints: "Knee injury last year, no running two days in a row", hoursPerWeek: 4, startDay: "2026-10-05", acceptedDay: "2026-10-05", firstAcceptedDay: "2026-10-05" }),
    positions: 3,
    rank: rank(1, 3),
    proficiency: proficiency(0.3789, { cards: null, practice: 0.4, milestones: 1 / 3 }, 1, 3, {}, "2027-01-07"),
    toward: { measures: [], reached: 1, scheduled: 3, practiceKept: { share: 0.81, sessions: 39 }, weightLine: "trend 82.4 kg · your weight goal 78 kg by Mar · you logged" },
    current: {
      milestone: m2,
      measures: [{ measureKey: "PRACTICE_KEPT|t:t-run,t-str|from:2026-12-14", kind: "PRACTICE_KEPT", role: "PAYS", target: 24, baseline: null, figure: fig(14, "from your ticks", "SELF"), gained: null, needed: null, alreadyCounted: null, pace: { kind: "on-pace" }, measuredAt: MEASURED_AT, basisClass: "SELF_REPORTED" }],
      headline: fig(0.583, "slowest part is from your ticks", "SELF"),
      goalId: "gb2",
      starting: false,
      stated: 6,
      zeroReason: null,
      checkpointLog: null,
      pastDue: false,
    },
    milestones: [
      { ...rowsActive()[0], title: "Get running again", reachedDay: "2026-12-13", windowStart: "2026-10-05", dueDay: "2026-12-13" },
      { ...rowsActive()[1], title: "Build an aerobic base", windowStart: "2026-12-14", dueDay: "2027-02-14", percent: 58 },
      { ...rowsActive()[2], title: "Race pace", windowStart: "2027-02-15", dueDay: "2027-04-25" },
    ],
    weekQuests: weekQuestsFixture({ weekStart: "2027-01-04", weekEnd: "2027-01-10", milestoneOf: 3, milestoneTitle: "Build an aerobic base", level: null }, [
      weekRow({ ord: 1, kind: "PRACTICE", label: "Easy runs · 3 sessions × 45 min", count: 3, unit: "session", figure: fig(1, "from your ticks", "SELF"), seekTemplateId: "t-run", place: "in Habits", href: "/today#t-t-run", health: true }),
      weekRow({ ord: 2, kind: "PRACTICE", label: "Strength for knees and hips · 2 sessions × 30 min", count: 2, unit: "session", figure: fig(0, "from your ticks", "SELF"), seekTemplateId: "t-str", place: "in Habits", href: "/today#t-t-str", health: true }),
    ]),
    pastWeeks: [
      { weekStart: "2026-12-28", milestoneOrd: 2, settled: true, done: 4, total: 5, capped: false, heldDays: 0 },
      { weekStart: "2026-12-21", milestoneOrd: 2, settled: true, done: 5, total: 5, capped: false, heldDays: 0 },
      { weekStart: "2026-12-14", milestoneOrd: 2, settled: true, done: 3, total: 4, capped: true, heldDays: 0 },
    ],
    feasibility: { ...feasibilityActive(), milestones: [mfOf(m2, [])] },
    library: [],
  };
}

/** The Start sheet over the very milestone the page shows (its item ids are the ones the sheet looks its rows up by). */
function startPreviewFixture(m2: MilestoneDraft): StartPreview {
  return {
    milestoneId: m2.id!,
    ord: 2,
    of: 6,
    title: m2.title,
    dueDay: "2027-03-07",
    goalsLive: true,
    writesOff: false,
    refusal: null,
    todayCheck: { measureKey: m2.measures[0].measureKey!, stored: 46, fittedNow: 42, reason: "Target 46 was fitted when you accepted; fitted today it would be 42 (fewer new cards in these Domains than planned)." },
    feasibility: mfOf(m2, []),
    pending: [item({ kind: "TOPIC", label: "Order-flow basics", domainId: "d-mp", flags: ["TOPIC_OUTSIDE_SCOPE"] })],
    todayRows: [
      { kind: "TITLE", itemId: null, label: m2.title, class: "KEPT_SUGGESTION", needs: "CHECK_OR_EDIT" },
      { kind: "DOMAIN", itemId: m2.items[0].id, label: "Risk Management", class: "KEPT_SUGGESTION", needs: "CHECK_OR_MAP" },
      { kind: "DOMAIN", itemId: m2.items[1].id, label: "Position Sizing", class: "YOURS", needs: "NONE" },
      { kind: "PRACTICE", itemId: m2.items[6].id, label: "Study Risk Management, Position Sizing", class: "WORKED_OUT", needs: "NONE" },
      { kind: "PRACTICE", itemId: m2.items[5].id, label: "Backtest", class: "YOURS", needs: "NONE" },
      { kind: "CHECKPOINT", itemId: m2.items[10].id, label: "Size historical trades by hand", class: "YOURS", needs: "NONE" },
    ],
    practices: [
      { itemId: m2.items[6].id!, lineageId: "lp-st", name: "Study Risk Management, Position Sizing", rule: "TARGET:2/W", minutes: 30, on: true, alreadyOnToday: null, price: 10, weeklyMinutes: practiceMinutesPerWeekOf(m2.items[6]) },
      { itemId: m2.items[5].id!, lineageId: "lp-bt", name: "Backtest", rule: "TARGET:3/W", minutes: 45, on: true, alreadyOnToday: null, price: 14, weeklyMinutes: practiceMinutesPerWeekOf(m2.items[5]) },
    ],
    steps: m2.items.filter((x) => x.kind === "STEP").map((x) => ({ itemId: x.id!, title: x.label })),
    pay: { stated: 6, zeroReason: null, limitLine: "1 Mid goal paid in the last 30 days (Backtests that hold up, 20 Dec): a second one can still pay.", paidOn: null },
    payBasis: { otherMinutesPerWeek: 150, hasCards: true, lineagePaidOn: null },
    givesRank: "Journeyman",
    weekQuests: {
      weekStart: "2026-12-21",
      milestoneId: "m2",
      state: "OPEN",
      generator: 1,
      cappedBy: null,
      basis: [],
      quests: [
        { ord: 1, kind: "RAISE", label: "Bring 2 cards in Risk Management or Position Sizing to level 6+", count: 2, unit: "card", evidence: "TESTED", from: "2026-12-21", to: "2026-12-27", measureKey: m2.measures[0].measureKey!, domainIds: ["d-rm", "d-ps"], minLevel: 6, floor: 21, dueDays: [], bestCase: false },
        { ord: 2, kind: "ADD", label: "Add 3 cards to Risk Management or Position Sizing", count: 3, unit: "card", evidence: "RECORDED", from: "2026-12-21", to: "2026-12-27", domainIds: ["d-rm", "d-ps"], fieldId: "f-tr", quotaField: null, pace: 3, writingWeeksLeft: 6, lastCardDay: "2027-02-10" },
        { ord: 3, kind: "PRACTICE", label: "Backtest · 3 sessions × 45 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: "2026-12-21", to: "2026-12-27", templateId: "t-bt", minutes: 45 },
      ],
    },
    canStart: false,
    blockers: ["2 rows going to Today are still in Gemini's words."],
  };
}

export interface RoadmapFixture {
  view: RoadmapView | null;
  intake: IntakeView | null;
  aim: AimCardView | null;
  today: WeekQuestsView | null;
  startPreview: StartPreview | null;
  note: string;
  /** A lead-only state drawn with a switch on (ROADMAP_GEMINI_LIVE, ROADMAP_GAPS_LIVE are false in this build; the server still refuses). */
  gates?: { gemini?: boolean; gaps?: boolean };
  /**
   * UI motion (contracts §21): what this viewer last saw, for a SEEN state.
   * The page seeds the seen store with these before its surfaces read it
   * (glyph/useSeen writeSeen, or roadmap-ui-model seenStorageOf), so the
   * event plays once; without them every surface is a first view (no motion).
   */
  seen?: readonly SeenSeed[];
}

function intakeFixture(hasKey: boolean): IntakeView {
  return {
    today: "2026-10-04",
    hasKey,
    keyTier: "FREE",
    writesOff: false,
    draft: null,
    activeRoadmapId: null,
    fields: [
      {
        id: "f-tr",
        name: "Trading",
        level: 6,
        cards: 215,
        inMaintenance: false,
        paceMeasured: true,
        domains: LIB.filter((d) => d.fieldId === "f-tr").map((d) => ({ id: d.id, name: d.name, cards: d.cards, atSix: d.atSix, atTop: d.atTop, paceMeasured: true })),
      },
      { id: "f-ms", name: "Mathematics & Statistics", level: 5, cards: 124, inMaintenance: false, paceMeasured: true, domains: [{ id: "d-pt", name: "Probability Theory", cards: 41, atSix: 14, atTop: 3, paceMeasured: true }] },
      { id: "f-bio", name: "Biological & Chemical Sciences", level: 3, cards: 71, inMaintenance: false, paceMeasured: false, domains: [{ id: "d-rad", name: "Radiographic Imaging", cards: 24, atSix: 7, atTop: 0, paceMeasured: false }] },
      { id: "f-ps", name: "Personal Skill", level: 4, cards: 88, inMaintenance: true, paceMeasured: true, domains: [] },
    ],
    tracked: { kind: "measured", median: 550, p25: 380, weeks: 4 },
  };
}

/** The rank a milestone gives when reached: its plan rankIndex when above the rank held, else none (it keeps the rank). */
function givesRankOf(rankIndex: number | null, held: number): AimRankName | null {
  return rankIndex != null && rankIndex > held ? AIM_RANKS[Math.min(6, rankIndex)] : null;
}

/** Every stored reading of a fixture is taken on its own today (never a "measured" time after it). */
function measuredOnToday(v: RoadmapView): RoadmapView {
  const at = measuredAtOn(v.today);
  const fix = <T extends { measuredAt: string | null }>(x: T): T => (x.measuredAt ? { ...x, measuredAt: at } : x);
  return {
    ...v,
    proficiency: v.proficiency ? fix(v.proficiency) : null,
    current: v.current ? { ...v.current, measures: v.current.measures.map(fix) } : null,
    toward: v.toward ? { ...v.toward, measures: v.toward.measures.map(fix) } : null,
  };
}

/**
 * R4's view builder output with none of the fields the server derives on read
 * (the fix rounds' optional fields): what the live page gets before those land,
 * and what roadmap-ui-check renders to prove the page degrades honestly. Fix
 * round 2 adds `acceptedRun` (the Reference then labels the latest run "Latest
 * run"), `positions` (the counts fall back to positionCountOf over the rows)
 * and the rows' `titleStruck` (nothing struck without the server's spans).
 */
export function liveShaped(v: RoadmapView): RoadmapView {
  const item = (it: ItemDraft): ItemDraft => {
    const out = { ...it };
    delete out.struck;
    delete out.reasons;
    return out;
  };
  const ms = (m: MilestoneDraft): MilestoneDraft => {
    const out = { ...m, items: m.items.map(item) };
    delete out.titleFlags;
    delete out.titleStruck;
    delete out.titleReasons;
    return out;
  };
  const row = (r: MeasureRowView): MeasureRowView => {
    const out = { ...r };
    delete out.label;
    return out;
  };
  const out: RoadmapView = {
    ...v,
    run: v.run ? { ...v.run } : null,
    draft: v.draft ? { ...v.draft, milestones: v.draft.milestones.map(ms) } : null,
    current: v.current ? { ...v.current, milestone: ms(v.current.milestone), measures: v.current.measures.map(row) } : null,
    toward: v.toward ? { ...v.toward, measures: v.toward.measures.map(row) } : null,
    milestones: v.milestones.map((r) => {
      const x = { ...r };
      delete x.titleClass;
      delete x.titleStruck;
      return x;
    }),
  };
  delete out.library;
  delete out.acceptedRun;
  delete out.positions;
  if (out.run) {
    delete out.run.wrote;
    delete out.run.capped;
  }
  if (out.current) {
    delete out.current.stepDone;
    delete out.current.practiceKept;
    delete out.current.paidOn;
  }
  if (out.proficiency) {
    // UI motion's basis key: not on the live view yet (contracts §21.6)
    const p: ProficiencyView & ProficiencyBasisField = { ...out.proficiency };
    delete p.basisKey;
    out.proficiency = p;
  }
  return out;
}

/** The Aim card as loadAimCard returns it without the fields derived on read: no acceptance day, no title class or struck spans. */
export function liveShapedAim(a: AimCardView): AimCardView {
  const out: AimCardView & AimCardMotionFields = { ...a, milestone: a.milestone ? { ...a.milestone } : null };
  delete out.acceptedDay;
  // UI motion's fields the live card doesn't carry yet (contracts §21.6)
  delete out.version;
  delete out.dateOrigin;
  delete out.run;
  delete out.rail;
  if (out.milestone) {
    delete out.milestone.titleClass;
    delete out.milestone.titleStruck;
  }
  return out;
}

function aimFromView(v: RoadmapView, state: AimCardView["state"]): AimCardView & AimCardMotionFields {
  const cur = v.current;
  const row = cur ? v.milestones.find((r) => r.lineageId === cur.milestone.lineageId) : undefined;
  return {
    state,
    roadmapId: v.header?.id ?? null,
    hasKey: v.hasKey,
    writesOff: v.writesOff,
    goalsLive: v.goalsLive,
    aim: v.header?.aim ?? null,
    area: v.header?.area ?? null,
    targetDay: v.header?.targetDay ?? null,
    aimChecked: v.header?.aimCheck.kind === "checked",
    over: v.header?.over ?? false,
    draftItems: null,
    targetLowered: v.header?.targetLowered ?? null,
    measuredAt: v.proficiency?.measuredAt ?? null,
    acceptedDay: v.header?.acceptedDay ?? null,
    rank: v.rank,
    proficiency: v.proficiency,
    milestone: cur
      ? {
          id: cur.milestone.id!,
          ord: cur.milestone.ord,
          of: v.positions ?? v.toward?.scheduled ?? 6,
          title: cur.milestone.title,
          titleClass: provenanceOf(cur.milestone.titleOrigin, cur.milestone.titleDecision),
          ...(row?.titleStruck ? { titleStruck: row.titleStruck } : {}),
          status: cur.pastDue ? "PAST_DUE" : cur.goalId ? "STARTED" : "PLANNED",
          headline: cur.headline,
          percent: cur.headline ? Math.floor(Number(cur.headline.value) * 100) : null,
          pace: cur.measures[0]?.pace ?? null,
          dueDay: cur.milestone.dueDay,
          reachedDay: null,
          countsFrom: null,
          start: cur.goalId ? null : { stated: cur.stated ?? 0, zeroReason: cur.zeroReason, givesRank: givesRankOf(cur.milestone.rankIndex, v.rank?.index ?? 0), paidOn: cur.paidOn ?? null },
        }
      : null,
    weekQuests: v.weekQuests && v.weekQuests.state === "OPEN" ? { done: v.weekQuests.done, total: v.weekQuests.total } : null,
    questWeekUnfrozen: false,
    reachedDay: v.header?.reachedDay ?? null,
    doneDay: v.header?.doneDay ?? null,
    // UI motion (contracts §21.6): the fields the card doesn't carry yet, as the lib will fill them
    version: v.header?.version ?? null,
    dateOrigin: v.header?.dateOrigin?.origin ?? null,
    run: state === "RUNNING" && v.run ? { startedAt: v.run.startedAt, stale: v.run.stale } : null,
    rail: v.milestones.length > 0 ? v.milestones : null,
  };
}

const EMPTY_VIEW = (hasKey: boolean): RoadmapView => ({
  state: "NONE",
  today: TODAY,
  hasKey,
  keyTier: "FREE",
  writesOff: false,
  goalsLive: false,
  header: null,
  run: null,
  draft: null,
  rank: null,
  proficiency: null,
  toward: null,
  current: null,
  milestones: [],
  weekQuests: null,
  pastWeeks: [],
  throughput: null,
  feasibility: null,
  history: [],
  triggers: [],
  aftercare: [],
  questWeekUnfrozen: false,
});

const EMPTY_AIM = (hasKey: boolean): AimCardView => ({
  state: "EMPTY",
  roadmapId: null,
  hasKey,
  writesOff: false,
  goalsLive: false,
  aim: null,
  area: null,
  targetDay: null,
  aimChecked: false,
  over: false,
  draftItems: null,
  targetLowered: null,
  measuredAt: null,
  rank: null,
  proficiency: null,
  milestone: null,
  weekQuests: null,
  questWeekUnfrozen: false,
  reachedDay: null,
  doneDay: null,
});

// ═══ UI motion: the word budgets as fixture blocks (ui-motion.md §3.2; contracts §21.4) ═══

/**
 * Each block a word budget counts, as the lanes mark it: data-wc-block="…"
 * on the block's own element (a lane adds it when it lands its screen), and
 * data-wc-fold on each element that sits in the fold (the first 600 px of
 * main at 344 × 882). Names, not classes: a restyle never moves a budget.
 */
export const WORD_BLOCK = {
  intake: "intake",
  draftHeader: "draft-header",
  draftDate: "draft-date",
  nextCard: "next-card",
  outlineNode: "outline-node",
  aimHeader: "aim-header",
  aimNotes: "aim-notes",
  now: "now",
  milestones: "milestones",
  toward: "toward",
  footer: "roadmap-footer",
  startSheet: "start-sheet",
  activities: "activities",
  aimCard: "aim-card",
  weekQuests: "week-quests",
  aimLine: "aim-line",
  empty: "roadmap-empty",
  drafting: "roadmap-drafting",
  doneHeader: "roadmap-done-header",
  done: "roadmap-done",
  legacy: "roadmap-legacy",
} as const;
export type WordBlock = (typeof WORD_BLOCK)[keyof typeof WORD_BLOCK];

/** One §3.2 row: a fixture, the surface it renders on, the blocks summed (or each alone), the budget, and the fold's. */
export interface WordBudgetRow {
  id: string;
  /** §3.2's row number (1 intake … 12 Roadmap tab). */
  row: number;
  fixture: FixtureState;
  /** /dev/style/roadmap draws the page (or the intake form), the Aim card and Today's week quests card. */
  surface: "page" | "intake" | "aim" | "today";
  blocks: readonly WordBlock[];
  /** Each block alone ≤ budget (outline nodes); otherwise the blocks are summed. */
  each?: boolean;
  budget: number;
  /** The fold's budget: the data-wc-fold elements of the surface. */
  fold?: number;
  /** At most this many app words on one line (row 10). */
  perLine?: number;
}

const B = WORD_BLOCK;
export const WORD_BUDGET_ROWS: readonly WordBudgetRow[] = [
  { id: "s1-intake-blank", row: 1, fixture: "intake", surface: "intake", blocks: [B.intake], budget: 90, fold: 25 },
  { id: "s1-intake-gemini", row: 1, fixture: "intake-gemini", surface: "intake", blocks: [B.intake], budget: 105, fold: 25 },
  { id: "s1-intake-empty-library", row: 1, fixture: "intake-empty-library", surface: "intake", blocks: [B.intake], budget: 110, fold: 25 },
  { id: "s1-intake-body", row: 1, fixture: "intake-confirm", surface: "intake", blocks: [B.intake], budget: 130, fold: 25 },
  { id: "s1-intake-depth", row: 1, fixture: "intake-depth", surface: "intake", blocks: [B.intake], budget: 150, fold: 25 },
  { id: "s2-draft-header-v4", row: 2, fixture: "draft-v4", surface: "page", blocks: [B.draftHeader, B.draftDate], budget: 90, fold: 25 },
  { id: "s2-draft-header-count-gate", row: 2, fixture: "count-gate", surface: "page", blocks: [B.draftHeader, B.draftDate], budget: 70, fold: 25 },
  { id: "s2-draft-header-mixed", row: 2, fixture: "draft-mixed", surface: "page", blocks: [B.draftHeader, B.draftDate], budget: 40, fold: 25 },
  { id: "s3-next-card-v4", row: 3, fixture: "draft-v4", surface: "page", blocks: [B.nextCard], budget: 120 },
  { id: "s3-next-card-mixed", row: 3, fixture: "draft-mixed", surface: "page", blocks: [B.nextCard], budget: 160 },
  { id: "s3-outline-node-v4", row: 3, fixture: "draft-v4", surface: "page", blocks: [B.outlineNode], each: true, budget: 12 },
  { id: "s4-aim-header-active", row: 4, fixture: "active", surface: "page", blocks: [B.aimHeader], budget: 25 },
  { id: "s4-aim-header-behind", row: 4, fixture: "behind", surface: "page", blocks: [B.aimHeader, B.aimNotes], budget: 45 },
  { id: "s4-aim-header-depth", row: 4, fixture: "depth-realistic", surface: "page", blocks: [B.aimHeader], budget: 35 },
  { id: "s5-now-active", row: 5, fixture: "active", surface: "page", blocks: [B.now], budget: 120 },
  { id: "s5-now-behind", row: 5, fixture: "behind", surface: "page", blocks: [B.now], budget: 135 },
  { id: "s5-now-depth", row: 5, fixture: "depth-realistic", surface: "page", blocks: [B.now], budget: 115 },
  { id: "s6-milestones-active", row: 6, fixture: "active", surface: "page", blocks: [B.milestones, B.toward, B.footer], budget: 60 },
  { id: "s6-milestones-depth", row: 6, fixture: "depth-realistic", surface: "page", blocks: [B.milestones, B.toward, B.footer], budget: 75 },
  { id: "s7-start-refit", row: 7, fixture: "start-refit", surface: "page", blocks: [B.startSheet], budget: 70 },
  { id: "s7-start-exam-waypoint", row: 7, fixture: "exam-waypoint", surface: "page", blocks: [B.startSheet], budget: 50 },
  { id: "s7-start-body-active-confirm", row: 7, fixture: "active-confirm", surface: "page", blocks: [B.startSheet], budget: 70 },
  { id: "s8-activities-draft-confirm", row: 8, fixture: "draft-confirm", surface: "page", blocks: [B.activities], budget: 45 },
  { id: "s8-activities-active-asking", row: 8, fixture: "active-confirm", surface: "page", blocks: [B.activities], budget: 55 },
  { id: "s8-activities-intake", row: 8, fixture: "intake-confirm", surface: "intake", blocks: [B.activities], budget: 50 },
  { id: "s8-activities-answered", row: 8, fixture: "active-answered", surface: "page", blocks: [B.activities], budget: 25 },
  ...(["active", "accepted", "behind", "empty", "done", "draft-mixed", "running", "reach-pending", "closed-unreached-aim", "writes-off"] as const).map(
    (fixture): WordBudgetRow => ({ id: `s9-aim-card-${fixture}`, row: 9, fixture, surface: "aim", blocks: [B.aimCard], budget: 14 })
  ),
  { id: "s10-week-quests-active", row: 10, fixture: "active", surface: "today", blocks: [B.weekQuests], budget: 30, perLine: 8 },
  { id: "s10-week-quests-behind", row: 10, fixture: "behind", surface: "today", blocks: [B.weekQuests], budget: 34, perLine: 8 },
  { id: "s10-week-quests-body", row: 10, fixture: "body-practice", surface: "today", blocks: [B.weekQuests], budget: 30, perLine: 8 },
  { id: "s12-tab-empty", row: 12, fixture: "empty", surface: "page", blocks: [B.empty], budget: 8 },
  { id: "s12-tab-drafting", row: 12, fixture: "running", surface: "page", blocks: [B.drafting], budget: 12 },
  { id: "s12-tab-done-header", row: 12, fixture: "done", surface: "page", blocks: [B.doneHeader], budget: 25 },
  { id: "s12-tab-done-page", row: 12, fixture: "done", surface: "page", blocks: [B.done], budget: 90 },
  { id: "s12-tab-legacy", row: 12, fixture: "legacy", surface: "page", blocks: [B.legacy], budget: 20 },
];
// Row 11 (Today's aim line, every state ≤ 8) is /dev/style/today's: AimLine over AIM_LINE_FIXTURES (R1's block), and its
// words are roadmap-copy aimLineShort's, which roadmap-ui-check holds to 8 for every fixture state.

export function roadmapFixture(state: FixtureState): RoadmapFixture {
  const fx = fixtureOf(state);
  if (!fx.view) return fx;
  const view = measuredOnToday(fx.view);
  const aim = fx.aim ? { ...fx.aim, measuredAt: fx.aim.measuredAt ? measuredAtOn(view.today) : null, proficiency: fx.aim.proficiency ? view.proficiency : null } : null;
  return { ...fx, view, aim };
}

/** An ACTIVE roadmap's pending re-plan (version 2 of milestones 3–6, re-fitted by the app): reviewed above Now. */
function replanDraft(): DraftView {
  const copy = (ord: number, title: string, ws: string, due: string, items: ItemDraft[], level: number, target: number, now: number, titleDecision: MilestoneDraft["titleDecision"] = "PENDING"): MilestoneDraft =>
    milestone({ ord, title, titleDecision, id: `m${ord}v2`, lineageId: `ml${ord}`, version: 2, windowStart: ws, dueDay: due, items, measures: [cardsMeasure(`mr${ord}`, ["d-bt", "d-qs"], level, target, now)] });
  const ms = [
    copy(3, "Forward-testing on a demo account", "2027-03-15", "2027-05-23", [
      item({ kind: "DOMAIN", label: "Algorithmic Backtesting", domainId: "d-bt", decision: "CHECKED" }),
      item({ kind: "DOMAIN", label: "Quantitative System Dev", domainId: "d-qs", decision: "KEPT" }),
      item({ kind: "TOPIC", label: "Demo-account execution checks", domainId: "d-bt" }),
      item({ kind: "PRACTICE", label: "Code the rules in MetaTrader", method: "PROJECT_WORK", sessionsPerWeek: 2, durationBand: "D45", rule: "TARGET:2/W", planSource: "WORKED_OUT", flags: ["PROPER_NOUN"] }),
      item({ kind: "STEP", label: "Open a demo account with your broker" }),
    ], 8, 34, 7, "KEPT"),
    copy(4, "Execution and costs", "2027-05-24", "2027-08-08", [], 10, 12, 2),
    copy(5, "Live trading at small size", "2027-08-09", "2027-10-24", [], 10, 17, 4),
    copy(6, "Consistency review", "2027-10-25", "2027-12-31", [], 10, 46, 6),
  ];
  return {
    version: 2,
    milestones: ms,
    feasibility: {
      today: TODAY,
      m: 1,
      milestones: ms.map((m) => mfOf(m, [knowledge(m.measures[0].measureKey!, m.measures[0].minLevel ?? 8, "FITTED", m.measures[0].target, m.measures[0].baseline ?? 0, m.measures[0].target + 4, m.measures[0].target + 20, m.measures[0].target + 30)])),
      aimCheck: { kind: "unchecked" },
      basis: [],
      remedies: [],
      impossible: false,
      over: false,
    },
    bulkKeepOff: false,
    credential: false,
    nonEnglish: false,
    alarm: false,
    uncoveredSyllabus: [],
    nextLineageId: "ml3",
    acceptable: false,
    nextToDecide: ms[0].items[2].id,
  };
}

function fixtureOf(state: FixtureState): RoadmapFixture {
  seq = 0;
  if (isRev4State(state)) return rev4FixtureOf(state);
  if (isMotionNewState(state)) return motionFixtureOf(state);
  switch (state) {
    case "active-replan": {
      const base = activeView();
      const draft = replanDraft();
      const v: RoadmapView = {
        ...base,
        draft,
        run: { id: "r2", kind: "INHOUSE", status: "OK", startedAt: "2027-01-27T22:30:00.000Z", finishedAt: "2027-01-27T22:30:01.000Z", model: null, modelVersion: null, promptVersion: null, drafts: 0, stale: false, usualSeconds: null, error: null, report: null, wrote: "INHOUSE", capped: false },
        history: [...base.history],
      };
      return {
        view: v,
        intake: null,
        aim: { ...aimFromView(v, "ACTIVE"), draftItems: undecidedOf(draft.milestones[0]).length },
        today: v.weekQuests,
        startPreview: null,
        note: "An ACTIVE roadmap with a pending re-plan: the draft is reviewed above Now, with its own Accept and Discard.",
      };
    }
    case "draft-live": {
      const v = liveShaped(draftView(false));
      return {
        view: v,
        intake: null,
        aim: liveShapedAim({ ...aimFromView(v, "DRAFT"), draftItems: undecidedOf(v.draft!.milestones[0]).length, rank: null, proficiency: null, milestone: null }),
        today: null,
        startPreview: null,
        note: "Live-shaped: the draft as R4's view builder returns it without the fields derived on read (no library, no struck spans, no title flags, no accepted run or positions).",
      };
    }
    case "empty":
      return { view: EMPTY_VIEW(true), intake: null, aim: EMPTY_AIM(true), today: null, startPreview: null, note: "No roadmap yet: the Roadmap tab's card and the Aim card's compact line." };
    case "no-key":
      return { view: EMPTY_VIEW(false), intake: intakeFixture(false), aim: EMPTY_AIM(false), today: null, startPreview: null, note: "No Gemini key: Build from my numbers is primary, Write it myself beside it, never a disabled button." };
    case "intake":
      return { view: null, intake: intakeFixture(true), aim: null, today: null, startPreview: null, note: "The intake with a key on the free tier: the privacy line and the free-tier line sit under Advanced." };
    case "running": {
      const v = draftView(false);
      return {
        view: { ...v, state: "RUNNING", draft: null, run: { ...v.run!, status: "RUNNING", finishedAt: null, startedAt: new Date(Date.UTC(2026, 9, 3, 22, 12, 4)).toISOString(), usualSeconds: 18, report: null, stale: false } },
        intake: null,
        aim: { ...aimFromView(v, "RUNNING"), rank: null, proficiency: null, milestone: null },
        today: null,
        startPreview: null,
        note: "Drafting: static text in an aria-live region, no spinner; the page refreshes from the database for at most 75 s.",
      };
    }
    case "draft-mixed": {
      const v = draftView(false);
      return {
        view: v,
        intake: null,
        aim: { ...aimFromView(v, "DRAFT"), draftItems: undecidedOf(v.draft!.milestones[0]).length, rank: null, proficiency: null, milestone: null },
        today: null,
        startPreview: null,
        note: "Every flag kind, KEPT and DRAFT chips, outline milestones, a NUMBER title (milestone 3).",
      };
    }
    case "draft-credential": {
      const v = draftView(true);
      return { view: v, intake: null, aim: null, today: null, startPreview: null, note: "A credential aim with no syllabus: no bulk keep, the syllabus line, the alarm." };
    }
    case "accepted": {
      const base = activeView();
      const m1 = M1();
      const v: RoadmapView = {
        ...base,
        today: "2026-10-04",
        goalsLive: false,
        throughput: CALIBRATING_TP,
        rank: rank(0),
        proficiency: proficiency(0.31, { cards: 0.52, practice: 0, milestones: 0 }, 0, 6, {}, "2026-10-04"),
        current: { milestone: m1, measures: [], headline: null, goalId: null, starting: false, stated: 6, zeroReason: null, checkpointLog: null, pastDue: false },
        milestones: rowsActive().map((r) => ({ ...r, state: r.ord === 1 ? ("PLANNED" as const) : ("OUTLINE" as const), percent: null, reachedDay: null })),
        weekQuests: null,
        pastWeeks: [],
        toward: { ...base.toward!, reached: 0 },
      };
      return { view: v, intake: null, aim: aimFromView(v, "ACCEPTED"), today: null, startPreview: null, note: "Accepted, not started: Start is hidden while the goal seams are off." };
    }
    case "active": {
      const v = activeView();
      return { view: v, intake: null, aim: aimFromView(v, "ACTIVE"), today: v.weekQuests, startPreview: null, note: "On pace, with week quests and past weeks." };
    }
    case "behind": {
      const base = activeView();
      const behindLine = "Behind on new cards for Milestone 2: this week asks 5 of the 7 needed to stay on plan, and writing that can still reach level 6 by 7 Mar ends Wed 10 Feb.";
      const wq = weekQuestsFixture({ weekStart: "2027-02-01", weekEnd: "2027-02-07", cappedBy: "CATCHUP", notes: [behindLine] }, [
        weekRow({ ord: 1, kind: "RAISE", label: "Bring 3 cards in Risk Management or Position Sizing to level 6+", count: 3, unit: "card", figure: fig(0, "tested by your reviews · measured 09:12"), dueLine: "4 can reach level 6 this week if passed when due" }),
        weekRow({ ord: 2, kind: "ADD", label: "Add 5 cards to Risk Management or Position Sizing", count: 5, unit: "card", figure: fig(1, "counted by the app; it doesn't judge them", "RECORDED"), quotaLine: "counts toward Trading's weekly quota too", href: "/add?field=f-tr&domain=d-rm" }),
        weekRow({ ord: 3, kind: "PRACTICE", label: "Backtest · 3 sessions × 45 min", count: 3, unit: "session", figure: fig(0, "from your ticks", "SELF"), seekTemplateId: "t-bt", place: "in Habits" }),
        weekRow({ ord: 4, kind: "CHECKPOINT", label: "Checkpoint: Size historical trades by hand · log your score", count: 1, unit: "log", figure: fig(0, "you log it · doesn't move your progress", "SELF"), href: "/you/roadmap#checkpoint" }),
      ]);
      const v: RoadmapView = {
        ...base,
        today: "2027-02-04",
        weekQuests: wq,
        triggers: [
          { trigger: "QUESTS_BEHIND", milestoneOrd: 2, line: behindLine },
          { trigger: "SLIPPED", milestoneOrd: 2, line: "Milestone 2's cards slipped below where they started: 3 came back down a level this week." },
        ],
        current: { ...base.current!, headline: fig(0.19, "tested by your reviews"), measures: [cardsRow({ figure: fig(25, "tested by your reviews"), gained: 4, pace: { kind: "behind", day: "2027-03-07", daysLate: 21, expectedByDue: 36, target: 42, bestCase: false } })] },
        header: header({ targetLowered: { measureKey: "CARDS_AT_LEVEL|d:d-bt,d-mp,d-qs,d-rm|L10", on: "2027-01-26", from: 46, to: 38 }, version: 2, acceptedDay: "2027-01-26" }),
        proficiency: proficiency(0.4652, { cards: 0.63, practice: 0.23, milestones: 1 / 6 }, 1, 6, {
          change: { kind: "rebased", rebase: { on: "2027-01-26", from: 0.41, cause: "REPLAN", detail: "the re-plan lowered the end target 46 → 38" } },
          basisKey: FIXTURE_BASIS.v2,
        }),
        history: [
          { version: 1, day: "2026-10-04", undone: false, changes: [] },
          { version: 2, day: "2027-01-26", undone: false, changes: ["end target 46 → 38", "due unchanged"] },
        ],
      };
      return { view: v, intake: null, aim: { ...aimFromView(v, "ACTIVE"), targetLowered: v.header!.targetLowered }, today: wq, startPreview: null, note: "QUESTS_BEHIND with its levers, a slipped trigger, a lowered target and Proficiency changed by a re-plan." };
    }
    case "past-due": {
      const base = activeView();
      const v: RoadmapView = { ...base, today: "2027-03-11", weekQuests: { ...weekQuestsFixture(), state: "PAST_DUE", rows: [], done: 0, total: 0 }, current: { ...base.current!, pastDue: true }, pastWeeks: [{ weekStart: "2027-03-01", milestoneOrd: 2, settled: false, done: 0, total: 0, capped: false, heldDays: 0 }, ...base.pastWeeks.slice(0, 2)] };
      return { view: v, intake: null, aim: aimFromView(v, "PAST_DUE"), today: null, startPreview: null, note: "Past due: no week quests, close or reschedule, never red." };
    }
    case "start-refit": {
      const base = activeView();
      const m2 = { ...M2(), status: "PLANNED" as const, titleDecision: "KEPT" as const };
      m2.items[0] = { ...m2.items[0], decision: "KEPT" };
      const v: RoadmapView = {
        ...base,
        today: "2026-12-21",
        current: { milestone: m2, measures: [], headline: null, goalId: null, starting: false, stated: 6, zeroReason: null, checkpointLog: null, pastDue: false },
        weekQuests: null,
        pastWeeks: [],
        milestones: rowsActive().map((r) => (r.ord === 2 ? { ...r, state: "PLANNED" as const, percent: null } : r)),
      };
      return { view: v, intake: null, aim: aimFromView(v, "ACTIVE"), today: null, startPreview: startPreviewFixture(m2), note: "The Start sheet: today's check, Today-bound rows to check, practices, pay (recomputed on every switch) and the week's preview. Between milestones the Aim card stays ACTIVE." };
    }
    case "body-practice": {
      const v = bodyView();
      return { view: v, intake: null, aim: aimFromView(v, "ACTIVE"), today: v.weekQuests, startPreview: null, note: "A life-track Area: sessions only, the health line, weight as context." };
    }
    case "done": {
      const v = bodyView();
      const done: RoadmapView = {
        ...v,
        state: "DONE",
        today: "2027-04-19",
        header: { ...v.header!, status: "DONE", reachedDay: "2027-04-18", doneDay: "2027-04-19" },
        rank: rank(3, 3, { next: { kind: "top" } }),
        proficiency: proficiency(0.9063, { cards: null, practice: 0.85, milestones: 1 }, 3, 3, {}, "2027-04-19"),
        current: null,
        weekQuests: null,
        milestones: v.milestones.map((r) => ({ ...r, state: "REACHED" as const, percent: 100, reachedDay: r.dueDay })),
      };
      return { view: done, intake: null, aim: aimFromView(done, "DONE"), today: null, startPreview: null, note: "Done: the final Aim rank and the last Proficiency, read-only." };
    }
  }
}

// ═══ Revision 4 (roadmap-rev4.md): the spec's pack, aimed at a depth ═════════
//
// One plan, the mockups': Statistics, with Probability (48 cards, 6 of them
// multiple choice: 42 recall cards; n 34) and Inference (9 cards; n 25), at
// Mastered (level 12), Exam P on Tue 4 May 2027, accepted Mon 5 Oct 2026 at
// Steady. Stage days are lane M's (computed with lane 0's reach model):
// Familiar part 1 Sun 22 Nov 2026, Familiar 27 Dec, Retained 14 Feb 2027,
// Fluent 16 May, Toward Mastered 1 Aug, Mastered Sun 12 Mar 2028. Ranks
// [2, 2, 3, 4, 4, 5]. Every title, practice, step and checkpoint is code's
// (catalog templates) or the user's (outline lines); nothing here is a
// Gemini word.

const PACK_AIM = "Know probability and inference well enough to pass Exam P and use them at work";
const PACK_TODAY = "2027-01-07";
const PACK_ACCEPTED = "2026-10-05";
const EXAM_DAY = "2027-05-04";
const PACK_DOMAINS = ["d-pr", "d-in"];

const PACK_LIB: LibraryDomain[] = [
  { id: "d-pr", name: "Probability", fieldId: "f-st", fieldName: "Statistics", cards: 48, atSix: 18, atTop: 2, level: 6, sample: ["Bayes' rule for two events", "Variance of a sum", "The law of total expectation"] },
  { id: "d-in", name: "Inference", fieldId: "f-st", fieldName: "Statistics", cards: 9, atSix: 0, atTop: 0, level: 2 },
  { id: "d-ca", name: "Calculus", fieldId: "f-st", fieldName: "Statistics", cards: 20, atSix: 7, atTop: 1, level: 4 },
  { id: "d-la", name: "Linear Algebra", fieldId: "f-st", fieldName: "Statistics", cards: 5, atSix: 1, atTop: 0, level: 1 },
  { id: "d-rk", name: "Risk Management", fieldId: "f-st", fieldName: "Statistics", cards: 14, atSix: 3, atTop: 0, level: 2 },
];

/** Multiple-choice cards per Domain (IntakeFieldOption.domains[].nonRecall): Probability's 48 hold 6, so 42 count. */
const PACK_NON_RECALL: Readonly<Record<string, number>> = { "d-pr": 6 };

const OUTLINE = ["General probability", "Univariate random variables", "Multivariate random variables", "Conditional expectation and variance", "Common discrete distributions", "Common continuous distributions"];

const STAGES: { ord: number; stage: StageKey; level: number; title: string; ws: string; due: string; rank: number }[] = [
  { ord: 1, stage: "PART", level: 6, title: "Familiar, part 1: Probability, Inference to level 6+", ws: "2026-10-05", due: "2026-11-22", rank: 2 },
  { ord: 2, stage: "FAMILIAR", level: 6, title: "Familiar: Probability, Inference to level 6+", ws: "2026-11-23", due: "2026-12-27", rank: 2 },
  { ord: 3, stage: "RETAINED", level: 8, title: "Retained: Probability, Inference to level 8+", ws: "2026-12-28", due: "2027-02-14", rank: 3 },
  { ord: 4, stage: "FLUENT", level: 10, title: "Fluent: Probability, Inference to level 10+", ws: "2027-02-15", due: "2027-05-16", rank: 4 },
  { ord: 5, stage: "BETWEEN", level: 11, title: "Toward Mastered: Probability, Inference to level 11+", ws: "2027-05-17", due: "2027-08-01", rank: 4 },
  { ord: 6, stage: "MASTERED", level: 12, title: "Mastered: Probability, Inference to level 12+", ws: "2027-08-02", due: "2028-03-12", rank: 5 },
];

/** One card measure per Domain (F-R4-9): `r` at a stage gate, `rc` (clean entry) at the depth. */
function depthMeasure(id: string, domainId: string, level: number, target: number, baseline: number | null, depth = 12): MeasureSpec {
  return {
    ...cardsMeasure(id, [domainId], level, target, baseline),
    targetSource: level === depth ? "DEPTH" : "WORKED_OUT",
    fittedTarget: null,
    measureKey: cardsAtLevelKey([domainId], level, level === depth ? "rc" : "r"),
  };
}

/** A code-worded type from the catalog (origin CODE): Gemini's pick, the app's addition, or the user's choice. */
function catalogItem(kind: "PRACTICE" | "STEP" | "CHECKPOINT", key: CatalogKey, label: string, p: Partial<ItemDraft> = {}): ItemDraft {
  return item({ kind, label, origin: APP, decision: "PENDING", catalogKey: key, ...p });
}

function packStage(s: (typeof STAGES)[number], p: Partial<MilestoneDraft> = {}, counts: [number, number] = [34, 25], baselines: [number | null, number | null] = [null, null]): MilestoneDraft {
  return milestone({
    ord: s.ord,
    title: s.title,
    titleOrigin: APP,
    titleDecision: "PENDING",
    windowStart: s.ws,
    dueDay: s.due,
    status: "PLANNED",
    rankIndex: s.rank,
    stage: s.stage,
    measures: [depthMeasure(`ms${s.ord}p`, "d-pr", s.level, counts[0], baselines[0]), depthMeasure(`ms${s.ord}i`, "d-in", s.level, counts[1], baselines[1])],
    ...p,
  });
}

function packCoverage(p: Partial<Record<"d-pr" | "d-in", Partial<CoverageBreakdown>>> = {}): CoverageBreakdown[] {
  return [
    { domainId: "d-pr", name: "Probability", live: 42, nonRecall: 6, linesTied: 2, linesShared: 1, floor: 25, share: 34, outline: 9, policy: 34, typed: null, n: 34, belowPolicy: false, ...p["d-pr"] },
    { domainId: "d-in", name: "Inference", live: 9, nonRecall: 0, linesTied: 3, linesShared: 1, floor: 25, share: 8, outline: 12, policy: 25, typed: null, n: 25, belowPolicy: false, ...p["d-in"] },
  ];
}

function packDepth(p: Partial<DepthView> = {}): DepthView {
  return { depth: 12, coverage: packCoverage(), coverageChoices: [], depthChoice: null, domainOrigins: {}, outlineChecked: true, exam: { day: EXAM_DAY, reachLevel: 8 }, ...p };
}

const REALISTIC_BASIS = [
  "At 70% of your usual 3 new cards a week, your 80% pass rate (reads high), 80% for gaps of 50 days and more (the app's policy) and the 92% of your due queue you clear, this depth is realistic by Sun 12 Mar 2028. Earliest if every review passes, at this pace: Sat 30 Oct 2027.",
  "By your exam (Tue 4 May 2027) the plan reaches Retained (level 8). The depth goes on past it.",
  "This date is set by the review schedule, not your hours: a new card needs at least 340 days to reach level 12. More hours won't bring it much closer.",
];

function packDateCheck(p: Partial<DateCheck> = {}): DateCheck {
  return {
    D_real: "2028-03-12",
    D_full: "2028-01-30",
    D_best_pace: "2027-10-30",
    D_best_2x: "2027-09-05",
    D_floor: "2027-09-12",
    verdict: "FITS",
    rateAsked: 2.1,
    reachByUserDate: null,
    reachByExam: 8,
    scheduleBound: true,
    dateOrigin: { origin: "REALISTIC", calibrating: [] },
    basis: REALISTIC_BASIS,
    ...p,
  };
}

function packHeader(p: Partial<RoadmapHeader> = {}): RoadmapHeader {
  return header({
    id: "rm4",
    aim: PACK_AIM,
    area: { kind: "FIELD", fieldId: "f-st", name: "Statistics", level: 9 },
    startDay: PACK_ACCEPTED,
    targetDay: "2028-03-12",
    acceptedDay: PACK_ACCEPTED,
    firstAcceptedDay: PACK_ACCEPTED,
    hoursPerWeek: 6,
    track: "CRAFT",
    credential: true,
    hasSyllabus: true,
    constraints: "Evenings only.",
    examLabel: "Exam P",
    examDay: EXAM_DAY,
    depth: 12,
    dateMode: "CHOSEN",
    dateOrigin: { origin: "REALISTIC", calibrating: [] },
    legacy: false,
    ...p,
  });
}

/** Proficiency labelled with its basis (R1's ProficiencyViewR1: toward and label). */
function packProficiency(value: number, parts: ProficiencyView["parts"], reached: number, p: Partial<ProficiencyView & ProficiencyBasisField> = {}, today = PACK_TODAY, toward: { level: number; name: string } = { level: 12, name: "Mastered" }, scheduled = 6): ProficiencyView & ProficiencyBasisField {
  return Object.assign(proficiency(value, parts, reached, scheduled, p, today), { toward, label: `Proficiency toward ${toward.name} (level ${toward.level})` });
}

/** The pack's ladder: Aspirant skipped (Foundation merged into Familiar), the rest by stage. */
function packRank(given: number, p: Partial<AimRankView> = {}): AimRankView {
  const rows: AimRankView["ladder"] = [
    { index: 0, name: AIM_RANKS[0], milestoneOrd: null, state: "given" },
    { index: 2, name: AIM_RANKS[2], milestoneOrd: 1, state: given >= 2 ? "given" : "next" },
    { index: 3, name: AIM_RANKS[3], milestoneOrd: 3, state: given >= 3 ? "given" : given === 2 ? "next" : "later" },
    { index: 4, name: AIM_RANKS[4], milestoneOrd: 4, state: given >= 4 ? "given" : given === 3 ? "next" : "later" },
    { index: 5, name: AIM_RANKS[5], milestoneOrd: 6, state: given >= 5 ? "given" : given === 4 ? "next" : "later" },
    { index: 6, name: AIM_RANKS[6], milestoneOrd: null, state: given >= 6 ? "given" : "later" },
  ];
  const nextRow = rows.find((r) => r.state === "next" && r.milestoneOrd != null);
  return {
    index: given,
    name: AIM_RANKS[given],
    newSince: null,
    next: nextRow ? { kind: "milestone", index: nextRow.index, name: nextRow.name, milestoneOrd: nextRow.milestoneOrd as number } : { kind: "paragon" },
    top: { index: 6, name: AIM_RANKS[6], withAim: true },
    pending: null,
    ladder: rows,
    ...p,
  };
}

function packRows(states: Partial<Record<number, MilestoneRowView["state"]>>, p: Partial<Record<number, Partial<MilestoneRowView>>> = {}): MilestoneRowView[] {
  return STAGES.map((s) => ({
    id: `m${s.ord}`,
    lineageId: `ml${s.ord}`,
    ord: s.ord,
    title: s.title,
    titleClass: "WORKED_OUT" as const,
    state: states[s.ord] ?? "PLANNED",
    windowStart: s.ws,
    dueDay: s.due,
    percent: null,
    rankIndex: s.rank,
    gaveRank: null,
    reachedDay: null,
    countsFrom: null,
    closedPercent: null,
    stage: s.stage,
    gateLevel: s.level,
    held: false,
    ...p[s.ord],
  }));
}

/** Milestone 3 (Retained) as started: the user's outline lines, the app's and Gemini's practice types, the mock test before the exam. */
function packM3(started = true): MilestoneDraft {
  return packStage(
    STAGES[2],
    {
      status: started ? "STARTED" : "PLANNED",
      items: [
        item({ kind: "DOMAIN", label: "Probability", domainId: "d-pr", origin: "USER", decision: "EDITED" }),
        item({ kind: "DOMAIN", label: "Inference", domainId: "d-in", origin: "USER", decision: "EDITED" }),
        item({ kind: "TOPIC", label: OUTLINE[3], domainId: "d-in", origin: "SYLLABUS", decision: "PENDING", syllabusRef: 3 }),
        item({ kind: "TOPIC", label: OUTLINE[4], domainId: null, origin: "SYLLABUS", decision: "PENDING", syllabusRef: 4 }),
        catalogItem("PRACTICE", "PROBLEM_SETS", "Problem sets: Probability, Inference", { method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W", planSource: "WORKED_OUT", notes: ["GEMINI_PICK"], templateId: started ? "t-ps" : null, lineageId: "lp-ps" }),
        catalogItem("PRACTICE", "TIMED_PRACTICE", "Timed practice: Probability, Inference", { method: "DELIBERATE_PRACTICE", sessionsPerWeek: 1, durationBand: "D45", rule: "TARGET:1/W", planSource: "WORKED_OUT", notes: ["PRODUCTION_ADDED"], templateId: started ? "t-tp" : null, lineageId: "lp-tp" }),
        catalogItem("CHECKPOINT", "MOCK_TEST", "Mock test: Exam P", { checkpointKind: "MOCK_TEST", bar: 6, outOf: 10, lineageId: "lc-mt" }),
      ],
      measures: [depthMeasure("ms3p", "d-pr", 8, 34, 14), depthMeasure("ms3i", "d-in", 8, 25, 2), practiceMeasure("ms3k", 12)],
    },
    [34, 25],
    [14, 2]
  );
}

function packFeasibility(today = PACK_TODAY): Feasibility {
  return {
    today,
    m: 1,
    milestones: STAGES.map((s) => mfOf(packStage(s), [knowledge(cardsAtLevelKey(["d-pr"], s.level, s.level === 12 ? "rc" : "r"), s.level, "FITS", 34, 14, 36, 41, 46), knowledge(cardsAtLevelKey(["d-in"], s.level, s.level === 12 ? "rc" : "r"), s.level, "FITS", 25, 2, 26, 31, 38)])),
    aimCheck: { kind: "unchecked" },
    basis: [],
    remedies: [],
    impossible: false,
    over: false,
    dateCheck: packDateCheck(),
  };
}

function packRow(measureKey: string, label: string, target: number, baseline: number, value: number, p: Partial<MeasureRowView> = {}): MeasureRowView {
  return cardsRow({ measureKey, label, target, baseline, figure: fig(value, "tested by your reviews"), gained: Math.max(0, value - baseline), needed: target - baseline, alreadyCounted: baseline, pace: { kind: "on-pace", day: "2027-02-14", pipeline: 9, bestCase: false }, ...p });
}

function packWeekQuests(today = true): WeekQuestsView {
  const parts = (line: string) => ({ partsLine: line });
  const rows: WeekQuestRow[] = [
    Object.assign(weekRow({ ord: 1, kind: "RAISE", label: "Bring 6 cards to level 8+", count: 6, unit: "card", figure: fig(2, "tested by your reviews · measured 09:12"), dueLine: "Probability: 2 come due Fri, 1 Sat · Inference: 1 Fri, 2 Sun", href: "/you/roadmap#now" }), parts("3 in Probability · 3 in Inference")),
    Object.assign(weekRow({ ord: 2, kind: "ADD", label: "Add 2 cards", count: 2, unit: "card", figure: fig(1, "counted by the app; it doesn't judge them", "RECORDED"), href: "/add?field=f-st&domain=d-in" }), parts("2 to Inference · multiple choice not counted")),
    weekRow({ ord: 3, kind: "PRACTICE", label: "Problem sets: Probability, Inference · 2 sessions × 30 min", count: 2, unit: "session", figure: fig(1, "from your ticks", "SELF"), seekTemplateId: "t-ps", place: "in Habits", href: "/today#t-t-ps" }),
  ];
  return weekQuestsFixture(
    {
      milestoneId: "m3",
      milestoneOrd: 3,
      milestoneOf: 6,
      milestoneTitle: STAGES[2].title,
      weekStart: "2027-01-04",
      weekEnd: "2027-01-10",
      level: 8,
      basis: today ? ["Parts by Domain: each Domain's gap and the cards that can reach level 8 this week if passed on their day, at your 80% pass rate."] : [],
    },
    rows
  );
}

/** The pack as accepted and started at Retained (milestone 3), as of Thu 7 Jan 2027. */
function packActiveView(p: Partial<RoadmapView> = {}): RoadmapView {
  const m3 = packM3(true);
  const run: RunView = { ...acceptedGeminiRun(), promptVersion: 3, report: { dropped: [], flagged: [], notes: [], integrity: { verdict: "CLEAN", violations: [], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} } } };
  return activeView({
    today: PACK_TODAY,
    header: packHeader(),
    run,
    acceptedRun: run,
    positions: 6,
    library: PACK_LIB,
    rank: packRank(2),
    proficiency: packProficiency(0.3423, { cards: 0.168, practice: 0.765, milestones: 2 / 6 }, 2),
    toward: {
      measures: [
        packRow(cardsAtLevelKey(["d-pr"], 12, "rc"), "Probability · recall cards at level 12, each entered at the first try", 34, 2, 2, { pace: { kind: "on-pace", day: "2028-03-12", pipeline: 0, bestCase: false } }),
        packRow(cardsAtLevelKey(["d-in"], 12, "rc"), "Inference · recall cards at level 12, each entered at the first try", 25, 0, 0, { pace: { kind: "on-pace", day: "2028-03-12", pipeline: 0, bestCase: false } }),
      ],
      reached: 2,
      scheduled: 6,
      practiceKept: { share: 0.76, sessions: 21 },
      weightLine: null,
    },
    current: {
      milestone: m3,
      measures: [
        packRow(cardsAtLevelKey(["d-pr"], 8, "r"), "34 cards in Probability at level 8+", 34, 14, 18),
        packRow(cardsAtLevelKey(["d-in"], 8, "r"), "25 cards in Inference at level 8+", 25, 2, 6),
        { measureKey: "PRACTICE_KEPT|t:t-ps,t-tp|from:2026-12-28", kind: "PRACTICE_KEPT", role: "PAYS", target: 12, baseline: null, figure: fig(3, "from your ticks", "SELF"), gained: null, needed: null, alreadyCounted: null, pace: { kind: "on-pace" }, measuredAt: MEASURED_AT, basisClass: "SELF_REPORTED" },
      ],
      headline: fig(0.17, "tested by your reviews"),
      goalId: "g3",
      starting: false,
      stated: 6,
      zeroReason: null,
      checkpointLog: null,
      pastDue: false,
      practiceKept: { "lp-ps": { kept: 2, of: 3 }, "lp-tp": { kept: 1, of: 2 } },
    },
    milestones: packRows({ 1: "REACHED", 2: "REACHED", 3: "CURRENT" }, { 1: { reachedDay: "2026-11-20", percent: 100, gaveRank: "Journeyman" }, 2: { reachedDay: "2026-12-27", percent: 100 }, 3: { percent: 17 } }),
    weekQuests: packWeekQuests(),
    pastWeeks: [
      { weekStart: "2026-12-28", milestoneOrd: 3, settled: true, done: 2, total: 3, capped: false, heldDays: 0 },
      { weekStart: "2026-12-21", milestoneOrd: 2, settled: true, done: 3, total: 3, capped: false, heldDays: 0 },
    ],
    throughput: THROUGHPUT,
    feasibility: packFeasibility(),
    history: [{ version: 1, day: PACK_ACCEPTED, undone: false, changes: [] }],
    depth: packDepth(),
    dateCheck: packDateCheck(),
    paragonMissing: [],
    legacy: null,
    gaps: [],
    gapsHidden: 0,
    ...p,
  });
}

/** The Aim card of a depth plan: the date chip by depth, the stage on the milestone line. */
function packAim(v: RoadmapView, state: AimCardView["state"], p: Partial<AimCardView> = {}): AimCardView {
  const base = aimFromView(v, state);
  const cur = v.current;
  const stage = cur ? STAGES.find((s) => s.ord === cur.milestone.ord) : undefined;
  return {
    ...base,
    depth: 12,
    dateChip: { depth: 12, day: "2028-03-12", estimate: false },
    aimSuggestions: null,
    lastAim: null,
    legacy: false,
    milestone: base.milestone ? { ...base.milestone, stage: stage?.stage ?? null, gateLevel: stage?.level ?? null } : null,
    ...p,
  };
}

/**
 * A v3 reply's keys-only draft rows (Gemini chose every practice, step and
 * checkpoint type from the app's whole list): the PART stage decided now,
 * the rest an outline. The app's own starter and a v4 reply's rows are code's
 * progression (packProgressionMilestones, contracts §20).
 */
function packDraftMilestones(opts: { additions: string[]; exam: boolean }): MilestoneDraft[] {
  const adds = (ord: number) => opts.additions.map((id) => item({ kind: "DOMAIN", label: PACK_LIB.find((d) => d.id === id)!.name, domainId: id, origin: "GEMINI", decision: "PENDING", notes: ["NOT_CHOSEN"], id: `add-${id}-${ord}`, lineageId: `ladd-${id}-${ord}` }));
  const chosen = () => [item({ kind: "DOMAIN", label: "Probability", domainId: "d-pr", origin: "USER", decision: "EDITED" }), item({ kind: "DOMAIN", label: "Inference", domainId: "d-in", origin: "USER", decision: "EDITED" })];
  const line = (i: number, domainId: string | null) => item({ kind: "TOPIC", label: OUTLINE[i], domainId, origin: "SYLLABUS", decision: "PENDING", syllabusRef: i });
  // Who arranged the outline lines and types: Gemini's run says so.
  const arranged = { arrangedBy: "GEMINI" as const };
  const draft = (s: (typeof STAGES)[number], items: ItemDraft[], counts: [number, number] = [34, 25], baselines: [number | null, number | null] = [18, 0]): MilestoneDraft => ({
    ...packStage(s, { status: "DRAFT", version: 1, items: [...chosen(), ...adds(s.ord), ...items], ...arranged }, counts, baselines),
  });
  return [
    draft(
      STAGES[0],
      [
        line(0, "d-pr"),
        line(1, "d-pr"),
        catalogItem("PRACTICE", "RECALL_DRILLS", "Recall drills: Probability, Inference", { method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D20", rule: "TARGET:2/W", planSource: "WORKED_OUT", notes: ["GEMINI_PICK"] }),
        catalogItem("PRACTICE", "READ_AND_CARD", "Study Inference", { method: "READING", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W", planSource: "WORKED_OUT", domainId: "d-in", notes: ["GEMINI_PICK"] }),
        ...(opts.exam ? [catalogItem("STEP", "BOOK_EXAM", "Book Exam P")] : []),
        catalogItem("STEP", "CHOOSE_MATERIAL", "Choose your material for Probability, Inference", { notes: ["GEMINI_PICK"] }),
        catalogItem("CHECKPOINT", "SELF_TEST", "Self-test: Probability, Inference", { checkpointKind: "SELF_TEST", notes: ["GEMINI_PICK"] }),
      ],
      [33, 15]
    ),
    draft(STAGES[1], [line(2, "d-pr"), catalogItem("PRACTICE", "PROBLEM_SETS", "Problem sets: Probability, Inference", { method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W", notes: ["GEMINI_PICK"] })]),
    draft(STAGES[2], [line(3, "d-in"), line(4, null), catalogItem("PRACTICE", "EXPLAIN_IT", "Explain it in your own words: Probability, Inference", { method: "WRITING", sessionsPerWeek: 1, durationBand: "D30", rule: "TARGET:1/W", notes: ["PRODUCTION_ADDED"] })]),
    draft(STAGES[3], [catalogItem("PRACTICE", "EXPLAIN_IT", "Explain it in your own words: Probability, Inference", { method: "WRITING", sessionsPerWeek: 2, durationBand: "D45", rule: "TARGET:2/W", notes: ["GEMINI_PICK"] }), ...(opts.exam ? [catalogItem("CHECKPOINT", "EXAM_DAY", "Exam: Exam P", { checkpointKind: "EXAM_DAY", bar: 6, outOf: 10 })] : [])]),
    draft(STAGES[4], [catalogItem("PRACTICE", "MISTAKE_REVIEW", "Go over your mistakes: Probability, Inference", { method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D45", rule: "TARGET:2/W", notes: ["GEMINI_PICK"] })]),
    draft(STAGES[5], [catalogItem("PRACTICE", "MISTAKE_REVIEW", "Go over your mistakes: Probability, Inference", { method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D45", rule: "TARGET:2/W", notes: ["GEMINI_PICK"] }), catalogItem("STEP", "EXPLAIN_ONCE", "Explain Probability, Inference to someone without notes", { notes: ["GEMINI_PICK"] })]),
  ];
}

function packAdditions(blockedLinear = false): DomainAddition[] {
  return [
    { itemId: "add-d-ca-1", domainId: "d-ca", name: "Calculus", cards: 20, atSix: 7, n: 25, dateWith: "2028-03-26", blocked: null },
    { itemId: "add-d-la-1", domainId: "d-la", name: "Linear Algebra", cards: 5, atSix: 1, n: 25, dateWith: blockedLinear ? null : "2028-04-23", blocked: blockedLinear ? "PAST_SPAN" : null },
  ];
}

function v3Run(p: Partial<RunView> = {}): RunView {
  return {
    id: "r4",
    kind: "GEMINI",
    status: "OK",
    startedAt: "2026-10-04T22:12:00.000Z",
    finishedAt: "2026-10-04T22:12:09.400Z",
    model: "gemini-3.5-flash-lite",
    modelVersion: "gemini-3.5-flash-lite",
    promptVersion: 3,
    drafts: 1,
    stale: false,
    usualSeconds: null,
    error: null,
    wrote: "GEMINI",
    capped: false,
    report: { dropped: [], flagged: [], notes: [], integrity: { verdict: "CLEAN", violations: [], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} } },
    ...p,
  };
}

// ─── The practice progression (contracts §20): code's plan, Gemini's choices ───

/** A v4 reply's picks for the pack (one per stage, each among that stage's options) and its outline order (S-keys). */
const PACK_V4_PICKS: Readonly<Record<string, string>> = { FAMILIAR: "RECALL_DRILLS", RETAINED: "EXPLAIN_IT", FLUENT: "MISTAKE_REVIEW", MASTERED: "RUN_THROUGHS" };
const PACK_V4_ORDER = ["S1", "S2", "S4", "S3", "S5", "S6"];
/** The pack's aim without an exam (packDraftView's). */
const PACK_V4_AIM_NO_EXAM = "Use probability and inference fluently in my analytics work";
/** The Domain each outline line is tied to (the intake's line Domains): S5 and S6 to none. */
const PACK_LINE_DOMAIN: readonly (string | null)[] = ["d-pr", "d-pr", "d-pr", "d-in", null, null];

/**
 * The pack's draft as code's progression, built with the real pure
 * progression (roadmap-catalog progressionOf over the pack's stages, the exam
 * on the stage whose window holds its day): every practice, step and
 * checkpoint is the progression's, labelled by the catalog (progressionLabelOf:
 * a practice that takes turns with another says so),
 * sized by code's allocation (practiceSizeOf at the stage's floor) and noted
 * by progressionNotesOf. `gemini`: a v4 reply's draft, with its picks
 * (GEMINI_PICK on a pick only) and its outline order (outlineOrderOf);
 * otherwise the app's own starter, in the user's order. The lines are split
 * across the stages (outlineStagesOf); none is ever lost.
 */
export function packProgressionMilestones(opts: { exam: boolean; gemini: boolean; room?: number }): MilestoneDraft[] {
  const { exam, gemini } = opts;
  const input: ProgressionInput = {
    track: "FIELD",
    stages: STAGES.map((s) => ({ stage: s.stage, level: s.level })),
    practicesAllowed: true,
    exam,
    examStage: exam ? STAGES.findIndex((s) => s.ws <= EXAM_DAY && EXAM_DAY <= s.due) : null,
    picks: gemini ? PACK_V4_PICKS : null,
    ...(opts.room != null ? { maxPractices: opts.room } : {}),
  };
  const p = progressionOf(input);
  const fill = { track: "FIELD" as const, domains: [domainName({ id: "d-pr", name: "Probability" }), domainName({ id: "d-in", name: "Inference" })], aim: (exam ? PACK_AIM : PACK_V4_AIM_NO_EXAM) as YoursText, exam: "Exam P" as YoursText };
  const keymap = Object.fromEntries(OUTLINE.map((_, i) => [`S${i + 1}`, i]));
  const lines = outlineStagesOf(outlineOrderOf(gemini ? PACK_V4_ORDER : null, keymap, OUTLINE.length).order, STAGES.length);
  return STAGES.map((s, i) => {
    const st = p.stages[i];
    const floor = stageBandFloorOf(st.stage, st.level);
    const placed = [...st.practices, ...st.steps, ...(st.checkpoint ? [st.checkpoint] : [])].map((x) => {
      // A practice that takes turns with another says so in code's words (contracts §20.12).
      const label = progressionLabelOf(x, fill);
      const notes = progressionNotesOf(x);
      if (x.slot === "PRACTICE") {
        const size = practiceSizeOf(x.kind, 60, floor);
        return catalogItem("PRACTICE", x.kind, label, { method: catalogEntryOf(x.kind)?.method ?? null, sessionsPerWeek: size.sessionsPerWeek, durationBand: size.band, rule: size.rule, planSource: "WORKED_OUT", notes });
      }
      if (x.slot === "CHECKPOINT") return catalogItem("CHECKPOINT", x.kind, label, { checkpointKind: x.kind as CheckpointKind, notes });
      return catalogItem("STEP", x.kind, label, { notes });
    });
    const topics = lines[i].map((li) => item({ kind: "TOPIC", label: OUTLINE[li], domainId: PACK_LINE_DOMAIN[li], origin: "SYLLABUS", decision: "PENDING", syllabusRef: li }));
    const chosen = [item({ kind: "DOMAIN", label: "Probability", domainId: "d-pr", origin: "USER", decision: "EDITED" }), item({ kind: "DOMAIN", label: "Inference", domainId: "d-in", origin: "USER", decision: "EDITED" })];
    return packStage(s, { status: "DRAFT", version: 1, items: [...chosen, ...topics, ...placed], ...(gemini ? { arrangedBy: "GEMINI" as const } : {}) }, i === 0 ? [33, 15] : [34, 25], [18, 0]);
  });
}

/**
 * A keys-only draft of the pack (F-R4-17, F-R4-21): `gemini` arranged by a v3
 * Gemini reply (packDraftMilestones; `v4`: a v4 reply's, code's progression
 * with its picks), else the app's starter (code's progression, contracts
 * §20); its additions and their mode.
 */
function packDraftView(opts: { gemini: boolean; v4?: boolean; exam: boolean; additions: string[]; mode?: "BULK" | "TOGGLES"; blockedLinear?: boolean; run?: RunView | null; dateCheck?: DateCheck; aim?: string; room?: number; p?: Partial<DraftView> }): RoadmapView {
  const ms = opts.gemini && !opts.v4 ? packDraftMilestones({ additions: opts.additions, exam: opts.exam }) : packProgressionMilestones({ exam: opts.exam, gemini: opts.gemini, room: opts.room });
  const adds = opts.additions.length ? packAdditions(opts.blockedLinear) : [];
  // Without an exam the date check has no exam waypoint.
  const dateCheck = opts.dateCheck ?? (opts.exam ? packDateCheck() : packDateCheck({ reachByExam: null, basis: [REALISTIC_BASIS[0], REALISTIC_BASIS[2]] }));
  const f: Feasibility = { ...packFeasibility("2026-10-05"), milestones: ms.map((m) => mfOf(m, [])), dateCheck };
  const checkpointToSet = ms[0].items.find((it) => it.kind === "CHECKPOINT" && it.bar == null);
  const draft: DraftView = {
    version: 1,
    milestones: ms,
    feasibility: f,
    bulkKeepOff: true,
    credential: opts.exam,
    nonEnglish: false,
    alarm: false,
    // The lines no milestone holds (a v3 reply could leave one out; code's progression never does).
    uncoveredSyllabus: OUTLINE.map((_, i) => i).filter((i) => !ms.some((m) => m.items.some((it) => it.kind === "TOPIC" && it.syllabusRef === i))),
    nextLineageId: ms[0].lineageId,
    acceptable: false,
    nextToDecide: adds.length ? adds[0].itemId : (checkpointToSet?.id ?? null),
    exclusions: [],
    sessionPicks: null,
    aimConflict: null,
    gapsHidden: 0,
    gaps: [],
    additions: adds,
    additionsMode: opts.mode ?? (opts.exam ? "TOGGLES" : "BULK"),
    unassignedLines: [4, 5],
    dateCheck,
    depth: packDepth({ exam: opts.exam ? { day: EXAM_DAY, reachLevel: 8 } : null }),
    legacy: null,
    ...opts.p,
  };
  const run = opts.run === undefined ? (opts.gemini ? v3Run() : v3Run({ kind: "INHOUSE", model: null, modelVersion: null, promptVersion: null, drafts: 0, wrote: "INHOUSE", report: null })) : opts.run;
  return {
    ...activeView(),
    state: "DRAFT",
    today: "2026-10-05",
    acceptedRun: null,
    positions: undefined,
    header: packHeader({ status: "DRAFT", version: 0, acceptedDay: null, firstAcceptedDay: null, aim: opts.aim ?? (opts.exam ? PACK_AIM : "Use probability and inference fluently in my analytics work"), examLabel: opts.exam ? "Exam P" : null, examDay: opts.exam ? EXAM_DAY : null, credential: opts.exam, dateMode: "REALISTIC", dateOrigin: null }),
    run,
    draft,
    library: PACK_LIB,
    rank: null,
    proficiency: null,
    toward: null,
    current: null,
    milestones: [],
    weekQuests: null,
    pastWeeks: [],
    feasibility: null,
    history: [],
    depth: null,
    dateCheck: null,
    paragonMissing: [],
    legacy: null,
  };
}

/**
 * "Write it myself" on the pack (the lead's ruling 6; a MANUAL run wrote the
 * rows): the stages as the manual skeleton leaves them, with the Domains and
 * the outline's lines and no practice, step or checkpoint of code's; the
 * user chose the stage's own default on Familiar (Recall drills, "you chose
 * this") and wrote a practice of their own on Retained. Every other stage,
 * Retained included, offers "Add the app's practice".
 */
function manualDraftView(): RoadmapView {
  const run = v3Run({ id: "r7", kind: "MANUAL", model: null, modelVersion: null, promptVersion: null, drafts: 0, wrote: "MANUAL", report: null });
  const v = packDraftView({ gemini: false, exam: true, additions: [], run });
  const ms = v.draft!.milestones.map((m) => {
    const own: ItemDraft[] =
      m.stage === "FAMILIAR"
        ? [catalogItem("PRACTICE", "RECALL_DRILLS", "Recall drills: Probability, Inference", { origin: "USER", decision: "EDITED", method: "DELIBERATE_PRACTICE", sessionsPerWeek: 3, durationBand: "D30", rule: "TARGET:3/W", planSource: "WORKED_OUT" })]
        : m.stage === "RETAINED"
          ? [item({ kind: "PRACTICE", label: "Past papers with my study group", origin: "USER", decision: "EDITED", method: "DELIBERATE_PRACTICE", sessionsPerWeek: 2, durationBand: "D45", rule: "TARGET:2/W", planSource: "WORKED_OUT" })]
          : [];
    return { ...m, items: [...m.items.filter((it) => !it.catalogKey), ...own] };
  });
  return { ...v, draft: { ...v.draft!, milestones: ms, nextToDecide: null } };
}

/** A body plan with constraints (F-R4-17): the kinds left out with their words, the aim conflict, the one session-picks confirm. */
function bodyDraftView(): RoadmapView {
  const trackStage = (ord: number, stage: StageKey, ws: string, due: string, items: ItemDraft[]): MilestoneDraft =>
    milestone({ ord, title: `Run a sub-50 10K · stage ${ord} of 3`, titleOrigin: APP, titleDecision: "PENDING", windowStart: ws, dueDay: due, status: "DRAFT", rankIndex: ord, stage, items, measures: [practiceMeasure(`mbd${ord}`, 18)], notes: ["HEALTH_LINE"], arrangedBy: "GEMINI" });
  const ms = [
    trackStage(1, "STAGE_1", "2026-10-05", "2026-12-27", [
      catalogItem("PRACTICE", "EASY_SESSION", "Easy session", { method: "WORKOUT", sessionsPerWeek: 3, durationBand: "D30", rule: "TARGET:3/W", planSource: "WORKED_OUT", notes: ["GEMINI_PICK"] }),
      catalogItem("PRACTICE", "STRENGTH_SESSION", "Strength session", { method: "WORKOUT", sessionsPerWeek: 1, durationBand: "D30", rule: "TARGET:1/W", planSource: "WORKED_OUT", notes: ["GEMINI_PICK"] }),
      catalogItem("STEP", "SET_UP", "Set up what you need for Run a sub-50 10K"),
    ]),
    trackStage(2, "STAGE_3", "2026-12-28", "2027-05-23", [catalogItem("PRACTICE", "MOBILITY_SESSION", "Mobility session", { method: "WORKOUT", sessionsPerWeek: 2, durationBand: "D20", rule: "TARGET:2/W" })]),
    trackStage(3, "STAGE_5", "2027-05-24", "2027-10-03", [catalogItem("PRACTICE", "TECHNIQUE_SESSION", "Technique session", { method: "WORKOUT", sessionsPerWeek: 2, durationBand: "D30", rule: "TARGET:2/W" })]),
  ];
  const v = packDraftView({ gemini: true, exam: false, additions: [] });
  return {
    ...v,
    header: header({ id: "rm5", aim: "Run a sub-50 10K", area: { kind: "TRACK", track: "BODY" }, track: "BODY", targetDay: "2027-10-03", constraints: "Knee injury, no running", hoursPerWeek: 4, status: "DRAFT", version: 0, acceptedDay: null, firstAcceptedDay: null, startDay: "2026-10-05" }),
    library: [],
    draft: {
      ...v.draft!,
      milestones: ms,
      feasibility: { ...v.draft!.feasibility, milestones: ms.map((m) => mfOf(m, [])), dateCheck: undefined },
      credential: false,
      exclusions: [
        { kind: "HARDER_SESSION", word: "running" },
        { kind: "LONGER_SESSION", word: "running" },
        { kind: "PERFORMANCE_CHECK", word: "running" },
        { kind: "FULL_ATTEMPT", word: "running" },
      ],
      aimConflict: { word: "running" },
      sessionPicks: { kinds: ["STRENGTH_SESSION", "EASY_SESSION"], constraints: "Knee injury, no running", decision: "PENDING" },
      additions: [],
      unassignedLines: [],
      uncoveredSyllabus: [],
      dateCheck: null,
      depth: null,
      nextLineageId: ms[0].lineageId,
      nextToDecide: ms[0].items[0].id,
    },
  };
}

/** The legacy plan's chosen Domains (Roadmap.domainIds): two of the Trading Field's. */
const LEGACY_DOMAINS = ["d-rm", "d-ps"];

/** A plan made before revision 4 (F-R4-16): its aim, Area, banner and action; none of its milestone or item text arrives. */
function legacyView(kind: "ACTIVE" | "DRAFT"): RoadmapView {
  const base = activeView();
  return {
    ...base,
    state: kind,
    header: header({ status: kind, legacy: true, depth: null, version: kind === "DRAFT" ? 0 : 1, acceptedDay: kind === "DRAFT" ? null : "2026-10-04", domainIds: LEGACY_DOMAINS }),
    run: null,
    acceptedRun: null,
    positions: undefined,
    draft: kind === "DRAFT" ? { ...packDraftView({ gemini: false, exam: false, additions: [] }).draft!, milestones: [], acceptable: false, nextLineageId: null, nextToDecide: null, legacy: { kind: "DRAFT", geminiHidden: true } } : null,
    rank: kind === "DRAFT" ? null : rank(0),
    proficiency: null,
    toward: null,
    current: null,
    milestones: [],
    weekQuests: null,
    pastWeeks: [],
    feasibility: null,
    triggers: [],
    aftercare: [],
    history: kind === "DRAFT" ? [] : base.history,
    // Its own Domains travel with "Start again at a depth" (the contract §15.11), not the Area's defaults.
    legacy: { kind, geminiHidden: true, domainIds: LEGACY_DOMAINS, areaFieldId: "f-tr" },
    depth: null,
    dateCheck: null,
    paragonMissing: [],
    gaps: [],
    gapsHidden: 0,
  };
}

/** The intake with a Field Area aimed at a depth (F-R4-4, F-R4-9, F-R4-24): Depth, coverage, When realistic, the exam and its date, the outline's line Domains. */
function depthIntakeFixture(p: Partial<Intake> = {}, view: Partial<IntakeView> = {}): IntakeView {
  const today = "2026-10-05";
  const base = intakeFixture(false);
  const field: IntakeFieldOption = { id: "f-st", name: "Statistics", level: 9, cards: 96, inMaintenance: false, paceMeasured: true, domains: PACK_LIB.map((d) => ({ id: d.id, name: d.name, cards: d.cards, atSix: d.atSix, atTop: d.atTop, paceMeasured: true, nonRecall: PACK_NON_RECALL[d.id] ?? 0 })) };
  const empty: IntakeFieldOption = { id: "f-new", name: "Sailing", level: 1, cards: 0, inMaintenance: false, paceMeasured: false, domains: [] };
  const intake: Intake = {
    aim: PACK_AIM,
    fieldId: "f-st",
    track: "CRAFT",
    domainIds: PACK_DOMAINS,
    targetDay: addDays(today, 1080),
    hoursPerWeek: 6,
    newCardsPerWeek: null,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: { lines: OUTLINE, source: "SOA Exam P syllabus", lineDomains: ["d-pr", "d-pr", "d-pr", "d-in", null, null] },
    startPoint: "BASICS",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: "Evenings only.",
    examLabel: "Exam P",
    depth: 12,
    coverage: null,
    dateMode: "REALISTIC",
    exam: true,
    examDay: EXAM_DAY,
    replaces: null,
    ...p,
  };
  return {
    ...base,
    today,
    fields: [field, empty, ...base.fields],
    draft: { roadmapId: "rm4", intake, savedDay: today },
    m: 1,
    paceRate: 3,
    dateChips: [
      { months: 6, day: "2027-04-05", possible: { MASTERED: false, FLUENT: false, RETAINED: true } },
      { months: 12, day: "2027-10-05", possible: { MASTERED: false, FLUENT: true, RETAINED: true } },
      { months: 24, day: "2028-10-05", possible: { MASTERED: true, FLUENT: true, RETAINED: true } },
      { months: 36, day: "2029-09-19", possible: { MASTERED: true, FLUENT: true, RETAINED: true } },
    ],
    ...view,
  };
}

function rev4FixtureOf(state: Rev4State): RoadmapFixture {
  if (isConfirmState(state)) return confirmFixtureOf(state);
  switch (state) {
    case "depth-realistic": {
      const v = packActiveView();
      return { view: v, intake: null, aim: packAim(v, "ACTIVE"), today: v.weekQuests, startPreview: null, note: "A plan aimed at a depth, started at Retained: the Depth line and the exam waypoint in the header, Proficiency toward Mastered (level 12), one measure per Domain, the user's outline lines, the app's and Gemini's practice types." };
    }
    case "depth-calibrating": {
      const base = packActiveView();
      const v: RoadmapView = {
        ...base,
        today: "2026-11-02",
        header: packHeader({ dateOrigin: { origin: "REALISTIC", calibrating: ["p", "c"] }, targetDay: "2028-03-19" }),
        rank: packRank(0, { next: { kind: "milestone", index: 2, name: AIM_RANKS[2], milestoneOrd: 1 } }),
        proficiency: packProficiency(0.05, { cards: 0.079, practice: 0, milestones: 0 }, 0, {}, "2026-11-02"),
        current: { ...base.current!, milestone: { ...packStage(STAGES[0]), status: "PLANNED", items: [] }, goalId: null, measures: [], headline: null, stepDone: undefined, practiceKept: undefined },
        milestones: packRows({ 1: "PLANNED" }),
        weekQuests: null,
        pastWeeks: [],
        dateCheck: packDateCheck({ dateOrigin: { origin: "REALISTIC", calibrating: ["p", "c"] }, D_real: "2028-03-19", basis: [REALISTIC_BASIS[0].replace("your 80% pass rate (reads high)", "an assumed 80% pass rate").replace("the 92% of your due queue you clear", "an assumed 85% of your due queue cleared"), "This date is an estimate: it assumes an 80% pass rate until 30 reviews are measured and that you clear 85% of your due queue until your clearance is measured.", REALISTIC_BASIS[1]] }),
        triggers: [{ trigger: "CALIBRATED", milestoneOrd: null, line: "Your pass rate is now measured (76%). Re-date the stages you haven't started?" }],
        throughput: CALIBRATING_TP,
      };
      return { view: v, intake: null, aim: packAim(v, "ACCEPTED", { dateChip: { depth: 12, day: "2028-03-19", estimate: true } }), today: null, startPreview: null, note: "While the pass rate and the clearance calibrate the date uses the published priors, says so, reads 'estimate', and offers a re-date once measured (CALIBRATED)." };
    }
    case "depth-over": {
      const base = packActiveView();
      const v: RoadmapView = {
        ...base,
        header: packHeader({ targetDay: "2027-10-03", over: true, dateOrigin: { origin: "USER", calibrating: [] } }),
        dateCheck: packDateCheck({
          verdict: "OVER",
          rateAsked: 4.2,
          reachByUserDate: 11,
          dateOrigin: { origin: "USER", calibrating: [] },
          basis: [REALISTIC_BASIS[0], "Asks 4.2 new cards a week, more than your usual 3.", "By your date the plan reaches Toward Mastered (level 11).", REALISTIC_BASIS[1]],
        }),
      };
      return { view: v, intake: null, aim: packAim(v, "ACTIVE", { over: true, dateChip: { depth: 12, day: "2027-10-03", estimate: false } }), today: v.weekQuests, startPreview: null, note: "The user's own date, kept over the pace: 'Over' for good, the rate it asks, and where the plan is by that date." };
    }
    case "depth-lowered": {
      const base = packActiveView();
      const v: RoadmapView = {
        ...base,
        header: packHeader({ depth: 10, targetDay: "2027-05-16" }),
        depth: packDepth({ depth: 10, depthChoice: { from: 12, to: 10, day: "2027-01-05", reason: "CHOICE" }, coverage: packCoverage() }),
        proficiency: packProficiency(0.4648, { cards: 0.372, practice: 0.765, milestones: 2 / 4 }, 2, { change: { kind: "rebased", rebase: { on: "2027-01-05", from: 0.34, cause: "REPLAN", detail: "depth lowered Mastered → Fluent" } }, basisKey: FIXTURE_BASIS.v1DepthLowered }, PACK_TODAY, { level: 10, name: "Fluent" }, 4),
        // The stages above the new depth are dropped: the ladder ends at Fluent's rank (every rank given is kept).
        rank: (() => {
          const r = packRank(2, { top: { index: 4, name: AIM_RANKS[4], withAim: false } });
          return { ...r, ladder: r.ladder.filter((x) => x.index <= 4) };
        })(),
        positions: 4,
        paragonMissing: ["DEPTH"],
        // lowerDepthCore writes a record within version 1 (contracts §15.7); R4's historyOf flags it (depthLowered, §16.2) and words
        // it with depthChangeLineOf, so Plan history reads "v1 depth lowered 5 Jan: Mastered → Fluent", never "accepted".
        history: [
          { version: 1, day: PACK_ACCEPTED, undone: false, changes: [] },
          { version: 1, day: "2027-01-05", undone: false, changes: ["lowered the depth Mastered → Fluent"], depthLowered: true },
        ],
        milestones: packRows({ 1: "REACHED", 2: "REACHED", 3: "CURRENT", 5: "DROPPED", 6: "DROPPED" }, { 1: { reachedDay: "2026-11-20", percent: 100 }, 2: { reachedDay: "2026-12-27", percent: 100 }, 3: { percent: 17 } }),
        dateCheck: packDateCheck({ D_real: "2027-05-16", basis: ["At 70% of your usual 3 new cards a week, your 80% pass rate (reads high) and the 92% of your due queue you clear, this depth is realistic by Sun 16 May 2027."] }),
      };
      return { view: v, intake: null, aim: packAim(v, "ACTIVE", { depth: 10, dateChip: { depth: 10, day: "2027-05-16", estimate: false } }), today: v.weekQuests, startPreview: null, note: "A lowered depth: shown for good on the Depth line, the stages above it dropped, Proficiency rebased toward Fluent (level 10), every rank given kept, Paragon off." };
    }
    case "coverage-choice": {
      const base = packActiveView();
      const v: RoadmapView = {
        ...base,
        header: packHeader({ hasSyllabus: false }),
        depth: packDepth({
          coverage: [...packCoverage({ "d-pr": { typed: 5, n: 5, belowPolicy: true } }), { domainId: "d-rk", name: "Risk Management", live: 14, nonRecall: 0, linesTied: 0, linesShared: 0, floor: 25, share: 12, outline: 0, policy: 25, typed: null, n: 25, belowPolicy: false }],
          coverageChoices: [{ domainId: "d-pr", policy: 34, typed: 5, day: PACK_ACCEPTED }],
          domainOrigins: { "d-pr": { by: "INTAKE", day: PACK_ACCEPTED }, "d-in": { by: "INTAKE", day: PACK_ACCEPTED }, "d-rk": { by: "GEMINI_NEEDS", day: PACK_ACCEPTED } },
          outlineChecked: false,
          exam: null,
        }),
        rank: packRank(2, { top: { index: 5, name: AIM_RANKS[5], withAim: false } }),
        paragonMissing: ["COVERAGE"],
      };
      return { view: v, intake: null, aim: packAim(v, "ACTIVE"), today: v.weekQuests, startPreview: null, note: "A coverage figure below the app's, Gemini's suggested Domain the user added, and no outline: each shown on the Depth line for the life of the plan; the top rank is Virtuoso." };
    }
    case "exam-waypoint": {
      const base = packActiveView();
      const m3 = packM3(false);
      const v: RoadmapView = {
        ...base,
        today: "2026-12-28",
        current: { ...base.current!, milestone: m3, goalId: null, measures: [], headline: null, stepDone: undefined, practiceKept: undefined },
        milestones: packRows({ 1: "REACHED", 2: "REACHED", 3: "PLANNED" }, { 1: { reachedDay: "2026-11-20", percent: 100 }, 2: { reachedDay: "2026-12-27", percent: 100 } }),
        weekQuests: null,
      };
      const sp: StartPreview = {
        milestoneId: m3.id!,
        ord: 3,
        of: 6,
        title: m3.title,
        dueDay: "2027-02-14",
        goalsLive: true,
        writesOff: false,
        refusal: null,
        todayCheck: null,
        feasibility: mfOf(m3, []),
        pending: [],
        todayRows: [
          { kind: "TITLE", itemId: null, label: m3.title, class: "WORKED_OUT", needs: "NONE" },
          { kind: "PRACTICE", itemId: m3.items[4].id, label: m3.items[4].label, class: "WORKED_OUT", needs: "NONE" },
          { kind: "PRACTICE", itemId: m3.items[5].id, label: m3.items[5].label, class: "WORKED_OUT", needs: "NONE" },
          { kind: "CHECKPOINT", itemId: m3.items[6].id, label: m3.items[6].label, class: "WORKED_OUT", needs: "NONE" },
        ],
        practices: [
          { itemId: m3.items[4].id!, lineageId: "lp-ps", name: m3.items[4].label, rule: "TARGET:2/W", minutes: 30, on: true, alreadyOnToday: null, price: 9, weeklyMinutes: 60 },
          { itemId: m3.items[5].id!, lineageId: "lp-tp", name: m3.items[5].label, rule: "TARGET:1/W", minutes: 45, on: true, alreadyOnToday: null, price: 12, weeklyMinutes: 45 },
        ],
        steps: [],
        pay: Object.assign({ stated: 6, zeroReason: null, limitLine: null, paidOn: null }, { restsOnAdded: "Timed practice: Probability, Inference" }),
        payBasis: { otherMinutesPerWeek: 120, hasCards: true, lineagePaidOn: null },
        givesRank: "Specialist",
        weekQuests: null,
        canStart: true,
        blockers: [],
      };
      return { view: v, intake: null, aim: packAim(v, "ACTIVE"), today: null, startPreview: sp, note: "Between stages, before the exam: the exam's waypoint for good, the Start sheet's pay line resting on a practice the app added." };
    }
    case "count-gate": {
      const v = packDraftView({ gemini: false, exam: false, additions: [] });
      return { view: v, intake: null, aim: { ...packAim(v, "DRAFT"), draftItems: 1, rank: null, proficiency: null, milestone: null, dateChip: null }, today: null, startPreview: null, note: "This build's draft (from the app's numbers): a count gate first ('Familiar, part 1'), the outline's lines placed in order, and code's practice progression (contracts §20), each stage saying why it holds what it does." };
    }
    case "held-stages": {
      const base = packActiveView();
      const held = { held: true, state: "PLANNED" as const, reachedDay: PACK_ACCEPTED };
      const v: RoadmapView = {
        ...base,
        today: PACK_ACCEPTED,
        rank: packRank(0, { next: { kind: "milestone", index: 4, name: AIM_RANKS[4], milestoneOrd: 4 } }),
        proficiency: packProficiency(0.3, { cards: 0.42, practice: 0, milestones: 3 / 6 }, 3, {}, PACK_ACCEPTED),
        milestones: packRows({ 4: "PLANNED" }, { 1: held, 2: held, 3: held }),
        current: { ...base.current!, milestone: { ...packStage(STAGES[3]), items: [] }, goalId: null, measures: [], headline: null, stepDone: undefined, practiceKept: undefined },
        weekQuests: null,
        pastWeeks: [],
      };
      return { view: v, intake: null, aim: packAim(v, "ACCEPTED"), today: null, startPreview: null, note: "A strong library: the stages already held show 'Held when you began' and give no rank; the plan starts at Fluent." };
    }
    case "legacy": {
      const v = legacyView("ACTIVE");
      // The Aim card carries the page's banner facts (AimCardView.legacyView, contracts §16.3): the Gemini-hidden line and the plan's own Domains.
      return { view: v, intake: null, aim: { ...aimFromView(activeView(), "ACTIVE"), legacy: true, legacyView: v.legacy, milestone: null, rank: null, proficiency: null, weekQuests: null }, today: null, startPreview: null, note: "A plan made before revision 4: its aim, Area, the banner and 'Start again at a depth'; none of its milestone or item text, and it isn't measured." };
    }
    case "legacy-draft": {
      const v = legacyView("DRAFT");
      return { view: v, intake: null, aim: { ...aimFromView(activeView(), "DRAFT"), legacy: true, legacyView: v.legacy, milestone: null, rank: null, proficiency: null, weekQuests: null, draftItems: null }, today: null, startPreview: null, note: "A draft made before revision 4: the banner and 'Draft it again', which opens the intake; Accept waits." };
    }
    case "done-depth": {
      const base = packActiveView();
      const v: RoadmapView = {
        ...base,
        state: "DONE",
        today: "2028-03-15",
        header: packHeader({ status: "DONE", reachedDay: "2028-03-12", doneDay: "2028-03-14" }),
        rank: packRank(6, { newSince: "2028-03-12", next: { kind: "top" } }),
        proficiency: packProficiency(1, { cards: 1, practice: 0.84, milestones: 1 }, 6, {}, "2028-03-15"),
        current: null,
        weekQuests: null,
        milestones: packRows({ 1: "REACHED", 2: "REACHED", 3: "REACHED", 4: "REACHED", 5: "REACHED", 6: "REACHED" }),
        triggers: [],
      };
      return {
        view: v,
        intake: null,
        aim: packAim(v, "DONE", { reachedDay: "2028-03-12", doneDay: "2028-03-14", heldDepth: { depth: 12, domainNames: ["Probability", "Inference"], confirmedDay: "2028-03-14" }, milestone: null, weekQuests: null }),
        today: null,
        startPreview: null,
        note: "The aim reached 3 days ago: the achievement leads ('Open roadmap', then 'Set your next aim'), and the roadmap ends with 'Set a new aim'.",
      };
    }
    case "archived": {
      const base = packActiveView();
      const v: RoadmapView = { ...base, state: "ARCHIVED", header: packHeader({ status: "ARCHIVED", archivedDay: "2027-01-07", archiveReason: "archived by you" }), current: null, weekQuests: null, triggers: [] };
      return { view: v, intake: null, aim: { ...packAim(v, "EMPTY"), state: "EMPTY", lastAim: { roadmapId: "rm4", aim: PACK_AIM, rankIndex: 2, rankName: "Journeyman", reached: false, day: "2027-01-07" } }, today: null, startPreview: null, note: "Archived: read-only history with no dead end ('Set a new aim'); the Aim card asks again, with the last aim's line." };
    }
    case "draft-v3": {
      const v = packDraftView({ gemini: true, exam: false, additions: ["d-ca", "d-la"], mode: "BULK" });
      return { view: v, intake: null, aim: { ...packAim(v, "DRAFT"), draftItems: 1, rank: null, proficiency: null, milestone: null, dateChip: null }, today: null, startPreview: null, note: "draft-mixed-3 (keys only): Gemini arranged the outline and picked the types; it wrote no words. An English, non-exam aim: [Add both] [Choose…] [Leave out], with the date effect first." };
    }
    case "draft-exam": {
      const v = packDraftView({ gemini: true, exam: true, additions: ["d-ca", "d-la"], mode: "TOGGLES", blockedLinear: true });
      return { view: v, intake: null, aim: null, today: null, startPreview: null, note: "An exam aim: one toggle per Domain and [Confirm], no add-all; an addition past 3 years is disabled with its reason." };
    }
    case "draft-v4": {
      const base = packDraftView({ gemini: true, v4: true, exam: true, additions: [], mode: "TOGGLES", run: v3Run({ id: "r6", promptVersion: 4 }) });
      // R4's next item to decide: a pending addition, then Gemini's waiting choice that isn't its stage's default (Retained's
      // Explain it, beside Problem sets: accept waits on it), then the next milestone's own rows.
      const waiting = base.draft!.milestones.flatMap((m) => m.items).find((it) => it.kind === "PRACTICE" && it.decision === "PENDING" && it.notes.includes("GEMINI_PICK") && it.catalogKey === "EXPLAIN_IT");
      const v: RoadmapView = { ...base, draft: { ...base.draft!, nextToDecide: waiting?.id ?? base.draft!.nextToDecide } };
      return {
        view: v,
        intake: null,
        aim: null,
        today: null,
        startPreview: null,
        note: "A v4 Gemini draft (contracts §20): every practice, step and checkpoint is code's progression (built with the real progressionOf), each stage saying why it holds what it does and what it builds on; Gemini put the outline in order and picked among each stage's options; a pick sits beside the app's default, never in its place (Familiar's is the default itself; Retained's sits beside Problem sets, with one tap back to the default), and Part, Between and the stages after the exam carry no pick. The header names only what this reply did: it suggested no Domain.",
      };
    }
    case "draft-body": {
      const v = bodyDraftView();
      return { view: v, intake: null, aim: null, today: null, startPreview: null, note: "A body plan with constraints: the kinds left out with their words, the aim conflict, and the one confirm that quotes the constraints." };
    }
    case "draft-low-hours": {
      const base = packDraftView({ gemini: false, exam: true, additions: [], room: 1 });
      const v: RoadmapView = { ...base, header: { ...base.header!, hoursPerWeek: 3 } };
      return {
        view: v,
        intake: null,
        aim: null,
        today: null,
        startPreview: null,
        note: "The app's plan at 3 h a week (the lead's ruling 1): each stage's room holds one practice, its role-defining kind; where the role needs two (the exam's run-up: timed practice), they take turns week about, the label saying so, a short line saying why and the How showing each week's kind.",
      };
    }
    case "draft-manual": {
      const v = manualDraftView();
      return {
        view: v,
        intake: null,
        aim: null,
        today: null,
        startPreview: null,
        note: "Write it myself (the lead's ruling 6): the plan stays the user's, so no practice of code's is placed on it; each stage offers “Add the app's practice” (its own default under the gate) in one tap, and a stage already holding that kind (Familiar) doesn't.",
      };
    }
    case "draft-rejected": {
      const v = packDraftView({
        gemini: false,
        exam: true,
        additions: [],
        run: v3Run({ status: "FAILED", wrote: "STARTER", error: "reply rejected: EXTRA_PROPERTY", report: { dropped: [], flagged: [], notes: [], integrity: { verdict: "REJECTED", violations: [{ code: "EXTRA_PROPERTY", path: "stages.FOUNDATION.<extra>" }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} } } }),
      });
      return { view: v, intake: null, aim: null, today: null, startPreview: null, note: "A reply that broke the format: rejected whole, nothing from it used, the plan from the user's numbers in its place." };
    }
    case "draft-impossible": {
      const v = packDraftView({
        gemini: false,
        exam: true,
        additions: [],
        dateCheck: packDateCheck({
          verdict: "IMPOSSIBLE",
          rateAsked: null,
          reachByUserDate: 8,
          dateOrigin: { origin: "USER", calibrating: [] },
          basis: [REALISTIC_BASIS[0], "Your date, Mon 5 Apr 2027, is before the earliest this depth can be reached, even at twice your pace: a new card needs at least 318 days to reach level 12 here.", "By your date the plan reaches Retained (level 8)."],
        }),
      });
      return { view: v, intake: null, aim: null, today: null, startPreview: null, note: "A chosen date before the floor: Impossible for that depth and date; the realistic date or a lower depth, each one tap, nothing automatic." };
    }
    case "draft-gaps": {
      const v = packDraftView({
        gemini: true,
        exam: true,
        additions: [],
        p: {
          gaps: [
            { itemId: "gap1", name: "Conditional expectation", source: { kind: "OUTLINE", index: 3 }, similarTo: null },
            { itemId: "gap2", name: "Probability exam", source: { kind: "AIM", index: 0 }, similarTo: "Probability" },
          ],
          gapsHidden: 3,
        },
      });
      return { view: v, intake: null, aim: null, today: null, startPreview: null, gates: { gemini: true, gaps: true }, note: "Lead-only (ROADMAP_GAPS_LIVE is false in this build): the area-suggestion panel, apart from the plan; only names found in the user's own words are shown, the rest only counted." };
    }
    case "intake-depth":
      return { view: null, intake: depthIntakeFixture(), aim: null, today: null, startPreview: null, note: "The intake for a Field Area: Depth, the coverage breakdown, When realistic and the chips' verdicts, the exam with its date, the outline's line Domains." };
    case "intake-empty-library":
      return { view: null, intake: depthIntakeFixture({ fieldId: "f-new", domainIds: [], syllabus: null, examLabel: null, exam: false, examDay: null, aim: "Sail a dinghy solo" }, { paceRate: null }), aim: null, today: null, startPreview: null, note: "An empty library: name the areas this needs, and paste an outline from a source you trust; no pointer to Gemini." };
    case "intake-gemini":
      return { view: null, intake: { ...intakeFixture(true), m: 1 }, aim: null, today: null, startPreview: null, gates: { gemini: true }, note: "Lead-only (ROADMAP_GEMINI_LIVE is false in this build): Draft with Gemini says what it will arrange; the app writes every word." };
  }
}

/// ═══ Constraint safety: confirm to unlock (contracts §19) ════════════════════
//
// The activity card in each place it shows, built with the real pure gate
// (roadmap-catalog constraintsStateOf → allowedKindsFor → activityConfirmViewOf)
// over made-up words, so a fixture's rows are the server's rows. Every BODY
// and CARE plan asks once, whatever the words; a CRAFT plan asks on a cue;
// a Field plan never asks, and its words only suggest (decisions 1 and 7).

const CONFIRM_AIM = "Run a sub-50 10K";

/** The gate's state over a plan's words (texts: the constraints and the aim; no notes). */
function confirmStateOf(track: CatalogTrack, constraints: string | null, aim: string, exclusions: ConstraintExclusion[], exam = false) {
  return constraintsStateOf({ track, texts: { constraints, aim, notes: [] }, exam, practicesAllowed: true, exclusions });
}

/** The view the server builds (activityConfirmViewOf) for these words and stored answers. */
function confirmViewOf(track: CatalogTrack, constraints: string | null, aim: string, exclusions: ConstraintExclusion[], stored: ActivityConfirm | null, exam = false): ActivityConfirmView {
  const state = confirmStateOf(track, constraints, aim, exclusions, exam);
  return activityConfirmViewOf(state, allowedKindsFor(state, stored));
}

/**
 * A track draft built from the user's numbers while the plan waits on the
 * answer: three stages of the track's own easy kinds only (the safe kinds),
 * with the gate's view and, when the aim meets the user's own words, R3's
 * aim conflict.
 */
function confirmTrackDraftOf(o: {
  id: string;
  track: "BODY" | "CARE" | "CRAFT";
  aim: string;
  constraints: string | null;
  exclusions: ConstraintExclusion[];
  aimConflict: { word: string } | null;
  stages: [ItemDraft[], ItemDraft[], ItemDraft[]];
}): RoadmapView {
  const stage = (ord: number, key: StageKey, ws: string, due: string, items: ItemDraft[]): MilestoneDraft =>
    milestone({ ord, title: `${o.aim} · stage ${ord} of 3`, titleOrigin: APP, titleDecision: "PENDING", windowStart: ws, dueDay: due, status: "DRAFT", rankIndex: ord, stage: key, items, measures: [practiceMeasure(`mcf${ord}`, 18)], notes: o.track === "CRAFT" ? [] : ["HEALTH_LINE"] });
  const ms = [stage(1, "STAGE_1", "2026-10-05", "2026-12-27", o.stages[0]), stage(2, "STAGE_3", "2026-12-28", "2027-05-23", o.stages[1]), stage(3, "STAGE_5", "2027-05-24", "2027-10-03", o.stages[2])];
  const v = packDraftView({ gemini: false, exam: false, additions: [] });
  return {
    ...v,
    header: header({ id: o.id, aim: o.aim, area: { kind: "TRACK", track: o.track }, track: o.track, targetDay: "2027-10-03", constraints: o.constraints, hoursPerWeek: 4, status: "DRAFT", version: 0, acceptedDay: null, firstAcceptedDay: null, startDay: "2026-10-05" }),
    library: [],
    draft: {
      ...v.draft!,
      milestones: ms,
      feasibility: { ...v.draft!.feasibility, milestones: ms.map((m) => mfOf(m, [])), dateCheck: undefined },
      credential: false,
      exclusions: o.exclusions,
      aimConflict: o.aimConflict,
      sessionPicks: null,
      additions: [],
      unassignedLines: [],
      uncoveredSyllabus: [],
      dateCheck: null,
      depth: null,
      nextLineageId: ms[0].lineageId,
      nextToDecide: null,
      activityConfirm: confirmViewOf(o.track, o.constraints, o.aim, o.exclusions, null),
    },
  };
}

const confirmSession = (key: CatalogKey, label: string, n: number, band: ItemDraft["durationBand"], method: ItemDraft["method"] = "WORKOUT") =>
  catalogItem("PRACTICE", key, label, { method, sessionsPerWeek: n, durationBand: band, rule: `TARGET:${n}/W`, planSource: "WORKED_OUT" });

/**
 * A body draft while the plan waits on the answer: easy, mobility and
 * technique sessions only. The parser's reading pre-ticks three boxes, and
 * the aim meets the user's own sentence (decision 6: quoted, never "no X").
 */
function confirmDraftView(): RoadmapView {
  const constraints = "Running causes me knee pain. Bad knees, so no jumping.";
  return confirmTrackDraftOf({
    id: "rm7",
    track: "BODY",
    aim: CONFIRM_AIM,
    constraints,
    exclusions: [
      { kind: "HARDER_SESSION", word: "running" },
      { kind: "LONGER_SESSION", word: "running" },
      { kind: "FULL_ATTEMPT", word: "running" },
    ],
    aimConflict: { word: "running" },
    stages: [
      [confirmSession("EASY_SESSION", "Easy session", 3, "D30"), confirmSession("MOBILITY_SESSION", "Mobility session", 2, "D20"), catalogItem("STEP", "SET_UP", `Set up what you need for ${CONFIRM_AIM}`)],
      [confirmSession("TECHNIQUE_SESSION", "Technique session", 2, "D30"), confirmSession("EASY_SESSION", "Easy session", 3, "D45")],
      [confirmSession("EASY_SESSION", "Easy session", 3, "D45"), confirmSession("MOBILITY_SESSION", "Mobility session", 2, "D20")],
    ],
  });
}

const CARE_AIM = "Support Mum's care at home";

/** A care draft with nothing in the Constraints box: it asks anyway, with nothing to quote, and meanwhile places planning the week and keeping a log (decision 2: never a dead end). */
function confirmCareDraftView(): RoadmapView {
  return confirmTrackDraftOf({
    id: "rm9",
    track: "CARE",
    aim: CARE_AIM,
    constraints: null,
    exclusions: [],
    aimConflict: null,
    stages: [
      [confirmSession("PLAN_AHEAD", "Plan the week ahead", 1, "D20", "WRITING"), confirmSession("KEEP_A_LOG", `Keep a log: ${CARE_AIM}`, 3, "D15", "WRITING")],
      [confirmSession("PLAN_AHEAD", "Plan the week ahead", 1, "D20", "WRITING"), confirmSession("KEEP_A_LOG", `Keep a log: ${CARE_AIM}`, 3, "D15", "WRITING")],
      [confirmSession("KEEP_A_LOG", `Keep a log: ${CARE_AIM}`, 3, "D15", "WRITING")],
    ],
  });
}

const CRAFT_AIM = "Play Clair de Lune at a recital";

/** A craft draft whose words name a strain (a cue): it asks, quoting them, with HEALTH_LINE, and meanwhile places the technique session only. */
function confirmCraftDraftView(): RoadmapView {
  return confirmTrackDraftOf({
    id: "rm10",
    track: "CRAFT",
    aim: CRAFT_AIM,
    constraints: "Wrist tendinitis, can't play more than 20 minutes.",
    exclusions: [],
    aimConflict: null,
    stages: [[confirmSession("TECHNIQUE_SESSION", "Technique session", 4, "D20")], [confirmSession("TECHNIQUE_SESSION", "Technique session", 4, "D20")], [confirmSession("TECHNIQUE_SESSION", "Technique session", 4, "D20")]],
  });
}

/** A Field draft whose constraints name a practice type: never gated by a body cue; the kind its words name is a pre-ticked suggestion, still in the plan until the user saves (decision 7). */
function confirmWordsView(): RoadmapView {
  const constraints = "No timed practice, it stresses me out.";
  const exclusions: ConstraintExclusion[] = [{ kind: "TIMED_PRACTICE", word: "timed practice" }];
  const v = packDraftView({ gemini: false, exam: true, additions: [] });
  return {
    ...v,
    header: { ...v.header!, constraints },
    draft: { ...v.draft!, exclusions, activityConfirm: confirmViewOf("FIELD", constraints, PACK_AIM, exclusions, null, true) },
  };
}

/** A body plan between milestones: its next milestone's practices, some of them waiting on the answer. */
function confirmActiveView(constraints: string, stored: (key: string) => ActivityConfirm | null): RoadmapView {
  const base = bodyView();
  const exclusions: ConstraintExclusion[] = [{ kind: "LONGER_SESSION", word: "long run" }];
  const session = (key: CatalogKey, label: string, n: number, band: ItemDraft["durationBand"], lineageId: string) =>
    catalogItem("PRACTICE", key, label, { method: "WORKOUT", sessionsPerWeek: n, durationBand: band, rule: `TARGET:${n}/W`, planSource: "WORKED_OUT", decision: "KEPT", lineageId });
  const m3 = milestone({
    ord: 3,
    title: "Race pace",
    titleOrigin: APP,
    titleDecision: "EDITED",
    windowStart: "2027-02-15",
    dueDay: "2027-04-25",
    status: "PLANNED",
    rankIndex: 3,
    items: [session("EASY_SESSION", "Easy session", 2, "D45", "lp-ez3"), session("HARDER_SESSION", "Harder session", 1, "D45", "lp-hd3"), session("STRENGTH_SESSION", "Strength session", 1, "D30", "lp-sg3")],
    measures: [practiceMeasure("mb3", 20)],
    notes: ["HEALTH_LINE"],
  });
  const state = confirmStateOf("BODY", constraints, base.header!.aim, exclusions);
  return {
    ...base,
    today: "2027-02-15",
    header: { ...base.header!, constraints },
    current: { ...base.current!, milestone: m3, goalId: null, measures: [], headline: null, stated: 6, stepDone: undefined, practiceKept: undefined },
    milestones: base.milestones.map((r) => (r.ord === 2 ? { ...r, state: "REACHED" as const, reachedDay: "2027-02-14", percent: 100 } : r.ord === 3 ? { ...r, state: "CURRENT" as const } : r)),
    weekQuests: null,
    activityConfirm: activityConfirmViewOf(state, allowedKindsFor(state, stored(state.key))),
  };
}

/** The Start sheet of confirmActiveView's next milestone: a held practice shows its line in place of its switch. */
function confirmStartPreview(m3: MilestoneDraft): StartPreview {
  const p = (lineageId: string, minutes: number, perWeek: number) => {
    const it = m3.items.find((x) => x.lineageId === lineageId)!;
    return { itemId: it.id!, lineageId, name: it.label, rule: `TARGET:${perWeek}/W`, minutes, on: true, alreadyOnToday: null, price: 8, weeklyMinutes: minutes * perWeek };
  };
  return {
    milestoneId: m3.id!,
    ord: 3,
    of: 3,
    title: m3.title,
    dueDay: "2027-04-25",
    goalsLive: true,
    writesOff: false,
    refusal: null,
    todayCheck: null,
    feasibility: mfOf(m3, []),
    pending: [],
    todayRows: [{ kind: "TITLE", itemId: null, label: m3.title, class: "YOURS", needs: "NONE" }, ...m3.items.map((it) => ({ kind: "PRACTICE" as const, itemId: it.id, label: it.label, class: "WORKED_OUT" as const, needs: "NONE" as const }))],
    practices: [p("lp-ez3", 45, 2), p("lp-hd3", 45, 1), p("lp-sg3", 30, 1)],
    steps: [],
    pay: { stated: 6, zeroReason: null, limitLine: null, paidOn: null },
    payBasis: { otherMinutesPerWeek: 120, hasCards: false, lineagePaidOn: null },
    givesRank: "Journeyman",
    weekQuests: null,
    canStart: true,
    blockers: [],
  };
}

/** The intake for a body track Area whose words carry a cue: the activity question under Constraints. */
function confirmIntakeFixture(): IntakeView {
  const base = intakeFixture(false);
  const intake: Intake = {
    aim: CONFIRM_AIM,
    fieldId: null,
    track: "BODY",
    domainIds: [],
    targetDay: "2027-10-04",
    hoursPerWeek: 4,
    newCardsPerWeek: null,
    typicalHours: null,
    typicalHoursSource: null,
    syllabus: null,
    startPoint: "BASICS",
    intensity: "STEADY",
    practicesAllowed: true,
    constraints: "No running for now, my knee hurts. Weights are fine.",
    examLabel: null,
    depth: null,
    coverage: null,
    dateMode: "CHOSEN",
    exam: null,
    examDay: null,
    replaces: null,
    activities: null,
  };
  return { ...base, draft: { roadmapId: "rm8", intake, savedDay: base.today } };
}

/** The body kinds the card listed when the user answered on 2 Jan (the gate's rows then). */
const ANSWERED_ASKED: CatalogKey[] = ["HARDER_SESSION", "LONGER_SESSION", "STRENGTH_SESSION", "FULL_ATTEMPT", "PERFORMANCE_CHECK"];
const ANSWERED_REASON = "Knee injury last year, no running two days in a row";

function confirmFixtureOf(state: ConfirmState): RoadmapFixture {
  switch (state) {
    case "draft-confirm":
      return {
        view: confirmDraftView(),
        intake: null,
        aim: null,
        today: null,
        startPreview: null,
        note: "A body plan asks once, whatever the words: until the user answers, the plan places only easy, mobility and technique sessions. The parser's reading only pre-ticks a box, quoting the user's own words; nothing is unlocked without their tap (Save with a box ticked, or 'Nothing to avoid'). The aim-conflict line quotes their sentence.",
      };
    case "draft-words":
      return { view: confirmWordsView(), intake: null, aim: null, today: null, startPreview: null, note: "A Field plan is never held by a body cue: the type its constraints name is a pre-ticked suggestion, quoted, and stays in the plan until the user saves (or says there's nothing to avoid)." };
    case "draft-care":
      return { view: confirmCareDraftView(), intake: null, aim: null, today: null, startPreview: null, note: "A care plan with nothing in Constraints asks too (no quote, so the lead line claims nothing about the words), and meanwhile places planning the week and keeping a log, so it is never a dead end." };
    case "draft-craft":
      return { view: confirmCraftDraftView(), intake: null, aim: null, today: null, startPreview: null, note: "A craft plan asks when its words name a strain: it quotes them, carries HEALTH_LINE, and meanwhile places the technique session only." };
    case "active-confirm": {
      // The user answered on 2 Jan (Strength session ticked); their words have changed since, so the card asks again and the AVOID stands.
      const v = confirmActiveView("Knee injury last year, no running two days in a row. My knee swelled after the long run.", () => ({
        key: "k1-0b1d2c3e",
        kinds: { STRENGTH_SESSION: { verdict: "AVOID", day: "2027-01-02", reason: ANSWERED_REASON } },
        answered: { day: "2027-01-02", asked: ANSWERED_ASKED, none: false },
      }));
      return {
        view: v,
        intake: null,
        aim: null,
        today: null,
        startPreview: confirmStartPreview(v.current!.milestone),
        note: "The words changed after the user answered: the card asks again ('You answered on 2 Jan, before your words changed'), the 'avoid' stands, Now says what the plan places meanwhile, and the Start sheet holds the practices waiting on the answer.",
      };
    }
    case "active-answered": {
      const v = confirmActiveView("Knee injury last year, no running two days in a row.", (key) => ({
        key,
        kinds: { LONGER_SESSION: { verdict: "AVOID", day: "2027-01-02", reason: ANSWERED_REASON } },
        answered: { day: "2027-01-02", asked: ANSWERED_ASKED, none: false },
      }));
      return { view: v, intake: null, aim: null, today: null, startPreview: null, note: "Answered under these words: the card shrinks to what the user said and what the plan can include, with 'Change', and stays on the roadmap page for the life of the plan." };
    }
    case "intake-confirm":
      return { view: null, intake: confirmIntakeFixture(), aim: null, today: null, startPreview: null, note: "A body track Area: the activity question under Constraints, a box pre-ticked where the user's words suggest it; 'Confirm these' or 'Nothing to avoid' keeps the answer, saved with the plan." };
  }
}

// ═══ UI motion (ui-motion.md §9.3, R0; contracts §21): the motion states ═════
//
// Each is an existing plan with one fact changed and, for a SEEN event, what
// the viewer last saw (`seen`, in roadmap-ui-model's seen keys: the plan
// basis for rank, reach, the date and week quests; the Proficiency basis for
// the headline meter and the horizon). The Aim card beside the page reads the
// same keys (same roadmap, acceptance day and version), so a rise plays once,
// on whichever surface sees it first.

/** The plan basis seeds for the rank and the reach this viewer last saw. */
function rankReachSeen(v: RoadmapView, rankSeen: number, reachSeen: number): SeenSeed[] {
  return seenSeedsOf(seenBasesOfRoadmap(v), [
    [SEEN_WHAT.rank, rankSeen],
    [SEEN_WHAT.reach, reachSeen],
  ]);
}

function motionFixtureOf(state: MotionNewState): RoadmapFixture {
  switch (state) {
    case "rank-new": {
      const v = activeView();
      return {
        view: v,
        intake: null,
        aim: aimFromView(v, "ACTIVE"),
        today: v.weekQuests,
        startPreview: null,
        note: "Milestone 1 counted (Aim rank Aspirant) since this viewer last looked: reach, then rank-rise, once each (seen: rank 0, reach 0).",
        seen: rankReachSeen(v, 0, 0),
      };
    }
    case "reach-new": {
      const v = activeView();
      return {
        view: v,
        intake: null,
        aim: aimFromView(v, "ACTIVE"),
        today: v.weekQuests,
        startPreview: null,
        note: "Milestone 1's reach is new on this rail; its Aim rank was already seen on /you: reach plays, rank-rise doesn't (seen: rank 1, reach 0).",
        seen: rankReachSeen(v, 1, 0),
      };
    }
    case "reach-pending": {
      const base = activeView();
      const countsFrom = addDays(TODAY, 2);
      const v: RoadmapView = {
        ...base,
        rank: rank(1, 6, { pending: { milestoneOrd: 2, countsFrom } }),
        current: {
          ...base.current!,
          headline: fig(1, "tested by your reviews"),
          measures: [
            cardsRow({ figure: fig(42, "tested by your reviews"), gained: 21, pace: { kind: "reached", day: TODAY } }),
            { ...base.current!.measures[1], figure: fig(44, "from your ticks", "SELF") },
          ],
        },
        milestones: rowsActive().map((r) => (r.ord === 2 ? { ...r, state: "PENDING_REACH" as const, percent: 100, countsFrom } : r)),
      };
      const aim = aimFromView(v, "ACTIVE");
      return {
        view: v,
        intake: null,
        aim: { ...aim, milestone: aim.milestone ? { ...aim.milestone, status: "PENDING_REACH", percent: 100, countsFrom, pace: { kind: "reached", day: TODAY } } : null },
        today: v.weekQuests,
        startPreview: null,
        note: "Milestone 2 hit 100% on a tick: 'Reached · counts from Sat' on a dashed node; no seal, no rank motion, no reach until it counts (seen: rank 1, reach 1).",
        seen: rankReachSeen(v, 1, 1),
      };
    }
    case "closed-unreached": {
      const base = activeView();
      const v: RoadmapView = {
        ...base,
        rank: rank(0, 6, { next: { kind: "milestone", index: 2, name: AIM_RANKS[2], milestoneOrd: 2 }, ladder: ladder(0, 2) }),
        proficiency: proficiency(0.3654, { cards: 0.55, practice: 0.23, milestones: 0 }, 0, 6),
        toward: { ...base.toward!, reached: 0 },
        milestones: rowsActive().map((r) => (r.ord === 1 ? { ...r, state: "CLOSED_UNREACHED" as const, percent: 82, closedPercent: 82, reachedDay: null } : r)),
      };
      return {
        view: v,
        intake: null,
        aim: aimFromView(v, "ACTIVE"),
        today: v.weekQuests,
        startPreview: null,
        note: "Milestone 1 closed at 82%, not reached: a struck node, 'Closed at 82% · not reached'; it gave no rank and nothing plays (seen: rank 0, reach 0).",
        seen: rankReachSeen(v, 0, 0),
      };
    }
    case "closed-unreached-aim": {
      const b = bodyView();
      const done: RoadmapView = {
        ...b,
        state: "DONE",
        today: "2027-04-19",
        header: { ...b.header!, status: "DONE", reachedDay: null, doneDay: "2027-04-19" },
        rank: rank(2, 3, { next: { kind: "top" } }),
        proficiency: proficiency(0.8227, { cards: null, practice: 0.82, milestones: 2 / 3 }, 2, 3, {}, "2027-04-19"),
        current: null,
        weekQuests: null,
        milestones: b.milestones.map((r) => (r.ord < 3 ? { ...r, state: "REACHED" as const, percent: 100, reachedDay: r.dueDay } : { ...r, state: "CLOSED_UNREACHED" as const, percent: 82, closedPercent: 82 })),
      };
      return {
        view: done,
        intake: null,
        aim: aimFromView(done, "DONE"),
        today: null,
        startPreview: null,
        note: "The aim closed without being reached: the Aim rank actually held (Journeyman), no seal, 'the aim wasn't reached'; nothing plays (seen: seal 0, rank 2, reach 2).",
        seen: seenSeedsOf(seenBasesOfRoadmap(done), [
          [SEEN_WHAT.seal, 0],
          [SEEN_WHAT.rank, 2],
          [SEEN_WHAT.reach, 2],
        ]),
      };
    }
    case "quest-done-new": {
      const wq0 = weekQuestsFixture();
      const rows = wq0.rows.map((r) => (r.ord === 1 ? { ...r, figure: fig(3, "tested by your reviews · measured 09:12"), done: true } : r));
      // Today's card keys its rows as Now does (WeekQuestsView's roadmap and acceptance, contracts §21.6), so the check plays once.
      const wq: WeekQuestsView & WeekQuestMotionFields = { ...wq0, rows, done: rows.filter((r) => r.done).length, roadmapId: "rm1", acceptedDay: "2026-10-04", version: 1 };
      const v = activeView({ weekQuests: wq });
      return {
        view: v,
        intake: null,
        aim: aimFromView(v, "ACTIVE"),
        today: wq,
        startPreview: null,
        note: "The RAISE week quest reached 3 of 3 since this viewer last looked (1 of 3): its done check draws once, on Today and in Now (seen: that row at 1).",
        seen: seenSeedsOf(seenBasesOfRoadmap(v), [
          [seenQuestWhat(wq.weekStart, 1), 1],
          [SEEN_WHAT.rank, 1],
          [SEEN_WHAT.reach, 1],
        ]),
      };
    }
    case "date-moved": {
      const fx = rev4FixtureOf("depth-realistic");
      const v = fx.view!;
      return {
        ...fx,
        note: "The app's realistic date (an estimate) moved a week later since this viewer last looked: the date chip and the TimeBar's marker crossfade (CHANGED), and 'moved from 5 Mar 2028' says so; nothing draws toward the date (seen: date 5 Mar 2028).",
        seen: seenSeedsOf(seenBasesOfRoadmap(v), [
          [SEEN_WHAT.date, daySeenValue("2028-03-05")],
          [SEEN_WHAT.rank, 2],
          [SEEN_WHAT.reach, 2],
        ]),
      };
    }
    case "horizon-unmeasured": {
      const fx = fixtureOf("accepted");
      const v: RoadmapView = { ...fx.view!, proficiency: null };
      return {
        view: v,
        intake: null,
        aim: { ...fx.aim!, proficiency: null, measuredAt: null },
        today: null,
        startPreview: null,
        note: "Accepted, no reading stored yet: the horizon's unlit marks (no dawn, no dot), never an invented 0%, and no context.",
      };
    }
    case "horizon-self-reported": {
      const v = bodyView();
      return {
        view: v,
        intake: null,
        aim: aimFromView(v, "ACTIVE"),
        today: v.weekQuests,
        startPreview: null,
        note: "Proficiency from the user's ticks alone: the walked path dotted, 'from your ticks' beside the %; the front moves from the last-seen 30% (seen: horizon and meter at 30).",
        seen: seenSeedsOf(seenBasesOfRoadmap(v), [
          [SEEN_WHAT.horizon, 30],
          [SEEN_WHAT.proficiency, 30],
          [SEEN_WHAT.rank, 1],
          [SEEN_WHAT.reach, 1],
        ]),
      };
    }
    case "rebase-switched-off-seen-before": {
      const base = activeView();
      const today = "2026-12-23";
      const study = base.current!.measures[1];
      const v: RoadmapView = {
        ...base,
        today,
        proficiency: proficiency(
          0.3866,
          { cards: 0.52, practice: 0.05, milestones: 1 / 6 },
          1,
          6,
          { basisKey: FIXTURE_BASIS.v1SwitchedOff, change: { kind: "rebased", rebase: { on: "2026-12-21", from: 0.3602, cause: "SWITCHED_OFF", detail: "Backtest was switched off at Start" } } },
          today
        ),
        current: {
          ...base.current!,
          headline: fig(0, "tested by your reviews"),
          measures: [
            cardsRow({ figure: fig(21, "tested by your reviews"), gained: 0, pace: { kind: "on-pace", day: "2027-03-07", pipeline: 19, bestCase: false } }),
            { ...study, measureKey: "PRACTICE_KEPT|t:t-st|from:2026-12-21", target: 22, figure: fig(1, "from your ticks", "SELF") },
          ],
          stepDone: undefined,
          practiceKept: { "lp-st": { kept: 1, of: 2 } },
        },
        milestones: rowsActive().map((r) => (r.ord === 2 ? { ...r, percent: 0 } : r)),
        weekQuests: null,
        pastWeeks: [],
      };
      // What the viewer saw before the switch-off: the same acceptance day and version (v1), the old basis signature.
      const before: SeenBases = { ...seenBasesOfRoadmap(v)!, prof: `prof/${FIXTURE_BASIS.v1}` };
      return {
        view: v,
        intake: null,
        aim: aimFromView(v, "ACTIVE"),
        today: null,
        startPreview: null,
        note: "Backtest was switched off at Start (same version, same acceptance day, a new basis signature): 'Changed on Mon 21 Dec … (was 36%)', and nothing animates from the 36% seen before (D8).",
        seen: [
          ...seenSeedsOf(before, [
            [SEEN_WHAT.proficiency, 36],
            [SEEN_WHAT.horizon, 36],
          ]),
          ...rankReachSeen(v, 1, 1),
        ],
      };
    }
    case "capacity-calibrating": {
      const fx = rev4FixtureOf("draft-v4");
      const base = fx.view!;
      const unverified = (f: Feasibility): Feasibility => ({ ...f, milestones: f.milestones.map((m) => ({ ...m, time: { ...m.time, unverified: true } })) });
      const v: RoadmapView = {
        ...base,
        throughput: CALIBRATING_TP,
        feasibility: base.feasibility ? unverified(base.feasibility) : null,
        draft: base.draft ? { ...base.draft, feasibility: unverified(base.draft.feasibility) } : null,
      };
      return { ...fx, view: v, note: "The draft while tracked time and adherence calibrate: every verdict reads 'Unverified · …' with the dashed check, and the pass figure reads 'pass rate calibrating 12/30' with «best case»." };
    }
    case "since-line": {
      const fx = rev4FixtureOf("depth-realistic");
      const v = fx.view!;
      const bases = seenBasesOfRoadmap(v);
      const m0 = v.current!.measures[0];
      const wq = v.weekQuests!;
      return {
        ...fx,
        note: "Eight SEEN events pending after a long absence (more than six): none plays, each surface shows its end state, and one line names them: 'Since you last looked: …' (≤ 3 items, then '+ n more').",
        seen: seenSeedsOf(bases, [
          [SEEN_WHAT.rank, 0],
          [SEEN_WHAT.reach, 0],
          [SEEN_WHAT.proficiency, 20],
          [SEEN_WHAT.horizon, 20],
          [SEEN_WHAT.date, daySeenValue("2028-02-27")],
          [seenMeasureWhat(m0.measureKey), Math.max(0, Number(m0.figure?.value ?? 0) - 4)],
          [seenQuestWhat(wq.weekStart, 1), 0],
          [seenQuestWhat(wq.weekStart, 2), 0],
        ]),
      };
    }
    case "run-stale": {
      const fx = fixtureOf("running");
      const v = fx.view!;
      const run = { ...v.run!, stale: true };
      const aim: AimCardView & AimCardMotionFields = { ...fx.aim!, run: { startedAt: run.startedAt, stale: true } };
      return {
        view: { ...v, run },
        intake: null,
        aim,
        today: null,
        startPreview: null,
        note: "A draft run that timed out (stale): the weave stops and stays its static strands; the words say it stopped, never a %.",
      };
    }
    case "writes-off": {
      const v = activeView({ writesOff: true, proficiency: proficiency(0.4189, { cards: 0.55, practice: 0.23, milestones: 1 / 6 }, 1, 6, { live: true }), weekQuests: weekQuestsFixture({ writesOff: true, frozen: false }) });
      return {
        view: v,
        intake: null,
        aim: aimFromView(v, "ACTIVE"),
        today: v.weekQuests,
        startPreview: null,
        note: "A server that records nothing: «writes off» in the header, «not recorded here» beside the Aim card's live figure; the horizon still draws the figure on screen.",
      };
    }
  }
}
