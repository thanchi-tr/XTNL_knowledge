/**
 * The Aim card's states for /dev/style/art/you (roadmap.md F16 seam 18, F23;
 * lane Y), drawn from FIXTURES: the numbers are made up and no real page ever
 * shows them. Pure: no database, no clock (today is passed in), no model.
 *
 * Every branded figure comes through the roadmap's own pure view builders
 * (roadmap-proficiency.ts proficiencyViewOf and aimRankOf, roadmap-measures.ts
 * milestoneHeadlineOf), never a brand constructor, so a fixture can show only
 * what those builders would show for the same stored readings. Until a
 * builder lands it throws "Not yet: …", and the page shows that in place of
 * the card. The stored readings follow the spec's worked example (F12): a
 * Field Area with one end target of 46 cards at level 8 over two Domains,
 * one practice planned for 72 sessions, and six milestones.
 *
 * The fix rounds' rules are applied the way R4's loaders apply them, through
 * lane 0's and R3's helpers, never restated here:
 *   - the plan's milestones are counted by place (one per lineage), so a
 *     dropped milestone and its "Start again" copy count once
 *     (maxScheduledPositionsOf feeds aimRankOf's maxScheduled);
 *   - a started milestone's due day is its goal's (milestoneDueDayOf), so a
 *     Reschedule shows;
 *   - a milestone title's class is provenanceOf(origin, decision), and a
 *     Gemini title's numbers are struck (titleStruck) by R3's
 *     withLabelChecks over the plan's intake, the derivation R4 uses on read;
 *   - ACCEPTED means no milestone was ever carried: between milestones the
 *     card is ACTIVE with the next one's Start line;
 *   - draftItems is draftNeedsOf(the next milestone).length, the review
 *     footer's count: never a syllabus topic, a row the user wrote, a named
 *     placeholder or a removed row;
 *   - acceptedDay is the current version's acceptance day on every card
 *     after acceptance, so ACCEPTED's "as measured at acceptance" holds only
 *     for a reading of that day (isAcceptanceReading).
 * Every fact is possible on its own today: nothing is measured after today,
 * an on-pace day is never after the due day, a Start line never offers the
 * rank already held (you-check holds each fixture to these).
 *
 * The states: empty, running, draft waiting, accepted (the acceptance
 * reading), accepted days ago (today's reading), active (on pace, week
 * quests 2 of 5), a re-plan waiting, between milestones (the next title
 * still Gemini's, its number struck), a reach waiting on ticks, a new Aim
 * rank, Proficiency fallen, Proficiency changed by a re-plan, a "Start
 * again" copy whose milestone already paid, no reading yet (writes off),
 * past due, and done (a three-milestone Body plan, one of its milestones
 * started again).
 */
import { addDays, weekStartKeyOf, zonedToInstant, type DayKey } from "@/lib/life-day";
import { GOAL_RULES } from "@/lib/life-economy";
import { milestoneHeadlineOf, type MilestoneG } from "@/lib/roadmap-measures";
import { aimRankOf, proficiencyViewOf, type ProficiencyDetailR1, type ProficiencyDomainFacts, type RankMilestone } from "@/lib/roadmap-proficiency";
import {
  LEVEL_WEIGHT,
  PROFICIENCY_VERSION,
  PROFICIENCY_WEIGHTS,
  REACH_CONFIRM_DAYS,
  aimRankName,
  cardsAtLevelKey,
  draftNeedsOf,
  maxScheduledPositionsOf,
  milestoneDueDayOf,
  proficiencyKey,
  provenanceOf,
  rankIndexAt,
  type AimCardMilestone,
  type AimCardState,
  type AimCardView,
  type AreaChip,
  type Decision,
  type ItemDraft,
  type ItemKind,
  type MilestoneDraft,
  type MilestoneStatus,
  type Origin,
  type PositionRow,
  type ProficiencyBasis,
  type ProficiencyParts,
  type ProficiencyRebase,
  type Reading,
} from "@/lib/roadmap-types";
import { labelBaseFor, withLabelChecks, type LabelBase } from "@/lib/roadmap-validate";

export type AimFixtureKey =
  | "empty"
  | "running"
  | "draft"
  | "accepted"
  | "accepted-later"
  | "active"
  | "replan-waiting"
  | "between"
  | "pending-reach"
  | "new-rank"
  | "fallen"
  | "replan"
  | "paid-lineage"
  | "no-reading"
  | "past-due"
  | "done";

export interface AimFixture {
  key: AimFixtureKey;
  /** The fixture's name on the page ("Active · on pace"). */
  label: string;
  /** What the fixture shows, in a line. */
  note: string;
  /** What the card must say about it (you-check holds the built view to these). */
  expect: { state: AimCardState; percent: number | null; rank: string | null; change: "fall" | "rebased" | null };
  /** The plan's milestone rows its Aim rank was read from (maxScheduledPositionsOf), when a fixture has a rank. */
  rows?: readonly PositionRow[];
  build: () => AimCardView;
}

