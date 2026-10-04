/**
 * FROZEN CONTRACT (roadmap lane 0; docs/life-plan/roadmap.md revision 3, F1;
 * the table of every export is docs/life-plan/roadmap-contracts.md).
 *
 * The roadmap's shared vocabulary: every constant and union the spec names,
 * the shapes the lanes pass between each other, the provenance contract and
 * its brands, the measureKey and dedupe-key grammar, and the pure schedule
 * helpers R1 (measures), R2 (realism) and R6 (week quests) share, so each
 * lane's goldens rest on one copy. Pure and client-importable: no Prisma, no
 * clock, no model. Changing a name, a value, a shape or a signature here is
 * a lead decision; a lane may add optional fields to its own shapes and new
 * exports to its own modules, never remove or rename one.
 *
 * Every constant is policy, not a fact, and is published as such (the
 * roadmap's "How this is worked out" sheet and /today/rules).
 *
 * Exports, by section:
 *   Gate and strings  ROADMAP_GOALS_LIVE · ROADMAP_WRITES_OFF · NOT_RECORDED_HERE · ROADMAP_NOT_YET
 *                     RoadmapActionResult · notYet · ROADMAP_CHECK_ENV · AIM_PROMPT_COOKIE(_MAX_AGE_S)
 *                     RoadmapWriteOpts · RoadmapSkip · ReadingsRun · QuestFreezeRun · QuestFinalizeRun
 *                     RoadmapStepReport · roadmapStepErrorsOf
 *   Unions            RoadmapStatus · MilestoneStatus · Origin · Decision · ItemKind · PlanSource
 *                     MeasureKind · MeasureRole · TargetSource · RateSource · RunKind · RunStatus
 *                     ReadingSource · PracticeMethod · CheckpointKind · PracticeBand · StartPoint
 *                     Intensity · BlockingFlag · ItemNote · KnowledgeVerdict · TimeVerdict · Remedy
 *                     ReplanKind · ReplanTrigger · GeminiKeyTier · WeekQuestKind/Evidence/State/Source/Cap
 *   Constants         intake, milestones, floors, realism, throughput, pace, model, week quests,
 *                     Proficiency and the Aim rank (each block below)
 *   Schedule helpers  interval · strictInterval · floorBase · floorStrict · LEVEL_WEIGHT · effectiveState
 *                     bestReach · strictReach · existingBest · existingStrict · existingExpected
 *                     plannedUnits · keptUnits · milestoneCountFor · minIncrementCards · isQuestWeekFinal
 *   Runs              countsTowardDraftCap · RunWriter · RUN_FALLBACK_STARTER · runWriterOf · rowsWriterOf
 *                     acceptedRunOf (fix round 2: the run behind the accepted version)
 *   Draft needs       isUndecidedItem · isPlaceholderItem · DraftNeed · DraftNeedRow · draftNeedsOf
 *                     (fix round 2: one definition of "N items left" and "Next item to decide")
 *   Ranks             AIM_RANKS · rankIndexAt · topRankIndexOf · aimRankName · AssignRankIndices
 *   Positions         PositionRow · isNewerRow · isSupersededRow · positionCountOf
 *                     maxScheduledPositionsOf · milestoneDueDayOf (one position per lineage; one due day)
 *   Provenance        PROVENANCE_CLASSES · provenanceOf · weakest · the number and string brands
 *                     measured · recorded · selfReported · estimated · workedOut
 *                     yoursText · codeText (CODE_TEMPLATES) · domainName · labelTextOf · domainsText
 *   Keys              cardsAtLevelKey · practiceKeptKey · proficiencyKey · checkpointLogKey(Prefix)
 *                     parseMeasureKey · milestoneGoalKey · milestonePracticeKey · milestoneStepKey
 *                     questWeekKey · isCredentialAim · packText · isMissingRoadmapTable
 *   Shapes            intake and pack · drafts and validation · readings and realism · pace,
 *                     Proficiency and rank · week quests · economy and Start · IntakeView ·
 *                     AimCardView · RoadmapView (the last sections)
 *   Start pay         StartPayBasis · practiceMinutesPerWeekOf · otherTrackedMinutesOf · startStatedInputOf
 *   Fix round         the optional view fields (LibraryDomain and RoadmapView.library, MeasureRowView.label,
 *                     CurrentMilestoneView.stepDone/practiceKept/paidOn, titleClass on the milestone rows
 *                     and the Aim card, MilestoneDraft.titleFlags/titleStruck/titleReasons,
 *                     ItemDraft.reasons, RunView.wrote/capped, StartPreview.payBasis and pay.paidOn,
 *                     StartPracticeRow.weeklyMinutes, StartSnapshot.aftercareKept, the runs' `error`)
 *   Fix round 2       AimCardView.acceptedDay with isAcceptanceReading; titleStruck on MilestoneRowView
 *                     and AimCardMilestone; RoadmapView.acceptedRun and RoadmapView.positions
 *   Goal seam types   RoadmapSeriesPoint · RoadmapGoalEntry (declared in goals.ts, re-exported)
 */
import { MASTERY_LEVEL, baseIntervalDays } from "./xp";
import { addDays, dayKeyOf, daysBetween, type DayKey } from "./life-day";
import { isFixedSchedule, occurrencesBetween, parseRule, periodOf, type Rule, type RuleLike } from "./recurrence";
import { instanceOutcome, outcomesOf, targetUnits, type InstanceLike } from "./habit";
import { WEEK_JUDGE_LAG_DAYS, type LifeEnv } from "./life-economy";
import { SETTLE_LAG_DAYS } from "./duty-economy";
import { DURATION_BAND_MINUTES } from "./life-lexicon";
import type { Category, Track } from "./life-types";
import type { RoadmapGoalEntry, RoadmapSeriesPoint } from "./goals";

export type { RoadmapGoalEntry, RoadmapSeriesPoint };

// ═══ Gate and strings ═══════════════════════════════════════════════════════

/**
 * Start is hidden (not disabled) while false: "Starting milestones arrives
 * with the next update". The lead flips it after the goal seams land and the
 * reviewers pass (F16 seam 15). Nothing else reads it as a launch gate.
 */
export const ROADMAP_GOALS_LIVE = false;

/** Every roadmap user action's refusal on a server with writes off (decision 13), the ROADMAP close included. */
export const ROADMAP_WRITES_OFF = "Roadmap changes are recorded only on the live app";

/** The label on every live value a writes-off server shows (a dev server sharing the database). */
export const NOT_RECORDED_HERE = "not recorded on this server";

/** What a lane-0 shell answers until its lane implements it. */
export const ROADMAP_NOT_YET = "Not yet.";

/** Every roadmap Server Action's result: the house `{ok, value} | {ok, error}` shape. Actions never throw. */
export type RoadmapActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A shell's body: throws `Not yet: <what>` (a lane replaces every call). */
export function notYet(what: string): never {
  throw new Error(`${ROADMAP_NOT_YET.replace(/\.$/, "")}: ${what}`);
}

/** Set to '1' by scripts/_no-model.ts; the default callModel refuses to run under it (F5). */
export const ROADMAP_CHECK_ENV = "ROADMAP_CHECK";

/** The Aim card's empty line, dismissed for a year (dismissAimPrompt); the /you page reads it on the server. */
export const AIM_PROMPT_COOKIE = "xtnl-aim-prompt";
export const AIM_PROMPT_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/**
 * What every roadmap writer takes besides its arguments. Every write is
 * gated by life-economy lifeWritesEnabled(env) (decision 13): with writes off
 * a writer writes nothing and a user action refuses with ROADMAP_WRITES_OFF.
 * The checks inject env; lanes may add optional deps (a client, defer, a clock).
 */
export interface RoadmapWriteOpts {
  env?: LifeEnv;
}

/** Why a roadmap step wrote nothing (reported in the crons' `roadmap: {…}` JSON). */
export type RoadmapSkip = "WRITES_OFF" | "THROTTLED" | "NO_ROADMAP" | "MISSING_TABLE";

/**
 * recordRoadmapReadings' result (F10). The writer never throws: a failure
 * comes back as `error` (with nothing written), and the step that called it
 * reports it through roadmapStepErrorsOf (fix round).
 */
export interface ReadingsRun {
  /** Reading rows written (unchanged values write nothing). */
  written: number;
  /** Reach transitions applied (set, pended, cleared or confirmed). */
  reaches: number;
  skipped: RoadmapSkip | null;
  /** The failure in words, when the writer caught one (a missing table is `skipped: "MISSING_TABLE"`, not an error). */
  error?: string;
}

/** freezeWeekQuests' result (F14): sets inserted (0 when one already existed). Never throws; a caught failure is `error`. */
export interface QuestFreezeRun {
  froze: number;
  skipped: RoadmapSkip | null;
  error?: string;
}

/** finalizeQuestWeeks' result (F14). Never throws; a caught failure is `error`. */
export interface QuestFinalizeRun {
  finalized: number;
  skipped: RoadmapSkip | null;
  error?: string;
}

/**
 * The roadmap step of the maintenance chain and the life cron (settle →
 * judge → roadmap; F16 seam 8): freeze, then readings, then finalise, each in
 * its own try. A part that threw is null with its message in `errors`; a part
 * that returned `error` keeps its result and its message joins `errors` too
 * (roadmapStepErrorsOf). The cron's status stays what settle and the judge set.
 */
export interface RoadmapStepReport {
  freeze: QuestFreezeRun | null;
  readings: ReadingsRun | null;
  finalize: QuestFinalizeRun | null;
  errors: string[];
}

/**
 * The `errors` lines for the parts of a roadmap step that returned an error
 * instead of throwing (the writers never throw, so a try/catch alone reports
 * nothing): "freeze: …", "readings: …", "finalize: …", in that order. Lane
 * G's runRoadmapStep and recordRoadmapAfterDegrade append these to the
 * report's `errors` (F16 seam 8: "a roadmap failure is logged and reported").
 */
export function roadmapStepErrorsOf(parts: {
  freeze?: QuestFreezeRun | { error?: string } | null;
  readings?: ReadingsRun | { error?: string } | null;
  finalize?: QuestFinalizeRun | { error?: string } | null;
}): string[] {
  const out: string[] = [];
  for (const key of ["freeze", "readings", "finalize"] as const) {
    const e = parts[key]?.error;
    if (typeof e === "string" && e.trim()) out.push(`${key}: ${e.trim()}`);
  }
  return out;
}

// ═══ Unions (TEXT columns, migration life_roadmap) ══════════════════════════

/** Roadmap.status. At most one DRAFT or ACTIVE per user (decision 15). */
export type RoadmapStatus = "DRAFT" | "ACTIVE" | "DONE" | "ARCHIVED";
export const ROADMAP_STATUSES: readonly RoadmapStatus[] = ["DRAFT", "ACTIVE", "DONE", "ARCHIVED"];

/** RoadmapMilestone.status. CLOSED, DROPPED and REACHED are derived, never stored. LATER rows have no dates. */
export type MilestoneStatus = "DRAFT" | "PLANNED" | "STARTING" | "STARTED" | "LATER" | "SUPERSEDED" | "DISCARDED";
export const MILESTONE_STATUSES: readonly MilestoneStatus[] = ["DRAFT", "PLANNED", "STARTING", "STARTED", "LATER", "SUPERSEDED", "DISCARDED"];

/** Who wrote a string: RoadmapMilestone.titleOrigin and RoadmapItem.origin. */
export type Origin = "GEMINI" | "CODE" | "USER" | "SYLLABUS";
export const ORIGINS: readonly Origin[] = ["GEMINI", "CODE", "USER", "SYLLABUS"];

/** What the user did with it: titleDecision and decision. */
export type Decision = "PENDING" | "KEPT" | "CHECKED" | "EDITED" | "REMOVED";
export const DECISIONS: readonly Decision[] = ["PENDING", "KEPT", "CHECKED", "EDITED", "REMOVED"];

/** RoadmapItem.kind. DOMAIN → Domain.id; STEP → a goal step; CHECKPOINT is context only. */
export type ItemKind = "DOMAIN" | "TOPIC" | "PRACTICE" | "STEP" | "CHECKPOINT";
export const ITEM_KINDS: readonly ItemKind[] = ["DOMAIN", "TOPIC", "PRACTICE", "STEP", "CHECKPOINT"];

/** RoadmapItem.planSource: who set sessions, band and rule. */
export type PlanSource = "WORKED_OUT" | "YOURS";

/** RoadmapMeasure.kind (closed). PROFICIENCY is a reading, never a measure row. */
export type MeasureKind = "CARDS_AT_LEVEL" | "PRACTICE_KEPT" | "CHECKPOINT";
export const MEASURE_KINDS: readonly MeasureKind[] = ["CARDS_AT_LEVEL", "PRACTICE_KEPT", "CHECKPOINT"];
export type MeasureRole = "PAYS" | "CONTEXT";
export type TargetSource = "WORKED_OUT" | "YOURS";
/** Where a scope's new-card pace comes from, in order: the scope, the Area Field, the user's typed rate, none. */
export type RateSource = "SCOPE" | "FIELD" | "YOURS" | "NONE";
export const RATE_SOURCES: readonly RateSource[] = ["SCOPE", "FIELD", "YOURS", "NONE"];

export type RunKind = "GEMINI" | "INHOUSE" | "MANUAL";
export type RunStatus = "RUNNING" | "OK" | "PARTIAL" | "FAILED" | "CAPPED" | "REUSED";
export type ReadingSource = "COMPUTED" | "SELF";

/** Practice methods (recurring). Each has METHOD_HOW copy in roadmap-copy.ts. */
export type PracticeMethod = "DELIBERATE_PRACTICE" | "READING" | "PROJECT_WORK" | "COACHED_SESSION" | "WORKOUT" | "WRITING";
export const PRACTICE_METHODS: readonly PracticeMethod[] = ["DELIBERATE_PRACTICE", "READING", "PROJECT_WORK", "COACHED_SESSION", "WORKOUT", "WRITING"];

/** Checkpoint kinds. The bar and outOf are always the user's (YOURS). */
export type CheckpointKind = "MOCK_TEST" | "PERFORMANCE_CHECK" | "SELF_TEST";
export const CHECKPOINT_KINDS: readonly CheckpointKind[] = ["MOCK_TEST", "PERFORMANCE_CHECK", "SELF_TEST"];

/** Practice duration bands (a subset of life-types DurationBand; minutes from life-lexicon DURATION_BAND_MINUTES). */
export type PracticeBand = "D15" | "D20" | "D30" | "D45" | "D60" | "D90" | "D120";
export const PRACTICE_BANDS: readonly PracticeBand[] = ["D15", "D20", "D30", "D45", "D60", "D90", "D120"];

export type StartPoint = "NEW" | "BASICS" | "WORKING" | "STRONG";
export const START_POINTS: readonly StartPoint[] = ["NEW", "BASICS", "WORKING", "STRONG"];

export type Intensity = "LIGHT" | "STEADY" | "PUSH";
export const INTENSITIES: readonly Intensity[] = ["LIGHT", "STEADY", "PUSH"];

/**
 * Blocking flags (F6): the item is excluded from bulk keep and needs its own
 * tap with the reason visible; a NUMBER item offers only Edit or Remove.
 */
export type BlockingFlag =
  | "NUMBER"
  | "LOOKS_LIKE_RESOURCE"
  | "PROPER_NOUN"
  | "CLAIM_WORDS"
  | "ABOUT_YOU"
  | "CONSTRAINT_CONFLICT"
  | "HEALTH"
  | "MATCHED_EXISTING"
  | "TOPIC_OUTSIDE_SCOPE"
  | "AIM_STEP_EARLY"
  | "LANGUAGE_UNCHECKED";
export const BLOCKING_FLAGS: readonly BlockingFlag[] = [
  "NUMBER",
  "LOOKS_LIKE_RESOURCE",
  "PROPER_NOUN",
  "CLAIM_WORDS",
  "ABOUT_YOU",
  "CONSTRAINT_CONFLICT",
  "HEALTH",
  "MATCHED_EXISTING",
  "TOPIC_OUTSIDE_SCOPE",
  "AIM_STEP_EARLY",
  "LANGUAGE_UNCHECKED",
];

/** Notes (shown, never blocking). PLACEHOLDER marks the starter's "Practice for <aim>" (F7). */
export type ItemNote = "CHECK_LINK" | "ADDED_TO_SCOPE" | "RAISED" | "STUDY_ADDED" | "PLACEHOLDER";
export const ITEM_NOTES: readonly ItemNote[] = ["CHECK_LINK", "ADDED_TO_SCOPE", "RAISED", "STUDY_ADDED", "PLACEHOLDER"];

