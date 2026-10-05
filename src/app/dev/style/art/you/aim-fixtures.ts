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
 * The states: the empty card's eleven (below: the spec's seven and the fix
 * round's four), running, draft waiting, accepted (the acceptance reading),
 * accepted days ago (today's reading),
 * active (on pace, week quests 2 of 5), a re-plan waiting, between
 * milestones (the next title still Gemini's, its number struck), a reach
 * waiting on ticks, a new Aim rank, Proficiency fallen, Proficiency changed
 * by a re-plan, a "Start again" copy whose milestone already paid, no
 * reading yet (writes off), past due, and the closed aims: done (a
 * three-milestone Body plan, one of its milestones started again), done 3
 * days after a reach, done 30 days ago, and done unreached.
 *
 * Revision 4 (roadmap-rev4.md F-R4-1, F-R4-2). The empty card asks for the
 * aim in place, so it has the spec's seven states: ASK (the full card), ASK
 * with a long goal to start from, ASK with the last aim's line, ASK
 * continuing an unsent aim (an unsent aim, a long goal and a last aim
 * together), LATER (the line, for 4 weeks after "Not now"), LATER with the
 * last aim, and OFF (nothing). The fix round adds four:
 *   - ASK with a long goal and a last aim and an empty box: the tallest ASK
 *     once the seed hides while the box holds text (R5, lens 3), so ui-audit
 *     measures the 410 px bound on it as well as on the continue state;
 *   - HIDDEN (lane 0's 'hide:<day>': the LATER line's × "Not now: no aim
 *     suggestions for 4 weeks" now does what it says), with and without a
 *     last aim;
 *   - OFF with a last aim (F-R4-2: the achievement never vanishes from the
 *     character page; HIDDEN and OFF may show only its line, with no link to
 *     a new aim and no ×).
 * Each carries what /you reads, never the prompt itself: the
 * AIM_PROMPT_COOKIE value and the view's aimSuggestions (the page derives the
 * prompt with roadmap-invite aimPromptOf, as /you does), the seed built by
 * longGoalSeedOf over a fixture goal, and the view's lastAim (LastAimView, as
 * R4's loadAimCard fills it from the latest DONE roadmap). A closed aim leads
 * the card for AIM_DONE_SHOW_DAYS after its done day; after that the card is
 * EMPTY with the last aim's line ("done 30 days ago"). The closed depth plan
 * (the spec's pack: Probability and Inference held at level 12) ranks its
 * stages through lane 0's rankIndexForStage, given the plan's depth as every
 * caller passes it (contracts §15.4), and its top rank is
 * topRankIndexOfDepth's (PACK_DEPTH_RANK).
 *
 * Fix round 2 adds a plan made before revision 4 (F-R4-16; lane 0's
 * AimCardView.legacyView, contracts §16.3), as R4's aimCardOfData sends it:
 * accepted (an open legacy plan reads ACCEPTED: it can't start a milestone),
 * a draft, and closed. Each carries only the aim, the Area and legacyView
 * (Gemini rows hidden or not, the chosen Domains, the Area Field), so the
 * card on /you shows the hidden-wording line and hands "Start again at a
 * depth" the old plan's own Domains, and ui-audit measures it at 344.
 */
import { addDays, weekStartKeyOf, zonedToInstant, type DayKey } from "@/lib/life-day";
import { GOAL_RULES } from "@/lib/life-economy";
import { milestoneHeadlineOf, type MilestoneG } from "@/lib/roadmap-measures";
import { aimRankOf, proficiencyViewOf, type ProficiencyDetailR1, type ProficiencyDomainFacts, type RankMilestone } from "@/lib/roadmap-proficiency";
import { AIM_DONE_SHOW_DAYS, AIM_INVITE_SINCE, hideCookieValue, laterCookieValue, longGoalSeedOf, type AimPrompt, type AimSeed } from "@/lib/roadmap-invite";
import {
  AIM_DEPTHS,
  LEVEL_WEIGHT,
  PROFICIENCY_VERSION,
  PROFICIENCY_WEIGHTS,
  RANK_TOP,
  REACH_CONFIRM_DAYS,
  STAGE_LEVEL,
  aimRankName,
  cardsAtLevelKey,
  rankIndexForStage,
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
  type DepthRankInput,
  type ItemDraft,
  type ItemKind,
  type LastAimView,
  type MilestoneDraft,
  type MilestoneStatus,
  type Origin,
  type PositionRow,
  type ProficiencyBasis,
  type ProficiencyParts,
  type ProficiencyRebase,
  type Reading,
  type RoadmapStatus,
  type StageKey,
} from "@/lib/roadmap-types";
import { labelBaseFor, withLabelChecks, type LabelBase } from "@/lib/roadmap-validate";

export type AimFixtureKey =
  | "empty-ask"
  | "empty-ask-seed"
  | "empty-ask-last-aim"
  | "empty-ask-continue"
  | "empty-ask-seed-last-aim"
  | "empty-later"
  | "empty-later-last-aim"
  | "empty-hidden"
  | "empty-hidden-last-aim"
  | "empty-off"
  | "empty-off-last-aim"
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
  | "done"
  | "done-reached"
  | "done-30"
  | "done-unreached"
  | "legacy-active"
  | "legacy-draft"
  | "legacy-done";

/**
 * What /you reads for the empty card besides the view (F-R4-1): the
 * AIM_PROMPT_COOKIE value (absent: never snoozed), the long-goal seed
 * (longGoalSeedOf over the sheet's goals) and an unsent aim in RoadmapForm's
 * autosave (R5's fixture seam; on /you the card reads the autosave itself).
 */
export interface AimFixtureEmpty {
  cookie?: string;
  seed?: AimSeed | null;
  autosaveAim?: string;
}

export interface AimFixture {
  key: AimFixtureKey;
  /** The fixture's name on the page ("Active · on pace"). */
  label: string;
  /** What the fixture shows, in a line. */
  note: string;
  /** What the card must say about it (you-check holds the built view to these). `prompt` only for EMPTY: what aimPromptOf gives over the cookie and the view's aimSuggestions. */
  expect: { state: AimCardState; percent: number | null; rank: string | null; change: "fall" | "rebased" | null; prompt?: AimPrompt };
  /** The plan's milestone rows its Aim rank was read from (maxScheduledPositionsOf), when a fixture has a rank. */
  rows?: readonly PositionRow[];
  /** A depth plan's top-rank input (revision 4: topRankIndexOfDepth), in place of rev 3's count of places. */
  depthRank?: DepthRankInput;
  /** The empty card's inputs besides the view (revision 4). */
  empty?: AimFixtureEmpty;
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

/**
 * A revision 4 depth plan, closed (F-R4-2): the spec's pack, Probability
 * (34 cards) and Inference (25) at Mastered (level 12), its five stages
 * Familiar (Foundation merged into it), Retained, Fluent, Toward Mastered
 * (the level-11 BETWEEN gate) and Mastered, ranked by stage (rankIndexForStage:
 * 2, 3, 4, 4, 5), with 72 planned practice sessions and a standard, so the
 * reached plan tops out at Paragon.
 */
const PACK = {
  roadmapId: "fx-roadmap-pack",
  aim: "Read a statistics paper's methods and check them without notes",
  area: { kind: "FIELD", fieldId: "fx-field-stats", name: "Statistics", level: 9 } as AreaChip,
  depth: AIM_DEPTHS.MASTERED,
  domains: [
    { id: "fx-domain-prob", name: "Probability", n: 34, share: 34 / 59 },
    { id: "fx-domain-inf", name: "Inference", n: 25, share: 25 / 59 },
  ],
  lineage: "fx-lineage-recall",
  planned: 72,
} as const;

/** The pack's stages in order, each with its gate level: the rank each one reached inside the plan gives. */
const PACK_STAGES: readonly { stage: StageKey; level: number }[] = [
  { stage: "FAMILIAR", level: STAGE_LEVEL.FAMILIAR },
  { stage: "RETAINED", level: STAGE_LEVEL.RETAINED },
  { stage: "FLUENT", level: STAGE_LEVEL.FLUENT },
  { stage: "BETWEEN", level: STAGE_LEVEL.MASTERED - 1 },
  { stage: "MASTERED", level: STAGE_LEVEL.MASTERED },
];

/** The pack's milestone rows (all started; the stage's rank, never its place). */
export const PACK_ROWS: readonly PositionRow[] = PACK_STAGES.map((s, i) => ({
  id: `fx-pack-ms-${i + 1}`,
  lineageId: `fx-pack-lineage-${i + 1}`,
  version: 1,
  status: "STARTED",
  rankIndex: rankIndexForStage(s.stage, s.level, PACK.depth),
  createdAt: 1,
}));

/** Days before today the pack plan was accepted (before its first stage was reached), and its span to the date the app set. */
const ACCEPTED_PACK_DAYS_AGO = 520;
const PACK_SPAN_DAYS = ACCEPTED_PACK_DAYS_AGO + 30;

/** The pack's top-rank input: depth 12, a standard (its exam score), no coverage choice, production practice from Fluent on, so Paragon is open. */
export const PACK_DEPTH_RANK: DepthRankInput = {
  depth: PACK.depth,
  track: false,
  hasStandard: true,
  keptStages: PACK_STAGES.length,
  spanDays: PACK_SPAN_DAYS,
  coverageBelowPolicy: false,
  productionPlannedFromFluent: true,
};

/** The pack's depth basis (Proficiency v2's cards part is the depth terms: one per Domain, level 12, clean entry). */
function packBasis(): ProficiencyBasis {
  return {
    basisVersion: 1,
    cards: PACK.domains.map((d) => ({ measureKey: cardsAtLevelKey([d.id], PACK.depth, "rc"), domainIds: [d.id], level: PACK.depth, target: d.n })),
    practice: [{ itemLineageId: PACK.lineage, planned: PACK.planned }],
    scheduled: PACK_STAGES.length,
  };
}

/** The pack's rank rows: stage s reached on `reached[s]` (days from today), the rest unreached. */
function packRanks(today: DayKey, reached: readonly (number | null)[]): RankMilestone[] {
  return PACK_STAGES.map((s, i) => ({
    ord: i + 1,
    rankIndex: rankIndexForStage(s.stage, s.level, PACK.depth),
    reachedDay: reached[i] == null ? null : addDays(today, reached[i]!),
    reachPendingDay: null,
    scheduled: true,
  }));
}

/** A long goal on the sheet with no roadmap (the seed's source): longGoalSeedOf reads it as /you does. */
function longGoalSeed(today: DayKey): AimSeed | null {
  return longGoalSeedOf([{ id: "fx-goal-long", title: "Hold a 30-minute conversation in Japanese", horizon: "LONG", dueDay: addDays(today, 400) }], today);
}

/**
 * The last aim, as R4's loadAimCard keeps it from the latest DONE roadmap
 * (LastAimView): its words, its final Aim rank, and the day it was reached
 * (or closed, when it ended unreached). An EMPTY card shows it only once the
 * aim closed AIM_DONE_SHOW_DAYS or more ago (before that the DONE card leads).
 */
function lastAimOf(roadmapId: string, aim: string, rankIndex: number, reached: boolean, day: DayKey): LastAimView {
  return { roadmapId, aim, rankIndex, rankName: aimRankName(rankIndex), reached, day };
}

/** The unsent aim the continue state starts from (RoadmapForm's autosave, through R5's fixture seam). */
export const UNSENT_AIM = "Price options and explain the Greeks to a client";

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
  /** The Domains in the card terms' scope, with each one's share of the depth (the fall's cause names them); the trading plan's by default. */
  domains?: readonly { id: string; name: string; n: number; share: number }[];
}

/** A stored PROFICIENCY reading as R1's writers store it: value = Σ share × part, detail per F12 (with R1's byDomain facts). */
function proficiencyReading(r: ReadingInput): Reading {
  const shares = sharesOf(r.parts);
  const value = (shares.cards ?? 0) * (r.parts.cards ?? 0) + (shares.practice ?? 0) * (r.parts.practice ?? 0) + (shares.milestones ?? 0) * (r.parts.milestones ?? 0);
  const terms = r.basis.cards;
  const planned = r.basis.practice.reduce((s, p) => s + p.planned, 0);
  const depth = terms.length > 0 && r.parts.cards != null ? Math.round(r.parts.cards * terms.reduce((s, t) => s + t.target * LEVEL_WEIGHT(t.level), 0)) : 0;
  const byDomain: Record<string, ProficiencyDomainFacts> = {};
  for (const d of r.domains ?? TRADING_DOMAINS) if (terms.some((t) => t.domainIds.includes(d.id))) byDomain[d.id] = { name: d.name, n: d.n, depth: Math.round(depth * d.share) };
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

/**
 * The empty card (no open roadmap, F-R4-1) as R4's loadAimCard returns it:
 * LifeSettings.aimSuggestions (null: never set, which means on; false: the
 * stored no) and the last aim, or none.
 */
function emptyCard(aimSuggestions: boolean | null, lastAim: LastAimView | null): AimCardView {
  return { ...blank("EMPTY"), aimSuggestions, lastAim };
}

/** The closed pack plan's card (F-R4-2): a depth plan, its date the app's, accepted before any stage was reached. */
function pack(state: AimCardState, today: DayKey): AimCardView {
  const accepted = addDays(today, -ACCEPTED_PACK_DAYS_AGO);
  return { ...blank(state), roadmapId: PACK.roadmapId, aim: PACK.aim, area: PACK.area, targetDay: addDays(accepted, PACK_SPAN_DAYS), acceptedDay: accepted, aimChecked: true, depth: PACK.depth };
}

/** The pack plan, reached and closed: its last aim's line (Aim rank Paragon, the day it was reached). */
function packLastAim(today: DayKey, reachedDaysAgo: number): LastAimView {
  return lastAimOf(PACK.roadmapId, PACK.aim, RANK_TOP, true, addDays(today, -reachedDaysAgo));
}

/**
 * A plan made before revision 4 (F-R4-16; lens 3 #13 and #17, fix round 2):
 * a Field Area with no depth, so lane 0's isLegacyRoadmap holds. R4's
 * aimCardOfData then sends no milestone, Aim rank, Proficiency or depth:
 * only the aim, the Area, the state (an ACTIVE plan reads ACCEPTED, since it
 * can't start a milestone) and legacyView, R4's legacyViewOf — whether any
 * row had a Gemini origin ("Wording from an earlier Gemini draft is
 * hidden.") and the chosen Domains and Area Field that "Start again at a
 * depth" carries into the new intake (contracts §16.3). It was accepted
 * before revision 4 shipped (AIM_INVITE_SINCE), and its milestone and item
 * text never reaches the card, so the fixture holds none.
 */
const LEGACY = {
  roadmapId: "fx-roadmap-legacy",
  aim: "Read central bank minutes and explain what changed",
  fieldId: "fx-field-econ",
  area: { kind: "FIELD", fieldId: "fx-field-econ", name: "Economics", level: 5 } as AreaChip,
  domainIds: ["fx-domain-macro", "fx-domain-money"],
} as const;

/** The day before revision 4 shipped, or `daysAgo` before today when that is earlier (a fixture day is never ahead). */
function beforeRev4(today: DayKey, daysAgo: number): DayKey {
  const before = addDays(AIM_INVITE_SINCE, -1);
  const floor = addDays(today, -daysAgo);
  return before < floor ? before : floor;
}

/** The legacy plan's card as R4 sends it: `kind` is the roadmap's status, `state` the card's (ACTIVE reads ACCEPTED). */
function legacyCard(state: AimCardState, kind: RoadmapStatus, geminiHidden: boolean, acceptedDay: DayKey | null, targetDay: DayKey): AimCardView {
  return {
    ...blank(state),
    roadmapId: LEGACY.roadmapId,
    aim: LEGACY.aim,
    area: LEGACY.area,
    targetDay,
    acceptedDay,
    depth: null,
    legacy: true,
    legacyView: { kind, geminiHidden, domainIds: [...LEGACY.domainIds], areaFieldId: LEGACY.fieldId },
  };
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
    // ── The empty card (revision 4, F-R4-1): it asks for the aim in place ──
    {
      key: "empty-ask",
      label: "Empty · asks for the aim",
      note: "No roadmap and never snoozed: the card asks for the aim in place, with Not now and Don't suggest this. No long goal to start from and no last aim.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "ASK" },
      empty: {},
      build: () => emptyCard(null, null),
    },
    {
      key: "empty-ask-seed",
      label: "Empty · from a long goal",
      note: "An open long goal on the sheet with no roadmap: 'Start from your long goal' carries its title, and its due day when that is a fitting aim date.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "ASK" },
      empty: { seed: longGoalSeed(today) },
      build: () => emptyCard(null, null),
    },
    {
      key: "empty-ask-last-aim",
      label: "Empty · after an aim closed unreached",
      note: "The last aim, a Body plan closed 40 days ago without reaching it, stays on the card with its final Aim rank and the day it closed.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "ASK" },
      empty: {},
      build: () => emptyCard(null, lastAimOf(BODY.roadmapId, BODY.aim, rankIndexAt(2), false, addDays(today, -40))),
    },
    {
      key: "empty-ask-continue",
      label: "Empty · an unsent aim",
      note: "An aim typed earlier and never sent: the box starts with it (Continue where you left off), beside a long goal and the last aim. While the box holds text the long goal's link hides, so tapping it can't replace the typed aim. The audit measures it.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "ASK" },
      empty: { seed: longGoalSeed(today), autosaveAim: UNSENT_AIM },
      build: () => emptyCard(true, packLastAim(today, 60)),
    },
    {
      key: "empty-ask-seed-last-aim",
      label: "Empty · a long goal and the last aim (the tallest)",
      note: "An empty box with a long goal to start from and the last aim's line together: the card's tallest state once the long goal's link hides while text is typed, so the audit measures the 410 px bound on it.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "ASK" },
      empty: { seed: longGoalSeed(today) },
      build: () => emptyCard(null, packLastAim(today, 75)),
    },
    {
      key: "empty-later",
      label: "Empty · Not now",
      note: "Not now 3 days ago: the one compact line for four weeks from that day. Its × hides the line too, for four weeks from that tap.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "LATER" },
      empty: { cookie: laterCookieValue(addDays(today, -3)) },
      build: () => emptyCard(null, null),
    },
    {
      key: "empty-later-last-aim",
      label: "Empty · Not now, after a reached aim",
      note: "Not now 10 days ago, after an aim reached and closed: the line names the last aim's Aim rank and offers the next aim.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "LATER" },
      empty: { cookie: laterCookieValue(addDays(today, -10)) },
      build: () => emptyCard(null, packLastAim(today, 60)),
    },
    {
      key: "empty-hidden",
      label: "Empty · the line hidden",
      note: "The compact line's ×, or Not now on Today's line, 5 days ago ('Not now: no aim suggestions for 4 weeks'): nothing on the sheet, nothing on Today and no offer in capture, until four weeks from that tap. Suggestions are still on, so Settings shows the switch on.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "HIDDEN" },
      empty: { cookie: hideCookieValue(addDays(today, -5)) },
      build: () => emptyCard(null, null),
    },
    {
      key: "empty-hidden-last-aim",
      label: "Empty · the line hidden, after a reached aim",
      note: "The line's × 12 days ago, after an aim reached and closed: at most the last aim's Aim rank and day stay, with no link to a new aim and no ×.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "HIDDEN" },
      empty: { cookie: hideCookieValue(addDays(today, -12)) },
      build: () => emptyCard(null, packLastAim(today, 60)),
    },
    {
      key: "empty-off",
      label: "Empty · suggestions off",
      note: "Don't suggest this, or the Settings switch (stored, so it holds on every device): nothing on the sheet. The Roadmap tab still offers Set an aim.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "OFF" },
      empty: {},
      build: () => emptyCard(false, null),
    },
    {
      key: "empty-off-last-aim",
      label: "Empty · suggestions off, after an aim closed",
      note: "Suggestions off, and the last aim, a Body plan closed 40 days ago unreached: at most its line stays (its Aim rank and the day it closed), with no link to a new aim and no ×.",
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "OFF" },
      empty: {},
      build: () => emptyCard(false, lastAimOf(BODY.roadmapId, BODY.aim, rankIndexAt(2), false, addDays(today, -40))),
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
    // ── Closed aims (revision 4, F-R4-2): no dead end ──
    {
      key: "done-reached",
      label: "Done · 3 days after the reach",
      note: "A depth plan reached 3 days ago and marked done: for a week the achievement leads (the Aim rank, the depth held in both Domains, Open roadmap), with Set your next aim second.",
      expect: { state: "DONE", percent: 96, rank: aimRankName(RANK_TOP), change: null },
      rows: PACK_ROWS,
      depthRank: PACK_DEPTH_RANK,
      build: () => {
        const reached = addDays(today, -3);
        const closed = addDays(today, -1);
        const reading = proficiencyReading({
          roadmapId: PACK.roadmapId,
          day: closed,
          observedAt: at(closed, 7, 40),
          basis: packBasis(),
          parts: { cards: 1, practice: 62 / PACK.planned, milestones: 1 },
          inScope: 59,
          reached: PACK_STAGES.length,
          reachedOnTicks: false,
          domains: PACK.domains,
        });
        return {
          ...pack("DONE", today),
          measuredAt: reading.observedAt,
          rank: aimRankOf({ milestones: packRanks(today, [-400, -340, -250, -160, -3]), roadmapReachedDay: reached, maxScheduled: maxScheduledPositionsOf(PACK_ROWS), today }),
          proficiency: proficiencyViewOf(reading, null, today, false),
          reachedDay: reached,
          doneDay: closed,
          heldDepth: { depth: PACK.depth, domainNames: PACK.domains.map((d) => d.name), confirmedDay: addDays(reached, REACH_CONFIRM_DAYS) },
        };
      },
    },
    {
      key: "done-30",
      label: `Done ${AIM_DONE_SHOW_DAYS + 2} days ago`,
      note: `The aim was reached and closed ${AIM_DONE_SHOW_DAYS + 2} days ago, past the ${AIM_DONE_SHOW_DAYS} days a closed aim leads the card: the card asks for the next aim, and the last aim's Aim rank stays on it.`,
      expect: { state: "EMPTY", percent: null, rank: null, change: null, prompt: "ASK" },
      empty: {},
      build: () => emptyCard(null, packLastAim(today, AIM_DONE_SHOW_DAYS + 5)),
    },
    {
      key: "done-unreached",
      label: "Done · unreached",
      note: "Marked done 5 days ago at Fluent, the aim not reached: Set your next aim leads and Open roadmap is second, with the final Aim rank and the last Proficiency.",
      expect: { state: "DONE", percent: 50, rank: aimRankName(rankIndexForStage("FLUENT") ?? 0), change: null },
      rows: PACK_ROWS.map((r, i) => (i < 3 ? r : { ...r, status: "PLANNED" })),
      depthRank: PACK_DEPTH_RANK,
      build: () => {
        const closed = addDays(today, -5);
        const reading = proficiencyReading({
          roadmapId: PACK.roadmapId,
          day: closed,
          observedAt: at(closed, 21, 5),
          basis: packBasis(),
          parts: { cards: 0.456, practice: 40 / PACK.planned, milestones: 3 / PACK_STAGES.length },
          inScope: 59,
          reached: 3,
          reachedOnTicks: false,
          domains: PACK.domains,
        });
        return {
          ...pack("DONE", today),
          measuredAt: reading.observedAt,
          rank: aimRankOf({ milestones: packRanks(today, [-300, -230, -120, null, null]), roadmapReachedDay: null, maxScheduled: maxScheduledPositionsOf(PACK_ROWS), today }),
          proficiency: proficiencyViewOf(reading, null, today, false),
          doneDay: closed,
        };
      },
    },
    // ── Plans made before revision 4 (F-R4-16; fix round 2: AimCardView.legacyView) ──
    {
      key: "legacy-active",
      label: "Planned before depth",
      note: "An accepted plan made before plans aimed at a depth, one of its rows Gemini's: the aim, its Area, the banner with 'Wording from an earlier Gemini draft is hidden.' and Start again at a depth, which carries the plan's own Domains into the new intake. No milestone, rank or Proficiency: it isn't measured.",
      expect: { state: "ACCEPTED", percent: null, rank: null, change: null },
      build: () => legacyCard("ACCEPTED", "ACTIVE", true, beforeRev4(today, 1), addDays(today, 300)),
    },
    {
      key: "legacy-draft",
      label: "Drafted before depth",
      note: "A draft made before plans aimed at a depth, with no Gemini rows: the banner and Draft it again, which opens the intake; nothing to accept, and no hidden-wording line.",
      expect: { state: "DRAFT", percent: null, rank: null, change: null },
      build: () => legacyCard("DRAFT", "DRAFT", false, null, addDays(today, 300)),
    },
    {
      key: "legacy-done",
      label: "Planned before depth, closed",
      note: "A plan made before plans aimed at a depth, closed 6 days ago unreached: Set your next aim leads, with no Start again (only an open plan is replaced), and the earlier Gemini wording stays hidden.",
      expect: { state: "DONE", percent: null, rank: null, change: null },
      build: () => ({ ...legacyCard("DONE", "DONE", true, beforeRev4(today, 40), addDays(today, 120)), doneDay: addDays(today, -6) }),
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