// ─── The two plans ──────────────────────────────────────────────────────────

const TRADING_AREA: AreaChip = { kind: "FIELD", fieldId: "fx-field-trading", name: "Trading", level: 6 };
const BODY_AREA: AreaChip = { kind: "TRACK", track: "BODY" };

const TRADING = {
  roadmapId: "fx-roadmap-trading",
  aim: "Become a consistently profitable systematic EUR/USD trader by 2028",
  domainIds: ["fx-domain-risk", "fx-domain-psych"],
  level: 8,
  target: 46,
  lineage: "fx-lineage-backtest",
  planned: 72,
  titles: ["Backtests that hold up", "Risk and position sizing", "Execution rules", "Live trading, small size", "Review and refine", "Scale with discipline"],
  /** The intake's syllabus: two lines the user added as topics ("Not in this plan yet"). */
  syllabus: ["Drawdown and recovery", "Position sizing basics"],
} as const;

/**
 * Milestone 2's title as Gemini wrote it in the "between" state, still
 * undecided (outline titles are decided at Start): R3's check flags its
 * "1%" as NUMBER, so the card strikes it, never rewrites it.
 */
export const TITLE_WITH_NUMBER = "Risk at 1% per trade";

const BODY = {
  roadmapId: "fx-roadmap-run",
  aim: "Run 10 km in under 50 minutes",
  lineage: "fx-lineage-intervals",
  planned: 48,
  milestones: 3,
} as const;

const CARD_KEY = cardsAtLevelKey(TRADING.domainIds, TRADING.level);
/** The end target's two Domains: names, cards in scope, and each one's share of the depth (the fall's cause names them). */
const TRADING_DOMAINS = [
  { id: "fx-domain-risk", name: "Risk Management", n: 36, share: 0.56 },
  { id: "fx-domain-psych", name: "Market Psychology", n: 25, share: 0.44 },
] as const;
const MILESTONE_CARD_KEY = cardsAtLevelKey(["fx-domain-risk"], 6);

/** What every label of the trading plan is checked against (R3's labelBaseFor: the aim, the syllabus, the Area's name and the Domains' names), as R4 reads titles back. */
export const TRADING_LABEL_BASE: LabelBase = labelBaseFor(
  { aim: TRADING.aim, constraints: null, examLabel: null, syllabus: { lines: [...TRADING.syllabus], source: null }, track: "CRAFT" },
  "Trading",
  TRADING_DOMAINS.map((d) => d.name)
);

/** A milestone row as R4 stores it, for the position helpers (one per place; a "Start again" copy is a newer row of the same lineage). */
function row(plan: string, ord: number, status: PositionRow["status"], createdAt: number, copy = false): PositionRow {
  return { id: `${plan}-ms-${ord}${copy ? "-again" : ""}`, lineageId: `${plan}-lineage-${ord}`, version: 1, status, rankIndex: rankIndexAt(ord), createdAt };
}

/**
 * The trading plan's six rows: milestone 1 STARTED (its goal closed when it
 * was reached), milestone 2 as each fixture has it, the rest PLANNED.
 * `again` adds milestone 2's "Start again" copy (a newer row, the same
 * lineage and place).
 */
export function tradingRows(ms2: PositionRow["status"] = "STARTED", again: PositionRow["status"] | null = null): PositionRow[] {
  const rows = TRADING.titles.map((_, i) => row("fx-trading", i + 1, i === 0 ? "STARTED" : i === 1 ? ms2 : "PLANNED", 1));
  if (again) rows.push(row("fx-trading", 2, again, 2, true));
  return rows;
}

/** The Body plan's rows: three milestones, the second dropped and started again (its copy STARTED, so it replaces the dropped row). */
export const BODY_ROWS: readonly PositionRow[] = [
  row("fx-run", 1, "STARTED", 1),
  row("fx-run", 2, "STARTED", 1),
  row("fx-run", 2, "STARTED", 2, true),
  row("fx-run", 3, "STARTED", 1),
];

/** Milestone 2's due days, in days from today: as planned, and its goal's after a Reschedule on Today (the one the card shows). */
export const MILESTONE2_DUE = { planned: 40, goal: 47 } as const;

/** A draft row as the validator and the editor hand it on (roadmap-types ItemDraft); a fixture sets only what it shows. */
function draftItem(milestone: string, n: number, kind: ItemKind, label: string, origin: Origin, decision: Decision, extra: Partial<ItemDraft> = {}): ItemDraft {
  return {
    id: `${milestone}-item-${n}`,
    lineageId: `${milestone}-item-lineage-${n}`,
    kind,
    ord: n,
    label,
    rawLabel: origin === "GEMINI" ? label : null,
    origin,
    decision,
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
    addToToday: false,
    templateId: null,
    flags: [],
    notes: [],
    ...extra,
  };
}