/** "Targets vs your pace": FITTED for a code-fitted target (no verdict); the rest only for a typed (YOURS) target. */
export type KnowledgeVerdict = "FITTED" | "FITS" | "TIGHT" | "OVER" | "IMPOSSIBLE";
/** "App-tracked time", for the worst calendar week. UNVERIFIED is a flag beside it, never a verdict of its own. */
export type TimeVerdict = "FITS" | "TIGHT" | "OVER";

/** The remedies, one tap each (F4 step 9): (a) move the date, (b) re-fit at Light, (d) move trailing milestones to Later. */
export type Remedy = "MOVE_DATE" | "REFIT_LIGHT" | "MOVE_TO_LATER";
export const REMEDIES: readonly Remedy[] = ["MOVE_DATE", "REFIT_LIGHT", "MOVE_TO_LATER"];

/** A re-plan in v1: a re-fit to the user's numbers, or by hand. REDRAFT is Deferred. */
export type ReplanKind = "REFIT" | "MANUAL";

/** Behind-pace signals; shown on the Roadmap page and the Aim card only, never on Today or in the bell. */
export type ReplanTrigger = "BEHIND" | "SLIPPED" | "PRACTICE_LOW" | "CARRIED" | "CHECKPOINT_MISMATCH" | "PACE_MEASURED" | "QUESTS_BEHIND";
export const REPLAN_TRIGGERS: readonly ReplanTrigger[] = ["BEHIND", "SLIPPED", "PRACTICE_LOW", "CARRIED", "CHECKPOINT_MISMATCH", "PACE_MEASURED", "QUESTS_BEHIND"];

/** The Gemini key's billing tier (question 5). FREE shows the form's free-tier line; PAID drops it. */
export type GeminiKeyTier = "FREE" | "PAID";

// ═══ Intake constants ═══════════════════════════════════════════════════════

export const AIM_MAX = 140;
export const CONSTRAINTS_MAX = 280;
export const EXAM_MAX = 80;
export const SOURCE_NOTE_MAX = 120;
export const SYLLABUS_MAX_LINES = 40;
export const SYLLABUS_LINE_MAX = 120;
export const HOURS_MIN = 1;
export const HOURS_MAX = 40;
export const TYPICAL_HOURS_MIN = 1;
export const TYPICAL_HOURS_MAX = 5000;
export const NEW_CARDS_PER_WEEK_MIN = 0;
export const NEW_CARDS_PER_WEEK_MAX = 100;
/** The shortest aim: under it, "Too short for a roadmap — capture it as a goal on Today." */
export const SPAN_MIN_DAYS = 35;
/** The furthest aim in v1 (no "Beyond this plan" tail): "Set where you want to be in 3 years". */
export const SPAN_MAX_DAYS = 1080;

/** Where the user starts sets only the first level threshold's floor. */
export const START_POINT_FLOOR: Readonly<Record<StartPoint, number>> = { NEW: 4, BASICS: 4, WORKING: 6, STRONG: 6 };

/** How hard: scales every fitted target (target = baseline + floor(intensity × (expected − baseline))). */
export const INTENSITY: Readonly<Record<Intensity, number>> = { LIGHT: 0.5, STEADY: 0.7, PUSH: 0.9 };
export const DEFAULT_INTENSITY: Intensity = "STEADY";

/** The life tracks an Area or a practice can count toward. CRAFT is the default for a Field Area. */
export const ROADMAP_TRACKS: readonly Track[] = ["CRAFT", "BODY", "CARE", "DUTY"];
export const DEFAULT_FIELD_TRACK: Track = "CRAFT";

/** Words that make an aim a credential aim (plus any all-caps token of 2–6 letters, or any exam label). */
export const CREDENTIAL_WORDS: readonly string[] = [
  "exam",
  "test",
  "certificate",
  "certification",
  "certified",
  "licence",
  "license",
  "degree",
  "diploma",
  "qualification",
  "accreditation",
];

// ═══ Milestone constants ════════════════════════════════════════════════════

export const MILESTONE_TARGET_DAYS = 75;
export const MAX_MILESTONES = 6;
export const MILESTONE_MIN_DAYS = 35;
/** 180 plus Sunday-snap slack; 6 × 186 ≥ 1,080, so every span splits. Policy: a longer stretch is too coarse to steer. */
export const MILESTONE_MAX_DAYS = 186;

export const DOMAINS_PER_MILESTONE = 4;
export const NEW_DOMAINS_PER_MILESTONE = 2;
export const TOPICS_PER_MILESTONE = 6;
export const PRACTICES_PER_MILESTONE = 3;
export const STEPS_PER_MILESTONE = 3;
export const CHECKPOINTS_PER_MILESTONE = 1;

/** Level thresholds, set by code, never by the model. */
export const THRESHOLDS: readonly number[] = [4, 6, 8, 10, 12];
/** Milestone i starts from the highest L with floorBase(L) ≤ this share of the days to its due day. */
export const THRESHOLD_SPAN_SHARE = 0.6;

export const MIN_INCREMENT_CARDS_FLOOR = 3;
export const MIN_INCREMENT_SHARE = 0.1;

/** The practice target is round(KEEP_SHARE × planned units after held days). */
export const KEEP_SHARE = 0.8;
/** Start needs the due day more than 30 days away. */
export const START_MIN_DAYS_TO_DUE = 31;
/** A milestone states ⬡ 6 only with at least this many practice minutes a week … */
export const PRACTICE_PAY_FLOOR_MIN = 60;
/** … that are at least this share of its planned tracked minutes (decision 8). */
export const PRACTICE_PAY_SHARE = 1 / 3;
/** Practices get this share of the time left after reviews and new cards. */
export const PRACTICE_BUDGET_SHARE = 0.8;
export const SESSIONS_MIN = 1;
export const SESSIONS_MAX = 7;

export const METHOD_DEFAULT_BAND: Readonly<Record<PracticeMethod, PracticeBand>> = {
  DELIBERATE_PRACTICE: "D30",
  READING: "D30",
  WRITING: "D30",
  PROJECT_WORK: "D60",
  COACHED_SESSION: "D60",
  WORKOUT: "D45",
};

/** Label caps (the response schema's maxLength, and the editor's). */
export const MILESTONE_TITLE_MAX = 80;
export const NEW_DOMAIN_NAME_MAX = 40;
export const NEW_DOMAIN_WORDS_MAX = 4;
export const TOPIC_LABEL_MAX = 80;
export const PRACTICE_NAME_MAX = 60;
export const STEP_TITLE_MAX = 80;
export const CHECKPOINT_LABEL_MAX = 60;
export const RAW_LABEL_MAX = 200;

/** A STARTING row older than this with no goal can be returned to PLANNED by the user. */
export const STARTING_STALE_MS = 10 * 60_000;
/** The accept toast's Undo window. */
export const ACCEPT_UNDO_MS = 10_000;
/** "Target lowered 60 → 50 on 12 Nov (re-plan)" shows this long on the Aim card and the roadmap header. */
export const TARGET_LOWERED_SHOW_DAYS = 28;

// ═══ Spaced-repetition floors (computed from xp.ts, never hard-coded) ═══════

/** The current max of the level ladder the floors read (xp.ts MASTERY_LEVEL, re-exported). Levels 13–20 count as it. */
export const TOP_LEVEL = MASTERY_LEVEL;
/** The levels whose interval srs.ts jitters by × [0.75, 1.25] (xp.ts nextIntervalDays). */
export const JITTER_LEVEL_MIN = 5;
export const JITTER_LEVEL_MAX = 8;
export const JITTER_LOW = 0.75;

/** interval(l) = round(BASE_INTERVAL_DAYS[l] × m), m = the current modifiers.intervalMultiplier. */
export function interval(level: number, m = 1): number {
  return Math.round(baseIntervalDays(level) * m);
}

/** strictInterval(l): the jitter's lower bound for levels 5–8 (× 0.75), interval(l) elsewhere. */
export function strictInterval(level: number, m = 1): number {
  if (level >= JITTER_LEVEL_MIN && level <= JITTER_LEVEL_MAX) return Math.round(baseIntervalDays(level) * JITTER_LOW * m);
  return interval(level, m);
}

function sumIntervals(from: number, to: number, m: number, strict: boolean): number {
  let sum = 0;
  for (let l = from; l <= to; l++) sum += strict ? strictInterval(l, m) : interval(l, m);
  return sum;
}

/**
 * floorBase(L) = Σ_{l=2..L−1} interval(l): the fewest days a new card needs
 * to reach L when every review passes on its day (a new card is created at
 * level 1 and due at once; a pass on day 0 reaches level 2). 0 for L ≤ 2.
 */
export function floorBase(level: number, m = 1): number {
  return sumIntervals(2, level - 1, m, false);
}

/** floorStrict(L): the same sum with strictInterval, the earliest even a lucky jitter allows. */
export function floorStrict(level: number, m = 1): number {
  return sumIntervals(2, level - 1, m, true);
}

/**
 * LEVEL_WEIGHT(l) = floorBase(l) at m = 1: the days of review spacing a card
 * has come through to reach level l (F12). 0 for levels 1 and 2. Base
 * spacing, so a loadout's m never moves Proficiency.
 */
export function LEVEL_WEIGHT(level: number): number {
  return floorBase(level, 1);
}

/** A card as the engines read it: its level, due day and the life day its grace ends (null: none). */
export interface CardState {
  level: number;
  dueDay: DayKey;
  /** dayKeyOf(Idea.graceEndsAt); null when unset. */
  graceEndsDay: DayKey | null;
  /** The life day it was created (dayKeyOf(Idea.createdAt)), where a reader needs it. */
  createdDay?: DayKey;
  domainId?: string;
}

/** A card's state after the degrade cron has had its say. */
export interface EffectiveCard {
  level: number;
  dueDay: DayKey;
}

/**
 * The effective state of an existing card (Constants):
 *   past its grace (graceEndsDay < today): (ℓ − 1, today), because the degrade cron will lower it;
 *   overdue within grace (dueDay < today): (ℓ, today);
 *   otherwise (ℓ, dueDay).
 */
export function effectiveState(card: CardState, today: DayKey): EffectiveCard {
  if (card.graceEndsDay != null && card.graceEndsDay < today) return { level: Math.max(1, card.level - 1), dueDay: today };
  if (card.dueDay < today) return { level: card.level, dueDay: today };
  return { level: card.level, dueDay: card.dueDay };
}

/** The passes an effective card still needs to reach L (k = L − ℓ; 0 when already there). */
export function passesNeeded(card: EffectiveCard, level: number): number {
  return Math.max(0, level - card.level);
}

/**
 * bestReach(L) = the effective due day + Σ_{l=ℓ+1..L−1} interval(l): the
 * first day the card can stand at L if every pass lands on its day. For a
 * card already at or above L it is its due day; callers count those apart.
 */
export function bestReach(card: EffectiveCard, level: number, m = 1): DayKey {
  return addDays(card.dueDay, sumIntervals(card.level + 1, level - 1, m, false));
}

/** strictReach(L): bestReach with strict intervals (the IMPOSSIBLE floor). */
export function strictReach(card: EffectiveCard, level: number, m = 1): DayKey {
  return addDays(card.dueDay, sumIntervals(card.level + 1, level - 1, m, true));
}

/** existingBest(d): cards already at ≥ L, plus cards below L whose bestReach(L) ≤ d. */
export function existingBest(cards: readonly EffectiveCard[], level: number, d: DayKey, m = 1): number {
  let n = 0;
  for (const c of cards) if (c.level >= level || bestReach(c, level, m) <= d) n += 1;
  return n;
}

/** existingStrict(d): existingBest with strict intervals. */
export function existingStrict(cards: readonly EffectiveCard[], level: number, d: DayKey, m = 1): number {
  let n = 0;
  for (const c of cards) if (c.level >= level || strictReach(c, level, m) <= d) n += 1;
  return n;
}

/**
 * existingExpected(d) = cards already at ≥ L, plus Σ over cards below L of
 * p^k × [bestReach(L) ≤ d] (k the passes still needed; every pass must land,
 * since a miss costs a day and two misses degrade the card). Pass p = 1
 * while the pass rate is calibrating: expected is then the best case. Not
 * rounded.
 */
export function existingExpected(cards: readonly EffectiveCard[], level: number, d: DayKey, p: number, m = 1): number {
  let sum = 0;
  for (const c of cards) {
    if (c.level >= level) sum += 1;
    else if (bestReach(c, level, m) <= d) sum += Math.pow(p, passesNeeded(c, level));
  }
  return sum;
}

/** A closed span of life days. */
export interface DaySpan {
  from: DayKey;
  to: DayKey;
}

function toRule(rule: RuleLike): Rule | null {
  if (rule == null) return null;
  return typeof rule === "string" ? parseRule(rule) : rule;
}

const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);
const minDay = (a: DayKey, b: DayKey): DayKey => (a < b ? a : b);

function eligibleIn(from: DayKey, to: DayKey, held: ReadonlySet<DayKey>): number {
  if (from > to) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!held.has(d)) n += 1;
  return n;
}

/**
 * The units a rule plans over the eligible days of a span (pure; shared by
 * PRACTICE_KEPT, the realism plan and the week quests, F13):
 *   - a fixed-day rule (DAILY, WEEKDAYS, DOW, EVERY, MONTHLY): its scheduled
 *     occurrences on the eligible days (recurrence.ts occurrencesBetween);
 *   - TARGET:n/W (and /M): for each period clipped to the span,
 *     min(n, round(n × e ÷ the period's days)), e = the clipped period's
 *     eligible days; a Thursday start of a 3/W practice plans round(3 × 4 ÷ 7) = 2;
 *   - AFTER:n (never written by the roadmap): one on the first eligible day, then one per n;
 *   - a one-off or an unreadable rule: 0.
 * Held days (rest, sick, vacation, freeze) are not eligible. `days.startDay`
 * anchors EVERY's phase (default: days.from).
 */
export function plannedUnits(rule: RuleLike, days: DaySpan & { startDay?: DayKey }, held: Iterable<DayKey> = []): number {
  const r = toRule(rule);
  if (!r || days.from > days.to) return 0;
  const heldSet = new Set(held);
  if (r.kind === "TARGET") {
    let units = 0;
    let p = periodOf(r, days.from);
    while (p.start <= days.to) {
      const e = eligibleIn(maxDay(p.start, days.from), minDay(p.end, days.to), heldSet);
      const periodDays = daysBetween(p.start, p.end) + 1;
      units += Math.min(r.n, Math.round((r.n * e) / periodDays));
      p = periodOf(r, addDays(p.end, 1));
    }
    return units;
  }
  if (r.kind === "AFTER") {
    const e = eligibleIn(days.from, days.to, heldSet);
    return e > 0 ? Math.floor((e - 1) / r.n) + 1 : 0;
  }
  if (!isFixedSchedule(r)) return 0;
  return occurrencesBetween(r, days.startDay ?? days.from, days.from, days.to).filter((d) => !heldSet.has(d)).length;
}

/**
 * The kept units of one template over a span, by the PRACTICE_KEPT rules
 * (F10, F14), shared by R1's PRACTICE_KEPT and R6's PRACTICE progress:
 *   - TARGET: Σ over its periods clipped to the span of habit.ts
 *     targetUnits(...).kept, so a session beyond n in a period counts
 *     nothing and two ticks on one day are one;
 *   - a fixed-day rule: the scheduled days in the span whose outcome is
 *     kept (habit.ts outcomesOf), so a tick on an unscheduled day counts nothing;
 *   - AFTER, or a one-off: the distinct days in the span with a kept
 *     instance (a one-off counts at most 1).
 * Kept is DONE or DONE_LATE (and a make-up slot for a TARGET); the minimum
 * version (DONE_MVV) holds and never keeps. Held days excuse, they never keep.
 */
export function keptUnits(rule: RuleLike, startDay: DayKey, days: DaySpan, instances: readonly InstanceLike[]): number {
  if (days.from > days.to) return 0;
  const r = toRule(rule);
  if (r?.kind === "TARGET") {
    let units = 0;
    let p = periodOf(r, days.from);
    while (p.start <= days.to) {
      units += targetUnits(r, { start: maxDay(p.start, days.from), end: minDay(p.end, days.to) }, instances).kept;
      p = periodOf(r, addDays(p.end, 1));
    }
    return units;
  }
  if (r && isFixedSchedule(r)) {
    return outcomesOf(r, startDay, days.to, instances, { since: days.from }).filter((o) => o.outcome === "kept").length;
  }
  const keptDays = new Set<DayKey>();
  for (const i of instances) {
    if (i.day < days.from || i.day > days.to) continue;
    if (instanceOutcome([i.status]) === "kept") keptDays.add(i.day);
  }
  return r ? keptDays.size : Math.min(1, keptDays.size);
}

