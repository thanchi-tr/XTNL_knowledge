/**
 * FIXTURES for /dev/style/today (L1). Every number here is made up and
 * labelled as such on the page; no real page imports this file.
 *
 * Roadmap revision 4 (lane T, F-R4-3) adds the aim line's states:
 * AIM_LINE_FIXTURES, each read by roadmap-invite's todayAimLineOf exactly as
 * src/app/today/page.tsx reads the real one (aimLineOfFixture).
 */
import { addDays, type DayKey } from "@/lib/life-day";
import { normTitleOf } from "@/lib/life-lexicon";
import { buildBoard, type BoardData, type BoardTemplate, type DayLedger } from "@/lib/today-board";
import { fullDayOf, type FullDay } from "@/lib/full-day";
// Type-only (erased): the fixture page builds the views with roadmap-quests' own pure view builder.
import type { WeekQuestsViewInput } from "@/lib/roadmap-quests";
// The pure key and name makers (client-importable): a part's measure key with its recall segment, and a Domain row's name.
import {
  cardsAtLevelKey,
  domainName,
  type AddQuestSpec,
  type AimLineView,
  type AimStep,
  type AimStepMilestone,
  type DomainName,
  type RaiseQuestSpec,
  type WeekQuestProgress,
  type WeekQuestSet,
  type WeekQuestSpec,
} from "@/lib/roadmap-types";
// The aim line's one rule (pure, client-importable, no clock): the page and these fixtures read it the same way.
// hideCookieValue: the cookie the /you LATER line's "Not now" writes (fix round, the HIDDEN prompt).
import { aimPromptOf, hideCookieValue, todayAimLineOf } from "@/lib/roadmap-invite";

export const FIXTURE_TODAY: DayKey = "2026-10-01";

export function fixtureTemplate(p: Partial<BoardTemplate> & { id: string; title: string }): BoardTemplate {
  return {
    normTitle: normTitleOf(p.title),
    recurrence: null,
    dueDay: null,
    dueKind: null,
    intrinsic: false,
    autoMetric: null,
    mvv: null,
    track: "DUTY",
    band: "STANDARD",
    bandOverride: 0,
    estMinutes: 30,
    machineMinutes: 30,
    kind: "TASK",
    inbox: false,
    startDay: addDays(FIXTURE_TODAY, -60),
    horizon: null,
    parentId: null,
    krMetric: null,
    krTarget: null,
    krUnit: null,
    compulsory: false,
    autoTarget: null,
    category: "OTHER",
    lexicalBand: "STANDARD",
    aiBand: null,
    gradeSource: "LEXICAL",
    gradeConfidence: 0.4,
    gradeBasis: null,
    gradeModel: null,
    gradePromptVersion: null,
    gradeAttempts: 1,
    gradeFrozen: true,
    sizing: false,
    bandOverrideAt: null,
    gradeFrozenAt: null,
    topAttribute: null,
    note: null,
    completedAt: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    sortOrder: 0,
    ...p,
  };
}

function ledger(day: DayKey): DayLedger {
  return { day, rawBefore: 0, lifeXp: 0, completions: [], reviews: 0, reviewXp: 0, ideas: 0, dayOpenQty: null };
}

/** A small board: three musts, two planned, one habit, three goals (one carried past its due day). */
export function fixtureBoardData(): BoardData {
  const t = FIXTURE_TODAY;
  const templates = [
    fixtureTemplate({ id: "meds", title: "Morning meds", compulsory: true, dueKind: "DEADLINE", dueDay: t, mvv: "take them", estMinutes: 5, machineMinutes: 5, band: "INTRO" }),
    fixtureTemplate({ id: "timesheet", title: "Submit timesheet", compulsory: true, dueKind: "DEADLINE", dueDay: addDays(t, -1), createdAt: "2026-05-01T00:00:00.000Z" }),
    fixtureTemplate({ id: "thesis", title: "Thesis: outline §3", track: "CRAFT", band: "DEMANDING", estMinutes: 45, machineMinutes: 45, dueKind: "PLANNED", dueDay: t }),
    fixtureTemplate({ id: "groceries", title: "Groceries", estMinutes: 20, machineMinutes: 20, dueKind: "PLANNED", dueDay: t }),
    fixtureTemplate({ id: "run-goal", title: "Run 10K under 55:00", kind: "GOAL", horizon: "MID", dueDay: "2026-11-30", krMetric: "CHILDREN" }),
    fixtureTemplate({ id: "read-goal", title: "Read 12 books", kind: "GOAL", horizon: "LONG", krMetric: "MANUAL", krTarget: 12, krUnit: "books" }),
    // Past its due day at 2 of 4: the card shows 'Carried 0.50 · Reschedule or close?' (launched).
    fixtureTemplate({ id: "garage-goal", title: "Clear out the garage", kind: "GOAL", horizon: "SHORT", krMetric: "MANUAL", krTarget: 4, krUnit: "shelves", dueDay: addDays(t, -3), goalMp: 1 }),
  ];
  return {
    today: t,
    yesterday: addDays(t, -1),
    capacityMin: 240,
    templates,
    instances: [],
    stats: {},
    ledger: { today: ledger(t), yesterday: ledger(addDays(t, -1)) },
    paid: {},
    goalQty: { "read-goal": 5, "garage-goal": 2 },
    dueNow: 17,
  };
}