/** A milestone row as R4 hands it to lane 0's and R3's helpers (roadmap-types MilestoneDraft). */
function draftMilestone(id: string, version: number, ord: number, title: string, titleOrigin: Origin, titleDecision: Decision, status: MilestoneStatus, items: ItemDraft[] = []): MilestoneDraft {
  return { id, lineageId: `${id}-lineage`, version, ord, title, titleOrigin, titleDecision, windowStart: null, dueDay: null, status, rankIndex: rankIndexAt(ord), overAccepted: false, items, measures: [], notes: [] };
}

/**
 * The waiting draft's next milestone (milestone 1), row by row. The card's
 * "· n items" is draftNeedsOf(this).length, the review footer's count: the
 * Domain to decide, the proposed Domain to map, the practice and the step
 * to decide, and the checkpoint's bar. Never the syllabus topics the user
 * added, the step they wrote or the one they removed, and never the
 * outline's rows (decided at Start). (A placeholder practice is the
 * starter's, written by roadmap-realism alone; lane 0's contract check pins
 * that a named one needs nothing.)
 */
export const DRAFT_NEXT: MilestoneDraft = draftMilestone("fx-draft-ms-1", 1, 1, TRADING.titles[0], "GEMINI", "KEPT", "DRAFT", [
  draftItem("fx-draft-ms-1", 0, "DOMAIN", "Risk Management", "GEMINI", "PENDING", { domainId: "fx-domain-risk" }),
  draftItem("fx-draft-ms-1", 1, "DOMAIN", "Backtesting Methods", "GEMINI", "PENDING", { proposedName: "Backtesting Methods" }),
  draftItem("fx-draft-ms-1", 2, "TOPIC", TRADING.syllabus[0], "SYLLABUS", "PENDING", { syllabusRef: 0, domainId: "fx-domain-risk" }),
  draftItem("fx-draft-ms-1", 3, "TOPIC", TRADING.syllabus[1], "SYLLABUS", "PENDING", { syllabusRef: 1, domainId: "fx-domain-risk" }),
  draftItem("fx-draft-ms-1", 4, "PRACTICE", "Replay a week of charts", "GEMINI", "PENDING"),
  draftItem("fx-draft-ms-1", 5, "STEP", "Choose a backtesting tool", "GEMINI", "KEPT"),
  draftItem("fx-draft-ms-1", 6, "STEP", "Write the entry rules down", "GEMINI", "PENDING"),
  draftItem("fx-draft-ms-1", 7, "STEP", "List what broke last month", "USER", "EDITED"),
  draftItem("fx-draft-ms-1", 8, "STEP", "Read a trading forum daily", "GEMINI", "REMOVED"),
  draftItem("fx-draft-ms-1", 9, "CHECKPOINT", "Rules checklist", "GEMINI", "KEPT"),
]);

/** A pending re-plan's next milestone (the first one it changes, milestone 3 of version 2): its Domain and two steps to decide, never the syllabus topic. */
export const REPLAN_NEXT: MilestoneDraft = draftMilestone("fx-replan-ms-3", 2, 3, TRADING.titles[2], "GEMINI", "KEPT", "DRAFT", [
  draftItem("fx-replan-ms-3", 0, "DOMAIN", "Market Psychology", "GEMINI", "PENDING", { domainId: "fx-domain-psych" }),
  draftItem("fx-replan-ms-3", 1, "TOPIC", TRADING.syllabus[0], "SYLLABUS", "PENDING", { syllabusRef: 0, domainId: "fx-domain-psych" }),
  draftItem("fx-replan-ms-3", 2, "STEP", "Set a daily loss limit", "GEMINI", "PENDING"),
  draftItem("fx-replan-ms-3", 3, "STEP", "Trade only the planned setups", "GEMINI", "PENDING"),
]);

/**
 * A trading milestone's title as R4 reads it back: its class
 * (provenanceOf), and, for Gemini's words, the NUMBER spans R3's
 * withLabelChecks derives over the plan's intake (MilestoneDraft.titleStruck,
 * which AimCardMilestone.titleStruck repeats).
 */
function titleOf(ord: number, title: string, decision: Decision): Pick<AimCardMilestone, "title" | "titleClass" | "titleStruck"> {
  const [checked] = withLabelChecks([draftMilestone(`fx-milestone-${ord}`, 1, ord, title, "GEMINI", decision, "PLANNED")], TRADING_LABEL_BASE, TRADING_SCHEDULED);
  const struck = checked?.titleStruck ?? [];
  return { title, titleClass: provenanceOf("GEMINI", decision), ...(struck.length > 0 ? { titleStruck: struck } : {}) };
}

/** An ISO instant at hh:mm on a life day, in the life zone ("measured 09:12"). */
function at(day: DayKey, hour: number, minute = 0): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(zonedToInstant(y, m, d, hour).getTime() + minute * 60_000).toISOString();
}