/** n = clamp(round(span ÷ MILESTONE_TARGET_DAYS), 1, MAX_MILESTONES): the milestone count for a span in days. */
export function milestoneCountFor(spanDays: number): number {
  return Math.min(MAX_MILESTONES, Math.max(1, Math.round(spanDays / MILESTONE_TARGET_DAYS)));
}

/** MIN_INCREMENT_CARDS = max(3, ceil(0.1 × baseline)): the smallest card gain that makes a milestone. */
export function minIncrementCards(baseline: number): number {
  return Math.max(MIN_INCREMENT_CARDS_FLOOR, Math.ceil(MIN_INCREMENT_SHARE * Math.max(0, baseline)));
}

/** Minutes of a practice band (life-lexicon DURATION_BAND_MINUTES). */
export function practiceBandMinutes(band: PracticeBand): number {
  return DURATION_BAND_MINUTES[band];
}

// ═══ Realism constants (F4) ═════════════════════════════════════════════════

/** Declared hours count at this factor while adherence is calibrating (A = 0.7, time verdict UNVERIFIED). */
export const DECLARED_FACTOR = 0.7;
/** Adherence A is clamped to [ADHERENCE_FLOOR, 1] … */
export const ADHERENCE_FLOOR = 0.3;
/** … and reads calibrating below this many judged occurrences … */
export const ADHERENCE_MIN_JUDGED = 8;
/** … over live recurring templates with band ≥ STANDARD and estMinutes ≥ this. */
export const ADHERENCE_MIN_MINUTES = 20;
export const ADHERENCE_MIN_BAND = "STANDARD" as const;
/** rampCap = max(RAMP_FLOOR_MIN, RAMP_ALLOWANCE × p50 weekly tracked minutes), once calibrated. */
export const RAMP_ALLOWANCE = 0.5;
export const RAMP_FLOOR_MIN = 120;
/** The pass share p is calibrating below this many reviews in PASS_SHARE_WINDOW_DAYS life days. */
export const PASS_SHARE_MIN_REVIEWS = 30;
export const PASS_SHARE_WINDOW_DAYS = 28;
/** Time ratio for the worst calendar week: ≤ 0.8 FITS, ≤ 1.0 TIGHT, > 1.0 OVER. */
export const TIME_FITS_MAX = 0.8;
export const TIME_TIGHT_MAX = 1.0;
/** Measured adherence below this (≥ 8 judged) with ≥ ADHERENCE_LOW_SESSIONS sessions a week added gives TIGHT. */
export const ADHERENCE_LOW = 0.6;
export const ADHERENCE_LOW_SESSIONS = 3;
/** Clearance below this over CLEARANCE_WINDOW_DAYS gives TIGHT when new cards are planned. */
export const CLEARANCE_MIN = 0.8;
export const CLEARANCE_WINDOW_DAYS = 14;
/** "assumed — card writing isn't timed". */
export const CARD_WRITE_MIN = 5;
/** "assumed — reviews aren't timed" (review-facts minutesFor). */
export const REVIEW_SECONDS = 20;
/** The scope's pace is its median new cards per life week over 8 weeks, with ≥ 4 weeks of history and a median > 0. */
export const PACE_WINDOW_WEEKS = 8;
export const PACE_MIN_WEEKS = 4;

// ═══ Throughput (F3) ════════════════════════════════════════════════════════

/** A weekly figure is calibrating until this many life weeks count. */
export const CALIBRATION_WEEKS = 4;
/** A life week counts when this many of its days are ≥ epochDay and not held (sums pro-rated × 7 ÷ eligible days). */
export const WEEK_MIN_ELIGIBLE_DAYS = 4;
/** finalDay = today − this (M2's settle lag). */
export const THROUGHPUT_LAG_DAYS = SETTLE_LAG_DAYS;
/** Idea.createdAt is complete since about here; new-card paces read no earlier. */
export const NEW_CARDS_SINCE: DayKey = "2026-07-28";
/** REVIEW_FRACTION ledger rows carry passes since here. */
export const REVIEW_PASSES_SINCE: DayKey = "2026-08-12";

/** A weekly figure (minutes, completions, new cards …): ESTIMATED where it is minutes. */
export type WeeklyFigure =
  | { kind: "calibrating"; have: number; need: number }
  | { kind: "measured"; median: number; p25: number; weeks: number };

/** A share (pass share, adherence, clearance) in [0, 1], with the count it rests on. */
export type ShareFigure = { kind: "calibrating"; have: number; need: number } | { kind: "measured"; value: number; n: number };

/** What throughput.ts computes (read-only; one cached wave in throughput-server.ts). */
export interface Throughput {
  /** today − THROUGHPUT_LAG_DAYS; the last day any figure reads. */
  finalDay: DayKey;
  /** Receipt minutes of TASK rows not undone, study-linked auto rows excluded (ESTIMATED). */
  trackedMinutes: WeeklyFigure;
  /** The share of those minutes sized by Gemini (machineMinutes from applySizing), 0..1; null with none. */
  geminiShare: number | null;
  /** #play minutes inside trackedMinutes (included and labelled). */
  playMinutes: WeeklyFigure;
  trackedByTrack: Partial<Record<Track, WeeklyFigure>>;
  trackedByCategory: Partial<Record<Category, WeeklyFigure>>;
  completions: WeeklyFigure;
  activeDays: WeeklyFigure;
  /** kept ÷ (kept + missed) over live recurring STANDARD+ templates of ≥ 20 min. */
  adherence: ShareFigure;
  /** Review attempts a day ('bf:' keys excluded). */
  reviewsPerDay: WeeklyFigure;
  /** p over PASS_SHARE_WINDOW_DAYS; always noted "reads high" (neglect lapses aren't logged). */
  passShare: ShareFigure;
  /** Σ min(reviews_d, open_d) ÷ Σ open_d over CLEARANCE_WINDOW_DAYS, from DAY_OPEN. */
  clearance: ShareFigure;
  newCards: { total: WeeklyFigure; byField: Record<string, WeeklyFigure>; byDomain: Record<string, WeeklyFigure> };
}

// ═══ Pace and re-plan triggers (F11) ════════════════════════════════════════

/** BEHIND: the pipeline's expected day is more than this many days after the due day. */
export const BEHIND_DAYS = 14;
/** PRACTICE_LOW: kept share below this over PRACTICE_LOW_WEEKS weeks, with ≥ PRACTICE_LOW_MIN_UNITS planned. */
export const PRACTICE_LOW = 0.5;
export const PRACTICE_LOW_WEEKS = 4;
export const PRACTICE_LOW_MIN_UNITS = 8;
/** CARRIED: closed Carried, or rescheduled by more than this many days. */
export const CARRIED_RESCHEDULE_DAYS = 14;
/** An expected day further than this reads "far". */
export const FAR_WEEKS = 104;
/** The full readings writer runs at most once per user per this many ms from the chain (the crons always run it). */
export const READINGS_THROTTLE_MS = 10 * 60_000;
/** REACH_CONFIRM_DAYS = SETTLE_LAG_DAYS: a reach that rests on ticks counts once g = 1 has held this long. */
export const REACH_CONFIRM_DAYS = SETTLE_LAG_DAYS;

// ═══ Model (F5, F8) ═════════════════════════════════════════════════════════

/** The only proven id; the approved probe may switch it. */
export const ROADMAP_MODEL = "gemini-3.5-flash-lite";
export const ROADMAP_PROMPT_VERSION = 2;
/** One draft per request in v1; the consensus module is Deferred (decision 3). */
export const ROADMAP_SAMPLES = 1;
/** seedBase = SEED_BASE + SEED_REDRAFT_STEP × forced redrafts today for this roadmap; each sample adds its offset. */
export const SEED_BASE = 11;
export const SEED_REDRAFT_STEP = 100;
export const SEED_OFFSETS: readonly number[] = [0, 12, 26];
/** The SDK abortSignal; it does not cancel a request Google has received (still charged, still counted). */
export const ROADMAP_ABORT_MS = 35_000;
/** withModelTimeout's backstop: the abort plus 2 s. */
export const ROADMAP_BACKSTOP_MS = ROADMAP_ABORT_MS + 2_000;
/** A second claim is refused while a run is RUNNING and younger than this. */
export const RUN_CLAIM_GUARD_MS = 60_000;
/** An older RUNNING run reads FAILED "timed out". */
export const RUN_STALE_MS = 90_000;
export const ROADMAP_MAX_OUTPUT_TOKENS = 6000;
/** thinkingConfig {thinkingLevel: 'LOW'} only if the probe proves the model accepts it. */
export const ROADMAP_THINKING_LOW = false;
/** The user's answer to question 5: the key is on the free tier (drives the form's free-tier line). */
export const GEMINI_KEY_TIER: GeminiKeyTier = "FREE";
export const ROADMAP_DRAFTS_PER_DAY = 5;
export const ROADMAP_REUSE_DAYS = 7;
export const PACK_MAX_DOMAINS = 40;
/** Mirrors taxonomy MAX_NAME_LENGTH. */
export const PACK_NAME_MAX = 80;
/** Counts in the inputHash are bucketed to this. */
export const PACK_COUNT_BUCKET = 5;
export const RAW_SAMPLE_MAX = 32 * 1024;
/** The review screen's alarm banner fires when more than this share of items carry a blocking flag. */
export const UNVERIFIED_ALARM = 0.5;
/** Corpus target: the alarm fires on fewer than this share of drafts (credential and non-English excluded). */
export const ALARM_CORPUS_MAX = 0.2;
/** "usually about 18 s" appears once this many runs have a latency. */
export const LATENCY_MIN_RUNS = 5;
/** The page refreshes this often while a run is RUNNING, for at most DRAFT_REFRESH_MAX_MS. */
export const DRAFT_REFRESH_MS = 3_000;
export const DRAFT_REFRESH_MAX_MS = 75_000;
/** LANGUAGE_CHECK: non-English when under this share of the aim's letters are ASCII … */
export const LANGUAGE_ASCII_MIN = 0.85;
/** … or when it has at least this many words and none is in ENGLISH_FUNCTION_WORDS. */
export const LANGUAGE_MIN_WORDS = 4;
/** A frozen list of 60 English function words (LANGUAGE_CHECK). */
export const ENGLISH_FUNCTION_WORDS: readonly string[] = [
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in",
  "on", "at", "by", "for", "with", "from", "as", "is", "are", "was",
  "were", "be", "been", "being", "it", "its", "this", "that", "these", "those",
  "i", "my", "me", "we", "our", "you", "your", "he", "she", "they",
  "them", "their", "not", "no", "do", "does", "did", "have", "has", "had",
  "will", "would", "can", "could", "should", "may", "might", "must", "so", "than",
];

// ═══ Runs: the draft cap and who wrote the rows (F8; fix round) ═════════════

/**
 * Whether a run counts toward ROADMAP_DRAFTS_PER_DAY: every GEMINI run of
 * the life day except a REUSED one (RUNNING, OK, PARTIAL, FAILED and CAPPED
 * all count; the spec's literal rule). The one definition: R3's
 * draftsCountedToday / draftCapReached / draftsLeftToday and R4's
 * claimPlanOf read it, and R4's SQL guard mirrors it as
 * `kind = 'GEMINI' AND status <> 'REUSED'`.
 */
export function countsTowardDraftCap(run: { kind: RunKind | string; status: RunStatus | string }): boolean {
  return run.kind === "GEMINI" && run.status !== "REUSED";
}

/**
 * Who wrote the draft rows a page shows (provenance of the plan as a whole):
 * Gemini (an OK, PARTIAL or REUSED Gemini run), the in-house starter (an
 * INHOUSE run, or a FAILED Gemini run that wrote the starter in its place),
 * or the user's manual builder. "STARTER" is that FAILED fallback.
 */
export type RunWriter = "GEMINI" | "INHOUSE" | "MANUAL" | "STARTER";

/** RoadmapRun.report.fallback on a FAILED Gemini run that wrote R2's starter in its place (runDraftCore's FAILED persist). */
export const RUN_FALLBACK_STARTER = "STARTER";

/**
 * What a run wrote, or null when it wrote no rows: a CAPPED run (nothing
 * written), a RUNNING run (not yet), and a FAILED run with no starter
 * fallback (the roadmap changed, it was superseded, or the catch path).
 * `fallback` is the stored report's `fallback` field.
 */
export function runWriterOf(run: { kind: RunKind | string; status: RunStatus | string; fallback?: string | null }): RunWriter | null {
  if (run.status === "FAILED") return run.kind === "GEMINI" && run.fallback === RUN_FALLBACK_STARTER ? "STARTER" : null;
  if (run.status !== "OK" && run.status !== "PARTIAL" && run.status !== "REUSED") return null;
  return run.kind === "GEMINI" || run.kind === "INHOUSE" || run.kind === "MANUAL" ? run.kind : null;
}

/**
 * The writer of the rows on screen: the newest run (runs newest first) that
 * wrote rows. A CAPPED "Draft again" over a Gemini draft therefore still
 * reads Gemini; a FAILED run that wrote nothing never relabels the rows.
 */
export function rowsWriterOf(runsNewestFirst: readonly { kind: RunKind | string; status: RunStatus | string; fallback?: string | null }[]): RunWriter | null {
  for (const r of runsNewestFirst) {
    const w = runWriterOf(r);
    if (w) return w;
  }
  return null;
}

/**
 * The run that wrote the ACCEPTED version (fix round 2): the newest run
 * (runs newest first) of that version (RoadmapRun.version, "the version its
 * milestones are written at") that wrote rows (runWriterOf not null).
 * `acceptedVersion` is the current acceptance's version (RoadmapAcceptance
 * .version, = Roadmap.version once accepted). A re-plan run (version + 1),
 * a CAPPED "Draft again" and a FAILED attempt never relabel the living plan,
 * so "How this was drafted" on an ACTIVE roadmap reads Gemini for an
 * accepted Gemini plan even with an in-house re-plan draft pending; an
 * accepted re-plan reads its own INHOUSE or MANUAL run. null: nothing
 * accepted (null, 0 or not a version), or no run of it wrote rows. R4 fills
 * RoadmapView.acceptedRun from it.
 */
export function acceptedRunOf<T extends { kind: RunKind | string; status: RunStatus | string; fallback?: string | null; version: number }>(
  runsNewestFirst: readonly T[],
  acceptedVersion: number | null | undefined
): T | null {
  if (typeof acceptedVersion !== "number" || !Number.isInteger(acceptedVersion) || acceptedVersion < 1) return null;
  for (const r of runsNewestFirst) if (r.version === acceptedVersion && runWriterOf(r)) return r;
  return null;
}

// ═══ Week quests (F13, F14) ═════════════════════════════════════════════════

export type WeekQuestKind = "RAISE" | "ADD" | "PRACTICE" | "STEP" | "CHECKPOINT";
export const WEEK_QUEST_KINDS: readonly WeekQuestKind[] = ["RAISE", "ADD", "PRACTICE", "STEP", "CHECKPOINT"];
export type WeekQuestEvidence = "TESTED" | "RECORDED" | "SELF_REPORTED";
export const WEEK_QUEST_EVIDENCE: readonly WeekQuestEvidence[] = ["TESTED", "RECORDED", "SELF_REPORTED"];
/** Which evidence verifies each kind (decision 24). */
export const WEEK_QUEST_EVIDENCE_OF: Readonly<Record<WeekQuestKind, WeekQuestEvidence>> = {
  RAISE: "TESTED",
  ADD: "RECORDED",
  PRACTICE: "SELF_REPORTED",
  STEP: "SELF_REPORTED",
  CHECKPOINT: "SELF_REPORTED",
};
export type WeekQuestState = "OPEN" | "HELD" | "PAST_DUE";
export const WEEK_QUEST_STATES: readonly WeekQuestState[] = ["OPEN", "HELD", "PAST_DUE"];
/** RoadmapQuestWeek.source: the life cron, Start, or the fallback (a chain run or a render). */
export type WeekQuestSource = "CRON" | "START" | "RENDER";
export type WeekQuestCap = "CATCHUP" | "CAPACITY";

export const WEEK_QUEST_GENERATOR_VERSION = 1;
export const WEEK_QUEST_CATCHUP_FACTOR = 1.5;
export const WEEK_QUEST_ADD_MIN_CAP = 3;
/** The CHECKPOINT quest appears once this share of the window has elapsed. */
export const WEEK_QUEST_CHECKPOINT_FROM = 0.8;
/** The most quests of each kind a week can hold: 1 RAISE + 1 ADD + 3 PRACTICE + 1 STEP + 1 CHECKPOINT. */
export const WEEK_QUEST_MAX_PER_KIND: Readonly<Record<WeekQuestKind, number>> = { RAISE: 1, ADD: 1, PRACTICE: 3, STEP: 1, CHECKPOINT: 1 };
/** = Σ WEEK_QUEST_MAX_PER_KIND (asserted; never binds). */
export const WEEK_QUESTS_PER_WEEK_MAX = 7;
/** Rows Today's card shows before its "n more" toggle. */
export const WEEK_QUEST_ROWS_TODAY = 3;
/** A week's results are written from its Sunday + this (life-economy WEEK_JUDGE_LAG_DAYS): the Wednesday 04:00 after. */
export const WEEK_QUEST_FINAL_LAG_DAYS = WEEK_JUDGE_LAG_DAYS;
/** QUESTS_BEHIND fires when a CATCHUP-capped week has fewer than this many writing weeks left. */
export const WEEK_QUEST_BEHIND_WRITING_WEEKS = 2;

