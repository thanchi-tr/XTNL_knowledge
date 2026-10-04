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
 *   RoadmapDeps.defer, applySizing, callModel, clock, makeId, goalsLive
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
import { isMissingRestDayTable } from "./rest-rules";
import { parseRule, scheduledPerWeek } from "./recurrence";
import { normTitleOf, sizeLexically } from "./life-lexicon";
import { EST_MINUTES_MAX } from "./life-grade";
import { hasGeminiKey } from "./gemini";
import { loadFieldTree } from "./queries";
import { loadMaintenanceIds } from "./field-focus";
import { loadModifiers } from "./skill-effects";
import { applySizing as applySizingDefault } from "./life-sizing";
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
  /** The user's roadmap is in one of these statuses (and at this version, with this archive reason). */
  | { g: "ROADMAP_IS"; id: string; statuses: readonly RoadmapStatus[]; version?: number; archiveReason?: string }
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
  /** One claim-first array transaction behind the roadmap advisory lock. */
  apply(userId: string, ops: readonly StoreOp[]): Promise<ApplyResult>;
}

// ═══ Everything else the cores read or write (injectable) ═══════════════════

export interface TreeCard {
  domainId: string;
  level: number;
  dueDay: DayKey;
  graceEndsDay: DayKey | null;
  createdDay: DayKey;
  title: string | null;
  tags: string[];
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
}

/** What the cores take besides their arguments; the checks inject every one (no prisma, no after(), no Gemini). */
export interface RoadmapDeps extends RoadmapWriteOpts {
  /** after() in production: the draft's model call and Start's sizing run here. */
  defer?: (task: () => Promise<void> | void) => void;
  /** life-sizing applySizing under SIZING_DAILY_CAP; injected in the checks so it never reaches Gemini. */
  applySizing?: (templateId: string) => Promise<unknown>;
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
  roadmap: ["startDay", "targetDay", "firstAcceptedDay", "reachedDay"],
  roadmapRun: ["day"],
  roadmapMilestone: ["windowStart", "dueDay", "startedDay", "reachedDay", "reachPendingDay"],
  roadmapItem: [],
  roadmapMeasure: ["baselineDay"],
  roadmapAcceptance: ["day"],
};

const JSON_FIELDS: Readonly<Record<StoreTable, readonly string[]>> = {
  roadmap: ["syllabus"],
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
      return Prisma.sql`EXISTS (SELECT 1 FROM "Roadmap" WHERE "id" = ${g.id} AND "userId" = ${userId}
        AND "status" IN (${Prisma.join([...g.statuses])}) ${version} ${reason})`;
    }
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
      ideas: readonly { domainId: string; level: number; dueDate: Date; graceEndsAt: Date | null; createdAt: Date; isArchived: boolean; title: string | null; tags: string[] }[];
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
          domainId: i.domainId,
          level: i.level,
          dueDay: dayKeyOf(i.dueDate),
          graceEndsDay: i.graceEndsAt ? dayKeyOf(i.graceEndsAt) : null,
          createdDay: dayKeyOf(i.createdAt),
          title: i.title,
          tags: i.tags,
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
  applySizing: (templateId: string) => Promise<unknown>;
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
    applySizing: deps.applySizing ?? ((id: string) => applySizingDefault(id)),
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
    syllabusRef: r.syllabusRef,
    method: isOneOf(PRACTICE_METHODS, r.method) ? r.method : null,
    sessionsPerWeek: r.sessionsPerWeek,
    durationBand: isOneOf(PRACTICE_BANDS, r.durationBand) ? r.durationBand : null,
    rule: r.rule,
    planSource: r.planSource === "YOURS" ? "YOURS" : r.planSource === "WORKED_OUT" ? "WORKED_OUT" : null,
    checkpointKind: isOneOf(CHECKPOINT_KINDS, r.checkpointKind) ? r.checkpointKind : null,
    outOf: r.outOf,
    bar: r.bar,
    addToToday: r.addToToday,
    templateId: r.templateId,
    flags: r.flags.filter((f): f is BlockingFlag => isOneOf(BLOCKING_FLAGS, f)),
    notes: r.notes as ItemNote[],
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
    syllabusRef: it.syllabusRef,
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
  };
}

/**
 * The writes that make `plan` the roadmap's draft version: earlier DRAFT,
 * LATER and DISCARDED rows of that version are deleted first (a draft not
 * yet accepted can be replaced); PLANNED, STARTING and STARTED rows are at
 * other versions and never touched.
 */
function draftWriteOps(roadmapId: string, version: number, plan: readonly MilestoneDraft[], feasibility: Feasibility | null, now: Date, makeId: () => string): StoreOp[] {
  const ops: StoreOp[] = [{ op: "delete", table: "roadmapMilestone", where: { roadmapId, version, status: { in: ["DRAFT", "LATER", "DISCARDED"] } } }];
  const ms: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  const meas: Record<string, unknown>[] = [];
  for (const d of plan) {
    const id = makeId();
    const f = feasibility?.milestones.find((x) => x.lineageId === d.lineageId) ?? null;
    ms.push(milestoneRowOf(roadmapId, version, d, id, f, now));
    for (const it of d.items) items.push(itemRowOf(id, { ...it, id: null }, now, makeId));
    for (const m of d.measures) meas.push(measureRowOf(id, { ...m, id: null }, now, makeId));
  }
  if (ms.length) ops.push({ op: "insert", table: "roadmapMilestone", rows: ms });
  if (items.length) ops.push({ op: "insert", table: "roadmapItem", rows: items });
  if (meas.length) ops.push({ op: "insert", table: "roadmapMeasure", rows: meas });
  return ops;
}