/** PROFICIENCY_WEIGHTS renormalised over the parts present (F12). */
function sharesOf(parts: ProficiencyParts): ProficiencyParts {
  const keys = ["cards", "practice", "milestones"] as const;
  const total = keys.reduce((s, k) => s + (parts[k] == null ? 0 : PROFICIENCY_WEIGHTS[k]), 0);
  const share = (k: (typeof keys)[number]) => (parts[k] == null || total === 0 ? null : PROFICIENCY_WEIGHTS[k] / total);
  return { cards: share("cards"), practice: share("practice"), milestones: share("milestones") };
}

interface ReadingInput {
  roadmapId: string;
  day: DayKey;
  observedAt: string;
  basis: ProficiencyBasis;
  parts: ProficiencyParts;
  /** Cards in the end target's scope (the fall's cause reads it). */
  inScope: number;
  reached: number;
  reachedOnTicks: boolean;
  rebased?: ProficiencyRebase | null;
}

/** A stored PROFICIENCY reading as R1's writers store it: value = Σ share × part, detail per F12 (with R1's byDomain facts). */
function proficiencyReading(r: ReadingInput): Reading {
  const shares = sharesOf(r.parts);
  const value = (shares.cards ?? 0) * (r.parts.cards ?? 0) + (shares.practice ?? 0) * (r.parts.practice ?? 0) + (shares.milestones ?? 0) * (r.parts.milestones ?? 0);
  const term = r.basis.cards[0];
  const planned = r.basis.practice.reduce((s, p) => s + p.planned, 0);
  const depth = term && r.parts.cards != null ? Math.round(r.parts.cards * term.target * LEVEL_WEIGHT(term.level)) : 0;
  const byDomain: Record<string, ProficiencyDomainFacts> = {};
  if (term) for (const d of TRADING_DOMAINS) if (term.domainIds.includes(d.id)) byDomain[d.id] = { name: d.name, n: d.n, depth: Math.round(depth * d.share) };
  const detail: ProficiencyDetailR1 = {
    v: PROFICIENCY_VERSION,
    basisVersion: r.basis.basisVersion,
    basis: r.basis,
    parts: r.parts,
    shares,
    class: r.parts.practice != null || r.reachedOnTicks ? "SELF_REPORTED" : "MEASURED",
    depth,
    inScope: r.inScope,
    kept: Math.round((r.parts.practice ?? 0) * planned),
    planned,
    reached: r.reached,
    scheduled: r.basis.scheduled,
    rebased: r.rebased ?? null,
    byDomain,
  };
  return { measureKey: proficiencyKey(r.roadmapId), day: r.day, value, detail, source: "COMPUTED", observedAt: r.observedAt };
}

/** The basis's scheduled count is the plan's places (one per lineage), as R1's basis reads it. */
const TRADING_SCHEDULED = maxScheduledPositionsOf(tradingRows());

function tradingBasis(version = 1, target: number = TRADING.target): ProficiencyBasis {
  return {
    basisVersion: version,
    cards: [{ measureKey: CARD_KEY, domainIds: [...TRADING.domainIds], level: TRADING.level, target }],
    practice: [{ itemLineageId: TRADING.lineage, planned: TRADING.planned }],
    scheduled: TRADING_SCHEDULED,
  };
}

const BODY_BASIS: ProficiencyBasis = { basisVersion: 1, cards: [], practice: [{ itemLineageId: BODY.lineage, planned: BODY.planned }], scheduled: maxScheduledPositionsOf(BODY_ROWS) };

/** The six trading milestones as the rank reader reads them: one per place, and place j carries min(j, 5). */
function tradingRanks(reached: Partial<Record<number, DayKey>>, pending: Partial<Record<number, DayKey>> = {}): RankMilestone[] {
  return TRADING.titles.map((_, i) => ({
    ord: i + 1,
    rankIndex: rankIndexAt(i + 1),
    reachedDay: reached[i + 1] ?? null,
    reachPendingDay: pending[i + 1] ?? null,
    scheduled: true,
  }));
}

/** The milestone's g on its card measure (cards at level 6+), as milestoneGOn would give it. */
function cardsG(g: number | null, observedAt: string): MilestoneG {
  return {
    g,
    binding: g == null ? null : { measureKey: MILESTONE_CARD_KEY, class: "MEASURED", label: "cards at level 6+", observedAt },
    parts: [{ measureKey: MILESTONE_CARD_KEY, fraction: g }],
  };
}