export const fixtureBoard = () => buildBoard(fixtureBoardData());

// ── Roadmap on Today (lane T; roadmap.md F16 seams 3–4, F17, F23) ───────────
// Made-up data in the shapes the server sends. Nothing here reads the
// user's roadmap, and nothing calls a number-brand constructor: the page
// turns the week quest inputs into views with roadmap-quests'
// weekQuestsViewOf, the one builder every surface uses.

/**
 * A roadmap milestone's goal (krMetric ROADMAP) in five states: measured;
 * stated 0 for knowledge only; stated 0 because its lineage already paid
 * (the dropped original was unarchived and closed on 18 Sep, then this copy
 * started on 21 Sep); archived by a reset; and replaced by Start again
 * (roadmap-types isSupersededRow: this goal was unarchived after a newer
 * copy of its milestone started). The last two are never measured again:
 * "not measured · pays nothing", with the note.
 */
export function fixtureRoadmapBoardData(): BoardData {
  const t = FIXTURE_TODAY;
  const goal = (p: Partial<BoardTemplate> & { id: string; title: string }) =>
    fixtureTemplate({ kind: "GOAL", horizon: "MID", krMetric: "ROADMAP", track: "CRAFT", goalMp: 6, dueDay: "2026-11-29", createdAt: "2026-09-21T00:00:00.000Z", ...p });
  const templates = [
    goal({ id: "rm-goal", title: "Risk and position sizing", captureKey: "rm:ms-2" }),
    fixtureTemplate({ id: "rm-backtest", title: "Backtest", parentId: "rm-goal", recurrence: "TARGET:3/W", track: "CRAFT", estMinutes: 45, machineMinutes: 45, captureKey: "rm:ms-2:p0" }),
    // Its one step is ticked, so the tested cards set g (an open step would bind it at 0: 'from your ticks · slowest: 0 of 1 step').
    fixtureTemplate({ id: "rm-step", title: "Set a maximum daily loss", parentId: "rm-goal", track: "CRAFT", captureKey: "rm:ms-2:s0", completedAt: "2026-09-29T00:00:00.000Z" }),
    goal({ id: "rm-zero", title: "Probability foundations", goalMp: 0, captureKey: "rm:ms-z" }),
    goal({ id: "rm-paid", title: "Backtest the breakout rules", goalMp: 0, captureKey: "rm:ms-p" }),
    goal({ id: "rm-reset", title: "Inference basics", captureKey: "rm:ms-r" }),
    goal({ id: "rm-again", title: "Forward-testing on a demo account", captureKey: "rm:ms-a" }),
  ];
  // 09:12 and Wednesday 08:40, Sydney (AEST, +10).
  const at0912 = "2026-09-30T23:12:00.000Z";
  const wed0840 = "2026-09-29T22:40:00.000Z";
  return {
    ...fixtureBoardData(),
    templates,
    goalQty: {},
    roadmapGoals: {
      "rm-goal": {
        series: [
          { day: addDays(t, -1), g: 0.2, observedAt: wed0840, bindingClass: "MEASURED", bindingLabel: "cards at level 6+" },
          { day: t, g: 0.238, observedAt: at0912, bindingClass: "MEASURED", bindingLabel: "cards at level 6+" },
        ],
        ord: 2,
        of: 6,
        zeroReason: null,
        note: null,
      },
      "rm-zero": {
        series: [{ day: addDays(t, -1), g: 0.41, observedAt: wed0840, bindingClass: "MEASURED", bindingLabel: "cards at level 4+" }],
        ord: 1,
        of: 3,
        zeroReason: "knowledge is paid by reviews",
        note: null,
      },
      "rm-paid": {
        series: [{ day: t, g: 0.55, observedAt: at0912, bindingClass: "SELF_REPORTED", bindingLabel: "Backtest sessions" }],
        ord: 2,
        of: 6,
        zeroReason: "this milestone already paid on 18 Sep",
        note: null,
      },
      "rm-reset": { series: [], ord: 3, of: 6, zeroReason: null, note: "measures removed by a reset" },
      "rm-again": { series: [], ord: 4, of: 6, zeroReason: null, note: "replaced by Start again" },
    },
  };
}

export const fixtureRoadmapBoard = () => buildBoard(fixtureRoadmapBoardData());