/** True once a week (or a mid-week close) ending on `to` has settled: today ≥ to + WEEK_QUEST_FINAL_LAG_DAYS. */
export function isQuestWeekFinal(to: DayKey, today: DayKey): boolean {
  return daysBetween(to, today) >= WEEK_QUEST_FINAL_LAG_DAYS;
}

// ═══ Proficiency and the Aim rank (F12) ═════════════════════════════════════

/**
 * Renormalised over the parts present: a Field Area without practices reads
 * cards 0.8 / milestones 0.2 (0.6 ÷ 0.75 and 0.15 ÷ 0.75); a track Area reads
 * practice 0.625 / milestones 0.375 (0.25 ÷ 0.4 and 0.15 ÷ 0.4). The spec's
 * F12 prose says 0.75 / 0.25 for the first; that contradicts its own rule,
 * and R1 implements the rule (fix round: comment corrected).
 */
export const PROFICIENCY_WEIGHTS: Readonly<{ cards: number; practice: number; milestones: number }> = { cards: 0.6, practice: 0.25, milestones: 0.15 };
export const PROFICIENCY_VERSION = 1;

/** Indices 0–6. Disjoint from every other ladder in the app (roadmap-contract-check). */
export const AIM_RANKS = ["Initiate", "Aspirant", "Journeyman", "Specialist", "Expert", "Virtuoso", "Paragon"] as const;
export type AimRankName = (typeof AIM_RANKS)[number];
/** The milestone at place j carries rankIndex min(j, RANK_MILESTONE_MAX). */
export const RANK_MILESTONE_MAX = 5;
/** Paragon: never carried by a milestone; given when the aim is reached on a plan that has had ≥ PARAGON_MIN_MILESTONES scheduled. */
export const RANK_TOP = 6;
export const PARAGON_MIN_MILESTONES = 4;
/** How long the Aim card marks a new rank ("new 3 Nov"). */
export const RANK_NEW_DAYS = 7;

/**
 * The rankIndex a scheduled row at 1-based `place` gets: min(place,
 * RANK_MILESTONE_MAX, first), where `first` is the rankIndex its lineage got
 * the first time it was scheduled (none for a new lineage). Never below 1.
 */
export function rankIndexAt(place: number, first?: number | null): number {
  const cap = first != null && Number.isFinite(first) ? first : Infinity;
  return Math.max(1, Math.min(Math.floor(place), RANK_MILESTONE_MAX, cap));
}

/**
 * The top rank a plan can give: Paragon (with the aim) once it has had
 * PARAGON_MIN_MILESTONES or more scheduled in one version, else the name at
 * min(count, RANK_MILESTONE_MAX); Initiate (0) with none.
 */
export function topRankIndexOf(maxScheduled: number): number {
  if (maxScheduled >= PARAGON_MIN_MILESTONES) return RANK_TOP;
  return Math.max(0, Math.min(Math.floor(maxScheduled), RANK_MILESTONE_MAX));
}

/** AIM_RANKS[index], clamped to 0..RANK_TOP. */
export function aimRankName(index: number): AimRankName {
  return AIM_RANKS[Math.max(0, Math.min(RANK_TOP, Math.floor(index)))];
}

/** One milestone row as assignRankIndices reads it (F12). */
export interface RankRow {
  id: string;
  lineageId: string;
  ord: number;
  /** STARTING, STARTED, closed, dropped or reached: keeps its own rankIndex. */
  carried: boolean;
  /** LATER: gets null and keeps its lineage's first value for when it returns. */
  later: boolean;
  /** The row's current rankIndex (a carried row's is kept). */
  rankIndex: number | null;
}

/**
 * The signature roadmap-proficiency.ts implements (R1; acceptCore and replan
 * call it, R4): number the version's scheduled positions 1…n in plan order
 * (carried rows first, by ord), give each new row rankIndexAt(place, first of
 * its lineage), keep carried rows' values, and give LATER rows null.
 * `firstByLineage` holds each lineage's first scheduled rankIndex. Returns
 * row id → rankIndex.
 *
 * A place is a POSITION, not a row (fix round): rows that share a lineage —
 * a dropped row and its "Start again" copy — take one place between them, so
 * a milestone added after them gets its true place. Count positions with
 * positionCountOf / maxScheduledPositionsOf below.
 */
export type AssignRankIndices = (rows: readonly RankRow[], firstByLineage: Readonly<Record<string, number>>) => Record<string, number | null>;

// ═══ Milestone positions: one per lineage (F12, F15; fix round) ═════════════
//
// The one definition of "the milestone positions of a plan". A "Start again"
// copy replaces its dropped row rather than adding one (F12), so every count
// of milestones — the Aim rank's "scheduled in one version" (Paragon),
// acceptCore's total against MAX_MILESTONES, the places assignRankIndices
// numbers — counts distinct lineages, as Proficiency's basis already does.
// A STARTING or STARTED row whose lineage has a newer STARTING or STARTED row
// (its "Start again" copy, once that copy starts) is superseded: it is never
// measured again and its goal never pays ("replaced by Start again"), whatever
// happens to that goal later (an unarchive included). A copy still PLANNED
// supersedes nothing, so unarchiving the dropped goal before the copy starts
// undoes DROPPED as the spec says (F15, F22); the copy then cannot start while
// that goal is open (STARTED_ELSEWHERE), and Start's lineage-paid check states
// 0 if the original paid. At most one goal of a lineage ever pays.

/** A milestone row as the position helpers read it (RoadmapMilestone's columns). */
export interface PositionRow {
  id: string;
  lineageId: string;
  version: number;
  status: MilestoneStatus | string;
  rankIndex?: number | null;
  /** Orders a "Start again" copy (same version, same lineage) after the row it replaces: ISO string, epoch ms or Date; missing sorts first. */
  createdAt?: string | number | Date | null;
}

/** STARTING or STARTED: carried into every later version (closed, dropped and reached rows included). */
const CARRIED_POSITION: ReadonlySet<string> = new Set(["STARTING", "STARTED"]);
/** Rows that never held a scheduled place. */
const UNSCHEDULED: ReadonlySet<string> = new Set(["DRAFT", "DISCARDED"]);

function createdMs(v: PositionRow["createdAt"]): number {
  if (v == null) return -Infinity;
  if (typeof v === "number") return Number.isFinite(v) ? v : -Infinity;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : -Infinity;
}

/** `a` is newer than `b`: a higher version, then a later createdAt, then the larger id (a stable tie-break). */
export function isNewerRow(a: PositionRow, b: PositionRow): boolean {
  if (a.version !== b.version) return a.version > b.version;
  const ta = createdMs(a.createdAt);
  const tb = createdMs(b.createdAt);
  if (ta !== tb) return ta > tb;
  return a.id > b.id;
}

/**
 * A STARTING or STARTED row replaced by a newer STARTING or STARTED row of
 * its lineage (its "Start again" copy once that copy starts): never measured
 * again, and its goal pays 0 ("replaced by Start again"). R1's readingOpsFor
 * refuses it with a final refusal, R1's writers and loadRoadmapGoalSeries
 * skip it (an empty series with that note), R6 never picks it as the open
 * milestone, and lane G's unarchive and R4's views read it too. Any other
 * row (a PLANNED copy included): false.
 */
export function isSupersededRow(row: PositionRow, rows: readonly PositionRow[]): boolean {
  if (!CARRIED_POSITION.has(row.status)) return false;
  return rows.some((r) => r.id !== row.id && r.lineageId === row.lineageId && CARRIED_POSITION.has(r.status) && isNewerRow(r, row));
}

/** The positions among `rows`: their distinct lineages. acceptCore's scheduled total (against MAX_MILESTONES) counts this, never rows. */
export function positionCountOf(rows: readonly Pick<PositionRow, "lineageId">[]): number {
  return new Set(rows.map((r) => r.lineageId)).size;
}

/**
 * "The most milestones scheduled in one version" (F12, the Paragon rule and
 * topRankIndexOf's input): for each version, the distinct lineages of its
 * scheduled rows (rankIndex set; not DRAFT or DISCARDED; SUPERSEDED rows of
 * an old version still count for that version) together with the lineages
 * carried into it from earlier versions (STARTING, STARTED). Not capped.
 * A dropped row and its "Start again" copy count once: a 3-milestone plan
 * stays 3 (Specialist at most), never 4 (Paragon).
 */
export function maxScheduledPositionsOf(rows: readonly PositionRow[]): number {
  const versions = new Set<number>();
  for (const r of rows) if (r.rankIndex != null && !UNSCHEDULED.has(r.status)) versions.add(r.version);
  let best = 0;
  for (const v of versions) {
    const lineages = new Set<string>();
    for (const r of rows) {
      if (r.version === v && r.rankIndex != null && !UNSCHEDULED.has(r.status)) lineages.add(r.lineageId);
      else if (r.version < v && CARRIED_POSITION.has(r.status)) lineages.add(r.lineageId);
    }
    best = Math.max(best, lineages.size);
  }
  return best;
}

/**
 * The one due day of a milestone (fix round): its goal's TaskTemplate.dueDay
 * once Start has created the goal (a Reschedule moves only that), else its
 * own RoadmapMilestone.dueDay. Reach, the readings' as-of reads, the close,
 * the headline, the Aim card's PAST_DUE and the week quests all read this,
 * so pay and reach are judged on the same day.
 */
export function milestoneDueDayOf(milestoneDueDay: DayKey | null, goalDueDay?: DayKey | null): DayKey | null {
  return goalDueDay ?? milestoneDueDay;
}

// ═══ Provenance (the render contract) ═══════════════════════════════════════

/** Eight classes, derived on read from origin and decision, never stored. CITED is reserved (Deferred). */
export const PROVENANCE_CLASSES = ["MEASURED", "RECORDED", "SELF_REPORTED", "ESTIMATED", "WORKED_OUT", "YOURS", "KEPT_SUGGESTION", "DRAFT"] as const;
export type ProvenanceClass = (typeof PROVENANCE_CLASSES)[number];
/** The class of a string (origin × decision). */
export type TextClass = "YOURS" | "WORKED_OUT" | "KEPT_SUGGESTION" | "DRAFT";
/** The class a computed figure can take: the weakest of its inputs. */
export type ComputedClass = "DRAFT" | "KEPT_SUGGESTION" | "SELF_REPORTED" | "ESTIMATED" | "WORKED_OUT";
/** Weakest first. MEASURED, RECORDED and YOURS inputs leave a figure WORKED_OUT. */
export const PROPAGATION_ORDER: readonly ComputedClass[] = ["DRAFT", "KEPT_SUGGESTION", "SELF_REPORTED", "ESTIMATED", "WORKED_OUT"];

/**
 * The class of a string from its origin and decision:
 *   USER, SYLLABUS (any decision)        → YOURS
 *   GEMINI or CODE, CHECKED or EDITED    → YOURS
 *   CODE, PENDING / KEPT / REMOVED       → WORKED_OUT (names code writes from closed templates)
 *   GEMINI, KEPT                         → KEPT_SUGGESTION ("Gemini's words · kept by you · not checked")
 *   GEMINI, PENDING / REMOVED            → DRAFT ("Gemini suggestion · not checked")
 */
export function provenanceOf(origin: Origin, decision: Decision): TextClass {
  if (origin === "USER" || origin === "SYLLABUS") return "YOURS";
  if (decision === "CHECKED" || decision === "EDITED") return "YOURS";
  if (origin === "CODE") return "WORKED_OUT";
  return decision === "KEPT" ? "KEPT_SUGGESTION" : "DRAFT";
}

/** The weakest class among a computed figure's inputs, in PROPAGATION_ORDER; WORKED_OUT with none. */
export function weakest(...classes: ProvenanceClass[]): ComputedClass {
  let rank = PROPAGATION_ORDER.length - 1;
  for (const c of classes) {
    const i = (PROPAGATION_ORDER as readonly string[]).indexOf(c);
    if (i >= 0 && i < rank) rank = i;
  }
  return PROPAGATION_ORDER[rank];
}

declare const BRAND: unique symbol;
type Brand<T, B extends string> = T & { readonly [BRAND]: B };

/** Read by code from rows that test the user (CARDS_AT_LEVEL readings). "tested by your reviews". */
export type Measured = Brand<number, "Measured">;
/** The app's own record of something done in it that tests nothing (cards added). "the app counts cards you add". */
export type Recorded = Brand<number, "Recorded">;
/** The user's own record (practice ticks, steps, checkpoint logs). "from your ticks". */
export type SelfReported = Brand<number, "SelfReported">;
/** From task estimates, never timed. "≈ … (task estimates, not timed)". */
export type Estimated = Brand<number, "Estimated">;
/** Computed by code from MEASURED or YOURS inputs and published constants. */
export type WorkedOut = Brand<number, "WorkedOut">;

// The constructors are called only in roadmap-measures.ts, roadmap-realism.ts,
// roadmap-proficiency.ts, roadmap-quests.ts and throughput.ts (roadmap-ui-check greps).
export const measured = (n: number): Measured => n as Measured;
export const recorded = (n: number): Recorded => n as Recorded;
export const selfReported = (n: number): SelfReported => n as SelfReported;
export const estimated = (n: number): Estimated => n as Estimated;
export const workedOut = (n: number): WorkedOut => n as WorkedOut;

/** What a roadmap Meter wrapper, MeasureRow, AimCard and WeekQuests take: tested, recorded or self-reported. */
export type EvidenceFigure = Measured | Recorded | SelfReported;
/** A figure with its required caption ("tested by your reviews", "from your ticks"). A plain number does not type-check. */
export interface EvidenceValue {
  value: EvidenceFigure;
  caption: string;
}

/** Text the user typed, edited or checked (provenanceOf gives YOURS). */
export type YoursText = Brand<string, "YoursText">;
/** A name code wrote from a closed template (CODE_TEMPLATES), filled only with Domain names, a level and the aim. */
export type CodeText = Brand<string, "CodeText">;
/** A Domain's own name, made only from a Domain row. */
export type DomainName = Brand<string, "DomainName">;
/** A week quest label slot: nothing else type-checks there (F13). */
export type WeekQuestLabelPart = YoursText | CodeText | DomainName;

/** YoursText, only when provenanceOf(origin, decision) is YOURS; else null. (Called only in roadmap-server.ts and roadmap-quests-server.ts.) */
export function yoursText(origin: Origin, decision: Decision, text: string): YoursText | null {
  return provenanceOf(origin, decision) === "YOURS" ? (text as YoursText) : null;
}

/** The closed list of names code writes (origin CODE). */
export const CODE_TEMPLATES = ["Study {domains}", "{domains} to level {L}+", "Practice for {aim}"] as const;
export type CodeTemplate = (typeof CODE_TEMPLATES)[number];
export interface CodeFill {
  domains?: readonly DomainName[];
  /** A whole level, 1..20 ({L}). */
  level?: number;
  /** The aim, as the user wrote it ({aim}). */
  aim?: YoursText;
}

