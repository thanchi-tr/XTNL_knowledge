/**
 * FIXTURES for /dev/style/today (L1). Every number here is made up and
 * labelled as such on the page; no real page imports this file.
 */
import { addDays, type DayKey } from "@/lib/life-day";
import { normTitleOf } from "@/lib/life-lexicon";
import { buildBoard, type BoardData, type BoardTemplate, type DayLedger } from "@/lib/today-board";
import { fullDayOf, type FullDay } from "@/lib/full-day";

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

/** A small board: three musts, two planned, one habit, two goals. */
export function fixtureBoardData(): BoardData {
  const t = FIXTURE_TODAY;
  const templates = [
    fixtureTemplate({ id: "meds", title: "Morning meds", compulsory: true, dueKind: "DEADLINE", dueDay: t, mvv: "take them", estMinutes: 5, machineMinutes: 5, band: "INTRO" }),
    fixtureTemplate({ id: "timesheet", title: "Submit timesheet", compulsory: true, dueKind: "DEADLINE", dueDay: addDays(t, -1), createdAt: "2026-05-01T00:00:00.000Z" }),
    fixtureTemplate({ id: "thesis", title: "Thesis: outline §3", track: "CRAFT", band: "DEMANDING", estMinutes: 45, machineMinutes: 45, dueKind: "PLANNED", dueDay: t }),
    fixtureTemplate({ id: "groceries", title: "Groceries", estMinutes: 20, machineMinutes: 20, dueKind: "PLANNED", dueDay: t }),
    fixtureTemplate({ id: "run-goal", title: "Run 10K under 55:00", kind: "GOAL", horizon: "MID", dueDay: "2026-11-30", krMetric: "CHILDREN" }),
    fixtureTemplate({ id: "read-goal", title: "Read 12 books", kind: "GOAL", horizon: "LONG", krMetric: "MANUAL", krTarget: 12, krUnit: "books" }),
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
    goalQty: { "read-goal": 5 },
    dueNow: 17,
  };
}

export const fixtureBoard = () => buildBoard(fixtureBoardData());

export const DAY_MORNING: FullDay = fullDayOf({ musts: { kept: 0, total: 3 }, quest: { reviews: 0, target: 17, dueNow: 17 }, lifeDeeds: 0 });
export const DAY_KEPT: FullDay = fullDayOf({ musts: { kept: 2, total: 3 }, quest: { reviews: 6, target: 17, dueNow: 11 }, lifeDeeds: 2 });
export const DAY_FULL: FullDay = fullDayOf({ musts: { kept: 3, total: 3 }, quest: { reviews: 15, target: 17, dueNow: 2 }, lifeDeeds: 3 });
export const DAY_AWAY: FullDay = fullDayOf({ musts: { kept: 0, total: 3 }, quest: { reviews: 0, target: 142, dueNow: 142 }, lifeDeeds: 0 });