/** Milestone 2, started: Gemini titled it and the user checked the words ("I checked this"), so the title is the user's. */
function milestone2(today: DayKey, g: number | null, observedAt: string, extra: Partial<AimCardMilestone> = {}): AimCardMilestone {
  const due = milestoneDueDayOf(addDays(today, MILESTONE2_DUE.planned), addDays(today, MILESTONE2_DUE.goal))!;
  const head = milestoneHeadlineOf(cardsG(g, observedAt));
  return {
    id: "fx-milestone-2",
    ord: 2,
    of: TRADING_SCHEDULED,
    ...titleOf(2, TRADING.titles[1], "CHECKED"),
    status: "STARTED",
    headline: head?.figure ?? null,
    percent: head?.percent ?? null,
    pace: g == null ? { kind: "not-measured" } : { kind: "on-pace", day: addDays(due, -3), pipeline: 9, bestCase: false },
    dueDay: due,
    reachedDay: null,
    countsFrom: null,
    start: null,
    ...extra,
  };
}

/**
 * A milestone not started yet, with its Start line: what it states (⬡ 6, or
 * 0 and why) and the Aim rank it gives. Before Start there is no goal, so
 * the milestone's own due day. Its title is Gemini's, kept by default (an
 * outline title may still be undecided: decided at Start).
 */
function plannedMilestone(today: DayKey, ord: number, start: NonNullable<AimCardMilestone["start"]>, decision: Decision = "KEPT", title: string = TRADING.titles[ord - 1]): AimCardMilestone {
  return {
    id: `fx-milestone-${ord}`,
    ord,
    of: TRADING_SCHEDULED,
    ...titleOf(ord, title, decision),
    status: "PLANNED",
    headline: null,
    percent: null,
    pace: null,
    dueDay: milestoneDueDayOf(addDays(today, 60), null),
    reachedDay: null,
    countsFrom: null,
    start,
  };
}

/** Every field empty: the states below fill what they show. */
function blank(state: AimCardState): AimCardView {
  return {
    state,
    roadmapId: null,
    hasKey: true,
    writesOff: false,
    goalsLive: true,
    aim: null,
    area: null,
    targetDay: null,
    aimChecked: false,
    over: false,
    draftItems: null,
    targetLowered: null,
    measuredAt: null,
    acceptedDay: null,
    rank: null,
    proficiency: null,
    milestone: null,
    weekQuests: null,
    questWeekUnfrozen: false,
    reachedDay: null,
    doneDay: null,
  };
}

/** The trading plan's card. `acceptedDay` is the current version's acceptance day (RoadmapAcceptance.day): null only before any acceptance (running, draft). */
function trading(state: AimCardState, today: DayKey, acceptedDay: DayKey | null): AimCardView {
  return { ...blank(state), roadmapId: TRADING.roadmapId, aim: TRADING.aim, area: TRADING_AREA, targetDay: addDays(today, 450), acceptedDay };
}

/** Days before today the trading plan's version 1 was accepted, in the states after its first milestone started (before milestone 1 was reached). */
const ACCEPTED_V1_DAYS_AGO = 75;

// The parts, as the worked example's shape: cards over 46 at level 8, practice of 72, milestones of 6.
const ACTIVE_PARTS: ProficiencyParts = { cards: 0.5568, practice: 17 / 72, milestones: 1 / 6 };
const LAST_WEEK_PARTS: ProficiencyParts = { cards: 0.5417, practice: 17 / 72, milestones: 1 / 6 };