/** "A, B, C or D" (join "or", the week quest labels) or "A, B" (join "comma", code names). */
export function domainsText(names: readonly DomainName[], join: "comma" | "or"): string {
  const list = names.map((n) => String(n));
  if (join === "comma" || list.length < 2) return list.join(", ");
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

/**
 * A CodeText from a closed template. Refuses (throws) a template outside
 * CODE_TEMPLATES and a slot left unfilled: "Study Probability, Inference",
 * "Probability, Inference to level 6+", "Practice for Run a sub-50 10K".
 * (Called only in roadmap-realism.ts, the one place the origin 'CODE' is written.)
 */
export function codeText(template: CodeTemplate, fill: CodeFill = {}): CodeText {
  if (!(CODE_TEMPLATES as readonly string[]).includes(template)) throw new Error(`codeText: not a code template: ${String(template)}`);
  let out: string = template;
  if (out.includes("{domains}")) {
    if (!fill.domains || fill.domains.length === 0) throw new Error("codeText: {domains} needs at least one Domain name");
    out = out.replace("{domains}", domainsText(fill.domains, "comma"));
  }
  if (out.includes("{L}")) {
    const l = fill.level;
    if (l == null || !Number.isInteger(l) || l < 1 || l > 20) throw new Error("codeText: {L} needs a whole level 1..20");
    out = out.replace("{L}", String(l));
  }
  if (out.includes("{aim}")) {
    if (!fill.aim || !String(fill.aim).trim()) throw new Error("codeText: {aim} needs the aim");
    out = out.replace("{aim}", String(fill.aim).trim());
  }
  return out as CodeText;
}

/** A DomainName from a Domain row (its name on one line). */
export function domainName(row: { id: string; name: string }): DomainName {
  return row.name.replace(/\s+/g, " ").trim() as DomainName;
}

/**
 * A stored label read back as a quest-label part: origin CODE with PENDING or
 * KEPT gives CodeText; YOURS gives YoursText; DRAFT and KEPT_SUGGESTION give
 * null (so Gemini's unchecked words never type-check on Today).
 */
export function labelTextOf(origin: Origin, decision: Decision, text: string): YoursText | CodeText | null {
  const c = provenanceOf(origin, decision);
  if (c === "YOURS") return text as YoursText;
  if (c === "WORKED_OUT") return text as CodeText;
  return null;
}

// ═══ Keys ═══════════════════════════════════════════════════════════════════

const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function keyIds(ids: readonly string[], what: string): string[] {
  const out = Array.from(new Set(ids)).sort();
  if (out.length === 0) throw new Error(`${what}: no ids`);
  for (const id of out) if (!KEY_ID.test(id)) throw new Error(`${what}: not a key id: ${JSON.stringify(id)}`);
  return out;
}

function keyId(id: string, what: string): string {
  if (!KEY_ID.test(id)) throw new Error(`${what}: not a key id: ${JSON.stringify(id)}`);
  return id;
}

/** `CARDS_AT_LEVEL|d:<sorted domainIds joined by ,>|L<n>` (value identity; no target). */
export function cardsAtLevelKey(domainIds: readonly string[], level: number): string {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error(`cardsAtLevelKey: not a level: ${level}`);
  return `CARDS_AT_LEVEL|d:${keyIds(domainIds, "cardsAtLevelKey").join(",")}|L${level}`;
}

/** `PRACTICE_KEPT|t:<sorted templateIds>|from:<startedDay>`: a new window is new effort. */
export function practiceKeptKey(templateIds: readonly string[], from: DayKey): string {
  if (!DAY_KEY.test(from)) throw new Error(`practiceKeptKey: not a day: ${from}`);
  return `PRACTICE_KEPT|t:${keyIds(templateIds, "practiceKeptKey").join(",")}|from:${from}`;
}

/** `PROFICIENCY|r:<roadmapId>`, written only by the computed writers. */
export function proficiencyKey(roadmapId: string): string {
  return `PROFICIENCY|r:${keyId(roadmapId, "proficiencyKey")}`;
}

/** `SELF|CHECKPOINT|i:<itemLineageId>|n:` — the prefix of one checkpoint's logs. */
export function checkpointLogPrefix(itemLineageId: string): string {
  return `SELF|CHECKPOINT|i:${keyId(itemLineageId, "checkpointLogKey")}|n:`;
}

/** `SELF|CHECKPOINT|i:<itemLineageId>|n:<nonce>`: written only by logCheckpoint (append-only); never by a computed writer. */
export function checkpointLogKey(itemLineageId: string, nonce: string): string {
  return `${checkpointLogPrefix(itemLineageId)}${keyId(nonce, "checkpointLogKey")}`;
}

/** The self-reported key space (checkpoint logs). Computed writers never write under it. */
export const SELF_KEY_PREFIX = "SELF|";

export type ParsedMeasureKey =
  | { kind: "CARDS_AT_LEVEL"; domainIds: string[]; level: number }
  | { kind: "PRACTICE_KEPT"; templateIds: string[]; from: DayKey }
  | { kind: "PROFICIENCY"; roadmapId: string }
  | { kind: "CHECKPOINT_LOG"; itemLineageId: string; nonce: string };

/** Reads any key the builders above write; null for anything else. Ids come back sorted. */
export function parseMeasureKey(key: string): ParsedMeasureKey | null {
  if (typeof key !== "string") return null;
  let m = /^CARDS_AT_LEVEL\|d:([A-Za-z0-9_,-]+)\|L(\d{1,2})$/.exec(key);
  if (m) {
    const ids = m[1].split(",");
    const level = Number(m[2]);
    if (ids.some((id) => !KEY_ID.test(id)) || level < 1 || level > 20) return null;
    return { kind: "CARDS_AT_LEVEL", domainIds: [...ids].sort(), level };
  }
  m = /^PRACTICE_KEPT\|t:([A-Za-z0-9_,-]+)\|from:(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (m) {
    const ids = m[1].split(",");
    if (ids.some((id) => !KEY_ID.test(id))) return null;
    return { kind: "PRACTICE_KEPT", templateIds: [...ids].sort(), from: m[2] };
  }
  m = /^PROFICIENCY\|r:([A-Za-z0-9_-]{1,64})$/.exec(key);
  if (m) return { kind: "PROFICIENCY", roadmapId: m[1] };
  m = /^SELF\|CHECKPOINT\|i:([A-Za-z0-9_-]{1,64})\|n:([A-Za-z0-9_-]{1,64})$/.exec(key);
  if (m) return { kind: "CHECKPOINT_LOG", itemLineageId: m[1], nonce: m[2] };
  return null;
}

/** Every roadmap capture key starts with this ('rm:'); cleanCaptureKey accepts them all. */
export const ROADMAP_CAPTURE_PREFIX = "rm:";

/** 'rm:<milestoneId>': the milestone's goal. */
export function milestoneGoalKey(milestoneId: string): string {
  return `${ROADMAP_CAPTURE_PREFIX}${keyId(milestoneId, "milestoneGoalKey")}`;
}

/** 'rm:<milestoneId>:p<i>': a practice Start adds (i = its place among the milestone's practices). */
export function milestonePracticeKey(milestoneId: string, i: number): string {
  if (!Number.isInteger(i) || i < 0 || i > 99) throw new Error(`milestonePracticeKey: not a place: ${i}`);
  return `${milestoneGoalKey(milestoneId)}:p${i}`;
}

/** 'rm:<milestoneId>:s<i>': a step Start adds. */
export function milestoneStepKey(milestoneId: string, i: number): string {
  if (!Number.isInteger(i) || i < 0 || i > 99) throw new Error(`milestoneStepKey: not a place: ${i}`);
  return `${milestoneGoalKey(milestoneId)}:s${i}`;
}

/** 'rq:<milestoneId>:<weekStart>': RoadmapQuestWeek.dedupeKey, unique per user. */
export function questWeekKey(milestoneId: string, weekStart: DayKey): string {
  if (!DAY_KEY.test(weekStart)) throw new Error(`questWeekKey: not a day: ${weekStart}`);
  return `rq:${keyId(milestoneId, "questWeekKey")}:${weekStart}`;
}

// ═══ Text safety ════════════════════════════════════════════════════════════

/**
 * The one sanitiser for every string placed in a prompt (F1): NFC; every
 * whitespace run (newlines, tabs, U+00A0, U+2028, U+2029, U+3000 …) becomes
 * one space; the remaining control (\p{Cc}) and format (\p{Cf}: zero-width,
 * bidi) characters are stripped; '<' and '>' become '‹' and '›', so no
 * fence can be closed from inside; trimmed and capped at `max` code points.
 */
export function packText(s: string, max: number): string {
  if (typeof s !== "string") return "";
  let t = s.normalize("NFC");
  t = t.replace(/\s+/gu, " ");
  t = t.replace(/[\p{Cc}\p{Cf}]/gu, "");
  t = t.replace(/ {2,}/g, " ");
  t = t.replace(/</g, "‹").replace(/>/g, "›");
  t = t.trim();
  const points = Array.from(t);
  if (max >= 0 && points.length > max) t = points.slice(0, max).join("").trimEnd();
  return t;
}

/** A credential aim: an exam label is set, the aim or exam names a CREDENTIAL_WORD, or holds an all-caps token of 2–6 letters (IELTS, CFA). */
export function isCredentialAim(aim: string, examLabel: string | null | undefined): boolean {
  const exam = (examLabel ?? "").trim();
  if (exam) return true;
  const text = aim ?? "";
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.some((w) => CREDENTIAL_WORDS.includes(w))) return true;
  return /(?<![A-Za-z0-9])[A-Z]{2,6}(?![A-Za-z0-9])/.test(text);
}

const ROADMAP_TABLE = /\bRoadmap(?:Run|Milestone|Item|Measure|Reading|Acceptance|QuestWeek)?\b/;

/**
 * Whether a database error says a Roadmap* table does not exist: Prisma's
 * P2021 naming one, or Postgres's 42P01 (undefined_table) about one (the
 * RestDay pattern, rest-rules.ts). Code can deploy before life_roadmap is
 * applied, so the reads Today and /you make (loadWeekQuests, loadAimCard, the
 * board's roadmapGoals query) and the 'life' reset catch it and carry on as
 * before. Any other missing table, and a missing column (schema drift), is
 * not this.
 */
export function isMissingRoadmapTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: unknown; message?: unknown };
  const meta = e.meta && typeof e.meta === "object" ? (e.meta as Record<string, unknown>) : {};
  const text = `${typeof e.message === "string" ? e.message : ""} ${JSON.stringify(meta)}`;
  if (/column/i.test(text)) return false;
  const missing = e.code === "P2021" || meta.code === "42P01" || /\b42P01\b/.test(text) || /(relation|table) \W{0,2}(public\.)?\W?Roadmap\w*\W{0,2} does not exist/i.test(text);
  return missing && ROADMAP_TABLE.test(text);
}

// ═══ Shapes: intake, pack, reply ════════════════════════════════════════════

/** Roadmap.syllabus (YOURS). */
export interface Syllabus {
  lines: string[];
  source: string | null;
}

/** The intake form, as saveIntake receives it (the server re-validates every field). */
export interface Intake {
  aim: string;
  /** The Area Field; null for a track Area (then track is fixed to it and domainIds is empty). */
  fieldId: string | null;
  track: Track;
  domainIds: string[];
  targetDay: DayKey;
  hoursPerWeek: number;
  newCardsPerWeek: number | null;
  typicalHours: number | null;
  typicalHoursSource: string | null;
  syllabus: Syllabus | null;
  startPoint: StartPoint;
  intensity: Intensity;
  practicesAllowed: boolean;
  constraints: string | null;
  examLabel: string | null;
}

/** The pack's sections, in prompt order; the form's privacy line is generated from this list. */
export type PackSection = "area" | "aim" | "constraints" | "exam" | "syllabus" | "domains" | "plan";
export const PACK_SECTIONS: readonly PackSection[] = ["area", "aim", "constraints", "exam", "syllabus", "domains", "plan"];

/** One D-line: "D1 · Probability · 42 cards · 18 at level 6+ · 2 mastered" (atTop = cards at TOP_LEVEL or above). */
export interface PackDomainLine {
  key: string;
  name: string;
  cards: number;
  atSix: number;
  atTop: number;
}

/** Server-only: never sent to the model, never sent to a browser. */
export interface PackKeymap {
  /** D-key → Domain id. */
  domains: Record<string, string>;
  /** S-key → syllabus line index. */
  syllabus: Record<string, number>;
}

/** What roadmap-evidence.ts builds (every interpolated string through packText). Stored on RoadmapRun.pack. */
export interface EvidencePack {
  promptVersion: number;
  /** The exact user-content lines sent. */
  lines: string[];
  /** The sections present, in order. */
  sections: PackSection[];
  domains: PackDomainLine[];
  /** S1..Sn, when a syllabus was given. */
  syllabusKeys: string[];
  milestoneCount: number;
  weeksPerMilestone: number[];
  practicesAllowed: boolean;
  trackArea: boolean;
  /** METHODS_FOR_RUN (COACHED_SESSION left out when the constraints exclude it). */
  methods: PracticeMethod[];
  keymap: PackKeymap;
  /** A hash of the sorted chosen domain ids (feeds inputHash). */
  domainIdsHash: string;
}

/** The structured reply the schema asks for. Validation reads the parsed JSON as unknown and never trusts this shape. */
export interface DraftReply {
  milestones: DraftReplyMilestone[];
}

export interface DraftReplyMilestone {
  title: string;
  domains?: string[];
  newDomains?: string[];
  topics?: { label: string; domain: string; syllabus?: string }[];
  practices?: { name: string; method: string }[];
  steps: { title: string }[];
  checkpoint?: { label: string; kind: string } | null;
}

// ═══ Shapes: drafts, measures, validation ═══════════════════════════════════

/** One item, as validation, fitting, the editor and persistence pass it (mirrors RoadmapItem). */
export interface ItemDraft {
  /** The row id once persisted; null on a fresh draft. */
  id: string | null;
  lineageId: string;
  kind: ItemKind;
  ord: number;
  label: string;
  rawLabel: string | null;
  origin: Origin;
  decision: Decision;
  /** A DOMAIN item's resolved Domain; a TOPIC's Domain when it exists. */
  domainId: string | null;
  /** A proposed new Domain's name; on a TOPIC, the name of its milestone's proposed DOMAIN item. */
  proposedName: string | null;
  syllabusRef: number | null;
  method: PracticeMethod | null;
  sessionsPerWeek: number | null;
  durationBand: PracticeBand | null;
  rule: string | null;
  planSource: PlanSource | null;
  checkpointKind: CheckpointKind | null;
  outOf: number | null;
  bar: number | null;
  addToToday: boolean;
  templateId: string | null;
  flags: BlockingFlag[];
  notes: ItemNote[];
  /**
   * NUMBER: [start, end) spans of `label` to strike through. Not stored (no
   * column): R4 re-derives it on read for a flagged GEMINI row with R3's
   * checkLabel over the roadmap's full LabelContext (the syllabus included),
   * so the live page strikes what the fixtures strike (fix round).
   */
  struck?: [number, number][];
  /** Each flag's reason in words, naming what set it ('names "Kestrel", which you didn't write'): R3's LabelCheck.reasons, re-derived on read with `struck`. */
  reasons?: Partial<Record<BlockingFlag, string>>;
}

/** RoadmapMeasure.scope. CARDS_AT_LEVEL: domainIds. PRACTICE_KEPT: itemLineageIds (templateIds from Start). CHECKPOINT: one itemLineageId. */
export interface MeasureScope {
  domainIds?: string[];
  itemLineageIds?: string[];
  templateIds?: string[];
}

/** One measure (mirrors RoadmapMeasure). */
export interface MeasureSpec {
  id: string | null;
  kind: MeasureKind;
  role: MeasureRole;
  scope: MeasureScope;
  minLevel: number | null;
  target: number;
  targetSource: TargetSource;
  fittedTarget: number | null;
  rateSource: RateSource | null;
  baseline: number | null;
  baselineDay: DayKey | null;
  unit: string | null;
  itemLineageId: string | null;
  measureKey: string | null;
}

/**
 * Milestone-level notes (codes; copy in roadmap-copy.ts): no study slot ("this
 * milestone already has 3"), no measurable part, a card measure dropped as
 * too small, the "Not medical advice" line. Lanes may append codes.
 */
export type MilestoneNote = "NO_STUDY_SLOT" | "NOT_MEASURABLE" | "CARDS_TOO_SMALL" | "HEALTH_LINE";

/** One milestone of a draft or version (mirrors RoadmapMilestone, with its items and measures). */
export interface MilestoneDraft {
  id: string | null;
  lineageId: string;
  version: number;
  ord: number;
  title: string;
  titleOrigin: Origin;
  titleDecision: Decision;
  windowStart: DayKey | null;
  dueDay: DayKey | null;
  status: MilestoneStatus;
  rankIndex: number | null;
  overAccepted: boolean;
  items: ItemDraft[];
  measures: MeasureSpec[];
  notes: MilestoneNote[];
  /**
   * The title's blocking flags (fix round; R3 handoff 1). A milestone title
   * has no item row and no flags column, so R4 derives these on read with
   * checkLabel(title, labelContextFor(…, "MILESTONE", {milestoneOrd,
   * milestoneCount})) for a GEMINI title, and the editor treats the title
   * like an item: a NUMBER title offers only Edit, never Keep or I checked
   * this (decideItemCore and the Start sheet refuse both), and bulk keep
   * skips a flagged title. Absent or [] on a title the user or the app wrote.
   */
  titleFlags?: BlockingFlag[];
  /** NUMBER spans of `title` to strike through, derived with titleFlags. */
  titleStruck?: [number, number][];
  /** Each title flag's reason in words, derived with titleFlags. */
  titleReasons?: Partial<Record<BlockingFlag, string>>;
}

