/**
 * FIXTURES for /dev/style/today (L1). Every number here is made up and
 * labelled as such on the page; no real page imports this file.
 */
import { addDays, type DayKey } from "@/lib/life-day";
import { normTitleOf } from "@/lib/life-lexicon";
import { buildBoard, type BoardData, type BoardTemplate, type DayLedger } from "@/lib/today-board";
import { fullDayOf, type FullDay } from "@/lib/full-day";
// Type-only (erased): the fixture page builds the views with roadmap-quests' own pure view builder.
import type { WeekQuestsViewInput } from "@/lib/roadmap-quests";
import type { WeekQuestProgress, WeekQuestSet, WeekQuestSpec } from "@/lib/roadmap-types";

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

const setOf = (milestoneId: string, quests: WeekQuestSpec[]): WeekQuestSet => ({
  weekStart: Q_FROM,
  milestoneId,
  state: "OPEN",
  generator: 1,
  quests,
  basis: [],
  cappedBy: null,
});

/** Progress per quest, in ord order: done = progress ≥ count. */
const progressOf = (quests: readonly WeekQuestSpec[], counts: readonly number[]): WeekQuestProgress[] =>
  quests.map((q, i) => ({ ord: q.ord, progress: counts[i] ?? 0, count: q.count, done: (counts[i] ?? 0) >= q.count, slipped: null }));

const PLACES: Readonly<Record<string, string>> = {
  "rm-backtest": "in Habits",
  "rm-study": "in Habits",
  "rm-step": "in Anytime",
  "rm-runs": "in Habits",
  "rm-strength": "in Habits",
};

/** One week quests card state on /dev/style/today (F23: open, partial, all done, compact, writes off, practice-only). */
export interface QuestFixture {
  key: "open" | "partial" | "done" | "compact" | "writes-off" | "practice-only";
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
];

export const DAY_MORNING: FullDay = fullDayOf({ musts: { kept: 0, total: 3 }, quest: { reviews: 0, target: 17, dueNow: 17 }, lifeDeeds: 0 });
export const DAY_KEPT: FullDay = fullDayOf({ musts: { kept: 2, total: 3 }, quest: { reviews: 6, target: 17, dueNow: 11 }, lifeDeeds: 2 });
export const DAY_FULL: FullDay = fullDayOf({ musts: { kept: 3, total: 3 }, quest: { reviews: 15, target: 17, dueNow: 2 }, lifeDeeds: 3 });
export const DAY_AWAY: FullDay = fullDayOf({ musts: { kept: 0, total: 3 }, quest: { reviews: 0, target: 142, dueNow: 142 }, lifeDeeds: 0 });
