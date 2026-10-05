/**
 * The roadmap's server cores and loaders (roadmap lane R4: F2 core, F8, F9
 * cores, F15, F19 loader, F22). Server-only. A Server Action
 * (src/app/actions/roadmap.ts) wraps each core; a core takes the user id, so
 * it is never a "use server" export.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R4. Spec:
 * docs/life-plan/roadmap.md revision 3 (decisions 8, 10, 13–16, 19).
 *
 * How every write works (decision 13, 15):
 *   - With writes off (life-economy lifeWritesEnabled false: a dev server on
 *     the shared database) every user action refuses with ROADMAP_WRITES_OFF
 *     before it reads anything, and runDraftCore writes nothing.
 *   - A core reads, decides purely, and hands a list of StoreOps to
 *     RoadmapStore.apply: ONE claim-first array transaction behind
 *     pg_advisory_xact_lock(hashtext('roadmap:' || userId)), whose guard ops
 *     (SELECT 1 / 0 unless the rows still read as decided) make a double tap,
 *     two devices or a race harmless. A failed guard is 'stale': the core
 *     re-reads and decides again (at most ATTEMPTS times).
 *   - Every write invalidates 'roadmap' (and 'life'/'activity' when Start
 *     creates tasks). Loaders write nothing; the fallback quest freeze is the
 *     page's after() (R6).
 *
 * Injection (the checks never touch a database, Gemini or after()):
 *   RoadmapDeps.store  the roadmap tables (prismaRoadmapStore by default)
 *   RoadmapDeps.io     every other read and write (Field tree, throughput,
 *                      rest days, templates, goal mints, createTemplateCore,
 *                      createDomain, archiveCore)
 *   RoadmapDeps.lanes  the other lanes' functions (R1, R2, R3, R6), so this
 *                      lane's logic is checked against fixtures while theirs land
 *   RoadmapDeps.defer, callModel, clock, makeId, goalsLive (no sizing: a plan-born
 *   task is never sized or explained by a model, decision 50)
 *
 * The milestone title has no item row: the cores that take an item id
 * (decideItemCore, editItemCore, StartChoices.decisions/edits) read the
 * milestone's own id as its title. A Gemini title's flags, struck NUMBER
 * spans and reasons have no column either: they are derived on read with
 * R3's withLabelChecks (labelChecksOf, the one derivation: the review, Now,
 * the Start sheet, the Milestones list, the Aim card, the title refusals and
 * bulk keep), as are a flagged Gemini item's struck spans and reasons, and a
 * NUMBER title offers only Edit. The unverified-draft banner is R3's
 * unverifiedAlarmOf; a run's sample facts and the reuse's replies are R3's
 * runFactsOf and reusableSamplesOf; what a draft milestone still needs is
 * roadmap-types draftNeedsOf (fix round 2).
 *
 * Positions (fix round): a "Start again" copy and the row it replaces are one
 * milestone position (roadmap-types positionCountOf, maxScheduledPositionsOf);
 * a STARTED row whose lineage started again is superseded (isSupersededRow)
 * and is never current, live or measured here. One due day: the goal's once
 * started (milestoneDueDayOf) — in the views, and (fix round 2) in what the
 * planning engine reads (carriedPlanOf), which also leaves out a carried row
 * its copy replaces.
 *
 * Calls labelTextOf() (Start's Today-bound check) and no other brand
 * constructor; never writes the code-origin literal. Views get their branded
 * figures from R1 (measureFigureOf, milestoneHeadlineOf, proficiencyViewOf).
 *
 *   Intake      saveIntakeCore · loadIntakeView · discardDraftCore · undoDiscardCore · validateIntake
 *   Drafting    claimDraftCore · runDraftCore · buildStarterCore · startManualCore · claimPlanOf
 *   Review      decideItemCore · editItemCore · addItemCore · keepUnflaggedCore · resolveDomainCore · applyRemedyCore
 *   Accept      acceptCore · undoAcceptCore · acceptBlockersOf
 *   Start       startPreview · startMilestoneCore · finishStartCore · returnStartingCore · startAgainCore
 *   Measures    logCheckpointCore
 *   Lifecycle   replanCore · archiveRoadmapCore · markRoadmapDoneCore · practiceAftercare · keepOnTodayCore
 *   Views       loadRoadmapView · loadAimCard
 *
 * Revision 4 (docs/life-plan/roadmap-rev4.md; contracts §14), lane R4:
 *   - The one writer. writeRoadmapRows is the only code that inserts a
 *     RoadmapMilestone or RoadmapItem, or updates one's title, label,
 *     origin, titleOrigin or catalogKey; it calls assertNoModelText (the
 *     tripwire) first. roadmap-server-check greps that no such StoreOp is
 *     built anywhere else. A throw on a draft path fails the run and writes
 *     the plan from your numbers; on an action path the action refuses
 *     ("That change couldn't be saved.") with one log line.
 *   - Keys-only drafting (F-R4-17, F-R4-20): every reply is walked against the
 *     run's exact schema (R3's integrityOf; a reuse against the CURRENT
 *     schema). A REJECTED reply writes nothing of its own; the run is FAILED
 *     with report.integrity and the starter. A clean reply is validated
 *     (validateKeysOnly) and materialised into R2's stage ladder (slot →
 *     stage, merged and held slots into the next kept milestone, within the
 *     caps), then R2's syncStagePractices, feasibility and the date check.
 *   - Depth plans (F-R4-9 to F-R4-12): the intake's depth, coverage, date
 *     mode, exam and its date, the outline lines' Domains, named Domains and
 *     "Start again at a depth"; acceptance records the DateCheck, coverage
 *     choices, the depth choice and domainOrigins, writes held rows, refuses
 *     a plan with nothing left to do, numbers a re-planned "Start again"
 *     copy with its lineage's place, and takes the end state from the depth
 *     terms. lowerDepthCore is the only path that lowers a depth.
 *   - Gemini's choices, labelled and changeable (F-R4-21): Domain additions,
 *     session picks, line moves and line Domains.
 *   - Legacy plans (F-R4-16): no milestone or item text of a legacy version is
 *     returned by any view; Start, accept and the v2 decision paths refuse.
 *   - The aim invitation (F-R4-1 to F-R4-5): the Aim card's aimSuggestions
 *     and lastAim, Today's loadAimStep, the snooze cookies and the stored
 *     switch.
 *   - Production monitors (F-R4-20): ROADMAP_MONITOR_QUERIES, read-only SQL the
 *     lead runs after the deploy.
 *
 * Revision 4 fix round (contracts §15; lane R4's half of the reviews):
 *   - One draft step: draftFromReply (walk → REJECTED gate → validate and
 *     place → the tripwire's dry run) is what runDraftCore, reuseRun and the
 *     bar's hostileViewsOf all run; hostileViewsOf also returns R4's verdict
 *     and the page's own RoadmapView and AimCardView of the draft.
 *   - Coverage frozen at intake (frozenCoverageCountsOf): drafts carry their
 *     coverage, acceptances and a lowered depth freeze to it, and a coverage
 *     choice is recorded only for a typed figure that is new or changed.
 *   - Clean entry in the planning context (CardState.retryEntry, one REVIEW
 *     read of the cards at exactly the depth); a PART at the depth takes the
 *     gate below's rank; production practice and session picks by
 *     roadmap-catalog's one definition each; "n not shown" counts hidden and
 *     dropped gap names; the run's facts carry its integrity, re-made safe.
 *   - No model sizes or explains a plan-born task (Start defers no sizing);
 *     the tripwire refuses raw model words and proposed names on any row;
 *     a depth plan's counts are never typed; a legacy life-track plan can be
 *     replaced; [Keep the dates] and the LATER line's 'Not now' are recorded
 *     (keepCalibratedDatesCore, hideAimPromptCore).
 *
 * Revision 4 fix round 2 (contracts §16.9; lane R4):
 *   - One reading of the frozen counts (frozenCountsOf): the end state, a
 *     redrafted ladder (StageLadderOpts.counts) and the additions' date
 *     effect (dateEffectOf's counts, the bar's memo keyed on them), so a
 *     re-plan's final stage asks for exactly the end state's n_d.
 *   - Plan history flags a lowered depth from its record (depthLowered,
 *     R1's depthChangeLineOf); the Aim card carries a legacy plan's
 *     LegacyView; R1's rank assignment is given the depth.
 *   - No code label names a pending Gemini addition (withPendingHidden
 *     around R2's naming steps); a decision re-renders them over R.
 *   - The bar's views name themselves (HOSTILE_VIEW_NAMES) and add the
 *     week-quests view of the first milestone as if started.
 */
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";
import { isDuplicateActivity } from "./activity";
import { addDays, dateColumn, dayKeyOf, daysBetween, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "./life-day";
import { GOAL_MINT_PREFIX, GOAL_RULES, goalMintKey, isDayKey, lifeWritesEnabled, parseMintDetail, type LifeEnv } from "./life-economy";
import { isStaleGuard } from "./life-tracks-server";
import { heldDaysOf, type RestRow } from "./duty-rule";
import { newLifeSettingsData } from "./duty-economy";
import { isMissingRestDayTable } from "./rest-rules";
import { parseRule, scheduledPerWeek } from "./recurrence";
import { normTitleOf, sizeLexically } from "./life-lexicon";
import { EST_MINUTES_MAX, isBand } from "./life-grade";
import { weekQuestsFor, weekQuestsViewOf } from "./roadmap-quests";
import { hasGeminiKey } from "./gemini";
import { loadFieldTree } from "./queries";
import { loadMaintenanceIds } from "./field-focus";
import { loadModifiers } from "./skill-effects";
import { archiveCore, createTemplateCore, ledgerOf, readDayTaskEvents, readDayTotals, type CaptureLink } from "./tasks";
import { planCompletion, shortDate, type DayLedger, type PricedTemplate } from "./today-board";
import { goalAsOf, goalPercent, type GoalStep } from "./goals";
import type { CaptureSource, ParsedCapture, Track } from "./life-types";
import { statedForMilestone } from "./roadmap-economy";
import * as realism from "./roadmap-realism";
import * as evidence from "./roadmap-evidence";
import * as validate from "./roadmap-validate";
import * as model from "./roadmap-model";
import * as proficiency from "./roadmap-proficiency";
import * as measures from "./roadmap-measures";
import * as pace from "./roadmap-pace";
import * as questsServer from "./roadmap-quests-server";
import { scopePaceOf, type ThroughputRows } from "./throughput";
import { loadThroughput, loadThroughputRows } from "./throughput-server";
import { loadWeightView } from "./weight-server";
import { formatWeight, type WeightView } from "./weight";
import { questWeekInsertOp } from "./roadmap-quests-server";
import { proficiencyReadingFor, readingUpsertOp, seriesMilestoneOf as readingsSeriesMilestoneOf, type ReadingRow } from "./roadmap-readings";
import type { CallModel, SampleResult } from "./roadmap-model";
import {
  ACCEPT_UNDO_MS,
  ADHERENCE_MIN_JUDGED,
  AIM_MAX,
  BLOCKING_FLAGS,
  CALIBRATION_WEEKS,
  CHECKPOINT_KINDS,
  CHECKPOINT_LABEL_MAX,
  CHECKPOINTS_PER_MILESTONE,
  CLEARANCE_WINDOW_DAYS,
  CONSTRAINTS_MAX,
  DEFAULT_FIELD_TRACK,
  DOMAINS_PER_MILESTONE,
  EXAM_MAX,
  GEMINI_KEY_TIER,
  HOURS_MAX,
  HOURS_MIN,
  INTENSITIES,
  KEEP_SHARE,
  LATENCY_MIN_RUNS,
  MAX_MILESTONES,
  METHOD_DEFAULT_BAND,
  MILESTONE_MIN_DAYS,
  MILESTONE_TITLE_MAX,
  NEW_CARDS_PER_WEEK_MAX,
  NEW_CARDS_PER_WEEK_MIN,
  PACK_MAX_DOMAINS,
  PASS_SHARE_MIN_REVIEWS,
  PRACTICE_BANDS,
  PRACTICE_METHODS,
  PRACTICE_NAME_MAX,
  PRACTICES_PER_MILESTONE,
  RANK_NEW_DAYS,
  RAW_LABEL_MAX,
  REACH_CONFIRM_DAYS,
  ROADMAP_DRAFTS_PER_DAY,
  ROADMAP_GOALS_LIVE,
  ROADMAP_GEMINI_LIVE,
  GEMINI_DRAFTING_OFF,
  ROADMAP_MODEL,
  ROADMAP_PROMPT_VERSION,
  ROADMAP_REUSE_DAYS,
  ROADMAP_SAMPLES,
  ROADMAP_TRACKS,
  ROADMAP_WRITES_OFF,
  RUN_CLAIM_GUARD_MS,
  RUN_STALE_MS,
  SEED_BASE,
  SESSIONS_MAX,
  SESSIONS_MIN,
  SOURCE_NOTE_MAX,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  START_MIN_DAYS_TO_DUE,
  START_POINTS,
  STARTING_STALE_MS,
  STEP_TITLE_MAX,
  STEPS_PER_MILESTONE,
  SYLLABUS_LINE_MAX,
  SYLLABUS_MAX_LINES,
  TARGET_LOWERED_SHOW_DAYS,
  THRESHOLDS,
  THROUGHPUT_LAG_DAYS,
  TOP_LEVEL,
  TOPIC_LABEL_MAX,
  TOPICS_PER_MILESTONE,
  TYPICAL_HOURS_MAX,
  TYPICAL_HOURS_MIN,
  RUN_FALLBACK_STARTER,
  acceptedRunOf,
  aimRankName,
  cardsAtLevelKey,
  checkpointLogKey,
  checkpointLogPrefix,
  countsTowardDraftCap,
  domainName,
  draftNeedsOf,
  effectiveState,
  isCredentialAim,
  isMissingRoadmapTable,
  isNewerRow,
  isPlaceholderItem,
  isSupersededRow,
  isUndecidedItem,
  labelTextOf,
  maxScheduledPositionsOf,
  milestoneDueDayOf,
  milestoneGoalKey,
  milestonePracticeKey,
  milestoneStepKey,
  minIncrementCards,
  otherTrackedMinutesOf,
  packText,
  parseMeasureKey,
  plannedUnits,
  positionCountOf,
  practiceBandMinutes,
  practiceKeptKey,
  practiceMinutesPerWeekOf,
  proficiencyKey,
  provenanceOf,
  rowsWriterOf,
  runWriterOf,
  startStatedInputOf,
  weakest,
  type AcceptChoices,
  type AftercareRow,
  type AimCardMilestone,
  type AimCardState,
  type AimCardView,
  type AimCheck,
  type AimRankView,
  type AreaChip,
  type BlockingFlag,
  type CardState,
  type CheckpointKind,
  type ComputedClass,
  type CurrentMilestoneView,
  type Decision,
  type DomainName,
  type DomainResolution,
  type DraftView,
  type EndStateTerm,
  type EvidencePack,
  type Feasibility,
  type Intake,
  type IntakeFieldOption,
  type IntakeView,
  type Intensity,
  type ItemDecisionChoice,
  type ItemDraft,
  type ItemEdit,
  type ItemKind,
  type ItemNote,
  type LibraryDomain,
  type MeasureRowView,
  type MeasureScope,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneFeasibility,
  type MilestoneNote,
  type MilestoneRowState,
  type MilestoneRowView,
  type MilestoneStatus,
  type Origin,
  type PaceResult,
  type PlanHistoryRow,
  type PracticeBand,
  type PracticeMethod,
  type ProficiencyBasis,
  type ProficiencyRebaseCause,
  type ProficiencyView,
  type RateSource,
  type Reading,
  type RealismInput,
  type RealismScope,
  type Remedy,
  type ReplanKind,
  type RoadmapActionResult,
  type RoadmapHeader,
  type RoadmapStatus,
  type RoadmapView,
  type RoadmapViewState,
  type RoadmapWriteOpts,
  type RunKind,
  type RunStatus,
  type RunView,
  type ShareFigure,
  type StartChoices,
  type StartPayBasis,
  type StartPoint,
  type StartPracticeRow,
  type StartPreview,
  type StartSnapshot,
  type Syllabus,
  type TargetLowered,
  type TextClass,
  type Throughput,
  type TodayBoundRow,
  type TowardAimView,
  type TriggerHit,
  type ValidatedDraft,
  type ValidationReport,
  type WeekQuestSet,
  type WeekQuestSource,
  type WeekQuestsView,
  type WeeklyFigure,
} from "./roadmap-types";
import {
  AIM_DEPTHS,
  COVER_MAX,
  COVER_MIN,
  DATE_MODES,
  DEPTH_DEFAULT,
  DEPTH_DOMAINS_MAX,
  DEPTH_KEYS,
  REACH_MODEL_VERSION,
  REPORT_EXTRA_SEGMENT,
  REPORT_PATH_SEGMENT_MAX,
  ROADMAP_GAPS_LIVE,
  STAGE_KEYS,
  STAGE_LEVEL,
  STORED_CHECKPOINT_KINDS,
  TRACK_STAGE_KEYS,
  gapsNotShownOf,
  integrityVerdictOf,
  isAimDepth,
  isLegacyRoadmap,
  isMissingRev4Column,
  isRecallType,
  isRetryEntry,
  isStageKey,
  paragonMissingOf,
  rankIndexForStage,
  reachInputsOf,
  retryReadDaysOf,
  acceptanceOrderBy,
  stageOfLevel,
  coveragePolicyOf,
  frozenCoverageCountsOf,
  isDepthLoweringRecord,
  writeNeedOf,
  domainsShort,
  yoursText,
  type AimDepth,
  type AimStep,
  type AimStepMilestone,
  type CalibratingInput,
  type ConstraintExclusion,
  type CoverageBreakdown,
  type CoverageChoice,
  type CoverageCounts,
  type DateCheck,
  type DateMode,
  type DepthChoice,
  type DepthRankInput,
  type DepthView,
  type DomainAddition,
  type DomainOrigins,
  type DraftFromReplyResult,
  type GapView,
  type IntakeDateChip,
  type IntegrityViolation,
  type LastAimView,
  type LegacyView,
  type ParagonMissing,
  type PastWeekView,
  type ReviewLedgerRow,
  type SessionPicks,
  type ValidationIntegrity,
  type WeekQuestCardInput,
  type WeekQuestCheckpointInput,
  type WeekQuestPracticeInput,
  type WeekQuestStepInput,
} from "./roadmap-types";
import {
  BODY_SAFE_KINDS,
  catalogKindsFor,
  catalogEntryOf,
  catalogLabelOf,
  catalogOriginOf,
  catalogTrackOf,
  isCatalogKey,
  isSessionPickKind,
  practiceRoleOf,
  type CatalogKey,
  type CatalogTrack,
} from "./roadmap-catalog";
import {
  AIM_DONE_SHOW_DAYS,
  AIM_PROMPT_COOKIE,
  AIM_PROMPT_LATER_MAX_AGE_S,
  AIM_STEP_COOKIE,
  AIM_STEP_COOKIE_MAX_AGE_S,
  hideCookieValue,
  laterCookieValue,
  onCookieValue,
  stepCookieValue,
} from "./roadmap-invite";

// ═══ Rows: the roadmap tables as plain records (DATE columns as DayKeys) ════

export interface RoadmapRec {
  id: string;
  userId: string;
  aim: string;
  fieldId: string | null;
  domainIds: string[];
  track: string;
  startDay: DayKey;
  targetDay: DayKey;
  hoursPerWeek: number;
  newCardsPerWeek: number | null;
  typicalHours: number | null;
  typicalHoursSource: string | null;
  syllabus: unknown;
  startPoint: string;
  intensity: string;
  practicesAllowed: boolean;
  constraints: string | null;
  examLabel: string | null;
  status: string;
  version: number;
  firstAcceptedDay: DayKey | null;
  reachedDay: DayKey | null;
  doneAt: Date | null;
  doneReason: string | null;
  archivedAt: Date | null;
  archiveReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  // ── Revision 4 (migration 20261106000000_life_roadmap_rev4). Optional: a row read before it reads as absent. ──
  /** 12, 10 or 8 on a Field Area; null on a track Area or a legacy plan. */
  depth?: number | null;
  /** REALISTIC (only on a DRAFT) or CHOSEN. */
  dateMode?: string | null;
  /** {[domainId]: n}: the user's typed figures (YOURS). */
  coverage?: unknown;
  /** Read only while ROADMAP_GAPS_LIVE. */
  suggestAreas?: boolean | null;
  /** The user's exam date (YOURS): a waypoint, never the aim's date, never sent to Gemini. */
  examDay?: DayKey | null;
}

export interface RunRec {
  id: string;
  roadmapId: string;
  userId: string;
  day: DayKey;
  version: number;
  kind: string;
  status: string;
  model: string | null;
  modelVersion: string | null;
  promptVersion: number | null;
  seedBase: number | null;
  inputHash: string | null;
  /** null in a bundle (light rows); read with store.run. */
  pack: unknown;
  samples: unknown;
  report: unknown;
  usage: unknown;
  responseIds: string[];
  finishReasons: string[];
  latencyMs: number | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface MilestoneRec {
  id: string;
  roadmapId: string;
  version: number;
  lineageId: string;
  ord: number;
  title: string;
  titleOrigin: string;
  titleDecision: string;
  windowStart: DayKey | null;
  dueDay: DayKey | null;
  status: string;
  goalId: string | null;
  startedDay: DayKey | null;
  startingAt: Date | null;
  reachedDay: DayKey | null;
  reachPendingDay: DayKey | null;
  overAccepted: boolean;
  feasibility: unknown;
  rankIndex: number | null;
  createdAt: Date;
  /** Revision 4: a StageKey; null (or absent) on a legacy row. */
  stage?: string | null;
}

export interface ItemRec {
  id: string;
  milestoneId: string;
  lineageId: string;
  kind: string;
  ord: number;
  label: string;
  rawLabel: string | null;
  origin: string;
  decision: string;
  decidedAt: Date | null;
  domainId: string | null;
  proposedName: string | null;
  syllabusRef: number | null;
  method: string | null;
  sessionsPerWeek: number | null;
  durationBand: string | null;
  rule: string | null;
  planSource: string | null;
  checkpointKind: string | null;
  outOf: number | null;
  bar: number | null;
  addToToday: boolean;
  templateId: string | null;
  flags: string[];
  notes: string[];
  createdAt: Date;
  /** Revision 4: a roadmap-catalog.ts key, or null (or absent). */
  catalogKey?: string | null;
}

export interface MeasureRec {
  id: string;
  milestoneId: string;
  kind: string;
  role: string;
  scope: unknown;
  minLevel: number | null;
  target: number;
  targetSource: string;
  fittedTarget: number | null;
  rateSource: string | null;
  baseline: number | null;
  baselineDay: DayKey | null;
  unit: string | null;
  itemLineageId: string | null;
  measureKey: string | null;
  createdAt: Date;
}

export interface AcceptanceRec {
  id: string;
  roadmapId: string;
  version: number;
  day: DayKey;
  acceptedAt: Date;
  previousVersion: number;
  feasibility: unknown;
  endState: unknown;
  intervalMultiplier: number;
  overAccepted: boolean;
  undoneAt: Date | null;
}

export interface MilestoneBundle extends MilestoneRec {
  items: ItemRec[];
  measures: MeasureRec[];
}

/** One roadmap and everything under it, read in one round trip. */
export interface RoadmapBundle {
  roadmap: RoadmapRec;
  /** Newest first; light (pack, samples, report and usage are null). */
  runs: RunRec[];
  /** Every version, by version then ord. */
  milestones: MilestoneBundle[];
  /** By acceptedAt. */
  acceptances: AcceptanceRec[];
}

// ═══ The store: the roadmap tables, and one guarded write path ══════════════

export type StoreTable = "roadmap" | "roadmapRun" | "roadmapMilestone" | "roadmapItem" | "roadmapMeasure" | "roadmapAcceptance";

export type WhereValue = string | number | boolean | null | { in: readonly (string | number)[] };
export type Where = Readonly<Record<string, WhereValue>>;

/**
 * The conditions a write re-checks after the lock (SELECT 1 / 0 unless true).
 * Each is what the core read before deciding; a failure is 'stale'.
 */
export type StoreGuard =
  /** No DRAFT or ACTIVE roadmap of the user other than exceptId. */
  | { g: "NO_OTHER_OPEN"; exceptId: string | null }
  /** No ACTIVE roadmap of the user other than exceptId. */
  | { g: "NO_OTHER_ACTIVE"; exceptId: string | null }
  /** The user's roadmap is in one of these statuses (and at this version, with this archive reason, and with no depth: a legacy plan). */
  | { g: "ROADMAP_IS"; id: string; statuses: readonly RoadmapStatus[]; version?: number; archiveReason?: string; depthNull?: boolean }
  /** Revision 4: no milestone of the roadmap is STARTING or STARTED ("Start again at a depth" replaces only a plan nothing started on). */
  | { g: "NO_STARTED_MILESTONE"; roadmapId: string }
  /** No run of the roadmap is RUNNING and started after `since`. */
  | { g: "NO_RECENT_RUNNING"; roadmapId: string; since: Date }
  /** Today's GEMINI runs of the user (any status but REUSED) number fewer than max. */
  | { g: "GEMINI_RUNS_BELOW"; day: DayKey; max: number }
  | { g: "RUN_IS"; id: string; status: RunStatus }
  /** The user's milestone is in one of these statuses (and has no goal). */
  | { g: "MILESTONE_IS"; id: string; statuses: readonly MilestoneStatus[]; goalIdNull?: boolean }
  /**
   * No other milestone of the roadmap is STARTING, or STARTED with an open
   * goal, superseded rows aside (a STARTED row whose lineage has a newer
   * STARTING or STARTED row: roadmap-types isSupersededRow).
   */
  | { g: "NO_OTHER_LIVE_MILESTONE"; roadmapId: string; exceptId: string }
  | { g: "ACCEPTANCE_OPEN"; id: string }
  /** No milestone of the roadmap was claimed (startingAt) after `since`. */
  | { g: "NOTHING_STARTED_SINCE"; roadmapId: string; since: Date }
  /** No DRAFT or LATER row at this version (an undone discard would collide with a newer draft). */
  | { g: "NO_DRAFT_ROWS"; roadmapId: string; version: number };

export type StoreOp =
  | { op: "guard"; guard: StoreGuard }
  | { op: "insert"; table: StoreTable; rows: readonly Record<string, unknown>[] }
  | { op: "update"; table: StoreTable; where: Where; data: Record<string, unknown> }
  /** Deleting milestones cascades to their items, measures and quest weeks (the migration's foreign keys). */
  | { op: "delete"; table: StoreTable; where: Where }
  /** Computed readings through R1's upsert (today only; source and observedAt guarded). */
  | { op: "readings"; rows: readonly ReadingRow[]; observedAt: Date }
  /** A checkpoint log: INSERT … ON CONFLICT DO NOTHING under its SELF key (append-only). */
  | { op: "selfLog"; id: string; measureKey: string; day: DayKey; value: number; detail: unknown; at: Date }
  /** A week's quest set through R6's insert (ON CONFLICT ("userId","dedupeKey") DO NOTHING). */
  | { op: "questWeek"; roadmapId: string; set: WeekQuestSet; source: WeekQuestSource; now: Date }
  /**
   * "Keep on Today" (practice aftercare): appends templateId to the user's
   * milestone's feasibility.aftercareKept (StartSnapshot.aftercareKept) in
   * place, unless it is there already. One atomic jsonb update, so two taps
   * on two practices never overwrite each other.
   */
  | { op: "keepAftercare"; milestoneId: string; templateId: string };

/** 'stale': a guard failed (re-read and decide again). 'duplicate': a unique key said the write already landed. */
export type ApplyResult = "ok" | "stale" | "duplicate";

/** A measure with a measureKey and the goal of its milestone (high-water baselines, decision 10). */
export interface KeyedMeasure {
  measureKey: string;
  target: number;
  goalId: string | null;
}

export interface RoadmapStore {
  listRoadmaps(userId: string): Promise<RoadmapRec[]>;
  bundle(userId: string, roadmapId: string): Promise<RoadmapBundle | null>;
  /** The roadmap an item, milestone, item lineage or run belongs to (the user's own only). */
  ownerOf(userId: string, ref: { itemId?: string; milestoneId?: string; lineageId?: string }): Promise<string | null>;
  /** A run in full (pack, samples, report). */
  run(runId: string): Promise<RunRec | null>;
  /** The user's runs claimed on a life day (light). */
  runsOfDay(userId: string, day: DayKey): Promise<RunRec[]>;
  /** OK GEMINI runs with this hash claimed on or after sinceDay, newest first (full). */
  reusableRuns(userId: string, inputHash: string, sinceDay: DayKey): Promise<RunRec[]>;
  /** Measures with these keys across the user's roadmaps. */
  measuresWithKeys(userId: string, keys: readonly string[]): Promise<KeyedMeasure[]>;
  /** COMPUTED readings of these keys dated on or after fromDay. */
  readings(userId: string, keys: readonly string[], fromDay: DayKey): Promise<Reading[]>;
  /** SELF readings (checkpoint logs) under these key prefixes. */
  selfLogs(userId: string, prefixes: readonly string[]): Promise<Reading[]>;
  /**
   * The interval multiplier m recorded on the roadmap's current acceptance
   * (acceptanceOrderBy, undone ones skipped: the one R1's readings read), or
   * null with none. planContext's clean-entry window reads the wider of it
   * and the live m (retryEntriesOf).
   */
  acceptanceMultiplier(userId: string, roadmapId: string): Promise<number | null>;
  /** One claim-first array transaction behind the roadmap advisory lock. */
  apply(userId: string, ops: readonly StoreOp[]): Promise<ApplyResult>;
}

// ═══ Everything else the cores read or write (injectable) ═══════════════════

export interface TreeCard {
  /** Idea.id: the clean-entry read keys a card's REVIEW ledger rows by it (planContext). Absent in fixtures that don't set it. */
  id?: string;
  domainId: string;
  level: number;
  dueDay: DayKey;
  graceEndsDay: DayKey | null;
  createdDay: DayKey;
  title: string | null;
  tags: string[];
  /** Revision 4: the card's question type; a depth plan counts recall cards only (isRecallType: every type but MULTI). Absent: counted. */
  type?: string | null;
}

export interface TreeDomain {
  id: string;
  name: string;
  fieldId: string;
  /** Domain.level (the library's "Domain level 5"); absent in fixtures that don't set it. */
  level?: number;
  cards: TreeCard[];
}

export interface TreeField {
  id: string;
  name: string;
  level: number;
  domains: TreeDomain[];
}

/** A task template as the roadmap reads it (no MP word in the name: `stated` is its goalMp). */
export interface TemplateLite {
  id: string;
  title: string;
  normTitle: string;
  kind: string;
  recurrence: string | null;
  parentId: string | null;
  archivedAt: Date | null;
  closedScore: number | null;
  completedAt: Date | null;
  dueDay: DayKey | null;
  stated: number | null;
}

export interface CreateTemplateOpts {
  rawText: string;
  captureSource: CaptureSource;
  captureKey?: string | null;
  now?: Date;
  link?: CaptureLink;
}

export type CreateDomainResult = { ok: true; value: { id: string; name: string; fieldId: string } } | { ok: false; error: string };

export interface RoadmapIo {
  fieldTree(): Promise<TreeField[]>;
  throughput(userId: string, finalDay: DayKey): Promise<Throughput>;
  /** The rows throughput is computed from (R2 throughput-server loadThroughputRows, cached): a card scope's own pace is read from them (scopePaceOf). */
  throughputRows(userId: string, finalDay: DayKey): Promise<ThroughputRows>;
  /** Today's ledger (tasks.ts readDayTotals + readDayTaskEvents → ledgerOf): what the Start sheet prices a practice against. */
  dayLedger(userId: string, today: DayKey): Promise<DayLedger>;
  /** weight-server loadWeightView: a Body Area's weight context line (F18). */
  weightView(userId: string, now: Date): Promise<WeightView>;
  maintenanceIds(userId: string): Promise<Set<string>>;
  intervalMultiplier(userId: string): Promise<number>;
  restRows(userId: string, from: DayKey, to: DayKey): Promise<RestRow[]>;
  templates(userId: string, ids: readonly string[]): Promise<TemplateLite[]>;
  /** goalId → the day its 'mp:GOAL:<id>' row paid (qty > 0). */
  goalPayments(userId: string, goalIds: readonly string[]): Promise<Record<string, DayKey>>;
  /** The days paying MID goal closes landed in the rolling window ending today. */
  midGoalPaidDays(userId: string, today: DayKey): Promise<DayKey[]>;
  /** tasks.ts createTemplateCore (idempotent by captureKey). */
  createTemplate(userId: string, parsed: ParsedCapture, opts: CreateTemplateOpts): Promise<{ id: string }>;
  /** taxonomy createDomain. */
  createDomain(fieldId: string, name: string): Promise<CreateDomainResult>;
  /** tasks.ts archiveCore (the aftercare and the archive's goal). */
  archiveTemplate(userId: string, templateId: string, now: Date): Promise<{ ok: true } | { ok: false; error: string }>;
  // ── Revision 4 ──
  /** The loadout's reach modifiers (skill-effects loadModifiers): the interval multiplier, extra strikes and grace days (F-R4-8). */
  reachModifiers(userId: string): Promise<{ intervalMultiplier: number; extraStrikes: number; graceExtraDays: number }>;
  /** LifeSettings.aimSuggestions and epochDay (one indexed select); null when the row doesn't exist. A missing column throws (isMissingRev4Column). */
  aimSettings(userId: string): Promise<{ aimSuggestions: boolean | null; epochDay: DayKey } | null>;
  /** Writes LifeSettings.aimSuggestions (the row is created like every other: newLifeSettingsData). */
  writeAimSuggestions(userId: string, on: boolean, today: DayKey): Promise<void>;
  /** The latest DAY_OPEN ledger row dated before today (one indexed read), or null. */
  lastDayOpenBefore(userId: string, today: DayKey): Promise<DayKey | null>;
  /** Domain ids created from a GAP in any of the user's roadmaps (DOMAIN items with ItemNote FROM_SUGGESTION; one indexed read): they never ground a later suggestion (F-R4-19). */
  suggestionDomainIds(userId: string): Promise<string[]>;
  /**
   * Fix round (clean entry, contracts §15.1): the REVIEW ledger rows of these
   * cards (ActivityEvent by userId, source REVIEW and sourceId; one indexed
   * read) dated on or after fromDay, by card id. planContext reads them for
   * the cards at exactly the depth, as R1's loadCardCounts does.
   */
  reviewRows(userId: string, cardIds: readonly string[], fromDay: DayKey): Promise<Record<string, ReviewLedgerRow[]>>;
}

/** The other lanes' functions this lane calls (the checks swap in fixtures). */
export interface RoadmapLanes {
  splitWindows: typeof realism.splitWindows;
  fitPlan: typeof realism.fitPlan;
  feasibilityOf: typeof realism.feasibilityOf;
  applyRemedy: typeof realism.applyRemedy;
  starterLadder: typeof realism.starterLadder;
  manualLadder: typeof realism.manualLadder;
  refit: typeof realism.refit;
  refitForStart: typeof realism.refitForStart;
  startSnapshotOf: typeof realism.startSnapshotOf;
  buildEvidencePack: typeof evidence.buildEvidencePack;
  inputHashMaterial: typeof evidence.inputHashMaterial;
  validateSample: typeof validate.validateSample;
  checkLabel: typeof validate.checkLabel;
  /**
   * R3's on-read derivation of a Gemini title's flags, struck NUMBER spans
   * and reasons, and a flagged item's (fix round 2: the one definition; the
   * views, the title refusals and bulk keep all read it).
   */
  withLabelChecks: typeof validate.withLabelChecks;
  isNonEnglish: typeof validate.isNonEnglish;
  bulkKeepAllowed: typeof validate.bulkKeepAllowed;
  draftSamples: typeof model.draftSamples;
  seedBaseFor: typeof model.seedBaseFor;
  assignRankIndices: typeof proficiency.assignRankIndices;
  proficiencyBasisOf: typeof proficiency.proficiencyBasisOf;
  /** R1's PROFICIENCY row for a plan decision (reads today's cards, practice and reaches; rebases on a basis change). */
  proficiencyReadingFor: typeof proficiencyReadingFor;
  proficiencyViewOf: typeof proficiency.proficiencyViewOf;
  aimRankOf: typeof proficiency.aimRankOf;
  practiceKeptValue: typeof measures.practiceKeptValue;
  lastReadingOn: typeof measures.lastReadingOn;
  milestoneGOn: typeof measures.milestoneGOn;
  milestoneHeadlineOf: typeof measures.milestoneHeadlineOf;
  measureFigureOf: typeof measures.measureFigureOf;
  checkpointStandingOf: typeof measures.checkpointStandingOf;
  projectCards: typeof pace.projectCards;
  projectPractice: typeof pace.projectPractice;
  triggersOf: typeof pace.triggersOf;
  weekQuestSetFor: typeof questsServer.weekQuestSetFor;
  loadWeekQuests: typeof questsServer.loadWeekQuests;
  loadPastWeeks: typeof questsServer.loadPastWeeks;
  weekQuestsViewFor: typeof questsServer.weekQuestsViewFor;
  // ── Revision 4 (R2's realism, R3's model and validation) ──
  coverageOf: typeof realism.coverageOf;
  lineDomainDefaultOf: typeof realism.lineDomainDefaultOf;
  depthTermsOf: typeof realism.depthTermsOf;
  stageLadderOf: typeof realism.stageLadderOf;
  dateCheckOf: typeof realism.dateCheckOf;
  lowerDepthPlanOf: typeof realism.lowerDepthPlanOf;
  dateEffectOf: typeof realism.dateEffectOf;
  floorDayOf: typeof realism.floorDayOf;
  syncStagePractices: typeof realism.syncStagePractices;
  buildResponseSchema: typeof model.buildResponseSchema;
  integrityOf: typeof validate.integrityOf;
  validateKeysOnly: typeof validate.validateKeysOnly;
  constraintExclusionsOf: typeof validate.constraintExclusionsOf;
}

/** What the cores take besides their arguments; the checks inject every one (no prisma, no after(), no Gemini). */
export interface RoadmapDeps extends RoadmapWriteOpts {
  /** after() in production: the draft's model call runs here (Start defers nothing: no model sizes a plan-born task). */
  defer?: (task: () => Promise<void> | void) => void;
  /** roadmap-model's call; the default refuses under ROADMAP_CHECK. */
  callModel?: CallModel;
  store?: RoadmapStore;
  io?: Partial<RoadmapIo>;
  lanes?: Partial<RoadmapLanes>;
  /** The clock runDraftCore reads (the other cores take `now`). */
  clock?: () => Date;
  /** Mints row ids (crypto.randomUUID by default). */
  makeId?: () => string;
  /** The Start gate; ROADMAP_GOALS_LIVE unless a check sets it. */
  goalsLive?: boolean;
  /** The Gemini drafting gate; ROADMAP_GEMINI_LIVE unless a check sets it. */
  geminiLive?: boolean;
}

/** Gemini drafting is offered only when the switch is on AND a key exists (rev 4 P0). */
function geminiOffered(): boolean {
  return ROADMAP_GEMINI_LIVE && hasGeminiKey();
}

// ═══ Copy the cores answer with (refusals in words) ═════════════════════════

export const RACED = "Something changed at the same moment. Try again.";
export const NO_ROADMAP = "That roadmap no longer exists.";
export const ANOTHER_ACTIVE = "Another roadmap is active. Archive it to start another.";
export const DRAFT_RUNNING = "A draft is already running.";
/** The one cap copy: roadmap-model's DRAFT_CAP_LINE (the claim refuses with it; RunView.capped shows it). */
export const DRAFT_CAPPED = model.DRAFT_CAP_LINE;
export const GATE_OFF = "Starting milestones arrives with the next update.";
export const NOTHING_MEASURES = "Nothing here would measure progress — keep a practice on, or add a Domain.";
export const DUE_TOO_SOON = `This milestone needs at least ${START_MIN_DAYS_TO_DUE} days to its due day — re-fit the dates.`;
export const STARTED_ELSEWHERE = "Another milestone of this roadmap is starting or open. Close it first.";
export const DISCARDED_REASON = "Discarded draft";
export const NAME_THIS_PRACTICE = "Name this practice.";
/** A NUMBER-flagged Gemini title offers only Edit (F6): Keep and "I checked this" refuse with this. */
export const TITLE_NUMBER = "Gemini wrote a number in this title; edit it.";
/** Revision 4: Keep is retired (Gemini writes no words to keep). */
export const NOTHING_TO_KEEP = "Nothing here needs keeping: the app and you wrote these words.";
/** Revision 4: "I checked this" remains only for an area suggestion (F-R4-19). */
export const NOTHING_TO_CHECK = "Nothing here needs a check: the app and you wrote these words.";
/** An empty title is named, never kept or checked. */
export const NAME_IT_FIRST = "Name this milestone first.";
/** acceptCore after a Start the re-plan never saw (fix round): the draft is stale. */
export const REPLAN_STALE = "The plan changed since this re-plan was drafted — re-plan again.";
/** startRefusal: a lineage reached once is never started again. */
export const LINEAGE_REACHED = "This milestone was already reached.";

const ATTEMPTS = 3;
const UNDO_SLACK_MS = 20_000;
/** How far back views read readings (the last reading ≤ a day is never older in practice). */
const READINGS_LOOKBACK_DAYS = 120;
const TRACK_NAMES: Readonly<Record<Track, string>> = { BODY: "Body", CARE: "Care", DUTY: "Duty", CRAFT: "Craft" };

type Result<T> = RoadmapActionResult<T>;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

// ═══ The Prisma store ═══════════════════════════════════════════════════════

const DATE_FIELDS: Readonly<Record<StoreTable, readonly string[]>> = {
  roadmap: ["startDay", "targetDay", "firstAcceptedDay", "reachedDay", "examDay"],
  roadmapRun: ["day"],
  roadmapMilestone: ["windowStart", "dueDay", "startedDay", "reachedDay", "reachPendingDay"],
  roadmapItem: [],
  roadmapMeasure: ["baselineDay"],
  roadmapAcceptance: ["day"],
};

const JSON_FIELDS: Readonly<Record<StoreTable, readonly string[]>> = {
  roadmap: ["syllabus", "coverage"],
  roadmapRun: ["pack", "samples", "report", "usage"],
  roadmapMilestone: ["feasibility"],
  roadmapItem: [],
  roadmapMeasure: ["scope"],
  roadmapAcceptance: ["feasibility", "endState"],
};

function toDbValue(table: StoreTable, key: string, v: unknown): unknown {
  if (DATE_FIELDS[table].includes(key)) {
    if (v == null) return null;
    if (typeof v === "string") return dateColumn(v);
    return v;
  }
  if (JSON_FIELDS[table].includes(key)) {
    if (v == null) return Prisma.DbNull;
    return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
  }
  return v;
}

function toDbData(table: StoreTable, data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) out[k] = toDbValue(table, k, v);
  return out;
}

function toDbWhere(table: StoreTable, where: Where): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(where)) {
    if (v != null && typeof v === "object") {
      out[k] = { in: v.in.map((x) => (DATE_FIELDS[table].includes(k) && typeof x === "string" ? dateColumn(x) : x)) };
    } else if (v === null) {
      out[k] = null;
    } else {
      out[k] = DATE_FIELDS[table].includes(k) && typeof v === "string" ? dateColumn(v) : v;
    }
  }
  return out;
}

function fromDbRow<T>(table: StoreTable, row: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of DATE_FIELDS[table]) {
    const v = out[k];
    out[k] = v instanceof Date ? keyOfDateColumn(v) : (v ?? null);
  }
  return out as T;
}

/** The delegates' shared surface, so one write path serves every table. */
interface LooseDelegate {
  createMany(args: { data: Record<string, unknown>[] }): Prisma.PrismaPromise<unknown>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Prisma.PrismaPromise<unknown>;
  deleteMany(args: { where: Record<string, unknown> }): Prisma.PrismaPromise<unknown>;
}

function delegateOf(table: StoreTable): LooseDelegate {
  switch (table) {
    case "roadmap":
      return prisma.roadmap as unknown as LooseDelegate;
    case "roadmapRun":
      return prisma.roadmapRun as unknown as LooseDelegate;
    case "roadmapMilestone":
      return prisma.roadmapMilestone as unknown as LooseDelegate;
    case "roadmapItem":
      return prisma.roadmapItem as unknown as LooseDelegate;
    case "roadmapMeasure":
      return prisma.roadmapMeasure as unknown as LooseDelegate;
    case "roadmapAcceptance":
      return prisma.roadmapAcceptance as unknown as LooseDelegate;
  }
}

/** Serialises a user's roadmap writes: transaction-scoped, released at commit or rollback. First in every array. */
function roadmapLockOp(userId: string) {
  return prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`roadmap:${userId}`}::text))`;
}

function guardCondition(userId: string, g: StoreGuard): Prisma.Sql {
  switch (g.g) {
    case "NO_OTHER_OPEN":
      return Prisma.sql`(SELECT COUNT(*) FROM "Roadmap" WHERE "userId" = ${userId} AND "status" IN (${Prisma.join(["DRAFT", "ACTIVE"])})
        AND "id" IS DISTINCT FROM ${g.exceptId}::text) = 0`;
    case "NO_OTHER_ACTIVE":
      return Prisma.sql`(SELECT COUNT(*) FROM "Roadmap" WHERE "userId" = ${userId} AND "status" = ${"ACTIVE"}
        AND "id" IS DISTINCT FROM ${g.exceptId}::text) = 0`;
    case "ROADMAP_IS": {
      const version = g.version != null ? Prisma.sql`AND "version" = ${g.version}::int` : Prisma.empty;
      const reason = g.archiveReason != null ? Prisma.sql`AND "archiveReason" = ${g.archiveReason}` : Prisma.empty;
      const legacy = g.depthNull ? Prisma.sql`AND "depth" IS NULL` : Prisma.empty;
      return Prisma.sql`EXISTS (SELECT 1 FROM "Roadmap" WHERE "id" = ${g.id} AND "userId" = ${userId}
        AND "status" IN (${Prisma.join([...g.statuses])}) ${version} ${reason} ${legacy})`;
    }
    case "NO_STARTED_MILESTONE":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" WHERE "roadmapId" = ${g.roadmapId}
        AND "status" IN (${Prisma.join(["STARTING", "STARTED"])}))`;
    case "NO_RECENT_RUNNING":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RoadmapRun" WHERE "roadmapId" = ${g.roadmapId} AND "status" = ${"RUNNING"}
        AND "startedAt" > ${g.since})`;
    case "GEMINI_RUNS_BELOW":
      return Prisma.sql`(SELECT COUNT(*) FROM "RoadmapRun" WHERE "userId" = ${userId} AND "day" = ${g.day}::date
        AND "kind" = ${"GEMINI"} AND "status" <> ${"REUSED"}) < ${g.max}::int`;
    case "RUN_IS":
      return Prisma.sql`EXISTS (SELECT 1 FROM "RoadmapRun" WHERE "id" = ${g.id} AND "userId" = ${userId} AND "status" = ${g.status})`;
    case "MILESTONE_IS": {
      const goal = g.goalIdNull ? Prisma.sql`AND m."goalId" IS NULL` : Prisma.empty;
      return Prisma.sql`EXISTS (SELECT 1 FROM "RoadmapMilestone" m JOIN "Roadmap" r ON r."id" = m."roadmapId"
        WHERE m."id" = ${g.id} AND r."userId" = ${userId} AND m."status" IN (${Prisma.join([...g.statuses])}) ${goal})`;
    }
    case "NO_OTHER_LIVE_MILESTONE":
      // isSupersededRow in SQL: a newer (version, then createdAt, then id) STARTING or STARTED row of the same lineage.
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" m WHERE m."roadmapId" = ${g.roadmapId} AND m."id" <> ${g.exceptId}
        AND (m."status" = ${"STARTING"} OR (m."status" = ${"STARTED"} AND (m."goalId" IS NULL OR EXISTS (
          SELECT 1 FROM "TaskTemplate" t WHERE t."id" = m."goalId" AND t."closedScore" IS NULL AND t."archivedAt" IS NULL))))
        AND NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" n WHERE n."roadmapId" = m."roadmapId" AND n."lineageId" = m."lineageId" AND n."id" <> m."id"
          AND n."status" IN (${Prisma.join(["STARTING", "STARTED"])})
          AND (n."version" > m."version" OR (n."version" = m."version" AND (n."createdAt" > m."createdAt"
            OR (n."createdAt" = m."createdAt" AND n."id" COLLATE "C" > m."id" COLLATE "C"))))))`;
    case "ACCEPTANCE_OPEN":
      return Prisma.sql`EXISTS (SELECT 1 FROM "RoadmapAcceptance" WHERE "id" = ${g.id} AND "undoneAt" IS NULL)`;
    case "NOTHING_STARTED_SINCE":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" WHERE "roadmapId" = ${g.roadmapId} AND "startingAt" > ${g.since})`;
    case "NO_DRAFT_ROWS":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" WHERE "roadmapId" = ${g.roadmapId} AND "version" = ${g.version}::int
        AND "status" IN (${Prisma.join(["DRAFT", "LATER"])}))`;
  }
}

function prismaOpsOf(userId: string, op: StoreOp): Prisma.PrismaPromise<unknown>[] {
  switch (op.op) {
    case "guard":
      return [prisma.$executeRaw`SELECT 1 / (CASE WHEN ${guardCondition(userId, op.guard)} THEN 1 ELSE 0 END)`];
    case "insert":
      return op.rows.length ? [delegateOf(op.table).createMany({ data: op.rows.map((r) => toDbData(op.table, r)) })] : [];
    case "update":
      return [delegateOf(op.table).updateMany({ where: toDbWhere(op.table, op.where), data: toDbData(op.table, op.data) })];
    case "delete":
      return [delegateOf(op.table).deleteMany({ where: toDbWhere(op.table, op.where) })];
    case "readings":
      return op.rows.map((r) => readingUpsertOp(userId, r, op.observedAt));
    case "selfLog":
      return [
        prisma.$executeRaw`INSERT INTO "RoadmapReading" ("id", "userId", "measureKey", "day", "value", "detail", "source", "observedAt", "createdAt")
          VALUES (${op.id}, ${userId}, ${op.measureKey}, ${op.day}::date, ${op.value}, ${JSON.stringify(op.detail ?? null)}::jsonb, ${"SELF"}, ${op.at}, ${op.at})
          ON CONFLICT ("userId", "measureKey", "day") DO NOTHING`,
      ];
    case "questWeek":
      return [questWeekInsertOp(userId, op.roadmapId, op.set, op.source, op.now)];
    case "keepAftercare":
      return [
        prisma.$executeRaw`UPDATE "RoadmapMilestone" m
          SET "feasibility" = jsonb_set(
            CASE WHEN jsonb_typeof(m."feasibility") = 'object' THEN m."feasibility" ELSE '{}'::jsonb END,
            '{aftercareKept}',
            COALESCE(CASE WHEN jsonb_typeof(m."feasibility" -> 'aftercareKept') = 'array' THEN m."feasibility" -> 'aftercareKept' END, '[]'::jsonb)
              || jsonb_build_array(${op.templateId}::text))
          FROM "Roadmap" r
          WHERE r."id" = m."roadmapId" AND r."userId" = ${userId} AND m."id" = ${op.milestoneId}
            AND NOT (COALESCE(CASE WHEN jsonb_typeof(m."feasibility" -> 'aftercareKept') = 'array' THEN m."feasibility" -> 'aftercareKept' END, '[]'::jsonb)
              @> jsonb_build_array(${op.templateId}::text))`,
      ];
  }
}

const RUN_LIGHT = {
  id: true,
  roadmapId: true,
  userId: true,
  day: true,
  version: true,
  kind: true,
  status: true,
  model: true,
  modelVersion: true,
  promptVersion: true,
  seedBase: true,
  inputHash: true,
  responseIds: true,
  finishReasons: true,
  latencyMs: true,
  error: true,
  startedAt: true,
  finishedAt: true,
} as const;

const lightRun = (r: Record<string, unknown>): RunRec => fromDbRow<RunRec>("roadmapRun", { ...r, pack: null, samples: null, report: null, usage: null });

/** The roadmap tables through Prisma. Reads are single round trips; apply is one array transaction. */
export const prismaRoadmapStore: RoadmapStore = {
  async listRoadmaps(userId) {
    const rows = await prisma.roadmap.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
    return rows.map((r) => fromDbRow<RoadmapRec>("roadmap", r as unknown as Record<string, unknown>));
  },
  async bundle(userId, roadmapId) {
    const r = await prisma.roadmap.findFirst({
      relationLoadStrategy: "join",
      where: { id: roadmapId, userId },
      include: {
        runs: { select: RUN_LIGHT, orderBy: { startedAt: "desc" }, take: 30 },
        milestones: { include: { items: { orderBy: { ord: "asc" } }, measures: { orderBy: { createdAt: "asc" } } }, orderBy: [{ version: "asc" }, { ord: "asc" }] },
        acceptances: { orderBy: { acceptedAt: "asc" } },
      },
    });
    if (!r) return null;
    const { runs, milestones, acceptances, ...roadmap } = r;
    return {
      roadmap: fromDbRow<RoadmapRec>("roadmap", roadmap as unknown as Record<string, unknown>),
      runs: runs.map((x) => lightRun(x as unknown as Record<string, unknown>)),
      milestones: milestones.map((m) => {
        const { items, measures: ms, ...row } = m;
        return {
          ...fromDbRow<MilestoneRec>("roadmapMilestone", row as unknown as Record<string, unknown>),
          items: items.map((i) => fromDbRow<ItemRec>("roadmapItem", i as unknown as Record<string, unknown>)),
          measures: ms.map((x) => fromDbRow<MeasureRec>("roadmapMeasure", x as unknown as Record<string, unknown>)),
        };
      }),
      acceptances: acceptances.map((a) => fromDbRow<AcceptanceRec>("roadmapAcceptance", a as unknown as Record<string, unknown>)),
    };
  },
  async ownerOf(userId, ref) {
    if (ref.itemId) {
      const i = await prisma.roadmapItem.findFirst({ where: { id: ref.itemId, milestone: { roadmap: { userId } } }, select: { milestone: { select: { roadmapId: true } } } });
      if (i) return i.milestone.roadmapId;
    }
    if (ref.milestoneId) {
      const m = await prisma.roadmapMilestone.findFirst({ where: { id: ref.milestoneId, roadmap: { userId } }, select: { roadmapId: true } });
      if (m) return m.roadmapId;
    }
    if (ref.lineageId) {
      const i = await prisma.roadmapItem.findFirst({
        where: { lineageId: ref.lineageId, milestone: { roadmap: { userId } } },
        orderBy: { createdAt: "desc" },
        select: { milestone: { select: { roadmapId: true } } },
      });
      if (i) return i.milestone.roadmapId;
    }
    return null;
  },
  async run(runId) {
    const r = await prisma.roadmapRun.findUnique({ where: { id: runId } });
    return r ? fromDbRow<RunRec>("roadmapRun", r as unknown as Record<string, unknown>) : null;
  },
  async runsOfDay(userId, day) {
    const rows = await prisma.roadmapRun.findMany({ where: { userId, day: dateColumn(day) }, select: RUN_LIGHT, orderBy: { startedAt: "desc" } });
    return rows.map((x) => lightRun(x as unknown as Record<string, unknown>));
  },
  async reusableRuns(userId, inputHash, sinceDay) {
    const rows = await prisma.roadmapRun.findMany({
      where: { userId, inputHash, kind: "GEMINI", status: "OK", day: { gte: dateColumn(sinceDay) } },
      orderBy: { startedAt: "desc" },
      take: 3,
    });
    return rows.map((r) => fromDbRow<RunRec>("roadmapRun", r as unknown as Record<string, unknown>));
  },
  async measuresWithKeys(userId, keys) {
    if (keys.length === 0) return [];
    const rows = await prisma.roadmapMeasure.findMany({
      where: { measureKey: { in: [...keys] }, milestone: { roadmap: { userId } } },
      select: { measureKey: true, target: true, milestone: { select: { goalId: true } } },
    });
    return rows.map((r) => ({ measureKey: r.measureKey ?? "", target: r.target, goalId: r.milestone.goalId }));
  },
  async readings(userId, keys, fromDay) {
    if (keys.length === 0) return [];
    const rows = await prisma.roadmapReading.findMany({
      where: { userId, measureKey: { in: [...keys] }, source: "COMPUTED", day: { gte: dateColumn(fromDay) } },
      orderBy: [{ day: "asc" }, { observedAt: "asc" }],
    });
    return rows.map(readingOf);
  },
  async selfLogs(userId, prefixes) {
    if (prefixes.length === 0) return [];
    const rows = await prisma.roadmapReading.findMany({
      where: { userId, source: "SELF", OR: prefixes.map((p) => ({ measureKey: { startsWith: p } })) },
      orderBy: [{ day: "asc" }, { observedAt: "asc" }],
      take: 200,
    });
    return rows.map(readingOf);
  },
  async acceptanceMultiplier(userId, roadmapId) {
    const a = await prisma.roadmapAcceptance.findFirst({ where: { roadmapId, undoneAt: null, roadmap: { userId } }, orderBy: acceptanceOrderBy(), select: { intervalMultiplier: true } });
    return a ? a.intervalMultiplier : null;
  },
  async apply(userId, ops) {
    const list: Prisma.PrismaPromise<unknown>[] = [roadmapLockOp(userId)];
    for (const op of ops) list.push(...prismaOpsOf(userId, op));
    try {
      await prisma.$transaction(list);
      return "ok";
    } catch (err) {
      if (isStaleGuard(err)) return "stale";
      if (isDuplicateActivity(err)) return "duplicate";
      throw err;
    }
  },
};

function readingOf(r: { measureKey: string; day: Date; value: number; detail: unknown; source: string; observedAt: Date }): Reading {
  return {
    measureKey: r.measureKey,
    day: keyOfDateColumn(r.day),
    value: r.value,
    detail: r.detail ?? null,
    source: r.source === "SELF" ? "SELF" : "COMPUTED",
    observedAt: r.observedAt.toISOString(),
  };
}

// ═══ The default io ═════════════════════════════════════════════════════════

const TEMPLATE_LITE_SELECT = {
  id: true,
  title: true,
  normTitle: true,
  kind: true,
  recurrence: true,
  parentId: true,
  archivedAt: true,
  closedScore: true,
  completedAt: true,
  dueDay: true,
  goalMp: true,
} as const;

/** The Field tree as the roadmap reads it (non-archived cards only; life days, not instants). */
export function treeOf(
  fields: readonly {
    id: string;
    name: string;
    level: number;
    domains: readonly {
      id: string;
      name: string;
      fieldId: string;
      level?: number;
      ideas: readonly {
        id?: string;
        domainId: string;
        level: number;
        dueDate: Date;
        graceEndsAt: Date | null;
        createdAt: Date;
        isArchived: boolean;
        title: string | null;
        tags: string[];
        questionType?: string | null;
      }[];
    }[];
  }[]
): TreeField[] {
  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    domains: f.domains.map((d) => ({
      id: d.id,
      name: d.name,
      fieldId: d.fieldId,
      ...(typeof d.level === "number" ? { level: d.level } : {}),
      cards: d.ideas
        .filter((i) => !i.isArchived)
        .map((i) => ({
          ...(typeof i.id === "string" ? { id: i.id } : {}),
          domainId: i.domainId,
          level: i.level,
          dueDay: dayKeyOf(i.dueDate),
          graceEndsDay: i.graceEndsAt ? dayKeyOf(i.graceEndsAt) : null,
          createdDay: dayKeyOf(i.createdAt),
          title: i.title,
          tags: i.tags,
          ...(typeof i.questionType === "string" ? { type: i.questionType } : {}),
        })),
    })),
  }));
}

export const prismaRoadmapIo: RoadmapIo = {
  fieldTree: async () => treeOf(await loadFieldTree()),
  throughput: (userId, finalDay) => loadThroughput(userId, finalDay),
  throughputRows: (userId, finalDay) => loadThroughputRows(userId, finalDay),
  async dayLedger(userId, today) {
    const [totals, events] = await Promise.all([readDayTotals(userId, [today]), readDayTaskEvents(userId, [today])]);
    return ledgerOf(today, totals, events);
  },
  weightView: (userId, now) => loadWeightView(userId, now),
  maintenanceIds: (userId) => loadMaintenanceIds(userId),
  intervalMultiplier: async (userId) => (await loadModifiers(userId)).intervalMultiplier,
  async restRows(userId, from, to) {
    try {
      const rows = await prisma.restDay.findMany({
        where: { userId, day: { gte: dateColumn(addDays(from, -1)), lte: dateColumn(to) } },
        select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
      });
      return rows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
    } catch (err) {
      if (isMissingRestDayTable(err)) return [];
      throw err;
    }
  },
  async templates(userId, ids) {
    if (ids.length === 0) return [];
    const rows = await prisma.taskTemplate.findMany({ where: { userId, id: { in: [...ids] } }, select: TEMPLATE_LITE_SELECT });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      normTitle: r.normTitle,
      kind: r.kind,
      recurrence: r.recurrence,
      parentId: r.parentId,
      archivedAt: r.archivedAt,
      closedScore: r.closedScore,
      completedAt: r.completedAt,
      dueDay: r.dueDay ? keyOfDateColumn(r.dueDay) : null,
      stated: r.goalMp,
    }));
  },
  async goalPayments(userId, goalIds) {
    if (goalIds.length === 0) return {};
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", dedupeKey: { in: goalIds.map(goalMintKey) }, qty: { gt: 0 } },
      select: { dedupeKey: true, day: true },
    });
    const out: Record<string, DayKey> = {};
    for (const r of rows) if (r.dedupeKey) out[r.dedupeKey.slice(GOAL_MINT_PREFIX.length)] = keyOfDateColumn(r.day);
    return out;
  },
  async midGoalPaidDays(userId, today) {
    const rule = GOAL_RULES.MID;
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", dedupeKey: { startsWith: GOAL_MINT_PREFIX }, qty: { gt: 0 }, day: { gt: dateColumn(addDays(today, -rule.windowDays)) } },
      select: { day: true, detail: true },
    });
    return rows.filter((r) => parseMintDetail(r.detail).reason === rule.reason).map((r) => keyOfDateColumn(r.day));
  },
  async createTemplate(userId, parsed, opts) {
    const created = await createTemplateCore(userId, parsed, opts);
    return { id: created.id };
  },
  async createDomain(fieldId, name) {
    const taxonomy = await import("../app/actions/taxonomy");
    return taxonomy.createDomain(fieldId, name);
  },
  async archiveTemplate(userId, templateId, now) {
    const res = await archiveCore(userId, templateId, now);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  },
  async reachModifiers(userId) {
    const m = await loadModifiers(userId);
    return { intervalMultiplier: m.intervalMultiplier, extraStrikes: m.extraStrikes, graceExtraDays: m.graceExtraDays };
  },
  async aimSettings(userId) {
    const row = await prisma.lifeSettings.findUnique({ where: { userId }, select: { aimSuggestions: true, epochDay: true } });
    return row ? { aimSuggestions: row.aimSuggestions ?? null, epochDay: keyOfDateColumn(row.epochDay) } : null;
  },
  async writeAimSuggestions(userId, on, today) {
    await prisma.lifeSettings.upsert({
      where: { userId },
      create: { userId, ...newLifeSettingsData(today), aimSuggestions: on },
      update: { aimSuggestions: on },
    });
  },
  async lastDayOpenBefore(userId, today) {
    const row = await prisma.activityEvent.findFirst({
      where: { userId, source: "DAY_OPEN", day: { lt: dateColumn(today) } },
      orderBy: { day: "desc" },
      select: { day: true },
    });
    return row ? keyOfDateColumn(row.day) : null;
  },
  async suggestionDomainIds(userId) {
    const rows = await prisma.roadmapItem.findMany({
      where: { kind: "DOMAIN", notes: { has: "FROM_SUGGESTION" }, domainId: { not: null }, milestone: { roadmap: { userId } } },
      select: { domainId: true },
    });
    return Array.from(new Set(rows.map((r) => r.domainId).filter((d): d is string => !!d)));
  },
  async reviewRows(userId, cardIds, fromDay) {
    if (cardIds.length === 0) return {};
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: "REVIEW", sourceId: { in: [...cardIds] }, day: { gte: dateColumn(fromDay) } },
      select: { sourceId: true, day: true, detail: true, occurredAt: true },
    });
    const out: Record<string, ReviewLedgerRow[]> = {};
    for (const r of rows) {
      if (!r.sourceId) continue;
      (out[r.sourceId] ??= []).push({ day: keyOfDateColumn(r.day), detail: r.detail, occurredAt: r.occurredAt instanceof Date ? r.occurredAt.toISOString() : null });
    }
    return out;
  },
};

const LANES: RoadmapLanes = {
  splitWindows: realism.splitWindows,
  fitPlan: realism.fitPlan,
  feasibilityOf: realism.feasibilityOf,
  applyRemedy: realism.applyRemedy,
  starterLadder: realism.starterLadder,
  manualLadder: realism.manualLadder,
  refit: realism.refit,
  refitForStart: realism.refitForStart,
  startSnapshotOf: realism.startSnapshotOf,
  buildEvidencePack: evidence.buildEvidencePack,
  inputHashMaterial: evidence.inputHashMaterial,
  validateSample: validate.validateSample,
  checkLabel: validate.checkLabel,
  withLabelChecks: validate.withLabelChecks,
  isNonEnglish: validate.isNonEnglish,
  bulkKeepAllowed: validate.bulkKeepAllowed,
  draftSamples: model.draftSamples,
  seedBaseFor: model.seedBaseFor,
  assignRankIndices: proficiency.assignRankIndices,
  proficiencyBasisOf: proficiency.proficiencyBasisOf,
  proficiencyReadingFor,
  proficiencyViewOf: proficiency.proficiencyViewOf,
  aimRankOf: proficiency.aimRankOf,
  practiceKeptValue: measures.practiceKeptValue,
  lastReadingOn: measures.lastReadingOn,
  milestoneGOn: measures.milestoneGOn,
  milestoneHeadlineOf: measures.milestoneHeadlineOf,
  measureFigureOf: measures.measureFigureOf,
  checkpointStandingOf: measures.checkpointStandingOf,
  projectCards: pace.projectCards,
  projectPractice: pace.projectPractice,
  triggersOf: pace.triggersOf,
  weekQuestSetFor: questsServer.weekQuestSetFor,
  loadWeekQuests: questsServer.loadWeekQuests,
  loadPastWeeks: questsServer.loadPastWeeks,
  weekQuestsViewFor: questsServer.weekQuestsViewFor,
  coverageOf: realism.coverageOf,
  lineDomainDefaultOf: realism.lineDomainDefaultOf,
  depthTermsOf: realism.depthTermsOf,
  stageLadderOf: realism.stageLadderOf,
  dateCheckOf: realism.dateCheckOf,
  lowerDepthPlanOf: realism.lowerDepthPlanOf,
  dateEffectOf: realism.dateEffectOf,
  floorDayOf: realism.floorDayOf,
  syncStagePractices: realism.syncStagePractices,
  buildResponseSchema: model.buildResponseSchema,
  integrityOf: validate.integrityOf,
  validateKeysOnly: validate.validateKeysOnly,
  constraintExclusionsOf: validate.constraintExclusionsOf,
};

/** Runs a task outside the response when no after() was given (a cron or a script); a request passes after(). */
const deferNow = (task: () => Promise<void> | void): void => {
  void Promise.resolve()
    .then(task)
    .catch((err) => console.error("roadmap deferred task failed:", err));
};

interface Env {
  store: RoadmapStore;
  io: RoadmapIo;
  lanes: RoadmapLanes;
  makeId: () => string;
  defer: (task: () => Promise<void> | void) => void;
  goalsLive: boolean;
  env: LifeEnv | undefined;
}

function envOf(deps: RoadmapDeps): Env {
  return {
    store: deps.store ?? prismaRoadmapStore,
    io: { ...prismaRoadmapIo, ...(deps.io ?? {}) },
    lanes: { ...LANES, ...(deps.lanes ?? {}) },
    makeId: deps.makeId ?? (() => globalThis.crypto.randomUUID()),
    defer: deps.defer ?? deferNow,
    goalsLive: deps.goalsLive ?? ROADMAP_GOALS_LIVE,
    env: deps.env,
  };
}

const writesOff = (deps: RoadmapDeps): boolean => !lifeWritesEnabled(deps.env);

/** Runs a decide-and-apply step up to ATTEMPTS times; 'stale' re-reads. */
async function withRetry<T>(step: () => Promise<Result<T> | "stale">): Promise<Result<T>> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const res = await step();
    if (res !== "stale") return res;
  }
  return fail(RACED);
}

// ═══ Row ↔ draft conversions ════════════════════════════════════════════════

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

function scopeOf(raw: unknown): MeasureScope {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const ids = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);
  const out: MeasureScope = {};
  const d = ids(s.domainIds);
  const l = ids(s.itemLineageIds);
  const t = ids(s.templateIds);
  if (d) out.domainIds = d;
  if (l) out.itemLineageIds = l;
  if (t) out.templateIds = t;
  return out;
}

export function itemDraftOf(r: ItemRec): ItemDraft {
  const gap = r.kind === "GAP";
  return {
    id: r.id,
    lineageId: r.lineageId,
    kind: r.kind as ItemKind,
    ord: r.ord,
    label: r.label,
    rawLabel: r.rawLabel,
    origin: r.origin as Origin,
    decision: r.decision as Decision,
    domainId: r.domainId,
    proposedName: r.proposedName,
    // A GAP row's grounding source index rides syllabusRef (no column); it is never an outline line's.
    syllabusRef: gap ? null : r.syllabusRef,
    method: isOneOf(PRACTICE_METHODS, r.method) ? r.method : null,
    sessionsPerWeek: r.sessionsPerWeek,
    durationBand: isOneOf(PRACTICE_BANDS, r.durationBand) ? r.durationBand : null,
    rule: r.rule,
    planSource: r.planSource === "YOURS" ? "YOURS" : r.planSource === "WORKED_OUT" ? "WORKED_OUT" : null,
    // Stored rows may hold EXAM_DAY (code-placed); the pickers and the editor still offer only CHECKPOINT_KINDS.
    checkpointKind: isOneOf(STORED_CHECKPOINT_KINDS, r.checkpointKind) ? r.checkpointKind : null,
    outOf: r.outOf,
    bar: r.bar,
    addToToday: r.addToToday,
    templateId: r.templateId,
    flags: r.flags.filter((f): f is BlockingFlag => isOneOf(BLOCKING_FLAGS, f)),
    notes: r.notes as ItemNote[],
    catalogKey: isCatalogKey(r.catalogKey) ? r.catalogKey : null,
    ...(gap ? { groundRef: r.syllabusRef } : {}),
  };
}

export function measureSpecOf(r: MeasureRec): MeasureSpec {
  return {
    id: r.id,
    kind: r.kind as MeasureSpec["kind"],
    role: r.role === "CONTEXT" ? "CONTEXT" : "PAYS",
    scope: scopeOf(r.scope),
    minLevel: r.minLevel,
    target: r.target,
    targetSource: r.targetSource === "YOURS" ? "YOURS" : "WORKED_OUT",
    fittedTarget: r.fittedTarget,
    rateSource: (r.rateSource as RateSource | null) ?? null,
    baseline: r.baseline,
    baselineDay: r.baselineDay,
    unit: r.unit,
    itemLineageId: r.itemLineageId,
    measureKey: r.measureKey,
  };
}

function storedNotes(feasibility: unknown): MilestoneNote[] {
  const f = feasibility && typeof feasibility === "object" ? (feasibility as { notes?: unknown }) : {};
  return Array.isArray(f.notes) ? (f.notes.filter((n) => typeof n === "string") as MilestoneNote[]) : [];
}

/** The practices the user kept on Today after the milestone finished (StartSnapshot.aftercareKept; it rides the feasibility JSON). */
function aftercareKeptOf(feasibility: unknown): string[] {
  const f = feasibility && typeof feasibility === "object" ? (feasibility as { aftercareKept?: unknown }) : {};
  return Array.isArray(f.aftercareKept) ? f.aftercareKept.filter((x): x is string => typeof x === "string") : [];
}

export function draftOf(m: MilestoneBundle): MilestoneDraft {
  const ms = m.measures.map(measureSpecOf);
  const notes = storedNotes(m.feasibility);
  if (!ms.some((x) => x.role === "PAYS") && !notes.includes("NOT_MEASURABLE")) notes.push("NOT_MEASURABLE");
  return {
    id: m.id,
    lineageId: m.lineageId,
    version: m.version,
    ord: m.ord,
    title: m.title,
    titleOrigin: m.titleOrigin as Origin,
    titleDecision: m.titleDecision as Decision,
    windowStart: m.windowStart,
    dueDay: m.dueDay,
    status: m.status as MilestoneStatus,
    rankIndex: m.rankIndex,
    overAccepted: m.overAccepted,
    items: [...m.items].sort((a, b) => a.ord - b.ord).map(itemDraftOf),
    measures: ms,
    notes,
    stage: isStageKey(m.stage) ? m.stage : null,
  };
}

function itemRowOf(milestoneId: string, it: ItemDraft, now: Date, makeId: () => string, decidedAt: Date | null = null): Record<string, unknown> {
  return {
    id: it.id ?? makeId(),
    milestoneId,
    lineageId: it.lineageId,
    kind: it.kind,
    ord: it.ord,
    label: it.label,
    rawLabel: it.rawLabel,
    origin: it.origin,
    decision: it.decision,
    decidedAt,
    domainId: it.domainId,
    proposedName: it.proposedName,
    syllabusRef: it.kind === "GAP" ? (it.groundRef ?? null) : it.syllabusRef,
    method: it.method,
    sessionsPerWeek: it.sessionsPerWeek,
    durationBand: it.durationBand,
    rule: it.rule,
    planSource: it.planSource,
    checkpointKind: it.checkpointKind,
    outOf: it.outOf,
    bar: it.bar,
    addToToday: it.addToToday,
    templateId: it.templateId,
    flags: [...it.flags],
    notes: [...it.notes],
    catalogKey: it.catalogKey ?? null,
    createdAt: now,
  };
}

function measureRowOf(milestoneId: string, m: MeasureSpec, now: Date, makeId: () => string): Record<string, unknown> {
  return {
    id: m.id ?? makeId(),
    milestoneId,
    kind: m.kind,
    role: m.role,
    scope: m.scope,
    minLevel: m.minLevel,
    target: Number.isFinite(m.target) ? m.target : 0,
    targetSource: m.targetSource,
    fittedTarget: m.fittedTarget,
    rateSource: m.rateSource,
    baseline: m.baseline,
    baselineDay: m.baselineDay,
    unit: m.unit,
    itemLineageId: m.itemLineageId,
    measureKey: m.measureKey,
    createdAt: now,
  };
}

/** The feasibility JSON a milestone row stores: its snapshot, plus its notes (no column of their own). */
function feasibilityJson(f: MilestoneFeasibility | StartSnapshot | null, notes: readonly MilestoneNote[]): unknown {
  if (!f) return notes.length ? { notes: [...notes] } : null;
  return { ...f, notes: [...notes] };
}

function milestoneRowOf(roadmapId: string, version: number, d: MilestoneDraft, id: string, f: MilestoneFeasibility | null, now: Date): Record<string, unknown> {
  const later = d.status === "LATER";
  return {
    id,
    roadmapId,
    version,
    lineageId: d.lineageId,
    ord: d.ord,
    title: d.title,
    titleOrigin: d.titleOrigin,
    titleDecision: d.titleDecision,
    windowStart: later ? null : d.windowStart,
    dueDay: later ? null : d.dueDay,
    status: later ? "LATER" : "DRAFT",
    goalId: null,
    startedDay: null,
    startingAt: null,
    reachedDay: null,
    reachPendingDay: null,
    overAccepted: false,
    feasibility: feasibilityJson(f, d.notes),
    rankIndex: null,
    createdAt: now,
    stage: d.stage ?? null,
  };
}

// ═══ The one writer and its tripwire (F-R4-20) ══════════════════════════════
//
// writeRoadmapRows is the only code that builds a StoreOp inserting a
// RoadmapMilestone or RoadmapItem, or updating one's title, label, origin,
// titleOrigin or catalogKey (roadmap-server-check greps for any other).
// Guarded status transitions that change no text (accept, Start, decisions,
// discards) stay where they are. Before a single op is built, it runs
// assertNoModelText over every row the write leaves in place.

/** What the tripwire checks a plan's rows against. */
export interface ModelTextContext {
  roadmapId: string;
  /** The intake's outline lines (a SYLLABUS TOPIC's label must equal its line). */
  syllabusLines: readonly string[];
  /** Domain id → its row's name (a GEMINI DOMAIN item's label must equal it). */
  domainNames: Readonly<Record<string, string>>;
  /** The roadmap was written by revision 4 code (a legacy row is never re-checked, only hidden). */
  rev4: boolean;
  /** The catalog track a CODE item renders on (FIELD, or the track Area's track). */
  track?: CatalogTrack;
  /** The aim and the exam's name, as the user wrote them ({aim}, {exam}). */
  aim?: string;
  exam?: string | null;
  /** R, in order: the Domains a CODE item with no `on` is filled with. */
  required?: readonly string[];
}

/** The tripwire's refusal. Its message names the row by kind and place, never by its words (it reaches the log). */
export class ModelTextError extends Error {
  constructor(reason: string) {
    super(`model text refused: ${reason}`);
    this.name = "ModelTextError";
  }
}

/** The words an action answers with when the tripwire refuses a change. */
export const CHANGE_NOT_SAVED = "That change couldn't be saved.";

const normLabel = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** A Domain's name as its row holds it, or as code writes it (DomainName: whitespace collapsed). */
function isDomainsName(ctx: ModelTextContext, domainId: string | null, label: string): boolean {
  if (!domainId) return false;
  const name = Object.prototype.hasOwnProperty.call(ctx.domainNames, domainId) ? ctx.domainNames[domainId] : undefined;
  return typeof name === "string" && (name === label || String(domainName({ id: domainId, name })) === label);
}

/**
 * The Domain lists a CODE label may have been filled with: the row's own
 * Domain, R, or the milestone's Domains, in the orders code writes them. The
 * milestone's Domains are read with and without a pending Gemini addition
 * (fix round 2: R2's naming steps run with it hidden, withPendingHidden).
 */
function codeFillCandidates(it: ItemDraft, m: MilestoneDraft, ctx: ModelTextContext): string[][] {
  const out: string[][] = [];
  const named = (ids: readonly string[]) =>
    ids.map((id) => (Object.prototype.hasOwnProperty.call(ctx.domainNames, id) ? ctx.domainNames[id] : undefined)).filter((n): n is string => typeof n === "string" && n.length > 0);
  if (it.domainId) out.push(named([it.domainId]));
  const required = [...(ctx.required ?? [])];
  const own = m.items.filter((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId).map((i) => i.domainId as string);
  const nameable = nameableDomainsOf(m);
  for (const ids of nameable.length === own.length ? [required, own] : [required, own, nameable]) {
    if (ids.length === 0) continue;
    out.push(named(ids));
    out.push(named([...ids].sort()));
    out.push([...named(ids)].sort((a, b) => a.localeCompare(b)));
  }
  return out.filter((x) => x.length > 0);
}

/** A CODE item's words are its catalog render (or rev 3's two code names), for some fill code writes; an EDITED row is the user's. */
function codeLabelOk(it: ItemDraft, m: MilestoneDraft, ctx: ModelTextContext): boolean {
  if (it.decision === "EDITED") return true;
  const aim = yoursText("USER", "EDITED", ctx.aim ?? "") ?? undefined;
  const exam = ctx.exam ? (yoursText("USER", "EDITED", ctx.exam) ?? undefined) : undefined;
  const track: CatalogTrack = ctx.track ?? "FIELD";
  const lists = codeFillCandidates(it, m, ctx);
  if (it.catalogKey) {
    const fills = lists.length ? lists : [[]];
    for (const names of fills) {
      try {
        const label = catalogLabelOf(it.catalogKey, { track, domains: names.map((n) => domainName({ id: "", name: n })), aim, exam });
        if (String(label) === it.label) return true;
      } catch {
        // That fill doesn't render this type; the next one may.
      }
    }
    return false;
  }
  // Rev 3's code names without a catalog key: "Study {domains}" and "Practice for {aim}".
  if (ctx.aim && it.label === `Practice for ${ctx.aim}`) return true;
  return lists.some((names) => it.label === `Study ${domainsShort(names.map((n) => domainName({ id: "", name: n })))}`);
}

/**
 * The tripwire (F-R4-20): throws ModelTextError when a plan written by
 * revision 4 code holds model text outside the quarantine:
 *   - a milestone title Gemini wrote (titleOrigin GEMINI);
 *   - a GEMINI item of a kind other than DOMAIN or GAP;
 *   - a GEMINI DOMAIN item whose label is not its Domain row's name (or with no Domain);
 *   - a CODE item whose label is not its catalog render (the user's EDITED words pass);
 *   - a TOPIC whose origin is neither SYLLABUS nor USER, or a SYLLABUS TOPIC
 *     whose label is not intake.syllabus.lines[its index] (EDITED passes);
 *   - a GAP row's label on any code- or model-written row or title (a DOMAIN
 *     created from it through Create, FROM_SUGGESTION, passes);
 *   - (fix round, lens 1) any row keeping a model's raw words (rawLabel) or a
 *     proposed name (proposedName): revision 4 writes neither (both stay
 *     null on every draft path), and the page renders proposedName for a
 *     DOMAIN with no Domain, so a future path that stored one would show it.
 * A legacy roadmap (ctx.rev4 false) is never re-checked: its text is hidden.
 */
export function assertNoModelText(rows: readonly MilestoneDraft[], ctx: ModelTextContext): void {
  if (!ctx.rev4) return;
  const gaps = new Set(rows.flatMap((m) => m.items.filter((i) => i.kind === "GAP").map((i) => normLabel(i.label))).filter((s) => s.length > 0));
  const code = catalogOriginOf();
  for (const m of rows) {
    const where = `milestone ${m.ord}`;
    if (m.titleOrigin === "GEMINI") throw new ModelTextError(`a title written by Gemini (${where})`);
    if (gaps.has(normLabel(m.title)) && m.titleOrigin !== "USER" && m.titleDecision !== "EDITED") throw new ModelTextError(`a suggestion's name as a title (${where})`);
    for (const it of m.items) {
      if (it.rawLabel != null) throw new ModelTextError(`a ${it.kind.toLowerCase()} keeping raw model words (${where})`);
      if (it.proposedName != null) throw new ModelTextError(`a ${it.kind.toLowerCase()} with a proposed name (${where})`);
      if (it.kind === "GAP") {
        if (it.origin !== "GEMINI") throw new ModelTextError(`a suggestion row not marked Gemini's (${where})`);
        continue;
      }
      const userWords = it.origin === "USER" || it.decision === "EDITED";
      if (it.origin === "GEMINI") {
        if (it.kind !== "DOMAIN") throw new ModelTextError(`a ${it.kind.toLowerCase()} written by Gemini (${where})`);
        if (!isDomainsName(ctx, it.domainId, it.label)) throw new ModelTextError(`a Domain Gemini named that is not one of yours (${where})`);
      }
      if (it.kind === "TOPIC") {
        if (it.origin !== "SYLLABUS" && it.origin !== "USER") throw new ModelTextError(`a topic not from your outline (${where})`);
        if (it.origin === "SYLLABUS" && it.decision !== "EDITED") {
          const ref = it.syllabusRef;
          if (ref == null || ctx.syllabusLines[ref] !== it.label) throw new ModelTextError(`an outline topic that is not your line (${where})`);
        }
      }
      if (!userWords && gaps.has(normLabel(it.label))) {
        const createdFromIt = it.kind === "DOMAIN" && it.notes.includes("FROM_SUGGESTION");
        const ownDomainName = it.kind === "DOMAIN" && isDomainsName(ctx, it.domainId, it.label);
        if (!createdFromIt && !ownDomainName) throw new ModelTextError(`a suggestion's name on a plan row (${where})`);
      }
      if (it.origin === code && !codeLabelOk(it, m, ctx)) throw new ModelTextError(`a ${it.kind.toLowerCase()} that is not the app's wording (${where})`);
    }
  }
}

/**
 * What the one writer writes:
 *   DRAFT    `plan` becomes the roadmap's draft version: earlier DRAFT, LATER
 *            and DISCARDED rows of that version are deleted first (a draft not
 *            yet accepted can be replaced); PLANNED, STARTING and STARTED rows
 *            are at other versions and never touched. Every row carries a stage.
 *   REWRITE  one milestone's children in place (same ids): its items and
 *            measures as `after` holds them, and its row's editable fields.
 *   COPY     a new milestone row ("Start again"), with its items and measures.
 *   PATCH    one row's text fields (a title or a label edit, a move); `result`
 *            is the milestone as the patch leaves it (what the tripwire reads).
 * `others`: the version's other rows as they stay (the tripwire reads the plan whole).
 */
export type RowWrite =
  | { kind: "DRAFT"; roadmapId: string; version: number; plan: readonly MilestoneDraft[]; feasibility: Feasibility | null; now: Date; makeId: () => string }
  | { kind: "REWRITE"; before: MilestoneBundle; after: MilestoneDraft; now: Date; makeId: () => string; decided: ReadonlySet<string>; others?: readonly MilestoneDraft[] }
  | { kind: "COPY"; roadmapId: string; version: number; copy: MilestoneDraft; row: Record<string, unknown>; now: Date; makeId: () => string }
  | { kind: "PATCH"; table: "roadmapItem" | "roadmapMilestone"; id: string; data: Record<string, unknown>; result: MilestoneDraft; others?: readonly MilestoneDraft[] };

/**
 * The one writer (F-R4-20): runs the tripwire over what the write leaves,
 * then appends the write's StoreOps to `ops` (the caller's claim-first
 * transaction, guards first). Throws ModelTextError (nothing appended) when
 * the tripwire refuses; a DRAFT row with no stage refuses too (every revision
 * 4 draft path sets one).
 */
export function writeRoadmapRows(ops: StoreOp[], write: RowWrite, ctx: ModelTextContext): void {
  if (write.kind === "DRAFT") {
    const missing = write.plan.find((d) => d.stage == null);
    if (missing) throw new ModelTextError(`a draft row without a stage (milestone ${missing.ord})`);
    assertNoModelText(write.plan, { ...ctx, rev4: true });
    const { roadmapId, version, plan, feasibility, now, makeId } = write;
    ops.push({ op: "delete", table: "roadmapMilestone", where: { roadmapId, version, status: { in: ["DRAFT", "LATER", "DISCARDED"] } } });
    const ms: Record<string, unknown>[] = [];
    const items: Record<string, unknown>[] = [];
    const meas: Record<string, unknown>[] = [];
    // R's coverage rides every row's stored feasibility (no column): the first acceptance freezes to the counts these rows were built from.
    const coverage = feasibility?.coverage?.length ? feasibility.coverage : null;
    for (const d of plan) {
      const id = makeId();
      const f0 = feasibility?.milestones.find((x) => x.lineageId === d.lineageId) ?? null;
      const f = f0 && coverage ? ({ ...f0, coverage } as MilestoneFeasibility) : f0;
      ms.push(milestoneRowOf(roadmapId, version, d, id, f, now));
      for (const it of d.items) items.push(itemRowOf(id, { ...it, id: null }, now, makeId));
      for (const m of d.measures) meas.push(measureRowOf(id, { ...m, id: null }, now, makeId));
    }
    if (ms.length) ops.push({ op: "insert", table: "roadmapMilestone", rows: ms });
    if (items.length) ops.push({ op: "insert", table: "roadmapItem", rows: items });
    if (meas.length) ops.push({ op: "insert", table: "roadmapMeasure", rows: meas });
    return;
  }
  if (write.kind === "REWRITE") {
    const { before, after, now, makeId, decided } = write;
    assertNoModelText([...(write.others ?? []), after], ctx);
    ops.push(
      {
        op: "update",
        table: "roadmapMilestone",
        where: { id: before.id, status: before.status },
        data: {
          title: after.title,
          titleOrigin: after.titleOrigin,
          titleDecision: after.titleDecision,
          windowStart: after.status === "LATER" ? null : after.windowStart,
          dueDay: after.status === "LATER" ? null : after.dueDay,
          // Accepted rows keep their status (only guarded transitions move them); a draft row is DRAFT or LATER as the edit leaves it.
          status: isCarried(before) || before.status === "PLANNED" ? before.status : after.status === "LATER" ? "LATER" : "DRAFT",
          ...(after.stage !== undefined ? { stage: after.stage ?? null } : {}),
        },
      },
      { op: "delete", table: "roadmapItem", where: { milestoneId: before.id } },
      { op: "delete", table: "roadmapMeasure", where: { milestoneId: before.id } }
    );
    const decidedAtOf = (it: ItemDraft): Date | null => {
      if (it.id && decided.has(it.id)) return now;
      return before.items.find((x) => x.id === it.id)?.decidedAt ?? null;
    };
    const items = after.items.map((it) => itemRowOf(before.id, it, now, makeId, decidedAtOf(it)));
    const meas = after.measures.map((m) => measureRowOf(before.id, m, now, makeId));
    if (items.length) ops.push({ op: "insert", table: "roadmapItem", rows: items });
    if (meas.length) ops.push({ op: "insert", table: "roadmapMeasure", rows: meas });
    return;
  }
  if (write.kind === "COPY") {
    const { copy, row, now, makeId } = write;
    assertNoModelText([copy], ctx);
    const id = row.id as string;
    ops.push(
      { op: "insert", table: "roadmapMilestone", rows: [row] },
      { op: "insert", table: "roadmapItem", rows: copy.items.map((it) => itemRowOf(id, it, now, makeId)) },
      { op: "insert", table: "roadmapMeasure", rows: copy.measures.map((x) => measureRowOf(id, x, now, makeId)) }
    );
    return;
  }
  assertNoModelText([...(write.others ?? []), write.result], ctx);
  ops.push({ op: "update", table: write.table, where: { id: write.id }, data: write.data });
}

/** The tripwire's context for a roadmap: its outline, every Domain's name, R, the aim and exam, and whether revision 4 wrote it. */
function modelTextContextOf(b: RoadmapBundle, tree: readonly TreeField[], rev4: boolean = !legacyOf(b)): ModelTextContext {
  const domainNames: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const f of tree) for (const d of f.domains) domainNames[d.id] = d.name;
  const intake = intakeOf(b.roadmap);
  return {
    roadmapId: b.roadmap.id,
    syllabusLines: intake.syllabus?.lines ?? [],
    domainNames,
    rev4,
    track: catalogTrackOf({ fieldId: b.roadmap.fieldId, track: intake.track }),
    aim: b.roadmap.aim,
    exam: b.roadmap.examLabel,
    required: requiredDomainsOf(b, [...planRowsOf(b), ...draftRowsOf(b)]),
  };
}

/** One structured line per refused write: the reason names kind and place, never the words. */
function logRefusedWrite(where: string, err: unknown): void {
  console.warn(refusedWriteLine(where, err));
}

/** The tripwire's log line (ModelTextError's message, or draftFromReply's tripwireReason), cut to 200 characters. */
function refusedWriteLine(where: string, err: unknown): string {
  const reason = err instanceof Error ? err.message : typeof err === "string" && err ? err : "refused";
  return JSON.stringify({ evt: "roadmap.tripwire", where, reason: reason.slice(0, 200) });
}

// ═══ Plan rows ══════════════════════════════════════════════════════════════

const byOrd = (a: { ord: number; createdAt: Date }, b: { ord: number; createdAt: Date }) => a.ord - b.ord || a.createdAt.getTime() - b.createdAt.getTime();
const isCarried = (m: { status: string }) => m.status === "STARTING" || m.status === "STARTED";

/** A STARTED row whose lineage started again (its "Start again" copy is STARTING or STARTED): never current, live or measured here. */
const superseded = (b: RoadmapBundle, m: MilestoneRec): boolean => isSupersededRow(m, b.milestones);

/**
 * One row per milestone position (lineage), for the rank reader and the
 * rank assignment: the reached row when one is, else the newest (a "Start
 * again" copy replaces its dropped row rather than adding one, F12).
 */
function onePerLineage<T extends MilestoneRec>(rows: readonly T[]): T[] {
  const pick = new Map<string, T>();
  for (const r of rows) {
    const cur = pick.get(r.lineageId);
    if (!cur) pick.set(r.lineageId, r);
    else if (cur.reachedDay == null && (r.reachedDay != null || isNewerRow(r, cur))) pick.set(r.lineageId, r);
  }
  return rows.filter((r) => pick.get(r.lineageId) === r);
}

/** Each lineage's paying day: the earliest day another goal of the lineage paid ("this milestone already paid on 3 Mar"); `before` keeps only days on or before it. */
function lineagePaidOnOf(b: RoadmapBundle, m: MilestoneRec, payments: Readonly<Record<string, DayKey>>, before: DayKey | null = null): DayKey | null {
  const days = b.milestones
    .filter((x) => x.lineageId === m.lineageId && x.id !== m.id && x.goalId && payments[x.goalId])
    .map((x) => payments[x.goalId as string])
    .filter((d) => before == null || d <= before)
    .sort();
  return days[0] ?? null;
}

/** The current plan: carried rows (STARTING, STARTED: closed, dropped and reached included) and the accepted version's PLANNED and LATER rows. */
export function planRowsOf(b: RoadmapBundle): MilestoneBundle[] {
  const v = b.roadmap.version;
  return b.milestones.filter((m) => isCarried(m) || (v > 0 && m.version === v && (m.status === "PLANNED" || m.status === "LATER"))).sort(byOrd);
}

/** The draft version's rows (version + 1, DRAFT or LATER). */
export function draftRowsOf(b: RoadmapBundle): MilestoneBundle[] {
  const v = b.roadmap.version + 1;
  return b.milestones.filter((m) => m.version === v && (m.status === "DRAFT" || m.status === "LATER")).sort(byOrd);
}

const scheduled = (m: { status: string }) => m.status !== "LATER";
const liveItem = (i: { decision: string }) => i.decision !== "REMOVED";

/** What a goal template tells the planning engine about a carried row: its one due day, and whether it is still worked. */
type GoalFacts = Pick<TemplateLite, "dueDay" | "archivedAt" | "closedScore">;

/**
 * A carried row no longer worked whose position goes on in a newer row
 * among `pool`: STARTED, not reached, its goal archived (dropped) or closed,
 * and a newer row of its lineage there — its "Start again" copy, PLANNED, or
 * re-planned into the draft. An unknown goal never counts as replaced.
 */
function replacedInPlan(m: MilestoneRec, pool: readonly MilestoneRec[], goals: ReadonlyMap<string, GoalFacts>): boolean {
  if (m.status !== "STARTED" || m.reachedDay != null || !m.goalId) return false;
  const goal = goals.get(m.goalId);
  if (!goal || (goal.archivedAt == null && goal.closedScore == null)) return false;
  return pool.some((r) => r.id !== m.id && r.lineageId === m.lineageId && isNewerRow(r, m));
}

/**
 * The carried rows the planning engine reads (fix round 2; R2's handoffs 1,
 * 3 and 4): what fitPlan, feasibilityOf, refit, applyRemedy, refitForStart
 * and startSnapshotOf are given beside the unstarted rows.
 *   - Each at its one due day (milestoneDueDayOf: the goal's once Start
 *     created it), so after a Reschedule the windows after it start the day
 *     after the goal's new due day, never the milestone row's old one.
 *   - None that another row of its position replaces: a superseded row
 *     (isSupersededRow), or a dropped or closed one whose "Start again" copy
 *     is planned or in the draft (replacedInPlan). Its card use, target and
 *     due day would otherwise feed the shared writing capacity, the
 *     never-falls floor and the re-split's start beside the copy's own.
 * `others` are the plan's other rows (the version's PLANNED and LATER rows,
 * or the draft's); `goals` the carried rows' goal templates.
 */
export function carriedPlanOf(b: RoadmapBundle, others: readonly MilestoneRec[], goals: ReadonlyMap<string, GoalFacts>): MilestoneDraft[] {
  const carried = planRowsOf(b).filter(isCarried);
  const pool = [...carried, ...others];
  return carried
    .filter((m) => !superseded(b, m) && !replacedInPlan(m, pool, goals))
    .map((m) => ({ ...draftOf(m), dueDay: milestoneDueDayOf(m.dueDay, m.goalId ? (goals.get(m.goalId)?.dueDay ?? null) : null) }));
}

/**
 * The "opposite state" (fix round 2's carry-over, R2's handoff 1): an
 * unstarted row (PLANNED, LATER or DRAFT) whose lineage still has a carried
 * STARTED row, unreached, with an OPEN goal — a dropped original unarchived
 * while its "Start again" copy waits. The original stands for the position,
 * so the dormant copy is left out of what the planning engine reads and is
 * never carried into a re-plan (money was already safe: Start refuses with
 * STARTED_ELSEWHERE and lineagePaidOn pays 0).
 */
function dormantCopy(b: RoadmapBundle, m: MilestoneRec, goals: ReadonlyMap<string, GoalFacts>): boolean {
  if (isCarried(m) || m.status === "DISCARDED" || m.status === "SUPERSEDED") return false;
  return b.milestones.some((x) => {
    if (x.id === m.id || x.lineageId !== m.lineageId || x.status !== "STARTED" || x.reachedDay != null || !x.goalId) return false;
    const goal = goals.get(x.goalId);
    return !!goal && goal.archivedAt == null && goal.closedScore == null;
  });
}

/** The carried rows' goal templates (their due days, archived or closed), for carriedPlanOf. Unreadable: none (logged), so each row keeps its own due day. */
async function carriedGoalsOf(e: Env, userId: string, b: RoadmapBundle): Promise<Map<string, GoalFacts>> {
  const ids = Array.from(new Set(planRowsOf(b).filter(isCarried).map((m) => m.goalId).filter((g): g is string => !!g)));
  if (ids.length === 0) return new Map();
  try {
    return new Map((await e.io.templates(userId, ids)).map((t) => [t.id, t]));
  } catch (err) {
    console.error("roadmap: carried goals unavailable (the plan reads the milestones' own due days):", err);
    return new Map();
  }
}

/** The milestone that must be decided now: the first scheduled DRAFT row. */
function nextDraftRow<T extends { status: string }>(rows: readonly T[]): T | null {
  return rows.find((m) => m.status === "DRAFT") ?? null;
}

/** The latest acceptance not undone, of the roadmap's current version. */
function currentAcceptance(b: RoadmapBundle): AcceptanceRec | null {
  for (let i = b.acceptances.length - 1; i >= 0; i--) {
    const a = b.acceptances[i];
    if (a.version === b.roadmap.version && a.undoneAt == null) return a;
  }
  return null;
}

function endStateOf(a: AcceptanceRec | null): EndStateTerm[] {
  if (!a || !Array.isArray(a.endState)) return [];
  return (a.endState as unknown[]).filter((x): x is EndStateTerm => !!x && typeof x === "object" && typeof (x as EndStateTerm).measureKey === "string");
}

function feasibilityOfAcceptance(a: AcceptanceRec | null): Feasibility | null {
  return a && a.feasibility && typeof a.feasibility === "object" ? (a.feasibility as Feasibility) : null;
}

function startSnapshotOfRow(m: MilestoneRec): StartSnapshot | null {
  const f = m.feasibility as { kind?: unknown } | null;
  return f && f.kind === "START" ? (m.feasibility as StartSnapshot) : null;
}

function planFeasibilityOfRow(m: MilestoneRec): MilestoneFeasibility | null {
  const f = m.feasibility as { kind?: unknown } | null;
  if (!f) return null;
  if (f.kind === "PLAN") return m.feasibility as MilestoneFeasibility;
  if (f.kind === "START") return (m.feasibility as StartSnapshot).feasibility ?? null;
  return null;
}

// ═══ Revision 4 facts (depth, legacy, R, stages) ════════════════════════════

/** Roadmap.depth when it is a depth (8, 10, 12); null on a track Area or a legacy plan. */
function depthOf(r: Pick<RoadmapRec, "depth">): AimDepth | null {
  return isAimDepth(r.depth) ? r.depth : null;
}

/** Roadmap.dateMode as a DateMode (a row read before the migration is CHOSEN). */
function dateModeOf(r: Pick<RoadmapRec, "dateMode">): DateMode {
  return isOneOf(DATE_MODES, r.dateMode) ? r.dateMode : "CHOSEN";
}

/** The rows isLegacyRoadmap reads: every row of the current version and of the draft version (not discarded or superseded). */
function versionRowsOf(b: RoadmapBundle): MilestoneBundle[] {
  const v = b.roadmap.version;
  return b.milestones.filter((m) => (m.version === v || m.version === v + 1) && m.status !== "DISCARDED" && m.status !== "SUPERSEDED");
}

/**
 * A plan made before revision 4 (F-R4-16; roadmap-types isLegacyRoadmap):
 * depth null on a Field Area, or a row of its current or draft version with
 * no stage. Its milestone and item text is never returned by a view; it
 * cannot accept (a legacy draft) or start a milestone, and is not measured.
 */
function legacyOf(b: RoadmapBundle): boolean {
  return isLegacyRoadmap({ fieldId: b.roadmap.fieldId, depth: depthOf(b.roadmap) }, versionRowsOf(b).map((m) => ({ stage: m.stage ?? null })));
}

/** The draft version alone is legacy (rows with no stage): accept refuses "Draft it again first". */
function legacyDraftOf(b: RoadmapBundle): boolean {
  return draftRowsOf(b).some((m) => m.stage == null) || (b.roadmap.fieldId != null && depthOf(b.roadmap) == null);
}

/**
 * A legacy roadmap's banner (F-R4-16): its status, whether any row of it had
 * a Gemini origin ("Wording from an earlier Gemini draft is hidden."), and
 * what "Start again at a depth" carries into the new intake (fix round,
 * contracts §15.11): its chosen Domains and its Area Field (null on a track
 * Area). The handoff offers `replaces` only while `kind` is ACTIVE.
 */
function legacyViewOf(b: RoadmapBundle): LegacyView {
  const gemini = b.milestones.some((m) => m.titleOrigin === "GEMINI" || m.items.some((i) => i.origin === "GEMINI"));
  return { kind: b.roadmap.status as RoadmapStatus, geminiHidden: gemini, domainIds: [...b.roadmap.domainIds], areaFieldId: b.roadmap.fieldId };
}

/** A DOMAIN item that adds a Domain to R beyond the intake's: Gemini's `needs` the user confirmed, or one created from a suggestion. */
function addsToRequired(i: Pick<ItemRec | ItemDraft, "kind" | "decision" | "notes" | "domainId">): boolean {
  if (i.kind !== "DOMAIN" || !i.domainId || i.decision === "REMOVED") return false;
  if (i.notes.includes("FROM_SUGGESTION")) return true;
  return i.notes.includes("NOT_CHOSEN") && (i.decision === "CHECKED" || i.decision === "EDITED");
}

/**
 * R, the required Domains of a depth plan, in order (F-R4-9): the intake's
 * chosen (and named) Domains, then the additions the user confirmed
 * (Gemini's `needs`, CHECKED) and the Domains created from a suggestion, as
 * the rows hold them. Never above DEPTH_DOMAINS_MAX by construction (the
 * intake and the confirmations refuse a 7th). A track Area has none.
 */
function requiredDomainsOf(b: Pick<RoadmapBundle, "roadmap">, rows: readonly { items: readonly Pick<ItemRec | ItemDraft, "kind" | "decision" | "notes" | "domainId">[] }[]): string[] {
  if (b.roadmap.fieldId == null) return [];
  const out = Array.from(new Set(b.roadmap.domainIds));
  for (const m of rows) for (const i of m.items) if (addsToRequired(i) && !out.includes(i.domainId as string)) out.push(i.domainId as string);
  return out;
}

/** A Gemini `needs` addition still waiting for the user's confirm (F-R4-21): it blocks accept. */
const pendingAddition = (i: Pick<ItemDraft, "kind" | "decision" | "notes" | "origin">): boolean =>
  i.kind === "DOMAIN" && i.origin === "GEMINI" && i.decision === "PENDING" && i.notes.includes("NOT_CHOSEN");

/**
 * Runs R2's naming steps (fitPlan's relabel, syncStagePractices) with every
 * pending Gemini addition hidden (fix round 2, lens 1 minor; F-R4-21): R2
 * names a stage's practices, steps and checkpoint over the row's live DOMAIN
 * items, and a Domain Gemini suggested is not the user's until confirmed, so
 * no code label ever names one while it waits. The hidden rows go in as
 * REMOVED and come back PENDING, where they were, after the step. Once the
 * user decides ([Add] CHECKED, [Leave out] REMOVED), the redraft runs the
 * same step and the labels follow R as it then stands.
 */
function withPendingHidden(plan: readonly MilestoneDraft[], step: (masked: MilestoneDraft[]) => MilestoneDraft[]): MilestoneDraft[] {
  const hidden = new Map<string, ItemDraft[]>();
  for (const m of plan) {
    const waiting = isCarried(m) ? [] : m.items.filter(pendingAddition);
    if (waiting.length) hidden.set(m.lineageId, waiting);
  }
  if (hidden.size === 0) return step([...plan]);
  const masked = plan.map((m) => (hidden.has(m.lineageId) && !isCarried(m) ? { ...m, items: m.items.map((i) => (pendingAddition(i) ? { ...i, decision: "REMOVED" as Decision } : i)) } : m));
  return step(masked).map((m) => {
    const waiting = hidden.get(m.lineageId);
    // A carried row of the same lineage (a "Start again" copy's original) never held them.
    if (!waiting || isCarried(m)) return m;
    const lineages = new Set(waiting.map((i) => i.lineageId));
    const items = m.items.map((i) => (lineages.has(i.lineageId) && i.kind === "DOMAIN" && i.decision === "REMOVED" ? { ...i, decision: "PENDING" as Decision } : i));
    // A step that dropped a hidden row gives it back at the end of its milestone.
    let ord = Math.max(0, ...items.map((i) => i.ord));
    for (const w of waiting) if (!items.some((i) => i.lineageId === w.lineageId)) items.push({ ...w, ord: ++ord });
    return { ...m, items };
  });
}

/** A row's live Domains that code may name (fix round 2): its live DOMAIN items, a pending Gemini addition left out. */
const nameableDomainsOf = (m: Pick<MilestoneDraft, "items">): string[] =>
  m.items.filter((i) => i.kind === "DOMAIN" && liveItem(i) && !!i.domainId && !pendingAddition(i)).map((i) => i.domainId as string);

/**
 * A session pick (F-R4-17) not yet confirmed: a Gemini pick of a session-pick
 * kind (roadmap-catalog isSessionPickKind: every practice type, plus
 * FULL_ATTEMPT and PERFORMANCE_CHECK — the two that are the activity itself,
 * which a cue-less or cue-first constraint such as "pregnant" never
 * excludes), still PENDING, whatever its slot. It waits only on a plan that
 * needs the confirm (picksNeedConfirmOf). Contracts §15.8.
 */
const pendingPick = (i: Pick<ItemDraft, "kind" | "decision" | "notes" | "catalogKey">): boolean => isSessionPickKind(i.catalogKey) && i.decision === "PENDING" && i.notes.includes("GEMINI_PICK");

/** A Gemini session pick, waiting or kept (the confirm's list): the same kinds as pendingPick, not removed. */
const sessionPick = (i: Pick<ItemDraft, "kind" | "decision" | "notes" | "catalogKey">): boolean => isSessionPickKind(i.catalogKey) && i.decision !== "REMOVED" && i.notes.includes("GEMINI_PICK");

/**
 * Whether Gemini's session picks need the user's one confirm (F-R4-17): a
 * BODY or CARE plan with constraints (or non-English or unparsed ones) — R3's
 * sessionConfirmNeeded, the one rule. A Field plan's picks never wait.
 */
function picksNeedConfirmOf(r: Pick<RoadmapRec, "fieldId" | "track" | "constraints">): boolean {
  const track = catalogTrackOf({ fieldId: r.fieldId, track: isOneOf(ROADMAP_TRACKS, r.track) ? r.track : DEFAULT_FIELD_TRACK });
  try {
    return validate.sessionConfirmNeeded(track, r.constraints);
  } catch {
    return (track === "BODY" || track === "CARE") && !!r.constraints?.trim();
  }
}

/** A stage's gate level: its paying card measure's level, else its gate stage's level; null on a track stage or a legacy row. */
function gateLevelOf(m: Pick<MilestoneDraft, "measures" | "stage">): number | null {
  const card = m.measures.find((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS" && x.minLevel != null);
  if (card?.minLevel != null) return card.minLevel;
  const s = m.stage;
  return s && (STAGE_KEYS as readonly string[]).includes(s) ? STAGE_LEVEL[s as (typeof STAGE_KEYS)[number]] : null;
}

/** "Held when you began" (HELD_AT_START): reached at acceptance, never startable, and it gives no rank. */
const heldRow = (m: { feasibility?: unknown; notes?: readonly string[] }): boolean =>
  (m.notes ?? storedNotes(m.feasibility)).includes("HELD_AT_START");

// ═══ Intake (F2) ════════════════════════════════════════════════════════════

/** Collapses whitespace, strips control and format characters, trims (NFC). Never truncates: an over-long field is refused. */
function cleanText(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const intIn = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

export interface IntakeContext {
  today: DayKey;
  /** The Field tree (Domain names let a named Domain be checked against the Area's existing ones). */
  fields: readonly { id: string; domains: readonly { id: string; name?: string }[] }[];
}

/** A named Domain's longest name (taxonomy's Domain name cap, as LABEL_MAX.DOMAIN). */
const DOMAIN_NAME_MAX = 80;

/** Refusals in words (revision 4 intake). */
export const DEPTH_ON_TRACK = "A life-track Area has no depth: it plans practice, not cards.";
export const TOO_MANY_DOMAINS = `A plan holds up to ${DEPTH_DOMAINS_MAX} Domains.`;
export const NAME_THE_EXAM = "Name the exam or qualification.";
export const EXAM_DAY_RANGE = "The exam date must be between tomorrow and 3 years from now.";
export const LINE_DOMAIN_OUTSIDE = "Tie each outline line to one of the plan's Domains, or to none.";
export const COVERAGE_RANGE = `Type a coverage from ${COVER_MIN} to ${COVER_MAX} cards.`;
/** "Start again at a depth" (F-R4-16): the archive reason of the legacy roadmap a new intake replaces. */
export const replacedReasonOf = (day: DayKey): string => `replaced by a plan aimed at a depth on ${day}`;
/** A legacy draft can't be accepted, and a legacy plan can't start a milestone (F-R4-16). */
export const DRAFT_IT_AGAIN = "Draft it again first: this draft was made before plans aimed at a depth.";
export const START_AGAIN_AT_DEPTH = "Start again at a depth first: this plan was made before plans aimed at a depth.";
/** A legacy DRAFT (no depth) is drafted only after its intake is saved with one: "[Draft it again]" opens the intake form. */
export const PICK_A_DEPTH_FIRST = "Pick a depth in the intake first: this draft was made before plans aimed at a depth.";

/**
 * The server's validation of an intake (the browser's values are never
 * trusted): lengths, the span (35–1,080 days), hours, typical hours and the
 * new-card rate, the syllabus caps, a known Field, Domains that exist (any
 * Field; unknown ones dropped), and a track Area with no Domains. Returns the
 * normalised intake or the first refusal in words.
 *
 * Revision 4 (F-R4-4, F-R4-9, F-R4-24):
 *   - depth: a Field Area's is 12, 10 or 8 (absent: DEPTH_DEFAULT, Mastered);
 *     a track Area has none (a depth there is refused);
 *   - at most DEPTH_DOMAINS_MAX Domains, the named ones (newDomainNames) included;
 *   - coverage: typed figures COVER_MIN..COVER_MAX for chosen Domains only;
 *   - dateMode: REALISTIC (a Field Area only; the date is provisional,
 *     today + SPAN_MAX_DAYS until a draft write sets the realistic one) or
 *     CHOSEN (the user's date, 35–1,080 days); absent: CHOSEN with a date,
 *     else REALISTIC on a Field Area;
 *   - the exam: Yes needs its name; No clears the name and the date; the
 *     date is optional, between tomorrow and SPAN_MAX_DAYS away;
 *   - the outline lines' Domains (lineDomains, YOURS): each the chosen
 *     Domains' or none, kept aligned with the lines that survive cleaning;
 *   - named Domains: cleaned, ≤ 80 characters, no link, no repeat, none the
 *     name of a Domain the Area already has.
 */
export function validateIntake(raw: unknown, ctx: IntakeContext): { ok: true; value: Intake } | { ok: false; error: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bad = (error: string) => ({ ok: false as const, error });

  const aim = cleanText(r.aim);
  if (!aim) return bad("Write your aim: what you want to be able to do.");
  if (Array.from(aim).length > AIM_MAX) return bad(`Keep the aim to ${AIM_MAX} characters.`);

  const fieldId = typeof r.fieldId === "string" && r.fieldId ? r.fieldId : null;
  const field = fieldId ? ctx.fields.find((f) => f.id === fieldId) : null;
  if (fieldId && !field) return bad("That Field no longer exists.");

  let track: Track;
  if (r.track == null && fieldId) track = DEFAULT_FIELD_TRACK;
  else if (isOneOf(ROADMAP_TRACKS, r.track)) track = r.track;
  else return bad("Pick what the practices count toward.");

  const rawDomains = Array.isArray(r.domainIds) ? r.domainIds.filter((d): d is string => typeof d === "string") : [];
  let domainIds: string[] = [];
  if (fieldId) {
    const known = new Set(ctx.fields.flatMap((f) => f.domains.map((d) => d.id)));
    domainIds = Array.from(new Set(rawDomains.filter((d) => known.has(d)))).slice(0, PACK_MAX_DOMAINS);
  } else if (rawDomains.length > 0) {
    return bad("A life-track Area has no Domains: pick a Field to plan with cards.");
  }

  // Depth (F-R4-9): a Field Area's end state; a track Area has none.
  let depth: AimDepth | null = null;
  if (fieldId) {
    if (r.depth == null) depth = AIM_DEPTHS[DEPTH_DEFAULT];
    else if (isAimDepth(r.depth)) depth = r.depth;
    else return bad("Pick a depth: Mastered, Fluent or Retained.");
  } else if (r.depth != null) {
    return bad(DEPTH_ON_TRACK);
  }

  // Named Domains (F-R4-24): an empty library's "Name the areas this needs", created in the Area Field at save.
  const newDomainNames: string[] = [];
  if (Array.isArray(r.newDomainNames) && r.newDomainNames.length > 0) {
    if (!fieldId) return bad("A life-track Area has no Domains: pick a Field to plan with cards.");
    const existing = new Set((ctx.fields.find((f) => f.id === fieldId)?.domains ?? []).map((d) => (d.name ?? "").toLowerCase()).filter((n) => n.length > 0));
    for (const raw of r.newDomainNames) {
      const name = cleanText(raw);
      if (!name) return bad("Name each area, or remove the empty one.");
      if (Array.from(name).length > DOMAIN_NAME_MAX) return bad(`Keep each area's name to ${DOMAIN_NAME_MAX} characters.`);
      if (URL_LIKE.test(name)) return bad("An area's name can't be a link.");
      const key = name.toLowerCase();
      if (existing.has(key)) return bad(`You already have a Domain named “${name}”: pick it instead.`);
      if (newDomainNames.some((n) => n.toLowerCase() === key)) return bad(`“${name}” is named twice.`);
      newDomainNames.push(name);
    }
  }
  if (depth != null && domainIds.length + newDomainNames.length > DEPTH_DOMAINS_MAX) return bad(TOO_MANY_DOMAINS);

  // Typed coverage (YOURS): only the chosen Domains' figures, each COVER_MIN..COVER_MAX.
  let coverage: Record<string, number> | null = null;
  if (r.coverage != null) {
    if (typeof r.coverage !== "object" || Array.isArray(r.coverage)) return bad(COVERAGE_RANGE);
    if (!fieldId) return bad(DEPTH_ON_TRACK);
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(r.coverage as Record<string, unknown>)) {
      if (!domainIds.includes(id)) continue;
      const v = intIn(n, COVER_MIN, COVER_MAX);
      if (v == null) return bad(COVERAGE_RANGE);
      out[id] = v;
    }
    coverage = Object.keys(out).length ? out : null;
  }

  // The date (F-R4-4, F-R4-11): REALISTIC dates the plan from the cards (a Field Area only); CHOSEN is the user's date.
  let dateMode: DateMode;
  if (r.dateMode == null) dateMode = fieldId && (r.targetDay == null || r.targetDay === "") ? "REALISTIC" : "CHOSEN";
  else if (isOneOf(DATE_MODES, r.dateMode)) dateMode = r.dateMode;
  else return bad("Pick when: when realistic, or a date.");
  if (!fieldId) dateMode = "CHOSEN";
  let targetDay: DayKey;
  if (dateMode === "REALISTIC") {
    // Provisional: every draft write sets the realistic date (guarded on DRAFT); acceptance fixes it.
    targetDay = addDays(ctx.today, SPAN_MAX_DAYS);
  } else {
    const chosen = typeof r.targetDay === "string" && isDayKey(r.targetDay) ? r.targetDay : null;
    if (!chosen) return bad("Pick a date for the aim.");
    const span = daysBetween(ctx.today, chosen);
    if (span < SPAN_MIN_DAYS) return bad("Too short for a roadmap — capture it as a goal on Today.");
    if (span > SPAN_MAX_DAYS) return bad("Set where you want to be in 3 years; planning further out comes later.");
    targetDay = chosen;
  }

  const hoursPerWeek = intIn(r.hoursPerWeek, HOURS_MIN, HOURS_MAX);
  if (hoursPerWeek == null) return bad(`Hours a week must be a whole number from ${HOURS_MIN} to ${HOURS_MAX}.`);

  let newCardsPerWeek: number | null = null;
  if (r.newCardsPerWeek != null && r.newCardsPerWeek !== "") {
    newCardsPerWeek = intIn(r.newCardsPerWeek, NEW_CARDS_PER_WEEK_MIN, NEW_CARDS_PER_WEEK_MAX);
    if (newCardsPerWeek == null) return bad(`New cards a week must be a whole number from ${NEW_CARDS_PER_WEEK_MIN} to ${NEW_CARDS_PER_WEEK_MAX}, or blank.`);
  }

  let typicalHours: number | null = null;
  let typicalHoursSource: string | null = null;
  if (r.typicalHours != null && r.typicalHours !== "") {
    typicalHours = intIn(r.typicalHours, TYPICAL_HOURS_MIN, TYPICAL_HOURS_MAX);
    if (typicalHours == null) return bad(`Hours this usually takes must be a whole number from ${TYPICAL_HOURS_MIN} to ${TYPICAL_HOURS_MAX}, or blank.`);
    const source = cleanText(r.typicalHoursSource);
    if (Array.from(source).length > SOURCE_NOTE_MAX) return bad(`Keep where that figure comes from to ${SOURCE_NOTE_MAX} characters.`);
    typicalHoursSource = source || null;
  }

  let syllabus: Syllabus | null = null;
  if (r.syllabus != null) {
    const s = r.syllabus && typeof r.syllabus === "object" ? (r.syllabus as Record<string, unknown>) : {};
    const rawLines = Array.isArray(s.lines) ? s.lines : [];
    const rawDomainsOfLines = Array.isArray(s.lineDomains) ? s.lineDomains : null;
    // Each line keeps its own Domain while blank lines drop out (the two lists stay aligned).
    const pairs = rawLines.map((l, i) => ({ line: cleanText(l), domain: rawDomainsOfLines ? rawDomainsOfLines[i] : undefined })).filter((p) => p.line.length > 0);
    const lines = pairs.map((p) => p.line);
    if (lines.length > SYLLABUS_MAX_LINES || lines.some((l) => Array.from(l).length > SYLLABUS_LINE_MAX)) {
      return bad(`The syllabus takes up to ${SYLLABUS_MAX_LINES} lines of up to ${SYLLABUS_LINE_MAX} characters each.`);
    }
    const source = cleanText(s.source);
    if (Array.from(source).length > SOURCE_NOTE_MAX) return bad(`Keep the syllabus source to ${SOURCE_NOTE_MAX} characters.`);
    let lineDomains: (string | null)[] | undefined;
    if (rawDomainsOfLines) {
      lineDomains = [];
      for (const p of pairs) {
        if (p.domain == null || p.domain === "") lineDomains.push(null);
        else if (typeof p.domain === "string" && domainIds.includes(p.domain)) lineDomains.push(p.domain);
        else return bad(LINE_DOMAIN_OUTSIDE);
      }
    }
    syllabus = lines.length ? { lines, source: source || null, ...(lineDomains ? { lineDomains } : {}) } : null;
  }

  if (!isOneOf(START_POINTS, r.startPoint)) return bad("Pick where you're starting.");
  const startPoint: StartPoint = r.startPoint;
  if (!isOneOf(INTENSITIES, r.intensity)) return bad("Pick how hard.");
  const intensity: Intensity = r.intensity;

  const constraints = cleanText(r.constraints);
  if (Array.from(constraints).length > CONSTRAINTS_MAX) return bad(`Keep the constraints to ${CONSTRAINTS_MAX} characters.`);
  let examLabel = cleanText(r.examLabel);
  if (Array.from(examLabel).length > EXAM_MAX) return bad(`Keep the exam name to ${EXAM_MAX} characters.`);

  // The exam question (F-R4-24): the user's fact. Yes needs the name; No clears the name and the date.
  const exam: boolean | null = r.exam === true ? true : r.exam === false ? false : null;
  if (exam === true && !examLabel) return bad(NAME_THE_EXAM);
  if (exam === false) examLabel = "";
  let examDay: DayKey | null = null;
  if (examLabel && r.examDay != null && r.examDay !== "") {
    const day = typeof r.examDay === "string" && isDayKey(r.examDay) ? r.examDay : null;
    if (!day || day <= ctx.today || daysBetween(ctx.today, day) > SPAN_MAX_DAYS) return bad(EXAM_DAY_RANGE);
    examDay = day;
  }

  const practicesAllowed = fieldId ? r.practicesAllowed !== false : true;
  const replaces = typeof r.replaces === "string" && r.replaces.length > 0 && r.replaces.length <= 64 ? r.replaces : null;

  return {
    ok: true,
    value: {
      aim,
      fieldId,
      track,
      domainIds,
      targetDay,
      hoursPerWeek,
      newCardsPerWeek,
      typicalHours,
      typicalHoursSource,
      syllabus,
      startPoint,
      intensity,
      practicesAllowed,
      constraints: constraints || null,
      examLabel: examLabel || null,
      depth,
      coverage,
      dateMode,
      exam: examLabel ? true : exam === false ? false : null,
      examDay,
      ...(newDomainNames.length ? { newDomainNames } : {}),
      replaces,
      // Read only while ROADMAP_GAPS_LIVE (decision 51); a Field Area only.
      suggestAreas: !!fieldId && r.suggestAreas === true,
    },
  };
}

/** The intake a roadmap row holds. */
export function intakeOf(r: RoadmapRec): Intake {
  const s = r.syllabus && typeof r.syllabus === "object" ? (r.syllabus as { lines?: unknown; source?: unknown; lineDomains?: unknown }) : null;
  let syllabus: Syllabus | null = null;
  if (s && Array.isArray(s.lines)) {
    const lines = s.lines.filter((l): l is string => typeof l === "string");
    const ld = Array.isArray(s.lineDomains) ? lines.map((_, i) => (typeof (s.lineDomains as unknown[])[i] === "string" ? ((s.lineDomains as unknown[])[i] as string) : null)) : undefined;
    syllabus = { lines, source: typeof s.source === "string" ? s.source : null, ...(ld ? { lineDomains: ld } : {}) };
  }
  const coverage: Record<string, number> = {};
  if (r.coverage && typeof r.coverage === "object" && !Array.isArray(r.coverage)) {
    for (const [k, v] of Object.entries(r.coverage as Record<string, unknown>)) if (typeof v === "number" && Number.isInteger(v) && v >= COVER_MIN && v <= COVER_MAX) coverage[k] = v;
  }
  return {
    depth: depthOf(r),
    coverage: Object.keys(coverage).length ? coverage : null,
    dateMode: dateModeOf(r),
    exam: r.examLabel ? true : null,
    examDay: r.examLabel ? (r.examDay ?? null) : null,
    suggestAreas: r.suggestAreas === true,
    aim: r.aim,
    fieldId: r.fieldId,
    track: isOneOf(ROADMAP_TRACKS, r.track) ? r.track : DEFAULT_FIELD_TRACK,
    domainIds: [...r.domainIds],
    targetDay: r.targetDay,
    hoursPerWeek: r.hoursPerWeek,
    newCardsPerWeek: r.newCardsPerWeek,
    typicalHours: r.typicalHours,
    typicalHoursSource: r.typicalHoursSource,
    syllabus,
    startPoint: isOneOf(START_POINTS, r.startPoint) ? r.startPoint : "NEW",
    intensity: isOneOf(INTENSITIES, r.intensity) ? r.intensity : "STEADY",
    practicesAllowed: r.practicesAllowed,
    constraints: r.constraints,
    examLabel: r.examLabel,
  };
}

function intakeData(i: Intake, today: DayKey): Record<string, unknown> {
  return {
    aim: i.aim,
    fieldId: i.fieldId,
    domainIds: [...i.domainIds],
    track: i.track,
    startDay: today,
    targetDay: i.targetDay,
    hoursPerWeek: i.hoursPerWeek,
    newCardsPerWeek: i.newCardsPerWeek,
    typicalHours: i.typicalHours,
    typicalHoursSource: i.typicalHoursSource,
    syllabus: i.syllabus,
    startPoint: i.startPoint,
    intensity: i.intensity,
    practicesAllowed: i.practicesAllowed,
    constraints: i.constraints,
    examLabel: i.examLabel,
    depth: i.fieldId ? (i.depth ?? AIM_DEPTHS[DEPTH_DEFAULT]) : null,
    dateMode: i.dateMode ?? "CHOSEN",
    coverage: i.coverage ?? null,
    suggestAreas: i.suggestAreas === true,
    examDay: i.examLabel ? (i.examDay ?? null) : null,
  };
}

const isOpen = (r: { status: string }) => r.status === "DRAFT" || r.status === "ACTIVE";
const latestFirst = (a: RoadmapRec, b: RoadmapRec) => b.updatedAt.getTime() - a.updatedAt.getTime();

/**
 * One claim-first array transaction: the advisory lock, a guard that no
 * ACTIVE roadmap exists, then an update of the user's open DRAFT or an
 * insert. A double tap writes one row; with another roadmap ACTIVE it
 * refuses ("Archive it to start another").
 */
export async function saveIntakeCore(userId: string, intake: Intake, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ roadmapId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const today = todayKey(now);
  const tree = await e.io.fieldTree();
  const valid = validateIntake(intake, { today, fields: tree });
  if (!valid.ok) return fail(valid.error);
  let value = valid.value;
  // An empty library's named areas (F-R4-24): created in the Area Field (YOURS), reused by name on a repeat tap.
  if (value.fieldId && value.newDomainNames?.length) {
    const made = await createNamedDomains(e, value.fieldId, value.newDomainNames, tree);
    if (!made.ok) return fail(made.error);
    value = { ...value, domainIds: Array.from(new Set([...value.domainIds, ...made.value])), newDomainNames: undefined };
  }
  // A plan with nothing left to do, or none within 3 years, is refused here and again at accept (F-R4-10, decision 41).
  const refusal = await intakeRefusalOf(e, userId, value, now);
  if (refusal) return fail(refusal);
  const data = intakeData(value, today);
  const replacing = value.replaces ?? null;
  const res = await withRetry<{ roadmapId: string }>(async () => {
    const all = await e.store.listRoadmaps(userId);
    const rows = all.filter(isOpen).sort(latestFirst);
    // "Start again at a depth" (F-R4-16): the legacy ACTIVE roadmap it replaces is archived in this same transaction.
    const old = replacing ? (all.find((r) => r.id === replacing) ?? null) : null;
    if (old && old.status === "ACTIVE") {
      // A legacy plan (isLegacyRoadmap: depth null on a Field Area, or a row of its version with no stage) — a rev-3 life-track
      // plan included (its Area has no Field) — is what "Start again at a depth" replaces (F-R4-16; the fix round's lens 3).
      const ob = await e.store.bundle(userId, old.id);
      if (!ob || !legacyOf(ob) || depthOf(old) != null) return fail("Only a plan made before plans aimed at a depth is replaced this way.");
      if (rows.some((r) => r.status === "DRAFT")) return fail("Finish or discard your open draft first.");
      if (ob.milestones.some(isCarried)) return fail("A milestone of that plan has started, so it can't be replaced.");
      const id = e.makeId();
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: old.id, statuses: ["ACTIVE"], depthNull: true } },
        { op: "guard", guard: { g: "NO_STARTED_MILESTONE", roadmapId: old.id } },
        { op: "guard", guard: { g: "NO_OTHER_OPEN", exceptId: old.id } },
        { op: "update", table: "roadmap", where: { id: old.id, status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: now, archiveReason: replacedReasonOf(today), updatedAt: now } },
        { op: "update", table: "roadmapMilestone", where: { roadmapId: old.id, status: { in: ["DRAFT"] } }, data: { status: "DISCARDED" } },
        { op: "insert", table: "roadmap", rows: [{ id, userId, ...data, status: "DRAFT", version: 0, createdAt: now, updatedAt: now }] },
      ]);
      return out === "ok" ? ok({ roadmapId: id }) : "stale";
    }
    if (rows.some((r) => r.status === "ACTIVE")) return fail(ANOTHER_ACTIVE);
    const draft = rows.find((r) => r.status === "DRAFT") ?? null;
    if (draft) {
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: draft.id, statuses: ["DRAFT"] } },
        { op: "guard", guard: { g: "NO_OTHER_ACTIVE", exceptId: draft.id } },
        { op: "update", table: "roadmap", where: { id: draft.id, status: "DRAFT" }, data: { ...data, updatedAt: now } },
      ]);
      return out === "ok" ? ok({ roadmapId: draft.id }) : "stale";
    }
    const id = e.makeId();
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "NO_OTHER_OPEN", exceptId: null } },
      { op: "insert", table: "roadmap", rows: [{ id, userId, ...data, status: "DRAFT", version: 0, createdAt: now, updatedAt: now }] },
    ]);
    return out === "ok" ? ok({ roadmapId: id }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/** The named areas of an empty library (F-R4-24): each created in the Area Field (taxonomy createDomain), or the existing one of that name reused. */
async function createNamedDomains(e: Env, fieldId: string, names: readonly string[], tree: readonly TreeField[]): Promise<Result<string[]>> {
  const field = tree.find((f) => f.id === fieldId);
  if (!field) return fail("That Field no longer exists.");
  const ids: string[] = [];
  for (const name of names) {
    const existing = field.domains.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const made = await e.io.createDomain(fieldId, name);
    if (!made.ok) return fail(made.error);
    ids.push(made.value.id);
  }
  invalidate("fields", "ideas");
  return ok(ids);
}

/** A roadmap row standing for an intake not saved yet (the planning context of an intake check). */
function intakeRowOf(userId: string, intake: Intake, now: Date): RoadmapRec {
  const today = todayKey(now);
  return {
    id: "intake",
    userId,
    ...(intakeData(intake, today) as Omit<RoadmapRec, "id" | "userId" | "status" | "version" | "firstAcceptedDay" | "reachedDay" | "doneAt" | "doneReason" | "archivedAt" | "archiveReason" | "createdAt" | "updatedAt">),
    status: "DRAFT",
    version: 0,
    firstAcceptedDay: null,
    reachedDay: null,
    doneAt: null,
    doneReason: null,
    archivedAt: null,
    archiveReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The intake's refusal, before anything is saved (F-R4-10, F-R4-11): R2's
 * stage ladder refuses a depth already held in these Domains, one whose
 * realistic date is under SPAN_MIN_DAYS away or past SPAN_MAX_DAYS, and a
 * realistic date with no writing pace. null when the plan has work in it, on
 * a track Area, and when the ladder can't be worked out (logged: the draft
 * and the acceptance check again).
 */
async function intakeRefusalOf(e: Env, userId: string, intake: Intake, now: Date): Promise<string | null> {
  if (!intake.fieldId || !isAimDepth(intake.depth)) return null;
  try {
    const ctx = await planContext(e, userId, intakeRowOf(userId, intake, now), now);
    const names = namesOfDomains(ctx, intake.domainIds);
    const res = e.lanes.stageLadderOf(intake, realismInputOf(ctx, [], [intake.domainIds]), names, e.makeId);
    return res.ok ? null : res.error;
  } catch (err) {
    console.error("roadmap: the intake's stage ladder wasn't worked out (the draft checks again):", err instanceof Error ? err.message : err);
    return null;
  }
}

const measuredPace = (f: WeeklyFigure | undefined): boolean => f?.kind === "measured" && f.median > 0;

/** What /you/roadmap/new renders: the open DRAFT to edit, the Area options with their real facts, tracked time, the key. Writes nothing. */
export async function loadIntakeView(userId: string, now: Date, deps: RoadmapDeps = {}): Promise<IntakeView> {
  const e = envOf(deps);
  const today = todayKey(now);
  const [rows, tree, maintenance, throughput, mRaw] = await Promise.all([
    e.store.listRoadmaps(userId).catch((err: unknown) => {
      if (isMissingRoadmapTable(err)) return [] as RoadmapRec[];
      throw err;
    }),
    e.io.fieldTree(),
    e.io.maintenanceIds(userId).catch(() => new Set<string>()),
    throughputOrNull(e, userId, today),
    e.io.intervalMultiplier(userId).catch(() => 1),
  ]);
  const m = Number.isFinite(mRaw) && mRaw > 0 ? mRaw : 1;
  const open = rows.filter(isOpen).sort(latestFirst);
  const draft = open.find((r) => r.status === "DRAFT") ?? null;
  const active = open.find((r) => r.status === "ACTIVE") ?? null;
  const fields: IntakeFieldOption[] = tree.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    cards: f.domains.reduce((n, d) => n + d.cards.length, 0),
    inMaintenance: maintenance.has(f.id),
    paceMeasured: measuredPace(throughput?.newCards.byField[f.id]),
    domains: f.domains.map((d) => ({
      id: d.id,
      name: d.name,
      cards: d.cards.length,
      atSix: d.cards.filter((c) => c.level >= 6).length,
      atTop: d.cards.filter((c) => c.level >= TOP_LEVEL).length,
      paceMeasured: measuredPace(throughput?.newCards.byDomain[d.id]),
      // Its multiple-choice cards, which a depth plan doesn't count (fix round, contracts §15.11): the intake's coverage
      // preview reads live = cards − nonRecall exactly as coverageFor does ("42 cards · 6 multiple choice not counted").
      nonRecall: d.cards.filter((c) => c.type != null && !isRecallType(c.type)).length,
    })),
  }));
  return {
    today,
    hasKey: geminiOffered(),
    keyTier: GEMINI_KEY_TIER,
    writesOff: writesOff(deps),
    draft: draft ? { roadmapId: draft.id, intake: intakeOf(draft), savedDay: dayKeyOf(draft.updatedAt) } : null,
    activeRoadmapId: active?.id ?? null,
    fields,
    tracked: throughput?.trackedMinutes ?? null,
    // Revision 4 (F-R4-4): the hints' floors are floorBase(L*, m), computed; the chips' verdicts per depth; the measured pace.
    m,
    ...intakeChipsOf(e, today, m, draft ? intakeOf(draft) : null, tree, throughput),
  };
}

/** The same calendar day `months` later (the 31st clamped to the month's last day). */
function addMonths(day: DayKey, months: number): DayKey {
  const [y, mo, d] = day.split("-").map(Number);
  const total = y * 12 + (mo - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}` as DayKey;
}

/**
 * "By when"'s CHOSEN chips (F-R4-4): 6, 12 and 24 months and 3 years, each with
 * its floor verdict per depth — "possible", or "before level 12 is possible"
 * — from R2's floorDayOf over floorBase(L*, m) and the minimum writing days
 * for the new cards the draft's Domains need (the policy's floor, none
 * measured at intake). None is hidden or disabled; the draft gives the full
 * verdict. The measured pace (new cards a week) is the paceRate. When the
 * floor can't be worked out the chips are left out (the form shows its own).
 */
function intakeChipsOf(e: Env, today: DayKey, m: number, intake: Intake | null, tree: readonly TreeField[], throughput: Throughput | null): Pick<IntakeView, "dateChips" | "paceRate"> {
  const total = throughput?.newCards.total;
  const paceRate = total && total.kind === "measured" && total.median > 0 ? total.median : null;
  const facts = domainFactsOf(tree);
  let newCardsNeeded = 0;
  for (const id of intake?.domainIds ?? []) {
    const cards = facts.get(id)?.cards ?? [];
    const live = cards.filter((c) => c.type == null || isRecallType(c.type)).length;
    // The one arithmetic (roadmap-types): the policy's n_d (no outline counted here) or the typed figure, and new_d.
    const n = intake?.coverage?.[id] ?? coveragePolicyOf(live, 0).n;
    newCardsNeeded += writeNeedOf(n, live);
  }
  const ratePerWeek = intake?.newCardsPerWeek ?? paceRate;
  try {
    const dateChips: IntakeDateChip[] = ([6, 12, 24, 36] as const).map((months) => {
      const day = addMonths(today, months);
      const possible = Object.fromEntries(
        DEPTH_KEYS.map((k) => [k, e.lanes.floorDayOf({ today, depth: AIM_DEPTHS[k], m, newCardsNeeded, ratePerWeek: ratePerWeek ?? null }) <= day])
      ) as IntakeDateChip["possible"];
      return { months, day, possible };
    });
    return { dateChips, paceRate };
  } catch (err) {
    console.error("roadmap: the date chips' floors weren't worked out:", err instanceof Error ? err.message : err);
    return { paceRate };
  }
}

/**
 * Discards the open draft (a quiet button with an undo toast). A DRAFT
 * roadmap is archived as a discarded draft (the page then offers a fresh
 * intake); an ACTIVE roadmap's re-plan draft rows become DISCARDED.
 */
export async function discardDraftCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status === "DRAFT") {
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT"] } },
        { op: "update", table: "roadmap", where: { id: roadmapId, status: "DRAFT" }, data: { status: "ARCHIVED", archivedAt: now, archiveReason: DISCARDED_REASON, updatedAt: now } },
        { op: "update", table: "roadmapRun", where: { roadmapId, status: "RUNNING" }, data: { status: "FAILED", error: "discarded", finishedAt: now } },
      ]);
      return out === "ok" ? ok(null) : "stale";
    }
    if (b.roadmap.status === "ACTIVE") {
      const v = b.roadmap.version + 1;
      if (draftRowsOf(b).length === 0) return fail("There's no re-plan draft to discard.");
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: b.roadmap.version } },
        { op: "update", table: "roadmapMilestone", where: { roadmapId, version: v, status: { in: ["DRAFT", "LATER"] } }, data: { status: "DISCARDED" } },
      ]);
      return out === "ok" ? ok(null) : "stale";
    }
    return fail("This roadmap has no draft to discard.");
  });
  invalidate("roadmap");
  return res;
}

/** The discard's Undo: the discarded DRAFT roadmap back to DRAFT (no other open roadmap), or the discarded re-plan rows back. */
export async function undoDiscardCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status === "ARCHIVED" && b.roadmap.archiveReason === DISCARDED_REASON) {
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ARCHIVED"], archiveReason: DISCARDED_REASON } },
        { op: "guard", guard: { g: "NO_OTHER_OPEN", exceptId: roadmapId } },
        { op: "update", table: "roadmap", where: { id: roadmapId, status: "ARCHIVED" }, data: { status: "DRAFT", archivedAt: null, archiveReason: null, updatedAt: now } },
      ]);
      if (out === "ok") return ok(null);
      const others = (await e.store.listRoadmaps(userId)).filter((r) => isOpen(r) && r.id !== roadmapId);
      return others.length ? fail("Another roadmap is open now, so this draft stays discarded.") : "stale";
    }
    if (b.roadmap.status === "ACTIVE") {
      const v = b.roadmap.version + 1;
      if (!b.milestones.some((m) => m.version === v && m.status === "DISCARDED")) return fail("Nothing to restore.");
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: b.roadmap.version } },
        { op: "guard", guard: { g: "NO_DRAFT_ROWS", roadmapId, version: v } },
        { op: "update", table: "roadmapMilestone", where: { roadmapId, version: v, status: "DISCARDED", dueDay: null }, data: { status: "LATER" } },
        { op: "update", table: "roadmapMilestone", where: { roadmapId, version: v, status: "DISCARDED" }, data: { status: "DRAFT" } },
      ]);
      return out === "ok" ? ok(null) : fail("A newer draft replaced it.");
    }
    return fail("Nothing to restore.");
  });
  invalidate("roadmap");
  return res;
}

// ═══ The planning context (realism input) ═══════════════════════════════════

interface DomainFacts {
  id: string;
  name: string;
  fieldId: string;
  fieldName: string;
  cards: TreeCard[];
}

interface PlanContext {
  today: DayKey;
  roadmap: RoadmapRec;
  intake: Intake;
  tree: TreeField[];
  domains: Map<string, DomainFacts>;
  areaName: string;
  throughput: Throughput;
  /** The rows the throughput came from: a card scope's own pace is read from them (R2 scopePaceOf); null when they couldn't be read. */
  paceRows: ThroughputRows | null;
  m: number;
  held: DayKey[];
  maintenance: Set<string>;
  /** Revision 4: the loadout's extra strikes and grace days (the reach model's strike limit and grace, F-R4-8). */
  extraStrikes?: number;
  graceExtraDays?: number;
  /**
   * Fix round (clean entry, contracts §15.1): the ids of the recall cards at
   * exactly the depth that entered it on a next-day retry (roadmap-types
   * isRetryEntry over their REVIEW rows): R2's held-at-start test and stage
   * dating read them through CardState.retryEntry. Absent: none read.
   */
  retryEntry?: ReadonlySet<string>;
  /**
   * Fix round (coverage frozen at intake, contracts §15.3): the coverage
   * breakdown whose counts a Domain already in R keeps — the current live
   * acceptance's, or on a first acceptance the draft rows'. null or absent:
   * every Domain reads today's library (a DRAFT roadmap's own draft writes).
   */
  coveragePrior?: readonly CoverageBreakdown[] | null;
}

/** All-calibrating throughput: what the engines read when the loader fails (logged), never invented figures. */
export function calibratingThroughput(finalDay: DayKey): Throughput {
  const weekly: WeeklyFigure = { kind: "calibrating", have: 0, need: CALIBRATION_WEEKS };
  const share = (need: number): ShareFigure => ({ kind: "calibrating", have: 0, need });
  return {
    finalDay,
    trackedMinutes: weekly,
    geminiShare: null,
    playMinutes: weekly,
    trackedByTrack: {},
    trackedByCategory: {},
    completions: weekly,
    activeDays: weekly,
    adherence: share(ADHERENCE_MIN_JUDGED),
    reviewsPerDay: weekly,
    passShare: share(PASS_SHARE_MIN_REVIEWS),
    clearance: share(CLEARANCE_WINDOW_DAYS),
    newCards: { total: weekly, byField: {}, byDomain: {} },
  };
}

async function throughputOrNull(e: Env, userId: string, today: DayKey): Promise<Throughput | null> {
  try {
    return await e.io.throughput(userId, addDays(today, -THROUGHPUT_LAG_DAYS));
  } catch (err) {
    console.error("roadmap: throughput unavailable:", err);
    return null;
  }
}

async function throughputRowsOrNull(e: Env, userId: string, today: DayKey): Promise<ThroughputRows | null> {
  try {
    return await e.io.throughputRows(userId, addDays(today, -THROUGHPUT_LAG_DAYS));
  } catch (err) {
    console.error("roadmap: throughput rows unavailable (paces read as calibrating):", err);
    return null;
  }
}

function domainFactsOf(tree: readonly TreeField[]): Map<string, DomainFacts> {
  const out = new Map<string, DomainFacts>();
  for (const f of tree) for (const d of f.domains) out.set(d.id, { id: d.id, name: d.name, fieldId: f.id, fieldName: f.name, cards: d.cards });
  return out;
}

function areaNameOf(roadmap: Pick<RoadmapRec, "fieldId" | "track">, tree: readonly TreeField[]): string {
  if (roadmap.fieldId) {
    const f = tree.find((x) => x.id === roadmap.fieldId);
    if (f) return f.name;
  }
  return TRACK_NAMES[isOneOf(ROADMAP_TRACKS, roadmap.track) ? roadmap.track : DEFAULT_FIELD_TRACK];
}

/**
 * Today's planning context for a roadmap row. `coveragePrior` (fix round,
 * contracts §15.3): the coverage whose counts are frozen — coveragePriorOf(b)
 * on a roadmap already accepted (and, at the first acceptance or on its draft
 * view, the draft rows' own); null on a DRAFT roadmap's draft writes.
 */
async function planContext(e: Env, userId: string, roadmap: RoadmapRec, now: Date, coveragePrior: readonly CoverageBreakdown[] | null = null): Promise<PlanContext> {
  const today = todayKey(now);
  const intake = intakeOf(roadmap);
  const until = intake.targetDay > today ? intake.targetDay : addDays(today, SPAN_MIN_DAYS);
  const [tree, throughput, paceRows, m, rest, maintenance, mods] = await Promise.all([
    e.io.fieldTree(),
    throughputOrNull(e, userId, today),
    throughputRowsOrNull(e, userId, today),
    e.io.intervalMultiplier(userId).catch((err: unknown) => {
      console.error("roadmap: interval multiplier unavailable:", err);
      return 1;
    }),
    e.io.restRows(userId, today, until),
    e.io.maintenanceIds(userId).catch(() => new Set<string>()),
    // The reach model's strike limit and grace (F-R4-8); none when unreadable (logged).
    (e.io.reachModifiers ? e.io.reachModifiers(userId) : Promise.resolve(null)).catch((err: unknown) => {
      console.error("roadmap: reach modifiers unavailable (no extra strikes or grace):", err);
      return null;
    }),
  ]);
  const mm = Number.isFinite(m) && m > 0 ? m : 1;
  const graceExtraDays = mods?.graceExtraDays ?? 0;
  return {
    today,
    roadmap,
    intake,
    tree,
    domains: domainFactsOf(tree),
    areaName: areaNameOf(roadmap, tree),
    throughput: throughput ?? calibratingThroughput(addDays(today, -THROUGHPUT_LAG_DAYS)),
    paceRows,
    m: mm,
    held: Array.from(heldDaysOf(rest, today, until)).sort(),
    maintenance,
    extraStrikes: mods?.extraStrikes ?? 0,
    graceExtraDays,
    retryEntry: await retryEntriesOf(e, userId, roadmap, tree, today, mm, graceExtraDays),
    coveragePrior,
  };
}

/**
 * Clean entry for the cards a depth plan counts at exactly its depth L*
 * (fix round, contracts §15.1; R1's loadCardCounts reads the same way): the
 * recall cards at exactly L* in the Domains R can hold — the plan's chosen
 * Domains and its Area Field's (Gemini's additions and a suggestion's Domain
 * come from there) — then ONE read of their REVIEW rows over
 * retryReadDaysOf(L*, m, grace), each card judged by roadmap-types
 * isRetryEntry. m is the wider of the live m and the current acceptance's
 * (R1's cleanReadDaysOf to the day, so the readings, the week quests and this
 * read one window): srs.ts sets a card's interval with the loadout of its
 * review day, so a card that entered L* under an interval multiplier since
 * unequipped still sits inside it. The acceptance is read only when such a
 * card exists on an accepted version (≥ 1); unreadable (logged), the live m
 * alone. No read on a track
 * Area, a legacy plan, or with no such card. Unreadable rows: none (logged),
 * so every such card reads clean, as before.
 */
async function retryEntriesOf(e: Env, userId: string, roadmap: RoadmapRec, tree: readonly TreeField[], today: DayKey, liveM: number, graceExtraDays: number): Promise<ReadonlySet<string> | undefined> {
  const depth = roadmap.fieldId ? depthOf(roadmap) : null;
  if (depth == null) return undefined;
  const inR = new Set(roadmap.domainIds);
  const ids: string[] = [];
  for (const f of tree) {
    for (const d of f.domains) {
      if (f.id !== roadmap.fieldId && !inR.has(d.id)) continue;
      for (const c of d.cards) if (c.id && c.level === depth && (c.type == null || isRecallType(c.type))) ids.push(c.id);
    }
  }
  if (ids.length === 0) return undefined;
  // Version 0 (the intake's preview, a first draft, every acceptance undone) has no acceptance to read.
  const accepted = await Promise.resolve()
    .then(() => (roadmap.version >= 1 ? e.store.acceptanceMultiplier(userId, roadmap.id) : null))
    .catch((err: unknown) => {
      console.error("roadmap: the acceptance's interval multiplier is unavailable (the clean-entry window reads the live m):", err instanceof Error ? err.message : err);
      return null;
    });
  const m = Math.max(liveM, typeof accepted === "number" && Number.isFinite(accepted) && accepted > 0 ? accepted : 1);
  try {
    const rows = await e.io.reviewRows(userId, ids, addDays(today, -retryReadDaysOf(depth, m, graceExtraDays)));
    return new Set(ids.filter((id) => isRetryEntry(rows[id] ?? [], depth)));
  } catch (err) {
    console.error("roadmap: the clean-entry read failed (cards at the depth read as clean):", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** The Domains' names as code names (DomainName) for the ladders' titles and labels. */
function namesOfDomains(ctx: Pick<PlanContext, "domains">, ids: readonly string[]): Record<string, DomainName> {
  const names: Record<string, DomainName> = {};
  for (const id of ids) {
    const d = ctx.domains.get(id);
    if (d) names[id] = domainName(d);
  }
  return names;
}

const scopeKeyOf = (ids: readonly string[]): string => Array.from(new Set(ids)).sort().join(",");

/**
 * The new-card pace for a scope (F4), through R2's scopePaceOf over the
 * throughput rows: the scope's own median of weekly sums over its Domains
 * together (≥ PACE_MIN_WEEKS weeks, > 0; never a sum of per-Domain
 * medians), then the Area Field's, then the user's typed rate (0 included:
 * YOURS 0), else none. Without rows (they couldn't be read), the Field's
 * measured figure, the typed rate or none.
 */
export function rateOf(
  src: { paceRows: ThroughputRows | null; throughput: Throughput | null },
  domainIds: readonly string[],
  fieldId: string | null,
  typed: number | null
): { rateSource: RateSource; rate: number | null } {
  if (src.paceRows) {
    try {
      const p = scopePaceOf(src.paceRows, domainIds, fieldId, typed);
      return { rateSource: p.rateSource, rate: p.rate };
    } catch (err) {
      console.error("roadmap: scope pace unavailable:", err);
    }
  }
  const ff = fieldId && src.throughput ? src.throughput.newCards.byField[fieldId] : undefined;
  if (ff?.kind === "measured" && ff.median > 0) return { rateSource: "FIELD", rate: ff.median };
  if (typed != null && Number.isFinite(typed) && typed >= 0) return { rateSource: "YOURS", rate: typed };
  return { rateSource: "NONE", rate: null };
}

/** The Domain sets a plan measures over: card measures' scopes, else its live Domain items. */
function scopeSetsOf(plan: readonly MilestoneDraft[]): string[][] {
  const out: string[][] = [];
  for (const m of plan) {
    const card = m.measures.find((x) => x.kind === "CARDS_AT_LEVEL");
    const ids = card?.scope.domainIds?.length
      ? card.scope.domainIds
      : m.items.filter((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId).map((i) => i.domainId as string);
    if (ids.length) out.push(ids);
  }
  return out;
}

function cardStatesOf(ctx: Pick<PlanContext, "domains" | "retryEntry">, domainIds: readonly string[]): CardState[] {
  const out: CardState[] = [];
  for (const id of domainIds) {
    const d = ctx.domains.get(id);
    if (!d) continue;
    for (const c of d.cards) {
      out.push({
        level: c.level,
        dueDay: c.dueDay,
        graceEndsDay: c.graceEndsDay,
        createdDay: c.createdDay,
        domainId: c.domainId,
        // A depth plan counts recall cards only (multiple choice not counted); an unknown type counts.
        ...(c.type != null ? { recall: isRecallType(c.type) } : {}),
        // Clean entry (fix round): a card at exactly the depth that entered it on a retry counts after its next pass.
        ...(c.id && ctx.retryEntry?.has(c.id) ? { retryEntry: true } : {}),
      });
    }
  }
  return out;
}

/**
 * The reach model's inputs and what was assumed (F-R4-8): roadmap-types
 * reachInputsOf over today's throughput (the priors while calibrating, never
 * p = 1), the loadout's extra strikes and grace days; and the source writing
 * rate (new cards a week, measured or typed) over R, 'pace' when it is a typed
 * rate the app hasn't measured.
 */
function reachOf(ctx: PlanContext, domainIds: readonly string[]): { params: RealismInput["reach"]; calibrating: CalibratingInput[]; sourceRate: number | null } {
  const r = reachInputsOf(ctx.throughput, ctx.m, { extraStrikes: ctx.extraStrikes ?? 0, graceExtraDays: ctx.graceExtraDays ?? 0 });
  const calibrating = [...r.calibrating];
  const ids = Array.from(new Set(domainIds));
  const source = ids.length ? rateOf(ctx, ids, ctx.intake.fieldId, ctx.intake.newCardsPerWeek) : { rateSource: "NONE" as RateSource, rate: null };
  if (source.rateSource === "YOURS" && !calibrating.includes("pace")) calibrating.push("pace");
  return { params: r.params, calibrating, sourceRate: source.rate };
}

/** The feasibility engine's input for a plan: every scope it measures (plus the intake's chosen Domains), today's data. */
export function realismInputOf(ctx: PlanContext, plan: readonly MilestoneDraft[], extra: readonly (readonly string[])[] = []): RealismInput {
  const sets = [...scopeSetsOf(plan), ...extra.map((x) => [...x]), ...(ctx.intake.domainIds.length ? [ctx.intake.domainIds] : [])];
  const scopes: RealismScope[] = [];
  const seen = new Set<string>();
  for (const ids of sets) {
    const key = scopeKeyOf(ids);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sorted = key.split(",");
    const fieldId = ctx.intake.fieldId ?? ctx.domains.get(sorted[0])?.fieldId ?? null;
    const r = rateOf(ctx, sorted, fieldId, ctx.intake.newCardsPerWeek);
    scopes.push({ key, domainIds: sorted, fieldId, cards: cardStatesOf(ctx, sorted), rateSource: r.rateSource, rate: r.rate });
  }
  return {
    today: ctx.today,
    targetDay: ctx.intake.targetDay,
    scopes,
    throughput: ctx.throughput,
    hoursPerWeek: ctx.intake.hoursPerWeek,
    intensity: ctx.intake.intensity,
    startPoint: ctx.intake.startPoint,
    typicalHours: ctx.intake.typicalHours,
    typicalHoursSource: ctx.intake.typicalHoursSource,
    m: ctx.m,
    heldDays: ctx.held,
    areaInMaintenance: ctx.intake.fieldId ? ctx.maintenance.has(ctx.intake.fieldId) : false,
    practicesAllowed: ctx.intake.practicesAllowed,
    trackArea: ctx.intake.fieldId == null,
    // Revision 4 (R2 reads them): the depth, the date mode and the user's date, the exam's date, and the reach model's inputs.
    ...rev4InputOf(ctx, plan, extra),
  };
}

/** realismInputOf's revision-4 part: depth, dateMode, userDate (CHOSEN only), examDay, reach, calibrating and sourceRate over R. */
function rev4InputOf(ctx: PlanContext, plan: readonly MilestoneDraft[], extra: readonly (readonly string[])[]): Partial<RealismInput> {
  const depth = isAimDepth(ctx.intake.depth) ? ctx.intake.depth : null;
  const dateMode: DateMode = ctx.intake.dateMode ?? "CHOSEN";
  const required = Array.from(new Set([...ctx.intake.domainIds, ...extra.flat(), ...plan.flatMap((m) => m.items.filter(addsToRequired).map((i) => i.domainId as string))]));
  const reach = reachOf(ctx, required);
  return {
    depth,
    dateMode,
    userDate: dateMode === "CHOSEN" ? ctx.intake.targetDay : null,
    examDay: ctx.intake.examLabel ? (ctx.intake.examDay ?? null) : null,
    reach: reach.params,
    calibrating: reach.calibrating,
    sourceRate: reach.sourceRate,
  };
}

/** Cards in a scope at level ≥ L, now (CARDS_AT_LEVEL's value; levels 13–20 count). `recallOnly`: a depth key's `r`/`rc` segment (multiple choice not counted). */
function liveCount(ctx: Pick<PlanContext, "domains">, domainIds: readonly string[], level: number, recallOnly = false): { value: number; byDomain: Record<string, number> } {
  const byDomain: Record<string, number> = {};
  let value = 0;
  for (const id of new Set(domainIds)) {
    const n = (ctx.domains.get(id)?.cards ?? []).filter((c) => c.level >= level && (!recallOnly || c.type == null || isRecallType(c.type))).length;
    byDomain[id] = n;
    value += n;
  }
  return { value, byDomain };
}

/** liveCount for a stored measure key: its Domains, its level, and its segment (recall cards only with `r` or `rc`). */
function liveCountOfKey(ctx: Pick<PlanContext, "domains">, key: string): { value: number; byDomain: Record<string, number> } | null {
  const p = parseMeasureKey(key);
  if (p?.kind !== "CARDS_AT_LEVEL") return null;
  return liveCount(ctx, p.domainIds, p.level, p.segment != null);
}

function domainNamesOf(ctx: Pick<PlanContext, "domains">, ids: readonly string[]): DomainName[] {
  return ids.map((id) => ctx.domains.get(id)).filter((d): d is DomainFacts => !!d).map((d) => domainName(d));
}

// ═══ Drafting (F7, F8) ══════════════════════════════════════════════════════

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

function evidenceDomainsOf(ctx: PlanContext): evidence.EvidenceDomain[] {
  const chosen = new Set(ctx.intake.domainIds);
  const out: evidence.EvidenceDomain[] = [];
  for (const d of ctx.domains.values()) {
    if (!chosen.has(d.id) && d.fieldId !== ctx.intake.fieldId) continue;
    out.push({
      id: d.id,
      name: d.name,
      fieldId: d.fieldId,
      cards: d.cards.length,
      atSix: d.cards.filter((c) => c.level >= 6).length,
      atTop: d.cards.filter((c) => c.level >= TOP_LEVEL).length,
      chosen: chosen.has(d.id),
    });
  }
  return out;
}

/** The stage slots a run issues (F-R4-17): FOUNDATION … the depth's key on a Field Area, STAGE_1..STAGE_5 on a track Area. */
function slotsOf(intake: Pick<Intake, "fieldId" | "depth">): string[] {
  if (intake.fieldId == null) return [...TRACK_STAGE_KEYS];
  const depth = isAimDepth(intake.depth) ? intake.depth : AIM_DEPTHS[DEPTH_DEFAULT];
  return STAGE_KEYS.filter((s) => STAGE_LEVEL[s] <= depth);
}

/** A slot's place on the climb: a gate's level, or a track stage's number. */
function slotPlaceOf(slot: string): number {
  if ((STAGE_KEYS as readonly string[]).includes(slot)) return STAGE_LEVEL[slot as (typeof STAGE_KEYS)[number]];
  const k = (TRACK_STAGE_KEYS as readonly string[]).indexOf(slot);
  return k >= 0 ? k + 1 : Number.POSITIVE_INFINITY;
}

/** A ladder row's place on the same climb: a gate or BETWEEN at its level, a count gate (PART) just before its stage, a track stage by number. */
function rowPlaceOf(m: MilestoneDraft): number {
  if (m.stage === "PART") return (gateLevelOf(m) ?? 0) - 0.5;
  if (m.stage === "BETWEEN") return gateLevelOf(m) ?? 0;
  if (m.stage && (TRACK_STAGE_KEYS as readonly string[]).includes(m.stage)) return slotPlaceOf(m.stage);
  return gateLevelOf(m) ?? slotPlaceOf(m.stage ?? "");
}

/** R's names (DomainName) for the ladders' titles and the catalog labels. */
function requiredNamesOf(ctx: PlanContext, required: readonly string[]): Record<string, DomainName> {
  return namesOfDomains(ctx, required);
}

/** R for a plan context: the intake's Domains and the plan's confirmed additions. */
function requiredOfPlan(ctx: PlanContext, plan: readonly MilestoneDraft[] = []): string[] {
  return requiredDomainsOf({ roadmap: ctx.roadmap }, plan);
}

/** The intake with R as its Domains (a ladder built after an addition is confirmed counts it at every stage). */
const withRequired = (intake: Intake, required: readonly string[]): Intake => (intake.fieldId ? { ...intake, domainIds: [...required] } : intake);

/**
 * Materialisation (F-R4-17; R4): Gemini's per-slot keys, validated, placed
 * into R2's stage ladder. Each slot's items go to the milestone of its stage;
 * a merged or held stage's slot goes into the next kept milestone (by place
 * on the climb: a count gate sits just before its stage), within the caps:
 * practices ≤ PRACTICES_PER_MILESTONE and steps ≤ STEPS_PER_MILESTONE, the
 * higher stage's picks first; one checkpoint, the higher stage's, and none
 * when code already placed one there (EXAM_DAY replaces it); lines
 * unlimited. A BETWEEN milestone copies the practices of the slot above it;
 * its lines, steps and checkpoint stay with that slot's own milestone. A
 * pick code already placed there (the same type on the same Domain) is not
 * repeated. Gemini's Domain additions (`needs`, pending, NOT_CHOSEN) sit on
 * every kept milestone; area suggestions (GAP) only on the first, and only
 * while ROADMAP_GAPS_LIVE and the user's switch are on. Held rows stay empty.
 */
export function materialiseKeys(ladder: readonly MilestoneDraft[], validated: Pick<ValidatedDraft, "milestones">, slots: readonly string[], opts: { gapsOn: boolean; makeId: () => string }): MilestoneDraft[] {
  const bySlot = new Map<string, MilestoneDraft>();
  validated.milestones.forEach((m, i) => {
    const key = m.stage && slots.includes(m.stage) ? m.stage : slots[i];
    if (key && !bySlot.has(key)) bySlot.set(key, m);
  });
  const rows = ladder.map((m) => ({ ...m, items: m.items.map((i) => ({ ...i })) }));
  const kept = rows.filter((m) => !heldRow(m) && m.status !== "LATER").sort((a, b) => a.ord - b.ord);
  if (kept.length === 0) return rows;
  const targetOf = (slot: string): MilestoneDraft => {
    const own = kept.find((m) => m.stage === slot);
    if (own) return own;
    const place = slotPlaceOf(slot);
    return kept.find((m) => rowPlaceOf(m) > place) ?? kept[kept.length - 1];
  };
  const fresh = (it: ItemDraft): ItemDraft => ({ ...it, id: null, lineageId: opts.makeId() });
  const contributions = new Map<MilestoneDraft, { place: number; items: ItemDraft[]; copyOnly: boolean }[]>();
  const add = (m: MilestoneDraft, place: number, items: ItemDraft[], copyOnly = false) => {
    const list = contributions.get(m) ?? [];
    list.push({ place, items, copyOnly });
    contributions.set(m, list);
  };
  const additions = new Map<string, ItemDraft>();
  const gaps: ItemDraft[] = [];
  for (const slot of slots) {
    const v = bySlot.get(slot);
    if (!v) continue;
    const planItems: ItemDraft[] = [];
    for (const it of v.items) {
      if (it.kind === "DOMAIN") {
        if (it.domainId && !additions.has(it.domainId)) additions.set(it.domainId, it);
      } else if (it.kind === "GAP") {
        if (opts.gapsOn) gaps.push(it);
      } else planItems.push(it);
    }
    add(targetOf(slot), slotPlaceOf(slot), planItems);
    // A BETWEEN milestone copies the practices of the slot above it.
    for (const m of kept) {
      if (m.stage !== "BETWEEN") continue;
      const above = stageOfLevel((gateLevelOf(m) ?? 0) + 1);
      if (above === slot) add(m, slotPlaceOf(slot), planItems.filter((i) => i.kind === "PRACTICE"), true);
    }
  }
  const sameKind = (a: ItemDraft, b: ItemDraft) => a.kind === b.kind && !!a.catalogKey && a.catalogKey === b.catalogKey && (a.domainId ?? null) === (b.domainId ?? null);
  for (const m of kept) {
    const items = m.items;
    const cap = { PRACTICE: PRACTICES_PER_MILESTONE, STEP: STEPS_PER_MILESTONE, CHECKPOINT: CHECKPOINTS_PER_MILESTONE } as Record<string, number>;
    const count = (kind: string) => items.filter((i) => i.kind === kind && liveItem(i)).length;
    // The higher stage's picks first.
    const parts = [...(contributions.get(m) ?? [])].sort((a, b) => b.place - a.place);
    for (const part of parts) {
      for (const it of part.items) {
        if (it.kind === "TOPIC") {
          if (part.copyOnly) continue;
          items.push(fresh(it));
          continue;
        }
        if (cap[it.kind] == null) continue;
        if (count(it.kind) >= cap[it.kind]) continue;
        if (items.some((x) => liveItem(x) && sameKind(x, it))) continue;
        items.push(fresh(it));
      }
    }
    for (const d of additions.values()) if (!items.some((i) => i.kind === "DOMAIN" && i.domainId === d.domainId)) items.push(fresh(d));
  }
  if (gaps.length) kept[0].items.push(...gaps.map(fresh));
  // Lines in outline order within a milestone; every item numbered in its milestone.
  for (const m of kept) {
    const topics = m.items.filter((i) => i.kind === "TOPIC").sort((a, b) => (a.syllabusRef ?? 0) - (b.syllabusRef ?? 0));
    const rest = m.items.filter((i) => i.kind !== "TOPIC");
    m.items = [...rest, ...topics].map((i, k) => ({ ...i, ord: k + 1 }));
  }
  return rows;
}

/** A Domain item whose provenance must survive a re-date: Gemini's `needs` (NOT_CHOSEN) or a Domain created from a suggestion. */
const markedDomain = (i: ItemDraft): boolean => i.kind === "DOMAIN" && !!i.domainId && (i.notes.includes("NOT_CHOSEN") || i.notes.includes("FROM_SUGGESTION"));

/**
 * Carries a draft's rows onto a freshly built stage ladder (a re-date after R
 * or a coverage changed: F-R4-19, F-R4-21). Each new row takes the old row of
 * its stage (same key and gate level) — its lineage, items and decisions —
 * with the new title, dates and measures; a stage that disappeared gives its
 * items to the next kept row by place (practices, steps and the checkpoint
 * within the caps, lines always). The ladder's own Domain items stand, and
 * the marked additions (NOT_CHOSEN, FROM_SUGGESTION) keep their rows on every
 * kept stage, so R and its provenance survive. Held rows stay empty.
 */
export function transplantOnto(old: readonly MilestoneDraft[], ladder: readonly MilestoneDraft[], makeId: () => string): MilestoneDraft[] {
  const marks = new Map<string, ItemDraft>();
  for (const m of old) for (const i of m.items) if (markedDomain(i) && (!marks.has(i.domainId as string) || i.decision !== "PENDING")) marks.set(i.domainId as string, i);
  const keyOf = (m: MilestoneDraft) => `${m.stage ?? ""}:${gateLevelOf(m) ?? ""}`;
  const oldByKey = new Map(old.map((m) => [keyOf(m), m]));
  const used = new Set<MilestoneDraft>();
  const out = ladder.map((l) => {
    const prev = heldRow(l) ? undefined : oldByKey.get(keyOf(l));
    if (prev) used.add(prev);
    const own = prev ? prev.items.filter((i) => i.kind !== "DOMAIN") : l.items.filter((i) => i.kind !== "DOMAIN");
    const ladderDomains = l.items.filter((i) => i.kind === "DOMAIN" && !(i.domainId && marks.has(i.domainId)));
    const added = heldRow(l) ? [] : [...marks.values()].map((i) => ({ ...i, id: null, lineageId: makeId() }));
    return { ...l, lineageId: prev?.lineageId ?? l.lineageId, items: [...ladderDomains, ...added, ...own.map((i) => ({ ...i, id: null }))] };
  });
  const kept = out.filter((m) => !heldRow(m) && m.status !== "LATER").sort((a, b) => a.ord - b.ord);
  const cap: Record<string, number> = { PRACTICE: PRACTICES_PER_MILESTONE, STEP: STEPS_PER_MILESTONE, CHECKPOINT: CHECKPOINTS_PER_MILESTONE };
  for (const m of old) {
    if (used.has(m) || heldRow(m) || kept.length === 0) continue;
    const place = rowPlaceOf(m);
    const target = kept.find((k) => rowPlaceOf(k) >= place) ?? kept[kept.length - 1];
    for (const it of m.items) {
      if (it.kind === "DOMAIN" || it.decision === "REMOVED") continue;
      if (it.kind !== "TOPIC" && target.items.filter((x) => x.kind === it.kind && liveItem(x)).length >= (cap[it.kind] ?? 0)) continue;
      target.items.push({ ...it, id: null });
    }
  }
  for (const m of out) m.items = m.items.map((i, k) => ({ ...i, ord: k + 1 }));
  return out;
}

/**
 * A draft re-dated after a plan-level change (F-R4-19, F-R4-21): R2's ladder
 * for R from today (on a re-plan, without the stages already carried), the
 * draft's rows carried onto it, R2's stage practices, and the feasibility
 * with the date check. The ladder's refusal (past 3 years, nothing left to
 * do) refuses the change in its words.
 */
function redraftOf(e: Env, ctx: PlanContext, drafts: readonly MilestoneDraft[], carried: readonly MilestoneDraft[], required: readonly string[]): { ok: true; plan: MilestoneDraft[]; feasibility: Feasibility } | { ok: false; error: string } {
  const ladder = ladderOf(e, { ...ctx, intake: withRequired(ctx.intake, required) }, required);
  if (!ladder.ok) return ladder;
  const carriedStages = new Set(carried.map((m) => `${m.stage ?? ""}:${gateLevelOf(m) ?? ""}`));
  const fresh = ladder.plan.filter((m) => !carriedStages.has(`${m.stage ?? ""}:${gateLevelOf(m) ?? ""}`));
  const moved = transplantOnto(drafts, fresh, e.makeId);
  const plan = withStagePractices(e, { ...ctx, intake: withRequired(ctx.intake, required) }, moved, requiredNamesOf(ctx, required), carried).map((m) => ({
    ...m,
    version: ctx.roadmap.version + 1,
    status: (m.status === "LATER" ? "LATER" : "DRAFT") as MilestoneStatus,
  }));
  return { ok: true, plan, feasibility: feasibilityFor(e, { ...ctx, intake: withRequired(ctx.intake, required) }, plan, carried) };
}

/**
 * A plan's feasibility as the draft and the acceptance store it (F-R4-8,
 * F-R4-11): R2's feasibilityOf over the carried rows and the plan, the reach
 * model's version, and on a depth plan R2's date check (the verdict on the
 * user's date, D_real, what was assumed) and R's coverage (fix round,
 * contracts §15.3: with the counts ctx.coveragePrior froze; the draft rows
 * carry it, so the first acceptance reads the counts its rows were built
 * from). The date check and the coverage are null or absent when they can't
 * be worked out (logged).
 */
function feasibilityFor(e: Env, ctx: PlanContext, plan: readonly MilestoneDraft[], carried: readonly MilestoneDraft[] = []): Feasibility {
  const all = [...carried, ...plan];
  const input = realismInputOf(ctx, all);
  const f = e.lanes.feasibilityOf(all, input);
  if (!isAimDepth(ctx.intake.depth) || ctx.intake.fieldId == null) return { ...f, reachModel: REACH_MODEL_VERSION };
  let dateCheck: DateCheck | null = null;
  try {
    dateCheck = e.lanes.dateCheckOf(all, input, input.dateMode ?? "CHOSEN", input.userDate ?? null, input.examDay ?? null);
  } catch (err) {
    console.error("roadmap: the date check wasn't worked out:", err instanceof Error ? err.message : err);
  }
  let coverage: CoverageBreakdown[] | null = null;
  try {
    coverage = coverageFor(e, ctx, requiredOfPlan(ctx, all), ctx.coveragePrior ?? null);
  } catch (err) {
    console.error("roadmap: coverage not worked out for the draft:", err instanceof Error ? err.message : err);
  }
  return { ...f, reachModel: REACH_MODEL_VERSION, dateCheck, ...(coverage ? { coverage } : {}) };
}

/**
 * R2's stage practices on every kept stage (a retrieval practice early, a
 * production practice from Retained on; a held row stays empty), then R2's
 * allocation (fitPlan, its depth branch: sessions and bands, never a lower
 * depth term) over the plan with the carried rows beside it. Both steps name
 * a stage's code labels over its Domains; a pending Gemini addition is hidden
 * from them (withPendingHidden), so no label names a Domain the user hasn't
 * confirmed.
 */
function withStagePractices(e: Env, ctx: PlanContext, plan: readonly MilestoneDraft[], names: Readonly<Record<string, DomainName>>, carried: readonly MilestoneDraft[] = []): MilestoneDraft[] {
  return withPendingHidden(plan, (masked) => stagePracticesOf(e, ctx, masked, names, carried));
}

/** withStagePractices' two steps, over rows whose pending additions are hidden. */
function stagePracticesOf(e: Env, ctx: PlanContext, plan: readonly MilestoneDraft[], names: Readonly<Record<string, DomainName>>, carried: readonly MilestoneDraft[]): MilestoneDraft[] {
  const input = realismInputOf(ctx, plan);
  const synced = plan.map((m) => {
    if (heldRow(m) || m.status === "LATER") return m;
    try {
      return syncMeasures(e.lanes.syncStagePractices(m, input, names, e.makeId), ctx.intake.fieldId == null, e.makeId);
    } catch (err) {
      console.error("roadmap: stage practices not synced:", err instanceof Error ? err.message : err);
      return m;
    }
  });
  try {
    const all = [...carried, ...synced];
    const fitted = e.lanes.fitPlan(all, realismInputOf(ctx, all)).filter((d) => !isCarried(d));
    return fitted.length === synced.length ? fitted.map((d, i) => ({ ...d, stage: d.stage ?? synced[i].stage })) : synced;
  } catch (err) {
    console.error("roadmap: the allocation wasn't worked out (sessions as written):", err instanceof Error ? err.message : err);
    return synced;
  }
}

/**
 * The stage ladder for a plan context (R2's stageLadderOf over R), or its
 * refusal in words. Its coverage reads the counts frozen at intake
 * (StageLadderOpts.counts = frozenCountsOf over ctx.coveragePrior; fix round
 * 2, contracts §16.9): a re-plan's redraft on an ACTIVE plan (a realistic
 * date, a line's Domain, an addition, a lowered depth) sets its final
 * stage's targets to the end state's n_d, never to today's library — after
 * archiving cards the aim is never reached short of its end state, and after
 * writing more the plan never asks for more than the aim. With no prior (a
 * DRAFT roadmap's first draft) the counts are today's, as R2 reads them.
 */
function ladderOf(e: Env, ctx: PlanContext, required: readonly string[]): { ok: true; plan: MilestoneDraft[] } | { ok: false; error: string } {
  const intake = withRequired(ctx.intake, required);
  const counts = frozenCountsOf(ctx, required, ctx.coveragePrior);
  const res = e.lanes.stageLadderOf(intake, realismInputOf({ ...ctx, intake }, [], [required]), requiredNamesOf(ctx, required), e.makeId, { counts });
  return res.ok ? { ok: true, plan: res.plan } : { ok: false, error: res.error };
}

/**
 * The plan built from one parsed reply (F-R4-17): keys-only validation
 * (R3's validateKeysOnly with its KeysOnlyContext, after the integrity walk
 * passed), materialised into R2's stage ladder, R2's stage practices, and the
 * feasibility with the date check, all on today's data. `plan` is null when
 * nothing survives or the ladder refuses (the run then writes the plan from
 * your numbers); `validated` is set whenever validation ran.
 */
function planFromReply(
  e: Env,
  ctx: PlanContext,
  pack: EvidencePack,
  parsed: unknown,
  integrity: ValidationIntegrity,
  extra: { schema: unknown; gapSourceExclude: readonly string[]; ladder?: readonly MilestoneDraft[]; gapsOn?: boolean; memo?: Map<string, { plan: MilestoneDraft[]; feasibility: Feasibility }> }
): { plan: MilestoneDraft[] | null; feasibility: Feasibility | null; validated: ValidatedDraft | null } {
  const required = requiredOfPlan(ctx);
  const slots = slotsOf(ctx.intake);
  const domainNames: Record<string, string> = {};
  const listedNames: Record<string, DomainName> = {};
  for (const id of Object.values(pack.keymap?.domains ?? {})) {
    const d = ctx.domains.get(id);
    if (!d) continue;
    domainNames[id] = d.name;
    listedNames[id] = domainName(d);
  }
  const checked = e.lanes.validateKeysOnly(parsed, {
    pack,
    intake: ctx.intake,
    required,
    domainNames,
    slots,
    version: ctx.roadmap.version + 1,
    makeId: e.makeId,
    // The labels' fill is the user's words and the library's names, branded here (R3 never brands).
    fill: {
      aim: yoursText("USER", "EDITED", ctx.intake.aim),
      exam: ctx.intake.examLabel ? yoursText("USER", "EDITED", ctx.intake.examLabel) : null,
      domains: listedNames,
    },
    areaName: ctx.areaName,
    gapSourceExclude: extra.gapSourceExclude,
    schema: extra.schema,
  });
  const validated: ValidatedDraft = { ...checked, report: { ...checked.report, integrity } };
  let ladder: readonly MilestoneDraft[] | null = extra.ladder ?? null;
  if (!ladder) {
    const res = ladderOf(e, ctx, required);
    ladder = res.ok ? res.plan : null;
  }
  if (!ladder || ladder.length === 0) return { plan: null, feasibility: null, validated };
  // The area-suggestion slot is materialised only when it was issued for this run and the switch is on (F-R4-19).
  const gapsOn = extra.gapsOn ?? (ROADMAP_GAPS_LIVE && ctx.intake.suggestAreas === true && (pack as { run?: { gaps?: unknown } }).run?.gaps === true);
  const placed = materialiseKeys(ladder, validated, slots, { gapsOn, makeId: e.makeId });
  const key = extra.memo ? JSON.stringify(placed) : null;
  const hit = key != null ? extra.memo?.get(key) : undefined;
  if (hit) return { ...hit, validated };
  const plan = withStagePractices(e, ctx, placed, requiredNamesOf(ctx, required)).map((m) => ({ ...m, version: ctx.roadmap.version + 1 }));
  if (plan.length === 0) return { plan: null, feasibility: null, validated };
  const feasibility = feasibilityFor(e, ctx, plan);
  if (key != null && extra.memo) {
    if (extra.memo.size >= HOSTILE_CACHE_MAX) extra.memo.clear();
    extra.memo.set(key, { plan, feasibility });
  }
  return { plan, feasibility, validated };
}

/**
 * What draftFromReply reads for one run (fix round, contracts §15.12): the
 * env, today's planning context, the run's pack and its exact issued schema,
 * the Domains that never ground a suggestion, the one writer's context for
 * the dry run, and where the rows would go. `ladder`, `gapsOn` and `memo` are
 * the hallucination bar's (a run's ladder worked out once, the slot its run
 * issued, a plan built once per distinct placement); production leaves them
 * out.
 */
export interface DraftReplyStep {
  e: Env;
  ctx: PlanContext;
  pack: EvidencePack;
  schema: unknown;
  gapSourceExclude: readonly string[];
  tripwire: ModelTextContext;
  roadmapId: string;
  version: number;
  now: Date;
  ladder?: readonly MilestoneDraft[];
  gapsOn?: boolean;
  memo?: Map<string, { plan: MilestoneDraft[]; feasibility: Feasibility }>;
}

/** draftFromReply's answer: roadmap-types DraftFromReplyResult, with the plan's feasibility and the tripwire's reason (its log line). */
export interface DraftFromReplyOutcome extends DraftFromReplyResult {
  feasibility: Feasibility | null;
  tripwireReason: string | null;
}

/**
 * One reply's draft step (fix round, contracts §15.12; lens 1 #9), the one
 * composition runDraftCore, reuseRun and hostileViewsOf all run:
 *   1. integrityFor: R3's walk against the run's exact schema, the paths made
 *      safe again here, the verdict as R4 overrides it (a walk that throws is
 *      REJECTED);
 *   2. the REJECTED gate: nothing of the reply is read further (refused
 *      REJECTED);
 *   3. planFromReply: validateKeysOnly with its KeysOnlyContext (the fill, R,
 *      the listed Domains' names from the pack's keymap, the Domains that
 *      never ground), materialised into the stage ladder with R2's practices
 *      and the feasibility (refused EMPTY when nothing survives);
 *   4. the one writer's tripwire as a dry run over the rows it would write
 *      (refused TRIPWIRE).
 * Pure: it writes nothing and calls no model; the caller writes the plan (or
 * the starter) and logs. The bar asserts its `integrity.verdict`.
 */
export function draftFromReply(step: DraftReplyStep, parsed: unknown): DraftFromReplyOutcome {
  const integrity = integrityFor(step.e, parsed, step.schema);
  if (integrity.verdict === "REJECTED") return { integrity, validated: null, plan: null, refused: "REJECTED", feasibility: null, tripwireReason: null };
  const built = planFromReply(step.e, step.ctx, step.pack, parsed, integrity, { schema: step.schema, gapSourceExclude: step.gapSourceExclude, ladder: step.ladder, gapsOn: step.gapsOn, memo: step.memo });
  if (!built.plan || !built.feasibility) return { integrity, validated: built.validated, plan: null, refused: "EMPTY", feasibility: null, tripwireReason: null };
  try {
    // A dry run (its ops are dropped, its ids throwaway): a plan holding model text is never persisted.
    writeRoadmapRows([], { kind: "DRAFT", roadmapId: step.roadmapId, version: step.version, plan: built.plan, feasibility: built.feasibility, now: step.now, makeId: () => "dry-run" }, step.tripwire);
  } catch (err) {
    if (!(err instanceof ModelTextError)) throw err;
    return { integrity, validated: built.validated, plan: null, refused: "TRIPWIRE", feasibility: null, tripwireReason: err.message };
  }
  return { integrity, validated: built.validated, plan: built.plan, refused: null, feasibility: built.feasibility, tripwireReason: null };
}

/**
 * The in-house starter (F7): "Build from my numbers", and the fallback when
 * Gemini fails. On a depth plan R2's depth starter climbs the stage ladder
 * over R (its refusal is the ladder's: a depth already held, a date under 35
 * days or past 3 years, no pace); a track Area's starter climbs its track
 * stages. Rev 3's starter measured the first DOMAINS_PER_MILESTONE Domains
 * and said the rest in the report; a depth plan measures every Domain of R.
 */
function starterPlan(e: Env, ctx: PlanContext): { plan: MilestoneDraft[]; feasibility: Feasibility; report: ValidationReport } {
  const required = requiredOfPlan(ctx);
  const names = requiredNamesOf(ctx, required.length ? required : ctx.intake.domainIds);
  if (ctx.intake.fieldId != null && isAimDepth(ctx.intake.depth)) {
    const ladder = ladderOf(e, ctx, required);
    if (!ladder.ok) throw new PlanRefused(ladder.error);
  }
  const intake = withRequired(ctx.intake, required);
  const plan = e.lanes.starterLadder(intake, realismInputOf({ ...ctx, intake }, [], [required]), names, e.makeId).map((m) => ({ ...m, version: ctx.roadmap.version + 1 }));
  const depthPlan = ctx.intake.fieldId != null && isAimDepth(ctx.intake.depth);
  return { plan, feasibility: feasibilityFor(e, ctx, plan), report: depthPlan ? { dropped: [], flagged: [], notes: [] } : starterReportOf(ctx, names) };
}

/** A plan the ladder refuses (nothing left to do, too far, no pace): its words reach the user. */
class PlanRefused extends Error {}

/** The starter's report: the chosen Domains past DOMAINS_PER_MILESTONE it doesn't measure (an OVER_CAP drop, in words). */
export function starterReportOf(ctx: Pick<PlanContext, "intake">, names: Readonly<Record<string, string>>): ValidationReport {
  const report: ValidationReport = { dropped: [], flagged: [], notes: [] };
  if (ctx.intake.fieldId == null) return report;
  const named = Array.from(new Set(ctx.intake.domainIds)).filter((id) => names[id] != null);
  const unused = named.slice(DOMAINS_PER_MILESTONE).map((id) => String(names[id]));
  if (unused.length) {
    report.dropped.push({
      milestoneOrd: 0,
      kind: "DRAFT",
      label: Array.from(unused.join(", ")).slice(0, RAW_LABEL_MAX).join(""),
      code: "OVER_CAP",
      reason: `a plan from your numbers measures your first ${DOMAINS_PER_MILESTONE} Domains; not used: ${unused.join(", ")} — add them to a milestone by hand`,
    });
  }
  return report;
}

/** The decision a draft claim makes from the runs it read (pure): refuse while one runs, refuse at the cap, or claim (failing older RUNNING runs). */
export type ClaimPlan =
  | { kind: "RUNNING"; runId: string }
  | { kind: "CAPPED" }
  | { kind: "CLAIM"; stale: { id: string; error: string }[]; modelRunsToday: number };

export function claimPlanOf(roadmapId: string, roadmapRuns: readonly RunRec[], runsOfDay: readonly RunRec[], now: Date): ClaimPlan {
  const running = roadmapRuns.filter((r) => r.status === "RUNNING");
  const young = running.find((r) => now.getTime() - r.startedAt.getTime() < RUN_CLAIM_GUARD_MS);
  if (young) return { kind: "RUNNING", runId: young.id };
  // The cap's one definition (roadmap-types countsTowardDraftCap; the GEMINI_RUNS_BELOW guard mirrors it in SQL).
  const counted = runsOfDay.filter(countsTowardDraftCap).length;
  if (counted >= ROADMAP_DRAFTS_PER_DAY) return { kind: "CAPPED" };
  const stale = running.map((r) => ({ id: r.id, error: now.getTime() - r.startedAt.getTime() >= RUN_STALE_MS ? "timed out" : "replaced by a newer draft" }));
  const modelRunsToday = runsOfDay.filter((r) => r.roadmapId === roadmapId && r.kind === "GEMINI" && r.status !== "REUSED" && r.status !== "CAPPED").length;
  return { kind: "CLAIM", stale, modelRunsToday };
}

// The run row's sample facts (every sample, failed ones included) and the reuse's accepted replies are R3's
// roadmap-model runFactsOf and reusableSamplesOf: one definition of each (fix round 2).

function parseRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * draftRoadmap's claim (F8): reuse (unless force) a same-hash OK run ≤ 7
 * days old, re-running validation, fitting and feasibility on today's data;
 * else claim a RUNNING run under the lock and the guards (RUN_CLAIM_GUARD_MS;
 * ROADMAP_DRAFTS_PER_DAY, writing a CAPPED run), return at once, and
 * deps.defer(() => runDraftCore(runId)).
 */
export async function claimDraftCore(
  userId: string,
  roadmapId: string,
  opts: { force: boolean },
  now: Date,
  deps: RoadmapDeps = {}
): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!(deps.geminiLive ?? ROADMAP_GEMINI_LIVE)) return fail(GEMINI_DRAFTING_OFF);
  const e = envOf(deps);
  const today = todayKey(now);
  const first = await e.store.bundle(userId, roadmapId);
  if (!first) return fail(NO_ROADMAP);
  if (first.roadmap.status !== "DRAFT") return fail("Only a draft roadmap is drafted; re-plan an accepted one.");
  if (first.roadmap.fieldId != null && depthOf(first.roadmap) == null) return fail(PICK_A_DEPTH_FIRST);
  const ctx = await planContext(e, userId, first.roadmap, now);
  // The pack's windows are the stage ladder's (F-R4-10): the plan Gemini arranges is the one code dated.
  let windows: { start: DayKey; end: DayKey }[];
  try {
    const ladder = ladderOf(e, ctx, requiredOfPlan(ctx));
    if (!ladder.ok) return fail(ladder.error);
    windows = ladder.plan.filter((m) => m.status !== "LATER" && !heldRow(m) && m.windowStart && m.dueDay).map((m) => ({ start: m.windowStart as DayKey, end: m.dueDay as DayKey }));
  } catch (err) {
    console.error("roadmap: the stage ladder wasn't worked out for the draft:", err instanceof Error ? err.message : err);
    return fail("Couldn't plan the stages. Build from your numbers, or try again.");
  }
  if (windows.length === 0) return fail("The aim's date no longer fits a roadmap — change the date.");
  const pack = e.lanes.buildEvidencePack({ intake: ctx.intake, areaName: ctx.areaName, domains: evidenceDomainsOf(ctx), windows });
  const inputHash = sha256(e.lanes.inputHashMaterial(pack, ctx.intake, ROADMAP_MODEL, ROADMAP_SAMPLES));

  if (!opts.force) {
    const reused = await reuseRun(e, userId, first, ctx, inputHash, pack, now);
    if (reused) return reused;
  }

  const res = await withRetry<{ runId: string; status: RunStatus }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "DRAFT") return fail("Only a draft roadmap is drafted; re-plan an accepted one.");
    const plan = claimPlanOf(roadmapId, b.runs, await e.store.runsOfDay(userId, today), now);
    if (plan.kind === "RUNNING") return fail(DRAFT_RUNNING);
    if (plan.kind === "CAPPED") {
      await e.store.apply(userId, [
        {
          op: "insert",
          table: "roadmapRun",
          rows: [runRow(e.makeId(), userId, roadmapId, today, b.roadmap.version + 1, "GEMINI", "CAPPED", now, { inputHash, finishedAt: now, error: "daily cap" })],
        },
      ]);
      return fail(DRAFT_CAPPED);
    }
    const runId = e.makeId();
    const seedBase = safeSeedBase(e, plan.modelRunsToday);
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT"], version: b.roadmap.version } },
      { op: "guard", guard: { g: "NO_RECENT_RUNNING", roadmapId, since: new Date(now.getTime() - RUN_CLAIM_GUARD_MS) } },
      { op: "guard", guard: { g: "GEMINI_RUNS_BELOW", day: today, max: ROADMAP_DRAFTS_PER_DAY } },
      ...plan.stale.map(
        (s): StoreOp => ({ op: "update", table: "roadmapRun", where: { id: s.id, status: "RUNNING" }, data: { status: "FAILED", error: s.error, finishedAt: now } })
      ),
      {
        op: "insert",
        table: "roadmapRun",
        rows: [
          runRow(runId, userId, roadmapId, today, b.roadmap.version + 1, "GEMINI", "RUNNING", now, {
            model: ROADMAP_MODEL,
            promptVersion: ROADMAP_PROMPT_VERSION,
            seedBase,
            inputHash,
            pack,
          }),
        ],
      },
    ]);
    if (out !== "ok") return "stale";
    return ok({ runId, status: "RUNNING" as RunStatus });
  });
  invalidate("roadmap");
  if (res.ok) {
    const runId = res.value.runId;
    e.defer(() => runDraftCore(runId, deps));
  }
  return res;
}

function safeSeedBase(e: Env, modelRunsToday: number): number {
  try {
    return e.lanes.seedBaseFor(modelRunsToday);
  } catch {
    return SEED_BASE;
  }
}

function runRow(
  id: string,
  userId: string,
  roadmapId: string,
  day: DayKey,
  version: number,
  kind: RunKind,
  status: RunStatus,
  now: Date,
  extra: Partial<RunRec> = {}
): Record<string, unknown> {
  return {
    id,
    roadmapId,
    userId,
    day,
    version,
    kind,
    status,
    model: null,
    modelVersion: null,
    promptVersion: null,
    seedBase: null,
    inputHash: null,
    pack: null,
    samples: null,
    report: null,
    usage: null,
    responseIds: [],
    finishReasons: [],
    latencyMs: null,
    error: null,
    startedAt: now,
    finishedAt: null,
    ...extra,
  };
}

/**
 * A reuse (F8 step 3; F-R4-20): a REUSED run (no call, outside the cap)
 * whose stored replies are walked again against the CURRENT run's schema
 * (never the stored one: a stored `gaps` reused while suggestions are off is
 * an EXTRA_PROPERTY, REJECTED), validated keys-only and placed into today's
 * stage ladder. A rejected reply is never reused; none left: no reuse.
 */
async function reuseRun(
  e: Env,
  userId: string,
  b: RoadmapBundle,
  ctx: PlanContext,
  inputHash: string,
  pack: EvidencePack,
  now: Date
): Promise<Result<{ runId: string; status: RunStatus }> | null> {
  const today = ctx.today;
  // The reuse rule's one definition (R3's isReusableRun): GEMINI, OK, the same hash, claimed 0–ROADMAP_REUSE_DAYS life days ago.
  const candidates = (await e.store.reusableRuns(userId, inputHash, addDays(today, -ROADMAP_REUSE_DAYS))).filter((r) => model.isReusableRun(r, inputHash, today));
  if (candidates.length === 0) return null;
  const schema = schemaOf(e, pack);
  if (!schema) return null;
  const gapSourceExclude = await suggestionDomainsOf(e, userId);
  // The one draft step (contracts §15.12) against the CURRENT schema: walk, gate, validate and place, the tripwire's dry run.
  const step: DraftReplyStep = { e, ctx, pack, schema, gapSourceExclude, tripwire: modelTextContextOf(b, ctx.tree, true), roadmapId: b.roadmap.id, version: b.roadmap.version + 1, now };
  for (const source of candidates) {
    for (const s of model.reusableSamplesOf(source.samples)) {
      const built = draftFromReply(step, parseRaw(s.raw));
      logReply(source.id, built.integrity);
      if (built.refused === "TRIPWIRE") logRefusedWrite("reuse", built.tripwireReason);
      if (!built.plan || !built.feasibility || !built.validated) continue;
      const runId = e.makeId();
      const v = b.roadmap.version + 1;
      const ops: StoreOp[] = [
        { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["DRAFT"], version: b.roadmap.version } },
        { op: "update", table: "roadmapRun", where: { roadmapId: b.roadmap.id, status: "RUNNING" }, data: { status: "FAILED", error: "replaced by a reused draft", finishedAt: now } },
        {
          op: "insert",
          table: "roadmapRun",
          rows: [
            runRow(runId, userId, b.roadmap.id, today, v, "GEMINI", "REUSED", now, {
              model: source.model,
              modelVersion: source.modelVersion,
              promptVersion: source.promptVersion,
              seedBase: source.seedBase,
              inputHash,
              pack,
              report: built.validated.report,
              responseIds: source.responseIds,
              finishReasons: source.finishReasons,
              finishedAt: now,
              error: null,
            }),
          ],
        },
      ];
      try {
        writeRoadmapRows(ops, { kind: "DRAFT", roadmapId: b.roadmap.id, version: v, plan: built.plan, feasibility: built.feasibility, now, makeId: e.makeId }, modelTextContextOf(b, ctx.tree, true));
      } catch (err) {
        if (!(err instanceof ModelTextError)) throw err;
        logRefusedWrite("reuse", err);
        continue;
      }
      ops.push(...realisticDateOps(b.roadmap, built.feasibility, now));
      const out = await e.store.apply(userId, ops);
      if (out === "ok") return ok({ runId, status: "REUSED" as RunStatus });
      return null;
    }
  }
  return null;
}

// ═══ The integrity walk around a reply (F-R4-20) ════════════════════════════

/** Domains created from a suggestion in any roadmap (FROM_SUGGESTION): they never ground a later one (F-R4-19). Unreadable: none (logged). */
async function suggestionDomainsOf(e: Env, userId: string): Promise<string[]> {
  try {
    return await e.io.suggestionDomainIds(userId);
  } catch (err) {
    console.error("roadmap: the suggestion-made Domains unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** The run's exact schema (R3's buildResponseSchema over the pack); null when it can't be built (logged; nothing is reused or kept). */
function schemaOf(e: Env, pack: EvidencePack): unknown {
  try {
    return e.lanes.buildResponseSchema(pack);
  } catch (err) {
    console.error("roadmap: the run's schema wasn't built:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Every property name a schema issues (the path normaliser's own list, a defence in depth over R3's). */
function schemaKeysOf(schema: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 12) return;
    const props = (node as { properties?: unknown }).properties;
    if (props && typeof props === "object") {
      for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
        out.add(k);
        walk(v, depth + 1);
      }
    }
    walk((node as { items?: unknown }).items, depth + 1);
  };
  walk(schema, 0);
  return out;
}

/** A violation's path with nothing of the model's words: schema property names and indexes kept, anything else "<extra>", cut to REPORT_PATH_SEGMENT_MAX. */
function safePathOf(path: string, keys: ReadonlySet<string>): string {
  const segments = String(path ?? "")
    .split(".")
    .filter((s) => s.length > 0)
    .map((s) => (keys.has(s) || /^\d{1,6}$/.test(s) || s === REPORT_EXTRA_SEGMENT ? s : REPORT_EXTRA_SEGMENT));
  return Array.from(segments.join(".")).slice(0, REPORT_PATH_SEGMENT_MAX).join("");
}

/**
 * The integrity verdict of one parsed reply against the run's schema (R3's
 * integrityOf), its paths made safe again here (a defence in depth); a walk
 * that throws reads as REJECTED (a TYPE violation at the root), never as clean.
 */
function integrityFor(e: Env, parsed: unknown, schema: unknown): ValidationIntegrity {
  const keys = schemaKeysOf(schema);
  let walked: ValidationIntegrity;
  try {
    walked = e.lanes.integrityOf(parsed, schema);
  } catch (err) {
    console.error("roadmap: the integrity walk failed (read as rejected):", err instanceof Error ? err.message.slice(0, 200) : "failed");
    walked = { verdict: "REJECTED", violations: [{ code: "TYPE", path: "" }], modelChars: 0, gapsKept: 0, gapsHidden: 0, gapsDropped: 0, notANameByClause: {} };
  }
  const violations: IntegrityViolation[] = (walked.violations ?? []).map((v) => ({ code: v.code, path: safePathOf(v.path, keys) }));
  return { ...walked, violations, verdict: integrityVerdictOf(violations) === "REJECTED" || walked.verdict === "REJECTED" ? "REJECTED" : integrityVerdictOf(violations) };
}

/** The one structured log line per reply (F-R4-20): normalised paths only, never the reply's words. */
function logReply(runId: string, integrity: ValidationIntegrity): void {
  console.warn(JSON.stringify({ evt: "roadmap.reply", runId, verdict: integrity.verdict, violations: integrity.violations, modelChars: integrity.modelChars }));
}

/** REALISTIC mode (F-R4-11): a draft write sets the roadmap's date to the realistic one, guarded on DRAFT. */
function realisticDateOps(r: RoadmapRec, f: Feasibility | null, now: Date): StoreOp[] {
  if (dateModeOf(r) !== "REALISTIC" || r.status !== "DRAFT") return [];
  const day = f?.dateCheck?.D_real ?? null;
  if (!day || day === r.targetDay) return [];
  void now;
  // updatedAt stays the intake's last save (Today's DRAFT line counts from it).
  return [{ op: "update", table: "roadmap", where: { id: r.id, status: "DRAFT" }, data: { targetDay: day } }];
}

/**
 * The background half (also called directly by the checks): draftSamples,
 * validate, fit, allocate, feasibility; persist in one transaction guarded on
 * the run still RUNNING (earlier DRAFT rows of the version replaced; PLANNED,
 * STARTING and STARTED never touched); on failure the run → FAILED and the
 * starter ladder is written instead. Never throws; writes nothing with writes off.
 */
export async function runDraftCore(runId: string, deps: RoadmapDeps = {}): Promise<void> {
  if (writesOff(deps)) return;
  const e = envOf(deps);
  const now = (deps.clock ?? (() => new Date()))();
  let userId: string | null = null;
  try {
    const run = await e.store.run(runId);
    if (!run || run.status !== "RUNNING") return;
    userId = run.userId;
    const b = await e.store.bundle(run.userId, run.roadmapId);
    if (!b || b.roadmap.status !== "DRAFT" || b.roadmap.version + 1 !== run.version) {
      await failRun(e, run.userId, runId, "the roadmap changed while drafting", now);
      return;
    }
    const ctx = await planContext(e, run.userId, b.roadmap, now);
    const pack = run.pack as EvidencePack;
    // Only a keys-only pack (prompt version 3) is ever drafted: an earlier run's free-text reply is never read (F-R4-17).
    const keysOnly = !!pack && typeof pack === "object" && typeof pack.promptVersion === "number" && pack.promptVersion >= 3;
    const schema = keysOnly ? schemaOf(e, pack) : null;
    const results: SampleResult[] = keysOnly && schema ? await e.lanes.draftSamples(pack, ROADMAP_SAMPLES, { callModel: deps.callModel, seedBase: run.seedBase ?? SEED_BASE }) : [];
    const samples = results.flatMap((r) => (r.ok ? [r.value] : []));
    const errors = results.flatMap((r) => (r.ok ? [] : [r.error]));
    if (!keysOnly) errors.push("an earlier prompt version (never read)");
    else if (!schema) errors.push("the run's schema wasn't built");

    // Every reply is walked against the run's exact schema first; a REJECTED one is never read further (F-R4-20).
    const gapSourceExclude = samples.length ? await suggestionDomainsOf(e, run.userId) : [];
    let built: { plan: MilestoneDraft[]; feasibility: Feasibility; validated: ValidatedDraft } | null = null;
    const rejected: ValidationIntegrity[] = [];
    let refused = false;
    // The one draft step per reply (contracts §15.12): walk, the REJECTED gate, validate and place, the tripwire's dry run.
    const step: DraftReplyStep = { e, ctx, pack, schema, gapSourceExclude, tripwire: modelTextContextOf(b, ctx.tree, true), roadmapId: b.roadmap.id, version: run.version, now };
    for (const s of samples) {
      const candidate = draftFromReply(step, s.parsed);
      logReply(runId, candidate.integrity);
      if (candidate.refused === "REJECTED") {
        rejected.push(candidate.integrity);
        continue;
      }
      if (candidate.refused === "TRIPWIRE") {
        logRefusedWrite("draft", candidate.tripwireReason);
        refused = true;
        continue;
      }
      if (!candidate.plan || !candidate.feasibility || !candidate.validated) continue;
      built = { plan: candidate.plan, feasibility: candidate.feasibility, validated: candidate.validated };
      break;
    }
    // Every sample's facts, failed ones included (their finishReason, responseId, usage, latency and capped text).
    const facts = { ...model.runFactsOf(results), finishedAt: now };
    if (built) {
      const partial = errors.length > 0 || rejected.length > 0;
      await persistRun(e, run, b, built.plan, built.feasibility, { ...facts, status: partial ? "PARTIAL" : "OK", report: built.validated.report, error: null }, now);
      return;
    }
    const codes = Array.from(new Set(rejected.flatMap((r) => r.violations.map((v) => v.code)))).join(", ");
    const why = rejected.length
      ? `reply rejected: ${codes || "format"}`
      : refused
        ? "reply refused: it held words the app didn't write"
        : errors.length
          ? errors.join("; ")
          : samples.length
            ? "the draft had nothing usable"
            : "no reply";
    let starter: { plan: MilestoneDraft[]; feasibility: Feasibility; report: ValidationReport } | null = null;
    try {
      starter = starterPlan(e, ctx);
    } catch (err) {
      console.error("roadmap: starter fallback failed:", err instanceof Error ? err.message : err);
    }
    // A FAILED run that wrote the starter says so (report.fallback STARTER): the page labels those rows "built from your numbers", never Gemini's.
    // A rejected reply's verdict rides report.integrity (RUN_REJECTED_LINE: "Gemini's reply didn't keep to the app's format …").
    const wroteStarter = !!starter && starter.plan.length > 0;
    const integrity = rejected[0] ?? null;
    const report = wroteStarter && starter ? { ...starter.report, fallback: RUN_FALLBACK_STARTER, ...(integrity ? { integrity } : {}) } : integrity ? { dropped: [], flagged: [], notes: [], integrity } : null;
    await persistRun(e, run, b, starter?.plan ?? [], starter?.feasibility ?? null, { ...facts, status: "FAILED", report, error: why.slice(0, 500) }, now);
  } catch (err) {
    console.error("runDraftCore failed:", err);
    if (userId) await failRun(e, userId, runId, err instanceof Error ? err.message.slice(0, 300) : "failed", now).catch(() => undefined);
  } finally {
    invalidate("roadmap");
  }
}

async function failRun(e: Env, userId: string, runId: string, error: string, now: Date): Promise<void> {
  await e.store.apply(userId, [{ op: "update", table: "roadmapRun", where: { id: runId, status: "RUNNING" }, data: { status: "FAILED", error, finishedAt: now } }]);
}

async function persistRun(
  e: Env,
  run: RunRec,
  b: RoadmapBundle,
  plan: readonly MilestoneDraft[],
  feasibility: Feasibility | null,
  data: Record<string, unknown>,
  now: Date
): Promise<void> {
  const ops: StoreOp[] = [
    { op: "guard", guard: { g: "RUN_IS", id: run.id, status: "RUNNING" } },
    { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["DRAFT"], version: run.version - 1 } },
    { op: "update", table: "roadmapRun", where: { id: run.id, status: "RUNNING" }, data },
  ];
  if (plan.length > 0) {
    try {
      writeRoadmapRows(ops, { kind: "DRAFT", roadmapId: b.roadmap.id, version: run.version, plan, feasibility, now, makeId: e.makeId }, modelTextContextOf(b, await e.io.fieldTree(), true));
      ops.push(...realisticDateOps(b.roadmap, feasibility, now));
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      // Even the plan from your numbers held text the app didn't write: nothing is written, the run says so.
      logRefusedWrite("persist", err);
      ops.splice(2, 1, { op: "update", table: "roadmapRun", where: { id: run.id, status: "RUNNING" }, data: { ...data, status: "FAILED", error: "the plan couldn't be saved", report: null } });
    }
  }
  const out = await e.store.apply(run.userId, ops);
  if (out === "stale") {
    // Replaced, discarded or timed out meanwhile: the newer state wins; mark the run if it is still RUNNING.
    await failRun(e, run.userId, run.id, "superseded before it finished", now);
  }
}

/** "Build from my numbers" / "Write it myself": an INHOUSE or MANUAL run (status OK, outside the cap) with its ladder. */
async function buildInHouse(userId: string, roadmapId: string, kind: "INHOUSE" | "MANUAL", now: Date, deps: RoadmapDeps): Promise<Result<{ runId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<{ runId: string }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "DRAFT") return fail("Only a draft roadmap is built this way; re-plan an accepted one.");
    if (b.roadmap.fieldId != null && depthOf(b.roadmap) == null) return fail(PICK_A_DEPTH_FIRST);
    const ctx = await planContext(e, userId, b.roadmap, now);
    let built: { plan: MilestoneDraft[]; feasibility: Feasibility; report: ValidationReport | null };
    try {
      if (kind === "INHOUSE") built = starterPlan(e, ctx);
      else {
        if (ctx.intake.fieldId != null && isAimDepth(ctx.intake.depth)) {
          const ladder = ladderOf(e, ctx, requiredOfPlan(ctx));
          if (!ladder.ok) return fail(ladder.error);
        }
        const plan = e.lanes.manualLadder(ctx.intake, realismInputOf(ctx, [], [ctx.intake.domainIds]), e.makeId);
        built = { plan, feasibility: feasibilityFor(e, ctx, plan), report: null };
      }
    } catch (err) {
      if (err instanceof PlanRefused) return fail(err.message);
      console.error("roadmap: the plan from your numbers wasn't built:", err instanceof Error ? err.message : err);
      return fail("Couldn't build the plan. Try again.");
    }
    if (built.plan.length === 0) return fail("Pick at least one Domain, or add a practice.");
    const runId = e.makeId();
    const v = b.roadmap.version + 1;
    const report = built.report && built.report.dropped.length ? built.report : null;
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT"], version: b.roadmap.version } },
      { op: "update", table: "roadmapRun", where: { roadmapId, status: "RUNNING" }, data: { status: "FAILED", error: "replaced by a plan from your numbers", finishedAt: now } },
      { op: "insert", table: "roadmapRun", rows: [runRow(runId, userId, roadmapId, ctx.today, v, kind, "OK", now, { finishedAt: now, report })] },
    ];
    try {
      writeRoadmapRows(ops, { kind: "DRAFT", roadmapId, version: v, plan: built.plan, feasibility: built.feasibility, now, makeId: e.makeId }, modelTextContextOf(b, ctx.tree, true));
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite(kind === "INHOUSE" ? "starter" : "manual", err);
      return fail(CHANGE_NOT_SAVED);
    }
    ops.push(...realisticDateOps(b.roadmap, built.feasibility, now));
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ runId }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/** "Build from my numbers": an INHOUSE run (status OK, outside the cap) with the starter ladder. */
export async function buildStarterCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ runId: string }>> {
  return buildInHouse(userId, roadmapId, "INHOUSE", now, deps);
}

/** "Write it myself": a MANUAL run (status OK, outside the cap) with an empty ladder of n milestones. */
export async function startManualCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ runId: string }>> {
  return buildInHouse(userId, roadmapId, "MANUAL", now, deps);
}

// ═══ Review (F9) ════════════════════════════════════════════════════════════

/** Statuses whose items the review editor and the Start sheet may change. */
const EDITABLE: readonly string[] = ["DRAFT", "LATER", "PLANNED"];

interface Located {
  b: RoadmapBundle;
  m: MilestoneBundle;
  /** null when the reference is the milestone itself (its title). */
  item: ItemRec | null;
}

async function locate(e: Env, userId: string, ref: string): Promise<Located | null> {
  const roadmapId = (await e.store.ownerOf(userId, { itemId: ref })) ?? (await e.store.ownerOf(userId, { milestoneId: ref }));
  if (!roadmapId) return null;
  const b = await e.store.bundle(userId, roadmapId);
  if (!b) return null;
  for (const m of b.milestones) {
    if (m.id === ref) return { b, m, item: null };
    const item = m.items.find((i) => i.id === ref);
    if (item) return { b, m, item };
  }
  return null;
}

/** Guards for a change to a milestone in its version: the roadmap still at its version, the milestone still in its status. */
function milestoneGuards(b: RoadmapBundle, m: MilestoneRec): StoreOp[] {
  return [
    { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } },
    { op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } },
  ];
}

/**
 * A milestone's measures after a structural change (F6 step 10): the card
 * measure over its live Domains (a Field Area only), PRACTICE_KEPT over its
 * live practices on Today (by item lineage until Start), the checkpoint as
 * context. Existing measures keep their fields; a changed scope drops a
 * stale key and baseline so acceptance or Start sets them again.
 */
export function syncMeasures(m: MilestoneDraft, trackArea: boolean, makeId: () => string): MilestoneDraft {
  const out: MeasureSpec[] = [];
  const domains = Array.from(new Set(m.items.filter((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId).map((i) => i.domainId as string))).sort();
  const card = m.measures.find((x) => x.kind === "CARDS_AT_LEVEL");
  if (m.stage != null) {
    // A revision-4 stage's card measures are R2's (one per Domain of R at the gate, n_d each): a review edit never re-scopes them.
    out.push(...m.measures.filter((x) => x.kind === "CARDS_AT_LEVEL"));
  } else if (!trackArea && domains.length > 0) {
    if (card) {
      const same = scopeKeyOf(card.scope.domainIds ?? []) === domains.join(",");
      out.push(same ? card : { ...card, scope: { domainIds: domains }, measureKey: null, baseline: null, baselineDay: null });
    } else {
      out.push({
        id: makeId(),
        kind: "CARDS_AT_LEVEL",
        role: "PAYS",
        scope: { domainIds: domains },
        minLevel: null,
        target: 0,
        targetSource: "WORKED_OUT",
        fittedTarget: null,
        rateSource: null,
        baseline: null,
        baselineDay: null,
        unit: "card",
        itemLineageId: null,
        measureKey: null,
      });
    }
  }
  // One PRACTICE_KEPT measure per live practice on Today, scoped by its item lineage until Start (R2's fitPlan shape).
  for (const p of m.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && i.addToToday)) {
    const prev = m.measures.find((x) => x.kind === "PRACTICE_KEPT" && (x.itemLineageId === p.lineageId || (x.scope.itemLineageIds ?? []).includes(p.lineageId)));
    const own = prev && (prev.itemLineageId === p.lineageId || (prev.scope.itemLineageIds ?? []).length === 1);
    const scope: MeasureScope = { itemLineageIds: [p.lineageId] };
    if (own && prev?.scope.templateIds) scope.templateIds = [...prev.scope.templateIds];
    out.push({
      id: own ? (prev?.id ?? makeId()) : makeId(),
      kind: "PRACTICE_KEPT",
      role: "PAYS",
      scope,
      minLevel: null,
      target: own ? (prev?.target ?? 0) : 0,
      targetSource: "WORKED_OUT",
      fittedTarget: own ? (prev?.fittedTarget ?? null) : null,
      rateSource: null,
      baseline: null,
      baselineDay: null,
      unit: "session",
      itemLineageId: p.lineageId,
      measureKey: own ? (prev?.measureKey ?? null) : null,
    });
  }
  const checkpoint = m.items.find((i) => i.kind === "CHECKPOINT" && liveItem(i));
  if (checkpoint) {
    const ctxMeasure = m.measures.find((x) => x.kind === "CHECKPOINT");
    out.push(
      ctxMeasure
        ? { ...ctxMeasure, scope: { itemLineageIds: [checkpoint.lineageId] }, itemLineageId: checkpoint.lineageId }
        : {
            id: makeId(),
            kind: "CHECKPOINT",
            role: "CONTEXT",
            scope: { itemLineageIds: [checkpoint.lineageId] },
            minLevel: null,
            target: 0,
            targetSource: "YOURS",
            fittedTarget: null,
            rateSource: null,
            baseline: null,
            baselineDay: null,
            unit: "log",
            itemLineageId: checkpoint.lineageId,
            measureKey: null,
          }
    );
  }
  const notes: MilestoneNote[] = m.notes.filter((n) => n !== "NOT_MEASURABLE");
  if (!out.some((x) => x.role === "PAYS")) notes.push("NOT_MEASURABLE");
  return { ...m, measures: out, notes };
}

/**
 * Applies `change` to one milestone, re-syncs its measures and (when
 * structural) re-fits the version it belongs to, then writes every
 * milestone whose content changed. Returns the write, or a refusal.
 */
async function rewrite(
  e: Env,
  userId: string,
  loc: Located,
  now: Date,
  change: (m: MilestoneDraft) => MilestoneDraft | string,
  opts: { structural: boolean; decided?: ReadonlySet<string> }
): Promise<Result<null> | "stale"> {
  const { b, m } = loc;
  if (!EDITABLE.includes(m.status)) return fail("This milestone has started; change it on the roadmap's Now section.");
  const group = m.status === "PLANNED" ? planRowsOf(b).filter((x) => !isCarried(x)) : draftRowsOf(b);
  const drafts = group.map(draftOf);
  const idx = group.findIndex((x) => x.id === m.id);
  if (idx < 0) return fail("This milestone is no longer part of the plan.");
  const changed = change(drafts[idx]);
  if (typeof changed === "string") return fail(changed);
  const trackArea = b.roadmap.fieldId == null;
  drafts[idx] = opts.structural ? syncMeasures(changed, trackArea, e.makeId) : changed;
  let next = drafts;
  if (opts.structural && m.status !== "PLANNED") {
    try {
      const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b));
      // An ACTIVE roadmap's re-plan draft is fitted beside the milestones already carried (their capacity and due
      // days, fix round 2); only the draft's rows come back to be written.
      const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
      const plan = [...carried, ...drafts];
      // R2's re-fit names the stages' code labels: a pending Gemini addition is hidden from it (withPendingHidden).
      next = withPendingHidden(plan, (masked) => e.lanes.fitPlan(masked, realismInputOf(ctx, masked))).filter((d) => !isCarried(d));
    } catch (err) {
      console.error("roadmap: re-fit after an edit failed; saved without it:", err);
    }
  }
  const ops: StoreOp[] = milestoneGuards(b, m);
  const ctxText = modelTextContextOf(b, await e.io.fieldTree());
  const afterOf = (i: number) => next.find((x) => x.lineageId === group[i].lineageId && x.id === group[i].id) ?? next[i];
  try {
    for (let i = 0; i < group.length; i++) {
      const after = afterOf(i);
      if (!after) continue;
      const before = draftOf(group[i]);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      const others = group.map((_, k) => afterOf(k) ?? drafts[k]).filter((d, k) => k !== i && !!d);
      writeRoadmapRows(ops, { kind: "REWRITE", before: group[i], after, now, makeId: e.makeId, decided: opts.decided ?? new Set(), others }, ctxText);
    }
  } catch (err) {
    if (!(err instanceof ModelTextError)) throw err;
    logRefusedWrite("rewrite", err);
    return fail(CHANGE_NOT_SAVED);
  }
  const out = await e.store.apply(userId, ops);
  return out === "ok" ? ok(null) : "stale";
}

/** Whether an item change moves a milestone's measures (scope, practices, checkpoint, targets). */
function structuralKind(kind: string): boolean {
  return kind === "DOMAIN" || kind === "PRACTICE" || kind === "CHECKPOINT";
}

/**
 * One row's own change, with the milestone's guards: a decision or a label
 * that moves no measure is written to that row alone, so two taps on
 * different items (two devices) never overwrite each other.
 */
async function updateOne(e: Env, userId: string, loc: Located, table: "roadmapItem" | "roadmapMilestone", id: string, data: Record<string, unknown>): Promise<Result<null> | "stale"> {
  const { b, m } = loc;
  const guards: StoreOp[] = isCarried(m) ? [{ op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } }] : milestoneGuards(b, m);
  const ops: StoreOp[] = [...guards];
  if (TEXT_FIELDS.some((k) => k in data)) {
    // Words or their origin change: through the one writer, which reads the milestone as the patch leaves it.
    const before = draftOf(m);
    const result: MilestoneDraft =
      table === "roadmapMilestone"
        ? ({ ...before, ...(data as Partial<MilestoneDraft>) } as MilestoneDraft)
        : { ...before, items: before.items.map((it) => (it.id === id ? ({ ...it, ...(data as Partial<ItemDraft>) } as ItemDraft) : it)) };
    try {
      writeRoadmapRows(ops, { kind: "PATCH", table, id, data, result }, modelTextContextOf(b, await e.io.fieldTree()));
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("patch", err);
      return fail(CHANGE_NOT_SAVED);
    }
  } else {
    ops.push({ op: "update", table, where: { id }, data });
  }
  const out = await e.store.apply(userId, ops);
  return out === "ok" ? ok(null) : "stale";
}

/** The fields only the one writer writes on a milestone or an item (F-R4-20; the fix round adds the two that could carry a model's words). */
const TEXT_FIELDS: readonly string[] = ["title", "label", "origin", "titleOrigin", "catalogKey", "proposedName", "rawLabel"];

/** Keep → KEPT_SUGGESTION; I checked this → CHECKED (YOURS); Remove → REMOVED (kept as a row). A NUMBER item cannot be kept or checked. The milestone's own id decides its title. */
export async function decideItemCore(userId: string, itemId: string, decision: ItemDecisionChoice, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (decision !== "KEPT" && decision !== "CHECKED" && decision !== "REMOVED") return fail("Pick Keep, I checked this or Remove.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const loc = await locate(e, userId, itemId);
    if (!loc) return fail("That item no longer exists.");
    const { m, item } = loc;
    const editable = EDITABLE.includes(m.status);
    // Revision 4 (F-R4-16, F-R4-17): Keep and KEPT_SUGGESTION are retired, and "I checked this" remains only for an
    // area suggestion; a legacy plan's hidden words are never decided into the user's.
    const legacy = legacyOf(loc.b);
    if (decision === "KEPT") return fail(legacy ? DRAFT_IT_AGAIN : NOTHING_TO_KEEP);
    if (decision === "CHECKED" && legacy) return fail(DRAFT_IT_AGAIN);
    if (decision === "CHECKED" && !(item && item.kind === "GAP")) {
      if (!item && !m.title.trim()) return fail(NAME_IT_FIRST);
      return fail(NOTHING_TO_CHECK);
    }
    if (!item) {
      if (decision === "REMOVED") return fail("A milestone keeps its title; edit it instead.");
      // An empty title is never kept or checked: only naming it settles it (fix round 2's carry-over).
      if (!m.title.trim()) return fail(NAME_IT_FIRST);
      if (!editable && !(isCarried(m) && decision === "CHECKED")) return fail("This milestone has started; only “I checked this” is offered now.");
      // A Gemini title has no stored flags: the checker re-reads it, and a NUMBER title offers only Edit (F6).
      if (titleHasNumber(e, loc.b, await e.io.fieldTree(), draftOf(m))) return fail(TITLE_NUMBER);
      return updateOne(e, userId, loc, "roadmapMilestone", m.id, { titleDecision: decision });
    }
    if (decision !== "REMOVED" && item.flags.includes("NUMBER")) return fail("Gemini wrote a number here; edit it or remove it.");
    if (decision === "CHECKED" && item.kind === "DOMAIN" && !item.domainId) return fail("Create this Domain, map it to one of yours, or drop it.");
    if (!editable) {
      // A started milestone keeps its words for good; only "I checked this" is still offered there.
      if (!(isCarried(m) && decision === "CHECKED")) return fail("This milestone has started; only “I checked this” is offered now.");
      return updateOne(e, userId, loc, "roadmapItem", item.id, { decision, decidedAt: now });
    }
    if (decision === "REMOVED" && structuralKind(item.kind)) {
      // Removing a Domain, practice or checkpoint moves the measures: the milestone is re-synced (and a draft re-fitted).
      return rewrite(e, userId, loc, now, (d) => ({ ...d, items: d.items.map((it) => (it.id === item.id ? { ...it, decision } : it)) }), { structural: true, decided: new Set([item.id]) });
    }
    return updateOne(e, userId, loc, "roadmapItem", item.id, { decision, decidedAt: now });
  });
  invalidate("roadmap");
  return res;
}

const URL_LIKE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|io|edu|gov|co|uk|au|dev|app)\b|\/[a-z0-9_-]+\/[a-z0-9_-]+)/i;

const LABEL_MAX: Readonly<Record<ItemKind | "MILESTONE", number>> = {
  MILESTONE: MILESTONE_TITLE_MAX,
  DOMAIN: 80,
  TOPIC: TOPIC_LABEL_MAX,
  PRACTICE: PRACTICE_NAME_MAX,
  STEP: STEP_TITLE_MAX,
  CHECKPOINT: CHECKPOINT_LABEL_MAX,
  // Revision 4 (lane-0 contract shell): a GAP name is at most GAP_NAME_MAX (40).
  GAP: 40,
};

/**
 * What R3's checkLabel reads a label against (R3's labelContextFor): the
 * user's own words (aim, constraints, exam, the syllabus), the Area's name
 * and every Domain name, plus the milestone's place and the plan's count.
 */
function labelContextOf(
  b: RoadmapBundle,
  tree: readonly TreeField[],
  kind: ItemKind | "MILESTONE",
  extra: Pick<validate.LabelContext, "method" | "milestoneOrd" | "milestoneCount"> = {}
): validate.LabelContext {
  return validate.labelContextFor(
    intakeOf(b.roadmap),
    areaNameOf(b.roadmap, tree),
    tree.flatMap((f) => f.domains.map((d) => d.name)),
    kind,
    extra
  );
}

/** What R3's withLabelChecks reads every label against: the intake's words, the Area's name and every Field's Domain names (labelBaseFor). */
function labelBaseOf(b: RoadmapBundle, tree: readonly TreeField[]): validate.LabelBase {
  return validate.labelBaseFor(
    intakeOf(b.roadmap),
    areaNameOf(b.roadmap, tree),
    tree.flatMap((f) => f.domains.map((d) => d.name))
  );
}

/**
 * The milestones as the editor reads them, through R3's withLabelChecks (fix
 * round 2: the one derivation; no column holds them): a Gemini title not
 * EDITED gets titleFlags, titleStruck and titleReasons; a flagged Gemini
 * item its struck NUMBER spans and reasons. Stored item flags stay the
 * authority. `count` is the plan's milestone count (positions, the carried
 * rows included for a re-plan). Should it throw, the rows come back with no
 * derived flags (logged).
 */
function labelChecksOf<T extends MilestoneDraft>(e: Env, b: RoadmapBundle, tree: readonly TreeField[], drafts: readonly T[], count?: number): (T & validate.LabelChecked)[] {
  try {
    return e.lanes.withLabelChecks(drafts, labelBaseOf(b, tree), count == null ? undefined : Math.max(1, count));
  } catch (err) {
    console.error("roadmap: label checks not derived:", err);
    return drafts.map((d) => ({ ...d, titleFlags: [] as BlockingFlag[] }));
  }
}

/**
 * A Gemini title's derived flags (withLabelChecks), read with the plan count
 * the page reads it with: a draft row's (version + 1) is the carried rows'
 * and the draft's scheduled positions (draftViewOf), any other row's the
 * accepted plan's (the Milestones list, Now, the Start sheet).
 */
function titleFlagsOf(e: Env, b: RoadmapBundle, tree: readonly TreeField[], d: MilestoneDraft): BlockingFlag[] {
  const rows = d.version === b.roadmap.version + 1 ? [...planRowsOf(b).filter(isCarried), ...draftRowsOf(b)] : planRowsOf(b);
  return labelChecksOf(e, b, tree, [d], positionCountOf(rows.filter(scheduled)))[0]?.titleFlags ?? [];
}

/** Whether a title's checks hold NUMBER (Keep and "I checked this" refuse; Edit only). */
function titleHasNumber(e: Env, b: RoadmapBundle, tree: readonly TreeField[], d: MilestoneDraft): boolean {
  return titleFlagsOf(e, b, tree, d).includes("NUMBER");
}

/** A label the user typed: cleaned, within its cap, and never a link (F6 step 3 re-run on the edit; the words are the user's, so its other flags no longer block). */
function userLabel(e: Env, raw: unknown, kind: ItemKind | "MILESTONE", b: RoadmapBundle, tree: readonly TreeField[] = []): { ok: true; value: string } | { ok: false; error: string } {
  const text = cleanText(raw);
  if (!text) return { ok: false, error: "Write a few words." };
  if (Array.from(text).length > LABEL_MAX[kind]) return { ok: false, error: `Keep it to ${LABEL_MAX[kind]} characters.` };
  if (URL_LIKE.test(text)) return { ok: false, error: "Links can't be kept here: write what to do in words." };
  try {
    if (e.lanes.checkLabel(text, labelContextOf(b, tree, kind)).drop) return { ok: false, error: "Links can't be kept here: write what to do in words." };
  } catch {
    // The validator is R3's; the local link check above already ran.
  }
  return { ok: true, value: text };
}

/** A typed card target or level, validated: the CARDS_AT_LEVEL patch, or a refusal in words. */
function cardPatchOf(ed: ItemEdit): { target?: number; minLevel?: number } | string {
  const out: { target?: number; minLevel?: number } = {};
  if (ed.target !== undefined) {
    if (!Number.isInteger(ed.target) || ed.target < 1 || ed.target > 100_000) return "Type a whole number of cards.";
    out.target = ed.target;
  }
  if (ed.minLevel !== undefined) {
    if (!THRESHOLDS.includes(ed.minLevel)) return `Pick a level: ${THRESHOLDS.join(", ")}.`;
    out.minLevel = ed.minLevel;
  }
  return out;
}

/** The milestone's CARDS_AT_LEVEL measure with a typed target (YOURS) or level; its key is set again at acceptance or Start. */
function withCardPatch(measuresIn: readonly MeasureSpec[], patch: { target?: number; minLevel?: number }): MeasureSpec[] | string {
  if (!measuresIn.some((x) => x.kind === "CARDS_AT_LEVEL")) return "This milestone has no card measure to set.";
  return measuresIn.map((x) =>
    x.kind === "CARDS_AT_LEVEL"
      ? { ...x, target: patch.target ?? x.target, minLevel: patch.minLevel ?? x.minLevel, targetSource: patch.target != null ? "YOURS" : x.targetSource, measureKey: null }
      : x
  );
}

/** A typed card target or level on a depth plan (fix round, lens 2): only a coverage edit or LOWER_DEPTH moves those. */
export const DEPTH_COUNTS_FROM_COVERAGE = "On a plan aimed at a depth, counts come from coverage: change coverage or choose a lower depth.";

const EDIT_FIELDS: readonly (keyof ItemEdit)[] = ["label", "method", "sessionsPerWeek", "durationBand", "rule", "checkpointKind", "outOf", "bar", "domainId", "target", "minLevel"];

/**
 * Edit (F9; fix round: EDITED means the words changed). A label whose text
 * changed makes the item EDITED (YOURS) and clears its flags (the F6 checks
 * re-run on the new words). A plan-only edit — a practice's method,
 * sessions, band or rule (planSource YOURS), a checkpoint's kind, scale or
 * bar, a topic's Domain, a typed card target — keeps the item's decision:
 * Gemini's words stay Gemini's until the user edits them or taps "I checked
 * this". Fields sent unchanged change nothing. The milestone's own id edits
 * its title and, with {target, minLevel}, its CARDS_AT_LEVEL measure ("Type a
 * target": targetSource YOURS), touching no item's decision.
 */
export async function editItemCore(userId: string, itemId: string, edit: ItemEdit, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const ed: ItemEdit = edit && typeof edit === "object" ? edit : {};
  // The Edit sheet's catalog picker (F-R4-21; ItemEdit.catalogKey): another practice, step or checkpoint type, code-worded, the user's choice.
  const pickedKind: unknown = ed.catalogKey;
  if (!EDIT_FIELDS.some((k) => ed[k] !== undefined) && pickedKind == null) return fail("Nothing to change.");
  const res = await withRetry<null>(async () => {
    const loc = await locate(e, userId, itemId);
    if (!loc) return fail("That item no longer exists.");
    const { b, m, item } = loc;
    if (pickedKind != null) {
      if (!item || (item.kind !== "PRACTICE" && item.kind !== "STEP" && item.kind !== "CHECKPOINT")) return fail("Only a practice, step or checkpoint changes its type.");
      if (!EDITABLE.includes(m.status)) return fail("This milestone has started; its practices are on Today now.");
      const picked = catalogPickOf(b, await e.io.fieldTree(), itemDraftOf(item), pickedKind);
      if (typeof picked === "string") return fail(picked);
      return rewrite(e, userId, loc, now, (d) => ({ ...d, items: d.items.map((it) => (it.id === item.id ? picked : it)) }), { structural: item.kind !== "STEP", decided: new Set([item.id]) });
    }
    const cardEdit = ed.target !== undefined || ed.minLevel !== undefined;
    // A depth plan's stage counts and levels come from coverage and the depth (decision 37, F-R4-15): never typed here.
    if (cardEdit && depthOf(b.roadmap) != null) return fail(DEPTH_COUNTS_FROM_COVERAGE);
    if (!item) {
      // The milestone's own id: its title, and/or its card measure's typed target.
      if (ed.label === undefined && !cardEdit) return fail("Nothing to change.");
      let title: string | null = null;
      if (ed.label !== undefined) {
        const label = userLabel(e, ed.label, "MILESTONE", b);
        if (!label.ok) return fail(label.error);
        if (label.value !== m.title) title = label.value;
      }
      const cardPatch = cardEdit ? cardPatchOf(ed) : null;
      if (typeof cardPatch === "string") return fail(cardPatch);
      if (!EDITABLE.includes(m.status)) return fail(cardEdit ? "This milestone has started; its target is set." : "This milestone has started; its title is on Today now.");
      if (!cardPatch) return title ? updateOne(e, userId, loc, "roadmapMilestone", m.id, { title, titleDecision: "EDITED" }) : ok(null);
      return rewrite(
        e,
        userId,
        loc,
        now,
        (d) => {
          const ms = withCardPatch(d.measures, cardPatch);
          if (typeof ms === "string") return ms;
          return { ...d, ...(title ? { title, titleDecision: "EDITED" as Decision } : {}), measures: ms };
        },
        { structural: true }
      );
    }
    if (isCarried(m)) {
      // A started milestone's Today-bound words are set; a topic is context, so its words may still change (EDITED, YOURS).
      if (!(item.kind === "TOPIC" && ed.label !== undefined && Object.keys(ed).every((k) => k === "label"))) {
        return fail("This milestone has started; only a topic's words can change now.");
      }
      const label = userLabel(e, ed.label, "TOPIC", b);
      if (!label.ok) return fail(label.error);
      if (label.value === item.label) return ok(null);
      return updateOne(e, userId, loc, "roadmapItem", item.id, { label: label.value, flags: [], decision: "EDITED", decidedAt: now });
    }
    if (!EDITABLE.includes(m.status)) return fail("This milestone is no longer part of the plan.");
    const patch: Partial<ItemDraft> = {};
    let structural = false;
    let labelChanged = false;
    let cardPatch: { target?: number; minLevel?: number } | null = null;
    if (ed.label !== undefined) {
      const label = userLabel(e, ed.label, item.kind as ItemKind, b);
      if (!label.ok) return fail(label.error);
      if (label.value !== item.label) {
        patch.label = label.value;
        patch.flags = [];
        labelChanged = true;
      }
    }
    if (item.kind === "PRACTICE") {
      const plan: Partial<ItemDraft> = {};
      if (ed.method !== undefined) {
        if (!isOneOf(PRACTICE_METHODS, ed.method)) return fail("Pick a method.");
        if (ed.method !== item.method) plan.method = ed.method;
      }
      if (ed.sessionsPerWeek !== undefined) {
        const s = intIn(ed.sessionsPerWeek, SESSIONS_MIN, SESSIONS_MAX);
        if (s == null) return fail(`Sessions a week must be ${SESSIONS_MIN}–${SESSIONS_MAX}.`);
        if (s !== item.sessionsPerWeek) {
          plan.sessionsPerWeek = s;
          plan.rule = s === 7 ? "DAILY" : `TARGET:${s}/W`;
        }
      }
      if (ed.durationBand !== undefined) {
        if (!isOneOf(PRACTICE_BANDS, ed.durationBand)) return fail("Pick a session length.");
        if (ed.durationBand !== item.durationBand) plan.durationBand = ed.durationBand;
      }
      if (ed.rule !== undefined) {
        const r = parseRule(ed.rule);
        if (!r || r.kind === "AFTER") return fail("Pick days or a weekly count for this practice.");
        const rule = ed.rule.trim().toUpperCase();
        if (rule !== item.rule) {
          plan.rule = rule;
          plan.sessionsPerWeek = ruleSessions(rule);
        }
      }
      if (Object.keys(plan).length) {
        Object.assign(patch, plan, { planSource: "YOURS" });
        structural = true;
      }
    }
    if (item.kind === "CHECKPOINT") {
      const kind = ed.checkpointKind;
      if (kind !== undefined) {
        if (!isOneOf(CHECKPOINT_KINDS, kind)) return fail("Pick a checkpoint kind.");
        if (kind !== item.checkpointKind) patch.checkpointKind = kind;
      }
      const outOf = ed.outOf !== undefined ? ed.outOf : item.outOf;
      const bar = ed.bar !== undefined ? ed.bar : item.bar;
      if (ed.outOf !== undefined || ed.bar !== undefined) {
        if (outOf == null || !Number.isFinite(outOf) || outOf <= 0) return fail("Set what the score is out of.");
        if (bar == null || !Number.isFinite(bar) || bar < 0 || bar > outOf) return fail("Set a bar between 0 and the scale.");
        if (outOf !== item.outOf) patch.outOf = outOf;
        if (bar !== item.bar) patch.bar = bar;
      }
    }
    if (item.kind === "TOPIC" && ed.domainId !== undefined) {
      // An outline line's Domain is the user's line Domain (F-R4-9): it changes with setLineDomain, for every row of the line.
      if (item.origin === "SYLLABUS" && item.syllabusRef != null && depthOf(b.roadmap) != null) return fail("Change this outline line's Domain with its Change control.");
      const inScope = typeof ed.domainId === "string" && topicDomainOk(b, m, ed.domainId);
      if (!inScope) return fail("Move the topic to one of this milestone's Domains.");
      if (ed.domainId !== item.domainId) patch.domainId = ed.domainId;
    }
    if (cardEdit) {
      const c = cardPatchOf(ed);
      if (typeof c === "string") return fail(c);
      cardPatch = c;
      structural = true;
    }
    // Every field sent equals what is stored: nothing to write, and nothing changes hands.
    if (Object.keys(patch).length === 0 && !cardPatch) return ok(null);
    // The decision moves only with the words (EDITED, YOURS); a plan, a bar or a target leaves it as it was.
    const decided = labelChanged ? { decision: "EDITED" as Decision } : {};
    // Words, a checkpoint's scale and bar, a topic's Domain: that row alone. A practice plan or a typed target moves the measures.
    if (!structural) return updateOne(e, userId, loc, "roadmapItem", item.id, { ...patch, ...decided, ...(labelChanged ? { decidedAt: now } : {}) });
    return rewrite(
      e,
      userId,
      loc,
      now,
      (d) => {
        const items = d.items.map((it) => (it.id === item.id ? { ...it, ...patch, ...decided } : it));
        let ms: MeasureSpec[] = d.measures;
        if (cardPatch) {
          const next = withCardPatch(ms, cardPatch);
          if (typeof next === "string") return next;
          ms = next;
        }
        return { ...d, items, measures: ms };
      },
      { structural, decided: labelChanged ? new Set([item.id]) : new Set() }
    );
  });
  invalidate("roadmap");
  return res;
}

/**
 * A catalog pick in the Edit sheet (F-R4-21): the new type must fit the slot,
 * the Area's track and the exam answer, and never be code-only (EXAM_DAY).
 * The row is re-worded by the catalog (CODE), decided EDITED (the user's
 * choice, YOURS), keeps its Domain, and is no longer Gemini's pick or the
 * app's addition. A refusal in words, or the new row.
 */
function catalogPickOf(b: RoadmapBundle, tree: readonly TreeField[], it: ItemDraft, raw: unknown): ItemDraft | string {
  const entry = catalogEntryOf(raw);
  if (!entry || entry.codeOnly) return "Pick a type from the list.";
  if (entry.slot !== it.kind) return "Pick a type from this list.";
  const track = catalogTrackOf({ fieldId: b.roadmap.fieldId, track: intakeOf(b.roadmap).track });
  if (!entry.tracks.includes(track)) return "That type isn't used for this Area.";
  if (entry.examOnly && !b.roadmap.examLabel) return "That type needs an exam: say there is one first.";
  if (entry.slot === "PRACTICE" && !b.roadmap.practicesAllowed) return "Practices are off for this roadmap.";
  const ctx = modelTextContextOf(b, tree);
  const ids = it.domainId ? [it.domainId] : [...(ctx.required ?? [])];
  const names = ids.map((id) => (Object.prototype.hasOwnProperty.call(ctx.domainNames, id) ? ctx.domainNames[id] : null)).filter((n): n is string => !!n);
  let label: string;
  try {
    label = String(
      catalogLabelOf(entry.key, {
        track,
        domains: names.map((n) => domainName({ id: "", name: n })),
        aim: yoursText("USER", "EDITED", b.roadmap.aim) ?? undefined,
        exam: b.roadmap.examLabel ? (yoursText("USER", "EDITED", b.roadmap.examLabel) ?? undefined) : undefined,
      })
    );
  } catch {
    return "That type needs a Domain on this plan.";
  }
  return {
    ...it,
    catalogKey: entry.key,
    label,
    rawLabel: null,
    origin: catalogOriginOf(),
    decision: "EDITED",
    flags: [],
    notes: it.notes.filter((n) => n !== "GEMINI_PICK" && n !== "STUDY_ADDED" && n !== "PRODUCTION_ADDED"),
    ...(entry.slot === "PRACTICE" && entry.method ? { method: entry.method } : {}),
    ...(entry.slot === "CHECKPOINT" ? { checkpointKind: entry.key as CheckpointKind } : {}),
  };
}

/** A topic's Domain: one of the milestone's live Domain items, or on a depth plan one of R (every stage deepens the same Domains). */
function topicDomainOk(b: RoadmapBundle, m: MilestoneBundle, domainId: string): boolean {
  if (m.items.some((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId === domainId)) return true;
  return depthOf(b.roadmap) != null && requiredDomainsOf(b, [...planRowsOf(b), ...draftRowsOf(b)]).includes(domainId);
}

/** An item the user adds by hand ("Write it myself", F7): origin USER (YOURS). */
export interface NewItem {
  kind: ItemKind;
  label?: string;
  /** DOMAIN: one of the user's Domains (the picker over the library); TOPIC: one of the milestone's. */
  domainId?: string;
  method?: PracticeMethod;
  sessionsPerWeek?: number;
  durationBand?: PracticeBand;
  checkpointKind?: CheckpointKind;
  outOf?: number;
  bar?: number;
  /**
   * TOPIC: [Add as topic] for a syllabus line no topic covers ("Not in this
   * plan yet: S4, S9", F6 step 8). The label is the user's own line (origin
   * SYLLABUS, YOURS); `label` is then ignored.
   */
  syllabusRef?: number;
  /**
   * PRACTICE, STEP or CHECKPOINT (F-R4-21; fix round, contracts §15.11): a
   * type from the app's list (roadmap-catalog), worded by the catalog (CODE)
   * and decided EDITED (the user's choice); `label` is then ignored.
   */
  catalogKey?: CatalogKey | null;
}

const KIND_CAP: Readonly<Record<ItemKind, number>> = {
  DOMAIN: DOMAINS_PER_MILESTONE,
  TOPIC: TOPICS_PER_MILESTONE,
  PRACTICE: PRACTICES_PER_MILESTONE,
  STEP: STEPS_PER_MILESTONE,
  CHECKPOINT: CHECKPOINTS_PER_MILESTONE,
  // Revision 4 (lane-0 contract shell): a GAP row is never added by hand (addItemCore refuses it).
  GAP: 0,
};

/** Adds one item the user wrote to a DRAFT, LATER or PLANNED milestone (caps per F6 step 11); code re-fits the numbers. */
export async function addItemCore(userId: string, milestoneId: string, input: NewItem, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ itemId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const n: Partial<NewItem> = input && typeof input === "object" ? input : {};
  if (!isOneOf(["DOMAIN", "TOPIC", "PRACTICE", "STEP", "CHECKPOINT"] as const, n.kind)) return fail("Pick what to add.");
  const kind = n.kind;
  const itemId = e.makeId();
  const res = await withRetry<{ itemId: string }>(async () => {
    const loc = await locate(e, userId, milestoneId);
    if (!loc || loc.item) return fail("That milestone no longer exists.");
    const { b, m } = loc;
    if (legacyOf(b)) return fail(b.roadmap.status === "DRAFT" ? DRAFT_IT_AGAIN : START_AGAIN_AT_DEPTH);
    if (m.items.filter((i) => i.kind === kind && liveItem(i)).length >= KIND_CAP[kind]) return fail(`A milestone holds at most ${KIND_CAP[kind]} of these.`);
    const tree = await e.io.fieldTree();
    const facts = domainFactsOf(tree);
    // A catalog pick (F-R4-21; NewItem.catalogKey): a practice, step or checkpoint type, code-worded, the user's choice.
    const pickedKind: unknown = n.catalogKey;
    if (pickedKind != null && (kind === "PRACTICE" || kind === "STEP" || kind === "CHECKPOINT")) {
      const base: ItemDraft = {
        id: itemId,
        lineageId: e.makeId(),
        kind,
        ord: Math.max(0, ...m.items.map((i) => i.ord)) + 1,
        label: "",
        rawLabel: null,
        origin: "USER",
        decision: "EDITED",
        domainId: n.domainId && facts.has(n.domainId) ? n.domainId : null,
        proposedName: null,
        syllabusRef: null,
        method: null,
        sessionsPerWeek: kind === "PRACTICE" ? 1 : null,
        durationBand: null,
        rule: kind === "PRACTICE" ? "TARGET:1/W" : null,
        planSource: kind === "PRACTICE" ? "WORKED_OUT" : null,
        checkpointKind: null,
        outOf: null,
        bar: null,
        addToToday: true,
        templateId: null,
        flags: [],
        notes: [],
      };
      const picked = catalogPickOf(b, tree, base, pickedKind);
      if (typeof picked === "string") return fail(picked);
      const withBand = picked.kind === "PRACTICE" && picked.method ? { ...picked, durationBand: METHOD_DEFAULT_BAND[picked.method] } : picked;
      const out = await rewrite(e, userId, loc, now, (d) => ({ ...d, items: [...d.items, withBand] }), { structural: structuralKind(kind), decided: new Set([itemId]) });
      if (out === "stale") return "stale";
      return out.ok ? ok({ itemId }) : fail(out.error);
    }
    let label = "";
    let domainId: string | null = null;
    if (kind === "DOMAIN") {
      if (b.roadmap.fieldId == null) return fail("A life-track Area has no Domains.");
      // A depth plan counts one set of Domains at every stage (F-R4-10): R changes in the intake, never on one milestone.
      if (depthOf(b.roadmap) != null) return fail("A depth plan counts the same Domains at every stage: change them in the intake form.");
      const d = n.domainId ? facts.get(n.domainId) : undefined;
      if (!d) return fail("Pick one of your Domains.");
      if (m.items.some((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId === d.id)) return fail("That Domain is already here.");
      label = d.name;
      domainId = d.id;
    } else if (kind === "TOPIC" && n.syllabusRef != null) {
      // The user's syllabus line, whole, as the topic's words (origin SYLLABUS); one topic per line in this version.
      const syllabus = intakeOf(b.roadmap).syllabus;
      const lines = syllabus?.lines ?? [];
      const ref = n.syllabusRef;
      if (!Number.isInteger(ref) || ref < 0 || ref >= lines.length) return fail("That syllabus line no longer exists.");
      // The plan's rows: this version's, and the carried (started) milestones' — a line a started milestone covers is in the plan (fix round 2).
      const sameVersion = b.milestones.filter((x) => (x.version === m.version || isCarried(x)) && x.status !== "DISCARDED" && x.status !== "SUPERSEDED");
      if (sameVersion.some((x) => x.items.some((i) => i.kind === "TOPIC" && liveItem(i) && i.syllabusRef === ref))) return fail("That syllabus line is already a topic.");
      // The line's exact words (a SYLLABUS topic's label is the line: the tripwire checks it).
      label = lines[ref];
      if (!label.trim()) return fail("That syllabus line is empty.");
      // The line's Domain is the user's (lineDomains, F-R4-9); a Domain given here must be one of the milestone's.
      domainId = n.domainId ?? syllabus?.lineDomains?.[ref] ?? null;
      if (domainId && !topicDomainOk(b, m, domainId)) return fail("Pick one of this milestone's Domains.");
    } else {
      const l = userLabel(e, n.label, kind, b);
      if (!l.ok) return fail(l.error);
      label = l.value;
      if (kind === "TOPIC") {
        domainId = n.domainId ?? null;
        if (domainId && !topicDomainOk(b, m, domainId)) return fail("Pick one of this milestone's Domains.");
      }
    }
    const syllabusTopic = kind === "TOPIC" && n.syllabusRef != null;
    let method: PracticeMethod | null = null;
    let sessions: number | null = null;
    let band: PracticeBand | null = null;
    let planSource: "WORKED_OUT" | "YOURS" | null = null;
    if (kind === "PRACTICE") {
      if (!b.roadmap.practicesAllowed) return fail("Practices are off for this roadmap.");
      if (!isOneOf(PRACTICE_METHODS, n.method)) return fail("Pick a method.");
      method = n.method;
      sessions = n.sessionsPerWeek != null ? intIn(n.sessionsPerWeek, SESSIONS_MIN, SESSIONS_MAX) : 1;
      if (sessions == null) return fail(`Sessions a week must be ${SESSIONS_MIN}–${SESSIONS_MAX}.`);
      band = n.durationBand != null ? (isOneOf(PRACTICE_BANDS, n.durationBand) ? n.durationBand : null) : METHOD_DEFAULT_BAND[method];
      if (!band) return fail("Pick a session length.");
      planSource = n.sessionsPerWeek != null || n.durationBand != null ? "YOURS" : "WORKED_OUT";
    }
    let checkpointKind: CheckpointKind | null = null;
    let outOf: number | null = null;
    let bar: number | null = null;
    if (kind === "CHECKPOINT") {
      checkpointKind = isOneOf(CHECKPOINT_KINDS, n.checkpointKind) ? n.checkpointKind : "SELF_TEST";
      outOf = typeof n.outOf === "number" && Number.isFinite(n.outOf) && n.outOf > 0 ? n.outOf : null;
      bar = typeof n.bar === "number" && Number.isFinite(n.bar) && n.bar >= 0 && (outOf == null || n.bar <= outOf) ? n.bar : null;
    }
    const item: ItemDraft = {
      id: itemId,
      lineageId: e.makeId(),
      kind,
      ord: Math.max(0, ...m.items.map((i) => i.ord)) + 1,
      label,
      rawLabel: null,
      // A syllabus line is the user's own words (YOURS) without a tap, as validation writes it.
      origin: syllabusTopic ? "SYLLABUS" : "USER",
      decision: syllabusTopic ? "PENDING" : "EDITED",
      domainId,
      proposedName: null,
      syllabusRef: syllabusTopic ? (n.syllabusRef as number) : null,
      method,
      sessionsPerWeek: sessions,
      durationBand: band,
      rule: sessions != null ? (sessions === 7 ? "DAILY" : `TARGET:${sessions}/W`) : null,
      planSource,
      checkpointKind,
      outOf,
      bar,
      addToToday: true,
      templateId: null,
      flags: [],
      notes: [],
    };
    const out = await rewrite(e, userId, loc, now, (d) => ({ ...d, items: [...d.items, item] }), { structural: structuralKind(kind), decided: new Set([itemId]) });
    if (out === "stale") return "stale";
    return out.ok ? ok({ itemId }) : fail(out.error);
  });
  invalidate("roadmap");
  return res;
}

/** Whether bulk keep is off for this roadmap (a credential or non-English aim, F6): every item then needs its own tap. */
function bulkKeepOff(e: Env, r: Pick<RoadmapRec, "aim" | "examLabel">): boolean {
  try {
    return !e.lanes.bulkKeepAllowed({ aim: r.aim, examLabel: r.examLabel });
  } catch {
    return isCredentialAim(r.aim, r.examLabel);
  }
}

/** "Keep this milestone's unflagged suggestions": the next milestone's DRAFT items with no blocking flag → KEPT_SUGGESTION. Absent for credential and non-English aims. */
export async function keepUnflaggedCore(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ kept: number }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  let kept = 0;
  const res = await withRetry<{ kept: number }>(async () => {
    const loc = await locate(e, userId, milestoneId);
    if (!loc || loc.item) return fail("That milestone no longer exists.");
    const { b, m } = loc;
    // Revision 4 (F-R4-16, F-R4-17): bulk keep is retired on a revision-4 plan (no Gemini words to keep) and on a legacy one (its words are hidden).
    if (legacyOf(b)) return fail(DRAFT_IT_AGAIN);
    if (b.roadmap.fieldId == null || depthOf(b.roadmap) != null || m.stage != null) return fail(NOTHING_TO_KEEP);
    if (bulkKeepOff(e, b.roadmap)) return fail("Each item of this aim needs its own tap.");
    const next = m.status === "PLANNED" ? planRowsOf(b).find((x) => x.status === "PLANNED") : nextDraftRow(draftRowsOf(b));
    if (!next || next.id !== m.id) return fail("Only the next milestone is decided now.");
    const keepIds = new Set(
      m.items
        .filter((i) => i.decision === "PENDING" && i.origin === "GEMINI" && i.flags.length === 0 && !(i.kind === "DOMAIN" && !i.domainId))
        .map((i) => i.id)
    );
    // A Gemini title is bulk-kept only when named and its derived flags (the ones the page shows) are none.
    const keepTitle = m.titleDecision === "PENDING" && m.titleOrigin === "GEMINI" && !!m.title.trim() && titleFlagsOf(e, b, await e.io.fieldTree(), draftOf(m)).length === 0;
    kept = keepIds.size + (keepTitle ? 1 : 0);
    if (kept === 0) return ok({ kept: 0 });
    // Only rows still PENDING turn KEPT (a tap that decided one meanwhile stands): KEPT_SUGGESTION, never YOURS.
    const ops: StoreOp[] = [...milestoneGuards(b, m)];
    if (keepIds.size) ops.push({ op: "update", table: "roadmapItem", where: { id: { in: [...keepIds] }, decision: "PENDING" }, data: { decision: "KEPT", decidedAt: now } });
    if (keepTitle) ops.push({ op: "update", table: "roadmapMilestone", where: { id: m.id, titleDecision: "PENDING" }, data: { titleDecision: "KEPT" } });
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ kept }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/** A Domain item: [I checked this] (CHECKED), [Map to…] (EDITED), [Create] (taxonomy createDomain under a confirmed name; EDITED or CHECKED), or [Drop]. */
export async function resolveDomainCore(userId: string, itemId: string, resolution: DomainResolution, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ domainId: string | null }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const r = resolution && typeof resolution === "object" ? resolution : ({ kind: "" } as unknown as DomainResolution);
  let created: { id: string; name: string } | null = null;
  const res = await withRetry<{ domainId: string | null }>(async () => {
    const loc = await locate(e, userId, itemId);
    if (loc?.item?.kind === "GAP") {
      const made = await createFromSuggestion(e, userId, loc, r, created, now);
      if (made === "stale") return "stale";
      if (made.ok && made.value.created) created = made.value.created;
      return made.ok ? ok({ domainId: made.value.domainId }) : fail(made.error);
    }
    if (!loc || !loc.item || loc.item.kind !== "DOMAIN") return fail("That Domain item no longer exists.");
    const { b, m, item } = loc;
    if (isCarried(m)) {
      if (r.kind !== "CHECK" || !item.domainId) return fail("This milestone has started; its Domains are set.");
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } },
        { op: "update", table: "roadmapItem", where: { id: item.id }, data: { decision: "CHECKED", decidedAt: now } },
      ]);
      return out === "ok" ? ok({ domainId: item.domainId }) : "stale";
    }
    // Revision 4: a legacy plan's hidden words are never decided; a depth plan counts one set of Domains at every stage
    // (F-R4-10) — R changes in the intake, or through Gemini's additions (confirmDomainAdditions) — and "I checked this"
    // remains only for an area suggestion.
    if (legacyOf(b)) return fail(DRAFT_IT_AGAIN);
    if (r.kind === "CHECK") return fail(NOTHING_TO_CHECK);
    if (depthOf(b.roadmap) != null) return fail("A depth plan counts the same Domains at every stage: change them in the intake form.");
    const tree = await e.io.fieldTree();
    const facts = domainFactsOf(tree);
    let next: Partial<ItemDraft>;
    const structural = true;
    switch (r.kind) {
      case "MAP": {
        const d = facts.get(r.domainId);
        if (!d) return fail("Pick one of your Domains.");
        next = { decision: "EDITED", domainId: d.id, label: d.name, proposedName: null, flags: [] };
        break;
      }
      case "DROP":
        next = { decision: "REMOVED" };
        break;
      case "CREATE": {
        if (b.roadmap.fieldId == null) return fail("A life-track Area has no Domains.");
        const name = cleanText(r.name);
        if (!name) return fail("Name the Domain.");
        if (Array.from(name).length > LABEL_MAX.DOMAIN) return fail(`Keep the name to ${LABEL_MAX.DOMAIN} characters.`);
        if (URL_LIKE.test(name)) return fail("A Domain name can't be a link.");
        const proposed = cleanText(item.proposedName ?? item.label);
        const unedited = name.toLowerCase() === proposed.toLowerCase();
        if (unedited && item.flags.length > 0) return fail(`Edit the name first: Gemini's name carries a flag (${item.flags.join(", ").toLowerCase().replace(/_/g, " ")}).`);
        const field = tree.find((f) => f.id === r.fieldId);
        if (!field) return fail("That Field no longer exists.");
        const existing = field.domains.find((d) => d.name.toLowerCase() === name.toLowerCase());
        if (!created && !existing) {
          const made = await e.io.createDomain(field.id, name);
          if (!made.ok) return fail(made.error);
          created = { id: made.value.id, name: made.value.name };
          invalidate("fields", "ideas");
        }
        const d = created ?? (existing ? { id: existing.id, name: existing.name } : null);
        if (!d) return fail("Couldn't create the Domain.");
        next = { decision: unedited ? "CHECKED" : "EDITED", domainId: d.id, label: d.name, proposedName: null, flags: [] };
        break;
      }
      default:
        return fail("Pick Create, Map to… or Drop.");
    }
    const proposed = item.proposedName;
    const oldDomain = item.domainId;
    const out = await rewrite(
      e,
      userId,
      loc,
      now,
      (d) => {
        // Another live Domain item of the milestone still on the old Domain keeps its topics there.
        const oldStays = !!oldDomain && d.items.some((x) => x.id !== item.id && x.kind === "DOMAIN" && liveItem(x) && x.domainId === oldDomain);
        return {
          ...d,
          items: d.items.map((it) => {
            if (it.id === item.id) return { ...it, ...next };
            if (it.kind !== "TOPIC") return it;
            const underProposed = !!proposed && !it.domainId && it.proposedName === proposed;
            const underOld = !!oldDomain && it.domainId === oldDomain && !oldStays;
            // Topics filed under the Domain follow it to the Domain it became (create, map) …
            if ((underProposed || underOld) && next.domainId && next.decision !== "REMOVED") return { ...it, domainId: next.domainId, proposedName: null };
            // … and lose it when it is dropped (the editor files them again).
            if ((underProposed || underOld) && next.decision === "REMOVED") return { ...it, domainId: null, proposedName: null };
            return it;
          }),
        };
      },
      { structural, decided: new Set([item.id]) }
    );
    if (out === "stale") return "stale";
    return out.ok ? ok({ domainId: next.domainId ?? item.domainId ?? null }) : fail(out.error);
  });
  invalidate("roadmap");
  return res;
}

/** "Create a Domain named “X”?" — an edited suggestion found nowhere in the user's words needs this second confirm (F-R4-19). */
export const UNGROUNDED_NAME = "The app found these words nowhere in your aim, outline, exam or chosen Domains. Create it anyway?";

/**
 * The texts a suggestion may be grounded in (F-R4-19): only what the user
 * typed or chose — the aim, the constraints, the exam's name, each outline
 * line, the Area's name and the chosen Domains' names. Never a card title or
 * tag, never an unchosen Domain, never a Domain created from a suggestion.
 */
export function groundSourcesOf(r: Pick<RoadmapRec, "aim" | "constraints" | "examLabel" | "syllabus" | "domainIds">, areaName: string, domainNames: Readonly<Record<string, string>>, fromSuggestion: ReadonlySet<string>): validate.GroundSource[] {
  const out: validate.GroundSource[] = [{ kind: "AIM", index: 0, text: r.aim }];
  if (r.constraints) out.push({ kind: "CONSTRAINTS", index: 0, text: r.constraints });
  if (r.examLabel) out.push({ kind: "EXAM", index: 0, text: r.examLabel });
  const s = r.syllabus && typeof r.syllabus === "object" ? (r.syllabus as { lines?: unknown }).lines : null;
  if (Array.isArray(s)) s.forEach((l, i) => typeof l === "string" && out.push({ kind: "OUTLINE", index: i, text: l }));
  if (areaName) out.push({ kind: "AREA", index: 0, text: areaName });
  r.domainIds.forEach((id, i) => {
    const name = Object.prototype.hasOwnProperty.call(domainNames, id) ? domainNames[id] : undefined;
    if (name && !fromSuggestion.has(id)) out.push({ kind: "DOMAIN", index: i, text: name });
  });
  return out;
}

/**
 * [Create as a Domain…] on an area suggestion (F-R4-19): refused once R holds
 * DEPTH_DOMAINS_MAX; an edited name the app can't ground in the user's words
 * needs `confirm`. Otherwise taxonomy createDomain in the Area Field (an
 * existing Domain of that name is reused), the GAP row REMOVED, and a DOMAIN
 * item on every unstarted row of the version — origin GEMINI and CHECKED for
 * the name as shown, origin USER and EDITED for an edited one, ItemNote
 * FROM_SUGGESTION — through the one writer, the plan re-dated with it.
 */
async function createFromSuggestion(
  e: Env,
  userId: string,
  loc: Located,
  r: DomainResolution,
  already: { id: string; name: string } | null,
  now: Date
): Promise<Result<{ domainId: string | null; created: { id: string; name: string } | null }> | "stale"> {
  const { b, m, item } = loc;
  if (!item) return fail("That suggestion no longer exists.");
  if (r.kind === "DROP") {
    const out = await updateOne(e, userId, loc, "roadmapItem", item.id, { decision: "REMOVED", decidedAt: now });
    return out === "stale" ? "stale" : out.ok ? ok({ domainId: null, created: null }) : fail(out.error);
  }
  if (r.kind !== "CREATE") return fail("Create it as a Domain, or dismiss it.");
  if (b.roadmap.fieldId == null) return fail("A life-track Area has no Domains.");
  if (!EDITABLE.includes(m.status) || item.decision === "REMOVED") return fail("That suggestion is no longer open.");
  const tree = await e.io.fieldTree();
  const rows = m.status === "PLANNED" ? planRowsOf(b).filter((x) => !isCarried(x)) : draftRowsOf(b);
  const required = requiredDomainsOf(b, rows);
  if (required.length >= DEPTH_DOMAINS_MAX) return fail(TOO_MANY_DOMAINS);
  const name = cleanText(r.name);
  if (!name) return fail("Name the Domain.");
  if (Array.from(name).length > LABEL_MAX.DOMAIN) return fail(`Keep the name to ${LABEL_MAX.DOMAIN} characters.`);
  if (URL_LIKE.test(name)) return fail("A Domain name can't be a link.");
  const edited = name.toLowerCase() !== cleanText(item.label).toLowerCase();
  if (edited && (r as DomainResolution & { confirm?: unknown }).confirm !== true) {
    const ctxText = modelTextContextOf(b, tree);
    const fromSuggestion = new Set(await e.io.suggestionDomainIds(userId).catch(() => [] as string[]));
    let grounded = false;
    try {
      grounded = validate.groundingOf(name, groundSourcesOf(b.roadmap, areaNameOf(b.roadmap, tree), ctxText.domainNames, fromSuggestion)).grounded;
    } catch {
      grounded = false;
    }
    if (!grounded) return fail(UNGROUNDED_NAME);
  }
  const field = tree.find((f) => f.id === (r.fieldId || b.roadmap.fieldId));
  if (!field) return fail("That Field no longer exists.");
  const existing = field.domains.find((d) => d.name.toLowerCase() === name.toLowerCase());
  let created = already;
  if (!created && !existing) {
    const made = await e.io.createDomain(field.id, name);
    if (!made.ok) return fail(made.error);
    created = { id: made.value.id, name: made.value.name };
    invalidate("fields", "ideas");
  }
  const d = created ?? (existing ? { id: existing.id, name: existing.name } : null);
  if (!d) return fail("Couldn't create the Domain.");
  const fresh = await e.io.fieldTree();
  const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b));
  const drafts = rows.map(draftOf);
  const withDomain = drafts.map((x) => {
    const items = x.items.map((i) => (i.id === item.id ? { ...i, decision: "REMOVED" as Decision } : i));
    if (heldRow(x) || items.some((i) => i.kind === "DOMAIN" && i.domainId === d.id && liveItem(i))) return { ...x, items };
    const row: ItemDraft = {
      ...itemDraftOf(item),
      id: null,
      lineageId: e.makeId(),
      kind: "DOMAIN",
      label: d.name,
      rawLabel: null,
      origin: edited ? "USER" : "GEMINI",
      decision: edited ? "EDITED" : "CHECKED",
      domainId: d.id,
      proposedName: null,
      syllabusRef: null,
      groundRef: undefined,
      flags: [],
      notes: ["FROM_SUGGESTION"],
    };
    return { ...x, items: [...items, row] };
  });
  const carried = carriedPlanOf(b, rows, await carriedGoalsOf(e, userId, b));
  const nextRequired = requiredDomainsOf(b, withDomain);
  const redated = redraftOf(e, { ...ctx, tree: fresh, domains: domainFactsOf(fresh) }, withDomain, carried, nextRequired);
  if (!redated.ok) return fail(redated.error);
  const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } }];
  try {
    writeRoadmapRows(ops, { kind: "DRAFT", roadmapId: b.roadmap.id, version: b.roadmap.version + 1, plan: redated.plan, feasibility: redated.feasibility, now, makeId: e.makeId }, modelTextContextOf(b, fresh, true));
  } catch (err) {
    if (!(err instanceof ModelTextError)) throw err;
    logRefusedWrite("create-from-suggestion", err);
    return fail(CHANGE_NOT_SAVED);
  }
  ops.push(...realisticDateOps(b.roadmap, redated.feasibility, now));
  const out = await e.store.apply(userId, ops);
  return out === "ok" ? ok({ domainId: d.id, created }) : "stale";
}

/** One remedy tap: rewrite the draft (roadmap-realism applyRemedy) and re-run the engine; moving the date moves the aim's date. */
export async function applyRemedyCore(userId: string, roadmapId: string, remedy: Remedy, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (remedy !== "MOVE_DATE" && remedy !== "REFIT_LIGHT" && remedy !== "MOVE_TO_LATER" && remedy !== "USE_REALISTIC_DATE" && remedy !== "LOWER_DEPTH") return fail("Pick a remedy.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    const group = draftRowsOf(b);
    if (group.length === 0) return fail("There's no draft to change.");
    // Keep the depth, move the date (F-R4-11): a depth plan is offered the realistic date and a lower depth, never a fitted-down plan.
    if (depthOf(b.roadmap) != null) return useRealisticDate(e, userId, b, remedy, now);
    if (remedy === "USE_REALISTIC_DATE" || remedy === "LOWER_DEPTH") return fail("That remedy is for a plan aimed at a depth.");
    const ctx = await planContext(e, userId, b.roadmap, now);
    // The milestones already carried, at their one due day and without a row their copy replaces (fix round 2).
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const drafts = group.map(draftOf);
    const input = realismInputOf(ctx, [...carried, ...drafts]);
    const changed = e.lanes.applyRemedy([...carried, ...drafts], input, remedy).filter((d) => !isCarried(d));
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } }];
    if (remedy === "MOVE_DATE") {
      // R2's remedyTargetDay (inside applyRemedy) picks the first Sunday that fits, at most today + SPAN_MAX_DAYS.
      const last = changed.filter((d) => d.status !== "LATER" && d.dueDay).map((d) => d.dueDay as DayKey).sort().pop();
      const moved = changed.some((d) => drafts.find((x) => x.lineageId === d.lineageId)?.dueDay !== d.dueDay);
      if (!last || !moved) return fail("No date within 3 years makes this plan fit — lower the targets or move milestones to Later.");
      if (daysBetween(ctx.today, last) > SPAN_MAX_DAYS) return fail("Moving the date would pass 3 years; lower the targets or move milestones to Later.");
      if (last !== b.roadmap.targetDay) ops.push({ op: "update", table: "roadmap", where: { id: roadmapId }, data: { targetDay: last, updatedAt: now } });
    }
    if (remedy === "REFIT_LIGHT") ops.push({ op: "update", table: "roadmap", where: { id: roadmapId }, data: { intensity: "LIGHT", updatedAt: now } });
    const ctxText = modelTextContextOf(b, ctx.tree);
    try {
      for (const row of group) {
        const after = changed.find((d) => d.id === row.id) ?? changed.find((d) => d.lineageId === row.lineageId);
        if (!after) continue;
        writeRoadmapRows(ops, { kind: "REWRITE", before: row, after: { ...after, status: after.status === "LATER" ? "LATER" : "DRAFT" }, now, makeId: e.makeId, decided: new Set() }, ctxText);
      }
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("remedy", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * A depth plan's date remedy (F-R4-11): [Use <D_real>] (USE_REALISTIC_DATE;
 * rev 3's MOVE_DATE is retargeted to it) sets the aim's date to the realistic
 * one — on a DRAFT roadmap as the app's date (REALISTIC, so later copy says
 * "the date the app set"), on a re-plan as the date — and re-dates the
 * draft's stages. REFIT_LIGHT and MOVE_TO_LATER are never offered on a depth
 * plan (one lowers targets, the other drops the depth stage); LOWER_DEPTH has
 * its own sheet and action (lowerDepthCore).
 */
async function useRealisticDate(e: Env, userId: string, b: RoadmapBundle, remedy: Remedy, now: Date): Promise<Result<null> | "stale"> {
  if (remedy === "LOWER_DEPTH") return fail("Choose the lower depth in its sheet.");
  if (remedy !== "USE_REALISTIC_DATE" && remedy !== "MOVE_DATE") return fail("A plan aimed at a depth keeps its depth: use the realistic date, or choose a lower depth.");
  const group = draftRowsOf(b);
  const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b));
  const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
  const drafts = group.map(draftOf);
  const required = requiredDomainsOf(b, group);
  const f = feasibilityFor(e, ctx, drafts, carried);
  const day = f.dateCheck?.D_real ?? null;
  if (!day) return fail("The realistic date can't be worked out yet: add a pace for new cards, or pick a date.");
  if (daysBetween(ctx.today, day) > SPAN_MAX_DAYS) return fail("At your pace this depth is realistic in more than 3 years. Narrow the aim to fewer Domains, write more cards a week, or choose a lower depth.");
  const draftRoadmap = b.roadmap.status === "DRAFT";
  const intake: Intake = { ...ctx.intake, targetDay: day, dateMode: draftRoadmap ? "REALISTIC" : "CHOSEN" };
  const redated = redraftOf(e, { ...ctx, intake }, drafts, carried, required);
  if (!redated.ok) return fail(redated.error);
  const ops: StoreOp[] = [
    { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } },
    { op: "update", table: "roadmap", where: { id: b.roadmap.id }, data: { targetDay: day, ...(draftRoadmap ? { dateMode: "REALISTIC" } : {}) } },
  ];
  try {
    writeRoadmapRows(ops, { kind: "DRAFT", roadmapId: b.roadmap.id, version: b.roadmap.version + 1, plan: redated.plan, feasibility: redated.feasibility, now, makeId: e.makeId }, modelTextContextOf(b, ctx.tree, true));
  } catch (err) {
    if (!(err instanceof ModelTextError)) throw err;
    logRefusedWrite("remedy", err);
    return fail(CHANGE_NOT_SAVED);
  }
  const out = await e.store.apply(userId, ops);
  return out === "ok" ? ok(null) : "stale";
}

// ═══ Accept (F9) ════════════════════════════════════════════════════════════

const NAME_OF_KIND: Readonly<Record<ItemKind, string>> = { DOMAIN: "Domain", TOPIC: "topic", PRACTICE: "practice", STEP: "step", CHECKPOINT: "checkpoint", GAP: "area suggestion" };

/** What still stops an acceptance, in words, and the first thing to decide. */
export interface AcceptCheck {
  blockers: string[];
  /** An item id (or the milestone's id for its title) the footer scrolls to: draftNeedsOf(the next milestone)'s first row (fix round 2). */
  nextToDecide: string | null;
  nextLineageId: string | null;
  /** Any OVER: needs "Keep it over my hours/pace". */
  needsOver: boolean;
}

/**
 * Accept is offered when (F9): the next milestone has every item decided,
 * every proposed Domain resolved, a PAYS measure and a bar for its kept
 * checkpoint; no milestone (outline included) is IMPOSSIBLE; and any OVER
 * has its switch on (needsOver, decided by the caller). Later milestones are
 * an outline and need no decision.
 */
export function acceptBlockersOf(drafts: readonly MilestoneDraft[], feasibility: Feasibility | null, scheduledTotal: number, opts: { picksNeedConfirm?: boolean } = {}): AcceptCheck {
  const blockers: string[] = [];
  // Revision 4 (F-R4-17, F-R4-21): Gemini's Domain additions and a body or care plan's session picks are decided for the
  // whole plan, before anything else; a pending one blocks accept, and "Next item to decide" scrolls to it.
  const pendingAdd = drafts.flatMap((d) => d.items.filter(pendingAddition));
  const pendingPicks = opts.picksNeedConfirm ? drafts.flatMap((d) => d.items.filter(pendingPick)) : [];
  if (pendingAdd.length) blockers.push(DECIDE_ADDITIONS);
  if (pendingPicks.length) blockers.push(CONFIRM_PICKS);
  // A held stage ("Held when you began") is never the milestone to decide.
  const next = drafts.find((d) => d.status !== "LATER" && !heldRow(d)) ?? null;
  if (!next) blockers.push("There's no milestone to accept.");
  else {
    const place = `milestone ${next.ord}`;
    if (!next.title.trim()) blockers.push(`Name ${place}.`);
    else if (next.titleDecision === "PENDING" && provenanceOf(next.titleOrigin, next.titleDecision) === "DRAFT") blockers.push(`Decide the title of ${place}.`);
    for (const it of next.items) {
      // An area suggestion never blocks; a pending addition is the plan-level blocker above.
      if (it.kind === "GAP" || pendingAddition(it)) continue;
      if (it.kind === "DOMAIN" && liveItem(it) && !it.domainId) blockers.push(`Create, map or drop the proposed Domain “${it.proposedName ?? it.label}”.`);
      else if (isUndecidedItem(it)) blockers.push(`Decide the ${NAME_OF_KIND[it.kind]} “${it.label}” in ${place}.`);
      else if (it.kind === "CHECKPOINT" && liveItem(it) && (it.bar == null || it.outOf == null)) blockers.push(`Set the bar for the checkpoint “${it.label}”.`);
    }
    if (!next.measures.some((x) => x.role === "PAYS")) blockers.push(`No measurable part in ${place} — add a Domain or a practice.`);
  }
  // The footer's target is the one definition of what the next milestone still needs (roadmap-types draftNeedsOf), in the page's order.
  const nextToDecide = pendingAdd[0]?.id ?? pendingPicks[0]?.id ?? (next ? (draftNeedsOf(next)[0]?.id ?? null) : null);
  if (feasibility?.impossible) blockers.push("A milestone can't be done by its date as planned — use a remedy or change it.");
  // Keep the depth, move the date (F-R4-11): an IMPOSSIBLE date refuses accept for that depth and date.
  if (feasibility?.dateCheck?.verdict === "IMPOSSIBLE") blockers.push(DATE_IMPOSSIBLE);
  if (scheduledTotal > MAX_MILESTONES) blockers.push(`A roadmap holds at most ${MAX_MILESTONES} milestones; move some to Later.`);
  return { blockers, nextToDecide, nextLineageId: next?.lineageId ?? null, needsOver: !!feasibility?.over || feasibility?.dateCheck?.verdict === "OVER" };
}

/** Revision 4 accept refusals, in words. */
export const DECIDE_ADDITIONS = "Decide Gemini's suggested Domains first: add them or leave them out.";
export const CONFIRM_PICKS = "Confirm Gemini's session picks first: keep them, or use easy, mobility and technique sessions.";
export const DATE_IMPOSSIBLE = "Your date is before the earliest this depth can be reached: use the realistic date, or choose a lower depth.";
export const NOTHING_LEFT = "You already hold this depth in these Domains. Add a Domain, raise coverage or set a different aim.";
export const ONLY_WEEKS_AWAY = "This depth is only weeks away: add a Domain, raise coverage or choose a deeper aim.";

/** The first scheduled rankIndex each lineage got (rows of accepted versions; DRAFT and DISCARDED rows never count). */
function firstRankByLineage(b: RoadmapBundle): Record<string, number> {
  const out: Record<string, { v: number; at: number; rank: number }> = {};
  for (const m of b.milestones) {
    if (m.rankIndex == null || m.status === "DRAFT" || m.status === "DISCARDED") continue;
    const cur = out[m.lineageId];
    const at = m.createdAt.getTime();
    if (!cur || m.version < cur.v || (m.version === cur.v && at < cur.at)) out[m.lineageId] = { v: m.version, at, rank: m.rankIndex };
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.rank]));
}

function cardLabel(ctx: Pick<PlanContext, "domains">, domainIds: readonly string[], level: number): string {
  const names = domainNamesOf(ctx, domainIds).map(String);
  return `${names.length ? names.join(", ") : "Domains removed"} · cards at level ${level}+`;
}

/**
 * The aim's end state as accepted: per card scope, the card measure of the
 * last scheduled milestone on it (carried rows included). Its baseline is
 * anchored at the earliest live acceptance that held the same key; a key the
 * re-plan introduced takes the live value now.
 */
function endStateFor(
  ctx: PlanContext,
  plan: readonly { draft: MilestoneDraft; ord: number }[],
  acceptances: readonly AcceptanceRec[]
): EndStateTerm[] {
  const byScope = new Map<string, { ord: number; m: MeasureSpec }>();
  for (const { draft, ord } of plan) {
    if (draft.status === "LATER") continue;
    for (const x of draft.measures) {
      if (x.kind !== "CARDS_AT_LEVEL" || x.role !== "PAYS" || x.minLevel == null || !x.scope.domainIds?.length) continue;
      const key = scopeKeyOf(x.scope.domainIds);
      const cur = byScope.get(key);
      if (!cur || ord >= cur.ord) byScope.set(key, { ord, m: x });
    }
  }
  const anchored = new Map<string, EndStateTerm>();
  for (const a of acceptances) {
    if (a.undoneAt) continue;
    for (const t of endStateOf(a)) if (!anchored.has(t.measureKey)) anchored.set(t.measureKey, t);
  }
  const out: EndStateTerm[] = [];
  for (const { m } of byScope.values()) {
    const ids = m.scope.domainIds ?? [];
    const level = m.minLevel as number;
    const key = m.measureKey ?? cardsAtLevelKey(ids, level);
    const prior = anchored.get(key);
    out.push({
      measureKey: key,
      target: m.target,
      baseline: prior ? prior.baseline : liveCount(ctx, ids, level).value,
      baselineDay: prior ? prior.baselineDay : ctx.today,
      label: cardLabel(ctx, ids, level),
    });
  }
  return out.sort((a, b) => a.measureKey.localeCompare(b.measureKey));
}

/**
 * R's coverage (F-R4-9): R2's coverageOf over each Domain's live recall cards
 * AT INTAKE, the outline lines' Domains and the typed figures. The counts are
 * frozen (fix round, contracts §15.3; roadmap-types frozenCoverageCountsOf):
 * a Domain already in `prior` — the current live acceptance's breakdown, or
 * on a first acceptance the draft rows' — keeps its stored live and
 * nonRecall, and only a Domain newly in R reads today's library. So archiving
 * cards, a card turning multiple choice, or writing more cards never moves
 * n_d at a re-plan's accept or a lowered depth, and never turns a typed
 * figure into a false coverage choice.
 */
function coverageFor(e: Env, ctx: Pick<PlanContext, "domains" | "intake">, required: readonly string[], prior: readonly CoverageBreakdown[] | null = null): CoverageBreakdown[] {
  const frozen = new Map(frozenCountsOf(ctx, required, prior).map((c) => [c.id, c]));
  const domains = required.map((id) => {
    const c = frozen.get(id) ?? { live: 0, nonRecall: 0 };
    return { id, name: ctx.domains.get(id)?.name ?? "", live: c.live, nonRecall: c.nonRecall };
  });
  const lines = ctx.intake.syllabus?.lines ?? [];
  const lineDomains = lines.map((_, i) => ctx.intake.syllabus?.lineDomains?.[i] ?? null);
  return e.lanes.coverageOf({ domains, lineDomains, typed: ctx.intake.coverage ?? null });
}

/** Each Domain's live recall cards and multiple-choice cards in today's library (an unknown type counts as recall), the counts coverage reads. */
function todayCountsOf(ctx: Pick<PlanContext, "domains">, required: readonly string[]): CoverageCounts[] {
  return required.map((id) => {
    const cards = ctx.domains.get(id)?.cards ?? [];
    const nonRecall = cards.filter((c) => c.type != null && !isRecallType(c.type)).length;
    return { id, live: cards.length - nonRecall, nonRecall };
  });
}

/**
 * The counts R's coverage reads, frozen at intake (contracts §15.3): `prior`'s
 * stored live and nonRecall for a Domain it holds, today's for a Domain new
 * to R. One reading for every reader (fix round 2, contracts §16.9): the
 * acceptance's end state (coverageFor), a redrafted ladder's stage targets
 * (ladderOf → StageLadderOpts.counts) and the additions' date effect
 * (dateEffectOf's counts), so a re-plan's final stage asks for exactly the
 * end state's n_d whatever was archived or written since.
 */
function frozenCountsOf(ctx: Pick<PlanContext, "domains">, required: readonly string[], prior: readonly CoverageBreakdown[] | null | undefined): CoverageCounts[] {
  return frozenCoverageCountsOf(todayCountsOf(ctx, required), prior ?? null);
}

/** The coverage a re-plan's draft and its acceptance freeze to (contracts §15.3): the current live acceptance's breakdown; null before the first acceptance. */
function coveragePriorOf(b: RoadmapBundle): CoverageBreakdown[] | null {
  if (b.roadmap.version < 1) return null;
  const c = feasibilityOfAcceptance(currentAcceptance(b))?.coverage;
  return Array.isArray(c) ? c : null;
}

/** The coverage a draft's rows were written with (each row's stored feasibility carries it; the first acceptance freezes to it). */
function draftCoverageOf(rows: readonly MilestoneRec[]): CoverageBreakdown[] | null {
  for (const m of rows) {
    const c = m.feasibility && typeof m.feasibility === "object" ? (m.feasibility as { coverage?: unknown }).coverage : undefined;
    if (Array.isArray(c)) return c as CoverageBreakdown[];
  }
  return null;
}

/**
 * A depth plan's end state (F-R4-9; endStateFor reads the depth terms, not
 * the last milestone's measure): R2's depthTermsOf — one term per Domain of R,
 * `CARDS_AT_LEVEL|d:<id>|L<L*>|rc`, target n_d, targetSource DEPTH or YOURS —
 * never scaled by intensity, fitted or lowered by a remedy. Each baseline is
 * the live recall count at L* (a key an earlier live acceptance held keeps its
 * baseline). Should R2's terms be unavailable, the final stage's paying card
 * measures stand in: the final milestone is the depth.
 */
function depthEndStateOf(e: Env, ctx: PlanContext, depth: AimDepth, required: readonly string[], plan: readonly MilestoneDraft[], acceptances: readonly AcceptanceRec[], coverage: readonly CoverageBreakdown[] | null): EndStateTerm[] {
  const anchored = new Map<string, EndStateTerm>();
  for (const a of acceptances) {
    if (a.undoneAt) continue;
    for (const t of endStateOf(a)) if (!anchored.has(t.measureKey)) anchored.set(t.measureKey, t);
  }
  const baselines: Record<string, number> = {};
  for (const id of required) baselines[id] = liveCount(ctx, [id], depth, true).value;
  let terms: EndStateTerm[] = [];
  try {
    if (coverage) terms = e.lanes.depthTermsOf(depth, coverage, baselines, ctx.today);
  } catch (err) {
    console.error("roadmap: the depth terms weren't worked out (the final stage's measures stand in):", err instanceof Error ? err.message : err);
  }
  if (terms.length === 0) {
    const final = [...plan].filter((m) => m.status !== "LATER").sort((a, b) => a.ord - b.ord).pop();
    for (const x of final?.measures ?? []) {
      if (x.kind !== "CARDS_AT_LEVEL" || x.role !== "PAYS" || x.minLevel == null || !x.scope.domainIds?.length) continue;
      const key = x.measureKey ?? cardsAtLevelKey(x.scope.domainIds, x.minLevel, x.minLevel === depth ? "rc" : "r");
      terms.push({ measureKey: key, target: x.target, baseline: liveCountOfKey(ctx, key)?.value ?? 0, baselineDay: ctx.today, label: cardLabel(ctx, x.scope.domainIds, x.minLevel), targetSource: x.targetSource });
    }
  }
  return terms
    .map((t) => {
      const prior = anchored.get(t.measureKey);
      return prior ? { ...t, baseline: prior.baseline, baselineDay: prior.baselineDay } : t;
    })
    .sort((a, b) => a.measureKey.localeCompare(b.measureKey));
}

/**
 * What a depth plan's acceptance records for good (decisions 46, 53; F-R4-11):
 *   coverageChoices  every Domain whose typed figure is below the policy, with the day it was first recorded —
 *                    a choice is the user's typing (decision 53): one already recorded with the same figure stands
 *                    (its day kept); a new one is recorded only when the typed figure is new or changed since the
 *                    previous acceptance (fix round, contracts §15.3), so a policy that moved under an unchanged
 *                    figure never makes a false "your choice";
 *   depthChoice      a lowered depth, carried from the previous acceptance;
 *   domainOrigins    how each Domain of R joined it (INTAKE, GEMINI_NEEDS, GEMINI_GAP) and on which day.
 */
function depthRecordsOf(b: RoadmapBundle, rows: readonly MilestoneBundle[], required: readonly string[], coverage: readonly CoverageBreakdown[] | null, today: DayKey): Pick<Feasibility, "coverageChoices" | "depthChoice" | "domainOrigins"> {
  const prev = feasibilityOfAcceptance(currentAcceptance(b));
  const prevTypedOf = (id: string): number | null | undefined => {
    const c = Array.isArray(prev?.coverage) ? prev?.coverage.find((x) => x && x.domainId === id) : undefined;
    return c ? (typeof c.typed === "number" ? c.typed : null) : undefined;
  };
  const coverageChoices: CoverageChoice[] = [];
  for (const c of coverage ?? []) {
    if (!c.belowPolicy || c.typed == null) continue;
    const before = prev?.coverageChoices?.find((x) => x.domainId === c.domainId && x.typed === c.typed);
    if (before) {
      coverageChoices.push({ domainId: c.domainId, policy: c.policy, typed: c.typed, day: before.day });
      continue;
    }
    // No acceptance yet, a Domain new to R, or an acceptance stored before the fix round: the figure is the user's now.
    const typedBefore = prev ? prevTypedOf(c.domainId) : undefined;
    if (typedBefore !== undefined && typedBefore === c.typed) continue;
    coverageChoices.push({ domainId: c.domainId, policy: c.policy, typed: c.typed, day: today });
  }
  const domainOrigins: DomainOrigins = {};
  for (const id of required) {
    const known = prev?.domainOrigins?.[id];
    if (known) {
      domainOrigins[id] = known;
      continue;
    }
    const item = rows.flatMap((m) => m.items).find((i) => i.kind === "DOMAIN" && i.domainId === id && i.decision !== "REMOVED" && (i.notes.includes("NOT_CHOSEN") || i.notes.includes("FROM_SUGGESTION")));
    const by: DomainOrigins[string]["by"] = b.roadmap.domainIds.includes(id) || !item ? "INTAKE" : item.notes.includes("FROM_SUGGESTION") ? "GEMINI_GAP" : "GEMINI_NEEDS";
    domainOrigins[id] = { by, day: by === "INTAKE" ? (b.roadmap.firstAcceptedDay ?? today) : item?.decidedAt ? dayKeyOf(item.decidedAt) : today };
  }
  // A depth lowered on the draft rides its rows' feasibility until this acceptance records it (lowerDepthCore).
  const draftChoice = rows.map((m) => (m.feasibility as { depthChoice?: DepthChoice } | null)?.depthChoice).find((x) => !!x && typeof x === "object") ?? null;
  return { coverageChoices, depthChoice: prev?.depthChoice ?? draftChoice, domainOrigins };
}

/** "the re-plan lowered the end target 30 → 25", from two end states. */
function endStateChanges(before: readonly EndStateTerm[], after: readonly EndStateTerm[]): string[] {
  const out: string[] = [];
  const prev = new Map(before.map((t) => [t.measureKey, t]));
  for (const t of after) {
    const p = prev.get(t.measureKey);
    if (!p) out.push(`new end target: ${t.target} ${t.label}`);
    else if (p.target !== t.target) out.push(`end target ${p.target} → ${t.target} (${t.label})`);
    prev.delete(t.measureKey);
  }
  for (const p of prev.values()) out.push(`end target dropped: ${p.label}`);
  return out;
}

/** The latest stored reading of a key (≤ today). */
function latestOf(readings: readonly Reading[], key: string, today: DayKey): Reading | null {
  let best: Reading | null = null;
  for (const r of readings) {
    if (r.measureKey !== key || r.day > today) continue;
    if (!best || r.day > best.day || (r.day === best.day && r.observedAt > best.observedAt)) best = r;
  }
  return best;
}

/**
 * One array transaction: the lock; guards (no other ACTIVE, version = v − 1);
 * ACTIVE at v; DRAFT → PLANNED with ords after the carried rows; the previous
 * PLANNED → SUPERSEDED; baselines; rankIndex (assignRankIndices, DRAFT rows
 * only); the RoadmapAcceptance row; the first readings and PROFICIENCY (R1's
 * proficiencyReadingFor on the new basis, rebased against a re-plan's
 * previous reading).
 *
 * Revision 4:
 *   - a legacy draft (a row with no stage) refuses ("Draft it again first");
 *   - a pending Domain addition or session pick, and an IMPOSSIBLE date, refuse;
 *     an OVER date needs the switch;
 *   - a depth plan with nothing left to do (its final stage held, or the
 *     realistic date under SPAN_MIN_DAYS away) refuses;
 *   - a held stage becomes PLANNED with reachedDay the acceptance day (never
 *     startable, no rank);
 *   - a re-planned row of a carried lineage (a "Start again" copy) takes that
 *     carried row's ord, and the rest are numbered after the carried rows, so
 *     the last ord is the plan's positions (fix round 2's carry-over);
 *   - ranks by stage (rankIndexForStage via R1's assignRankIndices);
 *   - the end state is the depth terms; the acceptance's feasibility carries
 *     the reach model, the date check (with the user's choice), the coverage
 *     choices, the depth choice and domainOrigins; dateMode → CHOSEN, and a
 *     REALISTIC date becomes the realistic one.
 */
export async function acceptCore(userId: string, roadmapId: string, choices: AcceptChoices, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ version: number }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const overAccepted = !!(choices && typeof choices === "object" && choices.overAccepted === true);
  const res = await withRetry<{ version: number }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    const others = (await e.store.listRoadmaps(userId)).filter((r) => r.status === "ACTIVE" && r.id !== roadmapId);
    if (others.length) return fail(ANOTHER_ACTIVE);
    const group = draftRowsOf(b);
    if (group.length === 0) return fail("There's no draft to accept.");
    // A plan made before revision 4 is drafted again at a depth before it can be accepted (F-R4-16).
    if (legacyDraftOf(b)) return fail(DRAFT_IT_AGAIN);
    const cur = b.roadmap.version;
    const v = cur + 1;
    // The re-plan saw the plan as it was when its rows were written (fix round): a milestone started since (one of
    // its own positions, or a "Start again" copy), or a copy made since, makes it stale — never two rows of one position.
    const draftSince = new Date(Math.min(...group.map((m) => m.createdAt.getTime())));
    const startedSince = b.milestones.filter((m) => isCarried(m) && m.startingAt != null && m.startingAt.getTime() > draftSince.getTime()).sort(byOrd)[0];
    if (startedSince) return fail(`Milestone ${startedSince.ord} started since this re-plan was drafted — re-plan again.`);
    const groupLineages = new Set(group.map((m) => m.lineageId));
    if (b.milestones.some((m) => m.version === cur && cur >= 1 && (m.status === "PLANNED" || m.status === "LATER") && !groupLineages.has(m.lineageId) && m.createdAt.getTime() > draftSince.getTime())) {
      return fail(REPLAN_STALE);
    }
    // The coverage counts frozen at intake (contracts §15.3): the live acceptance's, or on a first acceptance the draft rows'.
    const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b) ?? draftCoverageOf(group));
    const carriedRows = planRowsOf(b).filter(isCarried);
    // What the engine, the end state and the basis read: the carried rows at their one due day, none a copy replaces (fix round 2).
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const drafts = group.map(draftOf);
    const depth = depthOf(b.roadmap);
    const required = requiredDomainsOf(b, group);
    const feasibility = feasibilityFor(e, ctx, drafts, carried);
    // Positions, not rows: a dropped row and its "Start again" copy are one milestone (F12; roadmap-types positionCountOf).
    const scheduledTotal = positionCountOf([...carriedRows, ...group.filter(scheduled)]);
    if (depth != null) {
      // A plan with nothing left to do is refused at acceptance too (F-R4-10, decision 41), before any row's decisions.
      const kept = drafts.filter((d) => d.status !== "LATER");
      const finalRow = [...kept].sort((x, y) => (gateLevelOf(y) ?? 0) - (gateLevelOf(x) ?? 0))[0];
      if (kept.length > 0 && (kept.every(heldRow) || (finalRow && heldRow(finalRow) && (gateLevelOf(finalRow) ?? 0) >= depth))) return fail(NOTHING_LEFT);
      const real = feasibility.dateCheck?.D_real ?? null;
      if (real && daysBetween(ctx.today, real) < SPAN_MIN_DAYS && carriedRows.length === 0) return fail(ONLY_WEEKS_AWAY);
    }
    const check = acceptBlockersOf(drafts, feasibility, scheduledTotal, { picksNeedConfirm: picksNeedConfirmOf(b.roadmap) });
    if (check.blockers.length) return fail(check.blockers[0]);
    if (check.needsOver && !overAccepted) return fail("This plan is over your hours or pace: switch on “Keep it over my hours/pace” to accept it.");

    // Ords (fix round 2's carry-over): a draft row whose lineage has a carried row (a "Start again" copy re-planned) takes
    // that row's ord — one position, one number — and the others follow the carried rows, so the last ord is the plan's positions.
    const baseOrd = Math.max(0, ...carriedRows.map((m) => m.ord));
    const carriedOrdOf = new Map<string, number>();
    for (const m of carriedRows) if (!carriedOrdOf.has(m.lineageId) || m.ord < (carriedOrdOf.get(m.lineageId) as number)) carriedOrdOf.set(m.lineageId, m.ord);
    const newOrd = new Map<string, number>();
    let nextOrd = baseOrd;
    for (const m of group) newOrd.set(m.id, carriedOrdOf.get(m.lineageId) ?? ++nextOrd);
    // One rank place per lineage: a carried row whose position the draft re-plans (a dropped row whose copy is in the
    // draft) gives its place to the draft row, and of two carried rows of one lineage the newest keeps it. A depth
    // plan ranks by stage (rankIndexForStage); a held stage's index is for display only and gives no rank.
    const rankCarried = onePerLineage(carriedRows.filter((m) => !groupLineages.has(m.lineageId)));
    const rankRows = [
      ...rankCarried.map((m) => ({
        id: m.id,
        lineageId: m.lineageId,
        ord: m.ord,
        carried: true,
        later: false,
        rankIndex: m.rankIndex,
        stage: m.stage ?? null,
        gateLevel: gateLevelOf(draftOf(m)),
        held: heldRow(m),
      })),
      ...group.map((m) => {
        const d = drafts.find((x) => x.id === m.id) as MilestoneDraft;
        return { id: m.id, lineageId: m.lineageId, ord: newOrd.get(m.id) as number, carried: false, later: m.status === "LATER", rankIndex: null, stage: m.stage ?? null, gateLevel: gateLevelOf(d), held: heldRow(d) };
      }),
    ];
    const ranks = rankIndicesOf(e, rankRows, firstRankByLineage(b), depth);

    const planForEnd = [
      ...carried.map((d) => ({ draft: d, ord: d.ord })),
      ...drafts.map((d) => ({ draft: d, ord: newOrd.get(d.id as string) as number })),
    ];
    let coverage: CoverageBreakdown[] | null = null;
    if (depth != null) {
      try {
        coverage = coverageFor(e, ctx, required, ctx.coveragePrior ?? null);
      } catch (err) {
        console.error("roadmap: coverage not worked out at acceptance:", err instanceof Error ? err.message : err);
      }
    }
    const endState =
      depth != null ? depthEndStateOf(e, ctx, depth, required, [...carried, ...drafts], b.acceptances, coverage) : endStateFor(ctx, planForEnd, b.acceptances);
    // The acceptance keeps R's coverage breakdown too (the Depth line reads it for the plan's life; no column: it rides the JSON).
    const stored: Feasibility & { coverage?: CoverageBreakdown[] } =
      depth != null ? { ...feasibility, ...depthRecordsOf(b, group, required, coverage, ctx.today), ...(coverage ? { coverage } : {}) } : feasibility;

    const roadmapData: Record<string, unknown> = { status: "ACTIVE", version: v, firstAcceptedDay: b.roadmap.firstAcceptedDay ?? ctx.today, updatedAt: now };
    if (depth != null) {
      // REALISTIC exists only on a DRAFT: acceptance fixes the realistic date as the aim's, and dateOrigin keeps who set it.
      const realistic = dateModeOf(b.roadmap) === "REALISTIC" ? (feasibility.dateCheck?.D_real ?? null) : null;
      roadmapData.dateMode = "CHOSEN";
      if (realistic) roadmapData.targetDay = realistic;
    }
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "NO_OTHER_ACTIVE", exceptId: roadmapId } },
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: cur } },
      // A Start racing this accept (after the read above) makes it stale: re-read, and the check above refuses.
      { op: "guard", guard: { g: "NOTHING_STARTED_SINCE", roadmapId, since: draftSince } },
      { op: "update", table: "roadmap", where: { id: roadmapId, version: cur }, data: roadmapData },
    ];
    if (cur >= 1) ops.push({ op: "update", table: "roadmapMilestone", where: { roadmapId, version: cur, status: { in: ["PLANNED", "LATER"] } }, data: { status: "SUPERSEDED" } });
    const readingRows: ReadingRow[] = [];
    const next = group.find((g) => g.status !== "LATER" && !heldRow(drafts.find((x) => x.id === g.id) as MilestoneDraft)) ?? null;
    for (const row of group) {
      const d = drafts.find((x) => x.id === row.id) as MilestoneDraft;
      const f = feasibility.milestones.find((x) => x.lineageId === row.lineageId) ?? null;
      const over = !!f && (f.worst === "OVER" || f.time.verdict === "OVER");
      const held = heldRow(d);
      ops.push({
        op: "update",
        table: "roadmapMilestone",
        where: { id: row.id, status: row.status },
        data: {
          status: row.status === "LATER" ? "LATER" : "PLANNED",
          ord: newOrd.get(row.id),
          rankIndex: row.status === "LATER" ? null : (ranks[row.id] ?? null),
          overAccepted: overAccepted && over,
          feasibility: feasibilityJson(f, d.notes),
          // "Held when you began" (F-R4-10): reached on the acceptance day, never startable; it gives no rank.
          ...(held ? { reachedDay: ctx.today } : {}),
        },
      });
      for (const x of row.measures) {
        if (x.kind !== "CARDS_AT_LEVEL" || x.minLevel == null) continue;
        const ids = scopeOf(x.scope).domainIds ?? [];
        if (!ids.length) continue;
        // A stage measure keeps the key R2 wrote it with (its `r` or `rc` segment), or gets one (rc at the depth, r below);
        // a rev-3 row's key has none.
        const key = row.stage == null ? cardsAtLevelKey(ids, x.minLevel) : (x.measureKey ?? cardsAtLevelKey(ids, x.minLevel, depth != null && x.minLevel >= depth ? "rc" : "r"));
        const live = liveCountOfKey(ctx, key) ?? liveCount(ctx, ids, x.minLevel);
        ops.push({ op: "update", table: "roadmapMeasure", where: { id: x.id }, data: { baseline: live.value, baselineDay: ctx.today, fittedTarget: x.target, measureKey: key } });
        // An `rc` key's first reading is R1's (clean entry needs the ledger); every other one is written now.
        const parsedKey = parseMeasureKey(key);
        if (row.id === next?.id && parsedKey?.kind === "CARDS_AT_LEVEL" && parsedKey.segment !== "rc") readingRows.push(measures.cardsReadingRow(key, ctx.today, live));
      }
    }
    for (const t of endState) {
      if (readingRows.some((r) => r.measureKey === t.measureKey)) continue;
      const parsed = parseMeasureKey(t.measureKey);
      if (parsed?.kind !== "CARDS_AT_LEVEL" || parsed.segment === "rc") continue;
      readingRows.push(measures.cardsReadingRow(t.measureKey, ctx.today, liveCount(ctx, parsed.domainIds, parsed.level, parsed.segment != null)));
    }
    ops.push({
      op: "insert",
      table: "roadmapAcceptance",
      rows: [
        {
          id: e.makeId(),
          roadmapId,
          version: v,
          day: ctx.today,
          acceptedAt: now,
          previousVersion: cur,
          feasibility: stored,
          endState,
          intervalMultiplier: ctx.m,
          overAccepted: overAccepted && (feasibility.over || feasibility.dateCheck?.verdict === "OVER"),
          undoneAt: null,
        },
      ],
    });

    const planAfter = [
      ...carried,
      ...drafts.map((d) => ({ ...d, ord: newOrd.get(d.id as string) as number, status: (d.status === "LATER" ? "LATER" : "PLANNED") as MilestoneStatus })),
    ];
    let basis: ProficiencyBasis | null = null;
    try {
      basis = e.lanes.proficiencyBasisOf({ basisVersion: v, endState, feasibility: stored, milestones: planAfter, switchedOff: switchedOffOf(carriedRows), heldDays: ctx.held });
    } catch (err) {
      console.error("roadmap: Proficiency basis not computed at acceptance:", err);
    }
    if (basis) {
      const prof = await proficiencyFor(e, deps, userId, roadmapId, now, basis, cur >= 1 ? "REPLAN" : "ACCEPTED", practiceNamesOf([...carriedRows, ...group]));
      if (prof) readingRows.push(prof);
    }
    if (readingRows.length) ops.push({ op: "readings", rows: readingRows, observedAt: now });

    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ version: v }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/** One row as the rank assignment reads it (roadmap-types RankRow). */
type RankRowLike = Parameters<RoadmapLanes["assignRankIndices"]>[0][number];

/**
 * The rank indices of a version (F-R4-12): R1's assignRankIndices, given each
 * row's stage, gate level and held mark. On a depth plan a fresh stage row
 * gets rankIndexForStage with the plan's depth — a gate its stage's rank,
 * BETWEEN the gate below's, a PART below the depth its stage's, and a PART
 * toward the depth's own gate the rank of the gate two levels below (fix
 * round, contracts §15.4: a library holding Fluent never shows Virtuoso
 * before Mastered is reached) — never above the lineage's first value,
 * whatever a lane that doesn't read stages yet numbered it by place.
 *
 * R1's assignRankIndices takes the depth itself (its optional third argument,
 * roadmap-types AssignRankIndices; fix round 2, contracts §16.9), so the pass
 * below changes nothing when R1 ranks by stage; it stays as the guard for a
 * lane implementation that ignores the depth (roadmap-contract-check pins
 * that this file passes the depth to rankIndexForStage).
 */
function rankIndicesOf(
  e: Env,
  rows: readonly (RankRowLike & { stage: string | null; gateLevel: number | null; held: boolean })[],
  firstByLineage: Readonly<Record<string, number>>,
  depth: AimDepth | null
): Record<string, number | null> {
  const out = e.lanes.assignRankIndices(rows, firstByLineage, depth);
  if (depth == null) return out;
  for (const r of rows) {
    if (r.later || r.carried) continue;
    const byStage = rankIndexForStage(r.stage, r.gateLevel, depth);
    if (byStage == null) continue;
    const first = firstByLineage[r.lineageId];
    out[r.id] = first != null ? Math.min(first, byStage) : byStage;
  }
  return out;
}

/** Practice lineages switched off at Start (addToToday false on carried rows): they leave the Proficiency basis. */
function switchedOffOf(rows: readonly MilestoneBundle[]): string[] {
  return rows.flatMap((m) => m.items.filter((i) => i.kind === "PRACTICE" && !i.addToToday && liveItem(i)).map((i) => i.lineageId));
}

/** Undo for ACCEPT_UNDO_MS, only while nothing has started since: restores the previous version and sets undoneAt, in one transaction. */
export async function undoAcceptCore(userId: string, roadmapId: string, version: number, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "ACTIVE" || b.roadmap.version !== version) return fail("That plan can't be undone any more.");
    const acc = currentAcceptance(b);
    if (!acc) return fail("That plan can't be undone any more.");
    // A record within the version (a lowered depth, previousVersion = version) is never an Undo-able acceptance.
    if (acc.previousVersion === acc.version) return fail("The depth was lowered on this plan since; re-plan instead.");
    if (now.getTime() - acc.acceptedAt.getTime() > ACCEPT_UNDO_MS + UNDO_SLACK_MS) return fail("Too late to undo; re-plan instead.");
    if (b.milestones.some((m) => m.startingAt && m.startingAt.getTime() > acc.acceptedAt.getTime())) return fail("A milestone has started since, so the plan stays.");
    const prev = version - 1;
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version } },
      { op: "guard", guard: { g: "ACCEPTANCE_OPEN", id: acc.id } },
      { op: "guard", guard: { g: "NOTHING_STARTED_SINCE", roadmapId, since: acc.acceptedAt } },
      { op: "update", table: "roadmapMilestone", where: { roadmapId, version, status: "PLANNED" }, data: { status: "DRAFT", rankIndex: null } },
      { op: "update", table: "roadmapMilestone", where: { roadmapId, version, status: "LATER" }, data: { rankIndex: null } },
    ];
    if (prev >= 1) {
      ops.push(
        { op: "update", table: "roadmapMilestone", where: { roadmapId, version: prev, status: "SUPERSEDED", dueDay: null }, data: { status: "LATER" } },
        { op: "update", table: "roadmapMilestone", where: { roadmapId, version: prev, status: "SUPERSEDED" }, data: { status: "PLANNED" } }
      );
    }
    ops.push(
      {
        op: "update",
        table: "roadmap",
        where: { id: roadmapId, version },
        data: prev >= 1 ? { version: prev, updatedAt: now } : { version: 0, status: "DRAFT", firstAcceptedDay: null, updatedAt: now },
      },
      { op: "update", table: "roadmapAcceptance", where: { id: acc.id }, data: { undoneAt: now } }
    );
    if (prev >= 1) {
      // The earlier plan's basis again, rebased (UNDO) against the reading the undone acceptance wrote.
      const prevAcc = [...b.acceptances].reverse().find((a) => a.version === prev && a.undoneAt == null) ?? null;
      const planRowsPrev = b.milestones.filter((m) => isCarried(m) || (m.version === prev && (m.status === "SUPERSEDED" || m.status === "PLANNED"))).sort(byOrd);
      const restored = planRowsPrev.map((m) => ({ ...draftOf(m), status: (m.status === "SUPERSEDED" ? (m.dueDay ? "PLANNED" : "LATER") : m.status) as MilestoneStatus }));
      try {
        const rest = await e.io.restRows(userId, todayKey(now), b.roadmap.targetDay);
        const basis = e.lanes.proficiencyBasisOf({
          basisVersion: prev,
          endState: endStateOf(prevAcc),
          feasibility: feasibilityOfAcceptance(prevAcc),
          milestones: restored,
          switchedOff: switchedOffOf(planRowsPrev.filter(isCarried)),
          heldDays: Array.from(heldDaysOf(rest, todayKey(now), b.roadmap.targetDay)),
        });
        const prof = await proficiencyFor(e, deps, userId, roadmapId, now, basis, "UNDO", practiceNamesOf(planRowsPrev));
        if (prof) ops.push({ op: "readings", rows: [prof], observedAt: now });
      } catch (err) {
        console.error("roadmap: Proficiency not written with the Undo:", err);
      }
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

// ═══ Start (F15) ════════════════════════════════════════════════════════════

/** A practice's rule (the item's, else its sessions as TARGET:n/W, DAILY at 7). */
function practiceRule(it: Pick<ItemDraft, "rule" | "sessionsPerWeek">): string {
  if (it.rule && parseRule(it.rule)) return it.rule;
  const s = Math.max(SESSIONS_MIN, Math.min(SESSIONS_MAX, it.sessionsPerWeek ?? 1));
  return s === 7 ? "DAILY" : `TARGET:${s}/W`;
}

const bandMinutes = (it: Pick<ItemDraft, "durationBand" | "method">): number =>
  practiceBandMinutes(it.durationBand ?? (it.method ? METHOD_DEFAULT_BAND[it.method] : "D30"));

/**
 * The stated pay's inputs that no Start switch moves (fix round, roadmap-types
 * StartPayBasis): the plan's other tracked minutes a week (reviews and new
 * cards over the Start weeks, otherTrackedMinutesOf), whether a paying card
 * measure exists, and the day the lineage paid. One arithmetic for the sheet
 * (recomputed on every switch), startPreview, finishStartCore's frozen goalMp
 * and R1's zero-reason read-back: statedForMilestone(startStatedInputOf(…)).
 */
export function payBasisOf(
  m: Pick<MilestoneDraft, "measures">,
  weeks: { weeks: readonly { reviewMin: number; newPerWeek: number }[] } | null,
  lineagePaidOn: DayKey | null
): StartPayBasis {
  return {
    otherMinutesPerWeek: weeks ? otherTrackedMinutesOf(weeks.weeks) : null,
    hasCards: m.measures.some((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS"),
    lineagePaidOn,
  };
}

/** The practices a milestone adds to Today (live, addToToday), each with its planned minutes a week (practiceMinutesPerWeekOf). */
function payPracticesOf(m: Pick<MilestoneDraft, "items">): { lineageId: string; weeklyMinutes: number }[] {
  return m.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && i.addToToday).map((i) => ({ lineageId: i.lineageId, weeklyMinutes: practiceMinutesPerWeekOf(i) }));
}

/** What a milestone states with these practices switched off: 6 or 0 and the reason (roadmap-economy statedForMilestone). */
export function statedFor(m: Pick<MilestoneDraft, "items" | "measures">, basis: StartPayBasis, off: Iterable<string> = []) {
  // Pay honesty (F-R4-13): the practices the app added, so the sheet can say when the 6 rests on one of them.
  const offSet = new Set(off);
  const added = m.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && i.addToToday && !offSet.has(i.lineageId) && (i.notes.includes("STUDY_ADDED") || i.notes.includes("PRODUCTION_ADDED")));
  return statedForMilestone({
    ...startStatedInputOf(basis, payPracticesOf(m), offSet),
    addedPracticeMinutesPerWeek: added.reduce((n, i) => n + practiceMinutesPerWeekOf(i), 0),
    addedPracticeName: added[0]?.label ?? null,
  });
}

/** "≈ 6.0" XP a session (F15): planCompletion against today's ledger, for the task Start would write (sized from its name, at its band's minutes, as insertCapture sizes it). null when it can't be priced. */
export function practicePriceOf(it: ItemDraft, track: Track, today: DayKey, ledger: DayLedger | null): number | null {
  if (!ledger) return null;
  try {
    const title = it.label.trim().replace(/\s+/g, " ");
    if (!title) return null;
    const minutes = bandMinutes(it);
    const sizing = sizeLexically(title, { tagTrack: track, minutes });
    const template: PricedTemplate = {
      id: `preview-${it.lineageId}`,
      title,
      normTitle: normTitleOf(title),
      recurrence: practiceRule(it),
      dueDay: null,
      dueKind: null,
      intrinsic: false,
      autoMetric: null,
      mvv: null,
      track,
      band: sizing.band,
      bandOverride: 0,
      estMinutes: Math.max(1, Math.min(EST_MINUTES_MAX, Math.round(minutes))),
      machineMinutes: Math.max(1, Math.round(sizing.machineMinutes)),
    };
    const xp = planCompletion({ template, day: today, today, slot: 0, ledger, streakDays: 0 }).receipt.xp;
    return Number.isFinite(xp) ? xp : null;
  } catch {
    return null;
  }
}

/** A rule the user picked, and the sessions a week it plans (kept in step, so the stated pay and its reason agree). */
function ruleSessions(rule: string): number {
  return Math.max(SESSIONS_MIN, Math.min(SESSIONS_MAX, Math.round(scheduledPerWeek(rule))));
}

/** The rows that go to Today at Start (F15), each with what it still needs: Start is offered only when none needs anything. */
export function todayBoundRowsOf(m: MilestoneDraft, practicesOff: ReadonlySet<string>): TodayBoundRow[] {
  const rows: TodayBoundRow[] = [];
  const titleClass = provenanceOf(m.titleOrigin, m.titleDecision);
  rows.push({ kind: "TITLE", itemId: null, label: m.title, class: titleClass, needs: labelTextOf(m.titleOrigin, m.titleDecision, m.title) ? "NONE" : "CHECK_OR_EDIT" });
  for (const it of m.items) {
    if (!liveItem(it)) continue;
    const cls: TextClass = provenanceOf(it.origin, it.decision);
    const settled = labelTextOf(it.origin, it.decision, it.label) != null;
    if (it.kind === "PRACTICE") {
      if (!it.addToToday || practicesOff.has(it.lineageId)) continue;
      rows.push({ kind: "PRACTICE", itemId: it.id, label: it.label, class: cls, needs: isPlaceholderItem(it) ? "NAME_IT" : settled ? "NONE" : "CHECK_OR_EDIT" });
    } else if (it.kind === "STEP") {
      rows.push({ kind: "STEP", itemId: it.id, label: it.label, class: cls, needs: settled ? "NONE" : "CHECK_OR_EDIT" });
    } else if (it.kind === "CHECKPOINT") {
      rows.push({ kind: "CHECKPOINT", itemId: it.id, label: it.label, class: cls, needs: settled ? "NONE" : "CHECK_OR_EDIT" });
    } else if (it.kind === "DOMAIN") {
      rows.push({ kind: "DOMAIN", itemId: it.id, label: it.label, class: cls, needs: settled && it.domainId ? "NONE" : "CHECK_OR_MAP" });
    }
  }
  return rows;
}

/** An item the Start sheet decides: a pending Gemini row, never an area suggestion (GAP rows live only in their panel, F-R4-19). */
const undecidedAtStart = (i: ItemDraft): boolean => i.kind !== "GAP" && isUndecidedItem(i);

function blockersOf(m: MilestoneDraft, rows: readonly TodayBoundRow[]): string[] {
  const out: string[] = [];
  if (!m.title.trim()) out.push("Name this milestone: its name is the goal's on Today.");
  if (m.items.some(undecidedAtStart) || (m.titleDecision === "PENDING" && provenanceOf(m.titleOrigin, m.titleDecision) === "DRAFT")) {
    out.push("Decide every item of this milestone first.");
  }
  for (const r of rows) {
    if (r.needs === "NAME_IT") out.push(NAME_THIS_PRACTICE);
    else if (r.needs === "CHECK_OR_MAP") out.push(`Gemini picked the Domain “${r.label}” — it sets what counts. Check it or map it.`);
    else if (r.needs === "CHECK_OR_EDIT") out.push(`“${r.label}” goes to Today in Gemini's words — check it or edit it.`);
  }
  const cp = m.items.find((i) => i.kind === "CHECKPOINT" && liveItem(i));
  if (cp && (cp.bar == null || cp.outOf == null)) out.push(`Set the bar for the checkpoint “${cp.label}”.`);
  return out;
}

/**
 * Applies the Start sheet's decisions and edits to a milestone in memory (the
 * milestone's own id is its title). As in the editor: a NUMBER title or item
 * can't be kept or checked, and an edit makes a row EDITED only when its
 * words changed (a bar or a scale alone leaves the decision as it was).
 */
function applySheet(m: MilestoneDraft, choices: StartChoices, b: RoadmapBundle, e: Env, tree: readonly TreeField[]): MilestoneDraft | string {
  let out: MilestoneDraft = { ...m, items: m.items.map((i) => ({ ...i })) };
  for (const [ref, decision] of Object.entries(choices.decisions ?? {})) {
    if (decision !== "KEPT" && decision !== "CHECKED" && decision !== "REMOVED") return "Pick Keep, I checked this or Remove.";
    if (ref === m.id) {
      if (decision === "REMOVED") return "A milestone keeps its title; edit it instead.";
      if (titleHasNumber(e, b, tree, m)) return TITLE_NUMBER;
      out = { ...out, titleDecision: decision };
      continue;
    }
    const it = out.items.find((i) => i.id === ref);
    if (!it) continue;
    if (decision !== "REMOVED" && it.flags.includes("NUMBER")) return "Gemini wrote a number here; edit it or remove it.";
    if (decision === "CHECKED" && it.kind === "DOMAIN" && !it.domainId) return "Create this Domain, map it to one of yours, or drop it.";
    it.decision = decision;
  }
  for (const [ref, edit] of Object.entries(choices.edits ?? {})) {
    if (!edit || typeof edit !== "object") continue;
    if (ref === m.id) {
      if (edit.label === undefined) continue;
      const l = userLabel(e, edit.label, "MILESTONE", b);
      if (!l.ok) return l.error;
      if (l.value !== out.title) out = { ...out, title: l.value, titleDecision: "EDITED" };
      continue;
    }
    const it = out.items.find((i) => i.id === ref);
    if (!it) continue;
    if (edit.label !== undefined) {
      const l = userLabel(e, edit.label, it.kind, b);
      if (!l.ok) return l.error;
      if (l.value !== it.label) {
        it.label = l.value;
        it.flags = [];
        it.decision = "EDITED";
      }
    }
    if (it.kind === "CHECKPOINT" && (edit.outOf !== undefined || edit.bar !== undefined)) {
      const outOf = edit.outOf ?? it.outOf;
      const bar = edit.bar ?? it.bar;
      if (outOf == null || !Number.isFinite(outOf) || outOf <= 0) return "Set what the score is out of.";
      if (bar == null || !Number.isFinite(bar) || bar < 0 || bar > outOf) return "Set a bar between 0 and the scale.";
      it.outOf = outOf;
      it.bar = bar;
    }
  }
  for (const [lineage, rule] of Object.entries(choices.rules ?? {})) {
    const it = out.items.find((i) => i.kind === "PRACTICE" && i.lineageId === lineage);
    if (!it) continue;
    const r = parseRule(rule);
    if (!r || r.kind === "AFTER") return "Pick days or a weekly count for this practice.";
    it.rule = rule.trim().toUpperCase();
    it.sessionsPerWeek = ruleSessions(it.rule);
    it.planSource = "YOURS";
  }
  return out;
}

/** Decision 10's high-water baseline for a card measure: max(the live count, the highest target of any same-key measure whose goal closed paying). */
interface HighWater {
  key: string;
  live: number;
  baseline: number;
  /** The latest day a same-key goal paid, when that raised the baseline above the live count. */
  paidOn: DayKey | null;
}

async function highWaterOf(e: Env, userId: string, ctx: PlanContext, card: MeasureSpec, ownGoalId: string | null, stageRow = false): Promise<HighWater | null> {
  const ids = card.scope.domainIds ?? [];
  if (!ids.length || card.minLevel == null) return null;
  // A stage measure's key keeps its `r` or `rc` segment (recall cards only); a rev-3 row's has none.
  const key = stageRow && card.measureKey ? card.measureKey : cardsAtLevelKey(ids, card.minLevel);
  const live = (liveCountOfKey(ctx, key) ?? liveCount(ctx, ids, card.minLevel)).value;
  const keyed = await e.store.measuresWithKeys(userId, [key]);
  const goals = Array.from(new Set(keyed.map((k) => k.goalId).filter((g): g is string => !!g && g !== ownGoalId)));
  const paid = goals.length ? await e.io.goalPayments(userId, goals) : {};
  const paidTargets = keyed.filter((k) => k.goalId && paid[k.goalId]);
  const high = paidTargets.reduce((n, k) => Math.max(n, k.target), 0);
  const days = paidTargets.map((k) => paid[k.goalId as string]).sort();
  return { key, live, baseline: Math.max(live, high), paidOn: high > live ? (days[days.length - 1] ?? null) : null };
}

/** The milestone with its card measure stamped with the high-water baseline today (R2's refitForStart fits from it). */
function stamped(m: MilestoneDraft, hw: HighWater | null, today: DayKey): MilestoneDraft {
  if (!hw) return m;
  // The first card measure's (a stage has one per Domain; each gets its own at Start).
  let done = false;
  return {
    ...m,
    measures: m.measures.map((x) => {
      if (x.kind !== "CARDS_AT_LEVEL" || done) return x;
      done = true;
      return { ...x, baseline: hw.baseline, baselineDay: today, measureKey: hw.key };
    }),
  };
}

interface StartFacts {
  b: RoadmapBundle;
  row: MilestoneBundle;
  ctx: PlanContext;
  plan: MilestoneDraft[];
  refitted: realism.StartRefit;
  hw: HighWater | null;
  current: AimRankView | null;
  templates: Map<string, TemplateLite>;
  payments: Record<string, DayKey>;
}

/** Everything the Start sheet and Start read: the bundle, then one wave (templates, payments, the high-water mark), then R2's re-check. */
async function startFacts(e: Env, userId: string, milestoneId: string, now: Date): Promise<StartFacts | null> {
  const roadmapId = await e.store.ownerOf(userId, { milestoneId });
  if (!roadmapId) return null;
  const b = await e.store.bundle(userId, roadmapId);
  const row = b?.milestones.find((m) => m.id === milestoneId);
  if (!b || !row) return null;
  const ctx = await planContext(e, userId, b.roadmap, now);
  const planRows = planRowsOf(b);
  const draft = draftOf(row);
  const lineageGoals = b.milestones.filter((m) => m.lineageId === row.lineageId && m.goalId && m.id !== row.id).map((m) => m.goalId as string);
  // The plan's goals (is one still open? their due days) and its practices (is one already on Today?), in one read.
  const templateIds = planRows.flatMap((m) => [m.goalId, ...m.items.filter((i) => i.kind === "PRACTICE").map((i) => i.templateId)]).filter((x): x is string => !!x);
  const card = draft.measures.find((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS");
  const [templates, payments, hw] = await Promise.all([
    e.io.templates(userId, templateIds),
    lineageGoals.length ? e.io.goalPayments(userId, lineageGoals) : Promise.resolve({} as Record<string, DayKey>),
    card ? highWaterOf(e, userId, ctx, card, row.goalId, row.stage != null) : Promise.resolve(null),
  ]);
  const byId = new Map(templates.map((t) => [t.id, t]));
  // The engine's plan: the carried rows at their one due day, none a copy replaces (fix round 2), and the unstarted rows.
  // A dormant "Start again" copy (its original unarchived) is not part of what the engine reads (fix round 2's carry-over).
  const unstarted = planRows.filter((m) => !isCarried(m) && (m.id === row.id || !dormantCopy(b, m, byId)));
  const plan = [...carriedPlanOf(b, unstarted, byId), ...unstarted.map(draftOf)];
  const refitted = e.lanes.refitForStart(stamped(draft, hw, ctx.today), plan, realismInputOf(ctx, plan));
  let current: AimRankView | null = null;
  try {
    current = e.lanes.aimRankOf(rankInputOf(b, planRows, ctx.today));
  } catch {
    current = null;
  }
  return { b, row, ctx, plan, refitted, hw, current, templates: byId, payments };
}

/** Practices of earlier milestones still open on Today under the same name ("Backtest is already on Today (from Milestone 1)"). */
function alreadyOnToday(f: StartFacts, it: ItemDraft): { templateId: string; fromOrd: number } | null {
  const norm = normTitleOf(it.label);
  for (const m of planRowsOf(f.b)) {
    if (m.id === f.row.id || !isCarried(m)) continue;
    for (const i of m.items) {
      if (i.kind !== "PRACTICE" || !i.templateId) continue;
      const t = f.templates.get(i.templateId);
      if (t && !t.archivedAt && (t.normTitle === norm || normTitleOf(t.title) === norm)) return { templateId: t.id, fromOrd: m.ord };
    }
  }
  return null;
}

/** "2 Mid goals paid in the last 30 days — closing before 21 Dec pays 0" (goalLimitWindow's rule for MID). */
function limitLineOf(paidDays: readonly DayKey[]): string | null {
  const rule = GOAL_RULES.MID;
  const days = [...paidDays].sort().reverse();
  if (days.length === 0) return null;
  const head = `${days.length} Mid goal${days.length === 1 ? "" : "s"} paid in the last ${rule.windowDays} days`;
  if (days.length < rule.maxPaying) return head;
  const free = addDays(days[rule.maxPaying - 1], rule.windowDays);
  return `${head} — closing before ${shortDate(free)} pays 0`;
}

/** A milestone with the sheet's switched-off practices off Today. */
const withOff = (m: MilestoneDraft, off: ReadonlySet<string>): MilestoneDraft => ({
  ...m,
  items: m.items.map((i) => (i.kind === "PRACTICE" && off.has(i.lineageId) ? { ...i, addToToday: false } : i)),
});

/** The Start sheet, computed before anything is created (refitForStart, statedForMilestone, the MID limit, the week's quests). Writes nothing. */
export async function startPreview(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<StartPreview | null> {
  const e = envOf(deps);
  const f = await startFacts(e, userId, milestoneId, now);
  if (!f) return null;
  const { b, row, ctx, refitted } = f;
  const planRows = planRowsOf(b);
  // Its words re-checked as the editor reads them (pending rows carry their struck spans and reasons).
  const m: MilestoneDraft = labelChecksOf(e, b, ctx.tree, [refitted.milestone], positionCountOf(planRows.filter(scheduled)))[0];
  const off = new Set<string>();
  const track: Track = isOneOf(ROADMAP_TRACKS, b.roadmap.track) ? b.roadmap.track : DEFAULT_FIELD_TRACK;
  const [ledger, midPaid] = await Promise.all([
    e.io.dayLedger(userId, ctx.today).catch((err: unknown) => {
      console.error("roadmap: today's ledger unavailable (practices unpriced):", err);
      return null;
    }),
    e.io.midGoalPaidDays(userId, ctx.today).catch(() => [] as DayKey[]),
  ]);
  const practices: StartPracticeRow[] = m.items
    .filter((i) => i.kind === "PRACTICE" && liveItem(i) && i.addToToday)
    .map((i) => {
      const already = alreadyOnToday(f, i);
      if (already) off.add(i.lineageId);
      return {
        itemId: i.id as string,
        lineageId: i.lineageId,
        name: i.label,
        rule: practiceRule(i),
        minutes: bandMinutes(i),
        on: !already,
        alreadyOnToday: already,
        price: practicePriceOf(i, track, ctx.today, ledger),
        weeklyMinutes: practiceMinutesPerWeekOf(i),
      };
    });
  const mOff = syncMeasures(withOff(m, off), b.roadmap.fieldId == null, e.makeId);
  let snapshot: StartSnapshot | null = null;
  try {
    snapshot = e.lanes.startSnapshotOf(mOff, refitted, realismInputOf(ctx, f.plan), ctx.today);
  } catch {
    snapshot = null;
  }
  const rows = todayBoundRowsOf(m, off);
  // The pay line at the sheet's default switches, and its basis: the sheet recomputes it on every switch with the same arithmetic.
  const payBasis = payBasisOf(m, snapshot ?? refitted.feasibility, lineagePaidOnOf(b, row, f.payments));
  const stated = statedFor(m, payBasis, off);
  const of = positionCountOf(planRows.filter(scheduled));
  const refusal = startRefusal(e, deps, b, row, planRows, ctx.today, refitted.impossible, f.templates);
  let weekQuests: WeekQuestSet | null = null;
  if (snapshot) {
    // "Week quests if you start now": the generator's set for the rest of this life week, from what Start would write.
    const previewTemplates = Object.fromEntries(
      mOff.items.filter((i) => (i.kind === "PRACTICE" && i.addToToday && liveItem(i)) || (i.kind === "STEP" && liveItem(i))).map((i) => [i.id as string, `preview-${i.id}`])
    );
    try {
      weekQuests = await e.lanes.weekQuestSetFor(userId, milestoneId, weekStartKeyOf(ctx.today), now, {
        overrides: { startedDay: ctx.today, snapshot, templateIds: previewTemplates, ...(f.hw ? { v0: f.hw.live } : {}) },
      });
    } catch {
      weekQuests = null;
    }
  }
  const blockers = blockersOf(m, rows);
  const rank = row.rankIndex;
  return {
    milestoneId,
    ord: row.ord,
    of,
    title: m.title,
    dueDay: (m.dueDay ?? row.dueDay ?? ctx.today) as DayKey,
    goalsLive: e.goalsLive,
    writesOff: writesOff(deps),
    refusal,
    todayCheck: refitted.todayCheck,
    feasibility: refitted.feasibility,
    pending: m.items.filter(undecidedAtStart),
    todayRows: rows,
    practices,
    steps: m.items.filter((i) => i.kind === "STEP" && liveItem(i)).map((i) => ({ itemId: i.id as string, title: i.label })),
    // restsOnAdded (F-R4-13): "Pays ⬡6 because of the practice the app added (…)" — lane 0 adds the optional field to StartPreview.pay.
    pay: Object.assign({ stated: stated.stated, zeroReason: stated.zeroReason, limitLine: limitLineOf(midPaid), paidOn: stated.paidOn }, { restsOnAdded: stated.restsOnAdded ?? null }),
    payBasis,
    givesRank: rank != null && (f.current == null || rank > f.current.index) ? aimRankName(rank) : null,
    weekQuests,
    canStart: refusal == null && blockers.length === 0,
    blockers,
  };
}

/** The refusals that depend on rows and the date (F15 step 1), in words; null when Start may proceed. */
function startRefusal(
  e: Env,
  deps: RoadmapDeps,
  b: RoadmapBundle,
  row: MilestoneRec,
  planRows: readonly MilestoneBundle[],
  today: DayKey,
  impossible: boolean,
  templates: ReadonlyMap<string, TemplateLite>
): string | null {
  if (writesOff(deps)) return ROADMAP_WRITES_OFF;
  if (!e.goalsLive) return GATE_OFF;
  if (b.roadmap.status !== "ACTIVE") return "Accept the plan first.";
  // A plan made before revision 4 can't start a milestone (F-R4-16); a stage held when you began is never startable (F-R4-10).
  if (legacyOf(b)) return START_AGAIN_AT_DEPTH;
  if (row.reachedDay != null || heldRow(row)) return LINEAGE_REACHED;
  if (row.status !== "PLANNED" || row.goalId) return row.status === "STARTING" ? "This milestone is already starting — tap Finish starting." : "This milestone isn't waiting to start.";
  if (row.version !== b.roadmap.version) return "This milestone isn't part of the accepted plan.";
  // A lineage reached once never starts again (at most one goal of a position pays).
  if (b.milestones.some((m) => m.lineageId === row.lineageId && m.id !== row.id && m.reachedDay != null)) return LINEAGE_REACHED;
  // Superseded rows aside (the NO_OTHER_LIVE_MILESTONE guard reads the same): an unarchived dropped goal whose copy started stays out of the way.
  const live = planRows.find((m) => m.id !== row.id && !superseded(b, m) && (m.status === "STARTING" || (m.status === "STARTED" && goalOpen(m, templates))));
  if (live) return STARTED_ELSEWHERE;
  if (!row.dueDay || daysBetween(today, row.dueDay) < START_MIN_DAYS_TO_DUE) return DUE_TOO_SOON;
  if (impossible) return "This milestone can't be done by its date any more — re-fit the dates or lower the target.";
  return null;
}

/** A STARTED row's goal is open when it is neither closed nor archived (unknown goal: treated as open). */
function goalOpen(m: MilestoneRec, templates: ReadonlyMap<string, TemplateLite>): boolean {
  if (!m.goalId) return true;
  const t = templates.get(m.goalId);
  return !t || (t.closedScore == null && t.archivedAt == null);
}

/** The ParsedCapture Start builds in code (decision 14): structure, not text. */
function captureOf(title: string, mode: ParsedCapture["mode"], kind: ParsedCapture["kind"], extra: Partial<ParsedCapture>): ParsedCapture {
  return {
    title,
    mode,
    kind,
    recurrence: null,
    dueDay: null,
    dueKind: null,
    estMinutes: null,
    compulsory: false,
    compulsoryWarning: null,
    inbox: false,
    horizon: null,
    track: null,
    intrinsic: false,
    mvv: null,
    autoMetric: null,
    autoTarget: null,
    doneNow: false,
    parentHint: null,
    answer: null,
    tokens: [],
    ...extra,
  };
}

/** The goal's capture: kind GOAL, the milestone title, its due day, MID, the roadmap's track. */
export function goalCaptureOf(m: Pick<MilestoneDraft, "title" | "dueDay">, track: Track): ParsedCapture {
  return captureOf(m.title, "GOAL", "GOAL", { dueDay: m.dueDay, dueKind: "DEADLINE", horizon: "MID", track });
}

/** A practice's capture: a recurring habit under the goal, at its band's minutes. */
export function practiceCaptureOf(it: ItemDraft, track: Track): ParsedCapture {
  return captureOf(it.label, "TASK", "HABIT", { recurrence: practiceRule(it), estMinutes: bandMinutes(it), track });
}

/** A step's capture: a one-off child of the goal. */
export function stepCaptureOf(it: ItemDraft, track: Track): ParsedCapture {
  return captureOf(it.label, "TASK", "TASK", { track });
}

/** Practice names by lineage (R1's rebase words: "Backtest was switched off at Start"). */
function practiceNamesOf(rows: readonly { items: readonly { kind: string; lineageId: string; label: string }[] }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of rows) for (const i of m.items) if (i.kind === "PRACTICE") out[i.lineageId] = i.label;
  return out;
}

/**
 * The PROFICIENCY row a plan decision writes inside its own transaction
 * (F12), through R1's proficiencyReadingFor: the decision's basis measured on
 * today's cards, practice and reaches, rebased against the previous reading
 * when the basis changed. null when it can't be computed (logged; the chain
 * writes the next one).
 */
async function proficiencyFor(
  e: Env,
  deps: RoadmapDeps,
  userId: string,
  roadmapId: string,
  now: Date,
  basis: ProficiencyBasis,
  cause: ProficiencyRebaseCause,
  names: Record<string, string>
): Promise<ReadingRow | null> {
  try {
    return await e.lanes.proficiencyReadingFor(userId, roadmapId, now, { basis, decision: { cause, names } }, { env: deps.env });
  } catch (err) {
    console.error("roadmap: Proficiency not written with this decision:", err);
    return null;
  }
}

/**
 * The refusals, then the claim (PLANNED → STARTING, the sheet's decisions,
 * final targets and high-water baselines, switched-off practices removed),
 * then the rows by captureKey through tasks.ts createTemplateCore with
 * `link`, then finishStartCore. Refuses while ROADMAP_GOALS_LIVE is false.
 */
export async function startMilestoneCore(userId: string, milestoneId: string, choices: StartChoices, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ goalId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  if (!e.goalsLive) return fail(GATE_OFF);
  const ch: StartChoices = {
    target: choices?.target === "FITTED_NOW" ? "FITTED_NOW" : "STORED",
    overAccepted: choices?.overAccepted === true,
    practicesOff: Array.isArray(choices?.practicesOff) ? choices.practicesOff.filter((x) => typeof x === "string") : [],
    rules: choices?.rules && typeof choices.rules === "object" ? choices.rules : {},
    decisions: choices?.decisions && typeof choices.decisions === "object" ? choices.decisions : {},
    edits: choices?.edits && typeof choices.edits === "object" ? choices.edits : {},
  };
  const claimed = await withRetry<{ goalId: string | null }>(async () => {
    const f = await startFacts(e, userId, milestoneId, now);
    if (!f) return fail("That milestone no longer exists.");
    const { b, row, ctx, refitted } = f;
    if (row.status === "STARTED" && row.goalId) return ok({ goalId: row.goalId });
    if (row.status === "STARTING") return fail("This milestone is already starting — tap Finish starting.");
    const planRows = planRowsOf(b);
    const refusal = startRefusal(e, deps, b, row, planRows, ctx.today, refitted.impossible, f.templates);
    if (refusal) return fail(refusal);

    const sheet = applySheet(refitted.milestone, ch, b, e, ctx.tree);
    if (typeof sheet === "string") return fail(sheet);
    const off = new Set(ch.practicesOff);
    let m = syncMeasures(withOff(sheet, off), b.roadmap.fieldId == null, e.makeId);
    const blockers = blockersOf(m, todayBoundRowsOf(m, off));
    if (blockers.length) return fail(blockers[0]);
    if (!m.measures.some((x) => x.role === "PAYS")) return fail(NOTHING_MEASURES);

    const fz = refitted.feasibility;
    const over = fz.worst === "OVER" || fz.time.verdict === "OVER" || fz.knowledge.some((k) => k.verdict === "OVER");
    if (over && !ch.overAccepted && !row.overAccepted) return fail("This milestone is over your hours or pace now: switch on “Keep it over my hours/pace” to start it.");

    // Each card measure's final target (stored or re-fitted) over its high-water baseline (decision 10). A stage holds one
    // per Domain of R (F-R4-10), each with its own key (its `r` or `rc` segment kept) and its own baseline.
    const cards = m.measures.filter((x) => x.kind === "CARDS_AT_LEVEL");
    const stageRow = row.stage != null;
    const stampedCards = new Map<MeasureSpec, { target: number; baseline: number; key: string; fitted: boolean }>();
    for (const card of cards) {
      if (!card.scope.domainIds?.length || card.minLevel == null) return fail("This milestone's card measure has no level yet — re-fit the plan.");
      const key = stageRow && card.measureKey ? card.measureKey : cardsAtLevelKey(card.scope.domainIds, card.minLevel);
      const hw = f.hw && f.hw.key === key ? f.hw : await highWaterOf(e, userId, ctx, card, row.goalId, stageRow);
      if (!hw) return fail("This milestone's card measure has no level yet — re-fit the plan.");
      const fitted = ch.target === "FITTED_NOW" && !!refitted.todayCheck && refitted.todayCheck.measureKey === key;
      const target = fitted && refitted.todayCheck ? refitted.todayCheck.fittedNow : card.target;
      if (target < hw.baseline + minIncrementCards(hw.baseline)) {
        return fail(
          hw.paidOn
            ? `Already counted up to ${hw.baseline} (paid ${shortDate(hw.paidOn)}) — re-fit to raise the target.`
            : `Already at ${hw.baseline} — the target needs to be higher; re-fit to raise it.`
        );
      }
      stampedCards.set(card, { target, baseline: hw.baseline, key, fitted });
    }
    m = {
      ...m,
      measures: m.measures.map((x) => {
        const s0 = stampedCards.get(x);
        return s0 ? { ...x, target: s0.target, targetSource: s0.fitted ? "WORKED_OUT" : x.targetSource, baseline: s0.baseline, baselineDay: ctx.today, measureKey: s0.key } : x;
      }),
    };
    let snapshot: StartSnapshot | null = null;
    try {
      snapshot = e.lanes.startSnapshotOf(m, refitted, realismInputOf(ctx, f.plan), ctx.today);
    } catch (err) {
      console.error("roadmap: StartSnapshot not computed:", err);
    }
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["ACTIVE"] } },
      { op: "guard", guard: { g: "MILESTONE_IS", id: row.id, statuses: ["PLANNED"], goalIdNull: true } },
      { op: "guard", guard: { g: "NO_OTHER_LIVE_MILESTONE", roadmapId: b.roadmap.id, exceptId: row.id } },
    ];
    try {
      writeRoadmapRows(
        ops,
        { kind: "REWRITE", before: row, after: { ...m, status: "PLANNED" }, now, makeId: e.makeId, decided: new Set([...Object.keys(ch.decisions), ...Object.keys(ch.edits)]) },
        modelTextContextOf(b, ctx.tree)
      );
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("start", err);
      return fail(CHANGE_NOT_SAVED);
    }
    ops.push({
      op: "update",
      table: "roadmapMilestone",
      where: { id: row.id, status: "PLANNED" },
      data: { status: "STARTING", startedDay: ctx.today, startingAt: now, overAccepted: row.overAccepted || (over && ch.overAccepted), feasibility: feasibilityJson(snapshot ?? fz, m.notes) },
    });
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ goalId: null }) : "stale";
  });
  invalidate("roadmap");
  if (!claimed.ok) return claimed;
  if (claimed.value.goalId) return ok({ goalId: claimed.value.goalId });
  const finished = await finishStartCore(userId, milestoneId, now, deps);
  return finished.ok ? finished : fail(`${finished.error} Tap Finish starting to complete it.`);
}

/** "Finish starting" (and Start's last step): the rows by captureKey, PRACTICE_KEPT keys, STARTING → STARTED, the first readings and PROFICIENCY, and this week's quest set (source START). */
export async function finishStartCore(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ goalId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const roadmapId = await e.store.ownerOf(userId, { milestoneId });
  if (!roadmapId) return fail("That milestone no longer exists.");
  const b0 = await e.store.bundle(userId, roadmapId);
  const row0 = b0?.milestones.find((m) => m.id === milestoneId);
  if (!b0 || !row0) return fail("That milestone no longer exists.");
  if (row0.status === "STARTED" && row0.goalId) return ok({ goalId: row0.goalId });
  if (row0.status !== "STARTING") return fail("This milestone isn't starting.");

  const track: Track = isOneOf(ROADMAP_TRACKS, b0.roadmap.track) ? b0.roadmap.track : DEFAULT_FIELD_TRACK;
  const m0 = draftOf(row0);
  const ctx = await planContext(e, userId, b0.roadmap, now);
  const startedDay = row0.startedDay ?? ctx.today;
  const lineageGoals = b0.milestones.filter((m) => m.lineageId === row0.lineageId && m.goalId && m.id !== row0.id).map((m) => m.goalId as string);
  const payments = lineageGoals.length ? await e.io.goalPayments(userId, lineageGoals) : {};
  const snap = startSnapshotOfRow(row0);
  // The frozen goalMp: the sheet's arithmetic over the claimed switches (switched-off practices have addToToday false).
  const stated = statedFor(m0, payBasisOf(m0, snap ?? planFeasibilityOfRow(row0), lineagePaidOnOf(b0, row0, payments)));

  // Step 4: the rows, idempotent by captureKey (a re-run finds them).
  let goalId: string;
  const templateOf = new Map<string, string>();
  try {
    const goal = await e.io.createTemplate(userId, goalCaptureOf(m0, track), {
      rawText: m0.title,
      captureSource: "form",
      captureKey: milestoneGoalKey(milestoneId),
      now,
      link: { goal: { krMetric: "ROADMAP", krTarget: null, krUnit: null, goalMp: stated.stated } },
    });
    goalId = goal.id;
    const practices = m0.items.filter((i) => i.kind === "PRACTICE").sort((a, b) => a.ord - b.ord);
    for (let i = 0; i < practices.length; i++) {
      const it = practices[i];
      if (!liveItem(it) || !it.addToToday) continue;
      const t = await e.io.createTemplate(userId, practiceCaptureOf(it, track), {
        rawText: it.label,
        captureSource: "form",
        captureKey: milestonePracticeKey(milestoneId, i),
        now,
        link: { parentId: goalId },
      });
      templateOf.set(it.lineageId, t.id);
    }
    const steps = m0.items.filter((i) => i.kind === "STEP").sort((a, b) => a.ord - b.ord);
    for (let i = 0; i < steps.length; i++) {
      const it = steps[i];
      if (!liveItem(it)) continue;
      const t = await e.io.createTemplate(userId, stepCaptureOf(it, track), {
        rawText: it.label,
        captureSource: "form",
        captureKey: milestoneStepKey(milestoneId, i),
        now,
        link: { parentId: goalId },
      });
      templateOf.set(it.lineageId, t.id);
    }
    // No model sizes or explains a plan-born task (decision 50; contracts §15.6): Start never defers life-sizing's
    // applySizing for an 'rm:' template, so Gemini's rationale never reaches Today's "Why". The catalog method set the
    // band (estMinutes above); life-sizing refuses an 'rm:' template whoever calls it (the lead's half).
  } catch (err) {
    console.error("roadmap: Start's rows not created:", err);
    invalidate("life", "activity", "roadmap");
    return fail("Couldn't create the milestone's tasks.");
  }
  invalidate("life", "activity");

  // Step 5: finish in one transaction.
  const res = await withRetry<{ goalId: string }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    const row = b?.milestones.find((m) => m.id === milestoneId);
    if (!b || !row) return fail("That milestone no longer exists.");
    if (row.status === "STARTED" && row.goalId) return ok({ goalId: row.goalId });
    if (row.status !== "STARTING") return fail("This milestone isn't starting.");
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "MILESTONE_IS", id: row.id, statuses: ["STARTING"], goalIdNull: true } }];
    for (const it of row.items) {
      const t = templateOf.get(it.lineageId);
      if (t && it.templateId !== t) ops.push({ op: "update", table: "roadmapItem", where: { id: it.id }, data: { templateId: t } });
    }
    const readingRows: ReadingRow[] = [];
    const dueDay = row.dueDay ?? startedDay;
    const rest = await e.io.restRows(userId, startedDay, dueDay);
    const held = Array.from(heldDaysOf(rest, startedDay, dueDay)).sort();
    let v0: number | undefined;
    for (const x of row.measures) {
      if (x.kind === "PRACTICE_KEPT") {
        const lineages = scopeOf(x.scope).itemLineageIds ?? (x.itemLineageId ? [x.itemLineageId] : []);
        const practiceItems = row.items.filter((i) => i.kind === "PRACTICE" && lineages.includes(i.lineageId) && i.addToToday && liveItem(i));
        const templateIds = practiceItems.map((i) => templateOf.get(i.lineageId)).filter((t): t is string => !!t);
        if (!templateIds.length) continue;
        const key = practiceKeptKey(templateIds, startedDay);
        const value = practiceValue(
          e,
          practiceItems.map((i) => ({ templateId: templateOf.get(i.lineageId) as string, rule: practiceRule(itemDraftOf(i)), startDay: startedDay, instances: [] })),
          startedDay,
          dueDay,
          ctx.today,
          held
        );
        ops.push({
          op: "update",
          table: "roadmapMeasure",
          where: { id: x.id },
          data: { scope: { itemLineageIds: lineages, templateIds }, measureKey: key, target: value.effTarget, fittedTarget: value.effTarget, baseline: 0, baselineDay: startedDay },
        });
        readingRows.push(measures.practiceReadingRow(key, ctx.today, value, Object.fromEntries(practiceItems.map((i) => [i.lineageId, templateOf.get(i.lineageId) ?? null]))));
      } else if (x.kind === "CARDS_AT_LEVEL" && x.measureKey) {
        const parsed = parseMeasureKey(x.measureKey);
        if (parsed?.kind !== "CARDS_AT_LEVEL") continue;
        const live = liveCount(ctx, parsed.domainIds, parsed.level);
        v0 = live.value;
        readingRows.push(measures.cardsReadingRow(x.measureKey, ctx.today, live));
      }
    }
    ops.push({ op: "update", table: "roadmapMilestone", where: { id: row.id, status: "STARTING" }, data: { status: "STARTED", goalId } });

    // PROFICIENCY: the basis the acceptance gave (carried in the last reading of this version), less any practice switched off at Start.
    const planRows = planRowsOf(b).map((m) => (m.id === row.id ? { ...m, status: "STARTED", goalId } : m));
    const acc = currentAcceptance(b);
    const readings = await e.store.readings(userId, [proficiencyKey(roadmapId)], addDays(ctx.today, -READINGS_LOOKBACK_DAYS));
    const prev = latestOf(readings, proficiencyKey(roadmapId), ctx.today);
    const prevDetail = prev ? proficiency.parseProficiencyDetail(prev.detail) : null;
    const carried = planRows.filter(isCarried);
    let basis: ProficiencyBasis | null = null;
    try {
      basis =
        prevDetail && prevDetail.basisVersion === b.roadmap.version
          ? prevDetail.basis
          : e.lanes.proficiencyBasisOf({
              basisVersion: b.roadmap.version,
              endState: endStateOf(acc),
              feasibility: feasibilityOfAcceptance(acc),
              milestones: planRows.map(draftOf),
              switchedOff: [],
              heldDays: ctx.held,
            });
    } catch (err) {
      console.error("roadmap: Proficiency basis not computed at Start:", err);
    }
    if (basis) {
      const prof = await proficiencyFor(e, deps, userId, roadmapId, now, proficiency.basisWithout(basis, switchedOffOf(carried)), "SWITCHED_OFF", practiceNamesOf(carried));
      if (prof) readingRows.push(prof);
    }
    if (readingRows.length) ops.push({ op: "readings", rows: readingRows, observedAt: now });

    // This life week's quest set (source START), from what this transaction writes (R6 reads the rest as of Monday).
    if (snap) {
      try {
        const set = await e.lanes.weekQuestSetFor(userId, milestoneId, weekStartKeyOf(ctx.today), now, {
          overrides: { startedDay, snapshot: snap, templateIds: Object.fromEntries(templateOf), ...(v0 != null ? { v0 } : {}) },
        });
        if (set) ops.push({ op: "questWeek", roadmapId, set, source: "START", now });
      } catch (err) {
        console.error("roadmap: Start's week quests not frozen (a render freezes them):", err);
      }
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ goalId }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

function practiceValue(
  e: Env,
  templates: measures.PracticeTemplateRow[],
  startedDay: DayKey,
  dueDay: DayKey,
  today: DayKey,
  held: readonly DayKey[]
): measures.PracticeKeptValue {
  try {
    return e.lanes.practiceKeptValue(templates, { startedDay, dueDay, asOf: today }, held);
  } catch {
    const planned = templates.reduce((n, t) => n + plannedUnits(t.rule, { from: startedDay, to: dueDay, startDay: startedDay }, held), 0);
    return { kept: 0, planned, held: held.length, effTarget: Math.round(KEEP_SHARE * planned) };
  }
}

/** A STARTING row older than STARTING_STALE_MS with no goal → PLANNED. */
export async function returnStartingCore(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const loc = await locate(e, userId, milestoneId);
    if (!loc || loc.item) return fail("That milestone no longer exists.");
    const m = loc.m;
    if (m.status !== "STARTING" || m.goalId) return fail("This milestone isn't stuck starting.");
    if (m.startingAt && now.getTime() - m.startingAt.getTime() < STARTING_STALE_MS) return fail("Starting is still in progress; try Finish starting first.");
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: ["STARTING"], goalIdNull: true } },
      { op: "update", table: "roadmapMilestone", where: { id: m.id, status: "STARTING" }, data: { status: "PLANNED", startedDay: null, startingAt: null } },
    ]);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/** "Start again" on a dropped milestone: a new PLANNED row, same lineageId and rankIndex, re-fitted dates, its own captureKeys. */
export async function startAgainCore(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ milestoneId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<{ milestoneId: string }>(async () => {
    const loc = await locate(e, userId, milestoneId);
    if (!loc || loc.item) return fail("That milestone no longer exists.");
    const { b, m } = loc;
    if (b.roadmap.status !== "ACTIVE") return fail("This roadmap is closed.");
    if (m.status !== "STARTED" || !m.goalId) return fail("Only a dropped milestone can start again.");
    const [goal] = await e.io.templates(userId, [m.goalId]);
    if (!goal || !goal.archivedAt || goal.closedScore != null) return fail("Only a dropped milestone can start again.");
    if (b.milestones.some((x) => x.lineageId === m.lineageId && x.id !== m.id && (x.status === "PLANNED" || x.status === "STARTING" || (x.status === "STARTED" && x.createdAt > m.createdAt)))) {
      return fail("This milestone has already started again.");
    }
    const today = todayKey(now);
    const length = m.windowStart && m.dueDay ? daysBetween(m.windowStart, m.dueDay) : MILESTONE_MIN_DAYS;
    const dueDay = [addDays(today, Math.max(MILESTONE_MIN_DAYS, length)), b.roadmap.targetDay].sort()[0];
    if (daysBetween(today, dueDay) < START_MIN_DAYS_TO_DUE) return fail("Too close to the aim's date to start again — re-plan instead.");
    const d = draftOf(m);
    const id = e.makeId();
    const copy: MilestoneDraft = {
      ...d,
      id,
      windowStart: today,
      dueDay,
      items: d.items.map((i) => ({ ...i, id: null, templateId: null })),
      measures: d.measures.map((x) => ({
        ...x,
        id: null,
        measureKey: x.kind === "CARDS_AT_LEVEL" ? x.measureKey : null,
        baseline: null,
        baselineDay: null,
        scope: x.kind === "PRACTICE_KEPT" ? { itemLineageIds: x.scope.itemLineageIds ?? [] } : x.scope,
      })),
    };
    const rowData = { ...milestoneRowOf(b.roadmap.id, b.roadmap.version, copy, id, planFeasibilityOfRow(m), now), status: "PLANNED", rankIndex: m.rankIndex, ord: m.ord };
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["ACTIVE"], version: b.roadmap.version } },
      { op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: ["STARTED"] } },
    ];
    try {
      writeRoadmapRows(ops, { kind: "COPY", roadmapId: b.roadmap.id, version: b.roadmap.version, copy, row: rowData, now, makeId: e.makeId }, modelTextContextOf(b, await e.io.fieldTree()));
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("start-again", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ milestoneId: id }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

// ═══ Measures (F10) ═════════════════════════════════════════════════════════

const NONCE = /^[A-Za-z0-9_-]{1,64}$/;

/** A checkpoint log: INSERT … ON CONFLICT DO NOTHING under 'SELF|CHECKPOINT|i:<lineage>|n:<nonce>' for today. Context only. */
export async function logCheckpointCore(
  userId: string,
  itemLineageId: string,
  log: { score: number; outOf?: number | null; note?: string | null; nonce: string },
  now: Date,
  deps: RoadmapDeps = {}
): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  if (typeof itemLineageId !== "string" || !NONCE.test(itemLineageId)) return fail("That checkpoint no longer exists.");
  if (!log || typeof log.nonce !== "string" || !NONCE.test(log.nonce)) return fail("Couldn't log that score. Try again.");
  const roadmapId = await e.store.ownerOf(userId, { lineageId: itemLineageId });
  const b = roadmapId ? await e.store.bundle(userId, roadmapId) : null;
  const item = b ? planRowsOf(b).flatMap((m) => m.items).find((i) => i.lineageId === itemLineageId && i.kind === "CHECKPOINT" && liveItem(i)) : null;
  if (!b || !item) return fail("That checkpoint no longer exists.");
  const outOf = typeof log.outOf === "number" && Number.isFinite(log.outOf) && log.outOf > 0 ? log.outOf : item.outOf;
  if (outOf == null) return fail("Set what the score is out of first.");
  const score = log.score;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > outOf) return fail(`Log a score from 0 to ${outOf}.`);
  const note = log.note ? packText(log.note, 200) || null : null;
  const today = todayKey(now);
  const out = await e.store.apply(userId, [
    { op: "selfLog", id: e.makeId(), measureKey: checkpointLogKey(itemLineageId, log.nonce), day: today, value: score, detail: { score, outOf, bar: item.bar, note }, at: now },
  ]);
  invalidate("roadmap");
  return out === "stale" ? fail(RACED) : ok(null);
}

// ═══ Lifecycle (F22) ════════════════════════════════════════════════════════

/** A re-plan (REFIT or MANUAL) of unstarted positions only, as version + 1 DRAFT rows; reviewed and accepted as in F9. */
export async function replanCore(userId: string, roadmapId: string, kind: ReplanKind, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ version: number }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (kind !== "REFIT" && kind !== "MANUAL") return fail("Pick Re-fit or Edit by hand.");
  const e = envOf(deps);
  const res = await withRetry<{ version: number }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "ACTIVE") return fail("Only an accepted roadmap is re-planned.");
    // A plan made before revision 4 starts again at a depth instead (F-R4-16).
    if (legacyOf(b)) return fail(START_AGAIN_AT_DEPTH);
    const v = b.roadmap.version + 1;
    const rows = planRowsOf(b);
    const goals = await carriedGoalsOf(e, userId, b);
    // A "Start again" copy whose dropped original was unarchived (its goal open again) is dormant: the original stands
    // for that position, so the copy is never carried into a re-plan or read by the engine (fix round 2's "opposite state").
    const unstartedRows = rows.filter((m) => !isCarried(m) && !dormantCopy(b, m, goals));
    // The carried rows at their one due day (a Reschedule moves the windows after it), none a "Start again" copy replaces (fix round 2).
    const carried = carriedPlanOf(b, unstartedRows, goals);
    const unstarted = unstartedRows.map(draftOf);
    const fresh = (d: MilestoneDraft): MilestoneDraft => ({
      ...d,
      id: null,
      version: v,
      status: d.status === "LATER" ? "LATER" : "DRAFT",
      rankIndex: null,
      items: d.items.map((i) => ({ ...i, id: null })),
      measures: d.measures.map((x) => ({ ...x, id: null, baseline: null, baselineDay: null, measureKey: x.kind === "CARDS_AT_LEVEL" ? null : x.measureKey })),
    });
    let plan: MilestoneDraft[] = unstarted.map(fresh);
    let feasibility: Feasibility | null = null;
    const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b));
    if (kind === "REFIT") {
      const refitted = e.lanes.refit([...carried, ...plan], realismInputOf(ctx, [...carried, ...plan]));
      plan = refitted.filter((d) => !isCarried(d)).map((d) => ({ ...d, status: d.status === "LATER" ? "LATER" : "DRAFT", version: v }));
    }
    if (plan.length === 0) return fail("Every milestone has started; nothing is left to re-plan.");
    if (positionCountOf([...carried, ...plan.filter(scheduled)]) > MAX_MILESTONES) return fail(`A roadmap holds at most ${MAX_MILESTONES} milestones; move some to Later.`);
    try {
      // The reach model's version, and on a depth plan the date check (F-R4-11): a re-date never lowers n_d or a level.
      feasibility = feasibilityFor(e, ctx, plan, carried);
    } catch (err) {
      console.error("roadmap: re-plan feasibility not computed:", err);
    }
    const runId = e.makeId();
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: b.roadmap.version } },
      { op: "insert", table: "roadmapRun", rows: [runRow(runId, userId, roadmapId, ctx.today, v, kind === "REFIT" ? "INHOUSE" : "MANUAL", "OK", now, { finishedAt: now })] },
    ];
    try {
      writeRoadmapRows(ops, { kind: "DRAFT", roadmapId, version: v, plan, feasibility, now, makeId: e.makeId }, modelTextContextOf(b, ctx.tree, true));
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("replan", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ version: v }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/** ARCHIVED with archivedAt and archiveReason; an open milestone goal is archived only when the user said so (with its undo). History is kept. */
export async function archiveRoadmapCore(
  userId: string,
  roadmapId: string,
  opts: { reason: string; archiveGoal: boolean },
  now: Date,
  deps: RoadmapDeps = {}
): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const reason = packText(typeof opts?.reason === "string" ? opts.reason : "", 200) || "Archived by you";
  const archiveGoal = opts?.archiveGoal === true;
  let openGoal: string | null = null;
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "ACTIVE" && b.roadmap.status !== "DONE") return fail(b.roadmap.status === "DRAFT" ? "Discard the draft instead." : "This roadmap is already archived.");
    const rows = planRowsOf(b).filter((m) => m.status === "STARTED" && m.goalId);
    const goals = new Map((await e.io.templates(userId, rows.map((m) => m.goalId as string))).map((t) => [t.id, t]));
    // The live milestone's goal (a superseded row's unarchived goal is not the one the user is working on).
    openGoal = (rows.find((m) => !superseded(b, m) && goalOpen(m, goals)) ?? rows.find((m) => goalOpen(m, goals)))?.goalId ?? null;
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE", "DONE"] } },
      { op: "update", table: "roadmap", where: { id: roadmapId }, data: { status: "ARCHIVED", archivedAt: now, archiveReason: reason, updatedAt: now } },
      { op: "update", table: "roadmapMilestone", where: { roadmapId, status: { in: ["DRAFT"] } }, data: { status: "DISCARDED" } },
    ]);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  if (res.ok && archiveGoal && openGoal) {
    const g = await e.io.archiveTemplate(userId, openGoal, now);
    invalidate("life", "activity");
    if (!g.ok) return fail(`The roadmap is archived, but its goal stays on Today: ${g.error}`);
  }
  return res;
}

/** DONE once reachedDay is set; earlier only with the user's typed reason (doneReason). */
export async function markRoadmapDoneCore(userId: string, roadmapId: string, reason: string | null, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const why = typeof reason === "string" ? packText(reason, CONSTRAINTS_MAX) : "";
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "ACTIVE") return fail("Only an accepted roadmap is marked done.");
    if (!b.roadmap.reachedDay && !why) return fail("Say why you're marking it done before the aim is reached.");
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"] } },
      { op: "update", table: "roadmap", where: { id: roadmapId }, data: { status: "DONE", doneAt: now, doneReason: why || null, updatedAt: now } },
    ]);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * "Aim not checked … · Add a figure" (F18 header; R5 handoff 4): the
 * reality check's figure ("Hours this usually takes", 1–5000, and where it
 * comes from, YOURS) set on a DRAFT or ACTIVE roadmap. The intake form edits
 * it only while DRAFT; this is the ACTIVE header's way in. The aim check is
 * then worked out on read from the plan (never a verdict chip).
 */
export async function setAimFigureCore(
  userId: string,
  roadmapId: string,
  figure: { typicalHours: number; typicalHoursSource?: string | null },
  now: Date,
  deps: RoadmapDeps = {}
): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const hours = intIn(figure?.typicalHours, TYPICAL_HOURS_MIN, TYPICAL_HOURS_MAX);
  if (hours == null) return fail(`Hours this usually takes must be a whole number from ${TYPICAL_HOURS_MIN} to ${TYPICAL_HOURS_MAX}.`);
  const source = cleanText(figure?.typicalHoursSource);
  if (Array.from(source).length > SOURCE_NOTE_MAX) return fail(`Keep where that figure comes from to ${SOURCE_NOTE_MAX} characters.`);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"] } },
      { op: "update", table: "roadmap", where: { id: roadmapId }, data: { typicalHours: hours, typicalHoursSource: source || null, updatedAt: now } },
    ]);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/** Open practices of closed, dropped or finished milestones ("Timed problems — on Today · [Keep on Today] [Archive]"). Writes nothing. */
export async function practiceAftercare(userId: string, roadmapId: string, deps: RoadmapDeps = {}): Promise<AftercareRow[]> {
  const e = envOf(deps);
  const b = await e.store.bundle(userId, roadmapId);
  if (!b) return [];
  return aftercareOf(e, userId, b);
}

async function aftercareOf(e: Env, userId: string, b: RoadmapBundle): Promise<AftercareRow[]> {
  const rows = planRowsOf(b).filter((m) => m.status === "STARTED");
  const goalIds = rows.map((m) => m.goalId).filter((g): g is string => !!g);
  const practiceIds = rows.flatMap((m) => m.items.filter((i) => i.kind === "PRACTICE" && i.templateId).map((i) => i.templateId as string));
  const templates = new Map((await e.io.templates(userId, [...goalIds, ...practiceIds])).map((t) => [t.id, t]));
  const closedRoadmap = b.roadmap.status === "DONE" || b.roadmap.status === "ARCHIVED";
  const out: AftercareRow[] = [];
  for (const m of rows) {
    const goal = m.goalId ? templates.get(m.goalId) : undefined;
    // Finished: the roadmap closed, the goal closed or archived, or the position started again (a superseded row).
    const finished = closedRoadmap || superseded(b, m) || (goal != null && (goal.closedScore != null || goal.archivedAt != null));
    if (!finished) continue;
    // "Keep on Today" was answered for these: the row stops asking (StartSnapshot.aftercareKept).
    const kept = new Set(aftercareKeptOf(m.feasibility));
    for (const i of m.items) {
      if (i.kind !== "PRACTICE" || !i.templateId || kept.has(i.templateId)) continue;
      const t = templates.get(i.templateId);
      if (t && !t.archivedAt && !out.some((r) => r.templateId === t.id)) out.push({ templateId: t.id, title: t.title, milestoneOrd: m.ord });
    }
  }
  return out;
}

/**
 * Practice aftercare's "Keep on Today" (fix round): appends the practice's
 * template id to its finished milestone's StartSnapshot.aftercareKept, so
 * practiceAftercare stops listing it. Under the milestone's guard; a repeat
 * tap changes nothing. `milestoneId` names the roadmap; the practice is
 * found on whichever finished milestone of it holds the template.
 */
export async function keepOnTodayCore(userId: string, milestoneId: string, templateId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  if (typeof templateId !== "string" || !templateId) return fail("That practice is no longer here.");
  const res = await withRetry<null>(async () => {
    const roadmapId = await e.store.ownerOf(userId, { milestoneId });
    const b = roadmapId ? await e.store.bundle(userId, roadmapId) : null;
    if (!b) return fail("That milestone no longer exists.");
    const listed = await aftercareOf(e, userId, b);
    const holders = planRowsOf(b).filter((m) => m.status === "STARTED" && m.items.some((i) => i.kind === "PRACTICE" && i.templateId === templateId));
    const row = holders.find((m) => m.id === milestoneId) ?? holders[0];
    if (!row) return fail("That practice is no longer here.");
    if (aftercareKeptOf(row.feasibility).includes(templateId)) return ok(null);
    if (!listed.some((r) => r.templateId === templateId)) return fail("That practice isn't waiting for an answer.");
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "MILESTONE_IS", id: row.id, statuses: ["STARTED"] } },
      { op: "keepAftercare", milestoneId: row.id, templateId },
    ]);
    return out === "ok" ? ok(null) : "stale";
  });
  void now;
  invalidate("roadmap");
  return res;
}

// ═══ Views (F18, F19) ═══════════════════════════════════════════════════════

interface ViewData {
  b: RoadmapBundle;
  today: DayKey;
  ctx: Pick<PlanContext, "domains" | "today">;
  tree: TreeField[];
  readings: Reading[];
  logs: Reading[];
  templates: Map<string, TemplateLite>;
  /** goalId → the day its goal paid (the roadmap's goals): a lineage that paid states 0 "already paid on 3 Mar". */
  payments: Record<string, DayKey>;
  /** Held days (rest, vacation, freezes) from the earliest started milestone's start to today: what "planned so far" leaves out. */
  pastHeld: DayKey[];
  writesOff: boolean;
}

/** The roadmap a view shows: the open one, else the latest done or archived (a discarded draft never). */
function pickRoadmap(rows: readonly RoadmapRec[]): RoadmapRec | null {
  const sorted = [...rows].sort(latestFirst);
  return sorted.find(isOpen) ?? sorted.find((r) => r.status === "DONE" || (r.status === "ARCHIVED" && r.archiveReason !== DISCARDED_REASON)) ?? null;
}

async function viewData(e: Env, userId: string, b: RoadmapBundle, now: Date, deps: RoadmapDeps): Promise<ViewData> {
  const today = todayKey(now);
  const rows = [...planRowsOf(b), ...draftRowsOf(b)];
  const keys = new Set<string>([proficiencyKey(b.roadmap.id)]);
  for (const m of rows) for (const x of m.measures) if (x.measureKey) keys.add(x.measureKey);
  for (const t of endStateOf(currentAcceptance(b))) keys.add(t.measureKey);
  const lineages = rows.flatMap((m) => m.items.filter((i) => i.kind === "CHECKPOINT" && NONCE.test(i.lineageId)).map((i) => i.lineageId));
  const templateIds = rows.flatMap((m) => [m.goalId, ...m.items.map((i) => i.templateId)]).filter((x): x is string => !!x);
  const goalIds = Array.from(new Set(b.milestones.map((m) => m.goalId).filter((g): g is string => !!g)));
  const from = addDays(today, -READINGS_LOOKBACK_DAYS);
  const firstStart = planRowsOf(b).filter(isCarried).map((m) => m.startedDay).filter((d): d is DayKey => !!d && d <= today).sort()[0] ?? null;
  const [tree, readings, logs, templates, payments, pastRest] = await Promise.all([
    e.io.fieldTree(),
    e.store.readings(userId, [...keys], from),
    e.store.selfLogs(userId, lineages.map(checkpointLogPrefix)),
    e.io.templates(userId, templateIds),
    goalIds.length
      ? e.io.goalPayments(userId, goalIds).catch((err: unknown) => {
          console.error("roadmap: goal payments unavailable:", err);
          return {} as Record<string, DayKey>;
        })
      : Promise.resolve({} as Record<string, DayKey>),
    firstStart
      ? e.io.restRows(userId, firstStart, today).catch((err: unknown) => {
          console.error("roadmap: rest days unavailable (planned-so-far counts them):", err);
          return [] as RestRow[];
        })
      : Promise.resolve([] as RestRow[]),
  ]);
  return {
    b,
    today,
    ctx: { domains: domainFactsOf(tree), today },
    tree,
    readings,
    logs,
    templates: new Map(templates.map((t) => [t.id, t])),
    payments,
    pastHeld: firstStart ? Array.from(heldDaysOf(pastRest, firstStart, today)).sort() : [],
    writesOff: writesOff(deps),
  };
}

/** The one due day of a milestone in a view: its goal's once started (a Reschedule moves only that), else its own. */
function dueDayIn(v: Pick<ViewData, "templates">, m: Pick<MilestoneRec, "dueDay" | "goalId">): DayKey | null {
  return milestoneDueDayOf(m.dueDay, m.goalId ? (v.templates.get(m.goalId)?.dueDay ?? null) : null);
}

function areaChipOf(r: RoadmapRec, tree: readonly TreeField[]): AreaChip {
  if (r.fieldId) {
    const f = tree.find((x) => x.id === r.fieldId);
    if (f) return { kind: "FIELD", fieldId: f.id, name: f.name, level: f.level };
  }
  return { kind: "TRACK", track: isOneOf(ROADMAP_TRACKS, r.track) ? r.track : DEFAULT_FIELD_TRACK };
}

/** The roadmap's reality-check figure differs from the one the stored aim check was worked out on (added or changed since). */
function aimFigureMoved(check: AimCheck, r: Pick<RoadmapRec, "typicalHours" | "typicalHoursSource">): boolean {
  if (check.kind !== "checked") return r.typicalHours != null;
  return check.typicalHours !== r.typicalHours || (check.source ?? null) !== (r.typicalHoursSource ?? null);
}

function aimCheckOf(r: RoadmapRec, acc: AcceptanceRec | null): AimCheck {
  const f = feasibilityOfAcceptance(acc);
  if (f?.aimCheck) return f.aimCheck;
  return { kind: "unchecked" };
}

/** "Target lowered 60 → 50 on 12 Nov (re-plan)": the current acceptance lowered (or re-scoped) an end-state target, within TARGET_LOWERED_SHOW_DAYS. */
function targetLoweredOf(b: RoadmapBundle, today: DayKey): TargetLowered | null {
  const live = b.acceptances.filter((a) => a.undoneAt == null && a.version <= b.roadmap.version);
  if (live.length < 2) return null;
  const cur = live[live.length - 1];
  const prev = live[live.length - 2];
  if (daysBetween(cur.day, today) > TARGET_LOWERED_SHOW_DAYS) return null;
  const before = endStateOf(prev);
  for (const t of endStateOf(cur)) {
    const p = parseMeasureKey(t.measureKey);
    if (p?.kind !== "CARDS_AT_LEVEL") continue;
    const same = before.find((x) => x.measureKey === t.measureKey);
    if (same && t.target < same.target) return { measureKey: t.measureKey, on: cur.day, from: same.target, to: t.target };
    const sameScope = before.find((x) => {
      const q = parseMeasureKey(x.measureKey);
      return q?.kind === "CARDS_AT_LEVEL" && (scopeKeyOf(q.domainIds) === scopeKeyOf(p.domainIds) || q.level !== p.level) && x.measureKey !== t.measureKey;
    });
    if (sameScope && (t.target < sameScope.target || (parseMeasureKey(sameScope.measureKey) as { level: number }).level > p.level)) {
      return { measureKey: t.measureKey, on: cur.day, from: sameScope.target, to: t.target };
    }
  }
  return null;
}

function headerOf(e: Env, v: ViewData): RoadmapHeader {
  const r = v.b.roadmap;
  const acc = currentAcceptance(v.b);
  let nonEnglish = false;
  try {
    nonEnglish = e.lanes.isNonEnglish(r.aim);
  } catch {
    nonEnglish = false;
  }
  return {
    id: r.id,
    aim: r.aim,
    area: areaChipOf(r, v.tree),
    status: r.status as RoadmapStatus,
    startDay: r.startDay,
    targetDay: r.targetDay,
    version: r.version,
    acceptedDay: acc?.day ?? null,
    firstAcceptedDay: r.firstAcceptedDay,
    reachedDay: r.reachedDay,
    doneDay: r.doneAt ? dayKeyOf(r.doneAt) : null,
    doneReason: r.doneReason,
    archivedDay: r.archivedAt ? dayKeyOf(r.archivedAt) : null,
    archiveReason: r.archiveReason,
    hoursPerWeek: r.hoursPerWeek,
    intensity: isOneOf(INTENSITIES, r.intensity) ? r.intensity : "STEADY",
    track: isOneOf(ROADMAP_TRACKS, r.track) ? r.track : DEFAULT_FIELD_TRACK,
    credential: isCredentialAim(r.aim, r.examLabel),
    nonEnglish,
    hasSyllabus: intakeOf(r).syllabus != null,
    constraints: r.constraints,
    examLabel: r.examLabel,
    aimCheck: aimCheckOf(r, acc),
    over: !!acc?.overAccepted || planRowsOf(v.b).some((m) => m.overAccepted),
    targetLowered: targetLoweredOf(v.b, v.today),
    // Revision 4: the depth, who set the date and what it assumed (a date the app set is never called "your choice"), the exam's date.
    depth: depthOf(r),
    dateMode: dateModeOf(r),
    examDay: r.examLabel ? (r.examDay ?? null) : null,
    dateOrigin: feasibilityOfAcceptance(acc)?.dateCheck?.dateOrigin ?? null,
    legacy: legacyOf(v.b),
    // The plan's chosen Domains: "Start again at a depth" carries them into the new intake (F-R4-16; fix round).
    domainIds: [...r.domainIds],
  };
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * A stored report as the page reads it: its three lists and, on a v3 Gemini
 * run, its integrity verdict (RunFacts' integrity line, "Drafted by" keyed on
 * the cause, the gap names not shown). The integrity is rebuilt field by
 * field from what the walk stores — the verdict, violation codes with their
 * normalised paths (schema keys, indexes and "<extra>" only), and counts —
 * so nothing else a stored JSON might hold reaches a view. A starter
 * fallback's `fallback` marker stays on the row.
 */
function reportOf(raw: unknown): ValidationReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof ValidationReport, unknown>>;
  if (!Array.isArray(r.dropped) || !Array.isArray(r.flagged) || !Array.isArray(r.notes)) return null;
  const integrity = integrityOfStored(r.integrity);
  return { dropped: r.dropped as ValidationReport["dropped"], flagged: r.flagged as ValidationReport["flagged"], notes: r.notes as ValidationReport["notes"], ...(integrity ? { integrity } : {}) };
}

/** A stored ValidationIntegrity, rebuilt from its known fields (a path made safe again); null when it isn't one. */
function integrityOfStored(raw: unknown): ValidationIntegrity | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Partial<Record<keyof ValidationIntegrity, unknown>>;
  const verdict = x.verdict === "CLEAN" || x.verdict === "SALVAGED" || x.verdict === "REJECTED" ? x.verdict : null;
  if (!verdict) return null;
  const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const violations: IntegrityViolation[] = (Array.isArray(x.violations) ? x.violations : [])
    .filter((v): v is { code: string; path?: unknown } => !!v && typeof v === "object" && typeof (v as { code?: unknown }).code === "string")
    .slice(0, 50)
    .map((v) => ({ code: v.code as IntegrityViolation["code"], path: storedPathOf(v.path) }));
  const byClause: Record<string, number> = {};
  if (x.notANameByClause && typeof x.notANameByClause === "object") {
    for (const [k, v] of Object.entries(x.notANameByClause as Record<string, unknown>)) if (/^[a-z-]{1,40}$/.test(k)) byClause[k] = count(v);
  }
  return { verdict, violations, modelChars: count(x.modelChars), gapsKept: count(x.gapsKept), gapsHidden: count(x.gapsHidden), gapsDropped: count(x.gapsDropped), notANameByClause: byClause };
}

/** The property names a keys-only schema issues (R3's keysOnlySchemaOf): the only words a stored path may keep. */
const SCHEMA_PATH_WORDS = /^(needs|stages|gaps|lines|practices|steps|checkpoint|kind|on|FOUNDATION|FAMILIAR|RETAINED|FLUENT|MASTERED|STAGE_[1-5])$/;

/** A stored violation path, re-made safe on read (as the report-path-hygiene monitor reads it): schema property names, indexes and "<extra>" only, cut to REPORT_PATH_SEGMENT_MAX. */
function storedPathOf(raw: unknown): string {
  const segments = String(typeof raw === "string" ? raw : "")
    .split(".")
    .filter((seg) => seg.length > 0)
    .map((seg) => (SCHEMA_PATH_WORDS.test(seg) || /^\d{1,6}$/.test(seg) || seg === REPORT_EXTRA_SEGMENT ? seg : REPORT_EXTRA_SEGMENT));
  return Array.from(segments.join(".")).slice(0, REPORT_PATH_SEGMENT_MAX).join("");
}

/** RoadmapRun.report.fallback: "STARTER" on a FAILED Gemini run that wrote R2's starter in its place. */
function fallbackOf(report: unknown): string | null {
  const f = report && typeof report === "object" ? (report as { fallback?: unknown }).fallback : null;
  return typeof f === "string" ? f : null;
}

/** At most this many FAILED Gemini runs are read in full (light rows carry no report) while looking for the rows' writer. */
const WRITER_FULL_READS = 6;

/**
 * Who wrote the rows on screen (fix round): roadmap-types rowsWriterOf over
 * the runs, newest first. A CAPPED run, a RUNNING one and a FAILED one that
 * wrote nothing never relabel the rows; a FAILED one that wrote the starter
 * reads STARTER (its report is read in full to see the marker).
 */
async function rowsWriterFor(e: Env, b: RoadmapBundle, full: RunRec | null): Promise<{ wrote: RunView["wrote"]; runId: string | null }> {
  const seen: { kind: string; status: string; fallback: string | null }[] = [];
  let reads = 0;
  for (const r of b.runs) {
    let fallback: string | null = null;
    if (r.status === "FAILED" && r.kind === "GEMINI") {
      if (full && full.id === r.id) fallback = fallbackOf(full.report);
      else if (reads < WRITER_FULL_READS) {
        reads += 1;
        fallback = fallbackOf((await e.store.run(r.id).catch(() => null))?.report);
      }
    }
    seen.push({ kind: r.kind, status: r.status, fallback });
    const w = rowsWriterOf(seen);
    if (w) return { wrote: w, runId: r.id };
  }
  return { wrote: null, runId: null };
}

/**
 * The latest run's facts. Its report is the one of the run that wrote the
 * rows on screen (`writer`, read in full) when the latest wrote none (a
 * CAPPED "Draft again", a RUNNING or failed redraft), so "What was dropped"
 * stays about the rows shown.
 */
function runViewOf(b: RoadmapBundle, full: RunRec | null, now: Date, wrote: RunView["wrote"] = null, writer: RunRec | null = null): RunView | null {
  const latest = b.runs[0];
  if (!latest) return null;
  return runViewFor(b, full && full.id === latest.id ? full : latest, now, wrote, writer);
}

/**
 * The run that wrote the ACCEPTED version (fix round 2; RoadmapView
 * .acceptedRun): roadmap-types acceptedRunOf over the runs of that version
 * (a FAILED Gemini run's starter marker read in full), itself read in full
 * so RunFacts and "What was dropped" describe the accepted rows. A pending
 * re-plan run, a CAPPED "Draft again" and a FAILED attempt never relabel
 * it. null: nothing accepted, or no run of that version wrote rows.
 */
async function acceptedRunFor(e: Env, b: RoadmapBundle, latestFull: RunRec | null, now: Date): Promise<RunView | null> {
  const acc = currentAcceptance(b);
  if (!acc) return null;
  const fulls = new Map<string, RunRec>();
  if (latestFull) fulls.set(latestFull.id, latestFull);
  const readFull = async (id: string): Promise<RunRec | null> => {
    const have = fulls.get(id);
    if (have) return have;
    const r = await e.store.run(id).catch(() => null);
    if (r) fulls.set(id, r);
    return r;
  };
  const seen: (RunRec & { fallback: string | null })[] = [];
  let reads = 0;
  for (const r of b.runs) {
    if (r.version !== acc.version) continue;
    let fallback: string | null = null;
    if (r.status === "FAILED" && r.kind === "GEMINI" && (fulls.has(r.id) || reads < WRITER_FULL_READS)) {
      if (!fulls.has(r.id)) reads += 1;
      fallback = fallbackOf((await readFull(r.id))?.report);
    }
    seen.push({ ...r, fallback });
    if (runWriterOf({ kind: r.kind, status: r.status, fallback })) break;
  }
  const pick = acceptedRunOf(seen, acc.version);
  if (!pick) return null;
  const full = await readFull(pick.id);
  return runViewFor(b, full ?? pick, now, runWriterOf(pick), null);
}

/** A run's facts as RunFacts shows them (`wrote`: who wrote the rows on screen; `writer`: that run, whose report stands in when this one has none). */
function runViewFor(b: RoadmapBundle, run: RunRec, now: Date, wrote: RunView["wrote"], writer: RunRec | null): RunView {
  const latencies = b.runs.filter((r) => r.kind === "GEMINI" && r.latencyMs != null).map((r) => r.latencyMs as number);
  const usual = latencies.length >= LATENCY_MIN_RUNS ? median(latencies) : null;
  return {
    id: run.id,
    kind: run.kind as RunKind,
    status: run.status as RunStatus,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    model: run.model,
    modelVersion: run.modelVersion,
    promptVersion: run.promptVersion,
    drafts: run.kind === "GEMINI" ? ROADMAP_SAMPLES : 0,
    stale: run.status === "RUNNING" && now.getTime() - run.startedAt.getTime() >= RUN_STALE_MS,
    usualSeconds: usual != null ? Math.round(usual / 1000) : null,
    error: run.error,
    report: reportOf(run.report) ?? (writer && writer.id !== run.id ? reportOf(writer.report) : null),
    // The header's lead line and the fallback banner key on these, never on the latest run's own kind or status.
    wrote,
    capped: run.status === "CAPPED",
  };
}

/** The class a measure line is worked out on: the weakest among its Domain items (or practice items). */
function basisClassOf(m: MilestoneDraft, x: MeasureSpec): ComputedClass {
  const items =
    x.kind === "CARDS_AT_LEVEL"
      ? m.items.filter((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId && (x.scope.domainIds ?? []).includes(i.domainId))
      : x.kind === "PRACTICE_KEPT"
        ? m.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && (x.scope.itemLineageIds ?? []).includes(i.lineageId))
        : [];
  return weakest(...items.map((i) => provenanceOf(i.origin, i.decision)));
}

/**
 * One paying measure's projection (F11) from today's card states, the pass
 * rate and the measured pace (cards), or from the kept share so far and the
 * units still planned (practice). The pipeline alone; null when unreadable.
 */
function paceOfMeasure(
  e: Env,
  ctx: PlanContext,
  readings: readonly Reading[],
  m: { dueDay: DayKey | null; reachedDay: DayKey | null; startedDay: DayKey | null; items: readonly ItemDraft[] },
  x: MeasureSpec,
  pastHeld: readonly DayKey[] = []
): MeasureRowView["pace"] {
  try {
    if (x.kind === "CARDS_AT_LEVEL" && x.minLevel != null && x.scope.domainIds?.length) {
      const ids = x.scope.domainIds;
      const pass = ctx.throughput.passShare;
      return e.lanes.projectCards(
        { minLevel: x.minLevel, target: x.target, baseline: x.baseline, dueDay: m.dueDay ?? ctx.today, reachedDay: m.reachedDay },
        cardStatesOf(ctx, ids).map((c) => effectiveState(c, ctx.today)),
        pass.kind === "measured" ? pass.value : null,
        rateOf(ctx, ids, ctx.intake.fieldId, null).rate,
        ctx.today,
        ctx.m
      );
    }
    if (x.kind === "PRACTICE_KEPT" && x.measureKey && m.startedDay && m.dueDay) {
      const r = latestOf(readings, x.measureKey, ctx.today);
      if (!r) return { kind: "not-measured" };
      const d = (r.detail ?? {}) as { kept?: unknown; effTarget?: unknown };
      const kept = typeof d.kept === "number" ? d.kept : r.value;
      const effTarget = typeof d.effTarget === "number" ? d.effTarget : x.target;
      const lineages = x.scope.itemLineageIds ?? (x.itemLineageId ? [x.itemLineageId] : []);
      const rules = m.items.filter((i) => i.kind === "PRACTICE" && lineages.includes(i.lineageId)).map((i) => practiceRule(i));
      // Planned so far leaves out the held days since Start (pastHeld) as the remaining units leave out those ahead (ctx.held).
      const soFar = rules.reduce((n, rule) => n + plannedUnits(rule, { from: m.startedDay as DayKey, to: ctx.today, startDay: m.startedDay as DayKey }, [...pastHeld, ...ctx.held]), 0);
      const remaining = rules.reduce((n, rule) => n + plannedUnits(rule, { from: addDays(ctx.today, 1), to: m.dueDay as DayKey, startDay: m.startedDay as DayKey }, ctx.held), 0);
      return e.lanes.projectPractice(kept, remaining, soFar > 0 ? kept / soFar : null, effTarget);
    }
  } catch {
    // The projection is R1's; without it the row shows its figure alone.
  }
  return null;
}

/** A milestone's projection: the slowest card measure decides; a practice-only milestone reads its practice pace. */
function milestonePaceOf(e: Env, ctx: PlanContext, v: Pick<ViewData, "readings" | "templates" | "pastHeld">, m: MilestoneBundle): AimCardMilestone["pace"] {
  const d = draftOf(m);
  const facts = { dueDay: dueDayIn(v, m), reachedDay: m.reachedDay, startedDay: m.startedDay, items: d.items };
  const cards = d.measures.filter((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS").map((x) => paceOfMeasure(e, ctx, v.readings, facts, x, v.pastHeld));
  const cardPaces = cards.filter((p): p is PaceResult => p != null && "kind" in p && p.kind !== "short");
  if (cardPaces.length) return pace.slowestPaceOf(cardPaces);
  const practice = d.measures.find((x) => x.kind === "PRACTICE_KEPT" && x.role === "PAYS");
  return practice ? paceOfMeasure(e, ctx, v.readings, facts, practice, v.pastHeld) : null;
}

/**
 * A started practice's sessions so far (fix round): kept from the stored
 * PRACTICE_KEPT detail (byLineage; a one-practice measure keeps it all), and
 * planned over [startedDay, min(today, due)] less the held days since Start
 * ("kept 10 of 16 so far"). null when no reading holds it.
 */
function practiceSoFarOf(
  v: Pick<ViewData, "readings" | "today" | "pastHeld">,
  m: { startedDay: DayKey | null; dueDay: DayKey | null; measures: readonly MeasureSpec[] },
  it: ItemDraft
): { kept: number; of: number } | null {
  if (!m.startedDay) return null;
  const x = m.measures.find((y) => y.kind === "PRACTICE_KEPT" && y.measureKey && ((y.scope.itemLineageIds ?? []).includes(it.lineageId) || y.itemLineageId === it.lineageId));
  const r = x?.measureKey ? latestOf(v.readings, x.measureKey, v.today) : null;
  if (!x || !r) return null;
  const d = (r.detail ?? {}) as { kept?: unknown; byLineage?: Record<string, unknown> };
  const lineages = x.scope.itemLineageIds ?? (x.itemLineageId ? [x.itemLineageId] : []);
  const own = d.byLineage?.[it.lineageId];
  const kept = typeof own === "number" ? own : lineages.length <= 1 ? (typeof d.kept === "number" ? d.kept : r.value) : null;
  if (kept == null) return null;
  const to = m.dueDay && m.dueDay < v.today ? m.dueDay : v.today;
  const of = to < m.startedDay ? 0 : plannedUnits(practiceRule(it), { from: m.startedDay, to, startDay: m.startedDay }, v.pastHeld);
  return { kept, of };
}

function measureRowOfView(e: Env, v: ViewData, m: MilestoneDraft, x: MeasureSpec, paceOf: MeasureRowView["pace"] = null): MeasureRowView {
  const key = x.measureKey ?? (x.kind === "CARDS_AT_LEVEL" && x.minLevel != null && x.scope.domainIds?.length ? cardsAtLevelKey(x.scope.domainIds, x.minLevel) : null);
  const reading = key ? latestOf(v.readings, key, v.today) : null;
  let figure: MeasureRowView["figure"] = null;
  try {
    figure = e.lanes.measureFigureOf({ kind: x.kind }, reading);
  } catch {
    figure = null;
  }
  const value = reading?.value ?? null;
  const detail = (reading?.detail ?? {}) as { effTarget?: unknown };
  const target = x.kind === "PRACTICE_KEPT" && typeof detail.effTarget === "number" ? detail.effTarget : x.target;
  const baseline = x.kind === "CARDS_AT_LEVEL" ? x.baseline : 0;
  return {
    measureKey: key ?? "",
    kind: x.kind,
    role: x.role,
    target,
    baseline,
    figure,
    gained: value != null && baseline != null ? value - baseline : null,
    needed: baseline != null ? target - baseline : null,
    alreadyCounted: x.kind === "CARDS_AT_LEVEL" ? baseline : null,
    pace: paceOf,
    measuredAt: reading?.observedAt ?? null,
    basisClass: basisClassOf(m, x),
  };
}

function stepsOf(m: MilestoneBundle, templates: ReadonlyMap<string, TemplateLite>): GoalStep[] {
  return m.items
    .filter((i) => i.kind === "STEP" && liveItem(i) && i.templateId)
    .map((i) => {
      const t = templates.get(i.templateId as string);
      return { completedDay: t?.completedAt ? dayKeyOf(t.completedAt) : null };
    });
}

function headlineOf(e: Env, v: ViewData, m: MilestoneBundle): { g: number | null; headline: CurrentMilestoneView["headline"]; percent: number | null; observedAt: string | null } {
  try {
    // As of the one due day (the goal's once started): what the close pays on and what reach is judged on.
    const g = e.lanes.milestoneGOn(readingsSeriesMilestoneOf({ ...draftOf(m), id: m.id }), v.readings, stepsOf(m, v.templates), goalAsOf(v.today, dueDayIn(v, m)));
    const h = e.lanes.milestoneHeadlineOf(g);
    return { g: g.g, headline: h?.figure ?? null, percent: h?.percent ?? (g.g != null ? goalPercent(g.g) : null), observedAt: g.binding?.observedAt ?? null };
  } catch {
    return { g: null, headline: null, percent: null, observedAt: null };
  }
}

/**
 * The Aim rank's input (F12), by position: "the most milestones scheduled in
 * one version" counts lineages (maxScheduledPositionsOf: a dropped row and
 * its "Start again" copy are one milestone, so a 3-milestone plan never
 * reaches Paragon), and the reader sees one row per lineage.
 */
function rankInputOf(b: RoadmapBundle, rows: readonly MilestoneBundle[], today: DayKey) {
  const one = onePerLineage(rows);
  // Revision 4 (F-R4-10, F-R4-12): a held stage gives no rank, and the top is the depth's (Paragon only with a
  // standard, depth 12, no coverage below the policy and production from Fluent on). A legacy plan keeps rev 3's top.
  const coverageBelow = (feasibilityOfAcceptance(currentAcceptance(b))?.coverageChoices ?? []).length > 0;
  const depthRank = legacyOf(b) || b.roadmap.version < 1 ? null : depthRankInputOf(b, one.map(draftOf), coverageBelow);
  return {
    milestones: one.map((m) => ({ ord: m.ord, rankIndex: m.rankIndex, reachedDay: m.reachedDay, reachPendingDay: m.reachPendingDay, scheduled: m.status !== "LATER", held: heldRow(m) })),
    roadmapReachedDay: b.roadmap.reachedDay,
    maxScheduled: Math.min(MAX_MILESTONES, maxScheduledPositionsOf(b.milestones)),
    today,
    depthRank,
  };
}

function proficiencyViewFrom(e: Env, v: ViewData): ProficiencyView | null {
  const key = proficiencyKey(v.b.roadmap.id);
  const cur = latestOf(v.readings, key, v.today);
  if (!cur) return null;
  const monday = weekStartKeyOf(v.today);
  const before = latestOf(v.readings, key, addDays(monday, -1));
  try {
    return e.lanes.proficiencyViewOf(cur, before && before.day < monday ? before : null, v.today, false);
  } catch {
    return null;
  }
}

function milestoneRowsOf(e: Env, v: ViewData, rank: AimRankView | null): MilestoneRowView[] {
  // A stage dropped when the depth was lowered stays on the list ("dropped when the depth was lowered on 5 Oct"), out of the plan.
  const lowered = v.b.milestones.filter((m) => m.version === v.b.roadmap.version && m.status === "DISCARDED" && storedNotes(m.feasibility).includes("DEPTH_LOWERED"));
  const rows = [...planRowsOf(v.b), ...lowered].sort(byOrd);
  const nextPlanned = rows.find((m) => m.status === "PLANNED" && m.reachedDay == null && !heldRow(m))?.id ?? null;
  // A Gemini title's NUMBER spans, struck here as in the review (the same derivation: R3's withLabelChecks; fix round 2).
  const struck = new Map(labelChecksOf(e, v.b, v.tree, rows.map(draftOf), positionCountOf(rows.filter(scheduled))).map((d) => [d.id, d.titleStruck]));
  return rows.map((m) => {
    const goal = m.goalId ? v.templates.get(m.goalId) : undefined;
    const replaced = superseded(v.b, m);
    const h = isCarried(m) && !replaced ? headlineOf(e, v, m) : { percent: null };
    const due = dueDayIn(v, m);
    let state: MilestoneRowState;
    if (m.reachedDay) state = "REACHED";
    else if (m.reachPendingDay && !replaced) state = "PENDING_REACH";
    else if (m.status === "LATER") state = "LATER";
    else if (m.status === "DISCARDED") state = "DROPPED";
    else if (m.status === "PLANNED") state = m.id === nextPlanned ? "PLANNED" : "OUTLINE";
    // Replaced by its "Start again" copy: dropped, whatever its goal did since (it is never measured again).
    else if (replaced || (goal?.archivedAt && goal.closedScore == null)) state = "DROPPED";
    else if (goal && goal.closedScore != null) state = "CLOSED_UNREACHED";
    else if (m.status === "STARTED" && due && due < v.today) state = "PAST_DUE";
    else if (m.status === "STARTED" && slipped(v, m)) state = "SLIPPED";
    else state = "CURRENT";
    const gave =
      m.reachedDay && m.rankIndex != null && daysBetween(m.reachedDay, v.today) < RANK_NEW_DAYS && rank && rank.index >= m.rankIndex ? aimRankName(m.rankIndex) : null;
    const titleStruck = struck.get(m.id);
    return {
      id: m.id,
      lineageId: m.lineageId,
      ord: m.ord,
      title: m.title,
      titleClass: provenanceOf(m.titleOrigin as Origin, m.titleDecision as Decision),
      ...(titleStruck?.length ? { titleStruck } : {}),
      state,
      windowStart: m.windowStart,
      dueDay: due,
      percent: h.percent,
      rankIndex: m.rankIndex,
      gaveRank: gave,
      reachedDay: m.reachedDay,
      countsFrom: m.reachPendingDay && !replaced ? addDays(m.reachPendingDay, REACH_CONFIRM_DAYS) : null,
      closedPercent: goal?.closedScore != null ? goalPercent(goal.closedScore) : null,
      // Revision 4: the stage ("Milestone 2 · Familiar (level 6)"), its gate level, and "Held when you began" (no rank).
      stage: isStageKey(m.stage) ? m.stage : null,
      gateLevel: gateLevelOf(draftOf(m)),
      held: heldRow(m),
    };
  });
}

/** SLIPPED: a paying card measure reads below its baseline. */
function slipped(v: ViewData, m: MilestoneBundle): boolean {
  return m.measures.some((x) => {
    if (x.kind !== "CARDS_AT_LEVEL" || x.role !== "PAYS" || !x.measureKey || x.baseline == null) return false;
    const r = latestOf(v.readings, x.measureKey, v.today);
    return r != null && r.value < x.baseline;
  });
}

/** The current milestone: STARTING, or STARTED with an open goal (a superseded row never), else the next PLANNED one. */
function currentRowOf(v: ViewData): MilestoneBundle | null {
  const rows = planRowsOf(v.b);
  return (
    rows.find((m) => !superseded(v.b, m) && (m.status === "STARTING" || (m.status === "STARTED" && goalOpen(m, v.templates)))) ??
    // A stage held when you began is never the next one (it is reached and never starts).
    rows.find((m) => m.status === "PLANNED" && m.reachedDay == null && !heldRow(m)) ??
    null
  );
}

function currentViewOf(e: Env, v: ViewData, ctx: PlanContext, m: MilestoneBundle): CurrentMilestoneView {
  const carried = isCarried(m);
  const due = dueDayIn(v, m);
  const count = positionCountOf(planRowsOf(v.b).filter(scheduled));
  // Its words re-checked (titleFlags, struck spans, reasons), and the one due day once started.
  const d: MilestoneDraft = labelChecksOf(e, v.b, v.tree, [{ ...draftOf(m), dueDay: carried ? due : m.dueDay }], count)[0];
  const goal = m.goalId ? v.templates.get(m.goalId) : undefined;
  const h = carried ? headlineOf(e, v, m) : { headline: null };
  const cp = d.items.find((i) => i.kind === "CHECKPOINT" && liveItem(i));
  let checkpointLog: CurrentMilestoneView["checkpointLog"] = null;
  if (cp) {
    try {
      const s = e.lanes.checkpointStandingOf(v.logs, cp.lineageId, cp.outOf, cp.bar);
      checkpointLog = s ? { score: s.score, outOf: s.outOf, bar: s.bar, day: s.day } : null;
    } catch {
      checkpointLog = null;
    }
  }
  const snap = startSnapshotOfRow(m);
  const stated = goal?.stated ?? null;
  let zeroReason: CurrentMilestoneView["zeroReason"] = null;
  let paidOn: DayKey | null = null;
  if (!goal) {
    // Not started: what Start would state now (the sheet's default switches: every practice on).
    const s = statedFor(d, payBasisOf(d, planFeasibilityOfRow(m), lineagePaidOnOf(v.b, m, v.payments)));
    zeroReason = s.zeroReason;
    paidOn = s.paidOn;
  } else if (stated === 0) {
    // Started stating 0: the reason, read back with the same arithmetic over what Start froze (a lineage paid before Start).
    const s = statedFor(d, payBasisOf(d, snap ?? planFeasibilityOfRow(m), lineagePaidOnOf(v.b, m, v.payments, m.startedDay)));
    zeroReason = s.zeroReason ?? "KNOWLEDGE_ONLY";
    paidOn = s.paidOn;
  }
  const stepDone: Record<string, DayKey | null> = {};
  const practiceKept: Record<string, { kept: number; of: number }> = {};
  if (carried) {
    for (const it of d.items) {
      if (!liveItem(it) || !it.templateId) continue;
      if (it.kind === "STEP") {
        const t = v.templates.get(it.templateId);
        stepDone[it.lineageId] = t?.completedAt ? dayKeyOf(t.completedAt) : null;
      } else if (it.kind === "PRACTICE" && it.addToToday) {
        const k = practiceSoFarOf(v, { startedDay: m.startedDay, dueDay: due, measures: d.measures }, it);
        if (k) practiceKept[it.lineageId] = k;
      }
    }
  }
  const view: CurrentMilestoneView = {
    milestone: d,
    measures: d.measures
      .filter((x) => x.kind !== "CHECKPOINT")
      .map((x) =>
        measureRowOfView(e, v, d, x, carried ? paceOfMeasure(e, ctx, v.readings, { dueDay: due, reachedDay: m.reachedDay, startedDay: m.startedDay, items: d.items }, x, v.pastHeld) : null)
      ),
    headline: h.headline,
    goalId: m.goalId,
    starting: m.status === "STARTING",
    stated: goal ? stated : null,
    zeroReason,
    paidOn,
    checkpointLog,
    pastDue: m.status === "STARTED" && !!due && due < v.today && goalOpen(m, v.templates),
    stepDone,
    practiceKept,
  };
  // Fix round 2's carry-over: a started milestone's check is its re-fit at Start ("Re-fitted at Start on <day> … then"),
  // never the acceptance's read as today's: its StartSnapshot feasibility and start day (contracts §15.11).
  return { ...view, startFeasibility: snap?.feasibility ?? null, startedDay: m.startedDay ?? null };
}

/** The weakest class over the Domain items in a scope, across the scheduled milestones (an end-state line's basis: "worked out on Gemini's suggested Domains"). */
function endStateBasisOf(rows: readonly MilestoneBundle[], domainIds: readonly string[]): ComputedClass {
  const scope = new Set(domainIds);
  const classes: TextClass[] = [];
  for (const m of rows) {
    if (!scheduled(m)) continue;
    for (const i of m.items) if (i.kind === "DOMAIN" && liveItem(i) && i.domainId && scope.has(i.domainId)) classes.push(provenanceOf(i.origin as Origin, i.decision as Decision));
  }
  return weakest(...classes);
}

/** A Body Area's weight context line (F18 §2): "trend 82.4 kg · your weight goal 78.0 kg by 14 Mar · you logged". Self-logged, context only; null without a trend. */
export function weightLineOf(w: WeightView | null): string | null {
  if (!w || w.trendKg == null || !Number.isFinite(w.trendKg)) return null;
  // A stale trend is never carried forward as news: the last weigh-in, with its day, as the weight card leads with it.
  const parts = [w.stale && w.latest ? `last weigh-in ${formatWeight(w.latest.kg, w.unit)} on ${shortDate(w.latest.day)}` : `trend ${formatWeight(w.trendKg, w.unit)}`];
  if (w.goal.targetKg != null && Number.isFinite(w.goal.targetKg)) parts.push(`your weight goal ${formatWeight(w.goal.targetKg, w.unit)}${w.goal.targetDay ? ` by ${shortDate(w.goal.targetDay)}` : ""}`);
  parts.push("you logged");
  return parts.join(" · ");
}

/**
 * "Toward the aim" (F18): the end state's own meters, each with its words
 * (EndStateTerm.label) and the weakest class over the Domain items in its
 * scope (propagation: "worked out on Gemini's suggested Domains"); positions
 * reached and scheduled (a dropped row and its copy are one); practice kept
 * so far over planned so far; a Body Area's weight line.
 */
function towardOf(e: Env, v: ViewData, ctx: PlanContext | null, weightLine: string | null = null): TowardAimView | null {
  const acc = currentAcceptance(v.b);
  if (!acc) return null;
  const rows = planRowsOf(v.b);
  const terms = endStateOf(acc);
  const measuresView: MeasureRowView[] = terms.map((t) => {
    const reading = latestOf(v.readings, t.measureKey, v.today);
    let figure: MeasureRowView["figure"] = null;
    try {
      figure = e.lanes.measureFigureOf({ kind: "CARDS_AT_LEVEL" }, reading);
    } catch {
      figure = null;
    }
    return {
      measureKey: t.measureKey,
      kind: "CARDS_AT_LEVEL",
      role: "PAYS",
      target: t.target,
      baseline: t.baseline,
      figure,
      gained: reading ? reading.value - t.baseline : null,
      needed: t.target - t.baseline,
      alreadyCounted: t.baseline,
      // The end state's projection: its target by the aim's date (the pipeline alone).
      pace: (() => {
        const parsed = parseMeasureKey(t.measureKey);
        if (!ctx || parsed?.kind !== "CARDS_AT_LEVEL") return null;
        const x: MeasureSpec = {
          id: null,
          kind: "CARDS_AT_LEVEL",
          role: "PAYS",
          scope: { domainIds: parsed.domainIds },
          minLevel: parsed.level,
          target: t.target,
          targetSource: "WORKED_OUT",
          fittedTarget: null,
          rateSource: null,
          baseline: t.baseline,
          baselineDay: t.baselineDay,
          unit: "card",
          itemLineageId: null,
          measureKey: t.measureKey,
        };
        return paceOfMeasure(e, ctx, v.readings, { dueDay: v.b.roadmap.targetDay, reachedDay: v.b.roadmap.reachedDay, startedDay: null, items: [] }, x);
      })(),
      measuredAt: reading?.observedAt ?? null,
      basisClass: (() => {
        const parsed = parseMeasureKey(t.measureKey);
        return parsed?.kind === "CARDS_AT_LEVEL" ? endStateBasisOf(rows, parsed.domainIds) : "WORKED_OUT";
      })(),
      label: t.label,
    };
  });
  // Practice kept since you began: kept over planned so far (held days since Start left out), never the whole window's plan.
  let kept = 0;
  let planned = 0;
  for (const m of rows) {
    if (!isCarried(m) || !m.startedDay) continue;
    const d = draftOf(m);
    const facts = { startedDay: m.startedDay, dueDay: dueDayIn(v, m), measures: d.measures };
    for (const it of d.items) {
      if (it.kind !== "PRACTICE" || !liveItem(it) || !it.addToToday || !it.templateId) continue;
      const k = practiceSoFarOf(v, facts, it);
      if (!k) continue;
      kept += k.kept;
      planned += k.of;
    }
  }
  return {
    measures: measuresView,
    reached: positionCountOf(rows.filter((m) => m.reachedDay != null)),
    scheduled: positionCountOf(rows.filter(scheduled)),
    practiceKept: planned > 0 || kept > 0 ? { share: planned > 0 ? Math.min(1, kept / planned) : null, sessions: kept } : null,
    weightLine,
  };
}

/**
 * Plan history, one row per acceptance record (accepted order). A record
 * lowerDepthCore wrote inside its version (roadmap-types
 * isDepthLoweringRecord) carries `depthLowered` and reads in R1's words,
 * "lowered the depth Mastered → Fluent" (depthChangeLineOf), never as a
 * re-plan's end-target change (fix round 2, contracts §16.2). The flag comes
 * from the record itself, so accept → Undo → accept (a second acceptance of
 * the same version) lowers nothing, and a lowering after an Undo still reads
 * as one.
 */
function historyOf(b: RoadmapBundle): PlanHistoryRow[] {
  const out: PlanHistoryRow[] = [];
  let prev: AcceptanceRec | null = null;
  for (const a of b.acceptances) {
    const lowered = isDepthLoweringRecord(a);
    const changes = lowered
      ? [(prev ? proficiency.depthChangeLineOf(endStateOf(prev), endStateOf(a)) : null) ?? "lowered the depth"]
      : prev
        ? endStateChanges(endStateOf(prev), endStateOf(a))
        : [];
    out.push({ version: a.version, day: a.day, undone: a.undoneAt != null, changes, depthLowered: lowered });
    if (a.undoneAt == null) prev = a;
  }
  return out;
}

/**
 * The draft to review: a DRAFT roadmap's, or an ACTIVE roadmap's pending
 * re-plan (version + 1). Its words come re-checked (R3's withLabelChecks:
 * titles' flags, struck NUMBER spans, reasons; the plan's count includes the
 * carried milestones of a re-plan). The banner is R3's unverifiedAlarmOf
 * over those rows, the one rule (a REMOVED item no longer counts, so
 * removing the flagged items clears it); the footer's target is
 * draftNeedsOf's (fix round 2). The engine reads the carried rows at their
 * one due day, none a copy replaces (`goals`: their goal templates).
 *
 * Revision 4:
 *   - a legacy draft returns no row text at all (milestones []), its banner
 *     and acceptable false (F-R4-16);
 *   - "Not in this plan yet" counts the lines the carried (started)
 *     milestones cover too (fix round 2's carry-over);
 *   - Gemini's Domain additions with their facts, n_d and date effect, and
 *     how they are offered (BULK, or TOGGLES for an exam or non-English aim);
 *     the constraint exclusions and the aim conflict; a body or care plan's
 *     session picks; area suggestions (only while ROADMAP_GAPS_LIVE) and the
 *     count not shown; outline lines tied to no Domain of R; the date check
 *     and the Depth line; who arranged each milestone (F-R4-17 to F-R4-21).
 */
function draftViewOf(
  e: Env,
  b: RoadmapBundle,
  ctx: PlanContext,
  goals: ReadonlyMap<string, GoalFacts>,
  facts: { wrote?: RunView["wrote"]; report?: ValidationReport | null } = {}
): DraftView | null {
  const group = draftRowsOf(b);
  if (group.length === 0) return null;
  if (legacyDraftOf(b)) return legacyDraftViewOf(b, ctx);
  const carriedRows = planRowsOf(b).filter(isCarried);
  const total = positionCountOf([...carriedRows, ...group.filter(scheduled)]);
  const arranged: MilestoneDraft["arrangedBy"] = facts.wrote === "GEMINI" ? "GEMINI" : facts.wrote === "MANUAL" ? "USER" : arrangerOf(catalogOriginOf());
  const drafts = labelChecksOf(e, b, ctx.tree, group.map(draftOf), total).map((d) => ({
    ...d,
    // Who arranged its lines and practice types: the run that wrote the rows, or the user once a line was moved here.
    arrangedBy: d.items.some((i) => i.kind === "TOPIC" && i.origin === "SYLLABUS" && i.decision === "EDITED") ? ("USER" as const) : arranged,
  }));
  const carried = carriedPlanOf(b, group, goals);
  let feasibility: Feasibility;
  try {
    feasibility = feasibilityFor(e, ctx, drafts, carried);
  } catch {
    feasibility = { today: ctx.today, m: ctx.m, milestones: [], aimCheck: { kind: "unchecked" }, basis: [], remedies: [], impossible: false, over: false };
  }
  // The total acceptCore checks against MAX_MILESTONES: positions over the carried rows and the draft's scheduled ones.
  const check = acceptBlockersOf(drafts, feasibility, total, { picksNeedConfirm: picksNeedConfirmOf(b.roadmap) });
  // A line a started milestone covers is in the plan, not "Not in this plan yet" (fix round 2's carry-over).
  const coveredBy = [...drafts.flatMap((d) => d.items), ...carriedRows.filter((m) => !superseded(b, m)).flatMap((m) => m.items.map(itemDraftOf))];
  const used = new Set(coveredBy.filter((i) => i.kind === "TOPIC" && liveItem(i) && i.syllabusRef != null).map((i) => i.syllabusRef as number));
  const lines = ctx.intake.syllabus?.lines ?? [];
  let nonEnglish = false;
  try {
    nonEnglish = e.lanes.isNonEnglish(b.roadmap.aim);
  } catch {
    nonEnglish = false;
  }
  const depth = depthOf(b.roadmap);
  const required = requiredDomainsOf(b, group);
  const lineDomains = ctx.intake.syllabus?.lineDomains;
  const unassignedLines = depth != null ? lines.map((_, i) => i).filter((i) => !lineDomains || lineDomains[i] == null || !required.includes(lineDomains[i] as string)) : [];
  return {
    version: b.roadmap.version + 1,
    milestones: drafts,
    feasibility,
    bulkKeepOff: bulkKeepOff(e, b.roadmap),
    credential: isCredentialAim(b.roadmap.aim, b.roadmap.examLabel),
    nonEnglish,
    alarm: validate.unverifiedAlarmOf(drafts),
    uncoveredSyllabus: lines.map((_, i) => i).filter((i) => !used.has(i)),
    nextLineageId: check.nextLineageId,
    acceptable: check.blockers.length === 0,
    nextToDecide: check.nextToDecide,
    exclusions: exclusionsOf(e, b, ctx, required),
    sessionPicks: sessionPicksOf(b, drafts),
    aimConflict: aimConflictFor(b),
    gaps: ROADMAP_GAPS_LIVE ? gapViewsOf(b, ctx, drafts) : [],
    // "n not shown" counts every gap name not shown: the hidden (ungrounded or flagged) and the dropped (links, non-names).
    gapsHidden: gapsNotShownOf(facts.report?.integrity),
    additions: additionsOf(e, b, ctx, drafts, required),
    additionsMode: isCredentialAim(b.roadmap.aim, b.roadmap.examLabel) || b.roadmap.examLabel || nonEnglish ? "TOGGLES" : "BULK",
    unassignedLines,
    dateCheck: feasibility.dateCheck ?? null,
    depth: depth != null ? depthViewFor(e, ctx, b, required, depth, feasibility, group) : null,
    legacy: null,
  };
}

/** A legacy draft's view (F-R4-16): no milestone, item, title or topic text at all — the banner and its action only. */
function legacyDraftViewOf(b: RoadmapBundle, ctx: Pick<PlanContext, "today" | "m">): DraftView {
  return {
    version: b.roadmap.version + 1,
    milestones: [],
    feasibility: { today: ctx.today, m: ctx.m, milestones: [], aimCheck: { kind: "unchecked" }, basis: [], remedies: [], impossible: false, over: false },
    bulkKeepOff: true,
    credential: isCredentialAim(b.roadmap.aim, b.roadmap.examLabel),
    nonEnglish: false,
    alarm: false,
    uncoveredSyllabus: [],
    nextLineageId: null,
    acceptable: false,
    nextToDecide: null,
    legacy: legacyViewOf(b),
  };
}

/** The kinds the constraint filter leaves out of this plan, each with its word (R3's constraintExclusionsOf over the catalog's kinds for the track). */
function exclusionsOf(e: Env, b: RoadmapBundle, ctx: PlanContext, required: readonly string[]): ConstraintExclusion[] {
  if (!b.roadmap.constraints) return [];
  try {
    const track = catalogTrackOf({ fieldId: b.roadmap.fieldId, track: ctx.intake.track });
    const filter = { track, exam: !!b.roadmap.examLabel, practicesAllowed: b.roadmap.fieldId == null || b.roadmap.practicesAllowed };
    const kinds = [...catalogKindsFor("PRACTICE", filter), ...catalogKindsFor("STEP", filter), ...catalogKindsFor("CHECKPOINT", filter)];
    const names = required.map((id) => ctx.domains.get(id)?.name).filter((n): n is string => !!n);
    return e.lanes.constraintExclusionsOf(b.roadmap.constraints, kinds, { track, domains: names, aim: b.roadmap.aim, exam: b.roadmap.examLabel });
  } catch (err) {
    console.error("roadmap: the constraint exclusions weren't worked out:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** The aim itself meets a negated constraint term (R3's aimConflictOf); null when none or unreadable. */
function aimConflictFor(b: RoadmapBundle): DraftView["aimConflict"] {
  if (!b.roadmap.constraints) return null;
  try {
    return validate.aimConflictOf(b.roadmap.constraints, b.roadmap.aim);
  } catch {
    return null;
  }
}

/** A body or care plan's session picks (F-R4-17): Gemini's picks still waiting (PENDING) or kept; null on any other plan or with none. */
/** Who arranged a draft row (MilestoneDraft.arrangedBy) from an origin; code's is catalogOriginOf() (the provenance grep: no literal here). */
const arrangerOf = (o: Origin): MilestoneDraft["arrangedBy"] => (o === "SYLLABUS" ? "USER" : o);

function sessionPicksOf(b: RoadmapBundle, drafts: readonly MilestoneDraft[]): SessionPicks | null {
  if (!picksNeedConfirmOf(b.roadmap)) return null;
  const picks = drafts.flatMap((d) => d.items.filter(sessionPick));
  if (picks.length === 0) return null;
  const kinds = Array.from(new Set(picks.map((i) => i.catalogKey).filter((k): k is CatalogKey => !!k)));
  return { kinds, constraints: (b.roadmap.constraints ?? "").trim(), decision: picks.some((i) => i.decision === "PENDING") ? "PENDING" : "KEPT" };
}

/**
 * Gemini's Domain additions (F-R4-21), each with its real facts, its n_d at
 * the plan's depth and the realistic date with it (R2's dateEffectOf), shown
 * before anything is confirmed. A toggle is blocked past SPAN_MAX_DAYS or past
 * DEPTH_DOMAINS_MAX Domains. Only those still PENDING are listed.
 *
 * The date effect (fix round 2, contracts §16.9) reads R as it stands (the
 * intake's Domains and any already confirmed), R's coverage over the counts
 * frozen at intake (frozenCountsOf, as the ladder and the end state read
 * them), and each added Domain's own cards: the plan's scopes don't hold a
 * Domain not yet in R, so each one is given as a scope of its own (the
 * reach inputs and the writing rate stay R's).
 */
function additionsOf(e: Env, b: RoadmapBundle, ctx: PlanContext, drafts: readonly MilestoneDraft[], required: readonly string[]): DomainAddition[] {
  const seen = new Map<string, ItemDraft>();
  for (const d of drafts) for (const i of d.items) if (pendingAddition(i) && i.domainId && !seen.has(i.domainId)) seen.set(i.domainId, i);
  if (seen.size === 0) return [];
  let effects: { domainId: string | null; dateWith: DayKey | null; pastSpan: boolean }[] = [];
  try {
    const added = [...seen.keys()];
    const intake = withRequired(ctx.intake, required);
    const input = realismInputOf({ ...ctx, intake }, drafts);
    const withAdded = realismInputOf({ ...ctx, intake }, drafts, added.map((id) => [id]));
    effects = e.lanes.dateEffectOf(intake, { ...input, scopes: withAdded.scopes }, added, frozenCountsOf(ctx, required, ctx.coveragePrior));
  } catch (err) {
    console.error("roadmap: the additions' date effect wasn't worked out:", err instanceof Error ? err.message : err);
  }
  let coverage: CoverageBreakdown[] = [];
  try {
    coverage = coverageFor(e, ctx, [...required, ...seen.keys()], ctx.coveragePrior ?? null);
  } catch {
    coverage = [];
  }
  return [...seen.values()].map((i) => {
    const id = i.domainId as string;
    const facts = ctx.domains.get(id);
    const cards = facts?.cards ?? [];
    const effect = effects.find((x) => x.domainId === id);
    const blocked: DomainAddition["blocked"] = effect?.pastSpan ? "PAST_SPAN" : required.length + 1 > DEPTH_DOMAINS_MAX ? "TOO_MANY_DOMAINS" : null;
    return {
      itemId: i.id,
      domainId: id,
      name: facts?.name ?? i.label,
      cards: cards.length,
      atSix: cards.filter((c) => c.level >= 6).length,
      n: coverage.find((c) => c.domainId === id)?.n ?? coveragePolicyOf(cards.filter((c) => c.type == null || isRecallType(c.type)).length, 0).n,
      dateWith: effect?.dateWith ?? null,
      blocked,
    };
  });
}

/** Area suggestions shown in the panel (F-R4-19; only while ROADMAP_GAPS_LIVE): live GAP rows with the source they were found in. */
function gapViewsOf(b: RoadmapBundle, ctx: PlanContext, drafts: readonly MilestoneDraft[]): GapView[] {
  const names: Record<string, string> = {};
  for (const [id, d] of ctx.domains) names[id] = d.name;
  const sources = groundSourcesOf(b.roadmap, ctx.areaName, names, new Set());
  return drafts.flatMap((d) =>
    d.items
      .filter((i) => i.kind === "GAP" && liveItem(i) && i.id)
      .map((i) => {
        const src = i.groundRef != null ? sources[i.groundRef] : undefined;
        return { itemId: i.id as string, name: i.label, source: { kind: src?.kind ?? "AIM", index: src?.index ?? 0 }, similarTo: null };
      })
  );
}

/** Whether the plan has an outside standard (F-R4-12): a checkpoint with the user's bar and scale on the final stage, or an EXAM_DAY checkpoint. */
function hasStandardOf(rows: readonly MilestoneDraft[]): boolean {
  const kept = rows.filter((m) => m.status !== "LATER" && !heldRow(m)).sort((a, b) => a.ord - b.ord);
  const final = kept[kept.length - 1];
  const standard = (i: ItemDraft) => i.kind === "CHECKPOINT" && liveItem(i) && i.bar != null && i.outOf != null;
  return (!!final && final.items.some(standard)) || kept.some((m) => m.items.some((i) => standard(i) && i.checkpointKind === "EXAM_DAY"));
}

/**
 * A production practice is planned in every kept stage from Fluent on
 * (F-R4-13); vacuously true on a plan with none. "Production" is
 * roadmap-catalog practiceRoleOf's (the one definition, contracts §15.9: the
 * catalog type first, then the method — a typed WRITING or PROJECT_WORK
 * practice counts on a "Write it myself" plan, as R2's basis line says).
 */
function productionFromFluentOf(rows: readonly MilestoneDraft[]): boolean {
  const late = rows.filter((m) => m.status !== "LATER" && !heldRow(m) && (gateLevelOf(m) ?? 0) >= 10);
  return late.every((m) => m.items.some((i) => i.kind === "PRACTICE" && liveItem(i) && i.addToToday && practiceRoleOf(i) === "PRODUCTION"));
}

/** The plan's top-rank facts (F-R4-12): R1's aimRankOf reads them as depthRank, paragonMissingOf names what keeps Paragon closed. */
function depthRankInputOf(b: RoadmapBundle, rows: readonly MilestoneDraft[], coverageBelowPolicy: boolean): DepthRankInput {
  const kept = rows.filter((m) => m.status !== "LATER");
  return {
    depth: depthOf(b.roadmap),
    track: b.roadmap.fieldId == null,
    hasStandard: hasStandardOf(rows),
    keptStages: positionCountOf(kept),
    spanDays: daysBetween(b.roadmap.startDay, b.roadmap.targetDay),
    coverageBelowPolicy,
    productionPlannedFromFluent: productionFromFluentOf(rows),
  };
}

/** "Top rank on this plan: Virtuoso — Paragon needs a standard you set" (F-R4-12): what keeps Paragon closed, first first. */
function paragonMissingFor(b: RoadmapBundle, rows: readonly MilestoneDraft[], coverageBelowPolicy: boolean): ParagonMissing[] {
  return paragonMissingOf(depthRankInputOf(b, rows, coverageBelowPolicy));
}

/**
 * The Depth line (F-R4-15), for the life of the plan: the depth, R's
 * coverage with where each figure came from (the acceptance's own when
 * stored, else worked out now), every coverage choice, the depth choice,
 * each Domain's provenance, whether an outline checks coverage, and the exam
 * waypoint ("By your exam … the plan reaches Retained (level 8)").
 */
function depthViewFor(e: Env, ctx: PlanContext, b: RoadmapBundle, required: readonly string[], depth: AimDepth, f: Feasibility | null, rows: readonly MilestoneBundle[]): DepthView {
  const stored = f as (Feasibility & { coverage?: CoverageBreakdown[] }) | null;
  let coverage: CoverageBreakdown[] = Array.isArray(stored?.coverage) ? (stored?.coverage as CoverageBreakdown[]) : [];
  if (coverage.length === 0) {
    try {
      coverage = coverageFor(e, ctx, required, ctx.coveragePrior ?? null);
    } catch {
      coverage = [];
    }
  }
  const records = f?.domainOrigins ? { coverageChoices: f.coverageChoices ?? [], depthChoice: f.depthChoice ?? null, domainOrigins: f.domainOrigins } : depthRecordsOf(b, rows, required, coverage, ctx.today);
  const draftChoice = rows.map((m) => (m.feasibility as { depthChoice?: DepthChoice } | null)?.depthChoice).find((x) => !!x) ?? null;
  return {
    depth,
    coverage,
    coverageChoices: records.coverageChoices ?? [],
    depthChoice: records.depthChoice ?? draftChoice ?? null,
    domainOrigins: records.domainOrigins ?? {},
    outlineChecked: (ctx.intake.syllabus?.lines.length ?? 0) > 0,
    exam: b.roadmap.examLabel && b.roadmap.examDay ? { day: b.roadmap.examDay, reachLevel: f?.dateCheck?.reachByExam ?? null } : null,
  };
}

function emptyView(today: DayKey, deps: RoadmapDeps, e: Env): RoadmapView {
  return {
    state: "NONE",
    today,
    hasKey: geminiOffered(),
    keyTier: GEMINI_KEY_TIER,
    writesOff: writesOff(deps),
    goalsLive: e.goalsLive,
    header: null,
    run: null,
    acceptedRun: null,
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
  };
}

async function loadRoadmapViewUncached(userId: string, now: Date, deps: RoadmapDeps): Promise<RoadmapView> {
  const e = envOf(deps);
  const today = todayKey(now);
  let rows: RoadmapRec[];
  try {
    rows = await e.store.listRoadmaps(userId);
  } catch (err) {
    if (isMissingRoadmapTable(err)) return emptyView(today, deps, e);
    throw err;
  }
  const pick = pickRoadmap(rows);
  if (!pick) return emptyView(today, deps, e);
  const b = await e.store.bundle(userId, pick.id);
  if (!b) return emptyView(today, deps, e);
  const latest = b.runs[0] ?? null;
  const bodyArea = b.roadmap.fieldId == null && b.roadmap.track === "BODY";
  const [v, fullRun, ctx, throughput, wq, pastWeeks, aftercare, weight] = await Promise.all([
    viewData(e, userId, b, now, deps),
    latest ? e.store.run(latest.id) : Promise.resolve(null),
    // A draft's coverage reads the counts its acceptance would freeze to (contracts §15.3).
    planContext(e, userId, b.roadmap, now, coveragePriorOf(b) ?? draftCoverageOf(draftRowsOf(b))),
    throughputOrNull(e, userId, today),
    b.roadmap.status === "ACTIVE" ? e.lanes.loadWeekQuests(userId, now).catch(() => null) : Promise.resolve(null),
    e.lanes.loadPastWeeks(userId, b.roadmap.id, today).catch(() => []),
    aftercareOf(e, userId, b).catch(() => [] as AftercareRow[]),
    bodyArea ? e.io.weightView(userId, now).catch(() => null) : Promise.resolve(null),
  ]);
  // Who wrote the rows on screen (never the latest run's own kind or status), and that run's report when the latest wrote none.
  const writer = await rowsWriterFor(e, b, fullRun);
  const writerRun = writer.runId && writer.runId !== latest?.id ? await e.store.run(writer.runId).catch(() => null) : null;
  const run = runViewOf(b, fullRun, now, writer.wrote, writerRun);
  // "How this was drafted" on the living roadmap: the run behind the accepted version, never the latest (undefined: not read).
  const acceptedRun = await acceptedRunFor(e, b, fullRun, now).catch((err: unknown) => {
    console.error("roadmap: the accepted version's run unavailable:", err);
    return undefined;
  });
  const draft = draftViewOf(e, b, ctx, v.templates, { wrote: writer.wrote, report: run?.report ?? null });
  return roadmapViewOfData(e, deps, v, ctx, { today, run, acceptedRun, draft, throughput, wq, pastWeeks, aftercare, weight });
}

/** What roadmapViewOfData composes besides the bundle's view data and the planning context: the reads loadRoadmapViewUncached makes. */
interface RoadmapViewParts {
  today: DayKey;
  run: RunView | null;
  acceptedRun: RunView | null | undefined;
  draft: DraftView | null;
  throughput: Throughput | null;
  wq: Awaited<ReturnType<RoadmapLanes["loadWeekQuests"]>> | null;
  pastWeeks: PastWeekView[];
  aftercare: AftercareRow[];
  weight: WeightView | null;
}

/**
 * The roadmap page's view from what was read (sync; loadRoadmapViewUncached
 * reads, then composes here). The hallucination bar's seam composes the same
 * view of a draft in memory (hostileViewsOf), so the RoadmapView it searches
 * is the page's own.
 */
function roadmapViewOfData(e: Env, deps: RoadmapDeps, v: ViewData, ctx: PlanContext, parts: RoadmapViewParts): RoadmapView {
  const { b } = v;
  const { today, run, acceptedRun, draft, throughput, wq, pastWeeks, aftercare, weight } = parts;
  const bodyArea = b.roadmap.fieldId == null && b.roadmap.track === "BODY";
  const header = headerOf(e, v);
  // A plan made before revision 4 (F-R4-16): no milestone, item, title or topic text of it is returned, and it isn't measured.
  const legacy = legacyOf(b);
  // Before any acceptance the aim check is the draft's (it is never a verdict chip beside the aim).
  if (!currentAcceptance(b) && draft) header.aimCheck = draft.feasibility.aimCheck;
  else if (currentAcceptance(b) && aimFigureMoved(header.aimCheck, b.roadmap)) {
    // A figure added after acceptance ("Add a figure"): worked out again from the plan; the acceptance's record stays as it was.
    try {
      const unstarted = planRowsOf(b).filter((m) => !isCarried(m) && !dormantCopy(b, m, v.templates));
      const plan = [...carriedPlanOf(b, unstarted, v.templates), ...unstarted.map(draftOf)];
      header.aimCheck = e.lanes.feasibilityOf(plan, realismInputOf(ctx, plan)).aimCheck;
    } catch (err) {
      console.error("roadmap: aim check not worked out again:", err);
    }
  }
  const status = b.roadmap.status as RoadmapStatus;
  let state: RoadmapViewState = status === "ACTIVE" ? "ACTIVE" : status === "DONE" ? "DONE" : status === "ARCHIVED" ? "ARCHIVED" : "DRAFT";
  if (status === "DRAFT" && run?.status === "RUNNING") state = "RUNNING";
  const planRows = planRowsOf(b);
  let rank: AimRankView | null = null;
  if (status !== "DRAFT") {
    try {
      rank = e.lanes.aimRankOf(rankInputOf(b, planRows, today));
    } catch {
      rank = null;
    }
  }
  const cur = currentRowOf(v);
  let weekQuests: WeekQuestsView | null = null;
  if (wq) {
    // The roadmap variant of the same load (R6), with today's pass rate for "Week quests keep Start's figures".
    const pass = ctx.throughput.passShare;
    try {
      weekQuests = e.lanes.weekQuestsViewFor(wq, "roadmap", pass.kind === "measured" ? { p: pass.value, calibrating: false } : { p: 1, calibrating: true });
    } catch {
      weekQuests = wq.view;
    }
  }
  if (legacy) return legacyRoadmapView(e, deps, b, v, header, state, today, rank, pastWeeks, throughput);
  const accFeasibility = feasibilityOfAcceptance(currentAcceptance(b));
  const depth = depthOf(b.roadmap);
  const required = requiredDomainsOf(b, planRows);
  const planDrafts = planRows.filter((m) => !superseded(b, m)).map(draftOf);
  const coverageBelow = (accFeasibility?.coverageChoices ?? []).length > 0;
  return {
    state,
    today,
    hasKey: geminiOffered(),
    keyTier: GEMINI_KEY_TIER,
    writesOff: writesOff(deps),
    goalsLive: e.goalsLive,
    header,
    run,
    acceptedRun,
    // The plan's milestone count every surface reads (positions: a dropped row and its copy are one; LATER left out), once accepted.
    ...(b.roadmap.version >= 1 ? { positions: positionCountOf(planRows.filter(scheduled)) } : {}),
    draft,
    // Every Field's Domains with their facts (the pickers, Domain rows, "See 3 cards"); never sent to a model.
    library: libraryOf(v.tree),
    rank,
    // A plan not (or no longer) accepted shows no Proficiency: an undone first acceptance's reading is history, not a figure.
    proficiency: status === "DRAFT" ? null : proficiencyViewFrom(e, v),
    toward: towardOf(e, v, ctx, bodyArea ? weightLineOf(weight) : null),
    current: cur ? currentViewOf(e, v, ctx, cur) : null,
    milestones: milestoneRowsOf(e, v, rank),
    weekQuests,
    pastWeeks,
    throughput,
    feasibility: accFeasibility,
    history: historyOf(b),
    triggers: triggersFor(e, v, ctx, wq?.set ?? null),
    aftercare,
    // A writes-off server never schedules the fallback freeze (it records nothing).
    questWeekUnfrozen: !!wq && !wq.frozen && !wq.view.writesOff && !writesOff(deps),
    // Revision 4: the Depth line, the accepted date check, what keeps Paragon closed, and the shown suggestions (F-R4-12, F-R4-15, F-R4-19).
    depth: depth != null && b.roadmap.version >= 1 ? depthViewFor(e, ctx, b, required, depth, accFeasibility, planRows) : null,
    dateCheck: accFeasibility?.dateCheck ?? null,
    paragonMissing: b.roadmap.version >= 1 ? paragonMissingFor(b, planDrafts, coverageBelow) : [],
    legacy: null,
    gaps: ROADMAP_GAPS_LIVE && b.roadmap.version >= 1 ? gapViewsOf(b, ctx, planDrafts) : [],
    gapsHidden: gapsNotShownOf(acceptedRun?.report?.integrity),
  };
}

/**
 * A legacy roadmap's page (F-R4-16): its aim, Area and chosen Domains (the
 * header and the library), the banner with its action, and nothing of its
 * milestones, items, titles, topics, practices or steps — on the page, the
 * draft review and in RunFacts (no report). It isn't measured ("Start again
 * at a depth to measure this aim"): no Proficiency, meters, quests, triggers
 * or aftercare. The rank it gave (none: nothing ever started) stays.
 */
function legacyRoadmapView(
  e: Env,
  deps: RoadmapDeps,
  b: RoadmapBundle,
  v: ViewData,
  header: RoadmapHeader,
  state: RoadmapViewState,
  today: DayKey,
  rank: AimRankView | null,
  pastWeeks: PastWeekView[],
  throughput: Throughput | null
): RoadmapView {
  const hide = (r: RunView | null | undefined): RunView | null => (r ? { ...r, report: null, error: null } : null);
  const latest = b.runs[0] ?? null;
  return {
    state,
    today,
    hasKey: geminiOffered(),
    keyTier: GEMINI_KEY_TIER,
    writesOff: writesOff(deps),
    goalsLive: e.goalsLive,
    header: { ...header, legacy: true },
    run: latest ? hide(runViewFor(b, latest, new Date(), null, null)) : null,
    acceptedRun: null,
    draft: draftRowsOf(b).length ? { ...legacyDraftViewOfBundle(b, today), legacy: legacyViewOf(b) } : null,
    library: libraryOf(v.tree),
    rank,
    proficiency: null,
    toward: null,
    current: null,
    milestones: [],
    weekQuests: null,
    pastWeeks,
    throughput,
    feasibility: null,
    history: historyOf(b),
    triggers: [],
    aftercare: [],
    questWeekUnfrozen: false,
    legacy: legacyViewOf(b),
    depth: null,
    dateCheck: null,
    paragonMissing: [],
    gaps: [],
    gapsHidden: 0,
  };
}

/** legacyDraftViewOf without a plan context (the legacy page reads none). */
function legacyDraftViewOfBundle(b: RoadmapBundle, today: DayKey): DraftView {
  return legacyDraftViewOf(b, { today, m: 1 });
}

/**
 * Every Field's Domains with their real facts (RoadmapView.library, fix
 * round): cards, at level 6+, mastered, the Domain's level and up to 3 card
 * titles for "See 3 cards" (highest level first). Read on the server from
 * the Field tree; nothing here reaches a model.
 */
export function libraryOf(tree: readonly TreeField[]): LibraryDomain[] {
  return tree.flatMap((f) =>
    f.domains.map((d) => {
      const sample = d.cards
        .filter((c) => typeof c.title === "string" && c.title.trim().length > 0)
        .sort((a, b) => b.level - a.level || (a.title as string).localeCompare(b.title as string))
        .slice(0, 3)
        .map((c) => (c.title as string).trim());
      return {
        id: d.id,
        name: d.name,
        fieldId: f.id,
        fieldName: f.name,
        cards: d.cards.length,
        atSix: d.cards.filter((c) => c.level >= 6).length,
        atTop: d.cards.filter((c) => c.level >= TOP_LEVEL).length,
        level: typeof d.level === "number" ? d.level : 1,
        ...(sample.length ? { sample } : {}),
      };
    })
  );
}

/** The re-plan triggers (F11), shown on roadmap surfaces only; [] when they can't be read. */
function triggersFor(e: Env, v: ViewData, ctx: PlanContext, weekSet: WeekQuestSet | null): TriggerHit[] {
  if (v.b.roadmap.status !== "ACTIVE") return [];
  try {
    // Open milestones only (a superseded row is replaced by its copy and never read).
    const rows = planRowsOf(v.b).filter((m) => m.status === "STARTED" && goalOpen(m, v.templates) && !superseded(v.b, m));
    const pass = ctx.throughput.passShare;
    const p = pass.kind === "measured" ? pass.value : null;
    let paceAtAcceptance: RateSource = "NONE";
    let paceNow: RateSource = "NONE";
    const milestones = rows.map((m) => {
      const d = draftOf(m);
      const due = dueDayIn(v, m);
      const cardPaces = d.measures
        .filter((x) => x.kind === "CARDS_AT_LEVEL" && x.minLevel != null && x.scope.domainIds?.length)
        .map((x) => {
          const ids = x.scope.domainIds as string[];
          paceAtAcceptance = (x.rateSource as RateSource | null) ?? paceAtAcceptance;
          paceNow = rateOf(ctx, ids, ctx.intake.fieldId, ctx.intake.newCardsPerWeek).rateSource;
          const cards = cardStatesOf(ctx, ids).map((c) => effectiveState(c, v.today));
          const rate = rateOf(ctx, ids, ctx.intake.fieldId, null).rate;
          return e.lanes.projectCards(
            { minLevel: x.minLevel as number, target: x.target, baseline: x.baseline, dueDay: due ?? v.today, reachedDay: m.reachedDay },
            cards,
            p,
            rate,
            v.today,
            ctx.m
          );
        });
      const pays = d.measures
        .filter((x) => x.role === "PAYS")
        .map((x) => {
          const r = x.measureKey ? latestOf(v.readings, x.measureKey, v.today) : null;
          return { value: r?.value ?? null, baseline: x.baseline, met: r != null && r.value >= x.target };
        });
      // Practice kept so far over planned so far (held days since Start left out), never over the whole window's plan.
      const pk = d.measures.find((x) => x.kind === "PRACTICE_KEPT");
      let keptSoFar = 0;
      let plannedSoFar = 0;
      let readAny = false;
      for (const it of d.items) {
        if (it.kind !== "PRACTICE" || !liveItem(it) || !it.addToToday || !it.templateId) continue;
        const k = practiceSoFarOf(v, { startedDay: m.startedDay, dueDay: due, measures: d.measures }, it);
        if (!k) continue;
        readAny = true;
        keptSoFar += k.kept;
        plannedSoFar += k.of;
      }
      const goal = m.goalId ? v.templates.get(m.goalId) : undefined;
      const card = d.measures.find((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS" && x.minLevel != null);
      const cp = d.items.find((i) => i.kind === "CHECKPOINT" && liveItem(i));
      let checkpoint: { score: number; bar: number } | null = null;
      if (cp && cp.bar != null) {
        const s = e.lanes.checkpointStandingOf(v.logs, cp.lineageId, cp.outOf, cp.bar);
        if (s) checkpoint = { score: s.score, bar: cp.bar };
      }
      return {
        ord: m.ord,
        cardPaces,
        pays,
        practice: pk ? { keptShare: readAny && plannedSoFar > 0 ? keptSoFar / plannedSoFar : null, planned: plannedSoFar } : null,
        // Rescheduled by more than 14 days: the goal's due day against the milestone's own.
        carried: !!(goal?.dueDay && m.dueDay && daysBetween(m.dueDay, goal.dueDay) > 14),
        checkpoint,
        // R1's QUESTS_BEHIND names this milestone and its level and due day ("can still reach level 6 by 13 Dec").
        id: m.id,
        dueDay: due,
        level: card?.minLevel ?? null,
      };
    });
    const hits = e.lanes.triggersOf({ milestones, paceAtAcceptance, paceNow, questWeek: weekSet });
    // CALIBRATED (F-R4-11): an input the accepted dates assumed is measured now; the offer re-dates the unstarted stages only.
    const calibrated = calibratedHitOf(v, ctx);
    return calibrated && !hits.some((h) => h.trigger === "CALIBRATED") ? [...hits, calibrated] : hits;
  } catch (err) {
    // The banner is QUESTS_BEHIND's one surface (R6): a failure here leaves a trace, never a silent gap.
    console.error("roadmap: triggers unavailable:", err);
    return [];
  }
}

/** The words for an input the dates assumed, now measured (F-R4-11, CALIBRATED). */
function calibratedWordsOf(input: CalibratingInput, ctx: PlanContext, sourceRate: number | null): string {
  const pct = (f: ShareFigure) => (f.kind === "measured" ? ` (${Math.round(f.value * 100)}%)` : "");
  if (input === "p") return `Your pass rate is now measured${pct(ctx.throughput.passShare)}.`;
  if (input === "c") return `The share of your due queue you clear is now measured${pct(ctx.throughput.clearance)}.`;
  if (input === "rho") return "How your missed days bunch together is now measured.";
  return `Your pace for new cards is now measured${sourceRate != null ? ` (${Math.round(sourceRate * 10) / 10} a week)` : ""}.`;
}

/**
 * The CALIBRATED offer (F-R4-11): the accepted date check assumed an input
 * (dateOrigin.calibrating) that is measured now, and a stage hasn't started.
 * "Your pass rate is now measured (76%). Re-date the stages you haven't
 * started?" — re-dating never lowers n_d or a level. null otherwise.
 */
function calibratedHitOf(v: ViewData, ctx: PlanContext): TriggerHit | null {
  const offer = calibratedOfferOf(v.b, ctx);
  if (!offer) return null;
  return { trigger: "CALIBRATED", milestoneOrd: null, line: `${calibratedWordsOf(offer.measured[0], ctx, offer.sourceRate)} Re-date the stages you haven't started?` };
}

/**
 * The CALIBRATED offer's facts (one definition: the trigger and [Keep the
 * dates] read it): a depth plan whose current acceptance assumed inputs
 * (dateOrigin.calibrating), some now measured, with a stage still to start.
 * `still`: the assumed inputs that are still calibrating. null: no offer.
 */
function calibratedOfferOf(b: RoadmapBundle, ctx: PlanContext): { assumed: CalibratingInput[]; measured: CalibratingInput[]; still: CalibratingInput[]; sourceRate: number | null } | null {
  if (depthOf(b.roadmap) == null || legacyOf(b)) return null;
  const raw = feasibilityOfAcceptance(currentAcceptance(b))?.dateCheck?.dateOrigin?.calibrating;
  const assumed = Array.isArray(raw) ? raw.filter((x): x is CalibratingInput => typeof x === "string") : [];
  if (assumed.length === 0) return null;
  if (!planRowsOf(b).some((m) => m.status === "PLANNED" && m.reachedDay == null && !heldRow(m))) return null;
  const now = reachOf(ctx, requiredDomainsOf(b, planRowsOf(b)));
  const measured = assumed.filter((x) => !now.calibrating.includes(x));
  if (measured.length === 0) return null;
  return { assumed, measured, still: assumed.filter((x) => now.calibrating.includes(x)), sourceRate: now.sourceRate };
}

/** /you/roadmap, cached 'roadmap:<user>:<today>' on ['roadmap', 'fields', 'ideas', 'life', 'activity']; one read wave; writes nothing. */
export async function loadRoadmapView(userId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapView> {
  if (deps.store) return loadRoadmapViewUncached(userId, now, deps);
  return cached(`roadmap:${userId}:${todayKey(now)}`, ["roadmap", "fields", "ideas", "life", "activity"], () => loadRoadmapViewUncached(userId, now, deps));
}

async function loadAimCardUncached(userId: string, now: Date, deps: RoadmapDeps): Promise<AimCardView | null> {
  const e = envOf(deps);
  const today = todayKey(now);
  let rows: RoadmapRec[];
  try {
    rows = await e.store.listRoadmaps(userId);
  } catch (err) {
    if (isMissingRoadmapTable(err)) return null;
    throw err;
  }
  const open = rows.filter(isOpen).sort(latestFirst)[0] ?? null;
  // A DONE roadmap leads the card only for AIM_DONE_SHOW_DAYS after it ended (F-R4-2); after that the card asks for the next aim.
  const latestDone = [...rows].filter((r) => r.status === "DONE").sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0))[0] ?? null;
  const doneRecent = !!latestDone && (!latestDone.doneAt || daysBetween(dayKeyOf(latestDone.doneAt), today) < AIM_DONE_SHOW_DAYS);
  const done = open ? null : doneRecent ? latestDone : null;
  // LifeSettings.aimSuggestions (one indexed select; null: never set, on). A missing column reads as null (the migration's insurance).
  const settings = await e.io.aimSettings(userId).catch((err: unknown) => {
    if (!isMissingRev4Column(err)) console.error("roadmap: aim suggestions setting unavailable (read as on):", err instanceof Error ? err.message : err);
    return null;
  });
  const base = aimCardBaseOf(e, deps, settings?.aimSuggestions ?? null);
  const pick = open ?? done;
  if (!pick) return { ...base, lastAim: latestDone ? await lastAimOf(e, userId, latestDone, today) : null };
  const b = await e.store.bundle(userId, pick.id);
  if (!b) return base;
  const active = b.roadmap.status === "ACTIVE";
  const [v, wq, ctx] = await Promise.all([
    viewData(e, userId, b, now, deps),
    active ? e.lanes.loadWeekQuests(userId, now).catch(() => null) : Promise.resolve(null),
    // The milestone line's projection reads today's card states, pass rate and pace (cached loaders).
    active ? planContext(e, userId, b.roadmap, now).catch(() => null) : Promise.resolve(null),
  ]);
  return aimCardOfData(e, deps, base, v, ctx, wq, today);
}

/** The EMPTY Aim card every state starts from (its switch: LifeSettings.aimSuggestions, null = never set). */
function aimCardBaseOf(e: Env, deps: RoadmapDeps, aimSuggestions: boolean | null): AimCardView {
  return {
    state: "EMPTY",
    roadmapId: null,
    hasKey: geminiOffered(),
    writesOff: writesOff(deps),
    goalsLive: e.goalsLive,
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
    aimSuggestions,
    lastAim: null,
  };
}

/**
 * The Aim card of an open (or freshly done) roadmap from what was read
 * (sync; loadAimCardUncached reads, then composes here). The hallucination
 * bar's seam composes the same card of a draft in memory (hostileViewsOf).
 */
function aimCardOfData(
  e: Env,
  deps: RoadmapDeps,
  base: AimCardView,
  v: ViewData,
  ctx: PlanContext | null,
  wq: Awaited<ReturnType<RoadmapLanes["loadWeekQuests"]>> | null,
  today: DayKey
): AimCardView {
  const b = v.b;
  const r = b.roadmap;
  const acc = currentAcceptance(b);
  const planRows = planRowsOf(b);
  const card: AimCardView = {
    ...base,
    roadmapId: r.id,
    aim: r.aim,
    area: areaChipOf(r, v.tree),
    targetDay: r.targetDay,
    aimChecked: r.typicalHours != null,
    over: !!acc?.overAccepted || planRows.some((m) => m.overAccepted),
    targetLowered: targetLoweredOf(b, today),
    // The ACCEPTED line says "as measured at acceptance on <day>" only for a reading of that day (isAcceptanceReading).
    acceptedDay: acc?.day ?? null,
    reachedDay: r.reachedDay,
    doneDay: r.doneAt ? dayKeyOf(r.doneAt) : null,
    // Revision 4: the depth and its chip ("Mastered by Nov 2027", "by about Nov 2027 · estimate"), the held depth on a fresh
    // DONE card, and a legacy plan (the aim and its banner's action; no milestone title, F-R4-16).
    depth: depthOf(r),
    dateChip: dateChipOf(b),
    heldDepth: heldDepthOf(b, v.tree, today),
    legacy: legacyOf(b),
  };
  if (card.legacy) {
    const running = b.runs[0]?.status === "RUNNING";
    // The legacy facts the card's banner and "Start again at a depth" read (contracts §16.3): whether Gemini's wording is
    // hidden (LEGACY_GEMINI_HIDDEN), and the old plan's Domains and Area Field for the new intake.
    return { ...card, state: r.status === "DRAFT" ? (running ? "RUNNING" : "DRAFT") : r.status === "DONE" ? "DONE" : "ACCEPTED", draftItems: null, legacyView: legacyViewOf(b) };
  }
  // "A draft is waiting for your check · 6 items": the next draft milestone's rows only (outline items are decided at Start).
  const nextDraft = nextDraftRow(draftRowsOf(b));
  const draftItems = nextDraft ? undecidedRowsOf(draftOf(nextDraft)) : null;
  if (r.status === "DRAFT") {
    const running = b.runs[0]?.status === "RUNNING";
    return { ...card, state: running ? "RUNNING" : "DRAFT", draftItems: draftItems ?? 0 };
  }
  // An ACTIVE roadmap's pending re-plan: the card's "Draft waiting" chip.
  if (r.status === "ACTIVE") card.draftItems = draftItems;
  let rank: AimRankView | null = null;
  try {
    rank = e.lanes.aimRankOf(rankInputOf(b, planRows, today));
  } catch {
    rank = null;
  }
  const proficiencyView = proficiencyViewFrom(e, v);
  const cur = currentRowOf(v);
  let milestone: AimCardMilestone | null = null;
  // ACCEPTED only while no milestone was ever carried (fix round): between milestones (the next still PLANNED after a
  // reach) the card is ACTIVE, so the rank-up's "new" marker, the meter, its change line and its parts stay on it.
  const everCarried = planRows.some(isCarried);
  let state: AimCardState = r.status === "DONE" ? "DONE" : everCarried ? "ACTIVE" : "ACCEPTED";
  if (cur && r.status === "ACTIVE") {
    const of = positionCountOf(planRows.filter(scheduled));
    const titleClass = provenanceOf(cur.titleOrigin as Origin, cur.titleDecision as Decision);
    // A Gemini title's NUMBER spans, struck as on the page (the same derivation; fix round 2).
    const struck = labelChecksOf(e, b, v.tree, [draftOf(cur)], of)[0]?.titleStruck;
    const titleStruck = struck?.length ? { titleStruck: struck } : {};
    if (cur.status === "PLANNED") {
      const d = draftOf(cur);
      const stated = statedFor(d, payBasisOf(d, planFeasibilityOfRow(cur), lineagePaidOnOf(b, cur, v.payments)));
      milestone = {
        id: cur.id,
        ord: cur.ord,
        of,
        title: cur.title,
        titleClass,
        ...titleStruck,
        status: "PLANNED",
        headline: null,
        percent: null,
        pace: null,
        dueDay: cur.dueDay,
        reachedDay: null,
        countsFrom: null,
        start: {
          stated: stated.stated,
          zeroReason: stated.zeroReason,
          givesRank: cur.rankIndex != null && (!rank || cur.rankIndex > rank.index) ? aimRankName(cur.rankIndex) : null,
          paidOn: stated.paidOn,
        },
        stage: isStageKey(cur.stage) ? cur.stage : null,
        gateLevel: gateLevelOf(d),
      };
      if (!everCarried) state = "ACCEPTED";
    } else {
      const h = headlineOf(e, v, cur);
      // One due day: the goal's once started (a Reschedule moves it), as the close and Today read it.
      const due = dueDayIn(v, cur);
      const pastDue = cur.status === "STARTED" && !!due && due < today;
      milestone = {
        id: cur.id,
        ord: cur.ord,
        of,
        title: cur.title,
        titleClass,
        ...titleStruck,
        status: cur.reachedDay ? "REACHED" : cur.reachPendingDay ? "PENDING_REACH" : pastDue ? "PAST_DUE" : "STARTED",
        headline: h.headline,
        percent: h.percent,
        pace: ctx && cur.status === "STARTED" ? milestonePaceOf(e, ctx, v, cur) : null,
        dueDay: due,
        reachedDay: cur.reachedDay,
        countsFrom: cur.reachPendingDay ? addDays(cur.reachPendingDay, REACH_CONFIRM_DAYS) : null,
        start: null,
        stage: isStageKey(cur.stage) ? cur.stage : null,
        gateLevel: gateLevelOf(draftOf(cur)),
      };
      state = pastDue ? "PAST_DUE" : "ACTIVE";
      card.measuredAt = h.observedAt;
    }
  }
  const counts = wq && wq.view.total > 0 ? { done: wq.view.done, total: wq.view.total } : null;
  return {
    ...card,
    state,
    rank,
    proficiency: proficiencyView,
    milestone,
    measuredAt: proficiencyView?.measuredAt ?? card.measuredAt,
    weekQuests: counts,
    // A writes-off server never schedules the fallback freeze.
    questWeekUnfrozen: !!wq && !wq.frozen && !wq.view.writesOff && !writesOff(deps),
  };
}

/**
 * The rows still waiting on a draft milestone (the review footer's "N items
 * left in milestone 1", and the Aim card's count): an unnamed title or an
 * undecided Gemini one, an unresolved Domain, an undecided Gemini item, a
 * checkpoint without its bar, a placeholder to name.
 */
export function undecidedRowsOf(m: MilestoneDraft): number {
  // One definition with the page's footer, "Next item to decide" and R5's list (roadmap-types draftNeedsOf; fix round 2).
  return draftNeedsOf(m).length;
}

/**
 * The /you Aim card, cached 'aimCard:<user>:<today>' on ['roadmap', 'ideas',
 * 'life', 'activity']. null renders nothing (also on a missing table); the
 * EMPTY state is a view, its dismissal the page's cookie. Writes nothing.
 */
export async function loadAimCard(userId: string, now: Date, deps: RoadmapDeps = {}): Promise<AimCardView | null> {
  try {
    if (deps.store) return await loadAimCardUncached(userId, now, deps);
    return await cached(`aimCard:${userId}:${todayKey(now)}`, ["roadmap", "ideas", "life", "activity"], () => loadAimCardUncached(userId, now, deps));
  } catch (err) {
    // A missing table, or a revision-4 column not yet applied (the migration's insurance): the card renders nothing.
    if (isMissingRoadmapTable(err) || isMissingRev4Column(err)) return null;
    throw err;
  }
}

/**
 * The last aim (F-R4-1, F-R4-2), kept on the character page after its
 * roadmap closed: the latest DONE roadmap's aim (the user's words), the final
 * rank it gave (R1's aimRankOf over its rows: never lost) and the day it was
 * reached, or the day it closed unreached. An ARCHIVED roadmap is never one.
 */
async function lastAimOf(e: Env, userId: string, r: RoadmapRec, today: DayKey): Promise<LastAimView | null> {
  try {
    const b = await e.store.bundle(userId, r.id);
    if (!b) return null;
    let rankIndex = 0;
    try {
      rankIndex = e.lanes.aimRankOf(rankInputOf(b, planRowsOf(b), today)).index;
    } catch {
      rankIndex = 0;
    }
    const doneDay = r.doneAt ? dayKeyOf(r.doneAt) : today;
    return { roadmapId: r.id, aim: r.aim, rankIndex, rankName: aimRankName(rankIndex), reached: r.reachedDay != null, day: r.reachedDay ?? doneDay };
  } catch (err) {
    console.error("roadmap: the last aim unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The Aim card's chip (F-R4-11): "Mastered by Nov 2027", or "by about Nov 2027 · estimate" while an input was a prior. */
function dateChipOf(b: RoadmapBundle): AimCardView["dateChip"] {
  const depth = depthOf(b.roadmap);
  if (depth == null) return null;
  const f = feasibilityOfAcceptance(currentAcceptance(b));
  const check = f?.dateCheck ?? null;
  return { depth, day: b.roadmap.targetDay, estimate: (check?.dateOrigin?.calibrating?.length ?? 0) > 0 };
}

/** A fresh DONE card's held depth (F-R4-2): "Mastered (level 12) in Probability and Inference · confirmed 3 Mar 2028", for RANK_NEW_DAYS after the reach. */
function heldDepthOf(b: RoadmapBundle, tree: readonly TreeField[], today: DayKey): AimCardView["heldDepth"] {
  const depth = depthOf(b.roadmap);
  const reached = b.roadmap.reachedDay;
  if (depth == null || !reached || b.roadmap.status !== "DONE" || daysBetween(reached, today) >= RANK_NEW_DAYS) return null;
  const names = domainFactsOf(tree);
  const required = requiredDomainsOf(b, planRowsOf(b));
  return { depth, domainNames: required.map((id) => names.get(id)?.name).filter((n): n is string => !!n), confirmedDay: reached };
}

// ═══ Revision 4: the aim invitation (F-R4-1 to F-R4-5) ══════════════════════

/** The cookie jar the aim actions write through (Next's cookies() in the action; a fake in the checks). */
export interface AimCookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, opts: { maxAge: number; path: string; sameSite: "lax"; httpOnly: boolean }): void;
  delete(name: string): void;
}

const COOKIE_OPTS = { path: "/", sameSite: "lax" as const, httpOnly: true };

/** A reference an aim step may name: a roadmap or milestone id (cuid or UUID). */
const STEP_REF = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Today's aim step (F-R4-3; AimStep), never through loadAimCard: the user's
 * roadmaps (one read), an open roadmap's rows (one bundle read),
 * LifeSettings.aimSuggestions and epochDay (one indexed select) and the
 * latest DAY_OPEN row before today (one indexed read) — four reads, in two
 * waves; once a milestone has started, its goals' one read (their close
 * days and whether they are open). Cached as 'aimStep:<user>:<today>' on
 * ['roadmap', 'life']; a missing table or revision-4 column gives null.
 * Writes nothing. roadmap-invite todayAimLineOf reads it.
 */
export async function loadAimStep(userId: string, now: Date, deps: RoadmapDeps = {}): Promise<AimStep | null> {
  try {
    if (deps.store) return await loadAimStepUncached(userId, now, deps);
    return await cached(`aimStep:${userId}:${todayKey(now)}`, ["roadmap", "life"], () => loadAimStepUncached(userId, now, deps));
  } catch (err) {
    if (isMissingRoadmapTable(err) || isMissingRev4Column(err)) return null;
    throw err;
  }
}

async function loadAimStepUncached(userId: string, now: Date, deps: RoadmapDeps): Promise<AimStep | null> {
  const e = envOf(deps);
  const today = todayKey(now);
  const [rows, settings, lastOpenBefore] = await Promise.all([
    e.store.listRoadmaps(userId),
    e.io.aimSettings(userId),
    e.io.lastDayOpenBefore(userId, today).catch((err: unknown) => {
      if (isMissingRev4Column(err)) throw err;
      console.error("roadmap: the last day open unavailable (no first-day-back line):", err instanceof Error ? err.message : err);
      return null;
    }),
  ]);
  const sorted = [...rows].sort(latestFirst);
  const done = sorted.find((r) => r.status === "DONE") ?? null;
  const closed = sorted.find((r) => r.status === "DONE" || (r.status === "ARCHIVED" && r.archiveReason !== DISCARDED_REASON)) ?? null;
  const closedDayOf = (r: RoadmapRec): DayKey | null => (r.doneAt ? dayKeyOf(r.doneAt) : r.archivedAt ? dayKeyOf(r.archivedAt) : null);
  const base: AimStep = {
    open: null,
    lastDoneDay: done?.doneAt ? dayKeyOf(done.doneAt) : null,
    lastClosedDay: closed ? closedDayOf(closed) : null,
    epochDay: settings?.epochDay ?? null,
    lastOpenBefore,
    aimSuggestions: settings?.aimSuggestions ?? null,
  };
  const open = sorted.find(isOpen) ?? null;
  if (!open) return base;
  const b = await e.store.bundle(userId, open.id);
  if (!b) return base;
  if (b.roadmap.status === "DRAFT") {
    return { ...base, open: { kind: "DRAFT", roadmapId: b.roadmap.id, savedDay: dayKeyOf(b.roadmap.updatedAt), running: b.runs[0]?.status === "RUNNING" } };
  }
  const acc = currentAcceptance(b);
  const acceptedDay = acc?.day ?? b.roadmap.firstAcceptedDay ?? today;
  // A legacy plan can't start a milestone (F-R4-16): its line never offers one.
  if (legacyOf(b)) return { ...base, open: { kind: "ACTIVE", roadmapId: b.roadmap.id, track: b.roadmap.fieldId == null, acceptedDay, milestones: [] } };
  const plan = onePerLineage(planRowsOf(b).filter((m) => !superseded(b, m)));
  const goalIds = plan.filter((m) => m.status === "STARTED" && m.goalId).map((m) => m.goalId as string);
  const goals = goalIds.length ? new Map((await e.io.templates(userId, goalIds)).map((t) => [t.id, t])) : new Map<string, TemplateLite>();
  const ordered = [...plan].sort(byOrd);
  const milestones: AimStepMilestone[] = ordered.map((m, i) => {
    const d = draftOf(m);
    const goal = m.goalId ? goals.get(m.goalId) : undefined;
    const held = heldRow(m);
    const goalClosed = !!goal && (goal.closedScore != null || goal.archivedAt != null);
    const state: AimStepMilestone["state"] =
      m.status === "LATER"
        ? "LATER"
        : held || m.reachedDay != null || goalClosed
          ? "CLOSED"
          : m.status === "STARTING" || m.status === "STARTED"
            ? "OPEN"
            : "PLANNED";
    const closedDay = state !== "CLOSED" ? null : (m.reachedDay ?? (goal?.completedAt ? dayKeyOf(goal.completedAt) : goal?.archivedAt ? dayKeyOf(goal.archivedAt) : null));
    return {
      id: m.id,
      // Its place in the plan (the copy's "Milestone 2"), counted over the scheduled positions.
      ord: i + 1,
      stage: isStageKey(m.stage) ? m.stage : null,
      gateLevel: gateLevelOf(d),
      state,
      rankIndex: m.rankIndex,
      reachedDay: m.reachedDay,
      held,
      closedDay,
      dueDay: milestoneDueDayOf(m.dueDay, goal?.dueDay ?? null),
    };
  });
  return { ...base, open: { kind: "ACTIVE", roadmapId: b.roadmap.id, track: b.roadmap.fieldId == null, acceptedDay, milestones } };
}

/**
 * "Not now" (F-R4-1, F-R4-3): AIM_PROMPT_COOKIE = 'later:<today>' (maxAge
 * AIM_PROMPT_LATER_MAX_AGE_S, path '/', sameSite lax, httpOnly). No database
 * write, so it works on a writes-off server too. Every × on an aim surface
 * means this; the year-long 'off' value is never written any more.
 */
export async function snoozeAimPromptCore(jar: AimCookieJar, now: Date): Promise<RoadmapActionResult<null>> {
  jar.set(AIM_PROMPT_COOKIE, laterCookieValue(todayKey(now)), { maxAge: AIM_PROMPT_LATER_MAX_AGE_S, ...COOKIE_OPTS });
  return ok(null);
}

/** "Not now: hide this for a week" on Today's DRAFT or START line (F-R4-3): AIM_STEP_COOKIE = '<kind>:<id>:<today>' (maxAge AIM_STEP_COOKIE_MAX_AGE_S). */
export async function snoozeAimStepCore(jar: AimCookieJar, kind: "DRAFT" | "START", id: string, now: Date): Promise<RoadmapActionResult<null>> {
  if (kind !== "DRAFT" && kind !== "START") return fail("That line is no longer here.");
  if (typeof id !== "string" || !STEP_REF.test(id)) return fail("That line is no longer here.");
  jar.set(AIM_STEP_COOKIE, stepCookieValue(kind, id, todayKey(now)), { maxAge: AIM_STEP_COOKIE_MAX_AGE_S, ...COOKIE_OPTS });
  return ok(null);
}

/**
 * The stored switch (F-R4-1, F-R4-5): LifeSettings.aimSuggestions, gated by
 * lifeWritesEnabled (refuses with ROADMAP_WRITES_OFF, writing nothing). false
 * is the lasting no ("Don't suggest this", the Settings switch); true deletes
 * a legacy 'off' cookie and writes 'on:<today>', so the back-off starts again.
 * Revalidates 'life' and 'roadmap'.
 */
export async function setAimSuggestionsCore(userId: string, on: boolean, jar: AimCookieJar, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (on !== true && on !== false) return fail("Turn aim suggestions on or off.");
  const e = envOf(deps);
  const today = todayKey(now);
  try {
    await e.io.writeAimSuggestions(userId, on, today);
  } catch (err) {
    if (isMissingRev4Column(err)) return fail("Aim suggestions arrive with the next update.");
    throw err;
  }
  if (on) {
    if (jar.get(AIM_PROMPT_COOKIE) === "off") jar.delete(AIM_PROMPT_COOKIE);
    jar.set(AIM_PROMPT_COOKIE, onCookieValue(today), { maxAge: AIM_PROMPT_LATER_MAX_AGE_S, ...COOKIE_OPTS });
  }
  invalidate("life", "roadmap");
  return ok(null);
}

// ═══ Revision 4: keep the depth, move the date (F-R4-11) ═══════════════════

/** The words a refused lowering names: "a level above Fluent". */
const depthWordOf = (d: AimDepth): string => `${stageOfLevel(d) ? (stageOfLevel(d) as string).charAt(0) + (stageOfLevel(d) as string).slice(1).toLowerCase() : `level ${d}`}`;

/**
 * LOWER_DEPTH (F-R4-11; the only path that lowers a depth, decision 37):
 * refuses while a STARTING or STARTED stage's gate is above the new depth
 * ("Close or drop milestone 4 first: …"). Otherwise, in one transaction under
 * the roadmap lock:
 *   - a DRAFT roadmap: Roadmap.depth set and the draft re-dated at the new depth;
 *   - an ACTIVE roadmap: Roadmap.depth set; every unstarted stage above it
 *     DISCARDED with DEPTH_LOWERED (R2's lowerDepthPlanOf decides which); the
 *     end state rewritten to the new depth terms in a new acceptance record of
 *     the same version (acceptances are never updated), which carries the
 *     depth choice; one rebased Proficiency reading.
 * The choice ({from, to, day, reason}) is shown for good. No goalMp, no goal
 * touched, and a given rank is never taken back.
 */
export async function lowerDepthCore(userId: string, roadmapId: string, to: AimDepth, reason: "CHOICE" | "EXAM", now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!isAimDepth(to)) return fail("Pick a depth: Fluent or Retained.");
  if (reason !== "CHOICE" && reason !== "EXAM") return fail("Pick a depth: Fluent or Retained.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    const from = depthOf(b.roadmap);
    if (from == null) return fail("Only a plan aimed at a depth has one to lower.");
    if (to >= from) return fail("Pick a depth below the current one.");
    const today = todayKey(now);
    const choice: DepthChoice = { from, to, day: today, reason };
    const tree = await e.io.fieldTree();
    // A started stage working toward a level above the new depth is closed or dropped first.
    const live = planRowsOf(b).filter((m) => isCarried(m) && !superseded(b, m) && m.reachedDay == null);
    const goals = await carriedGoalsOf(e, userId, b);
    const above = live.find((m) => (gateLevelOf(draftOf(m)) ?? 0) > to && (!m.goalId || !goals.get(m.goalId) || (goals.get(m.goalId)?.archivedAt == null && goals.get(m.goalId)?.closedScore == null)));
    if (above) return fail(`Close or drop milestone ${above.ord} first: it is working toward a level above ${depthWordOf(to)}.`);
    const ctx = await planContext(e, userId, { ...b.roadmap, depth: to }, now, coveragePriorOf(b));
    if (b.roadmap.status === "DRAFT") {
      const group = draftRowsOf(b);
      const required = requiredDomainsOf(b, group);
      const redated = redraftOf(e, ctx, group.map(draftOf), [], required);
      if (!redated.ok) return fail(redated.error);
      // Before acceptance the choice rides the draft rows' feasibility; acceptCore records it on the acceptance.
      const feasibility: Feasibility = { ...redated.feasibility, depthChoice: choice, milestones: redated.feasibility.milestones.map((x) => ({ ...x, depthChoice: choice })) };
      const ops: StoreOp[] = [
        { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT"], version: b.roadmap.version } },
        { op: "update", table: "roadmap", where: { id: roadmapId, status: "DRAFT" }, data: { depth: to } },
      ];
      try {
        writeRoadmapRows(ops, { kind: "DRAFT", roadmapId, version: b.roadmap.version + 1, plan: redated.plan, feasibility, now, makeId: e.makeId }, modelTextContextOf(b, tree, true));
      } catch (err) {
        if (!(err instanceof ModelTextError)) throw err;
        logRefusedWrite("lower-depth", err);
        return fail(CHANGE_NOT_SAVED);
      }
      ops.push(...realisticDateOps(b.roadmap, redated.feasibility, now));
      const out = await e.store.apply(userId, ops);
      return out === "ok" ? ok(null) : "stale";
    }
    // ACTIVE: drop the unstarted stages above the new depth (R2's pure part), rewrite the end state, rebase once.
    const rows = planRowsOf(b);
    const plan = [...carriedPlanOf(b, rows.filter((m) => !isCarried(m)), goals), ...rows.filter((m) => !isCarried(m)).map(draftOf)];
    let dropped: string[];
    let lowered: MilestoneDraft[] = plan;
    try {
      const pure = e.lanes.lowerDepthPlanOf(plan, realismInputOf(ctx, plan), to);
      if (!pure.ok) return fail(pure.error);
      dropped = pure.dropped;
      lowered = pure.plan;
    } catch (err) {
      console.error("roadmap: R2's lowering not available; the stages above the depth are dropped as they stand:", err instanceof Error ? err.message : err);
      dropped = rows.filter((m) => !isCarried(m) && (gateLevelOf(draftOf(m)) ?? 0) > to).map((m) => m.lineageId);
    }
    const droppedSet = new Set(dropped);
    const acc = currentAcceptance(b);
    const prevF = feasibilityOfAcceptance(acc);
    const required = requiredDomainsOf(b, rows);
    const kept = lowered.filter((m) => !droppedSet.has(m.lineageId));
    let coverage: CoverageBreakdown[] | null = null;
    try {
      coverage = coverageFor(e, ctx, required, ctx.coveragePrior ?? null);
    } catch (err) {
      console.error("roadmap: coverage not worked out at the lowering:", err instanceof Error ? err.message : err);
    }
    const endState = depthEndStateOf(e, ctx, to, required, kept, b.acceptances, coverage);
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: b.roadmap.version } },
      { op: "update", table: "roadmap", where: { id: roadmapId, version: b.roadmap.version }, data: { depth: to, updatedAt: now } },
    ];
    const ctxText = { ...modelTextContextOf(b, tree), rev4: true };
    try {
      for (const m of rows) {
        if (isCarried(m)) continue;
        if (droppedSet.has(m.lineageId)) {
          ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } });
          ops.push({ op: "update", table: "roadmapMilestone", where: { id: m.id, status: m.status }, data: { status: "DISCARDED", feasibility: feasibilityJson(planFeasibilityOfRow(m), [...storedNotes(m.feasibility).filter((n) => n !== "DEPTH_LOWERED"), "DEPTH_LOWERED"]) } });
          continue;
        }
        const after = lowered.find((x) => x.lineageId === m.lineageId && !isCarried(x));
        if (after && JSON.stringify(after) !== JSON.stringify(draftOf(m))) writeRoadmapRows(ops, { kind: "REWRITE", before: m, after: { ...after, status: m.status as MilestoneStatus }, now, makeId: e.makeId, decided: new Set() }, ctxText);
      }
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("lower-depth", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const stored: Feasibility = {
      ...(prevF ?? feasibilityFor(e, ctx, kept)),
      ...depthRecordsOf(b, rows, required, coverage, today),
      // The coverage stays the one frozen at intake (contracts §15.3); a lowered depth never moves n_d.
      ...(coverage ? { coverage } : {}),
      depthChoice: choice,
      reachModel: REACH_MODEL_VERSION,
    };
    // A record within the version (previousVersion = version): the end state and the choice, never an Undo-able acceptance.
    ops.push({
      op: "insert",
      table: "roadmapAcceptance",
      rows: [{ id: e.makeId(), roadmapId, version: b.roadmap.version, day: today, acceptedAt: now, previousVersion: b.roadmap.version, feasibility: stored, endState, intervalMultiplier: ctx.m, overAccepted: !!acc?.overAccepted, undoneAt: null }],
    });
    try {
      const basis = e.lanes.proficiencyBasisOf({ basisVersion: b.roadmap.version, endState, feasibility: stored, milestones: kept, switchedOff: switchedOffOf(rows.filter(isCarried)), heldDays: ctx.held });
      const prof = await proficiencyFor(e, deps, userId, roadmapId, now, basis, "REPLAN", practiceNamesOf(rows));
      if (prof) ops.push({ op: "readings", rows: [prof], observedAt: now });
    } catch (err) {
      console.error("roadmap: Proficiency not rebased with the lowering:", err);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

// ═══ Revision 4: Gemini's choices, labelled and changeable (F-R4-17, F-R4-21) ═

/**
 * Gemini's Domain additions (F-R4-21): the chosen ones CHECKED, the rest
 * REMOVED, across the draft version's rows in one transaction through the one
 * writer, then the plan re-dated with R as it now stands. Refused with writes
 * off, for a Domain Gemini didn't suggest, past DEPTH_DOMAINS_MAX Domains, and
 * when the additions would take the realistic date past SPAN_MAX_DAYS.
 */
export async function confirmDomainAdditionsCore(userId: string, roadmapId: string, version: number, domainIds: readonly string[], now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!Array.isArray(domainIds) || domainIds.some((d) => typeof d !== "string")) return fail("Pick the Domains to add.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    if (version !== b.roadmap.version + 1) return fail("The plan changed since: look at the suggestions again.");
    const group = draftRowsOf(b);
    const pending = group.flatMap((m) => m.items.filter((i) => pendingAddition(itemDraftOf(i))));
    if (pending.length === 0) return fail("There are no suggested Domains to decide.");
    const offered = new Set(pending.map((i) => i.domainId as string));
    const chosen = Array.from(new Set(domainIds));
    if (chosen.some((d) => !offered.has(d))) return fail("Add only the Domains Gemini suggested.");
    const decided = group.map((m) => {
      const d = draftOf(m);
      return { ...d, items: d.items.map((i) => (pendingAddition(i) ? { ...i, decision: (chosen.includes(i.domainId as string) ? "CHECKED" : "REMOVED") as Decision } : i)) };
    });
    const required = requiredDomainsOf(b, decided);
    if (required.length > DEPTH_DOMAINS_MAX) return fail(TOO_MANY_DOMAINS);
    const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b));
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const redated = redraftOf(e, ctx, decided, carried, required);
    if (!redated.ok) return fail(chosen.length ? `Adding ${chosen.map((id) => ctx.domains.get(id)?.name ?? "that Domain").join(" and ")} would take the plan past 3 years at this depth.` : redated.error);
    const real = redated.feasibility.dateCheck?.D_real ?? null;
    if (real && daysBetween(ctx.today, real) > SPAN_MAX_DAYS) return fail(`Adding ${chosen.map((id) => ctx.domains.get(id)?.name ?? "that Domain").join(" and ")} would take the plan past 3 years at this depth.`);
    const plan = redated.plan;
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } }];
    try {
      writeRoadmapRows(ops, { kind: "DRAFT", roadmapId, version, plan, feasibility: redated.feasibility, now, makeId: e.makeId }, modelTextContextOf(b, ctx.tree, true));
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("additions", err);
      return fail(CHANGE_NOT_SAVED);
    }
    ops.push(...realisticDateOps(b.roadmap, redated.feasibility, now));
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * A body or care plan's session picks (F-R4-17), its one confirm: KEEP sets
 * Gemini's picks CHECKED; EASY removes them and puts the easy, mobility and
 * technique sessions in their place (code's, within the caps), in one
 * transaction through the one writer. Refused with writes off and with no
 * pick waiting.
 */
export async function confirmSessionPicksCore(userId: string, roadmapId: string, choice: "KEEP" | "EASY", now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (choice !== "KEEP" && choice !== "EASY") return fail("Keep the picks, or use easy, mobility and technique sessions.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    const group = draftRowsOf(b);
    if (!picksNeedConfirmOf(b.roadmap) || !group.some((m) => m.items.some((i) => pendingPick(itemDraftOf(i))))) return fail("There are no session picks to confirm.");
    const tree = await e.io.fieldTree();
    const track = catalogTrackOf({ fieldId: b.roadmap.fieldId, track: intakeOf(b.roadmap).track });
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } }];
    const decided = new Set<string>();
    const afterOf = (m: MilestoneBundle): MilestoneDraft => {
      const d = draftOf(m);
      if (choice === "KEEP") {
        return { ...d, items: d.items.map((i) => (pendingPick(i) ? (decided.add(i.id as string), { ...i, decision: "CHECKED" as Decision }) : i)) };
      }
      const picks = d.items.filter(pendingPick);
      if (picks.length === 0) return d;
      // Every waiting pick goes: a picked practice, and a picked FULL_ATTEMPT step or PERFORMANCE_CHECK checkpoint (the activity itself).
      const items = d.items.map((i) => (pendingPick(i) ? (decided.add(i.id as string), { ...i, decision: "REMOVED" as Decision }) : i));
      // Code's safe sessions take the place of the picked practices (a removed step or checkpoint leaves its slot empty).
      const practicePicks = picks.filter((p) => p.kind === "PRACTICE");
      if (practicePicks.length === 0) return syncMeasures({ ...d, items }, b.roadmap.fieldId == null, e.makeId);
      const sessions = Math.max(1, ...practicePicks.map((p) => p.sessionsPerWeek ?? 1));
      for (const key of BODY_SAFE_KINDS) {
        if (items.filter((i) => i.kind === "PRACTICE" && liveItem(i)).length >= PRACTICES_PER_MILESTONE) break;
        if (items.some((i) => i.kind === "PRACTICE" && liveItem(i) && i.catalogKey === key)) continue;
        const entry = catalogEntryOf(key);
        if (!entry || !entry.tracks.includes(track)) continue;
        let label: string;
        try {
          label = String(catalogLabelOf(key, { track, aim: yoursText("USER", "EDITED", b.roadmap.aim) ?? undefined }));
        } catch {
          continue;
        }
        items.push({
          ...practicePicks[0],
          id: null,
          lineageId: e.makeId(),
          ord: Math.max(0, ...items.map((i) => i.ord)) + 1,
          label,
          rawLabel: null,
          origin: catalogOriginOf(),
          decision: "PENDING",
          catalogKey: key,
          method: entry.method,
          sessionsPerWeek: sessions,
          durationBand: entry.method ? METHOD_DEFAULT_BAND[entry.method] : null,
          rule: sessions === 7 ? "DAILY" : `TARGET:${sessions}/W`,
          planSource: "WORKED_OUT",
          flags: [],
          notes: [],
        });
      }
      return syncMeasures({ ...d, items }, b.roadmap.fieldId == null, e.makeId);
    };
    const afters = group.map((m) => ({ m, after: afterOf(m) }));
    const ctxText = { ...modelTextContextOf(b, tree), rev4: true };
    try {
      for (const { m, after } of afters) {
        if (JSON.stringify(after) === JSON.stringify(draftOf(m))) continue;
        ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } });
        writeRoadmapRows(ops, { kind: "REWRITE", before: m, after, now, makeId: e.makeId, decided, others: afters.filter((x) => x.m.id !== m.id).map((x) => x.after) }, ctxText);
      }
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("session-picks", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * Moves an outline line's topic to another milestone of its version (F-R4-21):
 * both rows DRAFT, LATER or PLANNED (never a STARTING or STARTED row, never a
 * held stage), through the one writer. The moved topic reads as the user's
 * arrangement (EDITED). A line's milestone sets no count, so coverage and the
 * dates stand.
 */
export async function moveLineCore(userId: string, itemId: string, toMilestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (typeof toMilestoneId !== "string" || !STEP_REF.test(toMilestoneId)) return fail("That milestone no longer exists.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const loc = await locate(e, userId, itemId);
    if (!loc || !loc.item || loc.item.kind !== "TOPIC") return fail("That outline line is no longer here.");
    const { b, m, item } = loc;
    const target = b.milestones.find((x) => x.id === toMilestoneId);
    if (!target || target.id === m.id) return fail("Pick another milestone.");
    if (!EDITABLE.includes(m.status) || !EDITABLE.includes(target.status)) return fail("A milestone that has started keeps its lines.");
    if (target.version !== m.version) return fail("Pick a milestone of this plan.");
    if (heldRow(target)) return fail("That stage was held when you began: pick another milestone.");
    const source = draftOf(m);
    const dest = draftOf(target);
    const moved: ItemDraft = { ...itemDraftOf(item), id: null, ord: Math.max(0, ...dest.items.map((i) => i.ord)) + 1, decision: "EDITED" };
    const fromAfter: MilestoneDraft = { ...source, items: source.items.filter((i) => i.id !== item.id) };
    const toAfter: MilestoneDraft = { ...dest, items: [...dest.items, moved] };
    const ops: StoreOp[] = [...milestoneGuards(b, m), { op: "guard", guard: { g: "MILESTONE_IS", id: target.id, statuses: [target.status as MilestoneStatus] } }];
    try {
      const ctxText = modelTextContextOf(b, await e.io.fieldTree());
      writeRoadmapRows(ops, { kind: "REWRITE", before: m, after: fromAfter, now, makeId: e.makeId, decided: new Set(), others: [toAfter] }, ctxText);
      writeRoadmapRows(ops, { kind: "REWRITE", before: target, after: toAfter, now, makeId: e.makeId, decided: new Set(), others: [fromAfter] }, ctxText);
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("move-line", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * Changes an outline line's Domain (F-R4-21; the user's, F-R4-9): the
 * roadmap's syllabus.lineDomains and every unstarted topic of that line. On a
 * DRAFT roadmap the draft is re-dated at once (coverage follows the line); on
 * an ACTIVE one it goes through a MANUAL re-plan of the unstarted stages (the
 * pending re-plan draft, made when there is none). Never touches a STARTING or
 * STARTED row. The Domain must be one of R, or none.
 */
export async function setLineDomainCore(userId: string, roadmapId: string, lineIndex: number, domainId: string | null, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return fail("That outline line is no longer here.");
  if (domainId != null && (typeof domainId !== "string" || !STEP_REF.test(domainId))) return fail(LINE_DOMAIN_OUTSIDE);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    if (b.roadmap.fieldId == null) return fail("A life-track Area has no Domains.");
    const intake = intakeOf(b.roadmap);
    const lines = intake.syllabus?.lines ?? [];
    if (lineIndex >= lines.length) return fail("That outline line is no longer here.");
    const draftExists = draftRowsOf(b).length > 0;
    const group = draftExists ? draftRowsOf(b) : planRowsOf(b).filter((m) => !isCarried(m) && !dormantCopy(b, m, new Map()));
    const required = requiredDomainsOf(b, group);
    if (domainId != null && !required.includes(domainId)) return fail(LINE_DOMAIN_OUTSIDE);
    const lineDomains = lines.map((_, i) => (i === lineIndex ? domainId : (intake.syllabus?.lineDomains?.[i] ?? null)));
    const syllabus = { lines: [...lines], source: intake.syllabus?.source ?? null, lineDomains };
    const v = b.roadmap.version + 1;
    const drafts = group.map((m) => {
      const d = draftOf(m);
      return {
        ...d,
        id: draftExists ? d.id : null,
        version: v,
        status: (d.status === "LATER" ? "LATER" : "DRAFT") as MilestoneStatus,
        rankIndex: draftExists ? d.rankIndex : null,
        items: d.items.map((i) => (i.kind === "TOPIC" && i.origin === "SYLLABUS" && i.syllabusRef === lineIndex ? { ...i, domainId } : i)),
      };
    });
    const ctx = await planContext(e, userId, { ...b.roadmap, syllabus }, now, coveragePriorOf(b));
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const redated = redraftOf(e, ctx, drafts, carried, required);
    if (!redated.ok) return fail(redated.error);
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: [b.roadmap.status as RoadmapStatus], version: b.roadmap.version } },
      { op: "update", table: "roadmap", where: { id: roadmapId }, data: { syllabus, updatedAt: now } },
    ];
    if (!draftExists) {
      ops.push({ op: "insert", table: "roadmapRun", rows: [runRow(e.makeId(), userId, roadmapId, ctx.today, v, "MANUAL", "OK", now, { finishedAt: now })] });
    }
    try {
      writeRoadmapRows(ops, { kind: "DRAFT", roadmapId, version: v, plan: redated.plan, feasibility: redated.feasibility, now, makeId: e.makeId }, { ...modelTextContextOf(b, ctx.tree, true), syllabusLines: lines });
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("line-domain", err);
      return fail(CHANGE_NOT_SAVED);
    }
    ops.push(...realisticDateOps(b.roadmap, redated.feasibility, now));
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

// ═══ Revision 4 fix round: shells (lane 0; contracts §15.10) ════════════════

/**
 * "Not now: no aim suggestions for 4 weeks" on the LATER line (fix round;
 * F-R4-1, decision 34): AIM_PROMPT_COOKIE = roadmap-invite
 * hideCookieValue(todayKey(now)) ('hide:<today>'), maxAge
 * AIM_PROMPT_LATER_MAX_AGE_S, path '/', sameSite lax, httpOnly — as
 * snoozeAimPromptCore. aimPromptOf reads it as HIDDEN for AIM_LATER_DAYS (no
 * set-an-aim suggestion on /you or Today; askAnchorOf counts it as it counts
 * 'later:'), so the LATER line's × does what its label says. A stored 'no'
 * (LifeSettings.aimSuggestions false) or a legacy 'off' cookie still wins.
 * No database write, so it works on a writes-off server too.
 */
export async function hideAimPromptCore(jar: AimCookieJar, now: Date): Promise<RoadmapActionResult<null>> {
  jar.set(AIM_PROMPT_COOKIE, hideCookieValue(todayKey(now)), { maxAge: AIM_PROMPT_LATER_MAX_AGE_S, ...COOKIE_OPTS });
  return ok(null);
}

/** [Keep the dates] with no CALIBRATED offer standing (nothing assumed is measured since, or every stage has started). */
export const NO_CALIBRATED_OFFER = "There's nothing to keep: no input these dates assumed has been measured since.";

/**
 * [Keep the dates] on the CALIBRATED offer (fix round; F-R4-11): a choice the
 * plan records, never a device's localStorage. Under the roadmap lock, gated
 * by lifeWritesEnabled (ROADMAP_WRITES_OFF): it rewrites the current live
 * acceptance's feasibility.dateCheck.dateOrigin.calibrating to the inputs
 * still calibrating now (the measured ones dropped), with no re-dating and no
 * other change — the end state, the dates, the verdict, every other field of
 * the record stand — so the offer doesn't return on any device and the date
 * chip stops saying "estimate" for the inputs now measured. Refuses on a
 * roadmap that isn't ACTIVE or has no CALIBRATED offer (calibratedOfferOf,
 * the trigger's one definition). Revalidates 'roadmap'.
 *
 * The one field rewritten in place on an acceptance (contracts §15.10). A
 * second record within the version, as lowerDepthCore writes, would read as
 * a lowered depth (roadmap-types isDepthLoweringRecord) and block Undo with
 * the wrong words; the guards (the version, the record still open) make a
 * double tap or a re-plan in between harmless.
 */
export async function keepCalibratedDatesCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (typeof roadmapId !== "string" || !STEP_REF.test(roadmapId)) return fail(NO_ROADMAP);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "ACTIVE") return fail("Only an accepted plan keeps its dates this way.");
    const acc = currentAcceptance(b);
    const f = feasibilityOfAcceptance(acc);
    const check = f?.dateCheck ?? null;
    if (!acc || !f || !check || !check.dateOrigin) return fail(NO_CALIBRATED_OFFER);
    const ctx = await planContext(e, userId, b.roadmap, now);
    const offer = calibratedOfferOf(b, ctx);
    if (!offer) return fail(NO_CALIBRATED_OFFER);
    const kept: Feasibility = { ...f, dateCheck: { ...check, dateOrigin: { ...check.dateOrigin, calibrating: offer.still } } };
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: b.roadmap.version } },
      { op: "guard", guard: { g: "ACCEPTANCE_OPEN", id: acc.id } },
      { op: "update", table: "roadmapAcceptance", where: { id: acc.id, roadmapId }, data: { feasibility: kept } },
    ]);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

// ═══ Revision 4: production monitors (F-R4-20; read-only, the lead runs them) ═

/**
 * The read-only checks the lead runs on production after the deploy
 * (Acceptance, "Production, read-only, after the deploy"), with the deploy
 * instant as $1. Each returns rows that should be empty, or the counts named.
 * REJECT_ALARM_SHARE: above it (the week's REJECTED plus SALVAGED over its v3
 * runs) the lead turns ROADMAP_GEMINI_LIVE off and records why. Nothing in
 * the app runs these.
 */
export const ROADMAP_MONITOR_QUERIES: readonly { name: string; expect: string; sql: string }[] = [
  {
    name: "gemini-items",
    expect: "0 rows",
    sql: `SELECT i."id", i."kind" FROM "RoadmapItem" i WHERE i."createdAt" >= $1 AND i."origin" = 'GEMINI' AND i."kind" NOT IN ('DOMAIN', 'GAP')`,
  },
  { name: "gemini-titles", expect: "0 rows", sql: `SELECT m."id" FROM "RoadmapMilestone" m WHERE m."createdAt" >= $1 AND m."titleOrigin" = 'GEMINI'` },
  {
    name: "tasks-from-model-rows",
    expect: "0 rows",
    sql: `SELECT t."id" FROM "TaskTemplate" t JOIN "RoadmapItem" i ON i."templateId" = t."id"
      WHERE t."captureKey" LIKE 'rm:%' AND (i."kind" = 'GAP' OR (i."origin" = 'GEMINI' AND i."decision" NOT IN ('CHECKED', 'EDITED')))`,
  },
  {
    name: "from-suggestion-domains",
    expect: "0 rows while ROADMAP_GAPS_LIVE is false",
    sql: `SELECT i."domainId", COUNT(x."id") AS cards FROM "RoadmapItem" i LEFT JOIN "Idea" x ON x."domainId" = i."domainId" AND x."isArchived" = false
      WHERE 'FROM_SUGGESTION' = ANY(i."notes") GROUP BY i."domainId"`,
  },
  {
    name: "constrained-picks-started",
    expect: "no row with decision PENDING",
    sql: `SELECT i."id", i."decision" FROM "RoadmapItem" i JOIN "RoadmapMilestone" m ON m."id" = i."milestoneId" JOIN "Roadmap" r ON r."id" = m."roadmapId"
      WHERE 'GEMINI_PICK' = ANY(i."notes") AND r."track" IN ('BODY', 'CARE') AND r."fieldId" IS NULL AND COALESCE(r."constraints", '') <> '' AND m."status" IN ('STARTING', 'STARTED')`,
  },
  {
    name: "legacy-gemini-rows",
    expect: "0 rows (by P0); else open each roadmap's page and Aim card once and confirm none of their text renders",
    sql: `SELECT DISTINCT r."id" FROM "Roadmap" r JOIN "RoadmapMilestone" m ON m."roadmapId" = r."id" LEFT JOIN "RoadmapItem" i ON i."milestoneId" = m."id"
      WHERE (m."stage" IS NULL OR (r."fieldId" IS NOT NULL AND r."depth" IS NULL)) AND (m."titleOrigin" = 'GEMINI' OR i."origin" = 'GEMINI')`,
  },
  {
    name: "v3-runs-integrity",
    expect: "every row has a verdict; REJECTED + SALVAGED over the week ≤ REJECT_ALARM_SHARE (0.2)",
    sql: `SELECT r."report" -> 'integrity' ->> 'verdict' AS verdict, COUNT(*) FROM "RoadmapRun" r
      WHERE r."kind" = 'GEMINI' AND r."promptVersion" = 3 AND r."startedAt" >= NOW() - INTERVAL '7 days' GROUP BY 1`,
  },
  {
    name: "report-path-hygiene",
    expect: "0 rows (a path segment other than a schema key, an index or <extra>)",
    sql: `SELECT r."id", v ->> 'path' AS path FROM "RoadmapRun" r, jsonb_array_elements(COALESCE(r."report" -> 'integrity' -> 'violations', '[]'::jsonb)) v
      WHERE EXISTS (SELECT 1 FROM regexp_split_to_table(v ->> 'path', '\\.') seg
        WHERE seg <> '' AND seg <> '<extra>' AND seg !~ '^[0-9]+$' AND seg !~ '^(needs|stages|gaps|lines|practices|steps|checkpoint|kind|on|FOUNDATION|FAMILIAR|RETAINED|FLUENT|MASTERED|STAGE_[1-5])$')`,
  },
  { name: "field-roadmaps-depth", expect: "0 rows", sql: `SELECT r."id" FROM "Roadmap" r WHERE r."createdAt" >= $1 AND r."fieldId" IS NOT NULL AND (r."depth" IS NULL OR r."depth" NOT IN (8, 10, 12))` },
  {
    name: "started-on-legacy",
    expect: "0 rows",
    sql: `SELECT m."id" FROM "RoadmapMilestone" m JOIN "Roadmap" r ON r."id" = m."roadmapId" WHERE m."status" IN ('STARTING', 'STARTED') AND r."fieldId" IS NOT NULL AND r."depth" IS NULL`,
  },
  {
    name: "depth-rows-stage-rank",
    expect: "0 rows",
    sql: `SELECT m."id" FROM "RoadmapMilestone" m JOIN "Roadmap" r ON r."id" = m."roadmapId"
      WHERE r."depth" IS NOT NULL AND m."status" IN ('PLANNED', 'STARTING', 'STARTED') AND (m."stage" IS NULL OR m."rankIndex" IS NULL OR m."rankIndex" NOT BETWEEN 1 AND 5)`,
  },
  {
    name: "held-rows",
    expect: "0 rows",
    sql: `SELECT m."id" FROM "RoadmapMilestone" m WHERE m."status" = 'PLANNED' AND m."reachedDay" IS NOT NULL
      AND (m."goalId" IS NOT NULL OR NOT (COALESCE(m."feasibility" -> 'notes', '[]'::jsonb) ? 'HELD_AT_START'))`,
  },
  {
    name: "proficiency-v2-range",
    expect: "0 rows",
    sql: `SELECT x."id" FROM "RoadmapReading" x WHERE x."measureKey" LIKE 'PROFICIENCY|%' AND (x."detail" ->> 'v')::int = 2 AND (x."value" < 0 OR x."value" > 1)`,
  },
  {
    name: "review-level-tag",
    expect: "every new live REVIEW row's detail ends with the level tag (backfill rows, dedupeKey 'bf:…', carry none)",
    sql: `SELECT e."id", e."detail" FROM "ActivityEvent" e WHERE e."source" = 'REVIEW' AND e."createdAt" >= $1
      AND (e."dedupeKey" IS NULL OR e."dedupeKey" NOT LIKE 'bf:%') AND COALESCE(e."detail", '') !~ '· L[0-9]{1,2}(→[0-9]{1,2})?$' LIMIT 20`,
  },
  {
    // Decision 50 (contracts §15.6): no model sizes or explains a plan-born task; Start never defers sizing for an 'rm:' template.
    name: "rm-templates-model-basis",
    expect: "0 rows (a plan-born task's 'Why' is never a model's words)",
    sql: `SELECT t."id" FROM "TaskTemplate" t WHERE t."captureKey" LIKE 'rm:%' AND t."gradeSource" = 'AI' AND t."gradeBasis" IS NOT NULL`,
  },
];

// ═══ Revision 4: the hallucination bar's view seam (F-R4-22; lane R7) ════════

/** One Domain as the bar describes it: counts only (card titles and tags never reach a view). */
export interface HostileViewDomain {
  id: string;
  name: string;
  fieldId: string;
  cards?: number;
  atSix?: number;
  atTop?: number;
}

/**
 * What the bar passes (scripts/fixtures/roadmap-hostile/seam.ts): one reply
 * and its run. Since the fix round (contracts §15.12) R4 walks, validates and
 * places the reply itself, through draftFromReply — the production step —
 * so `validated` and `integrity`, when an older seam still passes them, are
 * ignored.
 *   run     the bar's run, as a stored run gives it: its id, whether its gap
 *           slot was issued (`gaps`), its exact issued schema (`schema`) and
 *           the Domains created from a suggestion (`gapCreatedDomainIds`,
 *           which never ground one);
 *   pack    the run's EvidencePack as the bar built it (absent: R4 builds it
 *           as claimDraftCore does, from the stage ladder's windows);
 *   schema  the issued schema (absent: run.schema, else the pack's);
 *   views   false: R4's verdict and plan only, no view model built (the bar's
 *           budget); absent or true: every view model.
 */
export interface HostileViewInput {
  run?: { id?: string; gaps?: boolean; schema?: unknown; gapCreatedDomainIds?: unknown } | null;
  parsed: unknown;
  /** Ignored (the fix round): R4 validates the reply itself. */
  validated?: ValidatedDraft | null;
  /** Ignored (the fix round): R4 walks the reply itself. */
  integrity?: ValidationIntegrity | null;
  pack?: unknown;
  schema?: unknown;
  views?: boolean;
  intake: Intake;
  areaName: string;
  domains: readonly HostileViewDomain[];
  today: string;
}

/** hostileViewsOf's answer: the view models (named in viewNames, in order), the log lines the draft path writes, and R4's own verdict and plan (roadmap-types DraftFromReplyResult). */
export interface HostileViews {
  views: unknown[];
  logLines: string[];
  result: DraftFromReplyResult;
  viewNames: string[];
}

/** What each of hostileViewsOf's views is, in order (the bar's H1 item names them). */
export const HOSTILE_VIEW_NAMES: readonly string[] = [
  "DraftView",
  "RunView (RunFacts' props)",
  "the Today-bound rows",
  "the AimStep",
  "RoadmapView",
  "AimCardView",
  "the week-quests view of the first milestone, started",
];

/**
 * Every view model the draft path renders for one reply (F-R4-22), built
 * purely with no store, no io and no model, through the production
 * composition (fix round, contracts §15.12):
 *   - draftFromReply — R4's integrity walk and verdict, the REJECTED gate,
 *     validateKeysOnly with R4's KeysOnlyContext, materialisation into the
 *     stage ladder with R2's practices and feasibility, and the one writer's
 *     tripwire as a dry run — decides what is written: the reply's plan, or
 *     (REJECTED, nothing survives, the tripwire refuses) the starter, as a
 *     FAILED run writes it;
 *   - then the rows the one writer would write, and their views:
 *     [0] the DraftView, [1] the run's facts (RunView: RunFacts' props),
 *     [2] the Today rows of every draft milestone, [3] Today's aim step,
 *     [4] the RoadmapView of the DRAFT roadmap (roadmapViewOfData, the
 *     page's own composition), [5] its AimCardView (aimCardOfData) and
 *     [6] the week-quests view of its first milestone as if started today
 *     (fix round 2, R7's handoff: R2's re-fit and StartSnapshot, R6's
 *     weekQuestsFor and its roadmap view over the rows the writer wrote);
 *   - the log lines the path writes (roadmap.reply, roadmap.tripwire);
 *   - viewNames, what each view is (HOSTILE_VIEW_NAMES).
 * `result` is R4's verdict, validated draft and plan: the bar asserts that
 * the verdict equals the case's expected one, so H4's no-write clause and
 * H1's views test production code.
 * Library facts are counts only (a synthetic card per count: no title, no
 * tag). A run's context, ladder, pack and starter are worked out once, a
 * plan's feasibility once per distinct placement, and a plan's rows and
 * DraftView once per distinct plan.
 * Lane R7's roadmap-hostile-check reads it through seam.ts; nothing else
 * calls it.
 */
export function hostileViewsOf(input: HostileViewInput): HostileViews {
  const today = input.today as DayKey;
  const now = new Date(`${today}T01:00:00.000Z`);
  const gapsOn = typeof input.run?.gaps === "boolean" ? input.run.gaps : null;
  const issued = input.schema ?? (input.run?.schema && typeof input.run.schema === "object" ? input.run.schema : undefined);
  const givenPack = input.pack && typeof input.pack === "object" && typeof (input.pack as { promptVersion?: unknown }).promptVersion === "number" ? (input.pack as EvidencePack) : null;
  const runKey = JSON.stringify([today, input.intake, input.areaName, input.domains, gapsOn, input.run?.id ?? null, givenPack ? sha256(JSON.stringify(givenPack)) : null]);
  const hr = hostileRunOf(runKey, input, givenPack, today, now);
  const runId = `hostile-run-${String(input.run?.id ?? "1").slice(0, 40)}`;
  let seq = 0;
  const makeId = () => `hv${(++seq).toString(36)}`;
  const excluded = Array.isArray(input.run?.gapCreatedDomainIds) ? (input.run.gapCreatedDomainIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const empty: RoadmapBundle = { roadmap: hr.roadmap, runs: [], milestones: [], acceptances: [] };
  const step: DraftReplyStep = {
    e: { ...hr.e, makeId },
    ctx: hr.ctx,
    pack: hr.pack,
    schema: issued ?? hr.schema,
    gapSourceExclude: excluded,
    tripwire: modelTextContextOf(empty, hr.tree, true),
    roadmapId: hr.roadmap.id,
    version: 1,
    now,
    ladder: hr.ladder,
    gapsOn: gapsOn ?? undefined,
    memo: hr.memo,
  };
  const r = draftFromReply(step, input.parsed);
  const result: DraftFromReplyResult = { integrity: r.integrity, validated: r.validated, plan: r.plan, refused: r.refused };
  const logLines = [JSON.stringify({ evt: "roadmap.reply", runId, verdict: r.integrity.verdict, violations: r.integrity.violations, modelChars: r.integrity.modelChars })];
  if (r.refused === "TRIPWIRE") logLines.push(refusedWriteLine("draft", r.tripwireReason));
  if (input.views === false) return { views: [], logLines, result, viewNames: [] };
  // The rows the one writer writes: the reply's plan, else the starter (as a FAILED run writes it).
  let shown: HostilePlanViews | null = null;
  if (r.plan && r.feasibility) {
    const planKey = `${runKey}\u0000${JSON.stringify(r.plan)}`;
    let cached = hostilePlans.get(planKey);
    if (cached === undefined) {
      cached = hostilePlanViewsOf(hr, r.plan, r.feasibility, "GEMINI", now, makeId);
      if (hostilePlans.size >= HOSTILE_CACHE_MAX) hostilePlans.clear();
      hostilePlans.set(planKey, cached);
    }
    if (cached.refusal) logLines.push(cached.refusal);
    else shown = cached;
  }
  let run: RunRec;
  if (shown && r.validated) {
    run = hostileRunRecOf(hr, runId, now, "OK", r.validated.report, null);
  } else {
    shown = hr.starter;
    const why =
      r.refused === "REJECTED"
        ? `reply rejected: ${Array.from(new Set(r.integrity.violations.map((v) => v.code))).join(", ") || "format"}`
        : r.refused === "TRIPWIRE"
          ? "reply refused: it held words the app didn't write"
          : "the draft had nothing usable";
    const report: ValidationReport = { ...hr.starterReport, ...(shown.b.milestones.length ? { fallback: RUN_FALLBACK_STARTER } : {}), integrity: r.integrity };
    run = hostileRunRecOf(hr, runId, now, "FAILED", report, why);
  }
  const b: RoadmapBundle = { ...shown.b, runs: [run] };
  const wrote: RunView["wrote"] = run.status === "OK" ? "GEMINI" : b.milestones.length ? "STARTER" : null;
  const runView = runViewOf(b, run, now, wrote, run);
  const draft = shown.draft ? { ...shown.draft, gapsHidden: gapsNotShownOf(runView?.report?.integrity) } : null;
  const aimStep: AimStep = { open: { kind: "DRAFT", roadmapId: hr.roadmap.id, savedDay: today, running: false }, lastDoneDay: null, lastClosedDay: null, epochDay: null, lastOpenBefore: null, aimSuggestions: null };
  // The page's own compositions of the DRAFT roadmap: the RoadmapView and the Aim card.
  const v: ViewData = { b, today, ctx: { domains: hr.ctx.domains, today }, tree: hr.tree, readings: [], logs: [], templates: new Map(), payments: {}, pastHeld: [], writesOff: false };
  const deps: RoadmapDeps = {};
  const roadmapView = roadmapViewOfData(hr.e, deps, v, hr.ctx, { today, run: runView, acceptedRun: null, draft, throughput: null, wq: null, pastWeeks: [], aftercare: [], weight: null });
  const aimCard = aimCardOfData(hr.e, deps, aimCardBaseOf(hr.e, deps, null), v, null, null, today);
  return { views: [draft, runView, shown.todayRows, aimStep, roadmapView, aimCard, shown.weekQuests ?? null], logLines, result, viewNames: [...HOSTILE_VIEW_NAMES] };
}

/** At most this many runs, placements and distinct plans are remembered (the bar holds ~60 runs; cleared when full). */
const HOSTILE_CACHE_MAX = 5000;

interface HostileRunFacts {
  e: Env;
  ctx: PlanContext;
  roadmap: RoadmapRec;
  tree: TreeField[];
  required: string[];
  ladder: MilestoneDraft[];
  /** The run's pack (the bar's, or built as claimDraftCore builds it) and the schema it issues. */
  pack: EvidencePack;
  schema: unknown;
  /** draftFromReply's plans by placement (the feasibility is worked out once per distinct one). */
  memo: Map<string, { plan: MilestoneDraft[]; feasibility: Feasibility }>;
  starter: HostilePlanViews;
  starterReport: ValidationReport;
}

/** One plan's rows and the views of them (refusal: the tripwire's log line, when the writer refused the rows). */
interface HostilePlanViews {
  b: RoadmapBundle;
  draft: DraftView | null;
  todayRows: TodayBoundRow[][];
  /** The week-quests view of its first milestone as if started today (null when it has none to start). */
  weekQuests?: WeekQuestsView | null;
  refusal?: string;
}

const hostileRuns = new Map<string, HostileRunFacts>();
const hostilePlans = new Map<string, HostilePlanViews>();

/** A run's context, ladder, pack and starter, once per run (the library as counts: a card per count at level 12, 6 or 3; recall cards). */
function hostileRunOf(key: string, input: HostileViewInput, givenPack: EvidencePack | null, today: DayKey, now: Date): HostileRunFacts {
  const hit = hostileRuns.get(key);
  if (hit) return hit;
  let seq = 0;
  const base = envOf({});
  const effects = new Map<string, ReturnType<RoadmapLanes["dateEffectOf"]>>();
  const e: Env = {
    ...base,
    makeId: () => `hl${(++seq).toString(36)}`,
    lanes: {
      ...base.lanes,
      // One date effect per set of additions and the counts it reads (frozen at intake, as production passes them).
      dateEffectOf: (intake, input, add, counts) => {
        const k = JSON.stringify([[...add].sort(), intake.domainIds, counts ?? null]);
        const hit = effects.get(k);
        if (hit) return hit;
        const out = base.lanes.dateEffectOf(intake, input, add, counts);
        effects.set(k, out);
        return out;
      },
    },
  };
  const fields = new Map<string, TreeField>();
  for (const d of input.domains) {
    const f = fields.get(d.fieldId) ?? { id: d.fieldId, name: d.fieldId === input.intake.fieldId ? input.areaName : d.fieldId, level: 0, domains: [] };
    const total = Math.max(0, Math.floor(d.cards ?? 0));
    const six = Math.min(total, Math.max(0, Math.floor(d.atSix ?? 0)));
    const top = Math.min(six, Math.max(0, Math.floor(d.atTop ?? 0)));
    const card = (level: number): TreeCard => ({ domainId: d.id, level, dueDay: today, graceEndsDay: null, createdDay: addDays(today, -30), title: null, tags: [] });
    const cards = [...Array.from({ length: top }, () => card(12)), ...Array.from({ length: six - top }, () => card(6)), ...Array.from({ length: total - six }, () => card(3))];
    f.domains.push({ id: d.id, name: d.name, fieldId: d.fieldId, cards });
    fields.set(d.fieldId, f);
  }
  const tree = Array.from(fields.values());
  // The intake as saveIntake stores it (a Field Area's depth defaults to Mastered); the bar's own when the check refuses it.
  const checked = validateIntake(input.intake, { today, fields: tree });
  const intake: Intake = checked.ok
    ? checked.value
    : { ...input.intake, depth: input.intake.fieldId ? (isAimDepth(input.intake.depth) ? input.intake.depth : AIM_DEPTHS[DEPTH_DEFAULT]) : null };
  const roadmap: RoadmapRec = { ...intakeRowOf("hostile", intake, now), id: "hostile-roadmap" };
  const ctx: PlanContext = {
    today,
    roadmap,
    intake: intakeOf(roadmap),
    tree,
    domains: domainFactsOf(tree),
    areaName: input.areaName || areaNameOf(roadmap, tree),
    throughput: calibratingThroughput(addDays(today, -THROUGHPUT_LAG_DAYS)),
    paceRows: null,
    m: 1,
    held: [],
    maintenance: new Set<string>(),
    extraStrikes: 0,
    graceExtraDays: 0,
  };
  const required = requiredOfPlan(ctx);
  const ladderRes = ladderOf(e, ctx, required);
  const ladder = ladderRes.ok ? ladderRes.plan : [];
  // The run's pack: the bar's, else as claimDraftCore builds it (the stage ladder's windows, today's library facts).
  let pack: EvidencePack;
  if (givenPack) pack = givenPack;
  else {
    const windows = ladder.filter((m) => m.status !== "LATER" && !heldRow(m) && m.windowStart && m.dueDay).map((m) => ({ start: m.windowStart as DayKey, end: m.dueDay as DayKey }));
    pack = e.lanes.buildEvidencePack({ intake: ctx.intake, areaName: ctx.areaName, domains: evidenceDomainsOf(ctx), windows });
  }
  const facts = { e, ctx, roadmap, tree, required, ladder, pack, schema: schemaOf(e, pack), memo: new Map<string, { plan: MilestoneDraft[]; feasibility: Feasibility }>() };
  let starter: { plan: MilestoneDraft[]; feasibility: Feasibility; report: ValidationReport } | null = null;
  try {
    starter = starterPlan(e, ctx);
  } catch {
    starter = null;
  }
  const views = hostilePlanViewsOf(facts, starter?.plan ?? [], starter?.feasibility ?? null, "STARTER", now, e.makeId);
  const out: HostileRunFacts = {
    ...facts,
    starter: views.refusal ? { b: { roadmap, runs: [], milestones: [], acceptances: [] }, draft: null, todayRows: [] } : views,
    starterReport: starter?.report ?? { dropped: [], flagged: [], notes: [] },
  };
  if (hostileRuns.size >= HOSTILE_CACHE_MAX) hostileRuns.clear();
  hostileRuns.set(key, out);
  return out;
}

/** The rows the one writer would write for a plan (its tripwire first, with its feasibility as the draft path stores it), and the DraftView and Today rows of them. */
function hostilePlanViewsOf(hr: Pick<HostileRunFacts, "e" | "ctx" | "roadmap" | "tree">, plan: readonly MilestoneDraft[], feasibility: Feasibility | null, wrote: NonNullable<RunView["wrote"]>, now: Date, makeId: () => string): HostilePlanViews {
  const empty: RoadmapBundle = { roadmap: hr.roadmap, runs: [], milestones: [], acceptances: [] };
  const ops: StoreOp[] = [];
  try {
    writeRoadmapRows(ops, { kind: "DRAFT", roadmapId: hr.roadmap.id, version: 1, plan, feasibility, now, makeId }, modelTextContextOf(empty, hr.tree, true));
  } catch (err) {
    if (!(err instanceof ModelTextError)) throw err;
    return { b: empty, draft: null, todayRows: [], refusal: refusedWriteLine("draft", err) };
  }
  const rowsOf = (table: string) => ops.flatMap((o) => (o.op === "insert" && o.table === table ? (o.rows as Record<string, unknown>[]) : []));
  const items = rowsOf("roadmapItem") as unknown as ItemRec[];
  const measures = rowsOf("roadmapMeasure") as unknown as MeasureRec[];
  const milestones = (rowsOf("roadmapMilestone") as unknown as MilestoneRec[]).map((m) => ({ ...m, items: items.filter((i) => i.milestoneId === m.id), measures: measures.filter((x) => x.milestoneId === m.id) }));
  const b: RoadmapBundle = { ...empty, milestones };
  const draft = draftViewOf(hr.e, b, { ...hr.ctx, coveragePrior: draftCoverageOf(milestones) }, new Map(), { wrote, report: null });
  return { b, draft, todayRows: (draft?.milestones ?? []).map((m) => todayBoundRowsOf(m, new Set<string>())), weekQuests: hostileWeekQuestsOf(hr, b, todayKey(now), now) };
}

/**
 * The week-quests view of a plan's first milestone as if started today
 * (fix round 2, R7 → R4; F-R4-22's views): R2's re-fit and StartSnapshot of
 * that row, a WeekQuestInput from the rows the writer wrote — its paying
 * card measures over the library's cards, its practices and steps on Today
 * and its checkpoint, each in its own row's words (R6's questLabelOf and
 * checkpointLabelOf, which never pass a Gemini word) — then R6's
 * weekQuestsFor and its roadmap view. Pure. null when the plan has no
 * startable milestone or the snapshot can't be made.
 */
function hostileWeekQuestsOf(hr: Pick<HostileRunFacts, "e" | "ctx">, b: RoadmapBundle, today: DayKey, now: Date): WeekQuestsView | null {
  const row = b.milestones.filter((m) => m.status === "DRAFT" && m.dueDay && !heldRow(m)).sort(byOrd)[0];
  if (!row || !row.dueDay) return null;
  try {
    const ctx = hr.ctx;
    const plan = b.milestones.map(draftOf);
    const d = draftOf(row);
    const input = realismInputOf(ctx, plan);
    const refitted = hr.e.lanes.refitForStart(d, plan, input);
    const snapshot = hr.e.lanes.startSnapshotOf(refitted.milestone, refitted, input, today);
    const weekStart = weekStartKeyOf(today);
    const cards: WeekQuestCardInput[] = [];
    for (const x of d.measures) {
      const ids = x.scope.domainIds ?? [];
      if (x.kind !== "CARDS_AT_LEVEL" || x.role !== "PAYS" || x.minLevel == null || !x.measureKey || ids.length === 0) continue;
      const parsed = parseMeasureKey(x.measureKey);
      const v = liveCountOfKey(ctx, x.measureKey)?.value ?? 0;
      const rate = x.rateSource;
      cards.push({
        measureKey: x.measureKey,
        domainIds: [...ids],
        domainNames: domainNamesOf(ctx, ids),
        level: x.minLevel,
        target: x.target,
        baseline: x.baseline ?? v,
        v0: v,
        cards: cardStatesOf(ctx, ids),
        rateSource: rate === "SCOPE" || rate === "FIELD" || rate === "YOURS" || rate === "NONE" ? rate : snapshot.rateSource,
        fieldId: ctx.domains.get(ids[0])?.fieldId ?? null,
        ...(ids.length === 1 ? { domainId: ids[0] } : {}),
        ...(parsed?.kind === "CARDS_AT_LEVEL" && parsed.segment ? { segment: parsed.segment } : {}),
      });
    }
    const live = d.items.filter(liveItem).sort((x, y) => x.ord - y.ord);
    const bandOf = (i: ItemDraft) => (isBand(i.durationBand) ? practiceBandMinutes(i.durationBand) : 30);
    const practices: WeekQuestPracticeInput[] = [];
    const steps: WeekQuestStepInput[] = [];
    for (const i of live) {
      if (!i.addToToday) continue;
      if (i.kind === "PRACTICE" && i.rule && parseRule(i.rule)) {
        const name = questsServer.questLabelOf(i);
        if (name) practices.push({ templateId: `hq-${i.lineageId}`, name, rule: i.rule, startDay: today, bandMinutes: bandOf(i) });
      } else if (i.kind === "STEP") {
        const title = questsServer.questLabelOf(i);
        if (title) steps.push({ templateId: `hq-${i.lineageId}`, title, ord: i.ord, doneDay: null, minutes: bandOf(i) });
      }
    }
    const cp = live.find((i) => i.kind === "CHECKPOINT" && i.outOf != null && i.bar != null) ?? null;
    const cpLabel = cp ? questsServer.checkpointLabelOf(cp) : null;
    const checkpoint: WeekQuestCheckpointInput | null = cp && cpLabel ? { itemLineageId: cp.lineageId, label: cpLabel, lastLogDay: null } : null;
    const of = positionCountOf(b.milestones.filter(scheduled));
    const set = weekQuestsFor({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      milestone: { id: row.id, ord: 1, of, startedDay: today, dueDay: row.dueDay, snapshot },
      heldDays: [],
      card: cards[0] ?? null,
      cards,
      capacity: { availableMin: ctx.intake.hoursPerWeek * 60, class: "YOURS", calibrating: true },
      otherFieldQuotas: 0,
      areaQuotaField: null,
      practices,
      steps,
      checkpoint,
      m: ctx.m,
      cardLevelsReadAt: now.toISOString(),
    });
    const names: Record<string, DomainName> = {};
    for (const c of cards) {
      for (const id of c.domainIds) {
        const f = ctx.domains.get(id);
        if (f) names[id] = domainName(f);
      }
    }
    return weekQuestsViewOf({
      set,
      progress: [],
      variant: "roadmap",
      milestone: { ord: 1, of, title: row.title, dueDay: row.dueDay },
      level: cards[0]?.level ?? null,
      frozen: true,
      writesOff: false,
      places: {},
      passRate: { start: { p: snapshot.pStart, calibrating: snapshot.pCalibrating }, now: null },
      domainNames: names,
      health: ctx.intake.fieldId == null && catalogTrackOf({ fieldId: null, track: ctx.intake.track }) === "BODY",
    });
  } catch (err) {
    console.error("roadmap: the bar's week-quests view wasn't built:", err instanceof Error ? err.message : err);
    return null;
  }
}

function hostileRunRecOf(hr: Pick<HostileRunFacts, "roadmap">, id: string, now: Date, status: string, report: ValidationReport, error: string | null): RunRec {
  return {
    id,
    roadmapId: hr.roadmap.id,
    userId: "hostile",
    day: todayKey(now),
    version: 1,
    kind: "GEMINI",
    status,
    model: null,
    modelVersion: null,
    promptVersion: 3,
    seedBase: null,
    inputHash: null,
    pack: null,
    samples: null,
    report,
    usage: null,
    responseIds: [],
    finishReasons: [],
    latencyMs: null,
    error,
    startedAt: now,
    finishedAt: now,
  };
}