/** Why the checker dropped something (F6). */
export type DropReason = "UNKNOWN_KEY" | "DANGLING_NEW_DOMAIN" | "CONTAINED_LINK" | "EXTRA_MILESTONE" | "OVER_CAP" | "EMPTY_LABEL" | "BAD_SHAPE";

/** One line of the "What was dropped" sheet: every drop, flag and note, in words. */
export interface ReportEntry {
  /** The milestone's place (1-based); 0 for the draft as a whole. */
  milestoneOrd: number;
  kind: ItemKind | "MILESTONE" | "DRAFT";
  /** The text as the model wrote it (≤ RAW_LABEL_MAX). */
  label: string;
  code: DropReason | BlockingFlag | ItemNote;
  reason: string;
}

export interface ValidationReport {
  dropped: ReportEntry[];
  flagged: ReportEntry[];
  notes: ReportEntry[];
}

/** One validated sample: milestones with code-set numbers still to fit (F4), and the report. */
export interface ValidatedDraft {
  milestones: MilestoneDraft[];
  report: ValidationReport;
  /** Exam label, credential word or acronym, or a non-English aim: every item needs its own tap. */
  bulkKeepOff: boolean;
  credential: boolean;
  nonEnglish: boolean;
  /** Syllabus line indices no topic covers ("Not in this plan yet: S4, S9"). */
  uncoveredSyllabus: number[];
  /** More than UNVERIFIED_ALARM of the items carry a blocking flag. */
  alarm: boolean;
}

// ─── What a draft milestone still needs (fix round 2: one definition) ────────
//
// The review footer's "N items left in milestone 1", its "Next item to
// decide" target, the Aim card's draftItems (R4 undecidedRowsOf) and the
// page's undecided list (R5 undecidedOf) all count the same rows. They used
// to differ: R5 counted a PENDING SYLLABUS or USER row and a placeholder the
// user had already named, while R4 counted neither.

/** Gemini's words not yet kept, checked, edited or removed (class DRAFT). A code-written name, a syllabus line and anything the user wrote need no tap. */
export function isUndecidedItem(i: { origin: Origin | string; decision: Decision | string }): boolean {
  return i.decision === "PENDING" && i.origin === "GEMINI";
}

/** A placeholder practice still to name ("Name this practice"): the PLACEHOLDER note on a row the user hasn't edited. Naming it (EDITED) settles it. */
export function isPlaceholderItem(i: { notes: readonly string[]; decision: Decision | string }): boolean {
  return i.notes.includes("PLACEHOLDER") && i.decision !== "EDITED";
}

/** What one row still needs: a name (an empty title, a placeholder), a decision, a Domain to map or create, or a checkpoint's bar. */
export type DraftNeed = "NAME" | "DECIDE" | "MAP" | "SET_BAR";

export interface DraftNeedRow {
  /** The item's id, or the milestone's own id for its title (decideItem and editItem take either); null before the draft is persisted. */
  id: string | null;
  lineageId: string;
  kind: "TITLE" | ItemKind;
  need: DraftNeed;
}

/** The page's reading order: the title, then each kind's section in this order (items in their own order within it). */
const DRAFT_NEED_KIND_ORDER: readonly ItemKind[] = ["DOMAIN", "TOPIC", "PRACTICE", "STEP", "CHECKPOINT"];

/**
 * Every row of a draft milestone that still needs the user, one entry per
 * row, in the page's reading order (the first is "Next item to decide"):
 *   the title: an empty one → NAME; Gemini's, PENDING → DECIDE;
 *   each item not REMOVED: a placeholder → NAME; a proposed Domain (no
 *   domainId) → MAP; Gemini's words PENDING → DECIDE; a checkpoint without
 *   its bar or outOf → SET_BAR (the first that applies).
 * A PENDING syllabus topic or a row the user wrote is never counted.
 * R4's undecidedRowsOf is `draftNeedsOf(m).length` and its nextToDecide the
 * first entry's id; R5's undecidedOf maps these entries to its rows.
 */
export function draftNeedsOf(m: Pick<MilestoneDraft, "id" | "lineageId" | "title" | "titleOrigin" | "titleDecision" | "items">): DraftNeedRow[] {
  const out: DraftNeedRow[] = [];
  if (!m.title.trim()) out.push({ id: m.id, lineageId: m.lineageId, kind: "TITLE", need: "NAME" });
  else if (isUndecidedItem({ origin: m.titleOrigin, decision: m.titleDecision })) out.push({ id: m.id, lineageId: m.lineageId, kind: "TITLE", need: "DECIDE" });
  for (const kind of DRAFT_NEED_KIND_ORDER) {
    for (const it of m.items) {
      if (it.kind !== kind || it.decision === "REMOVED") continue;
      const need: DraftNeed | null = isPlaceholderItem(it)
        ? "NAME"
        : it.kind === "DOMAIN" && !it.domainId
          ? "MAP"
          : isUndecidedItem(it)
            ? "DECIDE"
            : it.kind === "CHECKPOINT" && (it.bar == null || it.outOf == null)
              ? "SET_BAR"
              : null;
      if (need) out.push({ id: it.id, lineageId: it.lineageId, kind: it.kind, need });
    }
  }
  return out;
}

// ═══ Shapes: readings and realism ═══════════════════════════════════════════

/** One stored reading (RoadmapReading), as every surface reads it. */
export interface Reading {
  measureKey: string;
  day: DayKey;
  value: number;
  detail: unknown;
  source: ReadingSource;
  /** ISO time the computation started. */
  observedAt: string;
}

/** One element of RoadmapAcceptance.endState, as accepted: the aim's end-state measures. */
export interface EndStateTerm {
  measureKey: string;
  target: number;
  baseline: number;
  baselineDay: DayKey;
  /** "Probability, Inference · cards at level 6+". */
  label: string;
}

/** A plan window: [start, end], both life days. */
export interface PlanWindow {
  start: DayKey;
  end: DayKey;
}

/** One card scope (a sorted set of Domain ids) with its cards and its new-card pace. */
export interface RealismScope {
  /** The sorted ids joined by ','. */
  key: string;
  domainIds: string[];
  fieldId: string | null;
  cards: CardState[];
  rateSource: RateSource;
  /** New cards a life week from that source; null with NONE. */
  rate: number | null;
}

/** Everything the feasibility engine reads (F4). It makes no model call and reads no clock. */
export interface RealismInput {
  today: DayKey;
  targetDay: DayKey;
  scopes: RealismScope[];
  throughput: Throughput;
  hoursPerWeek: number;
  intensity: Intensity;
  startPoint: StartPoint;
  typicalHours: number | null;
  typicalHoursSource: string | null;
  /** The current interval multiplier m (loadout and skill gates). */
  m: number;
  /** Held days in the span (heldDaysOf). */
  heldDays: DayKey[];
  areaInMaintenance: boolean;
  practicesAllowed: boolean;
  trackArea: boolean;
}

/** "Targets vs your pace" for one card measure. */
export interface KnowledgeCheck {
  measureKey: string;
  level: number;
  verdict: KnowledgeVerdict;
  target: number;
  /** The code-fitted target (null when the user typed one). */
  fitted: number | null;
  baseline: number;
  expected: number;
  best: number;
  /** existingStrict + the strict new cards: above it is IMPOSSIBLE. */
  strictMax: number;
  /** p calibrating: expected = best, labelled "best case". */
  bestCase: boolean;
  /** IMPOSSIBLE's earliest feasible day. */
  earliestDay: DayKey | null;
  lastCardDay: DayKey | null;
  basis: string[];
}

/** One calendar week's tracked load (minutes). */
export interface WeekLoad {
  weekStart: DayKey;
  reviewMin: number;
  writeMin: number;
  practiceMin: number;
  /** available(w); null while it cannot be computed. */
  availableMin: number | null;
  availableClass: "ESTIMATED" | "YOURS";
}

/** "App-tracked time" for a milestone: the worst calendar week. Every verdict carries the fixed line. */
export interface TimeCheck {
  verdict: TimeVerdict;
  /** UNVERIFIED while adherence or tracked minutes are calibrating ("Unverified · Fits"). */
  unverified: boolean;
  ratio: number | null;
  worstWeek: WeekLoad | null;
  basis: string[];
}

/** One life week of a milestone's per-week plan (F4 step 13). */
export interface PlanWeek {
  weekStart: DayKey;
  /** The planned new cards that week (scope share of the source rate, pro-rated for held days, cut at lastCardDay). */
  newPerWeek: number;
  practiceMin: number;
  reviewMin: number;
  availableMin: number | null;
  availableClass: "ESTIMATED" | "YOURS";
}

/** The acceptance's per-milestone snapshot (RoadmapMilestone.feasibility before Start). */
export interface MilestoneFeasibility {
  kind: "PLAN";
  lineageId: string;
  ord: number;
  knowledge: KnowledgeCheck[];
  time: TimeCheck;
  /** The worst of its parts: IMPOSSIBLE blocks; OVER needs the switch. */
  worst: KnowledgeVerdict | TimeVerdict;
  basis: string[];
  remedies: Remedy[];
  weeks: PlanWeek[];
  lastCardDay: DayKey | null;
}

/** The aim check: never a verdict chip beside the aim. */
export type AimCheck =
  | { kind: "unchecked" }
  | { kind: "checked"; coverHours: number; typicalHours: number; source: string | null; coversAll: boolean };

/** The plan's feasibility: per milestone (no plan-level verdict chip), the aim check, basis and remedies. */
export interface Feasibility {
  today: DayKey;
  m: number;
  milestones: MilestoneFeasibility[];
  aimCheck: AimCheck;
  basis: string[];
  remedies: Remedy[];
  /** Any milestone IMPOSSIBLE (outline included): accept and Start refuse. */
  impossible: boolean;
  /** Any OVER (time or typed target): needs "Keep it over my hours/pace". */
  over: boolean;
}

/** One life week of a started milestone's plan, with what the week quests keep from Start. */
export interface StartWeek extends PlanWeek {
  /** needRate_w = newNeeded_start × fw_w ÷ Ww_start: the new cards that week needed when the milestone started. */
  needRate: number;
  /** |E_w ∩ (…, lastCardDay]| ÷ 7. */
  fw: number;
}

/** RoadmapMilestone.feasibility after Start (refitForStart): what the week quests keep for the milestone's life. */
export interface StartSnapshot {
  kind: "START";
  startedDay: DayKey;
  dueDay: DayKey;
  weeks: StartWeek[];
  lastCardDay: DayKey | null;
  /** p at Start (1 while calibrating). */
  pStart: number;
  pCalibrating: boolean;
  /** p_start^(L−1), or 1 while calibrating ("best case"). */
  yieldStart: number;
  newNeededStart: number;
  wwStart: number;
  rateSource: RateSource;
  m: number;
  feasibility: MilestoneFeasibility;
  /**
   * Practice aftercare (fix round): TaskTemplate ids the user chose to keep
   * on Today after this milestone finished ("Keep on Today"). practiceAftercare
   * leaves them out, so the row stops asking. The one field written after
   * Start; it needs no column (it rides RoadmapMilestone.feasibility, as R4's
   * milestone notes do). Absent: none kept.
   */
  aftercareKept?: string[];
}

// ═══ Shapes: pace, Proficiency, rank ════════════════════════════════════════

/** A card measure's projection (weight.ts result grammar). The pipeline alone; no slope line. */
export type PaceResult =
  | { kind: "not-measured" }
  | { kind: "reached"; day: DayKey }
  | { kind: "on-pace"; day: DayKey; pipeline: number; bestCase: boolean }
  | { kind: "behind"; day: DayKey; daysLate: number; expectedByDue: number; target: number; bestCase: boolean }
  | { kind: "far" };

/** A practice measure's projection: kept + remaining planned × the measured kept share. */
export type PracticePace = { kind: "not-measured" } | { kind: "on-pace" } | { kind: "short"; sessions: number };

/** One fired trigger, with the milestone it is about (null for the plan). */
export interface TriggerHit {
  trigger: ReplanTrigger;
  milestoneOrd: number | null;
  /** The sentence the roadmap surfaces show (QUESTS_BEHIND's names its levers). */
  line: string;
}

/** An end-state card term of the Proficiency basis. */
export interface ProficiencyCardTerm {
  measureKey: string;
  domainIds: string[];
  level: number;
  target: number;
}

/** A practice lineage's planned sessions (from the acceptance's snapshot; WORKED_OUT). */
export interface ProficiencyPracticeTerm {
  itemLineageId: string;
  planned: number;
}

/** Fixed between plan decisions: an acceptance, its Undo, or a practice switched off at Start. */
export interface ProficiencyBasis {
  basisVersion: number;
  cards: ProficiencyCardTerm[];
  practice: ProficiencyPracticeTerm[];
  /** Scheduled milestones of the version, carried included, LATER excluded. */
  scheduled: number;
}

/** Each part in [0, 1]; null when absent (then its weight is renormalised away). */
export interface ProficiencyParts {
  cards: number | null;
  practice: number | null;
  milestones: number | null;
}

export type ProficiencyClass = "MEASURED" | "SELF_REPORTED";
/** What changed the basis: shown "Changed on … (was 41%)", never as a gain. */
export type ProficiencyRebaseCause = "ACCEPTED" | "REPLAN" | "UNDO" | "SWITCHED_OFF";

export interface ProficiencyRebase {
  on: DayKey;
  /** The value before the change (0..1). */
  from: number;
  cause: ProficiencyRebaseCause;
  /** The plan words: "the re-plan lowered the end target 30 → 25", "Backtest was switched off at Start". */
  detail: string;
}

/** RoadmapReading.detail of a PROFICIENCY row. */
export interface ProficiencyDetail {
  v: number;
  basisVersion: number;
  basis: ProficiencyBasis;
  parts: ProficiencyParts;
  shares: ProficiencyParts;
  class: ProficiencyClass;
  depth: number;
  inScope: number;
  kept: number;
  planned: number;
  reached: number;
  scheduled: number;
  rebased: ProficiencyRebase | null;
}

/** A fall since the last reading before this life week, its cause from the parts diff; or a rebased step. */
export type ProficiencyChange =
  | { kind: "fall"; points: number; since: DayKey; cause: "CARDS_ARCHIVED" | "LEVELS_SLIPPED" | "TICK_UNDONE"; domains: string[] }
  | { kind: "rebased"; rebase: ProficiencyRebase };

/** Proficiency as every surface shows it, from the stored reading (never live, except on a writes-off server). */
export interface ProficiencyView {
  /** The stored value in [0, 1], branded by its class. */
  figure: EvidenceValue;
  /** floor(100 × value). */
  percent: number;
  class: ProficiencyClass;
  parts: ProficiencyParts;
  shares: ProficiencyParts;
  reached: number;
  scheduled: number;
  /** ISO observedAt of the stored reading. */
  measuredAt: string;
  change: ProficiencyChange | null;
  /** Computed on this request and not stored (a writes-off server's live figure): "not recorded on this server". A stored reading is never live, even on a writes-off server. */
  live: boolean;
}

/** What the next rank is, in words the copy fills. */
export type NextRank =
  | { kind: "milestone"; index: number; name: AimRankName; milestoneOrd: number }
  | { kind: "keeps"; milestoneOrd: number }
  | { kind: "paragon" }
  | { kind: "top" };

export interface AimRankLadderRow {
  index: number;
  name: AimRankName;
  /** The milestone that gives it; null for Initiate and Paragon. */
  milestoneOrd: number | null;
  state: "given" | "next" | "later";
}

/** The Aim rank: a record, never lost (rank = max rankIndex over confirmed reaches, or Paragon). */
export interface AimRankView {
  index: number;
  name: AimRankName;
  /** The confirmed reach that gave it, while within RANK_NEW_DAYS ("new 3 Nov"). */
  newSince: DayKey | null;
  next: NextRank;
  /** "Top rank on this plan": Paragon with the aim when the plan has had ≥ 4 milestones. */
  top: { index: number; name: AimRankName; withAim: boolean };
  /** A reach waiting on ticks ("counts from Thu"). It moves no rank until confirmed. */
  pending: { milestoneOrd: number; countsFrom: DayKey } | null;
  ladder: AimRankLadderRow[];
}

// ═══ Shapes: week quests ════════════════════════════════════════════════════

/** A count's unit, always shown ("3 of 8 cards", "1 of 3 sessions"). */
export type WeekQuestUnit = "card" | "session" | "day" | "step" | "log";

/** Where week quests render: Today's card, the Aim card's one line, the roadmap page's Now section. */
export type WeekQuestVariant = "today" | "aim" | "roadmap";

interface WeekQuestBase {
  ord: number;
  kind: WeekQuestKind;
  /** The filled code template; never re-worded once frozen. */
  label: string;
  /** WORKED_OUT. */
  count: number;
  unit: WeekQuestUnit;
  evidence: WeekQuestEvidence;
  /** The window: max(weekStart, startedDay) .. min(weekEnd, dueDay). Held days inside still count as evidence. */
  from: DayKey;
  to: DayKey;
}

