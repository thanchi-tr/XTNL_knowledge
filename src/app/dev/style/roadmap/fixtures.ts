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
  practiceMinutesPerWeekOf,
  provenanceOf,
  type AimCardView,
  type AimRankName,
  type AimRankView,
  type DraftView,
  type EvidenceValue,
  type Feasibility,
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
  type StartPreview,
  type Throughput,
  type WeekQuestRow,
  type WeekQuestsView,
} from "@/lib/roadmap-types";
import { addDays } from "@/lib/life-day";
import { undecidedOf } from "@/components/roadmap/roadmap-ui-model";

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
] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

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

function proficiency(value: number, parts: ProficiencyView["parts"], reached: number, scheduled: number, p: Partial<ProficiencyView> = {}, today = TODAY): ProficiencyView {
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
      weekRow({ ord: 1, kind: "PRACTICE", label: "Easy runs · 3 sessions × 45 min", count: 3, unit: "session", figure: fig(1, "from your ticks", "SELF"), seekTemplateId: "t-run", place: "in Habits", href: "/today#t-t-run" }),
      weekRow({ ord: 2, kind: "PRACTICE", label: "Strength for knees and hips · 2 sessions × 30 min", count: 2, unit: "session", figure: fig(0, "from your ticks", "SELF"), seekTemplateId: "t-str", place: "in Habits", href: "/today#t-t-str" }),
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
  return out;
}

/** The Aim card as loadAimCard returns it without the fields derived on read: no acceptance day, no title class or struck spans. */
export function liveShapedAim(a: AimCardView): AimCardView {
  const out: AimCardView = { ...a, milestone: a.milestone ? { ...a.milestone } : null };
  delete out.acceptedDay;
  if (out.milestone) {
    delete out.milestone.titleClass;
    delete out.milestone.titleStruck;
  }
  return out;
}

function aimFromView(v: RoadmapView, state: AimCardView["state"]): AimCardView {
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