/** Rewrites one milestone's children in place (same ids): its items and measures as `after` holds them, and its row's editable fields. */
function milestoneRewriteOps(before: MilestoneBundle, after: MilestoneDraft, now: Date, makeId: () => string, decided: ReadonlySet<string>): StoreOp[] {
  const ops: StoreOp[] = [
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
      },
    },
    { op: "delete", table: "roadmapItem", where: { milestoneId: before.id } },
    { op: "delete", table: "roadmapMeasure", where: { milestoneId: before.id } },
  ];
  const decidedAtOf = (it: ItemDraft): Date | null => {
    if (it.id && decided.has(it.id)) return now;
    return before.items.find((x) => x.id === it.id)?.decidedAt ?? null;
  };
  const items = after.items.map((it) => itemRowOf(before.id, it, now, makeId, decidedAtOf(it)));
  const meas = after.measures.map((m) => measureRowOf(before.id, m, now, makeId));
  if (items.length) ops.push({ op: "insert", table: "roadmapItem", rows: items });
  if (meas.length) ops.push({ op: "insert", table: "roadmapMeasure", rows: meas });
  return ops;
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
  fields: readonly { id: string; domains: readonly { id: string }[] }[];
}

/**
 * The server's validation of an intake (the browser's values are never
 * trusted): lengths, the span (35–1,080 days), hours, typical hours and the
 * new-card rate, the syllabus caps, a known Field, Domains that exist (any
 * Field; unknown ones dropped), and a track Area with no Domains. Returns the
 * normalised intake or the first refusal in words.
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

  const targetDay = typeof r.targetDay === "string" && isDayKey(r.targetDay) ? r.targetDay : null;
  if (!targetDay) return bad("Pick a date for the aim.");
  const span = daysBetween(ctx.today, targetDay);
  if (span < SPAN_MIN_DAYS) return bad("Too short for a roadmap — capture it as a goal on Today.");
  if (span > SPAN_MAX_DAYS) return bad("Set where you want to be in 3 years; planning further out comes later.");

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
    const lines = (Array.isArray(s.lines) ? s.lines : []).map(cleanText).filter((l) => l.length > 0);
    if (lines.length > SYLLABUS_MAX_LINES || lines.some((l) => Array.from(l).length > SYLLABUS_LINE_MAX)) {
      return bad(`The syllabus takes up to ${SYLLABUS_MAX_LINES} lines of up to ${SYLLABUS_LINE_MAX} characters each.`);
    }
    const source = cleanText(s.source);
    if (Array.from(source).length > SOURCE_NOTE_MAX) return bad(`Keep the syllabus source to ${SOURCE_NOTE_MAX} characters.`);
    syllabus = lines.length ? { lines, source: source || null } : null;
  }

  if (!isOneOf(START_POINTS, r.startPoint)) return bad("Pick where you're starting.");
  const startPoint: StartPoint = r.startPoint;
  if (!isOneOf(INTENSITIES, r.intensity)) return bad("Pick how hard.");
  const intensity: Intensity = r.intensity;

  const constraints = cleanText(r.constraints);
  if (Array.from(constraints).length > CONSTRAINTS_MAX) return bad(`Keep the constraints to ${CONSTRAINTS_MAX} characters.`);
  const examLabel = cleanText(r.examLabel);
  if (Array.from(examLabel).length > EXAM_MAX) return bad(`Keep the exam name to ${EXAM_MAX} characters.`);

  const practicesAllowed = fieldId ? r.practicesAllowed !== false : true;

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
    },
  };
}

/** The intake a roadmap row holds. */
export function intakeOf(r: RoadmapRec): Intake {
  const s = r.syllabus && typeof r.syllabus === "object" ? (r.syllabus as { lines?: unknown; source?: unknown }) : null;
  const syllabus: Syllabus | null =
    s && Array.isArray(s.lines) ? { lines: s.lines.filter((l): l is string => typeof l === "string"), source: typeof s.source === "string" ? s.source : null } : null;
  return {
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
  const data = intakeData(valid.value, today);
  const res = await withRetry<{ roadmapId: string }>(async () => {
    const rows = (await e.store.listRoadmaps(userId)).filter(isOpen).sort(latestFirst);
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

const measuredPace = (f: WeeklyFigure | undefined): boolean => f?.kind === "measured" && f.median > 0;

/** What /you/roadmap/new renders: the open DRAFT to edit, the Area options with their real facts, tracked time, the key. Writes nothing. */
export async function loadIntakeView(userId: string, now: Date, deps: RoadmapDeps = {}): Promise<IntakeView> {
  const e = envOf(deps);
  const today = todayKey(now);
  const [rows, tree, maintenance, throughput] = await Promise.all([
    e.store.listRoadmaps(userId).catch((err: unknown) => {
      if (isMissingRoadmapTable(err)) return [] as RoadmapRec[];
      throw err;
    }),
    e.io.fieldTree(),
    e.io.maintenanceIds(userId).catch(() => new Set<string>()),
    throughputOrNull(e, userId, today),
  ]);
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
  };
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

async function planContext(e: Env, userId: string, roadmap: RoadmapRec, now: Date): Promise<PlanContext> {
  const today = todayKey(now);
  const intake = intakeOf(roadmap);
  const until = intake.targetDay > today ? intake.targetDay : addDays(today, SPAN_MIN_DAYS);
  const [tree, throughput, paceRows, m, rest, maintenance] = await Promise.all([
    e.io.fieldTree(),
    throughputOrNull(e, userId, today),
    throughputRowsOrNull(e, userId, today),
    e.io.intervalMultiplier(userId).catch((err: unknown) => {
      console.error("roadmap: interval multiplier unavailable:", err);
      return 1;
    }),
    e.io.restRows(userId, today, until),
    e.io.maintenanceIds(userId).catch(() => new Set<string>()),
  ]);
  return {
    today,
    roadmap,
    intake,
    tree,
    domains: domainFactsOf(tree),
    areaName: areaNameOf(roadmap, tree),
    throughput: throughput ?? calibratingThroughput(addDays(today, -THROUGHPUT_LAG_DAYS)),
    paceRows,
    m: Number.isFinite(m) && m > 0 ? m : 1,
    held: Array.from(heldDaysOf(rest, today, until)).sort(),
    maintenance,
  };
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

function cardStatesOf(ctx: PlanContext, domainIds: readonly string[]): CardState[] {
  const out: CardState[] = [];
  for (const id of domainIds) {
    const d = ctx.domains.get(id);
    if (!d) continue;
    for (const c of d.cards) out.push({ level: c.level, dueDay: c.dueDay, graceEndsDay: c.graceEndsDay, createdDay: c.createdDay, domainId: c.domainId });
  }
  return out;
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
  };
}

/** Cards in a scope at level ≥ L, now (CARDS_AT_LEVEL's value; levels 13–20 count). */
function liveCount(ctx: Pick<PlanContext, "domains">, domainIds: readonly string[], level: number): { value: number; byDomain: Record<string, number> } {
  const byDomain: Record<string, number> = {};
  let value = 0;
  for (const id of new Set(domainIds)) {
    const n = (ctx.domains.get(id)?.cards ?? []).filter((c) => c.level >= level).length;
    byDomain[id] = n;
    value += n;
  }
  return { value, byDomain };
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

function validateDomainsOf(ctx: PlanContext): validate.ValidateDomain[] {
  return Array.from(ctx.domains.values()).map((d) => ({
    id: d.id,
    name: d.name,
    fieldId: d.fieldId,
    fieldName: d.fieldName,
    cards: d.cards.length,
    titles: d.cards.map((c) => c.title).filter((t): t is string => !!t).slice(0, 50),
    tags: Array.from(new Set(d.cards.flatMap((c) => c.tags))).slice(0, 50),
  }));
}

/** The plan built from one parsed sample: validated, fitted and checked on today's data; null when nothing survives. */
function planFromSample(
  e: Env,
  ctx: PlanContext,
  pack: EvidencePack,
  parsed: unknown,
  windows: readonly { start: DayKey; end: DayKey }[]
): { plan: MilestoneDraft[]; feasibility: Feasibility; validated: ValidatedDraft } | null {
  const validated = e.lanes.validateSample(parsed, {
    pack,
    intake: ctx.intake,
    areaName: ctx.areaName,
    areaFieldId: ctx.intake.fieldId,
    domains: validateDomainsOf(ctx),
    windows: [...windows],
    today: ctx.today,
    makeId: e.makeId,
    version: ctx.roadmap.version + 1,
  });
  if (validated.milestones.length === 0) return null;
  const plan = e.lanes.fitPlan(validated.milestones, realismInputOf(ctx, validated.milestones));
  if (plan.length === 0) return null;
  return { plan, feasibility: e.lanes.feasibilityOf(plan, realismInputOf(ctx, plan)), validated };
}

/**
 * The in-house starter (F7): "Build from my numbers", and the fallback when
 * Gemini fails. R2's starter measures the intake's first
 * DOMAINS_PER_MILESTONE named Domains; the rest are said in the run's report
 * ("What was dropped"), never left out silently. The intake itself keeps
 * every chosen Domain (up to PACK_MAX_DOMAINS): a Gemini draft spreads them
 * across milestones.
 */
function starterPlan(e: Env, ctx: PlanContext): { plan: MilestoneDraft[]; feasibility: Feasibility; report: ValidationReport } {
  const names: Record<string, DomainName> = {};
  for (const id of ctx.intake.domainIds) {
    const d = ctx.domains.get(id);
    if (d) names[id] = domainName(d);
  }
  const plan = e.lanes.starterLadder(ctx.intake, realismInputOf(ctx, [], [ctx.intake.domainIds]), names, e.makeId);
  return { plan, feasibility: e.lanes.feasibilityOf(plan, realismInputOf(ctx, plan)), report: starterReportOf(ctx, names) };
}

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
  const ctx = await planContext(e, userId, first.roadmap, now);
  const windows = e.lanes.splitWindows(today, ctx.intake.targetDay);
  if (!windows || windows.length === 0) return fail("The aim's date no longer fits a roadmap — change the date.");
  const pack = e.lanes.buildEvidencePack({ intake: ctx.intake, areaName: ctx.areaName, domains: evidenceDomainsOf(ctx), windows });
  const inputHash = sha256(e.lanes.inputHashMaterial(pack, ctx.intake, ROADMAP_MODEL, ROADMAP_SAMPLES));

  if (!opts.force) {
    const reused = await reuseRun(e, userId, first, ctx, inputHash, windows, now);
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

/** A reuse (F8 step 3): a REUSED run (no call, outside the cap) whose stored replies are validated, fitted and checked again on today's data. */
async function reuseRun(
  e: Env,
  userId: string,
  b: RoadmapBundle,
  ctx: PlanContext,
  inputHash: string,
  windows: readonly { start: DayKey; end: DayKey }[],
  now: Date
): Promise<Result<{ runId: string; status: RunStatus }> | null> {
  const today = ctx.today;
  // The reuse rule's one definition (R3's isReusableRun): GEMINI, OK, the same hash, claimed 0–ROADMAP_REUSE_DAYS life days ago.
  const candidates = (await e.store.reusableRuns(userId, inputHash, addDays(today, -ROADMAP_REUSE_DAYS))).filter((r) => model.isReusableRun(r, inputHash, today));
  for (const source of candidates) {
    const pack = source.pack as EvidencePack | null;
    if (!pack || typeof pack !== "object") continue;
    for (const s of model.reusableSamplesOf(source.samples)) {
      const built = planFromSample(e, ctx, pack, parseRaw(s.raw), windows);
      if (!built) continue;
      const runId = e.makeId();
      const v = b.roadmap.version + 1;
      const out = await e.store.apply(userId, [
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
        ...draftWriteOps(b.roadmap.id, v, built.plan, built.feasibility, now, e.makeId),
      ]);
      if (out === "ok") return ok({ runId, status: "REUSED" as RunStatus });
      return null;
    }
  }
  return null;
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
    const windows = e.lanes.splitWindows(ctx.today, ctx.intake.targetDay) ?? [];
    const results: SampleResult[] = await e.lanes.draftSamples(pack, ROADMAP_SAMPLES, { callModel: deps.callModel, seedBase: run.seedBase ?? SEED_BASE });
    const samples = results.flatMap((r) => (r.ok ? [r.value] : []));
    const errors = results.flatMap((r) => (r.ok ? [] : [r.error]));

    let built: { plan: MilestoneDraft[]; feasibility: Feasibility; validated: ValidatedDraft } | null = null;
    for (const s of samples) {
      built = planFromSample(e, ctx, pack, s.parsed, windows);
      if (built) break;
    }
    // Every sample's facts, failed ones included (their finishReason, responseId, usage, latency and capped text).
    const facts = { ...model.runFactsOf(results), finishedAt: now };
    if (built) {
      const partial = errors.length > 0 || built.validated.milestones.length < pack.milestoneCount;
      await persistRun(e, run, b, built.plan, built.feasibility, { ...facts, status: partial ? "PARTIAL" : "OK", report: built.validated.report, error: null }, now);
      return;
    }
    const why = errors.length ? errors.join("; ") : samples.length ? "the draft had nothing usable" : "no reply";
    let starter: { plan: MilestoneDraft[]; feasibility: Feasibility; report: ValidationReport } | null = null;
    try {
      starter = starterPlan(e, ctx);
    } catch (err) {
      console.error("roadmap: starter fallback failed:", err);
    }
    // A FAILED run that wrote the starter says so (report.fallback STARTER): the page labels those rows "built from your numbers", never Gemini's.
    const wroteStarter = !!starter && starter.plan.length > 0;
    const report = wroteStarter && starter ? { ...starter.report, fallback: RUN_FALLBACK_STARTER } : null;
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
  const write = plan.length > 0 ? draftWriteOps(b.roadmap.id, run.version, plan, feasibility, now, e.makeId) : [];
  const out = await e.store.apply(run.userId, [
    { op: "guard", guard: { g: "RUN_IS", id: run.id, status: "RUNNING" } },
    { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["DRAFT"], version: run.version - 1 } },
    { op: "update", table: "roadmapRun", where: { id: run.id, status: "RUNNING" }, data },
    ...write,
  ]);
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
    const ctx = await planContext(e, userId, b.roadmap, now);
    let built: { plan: MilestoneDraft[]; feasibility: Feasibility; report: ValidationReport | null };
    try {
      if (kind === "INHOUSE") built = starterPlan(e, ctx);
      else {
        const plan = e.lanes.manualLadder(ctx.intake, realismInputOf(ctx, [], [ctx.intake.domainIds]), e.makeId);
        built = { plan, feasibility: e.lanes.feasibilityOf(plan, realismInputOf(ctx, plan)), report: null };
      }
    } catch (err) {
      console.error("roadmap: the plan from your numbers wasn't built:", err);
      return fail("Couldn't build the plan. Try again.");
    }
    if (built.plan.length === 0) return fail("Pick at least one Domain, or add a practice.");
    const runId = e.makeId();
    const v = b.roadmap.version + 1;
    const report = built.report && built.report.dropped.length ? built.report : null;
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT"], version: b.roadmap.version } },
      { op: "update", table: "roadmapRun", where: { roadmapId, status: "RUNNING" }, data: { status: "FAILED", error: "replaced by a plan from your numbers", finishedAt: now } },
      { op: "insert", table: "roadmapRun", rows: [runRow(runId, userId, roadmapId, ctx.today, v, kind, "OK", now, { finishedAt: now, report })] },
      ...draftWriteOps(roadmapId, v, built.plan, built.feasibility, now, e.makeId),
    ]);
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
  if (!trackArea && domains.length > 0) {
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
      const ctx = await planContext(e, userId, b.roadmap, now);
      // An ACTIVE roadmap's re-plan draft is fitted beside the milestones already carried (their capacity and due
      // days, fix round 2); only the draft's rows come back to be written.
      const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
      const plan = [...carried, ...drafts];
      next = e.lanes.fitPlan(plan, realismInputOf(ctx, plan)).filter((d) => !isCarried(d));
    } catch (err) {
      console.error("roadmap: re-fit after an edit failed; saved without it:", err);
    }
  }
  const ops: StoreOp[] = milestoneGuards(b, m);
  for (let i = 0; i < group.length; i++) {
    const after = next.find((x) => x.lineageId === group[i].lineageId && x.id === group[i].id) ?? next[i];
    if (!after) continue;
    const before = draftOf(group[i]);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    ops.push(...milestoneRewriteOps(group[i], after, now, e.makeId, opts.decided ?? new Set()));
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
  const out = await e.store.apply(userId, [...guards, { op: "update", table, where: { id }, data }]);
  return out === "ok" ? ok(null) : "stale";
}

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
    if (!item) {
      if (decision === "REMOVED") return fail("A milestone keeps its title; edit it instead.");
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
  if (!EDIT_FIELDS.some((k) => ed[k] !== undefined)) return fail("Nothing to change.");
  const res = await withRetry<null>(async () => {
    const loc = await locate(e, userId, itemId);
    if (!loc) return fail("That item no longer exists.");
    const { b, m, item } = loc;
    const cardEdit = ed.target !== undefined || ed.minLevel !== undefined;
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
      const inScope = m.items.some((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId === ed.domainId);
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
}

const KIND_CAP: Readonly<Record<ItemKind, number>> = {
  DOMAIN: DOMAINS_PER_MILESTONE,
  TOPIC: TOPICS_PER_MILESTONE,
  PRACTICE: PRACTICES_PER_MILESTONE,
  STEP: STEPS_PER_MILESTONE,
  CHECKPOINT: CHECKPOINTS_PER_MILESTONE,
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
    if (m.items.filter((i) => i.kind === kind && liveItem(i)).length >= KIND_CAP[kind]) return fail(`A milestone holds at most ${KIND_CAP[kind]} of these.`);
    const tree = await e.io.fieldTree();
    const facts = domainFactsOf(tree);
    let label = "";
    let domainId: string | null = null;
    if (kind === "DOMAIN") {
      if (b.roadmap.fieldId == null) return fail("A life-track Area has no Domains.");
      const d = n.domainId ? facts.get(n.domainId) : undefined;
      if (!d) return fail("Pick one of your Domains.");
      if (m.items.some((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId === d.id)) return fail("That Domain is already here.");
      label = d.name;
      domainId = d.id;
    } else if (kind === "TOPIC" && n.syllabusRef != null) {
      // The user's syllabus line, whole, as the topic's words (origin SYLLABUS); one topic per line in this version.
      const lines = intakeOf(b.roadmap).syllabus?.lines ?? [];
      const ref = n.syllabusRef;
      if (!Number.isInteger(ref) || ref < 0 || ref >= lines.length) return fail("That syllabus line no longer exists.");
      const sameVersion = b.milestones.filter((x) => x.version === m.version && x.status !== "DISCARDED" && x.status !== "SUPERSEDED");
      if (sameVersion.some((x) => x.items.some((i) => i.kind === "TOPIC" && liveItem(i) && i.syllabusRef === ref))) return fail("That syllabus line is already a topic.");
      label = cleanText(lines[ref]);
      if (!label) return fail("That syllabus line is empty.");
      domainId = n.domainId ?? null;
      if (domainId && !m.items.some((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId === domainId)) return fail("Pick one of this milestone's Domains.");
    } else {
      const l = userLabel(e, n.label, kind, b);
      if (!l.ok) return fail(l.error);
      label = l.value;
      if (kind === "TOPIC") {
        domainId = n.domainId ?? null;
        if (domainId && !m.items.some((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId === domainId)) return fail("Pick one of this milestone's Domains.");
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
    const tree = await e.io.fieldTree();
    const facts = domainFactsOf(tree);
    let next: Partial<ItemDraft>;
    let structural = true;
    switch (r.kind) {
      case "CHECK":
        if (!item.domainId) return fail("Create this Domain, map it to one of yours, or drop it.");
        if (item.flags.includes("NUMBER")) return fail("Gemini wrote a number here; map the Domain or drop it.");
        next = { decision: "CHECKED" };
        structural = false;
        break;
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

/** One remedy tap: rewrite the draft (roadmap-realism applyRemedy) and re-run the engine; moving the date moves the aim's date. */
export async function applyRemedyCore(userId: string, roadmapId: string, remedy: Remedy, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (remedy !== "MOVE_DATE" && remedy !== "REFIT_LIGHT" && remedy !== "MOVE_TO_LATER") return fail("Pick a remedy.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    const group = draftRowsOf(b);
    if (group.length === 0) return fail("There's no draft to change.");
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
    for (const row of group) {
      const after = changed.find((d) => d.id === row.id) ?? changed.find((d) => d.lineageId === row.lineageId);
      if (!after) continue;
      ops.push(...milestoneRewriteOps(row, { ...after, status: after.status === "LATER" ? "LATER" : "DRAFT" }, now, e.makeId, new Set()));
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

// ═══ Accept (F9) ════════════════════════════════════════════════════════════

const NAME_OF_KIND: Readonly<Record<ItemKind, string>> = { DOMAIN: "Domain", TOPIC: "topic", PRACTICE: "practice", STEP: "step", CHECKPOINT: "checkpoint" };

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
export function acceptBlockersOf(drafts: readonly MilestoneDraft[], feasibility: Feasibility | null, scheduledTotal: number): AcceptCheck {
  const blockers: string[] = [];
  const next = drafts.find((d) => d.status !== "LATER") ?? null;
  if (!next) blockers.push("There's no milestone to accept.");
  else {
    const place = `milestone ${next.ord}`;
    if (!next.title.trim()) blockers.push(`Name ${place}.`);
    else if (next.titleDecision === "PENDING" && provenanceOf(next.titleOrigin, next.titleDecision) === "DRAFT") blockers.push(`Decide the title of ${place}.`);
    for (const it of next.items) {
      if (it.kind === "DOMAIN" && liveItem(it) && !it.domainId) blockers.push(`Create, map or drop the proposed Domain “${it.proposedName ?? it.label}”.`);
      else if (isUndecidedItem(it)) blockers.push(`Decide the ${NAME_OF_KIND[it.kind]} “${it.label}” in ${place}.`);
      else if (it.kind === "CHECKPOINT" && liveItem(it) && (it.bar == null || it.outOf == null)) blockers.push(`Set the bar for the checkpoint “${it.label}”.`);
    }
    if (!next.measures.some((x) => x.role === "PAYS")) blockers.push(`No measurable part in ${place} — add a Domain or a practice.`);
  }
  // The footer's target is the one definition of what the next milestone still needs (roadmap-types draftNeedsOf), in the page's order.
  const nextToDecide = next ? (draftNeedsOf(next)[0]?.id ?? null) : null;
  if (feasibility?.impossible) blockers.push("A milestone can't be done by its date as planned — use a remedy or change it.");
  if (scheduledTotal > MAX_MILESTONES) blockers.push(`A roadmap holds at most ${MAX_MILESTONES} milestones; move some to Later.`);
  return { blockers, nextToDecide, nextLineageId: next?.lineageId ?? null, needsOver: !!feasibility?.over };
}

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
    const ctx = await planContext(e, userId, b.roadmap, now);
    const carriedRows = planRowsOf(b).filter(isCarried);
    // What the engine, the end state and the basis read: the carried rows at their one due day, none a copy replaces (fix round 2).
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const drafts = group.map(draftOf);
    const feasibility = e.lanes.feasibilityOf([...carried, ...drafts], realismInputOf(ctx, [...carried, ...drafts]));
    // Positions, not rows: a dropped row and its "Start again" copy are one milestone (F12; roadmap-types positionCountOf).
    const scheduledTotal = positionCountOf([...carriedRows, ...group.filter(scheduled)]);
    const check = acceptBlockersOf(drafts, feasibility, scheduledTotal);
    if (check.blockers.length) return fail(check.blockers[0]);
    if (check.needsOver && !overAccepted) return fail("This plan is over your hours or pace: switch on “Keep it over my hours/pace” to accept it.");

    const baseOrd = Math.max(0, ...carriedRows.map((m) => m.ord));
    const newOrd = new Map(group.map((m, i) => [m.id, baseOrd + i + 1]));
    // One rank place per lineage: a carried row whose position the draft re-plans (a dropped row whose copy is in the
    // draft) gives its place to the draft row, and of two carried rows of one lineage the newest keeps it.
    const rankCarried = onePerLineage(carriedRows.filter((m) => !groupLineages.has(m.lineageId)));
    const rankRows = [
      ...rankCarried.map((m) => ({ id: m.id, lineageId: m.lineageId, ord: m.ord, carried: true, later: false, rankIndex: m.rankIndex })),
      ...group.map((m) => ({ id: m.id, lineageId: m.lineageId, ord: newOrd.get(m.id) as number, carried: false, later: m.status === "LATER", rankIndex: null })),
    ];
    const ranks = e.lanes.assignRankIndices(rankRows, firstRankByLineage(b));

    const planForEnd = [
      ...carried.map((d) => ({ draft: d, ord: d.ord })),
      ...drafts.map((d) => ({ draft: d, ord: newOrd.get(d.id as string) as number })),
    ];
    const endState = endStateFor(ctx, planForEnd, b.acceptances);

    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "NO_OTHER_ACTIVE", exceptId: roadmapId } },
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: cur } },
      // A Start racing this accept (after the read above) makes it stale: re-read, and the check above refuses.
      { op: "guard", guard: { g: "NOTHING_STARTED_SINCE", roadmapId, since: draftSince } },
      {
        op: "update",
        table: "roadmap",
        where: { id: roadmapId, version: cur },
        data: { status: "ACTIVE", version: v, firstAcceptedDay: b.roadmap.firstAcceptedDay ?? ctx.today, updatedAt: now },
      },
    ];
    if (cur >= 1) ops.push({ op: "update", table: "roadmapMilestone", where: { roadmapId, version: cur, status: { in: ["PLANNED", "LATER"] } }, data: { status: "SUPERSEDED" } });
    const readingRows: ReadingRow[] = [];
    const next = group.find((g) => g.status !== "LATER") ?? null;
    for (const row of group) {
      const d = drafts.find((x) => x.id === row.id) as MilestoneDraft;
      const f = feasibility.milestones.find((x) => x.lineageId === row.lineageId) ?? null;
      const over = !!f && (f.worst === "OVER" || f.time.verdict === "OVER");
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
        },
      });
      for (const x of row.measures) {
        if (x.kind !== "CARDS_AT_LEVEL" || x.minLevel == null) continue;
        const ids = scopeOf(x.scope).domainIds ?? [];
        if (!ids.length) continue;
        const key = cardsAtLevelKey(ids, x.minLevel);
        const live = liveCount(ctx, ids, x.minLevel);
        ops.push({ op: "update", table: "roadmapMeasure", where: { id: x.id }, data: { baseline: live.value, baselineDay: ctx.today, fittedTarget: x.target, measureKey: key } });
        if (row.id === next?.id) readingRows.push(measures.cardsReadingRow(key, ctx.today, live));
      }
    }
    for (const t of endState) {
      if (readingRows.some((r) => r.measureKey === t.measureKey)) continue;
      const parsed = parseMeasureKey(t.measureKey);
      if (parsed?.kind !== "CARDS_AT_LEVEL") continue;
      readingRows.push(measures.cardsReadingRow(t.measureKey, ctx.today, liveCount(ctx, parsed.domainIds, parsed.level)));
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
          feasibility,
          endState,
          intervalMultiplier: ctx.m,
          overAccepted: overAccepted && feasibility.over,
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
      basis = e.lanes.proficiencyBasisOf({ basisVersion: v, endState, feasibility, milestones: planAfter, switchedOff: switchedOffOf(carriedRows), heldDays: ctx.held });
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
  return statedForMilestone(startStatedInputOf(basis, payPracticesOf(m), off));
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

function blockersOf(m: MilestoneDraft, rows: readonly TodayBoundRow[]): string[] {
  const out: string[] = [];
  if (!m.title.trim()) out.push("Name this milestone: its name is the goal's on Today.");
  if (m.items.some(isUndecidedItem) || (m.titleDecision === "PENDING" && provenanceOf(m.titleOrigin, m.titleDecision) === "DRAFT")) {
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

async function highWaterOf(e: Env, userId: string, ctx: PlanContext, card: MeasureSpec, ownGoalId: string | null): Promise<HighWater | null> {
  const ids = card.scope.domainIds ?? [];
  if (!ids.length || card.minLevel == null) return null;
  const key = cardsAtLevelKey(ids, card.minLevel);
  const live = liveCount(ctx, ids, card.minLevel).value;
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
  return { ...m, measures: m.measures.map((x) => (x.kind === "CARDS_AT_LEVEL" ? { ...x, baseline: hw.baseline, baselineDay: today, measureKey: hw.key } : x)) };
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
    card ? highWaterOf(e, userId, ctx, card, row.goalId) : Promise.resolve(null),
  ]);
  const byId = new Map(templates.map((t) => [t.id, t]));
  // The engine's plan: the carried rows at their one due day, none a copy replaces (fix round 2), and the unstarted rows.
  const unstarted = planRows.filter((m) => !isCarried(m));
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
    pending: m.items.filter(isUndecidedItem),
    todayRows: rows,
    practices,
    steps: m.items.filter((i) => i.kind === "STEP" && liveItem(i)).map((i) => ({ itemId: i.id as string, title: i.label })),
    pay: { stated: stated.stated, zeroReason: stated.zeroReason, limitLine: limitLineOf(midPaid), paidOn: stated.paidOn },
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

    // The card measure's final target (stored or re-fitted) over its high-water baseline (decision 10).
    const card = m.measures.find((x) => x.kind === "CARDS_AT_LEVEL");
    if (card) {
      if (!card.scope.domainIds?.length || card.minLevel == null) return fail("This milestone's card measure has no level yet — re-fit the plan.");
      const key = cardsAtLevelKey(card.scope.domainIds, card.minLevel);
      const hw = f.hw && f.hw.key === key ? f.hw : await highWaterOf(e, userId, ctx, card, row.goalId);
      if (!hw) return fail("This milestone's card measure has no level yet — re-fit the plan.");
      const target = ch.target === "FITTED_NOW" && refitted.todayCheck && refitted.todayCheck.measureKey === key ? refitted.todayCheck.fittedNow : card.target;
      if (target < hw.baseline + minIncrementCards(hw.baseline)) {
        return fail(
          hw.paidOn
            ? `Already counted up to ${hw.baseline} (paid ${shortDate(hw.paidOn)}) — re-fit to raise the target.`
            : `Already at ${hw.baseline} — the target needs to be higher; re-fit to raise it.`
        );
      }
      m = {
        ...m,
        measures: m.measures.map((x) =>
          x === card ? { ...x, target, targetSource: ch.target === "FITTED_NOW" ? "WORKED_OUT" : x.targetSource, baseline: hw.baseline, baselineDay: ctx.today, measureKey: key } : x
        ),
      };
    }
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
      ...milestoneRewriteOps(row, { ...m, status: "PLANNED" }, now, e.makeId, new Set([...Object.keys(ch.decisions), ...Object.keys(ch.edits)])),
      {
        op: "update",
        table: "roadmapMilestone",
        where: { id: row.id, status: "PLANNED" },
        data: { status: "STARTING", startedDay: ctx.today, startingAt: now, overAccepted: row.overAccepted || (over && ch.overAccepted), feasibility: feasibilityJson(snapshot ?? fz, m.notes) },
      },
    ];
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
      e.defer(() => e.applySizing(t.id).then(() => undefined));
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
      e.defer(() => e.applySizing(t.id).then(() => undefined));
    }
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
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["ACTIVE"], version: b.roadmap.version } },
      { op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: ["STARTED"] } },
      { op: "insert", table: "roadmapMilestone", rows: [rowData] },
      { op: "insert", table: "roadmapItem", rows: copy.items.map((it) => itemRowOf(id, it, now, e.makeId)) },
      { op: "insert", table: "roadmapMeasure", rows: copy.measures.map((x) => measureRowOf(id, x, now, e.makeId)) },
    ]);
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
    const v = b.roadmap.version + 1;
    const rows = planRowsOf(b);
    const unstartedRows = rows.filter((m) => !isCarried(m));
    // The carried rows at their one due day (a Reschedule moves the windows after it), none a "Start again" copy replaces (fix round 2).
    const carried = carriedPlanOf(b, unstartedRows, await carriedGoalsOf(e, userId, b));
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
    const ctx = await planContext(e, userId, b.roadmap, now);
    if (kind === "REFIT") {
      const refitted = e.lanes.refit([...carried, ...plan], realismInputOf(ctx, [...carried, ...plan]));
      plan = refitted.filter((d) => !isCarried(d)).map((d) => ({ ...d, status: d.status === "LATER" ? "LATER" : "DRAFT", version: v }));
    }
    if (plan.length === 0) return fail("Every milestone has started; nothing is left to re-plan.");
    if (positionCountOf([...carried, ...plan.filter(scheduled)]) > MAX_MILESTONES) return fail(`A roadmap holds at most ${MAX_MILESTONES} milestones; move some to Later.`);
    try {
      feasibility = e.lanes.feasibilityOf([...carried, ...plan], realismInputOf(ctx, [...carried, ...plan]));
    } catch (err) {
      console.error("roadmap: re-plan feasibility not computed:", err);
    }
    const runId = e.makeId();
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: b.roadmap.version } },
      { op: "insert", table: "roadmapRun", rows: [runRow(runId, userId, roadmapId, ctx.today, v, kind === "REFIT" ? "INHOUSE" : "MANUAL", "OK", now, { finishedAt: now })] },
      ...draftWriteOps(roadmapId, v, plan, feasibility, now, e.makeId),
    ]);
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
  };
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** A stored report as the page reads it: its three lists (a starter fallback's `fallback` marker stays on the row). */
function reportOf(raw: unknown): ValidationReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof ValidationReport, unknown>>;
  if (!Array.isArray(r.dropped) || !Array.isArray(r.flagged) || !Array.isArray(r.notes)) return null;
  return { dropped: r.dropped as ValidationReport["dropped"], flagged: r.flagged as ValidationReport["flagged"], notes: r.notes as ValidationReport["notes"] };
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
  return {
    milestones: onePerLineage(rows).map((m) => ({ ord: m.ord, rankIndex: m.rankIndex, reachedDay: m.reachedDay, reachPendingDay: m.reachPendingDay, scheduled: m.status !== "LATER" })),
    roadmapReachedDay: b.roadmap.reachedDay,
    maxScheduled: Math.min(MAX_MILESTONES, maxScheduledPositionsOf(b.milestones)),
    today,
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
  const rows = planRowsOf(v.b);
  const nextPlanned = rows.find((m) => m.status === "PLANNED")?.id ?? null;
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
  return rows.find((m) => !superseded(v.b, m) && (m.status === "STARTING" || (m.status === "STARTED" && goalOpen(m, v.templates)))) ?? rows.find((m) => m.status === "PLANNED") ?? null;
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
  return {
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

function historyOf(b: RoadmapBundle): PlanHistoryRow[] {
  const out: PlanHistoryRow[] = [];
  let prev: AcceptanceRec | null = null;
  for (const a of b.acceptances) {
    out.push({ version: a.version, day: a.day, undone: a.undoneAt != null, changes: prev ? endStateChanges(endStateOf(prev), endStateOf(a)) : [] });
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
 */
function draftViewOf(e: Env, b: RoadmapBundle, ctx: PlanContext, goals: ReadonlyMap<string, GoalFacts>): DraftView | null {
  const group = draftRowsOf(b);
  if (group.length === 0) return null;
  const carriedRows = planRowsOf(b).filter(isCarried);
  const total = positionCountOf([...carriedRows, ...group.filter(scheduled)]);
  const drafts = labelChecksOf(e, b, ctx.tree, group.map(draftOf), total);
  const carried = carriedPlanOf(b, group, goals);
  let feasibility: Feasibility;
  try {
    feasibility = e.lanes.feasibilityOf([...carried, ...drafts], realismInputOf(ctx, [...carried, ...drafts]));
  } catch {
    feasibility = { today: ctx.today, m: ctx.m, milestones: [], aimCheck: { kind: "unchecked" }, basis: [], remedies: [], impossible: false, over: false };
  }
  // The total acceptCore checks against MAX_MILESTONES: positions over the carried rows and the draft's scheduled ones.
  const check = acceptBlockersOf(drafts, feasibility, total);
  const items = drafts.flatMap((d) => d.items);
  const used = new Set(items.filter((i) => i.kind === "TOPIC" && liveItem(i) && i.syllabusRef != null).map((i) => i.syllabusRef as number));
  const lines = ctx.intake.syllabus?.lines ?? [];
  let nonEnglish = false;
  try {
    nonEnglish = e.lanes.isNonEnglish(b.roadmap.aim);
  } catch {
    nonEnglish = false;
  }
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
    planContext(e, userId, b.roadmap, now),
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
  const draft = draftViewOf(e, b, ctx, v.templates);
  const header = headerOf(e, v);
  // Before any acceptance the aim check is the draft's (it is never a verdict chip beside the aim).
  if (!currentAcceptance(b) && draft) header.aimCheck = draft.feasibility.aimCheck;
  else if (currentAcceptance(b) && aimFigureMoved(header.aimCheck, b.roadmap)) {
    // A figure added after acceptance ("Add a figure"): worked out again from the plan; the acceptance's record stays as it was.
    try {
      const unstarted = planRowsOf(b).filter((m) => !isCarried(m));
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
    feasibility: feasibilityOfAcceptance(currentAcceptance(b)),
    history: historyOf(b),
    triggers: triggersFor(e, v, ctx, wq?.set ?? null),
    aftercare,
    // A writes-off server never schedules the fallback freeze (it records nothing).
    questWeekUnfrozen: !!wq && !wq.frozen && !wq.view.writesOff && !writesOff(deps),
  };
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
    return e.lanes.triggersOf({ milestones, paceAtAcceptance, paceNow, questWeek: weekSet });
  } catch (err) {
    // The banner is QUESTS_BEHIND's one surface (R6): a failure here leaves a trace, never a silent gap.
    console.error("roadmap: triggers unavailable:", err);
    return [];
  }
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
  const done = open ? null : ([...rows].sort(latestFirst).find((r) => r.status === "DONE") ?? null);
  const base: AimCardView = {
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
  };
  const pick = open ?? done;
  if (!pick) return base;
  const b = await e.store.bundle(userId, pick.id);
  if (!b) return base;
  const active = b.roadmap.status === "ACTIVE";
  const [v, wq, ctx] = await Promise.all([
    viewData(e, userId, b, now, deps),
    active ? e.lanes.loadWeekQuests(userId, now).catch(() => null) : Promise.resolve(null),
    // The milestone line's projection reads today's card states, pass rate and pace (cached loaders).
    active ? planContext(e, userId, b.roadmap, now).catch(() => null) : Promise.resolve(null),
  ]);
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
  };
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
    if (isMissingRoadmapTable(err)) return null;
    throw err;
  }
}