/** The fixtures, anchored on `today` (the life day), so "measured 09:12" and "new 3 Nov" read as they would. */
export function aimCardFixtures(today: DayKey): AimFixture[] {
  const now = at(today, 9, 12);
  // The last reading before this life week: the one a change is measured against ("since Sun").
  const sunday = addDays(weekStartKeyOf(today), -1);
  const lastWeek = (parts: ProficiencyParts, reached = 1) =>
    proficiencyReading({ roadmapId: TRADING.roadmapId, day: sunday, observedAt: at(sunday, 21, 40), basis: tradingBasis(), parts, inScope: 61, reached, reachedOnTicks: true });
  const current = (parts: ProficiencyParts, extra: Partial<ReadingInput> = {}) =>
    proficiencyReading({ roadmapId: TRADING.roadmapId, day: today, observedAt: now, basis: tradingBasis(), parts, inScope: 61, reached: 1, reachedOnTicks: true, ...extra });
  // R4's rankInputOf: one rank row per lineage, and maxScheduled counted by place over the plan's rows.
  const rankOf = (rows: readonly PositionRow[], reached: Partial<Record<number, DayKey>>, pending: Partial<Record<number, DayKey>> = {}) =>
    aimRankOf({ milestones: tradingRanks(reached, pending), roadmapReachedDay: null, maxScheduled: maxScheduledPositionsOf(rows), today });
  const firstReach = addDays(today, -30);
  // A reach this life week (after Sunday's reading, so that reading still counts no milestone): marked new for RANK_NEW_DAYS.
  const thisWeek = weekStartKeyOf(today);
  const fresh = tradingRows().map((r) => ({ ...r, status: "PLANNED" }));
  const started = tradingRows();
  const planned2 = tradingRows("PLANNED");
  const restarted = tradingRows("STARTED", "PLANNED");
  const givesRank2 = aimRankName(rankIndexAt(2));
  // The version 1 acceptance every state after it reads (RoadmapAcceptance.day): before milestone 1 started.
  const acceptedV1 = addDays(today, -ACCEPTED_V1_DAYS_AGO);

  return [
    {
      key: "empty",
      label: "Empty",
      note: "No roadmap: the one compact line, dismissible by its ×.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null },
      build: () => blank("EMPTY"),
    },
    {
      key: "running",
      label: "Running",
      note: "A draft is running: static text, no spinner.",
      expect: { state: "RUNNING", percent: null, rank: null, change: null },
      build: () => trading("RUNNING", today, null),
    },
    {
      key: "draft",
      label: "Draft waiting",
      note: "A draft waits for the user's check: the count is what milestone 1 still needs (the review footer's), never a syllabus topic, a row the user wrote, a removed row or the outline.",
      expect: { state: "DRAFT", percent: null, rank: null, change: null },
      build: () => ({ ...trading("DRAFT", today, null), draftItems: draftNeedsOf(DRAFT_NEXT).length }),
    },
    {
      key: "accepted",
      label: "Accepted, not started",
      note: "Accepted yesterday, nothing started: the latest Proficiency is the reading taken at acceptance, so it may say so, with its day; Start offered with the stated-pay line; Gemini's title kept, not checked.",
      expect: { state: "ACCEPTED", percent: 31, rank: aimRankName(0), change: null },
      rows: fresh,
      build: () => {
        const accepted = addDays(today, -1);
        const reading = proficiencyReading({
          roadmapId: TRADING.roadmapId,
          day: accepted,
          observedAt: at(accepted, 20, 5),
          basis: tradingBasis(),
          parts: { cards: 0.52, practice: 0, milestones: 0 },
          inScope: 61,
          reached: 0,
          reachedOnTicks: false,
        });
        return {
          ...trading("ACCEPTED", today, accepted),
          measuredAt: reading.observedAt,
          rank: rankOf(fresh, {}),
          proficiency: proficiencyViewOf(reading, null, today, false),
          milestone: plannedMilestone(today, 1, { stated: GOAL_RULES.MID.stated, zeroReason: null, givesRank: aimRankName(rankIndexAt(1)) }),
        };
      },
    },
    {
      key: "accepted-later",
      label: "Accepted days ago, not started",
      note: "Still nothing started, but each day since acceptance wrote a new reading: the caption is this morning's time, never the acceptance.",
      expect: { state: "ACCEPTED", percent: 31, rank: aimRankName(0), change: null },
      rows: fresh,
      build: () => {
        const reading = proficiencyReading({
          roadmapId: TRADING.roadmapId,
          day: today,
          observedAt: now,
          basis: tradingBasis(),
          parts: { cards: 0.52, practice: 0, milestones: 0 },
          inScope: 61,
          reached: 0,
          reachedOnTicks: false,
        });
        return {
          ...trading("ACCEPTED", today, addDays(today, -3)),
          measuredAt: reading.observedAt,
          rank: rankOf(fresh, {}),
          proficiency: proficiencyViewOf(reading, null, today, false),
          milestone: plannedMilestone(today, 1, { stated: GOAL_RULES.MID.stated, zeroReason: null, givesRank: aimRankName(rankIndexAt(1)) }),
        };
      },
    },
    {
      key: "active",
      label: "Active · on pace",
      note: "Milestone 2 started, its goal rescheduled a week on Today (the card shows the goal's due day); Proficiency rose since Sun, so no change line; week quests 2 of 5.",
      expect: { state: "ACTIVE", percent: 41, rank: aimRankName(1), change: null },
      rows: started,
      build: () => ({
        ...trading("ACTIVE", today, acceptedV1),
        measuredAt: now,
        rank: rankOf(started, { 1: firstReach }),
        proficiency: proficiencyViewOf(current(ACTIVE_PARTS), lastWeek(LAST_WEEK_PARTS), today, false),
        milestone: milestone2(today, 0.23, now),
        weekQuests: { done: 2, total: 5 },
      }),
    },
    {
      key: "replan-waiting",
      label: "A re-plan waiting",
      note: "A re-plan was drafted and waits for the user's check: Draft waiting with what its first changed milestone still needs, and nothing changes until it is accepted.",
      expect: { state: "ACTIVE", percent: 41, rank: aimRankName(1), change: null },
      rows: started,
      build: () => ({
        ...trading("ACTIVE", today, acceptedV1),
        draftItems: draftNeedsOf(REPLAN_NEXT).length,
        measuredAt: now,
        rank: rankOf(started, { 1: firstReach }),
        proficiency: proficiencyViewOf(current(ACTIVE_PARTS), lastWeek(LAST_WEEK_PARTS), today, false),
        milestone: milestone2(today, 0.23, now),
        weekQuests: { done: 2, total: 5 },
      }),
    },
    {
      key: "between",
      label: "Between milestones",
      note: "Milestone 1 reached this week and its goal closed; milestone 2 not started yet, its title still Gemini's (decided at Start), the number in it struck. Still Active: the new Aim rank, the Proficiency meter and its parts stay, over milestone 2's Start line.",
      expect: { state: "ACTIVE", percent: 37, rank: aimRankName(1), change: null },
      rows: planned2,
      build: () => ({
        ...trading("ACTIVE", today, acceptedV1),
        measuredAt: now,
        rank: rankOf(planned2, { 1: thisWeek }),
        proficiency: proficiencyViewOf(current({ cards: 0.53, practice: 9 / 72, milestones: 1 / 6 }), lastWeek({ cards: 0.51, practice: 9 / 72, milestones: 0 }, 0), today, false),
        milestone: plannedMilestone(today, 2, { stated: GOAL_RULES.MID.stated, zeroReason: null, givesRank: givesRank2 }, "PENDING", TITLE_WITH_NUMBER),
      }),
    },
    {
      key: "pending-reach",
      label: "A reach waiting on ticks",
      note: "Milestone 2 hit 100% on a session tick: it counts from two days on, and the Aim rank waits.",
      expect: { state: "ACTIVE", percent: 50, rank: aimRankName(1), change: null },
      rows: started,
      build: () => {
        const countsFrom = addDays(today, REACH_CONFIRM_DAYS);
        return {
          ...trading("ACTIVE", today, acceptedV1),
          measuredAt: now,
          rank: rankOf(started, { 1: firstReach }, { 2: today }),
          proficiency: proficiencyViewOf(current({ cards: 0.64, practice: 27 / 72, milestones: 1 / 6 }), lastWeek(ACTIVE_PARTS), today, false),
          milestone: milestone2(today, 1, now, { status: "PENDING_REACH", countsFrom, pace: { kind: "reached", day: today } }),
          weekQuests: { done: 4, total: 5 },
        };
      },
    },
    {
      key: "new-rank",
      label: "New Aim rank",
      note: "Milestone 1 reached this week: marked new for a week; milestone 2 started the same day, at 0%.",
      expect: { state: "ACTIVE", percent: 36, rank: aimRankName(1), change: null },
      rows: started,
      build: () => ({
        ...trading("ACTIVE", today, acceptedV1),
        measuredAt: now,
        rank: rankOf(started, { 1: thisWeek }),
        proficiency: proficiencyViewOf(current({ cards: 0.53, practice: 7 / 72, milestones: 1 / 6 }), lastWeek({ cards: 0.5, practice: 7 / 72, milestones: 0 }, 0), today, false),
        milestone: milestone2(today, 0, now),
        weekQuests: { done: 0, total: 4 },
      }),
    },
    {
      key: "fallen",
      label: "Proficiency fallen",
      note: "Card levels slipped overnight: the cause line in ink, and the Aim rank stays.",
      expect: { state: "ACTIVE", percent: 40, rank: aimRankName(1), change: "fall" },
      rows: started,
      build: () => ({
        ...trading("ACTIVE", today, acceptedV1),
        measuredAt: now,
        rank: rankOf(started, { 1: firstReach }),
        proficiency: proficiencyViewOf(current(LAST_WEEK_PARTS), lastWeek(ACTIVE_PARTS), today, false),
        milestone: milestone2(today, 0.23, now),
        weekQuests: { done: 2, total: 5 },
      }),
    },
    {
      key: "replan",
      label: "Changed by a re-plan",
      note: "A re-plan accepted today lowered the end target: shown as a change of plan this week, never as a gain; Target lowered shows.",
      expect: { state: "ACTIVE", percent: 46, rank: aimRankName(1), change: "rebased" },
      rows: started,
      build: () => {
        // A rebased reading replaces the week's change line only within the life week it happened in.
        const on = today;
        const before = current(ACTIVE_PARTS);
        const rebased: ProficiencyRebase = { on, from: before.value, cause: "REPLAN", detail: `the re-plan lowered the end target ${TRADING.target} → 38` };
        const reading = proficiencyReading({
          roadmapId: TRADING.roadmapId,
          day: today,
          observedAt: now,
          basis: tradingBasis(2, 38),
          parts: { cards: 0.6326, practice: 17 / 72, milestones: 1 / 6 },
          inScope: 61,
          reached: 1,
          reachedOnTicks: true,
          rebased,
        });
        return {
          // The re-plan was accepted today: its version is the current acceptance.
          ...trading("ACTIVE", today, today),
          measuredAt: now,
          targetLowered: { measureKey: CARD_KEY, on, from: TRADING.target, to: 38 },
          rank: rankOf(started, { 1: firstReach }),
          proficiency: proficiencyViewOf(reading, lastWeek(ACTIVE_PARTS), today, false),
          milestone: milestone2(today, 0.23, now),
          weekQuests: { done: 2, total: 5 },
        };
      },
    },
    {
      key: "paid-lineage",
      label: "Started again, already paid",
      note: "Milestone 2 was dropped and started again; its first goal was brought back and paid, so the copy states nothing and names the day it paid. The copy keeps milestone 2's place: still six milestones.",
      expect: { state: "ACTIVE", percent: 41, rank: aimRankName(1), change: null },
      rows: restarted,
      build: () => ({
        ...trading("ACTIVE", today, acceptedV1),
        measuredAt: now,
        rank: rankOf(restarted, { 1: firstReach }),
        proficiency: proficiencyViewOf(current(ACTIVE_PARTS), lastWeek(LAST_WEEK_PARTS), today, false),
        milestone: plannedMilestone(today, 2, { stated: 0, zeroReason: "LINEAGE_PAID", givesRank: givesRank2, paidOn: addDays(today, -9) }, "CHECKED"),
      }),
    },
    {
      key: "no-reading",
      label: "No reading yet · writes off",
      note: "Started, but nothing stored yet: no meter, never an invented 0%; this server records nothing.",
      expect: { state: "ACTIVE", percent: null, rank: aimRankName(0), change: null },
      rows: tradingRows("PLANNED"),
      build: () => ({
        ...trading("ACTIVE", today, acceptedV1),
        writesOff: true,
        rank: rankOf(tradingRows("PLANNED"), {}),
        milestone: { ...milestone2(today, null, now), id: "fx-milestone-1", ord: 1, ...titleOf(1, TRADING.titles[0], "KEPT") },
      }),
    },
    {
      key: "past-due",
      label: "Past due",
      note: "Milestone 2's due day has passed with its goal open (rescheduled once, and passed again): no week quests, nothing red.",
      expect: { state: "PAST_DUE", percent: 51, rank: aimRankName(1), change: null },
      rows: started,
      build: () => ({
        ...trading("PAST_DUE", today, acceptedV1),
        measuredAt: now,
        rank: rankOf(started, { 1: firstReach }),
        proficiency: proficiencyViewOf(current({ cards: 0.66, practice: 28 / 72, milestones: 1 / 6 }), lastWeek({ cards: 0.65, practice: 27 / 72, milestones: 1 / 6 }), today, false),
        milestone: milestone2(today, 0.82, now, { status: "PAST_DUE", dueDay: milestoneDueDayOf(addDays(today, -11), addDays(today, -4)), pace: null }),
      }),
    },
    {
      key: "done",
      label: "Done · a three-milestone Body plan",
      note: "Every milestone and the aim reached, one milestone dropped and started again on the way: still a plan of three, so its top Aim rank, never Paragon, and the last Proficiency.",
      expect: { state: "DONE", percent: 90, rank: aimRankName(3), change: null },
      rows: BODY_ROWS,
      build: () => {
        const reached = addDays(today, -10);
        const reading = proficiencyReading({
          roadmapId: BODY.roadmapId,
          day: addDays(today, -1),
          observedAt: at(addDays(today, -1), 8, 15),
          basis: BODY_BASIS,
          parts: { cards: null, practice: 0.85, milestones: 1 },
          inScope: 0,
          reached: BODY.milestones,
          reachedOnTicks: true,
        });
        // One rank row per place: the copy stands for milestone 2, never the dropped row as well.
        const ranks: RankMilestone[] = [1, 2, 3].map((ord) => ({ ord, rankIndex: rankIndexAt(ord), reachedDay: addDays(today, ord === 3 ? -10 : -10 - 40 * (3 - ord)), reachPendingDay: null, scheduled: true }));
        return {
          ...blank("DONE"),
          roadmapId: BODY.roadmapId,
          aim: BODY.aim,
          area: BODY_AREA,
          targetDay: addDays(today, 4),
          // Accepted before milestone 1 started (reached 90 days ago).
          acceptedDay: addDays(today, -130),
          aimChecked: true,
          measuredAt: reading.observedAt,
          rank: aimRankOf({ milestones: ranks, roadmapReachedDay: reached, maxScheduled: maxScheduledPositionsOf(BODY_ROWS), today }),
          proficiency: proficiencyViewOf(reading, null, today, false),
          reachedDay: reached,
          doneDay: addDays(today, -2),
        };
      },
    },
  ];
}

/** A fixture's view, or why it can't be built yet (a roadmap builder still a shell: "Not yet: …"). */
export function buildAimFixture(f: AimFixture): { view: AimCardView; waiting: null } | { view: null; waiting: string } {
  try {
    return { view: f.build(), waiting: null };
  } catch (err) {
    return { view: null, waiting: err instanceof Error ? err.message : String(err) };
  }
}