export interface RaiseQuestSpec extends WeekQuestBase {
  kind: "RAISE";
  measureKey: string;
  domainIds: string[];
  minLevel: number;
  /** b0 = max(v0, the measure's baseline). */
  floor: number;
  /** The due day of each reachable card ("4 come due Wed, 1 Fri"). */
  dueDays: DayKey[];
  /** p_start was calibrating: the reach is the best case. */
  bestCase: boolean;
}

export interface AddQuestSpec extends WeekQuestBase {
  kind: "ADD";
  domainIds: string[];
  /** The first Domain's Field, for the /add?field=&domain= link. */
  fieldId: string | null;
  /** The Area Field, when it has a weekly quota ("counts toward Statistics' weekly quota too"). */
  quotaField: { fieldId: string; name: string } | null;
  /** The uncapped ask (pace), for "asks 4 of the 8 needed". */
  pace: number;
  /** Ww at the freeze: the writing weeks left, this one included (QUESTS_BEHIND). */
  writingWeeksLeft: number;
  lastCardDay: DayKey | null;
}

export interface PracticeQuestSpec extends WeekQuestBase {
  kind: "PRACTICE";
  templateId: string;
  minutes: number;
}

export interface StepQuestSpec extends WeekQuestBase {
  kind: "STEP";
  templateId: string;
  minutes: number;
}

export interface CheckpointQuestSpec extends WeekQuestBase {
  kind: "CHECKPOINT";
  itemLineageId: string;
}

/** One quest as issued (RoadmapQuestWeek.quests[]). */
export type WeekQuestSpec = RaiseQuestSpec | AddQuestSpec | PracticeQuestSpec | StepQuestSpec | CheckpointQuestSpec;

/** One frozen week (F13 Output). */
export interface WeekQuestSet {
  weekStart: DayKey;
  milestoneId: string;
  state: WeekQuestState;
  generator: number;
  quests: WeekQuestSpec[];
  basis: string[];
  cappedBy: WeekQuestCap | null;
}

/** The card measure a week reads (F13 Input). */
export interface WeekQuestCardInput {
  measureKey: string;
  domainIds: string[];
  domainNames: DomainName[];
  level: number;
  target: number;
  /** The high-water baseline from Start (decision 10). */
  baseline: number;
  /** The last stored reading before weekStart (or the Start reading this week). */
  v0: number;
  /** The scope's cards, levels read at the freeze; effective states taken as of weekStart. */
  cards: CardState[];
  rateSource: RateSource;
  /** The first Domain's Field (the ADD link). */
  fieldId: string | null;
}

export interface WeekQuestPracticeInput {
  templateId: string;
  /** YoursText or CodeText only: a Gemini name kept but not checked does not type-check. */
  name: YoursText | CodeText;
  rule: string;
  startDay: DayKey;
  bandMinutes: number;
}

export interface WeekQuestStepInput {
  templateId: string;
  title: YoursText | CodeText;
  ord: number;
  doneDay: DayKey | null;
  minutes: number;
}

export interface WeekQuestCheckpointInput {
  itemLineageId: string;
  label: YoursText;
  lastLogDay: DayKey | null;
}

/** Everything weekQuestsFor reads, as of Monday 04:00 except card levels (F13 Input). */
export interface WeekQuestInput {
  weekStart: DayKey;
  weekEnd: DayKey;
  milestone: {
    id: string;
    ord: number;
    of: number;
    startedDay: DayKey;
    dueDay: DayKey;
    snapshot: StartSnapshot;
  };
  /** Held days from weekStart to dueDay, declared before Monday 04:00. */
  heldDays: DayKey[];
  card: WeekQuestCardInput | null;
  capacity: {
    /** available_w for this week. */
    availableMin: number;
    /** ESTIMATED once tracked minutes are calibrated; YOURS (the declared fallback, "unverified") before. */
    class: "ESTIMATED" | "YOURS";
    calibrating: boolean;
  };
  /** Σ this week's weekly quotas of Fields other than the Area Field. */
  otherFieldQuotas: number;
  /** The Area Field, when it has a weekly quota. */
  areaQuotaField: { fieldId: string; name: string } | null;
  practices: WeekQuestPracticeInput[];
  steps: WeekQuestStepInput[];
  checkpoint: WeekQuestCheckpointInput | null;
  /** The current interval multiplier (reach this week). */
  m: number;
  /** ISO time card levels were read ("card levels read Mon 04:15"). */
  cardLevelsReadAt: string;
}

/** What questProgress reads for one quest (one function on every surface, F14). */
export type QuestEvidence =
  | { kind: "RAISE"; /** The last stored reading dated in the window; null → v0. */ value: number | null; /** The week's highest reading so far. */ high: number | null; /** The day a slip was read (the caption's day). */ slipDay: DayKey | null }
  | { kind: "ADD"; /** Non-archived Ideas with domainId in scope created in the window. */ added: number }
  | { kind: "PRACTICE"; rule: string | null; startDay: DayKey; instances: InstanceLike[] }
  | { kind: "STEP"; /** Days with a done instance. */ doneDays: DayKey[] }
  | { kind: "CHECKPOINT"; /** Days with a SELF|CHECKPOINT log. */ logDays: DayKey[] };

/** One quest's verified progress. done = progress ≥ count. */
export interface WeekQuestProgress {
  ord: number;
  progress: number;
  count: number;
  done: boolean;
  /** RAISE slipped below the week's high: "1 card slipped back to level 5 on Thu". */
  slipped: { from: number; day: DayKey | null } | null;
}

/** RoadmapQuestWeek.results, written once after the week settles. */
export interface WeekQuestResults {
  /** Set for a milestone closed mid-week. */
  closedDay: DayKey | null;
  rows: { ord: number; progress: number; done: boolean }[];
  /** The window's days held by a rest, sick or vacation day declared after the freeze. */
  heldAfterFreeze: number;
}

/** One row as the WeekQuests component renders it (every variant). */
export interface WeekQuestRow {
  ord: number;
  kind: WeekQuestKind;
  label: string;
  count: number;
  unit: WeekQuestUnit;
  evidence: WeekQuestEvidence;
  /** Progress, branded by evidence, with its caption ("tested by your reviews"). */
  figure: EvidenceValue;
  done: boolean;
  /** RAISE: "4 come due Wed, 1 Fri". */
  dueLine: string | null;
  /** ADD: "counts toward Statistics' weekly quota too". */
  quotaLine: string | null;
  /** RAISE slip caption. */
  slipLine: string | null;
  /** PRACTICE and STEP on Today: a button dispatching SEEK_TEMPLATE_EVENT (rows never carry data-template-id). */
  seekTemplateId: string | null;
  /** Where the task lives on Today ("in Habits", "in Anytime"). */
  place: string | null;
  /** A link, per variant (F13 Output table). Never /review. */
  href: string | null;
}

/** A week's set as a surface shows it. */
export interface WeekQuestsView {
  milestoneId: string;
  milestoneOrd: number;
  milestoneOf: number;
  milestoneTitle: string;
  weekStart: DayKey;
  weekEnd: DayKey;
  state: WeekQuestState;
  rows: WeekQuestRow[];
  done: number;
  total: number;
  /** The milestone's level, for the footer ("new cards count once they reach level 6+"); null without a card measure. */
  level: number | null;
  frozen: boolean;
  /** Shown live on a writes-off server: "not recorded on this server". */
  writesOff: boolean;
  /** The roadmap variant: basis lines, notes and triggers (never on Today). */
  basis: string[];
  cappedBy: WeekQuestCap | null;
  notes: string[];
}

/** A finished (or settling) week on the roadmap page's "Past week quests". */
export interface PastWeekView {
  weekStart: DayKey;
  milestoneOrd: number;
  /** false until its Wednesday 04:00: "Week of 28 Sep · still settling". */
  settled: boolean;
  done: number;
  total: number;
  capped: boolean;
  heldDays: number;
}

// ═══ Shapes: the economy and Start ══════════════════════════════════════════

/** Why a milestone states 0 (F15): knowledge is paid by reviews; a token practice; a lineage already paid. */
export type StatedZeroReason = "KNOWLEDGE_ONLY" | "PRACTICE_UNDER_HOUR" | "PRACTICE_UNDER_SHARE" | "LINEAGE_PAID";

/** A user's decision on one item (Keep, I checked this, Remove); Edit is ItemEdit. */
export type ItemDecisionChoice = "KEPT" | "CHECKED" | "REMOVED";

/** An item edit from the Edit sheet (closed pickers and free text). The server re-runs F6 and F4 on it. */
export interface ItemEdit {
  label?: string;
  method?: PracticeMethod;
  sessionsPerWeek?: number;
  durationBand?: PracticeBand;
  rule?: string;
  checkpointKind?: CheckpointKind;
  outOf?: number;
  bar?: number;
  /** A TOPIC moved to another Domain of its milestone. */
  domainId?: string;
  /** A typed target (YOURS) for a card measure, by measureKey. */
  target?: number;
  minLevel?: number;
}

/** How a proposed or picked Domain is resolved (F9): map to one of the user's, create one under a confirmed name, or drop it. */
export type DomainResolution =
  | { kind: "MAP"; domainId: string }
  | { kind: "CREATE"; name: string; fieldId: string }
  | { kind: "CHECK" }
  | { kind: "DROP" };

/** acceptCore's choices. */
export interface AcceptChoices {
  /** "Keep it over my hours/pace": stored, shown for good as "Over". */
  overAccepted: boolean;
}

/** startMilestoneCore's choices, from the Start sheet. */
export interface StartChoices {
  /** [Use 14] (FITTED_NOW) or [Keep 20] (STORED, needs overAccepted when it is over). */
  target: "STORED" | "FITTED_NOW";
  overAccepted: boolean;
  /** Item lineage ids of practices switched off. */
  practicesOff: string[];
  /** Item lineage id → a recurrence rule the user picked (validated by parseRule). */
  rules: Record<string, string>;
  /** Item id → a decision taken on the sheet. */
  decisions: Record<string, ItemDecisionChoice>;
  /** Item id → an edit taken on the sheet. */
  edits: Record<string, ItemEdit>;
}

/** One Today-bound row on the Start sheet: Start is offered only when every one is YOURS or WORKED_OUT. */
export interface TodayBoundRow {
  kind: "TITLE" | "PRACTICE" | "STEP" | "CHECKPOINT" | "DOMAIN";
  /** null for the title (the milestone row). */
  itemId: string | null;
  label: string;
  class: TextClass;
  /** What it still needs: nothing, a check or edit, a check or map (a Domain Gemini picked), or a name (a placeholder). */
  needs: "NONE" | "CHECK_OR_EDIT" | "CHECK_OR_MAP" | "NAME_IT";
}

export interface StartPracticeRow {
  itemId: string;
  lineageId: string;
  name: string;
  rule: string;
  minutes: number;
  /** Default on; off when the same name is already on Today from an earlier milestone. */
  on: boolean;
  alreadyOnToday: { templateId: string; fromOrd: number } | null;
  /** The planCompletion preview ("≈ 6.0" XP a session); null when not priced. */
  price: number | null;
  /** Its planned minutes a week (practiceMinutesPerWeekOf): what it adds to the stated-pay arithmetic when switched on (fix round). */
  weeklyMinutes?: number;
}

/** The Start sheet, computed before anything is created (startPreview → refitForStart). */
export interface StartPreview {
  milestoneId: string;
  ord: number;
  of: number;
  title: string;
  dueDay: DayKey;
  goalsLive: boolean;
  writesOff: boolean;
  /** A refusal in words (due ≤ 30 days, IMPOSSIBLE now, another started …); null when Start can be offered. */
  refusal: string | null;
  /** "Target 20 was fitted when you accepted; fitted today it would be 14 …" */
  todayCheck: { measureKey: string; stored: number; fittedNow: number; reason: string } | null;
  feasibility: MilestoneFeasibility;
  /** The milestone's PENDING items, decided on the sheet. */
  pending: ItemDraft[];
  todayRows: TodayBoundRow[];
  practices: StartPracticeRow[];
  steps: { itemId: string; title: string }[];
  /**
   * statedForMilestone at the sheet's default switches, and the
   * goalLimitWindow line ("2 Mid goals paid in the last 30 days — …").
   * `paidOn`: with LINEAGE_PAID, the day that lineage's goal paid ("pays
   * nothing · this milestone already paid on 3 Mar").
   */
  pay: { stated: number; zeroReason: StatedZeroReason | null; limitLine: string | null; paidOn?: DayKey | null };
  /**
   * What the pay line is worked out from, so the sheet recomputes it on
   * every practice switch (fix round): statedForMilestone(
   * startStatedInputOf(payBasis, practices, off)). finishStartCore freezes
   * goalMp from the same call over the claimed switches, so the line the
   * user saw when they tapped Start is the figure frozen into the goal.
   */
  payBasis?: StartPayBasis;
  /** The rank it would give, or null when it keeps the rank. */
  givesRank: AimRankName | null;
  /** "Week quests if you start now": the generator's set for the rest of this life week. */
  weekQuests: WeekQuestSet | null;
  canStart: boolean;
  /** Every reason Start is not offered yet, in words (the sheet scrolls to the first). */
  blockers: string[];
}

/** statedForMilestone's inputs that don't depend on the Start sheet's switches (fix round). */
export interface StartPayBasis {
  /**
   * Planned tracked minutes a week besides practices (reviews + new cards ×
   * CARD_WRITE_MIN), the mean over the Start weeks (otherTrackedMinutesOf);
   * null when the plan has no weeks (then the practices alone are the plan).
   */
  otherMinutesPerWeek: number | null;
  /** A paying card measure exists (knowledge alone pays 0). */
  hasCards: boolean;
  /** The day a goal of the same lineage closed paying; null when none did. */
  lineagePaidOn: DayKey | null;
}

/** A practice's planned minutes a week, as the stated pay counts them: sessions a week × its band (the method's default band, else D30, when unset). */
export function practiceMinutesPerWeekOf(it: { sessionsPerWeek: number | null; durationBand: PracticeBand | null; method: PracticeMethod | null }): number {
  const band: PracticeBand = it.durationBand ?? (it.method ? METHOD_DEFAULT_BAND[it.method] : "D30");
  const sessions = typeof it.sessionsPerWeek === "number" && Number.isFinite(it.sessionsPerWeek) ? Math.max(0, it.sessionsPerWeek) : 0;
  return sessions * practiceBandMinutes(band);
}

/** The planned tracked minutes a week besides practices: the mean over `weeks` of reviewMin + newPerWeek × CARD_WRITE_MIN; null with no weeks. */
export function otherTrackedMinutesOf(weeks: readonly { reviewMin: number; newPerWeek: number }[]): number | null {
  if (weeks.length === 0) return null;
  let sum = 0;
  for (const w of weeks) sum += Math.max(0, w.reviewMin || 0) + Math.max(0, w.newPerWeek || 0) * CARD_WRITE_MIN;
  return sum / weeks.length;
}

/**
 * statedForMilestone's input (roadmap-economy StatedInput) for one set of
 * switched-off practices: the practices left on, their minutes, plus the
 * rest of the plan. The Start sheet calls it on every switch; startPreview,
 * finishStartCore and R1's zero-reason read-back call it with the stored
 * switches — one arithmetic, so the sheet, the frozen goalMp and the
 * "pays nothing · …" words agree.
 */
export function startStatedInputOf(
  basis: StartPayBasis,
  practices: readonly { lineageId: string; weeklyMinutes: number }[],
  off: Iterable<string> = []
): { practiceMinutesPerWeek: number; plannedTrackedMinutesPerWeek: number; hasCards: boolean; lineagePaidOn: DayKey | null } {
  const offSet = new Set(off);
  let practice = 0;
  for (const p of practices) if (!offSet.has(p.lineageId) && Number.isFinite(p.weeklyMinutes)) practice += Math.max(0, p.weeklyMinutes);
  const other = basis.otherMinutesPerWeek != null && Number.isFinite(basis.otherMinutesPerWeek) ? Math.max(0, basis.otherMinutesPerWeek) : 0;
  return { practiceMinutesPerWeek: practice, plannedTrackedMinutesPerWeek: other + practice, hasCards: basis.hasCards, lineagePaidOn: basis.lineagePaidOn };
}

// ═══ Shapes: the intake page ════════════════════════════════════════════════

/** One Area option: a Field with its real level and card count, and its Domains' facts. */
export interface IntakeFieldOption {
  id: string;
  name: string;
  level: number;
  cards: number;
  /** "This Field is excused from quotas and Boss". */
  inMaintenance: boolean;
  /** Whether the Field has a measured new-card pace (else "New cards a week" is asked when no chosen Domain has one). */
  paceMeasured: boolean;
  domains: { id: string; name: string; cards: number; atSix: number; atTop: number; paceMeasured: boolean }[];
}