/** The week of Mon 28 Sep – Sun 4 Oct 2026 (FIXTURE_TODAY is its Thursday). */
const Q_FROM: DayKey = "2026-09-28";
const Q_TO: DayKey = "2026-10-04";
const SCOPE = ["dom-position-sizing", "dom-risk-management"];

const CARD_QUESTS: WeekQuestSpec[] = [
  {
    ord: 1,
    kind: "RAISE",
    label: "Bring 3 cards in Risk Management or Position Sizing to level 6+",
    count: 3,
    unit: "card",
    evidence: "TESTED",
    from: Q_FROM,
    to: Q_TO,
    measureKey: `CARDS_AT_LEVEL|d:${SCOPE.join(",")}|L6`,
    domainIds: SCOPE,
    minLevel: 6,
    floor: 12,
    dueDays: ["2026-09-29", "2026-09-30", "2026-09-30", "2026-10-03"],
    bestCase: false,
  },
  {
    ord: 2,
    kind: "ADD",
    label: "Add 5 cards to Risk Management or Position Sizing",
    count: 5,
    unit: "card",
    evidence: "RECORDED",
    from: Q_FROM,
    to: Q_TO,
    domainIds: SCOPE,
    fieldId: "fld-trading",
    quotaField: { fieldId: "fld-trading", name: "Trading" },
    pace: 5,
    // Mon 28 Sep to Wed 4 Nov is 38 days with none held (roadmap-quests: |E ∩ (…, lastCardDay]| ÷ 7).
    writingWeeksLeft: 38 / 7,
    lastCardDay: "2026-11-04",
  },
  { ord: 3, kind: "PRACTICE", label: "Backtest · 3 sessions × 45 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-backtest", minutes: 45 },
  {
    ord: 4,
    kind: "PRACTICE",
    label: "Study Risk Management, Position Sizing · 2 sessions × 30 min",
    count: 2,
    unit: "session",
    evidence: "SELF_REPORTED",
    from: Q_FROM,
    to: Q_TO,
    templateId: "rm-study",
    minutes: 30,
  },
  { ord: 5, kind: "STEP", label: "Step: Set a maximum daily loss", count: 1, unit: "step", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-step", minutes: 30 },
];

const BODY_QUESTS: WeekQuestSpec[] = [
  { ord: 1, kind: "PRACTICE", label: "Easy runs · 3 sessions × 45 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-runs", minutes: 45 },
  { ord: 2, kind: "PRACTICE", label: "Strength for knees and hips · 2 sessions × 30 min", count: 2, unit: "session", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-strength", minutes: 30 },
];

const setOf = (milestoneId: string, quests: WeekQuestSpec[], generator = 1): WeekQuestSet => ({
  weekStart: Q_FROM,
  milestoneId,
  state: "OPEN",
  generator,
  quests,
  basis: [],
  cappedBy: null,
});

// Revision 4 (F-R4-14, generator 2): a depth plan's RAISE and ADD rows carry
// one part per Domain ("3 in Probability · 2 in Inference"); Today shows the
// first WEEK_QUEST_PARTS_TODAY and "+n more". Each part's measure is one
// Domain's, with the recall segment ('r'). The names are the parts' Domain
// rows' (DomainName), passed to the view builder as R6's domainNames.
const D_PROB = "dom-probability";
const D_INF = "dom-inference";
const D_RISK = "dom-risk-management";
export const PART_DOMAIN_NAMES: Readonly<Record<string, DomainName>> = {
  [D_PROB]: domainName({ id: D_PROB, name: "Probability" }),
  [D_INF]: domainName({ id: D_INF, name: "Inference" }),
  [D_RISK]: domainName({ id: D_RISK, name: "Risk Management" }),
};

/** A generator-2 RAISE row: parts [domainId, floor b0_d, count_d, due days]; count = Σ count_d. */
function raiseWithParts(level: number, parts: readonly (readonly [string, number, number, DayKey[]])[]): RaiseQuestSpec {
  const count = parts.reduce((s, [, , c]) => s + c, 0);
  const ids = parts.map(([d]) => d);
  return {
    ord: 1,
    kind: "RAISE",
    label: `Bring ${count} cards to level ${level}+`,
    count,
    unit: "card",
    evidence: "TESTED",
    from: Q_FROM,
    to: Q_TO,
    measureKey: cardsAtLevelKey(ids, level, "r"),
    domainIds: ids,
    minLevel: level,
    floor: parts.reduce((s, [, f]) => s + f, 0),
    dueDays: parts.flatMap(([, , , days]) => days).sort(),
    bestCase: false,
    parts: parts.map(([domainId, floor, c, dueDays]) => ({ domainId, measureKey: cardsAtLevelKey([domainId], level, "r"), floor, count: c, dueDays })),
  };
}

/** A generator-2 ADD row: parts [domainId, count_d]; count = Σ count_d (recall cards only). */
function addWithParts(parts: readonly (readonly [string, number])[]): AddQuestSpec {
  const count = parts.reduce((s, [, c]) => s + c, 0);
  return {
    ord: 2,
    kind: "ADD",
    label: `Add ${count} cards`,
    count,
    unit: "card",
    evidence: "RECORDED",
    from: Q_FROM,
    to: Q_TO,
    domainIds: parts.map(([d]) => d),
    fieldId: "fld-actuarial",
    quotaField: null,
    pace: count,
    writingWeeksLeft: 38 / 7,
    lastCardDay: "2026-11-04",
    parts: parts.map(([domainId, c]) => ({ domainId, count: c, pace: c, cappedBy: null })),
  };
}

const PARTS_QUESTS: WeekQuestSpec[] = [
  raiseWithParts(6, [
    [D_PROB, 12, 3, ["2026-09-29", "2026-09-30", "2026-10-02"]],
    [D_INF, 4, 2, ["2026-09-30", "2026-10-03"]],
  ]),
  addWithParts([
    [D_INF, 4],
    [D_RISK, 2],
  ]),
  { ord: 3, kind: "PRACTICE", label: "Recall drills: Probability, Inference · 3 sessions × 30 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-drills", minutes: 30 },
];

const PARTS_MORE_QUESTS: WeekQuestSpec[] = [
  raiseWithParts(8, [
    [D_PROB, 20, 3, ["2026-09-29", "2026-10-01", "2026-10-02"]],
    [D_INF, 9, 2, ["2026-09-30", "2026-10-03"]],
    [D_RISK, 5, 1, ["2026-10-01"]],
  ]),
  { ord: 2, kind: "PRACTICE", label: "Explain it in your own words: Probability, Inference and Risk Management · 2 sessions × 45 min", count: 2, unit: "session", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-explain", minutes: 45 },
];

/** A BODY plan with constraints: the starter's body-safe sessions (catalog names), each PRACTICE row with HEALTH_LINE under it (F-R4-13). */
const BODY_SAFE_QUESTS: WeekQuestSpec[] = [
  { ord: 1, kind: "PRACTICE", label: "Easy session · 3 sessions × 40 min", count: 3, unit: "session", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-easy", minutes: 40 },
  { ord: 2, kind: "PRACTICE", label: "Mobility session · 2 sessions × 20 min", count: 2, unit: "session", evidence: "SELF_REPORTED", from: Q_FROM, to: Q_TO, templateId: "rm-mobility", minutes: 20 },
];

/**
 * A generator-2 row's progress with its parts. `byDomain` holds each part's
 * gain over its floor (v_d − floor_d; '' for a row without parts), so
 * progress = Σ_d clamp(v_d − floor_d, 0, count_d), done when every part is.
 */
function partsProgressOf(q: WeekQuestSpec, byDomain: Readonly<Record<string, number>>): WeekQuestProgress {
  const parts = q.kind === "RAISE" || q.kind === "ADD" ? (q.parts ?? []) : [];
  if (parts.length === 0) {
    const progress = byDomain[""] ?? 0;
    return { ord: q.ord, progress, count: q.count, done: progress >= q.count, slipped: null };
  }
  const rows = parts.map((p) => {
    const progress = Math.max(0, Math.min(p.count, byDomain[p.domainId] ?? 0));
    return { domainId: p.domainId, progress, count: p.count, done: progress >= p.count };
  });
  const progress = rows.reduce((s, r) => s + r.progress, 0);
  return { ord: q.ord, progress, count: q.count, done: rows.every((r) => r.done), slipped: null, parts: rows };
}

/** Progress per quest, in ord order: done = progress ≥ count. */
const progressOf = (quests: readonly WeekQuestSpec[], counts: readonly number[]): WeekQuestProgress[] =>
  quests.map((q, i) => ({ ord: q.ord, progress: counts[i] ?? 0, count: q.count, done: (counts[i] ?? 0) >= q.count, slipped: null }));

const PLACES: Readonly<Record<string, string>> = {
  "rm-backtest": "in Habits",
  "rm-study": "in Habits",
  "rm-step": "in Anytime",
  "rm-runs": "in Habits",
  "rm-strength": "in Habits",
  "rm-drills": "in Habits",
  "rm-explain": "in Habits",
  "rm-easy": "in Habits",
  "rm-mobility": "in Habits",
};

/**
 * One week quests card state on /dev/style/today (F23: open, partial, all
 * done, compact, writes off, practice-only; revision 4, F-R4-13 and F-R4-14:
 * per-Domain parts, more parts than Today shows, and a BODY plan's
 * body-safe sessions with HEALTH_LINE).
 */
export interface QuestFixture {
  key: "open" | "partial" | "done" | "compact" | "writes-off" | "practice-only" | "parts" | "parts-more" | "body-health";
  title: string;
  /** The board's slot carries data-compact (Close the day prominent): the card is one line. */
  compact: boolean;
  input: WeekQuestsViewInput;
}

function questInput(p: { quests: WeekQuestSpec[]; counts: number[]; frozen?: boolean; writesOff?: boolean; level?: number | null; title?: string }): WeekQuestsViewInput {
  return {
    set: setOf("ms-2", p.quests),
    progress: progressOf(p.quests, p.counts),
    variant: "today",
    milestone: { ord: 2, of: 6, title: p.title ?? "Risk and position sizing" },
    level: p.level === undefined ? 6 : p.level,
    frozen: p.frozen ?? true,
    writesOff: p.writesOff ?? false,
    places: PLACES,
  };
}

/** A generator-2 week (revision 4): progress per Domain for the parted rows (by domainId), a plain count ('' key) for the rest. */
function questInputV2(p: { quests: WeekQuestSpec[]; progress: readonly Readonly<Record<string, number>>[]; level: number | null; ord: number; of: number; title: string; health?: boolean }): WeekQuestsViewInput {
  return {
    set: setOf(`ms-${p.ord}`, p.quests, 2),
    progress: p.quests.map((q, i) => partsProgressOf(q, p.progress[i] ?? {})),
    variant: "today",
    milestone: { ord: p.ord, of: p.of, title: p.title },
    level: p.level,
    frozen: true,
    writesOff: false,
    places: PLACES,
    domainNames: PART_DOMAIN_NAMES,
    health: p.health ?? false,
  };
}

export const QUEST_FIXTURES: readonly QuestFixture[] = [
  { key: "open", title: "Open · Monday, nothing done yet", compact: false, input: questInput({ quests: CARD_QUESTS, counts: [0, 0, 0, 0, 0] }) },
  { key: "partial", title: "Partial · Thursday", compact: false, input: questInput({ quests: CARD_QUESTS, counts: [1, 2, 1, 2, 0] }) },
  { key: "done", title: "All done · one collapsed line", compact: false, input: questInput({ quests: CARD_QUESTS, counts: [3, 5, 3, 2, 1] }) },
  { key: "compact", title: "Compact · the evening, Close the day prominent", compact: true, input: questInput({ quests: CARD_QUESTS, counts: [1, 2, 1, 2, 0] }) },
  { key: "writes-off", title: "Writes off · a dev server sharing the database", compact: false, input: questInput({ quests: CARD_QUESTS, counts: [1, 2, 1, 2, 0], frozen: false, writesOff: true }) },
  {
    key: "practice-only",
    title: "Practice-only plan · Body",
    compact: false,
    input: questInput({ quests: BODY_QUESTS, counts: [1, 0], level: null, title: "Run a sub-50 10K: base" }),
  },
  {
    key: "parts",
    title: "Parts · a depth plan's RAISE and ADD, one part per Domain (generator 2)",
    compact: false,
    input: questInputV2({
      quests: PARTS_QUESTS,
      progress: [{ [D_PROB]: 2, [D_INF]: 2 }, { [D_INF]: 1, [D_RISK]: 2 }, { "": 1 }],
      level: 6,
      ord: 2,
      of: 6,
      title: "Familiar: Probability and Inference to level 6+",
    }),
  },
  {
    key: "parts-more",
    title: "Parts · three Domains: Today shows two and “+1 more”",
    compact: false,
    input: questInputV2({
      quests: PARTS_MORE_QUESTS,
      progress: [{ [D_PROB]: 1, [D_INF]: 0, [D_RISK]: 1 }, { "": 0 }],
      level: 8,
      ord: 3,
      of: 6,
      title: "Retained: Probability, Inference and Risk Management to level 8+",
    }),
  },
  {
    key: "body-health",
    title: "Body plan with constraints · body-safe sessions, each with the health line",
    compact: false,
    input: questInputV2({
      quests: BODY_SAFE_QUESTS,
      progress: [{ "": 1 }, { "": 0 }],
      level: null,
      ord: 2,
      of: 5,
      title: "Run a sub-50 10K · stage 2 of 5",
      health: true,
    }),
  },
];

// ── Today's aim line (lane T; roadmap-rev4.md F-R4-3) ───────────────────────
// Made-up AimSteps (R4's loadAimStep shape) and cookies, read by the same
// rule the page reads (roadmap-invite todayAimLineOf, with the prompt from
// aimPromptOf), so every state is the rule's own answer. The days are in
// 2027, after any plausible AIM_INVITE_SINCE (the back-off's floor: the
// deploy day, Tue 6 Oct 2026 as lane 0 set it, or later if the lead moves
// it), so the floor never moves an anchor here.

/** Mon 8 Mar 2027: a Monday, not a 1st. */
export const AIM_MON: DayKey = "2027-03-08";
/** Thu 1 Apr 2027: the 1st, not a Monday. */
export const AIM_FIRST: DayKey = "2027-04-01";
const AIM_EPOCH: DayKey = "2026-08-01";

/** A "Not now" given 31 days before `today`: its 28 days ended 3 days ago, so the ask began again then. */
const nowAgainSince3 = (today: DayKey) => `later:${addDays(today, -31)}`;

function aimStepOf(today: DayKey, over: Partial<AimStep> = {}): AimStep {
  return { open: null, lastDoneDay: null, lastClosedDay: null, epochDay: AIM_EPOCH, lastOpenBefore: addDays(today, -1), aimSuggestions: null, ...over };
}

function aimMilestone(p: Partial<AimStepMilestone> & Pick<AimStepMilestone, "id" | "ord" | "state">): AimStepMilestone {
  return { stage: null, gateLevel: null, rankIndex: null, reachedDay: null, held: false, closedDay: null, dueDay: addDays(AIM_MON, 120), ...p };
}

/**
 * A ladder's rows: [stage, gate level, rankIndex, held when you began?], in
 * ord order. The rank indices are written out as data; today-ui-check pins
 * each against the contract's rankIndexForStage(stage, gate level, depth)
 * (a track plan's k-th stage ranks k).
 */
type AimLadder = readonly (readonly [AimStepMilestone["stage"], number | null, number, boolean?])[];
/** A depth plan's first stages (Foundation, Familiar, Retained). */
const LADDER_FIELD: AimLadder = [
  ["FOUNDATION", 4, 1],
  ["FAMILIAR", 6, 2],
  ["RETAINED", 8, 3],
];
/** The spec pack's ladder (contracts §14.5: L6, L8, L10, L11, L12 → ranks 2, 3, 4, 4, 5). */
const LADDER_PACK: AimLadder = [
  ["FAMILIAR", 6, 2],
  ["RETAINED", 8, 3],
  ["FLUENT", 10, 4],
  ["BETWEEN", 11, 4],
  ["MASTERED", 12, 5],
];
/**
 * The spec's new learner (Acceptance, "When realistic": Familiar part 1,
 * Familiar, Retained, Fluent, Toward Mastered, Mastered, ranked [2, 2, 3, 4,
 * 4, 5]). Its first milestone is the count gate (PART), so Today's START line
 * is the longest it gets: "Milestone 1 · Familiar, part 1 is ready to start.
 * Reaching it gives the Aim rank Journeyman." (≤ 72 px at 344: ui-audit).
 */
const LADDER_LEARNER: AimLadder = [
  ["PART", 6, 2],
  ["FAMILIAR", 6, 2],
  ["RETAINED", 8, 3],
  ["FLUENT", 10, 4],
  ["BETWEEN", 11, 4],
  ["MASTERED", 12, 5],
];
/**
 * A library already holding Fluent, aimed at Mastered (lens 2, the fix
 * round's PART at the depth): four stages held when you began (they give no
 * rank), then a count gate toward level 12 itself. Its target can be n − 1
 * cards counted with retry entries, so it gives Fluent's Expert, never
 * Mastered's Virtuoso before the depth is held (rankIndexForStage with the
 * depth); Mastered then gives Virtuoso.
 */
const LADDER_HELD_FLUENT: AimLadder = [
  ["FOUNDATION", 4, 1, true],
  ["FAMILIAR", 6, 2, true],
  ["RETAINED", 8, 3, true],
  ["FLUENT", 10, 4, true],
  ["PART", 12, 4],
  ["MASTERED", 12, 5],
];
/** A track plan's stages: the k-th kept stage ranks k. */
const LADDER_TRACK: AimLadder = [
  ["STAGE_1", null, 1],
  ["STAGE_2", null, 2],
  ["STAGE_3", null, 3],
];

/** The ladders the START states read, with their depth (null: a track plan), for today-ui-check's rank pin. */
export const AIM_LADDERS: Readonly<Record<"field" | "pack" | "learner" | "held-fluent" | "track", { depth: 8 | 10 | 12 | null; rows: AimLadder }>> = {
  field: { depth: 12, rows: LADDER_FIELD },
  pack: { depth: 12, rows: LADDER_PACK },
  learner: { depth: 12, rows: LADDER_LEARNER },
  "held-fluent": { depth: 12, rows: LADDER_HELD_FLUENT },
  track: { depth: null, rows: LADDER_TRACK },
};

/**
 * An accepted plan whose milestones before `nextOrd` were reached, the last
 * of them yesterday (Monday): milestone `nextOrd` is ready from Tuesday.
 * When nothing before it was reached inside the plan (the first milestone,
 * or only rows held when you began), the plan was accepted on Monday, so
 * Tuesday is its first ready day too. A held row reads as R4's loadAimStep
 * gives it: CLOSED, held, reached and closed on the acceptance day.
 */
function readyPlan(ladder: AimLadder, nextOrd: number, track = false): AimStep {
  const today = addDays(AIM_MON, 1);
  const reachedInPlan = ladder.some(([, , , held], i) => i + 1 < nextOrd && !held);
  const accepted = reachedInPlan ? addDays(AIM_MON, -120) : AIM_MON;
  return aimStepOf(today, {
    open: {
      kind: "ACTIVE",
      roadmapId: "rm-fx",
      track,
      acceptedDay: accepted,
      milestones: ladder.map(([stage, gateLevel, rankIndex, held], i) => {
        const ord = i + 1;
        if (held) return aimMilestone({ id: `ms-${ord}`, ord, state: "CLOSED", stage, gateLevel, rankIndex, held: true, reachedDay: accepted, closedDay: accepted });
        const reached = ord < nextOrd ? addDays(AIM_MON, -(nextOrd - 1 - ord) * 30) : null;
        return aimMilestone({ id: `ms-${ord}`, ord, state: reached ? "CLOSED" : "PLANNED", stage, gateLevel, rankIndex, reachedDay: reached, closedDay: reached });
      }),
    },
  });
}

/** What the rule gives: SET with its variant, DRAFT, START, or null (nothing on Today). */
export type AimLineKind = "SET WEEK" | "SET MONTH" | "SET BACK" | "SET NEXT" | "DRAFT" | "START" | null;

/**
 * One aim line state on /dev/style/today (F-R4-3): SET WEEK, MONTH, BACK and
 * NEXT, backed off, hidden by the /you line's "Not now", DRAFT, START (the
 * longest line, a count gate's, and a count gate at the depth after held
 * stages) and compact.
 */
export interface AimLineFixture {
  key:
    | "set-week"
    | "set-month"
    | "set-back"
    | "set-next"
    | "backed-off"
    | "backed-off-first"
    | "hidden"
    | "draft"
    | "start"
    | "start-keeps"
    | "start-track"
    | "start-part"
    | "start-part-depth"
    | "compact"
    | "compact-clear";
  title: string;
  today: DayKey;
  step: AimStep;
  /**
   * AIM_PROMPT_COOKIE's value ('later:<day>' from the ASK card's or Today's
   * "Not now", 'hide:<day>' from the /you LATER line's, 'on:<day>' or the
   * legacy 'off'): the prompt and the back-off's anchor.
   */
  cookie?: string;
  /** AIM_STEP_COOKIE's value (a DRAFT or START line hidden for a week). */
  stepCookie?: string;
  /** ROADMAP_GOALS_LIVE as the state assumes it (START needs it on; it ships false). */
  goalsLive: boolean;
  /** The evening: the board's slot carries data-compact (Close the day prominent). */
  compact: boolean;
  /** Close the day has something to close: the page's .rm-aim-slot carries data-close-due. With compact, the line hides. */
  closeDue: boolean;
  expect: AimLineKind;
}

export const AIM_LINE_FIXTURES: readonly AimLineFixture[] = [
  {
    key: "set-week",
    title: "SET · a new week · Mon 8 Mar, no aim, a “Not now” ended on Friday",
    today: AIM_MON,
    step: aimStepOf(AIM_MON),
    cookie: nowAgainSince3(AIM_MON),
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: "SET WEEK",
  },
  {
    key: "set-month",
    title: "SET · a new month · Thu 1 Apr, no aim",
    today: AIM_FIRST,
    step: aimStepOf(AIM_FIRST),
    cookie: nowAgainSince3(AIM_FIRST),
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: "SET MONTH",
  },
  {
    key: "set-back",
    title: "SET · welcome back · Thu 11 Mar, the first open since Tue 2 Mar",
    today: addDays(AIM_MON, 3),
    step: aimStepOf(addDays(AIM_MON, 3), { lastOpenBefore: addDays(AIM_MON, -6) }),
    cookie: nowAgainSince3(addDays(AIM_MON, 3)),
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: "SET BACK",
  },
  {
    key: "set-next",
    title: "SET · the next aim · Mon 8 Mar, the last aim was done 10 days ago",
    today: AIM_MON,
    step: aimStepOf(AIM_MON, { lastDoneDay: addDays(AIM_MON, -10), lastClosedDay: addDays(AIM_MON, -10) }),
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: "SET NEXT",
  },
  {
    key: "backed-off",
    title: "Backed off · Mon 8 Mar, five fresh-start days since the switch went on, no answer: nothing on Today",
    today: AIM_MON,
    step: aimStepOf(AIM_MON),
    cookie: `on:${addDays(AIM_MON, -35)}`,
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: null,
  },
  {
    key: "backed-off-first",
    title: "Backed off · the next 1st (Thu 1 Apr) still shows the month's line",
    today: AIM_FIRST,
    step: aimStepOf(AIM_FIRST),
    cookie: `on:${addDays(AIM_MON, -35)}`,
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: "SET MONTH",
  },
  {
    // The fix round's HIDDEN prompt (roadmap-invite): the × on /you's LATER line, and (fix round 2) the × on
    // Today's SET line, says "Not now: no aim suggestions for 4 weeks" and writes 'hide:', so Today keeps quiet
    // too, even on the 1st, where a backed-off ask still asks.
    key: "hidden",
    title: "Hidden · Thu 1 Apr, 10 days after “Not now” on the /you line or Today’s SET line (“no aim suggestions for 4 weeks”): nothing on Today, not even on the 1st",
    today: AIM_FIRST,
    step: aimStepOf(AIM_FIRST),
    cookie: hideCookieValue(addDays(AIM_FIRST, -10)),
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: null,
  },
  {
    key: "draft",
    title: "DRAFT · Tue 9 Mar, a draft last saved yesterday",
    today: addDays(AIM_MON, 1),
    step: aimStepOf(addDays(AIM_MON, 1), { open: { kind: "DRAFT", roadmapId: "rm-fx", savedDay: AIM_MON, running: false } }),
    goalsLive: false,
    compact: false,
    closeDue: false,
    expect: "DRAFT",
  },
  {
    key: "start",
    title: "START · Tue 9 Mar, milestone 2 · Familiar ready (as once ROADMAP_GOALS_LIVE is on)",
    today: addDays(AIM_MON, 1),
    step: readyPlan(LADDER_FIELD, 2),
    goalsLive: true,
    compact: false,
    closeDue: false,
    expect: "START",
  },
  {
    key: "start-keeps",
    title: "START · milestone 4 · Toward Mastered, after Fluent: it keeps your rank",
    today: addDays(AIM_MON, 1),
    step: readyPlan(LADDER_PACK, 4),
    goalsLive: true,
    compact: false,
    closeDue: false,
    expect: "START",
  },
  {
    key: "start-track",
    title: "START · a track plan's milestone 2: no stage is named",
    today: addDays(AIM_MON, 1),
    step: readyPlan(LADDER_TRACK, 2, true),
    goalsLive: true,
    compact: false,
    closeDue: false,
    expect: "START",
  },
  {
    key: "start-part",
    title: "START · a new learner's milestone 1 · Familiar, part 1 (the count gate): the longest START line, ≤ 3 lines at 344",
    today: addDays(AIM_MON, 1),
    step: readyPlan(LADDER_LEARNER, 1),
    goalsLive: true,
    compact: false,
    closeDue: false,
    expect: "START",
  },
  {
    key: "start-part-depth",
    title: "START · a library holding Fluent, aimed at Mastered: milestone 5 · Mastered, part 1 gives Expert (never Virtuoso before the depth is held); the four held stages give no rank",
    today: addDays(AIM_MON, 1),
    step: readyPlan(LADDER_HELD_FLUENT, 5),
    goalsLive: true,
    compact: false,
    closeDue: false,
    expect: "START",
  },
  {
    key: "compact",
    title: "Compact · the evening, 2 still open to close: the line hides",
    today: AIM_MON,
    step: aimStepOf(AIM_MON),
    cookie: nowAgainSince3(AIM_MON),
    goalsLive: false,
    compact: true,
    closeDue: true,
    expect: "SET WEEK",
  },
  {
    key: "compact-clear",
    title: "Compact · the evening, nothing left open: the line stays",
    today: AIM_MON,
    step: aimStepOf(AIM_MON),
    cookie: nowAgainSince3(AIM_MON),
    goalsLive: false,
    compact: true,
    closeDue: false,
    expect: "SET WEEK",
  },
];

/** The fixture's line, read exactly as src/app/today/page.tsx reads the real one. */
export function aimLineOfFixture(f: AimLineFixture): AimLineView | null {
  return todayAimLineOf({
    step: f.step,
    prompt: aimPromptOf(f.cookie, f.step.aimSuggestions ?? null, f.today),
    cookie: f.cookie,
    stepCookie: f.stepCookie,
    today: f.today,
    goalsLive: f.goalsLive,
  });
}

/** "SET WEEK", "DRAFT", "START" or null: what a fixture's line is. */
export function aimLineKindOf(v: AimLineView | null): AimLineKind {
  if (!v) return null;
  return v.kind === "SET" ? `SET ${v.variant}` : v.kind;
}

export const DAY_MORNING: FullDay = fullDayOf({ musts: { kept: 0, total: 3 }, quest: { reviews: 0, target: 17, dueNow: 17 }, lifeDeeds: 0 });
export const DAY_KEPT: FullDay = fullDayOf({ musts: { kept: 2, total: 3 }, quest: { reviews: 6, target: 17, dueNow: 11 }, lifeDeeds: 2 });
export const DAY_FULL: FullDay = fullDayOf({ musts: { kept: 3, total: 3 }, quest: { reviews: 15, target: 17, dueNow: 2 }, lifeDeeds: 3 });
export const DAY_AWAY: FullDay = fullDayOf({ musts: { kept: 0, total: 3 }, quest: { reviews: 0, target: 142, dueNow: 142 }, lifeDeeds: 0 });
