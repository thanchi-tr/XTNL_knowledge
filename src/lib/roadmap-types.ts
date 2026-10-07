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
 *
 * Revision 4 (docs/life-plan/roadmap-rev4.md; contracts §14), lane 0:
 *   Gate              ROADMAP_GAPS_LIVE · GAPS_LIVE_MIN_LABELLED · REJECT_ALARM_SHARE (ROADMAP_GEMINI_LIVE kept false)
 *   Unions            TargetSource DEPTH · Remedy USE_REALISTIC_DATE, LOWER_DEPTH · ReplanTrigger CALIBRATED ·
 *                     ItemKind GAP · BlockingFlag NOT_IN_YOUR_WORDS · DropReason DUPLICATE, NOT_A_NAME, REJECTED,
 *                     CONSTRAINT · ItemNote GEMINI_PICK, NOT_CHOSEN, FROM_SUGGESTION, PRODUCTION_ADDED ·
 *                     MilestoneNote HELD_AT_START, LONG_WINDOW, NO_PRODUCTION_SLOT, DEPTH_LOWERED ·
 *                     CheckpointKind EXAM_DAY · GateStage · TrackStage · StageKey · DateMode · DateVerdict ·
 *                     AimDepth · DepthKey · IntegrityVerdict · IntegrityCode
 *   Depth             AIM_DEPTHS · DEPTH_DEFAULT · depthKeyOf · coverage constants · WRITE_MARGIN · NON_RECALL_TYPES ·
 *                     RETRY_ENTRY_DAYS · isRecallType
 *   Stages            STAGE_KEYS · STAGE_LEVEL · STAGE_NAMES · stageOfLevel · stageLabelOf · TRACK_STAGE_KEYS ·
 *                     TRACK_STAGE_SHARES · FIRST_RANK_MAX_DAYS · rankIndexForStage · topRankIndexOfDepth
 *   Dates             DATE_MODES · DATE_VERDICTS · OVER_PACE_FACTOR · SCHEDULE_BOUND_SHARE · PACE_SHARE
 *   The reach model   REACH_* · P_PRIOR · C_PRIOR · RHO_PRIOR · LONG_GAP_LEVEL · P_LONG_CAP · ReachParams ·
 *                     reachInputsOf · reachTable · reachProb · existingExpectedSlack · newExpectedSlack ·
 *                     referenceWriteDaysOf · stageDayOf (F-R4-8, implemented in full)
 *   The ledger tag    parseReviewDetail (srs.ts writes "advanced · L11→12", "strike · L11")
 *   Keys              cardsAtLevelKey's `r` / `rc` segment, parseMeasureKey reads it (CardSegment)
 *   Shapes            DateCheck · DateOrigin · DepthChoice · CoverageChoice · CoverageBreakdown · DomainOrigin(s) ·
 *                     ValidationIntegrity · DraftReplyV3 · AimStep · AimLineView · LastAimView · GapView ·
 *                     ConstraintExclusion · SessionPicks · DomainAddition · MotivationTimeline · the parts on the
 *                     week quest specs, and optional fields on Intake, IntakeView, DraftView, RoadmapView,
 *                     RoadmapHeader, AimCardView, MilestoneDraft, ItemDraft, StartSnapshot, Feasibility, Throughput
 *   Legacy            isLegacyRoadmap (F-R4-16) · REV4_COLUMNS · isMissingRev4Column (the migration's insurance)
 *
 * Revision 4 fix round (contracts §15), lane 0: one definition each where the
 * lanes disagreed or read through casts:
 *   Clean entry       ReviewLedgerRow · isRetryEntry · retryReadDaysOf (R1's rule; R1 and R6 import it)
 *   Ranks             rankIndexForStage(stage, gateLevel?, depth?): a PART at the depth gives the gate below's rank
 *   Coverage          Feasibility.coverage (frozen at intake) · frozenCoverageCountsOf · WRITE_MARGIN 1.3
 *   Acceptances       acceptanceOrderBy · isDepthLoweringRecord (a lowered depth is a record within its version)
 *   Integrity         gapsNotShownOf (hidden + dropped: every gap name not shown)
 *   Plan-born tasks   isRoadmapCaptureKey (no model sizes or explains a plan-born template)
 *   View fields       ProficiencyToward · ProficiencyView.toward/label · WeekQuestRow.partsLine/health ·
 *                     ItemEdit.catalogKey · IntakeFieldOption.domains[].nonRecall · StartPreview.pay.restsOnAdded ·
 *                     CurrentMilestoneView.startFeasibility/startedDay · RoadmapHeader.domainIds · LegacyView.domainIds
 *
 * Revision 4 fix round 2 (contracts §16), lane 0:
 *   Clean entry       retryReadDaysOf widened to hold the entering pass and the miss before it · JITTER_HIGH
 *   View fields       PlanHistoryRow.depthLowered (R4 sets it; R5 keys "depth lowered" on it) ·
 *                     AimCardView.legacyView (the Aim card's legacy banner facts)
 *   Ranks             AssignRankIndices takes R1's optional depth (R4's rankIndicesOf passes it)
 *
 * Constraint safety, "confirm to unlock" (contracts §19), lane 0: constraint
 * safety rests on neither the parser nor the cue detector. Every BODY or
 * CARE plan asks once (a CRAFT plan when its words carry a cue); the
 * parser's reading only suggests.
 *   Cue detector      CueClass · CueSource · CueSpan · CueReading · the CUE_* vocabularies ·
 *                     constraintCuesOf (text → {hasCue, cues, unparseable}) · CueTexts · cueTextsOf ·
 *                     cueReadingOf · cueKeyOf (the track's and the words') · cueLegacyKeyOf (read only) · userClauseOf ·
 *                     otherGoalTextsOf (§23.6: the other goals' texts the reading and the "k3-" key take)
 *   The confirmation  ActivityCardAnswer (what the card sends: key, avoid, nothingToAvoid) ·
 *                     ActivityConfirm (stored, YOURS: key, AVOID kinds, answered) · ActivityCardAnswered ·
 *                     ActivityConfirmEntry · ActivityVerdict · ActivityAnswer (deprecated per-kind form) ·
 *                     ACTIVITY_CONFIRM_KEY (its place in Roadmap.coverage) · ACTIVITY_REASON_MAX
 *   The gate's shapes ConstraintsState · ActivityPrefill · ActivityRowState · ActivityRow · ActivityGate ·
 *                     ActivityConfirmView (the view field: key, answered, rows …) · Intake.activities ·
 *                     DraftView.activityConfirm · RoadmapView.activityConfirm
 *   (roadmap-catalog.ts holds the catalog half: CatalogEntry.safe, CUE_SAFE_KINDS, cueSafeKindsOf,
 *   the tracks that ask, cueGatedKindsOf, constraintsStateOf, allowedKindsFor, answerActivityCard, the
 *   refusals, and the reader and writer of the stored answers.)
 *
 * The practice progression (contracts §20), lane 0: after the probe's no-go,
 * code owns the practice progression on every plan path (roadmap-catalog
 * progressionOf); Gemini's reply shrinks to needs, the outline's order and
 * one pick per stage among code's candidates.
 *   Reply v4          ROADMAP_PROMPT_VERSION 4 · DraftReplyV4 · REPLY_V4_PROPERTIES · OutlineOrder ·
 *                     outlineOrderOf (the reply's order, every line kept) · outlineStagesOf (split across stages)
 *   Family (§20.11)   PracticeFamily · PRACTICE_FAMILIES · PRACTICE_FAMILY_DEFAULT · isPracticeFamily ·
 *                     practiceFamilyPrefillOf (the form's prefill, code's reading of the aim) ·
 *                     Intake.practiceFamily (the user's answer) · PRACTICE_FAMILY_KEY (its place in Roadmap.coverage)
 * The practice, step and checkpoint catalog is roadmap-catalog.ts; the aim
 * invitation rules are roadmap-invite.ts; the aim handoff is roadmap-handoff.ts.
 *
 * Revision 5 (docs/life-plan/roadmap-topic-map.md; contracts §22, §23), lane 0,
 * the last section of this file. Every switch is false and GOALS_MAX is 1, so
 * nothing a user can reach changes; LEVELS (every plan today) is unchanged.
 *   Widened unions    RoadmapStatus PAUSED (decision 68) · ReplanKind TOPICS
 *   Switches          GOALS_MAX · GOAL_SLOTS_MAX · TOPIC_*_LIVE · TopicSwitches · topicSwitchesOf
 *   Model and runs    TOPIC_PROMPT_VERSION · TOPIC_SAMPLES · CONSENSUS_MIN · DEDUPE_DICE · EDGE_DRAW ·
 *                     the GROUND constants · the request caps
 *   The rating        DiffKey · BreadthKey · the reason unions · RATING_REASON_LABEL · REASON_COHERENCE ·
 *                     Caution · RatingOrigin · LayerChangeKind · diffKeyOf · layersOfDiff
 *   Map and chain     PlanKind · TopicDepth · DEPTH_TAIL · the topic, edge, run and chain unions ·
 *                     ModelTextClass · PREREQS_OPEN · topicRankIndexOf · isTopicDepth
 *   Goals             SEAT_STATUSES · HOLD_STATUSES · GoalSlot · isGoalSlot · GOAL_LABEL_MAX · GOALS_FULL
 *   Shapes            the rating record, clauses, topics and edges, the replies, GROUND's record, the
 *                     actions' inputs, the views, the goals' views; geminiNamedOf · namedPartsOf (the mark)
 *   Optional fields   on Intake, IntakeView, RoadmapHeader, RoadmapView, DraftView, MilestoneDraft,
 *                     MeasureSpec, MilestoneRowView, MeasureRowView, AimCardView, WeekQuestRow,
 *                     WeekQuestsView, WeekQuestSet, AcceptChoices, RealismInput, DepthRankInput, CueTexts,
 *                     CueSpan, ConstraintsState, ActivityRow and ActivityConfirmView (§22.3's table)
 * The new modules are roadmap-rating, roadmap-topics, roadmap-grounding and
 * roadmap-goals (shells until lanes 6 and 3). No word list lives here (ruling 33).
 */
import { MASTERY_LEVEL, baseIntervalDays, graceDays } from "./xp";
import { addDays, dayKeyOf, daysBetween, type DayKey } from "./life-day";
import { isFixedSchedule, occurrencesBetween, parseRule, periodOf, type Rule, type RuleLike } from "./recurrence";
import { instanceOutcome, outcomesOf, targetUnits, type InstanceLike } from "./habit";
import { WEEK_JUDGE_LAG_DAYS, type LifeEnv } from "./life-economy";
import { SETTLE_LAG_DAYS } from "./duty-economy";
import { DURATION_BAND_MINUTES } from "./life-lexicon";
import type { Category, Track } from "./life-types";
import type { RoadmapGoalEntry, RoadmapSeriesPoint } from "./goals";
import type { QuestionType } from "@prisma/client";
import type { CatalogKey, CatalogTrack } from "./roadmap-catalog";

export type { RoadmapGoalEntry, RoadmapSeriesPoint };

// ═══ Gate and strings ═══════════════════════════════════════════════════════

/**
 * Start is hidden (not disabled) while false: "Starting milestones arrives
 * with the next update". The lead flips it after the goal seams land and the
 * reviewers pass (F16 seam 15). Nothing else reads it as a launch gate.
 */
export const ROADMAP_GOALS_LIVE = false;

/**
 * Gemini drafting is hidden (no "Draft with Gemini", no Gemini sentence)
 * and refused by the claim while false. It turns on only when the keys-only
 * probe passes roadmap-rev4.md F-R4-23's go/no-go gate; until then every
 * plan is built from the user's numbers or written by hand (rev 4 P0).
 */
export const ROADMAP_GEMINI_LIVE = false;

/** The claim's refusal while ROADMAP_GEMINI_LIVE is false. */
export const GEMINI_DRAFTING_OFF = "Gemini drafting is off until its checks pass. Build from your numbers or write it yourself.";

/**
 * The area-suggestion slot (`gaps`, Gemini's only free text) exists only
 * while this is true (rev 4 decision 51). False in this build: the intake
 * hides the switch, `gaps` is absent from every response schema, and a
 * stored Roadmap.suggestAreas true is ignored. Lead only; it turns on only
 * after GAPS_LIVE_MIN_LABELLED real gap strings from approved calls are
 * labelled and none labelled a claim would be shown (F-R4-19, F-R4-23).
 */
export const ROADMAP_GAPS_LIVE = false;
/** Real gap strings that must be labelled before ROADMAP_GAPS_LIVE may turn on. */
export const GAPS_LIVE_MIN_LABELLED = 30;
/**
 * Production monitor (F-R4-20): REJECTED plus SALVAGED over a week's v3
 * Gemini runs above this share turns ROADMAP_GEMINI_LIVE off (by the lead).
 */
export const REJECT_ALARM_SHARE = 0.2;

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

/**
 * The aim prompt's cookie, read on the server by /you and Today. Revision 4
 * (roadmap-invite.ts aimPromptOf): 'later:<day>' is the 4-week "Not now"
 * snooze, 'on:<day>' marks the Settings switch turned back on, and a legacy
 * 'off' (rev 3's year-long ×) is still read as a no. No action writes 'off'
 * any more; the lasting no is LifeSettings.aimSuggestions = false.
 */
export const AIM_PROMPT_COOKIE = "xtnl-aim-prompt";
/** A year in seconds: rev 3's 'off' lifetime (legacy; the 'later:' and 'on:' values use roadmap-invite AIM_PROMPT_LATER_MAX_AGE_S). */
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

/**
 * Roadmap.status. Revision 5 (decision 68, which supersedes decision 15's
 * "one open roadmap per user"; contracts §23): a user keeps up to
 * GOAL_SLOTS_MAX open goals, each DRAFT or ACTIVE one in a seat
 * (SEAT_STATUSES); GOALS_MAX stays 1 until lane 4, so today's one-open rule
 * holds. PAUSED frees the seat but still holds the goal's Domains, AVOIDs
 * and cue texts (HOLD_STATUSES); no path writes it before lane 3.
 */
export type RoadmapStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "DONE" | "ARCHIVED";
export const ROADMAP_STATUSES: readonly RoadmapStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "DONE", "ARCHIVED"];

/** RoadmapMilestone.status. CLOSED, DROPPED and REACHED are derived, never stored. LATER rows have no dates. */
export type MilestoneStatus = "DRAFT" | "PLANNED" | "STARTING" | "STARTED" | "LATER" | "SUPERSEDED" | "DISCARDED";
export const MILESTONE_STATUSES: readonly MilestoneStatus[] = ["DRAFT", "PLANNED", "STARTING", "STARTED", "LATER", "SUPERSEDED", "DISCARDED"];

/** Who wrote a string: RoadmapMilestone.titleOrigin and RoadmapItem.origin. */
export type Origin = "GEMINI" | "CODE" | "USER" | "SYLLABUS";
export const ORIGINS: readonly Origin[] = ["GEMINI", "CODE", "USER", "SYLLABUS"];

/** What the user did with it: titleDecision and decision. */
export type Decision = "PENDING" | "KEPT" | "CHECKED" | "EDITED" | "REMOVED";
export const DECISIONS: readonly Decision[] = ["PENDING", "KEPT", "CHECKED", "EDITED", "REMOVED"];

/**
 * RoadmapItem.kind. DOMAIN → Domain.id; STEP → a goal step; CHECKPOINT is
 * context only. GAP (revision 4, F-R4-19) is an area Gemini thinks may need
 * its own Domain: origin GEMINI, domainId null, on the version's first
 * milestone as a plan-level row, quarantined — no path that reads DOMAIN
 * items, measures, scope, fitting, Today-bound rows, quest input, accept
 * blockers, RunFacts labels or report labels ever sees one, and `undecided`
 * excludes it. None exists while ROADMAP_GAPS_LIVE is false.
 */
export type ItemKind = "DOMAIN" | "TOPIC" | "PRACTICE" | "STEP" | "CHECKPOINT" | "GAP";
export const ITEM_KINDS: readonly ItemKind[] = ["DOMAIN", "TOPIC", "PRACTICE", "STEP", "CHECKPOINT", "GAP"];
/** The kinds a plan holds (every ItemKind but the quarantined GAP): what measures, Start, quests and the editor read. */
export type PlanItemKind = Exclude<ItemKind, "GAP">;
export const PLAN_ITEM_KINDS: readonly PlanItemKind[] = ["DOMAIN", "TOPIC", "PRACTICE", "STEP", "CHECKPOINT"];

/** RoadmapItem.planSource: who set sessions, band and rule. */
export type PlanSource = "WORKED_OUT" | "YOURS";

/** RoadmapMeasure.kind (closed). PROFICIENCY is a reading, never a measure row. */
export type MeasureKind = "CARDS_AT_LEVEL" | "PRACTICE_KEPT" | "CHECKPOINT";
export const MEASURE_KINDS: readonly MeasureKind[] = ["CARDS_AT_LEVEL", "PRACTICE_KEPT", "CHECKPOINT"];
export type MeasureRole = "PAYS" | "CONTEXT";
/**
 * Where a measure's target came from. DEPTH (revision 4): a depth plan's
 * stage or end-state term, n_d from the coverage policy (F-R4-9) — never
 * scaled by intensity, never fitted to reach, never lowered by a remedy.
 * YOURS when the user typed it.
 */
export type TargetSource = "WORKED_OUT" | "YOURS" | "DEPTH";
export const TARGET_SOURCES: readonly TargetSource[] = ["WORKED_OUT", "YOURS", "DEPTH"];
/** Where a scope's new-card pace comes from, in order: the scope, the Area Field, the user's typed rate, none. */
export type RateSource = "SCOPE" | "FIELD" | "YOURS" | "NONE";
export const RATE_SOURCES: readonly RateSource[] = ["SCOPE", "FIELD", "YOURS", "NONE"];

export type RunKind = "GEMINI" | "INHOUSE" | "MANUAL";
export type RunStatus = "RUNNING" | "OK" | "PARTIAL" | "FAILED" | "CAPPED" | "REUSED";
export type ReadingSource = "COMPUTED" | "SELF";

/** Practice methods (recurring). Each has METHOD_HOW copy in roadmap-copy.ts. */
export type PracticeMethod = "DELIBERATE_PRACTICE" | "READING" | "PROJECT_WORK" | "COACHED_SESSION" | "WORKOUT" | "WRITING";
export const PRACTICE_METHODS: readonly PracticeMethod[] = ["DELIBERATE_PRACTICE", "READING", "PROJECT_WORK", "COACHED_SESSION", "WORKOUT", "WRITING"];

/**
 * Checkpoint kinds. The bar and outOf are always the user's (YOURS).
 * EXAM_DAY (revision 4, F-R4-11) is placed by code only, on the stage
 * holding Roadmap.examDay: it is never in a model enum and never offered in
 * an editor picker (roadmap-catalog marks it codeOnly).
 */
export type CheckpointKind = "MOCK_TEST" | "PERFORMANCE_CHECK" | "SELF_TEST" | "EXAM_DAY";
/** The kinds a user or a (v2) model may pick: every kind but the code-placed EXAM_DAY. Unchanged from rev 3. */
export const CHECKPOINT_KINDS: readonly CheckpointKind[] = ["MOCK_TEST", "PERFORMANCE_CHECK", "SELF_TEST"];
/** Every stored value of RoadmapItem.checkpointKind (the TEXT union), EXAM_DAY included: what a reader of stored rows accepts. */
export const STORED_CHECKPOINT_KINDS: readonly CheckpointKind[] = ["MOCK_TEST", "PERFORMANCE_CHECK", "SELF_TEST", "EXAM_DAY"];

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
  | "LANGUAGE_UNCHECKED"
  | "NOT_IN_YOUR_WORDS";
/**
 * NOT_IN_YOUR_WORDS (revision 4, F-R4-19): a gap name whose content stems do
 * not all appear, in order, inside one text the user typed or chose. A name
 * carrying it (or any other blocking flag) is never shown; it is only counted.
 */
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
  "NOT_IN_YOUR_WORDS",
];

/**
 * Notes (shown, never blocking). PLACEHOLDER marks the starter's "Practice
 * for <aim>" (F7). Revision 4:
 *   GEMINI_PICK       a practice, step or checkpoint type Gemini picked from
 *                     the app's list ("practice type picked by Gemini from the app's list")
 *   NOT_CHOSEN        a DOMAIN item for a Domain Gemini's `needs` added (pending the user's confirm)
 *   FROM_SUGGESTION   a DOMAIN item for a Domain the user created from a GAP row
 *   PRODUCTION_ADDED  a production practice code added at Retained and above ("added by the app")
 */
/** Revision 5, lane 8 (ruling 5): TOPIC_MAP marks a Domain item an accept created from a chosen topic of a TOPICS map (the FROM_SUGGESTION path). */
export type ItemNote = "CHECK_LINK" | "ADDED_TO_SCOPE" | "RAISED" | "STUDY_ADDED" | "PLACEHOLDER" | "GEMINI_PICK" | "NOT_CHOSEN" | "FROM_SUGGESTION" | "PRODUCTION_ADDED" | "TOPIC_MAP";
export const ITEM_NOTES: readonly ItemNote[] = ["CHECK_LINK", "ADDED_TO_SCOPE", "RAISED", "STUDY_ADDED", "PLACEHOLDER", "GEMINI_PICK", "NOT_CHOSEN", "FROM_SUGGESTION", "PRODUCTION_ADDED", "TOPIC_MAP"];

/** "Targets vs your pace": FITTED for a code-fitted target (no verdict); the rest only for a typed (YOURS) target. */
export type KnowledgeVerdict = "FITTED" | "FITS" | "TIGHT" | "OVER" | "IMPOSSIBLE";
/** "App-tracked time", for the worst calendar week. UNVERIFIED is a flag beside it, never a verdict of its own. */
export type TimeVerdict = "FITS" | "TIGHT" | "OVER";

/**
 * The remedies, one tap each (F4 step 9): (a) move the date, (b) re-fit at
 * Light, (d) move trailing milestones to Later. Revision 4 (F-R4-11), on a
 * depth plan: USE_REALISTIC_DATE ([Use Sun 21 Nov 2027]: the date check's
 * D_real; MOVE_DATE is retargeted to D_real there) and LOWER_DEPTH ([Choose
 * a lower depth…], the only path that lowers a depth, shown for good).
 * REFIT_LIGHT and MOVE_TO_LATER are never offered on a depth plan.
 */
export type Remedy = "MOVE_DATE" | "REFIT_LIGHT" | "MOVE_TO_LATER" | "USE_REALISTIC_DATE" | "LOWER_DEPTH";
export const REMEDIES: readonly Remedy[] = ["MOVE_DATE", "REFIT_LIGHT", "MOVE_TO_LATER", "USE_REALISTIC_DATE", "LOWER_DEPTH"];
/** The remedies a depth plan may offer (F-R4-11): never one that lowers a target or drops the depth stage. */
export const DEPTH_REMEDIES: readonly Remedy[] = ["USE_REALISTIC_DATE", "LOWER_DEPTH"];

/**
 * A re-plan in v1: a re-fit to the user's numbers, or by hand. REDRAFT is
 * Deferred. TOPICS (revision 5, contracts §22.2): [Break into topics], which
 * replanCore refuses ("Pick Re-fit or Edit by hand."); lane 8's
 * breakIntoTopicsCore is its path.
 */
export type ReplanKind = "REFIT" | "MANUAL" | "TOPICS";

/**
 * Behind-pace signals; shown on the Roadmap page and the Aim card only,
 * never on Today or in the bell. CALIBRATED (revision 4, F-R4-11): an input
 * the accepted date assumed (dateOrigin.calibrating) is now measured —
 * "Re-date the stages you haven't started?"; re-dating never lowers n_d or a level.
 */
export type ReplanTrigger = "BEHIND" | "SLIPPED" | "PRACTICE_LOW" | "CARRIED" | "CHECKPOINT_MISMATCH" | "PACE_MEASURED" | "QUESTS_BEHIND" | "CALIBRATED";
export const REPLAN_TRIGGERS: readonly ReplanTrigger[] = ["BEHIND", "SLIPPED", "PRACTICE_LOW", "CARRIED", "CHECKPOINT_MISMATCH", "PACE_MEASURED", "QUESTS_BEHIND", "CALIBRATED"];

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

/**
 * Words that make an aim a credential aim (plus any all-caps token of 2–6
 * letters, or any exam label). Revision 4 (F-R4-24) widens the list for the
 * exam question's PREFILL only ("Is there an exam or qualification at the
 * end? Yes / No", prefilled by examPrefillOf, always editable): bar,
 * chartered, registered, licensure, licensing, board, boards, accredited.
 * "Credential" itself becomes examLabel ≠ null, the user's own answer, so
 * the wider list never gates anything but the prefill.
 */
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
  "bar",
  "chartered",
  "registered",
  "licensure",
  "licensing",
  "board",
  "boards",
  "accredited",
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
/** The jitter's upper bound (xp.ts: × (0.75 + rand × 0.5), so always under × 1.25): retryReadDaysOf's widest interval at levels 5–8. */
export const JITTER_HIGH = 1.25;

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
  /** Revision 4: false for a NON_RECALL_TYPES card (multiple choice), which a depth plan does not count; absent reads as counted (rev 3). */
  recall?: boolean;
  /** Revision 4 (clean entry): it entered its current level on a next-day retry ('strike…' then 'advanced…' within RETRY_ENTRY_DAYS). */
  retryEntry?: boolean;
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
  /**
   * Revision 4 (F-R4-8; R2): ρ, P(off tomorrow | off today) over the last
   * CLEARANCE_SERIES_DAYS life days of the clearance series, an "off" day
   * clearing under OFF_DAY_CLEAR_SHARE of its due queue; calibrating below
   * RHO_MIN_DAYS measured days (RHO_PRIOR then). Absent reads as calibrating.
   */
  absencePersistence?: ShareFigure;
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
/**
 * 4 (contracts §20, the lead's decision after the probe): code owns the
 * practice progression (roadmap-catalog progressionOf), and the reply
 * (DraftReplyV4) holds only which unchosen Domains the aim needs, the
 * outline's order, and at most one pick per stage among code's candidates
 * (progressionPickEnumsOf), still keys only (and, only while
 * ROADMAP_GAPS_LIVE and the user's switch are both on, at most GAPS_MAX gap
 * strings). Revision 4 began at 3, keys-only drafting (F-R4-17: Gemini
 * picked every practice, step and checkpoint kind; DraftReplyV3). inputHash
 * includes the version, so a v3 reply is never reused; v2 rows are legacy
 * (F-R4-16).
 */
export const ROADMAP_PROMPT_VERSION: number = 4;
/** The most gap strings a reply may hold (the `gaps` array's maxItems; F-R4-19). */
export const GAPS_MAX = 4;
/** A gap name's caps: characters, words, and characters per word (the shape rule). */
export const GAP_NAME_MAX = 40;
export const GAP_WORDS_MAX = 4;
export const GAP_WORD_CHARS_MAX = 24;
/** Scripts written without spaces between words: a gap name holding any of their characters is dropped (NOT_A_NAME). */
export const NO_SPACE_SCRIPTS: readonly string[] = ["Han", "Hiragana", "Katakana", "Thai", "Lao", "Khmer", "Myanmar", "Tibetan"];
/** A stored integrity violation's path is cut to this many characters (F-R4-20). */
export const REPORT_PATH_SEGMENT_MAX = 64;
/** The segment a normalised report path holds in place of any key that is not a schema property name or an index. */
export const REPORT_EXTRA_SEGMENT = "<extra>";
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
 * ── Revision 5, lane 10 (contracts §22.15, ruling 17): chain heads only. A
 * run with no phase (every LEVELS run; a row read before migration B) or
 * phase RATE counts; MAP, LINK, GROUND and DEEPER never count a draft (they
 * count against the request caps). The SQL guard adds
 * `AND ("phase" IS NULL OR "phase" = 'RATE')`. A row with no phase reads
 * exactly as before, so LEVELS is unchanged.
 */
export function countsTowardDraftCap(run: { kind: RunKind | string; status: RunStatus | string; phase?: RunPhase | string | null }): boolean {
  if (run.kind !== "GEMINI" || run.status === "REUSED") return false;
  const phase = run.phase ?? null;
  return phase === null || phase === "RATE";
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
 * `fallback` is the stored report's `fallback` field. Revision 5 (lane 10; contracts §22.15): a topic chain step
 * (RoadmapRun.phase set: RATE, MAP, LINK, GROUND, DEEPER) writes the map, never milestone rows (code rebuilds those from
 * the map), so it is never the rows' writer; a LEVELS run has no phase and reads as before.
 */
export function runWriterOf(run: { kind: RunKind | string; status: RunStatus | string; fallback?: string | null; phase?: string | null }): RunWriter | null {
  if (run.phase != null) return null;
  if (run.status === "FAILED") return run.kind === "GEMINI" && run.fallback === RUN_FALLBACK_STARTER ? "STARTER" : null;
  if (run.status !== "OK" && run.status !== "PARTIAL" && run.status !== "REUSED") return null;
  return run.kind === "GEMINI" || run.kind === "INHOUSE" || run.kind === "MANUAL" ? run.kind : null;
}

/**
 * The writer of the rows on screen: the newest run (runs newest first) that
 * wrote rows. A CAPPED "Draft again" over a Gemini draft therefore still
 * reads Gemini; a FAILED run that wrote nothing never relabels the rows.
 */
export function rowsWriterOf(runsNewestFirst: readonly { kind: RunKind | string; status: RunStatus | string; fallback?: string | null; phase?: string | null }[]): RunWriter | null {
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
export function acceptedRunOf<T extends { kind: RunKind | string; status: RunStatus | string; fallback?: string | null; phase?: string | null; version: number }>(
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

/**
 * Revision 4: 2 (F-R4-14): RAISE and ADD carry per-Domain `parts`, counts use
 * the reach model and recall cards (clean entry for an `rc` key). A frozen
 * v1 set (no parts) renders as a single part from its stored fields, and its
 * results are unchanged.
 */
export const WEEK_QUEST_GENERATOR_VERSION: number = 2;
/** Today's RAISE and ADD rows show this many parts, then "+n more" (the roadmap page shows them all). */
export const WEEK_QUEST_PARTS_TODAY = 2;
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
/**
 * Revision 4: 2 (F-R4-12). On a depth plan the cards part is the depth
 * terms (n_d recall cards at L*, clean entry at L*), the stages part counts
 * held stages as reached and a PART gate as a position, and the label always
 * names its basis ("Proficiency toward Mastered (level 12): 28%"). A v2
 * reading shows no delta against a v1 reading (rev 3's detail.v rule).
 */
export const PROFICIENCY_VERSION: number = 2;

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
 *
 * `depth` (fix round 2, contracts §16.9; R1 already takes it): the plan's
 * depth, which rankIndexForStage reads for a PART at the depth (§15.4). R4's
 * rankIndicesOf passes it rather than re-ranking the rows after the call.
 *
 * `planKind` (revision 5, contracts §22.1 ruling 51; lane 7 reads it in R1,
 * lane 8 passes it): on TOPICS each gate i of G takes topicRankIndexOf(i, G,
 * top), held, skipped and all-held rows give null and are not counted in G,
 * and rankIndicesOf skips its by-stage pass. Absent or LEVELS: as above.
 */
export type AssignRankIndices = (rows: readonly RankRow[], firstByLineage: Readonly<Record<string, number>>, depth?: number | null, planKind?: PlanKind | null) => Record<string, number | null>;

// ═══ Revision 4: depth and coverage (F-R4-9; decisions 36, 53) ══════════════
//
// High mastery is a Depth: every required Domain holds n_d recall cards at
// level ≥ L*, a card at exactly L* counting only when it entered L* on a
// first-try pass (clean entry). The depth is the aim's end state: never
// scaled by intensity, never fitted to reach, never lowered by a remedy.
// Only the user's explicit LOWER_DEPTH tap (or a coverage edit) lowers it,
// and the plan shows that choice for good.

/** A depth's name (the Segmented control's value). */
export type DepthKey = "MASTERED" | "FLUENT" | "RETAINED";
/** Roadmap.depth: the gate level of the final stage. Null on a track Area and on a legacy plan. */
export type AimDepth = 12 | 10 | 8;
export const AIM_DEPTHS: Readonly<Record<DepthKey, AimDepth>> = { MASTERED: 12, FLUENT: 10, RETAINED: 8 };
/** Deepest first (the Segmented control's order). */
export const DEPTH_KEYS: readonly DepthKey[] = ["MASTERED", "FLUENT", "RETAINED"];
/** A Field aim's default depth (question 5): Mastered, level 12. */
export const DEPTH_DEFAULT: DepthKey = "MASTERED";

export function isAimDepth(v: unknown): v is AimDepth {
  return v === 12 || v === 10 || v === 8;
}

/** The depth's name for its level. */
export function depthKeyOf(depth: AimDepth): DepthKey {
  return depth === 12 ? "MASTERED" : depth === 10 ? "FLUENT" : "RETAINED";
}

/** R, the required Domains of a depth plan, holds at most this many (the chosen, the confirmed additions, the named and the created). */
export const DEPTH_DOMAINS_MAX = 6;
/** The coverage policy: n_d = max(COVER_FLOOR_CARDS, ceil(COVER_SHARE × live recall cards), ceil(CARDS_PER_OUTLINE_LINE × lines_d)). */
export const COVER_FLOOR_CARDS = 25;
export const COVER_SHARE = 0.8;
export const CARDS_PER_OUTLINE_LINE = 3;
/** A typed coverage figure (YOURS) lies in COVER_MIN..COVER_MAX; one under the policy figure is a coverage choice, shown for good. */
export const COVER_MIN = 1;
export const COVER_MAX = 500;
/**
 * The writing need: new_d = max(0, ceil(WRITE_MARGIN × n_d) − live_d) — a 30%
 * spare, because some cards lag. Fix round (contracts §15.2): 1.1 → 1.3. Under
 * clean entry about 1 card in 5 misses its level-11 review at the first try
 * and waits about 160 days for its next pass, which a 10% spare can't cover:
 * at 1.1 a new learner's Mastered came on day 547 (about 18 months) and the
 * final stretch ran 203–231 days on 6 corpus fixtures, past F-R4-10's
 * 192-day bound and question 9's "about 11–15 months". At 1.3 the learner's
 * Mastered is day 460 (about 15 months) and the stretch 139, for about 16
 * more writing days (the last card on day 106 instead of 90).
 */
export const WRITE_MARGIN = 1.3;
/** Card types a depth plan does not count (question 16): recognising one option out of four is not recall. */
export const NON_RECALL_TYPES: readonly QuestionType[] = ["MULTI"];
/** A 'strike' then 'advanced' within this many life days is a retry entry (it counts at L* only after its next pass). */
export const RETRY_ENTRY_DAYS = 2;

/** A recall card: every card type except NON_RECALL_TYPES. live_d, every stage measure and every depth term count only these. */
export function isRecallType(type: string | null | undefined): boolean {
  return typeof type === "string" && !(NON_RECALL_TYPES as readonly string[]).includes(type);
}

/** ceil that forgives binary-floating noise (0.8 × 30 = 24.000000000000004 is 24, not 25; 1.1 × 30 is 33; 1.3 × 10 is 13). */
function ceilClean(x: number): number {
  return Math.ceil(Math.round(x * 1e9) / 1e9);
}

/**
 * The coverage policy's figure for one Domain (F-R4-9): the most of the
 * 25-card floor, 80% of its live recall cards, and 3 cards per outline line
 * (`lines` = the lines tied to it plus its even share of the lines tied to
 * no Domain in R; fractional shares allowed). R2's coverageOf shows all
 * three terms; this is the one arithmetic.
 */
export function coveragePolicyOf(liveRecall: number, lines: number): { n: number; floor: number; share: number; outline: number } {
  const floor = COVER_FLOOR_CARDS;
  const share = ceilClean(COVER_SHARE * Math.max(0, liveRecall));
  const outline = ceilClean(CARDS_PER_OUTLINE_LINE * Math.max(0, lines));
  return { n: Math.max(floor, share, outline), floor, share, outline };
}

/** new_d = max(0, ceil(WRITE_MARGIN × n_d) − live_d): the new recall cards a Domain needs written. Inference (n 25, 9 live) needs 24; Probability (n 34, 42 live) 3. */
export function writeNeedOf(n: number, liveRecall: number): number {
  return Math.max(0, ceilClean(WRITE_MARGIN * Math.max(0, n)) - Math.max(0, Math.floor(liveRecall)));
}

/** One Domain's counts as coverage reads them: its live recall cards and the multiple-choice cards left out. */
export interface CoverageCounts {
  id: string;
  live: number;
  nonRecall: number;
}

/**
 * The counts a Domain's coverage is worked out from, frozen at intake (F-R4-9
 * "the Domain's live recall cards at intake"; fix round, contracts §15.3): a
 * Domain already in `prior` — the current live acceptance's
 * Feasibility.coverage, or on the first acceptance the draft's — keeps its
 * stored live and nonRecall; only a Domain newly in R reads today's library.
 * So archiving cards, a card turning multiple choice, or writing more cards
 * never moves n_d at a re-plan's accept or a lowered depth, and never turns
 * a typed figure into a false coverage choice: only a typed figure (YOURS),
 * a line's Domain (the user's) or LOWER_DEPTH changes the end state.
 * A malformed stored entry is ignored (that Domain reads today's counts).
 */
export function frozenCoverageCountsOf(today: readonly CoverageCounts[], prior: readonly Partial<Pick<CoverageBreakdown, "domainId" | "live" | "nonRecall">>[] | null | undefined): CoverageCounts[] {
  const stored = new Map<string, { live: number; nonRecall: number }>();
  for (const c of prior ?? []) {
    if (!c || typeof c.domainId !== "string" || typeof c.live !== "number" || !Number.isFinite(c.live)) continue;
    const nonRecall = typeof c.nonRecall === "number" && Number.isFinite(c.nonRecall) ? c.nonRecall : 0;
    if (!stored.has(c.domainId)) stored.set(c.domainId, { live: Math.max(0, Math.floor(c.live)), nonRecall: Math.max(0, Math.floor(nonRecall)) });
  }
  return today.map((d) => {
    const s = stored.get(d.id);
    return s ? { id: d.id, live: s.live, nonRecall: s.nonRecall } : { id: d.id, live: d.live, nonRecall: d.nonRecall };
  });
}

// ═══ Revision 4: stages (F-R4-10) ═══════════════════════════════════════════

/** The gate stages, at the THRESHOLDS levels. A depth plan climbs the gates ≤ its depth. */
export type GateStage = "FOUNDATION" | "FAMILIAR" | "RETAINED" | "FLUENT" | "MASTERED";
export const STAGE_KEYS: readonly GateStage[] = ["FOUNDATION", "FAMILIAR", "RETAINED", "FLUENT", "MASTERED"];
export const STAGE_LEVEL: Readonly<Record<GateStage, number>> = { FOUNDATION: 4, FAMILIAR: 6, RETAINED: 8, FLUENT: 10, MASTERED: 12 };
/**
 * The stage names (Names): shown inside the milestone name ("Milestone 2 ·
 * Familiar (level 6)"). Disjoint from every app ladder, from "Recall" (an
 * attribute) and from "Working knowledge" (an intake word); "Mastered" means
 * level 12 only (roadmap-contract-check).
 */
export const STAGE_NAMES: Readonly<Record<GateStage, string>> = {
  FOUNDATION: "Foundation",
  FAMILIAR: "Familiar",
  RETAINED: "Retained",
  FLUENT: "Fluent",
  MASTERED: "Mastered",
};
/** A track plan's stages: volume shares of the planned practice to the date. */
export type TrackStage = "STAGE_1" | "STAGE_2" | "STAGE_3" | "STAGE_4" | "STAGE_5";
export const TRACK_STAGE_KEYS: readonly TrackStage[] = ["STAGE_1", "STAGE_2", "STAGE_3", "STAGE_4", "STAGE_5"];
export const TRACK_STAGE_SHARES: readonly number[] = [0.2, 0.4, 0.6, 0.8, 1.0];
/**
 * RoadmapMilestone.stage (null on rows made before revision 4):
 *   a gate stage; BETWEEN, an intermediate gate at the odd level between two
 *   gates (L5, L7, L9, L11; it keeps your rank); PART, the count gate in a
 *   long first window ("Familiar, part 1"; it gives its stage's rank, and the
 *   stage then keeps it); or a track stage STAGE_1..STAGE_5.
 */
export type StageKey = GateStage | "BETWEEN" | "PART" | TrackStage;
/** Every stored value of RoadmapMilestone.stage. */
export const STAGE_VALUES: readonly StageKey[] = [...STAGE_KEYS, "BETWEEN", "PART", ...TRACK_STAGE_KEYS];
/** The first rank comes within about this many days (decision 54): a first window longer than it gets a count gate. = MILESTONE_TARGET_DAYS. */
export const FIRST_RANK_MAX_DAYS = MILESTONE_TARGET_DAYS;
/** STAGE_PRACTICE_BAND_MIN: the allocation never steps a practice below these bands in these stages (F-R4-13). */
export const STAGE_PRACTICE_BAND_MIN: Readonly<Partial<Record<GateStage, PracticeBand>>> = { RETAINED: "D30", FLUENT: "D45", MASTERED: "D45" };

export function isStageKey(v: unknown): v is StageKey {
  return typeof v === "string" && (STAGE_VALUES as readonly string[]).includes(v);
}

/** The gate stage at exactly `level` (4, 6, 8, 10, 12); null for any other level. */
export function stageOfLevel(level: number): GateStage | null {
  return STAGE_KEYS.find((s) => STAGE_LEVEL[s] === level) ?? null;
}

/** The response schema's SLOTS for a depth (FOUNDATION … the depth's key), in order. */
export function gateStagesTo(depth: AimDepth): GateStage[] {
  return STAGE_KEYS.filter((s) => STAGE_LEVEL[s] <= depth);
}

/**
 * The stage's words for a milestone (code copy; {stage} in the title
 * templates): a gate's name; BETWEEN at odd level L → "Toward <the gate at
 * L + 1>"; PART at level L → "<the gate at L>, part 1". A track stage, an
 * unknown level or a missing one gives null (a track plan reads "Milestone 2").
 */
export function stageLabelOf(stage: StageKey | string | null | undefined, level?: number | null): string | null {
  if (!stage) return null;
  if ((STAGE_KEYS as readonly string[]).includes(stage)) return STAGE_NAMES[stage as GateStage];
  if (stage === "BETWEEN" && typeof level === "number") {
    const above = stageOfLevel(level + 1);
    return above ? `Toward ${STAGE_NAMES[above]}` : null;
  }
  if (stage === "PART" && typeof level === "number") {
    const gate = stageOfLevel(level);
    return gate ? `${STAGE_NAMES[gate]}, part 1` : null;
  }
  return null;
}

/** The rank each gate stage gives when reached inside the plan (decision 40): Aspirant … Virtuoso. */
export const STAGE_RANK: Readonly<Record<GateStage, number>> = { FOUNDATION: 1, FAMILIAR: 2, RETAINED: 3, FLUENT: 4, MASTERED: 5 };
/** A track plan can give Paragon only with a standard, ≥ PARAGON_MIN_MILESTONES kept stages and a span of at least this. */
export const TRACK_PARAGON_MIN_DAYS = 180;

/**
 * A depth plan's milestone rankIndex (F-R4-12; R1's assignRankIndices calls
 * it): a gate stage gives STAGE_RANK; BETWEEN at odd level L takes the rank
 * of the gate below (L − 1: "keeps your rank"); PART at level L (the gate it
 * counts toward) takes that gate's rank, and the gate itself then keeps it
 * (the gate's own index equals it). null for a track stage (a track plan
 * ranks its k-th kept stage k: rankIndexAt), and for a BETWEEN or PART
 * without its level. Held rows still get their index (for display: "Held
 * when you began · Specialist level"), but give no rank (aimRankOf).
 *
 * Fix round (contracts §15.4; decision 40 "Mastered gives Virtuoso", stage
 * rank = verified depth): a PART counting toward the depth's own gate — L* =
 * `depth`, or 12 when the depth isn't passed (a PART at 12 is always at the
 * depth) — gives the rank of the gate two levels below (Fluent's Expert under
 * Mastered, Retained's Specialist under Fluent, Familiar's Journeyman under
 * Retained): its target is n − 1 cards or fewer counted on `r` (retry entries
 * included), so it must never give the depth's rank before the depth is held.
 * The depth's gate then gives its own rank. Callers on a depth-10 or depth-8
 * plan pass the depth (R1's assignRankIndices, R4's rankIndicesOf, R2's
 * motivationTimelineOf); a PART below the depth is unchanged.
 */
export function rankIndexForStage(stage: StageKey | string | null | undefined, gateLevel?: number | null, depth?: number | null): number | null {
  if (!stage) return null;
  if ((STAGE_KEYS as readonly string[]).includes(stage)) return STAGE_RANK[stage as GateStage];
  if (stage === "BETWEEN" && typeof gateLevel === "number") {
    const below = stageOfLevel(gateLevel - 1);
    return below ? STAGE_RANK[below] : null;
  }
  if (stage === "PART" && typeof gateLevel === "number") {
    const gate = stageOfLevel(gateLevel);
    if (!gate) return null;
    const atDepth = gateLevel >= (typeof depth === "number" && Number.isFinite(depth) ? depth : STAGE_LEVEL.MASTERED);
    if (!atDepth) return STAGE_RANK[gate];
    const below = stageOfLevel(gateLevel - 2);
    return below ? STAGE_RANK[below] : null;
  }
  return null;
}

/** topRankIndexOfDepth's input (F-R4-12). */
export interface DepthRankInput {
  /**
   * Roadmap.depth; null on a track Area or a legacy plan. Revision 5 (contracts
   * §22.1 ruling 51): widened to TopicDepth, since a TOPICS plan may sit at 6
   * (its top is STAGE_RANK FAMILIAR, through stageOfLevel); a LEVELS plan only
   * ever passes an AimDepth, so nothing a LEVELS reader sees changes.
   */
  depth: TopicDepth | null;
  /** A track Area (practice only). */
  track: boolean;
  /** The plan has an outside standard: a checkpoint with the user's bar and outOf on the final milestone, or EXAM_DAY (question 7). */
  hasStandard: boolean;
  /** A track plan's kept stages (after the merges); a legacy plan's most scheduled positions (maxScheduledPositionsOf). */
  keptStages: number;
  /** A track plan's span in days (the start to the aim's date). */
  spanDays: number;
  /** Any Domain's coverage stands below the app's policy (a coverage choice, decision 53). */
  coverageBelowPolicy: boolean;
  /** A production practice is planned in every stage from Fluent on (F-R4-13). */
  productionPlannedFromFluent: boolean;
  /** Revision 5 (contracts §22.12; lane 7): TOPICS reads Paragon off the specialisation and the base topics. Absent: LEVELS. */
  planKind?: PlanKind;
}

/**
 * The top rank a plan can give (F-R4-12), pure:
 *   a card plan: Paragon (6) needs depth 12, a standard, no Domain below the
 *     coverage policy and production practice planned from Fluent on;
 *     otherwise the final stage's rank (Mastered → Virtuoso 5, Fluent →
 *     Expert 4, Retained → Specialist 3);
 *   a track plan: Paragon needs a standard, ≥ PARAGON_MIN_MILESTONES kept
 *     stages and ≥ TRACK_PARAGON_MIN_DAYS of span; otherwise the last kept
 *     stage's place-rank, at most Virtuoso (Initiate with none);
 *   a legacy plan (depth null, not a track): rev 3's rule, topRankIndexOf(keptStages).
 * The roadmap view shows it as "Top rank on this plan: Virtuoso — Paragon
 * needs a standard you set" (paragonMissingOf names the missing condition).
 */
export function topRankIndexOfDepth(input: DepthRankInput): number {
  if (input.track) {
    const kept = Math.max(0, Math.floor(input.keptStages));
    if (input.hasStandard && kept >= PARAGON_MIN_MILESTONES && input.spanDays >= TRACK_PARAGON_MIN_DAYS) return RANK_TOP;
    return Math.min(kept, RANK_MILESTONE_MAX);
  }
  if (input.depth == null) return topRankIndexOf(input.keptStages);
  // ── Revision 5, lane 7 (contracts §22.12): Paragon on TOPICS needs the specialisation at 12, the base topics at 8 (both by
  // construction at depth 12), your standard and coverage at policy; otherwise STAGE_RANK of L* (6 → Journeyman), below. ──
  if (input.planKind === "TOPICS" && input.depth === 12 && input.hasStandard && !input.coverageBelowPolicy) return RANK_TOP;
  if (input.depth === 12 && input.hasStandard && !input.coverageBelowPolicy && input.productionPlannedFromFluent) return RANK_TOP;
  const final = stageOfLevel(input.depth);
  return final ? STAGE_RANK[final] : 0;
}

/** Why a plan's top rank is not Paragon, first missing condition first (the copy names it); [] when Paragon is open. */
export type ParagonMissing = "DEPTH" | "STANDARD" | "COVERAGE" | "PRODUCTION" | "STAGES" | "SPAN";
export function paragonMissingOf(input: DepthRankInput): ParagonMissing[] {
  const out: ParagonMissing[] = [];
  if (input.track) {
    if (!input.hasStandard) out.push("STANDARD");
    if (input.keptStages < PARAGON_MIN_MILESTONES) out.push("STAGES");
    if (input.spanDays < TRACK_PARAGON_MIN_DAYS) out.push("SPAN");
    return out;
  }
  if (input.depth == null) return input.keptStages >= PARAGON_MIN_MILESTONES ? [] : ["STAGES"];
  if (input.depth !== 12) out.push("DEPTH");
  if (!input.hasStandard) out.push("STANDARD");
  if (input.coverageBelowPolicy) out.push("COVERAGE");
  // Revision 5, lane 7 (contracts §22.12): a TOPICS plan's Paragon asks no production practice.
  if (!input.productionPlannedFromFluent && input.planKind !== "TOPICS") out.push("PRODUCTION");
  return out;
}

// ═══ Revision 4: dates (F-R4-11; decision 37) ═══════════════════════════════

/** Roadmap.dateMode. REALISTIC (a Field Area's default) exists only on a DRAFT; acceptCore writes CHOSEN, and dateOrigin keeps who set the date. */
export type DateMode = "REALISTIC" | "CHOSEN";
export const DATE_MODES: readonly DateMode[] = ["REALISTIC", "CHOSEN"];
/** The verdict on the user's date: REALISTIC mode is FITS by construction; IMPOSSIBLE refuses accept for that depth and date. */
export type DateVerdict = "FITS" | "TIGHT" | "OVER" | "IMPOSSIBLE";
export const DATE_VERDICTS: readonly DateVerdict[] = ["FITS", "TIGHT", "OVER", "IMPOSSIBLE"];
/** An Over date may ask up to this many times the usual writing pace (and D_best_2x is the best case at it). */
export const OVER_PACE_FACTOR = 2;
/** The schedule-bound line shows when D_real minus the last writing day ≥ this share of floorBase(L*). */
export const SCHEDULE_BOUND_SHARE = 0.9;
/**
 * Intensity is the pace share (decision 39): Light, Steady and Push count on
 * 50%, 70% and 90% of the usual writing pace. An alias of INTENSITY, so the
 * values are unchanged. It moves dates, never the depth.
 */
export const PACE_SHARE: Readonly<Record<Intensity, number>> = INTENSITY;

// ═══ Revision 4: the reach model (F-R4-8; decision 38) ══════════════════════
//
// Expected reach follows srs.ts and the degrade cron. A miss below the strike
// limit costs a day; two misses in a row (STRIKE_LIMIT + the loadout's extra
// strikes) cost a level; a card overdue past its grace (graceDays(ℓ) + the
// GRACE_EXTENSION days) loses a level. A due review is done on its day when
// the day is "on": days are on or off as a two-state chain with stationary
// on-share c (the measured clearance) and off-persistence ρ, so missed days
// bunch together as they really do. Reviews at level ≥ LONG_GAP_LEVEL (gaps of
// 50 days and more) use the long-gap pass rate pLong = min(p, P_LONG_CAP), the
// app's policy until a per-level rate can be measured (Deferred). p^k is
// only the zero-slack case at c = 1.

/** Stored in every StartSnapshot and acceptance feasibility (version 1 was rev 3's p^k). */
export const REACH_MODEL_VERSION: number = 2;
/** The table is memoised per (p, pLong, c, ρ, m, strike limit, grace extra), each rounded to its step. */
export const REACH_P_STEP = 0.005;
export const REACH_C_STEP = 0.01;
export const REACH_RHO_STEP = 0.05;
/** The longest time the table covers (days); a longer window reads as this. = SPAN_MAX_DAYS. */
export const REACH_T_MAX = SPAN_MAX_DAYS;
/** Calibrating priors (policy, labelled where used; never 1): the pass rate until PASS_SHARE_MIN_REVIEWS are measured … */
export const P_PRIOR = 0.8;
/** … the clearance until CLEARANCE_WINDOW_DAYS of DAY_OPEN rows exist … */
export const C_PRIOR = 0.85;
/** … and the off-day persistence ρ until RHO_MIN_DAYS of the clearance series are measured. */
export const RHO_PRIOR = 0.6;
/** Reviews at this level and above follow a gap of 50 days or more (interval(9) = 50): they use pLong. */
export const LONG_GAP_LEVEL = 9;
/** pLong = min(p, P_LONG_CAP): "the app's policy for 50–110-day gaps: none of your reviews has tested that yet". */
export const P_LONG_CAP = 0.8;
/** ρ is measured over this many life days of the clearance series (R2, throughput-server). */
export const CLEARANCE_SERIES_DAYS = 90;
/** An "off" day in the clearance series clears under this share of its due queue. */
export const OFF_DAY_CLEAR_SHARE = 0.5;
/** ρ reads calibrating (RHO_PRIOR) while fewer than this many days of the series are measured. */
export const RHO_MIN_DAYS = 28;
/** srs.ts STRIKE_LIMIT, mirrored (roadmap-contract-check greps srs.ts for it): the misses in a row that cost a level. */
export const REACH_STRIKE_LIMIT = 2;

/**
 * The reach model's inputs. p, the pass rate; pLong, the pass rate used for
 * reviews at level ≥ LONG_GAP_LEVEL (never above p); c, the clearance (the
 * chain's stationary on-share); rho, P(off tomorrow | off today); m, the
 * interval multiplier; strikeLimit, STRIKE_LIMIT plus the loadout's
 * extraStrikes; graceExtra, the GRACE_EXTENSION days.
 */
export interface ReachParams {
  p: number;
  pLong: number;
  c: number;
  rho: number;
  m: number;
  strikeLimit: number;
  graceExtra: number;
}

/** Which inputs the date assumed (DateOrigin.calibrating): the priors stood in for p, c, ρ; 'pace' is a typed rate the app hasn't measured. */
export type CalibratingInput = "p" | "c" | "rho" | "pace";
export const CALIBRATING_INPUTS: readonly CalibratingInput[] = ["p", "c", "rho", "pace"];

/**
 * The reach inputs from the throughput figures (F-R4-8): p from passShare
 * (P_PRIOR while calibrating), pLong = min(p, P_LONG_CAP), c from clearance
 * (C_PRIOR while calibrating), ρ from absencePersistence (RHO_PRIOR while
 * calibrating or absent), with what was assumed. Never p = 1 or c = 1 while
 * calibrating: the best case is its own line (bestCaseParams).
 */
export function reachInputsOf(
  t: { passShare: ShareFigure; clearance: ShareFigure; absencePersistence?: ShareFigure | null },
  m: number,
  opts: { extraStrikes?: number; graceExtraDays?: number } = {}
): { params: ReachParams; calibrating: CalibratingInput[] } {
  const calibrating: CalibratingInput[] = [];
  const share = (f: ShareFigure | null | undefined, prior: number, key: CalibratingInput): number => {
    if (f && f.kind === "measured" && Number.isFinite(f.value)) return Math.min(1, Math.max(0, f.value));
    calibrating.push(key);
    return prior;
  };
  const p = share(t.passShare, P_PRIOR, "p");
  const c = share(t.clearance, C_PRIOR, "c");
  const rho = share(t.absencePersistence, RHO_PRIOR, "rho");
  return {
    params: { p, pLong: Math.min(p, P_LONG_CAP), c, rho, m, strikeLimit: REACH_STRIKE_LIMIT + Math.max(0, Math.floor(opts.extraStrikes ?? 0)), graceExtra: Math.max(0, Math.floor(opts.graceExtraDays ?? 0)) },
    calibrating,
  };
}

/** The best case (p = pLong = c = 1): "earliest if every review passes", always its own secondary line, never the date. */
export function bestCaseParams(m: number, strikeLimit = REACH_STRIKE_LIMIT, graceExtra = 0): ReachParams {
  return { p: 1, pLong: 1, c: 1, rho: 0, m, strikeLimit, graceExtra };
}

/** Options for a reach query. cleanAt = L* (the depth terms only): a card entering L* on a next-day retry counts only after its next pass. */
export interface ReachOpts {
  cleanAt?: number | null;
}

/** A reach table: reachProb for one set of (rounded) parameters. */
export interface ReachTable {
  /** The parameters the table was built with, after rounding and clamping. */
  readonly params: Readonly<ReachParams>;
  /**
   * The probability that a card due today at `level`, with no strike, reaches
   * L within Σ_{l=level+1..L−1} interval(l, m) + slackDays (a day off at the
   * start drawn from the chain's stationary on-share). 1 when level ≥ L; 0
   * for a negative slack; windows past REACH_T_MAX read as REACH_T_MAX.
   */
  reachProb(level: number, L: number, slackDays: number, opts?: ReachOpts): number;
}

const roundTo = (x: number, step: number): number => Number((Math.round(x / step) * step).toFixed(6));

/** Rounds and clamps the parameters as the table is built (and memoised) with them. */
export function reachParamsKey(params: ReachParams): ReachParams {
  const p = Math.min(1, Math.max(0, roundTo(params.p, REACH_P_STEP)));
  const c = Math.min(1, Math.max(REACH_C_STEP, roundTo(params.c, REACH_C_STEP)));
  // pLong is never above p (rounding to the coarser step must not lift it).
  const pLong = Math.min(p, Math.max(0, roundTo(params.pLong, REACH_C_STEP)));
  let rho = Math.min(1, Math.max(0, roundTo(params.rho, REACH_RHO_STEP)));
  // A chain with on-share c needs P(off tomorrow | on today) = (1 − c)(1 − ρ) ÷ c ≤ 1: below c = 0.5 that bounds ρ from below.
  if (c < 1 && c < 0.5) rho = Math.max(rho, Number(((1 - 2 * c) / (1 - c)).toFixed(6)));
  const m = Number.isFinite(params.m) && params.m > 0 ? Number(params.m.toFixed(6)) : 1;
  const strikeLimit = Math.max(1, Math.floor(params.strikeLimit));
  const graceExtra = Math.max(0, Math.floor(params.graceExtra));
  return { p, pLong, c, rho, m, strikeLimit, graceExtra };
}

/** One target level's entry values E[t][ℓ][z] = W(t, ℓ, s = 0, o = 0, today on/off), t = 0..REACH_T_MAX. */
interface ReachLayer {
  /** Levels 1..L − 1. */
  levels: number;
  entry: Float64Array;
}

const REACH_MEMO = new Map<string, Map<string, ReachLayer>>();

/**
 * The dynamic program, exact over (days left t, level ℓ, strikes s, days
 * overdue o, today on/off), mirroring srs.ts and the degrade cron:
 *   on day, the due review is done:
 *     pass (p, or pLong when ℓ ≥ LONG_GAP_LEVEL) → ℓ + 1: 1 when ℓ + 1 ≥ L
 *       (with cleanAt = L and s > 0 — a retry entry — the value is instead
 *       the chance of the next pass at L within the time left); else wait
 *       interval(ℓ + 1, m) days, s = 0, o = 0;
 *     miss with s + 1 < strikeLimit → retry tomorrow with s + 1 (srs.ts keeps
 *       graceEndsAt, so o + 1; past grace the cron degrades it);
 *     any other miss → max(1, ℓ − 1), due tomorrow, s = 0, o = 0;
 *   off day, the review waits a day: o + 1 > graceDays(ℓ) + graceExtra
 *     degrades it (max(1, ℓ − 1), due tomorrow, s = 0, o = 0), else o + 1;
 *   t < 0 gives 0, ℓ ≥ L gives 1. Levels 5–8 use their base interval (the
 *   jitter's mean). Days: P(off tomorrow | on) = (1 − c)(1 − ρ) ÷ c,
 *   P(off tomorrow | off) = ρ; a wait of k days uses the k-step chain.
 */
function buildReachLayer(params: ReachParams, L: number, clean: ReachLayer | null): ReachLayer {
  const { p, pLong, c, rho, m, strikeLimit: S, graceExtra } = params;
  const T = REACH_T_MAX;
  const a = c >= 1 ? 0 : ((1 - c) * (1 - rho)) / c;
  const lam = rho - a;
  const pow = (k: number) => Math.pow(lam, k);
  const onAfter = (fromOn: boolean, k: number): number => (c >= 1 ? 1 : fromOn ? c + (1 - c) * pow(k) : c - c * pow(k));
  const nL = L - 1;
  const O = Math.max(1, L - 2 + graceExtra + 1);
  const size = nL * S * O * 2;
  const at = (l: number, s: number, o: number, z: number) => (((l - 1) * S + s) * O + o) * 2 + z;
  let prev = new Float64Array(size);
  let cur = new Float64Array(size);
  const entry = new Float64Array((T + 1) * nL * 2);
  const eAt = (t: number, l: number, z: number) => (t * nL + (l - 1)) * 2 + z;
  const on1 = onAfter(true, 1);
  const off1 = onAfter(false, 1);
  // Per level: the wait after a pass into ℓ + 1 and its chain probability.
  const waitK: number[] = [];
  const waitOn: number[] = [];
  for (let l = 1; l <= nL; l++) {
    const k = Math.max(1, interval(l + 1, m));
    waitK[l] = k;
    waitOn[l] = onAfter(true, k);
  }
  const cleanK = Math.max(1, interval(L, m));
  const cleanOn = onAfter(true, cleanK);
  const next = (l: number, s: number, o: number, pon: number) => pon * prev[at(l, s, o, 1)] + (1 - pon) * prev[at(l, s, o, 0)];
  for (let t = 0; t <= T; t++) {
    const canWait = t >= 1;
    for (let l = 1; l <= nL; l++) {
      const G = Math.max(0, l - 1) + graceExtra;
      const q = l >= LONG_GAP_LEVEL ? pLong : p;
      const down = Math.max(1, l - 1);
      // The pass value depends only on t and ℓ (and s for a retry entry).
      let passFirst: number;
      let passRetry: number;
      if (l + 1 >= L) {
        passFirst = 1;
        if (clean) {
          const t2 = t - cleanK;
          passRetry = t2 < 0 ? 0 : cleanOn * clean.entry[(t2 * clean.levels + (L - 1)) * 2 + 1] + (1 - cleanOn) * clean.entry[(t2 * clean.levels + (L - 1)) * 2];
        } else passRetry = 1;
      } else {
        const t2 = t - waitK[l];
        const won = waitOn[l];
        passFirst = t2 < 0 ? 0 : won * entry[eAt(t2, l + 1, 1)] + (1 - won) * entry[eAt(t2, l + 1, 0)];
        passRetry = passFirst;
      }
      const degradeOn = canWait ? next(down, 0, 0, on1) : 0;
      const degradeOff = canWait ? next(down, 0, 0, off1) : 0;
      for (let s = 0; s < S; s++) {
        const vPass = s > 0 ? passRetry : passFirst;
        for (let o = 0; o <= G; o++) {
          let vMiss: number;
          if (s + 1 < S) vMiss = o + 1 > G ? degradeOn : canWait ? next(l, s + 1, o + 1, on1) : 0;
          else vMiss = degradeOn;
          cur[at(l, s, o, 1)] = q * vPass + (1 - q) * vMiss;
          cur[at(l, s, o, 0)] = o + 1 > G ? degradeOff : canWait ? next(l, s, o + 1, off1) : 0;
        }
      }
      entry[eAt(t, l, 1)] = cur[at(l, 0, 0, 1)];
      entry[eAt(t, l, 0)] = cur[at(l, 0, 0, 0)];
    }
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return { levels: nL, entry };
}

/**
 * The reach table for one set of parameters (F-R4-8), implemented in full
 * and shared by R1 (projectCards, BEHIND), R2 (stage dating, the date check,
 * the StartSnapshot) and R6 (RAISE's expected reach). Deterministic; built
 * lazily per target level and memoised per rounded parameters. At zero slack,
 * c = 1, pLong = p and no cleanAt it equals rev 3's p^k (existingExpected).
 */
export function reachTable(params: ReachParams): ReachTable {
  const key = reachParamsKey(params);
  const memoKey = JSON.stringify(key);
  let layers = REACH_MEMO.get(memoKey);
  if (!layers) {
    layers = new Map();
    REACH_MEMO.set(memoKey, layers);
  }
  const store = layers;
  const layerOf = (L: number, cleanAt: boolean): ReachLayer => {
    const id = `${L}${cleanAt ? "c" : ""}`;
    const hit = store.get(id);
    if (hit) return hit;
    const built = buildReachLayer(key, L, cleanAt ? layerOf(L + 1, false) : null);
    store.set(id, built);
    return built;
  };
  return {
    params: key,
    reachProb(level: number, L: number, slackDays: number, opts?: ReachOpts): number {
      const lv = Math.floor(level);
      const target = Math.floor(L);
      if (lv >= target) return 1;
      if (!Number.isFinite(slackDays) || slackDays < 0) return 0;
      const from = Math.max(1, lv);
      let need = 0;
      for (let l = from + 1; l <= target - 1; l++) need += interval(l, key.m);
      const t = Math.min(REACH_T_MAX, need + Math.floor(slackDays));
      const layer = layerOf(target, opts?.cleanAt === target);
      const i = (t * layer.levels + (from - 1)) * 2;
      return key.c * layer.entry[i + 1] + (1 - key.c) * layer.entry[i];
    },
  };
}

/** reachTable(params).reachProb(…): the one-off form. */
export function reachProb(params: ReachParams, level: number, L: number, slackDays: number, opts?: ReachOpts): number {
  return reachTable(params).reachProb(level, L, slackDays, opts);
}

/** An existing card as the reach sums read it: its effective state, and whether it entered its level on a next-day retry (the readings' clean-entry read). */
export interface ReachCard extends EffectiveCard {
  retryEntry?: boolean;
}

/**
 * existingExpectedSlack(cards, L, d) = (cards counted at ≥ L) + Σ over the
 * other cards of reachProb(ℓ_eff, L, d − bestReach_c(L)) — a negative slack
 * counts 0 (F-R4-8). With cleanAt = L, a card at exactly L on a retry entry
 * is "an other card" needing one more pass: reachProb(L, L + 1, d − its due
 * day). Its current strike is treated as none (reads slightly high).
 */
export function existingExpectedSlack(cards: readonly ReachCard[], L: number, d: DayKey, params: ReachParams, opts?: ReachOpts): number {
  const table = reachTable(params);
  const m = table.params.m;
  const clean = opts?.cleanAt === L;
  let sum = 0;
  for (const card of cards) {
    if (card.level >= L) {
      if (clean && card.level === L && card.retryEntry) sum += table.reachProb(L, L + 1, daysBetween(card.dueDay, d));
      else sum += 1;
      continue;
    }
    const slack = daysBetween(bestReach(card, L, m), d);
    if (slack >= 0) sum += table.reachProb(card.level, L, slack, opts);
  }
  return sum;
}

/** One day's writing: a DayKey is one card that day; {day, count} writes `count` (fractional allowed) that day. */
export type WriteDay = DayKey | { day: DayKey; count: number };

/** newExpectedSlack(writeDays, L, d) = Σ over the writing days w of reachProb(1, L, d − w − floorBase(L, m)): a card written on day w is level 1 and due at once. */
export function newExpectedSlack(writeDays: readonly WriteDay[], L: number, d: DayKey, params: ReachParams, opts?: ReachOpts): number {
  const table = reachTable(params);
  const fb = floorBase(L, table.params.m);
  let sum = 0;
  for (const w of writeDays) {
    const day = typeof w === "string" ? w : w.day;
    const count = typeof w === "string" ? 1 : w.count;
    if (!(count > 0)) continue;
    const slack = daysBetween(day, d) - fb;
    if (slack >= 0) sum += count * table.reachProb(1, L, slack, opts);
  }
  return sum;
}

/**
 * The reference writing plan (the worked examples' and the goldens'; R2's
 * plan reduces to it with no held day and no capacity cap): the rate is
 * split over the Domains still short in proportion to their new_d, r_d =
 * ratePerWeek × new_d ÷ Σ new; card k (0-based) of Domain d is written on day
 * floor(k × 7 ÷ r_d) from today. Domains needing none write nothing; a rate
 * ≤ 0 writes nothing.
 */
export function referenceWriteDaysOf(newByDomain: Readonly<Record<string, number>>, ratePerWeek: number, today: DayKey): Record<string, DayKey[]> {
  const total = Object.values(newByDomain).reduce((s, n) => s + Math.max(0, Math.floor(n)), 0);
  const out: Record<string, DayKey[]> = {};
  for (const [id, raw] of Object.entries(newByDomain)) {
    const n = Math.max(0, Math.floor(raw));
    out[id] = [];
    if (n === 0 || total === 0 || !(ratePerWeek > 0)) continue;
    const rd = (ratePerWeek * n) / total;
    for (let k = 0; k < n; k++) out[id].push(addDays(today, Math.floor((k * 7) / rd)));
  }
  return out;
}

/** One required Domain as stage dating reads it: its count n_d, its existing recall cards (effective states) and its writing days. */
export interface StageDomainInput {
  n: number;
  cards: readonly ReachCard[];
  writeDays: readonly WriteDay[];
}

/**
 * stageDay(ℓ) (F-R4-10): the first day d ≥ today on which, for every Domain,
 * existingExpectedSlack + newExpectedSlack ≥ n_d. Expected counts are
 * monotone in d, so a binary search; null when it isn't met by today +
 * REACH_T_MAX. The final gate is dated with cleanAt = L*; the lower gates without it.
 */
export function stageDayOf(domains: readonly StageDomainInput[], L: number, today: DayKey, params: ReachParams, opts?: ReachOpts): DayKey | null {
  const meets = (k: number): boolean => {
    const d = addDays(today, k);
    return domains.every((dom) => existingExpectedSlack(dom.cards, L, d, params, opts) + newExpectedSlack(dom.writeDays, L, d, params, opts) >= dom.n - 1e-9);
  };
  if (!meets(REACH_T_MAX)) return null;
  let lo = 0;
  let hi = REACH_T_MAX;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (meets(mid)) hi = mid;
    else lo = mid + 1;
  }
  return addDays(today, lo);
}

// ═══ Revision 4: the REVIEW ledger tag (F-R4-8) ═════════════════════════════

/** What srs.ts writes as a REVIEW row's outcome word (and the backfill's). */
export type ReviewOutcomeWord = "advanced" | "strike" | "degraded" | "shielded" | "backfill";

/** A REVIEW row's detail, read: the outcome, the mastery mark, and the level tag when the row has one (rows written since revision 4). */
export interface ReviewDetail {
  outcome: ReviewOutcomeWord | null;
  mastered: boolean;
  /** The level the review was taken at ("L11"); null on an untagged (older) row. */
  from: number | null;
  /** A pass's new level ("→12"); null on a miss or an untagged row. */
  to: number | null;
}

/**
 * Reads srs.ts's REVIEW detail. Since revision 4 the level is appended at the
 * end, so every prefix reader still matches: "advanced · L11→12",
 * "advanced · mastered · L11→12", "strike · L11" (and "degraded · L11",
 * "shielded · L11"). Older rows ("advanced", "strike", "backfill: passed
 * review") read the same with no level. Readers match by prefix, never ===.
 */
export function parseReviewDetail(detail: string | null | undefined): ReviewDetail {
  const d = (detail ?? "").trim().toLowerCase();
  const outcome: ReviewOutcomeWord | null = d.startsWith("advanced")
    ? "advanced"
    : d.startsWith("strike")
      ? "strike"
      : d.startsWith("degraded")
        ? "degraded"
        : d.startsWith("shielded")
          ? "shielded"
          : d.startsWith("backfill")
            ? "backfill"
            : null;
  const tag = /·\s*l(\d{1,2})(?:\s*→\s*(\d{1,2}))?\s*$/.exec(d);
  return {
    outcome,
    mastered: outcome === "advanced" && /·\s*mastered\b/.test(d),
    from: tag ? Number(tag[1]) : null,
    to: tag && tag[2] ? Number(tag[2]) : null,
  };
}

// ═══ Fix round: clean entry, one definition (F-R4-9, F-R4-12, F-R4-14) ══════

/**
 * One REVIEW ledger row of a card, as the clean-entry read takes it. Rows are
 * ordered by `occurredAt` (ISO; R1's ActivityEvent.occurredAt), else `at`
 * (epoch ms; R6's rows), else the life day at 00:00 UTC; ties keep their
 * input order.
 */
export interface ReviewLedgerRow {
  day: DayKey;
  detail: string | null;
  occurredAt?: string | null;
  at?: number | null;
}

const MISS_OUTCOMES: ReadonlySet<ReviewOutcomeWord> = new Set<ReviewOutcomeWord>(["strike", "shielded", "degraded"]);

function ledgerOrderKey(r: ReviewLedgerRow): string {
  if (typeof r.occurredAt === "string" && r.occurredAt) return r.occurredAt;
  if (typeof r.at === "number" && Number.isFinite(r.at)) {
    const t = new Date(r.at);
    if (Number.isFinite(t.getTime())) return t.toISOString();
  }
  return `${r.day}T00:00:00.000Z`;
}

/**
 * Clean entry (decision 36; F-R4-12's read; the fix round's one definition,
 * R1's rule, which the reach DP also follows — R1's readings and R6's RAISE
 * parts both import it): did a card now at exactly `level` enter it on a
 * next-day retry? Its REVIEW rows are read in time order:
 *   - the entering pass is its latest 'advanced…' row; a tagged one must read
 *     "→level" and "L(level − 1)" (a pass that took it elsewhere means it came
 *     back down to `level` since, which is no entry by a retry);
 *   - it is a retry entry when the row just before that pass is a miss —
 *     'strike…' or 'shielded…' (the card stays and retries tomorrow), or
 *     'degraded…' — and either both rows carry the level tag that places them
 *     on this climb (the strike or shield at level − 1, a degrade from
 *     `level` itself), or, on older untagged rows, the miss lies within
 *     RETRY_ENTRY_DAYS life days before the pass.
 * A 'backfill…' row is not a review (backfill-activity.ts recorded passes
 * only) and is skipped. No pass in the rows reads as clean. A retry entry
 * counts as level − 1 for the `rc` terms until its next pass (which moves it
 * above `level`).
 */
export function isRetryEntry(rows: readonly ReviewLedgerRow[], level: number): boolean {
  const sorted = rows
    .map((r, i) => ({ r, i, k: ledgerOrderKey(r), d: parseReviewDetail(r.detail) }))
    .filter((x) => x.d.outcome !== null && x.d.outcome !== "backfill")
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i));
  let at = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].d.outcome === "advanced") {
      at = i;
      break;
    }
  }
  if (at <= 0) return false;
  const pass = sorted[at].d;
  if (pass.to != null && pass.to !== level) return false;
  if (pass.from != null && pass.from !== level - 1) return false;
  const before = sorted[at - 1];
  const miss = before.d;
  if (!miss.outcome || !MISS_OUTCOMES.has(miss.outcome)) return false;
  if (pass.from != null && miss.from != null) return miss.outcome === "degraded" ? miss.from === level : miss.from === level - 1;
  const gap = daysBetween(before.r.day, sorted[at].r.day);
  return gap >= 0 && gap <= RETRY_ENTRY_DAYS;
}

/**
 * How far back the clean-entry read looks for a card at exactly `level`
 * (fix round 2, contracts §16.1: the window must hold both the entering pass
 * and the miss just before it, or isRetryEntry finds no row before the pass
 * and reads a retry entry as clean, which inflates every `rc` count):
 *   - the card has sat at `level` since its entering pass: at most its
 *     interval — the jitter's upper bound at levels 5–8,
 *     ceil(BASE × JITTER_HIGH × m) — plus graceDays(level) + graceExtra
 *     before the degrade, plus 1 for the daily degrade cron's lag (a strike
 *     at `level` moves the due day, never graceEndsAt);
 *   - the miss before the pass lies at most graceDays(level − 1) +
 *     graceExtra + 2 days before it: a degrade from `level` is due the next
 *     day, then has the lower level's grace and the cron's lag (a strike at
 *     level − 1 sits closer); never under RETRY_ENTRY_DAYS, the untagged
 *     rule's own gap.
 * Instants under N days apart lie at most N life days apart, so the sum is a
 * bound in life days. For level 12 at m 1 that is 160 + 11 + 1 + 12 = 184
 * (264 at m 1.5; +2 per grace-extension day). A wider window reads more rows
 * and never changes the answer, since the entering pass is the latest one.
 * Residual: a DEGRADATION_WARD that shields a card past its grace keeps it
 * at its level longer than any fixed window; such a card reads as clean.
 * R1's readings, R6's quests and R4's planContext (CardState.retryEntry)
 * read their REVIEW rows over this window.
 */
export function retryReadDaysOf(level: number, m = 1, graceExtra = 0): number {
  const mm = Math.max(1, Number.isFinite(m) ? m : 1);
  const g = Math.max(0, Math.floor(Number.isFinite(graceExtra) ? graceExtra : 0));
  const jittered = level >= JITTER_LEVEL_MIN && level <= JITTER_LEVEL_MAX;
  const atLevel = jittered ? Math.max(interval(level, mm), Math.ceil(baseIntervalDays(level) * JITTER_HIGH * mm)) : interval(level, mm);
  const sinceEntry = atLevel + graceDays(level) + g + 1;
  const missBefore = Math.max(RETRY_ENTRY_DAYS, graceDays(level - 1) + g + 2);
  return sinceEntry + missBefore;
}

// ═══ Revision 4: legacy plans (F-R4-16) ═════════════════════════════════════

/**
 * A roadmap made before revision 4: depth null on a Field Area, or any
 * milestone row of its current or draft version with stage null. Every
 * revision-4 draft path sets the stage on every row, Field and track alike.
 * A legacy roadmap renders no milestone or item text, cannot start a
 * milestone, and is not measured; "Start again at a depth" replaces it.
 */
export function isLegacyRoadmap(r: { fieldId: string | null; depth: number | null | undefined }, rows: readonly { stage?: string | null }[]): boolean {
  if (r.fieldId != null && r.depth == null) return true;
  return rows.some((x) => x.stage == null);
}

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

/**
 * The closed list of names code writes (origin CODE). Revision 4 adds the
 * stage titles (F-R4-10) and every practice, step and checkpoint template of
 * roadmap-catalog.ts (F-R4-18): Gemini writes no words, so every name in a
 * plan is one of these, the user's own text, or a Domain's name.
 */
export const CODE_TEMPLATES = [
  // Revision 3.
  "Study {domains}",
  "{domains} to level {L}+",
  "Practice for {aim}",
  // Revision 4: milestone titles (F-R4-10).
  "{stage}: {domains} to level {L}+",
  "{stage}, part 1: {domains} to level {L}+",
  "{aim} · stage {k} of {n}",
  // Revision 4: practice types (roadmap-catalog.ts, F-R4-18). "Study {domains}" above is READ_AND_CARD.
  "Recall drills: {domains}",
  "Problem sets: {domains}",
  "Timed practice: {domains}",
  "Slow, focused drills: {domains}",
  "Full run-throughs: {domains}",
  "Listen and repeat: {domains}",
  "Say it aloud: {domains}",
  "Writing practice: {domains}",
  "Explain it in your own words: {domains}",
  "Build something with {domains}",
  "Practise with a teacher or partner: {domains}",
  "Go over your mistakes: {domains}",
  "Slow, focused drills: {aim}",
  "Full run-throughs: {aim}",
  "Practise with a teacher or partner: {aim}",
  "Easy session",
  "Harder session",
  "Longer session",
  "Strength session",
  "Mobility session",
  "Technique session",
  "Set time for: {aim}",
  "Check-in: {aim}",
  "Admin session: {aim}",
  "Plan the week ahead",
  "Keep a log: {aim}",
  // Revision 4: step types.
  "Write an outline of {domains}",
  "Explain {domains} to someone without notes",
  "Finish a small project with {domains}",
  "List what you still can't do in {domains}",
  "Choose your material for {domains}",
  "Set up what you need for {aim}",
  "Book {exam}",
  "Do a full attempt at: {aim}",
  // Revision 4: checkpoint types.
  "Self-test: {domains}",
  "Performance check: {aim}",
  "Mock test: {exam}",
  "Exam: {exam}",
  // Contracts §20.12: one practice that takes turns with another, week about (roadmap-catalog PRACTICE_TURNS), where a
  // stage's room holds one practice and its role needs two (the exam's timed practice in its run-up, a teacher or
  // partner, slow drills, a language exam's skills). The practice's own words first, then the one it alternates with.
  "Recall drills one week, timed practice the next: {domains}",
  "Study one week, timed practice the next: {domains}",
  "Listen and repeat one week, timed practice the next: {domains}",
  "Slow, focused drills one week, timed practice the next: {domains}",
  "Problem sets one week, timed practice the next: {domains}",
  "Explain it in your own words one week, timed practice the next: {domains}",
  "Writing practice one week, timed practice the next: {domains}",
  "Go over your mistakes one week, timed practice the next: {domains}",
  "Say it aloud one week, timed practice the next: {domains}",
  "Build something one week, timed practice the next: {domains}",
  "Full run-throughs one week, timed practice the next: {domains}",
  "Practise with a teacher or partner one week, timed practice the next: {domains}",
  "Say it aloud one week, a teacher or partner the next: {domains}",
  "Full run-throughs one week, a teacher or partner the next: {domains}",
  "Explain it in your own words one week, a teacher or partner the next: {domains}",
  "Writing practice one week, a teacher or partner the next: {domains}",
  "Problem sets one week, a teacher or partner the next: {domains}",
  "Build something one week, a teacher or partner the next: {domains}",
  "Go over your mistakes one week, a teacher or partner the next: {domains}",
  "Recall drills one week, slow, focused drills the next: {domains}",
  "Study one week, slow, focused drills the next: {domains}",
  "Listen and repeat one week, slow, focused drills the next: {domains}",
  "Say it aloud one week, writing practice the next: {domains}",
  "Practise with a teacher or partner one week, writing practice the next: {domains}",
  "Writing practice one week, listen and repeat the next: {domains}",
  "Writing practice one week, study the next: {domains}",
  "Listen and repeat one week, study the next: {domains}",
  // ── Revision 5, lane 8 (contracts §22.1 ruling 22, ruling 60): a TOPICS plan's layer titles. An accepted layer
  // milestone's title names its Domains (domainsShort); a DRAFT's names none (Gemini's names are quarantined until
  // keep), and its paying line counts the layer's topics.
  "{domains} · layer {k} of {n}",
  "Layer {k} of {n}",
  "Layer {k} · {n} topics",
] as const;
export type CodeTemplate = (typeof CODE_TEMPLATES)[number];
export interface CodeFill {
  domains?: readonly DomainName[];
  /** A whole level, 1..20 ({L}). */
  level?: number;
  /** The aim, as the user wrote it ({aim}). */
  aim?: YoursText;
  /** A stage's words ({stage}): a gate's STAGE_NAMES name, or "Toward <gate>" for BETWEEN (stageLabelOf; a PART's ", part 1" is the template's). */
  stage?: string;
  /** The exam's name, as the user wrote it ({exam}: Intake.examLabel). */
  exam?: YoursText;
  /** A track stage's place and the plan's count ({k} of {n}), 1..MAX_MILESTONES. */
  k?: number;
  n?: number;
}

/** "A, B, C or D" (join "or", the week quest labels) or "A, B" (join "comma", code names). */
export function domainsText(names: readonly DomainName[], join: "comma" | "or"): string {
  const list = names.map((n) => String(n));
  if (join === "comma" || list.length < 2) return list.join(", ");
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

const SPELLED_MORE = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * {domains} in a code name (F-R4-10): up to three names joined by ", ";
 * past three, "A, B and two more" — spelled, so a code name holds no digit
 * but its {L}, {k} and {n}.
 */
export function domainsShort(names: readonly DomainName[]): string {
  const list = names.map((n) => String(n));
  if (list.length <= 3) return list.join(", ");
  const more = list.length - 2;
  return `${list.slice(0, 2).join(", ")} and ${SPELLED_MORE[more] ?? "several"} more`;
}

/** The {stage} words a title may hold: a gate's name, or "Toward <gate>" (BETWEEN). */
function isStageWords(s: string): boolean {
  const names = STAGE_KEYS.map((k) => STAGE_NAMES[k]);
  return names.includes(s) || (s.startsWith("Toward ") && names.slice(1).includes(s.slice("Toward ".length)));
}

/**
 * A CodeText from a closed template. Refuses (throws) a template outside
 * CODE_TEMPLATES and a slot left unfilled or ill-filled: "Study Probability,
 * Inference", "Probability, Inference to level 6+", "Practice for Run a
 * sub-50 10K", "Familiar: Probability, Inference to level 6+", "Exam: SOA
 * Exam P", "Run a sub-50 10K · stage 2 of 5". (Called only in
 * roadmap-realism.ts and roadmap-catalog.ts, the places the origin 'CODE' is written.)
 */
export function codeText(template: CodeTemplate, fill: CodeFill = {}): CodeText {
  if (!(CODE_TEMPLATES as readonly string[]).includes(template)) throw new Error(`codeText: not a code template: ${String(template)}`);
  const value = (slot: string): string => {
    switch (slot) {
      case "stage": {
        const s = fill.stage;
        if (!s || !isStageWords(s)) throw new Error(`codeText: {stage} needs a stage name: ${JSON.stringify(s ?? null)}`);
        return s;
      }
      case "domains":
        if (!fill.domains || fill.domains.length === 0) throw new Error("codeText: {domains} needs at least one Domain name");
        return domainsShort(fill.domains);
      case "L": {
        const l = fill.level;
        if (l == null || !Number.isInteger(l) || l < 1 || l > 20) throw new Error("codeText: {L} needs a whole level 1..20");
        return String(l);
      }
      case "k":
      case "n": {
        const v = fill[slot];
        if (v == null || !Number.isInteger(v) || v < 1 || v > MAX_MILESTONES) throw new Error(`codeText: {${slot}} needs a whole number 1..${MAX_MILESTONES}`);
        return String(v);
      }
      case "exam":
        if (!fill.exam || !String(fill.exam).trim()) throw new Error("codeText: {exam} needs the exam's name");
        return String(fill.exam).trim();
      default:
        if (!fill.aim || !String(fill.aim).trim()) throw new Error("codeText: {aim} needs the aim");
        return String(fill.aim).trim();
    }
  };
  // One pass: a filled-in name that itself holds "{L}" or "{aim}" is never filled again.
  // "Layer {k} · {n} topics" counts topics in {n}, not layers (revision 5, lane 8): its layer may exceed its count.
  if (template !== "Layer {k} · {n} topics" && template.includes("{k}") && template.includes("{n}") && fill.k != null && fill.n != null && fill.k > fill.n) throw new Error("codeText: {k} is past {n}");
  return template.replace(/\{(stage|domains|L|k|n|exam|aim)\}/g, (_m, slot: string) => value(slot)) as CodeText;
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

/**
 * The optional last segment of a CARDS_AT_LEVEL key (revision 4, F-R4-9):
 *   'r'  counts recall cards only (every card type but NON_RECALL_TYPES);
 *   'rc' counts recall cards with clean entry at exactly L (a card at exactly
 *        L that entered it on a next-day retry counts after its next pass; a
 *        card at ≥ L + 1 always counts).
 * Every stage measure of a depth plan carries 'r'; the depth terms and the
 * final milestone's card measures carry 'rc'. A key without the segment
 * keeps its rev-3 meaning (every card), so legacy rows and goals read as before.
 */
export type CardSegment = "r" | "rc";
export const CARD_SEGMENTS: readonly CardSegment[] = ["r", "rc"];

/** `CARDS_AT_LEVEL|d:<sorted domainIds joined by ,>|L<n>`, plus `|r` or `|rc` on a depth plan (value identity; no target). */
export function cardsAtLevelKey(domainIds: readonly string[], level: number, segment?: CardSegment | null): string {
  if (!Number.isInteger(level) || level < 1 || level > 20) throw new Error(`cardsAtLevelKey: not a level: ${level}`);
  if (segment != null && !(CARD_SEGMENTS as readonly string[]).includes(segment)) throw new Error(`cardsAtLevelKey: not a segment: ${JSON.stringify(segment)}`);
  return `CARDS_AT_LEVEL|d:${keyIds(domainIds, "cardsAtLevelKey").join(",")}|L${level}${segment ? `|${segment}` : ""}`;
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
  /** `segment` is present only on a key that carries one ('r' or 'rc'); absent, the key counts every card (rev 3). */
  | { kind: "CARDS_AT_LEVEL"; domainIds: string[]; level: number; segment?: CardSegment }
  | { kind: "PRACTICE_KEPT"; templateIds: string[]; from: DayKey }
  | { kind: "PROFICIENCY"; roadmapId: string }
  | { kind: "CHECKPOINT_LOG"; itemLineageId: string; nonce: string };

/**
 * Reads any key the builders above write; null for anything else. Ids come
 * back sorted. The one measure-key parser (roadmap-contract-check greps that
 * no other module parses a key): every reader of a CARDS_AT_LEVEL key goes
 * through here and honours its segment.
 */
export function parseMeasureKey(key: string): ParsedMeasureKey | null {
  if (typeof key !== "string") return null;
  let m = /^CARDS_AT_LEVEL\|d:([A-Za-z0-9_,-]+)\|L(\d{1,2})(?:\|(rc|r))?$/.exec(key);
  if (m) {
    const ids = m[1].split(",");
    const level = Number(m[2]);
    if (ids.some((id) => !KEY_ID.test(id)) || level < 1 || level > 20) return null;
    const parsed: ParsedMeasureKey = { kind: "CARDS_AT_LEVEL", domainIds: [...ids].sort(), level };
    if (m[3]) parsed.segment = m[3] as CardSegment;
    return parsed;
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

/**
 * A plan-born task (fix round, contracts §15.6; decision 50 "No Gemini words
 * reach Today"): a TaskTemplate or goal whose captureKey starts with 'rm:'.
 * No model sizes or explains one: Start never defers life-sizing's
 * applySizing for it (the catalog method already sets its band), and
 * life-sizing refuses one, so no model `rationale` becomes its gradeBasis and
 * reaches the TaskDrawer's "Why". Its basis is code's
 * ("<category> · <band> · <minutes>m").
 */
export function isRoadmapCaptureKey(captureKey: string | null | undefined): boolean {
  return typeof captureKey === "string" && captureKey.startsWith(ROADMAP_CAPTURE_PREFIX);
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

/** The eight columns migration 20261106000000_life_roadmap_rev4 adds (decision 48). */
export const REV4_COLUMNS: readonly string[] = ["depth", "dateMode", "coverage", "suggestAreas", "examDay", "stage", "catalogKey", "aimSuggestions"];

/**
 * Whether a database error says one of revision 4's eight columns does not
 * exist: Prisma's P2022, or Postgres's 42703 (undefined_column), naming one
 * of them (Migration, "Order"). Code can deploy before the migration is
 * applied, so reads that select a new column (loadAimCard, loadAimStep,
 * loadWeekQuests, the settings page) catch it and render as before, with
 * aimSuggestions read as null. Any other column, a missing table, and any
 * other error is not this.
 */
export function isMissingRev4Column(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: unknown; message?: unknown };
  const meta = e.meta && typeof e.meta === "object" ? (e.meta as Record<string, unknown>) : {};
  const text = `${typeof e.message === "string" ? e.message : ""} ${JSON.stringify(meta)}`;
  const missingColumn = e.code === "P2022" || meta.code === "42703" || /\b42703\b/.test(text) || /column \W{0,2}[\w."]*\W{0,2} does not exist/i.test(text);
  if (!missingColumn) return false;
  const named = new RegExp(`(?:^|[^A-Za-z0-9_])(?:(?:Roadmap|RoadmapMilestone|RoadmapItem|LifeSettings)\\W{0,3}\\.\\W{0,3})?(${REV4_COLUMNS.join("|")})(?![A-Za-z0-9_])`);
  return named.test(text);
}

// ═══ Shapes: intake, pack, reply ════════════════════════════════════════════

/** Roadmap.syllabus (YOURS). */
export interface Syllabus {
  lines: string[];
  source: string | null;
  /**
   * Revision 4 (F-R4-9, F-R4-24): each line's Domain, the user's (YOURS),
   * index-aligned with `lines`; null = tied to no Domain. Prefilled by R2's
   * lineDomainDefaultOf (a deterministic match) and changed only by the user
   * (the form, setLineDomainCore). Gemini never sets it. Absent on a rev-3 row.
   */
  lineDomains?: (string | null)[];
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
  // ── Revision 4 (every field optional: a rev-3 intake still reads) ──
  /** Roadmap.depth for a Field Area (12, 10 or 8; the default Mastered); null on a track Area. Refused on a track Area. */
  depth?: AimDepth | null;
  /** Roadmap.coverage: the user's typed figures, {[domainId]: n} in COVER_MIN..COVER_MAX. Below the policy figure it is a coverage choice. */
  coverage?: Record<string, number> | null;
  /** REALISTIC (a Field Area's default: targetDay is provisional on the DRAFT) or CHOSEN (the user's date). */
  dateMode?: DateMode;
  /** "Is there an exam or qualification at the end?" (prefilled by examPrefillOf, editable). true requires examLabel; false sets examLabel and examDay null. */
  exam?: boolean | null;
  /** Roadmap.examDay (YOURS): between tomorrow and SPAN_MAX_DAYS away; a waypoint, never the aim's date, never sent to Gemini. */
  examDay?: DayKey | null;
  /** An empty library's "Name the areas this needs": Domains saveIntakeCore creates in the Area Field inside its transaction (≤ DEPTH_DOMAINS_MAX in R). */
  newDomainNames?: string[];
  /** "Start again at a depth": the legacy ACTIVE roadmap saveIntakeCore archives in the same transaction (F-R4-16). */
  replaces?: string | null;
  /** Roadmap.suggestAreas: read only while ROADMAP_GAPS_LIVE; a stored true is ignored while it is false. */
  suggestAreas?: boolean;
  /**
   * Constraint safety (contracts §19): the user's per-kind answers, "which
   * of these are fine for you" (YOURS). Stored in Roadmap.coverage under
   * ACTIVITY_CONFIRM_KEY (no new column): intakeOf reads it with
   * roadmap-catalog activityConfirmOf, intakeData keeps it with
   * coverageJsonOf. saveIntake never takes it from the form; only R4's
   * setActivityVerdictsCore writes it (answerActivities). Every plan path
   * reads it through allowedKindsFor. Absent or null: nothing answered.
   */
  activities?: ActivityConfirm | null;
  /**
   * The practice family (contracts §20.11): which kind of skill a Field aim
   * trains, so code's practice progression trains it (KNOW: a body of
   * knowledge; LANGUAGE: listening and speaking a language; PERFORM: doing
   * it, as an instrument or sailing; BUILD: making things). The user's
   * answer to the form's question, prefilled by practiceFamilyPrefillOf
   * (YOURS). Stored in Roadmap.coverage under PRACTICE_FAMILY_KEY (no new
   * column: roadmap-catalog practiceFamilyOfCoverage reads it,
   * coverageJsonOf writes it). Absent or null: the prefill over the aim
   * (roadmap-catalog practiceFamilyOf). Read only on a Field Area.
   */
  practiceFamily?: PracticeFamily | null;
  // ── Revision 5 (contracts §22.3; lane 3 fills `label`, lane 8 the rest) ──
  /** Roadmap.planKind: LEVELS (absent: every plan today) or TOPICS (a topic map). */
  planKind?: PlanKind;
  /** A TOPICS intake's depth (6, 8, 10 or 12; ruling 14), stored in Roadmap.depth; `depth` is then null. */
  topicDepth?: TopicDepth | null;
  /** Roadmap.label: the goal's name in the switcher (yours, ≤ GOAL_LABEL_MAX); null: the Area name with the seat glyph. */
  label?: string | null;
}

/** The exam question's prefill (F-R4-24): isCredentialAim over the aim alone (CREDENTIAL_WORDS widened for this). The user's Yes/No wins. */
export function examPrefillOf(aim: string): boolean {
  return isCredentialAim(aim, null);
}

// ── The practice family (contracts §20.11): which progression table a Field aim trains with ──

/**
 * Which kind of skill a Field aim trains (contracts §20.11; the lead's
 * review of the progression: one table for every Field aim never trained
 * speaking, listening or performing):
 *   KNOW      a body of knowledge to understand and use (study → recall →
 *             problems → explaining → applying it); with an exam, problems,
 *             mistakes and timed practice up to the exam. The default.
 *   LANGUAGE  a language to understand and speak (listen and repeat →
 *             recall → saying it aloud and writing → a partner).
 *   PERFORM   something to do or play (study → slow drills → full
 *             run-throughs → a teacher or partner).
 *   BUILD     things to make (study → recall → problems → building).
 * One closed choice: the user's answer (Intake.practiceFamily), prefilled by
 * code's reading of the aim (practiceFamilyPrefillOf). Gemini never sets it.
 */
export type PracticeFamily = "KNOW" | "LANGUAGE" | "PERFORM" | "BUILD";
export const PRACTICE_FAMILIES: readonly PracticeFamily[] = ["KNOW", "LANGUAGE", "PERFORM", "BUILD"];
/** The family with nothing to read (no answer and no cue in the aim). */
export const PRACTICE_FAMILY_DEFAULT: PracticeFamily = "KNOW";

/** A practice family (an exact own value; never a prototype name). */
export function isPracticeFamily(v: unknown): v is PracticeFamily {
  return typeof v === "string" && (PRACTICE_FAMILIES as readonly string[]).includes(v);
}

/** A language aim's words (exams named by their test, the skill words, language names and the few non-English words for "language" and "speak"). */
const FAMILY_LANGUAGE_WORDS: ReadonlySet<string> = new Set([
  "ielts", "toefl", "toeic", "jlpt", "hsk", "topik", "delf", "dalf", "dele", "cefr", "esol", "goethe",
  "speak", "speaking", "spoken", "fluent", "fluency", "fluently", "conversation", "conversational", "pronunciation", "accent",
  "vocabulary", "grammar", "kanji", "hiragana", "katakana", "keigo", "pinyin", "hanzi", "bilingual", "language", "languages",
  "tiếng", "nói", "idioma", "hablar", "parler", "langue", "sprechen", "sprache", "lingua",
]);
/** Language names: a language aim only with no topic word after them ("French history" is not one). */
const FAMILY_LANGUAGE_NAMES: ReadonlySet<string> = new Set([
  "english", "japanese", "chinese", "mandarin", "cantonese", "korean", "spanish", "french", "german", "italian", "portuguese",
  "russian", "arabic", "hindi", "vietnamese", "thai", "dutch", "swedish", "norwegian", "danish", "finnish", "polish", "turkish",
  "greek", "hebrew", "indonesian", "malay", "tagalog", "swahili", "ukrainian", "czech",
]);
const FAMILY_TOPIC_WORDS: ReadonlySet<string> = new Set(["history", "cooking", "cuisine", "food", "culture", "art", "politics", "law", "literature", "wine", "medicine", "revolution"]);
/** Something to do or play (an instrument, singing, dancing, sailing, a speech). */
const FAMILY_PERFORM_WORDS: ReadonlySet<string> = new Set([
  "play", "playing", "perform", "recital", "concert", "gig", "sing", "singing", "song", "songs", "dance", "dancing", "choir",
  "piano", "guitar", "violin", "viola", "cello", "drums", "drum", "ukulele", "flute", "saxophone", "trumpet", "clarinet", "harp", "instrument",
  "abrsm", "sail", "sailing", "dinghy", "surf", "surfing", "ski", "skiing", "juggle", "juggling", "acting", "speech", "speeches",
]);
/** Things to make. Not read on a credential aim (a certificate is a body of knowledge examined). */
const FAMILY_BUILD_WORDS: ReadonlySet<string> = new Set([
  "build", "building", "develop", "app", "apps", "website", "websites", "software", "programming", "coding", "code", "developer",
  "game", "games", "design", "designer", "portfolio", "novel", "robot", "robotics", "prototype", "startup", "woodwork", "furniture",
]);
/** Characters that mark a language name in Japanese or Chinese (日本語, 英語, 汉语). */
const FAMILY_LANGUAGE_CJK = /[語语]/u;

/**
 * The practice family question's prefill (contracts §20.11), code's reading
 * of the user's own aim and exam label (examPrefillOf's pattern: it only
 * prefills, and the user's answer wins). Pure and deterministic; no model.
 *   - "public speaking", a speech: PERFORM;
 *   - a language exam, a language skill word, a word for "language" or
 *     "speak" (English and a few others), 語 or 语, or a language name not
 *     followed by a topic word: LANGUAGE;
 *   - an instrument, singing, dancing, sailing, playing: PERFORM;
 *   - making things (build, app, software, coding …) on an aim that is not
 *     a credential (isCredentialAim): BUILD;
 *   - else KNOW.
 */
export function practiceFamilyPrefillOf(aim: string | null | undefined, examLabel?: string | null): PracticeFamily {
  const text = `${aim ?? ""} ${examLabel ?? ""}`;
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const has = (set: ReadonlySet<string>) => words.some((w) => set.has(w));
  if (/\bpublic\s+speaking\b/i.test(text)) return "PERFORM";
  if (has(FAMILY_LANGUAGE_WORDS) || FAMILY_LANGUAGE_CJK.test(text)) return "LANGUAGE";
  if (words.some((w, i) => FAMILY_LANGUAGE_NAMES.has(w) && !FAMILY_TOPIC_WORDS.has(words[i + 1] ?? ""))) return "LANGUAGE";
  if (has(FAMILY_PERFORM_WORDS)) return "PERFORM";
  if (has(FAMILY_BUILD_WORDS) && !isCredentialAim(aim ?? "", examLabel)) return "BUILD";
  return PRACTICE_FAMILY_DEFAULT;
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

/**
 * The v3 reply the keys-only schema asks for (ROADMAP_PROMPT_VERSION 3,
 * F-R4-17). Every string is a key issued for the run, except `gaps`, which
 * exists only while ROADMAP_GAPS_LIVE and the user's switch are both on.
 * Validation reads the parsed JSON as unknown (integrityOf, then
 * validateKeysOnly) and never trusts this shape.
 *   needs   unchosen D-keys the aim needs (omitted with none listed, or on a track Area)
 *   stages  one entry per slot (FOUNDATION … the depth's key, or STAGE_1..STAGE_5)
 */
export interface DraftReplyV3 {
  needs?: string[];
  stages: Record<string, DraftReplyStage>;
  gaps?: string[];
}

/** One slot of a v3 reply. `lines` are S-keys (no Domain: a line's Domain is the user's); `on` is a D-key. */
export interface DraftReplyStage {
  lines?: string[];
  practices?: { kind: string; on?: string }[];
  steps: { kind: string; on?: string }[];
  checkpoint?: string | null;
}

/**
 * The v4 reply (ROADMAP_PROMPT_VERSION 4; contracts §20): Gemini's part once
 * code owns the practice progression. Keys only, every string an enum value
 * issued for the run, except `gaps` (only while ROADMAP_GAPS_LIVE and the
 * user's switch are both on). Validation reads the parsed JSON as unknown
 * and never trusts this shape.
 *   needs  unchosen D-keys the aim needs (omitted on a track Area or with
 *          none listed): pending DOMAIN items (NOT_CHOSEN), shown as Gemini's
 *          choice; the user confirms them (as v3)
 *   order  the outline's S-keys in the order to learn them, each once
 *          (omitted without an outline): outlineOrderOf resolves it, and code
 *          splits it across the stages in that order (outlineStagesOf)
 *   picks  per slot (FOUNDATION … the depth's key, or STAGE_1..STAGE_5), at
 *          most one kind from that slot's enum (roadmap-catalog
 *          progressionPickEnumsOf: the stage's focus candidates on this
 *          run); a slot left out takes code's default. Everything else in
 *          the stage (the carry, the spaced review, the steps, the
 *          checkpoint) is code's (progressionOf)
 * There is no `stages` object, no practice, step or checkpoint list and no
 * `on`: Gemini places no step and no checkpoint.
 */
export interface DraftReplyV4 {
  needs?: string[];
  order?: string[];
  picks?: Partial<Record<string, string>>;
  gaps?: string[];
}

/** The v4 reply's properties, in the schema's propertyOrdering (a property whose enum would be empty is left out). */
export const REPLY_V4_PROPERTIES = ["needs", "order", "picks", "gaps"] as const;

/** What outlineOrderOf gives: the line indices in learning order (every line once), what was dropped, and the lines Gemini left out (appended in the user's order). */
export interface OutlineOrder {
  order: number[];
  /** Entries of the reply's `order` not used: a value that isn't a string, an unknown or confusable key, a line already listed. */
  dropped: number;
  /** Lines the reply didn't list, appended after its order in the user's own order. */
  appended: number[];
}

/**
 * The outline's order from a v4 reply (contracts §20.5), pure: `order` read
 * as unknown against the run's keymap (S-key → line index; an own-property
 * lookup, exact keys only: no trim, no case-fold, so 'S01', 's1' and
 * '__proto__' never resolve), each line once, in the reply's order; then
 * every line it left out, in the user's order, so no line is ever lost (the
 * v3 "uncovered" lines are gone). A missing or non-array `order` is the
 * user's order with nothing dropped. Indices outside 0..lines-1 never
 * resolve.
 */
export function outlineOrderOf(order: unknown, keymap: Readonly<Record<string, number>> | null | undefined, lines: number): OutlineOrder {
  const n = typeof lines === "number" && Number.isInteger(lines) && lines > 0 ? lines : 0;
  const seen = new Set<number>();
  const out: number[] = [];
  let dropped = 0;
  if (Array.isArray(order)) {
    for (const key of order) {
      const idx = typeof key === "string" && keymap && Object.prototype.hasOwnProperty.call(keymap, key) ? keymap[key] : undefined;
      if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= n || seen.has(idx)) {
        dropped += 1;
        continue;
      }
      seen.add(idx);
      out.push(idx);
    }
  }
  const appended: number[] = [];
  for (let i = 0; i < n; i++) if (!seen.has(i)) appended.push(i);
  return { order: [...out, ...appended], dropped, appended };
}

/**
 * The ordered outline split across `stages` stages, in order (contracts
 * §20.5; R2's syllabusChunks over the order, uncapped as the depth ladder
 * splits it): the first lines % stages stages take one more. [] per stage
 * with no line; [] with no stage.
 */
export function outlineStagesOf(order: readonly number[], stages: number): number[][] {
  const k = typeof stages === "number" && Number.isInteger(stages) && stages > 0 ? stages : 0;
  const out: number[][] = [];
  let next = 0;
  for (let i = 0; i < k; i++) {
    const size = Math.floor(order.length / k) + (i < order.length % k ? 1 : 0);
    out.push(order.slice(next, next + size));
    next += size;
  }
  return out;
}

// ─── The integrity verdict (F-R4-20) ────────────────────────────────────────

/** CLEAN: no violation. SALVAGED: only OVER_MAX_ITEMS (truncated). REJECTED: anything else; nothing from the reply is written. */
export type IntegrityVerdict = "CLEAN" | "SALVAGED" | "REJECTED";
export const INTEGRITY_VERDICTS: readonly IntegrityVerdict[] = ["CLEAN", "SALVAGED", "REJECTED"];
/**
 * A violation found walking the reply against the exact schema issued for the
 * run (own-property lookups only): a wrong TYPE, a value outside the issued
 * ENUM, an EXTRA_PROPERTY at any depth ('title', 'label', '__proto__' …), a
 * MISSING_REQUIRED key, FREE_TEXT (a string outside `gaps`), or an array
 * OVER_MAX_ITEMS (the only salvageable one).
 */
export type IntegrityCode = "TYPE" | "ENUM" | "EXTRA_PROPERTY" | "MISSING_REQUIRED" | "FREE_TEXT" | "OVER_MAX_ITEMS";
export const INTEGRITY_CODES: readonly IntegrityCode[] = ["TYPE", "ENUM", "EXTRA_PROPERTY", "MISSING_REQUIRED", "FREE_TEXT", "OVER_MAX_ITEMS"];

/** One violation. `path` is normalised: schema property names and indexes kept, every other segment REPORT_EXTRA_SEGMENT, cut to REPORT_PATH_SEGMENT_MAX — it never carries the model's words. */
export interface IntegrityViolation {
  code: IntegrityCode;
  path: string;
}

/** RoadmapRun.report.integrity (no migration: report is JSONB). */
export interface ValidationIntegrity {
  verdict: IntegrityVerdict;
  violations: IntegrityViolation[];
  /** Characters of model text kept: 0 unless gap names are shown. */
  modelChars: number;
  gapsKept: number;
  /** Gap names returned but not shown (ungrounded or flagged); counted, never stored as text. */
  gapsHidden: number;
  /** Gap strings dropped as NOT_A_NAME. */
  gapsDropped: number;
  /** NOT_A_NAME drops per shape-rule clause, so false drops can be watched. */
  notANameByClause: Record<string, number>;
}

/**
 * What R4's one draft-from-reply step returns (fix round, contracts §15.12;
 * lens 1 #9): runDraftCore's per-sample step — R4's integrityFor (the path
 * re-normalised, the verdict as R4 overrides it) → the REJECTED gate →
 * planFromReply with its KeysOnlyContext → the one writer's tripwire as a dry
 * run — as one pure function `draftFromReply(…)` in roadmap-server.ts, which
 * runDraftCore, reuseRun and hostileViewsOf all call. The bar (R7's seam)
 * then passes only the reply and the run, and asserts `integrity.verdict`
 * equals the case's expected verdict, so H4's no-write clause and H1's views
 * test production code.
 *   plan     the rows the draft path would write; null when nothing of the
 *            reply is written (the starter renders instead)
 *   refused  why nothing of the reply is written: REJECTED (integrity),
 *            TRIPWIRE (assertNoModelText refused the plan), EMPTY (nothing
 *            survived validation); null when `plan` is set
 */
export interface DraftFromReplyResult {
  integrity: ValidationIntegrity;
  validated: ValidatedDraft | null;
  plan: MilestoneDraft[] | null;
  refused: "REJECTED" | "TRIPWIRE" | "EMPTY" | null;
}

/**
 * Every gap name Gemini returned that is not shown (F-R4-19: "every other
 * name is dropped unseen and only counted"): the hidden (ungrounded or
 * flagged) plus the dropped (links, non-names). The one figure behind "3 not
 * shown" (fix round, contracts §15.5): R4's draftViewOf and R5's integrityLine
 * both read it, never gapsHidden alone. A missing or malformed count reads 0.
 */
export function gapsNotShownOf(integrity: Partial<Pick<ValidationIntegrity, "gapsHidden" | "gapsDropped">> | null | undefined): number {
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  return integrity ? n(integrity.gapsHidden) + n(integrity.gapsDropped) : 0;
}

/** The verdict from the violations: none → CLEAN; only OVER_MAX_ITEMS → SALVAGED; anything else → REJECTED. */
export function integrityVerdictOf(violations: readonly { code: IntegrityCode }[]): IntegrityVerdict {
  if (violations.length === 0) return "CLEAN";
  return violations.every((v) => v.code === "OVER_MAX_ITEMS") ? "SALVAGED" : "REJECTED";
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
  /**
   * Revision 4 (RoadmapItem.catalogKey): the roadmap-catalog.ts type of a
   * practice, step or checkpoint. On read a CODE item's label is re-rendered
   * from it (catalogLabelOf, with its `on` Domain in domainId, or all of R
   * when domainId is null), so it follows a renamed Domain; the user's Edit
   * makes it EDITED (YOURS) and keeps the key, so its "how" copy stays.
   */
  catalogKey?: CatalogKey | null;
  /** A GAP row's grounding source (F-R4-19): the index into groundingSourcesOf's list (stored in RoadmapItem.syllabusRef for a GAP; no column). */
  groundRef?: number | null;
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
  // ── Revision 5 (contracts §22.12; lane 7) ──
  /** The topic lineage a TOPICS measure counts (RoadmapMeasure.topicLineageId). */
  topicLineageId?: string | null;
  /** A checkpoint inside a milestone, never an extra node: PART ("half of layer 1 at level 6") or BETWEEN. */
  gate?: "PART" | "BETWEEN" | null;
}

/**
 * Milestone-level notes (codes; copy in roadmap-copy.ts): no study slot ("this
 * milestone already has 3"), no measurable part, a card measure dropped as
 * too small, the "Not medical advice" line. Lanes may append codes.
 * Revision 4:
 *   HELD_AT_START       a stage whose terms were all met at acceptance: PLANNED, reachedDay = the
 *                       acceptance day, no items, no goal, never startable, and it gives NO rank
 *                       ("Held when you began"); it counts as reached in Proficiency's stages part
 *   LONG_WINDOW         a first window still over MILESTONE_MAX_DAYS after the count gate
 *                       ("Writing 150 cards at 2 a week takes 75 weeks. Write more a week, or narrow the aim.")
 *   NO_PRODUCTION_SLOT  a stage at Retained or above that needs a production practice and has no free slot
 *   DEPTH_LOWERED       a stage dropped when the depth was lowered ("dropped when the depth was lowered on 5 Oct")
 *   KNOWN_BY_YOU        revision 5 (contracts §22.1 ruling 5): a TOPICS layer whose every topic you marked "I know this":
 *                       a held row that gives no rank (roadmap-realism's chain)
 */
export type MilestoneNote = "NO_STUDY_SLOT" | "NOT_MEASURABLE" | "CARDS_TOO_SMALL" | "HEALTH_LINE" | "HELD_AT_START" | "LONG_WINDOW" | "NO_PRODUCTION_SLOT" | "DEPTH_LOWERED" | "KNOWN_BY_YOU";
export const MILESTONE_NOTES: readonly MilestoneNote[] = ["NO_STUDY_SLOT", "NOT_MEASURABLE", "CARDS_TOO_SMALL", "HEALTH_LINE", "HELD_AT_START", "LONG_WINDOW", "NO_PRODUCTION_SLOT", "DEPTH_LOWERED", "KNOWN_BY_YOU"];

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
  /** Revision 4 (RoadmapMilestone.stage): set on every row a revision-4 draft path writes; null on a legacy row (isLegacyRoadmap). */
  stage?: StageKey | null;
  /**
   * Who arranged which outline lines and practice types sit in this
   * milestone (F-R4-21), derived on read from the version's run kind and any
   * moves; no column. GEMINI shows "Which outline lines and practice types
   * sit in which milestone is Gemini's suggestion."
   */
  arrangedBy?: "GEMINI" | "CODE" | "USER";
  // ── Revision 5 (contracts §22.12; lane 7) ──
  /** A TOPICS plan's layer milestone k (1..LAYERS_MAX); null on a depth milestone and on LEVELS. */
  layer?: number | null;
  chainRole?: ChainRole | null;
}

/**
 * Why the checker dropped something (F6). Revision 4:
 *   DUPLICATE   an outline line placed in two stages (it stays in the first)
 *   NOT_A_NAME  a gap string that fails the shape rule (its text is not stored; counted per clause)
 *   REJECTED    a reply the integrity walk rejected whole (nothing from it is written)
 *   CONSTRAINT  a kind the constraint filter excluded (a defence in depth: it is never in the run's enum)
 */
export type DropReason =
  | "UNKNOWN_KEY"
  | "DANGLING_NEW_DOMAIN"
  | "CONTAINED_LINK"
  | "EXTRA_MILESTONE"
  | "OVER_CAP"
  | "EMPTY_LABEL"
  | "BAD_SHAPE"
  | "DUPLICATE"
  | "NOT_A_NAME"
  | "REJECTED"
  | "CONSTRAINT";
export const DROP_REASONS: readonly DropReason[] = ["UNKNOWN_KEY", "DANGLING_NEW_DOMAIN", "CONTAINED_LINK", "EXTRA_MILESTONE", "OVER_CAP", "EMPTY_LABEL", "BAD_SHAPE", "DUPLICATE", "NOT_A_NAME", "REJECTED", "CONSTRAINT"];

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
  /**
   * Revision 4 (F-R4-20): the integrity walk's verdict, on every v3 Gemini
   * run. A report entry for CONTAINED_LINK, NOT_A_NAME, a REJECTED violation
   * or any GAP stores the label '' (redaction): no model text in report JSON.
   */
  integrity?: ValidationIntegrity;
}

// ─── Revision 4: the draft's choices and omissions (F-R4-17, F-R4-19, F-R4-21) ─

/** A kind the constraint filter left out of the run, with the word that excluded it ("Harder session ('running')"). */
export interface ConstraintExclusion {
  kind: CatalogKey;
  word: string;
}

/**
 * A body or care plan with constraints (F-R4-17): Gemini's session picks are
 * one pending decision per plan ("Gemini picked Harder session and Strength
 * session. Your constraints say '…'. Keep them?"). It blocks accept until
 * answered (confirmSessionPicksCore); EASY replaces the picks with
 * EASY_SESSION, MOBILITY_SESSION and TECHNIQUE_SESSION.
 */
export interface SessionPicks {
  kinds: CatalogKey[];
  /** The user's constraints, quoted. */
  constraints: string;
  decision: "PENDING" | "KEPT" | "EASY";
}

/** The aim itself meets a negated constraint term ("Your constraints say 'no running' and your aim is 'Run a sub-50 10K'"). */
export interface AimConflict {
  word: string;
}

/**
 * One Domain Gemini's `needs` (or an exact-match gap) would add (F-R4-21),
 * with its real facts and the date effect, shown before anything is
 * confirmed. `blocked`: adding it would take the plan past SPAN_MAX_DAYS, or
 * R would exceed DEPTH_DOMAINS_MAX (its toggle is disabled with the reason).
 */
export interface DomainAddition {
  itemId: string | null;
  domainId: string;
  name: string;
  cards: number;
  atSix: number;
  /** Its n_d at the plan's depth. */
  n: number;
  /** The realistic date with this Domain added (R2's per-Domain date effect); null while not computed. */
  dateWith: DayKey | null;
  blocked: "PAST_SPAN" | "TOO_MANY_DOMAINS" | null;
}

/** Where a shown gap name was found (F-R4-19): one text the user typed or chose, by kind and index. */
export type GroundSourceKind = "AIM" | "CONSTRAINTS" | "EXAM" | "OUTLINE" | "AREA" | "DOMAIN" | "NAMED";

/** A gap name shown in the panel (only GROUNDED, unflagged names; ROADMAP_GAPS_LIVE only). */
export interface GapView {
  itemId: string;
  name: string;
  source: { kind: GroundSourceKind; index: number };
  /** "similar to your Domain Statistics" (CONTAINED or SIMILAR; it stays a GAP row). */
  similarTo: string | null;
}

/** A Domain's provenance on a depth plan, for its life (F-R4-21): how it joined R and on which day. */
export interface DomainOrigin {
  by: "INTAKE" | "NAMED" | "GEMINI_NEEDS" | "GEMINI_GAP";
  day: DayKey;
}
/** {[domainId]: DomainOrigin}, recorded by acceptCore in the acceptance's feasibility (derived from the DOMAIN items before acceptance). */
export type DomainOrigins = Record<string, DomainOrigin>;

/** A typed coverage figure below the policy (decision 53): shown on the Depth line for the life of the plan; while any stands, the top rank is Virtuoso. */
export interface CoverageChoice {
  domainId: string;
  policy: number;
  typed: number;
  day: DayKey;
}

/** A lowered depth (F-R4-11): only by the LOWER_DEPTH tap, shown for good ("— below Mastered, your choice on 5 Oct" or "— set by your exam date on 5 Oct"). */
export interface DepthChoice {
  from: AimDepth;
  to: AimDepth;
  day: DayKey;
  reason: "CHOICE" | "EXAM";
}

/**
 * One required Domain's coverage, with where its figure came from, always
 * (F-R4-9): "Probability · 34 cards: the most of the 25-card floor, 80% of
 * your 42 (34), and 3 × 8 outline lines (24)".
 */
export interface CoverageBreakdown {
  domainId: string;
  name: string;
  /** Live recall cards at intake (multiple choice not counted) and the multiple-choice cards left out. */
  live: number;
  nonRecall: number;
  /** The outline lines tied to it, and its even share of the lines tied to no Domain in R. */
  linesTied: number;
  linesShared: number;
  /** coveragePolicyOf's terms. */
  floor: number;
  share: number;
  outline: number;
  policy: number;
  /** The user's typed figure (YOURS), or null. */
  typed: number | null;
  /** The figure in force: typed ?? policy. */
  n: number;
  belowPolicy: boolean;
}

/** What the date check assumed (stored in the feasibility JSON): who set the date, and which inputs were priors or a typed pace. */
export interface DateOrigin {
  origin: "REALISTIC" | "USER";
  calibrating: CalibratingInput[];
}

/**
 * The date check (F-R4-11; R2's dateCheckOf), stored in the acceptance's
 * feasibility with the user's choice. Days are null when not dated ("Not
 * dated: no writing pace yet").
 *   D_real       the Sunday on or after max(D_exp(r_plan), D_hours): the realistic date
 *   D_full       D_exp(r_src): realistic at the full usual pace
 *   D_best_pace  D_bst(r_plan): "earliest if every review passes, at this pace" (the secondary line)
 *   D_best_2x    D_bst(OVER_PACE_FACTOR × r_src): the IMPOSSIBLE test only
 *   D_floor      strict floors with p = 1 and every needed card written today
 */
export interface DateCheck {
  D_real: DayKey | null;
  D_full: DayKey | null;
  D_best_pace: DayKey | null;
  D_best_2x: DayKey | null;
  D_floor: DayKey | null;
  verdict: DateVerdict;
  /** New cards a week the plan asks (r_plan, or the least r* for TIGHT and OVER); null with no new cards needed. */
  rateAsked: number | null;
  /** The highest level among the realistic plan's milestones whose stage day ≤ the user's date; null when D_u ≥ D_real. */
  reachByUserDate: number | null;
  /** The highest level among the plan's milestones whose stage day ≤ examDay; null without an exam date. */
  reachByExam: number | null;
  /** D_real minus the last writing day ≥ SCHEDULE_BOUND_SHARE × floorBase(L*): "set by the review schedule, not your hours". */
  scheduleBound: boolean;
  dateOrigin: DateOrigin;
  basis: string[];
}

/**
 * A plan's motivation timeline (R2's motivationTimelineOf; days from today):
 * the first rank, each later rank, each milestone that could pay ⬡6, Paragon
 * (null when the plan can't give it), and the longest stretch with none.
 */
export interface MotivationTimeline {
  firstRankDay: number | null;
  rankDays: number[];
  payDays: number[];
  paragonDay: number | null;
  longestGap: number;
  /** The plan carries LONG_WINDOW (exempt from the first-rank bound; shows the note instead). */
  longWindow: boolean;
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
  // ── Revision 4 (validateKeysOnly) ──
  /** Gemini's `needs`, resolved to Domain ids (pending DOMAIN items with NOT_CHOSEN). */
  needs?: string[];
  /** Kinds the constraint filter left out, with their words. */
  exclusions?: ConstraintExclusion[];
  /** A body or care plan's pending session-picks decision. */
  sessionPicks?: SessionPicks | null;
  /** Gap rows shown (GROUNDED, unflagged), and the count of the rest (never their text). */
  gaps?: GapView[];
  gapsHidden?: number;
  /** Outline line indices tied to no Domain in R. */
  unassignedLines?: number[];
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
  /**
   * Revision 4: a depth plan's terms are one per required Domain,
   * `CARDS_AT_LEVEL|d:<id>|L<L*>|rc` with target n_d, targetSource DEPTH (the
   * policy) or YOURS (typed). Never scaled, fitted or lowered by a remedy.
   */
  targetSource?: TargetSource;
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
  // ── Revision 4 (R4 fills them from the intake and reachInputsOf; R2 reads them) ──
  /** Roadmap.depth; null or absent: a track Area or a legacy plan. */
  depth?: AimDepth | null;
  dateMode?: DateMode;
  /** The user's date in CHOSEN mode (= targetDay); null in REALISTIC mode. */
  userDate?: DayKey | null;
  examDay?: DayKey | null;
  /** The reach model's inputs (reachInputsOf), and which of them were assumed. */
  reach?: ReachParams;
  calibrating?: CalibratingInput[];
  /** The source writing rate (new cards a life week; measured or typed) before PACE_SHARE; null with none. */
  sourceRate?: number | null;
  // ── Revision 5 (contracts §22.12, §23.3; lane 3 reads both shares, ruling 54; lane 7 planKind). Both shares default to 1, and 1 is byte-identical (M13). ──
  /** This goal's share of the week (roadmap-goals sharesOf): min(h × 60 × A, rampCap × share). */
  share?: number;
  /** This goal's share of its Field's pace (sharesOf's fieldShare): multiplies a FIELD-sourced rate only (ruling 30). */
  fieldShare?: number;
  planKind?: PlanKind;
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
  // ── Revision 4: what rides RoadmapAcceptance.feasibility (no migration) ──
  /** REACH_MODEL_VERSION the figures were worked out with. */
  reachModel?: number;
  /** The date check, with the user's choice (TIGHT kept, OVER kept with the switch). */
  dateCheck?: DateCheck | null;
  depthChoice?: DepthChoice | null;
  coverageChoices?: CoverageChoice[];
  domainOrigins?: DomainOrigins;
  /**
   * Fix round (contracts §15.3): every required Domain's coverage as it was
   * worked out for this draft or acceptance, with the counts frozen at
   * intake (frozenCoverageCountsOf): the draft's feasibility carries the
   * counts its rows were built from; each acceptance stores what it accepted.
   * The next acceptance and lowerDepthCore read live and nonRecall from here
   * for every Domain already in it, so n_d moves only by a typed figure, a
   * line's Domain or LOWER_DEPTH. Absent on rev-3 and earlier rev-4 rows
   * (those Domains read today's counts once, then freeze).
   */
  coverage?: CoverageBreakdown[];
}

/**
 * The one order of a roadmap's acceptances, newest first (fix round,
 * contracts §15.7): lowerDepthCore writes a second record within the same
 * version (previousVersion = version), so `version` alone ties and a reader
 * with `take: 1` could read the pre-lowering end state. Prisma's orderBy
 * takes it as it is (a fresh array each call).
 */
export function acceptanceOrderBy(): [{ version: "desc" }, { acceptedAt: "desc" }] {
  return [{ version: "desc" }, { acceptedAt: "desc" }];
}

/** A record written within its version (previousVersion = version): a lowered depth (lowerDepthCore), never a re-plan's acceptance and never Undo-able. Plan history words it as "lowered the depth", not "the re-plan lowered the end target". */
export function isDepthLoweringRecord(a: { version: number; previousVersion: number | null | undefined }): boolean {
  return a.previousVersion != null && a.previousVersion === a.version;
}

/** One life week of a started milestone's plan, with what the week quests keep from Start. */
export interface StartWeek extends PlanWeek {
  /** needRate_w = newNeeded_start × fw_w ÷ Ww_start: the new cards that week needed when the milestone started. */
  needRate: number;
  /** |E_w ∩ (…, lastCardDay]| ÷ 7. */
  fw: number;
  /** Revision 4 (F-R4-14): needRate_{d,w} per Domain id (ADD's per-Domain catch-up cap). */
  needRateByDomain?: Record<string, number>;
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
  // ── Revision 4 (F-R4-8, F-R4-14): the reach inputs at Start, frozen for the milestone's life ──
  /** REACH_MODEL_VERSION the snapshot was worked out with (absent: rev 3's p^k). */
  reachModel?: number;
  /** pLong, c and ρ at Start (the spec's pLong_start, c_start, ρ_start); pStart above is p_start. */
  pLongStart?: number;
  cStart?: number;
  rhoStart?: number;
  /** The inputs that were priors at Start. */
  calibrating?: CalibratingInput[];
  /** newNeeded_start per Domain id (the new recall cards each Domain still needed at Start). */
  newNeededByDomain?: Record<string, number>;
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
/** What changed the basis: shown "Changed on … (was 41%)", never as a gain. RESUMED (contracts §23.4; lane 3): the first reading after a paused goal resumes ("since you resumed"). */
export type ProficiencyRebaseCause = "ACCEPTED" | "REPLAN" | "UNDO" | "SWITCHED_OFF" | "RESUMED";

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
  // ── Revision 4 (F-R4-12; fix round: on the contract, R1's ProficiencyViewR1 fills them) ──
  /** What a depth plan's Proficiency counts toward (the depth's level and stage name); null without a depth. */
  toward?: ProficiencyToward | null;
  /** The label that always names its basis: "Proficiency toward Mastered (level 12)"; "Proficiency" alone without a depth. */
  label?: string;
}

/** What a depth plan's Proficiency counts toward: the depth's level and its stage name ("Mastered", 12). R1's proficiencyTowardOf builds it. */
export interface ProficiencyToward {
  level: number;
  name: string;
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
  /**
   * Revision 4 (generator 2): one part per Domain with a gap, count_d =
   * min(pace_d, ceil(expectedReach_d)); count = Σ count_d; progress is
   * Σ_d clamp(v_d − floor_d, 0, count_d) and the row is done when every part
   * is. A v1 set has none (it renders as a single part from the fields above).
   */
  parts?: RaisePart[];
}

/** One Domain's share of a RAISE row. */
export interface RaisePart {
  domainId: string;
  /** That Domain's measure key, with its `r` or `rc` segment. */
  measureKey: string;
  /** b0_d. */
  floor: number;
  count: number;
  dueDays: DayKey[];
}

/** One Domain's share of an ADD row (recall cards only; multiple choice added that week doesn't count). */
export interface AddPart {
  domainId: string;
  count: number;
  /** The uncapped ask pace_d, and the cap that bound it. */
  pace?: number;
  cappedBy?: WeekQuestCap | null;
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
  /** Revision 4 (generator 2): one part per Domain still short; the link goes to /add for the part with the largest count. */
  parts?: AddPart[];
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
  /** Revision 5 (contracts §23.3; lane 3): the share the set was frozen with (Monday 04:00); absent or null with one goal. */
  share?: { hours: number; of: number } | null;
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
  /** Revision 4: a depth plan's measure is one Domain's (WeekQuestInput.cards holds one per Domain). */
  domainId?: string;
  /** Revision 4: the measure key's segment; with it, only recall cards count, and 'rc' counts a retry-entry card at L after its next pass. */
  segment?: CardSegment;
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
  /** Revision 4 (generator 2): every card measure of the milestone, one per Domain (`card` stays the first, for v1 readers). */
  cards?: WeekQuestCardInput[];
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
  | {
      kind: "RAISE";
      /** The last stored reading dated in the window; null → v0. */ value: number | null;
      /** The week's highest reading so far. */ high: number | null;
      /** The day a slip was read (the caption's day). */ slipDay: DayKey | null;
      /** Revision 4: per part (Domain id), the same three; absent on a v1 set. */
      byDomain?: Record<string, { value: number | null; high: number | null; slipDay: DayKey | null }>;
    }
  | {
      kind: "ADD";
      /** Non-archived Ideas with domainId in scope created in the window. */ added: number;
      /** Revision 4: recall cards added per Domain id; absent on a v1 set. */
      addedByDomain?: Record<string, number>;
    }
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
  /** Revision 4: each part's progress (a part's slip offsets only that part); absent on a v1 set. */
  parts?: { domainId: string; progress: number; count: number; done: boolean }[];
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
  /**
   * Revision 4: RAISE and ADD parts ("3 in Probability · 2 in Inference"):
   * Today shows the first WEEK_QUEST_PARTS_TODAY and "+n more", the roadmap
   * page all. Every count keeps its unit; never a bare "n of N".
   */
  parts?: { domainId: string; name: DomainName; count: number; progress: number; done: boolean; /** The live fix: the part's Domain carries the Gemini mark (geminiNamedOf); set only when true. */ geminiNamed?: boolean }[];
  /** Revision 4 (fix round: on the contract; R6's questPartsLineOf fills it): the variant's parts line, on a RAISE or ADD row with parts. */
  partsLine?: string;
  /** The live fix (§22.11): partsLine as parts, a Gemini-named Domain marked (namedPartsOf); set only when one is. */
  partsLineParts?: NamedPart[];
  /** Revision 4 (F-R4-13): a PRACTICE row of a BODY plan; the component shows HEALTH_LINE as its sub-line (R6 writes only true). */
  health?: boolean;
  // ── Revision 5 (contracts §23.3; lane 3 fills slot, lane 8 labelParts) ──
  /** The goal's seat: Today shows its seat glyph. */
  slot?: GoalSlot | null;
  /** The label as parts, a Gemini-named Domain marked (namedPartsOf). The live fix: R6's view fills it (WeekQuestsViewInput.marks), only when a part is Gemini-named. */
  labelParts?: NamedPart[];
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
  // ── Revision 5 (contracts §23.3; lane 3) ──
  slot?: GoalSlot | null;
  /** This goal's share of the week as of Monday 04:00 ("goal 2's 3 of 7 h"); null with one goal. */
  share?: { hours: number; of: number } | null;
  // ── The live fix (contracts §22.11, §22.20): the Gemini mark off the roadmap page; set only when a part is Gemini-named ──
  /** The milestone's title as parts, a kept Gemini-named Domain marked (namedPartsOf). */
  milestoneTitleParts?: NamedPart[];
  /** Each note as parts (index for index with `notes`), present only when some note holds a Gemini-named Domain. */
  notesParts?: NamedPart[][];
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
  /** A typed target (YOURS) for a card measure, by measureKey. Refused on a depth plan's stage (fix round): its counts come from coverage. */
  target?: number;
  minLevel?: number;
  /**
   * Revision 4 (F-R4-21, fix round: on the contract): "Change the type" — a
   * PRACTICE, STEP or CHECKPOINT re-typed from the app's list (its slot and
   * track only). The app re-writes the label from the catalog template
   * (CODE); the row's catalog choice becomes the user's.
   */
  catalogKey?: CatalogKey | null;
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
  /** Revision 5 (contracts §22.14; lane 8): what a TOPICS draft's confirm named; acceptCore refuses a stale one (RACED). */
  topicMap?: AcceptTopicChoices | null;
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
  pay: {
    stated: number;
    zeroReason: StatedZeroReason | null;
    limitLine: string | null;
    paidOn?: DayKey | null;
    /**
     * Revision 4 (F-R4-13 pay honesty; fix round: on the contract, R4's
     * roadmap-economy fills it): the name of the practice the app added that
     * the stated pay rests on — without it the milestone would fall under the
     * practice gate. null or absent: the pay rests on no added practice.
     */
    restsOnAdded?: string | null;
  };
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
  /**
   * `nonRecall` (revision 4, fix round): its multiple-choice cards, which a
   * depth plan doesn't count (NON_RECALL_TYPES), so the intake's coverage
   * preview reads live = cards − nonRecall exactly as the server's draft does
   * ("42 cards · 6 multiple choice not counted"). R4's loadIntakeView always
   * fills it; absent only on a view built before the fix round (read as 0).
   */
  domains: { id: string; name: string; cards: number; atSix: number; atTop: number; paceMeasured: boolean; nonRecall?: number }[];
}

/** What /you/roadmap/new renders (F2). */
export interface IntakeView {
  today: DayKey;
  hasKey: boolean;
  /**
   * Ruling N11: the topic map's Gemini chain ([Break it down], [Rate again], Go deeper) is offered: the topic switches
   * on (topicSwitchesOf().rate) and a key set. Independent of ROADMAP_GEMINI_LIVE (LEVELS drafting, kept off) and of
   * `hasKey`, which reads that switch. Absent (fixtures made before it): off.
   */
  topicGemini?: boolean;
  keyTier: GeminiKeyTier;
  writesOff: boolean;
  /** The open DRAFT the page edits ("Continuing your draft from 3 Oct · Discard it"). */
  draft: { roadmapId: string; intake: Intake; savedDay: DayKey } | null;
  /** Another roadmap is ACTIVE: saveIntake refuses ("Archive it to start another"). */
  activeRoadmapId: string | null;
  fields: IntakeFieldOption[];
  /** "You've tracked ≈ 7 h 40 a week of tasks (task estimates, not timed; median of 4 weeks)" or calibrating. */
  tracked: WeeklyFigure | null;
  // ── Revision 4 (F-R4-4, F-R4-9) ──
  /** The current interval multiplier: the hints' floors are floorBase(L*, m) ("at least 340 days … level 12"), computed, never typed. */
  m?: number;
  /** "By when"'s CHOSEN chips with their floor verdicts per depth, for the Area's default Domains (R2's floor helper; none hidden or disabled). */
  dateChips?: IntakeDateChip[];
  /** The measured new-card pace of the Area (new cards a week), when there is one; null: "New cards a week" is asked in REALISTIC mode when a Domain needs new cards. */
  paceRate?: number | null;
  // ── Revision 5 (contracts §23.5; lane 3) ──
  /** Every seat 1..GOAL_SLOTS_MAX with the goal in it (or none). */
  seats?: GoalSeatView[];
  /** Every open DRAFT intake, one per seat. */
  drafts?: IntakeDraftView[];
  /** GOALS_MAX as the page reads it. */
  goalsMax?: number;
  /** Σ hours a week of the other DRAFT and ACTIVE goals (hoursRoomOf's `taken`). */
  hoursTaken?: number;
  /** Domain id → the seat of the DRAFT, ACTIVE or PAUSED goal holding it (null: a paused goal with no seat): shown "in goal 1", never preselected. */
  takenDomains?: Record<string, GoalSlot | null>;
  /** topicSwitchesOf(): which topic-map paths the form offers. */
  topicSwitches?: TopicSwitches;
}

/** A "By when" chip: 6 / 12 / 24 months or 3 years, with "· possible" or "· before level 12 is possible" per depth. */
export interface IntakeDateChip {
  months: 6 | 12 | 24 | 36;
  day: DayKey;
  possible: Record<DepthKey, boolean>;
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
  /** Revision 4: the stage ("Milestone 2 · Familiar (level 6)") and its gate level; null on a legacy row or a track stage. */
  stage?: StageKey | null;
  gateLevel?: number | null;
}

/**
 * The last aim, kept on the character page after its roadmap closes (F-R4-1,
 * F-R4-2): "Last aim: “<aim>” · Aim rank Paragon · reached 3 Mar 2028" (or
 * "· closed 3 Mar 2028" when it ended unreached). From the latest DONE roadmap.
 */
export interface LastAimView {
  roadmapId: string;
  aim: string;
  rankIndex: number;
  rankName: AimRankName;
  reached: boolean;
  /** reachedDay when reached, else the done day. */
  day: DayKey;
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
  // ── Revision 4 ──
  /** LifeSettings.aimSuggestions (one indexed select; null = never set, which means on). EMPTY included. */
  aimSuggestions?: boolean | null;
  /** The latest DONE roadmap's aim, final rank and day (EMPTY's last-aim line); null with none. */
  lastAim?: LastAimView | null;
  /** Roadmap.depth (null on a track Area or a legacy plan). */
  depth?: AimDepth | null;
  /** The chip "Mastered by Nov 2027" (or "by about Nov 2027 · estimate" while calibrating), replacing "by 31 Mar". */
  dateChip?: { depth: AimDepth; day: DayKey; estimate: boolean } | null;
  /** DONE within RANK_NEW_DAYS of the reach: the held depth facts ("Mastered (level 12) in Probability and Inference · confirmed 3 Mar 2028"). */
  heldDepth?: { depth: AimDepth; domainNames: string[]; confirmedDay: DayKey } | null;
  /** A plan made before revision 4: the card shows the aim and the banner's action, no milestone title (F-R4-16). */
  legacy?: boolean;
  /**
   * Fix round 2 (contracts §16.3; F-R4-16, lens 3 #13 and #17): a legacy
   * plan's banner facts, R4's legacyViewOf(b) — the same LegacyView
   * RoadmapView carries. The Aim card shows LEGACY_GEMINI_HIDDEN when
   * `geminiHidden`, and its "Start again at a depth" handoff
   * (restartHandoffOf) carries the old plan's `domainIds` and `areaFieldId`,
   * as RoadmapView's banner does, so the new intake preselects that plan's
   * Domains rather than every Domain with cards in the Area. Null or absent
   * on a revision-4 plan; `legacy` stays the boolean the card keys on.
   */
  legacyView?: LegacyView | null;
  // ── Revision 5 (contracts §23.5; lane 3) ──
  slot?: GoalSlot | null;
  label?: string | null;
  planKind?: PlanKind;
  /** A PAUSED goal's card: "paused since 6 Oct", never "behind". */
  paused?: { since: DayKey } | null;
}

// ═══ Revision 4: Today's aim line (F-R4-3) ══════════════════════════════════

/** One milestone of the open ACTIVE roadmap, as the aim line's START rule reads it (R4's loadAimStep fills it). */
export interface AimStepMilestone {
  id: string;
  /** Its place in the plan (1-based; the copy's "Milestone 2"). */
  ord: number;
  stage: StageKey | null;
  /** The gate level (BETWEEN's odd level, PART's count level), for the stage's words. */
  gateLevel: number | null;
  /** PLANNED (not started), OPEN (STARTING or STARTED and not closed), CLOSED (reached, closed short or dropped) or LATER. */
  state: "PLANNED" | "OPEN" | "CLOSED" | "LATER";
  rankIndex: number | null;
  reachedDay: DayKey | null;
  /** HELD_AT_START: reached at acceptance, skipped, and it gives no rank. */
  held: boolean;
  /** A CLOSED row's close day (reached, closed or dropped); a held row's is the acceptance day. */
  closedDay: DayKey | null;
  /** milestoneDueDayOf: a PLANNED row past it is PAST_DUE. */
  dueDay: DayKey | null;
}

/**
 * What R4's loadAimStep returns for Today (≤ 4 indexed reads, cached as
 * 'aimStep:<user>:<today>' on ['roadmap', 'life']; a missing table or column
 * gives null). roadmap-invite todayAimLineOf reads it.
 */
export interface AimStep {
  /** The open roadmap, or null when none is DRAFT or ACTIVE. */
  open:
    | null
    | { kind: "DRAFT"; roadmapId: string; savedDay: DayKey; running: boolean }
    | { kind: "ACTIVE"; roadmapId: string; track: boolean; acceptedDay: DayKey; milestones: AimStepMilestone[] };
  /** The latest DONE roadmap's done day (the NEXT variant), or null. */
  lastDoneDay: DayKey | null;
  /** The latest DONE or ARCHIVED roadmap's done or archive day (the ask's anchor), or null. */
  lastClosedDay: DayKey | null;
  /** LifeSettings.epochDay, or null. */
  epochDay: DayKey | null;
  /** The latest DAY_OPEN ledger row dated before today (the first day back), or null. */
  lastOpenBefore: DayKey | null;
  /** LifeSettings.aimSuggestions (null: never set, on). */
  aimSuggestions: boolean | null;
  /** Ruling N15: how many goals are open (DRAFT or ACTIVE), so SET hides once every seat is taken. Absent: `open` alone counts. */
  openCount?: number;
}

/**
 * The aim line on Today (data; R5's AimLine renders the copy). Never red,
 * never counted, never in the bell, never a link to /review.
 *   SET    "A new week. Set an aim: …" (WEEK, MONTH, BACK, NEXT) → /you/roadmap/new
 *   DRAFT  "A roadmap draft is waiting for your check." → /you/roadmap
 *   START  "Milestone 2 · Familiar is ready to start. Reaching it gives the Aim rank Journeyman." → /you/roadmap#now
 */
export type AimLineView =
  | { kind: "SET"; variant: "WEEK" | "MONTH" | "BACK" | "NEXT"; href: string }
  | { kind: "DRAFT"; roadmapId: string; href: string }
  | {
      kind: "START";
      milestoneId: string;
      ord: number;
      /** The stage's words from STAGE_NAMES (stageLabelOf); null on a track plan ("Milestone 2 is ready to start."). No title ever reaches Today. */
      stageName: string | null;
      /** The rank reaching it gives; null: "It keeps your rank." */
      givesRank: AimRankName | null;
      href: string;
    };

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
  // ── Revision 4 ──
  depth?: AimDepth | null;
  dateMode?: DateMode;
  examDay?: DayKey | null;
  /** Who set the date and what it assumed (a date the app set is never called "your choice"). */
  dateOrigin?: DateOrigin | null;
  /** A plan made before revision 4 (isLegacyRoadmap). */
  legacy?: boolean;
  /** Fix round (F-R4-16, decision 47): the plan's chosen Domains (Roadmap.domainIds), so "Start again at a depth" carries them into the new intake. */
  domainIds?: string[];
  // ── Revision 5 (contracts §22.3; lane 3 fills slot, label and paused, lane 8 the rest) ──
  planKind?: PlanKind;
  /** Roadmap.slot: the goal's seat (null on a PAUSED, DONE or ARCHIVED goal whose seat was taken). */
  slot?: GoalSlot | null;
  label?: string | null;
  /** The plan's cautions («Not financial advice»), code's (the word lists ∪ the rating's caution reasons). */
  cautions?: Caution[];
  rating?: RatingView | null;
  /** A PAUSED goal: "paused since 6 Oct", with the reason the user gave. */
  paused?: { since: DayKey; reason: string | null } | null;
}

/**
 * The Depth line (F-R4-15), shown for the life of the plan: the depth and
 * its Domains with counts, every coverage choice, every Gemini-suggested
 * Domain ("suggested by Gemini, added by you on 5 Oct"), "coverage
 * unchecked: no outline", and a lowered depth.
 */
export interface DepthView {
  depth: AimDepth;
  coverage: CoverageBreakdown[];
  coverageChoices: CoverageChoice[];
  depthChoice: DepthChoice | null;
  domainOrigins: DomainOrigins;
  /** The plan has an outline (else "coverage unchecked: no outline", for good). */
  outlineChecked: boolean;
  /** "By your exam (Sun 4 Apr 2027) the plan reaches Retained (level 8)." */
  exam: { day: DayKey; reachLevel: number | null } | null;
}

/** A legacy roadmap's banner (F-R4-16): its milestone and item text is never rendered. */
export interface LegacyView {
  /** DRAFT: "[Draft it again]"; ACTIVE: "[Start again at a depth]"; DONE or ARCHIVED: history only. */
  kind: RoadmapStatus;
  /** Any row had a Gemini origin: "Wording from an earlier Gemini draft is hidden." */
  geminiHidden: boolean;
  /**
   * Fix round (F-R4-16, decision 47): what "Start again at a depth" carries
   * into the new intake's handoff — the legacy roadmap's chosen Domains
   * (Roadmap.domainIds), its Area (null on a track Area) and its track.
   * Offered with `replaces` only while `kind` is ACTIVE; a DONE or ARCHIVED
   * legacy roadmap offers "Set your next aim" with no `replaces`.
   */
  domainIds?: string[];
  areaFieldId?: string | null;
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
  /** Revision 5 (fix round): a topic chain step's phase (its `stale` reads TOPIC_RUN_STALE_MS); null or absent: a LEVELS run. */
  phase?: RunPhase | null;
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
  // ── Revision 4 (F-R4-17, F-R4-19, F-R4-21) ──
  /** Kinds the constraint filter left out, each with its word ("Left out because of your constraints: …"). */
  exclusions?: ConstraintExclusion[];
  /** A body or care plan's session-picks decision (blocks accept while PENDING). */
  sessionPicks?: SessionPicks | null;
  /** The aim meets a negated constraint term. */
  aimConflict?: AimConflict | null;
  /** Gap names not shown ("Gemini suggested 3 names the app couldn't find in your words; they're not shown"). */
  gapsHidden?: number;
  /** The shown gap names (the panel; ROADMAP_GAPS_LIVE only). */
  gaps?: GapView[];
  /** Gemini's Domain additions, with their facts and date effects (a pending one blocks accept). */
  additions?: DomainAddition[];
  /** BULK ([Add both] [Choose…] [Leave out]) for an English, non-exam aim; TOGGLES (one per Domain, no add-all) for an exam or non-English aim. */
  additionsMode?: "BULK" | "TOGGLES";
  /** Outline line indices tied to no Domain in R. */
  unassignedLines?: number[];
  /** The draft's date check, coverage and depth line. */
  dateCheck?: DateCheck | null;
  depth?: DepthView | null;
  /** A legacy draft (F-R4-16): no row text is rendered; accept refuses ("Draft it again first"). */
  legacy?: LegacyView | null;
  /**
   * Constraint safety (contracts §19): the confirm card, from the same gate
   * the draft was built with (activityConfirmViewOf). Undefined: not loaded
   * here; null or `on: false` with no rows: nothing to show.
   */
  activityConfirm?: ActivityConfirmView | null;
  // ── Revision 5 (contracts §22.3; lane 8 fills topicMap, lane 3 otherGoals) ──
  /** A TOPICS draft's map (null on LEVELS). */
  topicMap?: TopicMapView | null;
  /** Every other goal whose verdict accepting this draft turns TIGHT or OVER ("Goal 1 becomes tight · [Re-date goal 1]"). */
  otherGoals?: GoalVerdictChange[];
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
  // ── Revision 5 (contracts §22.3; lane 8) ──
  /** The label as parts, a Gemini-named Domain marked (namedPartsOf). */
  labelParts?: NamedPart[];
  topicLineageId?: string | null;
  /** An earlier layer's CONTEXT row: the level it climbs to ("climbing to 8"). */
  climbing?: number | null;
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
  /** Revision 4: the stage and its gate level; `held` marks "Held when you began" (no rank). */
  stage?: StageKey | null;
  gateLevel?: number | null;
  held?: boolean;
  // ── Revision 5 (contracts §22.3; lane 8) ──
  layer?: number | null;
  chainRole?: ChainRole | null;
  /** A locked layer milestone is a PLANNED row that opens after layer n is reached (ruling 5): not a new state. */
  opensAfter?: number | null;
  /** The title as parts, a Gemini-named Domain marked (namedPartsOf). */
  titleParts?: NamedPart[];
  /** Every topic of the layer is marked "I know this". */
  known?: boolean;
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
  /**
   * Revision 4 (fix round: on the contract; R4 fills them from the StartSnapshot):
   * a started milestone's Start figures — the MilestoneFeasibility its target
   * was worked out from when it started, and its start day — for the
   * Reference's "Worked out when it started on …". null before Start.
   */
  startFeasibility?: MilestoneFeasibility | null;
  startedDay?: DayKey | null;
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
  /**
   * Fix round 2 (contracts §16.2; lens 2 and lens 3): this row is a record
   * lowerDepthCore wrote inside its version (isDepthLoweringRecord(a):
   * previousVersion === version), not a re-plan's acceptance. R4's historyOf
   * sets it from the acceptance itself and words such a row's `changes` as
   * [depthChangeLineOf(endStateOf(prev), endStateOf(a)) ?? "lowered the
   * depth"]. R5's PlanHistory keys "depth lowered" on it, never on a version
   * that repeats the row before: after Undo the roadmap's version drops back
   * by one, so accept → Undo → accept writes a second acceptance of the same
   * version, which lowered nothing. Absent reads false.
   */
  depthLowered?: boolean;
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
  /** Revision 5 (migration B; ruling 67): the Gemini mark's inputs (geminiNamedOf), present only on a Domain that has an origin, so a LEVELS view is unchanged. */
  nameOrigin?: string | null;
  originName?: string | null;
}

/** What loadRoadmapView returns for /you/roadmap (F18). Serialisable; rendering writes nothing but the fallback freeze. */
export interface RoadmapView {
  state: RoadmapViewState;
  today: DayKey;
  hasKey: boolean;
  /**
   * Ruling N11: the topic map's Gemini chain ([Break it down], [Rate again], Go deeper) is offered: the topic switches
   * on (topicSwitchesOf().rate) and a key set. Independent of ROADMAP_GEMINI_LIVE (LEVELS drafting, kept off) and of
   * `hasKey`, which reads that switch. Absent (fixtures made before it): off.
   */
  topicGemini?: boolean;
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
  // ── Revision 4 ──
  /** The Depth line, on a depth plan (null on a track Area or a legacy plan). */
  depth?: DepthView | null;
  /** The accepted date check (dateOrigin, the waypoints, the schedule-bound line). */
  dateCheck?: DateCheck | null;
  /** "Top rank on this plan: Virtuoso — Paragon needs a standard you set": the missing conditions (topRankIndexOfDepth, paragonMissingOf). */
  paragonMissing?: ParagonMissing[];
  /** A legacy roadmap's banner (F-R4-16). */
  legacy?: LegacyView | null;
  /** The shown gap names (ROADMAP_GAPS_LIVE only) and the hidden count. */
  gaps?: GapView[];
  gapsHidden?: number;
  /**
   * Constraint safety (contracts §19): the confirm card on the living
   * roadmap (the answers stay editable for the life of the plan). Undefined:
   * not loaded here; null: nothing to show.
   */
  activityConfirm?: ActivityConfirmView | null;
  // ── Revision 5 (contracts §22.3; lane 8 fills topicMap, lane 3 goals) ──
  /** A TOPICS plan's map (null on LEVELS). */
  topicMap?: TopicMapView | null;
  /** The goal switcher (null with one goal and GOALS_MAX 1). */
  goals?: GoalSwitcherView | null;
  /** A TOPICS draft's Gemini chain (fix round; ruling 47): what the page's poll and its stop line read. Absent: no chain. */
  topicChain?: TopicChainView | null;
}

// ═══ Constraint safety: confirm to unlock (contracts §19) ═══════════════════
//
// The lead's rule: constraint SAFETY must not depend on the parser, nor on
// the cue detector. Every BODY or CARE plan, whatever the user wrote (cue or
// not, constraints empty or not), asks once: until the user answers the
// activity card under their current words, every plan path places only the
// catalog's safe types (CatalogEntry.safe: the easy, mobility and technique
// sessions on BODY; planning the week and keeping a log on CARE) for the
// track's practice and for the activity itself. A CRAFT plan asks the same
// way when any of the user's texts carries a cue or can't be read (wrist
// RSI, voice strain, a condition named with no pain word: "Acid reflux
// affects my singing.", tinnitus, a tremor …). Answering takes an explicit
// act: tick what to avoid and Save, or tap "Nothing to avoid"; an unticked
// row is never taken as an answer by itself, so Save with nothing ticked
// unlocks nothing. The answer
// carries the key of the words it was given against, and a changed text asks
// again (an AVOID stands). The parser's exclusions (R3's
// constraintExclusionsOf) only SUGGEST: a pre-ticked box with the user's
// own sentence quoted. They never block and never unlock anything. Field
// (knowledge) practice is never gated by a body cue.
//
// This half holds the cue detector (pure, high recall, no meaning: a cue is
// a reason to ask, never a reading of what the user can do; on BODY and CARE
// it only chooses the words the card quotes), the stored answer's shape and
// its fingerprint, and the shapes the gate returns. The gate itself
// (allowedKindsFor) reads the catalog, so it lives in roadmap-catalog.ts.
// Nothing here claims medical knowledge: the class of a cue is for the
// checks and the bar, never shown as a diagnosis, and the HEALTH_LINE ("Not
// medical advice …") stays wherever a BODY or CARE plan shows.

/** What a cue's words name. For the checks and the bar only: the card quotes the user's words, never the class. */
export type CueClass = "INJURY" | "PAIN" | "HEALTH" | "AVOID" | "BODY_PART" | "LANGUAGE";
export const CUE_CLASSES: readonly CueClass[] = ["INJURY", "PAIN", "HEALTH", "AVOID", "BODY_PART", "LANGUAGE"];

/** Where the words came from: the Constraints box, the aim, or another text the user typed (cueTextsOf's notes). */
export type CueSource = "CONSTRAINTS" | "AIM" | "NOTES";

/** One cue, quoted from the user's own words. */
export interface CueSpan {
  source: CueSource;
  /** NOTES only: the note's index in CueTexts.notes. */
  note?: number;
  cls: CueClass;
  /** The vocabulary entry that matched ("pain", "too much", "bad + knee", "my + knee", "~injury" for a one-letter slip). */
  cue: string;
  /** The user's words, verbatim: text.slice(start, end). */
  quote: string;
  start: number;
  end: number;
  /** The sentence holding it, verbatim (userClauseOf; at most ACTIVITY_REASON_MAX characters, "…" where cut). */
  clause: string;
  /** Revision 5 (contracts §23.6; lane 3): the other goal whose words hold this cue; absent or null: this goal's. */
  goal?: { roadmapId: string; slot: GoalSlot | null } | null;
}

/** constraintCuesOf's answer. `hasCue` is true when any cue matched or the text can't be read. */
export interface CueReading {
  hasCue: boolean;
  cues: CueSpan[];
  /**
   * Text the app can't read as English: another script, mostly accented
   * letters, a symbol such as an emoji, or words none of which is English
   * once shared loan words and units are set aside (CUE_LOAN_WORDS: "Correr
   * 10K", "Einen Marathon laufen"; in the notes, ≥ CUE_LANGUAGE_MIN_WORDS
   * such words). It counts as a cue.
   */
  unparseable: boolean;
}

/**
 * The cue vocabularies (normalised: lower case, no accents, no apostrophes —
 * "can't" is "cant"; words separated by one space and matched as a run of
 * whole words, a hyphen splitting words, so "no go" matches "no-go"; a final
 * "*" matches any word that starts with it). High recall by design: a false
 * cue costs one tap on the confirm card, a missed one could cost an injury.
 * Each list is exported so the bar can measure and ablate it.
 */
export const CUE_INJURY_WORDS: readonly string[] = [
  "injur*", "tore", "torn", "tear", "sprain*", "strain*", "fractur*", "broke", "broken", "dislocat*", "ruptur*",
  "pulled a", "pulled my", "pulled muscle", "tweaked", "surger*", "surgeon*", "surgical", "operation", "operations", "operated",
  "post op", "postop", "replacement", "replaced", "rehab*", "recover*", "heal", "heals", "healing", "healed", "concuss*",
  "whiplash", "splint*", "tendon*", "tendin*", "bursitis", "fasciitis", "plantar", "sciatica", "hernia*", "herniat*",
  "slipped disc", "bulging disc", "scar", "scars", "scarring", "stitches", "in a cast", "a cast", "crutch*", "brace", "sling",
  "wheelchair*", "amputat*", "amputee*", "prosthe*", "limp", "limping", "bruise*", "bruising", "wound", "wounds", "blister*",
  "rolled my", "twisted my", "turned my ankle", "gave out", "gives out", "give out", "giving out", "buckl*", "flare up",
  "flare ups", "flared up", "flareup*", "pinched", "nerve", "nerves", "osteo*", "arthrit*", "arthros*", "wear and tear",
  "degenerat*", "prolaps*", "pelvic floor", "diastasis", "c section", "caesarean", "cesarean", "accident", "accidents",
  // Operations, falls and breaks the aim names ("after ACL reconstruction", "after breaking my leg", "after a fall").
  "reconstruction", "reconstructions", "reconstructive", "reconstructed", "breaking my", "break my", "broke my", "a fall",
  "had a fall", "falls", "fell over", "fell off", "fell down", "keyhole",
  // Craft and voice: the hands, the voice, the ears (a CRAFT plan asks on these).
  "rsi", "repetitive strain", "carpal tunnel", "trigger finger", "tennis elbow", "golfers elbow", "dystonia", "nodule*",
  "hoarse*", "lost my voice", "voice loss", "tinnitus", "hearing loss",
  // The follow-up round: more of the hands and the voice ("Dupuytren's", "a ganglion on my wrist", "vocal polyps", "eyestrain").
  "trigger thumb", "mallet finger", "quervain*", "dupuytren*", "ganglion", "cyst", "cysts", "polyp", "polyps", "eyestrain",
  "lose my voice", "losing my voice",
];
export const CUE_PAIN_WORDS: readonly string[] = [
  "pain", "pains", "painful", "painfully", "ache", "aches", "aching", "achy", "achey", "sore", "soreness", "hurt", "hurts",
  "hurting", "ouch", "agony", "agonising", "agonizing", "tender", "tenderness", "stiff", "stiffness", "cramp*", "spasm*",
  "swell", "swells", "swelling", "swollen", "inflam*", "numb", "numbness", "tingl*", "throb*", "twinge*", "discomfort",
  "uncomfortable", "flare", "flares", "irritat*", "aggravat*", "bother", "bothers", "bothering", "bothered", "kills my",
  "killing my", "kill my", "kills me", "killing me", "niggl*", "acting up", "plays up", "playing up", "play up", "played up",
  "gives me grief", "giving me grief", "earache*", "backache*",
];
export const CUE_HEALTH_WORDS: readonly string[] = [
  "pregnan*", "expecting", "trimester", "postpartum", "post partum", "postnatal", "post natal", "prenatal", "antenatal",
  "gave birth", "giving birth", "birth", "newborn", "had a baby", "breastfeed*", "breast feeding", "miscarr*", "ivf",
  "fertility", "menopaus*", "perimenopaus*", "endometriosis", "pcos", "heart", "cardiac", "cardiolog*", "arrhythmi*", "afib",
  "a fib", "palpitation*", "angina", "blood pressure", "hypertension", "hypotension", "high bp", "low bp", "cholesterol",
  "a stroke", "had a stroke", "stroke survivor", "mini stroke", "since the stroke", "after the stroke", "his stroke",
  "her stroke", "their stroke", "mums stroke", "moms stroke", "dads stroke", "pacemaker", "stent",
  "stents", "bypass", "transplant*", "dialysis", "kidney", "kidneys", "liver", "lung", "lungs", "copd", "asthma*", "inhaler*",
  "breathless*", "short of breath", "shortness of breath", "breathing problems", "breathing issues", "trouble breathing",
  "diabet*", "insulin", "blood sugar", "epilep*", "seizure*", "faint*", "dizz*", "vertigo", "lightheaded*", "light headed",
  "migraine*", "headache*", "cancer", "tumor", "tumors", "tumour", "tumours", "chemo*", "radiotherap*", "radiation",
  "oncolog*", "leukemia", "leukaemia", "lymphoma", "covid", "long covid", "flu", "fever", "infection*", "virus", "illness*",
  "ill", "sick", "sickness", "unwell", "disease*", "disorder*", "syndrome*", "condition", "conditions", "chronic*",
  "fatigue*", "exhaust*", "tired", "no energy", "low energy", "anemi*", "anaemi*", "thyroid", "autoimmun*", "lupus", "crohn*",
  "colitis", "ibs", "coeliac", "celiac", "allerg*", "anaphyla*", "eating disorder", "anorexi*", "bulimi*", "binge*",
  "self harm", "depress*", "anxiety", "anxious", "panic*", "ptsd", "trauma*", "mental health", "burnout", "burned out",
  "burnt out", "burn out", "bipolar", "schizo*", "dementia", "alzheimer*", "parkinson*", "multiple sclerosis",
  "motor neurone", "cerebral palsy", "disab*", "impair*", "blind", "deaf", "hard of hearing", "mobility issues",
  "limited mobility", "reduced mobility", "frail*", "elderly", "old age", "my age", "years old", "aged", "senior", "seniors",
  "overweight", "obese", "obesity", "bmi", "medic*", "meds", "pill", "pills", "prescri*", "steroid*", "blood thinner*",
  "anticoagul*", "beta blocker*", "doctor*", "doc", "docs", "dr", "gp", "physician*", "specialist*", "consultant", "nurse*",
  "midwife", "midwives", "physio*", "physiotherap*", "physical therap*", "chiro*", "therapist*", "therapy", "counsel*",
  "psychiatr*", "psycholog*", "hospital*", "clinic*", "appointment*", "diagnos*", "symptom*", "health", "cleared", "bed rest",
  "light duties", "light duty", "sick leave", "off work", "off sick", "weight bearing", "medically", "care home", "nursing home",
  "hospice", "palliative", "end of life",
  // Conditions and events an aim names with no pain word ("post-stroke", "having twins", "despite fibromyalgia").
  "post stroke", "my stroke", "post covid", "post viral", "postviral", "twins", "triplets", "having a baby", "dvt", "thrombos*",
  "embolism", "blood clot*", "clot", "clots", "pneumon*", "fibromyalg*", "scolios*", "kyphos*", "stenos*", "spondyl*",
  "sclerosis", "cirrhos*", "hypermobil*", "ehlers", "danlos", "cfs", "chronic fatigue", "crps", "tbi", "brain injury",
  "neuropath*", "retina*", "glaucoma", "cataract*", "haemophil*", "hemophil*", "sickle cell", "gout", "rheumat*", "fibroid*",
  "prostat*", "stoma", "catheter*", "oxygen", "walking frame", "zimmer", "mobility scooter", "hearing aid*", "bppv", "svt",
  "ckd", "chf", "hiv", "mnd",
  // The follow-up round: conditions a craft names with no pain word, for the voice, the ears, the eyes and the hands
  // ("Acid reflux affects my singing.", "Sing with GERD", "Paint with a tremor", "Sew with poor eyesight").
  "reflux", "gerd", "lpr", "heartburn", "post nasal drip", "postnasal drip", "sinus", "sinuses", "dysphoni*", "tmj", "tmd",
  "hyperacusis", "meniere*", "ringing in my ears", "ringing in the ears", "ringing ears", "ears ring", "ears ringing",
  "ear ringing", "noise sensitivity", "sound sensitivity", "sensitive to noise", "sensitive to sound", "hearing damage",
  "hearing problem*", "hearing issue*", "poor hearing", "bad hearing", "dry eyes", "dry eye", "floaters", "astigmatism",
  "short sighted", "shortsighted", "near sighted", "nearsighted", "long sighted", "longsighted", "far sighted", "farsighted",
  "macular", "photophobi*", "light sensitivity", "sensitive to light", "blurred vision", "blurry vision", "double vision",
  "low vision", "poor vision", "bad vision", "vision loss", "vision problem*", "poor eyesight", "bad eyesight",
  "failing eyesight", "weak eyesight", "eyesight problem*", "tremor*", "trembl*", "shaky hands", "shaky hand", "hands shake",
  "raynaud*", "chilblain*", "eczema", "psoriasis", "paralys*", "paralyz*", "palsy", "ataxia", "dyspraxi*", "weak grip",
  "poor grip", "bad posture", "poor posture", "posture problem*", "stage fright",
];
export const CUE_AVOID_WORDS: readonly string[] = [
  "no", "not", "never", "none", "nothing", "nor", "neither", "avoid*", "without", "cant", "cannot", "can not", "couldnt",
  "dont", "doesnt", "didnt", "wont", "wouldnt", "shouldnt", "mustnt", "musnt", "arent", "isnt", "aint", "havent", "hasnt",
  "unable", "stop", "stopped", "quit", "skip", "skips", "skipped", "limit*", "restrict*", "careful*", "caution*", "gentle", "gently", "gentler",
  "easy on", "take it easy", "taking it easy", "go easy", "nothing heavy", "low impact", "high impact", "impact", "too much",
  "too hard", "too heavy", "too intense", "too far", "too fast", "too long", "too often", "too tired", "too old", "too weak",
  "too risky", "too painful", "risk", "risks", "risky", "unsafe", "danger*", "forbid*", "banned", "ban", "off limits",
  "out of the question", "is out", "are out", "hate", "hates", "dislike*", "afraid", "scared", "fear*", "nervous", "worr*",
  "rather not", "prefer not", "stay away", "steer clear", "keep away", "away from", "allowed", "permitted", "supposed to",
  "except", "instead of", "struggl*", "difficult*", "hard for me", "barely", "hardly", "reduce*", "cut back", "cut down",
  "back off", "ease off", "ease back", "ease into", "build up slowly", "despite", "in spite of",
  "ruled out", "rule out", "bad idea", "bad for me", "bad for my", "is a problem", "are a problem", "problem for me", "kill me", "hard on", "tough on", "rough on",
  "brutal on", "wreck*",
];
/**
 * Read only in the Constraints box and the notes (never the aim, where they
 * are the aim's own words: "Bench press …", "only …"): limits and the
 * joint-type body parts, bare ("knee", "lower back").
 */
export const CUE_CONSTRAINT_ONLY_WORDS: readonly string[] = ["off", "only", "just", "max", "maximum", "at most", "no more than", "light", "easy", "slowly"];
/** Joint-type body parts: bare in the constraints and notes; after "my", "her", "Mum's" … anywhere; after an adjective anywhere; before a CUE_JOINT_PROCEDURES word anywhere ("knee scope"). */
export const CUE_BODY_PARTS: readonly string[] = [
  "knee", "knees", "kneecap", "kneecaps", "patella", "patellar", "ankle", "ankles", "hip", "hips", "shoulder", "shoulders",
  "wrist", "wrists", "elbow", "elbows", "spine", "spinal", "vertebra", "vertebrae", "disc", "discs", "disk", "disks", "acl",
  "mcl", "pcl", "lcl", "meniscus", "menisci", "achilles", "hamstring", "hamstrings", "groin", "rotator cuff", "rotator",
  "tendon", "tendons", "ligament", "ligaments", "cartilage", "pelvic", "pelvis", "sciatic", "joint", "joints", "neck",
  "lower back", "upper back", "tailbone", "coccyx", "sacroiliac", "si joint", "it band", "itb", "shin", "shins", "heel",
  "heels", "arch", "bunion", "bunions", "femur", "tibia", "fibula", "labrum", "labral", "collarbone", "collarbones",
  "clavicle", "rib", "ribs", "sternum", "scapula", "cervical", "lumbar", "thoracic",
];
/**
 * Body parts that name an injury site rather than an exercise ("ACL",
 * "rotator cuff", "labrum", "Achilles"): a cue bare anywhere, the aim
 * included ("Return to sport after ACL", "Run 10K after ACL reconstruction").
 * The everyday joints ("hip", "knee") stay bare in the constraints and notes
 * only, where the aim uses them for the exercise ("Hip thrust 100kg").
 */
export const CUE_BODY_PARTS_MEDICAL: readonly string[] = [
  "acl", "mcl", "pcl", "lcl", "meniscus", "menisci", "achilles", "rotator cuff", "labrum", "labral", "patellar", "cartilage",
  "ligament", "ligaments", "tendon", "tendons", "vertebra", "vertebrae", "spinal", "coccyx", "tailbone", "sacroiliac",
  "si joint", "sciatic", "cervical", "lumbar", "thoracic", "pelvic", "collarbone", "collarbones", "clavicle",
];
/** After a joint-type part, these name an operation or a break ("knee scope", "ankle fusion", "collarbone break"): a cue anywhere, the aim included. */
export const CUE_JOINT_PROCEDURES: readonly string[] = [
  "scope", "scoped", "repair", "repaired", "fusion", "fused", "reconstruction", "rebuild", "rebuilt", "op", "ops", "break",
  "breaks", "broken", "replacement", "replaced", "surgery", "operation",
];
/** Other body parts: a cue only after an adjective ("bad back", "weak legs") anywhere, or after "my", "her", "Mum's" … in the constraints and notes. */
export const CUE_BODY_PARTS_MORE: readonly string[] = [
  "back", "leg", "legs", "arm", "arms", "foot", "feet", "hand", "hands", "chest", "head", "toe", "toes", "finger", "fingers",
  "thumb", "thumbs", "calf", "calves", "quad", "quads", "glute", "glutes", "core", "abs", "stomach", "belly", "tummy", "eye",
  "eyes", "ear", "ears", "muscle", "muscles", "bone", "bones", "body", "jaw", "skin", "retina", "voice", "vocal", "throat",
  "lung", "lungs", "heart", "forearm", "forearms", "fingertip", "fingertips", "knuckle", "knuckles", "lip", "lips", "mouth",
  "larynx",
];
/** Adjectives that make a following body part a cue (up to two words between: "bad left knee", "sore lower back"). */
export const CUE_BODY_ADJECTIVES: readonly string[] = [
  "bad", "weak", "dodgy", "gammy", "wonky", "bum", "trick", "creaky", "crook", "stiff", "sore", "tight", "injured", "broken",
  "twisted", "rolled", "pulled", "tweaked", "torn", "busted", "blown", "wrecked", "fragile", "delicate", "unstable",
  "arthritic", "swollen", "problem", "problematic", "troublesome", "damaged", "hurt", "painful", "aching", "achy", "numb",
  "locked", "frozen", "messed", "bruised", "inflamed", "sprained", "strained", "fractured", "dislocated", "replaced", "operated",
  "detached", "herniated", "bulging", "slipped", "fused", "reconstructed", "repaired", "rebuilt", "artificial",
];
/** Whose body part ("my knee", "her hip", "Mum's back"). */
export const CUE_POSSESSIVES: readonly string[] = ["my", "his", "her", "their", "our", "mums", "moms", "dads", "mothers", "fathers", "grandmas", "grandpas", "nans", "wifes", "husbands", "partners"];
/** Words between an adjective or possessive and its body part. */
export const CUE_BODY_FILLERS: readonly string[] = ["my", "his", "her", "their", "our", "left", "right", "lower", "upper", "both", "the", "a", "an", "up", "bad", "weak"];
/** A body part followed by one of these is a cue anywhere ("back problems", "leg issues", "ear damage"). */
export const CUE_PART_TROUBLE: readonly string[] = ["problem", "problems", "issue", "issues", "trouble", "troubles", "niggle", "niggles", "damage"];
/**
 * Pain, injury, health and limit words in other languages, written without
 * accents (Spanish, Portuguese, French, Italian, German, Dutch, Indonesian
 * and Malay, Vietnamese, Tagalog, Turkish, Polish). Text in another script
 * is unparseable whatever it says; these catch a short Latin-script text the
 * language test can't tell from English ("me duele la rodilla").
 */
export const CUE_FOREIGN_WORDS: readonly string[] = [
  // Spanish
  "dolor", "dolores", "duele", "duelen", "dolorido", "lesion", "lesiones", "lesionado", "lesionada", "herida", "herido",
  "lastimado", "lastimada", "rodilla", "rodillas", "espalda", "tobillo", "cadera", "hombro", "muneca", "codo", "embarazada",
  "embarazo", "medico", "medica", "cirugia", "operacion", "enfermedad", "enfermo", "enferma", "evitar", "no puedo", "nada de",
  "prohibido", "cansado", "cansada", "mareo",
  // Portuguese
  "dor", "dores", "doi", "doem", "lesao", "lesoes", "machucado", "joelho", "joelhos", "costas", "tornozelo", "quadril", "ombro",
  "gravida", "gravidez", "cirurgia", "doenca", "doente", "nao posso", "nao", "proibido",
  // French
  "douleur", "douleurs", "mal au", "mal a", "mal aux", "blessure", "blesse", "blessee", "genou", "genoux", "cheville", "hanche",
  "epaule", "poignet", "coude", "enceinte", "grossesse", "chirurgie", "medecin", "malade", "maladie", "eviter", "pas de",
  "ne peux", "interdit",
  // Italian
  "dolore", "dolori", "fa male", "infortunio", "ferito", "ginocchio", "ginocchia", "schiena", "caviglia", "anca", "spalla",
  "polso", "gomito", "incinta", "gravidanza", "chirurgia", "malattia", "malato", "evitare", "non posso", "vietato",
  // German
  "schmerz", "schmerzen", "verletzung", "verletzt", "knie", "rucken", "knochel", "hufte", "schulter", "handgelenk", "ellbogen",
  "schwanger", "schwangerschaft", "arzt", "arztin", "krank", "krankheit", "vermeiden", "kein", "keine", "nicht", "verboten",
  // Dutch
  "pijn", "geblesseerd", "enkel", "heup", "schouder", "zwanger", "dokter", "ziek", "ziekte", "vermijden", "geen", "niet",
  // Indonesian and Malay
  "sakit", "nyeri", "cedera", "luka", "lutut", "punggung", "pinggang", "bahu", "hamil", "operasi", "hindari", "tidak", "jangan",
  // Vietnamese
  "dau", "chan thuong", "bi thuong", "dau goi", "mang thai", "co thai", "bac si", "phau thuat", "benh", "tranh", "khong",
  // Tagalog
  "masakit", "tuhod", "likod", "buntis", "bawal", "hindi",
  // Turkish
  "agri", "sakatlik", "sakat", "hamile", "doktor", "ameliyat", "hasta", "yasak",
  // Polish
  "bol", "boli", "kontuzja", "uraz", "kolano", "kolana", "plecy", "ciaza", "lekarz", "operacja", "chory", "choroba", "unikac", "nie",
  // Swedish, Norwegian, Danish, Finnish
  "smert*", "smarta", "ont i", "skade*", "skada*", "gravid", "kipu*", "kipea", "polvi*", "loukkaantu*", "raskaana",
];
/** Pain and injury roots inside a compound word ("Knieschmerzen", "rugpijn", "polvikipu"): a cue wherever they sit in a word. */
export const CUE_FOREIGN_INFIXES: readonly string[] = ["schmerz", "verletz", "pijn", "smert", "kipu"];
/**
 * Goal phrasings that hold a cue word but name no limit: their words raise
 * no cue ("Swim 1 km without stopping", "heart rate zone 2", "recovery runs",
 * "medicine ball"). Matched like the vocabularies.
 */
export const CUE_BENIGN_PHRASES: readonly string[] = [
  "without stopping", "without stops", "without a stop", "without a break", "without breaks", "without walking",
  "without a walk break", "without walk breaks", "without walking breaks", "without resting", "without rest", "without a rest",
  "without pausing", "without a pause", "no stopping", "non stop", "heart rate*", "heartrate*", "recovery run*", "recovery day*",
  "recovery week*", "recovery session*", "active recovery", "medicine ball*", "binge watch*", "no matter",
];
/**
 * A one-letter slip of one of these (a letter missed, added, changed or two
 * swapped: "injry", "surgury", "pregant") is a cue, in its word's class.
 * Only words of 6 or more letters, against words of 5 or more.
 */
export const CUE_FUZZY_WORDS: readonly string[] = [
  "injury", "injured", "injuries", "surgery", "surgeon", "fracture", "fractured", "sprain", "sprained", "painful", "swollen",
  "swelling", "inflamed", "pregnant", "pregnancy", "postpartum", "arthritis", "tendonitis", "tendinitis", "physio",
  "physiotherapist", "doctor", "asthma", "diabetes", "diabetic", "hernia", "sciatica", "concussion", "dislocated", "ligament",
  "cartilage", "meniscus", "achilles", "hamstring", "shoulder", "migraine", "epilepsy", "seizure", "condition", "recovering",
  "recovery", "operation", "hospital", "medication", "dementia", "disability", "disabled", "chronic", "illness", "fatigue",
  "tinnitus",
];
/** Real words one slip from a CUE_FUZZY_WORDS entry that are not a cue ("Spain" is not "sprain", "meditation" not "medication"). */
export const CUE_FUZZY_GUARD: readonly string[] = [
  "spain", "spelling", "dwelling", "selling", "smelling", "shelling", "swilling", "meditation", "meditations", "dedication",
  "sturgeon", "insured", "inflated", "concession", "concessions",
];
/** Entries never matched from a contraction ("I'll" is not "ill"). */
export const CUE_APOSTROPHE_GUARD: readonly string[] = ["ill"];
/**
 * Condition names written as capitals, matched only as written ("despite
 * MS", "I have POTS", "a TIA last year"): in lower case they are everyday
 * words ("ms", "pots", "als"). Not read in a text that is mostly capitals.
 */
export const CUE_ACRONYMS: readonly string[] = ["MS", "POTS", "TIA", "ALS", "RA", "OA", "EDS", "HEDS", "CRPS", "RSI", "TMJ", "TBI", "DVT", "COPD", "IBS", "PCOS", "CFS", "BPPV", "SVT", "MND", "GORD"];
/**
 * Word endings that name an operation or a condition ("meniscectomy",
 * "arthroscopy", "angioplasty", "bursitis", "fibromyalgia", "neuropathy"): a
 * word of at least three more letters ending in one is a cue, unless it is
 * in CUE_SUFFIX_GUARD.
 */
export const CUE_MEDICAL_SUFFIXES: readonly string[] = ["ectomy", "ectomies", "otomy", "ostomy", "oscopy", "plasty", "itis", "algia", "opathy"];
/** Everyday words with those endings ("dichotomy", "nostalgia", "microscopy"). */
export const CUE_SUFFIX_GUARD: readonly string[] = ["dichotomy", "dichotomies", "nostalgia", "microscopy", "spectroscopy", "stereoscopy", "kaleidoscopy"];
/**
 * Words shared by many languages (sports, units, instruments, brands):
 * they don't make a text English for the word test, so "Einen Marathon
 * laufen" and "Hardlopen 10 km" read as unparseable. A text of these words
 * alone ("Marathon", "Yoga") is not unparseable. A word that starts with a
 * digit ("10K", "5km", "100kg") is a number and counts for neither side.
 */
export const CUE_LOAN_WORDS: readonly string[] = [
  "marathon", "halfmarathon", "km", "kms", "k", "kg", "kgs", "kilo", "kilos", "lb", "lbs", "m", "mi", "min", "mins", "h", "hr",
  "hrs", "x", "pb", "pr", "vo2", "vo2max", "hiit", "crossfit", "hyrox", "parkrun", "yoga", "pilates", "fitness", "gym",
  "training", "triathlon", "ironman", "ultra", "trail", "sprint", "cardio", "tennis", "golf", "rugby", "football", "basketball",
  "volleyball", "badminton", "squash", "hockey", "karate", "judo", "bjj", "jiu", "jitsu", "boxing", "kickboxing", "taekwondo",
  "muay", "thai", "surf", "surfing", "ski", "skiing", "snowboard", "snowboarding", "parkour", "zumba", "spinning", "jogging",
  "online", "ok", "app", "piano", "cello", "ukulele", "jazz", "rock", "pop", "blues", "salsa", "tango", "ballet", "crochet",
  "origami", "karaoke", "manga", "anime", "sudoku", "ielts", "toefl", "dele", "delf", "jlpt", "hsk", "topik",
];
/**
 * English content words common in BODY and CARE aims and constraints: with
 * ENGLISH_FUNCTION_WORDS, a text holding one of these is not unparseable by
 * the word test ("Sub 3 hour marathon PB" is English).
 */
export const CUE_ENGLISH_WORDS: readonly string[] = [
  "run", "runs", "running", "jog", "jogging", "walk", "walks", "walking", "hike", "hiking", "swim", "swimming", "bike", "biking",
  "cycle", "cycling", "ride", "row", "rowing", "lift", "lifting", "squat", "squats", "bench", "press", "deadlift", "pull", "push",
  "ups", "plank", "yoga", "pilates", "stretch", "stretching", "climb", "climbing", "dance", "dancing", "train", "training",
  "gym", "weights", "workout", "workouts", "exercise", "fit", "fitter", "fitness", "strong", "stronger", "strength", "lose",
  "gain", "weight", "kg", "kgs", "lb", "lbs", "km", "mile", "miles", "marathon", "half", "race", "sub", "under", "hour", "hours",
  "minute", "minutes", "min", "mins", "time", "times", "day", "days", "daily", "week", "weeks", "weekly", "month", "months",
  "year", "years", "morning", "mornings", "evening", "evenings", "night", "nights", "weekend", "weekends", "weekday",
  "weekdays", "monday", "mondays", "tuesday", "tuesdays", "wednesday", "wednesdays", "thursday", "thursdays", "friday",
  "fridays", "saturday", "saturdays", "sunday", "sundays", "every", "each", "per", "twice", "once", "one", "two", "three",
  "four", "five", "pb", "pr", "personal", "best", "care", "visit", "visits", "call", "calls", "mum", "mom", "dad", "mother",
  "father", "grandma", "grandpa", "nan", "help", "support", "home", "family", "kids", "children", "work", "job", "school",
  "after", "before", "until", "about", "more", "most", "very", "really", "also", "get", "keep", "make", "go", "able", "want",
  "need", "like", "love", "prefer", "plan", "goal", "steps", "step", "sleep", "eat", "eating", "diet", "water", "sugar",
  "alcohol", "smoking", "drink", "drinking", "less", "fewer", "short", "long", "fast", "slow", "pace", "distance", "sessions",
  "session", "class", "classes", "coach", "team", "club", "outdoors", "indoors", "early", "late", "only", "just", "thrust",
  "thrusts", "curl", "curls", "lunge", "lunges", "dip", "dips", "chin", "chins", "handstand", "splits", "sprint", "sprints",
  "jump", "jumps", "rope", "skipping", "tennis", "football", "soccer", "basketball", "golf", "boxing", "martial", "karate",
  "judo", "bjj", "surf", "surfing", "ski", "skiing", "skate", "skating", "triathlon", "ironman", "ultra", "trail", "mountain",
  "summit", "peak", "squash", "badminton", "volleyball", "netball", "rugby", "cricket", "baseball", "paddle", "kayak", "canoe",
  "sail", "sailing", "spin", "crossfit", "hyrox", "parkrun", "couch", "metres", "meters", "bodyweight", "test", "exam", "pass",
  "finish", "complete", "learn", "first", "full", "new", "back", "up", "down", "off", "out", "without",
  // Body aims of one or two words ("Calisthenics", "Kettlebells") and craft aims ("Learn guitar", "Pottery").
  "calisthenics", "kettlebell", "kettlebells", "flexibility", "mobility", "posture", "balance", "stamina", "endurance",
  "pushup", "pushups", "pullup", "pullups", "situp", "situps", "burpee", "burpees", "abs", "toes", "hips", "glutes", "muscle",
  "play", "playing", "practice", "practise", "guitar", "drums", "drum", "violin", "bass", "flute", "trumpet", "saxophone",
  "sax", "harp", "sing", "singing", "voice", "vocals", "song", "songs", "music", "piece", "pieces", "scales", "choir", "band",
  "orchestra", "stage", "perform", "recital", "concert", "audition", "paint", "painting", "draw", "drawing", "sketch",
  "sketching", "art", "craft", "crafts", "pottery", "ceramics", "calligraphy", "lettering", "photography", "photo", "photos",
  "film", "video", "write", "writing", "poetry", "poem", "poems", "novel", "story", "stories", "book", "books", "read",
  "reading", "cook", "cooking", "bake", "baking", "bread", "garden", "gardening", "sew", "sewing", "knit", "knitting",
  "woodwork", "woodworking", "carpentry", "chess", "code", "coding", "programming", "grade", "level", "hand", "hands",
];
/**
 * The detector's word test. A word is English when it is in
 * ENGLISH_FUNCTION_WORDS, CUE_ENGLISH_WORDS or an English cue vocabulary
 * (the foreign words excluded) or starts with one of their stems, or has
 * CUE_ENGLISH_ING_MIN letters or more and ends in "ing" ("Powerlifting",
 * "Bouldering"; a shorter "-ing" word may be another language's: "pusing").
 * CUE_LOAN_WORDS and numbers count for neither side. The aim and the
 * constraints are
 * unparseable when they hold any other word and none of them is English
 * (the lead's rule: a short aim in another language, "Correr 10K", "Lari
 * 10K", asks); a note (an exam's name, an outline line: names and terms
 * that are naturally short) only with at least this many such words (one
 * fewer than LANGUAGE_MIN_WORDS, the aim's language test: recall first).
 */
export const CUE_LANGUAGE_MIN_WORDS = 3;
/** A word of at least this many letters ending in "ing" reads as English for the word test. */
export const CUE_ENGLISH_ING_MIN = 8;
/** Text longer than this is read up to it and counts as unparseable (no box allows it; a cap on work). */
export const CUE_TEXT_MAX = 4000;
/** The confirm card quotes at most this many of the user's sentences. */
export const CUE_QUOTES_MAX = 3;
/** A stored reason, and a quoted sentence, hold at most this many characters ("…" where cut). */
export const ACTIVITY_REASON_MAX = 120;

// ── The detector ──

const CUE_FOLD: Readonly<Record<string, string>> = { "đ": "d", "ø": "o", "ł": "l", "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i", "ð": "d", "þ": "th" };
/** Lower case, accents and apostrophes removed ("Can’t" → "cant", "Rücken" → "rucken", "đau" → "dau"). */
const cueNorm = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[đøłßæœıðþ]/g, (ch) => CUE_FOLD[ch] ?? ch)
    .replace(/['’ʼ`´]/g, "");

interface CueToken {
  n: string;
  /** The token as written (CUE_ACRONYMS are matched on it). */
  raw: string;
  start: number;
  end: number;
  apos: boolean;
}
const CUE_TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:['’ʼ][\p{L}\p{M}]+)*/gu;
function cueTokens(text: string): CueToken[] {
  const out: CueToken[] = [];
  for (const m of text.matchAll(CUE_TOKEN_RE)) {
    const start = m.index ?? 0;
    out.push({ n: cueNorm(m[0]), raw: m[0], start, end: start + m[0].length, apos: /['’ʼ]/.test(m[0]) });
  }
  return out;
}

interface CueEntry {
  toks: string[];
  prefix: boolean;
  cls: CueClass;
  cue: string;
  constraintOnly: boolean;
}
const compileCues = (list: readonly string[], cls: CueClass, constraintOnly = false): CueEntry[] =>
  list.map((raw) => {
    const prefix = raw.endsWith("*");
    const toks = cueNorm(prefix ? raw.slice(0, -1) : raw)
      .split(/[\s-]+/)
      .filter(Boolean);
    return { toks, prefix, cls, cue: raw, constraintOnly };
  });
const CUE_ENTRIES: readonly CueEntry[] = [
  ...compileCues(CUE_INJURY_WORDS, "INJURY"),
  ...compileCues(CUE_PAIN_WORDS, "PAIN"),
  ...compileCues(CUE_HEALTH_WORDS, "HEALTH"),
  ...compileCues(CUE_AVOID_WORDS, "AVOID"),
  ...compileCues(CUE_FOREIGN_WORDS, "LANGUAGE"),
  ...compileCues(CUE_CONSTRAINT_ONLY_WORDS, "AVOID", true),
  ...compileCues(CUE_BODY_PARTS, "BODY_PART", true),
  ...compileCues(CUE_BODY_PARTS_MEDICAL, "BODY_PART"),
];
const BENIGN_ENTRIES: readonly CueEntry[] = compileCues(CUE_BENIGN_PHRASES, "AVOID");
const APOS_GUARD = new Set(CUE_APOSTROPHE_GUARD);
const FUZZY_GUARD = new Set(CUE_FUZZY_GUARD);
const PART_SET = new Set(CUE_BODY_PARTS.filter((p) => !p.includes(" ")));
const PART_ALL_SET = new Set([...PART_SET, ...CUE_BODY_PARTS_MORE]);
const ADJ_SET = new Set(CUE_BODY_ADJECTIVES);
const POSSESSIVE_SET = new Set(CUE_POSSESSIVES);
const FILLER_SET = new Set(CUE_BODY_FILLERS);
const TROUBLE_SET = new Set(CUE_PART_TROUBLE);
const PROCEDURE_SET = new Set(CUE_JOINT_PROCEDURES);
const ACRONYM_SET = new Set(CUE_ACRONYMS);
const SUFFIX_GUARD = new Set(CUE_SUFFIX_GUARD);
const LOAN_SET = new Set(CUE_LOAN_WORDS.map(cueNorm));
// Every English vocabulary word counts as English for the word test, beside the function and content words; a
// vocabulary entry with a final "*" counts by its stem ("recover*": "recovery"), a stem of four letters or more.
const ENGLISH_LISTS: readonly (readonly string[])[] = [CUE_INJURY_WORDS, CUE_PAIN_WORDS, CUE_HEALTH_WORDS, CUE_AVOID_WORDS, CUE_CONSTRAINT_ONLY_WORDS, CUE_BODY_PARTS, CUE_BODY_PARTS_MEDICAL, CUE_BODY_PARTS_MORE, CUE_BODY_ADJECTIVES, CUE_PART_TROUBLE, CUE_JOINT_PROCEDURES, CUE_BENIGN_PHRASES];
const ENGLISH_SET = new Set([...ENGLISH_FUNCTION_WORDS, ...CUE_ENGLISH_WORDS, ...ENGLISH_LISTS.flatMap((l) => l.flatMap((e) => cueNorm(e.replace(/\*$/, "")).split(/[\s-]+/)))]);
const ENGLISH_STEMS: readonly string[] = ENGLISH_LISTS.flatMap((l) => l.filter((e) => e.endsWith("*") && !/[\s-]/.test(e)).map((e) => cueNorm(e.slice(0, -1)))).filter((x) => x.length >= 4);
/** The word test's English: a known English word or stem, or a long "-ing" word ("Powerlifting"). */
const englishWord = (w: string): boolean => ENGLISH_SET.has(w) || ENGLISH_STEMS.some((x) => w.startsWith(x)) || (w.length >= CUE_ENGLISH_ING_MIN && w.endsWith("ing") && /^[a-z]+$/.test(w));
const INFIXES: readonly string[] = CUE_FOREIGN_INFIXES.map(cueNorm);

function entryAt(e: CueEntry, toks: readonly CueToken[], i: number): boolean {
  const k = e.toks.length;
  if (k === 0 || i + k > toks.length) return false;
  for (let j = 0; j < k; j++) {
    const t = toks[i + j];
    const want = e.toks[j];
    const last = j === k - 1;
    if (last && e.prefix ? !t.n.startsWith(want) : t.n !== want) return false;
    if (k === 1 && t.apos && APOS_GUARD.has(want)) return false;
  }
  return true;
}

/** Optimal-string-alignment distance, stopping early above 1 (a cap on work: only "is it one slip" is asked). */
function oneSlip(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  const n = a.length;
  const m = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > 1) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[m] === 1;
}

/** The class a fuzzy word is matched in: the first vocabulary (injury, pain, health) that holds it exactly. */
const FUZZY: readonly { w: string; cls: CueClass }[] = CUE_FUZZY_WORDS.map((w) => {
  const tok: CueToken[] = [{ n: w, raw: w, start: 0, end: w.length, apos: false }];
  const hit = CUE_ENTRIES.find((e) => (e.cls === "INJURY" || e.cls === "PAIN" || e.cls === "HEALTH") && entryAt(e, tok, 0));
  return { w, cls: hit?.cls ?? "HEALTH" };
});

const CLAUSE_BREAK = /[.!?;\n\r。！？；]/;

/** The sentence of `text` around [start, end), verbatim and trimmed; at most `max` characters, cut at word edges with "…". */
function clauseAt(text: string, start: number, end: number, max: number): string {
  let a = start;
  while (a > 0 && !CLAUSE_BREAK.test(text[a - 1])) a--;
  let b = end;
  while (b < text.length && !CLAUSE_BREAK.test(text[b])) b++;
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  if (b - a <= max) return text.slice(a, b);
  // Cut to a window of max - 2 around the span, so the "…" on each side keeps it within max.
  const room = Math.max(1, max - 2);
  const span = Math.max(0, end - start);
  let ws = Math.max(a, start - Math.floor(Math.max(0, room - span) / 2));
  let we = Math.min(b, ws + room);
  if (we - ws < room) ws = Math.max(a, we - room);
  if (we < end) {
    we = Math.min(b, end);
    ws = Math.max(a, we - room);
  }
  if (ws > a) {
    const sp = text.indexOf(" ", ws);
    if (sp >= 0 && sp < start) ws = sp + 1;
  }
  if (we < b) {
    const sp = text.lastIndexOf(" ", we);
    if (sp > end) we = sp;
  }
  return `${ws > a ? "…" : ""}${text.slice(ws, we).trim()}${we < b ? "…" : ""}`;
}

/**
 * The user's own sentence holding `needle` (case-insensitive; a stem's first
 * four letters at a word start when the word itself isn't there), verbatim,
 * at most `max` characters; "" when the text is empty or holds neither. The
 * confirm card's reason, and a pre-fill's ("no running, it hurts my knee").
 */
export function userClauseOf(text: string | null | undefined, needle: string, max = ACTIVITY_REASON_MAX): string {
  if (typeof text !== "string" || !text.trim() || typeof needle !== "string" || !needle.trim()) return "";
  const lower = text.toLowerCase();
  const n = needle.trim().toLowerCase();
  let at = lower.indexOf(n);
  let len = n.length;
  if (at < 0 && n.length >= 4) {
    const stem = n.slice(0, 4);
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "u");
    const m = re.exec(lower);
    if (m) {
      at = m.index + m[0].length - m[1].length;
      len = m[1].length;
    }
  }
  if (at < 0) return "";
  return clauseAt(text, at, at + len, max);
}

/**
 * The cue detector (contracts §19): pure, high recall, no meaning. Reads
 * `text` as words and reports every cue with the user's own words quoted:
 * the injury, pain, health and avoidance vocabularies and other languages'
 * pain and limit words anywhere; the injury-site parts
 * (CUE_BODY_PARTS_MEDICAL: "ACL", "rotator cuff") bare anywhere; a body
 * part after an adjective ("bad knee") or before a trouble word ("back
 * problems") anywhere; a joint-type part before an operation or a break
 * ("knee scope", "ankle fusion") anywhere; a joint-type body part after
 * "my", "her", "Mum's" … anywhere; a condition written in capitals
 * (CUE_ACRONYMS: "despite MS"); a word with a medical ending
 * (CUE_MEDICAL_SUFFIXES: "meniscectomy", "bursitis"); and, in the
 * constraints and notes only (never the aim), CUE_CONSTRAINT_ONLY_WORDS, the
 * bare joint-type parts and any part after a possessive. A one-letter slip
 * of a CUE_FUZZY_WORDS word counts, and so does a CUE_FOREIGN_INFIXES root
 * inside a compound. A CUE_BENIGN_PHRASES phrase raises nothing. A cue
 * inside a longer one of its class is folded into it ("my bad knee", not
 * also "knee"). Negation is not read: "no injuries" is a cue (a reason to
 * ask, never a verdict). Text the app can't read (CueReading.unparseable)
 * counts as a cue. Never throws; a non-string reads as empty.
 */
export function constraintCuesOf(text: string | null | undefined, source: CueSource = "CONSTRAINTS"): CueReading {
  if (typeof text !== "string" || !text.trim()) return { hasCue: false, cues: [], unparseable: false };
  const t = text.length > CUE_TEXT_MAX ? text.slice(0, CUE_TEXT_MAX) : text;
  const toks = cueTokens(t);
  const freeText = source !== "AIM";
  const benign = new Set<number>();
  for (let i = 0; i < toks.length; i++)
    for (const e of BENIGN_ENTRIES)
      if (entryAt(e, toks, i)) for (let j = 0; j < e.toks.length; j++) benign.add(i + j);
  const found: CueSpan[] = [];
  const covered = new Set<number>();
  const letters = t.match(/\p{L}/gu) ?? [];
  // Capitals are read as an acronym only in a text whose other words aren't mostly capitals ("THROW 10 POTS" is shouting, not a condition).
  const otherLetters = toks.filter((x) => !ACRONYM_SET.has(x.raw)).flatMap((x) => x.raw.match(/\p{L}/gu) ?? []);
  const shouting = otherLetters.length > 0 && otherLetters.filter((ch) => ch !== ch.toLowerCase()).length / otherLetters.length > 0.6;
  // Record tokens i..j as a cue, unless every one of them sits in a benign phrase.
  const push = (cls: CueClass, cue: string, i: number, j: number) => {
    let quiet = true;
    for (let k = i; k <= j; k++) if (!benign.has(k)) quiet = false;
    if (quiet) return;
    const start = toks[i].start;
    const end = toks[j].end;
    if (!found.some((f) => f.start === start && f.end === end && f.cls === cls)) found.push({ source, cls, cue, quote: t.slice(start, end), start, end, clause: clauseAt(t, start, end, ACTIVITY_REASON_MAX) });
    for (let q = i; q <= j; q++) covered.add(q);
  };
  for (let i = 0; i < toks.length; i++) {
    for (const e of CUE_ENTRIES) if ((freeText || !e.constraintOnly) && entryAt(e, toks, i)) push(e.cls, e.cue, i, i + e.toks.length - 1);
    const n = toks[i].n;
    // An adjective before a body part, up to two filler words between ("bad knee", "sore lower back").
    if (ADJ_SET.has(n)) {
      for (let j = i + 1, skipped = 0; j < toks.length && skipped <= 2; j++) {
        if (PART_ALL_SET.has(toks[j].n)) {
          push("BODY_PART", `${n} + ${toks[j].n}`, i, j);
          break;
        }
        if (!FILLER_SET.has(toks[j].n)) break;
        skipped++;
      }
    }
    // Whose body part ("my knee"; in the constraints and notes any part, "my back").
    if (POSSESSIVE_SET.has(n)) {
      for (let j = i + 1, skipped = 0; j < toks.length && skipped <= 1; j++) {
        if (PART_SET.has(toks[j].n) || (freeText && PART_ALL_SET.has(toks[j].n))) {
          push("BODY_PART", `${n} + ${toks[j].n}`, i, j);
          break;
        }
        if (!FILLER_SET.has(toks[j].n)) break;
        skipped++;
      }
    }
    // A body part before a trouble word ("back problems", "leg issues").
    if (PART_ALL_SET.has(n) && i + 1 < toks.length && TROUBLE_SET.has(toks[i + 1].n)) push("BODY_PART", `${n} + ${toks[i + 1].n}`, i, i + 1);
    // A joint before an operation or a break ("knee scope", "ankle fusion", "collarbone break").
    if (PART_SET.has(n) && i + 1 < toks.length && PROCEDURE_SET.has(toks[i + 1].n)) push("BODY_PART", `${n} + ${toks[i + 1].n}`, i, i + 1);
    // A condition written in capitals ("despite MS", "I have POTS").
    if (!shouting && !covered.has(i) && ACRONYM_SET.has(toks[i].raw)) push("HEALTH", toks[i].raw, i, i);
    // A pain or injury root inside a compound ("Knieschmerzen").
    const infix = INFIXES.find((x) => n.length > x.length && n.includes(x));
    if (infix) push("LANGUAGE", `*${infix}*`, i, i);
  }
  // A medical ending ("meniscectomy", "arthroscopy", "bursitis"), on words no cue matched.
  for (let i = 0; i < toks.length; i++) {
    const n = toks[i].n;
    if (covered.has(i) || benign.has(i) || !/^\p{L}+$/u.test(n) || SUFFIX_GUARD.has(n)) continue;
    const suffix = CUE_MEDICAL_SUFFIXES.find((x) => n.length >= x.length + 3 && n.endsWith(x));
    if (suffix) push(/itis|algia|opathy/.test(suffix) ? "HEALTH" : "INJURY", `*${suffix}`, i, i);
  }
  // One slip of a long cue word ("injry", "surgury"), on words no cue matched.
  for (let i = 0; i < toks.length; i++) {
    const n = toks[i].n;
    if (covered.has(i) || benign.has(i) || n.length < 5 || !/^\p{L}+$/u.test(n) || FUZZY_GUARD.has(n)) continue;
    const hit = FUZZY.find((f) => f.w.length >= 6 && oneSlip(n, f.w));
    if (hit) push(hit.cls, `~${hit.w}`, i, i);
  }
  // A cue inside a longer one of the same class says nothing more ("knee" inside "my bad knee").
  const kept = found.filter((c) => !found.some((d) => d !== c && d.cls === c.cls && d.start <= c.start && d.end >= c.end && d.end - d.start > c.end - c.start));
  kept.sort((x, y) => x.start - y.start || x.end - y.end || CUE_CLASSES.indexOf(x.cls) - CUE_CLASSES.indexOf(y.cls));
  // Can the app read it at all?
  let unparseable = text.length > CUE_TEXT_MAX || /\p{Extended_Pictographic}/u.test(t);
  if (letters.length > 0) {
    if (letters.some((ch) => !/\p{Script=Latin}/u.test(ch))) unparseable = true;
    const ascii = letters.filter((ch) => /[A-Za-z]/.test(ch)).length;
    if (ascii / letters.length < LANGUAGE_ASCII_MIN) unparseable = true;
    // The word test: the words that are neither numbers ("10K") nor shared loan words ("marathon", "km"), and none English.
    const ws = toks.filter((x) => /\p{L}/u.test(x.n) && !/^\p{N}/u.test(x.n) && !LOAN_SET.has(x.n)).map((x) => x.n);
    const least = source === "NOTES" ? CUE_LANGUAGE_MIN_WORDS : 1;
    if (ws.length >= least && !ws.some(englishWord)) unparseable = true;
  }
  return { hasCue: kept.length > 0 || unparseable, cues: kept, unparseable };
}

/** The texts the cue detector reads for a plan: the Constraints box, the aim, and the user's other words (the notes). */
export interface CueTexts {
  constraints: string | null;
  aim: string | null;
  /** The exam label, the hours' source note, the outline's source and its lines, in that order (empty ones left out). */
  notes?: readonly (string | null | undefined)[];
  /**
   * Revision 5 (contracts §23.6; lane 3): every other DRAFT, ACTIVE and
   * PAUSED goal's texts, in seat order. Absent or empty: byte-identical to
   * today (cueReadingOf, and cueKeyOf's "k2-" key).
   */
  others?: readonly GoalCueTexts[];
}

/** The texts of an intake the user typed: every one is read, whatever the track (only BODY and CARE are gated). */
export function cueTextsOf(intake: Pick<Intake, "constraints" | "aim" | "examLabel" | "typicalHoursSource" | "syllabus">): CueTexts {
  const notes = [intake.examLabel, intake.typicalHoursSource, intake.syllabus?.source ?? null, ...(intake.syllabus?.lines ?? [])].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return { constraints: intake.constraints ?? null, aim: intake.aim ?? null, notes };
}

/** One goal's texts read in order (constraints, aim, notes), each cue tagged with its source (and its note's index). */
function cueReadingsOf(texts: Pick<CueTexts, "constraints" | "aim" | "notes">): CueReading[] {
  const parts: CueReading[] = [constraintCuesOf(texts.constraints, "CONSTRAINTS"), constraintCuesOf(texts.aim, "AIM")];
  const notes = (Array.isArray(texts.notes) ? texts.notes : []).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  notes.forEach((note, i) => {
    const r = constraintCuesOf(note, "NOTES");
    parts.push({ ...r, cues: r.cues.map((c) => ({ ...c, note: i })) });
  });
  return parts;
}

/**
 * The other goals' texts as the gate reads them (contracts §23.6): each
 * entry with a roadmap id and a texts object, each roadmap once (the first
 * wins), in the order given (the server's seat order). Empty when absent.
 */
export function otherGoalTextsOf(texts: Pick<CueTexts, "others">): GoalCueTexts[] {
  const out: GoalCueTexts[] = [];
  const seen = new Set<string>();
  for (const g of Array.isArray(texts.others) ? texts.others : []) {
    if (!g || typeof g !== "object" || typeof g.roadmapId !== "string" || !g.texts || typeof g.texts !== "object" || seen.has(g.roadmapId)) continue;
    seen.add(g.roadmapId);
    out.push(g);
  }
  return out;
}

/**
 * constraintCuesOf over every text, in order (constraints, aim, notes), each
 * cue tagged with its source. Then (contracts §23.6, lane 3) each other
 * goal's constraints, aim and notes (CueTexts.others, in the order given:
 * the server's seat order), each of their cues tagged with `goal` =
 * {roadmapId, slot}; `unparseable` is the OR of all. With `others` absent or
 * empty, this goal's reading is the whole answer, byte for byte.
 */
export function cueReadingOf(texts: CueTexts): CueReading {
  const parts = cueReadingsOf(texts);
  const others = otherGoalTextsOf(texts);
  for (const g of others) {
    const goal = { roadmapId: g.roadmapId, slot: isGoalSlot(g.slot) ? g.slot : null };
    for (const r of cueReadingsOf(g.texts)) parts.push({ ...r, cues: r.cues.map((c) => ({ ...c, goal })) });
  }
  const cues = parts.flatMap((p) => p.cues);
  const unparseable = parts.some((p) => p.unparseable);
  return { hasCue: cues.length > 0 || unparseable, cues, unparseable };
}

/** The texts as the keys read them (case and spacing ignored, empty notes left out). */
function cueKeyPartsOf(texts: Pick<CueTexts, "constraints" | "aim" | "notes">): string[] {
  const clean = (x: unknown) => (typeof x === "string" ? x.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() : "");
  const notes = (Array.isArray(texts.notes) ? texts.notes : []).map(clean).filter(Boolean);
  return [clean(texts.constraints), clean(texts.aim), ...notes];
}

/** FNV-1a, 32 bits, as 8 hex digits. */
function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * The fingerprint of the card an answer was given on: FNV-1a over the plan's
 * catalog track and its texts (case and spacing ignored), "k2-" and 8 hex
 * digits. The track is part of it, so an answer given on one track never
 * releases kinds on another: "Nothing to avoid" said about running sessions
 * on BODY is not an answer about a full attempt at a CRAFT piece (contracts
 * §19.11). A card's answer stored under another key no longer holds: the
 * card asks again. An AVOID never goes stale. No text is stored twice. The
 * exam flag is not keyed: the exam label is itself a note, and a kind the
 * card didn't list waits anyway (ActivityCardAnswered.asked).
 *
 * With other goals' texts (CueTexts.others; contracts §23.6 item 6, ruling
 * 29) the key is "k3-": FNV-1a over the track, this goal's texts and each
 * other goal's roadmap id and texts, in roadmap-id order (a goal's seat is
 * not keyed), so a change to any goal's words asks again on every card
 * that asks. Without others it is today's "k2-" key, byte for byte.
 */
export function cueKeyOf(texts: CueTexts, track: CatalogTrack): string {
  const own = [typeof track === "string" ? track : "", ...cueKeyPartsOf(texts)].join("␞");
  const others = otherGoalTextsOf(texts);
  if (others.length === 0) return `k2-${fnv1aHex(own)}`;
  const sorted = [...others].sort((a, b) => (a.roadmapId < b.roadmapId ? -1 : a.roadmapId > b.roadmapId ? 1 : 0));
  return `k3-${fnv1aHex([own, ...sorted.map((g) => [g.roadmapId, ...cueKeyPartsOf(g.texts)].join("␞"))].join("␝"))}`;
}

/**
 * The key before the track was keyed: "k1-" and FNV-1a over the texts alone
 * (the answers stored before contracts §19.11 carry it). Read only: the gate
 * (roadmap-catalog allowedKindsFor) holds such an answer under the same
 * words only when the kinds it listed fit the plan's track and no other.
 * Nothing writes it.
 */
export function cueLegacyKeyOf(texts: CueTexts): string {
  return `k1-${fnv1aHex(cueKeyPartsOf(texts).join("␞"))}`;
}

// ── The confirmation (stored, YOURS) ──

/**
 * A stored verdict for one kind. Only AVOID is written: the user ticked it.
 * FINE is the earlier per-kind card's word, kept in the type so old rows and
 * callers still read; it is never written and never unlocks anything (it
 * may have been a row the user left unticked). What unlocks is the card's
 * answer (ActivityConfirm.answered).
 */
export type ActivityVerdict = "AVOID" | "FINE";
export const ACTIVITY_VERDICTS: readonly ActivityVerdict[] = ["AVOID", "FINE"];

/** One stored answer. The user's decision (YOURS): only their tap writes it. */
export interface ActivityConfirmEntry {
  /** AVOID (FINE only in an earlier row: dropped on read, never written). */
  verdict: ActivityVerdict;
  /** The life day they answered. */
  day: DayKey;
  /** Why, in the user's own words: the sentence the pre-fill or the first cue quoted (userClauseOf); "" when none. ≤ ACTIVITY_REASON_MAX. */
  reason: string;
}

/**
 * The card's answer as stored: the user answered the activity card under
 * ActivityConfirm.key, on `day`, about the kinds the card listed then
 * (`asked`). The release is per card (the lead's ruling, contracts §19.11):
 * a Save with at least one tick is the user's answer for every row the card
 * listed, so every listed kind they didn't tick is placed while the words
 * and the track stay the same; a kind the card didn't list (another exam, a
 * type added later) still waits. `none`: the answer was "Nothing to avoid".
 */
export interface ActivityCardAnswered {
  day: DayKey;
  /** The kinds the card listed when the user answered (and any kind they ticked), in CATALOG order. */
  asked: CatalogKey[];
  none: boolean;
}

/**
 * The stored confirmation (Roadmap.coverage[ACTIVITY_CONFIRM_KEY]; read with
 * roadmap-catalog activityConfirmOf, written with coverageJsonOf). Editable
 * for the life of the plan; every plan path honours it through
 * allowedKindsFor. An AVOID stands whatever the words and the track; the
 * card's answer holds only while the words and the track keep `key`.
 */
export interface ActivityConfirm {
  /** cueKeyOf(texts, track): the card the user last answered ("k2-"). A "k1-" key (cueLegacyKeyOf) is an answer stored before the track was keyed. */
  key: string;
  /** The kinds the user said to avoid (AVOID entries), in CATALOG order. */
  kinds: Partial<Record<CatalogKey, ActivityConfirmEntry>>;
  /** The card's answer under `key`; null or absent: not answered (an earlier per-kind row, or only AVOIDs carried over). */
  answered?: ActivityCardAnswered | null;
}

/**
 * The user's answer to the activity card (setActivityVerdicts; roadmap-catalog
 * answerActivityCard): what to avoid, given against these words. Answering
 * takes an explicit act: at least one kind ticked, or "Nothing to avoid"
 * (ACTIVITY_NOTHING_TO_AVOID). A Save with nothing ticked is not an answer
 * and is refused (ACTIVITY_NOTHING_TICKED), so an unticked row is never
 * taken as fine by itself. A Save with a tick answers for every row the card
 * listed (the release is per card, contracts §19.11), and "Nothing to avoid"
 * is offered only while no box is ticked (ticks with it are refused). The
 * reason is never sent: the server quotes it.
 */
export interface ActivityCardAnswer {
  /** ActivityConfirmView.key: the words and the track the card was shown against. Either changed meanwhile: refused (ACTIVITY_ANSWER_STALE), and the card asks again. */
  key: string;
  /** Every box ticked "avoid" when the user saved (a pre-ticked suggestion left ticked included), on this plan's track. Replaces the card's earlier ticks. */
  avoid: CatalogKey[];
  /** The user tapped "Nothing to avoid" (`avoid` is then empty). */
  nothingToAvoid: boolean;
}

/**
 * The earlier per-kind answer (kind and AVOID, FINE or null). Read now only
 * as ticks on the card (roadmap-catalog answerActivities, deprecated): AVOID
 * ticks the box, FINE or null unticks it. It carries no key, so it can't
 * tell words that changed meanwhile: callers move to ActivityCardAnswer.
 */
export interface ActivityAnswer {
  kind: CatalogKey;
  verdict: ActivityVerdict | null;
}

/**
 * Where the answers are stored: this key of the Roadmap.coverage JSON (a
 * Domain id is a cuid, so it never collides). intakeOf's coverage read keeps
 * numbers only, so the figures are unaffected; saveIntake's coverage input
 * keeps only chosen Domain ids, so the form can't write answers through it.
 */
export const ACTIVITY_CONFIRM_KEY = "$activities";
/**
 * Where the user's practice family is stored (contracts §20.11): this key of
 * the Roadmap.coverage JSON, beside the answers (no new column). Its value is
 * a PracticeFamily string, so intakeOf's numbers-only coverage read skips it;
 * roadmap-catalog practiceFamilyOfCoverage reads it and coverageJsonOf writes it.
 */
export const PRACTICE_FAMILY_KEY = "$practiceFamily";

// ── The gate's shapes (allowedKindsFor, roadmap-catalog.ts) ──

/** A kind the parser's exclusions named: a pre-ticked box (a suggestion), with the user's sentence. It never blocks and never unlocks anything by itself. */
export interface ActivityPrefill {
  kind: CatalogKey;
  /** The parser's word ("running"). */
  word: string;
  /** The user's sentence holding it (userClauseOf over the constraints), or the word. */
  reason: string;
}

/** What the gate reads besides the stored answers (roadmap-catalog constraintsStateOf). */
export interface ConstraintsState {
  /** The catalog track: FIELD for a Field Area (never gated), else the life track. */
  track: CatalogTrack;
  /** examLabel is set (an examOnly kind can be placed). */
  exam: boolean;
  practicesAllowed: boolean;
  texts: CueTexts;
  /** The Constraints box holds any text. The gate doesn't read it (BODY and CARE always ask); the card quotes it when no cue word matched. */
  stated: boolean;
  /** cueReadingOf(texts). */
  reading: CueReading;
  /** cueKeyOf(texts, track): what the card's answer must carry. */
  key: string;
  /** The parser's exclusions on this track, one per kind: suggestions. */
  prefill: ActivityPrefill[];
  /** Revision 5 (contracts §23.6; lane 3): every other goal's stored AVOIDs (open ones lock, closed ones suggest). Absent: today's gate. */
  others?: readonly GoalAvoids[];
}

/**
 * A kind's state at the gate:
 *   PENDING  gated, and the card isn't answered under these words: not placed (a suggestion pre-ticks its box)
 *   AVOID    the user ticked it: not placed, on any plan path, gated or not, whatever the words
 *   FINE     the user answered the card under these words without ticking it (their Save, or "Nothing to avoid"): placed.
 *            No per-kind verdict is stored for it; the user's act is the card's answer.
 *   WORDS    not gated, the user's words suggest avoiding it, no answer yet: placed (a suggestion, its box pre-ticked; never a block)
 */
export type ActivityRowState = "PENDING" | "AVOID" | "FINE" | "WORDS";

/** One row of the confirm card (and of the gate's account). */
export interface ActivityRow {
  kind: CatalogKey;
  state: ActivityRowState;
  /** The gate holds it: the gate is on and the kind is in cueGatedKindsOf(track). */
  gated: boolean;
  /** AVOID when the parser's reading of the user's words names it and it isn't answered (PENDING, WORDS): its box comes pre-ticked. Else null. */
  prefill: "AVOID" | null;
  /** The user's own words: the stored reason (AVOID), else the suggestion's sentence; "" when none. */
  reason: string;
  /** AVOID: the day the user ticked it; FINE: the day they answered the card. Null otherwise. */
  day: DayKey | null;
  /** A row the card's earlier answer on this track (under other words) released, now asked again: that answer's day; null otherwise (never for another track's answer). */
  staleDay: DayKey | null;
  /** YOURS on an answered row (AVOID, FINE: the user's decision); null on PENDING and WORDS (code's reading of their words, not a decision). */
  cls: "YOURS" | null;
  // ── Revision 5 (contracts §23.6; lane 3) ──
  /** The goal that stored this AVOID ("from goal 1"; closed: "from an earlier goal"); absent or null: this goal's own row. */
  from?: { roadmapId: string; slot: GoalSlot | null; closed: boolean } | null;
  /** Another open goal's AVOID: ticked, and lifted only on the goal that stored it (ruling 27). */
  locked?: boolean;
}

/** allowedKindsFor's answer: what every plan path may place, and what to ask. */
export interface ActivityGate {
  /** The gate asks: a BODY or CARE plan (always), or a CRAFT plan whose words carry a cue or can't be read. */
  on: boolean;
  track: CatalogTrack;
  /** The state's key (what the card's answer must carry). */
  key: string;
  /** The day the card was answered under these words (ActivityConfirm.answered with this key); null while it asks. */
  answered: DayKey | null;
  /** That answer was "Nothing to avoid". */
  none: boolean;
  /** The day of the card's answer under earlier words on this track (it asks again); null otherwise. An answer given on another track (its listed kinds aren't all on this one), or stored before the track was keyed under the same words, asks with no stale day: the words didn't change. */
  staleDay: DayKey | null;
  /** Every catalog kind on the track a plan path may place, in CATALOG order (the other filters — exam, practices, stage — still apply). */
  allowed: CatalogKey[];
  /** Every catalog kind on the track no plan path may place (PENDING, AVOID), in CATALOG order: pass it as `excluded`. A suggestion (WORDS) is never in it. */
  blocked: CatalogKey[];
  /** The rows to ask (PENDING and shown), in CATALOG order. */
  pending: CatalogKey[];
  /** Every row to show, in CATALOG order: the gated kinds while on (their exam and practice filters applied), every suggestion, and every AVOID. */
  rows: ActivityRow[];
}

/**
 * The confirm card's view field (DraftView.activityConfirm and
 * RoadmapView.activityConfirm; roadmap-catalog activityConfirmViewOf). R5
 * names each kind with its KIND_NAME and never claims medical knowledge:
 * "Your words mention 'knee pain'. Until you say which of these to avoid,
 * the plan places only easy, mobility and technique sessions.", with the
 * HEALTH_LINE beside it on BODY and CARE. Save sends ActivityCardAnswer with
 * this `key`; "Nothing to avoid" is the explicit all-clear.
 */
export interface ActivityConfirmView {
  /** The card asks on this plan (ActivityGate.on). */
  on: boolean;
  track: CatalogTrack;
  /** The words' key: the card's answer carries it back (ActivityCardAnswer.key). */
  key: string;
  /** Up to CUE_QUOTES_MAX of the user's sentences, verbatim: those that raised a cue, else the constraints' first sentence, else (a card of suggestions only) the suggestions' sentences. May be empty on BODY or CARE: those ask whatever the words. */
  quotes: string[];
  /** Some of the user's words couldn't be read here ("Some of your words couldn't be read here, so the plan asks."). */
  unparseable: boolean;
  rows: ActivityRow[];
  /** Rows still to answer. */
  pending: number;
  /** The day the card was answered under these words; null while it asks (or when it never has). */
  answered: DayKey | null;
  /** That answer was "Nothing to avoid". */
  none: boolean;
  /** The day of an answer given on this track under earlier words (the card asks again: "You answered on 3 Oct, before your words changed"); null otherwise (another track's answer asks with no stale day). */
  staleDay: DayKey | null;
  /** What the plan places meanwhile: the safe kinds on this track (cueSafeKindsOf; [] while off). */
  safeKinds: CatalogKey[];
  /** Revision 5 (contracts §23.6; lane 3): index-aligned with `quotes`, the seat of the goal each came from (null: this goal). */
  quoteGoals?: (GoalSlot | null)[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Revision 5 (contracts §22, §23): the topic map and up to 3 goals. Lane 0.
// docs/life-plan/roadmap-topic-map.md (draft 2) is the spec. Every switch
// starts false and GOALS_MAX is 1, so nothing a user can reach changes, and
// LEVELS (every plan today) is unchanged byte for byte. Only the lane named
// flips a switch, re-pinning it in roadmap-contract-check in the same commit,
// on the user's go. No word list lives here (ruling 33).
// ═══════════════════════════════════════════════════════════════════════════

// ── Switches (§22.2) ──

/**
 * Open goals a user may keep (DRAFT and ACTIVE, each in a seat). 1 until lane
 * 4's last commit sets it to 3, and only once lane 3's shares are read in
 * realism (roadmap-contract-check refuses the flip before; ruling 54). Every
 * offer of a new seat reads it, never the fixed GOAL_SLOTS_MAX (ruling 53).
 */
export const GOALS_MAX: number = 3;
/** The seats the database's CHECK allows (slot 1..3); GOALS_MAX ≤ it. Never flipped. */
export const GOAL_SLOTS_MAX = 3;
/** TOPICS plans (lane 9 flips it). */
export const TOPIC_PLANS_LIVE: boolean = true;
/** Gemini's rating, the chain head (lane 13). */
export const TOPIC_RATE_LIVE: boolean = true;
/** MAP's placement of your outline lines and Domains (lane 13). */
export const TOPIC_PLACE_LIVE: boolean = true;
/** MAP's Gemini topic names; effective only with GROUND (lane 13). */
export const TOPIC_NAMES_LIVE: boolean = true;
/** LINK's prerequisite links (lane 13). */
export const TOPIC_LINK_LIVE: boolean = true;
/** GROUND, the web check of Gemini's names; effective only with names (lane 13). */
export const TOPIC_GROUND_LIVE: boolean = true;

/** The six switches, as given or as they take effect (topicSwitchesOf). */
export interface TopicSwitches {
  plans: boolean;
  rate: boolean;
  place: boolean;
  names: boolean;
  link: boolean;
  ground: boolean;
}

/**
 * The effective switches (ruling 16): `plans`; `rate` only under plans;
 * `place` and `link` only under rate; `names` only under rate and with
 * `ground`; `ground` only with `names`. A switch left out of `raw` reads its
 * constant, so with no argument this is the build's own state.
 */
export function topicSwitchesOf(raw?: Partial<TopicSwitches>): TopicSwitches {
  const plans = (raw?.plans ?? TOPIC_PLANS_LIVE) === true;
  const rate = plans && (raw?.rate ?? TOPIC_RATE_LIVE) === true;
  const place = rate && (raw?.place ?? TOPIC_PLACE_LIVE) === true;
  const link = rate && (raw?.link ?? TOPIC_LINK_LIVE) === true;
  const names = rate && (raw?.names ?? TOPIC_NAMES_LIVE) === true && (raw?.ground ?? TOPIC_GROUND_LIVE) === true;
  return { plans, rate, place, names, link, ground: names };
}

// ── Model and runs (§22.2, §22.15) ──

/**
 * The topic phases' prompt version (RATE, MAP, LINK, GROUND, DEEPER); ROADMAP_PROMPT_VERSION 4 stays for LEVELS. A text
 * change is a bump. 2: the live fix's RATE calibration anchors. 3: MAP's and DEEPER's names v3 after the judged names
 * test (standard syllabus terms inside the aim, no whole fields or coined compounds, no padding; contracts §22.5,
 * §22.20 ruling N5). 4: MAP plans one milestone a layer (a title, the stage's hurdle and its checkable target) before it
 * names that milestone's study topics, specific to the aim, and fills every layer (ruling N8). 5: each name is one
 * concept, ratio, rule, method or calculation a session or two can master, never the chapter it sits in (ruling N13).
 */
export const TOPIC_PROMPT_VERSION: number = 5;
/** A MAP milestone's hurdle or target, at most this many characters (ruling N8; its title takes MILESTONE_TITLE_MAX); longer is cut at a word with "…". */
export const MILESTONE_LINE_MAX = 240;
/** Samples per JSON phase. */
export const TOPIC_SAMPLES = 3;
/**
 * 1: three requests a phase; 3: one request carrying three candidates. Stays 1
 * after probe P6 (scripts/fixtures/roadmap-corpus/probe-v5-P6.json): the model
 * refused candidateCount 3 with a 400, "Multiple candidates is not enabled for
 * this model".
 */
export const TOPIC_CANDIDATE_COUNT: 1 | 3 = 1;
/** A form key is kept when at least this many of TOPIC_SAMPLES samples hold it exactly. */
export const CONSENSUS_MIN = 2;
/** Stem-bigram Dice at or above which a kept form hides behind a higher-voted one (never adds votes). */
export const DEDUPE_DICE = 0.85;
/** A GEMINI edge is drawn when `agree` of `of` valid LINK samples chose it and the layer before holds at least `prevLayerMin` kept topics. */
export const EDGE_DRAW: Readonly<{ agree: number; of: number; prevLayerMin: number }> = { agree: 3, of: 3, prevLayerMin: 4 };
/** Distinct sources GROUND must link to a name's sentence for LINKED. */
export const SOURCES_MIN = 2;
export const GROUND_KEYS_PER_CALL = 3;
/** Two terms whose stem Dice reaches this never share a GROUND call. */
export const GROUND_PAIR_DICE_MAX = 0.6;
/** GROUND calls in flight at once. */
export const GROUND_PARALLEL = 3;
/** GROUND calls in a breakdown; past it a term is NOT_RUN (hidden). */
export const GROUND_CALLS_MAX = 7;
/** GROUND calls in a Go deeper. */
export const DEEPER_GROUND_CALLS_MAX = 2;
/** Sources shown in a name's ▸. */
export const GROUND_SOURCES_SHOWN = 5;
/**
 * How a grounding chunk's title reads (ruling 35). Re-pinned by lane 11 from
 * probe P5 (scripts/fixtures/roadmap-corpus/probe-v5-P5.json, a real GROUND
 * reply saved unedited, and P5b): every groundingChunks[i].web.title is a
 * registrable DOMAIN ("uri.edu", "wikipedia.org", "westpac.com.au",
 * "asbfeo.gov.au"), never a page title, and every uri is Google's
 * vertexaisearch grounding-api-redirect link. So sources count by domain and
 * the title check is UNAVAILABLE; the spec's fallback applies: the bar needs
 * the 100-name sample before TOPIC_NAMES_LIVE.
 */
export const GROUND_TITLE_MODE: GroundTitleMode = "DOMAIN";
export const GROUND_ABORT_MS = 45_000;
/** GROUND's backstop: its abort plus 2 s, as ROADMAP_BACKSTOP_MS is ROADMAP_ABORT_MS plus 2 s. */
export const GROUND_BACKSTOP_MS = GROUND_ABORT_MS + 2_000;
/**
 * A RUNNING topic step (one run row: RATE, MAP, LINK, one GROUND wave or
 * DEEPER) older than this is stale and may be claimed again. Each step runs
 * in its own invocation within the roadmap pages' maxDuration (60 s; ruling
 * 47), so a step is never claimed again while it could still be running.
 */
export const TOPIC_RUN_STALE_MS = 180_000;
/** Gemini requests a user may spend a day, across goals (aborted ones, 429s and quota errors included). */
export const ROADMAP_REQUESTS_PER_DAY = 48;
/** Grounded (GROUND) requests a user may spend a day. */
export const GROUNDED_REQUESTS_PER_DAY = 21;
/** A full breakdown: 3 RATE + 3 MAP + 3 LINK + 7 GROUND. */
export const BREAKDOWN_REQUESTS_MAX = 16;
export const BREAKDOWN_REQUESTS_MAX_WITH_CANDIDATES = 10;
/** A Go deeper: 3 DEEPER + 2 GROUND. */
export const DEEPER_REQUESTS_MAX = 5;
export const DEEPER_REQUESTS_MAX_WITH_CANDIDATES = 3;

// ── The rating (§22.2, §22.7) ──

/** Gemini's difficulty estimate: DIFF_k is k build-on layers. */
export type DiffKey = "DIFF_1" | "DIFF_2" | "DIFF_3" | "DIFF_4" | "DIFF_5" | "DIFF_6";
export const DIFF_KEYS: readonly DiffKey[] = ["DIFF_1", "DIFF_2", "DIFF_3", "DIFF_4", "DIFF_5", "DIFF_6"];
export const DIFF_LAYERS: Readonly<Record<DiffKey, number>> = { DIFF_1: 1, DIFF_2: 2, DIFF_3: 3, DIFF_4: 4, DIFF_5: 5, DIFF_6: 6 };
export const LAYERS_MIN = 1;
export const LAYERS_MAX = 6;

/** DIFF_k for a whole k in LAYERS_MIN..LAYERS_MAX; anything else null. */
export function diffKeyOf(layers: number): DiffKey | null {
  return Number.isInteger(layers) && layers >= LAYERS_MIN && layers <= LAYERS_MAX ? DIFF_KEYS[layers - 1] : null;
}

/** The layers DIFF_k stands for (k). */
export function layersOfDiff(key: DiffKey): number {
  return DIFF_LAYERS[key];
}

/** How many topics sit side by side in one layer; ordinal in BREADTH_KEYS order. */
export type BreadthKey = "NARROW" | "MEDIUM" | "WIDE" | "VAST";
export const BREADTH_KEYS: readonly BreadthKey[] = ["NARROW", "MEDIUM", "WIDE", "VAST"];
/** Topics a layer: the pre-check reads `min`, the map's room `max`. */
export const BREADTH_TABLE: Readonly<Record<BreadthKey, { min: number; max: number }>> = {
  NARROW: { min: 1, max: 2 },
  MEDIUM: { min: 2, max: 3 },
  WIDE: { min: 3, max: 5 },
  VAST: { min: 4, max: 6 },
};
/** Breadth in words, for the estimate's (i) sheet only. */
export const BREADTH_WORD: Readonly<Record<BreadthKey, string>> = { NARROW: "Narrow", MEDIUM: "Medium", WIDE: "Wide", VAST: "Vast" };
/** Code's breadth when RATE gives none. */
export const BREADTH_FALLBACK: BreadthKey = "MEDIUM";

export type DepthReason = "LONG_PREREQS" | "FEW_PREREQS" | "ABSTRACT_MATH" | "NEW_LANGUAGE_OR_SCRIPT" | "MOTOR_SKILL" | "MEASURED_STANDARD";
export const DEPTH_REASONS: readonly DepthReason[] = ["LONG_PREREQS", "FEW_PREREQS", "ABSTRACT_MATH", "NEW_LANGUAGE_OR_SCRIPT", "MOTOR_SKILL", "MEASURED_STANDARD"];
export type BreadthReason = "SINGLE_SKILL" | "MANY_PARTS" | "MANY_FIELDS" | "ROUTINE_UPKEEP" | "OPEN_ENDED_OUTCOME";
export const BREADTH_REASONS: readonly BreadthReason[] = ["SINGLE_SKILL", "MANY_PARTS", "MANY_FIELDS", "ROUTINE_UPKEEP", "OPEN_ENDED_OUTCOME"];
export type CautionReason = "REAL_MONEY" | "HEALTH_RISK" | "REGULATED";
export const CAUTION_REASONS: readonly CautionReason[] = ["REAL_MONEY", "HEALTH_RISK", "REGULATED"];
/** RATE's reasons: the 14 above, in this order (the schema's enum). Keys only: shown through RATING_REASON_LABEL, never as text. */
export type RatingReason = DepthReason | BreadthReason | CautionReason;
export const RATING_REASONS: readonly RatingReason[] = [...DEPTH_REASONS, ...BREADTH_REASONS, ...CAUTION_REASONS];
/** Code's words for each reason (decision 76: never "difficulty", "hard" or "level"). */
export const RATING_REASON_LABEL: Readonly<Record<RatingReason, string>> = {
  LONG_PREREQS: "has a long chain of basics",
  FEW_PREREQS: "needs few basics first",
  ABSTRACT_MATH: "involves abstract maths",
  NEW_LANGUAGE_OR_SCRIPT: "involves a new language or script",
  MOTOR_SKILL: "trains a physical skill",
  MEASURED_STANDARD: "has a set bar to meet",
  SINGLE_SKILL: "is one skill",
  MANY_PARTS: "has several parts",
  MANY_FIELDS: "spans several fields",
  ROUTINE_UPKEEP: "includes a routine",
  OPEN_ENDED_OUTCOME: "has an open-ended outcome",
  REAL_MONEY: "involves real money",
  HEALTH_RISK: "involves health",
  REGULATED: "involves rules or law",
};
/** A reason that breaks its reply's own difficulty or breadth is dropped from that reply (the reply's votes still count). Absent: always coherent. */
export const REASON_COHERENCE: Partial<Record<RatingReason, { difficulty?: readonly DiffKey[]; breadth?: readonly BreadthKey[] }>> = {
  LONG_PREREQS: { difficulty: ["DIFF_3", "DIFF_4", "DIFF_5", "DIFF_6"] },
  FEW_PREREQS: { difficulty: ["DIFF_1", "DIFF_2"] },
  SINGLE_SKILL: { breadth: ["NARROW", "MEDIUM"] },
  MANY_PARTS: { breadth: ["MEDIUM", "WIDE", "VAST"] },
  MANY_FIELDS: { breadth: ["WIDE", "VAST"] },
};
/** The schema's maxItems for `reasons`. */
export const RATING_REASONS_MAX = 4;
/** Depth and breadth reasons kept on the record, at most. */
export const RATING_REASONS_KEPT_MAX = 3;
/** A depth or breadth reason is kept when at least this many valid replies give it. */
export const REASON_AGREE_MIN = 2;
/** A 3-reply spread of this many layers or more reads «Gemini unsure · a–b layers». */
export const UNSURE_SPREAD = 2;
/** Code's estimate in layers (depthFallbackOf): a Field, a track; +1 at DEPTH_FALLBACK_OUTLINE_LINES outline lines or more. */
export const DEPTH_FALLBACK: Readonly<{ FIELD: number; TRACK: number }> = { FIELD: 3, TRACK: 2 };
export const DEPTH_FALLBACK_OUTLINE_LINES = 20;
/** A plan's caution chips («Not financial advice»): code's word lists ∪ any valid reply's caution reason; never removed. */
export type Caution = "FINANCIAL" | "MEDICAL" | "LEGAL";
export const CAUTIONS: readonly Caution[] = ["FINANCIAL", "MEDICAL", "LEGAL"];
export const CAUTION_OF_REASON: Readonly<Record<CautionReason, Caution>> = { REAL_MONEY: "FINANCIAL", HEALTH_RISK: "MEDICAL", REGULATED: "LEGAL" };
/** Whose estimate a plan uses: Gemini's consensus, code's rough one, or yours. */
export type RatingOrigin = "GEMINI" | "CODE" | "YOURS";
export const RATING_ORIGINS: readonly RatingOrigin[] = ["GEMINI", "CODE", "YOURS"];
/** A change to the plan's layer count after the estimate. */
export type LayerChangeKind = "SET" | "FEWER" | "MERGED" | "DEEPER" | "PLAN_FIRST";

// ── The map and the chain (§22.2) ──

/** Roadmap.planKind: LEVELS (every plan today) or TOPICS (a topic map). */
export type PlanKind = "LEVELS" | "TOPICS";
export const PLAN_KINDS: readonly PlanKind[] = ["LEVELS", "TOPICS"];
/** Chosen topics per goal (DEPTH_DOMAINS_MAX 6 stays for LEVELS). 20 until ruling N13 lifted it with the per-layer ceiling. */
export const TOPICS_MAX = 60;
export const LAYER_TOPICS_MIN = 1;
/**
 * No per-layer ceiling (ruling N13: the user's "remove the ceiling of number of topic per layer"; it was 6, =
 * TOPICS_PER_MILESTONE, which stays 6 for LEVELS). A layer holds every topic you keep; TOPICS_MAX bounds the goal.
 */
export const LAYER_TOPICS_MAX: number = Number.POSITIVE_INFINITY;
/** A base topic's cards at OPEN_LEVEL. */
export const TOPIC_FLOOR_CARDS = 8;
/** The level a layer milestone pays at. */
export const OPEN_LEVEL = 6;
/** The level the base topics climb to in the depth tail. */
export const BASE_LEVEL = 8;
export const DEPTH_MILESTONES_MAX = 2;
/** Milestones of a TOPICS plan, at most (MAX_MILESTONES 6 stays for LEVELS). */
export const MAX_MILESTONES_TOPICS = 8;

/**
 * The milestone cap of a plan kind (ruling 50): MAX_MILESTONES_TOPICS on
 * TOPICS, else MAX_MILESTONES. acceptCore, the manual edit, maxScheduled and
 * realism's re-fit split read it (lanes 7 and 8), so LEVELS keeps 6.
 */
export function milestoneCapOf(planKind?: PlanKind | null): number {
  return planKind === "TOPICS" ? MAX_MILESTONES_TOPICS : MAX_MILESTONES;
}
export const EDGE_PARENTS_MAX = 3;
export const EDGE_CHILDREN_MAX = 4;
/** Children a Go deeper may add (minimum 0). */
export const DEEPER_CHILDREN_MAX = 4;
/** A TOPICS plan's depth: 6 (TOPICS only, ruling 14) or an AimDepth. */
export type TopicDepth = 6 | AimDepth;
export const TOPIC_DEPTHS: readonly TopicDepth[] = [6, 8, 10, 12];

export function isTopicDepth(v: unknown): v is TopicDepth {
  return v === 6 || isAimDepth(v);
}

/** T: the depth milestones after layer K, per depth. */
export const DEPTH_TAIL: Readonly<Record<TopicDepth, number>> = { 6: 0, 8: 1, 10: 1, 12: 2 };

export type LayerKey = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";
export const LAYER_KEYS: readonly LayerKey[] = ["L1", "L2", "L3", "L4", "L5", "L6"];
/** Where a topic's name came from. */
export type TopicOrigin = "GEMINI" | "SYLLABUS" | "USER" | "LIBRARY" | "AIM";
export const TOPIC_ORIGINS: readonly TopicOrigin[] = ["GEMINI", "SYLLABUS", "USER", "LIBRARY", "AIM"];
export type TopicScope = "GENERAL" | "REGION_SPECIFIC";
export const TOPIC_SCOPES: readonly TopicScope[] = ["GENERAL", "REGION_SPECIFIC"];
/** Who put a topic in its layer. */
export type TopicPlacedBy = "GEMINI" | "YOU" | "CODE";
export const TOPIC_PLACED_BY: readonly TopicPlacedBy[] = ["GEMINI", "YOU", "CODE"];
export type TopicDecision = "PENDING" | "KEPT" | "EDITED" | "REMOVED" | "MERGED";
export const TOPIC_DECISIONS: readonly TopicDecision[] = ["PENDING", "KEPT", "EDITED", "REMOVED", "MERGED"];
/** DEEP: chosen in the last layer (the specialisation). */
export type TopicRole = "BASE" | "DEEP";
export const TOPIC_ROLES: readonly TopicRole[] = ["BASE", "DEEP"];
/** GROUND's verdict on a topic's name; OWN: a name that was never Gemini's. */
export type TopicGrounding = "LINKED" | "WEAK" | "NONE" | "NOT_RUN" | "OWN";
export const TOPIC_GROUNDINGS: readonly TopicGrounding[] = ["LINKED", "WEAK", "NONE", "NOT_RUN", "OWN"];
export type GroundVerdict = "LINKED" | "WEAK" | "NONE";
export const GROUND_VERDICTS: readonly GroundVerdict[] = ["LINKED", "WEAK", "NONE"];
export type GroundTitleMode = "TITLE" | "DOMAIN";
/** CODE and SYLLABUS are reserved (ruling 20): no path writes them in this build, and readers accept them. */
export type EdgeOrigin = "GEMINI" | "USER" | "CODE" | "SYLLABUS" | "CROSS_GOAL";
export const EDGE_ORIGINS: readonly EdgeOrigin[] = ["GEMINI", "USER", "CODE", "SYLLABUS", "CROSS_GOAL"];
export type EdgeDecision = "PENDING" | "KEPT" | "EDITED" | "REMOVED";
export const EDGE_DECISIONS: readonly EdgeDecision[] = ["PENDING", "KEPT", "EDITED", "REMOVED"];
/** C8's mark: the edge matches your outline's order, or two lines you tied to Domains. */
export type EdgeMatch = "OUTLINE" | "LINE_DOMAIN" | "NONE";
export const EDGE_MATCHES: readonly EdgeMatch[] = ["OUTLINE", "LINE_DOMAIN", "NONE"];
/** RoadmapRun.phase (null on LEVELS). */
export type RunPhase = "RATE" | "MAP" | "LINK" | "GROUND" | "DEEPER";
export const RUN_PHASES: readonly RunPhase[] = ["RATE", "MAP", "LINK", "GROUND", "DEEPER"];
/** RoadmapMilestone.chainRole: a layer milestone or a depth milestone. */
export type ChainRole = "LAYER" | "DEPTH";
export const CHAIN_ROLES: readonly ChainRole[] = ["LAYER", "DEPTH"];
/**
 * checkLabel's topic-name flags (ruling 3: their own union; BlockingFlag is not widened). REGION and VAGUE_FIELD hide a
 * name (revealable); the others drop it. VAGUE_FIELD (ruling N7, the judged names test): a whole academic field, never a
 * topic inside it ("Mathematics", "Optical Physics").
 */
export type TopicFlag = "JURISDICTION" | "BRAND" | "ADVICE" | "LEVEL_ONLY" | "INJECTION" | "REGION" | "VAGUE_FIELD";
export const TOPIC_FLAGS: readonly TopicFlag[] = ["JURISDICTION", "BRAND", "ADVICE", "LEVEL_ONLY", "INJECTION", "REGION", "VAGUE_FIELD"];
/**
 * A topic's provenance class (§22.11): what it shows. Keeping changes only "in the plan", never the class.
 * LINKED_ONE (ruling N3, the names test): a GEMINI name GROUND linked to exactly 1 distinct source (WEAK), shown
 * «Gemini · Google linked 1 source»; kept, it reads KEPT.
 */
export type TopicClass = "SYLLABUS" | "YOURS" | "LIBRARY" | "AIM" | "PICKED" | "LINKED" | "LINKED_ONE" | "NOT_CHECKED" | "KEPT" | "KEPT_NOT_CHECKED";
export const TOPIC_CLASSES: readonly TopicClass[] = ["SYLLABUS", "YOURS", "LIBRARY", "AIM", "PICKED", "LINKED", "LINKED_ONE", "NOT_CHECKED", "KEPT", "KEPT_NOT_CHECKED"];
export type TopicNote =
  | "NEAR_DUPLICATE"
  | "UNSURE_LAYER"
  | "NEEDS_PARENT"
  | "DEAD_END"
  | "DIFFERS_FROM_ORDER"
  | "NOT_USED"
  | "PICKED_BY_GEMINI"
  | "PLACED_BY_GEMINI"
  | "TRACKED_IN_GOAL"
  | "PLANNED_LATER"
  | "HELD_AT_START"
  | "KNOWN_BY_YOU"
  | "CROSS_GOAL_PARENT"
  | "MERGED_BY_YOU"
  | "ADDED_BY_DEEPER";
export const TOPIC_NOTES: readonly TopicNote[] = [
  "NEAR_DUPLICATE",
  "UNSURE_LAYER",
  "NEEDS_PARENT",
  "DEAD_END",
  "DIFFERS_FROM_ORDER",
  "NOT_USED",
  "PICKED_BY_GEMINI",
  "PLACED_BY_GEMINI",
  "TRACKED_IN_GOAL",
  "PLANNED_LATER",
  "HELD_AT_START",
  "KNOWN_BY_YOU",
  "CROSS_GOAL_PARENT",
  "MERGED_BY_YOU",
  "ADDED_BY_DEEPER",
];
/** Why a Gemini name was dropped: counted, never shown. */
export type TopicDropReason = "SHAPE" | "FLAG" | "ECHO" | "ONE_SAMPLE" | "SAME_TOPIC_DEEPER" | "OVER_ROOM" | "TAKEN_NAME";
export const TOPIC_DROP_REASONS: readonly TopicDropReason[] = ["SHAPE", "FLAG", "ECHO", "ONE_SAMPLE", "SAME_TOPIC_DEEPER", "OVER_ROOM", "TAKEN_NAME"];
/**
 * Why a Gemini name is hidden behind the count (revealable; roadmap-topics topicHideReasonOf). VAGUE_FIELD (ruling N7):
 * checkLabel's whole-field flag.
 */
export type TopicHideReason = "UNSURE_LAYER" | "LANGUAGE_UNCHECKED" | "REGION" | "NEAR_DUPLICATE" | "WEAK" | "NONE" | "NOT_RUN" | "GROUND_FAILED" | "VAGUE_FIELD";
export const TOPIC_HIDE_REASONS: readonly TopicHideReason[] = ["UNSURE_LAYER", "LANGUAGE_UNCHECKED", "REGION", "NEAR_DUPLICATE", "WEAK", "NONE", "NOT_RUN", "GROUND_FAILED", "VAGUE_FIELD"];
/** The map's rules (chainChecksOf; §22.8's table). */
export type ChainCheckCode = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9" | "C10";
export const CHAIN_CHECK_CODES: readonly ChainCheckCode[] = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"];
export type ChainEffect = "REFUSED" | "TRIPWIRE" | "BLOCKS" | "DROPPED" | "FALLBACK" | "INFO" | "FLAG" | "MARK" | "MERGED";
/** chainFitOf's offers, in this order. */
export type ChainOffer = "USE_REALISTIC_DATE" | "MORE_HOURS" | "PAUSE_GOAL" | "LOWER_DEPTH" | "FEWER_LAYERS" | "PLAN_FIRST_LAYERS";
export const CHAIN_OFFERS: readonly ChainOffer[] = ["USE_REALISTIC_DATE", "MORE_HOURS", "PAUSE_GOAL", "LOWER_DEPTH", "FEWER_LAYERS", "PLAN_FIRST_LAYERS"];
/** An empty layer's sheet, in this order (MERGE_UP left out on layer 1, SHOW_HIDDEN with nothing hidden). */
export type EmptyLayerOffer = "MERGE_UP" | "WRITE_ONE" | "SHOW_HIDDEN";
export const EMPTY_LAYER_OFFERS: readonly EmptyLayerOffer[] = ["MERGE_UP", "WRITE_ONE", "SHOW_HIDDEN"];
/** The two allowed classes of model text (ruling 4; PROVENANCE_CLASSES is not widened): the H1 closure and the tripwire read them. */
export type ModelTextClass = "TOPIC_NAME_LINKED" | "TOPIC_NAME_KEPT";
export const MODEL_TEXT_CLASSES: readonly ModelTextClass[] = ["TOPIC_NAME_LINKED", "TOPIC_NAME_KEPT"];
/** Domain.nameOrigin: "GEMINI" for a Domain accept created from a kept Gemini name; null: yours. */
export type DomainNameOrigin = "GEMINI";
/** Start's refusal while a layer's prerequisites are open (lane 8's PREREQS_MET guard). */
export const PREREQS_OPEN = "This layer opens when the one before is reached. Or mark what you already know.";

/**
 * A cross-goal parent's edge row (origin CROSS_GOAL) stores parentLineageId
 * "x:<parentDomainId>" (ruling 48): the edge's unique key (roadmapId,
 * version, parentLineageId, childLineageId) then holds one row per parent
 * Domain, so a child that builds on two other goals' Domains inserts both.
 */
export const CROSS_GOAL_PARENT_PREFIX = "x:";

// The topic map's refusals (ruling 52). They live here, in the hostile V, so
// the pure modules never hold copy: acceptRefusalOf returns a code, and
// roadmap-server (and the view's acceptRefusal) map it through ACCEPT_REFUSAL_LINE.
export const TOPIC_NAME_TAKEN = "A Domain with this name exists here. Use my Domain… instead.";
export const LAYER_UNKEPT = "Keep every layer first.";
export const TOPIC_NEEDS_PARENT = "A topic needs a parent: pick one, or remove it.";
export const LAST_LAYER_EMPTY = "Choose at least one topic in the last layer.";
/** Never answered since ruling N13 (no per-layer ceiling); kept for the refusal code's word table. */
export const LAYER_OVER = "A layer holds too many topics: move or untick some.";
export const TOPICS_OVER = `Choose at most ${TOPICS_MAX} topics.`;
/** ratingOverrideOf's and setLayersCore's refusal. */
export const LAYERS_BOUNDS = `Choose ${LAYERS_MIN} to ${LAYERS_MAX} layers.`;
/** acceptRefusalOf's answer, in the order it checks them (§22.8). */
export type AcceptRefusalCode = "LAYER_UNKEPT" | "TOPIC_NEEDS_PARENT" | "LAST_LAYER_EMPTY" | "LAYER_OVER" | "TOPICS_OVER" | "TOPIC_NAME_TAKEN";
export const ACCEPT_REFUSAL_CODES: readonly AcceptRefusalCode[] = ["LAYER_UNKEPT", "TOPIC_NEEDS_PARENT", "LAST_LAYER_EMPTY", "LAYER_OVER", "TOPICS_OVER", "TOPIC_NAME_TAKEN"];
export const ACCEPT_REFUSAL_LINE: Readonly<Record<AcceptRefusalCode, string>> = {
  LAYER_UNKEPT,
  TOPIC_NEEDS_PARENT,
  LAST_LAYER_EMPTY,
  LAYER_OVER,
  TOPICS_OVER,
  TOPIC_NAME_TAKEN,
};

/**
 * A TOPICS plan's rank at gate i of G (§22.12): 1 + ⌊(i − 1)(top − 1) ÷
 * (G − 1)⌋, so the first gate gives rank 1 and only the last gives `top`.
 * G = 1 gives top. i is clamped to 1..G and top to 1..RANK_TOP. G 5, top 4
 * → 1, 1, 2, 3, 4.
 */
export function topicRankIndexOf(i: number, gates: number, top: number): number {
  const g = Number.isFinite(gates) ? Math.max(1, Math.floor(gates)) : 1;
  const t = Number.isFinite(top) ? Math.max(1, Math.min(RANK_TOP, Math.floor(top))) : 1;
  if (g === 1) return t;
  const k = Number.isFinite(i) ? Math.max(1, Math.min(g, Math.floor(i))) : 1;
  return 1 + Math.floor(((k - 1) * (t - 1)) / (g - 1));
}

// ── Goals (§23) ──

/** The statuses that hold a seat. */
export const SEAT_STATUSES: readonly RoadmapStatus[] = ["DRAFT", "ACTIVE"];
/** The statuses that hold their Domains, AVOIDs and cue texts. */
export const HOLD_STATUSES: readonly RoadmapStatus[] = ["DRAFT", "ACTIVE", "PAUSED"];
/** Roadmap.slot: a goal's seat. */
export type GoalSlot = 1 | 2 | 3;
export const GOAL_SLOTS: readonly GoalSlot[] = [1, 2, 3];

export function isGoalSlot(v: unknown): v is GoalSlot {
  return v === 1 || v === 2 || v === 3;
}

/** Roadmap.label, at most (yours). */
export const GOAL_LABEL_MAX = 16;
/** Roadmap.pauseReason, at most. */
export const GOAL_PAUSE_REASON_MAX = 120;
/** The refusal with every seat taken; answered only while GOALS_MAX is 3 (ruling 23: at 1 it is ANOTHER_ACTIVE, as today). */
export const GOALS_FULL = `${GOAL_SLOTS_MAX} goals open. Finish, pause or archive one.`;

// ── The shapes (§22.3). Serialisable: ISO strings and DayKeys, no Date, no function. ──

// The rating (Roadmap.rating, copied to the acceptance).
export interface RateVote {
  difficulty: DiffKey;
  breadth: BreadthKey;
  reasons: RatingReason[];
  dropped: RatingReason[];
}
export interface LayerChange {
  kind: LayerChangeKind;
  from: number;
  to: number;
  day: DayKey;
}
export interface RatingRecord {
  /** The estimate the plan uses: consensus, code's or yours. */
  difficulty: DiffKey;
  breadth: BreadthKey;
  /** Kept depth and breadth reasons (≤ RATING_REASONS_KEPT_MAX), then every caution reason any valid reply gave. */
  reasons: RatingReason[];
  /** Code's word lists ∪ any valid reply's caution reason (never removed). */
  cautions: Caution[];
  /** One per sample; null = no valid reply. */
  samples: (RateVote | null)[];
  /** max − min layers over the valid difficulty votes (0 with fewer than 2). */
  spread: number;
  origin: RatingOrigin;
  /** Gemini's consensus before your override and the map's fill. */
  geminiDifficulty: DiffKey | null;
  /** K_final once MAP ran. */
  mapFilled: number | null;
  /**
   * MAP's milestones, one per layer it wrote (ruling N8): Gemini's words, shown marked as Gemini's and never checked.
   * Absent on a record written before TOPIC_PROMPT_VERSION 4, and null until MAP ran.
   */
  milestones?: LayerMilestone[] | null;
  /** The RATE run. */
  runId: string | null;
  day: DayKey;
  geminiBreadth: BreadthKey | null;
  breadthSpread: number;
  /** «Gemini unsure · low–high layers». */
  unsure: { low: number; high: number } | null;
  /** "1 reply said 5 layers" (exactly 1 valid reply). */
  oneReply: DiffKey | null;
  /** Reasons dropped by REASON_COHERENCE, for the run's report. */
  incoherent: number;
  /** K in the plan now (after the map's fill and your changes). */
  layers: number;
  /** "· 4 by you", "· 1 merged by you", "· +1 layer by you", "your choice 6 Oct". */
  changes: LayerChange[];
  /** roadmap-rating ratingKeyOf: reused until it changes. */
  inputKey: string;
}

/**
 * One layer's milestone as MAP wrote it (TOPIC_PROMPT_VERSION 4, ruling N8): the stage of capability the layer builds
 * (title), the hardest problem met there (hurdle) and the checkable standard that shows it is reached (target).
 */
export interface LayerMilestone {
  layer: number;
  title: string;
  hurdle: string;
  target: string;
}

// The aim's clauses (clauseSplitOf) and the split-off ones (Roadmap.splitClauses).
/** text === aim.slice(start, end). */
export interface AimClause {
  text: string;
  start: number;
  end: number;
}
export interface SplitClause {
  start: number;
  end: number;
  text: string;
  roadmapId: string | null;
  day: DayKey;
}

// Topics and edges (RoadmapTopic, RoadmapTopicEdge rows).
/** From groundingChunks.web only; ≤ GROUND_SOURCES_SHOWN. */
export interface TopicSource {
  title: string;
  uri: string;
}
export interface TopicDraft {
  id: string | null;
  lineageId: string;
  /** S<n> (outline line n, 1-based), U<n> (intake Domain n), T<n> (every other topic). */
  key: string;
  /** 1..LAYERS_MAX. */
  layer: number;
  /** What is shown: the exact sample form, the aim's span, your words, or the Domain's name. */
  name: string;
  /** Server only, ≤ RAW_LABEL_MAX; never in a view. */
  rawName: string | null;
  nameOrigin: TopicOrigin;
  scope: TopicScope | null;
  placedBy: TopicPlacedBy;
  grounding: TopicGrounding;
  sources: TopicSource[];
  /** Samples holding the exact form (or the AIM span), 0..TOPIC_SAMPLES. */
  formVotes: number;
  /** Valid samples of the phase. */
  samples: number;
  /** Each voting sample's layer. */
  layerVotes: number[];
  decision: TopicDecision;
  /** Lineage id (MERGED). */
  mergedInto: string | null;
  chosen: boolean;
  /** DEEP = chosen in the last layer (the specialisation). */
  role: TopicRole;
  domainId: string | null;
  /** You bound it ([Use my Domain…], or a seed or pick you ticked). */
  bound: boolean;
  /** "Held when you began" (measured at accept). */
  heldDay: DayKey | null;
  /** "I know this". */
  skippedDay: DayKey | null;
  /** TopicFlag | BlockingFlag names that hid or dropped it. */
  flags: string[];
  notes: TopicNote[];
}
export interface EdgeDraft {
  id: string | null;
  /** For a cross-goal parent: CROSS_GOAL_PARENT_PREFIX + parentDomainId ("x:<id>"; the Domain is the parent; ruling 48). */
  parentLineageId: string;
  childLineageId: string;
  /** Cross-goal only. */
  parentDomainId: string | null;
  /** Cross-goal only. */
  parentRoadmapId: string | null;
  origin: EdgeOrigin;
  /** Valid LINK samples that chose it. */
  votes: number;
  /** Valid LINK samples for that child. */
  samples: number;
  /** A GEMINI edge counts as a parent only when drawn. */
  drawn: boolean;
  decision: EdgeDecision;
  /** C8. */
  match: EdgeMatch;
}
export interface TopicMap {
  layers: number;
  topics: TopicDraft[];
  edges: EdgeDraft[];
}
export interface TopicRunReport {
  dropped: Partial<Record<TopicDropReason, number>>;
  /** By TopicFlag or BlockingFlag. */
  droppedFlags: Partial<Record<string, number>>;
  hidden: Partial<Record<TopicHideReason, number>>;
  incoherentReasons: number;
  /** C10. */
  mergedSameDeeper: number;
  /** NONE mixed with keys. */
  linkVoids: number;
  /** Links you kept or picked. */
  linksConfirmed: number;
}

// The per-phase replies (as integrityOf reads them against the phase's schema).
export interface MapNameItem {
  name: string;
  scope: TopicScope;
}
export interface RateReply {
  difficulty: DiffKey;
  breadth: BreadthKey;
  reasons?: RatingReason[];
}
export interface MapReply {
  /** TOPIC_PROMPT_VERSION 4 (ruling N8): one milestone a layer, written before the names. */
  milestones?: Partial<Record<LayerKey, { title: string; hurdle: string; target: string }>>;
  place?: Record<string, LayerKey>;
  names?: Partial<Record<LayerKey, MapNameItem[]>>;
}
/** Child key → previous-layer keys, or ["NONE"]. */
export type LinkReply = Record<string, string[]>;
export interface DeeperReply {
  names: MapNameItem[];
}

// GROUND (RoadmapRun.grounding).
export type GroundReason =
  | "NO_METADATA"
  | "NO_QUERIES"
  | "NO_LINE"
  | "DUPLICATE_LINE"
  | "NOT_FOUND"
  | "URL_IN_TEXT"
  | "NO_SEARCH"
  | "NO_SUPPORT"
  | "TITLE_CHECK"
  | "BAD_OFFSETS"
  | "NOT_RUN"
  | "TRUNCATED";
export interface GroundKeyVerdict {
  key: string;
  verdict: GroundVerdict;
  sources: TopicSource[];
  counted: number;
  reason: GroundReason | null;
}
export interface GroundRunRecord {
  verdicts: Record<string, GroundKeyVerdict>;
  /** webSearchQueries, server only. */
  queries: string[];
  /** Every web chunk's title and uri, server only. */
  chunks: TopicSource[];
  titleMode: GroundTitleMode;
  titleCheck: "RAN" | "UNAVAILABLE";
  toolUsePromptTokenCount: number;
  /** A raw sample was cut at RAW_SAMPLE_MAX: never reused. */
  truncated: boolean;
}

// The Gemini mark (Domain.nameOrigin, Domain.originName).
export interface NamedPart {
  text: string;
  geminiNamed: boolean;
}

/** A Domain carries the Gemini mark: nameOrigin "GEMINI" and its name still the name Gemini gave (your rename removes the mark). */
export function geminiNamedOf(d: { name: string; nameOrigin?: string | null; originName?: string | null }): boolean {
  return d.nameOrigin === "GEMINI" && typeof d.originName === "string" && d.name === d.originName;
}

/**
 * `text` split at each exact, case-sensitive occurrence of a geminiNamed
 * name: left to right, the longest name matching at a position first, never
 * overlapping. The parts join back to `text` exactly; neighbouring plain
 * text is one part. With no geminiNamed name occurring: [{text, false}];
 * "" → [].
 */
export function namedPartsOf(text: string, domains: readonly { name: string; geminiNamed: boolean }[]): NamedPart[] {
  if (text === "") return [];
  const names = [...new Set(domains.filter((d) => d.geminiNamed && d.name.length > 0).map((d) => d.name))].sort((a, b) => b.length - a.length);
  const out: NamedPart[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const hit = names.find((n) => text.startsWith(n, i));
    if (hit === undefined) {
      plain += text[i];
      i += 1;
      continue;
    }
    if (plain) out.push({ text: plain, geminiNamed: false });
    plain = "";
    out.push({ text: hit, geminiNamed: true });
    i += hit.length;
  }
  if (plain) out.push({ text: plain, geminiNamed: false });
  return out;
}

// The actions' inputs (§22.14, §23.4).
/** createKey: a client nonce, [A-Za-z0-9_-]{8,64}. */
export type SaveTarget = { roadmapId: string } | { createKey: string };
export interface PauseChoices {
  aftercare: "KEEP" | "ARCHIVE";
  reason: string | null;
}
/** "Move the date by 23 days?" */
export interface ResumeChoices {
  redate: boolean;
}
export type LayerSetChange = { kind: "SET" | "FEWER" | "PLAN_FIRST"; layers: number };
export type TopicEdit = { kind: "RENAME"; name: string } | { kind: "MERGE"; into: string } | { kind: "REMOVE" };
export type ParentPick = { kind: "LINKS"; keys: string[]; crossGoal: { roadmapId: string; domainId: string }[] } | { kind: "LAYER" };
export interface AcceptTopicChoices {
  /** "Creates 9 Domains in Business & Finance": must equal the server's count. */
  create: number;
  /** The Gemini names the confirm listed, by name: must equal the server's set. */
  geminiNamed: string[];
  /** [Accept all]: what its list showed; null when every layer is kept. */
  keepAll: { names: string[]; links: number } | null;
  /**
   * A TOPICS accept over a live LEVELS milestone (question 8, ruling 49): the
   * milestone closes there, and its practices are kept on Today or archived,
   * through the aftercare path. Null when no milestone is live; acceptCore
   * refuses RACED when one is live and this is null.
   */
  aftercare: "KEEP" | "ARCHIVE" | null;
}

// A re-plan draft of another kind, and what an accept replaced (ruling 49; migration B's columns).
/**
 * Roadmap.draftPlan: the open re-plan draft's kind, depth and rating while
 * they differ from the live version's (a [Break into topics] draft of a
 * LEVELS plan). The live version's own planKind, depth and rating stay on
 * the row's columns, which change only inside acceptCore's transaction (and
 * undoAcceptCore's); every reader of the live plan reads the columns, never
 * this. Null with no such draft.
 */
export interface DraftPlan {
  /** The draft group's version (the live version + 1). */
  version: number;
  planKind: PlanKind;
  depth: TopicDepth | null;
  rating: RatingRecord | null;
}
/** RoadmapAcceptance.previousPlan: the kind, depth, rating and Domains an accept of another kind replaced; undoAcceptCore restores them. */
export interface PreviousPlan {
  planKind: PlanKind;
  depth: number | null;
  rating: RatingRecord | null;
  domainIds: string[];
}

// The views (lane 8 builds them, lane 9 renders them).
export interface RatingView {
  layers: number;
  origin: RatingOrigin;
  geminiLayers: number | null;
  mapFilled: number | null;
  unsure: { low: number; high: number } | null;
  oneReply: number | null;
  replies: (number | null)[];
  breadth: BreadthKey;
  room: { min: number; max: number };
  reasons: RatingReason[];
  cautions: Caution[];
  changes: LayerChange[];
  tail: number;
  appEstimate: number;
}
export interface TopicRowView {
  key: string;
  lineageId: string;
  name: string;
  cls: TopicClass;
  layer: number;
  chosen: boolean;
  canChoose: boolean;
  role: TopicRole;
  level: number | null;
  /**
   * crossGoal: another goal's Domain (slot null for a PAUSED goal, ruling 55); geminiNamed renders pv.named. The join
   * adds its ids (optional) so ParentsSheet can send the cross-goal parents back with setParents (ParentPick.crossGoal):
   * a save never drops them.
   */
  parents: { kind: "LINKS"; keys: string[]; crossGoal: { slot: GoalSlot | null; name: string; geminiNamed: boolean; roadmapId?: string; domainId?: string }[] } | { kind: "LAYER"; layer: number };
  children: string[];
  votes: { form: number; samples: number } | null;
  sources: TopicSource[];
  placed: "GEMINI" | "YOU" | "CODE";
  held: boolean;
  skipped: boolean;
  notes: TopicNote[];
  domain: { id: string; name: string; geminiNamed: boolean } | null;
}
export interface TopicLayerView {
  layer: number;
  state: "OPEN" | "AFTER" | "HELD" | "DONE";
  kept: boolean;
  topics: TopicRowView[];
  unchosen: number;
  hidden: number;
  geminiNames: boolean;
  emptyOffers: EmptyLayerOffer[] | null;
  needsParent: number;
  /** MAP's milestone for this layer (ruling N8): Gemini's words; absent or null when MAP wrote none. */
  milestone?: LayerMilestone | null;
}
export interface TopicMapView {
  roadmapId: string;
  version: number;
  rating: RatingView;
  layers: TopicLayerView[];
  hidden: number;
  cautions: Caution[];
  acceptRefusal: string | null;
  requestsLeft: { requests: number; grounded: number };
  /** Your free Domains of the Area, unticked; geminiNamed renders pv.named (a Domain kept from an earlier goal). */
  layerOneSeeds: { id: string; name: string; geminiNamed: boolean }[];
  lastLayerSeeds: AimClause[];
  /**
   * A draft's [Accept all] list, layer by layer (fixer 2): the shown PENDING Gemini names and the drawn Gemini links
   * still PENDING into each layer's shown topics; only layers holding either. acceptCore's keptAllOf compares exactly
   * this set (AcceptTopicChoices.keepAll: the names flat, the links summed), so the sheet and the server never differ.
   * Absent on a plan (and in fixtures made before it: the client then reads the rows).
   */
  acceptAll?: { layer: number; names: string[]; links: number }[];
  /** A draft over your hours or pace (its feasibility's over, or its date check OVER): [Accept all] asks for the keep-over switch. */
  needsOver?: boolean;
  /** Ruling N10: the goal's Area Field (where [Add an idea here] files ideas); null on a practice-only Area. Absent in fixtures made before it. */
  fieldId?: string | null;
}
export interface ChainFit {
  verdict: DateVerdict;
  minDays: number;
  layerMin: number[];
  tailMin: number[];
  endDay: DayKey | null;
  offers: ChainOffer[];
  basis: string;
  pastSpan: boolean;
  examMidChain: boolean;
}

/**
 * Why a breakdown stopped short (TopicChainView.stop; fix round): MAP's realism pre-check (OVER, IMPOSSIBLE; the
 * offers are TopicChainView.fit's), a GROUND wave whose web check failed or timed out, a request cap, MAP's replies
 * failing, a step past TOPIC_RUN_STALE_MS, or a Go deeper that named nothing narrower.
 */
export type TopicChainStop = "OVER" | "IMPOSSIBLE" | "GROUND_FAILED" | "REQUESTS_CAPPED" | "GROUNDED_CAPPED" | "MAP_FAILED" | "TIMED_OUT" | "NOTHING_DEEPER";
export const TOPIC_CHAIN_STOPS: readonly TopicChainStop[] = ["OVER", "IMPOSSIBLE", "GROUND_FAILED", "REQUESTS_CAPPED", "GROUNDED_CAPPED", "MAP_FAILED", "TIMED_OUT", "NOTHING_DEEPER"];

/**
 * A TOPICS draft's Gemini chain as the page drives it (RoadmapView.topicChain; ruling 47, fix round). The page's poll
 * (DraftRunning, the draft's chain card) calls advanceTopicChain while `done` is false; the stop says why the chain
 * ended short and what [Try again] calls. Code's words and figures only: never a Gemini name.
 */
export interface TopicChainView {
  /** The step running, else the newest step's phase. */
  phase: RunPhase | null;
  /** A step is RUNNING and younger than TOPIC_RUN_STALE_MS. */
  running: boolean;
  /** A step is RUNNING past TOPIC_RUN_STALE_MS (it reads "timed out" at the next claim). */
  stale: boolean;
  /** When the newest step was claimed (ISO): the wait card's "started …". */
  startedAt: string;
  /** When the chain's head was claimed (ISO): the weave's 90 s of motion count from here, once per breakdown (ui-motion §15.9). */
  headStartedAt: string;
  /** Nothing is left for the poll to claim (retry false); the poll stops. */
  done: boolean;
  /** Changes whenever a step is claimed or settles (the poll restarts its clock on a change). */
  key: string;
  stop: TopicChainStop | null;
  /** What [Try again] calls: the chain head again (breakDown), the next step with retry (advanceTopicChain), or nothing. */
  retry: "BREAK_DOWN" | "ADVANCE" | null;
  /** GROUND_FAILED: the names a failed web check left hidden. */
  unchecked: number;
  /** OVER, IMPOSSIBLE: the pre-check's verdict, its basis line and its offers. */
  fit: ChainFit | null;
  /** The server's own words for the stop (the caps' lines, NOTHING_DEEPER); null: the page's copy. */
  line: string | null;
  /** What Gemini did on this draft since you last wrote it (the header's lead): estimated the layers, mapped the topics. */
  gemini: { rated: boolean; mapped: boolean };
}

// Goals (§23).
export interface GoalSeatView {
  slot: GoalSlot;
  roadmapId: string | null;
  status: RoadmapStatus | null;
  label: string | null;
  areaName: string | null;
  hoursPerWeek: number | null;
}
export interface IntakeDraftView {
  roadmapId: string;
  slot: GoalSlot | null;
  intake: Intake;
  savedDay: DayKey;
  askHours: boolean;
}
export interface GoalPillView {
  roadmapId: string;
  slot: GoalSlot;
  label: string;
  labelIsYours: boolean;
  status: RoadmapStatus;
  rankIndex: number | null;
  proficiency: number | null;
  current: boolean;
}
export interface GoalSwitcherView {
  pills: GoalPillView[];
  /** A free seat under the effective cap: open goals < GOALS_MAX (never the fixed 3; ruling 53). */
  canAdd: boolean;
  other: { count: number; roadmapIds: string[] };
}
export interface GoalVerdictChange {
  roadmapId: string;
  slot: GoalSlot | null;
  label: string;
  from: DateVerdict | null;
  to: DateVerdict;
}
export interface GoalCueTexts {
  roadmapId: string;
  slot: GoalSlot | null;
  texts: CueTexts;
}
export interface GoalAvoids {
  roadmapId: string;
  slot: GoalSlot | null;
  status: RoadmapStatus;
  track: CatalogTrack;
  kinds: Partial<Record<CatalogKey, ActivityConfirmEntry>>;
}
