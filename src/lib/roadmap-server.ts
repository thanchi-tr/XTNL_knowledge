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
 *                      createDomain, archiveCore, pauseForSafetyCore)
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
 *   Accept      acceptCore · undoAcceptCore · acceptBlockersOf · confirmPicksOf · picksChoiceRefusalOf
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
 *     (validateKeysOnly) and materialised into R2's stage ladder: Gemini's
 *     part only (v4, contracts §20: the Domains the aim needs, the outline's
 *     learning order, one pick per stage among code's candidates), then the
 *     practice progression through R2's fitPlan (code owns every stage's
 *     practices, steps and checkpoint; a valid pick is added beside its
 *     stage's focus, code's default, contracts §20.11),
 *     the feasibility and the date check.
 *   - The practice progression (contracts §20) on every plan path: the
 *     starter, Gemini's plan, every re-plan (the started stages carried),
 *     the activity answer's re-sync and every re-fit after an edit pass the
 *     plan's intake to R2 (PlaceOpts.intake), which puts progressionOf's
 *     kinds on each DRAFT stage; Start and the week quests read them.
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
 *
 * Constraint safety: confirm to unlock (contracts §19; lane R4's half):
 *   - One gate (planGateOf: roadmap-catalog allowedKindsFor over the row's
 *     words, the parser's pre-fill and the user's stored answers) read by
 *     every plan path: the starter and stage ladder, the Gemini keys-only
 *     placement (gateValidated, before the caps), every re-fit, redraft and
 *     re-plan, a pick from the type list, accept (acceptBlockersOf), Start
 *     (a held practice or step gets no task) and the week quests (Start's set
 *     and R6's own reading). A kind it blocks is never placed (gatePlanRows).
 *     The safety-gaps round: every BODY or CARE plan asks, CRAFT asks on a
 *     cue; a kept pick or the user's own row of a kind that waits again is
 *     held (accept reads every live row); every refusal while the card waits
 *     points at it (pointedAt inline for accept, Start and a pick, and
 *     pointedRefusal around every re-plan, review edit and build core, accept
 *     and Start: the lead's ruling on decision 2).
 *   - The answer (setActivityVerdictsCore, YOURS: ActivityCardAnswer, ticks
 *     or "Nothing to avoid", carrying the words' key; a stale key is refused
 *     and the card asks again) lives in Roadmap.coverage["$activities"]:
 *     intakeOf reads it, intakeData writes the column through coverageJsonOf,
 *     an intake save carries it and re-gates the draft to the new words
 *     (draftGateOps through regatedDrafts: the track's safe kinds take the
 *     released kinds' place, as in a fresh build; a changed track rebuilds
 *     the rows for the new track, onTrackRowOf dropping the old track's
 *     rows), and both writes are
 *     guarded on the row as read (ROADMAP_IS updatedAt). On a DRAFT the
 *     answer re-syncs the draft (regatedDrafts); on an ACTIVE plan it offers
 *     a re-plan, and an AVOID given after Start pauses the started task at
 *     once, a must included (the lead's ruling 2: tasks.ts
 *     pauseForSafetyCore; ActivityVerdictsResult.paused, undone with
 *     unarchiveTask), and its practice stops counting toward the milestone
 *     from that day (ruling 3: offTargetOpsOf; the view shows no pace and
 *     stops "planned so far" there). A Start finishing meanwhile re-checks
 *     the answers after its write (pauseAvoidedAfterFinish).
 *   - Views: DraftView/RoadmapView.activityConfirm (activityConfirmViewOf);
 *     DraftView.exclusions lists what the gate left out because of the words;
 *     DraftView.aimConflict shows only until the card is answered.
 *
 *   Confirm   setActivityVerdictsCore · ActivityVerdictsResult · PausedTask · PlanGate · gatePlanRows ·
 *             ACTIVITY_WAITING_PICK · ACTIVITY_AVOIDED_PICK · ACTIVITY_WAITING_START · ACTIVITY_HELD_IN_DRAFT
 *
 * The practice progression's review round (contracts §20.11; lane R4's half):
 *   - Gemini's picks are decided: a pick that isn't code's default for its
 *     stage (pickIsDefaultOf over the plan's family's candidates), still
 *     PENDING, blocks accept on every plan (DECIDE_PRACTICE_PICKS on a plan
 *     whose session picks need no confirm), "Next item to decide" pointing at
 *     it. One decision for the plan: confirmSessionPicksCore KEEP (CHECKED)
 *     or DEFAULT (removed, the re-fit keeps code's default); per row, "I
 *     checked this" keeps a pick and Remove gives the default back.
 *   - Nothing is sent that asks nothing or an earlier version: the claim
 *     refuses a v4 schema with no property (NOTHING_TO_ARRANGE: no run row,
 *     no cap; R3's schemaAsksNothing), and runDraftCore drafts only a pack of
 *     today's ROADMAP_PROMPT_VERSION (an earlier pack, or one asking nothing,
 *     fails without the call, the starter in its place). The pick enums are
 *     asked for the dated ladder's own stage keys (pickStagesOf).
 *   - The practice family (Intake.practiceFamily) is the user's answer:
 *     validateIntake reads it, intakeOf reads it from Roadmap.coverage
 *     (practiceFamilyOfCoverage), intakeData and the activity answer write it
 *     through coverageJsonOf, an intake save without one keeps the stored
 *     one, and a changed family re-syncs the draft (draftGateOps).
 *
 *   Picks     DECIDE_PRACTICE_PICKS · PRACTICE_PICKS_CHOICE · NOTHING_TO_ARRANGE
 *
 * The lead's rulings after the progression's review (R4's half):
 *   - Ruling 6, a plan the user writes stays theirs: when a MANUAL run wrote
 *     the rows ("Write it myself", an "Edit by hand" re-plan; manualPlanOf,
 *     PlanContext.manual), every re-fit, re-date and re-sync passes R2's
 *     PlaceOpts.manual and fills nothing (the gate still holds); a re-date
 *     lands on the stage skeleton. "Add the app's practice"
 *     (addAppPracticeCore) adds one practice a tap to one stage, the next the
 *     progression places there (R2's addStagePracticesOf). "Write it myself"
 *     on a Field depth plan names its stages over R (the skeleton needs the
 *     Domains' names).
 *   - Ruling 7: the views' header carries the practice family in force
 *     (RoadmapHeaderView.practiceFamily); runDraftCore's validation reads the
 *     dated plan's progression (KeysOnlyContext.progression, R2's
 *     slotProgressionOf); "Keep my order" (keepMyOrderCore) puts Gemini's
 *     reorder of the outline back to the user's; a pending Gemini pick on a
 *     Field plan is kept with "I checked this" (decideItemCore CHECKED) or
 *     the plan-wide confirmSessionPicksCore KEEP or DEFAULT.
 *   - A practice that takes turns with another (contracts §20.12) is code's
 *     in its pair's words too (codeLabelOk over practiceLabelsOf).
 *
 *   Rulings  addAppPracticeCore · APP_PRACTICE_IN_PLACE · keepMyOrderCore · keptOrderOf · ORDER_ALREADY_YOURS · RoadmapHeaderView
 *
 * Revision 5, lane 3: up to 3 goals on the server (contracts §23; GOALS_MAX is still 1, so a one-goal user reads
 * today's answers, byte for byte):
 *   - Seats (§23.1): DRAFT and ACTIVE hold a seat, PAUSED, DONE and ARCHIVED free it. Every insert or reopen sets the
 *     slot (intake create in the lowest free seat, the replace path in the legacy row's, undo-discard and resume in
 *     their own when free) under SLOT_FREE (a NULL slot counted: ruling 24), KEY_FREE (saveIntakeCore's SaveTarget:
 *     the same createKey returns the same id) and DOMAINS_FREE, behind the same per-user advisory lock. No free seat
 *     refuses with ANOTHER_ACTIVE while GOALS_MAX is 1 (noSeatLine), GOALS_FULL at 3. acceptCore refuses nothing for
 *     another goal: a draft holds its seat.
 *   - PAUSED (§23.4): pauseRoadmapCore (ACTIVE only; the live milestone closes as dropped, its practices by the
 *     aftercare answer), resumeRoadmapCore (a seat, the hours' room, the DOMAINS_FREE tripwire, the RESUMED rebase,
 *     and the re-date through the re-plan path), setGoalLabelCore (LABEL_CLASH), archive from PAUSED (ruling 56). A
 *     paused goal's page and card read ACTIVE with `paused` set (ruling 66); its seat is never shown (ruling 55).
 *   - One person's week (§23.3): this goal's shares (roadmap-goals sharesOf) ride RealismInput.share and fieldShare
 *     (left out at 1); the accept sheet's DraftView.otherGoals re-runs every other ACTIVE goal's verdict; Start's
 *     duplicate check reads every goal's carried practices; the MID limit line names the goals that used the slots.
 *   - Constraint safety across goals (§23.6): the store records the user's goals as read (goalReadingStore), and
 *     planGateOf reads every other DRAFT, ACTIVE and PAUSED goal's texts (CueTexts.others) and AVOIDs
 *     (ConstraintsState.others; closed goals' only once GOALS_MAX > 1, ruling 57); an AVOID given on one goal pauses
 *     another goal's started practice of that kind (crossGoalAvoidsOf).
 *   - Loaders per goal (§23.5): loadRoadmapView and loadIntakeView take a roadmapId (pickRoadmap: the user's own, else
 *     the lowest seat), loadAimCards gives one card per open goal in seat order.
 *
 *   Goals    pauseRoadmapCore · resumeRoadmapCore · setGoalLabelCore · loadAimCards · noSeatLine · PAUSE_ONLY_ACTIVE ·
 *            RESUME_ONLY_PAUSED · LABEL_CLASH · DOMAIN_TAKEN · NO_TARGET · DISCARD_STAYS
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
import { archiveCore, createTemplateCore, ledgerOf, pauseForSafetyCore, readDayTaskEvents, readDayTotals, type CaptureLink } from "./tasks";
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
  type PracticeFamily,
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
  isPracticeFamily,
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
  outlineOrderOf,
  outlineStagesOf,
  yoursText,
  type AimDepth,
  type AimStep,
  type AimStepMilestone,
  type ActivityCardAnswer,
  type ActivityConfirm,
  type ActivityGate,
  type CalibratingInput,
  type ConstraintExclusion,
  type ConstraintsState,
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
  ACTIVITY_CARD_NAME,
  activityConfirmOf,
  activityConfirmViewOf,
  allowedKindsFor,
  answerActivityCard,
  catalogKindsFor,
  catalogEntryOf,
  catalogLabelOf,
  catalogOriginOf,
  catalogTrackOf,
  constraintsStateOfIntake,
  coverageJsonOf,
  cueGatedKindsOf,
  cueSafeKindsOf,
  isCatalogKey,
  isPlaceableKind,
  isSessionPickKind,
  practiceFamilyOf,
  practiceFamilyOfCoverage,
  practiceLabelsOf,
  practiceRoleOf,
  progressionCandidatesOf,
  withActivityPointer,
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
  stepCookieValueOf,
} from "./roadmap-invite";
import {
  GOALS_FULL,
  GOALS_MAX,
  GOAL_PAUSE_REASON_MAX,
  GOAL_SLOTS,
  HOLD_STATUSES,
  SEAT_STATUSES,
  cueTextsOf,
  isGoalSlot,
  topicSwitchesOf,
  type DateVerdict,
  type GoalAvoids,
  type GoalCueTexts,
  type GoalPillView,
  type GoalSeatView,
  type GoalSwitcherView,
  type GoalSlot,
  type GoalVerdictChange,
  type IntakeDraftView,
  type PauseChoices,
  type ResumeChoices,
  type SaveTarget,
} from "./roadmap-types";
import { kindOnEveryTrack } from "./roadmap-catalog";
import { cleanGoalLabelOf, goalLabelOf, hoursOverLineOf, hoursRoomOf, labelClashOf, seatForNewOf, seatForReopenOf, sharesOf, type GoalRow, type ShareGoal } from "./roadmap-goals";
// ── Revision 5, lane 10 (contracts §22.14, §22.15): the model phases; namespaced so no name meets another lane's import ──
import * as ratingLib from "./roadmap-rating";
import * as topicsLib from "./roadmap-topics";
import * as groundingLib from "./roadmap-grounding";
import * as lexiconLib from "./roadmap-lexicon";
import * as synonymsLib from "./synonyms";
import * as t5 from "./roadmap-types";
// ── Revision 5, lane 8 (contracts §22.13, §22.14): the TOPICS server path without Gemini (ratingLib and topicsLib above) ──
import {
  ACCEPT_REFUSAL_LINE,
  BASE_LEVEL,
  BREADTH_KEYS,
  BREADTH_TABLE,
  CROSS_GOAL_PARENT_PREFIX,
  DEPTH_TAIL,
  DIFF_KEYS,
  EDGE_CHILDREN_MAX,
  EDGE_DECISIONS,
  EDGE_MATCHES,
  EDGE_ORIGINS,
  EDGE_PARENTS_MAX,
  GROUNDED_REQUESTS_PER_DAY,
  GROUND_SOURCES_SHOWN,
  LAYERS_BOUNDS,
  LAYERS_MAX,
  LAYERS_MIN,
  OPEN_LEVEL,
  PREREQS_OPEN,
  RATING_ORIGINS,
  ROADMAP_REQUESTS_PER_DAY,
  TOPIC_DECISIONS,
  TOPIC_FLOOR_CARDS,
  TOPIC_GROUNDINGS,
  TOPIC_NAME_TAKEN,
  TOPIC_NEEDS_PARENT,
  TOPIC_NOTES,
  TOPIC_ORIGINS,
  TOPIC_PLACED_BY,
  TOPIC_ROLES,
  TOPIC_SCOPES,
  geminiNamedOf,
  isTopicDepth,
  layersOfDiff,
  milestoneCapOf,
  namedPartsOf,
  type AcceptRefusalCode,
  type AimClause,
  type DraftPlan,
  type EdgeDraft,
  type LayerSetChange,
  type ParentPick,
  type PlanKind,
  type PreviousPlan,
  type RatingRecord,
  type RatingView,
  type SplitClause,
  type TopicClass,
  type TopicDepth,
  type TopicDraft,
  type TopicEdit,
  type TopicLayerView,
  type TopicMap,
  type TopicMapView,
  type TopicNote,
  type TopicRowView,
  type TopicSource,
} from "./roadmap-types";
import { topicLayerTitleOf } from "./roadmap-catalog";

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
  // ── Revision 5 (migration 20261110000000_life_roadmap_goals; contracts §23.1). Optional: a row read before it reads as absent. ──
  /** The goal's seat, 1..GOAL_SLOTS_MAX: set on every DRAFT and ACTIVE row lane 3 writes; a PAUSED row keeps its last value outside the index (ruling 46). */
  slot?: number | null;
  /** The user's own name for the goal (cleanGoalLabelOf; ≤ GOAL_LABEL_MAX); null: the Area name. */
  label?: string | null;
  pausedAt?: Date | null;
  /** The user's reason for a pause (≤ GOAL_PAUSE_REASON_MAX). */
  pauseReason?: string | null;
  /** The client nonce that created the row ([A-Za-z0-9_-]{8,64}): the same key returns the same id. */
  createKey?: string | null;
  // ── Revision 5, lane 8 (migration B; contracts §22.1 rulings 14, 49): the live version's kind, its rating, the aim's clauses tracked in another goal, and a re-plan draft of another kind. ──
  /** LEVELS | TOPICS (absent on a row read before migration B: LEVELS). */
  planKind?: string | null;
  /** RatingRecord (TOPICS). */
  rating?: unknown;
  /** SplitClause[]. */
  splitClauses?: unknown;
  /** DraftPlan (ruling 49). */
  draftPlan?: unknown;
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
  // ── Revision 5 (migration B; contracts §22.15): a topic chain step's phase (null on LEVELS), the requests it sent, GROUND's record. Optional: a row read before migration B reads as absent. ──
  phase?: string | null;
  requests?: number | null;
  grounding?: unknown;
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
  /** Revision 5, lane 8 (migration B): a TOPICS layer milestone's layer (1..6) and its chainRole (LAYER | DEPTH); null on LEVELS. */
  layer?: number | null;
  chainRole?: string | null;
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
  /** Revision 5, lane 8 (migration B): the topic a TOPICS measure is about (display only); null on LEVELS. */
  topicLineageId?: string | null;
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
  /** Revision 5, lane 8 (migration B; ruling 49): the PreviousPlan an accept of another kind replaced; null on every other. */
  previousPlan?: unknown;
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
  /** Revision 5, lane 8: every version's topic map rows (RoadmapTopic, RoadmapTopicEdge); absent or empty on a LEVELS plan. */
  topics?: TopicRowRec[];
  edges?: EdgeRowRec[];
}

// ═══ The store: the roadmap tables, and one guarded write path ══════════════

export type StoreTable =
  | "roadmap"
  | "roadmapRun"
  | "roadmapMilestone"
  | "roadmapItem"
  | "roadmapMeasure"
  | "roadmapAcceptance"
  // Revision 5, lane 8 (migration B): a TOPICS map's rows.
  | "roadmapTopic"
  | "roadmapTopicEdge";

export type WhereValue = string | number | boolean | null | { in: readonly (string | number)[] };
export type Where = Readonly<Record<string, WhereValue>>;

/**
 * The conditions a write re-checks after the lock (SELECT 1 / 0 unless true).
 * Each is what the core read before deciding; a failure is 'stale'.
 */
export type StoreGuard =
  /** No DRAFT or ACTIVE roadmap of the user other than exceptId. (Kept for reads; no path writes under it after revision 5's lane 3: SLOT_FREE.) */
  | { g: "NO_OTHER_OPEN"; exceptId: string | null }
  /** No ACTIVE roadmap of the user other than exceptId. (Kept for reads; no path writes under it after revision 5's lane 3.) */
  | { g: "NO_OTHER_ACTIVE"; exceptId: string | null }
  /**
   * Revision 5 (contracts §23.1): no DRAFT or ACTIVE row holds the slot (other than exceptId), and the user's DRAFT and
   * ACTIVE rows other than exceptId number fewer than GOALS_MAX, a NULL slot counted (ruling 24: a row old code saved
   * between migration A and lane 3 has no seat the unique index sees).
   */
  | { g: "SLOT_FREE"; slot: GoalSlot; exceptId: string | null }
  /** Revision 5: no row of the user carries this createKey (a double tap's second insert re-reads and returns the first id). */
  | { g: "KEY_FREE"; createKey: string }
  /** Revision 5 (§23.5): no DRAFT, ACTIVE or PAUSED goal other than exceptRoadmapId holds any of these Domains (Roadmap.domainIds). */
  | { g: "DOMAINS_FREE"; domainIds: readonly string[]; exceptRoadmapId: string | null }
  /**
   * The user's roadmap is in one of these statuses (and at this version, with this archive reason, and with no depth: a
   * legacy plan; and, with `updatedAt`, not written since it was read: the stored answers and the typed figures share
   * Roadmap.coverage, so its two writers re-read rather than overwrite each other, contracts §19.3).
   */
  | { g: "ROADMAP_IS"; id: string; statuses: readonly RoadmapStatus[]; version?: number; archiveReason?: string; depthNull?: boolean; updatedAt?: Date }
  /** Revision 4: no milestone of the roadmap is STARTING or STARTED ("Start again at a depth" replaces only a plan nothing started on). */
  | { g: "NO_STARTED_MILESTONE"; roadmapId: string }
  /** No run of the roadmap is RUNNING and started after `since`. */
  | { g: "NO_RECENT_RUNNING"; roadmapId: string; since: Date }
  /**
   * Today's GEMINI runs of the user (any status but REUSED) number fewer than max. Revision 5 (lane 10, ruling 17):
   * chain heads only — a run with no phase (LEVELS) or phase RATE (roadmap-types countsTowardDraftCap).
   */
  | { g: "GEMINI_RUNS_BELOW"; day: DayKey; max: number }
  /**
   * Revision 5, lane 10 (§22.14, §22.15): today's RoadmapRun.requests of the user plus `need` stay within `max`
   * (ROADMAP_REQUESTS_PER_DAY), and the GROUND rows' alone plus `needGrounded` within `groundedMax`
   * (GROUNDED_REQUESTS_PER_DAY; ruling 18). Every topic step's claim runs it with that step's own need.
   */
  | { g: "REQUESTS_BELOW"; day: DayKey; max: number; groundedMax: number; need: number; needGrounded: number }
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
  /**
   * Revision 5, lane 8 (§22.14, F-R5-10): a TOPICS layer milestone may start: milestone k is reached (or held), or
   * every parent of every chosen layer-(k + 1) topic is at level 6 over its floor (TOPIC_FLOOR_CARDS cards at
   * OPEN_LEVEL), HELD_AT_START or skipped, and every cross-goal parent Domain at level 6 over its floor.
   */
  | { g: "PREREQS_MET"; roadmapId: string; milestoneId: string }
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
  | { op: "keepAftercare"; milestoneId: string; templateId: string }
  /**
   * Revision 5, lane 8 (§22.14; decision 63): the Gemini mark on a Domain a TOPICS accept created from a kept Gemini
   * name: nameOrigin 'GEMINI' and originName = its name, only while the row still bears that name and no origin.
   */
  | { op: "domainOrigin"; domainId: string; name: string };

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
  /** Revision 5, lane 8 (migration B; ruling 67): the Gemini mark's inputs (roadmap-types geminiNamedOf); absent: yours. */
  nameOrigin?: string | null;
  originName?: string | null;
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
  /** Revision 5 (§23.3): the same closes with their goal ids, so the limit line names which goals' milestones used the MID slots. Optional: absent, the line names none. */
  midGoalsPaid?(userId: string, today: DayKey): Promise<{ goalId: string; day: DayKey }[]>;
  /** tasks.ts createTemplateCore (idempotent by captureKey). */
  createTemplate(userId: string, parsed: ParsedCapture, opts: CreateTemplateOpts): Promise<{ id: string }>;
  /** taxonomy createDomain. */
  createDomain(fieldId: string, name: string): Promise<CreateDomainResult>;
  /**
   * tasks.ts archiveCore (the aftercare and the archive's goal). `deferredTo`: a must past its typo grace once Duty is
   * live leaves Today only on that day (archiveCore's pending archive); absent or null: archived at once.
   */
  archiveTemplate(userId: string, templateId: string, now: Date): Promise<{ ok: true; deferredTo?: DayKey | null } | { ok: false; error: string }>;
  /**
   * tasks.ts pauseForSafetyCore (the lead's ruling 2, contracts §19): a started task of a kind the user said to avoid
   * leaves Today at once, a must included (safety overrides the akrasia horizon; the must's earlier days keep their rule
   * and debts). Never deferred, never a delete; the Today task's own unarchive is the Undo.
   */
  pauseTemplate(userId: string, templateId: string, now: Date): Promise<{ ok: true } | { ok: false; error: string }>;
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
  /** One stage's progression within its plan (contracts §20); R4 re-syncs through fitPlan (PlaceOpts.intake) instead. */
  syncStagePractices: typeof realism.syncStagePractices;
  /** Confirm to unlock (contracts §19): a track draft's practice progression after the user's answer (contracts §20). */
  syncTrackStarter: typeof realism.syncTrackStarter;
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
  /**
   * Revision 5, lane 10 (§22.2, ruling 16): the topic switches as a check sets them, read through topicSwitchesOf (so
   * the composition rules still hold); a switch left out reads its constant. Production never passes it: every
   * TOPIC_* constant is false, so every model phase refuses before it reads anything.
   */
  topicSwitches?: Partial<t5.TopicSwitches>;
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
// ── Revision 5: up to 3 goals (contracts §23) ──
/** Pause works from ACTIVE only (§23.4); a DRAFT is discarded, with undo. */
export const PAUSE_ONLY_ACTIVE = "Only an active goal can be paused.";
/** Resume works from PAUSED only (§23.4). */
export const RESUME_ONLY_PAUSED = "Only a paused goal can be resumed.";
/** Two DRAFT, ACTIVE or PAUSED goals would show one name (ruling 26): the intake (and the label) ask for one of its own. */
export const LABEL_CLASH = "Two goals share this name: give this one its own.";
/** A Domain another DRAFT, ACTIVE or PAUSED goal holds (§23.5); a PAUSED goal's seat is never named (ruling 55: slot null). */
export function DOMAIN_TAKEN(slot: GoalSlot | null): string {
  return slot == null ? "That Domain is in a paused goal." : `That Domain is in goal ${slot}.`;
}
/** A target the action can't read: no roadmap id, or a createKey outside [A-Za-z0-9_-]{8,64} (§22.14's cleaned arguments). */
export const NO_TARGET = "That goal is no longer here. Refresh and try again.";
/**
 * No free seat (§23.1): ANOTHER_ACTIVE while GOALS_MAX is 1, so today's one-goal user reads today's words (ruling 23);
 * GOALS_FULL once lane 4 lifts GOALS_MAX to 3.
 */
export function noSeatLine(): string {
  return GOALS_MAX === 1 ? ANOTHER_ACTIVE : GOALS_FULL;
}
/**
 * The claim's refusal when the run's v4 schema would ask Gemini nothing (no Domain to suggest, no outline to order and
 * no practice to pick: practices off, no outline, every Domain chosen): the model is never called, no run row is
 * written and no draft of the day's cap is used (keysOnlySchemaOf leaves out every property then).
 */
export const NOTHING_TO_ARRANGE = "There's nothing here for Gemini to arrange: build from your numbers.";
/** The one cap copy: roadmap-model's DRAFT_CAP_LINE (the claim refuses with it; RunView.capped shows it). */
export const DRAFT_CAPPED = model.DRAFT_CAP_LINE;
export const GATE_OFF = "Starting milestones arrives with the next update.";
export const NOTHING_MEASURES = "Nothing here would measure progress — keep a practice on, or add a Domain.";
/**
 * Confirm to unlock (contracts §19): a pick of a type that waits on the user's answer to the activity card (no
 * answer yet under their current words). It names the card itself, so pointedAt adds no second pointer.
 */
export const ACTIVITY_WAITING_PICK = `This type waits on your answer: say what to avoid in “${ACTIVITY_CARD_NAME}”, then add it.`;
/** A pick of a type the user said to avoid. */
export const ACTIVITY_AVOIDED_PICK = `You said to avoid this type: untick it in “${ACTIVITY_CARD_NAME}” to add it.`;
/** Start with nothing to measure because every practice waits on the user's answer. */
export const ACTIVITY_WAITING_START = `This milestone's practices wait on your answer: say what to avoid in “${ACTIVITY_CARD_NAME}” first.`;
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
  // Revision 5, lane 8.
  roadmapTopic: ["heldDay", "skippedDay"],
  roadmapTopicEdge: [],
};

const JSON_FIELDS: Readonly<Record<StoreTable, readonly string[]>> = {
  // Revision 5, lane 8: rating, splitClauses and draftPlan (migration B).
  roadmap: ["syllabus", "coverage", "rating", "splitClauses", "draftPlan"],
  roadmapRun: ["pack", "samples", "report", "usage"],
  roadmapMilestone: ["feasibility"],
  roadmapItem: [],
  roadmapMeasure: ["scope"],
  roadmapAcceptance: ["feasibility", "endState", "previousPlan"],
  // Revision 5, lane 8.
  roadmapTopic: ["sources", "layerVotes"],
  roadmapTopicEdge: [],
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
    // Revision 5, lane 8.
    case "roadmapTopic":
      return prisma.roadmapTopic as unknown as LooseDelegate;
    case "roadmapTopicEdge":
      return prisma.roadmapTopicEdge as unknown as LooseDelegate;
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
    case "SLOT_FREE":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "Roadmap" WHERE "userId" = ${userId} AND "status" IN (${Prisma.join([...SEAT_STATUSES])})
          AND "slot" = ${g.slot}::int AND "id" IS DISTINCT FROM ${g.exceptId}::text)
        AND (SELECT COUNT(*) FROM "Roadmap" WHERE "userId" = ${userId} AND "status" IN (${Prisma.join([...SEAT_STATUSES])})
          AND "id" IS DISTINCT FROM ${g.exceptId}::text) < ${GOALS_MAX}::int`;
    case "KEY_FREE":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "Roadmap" WHERE "userId" = ${userId} AND "createKey" = ${g.createKey})`;
    case "DOMAINS_FREE":
      if (g.domainIds.length === 0) return Prisma.sql`TRUE`;
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "Roadmap" WHERE "userId" = ${userId} AND "status" IN (${Prisma.join([...HOLD_STATUSES])})
        AND "id" IS DISTINCT FROM ${g.exceptRoadmapId}::text AND "domainIds" && ${[...g.domainIds]}::text[])
        AND NOT EXISTS (SELECT 1 FROM "RoadmapTopic" t JOIN "Roadmap" r ON r."id" = t."roadmapId"
          WHERE r."userId" = ${userId} AND r."status" IN (${Prisma.join([...HOLD_STATUSES])}) AND r."id" IS DISTINCT FROM ${g.exceptRoadmapId}::text
          AND t."version" IN (r."version", r."version" + 1) AND (t."bound" OR t."chosen") AND t."decision" NOT IN ('REMOVED', 'MERGED')
          AND t."domainId" = ANY(${[...g.domainIds]}::text[]))`;
    // Revision 5, lane 8 (ruling 61): a goal's topic map holds the Domains its bound or chosen topics use (the second clause).
    case "ROADMAP_IS": {
      const version = g.version != null ? Prisma.sql`AND "version" = ${g.version}::int` : Prisma.empty;
      const reason = g.archiveReason != null ? Prisma.sql`AND "archiveReason" = ${g.archiveReason}` : Prisma.empty;
      const legacy = g.depthNull ? Prisma.sql`AND "depth" IS NULL` : Prisma.empty;
      const unwritten = g.updatedAt != null ? Prisma.sql`AND "updatedAt" = ${g.updatedAt}` : Prisma.empty;
      return Prisma.sql`EXISTS (SELECT 1 FROM "Roadmap" WHERE "id" = ${g.id} AND "userId" = ${userId}
        AND "status" IN (${Prisma.join([...g.statuses])}) ${version} ${reason} ${legacy} ${unwritten})`;
    }
    case "NO_STARTED_MILESTONE":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" WHERE "roadmapId" = ${g.roadmapId}
        AND "status" IN (${Prisma.join(["STARTING", "STARTED"])}))`;
    case "NO_RECENT_RUNNING":
      return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RoadmapRun" WHERE "roadmapId" = ${g.roadmapId} AND "status" = ${"RUNNING"}
        AND "startedAt" > ${g.since})`;
    case "GEMINI_RUNS_BELOW":
      // Revision 5, lane 10 (ruling 17): chain heads only, as countsTowardDraftCap reads them (a LEVELS run has no phase).
      return Prisma.sql`(SELECT COUNT(*) FROM "RoadmapRun" WHERE "userId" = ${userId} AND "day" = ${g.day}::date
        AND "kind" = ${"GEMINI"} AND "status" <> ${"REUSED"} AND ("phase" IS NULL OR "phase" = ${"RATE"})) < ${g.max}::int`;
    // ── Revision 5, lane 10 (§22.15): the request caps, every phase and every LEVELS run counted; GROUND rows alone for the grounded cap ──
    case "REQUESTS_BELOW":
      return Prisma.sql`(SELECT COALESCE(SUM("requests"), 0) FROM "RoadmapRun" WHERE "userId" = ${userId} AND "day" = ${g.day}::date) + ${g.need}::int <= ${g.max}::int
        AND (SELECT COALESCE(SUM("requests"), 0) FROM "RoadmapRun" WHERE "userId" = ${userId} AND "day" = ${g.day}::date AND "phase" = ${"GROUND"}) + ${g.needGrounded}::int <= ${g.groundedMax}::int`;
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
    // Revision 5, lane 8 (F-R5-10): the layer before reached (or held), or every parent of every chosen topic of this
    // layer at OPEN_LEVEL over its floor (counted as cardsAtOpenOf counts: live cards at level 6 or above), held or skipped,
    // and every cross-goal parent Domain at OPEN_LEVEL over its floor. A parent is a counting link (yours, cross-goal, or
    // Gemini's drawn one, none removed), else every chosen topic of the layer before.
    case "PREREQS_MET":
      return Prisma.sql`EXISTS (SELECT 1 FROM "RoadmapMilestone" m JOIN "Roadmap" r ON r."id" = m."roadmapId"
          WHERE m."id" = ${g.milestoneId} AND m."roadmapId" = ${g.roadmapId} AND r."userId" = ${userId})
        AND (
          EXISTS (SELECT 1 FROM "RoadmapMilestone" m JOIN "RoadmapMilestone" p ON p."roadmapId" = m."roadmapId"
            WHERE m."id" = ${g.milestoneId} AND p."chainRole" = 'LAYER' AND p."layer" = m."layer" - 1
              AND p."reachedDay" IS NOT NULL AND p."status" <> 'DISCARDED')
          OR (
            NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" m
              JOIN "RoadmapTopic" c ON c."roadmapId" = m."roadmapId" AND c."version" = m."version" AND c."layer" = m."layer"
                AND c."chosen" AND c."decision" NOT IN ('REMOVED', 'MERGED')
              JOIN "RoadmapTopic" p ON p."roadmapId" = c."roadmapId" AND p."version" = c."version" AND p."layer" = c."layer" - 1
                AND p."chosen" AND p."decision" NOT IN ('REMOVED', 'MERGED')
              WHERE m."id" = ${g.milestoneId}
                AND (EXISTS (SELECT 1 FROM "RoadmapTopicEdge" x WHERE x."roadmapId" = c."roadmapId" AND x."version" = c."version"
                      AND x."childLineageId" = c."lineageId" AND x."parentLineageId" = p."lineageId"
                      AND x."decision" <> 'REMOVED' AND (x."origin" <> 'GEMINI' OR x."drawn"))
                  OR NOT EXISTS (SELECT 1 FROM "RoadmapTopicEdge" x WHERE x."roadmapId" = c."roadmapId" AND x."version" = c."version"
                      AND x."childLineageId" = c."lineageId" AND x."decision" <> 'REMOVED' AND (x."origin" <> 'GEMINI' OR x."drawn")))
                AND p."skippedDay" IS NULL AND p."heldDay" IS NULL
                AND (p."domainId" IS NULL OR (SELECT COUNT(*) FROM "Idea" i WHERE i."domainId" = p."domainId" AND NOT i."isArchived"
                  AND i."level" >= ${OPEN_LEVEL}::int) < ${TOPIC_FLOOR_CARDS}::int))
            AND NOT EXISTS (SELECT 1 FROM "RoadmapMilestone" m
              JOIN "RoadmapTopic" c ON c."roadmapId" = m."roadmapId" AND c."version" = m."version" AND c."layer" = m."layer"
                AND c."chosen" AND c."decision" NOT IN ('REMOVED', 'MERGED')
              JOIN "RoadmapTopicEdge" x ON x."roadmapId" = c."roadmapId" AND x."version" = c."version" AND x."childLineageId" = c."lineageId"
                AND x."origin" = 'CROSS_GOAL' AND x."decision" <> 'REMOVED'
              WHERE m."id" = ${g.milestoneId}
                AND (x."parentDomainId" IS NULL OR (SELECT COUNT(*) FROM "Idea" i WHERE i."domainId" = x."parentDomainId" AND NOT i."isArchived"
                  AND i."level" >= ${OPEN_LEVEL}::int) < ${TOPIC_FLOOR_CARDS}::int))
          )
        )`;
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
    // Revision 5, lane 8 (decision 63): the Gemini mark on a Domain a TOPICS accept created (a renamed or marked row is left alone).
    case "domainOrigin":
      return [
        prisma.$executeRaw`UPDATE "Domain" SET "nameOrigin" = ${"GEMINI"}, "originName" = ${op.name}, "updatedAt" = NOW()
          WHERE "id" = ${op.domainId} AND "name" = ${op.name} AND "nameOrigin" IS NULL`,
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
  // Revision 5, lane 10 (§22.15): the chain-head draft count and the request caps read these on light rows.
  phase: true,
  requests: true,
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
        // Revision 5, lane 8: every version's topic map rows (none on a LEVELS plan).
        topics: { orderBy: [{ version: "asc" }, { layer: "asc" }, { createdAt: "asc" }] },
        topicEdges: { orderBy: [{ version: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!r) return null;
    const { runs, milestones, acceptances, topics, topicEdges, ...roadmap } = r;
    return {
      topics: topics.map((t) => fromDbRow<TopicRowRec>("roadmapTopic", t as unknown as Record<string, unknown>)),
      edges: topicEdges.map((x) => fromDbRow<EdgeRowRec>("roadmapTopicEdge", x as unknown as Record<string, unknown>)),
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
      /** Revision 5, lane 8 (migration B): the Gemini mark's inputs. */
      nameOrigin?: string | null;
      originName?: string | null;
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
      // Revision 5, lane 8 (ruling 67): carried only when the row marks it (every Domain before migration B reads as yours).
      ...(typeof d.nameOrigin === "string" ? { nameOrigin: d.nameOrigin, originName: typeof d.originName === "string" ? d.originName : null } : {}),
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
  async midGoalsPaid(userId, today) {
    const rule = GOAL_RULES.MID;
    const rows = await prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT", dedupeKey: { startsWith: GOAL_MINT_PREFIX }, qty: { gt: 0 }, day: { gt: dateColumn(addDays(today, -rule.windowDays)) } },
      select: { day: true, detail: true, dedupeKey: true },
    });
    return rows
      .filter((r) => r.dedupeKey && parseMintDetail(r.detail).reason === rule.reason)
      .map((r) => ({ goalId: (r.dedupeKey as string).slice(GOAL_MINT_PREFIX.length), day: keyOfDateColumn(r.day) }));
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
    return res.ok ? { ok: true, deferredTo: res.value.effect === "deferred" ? res.value.effectiveDay : null } : { ok: false, error: res.error };
  },
  async pauseTemplate(userId, templateId, now) {
    const res = await pauseForSafetyCore(userId, templateId, now);
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
  syncTrackStarter: realism.syncTrackStarter,
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
  /**
   * Revision 5 (contracts §23.3, §23.6): the user's roadmap rows as last read through `store` (goalReadingStore), by
   * user id. The other goals' texts and AVOIDs (planGateOf), shares (planContext) and Domains read them, so one core
   * sees one person's goals as it read them. Absent for a user: nothing read (one goal; the gate reads today's inputs).
   */
  goals: Map<string, readonly RoadmapRec[]>;
}

/**
 * The store with the user's goals recorded as read (revision 5): every listRoadmaps answer is kept, and a bundle read
 * lists the user's rows beside it (one more read, in parallel) unless a list was answered since the last bundle, so a
 * core that reads one roadmap still gates it with the other goals' words and AVOIDs, fresh on every attempt.
 */
function goalReadingStore(inner: RoadmapStore, goals: Map<string, readonly RoadmapRec[]>): RoadmapStore {
  let listedSinceBundle = false;
  return {
    ...inner,
    listRoadmaps: async (userId) => {
      const rows = await inner.listRoadmaps(userId);
      goals.set(userId, rows);
      listedSinceBundle = true;
      return rows;
    },
    bundle: async (userId, roadmapId) => {
      const listing = listedSinceBundle ? null : inner.listRoadmaps(userId);
      listedSinceBundle = false;
      const [b, rows] = await Promise.all([inner.bundle(userId, roadmapId), listing]);
      const seen = rows ?? goals.get(userId) ?? null;
      if (seen) goals.set(userId, b ? [...seen.filter((r) => r.id !== b.roadmap.id), b.roadmap] : seen);
      return b;
    },
  };
}

function envOf(deps: RoadmapDeps): Env {
  const goals = new Map<string, readonly RoadmapRec[]>();
  return {
    store: goalReadingStore(deps.store ?? prismaRoadmapStore, goals),
    io: { ...prismaRoadmapIo, ...(deps.io ?? {}) },
    lanes: { ...LANES, ...(deps.lanes ?? {}) },
    makeId: deps.makeId ?? (() => globalThis.crypto.randomUUID()),
    defer: deps.defer ?? deferNow,
    goalsLive: deps.goalsLive ?? ROADMAP_GOALS_LIVE,
    env: deps.env,
    goals,
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
    // Revision 5, lane 8: a TOPICS measure's topic (absent on LEVELS, so its spec reads as before).
    ...(r.topicLineageId != null ? { topicLineageId: r.topicLineageId } : {}),
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
    // Revision 5, lane 8: a TOPICS milestone's place in the chain (absent on LEVELS, so its draft reads as before).
    ...(m.layer != null ? { layer: m.layer } : {}),
    ...(m.chainRole === "LAYER" || m.chainRole === "DEPTH" ? { chainRole: m.chainRole } : {}),
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
    // Revision 5, lane 8: written only on a TOPICS measure (a LEVELS row writes the columns it always did).
    ...(m.topicLineageId != null ? { topicLineageId: m.topicLineageId } : {}),
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
    // Revision 5, lane 8: written only on a TOPICS milestone.
    ...(d.layer != null ? { layer: d.layer } : {}),
    ...(d.chainRole != null ? { chainRole: d.chainRole } : {}),
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
  // ── Revision 5, lane 8 (§22.11): a TOPICS write's map and the Domains' origins; absent: the tripwire reads as before. ──
  /** The map's topics: a GEMINI-origin name you haven't kept (KEPT or EDITED) never reaches a title or a label. */
  topics?: readonly TopicDraft[];
  /** The Domain rows with their Gemini mark's inputs (Domain.nameOrigin, Domain.originName). */
  domains?: readonly { id: string; name: string; nameOrigin: string | null; originName: string | null }[];
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
function codeFillCandidates(it: ItemDraft, m: MilestoneDraft, ctx: ModelTextContext, plan: readonly MilestoneDraft[] = []): string[][] {
  const out: string[][] = [];
  const named = (ids: readonly string[]) =>
    ids.map((id) => (Object.prototype.hasOwnProperty.call(ctx.domainNames, id) ? ctx.domainNames[id] : undefined)).filter((n): n is string => typeof n === "string" && n.length > 0);
  if (it.domainId) out.push(named([it.domainId]));
  const required = [...(ctx.required ?? [])];
  const own = m.items.filter((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId).map((i) => i.domainId as string);
  const nameable = nameableDomainsOf(m);
  // Revision 5 (contracts §22.13): a TOPICS row's CARRY item is filled with the layer before's Domains (a depth row: the base topics).
  const carry = topicCarryDomainsOf(m, plan);
  for (const ids of [...(nameable.length === own.length ? [required, own] : [required, own, nameable]), ...carry]) {
    if (ids.length === 0) continue;
    out.push(named(ids));
    out.push(named([...ids].sort()));
    out.push([...named(ids)].sort((a, b) => a.localeCompare(b)));
  }
  return out.filter((x) => x.length > 0);
}

/**
 * The Domain lists a TOPICS row's CARRY part may be filled with (contracts §22.13; realism topicPartNamesOf): on a
 * layer row, each row of the layer before (its Domains in item order); on a depth row, the base topics (every layer
 * row's Domains, in plan order, less the row's own specialisation). [] on a LEVELS row.
 */
function topicCarryDomainsOf(m: MilestoneDraft, plan: readonly MilestoneDraft[]): string[][] {
  if (m.chainRole == null || plan.length === 0) return [];
  const domainsOf = (r: MilestoneDraft): string[] =>
    Array.from(
      new Set(
        [...r.items]
          .sort((a, b) => a.ord - b.ord)
          .filter((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId)
          .map((i) => i.domainId as string)
      )
    );
  const layers = [...plan].filter((r) => r.chainRole === "LAYER").sort((a, b) => a.ord - b.ord);
  if (m.chainRole === "DEPTH") {
    // The chain's rows as the progression reads them (realism's SCHEDULED statuses).
    const chainRows = layers.filter((r) => r.status === "DRAFT" || r.status === "PLANNED" || r.status === "STARTING" || r.status === "STARTED");
    const deep = new Set(domainsOf(m));
    const base: string[] = [];
    for (const r of chainRows) for (const id of domainsOf(r)) if (!deep.has(id) && !base.includes(id)) base.push(id);
    return base.length ? [base] : [];
  }
  if (m.layer == null) return [];
  return layers.filter((r) => r.layer === (m.layer as number) - 1).map(domainsOf).filter((ids) => ids.length > 0);
}

/**
 * A CODE item's words are its catalog render (or rev 3's two code names), for some fill code writes; an EDITED row is the user's.
 * A practice that takes turns with another, week about (contracts §20.12), is code's in its pair's words too (roadmap-catalog
 * practiceLabelsOf: its own render and each turn PRACTICE_TURNS lists for it).
 */
function codeLabelOk(it: ItemDraft, m: MilestoneDraft, ctx: ModelTextContext, plan: readonly MilestoneDraft[] = []): boolean {
  if (it.decision === "EDITED") return true;
  const aim = yoursText("USER", "EDITED", ctx.aim ?? "") ?? undefined;
  const exam = ctx.exam ? (yoursText("USER", "EDITED", ctx.exam) ?? undefined) : undefined;
  const track: CatalogTrack = ctx.track ?? "FIELD";
  const lists = codeFillCandidates(it, m, ctx, plan);
  if (it.catalogKey) {
    const fills = (lists.length ? lists : [[]]).map((names) => ({ track, domains: names.map((n) => domainName({ id: "", name: n })), aim, exam }));
    for (const fill of fills) {
      try {
        if (String(catalogLabelOf(it.catalogKey, fill)) === it.label) return true;
      } catch {
        // That fill doesn't render this type; the next one may.
      }
    }
    // A practice's turn with another (only a Field practice takes one): its pair's words, for some fill code writes.
    if (track !== "FIELD" || it.kind !== "PRACTICE") return false;
    return fills.some((fill) => practiceLabelsOf(it.catalogKey as CatalogKey, fill).some((label) => String(label) === it.label));
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
      if (it.origin === code && !codeLabelOk(it, m, ctx, rows)) throw new ModelTextError(`a ${it.kind.toLowerCase()} that is not the app's wording (${where})`);
    }
  }
  // Revision 5, lane 8 (§22.11): on a TOPICS write, no title or label (but yours) holds a Gemini topic name you haven't kept.
  const topicHit = topicNamesInRowsOf(rows, ctx);
  if (topicHit) throw new ModelTextError(topicHit);
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
  // Revision 5, lane 8 (ruling 50): a TOPICS plan always has its depth set (6 included), so it is never legacy.
  const depth = kindOfRow(b.roadmap) === "TOPICS" ? topicDepthOfRow(b.roadmap) : depthOf(b.roadmap);
  return isLegacyRoadmap({ fieldId: b.roadmap.fieldId, depth }, versionRowsOf(b).map((m) => ({ stage: m.stage ?? null })));
}

/** The draft version alone is legacy (rows with no stage): accept refuses "Draft it again first". */
function legacyDraftOf(b: RoadmapBundle): boolean {
  // Revision 5, lane 8: a TOPICS draft is never legacy (its kind and depth are the draft's own: ruling 49).
  if (draftKindFactsOf(b).planKind === "TOPICS") return draftRowsOf(b).some((m) => m.stage == null);
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
 * Runs R2's naming steps (fitPlan's relabel and its practice progression) with every
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

/**
 * Whether a Gemini pick is code's own default for its stage (contracts §20.5): the first of the stage's candidates on
 * this run (roadmap-catalog progressionCandidatesOf over the plan's track, the exam answer, practices and the gate;
 * a BETWEEN or PART row reads its gate's by level). Such a pick changes nothing, so it never waits on the user.
 */
function pickIsDefaultOf(r: RoadmapRec, gate: Pick<ActivityGate, "blocked">): (d: MilestoneDraft, i: ItemDraft) => boolean {
  const track = catalogTrackOf({ fieldId: r.fieldId, track: isOneOf(ROADMAP_TRACKS, r.track) ? r.track : DEFAULT_FIELD_TRACK });
  // The candidates are the plan's family's on a Field plan (contracts §20.11), as the pick enums offered them.
  const run = { exam: !!r.examLabel?.trim(), practicesAllowed: track !== "FIELD" || r.practicesAllowed, family: track === "FIELD" ? practiceFamilyOf(intakeOf(r)) : null, gate };
  return (d, i) => {
    if (!d.stage || !i.catalogKey) return false;
    try {
      return progressionCandidatesOf(track, { stage: d.stage, level: gateLevelOf(d) }, run)[0] === i.catalogKey;
    } catch {
      return false;
    }
  };
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
  /** Revision 5 (the join): RoadmapDeps.topicSwitches, so a check's switches reach the TOPICS intake gate; production passes none. */
  topicSwitches?: Partial<t5.TopicSwitches>;
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

  // Revision 5, lane 8 (ruling 14; F-R5-7): [Write the topics] saves a TOPICS intake (a Field Area, behind
  // TOPIC_PLANS_LIVE): its depth is a TopicDepth (6 included) in topicDepth, and Intake.depth is null. An explicit
  // LEVELS is carried (a TOPICS draft saved back to LEVELS); absent, nothing changes.
  const planKindIn: PlanKind | null = r.planKind === "TOPICS" ? "TOPICS" : r.planKind === "LEVELS" ? "LEVELS" : null;
  if (r.planKind != null && planKindIn == null) return bad("Pick how to plan: by depth, or as a topic map.");
  let topicDepth: TopicDepth | null = null;
  if (planKindIn === "TOPICS") {
    if (!topicSwitchesOf(ctx.topicSwitches).plans) return bad(TOPIC_PLANS_OFF);
    if (!fieldId) return bad(TOPICS_FIELD_ONLY);
    topicDepth = r.topicDepth == null ? (depth ?? AIM_DEPTHS[DEPTH_DEFAULT]) : isTopicDepth(r.topicDepth) ? r.topicDepth : null;
    if (topicDepth == null) return bad("Pick a depth: Mastered, Fluent, Retained or Familiar.");
    depth = null;
  }

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
      // The practice family (contracts §20.11): the user's answer on a Field Area (an exact family), else none (the prefill reads the aim).
      practiceFamily: fieldId && isPracticeFamily(r.practiceFamily) ? r.practiceFamily : null,
      // Revision 5 (§23.1): the goal's own name, one line of at most GOAL_LABEL_MAX (cleanGoalLabelOf); absent: the stored one stands.
      ...(r.label !== undefined ? { label: cleanGoalLabelOf(r.label) } : {}),
      // Revision 5, lane 8 (ruling 14): the plan's kind, and a TOPICS intake's depth.
      ...(planKindIn === "TOPICS" ? { planKind: "TOPICS" as const, topicDepth } : planKindIn === "LEVELS" ? { planKind: "LEVELS" as const } : {}),
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
  // Revision 5, lane 8 (ruling 14): a TOPICS row's intake carries its depth in topicDepth, with depth null.
  const topicsRow = kindOfRow(r) === "TOPICS";
  return {
    depth: topicsRow ? null : depthOf(r),
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
    // Confirm to unlock (contracts §19.3): the user's per-kind answers, stored in Roadmap.coverage["$activities"].
    activities: activityConfirmOf(r.coverage),
    // The practice family the user answered (contracts §20.11), stored in Roadmap.coverage["$practiceFamily"]; a Field Area only.
    practiceFamily: r.fieldId != null ? practiceFamilyOfCoverage(r.coverage) : null,
    // Revision 5 (§23.1): the goal's own name, when the user gave one.
    ...(r.label ? { label: r.label } : {}),
    // Revision 5, lane 8 (ruling 14): present only on a TOPICS row, so a LEVELS intake reads as before.
    ...(topicsRow ? { planKind: "TOPICS" as const, topicDepth: topicDepthOfRow(r) } : {}),
  };
}

/** The Roadmap row's fields for an intake. Roadmap.coverage goes through roadmap-catalog coverageJsonOf, the one writer of that column: the typed figures and the stored answers (contracts §19.3). */
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
    // Revision 5, lane 8 (ruling 14): a TOPICS intake stores its topicDepth in Roadmap.depth (6 included).
    depth: i.planKind === "TOPICS" ? (i.topicDepth ?? null) : i.fieldId ? (i.depth ?? AIM_DEPTHS[DEPTH_DEFAULT]) : null,
    ...(i.planKind !== undefined ? { planKind: i.planKind } : {}),
    dateMode: i.dateMode ?? "CHOSEN",
    coverage: coverageJsonOf(i.coverage ?? null, i.activities ?? null, i.fieldId ? (i.practiceFamily ?? null) : null),
    suggestAreas: i.suggestAreas === true,
    examDay: i.examLabel ? (i.examDay ?? null) : null,
    // Revision 5 (§23.1): written only when the save carries one (a form that doesn't ask it keeps the stored name).
    ...(i.label !== undefined ? { label: cleanGoalLabelOf(i.label) } : {}),
  };
}

const isOpen = (r: { status: string }) => r.status === "DRAFT" || r.status === "ACTIVE";
const latestFirst = (a: RoadmapRec, b: RoadmapRec) => b.updatedAt.getTime() - a.updatedAt.getTime();

// ═══ Revision 5: goals (contracts §23; GOALS_MAX is 1 until lane 4, so a one-goal user reads today's answers) ═══

/** DRAFT, ACTIVE and PAUSED: the goals that hold their Domains, AVOIDs and cue texts (HOLD_STATUSES). */
const holdsGoal = (r: { status: string }): boolean => HOLD_STATUSES.includes(r.status as RoadmapStatus);

/**
 * The seat a view, a copy field or another goal's card names (ruling 55): a DRAFT or ACTIVE row's slot; null for a
 * PAUSED, DONE or ARCHIVED row, whose stored slot may since be another goal's (ruling 46), and for a row with none.
 */
function shownSlotOf(r: Pick<RoadmapRec, "status" | "slot">): GoalSlot | null {
  return SEAT_STATUSES.includes(r.status as RoadmapStatus) && isGoalSlot(r.slot) ? r.slot : null;
}

/** Seat order (§23.6 item 1): the shown seat ascending, none last, then the roadmap id. */
const bySeatOrder = (a: RoadmapRec, b: RoadmapRec): number => (shownSlotOf(a) ?? 9) - (shownSlotOf(b) ?? 9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The open goals a page or card leads with: the lowest seat first (a row with no seat last), then the latest. One open goal: that one, as today. */
const byOpenSeat = (a: RoadmapRec, b: RoadmapRec): number => (isGoalSlot(a.slot) ? a.slot : 9) - (isGoalSlot(b.slot) ? b.slot : 9) || latestFirst(a, b);

/** A roadmap row as roadmap-goals reads it (the Area's name from the tree when one is given: labels read it). */
function goalRowOf(r: RoadmapRec, tree: readonly TreeField[] | null = null): GoalRow {
  return {
    id: r.id,
    status: r.status as RoadmapStatus,
    slot: r.slot ?? null,
    label: r.label ?? null,
    fieldId: r.fieldId,
    track: isOneOf(ROADMAP_TRACKS, r.track) ? r.track : DEFAULT_FIELD_TRACK,
    areaName: tree ? areaNameOf(r, tree) : "",
    hoursPerWeek: r.hoursPerWeek,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}

const shareGoalOf = (r: Pick<RoadmapRec, "id" | "status" | "hoursPerWeek" | "fieldId">): ShareGoal => ({ roadmapId: r.id, status: r.status as RoadmapStatus, hoursPerWeek: r.hoursPerWeek, fieldId: r.fieldId });

/** The Domains a goal holds (§23.5, ruling 61): Roadmap.domainIds (lane 8 adds its bound and chosen topics' Domains). DOMAINS_FREE reads the same column. */
const goalDomainsOf = (r: Pick<RoadmapRec, "domainIds">): readonly string[] => (Array.isArray(r.domainIds) ? r.domainIds : []);

/**
 * DOMAINS_FREE as read (§23.5): the first of `domainIds` another DRAFT, ACTIVE or PAUSED goal holds, with that goal's
 * shown seat (null for a PAUSED goal: "in a paused goal", ruling 55); null when every one is free.
 */
function takenDomainOf(rows: readonly RoadmapRec[], domainIds: readonly string[], exceptRoadmapId: string | null): { domainId: string; slot: GoalSlot | null } | null {
  if (domainIds.length === 0) return null;
  for (const r of rows.filter(holdsGoal).sort(bySeatOrder)) {
    if (r.id === exceptRoadmapId) continue;
    const held = new Set(goalDomainsOf(r));
    const hit = domainIds.find((d) => held.has(d));
    if (hit) return { domainId: hit, slot: shownSlotOf(r) };
  }
  return null;
}

/** The guard that keeps a goal's Domains its own (§23.5); none for no Domains. */
const domainsFreeOps = (domainIds: readonly string[], exceptRoadmapId: string | null): StoreOp[] =>
  domainIds.length ? [{ op: "guard", guard: { g: "DOMAINS_FREE", domainIds: Array.from(new Set(domainIds)), exceptRoadmapId } }] : [];

/**
 * A goal's name clashes with another DRAFT, ACTIVE or PAUSED goal's (ruling 26): its label (yours, else the Area's
 * name) as roadmap-goals labelClashOf reads it. One goal never clashes.
 */
function labelClashFor(rows: readonly RoadmapRec[], tree: readonly TreeField[], row: RoadmapRec, exceptId: string | null): boolean {
  const others = rows.filter((r) => r.id !== row.id && holdsGoal(r));
  if (others.length === 0) return false;
  return labelClashOf(goalLabelOf(goalRowOf(row, tree)).text, others.map((r) => goalRowOf(r, tree)), exceptId);
}

/** The hours' room (§23.3, ruling 25): the refusal when this goal's hours would take the open goals past HOURS_MAX; null with room. */
function hoursRefusalOf(rows: readonly RoadmapRec[], hours: number, exceptId: string | null): string | null {
  const room = hoursRoomOf(rows.map(shareGoalOf), exceptId);
  return hours > room.left ? hoursOverLineOf(room.taken, room.left) : null;
}

/** A client's createKey ([A-Za-z0-9_-]{8,64}: roadmap-types SaveTarget). */
const CREATE_KEY = /^[A-Za-z0-9_-]{8,64}$/;

/** What a save writes (§23.1): the user's open draft (no target: today's rule), a named draft, or a new goal by its createKey. */
type SaveGoal = { kind: "OPEN" } | { kind: "EDIT"; roadmapId: string } | { kind: "CREATE"; createKey: string };

/** saveIntakeCore's target, cleaned (§22.14): null keeps today's rule; anything malformed is null-answered (NO_TARGET). */
function saveGoalOf(target: SaveTarget | null | undefined): SaveGoal | null {
  if (target == null) return { kind: "OPEN" };
  if (typeof target !== "object" || Array.isArray(target)) return null;
  const t = target as Partial<Record<"roadmapId" | "createKey", unknown>>;
  if (t.roadmapId !== undefined && t.createKey !== undefined) return null;
  if (typeof t.roadmapId === "string") return STEP_REF.test(t.roadmapId) ? { kind: "EDIT", roadmapId: t.roadmapId } : null;
  if (typeof t.createKey === "string") return CREATE_KEY.test(t.createKey) ? { kind: "CREATE", createKey: t.createKey } : null;
  return null;
}

/**
 * One claim-first array transaction under the per-user advisory lock (revision 5, contracts §23.1):
 *   - `target` null keeps today's rule: the user's open DRAFT is edited, else a goal is created;
 *   - {roadmapId} edits that draft (the user's DRAFT only);
 *   - {createKey} creates a goal; the same key returns the same id (a double tap, two devices).
 * A new goal takes the lowest free seat from a fresh read (roadmap-goals seatForNewOf) and runs [lock, SLOT_FREE,
 * KEY_FREE, DOMAINS_FREE, insert]; a stale guard or a unique key re-reads and decides again. With no free seat it
 * refuses: ANOTHER_ACTIVE while GOALS_MAX is 1 (today's words, ruling 23), GOALS_FULL at 3. It also refuses a
 * Domain another goal holds (DOMAIN_TAKEN), hours past HOURS_MAX across the open goals (hoursOverLineOf) and a
 * name another goal shows (LABEL_CLASH). "Start again at a depth" (F-R4-16) archives the legacy ACTIVE row and
 * inserts the DRAFT in its seat, in the same transaction.
 */
export async function saveIntakeCore(
  userId: string,
  intake: Intake,
  now: Date,
  deps: RoadmapDeps = {},
  target: SaveTarget | null = null
): Promise<RoadmapActionResult<{ roadmapId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const goal = saveGoalOf(target);
  if (!goal) return fail(NO_TARGET);
  const e = envOf(deps);
  const today = todayKey(now);
  const tree = await e.io.fieldTree();
  const valid = validateIntake(intake, { today, fields: tree, topicSwitches: deps.topicSwitches });
  if (!valid.ok) return fail(valid.error);
  let value = valid.value;
  // An empty library's named areas (F-R4-24): created in the Area Field (YOURS), reused by name on a repeat tap.
  if (value.fieldId && value.newDomainNames?.length) {
    const made = await createNamedDomains(e, value.fieldId, value.newDomainNames, tree);
    if (!made.ok) return fail(made.error);
    value = { ...value, domainIds: Array.from(new Set([...value.domainIds, ...made.value])), newDomainNames: undefined };
  }
  // A plan with nothing left to do, or none within 3 years, is refused here and again at accept (F-R4-10, decision 41).
  // The intake stands in for the draft it edits, so its share of the week counts that goal once (§23.3).
  const before = await e.store.listRoadmaps(userId);
  const editing = goal.kind === "EDIT" ? goal.roadmapId : goal.kind === "OPEN" ? (before.filter((r) => r.status === "DRAFT").sort(latestFirst)[0]?.id ?? null) : null;
  const refusal = await intakeRefusalOf(e, userId, value, now, editing ?? "intake");
  if (refusal) return fail(refusal);
  const data = intakeData(value, today);
  const replacing = value.replaces ?? null;
  const createKey = goal.kind === "CREATE" ? goal.createKey : null;
  const keyOps: StoreOp[] = createKey ? [{ op: "guard", guard: { g: "KEY_FREE", createKey } }] : [];
  const res = await withRetry<{ roadmapId: string }>(async () => {
    const all = await e.store.listRoadmaps(userId);
    // The same createKey returns the same id: the first save stands (§23.1).
    if (createKey) {
      const made = all.find((r) => r.createKey === createKey);
      if (made) return ok({ roadmapId: made.id });
    }
    const rows = all.filter(isOpen).sort(latestFirst);
    const asRow = (id: string, extra: Partial<RoadmapRec> = {}): RoadmapRec => ({ ...(intakeRowOf(userId, value, now) as RoadmapRec), id, ...extra });
    // "Start again at a depth" (F-R4-16): the legacy ACTIVE roadmap it replaces is archived in this same transaction.
    const old = replacing ? (all.find((r) => r.id === replacing) ?? null) : null;
    if (old && old.status === "ACTIVE") {
      // A legacy plan (isLegacyRoadmap: depth null on a Field Area, or a row of its version with no stage) — a rev-3 life-track
      // plan included (its Area has no Field) — is what "Start again at a depth" replaces (F-R4-16; the fix round's lens 3).
      const ob = await e.store.bundle(userId, old.id);
      if (!ob || !legacyOf(ob) || depthOf(old) != null) return fail("Only a plan made before plans aimed at a depth is replaced this way.");
      if (rows.some((r) => r.status === "DRAFT")) return fail("Finish or discard your open draft first.");
      if (ob.milestones.some(isCarried)) return fail("A milestone of that plan has started, so it can't be replaced.");
      // The new DRAFT inherits the archived row's seat (§23.1): the legacy row holds it, so it is free once that row closes
      // (one old code saved with none takes the lowest free one).
      const slot = isGoalSlot(old.slot) ? old.slot : seatForReopenOf(goalRowOf(old), all.map((r) => goalRowOf(r)));
      if (slot == null) return fail(noSeatLine());
      const hoursLine = hoursRefusalOf(all, value.hoursPerWeek, old.id);
      if (hoursLine) return fail(hoursLine);
      const taken = takenDomainOf(all, value.domainIds, old.id);
      if (taken) return fail(DOMAIN_TAKEN(taken.slot));
      const id = e.makeId();
      if (labelClashFor(all, tree, asRow(id, { slot }), old.id)) return fail(LABEL_CLASH);
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: old.id, statuses: ["ACTIVE"], depthNull: true } },
        { op: "guard", guard: { g: "NO_STARTED_MILESTONE", roadmapId: old.id } },
        { op: "guard", guard: { g: "SLOT_FREE", slot, exceptId: old.id } },
        ...keyOps,
        ...domainsFreeOps(value.domainIds, old.id),
        { op: "update", table: "roadmap", where: { id: old.id, status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: now, archiveReason: replacedReasonOf(today), updatedAt: now } },
        { op: "update", table: "roadmapMilestone", where: { roadmapId: old.id, status: { in: ["DRAFT"] } }, data: { status: "DISCARDED" } },
        { op: "insert", table: "roadmap", rows: [{ id, userId, ...data, status: "DRAFT", version: 0, slot, ...(createKey ? { createKey } : {}), createdAt: now, updatedAt: now }] },
      ]);
      return out === "ok" ? ok({ roadmapId: id }) : "stale";
    }
    // The draft this save edits: the one named, or (no target) the user's open draft, as today.
    let draft: RoadmapRec | null = null;
    if (goal.kind === "EDIT") {
      draft = all.find((r) => r.id === goal.roadmapId) ?? null;
      if (!draft) return fail(NO_ROADMAP);
      if (draft.status !== "DRAFT") return fail(isOpen(draft) ? "This goal is no longer a draft." : "This roadmap is closed.");
    } else if (goal.kind === "OPEN") {
      draft = rows.find((r) => r.status === "DRAFT") ?? null;
    }
    if (draft) {
      const hoursLine = hoursRefusalOf(all, value.hoursPerWeek, draft.id);
      if (hoursLine) return fail(hoursLine);
      const taken = takenDomainOf(all, value.domainIds, draft.id);
      if (taken) return fail(DOMAIN_TAKEN(taken.slot));
      // The form never sends the stored answers (contracts §19.3): the row's own ride along, so an intake save never drops
      // them; the guard on the row as read makes an answer saved meanwhile a re-read, never a loss.
      // The family too, when this save carries no answer of its own (a form that doesn't ask it).
      const kept = intakeData({ ...value, activities: activityConfirmOf(draft.coverage), practiceFamily: value.practiceFamily ?? practiceFamilyOfCoverage(draft.coverage) }, today);
      if (labelClashFor(all, tree, { ...draft, ...kept } as RoadmapRec, draft.id)) return fail(LABEL_CLASH);
      // A draft old code saved (no seat: ruling 24) takes one now, so every open row a lane-3 write leaves has its seat.
      const seat = isGoalSlot(draft.slot) ? null : seatForReopenOf(goalRowOf(draft), all.map((r) => goalRowOf(r)));
      const ops: StoreOp[] = [
        { op: "guard", guard: { g: "ROADMAP_IS", id: draft.id, statuses: ["DRAFT"], updatedAt: draft.updatedAt } },
        ...(seat != null ? [{ op: "guard", guard: { g: "SLOT_FREE", slot: seat, exceptId: draft.id } } satisfies StoreOp] : []),
        ...domainsFreeOps(value.domainIds, draft.id),
        { op: "update", table: "roadmap", where: { id: draft.id, status: "DRAFT" }, data: { ...kept, ...(seat != null ? { slot: seat } : {}), updatedAt: now } },
      ];
      // The draft's rows follow the new words in the same write (contracts §19): a kind the gate now holds leaves.
      ops.push(...(await draftGateOps(e, userId, draft, { ...draft, ...kept } as RoadmapRec, tree, now)));
      const out = await e.store.apply(userId, ops);
      return out === "ok" ? ok({ roadmapId: draft.id }) : "stale";
    }
    // A new goal: the lowest free seat from this fresh read, else the refusal (today's words while GOALS_MAX is 1).
    const slot = seatForNewOf(all.map((r) => goalRowOf(r)));
    if (slot == null) return fail(noSeatLine());
    const hoursLine = hoursRefusalOf(all, value.hoursPerWeek, null);
    if (hoursLine) return fail(hoursLine);
    const taken = takenDomainOf(all, value.domainIds, null);
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
    const id = e.makeId();
    if (labelClashFor(all, tree, asRow(id, { slot }), null)) return fail(LABEL_CLASH);
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "SLOT_FREE", slot, exceptId: null } },
      ...keyOps,
      ...domainsFreeOps(value.domainIds, null),
      { op: "insert", table: "roadmap", rows: [{ id, userId, ...data, status: "DRAFT", version: 0, slot, ...(createKey ? { createKey } : {}), createdAt: now, updatedAt: now }] },
    ]);
    return out === "ok" ? ok({ roadmapId: id }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * A DRAFT roadmap's draft rows through the gate of its row as it will read
 * (contracts §19; saveIntakeCore after the user's words changed), `prev`
 * being the row as stored. When the new words move the gate on the same
 * track (the card asks again, so the kinds its answer released wait), the
 * rows follow it as the answer's own write does (regatedDrafts, since the
 * kinds `prev` blocked): every live item a plan path placed of a kind the
 * gate now blocks leaves its row, and the track's safe kinds take the place
 * the starter gives them (a CARE draft keeps Plan the week ahead and Keep a
 * log, a CRAFT draft the technique session), so a changed text leaves the
 * same plan a fresh build would, never empty stages. When the plan's track
 * changed (a BODY draft saved as CARE), the rows are rebuilt for the new
 * track: the old track's rows leave them (onTrackRowOf: every item of a kind
 * the new track doesn't use, whoever placed it, and every item in code's
 * words the new track doesn't render), then regatedDrafts with no `since`
 * fills each stage with the new track's starter kinds through its gate (its
 * safe kinds while its card waits), so the draft is the plan a fresh build
 * of the new track would place, never a dead end at accept, Start or a
 * re-plan. Otherwise (the gate didn't move) only the blocked kinds leave
 * (gatePlanRows). A row of the user's own of a kind that waits again stays,
 * held (gatePlanRows). Through the one writer, each row guarded on its
 * status, the tripwire reading the row as it will read (its track, aim and
 * exam). None when the gate blocks nothing, didn't move and the track is
 * the same, the roadmap holds no draft, or it is a legacy draft; a write the
 * tripwire refuses leaves the rows (logged): accept refuses a draft that
 * still holds one (acceptBlockersOf).
 */
async function draftGateOps(e: Env, userId: string, prev: RoadmapRec, next: RoadmapRec, tree: readonly TreeField[], now: Date): Promise<StoreOp[]> {
  const gate = planGateOf(e, next).gate;
  const before = planGateOf(e, prev).gate;
  const switched = before.track !== gate.track;
  // A Field plan's practice family changed (the user's answer, or the aim the prefill reads): the progression's tables did.
  const refamilied = !switched && next.fieldId != null && practiceFamilyOf(intakeOf(prev)) !== practiceFamilyOf(intakeOf(next));
  const moved = !switched && (refamilied || JSON.stringify(gate.blocked) !== JSON.stringify(before.blocked));
  if (!switched && !moved && gate.blocked.length === 0) return [];
  const b = await e.store.bundle(userId, next.id);
  if (!b || legacyOf(b)) return [];
  // Revision 5, lane 8: a TOPICS draft's rows are its map's; the next map edit (or the accept, which rebuilds them through
  // the gate) re-places them, never the LEVELS re-sync below.
  if (isTopicsDraft(b)) return [];
  const group = draftRowsOf(b);
  if (group.length === 0) return [];
  const trackArea = next.fieldId == null;
  const textCtx = modelTextContextOf({ ...b, roadmap: next }, tree, true);
  const drafts = switched ? group.map((m) => onTrackRowOf(draftOf(m), gate.track, textCtx, trackArea, e.makeId)) : group.map(draftOf);
  let afters = gatePlanRows(drafts, gate, trackArea, e.makeId);
  if (moved || switched) {
    try {
      const ctx = await planContext(e, userId, next, now, coveragePriorOf(b) ?? draftCoverageOf(group), b);
      afters = regatedDrafts(e, ctx, [], drafts, switched ? null : before.blocked);
    } catch (err) {
      console.error("roadmap: the draft wasn't re-synced to the new words (the blocked kinds left it):", err instanceof Error ? err.message : err);
    }
  }
  const ops: StoreOp[] = [];
  try {
    group.forEach((row, i) => {
      const after = afters.find((d) => d.id != null && d.id === row.id) ?? afters.find((d) => d.lineageId === row.lineageId) ?? afters[i];
      if (!after || JSON.stringify(after) === JSON.stringify(draftOf(row))) return;
      ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: row.id, statuses: [row.status as MilestoneStatus] } });
      writeRoadmapRows(ops, { kind: "REWRITE", before: row, after, now, makeId: e.makeId, decided: new Set(), others: afters.filter((d) => d !== after) }, textCtx);
    });
  } catch (err) {
    if (!(err instanceof ModelTextError)) throw err;
    logRefusedWrite("intake-gate", err);
    return [];
  }
  return ops;
}

/**
 * A draft row once its plan's track changed (draftGateOps), pure: the old
 * track's rows leave it, whoever placed them and whatever their decision
 * (a REMOVED row included): every item of a catalog kind the new track
 * doesn't use (a BODY session on a CARE plan: its gate never asks about it,
 * so an answer on the new track could never hold it back), and every item in
 * code's words the new track doesn't render (the tripwire's codeLabelOk over
 * `ctx`, the row as it will read). An item of no catalog kind in the user's
 * own words stays, as does every item the new track holds as written; the
 * gate then holds those back as on any plan (gatePlanRows). Measures follow
 * a changed row (syncMeasures); a carried row is never touched.
 */
function onTrackRowOf(m: MilestoneDraft, track: CatalogTrack, ctx: ModelTextContext, trackArea: boolean, makeId: () => string): MilestoneDraft {
  if (isCarried(m)) return m;
  const code = catalogOriginOf();
  const items = m.items.filter((it) => {
    const entry = catalogEntryOf(it.catalogKey);
    if (entry && !entry.tracks.includes(track)) return false;
    return it.origin !== code || codeLabelOk(it, m, ctx);
  });
  return items.length === m.items.length ? m : syncMeasures({ ...m, items }, trackArea, makeId);
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
 * realistic date is under SPAN_MIN_DAYS away or past SPAN_MAX_DAYS, and, on
 * a realistic date, a Domain short of its count with no writing pace. When
 * every Domain already holds its count n_d in recall cards, the new cards
 * WRITE_MARGIN asks are its spare alone, so a REALISTIC intake with no pace
 * saves and the plan is dated on the cards held (R2's spareOnlyOf, the
 * WRITE_MARGIN ruling's option (b), contracts §16.10; RoadmapForm's
 * newCardsRequiredOf asks for the pace on the same rule), unless those cards
 * can't reach the depth within SPAN_MAX_DAYS (then the pace is asked for, as
 * before). null when the plan has work in it, on a track Area, and when the
 * ladder can't be worked out (logged: the draft and the acceptance check
 * again).
 */
async function intakeRefusalOf(e: Env, userId: string, intake: Intake, now: Date, rowId = "intake"): Promise<string | null> {
  if (!intake.fieldId || !isAimDepth(intake.depth)) return null;
  try {
    const ctx = await planContext(e, userId, { ...intakeRowOf(userId, intake, now), id: rowId }, now);
    const names = namesOfDomains(ctx, intake.domainIds);
    const res = e.lanes.stageLadderOf(intake, realismInputOf(ctx, [], [intake.domainIds]), names, e.makeId);
    return res.ok ? null : res.error;
  } catch (err) {
    console.error("roadmap: the intake's stage ladder wasn't worked out (the draft checks again):", err instanceof Error ? err.message : err);
    return null;
  }
}

const measuredPace = (f: WeeklyFigure | undefined): boolean => f?.kind === "measured" && f.median > 0;

/**
 * What /you/roadmap/new renders: the open DRAFT to edit, the Area options with their real facts, tracked time, the key.
 * Writes nothing.
 *
 * Revision 5 (§23.5): `roadmapId` names the draft the form edits (the user's DRAFT; else today's pick, the open draft);
 * the view also carries every seat 1..GOAL_SLOTS_MAX with its goal, every open draft, GOALS_MAX, the hours the other
 * open goals take (hoursRoomOf's `taken`), the Domains other DRAFT, ACTIVE and PAUSED goals hold (by their shown seat:
 * "in goal 1", never preselected) and the topic switches. The single `draft` and `activeRoadmapId` stay for the form
 * until lane 4.
 */
export async function loadIntakeView(userId: string, now: Date, deps: RoadmapDeps = {}, roadmapId: string | null = null): Promise<IntakeView> {
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
  const named = roadmapId != null ? (rows.find((r) => r.id === roadmapId && r.status === "DRAFT") ?? null) : null;
  const draft = named ?? open.find((r) => r.status === "DRAFT") ?? null;
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
    // Revision 5 (§23.5): the seats, the open drafts, the cap, the hours taken, the Domains other goals hold, the switches.
    ...intakeGoalsOf(rows, tree, draft, deps.topicSwitches),
  };
}

/** Each open goal's seat as the seat rules read it (seatsOf): its own slot, or for a row old code saved with none, the lowest one no other open row holds. */
function seatedOf(rows: readonly RoadmapRec[]): Map<string, GoalSlot> {
  const open = rows.filter(isOpen).sort(byOpenSeat);
  const out = new Map<string, GoalSlot>();
  const held = new Set<number>();
  const seat = (id: string, slot: GoalSlot) => {
    out.set(id, slot);
    held.add(slot);
  };
  for (const r of open) if (isGoalSlot(r.slot) && !held.has(r.slot)) seat(r.id, r.slot);
  for (const r of open) {
    if (out.has(r.id)) continue;
    const free = GOAL_SLOTS.find((s) => !held.has(s));
    if (free !== undefined) seat(r.id, free);
  }
  return out;
}

/** loadIntakeView's goal facts (§23.5), from the user's rows as read. */
function intakeGoalsOf(rows: readonly RoadmapRec[], tree: readonly TreeField[], draft: RoadmapRec | null, switches?: Partial<t5.TopicSwitches>): Pick<IntakeView, "seats" | "drafts" | "goalsMax" | "hoursTaken" | "takenDomains" | "topicSwitches"> {
  const seated = seatedOf(rows);
  const bySlot = new Map<GoalSlot, RoadmapRec>();
  for (const r of rows) {
    const s = seated.get(r.id);
    if (s != null) bySlot.set(s, r);
  }
  const seats: GoalSeatView[] = GOAL_SLOTS.map((slot) => {
    const r = bySlot.get(slot);
    return { slot, roadmapId: r?.id ?? null, status: r ? (r.status as RoadmapStatus) : null, label: r?.label ?? null, areaName: r ? areaNameOf(r, tree) : null, hoursPerWeek: r?.hoursPerWeek ?? null };
  });
  const drafts: IntakeDraftView[] = rows
    .filter((r) => r.status === "DRAFT")
    .sort(byOpenSeat)
    .map((r) => ({ roadmapId: r.id, slot: seated.get(r.id) ?? null, intake: intakeOf(r), savedDay: dayKeyOf(r.updatedAt), askHours: false }));
  const taken = new Map<string, GoalSlot | null>();
  for (const r of rows.filter((x) => holdsGoal(x) && x.id !== draft?.id).sort(bySeatOrder)) {
    const slot = r.status === "PAUSED" ? null : (seated.get(r.id) ?? null);
    for (const d of goalDomainsOf(r)) if (!taken.has(d)) taken.set(d, slot);
  }
  const takenDomains: Record<string, GoalSlot | null> = Object.fromEntries(taken);
  return {
    seats,
    drafts,
    goalsMax: GOALS_MAX,
    hoursTaken: hoursRoomOf(rows.map(shareGoalOf), draft?.id ?? null).taken,
    takenDomains,
    topicSwitches: topicSwitchesOf(switches),
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

/** The discard's Undo while GOALS_MAX is 1 and another goal holds the one seat (today's words; GOALS_FULL at 3). */
export const DISCARD_STAYS = "Another roadmap is open now, so this draft stays discarded.";

/** The discard's Undo: the discarded DRAFT roadmap back to DRAFT in a free seat (its own when free), or the discarded re-plan rows back. */
export async function undoDiscardCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status === "ARCHIVED" && b.roadmap.archiveReason === DISCARDED_REASON) {
      // Revision 5 (§23.1): the draft takes its old seat back when it is free, else the lowest free one (seatForReopenOf,
      // over the goals read beside the bundle); with none it stays discarded, in today's words while GOALS_MAX is 1.
      const goalRows = e.goals.get(userId) ?? [];
      const seat = seatForReopenOf(goalRowOf(b.roadmap), goalRows.map((r) => goalRowOf(r)));
      if (seat == null) return fail(GOALS_MAX === 1 ? DISCARD_STAYS : GOALS_FULL);
      // Its Domains came back to the goals it left: one another goal took since stays that goal's (§23.5).
      const taken = takenDomainOf(goalRows, goalDomainsOf(b.roadmap), roadmapId);
      if (taken) return fail(DOMAIN_TAKEN(taken.slot));
      const out = await e.store.apply(userId, [
        { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ARCHIVED"], archiveReason: DISCARDED_REASON } },
        { op: "guard", guard: { g: "SLOT_FREE", slot: seat, exceptId: roadmapId } },
        ...domainsFreeOps(goalDomainsOf(b.roadmap), roadmapId),
        { op: "update", table: "roadmap", where: { id: roadmapId, status: "ARCHIVED" }, data: { status: "DRAFT", archivedAt: null, archiveReason: null, slot: seat, updatedAt: now } },
      ]);
      return out === "ok" ? ok(null) : "stale";
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
  /**
   * The lead's ruling 6: a plan the user writes ("Write it myself", an "Edit
   * by hand" re-plan; manualPlanOf: a MANUAL run wrote the rows on screen).
   * Every re-fit, re-date and re-sync passes it to R2 (PlaceOpts.manual), so
   * code never fills it; the gate still holds (gatePlanRows), and the app's
   * practices reach a stage only when the user asks (addAppPracticeCore).
   * Absent: false (code's plan).
   */
  manual?: boolean;
  /**
   * Revision 5 (contracts §23.3, ruling 54): this goal's share of one person's week and of its Field's pace
   * (roadmap-goals sharesOf over the user's DRAFT and ACTIVE goals, this one counted with its own hours), read by
   * realism's capacityOf and availableFor through RealismInput.share and fieldShare. Absent: 1 (one goal: today).
   */
  share?: number;
  fieldShare?: number;
}

/**
 * This goal's shares (§23.3): sharesOf over the goals read with it (Env.goals), the row as it stands counted once (a
 * PAUSED or new goal being planned counts as open); `without` leaves one goal out (the accept sheet's "before").
 * 1 and 1 with one goal.
 */
function sharesFor(e: Env, roadmap: RoadmapRec, without: string | null = null): { share: number; fieldShare: number } {
  const others = (e.goals.get(roadmap.userId) ?? []).filter((r) => r.id !== roadmap.id && r.id !== without);
  if (!others.some(isOpen)) return { share: 1, fieldShare: 1 };
  const self: ShareGoal = { ...shareGoalOf(roadmap), status: isOpen(roadmap) ? (roadmap.status as RoadmapStatus) : "ACTIVE" };
  const s = sharesOf([self, ...others.map(shareGoalOf)])[roadmap.id];
  return s ? { share: s.share, fieldShare: s.fieldShare } : { share: 1, fieldShare: 1 };
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
 * `writer` (the lead's ruling 6): the roadmap's bundle when the caller re-fits
 * its rows, so the context says whether the user writes the plan
 * (PlanContext.manual, manualPlanOf); absent, it is code's.
 */
async function planContext(e: Env, userId: string, roadmap: RoadmapRec, now: Date, coveragePrior: readonly CoverageBreakdown[] | null = null, writer?: RoadmapBundle): Promise<PlanContext> {
  const manual = writer ? await manualPlanOf(e, writer) : false;
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
  const shares = sharesFor(e, roadmap);
  return {
    today,
    roadmap,
    intake,
    ...(shares.share !== 1 ? { share: shares.share } : {}),
    ...(shares.fieldShare !== 1 ? { fieldShare: shares.fieldShare } : {}),
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
    ...(manual ? { manual } : {}),
  };
}

/** R2's PlaceOpts.manual for a context (the lead's ruling 6): set only on a plan the user writes. */
const manualOpt = (ctx: Pick<PlanContext, "manual">): { manual?: true } => (ctx.manual === true ? { manual: true } : {});

/**
 * The lead's ruling 6: a plan the user writes stays theirs. True when the
 * rows on screen were written by a MANUAL run ("Write it myself" on a draft,
 * an "Edit by hand" re-plan, a line's Domain changed on an accepted plan):
 * rowsWriterFor, newest first, a FAILED Gemini run read in full for its
 * starter marker. A "Build from my numbers", a "Re-fit to my numbers" or a
 * Gemini draft after it is code's again. Unreadable: false (code's plan).
 */
async function manualPlanOf(e: Env, b: RoadmapBundle): Promise<boolean> {
  try {
    return (await rowsWriterFor(e, b, null)).wrote === "MANUAL";
  } catch (err) {
    console.error("roadmap: the rows' writer wasn't read (read as code's plan):", err instanceof Error ? err.message : err);
    return false;
  }
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
  // A TOPICS draft's topics get their Domains at accept, so before it holds one its pace is the Field's, else the one you typed.
  const source = ids.length || ctx.intake.planKind === "TOPICS" ? rateOf(ctx, ids, ctx.intake.fieldId, ctx.intake.newCardsPerWeek) : { rateSource: "NONE" as RateSource, rate: null };
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
    // Revision 5 (§23.3, ruling 54): this goal's shares; left out at 1, so one goal's input is today's, byte for byte.
    ...(ctx.share != null && ctx.share !== 1 ? { share: ctx.share } : {}),
    ...(ctx.fieldShare != null && ctx.fieldShare !== 1 ? { fieldShare: ctx.fieldShare } : {}),
    // Revision 5 (lane 7's handoff): a TOPICS plan's every realism call reads the chain, never the depth engine; absent on LEVELS.
    ...(ctx.intake.planKind === "TOPICS" ? { planKind: "TOPICS" as const } : {}),
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

/**
 * Start's count of each card measure on the started day, by key: its first
 * reading and the week quests' v0 (finishStartCore; startPreview's set reads
 * the same). Each key is counted by R1's own cardsAtLevelValue, as its
 * readings count it: recall cards only with an `r` segment (multiple choice
 * never; the detail says how many were left out), every card on a rev-3 key.
 * Its value is liveCountOfKey's. An `rc` key gets no count here: it also
 * counts a card that entered L on a retry only after its next pass, which
 * R1's reading reads from the REVIEW ledger and R6's set from its own
 * clean-entry read, so its first reading is R1's (as acceptCore leaves it)
 * and its v0 is R6's. A repeated key is counted once.
 */
function startCountsOf(ctx: Pick<PlanContext, "domains">, rows: readonly { kind: string; measureKey: string | null }[]): Map<string, measures.CardsValue> {
  const out = new Map<string, measures.CardsValue>();
  for (const x of rows) {
    if (x.kind !== "CARDS_AT_LEVEL" || !x.measureKey || out.has(x.measureKey)) continue;
    const parsed = parseMeasureKey(x.measureKey);
    if (parsed?.kind !== "CARDS_AT_LEVEL" || parsed.segment === "rc") continue;
    const cards: measures.CardLevelRow[] = [];
    for (const id of new Set(parsed.domainIds)) {
      for (const c of ctx.domains.get(id)?.cards ?? []) cards.push({ domainId: id, level: c.level, ...(c.type != null ? { recall: isRecallType(c.type) } : {}) });
    }
    out.set(x.measureKey, measures.cardsAtLevelValue(cards, parsed.domainIds, parsed.level, parsed.segment ?? null));
  }
  return out;
}

/** R6's QuestSetOverrides.v0ByKey from startCountsOf. */
function v0ByKeyOf(counts: ReadonlyMap<string, { value: number }>): Record<string, number> {
  return Object.fromEntries(Array.from(counts, ([key, c]) => [key, c.value]));
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
 * Materialisation (F-R4-17; v4, contracts §20): Gemini's part of a validated
 * reply placed on R2's stage ladder, whose practices, steps and checkpoints
 * are the practice progression's (code owns it; the reply's picks reach the
 * plan as withStagePractices' `picks`, never as rows of the reply's own).
 *   - The outline: every line of the ladder (and any line the reply placed
 *     that the ladder lacks) split across the kept milestones in `order`
 *     (the reply's learning order, roadmap-types outlineOrderOf; absent, the
 *     user's), by roadmap-types outlineStagesOf, each line once, listed in
 *     that order within its milestone.
 *   - Gemini's Domain additions (`needs`, pending, NOT_CHOSEN) sit on every
 *     kept milestone; area suggestions (GAP) only on the first, and only
 *     while ROADMAP_GAPS_LIVE and the user's switch are on.
 *   - A practice, step or checkpoint item the reply carries (a v3 reply's)
 *     is never placed: the progression owns the stage.
 * Held rows stay empty.
 */
export function materialiseKeys(
  ladder: readonly MilestoneDraft[],
  validated: Pick<ValidatedDraft, "milestones">,
  slots: readonly string[],
  opts: { gapsOn: boolean; makeId: () => string; order?: readonly number[] | null }
): MilestoneDraft[] {
  const rows = ladder.map((m) => ({ ...m, items: m.items.map((i) => ({ ...i })) }));
  const kept = rows.filter((m) => !heldRow(m) && m.status !== "LATER").sort((a, b) => a.ord - b.ord);
  if (kept.length === 0) return rows;
  const fresh = (it: ItemDraft): ItemDraft => ({ ...it, id: null, lineageId: opts.makeId() });
  const bySlot = new Map<string, MilestoneDraft>();
  validated.milestones.forEach((m, i) => {
    const key = m.stage && slots.includes(m.stage) ? m.stage : slots[i];
    if (key && !bySlot.has(key)) bySlot.set(key, m);
  });
  // The outline's lines: the ladder's, then any the reply placed that the ladder lacks (a line is the user's words).
  const lines = new Map<number, ItemDraft>();
  for (const m of kept) for (const it of m.items) if (it.kind === "TOPIC" && it.syllabusRef != null && !lines.has(it.syllabusRef)) lines.set(it.syllabusRef, it);
  const additions = new Map<string, ItemDraft>();
  const gaps: ItemDraft[] = [];
  for (const slot of slots) {
    const v = bySlot.get(slot);
    if (!v) continue;
    for (const it of v.items) {
      if (it.kind === "DOMAIN") {
        if (it.domainId && !additions.has(it.domainId)) additions.set(it.domainId, it);
      } else if (it.kind === "GAP") {
        if (opts.gapsOn) gaps.push(it);
      } else if (it.kind === "TOPIC" && it.syllabusRef != null && !lines.has(it.syllabusRef)) lines.set(it.syllabusRef, fresh(it));
    }
  }
  // The learning order: the reply's (each line once), then every line it left out, in the user's order.
  const given = (opts.order ?? []).filter((r, k, all) => lines.has(r) && all.indexOf(r) === k);
  const order = [...given, ...[...lines.keys()].filter((r) => !given.includes(r)).sort((a, b) => a - b)];
  const split = outlineStagesOf(order, kept.length);
  kept.forEach((m, k) => {
    const items = m.items.filter((i) => i.kind !== "TOPIC");
    for (const ref of split[k] ?? []) items.push({ ...(lines.get(ref) as ItemDraft) });
    for (const d of additions.values()) if (!items.some((i) => i.kind === "DOMAIN" && i.domainId === d.domainId)) items.push(fresh(d));
    m.items = items;
  });
  if (gaps.length) kept[0].items.push(...gaps.map(fresh));
  // Every item numbered in its milestone: the Domains, the rest, then the lines in learning order.
  for (const m of kept) {
    const topics = m.items.filter((i) => i.kind === "TOPIC");
    const rest = m.items.filter((i) => i.kind !== "TOPIC");
    m.items = [...rest, ...topics].map((i, k) => ({ ...i, ord: k + 1 }));
  }
  return rows;
}

/**
 * Gemini's learning order of the outline, from a reply (contracts §20.5):
 * the validator's own (R3's v4 `order`, as line indices or an OutlineOrder),
 * else the reply's `order` S-keys through roadmap-types outlineOrderOf over
 * the run's keymap (exact keys only), else a v3 reply's lines in the order
 * its stages placed them; null with none (the user's order).
 */
function replyOrderOf(checked: unknown, parsed: unknown, pack: EvidencePack, lines: number, validated: Pick<ValidatedDraft, "milestones">, slots: readonly string[]): number[] | null {
  const own = (o: unknown, k: string): unknown => (o && typeof o === "object" && !Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined);
  const indices = (v: unknown): number[] | null => (Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isInteger(x)) ? (v as number[]) : null);
  const fromValidator = own(checked, "order");
  const direct = indices(fromValidator) ?? indices(own(fromValidator, "order"));
  if (direct) return direct;
  const raw = own(parsed, "order");
  if (Array.isArray(raw)) return outlineOrderOf(raw, pack.keymap?.syllabus ?? null, lines).order;
  const bySlot = [...validated.milestones].sort((a, b) => slots.indexOf(a.stage ?? "") - slots.indexOf(b.stage ?? ""));
  const placed = bySlot.flatMap((m) => m.items.filter((i) => i.kind === "TOPIC" && i.syllabusRef != null).map((i) => i.syllabusRef as number));
  return placed.length ? placed : null;
}

/**
 * Gemini's picks from a reply (contracts §20.5), read as unknown: the
 * validator's own (R3's v4 `picks`), else the reply's `picks` object, else a
 * v3 reply's first practice per stage that is one of that stage's
 * candidates on this run (progressionCandidatesOf through the gate). R2's
 * progression reads any pick outside a stage's candidates as absent: code's
 * default.
 */
function replyPicksOf(
  checked: unknown,
  parsed: unknown,
  validated: Pick<ValidatedDraft, "milestones">,
  run: { track: CatalogTrack; exam: boolean; practicesAllowed: boolean; family: PracticeFamily | null; gate: Pick<ActivityGate, "blocked"> }
): unknown {
  const own = (o: unknown, k: string): unknown => (o && typeof o === "object" && !Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, k) ? (o as Record<string, unknown>)[k] : undefined);
  const plain = (v: unknown): boolean => !!v && typeof v === "object" && !Array.isArray(v);
  const fromValidator = own(checked, "picks");
  if (plain(fromValidator)) return fromValidator;
  const raw = own(parsed, "picks");
  if (plain(raw)) return raw;
  const out: Record<string, string> = {};
  for (const m of validated.milestones) {
    const stage = m.stage;
    if (!stage || Object.prototype.hasOwnProperty.call(out, stage)) continue;
    const cands = progressionCandidatesOf(run.track, { stage }, run) as readonly string[];
    const first = [...m.items].sort((a, b) => a.ord - b.ord).find((i) => i.kind === "PRACTICE" && i.decision !== "REMOVED" && !!i.catalogKey && cands.includes(i.catalogKey));
    if (first?.catalogKey) out[stage] = first.catalogKey;
  }
  return out;
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
 * draft's rows carried onto it, the practice progression, and the feasibility
 * with the date check. The ladder's refusal (past 3 years, nothing left to
 * do) refuses the change in its words.
 */
function redraftOf(e: Env, ctx: PlanContext, drafts: readonly MilestoneDraft[], carried: readonly MilestoneDraft[], required: readonly string[]): { ok: true; plan: MilestoneDraft[]; feasibility: Feasibility } | { ok: false; error: string } {
  // A plan the user writes (the lead's ruling 6) is re-dated onto the stage skeleton: a stage new to it comes empty.
  const ladder = ladderOf(e, { ...ctx, intake: withRequired(ctx.intake, required) }, required, ctx.manual === true ? "NONE" : "STARTER");
  if (!ladder.ok) return ladder;
  const carriedStages = new Set(carried.map((m) => `${m.stage ?? ""}:${gateLevelOf(m) ?? ""}`));
  const fresh = ladder.plan.filter((m) => !carriedStages.has(`${m.stage ?? ""}:${gateLevelOf(m) ?? ""}`));
  const moved = transplantOnto(drafts, fresh, e.makeId);
  const plan = withStagePractices(e, { ...ctx, intake: withRequired(ctx.intake, required) }, moved, carried).map((m) => ({
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
 * The practice progression on every kept stage (contracts §20: R2's fitPlan
 * puts progressionOf's practices, steps and checkpoint on each DRAFT stage,
 * the carried rows beside them read, not changed; a held row stays empty),
 * and R2's allocation (sessions and bands, never a lower depth term) over the
 * plan. `replyPicks` are Gemini's (a reply's, read as unknown); without them each
 * stage keeps its GEMINI_PICK practice as its pick. The step names a stage's
 * code labels over its Domains; a pending Gemini addition is hidden from it
 * (withPendingHidden), so no label names a Domain the user hasn't confirmed.
 */
function withStagePractices(e: Env, ctx: PlanContext, plan: readonly MilestoneDraft[], carried: readonly MilestoneDraft[] = [], replyPicks?: unknown): MilestoneDraft[] {
  return withPendingHidden(plan, (masked) => stagePracticesOf(e, ctx, masked, carried, replyPicks));
}

/**
 * Draft rows after the plan's gate changed (contracts §19: the user's answer,
 * a re-plan), or as they were when the gate changes nothing in them: every
 * live item of a kind the gate now blocks leaves (gatePlanRows), a track
 * plan's practices, steps and checkpoint follow the answers (R2's
 * syncTrackStarter: the practice progression under the new gate, contracts
 * §20, so a kind the answer released is placed where the progression places
 * it, and a safe kind standing in for one now avoided), then the
 * progression and R2's allocation on every stage (withStagePractices). A
 * plan's track changed (draftGateOps) is the same: the progression of the
 * new track. `since` (the blocked kinds the rows were built with, or null
 * after a track switch) is passed on and no longer read by R2: a REMOVED row
 * keeps the user's no. `carried` are the started rows beside them (never changed).
 */
function regatedDrafts(
  e: Env,
  ctx: PlanContext,
  carried: readonly MilestoneDraft[],
  drafts: readonly MilestoneDraft[],
  since: readonly CatalogKey[] | null
): MilestoneDraft[] {
  const gate = gateOf(e, ctx);
  const trackArea = ctx.intake.fieldId == null;
  const pruned = gatePlanRows(drafts, gate, trackArea, e.makeId);
  let filled = pruned;
  // A plan the user writes (the lead's ruling 6) is never filled: the gate's blocked kinds leave it, and nothing takes their place.
  if (trackArea && ctx.manual !== true) {
    try {
      const all = [...carried, ...pruned];
      filled = e.lanes.syncTrackStarter(all, ctx.intake, e.makeId, { gate, excluded: gate.blocked, input: realismInputOf(ctx, all), ...(since ? { since } : {}) }).filter((d) => !isCarried(d));
    } catch (err) {
      console.error("roadmap: the track starter wasn't re-synced:", err instanceof Error ? err.message : err);
    }
  }
  if (JSON.stringify(filled) === JSON.stringify(drafts)) return [...drafts];
  return withStagePractices(e, ctx, filled, carried);
}

/**
 * withStagePractices' step, over rows whose pending additions are hidden: the
 * gate first (no row keeps a kind it blocks), then R2's fitPlan with the
 * plan's intake and the gate's blocked kinds, which puts the practice
 * progression on every DRAFT stage (contracts §20; a blocked kind is never
 * placed: the track's safe kinds, or the next of its role, stand in) and
 * sizes it; then the measures follow the rows (syncMeasures: a practice's
 * PRACTICE_KEPT, a checkpoint's CHECKPOINT).
 */
function stagePracticesOf(e: Env, ctx: PlanContext, plan: readonly MilestoneDraft[], carried: readonly MilestoneDraft[], replyPicks?: unknown): MilestoneDraft[] {
  const gate = gateOf(e, ctx);
  const trackArea = ctx.intake.fieldId == null;
  const gated = gatePlanRows(plan, gate, trackArea, e.makeId);
  try {
    const all = [...carried, ...gated];
    const fitted = gatePlanRows(e.lanes.fitPlan(all, realismInputOf(ctx, all), { excluded: gate.blocked, intake: ctx.intake, picks: replyPicks, ...manualOpt(ctx) }), gate, trackArea, e.makeId).filter((d) => !isCarried(d));
    if (fitted.length !== gated.length) return gated;
    return fitted.map((d, i) => {
      const row = { ...d, stage: d.stage ?? gated[i].stage };
      return heldRow(row) || row.status === "LATER" ? row : syncMeasures(row, trackArea, e.makeId);
    });
  } catch (err) {
    console.error("roadmap: the practice progression wasn't placed (the rows as written):", err instanceof Error ? err.message : err);
    return gated;
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
 * `items` NONE (a plan the user writes, the lead's ruling 6): the stage
 * skeleton with the outline's lines, no practice, step or checkpoint.
 */
function ladderOf(e: Env, ctx: PlanContext, required: readonly string[], items: "STARTER" | "NONE" = "STARTER"): { ok: true; plan: MilestoneDraft[] } | { ok: false; error: string } {
  const intake = withRequired(ctx.intake, required);
  const counts = frozenCountsOf(ctx, required, ctx.coveragePrior);
  // Confirm to unlock (contracts §19): the plan's one gate; R2 places no kind it blocks, and a fixture or older lane's
  // ladder is held to it here too (gatePlanRows).
  const gate = gateOf(e, ctx);
  const res = e.lanes.stageLadderOf(intake, realismInputOf({ ...ctx, intake }, [], [required]), requiredNamesOf(ctx, required), e.makeId, { counts, gate, excluded: gate.blocked, ...(items === "NONE" ? { items, lines: true } : {}) });
  return res.ok ? { ok: true, plan: gatePlanRows(res.plan, gate, intake.fieldId == null, e.makeId) } : { ok: false, error: res.error };
}

/**
 * The plan built from one parsed reply (F-R4-17): keys-only validation
 * (R3's validateKeysOnly with its KeysOnlyContext, after the integrity walk
 * passed), materialised into R2's stage ladder, the practice progression, and the
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
  // The dated ladder the reply is placed on, worked out first: the validator's own progression over the slots reads its
  // rooms and the exam's stage and run-up (the lead's ruling 7: KeysOnlyContext.progression), so the picks it keeps and
  // what it logs (keys.pick-code, keys.pick-reshaped) agree with R2's plan.
  let ladder: readonly MilestoneDraft[] | null = extra.ladder ?? null;
  if (!ladder) {
    const res = ladderOf(e, ctx, required);
    ladder = res.ok ? res.plan : null;
  }
  const progression = ladder && ladder.length > 0 ? slotProgressionFor(e, ctx, ladder, slots, required) : null;
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
    ...(progression ? { progression } : {}),
  });
  // Confirm to unlock (contracts §19): a pick of a kind the gate blocks never reaches the plan (dropped before the caps,
  // so it never crowds out an allowed one), whatever the run's enums offered; the report says so as R3's validator does.
  const gate = gateOf(e, ctx);
  const validated: ValidatedDraft = gateValidated({ ...checked, report: { ...checked.report, integrity } }, gate);
  if (!ladder || ladder.length === 0) return { plan: null, feasibility: null, validated };
  // Gemini's part (contracts §20): the outline's learning order and one pick per stage among code's candidates. The
  // practices, steps and checkpoints are the progression's (R2's), each valid pick added beside its stage's focus.
  const order = replyOrderOf(checked, parsed, pack, ctx.intake.syllabus?.lines.length ?? 0, validated, slots);
  const picks = replyPicksOf(checked, parsed, validated, {
    track: ctx.intake.fieldId != null ? "FIELD" : ctx.intake.track,
    exam: !!ctx.intake.examLabel && ctx.intake.exam !== false,
    practicesAllowed: ctx.intake.practicesAllowed,
    family: ctx.intake.fieldId != null ? practiceFamilyOf(ctx.intake) : null,
    gate,
  });
  // The area-suggestion slot is materialised only when it was issued for this run and the switch is on (F-R4-19).
  const gapsOn = extra.gapsOn ?? (ROADMAP_GAPS_LIVE && ctx.intake.suggestAreas === true && (pack as { run?: { gaps?: unknown } }).run?.gaps === true);
  const placed = materialiseKeys(ladder, validated, slots, { gapsOn, makeId: e.makeId, order });
  const key = extra.memo ? JSON.stringify([placed, picks]) : null;
  const hit = key != null ? extra.memo?.get(key) : undefined;
  if (hit) return { ...hit, validated };
  const plan = withStagePractices(e, ctx, placed, [], picks).map((m) => ({ ...m, version: ctx.roadmap.version + 1 }));
  if (plan.length === 0) return { plan: null, feasibility: null, validated };
  const feasibility = feasibilityFor(e, ctx, plan);
  if (key != null && extra.memo) {
    if (extra.memo.size >= HOSTILE_CACHE_MAX) extra.memo.clear();
    extra.memo.set(key, { plan, feasibility });
  }
  return { plan, feasibility, validated };
}

/** slotProgressionFor's reading per ladder object (a WeakMap: a ladder gone is a reading gone). */
const SLOT_PROGRESSION_MEMO = new WeakMap<object, { key: string; value: NonNullable<validate.KeysOnlyContext["progression"]> }>();

/**
 * What the validator's progression reads of the dated plan (the lead's ruling
 * 7; R3's KeysOnlyContext.progression, contracts §20.7): R2's
 * slotProgressionOf over the ladder the reply is placed on, through the
 * plan's gate (each slot's room, a dated exam's stage and its run-up as
 * slots). null when it can't be worked out (logged): the validator then
 * reads its own defaults, as before.
 */
function slotProgressionFor(
  e: Env,
  ctx: PlanContext,
  ladder: readonly MilestoneDraft[],
  slots: readonly string[],
  required: readonly string[]
): NonNullable<validate.KeysOnlyContext["progression"]> | null {
  try {
    const intake = withRequired(ctx.intake, required);
    const gate = gateOf(e, ctx);
    // One reading per ladder (the bar places every reply of a run on one ladder object): keyed on what else it reads.
    const key = JSON.stringify([slots, required, gate.blocked, ctx.today]);
    const hit = SLOT_PROGRESSION_MEMO.get(ladder);
    if (hit && hit.key === key) return hit.value;
    const value = realism.slotProgressionOf(ladder, intake, realismInputOf({ ...ctx, intake }, ladder, [required]), slots, { gate, excluded: gate.blocked });
    SLOT_PROGRESSION_MEMO.set(ladder, { key, value });
    return value;
  } catch (err) {
    console.error("roadmap: the plan's progression wasn't read for the reply's validation (its defaults):", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * A validated reply through the gate (contracts §19), pure: every pick of a
 * kind the gate blocks leaves its milestone, with a CONSTRAINT drop in the
 * report (no words: the label is '', as R3 writes it). Nothing else changes.
 */
function gateValidated(v: ValidatedDraft, gate: Pick<ActivityGate, "blocked">): ValidatedDraft {
  const dropped: ValidationReport["dropped"] = [];
  const milestones = v.milestones.map((m) => {
    const keep = m.items.filter((it) => {
      if (isPlaceableKind(gate, it.catalogKey)) return true;
      dropped.push({ milestoneOrd: m.ord, kind: it.kind, label: "", code: "CONSTRAINT", reason: validate.KEYS_ONLY_REASONS.constraint });
      return false;
    });
    return keep.length === m.items.length ? m : { ...m, items: keep };
  });
  return dropped.length ? { ...v, milestones, report: { ...v.report, dropped: [...v.report.dropped, ...dropped] } } : v;
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
  // Confirm to unlock (contracts §19): the starter places only what the plan's gate allows (and is held to it here).
  const gate = gateOf(e, ctx);
  const built = e.lanes.starterLadder(intake, realismInputOf({ ...ctx, intake }, [], [required]), names, e.makeId, { gate, excluded: gate.blocked });
  const plan = gatePlanRows(built, gate, intake.fieldId == null, e.makeId).map((m) => ({ ...m, version: ctx.roadmap.version + 1 }));
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
  return pointedRefusal(deps, userId, { roadmapId }, await claimDraftUnpointed(userId, roadmapId, opts, now, deps));
}

/** claimDraftCore's work; claimDraftCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function claimDraftUnpointed(
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
  // The stage keys the dated ladder reads a pick for (R3's pickStagesOf): the pick enums are asked for these alone, so no
  // pick is asked for a stage the plan doesn't hold (a merged or held one).
  let pickStages: string[];
  try {
    const ladder = ladderOf(e, ctx, requiredOfPlan(ctx));
    if (!ladder.ok) return fail(ladder.error);
    windows = ladder.plan.filter((m) => m.status !== "LATER" && !heldRow(m) && m.windowStart && m.dueDay).map((m) => ({ start: m.windowStart as DayKey, end: m.dueDay as DayKey }));
    pickStages = evidence.pickStagesOf(ladder.plan);
  } catch (err) {
    console.error("roadmap: the stage ladder wasn't worked out for the draft:", err instanceof Error ? err.message : err);
    return fail("Couldn't plan the stages. Build from your numbers, or try again.");
  }
  if (windows.length === 0) return fail("The aim's date no longer fits a roadmap — change the date.");
  // Revision 5, lane 10 (ruling 66; §23.5): the split clauses leave the aim sent, and no other goal's Domain nor any
  // Gemini-named Domain is listed. With neither, the pack is byte-identical.
  const pack = e.lanes.buildEvidencePack({
    intake: ctx.intake,
    areaName: ctx.areaName,
    domains: evidenceDomainsOf(ctx),
    windows,
    pickStages,
    ...levelsPackLimitsOf(e, userId, first.roadmap, ctx.tree),
  });
  // A schema with no property asks nothing (and the API refuses an OBJECT without properties): never called, nothing written.
  if (emptySchemaOf(schemaOf(e, pack))) return fail(NOTHING_TO_ARRANGE);
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
          {
            ...runRow(runId, userId, roadmapId, today, b.roadmap.version + 1, "GEMINI", "RUNNING", now, {
              model: ROADMAP_MODEL,
              promptVersion: ROADMAP_PROMPT_VERSION,
              seedBase,
              inputHash,
              pack,
            }),
            // Revision 5, lane 10 (ruling 66): the requests this draft will send, counted from the claim; runDraftCore
            // writes what it sent.
            requests: ROADMAP_SAMPLES,
          },
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
    // Revision 5, lane 10 (ruling 66): every run row the server writes sets RoadmapRun.requests; a row that sends
    // nothing (INHOUSE, MANUAL, CAPPED, REUSED) is 0, and a Gemini claim overrides it with what it will send.
    requests: 0,
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

/**
 * A built schema that asks Gemini nothing (R3's schemaAsksNothing, the one definition: keysOnlySchemaOf leaves out
 * needs, order and picks whenever each would be empty, and the API refuses an OBJECT without properties). Null (no
 * schema built) is not read here: the run fails on it in its own words.
 */
const emptySchemaOf = (schema: unknown): boolean => schema != null && validate.schemaAsksNothing(schema);

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
    // Only a pack of today's prompt version is ever drafted (contracts §20.5): an earlier run's pack (a v3 one still
    // RUNNING across a deploy: its stored lines ask for practices, steps and a checkpoint) is never sent beside today's
    // instruction and schema, and an earlier free-text reply is never read (F-R4-17).
    const keysOnly = !!pack && typeof pack === "object" && pack.promptVersion === ROADMAP_PROMPT_VERSION;
    const schema = keysOnly ? schemaOf(e, pack) : null;
    // A schema that asks nothing is never sent (the claim refuses it; a run claimed before that guard fails here).
    const empty = emptySchemaOf(schema);
    const results: SampleResult[] = keysOnly && schema && !empty ? await e.lanes.draftSamples(pack, ROADMAP_SAMPLES, { callModel: deps.callModel, seedBase: run.seedBase ?? SEED_BASE }) : [];
    const samples = results.flatMap((r) => (r.ok ? [r.value] : []));
    const errors = results.flatMap((r) => (r.ok ? [] : [r.error]));
    if (!keysOnly) errors.push("an earlier prompt version (never read)");
    else if (!schema) errors.push("the run's schema wasn't built");
    else if (empty) errors.push("nothing for Gemini to arrange (never sent)");

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
    // Revision 5, lane 10 (ruling 66): RoadmapRun.requests is what was sent (failures included; nothing sent is 0).
    const facts = { ...model.runFactsOf(results), requests: model.requestsSentOf(results), finishedAt: now };
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
    // The row as the run read it: words or answers saved meanwhile (contracts §19.3) supersede the run, never the reverse.
    { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["DRAFT"], version: run.version - 1, updatedAt: b.roadmap.updatedAt } },
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
        const required = requiredOfPlan(ctx);
        if (ctx.intake.fieldId != null && isAimDepth(ctx.intake.depth)) {
          const ladder = ladderOf(e, ctx, required);
          if (!ladder.ok) return fail(ladder.error);
        }
        // The stage skeleton names its stages over R, so it needs R's names (R2 builds none without them on a Field Area).
        const intake = withRequired(ctx.intake, required);
        const names = requiredNamesOf(ctx, required.length ? required : ctx.intake.domainIds);
        const plan = e.lanes.manualLadder(intake, realismInputOf({ ...ctx, intake }, [], [required.length ? required : ctx.intake.domainIds]), e.makeId, names);
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
  return pointedRefusal(deps, userId, { roadmapId }, await buildInHouse(userId, roadmapId, "INHOUSE", now, deps));
}

/** "Write it myself": a MANUAL run (status OK, outside the cap) with an empty ladder of n milestones. */
export async function startManualCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ runId: string }>> {
  return pointedRefusal(deps, userId, { roadmapId }, await buildInHouse(userId, roadmapId, "MANUAL", now, deps));
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
      const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b), b);
      // An ACTIVE roadmap's re-plan draft is fitted beside the milestones already carried (their capacity and due
      // days, fix round 2); only the draft's rows come back to be written.
      const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
      const plan = [...carried, ...drafts];
      // R2's re-fit names the stages' code labels: a pending Gemini addition is hidden from it (withPendingHidden); it adds
      // no stage practice of a kind the plan's gate blocks (contracts §19), and none at all to a plan the user writes (ruling 6).
      const blocked = gateOf(e, ctx).blocked;
      next = withPendingHidden(plan, (masked) => e.lanes.fitPlan(masked, realismInputOf(ctx, masked), { excluded: blocked, intake: ctx.intake, ...manualOpt(ctx) })).filter((d) => !isCarried(d));
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
  return pointedRefusal(deps, userId, { ref: itemId }, await decideItemUnpointed(userId, itemId, decision, now, deps));
}

/** decideItemCore's work; decideItemCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function decideItemUnpointed(userId: string, itemId: string, decision: ItemDecisionChoice, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
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
    // Gemini's practice pick, still waiting (contracts §20.5): "I checked this" keeps it, the row's own keep beside the
    // plan-wide one (confirmSessionPicksCore); Remove gives the app's default back (the re-fit below). Never a kind the gate holds.
    if (decision === "CHECKED" && item && item.kind === "PRACTICE" && editable && pendingPick(itemDraftOf(item))) {
      const gate = planGateOf(e, loc.b.roadmap).gate;
      if (!isPlaceableKind(gate, item.catalogKey)) return fail(pointedAt(gate, gate.rows.find((r) => r.kind === item.catalogKey)?.state === "AVOID" ? ACTIVITY_AVOIDED_PICK : ACTIVITY_WAITING_PICK));
      return updateOne(e, userId, loc, "roadmapItem", item.id, { decision, decidedAt: now });
    }
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
  return pointedRefusal(deps, userId, { ref: itemId }, await editItemUnpointed(userId, itemId, edit, now, deps));
}

/** editItemCore's work; editItemCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function editItemUnpointed(userId: string, itemId: string, edit: ItemEdit, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
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
      const picked = catalogPickOf(e, b, await e.io.fieldTree(), itemDraftOf(item), pickedKind);
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
function catalogPickOf(e: Env, b: RoadmapBundle, tree: readonly TreeField[], it: ItemDraft, raw: unknown): ItemDraft | string {
  const entry = catalogEntryOf(raw);
  if (!entry || entry.codeOnly) return "Pick a type from the list.";
  if (entry.slot !== it.kind) return "Pick a type from this list.";
  const track = catalogTrackOf({ fieldId: b.roadmap.fieldId, track: intakeOf(b.roadmap).track });
  if (!entry.tracks.includes(track)) return "That type isn't used for this Area.";
  if (entry.examOnly && !b.roadmap.examLabel) return "That type needs an exam: say there is one first.";
  if (entry.slot === "PRACTICE" && !b.roadmap.practicesAllowed) return "Practices are off for this roadmap.";
  // Confirm to unlock (contracts §19): a type the plan's gate blocks is picked only once the user answered the card
  // under their current words without ticking it; the refusal points at the card (decision 2).
  const gate = planGateOf(e, b.roadmap).gate;
  if (!isPlaceableKind(gate, entry.key)) return pointedAt(gate, gate.rows.find((r) => r.kind === entry.key)?.state === "AVOID" ? ACTIVITY_AVOIDED_PICK : ACTIVITY_WAITING_PICK);
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
  return pointedRefusal(deps, userId, { ref: milestoneId }, await addItemUnpointed(userId, milestoneId, input, now, deps));
}

/** addItemCore's work; addItemCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function addItemUnpointed(userId: string, milestoneId: string, input: NewItem, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ itemId: string }>> {
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
      const picked = catalogPickOf(e, b, tree, base, pickedKind);
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
      // Revision 5, lane 8 (ruling 50): a TOPICS plan's Domains are its topics: one changes layer only on the map. The
      // depth guard below stays LEVELS's.
      if (kindOfRow(b.roadmap) === "TOPICS" || (isTopicsDraft(b) && m.version === b.roadmap.version + 1)) return fail(MOVE_TOPICS_ON_THE_MAP);
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
  return pointedRefusal(deps, userId, { ref: milestoneId }, await keepUnflaggedUnpointed(userId, milestoneId, now, deps));
}

/** keepUnflaggedCore's work; keepUnflaggedCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function keepUnflaggedUnpointed(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ kept: number }>> {
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
  return pointedRefusal(deps, userId, { ref: itemId }, await resolveDomainUnpointed(userId, itemId, resolution, now, deps));
}

/** resolveDomainCore's work; resolveDomainCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function resolveDomainUnpointed(userId: string, itemId: string, resolution: DomainResolution, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ domainId: string | null }>> {
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
    // Revision 5, lane 8 (ruling 50): on a TOPICS plan a Domain is bound or created on the map (useMyDomain, accept); the depth guard stays LEVELS's.
    if (kindOfRow(b.roadmap) === "TOPICS" || (isTopicsDraft(b) && m.version === b.roadmap.version + 1)) return fail(MOVE_TOPICS_ON_THE_MAP);
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
  const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b), b);
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
  return pointedRefusal(deps, userId, { roadmapId }, await applyRemedyUnpointed(userId, roadmapId, remedy, now, deps));
}

/** applyRemedyCore's work; applyRemedyCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function applyRemedyUnpointed(userId: string, roadmapId: string, remedy: Remedy, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
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
    const ctx = await planContext(e, userId, b.roadmap, now, null, b);
    // The milestones already carried, at their one due day and without a row their copy replaces (fix round 2).
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const drafts = group.map(draftOf);
    const input = realismInputOf(ctx, [...carried, ...drafts]);
    const changed = e.lanes.applyRemedy([...carried, ...drafts], input, remedy, { excluded: gateOf(e, ctx).blocked, intake: ctx.intake, ...manualOpt(ctx) }).filter((d) => !isCarried(d));
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
  const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b), b);
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
export function acceptBlockersOf(
  drafts: readonly MilestoneDraft[],
  feasibility: Feasibility | null,
  scheduledTotal: number,
  opts: { picksNeedConfirm?: boolean; gate?: SwapGate; pickIsDefault?: (d: MilestoneDraft, i: ItemDraft) => boolean; planKind?: PlanKind | null } = {}
): AcceptCheck {
  const blockers: string[] = [];
  // Confirm to unlock (contracts §19): a draft never becomes the plan holding a live item of a kind the gate blocks,
  // whoever placed it: a kept Gemini pick or the user's own row of a kind that waits on their answer again (their words
  // changed since the card was answered) is re-gated too (decision 5). acceptCore points the refusal at the card.
  const gate = opts.gate;
  if (gate && drafts.some((d) => d.status !== "LATER" && d.items.some((i) => liveItem(i) && !isPlaceableKind(gate, i.catalogKey)))) blockers.push(ACTIVITY_HELD_IN_DRAFT);
  // Revision 4 (F-R4-17, F-R4-21): Gemini's Domain additions and a body or care plan's session picks are decided for the
  // whole plan, before anything else; a pending one blocks accept, and "Next item to decide" scrolls to it.
  const pendingAdd = drafts.flatMap((d) => d.items.filter(pendingAddition));
  // Gemini's practice picks (contracts §20.5) on every other plan: a pick that isn't code's own default for its stage, still
  // PENDING, is Gemini's choice the user hasn't looked at; it blocks until kept or swapped for the app's default
  // (confirmSessionPicksCore KEEP or DEFAULT, or the row's own "I checked this" or Remove), so a pick never reaches the
  // plan undecided.
  const pendingPicks = opts.picksNeedConfirm
    ? drafts.flatMap((d) => d.items.filter(pendingPick))
    : drafts.filter((d) => d.status !== "LATER").flatMap((d) => d.items.filter((i) => i.kind === "PRACTICE" && pendingPick(i) && !(opts.pickIsDefault?.(d, i) ?? false)));
  if (pendingAdd.length) blockers.push(DECIDE_ADDITIONS);
  if (pendingPicks.length) blockers.push(opts.picksNeedConfirm ? confirmPicksOf(gate) : DECIDE_PRACTICE_PICKS);
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
  // Revision 5, lane 8 (ruling 50): the cap is the plan kind's (milestoneCapOf: TOPICS 8, LEVELS 6 as before).
  const cap = milestoneCapOf(opts.planKind);
  if (scheduledTotal > cap) blockers.push(`A roadmap holds at most ${cap} milestones; move some to Later.`);
  return { blockers, nextToDecide, nextLineageId: next?.lineageId ?? null, needsOver: !!feasibility?.over || feasibility?.dateCheck?.verdict === "OVER" };
}

/** Revision 4 accept refusals, in words. */
export const DECIDE_ADDITIONS = "Decide Gemini's suggested Domains first: add them or leave them out.";
/** Gemini's practice picks waiting on a plan that needs no session confirm (a Field plan's; contracts §20.5). */
export const DECIDE_PRACTICE_PICKS = "Decide Gemini's practice picks first: keep them, or use the app's default.";
/** A body plan's session-picks blocker (confirmPicksOf on BODY, with no safe session avoided). */
export const CONFIRM_PICKS = "Confirm Gemini's session picks first: keep them, or use easy, mobility and technique sessions.";

/** The gate the session-picks words read: what it blocks and, where given, its track (BODY's words without one). */
type SwapGate = (Pick<ActivityGate, "blocked"> & Partial<Pick<ActivityGate, "track">>) | null | undefined;

/** The safe sessions read as one "… sessions" phrase on a body plan ("easy, mobility and technique sessions"). */
const SWAP_SESSION_WORD: Partial<Readonly<Record<CatalogKey, string>>> = { EASY_SESSION: "easy", MOBILITY_SESSION: "mobility", TECHNIQUE_SESSION: "technique" };

/**
 * What the session picks' swap puts in their place, named (confirmSessionPicksCore's EASY; the card's button,
 * roadmap-copy sessionPicksSwapWord, names the same): the plan's track's safe practices (cueSafeKindsOf), less any its
 * gate blocks (a safe kind is blocked only when the user said to avoid it). "easy, mobility and technique sessions" on
 * BODY, "Plan the week ahead and Keep a log" on CARE (each type's own name: its template before any fill); null when
 * the user avoided every one. A gate without its track reads as BODY's.
 */
function swapWordsOf(gate: SwapGate): string | null {
  const blocked = new Set<string>(gate?.blocked ?? []);
  const kinds = cueSafeKindsOf(gate?.track ?? "BODY").filter((k) => catalogEntryOf(k)?.slot === "PRACTICE" && !blocked.has(k));
  if (kinds.length === 0) return null;
  const sessions = kinds.every((k) => SWAP_SESSION_WORD[k] != null);
  const names = kinds.map((k) => (sessions ? (SWAP_SESSION_WORD[k] as string) : (catalogEntryOf(k)?.template ?? k).replace(/:.*$/, "")));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return sessions ? `${list} sessions` : list;
}

/**
 * The accept blocker while Gemini's session picks wait (F-R4-17), naming what the swap places on the plan's track
 * (swapWordsOf): CONFIRM_PICKS on a body plan; "…keep them, or use Plan the week ahead and Keep a log." on a care plan;
 * "…keep them, or leave them out." when the user avoided every safe practice.
 */
export function confirmPicksOf(gate: SwapGate): string {
  const words = swapWordsOf(gate);
  return `Confirm Gemini's session picks first: keep them, or ${words ? `use ${words}` : "leave them out"}.`;
}

/** confirmSessionPicksCore's refusal of a choice other than KEEP or EASY, naming the plan's swap (swapWordsOf): "Keep the picks, or use Plan the week ahead and Keep a log." on a care plan. */
export function picksChoiceRefusalOf(gate: SwapGate): string {
  const words = swapWordsOf(gate);
  return `Keep the picks, or ${words ? `use ${words}` : "leave them out"}.`;
}

/**
 * Confirm to unlock (contracts §19): the draft still holds a session type the gate holds back (it waits on the user's
 * answer to the activity card, or they said to avoid it). acceptCore adds the card's pointer while the card waits.
 */
export const ACTIVITY_HELD_IN_DRAFT = "This draft holds a session type that waits on your answer or that you said to avoid: remove it, or change your answer.";
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
  return pointedRefusal(deps, userId, { roadmapId }, await acceptUnpointed(userId, roadmapId, choices, now, deps));
}

/** acceptCore's work; acceptCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function acceptUnpointed(userId: string, roadmapId: string, choices: AcceptChoices, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ version: number }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const overAccepted = !!(choices && typeof choices === "object" && choices.overAccepted === true);
  // Revision 5, lane 8: a TOPICS accept's Domains created so far (kept across retries) and the live milestone it closed.
  const topicState: Parameters<typeof acceptTopicsStep>[7] = { created: [], createdGemini: [], closing: null };
  const res = await withRetry<{ version: number }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    // Revision 5, lane 8 (§22.14): a TOPICS draft is accepted on its map (acceptTopicsStep); LEVELS reads on as before.
    if (isTopicsDraft(b) && draftRowsOf(b).length > 0) return acceptTopicsStep(e, deps, userId, b, choices, now, overAccepted, topicState);
    // Revision 5 (§23.1): a draft already holds its seat, so accept refuses nothing for another goal; the user's goals
    // as read beside the bundle (goalReadingStore) give its seat guard and DOMAINS_FREE.
    const goalRows = e.goals.get(userId) ?? [];
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
    // Domains are one goal's (§23.5): a Domain of this plan another DRAFT, ACTIVE or PAUSED goal holds refuses here, and
    // DOMAINS_FREE re-checks it in the transaction.
    const planDomains = Array.from(new Set([...goalDomainsOf(b.roadmap), ...required]));
    const taken = takenDomainOf(goalRows, planDomains, roadmapId);
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
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
    const gate = planGateOf(e, b.roadmap).gate;
    const check = acceptBlockersOf(drafts, feasibility, scheduledTotal, { picksNeedConfirm: picksNeedConfirmOf(b.roadmap), gate, pickIsDefault: pickIsDefaultOf(b.roadmap, gate) });
    // Decision 2: while the activity card waits, the refusal points at it (a waiting plan is never a dead end).
    if (check.blockers.length) return fail(pointedAt(gate, check.blockers[0]));
    if (check.needsOver && !overAccepted) return fail(pointedAt(gate, "This plan is over your hours or pace: switch on “Keep it over my hours/pace” to accept it."));

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
    // The seat the draft holds (§23.1) stays its own, and the open goals stay within GOALS_MAX (SLOT_FREE excepting this
    // row); a draft old code saved with no seat (ruling 24) takes the lowest free one here. A re-plan of an ACTIVE goal
    // changes no seat.
    const seatOps: StoreOp[] = [];
    if (b.roadmap.status === "DRAFT") {
      const seat = isGoalSlot(b.roadmap.slot) ? b.roadmap.slot : seatForReopenOf(goalRowOf(b.roadmap), goalRows.map((r) => goalRowOf(r)));
      // No path leaves a draft without a seat beside GOALS_MAX open goals; such rows never make a second ACTIVE.
      if (seat == null) return fail(RACED);
      seatOps.push({ op: "guard", guard: { g: "SLOT_FREE", slot: seat, exceptId: roadmapId } });
      if (!isGoalSlot(b.roadmap.slot)) roadmapData.slot = seat;
    }
    const ops: StoreOp[] = [
      ...seatOps,
      ...domainsFreeOps(planDomains, roadmapId),
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
  // Revision 5, lane 8 (ruling 49): a TOPICS accept's closed LEVELS milestone leaves Today (its goal; on ARCHIVE its practices).
  if (res.ok) await closeLiveAfterAccept(e, userId, topicState.closing, now);
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
  depth: AimDepth | TopicDepth | null,
  planKind: PlanKind | null = null
): Record<string, number | null> {
  // Revision 5, lane 8 (ruling 51): a TOPICS plan's ranks are R1's spread over its counted gates (assignRankIndices with
  // planKind: topicRankIndexOf, held, skipped and all-held rows null); there is no by-stage pass, since every layer is FAMILIAR.
  if (planKind === "TOPICS") return e.lanes.assignRankIndices(rows, firstByLineage, depth, planKind);
  const out = e.lanes.assignRankIndices(rows, firstByLineage, depth);
  if (depth == null || !isAimDepth(depth)) return out;
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
    // Revision 5, lane 8 (ruling 49): an accept that closed a live milestone stays; one of another kind restores the plan it replaced.
    const topicUndo = topicUndoOf(b, acc, version);
    if (typeof topicUndo === "string") return fail(topicUndo);
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
        data: { ...(prev >= 1 ? { version: prev, updatedAt: now } : { version: 0, status: "DRAFT", firstAcceptedDay: null, updatedAt: now }), ...topicUndo.roadmapData },
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
  /** Revision 5 (§23.3): the user's other ACTIVE and PAUSED goals as read (their carried practices may be on Today), with their shown seats. */
  others: { b: RoadmapBundle; slot: GoalSlot | null }[];
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
  // Every other goal whose started practices may be on Today (§23.3): Start never makes a task a goal already has there.
  const others: { b: RoadmapBundle; slot: GoalSlot | null }[] = [];
  for (const r of (e.goals.get(userId) ?? []).filter((x) => x.id !== b.roadmap.id && (x.status === "ACTIVE" || x.status === "PAUSED")).sort(bySeatOrder)) {
    const ob = await e.store.bundle(userId, r.id);
    if (ob) others.push({ b: ob, slot: shownSlotOf(ob.roadmap) });
  }
  const otherPractices = others.flatMap((o) => planRowsOf(o.b).filter(isCarried).flatMap((m) => [m.goalId, ...m.items.filter((i) => i.kind === "PRACTICE").map((i) => i.templateId)]));
  // The plan's goals (is one still open? their due days) and its practices (is one already on Today?), in one read.
  const templateIds = [...planRows.flatMap((m) => [m.goalId, ...m.items.filter((i) => i.kind === "PRACTICE").map((i) => i.templateId)]), ...otherPractices].filter((x): x is string => !!x);
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
  return { b, row, ctx, plan, refitted, hw, current, templates: byId, payments, others };
}

/**
 * Practices of earlier milestones still open on Today under the same name ("Backtest is already on Today (from
 * Milestone 1)"), this goal's first, then every other ACTIVE or PAUSED goal's carried practices (§23.3: "already on
 * Today from goal 1"; `fromGoal` is that goal's shown seat, null for a paused one), so Start never makes a duplicate task.
 */
function alreadyOnToday(f: StartFacts, it: ItemDraft): { templateId: string; fromOrd: number; fromGoal?: GoalSlot | null } | null {
  const norm = normTitleOf(it.label);
  const sameName = (templateId: string): TemplateLite | null => {
    const t = f.templates.get(templateId);
    return t && !t.archivedAt && (t.normTitle === norm || normTitleOf(t.title) === norm) ? t : null;
  };
  for (const m of planRowsOf(f.b)) {
    if (m.id === f.row.id || !isCarried(m)) continue;
    for (const i of m.items) {
      if (i.kind !== "PRACTICE" || !i.templateId) continue;
      const t = sameName(i.templateId);
      if (t) return { templateId: t.id, fromOrd: m.ord };
    }
  }
  for (const o of f.others) {
    for (const m of planRowsOf(o.b)) {
      if (!isCarried(m)) continue;
      for (const i of m.items) {
        if (i.kind !== "PRACTICE" || !i.templateId) continue;
        const t = sameName(i.templateId);
        if (t) return { templateId: t.id, fromOrd: m.ord, fromGoal: o.slot };
      }
    }
  }
  return null;
}

/**
 * "2 Mid goals paid in the last 30 days — closing before 21 Dec pays 0" (goalLimitWindow's rule for MID). Revision 5
 * (§23.3): `goals` names the roadmap goals whose milestones used those slots ("… paid in the last 30 days · goal 1 and
 * goal 2"); none (only this goal's own milestones, or no roadmap milestone among them) leaves today's line.
 */
function limitLineOf(paidDays: readonly DayKey[], goals: readonly string[] = []): string | null {
  const rule = GOAL_RULES.MID;
  const days = [...paidDays].sort().reverse();
  if (days.length === 0) return null;
  const named = goals.length === 0 ? "" : ` · ${goals.length === 1 ? goals[0] : `${goals.slice(0, -1).join(", ")} and ${goals[goals.length - 1]}`}`;
  const head = `${days.length} Mid goal${days.length === 1 ? "" : "s"} paid in the last ${rule.windowDays} days${named}`;
  if (days.length < rule.maxPaying) return head;
  const free = addDays(days[rule.maxPaying - 1], rule.windowDays);
  return `${head} — closing before ${shortDate(free)} pays 0`;
}

/**
 * The roadmap goals whose milestones' MID closes paid in the window (§23.3), as the limit line names them ("goal 2",
 * "a paused goal"), this goal first, then the others in seat order. [] when only this goal's milestones (or no roadmap
 * milestone) used them, so one goal reads today's line.
 */
function midGoalNamesOf(f: Pick<StartFacts, "b" | "others">, paid: readonly { goalId: string }[] | null): string[] {
  if (!paid || paid.length === 0) return [];
  const paidIds = new Set(paid.map((p) => p.goalId));
  const uses = (b: RoadmapBundle) => b.milestones.some((m) => m.goalId != null && paidIds.has(m.goalId));
  const others = f.others.filter((o) => uses(o.b));
  if (others.length === 0) return [];
  const own = shownSlotOf(f.b.roadmap);
  const names = [...(uses(f.b) ? [own != null ? `goal ${own}` : "this goal"] : []), ...others.map((o) => (o.slot != null ? `goal ${o.slot}` : "a paused goal"))];
  return Array.from(new Set(names));
}

/** A milestone with the sheet's switched-off practices off Today. */
const withOff = (m: MilestoneDraft, off: ReadonlySet<string>): MilestoneDraft => ({
  ...m,
  items: m.items.map((i) => (i.kind === "PRACTICE" && off.has(i.lineageId) ? { ...i, addToToday: false } : i)),
});

/**
 * What Start holds back (confirm to unlock, contracts §19), by item lineage:
 * every live practice, step and checkpoint of a kind the plan's gate blocks
 * (waiting on the user's answer, or one they said to avoid). Start creates
 * no task, quest or measure for one; the Start sheet lists them as waiting
 * (R5 reads the plan's activityConfirm), and they need no decision, name or
 * bar for Start to go ahead without them.
 */
function heldAtStartOf(m: Pick<MilestoneDraft, "items">, gate: Pick<ActivityGate, "blocked">): Set<string> {
  const held = (i: ItemDraft) => liveItem(i) && (i.kind === "PRACTICE" || i.kind === "STEP" || i.kind === "CHECKPOINT") && !isPlaceableKind(gate, i.catalogKey);
  return new Set(m.items.filter(held).map((i) => i.lineageId));
}

/** A milestone with the held practices and steps off Today (addToToday false: no task, no quest, no pay). */
const withHeld = (m: MilestoneDraft, held: ReadonlySet<string>): MilestoneDraft =>
  held.size === 0 ? m : { ...m, items: m.items.map((i) => (held.has(i.lineageId) && (i.kind === "PRACTICE" || i.kind === "STEP") ? { ...i, addToToday: false } : i)) };

/** The milestone as Start's checks read it: the held items aside. */
const withoutHeld = (m: MilestoneDraft, held: ReadonlySet<string>): MilestoneDraft => (held.size === 0 ? m : { ...m, items: m.items.filter((i) => !held.has(i.lineageId)) });

/** The Start sheet, computed before anything is created (refitForStart, statedForMilestone, the MID limit, the week's quests). Writes nothing. */
export async function startPreview(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<StartPreview | null> {
  const e = envOf(deps);
  const f = await startFacts(e, userId, milestoneId, now);
  if (!f) return null;
  const { b, row, ctx, refitted } = f;
  const planRows = planRowsOf(b);
  // Its words re-checked as the editor reads them (pending rows carry their struck spans and reasons).
  const checked: MilestoneDraft = labelChecksOf(e, b, ctx.tree, [refitted.milestone], positionCountOf(planRows.filter(scheduled)))[0];
  // Confirm to unlock (contracts §19): what the plan's gate blocks isn't started (off Today, not on the sheet's lists).
  const held = heldAtStartOf(checked, gateOf(e, ctx));
  const m = withHeld(checked, held);
  const off = new Set<string>();
  const track: Track = isOneOf(ROADMAP_TRACKS, b.roadmap.track) ? b.roadmap.track : DEFAULT_FIELD_TRACK;
  const [ledger, midPaid, midGoals] = await Promise.all([
    e.io.dayLedger(userId, ctx.today).catch((err: unknown) => {
      console.error("roadmap: today's ledger unavailable (practices unpriced):", err);
      return null;
    }),
    e.io.midGoalPaidDays(userId, ctx.today).catch(() => [] as DayKey[]),
    // Which goals' milestones used the MID slots (§23.3): read only while the user has another goal.
    f.others.length > 0 && e.io.midGoalsPaid ? e.io.midGoalsPaid(userId, ctx.today).catch(() => null) : Promise.resolve(null),
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
  const rows = todayBoundRowsOf(withoutHeld(m, held), off);
  // The pay line at the sheet's default switches, and its basis: the sheet recomputes it on every switch with the same arithmetic.
  const payBasis = payBasisOf(m, snapshot ?? refitted.feasibility, lineagePaidOnOf(b, row, f.payments));
  const stated = statedFor(m, payBasis, off);
  const of = positionCountOf(planRows.filter(scheduled));
  // Revision 5, lane 8 (F-R5-10): the sheet shows a TOPICS layer's PREREQS_OPEN as Start would refuse it.
  const refusal = startRefusal(e, deps, b, row, planRows, ctx.today, refitted.impossible, f.templates) ?? topicStartRefusal(b, row, ctx.tree);
  let weekQuests: WeekQuestSet | null = null;
  if (snapshot) {
    // "Week quests if you start now": the generator's set for the rest of this life week, from what Start would write.
    const previewTemplates = Object.fromEntries(
      mOff.items.filter((i) => (i.kind === "PRACTICE" || i.kind === "STEP") && i.addToToday && liveItem(i)).map((i) => [i.id as string, `preview-${i.id}`])
    );
    try {
      weekQuests = await e.lanes.weekQuestSetFor(userId, milestoneId, weekStartKeyOf(ctx.today), now, {
        // Start's own v0 per key (finishStartCore), so the preview's quests are the set Start freezes.
        overrides: { startedDay: ctx.today, snapshot, templateIds: previewTemplates, v0ByKey: v0ByKeyOf(startCountsOf(ctx, row.measures)), gate: gateOf(e, ctx) },
      });
    } catch {
      weekQuests = null;
    }
  }
  const blockers = blockersOf(withoutHeld(m, held), rows);
  const rank = row.rankIndex;
  return {
    milestoneId,
    ord: row.ord,
    of,
    title: m.title,
    dueDay: (m.dueDay ?? row.dueDay ?? ctx.today) as DayKey,
    goalsLive: e.goalsLive,
    writesOff: writesOff(deps),
    // Decision 2: while the activity card waits, the refusal points at it.
    refusal: refusal == null ? null : pointedAt(gateOf(e, ctx), refusal),
    todayCheck: refitted.todayCheck,
    feasibility: refitted.feasibility,
    pending: withoutHeld(m, held).items.filter(undecidedAtStart),
    todayRows: rows,
    practices,
    steps: m.items.filter((i) => i.kind === "STEP" && liveItem(i) && !held.has(i.lineageId)).map((i) => ({ itemId: i.id as string, title: i.label })),
    // restsOnAdded (F-R4-13): "Pays ⬡6 because of the practice the app added (…)" — lane 0 adds the optional field to StartPreview.pay.
    pay: Object.assign({ stated: stated.stated, zeroReason: stated.zeroReason, limitLine: limitLineOf(midPaid, midGoalNamesOf(f, midGoals)), paidOn: stated.paidOn }, { restsOnAdded: stated.restsOnAdded ?? null }),
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
  if (b.roadmap.status === "PAUSED") return "Resume this goal first.";
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
  return pointedRefusal(deps, userId, { ref: milestoneId }, await startMilestoneUnpointed(userId, milestoneId, choices, now, deps));
}

/** startMilestoneCore's work; startMilestoneCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function startMilestoneUnpointed(userId: string, milestoneId: string, choices: StartChoices, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ goalId: string }>> {
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
    // Confirm to unlock (contracts §19): the plan's gate; while its card waits, the refusals below point at it (decision 2;
    // the card-measure refusals further on are a Field plan's, which never asks).
    const gate = gateOf(e, ctx);
    const refuse = (message: string) => fail<{ goalId: string | null }>(pointedAt(gate, message));
    const refusal = startRefusal(e, deps, b, row, planRows, ctx.today, refitted.impossible, f.templates);
    if (refusal) return refuse(refusal);
    // Revision 5, lane 8 (F-R5-10): a TOPICS layer opens when what it builds on is met (PREREQS_MET re-checks below).
    const prereqs = topicStartRefusal(b, row, ctx.tree);
    if (prereqs) return refuse(prereqs);

    const sheet = applySheet(refitted.milestone, ch, b, e, ctx.tree);
    if (typeof sheet === "string") return refuse(sheet);
    const off = new Set(ch.practicesOff);
    // What the plan's gate blocks is held back (off Today; the started row records it).
    const held = heldAtStartOf(sheet, gate);
    let m = syncMeasures(withHeld(withOff(sheet, off), held), b.roadmap.fieldId == null, e.makeId);
    const blockers = blockersOf(withoutHeld(m, held), todayBoundRowsOf(withoutHeld(m, held), off));
    if (blockers.length) return refuse(blockers[0]);
    if (!m.measures.some((x) => x.role === "PAYS")) return refuse(held.size > 0 ? ACTIVITY_WAITING_START : NOTHING_MEASURES);

    const fz = refitted.feasibility;
    const over = fz.worst === "OVER" || fz.time.verdict === "OVER" || fz.knowledge.some((k) => k.verdict === "OVER");
    if (over && !ch.overAccepted && !row.overAccepted) return refuse("This milestone is over your hours or pace now: switch on “Keep it over my hours/pace” to start it.");

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
      // Revision 5, lane 8: none on LEVELS.
      ...topicStartGuards(b, row),
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

/**
 * "Finish starting" (and Start's last step): the rows by captureKey, PRACTICE_KEPT keys, STARTING → STARTED, the first
 * readings (each card key counted as it counts, startCountsOf: no multiple choice on a depth key, no first `rc` reading)
 * and PROFICIENCY, and this week's quest set (source START, its v0 per key from the same counts).
 */
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
  // Confirm to unlock (contracts §19): the gate as it reads now (an answer given between the claim and this finish counts).
  const gate = gateOf(e, ctx);
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
      // Held back at the claim (addToToday false), or blocked by an answer given since (contracts §19): no task.
      if (!liveItem(it) || !it.addToToday || !isPlaceableKind(gate, it.catalogKey)) continue;
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
      if (!liveItem(it) || !it.addToToday || !isPlaceableKind(gate, it.catalogKey)) continue;
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
    // The started day's card counts, each counted as its key counts (none for an `rc` key: R1's first reading).
    const counts = startCountsOf(ctx, row.measures);
    for (const [key, live] of counts) readingRows.push(measures.cardsReadingRow(key, ctx.today, live));
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
      }
    }
    ops.push({ op: "update", table: "roadmapMilestone", where: { id: row.id, status: "STARTING" }, data: { status: "STARTED", goalId } });
    // The roadmap row moves too (strictly later than as read): an activity answer read while this row was STARTING is
    // guarded on the row's updatedAt, so it re-reads and finds the row STARTED with its tasks (decision 4's race).
    ops.push({ op: "update", table: "roadmap", where: { id: roadmapId }, data: { updatedAt: new Date(Math.max(now.getTime(), b.roadmap.updatedAt.getTime() + 1)) } });

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
          overrides: { startedDay, snapshot: snap, templateIds: Object.fromEntries(templateOf), v0ByKey: v0ByKeyOf(counts), gate },
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
  if (res.ok) await pauseAvoidedAfterFinish(e, userId, roadmapId, milestoneId, templateOf, now);
  return res;
}

/**
 * The race finishStartCore closes (decision 4; the verifier's R4 follow-up):
 * an AVOID that landed between the finish's gate read and its write-back of
 * the template ids. The answer saw the row STARTING (no template ids yet), so
 * it paused nothing, and the finish had already created the task. After its
 * write the finish re-reads the stored answers: every task it created (by
 * item lineage, `templateOf`) whose kind is now avoided is paused at once
 * (pauseAvoidedTasks; a must included, ruling 2), and its practice stops
 * counting toward the milestone (offTargetOpsOf, ruling 3). An answer read
 * before the write and saved after it re-reads instead (the write moves the
 * roadmap's updatedAt) and pauses them itself; a task already archived is
 * not paused twice. Nothing is refused here: Start has finished, and a
 * failure is logged (the page's card still shows the AVOID, and the task can
 * be archived on Today).
 */
async function pauseAvoidedAfterFinish(e: Env, userId: string, roadmapId: string, milestoneId: string, templateOf: ReadonlyMap<string, string>, now: Date): Promise<PausedTask[]> {
  if (templateOf.size === 0) return [];
  try {
    const b = await e.store.bundle(userId, roadmapId);
    const row = b?.milestones.find((m) => m.id === milestoneId);
    if (!b || !row || row.status !== "STARTED") return [];
    const confirm = intakeOf(b.roadmap).activities ?? null;
    const avoided = new Set<string>(confirm ? Object.keys(confirm.kinds).filter((k) => confirm.kinds[k as CatalogKey]?.verdict === "AVOID") : []);
    if (avoided.size === 0) return [];
    const list: TaskToPause[] = [];
    for (const i of [...row.items].sort((x, y) => x.ord - y.ord)) {
      const t = templateOf.get(i.lineageId);
      if (!t || !liveItem(i) || (i.kind !== "PRACTICE" && i.kind !== "STEP") || !isCatalogKey(i.catalogKey) || !avoided.has(i.catalogKey)) continue;
      if (!list.some((x) => x.templateId === t)) list.push({ templateId: t, kind: i.catalogKey, label: i.label });
    }
    if (list.length === 0) return [];
    const off = offTargetOpsOf(b, confirm, await carriedGoalsOf(e, userId, b), milestoneId);
    if (off.length > 0 && (await e.store.apply(userId, off)) !== "ok") console.error("roadmap: an avoided practice still counts toward its milestone (the row moved meanwhile)");
    const { paused, notPaused } = await pauseAvoidedTasks(e, userId, list, now);
    if (notPaused.length > 0) console.error("roadmap: Start's tasks of an avoided kind weren't all paused:", notPaused.map((x) => x.templateId).join(", "));
    invalidate("roadmap");
    return paused;
  } catch (err) {
    console.error("roadmap: Start's tasks weren't re-checked against the answers:", err instanceof Error ? err.message : err);
    return [];
  }
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
  return pointedRefusal(deps, userId, { roadmapId }, await replanUnpointed(userId, roadmapId, kind, now, deps));
}

/** replanCore's work; replanCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function replanUnpointed(userId: string, roadmapId: string, kind: ReplanKind, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ version: number }>> {
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
    // "Edit by hand" is the user's plan (the lead's ruling 6): its stages are copied as they were, never filled; "Re-fit to
    // my numbers" is code's.
    const ctx: PlanContext = { ...(await planContext(e, userId, b.roadmap, now, coveragePriorOf(b))), manual: kind === "MANUAL" };
    const gate = gateOf(e, ctx);
    // Revision 5, lane 8 (ruling 50): a TOPICS plan's re-plan keeps its map (its rows copied to the draft version) and
    // REFIT re-dates through layeredLadderOf, never re-splitting its layers; on LEVELS a leftover TOPICS draft is cleared.
    const topical = await replanTopicsOf(e, userId, b, kind, now, carried);
    if (typeof topical === "string") return fail(topical);
    const topicsPlan = kindOfRow(b.roadmap) === "TOPICS";
    if (kind === "REFIT" && topicsPlan && topical.plan) plan = topical.plan.map((d) => ({ ...d, status: (d.status === "LATER" ? "LATER" : "DRAFT") as MilestoneStatus, version: v }));
    else if (kind === "REFIT") {
      const refitted = e.lanes.refit([...carried, ...plan], realismInputOf(ctx, [...carried, ...plan]), { excluded: gate.blocked, intake: ctx.intake });
      plan = refitted.filter((d) => !isCarried(d)).map((d) => ({ ...d, status: d.status === "LATER" ? "LATER" : "DRAFT", version: v }));
    }
    // An "Edit by hand" re-plan (the lead's ruling 6): its DRAFT stages are the unstarted ones as they were, sized beside the
    // started stages (a Re-fit's re-date already placed the practice progression); nothing is added to them, so no opening or
    // exam step is placed twice, and the app's practices reach a stage only when the user asks (addAppPracticeCore).
    if (kind === "MANUAL" && !topicsPlan) plan = withStagePractices(e, ctx, plan, carried).map((d) => ({ ...d, version: v, status: (d.status === "LATER" ? "LATER" : "DRAFT") as MilestoneStatus }));
    // Confirm to unlock (contracts §19): the re-plan keeps no kind the user's answers block, and a track plan's practices
    // follow them (a kind their answer released is placed where the progression places it). A TOPICS plan's rows keep
    // their chain's own progression (§22.13): only the gate's blocked kinds leave them.
    const unanswered = allowedKindsFor(planGateOf(e, ctx.roadmap).state, null).blocked;
    plan = (topicsPlan ? gatePlanRows(plan, gate, false, e.makeId) : regatedDrafts(e, ctx, carried, plan, unanswered)).map((d) => ({
      ...d,
      version: v,
      status: (d.status === "LATER" ? "LATER" : "DRAFT") as MilestoneStatus,
    }));
    if (plan.length === 0) return fail("Every milestone has started; nothing is left to re-plan.");
    const cap = milestoneCapOf(kindOfRow(b.roadmap));
    if (positionCountOf([...carried, ...plan.filter(scheduled)]) > cap) return fail(`A roadmap holds at most ${cap} milestones; move some to Later.`);
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
      // Revision 5, lane 8: the map's rows at the draft version (TOPICS), or a leftover TOPICS draft cleared (none: no op).
      ...topical.ops,
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
    // Revision 5 (ruling 56): a PAUSED goal is archived too, so with every seat full it can still be closed, freeing its
    // Domains and AVOIDs. DONE still needs ACTIVE (markRoadmapDoneCore).
    if (b.roadmap.status !== "ACTIVE" && b.roadmap.status !== "DONE" && b.roadmap.status !== "PAUSED") return fail(b.roadmap.status === "DRAFT" ? "Discard the draft instead." : "This roadmap is already archived.");
    const rows = planRowsOf(b).filter((m) => m.status === "STARTED" && m.goalId);
    const goals = new Map((await e.io.templates(userId, rows.map((m) => m.goalId as string))).map((t) => [t.id, t]));
    // The live milestone's goal (a superseded row's unarchived goal is not the one the user is working on).
    openGoal = (rows.find((m) => !superseded(b, m) && goalOpen(m, goals)) ?? rows.find((m) => goalOpen(m, goals)))?.goalId ?? null;
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE", "DONE", "PAUSED"] } },
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

// ═══ Revision 5: pause, resume and the goal's label (contracts §23.4) ═══════

/**
 * [Pause] (§23.4), from ACTIVE only (PAUSE_ONLY_ACTIVE; a DRAFT is discarded, with undo). In one transaction under the
 * goal's guards the row turns PAUSED with pausedAt and the reason, keeping its slot (outside the seat index: ruling 46),
 * its Domains (DOMAINS_FREE reads PAUSED) and its AVOIDs; an open re-plan draft is discarded (a paused goal shows no
 * plan action). A live milestone is closed as dropped (its goal archived, as a drop does), so its lineage can start
 * again later ("Milestone 2 stops; it leaves Today"); its practices follow `choices.aftercare` through the aftercare
 * path: KEEP records them kept on Today (practiceAftercare stops asking), ARCHIVE archives them. From then on the goal
 * has no readings, quests, triggers or Today line; its seat is free. `closedMilestoneId` names the milestone closed.
 */
export async function pauseRoadmapCore(
  userId: string,
  roadmapId: string,
  choices: PauseChoices,
  now: Date,
  deps: RoadmapDeps = {}
): Promise<RoadmapActionResult<{ closedMilestoneId: string | null }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const aftercare = choices && typeof choices === "object" ? choices.aftercare : null;
  if (aftercare !== "KEEP" && aftercare !== "ARCHIVE") return fail("Keep its practices on Today, or archive them.");
  const reason = choices.reason == null ? "" : typeof choices.reason === "string" ? cleanText(choices.reason) : null;
  if (reason == null) return fail("Say why in words, or leave it blank.");
  if (Array.from(reason).length > GOAL_PAUSE_REASON_MAX) return fail(`Keep the reason to ${GOAL_PAUSE_REASON_MAX} characters.`);
  const e = envOf(deps);
  let closing: { milestoneId: string; goalId: string | null; practices: string[] } | null = null;
  const res = await withRetry<{ closedMilestoneId: string | null }>(async () => {
    closing = null;
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "ACTIVE") return fail(PAUSE_ONLY_ACTIVE);
    const rows = planRowsOf(b);
    if (rows.some((m) => m.status === "STARTING")) return fail("A milestone is starting: tap Finish starting first, then pause.");
    const started = rows.filter((m) => m.status === "STARTED" && m.goalId);
    const ids = started.flatMap((m) => [m.goalId as string, ...m.items.filter((i) => i.kind === "PRACTICE" && i.templateId).map((i) => i.templateId as string)]);
    const templates = new Map((ids.length ? await e.io.templates(userId, ids) : []).map((t) => [t.id, t]));
    // The live milestone (a superseded row's unarchived goal is not the one being worked on), as archive reads it.
    const live = started.find((m) => !superseded(b, m) && goalOpen(m, templates)) ?? null;
    const kept = live ? new Set(aftercareKeptOf(live.feasibility)) : new Set<string>();
    const practices = live
      ? Array.from(new Set(live.items.filter((i) => i.kind === "PRACTICE" && i.templateId && !kept.has(i.templateId)).map((i) => i.templateId as string))).filter((id) => {
          const t = templates.get(id);
          return !t || t.archivedAt == null;
        })
      : [];
    // A Start racing this pause (a claim newer than any read here) makes it stale: re-read, and the STARTING row refuses.
    const lastClaim = new Date(Math.max(0, ...b.milestones.map((m) => m.startingAt?.getTime() ?? 0)));
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: b.roadmap.version } },
      { op: "guard", guard: { g: "NOTHING_STARTED_SINCE", roadmapId, since: lastClaim } },
      { op: "update", table: "roadmap", where: { id: roadmapId, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: now, pauseReason: reason || null, updatedAt: now } },
      { op: "update", table: "roadmapMilestone", where: { roadmapId, version: b.roadmap.version + 1, status: { in: ["DRAFT", "LATER"] } }, data: { status: "DISCARDED" } },
    ];
    if (live && aftercare === "KEEP") for (const templateId of practices) ops.push({ op: "keepAftercare", milestoneId: live.id, templateId });
    const out = await e.store.apply(userId, ops);
    if (out !== "ok") return "stale";
    closing = live ? { milestoneId: live.id, goalId: live.goalId, practices } : null;
    return ok({ closedMilestoneId: live?.id ?? null });
  });
  invalidate("roadmap");
  if (!res.ok) return res;
  const close = closing as { milestoneId: string; goalId: string | null; practices: string[] } | null;
  if (close) {
    // The milestone leaves Today as a drop does (its goal archived; Start again stays open), and the practices as answered.
    const errors: string[] = [];
    const targets = [...(close.goalId ? [close.goalId] : []), ...(aftercare === "ARCHIVE" ? close.practices : [])];
    for (const templateId of targets) {
      try {
        const r = await e.io.archiveTemplate(userId, templateId, now);
        if (!r.ok) errors.push(r.error);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    invalidate("life", "activity");
    if (errors.length) return fail(`The goal is paused, but its milestone stays on Today: ${errors[0]}`);
  }
  return res;
}

/**
 * The live plan's Proficiency basis, as Undo rebuilds one (a resumed goal's first reading: §23.4). null when it can't be
 * worked out (logged): the chain writes the next reading.
 */
async function liveBasisOf(e: Env, userId: string, b: RoadmapBundle, now: Date): Promise<ProficiencyBasis | null> {
  try {
    const acc = currentAcceptance(b);
    if (!acc) return null;
    const today = todayKey(now);
    const rows = planRowsOf(b);
    const rest = await e.io.restRows(userId, today, b.roadmap.targetDay);
    return e.lanes.proficiencyBasisOf({
      basisVersion: b.roadmap.version,
      endState: endStateOf(acc),
      feasibility: feasibilityOfAcceptance(acc),
      milestones: rows.map(draftOf),
      switchedOff: switchedOffOf(rows.filter(isCarried)),
      heldDays: Array.from(heldDaysOf(rest, today, b.roadmap.targetDay)),
    });
  } catch (err) {
    console.error("roadmap: the resumed goal's Proficiency basis wasn't worked out:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * [Resume] (§23.4), from PAUSED only (RESUME_ONLY_PAUSED). It needs a free seat: the goal's own when free, else the
 * lowest (seatForReopenOf), else it refuses (ANOTHER_ACTIVE while GOALS_MAX is 1, GOALS_FULL at 3); and room in the
 * week's hours (hoursOverLineOf, ruling 25). DOMAINS_FREE runs again as a tripwire. In one transaction the row turns
 * ACTIVE in that seat with the pause cleared, and the first reading after is a rebase (ProficiencyRebaseCause
 * RESUMED, "since you resumed"), never shown as a gain; the reviews done meanwhile count in the cards, but no reading
 * was written during the pause. `choices.redate` ("Move the date by 23 days?", yours) moves the aim's date by the days
 * paused, then re-dates the unstarted rows as a new version through the re-plan path (re-fit): `version` is that
 * draft's, null without one.
 */
export async function resumeRoadmapCore(
  userId: string,
  roadmapId: string,
  choices: ResumeChoices,
  now: Date,
  deps: RoadmapDeps = {}
): Promise<RoadmapActionResult<{ slot: GoalSlot; version: number | null }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const redate = !!choices && typeof choices === "object" && choices.redate === true;
  const e = envOf(deps);
  const today = todayKey(now);
  const res = await withRetry<{ slot: GoalSlot; days: number }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "PAUSED") return fail(RESUME_ONLY_PAUSED);
    const goalRows = e.goals.get(userId) ?? [];
    const seat = seatForReopenOf(goalRowOf(b.roadmap), goalRows.map((r) => goalRowOf(r)));
    if (seat == null) return fail(noSeatLine());
    const hoursLine = hoursRefusalOf(goalRows, b.roadmap.hoursPerWeek, roadmapId);
    if (hoursLine) return fail(hoursLine);
    // The tripwire: a paused goal kept its Domains, so this fails only if a path broke the reservation.
    const taken = takenDomainOf(goalRows, goalDomainsOf(b.roadmap), roadmapId);
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
    const days = b.roadmap.pausedAt ? Math.max(0, daysBetween(dayKeyOf(b.roadmap.pausedAt), today)) : 0;
    const data: Record<string, unknown> = { status: "ACTIVE", slot: seat, pausedAt: null, pauseReason: null, updatedAt: now };
    if (redate && days > 0) {
      const moved = addDays(b.roadmap.targetDay, days);
      const last = addDays(today, SPAN_MAX_DAYS);
      data.targetDay = moved > last ? last : moved;
    }
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["PAUSED"], version: b.roadmap.version } },
      { op: "guard", guard: { g: "SLOT_FREE", slot: seat, exceptId: roadmapId } },
      ...domainsFreeOps(goalDomainsOf(b.roadmap), roadmapId),
      { op: "update", table: "roadmap", where: { id: roadmapId, status: "PAUSED" }, data },
    ];
    const basis = await liveBasisOf(e, userId, b, now);
    if (basis) {
      const prof = await proficiencyFor(e, deps, userId, roadmapId, now, basis, "RESUMED", practiceNamesOf(planRowsOf(b)));
      if (prof) ops.push({ op: "readings", rows: [prof], observedAt: now });
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ slot: seat, days }) : "stale";
  });
  invalidate("roadmap");
  if (!res.ok) return res;
  let version: number | null = null;
  if (redate && res.value.days > 0) {
    // The unstarted rows re-dated as a new version (the re-plan path's re-fit); the resume stands whatever it answers.
    const re = await replanUnpointed(userId, roadmapId, "REFIT", now, deps);
    if (re.ok) version = re.value.version;
    else console.error("roadmap: the resumed goal wasn't re-dated:", re.error);
  }
  return ok({ slot: res.value.slot, version });
}

/**
 * The goal's own name (§23.1): one line of at most GOAL_LABEL_MAX (cleanGoalLabelOf); null (or nothing left once
 * cleaned) goes back to the Area's name. Distinct among DRAFT, ACTIVE and PAUSED goals (ruling 26: LABEL_CLASH), and
 * set on any of them, a paused one included. A repeat changes nothing.
 */
export async function setGoalLabelCore(userId: string, roadmapId: string, label: string | null, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (label != null && typeof label !== "string") return fail("Name the goal in words.");
  const clean = label == null ? null : cleanGoalLabelOf(label);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!holdsGoal(b.roadmap)) return fail("This roadmap is closed.");
    if ((b.roadmap.label ?? null) === clean) return ok(null);
    const tree = await e.io.fieldTree();
    if (labelClashFor(e.goals.get(userId) ?? [], tree, { ...b.roadmap, label: clean }, roadmapId)) return fail(LABEL_CLASH);
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: [b.roadmap.status as RoadmapStatus] } },
      { op: "update", table: "roadmap", where: { id: roadmapId }, data: { label: clean, updatedAt: now } },
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

/**
 * The roadmap a view shows (revision 5, §23.5): the goal `roadmapId` names when it is one of the user's rows (a
 * forged or another user's id never reads: the rows are the user's own), else the lowest-seat open goal, else the
 * latest paused one, else the latest done or archived (a discarded draft never). One open goal: that one, as today.
 */
function pickRoadmap(rows: readonly RoadmapRec[], roadmapId: string | null = null): RoadmapRec | null {
  const shown = (r: RoadmapRec) => !(r.status === "ARCHIVED" && r.archiveReason === DISCARDED_REASON);
  if (roadmapId != null) {
    const named = rows.find((r) => r.id === roadmapId && shown(r));
    if (named) return named;
  }
  const sorted = [...rows].sort(latestFirst);
  return (
    [...rows].filter(isOpen).sort(byOpenSeat)[0] ??
    sorted.find((r) => r.status === "PAUSED") ??
    sorted.find((r) => r.status === "DONE" || (r.status === "ARCHIVED" && r.archiveReason !== DISCARDED_REASON)) ??
    null
  );
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

/**
 * The Aim header as the views carry it: RoadmapHeader and the practice family
 * in force (the lead's ruling 7; contracts §20.11). On a Field Area that is
 * roadmap-catalog practiceFamilyOf over the stored intake (the user's answer,
 * else code's reading of the aim and the exam's name), the family every plan
 * path, the server's pickIsDefaultOf and the accept blocker read, so the page
 * (DraftReview: `"practiceFamily" in h`) never falls back to the aim's prefill
 * when the user answered otherwise; null on a track Area (its track's table).
 */
export type RoadmapHeaderView = RoadmapHeader & { practiceFamily: PracticeFamily | null };

function headerOf(e: Env, v: ViewData): RoadmapHeaderView {
  const r = v.b.roadmap;
  const acc = currentAcceptance(v.b);
  let nonEnglish = false;
  try {
    nonEnglish = e.lanes.isNonEnglish(r.aim);
  } catch {
    nonEnglish = false;
  }
  let practiceFamily: PracticeFamily | null = null;
  try {
    practiceFamily = r.fieldId != null ? practiceFamilyOf(intakeOf(r)) : null;
  } catch {
    practiceFamily = null;
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
    // The practice family in force (the lead's ruling 7): the one the plan's progression and its pick decisions read.
    practiceFamily,
    // Revision 5 (§23.4, §23.5; ruling 55): the goal's seat (none on a PAUSED, DONE or ARCHIVED goal), its own name, and a pause.
    slot: shownSlotOf(r),
    label: r.label ?? null,
    paused: r.status === "PAUSED" ? { since: r.pausedAt ? dayKeyOf(r.pausedAt) : v.today, reason: r.pauseReason ?? null } : null,
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
  const seen: { kind: string; status: string; fallback: string | null; phase: string | null }[] = [];
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
    seen.push({ kind: r.kind, status: r.status, fallback, phase: r.phase ?? null });
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
    if (runWriterOf({ kind: r.kind, status: r.status, fallback, phase: r.phase ?? null })) break;
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
    // A topic step runs one invocation and goes stale at TOPIC_RUN_STALE_MS (ruling 47); a LEVELS run at RUN_STALE_MS.
    stale: run.status === "RUNNING" && now.getTime() - run.startedAt.getTime() >= (chainPhaseOf(run) ? t5.TOPIC_RUN_STALE_MS : RUN_STALE_MS),
    ...(chainPhaseOf(run) ? { phase: chainPhaseOf(run) } : {}),
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
 * ("kept 10 of 16 so far"). A practice off its milestone's target (ruling 3:
 * its measure stopped paying when the user said to avoid it) is planned only
 * up to the day before its pause (offTargetDayOf), so nothing is asked of it
 * from that day. null when no reading holds it.
 */
function practiceSoFarOf(
  v: Pick<ViewData, "readings" | "today" | "pastHeld" | "b" | "templates">,
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
  const pausedFrom = x.role === "PAYS" ? null : offTargetDayOf(v, it, r);
  const due = m.dueDay && m.dueDay < v.today ? m.dueDay : v.today;
  const to = pausedFrom && addDays(pausedFrom, -1) < due ? addDays(pausedFrom, -1) : due;
  const of = to < m.startedDay ? 0 : plannedUnits(practiceRule(it), { from: m.startedDay, to, startDay: m.startedDay }, v.pastHeld);
  return { kept, of };
}

/**
 * The day a started practice stopped counting toward its milestone (ruling
 * 3; its PRACTICE_KEPT measure CONTEXT, offTargetOpsOf): the day the user
 * said to avoid its kind (the card's AVOID), else the day its task was
 * paused, else the day after its measure's last reading (R1 reads it no
 * more). The page's "paused because you said to avoid it" reads the same
 * AVOID row.
 */
function offTargetDayOf(v: Pick<ViewData, "b" | "templates">, it: ItemDraft, last: Pick<Reading, "day">): DayKey {
  const avoided = isCatalogKey(it.catalogKey) ? activityConfirmOf(v.b.roadmap.coverage)?.kinds[it.catalogKey] : undefined;
  if (avoided?.verdict === "AVOID" && avoided.day) return avoided.day;
  const archivedAt = it.templateId ? v.templates.get(it.templateId)?.archivedAt : null;
  return archivedAt ? dayKeyOf(archivedAt) : addDays(last.day, 1);
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
    // Revision 5, lane 8 (ruling 50): the plan kind's cap (TOPICS 8; LEVELS MAX_MILESTONES, as before).
    maxScheduled: Math.min(milestoneCapOf(kindOfRow(b.roadmap)) || MAX_MILESTONES, maxScheduledPositionsOf(b.milestones)),
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
        // A practice off the target (ruling 3: the user said to avoid it) has no pace: nothing more is asked of it.
        measureRowOfView(e, v, d, x, carried && x.role === "PAYS" ? paceOfMeasure(e, ctx, v.readings, { dueDay: due, reachedDay: m.reachedDay, startedDay: m.startedDay, items: d.items }, x, v.pastHeld) : null)
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
  // Revision 5: a TOPICS draft with no milestone yet (before its first map, nothing chosen, or a pace still to give)
  // still has a view: its map (DraftView.topicMap), the estimate chip, the bands and [Write one]; never a dead end.
  const emptyTopics = group.length === 0 && isTopicsDraft(b);
  if (group.length === 0 && !emptyTopics) return null;
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
    if (emptyTopics) throw new Error("no milestone to check");
    feasibility = feasibilityFor(e, ctx, drafts, carried);
  } catch {
    feasibility = { today: ctx.today, m: ctx.m, milestones: [], aimCheck: { kind: "unchecked" }, basis: [], remedies: [], impossible: false, over: false };
  }
  // The total acceptCore checks against MAX_MILESTONES: positions over the carried rows and the draft's scheduled ones.
  const viewGate = planGateOf(e, b.roadmap).gate;
  const check = acceptBlockersOf(drafts, feasibility, total, { picksNeedConfirm: picksNeedConfirmOf(b.roadmap), gate: viewGate, pickIsDefault: pickIsDefaultOf(b.roadmap, viewGate) });
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
  // Revision 5, lane 8: a TOPICS draft shows its map and rating (DraftView.topicMap), never a LEVELS depth view.
  const depth = isTopicsDraft(b) ? null : depthOf(b.roadmap);
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
    // What the gate leaves out because of the user's words (contracts §19): the same gate the draft was built with.
    exclusions: leftOutOf(planGateOf(e, b.roadmap)),
    sessionPicks: sessionPicksOf(b, drafts),
    aimConflict: aimConflictFor(e, b),
    gaps: ROADMAP_GAPS_LIVE ? gapViewsOf(b, ctx, drafts) : [],
    // "n not shown" counts every gap name not shown: the hidden (ungrounded or flagged) and the dropped (links, non-names).
    gapsHidden: gapsNotShownOf(facts.report?.integrity),
    additions: additionsOf(e, b, ctx, drafts, required),
    additionsMode: isCredentialAim(b.roadmap.aim, b.roadmap.examLabel) || b.roadmap.examLabel || nonEnglish ? "TOGGLES" : "BULK",
    unassignedLines,
    dateCheck: feasibility.dateCheck ?? null,
    depth: depth != null ? depthViewFor(e, ctx, b, required, depth, feasibility, group) : null,
    legacy: null,
    // Confirm to unlock (contracts §19): the card, from the gate every plan path reads.
    activityConfirm: activityConfirmFor(e, b.roadmap),
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

// ═══ Confirm to unlock (contracts §19; lane R4's half) ═════════════════════
//
// Constraint safety never rests on the parser catching a phrasing. Every plan
// path here — the code-built starter and stage ladder (ladderOf,
// starterPlan), the Gemini keys-only placement (planFromReply), every re-fit
// and re-plan (stagePracticesOf, rewrite, applyRemedyCore, replanCore,
// lowerDepthCore and the redrafts), a pick from the type list
// (catalogPickOf), Start (startPreview, startMilestoneCore, finishStartCore)
// and the week quests (Start's set, the bar's seam) — reads ONE gate,
// roadmap-catalog allowedKindsFor over the plan's words and the user's stored
// answers (planGateOf), and places no kind it blocks. The lead's rules
// (safety-gaps round): every BODY or CARE plan asks once, whatever the user
// wrote; a CRAFT plan asks on a cue; a Field Area and DUTY never ask. Until
// the card is answered under the current words only the track's safe kinds
// are placed (CARE's are planning the week and keeping a log, so a waiting
// CARE plan is never empty), and every refusal meanwhile points at the card
// (pointedAt). The parser's exclusions only suggest (a pre-ticked box). The
// answer is the user's own (setActivityVerdictsCore, YOURS): an explicit act
// carrying the words' key (a stale key asks again), stored in
// Roadmap.coverage through coverageJsonOf. An AVOID given after Start pauses
// the started practice's Today task (archived through tasks.ts, undone with
// unarchiveTask); a kept pick or the user's own row of a kind that waits
// again is held (Start, the quests and accept read every live row).

/** A plan's gate: what it read (the user's words and the parser's pre-fill) and roadmap-catalog allowedKindsFor's answer. */
export interface PlanGate {
  state: ConstraintsState;
  gate: ActivityGate;
}

/**
 * One gate per roadmap row as read (a re-read is a new row) and the user's goals as read with it (Env.goals: a fresh
 * read of the other goals is a new list): every path over one read sees the same answer.
 */
const planGates = new WeakMap<RoadmapRec, { goals: readonly RoadmapRec[] | undefined; pg: PlanGate }>();

/** A goal's stored AVOIDs (its card's answer in Roadmap.coverage["$activities"]): what another goal's card reads. */
function storedAvoidsOf(r: RoadmapRec): GoalAvoids["kinds"] {
  const kinds = activityConfirmOf(r.coverage)?.kinds ?? {};
  const out: GoalAvoids["kinds"] = {};
  for (const [k, v] of Object.entries(kinds) as [CatalogKey, NonNullable<GoalAvoids["kinds"][CatalogKey]>][]) if (v && v.verdict === "AVOID") out[k] = v;
  return out;
}

/**
 * The user's other goals as one person's gate reads them (contracts §23.6), from the goals read beside this row
 * (Env.goals): every other DRAFT, ACTIVE and PAUSED goal's texts (cueTextsOf of its intake: constraints, aim and
 * notes) in seat order (the shown seat ascending, none last, then the id; a PAUSED goal's seat is null: ruling 55),
 * and every other goal's stored AVOIDs: the open ones lock, and DONE and ARCHIVED ones (a discarded draft aside) are
 * read only once GOALS_MAX > 1 (ruling 57: no card is pre-ticked from an archived roadmap before lane 4's copy).
 * null with no other goal, so one goal's gate is today's, byte for byte.
 */
function otherGoalsOfGate(e: Env, roadmap: RoadmapRec): { texts: GoalCueTexts[]; avoids: GoalAvoids[] } | null {
  const rows = (e.goals.get(roadmap.userId) ?? []).filter((r) => r.id !== roadmap.id);
  const holding = rows.filter(holdsGoal).sort(bySeatOrder);
  const closed = GOALS_MAX > 1 ? rows.filter((r) => r.status === "DONE" || (r.status === "ARCHIVED" && r.archiveReason !== DISCARDED_REASON)).sort(bySeatOrder) : [];
  if (holding.length === 0 && closed.length === 0) return null;
  const texts: GoalCueTexts[] = holding.map((r) => ({ roadmapId: r.id, slot: shownSlotOf(r), texts: cueTextsOf(intakeOf(r)) }));
  const avoids: GoalAvoids[] = [...holding, ...closed].map((r) => ({
    roadmapId: r.id,
    slot: shownSlotOf(r),
    status: r.status as RoadmapStatus,
    track: catalogTrackOf(intakeOf(r)),
    kinds: storedAvoidsOf(r),
  }));
  return { texts, avoids };
}

/**
 * The parser's exclusions the gate reads (its pre-fill, never an unlock;
 * contracts §19.4): R3's constraintExclusionsOf over the track's offered
 * kinds, with each kind's OWN words only (its keywords and template words:
 * no Domain name, aim or exam filled in), so a term the plan fills into
 * every label ("Inference is too hard", "Mum's care is too much") never
 * names a kind (the verifier's finding #1; R3 fixes the parser, and this
 * reading holds meanwhile). On a BODY or CARE plan the gated kinds — held
 * until the user's answer whatever the parser reads — are also pre-ticked
 * through their filled labels ("no running" against "Do a full attempt at:
 * Run a 10K"): a pre-tick only, never a block of its own. A parser that
 * throws pre-fills nothing (logged): the gate still holds every gated kind
 * on its own reading of the words.
 */
function gateExclusionsOf(e: Env, intake: Intake): ConstraintExclusion[] {
  const constraints = intake.constraints;
  if (!constraints || !constraints.trim()) return [];
  const track = catalogTrackOf(intake);
  const filter = { track, exam: !!intake.examLabel, practicesAllowed: intake.fieldId == null || intake.practicesAllowed };
  const kinds = [...catalogKindsFor("PRACTICE", filter), ...catalogKindsFor("STEP", filter), ...catalogKindsFor("CHECKPOINT", filter)];
  const out: ConstraintExclusion[] = [];
  try {
    out.push(...e.lanes.constraintExclusionsOf(constraints, kinds, { track, domains: [], aim: null, exam: null }));
  } catch (err) {
    console.error("roadmap: the constraint exclusions weren't worked out (nothing pre-filled):", err instanceof Error ? err.message : err);
  }
  const gated = new Set<string>(cueGatedKindsOf(track));
  if (gated.size > 0) {
    try {
      const seen = new Set<string>(out.map((x) => x.kind));
      const filled = e.lanes.constraintExclusionsOf(constraints, kinds.filter((k) => gated.has(k)), { track, domains: [], aim: intake.aim, exam: intake.examLabel });
      for (const x of filled) if (gated.has(x.kind) && !seen.has(x.kind)) out.push(x);
    } catch (err) {
      console.error("roadmap: the gated kinds' pre-fill wasn't worked out:", err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/**
 * THE gate of a roadmap as read (contracts §19): constraintsStateOfIntake over
 * the row's intake (its words, track, exam and practices) with the parser's
 * pre-fill (gateExclusionsOf), then allowedKindsFor with the user's stored
 * answers. Pure over the row and the user's goals read with it; one per row
 * object and goals list.
 *
 * Revision 5 (contracts §23.6 items 1–7): the inputs are user-wide. The other
 * goals' texts ride CueTexts.others (so on CRAFT the card asks when any open
 * goal's words carry a cue: goal 1's wrist surgery gates goal 3's drills, and
 * the key turns "k3-") and their AVOIDs ConstraintsState.others (a kind
 * another open goal avoids on this track, or on every track, is blocked and
 * locked here: lifting it happens only on the goal that stored it). With no
 * other goal the call is today's, byte for byte.
 */
function planGateOf(e: Env, roadmap: RoadmapRec): PlanGate {
  const goalsRead = e.goals.get(roadmap.userId);
  const hit = planGates.get(roadmap);
  if (hit && hit.goals === goalsRead) return hit.pg;
  const intake = intakeOf(roadmap);
  const others = otherGoalsOfGate(e, roadmap);
  const state = others ? constraintsStateOfIntake(intake, gateExclusionsOf(e, intake), others) : constraintsStateOfIntake(intake, gateExclusionsOf(e, intake));
  const out: PlanGate = { state, gate: allowedKindsFor(state, intake.activities ?? null) };
  planGates.set(roadmap, { goals: goalsRead, pg: out });
  return out;
}

/** The gate of a plan context (its roadmap row). */
const gateOf = (e: Env, ctx: Pick<PlanContext, "roadmap">): ActivityGate => planGateOf(e, ctx.roadmap).gate;

/**
 * A refusal while the activity card waits points at it (decision 2: a
 * waiting plan is never a dead end): roadmap-catalog withActivityPointer,
 * unless the message already names the card (ACTIVITY_WAITING_PICK,
 * ACTIVITY_WAITING_START), so the card is never named twice.
 */
const pointedAt = (gate: Pick<ActivityGate, "on" | "pending"> | null | undefined, message: string): string =>
  !gate || message.includes(ACTIVITY_CARD_NAME) ? message : withActivityPointer(gate, message);

/**
 * Decision 2 as the lead ruled it (contracts §19): every refusal while the
 * activity card waits points at it — re-plan (replanCore), the review's
 * edits (editItemCore, decideItemCore, addItemCore, keepUnflaggedCore,
 * resolveDomainCore, moveLineCore, setLineDomainCore, applyRemedyCore,
 * confirmSessionPicksCore, confirmDomainAdditionsCore, lowerDepthCore,
 * keepCalibratedDatesCore) and the builds (buildStarterCore,
 * startManualCore, claimDraftCore), as well as accept and Start. A core's
 * refusal on a roadmap comes back through here: the roadmap's row is read
 * again only when the core refused (`ref`: the roadmap, or an item or
 * milestone of it), and pointedAt adds the pointer while its gate (as it
 * reads now) holds kinds waiting on the answer; a refusal that already
 * names the card is never pointed twice. Unchanged with writes off (nothing
 * is read), when the roadmap isn't the user's or can't be read, and when no
 * card waits.
 */
async function pointedRefusal<T>(deps: RoadmapDeps, userId: string, ref: { roadmapId: string } | { ref: string }, res: RoadmapActionResult<T>): Promise<RoadmapActionResult<T>> {
  if (res.ok || writesOff(deps) || res.error.includes(ACTIVITY_CARD_NAME)) return res;
  try {
    const e = envOf(deps);
    const roadmapId =
      "roadmapId" in ref ? ref.roadmapId : typeof ref.ref === "string" && STEP_REF.test(ref.ref) ? ((await e.store.ownerOf(userId, { itemId: ref.ref })) ?? (await e.store.ownerOf(userId, { milestoneId: ref.ref }))) : null;
    const row = typeof roadmapId === "string" ? (await e.store.listRoadmaps(userId)).find((r) => r.id === roadmapId) : undefined;
    return row ? fail(pointedAt(planGateOf(e, row).gate, res.error)) : res;
  } catch (err) {
    console.error("roadmap: a refusal wasn't pointed at the activity card:", err instanceof Error ? err.message : err);
    return res;
  }
}

/** An item a plan path placed (code's starter or requirement, or Gemini's pick), not a decision of the user's (YOURS: picked, edited or checked). */
const placedByPlan = (i: Pick<ItemDraft, "origin" | "decision">): boolean => provenanceOf(i.origin, i.decision) !== "YOURS";

/**
 * A plan's rows through the gate (contracts §19), pure: on every row not
 * carried (DRAFT, LATER, PLANNED), a live item of a kind the gate blocks
 * leaves — dropped when a plan path placed it, REMOVED (kept as a row) when
 * it was the user's own and they now say avoid. A row of the user's own
 * (a Gemini pick they kept, a type they picked) of a kind that waits on
 * their answer again (their words changed since the card was answered)
 * stays as their decision but is held (decision 5): Start holds it back
 * (heldAtStartOf), the week quests skip it, and accept refuses the draft
 * until the card is answered (acceptBlockersOf reads every live row). A
 * changed row's measures follow (syncMeasures). Carried rows are never
 * touched.
 */
export function gatePlanRows(plan: readonly MilestoneDraft[], gate: Pick<ActivityGate, "blocked" | "rows">, trackArea: boolean, makeId: () => string): MilestoneDraft[] {
  const avoided = new Set<string>(gate.rows.filter((r) => r.state === "AVOID").map((r) => r.kind));
  return plan.map((m) => {
    if (m.status === "STARTING" || m.status === "STARTED") return m;
    let changed = false;
    const items: ItemDraft[] = [];
    for (const it of m.items) {
      if (!liveItem(it) || isPlaceableKind(gate, it.catalogKey)) items.push(it);
      else if (placedByPlan(it)) changed = true;
      else if (avoided.has(it.catalogKey as string)) {
        changed = true;
        items.push({ ...it, decision: "REMOVED" });
      } else items.push(it);
    }
    return changed ? syncMeasures({ ...m, items }, trackArea, makeId) : m;
  });
}

/**
 * What the draft leaves out because of the user's words (DraftView.exclusions,
 * "Left out because of your constraints: …"): each kind the parser named
 * that the gate blocks, with its word, in the gate's order. A suggestion
 * the gate doesn't block (WORDS) or a kind the user's answer released is
 * placed, so it isn't listed.
 */
function leftOutOf(pg: PlanGate): ConstraintExclusion[] {
  const blocked = new Set<string>(pg.gate.blocked);
  return pg.state.prefill.filter((p) => blocked.has(p.kind)).map((p) => ({ kind: p.kind, word: p.word }));
}

/** The confirm card's view (DraftView/RoadmapView.activityConfirm): the gate's, while it asks or holds an answer; null when there is nothing to show. */
function activityConfirmFor(e: Env, roadmap: RoadmapRec): DraftView["activityConfirm"] {
  try {
    const pg = planGateOf(e, roadmap);
    const view = activityConfirmViewOf(pg.state, pg.gate);
    return view.on || view.rows.length > 0 ? view : null;
  } catch (err) {
    console.error("roadmap: the confirm card wasn't worked out:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The aim itself meets a negated constraint term (R3's aimConflictOf); null
 * when none or unreadable, and null once the user answered the activity card
 * under these words (decision 6: the line shows only while the conflict is
 * unresolved; their answer decides what the plan leaves out).
 */
function aimConflictFor(e: Env, b: RoadmapBundle): DraftView["aimConflict"] {
  if (!b.roadmap.constraints) return null;
  try {
    if (planGateOf(e, b.roadmap).gate.answered != null) return null;
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
  // Revision 5 (lane 7's handoff; §22.12): a live TOPICS plan reads Paragon by the TOPICS rule at its TopicDepth (6 included).
  const topics = kindOfRow(b.roadmap) === "TOPICS";
  return {
    depth: topics ? topicDepthOfRow(b.roadmap) : depthOf(b.roadmap),
    track: b.roadmap.fieldId == null,
    hasStandard: hasStandardOf(rows),
    keptStages: positionCountOf(kept),
    spanDays: daysBetween(b.roadmap.startDay, b.roadmap.targetDay),
    coverageBelowPolicy,
    productionPlannedFromFluent: productionFromFluentOf(rows),
    ...(topics ? { planKind: "TOPICS" as const } : {}),
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

async function loadRoadmapViewUncached(userId: string, now: Date, deps: RoadmapDeps, roadmapId: string | null = null): Promise<RoadmapView> {
  const e = envOf(deps);
  const today = todayKey(now);
  let rows: RoadmapRec[];
  try {
    rows = await e.store.listRoadmaps(userId);
  } catch (err) {
    if (isMissingRoadmapTable(err)) return emptyView(today, deps, e);
    throw err;
  }
  const pick = pickRoadmap(rows, roadmapId);
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
    // This goal's week (§23.3: one set per goal); a PAUSED goal freezes and shows none.
    b.roadmap.status === "ACTIVE" ? e.lanes.loadWeekQuests(userId, now, questOptsOf(rows, b.roadmap.id)).catch(() => null) : Promise.resolve(null),
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
  // The accept sheet's other goals (§23.3, ruling 54): each ACTIVE goal that accepting this draft turns TIGHT or OVER.
  if (draft && b.roadmap.status === "DRAFT") {
    const otherGoals = await otherGoalsVerdictsOf(e, userId, b.roadmap, now);
    if (otherGoals) draft.otherGoals = otherGoals;
  }
  // Revision 5, lane 8 (§22.14 Loaders): a TOPICS plan's or draft's map, rating, cautions and NamedPart payloads (LEVELS: the view itself).
  const view = withTopicViews(e, b, ctx, roadmapViewOfData(e, deps, v, ctx, { today, run, acceptedRun, draft, throughput, wq, pastWeeks, aftercare, weight }), today);
  // The goal switcher (§23.7; lane 4 renders it): absent with one goal while GOALS_MAX is 1, so that page is today's.
  const goals = await goalSwitcherOf(e, userId, b, now);
  // Revision 5, lane 10 (fix round; ruling 47): a TOPICS draft's Gemini chain, which the page's poll drives step by step.
  return withTopicChainView(goals ? { ...view, goals } : view, await topicChainViewFor(e, deps, userId, b, now));
}

/**
 * The goal switcher (RoadmapView.goals, §23.7's GoalSwitcherView): one pill per open goal in seat order (its label,
 * yours or the Area's name, never the model's; its rank and its latest Proficiency), `canAdd` while fewer than
 * GOALS_MAX goals are open (ruling 53, never the fixed 3), and the paused goals, then the done and archived ones (a
 * discarded draft never), folded into "Other goals". null while GOALS_MAX is 1 and the user holds no other DRAFT,
 * ACTIVE or PAUSED goal. A goal whose rank or Proficiency can't be read shows none (logged).
 */
async function goalSwitcherOf(e: Env, userId: string, current: RoadmapBundle, now: Date): Promise<GoalSwitcherView | null> {
  const rows = e.goals.get(userId) ?? [];
  if (GOALS_MAX === 1 && !rows.some((r) => r.id !== current.roadmap.id && holdsGoal(r))) return null;
  const today = todayKey(now);
  const tree = await e.io.fieldTree();
  const seated = seatedOf(rows);
  const open = rows.filter(isOpen).sort(byOpenSeat);
  const pills: GoalPillView[] = [];
  for (const r of open) {
    const slot = seated.get(r.id);
    if (slot == null) continue;
    const label = goalLabelOf(goalRowOf(r, tree));
    let rankIndex: number | null = null;
    let proficiency: number | null = null;
    try {
      const b = r.id === current.roadmap.id ? current : await e.store.bundle(userId, r.id);
      if (b && b.roadmap.status === "ACTIVE") rankIndex = e.lanes.aimRankOf(rankInputOf(b, planRowsOf(b), today)).index;
      const key = proficiencyKey(r.id);
      const latest = latestOf(await e.store.readings(userId, [key], addDays(today, -READINGS_LOOKBACK_DAYS)), key, today);
      proficiency = latest && Number.isFinite(latest.value) ? Math.max(0, Math.min(1, latest.value)) : null;
    } catch (err) {
      console.error("roadmap: a goal's pill wasn't read in full:", err instanceof Error ? err.message : err);
    }
    pills.push({ roadmapId: r.id, slot, label: label.text, labelIsYours: label.yours, status: r.status as RoadmapStatus, rankIndex, proficiency, current: r.id === current.roadmap.id });
  }
  const other = [
    ...rows.filter((r) => r.status === "PAUSED").sort(latestFirst),
    ...rows.filter((r) => r.status === "DONE" || (r.status === "ARCHIVED" && r.archiveReason !== DISCARDED_REASON)).sort(latestFirst),
  ];
  return { pills, canAdd: open.length < GOALS_MAX, other: { count: other.length, roadmapIds: other.map((r) => r.id) } };
}

/**
 * The week quests' options for one goal (§23.3): its roadmap named while the user has another open goal; with one, the
 * loader's own pick (the lowest seat: the one goal), so a one-goal load is today's.
 */
function questOptsOf(rows: readonly RoadmapRec[], roadmapId: string): { roadmapId?: string } {
  return rows.some((r) => r.id !== roadmapId && isOpen(r)) ? { roadmapId } : {};
}

/** A plan's verdict as one word (GoalVerdictChange): IMPOSSIBLE, the date check's on a depth plan, else OVER, TIGHT or FITS over its milestones. */
function goalVerdictOf(f: Feasibility): DateVerdict {
  if (f.impossible) return "IMPOSSIBLE";
  if (f.dateCheck?.verdict) return f.dateCheck.verdict;
  if (f.over || f.milestones.some((m) => m.worst === "OVER" || m.time.verdict === "OVER")) return "OVER";
  return f.milestones.some((m) => m.worst === "TIGHT" || m.time.verdict === "TIGHT") ? "TIGHT" : "FITS";
}

const VERDICT_RANK: Readonly<Record<DateVerdict, number>> = { FITS: 0, TIGHT: 1, OVER: 2, IMPOSSIBLE: 3 };

/**
 * The verdict re-run (§23.3, ruling 54): each other ACTIVE goal's plan worked out again with the shares as they stand
 * (this draft counted) and without this draft, listing every goal that turns TIGHT or OVER (or worse): "Goal 1
 * becomes tight · [Re-date goal 1]". Dates never move here; re-dating is that goal's own re-plan. null with no other
 * ACTIVE goal (the draft view carries no list: one goal is today's view); a goal that can't be worked out is left out
 * (logged).
 */
async function otherGoalsVerdictsOf(e: Env, userId: string, draft: RoadmapRec, now: Date): Promise<GoalVerdictChange[] | null> {
  const others = (e.goals.get(userId) ?? []).filter((r) => r.id !== draft.id && r.status === "ACTIVE").sort(bySeatOrder);
  if (others.length === 0) return null;
  const out: GoalVerdictChange[] = [];
  for (const r of others) {
    try {
      const ob = await e.store.bundle(userId, r.id);
      if (!ob || ob.roadmap.status !== "ACTIVE" || legacyOf(ob)) continue;
      const ctx = await planContext(e, userId, ob.roadmap, now, coveragePriorOf(ob));
      const goals = await carriedGoalsOf(e, userId, ob);
      const unstarted = planRowsOf(ob).filter((m) => !isCarried(m) && !dormantCopy(ob, m, goals));
      const plan = [...carriedPlanOf(ob, unstarted, goals), ...unstarted.map(draftOf)];
      const before = sharesFor(e, ob.roadmap, draft.id);
      const to = goalVerdictOf(e.lanes.feasibilityOf(plan, realismInputOf(ctx, plan)));
      const from = goalVerdictOf(e.lanes.feasibilityOf(plan, realismInputOf({ ...ctx, share: before.share, fieldShare: before.fieldShare }, plan)));
      if (VERDICT_RANK[to] >= VERDICT_RANK.TIGHT && VERDICT_RANK[to] > VERDICT_RANK[from]) {
        out.push({ roadmapId: r.id, slot: shownSlotOf(ob.roadmap), label: goalLabelOf(goalRowOf(ob.roadmap, ctx.tree)).text, from, to });
      }
    } catch (err) {
      console.error("roadmap: another goal's verdict wasn't worked out again:", err instanceof Error ? err.message : err);
    }
  }
  return out;
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
  // A PAUSED goal reads as ACTIVE with RoadmapHeader.paused set (ruling 66), never the "DRAFT" fallback.
  let state: RoadmapViewState = status === "ACTIVE" || status === "PAUSED" ? "ACTIVE" : status === "DONE" ? "DONE" : status === "ARCHIVED" ? "ARCHIVED" : "DRAFT";
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
  // Revision 5, lane 8: a TOPICS plan shows its rating and map (RoadmapView.topicMap), never a LEVELS depth view.
  const depth = kindOfRow(b.roadmap) === "TOPICS" ? null : depthOf(b.roadmap);
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
    // A paused goal has no triggers (§23.4): nothing is measured while it waits.
    triggers: status === "PAUSED" ? [] : triggersFor(e, v, ctx, wq?.set ?? null),
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
    // Confirm to unlock (contracts §19): the answers stay editable for the life of the plan (open plans only, and a
    // paused goal's: an AVOID is lifted only on the goal that stored it, §23.6 item 5, ruling 66).
    activityConfirm: status === "DRAFT" || status === "ACTIVE" || status === "PAUSED" ? activityConfirmFor(e, b.roadmap) : null,
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
        // Revision 5 (lane 9's handoff): DomainRow's pv.named reads these; absent unless the Domain has an origin.
        ...(typeof d.nameOrigin === "string" ? { nameOrigin: d.nameOrigin, originName: d.originName ?? null } : {}),
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

/** /you/roadmap (one goal: `roadmapId`, else the lowest seat's), cached 'roadmap:<user>:<roadmapId>:<today>' on ['roadmap', 'fields', 'ideas', 'life', 'activity']; one read wave; writes nothing. */
export async function loadRoadmapView(userId: string, now: Date, deps: RoadmapDeps = {}, roadmapId: string | null = null): Promise<RoadmapView> {
  if (deps.store) return loadRoadmapViewUncached(userId, now, deps, roadmapId);
  // Revision 5 (§23.5): one entry per goal shown (`?goal=<id>`; null: the lowest seat's).
  return cached(`roadmap:${userId}:${roadmapId}:${todayKey(now)}`, ["roadmap", "fields", "ideas", "life", "activity"], () => loadRoadmapViewUncached(userId, now, deps, roadmapId));
}

async function loadAimCardUncached(userId: string, now: Date, deps: RoadmapDeps): Promise<AimCardView | null> {
  const cards = await loadAimCardsUncached(userId, now, deps, false);
  return cards == null ? null : (cards[0] ?? null);
}

/**
 * The Aim cards (revision 5, §23.5): one per open goal (DRAFT and ACTIVE) in seat order (`all`), or the lowest seat's
 * alone (loadAimCard); with no open goal, the one card: the latest paused goal's (ACTIVE with `paused`), else today's
 * (a DONE roadmap for AIM_DONE_SHOW_DAYS after it ended, else EMPTY with the last aim). null on a missing table.
 */
async function loadAimCardsUncached(userId: string, now: Date, deps: RoadmapDeps, all: boolean): Promise<AimCardView[] | null> {
  const e = envOf(deps);
  const today = todayKey(now);
  let rows: RoadmapRec[];
  try {
    rows = await e.store.listRoadmaps(userId);
  } catch (err) {
    if (isMissingRoadmapTable(err)) return null;
    throw err;
  }
  const open = rows.filter(isOpen).sort(byOpenSeat);
  // A DONE roadmap leads the card only for AIM_DONE_SHOW_DAYS after it ended (F-R4-2); after that the card asks for the next aim.
  const latestDone = [...rows].filter((r) => r.status === "DONE").sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0))[0] ?? null;
  const doneRecent = !!latestDone && (!latestDone.doneAt || daysBetween(dayKeyOf(latestDone.doneAt), today) < AIM_DONE_SHOW_DAYS);
  // With no open goal, a paused one leads (its card reads "paused since …"), else a fresh DONE one, as today.
  const paused = [...rows].filter((r) => r.status === "PAUSED").sort(latestFirst)[0] ?? null;
  const fallback = open.length ? null : (paused ?? (doneRecent ? latestDone : null));
  // LifeSettings.aimSuggestions (one indexed select; null: never set, on). A missing column reads as null (the migration's insurance).
  const settings = await e.io.aimSettings(userId).catch((err: unknown) => {
    if (!isMissingRev4Column(err)) console.error("roadmap: aim suggestions setting unavailable (read as on):", err instanceof Error ? err.message : err);
    return null;
  });
  const base = aimCardBaseOf(e, deps, settings?.aimSuggestions ?? null);
  const picks = open.length ? (all ? open : open.slice(0, 1)) : fallback ? [fallback] : [];
  if (picks.length === 0) return [{ ...base, lastAim: latestDone ? await lastAimOf(e, userId, latestDone, today) : null }];
  const cards: AimCardView[] = [];
  for (const pick of picks) {
    const b = await e.store.bundle(userId, pick.id);
    if (!b) {
      cards.push(base);
      continue;
    }
    const active = b.roadmap.status === "ACTIVE";
    const [v, wq, ctx] = await Promise.all([
      viewData(e, userId, b, now, deps),
      active ? e.lanes.loadWeekQuests(userId, now, questOptsOf(rows, b.roadmap.id)).catch(() => null) : Promise.resolve(null),
      // The milestone line's projection reads today's card states, pass rate and pace (cached loaders).
      active ? planContext(e, userId, b.roadmap, now).catch(() => null) : Promise.resolve(null),
    ]);
    cards.push(aimCardOfData(e, deps, base, v, ctx, wq, today));
  }
  return cards;
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
    // Revision 5 (§23.5; ruling 55): the goal's seat (none once paused or closed) and its own name.
    slot: shownSlotOf(r),
    label: r.label ?? null,
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
  // A PAUSED goal's card reads as ACTIVE with `paused` set ("paused since 6 Oct", never "behind"; ruling 66): its
  // Proficiency frozen as last measured, no milestone line, no week quests.
  if (r.status === "PAUSED") {
    return { ...card, state: "ACTIVE", rank, proficiency: proficiencyView, milestone: null, measuredAt: proficiencyView?.measuredAt ?? card.measuredAt, weekQuests: null, questWeekUnfrozen: false, paused: { since: r.pausedAt ? dayKeyOf(r.pausedAt) : today } };
  }
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
 * /you's Aim cards (revision 5, §23.5, §23.7): one per open goal in seat order, each its own goal's (its rank,
 * Proficiency, milestone and week), never a blend; with no open goal, the one card loadAimCard shows. [] on a missing
 * table or column. loadAimCard keeps answering the lowest seat's card. Cached 'aimCards:<user>:<today>' on the
 * same tags. Writes nothing.
 */
export async function loadAimCards(userId: string, now: Date, deps: RoadmapDeps = {}): Promise<AimCardView[]> {
  try {
    const cards = deps.store
      ? await loadAimCardsUncached(userId, now, deps, true)
      : await cached(`aimCards:${userId}:${todayKey(now)}`, ["roadmap", "ideas", "life", "activity"], () => loadAimCardsUncached(userId, now, deps, true));
    return cards ?? [];
  } catch (err) {
    if (isMissingRoadmapTable(err) || isMissingRev4Column(err)) return [];
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
  // Revision 5 (§23.5): the lowest seat's open goal (one open goal: that one, as today).
  const open = [...rows].filter(isOpen).sort(byOpenSeat)[0] ?? null;
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

/**
 * "Not now: hide this for a week" on Today's DRAFT or START line (F-R4-3): AIM_STEP_COOKIE = '<kind>:<id>:<today>'
 * (maxAge AIM_STEP_COOKIE_MAX_AGE_S). Revision 5 (§23.3): the cookie keeps up to AIM_STEP_COOKIE_ENTRIES_MAX entries,
 * one per goal's line (roadmap-invite stepCookieValueOf over the value it holds), so snoozing goal 2's line never
 * brings goal 1's back; with no earlier entry the value is revision 4's, byte for byte.
 */
export async function snoozeAimStepCore(jar: AimCookieJar, kind: "DRAFT" | "START", id: string, now: Date): Promise<RoadmapActionResult<null>> {
  if (kind !== "DRAFT" && kind !== "START") return fail("That line is no longer here.");
  if (typeof id !== "string" || !STEP_REF.test(id)) return fail("That line is no longer here.");
  jar.set(AIM_STEP_COOKIE, stepCookieValueOf(jar.get(AIM_STEP_COOKIE) ?? null, kind, id, todayKey(now)), { maxAge: AIM_STEP_COOKIE_MAX_AGE_S, ...COOKIE_OPTS });
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
export async function lowerDepthCore(userId: string, roadmapId: string, to: TopicDepth, reason: "CHOICE" | "EXAM", now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  return pointedRefusal(deps, userId, { roadmapId }, await lowerDepthUnpointed(userId, roadmapId, to, reason, now, deps));
}

/**
 * lowerDepthCore's work; lowerDepthCore points its refusals at the activity card while it waits (pointedRefusal, decision 2).
 * Revision 5, lane 8 (ruling 50): `to` is a TopicDepth; a TOPICS plan (or a fresh TOPICS draft) lowers through its own
 * path, and 6 is refused on LEVELS in today's words.
 */
async function lowerDepthUnpointed(userId: string, roadmapId: string, to: TopicDepth, reason: "CHOICE" | "EXAM", now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!isTopicDepth(to)) return fail("Pick a depth: Fluent or Retained.");
  if (reason !== "CHOICE" && reason !== "EXAM") return fail("Pick a depth: Fluent or Retained.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    if (kindOfRow(b.roadmap) === "TOPICS" || (b.roadmap.status === "DRAFT" && isTopicsDraft(b))) return lowerTopicsDepthStep(e, deps, userId, b, to, reason, now);
    if (!isAimDepth(to)) return fail("Pick a depth: Fluent or Retained.");
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
    const ctx = await planContext(e, userId, { ...b.roadmap, depth: to }, now, coveragePriorOf(b), b);
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
      const pure = e.lanes.lowerDepthPlanOf(plan, realismInputOf(ctx, plan), to, { excluded: gateOf(e, ctx).blocked, intake: ctx.intake, ...manualOpt(ctx) });
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
  return pointedRefusal(deps, userId, { roadmapId }, await confirmDomainAdditionsUnpointed(userId, roadmapId, version, domainIds, now, deps));
}

/** confirmDomainAdditionsCore's work; confirmDomainAdditionsCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function confirmDomainAdditionsUnpointed(userId: string, roadmapId: string, version: number, domainIds: readonly string[], now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
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
    // Domains are one goal's (§23.5): a suggestion another DRAFT, ACTIVE or PAUSED goal holds is never added here.
    const taken = takenDomainOf(e.goals.get(userId) ?? [], chosen, roadmapId);
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
    const decided = group.map((m) => {
      const d = draftOf(m);
      return { ...d, items: d.items.map((i) => (pendingAddition(i) ? { ...i, decision: (chosen.includes(i.domainId as string) ? "CHECKED" : "REMOVED") as Decision } : i)) };
    });
    const required = requiredDomainsOf(b, decided);
    if (required.length > DEPTH_DOMAINS_MAX) return fail(TOO_MANY_DOMAINS);
    const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b), b);
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const redated = redraftOf(e, ctx, decided, carried, required);
    if (!redated.ok) return fail(chosen.length ? `Adding ${chosen.map((id) => ctx.domains.get(id)?.name ?? "that Domain").join(" and ")} would take the plan past 3 years at this depth.` : redated.error);
    const real = redated.feasibility.dateCheck?.D_real ?? null;
    if (real && daysBetween(ctx.today, real) > SPAN_MAX_DAYS) return fail(`Adding ${chosen.map((id) => ctx.domains.get(id)?.name ?? "that Domain").join(" and ")} would take the plan past 3 years at this depth.`);
    const plan = redated.plan;
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } }, ...domainsFreeOps(chosen, roadmapId)];
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
 * Gemini's picks CHECKED; EASY removes them and puts the track's safe
 * sessions in their place (cueSafeKindsOf: easy, mobility and technique on
 * BODY, planning the week and keeping a log on CARE; code's, within the
 * caps), in one
 * transaction through the one writer. Refused with writes off and with no
 * pick waiting; any other choice is refused in the plan's own words
 * (picksChoiceRefusalOf: "Keep the picks, or use Plan the week ahead and
 * Keep a log." on a care plan), as accept's blocker is (confirmPicksOf).
 *
 * On a plan whose session picks need no confirm (a Field plan's, contracts
 * §20.5): Gemini's practice picks, the one decision accept waits on
 * (DECIDE_PRACTICE_PICKS): KEEP sets them CHECKED; DEFAULT (EASY reads the
 * same there) removes each that isn't code's default and re-fits, so code's
 * default stands in its stage (decidePracticePicks).
 */
export async function confirmSessionPicksCore(userId: string, roadmapId: string, choice: "KEEP" | "EASY" | "DEFAULT", now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  return pointedRefusal(deps, userId, { roadmapId }, await confirmSessionPicksUnpointed(userId, roadmapId, choice, now, deps));
}

/** confirmSessionPicksCore's work; confirmSessionPicksCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function confirmSessionPicksUnpointed(userId: string, roadmapId: string, choice: "KEEP" | "EASY" | "DEFAULT", now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const first = await e.store.bundle(userId, roadmapId);
  // A plan whose session picks need no confirm (a Field plan's, a track plan with nothing to watch): Gemini's practice picks, kept or the app's default.
  if (first && !picksNeedConfirmOf(first.roadmap)) return decidePracticePicks(e, userId, roadmapId, choice === "KEEP" ? "KEEP" : choice === "EASY" || choice === "DEFAULT" ? "DEFAULT" : null, now);
  if (choice === "DEFAULT") choice = "EASY";
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    // Another choice is refused in the plan's own words: what its swap places on its track (picksChoiceRefusalOf).
    if (choice !== "KEEP" && choice !== "EASY") return fail(picksChoiceRefusalOf(planGateOf(e, b.roadmap).gate));
    const group = draftRowsOf(b);
    if (!picksNeedConfirmOf(b.roadmap) || !group.some((m) => m.items.some((i) => pendingPick(itemDraftOf(i))))) return fail("There are no session picks to confirm.");
    const tree = await e.io.fieldTree();
    const track = catalogTrackOf({ fieldId: b.roadmap.fieldId, track: intakeOf(b.roadmap).track });
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } }];
    const decided = new Set<string>();
    // Confirm to unlock (contracts §19): this confirm is a second layer. Keeping a pick never unlocks a kind the gate
    // blocks (that pick leaves instead), and no safe session the user said to avoid takes a pick's place.
    const gate = planGateOf(e, b.roadmap).gate;
    const afterOf = (m: MilestoneBundle): MilestoneDraft => {
      const d = draftOf(m);
      if (choice === "KEEP") {
        const items = d.items.map((i) => (pendingPick(i) ? (decided.add(i.id as string), { ...i, decision: (isPlaceableKind(gate, i.catalogKey) ? "CHECKED" : "REMOVED") as Decision }) : i));
        return items.some((i, k) => i.decision === "REMOVED" && d.items[k].decision !== "REMOVED") ? syncMeasures({ ...d, items }, b.roadmap.fieldId == null, e.makeId) : { ...d, items };
      }
      const picks = d.items.filter(pendingPick);
      if (picks.length === 0) return d;
      // Every waiting pick goes: a picked practice, and a picked FULL_ATTEMPT step or PERFORMANCE_CHECK checkpoint (the activity itself).
      const items = d.items.map((i) => (pendingPick(i) ? (decided.add(i.id as string), { ...i, decision: "REMOVED" as Decision }) : i));
      // Code's safe sessions take the place of the picked practices (a removed step or checkpoint leaves its slot empty).
      const practicePicks = picks.filter((p) => p.kind === "PRACTICE");
      if (practicePicks.length === 0) return syncMeasures({ ...d, items }, b.roadmap.fieldId == null, e.makeId);
      const sessions = Math.max(1, ...practicePicks.map((p) => p.sessionsPerWeek ?? 1));
      // The track's safe practices (roadmap-catalog cueSafeKindsOf): easy, mobility and technique on BODY; planning the
      // week and keeping a log on CARE (decision 2), so the swap never leaves a CARE plan empty.
      for (const key of cueSafeKindsOf(track).filter((k) => catalogEntryOf(k)?.slot === "PRACTICE")) {
        if (items.filter((i) => i.kind === "PRACTICE" && liveItem(i)).length >= PRACTICES_PER_MILESTONE) break;
        if (items.some((i) => i.kind === "PRACTICE" && liveItem(i) && i.catalogKey === key)) continue;
        if (!isPlaceableKind(gate, key)) continue;
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

/** The words a practice-picks choice other than KEEP or DEFAULT is refused with. */
export const PRACTICE_PICKS_CHOICE = "Keep Gemini's picks, or use the app's default.";

/**
 * Gemini's practice picks on a plan that needs no session confirm (contracts
 * §20.5; a Field plan's): the one decision accept waits on
 * (DECIDE_PRACTICE_PICKS). KEEP sets every waiting pick CHECKED (a kind the
 * gate now holds leaves instead); DEFAULT removes every waiting pick that
 * isn't code's own default for its stage and re-fits the draft, so the
 * practice progression puts code's default back in its place (a removed
 * kind never returns there). One transaction through the one writer.
 */
async function decidePracticePicks(e: Env, userId: string, roadmapId: string, choice: "KEEP" | "DEFAULT" | null, now: Date): Promise<RoadmapActionResult<null>> {
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (choice == null) return fail(PRACTICE_PICKS_CHOICE);
    const group = draftRowsOf(b);
    const gate = planGateOf(e, b.roadmap).gate;
    const isDefault = pickIsDefaultOf(b.roadmap, gate);
    const drafts = group.map(draftOf);
    const waiting = (d: MilestoneDraft, i: ItemDraft) => d.status !== "LATER" && i.kind === "PRACTICE" && pendingPick(i) && (choice === "KEEP" || !isDefault(d, i));
    if (!drafts.some((d) => d.items.some((i) => waiting(d, i)))) return fail("There are no practice picks to decide.");
    const decided = new Set<string>();
    const trackArea = b.roadmap.fieldId == null;
    let next = drafts.map((d) => {
      if (!d.items.some((i) => waiting(d, i))) return d;
      const items = d.items.map((i) => {
        if (!waiting(d, i)) return i;
        decided.add(i.id as string);
        return { ...i, decision: (choice === "KEEP" && isPlaceableKind(gate, i.catalogKey) ? "CHECKED" : "REMOVED") as Decision };
      });
      return items.some((i, k) => i.decision === "REMOVED" && d.items[k].decision !== "REMOVED") ? syncMeasures({ ...d, items }, trackArea, e.makeId) : { ...d, items };
    });
    if (choice === "DEFAULT") {
      // The practice progression puts code's default in each removed pick's place (R2's re-fit, as every structural edit).
      try {
        const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b), b);
        const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
        const blocked = gateOf(e, ctx).blocked;
        next = withPendingHidden([...carried, ...next], (masked) => e.lanes.fitPlan(masked, realismInputOf(ctx, masked), { excluded: blocked, intake: ctx.intake, ...manualOpt(ctx) })).filter((d) => !isCarried(d));
      } catch (err) {
        console.error("roadmap: re-fit after the practice picks failed; saved without it:", err);
      }
    }
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: b.roadmap.version } }];
    const afterOf = (m: MilestoneRec, k: number) => next.find((x) => x.lineageId === m.lineageId && x.id === m.id) ?? next[k];
    const ctxText = { ...modelTextContextOf(b, await e.io.fieldTree()), rev4: true };
    try {
      group.forEach((m, k) => {
        const after = afterOf(m, k);
        if (!after || JSON.stringify(after) === JSON.stringify(draftOf(m))) return;
        ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } });
        const others = group.map((x, j) => (x.id === m.id ? null : (afterOf(x, j) ?? draftOf(x)))).filter((x): x is MilestoneDraft => x != null);
        writeRoadmapRows(ops, { kind: "REWRITE", before: m, after, now, makeId: e.makeId, decided, others }, ctxText);
      });
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("practice-picks", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * A started practice's Today task an AVOID paused (decision 4): archived at
 * once through tasks.ts pauseForSafetyCore (RoadmapIo.pauseTemplate), never
 * deleted; its history and streak stand, and the Today task's own undo
 * (actions/tasks unarchiveTask) brings it back. A must is paused at once too
 * (the lead's ruling 2: safety overrides the akrasia horizon; its earlier
 * days keep their rule and debts). From the pause day it no longer counts
 * toward its milestone (ruling 3): a practice's PRACTICE_KEPT measure stops
 * paying (offTargetOpsOf), and a step leaves the steps' share as any
 * archived step does.
 */
export interface PausedTask {
  templateId: string;
  /** The task's title on Today (the roadmap item's label when the task can't be read). */
  title: string;
  /** The catalog type the user said to avoid. */
  kind: CatalogKey;
  /**
   * Always null since the lead's ruling 2: a pause is never deferred, so the
   * task is off Today now, a must included. Kept so a reader written for the
   * deferred archive ("leaves Today on <day>") stays right.
   */
  deferredTo: DayKey | null;
}

/** setActivityVerdictsCore's answer. */
export interface ActivityVerdictsResult {
  /** The accepted plan holds unstarted rows the new answer changes: the page offers a re-plan. */
  replan: boolean;
  /**
   * Decision 4: the started practices' (and steps') Today tasks of a kind
   * this answer newly avoids, paused at once so an avoided activity never
   * stays live on Today, a must included (ruling 2). From today they no
   * longer count toward their milestone (ruling 3). The page shows a quiet
   * notice with an Undo (unarchiveTask per task). [] when none.
   */
  paused: PausedTask[];
  /** Those whose archive was refused or failed: still on Today, so the page names them (the user archives them there). */
  notPaused: PausedTask[];
}

/**
 * The user's answer to the activity card (confirm to unlock, contracts
 * §19.3, §19.5): ActivityCardAnswer, an explicit act — the kinds ticked to
 * avoid, or "Nothing to avoid" — carrying the key of the words it was given
 * against. Stored as their own decision (YOURS) in Roadmap.coverage through
 * coverageJsonOf, with the typed figures kept. Refused with writes off, on a
 * roadmap that isn't the user's or isn't open, and as roadmap-catalog
 * answerActivityCard refuses: a malformed answer or a kind off the plan's
 * track (ACTIVITY_ANSWER_REFUSAL), an answer given against other words
 * (ACTIVITY_ANSWER_STALE: the words changed meanwhile, in another tab or
 * device, so the page re-reads and the card asks again; decision 3), and a
 * Save with nothing ticked (ACTIVITY_NOTHING_TICKED: an unticked row is never
 * taken as fine). The reason stored is quoted by the server from the user's
 * own words, never sent. Guarded on the row as read (ROADMAP_IS with
 * updatedAt): an intake saved meanwhile is a re-read, so neither write drops
 * the other's, and a re-read under new words refuses the old key.
 *
 * On a DRAFT roadmap the draft's rows follow the new gate in the same
 * transaction (regatedDrafts: a kind now blocked leaves, a newly released
 * one is placed where the starter places it; through the one writer). On an
 * ACTIVE roadmap nothing accepted is rewritten: `replan` says whether an
 * unstarted milestone holds a kind now blocked or the answer allows a kind
 * it held, so the page offers a re-plan (replanCore honours the answer).
 * Start and the week quests read the stored answer from the next read on.
 *
 * Decision 4: once the answer is stored, every live Today task of a started
 * milestone (a practice or a step, superseded or finished rows included)
 * whose kind this answer newly avoids is paused at once through the task
 * path (pauseForSafetyCore; never deleted, never deferred, a must included:
 * the lead's ruling 2) and listed in `paused` for the page's quiet notice
 * and its Undo. A kind avoided before this answer is not paused again (the
 * user may have brought its task back). Ruling 3: in the answer's own write,
 * every avoided started practice stops counting toward its milestone
 * (offTargetOpsOf). A row still STARTING (Start's finish under way) is the
 * finish's to pause: it re-reads the answers after its write
 * (pauseAvoidedAfterFinish), and its write moves the roadmap's updatedAt, so
 * an answer read before it re-reads here and finds the row STARTED.
 */
export async function setActivityVerdictsCore(userId: string, roadmapId: string, answer: ActivityCardAnswer, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<ActivityVerdictsResult>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  let toPause: TaskToPause[] = [];
  const res = await withRetry<{ replan: boolean }>(async () => {
    toPause = [];
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    // Open on a PAUSED goal too (ruling 66): an AVOID is lifted only on the goal that stored it (§23.6 item 5).
    if (!holdsGoal(b.roadmap)) return fail("This roadmap is closed.");
    const today = todayKey(now);
    const before = planGateOf(e, b.roadmap);
    const intake = intakeOf(b.roadmap);
    // The card's answer under the words as read now: its key must be theirs (decision 3).
    const answered = answerActivityCard(intake.activities ?? null, before.state, answer, today);
    if (!answered.ok) return fail(answered.error);
    const coverage = coverageJsonOf(intake.coverage, answered.value, intake.practiceFamily ?? null);
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: [b.roadmap.status as RoadmapStatus], version: b.roadmap.version, updatedAt: b.roadmap.updatedAt } },
      { op: "update", table: "roadmap", where: { id: roadmapId }, data: { coverage, updatedAt: now } },
    ];
    // The row as it reads once written: the gate every later plan path reads.
    const next: RoadmapRec = { ...b.roadmap, coverage };
    const after = planGateOf(e, next).gate;
    const moved = JSON.stringify(after.blocked) !== JSON.stringify(before.gate.blocked);
    toPause = tasksToPauseOf(b, intake.activities ?? null, answered.value);
    // Ruling 3: a started practice the user now avoids stops counting toward its milestone from today, in this same write.
    if (Object.keys(answered.value.kinds).length > 0 && b.milestones.some((m) => m.status === "STARTED")) {
      ops.push(...offTargetOpsOf(b, answered.value, await carriedGoalsOf(e, userId, b)));
    }
    // §23.6 item 7: an AVOID given here holds for every goal on this track (and everywhere for a kind on every track),
    // so another goal's started practice of that kind is paused through the same safety pause, exactly as its own
    // AVOID would pause it, and stops counting toward its milestone.
    if (Object.keys(answered.value.kinds).length > 0) {
      const crossed = await crossGoalAvoidsOf(e, userId, b, intake.activities ?? null, answered.value);
      ops.push(...crossed.ops);
      for (const t of crossed.toPause) if (!toPause.some((x) => x.templateId === t.templateId)) toPause.push(t);
    }
    let replan = false;
    if (b.roadmap.status === "ACTIVE") {
      replan = moved && planRowsOf(b).some((m) => !isCarried(m) && m.status !== "LATER");
    } else if (b.roadmap.status === "DRAFT" && moved && !legacyOf(b)) {
      const group = draftRowsOf(b);
      if (group.length > 0) {
        const ctx = await planContext(e, userId, next, now, coveragePriorOf(b) ?? draftCoverageOf(group), b);
        const drafts = group.map(draftOf);
        let afters: MilestoneDraft[];
        try {
          afters = regatedDrafts(e, ctx, [], drafts, before.gate.blocked);
        } catch (err) {
          console.error("roadmap: the draft wasn't re-synced after the answers (the plan paths read them):", err instanceof Error ? err.message : err);
          afters = gatePlanRows(drafts, after, b.roadmap.fieldId == null, e.makeId);
        }
        const tree = await e.io.fieldTree();
        const ctxText = modelTextContextOf(b, tree, true);
        const pairs = group.map((row, i) => ({ row, after: afters.find((d) => d.id != null && d.id === row.id) ?? afters.find((d) => d.lineageId === row.lineageId) ?? afters[i] }));
        try {
          for (const { row, after: a } of pairs) {
            if (!a || JSON.stringify(a) === JSON.stringify(draftOf(row))) continue;
            const decided = new Set(a.items.filter((it) => it.id && row.items.find((x) => x.id === it.id)?.decision !== it.decision).map((it) => it.id as string));
            ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: row.id, statuses: [row.status as MilestoneStatus] } });
            writeRoadmapRows(ops, { kind: "REWRITE", before: row, after: { ...a, status: row.status === "LATER" ? "LATER" : "DRAFT" }, now, makeId: e.makeId, decided, others: pairs.filter((p) => p.row.id !== row.id).map((p) => p.after).filter((x): x is MilestoneDraft => !!x) }, ctxText);
          }
        } catch (err) {
          if (!(err instanceof ModelTextError)) throw err;
          logRefusedWrite("activities", err);
          return fail(CHANGE_NOT_SAVED);
        }
      }
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ replan }) : "stale";
  });
  invalidate("roadmap");
  if (!res.ok) return res;
  const { paused, notPaused } = await pauseAvoidedTasks(e, userId, toPause, now);
  return ok({ replan: res.value.replan, paused, notPaused });
}

/**
 * Ruling 3 (contracts §19, the lead's): a paused practice stops counting
 * toward its started milestone's practice-kept target from the pause day,
 * and the roadmap says so (never silently). Pure: on every STARTED row still
 * worked (not superseded; its goal neither closed nor archived, as `goals`
 * reads them) — or only row `only` — each paying PRACTICE_KEPT measure whose
 * practices (its item lineages) are all live, started (they have a task) and
 * of a kind `confirm` avoids turns CONTEXT. From then on R1 writes no reading
 * for it and every g, reach and pay reads the milestone's other measures and
 * steps (roadmap-measures payingMeasures); its readings so far stay as
 * history. The page reads it on the started milestone: the practice's
 * measure is CONTEXT and its kind is an AVOID row of the card, with the day
 * the user said so ("paused because you said to avoid it"); its "kept so
 * far" stops at that day (practiceSoFarOf) and it shows no pace. A measure
 * that also holds a practice the user didn't avoid stays as it is (a
 * revision-3 shape; never written now). A measure already CONTEXT is left
 * alone: neither the Undo of a pause (the task back on Today) nor a later
 * answer that lifts the AVOID makes it pay again, since the days it was
 * paused would then count against the user; Start again or a re-plan gives
 * the practice a measure afresh. Each changed row is guarded on its status.
 * [] when none.
 */
function offTargetOpsOf(b: RoadmapBundle, confirm: ActivityConfirm | null, goals: ReadonlyMap<string, GoalFacts>, only?: string): StoreOp[] {
  const avoided = new Set<string>(confirm && confirm.kinds ? Object.keys(confirm.kinds).filter((k) => confirm.kinds[k as CatalogKey]?.verdict === "AVOID") : []);
  const ops: StoreOp[] = [];
  if (avoided.size === 0) return ops;
  for (const m of [...b.milestones].sort(byOrd)) {
    if (m.status !== "STARTED" || (only != null && m.id !== only) || superseded(b, m)) continue;
    const goal = m.goalId ? goals.get(m.goalId) : undefined;
    if (goal && (goal.closedScore != null || goal.archivedAt != null)) continue;
    const off = new Set(m.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && i.templateId && isCatalogKey(i.catalogKey) && avoided.has(i.catalogKey)).map((i) => i.lineageId));
    if (off.size === 0) continue;
    const ids = m.measures
      .filter((x) => {
        if (x.kind !== "PRACTICE_KEPT" || x.role !== "PAYS") return false;
        const lineages = scopeOf(x.scope).itemLineageIds ?? (x.itemLineageId ? [x.itemLineageId] : []);
        return lineages.length > 0 && lineages.every((l) => off.has(l));
      })
      .map((x) => x.id);
    if (ids.length === 0) continue;
    ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: ["STARTED"] } });
    for (const id of ids) ops.push({ op: "update", table: "roadmapMeasure", where: { id }, data: { role: "CONTEXT" } });
  }
  return ops;
}

/**
 * Another goal's side of an AVOID (§23.6 item 7): for every other DRAFT, ACTIVE or PAUSED goal, the answer's AVOIDs
 * that hold there (the same catalog track, or a kind on every track: roadmap-catalog kindOnEveryTrack) pause its
 * started practices of a newly avoided kind (tasksToPauseOf) and turn their paying measures CONTEXT (offTargetOpsOf),
 * as that goal's own AVOID would. Nothing with no other goal, or no started row there.
 */
async function crossGoalAvoidsOf(e: Env, userId: string, b: RoadmapBundle, prev: ActivityConfirm | null, next: ActivityConfirm): Promise<{ ops: StoreOp[]; toPause: TaskToPause[] }> {
  const ops: StoreOp[] = [];
  const toPause: TaskToPause[] = [];
  const track = catalogTrackOf(intakeOf(b.roadmap));
  const others = (e.goals.get(userId) ?? []).filter((r) => r.id !== b.roadmap.id && holdsGoal(r)).sort(bySeatOrder);
  for (const r of others) {
    const sameTrack = catalogTrackOf(intakeOf(r)) === track;
    const kinds = Object.fromEntries(Object.entries(next.kinds).filter(([k, v]) => v?.verdict === "AVOID" && (sameTrack || kindOnEveryTrack(k))));
    if (Object.keys(kinds).length === 0) continue;
    const ob = await e.store.bundle(userId, r.id);
    if (!ob || !ob.milestones.some((m) => m.status === "STARTED")) continue;
    const held: ActivityConfirm = { ...next, kinds };
    toPause.push(...tasksToPauseOf(ob, prev, held));
    ops.push(...offTargetOpsOf(ob, held, await carriedGoalsOf(e, userId, ob)));
  }
  return { ops, toPause };
}

/** A started milestone's live Today task of a kind the answer newly avoids (decision 4). */
interface TaskToPause {
  templateId: string;
  kind: CatalogKey;
  /** The roadmap item's label: the notice's words when the task can't be read. */
  label: string;
}

/**
 * The Today tasks an answer pauses (decision 4), pure: every live practice or
 * step of a STARTED row (the plan's carried rows: superseded and finished
 * ones too, since their tasks can stay on Today) that has a task, of a kind
 * the answer avoids and the stored answer before it didn't. One per task, in
 * row and item order.
 */
function tasksToPauseOf(b: RoadmapBundle, prev: ActivityConfirm | null, next: ActivityConfirm): TaskToPause[] {
  const was = new Set<string>(prev && prev.kinds ? Object.keys(prev.kinds).filter((k) => prev.kinds[k as CatalogKey]?.verdict === "AVOID") : []);
  const newly = new Set<string>(Object.keys(next.kinds).filter((k) => next.kinds[k as CatalogKey]?.verdict === "AVOID" && !was.has(k)));
  const out: TaskToPause[] = [];
  if (newly.size === 0) return out;
  for (const m of [...b.milestones].sort(byOrd)) {
    if (m.status !== "STARTED") continue;
    for (const i of [...m.items].sort((x, y) => x.ord - y.ord)) {
      if (!liveItem(i) || (i.kind !== "PRACTICE" && i.kind !== "STEP") || !i.templateId || !isCatalogKey(i.catalogKey) || !newly.has(i.catalogKey)) continue;
      if (!out.some((t) => t.templateId === i.templateId)) out.push({ templateId: i.templateId, kind: i.catalogKey, label: i.label });
    }
  }
  return out;
}

/**
 * Pauses the tasks (decision 4) through the task path: RoadmapIo.pauseTemplate
 * (tasks.ts pauseForSafetyCore: archived at once, a must included — the
 * lead's ruling 2, safety overrides the akrasia horizon — never a delete;
 * the Today task's own unarchive is the undo). A task already archived, or a
 * one-off step already done, is left as it is and not listed. A refusal or a
 * failure is logged and listed in `notPaused` (still on Today), never
 * thrown: the answer itself is already stored.
 */
async function pauseAvoidedTasks(e: Env, userId: string, list: readonly TaskToPause[], now: Date): Promise<{ paused: PausedTask[]; notPaused: PausedTask[] }> {
  const paused: PausedTask[] = [];
  const notPaused: PausedTask[] = [];
  if (list.length === 0) return { paused, notPaused };
  let templates: Map<string, TemplateLite> | null = null;
  try {
    templates = new Map((await e.io.templates(userId, list.map((t) => t.templateId))).map((t) => [t.id, t]));
  } catch (err) {
    console.error("roadmap: the avoided practices' tasks weren't read (each is archived as found):", err instanceof Error ? err.message : err);
  }
  for (const x of list) {
    const t = templates?.get(x.templateId);
    // Read and gone, already archived, or a one-off step already done: nothing of it is live on Today.
    if (templates && (!t || t.archivedAt != null || (t.recurrence == null && t.completedAt != null))) continue;
    const row: PausedTask = { templateId: x.templateId, title: t?.title || x.label, kind: x.kind, deferredTo: null };
    try {
      const r = await e.io.pauseTemplate(userId, x.templateId, now);
      if (r.ok) paused.push(row);
      else {
        console.error("roadmap: an avoided practice's task wasn't paused:", r.error);
        notPaused.push(row);
      }
    } catch (err) {
      console.error("roadmap: an avoided practice's task wasn't paused:", err instanceof Error ? err.message : err);
      notPaused.push(row);
    }
  }
  if (paused.length > 0) invalidate("life", "activity");
  return { paused, notPaused };
}

/**
 * Moves an outline line's topic to another milestone of its version (F-R4-21):
 * both rows DRAFT, LATER or PLANNED (never a STARTING or STARTED row, never a
 * held stage), through the one writer. The moved topic reads as the user's
 * arrangement (EDITED). A line's milestone sets no count, so coverage and the
 * dates stand.
 */
export async function moveLineCore(userId: string, itemId: string, toMilestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  return pointedRefusal(deps, userId, { ref: itemId }, await moveLineUnpointed(userId, itemId, toMilestoneId, now, deps));
}

/** moveLineCore's work; moveLineCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function moveLineUnpointed(userId: string, itemId: string, toMilestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (typeof toMilestoneId !== "string" || !STEP_REF.test(toMilestoneId)) return fail("That milestone no longer exists.");
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const loc = await locate(e, userId, itemId);
    if (!loc || !loc.item || loc.item.kind !== "TOPIC") return fail("That outline line is no longer here.");
    const { b, m, item } = loc;
    // Revision 5, lane 8 (ruling 50): on a TOPICS plan a line is a topic; it changes layer only on the map (moveTopicCore).
    if (kindOfRow(b.roadmap) === "TOPICS" || (isTopicsDraft(b) && m.version === b.roadmap.version + 1)) return fail(MOVE_TOPICS_ON_THE_MAP);
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

/** keepMyOrderCore's refusal when the outline already reads in the user's own order. */
export const ORDER_ALREADY_YOURS = "Your outline is already in your own order.";

/**
 * "Keep my order" (the lead's ruling 7): Gemini's reorder of the outline (a
 * v4 reply's `order`; KeysOnlyDraft.reordered, which the page reads off the
 * rows: roadmap-ui-model geminiV4PartsOf MOVED) put back to the user's own
 * order in one tap. Every outline line on the draft's kept stages that the
 * user didn't move (a SYLLABUS topic, not EDITED) goes to the stage the
 * user's own order gives it (roadmap-types outlineStagesOf over the lines in
 * the user's order across the kept stages, as "Build from my numbers" splits
 * them), each line once, listed in that order within its stage after the
 * stage's other items; a line the user moved stays where they put it. A
 * line's milestone sets no count, so coverage and the dates stand. Through
 * the one writer, each changed row guarded on its status. Refused with
 * writes off, on a roadmap with no draft, a legacy draft, and when the
 * outline already reads in the user's order (ORDER_ALREADY_YOURS).
 */
export async function keepMyOrderCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  return pointedRefusal(deps, userId, { roadmapId }, await keepMyOrderUnpointed(userId, roadmapId, now, deps));
}

/** keepMyOrderCore's work; keepMyOrderCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function keepMyOrderUnpointed(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (typeof roadmapId !== "string" || !STEP_REF.test(roadmapId)) return fail(NO_ROADMAP);
  const e = envOf(deps);
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
    if (legacyOf(b)) return fail(b.roadmap.status === "DRAFT" ? DRAFT_IT_AGAIN : START_AGAIN_AT_DEPTH);
    const group = draftRowsOf(b);
    if (group.length === 0) return fail("There's no draft to change.");
    const n = intakeOf(b.roadmap).syllabus?.lines.length ?? 0;
    const afters = keptOrderOf(group.map(draftOf), n);
    if (!afters) return fail(ORDER_ALREADY_YOURS);
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: [b.roadmap.status as RoadmapStatus], version: b.roadmap.version } }];
    try {
      const ctxText = modelTextContextOf(b, await e.io.fieldTree());
      group.forEach((row, k) => {
        const after = afters[k];
        if (JSON.stringify(after) === JSON.stringify(draftOf(row))) return;
        ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: row.id, statuses: [row.status as MilestoneStatus] } });
        writeRoadmapRows(ops, { kind: "REWRITE", before: row, after, now, makeId: e.makeId, decided: new Set(), others: afters.filter((_, j) => j !== k) }, ctxText);
      });
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("keep-order", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return res;
}

/**
 * The draft's rows with its outline back in the user's own order (keepMyOrderCore), pure; null when nothing moves (every
 * line Gemini placed already sits on the stage the user's order gives it, in that order). `lines` is the outline's length.
 */
export function keptOrderOf(drafts: readonly MilestoneDraft[], lines: number): MilestoneDraft[] | null {
  const kept = drafts.map((d, k) => ({ d, k })).filter(({ d }) => !heldRow(d) && d.status !== "LATER").sort((a, b) => a.d.ord - b.d.ord);
  if (kept.length === 0 || lines <= 0) return null;
  const isPlaced = (i: ItemDraft) => i.kind === "TOPIC" && i.origin === "SYLLABUS" && typeof i.syllabusRef === "number" && i.syllabusRef >= 0 && i.syllabusRef < lines && i.decision !== "EDITED";
  const split = outlineStagesOf(Array.from({ length: lines }, (_, r) => r), kept.length);
  const stageOf = new Map<number, number>();
  split.forEach((refs, s) => refs.forEach((r) => stageOf.set(r, s)));
  // Each placed line's row in the user's order: from its own row when it stays, a new row (same lineage) when it moves.
  const moved: ItemDraft[][] = kept.map(() => []);
  const out = drafts.map((d) => ({ ...d, items: [...d.items] }));
  kept.forEach(({ d, k }, s) => {
    for (const it of [...d.items].sort((a, b) => a.ord - b.ord)) {
      if (!isPlaced(it)) continue;
      const to = stageOf.get(it.syllabusRef as number) ?? s;
      moved[to].push(to === s ? { ...it } : { ...it, id: null });
    }
    out[k].items = out[k].items.filter((it) => !isPlaced(it));
  });
  // A stage whose lines stay as they were (the same lines, in the same order) keeps its rows untouched; none moved: null.
  let moves = false;
  kept.forEach(({ d, k }, s) => {
    const inOrder = moved[s].sort((a, b) => (a.syllabusRef as number) - (b.syllabusRef as number));
    const was = [...d.items].sort((a, b) => a.ord - b.ord).filter(isPlaced).map((i) => i.lineageId);
    if (JSON.stringify(was) === JSON.stringify(inOrder.map((i) => i.lineageId))) {
      out[k].items = [...d.items];
      return;
    }
    moves = true;
    const rest = [...out[k].items].sort((a, b) => a.ord - b.ord);
    out[k].items = [...rest, ...inOrder].map((it, j) => ({ ...it, ord: j + 1 }));
  });
  return moves ? out : null;
}

/**
 * "Add the app's practice" on one stage of a plan the user writes (the lead's
 * ruling 6: "Write it myself", an "Edit by hand" re-plan; code never fills
 * one on a re-fit): R2's addStagePracticesOf adds one practice to that
 * DRAFT stage, the first the practice progression places there that it
 * lacks (the first tap its role-defining kind, code's default focus; each
 * tap after it the next: the exam's, the core, the carry of what the stage
 * before holds or the opening partner, the spaced review), within the room
 * its weekly practice budget holds beside the user's own practices, through
 * the plan's gate (a kind it blocks is never placed); every other stage is
 * read, never changed, and the stage's steps and checkpoint stay the user's.
 * Then the plan is sized as it stands (R2's fitPlan with PlaceOpts.manual)
 * and the measures follow the rows. The added row is the app's (origin
 * CODE, its words; "added by the app"). Through the one writer, guarded on
 * the roadmap's version and the milestone's status. Refused with writes off,
 * on a stage that isn't a draft stage of a revision-4 plan, a held one, with
 * practices off, and when the stage already holds every practice the app
 * would place there (APP_PRACTICE_IN_PLACE) or three of the user's own.
 */
export async function addAppPracticeCore(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ added: number }>> {
  return pointedRefusal(deps, userId, { ref: milestoneId }, await addAppPracticeUnpointed(userId, milestoneId, now, deps));
}

/** addAppPracticeCore's refusal when the stage already holds what the app would place there. */
export const APP_PRACTICE_IN_PLACE = "This stage already holds the app's practices.";

/** addAppPracticeCore's work; addAppPracticeCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function addAppPracticeUnpointed(userId: string, milestoneId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ added: number }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const e = envOf(deps);
  const res = await withRetry<{ added: number }>(async () => {
    const loc = await locate(e, userId, milestoneId);
    if (!loc || loc.item) return fail("That milestone no longer exists.");
    const { b, m } = loc;
    if (legacyOf(b)) return fail(b.roadmap.status === "DRAFT" ? DRAFT_IT_AGAIN : START_AGAIN_AT_DEPTH);
    if (m.status === "LATER") return fail("A milestone in Later holds no practice yet: give it dates first.");
    if (m.status !== "DRAFT") return fail("Only a draft stage takes the app's practice; re-plan to change an accepted one.");
    if (heldRow(m)) return fail("That stage was held when you began: it needs no practice.");
    if (m.stage == null) return fail("This plan has no stages for the app to place a practice on.");
    if (!b.roadmap.practicesAllowed) return fail("Practices are off for this aim: turn them on in the intake first.");
    const group = draftRowsOf(b);
    if (!group.some((x) => x.id === m.id)) return fail("This milestone is no longer part of the plan.");
    const ctx = await planContext(e, userId, b.roadmap, now, coveragePriorOf(b), b);
    const drafts = group.map(draftOf);
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const gate = gateOf(e, ctx);
    const before = drafts.find((d) => d.lineageId === m.lineageId && d.id === m.id) as MilestoneDraft;
    let next: MilestoneDraft[];
    try {
      const names = namesOfDomains(ctx, requiredDomainsOf(b, group));
      const placed = withPendingHidden([...carried, ...drafts], (masked) =>
        realism.addStagePracticesOf(masked, m.lineageId, ctx.intake, realismInputOf(ctx, masked), names, e.makeId, { gate, excluded: gate.blocked })
      ).filter((d) => !isCarried(d));
      const after = placed.find((d) => d.lineageId === m.lineageId && d.id === m.id);
      if (!after || JSON.stringify(after.items) === JSON.stringify(before.items)) {
        // The user's own practices (not the app's: code's words it worked out) filling every slot leave the app no room.
        const own = before.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && !(i.origin === catalogOriginOf() && provenanceOf(i.origin, i.decision) === "WORKED_OUT")).length;
        return fail(own >= PRACTICES_PER_MILESTONE ? `This stage holds ${PRACTICES_PER_MILESTONE} of your practices already: remove one to make room for the app's.` : APP_PRACTICE_IN_PLACE);
      }
      // Sized as it stands (a plan the user writes is never filled by the re-fit), the measures following the rows.
      next = withStagePractices(e, ctx, placed, carried);
    } catch (err) {
      console.error("roadmap: the app's practice wasn't placed:", err instanceof Error ? err.message : err);
      return fail("Couldn't add the app's practice. Try again.");
    }
    const target = next.find((d) => d.lineageId === m.lineageId && d.id === m.id);
    const added = target ? target.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && !before.items.some((x) => x.lineageId === i.lineageId)).length : 0;
    const ops: StoreOp[] = milestoneGuards(b, m);
    const afterOf = (i: number) => next.find((x) => x.lineageId === group[i].lineageId && x.id === group[i].id) ?? next[i];
    try {
      const ctxText = modelTextContextOf(b, ctx.tree);
      for (let i = 0; i < group.length; i++) {
        const after = afterOf(i);
        if (!after || JSON.stringify(draftOf(group[i])) === JSON.stringify(after)) continue;
        if (group[i].id !== m.id) ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: group[i].id, statuses: [group[i].status as MilestoneStatus] } });
        const others = group.map((_, k) => afterOf(k) ?? drafts[k]).filter((d, k) => k !== i && !!d);
        writeRoadmapRows(ops, { kind: "REWRITE", before: group[i], after, now, makeId: e.makeId, decided: new Set(), others }, ctxText);
      }
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("app-practice", err);
      return fail(CHANGE_NOT_SAVED);
    }
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok({ added }) : "stale";
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
  return pointedRefusal(deps, userId, { roadmapId }, await setLineDomainUnpointed(userId, roadmapId, lineIndex, domainId, now, deps));
}

/** setLineDomainCore's work; setLineDomainCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function setLineDomainUnpointed(userId: string, roadmapId: string, lineIndex: number, domainId: string | null, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
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
    // Domains are one goal's (§23.5): a line is never tied to a Domain another DRAFT, ACTIVE or PAUSED goal holds.
    const taken = domainId != null ? takenDomainOf(e.goals.get(userId) ?? [], [domainId], roadmapId) : null;
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
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
    const ctx = await planContext(e, userId, { ...b.roadmap, syllabus }, now, coveragePriorOf(b), b);
    const carried = carriedPlanOf(b, group, await carriedGoalsOf(e, userId, b));
    const redated = redraftOf(e, ctx, drafts, carried, required);
    if (!redated.ok) return fail(redated.error);
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: [b.roadmap.status as RoadmapStatus], version: b.roadmap.version } },
      ...domainsFreeOps(domainId != null ? [domainId] : [], roadmapId),
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
  return pointedRefusal(deps, userId, { roadmapId }, await keepCalibratedDatesUnpointed(userId, roadmapId, now, deps));
}

/** keepCalibratedDatesCore's work; keepCalibratedDatesCore points its refusals at the activity card while it waits (pointedRefusal, decision 2). */
async function keepCalibratedDatesUnpointed(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
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
  {
    // Revision 5 (contracts §23.1, ruling 24): every open goal lane 3 writes has its seat; before migration B's CHECK, a
    // row old code saved between migration A and lane 3's deploy may have none until its next save or accept.
    name: "open-goals-without-a-seat",
    expect: "0 rows once every draft old code saved has been saved or accepted again (migration B's backfill seats the rest)",
    sql: `SELECT r."id", r."userId", r."status" FROM "Roadmap" r WHERE r."status" IN ('DRAFT', 'ACTIVE') AND r."slot" IS NULL`,
  },
  {
    // Revision 5 (§23.1): no user holds more open goals than GOALS_MAX (1 until lane 4 lifts it to 3).
    name: "open-goals-over-the-cap",
    expect: "0 rows",
    sql: `SELECT r."userId", COUNT(*) FROM "Roadmap" r WHERE r."status" IN ('DRAFT', 'ACTIVE') GROUP BY r."userId" HAVING COUNT(*) > ${GOALS_MAX}`,
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
    pack = e.lanes.buildEvidencePack({ intake: ctx.intake, areaName: ctx.areaName, domains: evidenceDomainsOf(ctx), windows, pickStages: evidence.pickStagesOf(ladder) });
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
    // As Start would start it (contracts §19): what the plan's gate blocks is held back, so no quest names it.
    const d0 = draftOf(row);
    const held = heldAtStartOf(d0, gateOf(hr.e, ctx));
    const d = withHeld(d0, held);
    const input = realismInputOf(ctx, plan);
    const refitted = hr.e.lanes.refitForStart(d, plan, input);
    const snapshot = hr.e.lanes.startSnapshotOf(refitted.milestone, refitted, input, today);
    const weekStart = weekStartKeyOf(today);
    // Start's own v0 per key (startCountsOf; an `rc` key's is R6's clean count): the bar's view is the set Start freezes.
    const counts = v0ByKeyOf(startCountsOf(ctx, d.measures));
    const cards: WeekQuestCardInput[] = [];
    for (const x of d.measures) {
      const ids = x.scope.domainIds ?? [];
      if (x.kind !== "CARDS_AT_LEVEL" || x.role !== "PAYS" || x.minLevel == null || !x.measureKey || ids.length === 0) continue;
      const parsed = parseMeasureKey(x.measureKey);
      const states = cardStatesOf(ctx, ids);
      const segment = parsed?.kind === "CARDS_AT_LEVEL" ? parsed.segment : undefined;
      const v = Object.prototype.hasOwnProperty.call(counts, x.measureKey) ? counts[x.measureKey] : questsServer.measureCountOf(states, x.minLevel, segment);
      const rate = x.rateSource;
      cards.push({
        measureKey: x.measureKey,
        domainIds: [...ids],
        domainNames: domainNamesOf(ctx, ids),
        level: x.minLevel,
        target: x.target,
        baseline: x.baseline ?? v,
        v0: v,
        cards: states,
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
    const cp = live.find((i) => i.kind === "CHECKPOINT" && i.outOf != null && i.bar != null && !held.has(i.lineageId)) ?? null;
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

// ═══ Revision 5, lane 8: the TOPICS server path without Gemini (contracts §22.13, §22.14, §23.5) ═══════════════════
//
// Everything here sits behind TOPIC_PLANS_LIVE (topicSwitchesOf().plans: false until lane 9), so no user reaches it and
// LEVELS (every plan today) reads byte for byte as before: a LEVELS bundle holds no topic row, its draftPlan is null,
// and each hook below returns before it changes anything there.
//
//   The map's rows      TopicRowRec · EdgeRowRec (RoadmapTopic, RoadmapTopicEdge; the bundle reads every version's) ·
//                       mapOfVersion · mapRowOps (the version's rows replaced in one transaction)
//   Plan kind (49)      kindOfRow · draftKindFactsOf: a fresh DRAFT's kind, depth and rating are its columns; a re-plan
//                       draft of another kind keeps its own in Roadmap.draftPlan until accept (the live plan's
//                       readers never read it)
//   The no-Gemini map   writeTopicsCore (a fresh DRAFT) · breakIntoTopicsCore (an ACTIVE LEVELS plan, version + 1,
//                       draftPlan) through writtenTopicsDraft: an INHOUSE run with phase null, code's rating, the
//                       written map (roadmap-topics writtenMapOf), the layer milestones (realism layeredLadderOf)
//   The map's edits     setLayersCore · keepLayerCore · addTopicCore · editTopicCore · moveTopicCore ·
//                       setParentsCore · useMyDomainCore · chooseTopicCore · skipTopicCore · keepGeminiNameCore ·
//                       mergeLayerUpCore: each re-reads, changes the map, rebuilds the draft's milestones from it and
//                       writes both in one transaction guarded on the row as read (rebuildTopicsDraftOps)
//   Accept (49, 50, 51) acceptTopicsStep (acceptCore's TOPICS branch): acceptRefusalOf's words, the stale-confirm
//                       and live-milestone refusals, the Domains created (nameOrigin GEMINI for a kept Gemini name)
//                       and bound, the held topics, the plan rebuilt over its Domains with the post-accept titles,
//                       ranks by planKind under milestoneCapOf, previousPlan, draftPlan cleared · topicUndoOf
//   Gating (F-R5-10)    prereqsOpenOf + the PREREQS_MET guard (Start's refusal PREREQS_OPEN)
//   Goals (§23.5)       trackClauseAsGoalCore (ruling 31) · topic Domains held by a goal (ruling 61)
//   The tripwire        assertTopicNames (views) · topicNamesInRowsOf (assertNoModelText's extension)
//   Views               withTopicViews: the header's planKind, rating and cautions, RoadmapView.topicMap,
//                       DraftView.topicMap, the layer milestones' rows and measures (NamedPart payloads)
//   Depth (ruling 50)   lowerTopicsDepthStep (lowerDepthCore's TOPICS branch; 6 is a TOPICS depth only)

/** The [Write the topics] / [Break into topics] refusal while TOPIC_PLANS_LIVE is off (§22.14's table). */
export const TOPIC_PLANS_OFF = "Topic plans arrive with the next update.";
/** A topic map plans a Field Area's cards; a life-track Area has none. */
export const TOPICS_FIELD_ONLY = "A topic map plans a Field Area: pick a Field first.";
/** MANUAL on TOPICS (ruling 50): a Domain changes layer only on the map. */
export const MOVE_TOPICS_ON_THE_MAP = "Move topics on the map.";
/** "I know this" on a milestone under way (ruling 59). */
export const SKIP_CLOSE_FIRST = "Close it first.";
/** An accept that closed a live LEVELS milestone stays (ruling 49). */
export const ACCEPT_CLOSED_LIVE = "A milestone closed with this plan, so it stays; re-plan instead.";
/** An edit on a map whose draft is gone or was replaced. */
export const NO_TOPIC_DRAFT = "There's no topic map to change: write the topics first.";
const TOPIC_GONE = "That topic is no longer on the map.";
const TOPIC_TWICE = "That topic is on the map already.";
const LAYER_GONE = "That layer is no longer on the map.";

/** A RoadmapTopic row (DATE columns as DayKeys). */
export interface TopicRowRec {
  id: string;
  roadmapId: string;
  version: number;
  lineageId: string;
  key: string;
  layer: number;
  name: string;
  rawName: string | null;
  nameOrigin: string;
  scope: string | null;
  placedBy: string;
  grounding: string;
  sources: unknown;
  formVotes: number;
  samples: number;
  layerVotes: unknown;
  decision: string;
  mergedInto: string | null;
  chosen: boolean;
  role: string;
  domainId: string | null;
  bound: boolean;
  heldDay: DayKey | null;
  skippedDay: DayKey | null;
  flags: string[];
  notes: string[];
  createdAt: Date;
  updatedAt?: Date;
}

/** A RoadmapTopicEdge row. */
export interface EdgeRowRec {
  id: string;
  roadmapId: string;
  version: number;
  parentLineageId: string;
  childLineageId: string;
  parentDomainId: string | null;
  parentRoadmapId: string | null;
  origin: string;
  votes: number;
  samples: number;
  drawn: boolean;
  decision: string;
  match: string;
  createdAt: Date;
}

// ── Rows ↔ drafts ──

const topicSourcesOf = (raw: unknown): TopicSource[] =>
  Array.isArray(raw)
    ? raw
        .filter((s): s is TopicSource => !!s && typeof s === "object" && typeof (s as TopicSource).title === "string" && typeof (s as TopicSource).uri === "string")
        .map((s) => ({ title: s.title, uri: s.uri }))
    : [];
const topicNumbersOf = (raw: unknown): number[] => (Array.isArray(raw) ? raw.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : []);

export function topicOfRec(r: TopicRowRec): TopicDraft {
  return {
    id: r.id,
    lineageId: r.lineageId,
    key: r.key,
    layer: r.layer,
    name: r.name,
    rawName: r.rawName,
    nameOrigin: isOneOf(TOPIC_ORIGINS, r.nameOrigin) ? r.nameOrigin : "USER",
    scope: isOneOf(TOPIC_SCOPES, r.scope) ? r.scope : null,
    placedBy: isOneOf(TOPIC_PLACED_BY, r.placedBy) ? r.placedBy : "YOU",
    grounding: isOneOf(TOPIC_GROUNDINGS, r.grounding) ? r.grounding : "OWN",
    sources: topicSourcesOf(r.sources),
    formVotes: r.formVotes,
    samples: r.samples,
    layerVotes: topicNumbersOf(r.layerVotes),
    decision: isOneOf(TOPIC_DECISIONS, r.decision) ? r.decision : "PENDING",
    mergedInto: r.mergedInto,
    chosen: r.chosen,
    role: isOneOf(TOPIC_ROLES, r.role) ? r.role : "BASE",
    domainId: r.domainId,
    bound: r.bound,
    heldDay: r.heldDay,
    skippedDay: r.skippedDay,
    flags: [...r.flags],
    notes: r.notes.filter((n): n is TopicNote => isOneOf(TOPIC_NOTES, n)),
  };
}

export function edgeOfRec(r: EdgeRowRec): EdgeDraft {
  return {
    id: r.id,
    parentLineageId: r.parentLineageId,
    childLineageId: r.childLineageId,
    parentDomainId: r.parentDomainId,
    parentRoadmapId: r.parentRoadmapId,
    origin: isOneOf(EDGE_ORIGINS, r.origin) ? r.origin : "USER",
    votes: r.votes,
    samples: r.samples,
    drawn: r.drawn,
    decision: isOneOf(EDGE_DECISIONS, r.decision) ? r.decision : "PENDING",
    match: isOneOf(EDGE_MATCHES, r.match) ? r.match : "NONE",
  };
}

function topicInsertRow(roadmapId: string, version: number, t: TopicDraft, now: Date, makeId: () => string): Record<string, unknown> {
  return {
    id: t.id ?? makeId(),
    roadmapId,
    version,
    lineageId: t.lineageId,
    key: t.key,
    layer: t.layer,
    name: t.name,
    rawName: t.rawName,
    nameOrigin: t.nameOrigin,
    scope: t.scope,
    placedBy: t.placedBy,
    grounding: t.grounding,
    sources: t.sources,
    formVotes: t.formVotes,
    samples: t.samples,
    layerVotes: t.layerVotes,
    decision: t.decision,
    mergedInto: t.mergedInto,
    chosen: t.chosen,
    role: t.role,
    domainId: t.domainId,
    bound: t.bound,
    heldDay: t.heldDay,
    skippedDay: t.skippedDay,
    flags: [...t.flags],
    notes: [...t.notes],
    createdAt: now,
    updatedAt: now,
  };
}

function edgeInsertRow(roadmapId: string, version: number, x: EdgeDraft, now: Date, makeId: () => string): Record<string, unknown> {
  return {
    id: x.id ?? makeId(),
    roadmapId,
    version,
    parentLineageId: x.parentLineageId,
    childLineageId: x.childLineageId,
    parentDomainId: x.parentDomainId,
    parentRoadmapId: x.parentRoadmapId,
    origin: x.origin,
    votes: x.votes,
    samples: x.samples,
    drawn: x.drawn,
    decision: x.decision,
    match: x.match,
    createdAt: now,
  };
}

/** One version's map rows replaced in the caller's transaction: its topics and edges as `map` holds them (ids kept). */
function mapRowOps(roadmapId: string, version: number, map: TopicMap, now: Date, makeId: () => string): StoreOp[] {
  const ops: StoreOp[] = [
    { op: "delete", table: "roadmapTopicEdge", where: { roadmapId, version } },
    { op: "delete", table: "roadmapTopic", where: { roadmapId, version } },
  ];
  if (map.topics.length) ops.push({ op: "insert", table: "roadmapTopic", rows: map.topics.map((t) => topicInsertRow(roadmapId, version, t, now, makeId)) });
  // One row per (parent, child): a parent kept twice (a merge, a re-pick) is written once (the unique key, ruling 48).
  const seen = new Set<string>();
  const edges = map.edges.filter((x) => {
    const k = `${x.parentLineageId}→${x.childLineageId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (edges.length) ops.push({ op: "insert", table: "roadmapTopicEdge", rows: edges.map((x) => edgeInsertRow(roadmapId, version, x, now, makeId)) });
  return ops;
}

// ── Plan kind, depth and rating (ruling 49) ──

/** Roadmap.planKind (a row read before migration B, or anything else, is LEVELS). */
function kindOfRow(r: Pick<RoadmapRec, "planKind">): PlanKind {
  return r.planKind === "TOPICS" ? "TOPICS" : "LEVELS";
}

function topicDepthOfRow(r: Pick<RoadmapRec, "depth">): TopicDepth | null {
  return isTopicDepth(r.depth) ? r.depth : null;
}

/** A stored RatingRecord, read defensively (a malformed one is none). */
function storedRatingOf(raw: unknown): RatingRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Partial<RatingRecord>;
  if (!isOneOf(DIFF_KEYS, r.difficulty) || !isOneOf(BREADTH_KEYS, r.breadth) || !isOneOf(RATING_ORIGINS, r.origin)) return null;
  if (typeof r.layers !== "number" || !Number.isInteger(r.layers) || r.layers < LAYERS_MIN || r.layers > LAYERS_MAX) return null;
  return {
    ...(r as RatingRecord),
    reasons: Array.isArray(r.reasons) ? [...r.reasons] : [],
    cautions: Array.isArray(r.cautions) ? [...r.cautions] : [],
    samples: Array.isArray(r.samples) ? [...r.samples] : [],
    changes: Array.isArray(r.changes) ? [...r.changes] : [],
  };
}

/** Roadmap.draftPlan when it names the draft group's version (the live version + 1); else null. */
function storedDraftPlanOf(b: RoadmapBundle): DraftPlan | null {
  const raw = b.roadmap.draftPlan;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Partial<DraftPlan>;
  if (d.version !== b.roadmap.version + 1 || (d.planKind !== "TOPICS" && d.planKind !== "LEVELS")) return null;
  return { version: b.roadmap.version + 1, planKind: d.planKind, depth: isTopicDepth(d.depth) ? d.depth : null, rating: storedRatingOf(d.rating) };
}

interface DraftKindFacts {
  planKind: PlanKind;
  depth: TopicDepth | null;
  rating: RatingRecord | null;
  /** A re-plan draft of an accepted row whose own kind rides Roadmap.draftPlan. */
  inDraftPlan: boolean;
}

/** The draft group's own kind, depth and rating (ruling 49): Roadmap.draftPlan on an accepted row that holds one; else the row's columns. */
function draftKindFactsOf(b: RoadmapBundle): DraftKindFacts {
  const dp = b.roadmap.version >= 1 ? storedDraftPlanOf(b) : null;
  if (dp) return { planKind: dp.planKind, depth: dp.depth, rating: dp.rating, inDraftPlan: true };
  return { planKind: kindOfRow(b.roadmap), depth: topicDepthOfRow(b.roadmap), rating: storedRatingOf(b.roadmap.rating), inDraftPlan: false };
}

/** The draft group (or a fresh DRAFT before its first map) is a TOPICS draft. */
function isTopicsDraft(b: RoadmapBundle): boolean {
  if (draftKindFactsOf(b).planKind !== "TOPICS") return false;
  const v = b.roadmap.version + 1;
  return b.roadmap.status === "DRAFT" || draftRowsOf(b).length > 0 || (b.topics ?? []).some((t) => t.version === v);
}

/** The row as a TOPICS plan context reads it: its kind TOPICS and the draft's depth (intakeOf then gives a TOPICS intake: depth null, topicDepth set; ruling 14). */
function asTopicsRow(r: RoadmapRec, depth: TopicDepth | null): RoadmapRec {
  return { ...r, planKind: "TOPICS", depth };
}

/** Roadmap.splitClauses, read defensively. */
function storedSplitClausesOf(r: Pick<RoadmapRec, "splitClauses">): SplitClause[] {
  if (!Array.isArray(r.splitClauses)) return [];
  return (r.splitClauses as unknown[]).filter(
    (c): c is SplitClause => !!c && typeof c === "object" && typeof (c as SplitClause).start === "number" && typeof (c as SplitClause).end === "number" && typeof (c as SplitClause).text === "string"
  );
}

// ── The map ──

const topicLive = (t: Pick<TopicDraft, "decision">): boolean => t.decision !== "REMOVED" && t.decision !== "MERGED";
const topicKeyOrder = (k: string): [number, number] => {
  const m = /^(S|U|T)(\d+)$/.exec(k);
  return m ? [m[1] === "S" ? 0 : m[1] === "U" ? 1 : 2, Number(m[2])] : [3, 0];
};
const byTopicLayerKey = (a: TopicDraft, b: TopicDraft): number => {
  const ka = topicKeyOrder(a.key);
  const kb = topicKeyOrder(b.key);
  return a.layer - b.layer || ka[0] - kb[0] || ka[1] - kb[1];
};
const clampBands = (n: number): number => Math.max(LAYERS_MIN, Math.min(LAYERS_MAX, Math.floor(Number.isFinite(n) ? n : LAYERS_MIN)));

/** One version's map from the bundle; `layers` the bands shown (the rating's K), never fewer than the deepest live topic's. */
export function mapOfVersion(b: Pick<RoadmapBundle, "topics" | "edges">, version: number, layers: number | null = null): TopicMap {
  const ts = (b.topics ?? []).filter((t) => t.version === version).map(topicOfRec).sort(byTopicLayerKey);
  const edges = (b.edges ?? []).filter((x) => x.version === version).map(edgeOfRec);
  const deepest = Math.max(LAYERS_MIN, ...ts.filter(topicLive).map((t) => t.layer));
  return { layers: clampBands(Math.max(layers ?? deepest, deepest)), topics: ts, edges };
}

/** The next T key (T1..T999). */
function nextTopicKey(map: TopicMap): string {
  const n = Math.max(0, ...map.topics.map((t) => topicKeyOrder(t.key)).filter(([kind]) => kind === 2).map(([, i]) => i));
  return `T${n + 1}`;
}

/** The layers you filled (decision 67): roadmap-topics kFinalOf over the chosen live topics, within the bands; code's reading when that lane's export can't answer. */
function filledBandsOf(map: TopicMap): number {
  const chosen = map.topics.filter((t) => topicLive(t) && t.chosen);
  try {
    return topicsLib.kFinalOf(chosen, map.layers);
  } catch {
    let k = 0;
    while (k < map.layers && chosen.some((t) => t.layer === k + 1)) k++;
    return k;
  }
}

/** A topic's provenance class (roadmap-topics topicClassOf); a GEMINI name GROUND hasn't linked reads NOT_CHECKED when that lane can't answer. */
function topicClassFor(t: TopicDraft): TopicClass {
  try {
    return topicsLib.topicClassOf(t);
  } catch {
    if (t.nameOrigin === "GEMINI") {
      if (t.decision === "KEPT") return t.grounding === "LINKED" ? "KEPT" : "KEPT_NOT_CHECKED";
      if (t.decision === "EDITED") return "YOURS";
      if (t.domainId && !t.bound) return "PICKED";
      return t.grounding === "LINKED" && t.flags.length === 0 ? "LINKED" : "NOT_CHECKED";
    }
    if (t.decision === "EDITED" || t.nameOrigin === "USER") return "YOURS";
    if (t.nameOrigin === "SYLLABUS") return "SYLLABUS";
    if (t.nameOrigin === "AIM") return "AIM";
    return "LIBRARY";
  }
}

/** A Gemini name behind the count ("n not checked"): shown only once kept. */
const topicHidden = (t: TopicDraft): boolean => topicLive(t) && topicClassFor(t) === "NOT_CHECKED";

/** The edges that count as a topic's parents: yours, cross-goal, and Gemini's drawn ones, none removed. */
const edgeCounts = (x: EdgeDraft): boolean => x.decision !== "REMOVED" && (x.origin !== "GEMINI" || x.drawn);

/** A topic's parents (roadmap-topics parentsOf), read as topics of this map and other goals' Domains; the whole layer before by default. */
function parentsInMapOf(map: TopicMap, t: TopicDraft): { topics: TopicDraft[]; crossGoal: { roadmapId: string; domainId: string }[]; layer: boolean } {
  let set: { kind: "LINKS"; keys: string[]; crossGoal: { roadmapId: string; domainId: string }[] } | { kind: "LAYER"; layer: number };
  try {
    set = topicsLib.parentsOf(map, t.key);
  } catch {
    const edges = map.edges.filter((x) => x.childLineageId === t.lineageId && edgeCounts(x));
    set = edges.length
      ? {
          kind: "LINKS",
          keys: edges.filter((x) => x.origin !== "CROSS_GOAL").map((x) => map.topics.find((p) => p.lineageId === x.parentLineageId)?.key).filter((k): k is string => !!k),
          crossGoal: edges.filter((x) => x.origin === "CROSS_GOAL" && x.parentDomainId && x.parentRoadmapId).map((x) => ({ roadmapId: x.parentRoadmapId as string, domainId: x.parentDomainId as string })),
        }
      : { kind: "LAYER", layer: t.layer - 1 };
  }
  if (set.kind === "LAYER") return { topics: map.topics.filter((p) => topicLive(p) && p.chosen && p.layer === t.layer - 1), crossGoal: [], layer: true };
  const keys = new Set(set.keys);
  return { topics: map.topics.filter((p) => keys.has(p.key) && topicLive(p)), crossGoal: set.crossGoal, layer: false };
}

/** C3: a chosen topic from layer 2 has a chosen parent (a link, a cross-goal Domain, or the whole layer before holding one). */
function topicHasChosenParent(map: TopicMap, t: TopicDraft): boolean {
  if (t.layer <= 1) return true;
  const p = parentsInMapOf(map, t);
  if (!p.layer) return p.crossGoal.length > 0 || p.topics.some((x) => x.chosen);
  // The whole-layer default (C3): the layer before holds a chosen topic. An empty band there (no shown topic: accept
  // refuses it, LAYER_UNKEPT, until you merge it up, write into it or keep a not-checked name) passes to the band above
  // it, so your aim's words under an empty band keep without "A topic needs a parent".
  for (let layer = t.layer - 1; layer >= 1; layer--) {
    const band = map.topics.filter((x) => topicLive(x) && x.layer === layer && !topicHidden(x));
    if (band.length > 0) return band.some((x) => x.chosen);
  }
  return true;
}

/** The roles (DEEP: chosen in the last filled layer, the specialisation) and every chosen topic's NEEDS_PARENT note as the map now stands. */
function settledTopicMapOf(map: TopicMap): TopicMap {
  const k = filledBandsOf(map);
  const topics = map.topics.map((t) => {
    const role: TopicDraft["role"] = topicLive(t) && t.chosen && t.layer === k ? "DEEP" : "BASE";
    return role === t.role ? t : { ...t, role };
  });
  const settled = { ...map, topics };
  return {
    ...settled,
    topics: settled.topics.map((t) => {
      const orphan = topicLive(t) && t.chosen && t.layer > 1 && !topicHasChosenParent(settled, t);
      const has = t.notes.includes("NEEDS_PARENT");
      if (orphan === has) return t;
      return { ...t, notes: orphan ? [...t.notes, "NEEDS_PARENT" as TopicNote] : t.notes.filter((n) => n !== "NEEDS_PARENT") };
    }),
  };
}

/** Removes a topic's links (its parents' and its children's): yours and cross-goal ones go, Gemini's are REMOVED (counted in the run's report). */
function withoutTopicLinksOf(map: TopicMap, lineageId: string, which: "PARENTS" | "CHILDREN" | "BOTH"): TopicMap {
  const touches = (x: EdgeDraft) => (which !== "CHILDREN" && x.childLineageId === lineageId) || (which !== "PARENTS" && x.parentLineageId === lineageId);
  return {
    ...map,
    edges: map.edges.flatMap((x) => (!touches(x) ? [x] : x.origin === "GEMINI" ? [{ ...x, decision: "REMOVED" as const }] : [])),
  };
}

/** The Domains a map uses (ruling 61): every live topic's that is bound or chosen (a PICKED match, unbound and unticked, reserves nothing). */
function topicMapDomainsOf(map: TopicMap): string[] {
  return Array.from(new Set(map.topics.filter((t) => topicLive(t) && t.domainId && (t.bound || t.chosen)).map((t) => t.domainId as string)));
}

/** The Domains a goal holds (§23.5, ruling 61): Roadmap.domainIds and its live and draft maps' bound or chosen topics' Domains. */
function goalTopicDomainsOf(b: RoadmapBundle): string[] {
  const v = b.roadmap.version;
  const out = new Set<string>(goalDomainsOf(b.roadmap));
  for (const ver of [v, v + 1]) for (const id of topicMapDomainsOf(mapOfVersion(b, ver))) out.add(id);
  return [...out];
}

/**
 * DOMAINS_FREE as read across goals (§23.5), the topic maps included: the first of `domainIds` another DRAFT, ACTIVE or
 * PAUSED goal holds, with that goal's shown seat; null when every one is free. The other goals' bundles are read here
 * (a user holds at most GOAL_SLOTS_MAX), and the guard re-checks in the transaction.
 */
async function topicTakenDomainOf(e: Env, userId: string, roadmapId: string, domainIds: readonly string[]): Promise<{ domainId: string; slot: GoalSlot | null } | null> {
  if (domainIds.length === 0) return null;
  const rows = (e.goals.get(userId) ?? (await e.store.listRoadmaps(userId))).filter((r) => r.id !== roadmapId && holdsGoal(r)).sort(bySeatOrder);
  for (const r of rows) {
    const held = new Set<string>(goalDomainsOf(r));
    if (!domainIds.some((d) => held.has(d))) {
      const ob = await e.store.bundle(userId, r.id).catch(() => null);
      if (ob) for (const id of goalTopicDomainsOf(ob)) held.add(id);
    }
    const hit = domainIds.find((d) => held.has(d));
    if (hit) return { domainId: hit, slot: shownSlotOf(r) };
  }
  return null;
}

/** Live recall-or-not cards at OPEN_LEVEL or above in a Domain (the floor's count; the PREREQS_MET guard counts the same rows). */
function cardsAtOpenOf(tree: readonly TreeField[], domainId: string | null): number {
  if (!domainId) return 0;
  for (const f of tree) for (const d of f.domains) if (d.id === domainId) return d.cards.filter((c) => c.level >= OPEN_LEVEL).length;
  return 0;
}

/** A topic's floor: TOPIC_FLOOR_CARDS for a base topic, its Domain's coverage n_d for the specialisation (§22.12). */
function topicFloorOf(tree: readonly TreeField[], t: Pick<TopicDraft, "role" | "domainId">): number {
  if (t.role !== "DEEP") return TOPIC_FLOOR_CARDS;
  let live = 0;
  for (const f of tree) for (const d of f.domains) if (d.id === t.domainId) live = d.cards.filter((c) => c.type == null || isRecallType(c.type)).length;
  return Math.max(TOPIC_FLOOR_CARDS, coveragePolicyOf(live, 0).n);
}

// ── The chain: the map's milestones (realism layeredLadderOf) ──

/** The chain the ladder reads: the filled layers' chosen live topics, held and skipped marked, each with its floor. */
function layeredChainOf(map: TopicMap, depth: TopicDepth, tree: readonly TreeField[], examDay: DayKey | null): realism.TopicChainInput {
  const settled = settledTopicMapOf(map);
  const k = filledBandsOf(settled);
  const layers: realism.TopicChainInput["layers"] = [];
  for (let layer = 1; layer <= k; layer++) {
    const ts = settled.topics.filter((t) => topicLive(t) && t.chosen && t.layer === layer);
    layers.push({
      layer,
      topics: ts.map((t) => ({ lineageId: t.lineageId, domainId: t.domainId, role: t.role, held: t.heldDay != null, skipped: t.skippedDay != null, nd: topicFloorOf(tree, t) })),
    });
  }
  return { layers, depth, ...(examDay ? { examDay } : {}) };
}

/** The Domain names a ladder may write (the map's Domains: titles and labels name only these; an unbound topic has none). */
function topicDomainNamesOf(ctx: Pick<PlanContext, "domains">, map: TopicMap): Record<string, DomainName> {
  return namesOfDomains(ctx, map.topics.filter((t) => topicLive(t) && t.domainId).map((t) => t.domainId as string));
}

/** The layer milestones and depth tail for a map (realism layeredLadderOf, the plan's gate held), as version `v`'s DRAFT rows. */
function layeredPlanOf(e: Env, ctx: PlanContext, map: TopicMap, depth: TopicDepth, v: number): { ok: true; plan: MilestoneDraft[] } | { ok: false; error: string } {
  const gate = gateOf(e, ctx);
  const chain = layeredChainOf(map, depth, ctx.tree, ctx.intake.examLabel ? (ctx.intake.examDay ?? null) : null);
  if (chain.layers.length === 0) return { ok: true, plan: [] };
  const domainIds = topicMapDomainsOf(map);
  const input: RealismInput = { ...realismInputOf(ctx, [], domainIds.length ? [domainIds] : []), planKind: "TOPICS" };
  try {
    const res = realism.layeredLadderOf(ctx.intake, input, chain, topicDomainNamesOf(ctx, map), e.makeId, { gate, excluded: gate.blocked });
    if (!res.ok) return { ok: false, error: res.error };
    const plan = gatePlanRows(res.plan, gate, false, e.makeId).map((d) => ({ ...d, version: v, status: (d.status === "LATER" ? "LATER" : "DRAFT") as MilestoneStatus }));
    return { ok: true, plan };
  } catch (err) {
    if (err instanceof PlanRefused) return { ok: false, error: err.message };
    console.error("roadmap: the topic map's milestones weren't built:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Couldn't build the milestones from your map. Try again." };
  }
}

/** A plan's feasibility for the draft's rows (no depth check: a TOPICS chain's fit is realism's chainFitOf); a blank one when it can't be worked out (logged). */
function topicsFeasibilityOf(e: Env, ctx: PlanContext, plan: readonly MilestoneDraft[], carried: readonly MilestoneDraft[] = []): Feasibility {
  try {
    return feasibilityFor(e, ctx, plan, carried);
  } catch (err) {
    console.error("roadmap: the topic plan's feasibility wasn't worked out:", err instanceof Error ? err.message : err);
    return { today: ctx.today, m: ctx.m, milestones: [], aimCheck: { kind: "unchecked" }, basis: [], remedies: [], impossible: false, over: false };
  }
}

/** The planning context of a TOPICS draft or plan: the row read as TOPICS at that depth (its intake's depth null, topicDepth set). */
async function topicsContextOf(e: Env, userId: string, b: RoadmapBundle, depth: TopicDepth | null, now: Date): Promise<PlanContext> {
  return planContext(e, userId, asTopicsRow(b.roadmap, depth), now, coveragePriorOf(b));
}

/** The tripwire's context for a TOPICS write: the bundle's, with the map's topics and the Domains' origins (ModelTextContext.topics, .domains). */
function topicsTextContextOf(b: RoadmapBundle, tree: readonly TreeField[], map: TopicMap): ModelTextContext {
  return {
    ...modelTextContextOf(b, tree, true),
    topics: map.topics,
    domains: tree.flatMap((f) => f.domains.map((d) => ({ id: d.id, name: d.name, nameOrigin: d.nameOrigin ?? null, originName: d.originName ?? null }))),
  };
}

/**
 * The ops that write a TOPICS draft as `map` stands, guarded on the row as read: the map's rows at the draft version,
 * its milestones rebuilt from it (through the one writer: delete the version's DRAFT and LATER rows, insert the new),
 * the rating where the draft's kind lives (the row's columns on a fresh DRAFT, Roadmap.draftPlan on a re-plan), and the
 * row's updatedAt (so two edits read each other). A refusal in words, or the ops.
 */
async function rebuildTopicsDraftOps(
  e: Env,
  userId: string,
  b: RoadmapBundle,
  map: TopicMap,
  rating: RatingRecord | null,
  depth: TopicDepth,
  now: Date,
  extra: { roadmapData?: Record<string, unknown> } = {}
): Promise<Result<StoreOp[]>> {
  const v = b.roadmap.version + 1;
  const ctx = await topicsContextOf(e, userId, b, depth, now);
  const settled = settledTopicMapOf(map);
  const ladder = layeredPlanOf(e, ctx, settled, depth, v);
  if (!ladder.ok) return fail(ladder.error);
  const facts = draftKindFactsOf(b);
  const where = b.roadmap.status === "DRAFT" ? "DRAFT" : "ACTIVE";
  const kindData: Record<string, unknown> =
    b.roadmap.status === "DRAFT" && b.roadmap.version === 0
      ? { planKind: "TOPICS", depth, rating }
      : facts.inDraftPlan || kindOfRow(b.roadmap) !== "TOPICS"
        ? { draftPlan: { version: v, planKind: "TOPICS", depth, rating } satisfies DraftPlan }
        : {};
  const ops: StoreOp[] = [
    { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: [where], version: b.roadmap.version, updatedAt: b.roadmap.updatedAt } },
    ...domainsFreeOps(topicMapDomainsOf(settled), b.roadmap.id),
    { op: "update", table: "roadmap", where: { id: b.roadmap.id }, data: { ...kindData, ...(extra.roadmapData ?? {}), updatedAt: now } },
    ...mapRowOps(b.roadmap.id, v, settled, now, e.makeId),
  ];
  try {
    const plan = ladder.plan;
    writeRoadmapRows(ops, { kind: "DRAFT", roadmapId: b.roadmap.id, version: v, plan, feasibility: plan.length ? topicsFeasibilityOf(e, ctx, plan) : null, now, makeId: e.makeId }, topicsTextContextOf(b, ctx.tree, settled));
  } catch (err) {
    if (!(err instanceof ModelTextError)) throw err;
    logRefusedWrite("topics", err);
    return fail(CHANGE_NOT_SAVED);
  }
  return ok(ops);
}

/** A TOPICS draft as an edit reads it: the bundle, its map and the draft's own facts; or the refusal. */
interface TopicDraftRead {
  b: RoadmapBundle;
  map: TopicMap;
  facts: DraftKindFacts;
  depth: TopicDepth;
  rating: RatingRecord | null;
}

/**
 * The aim's clauses a TOPICS draft offers under its last band (TopicMapView.lastLayerSeeds, ruling 58), in
 * clauseSplitOf order: less the clauses split into another goal and less those already placed as AIM topics.
 * trackClauseAsGoalCore's `clause` is an index into this list. Throws as clauseSplitOf does.
 */
function offeredClausesOf(roadmap: RoadmapRec, map: TopicMap | null): AimClause[] {
  const split = storedSplitClausesOf(roadmap);
  const placed = new Set((map?.topics ?? []).filter((t) => topicLive(t) && t.nameOrigin === "AIM").map((t) => t.name));
  return topicsLib.clauseSplitOf(roadmap.aim).filter((c) => !split.some((s) => s.start === c.start && s.end === c.end) && !placed.has(c.text));
}

async function topicDraftRead(e: Env, userId: string, roadmapId: string): Promise<Result<TopicDraftRead>> {
  const b = await e.store.bundle(userId, roadmapId);
  if (!b) return fail(NO_ROADMAP);
  if (b.roadmap.status === "PAUSED") return fail("Resume this goal first.");
  if (!isOpen(b.roadmap)) return fail("This roadmap is closed.");
  if (!isTopicsDraft(b)) return fail(NO_TOPIC_DRAFT);
  const facts = draftKindFactsOf(b);
  const depth = facts.depth ?? AIM_DEPTHS[DEPTH_DEFAULT];
  const rating = facts.rating;
  return ok({ b, map: mapOfVersion(b, b.roadmap.version + 1, rating?.layers ?? null), facts, depth, rating });
}

/** One map edit: read, change (or refuse), rebuild and write, retried on a stale guard; `then` maps the ops' success to the result. */
async function topicEdit<T>(
  userId: string,
  roadmapId: string,
  now: Date,
  deps: RoadmapDeps,
  change: (r: TopicDraftRead, e: Env) => Promise<Result<{ map: TopicMap; rating?: RatingRecord | null; depth?: TopicDepth; value: T }>> | Result<{ map: TopicMap; rating?: RatingRecord | null; depth?: TopicDepth; value: T }>
): Promise<RoadmapActionResult<T>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!topicSwitchesOf(deps.topicSwitches).plans) return fail(TOPIC_PLANS_OFF);
  const e = envOf(deps);
  const res = await withRetry<T>(async () => {
    const read = await topicDraftRead(e, userId, roadmapId);
    if (!read.ok) return read;
    const changed = await change(read.value, e);
    if (!changed.ok) return changed;
    const rating = changed.value.rating !== undefined ? changed.value.rating : read.value.rating;
    const ops = await rebuildTopicsDraftOps(e, userId, read.value.b, changed.value.map, rating, changed.value.depth ?? read.value.depth, now);
    if (!ops.ok) return ops;
    const out = await e.store.apply(userId, ops.value);
    return out === "ok" ? ok(changed.value.value) : "stale";
  });
  invalidate("roadmap");
  return pointedRefusal(deps, userId, { roadmapId }, res);
}

/** A topic of the map by key, live, or the refusal. */
function liveTopicByKey(map: TopicMap, key: unknown): Result<TopicDraft> {
  if (typeof key !== "string" || !topicsLib.TOPIC_KEY_PATTERN.test(key)) return fail(TOPIC_GONE);
  const t = map.topics.find((x) => x.key === key);
  return t && topicLive(t) ? ok(t) : fail(TOPIC_GONE);
}

const withTopicChanged = (map: TopicMap, t: TopicDraft): TopicMap => ({ ...map, topics: map.topics.map((x) => (x.lineageId === t.lineageId ? t : x)) });

/** A name a user typed for a topic: one line, 1..TOPIC_LABEL_MAX characters, no link; else the refusal. */
function typedTopicNameOf(raw: unknown): Result<string> {
  const name = cleanText(raw);
  if (!name) return fail("Name the topic.");
  if (Array.from(name).length > TOPIC_LABEL_MAX) return fail(`Keep a topic's name to ${TOPIC_LABEL_MAX} characters.`);
  if (URL_LIKE.test(name)) return fail("A topic's name can't be a link.");
  return ok(name);
}

/** roadmap-topics formKeyOf (ruling 10's plural rule); NFKC, case folded and single-spaced when that lane can't answer. */
function topicFormKey(name: string): string {
  try {
    return topicsLib.formKeyOf(name);
  } catch {
    return normLabel(name);
  }
}

// ── The cores (§22.14; lane 8) ──

/**
 * [Write the topics] (ruling 58): the no-Gemini TOPICS draft on a fresh DRAFT of a Field Area. An INHOUSE run with phase
 * null, code's rating (roadmap-rating codeRatingOf, origin CODE), the written map (your lines placed by code over the
 * bands, your Domains chosen in layer 1, the Area's free Domains offered as layer-1 seeds, your clauses as last-layer
 * seeds) and its layer milestones, the row's columns set to TOPICS (ruling 14). Behind TOPIC_PLANS_LIVE.
 */
export async function writeTopicsCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ version: number }>> {
  return pointedRefusal(deps, userId, { roadmapId }, await writtenTopicsCore(userId, roadmapId, "FRESH", now, deps));
}

/**
 * [Break into topics] (ruling 49, ruling 58): the same no-Gemini TOPICS draft on an ACTIVE LEVELS plan, written at
 * version + 1 with its own kind, depth and rating in Roadmap.draftPlan; version N stays live until accept, and every
 * reader of the live plan reads it byte for byte as before. [Break it down] then runs the Gemini chain on this draft
 * (breakDownCore, lane 10). Behind TOPIC_PLANS_LIVE.
 */
export async function breakIntoTopicsCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ version: number }>> {
  return pointedRefusal(deps, userId, { roadmapId }, await writtenTopicsCore(userId, roadmapId, "REPLAN", now, deps));
}

async function writtenTopicsCore(userId: string, roadmapId: string, mode: "FRESH" | "REPLAN", now: Date, deps: RoadmapDeps): Promise<RoadmapActionResult<{ version: number }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!topicSwitchesOf(deps.topicSwitches).plans) return fail(TOPIC_PLANS_OFF);
  const e = envOf(deps);
  const res = await withRetry<{ version: number }>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (mode === "FRESH" && b.roadmap.status !== "DRAFT") return fail(b.roadmap.status === "ACTIVE" ? "Break the accepted plan into topics from its page." : "This roadmap is closed.");
    if (mode === "REPLAN") {
      if (b.roadmap.status === "PAUSED") return fail("Resume this goal first.");
      if (b.roadmap.status !== "ACTIVE") return fail("Only an accepted plan is broken into topics; write the topics on a draft.");
      if (kindOfRow(b.roadmap) === "TOPICS") return fail("This plan is a topic map already: re-fit it, or change the map.");
      if (legacyOf(b)) return fail(START_AGAIN_AT_DEPTH);
      if (planRowsOf(b).some((m) => m.status === "STARTING")) return fail("A milestone is starting: tap Finish starting first.");
    }
    if (b.roadmap.fieldId == null) return fail(TOPICS_FIELD_ONLY);
    return writtenTopicsDraft(e, userId, b, mode, now);
  });
  invalidate("roadmap");
  return res;
}

/** The written map and its milestones for a bundle (writeTopicsCore, breakIntoTopicsCore): the ops applied, or the refusal. */
async function writtenTopicsDraft(e: Env, userId: string, b: RoadmapBundle, mode: "FRESH" | "REPLAN", now: Date): Promise<Result<{ version: number }> | "stale"> {
  const today = todayKey(now);
  const tree = await e.io.fieldTree();
  const field = tree.find((f) => f.id === b.roadmap.fieldId) ?? null;
  if (!field) return fail("That Field no longer exists.");
  const intake = intakeOf(b.roadmap);
  const depth: TopicDepth = topicDepthOfRow(b.roadmap) ?? AIM_DEPTHS[DEPTH_DEFAULT];
  const lines = intake.syllabus?.lines ?? [];
  // The plan's Domains: the intake's (and on an accepted plan the additions you confirmed), each a U key in layer 1.
  const chosenIds = (mode === "REPLAN" ? requiredDomainsOf(b, planRowsOf(b)) : intake.domainIds).filter((id) => field.domains.some((d) => d.id === id));
  const domains = chosenIds.map((id, i) => ({ key: `U${i + 1}`, id, name: field.domains.find((d) => d.id === id)?.name ?? "" }));
  // The layer-1 seeds: the Area's Domains you didn't choose that no other goal holds (§23.5).
  const others = (e.goals.get(userId) ?? []).filter((r) => r.id !== b.roadmap.id && holdsGoal(r));
  const held = new Set(others.flatMap((r) => [...goalDomainsOf(r)]));
  const library = field.domains.filter((d) => !chosenIds.includes(d.id) && !held.has(d.id)).map((d) => ({ id: d.id, name: d.name }));
  const splitClauses = storedSplitClausesOf(b.roadmap);
  let rating: RatingRecord;
  let map: TopicMap;
  try {
    const inputKey = ratingLib.ratingKeyOf({ aim: b.roadmap.aim, areaName: field.name, outline: lines, examLabel: b.roadmap.examLabel, splitClauses });
    rating = ratingLib.codeRatingOf({ trackArea: false, outlineLines: lines.length, texts: { aim: b.roadmap.aim, areaName: field.name, constraints: b.roadmap.constraints }, inputKey, day: today });
    map = topicsLib.writtenMapOf({ aim: b.roadmap.aim, lines, layers: rating.layers, domains, library, splitClauses, makeId: e.makeId }).map;
  } catch (err) {
    console.error("roadmap: the written topic map wasn't built:", err instanceof Error ? err.message : err);
    return fail("Couldn't write the topic map. Try again.");
  }
  const v = b.roadmap.version + 1;
  const ops = await rebuildTopicsDraftOps(e, userId, mode === "FRESH" ? b : { ...b, roadmap: { ...b.roadmap, draftPlan: null } }, { ...map, layers: clampBands(rating.layers) }, rating, depth, now);
  if (!ops.ok) return ops;
  const runId = e.makeId();
  const head: StoreOp[] = [
    // A draft that was running gives way to the map you write (as "Build from my numbers" does).
    ...(mode === "FRESH" ? [{ op: "update", table: "roadmapRun", where: { roadmapId: b.roadmap.id, status: "RUNNING" }, data: { status: "FAILED", error: "replaced by your topic map", finishedAt: now } } satisfies StoreOp] : []),
    { op: "insert", table: "roadmapRun", rows: [runRow(runId, userId, b.roadmap.id, today, v, "INHOUSE", "OK", now, { finishedAt: now })] },
  ];
  const out = await e.store.apply(userId, [...ops.value, ...head]);
  return out === "ok" ? ok({ version: v }) : "stale";
}

/**
 * The bands (§22.14 setLayersCore): SET (your count, roadmap-rating ratingOverrideOf: origin YOURS), FEWER, or
 * PLAN_FIRST (ruling 42: the topics deeper than N leave the plan, REMOVED with PLANNED_LATER, kept on the run as a note
 * for a later goal). SET and FEWER move a deeper topic into the last band you keep (placed by you). LAYERS_BOUNDS
 * outside 1..6.
 */
export async function setLayersCore(userId: string, roadmapId: string, change: LayerSetChange, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  const kind = change && typeof change === "object" ? change.kind : null;
  const layers = change && typeof change === "object" ? change.layers : NaN;
  if (kind !== "SET" && kind !== "FEWER" && kind !== "PLAN_FIRST") return fail(LAYERS_BOUNDS);
  if (!Number.isInteger(layers) || layers < LAYERS_MIN || layers > LAYERS_MAX) return fail(LAYERS_BOUNDS);
  return topicEdit<null>(userId, roadmapId, now, deps, ({ map, rating }) => {
    const day = todayKey(now);
    const from = rating?.layers ?? map.layers;
    let next: RatingRecord | null = rating;
    if (rating) {
      const r = kind === "SET" ? ratingLib.ratingOverrideOf(rating, layers, day) : ratingLib.withLayerChangeOf(rating, { kind, from, to: layers, day });
      if (!r.ok) return fail(r.error);
      next = r.value;
    }
    const topics = map.topics.map((t) => {
      if (!topicLive(t) || t.layer <= layers) return t;
      if (kind === "PLAN_FIRST") return { ...t, decision: "REMOVED" as const, chosen: false, notes: t.notes.includes("PLANNED_LATER") ? t.notes : [...t.notes, "PLANNED_LATER" as const] };
      return { ...t, layer: layers, placedBy: "YOU" as const };
    });
    let out: TopicMap = { ...map, layers, topics };
    // A topic moved up a layer keeps no link that no longer goes from layer N + 1 to layer N (C1).
    for (const t of topics) if (map.topics.find((x) => x.lineageId === t.lineageId)?.layer !== t.layer) out = withoutTopicLinksOf(out, t.lineageId, "BOTH");
    return ok({ map: out, rating: next, value: null });
  });
}

/**
 * [Keep these] on one layer (§22.14 keepLayerCore): its shown topics PENDING → KEPT (a name behind the count stays
 * there: keepGeminiNameCore keeps one) and its Gemini links drawn into it KEPT. Refused while a chosen topic of it has
 * no chosen parent (C3: TOPIC_NEEDS_PARENT); its Domains are this goal's (DOMAINS_FREE). `kept`: the topics kept.
 */
export async function keepLayerCore(userId: string, roadmapId: string, layer: number, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ kept: number }>> {
  if (!Number.isInteger(layer) || layer < LAYERS_MIN || layer > LAYERS_MAX) return fail(LAYER_GONE);
  return topicEdit<{ kept: number }>(userId, roadmapId, now, deps, async ({ map }, e) => {
    if (layer > map.layers) return fail(LAYER_GONE);
    const settled = settledTopicMapOf(map);
    const inLayer = settled.topics.filter((t) => topicLive(t) && t.layer === layer && !topicHidden(t));
    if (inLayer.some((t) => t.chosen && !topicHasChosenParent(settled, t))) return fail(TOPIC_NEEDS_PARENT);
    const taken = await topicTakenDomainOf(e, userId, roadmapId, topicMapDomainsOf({ ...settled, topics: inLayer }));
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
    const keep = new Set(inLayer.filter((t) => t.decision === "PENDING").map((t) => t.lineageId));
    const lineages = new Set(inLayer.map((t) => t.lineageId));
    const out: TopicMap = {
      ...settled,
      topics: settled.topics.map((t) => (keep.has(t.lineageId) ? { ...t, decision: "KEPT" as const } : t)),
      edges: settled.edges.map((x) => (lineages.has(x.childLineageId) && x.origin === "GEMINI" && x.drawn && x.decision === "PENDING" ? { ...x, decision: "KEPT" as const } : x)),
    };
    return ok({ map: out, value: { kept: keep.size } });
  });
}

/**
 * [Write one] (§22.14 addTopicCore): a topic you name in a band, chosen, yours (USER, grounding OWN, placed by you). A
 * name equal to one of the Area's free Domains in layer 1 is that seed, bound to it (LIBRARY); the exact words of one
 * of your aim's clauses in the last band are that clause (AIM). Its key is the next T key.
 */
export async function addTopicCore(userId: string, roadmapId: string, layer: number, name: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ key: string }>> {
  if (!Number.isInteger(layer) || layer < LAYERS_MIN || layer > LAYERS_MAX) return fail(LAYER_GONE);
  const named = typedTopicNameOf(name);
  if (!named.ok) return named;
  return topicEdit<{ key: string }>(userId, roadmapId, now, deps, async ({ b, map }, e) => {
    if (layer > map.layers) return fail(LAYER_GONE);
    const words = named.value;
    const fk = topicFormKey(words);
    if (map.topics.some((t) => topicLive(t) && topicFormKey(t.name) === fk)) return fail(TOPIC_TWICE);
    const key = nextTopicKey(map);
    if (!topicsLib.TOPIC_KEY_PATTERN.test(key)) return fail("This map holds as many topics as it can.");
    const tree = await e.io.fieldTree();
    const field = tree.find((f) => f.id === b.roadmap.fieldId) ?? null;
    const seed = layer === 1 ? (field?.domains.find((d) => topicFormKey(d.name) === fk && !map.topics.some((t) => topicLive(t) && t.domainId === d.id)) ?? null) : null;
    if (seed) {
      const taken = await topicTakenDomainOf(e, userId, roadmapId, [seed.id]);
      if (taken) return fail(DOMAIN_TAKEN(taken.slot));
    }
    let clause: AimClause | null = null;
    if (!seed && layer === map.layers) {
      try {
        const split = storedSplitClausesOf(b.roadmap);
        clause = topicsLib.clauseSplitOf(b.roadmap.aim).find((c) => c.text === words && !split.some((s) => s.start === c.start && s.end === c.end)) ?? null;
      } catch {
        clause = null;
      }
    }
    const t: TopicDraft = {
      id: null,
      lineageId: e.makeId(),
      key,
      layer,
      name: seed ? seed.name : words,
      rawName: null,
      nameOrigin: seed ? "LIBRARY" : clause ? "AIM" : "USER",
      scope: null,
      placedBy: "YOU",
      grounding: "OWN",
      sources: [],
      formVotes: 0,
      samples: 0,
      layerVotes: [],
      decision: "KEPT",
      mergedInto: null,
      chosen: true,
      role: "BASE",
      domainId: seed ? seed.id : null,
      bound: !!seed,
      heldDay: null,
      skippedDay: null,
      flags: [],
      notes: [],
    };
    return ok({ map: { ...map, topics: [...map.topics, t] }, value: { key } });
  });
}

/**
 * A topic's ▸ sheet (§22.14 editTopicCore): RENAME (your words: EDITED, so it reads YOURS; a bound topic is named by
 * its Domain, renamed in the library), MERGE into another live topic (MERGED; the other notes MERGED_BY_YOU), or REMOVE
 * (REMOVED). A merged or removed topic's links go (a child left with none notes NEEDS_PARENT: C3, never re-parented).
 */
export async function editTopicCore(userId: string, roadmapId: string, key: string, edit: TopicEdit, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  const kind = edit && typeof edit === "object" ? edit.kind : null;
  if (kind !== "RENAME" && kind !== "MERGE" && kind !== "REMOVE") return fail("Rename, merge or remove the topic.");
  return topicEdit<null>(userId, roadmapId, now, deps, ({ map }) => {
    const found = liveTopicByKey(map, key);
    if (!found.ok) return found;
    const t = found.value;
    if (edit.kind === "RENAME") {
      if (t.bound || /^U\d+$/.test(t.key)) return fail("This topic is one of your Domains: rename it in your library.");
      const named = typedTopicNameOf(edit.name);
      if (!named.ok) return named;
      const fk = topicFormKey(named.value);
      if (map.topics.some((x) => x.lineageId !== t.lineageId && topicLive(x) && topicFormKey(x.name) === fk)) return fail(TOPIC_TWICE);
      return ok({ map: withTopicChanged(map, { ...t, name: named.value, decision: "EDITED", grounding: "OWN", sources: [] }), value: null });
    }
    if (edit.kind === "MERGE") {
      const into = liveTopicByKey(map, edit.into);
      if (!into.ok) return into;
      if (into.value.lineageId === t.lineageId) return fail("Pick another topic to merge into.");
      const target = into.value;
      let out = withTopicChanged(map, { ...t, decision: "MERGED", mergedInto: target.lineageId, chosen: false });
      out = withTopicChanged(out, { ...target, chosen: target.chosen || t.chosen, notes: target.notes.includes("MERGED_BY_YOU") ? target.notes : [...target.notes, "MERGED_BY_YOU" as TopicNote] });
      return ok({ map: withoutTopicLinksOf(out, t.lineageId, "BOTH"), value: null });
    }
    return ok({ map: withoutTopicLinksOf(withTopicChanged(map, { ...t, decision: "REMOVED", chosen: false }), t.lineageId, "BOTH"), value: null });
  });
}

/** [Move to layer…] (§22.14 moveTopicCore; ruling 50: a topic changes layer only here, on a draft): placed by you, its links dropped (C1). */
export async function moveTopicCore(userId: string, roadmapId: string, key: string, layer: number, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (!Number.isInteger(layer) || layer < LAYERS_MIN || layer > LAYERS_MAX) return fail(LAYER_GONE);
  return topicEdit<null>(userId, roadmapId, now, deps, ({ map }) => {
    if (layer > map.layers) return fail(LAYER_GONE);
    const found = liveTopicByKey(map, key);
    if (!found.ok) return found;
    const t = found.value;
    if (t.layer === layer) return fail("The topic is in that layer already.");
    const moved = withTopicChanged(map, { ...t, layer, placedBy: "YOU", notes: t.notes.filter((n) => n !== "NEEDS_PARENT" && n !== "PLACED_BY_GEMINI") });
    return ok({ map: withoutTopicLinksOf(moved, t.lineageId, "BOTH"), value: null });
  });
}

/**
 * [Builds on…] (§22.14 setParentsCore): LINKS (topics of the layer before, yours: USER, kept; Gemini's drawn ones you
 * pick stay Gemini's, KEPT, and the rest are REMOVED) and read-only cross-goal parents (another DRAFT, ACTIVE or
 * PAUSED goal's Domain: origin CROSS_GOAL, parentLineageId "x:<domainId>", ruling 48), at most EDGE_PARENTS_MAX in all
 * and EDGE_CHILDREN_MAX children a parent (C4); or LAYER (the whole layer before: no edge row).
 */
export async function setParentsCore(userId: string, roadmapId: string, key: string, pick: ParentPick, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  const kind = pick && typeof pick === "object" ? pick.kind : null;
  if (kind !== "LINKS" && kind !== "LAYER") return fail("Pick what it builds on, or the whole layer before.");
  return topicEdit<null>(userId, roadmapId, now, deps, async ({ map }, e) => {
    const found = liveTopicByKey(map, key);
    if (!found.ok) return found;
    const child = found.value;
    if (child.layer <= 1) return fail("A layer-1 topic builds on nothing before it.");
    // Drop what the child had: yours and cross-goal ones go, Gemini's become REMOVED unless picked again below.
    let out = withoutTopicLinksOf(map, child.lineageId, "PARENTS");
    if (pick.kind === "LINKS") {
      const keys = Array.isArray(pick.keys) ? Array.from(new Set(pick.keys.filter((k): k is string => typeof k === "string"))) : [];
      const cross = Array.isArray(pick.crossGoal) ? pick.crossGoal.filter((c) => c && typeof c.roadmapId === "string" && typeof c.domainId === "string") : [];
      if (keys.length + cross.length === 0) return fail("Pick at least one topic it builds on, or the whole layer before.");
      if (keys.length + cross.length > EDGE_PARENTS_MAX) return fail(`A topic builds on at most ${EDGE_PARENTS_MAX}.`);
      const parents: TopicDraft[] = [];
      for (const k of keys) {
        const p = map.topics.find((x) => x.key === k && topicLive(x));
        if (!p || p.layer !== child.layer - 1) return fail("A topic builds on topics of the layer just before it.");
        const children = out.edges.filter((x) => x.parentLineageId === p.lineageId && edgeCounts(x) && x.childLineageId !== child.lineageId).length;
        if (children + 1 > EDGE_CHILDREN_MAX) return fail(`A topic feeds at most ${EDGE_CHILDREN_MAX} in the next layer.`);
        parents.push(p);
      }
      const rows = (e.goals.get(userId) ?? (await e.store.listRoadmaps(userId))).filter((r) => r.id !== roadmapId && holdsGoal(r));
      for (const c of cross) {
        const goal = rows.find((r) => r.id === c.roadmapId);
        const ob = goal ? await e.store.bundle(userId, goal.id).catch(() => null) : null;
        if (!ob || !goalTopicDomainsOf(ob).includes(c.domainId)) return fail("That Domain isn't in one of your other goals.");
      }
      const picked = new Set(parents.map((p) => p.lineageId));
      out = {
        ...out,
        edges: [
          ...out.edges.map((x) => (x.childLineageId === child.lineageId && x.origin === "GEMINI" && picked.has(x.parentLineageId) ? { ...x, decision: "KEPT" as const } : x)),
          ...parents
            .filter((p) => !out.edges.some((x) => x.childLineageId === child.lineageId && x.parentLineageId === p.lineageId && x.origin === "GEMINI"))
            .map((p): EdgeDraft => ({ id: null, parentLineageId: p.lineageId, childLineageId: child.lineageId, parentDomainId: null, parentRoadmapId: null, origin: "USER", votes: 0, samples: 0, drawn: false, decision: "KEPT", match: "NONE" })),
          ...cross.map(
            (c): EdgeDraft => ({
              id: null,
              parentLineageId: `${CROSS_GOAL_PARENT_PREFIX}${c.domainId}`,
              childLineageId: child.lineageId,
              parentDomainId: c.domainId,
              parentRoadmapId: c.roadmapId,
              origin: "CROSS_GOAL",
              votes: 0,
              samples: 0,
              drawn: false,
              decision: "KEPT",
              match: "NONE",
            })
          ),
        ],
      };
      const notes = child.notes.filter((n) => n !== "NEEDS_PARENT" && n !== "CROSS_GOAL_PARENT");
      out = withTopicChanged(out, { ...child, notes: cross.length ? [...notes, "CROSS_GOAL_PARENT" as TopicNote] : notes });
    } else {
      out = withTopicChanged(out, { ...child, notes: child.notes.filter((n) => n !== "NEEDS_PARENT" && n !== "CROSS_GOAL_PARENT") });
    }
    return ok({ map: out, value: null });
  });
}

/**
 * [Use my Domain…] (§22.14 useMyDomainCore): the topic bound to one of the Area's Domains no other goal holds and no
 * other topic of the map uses (your tap: LIBRARY, chosen, named by the Domain), so "held when you began" can be
 * measured; null unbinds it (its words stay, now yours). An intake Domain's topic stays bound (remove it instead).
 */
export async function useMyDomainCore(userId: string, roadmapId: string, key: string, domainId: string | null, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (domainId !== null && (typeof domainId !== "string" || !STEP_REF.test(domainId))) return fail("Pick one of your Domains.");
  return topicEdit<null>(userId, roadmapId, now, deps, async ({ b, map }, e) => {
    const found = liveTopicByKey(map, key);
    if (!found.ok) return found;
    const t = found.value;
    if (domainId === null) {
      if (/^U\d+$/.test(t.key)) return fail("An intake Domain stays bound: remove the topic instead.");
      if (!t.domainId) return fail("This topic isn't bound to a Domain.");
      return ok({ map: withTopicChanged(map, { ...t, domainId: null, bound: false, nameOrigin: "USER", grounding: "OWN", sources: [] }), value: null });
    }
    const tree = await e.io.fieldTree();
    const d = tree.find((f) => f.id === b.roadmap.fieldId)?.domains.find((x) => x.id === domainId) ?? null;
    if (!d) return fail("Pick one of this Area's Domains.");
    if (map.topics.some((x) => x.lineageId !== t.lineageId && topicLive(x) && x.domainId === domainId && (x.bound || x.chosen))) return fail("Another topic of this map uses that Domain.");
    const taken = await topicTakenDomainOf(e, userId, roadmapId, [domainId]);
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
    return ok({ map: withTopicChanged(map, { ...t, domainId, bound: true, chosen: true, name: d.name, nameOrigin: "LIBRARY", grounding: "OWN", sources: [] }), value: null });
  });
}

/**
 * A tick (§22.14 chooseTopicCore): chosen with what it builds on (roadmap-topics chooseClosureOf: its drawn or picked
 * parents, recursively, or the layer before's first chosen topic); a PICKED match ticked is bound (your tap), and a
 * name behind the count is kept by its tick (KEPT_NOT_CHECKED). An untick unchooses that topic only; a layer-1 row that
 * starts chosen (your lines, typed topics, intake Domains, your aim's words) is removed, not unticked (ruling 62).
 * `chosen`: the keys the tick chose.
 */
export async function chooseTopicCore(userId: string, roadmapId: string, key: string, chosen: boolean, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ chosen: string[] }>> {
  if (chosen !== true && chosen !== false) return fail("Tick it or untick it.");
  return topicEdit<{ chosen: string[] }>(userId, roadmapId, now, deps, async ({ map }, e) => {
    const found = liveTopicByKey(map, key);
    if (!found.ok) return found;
    const t = found.value;
    if (!chosen) {
      const cls = topicClassFor(t);
      if (t.layer === 1 && (cls === "SYLLABUS" || cls === "YOURS" || cls === "AIM" || cls === "LINKED" || /^U\d+$/.test(t.key))) return fail("This one starts in the plan: remove it instead.");
      return ok({ map: withTopicChanged(map, { ...t, chosen: false }), value: { chosen: [] } });
    }
    let closure: string[];
    try {
      closure = topicsLib.chooseClosureOf(map, key);
    } catch {
      closure = [];
    }
    const keys = Array.from(new Set([key, ...closure]));
    const ticked = map.topics.filter((x) => keys.includes(x.key) && topicLive(x));
    const bindIds = ticked.filter((x) => x.domainId).map((x) => x.domainId as string);
    const taken = await topicTakenDomainOf(e, userId, roadmapId, bindIds);
    if (taken) return fail(DOMAIN_TAKEN(taken.slot));
    let out = map;
    for (const x of ticked) {
      const cls = topicClassFor(x);
      out = withTopicChanged(out, {
        ...x,
        chosen: true,
        // A PICKED match or a seed you tick is yours to bind; a not-checked name you tick is kept by you.
        ...(x.domainId && !x.bound ? { bound: true } : {}),
        ...(cls === "NOT_CHECKED" && x.decision === "PENDING" ? { decision: "KEPT" as const } : {}),
      });
    }
    return ok({ map: out, value: { chosen: ticked.filter((x) => !x.chosen).map((x) => x.key) } });
  });
}

/**
 * [Keep] on a name behind the count (§22.14 keepGeminiNameCore): a Gemini name not checked, kept by you («Gemini ·
 * kept · not checked»: KEPT, chosen; the class never changes who it came from).
 */
export async function keepGeminiNameCore(userId: string, roadmapId: string, key: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  return topicEdit<null>(userId, roadmapId, now, deps, ({ map }) => {
    const found = liveTopicByKey(map, key);
    if (!found.ok) return found;
    const t = found.value;
    if (t.nameOrigin !== "GEMINI" || topicClassFor(t) !== "NOT_CHECKED") return fail("Only a not-checked Gemini name is kept this way.");
    return ok({ map: withTopicChanged(map, { ...t, decision: "KEPT", chosen: true }), value: null });
  });
}

/**
 * [Merge with the layer above] (§22.14 mergeLayerUpCore; roadmap-topics mergeLayerUpOf): the layer's topics move up one,
 * the links between the merged layers drop (counted: `droppedLinks`), the deeper layers renumber, and the rating
 * records it (MERGED, yours and shown for good: "· 1 merged by you").
 */
export async function mergeLayerUpCore(userId: string, roadmapId: string, layer: number, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ droppedLinks: number }>> {
  if (!Number.isInteger(layer) || layer < 2 || layer > LAYERS_MAX) return fail("Layer 1 has no layer above it.");
  return topicEdit<{ droppedLinks: number }>(userId, roadmapId, now, deps, ({ map, rating }) => {
    if (layer > map.layers) return fail(LAYER_GONE);
    let merged: { map: TopicMap; droppedLinks: number };
    try {
      merged = topicsLib.mergeLayerUpOf(map, layer);
    } catch (err) {
      console.error("roadmap: the layer merge wasn't worked out:", err instanceof Error ? err.message : err);
      return fail("Couldn't merge the layer. Try again.");
    }
    let next = rating;
    if (rating) {
      const r = ratingLib.withLayerChangeOf(rating, { kind: "MERGED", from: map.layers, to: Math.max(LAYERS_MIN, map.layers - 1), day: todayKey(now) });
      if (!r.ok) return fail(r.error);
      next = r.value;
    }
    return ok({ map: { ...merged.map, layers: clampBands(map.layers - 1) }, rating: next, value: { droppedLinks: merged.droppedLinks } });
  });
}

/**
 * "I know this" (§22.14 skipTopicCore; ruling 59). On a draft: the topic's skippedDay (KNOWN_BY_YOU), and the
 * milestones rebuilt (its measures CONTEXT). On an ACTIVE TOPICS plan, on an unstarted (PLANNED or LATER) milestone, in
 * place with no new version: the topic's paying measures become CONTEXT and its skippedDay is set, for good (an undo
 * is refused: re-plan to measure it again); a milestone whose every topic is now held or skipped gives no rank (its
 * rankIndex null; no other rank moves: G is fixed at accept). Refused on a STARTING or STARTED milestone ("Close it
 * first."). The Proficiency end-state term stays (decision 66).
 */
export async function skipTopicCore(userId: string, roadmapId: string, key: string, skip: boolean, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<null>> {
  if (skip !== true && skip !== false) return fail("Mark it as known, or not.");
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!topicSwitchesOf(deps.topicSwitches).plans) return fail(TOPIC_PLANS_OFF);
  const e = envOf(deps);
  const peek = await e.store.bundle(userId, roadmapId);
  if (!peek) return fail(NO_ROADMAP);
  const onDraft = isTopicsDraft(peek) && mapOfVersion(peek, peek.roadmap.version + 1).topics.some((t) => t.key === key);
  if (onDraft) {
    return topicEdit<null>(userId, roadmapId, now, deps, ({ map }) => {
      const found = liveTopicByKey(map, key);
      if (!found.ok) return found;
      const t = found.value;
      const notes = t.notes.filter((n) => n !== "KNOWN_BY_YOU");
      return ok({ map: withTopicChanged(map, { ...t, skippedDay: skip ? todayKey(now) : null, notes: skip ? [...notes, "KNOWN_BY_YOU" as TopicNote] : notes }), value: null });
    });
  }
  const res = await withRetry<null>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    if (b.roadmap.status !== "ACTIVE" || kindOfRow(b.roadmap) !== "TOPICS") return fail(NO_TOPIC_DRAFT);
    const cur = b.roadmap.version;
    const map = mapOfVersion(b, cur);
    const found = liveTopicByKey(map, key);
    if (!found.ok) return found;
    const t = found.value;
    if (!skip) return fail("You marked it as known for good: re-plan to measure it again.");
    if (t.skippedDay) return ok(null);
    // The milestones it pays on: refused while one of them is under way, changed in place where none has started.
    const rows = planRowsOf(b).filter((m) => m.measures.some((x) => x.topicLineageId === t.lineageId && x.role === "PAYS"));
    if (rows.some((m) => isCarried(m) && m.reachedDay == null && !superseded(b, m))) return fail(SKIP_CLOSE_FIRST);
    const today = todayKey(now);
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["ACTIVE"], version: cur } }];
    const known = new Set(map.topics.filter((x) => x.skippedDay != null || x.heldDay != null).map((x) => x.lineageId));
    known.add(t.lineageId);
    for (const m of rows) {
      if (m.status !== "PLANNED" && m.status !== "LATER") continue;
      ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } });
      for (const x of m.measures) if (x.topicLineageId === t.lineageId && x.role === "PAYS") ops.push({ op: "update", table: "roadmapMeasure", where: { id: x.id }, data: { role: "CONTEXT" } });
      // Every topic of it held or skipped: it gives no rank (the others keep theirs: G is fixed at accept).
      const own = Array.from(new Set(m.measures.map((x) => x.topicLineageId).filter((l): l is string => !!l)));
      if (own.length && own.every((l) => known.has(l)) && m.rankIndex != null) ops.push({ op: "update", table: "roadmapMilestone", where: { id: m.id, status: m.status }, data: { rankIndex: null } });
    }
    const notes = t.notes.includes("KNOWN_BY_YOU") ? t.notes : [...t.notes, "KNOWN_BY_YOU" as TopicNote];
    ops.push({ op: "update", table: "roadmapTopic", where: { id: t.id as string }, data: { skippedDay: today, notes, updatedAt: now } });
    const out = await e.store.apply(userId, ops);
    return out === "ok" ? ok(null) : "stale";
  });
  invalidate("roadmap");
  return pointedRefusal(deps, userId, { roadmapId }, res);
}

/**
 * [Track as its own goal] (ruling 31, ruling 66; F-R5-7): one of your aim's clauses becomes a DUTY draft in a free
 * seat at once (fieldId null, aim the clause verbatim, HOURS_MIN until its first save, which asks for its hours), and
 * this goal records it in Roadmap.splitClauses ("tracked in goal 2"; its packs, seeds and estimate leave it out). Only
 * with a free seat under GOALS_MAX (else ANOTHER_ACTIVE at GOALS_MAX 1, GOALS_FULL at 3) and room for HOURS_MIN in the
 * week (else the hours line). The same createKey returns the same id. Never automatic.
 */
export async function trackClauseAsGoalCore(userId: string, roadmapId: string, clause: number, createKey: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ roadmapId: string }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  if (!topicSwitchesOf(deps.topicSwitches).plans) return fail(TOPIC_PLANS_OFF);
  if (!Number.isInteger(clause) || clause < 0 || typeof createKey !== "string" || !CREATE_KEY.test(createKey)) return fail(NO_TARGET);
  const e = envOf(deps);
  const tree = await e.io.fieldTree();
  const res = await withRetry<{ roadmapId: string }>(async () => {
    const all = await e.store.listRoadmaps(userId);
    const made = all.find((r) => r.createKey === createKey);
    if (made) return ok({ roadmapId: made.id });
    const goal = all.find((r) => r.id === roadmapId) ?? null;
    if (!goal) return fail(NO_ROADMAP);
    if (!holdsGoal(goal)) return fail("This roadmap is closed.");
    // `clause` indexes the clauses the map offers under its last band (TopicMapView.lastLayerSeeds; the join's
    // reconcile of lanes 8 and 9): the aim's clauses less the split ones and less those placed as AIM topics.
    const read = await topicDraftRead(e, userId, roadmapId);
    let clauses: AimClause[];
    try {
      clauses = offeredClausesOf(goal, read.ok ? read.value.map : null);
    } catch {
      return fail("Couldn't read the parts of your aim. Try again.");
    }
    const c = clauses[clause];
    if (!c) return fail(NO_TARGET);
    const split = storedSplitClausesOf(goal);
    if (split.some((s) => s.start === c.start && s.end === c.end)) return fail("That part of your aim is tracked in another goal already.");
    const slot = seatForNewOf(all.map((r) => goalRowOf(r)));
    if (slot == null) return fail(noSeatLine());
    const hoursLine = hoursRefusalOf(all, HOURS_MIN, null);
    if (hoursLine) return fail(hoursLine);
    const today = todayKey(now);
    const span = daysBetween(today, goal.targetDay);
    const intake: Intake = {
      aim: c.text,
      fieldId: null,
      track: "DUTY",
      domainIds: [],
      targetDay: span >= SPAN_MIN_DAYS && span <= SPAN_MAX_DAYS ? goal.targetDay : addDays(today, SPAN_MIN_DAYS),
      hoursPerWeek: HOURS_MIN,
      newCardsPerWeek: null,
      typicalHours: null,
      typicalHoursSource: null,
      syllabus: null,
      startPoint: "NEW",
      intensity: "STEADY",
      practicesAllowed: true,
      constraints: null,
      examLabel: null,
      depth: null,
      coverage: null,
      dateMode: "CHOSEN",
      exam: null,
      examDay: null,
      suggestAreas: false,
      practiceFamily: null,
    };
    const id = e.makeId();
    const row: RoadmapRec = { ...intakeRowOf(userId, intake, now), id, slot };
    if (labelClashFor(all, tree, row, null)) return fail(LABEL_CLASH);
    const nextSplit: SplitClause[] = [...split, { start: c.start, end: c.end, text: c.text, roadmapId: id, day: today }];
    const out = await e.store.apply(userId, [
      { op: "guard", guard: { g: "ROADMAP_IS", id: goal.id, statuses: [...HOLD_STATUSES], updatedAt: goal.updatedAt } },
      { op: "guard", guard: { g: "SLOT_FREE", slot, exceptId: null } },
      { op: "guard", guard: { g: "KEY_FREE", createKey } },
      { op: "insert", table: "roadmap", rows: [{ id, userId, ...intakeData(intake, today), status: "DRAFT", version: 0, slot, createKey, createdAt: now, updatedAt: now }] },
      { op: "update", table: "roadmap", where: { id: goal.id }, data: { splitClauses: nextSplit, updatedAt: now } },
    ]);
    return out === "ok" ? ok({ roadmapId: id }) : "stale";
  });
  invalidate("roadmap");
  return res;
}

// ── Accept (§22.14; rulings 49, 50, 51, 60) ──

/** What a TOPICS accept records beside its feasibility (it rides the acceptance's JSON): the live LEVELS milestone it closed (ruling 49: such an accept stays). */
interface TopicsAcceptMarks {
  topicsClosedLive?: string | null;
}

/** The chosen live topics of a map: the plan's topics (each becomes or is a Domain). */
const chosenLiveTopicsOf = (map: TopicMap): TopicDraft[] => map.topics.filter((t) => topicLive(t) && t.chosen);

/** The topics an accept creates a Domain for: chosen, with no Domain yet (a bound one, an intake Domain, a ticked match or seed already has one). */
const toCreateOf = (map: TopicMap): TopicDraft[] => chosenLiveTopicsOf(map).filter((t) => !t.domainId);

/** A topic whose Domain an accept creates carries the Gemini mark: a Gemini name kept as it was (never one you renamed). */
const geminiNamedTopic = (t: TopicDraft): boolean => t.nameOrigin === "GEMINI" && t.decision === "KEPT";

const sameNameSet = (a: readonly string[], b: readonly string[]): boolean => {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/** A drawn Gemini link still PENDING into a shown live topic: what [Accept all] keeps with the names. */
const pendingShownLinkOf = (shown: ReadonlySet<string>) => (x: EdgeDraft): boolean => x.origin === "GEMINI" && x.drawn && x.decision === "PENDING" && shown.has(x.childLineageId);

/**
 * [Accept all]'s list (TopicMapView.acceptAll, the one source the sheet shows and sends): per layer, its shown PENDING
 * Gemini names (chosen or not: keeping one never puts it in the plan) and the drawn Gemini links still PENDING into
 * its shown topics; only the layers holding either. keptAllOf compares exactly this set.
 */
function acceptAllListOfMap(settled: TopicMap): { layer: number; names: string[]; links: number }[] {
  const deepest = Math.max(settled.layers, ...settled.topics.filter(topicLive).map((t) => t.layer));
  const out: { layer: number; names: string[]; links: number }[] = [];
  for (let layer = 1; layer <= deepest; layer++) {
    const shown = settled.topics.filter((t) => topicLive(t) && t.layer === layer && !topicHidden(t));
    const names = shown.filter((t) => t.decision === "PENDING" && t.nameOrigin === "GEMINI").map((t) => t.name);
    const links = settled.edges.filter(pendingShownLinkOf(new Set(shown.map((t) => t.lineageId)))).length;
    if (names.length > 0 || links > 0) out.push({ layer, names, links });
  }
  return out;
}

/** [Accept all] (AcceptTopicChoices.keepAll): every unkept layer kept as its list showed it (acceptAllListOfMap: names and links), or null when it no longer reads so. */
function keptAllOf(map: TopicMap, keepAll: { names: string[]; links: number }): TopicMap | null {
  const settled = settledTopicMapOf(map);
  const list = acceptAllListOfMap(settled);
  const names = list.flatMap((x) => x.names);
  const links = list.reduce((n, x) => n + x.links, 0);
  if (!sameNameSet(names, Array.isArray(keepAll.names) ? keepAll.names : []) || keepAll.links !== links) return null;
  const shown = settled.topics.filter((t) => topicLive(t) && !topicHidden(t));
  const keep = new Set(shown.filter((t) => t.decision === "PENDING").map((t) => t.lineageId));
  const linkKept = pendingShownLinkOf(new Set(shown.map((t) => t.lineageId)));
  return {
    ...settled,
    topics: settled.topics.map((t) => (keep.has(t.lineageId) ? { ...t, decision: "KEPT" as const } : t)),
    edges: settled.edges.map((x) => (linkKept(x) ? { ...x, decision: "KEPT" as const } : x)),
  };
}

/**
 * acceptCore on a TOPICS draft (§22.14): one step of acceptCore's retry loop (a refusal, ok, or "stale").
 *   Refuses: acceptRefusalOf's code in words (ACCEPT_REFUSAL_LINE; the Field's Domains this map doesn't use are the
 *   taken names); a stale confirm (RACED: `create` and `geminiNamed` must name what accept does, `keepAll` what its list
 *   showed); a live LEVELS milestone with `aftercare` null (RACED: the sheet must ask, question 8); a starting one.
 *   Then: each chosen topic with no Domain gets one in the Area Field (taxonomy createDomain: the FROM_SUGGESTION path,
 *   ItemNote TOPIC_MAP on its plan rows; a Gemini name nameOrigin GEMINI and originName = name; a name the Field holds
 *   refuses TOPIC_NAME_TAKEN, offering [Use my Domain…]), bound to its topic at once (a re-accept creates none again);
 *   the held topics are measured; the plan is rebuilt over its Domains (ruling 60: every measure's scope, key and label
 *   from the Domain ids; the layer titles "{domains} · layer {k} of {n}"); in one transaction: ACTIVE at version + 1,
 *   planKind, depth and rating from the draft (draftPlan cleared; ruling 49), domainIds the chosen topics' Domains, the
 *   live LEVELS milestone closed there (its rank kept; its practices by `aftercare`), the previous rows SUPERSEDED, the
 *   ranks by planKind (ruling 51) under milestoneCapOf (ruling 50), previousPlan on an accept of another kind, the
 *   first readings and PROFICIENCY. After it: the closed milestone's goal (and, on ARCHIVE, its practices) archived.
 */
async function acceptTopicsStep(
  e: Env,
  deps: RoadmapDeps,
  userId: string,
  b: RoadmapBundle,
  choices: AcceptChoices,
  now: Date,
  overAccepted: boolean,
  state: { created: string[]; createdGemini: string[]; closing: { goalId: string | null; practices: string[]; aftercare: "KEEP" | "ARCHIVE" } | null }
): Promise<Result<{ version: number }> | "stale"> {
  if (!topicSwitchesOf(deps.topicSwitches).plans) return fail(TOPIC_PLANS_OFF);
  const roadmapId = b.roadmap.id;
  const tc = choices?.topicMap ?? null;
  if (!tc || typeof tc !== "object") return fail(RACED);
  const facts = draftKindFactsOf(b);
  const depth = facts.depth ?? AIM_DEPTHS[DEPTH_DEFAULT];
  const cur = b.roadmap.version;
  const v = cur + 1;
  const tree = await e.io.fieldTree();
  const field = tree.find((f) => f.id === b.roadmap.fieldId) ?? null;
  if (!field) return fail("That Field no longer exists.");
  let map = settledTopicMapOf(mapOfVersion(b, v, facts.rating?.layers ?? null));
  if (tc.keepAll) {
    const kept = keptAllOf(map, tc.keepAll);
    if (!kept) return fail(RACED);
    map = settledTopicMapOf(kept);
  }
  // Trailing empty bands trim before the refusals run (ruling 58): K is the layers you filled.
  map = { ...map, layers: Math.max(LAYERS_MIN, filledBandsOf(map) || map.layers) };
  const used = new Set(map.topics.map((t) => t.domainId).filter((d): d is string => !!d));
  const fieldNames = field.domains.filter((d) => !used.has(d.id)).map((d) => d.name);
  let code: AcceptRefusalCode | null;
  try {
    code = topicsLib.acceptRefusalOf(map, fieldNames);
  } catch (err) {
    console.error("roadmap: the map's accept check wasn't worked out:", err instanceof Error ? err.message : err);
    return fail("Couldn't check the map. Try again.");
  }
  if (code) return fail(ACCEPT_REFUSAL_LINE[code]);
  const chosen = chosenLiveTopicsOf(map);
  if (chosen.length === 0) return fail(ACCEPT_REFUSAL_LINE.LAST_LAYER_EMPTY);
  // The confirm named what accept does ("Creates 9 Domains in Business & Finance" and the Gemini names, by name).
  const toCreate = toCreateOf(map);
  if (tc.create !== toCreate.length + state.created.length) return fail(RACED);
  if (!sameNameSet(Array.isArray(tc.geminiNamed) ? tc.geminiNamed : [], [...toCreate.filter(geminiNamedTopic).map((t) => t.name), ...state.createdGemini])) return fail(RACED);
  // The live LEVELS milestone (question 8): it closes there; the sheet must have asked about its practices.
  const planRows = planRowsOf(b);
  if (planRows.some((m) => m.status === "STARTING")) return fail("A milestone is starting: tap Finish starting first.");
  const startedRows = planRows.filter((m) => m.status === "STARTED" && m.goalId && m.reachedDay == null);
  const goalIds = startedRows.flatMap((m) => [m.goalId as string, ...m.items.filter((i) => i.kind === "PRACTICE" && i.templateId).map((i) => i.templateId as string)]);
  const templates = new Map((goalIds.length ? await e.io.templates(userId, goalIds) : []).map((t) => [t.id, t]));
  const live = facts.inDraftPlan || kindOfRow(b.roadmap) !== "TOPICS" ? (startedRows.find((m) => !superseded(b, m) && goalOpen(m, templates)) ?? null) : null;
  if (live && tc.aftercare !== "KEEP" && tc.aftercare !== "ARCHIVE") return fail(RACED);
  const aftercare: "KEEP" | "ARCHIVE" | null = live ? (tc.aftercare as "KEEP" | "ARCHIVE") : null;
  // Domains are one goal's (§23.5): the map's (bound and chosen) and those it will create.
  const taken = await topicTakenDomainOf(e, userId, roadmapId, topicMapDomainsOf(map));
  if (taken) return fail(DOMAIN_TAKEN(taken.slot));

  // Every refusal runs before any Domain is made: the held topics, the plan, the cap, Impossible and over your hours are
  // worked out on the map as it stands (its new topics still unbound, as the draft's own rebuild reads them); only an
  // accept that passes them creates its Domains (below), then re-reads and runs them again over the bound map.

  // The held topics (F-R5-10): on a Domain you own or bound that already holds its floor at level 6.
  const today = todayKey(now);
  const treeNow = tree;
  map = {
    ...map,
    topics: map.topics.map((t) => {
      if (!topicLive(t) || !t.chosen || !t.domainId || t.heldDay) return t;
      const created = state.created.includes(t.domainId);
      if (created || cardsAtOpenOf(treeNow, t.domainId) < topicFloorOf(treeNow, t)) return t;
      return { ...t, heldDay: today, notes: t.notes.includes("HELD_AT_START") ? t.notes : [...t.notes, "HELD_AT_START" as TopicNote] };
    }),
  };
  map = settledTopicMapOf(map);

  // The plan over its Domains (ruling 60). A draft of a fresh map, or of another kind, is rebuilt with the names now
  // there: the post-accept titles ("{domains} · layer {k} of {n}"), every measure's scope, key and label from the Domain
  // ids. A re-plan of a TOPICS plan (Re-fit, Edit by hand) keeps its rows as you left them, keyed as LEVELS keys them.
  const ctx = await topicsContextOf(e, userId, b, depth, now);
  const otherKind = facts.inDraftPlan || kindOfRow(b.roadmap) !== "TOPICS";
  const sameKind = cur >= 1 && !otherKind;
  // A stage under way (a carried TOPICS row) stays as it is: the rebuilt chain leaves its place out.
  const keptCarried = planRows.filter((m) => isCarried(m) && m.chainRole != null && !superseded(b, m));
  const underWay = new Set(keptCarried.map((m) => `${m.chainRole ?? ""}:${m.layer ?? m.stage ?? ""}`));
  let rows0: MilestoneDraft[];
  if (sameKind) {
    rows0 = draftRowsOf(b).map(draftOf);
  } else {
    const ladder = layeredPlanOf(e, ctx, map, depth, v);
    if (!ladder.ok) return fail(ladder.error);
    rows0 = ladder.plan.filter((m) => !underWay.has(`${m.chainRole ?? ""}:${m.layer ?? m.stage ?? ""}`));
  }
  const layersK = Math.max(LAYERS_MIN, ...rows0.map((m) => m.layer ?? 0), ...keptCarried.map((m) => m.layer ?? 0));
  const drafts0: MilestoneDraft[] = rows0.map((m) => {
    const layerIds = m.chainRole === "LAYER" ? Array.from(new Set(map.topics.filter((t) => topicLive(t) && t.chosen && t.layer === m.layer && t.domainId).map((t) => t.domainId as string))) : [];
    const names = layerIds.map((id) => ctx.domains.get(id)).filter((d): d is DomainFacts => !!d).map((d) => domainName(d));
    return {
      ...m,
      ...(!sameKind && m.chainRole === "LAYER" && m.layer != null ? { title: String(topicLayerTitleOf(names, m.layer, layersK)) } : {}),
      items: m.items.map((i) => (i.kind === "DOMAIN" && i.domainId && state.created.includes(i.domainId) && !i.notes.includes("TOPIC_MAP") ? { ...i, notes: [...i.notes, "TOPIC_MAP" as ItemNote] } : i)),
      measures: m.measures.map((x) => {
        // A PART or BETWEEN checkpoint stays keyless (lane 7's handoff): its key would collide with its topic's own.
        if (x.kind !== "CARDS_AT_LEVEL" || x.minLevel == null || x.gate) return x;
        const lineageDomain = x.topicLineageId ? (map.topics.find((t) => t.lineageId === x.topicLineageId)?.domainId ?? null) : null;
        const ids = lineageDomain ? [lineageDomain] : (x.scope.domainIds ?? []);
        if (!ids.length) return x;
        const key = cardsAtLevelKey(ids, x.minLevel, x.minLevel >= depth ? "rc" : "r");
        const live0 = liveCountOfKey(ctx, key) ?? liveCount(ctx, ids, x.minLevel, true);
        return { ...x, scope: { ...x.scope, domainIds: ids }, measureKey: key, baseline: live0.value, baselineDay: today, fittedTarget: x.target };
      }),
    };
  });
  // Positions: the plan's own, under the TOPICS cap (ruling 50; a closed LEVELS milestone is history beside it, never one of them).
  const cap = milestoneCapOf("TOPICS");
  if (new Set([...keptCarried.map((m) => m.lineageId), ...drafts0.filter(scheduled).map((d) => d.lineageId)]).size > cap) return fail(`A roadmap holds at most ${cap} milestones; move some to Later.`);
  const feasibility = topicsFeasibilityOf(e, ctx, drafts0, keptCarried.map(draftOf));
  if (feasibility.impossible) return fail(pointedAt(gateOf(e, ctx), "A milestone can't be done by its date as planned — use a remedy or change it."));
  const needsOver = !!feasibility.over || feasibility.dateCheck?.verdict === "OVER";
  if (needsOver && !overAccepted) return fail(pointedAt(gateOf(e, ctx), "This plan is over your hours or pace: switch on “Keep it over my hours/pace” to accept it."));

  // Each chosen topic with no Domain gets one, bound at once (a retry or a re-accept creates none again), only now that
  // every refusal above has passed on the unbound map (a name the Field holds refused there: acceptRefusalOf).
  if (toCreate.length) {
    // A fresh goal needs its seat (the transaction's SLOT_FREE): refused here too, before anything is made.
    if (b.roadmap.status === "DRAFT" && !isGoalSlot(b.roadmap.slot) && seatForReopenOf(goalRowOf(b.roadmap), (e.goals.get(userId) ?? []).map((r) => goalRowOf(r))) == null) return fail(RACED);
    const bind: StoreOp[] = [{ op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: [b.roadmap.status as RoadmapStatus], version: cur } }];
    for (const t of toCreate) {
      let made = await e.io.createDomain(field.id, t.name);
      if (!made.ok) {
        // A Domain an interrupted accept created and never bound (exactly this name, empty, held by no goal) is reused.
        const orphan = field.domains.find((d) => d.name.toLowerCase() === t.name.toLowerCase() && d.cards.length === 0 && !used.has(d.id));
        const heldElsewhere = orphan ? await topicTakenDomainOf(e, userId, roadmapId, [orphan.id]) : null;
        if (!orphan || heldElsewhere) {
          // Bind what this pass made, so a retry reuses it rather than leaving it loose; the accept itself is refused.
          if (bind.length > 1) await e.store.apply(userId, bind);
          return fail(TOPIC_NAME_TAKEN);
        }
        made = { ok: true, value: { id: orphan.id, name: orphan.name, fieldId: field.id } };
      }
      bind.push({ op: "update", table: "roadmapTopic", where: { id: t.id as string, domainId: null }, data: { domainId: made.value.id, updatedAt: now } });
      if (geminiNamedTopic(t)) bind.push({ op: "domainOrigin", domainId: made.value.id, name: made.value.name });
      state.created.push(made.value.id);
      if (geminiNamedTopic(t)) state.createdGemini.push(t.name);
    }
    invalidate("fields", "ideas");
    await e.store.apply(userId, bind);
    // Re-read either way: the next pass sees every chosen topic bound (a stale bind creates nothing twice: its Domain is reused).
    return "stale";
  }

  // Ords after the carried rows; ranks by planKind (ruling 51): R1 spreads the gates by topicRankIndexOf.
  const baseOrd = Math.max(0, ...planRows.filter(isCarried).map((m) => m.ord));
  const drafts = drafts0.map((d, i) => ({ ...d, ord: baseOrd + i + 1 }));
  const known = new Set(map.topics.filter((t) => t.heldDay != null || t.skippedDay != null).map((t) => t.lineageId));
  const allKnown = (d: MilestoneDraft): boolean => {
    const own = Array.from(new Set(d.measures.map((x) => x.topicLineageId).filter((l): l is string => !!l)));
    return own.length > 0 && own.every((l) => known.has(l));
  };
  const rankRows = [
    // A TOPICS stage under way keeps its rank (a re-plan of the same kind).
    ...onePerLineage(keptCarried.filter((m) => !drafts.some((d) => d.lineageId === m.lineageId))).map((m) => ({
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
    ...drafts.map((d) => ({
      id: d.lineageId,
      lineageId: d.lineageId,
      ord: d.ord,
      carried: false,
      later: d.status === "LATER",
      rankIndex: null,
      stage: d.stage ?? null,
      gateLevel: gateLevelOf(d),
      held: heldRow(d),
      // Lane 7 (ruling 51; R1 TopicRankFields): every topic known is `skipped`; a row holding a PART checkpoint counts one gate more.
      skipped: allKnown(d),
      part: d.measures.some((x) => x.gate === "PART"),
    })),
  ];
  const ranks = rankIndicesOf(e, rankRows, sameKind ? firstRankByLineage(b) : {}, depth, "TOPICS");

  // The end state (decision 66): the depth terms at mixed levels (the specialisation at L*, the base topics at 8 or L*).
  const chosenIds = Array.from(new Set(chosenLiveTopicsOf(map).map((t) => t.domainId).filter((d): d is string => !!d)));
  const levels: Record<string, number> = {};
  for (const t of chosenLiveTopicsOf(map)) if (t.domainId) levels[t.domainId] = t.role === "DEEP" ? depth : Math.min(BASE_LEVEL, depth);
  const endState = topicsEndStateOf(e, ctx, depth, chosenIds, levels, drafts, b.acceptances);

  const previousPlan: PreviousPlan | null =
    cur >= 1 && otherKind ? { planKind: kindOfRow(b.roadmap), depth: b.roadmap.depth ?? null, rating: storedRatingOf(b.roadmap.rating), domainIds: [...b.roadmap.domainIds] } : null;
  const roadmapData: Record<string, unknown> = {
    status: "ACTIVE",
    version: v,
    firstAcceptedDay: b.roadmap.firstAcceptedDay ?? today,
    planKind: "TOPICS",
    depth,
    rating: facts.rating ? { ...facts.rating, layers: layersK } : null,
    draftPlan: null,
    domainIds: chosenIds,
    updatedAt: now,
  };
  const goalRows = e.goals.get(userId) ?? [];
  const seatOps: StoreOp[] = [];
  if (b.roadmap.status === "DRAFT") {
    const seat = isGoalSlot(b.roadmap.slot) ? b.roadmap.slot : seatForReopenOf(goalRowOf(b.roadmap), goalRows.map((r) => goalRowOf(r)));
    if (seat == null) return fail(RACED);
    seatOps.push({ op: "guard", guard: { g: "SLOT_FREE", slot: seat, exceptId: roadmapId } });
    if (!isGoalSlot(b.roadmap.slot)) roadmapData.slot = seat;
  }
  const draftSince = new Date(Math.min(now.getTime(), ...draftRowsOf(b).map((m) => m.createdAt.getTime())));
  const ops: StoreOp[] = [
    ...seatOps,
    ...domainsFreeOps(chosenIds, roadmapId),
    { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: ["DRAFT", "ACTIVE"], version: cur } },
    { op: "guard", guard: { g: "NOTHING_STARTED_SINCE", roadmapId, since: draftSince } },
    { op: "update", table: "roadmap", where: { id: roadmapId, version: cur }, data: roadmapData },
  ];
  if (cur >= 1) ops.push({ op: "update", table: "roadmapMilestone", where: { roadmapId, version: cur, status: { in: ["PLANNED", "LATER"] } }, data: { status: "SUPERSEDED" } });
  // The live LEVELS milestone closes there (its rankIndex as stored); KEEP records its practices kept on Today.
  let closingPractices: string[] = [];
  if (live) {
    const kept = new Set(aftercareKeptOf(live.feasibility));
    closingPractices = Array.from(new Set(live.items.filter((i) => i.kind === "PRACTICE" && i.templateId && !kept.has(i.templateId)).map((i) => i.templateId as string))).filter((id) => templates.get(id)?.archivedAt == null);
    if (aftercare === "KEEP") for (const templateId of closingPractices) ops.push({ op: "keepAftercare", milestoneId: live.id, templateId });
  }
  // The map's rows as accepted (the held days, the roles, every Domain bound to its topic).
  ops.push(...mapRowOps(roadmapId, v, map, now, e.makeId));
  if (sameKind) {
    // The rows stay as written; their card measures are keyed and baselined as LEVELS accept does.
    for (const d of drafts) for (const x of d.measures) if (x.id && x.kind === "CARDS_AT_LEVEL" && x.measureKey) ops.push({ op: "update", table: "roadmapMeasure", where: { id: x.id }, data: { baseline: x.baseline, baselineDay: today, fittedTarget: x.target, measureKey: x.measureKey } });
  } else {
    try {
      writeRoadmapRows(ops, { kind: "DRAFT", roadmapId, version: v, plan: drafts, feasibility, now, makeId: e.makeId }, topicsTextContextOf(b, tree, map));
    } catch (err) {
      if (!(err instanceof ModelTextError)) throw err;
      logRefusedWrite("accept-topics", err);
      return fail(CHANGE_NOT_SAVED);
    }
  }
  const readingRows: ReadingRow[] = [];
  const next = drafts.find((d) => d.status !== "LATER" && !heldRow(d) && !allKnown(d)) ?? null;
  for (const d of drafts) {
    const f = feasibility.milestones.find((x) => x.lineageId === d.lineageId) ?? null;
    const over = !!f && (f.worst === "OVER" || f.time.verdict === "OVER");
    const held = heldRow(d);
    ops.push({
      op: "update",
      table: "roadmapMilestone",
      where: { roadmapId, version: v, lineageId: d.lineageId, status: d.status === "LATER" ? "LATER" : "DRAFT" },
      data: {
        status: d.status === "LATER" ? "LATER" : "PLANNED",
        ord: d.ord,
        rankIndex: d.status === "LATER" ? null : (ranks[d.lineageId] ?? null),
        overAccepted: overAccepted && over,
        ...(held ? { reachedDay: today } : {}),
      },
    });
    if (d.lineageId !== next?.lineageId) continue;
    for (const x of d.measures) {
      const parsed = x.measureKey ? parseMeasureKey(x.measureKey) : null;
      if (parsed?.kind === "CARDS_AT_LEVEL" && parsed.segment !== "rc" && x.measureKey) readingRows.push(measures.cardsReadingRow(x.measureKey, today, liveCountOfKey(ctx, x.measureKey) ?? liveCount(ctx, parsed.domainIds, parsed.level, true)));
    }
  }
  for (const t of endState) {
    if (readingRows.some((r) => r.measureKey === t.measureKey)) continue;
    const parsed = parseMeasureKey(t.measureKey);
    if (parsed?.kind !== "CARDS_AT_LEVEL" || parsed.segment === "rc") continue;
    readingRows.push(measures.cardsReadingRow(t.measureKey, today, liveCount(ctx, parsed.domainIds, parsed.level, parsed.segment != null)));
  }
  const stored: Feasibility & TopicsAcceptMarks = { ...feasibility, ...(live ? { topicsClosedLive: live.id } : {}) };
  ops.push({
    op: "insert",
    table: "roadmapAcceptance",
    rows: [
      {
        id: e.makeId(),
        roadmapId,
        version: v,
        day: today,
        acceptedAt: now,
        previousVersion: cur,
        feasibility: stored,
        endState,
        intervalMultiplier: ctx.m,
        overAccepted: overAccepted && needsOver,
        undoneAt: null,
        ...(previousPlan ? { previousPlan } : {}),
      },
    ],
  });
  const planAfter = drafts.map((d) => ({ ...d, status: (d.status === "LATER" ? "LATER" : "PLANNED") as MilestoneStatus }));
  try {
    const basis = e.lanes.proficiencyBasisOf({ basisVersion: v, endState, feasibility: stored, milestones: planAfter, switchedOff: [], heldDays: ctx.held });
    const prof = await proficiencyFor(e, deps, userId, roadmapId, now, basis, cur >= 1 ? "REPLAN" : "ACCEPTED", practiceNamesOf(planAfter));
    if (prof) readingRows.push(prof);
  } catch (err) {
    console.error("roadmap: Proficiency basis not computed at the topic plan's acceptance:", err);
  }
  if (readingRows.length) ops.push({ op: "readings", rows: readingRows, observedAt: now });
  const out = await e.store.apply(userId, ops);
  if (out !== "ok") return "stale";
  state.closing = live && aftercare ? { goalId: live.goalId, practices: closingPractices, aftercare } : null;
  return ok({ version: v });
}

/** After a TOPICS accept that closed a live LEVELS milestone: its goal archived (it leaves Today as a drop does), and on ARCHIVE its practices. Errors are logged; the accept stands. */
async function closeLiveAfterAccept(e: Env, userId: string, closing: { goalId: string | null; practices: string[]; aftercare: "KEEP" | "ARCHIVE" } | null, now: Date): Promise<void> {
  if (!closing) return;
  const targets = [...(closing.goalId ? [closing.goalId] : []), ...(closing.aftercare === "ARCHIVE" ? closing.practices : [])];
  for (const templateId of targets) {
    try {
      const r = await e.io.archiveTemplate(userId, templateId, now);
      if (!r.ok) console.error("roadmap: the closed milestone's task stays on Today:", r.error);
    } catch (err) {
      console.error("roadmap: the closed milestone's task stays on Today:", err instanceof Error ? err.message : err);
    }
  }
  invalidate("life", "activity");
}

/** A TOPICS plan's end state (§22.12, decision 66): realism depthTermsOf at mixed levels; the last milestones' paying card measures when it can't answer (logged). */
function topicsEndStateOf(e: Env, ctx: PlanContext, depth: TopicDepth, domainIds: readonly string[], levels: Readonly<Record<string, number>>, plan: readonly MilestoneDraft[], acceptances: readonly AcceptanceRec[]): EndStateTerm[] {
  const anchored = new Map<string, EndStateTerm>();
  for (const a of acceptances) {
    if (a.undoneAt) continue;
    for (const t of endStateOf(a)) if (!anchored.has(t.measureKey)) anchored.set(t.measureKey, t);
  }
  const baselines: Record<string, number> = {};
  for (const id of domainIds) baselines[id] = liveCount(ctx, [id], levels[id] ?? depth, true).value;
  let terms: EndStateTerm[] = [];
  try {
    const coverage = coverageFor(e, ctx, domainIds, ctx.coveragePrior ?? null);
    terms = e.lanes.depthTermsOf(depth, coverage, baselines, ctx.today, levels);
  } catch (err) {
    console.error("roadmap: the topic plan's depth terms weren't worked out (its last measures stand in):", err instanceof Error ? err.message : err);
  }
  if (terms.length === 0) {
    const seen = new Set<string>();
    for (const m of [...plan].filter(scheduled).sort((a, b) => b.ord - a.ord)) {
      for (const x of m.measures) {
        if (x.kind !== "CARDS_AT_LEVEL" || x.role !== "PAYS" || x.minLevel == null || !x.scope.domainIds?.length || !x.measureKey || seen.has(x.measureKey)) continue;
        seen.add(x.measureKey);
        terms.push({ measureKey: x.measureKey, target: x.target, baseline: liveCountOfKey(ctx, x.measureKey)?.value ?? 0, baselineDay: ctx.today, label: cardLabel(ctx, x.scope.domainIds, x.minLevel), targetSource: x.targetSource });
      }
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
 * undoAcceptCore's TOPICS part (ruling 49): an accept that closed a live milestone stays (its practices may be archived:
 * ACCEPT_CLOSED_LIVE); one with a previousPlan restores the plan's kind, depth, rating and Domains and sets draftPlan
 * back to the undone version's own record, so its rows return to a TOPICS draft. The Domains it created stay in the
 * library, bound to the draft's topics. {} for every other accept (LEVELS reads as before).
 */
function topicUndoOf(b: RoadmapBundle, acc: AcceptanceRec, version: number): { roadmapData: Record<string, unknown> } | string {
  const marks: TopicsAcceptMarks = acc.feasibility && typeof acc.feasibility === "object" ? (acc.feasibility as TopicsAcceptMarks) : {};
  if (typeof marks.topicsClosedLive === "string" && marks.topicsClosedLive) return ACCEPT_CLOSED_LIVE;
  const raw = acc.previousPlan;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { roadmapData: {} };
  const p = raw as Partial<PreviousPlan>;
  if (p.planKind !== "LEVELS" && p.planKind !== "TOPICS") return { roadmapData: {} };
  const undone: DraftPlan = { version, planKind: kindOfRow(b.roadmap), depth: topicDepthOfRow(b.roadmap), rating: storedRatingOf(b.roadmap.rating) };
  return {
    roadmapData: {
      planKind: p.planKind,
      depth: typeof p.depth === "number" ? p.depth : null,
      rating: storedRatingOf(p.rating) ?? null,
      domainIds: Array.isArray(p.domainIds) ? p.domainIds.filter((d): d is string => typeof d === "string") : [...b.roadmap.domainIds],
      draftPlan: undone,
    },
  };
}

// ── Gating (F-R5-10; the PREREQS_MET guard) ──

/**
 * A TOPICS layer milestone's prerequisites (F-R5-10, §22.14's PREREQS_MET): open (true: Start refuses PREREQS_OPEN)
 * unless milestone k is reached (or held), or every parent of every chosen layer-(k + 1) topic is at level 6 over its
 * floor, HELD_AT_START or skipped, and every cross-goal parent Domain at level 6 over its floor. Layer 1, a depth
 * milestone and every LEVELS row are never held back here.
 */
function prereqsOpenOf(b: RoadmapBundle, row: MilestoneRec, tree: readonly TreeField[]): boolean {
  if (kindOfRow(b.roadmap) !== "TOPICS" || row.chainRole !== "LAYER" || row.layer == null || row.layer <= 1) return false;
  const k = row.layer - 1;
  if (b.milestones.some((m) => m.roadmapId === row.roadmapId && m.chainRole === "LAYER" && m.layer === k && m.reachedDay != null && m.status !== "DISCARDED")) return false;
  const map = mapOfVersion(b, row.version);
  for (const child of map.topics.filter((t) => topicLive(t) && t.chosen && t.layer === row.layer)) {
    const parents = parentsInMapOf(map, child);
    for (const p of parents.topics) {
      if (!p.chosen) continue;
      if (p.skippedDay || p.heldDay) continue;
      if (cardsAtOpenOf(tree, p.domainId) < TOPIC_FLOOR_CARDS) return true;
    }
    for (const c of parents.crossGoal) if (cardsAtOpenOf(tree, c.domainId) < TOPIC_FLOOR_CARDS) return true;
  }
  return false;
}

/** Start's refusal on a TOPICS layer whose prerequisites are open (PREREQS_OPEN); null otherwise. */
function topicStartRefusal(b: RoadmapBundle, row: MilestoneRec, tree: readonly TreeField[]): string | null {
  return prereqsOpenOf(b, row, tree) ? PREREQS_OPEN : null;
}

/** Start's PREREQS_MET guard on a TOPICS layer milestone from layer 2 (none on LEVELS: its ops are as before). */
function topicStartGuards(b: RoadmapBundle, row: MilestoneRec): StoreOp[] {
  if (kindOfRow(b.roadmap) !== "TOPICS" || row.chainRole !== "LAYER" || row.layer == null || row.layer <= 1) return [];
  return [{ op: "guard", guard: { g: "PREREQS_MET", roadmapId: b.roadmap.id, milestoneId: row.id } }];
}

// ── Re-plans of a TOPICS plan (ruling 50) and clearing a draft of another kind (ruling 49) ──

/**
 * replanCore's TOPICS part, as ops for its transaction: on a TOPICS plan the map's rows are copied to the draft version
 * (the layers, the topics and their parents stay as they are), and REFIT re-dates through layeredLadderOf (`plan`: the
 * fresh rows of the stages not under way). On a LEVELS plan any leftover TOPICS draft (Roadmap.draftPlan, its map's
 * rows) is cleared, so the new draft reads as the LEVELS re-plan it is; none: no op (LEVELS reads as before).
 */
async function replanTopicsOf(e: Env, userId: string, b: RoadmapBundle, kind: ReplanKind, now: Date, carried: readonly MilestoneDraft[]): Promise<{ ops: StoreOp[]; plan: MilestoneDraft[] | null } | string> {
  const v = b.roadmap.version + 1;
  if (kindOfRow(b.roadmap) !== "TOPICS") {
    const ops: StoreOp[] = [];
    if (b.roadmap.draftPlan != null) ops.push({ op: "update", table: "roadmap", where: { id: b.roadmap.id }, data: { draftPlan: null } });
    if ((b.topics ?? []).some((t) => t.version === v) || (b.edges ?? []).some((x) => x.version === v)) {
      ops.push({ op: "delete", table: "roadmapTopicEdge", where: { roadmapId: b.roadmap.id, version: v } }, { op: "delete", table: "roadmapTopic", where: { roadmapId: b.roadmap.id, version: v } });
    }
    return { ops, plan: null };
  }
  const live = mapOfVersion(b, b.roadmap.version, storedRatingOf(b.roadmap.rating)?.layers ?? null);
  const copy: TopicMap = { ...live, topics: live.topics.map((t) => ({ ...t, id: null })), edges: live.edges.map((x) => ({ ...x, id: null })) };
  const ops: StoreOp[] = [...(b.roadmap.draftPlan != null ? [{ op: "update", table: "roadmap", where: { id: b.roadmap.id }, data: { draftPlan: null } } satisfies StoreOp] : []), ...mapRowOps(b.roadmap.id, v, copy, now, e.makeId)];
  if (kind !== "REFIT") return { ops, plan: null };
  const depth = topicDepthOfRow(b.roadmap) ?? AIM_DEPTHS[DEPTH_DEFAULT];
  const ctx = await topicsContextOf(e, userId, b, depth, now);
  const ladder = layeredPlanOf(e, ctx, copy, depth, v);
  if (!ladder.ok) return ladder.error;
  // A stage under way stays as it is: its place in the chain is left out of the fresh rows.
  const underWay = new Set(carried.map((m) => `${m.chainRole ?? ""}:${m.layer ?? m.stage ?? ""}`));
  return { ops, plan: ladder.plan.filter((m) => !underWay.has(`${m.chainRole ?? ""}:${m.layer ?? m.stage ?? ""}`)) };
}

// ── Depth (ruling 50: lowerDepth on TOPICS takes a TopicDepth) ──

/**
 * lowerDepthCore on a TOPICS plan or draft (ruling 50): `to` below the current depth (6 included). A draft (a fresh
 * TOPICS DRAFT, or a TOPICS re-plan draft) is rebuilt at the new depth (its depth tail follows depthTailOf); an ACTIVE
 * plan drops the unstarted depth milestones past the new tail (DISCARDED with DEPTH_LOWERED; a started one above the
 * new depth is closed or dropped first), sets Roadmap.depth, records the choice and the new end state in an
 * acceptance record of the same version, and rebases Proficiency once.
 */
async function lowerTopicsDepthStep(e: Env, deps: RoadmapDeps, userId: string, b: RoadmapBundle, to: TopicDepth, reason: "CHOICE" | "EXAM", now: Date): Promise<Result<null> | "stale"> {
  const today = todayKey(now);
  if (b.roadmap.status === "PAUSED") return fail("Resume this goal first.");
  if (isTopicsDraft(b) && (b.roadmap.status === "DRAFT" || draftKindFactsOf(b).inDraftPlan)) {
    const read = await topicDraftRead(e, userId, b.roadmap.id);
    if (!read.ok) return read;
    if (to >= read.value.depth) return fail("Pick a depth below the current one.");
    const ops = await rebuildTopicsDraftOps(e, userId, read.value.b, read.value.map, read.value.rating, to, now);
    if (!ops.ok) return ops;
    const out = await e.store.apply(userId, ops.value);
    return out === "ok" ? ok(null) : "stale";
  }
  if (b.roadmap.status !== "ACTIVE" || kindOfRow(b.roadmap) !== "TOPICS") return fail("Only a plan aimed at a depth has one to lower.");
  const from = topicDepthOfRow(b.roadmap);
  if (from == null) return fail("Only a plan aimed at a depth has one to lower.");
  if (to >= from) return fail("Pick a depth below the current one.");
  let tail: { stage: string }[];
  try {
    tail = realism.depthTailOf(to);
  } catch {
    tail = [];
  }
  const keep = new Set(tail.map((t) => t.stage));
  const rows = planRowsOf(b);
  const depthRows = rows.filter((m) => m.chainRole === "DEPTH" && m.version === b.roadmap.version);
  const above = rows.find((m) => isCarried(m) && m.chainRole === "DEPTH" && m.reachedDay == null && !superseded(b, m) && !keep.has(m.stage ?? ""));
  if (above) return fail(`Close or drop milestone ${above.ord} first: it is working toward a level above your new depth.`);
  const ctx = await topicsContextOf(e, userId, b, to, now);
  const map = mapOfVersion(b, b.roadmap.version);
  const chosen = chosenLiveTopicsOf(map);
  const domainIds = Array.from(new Set(chosen.map((t) => t.domainId).filter((d): d is string => !!d)));
  const levels: Record<string, number> = {};
  for (const t of chosen) if (t.domainId) levels[t.domainId] = t.role === "DEEP" ? to : Math.min(BASE_LEVEL, to);
  const kept = rows.filter((m) => !(m.chainRole === "DEPTH" && !isCarried(m) && !keep.has(m.stage ?? ""))).map(draftOf);
  const endState = topicsEndStateOf(e, ctx, to, domainIds, levels, kept, b.acceptances);
  // DepthChoice names AimDepths; a TOPICS plan's 6 rides the same record (its readers show the number).
  const choice = { from, to, day: today, reason } as unknown as DepthChoice;
  const acc = currentAcceptance(b);
  const prevF = feasibilityOfAcceptance(acc);
  const stored: Feasibility = { ...(prevF ?? topicsFeasibilityOf(e, ctx, kept)), depthChoice: choice, reachModel: REACH_MODEL_VERSION };
  const ops: StoreOp[] = [
    { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: ["ACTIVE"], version: b.roadmap.version } },
    { op: "update", table: "roadmap", where: { id: b.roadmap.id, version: b.roadmap.version }, data: { depth: to, updatedAt: now } },
  ];
  for (const m of depthRows) {
    if (isCarried(m) || keep.has(m.stage ?? "")) continue;
    ops.push({ op: "guard", guard: { g: "MILESTONE_IS", id: m.id, statuses: [m.status as MilestoneStatus] } });
    ops.push({ op: "update", table: "roadmapMilestone", where: { id: m.id, status: m.status }, data: { status: "DISCARDED", feasibility: feasibilityJson(planFeasibilityOfRow(m), [...storedNotes(m.feasibility).filter((n) => n !== "DEPTH_LOWERED"), "DEPTH_LOWERED"]) } });
  }
  ops.push({
    op: "insert",
    table: "roadmapAcceptance",
    rows: [{ id: e.makeId(), roadmapId: b.roadmap.id, version: b.roadmap.version, day: today, acceptedAt: now, previousVersion: b.roadmap.version, feasibility: stored, endState, intervalMultiplier: ctx.m, overAccepted: !!acc?.overAccepted, undoneAt: null }],
  });
  try {
    const basis = e.lanes.proficiencyBasisOf({ basisVersion: b.roadmap.version, endState, feasibility: stored, milestones: kept, switchedOff: switchedOffOf(rows.filter(isCarried)), heldDays: ctx.held });
    const prof = await proficiencyFor(e, deps, userId, b.roadmap.id, now, basis, "REPLAN", practiceNamesOf(rows));
    if (prof) ops.push({ op: "readings", rows: [prof], observedAt: now });
  } catch (err) {
    console.error("roadmap: Proficiency not rebased with the topic plan's lowering:", err);
  }
  const out = await e.store.apply(userId, ops);
  return out === "ok" ? ok(null) : "stale";
}

// ── The tripwire's extension (§22.11) ──

/** The Domain rows a topic payload is checked against (ModelTextContext.domains). */
interface TopicNameDomain {
  id: string;
  name: string;
  nameOrigin: string | null;
  originName: string | null;
}

const MODEL_NAME_MIN = 3;

/** A GEMINI-origin name not kept by you (KEPT or EDITED) that is not also one of your Domains' names: quarantined to the map. */
function quarantinedNamesOf(topics: readonly TopicDraft[], domains: readonly TopicNameDomain[]): string[] {
  const yours = new Set(domains.map((d) => normLabel(d.name)));
  return Array.from(
    new Set(
      topics
        .filter((t) => t.nameOrigin === "GEMINI" && t.decision !== "KEPT" && t.decision !== "EDITED")
        .map((t) => normLabel(t.name))
        .filter((n) => n.length >= MODEL_NAME_MIN && !yours.has(n))
    )
  );
}

/** `text` holds `name` as a run of whole words (both normalised). */
function holdsName(text: string, name: string): boolean {
  const t = normLabel(text);
  let at = t.indexOf(name);
  while (at >= 0) {
    const before = at === 0 ? "" : t[at - 1];
    const after = t[at + name.length] ?? "";
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    at = t.indexOf(name, at + 1);
  }
  return false;
}

/** assertNoModelText's extension (§22.11): the first row text holding a quarantined Gemini topic name (titles and labels in code's or Gemini's words; yours pass), or null. */
function topicNamesInRowsOf(rows: readonly MilestoneDraft[], ctx: ModelTextContext): string | null {
  if (!ctx.topics?.length) return null;
  const names = quarantinedNamesOf(ctx.topics, ctx.domains ?? Object.entries(ctx.domainNames).map(([id, name]) => ({ id, name, nameOrigin: null, originName: null })));
  if (names.length === 0) return null;
  for (const m of rows) {
    const yoursTitle = m.titleOrigin === "USER" || m.titleDecision === "EDITED";
    if (!yoursTitle && names.some((n) => holdsName(m.title, n))) return `a Gemini topic name not kept by you in a title (milestone ${m.ord})`;
    for (const it of m.items) {
      if (it.origin === "USER" || it.decision === "EDITED") continue;
      if (names.some((n) => holdsName(it.label, n))) return `a Gemini topic name not kept by you in a ${it.kind.toLowerCase()} (milestone ${m.ord})`;
    }
  }
  return null;
}

/** The view keys whose subtree is the map's own (TopicMapView and DraftView.topicMap carry Gemini names with their chips) or the library's data list. */
const TOPIC_NAME_FREE_KEYS: ReadonlySet<string> = new Set(["topicMap", "library"]);

/**
 * The one writer's view check (§22.11; lane 8): walks a view payload and fires when
 *   - a GEMINI-origin topic name whose decision is not KEPT or EDITED appears outside the map's own subtree (a
 *     milestone title, an item label, a measure, a quest or a Today payload), or
 *   - a kept Gemini-named Domain's name (geminiNamedOf) appears outside a NamedPart with geminiNamed: true (a string
 *     with a `…Parts` sibling, title and titleParts, label and labelParts, is read through its parts; an object
 *     holding geminiNamed: true carries the mark for its own name).
 * THROW (checks): ModelTextError. REDACT (production): the text is replaced with code's words ("Layer {k}" where the
 * row names its layer, else "this topic") and one line is logged with no model text. The payload otherwise returns as
 * given.
 */
export function assertTopicNames(payload: unknown, ctx: { topics: readonly TopicDraft[]; domains: readonly TopicNameDomain[] }, mode: "THROW" | "REDACT"): unknown {
  const quarantined = quarantinedNamesOf(ctx.topics, ctx.domains);
  const marked = Array.from(new Set(ctx.domains.filter((d) => geminiNamedOf(d)).map((d) => normLabel(d.name)).filter((n) => n.length >= MODEL_NAME_MIN)));
  if (quarantined.length === 0 && marked.length === 0) return payload;
  const fire = (path: string, reason: string, holder: Record<string, unknown> | null): string => {
    if (mode === "THROW") throw new ModelTextError(`${reason} (${path})`);
    console.warn(JSON.stringify({ evt: "roadmap.topicTripwire", path: path.slice(0, 120), reason }));
    const layer = holder && typeof holder.layer === "number" && Number.isInteger(holder.layer) ? holder.layer : null;
    return layer != null ? `Layer ${layer}` : "this topic";
  };
  const walk = (v: unknown, path: string, holder: Record<string, unknown> | null, key: string): unknown => {
    if (typeof v === "string") {
      if (quarantined.some((n) => holdsName(v, n))) return fire(path, "a Gemini topic name not kept by you", holder);
      const parted = holder != null && Array.isArray(holder[`${key}Parts`]);
      const carriesMark = holder != null && holder.geminiNamed === true;
      if (!parted && !carriesMark && marked.some((n) => holdsName(v, n))) {
        // A kept Gemini-named Domain's name is the user's Domain, not quarantined text: in production the line is logged
        // and the words stay (a missing mark is a render fault, never a leak); checks throw.
        if (mode === "THROW") return fire(path, "a Gemini-named Domain outside its mark", holder);
        console.warn(JSON.stringify({ evt: "roadmap.topicTripwire", path: path.slice(0, 120), reason: "a Gemini-named Domain outside its mark" }));
      }
      return v;
    }
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x, i) => {
        const y = walk(x, `${path}[${i}]`, holder, key);
        if (y !== x) changed = true;
        return y;
      });
      return changed ? out : v;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        if (TOPIC_NAME_FREE_KEYS.has(k)) {
          out[k] = x;
          continue;
        }
        const y = walk(x, path ? `${path}.${k}` : k, o, k);
        if (y !== x) changed = true;
        out[k] = y;
      }
      return changed ? out : v;
    }
    return v;
  };
  return walk(payload, "", null, "");
}

// ── Views (§22.14 Loaders; lane 9 renders them) ──

/** The estimate's view (RatingView) from a record: its layers, whose estimate, Gemini's replies, the room, the tail and code's own estimate. */
function ratingViewOfRecord(record: RatingRecord, depth: TopicDepth, trackArea: boolean, outlineLines: number): RatingView {
  // RATING_ORIGINS[1] is code's estimate (the literal origin 'CODE' is written only in realism and the catalog: roadmap-ui-check).
  let appEstimate = record.origin === t5.RATING_ORIGINS[1] ? layersOfDiff(record.difficulty) : 0;
  try {
    appEstimate = layersOfDiff(ratingLib.depthFallbackOf({ trackArea, outlineLines }));
  } catch {
    // roadmap-rating can't answer yet: the record's own when it is code's.
  }
  return {
    layers: record.layers,
    origin: record.origin,
    geminiLayers: record.geminiDifficulty ? layersOfDiff(record.geminiDifficulty) : null,
    mapFilled: record.mapFilled,
    unsure: record.unsure,
    oneReply: record.oneReply ? layersOfDiff(record.oneReply) : null,
    replies: record.samples.map((s) => (s ? layersOfDiff(s.difficulty) : null)),
    breadth: record.breadth,
    room: { ...BREADTH_TABLE[record.breadth] },
    reasons: [...record.reasons],
    cautions: [...record.cautions],
    changes: [...record.changes],
    tail: DEPTH_TAIL[depth],
    appEstimate,
  };
}

/** Today's Gemini requests left (lane 10's requestsToday over the user's runs; none counted when it can't answer). */
function topicRequestsLeftOf(b: RoadmapBundle, today: DayKey): { requests: number; grounded: number } {
  try {
    const used = model.requestsToday(b.runs, today);
    return { requests: Math.max(0, ROADMAP_REQUESTS_PER_DAY - used.requests), grounded: Math.max(0, GROUNDED_REQUESTS_PER_DAY - used.grounded) };
  } catch {
    return { requests: ROADMAP_REQUESTS_PER_DAY, grounded: GROUNDED_REQUESTS_PER_DAY };
  }
}

/** A Domain row's name and mark (ruling 67), from the tree. */
function domainMarkOf(tree: readonly TreeField[], id: string | null): { id: string; name: string; geminiNamed: boolean } | null {
  if (!id) return null;
  for (const f of tree) for (const d of f.domains) if (d.id === id) return { id: d.id, name: d.name, geminiNamed: geminiNamedOf(d) };
  return null;
}

/**
 * The map's view (TopicMapView): its rating, each band's rows (the names behind the count last, NOT_CHECKED, for the
 * fold to reveal), the cautions, accept's refusal in words (a draft), the requests left, the layer-1 seeds (the Area's
 * free Domains, each with its mark), the last-layer seeds (your aim's clauses less the split ones and those placed) and,
 * on a draft, [Accept all]'s list (acceptAllListOfMap: what acceptCore's keptAllOf compares).
 */
function topicMapViewOf(
  e: Env,
  b: RoadmapBundle,
  version: number,
  tree: readonly TreeField[],
  today: DayKey,
  opts: { draft: boolean; rating: RatingRecord | null; depth: TopicDepth; others: readonly RoadmapRec[] }
): TopicMapView {
  const field = tree.find((f) => f.id === b.roadmap.fieldId) ?? null;
  const map = settledTopicMapOf(mapOfVersion(b, version, opts.rating?.layers ?? null));
  const lines = intakeOf(b.roadmap).syllabus?.lines.length ?? 0;
  let rating = opts.rating;
  if (!rating) {
    try {
      rating = ratingLib.codeRatingOf({ trackArea: false, outlineLines: lines, texts: { aim: b.roadmap.aim, areaName: field?.name ?? "", constraints: b.roadmap.constraints }, inputKey: "", day: today });
    } catch {
      rating = null;
    }
  }
  const ratingView: RatingView = rating
    ? ratingViewOfRecord(rating, opts.depth, false, lines)
    : { layers: map.layers, origin: "YOURS", geminiLayers: null, mapFilled: null, unsure: null, oneReply: null, replies: [], breadth: "MEDIUM", room: { ...BREADTH_TABLE.MEDIUM }, reasons: [], cautions: [], changes: [], tail: DEPTH_TAIL[opts.depth], appEstimate: map.layers };
  // A live plan's layer states read its milestones: reached DONE, held HELD, the next one open OPEN, the rest AFTER.
  const rows = opts.draft ? [] : planRowsOf(b).filter((m) => m.chainRole === "LAYER");
  const stateOf = (layer: number): TopicLayerView["state"] => {
    if (opts.draft) return layer === 1 ? "OPEN" : "AFTER";
    const m = rows.find((r) => r.layer === layer && !superseded(b, r));
    if (!m) return "AFTER";
    if (heldRow(m)) return "HELD";
    if (m.reachedDay) return "DONE";
    return isCarried(m) || !prereqsOpenOf(b, m, tree) ? "OPEN" : "AFTER";
  };
  const slotOf = (roadmapId: string): GoalSlot | null => {
    const r = opts.others.find((x) => x.id === roadmapId);
    return r ? shownSlotOf(r) : null;
  };
  const rowOf = (t: TopicDraft): TopicRowView => {
    const domain0 = domainMarkOf(tree, t.domainId);
    // A Gemini name you kept whose Domain accept created from it (the Domain carries the Gemini mark and the name) stays
    // kept by you («Gemini · kept by you», or «· kept · not checked»), never "Gemini picked your Domain".
    const createdFrom = t.nameOrigin === "GEMINI" && t.decision === "KEPT" && !!t.domainId && !t.bound && !!domain0?.geminiNamed && domain0.name === t.name;
    const cls = createdFrom ? topicClassFor({ ...t, domainId: null, bound: false }) : topicClassFor(t);
    const parents = parentsInMapOf(map, t);
    const childKeys = map.edges
      .filter((x) => x.parentLineageId === t.lineageId && edgeCounts(x))
      .map((x) => map.topics.find((c) => c.lineageId === x.childLineageId && topicLive(c))?.key)
      .filter((k): k is string => !!k);
    const startsChosen = cls === "SYLLABUS" || cls === "YOURS" || cls === "AIM" || cls === "LINKED" || /^U\d+$/.test(t.key);
    const domain = domain0;
    const levelOf = (): number | null => {
      for (const f of tree) for (const d of f.domains) if (d.id === t.domainId) return typeof d.level === "number" ? d.level : null;
      return null;
    };
    return {
      key: t.key,
      lineageId: t.lineageId,
      name: t.name,
      cls,
      layer: t.layer,
      chosen: t.chosen,
      canChoose: !(t.layer === 1 && startsChosen),
      role: t.role,
      level: levelOf(),
      parents: parents.layer
        ? { kind: "LAYER", layer: t.layer - 1 }
        : {
            kind: "LINKS",
            keys: parents.topics.map((p) => p.key),
            crossGoal: parents.crossGoal.map((c) => {
              const d = domainMarkOf(tree, c.domainId);
              return { slot: slotOf(c.roadmapId), name: d?.name ?? "", geminiNamed: d?.geminiNamed ?? false, roadmapId: c.roadmapId, domainId: c.domainId };
            }),
          },
      children: childKeys,
      votes: t.nameOrigin === "GEMINI" ? { form: t.formVotes, samples: t.samples } : null,
      sources: cls === "LINKED" || cls === "KEPT" ? t.sources.slice(0, GROUND_SOURCES_SHOWN) : [],
      placed: t.placedBy,
      held: t.heldDay != null,
      skipped: t.skippedDay != null,
      notes: [...t.notes],
      domain,
    };
  };
  const layers: TopicLayerView[] = [];
  let hiddenAll = 0;
  for (let layer = 1; layer <= map.layers; layer++) {
    const inLayer = map.topics.filter((t) => topicLive(t) && t.layer === layer);
    const shown = inLayer.filter((t) => !topicHidden(t));
    const hidden = inLayer.length - shown.length;
    hiddenAll += hidden;
    const keptLayer = shown.length > 0 && shown.every((t) => t.decision !== "PENDING");
    let emptyOffers: TopicLayerView["emptyOffers"] = null;
    if (shown.length === 0) {
      try {
        emptyOffers = topicsLib.emptyLayerOffersOf(map, layer);
      } catch {
        emptyOffers = [...(layer > 1 ? (["MERGE_UP"] as const) : []), "WRITE_ONE", ...(hidden > 0 ? (["SHOW_HIDDEN"] as const) : [])];
      }
    }
    layers.push({
      layer,
      state: stateOf(layer),
      kept: keptLayer,
      // The names behind "n not checked" are listed after the shown rows (cls NOT_CHECKED, no sources, unticked: outside
      // the plan until you keep one), so the fold reveals them (§22.11 allows hidden names inside the revealed fold).
      topics: [...shown.map(rowOf), ...inLayer.filter(topicHidden).map(rowOf)],
      unchosen: shown.filter((t) => !t.chosen).length,
      hidden,
      geminiNames: shown.some((t) => t.nameOrigin === "GEMINI"),
      emptyOffers,
      needsParent: shown.filter((t) => t.notes.includes("NEEDS_PARENT")).length,
    });
  }
  let acceptRefusal: string | null = null;
  if (opts.draft) {
    const used = new Set(map.topics.map((t) => t.domainId).filter((d): d is string => !!d));
    try {
      const trimmed = { ...map, layers: Math.max(LAYERS_MIN, filledBandsOf(map) || map.layers) };
      const code = topicsLib.acceptRefusalOf(trimmed, (field?.domains ?? []).filter((d) => !used.has(d.id)).map((d) => d.name));
      acceptRefusal = code ? ACCEPT_REFUSAL_LINE[code] : chosenLiveTopicsOf(map).length === 0 ? ACCEPT_REFUSAL_LINE.LAST_LAYER_EMPTY : null;
    } catch {
      acceptRefusal = null;
    }
  }
  const heldElsewhere = new Set(opts.others.filter(holdsGoal).flatMap((r) => [...goalDomainsOf(r)]));
  const inMap = new Set(map.topics.filter(topicLive).map((t) => t.domainId).filter((d): d is string => !!d));
  const layerOneSeeds = opts.draft
    ? (field?.domains ?? []).filter((d) => !inMap.has(d.id) && !heldElsewhere.has(d.id)).map((d) => ({ id: d.id, name: d.name, geminiNamed: geminiNamedOf(d) }))
    : [];
  let lastLayerSeeds: AimClause[] = [];
  if (opts.draft) {
    try {
      lastLayerSeeds = offeredClausesOf(b.roadmap, map);
    } catch {
      lastLayerSeeds = [];
    }
  }
  return {
    roadmapId: b.roadmap.id,
    version,
    rating: ratingView,
    layers,
    hidden: hiddenAll,
    cautions: [...ratingView.cautions],
    acceptRefusal,
    requestsLeft: topicRequestsLeftOf(b, today),
    layerOneSeeds,
    lastLayerSeeds,
    // [Accept all]'s list from the rule acceptCore's keptAllOf compares (a draft only).
    ...(opts.draft ? { acceptAll: acceptAllListOfMap(map) } : {}),
  };
}

/**
 * The roadmap page's TOPICS parts (§22.14 Loaders), over the view roadmapViewOfData composed: on a live TOPICS plan,
 * the header's planKind, rating and cautions, RoadmapView.topicMap, each layer milestone's layer, chainRole, opensAfter
 * (a locked layer: "after 1"), titleParts and `known`, and the current milestone's measures' topicLineageId, "climbing
 * to 8" and labelParts; on a TOPICS draft, DraftView.topicMap with accept's refusal (the draft is acceptable only
 * when the map is). Then the tripwire over the whole payload (assertTopicNames: REDACT, THROW under ROADMAP_CHECK). A
 * LEVELS plan with no TOPICS draft returns `view` itself.
 */
function withTopicViews(e: Env, b: RoadmapBundle, ctx: PlanContext, view: RoadmapView, today: DayKey): RoadmapView {
  const liveTopics = kindOfRow(b.roadmap) === "TOPICS" && b.roadmap.version >= 1;
  // A TOPICS draft shows its map with or without milestones (an empty or names-less map is never a dead end).
  const draftTopics = !!view.draft && isTopicsDraft(b);
  if (!liveTopics && !draftTopics) return view;
  const tree = ctx.tree;
  const others = (e.goals.get(b.roadmap.userId) ?? []).filter((r) => r.id !== b.roadmap.id);
  let out: RoadmapView = view;
  if (liveTopics) {
    const depth = topicDepthOfRow(b.roadmap) ?? AIM_DEPTHS[DEPTH_DEFAULT];
    const rating = storedRatingOf(b.roadmap.rating);
    const topicMap = topicMapViewOf(e, b, b.roadmap.version, tree, today, { draft: false, rating, depth, others });
    const marks = tree.flatMap((f) => f.domains.map((d) => ({ name: d.name, geminiNamed: geminiNamedOf(d) })));
    const liveMap = mapOfVersion(b, b.roadmap.version);
    const rowById = new Map(b.milestones.map((m) => [m.id, m]));
    const milestones = out.milestones.map((r) => {
      const m = rowById.get(r.id);
      if (!m) return r;
      const lineages = Array.from(new Set(m.measures.map((x) => x.topicLineageId).filter((l): l is string => !!l)));
      const known = lineages.length > 0 && lineages.every((l) => liveMap.topics.some((t) => t.lineageId === l && (t.skippedDay != null || t.heldDay != null)));
      const locked = m.chainRole === "LAYER" && m.status === "PLANNED" && m.reachedDay == null && m.layer != null && prereqsOpenOf(b, m, tree);
      return { ...r, layer: m.layer ?? null, chainRole: (m.chainRole === "LAYER" || m.chainRole === "DEPTH" ? m.chainRole : null) as t5.ChainRole | null, opensAfter: locked ? (m.layer as number) - 1 : null, titleParts: namedPartsOf(r.title, marks), known };
    });
    // The current view's measure rows are its milestone's measures less the checkpoint's, in order (currentViewOf).
    const specs = out.current ? out.current.milestone.measures.filter((x) => x.kind !== "CHECKPOINT") : [];
    const current = out.current
      ? {
          ...out.current,
          measures: out.current.measures.map((x, i) => {
            const spec = specs[i];
            const lineage = spec?.topicLineageId ?? null;
            const t = lineage ? liveMap.topics.find((y) => y.lineageId === lineage) : undefined;
            const climbing = spec && spec.role === "CONTEXT" && t && !t.skippedDay && !t.heldDay && spec.minLevel != null && spec.minLevel < BASE_LEVEL ? BASE_LEVEL : null;
            return { ...x, topicLineageId: lineage, climbing, ...(typeof x.label === "string" ? { labelParts: namedPartsOf(x.label, marks) } : {}) };
          }),
        }
      : out.current;
    // "Toward the aim" names the plan's Domains in its measure labels: a kept Gemini-named one carries its mark there too.
    const toward = out.toward
      ? { ...out.toward, measures: out.toward.measures.map((x) => (typeof x.label === "string" ? { ...x, labelParts: namedPartsOf(x.label, marks) } : x)) }
      : out.toward;
    out = {
      ...out,
      header: out.header ? { ...out.header, planKind: "TOPICS", rating: topicMap.rating, cautions: [...topicMap.cautions] } : out.header,
      topicMap,
      milestones,
      current,
      toward,
    };
  }
  if (draftTopics && out.draft) {
    const facts = draftKindFactsOf(b);
    const depth = facts.depth ?? AIM_DEPTHS[DEPTH_DEFAULT];
    const topicMap0 = topicMapViewOf(e, b, b.roadmap.version + 1, tree, today, { draft: true, rating: facts.rating, depth, others });
    // [Accept all] asks for the keep-over switch when the draft is over your hours or pace (the footer's own rule).
    const topicMap = { ...topicMap0, needsOver: !!out.draft.feasibility.over || out.draft.dateCheck?.verdict === "OVER" };
    out = {
      ...out,
      draft: {
        ...out.draft,
        topicMap,
        // A TOPICS draft is accepted on its map: refused while the map is (the confirm then names what accept creates).
        acceptable: topicMap.acceptRefusal == null && out.draft.feasibility.impossible !== true,
        nextToDecide: null,
      },
    };
  }
  const v = b.roadmap.version;
  const topics = (b.topics ?? []).filter((t) => t.version === v || t.version === v + 1).map(topicOfRec);
  const domains = tree.flatMap((f) => f.domains.map((d) => ({ id: d.id, name: d.name, nameOrigin: d.nameOrigin ?? null, originName: d.originName ?? null })));
  const mode = process.env.ROADMAP_CHECK === "1" ? "THROW" : "REDACT";
  return assertTopicNames(out, { topics, domains }, mode) as RoadmapView;
}

// ═══ Revision 5, lane 10: the model phases, one step per invocation (contracts §22.14, §22.15; rulings 17, 47, 66) ═══
//
// [Break it down] (breakDownCore) and [Rate again] (rateAgainCore) claim the chain head, RATE; [Go deeper]
// (goDeeperCore) claims DEEPER. Every later step is advanceTopicChainCore's: DraftRunning's poll calls it, and so do
// GROUND's [Try again] and the resume after the Over pre-check (`retry`). A step is one run row (RoadmapRun.phase):
// RATE, MAP, LINK, one GROUND wave (≤ GROUND_PARALLEL calls) or DEEPER; LINK and GROUND's first wave share a step.
// Each step runs in its own invocation's after() (runTopicStepCore), within ROADMAP_BACKSTOP_MS or GROUND_BACKSTOP_MS,
// so it fits the roadmap pages' maxDuration of 60 s with time for its writes. A RUNNING step younger than
// TOPIC_RUN_STALE_MS is returned and nothing is claimed; an older one reads FAILED "timed out" at the next claim.
//
// Every claim runs REQUESTS_BELOW with that step's own need (ROADMAP_REQUESTS_PER_DAY, GROUNDED_REQUESTS_PER_DAY), and
// the head also GEMINI_RUNS_BELOW (the draft cap counts chain heads only). A claimed row carries the requests it will
// send; the step writes what it sent. Each phase fails closed: RATE → code's estimate; MAP → no Gemini names; LINK →
// "after layer N"; GROUND → the names stay hidden, with [Try again].
//
// What a step writes goes through lane 8's TOPICS draft writer (rebuildTopicsDraftOps): the draft version's map rows
// as the step changed them (MAP's placements of your lines and Domains, Gemini's names and your aim's spans; LINK's
// GEMINI edges; GROUND's verdicts and sources, with ruling 43's chosen-by-default; DEEPER's children), the draft's
// milestones rebuilt from the map, and the rating where the draft's kind lives (ruling 49) — with the run row's facts,
// in one transaction guarded on the row still RUNNING. A step that loses a race to its parallel twin (LINK and
// GROUND's first wave) re-reads and re-applies its result to the map as it now stands; a save of your words meanwhile
// supersedes it. Gemini text lives only in the topic rows and the run's raw samples (server only), and reaches a view
// only through lane 8's loaders and their gates (§22.11).
//
// Every core refuses while its switch is off (topicSwitchesOf: rate for the chain, names for Go deeper), before it
// reads anything, and runTopicStepCore reads the switch again before any call. With every TOPIC_* switch false (this
// build), no path here reaches the model.
//
//   breakDownCore · rateAgainCore · goDeeperCore · advanceTopicChainCore · runTopicStepCore · TopicChainStep ·
//   REQUESTS_CAPPED · GROUNDED_CAPPED · NOTHING_DEEPER

/** A topic step refused at ROADMAP_REQUESTS_PER_DAY (§22.14). */
export const REQUESTS_CAPPED = model.REQUEST_CAP_LINE;
/** A GROUND wave refused at GROUNDED_REQUESTS_PER_DAY (§22.14): the names stay hidden. */
export const GROUNDED_CAPPED = model.GROUNDED_CAP_LINE;
/** A Go deeper whose agreement kept nothing (a result line, not a refusal; ruling 63). */
export const NOTHING_DEEPER = "Gemini named nothing narrower.";
/** [Break it down] on a goal that is neither a draft nor active (paused, done or archived). */
const BREAK_DOWN_OPEN_ONLY = "Only an open goal's topics are broken down: resume it first.";

/** advanceTopicChainCore's answer (§22.14): the step running or just claimed, or `done` when nothing is left to claim. */
export interface TopicChainStep {
  runId: string | null;
  phase: t5.RunPhase | null;
  status: RunStatus | null;
  done: boolean;
}

/** A run row with migration B's columns, as the store reads it. */
type TopicRun = RunRec & { phase?: string | null; requests?: number | null; grounding?: unknown };

/** GROUND's batch plan for a chain (on its first wave's row and its LINK row): the batches' keys, the terms past the cap, and whether LINK was asked. */
interface GroundPlan {
  batches: string[][];
  notRun: string[];
  link: boolean;
}

/** A topic step's report (RoadmapRun.report on a phase row; server only, never in a view). */
interface TopicStepReport {
  /** The chain head's run id (the RATE or DEEPER row; the head's own id on the head). */
  chain: string;
  /** A reuse: the OK run of the same inputHash whose replies (or verdicts) this step reads instead of calling the model. */
  reuseFrom?: string | null;
  /** RATE: the stored rating was reused (no call). */
  reusedRating?: boolean;
  /** MAP: stopped by the realism pre-check (chainFitOf OVER or IMPOSSIBLE); `retry` checks again. */
  over?: boolean;
  verdict?: string;
  /** The pre-check's whole answer (its basis line and offers), for the view's stop (fix round). */
  fit?: t5.ChainFit;
  /** MAP and DEEPER: the new rows' keys, kept by the agreement or hidden behind the count, and the agreement's report. */
  kept?: string[];
  hidden?: string[];
  topics?: t5.TopicRunReport;
  kFinal?: number;
  /** DEEPER: the parent's key, and whether Gemini named nothing narrower. */
  parent?: string;
  nothing?: boolean;
  /** LINK: the children voided (NONE mixed with keys, an empty list) and the findings. */
  voids?: number;
  findings?: number;
  /** GROUND: the chain's plan, this row's wave and batches, the batches whose call failed, and whether it re-runs a failed wave. */
  plan?: GroundPlan;
  wave?: number;
  batches?: string[][];
  failed?: string[][];
  retry?: boolean;
  /** Each sample's integrity verdict (null: no reply). */
  verdicts?: (t5.IntegrityVerdict | null)[];
}

/** RoadmapRun.pack on a topic step: the packs sent (one; one per GROUND batch), the candidates, GROUND's terms and MAP's room. */
interface TopicStepPack {
  packs: evidence.TopicPack[];
  candidateCount: number;
  terms?: groundingLib.GroundTerm[][];
  mapInput?: { layers: number; breadth: t5.BreadthKey; room: number };
}

/** The TOPICS draft the chain works on (lane 8's draftKindFactsOf): its version, rating and depth; `onPlan` when its kind rides Roadmap.draftPlan. */
interface ChainDraftRef {
  version: number;
  rating: t5.RatingRecord | null;
  depth: t5.TopicDepth | null;
  onPlan: boolean;
}

/** One step's world: the user's roadmap as read, its TOPICS draft, the switches, the tree, the intake and the Area's name. */
interface ChainCtx {
  e: Env;
  deps: RoadmapDeps;
  userId: string;
  now: Date;
  today: DayKey;
  b: RoadmapBundle;
  ref: ChainDraftRef;
  sw: t5.TopicSwitches;
  tree: TreeField[];
  intake: Intake;
  areaName: string;
  splitClauses: t5.SplitClause[];
  /** A dry run (the view's `done`, fix round): every decision a claim makes, no reuse read and nothing written. */
  dry?: boolean;
}

/** One row a claim writes. `status` FAILED (the MAP pre-check's stop) and REUSED (the stored rating) are written settled and never run. */
interface StepSpec {
  phase: t5.RunPhase;
  pack: TopicStepPack;
  report: Omit<TopicStepReport, "chain">;
  /** What it will send (0 for a reuse or a settled row). */
  requests: number;
  /** A GROUND row: its requests count against GROUNDED_REQUESTS_PER_DAY too. */
  grounded: boolean;
  inputHash: string | null;
  status?: "RUNNING" | "FAILED" | "REUSED";
  error?: string | null;
}

/** One running step. */
interface StepRun {
  c: ChainCtx;
  run: TopicRun;
  report: TopicStepReport;
  sp: TopicStepPack;
}

/** A step's change to the draft, applied to the map and rating as they stand when it is written (re-applied after a lost race). */
type ChainChange = (map: t5.TopicMap, rating: t5.RatingRecord | null) => { map: t5.TopicMap; rating: t5.RatingRecord | null; report?: Partial<TopicStepReport> };

type ChainNext =
  | { kind: "DONE" }
  | { kind: "MAP" }
  | { kind: "S3" }
  | { kind: "UNITS"; link: boolean; waves: { wave: number; batches: string[][]; retry: boolean }[]; plan: GroundPlan }
  | { kind: "DEEPER_GROUND" };

const CHAIN_NOTHING_LEFT: TopicChainStep = { runId: null, phase: null, status: null, done: true };
/** Ancestors a Go deeper sends, at most (shallowest first). */
const DEEPER_ANCESTORS_MAX = 12;

// ── Reading ──

const chainPhaseOf = (r: RunRec | null | undefined): t5.RunPhase | null => {
  const p = r ? (r as TopicRun).phase : null;
  return isOneOf(t5.RUN_PHASES, p) ? p : null;
};

function chainReportOf(r: RunRec | null | undefined): TopicStepReport | null {
  const v = r?.report;
  return v && typeof v === "object" && typeof (v as { chain?: unknown }).chain === "string" ? (v as TopicStepReport) : null;
}

function chainStepPackOf(v: unknown): TopicStepPack | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Partial<TopicStepPack>;
  if (!Array.isArray(p.packs)) return null;
  return {
    packs: p.packs,
    candidateCount: typeof p.candidateCount === "number" && Number.isFinite(p.candidateCount) ? p.candidateCount : 1,
    ...(Array.isArray(p.terms) ? { terms: p.terms } : {}),
    ...(p.mapInput && typeof p.mapInput === "object" ? { mapInput: p.mapInput } : {}),
  };
}

/** The TOPICS draft a chain works on: an open goal's draft group of kind TOPICS (lane 8's isTopicsDraft and draftKindFactsOf; ruling 49); else null. */
function chainDraftOf(b: RoadmapBundle): ChainDraftRef | null {
  if (b.roadmap.status !== "DRAFT" && b.roadmap.status !== "ACTIVE") return null;
  if (!isTopicsDraft(b)) return null;
  const f = draftKindFactsOf(b);
  return { version: b.roadmap.version + 1, rating: f.rating, depth: f.depth, onPlan: f.inDraftPlan };
}

/** The depth the chain plans to (the draft's; Mastered by default, as lane 8's edits read it). */
const chainDepthOf = (ref: ChainDraftRef): t5.TopicDepth => ref.depth ?? AIM_DEPTHS[DEPTH_DEFAULT];

/** The draft version's map (lane 8's mapOfVersion over the bundle), its bands the rating's K. */
const chainMapOf = (b: RoadmapBundle, ref: ChainDraftRef): t5.TopicMap => mapOfVersion(b, ref.version, ref.rating?.layers ?? null);

/**
 * The rating's write when the map's writer couldn't rebuild the draft (a fallback, logged): Roadmap.rating on a fresh
 * DRAFT, Roadmap.draftPlan.rating on a re-plan draft; the live version's columns never change here (ruling 49).
 */
function chainRatingWriteOps(r: RoadmapRec, ref: ChainDraftRef, rating: t5.RatingRecord, now: Date): StoreOp[] {
  if (ref.onPlan) {
    const raw = r.draftPlan && typeof r.draftPlan === "object" ? (r.draftPlan as t5.DraftPlan) : null;
    if (!raw || raw.version !== ref.version) return [];
    return [{ op: "update", table: "roadmap", where: { id: r.id, status: r.status }, data: { draftPlan: { ...raw, rating } satisfies t5.DraftPlan, updatedAt: now } }];
  }
  if (r.status !== "DRAFT") return [];
  return [{ op: "update", table: "roadmap", where: { id: r.id, status: "DRAFT" }, data: { rating, updatedAt: now } }];
}

const stringsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const isKeyOf = (prefix: "S" | "U" | "T") => (t: { key: string }): boolean => new RegExp(`^${prefix}[1-9]\\d{0,2}$`).test(t.key);
const keyNumberOf = (key: string): number => (/^[SUT](\d+)$/.test(key) ? Number(key.slice(1)) : Number.POSITIVE_INFINITY);
const byTopicKey = (a: { key: string }, b: { key: string }): number => "SUT".indexOf(a.key[0]) - "SUT".indexOf(b.key[0]) || keyNumberOf(a.key) - keyNumberOf(b.key);
const chainLiveOf = (map: t5.TopicMap): t5.TopicDraft[] => map.topics.filter(topicLive);
/** A topic the agreement hid (a note or flag says why): it is never sent to LINK or GROUND. */
const chainHiddenMarked = (t: t5.TopicDraft): boolean =>
  t.notes.includes("NEAR_DUPLICATE") || t.notes.includes("UNSURE_LAYER") || t.flags.includes("REGION") || t.flags.includes("LANGUAGE_UNCHECKED");

/** The outline lines and the exam label a topic pack may send (the exam's label only with your Yes; never its day). */
const chainOutlineOf = (intake: Intake): string[] => (intake.syllabus?.lines ?? []).filter((l): l is string => typeof l === "string");
const chainExamLabelOf = (intake: Intake): string | null => (validate.examAnswerOf(intake) && intake.examLabel ? intake.examLabel : null);

/** The nameOrigin of the tree's Domain with this id (not in the tree: yours). */
function domainNameOriginByIdOf(tree: readonly TreeField[], id: string): string | null {
  for (const f of tree) for (const d of f.domains) if (d.id === id) return d.nameOrigin ?? null;
  return null;
}

/** Other goals' Domains (§23.5): the ids every other DRAFT, ACTIVE or PAUSED goal holds, and their names (MAP's takenNames). */
async function chainCrossGoalOf(c: ChainCtx): Promise<{ held: Set<string>; takenNames: string[] }> {
  const rows = c.e.goals.get(c.userId) ?? (await c.e.store.listRoadmaps(c.userId));
  const held = new Set(rows.filter((r) => r.id !== c.b.roadmap.id && holdsGoal(r)).flatMap((r) => [...goalDomainsOf(r)]));
  const takenNames = c.tree.flatMap((f) => f.domains).filter((d) => held.has(d.id)).map((d) => d.name);
  return { held, takenNames };
}

/** MAP's and DEEPER's free Domains (§22.8 step 7): the Area's Domains you did not choose, none another goal holds and none Gemini named. */
function chainFreeDomainsOf(c: ChainCtx, map: t5.TopicMap, held: ReadonlySet<string>): { id: string; name: string }[] {
  const field = c.tree.find((f) => f.id === c.intake.fieldId);
  if (!field) return [];
  const used = new Set<string>([...c.intake.domainIds, ...chainLiveOf(map).flatMap((t) => (t.domainId && (t.bound || t.chosen) ? [t.domainId] : []))]);
  const candidates = field.domains.filter((d) => !used.has(d.id));
  const packable = new Set(evidence.packableDomainsOf(candidates.map((d) => ({ id: d.id, nameOrigin: d.nameOrigin ?? null })), [...held]));
  return candidates.filter((d) => packable.has(d.id)).map((d) => ({ id: d.id, name: d.name }));
}

/** Whether your texts name a country (COUNTRY_WORDS as whole-word runs, case-insensitive): REGION reads it. */
function chainCountryNamedOf(texts: readonly (string | null | undefined)[]): boolean {
  const entries = lexiconLib.COUNTRY_WORDS.map((w) => synonymsLib.words(w).map((x) => x.raw.toLowerCase())).filter((w) => w.length > 0);
  for (const text of texts) {
    if (typeof text !== "string" || text === "") continue;
    const typed = synonymsLib.words(text).map((w) => w.raw.toLowerCase());
    for (const want of entries) for (let i = 0; i + want.length <= typed.length; i++) if (want.every((w, k) => typed[i + k] === w)) return true;
  }
  return false;
}

/** The LEVELS pack's limits (ruling 66; §23.5): the split clauses, and every Domain another goal holds or Gemini named. Empty: none (byte-identical). */
function levelsPackLimitsOf(e: Env, userId: string, roadmap: RoadmapRec, tree: readonly TreeField[]): { splitClauses?: t5.SplitClause[]; excludeDomainIds?: string[] } {
  const split = storedSplitClausesOf(roadmap);
  const held = (e.goals.get(userId) ?? []).filter((r) => r.id !== roadmap.id && holdsGoal(r)).flatMap((r) => [...goalDomainsOf(r)]);
  const all = tree.flatMap((f) => f.domains);
  const keep = new Set(evidence.packableDomainsOf(all.map((d) => ({ id: d.id, nameOrigin: d.nameOrigin ?? null })), held));
  const exclude = all.filter((d) => !keep.has(d.id)).map((d) => d.id);
  return { ...(split.length ? { splitClauses: split } : {}), ...(exclude.length ? { excludeDomainIds: exclude } : {}) };
}

async function chainCtxOf(e: Env, deps: RoadmapDeps, userId: string, b: RoadmapBundle, ref: ChainDraftRef, sw: t5.TopicSwitches, now: Date): Promise<ChainCtx> {
  const tree = await e.io.fieldTree();
  const intake = intakeOf(b.roadmap);
  return { e, deps, userId, now, today: todayKey(now), b, ref, sw, tree, intake, areaName: areaNameOf(b.roadmap, tree), splitClauses: storedSplitClausesOf(b.roadmap) };
}

/** A run RUNNING and younger than TOPIC_RUN_STALE_MS (any kind: one step at a time per roadmap). */
const youngRunningOf = (runs: readonly RunRec[], now: Date): RunRec | null =>
  runs.find((r) => r.status === "RUNNING" && now.getTime() - r.startedAt.getTime() < t5.TOPIC_RUN_STALE_MS) ?? null;

const chainStepOf = (r: RunRec, done: boolean): TopicChainStep => ({ runId: r.id, phase: chainPhaseOf(r), status: r.status as RunStatus, done });

/** The draft version's newest chain: its head (the newest RATE or DEEPER row) and the steps after it, newest first (light rows). */
function chainRunsOf(b: RoadmapBundle, version: number): { head: RunRec | null; steps: RunRec[] } {
  const rows = b.runs.filter((r) => r.version === version && r.kind === "GEMINI" && chainPhaseOf(r) != null);
  const at = rows.findIndex((r) => chainPhaseOf(r) === "RATE" || chainPhaseOf(r) === "DEEPER");
  return at < 0 ? { head: null, steps: [] } : { head: rows[at], steps: rows.slice(0, at) };
}

/** A settled row's status (a RUNNING row past TOPIC_RUN_STALE_MS reads FAILED: the next claim marks it so). */
const settledOf = (r: RunRec): string => (r.status === "RUNNING" ? "FAILED" : r.status);

/** The GROUND plan a chain recorded (any of its LINK or GROUND rows), or null before step 3 was claimed. */
function chainPlanOf(rows: readonly RunRec[]): GroundPlan | null {
  for (const r of rows) {
    const p = chainReportOf(r)?.plan;
    if (p && Array.isArray(p.batches)) return { batches: p.batches.filter(Array.isArray), notRun: stringsOf(p.notRun), link: p.link === true };
  }
  return null;
}

/**
 * What comes after the chain's settled steps (pure; ruling 47). Without `retry`, the next missing unit — MAP, then
 * LINK with GROUND's first wave, then each further wave — and nothing past a CAPPED step or MAP's pre-check stop.
 * With `retry`, a CAPPED step, MAP's stop or a FAILED GROUND wave (its failed batches only) is claimed again.
 */
function chainNextOf(head: TopicRun, steps: readonly TopicRun[], retry: boolean): ChainNext {
  if (settledOf(head) === "CAPPED") return { kind: "DONE" };
  const ground = steps.filter((r) => chainPhaseOf(r) === "GROUND");
  if (chainPhaseOf(head) === "DEEPER") {
    const rep = chainReportOf(head);
    if (settledOf(head) === "FAILED" || rep?.nothing || (rep?.kept ?? []).length === 0) return { kind: "DONE" };
    const plan = chainPlanOf(ground);
    return plan ? chainUnitsNextOf(ground, [], { ...plan, link: false }, retry) : { kind: "DEEPER_GROUND" };
  }
  const links = steps.filter((r) => chainPhaseOf(r) === "LINK");
  const plan = chainPlanOf([...links, ...ground]);
  if (!plan) {
    const m = steps.find((r) => chainPhaseOf(r) === "MAP");
    if (!m) return { kind: "MAP" };
    if (settledOf(m) === "CAPPED" || chainReportOf(m)?.over) return retry ? { kind: "MAP" } : { kind: "DONE" };
    // A MAP whose replies all failed (or that timed out) is asked again only on your [Try again]; the poll goes on without names.
    if (retry && settledOf(m) === "FAILED") return { kind: "MAP" };
    return { kind: "S3" };
  }
  return chainUnitsNextOf(ground, links, plan, retry);
}

function chainUnitsNextOf(ground: readonly TopicRun[], links: readonly TopicRun[], plan: GroundPlan, retry: boolean): ChainNext {
  const P = t5.GROUND_PARALLEL;
  const waves = Math.ceil(plan.batches.length / P);
  const batchesOf = (w: number): string[][] => plan.batches.slice((w - 1) * P, w * P);
  const newestOf = (w: number): TopicRun | null => ground.find((r) => chainReportOf(r)?.wave === w) ?? null;
  const stateOf = (r: TopicRun | null, isGround: boolean): "MISSING" | "DONE" | "FAILED" | "CAPPED" => {
    if (!r) return "MISSING";
    const s = settledOf(r);
    if (s === "CAPPED") return "CAPPED";
    return isGround && s === "FAILED" ? "FAILED" : "DONE";
  };
  const link = plan.link ? stateOf(links[0] ?? null, false) : "DONE";
  const ws = Array.from({ length: waves }, (_, i) => stateOf(newestOf(i + 1), true));
  const againBatches = (w: number): string[][] => {
    const r = newestOf(w);
    const rep = chainReportOf(r);
    if (r && settledOf(r) === "FAILED" && rep?.failed?.length) return rep.failed;
    return rep?.batches?.length ? rep.batches : batchesOf(w);
  };
  if (retry) {
    const linkAgain = link === "CAPPED";
    const again = ws.flatMap((s, i) => (s === "CAPPED" || s === "FAILED" ? [i + 1] : []));
    if (linkAgain || again.includes(1)) return { kind: "UNITS", link: linkAgain, waves: again.includes(1) ? [{ wave: 1, batches: againBatches(1), retry: true }] : [], plan };
    if (again.length) return { kind: "UNITS", link: false, waves: [{ wave: again[0], batches: againBatches(again[0]), retry: true }], plan };
  } else if (link === "CAPPED" || ws.includes("CAPPED")) {
    return { kind: "DONE" };
  }
  if (link === "MISSING" || ws[0] === "MISSING") {
    return { kind: "UNITS", link: link === "MISSING", waves: ws[0] === "MISSING" ? [{ wave: 1, batches: batchesOf(1), retry: false }] : [], plan };
  }
  const missing = ws.findIndex((s) => s === "MISSING");
  return missing >= 0 ? { kind: "UNITS", link: false, waves: [{ wave: missing + 1, batches: batchesOf(missing + 1), retry: false }], plan } : { kind: "DONE" };
}

// ── Claiming ──

/** The newest OK run of this phase and inputHash a step may reuse (ROADMAP_REUSE_DAYS; GROUND only through groundReusableOf), or null. */
async function chainReusableOf(c: ChainCtx, phase: t5.RunPhase, inputHash: string): Promise<string | null> {
  try {
    const rows = await c.e.store.reusableRuns(c.userId, inputHash, addDays(c.today, -ROADMAP_REUSE_DAYS));
    for (const r of rows) {
      if (!model.isReusableRun(r, inputHash, c.today) || chainPhaseOf(r) !== phase) continue;
      if (phase === "GROUND" && !groundingLib.groundReusableOf((r as TopicRun).grounding)) continue;
      return r.id;
    }
  } catch (err) {
    console.error("roadmap: a reusable topic run wasn't read (none reused):", err instanceof Error ? err.message.slice(0, 200) : "failed");
  }
  return null;
}

/** A JSON phase's row: its pack, its inputHash (topicInputHashMaterial), and a reuse when one is found (never with `force`). */
async function chainJsonSpecOf(
  c: ChainCtx,
  phase: t5.RunPhase,
  pack: evidence.TopicPack,
  report: Omit<TopicStepReport, "chain">,
  extra: Pick<TopicStepPack, "mapInput">,
  force: boolean
): Promise<StepSpec> {
  const cc = t5.TOPIC_CANDIDATE_COUNT;
  const inputHash = sha256(evidence.topicInputHashMaterial(pack, ROADMAP_MODEL, t5.TOPIC_SAMPLES, cc));
  const reuseFrom = force || c.dry ? null : await chainReusableOf(c, phase, inputHash);
  return {
    phase,
    pack: { packs: [pack], candidateCount: cc, ...extra },
    report: { ...report, ...(reuseFrom ? { reuseFrom } : {}) },
    requests: reuseFrom ? 0 : model.phaseRequestsOf(cc),
    grounded: false,
    inputHash,
  };
}

/** GROUND terms: the kept Gemini names not yet checked, in key order. */
const chainGroundTermsOf = (kept: readonly t5.TopicDraft[]): groundingLib.GroundTerm[] =>
  kept
    .filter((t) => t.nameOrigin === "GEMINI" && t.grounding === "NOT_RUN" && isKeyOf("T")(t))
    .sort(byTopicKey)
    .map((t) => ({ key: t.key, name: t.name }));

/** One GROUND wave's row: one pack per batch (the batch's terms as the map holds them now), or null when no batch has a term left. */
async function chainGroundSpecOf(c: ChainCtx, wave: number, batches: readonly string[][], plan: GroundPlan, map: t5.TopicMap, retry: boolean): Promise<StepSpec | null> {
  const byKey = new Map(chainLiveOf(map).map((t) => [t.key, t]));
  const termsList = batches
    .map((batch) => batch.flatMap((k) => (byKey.has(k) ? [{ key: k, name: (byKey.get(k) as t5.TopicDraft).name }] : [])))
    .filter((terms) => terms.length > 0)
    .slice(0, t5.GROUND_PARALLEL);
  if (termsList.length === 0) return null;
  const packs = termsList.map((terms) =>
    evidence.topicPackOf({ phase: "GROUND", areaName: c.areaName, aim: "", splitClauses: [], outline: [], examLabel: null, terms: terms.map((t) => ({ ...t, id: byKey.get(t.key)?.lineageId ?? null })) })
  );
  const inputHash = sha256(packs.map((p) => evidence.topicInputHashMaterial(p, ROADMAP_MODEL, 1, 1)).join("\n||\n"));
  const reuseFrom = retry || c.dry ? null : await chainReusableOf(c, "GROUND", inputHash);
  return {
    phase: "GROUND",
    pack: { packs, candidateCount: 1, terms: termsList },
    report: { wave, plan, batches: termsList.map((terms) => terms.map((t) => t.key)), ...(retry ? { retry: true } : {}), ...(reuseFrom ? { reuseFrom } : {}) },
    requests: reuseFrom ? 0 : packs.length,
    grounded: true,
    inputHash,
  };
}

/** The topics MAP kept (not hidden by the agreement): what LINK is given and GROUND checks. */
function chainKeptOf(map: t5.TopicMap, mapRow: RunRec | null): t5.TopicDraft[] {
  const hidden = new Set(chainReportOf(mapRow)?.hidden ?? []);
  return chainLiveOf(map).filter((t) => !hidden.has(t.key) && !chainHiddenMarked(t));
}

/** K_final for LINK: the map's fill (rating.mapFilled), else kFinalOf over the kept topics. */
function chainKFinalOf(c: ChainCtx, map: t5.TopicMap, kept: readonly t5.TopicDraft[]): number {
  if (typeof c.ref.rating?.mapFilled === "number") return c.ref.rating.mapFilled;
  try {
    return topicsLib.kFinalOf(kept, c.ref.rating?.layers ?? map.layers);
  } catch {
    return c.ref.rating?.layers ?? map.layers;
  }
}

/** LINK's row over the kept topics up to K_final; null when LINK is off or asks nothing (K_final 1). */
async function chainLinkSpecOf(c: ChainCtx, map: t5.TopicMap, mapRow: RunRec | null, plan: GroundPlan | null): Promise<StepSpec | null> {
  if (!c.sw.link) return null;
  const kept = chainKeptOf(map, mapRow);
  const kFinal = chainKFinalOf(c, map, kept);
  if (kFinal <= t5.LAYERS_MIN) return null;
  const pack = evidence.topicPackOf({
    phase: "LINK",
    areaName: c.areaName,
    aim: "",
    splitClauses: [],
    outline: [],
    examLabel: null,
    layers: kFinal,
    topics: kept.filter((t) => t.layer <= kFinal).map((t) => ({ key: t.key, name: t.name, layer: t.layer, id: t.lineageId })),
  });
  if (!pack.schema) return null;
  return chainJsonSpecOf(c, "LINK", pack, plan ? { plan } : {}, {}, false);
}

/**
 * Writes one claim (ruling 47): under the per-user lock, ROADMAP_IS (the draft as read), NO_RECENT_RUNNING (no step
 * younger than TOPIC_RUN_STALE_MS), the head's GEMINI_RUNS_BELOW and every step's REQUESTS_BELOW; an older RUNNING row
 * reads FAILED "timed out"; then the rows, each carrying the requests it will send. At a cap it writes CAPPED rows
 * and answers the cap's words. A RUNNING row runs in its own after() (runTopicStepCore). `chain` null: the rows are a
 * new chain's head.
 */
async function claimChainSteps(c: ChainCtx, specs: readonly StepSpec[], opts: { chain: string | null; draft: boolean }): Promise<Result<TopicChainStep>> {
  // A dry run (the view's `done`) stops here: a claim would write these rows (a cap writes them CAPPED), so the chain isn't done.
  if (c.dry) return ok({ runId: null, phase: specs[0]?.phase ?? null, status: (specs[0]?.status ?? "RUNNING") as RunStatus, done: specs.length === 0 });
  const { e, userId, now, today } = c;
  const roadmapId = c.b.roadmap.id;
  const ids = specs.map(() => e.makeId());
  const chain = opts.chain ?? ids[0];
  const live = (s: StepSpec): boolean => (s.status ?? "RUNNING") === "RUNNING";
  const need = specs.reduce((n, s) => n + (live(s) ? Math.max(0, s.requests) : 0), 0);
  const needGrounded = specs.reduce((n, s) => n + (live(s) && s.grounded ? Math.max(0, s.requests) : 0), 0);
  const rowOf = (s: StepSpec, i: number, status: RunStatus, requests: number, error: string | null, seedBase: number): Record<string, unknown> => ({
    ...runRow(ids[i], userId, roadmapId, today, c.ref.version, "GEMINI", status, now, {
      model: ROADMAP_MODEL,
      promptVersion: t5.TOPIC_PROMPT_VERSION,
      seedBase,
      inputHash: s.inputHash,
      pack: s.pack,
      report: { ...s.report, chain },
      error,
      ...(status === "RUNNING" ? {} : { finishedAt: now }),
    }),
    phase: s.phase,
    requests,
  });
  const res = await withRetry<TopicChainStep>(async () => {
    const b = await e.store.bundle(userId, roadmapId);
    if (!b) return fail(NO_ROADMAP);
    const ref = chainDraftOf(b);
    if (!ref || ref.version !== c.ref.version) return fail(RACED);
    const young = youngRunningOf(b.runs, now);
    if (young) return opts.chain == null ? fail(DRAFT_RUNNING) : ok(chainStepOf(young, false));
    const day = await e.store.runsOfDay(userId, today);
    const seedBase = safeSeedBase(e, day.filter((r) => r.roadmapId === roadmapId && r.kind === "GEMINI" && r.status !== "REUSED" && r.status !== "CAPPED").length);
    const capped = async (line: string, why: string): Promise<Result<TopicChainStep>> => {
      await e.store.apply(userId, [{ op: "insert", table: "roadmapRun", rows: specs.map((s, i) => rowOf(s, i, "CAPPED", 0, why, seedBase)) }]);
      return fail(line);
    };
    if (opts.draft && day.filter(countsTowardDraftCap).length >= ROADMAP_DRAFTS_PER_DAY) return capped(DRAFT_CAPPED, "daily cap");
    const used = model.requestsToday(day as TopicRun[], today);
    if (need > 0 && used.requests + need > t5.ROADMAP_REQUESTS_PER_DAY) return capped(REQUESTS_CAPPED, "request cap");
    if (needGrounded > 0 && used.grounded + needGrounded > t5.GROUNDED_REQUESTS_PER_DAY) return capped(GROUNDED_CAPPED, "grounded request cap");
    const ops: StoreOp[] = [
      { op: "guard", guard: { g: "ROADMAP_IS", id: roadmapId, statuses: [b.roadmap.status as RoadmapStatus], version: b.roadmap.version } },
      { op: "guard", guard: { g: "NO_RECENT_RUNNING", roadmapId, since: new Date(now.getTime() - t5.TOPIC_RUN_STALE_MS) } },
    ];
    if (opts.draft) ops.push({ op: "guard", guard: { g: "GEMINI_RUNS_BELOW", day: today, max: ROADMAP_DRAFTS_PER_DAY } });
    if (need > 0) {
      ops.push({ op: "guard", guard: { g: "REQUESTS_BELOW", day: today, max: t5.ROADMAP_REQUESTS_PER_DAY, groundedMax: t5.GROUNDED_REQUESTS_PER_DAY, need, needGrounded } });
    }
    for (const r of b.runs.filter((x) => x.status === "RUNNING")) {
      ops.push({ op: "update", table: "roadmapRun", where: { id: r.id, status: "RUNNING" }, data: { status: "FAILED", error: "timed out", finishedAt: now } });
    }
    ops.push({
      op: "insert",
      table: "roadmapRun",
      rows: specs.map((s, i) => rowOf(s, i, (s.status ?? "RUNNING") as RunStatus, live(s) ? Math.max(0, s.requests) : 0, s.error ?? null, seedBase)),
    });
    const out = await e.store.apply(userId, ops);
    if (out !== "ok") return "stale";
    const first = specs[0];
    return ok({ runId: ids[0], phase: first.phase, status: (first.status ?? "RUNNING") as RunStatus, done: first.status === "FAILED" });
  });
  invalidate("roadmap");
  if (res.ok) {
    const toRun = specs.flatMap((s, i) => (live(s) ? [ids[i]] : []));
    if (toRun.length > 0) e.defer(() => runTopicStepsNow(toRun, c.deps));
  }
  return res;
}

/** chainFitOf for the pre-check; null when it can't be read (logged: the pre-check never blocks on its own failure). */
async function chainFitFor(c: ChainCtx, rating: t5.RatingRecord): Promise<t5.ChainFit | null> {
  try {
    const depth = chainDepthOf(c.ref);
    const ctx = await topicsContextOf(c.e, c.userId, c.b, depth, c.now);
    return realism.chainFitOf({ layers: rating.layers, breadth: rating.breadth, depth, input: { ...realismInputOf(ctx, []), planKind: "TOPICS" }, origin: rating.origin, examDay: c.intake.examDay ?? null });
  } catch (err) {
    console.error("roadmap: the chain's pre-check wasn't read:", err instanceof Error ? err.message.slice(0, 200) : "failed");
    return null;
  }
}

/** MAP's claim: the realism pre-check first (a chain that cannot fit costs no more requests), then `place` and/or `names`; with neither, step 3. */
async function claimChainMap(c: ChainCtx, head: TopicRun): Promise<Result<TopicChainStep>> {
  const rating = c.ref.rating;
  if (!rating) return ok(chainStepOf(head, true));
  const fit = await chainFitFor(c, rating);
  if (fit && (fit.verdict === "OVER" || fit.verdict === "IMPOSSIBLE")) {
    // The pre-check's stop (F-R5-2): a settled MAP row, no request; the Over offers show, and `retry` checks again.
    const stop: StepSpec = {
      phase: "MAP",
      pack: { packs: [], candidateCount: t5.TOPIC_CANDIDATE_COUNT },
      report: { over: true, verdict: fit.verdict, fit },
      requests: 0,
      grounded: false,
      inputHash: null,
      status: "FAILED",
      error: "the chain doesn't fit (the realism pre-check)",
    };
    return claimChainSteps(c, [stop], { chain: head.id, draft: false });
  }
  const map = chainMapOf(c.b, c.ref);
  const live = chainLiveOf(map);
  const lines = live.filter(isKeyOf("S")).sort(byTopicKey);
  const doms = live.filter(isKeyOf("U")).sort(byTopicKey);
  const cross = await chainCrossGoalOf(c);
  // Your Domains go to `place` unless another goal holds one or Gemini named it (§23.5): such a one is placed by code (layer 1).
  const packable = new Set(evidence.packableDomainsOf(doms.flatMap((t) => (t.domainId ? [{ id: t.domainId, nameOrigin: domainNameOriginByIdOf(c.tree, t.domainId) }] : [])), [...cross.held]));
  const place = c.sw.place
    ? [
        ...lines.map((t) => ({ key: t.key, text: t.name, id: t.lineageId })),
        ...doms.filter((t) => !t.domainId || packable.has(t.domainId)).map((t) => ({ key: t.key, text: t.name, id: t.domainId ?? t.lineageId })),
      ]
    : [];
  const room = c.sw.names ? topicsLib.mapRoomOf({ layers: rating.layers, breadth: rating.breadth, lines: lines.length, domains: doms.length }) : 0;
  if (place.length === 0 && room <= 0) return claimChainS3(c, head, null);
  const pack = evidence.topicPackOf({
    phase: "MAP",
    areaName: c.areaName,
    aim: c.intake.aim,
    splitClauses: c.splitClauses,
    outline: chainOutlineOf(c.intake),
    examLabel: chainExamLabelOf(c.intake),
    layers: rating.layers,
    breadth: rating.breadth,
    room,
    place,
  });
  if (!pack.schema) return claimChainS3(c, head, null);
  const spec = await chainJsonSpecOf(c, "MAP", pack, {}, { mapInput: { layers: rating.layers, breadth: rating.breadth, room } }, false);
  return claimChainSteps(c, [spec], { chain: head.id, draft: false });
}

/** Step 3: LINK and GROUND's first wave in one step (ruling 47), with the chain's GROUND plan recorded on both rows. */
async function claimChainS3(c: ChainCtx, head: TopicRun, mapRow: TopicRun | null): Promise<Result<TopicChainStep>> {
  const map = chainMapOf(c.b, c.ref);
  const kept = chainKeptOf(map, mapRow);
  const terms = c.sw.ground ? chainGroundTermsOf(kept) : [];
  const batched = terms.length > 0 ? groundingLib.groundBatchesOf(terms, t5.GROUND_CALLS_MAX) : { batches: [] as groundingLib.GroundTerm[][], notRun: [] as string[] };
  const plan: GroundPlan = { batches: batched.batches.map((batch) => batch.map((t) => t.key)), notRun: batched.notRun, link: false };
  const specs: StepSpec[] = [];
  const link = await chainLinkSpecOf(c, map, mapRow, plan);
  if (link) {
    plan.link = true;
    specs.push(link);
  }
  const wave1 = plan.batches.slice(0, t5.GROUND_PARALLEL);
  if (wave1.length > 0) {
    const g = await chainGroundSpecOf(c, 1, wave1, plan, map, false);
    if (g) specs.push(g);
  }
  if (specs.length === 0) return ok(chainStepOf(head, true));
  return claimChainSteps(c, specs, { chain: head.id, draft: false });
}

/** Missing or re-claimed units after step 3: LINK (again, after a cap) and GROUND waves (a FAILED wave's failed batches only). */
async function claimChainUnits(c: ChainCtx, head: TopicRun, next: Extract<ChainNext, { kind: "UNITS" }>, mapRow: TopicRun | null): Promise<Result<TopicChainStep>> {
  const map = chainMapOf(c.b, c.ref);
  const specs: StepSpec[] = [];
  if (next.link) {
    const link = await chainLinkSpecOf(c, map, mapRow, next.plan);
    if (link) specs.push(link);
  }
  for (const w of next.waves) {
    const g = await chainGroundSpecOf(c, w.wave, w.batches, next.plan, map, w.retry);
    if (g) specs.push(g);
  }
  if (specs.length === 0) return ok(chainStepOf(head, true));
  return claimChainSteps(c, specs, { chain: head.id, draft: false });
}

/** A Go deeper's GROUND wave over its children (DEEPER_GROUND_CALLS_MAX calls, one wave). */
async function claimDeeperGround(c: ChainCtx, head: TopicRun): Promise<Result<TopicChainStep>> {
  if (!c.sw.ground) return ok(chainStepOf(head, true));
  const map = chainMapOf(c.b, c.ref);
  const keys = new Set(chainReportOf(head)?.kept ?? []);
  const terms = chainGroundTermsOf(chainLiveOf(map).filter((t) => keys.has(t.key)));
  if (terms.length === 0) return ok(chainStepOf(head, true));
  const batched = groundingLib.groundBatchesOf(terms, t5.DEEPER_GROUND_CALLS_MAX);
  const plan: GroundPlan = { batches: batched.batches.map((batch) => batch.map((t) => t.key)), notRun: batched.notRun, link: false };
  const g = await chainGroundSpecOf(c, 1, plan.batches.slice(0, t5.GROUND_PARALLEL), plan, map, false);
  if (!g) return ok(chainStepOf(head, true));
  return claimChainSteps(c, [g], { chain: head.id, draft: false });
}

/** A topic's parents (roadmap-topics parentsOf); unreadable: the whole layer before. */
function chainParentsOf(map: t5.TopicMap, t: t5.TopicDraft): topicsLib.ParentSet {
  try {
    return topicsLib.parentsOf(map, t.key);
  } catch {
    return { kind: "LAYER", layer: t.layer - 1 };
  }
}

/** The whole-layer default's parents: that layer's chosen topics (at most LAYER_TOPICS_MAX). */
const chainLayerParentsOf = (live: readonly t5.TopicDraft[], layer: number): t5.TopicDraft[] => live.filter((x) => x.layer === layer && x.chosen).slice(0, t5.LAYER_TOPICS_MAX);

/** A Go deeper's "above": the topic's ancestors' names, shallowest first, through drawn or picked links (else the layer before's chosen topics); never another goal's Domain. */
function chainAncestorNamesOf(map: t5.TopicMap, parent: t5.TopicDraft): string[] {
  const live = chainLiveOf(map);
  const byKey = new Map(live.map((t) => [t.key, t]));
  const seen = new Set<string>([parent.key]);
  const out: t5.TopicDraft[] = [];
  let frontier: t5.TopicDraft[] = [parent];
  while (frontier.length > 0 && out.length < DEEPER_ANCESTORS_MAX) {
    const next: t5.TopicDraft[] = [];
    for (const t of frontier) {
      const ps = chainParentsOf(map, t);
      const parents = ps.kind === "LINKS" ? ps.keys.flatMap((k) => (byKey.has(k) ? [byKey.get(k) as t5.TopicDraft] : [])) : chainLayerParentsOf(live, ps.layer);
      for (const p of parents) {
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        out.push(p);
        next.push(p);
      }
    }
    frontier = next;
  }
  return out
    .sort((a, b) => a.layer - b.layer || byTopicKey(a, b))
    .slice(0, DEEPER_ANCESTORS_MAX)
    .map((t) => t.name);
}

// ── The cores ──

/**
 * A fresh DRAFT's TOPICS draft whose base map isn't written (chainHeadUnpointed writes it with writeTopicsCore): no
 * map rows, no chain and no estimate yet; or no row of your lines or intake Domains (S, U keys) while the intake holds
 * a line, or a Domain of its Field, to place. A base with nothing to place is written once (code's estimate), and never
 * again over an estimate already stored (your layers set on the chip stay).
 */
async function chainBaseMissingOf(e: Env, b: RoadmapBundle, ref: ChainDraftRef): Promise<boolean> {
  const rows = (b.topics ?? []).filter((t) => t.version === ref.version);
  if (rows.some((t) => /^[SU]\d+$/.test(t.key))) return false;
  if (rows.length === 0 && chainRunsOf(b, ref.version).head == null && ref.rating == null) return true;
  const intake = intakeOf(b.roadmap);
  if ((intake.syllabus?.lines ?? []).some((l) => typeof l === "string" && l.trim() !== "")) return true;
  if (intake.domainIds.length === 0) return false;
  const field = (await e.io.fieldTree()).find((f) => f.id === b.roadmap.fieldId) ?? null;
  return !!field && intake.domainIds.some((id) => field.domains.some((d) => d.id === id));
}

/** [Break it down] (and [Rate again] with `force`): the chain head, RATE, claimed under the draft cap (ruling 17). */
async function chainHeadUnpointed(userId: string, roadmapId: string, force: boolean, now: Date, deps: RoadmapDeps): Promise<Result<{ runId: string; status: RunStatus }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const sw = topicSwitchesOf(deps.topicSwitches);
  if (!sw.rate) return fail(TOPIC_PLANS_OFF);
  const e = envOf(deps);
  let b = await e.store.bundle(userId, roadmapId);
  if (!b) return fail(NO_ROADMAP);
  // [Break it down] is a Field path (ruling 15): a track plan's stage count stays code's.
  if (b.roadmap.fieldId == null) return fail(TOPICS_FIELD_ONLY);
  if (b.roadmap.status !== "DRAFT" && b.roadmap.status !== "ACTIVE") return fail(BREAK_DOWN_OPEN_ONLY);
  let ref = chainDraftOf(b);
  // A fresh DRAFT the form saved as TOPICS ([Break it down]) is a TOPICS draft before its first map: its base map (your
  // outline lines, your intake Domains, code's estimate; the clause seeds ride the view) is written first, so MAP places
  // your lines and Domains instead of running on an empty map. Never over a step still running.
  const baseMissing = ref != null && b.roadmap.status === "DRAFT" && !youngRunningOf(b.runs, now) && (await chainBaseMissingOf(e, b, ref));
  if (!ref || baseMissing) {
    // No TOPICS draft yet: lane 8's no-Gemini draft first (ruling 58: a fresh DRAFT; ruling 49: an ACTIVE plan's re-plan draft), then the chain on it.
    const made = b.roadmap.status === "DRAFT" ? await writeTopicsCore(userId, roadmapId, now, deps) : await breakIntoTopicsCore(userId, roadmapId, now, deps);
    if (!made.ok) return fail(made.error);
    b = await e.store.bundle(userId, roadmapId);
    ref = b ? chainDraftOf(b) : null;
    if (!b || !ref) return fail(RACED);
  }
  if (youngRunningOf(b.runs, now)) return fail(DRAFT_RUNNING);
  const c = await chainCtxOf(e, deps, userId, b, ref, sw, now);
  const outline = chainOutlineOf(c.intake);
  const examLabel = chainExamLabelOf(c.intake);
  const inputKey = ratingLib.ratingKeyOf({ aim: c.intake.aim, areaName: c.areaName, outline, examLabel, splitClauses: c.splitClauses });
  let res: Result<TopicChainStep>;
  if (!force && ref.rating && ref.rating.inputKey === inputKey && ref.rating.geminiDifficulty != null) {
    // The stored rating holds until the aim, Area, outline or exam changes, or you tap [Rate again] (§22.7): a REUSED head, no call, no draft counted.
    const reused: StepSpec = { phase: "RATE", pack: { packs: [], candidateCount: t5.TOPIC_CANDIDATE_COUNT }, report: { reusedRating: true }, requests: 0, grounded: false, inputHash: null, status: "REUSED" };
    res = await claimChainSteps(c, [reused], { chain: null, draft: false });
  } else {
    const pack = evidence.topicPackOf({ phase: "RATE", areaName: c.areaName, aim: c.intake.aim, splitClauses: c.splitClauses, outline, examLabel });
    const spec = await chainJsonSpecOf(c, "RATE", pack, {}, {}, force);
    // A 7-day reuse sends nothing and ends REUSED, so it counts no draft (ruling 17).
    res = await claimChainSteps(c, [spec], { chain: null, draft: !spec.report.reuseFrom });
  }
  return res.ok ? ok({ runId: res.value.runId ?? "", status: (res.value.status ?? "RUNNING") as RunStatus }) : fail(res.error);
}

/**
 * [Break it down] (§22.14): claims the chain head, RATE, and runs it in after(); each later step is
 * advanceTopicChainCore's (ruling 47). On a goal with no TOPICS draft it first writes one with no model (lane 8's
 * writeTopicsCore on a fresh DRAFT, breakIntoTopicsCore on an ACTIVE plan). A stored rating for the same inputs is
 * reused (REUSED, no call, no draft). Refuses while TOPIC_RATE_LIVE is off (TOPIC_PLANS_OFF), before it reads anything.
 */
export async function breakDownCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  return pointedRefusal(deps, userId, { roadmapId }, await chainHeadUnpointed(userId, roadmapId, false, now, deps));
}

/** [Rate again] (§22.14): breakDownCore with no reuse of the stored rating or an earlier RATE run; new seeds. */
export async function rateAgainCore(userId: string, roadmapId: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  return pointedRefusal(deps, userId, { roadmapId }, await chainHeadUnpointed(userId, roadmapId, true, now, deps));
}

async function goDeeperUnpointed(userId: string, roadmapId: string, key: string, now: Date, deps: RoadmapDeps): Promise<Result<{ runId: string; status: RunStatus }>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const sw = topicSwitchesOf(deps.topicSwitches);
  if (!sw.names) return fail(TOPIC_PLANS_OFF);
  const e = envOf(deps);
  const b = await e.store.bundle(userId, roadmapId);
  if (!b) return fail(NO_ROADMAP);
  const ref = chainDraftOf(b);
  if (!ref) return fail(NO_TOPIC_DRAFT);
  if (typeof key !== "string" || !topicsLib.TOPIC_KEY_PATTERN.test(key)) return fail(NO_TARGET);
  if (youngRunningOf(b.runs, now)) return fail(DRAFT_RUNNING);
  const c = await chainCtxOf(e, deps, userId, b, ref, sw, now);
  const map = chainMapOf(c.b, c.ref);
  const parent = chainLiveOf(map).find((t) => t.key === key);
  if (!parent) return fail(NO_TARGET);
  // Children sit one layer down: a topic in the deepest layer allowed has none to add (the view shows the date effect first).
  if (parent.layer >= t5.LAYERS_MAX) return fail(t5.LAYERS_BOUNDS);
  const pack = evidence.topicPackOf({
    phase: "DEEPER",
    areaName: c.areaName,
    aim: "",
    splitClauses: [],
    outline: [],
    examLabel: null,
    topic: { key, name: parent.name, ancestors: chainAncestorNamesOf(map, parent), id: parent.lineageId },
  });
  if (!pack.schema) return fail(NO_TARGET);
  const spec = await chainJsonSpecOf(c, "DEEPER", pack, { parent: key }, {}, false);
  // DEEPER is a chain head but never a draft (ruling 17): only the request caps.
  const res = await claimChainSteps(c, [spec], { chain: null, draft: false });
  return res.ok ? ok({ runId: res.value.runId ?? "", status: (res.value.status ?? "RUNNING") as RunStatus }) : fail(res.error);
}

/**
 * [Go deeper] on one topic (§22.14): claims DEEPER (its GROUND wave is the next step) and runs it in after(). Offered
 * and allowed only while topicSwitchesOf().names (names need GROUND); a topic in layer LAYERS_MAX refuses.
 */
export async function goDeeperCore(userId: string, roadmapId: string, key: string, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<{ runId: string; status: RunStatus }>> {
  return pointedRefusal(deps, userId, { roadmapId }, await goDeeperUnpointed(userId, roadmapId, key, now, deps));
}

async function advanceUnpointed(userId: string, roadmapId: string, retry: boolean, now: Date, deps: RoadmapDeps): Promise<Result<TopicChainStep>> {
  if (writesOff(deps)) return fail(ROADMAP_WRITES_OFF);
  const sw = topicSwitchesOf(deps.topicSwitches);
  if (!sw.rate) return fail(TOPIC_PLANS_OFF);
  const e = envOf(deps);
  const b = await e.store.bundle(userId, roadmapId);
  if (!b) return fail(NO_ROADMAP);
  const ref = chainDraftOf(b);
  if (!ref) return ok(CHAIN_NOTHING_LEFT);
  const runs = await chainFullRunsOf(e, b, ref.version);
  if (!runs) return ok(CHAIN_NOTHING_LEFT);
  const res = await chainClaimNextOf(e, deps, userId, b, ref, sw, now, runs, retry, false);
  // Nothing left to claim: a step past TOPIC_RUN_STALE_MS that no claim marked reads FAILED "timed out" now, so the
  // page leaves its wait card and shows why (a claim marks such a row itself).
  if (res.ok && res.value.done) await settleStaleChainStepsOf(e, userId, b, now);
  return res;
}

/** A map you wrote after a chain's head ([Write the topics] after a breakdown: an OK INHOUSE or MANUAL run of the version, newer) ends that chain. */
function chainSupersededOf(b: RoadmapBundle, version: number, head: RunRec): boolean {
  // By time, never by order: [Break it down] writes the base map (an INHOUSE run) in the same instant it claims the head.
  const at = chainWrittenAtOf(b, version);
  return at != null && at > head.startedAt.getTime();
}

/** When you last wrote the draft version's map yourself (its newest OK INHOUSE or MANUAL run), or null. */
function chainWrittenAtOf(b: RoadmapBundle, version: number): number | null {
  let at: number | null = null;
  for (const r of b.runs) {
    if (r.version === version && chainPhaseOf(r) == null && (r.kind === "INHOUSE" || r.kind === "MANUAL") && r.status === "OK") at = Math.max(at ?? 0, r.startedAt.getTime());
  }
  return at;
}

/** The draft version's newest chain read in full (the reports chainNextOf reads), newest step first; null with none, or one your own write superseded. */
async function chainFullRunsOf(e: Env, b: RoadmapBundle, version: number): Promise<{ head: TopicRun; steps: TopicRun[] } | null> {
  const { head, steps } = chainRunsOf(b, version);
  if (!head || chainSupersededOf(b, version, head)) return null;
  const fullHead = ((await e.store.run(head.id)) ?? head) as TopicRun;
  const fullSteps = (await Promise.all(steps.map((r) => e.store.run(r.id)))).map((r, i) => (r ?? steps[i]) as TopicRun);
  return { head: fullHead, steps: fullSteps };
}

/**
 * The chain's next claim (ruling 47): the RUNNING step younger than TOPIC_RUN_STALE_MS, else the next step claimed, else
 * `done`. `dry` (the view) takes every decision a claim takes and writes nothing, so `done` is exactly the poll's.
 */
async function chainClaimNextOf(
  e: Env,
  deps: RoadmapDeps,
  userId: string,
  b: RoadmapBundle,
  ref: ChainDraftRef,
  sw: t5.TopicSwitches,
  now: Date,
  runs: { head: TopicRun; steps: TopicRun[] },
  retry: boolean,
  dry: boolean
): Promise<Result<TopicChainStep>> {
  const young = youngRunningOf(b.runs, now);
  if (young) return ok(chainStepOf(young, false));
  const next = chainNextOf(runs.head, runs.steps, retry);
  if (next.kind === "DONE") return ok(chainStepOf(runs.steps[0] ?? runs.head, true));
  const c: ChainCtx = { ...(await chainCtxOf(e, deps, userId, b, ref, sw, now)), dry };
  const mapRow = runs.steps.find((r) => chainPhaseOf(r) === "MAP") ?? null;
  switch (next.kind) {
    case "MAP":
      return claimChainMap(c, runs.head);
    case "S3":
      return claimChainS3(c, runs.head, mapRow);
    case "UNITS":
      return claimChainUnits(c, runs.head, next, mapRow);
    case "DEEPER_GROUND":
      return claimDeeperGround(c, runs.head);
  }
}

/** Every topic step of the roadmap still RUNNING past TOPIC_RUN_STALE_MS reads FAILED "timed out" (it can no longer be running: ruling 47). */
async function settleStaleChainStepsOf(e: Env, userId: string, b: RoadmapBundle, now: Date): Promise<void> {
  const stale = b.runs.filter((r) => r.status === "RUNNING" && chainPhaseOf(r) != null && now.getTime() - r.startedAt.getTime() >= t5.TOPIC_RUN_STALE_MS);
  if (stale.length === 0) return;
  for (const r of stale) await failRun(e, userId, r.id, "timed out", now);
  invalidate("roadmap");
}

/**
 * One step per invocation (ruling 47): returns a RUNNING step younger than TOPIC_RUN_STALE_MS and claims nothing;
 * else claims the next step after the settled ones (MAP; LINK with GROUND's first wave; each further wave; a Go
 * deeper's wave) and runs it in its own after(). `retry` claims a CAPPED step, MAP's pre-check stop or a FAILED GROUND
 * wave again (GROUND's [Try again], the resume after the Over pre-check); the poll never passes it. `done` when
 * nothing is left to claim. Refuses while TOPIC_RATE_LIVE is off.
 */
export async function advanceTopicChainCore(userId: string, roadmapId: string, retry: boolean, now: Date, deps: RoadmapDeps = {}): Promise<RoadmapActionResult<TopicChainStep>> {
  return pointedRefusal(deps, userId, { roadmapId }, await advanceUnpointed(userId, roadmapId, retry === true, now, deps));
}

// ── The chain's view (fix round; ruling 47): what the page's poll and its stop line read ──

/** The newest row of each GROUND wave, newest first. */
function chainWaveRowsOf(steps: readonly TopicRun[]): TopicRun[] {
  const seen = new Set<number>();
  const out: TopicRun[] = [];
  for (const r of steps) {
    if (chainPhaseOf(r) !== "GROUND") continue;
    const w = chainReportOf(r)?.wave ?? 0;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(r);
  }
  return out;
}

/** A CAPPED step's cap, by the reason claimChainSteps wrote (the draft cap is the draft banner's, so none here). */
const chainCapStopOf = (r: RunRec): t5.TopicChainStop | null =>
  r.status !== "CAPPED" ? null : r.error === "grounded request cap" ? "GROUNDED_CAPPED" : r.error === "request cap" ? "REQUESTS_CAPPED" : null;

/**
 * Why a done chain stopped short (pure over its rows read in full): a capped step, MAP's pre-check (with its ChainFit),
 * MAP's replies failing, a failed or timed-out GROUND wave (with the names it left unchecked), a RATE that timed out
 * before any rating, or a Go deeper that named nothing narrower. No stop: the chain ran to its end.
 */
function chainStopOf(head: TopicRun, steps: readonly TopicRun[], map: t5.TopicMap, hasRating: boolean): { stop: t5.TopicChainStop | null; unchecked: number; fit: t5.ChainFit | null } {
  const none = { stop: null, unchecked: 0, fit: null };
  if (settledOf(head) === "CAPPED") return { ...none, stop: chainCapStopOf(head) };
  const ground = steps.filter((r) => chainPhaseOf(r) === "GROUND");
  if (chainPhaseOf(head) === "DEEPER") {
    if (chainReportOf(head)?.nothing) return { ...none, stop: "NOTHING_DEEPER" };
  } else {
    if (settledOf(head) === "FAILED" && !hasRating) return { ...none, stop: "TIMED_OUT" };
    const links = steps.filter((r) => chainPhaseOf(r) === "LINK");
    if (!chainPlanOf([...links, ...ground])) {
      const m = steps.find((r) => chainPhaseOf(r) === "MAP");
      if (!m) return none;
      const rep = chainReportOf(m);
      if (rep?.over) return { ...none, stop: rep.verdict === "IMPOSSIBLE" ? "IMPOSSIBLE" : "OVER", fit: rep.fit ?? null };
      if (settledOf(m) === "CAPPED") return { ...none, stop: chainCapStopOf(m) ?? "REQUESTS_CAPPED" };
      return settledOf(m) === "FAILED" ? { ...none, stop: "MAP_FAILED" } : none;
    }
    if (links[0] && settledOf(links[0]) === "CAPPED") return { ...none, stop: chainCapStopOf(links[0]) ?? "REQUESTS_CAPPED" };
  }
  const waves = chainWaveRowsOf(ground);
  const capped = waves.find((r) => settledOf(r) === "CAPPED");
  if (capped) return { ...none, stop: chainCapStopOf(capped) ?? "GROUNDED_CAPPED" };
  // A failed wave's names stay NOT_RUN, hidden behind "n not checked" (F-R5-12: GROUND fails → [Try again]).
  const failedKeys = new Set(
    waves
      .filter((r) => settledOf(r) === "FAILED")
      .flatMap((r) => {
        const rep = chainReportOf(r);
        return (r.status === "FAILED" && rep?.failed?.length ? rep.failed : (rep?.batches ?? [])).flat();
      })
  );
  const unchecked = failedKeys.size > 0 ? chainLiveOf(map).filter((t) => failedKeys.has(t.key) && t.nameOrigin === "GEMINI" && t.grounding === "NOT_RUN").length : 0;
  return unchecked > 0 ? { ...none, stop: "GROUND_FAILED", unchecked } : none;
}

/** What Gemini did on the draft version since you last wrote its map (the header's lead): a RATE, a MAP or DEEPER that wrote. */
function chainGeminiOf(b: RoadmapBundle, version: number): { rated: boolean; mapped: boolean } {
  let rated = false;
  let mapped = false;
  const writtenAt = chainWrittenAtOf(b, version) ?? 0;
  for (const r of b.runs) {
    if (r.version !== version || r.startedAt.getTime() < writtenAt) continue;
    const p = chainPhaseOf(r);
    if (p == null) continue;
    if (r.status !== "OK" && r.status !== "PARTIAL" && r.status !== "REUSED") continue;
    if (p === "RATE") rated = true;
    if (p === "MAP" || p === "DEEPER") mapped = true;
  }
  return { rated, mapped };
}

/**
 * RoadmapView.topicChain (fix round; ruling 47): a TOPICS draft's newest chain as the page drives it. `done` is exactly
 * the poll's (a dry claim decides it, writing nothing); a step past its stale mark keeps the poll going once more, so
 * its advance marks it "timed out". null: no chain on this draft (or your own write superseded it), the chain's switch
 * is off, or it couldn't be read (logged: the page then shows the draft as it stands).
 */
async function topicChainViewFor(e: Env, deps: RoadmapDeps, userId: string, b: RoadmapBundle, now: Date): Promise<t5.TopicChainView | null> {
  try {
    const sw = topicSwitchesOf(deps.topicSwitches);
    if (!sw.rate) return null;
    const ref = chainDraftOf(b);
    if (!ref) return null;
    const runs = await chainFullRunsOf(e, b, ref.version);
    if (!runs) return null;
    const rows = [...runs.steps, runs.head];
    const newest = rows[0];
    const young = youngRunningOf(b.runs, now);
    const staleRow = rows.find((r) => r.status === "RUNNING" && now.getTime() - r.startedAt.getTime() >= t5.TOPIC_RUN_STALE_MS) ?? null;
    const stale = staleRow != null;
    const off = writesOff(deps);
    // The dry claim; one that can't be read leaves the chain to the poll, whose advance then says why.
    const next =
      !young && !off
        ? await chainClaimNextOf(e, deps, userId, b, ref, sw, now, runs, false, true).catch((err: unknown): Result<TopicChainStep> => {
            console.error("roadmap: the chain's next step wasn't read:", err instanceof Error ? err.message.slice(0, 200) : "failed");
            return fail(RACED);
          })
        : null;
    const done = off || (!young && !stale && (next == null || (next.ok && next.value.done)));
    const fact = done && !off ? chainStopOf(runs.head, runs.steps, chainMapOf(b, ref), ref.rating != null) : { stop: null, unchecked: 0, fit: null };
    const headCapped = chainPhaseOf(runs.head) === "RATE" && settledOf(runs.head) === "CAPPED";
    const retry: t5.TopicChainView["retry"] =
      fact.stop === "TIMED_OUT" || (headCapped && fact.stop != null)
        ? "BREAK_DOWN"
        : fact.stop != null && fact.stop !== "NOTHING_DEEPER" && chainNextOf(runs.head, runs.steps, true).kind !== "DONE"
          ? "ADVANCE"
          : null;
    const line =
      fact.stop === "REQUESTS_CAPPED"
        ? REQUESTS_CAPPED
        : fact.stop === "GROUNDED_CAPPED"
          ? GROUNDED_CAPPED
          : fact.stop === "NOTHING_DEEPER"
            ? NOTHING_DEEPER
            : (fact.stop === "OVER" || fact.stop === "IMPOSSIBLE") && fact.fit
              ? fact.fit.basis
              : null;
    const phase = young ? chainPhaseOf(young) : staleRow ? chainPhaseOf(staleRow) : !done && next?.ok && next.value.phase ? next.value.phase : chainPhaseOf(newest);
    return {
      phase,
      running: young != null,
      stale,
      startedAt: (young ?? newest).startedAt.toISOString(),
      headStartedAt: runs.head.startedAt.toISOString(),
      done,
      key: `${runs.head.id}:${rows.length}:${rows.map((r) => r.status.slice(0, 2)).join("")}:${young?.id ?? "-"}`,
      stop: fact.stop,
      retry,
      unchecked: fact.unchecked,
      fit: fact.fit,
      line,
      gemini: chainGeminiOf(b, ref.version),
    };
  } catch (err) {
    console.error("roadmap: the topic chain's view wasn't read:", err instanceof Error ? err.message.slice(0, 200) : "failed");
    return null;
  }
}

/**
 * The view with its chain (fix round): a fresh DRAFT's breakdown stays on the wait card between its steps while the
 * poll claims the next one (ui-motion §15.9: DraftRunning for a breakdown), so the page never flips back and forth.
 */
function withTopicChainView(view: RoadmapView, chain: t5.TopicChainView | null): RoadmapView {
  if (!chain) return view;
  const waiting = view.state === "DRAFT" && !chain.done && view.run != null;
  return { ...view, topicChain: chain, ...(waiting ? { state: "RUNNING" as const } : {}) };
}

// ── Running one step (after()) ──

async function runTopicStepsNow(ids: readonly string[], deps: RoadmapDeps): Promise<void> {
  await Promise.all(ids.map((id) => runTopicStepCore(id, deps)));
}

/** Whether a phase may run under the switches (read again when the step runs: a switch turned off since never calls the model). */
function chainPhaseAllowed(phase: t5.RunPhase, sw: t5.TopicSwitches): boolean {
  switch (phase) {
    case "RATE":
      return sw.rate;
    case "MAP":
      return sw.place || sw.names;
    case "LINK":
      return sw.link;
    case "GROUND":
      return sw.ground;
    case "DEEPER":
      return sw.names;
  }
}

/**
 * The background half of one topic step (also called directly by the checks): reads the RUNNING row, calls the model
 * through roadmap-model (or reads the reused run), runs the lane-6 verdicts, and writes the row's facts with the
 * step's change to the draft (persistChainStep). Never throws; writes nothing with writes off.
 */
export async function runTopicStepCore(runId: string, deps: RoadmapDeps = {}): Promise<void> {
  if (writesOff(deps)) return;
  const e = envOf(deps);
  const now = (deps.clock ?? (() => new Date()))();
  let userId: string | null = null;
  try {
    const run = (await e.store.run(runId)) as TopicRun | null;
    if (!run || run.status !== "RUNNING") return;
    userId = run.userId;
    const phase = chainPhaseOf(run);
    const report = chainReportOf(run);
    const sp = chainStepPackOf(run.pack);
    if (!phase || !report || !sp) {
      await failRun(e, run.userId, runId, "not a topic step", now);
      return;
    }
    const sw = topicSwitchesOf(deps.topicSwitches);
    if (!chainPhaseAllowed(phase, sw)) {
      await failRun(e, run.userId, runId, "switched off before it ran", now);
      return;
    }
    const b = await e.store.bundle(run.userId, run.roadmapId);
    const ref = b ? chainDraftOf(b) : null;
    if (!b || !ref || ref.version !== run.version) {
      await failRun(e, run.userId, runId, "the roadmap changed while drafting", now);
      return;
    }
    const s: StepRun = { c: await chainCtxOf(e, deps, run.userId, b, ref, sw, now), run, report, sp };
    switch (phase) {
      case "RATE":
        await runRateStep(s);
        break;
      case "MAP":
        await runMapStep(s);
        break;
      case "LINK":
        await runLinkStep(s);
        break;
      case "GROUND":
        await runGroundStep(s);
        break;
      case "DEEPER":
        await runDeeperStep(s);
        break;
    }
  } catch (err) {
    console.error("runTopicStepCore failed:", err instanceof Error ? err.message.slice(0, 300) : "failed");
    if (userId) await failRun(e, userId, runId, err instanceof Error ? err.message.slice(0, 300) : "failed", now).catch(() => undefined);
  } finally {
    invalidate("roadmap");
  }
}

/** The words a step was drafted from: a save of any of them meanwhile supersedes the step (it is never re-applied to new words). */
const chainWordsOf = (r: RoadmapRec): string =>
  JSON.stringify([r.status, r.version, r.aim, r.fieldId, [...r.domainIds].sort(), r.syllabus ?? null, r.examLabel, r.constraints, r.splitClauses ?? null]);

/**
 * The step's write (ruling 47): the run row's facts (guarded on it still RUNNING) and, with a change, the draft as the
 * change leaves it, through lane 8's rebuildTopicsDraftOps (the map's rows, the milestones rebuilt from it and the
 * rating where the draft's kind lives, guarded on the row as read). A lost race (LINK and GROUND's first wave write
 * in parallel; any map edit) re-reads and re-applies the change to the map as it now stands, up to ATTEMPTS times; a
 * save of your words meanwhile supersedes the step. When the milestones can't be rebuilt, the map's rows and the
 * rating are still written (logged) and lane 8's next edit rebuilds them.
 */
async function persistChainStep(s: StepRun, data: Record<string, unknown>, change: ChainChange | null): Promise<void> {
  const { e, now } = s.c;
  const words = chainWordsOf(s.c.b.roadmap);
  let b: RoadmapBundle | null = s.c.b;
  for (let attempt = 1; attempt <= ATTEMPTS && b; attempt++) {
    const ref = chainDraftOf(b);
    if (!ref || ref.version !== s.run.version || chainWordsOf(b.roadmap) !== words) break;
    const ops: StoreOp[] = [{ op: "guard", guard: { g: "RUN_IS", id: s.run.id, status: "RUNNING" } }];
    let report = data.report;
    if (change) {
      const next = change(chainMapOf(b, ref), ref.rating);
      if (next.report) report = { ...((data.report as object) ?? {}), ...next.report };
      const rebuilt = await rebuildTopicsDraftOps(e, s.run.userId, b, next.map, next.rating, chainDepthOf(ref), now);
      if (rebuilt.ok) ops.push(...rebuilt.value);
      else {
        console.error("roadmap: a topic step's milestones weren't rebuilt (the map is written as it stands):", rebuilt.error);
        ops.push(
          { op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: [b.roadmap.status as RoadmapStatus], version: b.roadmap.version, updatedAt: b.roadmap.updatedAt } },
          ...mapRowOps(b.roadmap.id, ref.version, next.map, now, e.makeId),
          ...(next.rating ? chainRatingWriteOps(b.roadmap, ref, next.rating, now) : [])
        );
      }
    } else {
      ops.push({ op: "guard", guard: { g: "ROADMAP_IS", id: b.roadmap.id, statuses: [b.roadmap.status as RoadmapStatus], version: b.roadmap.version } });
    }
    ops.splice(1, 0, { op: "update", table: "roadmapRun", where: { id: s.run.id, status: "RUNNING" }, data: { ...data, report, finishedAt: now } });
    const out = await e.store.apply(s.run.userId, ops);
    if (out === "ok") return;
    b = await e.store.bundle(s.run.userId, s.run.roadmapId);
  }
  await failRun(e, s.run.userId, s.run.id, "superseded before it finished", now);
}

/** A step that sent nothing fails with its reason (no request counted). */
const failChainStep = (s: StepRun, error: string): Promise<void> => persistChainStep(s, { status: "FAILED", error: error.slice(0, 500), requests: 0 }, null);

/** A reused run's stored replies as samples (the accepted ones; reusableSamplesOf). */
function storedResultsOf(stored: unknown): SampleResult[] {
  return model.reusableSamplesOf(stored).map((x): SampleResult => {
    const parsed = parseRaw(x.raw);
    if (parsed === null && x.raw.trim() !== "null") return { ok: false, error: "non-JSON (stored)" };
    return { ok: true, value: { raw: x.raw, parsed, finishReason: x.finishReason, modelVersion: x.modelVersion, responseId: x.responseId, usage: null, latencyMs: x.latencyMs ?? 0 } };
  });
}

/** One JSON phase's replies: the reused run's (null when it is gone: nothing is called, since the claim counted no request), else the model's. */
async function chainSamplesOf(s: StepRun, pack: evidence.TopicPack): Promise<{ results: SampleResult[]; reused: boolean } | null> {
  if (s.report.reuseFrom) {
    const source = await s.c.e.store.run(s.report.reuseFrom);
    if (!source || source.status !== "OK" || chainPhaseOf(source) !== chainPhaseOf(s.run)) return null;
    return { results: storedResultsOf(source.samples), reused: true };
  }
  const results = await model.topicSamples(pack, { callModel: s.c.deps.callModel, seedBase: s.run.seedBase ?? SEED_BASE, candidateCount: s.sp.candidateCount });
  return { results, reused: false };
}

/** Each reply walked against the exact schema sent (integrityOf; FREE_TEXT_ROOTS), one log line each with no model words. */
function chainReadOf(s: StepRun, results: readonly SampleResult[], schema: unknown): { samples: ({ parsed: unknown; integrity: t5.IntegrityVerdict } | null)[]; verdicts: (t5.IntegrityVerdict | null)[]; valid: number } {
  const samples = results.map((r) => {
    if (!r.ok) return null;
    const integrity = integrityFor(s.c.e, r.value.parsed, schema);
    logReply(s.run.id, integrity);
    return { parsed: r.value.parsed, integrity: integrity.verdict };
  });
  const verdicts = samples.map((x) => x?.integrity ?? null);
  return { samples, verdicts, valid: verdicts.filter((v) => v === "CLEAN" || v === "SALVAGED").length };
}

/** The row's facts for a JSON phase: every sample's (runFactsOf), the requests sent, its status and error. */
function chainFactsOf(s: StepRun, got: { results: SampleResult[]; reused: boolean }, valid: number): Record<string, unknown> {
  const errors = got.results.flatMap((r) => (r.ok ? [] : [r.error]));
  const status: RunStatus = got.reused ? "REUSED" : valid === 0 ? "FAILED" : valid < got.results.length ? "PARTIAL" : "OK";
  return {
    ...model.runFactsOf(got.results),
    status,
    error: status === "FAILED" ? (errors.join("; ") || "no valid reply").slice(0, 500) : null,
    requests: got.reused ? 0 : model.requestsSentOf(got.results, s.sp.candidateCount),
  };
}

/** Your own layer count holds over a new estimate (§22.7's override): the new rating keeps your layers and your history. */
function keepYourLayersOf(next: t5.RatingRecord, old: t5.RatingRecord | null, day: DayKey): t5.RatingRecord {
  if (!old || old.origin !== "YOURS") return next;
  const o = ratingLib.ratingOverrideOf(next, old.layers, day);
  return o.ok ? { ...o.value, changes: [...old.changes] } : next;
}

/** RATE (§22.7): the replies' consensus (ratingOf), else code's estimate (codeRatingOf); written as the draft's rating either way. */
async function runRateStep(s: StepRun): Promise<void> {
  const pack = s.sp.packs[0];
  if (!pack) return failChainStep(s, "no pack");
  const got = await chainSamplesOf(s, pack);
  if (!got) return failChainStep(s, "the reused run is gone");
  const read = chainReadOf(s, got.results, pack.schema);
  const outline = chainOutlineOf(s.c.intake);
  const examLabel = chainExamLabelOf(s.c.intake);
  const base = {
    trackArea: s.c.intake.fieldId == null,
    outlineLines: outline.length,
    texts: { aim: s.c.intake.aim, areaName: s.c.areaName, constraints: s.c.intake.constraints },
    inputKey: ratingLib.ratingKeyOf({ aim: s.c.intake.aim, areaName: s.c.areaName, outline, examLabel, splitClauses: s.c.splitClauses }),
    day: s.c.today,
  };
  let rating: t5.RatingRecord;
  try {
    rating = ratingLib.ratingOf({ ...base, samples: read.samples, runId: s.run.id });
  } catch (err) {
    console.error("roadmap: the rating wasn't read (code's estimate):", err instanceof Error ? err.message.slice(0, 200) : "failed");
    rating = ratingLib.codeRatingOf(base);
  }
  await persistChainStep(s, { ...chainFactsOf(s, got, read.valid), report: { ...s.report, verdicts: read.verdicts } }, (map, old) => ({ map, rating: keepYourLayersOf(rating, old, s.c.today) }));
}

/** A name's form key (lane 8's topicFormKey: roadmap-topics formKeyOf, or a plain fold when that can't answer). */
const chainFormOf = (name: string): string => topicFormKey(name);

/**
 * New topics from an agreement (MAP's names and spans, DEEPER's children): keyed after the map's own T keys, in the
 * agreement's order; a form one of the map's topics already holds is an echo (dropped, counted). `hidden` are the
 * agreement's hidden ones (behind the count; never sent to LINK or GROUND).
 */
function chainAddedOf(existing: readonly t5.TopicDraft[], list: readonly t5.TopicDraft[], hiddenSet: ReadonlySet<t5.TopicDraft>, note: t5.TopicNote | null): { topics: t5.TopicDraft[]; kept: string[]; hidden: string[]; echoes: number } {
  const forms = new Set(existing.map((t) => chainFormOf(t.name)).filter((f) => f !== ""));
  let next = existing.reduce((m, t) => (isKeyOf("T")(t) ? Math.max(m, keyNumberOf(t.key)) : m), 0) + 1;
  const topics: t5.TopicDraft[] = [];
  const kept: string[] = [];
  const hidden: string[] = [];
  let echoes = 0;
  for (const a of list) {
    if (isKeyOf("S")(a) || isKeyOf("U")(a)) continue;
    const form = chainFormOf(a.name);
    if (form === "" || forms.has(form)) {
      echoes += 1;
      continue;
    }
    if (next > 999) break; // TOPIC_KEY_PATTERN holds three digits
    forms.add(form);
    const key = `T${next++}`;
    (hiddenSet.has(a) ? hidden : kept).push(key);
    const notes = note && !a.notes.includes(note) ? [...a.notes, note] : [...a.notes];
    topics.push({ ...a, id: null, key, notes, rawName: typeof a.rawName === "string" ? Array.from(a.rawName).slice(0, t5.RAW_LABEL_MAX).join("") : null });
  }
  return { topics, kept, hidden, echoes };
}

/**
 * MAP's result on the draft (§22.8 steps 6–10), pure: the topics an earlier breakdown wrote that you never kept or bound
 * go (with their links); your lines' and Domains' layers are the agreement's (one you moved keeps your layer); Gemini's
 * names and your aim's spans are new topics.
 */
function chainMapMergedOf(map: t5.TopicMap, agreement: topicsLib.MapAgreement): { map: t5.TopicMap; kept: string[]; hidden: string[]; echoes: number } {
  const stale = new Set(map.topics.filter((t) => (t.nameOrigin === "GEMINI" || t.nameOrigin === "AIM") && t.decision === "PENDING" && !t.bound));
  const staleIds = new Set([...stale].map((t) => t.lineageId));
  const all = [...agreement.topics, ...agreement.hidden];
  const placed = new Map(all.filter((a) => isKeyOf("S")(a) || isKeyOf("U")(a)).map((a) => [a.key, a]));
  const topics = map.topics
    .filter((t) => !stale.has(t))
    .map((t) => {
      const a = placed.get(t.key);
      if (!a || t.placedBy === "YOU") return t;
      const notes: t5.TopicNote[] = a.placedBy === "GEMINI" && !t.notes.includes("PLACED_BY_GEMINI") ? [...t.notes, "PLACED_BY_GEMINI"] : t.notes;
      return { ...t, layer: a.layer, placedBy: a.placedBy, formVotes: a.formVotes, samples: a.samples, layerVotes: [...a.layerVotes], notes };
    });
  const edges = map.edges.filter((x) => !staleIds.has(x.parentLineageId) && !staleIds.has(x.childLineageId));
  const added = chainAddedOf(topics, all, new Set(agreement.hidden), null);
  return { map: { ...map, topics: [...topics, ...added.topics], edges }, kept: added.kept, hidden: added.hidden, echoes: added.echoes };
}

/** MAP (§22.8): the agreement over the replies, placed on the draft; the rating takes the map's fill. No valid reply: no Gemini names. */
async function runMapStep(s: StepRun): Promise<void> {
  const pack = s.sp.packs[0];
  const mi = s.sp.mapInput;
  if (!pack || !mi) return failChainStep(s, "no pack");
  const got = await chainSamplesOf(s, pack);
  if (!got) return failChainStep(s, "the reused run is gone");
  const read = chainReadOf(s, got.results, pack.schema);
  const facts = chainFactsOf(s, got, read.valid);
  if (read.valid === 0) {
    await persistChainStep(s, { ...facts, report: { ...s.report, verdicts: read.verdicts } }, null);
    return;
  }
  const map = chainMapOf(s.c.b, s.c.ref);
  const live = chainLiveOf(map);
  const cross = await chainCrossGoalOf(s.c);
  const intake = s.c.intake;
  const agreement = topicsLib.mapAgreementOf({
    samples: read.samples,
    layers: mi.layers,
    breadth: mi.breadth,
    room: mi.room,
    aim: intake.aim,
    lines: live.filter(isKeyOf("S")).sort(byTopicKey).map((t) => ({ key: t.key, text: t.name, index: keyNumberOf(t.key) - 1 })),
    domains: live.filter(isKeyOf("U")).sort(byTopicKey).map((t) => ({ key: t.key, id: t.domainId ?? t.lineageId, name: t.name })),
    freeDomains: chainFreeDomainsOf(s.c, map, cross.held),
    takenNames: cross.takenNames,
    label: labelContextOf(s.c.b, s.c.tree, "TOPIC"),
    countryNamed: chainCountryNamedOf([intake.aim, intake.constraints, intake.examLabel, ...chainOutlineOf(intake)]),
    makeId: s.c.e.makeId,
  });
  await persistChainStep(s, { ...facts, report: { ...s.report, verdicts: read.verdicts, kFinal: agreement.kFinal } }, (cur, rating) => {
    const merged = chainMapMergedOf(cur, agreement);
    const topics: t5.TopicRunReport = { ...agreement.report, dropped: { ...agreement.report.dropped, ECHO: (agreement.report.dropped.ECHO ?? 0) + merged.echoes } };
    return { map: merged.map, rating: rating ? ratingLib.withMapFillOf(rating, agreement.kFinal) : null, report: { kept: merged.kept, hidden: merged.hidden, topics } };
  });
}

/** C7 and C8's order (linkDrawOf): an S key's line index, and a U key's first line tied to its Domain. */
function chainOutlineOrderOf(c: ChainCtx, kept: readonly t5.TopicDraft[]): Record<string, number> {
  const lineDomains = c.intake.syllabus?.lineDomains ?? [];
  const out: Record<string, number> = {};
  for (const t of kept) {
    if (isKeyOf("S")(t)) out[t.key] = keyNumberOf(t.key) - 1;
    else if (isKeyOf("U")(t) && t.domainId) {
      const i = lineDomains.findIndex((d) => d === t.domainId);
      if (i >= 0) out[t.key] = i;
    }
  }
  return out;
}

/** LINK (§22.8): drawn only with 3 of 3 from a layer of at least 4; the GEMINI links you never kept are replaced. No valid reply: "after layer N". */
async function runLinkStep(s: StepRun): Promise<void> {
  const pack = s.sp.packs[0];
  if (!pack) return failChainStep(s, "no pack");
  const got = await chainSamplesOf(s, pack);
  if (!got) return failChainStep(s, "the reused run is gone");
  const read = chainReadOf(s, got.results, pack.schema);
  const facts = chainFactsOf(s, got, read.valid);
  if (read.valid === 0) {
    await persistChainStep(s, { ...facts, report: { ...s.report, verdicts: read.verdicts } }, null);
    return;
  }
  // The topics LINK was given (its pack's keys), as the map holds them when the step is written.
  const given = new Set(Object.keys(pack.keymap));
  await persistChainStep(s, { ...facts, report: { ...s.report, verdicts: read.verdicts } }, (map, rating) => {
    const kept = chainLiveOf(map).filter((t) => given.has(t.key));
    const own = map.edges.filter((x) => x.origin !== "GEMINI" || x.decision === "KEPT" || x.decision === "EDITED");
    const draw = topicsLib.linkDrawOf({ map: { layers: pack.layers ?? map.layers, topics: kept, edges: own }, samples: read.samples, outlineOrder: chainOutlineOrderOf(s.c, kept) });
    const pairs = new Set(own.map((x) => `${x.parentLineageId}>${x.childLineageId}`));
    const drawn = draw.edges.filter((x) => x.origin === "GEMINI" && !pairs.has(`${x.parentLineageId}>${x.childLineageId}`)).map((x) => ({ ...x, id: null }));
    return { map: { ...map, edges: [...own, ...drawn] }, rating, report: { voids: draw.voids, findings: draw.findings.length } };
  });
}

/** A GROUND wave's sample facts (RoadmapRun.samples and its columns): the raw parts, capped, never shown or logged. */
function groundFactsOf(results: readonly model.GroundSampleResult[]): Record<string, unknown> {
  const meta = (r: model.GroundSampleResult, k: "modelVersion" | "responseId"): string | null => {
    const v = r.response && typeof r.response === "object" ? (r.response as Record<string, unknown>)[k] : null;
    return typeof v === "string" ? v : null;
  };
  const samples = results.map((r) => ({
    ok: r.ok,
    raw: r.raw ?? "",
    finishReason: r.parts?.finishReason ?? null,
    modelVersion: meta(r, "modelVersion"),
    responseId: meta(r, "responseId"),
    latencyMs: r.latencyMs,
    ...(r.ok ? {} : { error: String(r.error ?? "failed").slice(0, model.SAMPLE_ERROR_MAX) }),
  }));
  const latencies = results.map((r) => r.latencyMs).filter((n) => Number.isFinite(n));
  return {
    samples,
    usage: results.map((r) => (r.response && typeof r.response === "object" ? ((r.response as Record<string, unknown>).usageMetadata ?? null) : null)),
    modelVersion: samples.find((x) => x.modelVersion)?.modelVersion ?? null,
    responseIds: samples.flatMap((x) => (x.responseId ? [x.responseId] : [])),
    finishReasons: samples.flatMap((x) => (x.finishReason ? [x.finishReason] : [])),
    latencyMs: latencies.length > 0 ? Math.max(...latencies) : null,
  };
}

/**
 * GROUND's verdicts on the map (§22.9, §22.11, ruling 43), pure: each checked Gemini name takes its verdict and sources;
 * a LINKED name in layer 1 is chosen by default, and a WEAK or NONE one is hidden and so out of the plan — only on a
 * name you haven't decided (PENDING, unbound). A NOT_RUN key is left as it is.
 */
function chainGroundedOf(map: t5.TopicMap, record: t5.GroundRunRecord): t5.TopicMap {
  const topics = map.topics.map((t) => {
    const v = record.verdicts[t.key];
    if (!v || v.reason === "NOT_RUN" || t.nameOrigin !== "GEMINI" || !topicLive(t)) return t;
    const undecided = t.decision === "PENDING" && !t.bound;
    const chosen = !undecided ? t.chosen : v.verdict === "LINKED" ? (t.layer === 1 ? true : t.chosen) : false;
    return { ...t, grounding: v.verdict, sources: v.sources.slice(0, t5.GROUND_SOURCES_SHOWN), chosen };
  });
  return { ...map, topics };
}

/**
 * One GROUND wave (§22.9): each call's verdict per key (groundVerdictOf over the raw parts; fails closed), merged
 * (groundRecordOf) into RoadmapRun.grounding, and onto the map (chainGroundedOf). A call that failed leaves its names
 * unchecked (hidden, GROUND_FAILED) and the wave FAILED, which [Try again] re-runs for those batches alone.
 */
async function runGroundStep(s: StepRun): Promise<void> {
  const batches = s.report.batches ?? [];
  let record: t5.GroundRunRecord;
  let facts: Record<string, unknown>;
  let requests = 0;
  const failed: string[][] = [];
  if (s.report.reuseFrom) {
    const source = (await s.c.e.store.run(s.report.reuseFrom)) as TopicRun | null;
    const stored = source && chainPhaseOf(source) === "GROUND" ? groundingLib.groundReusableOf(source.grounding) : null;
    if (!stored) return failChainStep(s, "the reused run is gone");
    const keys = new Set(batches.flat());
    record = { ...stored, verdicts: Object.fromEntries(Object.entries(stored.verdicts).filter(([k]) => keys.has(k))) };
    facts = { samples: [], usage: [], responseIds: [], finishReasons: [], latencyMs: null };
  } else {
    const termsList = s.sp.terms ?? [];
    const results = await model.groundSamples(s.sp.packs, { callModel: s.c.deps.callModel, seedBase: s.run.seedBase ?? SEED_BASE });
    const calls: groundingLib.GroundCallVerdict[] = [];
    results.forEach((r, i) => {
      const terms = termsList[i] ?? [];
      const keys = batches[i] ?? terms.map((t) => t.key);
      if (!r.ok || !r.parts || terms.length === 0) {
        failed.push(keys);
        return;
      }
      try {
        calls.push(groundingLib.groundVerdictOf({ response: r.response ?? model.groundResponseOf(r.parts), terms, titleMode: t5.GROUND_TITLE_MODE }));
      } catch (err) {
        console.error("roadmap: a GROUND verdict wasn't read (left unchecked):", err instanceof Error ? err.message.slice(0, 200) : "failed");
        failed.push(keys);
      }
    });
    const notRun = s.report.wave === 1 && !s.report.retry ? (s.report.plan?.notRun ?? []) : [];
    record = groundingLib.groundRecordOf(calls, notRun);
    requests = model.groundRequestsSentOf(results);
    facts = groundFactsOf(results);
  }
  const status: RunStatus = s.report.reuseFrom ? "REUSED" : failed.length > 0 ? "FAILED" : "OK";
  await persistChainStep(
    s,
    { ...facts, grounding: record, status, error: failed.length > 0 ? `${failed.length} web check(s) failed` : null, requests, report: { ...s.report, ...(failed.length ? { failed } : {}) } },
    (map, rating) => ({ map: chainGroundedOf(map, record), rating })
  );
}

/** DEEPER (§22.8): the children under one topic, one layer down (ADDED_BY_DEEPER); an empty result is NOTHING_DEEPER. Its GROUND wave is the next step. */
async function runDeeperStep(s: StepRun): Promise<void> {
  const pack = s.sp.packs[0];
  if (!pack) return failChainStep(s, "no pack");
  const map = chainMapOf(s.c.b, s.c.ref);
  const parent = chainLiveOf(map).find((t) => t.key === s.report.parent);
  if (!parent) return failChainStep(s, "the topic is no longer on the map");
  const got = await chainSamplesOf(s, pack);
  if (!got) return failChainStep(s, "the reused run is gone");
  const read = chainReadOf(s, got.results, pack.schema);
  const facts = chainFactsOf(s, got, read.valid);
  if (read.valid === 0) {
    await persistChainStep(s, { ...facts, report: { ...s.report, verdicts: read.verdicts } }, null);
    return;
  }
  const cross = await chainCrossGoalOf(s.c);
  const intake = s.c.intake;
  const agreement = topicsLib.deeperAgreementOf({
    samples: read.samples,
    parent,
    map,
    freeDomains: chainFreeDomainsOf(s.c, map, cross.held),
    takenNames: cross.takenNames,
    aim: intake.aim,
    label: labelContextOf(s.c.b, s.c.tree, "TOPIC"),
    countryNamed: chainCountryNamedOf([intake.aim, intake.constraints, intake.examLabel, ...chainOutlineOf(intake)]),
    makeId: s.c.e.makeId,
  });
  await persistChainStep(s, { ...facts, report: { ...s.report, verdicts: read.verdicts, topics: agreement.report } }, (cur, rating) => {
    const added = chainAddedOf(cur.topics, [...agreement.children, ...agreement.hidden], new Set(agreement.hidden), "ADDED_BY_DEEPER");
    const nothing = added.kept.length + added.hidden.length === 0;
    let next = rating;
    if (!nothing && agreement.addsLayer && rating && rating.layers < t5.LAYERS_MAX) {
      const deeper = ratingLib.withLayerChangeOf(rating, { kind: "DEEPER", from: rating.layers, to: rating.layers + 1, day: s.c.today });
      if (deeper.ok) next = deeper.value;
    }
    return { map: { ...cur, topics: [...cur.topics, ...added.topics] }, rating: next, report: { kept: added.kept, hidden: added.hidden, nothing } };
  });
}