/** What /you/roadmap/new renders (F2). */
export interface IntakeView {
  today: DayKey;
  hasKey: boolean;
  keyTier: GeminiKeyTier;
  writesOff: boolean;
  /** The open DRAFT the page edits ("Continuing your draft from 3 Oct · Discard it"). */
  draft: { roadmapId: string; intake: Intake; savedDay: DayKey } | null;
  /** Another roadmap is ACTIVE: saveIntake refuses ("Archive it to start another"). */
  activeRoadmapId: string | null;
  fields: IntakeFieldOption[];
  /** "You've tracked ≈ 7 h 40 a week of tasks (task estimates, not timed; median of 4 weeks)" or calibrating. */
  tracked: WeeklyFigure | null;
}

// ═══ Shapes: the character page's Aim card ══════════════════════════════════

/** The Area chip: a Field with its real level, or a life track ("Body · practice only"). */
export type AreaChip = { kind: "FIELD"; fieldId: string; name: string; level: number } | { kind: "TRACK"; track: Track };

/** "Target lowered 60 → 50 on 12 Nov (re-plan)", for TARGET_LOWERED_SHOW_DAYS. */
export interface TargetLowered {
  measureKey: string;
  on: DayKey;
  from: number;
  to: number;
}

/**
 * ACCEPTED: a plan is accepted and no milestone has ever been carried
 * (nothing started yet). Once any milestone has been STARTING or STARTED,
 * the card is ACTIVE (or PAST_DUE / DONE), even between milestones when the
 * next one is still PLANNED, so the rank-up's "new" marker, the Proficiency
 * meter, its change line and its parts stay on the card (fix round).
 */
export type AimCardState = "EMPTY" | "RUNNING" | "DRAFT" | "ACCEPTED" | "ACTIVE" | "PAST_DUE" | "DONE";

/** The Aim card's milestone line (e): no meter here; the goal card and the ladder carry it. */
export interface AimCardMilestone {
  id: string;
  ord: number;
  of: number;
  title: string;
  /** provenanceOf(titleOrigin, titleDecision): DRAFT and KEPT_SUGGESTION render "Gemini's words · not checked" beside the title (fix round). */
  titleClass?: TextClass;
  /**
   * NUMBER spans of `title` to strike through (fix round 2): a Gemini title's
   * numbers are "struck through, never rewritten" here too. R4 derives them
   * on read exactly as MilestoneDraft.titleStruck (the same title check);
   * absent or [] when nothing is struck.
   */
  titleStruck?: [number, number][];
  status: "PLANNED" | "STARTED" | "REACHED" | "PENDING_REACH" | "PAST_DUE";
  /** goalPercent(min(parts)), captioned by the binding part's class; null: "not measured yet". */
  headline: EvidenceValue | null;
  percent: number | null;
  pace: PaceResult | PracticePace | null;
  /** milestoneDueDayOf(milestone, goal): the goal's due day once started (a Reschedule moves it). */
  dueDay: DayKey | null;
  reachedDay: DayKey | null;
  /** A pending reach's confirm day ("Reached · counts from Thu"). */
  countsFrom: DayKey | null;
  /** Accepted, not started: the stated-pay line and the rank it gives. `paidOn` dates a LINEAGE_PAID zero. */
  start: { stated: number; zeroReason: StatedZeroReason | null; givesRank: AimRankName | null; paidOn?: DayKey | null } | null;
}

/** What loadAimCard returns for /you (F19). Serialisable. */
export interface AimCardView {
  state: AimCardState;
  roadmapId: string | null;
  hasKey: boolean;
  writesOff: boolean;
  goalsLive: boolean;
  aim: string | null;
  area: AreaChip | null;
  targetDay: DayKey | null;
  /** typicalHours is set (no quiet "Aim not checked" chip). */
  aimChecked: boolean;
  over: boolean;
  /**
   * A DRAFT (or an ACTIVE roadmap's pending re-plan) waits for the user's
   * check ("A draft is waiting for your check · 6 items"): the next
   * milestone's undecided rows only, the review footer's "N items left in
   * milestone 1" — draftNeedsOf(next).length (fix round 2). Outline items
   * are decided at Start and never count here.
   */
  draftItems: number | null;
  targetLowered: TargetLowered | null;
  /** ISO time of the reading the aside shows ("measured 09:12"). */
  measuredAt: string | null;
  /**
   * The life day the current version was accepted (RoadmapAcceptance.day, as
   * RoadmapHeader.acceptedDay; fix round 2); null before any acceptance. The
   * ACCEPTED line captions Proficiency "as measured at acceptance on 4 Oct"
   * only while isAcceptanceReading(proficiency.measuredAt, acceptedDay);
   * every chain day writes a new reading, so from the next day on the caption
   * is measuredLabel(measuredAt).
   */
  acceptedDay?: DayKey | null;
  rank: AimRankView | null;
  proficiency: ProficiencyView | null;
  milestone: AimCardMilestone | null;
  /** "Week quests · 2 of 5 done · Today"; null with no quests. */
  weekQuests: { done: number; total: number } | null;
  /** This life week's quest set is not frozen yet: the page's after() schedules the fallback freeze. */
  questWeekUnfrozen: boolean;
  reachedDay: DayKey | null;
  doneDay: DayKey | null;
}

/**
 * The reading was taken on the day the plan was accepted (fix round 2): its
 * measuredAt's life day (dayKeyOf, LIFE_TZ, the 04:00 turn) is acceptedDay.
 * Only then may a caption say "as measured at acceptance"; false with either
 * missing or an unreadable time.
 */
export function isAcceptanceReading(measuredAt: string | null | undefined, acceptedDay: DayKey | null | undefined): boolean {
  if (!measuredAt || !acceptedDay) return false;
  const t = new Date(measuredAt);
  return Number.isFinite(t.getTime()) && dayKeyOf(t) === acceptedDay;
}

// ═══ Shapes: the Roadmap page ═══════════════════════════════════════════════

export type RoadmapViewState = "NONE" | "RUNNING" | "DRAFT" | "ACTIVE" | "DONE" | "ARCHIVED";

/** The Aim header (and the read-only history of a DONE or ARCHIVED roadmap). */
export interface RoadmapHeader {
  id: string;
  aim: string;
  area: AreaChip;
  status: RoadmapStatus;
  startDay: DayKey;
  targetDay: DayKey;
  version: number;
  acceptedDay: DayKey | null;
  firstAcceptedDay: DayKey | null;
  reachedDay: DayKey | null;
  doneDay: DayKey | null;
  doneReason: string | null;
  archivedDay: DayKey | null;
  archiveReason: string | null;
  hoursPerWeek: number;
  intensity: Intensity;
  track: Track;
  credential: boolean;
  nonEnglish: boolean;
  hasSyllabus: boolean;
  constraints: string | null;
  examLabel: string | null;
  aimCheck: AimCheck;
  over: boolean;
  targetLowered: TargetLowered | null;
}

/** A run's facts (RunFacts, the RUNNING state). */
export interface RunView {
  id: string;
  kind: RunKind;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  model: string | null;
  modelVersion: string | null;
  promptVersion: number | null;
  drafts: number;
  /** A RUNNING run older than RUN_STALE_MS: "Drafting stopped (timed out)". */
  stale: boolean;
  /** "usually about 18 s" once LATENCY_MIN_RUNS runs exist. */
  usualSeconds: number | null;
  error: string | null;
  report: ValidationReport | null;
  /**
   * Who wrote the rows on screen (fix round): rowsWriterOf(the roadmap's
   * runs, newest first). The draft header's lead line and the fallback banner
   * key on this, never on this run's own kind or status: the run above is
   * the latest (it may be RUNNING, CAPPED, or FAILED with nothing written).
   * null: no run wrote rows.
   */
  wrote?: RunWriter | null;
  /** The latest run is CAPPED: show DRAFT_CAP_LINE and claim nothing about the rows shown. */
  capped?: boolean;
}

/** The DRAFT state's editor model. */
export interface DraftView {
  version: number;
  milestones: MilestoneDraft[];
  feasibility: Feasibility;
  bulkKeepOff: boolean;
  credential: boolean;
  nonEnglish: boolean;
  /**
   * The unverified-draft banner: R3's roadmap-validate unverifiedAlarmOf over
   * the draft's milestones, the one rule (fix round 2). A REMOVED item no
   * longer counts, so removing the flagged items clears it; an empty Gemini
   * title counts as blocked.
   */
  alarm: boolean;
  uncoveredSyllabus: number[];
  /** The next milestone (expanded, must be decided); the rest are an outline. */
  nextLineageId: string | null;
  acceptable: boolean;
  /** The first item still to decide ("Next item to decide"): draftNeedsOf(the next milestone)[0]'s id (fix round 2). */
  nextToDecide: string | null;
}

/** One measure line ("Hold 20 cards at level 6+ in Probability, Inference (now 12)"). */
export interface MeasureRowView {
  measureKey: string;
  kind: MeasureKind;
  role: MeasureRole;
  target: number;
  baseline: number | null;
  /** The stored value, branded by class; null: "not measured yet". */
  figure: EvidenceValue | null;
  /** "+6 of 8 since start · holding 18 of 20". */
  gained: number | null;
  needed: number | null;
  /** "12 already counted when you started". */
  alreadyCounted: number | null;
  pace: PaceResult | PracticePace | null;
  measuredAt: string | null;
  /**
   * The weakest class among its inputs ("worked out on Gemini's suggested
   * Domains"). For an end-state ("Toward the aim") row: the weakest over the
   * Domain items, across the scheduled milestones, that fall in its scope —
   * never a hard-coded WORKED_OUT (fix round).
   */
  basisClass: ComputedClass;
  /** The measure's words ("Probability, Inference · cards at level 6+"): an end-state row's EndStateTerm.label (fix round). */
  label?: string;
}

export type MilestoneRowState =
  | "REACHED"
  | "PENDING_REACH"
  | "CURRENT"
  | "PLANNED"
  | "OUTLINE"
  | "LATER"
  | "DROPPED"
  | "SLIPPED"
  | "PAST_DUE"
  | "CLOSED_UNREACHED";

/** One collapsed row of the Milestones list. */
export interface MilestoneRowView {
  id: string;
  lineageId: string;
  ord: number;
  title: string;
  /** provenanceOf(titleOrigin, titleDecision): DRAFT and KEPT_SUGGESTION render "Gemini's words · not checked" beside the title (fix round). */
  titleClass?: TextClass;
  /** NUMBER spans of `title` to strike through (fix round 2), derived on read as MilestoneDraft.titleStruck. */
  titleStruck?: [number, number][];
  state: MilestoneRowState;
  windowStart: DayKey | null;
  /** milestoneDueDayOf(milestone, goal). */
  dueDay: DayKey | null;
  /** g as stored; null: not measured. */
  percent: number | null;
  rankIndex: number | null;
  /** "Reached 3 Nov · gave the Aim rank Expert" (for RANK_NEW_DAYS). */
  gaveRank: AimRankName | null;
  reachedDay: DayKey | null;
  countsFrom: DayKey | null;
  closedPercent: number | null;
}

/** "Now": the current milestone, expanded (anchor #now). */
export interface CurrentMilestoneView {
  milestone: MilestoneDraft;
  measures: MeasureRowView[];
  headline: EvidenceValue | null;
  goalId: string | null;
  starting: boolean;
  stated: number | null;
  zeroReason: StatedZeroReason | null;
  /** With LINEAGE_PAID: the day that lineage's goal paid ("already paid on 3 Mar"). */
  paidOn?: DayKey | null;
  checkpointLog: { score: number; outOf: number; bar: number | null; day: DayKey } | null;
  pastDue: boolean;
  /** Step item lineage → the life day its task was ticked ("done Tue 12 Jan"), or null while open (fix round). */
  stepDone?: Record<string, DayKey | null>;
  /** Practice item lineage → its sessions kept so far and planned so far ("kept 10 of 16 so far"), from the stored PRACTICE_KEPT detail (fix round). */
  practiceKept?: Record<string, { kept: number; of: number }>;
}

/** "Toward the aim": the end state's own meters, never blended. */
export interface TowardAimView {
  measures: MeasureRowView[];
  reached: number;
  scheduled: number;
  practiceKept: { share: number | null; sessions: number } | null;
  /** A Body Area's weight context line; null otherwise. */
  weightLine: string | null;
}

export interface PlanHistoryRow {
  version: number;
  day: DayKey;
  undone: boolean;
  changes: string[];
}

/** "Timed problems — on Today · [Keep on Today] [Archive]". */
export interface AftercareRow {
  templateId: string;
  title: string;
  milestoneOrd: number;
}

/**
 * One of the user's Domains with its real facts (fix round; R5 handoff 1):
 * the draft's Domain rows ("46 cards · 19 at level 6+ · Domain level 5 · See
 * 3 cards"), the [Map to…] and Add-a-Domain pickers, the Create sheet's
 * similarity check, topic facts and the client's label checks (the user's
 * own Domain names). Read on the server from the Field tree; `sample` holds a
 * few card titles for "See 3 cards" and never reaches a model.
 */
export interface LibraryDomain {
  id: string;
  name: string;
  fieldId: string;
  fieldName: string;
  cards: number;
  atSix: number;
  atTop: number;
  level: number;
  sample?: string[];
}

/** What loadRoadmapView returns for /you/roadmap (F18). Serialisable; rendering writes nothing but the fallback freeze. */
export interface RoadmapView {
  state: RoadmapViewState;
  today: DayKey;
  hasKey: boolean;
  keyTier: GeminiKeyTier;
  /**
   * This server records nothing (lifeWritesEnabled false). The figures shown
   * are still the STORED readings (the live app's own records, with their
   * real "measured" times); only values computed on this request (R6's
   * unfrozen week, a Proficiency with `live`) read NOT_RECORDED_HERE. The
   * banner says so: "This server records nothing: readings here are the live
   * app's own. Roadmap changes are recorded only on the live app." (fix round)
   */
  writesOff: boolean;
  goalsLive: boolean;
  header: RoadmapHeader | null;
  /** The latest run (RunFacts, the RUNNING state, a re-plan draft's header via `wrote`). */
  run: RunView | null;
  /**
   * The run that wrote the accepted version (fix round 2): RunView of
   * acceptedRunOf(the roadmap's runs, the current acceptance's version).
   * The living roadmap's "How this was drafted" (RunFacts, RunTable) reads
   * this, never `run`, which after a re-plan or a CAPPED or FAILED attempt
   * is not the run behind the plan on screen. Undefined: not loaded (label
   * the table "Latest run"); null: no acceptance yet, or no run wrote it.
   */
  acceptedRun?: RunView | null;
  /**
   * The plan's milestone count as every surface reads it (fix round 2): Now's
   * "milestone 2 of 6" and the Milestones list's count agree with the Aim
   * card's and the Start sheet's `of`, Today's chip and Toward the aim.
   * positionCountOf over the plan's scheduled rows: carried ones (a dropped
   * milestone included; a "Start again" copy shares its place) and the
   * version's PLANNED ones, LATER excluded. Undefined before a plan is
   * accepted; the UI's fallback is positionCountOf over `milestones` whose
   * state is not LATER (DROPPED included). The Paragon line keys on
   * rank.top.withAim (maxScheduledPositionsOf, over every version), never
   * on this count.
   */
  positions?: number;
  /**
   * The draft to review: a DRAFT roadmap's draft, or — with state ACTIVE — a
   * pending re-plan (version + 1, from Re-plan, a trigger banner or the
   * QUESTS_BEHIND lever). Both render the review (decide, accept, discard);
   * an ACTIVE roadmap's draft sits above Now as "Re-plan draft · not accepted
   * yet" (fix round).
   */
  draft: DraftView | null;
  /**
   * Every Field's Domains with their facts (fix round). R4 fills it on every
   * view that shows a roadmap (from the Field tree loadRoadmapView already
   * reads; up to 3 sample titles each). The UI reads undefined as "not
   * loaded here" (no picker, "Your Domains weren't checked here"), never as
   * "none of your Domains is similar".
   */
  library?: LibraryDomain[];
  rank: AimRankView | null;
  proficiency: ProficiencyView | null;
  toward: TowardAimView | null;
  current: CurrentMilestoneView | null;
  milestones: MilestoneRowView[];
  weekQuests: WeekQuestsView | null;
  pastWeeks: PastWeekView[];
  throughput: Throughput | null;
  feasibility: Feasibility | null;
  history: PlanHistoryRow[];
  triggers: TriggerHit[];
  aftercare: AftercareRow[];
  questWeekUnfrozen: boolean;
}
