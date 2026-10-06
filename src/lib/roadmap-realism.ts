/**
 * The deterministic feasibility engine (roadmap lane R2, F4, F7): windows,
 * card reach (best, expected, strict), thresholds, target fitting, per-week
 * load, practice allocation, the time verdict, the aim check, cross-checks,
 * remedies, the in-house starter, re-fits and the StartSnapshot. Pure and
 * client-importable (the review screen re-runs it on every edit); no model
 * call, no clock, no assumed pace.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R2. The schedule helpers it
 * builds on (floorBase, bestReach, existingExpected, plannedUnits …) are
 * roadmap-types.ts's. The only file that calls codeText() and writes the
 * origin literal for code-written names.
 *
 *   splitWindows · thresholdFor · cardReach · availableFor · fitPlan · feasibilityOf
 *   applyRemedy · remedyTargetDay · starterLadder · manualLadder · refit
 *   refitForStart · startSnapshotOf · writingPlanOf
 *
 * Revision 4 (roadmap-rev4.md F-R4-8 to F-R4-13, F-R4-21; contracts §14):
 * a depth plan (input.depth set on a Field Area) keeps the depth and moves
 * the date. fitPlan, feasibilityOf, refit, applyRemedy, remedyTargetDay,
 * refitForStart, startSnapshotOf and writingPlanOf branch to the depth engine
 * at the end of this file; a track Area and a legacy plan (depth null) keep
 * everything below as rev 3 wrote it.
 *
 *   coverageOf · lineDomainDefaultOf · depthTermsOf · stageLadderOf
 *   motivationTimelineOf · dateCheckOf · lowerDepthPlanOf · dateEffectOf
 *   floorDayOf · syncStagePractices · productionPlannedFromFluentOf
 *
 * Revision 5, lane 1 (F-R5-8): aimDomainDefaultsOf, the intake's prefill,
 * on lineDomainDefaultOf's own matcher (namesDomain).
 *
 * Revision 5, lane 7 (contracts §22.12, §23.3; F-R5-2, F-R5-9): the chain.
 * A TOPICS plan (RealismInput.planKind TOPICS) is one layer milestone per
 * topic layer, paid at OPEN_LEVEL, then the depth tail "set by reviews".
 * fitPlan, feasibilityOf, refit, applyRemedy, remedyTargetDay, refitForStart,
 * startSnapshotOf, writingPlanOf, dateCheckOf, lowerDepthPlanOf and
 * motivationTimelineOf branch to it before the depth engine (a TOPICS input
 * may carry a depth); every LEVELS answer is byte-identical.
 *
 *   layeredLadderOf · depthTailOf · chainFitOf · chainWriteDaysOf
 *   depthTermsOf(…, levels) · ChainTopicInput · TopicChainInput · ChainFitInput
 *
 * Fix round 2 (contracts §16.10, the WRITE_MARGIN ruling's option (b)): new
 * cards that are only WRITE_MARGIN's spare (every Domain already holds its
 * count n_d) need no pace; with none, the depth is dated on the cards held
 * (spareOnlyOf). The date core is memoised by its whole input (DATE_MEMO),
 * as the capacity cap is (CAP_MEMO).
 *
 * Confirm to unlock (contracts §19, lane R2's half): every kind code places
 * goes through roadmap-catalog's one gate. stageLadderOf and starterLadder
 * take the plan's gate (StageLadderOpts.gate; without one, activityGateOf
 * over the intake) and its blocked kinds join `excluded`; fitPlan, refit,
 * applyRemedy and lowerDepthPlanOf take the blocked kinds (PlaceOpts), never
 * placed; syncTrackStarter re-syncs a track draft after the user's answer.
 * F-R4-17's non-empty-constraints test (bodySafeOf) is gone: the gate holds it.
 *
 *   blockedKindsOf · trackStarterKindsOf · syncTrackStarter · PlaceOpts
 *
 * The practice progression (contracts §20, lane R2's half): code owns every
 * stage's practices, steps and checkpoint on every plan path. roadmap-catalog
 * progressionOf decides them (the focus and its climb, the carry, the spaced
 * review, the steps, the escalating checkpoint, the exam's placement, the
 * gate's stand-ins); "The practice progression on a plan's rows" below puts
 * it on a plan: the depth starter and the track starter (stageLadderOf), every
 * re-fit of a revision-4 plan (fitPlan, refit, applyRemedy, lowerDepthPlanOf,
 * with the intake in PlaceOpts) and the re-syncs (syncTrackStarter,
 * syncStagePractices, syncProgression). Each stage's room is what its weekly
 * practice budget holds (practicesThatFitOf), sized by roadmap-catalog
 * practiceSizeOf at its stageBandFloorOf (one definition); Gemini's picks
 * (StageLadderOpts.picks, PlaceOpts.picks, or a stage's GEMINI_PICK row) are
 * added beside the stage's focus where valid (code's default stays the
 * focus, contracts §20.11), and the outline is split in Gemini's order
 * (StageLadderOpts.order, roadmap-types outlineStagesOf).
 *
 *   planProgressionOf · syncProgression · PlanProgressionOpts · StageLadderOpts.picks/order
 *
 * The review round (contracts §20.11, R2's half): the chain passes the plan's
 * practice family (practiceFamilyOf(intake)) and a dated exam's stage and
 * run-up (examStagesOf over the rows' windows); a short track plan's rows
 * stand at consecutive stages from the base (trackStagePlacesOf: the base is
 * never skipped, a working start at most one rung up, no rung jumped), a
 * pick made for a merged key reaching the row that holds it; a stage is
 * sized together by practiceSizesOf (the focus weighed), within what keeps
 * every week FITS, with a body plan's harder and longer sessions at most
 * twice a week; and a type the user changed covers the kind it replaced
 * (swapsOf), so no re-fit adds that kind back or drops another code row for it.
 *
 *   trackStagePlacesOf
 *
 * The lead's rulings after the review round (realism's half):
 *   - Ruling 4: a short track plan climbs consecutive stages (STAGE_1,
 *     STAGE_2…), never STAGE_1 → STAGE_5 (trackStagePlacesOf).
 *   - Ruling 6: a plan the user writes stays theirs. A re-fit with
 *     PlaceOpts.manual sizes what its stages hold and places nothing; the
 *     app's practices reach a stage only when the user asks
 *     (addStagePracticesOf, "Add the app's practice").
 *   - One figure for a stage's room and its sizes: the room is read off the
 *     ceiling allocate sizes within (the budget held to what keeps every
 *     judged week FITS, never under an equal split: roomOf, roomWithin), and
 *     a focus whose method's band would leave it one session trains twice at
 *     a shorter band (allocate), so a stage with two or more practices
 *     trains its focus at least twice a week.
 *   - A body plan's longer session stays a band above the easy one after the
 *     leftover pass: the easy session never grows to its band, and what it
 *     can't take lengthens the longer session by one band (allocate).
 *
 *   addStagePracticesOf · PlaceOpts.manual · slotProgressionOf
 *
 * The model, in one place (every rule is the spec's; the choices the spec
 * leaves open are marked "choice"):
 *   - Reach. A measure (scope S, level L, due day d) counts the scope's
 *     cards at ≥ L plus those whose bestReach(L) ≤ d, each discounted by p^k
 *     (k passes still needed), from their effective states (past grace: one
 *     level down, due today). New cards are written at the scope's share of
 *     its source rate on every non-held day from today to lastCardDay =
 *     d − floorBase(L); newBest = floor(Σ), newExpected = floor(newBest ×
 *     p^(L−1)). While p is calibrating, expected = best ("best case").
 *     IMPOSSIBLE: target > existingStrict + (today + floorStrict(L) ≤ d ? newBest : 0).
 *   - Shares. Scopes drawing on one source (the same Field's pace, or the
 *     typed rate) split it equally in every life week they are both still
 *     writing; a scope's own measured pace (SCOPE) is its own. A scope
 *     writes from today to the latest lastCardDay of the plan's measures on it.
 *   - Fitting. target = baseline + floor(intensity × (expected − baseline)),
 *     baseline the live count at ≥ L. L starts at thresholdFor and is lowered
 *     one threshold at a time while the target is under baseline +
 *     MIN_INCREMENT_CARDS; for one scope, L and the target never fall along
 *     the plan (RAISED; the floor is the previous row of another lineage),
 *     and a measure that is still too small at its floor
 *     is dropped (CARDS_TOO_SMALL). Shares depend on every L, so fitting
 *     repeats until no L moves (L only ever falls, so it ends).
 *   - Load, per calendar week across the whole plan: reviews (every scope's
 *     cards and every planned cohort, simulated on the base schedule with
 *     every pass landing; a review due on a held day waits for the next open
 *     day; × (1 + (1 − p)) for retries, × 20 s), card writing (× 5 min) and
 *     the practices of the milestone whose window holds the week.
 *   - Time verdict: the worst week's load ÷ available(w), over the weeks of
 *     the window with ≥ WEEK_MIN_ELIGIBLE_DAYS open days (choice: a stub
 *     week of one or two days would judge a single day's reviews).
 *   - Allocation: budget = PRACTICE_BUDGET_SHARE × (a full week's available −
 *     the window's mean weekly reviews and writing), less the practices the
 *     user set (YOURS), split equally over the rest; each gets its method's
 *     band, stepped down while one session does not fit, and
 *     clamp(floor(share ÷ band), 1, 7) sessions. A stage of the practice
 *     progression is sized together instead (roadmap-catalog
 *     practiceSizesOf: its focus two shares and the others' rounding), within
 *     what keeps every judged week FITS (see allocate).
 *
 * Statuses. Dated DRAFT and PLANNED milestones are fitted; STARTING and
 * STARTED rows are carried: never changed, but their measures share the
 * sources and set the "never falls" floor. LATER, SUPERSEDED and DISCARDED
 * rows are passed through untouched. A carried row's checks are reported,
 * never blocking, and its card target, frozen at Start, is judged against
 * today's reach like a typed one (FITS, TIGHT, OVER, IMPOSSIBLE; fix round
 * 2): FITTED means "code fits it now", which is no longer true of it.
 *
 * Positions (fix round). Milestones are counted by lineage, never by row
 * (roadmap-types positionCountOf): a dropped row and its "Start again" copy
 * are one position, so the re-split's room is MAX_MILESTONES − the carried
 * positions. Which row of a lineage is live is the caller's to say: a
 * MilestoneDraft has no createdAt and no goal, so the engine can neither
 * apply isSupersededRow nor tell a dropped original from one whose goal was
 * unarchived. R4 passes only the live rows: no superseded row, no dropped
 * original whose lineage has a "Start again" copy (its card use would still
 * share a writing source and its due day would still be the re-split's
 * base), and no copy left dormant by an unarchive. Per-row judgements (what
 * the plan can still change) follow the row's own status, never its
 * lineage, so a PLANNED copy is judged even while its dropped original is
 * carried, and its feasibility entry is listed first, so a lookup by lineage
 * finds the copy's. The one lineage rule the engine applies itself (fix
 * round 2): a row is never held to the "never falls" floor of a row of its
 * own lineage; a copy re-attempts its original's place, it does not follow
 * it along the plan.
 *
 * Due days. The engine reads MilestoneDraft.dueDay as given. For a carried
 * row the caller passes the one due day (roadmap-types milestoneDueDayOf:
 * the goal's, once started), so a Reschedule moves the re-split's base.
 *
 * Conventions (choice): milestone ord is 1-based; item ord is 0-based within
 * its milestone; code-written rows carry decision KEPT (provenance
 * WORKED_OUT, so they never block "every item decided"); new drafts carry
 * version 0 and id null (R4 stamps both when it persists).
 */
import { addDays, daysBetween, weekStartKeyOf, weekdayOf, type DayKey } from "./life-day";
import { MAX_LEVEL } from "./xp";
import { WEEKDAY_SHORT, scheduledPerWeek } from "./recurrence";
import {
  ADHERENCE_FLOOR,
  ADHERENCE_LOW,
  ADHERENCE_LOW_SESSIONS,
  CALIBRATION_WEEKS,
  CARD_WRITE_MIN,
  CHECKPOINTS_PER_MILESTONE,
  CLEARANCE_MIN,
  DECLARED_FACTOR,
  DOMAINS_PER_MILESTONE,
  INTENSITY,
  KEEP_SHARE,
  MAX_MILESTONES,
  METHOD_DEFAULT_BAND,
  MILESTONE_MAX_DAYS,
  MILESTONE_MIN_DAYS,
  PRACTICES_PER_MILESTONE,
  PRACTICE_BANDS,
  PRACTICE_BUDGET_SHARE,
  RAMP_ALLOWANCE,
  RAMP_FLOOR_MIN,
  REVIEW_SECONDS,
  SESSIONS_MAX,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  START_POINT_FLOOR,
  STEPS_PER_MILESTONE,
  THRESHOLDS,
  THRESHOLD_SPAN_SHARE,
  TIME_FITS_MAX,
  TIME_TIGHT_MAX,
  TOPICS_PER_MILESTONE,
  WEEK_MIN_ELIGIBLE_DAYS,
  cardsAtLevelKey,
  codeText,
  domainName,
  effectiveState,
  existingBest,
  existingExpected,
  existingStrict,
  floorBase,
  floorStrict,
  interval,
  milestoneCountFor,
  minIncrementCards,
  plannedUnits,
  positionCountOf,
  practiceBandMinutes,
  provenanceOf,
  type ActivityGate,
  type AimCheck,
  type CardState,
  type Decision,
  type DomainName,
  type EffectiveCard,
  type Feasibility,
  type Intake,
  type Intensity,
  type ItemDraft,
  type KnowledgeCheck,
  type KnowledgeVerdict,
  type MeasureSpec,
  type MilestoneDraft,
  type MilestoneFeasibility,
  type MilestoneNote,
  type MilestoneStatus,
  type Origin,
  type PlanWeek,
  type PlanWindow,
  type PracticeBand,
  type PracticeFamily,
  type PracticeMethod,
  type RealismInput,
  type RealismScope,
  type Remedy,
  type StartPoint,
  type StartSnapshot,
  type StartWeek,
  type TimeCheck,
  type TimeVerdict,
  type WeekLoad,
  type YoursText,
} from "./roadmap-types";
import {
  AIM_DEPTHS,
  COVER_MAX,
  COVER_MIN,
  DEPTH_DEFAULT,
  DEPTH_DOMAINS_MAX,
  ENGLISH_FUNCTION_WORDS,
  FIRST_RANK_MAX_DAYS,
  MIN_INCREMENT_CARDS_FLOOR,
  OVER_PACE_FACTOR,
  PACE_SHARE,
  PASS_SHARE_MIN_REVIEWS,
  PRACTICE_PAY_FLOOR_MIN,
  PRACTICE_PAY_SHARE,
  RANK_MILESTONE_MAX,
  RANK_TOP,
  REACH_MODEL_VERSION,
  REACH_T_MAX,
  RHO_MIN_DAYS,
  SCHEDULE_BOUND_SHARE,
  STAGE_KEYS,
  STAGE_LEVEL,
  STAGE_NAMES,
  TRACK_STAGE_KEYS,
  TRACK_STAGE_SHARES,
  bestReach,
  coveragePolicyOf,
  existingExpectedSlack,
  isAimDepth,
  newExpectedSlack,
  otherTrackedMinutesOf,
  parseMeasureKey,
  practiceMinutesPerWeekOf,
  rankIndexForStage,
  reachInputsOf,
  stageDayOf,
  stageLabelOf,
  stageOfLevel,
  strictReach,
  topRankIndexOfDepth,
  writeNeedOf,
  WRITE_MARGIN,
  // ── Revision 5, lane 7 (contracts §22.12) ──
  BASE_LEVEL,
  BREADTH_FALLBACK,
  BREADTH_TABLE,
  CHAIN_OFFERS,
  COVER_FLOOR_CARDS,
  LAYERS_MAX,
  LAYERS_MIN,
  LAYER_TOPICS_MAX,
  OPEN_LEVEL,
  STAGE_RANK,
  TOPIC_FLOOR_CARDS,
  isTopicDepth,
  milestoneCapOf,
  topicRankIndexOf,
  type BreadthKey,
  type ChainFit,
  type ChainOffer,
  type ChainRole,
  type CodeTemplate,
  type PlanKind,
  type RatingOrigin,
  type TopicDepth,
  type TopicRole,
  type AimDepth,
  type CalibratingInput,
  type CardSegment,
  type CheckpointKind,
  type CoverageBreakdown,
  type CoverageCounts,
  type DateCheck,
  type DateMode,
  type DateVerdict,
  type EndStateTerm,
  type GateStage,
  type ItemKind,
  type ItemNote,
  type MotivationTimeline,
  type RateSource,
  type ReachCard,
  type ReachParams,
  type StageKey,
  type WriteDay,
} from "./roadmap-types";
import {
  activityGateOf,
  catalogEntryOf,
  examStagesOf,
  languageExamSkillsOf,
  practiceFamilyOf,
  practiceRoleOf,
  practiceSizeOf,
  practiceSizesOf,
  practicesThatFitOf,
  practiceTurnOfLabel,
  progressionCandidatesOf,
  progressionLabelOf,
  progressionNotesOf,
  progressionOf,
  progressionShapeOf,
  progressionStageKeysOf,
  stageBandFloorOf,
  type CatalogKey,
  type CatalogTrack,
  type PracticeKind,
  type PracticeSize,
  type Progression,
  type ProgressionInput,
  type ProgressionItem,
  type ProgressionStageInput,
} from "./roadmap-catalog";
import { outlineStagesOf } from "./roadmap-types";
import { DOMAIN_STOP_WORDS } from "./roadmap-lexicon";
import { words } from "./synonyms";
import type { Track } from "./life-types";

// ═══ Small helpers ═══════════════════════════════════════════════════════════

const EPS = 1e-9;
/** The origin of every name and row code writes (the one place it is written). */
const CODE: Origin = "CODE";
/** Code-written rows are decided at creation: CODE + KEPT is WORKED_OUT (CodeText), never blocking "every item decided". */
const CODE_DECISION: Decision = "KEPT";

const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);
const minDay = (a: DayKey, b: DayKey): DayKey => (a < b ? a : b);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const round1 = (x: number): number => Math.round(x * 10) / 10;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "13 Dec". */
function dayText(d: DayKey): string {
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
}
/** "Sun 22 Nov". */
function dowText(d: DayKey): string {
  return `${WEEKDAY_SHORT[weekdayOf(d) - 1]} ${dayText(d)}`;
}
/** "≈ 3 h 20", "≈ 45 min", "≈ 2 h" (estimates: to the nearest 5 minutes). */
function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes / 5) * 5);
  if (m < 60) return `≈ ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `≈ ${h} h` : `≈ ${h} h ${String(r).padStart(2, "0")}`;
}
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const INTENSITY_WORD: Readonly<Record<Intensity, string>> = { LIGHT: "Light", STEADY: "Steady", PUSH: "Push" };

/** Non-held days in [from, to], inclusive. */
function openDays(from: DayKey, to: DayKey, held: ReadonlySet<DayKey>): number {
  if (from > to) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!held.has(d)) n += 1;
  return n;
}

function sortedUnique(ids: readonly string[]): string[] {
  return Array.from(new Set(ids)).sort();
}

const isDated = (ms: MilestoneDraft): boolean => ms.windowStart != null && ms.dueDay != null;
const SCHEDULED: ReadonlySet<MilestoneStatus> = new Set<MilestoneStatus>(["DRAFT", "PLANNED", "STARTING", "STARTED"]);
const CARRIED: ReadonlySet<MilestoneStatus> = new Set<MilestoneStatus>(["STARTING", "STARTED"]);
const UNSTARTED: ReadonlySet<MilestoneStatus> = new Set<MilestoneStatus>(["DRAFT", "PLANNED", "LATER"]);
/** In the plan's time: dated and scheduled (carried included). */
const inPlan = (ms: MilestoneDraft): boolean => SCHEDULED.has(ms.status) && isDated(ms);
/** Code fits it: a dated DRAFT or PLANNED row. */
const fittable = (ms: MilestoneDraft): boolean => (ms.status === "DRAFT" || ms.status === "PLANNED") && isDated(ms);

function cloneItem(i: ItemDraft): ItemDraft {
  return { ...i, flags: [...i.flags], notes: [...i.notes], ...(i.struck ? { struck: i.struck.map((s): [number, number] => [s[0], s[1]]) } : {}) };
}
function cloneMeasure(m: MeasureSpec): MeasureSpec {
  return {
    ...m,
    scope: {
      ...(m.scope.domainIds ? { domainIds: [...m.scope.domainIds] } : {}),
      ...(m.scope.itemLineageIds ? { itemLineageIds: [...m.scope.itemLineageIds] } : {}),
      ...(m.scope.templateIds ? { templateIds: [...m.scope.templateIds] } : {}),
    },
  };
}
function cloneMilestone(ms: MilestoneDraft): MilestoneDraft {
  return { ...ms, items: ms.items.map(cloneItem), measures: ms.measures.map(cloneMeasure), notes: [...ms.notes] };
}

/** Indices in plan order (ord, then position). */
function planOrder(plan: readonly MilestoneDraft[]): number[] {
  return plan.map((_, i) => i).sort((a, b) => plan[a].ord - plan[b].ord || a - b);
}

const liveItem = (i: ItemDraft): boolean => i.decision !== "REMOVED";
/** Practices that count: not removed and going to Today (a practice switched off at Start leaves the plan). */
const livePractices = (ms: MilestoneDraft): ItemDraft[] => ms.items.filter((i) => i.kind === "PRACTICE" && liveItem(i) && i.addToToday !== false);

/** The milestone's resolved Domains (DOMAIN items with a Domain id), in item order, at most DOMAINS_PER_MILESTONE. */
function resolvedDomains(ms: MilestoneDraft): { id: string; name: DomainName }[] {
  const out: { id: string; name: DomainName }[] = [];
  const seen = new Set<string>();
  for (const i of [...ms.items].sort((a, b) => a.ord - b.ord)) {
    if (i.kind !== "DOMAIN" || !liveItem(i) || !i.domainId || seen.has(i.domainId)) continue;
    seen.add(i.domainId);
    out.push({ id: i.domainId, name: domainName({ id: i.domainId, name: i.label }) });
    if (out.length >= DOMAINS_PER_MILESTONE) break;
  }
  return out;
}

const cardMeasureOf = (ms: MilestoneDraft): MeasureSpec | undefined =>
  ms.measures.find((m) => m.kind === "CARDS_AT_LEVEL" && m.role === "PAYS" && m.minLevel != null && (m.scope.domainIds?.length ?? 0) > 0);

/** Minutes of one session of a practice (its band; its method's default band without one). */
function bandMinutesOf(i: ItemDraft): number {
  const band: PracticeBand = i.durationBand ?? METHOD_DEFAULT_BAND[i.method ?? "DELIBERATE_PRACTICE"];
  return practiceBandMinutes(band);
}
/** A practice's sessions a week as planned (its rule; its sessionsPerWeek without one). */
function sessionsPerWeekOf(i: ItemDraft): number {
  const fromRule = i.rule ? scheduledPerWeek(i.rule) : 0;
  return fromRule > 0 ? fromRule : (i.sessionsPerWeek ?? 0);
}
/** The rule a practice runs on: its own, or TARGET:n/W from its sessions. */
function ruleOf(i: ItemDraft): string | null {
  if (i.rule) return i.rule;
  const s = i.sessionsPerWeek ?? 0;
  if (s <= 0) return null;
  return s >= SESSIONS_MAX ? "DAILY" : `TARGET:${s}/W`;
}

// ═══ Windows ═════════════════════════════════════════════════════════════════

/** The Sundays to try for an ideal boundary: the nearest (ties earlier), then the other side. */
function sundayCandidates(ideal: DayKey): DayKey[] {
  const wd = weekdayOf(ideal);
  if (wd === 7) return [ideal, addDays(ideal, 7), addDays(ideal, -7)];
  const back = addDays(ideal, -wd);
  const fwd = addDays(ideal, 7 - wd);
  return wd <= 7 - wd ? [back, fwd] : [fwd, back];
}

function trySplit(start: DayKey, targetDay: DayKey, span: number, n: number, enforceMax: boolean): DayKey[] | null {
  const bounds: DayKey[] = [start];
  for (let i = 1; i < n; i++) {
    const ideal = addDays(start, Math.round((i * span) / n));
    const prev = bounds[i - 1];
    const left = n - i;
    const pick = sundayCandidates(ideal).find((c) => {
      const len = daysBetween(prev, c);
      const rest = daysBetween(c, targetDay);
      if (len < MILESTONE_MIN_DAYS || rest < MILESTONE_MIN_DAYS * left) return false;
      if (enforceMax && (len > MILESTONE_MAX_DAYS || rest > MILESTONE_MAX_DAYS * left)) return false;
      return true;
    });
    if (!pick) return null;
    bounds.push(pick);
  }
  const last = daysBetween(bounds[bounds.length - 1], targetDay);
  if (last < MILESTONE_MIN_DAYS || (enforceMax && last > MILESTONE_MAX_DAYS)) return null;
  bounds.push(targetDay);
  return bounds;
}

/**
 * n windows from today to targetDay (n = milestoneCountFor(span), or
 * `count` when given, as F6 step 1's re-split over fewer milestones):
 * intermediate boundaries on Sundays (ties earlier), the last ending on
 * targetDay, each 35–186 days (a first window from mid-week may run 35–41).
 * null when the span is outside [SPAN_MIN_DAYS, SPAN_MAX_DAYS].
 *
 * A window's length is the distance between its boundaries (the first runs
 * from today, the others from the Monday after the previous Sunday). A
 * boundary that would leave a window under 35 days moves to the Sunday on
 * the other side; if no Sunday works, n −= 1 and the split is retried.
 * With an explicit `count` only the 35-day minimum is enforced (fewer
 * milestones over the same span may need longer windows; choice).
 */
export function splitWindows(today: DayKey, targetDay: DayKey, count?: number): PlanWindow[] | null {
  if (!DAY_KEY.test(today) || !DAY_KEY.test(targetDay)) return null;
  const span = daysBetween(today, targetDay);
  if (!(span >= SPAN_MIN_DAYS && span <= SPAN_MAX_DAYS)) return null;
  return splitSpan(today, targetDay, count);
}

/** splitWindows without the span bounds' own check (refit splits what is left after carried milestones). */
function splitSpan(start: DayKey, targetDay: DayKey, count?: number): PlanWindow[] | null {
  const span = daysBetween(start, targetDay);
  if (span < MILESTONE_MIN_DAYS) return null;
  const enforceMax = count == null;
  let n = count == null ? milestoneCountFor(span) : clamp(Math.floor(count), 1, MAX_MILESTONES);
  for (; n >= 1; n--) {
    const b = trySplit(start, targetDay, span, n, enforceMax);
    if (!b) continue;
    const out: PlanWindow[] = [];
    for (let i = 1; i < b.length; i++) out.push({ start: i === 1 ? start : addDays(b[i - 1], 1), end: b[i] });
    return out;
  }
  return null;
}

// ═══ Thresholds ══════════════════════════════════════════════════════════════

/** The highest THRESHOLDS L with floorBase(L, m) ≤ THRESHOLD_SPAN_SHARE × days to the due day (null under the first). */
function thresholdByDays(dueDay: DayKey, today: DayKey, m: number): number | null {
  const days = daysBetween(today, dueDay);
  let best: number | null = null;
  for (const L of THRESHOLDS) if (floorBase(L, m) <= THRESHOLD_SPAN_SHARE * days) best = L;
  return best;
}

/**
 * The level threshold for a milestone due on dueDay: max(START_POINT_FLOOR,
 * the highest THRESHOLDS L with floorBase(L, m) ≤ THRESHOLD_SPAN_SHARE × days
 * to it), never below `previous` (the same scope's previous milestone).
 */
export function thresholdFor(dueDay: DayKey, today: DayKey, startPoint: StartPoint, previous: number | null, m = 1): number {
  let L = Math.max(START_POINT_FLOOR[startPoint], thresholdByDays(dueDay, today, m) ?? THRESHOLDS[0]);
  if (previous != null && Number.isFinite(previous)) L = Math.max(L, previous);
  return L;
}

// ═══ Pass rate and capacity ══════════════════════════════════════════════════

interface PassRate {
  /** p, or 1 while calibrating (expected = best). */
  p: number;
  calibrating: boolean;
  /** Reviews it rests on (have, while calibrating). */
  n: number;
  need: number;
}

function passRateOf(input: RealismInput): PassRate {
  const s = input.throughput.passShare;
  return s.kind === "measured" ? { p: clamp(s.value, 0, 1), calibrating: false, n: s.n, need: 0 } : { p: 1, calibrating: true, n: s.have, need: s.need };
}

interface Capacity {
  /** A full week's minutes: min(hours × 60 × A, rampCap × share). */
  weekMin: number;
  declaredMin: number;
  a: number;
  aMeasured: boolean;
  /** The user's whole ramp cap (every goal's together); null while calibrating. */
  rampCap: number | null;
  trackedMedian: number | null;
  trackedHave: number;
  unverified: boolean;
  class: "ESTIMATED" | "YOURS";
  /** This goal's part of the ramp cap (rampCap × share) is under its declared minutes. */
  rampBinds: boolean;
  /** This goal's share of the week (RealismInput.share; 1 with one goal: contracts §23.3, ruling 54). */
  share: number;
  /** This goal's share of its Field's pace (RealismInput.fieldShare; it multiplies a FIELD-sourced rate only: ruling 30). */
  fieldShare: number;
}

/** A share as the engine reads it: a finite number within [0, 1]; absent (or not a number) reads 1, today's whole week (M13). */
function shareOf(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, 0, 1) : 1;
}

/**
 * The week's minutes for this goal (contracts §23.3, lane 3; ruling 54):
 * weekMin_g = min(h_g × 60 × A, rampCap × s_g). The ramp cap is the user's
 * tracked time, which every goal shares, so each goal gets its share of it;
 * its own declared hours are its own. A share of 1 (one goal, or none given)
 * is byte-identical to the single-goal engine.
 */
function capacityOf(input: RealismInput): Capacity {
  const adh = input.throughput.adherence;
  const aMeasured = adh.kind === "measured";
  const a = aMeasured ? clamp(adh.value, ADHERENCE_FLOOR, 1) : DECLARED_FACTOR;
  const tracked = input.throughput.trackedMinutes;
  const trackedMedian = tracked.kind === "measured" ? tracked.median : null;
  const rampCap = trackedMedian == null ? null : Math.max(RAMP_FLOOR_MIN, RAMP_ALLOWANCE * trackedMedian);
  const share = shareOf(input.share);
  const fieldShare = shareOf(input.fieldShare);
  const goalCap = rampCap == null ? null : share === 1 ? rampCap : rampCap * share;
  const declaredMin = Math.max(0, input.hoursPerWeek) * 60 * a;
  const weekMin = goalCap == null ? declaredMin : Math.min(declaredMin, goalCap);
  return {
    weekMin,
    declaredMin,
    a,
    aMeasured,
    rampCap,
    trackedMedian,
    trackedHave: tracked.kind === "calibrating" ? tracked.have : tracked.weeks,
    unverified: !aMeasured || rampCap == null,
    class: rampCap == null ? "YOURS" : "ESTIMATED",
    rampBinds: goalCap != null && goalCap < declaredMin,
    share,
    fieldShare,
  };
}

/**
 * The input's scopes with a FIELD-sourced rate split by this goal's Field
 * pace share (RealismInput.fieldShare, read through capacityOf; ruling 30):
 * goals in one Field write from one Field pace. A Domain's own rate (SCOPE)
 * is not split, because Domains are exclusive between goals, and neither is
 * a rate you typed (YOURS). At a share of 1 it is the input's own array.
 */
function pacedScopesOf(input: RealismInput, fieldShare: number): RealismScope[] {
  if (fieldShare === 1) return input.scopes;
  return input.scopes.map((s) => (s.rateSource === "FIELD" && s.rate != null ? { ...s, rate: s.rate * fieldShare } : s));
}

/**
 * available(w) = min(hoursPerWeek × 60 × A, rampCap × share) × non-held days ÷ 7
 * (Constants), the days being the week's own from today on (Monday to
 * Sunday, or from today in the current week). It is not cut at the aim's
 * date (fix round): the week quests (R6, which pass today = weekStart and
 * scale by |E| ÷ the week's non-held days) need the whole week's capacity in
 * the aim's final week and in any week a Reschedule moved past it. The
 * plan's own weeks are cut to each milestone's window where load is (weeksOf).
 * Before calibration A = DECLARED_FACTOR, there is no rampCap and the verdict
 * is unverified (class YOURS: the declared fallback). With up to 3 goals
 * (contracts §23.3), `share` is this goal's (RealismInput.share, read by
 * capacityOf): the week quests freeze each goal's set at its own share.
 */
export function availableFor(weekStart: DayKey, input: RealismInput): { minutes: number; class: "ESTIMATED" | "YOURS"; unverified: boolean; rampBinds: boolean } {
  const cap = capacityOf(input);
  const held = new Set(input.heldDays);
  const from = maxDay(weekStart, input.today);
  const to = addDays(weekStart, 6);
  return { minutes: (cap.weekMin * openDays(from, to, held)) / 7, class: cap.class, unverified: cap.unverified, rampBinds: cap.rampBinds };
}

// ═══ The run context ═════════════════════════════════════════════════════════

interface Ctx {
  input: RealismInput;
  today: DayKey;
  m: number;
  held: ReadonlySet<DayKey>;
  pr: PassRate;
  cap: Capacity;
  scopeOf(domainIds: readonly string[]): RealismScope;
}

/**
 * A card scope for a Domain set: the input's exact scope, else one composed
 * from single-Domain scopes (the editor may pick a set R4 did not supply):
 * their cards, and the shared Field pace or the typed rate when one of them
 * has it; NONE otherwise (choice: a union's own median cannot be rebuilt
 * from its parts').
 */
function contextOf(input: RealismInput): Ctx {
  const cache = new Map<string, RealismScope>();
  const cap = capacityOf(input);
  const scopes = pacedScopesOf(input, cap.fieldShare);
  const scopeOf = (domainIds: readonly string[]): RealismScope => {
    const ids = sortedUnique(domainIds);
    const key = ids.join(",");
    const hit = cache.get(key);
    if (hit) return hit;
    let scope = scopes.find((s) => s.key === key) ?? scopes.find((s) => sortedUnique(s.domainIds).join(",") === key);
    if (!scope) {
      const parts = ids.map((id) => scopes.find((s) => s.domainIds.length === 1 && s.domainIds[0] === id)).filter((s): s is RealismScope => !!s);
      const cards: CardState[] = [];
      for (const p of parts) cards.push(...p.cards);
      const field = parts.find((p) => p.rateSource === "FIELD" && p.rate != null);
      const yours = parts.find((p) => p.rateSource === "YOURS" && p.rate != null);
      const source = field ?? yours ?? null;
      scope = {
        key,
        domainIds: ids,
        fieldId: parts[0]?.fieldId ?? null,
        cards,
        rateSource: source ? source.rateSource : "NONE",
        rate: source ? source.rate : null,
      };
    }
    cache.set(key, scope);
    return scope;
  };
  return { input, today: input.today, m: input.m > 0 ? input.m : 1, held: new Set(input.heldDays), pr: passRateOf(input), cap, scopeOf };
}

const effectiveCards = (cards: readonly CardState[], today: DayKey): EffectiveCard[] => cards.map((c) => effectiveState(c, today));
const liveCount = (cards: readonly CardState[], level: number): number => cards.filter((c) => c.level >= level).length;

// ═══ Writing: who writes what, when ══════════════════════════════════════════

/** One card measure in the plan's time. */
interface CardUse {
  key: string;
  scope: RealismScope;
  level: number;
  dueDay: DayKey;
  lastCardDay: DayKey;
}

/** New cards written per day from today (fractional), per scope key, with running sums. */
interface Writing {
  start: DayKey;
  n: number;
  perDay: Map<string, Float64Array>;
  cum: Map<string, Float64Array>;
  /** Scope keys whose share was split with another scope in some week. */
  shared: Set<string>;
  /** Each writing scope's last writing day (the latest lastCardDay of the plan's measures on it). */
  until: Map<string, DayKey>;
}

function sourceKeyOf(scope: RealismScope): string | null {
  if (scope.rateSource === "NONE" || scope.rate == null || !(scope.rate > 0)) return null;
  if (scope.rateSource === "SCOPE") return `SCOPE:${scope.key}`;
  if (scope.rateSource === "FIELD") return `FIELD:${scope.fieldId ?? ""}`;
  return "YOURS";
}

function horizonOf(plan: readonly MilestoneDraft[], input: RealismInput): DayKey {
  let end = maxDay(input.targetDay, input.today);
  for (const ms of plan) if (inPlan(ms) && ms.dueDay) end = maxDay(end, ms.dueDay);
  return end;
}

function writingOf(uses: readonly CardUse[], ctx: Ctx, end: DayKey): Writing {
  const start = ctx.today;
  const n = Math.max(1, daysBetween(start, end) + 1);
  const off = weekdayOf(start) - 1;
  const weekIdx = (i: number) => Math.floor((i + off) / 7);
  const until = new Map<string, DayKey>();
  const scopes = new Map<string, RealismScope>();
  for (const u of uses) {
    if (u.lastCardDay < start) continue;
    scopes.set(u.key, u.scope);
    until.set(u.key, maxDay(until.get(u.key) ?? u.lastCardDay, u.lastCardDay));
  }
  // Writers per source per week.
  const writers = new Map<string, Map<number, number>>();
  for (const [key, scope] of scopes) {
    const src = sourceKeyOf(scope);
    if (!src) continue;
    const last = Math.min(n - 1, daysBetween(start, until.get(key)!));
    const per = writers.get(src) ?? new Map<number, number>();
    for (let w = weekIdx(0); w <= weekIdx(last); w++) per.set(w, (per.get(w) ?? 0) + 1);
    writers.set(src, per);
  }
  const perDay = new Map<string, Float64Array>();
  const cum = new Map<string, Float64Array>();
  const shared = new Set<string>();
  for (const [key, scope] of scopes) {
    const src = sourceKeyOf(scope);
    const arr = new Float64Array(n);
    const run = new Float64Array(n);
    if (src) {
      const last = Math.min(n - 1, daysBetween(start, until.get(key)!));
      const per = writers.get(src)!;
      for (let i = 0; i <= last; i++) {
        const k = per.get(weekIdx(i)) ?? 1;
        if (k > 1) shared.add(key);
        if (!ctx.held.has(addDays(start, i))) arr[i] = (scope.rate as number) / k / 7;
      }
    }
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += arr[i];
      run[i] = s;
    }
    perDay.set(key, arr);
    cum.set(key, run);
  }
  return { start, n, perDay, cum, shared, until };
}

/** Cards written from today through `to` (inclusive) for a scope. */
function writtenThrough(w: Writing, key: string, to: DayKey): number {
  const run = w.cum.get(key);
  if (!run || to < w.start) return 0;
  const i = Math.min(w.n - 1, daysBetween(w.start, to));
  return run[i];
}

/** The scope's mean share over its writing window, a week's worth (for the earliest feasible day). */
function meanShare(w: Writing, key: string, scope: RealismScope, held: ReadonlySet<DayKey>, uses: readonly CardUse[]): number {
  const until = w.until.get(key);
  if (until) {
    const open = openDays(w.start, minDay(until, addDays(w.start, w.n - 1)), held);
    const sum = writtenThrough(w, key, until);
    if (open > 0 && sum > 0) return (sum / open) * 7;
  }
  const src = sourceKeyOf(scope);
  if (!src) return 0;
  const sharing = new Set(uses.filter((u) => sourceKeyOf(u.scope) === src).map((u) => u.key));
  return (scope.rate as number) / Math.max(1, sharing.size);
}

/**
 * Every scope's planned new cards per life week (the shares, pro-rated for
 * held days and cut at each scope's last useful day), for the "How this is
 * worked out" sheet and the checks: in any week the scopes drawing on one
 * source sum to at most its rate.
 */
export function writingPlanOf(plan: readonly MilestoneDraft[], input: RealismInput): { scopeKey: string; rateSource: RealismScope["rateSource"]; weeks: { weekStart: DayKey; cards: number }[] }[] {
  if (isTopicsInput(input)) return chainWritingPlanOf(plan, input); // Revision 5, lane 7: the staged writing.
  if (isDepthInput(input)) return depthWritingPlanOf(plan, input);
  const ctx = contextOf(input);
  const uses = usesOf(plan, ctx);
  const w = writingOf(uses, ctx, horizonOf(plan, input));
  const out: { scopeKey: string; rateSource: RealismScope["rateSource"]; weeks: { weekStart: DayKey; cards: number }[] }[] = [];
  for (const [key, arr] of w.perDay) {
    const scope = uses.find((u) => u.key === key)!.scope;
    const weeks: { weekStart: DayKey; cards: number }[] = [];
    for (let i = 0; i < w.n; i++) {
      const ws = weekStartKeyOf(addDays(w.start, i));
      const last = weeks[weeks.length - 1];
      if (!last || last.weekStart !== ws) weeks.push({ weekStart: ws, cards: arr[i] });
      else last.cards += arr[i];
    }
    out.push({ scopeKey: key, rateSource: scope.rateSource, weeks: weeks.filter((x) => x.cards > EPS) });
  }
  return out.sort((a, b) => (a.scopeKey < b.scopeKey ? -1 : a.scopeKey > b.scopeKey ? 1 : 0));
}

/** The card measures in the plan's time, from the plan as it stands. */
function usesOf(plan: readonly MilestoneDraft[], ctx: Ctx): CardUse[] {
  const out: CardUse[] = [];
  for (const ms of plan) {
    if (!inPlan(ms)) continue;
    const cm = cardMeasureOf(ms);
    if (!cm) continue;
    const scope = ctx.scopeOf(cm.scope.domainIds!);
    out.push({ key: scope.key, scope, level: cm.minLevel!, dueDay: ms.dueDay!, lastCardDay: addDays(ms.dueDay!, -floorBase(cm.minLevel!, ctx.m)) });
  }
  return out;
}

// ═══ Reach ═══════════════════════════════════════════════════════════════════

/** Card reach for one measure (F4 step 2). */
export interface CardReach {
  level: number;
  dueDay: DayKey;
  existingBest: number;
  existingExpected: number;
  existingStrict: number;
  newBest: number;
  newExpected: number;
  best: number;
  expected: number;
  /** existingStrict + newBest when today + floorStrict(L) ≤ d: above it the target is IMPOSSIBLE. */
  strictMax: number;
  /** d − floorBase(L): new cards after it cannot reach L in time. */
  lastCardDay: DayKey;
  /** p calibrating: expected = best ("best case"). */
  bestCase: boolean;
  /** The earliest day the target could be met (for IMPOSSIBLE's copy). Filled by the knowledge check, which knows the target; null from cardReach. */
  earliestDay: DayKey | null;
}

/** Reach with a written-cards function (from today through a day). */
function reachOf(eff: readonly EffectiveCard[], level: number, d: DayKey, ctx: Ctx, written: ((to: DayKey) => number) | null): CardReach {
  const { today, m, pr } = ctx;
  const lastCardDay = addDays(d, -floorBase(level, m));
  const exBest = existingBest(eff, level, d, m);
  const exStrict = existingStrict(eff, level, d, m);
  const exExp = pr.calibrating ? exBest : existingExpected(eff, level, d, pr.p, m);
  const newBest = written && lastCardDay >= today ? Math.floor(written(lastCardDay) + EPS) : 0;
  const newExpected = pr.calibrating ? newBest : Math.floor(newBest * Math.pow(pr.p, level - 1) + EPS);
  const best = exBest + newBest;
  return {
    level,
    dueDay: d,
    existingBest: exBest,
    existingExpected: exExp,
    existingStrict: exStrict,
    newBest,
    newExpected,
    best,
    expected: pr.calibrating ? best : exExp + newExpected,
    strictMax: exStrict + (addDays(today, floorStrict(level, m)) <= d ? newBest : 0),
    lastCardDay,
    bestCase: pr.calibrating,
    earliestDay: null,
  };
}

/** Written through `to` at a constant weekly rate on every open day from today. */
function constantWriter(rate: number | null, ctx: Ctx): ((to: DayKey) => number) | null {
  if (rate == null || !(rate > 0)) return null;
  return (to: DayKey) => (rate / 7) * openDays(ctx.today, to, ctx.held);
}

/** Reach at level L by dueDay for one scope, with `rate` its share of the source rate (null: NONE, new cards not counted). */
export function cardReach(scope: RealismScope, level: number, dueDay: DayKey, input: RealismInput, rate: number | null): CardReach {
  const ctx = contextOf(input);
  return reachOf(effectiveCards(scope.cards, ctx.today), level, dueDay, ctx, constantWriter(rate, ctx));
}

/**
 * The first day the target is not IMPOSSIBLE, at a weekly rate (the scope's
 * mean share): strictMax is monotone in the day, so a binary search over
 * [today, today + SPAN_MAX_DAYS] finds it; null when even that is too soon.
 */
function earliestFeasibleDay(eff: readonly EffectiveCard[], level: number, target: number, ctx: Ctx, weeklyRate: number): DayKey | null {
  const writer = constantWriter(weeklyRate, ctx);
  const ok = (d: DayKey) => reachOf(eff, level, d, ctx, writer).strictMax >= target;
  let lo = 0;
  let hi = SPAN_MAX_DAYS;
  if (!ok(addDays(ctx.today, hi))) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ok(addDays(ctx.today, mid))) hi = mid;
    else lo = mid + 1;
  }
  return addDays(ctx.today, lo);
}

// ═══ Load: the base schedule, simulated ══════════════════════════════════════

interface Sim {
  start: DayKey;
  n: number;
  /** Review minutes per day (retries and REVIEW_SECONDS applied). */
  review: Float64Array;
  /** Card-writing minutes per day. */
  write: Float64Array;
  /** Reviews a day of the planned new cards (for the clearance line). */
  newReviews: Float64Array;
}

/** The aim's existing cards, each once: scopes that overlap share their common Domains' cards (by Card.domainId). */
function cardsForLoad(uses: readonly CardUse[], ctx: Ctx): EffectiveCard[] {
  const out: EffectiveCard[] = [];
  const seenDomains = new Set<string>();
  const seenScopes = new Set<string>();
  for (const u of [...uses].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    if (seenScopes.has(u.key)) continue;
    seenScopes.add(u.key);
    const tagged = u.scope.cards.every((c) => c.domainId != null);
    if (!tagged) {
      for (const c of u.scope.cards) out.push(effectiveState(c, ctx.today));
      continue;
    }
    const fresh = new Set(u.scope.domainIds.filter((d) => !seenDomains.has(d)));
    for (const c of u.scope.cards) if (fresh.has(c.domainId!)) out.push(effectiveState(c, ctx.today));
    for (const d of fresh) seenDomains.add(d);
  }
  return out;
}

/** `retryP`: the pass rate the retries are counted at (a depth plan's reach-model p, never 1 while calibrating); ctx's p otherwise. */
function simulate(uses: readonly CardUse[], writing: Writing, ctx: Ctx, retryP: number = ctx.pr.p): Sim {
  const { start, n } = writing;
  const review = new Float64Array(n);
  const write = new Float64Array(n);
  const newReviews = new Float64Array(n);
  // nextOpen[i]: the first non-held day index ≥ i (n when none).
  const nextOpen = new Int32Array(n + 1);
  nextOpen[n] = n;
  for (let i = n - 1; i >= 0; i--) nextOpen[i] = ctx.held.has(addDays(start, i)) ? nextOpen[i + 1] : i;
  const gap: number[] = [];
  for (let l = 0; l <= MAX_LEVEL; l++) gap.push(Math.max(1, interval(Math.max(1, l), ctx.m)));
  const retry = 1 + (1 - retryP);
  const perReview = (retry * REVIEW_SECONDS) / 60;
  const walk = (idx0: number, level0: number, weight: number, fresh: boolean) => {
    let idx = Math.max(0, idx0);
    let level = level0;
    while (idx < n) {
      idx = nextOpen[idx];
      if (idx >= n) break;
      review[idx] += weight * perReview;
      if (fresh) newReviews[idx] += weight * retry;
      level = Math.min(MAX_LEVEL, level + 1);
      idx += gap[level];
    }
  };
  for (const c of cardsForLoad(uses, ctx)) walk(daysBetween(start, c.dueDay), c.level, 1, false);
  for (const arr of writing.perDay.values()) {
    for (let i = 0; i < n; i++) {
      const w = arr[i];
      if (!(w > 0)) continue;
      write[i] += w * CARD_WRITE_MIN;
      walk(i, 1, w, true);
    }
  }
  return { start, n, review, write, newReviews };
}

function sumIn(arr: Float64Array, sim: Sim, from: DayKey, to: DayKey): number {
  const a = Math.max(0, daysBetween(sim.start, from));
  const b = Math.min(sim.n - 1, daysBetween(sim.start, to));
  let s = 0;
  for (let i = a; i <= b; i++) s += arr[i];
  return s;
}

/** The window's mean weekly reviews and writing (per open day × 7). */
function meanLoadWeek(sim: Sim, from: DayKey, to: DayKey, held: ReadonlySet<DayKey>): number {
  const open = openDays(from, to, held);
  if (open === 0) return 0;
  return ((sumIn(sim.review, sim, from, to) + sumIn(sim.write, sim, from, to)) / open) * 7;
}

/** A milestone's practice minutes in [from, to] (plannedUnits over its open days × band). */
function practiceMinutesIn(ms: MilestoneDraft, from: DayKey, to: DayKey, held: ReadonlySet<DayKey>): number {
  let s = 0;
  for (const p of livePractices(ms)) {
    const rule = ruleOf(p);
    if (!rule) continue;
    s += plannedUnits(rule, { from, to, startDay: ms.windowStart ?? from }, held) * bandMinutesOf(p);
  }
  return s;
}

// ═══ Plan state (uses, writing, load) ════════════════════════════════════════

interface PlanState {
  uses: CardUse[];
  writing: Writing;
  sim: Sim;
}

function planStateOf(plan: readonly MilestoneDraft[], ctx: Ctx): PlanState {
  const uses = usesOf(plan, ctx);
  const writing = writingOf(uses, ctx, horizonOf(plan, ctx.input));
  return { uses, writing, sim: simulate(uses, writing, ctx) };
}

// ═══ Practice allocation (F4 step 5) ═════════════════════════════════════════
//
// The sizing itself (a practice's band and sessions from its share, never under
// the stage's band floor) is roadmap-catalog's practiceSizeOf, and a stage's
// floor its stageBandFloorOf: one definition, which the practice progression's
// room (practicesThatFitOf) reads too (contracts §20.6).

interface Allocation {
  /** Each WORKED_OUT practice's share of the budget a week; null with none to allocate. */
  share: number | null;
  /** Even one session at the floor (D15, or a depth stage's band floor) does not fit: the time verdict is OVER ("cut a practice or raise hours"). */
  cut: boolean;
}

/**
 * A milestone's weekly practice budget for code's practices: PRACTICE_BUDGET_SHARE
 * × (a full week's available − the window's mean weekly reviews and writing),
 * less the practices whose sessions the user set (YOURS).
 */
function practiceBudgetOf(ms: MilestoneDraft, sim: Sim, ctx: Ctx, from: DayKey): number {
  const fixedMin = livePractices(ms)
    .filter((p) => p.planSource === "YOURS")
    .reduce((s, p) => s + sessionsPerWeekOf(p) * bandMinutesOf(p), 0);
  const load = meanLoadWeek(sim, from, ms.dueDay!, ctx.held);
  return PRACTICE_BUDGET_SHARE * (ctx.cap.weekMin - load) - fixedMin;
}

function allocationOf(ms: MilestoneDraft, sim: Sim, ctx: Ctx, from: DayKey, floor: PracticeBand | null = null): Allocation {
  const auto = livePractices(ms).filter((p) => p.planSource !== "YOURS");
  if (auto.length === 0) return { share: null, cut: false };
  const share = practiceBudgetOf(ms, sim, ctx, from) / auto.length;
  return { share, cut: share < practiceBandMinutes(floor ?? "D15") };
}

/**
 * The most sessions a week code sizes of a body plan's demanding kinds (its intensity: most of the week stays easy):
 * a harder session and a longer one at most twice a week each; what they leave of the budget goes to the stage's
 * other practices. A realism guard over roadmap-catalog practiceSizesOf (the one sizing), for the lead to fold into it.
 */
const BODY_SESSIONS_MAX: Readonly<Partial<Record<string, number>>> = { HARDER_SESSION: 2, LONGER_SESSION: 2 };

/** What practiceSizeOf and practiceSizesOf read a row as: its catalog type, else its method. */
const sizedKindOf = (p: ItemDraft): CatalogKey | PracticeMethod => p.catalogKey ?? p.method ?? "DELIBERATE_PRACTICE";
const minutesOfSize = (s: PracticeSize): number => s.sessionsPerWeek * practiceBandMinutes(s.band);
const setSize = (p: ItemDraft, s: PracticeSize): void => {
  p.durationBand = s.band;
  p.sessionsPerWeek = s.sessionsPerWeek;
  p.rule = s.rule;
  p.planSource = "WORKED_OUT";
};

/**
 * Sets sessions, band and rule on the milestone's WORKED_OUT practices (planSource WORKED_OUT); YOURS ones keep theirs.
 * `floor`: a depth stage's band floor. `focus`: the kind the stage trains (the practice progression's focus,
 * contracts §20): with it and two or more practices to size, the stage is sized together by roadmap-catalog
 * practiceSizesOf (the one definition: the focus two shares and each other one, a longer session a band above the
 * easy one, the focus taking what the others' rounding leaves), within the most every judged week of the window
 * still FITS (fitsRoomOf; never under what an equal split would take, so a stage that was tight stays as it was);
 * then a body plan's harder and longer sessions are held to BODY_SESSIONS_MAX a week, and what that, or a focus at
 * its most sessions a week, leaves goes to the other practices (never below their size, within that budget; the easy
 * session never to the longer one's band, so the longer session stays a band above it, and what the easy session can't
 * take lengthens the longer session by one band, LONGER_BAND_MAX at most). So a third practice never thins the focus to
 * the others' size, and the budget isn't left unused. Without a focus (a rev 3 plan, a skeleton), an equal split as before.
 */
function allocate(ms: MilestoneDraft, sim: Sim, ctx: Ctx, from: DayKey, floor: PracticeBand | null = null, focus: string | null = null): Allocation {
  const alloc = allocationOf(ms, sim, ctx, from, floor);
  if (alloc.share == null) return alloc;
  const auto = livePractices(ms).filter((p) => p.planSource !== "YOURS");
  const lead = focus != null && auto.length >= 2 ? leadPracticeOf(ms, auto, focus) : -1;
  const share = Math.max(0, alloc.share);
  if (lead < 0) {
    for (const p of auto) setSize(p, practiceSizeOf(p.method ?? "DELIBERATE_PRACTICE", share, floor));
    return alloc;
  }
  const ordered = [auto[lead], ...auto.filter((_, j) => j !== lead)];
  const budget = share * auto.length;
  const even = ordered.reduce((sum, p) => sum + minutesOfSize(practiceSizeOf(sizedKindOf(p), share, floor)), 0);
  const ceiling = Math.min(budget, Math.max(fitsRoomOf(ms, sim, ctx, from), even));
  const sizes = practiceSizesOf(ordered.map(sizedKindOf), ceiling, floor);
  ordered.forEach((p, k) => {
    const s = sizes[k];
    const most = p.catalogKey ? BODY_SESSIONS_MAX[p.catalogKey] : undefined;
    setSize(p, most != null && s.sessionsPerWeek > most ? { band: s.band, sessionsPerWeek: most, rule: `TARGET:${most}/W` } : s);
  });
  // What a capped session or a focus at its most sessions a week leaves goes to the others, in order, within the budget. On
  // a body plan the easy session never grows to the longer one's band (more easy sessions at the band under it instead), so
  // practiceSizesOf's band rule (a longer session a band above the easy one) still holds after this pass; what the easy
  // session can't take lengthens the longer session by one band (LONGER_BAND_MAX at most, its sessions as they are).
  const minutesOfRow = (p: ItemDraft) => (p.sessionsPerWeek ?? 0) * (p.durationBand ? practiceBandMinutes(p.durationBand) : 0);
  const bandIx = (band: PracticeBand | null | undefined): number => (band ? PRACTICE_BANDS.indexOf(band) : -1);
  // The room's promise (practicesThatFitOf: the focus at least twice a week at the stage's floor, every other practice
  // once): a focus whose method's band leaves it one session (building at D60 on a D45 floor, its share 90 minutes) trains
  // twice at a shorter band, never under the floor (D30 without one), within what the others leave it. A body plan's
  // harder and longer sessions keep their length (one long or hard session is the point of them).
  const head = ordered[0];
  if ((head.sessionsPerWeek ?? 0) < 2 && head.durationBand && !(head.catalogKey && BODY_SESSIONS_MAX[head.catalogKey] != null)) {
    const allotted = ceiling - ordered.slice(1).reduce((sum, p) => sum + minutesOfRow(p), 0);
    for (let b = bandIx(head.durationBand) - 1; b >= bandIx(floor ?? "D30"); b--) {
      const n = Math.floor(allotted / practiceBandMinutes(PRACTICE_BANDS[b]) + EPS);
      if (n < 2) continue;
      setSize(head, sizeAtBand(PRACTICE_BANDS[b], n));
      break;
    }
  }
  let left = ceiling - ordered.reduce((sum, p) => sum + minutesOfRow(p), 0);
  const longer = ordered.find((p) => p.catalogKey === "LONGER_SESSION" && !!p.durationBand) ?? null;
  const easy = ordered.find((p) => p.catalogKey === "EASY_SESSION") ?? null;
  const open = ordered.filter((p) => !(p.catalogKey && BODY_SESSIONS_MAX[p.catalogKey] != null) && (p.sessionsPerWeek ?? 0) < SESSIONS_MAX);
  for (let k = 0; left > EPS && k < open.length; k++) {
    const p = open[k];
    const was = minutesOfRow(p);
    const target = was + left / (open.length - k);
    let next = practiceSizeOf(sizedKindOf(p), target, p.durationBand ?? floor);
    const cap = longer ? bandIx(longer.durationBand) - 1 : -1;
    if (p === easy && longer && bandIx(next.band) > cap) {
      if (cap < Math.max(0, bandIx(p.durationBand))) continue;
      const under = PRACTICE_BANDS[cap];
      next = sizeAtBand(under, Math.max(p.sessionsPerWeek ?? 1, Math.floor(target / practiceBandMinutes(under) + EPS)));
    }
    const now = minutesOfSize(next);
    if (now <= was || now - was > left + EPS) continue;
    setSize(p, next);
    left -= now - was;
  }
  if (longer && easy && left > EPS) {
    const up = bandIx(longer.durationBand) + 1;
    const n = longer.sessionsPerWeek ?? 1;
    const more = up < PRACTICE_BANDS.length && up <= bandIx(LONGER_BAND_MAX) ? n * (practiceBandMinutes(PRACTICE_BANDS[up]) - practiceBandMinutes(longer.durationBand as PracticeBand)) : Infinity;
    if (more <= left + EPS) setSize(longer, sizeAtBand(PRACTICE_BANDS[up], n));
  }
  return alloc;
}

/** The longest a body plan's longer session grows from what the stage's other practices leave (allocate's leftover pass). */
const LONGER_BAND_MAX: PracticeBand = "D90";

/** A size at a given band: `sessions` a week, clamped to SESSIONS_MIN..SESSIONS_MAX, with its rule (practiceSizesOf's form). */
function sizeAtBand(band: PracticeBand, sessions: number): PracticeSize {
  const n = Math.min(SESSIONS_MAX, Math.max(1, Math.floor(sessions)));
  return { band, sessionsPerWeek: n, rule: n >= SESSIONS_MAX ? "DAILY" : `TARGET:${n}/W` };
}

/**
 * The weekly practice minutes code's practices may take while every judged
 * week of the window (WEEK_MIN_ELIGIBLE_DAYS open days or more) stays within
 * TIME_FITS_MAX of its available time beside its reviews, new cards and the
 * practices the user set (YOURS), as the time check reads them (the review
 * load reads no practice, so it is the time check's own); Infinity when no
 * week is judged. A partial week's room is read per open day.
 */
function fitsRoomOf(ms: MilestoneDraft, sim: Sim, ctx: Ctx, from: DayKey): number {
  const to = ms.dueDay;
  if (!to || from > to) return Infinity;
  const fixedMin = livePractices(ms)
    .filter((p) => p.planSource === "YOURS")
    .reduce((s, p) => s + sessionsPerWeekOf(p) * bandMinutesOf(p), 0);
  let room = Infinity;
  for (let w = weekStartKeyOf(from); w <= to; w = addDays(w, 7)) {
    const a = maxDay(w, from);
    const b = minDay(addDays(w, 6), to);
    const open = openDays(a, b, ctx.held);
    const available = (ctx.cap.weekMin * open) / 7;
    if (open < WEEK_MIN_ELIGIBLE_DAYS || !(available > 0)) continue;
    const other = sumIn(sim.review, sim, a, b) + sumIn(sim.write, sim, a, b);
    room = Math.min(room, ((TIME_FITS_MAX * available - other) * 7) / open - fixedMin);
  }
  return room;
}

/**
 * The kind a stage being started trains, as the practice progression reads
 * an accepted stage (a carried one): its first live catalog practice in item
 * order, which the build placed first (its focus). Start re-sizes the stage
 * with it weighed, as the plan was sized; null on a stage with no catalog
 * practice (an equal split, as rev 3).
 */
function rowFocusOf(ms: MilestoneDraft): string | null {
  return [...livePractices(ms)].sort((a, b) => a.ord - b.ord).find((p) => !!p.catalogKey)?.catalogKey ?? null;
}

/**
 * A plan the user writes, as the allocation weighs it (PlaceOpts.manual: no
 * progression is put on it): each stage holding the app's practices
 * (addStagePracticesOf placed them in the progression's priority, the focus
 * first) → the first of them in item order; a stage holding none is split
 * evenly, as rev 3 did.
 */
function placedFocusOf(plan: readonly MilestoneDraft[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const ms of plan) {
    const first = [...livePractices(ms)].sort((a, b) => a.ord - b.ord).find((p) => isProgressionRow(p));
    if (first?.catalogKey) out.set(ms.lineageId, first.catalogKey);
  }
  return out;
}

/**
 * The practice the allocation weighs first among a stage's sized ones: the
 * progression's focus kind; else, when the user re-typed it (an EDITED code
 * row of a kind the progression doesn't place), that row, which holds the
 * focus's place; else none (-1: an equal split).
 */
function leadPracticeOf(ms: MilestoneDraft, auto: readonly ItemDraft[], focus: string): number {
  const at = auto.findIndex((p) => p.catalogKey === focus);
  if (at >= 0) return at;
  const swap = swapsOf(ms, "PRACTICE", new Set(auto.filter((p) => isProgressionRow(p)).map((p) => p.catalogKey as string)))[0];
  return swap ? auto.indexOf(swap) : -1;
}

/** effTarget = round(KEEP_SHARE × planned units over [from, dueDay] after held days). */
function practiceTarget(p: ItemDraft, from: DayKey, to: DayKey, startDay: DayKey, held: ReadonlySet<DayKey>): number {
  const rule = ruleOf(p);
  if (!rule) return 0;
  return Math.round(KEEP_SHARE * plannedUnits(rule, { from, to, startDay }, held));
}

/** One PRACTICE_KEPT measure per practice (scoped by item lineage until Start); stale ones removed; CHECKPOINT kept. */
function syncPracticeMeasures(ms: MilestoneDraft, from: DayKey, ctx: Ctx): void {
  const practices = livePractices(ms);
  const keep: MeasureSpec[] = [];
  for (const m of ms.measures) {
    if (m.kind !== "PRACTICE_KEPT") keep.push(m);
  }
  for (const p of practices) {
    const prev = ms.measures.find((m) => m.kind === "PRACTICE_KEPT" && m.itemLineageId === p.lineageId);
    const target = practiceTarget(p, from, ms.dueDay!, ms.windowStart ?? from, ctx.held);
    keep.push({
      id: prev?.id ?? null,
      kind: "PRACTICE_KEPT",
      role: "PAYS",
      scope: { itemLineageIds: [p.lineageId], ...(prev?.scope.templateIds ? { templateIds: [...prev.scope.templateIds] } : {}) },
      minLevel: null,
      target,
      targetSource: "WORKED_OUT",
      fittedTarget: target,
      rateSource: null,
      baseline: null,
      baselineDay: null,
      unit: "session",
      itemLineageId: p.lineageId,
      measureKey: prev?.measureKey ?? null,
    });
  }
  ms.measures = keep;
}

// ═══ Fitting (F4 step 3, F6 step 9) ══════════════════════════════════════════

interface CardFit {
  level: number;
  target: number;
  baseline: number;
  raised: boolean;
}

/** A level and target that later rows on the same scope may not fall below, and the lineage that set it. */
interface Floor {
  level: number;
  target: number;
  lineageId: string;
}

/** The floor for a row of `lineageId`: the latest one met on its scope that another lineage set (never its own). */
function floorOf(met: readonly Floor[] | undefined, lineageId: string): Floor | null {
  if (!met) return null;
  for (let i = met.length - 1; i >= 0; i--) if (met[i].lineageId !== lineageId) return met[i];
  return null;
}

interface CardPlan {
  domains: { id: string; name: DomainName }[];
  key: string;
  scope: RealismScope;
  /** A typed target (YOURS): its level and target stand. */
  fixed: { level: number; target: number } | null;
}

/** Fits one card measure from `startL` down to the floor (the previous same-scope level, else THRESHOLDS[0]). */
function fitCard(cp: CardPlan, ms: MilestoneDraft, startL: number, prev: { level: number; target: number } | null, writing: Writing, ctx: Ctx): CardFit | null {
  const floorL = prev ? prev.level : THRESHOLDS[0];
  const candidates = sortedUnique([String(startL), ...THRESHOLDS.filter((L) => L < startL && L >= floorL).map(String)])
    .map(Number)
    .sort((a, b) => b - a);
  const eff = effectiveCards(cp.scope.cards, ctx.today);
  const written = writing.perDay.has(cp.key) ? (to: DayKey) => writtenThrough(writing, cp.key, to) : null;
  const intensity = INTENSITY[ctx.input.intensity];
  const rawL = Math.max(START_POINT_FLOOR[ctx.input.startPoint], thresholdByDays(ms.dueDay!, ctx.today, ctx.m) ?? THRESHOLDS[0]);
  for (const L of candidates) {
    if (L < floorL) continue;
    const reach = reachOf(eff, L, ms.dueDay!, ctx, written);
    const baseline = liveCount(cp.scope.cards, L);
    let target = baseline + Math.floor(intensity * (reach.expected - baseline) + EPS);
    if (target < baseline + minIncrementCards(baseline)) continue;
    let raised = prev != null && L === prev.level && rawL < prev.level;
    if (prev && prev.level === L && target < prev.target) {
      target = prev.target;
      raised = true;
    }
    return { level: L, target, baseline, raised };
  }
  return null;
}

/** The card plan of a milestone (null: no card measure possible — a track Area, or no resolved Domain). */
function cardPlanOf(ms: MilestoneDraft, ctx: Ctx, resetTyped: boolean): CardPlan | null {
  if (ctx.input.trackArea) return null;
  const carried = CARRIED.has(ms.status);
  const existing = cardMeasureOf(ms);
  if (carried) {
    if (!existing) return null;
    const scope = ctx.scopeOf(existing.scope.domainIds!);
    return { domains: [], key: scope.key, scope, fixed: { level: existing.minLevel!, target: existing.target } };
  }
  const domains = resolvedDomains(ms);
  if (domains.length === 0) return null;
  const scope = ctx.scopeOf(domains.map((d) => d.id));
  const typed = !resetTyped && existing && existing.targetSource === "YOURS" ? { level: existing.minLevel!, target: existing.target } : null;
  return { domains, key: scope.key, scope, fixed: typed };
}

function setNote(ms: MilestoneDraft, note: MilestoneNote, on: boolean): void {
  const has = ms.notes.includes(note);
  if (on && !has) ms.notes.push(note);
  if (!on && has) ms.notes = ms.notes.filter((n) => n !== note);
}

function setItemNote(i: ItemDraft, note: ItemDraft["notes"][number], on: boolean): void {
  const has = i.notes.includes(note);
  if (on && !has) i.notes.push(note);
  if (!on && has) i.notes = i.notes.filter((n) => n !== note);
}

const STUDY_METHODS: ReadonlySet<PracticeMethod> = new Set<PracticeMethod>(["READING", "DELIBERATE_PRACTICE"]);

/** The code-written study practice of a milestone (note STUDY_ADDED, origin CODE), if any. */
const studyItemOf = (ms: MilestoneDraft): ItemDraft | undefined => ms.items.find((i) => i.kind === "PRACTICE" && i.origin === CODE && i.notes.includes("STUDY_ADDED"));

function nextItemOrd(ms: MilestoneDraft): number {
  return ms.items.reduce((mx, i) => Math.max(mx, i.ord + 1), 0);
}

/**
 * "Study <Domain names>" where a card milestone has no READING or
 * DELIBERATE_PRACTICE practice, practices are allowed and a slot is free
 * (STUDY_ADDED); NO_STUDY_SLOT when all 3 slots are taken. Only on DRAFT rows:
 * an accepted milestone's structure is not changed here. A study practice
 * code added earlier follows its Domains' names, and leaves (removed) when
 * the milestone no longer needs it.
 */
function syncStudyPractice(ms: MilestoneDraft, domains: { id: string; name: DomainName }[] | null, ctx: Ctx, makeId?: () => string): void {
  if (ms.status !== "DRAFT") return;
  const study = studyItemOf(ms);
  const others = livePractices(ms).filter((p) => p !== study);
  const needs = ctx.input.practicesAllowed && domains != null && domains.length > 0 && !others.some((p) => p.method != null && STUDY_METHODS.has(p.method));
  const free = others.length < PRACTICES_PER_MILESTONE;
  setNote(ms, "NO_STUDY_SLOT", needs && !free);
  if (needs && free) {
    const label = codeText("Study {domains}", { domains: domains!.map((d) => d.name) });
    if (study) {
      // A study practice the user removed stays removed (it is not added again); one they edited keeps their words.
      if (study.decision !== "REMOVED" && provenanceOf(study.origin, study.decision) === "WORKED_OUT") study.label = label;
      return;
    }
    // Without an injected id source the lineage is derived from the milestone's, so a re-fit keeps it (≤ 64 characters).
    ms.items.push(practiceItem(makeId ? makeId() : `${ms.lineageId.slice(0, 58)}-study`, nextItemOrd(ms), label, "READING", ["STUDY_ADDED"]));
    return;
  }
  if (study && provenanceOf(study.origin, study.decision) === "WORKED_OUT") ms.items = ms.items.filter((i) => i !== study);
}

function practiceItem(lineageId: string, ord: number, label: string, method: PracticeMethod, notes: ItemDraft["notes"]): ItemDraft {
  return {
    id: null,
    lineageId,
    kind: "PRACTICE",
    ord,
    label,
    rawLabel: null,
    origin: CODE,
    decision: CODE_DECISION,
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: "WORKED_OUT",
    checkpointKind: null,
    outOf: null,
    bar: null,
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [...notes],
  };
}

/**
 * Code's numbers on a validated draft (F4 steps 3 and 5, F6 step 9):
 * thresholds (never falling below the previous row on the same scope, of
 * another lineage; carried rows included, so a re-plan's rows are fitted
 * with its carried ones), fitted targets at the intensity, practice
 * sessions, bands and rules, and the "Study <Domains>" practice where a slot
 * is free (STUDY_ADDED, or NO_STUDY_SLOT). Structure, labels and decisions are kept.
 *
 * Also: one PRACTICE_KEPT measure per practice (effTarget = round(0.8 ×
 * planned units over the window after held days)), CHECKPOINT measures kept,
 * RAISED on the scope's Domain items when the level or target was held from
 * falling, CARDS_TOO_SMALL when a card measure is dropped, NOT_MEASURABLE
 * when no paying measure is left, and code-written titles (origin CODE, not
 * edited) re-written from their template with the fitted level.
 *
 * Revision 4: a depth plan (input.depth set on a Field Area) takes the depth
 * branch (fitDepth): its card targets are the depth's counts and are never
 * fitted, scaled or lowered; it re-stamps baselines, keeps each key's `r`/`rc`
 * segment, re-renders code titles, puts the practice progression on every
 * DRAFT stage (contracts §20: its practices, steps and checkpoint, within the
 * stage's room) and allocates practices never below the stage's band floor,
 * beside the writing the date check sets. A revision-4 track plan (its rows
 * on STAGE_1..STAGE_5, with the intake given) gets the progression too, then
 * rev 3's allocation.
 */
export function fitPlan(plan: readonly MilestoneDraft[], input: RealismInput, opts: PlaceOpts = {}): MilestoneDraft[] {
  if (isTopicsInput(input)) return fitChain(plan, input, depthPlaceOf(opts)); // Revision 5, lane 7: the chain (before the depth engine).
  if (isDepthInput(input)) return fitDepth(plan, input, depthPlaceOf(opts));
  return fitRows(plan, input, opts);
}

/**
 * What the re-fits read besides the plan (confirm to unlock, contracts §19;
 * the practice progression, contracts §20): the kinds the plan's gate blocks
 * (R4 passes ActivityGate.blocked), never placed; the plan's intake (R4
 * passes it: the exam, the aim's words and a track plan's track, without
 * which a track plan's progression isn't re-synced and a depth plan's exam
 * is read off its rows); Gemini's picks (a v4 reply's), over each stage's
 * GEMINI_PICK row.
 */
export interface PlaceOpts {
  excluded?: Iterable<CatalogKey>;
  intake?: Intake | null;
  picks?: unknown;
  /**
   * A plan the user writes ("Write it myself", an "Edit by hand" re-plan: the
   * lead's ruling 6; R4 passes it when a MANUAL run wrote the rows): a re-fit
   * never fills it. No stage gains a practice, step or checkpoint of code's
   * and none of code's leaves; the re-fit only sizes what the stages hold
   * (the app's practices the user asked for on a stage, addStagePracticesOf,
   * weighed by their focus as they were placed). Absent or false: the
   * practice progression is put on every DRAFT stage, as before.
   */
  manual?: boolean;
}

/** The kinds a re-fit never places: `excluded`, and with the intake its own gate (activityGateOf) too. */
const placeBlockedOf = (opts: PlaceOpts): Set<CatalogKey> => blockedKindsOf(opts.intake ?? null, { excluded: opts.excluded });

/** fitDepth's options for a re-fit (PlaceOpts): the blocked kinds, the intake and the picks; a plan the user writes is never synced (`manual`). */
const depthPlaceOf = (opts: PlaceOpts): { excluded: Set<CatalogKey>; intake: Intake | null | undefined; picks: unknown; sync: boolean } => ({
  excluded: placeBlockedOf(opts),
  intake: opts.intake,
  picks: opts.picks,
  sync: opts.manual !== true,
});

/** A revision-4 track plan with its intake: rows on the track stages (STAGE_1..STAGE_5). */
const isTrackStagePlan = (plan: readonly MilestoneDraft[], input: RealismInput, intake: Intake | null | undefined): intake is Intake =>
  input.trackArea && intake != null && intake.fieldId == null && plan.some((ms) => ms.stage != null && (TRACK_STAGE_KEYS as readonly string[]).includes(ms.stage));

/**
 * rev 3's fit (fitWith), after the practice progression on a revision-4 track plan's DRAFT stages (contracts §20); a plan
 * the user writes (PlaceOpts.manual) is sized as it stands, the app's practices on it weighed by their focus.
 */
function fitRows(plan: readonly MilestoneDraft[], input: RealismInput, opts: PlaceOpts, fitOpts: { resetTyped?: boolean; makeId?: () => string } = {}): MilestoneDraft[] {
  if (!isTrackStagePlan(plan, input, opts.intake)) return fitWith(plan, input, fitOpts);
  if (opts.manual === true) return fitWith(plan, input, { ...fitOpts, focus: placedFocusOf(plan) });
  const out = plan.map(cloneMilestone);
  const { state, ctx } = roomStateOf(out, input);
  const focus = syncRowsInPlace(out, rowProgressionCtxOf(opts.intake.track, input, opts.intake, out, placeBlockedOf(opts), roomOf(state, ctx), { picks: opts.picks, makeId: fitOpts.makeId }));
  return fitWith(out, input, { ...fitOpts, focus });
}

/** rev 3's fit; `focus` (lineage → the progression's focus kind) weighs each stage's allocation (allocate). */
function fitWith(plan: readonly MilestoneDraft[], input: RealismInput, opts: { resetTyped?: boolean; makeId?: () => string; focus?: ReadonlyMap<string, string> }): MilestoneDraft[] {
  const ctx = contextOf(input);
  const out = plan.map(cloneMilestone);
  const order = planOrder(out);
  const cps = out.map((ms) => (inPlan(ms) ? cardPlanOf(ms, ctx, opts.resetTyped === true && fittable(ms)) : null));
  const fits = new Map<number, CardFit | null>();

  // The fitting loop: shares depend on every L, and L only ever falls, so it settles.
  const usesNow = (): CardUse[] => {
    const uses: CardUse[] = [];
    for (const idx of order) {
      const cp = cps[idx];
      const ms = out[idx];
      if (!cp) continue;
      const level = cp.fixed ? cp.fixed.level : fits.has(idx) ? (fits.get(idx)?.level ?? null) : thresholdFor(ms.dueDay!, ctx.today, input.startPoint, null, ctx.m);
      if (level == null) continue;
      uses.push({ key: cp.key, scope: cp.scope, level, dueDay: ms.dueDay!, lastCardDay: addDays(ms.dueDay!, -floorBase(level, ctx.m)) });
    }
    return uses;
  };
  const end = horizonOf(out, input);
  for (let iter = 0; iter < 16; iter++) {
    const writing = writingOf(usesNow(), ctx, end);
    // The never-falls floor: per scope, the rows met so far in plan order. A row is held to the latest of them
    // of ANOTHER lineage (fix round 2): a "Start again" copy re-attempts its dropped original's place, it does
    // not follow it along the plan, so the original's level and target never floor the copy (nor would a
    // stale re-plan row be floored by its own started row). Rows after the place follow the last row met there.
    const prevByScope = new Map<string, Floor[]>();
    const hold = (key: string, floor: Floor) => {
      const list = prevByScope.get(key);
      if (list) list.push(floor);
      else prevByScope.set(key, [floor]);
    };
    let changed = false;
    for (const idx of order) {
      const cp = cps[idx];
      const ms = out[idx];
      if (!cp) continue;
      if (cp.fixed || !fittable(ms)) {
        if (cp.fixed) hold(cp.key, { ...cp.fixed, lineageId: ms.lineageId });
        continue;
      }
      const prev = floorOf(prevByScope.get(cp.key), ms.lineageId);
      let startL: number | null;
      if (!fits.has(idx)) startL = thresholdFor(ms.dueDay!, ctx.today, input.startPoint, prev?.level ?? null, ctx.m);
      else startL = fits.get(idx)?.level ?? null;
      if (startL == null) continue;
      if (prev && startL < prev.level) startL = prev.level;
      const fit = fitCard(cp, ms, startL, prev, writing, ctx);
      const before = fits.has(idx) ? (fits.get(idx)?.level ?? null) : undefined;
      if (before !== (fit ? fit.level : null) || !fits.has(idx)) changed = true;
      fits.set(idx, fit);
      if (fit) hold(cp.key, { level: fit.level, target: fit.target, lineageId: ms.lineageId });
    }
    if (!changed) break;
  }

  // Card measures, notes and the study practice.
  for (const idx of order) {
    const ms = out[idx];
    if (!fittable(ms)) continue;
    const cp = cps[idx];
    const existing = cardMeasureOf(ms);
    const others = ms.measures.filter((m) => m !== existing && m.kind !== "CARDS_AT_LEVEL");
    let measure: MeasureSpec | null = null;
    let raised = false;
    if (cp?.fixed) {
      const ids = cp.scope.domainIds;
      measure = {
        ...(existing ? cloneMeasure(existing) : blankCardMeasure()),
        scope: { domainIds: [...ids] },
        minLevel: cp.fixed.level,
        target: cp.fixed.target,
        targetSource: "YOURS",
        rateSource: cp.scope.rateSource,
        baseline: liveCount(cp.scope.cards, cp.fixed.level),
        baselineDay: ctx.today,
        unit: "card",
        measureKey: cardsAtLevelKey(ids, cp.fixed.level),
      };
    } else if (cp && fits.get(idx)) {
      const fit = fits.get(idx)!;
      const ids = cp.scope.domainIds;
      raised = fit.raised;
      measure = {
        ...(existing ? cloneMeasure(existing) : blankCardMeasure()),
        scope: { domainIds: [...ids] },
        minLevel: fit.level,
        target: fit.target,
        targetSource: "WORKED_OUT",
        fittedTarget: fit.target,
        rateSource: cp.scope.rateSource,
        baseline: fit.baseline,
        baselineDay: ctx.today,
        unit: "card",
        measureKey: cardsAtLevelKey(ids, fit.level),
      };
    }
    ms.measures = measure ? [measure, ...others] : others;
    setNote(ms, "CARDS_TOO_SMALL", cp != null && !cp.fixed && measure == null);
    const scopeIds = new Set(cp?.scope.domainIds ?? []);
    for (const i of ms.items) if (i.kind === "DOMAIN") setItemNote(i, "RAISED", raised && i.domainId != null && scopeIds.has(i.domainId) && liveItem(i));
    // The study practice follows the milestone's resolved Domains (a card milestone), even when its card measure was too small.
    syncStudyPractice(ms, cp ? cp.domains : null, ctx, opts.makeId);
    if (measure && cp && ms.titleOrigin === CODE && provenanceOf(CODE, ms.titleDecision) === "WORKED_OUT" && cp.domains.length > 0) {
      ms.title = codeText("{domains} to level {L}+", { domains: cp.domains.map((d) => d.name), level: measure.minLevel! });
    } else if (!measure && cp && ms.titleOrigin === CODE && provenanceOf(CODE, ms.titleDecision) === "WORKED_OUT" && cp.domains.length > 0) {
      ms.title = codeText("Study {domains}", { domains: cp.domains.map((d) => d.name) });
    }
  }

  // Load with the final levels, then practices.
  const state = planStateOf(out, ctx);
  for (const idx of order) {
    const ms = out[idx];
    if (!fittable(ms)) continue;
    const from = maxDay(ms.windowStart!, ctx.today);
    allocate(ms, state.sim, ctx, from, null, opts.focus?.get(ms.lineageId) ?? null);
    syncPracticeMeasures(ms, from, ctx);
    setNote(ms, "NOT_MEASURABLE", !ms.measures.some((m) => m.role === "PAYS"));
  }
  return out;
}

function blankCardMeasure(): MeasureSpec {
  return {
    id: null,
    kind: "CARDS_AT_LEVEL",
    role: "PAYS",
    scope: {},
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
  };
}

// ═══ Feasibility (F4 steps 2, 4, 6–9) ═══════════════════════════════════════

const SEVERITY: Readonly<Record<KnowledgeVerdict | TimeVerdict, number>> = { FITTED: 0, FITS: 1, TIGHT: 2, OVER: 3, IMPOSSIBLE: 4 };
const worse = <T extends KnowledgeVerdict | TimeVerdict>(a: T, b: T): T => (SEVERITY[b] > SEVERITY[a] ? b : a);

function paceLine(scope: RealismScope, shared: boolean): string {
  const rate = scope.rate ?? 0;
  const per = `${Math.round(rate * 10) / 10} a week`;
  const sharedNote = shared ? ", shared with the plan's other Domains while both are being written" : "";
  switch (scope.rateSource) {
    case "SCOPE":
      return `New cards at your pace in these Domains, ≈ ${per} (median of your weeks)${sharedNote}.`;
    case "FIELD":
      return `New cards at your Field's pace, ≈ ${per}${sharedNote}.`;
    case "YOURS":
      return `New cards at your rate of ${per} (your rate, not yet measured)${sharedNote}.`;
    default:
      return "New cards aren't counted: no pace yet — enter a weekly number or refit after 4 weeks.";
  }
}

function passLine(pr: PassRate): string {
  return pr.calibrating
    ? `Your pass rate is still calibrating (${pr.n} of ${pr.need} reviews), so the expected reach is the best case.`
    : `Pass rate ${pct(pr.p)} over the last 28 days, applied to every pass a card still needs (lapses by neglect aren't logged, so this reads high).`;
}

/** The fit held this measure's level or target up from its floor: RAISED on a live Domain item of its scope. */
function raisedOn(ms: MilestoneDraft, measure: MeasureSpec): boolean {
  const ids = new Set(measure.scope.domainIds ?? []);
  return ms.items.some((i) => i.kind === "DOMAIN" && liveItem(i) && i.domainId != null && ids.has(i.domainId) && i.notes.includes("RAISED"));
}

/**
 * One card measure's "Targets vs your pace". A target code fits now reads
 * FITTED with its arithmetic (a verdict would be true by construction). A
 * started milestone's target is not fitted now (fix round 2): it was frozen
 * at Start, and today's reach can have moved away from it, so it is judged
 * like a typed one (FITS, TIGHT or OVER against today's expected and best),
 * in words that say it was fixed at Start, never "Fitted at …" or "Kept at
 * …" (neither is its arithmetic any more). It still never blocks the plan
 * (feasibilityWith judges only the rows the plan can change). `started`:
 * the row is carried (STARTING or STARTED); refitForStart passes false for
 * the milestone being started, which is judged as it was accepted.
 */
function knowledgeCheckOf(ms: MilestoneDraft, measure: MeasureSpec, state: PlanState, ctx: Ctx, started: boolean): KnowledgeCheck {
  const L = measure.minLevel!;
  const d = ms.dueDay!;
  const scope = ctx.scopeOf(measure.scope.domainIds!);
  const eff = effectiveCards(scope.cards, ctx.today);
  const written = state.writing.perDay.has(scope.key) ? (to: DayKey) => writtenThrough(state.writing, scope.key, to) : null;
  const reach = reachOf(eff, L, d, ctx, written);
  const target = measure.target;
  const baseline = measure.baseline ?? liveCount(scope.cards, L);
  const typed = measure.targetSource === "YOURS";
  const fitted = !typed && !started;
  let verdict: KnowledgeVerdict;
  if (target > reach.strictMax) verdict = "IMPOSSIBLE";
  else if (fitted) verdict = "FITTED";
  else if (target <= reach.expected + EPS) verdict = "FITS";
  else if (target <= reach.best) verdict = "TIGHT";
  else verdict = "OVER";

  const basis: string[] = [];
  const by = dayText(d);
  if (verdict === "IMPOSSIBLE") {
    const floor = floorStrict(L, ctx.m);
    const newCanReach = addDays(ctx.today, floor) <= d;
    basis.push(
      newCanReach
        ? `The app can't show ${target} cards at level ${L} by ${by}: even if every review passes on its day, at most ${reach.strictMax} can get there (${reach.existingStrict} of your cards and ${reach.newBest} new ones). Move the date or use a lower level.`
        : `The app can't show ${target} cards at level ${L} by ${by}: a new card needs at least ${floor} days to get there here, and only ${reach.existingStrict} of your cards can make it in time. Move the date or use a lower level.`
    );
  } else if (fitted) {
    const I = INTENSITY[ctx.input.intensity];
    const formula = baseline + Math.floor(I * (reach.expected - baseline) + EPS);
    basis.push(
      reach.bestCase
        ? `Fitted at ${INTENSITY_WORD[ctx.input.intensity]}: ${baseline} now, plus ${pct(I)} of the ${Math.max(0, reach.best - baseline)} more your reviews could bring to level ${L} by ${by} if every review passes = ${formula}. Best case: your pass rate is still calibrating.`
        : `Fitted at ${INTENSITY_WORD[ctx.input.intensity]}: ${baseline} now, plus ${pct(I)} of the ≈ ${Math.max(0, Math.round(reach.expected - baseline))} more your reviews can be expected to bring to level ${L} by ${by} = ${formula}. Best case ${reach.best}, if every review passes on its day.`
    );
    // Why the target isn't today's formula: the fit held it up (RAISED on the scope's Domains), or it was worked
    // out on an earlier day (a draft reviewed later, the Start sheet's re-check). Never claim the floor for the second.
    if (target !== formula) {
      basis.push(
        raisedOn(ms, measure)
          ? `Kept at ${target}, so the level and target on these Domains never fall along the plan.`
          : `Worked out at ${target} on an earlier day; with today's figures it would be ${formula}.`
      );
    }
  } else {
    const phrase =
      verdict === "FITS"
        ? `within what your reviews can be expected to bring to level ${L} by ${by}`
        : verdict === "TIGHT"
          ? "reachable only if every review passes on its day"
          : "more than even the best case";
    const whose = typed ? `Your target ${target}` : `Target ${target}, fixed when this milestone started`;
    basis.push(`${whose}: ${phrase}. Expected ≈ ${Math.round(reach.expected)}; best case ${reach.best}${reach.bestCase ? " (your pass rate is still calibrating)" : ""}.`);
  }
  basis.push(paceLine(scope, state.writing.shared.has(scope.key)));
  if (sourceKeyOf(scope)) {
    basis.push(
      reach.lastCardDay >= ctx.today
        ? `New cards written after ${dayText(reach.lastCardDay)} can't reach level ${L} by ${by}.`
        : `No new card can reach level ${L} by ${by}: it needs ${floorBase(L, ctx.m)} days.`
    );
  }
  basis.push(passLine(ctx.pr));

  let earliestDay: DayKey | null = null;
  if (verdict === "IMPOSSIBLE") {
    earliestDay = earliestFeasibleDay(eff, L, target, ctx, meanShare(state.writing, scope.key, scope, ctx.held, state.uses));
    basis.push(earliestDay ? `The earliest it fits is ${dowText(earliestDay)}.` : "No date within 3 years fits it.");
  }
  return {
    measureKey: measure.measureKey ?? cardsAtLevelKey(scope.domainIds, L),
    level: L,
    verdict,
    target,
    fitted: typed ? null : target,
    baseline,
    expected: round1(reach.expected),
    best: reach.best,
    strictMax: reach.strictMax,
    bestCase: reach.bestCase,
    earliestDay,
    lastCardDay: reach.lastCardDay,
    basis,
  };
}

function capacityPhrase(cap: Capacity, hours: number): string {
  const a = cap.aMeasured ? `${pct(cap.a)} kept` : `${DECLARED_FACTOR}`;
  if (cap.rampCap == null) return `you said ${hours} h × ${a} while your hours are calibrating (${cap.trackedHave} of ${CALIBRATION_WEEKS} weeks)`;
  const aPart = cap.aMeasured ? a : `${a} while your recurring tasks are calibrating`;
  return `your ${hours} h × ${aPart}${cap.rampBinds ? `, capped at +50% of the ${hm(cap.trackedMedian ?? 0)} you track` : ""}`;
}

function rampLine(cap: Capacity, hours: number): string {
  const allowance = cap.rampCap === RAMP_FLOOR_MIN ? "at least 2 h" : hm(cap.rampCap ?? 0);
  const line = `You've tracked ${hm(cap.trackedMedian ?? 0)} a week of tasks (task estimates). Plans may add up to +50% (${allowance}) until your tracked time grows; you said ${hours} h.`;
  // Several goals share one person's week (contracts §23.3): the ramp binds them all, and this goal plans on its share.
  return cap.share < 1 ? `${line} Your tracked time limits all your goals; this one plans on ${pct(cap.share)} of it, ${hm(cap.weekMin)} a week.` : line;
}

interface WeekRow {
  week: PlanWeek;
  load: WeekLoad;
  open: number;
}

/** A writer the per-week plan counts: a writing scope's key (a Domain id on a depth plan) and the last day its cards count for this milestone. */
interface WeekWriter {
  key: string;
  lastCardDay: DayKey;
}

/**
 * The milestone's per-week plan. `writers` (a depth plan: every required
 * Domain, uncut, since its writing serves the later stages too) replaces the
 * rev-3 default (the milestone's card scope, cut at its lastCardDay).
 */
function weeksOf(ms: MilestoneDraft, from: DayKey, state: PlanState, ctx: Ctx, writers?: readonly WeekWriter[]): WeekRow[] {
  const out: WeekRow[] = [];
  const to = ms.dueDay!;
  if (from > to) return out;
  let ws: WeekWriter[];
  if (writers) ws = [...writers];
  else {
    const cm = cardMeasureOf(ms);
    ws = cm ? [{ key: ctx.scopeOf(cm.scope.domainIds!).key, lastCardDay: addDays(to, -floorBase(cm.minLevel!, ctx.m)) }] : [];
  }
  const cumAt = (wr: WeekWriter, d: DayKey) => (d >= ctx.today ? Math.floor(writtenThrough(state.writing, wr.key, minDay(d, wr.lastCardDay)) + EPS) : 0);
  for (let w = weekStartKeyOf(from); w <= to; w = addDays(w, 7)) {
    const a = maxDay(w, from);
    const b = minDay(addDays(w, 6), to);
    const open = openDays(a, b, ctx.held);
    const reviewMin = sumIn(state.sim.review, state.sim, a, b);
    const writeMin = sumIn(state.sim.write, state.sim, a, b);
    const practiceMin = practiceMinutesIn(ms, a, b, ctx.held);
    const availableMin = (ctx.cap.weekMin * open) / 7;
    let newPerWeek = 0;
    for (const wr of ws) if (a <= wr.lastCardDay) newPerWeek += cumAt(wr, b) - cumAt(wr, addDays(a, -1));
    out.push({
      week: { weekStart: w, newPerWeek, practiceMin: round1(practiceMin), reviewMin: round1(reviewMin), availableMin: round1(availableMin), availableClass: ctx.cap.class },
      load: { weekStart: w, reviewMin: round1(reviewMin), writeMin: round1(writeMin), practiceMin: round1(practiceMin), availableMin: round1(availableMin), availableClass: ctx.cap.class },
      open,
    });
  }
  return out;
}

function timeCheckOf(ms: MilestoneDraft, from: DayKey, rows: readonly WeekRow[], state: PlanState, ctx: Ctx, floor: PracticeBand | null = null): TimeCheck {
  const hours = ctx.input.hoursPerWeek;
  let worst: WeekRow | null = null;
  let worstRatio = -1;
  for (const r of rows) {
    if (r.open < WEEK_MIN_ELIGIBLE_DAYS || !(r.load.availableMin! > 0)) continue;
    const ratio = (r.load.reviewMin + r.load.writeMin + r.load.practiceMin) / r.load.availableMin!;
    if (ratio > worstRatio + EPS) {
      worstRatio = ratio;
      worst = r;
    }
  }
  let verdict: TimeVerdict = worst == null || worstRatio <= TIME_FITS_MAX ? "FITS" : worstRatio <= TIME_TIGHT_MAX ? "TIGHT" : "OVER";
  const basis: string[] = [];
  if (worst) {
    const need = worst.load.reviewMin + worst.load.writeMin + worst.load.practiceMin;
    const heldThatWeek = 7 - openDays(worst.week.weekStart, addDays(worst.week.weekStart, 6), ctx.held);
    const heldNote = heldThatWeek > 0 ? `; ${plural(heldThatWeek, "day", "days")} held that week` : "";
    basis.push(
      ctx.cap.rampCap == null
        ? `Worst week (from ${dayText(worst.week.weekStart)}) needs ${hm(need)}; ${capacityPhrase(ctx.cap, hours)}: ${hm(worst.load.availableMin ?? 0)}${heldNote}.`
        : `Worst week (from ${dayText(worst.week.weekStart)}) needs ${hm(need)}; you have ${hm(worst.load.availableMin ?? 0)} (${capacityPhrase(ctx.cap, hours)})${heldNote}.`
    );
  } else {
    basis.push(`No week in this window has ${WEEK_MIN_ELIGIBLE_DAYS} or more open days to judge.`);
  }
  if (ctx.cap.rampBinds) basis.push(rampLine(ctx.cap, hours));
  const heldDays = openDays(from, ms.dueDay!, new Set<DayKey>()) - openDays(from, ms.dueDay!, ctx.held);
  if (heldDays > 0) basis.push(`${plural(heldDays, "day", "days")} held (rest, sick or vacation) in this window lower the time available.`);

  const alloc = allocationOf(ms, state.sim, ctx, from, floor);
  if (alloc.cut) {
    verdict = "OVER";
    basis.push(
      floor
        ? `Even one ${practiceBandMinutes(floor)}-minute session a week of each practice doesn't fit beside the reviews and new cards, with the new cards already slowed as far as they help: cut a practice or raise hours.`
        : "Even one 15-minute session a week of each practice doesn't fit beside the reviews and new cards: cut a practice or raise hours."
    );
  }
  // Cross-checks (each may raise FITS to TIGHT).
  const clearance = ctx.input.throughput.clearance;
  const writes = sumIn(state.sim.write, state.sim, from, ms.dueDay!) > EPS;
  if (clearance.kind === "measured" && clearance.value < CLEARANCE_MIN && writes) {
    const open = Math.max(1, openDays(from, ms.dueDay!, ctx.held));
    const perDay = Math.max(1, Math.round(sumIn(state.sim.newReviews, state.sim, from, ms.dueDay!) / open));
    basis.push(`Clear your queue first: new cards would add ≈ ${perDay} reviews a day to a queue you clear ${pct(clearance.value)} of.`);
    verdict = worse(verdict, "TIGHT");
  }
  const adherence = ctx.input.throughput.adherence;
  const sessions = Math.round(livePractices(ms).reduce((s, p) => s + sessionsPerWeekOf(p), 0));
  if (adherence.kind === "measured" && adherence.value < ADHERENCE_LOW && sessions >= ADHERENCE_LOW_SESSIONS) {
    basis.push(`Your recurring tasks of 20 min or more are kept ${pct(adherence.value)} of the time; this adds ${plural(sessions, "session", "sessions")} a week.`);
    verdict = worse(verdict, "TIGHT");
  }
  if (ctx.cap.unverified) basis.push("Unverified: your tracked time or your recurring tasks are still calibrating.");
  return { verdict, unverified: ctx.cap.unverified, ratio: worst ? Math.round(worstRatio * 100) / 100 : null, worstWeek: worst ? worst.load : null, basis };
}

/** `started`: judge its targets as a started milestone's (default: the row is carried); refitForStart passes false. */
function milestoneFeasibilityOf(ms: MilestoneDraft, state: PlanState, ctx: Ctx, fromOverride?: DayKey, started: boolean = CARRIED.has(ms.status)): MilestoneFeasibility {
  const from = fromOverride ?? maxDay(ms.windowStart!, ctx.today);
  const knowledge = ms.measures
    .filter((m) => m.kind === "CARDS_AT_LEVEL" && m.role === "PAYS" && m.minLevel != null && (m.scope.domainIds?.length ?? 0) > 0)
    .map((m) => knowledgeCheckOf(ms, m, state, ctx, started));
  const rows = weeksOf(ms, from, state, ctx);
  const time = timeCheckOf(ms, from, rows, state, ctx);
  let worst: KnowledgeVerdict | TimeVerdict = time.verdict;
  for (const k of knowledge) if (SEVERITY[k.verdict] > SEVERITY[worst]) worst = k.verdict;
  const basis: string[] = [];
  if (!ms.measures.some((m) => m.role === "PAYS")) basis.push("No measurable part — add a Domain or a practice.");
  // Step 8's notes, on the milestone too: the page renders a milestone's basis ("Worked out"), never the plan-level list.
  basis.push(...planNotesOf(ctx));
  return {
    kind: "PLAN",
    lineageId: ms.lineageId,
    ord: ms.ord,
    knowledge,
    time,
    worst,
    basis,
    remedies: [],
    weeks: rows.map((r) => r.week),
    lastCardDay: knowledge[0]?.lastCardDay ?? null,
  };
}

/**
 * Step 8's two notes that raise nothing (the cross-checks that can raise a
 * verdict sit in each time check's basis): the review spacing when m ≠ 1
 * (it moves every reach and every review) and the Area in maintenance.
 */
function planNotesOf(ctx: Ctx): string[] {
  const out: string[] = [];
  if (!ctx.input.trackArea && Math.abs(ctx.m - 1) > EPS) out.push(spacingLine(ctx.m));
  if (ctx.input.areaInMaintenance) out.push(MAINTENANCE_LINE);
  return out;
}
const spacingLine = (m: number): string => `Review spacing is × ${Math.round(m * 100) / 100} with your loadout.`;
const MAINTENANCE_LINE = "This Field is in maintenance: it is excused from quotas and Boss.";

function aimCheckOf(ctx: Ctx): AimCheck {
  const { typicalHours, typicalHoursSource } = ctx.input;
  if (typicalHours == null || !(typicalHours > 0)) return { kind: "unchecked" };
  const minutes = (ctx.cap.weekMin * openDays(ctx.today, ctx.input.targetDay, ctx.held)) / 7;
  const hours = minutes / 60;
  return { kind: "checked", coverHours: Math.min(typicalHours, Math.round(hours)), typicalHours, source: typicalHoursSource, coversAll: hours >= typicalHours };
}

function feasibilityWith(plan: readonly MilestoneDraft[], input: RealismInput, withRemedies: boolean): Feasibility {
  if (isTopicsInput(input)) return judgeChain(plan, input, withRemedies).fe; // Revision 5, lane 7.
  if (isDepthInput(input)) return judgeDepth(plan, input, withRemedies).fe;
  return judgePlan(plan, input, withRemedies).fe;
}

/** The checks, and the entries of the rows the plan can still change (`open`: what the flags and the remedies' promises judge). */
function judgePlan(plan: readonly MilestoneDraft[], input: RealismInput, withRemedies: boolean): { fe: Feasibility; open: MilestoneFeasibility[] } {
  const ctx = contextOf(input);
  const state = planStateOf(plan, ctx);
  const milestones: MilestoneFeasibility[] = [];
  // The plan's flags judge the rows it can still change: a carried (STARTING or STARTED) milestone is
  // reported, and its load counts, but it never blocks accepting a re-plan of the rest. Judged per row,
  // never per lineage: a PLANNED "Start again" copy is open although its dropped original is carried.
  const open: MilestoneFeasibility[] = [];
  const judged: { mf: MilestoneFeasibility; carried: boolean }[] = [];
  for (const idx of planOrder(plan)) {
    const ms = plan[idx];
    if (!inPlan(ms) || ms.dueDay! < ctx.today) continue;
    const mf = milestoneFeasibilityOf(ms, state, ctx);
    judged.push({ mf, carried: CARRIED.has(ms.status) });
    if (!CARRIED.has(ms.status)) open.push(mf);
  }
  // Plan order, except that a row the plan can still change comes before a carried row of its own lineage
  // (a PLANNED "Start again" copy before its dropped original, which share an ord): every caller finds a
  // draft or planned row's entry by lineage, and must get that row's, never the carried one's.
  const placed = new Set<number>();
  for (let i = 0; i < judged.length; i++) {
    if (placed.has(i)) continue;
    if (judged[i].carried) {
      for (let j = i + 1; j < judged.length; j++) {
        if (placed.has(j) || judged[j].carried || judged[j].mf.lineageId !== judged[i].mf.lineageId) continue;
        milestones.push(judged[j].mf);
        placed.add(j);
      }
    }
    milestones.push(judged[i].mf);
  }
  const aimCheck = aimCheckOf(ctx);
  const basis: string[] = [];
  if (input.trackArea) basis.push("Practice only: the plan counts the sessions you tick, not cards.");
  else basis.push(passLine(ctx.pr));
  if (!input.trackArea && Math.abs(ctx.m - 1) > EPS) basis.push(spacingLine(ctx.m));
  if (input.areaInMaintenance) basis.push(MAINTENANCE_LINE);
  basis.push(
    aimCheck.kind === "unchecked"
      ? "Aim not checked: the app doesn't know how long this usually takes."
      : aimCheck.coversAll
        ? `Your hours cover all of the ${aimCheck.typicalHours} h you entered${aimCheck.source ? ` (source: ${aimCheck.source})` : ""}.`
        : `Your hours cover ${aimCheck.coverHours} of the ${aimCheck.typicalHours} h you entered${aimCheck.source ? ` (source: ${aimCheck.source})` : ""}.`
  );
  const impossible = open.some((m) => m.worst === "IMPOSSIBLE");
  const over = open.some((m) => m.time.verdict === "OVER" || m.knowledge.some((k) => k.verdict === "OVER"));
  const remedies = withRemedies && (impossible || over) ? remediesFor(plan, input, open) : [];
  for (const m of open) m.remedies = m.worst === "IMPOSSIBLE" || m.worst === "OVER" ? [...remedies] : [];
  return { fe: { today: ctx.today, m: ctx.m, milestones, aimCheck, basis, remedies, impossible, over }, open };
}

/**
 * The checks for a plan (F4 steps 4–9): knowledge per measure, time per worst week, the aim check, cross-checks, remedies, per-week plans.
 *
 * One MilestoneFeasibility per scheduled milestone not yet past its due day,
 * in plan order (carried ones included, for their load). `impossible`,
 * `over` and the remedies judge the milestones the plan can still change,
 * row by row (fix round). Where a lineage has both, the row the plan can
 * still change is listed before the carried one (a PLANNED "Start again"
 * copy before its dropped original), so a lookup by lineageId finds it.
 * A carried row's target was frozen at Start, so it is judged against
 * today's reach (FITS, TIGHT, OVER or IMPOSSIBLE; fix round 2), never
 * FITTED, and its basis says it was fixed at Start.
 *
 * Revision 4: a depth plan is judged by judgeDepth. Every card target is
 * judged against the reach model (FITS, TIGHT, OVER or IMPOSSIBLE; never
 * FITTED, since nothing is fitted), the time check never steps a practice
 * below its stage's band floor, and the plan carries the date check
 * (dateCheck, reachModel). Its remedies are the depth plan's own:
 * USE_REALISTIC_DATE and LOWER_DEPTH, never REFIT_LIGHT or MOVE_TO_LATER.
 */
export function feasibilityOf(plan: readonly MilestoneDraft[], input: RealismInput): Feasibility {
  return feasibilityWith(plan, input, true);
}

// ═══ Re-splitting (refit, remedies) ══════════════════════════════════════════

/**
 * Re-splits the span left after the carried milestones over the unstarted
 * ones (ord order; scheduled rows first, then LATER rows): `n` windows from
 * the last carried due day (or today); the first n unstarted rows take them
 * (status DRAFT), the rest go LATER (no dates, no rankIndex). Carried and
 * superseded rows are returned unchanged. No room for even one 35-day
 * window: every unstarted row goes LATER.
 *
 * n is cut so the plan holds at most MAX_MILESTONES positions (distinct
 * lineages, roadmap-types positionCountOf; fix round): the carried rows'
 * lineages and the scheduled rows' together. A dropped row and its started
 * "Start again" copy take one place, and a PLANNED copy re-uses its dropped
 * original's place.
 */
function resplit(plan: readonly MilestoneDraft[], input: RealismInput, nFor: (span: number, unstarted: number, carriedPositions: number) => number): MilestoneDraft[] {
  const out = plan.map(cloneMilestone);
  const carriedAll = out.filter((ms) => CARRIED.has(ms.status));
  const carried = carriedAll.filter(isDated);
  const unstarted = out
    .map((ms, i) => ({ ms, i }))
    .filter(({ ms }) => UNSTARTED.has(ms.status))
    .sort((a, b) => Number(a.ms.status === "LATER") - Number(b.ms.status === "LATER") || a.ms.ord - b.ms.ord || a.i - b.i)
    .map(({ ms }) => ms);
  if (unstarted.length === 0) return out;
  const lastCarried = carried.reduce<DayKey | null>((mx, ms) => (mx == null || ms.dueDay! > mx ? ms.dueDay! : mx), null);
  const base = lastCarried != null && lastCarried >= input.today ? lastCarried : input.today;
  const span = daysBetween(base, input.targetDay);
  const carriedPositions = positionCountOf(carriedAll);
  // Revision 5, lane 7 (ruling 50): the cap is the plan kind's (milestoneCapOf: MAX_MILESTONES on LEVELS, so unchanged).
  const cap = milestoneCapOf(input.planKind);
  let n = clamp(Math.min(nFor(span, unstarted.length, carriedPositions), unstarted.length), 0, cap);
  while (n > 0 && positionCountOf([...carriedAll, ...unstarted.slice(0, n)]) > cap) n -= 1;
  const windows = n >= 1 && span >= MILESTONE_MIN_DAYS && daysBetween(input.today, input.targetDay) <= SPAN_MAX_DAYS ? splitSpan(base, input.targetDay, n) : null;
  if (windows && base !== input.today) windows[0] = { start: addDays(base, 1), end: windows[0].end };
  unstarted.forEach((ms, i) => {
    const w = windows?.[i];
    if (w) {
      ms.windowStart = w.start;
      ms.dueDay = w.end;
      ms.status = "DRAFT";
    } else {
      ms.windowStart = null;
      ms.dueDay = null;
      ms.status = "LATER";
      ms.rankIndex = null;
    }
  });
  return out;
}

const scheduledUnstarted = (plan: readonly MilestoneDraft[]): number => plan.filter((ms) => fittable(ms)).length;

/**
 * The re-fit of unstarted milestones (F4 step 11): re-split the remaining
 * span (n ≤ MAX_MILESTONES − carried positions, ≥ 1), re-fit thresholds,
 * targets and allocations; structure, labels, decisions and lineage ids
 * kept; STARTING and STARTED rows never touched.
 *
 * n = min(the unstarted milestones, milestoneCountFor(span), MAX − carried
 * positions), positions counted by lineage (a dropped row and its "Start
 * again" copy are one):
 * a shorter span than the plan was drawn for moves the trailing ones to
 * LATER (kept, not deleted). Re-fitted rows come back as DRAFT (the new
 * version R4 writes); typed (YOURS) targets and practice plans stand.
 *
 * Revision 4: on a depth plan the re-fit is a re-date (redateDepth): every
 * unstarted stage is dated again from today's cards at the plan's writing
 * rate (its Sunday on or after its stage day, in order); counts, levels and
 * the stage structure never change, and started rows are never touched.
 * "Re-date later milestones" and the CALIBRATED offer run it.
 */
export function refit(plan: readonly MilestoneDraft[], input: RealismInput, opts: PlaceOpts = {}): MilestoneDraft[] {
  // Revision 5, lane 7 (ruling 50): a TOPICS plan re-dates through the chain, its layers and topics unchanged, never re-split.
  if (isTopicsInput(input)) return redateChain(plan, input, "PLAN", opts);
  if (isDepthInput(input)) return redateDepth(plan, input, "PLAN", opts);
  const split = resplit(plan, input, (span, unstarted) => Math.min(unstarted, milestoneCountFor(Math.max(span, 1))));
  return fitRows(split, input, opts);
}

// ═══ Remedies (F4 step 9) ════════════════════════════════════════════════════

const passes = (fe: Feasibility): boolean => !fe.impossible && !fe.over;
const knowledgeProblem = (milestones: readonly MilestoneFeasibility[]): boolean => milestones.some((m) => m.knowledge.some((k) => k.verdict === "OVER" || k.verdict === "IMPOSSIBLE"));

function movedTo(plan: readonly MilestoneDraft[], input: RealismInput, targetDay: DayKey, opts: PlaceOpts = {}): { plan: MilestoneDraft[]; input: RealismInput } {
  const moved: RealismInput = { ...input, targetDay };
  const keep = Math.max(1, scheduledUnstarted(plan));
  return { plan: fitRows(resplit(plan, moved, () => keep), moved, opts), input: moved };
}

/**
 * Remedy (a)'s new aim date: the earliest Sunday after the current one, up
 * to SPAN_MAX_DAYS from today, on which the re-split plan has nothing
 * IMPOSSIBLE and nothing OVER; null when none does. The search assumes a
 * later date never hurts (reach only grows with time) and verifies the day
 * it returns. The caller stores it as Roadmap.targetDay.
 *
 * Revision 4: on a depth plan MOVE_DATE is retargeted to the realistic date
 * D_real (F-R4-11); null past SPAN_MAX_DAYS.
 */
export function remedyTargetDay(plan: readonly MilestoneDraft[], input: RealismInput): DayKey | null {
  if (isTopicsInput(input)) return chainRealisticDayOf(plan, input); // Revision 5, lane 7.
  if (isDepthInput(input)) return realisticDayOf(plan, input);
  const first = addDays(input.targetDay, 7 - weekdayOf(input.targetDay) || 7);
  const last = addDays(input.today, SPAN_MAX_DAYS);
  const sundays: DayKey[] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) sundays.push(d);
  if (sundays.length === 0) return null;
  const ok = (i: number) => {
    const m = movedTo(plan, input, sundays[i]);
    return passes(feasibilityWith(m.plan, m.input, false));
  };
  if (!ok(sundays.length - 1)) return null;
  let lo = 0;
  let hi = sundays.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ok(mid)) hi = mid;
    else lo = mid + 1;
  }
  return sundays[lo];
}

function laterCount(plan: readonly MilestoneDraft[], input: RealismInput): number | null {
  const scheduled = planOrder(plan).filter((i) => fittable(plan[i]));
  for (let k = 1; k < scheduled.length; k++) {
    const p = laterBy(plan, input, k);
    if (passes(feasibilityWith(p, input, false))) return k;
  }
  return null;
}

function laterBy(plan: readonly MilestoneDraft[], input: RealismInput, k: number, opts: PlaceOpts = {}): MilestoneDraft[] {
  const scheduled = planOrder(plan).filter((i) => fittable(plan[i]));
  const later = new Set(scheduled.slice(scheduled.length - k));
  const marked = plan.map((ms, i) => {
    const c = cloneMilestone(ms);
    if (later.has(i)) {
      c.status = "LATER";
      c.windowStart = null;
      c.dueDay = null;
      c.rankIndex = null;
    }
    return c;
  });
  const keep = scheduled.length - k;
  return fitRows(resplit(marked, input, () => keep), input, opts);
}

function refitLight(plan: readonly MilestoneDraft[], input: RealismInput, opts: PlaceOpts = {}): { plan: MilestoneDraft[]; input: RealismInput } {
  const light: RealismInput = { ...input, intensity: "LIGHT" };
  return { plan: fitRows(plan, light, opts, { resetTyped: true }), input: light };
}

/**
 * The remedies that keep their promise on this plan, each tried and re-run:
 * MOVE_DATE leaves nothing IMPOSSIBLE or OVER; REFIT_LIGHT leaves no card
 * target OVER or IMPOSSIBLE among the rows the plan can change (it lowers
 * targets; it cannot lower load, which new cards set at their pace, not at
 * the target; nor a started milestone's frozen target); MOVE_TO_LATER
 * leaves nothing IMPOSSIBLE or OVER with at least one milestone kept.
 * "Nothing" always means the plan's flags, which judge only those rows.
 */
function remediesFor(plan: readonly MilestoneDraft[], input: RealismInput, before: readonly MilestoneFeasibility[]): Remedy[] {
  const out: Remedy[] = [];
  if (remedyTargetDay(plan, input) != null) out.push("MOVE_DATE");
  if (knowledgeProblem(before)) {
    const l = refitLight(plan, input);
    // Its promise is about the targets it can change: a carried row's frozen target, OVER or IMPOSSIBLE, never withholds it.
    if (!knowledgeProblem(judgePlan(l.plan, l.input, false).open)) out.push("REFIT_LIGHT");
  }
  if (laterCount(plan, input) != null) out.push("MOVE_TO_LATER");
  return out;
}

/**
 * One remedy re-applied to the draft (move the date, re-fit at Light, move
 * trailing milestones to Later); the caller re-runs feasibilityOf.
 *   - MOVE_DATE: re-split over remedyTargetDay (the caller stores the new
 *     Roadmap.targetDay, which is the last scheduled milestone's dueDay);
 *   - REFIT_LIGHT: every card target re-fitted at Light, typed ones included
 *     (the caller stores intensity LIGHT, the user's tap, and passes it on
 *     the next run, so the basis reads "Fitted at Light");
 *   - MOVE_TO_LATER: the fewest trailing milestones moved to LATER (kept,
 *     no dates) for the rest, re-split over the same span, to fit.
 * A remedy that cannot keep its promise returns the plan unchanged.
 *
 * Revision 4, a depth plan: USE_REALISTIC_DATE (and MOVE_DATE, retargeted)
 * re-dates every unstarted stage at the realistic writing rate, the final
 * one on D_real (the caller stores it as Roadmap.targetDay). Nothing else
 * applies here: LOWER_DEPTH is its own action (lowerDepthPlanOf, after the
 * user's choice in its sheet), and REFIT_LIGHT and MOVE_TO_LATER are never
 * offered on a depth plan, so they return it unchanged (no remedy ever
 * changes a depth term).
 */
export function applyRemedy(plan: readonly MilestoneDraft[], input: RealismInput, remedy: Remedy, opts: PlaceOpts = {}): MilestoneDraft[] {
  // Revision 5, lane 7: on a TOPICS plan only the realistic date applies (the chain is never squeezed); LOWER_DEPTH is its own action.
  if (isTopicsInput(input)) return remedy === "USE_REALISTIC_DATE" || remedy === "MOVE_DATE" ? redateChain(plan, input, "REALISTIC", opts) : plan.map(cloneMilestone);
  if (isDepthInput(input)) return remedy === "USE_REALISTIC_DATE" || remedy === "MOVE_DATE" ? redateDepth(plan, input, "REALISTIC", opts) : plan.map(cloneMilestone);
  if (remedy === "MOVE_DATE") {
    const day = remedyTargetDay(plan, input);
    return day ? movedTo(plan, input, day, opts).plan : plan.map(cloneMilestone);
  }
  if (remedy === "REFIT_LIGHT") return refitLight(plan, input, opts).plan;
  const k = laterCount(plan, input);
  return k == null ? plan.map(cloneMilestone) : laterBy(plan, input, k, opts);
}

// ═══ The in-house starter and the manual ladder (F7) ═════════════════════════

function blankMilestone(lineageId: string, ord: number, w: PlanWindow, title: string, titleOrigin: Origin, titleDecision: Decision): MilestoneDraft {
  return {
    id: null,
    lineageId,
    version: 0,
    ord,
    title,
    titleOrigin,
    titleDecision,
    windowStart: w.start,
    dueDay: w.end,
    status: "DRAFT",
    rankIndex: null,
    overAccepted: false,
    items: [],
    measures: [],
    notes: [],
  };
}

/** The aim as the user wrote it: origin USER, so it is YOURS (it fills "Practice for {aim}"). */
const aimText = (aim: string): YoursText => aim.replace(/\s+/g, " ").trim() as YoursText;

/** Syllabus lines split across n milestones in order, as evenly as possible (earlier ones take the extra), at most `cap` each (TOPICS_PER_MILESTONE; a depth plan's starter places every line). */
function syllabusChunks(lines: number, n: number, cap: number = TOPICS_PER_MILESTONE): number[][] {
  const out: number[][] = [];
  let next = 0;
  for (let i = 0; i < n; i++) {
    const size = Math.min(cap, Math.floor(lines / n) + (i < lines % n ? 1 : 0));
    const chunk: number[] = [];
    for (let j = 0; j < size && next < lines; j++) chunk.push(next++);
    out.push(chunk);
  }
  return out;
}

/**
 * "Build from my numbers" (F7): n windows; per milestone one CARDS_AT_LEVEL
 * measure over the chosen Domains, a "Study <Domains>" READING practice
 * (CodeText) when practices are allowed, a code title with no target; a
 * syllabus split across milestones as topics (YOURS); for a track Area one
 * "Practice for <aim>" placeholder (note PLACEHOLDER) per milestone.
 * `names` maps the chosen Domain ids to their DomainNames; `makeId` mints lineage ids.
 *
 * The chosen Domains are the intake's first DOMAINS_PER_MILESTONE that have
 * a name. A syllabus topic sits under the chosen Domain when there is one,
 * else under none (the editor moves it). With no Domain and no practice the
 * milestones come back NOT_MEASURABLE ("Pick at least one Domain, or add a
 * practice"). Every number is fitted by fitPlan; an empty list when the
 * span cannot be split.
 *
 * Revision 4: a revision-4 draft (isRev4Draft: a Field Area with a depth, or
 * a track Area whose caller set a date mode) is the depth starter, the stage
 * ladder (stageLadderOf, items STARTER); an empty list when the ladder
 * refuses (call stageLadderOf for its words). Rev 3's starter stays for a
 * legacy call.
 *
 * Confirm to unlock (contracts §19): `opts` carries the plan's gate and the
 * kinds the constraint filter left out (StageLadderOpts.gate, excluded); the
 * stage ladder never places a blocked kind, and without a gate it works out
 * the intake's own (activityGateOf).
 */
export function starterLadder(
  intake: Intake,
  input: RealismInput,
  names: Readonly<Record<string, DomainName>>,
  makeId: () => string,
  opts: Pick<StageLadderOpts, "gate" | "excluded" | "counts"> = {}
): MilestoneDraft[] {
  if (isRev4Draft(intake, input)) {
    const r = stageLadderOf(intake, input, names, makeId, opts);
    return r.ok ? r.plan : [];
  }
  const windows = splitWindows(input.today, input.targetDay);
  if (!windows) return [];
  const track = input.trackArea || intake.fieldId == null;
  const chosen = Array.from(new Set(intake.domainIds));
  const domains = track ? [] : chosen.filter((id) => names[id] != null).slice(0, DOMAINS_PER_MILESTONE).map((id) => ({ id, name: names[id] }));
  const lines = !track && intake.syllabus ? intake.syllabus.lines : [];
  const chunks = syllabusChunks(lines.length, windows.length);
  const aim = aimText(intake.aim);
  const plan = windows.map((w, i) => {
    const title = !track && domains.length > 0 ? codeText("Study {domains}", { domains: domains.map((d) => d.name) }) : codeText("Practice for {aim}", { aim });
    const ms = blankMilestone(makeId(), i + 1, w, title, CODE, CODE_DECISION);
    let ord = 0;
    for (const d of domains) {
      ms.items.push({
        id: null,
        lineageId: makeId(),
        kind: "DOMAIN",
        ord: ord++,
        label: String(d.name),
        rawLabel: null,
        origin: "USER",
        decision: "KEPT",
        domainId: d.id,
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
        addToToday: true,
        templateId: null,
        flags: [],
        notes: [],
      });
    }
    for (const ref of chunks[i] ?? []) {
      ms.items.push({
        id: null,
        lineageId: makeId(),
        kind: "TOPIC",
        ord: ord++,
        label: lines[ref],
        rawLabel: null,
        origin: "SYLLABUS",
        decision: "KEPT",
        domainId: domains.length === 1 ? domains[0].id : null,
        proposedName: null,
        syllabusRef: ref,
        method: null,
        sessionsPerWeek: null,
        durationBand: null,
        rule: null,
        planSource: null,
        checkpointKind: null,
        outOf: null,
        bar: null,
        addToToday: true,
        templateId: null,
        flags: [],
        notes: [],
      });
    }
    if (track) {
      const method: PracticeMethod = intake.track === "BODY" ? "WORKOUT" : "DELIBERATE_PRACTICE";
      ms.items.push(practiceItem(makeId(), ord++, codeText("Practice for {aim}", { aim }), method, ["PLACEHOLDER"]));
    } else if (input.practicesAllowed && domains.length > 0) {
      ms.items.push(practiceItem(makeId(), ord++, codeText("Study {domains}", { domains: domains.map((d) => d.name) }), "READING", ["STUDY_ADDED"]));
    }
    return ms;
  });
  return fitWith(plan, { ...input, trackArea: track }, { makeId });
}

/**
 * "Write it myself": the same editor's empty ladder of n milestones (targets
 * still fitted by code once the user adds Domains or practices). Titles are
 * empty and the user's (origin USER); every milestone starts NOT_MEASURABLE.
 *
 * Revision 4: a revision-4 draft is the stage ladder's skeleton
 * (stageLadderOf, items NONE): every stage with its Domains, counts, dates and
 * code's title, and no practice, step or checkpoint until the user writes
 * them (a re-fit, fitPlan, then puts the practice progression on each DRAFT
 * stage, contracts §20; what the user removed never comes back). A Field
 * Area needs `names` (the Domains' names); an empty list without them, or
 * when the ladder refuses.
 */
export function manualLadder(intake: Intake, input: RealismInput, makeId: () => string, names?: Readonly<Record<string, DomainName>>): MilestoneDraft[] {
  if (isRev4Draft(intake, input)) {
    // The stage skeleton (Domains, measures, dates, code's stage titles); fitPlan then adds what each stage still needs.
    // A Field Area's stages need their Domains' names: without them there is no skeleton.
    if (intake.fieldId != null && !input.trackArea && !names) return [];
    const r = stageLadderOf(intake, input, names ?? {}, makeId, { items: "NONE" });
    return r.ok ? r.plan : [];
  }
  const windows = splitWindows(input.today, input.targetDay);
  if (!windows) return [];
  return windows.map((w, i) => {
    const ms = blankMilestone(makeId(), i + 1, w, "", "USER", "PENDING");
    ms.notes.push("NOT_MEASURABLE");
    return ms;
  });
}

// ═══ Start (F4 steps 12–13) ══════════════════════════════════════════════════

/** The Start sheet's re-check of one milestone (F4 step 12). */
export interface StartRefit {
  /** The milestone re-allocated with today's capacity (targets unchanged unless the user takes fittedNow). */
  milestone: MilestoneDraft;
  feasibility: MilestoneFeasibility;
  /** "Target 20 was fitted when you accepted; fitted today it would be 14 (…)"; null when the stored target still fits. Always null on a depth plan (counts never fall). */
  todayCheck: { measureKey: string; stored: number; fittedNow: number; reason: string } | null;
  impossible: boolean;
  /**
   * Revision 4, a depth plan (F-R4-11 "Start"): the date check of the stage
   * being started. "Milestone 3 · Retained was planned for Sun 13 Dec; at
   * today's cards it's realistic by Sun 3 Jan" ([Use 3 Jan] re-dates this and
   * the later unstarted stages; [Keep 13 Dec — Over] needs the switch;
   * IMPOSSIBLE refuses Start). `realistic` is the Sunday on or after its
   * stage day at today's cards and the plan's writing rate (null: not within
   * the reach table's span, or no pace); `verdict` is FITS when it is no
   * later than `planned`, else the worst of its card checks at `planned`.
   */
  stageDate?: { planned: DayKey; realistic: DayKey | null; verdict: DateVerdict };
}

/**
 * The Start sheet's re-check (F4 step 12): the milestone as if it started
 * today, its window [today, dueDay]. Its WORKED_OUT practices are
 * re-allocated with today's capacity and its PRACTICE_KEPT targets counted
 * over the new window; its card target is not changed. todayCheck appears
 * when the stored target is above what can be expected now, with the target
 * fitted today; `impossible` when the stored target is IMPOSSIBLE now.
 *
 * The baseline it fits from is the measure's own when stamped today (R4
 * stamps decision 10's high-water baseline there before calling), else the
 * live count at the level.
 *
 * Revision 4: on a depth plan the today check becomes a date check
 * (stageDate); the counts and levels never fall (todayCheck is null).
 */
export function refitForStart(milestone: MilestoneDraft, plan: readonly MilestoneDraft[], input: RealismInput): StartRefit {
  if (isTopicsInput(input)) return refitForStartChain(milestone, plan, input); // Revision 5, lane 7.
  if (isDepthInput(input)) return refitForStartDepth(milestone, plan, input);
  const ctx = contextOf(input);
  const ms = cloneMilestone(milestone);
  ms.windowStart = ctx.today;
  const others = plan.filter((p) => p.lineageId !== milestone.lineageId && !(milestone.id != null && p.id === milestone.id));
  const full = [...others.map(cloneMilestone), ms];
  const state = planStateOf(full, ctx);
  if (ms.dueDay != null) {
    allocate(ms, state.sim, ctx, ctx.today, null, rowFocusOf(ms));
    syncPracticeMeasures(ms, ctx.today, ctx);
  }
  // Judged as the milestone being started (its stored target is the one accepted), whatever its row's status:
  // finishing a claim-first Start passes the STARTING row, and must read what the sheet read.
  const feasibility = ms.dueDay != null ? milestoneFeasibilityOf(ms, state, ctx, ctx.today, false) : emptyFeasibility(ms);
  const cm = cardMeasureOf(ms);
  let todayCheck: StartRefit["todayCheck"] = null;
  let impossible = false;
  if (cm && ms.dueDay != null) {
    const L = cm.minLevel!;
    const scope = ctx.scopeOf(cm.scope.domainIds!);
    const written = state.writing.perDay.has(scope.key) ? (to: DayKey) => writtenThrough(state.writing, scope.key, to) : null;
    const reach = reachOf(effectiveCards(scope.cards, ctx.today), L, ms.dueDay, ctx, written);
    const baseline = cm.baselineDay === ctx.today && cm.baseline != null ? cm.baseline : liveCount(scope.cards, L);
    const fittedNow = baseline + Math.floor(INTENSITY[input.intensity] * (reach.expected - baseline) + EPS);
    impossible = cm.target > reach.strictMax;
    if (cm.target > reach.expected + EPS) {
      const since = cm.baselineDay && cm.baselineDay < ctx.today ? cm.baselineDay : milestone.windowStart ?? ctx.today;
      const fresh = scope.cards.filter((c) => c.createdDay != null && c.createdDay >= since).length;
      const reason =
        fresh === 0
          ? "no new cards yet in these Domains"
          : `${plural(fresh, "new card", "new cards")} since ${dayText(since)}, and fewer of your cards can reach level ${L} by ${dayText(ms.dueDay)}`;
      todayCheck = { measureKey: cm.measureKey ?? cardsAtLevelKey(scope.domainIds, L), stored: cm.target, fittedNow, reason };
    }
  }
  return { milestone: ms, feasibility, todayCheck, impossible };
}

function emptyFeasibility(ms: MilestoneDraft): MilestoneFeasibility {
  return {
    kind: "PLAN",
    lineageId: ms.lineageId,
    ord: ms.ord,
    knowledge: [],
    time: { verdict: "FITS", unverified: true, ratio: null, worstWeek: null, basis: ["This milestone has no dates."] },
    worst: "FITS",
    basis: [],
    remedies: [],
    weeks: [],
    lastCardDay: null,
  };
}

/**
 * The StartSnapshot (F4 step 13): the per-week plan with needRate, p_start,
 * yield_start, newNeeded_start and Ww_start, for the week quests to keep for
 * the milestone's life. `milestone` carries the target the user chose (the
 * stored one, or fittedNow); `refitted` is refitForStart's result.
 *   - p_start = the measured p, or 1 while calibrating (flagged "best case");
 *   - yield_start = p_start^(L−1), or 1 while calibrating;
 *   - newNeeded_start = max(0, ceil((T − existingExpected(dueDay) at p_start) ÷ yield_start));
 *   - fw_w = |E_w ∩ (…, lastCardDay]| ÷ 7, E_w the week's open days in [startedDay, dueDay];
 *   - Ww_start = Σ fw_w; needRate_w = newNeeded_start × fw_w ÷ Ww_start.
 *
 * Revision 4, a depth plan (startSnapshotDepth): the reach model's inputs at
 * Start (p_start, pLong_start, c_start, ρ_start, the priors standing in while
 * calibrating, never 1), REACH_MODEL_VERSION, and per Domain the new recall
 * cards still needed (newNeededByDomain = writeNeedOf(target_d, live recall
 * cards)) and their weekly need (needRateByDomain).
 */
export function startSnapshotOf(milestone: MilestoneDraft, refitted: StartRefit, input: RealismInput, startedDay: DayKey): StartSnapshot {
  // Revision 5, lane 7: a TOPICS row's snapshot is the depth one's, per Domain (its paying measures; it reads no depth).
  if (isTopicsInput(input)) return startSnapshotDepth(milestone, refitted, input, startedDay);
  if (isDepthInput(input)) return startSnapshotDepth(milestone, refitted, input, startedDay);
  const ctx = contextOf({ ...input, today: startedDay });
  const dueDay = milestone.dueDay ?? refitted.milestone.dueDay ?? startedDay;
  const cm = cardMeasureOf(milestone);
  const pr = ctx.pr;
  const pStart = pr.calibrating ? 1 : pr.p;
  const L = cm?.minLevel ?? null;
  const lastCardDay = L != null ? addDays(dueDay, -floorBase(L, ctx.m)) : null;
  let yieldStart = 1;
  let newNeeded = 0;
  let rateSource: RealismScope["rateSource"] = "NONE";
  if (cm && L != null) {
    const scope = ctx.scopeOf(cm.scope.domainIds!);
    rateSource = scope.rateSource;
    yieldStart = pr.calibrating ? 1 : Math.pow(pStart, L - 1);
    const exp = existingExpected(effectiveCards(scope.cards, startedDay), L, dueDay, pStart, ctx.m);
    newNeeded = yieldStart > 0 ? Math.max(0, Math.ceil((cm.target - exp) / yieldStart - EPS)) : 0;
  }
  const plan = new Map(refitted.feasibility.weeks.map((w) => [w.weekStart, w]));
  const raw: { w: DayKey; fw: number }[] = [];
  for (let w = weekStartKeyOf(startedDay); w <= dueDay; w = addDays(w, 7)) {
    const a = maxDay(w, startedDay);
    const b = minDay(addDays(w, 6), dueDay);
    const writeTo = lastCardDay == null ? null : minDay(b, lastCardDay);
    raw.push({ w, fw: writeTo == null || writeTo < a ? 0 : openDays(a, writeTo, ctx.held) / 7 });
  }
  const wwStart = raw.reduce((s, r) => s + r.fw, 0);
  const weeks: StartWeek[] = raw.map(({ w, fw }) => {
    const pw = plan.get(w);
    return {
      weekStart: w,
      newPerWeek: pw?.newPerWeek ?? 0,
      practiceMin: pw?.practiceMin ?? 0,
      reviewMin: pw?.reviewMin ?? 0,
      availableMin: pw?.availableMin ?? null,
      availableClass: pw?.availableClass ?? ctx.cap.class,
      needRate: wwStart > 0 ? (newNeeded * fw) / wwStart : 0,
      fw,
    };
  });
  return {
    kind: "START",
    startedDay,
    dueDay,
    weeks,
    lastCardDay,
    pStart,
    pCalibrating: pr.calibrating,
    yieldStart,
    newNeededStart: newNeeded,
    wwStart,
    rateSource,
    m: ctx.m,
    feasibility: refitted.feasibility,
  };
}

// ═══ Revision 4: depth plans (roadmap-rev4.md F-R4-8 to F-R4-13, F-R4-21; contracts §14) ═══
//
// High mastery is a depth (decision 36): every required Domain d in R holds n_d
// recall cards at level ≥ L*, a card at exactly L* counting once it entered L*
// at the first try (clean entry). The engine keeps the depth and moves the
// date (decision 37): nothing here fits, scales or lowers a count or a level.
//
// The model, in one place (every rule is the spec's; the choices it leaves
// open are marked "choice"):
//   - Coverage (coverageOf): n_d = the most of the 25-card floor, 80% of the
//     Domain's live recall cards and 3 per outline line (its own lines plus an
//     even share of the lines tied to no Domain in R), or the user's typed
//     figure; the live count is the intake's when R4 passes it frozen
//     (StageLadderOpts.counts, contracts §15.3). new_d = writeNeedOf(n_d,
//     live_d) with today's live_d.
//   - Writing: the plan's rate r is split over the Domains still short in
//     proportion to their new_d (so they finish together); card k of a Domain
//     is written on its floor(7k ÷ r_d)-th open day from today (held days are
//     skipped; with none it is roadmap-types referenceWriteDaysOf exactly).
//     The rate is PACE_SHARE[intensity] × the source rate, or the rate the date
//     check asks (TIGHT, OVER), capped where the hours can't hold it (capRateOf:
//     the writing slows first, before any practice drops under its stage's
//     band floor; when slowing can't make room, the time check reads OVER).
//   - Stage days (roadmap-types stageDayOf): the first day every Domain's
//     expected count at the gate (existing + new, the reach model) reaches
//     n_d; the final gate with clean entry. Due days are the Sunday on or after.
//   - The ladder (ladderRowsOf): held gates (all terms met now) become rows
//     with HELD_AT_START, no items, no measures and no rank; a gate short by 1
//     or 2 is not a milestone; windows under MILESTONE_MIN_DAYS drop their lower
//     gate (the final never); a first window over FIRST_RANK_MAX_DAYS gets one
//     count gate (PART); a later window over MILESTONE_MAX_DAYS gets one
//     intermediate gate (BETWEEN) at the odd level below its upper gate, due
//     the Sunday after its stage day, or later when the upper gate is held
//     later than the reach (the hours, a user's date: betweenDueOf); at
//     most MAX_MILESTONES rows, the count gate kept first.
//   - The date check (dateCoreOf): D_real, D_full, the best cases (strict
//     intervals, every review passing), D_floor, D_hours, the verdict on the
//     user's date and the rate it asks, the waypoints, what was assumed.

/**
 * A revision-4 draft (the starter and the manual ladder): a Field Area with a
 * depth (on the intake or the input), or a track Area whose caller set a date
 * mode (every revision-4 path does; choice: a track intake carries no other
 * revision-4 mark). A legacy call has neither and gets rev 3's ladders.
 */
function isRev4Draft(intake: Intake, input: RealismInput): boolean {
  if (intake.fieldId != null && !input.trackArea) return isAimDepth(intake.depth) || isAimDepth(input.depth);
  return intake.dateMode != null || input.dateMode != null;
}

/** A depth plan: a Field Area with Roadmap.depth set (12, 10 or 8). A track Area or a legacy plan (depth null) keeps the rev-3 engine. */
function isDepthInput(input: RealismInput): input is RealismInput & { depth: AimDepth } {
  return !input.trackArea && isAimDepth(input.depth);
}

/** The Sunday on or after a day: a stage's due day is never earlier than realistic. */
function sundayOnOrAfter(d: DayKey): DayKey {
  return addDays(d, (7 - weekdayOf(d)) % 7);
}

/** a < b with null read as "never" (later than every day). */
const beforeDay = (a: DayKey | null, b: DayKey | null): boolean => (a == null ? false : b == null ? true : a < b);
/** The later of two days, null ("never") winning. */
const laterOf = (a: DayKey | null, b: DayKey | null): DayKey | null => (a == null || b == null ? null : maxDay(a, b));

/** A recall card: every type but NON_RECALL_TYPES (CardState.recall false); a card without the mark counts (rev 3). */
const isRecallCard = (c: CardState): boolean => c.recall !== false;

/**
 * Recall cards at level ≥ ℓ now (CARDS_AT_LEVEL's reading, with its `r`
 * segment). With clean entry (`rc`, at L*), a card at exactly ℓ that entered
 * it on a next-day retry counts only after its next pass.
 */
function heldCount(cards: readonly CardState[], level: number, clean: boolean): number {
  let n = 0;
  for (const c of cards) {
    if (!isRecallCard(c)) continue;
    if (c.level > level || (c.level === level && !(clean && c.retryEntry === true))) n += 1;
  }
  return n;
}

/** A Domain's cards from the input's scopes: its own single-Domain scope, else the first scope listing it whose cards carry their Domain (R4's union scope of the chosen Domains). */
function domainCardsOf(input: RealismInput, id: string): CardState[] {
  const single = input.scopes.find((s) => s.domainIds.length === 1 && s.domainIds[0] === id);
  if (single) return single.cards;
  for (const s of input.scopes) {
    if (!s.domainIds.includes(id)) continue;
    if (s.cards.every((c) => c.domainId != null)) return s.cards.filter((c) => c.domainId === id);
  }
  return [];
}

/** The recall cards' effective states, keeping the retry-entry mark where the card is still at the level it entered. */
function reachCardsOf(cards: readonly CardState[], today: DayKey): ReachCard[] {
  const out: ReachCard[] = [];
  for (const c of cards) {
    if (!isRecallCard(c)) continue;
    const e = effectiveState(c, today);
    out.push(c.retryEntry === true && e.level === c.level ? { ...e, retryEntry: true } : e);
  }
  return out;
}

/** One required Domain as the depth engine reads it. */
interface DepthDomain {
  id: string;
  /** Every card of the Domain (the load reviews them all, multiple choice included). */
  all: CardState[];
  /** Its recall cards' effective states, with the retry-entry mark (the reach sums read these). */
  eff: ReachCard[];
  /** live_d: its recall cards now. */
  live: number;
  /** n_d: the count every gate asks of it (a count gate asks its own). */
  n: number;
  /** new_d = writeNeedOf(n_d, live_d). */
  need: number;
}

interface DepthModel {
  input: RealismInput;
  today: DayKey;
  /** L*: an AimDepth on a depth plan; a TOPICS chain's model (revision 5, lane 7) may sit at 6. */
  L: TopicDepth;
  m: number;
  params: ReachParams;
  calibrating: CalibratingInput[];
  doms: DepthDomain[];
  totalNeed: number;
  /** r_src: the source writing rate (new cards a life week, measured or typed); null with none. */
  sourceRate: number | null;
  rateSource: RateSource;
  /** PACE_SHARE[intensity]. */
  share: number;
  /** The open (non-held) days from today, up to today + REACH_T_MAX. */
  open: DayKey[];
  writes: Map<string, Map<string, WriteDay[]>>;
  /** capRateOf's results, per upper bound. */
  caps: Map<string, number>;
  /**
   * Revision 5, lane 7: a TOPICS chain's staged writing (each topic's cards in its own layer's window, chainScheduleOf),
   * which writeDaysAt returns whatever the rate. Absent on every depth plan.
   */
  staged?: Map<string, WriteDay[]>;
}

/**
 * The source rate a depth plan writes from (F-R4-11's r_src): RealismInput.sourceRate when R4 gives it, else the pace
 * of R's union scope (or any scope of R with one). A FIELD-sourced rate is this goal's share of the Field pace
 * (RealismInput.fieldShare; contracts §23.3, ruling 30), R4's sourceRate included; a share of 1 changes nothing.
 */
function sourceRateOf(input: RealismInput, ids: readonly string[]): { rate: number | null; rateSource: RateSource } {
  const fieldShare = shareOf(input.fieldShare);
  const scopes = pacedScopesOf(input, fieldShare);
  const key = sortedUnique(ids).join(",");
  const exact = scopes.find((s) => s.key === key || sortedUnique(s.domainIds).join(",") === key);
  const found =
    exact && exact.rateSource !== "NONE" && exact.rate != null
      ? exact
      : scopes.find((s) => s.rateSource !== "NONE" && s.rate != null && s.domainIds.some((d) => ids.includes(d)));
  if (input.sourceRate !== undefined) {
    const r = input.sourceRate;
    if (r == null || !Number.isFinite(r) || r < 0) return { rate: null, rateSource: "NONE" };
    const rateSource = found ? found.rateSource : "YOURS";
    return { rate: rateSource === "FIELD" && fieldShare !== 1 ? r * fieldShare : r, rateSource };
  }
  return found ? { rate: found.rate as number, rateSource: found.rateSource } : { rate: null, rateSource: "NONE" };
}

/** The depth model for R (with each Domain's count) at depth L, from today's input. */
function depthModelOf(input: RealismInput, L: AimDepth, targets: readonly { id: string; n: number }[]): DepthModel {
  const today = input.today;
  const m = input.m > 0 ? input.m : 1;
  const derived = reachInputsOf(input.throughput, m);
  const params = input.reach ?? derived.params;
  const seen = new Set<string>();
  const doms: DepthDomain[] = [];
  for (const t of targets) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const all = domainCardsOf(input, t.id);
    const live = all.filter(isRecallCard).length;
    const n = Math.max(0, Math.floor(t.n));
    doms.push({ id: t.id, all, eff: reachCardsOf(all, today), live, n, need: writeNeedOf(n, live) });
  }
  const totalNeed = doms.reduce((s, d) => s + d.need, 0);
  const src = sourceRateOf(
    input,
    doms.map((d) => d.id)
  );
  const calibrating: CalibratingInput[] = input.calibrating ? [...input.calibrating] : [...derived.calibrating];
  // 'pace': a typed rate the app hasn't measured, when new cards are needed (choice: derived only when R4 gives no list).
  if (!input.calibrating && src.rateSource === "YOURS" && totalNeed > 0 && !calibrating.includes("pace")) calibrating.push("pace");
  const held = new Set(input.heldDays);
  const open: DayKey[] = [];
  for (let k = 0; k <= REACH_T_MAX; k++) {
    const d = addDays(today, k);
    if (!held.has(d)) open.push(d);
  }
  return { input, today, L, m, params, calibrating, doms, totalNeed, sourceRate: src.rate, rateSource: src.rateSource, share: PACE_SHARE[input.intensity], open, writes: new Map(), caps: new Map() };
}

/**
 * Each Domain's writing days at `rate` new cards a week (F-R4-10): r_d = rate
 * × new_d ÷ Σ new; card k on the floor(7k ÷ r_d)-th open day from today. With
 * no held day this is roadmap-types referenceWriteDaysOf exactly.
 */
function writeDaysAt(model: DepthModel, rate: number): Map<string, WriteDay[]> {
  if (model.staged) return model.staged;
  const key = String(rate);
  const hit = model.writes.get(key);
  if (hit) return hit;
  const out = new Map<string, WriteDay[]>();
  for (const d of model.doms) {
    const days: { day: DayKey; count: number }[] = [];
    if (rate > 0 && model.totalNeed > 0 && d.need > 0) {
      const rd = (rate * d.need) / model.totalNeed;
      for (let k = 0; k < d.need; k++) {
        const idx = Math.floor((k * 7) / rd);
        if (idx >= model.open.length) break;
        const day = model.open[idx];
        const last = days[days.length - 1];
        if (last && last.day === day) last.count += 1;
        else days.push({ day, count: 1 });
      }
    }
    out.set(d.id, days);
  }
  model.writes.set(key, out);
  return out;
}

const writeDayOf = (w: WriteDay): DayKey => (typeof w === "string" ? w : w.day);
const writeCountOf = (w: WriteDay): number => (typeof w === "string" ? 1 : w.count);

/** The last day the plan writes a card at `rate`; null when it writes none. */
function lastWriteDayOf(model: DepthModel, rate: number): DayKey | null {
  let last: DayKey | null = null;
  for (const days of writeDaysAt(model, rate).values()) for (const w of days) if (last == null || writeDayOf(w) > last) last = writeDayOf(w);
  return last;
}

interface StageQuery {
  clean?: boolean;
  params?: ReachParams;
  /** Counts per Domain (a count gate's, or a row's own measures); n_d otherwise. */
  targets?: ReadonlyMap<string, number>;
  /** Only these Domains (a count gate's). */
  only?: ReadonlySet<string>;
}

/** The stage day of a gate at `rate` (roadmap-types stageDayOf over R's Domains); null past REACH_T_MAX. */
function stageDayIn(model: DepthModel, level: number, rate: number, q: StageQuery = {}): DayKey | null {
  const w = writeDaysAt(model, rate);
  const doms = model.doms.filter((d) => !q.only || q.only.has(d.id));
  if (doms.length === 0) return model.today;
  return stageDayOf(
    doms.map((d) => ({ n: q.targets?.get(d.id) ?? d.n, cards: d.eff, writeDays: w.get(d.id) ?? [] })),
    level,
    model.today,
    q.params ?? model.params,
    q.clean ? { cleanAt: level } : undefined
  );
}

/** A Domain's expected recall cards at level ≥ ℓ by `day` (the reach model; with clean entry at the depth). */
function expectedOf(model: DepthModel, d: DepthDomain, level: number, day: DayKey, rate: number, clean: boolean): number {
  const opts = clean ? { cleanAt: level } : undefined;
  return existingExpectedSlack(d.eff, level, day, model.params, opts) + newExpectedSlack(writeDaysAt(model, rate).get(d.id) ?? [], level, day, model.params, opts);
}

/**
 * A Domain's cards at level ≥ ℓ by `day` if every review passes on its day
 * (base intervals: the best case; strict: the jitter's lower bound, the
 * IMPOSSIBLE floor). `writes` null: every needed card written today (D_floor).
 * A retry-entry card at exactly ℓ counts once its next review is due (at p =
 * 1 it passes then).
 */
function passCountOf(model: DepthModel, d: DepthDomain, level: number, day: DayKey, writes: readonly WriteDay[] | null, strict: boolean, clean: boolean): number {
  let n = 0;
  for (const c of d.eff) {
    if (c.level > level) n += 1;
    else if (c.level === level) {
      if (!(clean && c.retryEntry) || c.dueDay <= day) n += 1;
    } else if ((strict ? strictReach(c, level, model.m) : bestReach(c, level, model.m)) <= day) n += 1;
  }
  const floor = strict ? floorStrict(level, model.m) : floorBase(level, model.m);
  if (writes == null) {
    if (addDays(model.today, floor) <= day) n += d.need;
  } else {
    for (const w of writes) if (addDays(writeDayOf(w), floor) <= day) n += writeCountOf(w);
  }
  return n;
}

/** The first day from today (to REACH_T_MAX) on which a monotone test holds; null when it never does. */
function firstDayWhere(today: DayKey, ok: (d: DayKey) => boolean): DayKey | null {
  if (!ok(addDays(today, REACH_T_MAX))) return null;
  let lo = 0;
  let hi = REACH_T_MAX;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ok(addDays(today, mid))) hi = mid;
    else lo = mid + 1;
  }
  return addDays(today, lo);
}

/** The first day a gate could be met if every review passed (strict intervals: the jitter's lower bound): writing at `rate`, or every needed card written today (null). */
function strictStageDayOf(model: DepthModel, level: number, rate: number | null, q: StageQuery = {}): DayKey | null {
  const w = rate == null ? null : writeDaysAt(model, rate);
  const doms = model.doms.filter((d) => !q.only || q.only.has(d.id));
  return firstDayWhere(model.today, (day) => doms.every((d) => passCountOf(model, d, level, day, w ? (w.get(d.id) ?? []) : null, true, !!q.clean) >= (q.targets?.get(d.id) ?? d.n)));
}

/** The depth's strict best day (D_bst, D_floor). */
function strictDepthDayOf(model: DepthModel, rate: number | null): DayKey | null {
  return strictStageDayOf(model, model.L, rate, { clean: true });
}

// ─── The plan's rows ─────────────────────────────────────────────────────────

/** A depth row's gate level: its card measures' highest level; a gate stage's own level without them. */
function rowLevelOf(ms: MilestoneDraft): number | null {
  let lv: number | null = null;
  // Revision 5, lane 7: a TOPICS row's level is its paying measures' (its CONTEXT rows, "climbing to 8", and its PART or
  // BETWEEN checkpoints never set it); a LEVELS row (no chainRole) reads every card measure, as before.
  for (const x of ms.measures) if (x.kind === "CARDS_AT_LEVEL" && x.minLevel != null && (ms.chainRole == null || (x.role === "PAYS" && !x.gate))) lv = Math.max(lv ?? 0, x.minLevel);
  if (lv != null) return lv;
  const st = ms.stage;
  return st && (STAGE_KEYS as readonly string[]).includes(st) ? STAGE_LEVEL[st as GateStage] : null;
}

/** A stage held when the plan began (HELD_AT_START): never fitted, judged, dated or ranked. */
const isHeldRow = (ms: MilestoneDraft): boolean => ms.notes.includes("HELD_AT_START");

/** The band floor of a stage's row (roadmap-catalog stageBandFloorOf over its stage and level: a gate's own; BETWEEN keeps the gate below's; a count gate its gate's). */
const rowBandFloorOf = (ms: MilestoneDraft): PracticeBand | null => stageBandFloorOf(ms.stage ?? null, rowLevelOf(ms));

/** Retrieval below RETAINED; production at RETAINED and above (BETWEEN at L9 and L11 included) (F-R4-13). */
const wantsProduction = (level: number): boolean => level >= STAGE_LEVEL.RETAINED;

// Whether a practice is retrieval or production practice (F-R4-13) is roadmap-catalog's practiceRoleOf, the one
// definition (contracts §15.9; R4's top-rank facts and R1's production-kept reading read it too): by its catalog type
// first, then (a practice without one: rev 3's, or the user's) by its method.

/** The milestone's Domains in item order (live DOMAIN items with a Domain id), every one of them (a depth plan holds up to DEPTH_DOMAINS_MAX). */
function rowDomainsOf(ms: MilestoneDraft): { id: string; name: DomainName }[] {
  const out: { id: string; name: DomainName }[] = [];
  const seen = new Set<string>();
  for (const i of [...ms.items].sort((a, b) => a.ord - b.ord)) {
    if (i.kind !== "DOMAIN" || !liveItem(i) || !i.domainId || seen.has(i.domainId)) continue;
    seen.add(i.domainId);
    out.push({ id: i.domainId, name: domainName({ id: i.domainId, name: i.label }) });
  }
  return out;
}

/** A row's card measures as stage dating reads them: per-Domain counts, the Domains, and whether the depth's clean entry applies. */
function rowTargetsOf(ms: MilestoneDraft): { targets: Map<string, number>; only: Set<string>; clean: boolean } {
  const targets = new Map<string, number>();
  let clean = false;
  for (const x of ms.measures) {
    if (x.kind !== "CARDS_AT_LEVEL" || x.role !== "PAYS" || x.minLevel == null) continue;
    const ids = x.scope.domainIds ?? [];
    if (ids.length !== 1) continue;
    targets.set(ids[0], (targets.get(ids[0]) ?? 0) + x.target);
    const parsed = x.measureKey ? parseMeasureKey(x.measureKey) : null;
    if (parsed && parsed.kind === "CARDS_AT_LEVEL" && parsed.segment === "rc") clean = true;
  }
  return { targets, only: new Set(targets.keys()), clean };
}

/**
 * The depth's counts from a plan: the per-Domain card measures of its final
 * stage (the scheduled row at the depth's level, else its highest card row).
 * Null when the plan has no such row.
 */
function depthTargetsOf(plan: readonly MilestoneDraft[], L: number): { id: string; n: number }[] | null {
  let best: MilestoneDraft | null = null;
  let bestLevel = -1;
  for (const ms of plan) {
    if (!SCHEDULED.has(ms.status) || isHeldRow(ms)) continue;
    const { targets } = rowTargetsOf(ms);
    if (targets.size === 0) continue;
    const lv = rowLevelOf(ms) ?? 0;
    const rank = lv === L && ms.stage !== "PART" ? 1000 : lv;
    if (rank > bestLevel) {
      bestLevel = rank;
      best = ms;
    }
  }
  if (!best) return null;
  return [...rowTargetsOf(best).targets.entries()].map(([id, n]) => ({ id, n }));
}

function depthModelOfPlan(plan: readonly MilestoneDraft[], input: RealismInput & { depth: AimDepth }): DepthModel | null {
  const targets = depthTargetsOf(plan, input.depth);
  return targets ? depthModelOf(input, input.depth, targets) : null;
}

/** The date check's inputs from RealismInput: the mode (CHOSEN once accepted), the user's date in CHOSEN mode, the exam day. */
function datingOf(input: RealismInput): { mode: DateMode; userDate: DayKey | null; examDay: DayKey | null } {
  const mode: DateMode = input.dateMode ?? "CHOSEN";
  return { mode, userDate: mode === "CHOSEN" ? (input.userDate ?? input.targetDay) : null, examDay: input.examDay ?? null };
}

// ─── Load at a writing rate, and the capacity cap ────────────────────────────

/** The depth plan's load at `rate`: every Domain's writing (one scope each) and every card's reviews (multiple choice included). */
function depthStateOf(plan: readonly MilestoneDraft[], model: DepthModel, ctx: Ctx, rate: number): PlanState {
  const end = horizonOf(plan, model.input);
  const start = ctx.today;
  const n = Math.max(1, daysBetween(start, end) + 1);
  const writes = writeDaysAt(model, rate);
  const perDay = new Map<string, Float64Array>();
  const cum = new Map<string, Float64Array>();
  const until = new Map<string, DayKey>();
  const uses: CardUse[] = [];
  for (const d of model.doms) {
    const arr = new Float64Array(n);
    for (const w of writes.get(d.id) ?? []) {
      const i = daysBetween(start, writeDayOf(w));
      if (i >= 0 && i < n) arr[i] += writeCountOf(w);
    }
    const run = new Float64Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += arr[i];
      run[i] = s;
    }
    perDay.set(d.id, arr);
    cum.set(d.id, run);
    const own = writes.get(d.id) ?? [];
    if (own.length) until.set(d.id, writeDayOf(own[own.length - 1]));
    uses.push({ key: d.id, scope: { key: d.id, domainIds: [d.id], fieldId: null, cards: d.all, rateSource: model.rateSource, rate: null }, level: model.L, dueDay: end, lastCardDay: end });
  }
  const writing: Writing = { start, n, perDay, cum, shared: new Set(), until };
  return { uses, writing, sim: simulate(uses, writing, ctx, model.params.p) };
}

/** The capacity probe's stand-in plan for a ladder: its stages' dates and levels, each with one code practice when practices are allowed. */
function probePlanOf(rows: readonly LadderRow[], model: DepthModel): MilestoneDraft[] {
  const out: MilestoneDraft[] = [];
  let prev: DayKey | null = null;
  for (const r of rows) {
    if (r.held) continue;
    const i = out.length;
    const ms = blankMilestone(`cap-${i}`, i + 1, { start: prev == null ? model.today : addDays(prev, 1), end: r.due }, "", CODE, CODE_DECISION);
    prev = r.due;
    ms.stage = r.stage;
    ms.measures = [{ ...blankCardMeasure(), minLevel: r.level }];
    if (model.input.practicesAllowed) ms.items.push(practiceItem(`cap-${i}-p`, 0, "", wantsProduction(r.level) ? "WRITING" : "READING", []));
    out.push(ms);
  }
  return out;
}

/**
 * The fastest writing the hours allow (F-R4-10, F-R4-13), to 0.05 a week:
 * the largest rate ≤ `upper` at which the ladder that rate dates has no
 * stage reading OVER that wouldn't read OVER with no new cards at all (one
 * session of a practice at the stage's band floor fits beside the reviews
 * and new cards, and the worst week fits available(w)). So the writing slows
 * first, moving the dates, before any practice drops under its band floor;
 * a stage over even with no new cards is left to its OVER ("cut a practice
 * or raise hours"), since slowing can't help it. Infinity when nothing
 * binds. A function of the model alone (the probe stands one code practice
 * in each stage; choice: the plan's own practices are judged by its time
 * check), so it reads the same in the ladder, the fit, the checks and every
 * re-read of a stored plan.
 */
function capRateOf(model: DepthModel, ctx: Ctx, upper: number): number {
  if (!(upper > 0) || model.totalNeed === 0) return Infinity;
  const memo = `${upper}`;
  const hit = model.caps.get(memo);
  if (hit !== undefined) return hit;
  // Every input the probe reads, so a re-read of the same plan on the same day (the fit, the checks, the date check) is a lookup.
  const print = JSON.stringify([
    upper,
    model.today,
    model.L,
    model.m,
    model.params,
    model.input.intensity,
    model.input.practicesAllowed,
    ctx.cap.weekMin,
    model.input.heldDays,
    model.doms.map((d) => [d.id, d.n, d.need, d.all.map((c) => `${c.level}:${c.dueDay}:${c.graceEndsDay ?? ""}:${c.recall === false ? 0 : 1}:${c.retryEntry ? 1 : 0}`).join(",")]),
  ]);
  const shared = CAP_MEMO.get(print);
  if (shared !== undefined) {
    model.caps.set(memo, shared);
    return shared;
  }
  const keys = model.doms.map((d) => d.id);
  const fixable = (r: number): boolean => {
    const sd = stageDayIn(model, model.L, r, { clean: true });
    if (!sd) return false;
    const built = ladderRowsOf(model, r, sundayOnOrAfter(sd), false);
    if (!built.ok) return true;
    const plan = probePlanOf(built.rows, model);
    const overs = (rate: number): boolean[] => {
      const state = depthStateOf(plan, model, ctx, rate);
      return plan.map((row) => {
        const ms = cloneMilestone(row);
        const from = maxDay(ms.windowStart!, ctx.today);
        const floor = rowBandFloorOf(ms);
        allocate(ms, state.sim, ctx, from, floor);
        const weeks = weeksOf(
          ms,
          from,
          state,
          ctx,
          keys.map((key) => ({ key, lastCardDay: ms.dueDay! }))
        );
        return timeCheckOf(ms, from, weeks, state, ctx, floor).verdict === "OVER";
      });
    };
    const withNew = overs(r);
    const without = overs(0);
    return withNew.every((o, i) => !o || without[i]);
  };
  let out = Infinity;
  if (!fixable(upper)) {
    let lo = 0;
    let hi = upper;
    for (let k = 0; k < 16 && hi - lo > 0.05; k++) {
      const mid = (lo + hi) / 2;
      if (fixable(mid)) lo = mid;
      else hi = mid;
    }
    out = Math.floor(lo * 20) / 20;
  }
  model.caps.set(memo, out);
  if (CAP_MEMO.size >= CAP_MEMO_MAX) CAP_MEMO.delete(CAP_MEMO.keys().next().value as string);
  CAP_MEMO.set(print, out);
  return out;
}

/** capRateOf's results across calls (the oldest dropped past CAP_MEMO_MAX): pure in its fingerprint, so a lookup is the same answer. */
const CAP_MEMO = new Map<string, number>();
const CAP_MEMO_MAX = 64;

/** typicalHours as a date (F-R4-11's D_hours): the first day Σ available ≥ typicalHours × 60; null without typicalHours; "NEVER" past REACH_T_MAX. */
function hoursDayOf(input: RealismInput, ctx: Ctx): DayKey | "NEVER" | null {
  const th = input.typicalHours;
  if (th == null || !(th > 0)) return null;
  const perDay = ctx.cap.weekMin / 7;
  if (!(perDay > 0)) return "NEVER";
  const need = th * 60;
  let cum = 0;
  for (let k = 0; k <= REACH_T_MAX; k++) {
    const d = addDays(ctx.today, k);
    if (!ctx.held.has(d)) cum += perDay;
    if (cum + EPS >= need) return d;
  }
  return "NEVER";
}

// ─── The date check (F-R4-11) ────────────────────────────────────────────────

interface DateCore {
  check: DateCheck;
  /** The new cards a week the plan writes at (the date check's rate after the capacity cap); 0 with none needed or no pace. */
  rate: number;
  /** New cards needed and no pace: not dated (CHOSEN mode spreads the stages evenly to the user's date; REALISTIC is refused at intake). */
  notDated: boolean;
  /** No pace, and the new cards are WRITE_MARGIN's spare alone: dated on the cards held (spareOnlyOf), with no new card counted. */
  spareOnly: boolean;
  /** The realistic plan's writing rate (r_plan after the cap). */
  realisticRate: number;
  /** r_plan before the cap, and r_src (0 with no pace); r_src after the cap (D_full's). */
  planRateUncapped: number;
  sourceRate: number;
  fullRate: number;
  /** The hours cap the writing (capRateOf binds below r_plan). */
  capped: boolean;
}

const fmtRate = (r: number): string => String(Math.round(r * 10) / 10);
const ceilTenth = (r: number): number => Math.ceil(r * 10 - 1e-9) / 10;

/** "Retained (level 8)"; an odd level "level 11, on the way to Mastered (level 12)". */
function levelWords(level: number): string {
  const gate = stageOfLevel(level);
  if (gate) return `${STAGE_NAMES[gate]} (level ${level})`;
  const above = stageOfLevel(level + 1);
  return above ? `level ${level}, on the way to ${STAGE_NAMES[above]} (level ${level + 1})` : `level ${level}`;
}

/** The levels a plan's rows reach (gates and BETWEEN, held rows included; never a count gate); the gates to L without a plan. */
function reachLevelsOf(plan: readonly MilestoneDraft[] | null, L: number): number[] {
  if (!plan) return THRESHOLDS.filter((l) => l <= L);
  const out = new Set<number>();
  for (const ms of plan) {
    if (!SCHEDULED.has(ms.status) || ms.stage === "PART") continue;
    const lv = rowLevelOf(ms);
    if (lv != null) out.add(lv);
  }
  return [...out].sort((a, b) => a - b);
}

/** The highest level whose stage day (at `rate`) is on or before `by`; held levels count as reached today. */
function reachByOf(model: DepthModel, levels: readonly number[], rate: number, by: DayKey): number | null {
  let best: number | null = null;
  for (const level of levels) {
    const sd = stageDayIn(model, level, rate, { clean: level === model.L });
    if (sd != null && sd <= by) best = Math.max(best ?? 0, level);
  }
  return best;
}

/** The reach model's basis line (F-R4-8), naming every assumed input. */
function reachBasisLineOf(model: DepthModel): string {
  const cal = new Set(model.calibrating);
  const p = model.params;
  const pass = cal.has("p") ? `a pass rate of ${pct(p.p)} (the app's assumption until ${PASS_SHARE_MIN_REVIEWS} reviews are measured)` : `your pass rate (${pct(p.p)}, reads high: lapses by neglect aren't logged)`;
  const long = `a pass rate of ${pct(p.pLong)} for gaps of 50 days and more (the app's policy: none of your reviews has tested gaps that long yet)`;
  const clear = cal.has("c") ? `${pct(p.c)} of your due queue cleared (the app's assumption until your clearance is measured)` : `the share of your due queue you clear (${pct(p.c)})`;
  const bunch = cal.has("rho") ? `missed days bunching together as the app assumes until ${RHO_MIN_DAYS} days of your history are measured` : "how missed days bunch together in your history";
  return `Expected reach follows the app's review rules: a miss costs a day, two in a row cost a level, and a card overdue past its grace drops a level. It uses ${pass}, ${long}, ${clear}, and ${bunch}. A card's current strike is read as none, which reads slightly high.`;
}

/** "assumes an 80% pass rate until 30 reviews are measured; your typed 3 new cards a week isn't measured yet". */
function assumedLineOf(model: DepthModel): string | null {
  const parts: string[] = [];
  const cal = new Set(model.calibrating);
  if (cal.has("p")) parts.push(`an ${pct(model.params.p)} pass rate until ${PASS_SHARE_MIN_REVIEWS} reviews are measured`);
  if (cal.has("c")) parts.push(`that you clear ${pct(model.params.c)} of your due queue until your clearance is measured`);
  if (cal.has("rho")) parts.push(`how missed days bunch together until ${RHO_MIN_DAYS} days are measured`);
  const tail = cal.has("pace") && model.sourceRate != null ? `; your typed ${fmtRate(model.sourceRate)} new cards a week isn't measured yet` : "";
  if (parts.length === 0 && !tail) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return parts.length ? `This date is an estimate: it assumes ${list}${tail}.` : `This date is an estimate${tail}.`;
}

/**
 * The date check (F-R4-11) for a depth model; `plan` (null before a ladder
 * exists) sets the levels the exam waypoint reads.
 *
 *   r_src the source rate; r_plan = PACE_SHARE × r_src. D_exp(r): the final
 *   stage's day at r (capped by the hours); D_bst(r): every review passing,
 *   strict intervals.
 *   D_real = the Sunday on or after max(D_exp(r_plan), D_hours); D_full =
 *   D_exp(r_src); D_best_pace = D_bst(r_plan); D_best_2x = D_bst(2 × r_src);
 *   D_floor = strict floors, every needed card written today. With no new
 *   cards needed the rate doesn't matter: D_full = D_real and both best
 *   cases are D_bst.
 *   The verdict on the user's date D_u (REALISTIC is FITS by construction):
 *   IMPOSSIBLE before max(D_best_2x, D_floor); FITS from D_real; TIGHT from
 *   D_full (the least rate ≤ r_src that meets it, to 0.1 a week); OVER
 *   before (the least rate ≤ 2 × r_src that meets it, else 2 × r_src and
 *   "works only if nearly every review passes").
 *   Not dated (new cards needed, no pace): every date but D_floor is null; a
 *   date before D_floor is IMPOSSIBLE, any other TIGHT (choice: the plan
 *   can't judge it and says so; FITS would claim what it can't know).
 *   The spare only (spareOnlyOf: no pace, and every Domain already holds
 *   its count in recall cards, so the new cards are WRITE_MARGIN's spare
 *   alone): dated on the cards held, as with none needed (no new card
 *   counted, rate 0), and says so; a date before D_floor (the spare written
 *   today) is IMPOSSIBLE, one before D_real OVER ("or with new cards
 *   written"). When the cards held don't reach the depth within
 *   SPAN_MAX_DAYS, the plan is not dated, as before.
 */
function dateCoreOf(plan: readonly MilestoneDraft[] | null, model: DepthModel, ctx: Ctx, mode: DateMode, userDate: DayKey | null, examDay: DayKey | null): DateCore {
  const key = dateMemoKeyOf(plan, model, ctx, mode, userDate, examDay);
  if (key != null) {
    const hit = DATE_MEMO.get(key);
    if (hit) {
      DATE_MEMO.delete(key);
      DATE_MEMO.set(key, hit);
      return cloneDateCore(hit);
    }
  }
  let core: DateCore | null = null;
  if (spareOnlyOf(model)) {
    const held = dateCoreIn(plan, model, ctx, mode, userDate, examDay, true);
    if (held.check.D_real != null && daysBetween(model.today, held.check.D_real) <= SPAN_MAX_DAYS) core = held;
  }
  core ??= dateCoreIn(plan, model, ctx, mode, userDate, examDay, false);
  if (key != null) {
    if (DATE_MEMO.size >= DATE_MEMO_MAX) DATE_MEMO.delete(DATE_MEMO.keys().next().value as string);
    DATE_MEMO.set(key, cloneDateCore(core));
  }
  return core;
}

/**
 * dateCoreOf's results across calls, least recently used dropped past
 * DATE_MEMO_MAX (as CAP_MEMO): the fitted plan, its checks, its writing plan
 * and every re-read of a stored plan date the same model again, and a page
 * of views builds the same plan many times. Pure in its key, so a hit is the
 * same answer; a hit is handed out as a copy, so a caller's edit never
 * reaches the memo.
 */
const DATE_MEMO = new Map<string, DateCore>();
const DATE_MEMO_MAX = 64;
/** A key longer than this (a library of several thousand cards) is not memoised: the work is then cheap beside the key. */
const DATE_MEMO_KEY_MAX = 400_000;

/**
 * The memo key: everything the date core reads. The model is a pure
 * function of its input, its depth and its targets (depthModelOf), and the
 * context of its input (contextOf), so the key is the input itself, L, the
 * targets, the mode, the user's date, the exam day and the levels the plan's
 * rows reach (the exam waypoint's). Null (no memo) when ctx isn't the
 * model's input's, the key can't be written, or it is too long. Non-finite
 * numbers are written apart from null (JSON would merge them).
 */
function dateMemoKeyOf(plan: readonly MilestoneDraft[] | null, model: DepthModel, ctx: Ctx, mode: DateMode, userDate: DayKey | null, examDay: DayKey | null): string | null {
  if (ctx.input !== model.input) return null;
  let key: string;
  try {
    key = JSON.stringify([mode, userDate, examDay, model.L, reachLevelsOf(plan, model.L), model.doms.map((d) => [d.id, d.n]), model.input], (_k, v: unknown) =>
      typeof v === "number" && !Number.isFinite(v) ? `#${v}` : v
    );
  } catch {
    return null;
  }
  return typeof key === "string" && key.length <= DATE_MEMO_KEY_MAX ? key : null;
}

/** A copy of a date core whose check a caller may edit (the basis, the origin's list). */
function cloneDateCore(c: DateCore): DateCore {
  return { ...c, check: { ...c.check, basis: [...c.check.basis], dateOrigin: { ...c.check.dateOrigin, calibrating: [...c.check.dateOrigin.calibrating] } } };
}

/**
 * Whether a depth model's new cards are the spare alone with no pace to
 * write them (the WRITE_MARGIN ruling's option (b), contracts §16.10): new
 * cards are asked (new_d > 0 somewhere), no source rate, and every Domain
 * already holds its count n_d in recall cards (live_d ≥ n_d). COVER_SHARE ×
 * WRITE_MARGIN = 1.04 > 1, so a Domain at its share (n_d = ⌈0.8 × live_d⌉)
 * always asks a few spare cards; they make the date likelier, but the count
 * is reachable without them, so the plan is dated on the cards held instead
 * of refused for want of a pace (NO_PACE). A Domain short of its count still
 * needs the pace.
 */
function spareOnlyOf(model: DepthModel): boolean {
  if (!(model.totalNeed > 0) || (model.sourceRate != null && model.sourceRate > 0)) return false;
  return model.doms.length > 0 && model.doms.every((d) => d.live >= d.n);
}

/** dateCoreOf with the spare read as not needed (`spareOnly`) or as the model has it. */
function dateCoreIn(plan: readonly MilestoneDraft[] | null, model: DepthModel, ctx: Ctx, mode: DateMode, userDate: DayKey | null, examDay: DayKey | null, spareOnly: boolean): DateCore {
  const L = model.L;
  const today = model.today;
  const need = model.totalNeed > 0 && !spareOnly;
  const rSrc = model.sourceRate;
  const hasPace = rSrc != null && rSrc > 0;
  const notDated = need && !hasPace;
  // Snapped to 1e-9, so 0.7 × 6 is the 4.2 the reference plan writes at (binary noise would move a writing day).
  const rPlan = hasPace ? Math.round(model.share * (rSrc as number) * 1e9) / 1e9 : 0;
  const rCap = need && hasPace ? capRateOf(model, ctx, OVER_PACE_FACTOR * (rSrc as number)) : Infinity;
  const eff = (r: number): number => (need ? Math.min(r, rCap) : 0);
  const dExp = (r: number): DayKey | null => stageDayIn(model, L, eff(r), { clean: true });
  const dBst = (r: number): DayKey | null => strictDepthDayOf(model, need ? r : 0);
  const hours = hoursDayOf(model.input, ctx);
  const D_floor = strictDepthDayOf(model, null);

  let D_real: DayKey | null = null;
  let D_full: DayKey | null = null;
  let D_best_pace: DayKey | null = null;
  let D_best_2x: DayKey | null = null;
  let D_exp_plan: DayKey | null = null;
  if (!notDated) {
    D_exp_plan = dExp(rPlan);
    D_real = hours === "NEVER" ? null : D_exp_plan == null ? null : sundayOnOrAfter(hours ? maxDay(D_exp_plan, hours) : D_exp_plan);
    if (!need) {
      D_full = D_real;
      D_best_pace = dBst(0);
      D_best_2x = D_best_pace;
    } else {
      D_full = dExp(rSrc as number);
      D_best_pace = dBst(rPlan);
      D_best_2x = dBst(OVER_PACE_FACTOR * (rSrc as number));
    }
  }

  const Du = mode === "REALISTIC" ? D_real : userDate;
  const leastRate = (lo: number, hi: number, by: DayKey): number | null => {
    if (beforeDay(by, dExp(hi))) return null;
    let a = Math.max(0, Math.ceil(lo * 10 - 1e-9));
    let b = Math.ceil(hi * 10 - 1e-9);
    while (a < b) {
      const mid = (a + b) >> 1;
      if (!beforeDay(by, dExp(Math.min(mid / 10, hi)))) b = mid;
      else a = mid + 1;
    }
    return Math.min(a / 10, hi);
  };
  let verdict: DateVerdict;
  let rate = rPlan;
  let overNoRate = false;
  if (mode === "REALISTIC" || Du == null) verdict = notDated ? "TIGHT" : "FITS";
  // The spare only: writing it (today, every review passing) is the floor, so a date between it and the held cards' best case is OVER.
  else if (beforeDay(Du, notDated || spareOnly ? D_floor : laterOf(D_best_2x, D_floor))) verdict = "IMPOSSIBLE";
  else if (notDated) verdict = "TIGHT";
  else if (!beforeDay(Du, D_real)) verdict = "FITS";
  else if (!beforeDay(Du, D_full)) {
    verdict = "TIGHT";
    rate = leastRate(rPlan, rSrc as number, Du) ?? (rSrc as number);
  } else {
    verdict = "OVER";
    const r = need ? leastRate(rSrc as number, OVER_PACE_FACTOR * (rSrc as number), Du) : null;
    overNoRate = need && r == null;
    rate = r ?? OVER_PACE_FACTOR * (rSrc as number);
  }
  if (notDated || !need) rate = 0;
  const planRate = eff(rate);
  const realisticRate = eff(rPlan);

  // By the user's date: the realistic plan's rows (its own merges and splits at r_plan, held gates included); by the exam: the plan's own rows.
  let reachByUserDate: number | null = null;
  if (mode === "CHOSEN" && Du != null && beforeDay(Du, D_real) && !notDated) {
    const realistic = D_real ? ladderRowsOf(model, realisticRate, D_real, false) : null;
    const levels = realistic && realistic.ok ? [...new Set(realistic.rows.filter((r) => r.stage !== "PART").map((r) => r.level))] : reachLevelsOf(null, L);
    reachByUserDate = reachByOf(model, levels, realisticRate, Du);
  }
  const reachByExam = examDay && !notDated ? reachByOf(model, reachLevelsOf(plan, L), planRate, examDay) : null;
  const lastWrite = lastWriteDayOf(model, realisticRate) ?? today;
  // Only when the schedule sets the date: when typicalHours does, more hours would bring it closer.
  const hoursBind = !!hours && hours !== "NEVER" && D_exp_plan != null && hours > D_exp_plan;
  const scheduleBound = D_real != null && !hoursBind && daysBetween(lastWrite, D_real) >= SCHEDULE_BOUND_SHARE * floorBase(L, model.m);

  const basis: string[] = [];
  const dow = (d: DayKey) => `${dowText(d)} ${d.slice(0, 4)}`;
  if (notDated) basis.push("Not dated: no writing pace yet. Enter how many new cards a week you'll write, or re-date once 4 weeks of new cards are measured.");
  else if (D_real == null) basis.push(need && rCap < rPlan ? TOO_FAR_HOURS_ERROR : TOO_FAR_ERROR);
  else {
    const pace = need ? `At ${pct(model.share)} of your usual ${fmtRate(rSrc as number)} new cards a week` : spareOnly ? "With only the cards you hold" : "With no new cards to write";
    const pass = model.calibrating.includes("p") ? `an assumed ${pct(model.params.p)} pass rate` : `your ${pct(model.params.p)} pass rate (reads high)`;
    const clear = model.calibrating.includes("c") ? `an assumed ${pct(model.params.c)} of your due queue cleared` : `the ${pct(model.params.c)} of your due queue you clear`;
    const best = spareOnly ? "on the cards you hold" : "at this pace";
    basis.push(
      `${pace}, ${pass}, ${pct(model.params.pLong)} for gaps of 50 days and more (the app's policy) and ${clear}, this depth is realistic by ${dow(D_real)}.${D_best_pace ? ` Earliest if every review passes, ${best}: ${dow(D_best_pace)}.` : ""}`
    );
    if (spareOnly)
      basis.push(
        `No writing pace yet, so the ${plural(model.totalNeed, "spare new card", "spare new cards")} the plan would write (${pct(WRITE_MARGIN - 1)} over the count, because some cards lag) ${model.totalNeed === 1 ? "isn't" : "aren't"} counted. Enter how many new cards a week you'll write, and the date may come closer.`
      );
  }
  const assumed = assumedLineOf(model);
  if (assumed) basis.push(assumed);
  if (hoursBind && hours) basis.push(`Your ${model.input.typicalHours} h, at the hours you have, take until ${dow(hours)}: that sets the date.`);
  if (mode === "CHOSEN" && Du != null) {
    if (verdict === "IMPOSSIBLE")
      basis.push(
        `Your date, ${dow(Du)}, is before the earliest this depth can be reached, ${notDated || spareOnly ? "even if every review passes and the new cards are written today" : "even at twice your pace"}: a new card needs at least ${floorStrict(L, model.m)} days to reach level ${L} here.`
      );
    else if (verdict === "TIGHT" && !notDated) basis.push("Uses your full usual pace: no margin for a lean week.");
    else if (verdict === "OVER")
      basis.push(
        need
          ? `Asks ${fmtRate(ceilTenth(rate))} new cards a week, more than your usual ${fmtRate(rSrc as number)}${overNoRate ? ", and works only if nearly every review passes" : ""}.`
          : spareOnly
            ? "Your date comes before the realistic one: it works only if nearly every review passes, or with new cards written: enter how many a week you'll write."
            : "Your date comes before the realistic one: it works only if nearly every review passes."
      );
    if (reachByUserDate != null) basis.push(`By your date the plan reaches ${levelWords(reachByUserDate)}.`);
  }
  if (examDay) basis.push(reachByExam != null ? `By your exam (${dow(examDay)}) the plan reaches ${levelWords(reachByExam)}. The depth goes on past it.` : `By your exam (${dow(examDay)}) the plan reaches no stage yet. The depth goes on past it.`);
  if (scheduleBound)
    basis.push(`This date is set by the review schedule, not your hours: a new card needs at least ${floorBase(L, model.m)} days to reach level ${L}. More hours won't bring it much closer.`);

  const rateAsked = need && !notDated && verdict !== "IMPOSSIBLE" ? ceilTenth(rate) : null;
  return {
    check: {
      D_real,
      D_full,
      D_best_pace,
      D_best_2x,
      D_floor,
      verdict,
      rateAsked,
      reachByUserDate,
      reachByExam,
      scheduleBound,
      dateOrigin: { origin: mode === "REALISTIC" ? "REALISTIC" : "USER", calibrating: [...model.calibrating] },
      basis,
    },
    rate: planRate,
    notDated,
    spareOnly,
    realisticRate,
    planRateUncapped: rPlan,
    sourceRate: hasPace ? (rSrc as number) : 0,
    fullRate: hasPace ? eff(rSrc as number) : 0,
    capped: need && rCap < rPlan,
  };
}

// ─── Coverage, line Domains, terms (F-R4-9) ──────────────────────────────────

/** coverageOf's input (F-R4-9): R in order, the outline lines' Domains (Syllabus.lineDomains) and the typed figures. */
export interface CoverageInput {
  /** Each required Domain: its live recall cards at intake and its multiple-choice cards (not counted). */
  domains: readonly { id: string; name: string; live: number; nonRecall: number }[];
  /** The outline lines' Domains, index-aligned with the lines; null = tied to no Domain. Empty with no outline. */
  lineDomains: readonly (string | null)[];
  /** Roadmap.coverage: the user's typed figures (YOURS). */
  typed: Readonly<Record<string, number>> | null;
}

/**
 * n_d for every Domain in R with all three terms (roadmap-types
 * coveragePolicyOf), the typed figure when there is one, and belowPolicy
 * (decision 53's coverage choice). A line tied to a Domain outside R counts
 * as tied to none: it raises every Domain's share. A typed figure must be a
 * whole number in COVER_MIN..COVER_MAX (validateIntake refuses others; here
 * one outside it is ignored).
 */
export function coverageOf(input: CoverageInput): CoverageBreakdown[] {
  const domains: CoverageInput["domains"][number][] = [];
  const seen = new Set<string>();
  for (const d of input.domains) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    domains.push(d);
  }
  const tied = new Map<string, number>();
  let unassigned = 0;
  for (const ld of input.lineDomains) {
    if (ld != null && seen.has(ld)) tied.set(ld, (tied.get(ld) ?? 0) + 1);
    else unassigned += 1;
  }
  const shared = domains.length > 0 ? unassigned / domains.length : 0;
  return domains.map((d) => {
    const linesTied = tied.get(d.id) ?? 0;
    const live = Math.max(0, Math.floor(d.live));
    const pol = coveragePolicyOf(live, linesTied + shared);
    const raw = input.typed && Object.prototype.hasOwnProperty.call(input.typed, d.id) ? input.typed[d.id] : undefined;
    const typed = typeof raw === "number" && Number.isInteger(raw) && raw >= COVER_MIN && raw <= COVER_MAX ? raw : null;
    const n = typed ?? pol.n;
    return {
      domainId: d.id,
      name: d.name,
      live,
      nonRecall: Math.max(0, Math.floor(d.nonRecall)),
      linesTied,
      linesShared: shared,
      floor: pol.floor,
      share: pol.share,
      outline: pol.outline,
      policy: pol.n,
      typed,
      n,
      belowPolicy: typed != null && typed < pol.n,
    };
  });
}

const CONTENT_STOP: ReadonlySet<string> = new Set([...ENGLISH_FUNCTION_WORDS, ...DOMAIN_STOP_WORDS].map((w) => w.toLowerCase()));

/** A text's content stems: its words (synonyms.ts's light stemmer), less English function words and DOMAIN_STOP_WORDS. */
function contentStemsOf(text: string): string[] {
  return words(text)
    .filter((w) => !CONTENT_STOP.has(w.raw.toLowerCase()))
    .map((w) => w.stem);
}

/** Whether a text names a Domain: every content stem of the Domain's name is among the text's stems (a name of stop words only never is). */
function namesDomain(stems: ReadonlySet<string>, name: string): boolean {
  const need = contentStemsOf(name);
  return need.length > 0 && need.every((s) => stems.has(s));
}

/**
 * The deterministic default Domain of an outline line (F-R4-9, F-R4-24): the
 * chosen Domain whose name's content stems all appear in the line; null with
 * no match or a tie (two chosen Domains both match). "Conditional probability
 * and Bayes" goes to Probability. The form prefills it and the user changes
 * it; Gemini never sets it.
 */
export function lineDomainDefaultOf(line: string, chosen: readonly { id: string; name: string }[]): string | null {
  const stems = new Set(contentStemsOf(line));
  let hit: string | null = null;
  const matched = new Set<string>();
  for (const d of chosen) {
    if (matched.has(d.id)) continue;
    if (!namesDomain(stems, d.name)) continue;
    matched.add(d.id);
    hit = d.id;
  }
  return matched.size === 1 ? hit : null;
}

/**
 * The Domains an aim names (F-R5-8, lane 1: the intake's prefill when an
 * Area is picked): lineDomainDefaultOf's rule over the aim, each Domain whose
 * name's content stems all appear in it, in the order given. Every match is
 * kept (the aim names each one; there is no tie to break). With none, the
 * intake starts with no Domain chosen: "I want to manage a 100k portfolio"
 * names neither "Fund Management" nor "Trust Fund Architecture"; "Learn fund
 * management" names "Fund Management".
 */
export function aimDomainDefaultsOf(aim: string, domains: readonly { id: string; name: string }[]): string[] {
  const stems = new Set(contentStemsOf(aim));
  const out: string[] = [];
  for (const d of domains) if (!out.includes(d.id) && namesDomain(stems, d.name)) out.push(d.id);
  return out;
}

/** The outline lines' Domains for an intake: the user's (Syllabus.lineDomains, kept only within R), else the deterministic default per line. */
function lineDomainsOf(intake: Intake, chosen: readonly { id: string; name: string }[]): (string | null)[] {
  const lines = intake.syllabus?.lines ?? [];
  const given = intake.syllabus?.lineDomains;
  const ids = new Set(chosen.map((c) => c.id));
  return lines.map((line, i) => {
    if (given && i < given.length) {
      const v = given[i];
      return v != null && ids.has(v) ? v : null;
    }
    return lineDomainDefaultOf(line, chosen);
  });
}

/**
 * The end state of a depth plan (F-R4-9): one term per Domain,
 * CARDS_AT_LEVEL|d:<id>|L<L*>|rc, target n_d, targetSource DEPTH (the
 * policy) or YOURS (typed). Never scaled by intensity, fitted to reach or
 * lowered by a remedy: Light, Steady and Push give the same terms.
 *
 * Revision 5, lane 7 (contracts §22.1 ruling 45): `depth` widens to a
 * TopicDepth, and `levels` (Domain id → its end level) gives a mixed-level end
 * state: a TOPICS plan's specialisation at L*, its base topics at 8 (or at L*
 * when that is lower), each `rc`. A Domain it doesn't list (or lists with no
 * whole level 1..20) sits at `depth`. Without `levels`, byte-identical.
 */
export function depthTermsOf(depth: TopicDepth, coverage: readonly CoverageBreakdown[], baselines: Readonly<Record<string, number>>, today: DayKey, levels?: Readonly<Record<string, number>> | null): EndStateTerm[] {
  return coverage.map((c) => {
    const raw = Object.prototype.hasOwnProperty.call(baselines, c.domainId) ? baselines[c.domainId] : 0;
    const own = levels && Object.prototype.hasOwnProperty.call(levels, c.domainId) ? levels[c.domainId] : undefined;
    const level = typeof own === "number" && Number.isInteger(own) && own >= 1 && own <= 20 ? own : depth;
    return {
      measureKey: cardsAtLevelKey([c.domainId], level, "rc"),
      target: c.n,
      baseline: Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0,
      baselineDay: today,
      label: `${c.name} · cards at level ${level}+`,
      targetSource: c.typed != null ? "YOURS" : "DEPTH",
    };
  });
}

// ─── Catalog items and stage practices (F-R4-13, F-R4-18) ────────────────────

/**
 * A code-written catalog item (origin CODE, decided: WORKED_OUT); null when the type isn't used on this track or its fill is missing.
 * `alternate`: a practice that takes turns with another, week about (contracts §20.12, ProgressionItem.alternate): its label
 * says so in code's words (roadmap-catalog progressionLabelOf).
 */
function catalogItemOf(
  key: CatalogKey,
  o: { lineageId: string; ord: number; track: CatalogTrack; domains: readonly DomainName[]; aim: YoursText | null; exam: YoursText | null; notes?: readonly ItemNote[]; alternate?: PracticeKind | null }
): ItemDraft | null {
  const entry = catalogEntryOf(key);
  if (!entry || !entry.tracks.includes(o.track)) return null;
  let label: string;
  try {
    label = progressionLabelOf({ kind: key, alternate: o.alternate ?? null }, { track: o.track, domains: o.domains.length ? o.domains : undefined, aim: o.aim ?? undefined, exam: o.exam ?? undefined });
  } catch {
    return null;
  }
  const kind: ItemKind = entry.slot === "PRACTICE" ? "PRACTICE" : entry.slot === "STEP" ? "STEP" : "CHECKPOINT";
  return {
    id: null,
    lineageId: o.lineageId,
    kind,
    ord: o.ord,
    label,
    rawLabel: null,
    origin: CODE,
    decision: CODE_DECISION,
    domainId: null,
    proposedName: null,
    syllabusRef: null,
    method: entry.method,
    sessionsPerWeek: null,
    durationBand: null,
    rule: null,
    planSource: kind === "PRACTICE" ? "WORKED_OUT" : null,
    checkpointKind: kind === "CHECKPOINT" ? (key as CheckpointKind) : null,
    outOf: null,
    bar: null,
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [...(o.notes ?? [])],
    catalogKey: key,
  };
}

// ─── The practice progression on a plan's rows (contracts §20; R2's half) ────
//
// Code owns the practice progression on every plan path (the lead's decision
// after the probe, contracts §20): roadmap-catalog's progressionOf decides
// what every stage holds (its practices, steps and checkpoint), and the
// functions below put it on a plan's rows. A plan's chain is its scheduled
// rows with a stage key on its track, in plan order:
//   - a held row (HELD_AT_START) gets nothing;
//   - a row that is not a DRAFT (PLANNED, STARTING, STARTED: accepted or under
//     way) is carried: its live kinds are kept as they are and read (the next
//     stage carries its focus, and a first stage carried keeps the opening);
//   - a DRAFT row is reconciled with the progression:
//       a code row (origin CODE, worked out: never one the user added, edited
//       or checked) of a kind the progression no longer wants there leaves;
//       a code row of a kind it wants stays, its notes following
//       progressionNotesOf and its label its Domains' names;
//       a kind it wants that the row lacks is added, in its priority order and
//       within the caps, unless the user removed one of that kind there (a
//       REMOVED row), a type the user changed there took its place (an EDITED
//       code row of a kind it doesn't want: swapsOf, which the room counts in
//       that kind's place too), or its label can't be filled: Gemini's pick PENDING (the
//       user decides it), every other kind decided (KEPT, "added by the app");
//       the user's own rows always stay, and a catalog kind of theirs counts as
//       the progression's.
// The room (maxPractices) is what the stage's weekly practice budget holds at
// its band floor (practicesThatFitOf), less the user's own practices sharing
// it, so the plan stays within the user's hours. Gemini's picks are the
// reply's (`picks`), else each DRAFT gate or track stage's live GEMINI_PICK
// practice, so a re-sync keeps them.

/** Kinds only an exam places: without the intake, a plan holding one has an exam. */
const EXAM_ONLY_KINDS: ReadonlySet<string> = new Set(["BOOK_EXAM", "EXAM_DAY", "MOCK_TEST", "TIMED_PRACTICE"]);

/** What the progression on a plan's rows reads besides the rows. */
interface RowProgressionCtx {
  track: CatalogTrack;
  practicesAllowed: boolean;
  /** The user's Yes to the exam question. */
  exam: boolean;
  examDay: DayKey | null;
  /** A Field plan's practice family (roadmap-catalog practiceFamilyOf(intake)); null on a track or without the intake (KNOW). */
  family: PracticeFamily | null;
  /** The gate's blocked kinds and every kind left out: never placed. */
  blocked: ReadonlySet<string>;
  /** Gemini's picks (read as unknown), over each stage's GEMINI_PICK row. */
  picks: unknown;
  fill: { aim: YoursText | null; exam: YoursText | null };
  /** A DRAFT row's room for practices before the user's own (null: PRACTICES_PER_MILESTONE). */
  room: (ms: MilestoneDraft) => number | null;
  /** The Domains' names, over the rows' DOMAIN labels. */
  names?: Readonly<Record<string, DomainName>>;
  makeId?: () => string;
  /**
   * One stage only (addStagePracticesOf: "Add the app's practice" on a plan
   * the user writes): the lineage of the DRAFT row the progression is put on;
   * every other row is read as it stands (carried: its kinds, never changed),
   * so the stage builds on what the user's plan holds around it.
   */
  only?: string;
  /**
   * With `only`: one practice added, the first the progression places on the
   * stage (in its priority: the focus, the exam's, the core, the carry or the
   * partner, the spaced review) that the stage lacks; nothing of the stage
   * leaves, and its steps and checkpoint stay the user's.
   */
  addOne?: boolean;
  /**
   * Revision 5, lane 7 (contracts §22.13): a TOPICS plan (its rows carry a
   * chainRole). The progression's input then says so (planKind TOPICS, each
   * stage's `chain`), a dated exam is never placed in a layer before K (ruling
   * 44), and an item's {domains} follow its part: NEW the row's own Domains (a
   * depth row: the specialisation), CARRY the layer before's (a depth row: the
   * base topics).
   */
  topics?: boolean;
}

/** A row's stage key on the track: its own, else (a Field row without one) its gate level's; null when it has none. */
function rowStageKeyOf(ms: MilestoneDraft, track: CatalogTrack): StageKey | null {
  const keys = progressionStageKeysOf(track) as readonly string[];
  const st = ms.stage ?? null;
  if (st && (keys.includes(st) || (track === "FIELD" && (st === "BETWEEN" || st === "PART")))) return st;
  if (track !== "FIELD" || st != null) return null;
  const lv = rowLevelOf(ms);
  return lv != null ? stageOfLevel(lv) : null;
}

/**
 * A code-written catalog row the progression owns (origin CODE, worked out, a
 * practice, step or checkpoint): never the user's, and never a practice whose
 * sessions the user set (planSource YOURS: their plan for it stands).
 */
const isProgressionRow = (i: ItemDraft): boolean =>
  i.origin === CODE &&
  !!i.catalogKey &&
  (i.kind === "PRACTICE" || i.kind === "STEP" || i.kind === "CHECKPOINT") &&
  provenanceOf(i.origin, i.decision) === "WORKED_OUT" &&
  i.planSource !== "YOURS";

/** The user's own practices that share a stage's budget with code's (live, sized by code, not a progression row). */
const sharedPracticesOf = (ms: MilestoneDraft): ItemDraft[] => livePractices(ms).filter((p) => p.planSource !== "YOURS" && !isProgressionRow(p));

/** A stage's Domains' names (the caller's names over its DOMAIN labels), in item order. */
function stageNamesOf(ms: MilestoneDraft, names?: Readonly<Record<string, DomainName>>): DomainName[] {
  return rowDomainsOf(ms).map((d) => (names && Object.prototype.hasOwnProperty.call(names, d.id) ? names[d.id] : d.name));
}

/** A plan's chain and the progression's input over it (see the section's head). */
function chainOf(plan: readonly MilestoneDraft[], c: RowProgressionCtx, maxOf: (ms: MilestoneDraft, k: number) => number | null): { rows: MilestoneDraft[]; input: ProgressionInput } {
  const rows = planOrder(plan)
    .map((i) => plan[i])
    .filter((ms) => SCHEDULED.has(ms.status) && rowStageKeyOf(ms, c.track) != null);
  // One stage only (c.only): every other row is read as it stands, like an accepted one.
  const placedHere = (ms: MilestoneDraft): boolean => ms.status === "DRAFT" && (c.only == null || ms.lineageId === c.only);
  const stages: ProgressionStageInput[] = rows.map((ms) => {
    const stage = rowStageKeyOf(ms, c.track) as StageKey;
    const level = c.track === "FIELD" ? rowLevelOf(ms) : null;
    // Revision 5, lane 7: a TOPICS row names its chain role and layer (contracts §22.13, ProgressionStageInput.chain), and
    // a layer whose every topic is held or known is held. A LEVELS row spreads nothing, so its stage reads as before.
    const chain = c.topics === true ? { chain: { role: ms.chainRole ?? ("LAYER" as ChainRole), layer: ms.layer ?? null } } : {};
    if (isHeldRow(ms) || (c.topics === true && isChainHeldRow(ms))) return { stage, level, held: true, ...chain };
    if (!placedHere(ms))
      return {
        stage,
        level,
        carried: [...ms.items]
          .sort((a, b) => a.ord - b.ord)
          .filter(liveItem)
          .map((i) => i.catalogKey ?? null),
        ...chain,
      };
    return { stage, level, ...chain };
  });
  // Gemini's picks: each DRAFT gate or track stage's live GEMINI_PICK practice, then the reply's own (exact own keys only).
  const keys = progressionStageKeysOf(c.track) as readonly string[];
  const picks: Record<string, string> = Object.create(null) as Record<string, string>;
  rows.forEach((ms, k) => {
    const st = stages[k];
    if (!placedHere(ms) || st.held || !keys.includes(st.stage) || Object.prototype.hasOwnProperty.call(picks, st.stage)) return;
    const pick = [...ms.items].sort((a, b) => a.ord - b.ord).find((i) => i.kind === "PRACTICE" && liveItem(i) && i.notes.includes("GEMINI_PICK") && !!i.catalogKey);
    if (pick?.catalogKey) picks[st.stage] = pick.catalogKey;
  });
  const given = c.picks;
  if (given && typeof given === "object" && !Array.isArray(given))
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(given, key)) continue;
      const v = (given as Record<string, unknown>)[key];
      if (typeof v === "string") picks[key] = v;
    }
  // A dated exam's stage and its run-up (roadmap-catalog examStagesOf over the rows' windows: the first kept stage due on or
  // after the day, else the last; the run-up is that stage when the exam falls EXAM_PREP_MIN_DAYS or more into its window,
  // else the stage before). No day, no index (the last stage holds the exam).
  const placed = c.exam && c.examDay ? examStagesOf(rows.map((ms, k) => ({ start: ms.windowStart, due: ms.dueDay, held: stages[k].held === true })), c.examDay) : { examStage: null, examPrepStage: null };
  // Revision 5, lane 7 (ruling 44, decision 79): on a TOPICS plan a dated exam never lands mid-chain. Its stage is layer K at
  // the earliest; in layer K, layer K holds the run-up too; in a depth milestone, the milestone before holds it.
  let examStage: number | null = placed.examStage;
  let examPrepStage: number | null = placed.examPrepStage;
  if (c.topics === true && c.exam && examStage != null) {
    const lastLayer = rows.reduce((at, ms, k) => (ms.chainRole === "LAYER" && stages[k].held !== true ? k : at), -1);
    if (lastLayer >= 0 && examStage < lastLayer) examStage = lastLayer;
    examPrepStage = rows[examStage]?.chainRole === "DEPTH" ? Math.max(0, examStage - 1) : examStage;
  }
  return {
    rows,
    input: {
      track: c.track,
      stages,
      practicesAllowed: c.practicesAllowed,
      exam: c.exam,
      examStage,
      examPrepStage,
      // Revision 5, lane 7: the progression's TOPICS parts read the plan kind (contracts §22.13, ProgressionInput.planKind).
      ...(c.topics === true ? { planKind: "TOPICS" as PlanKind } : {}),
      // The skills the exam tests (contracts §20.12: a LANGUAGE plan's exam trains each), code's reading of its name.
      ...(c.exam ? { examSkills: languageExamSkillsOf(c.fill.exam ?? "") } : {}),
      family: c.family,
      excluded: [...c.blocked] as CatalogKey[],
      picks,
      maxPractices: rows.map((ms, k) => (placedHere(ms) && !stages[k].held ? maxOf(ms, k) : null)),
    },
  };
}

/**
 * The user's type changes on a stage (roadmap-server catalogPickOf: a code
 * row re-typed in the Edit sheet, origin CODE, decided EDITED): live catalog
 * rows of a slot that are EDITED code rows of a kind the progression doesn't
 * place there. Each took the place of one kind the progression wants that
 * the row lacks (and the user didn't remove), so that kind isn't added back
 * beside it and its place isn't counted twice in the room (contracts §20.10:
 * the user's swap covers it).
 */
function swapsOf(ms: MilestoneDraft, slot: string, placed: ReadonlySet<string>): ItemDraft[] {
  return ms.items.filter((i) => i.kind === slot && liveItem(i) && i.origin === CODE && i.decision === "EDITED" && !!i.catalogKey && !placed.has(i.catalogKey));
}

/** The kinds a stage holds a row of, live or removed (a REMOVED row is the user's no: never added back). */
const kindsOnRow = (ms: MilestoneDraft): Set<string> => new Set(ms.items.map((i) => i.catalogKey).filter((k): k is CatalogKey => !!k));

/**
 * The progression over a plan's rows, sized: each DRAFT stage's room is what
 * its budget holds (c.room) less the user's own practices sharing it, read
 * twice so a catalog kind of the user's that the progression places counts as
 * the progression's, and a practice the user re-typed counts in the place of
 * the kind it replaced, not beside it (swapsOf). Pure, so a re-read of the
 * synced plan gives the same.
 */
function rowProgressionOf(plan: readonly MilestoneDraft[], c: RowProgressionCtx): { rows: MilestoneDraft[]; input: ProgressionInput; progression: Progression } {
  const fit = (ms: MilestoneDraft): number => Math.min(PRACTICES_PER_MILESTONE, Math.max(1, c.room(ms) ?? PRACTICES_PER_MILESTONE));
  const first = chainOf(plan, c, (ms) => Math.max(1, fit(ms) - sharedPracticesOf(ms).length));
  const p1 = progressionOf(first.input);
  const second = chainOf(plan, c, (ms, k) => {
    const placed = new Set<string>(p1.stages[k]?.practices.map((x) => x.kind) ?? []);
    const shared = sharedPracticesOf(ms).filter((p) => !(p.catalogKey && placed.has(p.catalogKey))).length;
    const onRow = kindsOnRow(ms);
    const lacking = [...placed].filter((kind) => !onRow.has(kind)).length;
    const covered = Math.min(swapsOf(ms, "PRACTICE", placed).length, lacking);
    return Math.max(1, fit(ms) - (shared - covered));
  });
  return { rows: second.rows, input: second.input, progression: progressionOf(second.input) };
}

/**
 * Puts the progression on a plan's DRAFT rows, in place (see the section's
 * head). Returns each chain row's focus (lineage → the kind the stage trains),
 * which the allocation weighs first.
 */
function syncRowsInPlace(plan: MilestoneDraft[], c: RowProgressionCtx): Map<string, string> {
  const { rows, progression } = rowProgressionOf(plan, c);
  const focus = new Map<string, string>();
  rows.forEach((ms, k) => {
    const sp = progression.stages[k];
    if (sp.focus) focus.set(ms.lineageId, sp.focus);
    if (ms.status !== "DRAFT" || sp.held || sp.carried) return;
    // With `addOne` (one stage of a plan the user writes) only a practice is added; the stage's own rows all stay.
    const wanted: ProgressionItem[] = c.addOne ? [...sp.practices] : [...sp.practices, ...sp.steps, ...(sp.checkpoint ? [sp.checkpoint] : [])];
    const want = new Map<string, ProgressionItem>(wanted.map((x) => [x.kind, x]));
    const domains = stageNamesOf(ms, c.names);
    const fill = { track: c.track, domains: domains.length ? domains : undefined, aim: c.fill.aim ?? undefined, exam: c.fill.exam ?? undefined };
    // Revision 5, lane 7 (contracts §22.13): on a TOPICS row an item's {domains} follow its part, NEW the row's own Domains
    // and CARRY the layer before's (a depth row: the specialisation and the base topics). A LEVELS row reads `fill` as before.
    const parts = c.topics === true ? topicPartNamesOf(rows, k, c.names) : null;
    const namesFor = (x: ProgressionItem): DomainName[] => (parts ? (topicPartOf(x) === "CARRY" ? parts.carry : parts.own) : domains);
    const fillFor = (x: ProgressionItem): typeof fill => {
      if (!parts) return fill;
      const ds = namesFor(x);
      return { ...fill, domains: ds.length ? ds : undefined };
    };
    // Code's rows the progression no longer wants (or a second row of one kind) leave, with their checkpoint measure.
    const gone = new Set<string>();
    const seen = new Set<string>();
    ms.items = ms.items.filter((i) => {
      if (!liveItem(i) || !isProgressionRow(i) || c.addOne) return true;
      const key = i.catalogKey as string;
      if (want.has(key) && !seen.has(key)) {
        seen.add(key);
        return true;
      }
      gone.add(i.lineageId);
      return false;
    });
    if (gone.size) ms.measures = ms.measures.filter((x) => !(x.kind === "CHECKPOINT" && ((x.itemLineageId != null && gone.has(x.itemLineageId)) || (x.scope.itemLineageIds ?? []).some((id) => gone.has(id)))));
    // Code's rows it keeps: their notes follow the progression, their labels the stage's names.
    for (const it of ms.items) {
      if (!liveItem(it) || !isProgressionRow(it)) continue;
      const x = want.get(it.catalogKey as string);
      if (!x) continue;
      const notes = progressionNotesOf(x);
      // Gemini's pick of the kind code had placed there: shown as Gemini's choice, left for the user to decide (as a new one is).
      if (x.picked && !it.notes.includes("GEMINI_PICK") && it.decision === CODE_DECISION) it.decision = "PENDING";
      it.notes = [...it.notes.filter((n) => n !== "STUDY_ADDED" && n !== "PRODUCTION_ADDED" && n !== "GEMINI_PICK"), ...notes];
      try {
        // A practice that takes turns with another (contracts §20.12) says so in its words; one that no longer does, its own.
        it.label = progressionLabelOf({ kind: it.catalogKey as CatalogKey, alternate: x.alternate ?? null }, fillFor(x));
      } catch {
        // a label that can't be filled keeps its words
      }
    }
    // What it wants that the row lacks, in its priority order, within the caps; never a kind the user removed here, and
    // never one whose place the user's re-typed row took (swapsOf: each covers the first such kind of its slot).
    const cap: Readonly<Record<string, number>> = { PRACTICE: PRACTICES_PER_MILESTONE, STEP: STEPS_PER_MILESTONE, CHECKPOINT: CHECKPOINTS_PER_MILESTONE };
    const wantedKinds = new Set<string>(wanted.map((x) => x.kind));
    const swapped: Record<string, number> = {
      PRACTICE: swapsOf(ms, "PRACTICE", wantedKinds).length,
      STEP: swapsOf(ms, "STEP", wantedKinds).length,
      CHECKPOINT: swapsOf(ms, "CHECKPOINT", wantedKinds).length,
    };
    for (const x of wanted) {
      if (ms.items.some((i) => i.catalogKey === x.kind)) continue;
      if ((swapped[x.slot] ?? 0) > 0) {
        swapped[x.slot] -= 1;
        continue;
      }
      if (ms.items.filter((i) => i.kind === x.slot && liveItem(i)).length >= (cap[x.slot] ?? 0)) continue;
      const it = catalogItemOf(x.kind, {
        lineageId: c.makeId ? c.makeId() : `${ms.lineageId.slice(0, 40)}-pg-${x.kind.toLowerCase().slice(0, 18)}`,
        ord: nextItemOrd(ms),
        track: c.track,
        domains: namesFor(x),
        aim: c.fill.aim,
        exam: c.fill.exam,
        notes: progressionNotesOf(x),
        alternate: x.alternate ?? null,
      });
      if (!it) continue;
      if (x.picked) it.decision = "PENDING";
      ms.items.push(it);
      // "Add the app's practice" adds one at a tap: the next tap adds the next the progression places there.
      if (c.addOne) break;
    }
    // F-R4-13's notes: the stage's role has no slot left (the user's own practices fill them).
    const shape = progressionShapeOf(c.track, { stage: sp.stage, level: sp.level });
    const live = livePractices(ms);
    const short = c.practicesAllowed && shape != null && domains.length > 0 && !live.some((p) => practiceRoleOf(p) === shape) && live.length >= PRACTICES_PER_MILESTONE;
    setNote(ms, "NO_STUDY_SLOT", short && shape === "RETRIEVAL");
    setNote(ms, "NO_PRODUCTION_SLOT", short && shape === "PRODUCTION");
  });
  return focus;
}

/**
 * A DRAFT row's room for practices, read off the one figure allocate sizes the
 * stage within: its weekly practice budget, held to what keeps every judged
 * week of the window FITS (fitsRoomOf) but never under an equal split's
 * (allocate's ceiling). The room is the most practices n whose ceiling still
 * gives the focus two sessions a week and every other practice one at the
 * stage's band floor (practicesThatFitOf over that ceiling ≥ n), so a stage
 * whose weeks bind is never given a practice its sizing then thins the focus
 * for (two practices at one session each), and a stage that was tight keeps
 * its kinds rather than one practice taking the same minutes. null without dates.
 */
function roomOf(state: PlanState, ctx: Ctx): (ms: MilestoneDraft) => number | null {
  return (ms) => {
    if (!ms.windowStart || !ms.dueDay) return null;
    const from = maxDay(ms.windowStart, ctx.today);
    return roomWithin(practiceBudgetOf(ms, state.sim, ctx, from), fitsRoomOf(ms, state.sim, ctx, from), rowBandFloorOf(ms));
  };
}

/**
 * roomOf's count: the most practices n (1..PRACTICES_PER_MILESTONE) for which allocate's ceiling — min(budget,
 * max(fits, an equal split of the budget over n at the floor unit)) — holds n at practicesThatFitOf (the focus twice and
 * every other practice once at the floor, D30 without one); 1 at the least (the time verdict says OVER).
 */
function roomWithin(budget: number, fits: number, floor: PracticeBand | null): number {
  const unit = practiceBandMinutes(floor ?? "D30");
  const b = Number.isFinite(budget) ? Math.max(0, budget) : 0;
  for (let n = PRACTICES_PER_MILESTONE; n >= 2; n--) {
    const even = n * unit * Math.floor(b / (n * unit) + EPS);
    if (practicesThatFitOf(Math.min(b, Math.max(fits, even)), floor) >= n) return n;
  }
  return 1;
}

/** The plan's load as the allocation reads it (a depth plan's at its writing rate), for the room. */
function roomStateOf(plan: readonly MilestoneDraft[], input: RealismInput): { state: PlanState; ctx: Ctx } {
  const ctx = contextOf(input);
  // Revision 5, lane 7: a TOPICS plan's load is its chain's (the staged writing at the plan's rate).
  if (isTopicsInput(input)) {
    const core = chainCoreOfPlan(plan, input);
    if (core) return { state: depthStateOf(plan, core.model, ctx, core.rate ?? 0), ctx };
  }
  if (isDepthInput(input)) {
    const model = depthModelOfPlan(plan, input);
    if (model) {
      const dating = datingOf(input);
      return { state: depthStateOf(plan, model, ctx, dateCoreOf(plan, model, ctx, dating.mode, dating.userDate, dating.examDay).rate), ctx };
    }
  }
  return { state: planStateOf(plan, ctx), ctx };
}

/** The progression's context for a plan: the track, the exam (the intake's Yes; without it, a dated exam or an exam kind on the plan), the fill and the room. */
function rowProgressionCtxOf(
  track: CatalogTrack,
  input: Pick<RealismInput, "practicesAllowed" | "examDay">,
  intake: Intake | null | undefined,
  plan: readonly MilestoneDraft[],
  blocked: ReadonlySet<string>,
  room: (ms: MilestoneDraft) => number | null,
  extra: { picks?: unknown; names?: Readonly<Record<string, DomainName>>; makeId?: () => string } = {}
): RowProgressionCtx {
  const fills = intake ? aimFillsOf(intake) : null;
  const exam = fills
    ? fills.exam != null
    : input.examDay != null || plan.some((ms) => SCHEDULED.has(ms.status) && ms.items.some((i) => liveItem(i) && i.catalogKey != null && EXAM_ONLY_KINDS.has(i.catalogKey)));
  return {
    track,
    practicesAllowed: input.practicesAllowed,
    exam,
    examDay: exam ? (intake?.examDay ?? input.examDay ?? null) : null,
    family: track === "FIELD" && intake ? practiceFamilyOf(intake) : null,
    blocked,
    picks: extra.picks,
    fill: { aim: fills?.aim ?? null, exam: fills?.exam ?? null },
    room,
    names: extra.names,
    makeId: extra.makeId,
    // Revision 5, lane 7: a plan whose rows carry a chain role is a TOPICS plan (RowProgressionCtx.topics).
    ...(plan.some((ms) => ms.chainRole != null) ? { topics: true } : {}),
  };
}

/** What the plan-level progression reads besides the plan (contracts §19, §20). */
export interface PlanProgressionOpts {
  /** The plan's gate (roadmap-catalog allowedKindsFor): its `blocked` kinds are never placed. Absent: activityGateOf(intake). */
  gate?: Pick<ActivityGate, "blocked"> | null;
  /** More kinds never placed (the constraint filter's, a caller's own). */
  excluded?: Iterable<CatalogKey>;
  /** Gemini's picks (a v4 reply's `picks`, read as unknown: stage key → one kind; one outside the stage's candidates is ignored). Absent: each stage's live GEMINI_PICK practice. */
  picks?: unknown;
  /**
   * planProgressionOf only: each DRAFT stage's room for practices, given (a checker reading a built plan at the room it
   * was built with) instead of what the stage's budget holds at the plan's load. null: PRACTICES_PER_MILESTONE.
   */
  room?: (ms: MilestoneDraft) => number | null;
}

/** The plan's track as the progression reads it: FIELD on a Field Area, the Area's track otherwise. */
const planTrackOf = (intake: Pick<Intake, "fieldId" | "track">, input: Pick<RealismInput, "trackArea">): CatalogTrack => (intake.fieldId != null && !input.trackArea ? "FIELD" : intake.track);

/**
 * The practice progression of a plan as code places it (contracts §20): the
 * chain of its scheduled stages (plan order), the progression's input over
 * them (held rows held, accepted and started rows carried with their live
 * kinds, the exam's stage from its day, Gemini's picks, each DRAFT stage's
 * room from its budget, or `opts.room`) and roadmap-catalog progressionOf's
 * result. Pure; the rows are the plan's own. A built or synced plan's DRAFT
 * rows hold exactly this, so progressionViolationsOf(input, progression)
 * reads the plan (R2's and R4's checks run it over every plan path).
 */
export function planProgressionOf(
  plan: readonly MilestoneDraft[],
  intake: Intake,
  input: RealismInput,
  opts: PlanProgressionOpts = {}
): { rows: MilestoneDraft[]; input: ProgressionInput; progression: Progression } {
  let room = opts.room;
  if (!room) {
    const { state, ctx } = roomStateOf(plan, input);
    room = roomOf(state, ctx);
  }
  return rowProgressionOf(plan, rowProgressionCtxOf(planTrackOf(intake, input), input, intake, plan, blockedKindsOf(intake, opts), room, { picks: opts.picks }));
}

/**
 * What a v4 reply's validation reads of the dated plan it drafts on (R3's
 * KeysOnlyContext.progression; contracts §20.7: R4's runDraftCore over the
 * stage ladder), per issued slot (FOUNDATION … the depth's key, or
 * STAGE_1..STAGE_5), so the validator's own progression over the slots, and
 * with it which of Gemini's picks it keeps and what it logs
 * (keys.pick-code, keys.pick-reshaped), agrees with the plan R2 builds:
 *   - maxPractices: the room of the row holding the slot (planProgressionOf
 *     over the ladder: the row of that stage key, else the next kept row,
 *     else the last); null where that row has none (held, not a draft);
 *   - examStage and examPrepStage: a dated exam's stage and its run-up
 *     (examStagesOf over the rows' windows), each as the slot of its row, or
 *     for a BETWEEN or PART row the slot of the last gate or track row before
 *     it (so the slots after it read as after the exam, as the rows after it
 *     do), else the next one; null without a dated exam.
 * Pure; the ladder is not changed.
 */
export function slotProgressionOf(
  ladder: readonly MilestoneDraft[],
  intake: Intake,
  input: RealismInput,
  slots: readonly string[],
  opts: Pick<PlanProgressionOpts, "gate" | "excluded"> = {}
): { examStage: number | null; examPrepStage: number | null; maxPractices: (number | null)[] } {
  const pp = planProgressionOf(ladder, intake, input, opts);
  const rows = pp.rows;
  const rooms = Array.isArray(pp.input.maxPractices) ? (pp.input.maxPractices as readonly (number | null | undefined)[]) : [];
  const slotOfRow = (k: number): number => (pp.progression.stages[k]?.held ? -1 : slots.indexOf(rows[k]?.stage ?? ""));
  const placeOf = (stage: string): number => {
    const gate = (STAGE_KEYS as readonly string[]).indexOf(stage);
    return gate >= 0 ? gate : (TRACK_STAGE_KEYS as readonly string[]).indexOf(stage);
  };
  const maxPractices = slots.map((slot) => {
    const own = rows.findIndex((_, k) => slotOfRow(k) >= 0 && slots[slotOfRow(k)] === slot);
    const later = own >= 0 ? own : rows.findIndex((m, k) => slotOfRow(k) >= 0 && placeOf(m.stage ?? "") > placeOf(slot));
    const at = later >= 0 ? later : rows.length - 1;
    const room = at >= 0 ? rooms[at] : null;
    return typeof room === "number" && Number.isFinite(room) ? room : null;
  });
  const slotOf = (row: number | null | undefined): number | null => {
    if (row == null || row < 0 || row >= rows.length) return null;
    if (slotOfRow(row) >= 0) return slotOfRow(row);
    for (let k = row - 1; k >= 0; k--) if (slotOfRow(k) >= 0) return slotOfRow(k);
    for (let k = row + 1; k < rows.length; k++) if (slotOfRow(k) >= 0) return slotOfRow(k);
    return null;
  };
  const examStage = slotOf(pp.input.examStage);
  const prep = slotOf(pp.input.examPrepStage);
  return { examStage, examPrepStage: examStage == null ? null : prep == null ? null : Math.min(prep, examStage), maxPractices };
}

/**
 * The practice progression put on a plan's DRAFT rows (contracts §20; see
 * the section's head), pure: R4's re-sync after the gate or the plan changed,
 * and every plan path through fitPlan. Held rows stay empty; accepted and
 * started rows are never changed (their kinds are read). `names` maps the
 * Domains to their names (the rows' DOMAIN labels otherwise). The input is
 * not mutated.
 */
export function syncProgression(
  plan: readonly MilestoneDraft[],
  intake: Intake,
  input: RealismInput,
  names: Readonly<Record<string, DomainName>>,
  makeId: () => string,
  opts: PlanProgressionOpts = {}
): MilestoneDraft[] {
  const out = plan.map(cloneMilestone);
  const { state, ctx } = roomStateOf(out, input);
  syncRowsInPlace(out, rowProgressionCtxOf(planTrackOf(intake, input), input, intake, out, blockedKindsOf(intake, opts), roomOf(state, ctx), { picks: opts.picks, names, makeId }));
  return out;
}

/**
 * One stage's practices, steps and checkpoint (F-R4-13, contracts §20): the
 * milestone as syncProgression leaves it within `plan` (the plan it belongs
 * to, by lineage; alone without one), so its carry and its place in the
 * chain are the plan's. Only a DRAFT stage changes; the input milestone is
 * not mutated. `names` maps the stage's Domains to their names; `excluded`
 * holds the kinds the plan's gate blocks (R4 passes ActivityGate.blocked),
 * never placed. Without the intake (`opts.intake`) the stage's Field kinds
 * whose words need the aim or the exam's name are kept where they are, not added.
 */
export function syncStagePractices(
  m: MilestoneDraft,
  input: RealismInput,
  names: Readonly<Record<string, DomainName>>,
  makeId: () => string,
  excluded: Iterable<CatalogKey> = [],
  opts: { plan?: readonly MilestoneDraft[]; intake?: Intake | null } = {}
): MilestoneDraft {
  const plan = opts.plan && opts.plan.some((x) => x.lineageId === m.lineageId) ? opts.plan.map((x) => (x.lineageId === m.lineageId ? m : x)) : [m];
  const out = plan.map(cloneMilestone);
  const { state, ctx } = roomStateOf(out, input);
  // A track plan's labels need its aim: without the intake it is left as it is.
  if (!opts.intake && input.trackArea) return cloneMilestone(m);
  const track: CatalogTrack = opts.intake ? planTrackOf(opts.intake, input) : "FIELD";
  syncRowsInPlace(out, rowProgressionCtxOf(track, input, opts.intake ?? null, out, new Set<string>(excluded), roomOf(state, ctx), { names, makeId }));
  return out.find((x) => x.lineageId === m.lineageId) ?? cloneMilestone(m);
}

/**
 * "Add the app's practice" on one stage of a plan the user writes ("Write it
 * myself", an "Edit by hand" re-plan: the lead's ruling 6; R4's
 * addAppPracticeCore), pure: one practice on the DRAFT stage `lineageId`,
 * the first the practice progression places there (contracts §20, in its
 * priority: the focus, the exam's timed practice and core, the carry or the
 * opening partner, the spaced review, F-R4-13's shape) that the stage lacks,
 * within the room its weekly practice budget holds beside the user's own
 * practices, through the gate (its `blocked` kinds and `excluded` are never
 * placed). So the first tap gives the stage its role-defining kind (code's
 * default focus), and each tap after it the next the app would place, until
 * the stage holds them all (the plan comes back unchanged). Every other row
 * is read as it stands, never changed: the stage builds on what the user's
 * plan holds before it (its first catalog practice is what this stage
 * carries). Nothing of the stage leaves; its steps and checkpoint stay the
 * user's; a kind the user removed there never comes back. Sizes are left to
 * the re-fit (fitPlan with PlaceOpts.manual). `names` maps the Domains to
 * their names. The input is not mutated.
 */
export function addStagePracticesOf(
  plan: readonly MilestoneDraft[],
  lineageId: string,
  intake: Intake,
  input: RealismInput,
  names: Readonly<Record<string, DomainName>>,
  makeId: () => string,
  opts: Pick<PlanProgressionOpts, "gate" | "excluded"> = {}
): MilestoneDraft[] {
  const out = plan.map(cloneMilestone);
  if (!out.some((ms) => ms.lineageId === lineageId && ms.status === "DRAFT")) return out;
  const facts: RealismInput = intake.fieldId == null ? { ...input, trackArea: true } : input;
  const { state, ctx } = roomStateOf(out, facts);
  const c = rowProgressionCtxOf(planTrackOf(intake, facts), facts, intake, out, blockedKindsOf(intake, opts), roomOf(state, ctx), { names, makeId });
  syncRowsInPlace(out, { ...c, only: lineageId, addOne: true });
  return out;
}

/** Practices a plan plans from Fluent on (topRankIndexOfDepth's productionPlannedFromFluent): every unheld stage at level ≥ 10 holds a live production practice. */
export function productionPlannedFromFluentOf(plan: readonly MilestoneDraft[]): boolean {
  return plan
    .filter((ms) => SCHEDULED.has(ms.status) && !isHeldRow(ms) && (rowLevelOf(ms) ?? 0) >= STAGE_LEVEL.FLUENT)
    .every((ms) => livePractices(ms).some((p) => practiceRoleOf(p) === "PRODUCTION"));
}

/** A depth stage's code title: "{stage}: {domains} to level {L}+", "Toward Mastered: …", "{stage}, part 1: …"; null when it can't be written. */
function depthTitleOf(stage: StageKey | null | undefined, level: number, domains: readonly DomainName[]): string | null {
  if (!stage || domains.length === 0) return null;
  try {
    if ((STAGE_KEYS as readonly string[]).includes(stage)) return codeText("{stage}: {domains} to level {L}+", { stage: STAGE_NAMES[stage as GateStage], domains, level });
    if (stage === "BETWEEN") {
      const toward = stageLabelOf("BETWEEN", level);
      return toward ? codeText("{stage}: {domains} to level {L}+", { stage: toward, domains, level }) : null;
    }
    if (stage === "PART") {
      const gate = stageOfLevel(level);
      return gate ? codeText("{stage}, part 1: {domains} to level {L}+", { stage: STAGE_NAMES[gate], domains, level }) : null;
    }
  } catch {
    return null;
  }
  return null;
}

// ─── fitPlan, feasibilityOf, refit and Start on a depth plan ─────────────────

/** writingPlanOf on a depth plan: each required Domain's new cards per life week at the plan's writing rate (its share of the rate, by new_d). */
function depthWritingPlanOf(plan: readonly MilestoneDraft[], input: RealismInput & { depth: AimDepth }): { scopeKey: string; rateSource: RealismScope["rateSource"]; weeks: { weekStart: DayKey; cards: number }[] }[] {
  const model = depthModelOfPlan(plan, input);
  if (!model) return [];
  const dating = datingOf(input);
  const writes = writeDaysAt(model, dateCoreOf(plan, model, contextOf(input), dating.mode, dating.userDate, dating.examDay).rate);
  return model.doms
    .map((d) => {
      const weeks: { weekStart: DayKey; cards: number }[] = [];
      for (const w of writes.get(d.id) ?? []) {
        const ws = weekStartKeyOf(writeDayOf(w));
        const last = weeks[weeks.length - 1];
        if (last && last.weekStart === ws) last.cards += writeCountOf(w);
        else weeks.push({ weekStart: ws, cards: writeCountOf(w) });
      }
      return { scopeKey: d.id, rateSource: model.rateSource, weeks };
    })
    .sort((a, b) => (a.scopeKey < b.scopeKey ? -1 : a.scopeKey > b.scopeKey ? 1 : 0));
}

/**
 * fitPlan's depth branch (see fitPlan). `sync` false leaves the practices,
 * steps and checkpoints alone (a skeleton, and every re-fit of a plan the
 * user writes: "Write it myself", PlaceOpts.manual); otherwise the
 * practice progression is put on every DRAFT stage (syncRowsInPlace, within
 * each stage's room at the plan's load) before the allocation. `intake` gives
 * the exam and the aim's words (without it the exam is read off the plan, and
 * a kind whose words need the aim or the exam's name is kept, never added);
 * `picks` are Gemini's (a v4 reply's), over the stages' GEMINI_PICK rows.
 */
function fitDepth(
  plan: readonly MilestoneDraft[],
  input: RealismInput & { depth: AimDepth },
  opts: { makeId?: () => string; sync?: boolean; excluded?: Iterable<CatalogKey>; intake?: Intake | null; picks?: unknown }
): MilestoneDraft[] {
  const ctx = contextOf(input);
  const out = plan.map(cloneMilestone);
  const order = planOrder(out);
  const excluded = new Set<string>(opts.excluded ?? []);
  const cardsCache = new Map<string, CardState[]>();
  const cardsOf = (id: string): CardState[] => {
    const hit = cardsCache.get(id);
    if (hit) return hit;
    const c = domainCardsOf(input, id);
    cardsCache.set(id, c);
    return c;
  };
  const fit = (ms: MilestoneDraft) => fittable(ms) && !isHeldRow(ms);
  for (const i of order) {
    const ms = out[i];
    if (!fit(ms)) continue;
    for (const x of ms.measures) {
      if (x.kind !== "CARDS_AT_LEVEL" || x.minLevel == null || !(x.scope.domainIds?.length)) continue;
      const ids = x.scope.domainIds;
      const parsed = x.measureKey ? parseMeasureKey(x.measureKey) : null;
      const seg: CardSegment = parsed && parsed.kind === "CARDS_AT_LEVEL" && parsed.segment ? parsed.segment : x.minLevel === input.depth && ms.stage !== "PART" ? "rc" : "r";
      x.measureKey = cardsAtLevelKey(ids, x.minLevel, seg);
      x.baseline = ids.reduce((s, id) => s + heldCount(cardsOf(id), x.minLevel!, seg === "rc"), 0);
      x.baselineDay = ctx.today;
      x.fittedTarget = null;
    }
    const domains = rowDomainsOf(ms).map((d) => d.name);
    const level = rowLevelOf(ms);
    if (level != null && ms.titleOrigin === CODE && provenanceOf(CODE, ms.titleDecision) === "WORKED_OUT") {
      const t = depthTitleOf(ms.stage, level, domains);
      if (t) ms.title = t;
    }
    // A code-written catalog label follows its Domains' names (a renamed Domain); the user's edit (EDITED) keeps their words.
    for (const it of ms.items) {
      if (!it.catalogKey || it.origin !== CODE || it.decision === "REMOVED" || provenanceOf(it.origin, it.decision) !== "WORKED_OUT" || domains.length === 0) continue;
      const entry = catalogEntryOf(it.catalogKey);
      if (!entry || !entry.template.includes("{domains}")) continue;
      try {
        // A practice that takes turns (contracts §20.12) keeps its turn, read off its own words.
        it.label = progressionLabelOf({ kind: it.catalogKey, alternate: practiceTurnOfLabel(it.catalogKey, it.label) }, { track: "FIELD", domains });
      } catch {
        // a label that can't be filled keeps its words
      }
    }
  }
  const model = depthModelOfPlan(out, input);
  const dating = datingOf(input);
  const rate = model ? dateCoreOf(out, model, ctx, dating.mode, dating.userDate, dating.examDay).rate : 0;
  const state = model ? depthStateOf(out, model, ctx, rate) : planStateOf(out, ctx);
  // The practice progression (contracts §20): the load above reads no practice, so each stage's room is its budget's. A
  // skeleton or a plan the user writes (sync false) is sized as it stands, the app's practices on it weighed by their focus.
  const focus = opts.sync !== false ? syncRowsInPlace(out, rowProgressionCtxOf("FIELD", input, opts.intake, out, excluded, roomOf(state, ctx), { picks: opts.picks, makeId: opts.makeId })) : placedFocusOf(out);
  for (const i of order) {
    const ms = out[i];
    if (!fit(ms)) continue;
    const from = maxDay(ms.windowStart!, ctx.today);
    allocate(ms, state.sim, ctx, from, rowBandFloorOf(ms), focus?.get(ms.lineageId) ?? null);
    syncPracticeMeasures(ms, from, ctx);
    setNote(ms, "NOT_MEASURABLE", !ms.measures.some((x) => x.role === "PAYS"));
  }
  return out;
}

/** A Domain the model doesn't hold (a measure the user scoped outside R): its cards, no writing. */
function looseDomainOf(model: DepthModel, id: string): DepthDomain {
  const all = domainCardsOf(model.input, id);
  return { id, all, eff: reachCardsOf(all, model.today), live: all.filter(isRecallCard).length, n: 0, need: 0 };
}

/** One depth card measure's check (F-R4-11): FITS, TIGHT, OVER or IMPOSSIBLE against the reach model at the plan's rate; never FITTED (nothing is fitted). */
function depthKnowledgeOf(ms: MilestoneDraft, x: MeasureSpec, model: DepthModel, ctx: Ctx, rate: number): KnowledgeCheck {
  const L = x.minLevel!;
  const d = ms.dueDay!;
  const parsed = x.measureKey ? parseMeasureKey(x.measureKey) : null;
  const clean = !!parsed && parsed.kind === "CARDS_AT_LEVEL" && parsed.segment === "rc";
  const ids = x.scope.domainIds ?? [];
  const doms = ids.map((id) => model.doms.find((z) => z.id === id) ?? looseDomainOf(model, id));
  const writes = writeDaysAt(model, rate);
  let expected = 0;
  let best = 0;
  let strict = 0;
  let need = 0;
  for (const dm of doms) {
    const w = writes.get(dm.id) ?? [];
    expected += expectedOf(model, dm, L, d, rate, clean);
    best += passCountOf(model, dm, L, d, w, false, clean);
    strict += passCountOf(model, dm, L, d, w, true, clean);
    need += dm.need;
  }
  const target = x.target;
  const baseline = x.baseline ?? doms.reduce((s, dm) => s + heldCount(dm.all, L, clean), 0);
  let verdict: KnowledgeVerdict;
  if (target > strict) verdict = "IMPOSSIBLE";
  else if (target <= expected + EPS) verdict = "FITS";
  else if (target <= best) verdict = "TIGHT";
  else verdict = "OVER";
  const names = rowDomainsOf(ms);
  const who = ids.map((id) => String(names.find((n) => n.id === id)?.name ?? "this Domain")).join(", ");
  const by = dayText(d);
  const what = `${plural(target, "card", "cards")} in ${who} at level ${L}+ by ${by}`;
  const basis: string[] = [];
  const lastCardDay = addDays(d, -floorBase(L, model.m));
  if (verdict === "IMPOSSIBLE") {
    const floor = floorStrict(L, model.m);
    basis.push(
      addDays(ctx.today, floor) <= d
        ? `The app can't show ${plural(target, "card", "cards")} in ${who} at level ${L} by ${by}: even if every review passes on its day, at most ${strict} can get there. Move the date or choose a lower depth.`
        : `The app can't show ${plural(target, "card", "cards")} in ${who} at level ${L} by ${by}: a new card needs at least ${floor} days to get there here, and only ${strict} of your cards can make it in time. Move the date or choose a lower depth.`
    );
  } else if (verdict === "FITS") basis.push(`${what}: within what your reviews can be expected to bring (≈ ${Math.round(expected)}). Best case ${best}, if every review passes on its day.`);
  else if (verdict === "TIGHT") basis.push(`${what}: reachable only if every review passes on its day. Expected ≈ ${Math.round(expected)}; best case ${best}.`);
  else basis.push(`${what}: more than even the best case. Expected ≈ ${Math.round(expected)}; best case ${best}.`);
  if (clean) basis.push(`At level ${L} a card counts once it got there at the first try; one that got there on a next-day retry counts after its next review.`);
  basis.push("Multiple-choice cards don't count: recognising an answer isn't recalling it.");
  if (need > 0 && rate > 0) {
    const share = model.totalNeed > 0 ? (rate * need) / model.totalNeed : 0;
    basis.push(`${plural(need, "new card", "new cards")} to write in ${who}, at ≈ ${fmtRate(share)} a week; new cards written after ${dayText(lastCardDay)} can't reach level ${L} by ${by}.`);
  } else if (need > 0) basis.push("New cards aren't counted: no pace yet — enter a weekly number or re-date after 4 weeks.");
  basis.push(reachBasisLineOf(model));
  let earliestDay: DayKey | null = null;
  if (verdict === "IMPOSSIBLE") {
    earliestDay = firstDayWhere(ctx.today, (day) => doms.reduce((s, dm) => s + passCountOf(model, dm, L, day, writes.get(dm.id) ?? [], true, clean), 0) >= target);
    basis.push(earliestDay ? `The earliest it fits is ${dowText(earliestDay)}.` : "No date within 3 years fits it.");
  }
  return {
    measureKey: x.measureKey ?? cardsAtLevelKey(ids, L, clean ? "rc" : "r"),
    level: L,
    verdict,
    target,
    fitted: null,
    baseline,
    expected: round1(expected),
    best,
    strictMax: strict,
    bestCase: false,
    earliestDay,
    lastCardDay,
    basis,
  };
}

function depthMilestoneFeasibilityOf(ms: MilestoneDraft, state: PlanState, model: DepthModel, ctx: Ctx, rate: number, fromOverride?: DayKey): MilestoneFeasibility {
  const from = fromOverride ?? maxDay(ms.windowStart!, ctx.today);
  const knowledge = ms.measures
    .filter((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS" && x.minLevel != null && (x.scope.domainIds?.length ?? 0) > 0)
    .map((x) => depthKnowledgeOf(ms, x, model, ctx, rate));
  const rows = weeksOf(
    ms,
    from,
    state,
    ctx,
    model.doms.map((d) => ({ key: d.id, lastCardDay: ms.dueDay! }))
  );
  const time = timeCheckOf(ms, from, rows, state, ctx, rowBandFloorOf(ms));
  let worst: KnowledgeVerdict | TimeVerdict = time.verdict;
  for (const k of knowledge) if (SEVERITY[k.verdict] > SEVERITY[worst]) worst = k.verdict;
  const basis: string[] = [];
  if (!ms.measures.some((x) => x.role === "PAYS")) basis.push("No measurable part — add a Domain or a practice.");
  basis.push(...planNotesOf(ctx));
  return { kind: "PLAN", lineageId: ms.lineageId, ord: ms.ord, knowledge, time, worst, basis, remedies: [], weeks: rows.map((r) => r.week), lastCardDay: knowledge[0]?.lastCardDay ?? null };
}

/** The offers on a depth plan (F-R4-11): the realistic date (when the user's is earlier and the realistic one is within 3 years) and a lower depth (below Mastered there is less to lower to). */
function depthRemediesOf(check: DateCheck, model: DepthModel): Remedy[] {
  const out: Remedy[] = [];
  if (check.D_real && check.verdict !== "FITS" && daysBetween(model.today, check.D_real) <= SPAN_MAX_DAYS) out.push("USE_REALISTIC_DATE");
  if (model.L > AIM_DEPTHS.RETAINED) out.push("LOWER_DEPTH");
  return out;
}

/** The aim check's line on a depth plan (F-R4-13). */
function depthAimLineOf(aimCheck: AimCheck): string {
  if (aimCheck.kind === "unchecked") return "Aim not checked: the app doesn't know how long this usually takes. The date follows the cards' schedule and the practice the plan sets.";
  return aimCheck.coversAll
    ? `Your hours cover all of the ${aimCheck.typicalHours} h you entered${aimCheck.source ? ` (source: ${aimCheck.source})` : ""}.`
    : `Your hours cover ${aimCheck.coverHours} of the ${aimCheck.typicalHours} h you entered${aimCheck.source ? ` (source: ${aimCheck.source})` : ""}.`;
}

/** feasibilityOf's depth branch (see feasibilityOf). A depth plan with no card measure left is judged as rev 3 judges a plan without one. */
function judgeDepth(plan: readonly MilestoneDraft[], input: RealismInput & { depth: AimDepth }, withRemedies: boolean): { fe: Feasibility; open: MilestoneFeasibility[] } {
  const model = depthModelOfPlan(plan, input);
  if (!model) {
    const r = judgePlan(plan, { ...input, depth: null }, false);
    r.fe.reachModel = REACH_MODEL_VERSION;
    return r;
  }
  const ctx = contextOf(input);
  const dating = datingOf(input);
  const core = dateCoreOf(plan, model, ctx, dating.mode, dating.userDate, dating.examDay);
  const state = depthStateOf(plan, model, ctx, core.rate);
  const judged: { mf: MilestoneFeasibility; carried: boolean }[] = [];
  const open: MilestoneFeasibility[] = [];
  for (const idx of planOrder(plan)) {
    const ms = plan[idx];
    if (!inPlan(ms) || isHeldRow(ms) || ms.dueDay! < ctx.today) continue;
    const mf = depthMilestoneFeasibilityOf(ms, state, model, ctx, core.rate);
    judged.push({ mf, carried: CARRIED.has(ms.status) });
    if (!CARRIED.has(ms.status)) open.push(mf);
  }
  // As judgePlan: a row the plan can still change comes before a carried row of its own lineage.
  const milestones: MilestoneFeasibility[] = [];
  const placed = new Set<number>();
  for (let i = 0; i < judged.length; i++) {
    if (placed.has(i)) continue;
    if (judged[i].carried) {
      for (let j = i + 1; j < judged.length; j++) {
        if (placed.has(j) || judged[j].carried || judged[j].mf.lineageId !== judged[i].mf.lineageId) continue;
        milestones.push(judged[j].mf);
        placed.add(j);
      }
    }
    milestones.push(judged[i].mf);
  }
  const aimCheck = aimCheckOf(ctx);
  const basis: string[] = [reachBasisLineOf(model)];
  if (Math.abs(ctx.m - 1) > EPS) basis.push(spacingLine(ctx.m));
  if (input.areaInMaintenance) basis.push(MAINTENANCE_LINE);
  basis.push(depthAimLineOf(aimCheck));
  if (!productionPlannedFromFluentOf(plan) && model.L === AIM_DEPTHS.MASTERED)
    basis.push("Paragon needs practice that uses what you know from Fluent on. Allow practices to keep it open.");
  const impossible = open.some((m) => m.worst === "IMPOSSIBLE") || core.check.verdict === "IMPOSSIBLE";
  const over = open.some((m) => m.time.verdict === "OVER" || m.knowledge.some((k) => k.verdict === "OVER")) || core.check.verdict === "OVER";
  const remedies = withRemedies && (impossible || over || core.check.verdict !== "FITS") ? depthRemediesOf(core.check, model) : [];
  for (const m of open) m.remedies = m.worst === "IMPOSSIBLE" || m.worst === "OVER" ? [...remedies] : [];
  return {
    fe: { today: ctx.today, m: ctx.m, milestones, aimCheck, basis, remedies, impossible, over, reachModel: REACH_MODEL_VERSION, dateCheck: core.check },
    open,
  };
}

/** D_real for a depth plan (the realistic date at today's cards); null past SPAN_MAX_DAYS or not dated. */
function realisticDayOf(plan: readonly MilestoneDraft[], input: RealismInput & { depth: AimDepth }): DayKey | null {
  const model = depthModelOfPlan(plan, input);
  if (!model) return null;
  const d = dateCoreOf(plan, model, contextOf(input), "REALISTIC", null, input.examDay ?? null).check.D_real;
  return d && daysBetween(input.today, d) <= SPAN_MAX_DAYS ? d : null;
}

/**
 * The re-date of a depth plan (refit, USE_REALISTIC_DATE, CALIBRATED,
 * "Re-date later milestones"): each unstarted stage, in order, gets the
 * Sunday on or after its stage day from today's cards at the plan's writing
 * rate ("PLAN": the date check's on the input's mode; "REALISTIC": r_plan,
 * the final stage on D_real), at least a week after the stage before it; the
 * final one never before the user's date in CHOSEN mode; a BETWEEN placed as
 * the ladder places it (betweenDueOf: no stretch after it over
 * MILESTONE_MAX_DAYS when the next stage is held later). Counts, levels,
 * Domains and the stage structure never change; started and held rows are
 * never touched. Re-dated rows come back as DRAFT (the new version R4
 * writes), then fitted.
 */
function redateDepth(plan: readonly MilestoneDraft[], input: RealismInput & { depth: AimDepth }, mode: "PLAN" | "REALISTIC", opts: PlaceOpts = {}): MilestoneDraft[] {
  const out = plan.map(cloneMilestone);
  const model = depthModelOfPlan(out, input);
  const place = depthPlaceOf(opts);
  if (!model) return fitDepth(out, input, place);
  const ctx = contextOf(input);
  const dating = mode === "REALISTIC" ? { mode: "REALISTIC" as DateMode, userDate: null, examDay: input.examDay ?? null } : datingOf(input);
  const core = dateCoreOf(out, model, ctx, dating.mode, dating.userDate, dating.examDay);
  const order = planOrder(out);
  const movable = order.filter((i) => fittable(out[i]) && !isHeldRow(out[i]));
  const lastIdx = movable[movable.length - 1];
  let prevDue = addDays(ctx.today, -1);
  for (const i of order) {
    const ms = out[i];
    if (CARRIED.has(ms.status) && ms.dueDay) {
      prevDue = maxDay(prevDue, ms.dueDay);
      continue;
    }
    if (!fittable(ms) || isHeldRow(ms)) continue;
    const level = rowLevelOf(ms);
    const t = rowTargetsOf(ms);
    const sd = level != null && !core.notDated && t.targets.size > 0 ? stageDayIn(model, level, core.rate, { clean: t.clean, targets: t.targets, only: t.only }) : null;
    let due = sd ? sundayOnOrAfter(sd) : ms.dueDay!;
    if (i === lastIdx) {
      if (dating.mode === "REALISTIC" && core.check.D_real) due = maxDay(due, core.check.D_real);
      if (dating.mode === "CHOSEN" && dating.userDate) due = maxDay(due, dating.userDate);
    }
    const start = maxDay(ctx.today, addDays(prevDue, 1));
    due = maxDay(due, maxDay(addDays(prevDue, 7), addDays(start, 6)));
    ms.windowStart = start;
    ms.dueDay = due;
    ms.status = "DRAFT";
    prevDue = due;
  }
  // The split's placement, as the ladder places it (betweenDueOf): a re-dated BETWEEN whose next stage is held later
  // than the reach would put it (the hours bound, or the user's date) moves toward it, so the stretch after it stays
  // within MILESTONE_MAX_DAYS; the next stage's window then starts the day after. Started rows are never touched.
  for (let k = 0; k + 1 < movable.length; k++) {
    const ms = out[movable[k]];
    const nx = out[movable[k + 1]];
    if (ms.stage !== "BETWEEN" || !ms.dueDay || !nx.dueDay || !ms.windowStart) continue;
    // A started row between the two sets the next window's start: leave both as dated.
    if (order.slice(order.indexOf(movable[k]) + 1, order.indexOf(movable[k + 1])).some((i) => CARRIED.has(out[i].status))) continue;
    if (daysBetween(ms.dueDay, nx.dueDay) <= MILESTONE_MAX_DAYS) continue;
    const moved = betweenDueOf(ms.dueDay, addDays(ms.windowStart, -1), nx.dueDay);
    if (moved <= ms.dueDay || daysBetween(moved, nx.dueDay) < MILESTONE_MIN_DAYS) continue;
    ms.dueDay = moved;
    nx.windowStart = addDays(moved, 1);
  }
  const finalDue = lastIdx != null ? out[lastIdx].dueDay : null;
  const next: RealismInput & { depth: AimDepth } =
    mode === "REALISTIC" ? { ...input, targetDay: finalDue ?? input.targetDay, dateMode: "REALISTIC", userDate: null } : { ...input, targetDay: finalDue && finalDue > input.targetDay ? finalDue : input.targetDay };
  return fitDepth(out, next, place);
}

/** refitForStart's depth branch (see refitForStart). */
function refitForStartDepth(milestone: MilestoneDraft, plan: readonly MilestoneDraft[], input: RealismInput & { depth: AimDepth }): StartRefit {
  const ctx = contextOf(input);
  const ms = cloneMilestone(milestone);
  ms.windowStart = ctx.today;
  const others = plan.filter((p) => p.lineageId !== milestone.lineageId && !(milestone.id != null && p.id === milestone.id));
  const full = [...others.map(cloneMilestone), ms];
  const model = depthModelOfPlan(full, input);
  if (!model || ms.dueDay == null) {
    const state = planStateOf(full, ctx);
    if (ms.dueDay != null) {
      allocate(ms, state.sim, ctx, ctx.today, rowBandFloorOf(ms), rowFocusOf(ms));
      syncPracticeMeasures(ms, ctx.today, ctx);
    }
    return { milestone: ms, feasibility: ms.dueDay != null ? milestoneFeasibilityOf(ms, state, ctx, ctx.today, false) : emptyFeasibility(ms), todayCheck: null, impossible: false };
  }
  const dating = datingOf(input);
  const core = dateCoreOf(full, model, ctx, dating.mode, dating.userDate, dating.examDay);
  // "At today's cards": the realistic writing rate, so a slip shows here instead of hiding behind a faster pace the plan would now ask.
  const rate = core.realisticRate;
  const state = depthStateOf(full, model, ctx, rate);
  allocate(ms, state.sim, ctx, ctx.today, rowBandFloorOf(ms), rowFocusOf(ms));
  syncPracticeMeasures(ms, ctx.today, ctx);
  const feasibility = depthMilestoneFeasibilityOf(ms, state, model, ctx, rate, ctx.today);
  // The stage's own date check, on F-R4-11's ladder: FITS by its realistic day; TIGHT by its day at your full pace;
  // OVER by its best case at twice your pace (and its floor); IMPOSSIBLE before that. Not dated: by its card checks.
  const level = rowLevelOf(ms);
  const t = rowTargetsOf(ms);
  const planned = ms.dueDay;
  let realistic: DayKey | null = null;
  let verdict: DateVerdict;
  if (level != null && t.targets.size > 0 && !core.notDated) {
    const q: StageQuery = { clean: t.clean, targets: t.targets, only: t.only };
    const sd = stageDayIn(model, level, rate, q);
    realistic = sd ? sundayOnOrAfter(sd) : null;
    const full = stageDayIn(model, level, core.fullRate, q);
    // The spare only (no pace): as the date check, only its floor (the spare written today) is impossible; before the held cards' best case it is OVER.
    const impossibleBound = core.spareOnly
      ? strictStageDayOf(model, level, null, q)
      : laterOf(strictStageDayOf(model, level, OVER_PACE_FACTOR * core.sourceRate, q), strictStageDayOf(model, level, null, q));
    verdict = !beforeDay(planned, realistic) ? "FITS" : !beforeDay(planned, full) ? "TIGHT" : !beforeDay(planned, impossibleBound) ? "OVER" : "IMPOSSIBLE";
  } else {
    verdict = "FITS";
    for (const k of feasibility.knowledge) if (k.verdict !== "FITTED" && SEVERITY[k.verdict] > SEVERITY[verdict]) verdict = k.verdict;
  }
  return { milestone: ms, feasibility, todayCheck: null, impossible: verdict === "IMPOSSIBLE", stageDate: { planned, realistic, verdict } };
}

/** startSnapshotOf's depth branch (see startSnapshotOf); a TOPICS row's too (revision 5, lane 7: it reads no depth, so the input type is widened). */
function startSnapshotDepth(milestone: MilestoneDraft, refitted: StartRefit, input: RealismInput, startedDay: DayKey): StartSnapshot {
  const ctx = contextOf({ ...input, today: startedDay });
  const dueDay = milestone.dueDay ?? refitted.milestone.dueDay ?? startedDay;
  const derived = reachInputsOf(input.throughput, ctx.m);
  const reach = input.reach ?? derived.params;
  const calibrating = input.calibrating ? [...input.calibrating] : [...derived.calibrating];
  const level = rowLevelOf(milestone);
  const lastCardDay = level != null ? addDays(dueDay, -floorBase(level, ctx.m)) : null;
  const newNeededByDomain: Record<string, number> = {};
  const ids: string[] = [];
  for (const [id, target] of rowTargetsOf(milestone).targets) {
    const live = domainCardsOf(input, id).filter(isRecallCard).length;
    newNeededByDomain[id] = writeNeedOf(target, live);
    ids.push(id);
  }
  const newNeeded = Object.values(newNeededByDomain).reduce((s, n) => s + n, 0);
  const rateSource = ids.length ? sourceRateOf(input, ids).rateSource : "NONE";
  const plan = new Map(refitted.feasibility.weeks.map((w) => [w.weekStart, w]));
  const raw: { w: DayKey; fw: number }[] = [];
  for (let w = weekStartKeyOf(startedDay); w <= dueDay; w = addDays(w, 7)) {
    const a = maxDay(w, startedDay);
    const b = minDay(addDays(w, 6), dueDay);
    const writeTo = lastCardDay == null ? null : minDay(b, lastCardDay);
    raw.push({ w, fw: writeTo == null || writeTo < a ? 0 : openDays(a, writeTo, ctx.held) / 7 });
  }
  const wwStart = raw.reduce((s, r) => s + r.fw, 0);
  const weeks: StartWeek[] = raw.map(({ w, fw }) => {
    const pw = plan.get(w);
    const byDomain: Record<string, number> = {};
    for (const id of ids) byDomain[id] = wwStart > 0 ? (newNeededByDomain[id] * fw) / wwStart : 0;
    return {
      weekStart: w,
      newPerWeek: pw?.newPerWeek ?? 0,
      practiceMin: pw?.practiceMin ?? 0,
      reviewMin: pw?.reviewMin ?? 0,
      availableMin: pw?.availableMin ?? null,
      availableClass: pw?.availableClass ?? ctx.cap.class,
      needRate: wwStart > 0 ? (newNeeded * fw) / wwStart : 0,
      fw,
      needRateByDomain: byDomain,
    };
  });
  return {
    kind: "START",
    startedDay,
    dueDay,
    weeks,
    lastCardDay,
    pStart: reach.p,
    pCalibrating: calibrating.includes("p"),
    yieldStart: level != null ? Math.pow(reach.p, level - 1) : 1,
    newNeededStart: newNeeded,
    wwStart,
    rateSource,
    m: ctx.m,
    feasibility: refitted.feasibility,
    reachModel: REACH_MODEL_VERSION,
    pLongStart: reach.pLong,
    cStart: reach.c,
    rhoStart: reach.rho,
    calibrating,
    newNeededByDomain,
  };
}

// ─── The stage ladder (F-R4-10) ──────────────────────────────────────────────

/** One row of a depth ladder before it becomes a milestone. */
interface LadderRow {
  stage: StageKey;
  level: number;
  /** The expected stage day (before the Sunday snap); null when not dated. */
  stageDay: DayKey | null;
  due: DayKey;
  /** The count per Domain: n_d at a gate, a count gate's own. */
  targets: Map<string, number>;
  held: boolean;
  longWindow: boolean;
}

type LadderRefusal = { ok: false; reason: "HELD" | "TOO_SOON" | "TOO_FAR" | "NO_PACE" | "NO_DOMAINS"; error: string };

const HELD_ERROR = "You already hold this depth in these Domains. Add a Domain, raise coverage or set a different aim.";
const TOO_SOON_ERROR = "This depth is only weeks away: add a Domain, raise coverage or choose a deeper aim.";
const TOO_SOON_DATE_ERROR = "A plan needs at least 5 weeks: choose a later date.";
const TOO_FAR_ERROR = "At your pace this depth is realistic in more than 3 years. Narrow the aim to fewer Domains, write more cards a week, or choose a lower depth.";
const TOO_FAR_HOURS_ERROR = "With the hours you have, this depth is realistic in more than 3 years: the new cards have to slow down to leave time for your practice. Raise your hours, narrow the aim to fewer Domains, or choose a lower depth.";
const NO_PACE_ERROR = "The app needs a pace to date your milestones. Enter how many new cards a week you'll write.";
const NO_DOMAINS_ERROR = "Choose at least one Domain for this aim.";

/**
 * The ladder's rows (F-R4-10), in order: held gates first (no rank, no
 * items), then the kept gates with the count gate and the intermediate
 * gates. `finalDue` is the last stage's due day (D_real, or the user's
 * date); `notDated` spreads the gates evenly to it (no pace).
 */
function ladderRowsOf(model: DepthModel, rate: number, finalDue: DayKey, notDated: boolean): { ok: true; rows: LadderRow[] } | LadderRefusal {
  const L = model.L;
  const today = model.today;
  const nMap = new Map(model.doms.map((d) => [d.id, d.n]));
  const gapAt = (level: number): number => model.doms.reduce((s, d) => s + Math.max(0, d.n - heldCount(d.all, level, level === L)), 0);
  if (gapAt(L) === 0) return { ok: false, reason: "HELD", error: HELD_ERROR };
  // (The realistic date under SPAN_MIN_DAYS is refused before, in stageLadderOf's words; here the date is the user's.)
  if (daysBetween(today, finalDue) < SPAN_MIN_DAYS) return { ok: false, reason: "TOO_SOON", error: TOO_SOON_DATE_ERROR };
  const gates = THRESHOLDS.filter((l) => l <= L);
  const held: LadderRow[] = [];
  let i = 0;
  for (; i < gates.length && gates[i] < L && gapAt(gates[i]) === 0; i++) {
    held.push({ stage: stageOfLevel(gates[i]) as GateStage, level: gates[i], stageDay: today, due: today, targets: new Map(nMap), held: true, longWindow: false });
  }
  // A gate short by 1 or 2 is not a milestone: it merges into the next (the final gate always stays).
  const rest = gates.slice(i).filter((l) => l === L || gapAt(l) >= MIN_INCREMENT_CARDS_FLOOR);
  let kept: LadderRow[] = rest.map((level, k) => {
    const isFinal = level === L;
    let stageDay: DayKey | null;
    let due: DayKey;
    if (notDated) {
      stageDay = null;
      due = isFinal ? finalDue : sundayOnOrAfter(addDays(today, Math.round(((k + 1) * daysBetween(today, finalDue)) / rest.length)));
    } else {
      stageDay = stageDayIn(model, level, rate, { clean: isFinal });
      due = isFinal ? finalDue : stageDay ? sundayOnOrAfter(stageDay) : finalDue;
    }
    if (due > finalDue) due = finalDue;
    return { stage: stageOfLevel(level) as GateStage, level, stageDay, due, targets: new Map(nMap), held: false, longWindow: false };
  });
  // Merge: a window under MILESTONE_MIN_DAYS drops its lower gate (the gate itself when the lower point is today); the final never.
  kept = mergeShortWindows(kept, today, (r) => r.due, (r) => r.level === L);
  // The count gate (PART): one, before the first kept gate, when its window is longer than FIRST_RANK_MAX_DAYS.
  const g1 = kept[0];
  if (!notDated && g1) {
    const len = daysBetween(today, g1.due);
    if (len > FIRST_RANK_MAX_DAYS) {
      const due = sundayOnOrAfter(addDays(today, Math.min(FIRST_RANK_MAX_DAYS, Math.floor(len / 2))));
      if (daysBetween(today, due) >= MILESTONE_MIN_DAYS && daysBetween(due, g1.due) >= MILESTONE_MIN_DAYS) {
        const targets = new Map<string, number>();
        for (const d of model.doms) {
          const f = Math.floor(expectedOf(model, d, g1.level, due, rate, false) + 1e-9);
          if (f < MIN_INCREMENT_CARDS_FLOOR || d.n - 1 < MIN_INCREMENT_CARDS_FLOOR) continue;
          const t = clamp(f, MIN_INCREMENT_CARDS_FLOOR, d.n - 1);
          if (t <= heldCount(d.all, g1.level, false)) continue;
          targets.set(d.id, t);
        }
        if (targets.size > 0) kept = [{ stage: "PART", level: g1.level, stageDay: due, due, targets, held: false, longWindow: false }, ...kept];
      }
    }
  }
  // A first window still over MILESTONE_MAX_DAYS has no gate below it: LONG_WINDOW on the first gate.
  const firstGate = kept.findIndex((r) => r.stage !== "PART");
  if (firstGate >= 0) {
    const from = firstGate === 0 ? today : kept[firstGate - 1].due;
    if (daysBetween(from, kept[firstGate].due) > MILESTONE_MAX_DAYS) kept[firstGate].longWindow = true;
  }
  // The split: a later window over MILESTONE_MAX_DAYS between two gates gets one BETWEEN at the odd level below its upper gate.
  const splits: { row: LadderRow; len: number }[] = [];
  for (let k = firstGate + 1; firstGate >= 0 && k < kept.length; k++) {
    const a = kept[k - 1];
    const b = kept[k];
    if (a.stage === "PART" || b.stage === "PART") continue;
    const len = daysBetween(a.due, b.due);
    const level = b.level - 1;
    if (len <= MILESTONE_MAX_DAYS || level <= a.level) continue;
    const sd = notDated ? addDays(a.due, Math.round(len / 2)) : stageDayIn(model, level, rate, { clean: false });
    if (!sd) continue;
    const due = betweenDueOf(sd, a.due, b.due);
    if (daysBetween(a.due, due) < MILESTONE_MIN_DAYS || daysBetween(due, b.due) < MILESTONE_MIN_DAYS) continue;
    splits.push({ row: { stage: "BETWEEN", level, stageDay: notDated ? null : sd, due, targets: new Map(nMap), held: false, longWindow: false }, len });
  }
  // At most MAX_MILESTONES rows: the count gate first, then the splits of the longest windows.
  splits.sort((x, y) => y.len - x.len || x.row.level - y.row.level);
  while (held.length + kept.length + splits.length > MAX_MILESTONES && splits.length > 0) splits.pop();
  const rows = [...kept, ...splits.map((s) => s.row)].sort((x, y) => (x.due < y.due ? -1 : x.due > y.due ? 1 : x.level - y.level || (x.stage === "PART" ? -1 : 1)));
  return { ok: true, rows: [...held, ...rows] };
}

/**
 * A BETWEEN gate's due day in the window `lower` → `upper` (F-R4-10's split;
 * fix round, contracts §15.15): the Sunday on or after its stage day `sd`, as
 * every gate's. When the upper gate is held later than the reach would put it
 * (the hours bound D_hours, or a user's date past D_real: the slack sits in
 * the final window), that would leave the stretch after the split over
 * MILESTONE_MAX_DAYS; then it is placed no earlier than upper −
 * MILESTONE_MAX_DAYS, or at the window's middle when one split can't bring
 * both halves under the bound (a window over twice it). Never before its
 * stage day, so it is never earlier than realistic; a reach-bound window
 * (the usual L11, whose stage day is past upper − MILESTONE_MAX_DAYS) keeps
 * its stage day. The caller still asks MILESTONE_MIN_DAYS on both sides.
 */
function betweenDueOf(sd: DayKey, lower: DayKey, upper: DayKey): DayKey {
  const half = addDays(lower, Math.floor(daysBetween(lower, upper) / 2));
  return sundayOnOrAfter(maxDay(sd, minDay(addDays(upper, -MILESTONE_MAX_DAYS), half)));
}

/**
 * The merge rule (F-R4-10), until stable: a window under MILESTONE_MIN_DAYS
 * between two consecutive points (today, then each row's due day) drops its
 * lower row (the row itself when the lower point is today); the final row is
 * never dropped. Choice (the order is the spec's to leave open): the windows
 * are read from the final one back, so evenly spaced short windows keep every
 * other row (a 125-day track plan keeps two stages, not one); the worked
 * examples merge the same either way.
 */
function mergeShortWindows<T>(rows: readonly T[], today: DayKey, dueOf: (r: T) => DayKey, isFinal: (r: T) => boolean): T[] {
  let kept = [...rows];
  for (let changed = true; changed; ) {
    changed = false;
    for (let k = kept.length - 1; k >= 0; k--) {
      const lower = k === 0 ? today : dueOf(kept[k - 1]);
      if (daysBetween(lower, dueOf(kept[k])) >= MILESTONE_MIN_DAYS) continue;
      const drop = k === 0 ? kept[0] : kept[k - 1];
      if (isFinal(drop)) continue;
      kept = kept.filter((r) => r !== drop);
      changed = true;
      break;
    }
  }
  return kept;
}

/** The intake's required Domains R (named, at most DEPTH_DOMAINS_MAX) with their facts from the input's cards. */
function requiredDomainsOf(intake: Intake, input: RealismInput, names: Readonly<Record<string, DomainName>>): { id: string; name: DomainName; live: number; nonRecall: number }[] {
  const out: { id: string; name: DomainName; live: number; nonRecall: number }[] = [];
  for (const id of Array.from(new Set(intake.domainIds))) {
    if (!Object.prototype.hasOwnProperty.call(names, id)) continue;
    const cards = domainCardsOf(input, id);
    const live = cards.filter(isRecallCard).length;
    out.push({ id, name: names[id], live, nonRecall: cards.length - live });
    if (out.length >= DEPTH_DOMAINS_MAX) break;
  }
  return out;
}

/** stageLadderOf's options. */
export interface StageLadderOpts {
  /**
   * 'STARTER' (the default, "Build from my numbers"; R4's ladder for a
   * Gemini draft too): the practice progression on every stage (contracts
   * §20: its practices, steps and checkpoint, each stage within its room),
   * and the outline lines split across the stages in order. 'NONE': the
   * skeleton only (Domains, measures, dates, titles): "Write it myself".
   */
  items?: "STARTER" | "NONE";
  /** The outline lines as TOPIC items (default: with STARTER only). */
  lines?: boolean;
  /**
   * The outline's lines in learning order, as line indices (a v4 reply's
   * `order` through roadmap-types outlineOrderOf; contracts §20.5): split
   * across the kept stages in that order (outlineStagesOf), each line once,
   * any line left out appended in the user's order. Absent: the user's order.
   */
  order?: readonly number[] | null;
  /**
   * Gemini's picks (a v4 reply's `picks`, read as unknown: stage key → one
   * kind among that stage's candidates; contracts §20.5, §20.11). With
   * STARTER a valid pick is added beside the stage's focus (code's default,
   * which stays), written GEMINI_PICK and left for the user to decide; absent
   * or invalid, nothing is added.
   */
  picks?: unknown;
  /** Types the constraint filter left out (R3's constraintExclusionsOf): code never places one. */
  excluded?: Iterable<CatalogKey>;
  /**
   * Confirm to unlock (contracts §19): the plan's gate (roadmap-catalog
   * allowedKindsFor; R4 passes activityGateOf(intake, the parser's
   * exclusions)). Its `blocked` kinds are never placed, beside `excluded`; on
   * a track plan a blocked starter kind gives way to a safe one
   * (trackStarterKindsOf). Absent: activityGateOf(intake) (the cue gate and
   * the user's stored answers, without the parser's words).
   */
  gate?: Pick<ActivityGate, "blocked"> | null;
  /**
   * The counts each Domain's coverage policy reads, frozen at intake (fix
   * round, contracts §15.3): R4 passes roadmap-types
   * frozenCoverageCountsOf(today's counts, the prior acceptance's or draft's
   * Feasibility.coverage) when it rebuilds a ladder after the first draft (a
   * re-plan's redraft), so a stage's n_d and the end state's terms agree. A
   * Domain without an entry (new to R), or with a malformed one, reads
   * today's library. Only the policy reads them: the writing need (new_d)
   * and every reach read today's cards, so cards written since intake still
   * count toward the need.
   */
  counts?: readonly CoverageCounts[];
}

/** The live and multiple-choice counts a Domain's coverage reads: the frozen entry when there is a well-formed one, else today's. */
function coverageCountsOf(f: { id: string; live: number; nonRecall: number }, frozen: ReadonlyMap<string, CoverageCounts> | null): { live: number; nonRecall: number } {
  const c = frozen?.get(f.id);
  if (!c || typeof c.live !== "number" || !Number.isFinite(c.live) || c.live < 0) return { live: f.live, nonRecall: f.nonRecall };
  return { live: Math.floor(c.live), nonRecall: typeof c.nonRecall === "number" && Number.isFinite(c.nonRecall) && c.nonRecall >= 0 ? Math.floor(c.nonRecall) : 0 };
}

/** A frozen-count map from StageLadderOpts.counts (the first entry for an id wins); null without one. */
function frozenMapOf(counts: readonly CoverageCounts[] | undefined): Map<string, CoverageCounts> | null {
  if (!counts) return null;
  const out = new Map<string, CoverageCounts>();
  for (const c of counts) if (c && typeof c.id === "string" && !out.has(c.id)) out.set(c.id, c);
  return out;
}

/** stageLadderOf's result: the stage milestones (held rows included, with HELD_AT_START), or a refusal in words. */
export type StageLadderResult =
  | {
      ok: true;
      plan: MilestoneDraft[];
      /** The expected stage day per level (gates and BETWEEN; a held gate is today) at the plan's writing rate; a track plan's by stage number (1..5). */
      stageDays: Record<number, DayKey | null>;
      /** The date check (null on a track plan). */
      dateCheck?: DateCheck | null;
      /** R's coverage, with every term (empty on a track plan). */
      coverage?: CoverageBreakdown[];
      /** Each response-schema slot (a gate stage, or STAGE_k) → the lineage of the milestone its items go to (a merged or held stage's: the next kept one). */
      slotTo?: Partial<Record<StageKey, string>>;
      /** The new cards a week the plan writes at (null: none needed, no pace, or a track plan). */
      rate?: number | null;
      /** The depth's end state (depthTermsOf; empty on a track plan). */
      endState?: EndStateTerm[];
    }
  | { ok: false; reason: "HELD" | "TOO_SOON" | "TOO_FAR" | "NO_PACE" | "NO_DOMAINS"; error: string };

/** The aim as YoursText, and the exam's name when the user said there is one. */
function aimFillsOf(intake: Intake): { aim: YoursText; exam: YoursText | null } {
  const exam = intake.examLabel && intake.examLabel.trim() && intake.exam !== false ? (intake.examLabel.replace(/\s+/g, " ").trim() as YoursText) : null;
  return { aim: aimText(intake.aim), exam };
}

/** The milestones of a depth ladder's rows (see stageLadderOf). */
function depthMilestonesOf(
  rows: readonly LadderRow[],
  model: DepthModel,
  intake: Intake,
  domains: readonly { id: string; name: DomainName }[],
  lineDomains: readonly (string | null)[],
  makeId: () => string,
  opts: StageLadderOpts
): MilestoneDraft[] {
  const starter = (opts.items ?? "STARTER") === "STARTER";
  const withLines = opts.lines ?? starter;
  const nameOf = new Map(domains.map((d) => [d.id, d.name]));
  const kept = rows.filter((r) => !r.held);
  const lines = withLines ? (intake.syllabus?.lines ?? []) : [];
  // The outline split across the kept stages in its order (Gemini's, a v4 reply's `order`; else the user's), every line once.
  const chunks = outlineStagesOf(lineOrderOf(opts.order, lines.length), Math.max(1, kept.length));
  const out: MilestoneDraft[] = [];
  let prevDue: DayKey | null = null;
  let k = -1;
  rows.forEach((row, idx) => {
    const ids = [...row.targets.keys()];
    const names = ids.map((id) => nameOf.get(id)).filter((n): n is DomainName => n != null);
    const title = depthTitleOf(row.stage, row.level, names) ?? "";
    const windowStart = row.held ? model.today : prevDue == null ? model.today : addDays(prevDue, 1);
    const ms = blankMilestone(makeId(), idx + 1, { start: windowStart, end: row.due }, title, CODE, CODE_DECISION);
    ms.stage = row.stage;
    if (row.held) {
      ms.notes.push("HELD_AT_START");
      out.push(ms);
      return;
    }
    k += 1;
    prevDue = row.due;
    if (row.longWindow) ms.notes.push("LONG_WINDOW");
    let ord = 0;
    for (const id of ids) {
      ms.items.push({
        id: null,
        lineageId: makeId(),
        kind: "DOMAIN",
        ord: ord++,
        label: String(nameOf.get(id) ?? ""),
        rawLabel: null,
        origin: "USER",
        decision: "KEPT",
        domainId: id,
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
        addToToday: true,
        templateId: null,
        flags: [],
        notes: [],
      });
    }
    for (const ref of chunks[k] ?? []) {
      const ld = lineDomains[ref] ?? null;
      ms.items.push({
        id: null,
        lineageId: makeId(),
        kind: "TOPIC",
        ord: ord++,
        label: lines[ref],
        rawLabel: null,
        origin: "SYLLABUS",
        decision: "KEPT",
        domainId: ld != null && nameOf.has(ld) ? ld : null,
        proposedName: null,
        syllabusRef: ref,
        method: null,
        sessionsPerWeek: null,
        durationBand: null,
        rule: null,
        planSource: null,
        checkpointKind: null,
        outOf: null,
        bar: null,
        addToToday: true,
        templateId: null,
        flags: [],
        notes: [],
      });
    }
    // The starter's practices, steps and checkpoint are the practice progression's (contracts §20), put on the rows by
    // fitDepth once the plan's load sets each stage's room (stageLadderOf: syncRowsInPlace).
    for (const [id, target] of row.targets) {
      const isFinal = row.level === model.L && row.stage !== "PART";
      const cov = model.doms.find((d) => d.id === id);
      ms.measures.push({
        id: null,
        kind: "CARDS_AT_LEVEL",
        role: "PAYS",
        scope: { domainIds: [id] },
        minLevel: row.level,
        target,
        targetSource: row.stage === "PART" ? "WORKED_OUT" : (typedOf(intake, id) != null ? "YOURS" : "DEPTH"),
        fittedTarget: null,
        rateSource: model.rateSource,
        baseline: cov ? heldCount(cov.all, row.level, isFinal) : 0,
        baselineDay: model.today,
        unit: "card",
        itemLineageId: null,
        measureKey: cardsAtLevelKey([id], row.level, isFinal ? "rc" : "r"),
      });
    }
    out.push(ms);
  });
  return out;
}

/**
 * The outline's lines in learning order (StageLadderOpts.order), read as
 * unknown: each valid line index once, in the order given, then every line it
 * left out in the user's order, so no line is ever lost (roadmap-types
 * outlineOrderOf's rule over indices). Absent or not an array: the user's order.
 */
function lineOrderOf(order: unknown, lines: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  if (Array.isArray(order))
    for (const v of order) {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= lines || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  for (let i = 0; i < lines; i++) if (!seen.has(i)) out.push(i);
  return out;
}

/** The user's typed coverage figure for a Domain (Roadmap.coverage), if valid. */
function typedOf(intake: Intake, id: string): number | null {
  const c = intake.coverage;
  if (!c || !Object.prototype.hasOwnProperty.call(c, id)) return null;
  const v = c[id];
  return typeof v === "number" && Number.isInteger(v) && v >= COVER_MIN && v <= COVER_MAX ? v : null;
}

/** Each slot (a gate stage) → the lineage of the milestone its items go to: its own row, else (merged or held) the next kept gate row. */
function slotMapOf(plan: readonly MilestoneDraft[], L: number): Partial<Record<StageKey, string>> {
  const out: Partial<Record<StageKey, string>> = {};
  const gateRows = plan.filter((ms) => !isHeldRow(ms) && ms.stage && (STAGE_KEYS as readonly string[]).includes(ms.stage));
  for (const level of THRESHOLDS.filter((l) => l <= L)) {
    const stage = stageOfLevel(level) as GateStage;
    const row = gateRows.find((ms) => (rowLevelOf(ms) ?? 0) >= level);
    if (row) out[stage] = row.lineageId;
  }
  return out;
}

/**
 * The stage ladder from Foundation to the depth (F-R4-10, F-R4-11), dated
 * from the card pipeline: "Build from my numbers" (items STARTER) and the
 * skeleton a Gemini draft or "Write it myself" fills (items NONE).
 *
 * R is the intake's chosen Domains that have a name (`names`), at most
 * DEPTH_DOMAINS_MAX (R4 passes confirmed additions and named Domains among
 * intake.domainIds); n_d is coverageOf's, over the counts frozen at intake
 * when R4 passes them (opts.counts), else today's; the depth is intake.depth
 * (else input.depth, else Mastered). The writing rate is the date check's: r_plan
 * in REALISTIC mode (the final stage on D_real) or in CHOSEN mode on a date
 * that fits (the final stage on the user's date); the least rate that meets
 * the user's date when it is TIGHT or OVER; every rate within what the hours
 * hold (capRateOf: the writing slows before a practice drops under its band
 * floor).
 *
 * Refusals (decision 41): the final gate already held (HELD); a realistic
 * date under SPAN_MIN_DAYS away, or a user's date under it (TOO_SOON); a
 * realistic date past SPAN_MAX_DAYS (TOO_FAR); REALISTIC mode with new cards
 * needed and no pace (NO_PACE); no named Domain (NO_DOMAINS). In CHOSEN mode
 * with no pace the stages spread evenly to the user's date ("Not dated").
 * New cards that are only WRITE_MARGIN's spare (every Domain already holds
 * n_d in recall cards) need no pace: with none, the plan is dated on the
 * cards held (rate null, no new card counted), in either mode, unless those
 * cards don't reach the depth within SPAN_MAX_DAYS (then as above).
 *
 * Every row carries its stage; held rows carry HELD_AT_START and nothing
 * else; every count is the depth's (a count gate's is its own, worked out);
 * the final stage's measures are the depth terms (`rc`); titles are code's.
 * A track Area gets its practice stages (STAGE_1..STAGE_5 at
 * TRACK_STAGE_SHARES of the time to its date, the same merge rule).
 *
 * The practice progression (contracts §20; items STARTER): every stage's
 * practices, steps and checkpoint are roadmap-catalog progressionOf's, each
 * stage within the room its weekly practice budget holds at the plan's load
 * (practicesThatFitOf), through the gate; Gemini's valid picks (opts.picks)
 * are added beside their stages' focus (GEMINI_PICK, left to the user to
 * decide), and the outline is split in Gemini's order (opts.order).
 */
export function stageLadderOf(intake: Intake, input: RealismInput, names: Readonly<Record<string, DomainName>>, makeId: () => string, opts0: StageLadderOpts = {}): StageLadderResult {
  // The one gate (contracts §19): the gate's blocked kinds join `excluded`, so no stage, checkpoint or re-sync below places one.
  const opts: StageLadderOpts = { ...opts0, excluded: blockedKindsOf(intake, opts0), gate: GATE_APPLIED };
  if (input.trackArea || intake.fieldId == null) return trackLadderOf(intake, { ...input, trackArea: true }, makeId, opts);
  const L: AimDepth = isAimDepth(intake.depth) ? intake.depth : isAimDepth(input.depth) ? input.depth : AIM_DEPTHS[DEPTH_DEFAULT];
  const dinput: RealismInput & { depth: AimDepth } = { ...input, depth: L, trackArea: false };
  const facts = requiredDomainsOf(intake, dinput, names);
  if (facts.length === 0) return { ok: false, reason: "NO_DOMAINS", error: NO_DOMAINS_ERROR };
  const domains = facts.map((f) => ({ id: f.id, name: f.name }));
  const lineDomains = lineDomainsOf(intake, domains.map((d) => ({ id: d.id, name: String(d.name) })));
  const frozen = frozenMapOf(opts.counts);
  const coverage = coverageOf({ domains: facts.map((f) => ({ id: f.id, name: String(f.name), ...coverageCountsOf(f, frozen) })), lineDomains, typed: intake.coverage ?? null });
  const model = depthModelOf(dinput, L, coverage.map((c) => ({ id: c.domainId, n: c.n })));
  const ctx = contextOf(dinput);
  const mode: DateMode = intake.dateMode ?? input.dateMode ?? "REALISTIC";
  const userDate = mode === "CHOSEN" ? (input.userDate ?? intake.targetDay) : null;
  const examDay = aimFillsOf(intake).exam ? (intake.examDay ?? input.examDay ?? null) : null;
  if (model.doms.every((d) => heldCount(d.all, L, true) >= d.n)) return { ok: false, reason: "HELD", error: HELD_ERROR };
  const hasPace = model.sourceRate != null && model.sourceRate > 0;
  // The spare alone (spareOnlyOf) needs no pace: the date check dates it on the cards held, or leaves it not dated (finalDue null below).
  if (mode === "REALISTIC" && model.totalNeed > 0 && !hasPace && !spareOnlyOf(model)) return { ok: false, reason: "NO_PACE", error: NO_PACE_ERROR };

  const build = (core: DateCore): { ok: true; plan: MilestoneDraft[] } | LadderRefusal => {
    const check = core.check;
    if (!core.notDated) {
      if (check.D_real == null || daysBetween(model.today, check.D_real) > SPAN_MAX_DAYS) return { ok: false, reason: "TOO_FAR", error: core.capped ? TOO_FAR_HOURS_ERROR : TOO_FAR_ERROR };
      if (mode === "REALISTIC" && daysBetween(model.today, check.D_real) < SPAN_MIN_DAYS) return { ok: false, reason: "TOO_SOON", error: TOO_SOON_ERROR };
    }
    const finalDue = mode === "REALISTIC" ? (check.D_real as DayKey) : (userDate ?? (check.D_real as DayKey));
    if (finalDue == null) return { ok: false, reason: "NO_PACE", error: NO_PACE_ERROR };
    const rows = ladderRowsOf(model, core.rate, finalDue, core.notDated);
    if (!rows.ok) return rows;
    const ms = depthMilestonesOf(rows.rows, model, intake, domains, lineDomains, makeId, opts);
    const next: RealismInput & { depth: AimDepth } = { ...dinput, targetDay: finalDue, dateMode: mode, userDate };
    // "Build from my numbers" puts the practice progression on every stage (contracts §20); a skeleton (NONE) stays empty.
    return { ok: true, plan: fitDepth(ms, next, { makeId, sync: (opts.items ?? "STARTER") === "STARTER", excluded: opts.excluded, intake, picks: opts.picks }) };
  };

  const built = build(dateCoreOf(null, model, ctx, mode, userDate, examDay));
  if (!built.ok) return built;
  const plan = built.plan;
  const finalCore = dateCoreOf(plan, model, ctx, mode, userDate, examDay);
  const stageDays: Record<number, DayKey | null> = {};
  for (const ms of plan) {
    if (ms.stage === "PART") continue;
    const lv = rowLevelOf(ms);
    if (lv == null) continue;
    stageDays[lv] = isHeldRow(ms) ? model.today : finalCore.notDated ? null : stageDayIn(model, lv, finalCore.rate, { clean: lv === L });
  }
  const baselines: Record<string, number> = {};
  for (const d of model.doms) baselines[d.id] = heldCount(d.all, L, true);
  return {
    ok: true,
    plan,
    stageDays,
    dateCheck: finalCore.check,
    coverage,
    slotTo: slotMapOf(plan, L),
    rate: finalCore.rate > 0 ? Math.round(finalCore.rate * 100) / 100 : null,
    endState: depthTermsOf(L, coverage, baselines, model.today),
  };
}

/**
 * The kinds no code path here places (confirm to unlock, contracts §19): the
 * gate's `blocked` (the caller's, else roadmap-catalog activityGateOf over
 * the intake: the cue gate and the user's stored answers, without the
 * parser's words) together with the caller's `excluded`. Replaces F-R4-17's
 * non-empty-constraints test: on every BODY or CARE plan, whatever its words
 * (and on a CRAFT plan whose words carry a cue or can't be read), every gated
 * kind is blocked until the user answers the activity card under the current
 * words (contracts §19, the safety-gaps round).
 */
export function blockedKindsOf(intake: Intake | null, opts: { gate?: Pick<ActivityGate, "blocked"> | null; excluded?: Iterable<CatalogKey> } = {}): Set<CatalogKey> {
  const out = new Set<CatalogKey>(opts.excluded ?? []);
  const gate = opts.gate ?? (intake ? activityGateOf(intake) : null);
  for (const k of gate?.blocked ?? []) out.add(k);
  return out;
}

/** A gate already folded into `excluded` (stageLadderOf's inner calls): nothing more to block, nothing to work out again. */
const GATE_APPLIED: Pick<ActivityGate, "blocked"> = { blocked: [] };

/**
 * The practice types the progression places on a track stage at place p
 * (1-based) of a full five-stage track plan with no exam, through `blocked`
 * (contracts §19, §20): roadmap-catalog progressionOf's practices for that
 * stage (its focus, the carry or the opening partner, the track's spaced
 * review), a blocked kind giving way to the track's safe kinds (BODY's easy,
 * mobility and technique sessions; CARE's planning the week and keeping a
 * log; CRAFT's technique session). A BODY plan whose card waits gets only
 * safe sessions; a waiting CARE plan gets planning the week and keeping a
 * log, so it is never empty (decision 2).
 */
export function trackStarterKindsOf(track: Track, place: number, blocked: ReadonlySet<string>): CatalogKey[] {
  const p = progressionOf({ track, stages: TRACK_STAGE_KEYS.map((stage) => ({ stage })), practicesAllowed: true, exam: false, excluded: [...blocked] as CatalogKey[] });
  return (p.stages[place - 1]?.practices ?? []).map((x) => x.kind);
}

/**
 * A track plan's stages (F-R4-10, "Track plans"): STAGE_1..STAGE_5 at
 * TRACK_STAGE_SHARES of the practice volume to the user's date (practice
 * accrues on open days, so a stage is due once its share of the open days
 * has passed; choice: typicalHours, where given, is the date check's, not
 * the stages'), each due on the Sunday on or after (the last on the date),
 * with the same merge rule; the kept rows then stand at consecutive stages
 * from the base (trackStagePlacesOf, the lead's ruling 4: a short plan
 * climbs STAGE_1 → STAGE_2…, never the later key a merge kept, never a
 * jump to STAGE_5). Titles "{aim} · stage {k} of {n}" (k
 * the place among the kept stages). The starter's practices, steps and checkpoint are
 * the practice progression's (contracts §20: progressionOf over the kept
 * stages, each within the room its weekly practice budget holds, through the
 * gate: on BODY and CARE, and on CRAFT while the user's words carry a cue,
 * only the safe kinds until the user answers the activity card).
 */
function trackLadderOf(intake: Intake, input: RealismInput, makeId: () => string, opts: StageLadderOpts): StageLadderResult {
  const today = input.today;
  const target = intake.targetDay ?? input.targetDay;
  const span = daysBetween(today, target);
  if (span < SPAN_MIN_DAYS) return { ok: false, reason: "TOO_SOON", error: TOO_SOON_DATE_ERROR };
  if (span > SPAN_MAX_DAYS) return { ok: false, reason: "TOO_FAR", error: "A plan reaches at most 3 years ahead: choose an earlier date." };
  const held = new Set(input.heldDays);
  const total = openDays(today, target, held);
  const shareDay = (share: number): DayKey => {
    const need = share * total;
    let n = 0;
    for (let d = today; d <= target; d = addDays(d, 1)) {
      if (!held.has(d)) n += 1;
      if (n + EPS >= need) return d;
    }
    return target;
  };
  type TrackRow = { k: number; due: DayKey };
  let kept: TrackRow[] = TRACK_STAGE_SHARES.map((s, i) => ({ k: i + 1, due: i === TRACK_STAGE_SHARES.length - 1 ? target : minDay(sundayOnOrAfter(shareDay(s)), target) }));
  kept = mergeShortWindows(kept, today, (r) => r.due, (r) => r.k === TRACK_STAGE_SHARES.length);
  // The kept rows' stages, consecutive from the base (the lead's ruling 4: a short plan never skips the base, nor jumps a
  // rung): the first is STAGE_1 (STAGE_2 from a working or strong start), each next row the next stage; a full plan keeps
  // STAGE_1..STAGE_5.
  const places = trackStagePlacesOf(kept.length, intake.startPoint ?? input.startPoint);
  kept = kept.map((row, i) => ({ ...row, k: places[i] }));
  const starter = (opts.items ?? "STARTER") === "STARTER";
  // The one gate (contracts §19): what the caller's gate (or the intake's own) and `excluded` leave out is never placed.
  const blocked = blockedKindsOf(intake, opts);
  const { aim } = aimFillsOf(intake);
  const n = kept.length;
  const plan = kept.map((row, i) => {
    let title = "";
    try {
      title = codeText("{aim} · stage {k} of {n}", { aim, k: i + 1, n });
    } catch {
      title = "";
    }
    const ms = blankMilestone(makeId(), i + 1, { start: i === 0 ? today : addDays(kept[i - 1].due, 1), end: row.due }, title, title ? CODE : "USER", title ? CODE_DECISION : "PENDING");
    ms.stage = TRACK_STAGE_KEYS[row.k - 1];
    if (intake.track === "BODY") ms.notes.push("HEALTH_LINE");
    return ms;
  });
  const fitInput: RealismInput = { ...input, targetDay: target, trackArea: true };
  // Each stage key → the row that holds it (its own row, else, merged, the next kept one; past the last kept, the last).
  const holderOf = (k: number): number => {
    const at = kept.findIndex((r) => r.k >= k);
    return at >= 0 ? at : kept.length - 1;
  };
  let focus = new Map<string, string>();
  if (starter) {
    // The practice progression (contracts §20), each stage within the room its weekly practice budget holds; a pick
    // Gemini made for a merged stage key reaches the row that holds it (when it is one of that row's candidates).
    const { state, ctx } = roomStateOf(plan, fitInput);
    const picks = mergedPicksOf(opts.picks, intake.track, kept.map((r) => r.k), holderOf, { exam: aimFillsOf(intake).exam != null, practicesAllowed: fitInput.practicesAllowed, blocked });
    focus = syncRowsInPlace(plan, rowProgressionCtxOf(intake.track, fitInput, intake, plan, blocked, roomOf(state, ctx), { picks, makeId }));
  }
  const fitted = fitWith(plan, fitInput, { makeId, focus });
  const stageDays: Record<number, DayKey | null> = {};
  for (const row of kept) stageDays[row.k] = row.due;
  const slotTo: Partial<Record<StageKey, string>> = {};
  for (let k = 1; k <= TRACK_STAGE_KEYS.length; k++) if (kept.length > 0) slotTo[TRACK_STAGE_KEYS[k - 1]] = fitted[holderOf(k)].lineageId;
  return { ok: true, plan: fitted, stageDays, dateCheck: null, coverage: [], slotTo, rate: null, endState: [] };
}

/**
 * The track stages (1..5) a track plan's n kept rows stand at (the lead's
 * ruling 4): consecutive stages from the base, never a jump. The first row
 * is STAGE_1, or STAGE_2 from a WORKING or STRONG start point (one rung of
 * base at most is skipped), and each row after it is the next stage, so a
 * short plan merged to two rows climbs STAGE_1 → STAGE_2 (a 4-month 10K
 * builds its base, then its technique, and closes on the full attempt
 * there), never STAGE_1 → STAGE_5 (from easy running straight to the hardest
 * sessions). A full plan (five rows) is STAGE_1..STAGE_5 whatever the start
 * point; one row is the first stage (the base, which then also closes).
 */
export function trackStagePlacesOf(n: number, startPoint: StartPoint | null | undefined): number[] {
  const top = TRACK_STAGE_KEYS.length;
  if (!Number.isInteger(n) || n <= 0) return [];
  const rows = Math.min(n, top);
  const ahead = startPoint === "WORKING" || startPoint === "STRONG" ? 1 : 0;
  const from = 1 + Math.max(0, Math.min(ahead, top - rows));
  return Array.from({ length: rows }, (_, i) => from + i);
}

/**
 * Gemini's picks for a merged track plan (contracts §20.5): each kept row's
 * own key's pick, else a pick made for a stage key the row holds (merged
 * into it), nearest first, when it is one of the row's own candidates on
 * this run (through the gate); every other key is left out. Read as unknown,
 * exact own keys only.
 */
function mergedPicksOf(
  given: unknown,
  track: CatalogTrack,
  places: readonly number[],
  holderOf: (k: number) => number,
  run: { exam: boolean; practicesAllowed: boolean; blocked: ReadonlySet<string> }
): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  if (!given || typeof given !== "object" || Array.isArray(given)) return out;
  const pickAt = (key: string): string | null => {
    if (!Object.prototype.hasOwnProperty.call(given, key)) return null;
    const v = (given as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  };
  places.forEach((k, i) => {
    const own = TRACK_STAGE_KEYS[k - 1];
    const cands = progressionCandidatesOf(track, { stage: own }, { exam: run.exam, practicesAllowed: run.practicesAllowed, excluded: [...run.blocked] as CatalogKey[] }) as readonly string[];
    const held = TRACK_STAGE_KEYS.map((_, j) => j + 1)
      .filter((j) => j !== k && holderOf(j) === i)
      .sort((a, b) => Math.abs(a - k) - Math.abs(b - k) || b - a);
    for (const j of [k, ...held]) {
      const v = pickAt(TRACK_STAGE_KEYS[j - 1]);
      if (v != null && cands.includes(v)) {
        out[own] = v;
        break;
      }
    }
  });
  return out;
}

/**
 * A track plan's practices, steps and checkpoint after its gate changed (the
 * user's answer, a re-plan; R4's setActivityVerdictsCore and re-plan), pure:
 * the practice progression put on every DRAFT stage (contracts §20; see "The
 * practice progression on a plan's rows"), its chain the plan's scheduled
 * stages with the accepted and started ones carried. A kind the answer
 * released is placed where the progression places it, a safe kind standing
 * in for one now released leaves when code placed it, and the activity
 * itself (the full attempt, the performance check) comes in on the last
 * stage once the gate places it. Never a kind the user removed there (a
 * REMOVED row), never past the caps; the user's own rows always stay. With
 * `input` each stage's room is its weekly practice budget's; without it, up
 * to PRACTICES_PER_MILESTONE. `since` (the blocked kinds the rows were built
 * with) is accepted and no longer read: the progression is a function of the
 * plan and the gate, and a REMOVED row keeps the user's no. A Field plan
 * comes back as it was. The input is not mutated.
 */
export function syncTrackStarter(
  plan: readonly MilestoneDraft[],
  intake: Intake,
  makeId: () => string,
  opts: Pick<StageLadderOpts, "gate" | "excluded" | "picks"> & { since?: Iterable<CatalogKey>; input?: RealismInput } = {}
): MilestoneDraft[] {
  const out = plan.map(cloneMilestone);
  if (intake.fieldId != null) return out;
  const blocked = blockedKindsOf(intake, opts);
  let room: (ms: MilestoneDraft) => number | null = () => null;
  const input = opts.input ? { ...opts.input, trackArea: true } : null;
  if (input) {
    const { state, ctx } = roomStateOf(out, input);
    room = roomOf(state, ctx);
  }
  const facts = input ?? { practicesAllowed: intake.practicesAllowed, examDay: intake.examDay ?? null };
  syncRowsInPlace(out, rowProgressionCtxOf(intake.track, facts, intake, out, blocked, room, { picks: opts.picks, makeId }));
  return out;
}

// ─── The motivation timeline (F-R4-10) ───────────────────────────────────────

/** The plan holds an outside standard: an exam-day checkpoint anywhere, or a live checkpoint on its last stage (question 7). */
function hasStandardOf(plan: readonly MilestoneDraft[]): boolean {
  const rows = planOrder(plan)
    .map((i) => plan[i])
    .filter((ms) => SCHEDULED.has(ms.status) && !isHeldRow(ms));
  const last = rows[rows.length - 1];
  const live = (ms: MilestoneDraft) => ms.items.filter((i) => i.kind === "CHECKPOINT" && liveItem(i));
  return rows.some((ms) => live(ms).some((i) => i.checkpointKind === "EXAM_DAY")) || (last != null && live(last).length > 0);
}

/**
 * A plan's motivation timeline (decision 54), in days from today: the first
 * rank, every rank (a stage reached inside the plan above every rank before
 * it: a gate's STAGE_RANK, BETWEEN keeping the rank below, a count gate
 * giving its stage's below the depth and, toward the depth's own gate, the
 * rank of the gate two levels below (Expert under Mastered: roadmap-types
 * rankIndexForStage with the depth, contracts §15.4); a track plan's k-th
 * kept stage k; held stages none),
 * every milestone that could pay ⬡6 (its practices clear the GOAL_RULES gate
 * at their planned minutes beside the plan's other tracked minutes), Paragon
 * (the last stage's day when the plan's top rank is Paragon), and the
 * longest stretch from today with none of them. Each at its due day.
 * `hasStandard` defaults to the plan's own checkpoints and
 * `coverageBelowPolicy` to false (the caller knows the coverage choices).
 */
export function motivationTimelineOf(plan: readonly MilestoneDraft[], input: RealismInput, opts: { hasStandard?: boolean; coverageBelowPolicy?: boolean } = {}): MotivationTimeline {
  if (isTopicsInput(input)) return chainMotivationTimelineOf(plan, input, opts); // Revision 5, lane 7: the rank spread.
  const today = input.today;
  const rows = planOrder(plan)
    .map((i) => plan[i])
    .filter((ms) => SCHEDULED.has(ms.status) && isDated(ms) && !isHeldRow(ms));
  const longWindow = plan.some((ms) => ms.notes.includes("LONG_WINDOW"));
  if (rows.length === 0) return { firstRankDay: null, rankDays: [], payDays: [], paragonDay: null, longestGap: 0, longWindow };
  const fe = feasibilityOf(plan, input);
  const weeksOfRow = new Map<string, PlanWeek[]>();
  for (const m of fe.milestones) if (!weeksOfRow.has(m.lineageId)) weeksOfRow.set(m.lineageId, m.weeks);
  const depth = isDepthInput(input) ? input.depth : null;
  const dayOf = (ms: MilestoneDraft) => daysBetween(today, ms.dueDay!);
  const rankDays: number[] = [];
  let top = 0;
  rows.forEach((ms, i) => {
    // The depth too (contracts §15.4): a count gate toward the depth's own gate gives the rank of the gate two levels below, never the depth's.
    const r = depth != null ? rankIndexForStage(ms.stage, rowLevelOf(ms), depth) : Math.min(i + 1, RANK_MILESTONE_MAX);
    if (r != null && r > top) {
      top = r;
      rankDays.push(dayOf(ms));
    }
  });
  const payDays: number[] = [];
  for (const ms of rows) {
    const practice = livePractices(ms).reduce((s, p) => s + practiceMinutesPerWeekOf(p), 0);
    const other = otherTrackedMinutesOf(weeksOfRow.get(ms.lineageId) ?? []) ?? 0;
    if (practice + EPS >= PRACTICE_PAY_FLOOR_MIN && practice + EPS >= PRACTICE_PAY_SHARE * (practice + other)) payDays.push(dayOf(ms));
  }
  const last = rows[rows.length - 1];
  const topRank = topRankIndexOfDepth({
    depth,
    track: depth == null,
    hasStandard: opts.hasStandard ?? hasStandardOf(plan),
    keptStages: rows.length,
    spanDays: dayOf(last),
    coverageBelowPolicy: opts.coverageBelowPolicy ?? false,
    productionPlannedFromFluent: productionPlannedFromFluentOf(plan),
  });
  const paragonDay = topRank === RANK_TOP ? dayOf(last) : null;
  const events = [...new Set([...rankDays, ...payDays, ...(paragonDay != null ? [paragonDay] : [])])].sort((a, b) => a - b);
  let longestGap = 0;
  let prev = 0;
  for (const e of events) {
    longestGap = Math.max(longestGap, e - prev);
    prev = e;
  }
  if (events.length === 0) longestGap = dayOf(last);
  return { firstRankDay: rankDays[0] ?? null, rankDays, payDays, paragonDay, longestGap, longWindow };
}

// ─── The date check, a lower depth, the date effect, the floor ───────────────

/**
 * Keep the depth, move the date (F-R4-11): D_real, D_full, the best cases,
 * D_floor, the verdict on the user's date with the rate it asks, the
 * waypoints (by the user's date, by the exam), the schedule-bound line and
 * what was assumed. R and n_d are the ladder's final stage's measures. A
 * track plan (or one with no card measure) has no depth to date: every day
 * null, FITS, and the aim check's line.
 */
export function dateCheckOf(ladder: readonly MilestoneDraft[], input: RealismInput, dateMode: DateMode, userDate: DayKey | null, examDay?: DayKey | null): DateCheck {
  const none = (line: string): DateCheck => ({
    D_real: null,
    D_full: null,
    D_best_pace: null,
    D_best_2x: null,
    D_floor: null,
    verdict: "FITS",
    rateAsked: null,
    reachByUserDate: null,
    reachByExam: null,
    scheduleBound: false,
    dateOrigin: { origin: dateMode === "REALISTIC" ? "REALISTIC" : "USER", calibrating: [] },
    basis: [line],
  });
  // Revision 5, lane 7: a TOPICS plan's date check is its chain's (never squeezed: the offers instead).
  if (isTopicsInput(input)) {
    const core = chainCoreOfPlan(ladder, input);
    if (!core) return none("No topic to date: add a topic to this map.");
    return chainDateCheckOf(core, dateMode, dateMode === "CHOSEN" ? userDate : null, examDay ?? null).check;
  }
  if (!isDepthInput(input)) return none("Practice only: the plan counts the sessions you tick, not cards, so the date is yours.");
  const model = depthModelOfPlan(ladder, input);
  if (!model) return none("No card measure to date: add a Domain to this plan.");
  return dateCoreOf(ladder, model, contextOf(input), dateMode, dateMode === "CHOSEN" ? userDate : null, examDay ?? null).check;
}

/**
 * LOWER_DEPTH's pure part (F-R4-11; lowerDepthCore writes it, with the
 * depthChoice, under the roadmap lock): refuses while a started stage's gate
 * is above the new depth, or when the new depth is already held. Otherwise
 * every unstarted stage above it is DISCARDED with DEPTH_LOWERED; the stage
 * at the new depth becomes the final one with the depth terms (`rc`) when it
 * is unstarted (a started paying target is never rewritten); when the merge
 * had removed that gate, the lowest stage above it becomes it, re-dated to
 * its stage day. Counts never change; no pay, goal or rank is touched here.
 */
export function lowerDepthPlanOf(plan: readonly MilestoneDraft[], input: RealismInput, to: TopicDepth, opts: PlaceOpts = {}): { ok: true; plan: MilestoneDraft[]; dropped: string[] } | { ok: false; error: string } {
  // Revision 5, lane 7 (ruling 50): `to` widens to a TopicDepth; a TOPICS plan rebuilds its depth tail (depthTailOf), and
  // depth 6 is refused on a level plan (whose depths are 8, 10 and 12).
  if (isTopicsInput(input)) return lowerChainDepthOf(plan, input, to, opts);
  if (!isDepthInput(input)) return { ok: false, error: "This plan has no depth to lower." };
  if (!isAimDepth(to)) return { ok: false, error: `A level plan goes no lower than ${levelWords(AIM_DEPTHS.RETAINED)}.` };
  const toName = levelWords(to);
  if (!(to < input.depth)) return { ok: false, error: `The depth is already ${levelWords(input.depth)}.` };
  const out = plan.map(cloneMilestone);
  const order = planOrder(out).map((i) => out[i]);
  for (const ms of order) {
    if (CARRIED.has(ms.status) && (rowLevelOf(ms) ?? 0) > to) {
      const gate = stageOfLevel(to);
      return { ok: false, error: `Close or drop milestone ${ms.ord} first: it is working toward a level above ${gate ? STAGE_NAMES[gate] : `level ${to}`}.` };
    }
  }
  if (order.some((ms) => isHeldRow(ms) && rowLevelOf(ms) === to)) return { ok: false, error: `You already hold ${toName} in these Domains. Keep this depth, or set a different aim.` };
  const live = order.filter((ms) => (ms.status === "DRAFT" || ms.status === "PLANNED" || CARRIED.has(ms.status)) && !isHeldRow(ms));
  let finalRow = live.find((ms) => rowLevelOf(ms) === to && ms.stage !== "PART" && ms.stage !== "BETWEEN") ?? null;
  const above = live.filter((ms) => !CARRIED.has(ms.status) && (rowLevelOf(ms) ?? 0) > to).sort((a, b) => (rowLevelOf(a) ?? 0) - (rowLevelOf(b) ?? 0) || a.ord - b.ord);
  const lowered: RealismInput & { depth: AimDepth } = { ...input, depth: to };
  if (!finalRow) {
    const lowest = above.find((ms) => ms.stage !== "PART");
    if (!lowest) return { ok: false, error: `There is no stage left to hold ${toName}.` };
    lowest.stage = stageOfLevel(to);
    for (const x of lowest.measures) {
      if (x.kind !== "CARDS_AT_LEVEL" || !(x.scope.domainIds?.length)) continue;
      x.minLevel = to;
      x.measureKey = cardsAtLevelKey(x.scope.domainIds, to, "rc");
    }
    const model = depthModelOfPlan(out, lowered);
    if (model) {
      const t = rowTargetsOf(lowest);
      const dating = datingOf(lowered);
      const rate = dateCoreOf(out, model, contextOf(lowered), dating.mode, dating.userDate, dating.examDay).rate;
      const sd = stageDayIn(model, to, rate, { clean: true, targets: t.targets, only: t.only });
      const prev = live.filter((ms) => ms !== lowest && (rowLevelOf(ms) ?? 0) < to && ms.dueDay).map((ms) => ms.dueDay as DayKey);
      const floor = prev.length ? addDays(prev.reduce((a, b) => maxDay(a, b)), 7) : input.today;
      if (sd && lowest.dueDay) lowest.dueDay = minDay(lowest.dueDay, maxDay(sundayOnOrAfter(sd), floor));
    }
    finalRow = lowest;
  } else if (!CARRIED.has(finalRow.status)) {
    for (const x of finalRow.measures) {
      if (x.kind !== "CARDS_AT_LEVEL" || x.minLevel == null || !(x.scope.domainIds?.length)) continue;
      x.measureKey = cardsAtLevelKey(x.scope.domainIds, x.minLevel, "rc");
    }
  }
  const dropped: string[] = [];
  for (const ms of above) {
    if (ms === finalRow) continue;
    ms.status = "DISCARDED";
    ms.rankIndex = null;
    setNote(ms, "DEPTH_LOWERED", true);
    dropped.push(ms.lineageId);
  }
  return { ok: true, plan: fitDepth(out, lowered, depthPlaceOf(opts)), dropped };
}

/**
 * The date effect of adding Domains (F-R4-21), shown before anything is
 * confirmed: the realistic date with each Domain added on its own, then
 * (domainId null) with all of them. Each added Domain counts at its coverage
 * policy (the outline lines tied to no Domain re-shared over the larger R).
 * `pastSpan` when the plan would go past SPAN_MAX_DAYS (or isn't dated
 * within the reach table). With no pace and new cards needed the set is not
 * dated at all: dateWith null and pastSpan false, so no toggle is blocked
 * with a "past 3 years" it can't know. The intake's own Domains are taken as they are
 * (input.scopes must hold the added Domains' cards); with `counts` (as
 * stageLadderOf's opts.counts: frozen at intake, contracts §15.3) their
 * coverage reads those, and an added Domain, new to R, today's.
 */
export function dateEffectOf(
  intake: Intake,
  input: RealismInput,
  add: readonly string[],
  counts?: readonly CoverageCounts[]
): { domainId: string | null; dateWith: DayKey | null; pastSpan: boolean }[] {
  const L: AimDepth = isAimDepth(intake.depth) ? intake.depth : isAimDepth(input.depth) ? input.depth : AIM_DEPTHS[DEPTH_DEFAULT];
  const dinput: RealismInput & { depth: AimDepth } = { ...input, depth: L, trackArea: false };
  const base = Array.from(new Set(intake.domainIds));
  const extra = Array.from(new Set(add)).filter((id) => !base.includes(id));
  if (extra.length === 0) return [];
  const ctx = contextOf(dinput);
  const chosen = base.map((id) => ({ id, name: "" }));
  const lineDomains = lineDomainsOf(intake, chosen);
  const frozen = frozenMapOf(counts);
  const realistic = (ids: readonly string[]): { dateWith: DayKey | null; pastSpan: boolean } => {
    const facts = ids.map((id) => {
      const cards = domainCardsOf(dinput, id);
      const live = cards.filter(isRecallCard).length;
      return { id, name: "", ...coverageCountsOf({ id, live, nonRecall: cards.length - live }, base.includes(id) ? frozen : null) };
    });
    const coverage = coverageOf({ domains: facts, lineDomains, typed: intake.coverage ?? null });
    const model = depthModelOf(dinput, L, coverage.map((c) => ({ id: c.domainId, n: c.n })));
    const core = dateCoreOf(null, model, ctx, "REALISTIC", null, null);
    const d = core.check.D_real;
    // Not dated (new cards needed, no pace) has no date to be past: dateWith null, never PAST_SPAN (its toggle stays open).
    return { dateWith: d, pastSpan: !core.notDated && (d == null || daysBetween(input.today, d) > SPAN_MAX_DAYS) };
  };
  const out: { domainId: string | null; dateWith: DayKey | null; pastSpan: boolean }[] = extra.map((id) => ({ domainId: id, ...realistic([...base, id]) }));
  out.push({ domainId: null, ...realistic([...base, ...extra]) });
  return out;
}

/**
 * The earliest day a depth is possible (F-R4-4's chip verdicts):
 * floorBase(L*, m) after the minimum writing days for the new cards needed,
 * the last of N cards being written on day floor(7 (N − 1) ÷ rate) as the
 * reference plan writes them. With no rate (or none needed), every card is
 * taken as written today.
 */
export function floorDayOf(input: { today: DayKey; depth: AimDepth; m: number; newCardsNeeded: number; ratePerWeek: number | null }): DayKey {
  const need = Number.isFinite(input.newCardsNeeded) ? Math.max(0, Math.ceil(input.newCardsNeeded)) : 0;
  const r = input.ratePerWeek;
  const writing = need > 0 && r != null && Number.isFinite(r) && r > 0 ? Math.floor((7 * (need - 1)) / r) : 0;
  return addDays(input.today, writing + floorBase(input.depth, input.m > 0 ? input.m : 1));
}

// ═══ Revision 5, lane 7: the chain (contracts §22.12, §23.3; roadmap-topic-map.md F-R5-2, F-R5-9) ═══════════════
// ── Revision 5, lane 7 ──
//
// A TOPICS plan (RealismInput.planKind TOPICS; contracts §22) is a topic map's chain from broad to deep:
//   - layer milestone k (stage FAMILIAR, MilestoneDraft.layer k, chainRole LAYER) pays CARDS_AT_LEVEL on each chosen,
//     unheld, unskipped layer-k topic at OPEN_LEVEL: TOPIC_FLOOR_CARDS on a base topic, n_d on the specialisation (the
//     last layer). Held and skipped topics, and every earlier layer's topics ("climbing to 8"), are CONTEXT measures;
//   - then T = DEPTH_TAIL[L*] depth milestones (depthTailOf; chainRole DEPTH, "set by reviews"): the specialisation
//     at L* (Fluent's 10 first when L* is 12) and the base topics at 8 (or at L* when that is lower);
//   - every topic measure carries its topicLineageId; an unbound topic (a draft's, ruling 60) has no Domain in its
//     scope and no measureKey; a measure at its topic's end level (the specialisation's L*, a base topic's
//     min(8, L*)) is `rc`, every other `r`;
//   - writing is staged (chainWriteDaysOf): layer k's new cards are written from its own window's first day (today
//     for a window under way), split over its topics by their need, so no card is written before its layer's window;
//   - windows: layer k's is at least layerMin_k = max(MILESTONE_MIN_DAYS, w_k + floorBase(6), practiceNeed_k ÷
//     weekMin_g) and ends on the Sunday on or after its topics' stage day (roadmap-types stageDayOf: the reach
//     model); a depth milestone's is at least MILESTONE_MIN_DAYS, to its stage day. The writing rate is the plan's,
//     PACE_SHARE × r_src (the Field pace at this goal's fieldShare), and the hours are this goal's share (capacityOf).
//     The chain is never squeezed: a user's earlier date, or a dated exam before layer K's end, reads OVER with the
//     offers (chainFitOf, the date check); a later date gives the last window the slack;
//   - PART and BETWEEN are checkpoints inside a milestone (MeasureSpec.gate; CONTEXT, no measureKey), never extra
//     nodes, so the count stays the estimate's: PART ("half of layer 1 at level 6") on the first layer milestone when
//     its window is over FIRST_RANK_MAX_DAYS; BETWEEN (each specialisation topic one level below the row's) when a
//     depth window is over MILESTONE_MAX_DAYS. A window over MILESTONE_MAX_DAYS carries LONG_WINDOW (the Over offers);
//   - a layer whose every topic is held (HELD_AT_START) or known (KNOWN_BY_YOU) is a held row, dated today, with its
//     Domains and CONTEXT measures (so the chain reads back from the plan), never fitted, judged or ranked;
//   - the engine is the depth plan's (a DepthModel over the topics, its writing `staged`), so the knowledge checks,
//     the load, the room and the allocation read row by row as a depth plan's do.

/** A TOPICS input (RealismInput.planKind TOPICS on a Field Area): its branch is read before the depth engine's (a TOPICS input may carry a depth). */
function isTopicsInput(input: RealismInput): boolean {
  return input.planKind === "TOPICS" && !input.trackArea;
}

/** MilestoneNote KNOWN_BY_YOU (lane 8 adds it to the union with its copy, ruling 5): a layer whose every topic you marked "I know this". */
const KNOWN_BY_YOU_NOTE: MilestoneNote = "KNOWN_BY_YOU";

/** A chain row nothing is paid on: held when you began (HELD_AT_START) or every topic known (KNOWN_BY_YOU). */
function isChainHeldRow(ms: MilestoneDraft): boolean {
  return isHeldRow(ms) || ms.notes.includes(KNOWN_BY_YOU_NOTE);
}

/** One chosen topic as the chain reads it (contracts §22.12). nd: TOPIC_FLOOR_CARDS for BASE, the coverage policy's n_d for DEEP. */
export interface ChainTopicInput {
  lineageId: string;
  domainId: string | null;
  role: TopicRole;
  held: boolean;
  skipped: boolean;
  nd: number;
}

/** The chain layeredLadderOf lays out: each layer's chosen topics (layer order; empty layers are skipped), L*, and a dated exam (absent: the intake's). */
export interface TopicChainInput {
  layers: { layer: number; topics: ChainTopicInput[] }[];
  depth: TopicDepth;
  examDay?: DayKey | null;
}

/** chainFitOf's input (the pre-check, before any map call): breadth's `min` × K topics a layer, or `perLayer`, at this goal's shares. */
export interface ChainFitInput {
  layers: number;
  perLayer?: readonly number[];
  breadth: BreadthKey;
  depth: TopicDepth;
  input: RealismInput;
  origin: RatingOrigin;
  examDay?: DayKey | null;
}

/**
 * The depth tail after layer K (F-R5-9; T = DEPTH_TAIL[depth]), each "set by reviews":
 *   6: none; 8: RETAINED (the specialisation and the base topics at 8); 10: FLUENT (the specialisation at 10, the
 *   base topics at 8); 12: FLUENT (10, 8), then MASTERED (the specialisation at 12).
 * `pays.base` 0: the base topics are not paid there (they were at 8 the milestone before; a CONTEXT measure shows them).
 */
export function depthTailOf(depth: TopicDepth): { stage: GateStage; pays: { deep: number; base: number } }[] {
  switch (depth) {
    case 8:
      return [{ stage: "RETAINED", pays: { deep: STAGE_LEVEL.RETAINED, base: BASE_LEVEL } }];
    case 10:
      return [{ stage: "FLUENT", pays: { deep: STAGE_LEVEL.FLUENT, base: BASE_LEVEL } }];
    case 12:
      return [
        { stage: "FLUENT", pays: { deep: STAGE_LEVEL.FLUENT, base: BASE_LEVEL } },
        { stage: "MASTERED", pays: { deep: STAGE_LEVEL.MASTERED, base: 0 } },
      ];
    default:
      return [];
  }
}

/**
 * Staged writing (F-R5-9): each layer's new cards written from its own window's first day at `ratePerWeek`, card j
 * on start + ⌊7j ÷ rate⌋ (roadmap-types referenceWriteDaysOf's rule, per layer), merged per day. With no rate (null,
 * 0 or not finite) or no cards, a layer writes nothing. So w_k = ⌊7 × cards_k ÷ rate⌋ bounds layer k's writing.
 */
export function chainWriteDaysOf(layers: readonly { cards: number; start: DayKey }[], ratePerWeek: number | null): WriteDay[][] {
  const r = ratePerWeek != null && Number.isFinite(ratePerWeek) && ratePerWeek > 0 ? ratePerWeek : null;
  return layers.map((l) => {
    const n = Number.isFinite(l.cards) ? Math.max(0, Math.floor(l.cards)) : 0;
    const out: { day: DayKey; count: number }[] = [];
    if (r == null || n === 0) return out;
    for (let j = 0; j < n; j++) {
      const day = addDays(l.start, Math.floor((7 * j) / r));
      const last = out[out.length - 1];
      if (last && last.day === day) last.count += 1;
      else out.push({ day, count: 1 });
    }
    return out;
  });
}

/** One topic as the chain engine reads it: its layer, role and count, its Domain's cards, and the new cards it needs. */
interface ChainTopic {
  lineageId: string;
  /** The model's key: the bound Domain's id, else "t:" + the lineage (an unbound topic's cards are all still to write). */
  id: string;
  domainId: string | null;
  layer: number;
  role: TopicRole;
  held: boolean;
  skipped: boolean;
  nd: number;
  all: CardState[];
  eff: ReachCard[];
  live: number;
  /** writeNeedOf(nd, live) for a paying topic; 0 when held or skipped. */
  need: number;
}

/** A topic that pays (neither held when you began nor marked "I know this"). */
const paysOf = (t: ChainTopic): boolean => !t.held && !t.skipped;

/** A topic's end level (decision 64): the specialisation at L*, every other topic at 8, or at L* when that is lower. */
const endLevelOf = (t: Pick<ChainTopic, "role">, L: number): number => (t.role === "DEEP" ? L : Math.min(BASE_LEVEL, L));

function chainTopicOf(input: RealismInput, t: ChainTopicInput, layer: number, used: Set<string>): ChainTopic {
  const domainId = typeof t.domainId === "string" && t.domainId !== "" ? t.domainId : null;
  // A Domain bound to two topics is read once: the second reads as unbound (no cards of its own).
  const bound = domainId != null && !used.has(domainId) ? domainId : null;
  const id = bound ?? `t:${t.lineageId}`;
  used.add(id);
  const all = bound ? domainCardsOf(input, bound) : [];
  const live = all.filter(isRecallCard).length;
  const role: TopicRole = t.role === "DEEP" ? "DEEP" : "BASE";
  const nd = typeof t.nd === "number" && Number.isFinite(t.nd) && t.nd >= 1 ? Math.floor(t.nd) : role === "DEEP" ? COVER_FLOOR_CARDS : TOPIC_FLOOR_CARDS;
  const held = t.held === true;
  const skipped = !held && t.skipped === true;
  return { lineageId: t.lineageId, id, domainId, layer, role, held, skipped, nd, all, eff: reachCardsOf(all, input.today), live, need: held || skipped ? 0 : writeNeedOf(nd, live) };
}

/**
 * The chain's topics from layeredLadderOf's input: layers in order (an empty one skipped, at most LAYERS_MAX),
 * renumbered 1..K, each lineage once (its first layer); the last layer's are the specialisation (DEEP), every other
 * BASE, whatever the input's role says (each keeps its own nd).
 */
function chainTopicsOfInput(input: RealismInput, chain: TopicChainInput): { topics: ChainTopic[]; K: number } {
  const layers = (Array.isArray(chain.layers) ? chain.layers : [])
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l != null && Array.isArray(l.topics) && l.topics.length > 0)
    .sort((a, b) => (Number(a.l.layer) || 0) - (Number(b.l.layer) || 0) || a.i - b.i)
    .map(({ l }) => l);
  const used = new Set<string>();
  const seen = new Set<string>();
  const topics: ChainTopic[] = [];
  let K = 0;
  for (const l of layers) {
    if (K >= LAYERS_MAX) break;
    const fresh = l.topics.filter((t) => t != null && typeof t.lineageId === "string" && t.lineageId !== "" && !seen.has(t.lineageId));
    if (fresh.length === 0) continue;
    K += 1;
    for (const t of fresh) {
      if (seen.has(t.lineageId)) continue;
      seen.add(t.lineageId);
      topics.push(chainTopicOf(input, t, K, used));
    }
  }
  // The specialisation is the last layer's chosen topics (TopicDraft.role), so the plan reads back the same (chainOfPlan).
  for (const t of topics) t.role = t.layer === K ? "DEEP" : "BASE";
  return { topics, K };
}

/** One row of the chain before it is a milestone: a layer (paid at OPEN_LEVEL) or a depth milestone (deep, base; base 0: not paid). */
interface ChainRowSpec {
  role: ChainRole;
  layer: number | null;
  stage: GateStage;
  deep: number;
  base: number;
}

/** K layer rows, then the depth tail; at most milestoneCapOf("TOPICS") (K ≤ LAYERS_MAX and T ≤ DEPTH_MILESTONES_MAX keep it there). */
function chainSpecsOf(K: number, L: TopicDepth): ChainRowSpec[] {
  const out: ChainRowSpec[] = [];
  for (let k = 1; k <= K; k++) out.push({ role: "LAYER", layer: k, stage: "FAMILIAR", deep: OPEN_LEVEL, base: OPEN_LEVEL });
  for (const t of depthTailOf(L)) out.push({ role: "DEPTH", layer: null, stage: t.stage, deep: t.pays.deep, base: t.pays.base });
  return out.slice(0, milestoneCapOf("TOPICS"));
}

/** A row's paying topics, grouped by the level they pay at: a layer's own at OPEN_LEVEL; a depth row's specialisation at `deep`, its base topics at `base`. */
function rowPayersOf(topics: readonly ChainTopic[], r: ChainRowSpec): { ts: ChainTopic[]; level: number }[] {
  if (r.role === "LAYER") return [{ ts: topics.filter((t) => t.layer === r.layer && paysOf(t)), level: OPEN_LEVEL }];
  const out = [{ ts: topics.filter((t) => paysOf(t) && t.role === "DEEP"), level: r.deep }];
  if (r.base > 0) out.push({ ts: topics.filter((t) => paysOf(t) && t.role === "BASE"), level: r.base });
  return out;
}

/** Every Domain id the input's scopes hold (the pre-check's pace, before any topic is bound). */
const scopeIdsOf = (input: RealismInput): string[] => sortedUnique(input.scopes.flatMap((s) => s.domainIds));

/** The depth engine's model over the chain's topics (writing is set later, `staged`). The pace is this goal's share of the Field's (sourceRateOf). */
function chainModelOf(input: RealismInput, L: TopicDepth, topics: readonly ChainTopic[]): DepthModel {
  const m = input.m > 0 ? input.m : 1;
  const derived = reachInputsOf(input.throughput, m);
  const doms: DepthDomain[] = topics.map((t) => ({ id: t.id, all: t.all, eff: t.eff, live: t.live, n: t.nd, need: t.need }));
  const totalNeed = doms.reduce((s, d) => s + d.need, 0);
  const bound = sortedUnique(topics.map((t) => t.domainId).filter((id): id is string => id != null));
  const src = sourceRateOf(input, bound.length > 0 ? bound : scopeIdsOf(input));
  const calibrating: CalibratingInput[] = input.calibrating ? [...input.calibrating] : [...derived.calibrating];
  if (!input.calibrating && src.rateSource === "YOURS" && totalNeed > 0 && !calibrating.includes("pace")) calibrating.push("pace");
  return {
    input,
    today: input.today,
    L,
    m,
    params: input.reach ?? derived.params,
    calibrating,
    doms,
    totalNeed,
    sourceRate: src.rate,
    rateSource: src.rateSource,
    share: PACE_SHARE[input.intensity],
    open: [],
    writes: new Map(),
    caps: new Map(),
  };
}

/** The chain's writing rate: PACE_SHARE × r_src (snapped as the depth plan's is); null with no pace. The chain never writes faster. */
function chainRateOf(model: DepthModel): number | null {
  const src = model.sourceRate;
  return src != null && src > 0 ? Math.round(model.share * src * 1e9) / 1e9 : null;
}

/** A layer's paying topics' writing from `start` at `rate`, split by their need (they finish together): topic t's card j on start + ⌊7j ÷ r_t⌋. */
function topicWritesOf(paying: readonly ChainTopic[], start: DayKey, rate: number): Map<string, WriteDay[]> {
  const total = paying.reduce((s, t) => s + t.need, 0);
  const out = new Map<string, WriteDay[]>();
  for (const t of paying) {
    const days: { day: DayKey; count: number }[] = [];
    if (rate > 0 && total > 0 && t.need > 0) {
      const rt = (rate * t.need) / total;
      for (let j = 0; j < t.need; j++) {
        const day = addDays(start, Math.floor((7 * j) / rt));
        const last = days[days.length - 1];
        if (last && last.day === day) last.count += 1;
        else days.push({ day, count: 1 });
      }
    }
    out.set(t.id, days);
  }
  return out;
}

/**
 * practiceNeed_k (F-R5-2): the minutes a layer needs at the least, writing its new cards and reviewing each to
 * OPEN_LEVEL (OPEN_LEVEL − 1 passes, retries at the pass rate), plus one session a week at the D15 floor over the
 * shortest window when practices are allowed. Its days at this goal's weekly minutes bound the layer's window.
 */
function chainNeedMinutesOf(cards: number, p: number, practices: boolean): number {
  const perReview = ((2 - clamp(p, 0, 1)) * REVIEW_SECONDS) / 60;
  return Math.max(0, cards) * (CARD_WRITE_MIN + (OPEN_LEVEL - 1) * perReview) + (practices ? (MILESTONE_MIN_DAYS / 7) * practiceBandMinutes("D15") : 0);
}

/** ⌈7 × practiceNeed ÷ weekMin_g⌉ days; Infinity with no minutes in the week. */
function chainHoursDaysOf(cards: number, weekMin: number, p: number, practices: boolean): number {
  const need = chainNeedMinutesOf(cards, p, practices);
  if (!(need > 0)) return 0;
  return weekMin > 0 ? Math.ceil((7 * need) / weekMin - EPS) : Infinity;
}

/** A row's stage day: every group's topics at their level (the reach model), each at its end level with clean entry; null past REACH_T_MAX. */
function chainRowStageDayOf(model: DepthModel, groups: readonly { ts: readonly ChainTopic[]; level: number }[], writes: ReadonlyMap<string, readonly WriteDay[]>): DayKey | null {
  let out: DayKey = model.today;
  for (const g of groups) {
    for (const clean of [true, false]) {
      const ts = g.ts.filter((t) => (endLevelOf(t, model.L) === g.level) === clean);
      if (ts.length === 0) continue;
      const sd = stageDayOf(
        ts.map((t) => ({ n: t.nd, cards: t.eff, writeDays: writes.get(t.id) ?? [] })),
        g.level,
        model.today,
        model.params,
        clean ? { cleanAt: g.level } : undefined
      );
      if (sd == null) return null;
      out = maxDay(out, sd);
    }
  }
  return out;
}

/** A dated window a schedule keeps as it is (a carried or held row's). */
interface ChainWindow {
  start: DayKey;
  due: DayKey;
}

interface ChainRowDates {
  start: DayKey;
  due: DayKey;
  /** The expected stage day (reach model); null when not dated or past REACH_T_MAX. */
  stageDay: DayKey | null;
  /** Nothing to pay: dated today. */
  held: boolean;
}

interface ChainSchedule {
  rows: ChainRowDates[];
  /** Each topic's writing days (model id → days): the staged writing. */
  writes: Map<string, WriteDay[]>;
  /** New cards needed and no pace: the windows share the user's date evenly (or 35 days each, with none). */
  notDated: boolean;
  /** A stage day past REACH_T_MAX, or a window no week's minutes can hold. */
  tooFar: boolean;
  /** Not dated, and the user's date leaves a window under MILESTONE_MIN_DAYS. */
  tooSoon: boolean;
  /** The last row's due day (today with none). */
  end: DayKey;
  /** Layer K's due day (null with no unheld layer). */
  lastLayerDue: DayKey | null;
}

/**
 * The chain's dates (see the section's head), in spec order: each unheld row from the day after the one before
 * (today for the first), its window at least its minimum, due the Sunday on or after its stage day. `fixed` keeps a
 * row's window (a carried row's, or every row's to read a plan's own writing); a layer row's writing still starts at
 * the later of its window's first day and today. `userDate` (CHOSEN) gives the last unfixed row the slack when it is
 * later, and spreads the windows to it when not dated.
 */
function chainScheduleOf(
  model: DepthModel,
  topics: readonly ChainTopic[],
  specs: readonly ChainRowSpec[],
  rate: number | null,
  ctx: Ctx,
  opts: { fixed?: readonly (ChainWindow | null)[]; userDate?: DayKey | null } = {}
): ChainSchedule {
  const today = model.today;
  const writes = new Map<string, WriteDay[]>();
  for (const t of topics) writes.set(t.id, []);
  const r0 = rate != null && Number.isFinite(rate) && rate > 0 ? rate : null;
  const notDated = topics.some((t) => t.need > 0) && r0 == null;
  const fixedAt = (k: number): ChainWindow | null => opts.fixed?.[k] ?? null;
  const groupsOf = specs.map((r) => rowPayersOf(topics, r));
  const isHeld = (k: number): boolean => fixedAt(k) == null && groupsOf[k].every((g) => g.ts.length === 0);
  const movable = specs.map((_, k) => k).filter((k) => fixedAt(k) == null && !isHeld(k));
  // Not dated: the movable rows share the span from the last kept window (or today) to the user's date.
  const spreadFrom = specs.reduce<DayKey>((mx, _, k) => {
    const f = fixedAt(k);
    return f && f.due > mx ? f.due : mx;
  }, today);
  const spreadSpan = opts.userDate ? daysBetween(spreadFrom, opts.userDate) : 0;
  const tooSoon = notDated && opts.userDate != null && movable.length > 0 && spreadSpan < MILESTONE_MIN_DAYS * movable.length;
  const rows: ChainRowDates[] = [];
  let prev: DayKey | null = null;
  let tooFar = false;
  specs.forEach((r, k) => {
    const fixed = fixedAt(k);
    const groups = groupsOf[k];
    if (isHeld(k)) {
      rows.push({ start: today, due: today, stageDay: today, held: true });
      return;
    }
    const anchor: DayKey = prev ?? today;
    const start = fixed ? fixed.start : prev == null ? today : maxDay(today, addDays(prev, 1));
    if (r.role === "LAYER" && r0 != null) for (const [id, days] of topicWritesOf(groups[0]?.ts ?? [], maxDay(today, start), r0)) writes.set(id, days);
    let due: DayKey;
    let sd: DayKey | null = null;
    if (fixed) {
      due = fixed.due;
      if (!notDated) sd = chainRowStageDayOf(model, groups, writes);
    } else if (notDated) {
      const j = movable.indexOf(k) + 1;
      if (!opts.userDate) due = addDays(anchor, MILESTONE_MIN_DAYS);
      else due = j === movable.length ? opts.userDate : sundayOnOrAfter(addDays(spreadFrom, Math.round((j * spreadSpan) / movable.length)));
      due = maxDay(due, start);
    } else {
      sd = chainRowStageDayOf(model, groups, writes);
      let minDays = MILESTONE_MIN_DAYS;
      let floorDay: DayKey = today;
      if (r.role === "LAYER") {
        const cards = (groups[0]?.ts ?? []).reduce((s, t) => s + t.need, 0);
        const w = cards > 0 ? Math.floor((7 * cards) / (r0 as number)) : 0;
        minDays = Math.max(minDays, w + floorBase(OPEN_LEVEL, model.m), chainHoursDaysOf(cards, ctx.cap.weekMin, model.params.p, ctx.input.practicesAllowed));
      } else {
        // The tail's floors (F-R5-2): the specialisation's last writing day + floorBase(its level), the base topics' last
        // + floorBase(8), so a depth milestone is never dated before chainFitOf's minimum.
        for (const g of groups)
          for (const t of g.ts)
            for (const wd of writes.get(t.id) ?? []) {
              const day = addDays(writeDayOf(wd), floorBase(g.level, model.m));
              if (day > floorDay) floorDay = day;
            }
      }
      if (sd == null || !Number.isFinite(minDays)) {
        tooFar = true;
        due = addDays(anchor, Number.isFinite(minDays) ? Math.max(minDays, SPAN_MAX_DAYS + 1) : SPAN_MAX_DAYS + 1);
      } else due = sundayOnOrAfter(maxDay(maxDay(addDays(anchor, minDays), sd), floorDay));
    }
    rows.push({ start, due, stageDay: sd, held: false });
    prev = prev == null || due > prev ? due : prev;
  });
  // A later date of yours (CHOSEN): the last movable row holds the slack, as a depth plan's final stage does.
  const lastMovable = movable[movable.length - 1];
  if (!notDated && opts.userDate && lastMovable != null && rows[lastMovable].due < opts.userDate) rows[lastMovable].due = opts.userDate;
  let lastLayerDue: DayKey | null = null;
  specs.forEach((r, k) => {
    if (r.role === "LAYER" && !rows[k].held) lastLayerDue = rows[k].due;
  });
  const end = rows.reduce<DayKey>((mx, d) => (!d.held && d.due > mx ? d.due : mx), today);
  return { rows, writes, notDated, tooFar, tooSoon, end, lastLayerDue };
}

/** chainFloorOf's result, in days from today: each layer's honest minimum, each tail window's, layer K's end and the total. */
interface ChainFloor {
  layerMin: number[];
  tailMin: number[];
  lastLayerEnd: number;
  total: number;
}

/**
 * The chain's honest minimum (F-R5-2's pre-check; every review passing on its day, the floors):
 *   layerMin_k = max(MILESTONE_MIN_DAYS, w_k + floorBase(6), hours(cards_k)), w_k = ⌊7 × cards_k ÷ rate⌋ (Infinity
 *   writes every card on its layer's first day; no rate with cards to write is Infinity);
 *   the first tail milestone ends no earlier than max(layer K's end + 35, the specialisation's last writing day +
 *   floorBase(its level), the last base topic's writing day + floorBase(8)); the second (L* = 12) no earlier than
 *   max(that + 35, the specialisation's last writing day + floorBase(12)).
 * A held layer (`held[k]`) takes no time. The specialisation is layer K; the base topics, the layers before.
 */
function chainFloorOf(cards: readonly number[], held: readonly boolean[], L: TopicDepth, rate: number | null, hoursDays: (cards: number) => number, m: number): ChainFloor {
  const layerMin: number[] = [];
  const lastWrite: (number | null)[] = [];
  let start = 0;
  cards.forEach((c, k) => {
    const n = Math.max(0, Number.isFinite(c) ? c : 0);
    if (held[k]) {
      layerMin.push(0);
      lastWrite.push(null);
      return;
    }
    const w = n === 0 || rate === Infinity ? 0 : rate != null && rate > 0 ? Math.floor((7 * n) / rate) : Infinity;
    const min = Math.max(MILESTONE_MIN_DAYS, w + floorBase(OPEN_LEVEL, m), hoursDays(n));
    layerMin.push(min);
    lastWrite.push(start + w);
    start += min;
  });
  const lastLayerEnd = start;
  const K = cards.length;
  const specW = K > 0 ? lastWrite[K - 1] : null;
  const baseW = lastWrite.slice(0, Math.max(0, K - 1)).reduce<number | null>((mx, w) => (w == null ? mx : mx == null ? w : Math.max(mx, w)), null);
  const tailMin: number[] = [];
  let end = lastLayerEnd;
  for (const t of depthTailOf(L)) {
    let e = end + MILESTONE_MIN_DAYS;
    if (specW != null) e = Math.max(e, specW + floorBase(t.pays.deep, m));
    if (t.pays.base > 0 && baseW != null) e = Math.max(e, baseW + floorBase(t.pays.base, m));
    tailMin.push(e - end);
    end = e;
  }
  return { layerMin, tailMin, lastLayerEnd, total: end };
}

/** "6 weeks", "14 months", "4.5 years": a span in code's words. */
function durationWordsOf(days: number): string {
  const d = Math.max(0, Math.round(Number.isFinite(days) ? days : 0));
  if (d < 98) {
    const w = Math.max(1, Math.round(d / 7));
    return `${w} ${w === 1 ? "week" : "weeks"}`;
  }
  if (d < 730) return `${Math.round(d / 30.44)} months`;
  return `${Math.round((d / 365.25) * 2) / 2} years`;
}

/** "5 h", "2.5 h". */
const hoursWordsOf = (h: number): string => `${Number.isInteger(h) ? h : Math.round(h * 10) / 10} h`;

/** The verdict's named input (contracts §22.12): "With Gemini's estimate of 5 layers, this map needs about 14 months at 5 h a week." */
function chainBasisLineOf(K: number, origin: RatingOrigin | null, days: number | null, hours: number): string {
  const layers = `${K} ${K === 1 ? "layer" : "layers"}`;
  const who = origin === "GEMINI" ? `Gemini's estimate of ${layers}` : origin === "CODE" ? `the app's rough estimate of ${layers}` : origin === "YOURS" ? `your ${layers}` : `these ${layers}`;
  if (days == null) return `With ${who}, this map can't be dated yet: there is no writing pace. Enter how many new cards a week you'll write.`;
  return `With ${who}, this map needs about ${durationWordsOf(days)} at ${hoursWordsOf(hours)} a week.`;
}

const STAGED_LINE = "Each layer's new cards are written in its own window, after the layer before.";

/**
 * The realism pre-check for a topic map (F-R5-2), run before any map call: breadth's lower figure per layer (or
 * `perLayer`) × K layers, base topics at TOPIC_FLOOR_CARDS and the last layer at the coverage floor, at this goal's
 * share of the week and of the Field's pace (RealismInput.share, fieldShare), on the floors (every review passing).
 *   - minDays and layerMin, tailMin: at the source pace r_src (layerMin_k = max(35, w_k + floorBase(6),
 *     practiceNeed_k ÷ weekMin_g)); endDay: the same at the plan's pace (PACE_SHARE × r_src); null with no pace;
 *   - verdict: IMPOSSIBLE past SPAN_MAX_DAYS (pastSpan) or before the floor with every card written on its layer's
 *     first day; on your date (CHOSEN): FITS from endDay, TIGHT from today + minDays, OVER before; REALISTIC: FITS
 *     (TIGHT not dated). A window over MILESTONE_MAX_DAYS, or a dated exam before layer K's minimum end
 *     (examMidChain), reads OVER at the least: the chain is never squeezed;
 *   - offers (not FITS), in CHAIN_OFFERS order: your realistic date (within SPAN_MAX_DAYS), more hours (the hours
 *     set a window, or the ramp binds), pause a goal (the week is shared), a lower depth (above 6), fewer layers and
 *     plan the first layers (K > 1);
 *   - basis: "With Gemini's estimate of 5 layers, this map needs about 14 months at 5 h a week." (the app's rough
 *     estimate, your layers), and "Your tracked time limits all your goals." when the ramp binds a shared week.
 */
export function chainFitOf(fit: ChainFitInput): ChainFit {
  const input = fit.input;
  const L: TopicDepth = isTopicDepth(fit.depth) ? fit.depth : AIM_DEPTHS[DEPTH_DEFAULT];
  const K = clamp(Number.isFinite(fit.layers) ? Math.floor(fit.layers) : LAYERS_MIN, LAYERS_MIN, LAYERS_MAX);
  const room = BREADTH_TABLE[fit.breadth] ?? BREADTH_TABLE[BREADTH_FALLBACK];
  const perLayer = Array.from({ length: K }, (_, k) => {
    const v = fit.perLayer?.[k];
    return typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.min(LAYER_TOPICS_MAX, Math.floor(v)) : room.min;
  });
  const cards = perLayer.map((n, k) => n * writeNeedOf(k === K - 1 ? COVER_FLOOR_CARDS : TOPIC_FLOOR_CARDS, 0));
  const held = cards.map(() => false);
  const ctx = contextOf(input);
  const m = ctx.m;
  const p = (input.reach ?? reachInputsOf(input.throughput, m).params).p;
  const hours = (c: number): number => chainHoursDaysOf(c, ctx.cap.weekMin, p, input.practicesAllowed);
  const src = sourceRateOf(input, scopeIdsOf(input)).rate;
  const rSrc = src != null && src > 0 ? src : null;
  const rPlan = rSrc != null ? Math.round(PACE_SHARE[input.intensity] * rSrc * 1e9) / 1e9 : null;
  const atOnce = chainFloorOf(cards, held, L, Infinity, () => 0, m);
  const min = chainFloorOf(cards, held, L, rSrc ?? Infinity, hours, m);
  const plan = rPlan != null ? chainFloorOf(cards, held, L, rPlan, hours, m) : null;
  const today = input.today;
  const endDay = plan ? addDays(today, plan.total) : null;
  const pastSpan = min.total > SPAN_MAX_DAYS;
  const mode: DateMode = input.dateMode ?? "REALISTIC";
  const userDate = mode === "CHOSEN" ? (input.userDate ?? input.targetDay) : null;
  let verdict: DateVerdict;
  if (pastSpan) verdict = "IMPOSSIBLE";
  else if (userDate == null) verdict = rPlan == null ? "TIGHT" : plan && plan.total > SPAN_MAX_DAYS ? "OVER" : "FITS";
  else if (userDate < addDays(today, atOnce.total)) verdict = "IMPOSSIBLE";
  else if (rPlan == null) verdict = "TIGHT";
  else if (endDay && userDate >= endDay) verdict = "FITS";
  else if (userDate >= addDays(today, min.total)) verdict = "TIGHT";
  else verdict = "OVER";
  const longWindow = [...min.layerMin, ...min.tailMin].some((d) => d > MILESTONE_MAX_DAYS);
  // The exam day: the fit's own when given (null: none), else the input's.
  const examDay = fit.examDay !== undefined ? fit.examDay : (input.examDay ?? null);
  const examMidChain = examDay != null && examDay < addDays(today, min.lastLayerEnd);
  if ((longWindow || examMidChain) && (verdict === "FITS" || verdict === "TIGHT")) verdict = "OVER";
  const offers: ChainOffer[] = [];
  if (verdict !== "FITS") {
    const hoursBind = cards.some((c) => {
      const w = rSrc != null ? Math.floor((7 * c) / rSrc) : 0;
      const h = hours(c);
      return h > MILESTONE_MIN_DAYS && h > w + floorBase(OPEN_LEVEL, m);
    });
    const can: Record<ChainOffer, boolean> = {
      USE_REALISTIC_DATE: userDate != null && endDay != null && userDate < endDay && plan != null && plan.total <= SPAN_MAX_DAYS,
      MORE_HOURS: hoursBind || ctx.cap.rampBinds,
      PAUSE_GOAL: ctx.cap.share < 1,
      LOWER_DEPTH: L > OPEN_LEVEL,
      FEWER_LAYERS: K > 1,
      PLAN_FIRST_LAYERS: K > 1,
    };
    for (const o of CHAIN_OFFERS) if (can[o]) offers.push(o);
  }
  let basis = chainBasisLineOf(K, fit.origin, rPlan != null && plan ? plan.total : rSrc == null ? null : min.total, input.hoursPerWeek);
  if (ctx.cap.rampBinds && ctx.cap.share < 1) basis += " Your tracked time limits all your goals.";
  return { verdict, minDays: min.total, layerMin: min.layerMin, tailMin: min.tailMin, endDay, offers, basis, pastSpan, examMidChain };
}

/** One topic's card measure on a chain row (see the section's head): `rc` at its end level, its Domain in scope when bound. */
function topicMeasureOf(t: ChainTopic, level: number, role: "PAYS" | "CONTEXT", L: TopicDepth, rateSource: RateSource, today: DayKey, intake: Intake | null): MeasureSpec {
  const clean = level === endLevelOf(t, L);
  return {
    id: null,
    kind: "CARDS_AT_LEVEL",
    role,
    scope: t.domainId ? { domainIds: [t.domainId] } : {},
    minLevel: level,
    target: t.nd,
    targetSource: t.domainId && intake && typedOf(intake, t.domainId) != null ? "YOURS" : "DEPTH",
    fittedTarget: null,
    rateSource,
    baseline: heldCount(t.all, level, clean),
    baselineDay: today,
    unit: "card",
    itemLineageId: null,
    measureKey: t.domainId ? cardsAtLevelKey([t.domainId], level, clean ? "rc" : "r") : null,
    topicLineageId: t.lineageId,
    gate: null,
  };
}

/**
 * A chain row's topic measures, one per topic: a layer row pays its own paying topics at OPEN_LEVEL (its held and
 * skipped ones CONTEXT there) and shows every earlier layer's topics climbing to min(8, L*) (CONTEXT); a depth row
 * pays the specialisation at `deep` and the base topics at `base` (CONTEXT at min(8, L*) when `base` is 0), its held
 * and skipped topics CONTEXT.
 */
function chainRowMeasuresOf(r: ChainRowSpec, topics: readonly ChainTopic[], L: TopicDepth, rateSource: RateSource, today: DayKey, intake: Intake | null): MeasureSpec[] {
  const out: MeasureSpec[] = [];
  const climb = Math.min(BASE_LEVEL, L);
  if (r.role === "LAYER") {
    for (const t of topics) if (t.layer === r.layer) out.push(topicMeasureOf(t, OPEN_LEVEL, paysOf(t) ? "PAYS" : "CONTEXT", L, rateSource, today, intake));
    for (const t of topics) if (r.layer != null && t.layer < r.layer) out.push(topicMeasureOf(t, climb, "CONTEXT", L, rateSource, today, intake));
    return out;
  }
  for (const t of topics) {
    if (t.role === "DEEP") out.push(topicMeasureOf(t, r.deep, paysOf(t) ? "PAYS" : "CONTEXT", L, rateSource, today, intake));
    else out.push(topicMeasureOf(t, r.base > 0 ? r.base : climb, paysOf(t) && r.base > 0 ? "PAYS" : "CONTEXT", L, rateSource, today, intake));
  }
  return out;
}

/** PART ("half of layer 1 at level 6"): one CONTEXT checkpoint over the layer's paying topics; null under MIN_INCREMENT_CARDS_FLOOR. */
function partMeasureOf(paying: readonly ChainTopic[], rateSource: RateSource, today: DayKey): MeasureSpec | null {
  const target = Math.ceil(paying.reduce((s, t) => s + t.nd, 0) / 2);
  if (target < MIN_INCREMENT_CARDS_FLOOR) return null;
  const ids = sortedUnique(paying.map((t) => t.domainId).filter((id): id is string => id != null));
  return {
    id: null,
    kind: "CARDS_AT_LEVEL",
    role: "CONTEXT",
    scope: ids.length ? { domainIds: ids } : {},
    minLevel: OPEN_LEVEL,
    target,
    targetSource: "WORKED_OUT",
    fittedTarget: null,
    rateSource,
    baseline: paying.reduce((s, t) => s + heldCount(t.all, OPEN_LEVEL, false), 0),
    baselineDay: today,
    unit: "card",
    itemLineageId: null,
    measureKey: null,
    topicLineageId: null,
    gate: "PART",
  };
}

/** BETWEEN: each paying specialisation topic one level below the depth row's (CONTEXT checkpoints). */
function betweenMeasuresOf(r: ChainRowSpec, topics: readonly ChainTopic[], L: TopicDepth, rateSource: RateSource, today: DayKey, intake: Intake | null): MeasureSpec[] {
  return topics
    .filter((t) => t.role === "DEEP" && paysOf(t))
    .map((t) => ({ ...topicMeasureOf(t, r.deep - 1, "CONTEXT", L, rateSource, today, intake), measureKey: null, gate: "BETWEEN" as const }));
}

/** A row's window as the caps read it: from today for a row starting today, else from the day before its first day (the row before's due). */
const chainWindowLenOf = (ms: MilestoneDraft, today: DayKey): number => daysBetween(ms.windowStart! <= today ? today : addDays(ms.windowStart!, -1), ms.dueDay!);

/**
 * The checkpoints and notes that follow a chain row's window (see the section's head): PART on the first unheld
 * layer row over FIRST_RANK_MAX_DAYS, BETWEEN on a depth row over MILESTONE_MAX_DAYS, LONG_WINDOW on any row over
 * MILESTONE_MAX_DAYS. `draftsOnly`: only DRAFT rows change (a re-date never touches an accepted or started row).
 */
function chainCheckpointsInPlace(
  plan: MilestoneDraft[],
  rows: readonly number[],
  specs: readonly ChainRowSpec[],
  topics: readonly ChainTopic[],
  L: TopicDepth,
  rateSource: RateSource,
  today: DayKey,
  intake: Intake | null,
  draftsOnly: boolean
): void {
  let first = true;
  rows.forEach((i, k) => {
    const ms = plan[i];
    const r = specs[k];
    if (!r || isChainHeldRow(ms) || !isDated(ms)) return;
    const firstLayer = first && r.role === "LAYER";
    if (r.role === "LAYER") first = false;
    if (draftsOnly && ms.status !== "DRAFT") return;
    const len = chainWindowLenOf(ms, today);
    ms.measures = ms.measures.filter((x) => !x.gate);
    setNote(ms, "LONG_WINDOW", len > MILESTONE_MAX_DAYS);
    if (firstLayer && len > FIRST_RANK_MAX_DAYS) {
      const part = partMeasureOf(
        topics.filter((t) => t.layer === r.layer && paysOf(t)),
        rateSource,
        today
      );
      if (part) ms.measures.push(part);
    }
    if (r.role === "DEPTH" && len > MILESTONE_MAX_DAYS) ms.measures.push(...betweenMeasuresOf(r, topics, L, rateSource, today, intake));
  });
}

/** The layer titles (contracts §22.1 ruling 22; in CODE_TEMPLATES since lane 8). */
const LAYER_TITLE: CodeTemplate = "{domains} · layer {k} of {n}";
const LAYER_DRAFT_TITLE: CodeTemplate = "Layer {k} of {n}";

/**
 * A chain row's code title (F-R5-9 Titles): a layer "{domains} · layer {k} of {n}" when every topic of it is a named
 * Domain, else "Layer {k} of {n}" (a draft's Gemini names stay quarantined); a depth row "{stage}: {domains} to level
 * {L}+" over the specialisation's names; "" when it can't be written (the view's paying line names it).
 */
function chainTitleOf(r: ChainRowSpec, K: number, own: readonly (DomainName | null)[]): string {
  const all = own.length > 0 && own.every((n) => n != null);
  const domains = own.filter((n): n is DomainName => n != null);
  try {
    if (r.role === "LAYER") return all ? codeText(LAYER_TITLE, { domains, k: r.layer ?? 1, n: K }) : codeText(LAYER_DRAFT_TITLE, { k: r.layer ?? 1, n: K });
    if (all) return codeText("{stage}: {domains} to level {L}+", { stage: STAGE_NAMES[r.stage], domains, level: r.deep });
  } catch {
    // a template not landed yet, or a fill it refuses: the fallback below
  }
  if (all) {
    try {
      return codeText("{domains} to level {L}+", { domains, level: r.role === "LAYER" ? OPEN_LEVEL : r.deep });
    } catch {
      // nothing to write
    }
  }
  return "";
}

/** The topics a chain row names (its DOMAIN items, its title): a layer's own; a depth row's specialisation. */
const rowTopicsOf = (r: ChainRowSpec, topics: readonly ChainTopic[]): ChainTopic[] => (r.role === "LAYER" ? topics.filter((t) => t.layer === r.layer) : topics.filter((t) => t.role === "DEEP"));

function chainDomainItemOf(lineageId: string, ord: number, domainId: string, name: DomainName): ItemDraft {
  return {
    id: null,
    lineageId,
    kind: "DOMAIN",
    ord,
    label: String(name),
    rawLabel: null,
    origin: "USER",
    decision: "KEPT",
    domainId,
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
    addToToday: true,
    templateId: null,
    flags: [],
    notes: [],
  };
}

/** The chain's coverage (StageLadderResult.coverage): one entry per bound topic, n = its count (TOPIC_FLOOR_CARDS or the specialisation's n_d). */
function chainCoverageOf(topics: readonly ChainTopic[], names: Readonly<Record<string, DomainName>>, intake: Intake): CoverageBreakdown[] {
  const out: CoverageBreakdown[] = [];
  const seen = new Set<string>();
  for (const t of topics) {
    if (!t.domainId || seen.has(t.domainId)) continue;
    seen.add(t.domainId);
    const pol = coveragePolicyOf(t.live, 0);
    const typed = typedOf(intake, t.domainId);
    out.push({
      domainId: t.domainId,
      name: Object.prototype.hasOwnProperty.call(names, t.domainId) ? String(names[t.domainId]) : "",
      live: t.live,
      nonRecall: t.all.length - t.live,
      linesTied: 0,
      linesShared: 0,
      floor: pol.floor,
      share: pol.share,
      outline: pol.outline,
      policy: t.role === "DEEP" ? pol.n : TOPIC_FLOOR_CARDS,
      typed,
      n: t.nd,
      belowPolicy: t.role === "DEEP" && t.nd < pol.n,
    });
  }
  return out;
}

const CHAIN_TRACK_ERROR = "A topic map needs an Area with a Field.";
const CHAIN_EMPTY_ERROR = "Choose at least one topic for this map.";
const CHAIN_HELD_ERROR = "You already hold every topic on this map, or marked it as known. Add a topic or set a different aim.";

/** What every chain reader shares: the model (its writing staged once a schedule sets it), the topics, the rows' specs and the windows kept. */
interface ChainBase {
  model: DepthModel;
  topics: ChainTopic[];
  specs: ChainRowSpec[];
  /** Per spec: a window the re-date keeps (a carried or held row's); null: dated again. */
  carried: (ChainWindow | null)[];
  ctx: Ctx;
  K: number;
  L: TopicDepth;
  /** The plan's writing rate (chainRateOf); null with no pace. */
  rate: number | null;
}

/**
 * The date check of a chain (F-R4-11's fields, the chain's rules): D_real the re-dated chain at the plan's pace (null
 * past SPAN_MAX_DAYS or not dated), D_full at your full pace, D_floor every card on its layer's first day and every
 * review passing, D_best_pace and D_best_2x the same floors at the plan's pace and at twice yours. On your date:
 * IMPOSSIBLE before max(D_best_2x, D_floor); FITS from D_real; TIGHT from D_full; OVER before (never a faster
 * pace asked: rateAsked is the plan's). A dated exam before layer K's realistic end reads OVER at the least.
 */
function chainDateCheckOf(base: ChainBase, mode: DateMode, userDate: DayKey | null, examDay: DayKey | null, origin: RatingOrigin | null = null): { check: DateCheck; real: ChainSchedule } {
  const { model, topics, specs, ctx, K, L } = base;
  const today = model.today;
  const rSrc = model.sourceRate != null && model.sourceRate > 0 ? model.sourceRate : null;
  const need = topics.some((t) => t.need > 0);
  const real = chainScheduleOf(model, topics, specs, base.rate, ctx, { fixed: base.carried });
  const notDated = real.notDated;
  const within = (s: ChainSchedule): DayKey | null => (!s.notDated && !s.tooFar && daysBetween(today, s.end) <= SPAN_MAX_DAYS ? s.end : null);
  const D_real = within(real);
  const D_full = need && rSrc != null && rSrc !== base.rate ? within(chainScheduleOf(model, topics, specs, rSrc, ctx, { fixed: base.carried })) : D_real;
  const cards = Array.from({ length: K }, (_, k) => topics.filter((t) => t.layer === k + 1).reduce((s, t) => s + t.need, 0));
  const held = Array.from({ length: K }, (_, k) => !topics.some((t) => t.layer === k + 1 && paysOf(t)));
  const floorAt = (rate: number | null): DayKey => addDays(today, chainFloorOf(cards, held, L, rate, () => 0, model.m).total);
  const D_floor = floorAt(Infinity);
  const D_best_pace = notDated ? null : floorAt(base.rate ?? Infinity);
  const D_best_2x = notDated ? null : floorAt(rSrc != null ? OVER_PACE_FACTOR * rSrc : Infinity);
  const Du = mode === "REALISTIC" ? D_real : userDate;
  let verdict: DateVerdict;
  if (mode === "REALISTIC" || Du == null) verdict = notDated ? "TIGHT" : "FITS";
  else if (beforeDay(Du, notDated ? D_floor : laterOf(D_best_2x, D_floor))) verdict = "IMPOSSIBLE";
  else if (notDated) verdict = "TIGHT";
  else if (!beforeDay(Du, D_real)) verdict = "FITS";
  else if (!beforeDay(Du, D_full)) verdict = "TIGHT";
  else verdict = "OVER";
  const examMid = examDay != null && real.lastLayerDue != null && examDay < real.lastLayerDue;
  if (examMid && (verdict === "FITS" || verdict === "TIGHT")) verdict = "OVER";
  const levelOfRow = (k: number): number => (specs[k].role === "LAYER" ? OPEN_LEVEL : specs[k].deep);
  const reachBy = (by: DayKey): number | null => {
    let best: number | null = null;
    real.rows.forEach((d, k) => {
      if (d.held || d.stageDay == null || d.stageDay > by) return;
      best = Math.max(best ?? 0, levelOfRow(k));
    });
    return best;
  };
  const reachByUserDate = mode === "CHOSEN" && Du != null && !notDated && beforeDay(Du, D_real) ? reachBy(Du) : null;
  const reachByExam = examDay && !notDated ? reachBy(examDay) : null;
  const dow = (d: DayKey) => `${dowText(d)} ${d.slice(0, 4)}`;
  const basis: string[] = [];
  if (notDated) basis.push(chainBasisLineOf(K, origin, null, model.input.hoursPerWeek));
  else if (D_real == null) basis.push(`${chainBasisLineOf(K, origin, daysBetween(today, real.end), model.input.hoursPerWeek)} That is past 3 years: plan fewer layers, lower the depth, or raise your hours.`);
  else basis.push(chainBasisLineOf(K, origin, daysBetween(today, D_real), model.input.hoursPerWeek));
  basis.push(STAGED_LINE);
  const assumed = assumedLineOf(model);
  if (assumed) basis.push(assumed);
  if (mode === "CHOSEN" && Du != null) {
    if (verdict === "IMPOSSIBLE") basis.push(`Your date, ${dow(Du)}, is before the earliest this map can be reached, even if every review passes and each layer's cards are written on its first day.`);
    else if (verdict === "TIGHT" && !notDated && !examMid) basis.push("Uses your full usual pace: no margin for a lean week.");
    else if (verdict === "OVER" && !examMid) basis.push("Your date comes before the realistic one, and the map is never squeezed: use the realistic date, add hours, or plan fewer layers.");
    if (reachByUserDate != null) basis.push(`By your date the plan reaches ${levelWords(reachByUserDate)}.`);
  }
  if (examDay) {
    if (examMid) basis.push(`Your exam (${dow(examDay)}) comes before layer ${K} can be reached, and an exam never lands mid-map: use a later date, more hours or fewer layers, or plan the first layers now.`);
    else basis.push(reachByExam != null ? `By your exam (${dow(examDay)}) the plan reaches ${levelWords(reachByExam)}.` : `By your exam (${dow(examDay)}) the plan reaches no milestone yet.`);
  }
  return {
    check: {
      D_real,
      D_full,
      D_best_pace,
      D_best_2x,
      D_floor,
      verdict,
      rateAsked: need && !notDated && base.rate != null && verdict !== "IMPOSSIBLE" ? ceilTenth(base.rate) : null,
      reachByUserDate,
      reachByExam,
      scheduleBound: false,
      dateOrigin: { origin: mode === "REALISTIC" ? "REALISTIC" : "USER", calibrating: [...model.calibrating] },
      basis,
    },
    real,
  };
}

/**
 * The topic chain as milestones (contracts §22.12; beside stageLadderOf, which is unchanged): K layer milestones
 * (one per filled layer, renumbered 1..K), then the depth tail for L* (depthTailOf), dated through the reach model
 * with staged writing (see the section's head), then fitted (fitPlan's chain branch: the practice progression on
 * every DRAFT row with items STARTER, in each row's room; a skeleton with NONE).
 *
 * L* is chain.depth (else intake.topicDepth, else the default); the exam is chain.examDay when given (null: none),
 * else the intake's dated exam. The date mode, the user's date and the pace read as stageLadderOf's do. Every row is
 * DRAFT, its title code's (chainTitleOf), its Domain items the row's named Domains (a layer's own; a depth row's
 * specialisation); a draft's unbound topics carry their lineage and no Domain (ruling 60).
 *
 * Refusals: a track Area (a topic map is a Field path: NO_DOMAINS); no topic (NO_DOMAINS); every topic held or known
 * (HELD); REALISTIC with new cards to write and no pace (NO_PACE); not dated and your date under 35 days a window
 * (TOO_SOON); a chain past SPAN_MAX_DAYS (TOO_FAR, with code's figure). A dated exam before layer K's end, or your
 * earlier date, is not refused: the date check reads OVER and the offers show (the chain is never squeezed).
 *
 * The result: stageDays per level (6: layer K's stage day; the tail's levels), the date check, the coverage (one entry
 * per bound topic), the plan's writing rate, and the mixed-level end state (depthTermsOf with `levels`: the
 * specialisation at L*, the base topics at min(8, L*)). REFIT re-dates a TOPICS plan through refit's chain branch,
 * which reads the layers and topics back from the plan's own measures, unchanged.
 */
export function layeredLadderOf(
  intake: Intake,
  input: RealismInput,
  chain: TopicChainInput,
  names: Readonly<Record<string, DomainName>>,
  makeId: () => string,
  opts0: StageLadderOpts = {}
): StageLadderResult {
  // The one gate (contracts §19): the gate's blocked kinds join `excluded`, as stageLadderOf's do.
  const opts: StageLadderOpts = { ...opts0, excluded: blockedKindsOf(intake, opts0), gate: GATE_APPLIED };
  if (input.trackArea || intake.fieldId == null) return { ok: false, reason: "NO_DOMAINS", error: CHAIN_TRACK_ERROR };
  const L: TopicDepth = isTopicDepth(chain.depth) ? chain.depth : isTopicDepth(intake.topicDepth) ? intake.topicDepth : AIM_DEPTHS[DEPTH_DEFAULT];
  const tinput: RealismInput = { ...input, trackArea: false, planKind: "TOPICS" };
  const { topics, K } = chainTopicsOfInput(tinput, chain);
  if (K === 0) return { ok: false, reason: "NO_DOMAINS", error: CHAIN_EMPTY_ERROR };
  if (!topics.some(paysOf)) return { ok: false, reason: "HELD", error: CHAIN_HELD_ERROR };
  const specs = chainSpecsOf(K, L);
  const model = chainModelOf(tinput, L, topics);
  const ctx = contextOf(tinput);
  const rate = chainRateOf(model);
  const mode: DateMode = intake.dateMode ?? input.dateMode ?? "REALISTIC";
  const userDate = mode === "CHOSEN" ? (input.userDate ?? intake.targetDay) : null;
  const examDay = chain.examDay !== undefined ? (chain.examDay ?? null) : aimFillsOf(intake).exam ? (intake.examDay ?? input.examDay ?? null) : null;
  if (mode === "REALISTIC" && model.totalNeed > 0 && rate == null) return { ok: false, reason: "NO_PACE", error: NO_PACE_ERROR };
  const sched = chainScheduleOf(model, topics, specs, rate, ctx, { userDate });
  if (sched.notDated && userDate == null) return { ok: false, reason: "NO_PACE", error: NO_PACE_ERROR };
  if (sched.tooSoon) return { ok: false, reason: "TOO_SOON", error: TOO_SOON_DATE_ERROR };
  if (sched.tooFar || daysBetween(model.today, sched.end) > SPAN_MAX_DAYS) {
    const words = sched.tooFar ? "more than 3 years" : `about ${durationWordsOf(daysBetween(model.today, sched.end))}`;
    return {
      ok: false,
      reason: "TOO_FAR",
      error: `With these ${K} ${K === 1 ? "layer" : "layers"}, this map needs ${words} at ${hoursWordsOf(input.hoursPerWeek)} a week. Plan fewer layers, lower the depth, or raise your hours.`,
    };
  }
  model.staged = sched.writes;

  const rows: MilestoneDraft[] = specs.map((r, k) => {
    const d = sched.rows[k];
    const own = rowTopicsOf(r, topics);
    const ownNames = own.map((t) => (t.domainId && Object.prototype.hasOwnProperty.call(names, t.domainId) ? names[t.domainId] : null));
    const ms = blankMilestone(makeId(), k + 1, { start: d.start, end: d.due }, chainTitleOf(r, K, ownNames), CODE, CODE_DECISION);
    ms.stage = r.stage;
    ms.layer = r.role === "LAYER" ? r.layer : null;
    ms.chainRole = r.role;
    let ord = 0;
    const seen = new Set<string>();
    own.forEach((t, j) => {
      const name = ownNames[j];
      if (!t.domainId || name == null || seen.has(t.domainId)) return;
      seen.add(t.domainId);
      ms.items.push(chainDomainItemOf(makeId(), ord++, t.domainId, name));
    });
    ms.measures = chainRowMeasuresOf(r, topics, L, model.rateSource, model.today, intake);
    if (d.held) ms.notes.push(own.length > 0 && own.every((t) => t.held) ? "HELD_AT_START" : KNOWN_BY_YOU_NOTE);
    return ms;
  });
  chainCheckpointsInPlace(
    rows,
    rows.map((_, i) => i),
    specs,
    topics,
    L,
    model.rateSource,
    model.today,
    intake,
    false
  );
  const next: RealismInput = { ...tinput, targetDay: sched.end, dateMode: mode, userDate };
  const plan = fitChain(rows, next, { makeId, sync: (opts.items ?? "STARTER") === "STARTER", excluded: opts.excluded, intake, picks: opts.picks, names });
  const dc = chainDateCheckOf({ model, topics, specs, carried: specs.map(() => null), ctx, K, L, rate }, mode, userDate, examDay);
  const coverage = chainCoverageOf(topics, names, intake);
  const levels: Record<string, number> = {};
  const baselines: Record<string, number> = {};
  for (const t of topics) {
    if (!t.domainId || Object.prototype.hasOwnProperty.call(levels, t.domainId)) continue;
    levels[t.domainId] = endLevelOf(t, L);
    baselines[t.domainId] = heldCount(t.all, endLevelOf(t, L), true);
  }
  const stageDays: Record<number, DayKey | null> = {};
  specs.forEach((r, k) => {
    const d = sched.rows[k];
    if (d.held) return;
    stageDays[r.role === "LAYER" ? OPEN_LEVEL : r.deep] = sched.notDated ? null : d.stageDay;
  });
  return {
    ok: true,
    plan,
    stageDays,
    dateCheck: dc.check,
    coverage,
    rate: rate != null && model.totalNeed > 0 ? Math.round(rate * 100) / 100 : null,
    endState: depthTermsOf(L, coverage, baselines, model.today, levels),
  };
}

/** The chain read back from a TOPICS plan's own rows (scheduled, with a chain role, in plan order). */
interface ChainCore extends ChainBase {
  /** Plan indices, index-aligned with `specs`. */
  rows: number[];
  /** The plan's own windows, every row kept: its staged writing (set on the model). */
  schedule: ChainSchedule;
}

/**
 * A TOPICS plan's chain: its rows (scheduled, with a chainRole), each topic in its own layer (the first layer row, by
 * layer, whose measures name it: PAYS there pays, CONTEXT is held or known), the specialisation being layer K's, L*
 * (the highest level a specialisation topic's measure reaches, which a base topic's "climbing to 8" never sets; the
 * input's TopicDepth without one), and each row's spec (a depth row's from depthTailOf by its stage).
 */
function chainOfPlan(plan: readonly MilestoneDraft[], input: RealismInput): { rows: number[]; specs: ChainRowSpec[]; topics: ChainTopic[]; K: number; L: TopicDepth } | null {
  const rows = planOrder(plan).filter((i) => SCHEDULED.has(plan[i].status) && plan[i].chainRole != null);
  if (rows.length === 0) return null;
  const layerRows = rows.filter((i) => plan[i].chainRole === "LAYER").sort((a, b) => (plan[a].layer ?? 0) - (plan[b].layer ?? 0) || plan[a].ord - plan[b].ord);
  const K = layerRows.reduce((mx, i) => Math.max(mx, plan[i].layer ?? 1), 0);
  const used = new Set<string>();
  const seen = new Set<string>();
  const topics: ChainTopic[] = [];
  for (const i of layerRows) {
    const ms = plan[i];
    const layer = ms.layer ?? 1;
    const heldRow = ms.notes.includes("HELD_AT_START");
    for (const x of ms.measures) {
      if (x.kind !== "CARDS_AT_LEVEL" || !x.topicLineageId || x.gate || seen.has(x.topicLineageId)) continue;
      seen.add(x.topicLineageId);
      const pays = x.role === "PAYS";
      topics.push(
        chainTopicOf(input, { lineageId: x.topicLineageId, domainId: x.scope.domainIds?.[0] ?? null, role: layer === K ? "DEEP" : "BASE", held: !pays && heldRow, skipped: !pays && !heldRow, nd: x.target }, layer, used)
      );
    }
  }
  const deep = new Set(topics.filter((t) => t.role === "DEEP").map((t) => t.lineageId));
  let top = 0;
  for (const i of rows)
    for (const x of plan[i].measures) if (x.kind === "CARDS_AT_LEVEL" && x.topicLineageId && deep.has(x.topicLineageId) && !x.gate && x.minLevel != null) top = Math.max(top, x.minLevel);
  const L: TopicDepth = isTopicDepth(top) ? top : isTopicDepth(input.depth) ? input.depth : AIM_DEPTHS[DEPTH_DEFAULT];
  const specs: ChainRowSpec[] = rows.map((i) => {
    const ms = plan[i];
    if (ms.chainRole === "LAYER") return { role: "LAYER", layer: ms.layer ?? 1, stage: "FAMILIAR", deep: OPEN_LEVEL, base: OPEN_LEVEL };
    const stage: GateStage = ms.stage && (STAGE_KEYS as readonly string[]).includes(ms.stage) ? (ms.stage as GateStage) : "FLUENT";
    const tail = depthTailOf(L).find((t) => t.stage === stage);
    return { role: "DEPTH", layer: null, stage, deep: tail?.pays.deep ?? rowLevelOf(ms) ?? L, base: tail?.pays.base ?? 0 };
  });
  return { rows, specs, topics, K, L };
}

/** chainOfPlan with its model, its rate and the plan's own staged writing (every row's window kept). */
function chainCoreOfPlan(plan: readonly MilestoneDraft[], input: RealismInput): ChainCore | null {
  const ch = chainOfPlan(plan, input);
  if (!ch) return null;
  const model = chainModelOf(input, ch.L, ch.topics);
  const ctx = contextOf(input);
  const rate = chainRateOf(model);
  const windowOf = (i: number): ChainWindow | null => (isDated(plan[i]) ? { start: plan[i].windowStart as DayKey, due: plan[i].dueDay as DayKey } : null);
  const schedule = chainScheduleOf(model, ch.topics, ch.specs, rate, ctx, { fixed: ch.rows.map(windowOf) });
  model.staged = schedule.writes;
  const carried = ch.rows.map((i) => (CARRIED.has(plan[i].status) || isChainHeldRow(plan[i]) ? windowOf(i) : null));
  return { ...ch, model, ctx, rate, schedule, carried };
}

/**
 * fitPlan's chain branch: on every DRAFT or PLANNED unheld row, each topic measure's key and baseline from today's
 * cards (`rc` at its topic's end level; a checkpoint keeps none), its code title from its Domains' names; then the
 * practice progression (contracts §20, §22.13: the chain's parts, within each row's room at the chain's load; `sync`
 * false sizes a plan the user writes as it stands) and the allocation, the practice measures and NOT_MEASURABLE, as
 * fitDepth does.
 */
function fitChain(
  plan: readonly MilestoneDraft[],
  input: RealismInput,
  opts: { makeId?: () => string; sync?: boolean; excluded?: Iterable<CatalogKey>; intake?: Intake | null; picks?: unknown; names?: Readonly<Record<string, DomainName>> }
): MilestoneDraft[] {
  const out = plan.map(cloneMilestone);
  const core = chainCoreOfPlan(out, input);
  if (!core) return out;
  const { ctx, topics, L, K } = core;
  const byLineage = new Map(topics.map((t) => [t.lineageId, t] as const));
  core.rows.forEach((i, k) => {
    const ms = out[i];
    if (!fittable(ms) || isChainHeldRow(ms)) return;
    for (const x of ms.measures) {
      if (x.kind !== "CARDS_AT_LEVEL" || x.minLevel == null || !(x.scope.domainIds?.length)) continue;
      const t = x.topicLineageId ? byLineage.get(x.topicLineageId) : undefined;
      const clean = !x.gate && t != null && x.minLevel === endLevelOf(t, L);
      if (!x.gate) x.measureKey = cardsAtLevelKey(x.scope.domainIds, x.minLevel, clean ? "rc" : "r");
      x.baseline = x.scope.domainIds.reduce((s, id) => s + heldCount(domainCardsOf(input, id), x.minLevel as number, clean), 0);
      x.baselineDay = ctx.today;
      x.fittedTarget = null;
    }
    if (ms.titleOrigin === CODE && provenanceOf(CODE, ms.titleDecision) === "WORKED_OUT") {
      const named = new Map(rowDomainsOf(ms).map((d) => [d.id, opts.names && Object.prototype.hasOwnProperty.call(opts.names, d.id) ? opts.names[d.id] : d.name] as const));
      const own = rowTopicsOf(core.specs[k], topics).map((t) => (t.domainId ? (named.get(t.domainId) ?? null) : null));
      const title = chainTitleOf(core.specs[k], K, own);
      if (title) ms.title = title;
    }
  });
  const rate = core.rate ?? 0;
  const state = depthStateOf(out, core.model, ctx, rate);
  const blocked = new Set<string>(opts.excluded ?? []);
  const focus =
    opts.sync !== false
      ? syncRowsInPlace(out, { ...rowProgressionCtxOf("FIELD", input, opts.intake, out, blocked, roomOf(state, ctx), { picks: opts.picks, makeId: opts.makeId, names: opts.names }), topics: true })
      : placedFocusOf(out);
  for (const i of planOrder(out)) {
    const ms = out[i];
    if (ms.chainRole == null || !fittable(ms) || isChainHeldRow(ms)) continue;
    const from = maxDay(ms.windowStart!, ctx.today);
    allocate(ms, state.sim, ctx, from, rowBandFloorOf(ms), focus?.get(ms.lineageId) ?? null);
    syncPracticeMeasures(ms, from, ctx);
    setNote(ms, "NOT_MEASURABLE", !ms.measures.some((x) => x.role === "PAYS"));
  }
  return out;
}

/** The chain's remedies: your realistic date (when yours is earlier and the realistic one is within 3 years), a lower depth (above 6). */
function chainRemediesOf(check: DateCheck, core: ChainBase): Remedy[] {
  const out: Remedy[] = [];
  if (check.D_real && check.verdict !== "FITS" && daysBetween(core.model.today, check.D_real) <= SPAN_MAX_DAYS) out.push("USE_REALISTIC_DATE");
  if (core.L > OPEN_LEVEL) out.push("LOWER_DEPTH");
  return out;
}

/** feasibilityOf's chain branch: judgeDepth's checks over the chain's model (its staged writing), with the chain's date check. */
function judgeChain(plan: readonly MilestoneDraft[], input: RealismInput, withRemedies: boolean): { fe: Feasibility; open: MilestoneFeasibility[] } {
  const core = chainCoreOfPlan(plan, input);
  if (!core) {
    const r = judgePlan(plan, { ...input, planKind: undefined, depth: null }, false);
    r.fe.reachModel = REACH_MODEL_VERSION;
    return r;
  }
  const { model, ctx } = core;
  const rate = core.rate ?? 0;
  const dating = datingOf(input);
  const check = chainDateCheckOf(core, dating.mode, dating.userDate, dating.examDay).check;
  const state = depthStateOf(plan, model, ctx, rate);
  const judged: { mf: MilestoneFeasibility; carried: boolean }[] = [];
  const open: MilestoneFeasibility[] = [];
  for (const idx of planOrder(plan)) {
    const ms = plan[idx];
    if (!inPlan(ms) || isChainHeldRow(ms) || ms.dueDay! < ctx.today) continue;
    const mf = depthMilestoneFeasibilityOf(ms, state, model, ctx, rate);
    judged.push({ mf, carried: CARRIED.has(ms.status) });
    if (!CARRIED.has(ms.status)) open.push(mf);
  }
  // As judgePlan: a row the plan can still change comes before a carried row of its own lineage.
  const milestones: MilestoneFeasibility[] = [];
  const placed = new Set<number>();
  for (let i = 0; i < judged.length; i++) {
    if (placed.has(i)) continue;
    if (judged[i].carried) {
      for (let j = i + 1; j < judged.length; j++) {
        if (placed.has(j) || judged[j].carried || judged[j].mf.lineageId !== judged[i].mf.lineageId) continue;
        milestones.push(judged[j].mf);
        placed.add(j);
      }
    }
    milestones.push(judged[i].mf);
  }
  const aimCheck = aimCheckOf(ctx);
  const basis: string[] = [reachBasisLineOf(model), STAGED_LINE];
  if (Math.abs(ctx.m - 1) > EPS) basis.push(spacingLine(ctx.m));
  if (input.areaInMaintenance) basis.push(MAINTENANCE_LINE);
  basis.push(depthAimLineOf(aimCheck));
  const impossible = open.some((m) => m.worst === "IMPOSSIBLE") || check.verdict === "IMPOSSIBLE";
  const over = open.some((m) => m.time.verdict === "OVER" || m.knowledge.some((k) => k.verdict === "OVER")) || check.verdict === "OVER";
  const remedies = withRemedies && (impossible || over || check.verdict !== "FITS") ? chainRemediesOf(check, core) : [];
  for (const m of open) m.remedies = m.worst === "IMPOSSIBLE" || m.worst === "OVER" ? [...remedies] : [];
  return {
    fe: { today: ctx.today, m: ctx.m, milestones, aimCheck, basis, remedies, impossible, over, reachModel: REACH_MODEL_VERSION, dateCheck: check },
    open,
  };
}

/**
 * The re-date of a TOPICS plan (refit, USE_REALISTIC_DATE, [Re-date goal N]; ruling 50): the chain read back from
 * the plan (its layers, topics and counts unchanged, never re-split), every unstarted unheld row dated again from
 * today's cards with the staged writing ("PLAN": the input's date mode, your later date giving the last window the
 * slack; "REALISTIC": the chain's own end), started and held rows kept as they are. Re-dated rows come back DRAFT
 * (the new version R4 writes), their checkpoints and LONG_WINDOW following their windows, then fitted.
 */
function redateChain(plan: readonly MilestoneDraft[], input: RealismInput, mode: "PLAN" | "REALISTIC", opts: PlaceOpts = {}): MilestoneDraft[] {
  const out = plan.map(cloneMilestone);
  const place = depthPlaceOf(opts);
  const core = chainCoreOfPlan(out, input);
  if (!core) return fitChain(out, input, place);
  const dating = mode === "REALISTIC" ? { mode: "REALISTIC" as DateMode, userDate: null as DayKey | null } : datingOf(input);
  const sched = chainScheduleOf(core.model, core.topics, core.specs, core.rate, core.ctx, { fixed: core.carried, userDate: dating.mode === "CHOSEN" ? dating.userDate : null });
  if (sched.notDated && !(dating.mode === "CHOSEN" && dating.userDate)) return fitChain(out, input, place);
  core.rows.forEach((i, k) => {
    const ms = out[i];
    if (core.carried[k] != null || !(ms.status === "DRAFT" || ms.status === "PLANNED")) return;
    const d = sched.rows[k];
    ms.windowStart = d.start;
    ms.dueDay = d.due;
    ms.status = "DRAFT";
  });
  chainCheckpointsInPlace(out, core.rows, core.specs, core.topics, core.L, core.model.rateSource, core.model.today, place.intake ?? null, true);
  const last = core.rows.reduce<DayKey | null>((mx, i) => (out[i].dueDay && !isChainHeldRow(out[i]) && (mx == null || out[i].dueDay! > mx) ? out[i].dueDay! : mx), null);
  const next: RealismInput =
    mode === "REALISTIC" ? { ...input, targetDay: last ?? input.targetDay, dateMode: "REALISTIC", userDate: null } : { ...input, targetDay: last && last > input.targetDay ? last : input.targetDay };
  return fitChain(out, next, place);
}

/** The chain's realistic end (re-dated at today's cards, started rows kept); null not dated or past SPAN_MAX_DAYS. */
function chainRealisticDayOf(plan: readonly MilestoneDraft[], input: RealismInput): DayKey | null {
  const core = chainCoreOfPlan(plan, input);
  if (!core) return null;
  const s = chainScheduleOf(core.model, core.topics, core.specs, core.rate, core.ctx, { fixed: core.carried });
  return !s.notDated && !s.tooFar && daysBetween(input.today, s.end) <= SPAN_MAX_DAYS ? s.end : null;
}

/**
 * refitForStart's chain branch: the row as if it started today, its practices re-allocated at the chain's load, its
 * checks at today's cards, and its date check (stageDate): realistic is the Sunday on or after its stage day with
 * its own layer's writing from today; FITS when the planned day is no earlier, else the worst of its card checks
 * (TIGHT at the least). Counts never fall (todayCheck null).
 */
function refitForStartChain(milestone: MilestoneDraft, plan: readonly MilestoneDraft[], input: RealismInput): StartRefit {
  const ctx = contextOf(input);
  const ms = cloneMilestone(milestone);
  ms.windowStart = ctx.today;
  const others = plan.filter((p) => p.lineageId !== milestone.lineageId && !(milestone.id != null && p.id === milestone.id));
  const full = [...others.map(cloneMilestone), ms];
  const core = ms.dueDay != null ? chainCoreOfPlan(full, input) : null;
  if (!core || ms.dueDay == null) {
    const state = planStateOf(full, ctx);
    if (ms.dueDay != null) {
      allocate(ms, state.sim, ctx, ctx.today, rowBandFloorOf(ms), rowFocusOf(ms));
      syncPracticeMeasures(ms, ctx.today, ctx);
    }
    return { milestone: ms, feasibility: ms.dueDay != null ? milestoneFeasibilityOf(ms, state, ctx, ctx.today, false) : emptyFeasibility(ms), todayCheck: null, impossible: false };
  }
  const rate = core.rate ?? 0;
  const state = depthStateOf(full, core.model, ctx, rate);
  allocate(ms, state.sim, ctx, ctx.today, rowBandFloorOf(ms), rowFocusOf(ms));
  syncPracticeMeasures(ms, ctx.today, ctx);
  const feasibility = depthMilestoneFeasibilityOf(ms, state, core.model, ctx, rate, ctx.today);
  const planned = ms.dueDay;
  const k = core.rows.findIndex((i) => full[i] === ms);
  let realistic: DayKey | null = null;
  if (k >= 0 && !core.schedule.notDated) {
    const sd = chainRowStageDayOf(core.model, rowPayersOf(core.topics, core.specs[k]), core.schedule.writes);
    realistic = sd ? sundayOnOrAfter(sd) : null;
  }
  let verdict: DateVerdict;
  if (realistic != null && !beforeDay(planned, realistic)) verdict = "FITS";
  else {
    verdict = "TIGHT";
    for (const c of feasibility.knowledge) if (c.verdict !== "FITTED" && SEVERITY[c.verdict] > SEVERITY[verdict]) verdict = c.verdict;
  }
  return { milestone: ms, feasibility, todayCheck: null, impossible: verdict === "IMPOSSIBLE", stageDate: { planned, realistic, verdict } };
}

/** writingPlanOf's chain branch: each topic's staged writing per life week (scopeKey: its Domain's id, or "t:" + its lineage when unbound). */
function chainWritingPlanOf(plan: readonly MilestoneDraft[], input: RealismInput): { scopeKey: string; rateSource: RealismScope["rateSource"]; weeks: { weekStart: DayKey; cards: number }[] }[] {
  const core = chainCoreOfPlan(plan, input);
  if (!core) return [];
  return core.topics
    .map((t) => {
      const weeks: { weekStart: DayKey; cards: number }[] = [];
      for (const w of core.schedule.writes.get(t.id) ?? []) {
        const ws = weekStartKeyOf(writeDayOf(w));
        const last = weeks[weeks.length - 1];
        if (last && last.weekStart === ws) last.cards += writeCountOf(w);
        else weeks.push({ weekStart: ws, cards: writeCountOf(w) });
      }
      return { scopeKey: t.id, rateSource: core.model.rateSource, weeks };
    })
    .filter((x) => x.weeks.length > 0)
    .sort((a, b) => (a.scopeKey < b.scopeKey ? -1 : a.scopeKey > b.scopeKey ? 1 : 0));
}

/**
 * lowerDepthPlanOf's chain branch (ruling 50; lane 8's lowerDepthCore writes it): refuses while a started depth
 * milestone works toward a level above `to`, and when `to` is not below L*. The new tail is depthTailOf(to): the
 * unstarted depth rows take its stages in order (a started one keeps its own), the rest are DISCARDED with
 * DEPTH_LOWERED; every unstarted row's topic measures are rebuilt at the new end state (counts never change; a
 * measure keeps its id), then the chain is re-dated (redateChain). No pay, goal or rank is touched here.
 */
function lowerChainDepthOf(plan: readonly MilestoneDraft[], input: RealismInput, to: TopicDepth, opts: PlaceOpts): { ok: true; plan: MilestoneDraft[]; dropped: string[] } | { ok: false; error: string } {
  if (!isTopicDepth(to)) return { ok: false, error: "Choose Familiar, Retained, Fluent or Mastered." };
  const out = plan.map(cloneMilestone);
  const core = chainCoreOfPlan(out, input);
  if (!core) return { ok: false, error: "This plan has no depth to lower." };
  if (!(to < core.L)) return { ok: false, error: `The depth is already ${levelWords(core.L)}.` };
  for (const i of core.rows) {
    const ms = out[i];
    if (CARRIED.has(ms.status) && ms.chainRole === "DEPTH" && (rowLevelOf(ms) ?? 0) > to) {
      const gate = stageOfLevel(to);
      return { ok: false, error: `Close or drop milestone ${ms.ord} first: it is working toward a level above ${gate ? STAGE_NAMES[gate] : `level ${to}`}.` };
    }
  }
  const tail = depthTailOf(to);
  const depthRows = core.rows.filter((i) => out[i].chainRole === "DEPTH");
  const keptStages = new Set(depthRows.filter((i) => CARRIED.has(out[i].status)).map((i) => out[i].stage));
  const wanted = tail.filter((t) => !keptStages.has(t.stage));
  const free = depthRows.filter((i) => !CARRIED.has(out[i].status));
  if (wanted.length > free.length) return { ok: false, error: `There is no milestone left to hold ${levelWords(to)}.` };
  const dropped: string[] = [];
  const specOf = new Map<number, ChainRowSpec>();
  free.forEach((i, j) => {
    const ms = out[i];
    const t = wanted[j];
    if (t) {
      ms.stage = t.stage;
      specOf.set(i, { role: "DEPTH", layer: null, stage: t.stage, deep: t.pays.deep, base: t.pays.base });
      return;
    }
    ms.status = "DISCARDED";
    ms.rankIndex = null;
    setNote(ms, "DEPTH_LOWERED", true);
    dropped.push(ms.lineageId);
  });
  core.rows.forEach((i, k) => {
    const ms = out[i];
    if (ms.status !== "DRAFT" && ms.status !== "PLANNED") return;
    if (isChainHeldRow(ms)) return;
    const spec = specOf.get(i) ?? core.specs[k];
    const ids = new Map(ms.measures.filter((x) => x.kind === "CARDS_AT_LEVEL" && x.topicLineageId && !x.gate).map((x) => [x.topicLineageId as string, x.id] as const));
    const rebuilt = chainRowMeasuresOf(spec, core.topics, to, core.model.rateSource, core.model.today, opts.intake ?? null).map((x) => ({ ...x, id: ids.get(x.topicLineageId as string) ?? null }));
    ms.measures = [...rebuilt, ...ms.measures.filter((x) => !(x.kind === "CARDS_AT_LEVEL" && x.topicLineageId && !x.gate))];
  });
  return { ok: true, plan: redateChain(out, { ...input, depth: isAimDepth(to) ? to : null }, "PLAN", opts), dropped };
}

/**
 * motivationTimelineOf's chain branch: the rank spread (contracts §22.12) at each gate's day (the PART checkpoint at
 * the middle of its window, at most FIRST_RANK_MAX_DAYS in; then each unheld row's due day), every milestone that
 * could pay ⬡6 (as motivationTimelineOf), Paragon (topRankIndexOfDepth with planKind TOPICS) and the longest gap.
 */
function chainMotivationTimelineOf(plan: readonly MilestoneDraft[], input: RealismInput, opts: { hasStandard?: boolean; coverageBelowPolicy?: boolean }): MotivationTimeline {
  const today = input.today;
  const rows = planOrder(plan)
    .map((i) => plan[i])
    .filter((ms) => SCHEDULED.has(ms.status) && isDated(ms) && !isChainHeldRow(ms));
  const longWindow = plan.some((ms) => ms.notes.includes("LONG_WINDOW"));
  if (rows.length === 0) return { firstRankDay: null, rankDays: [], payDays: [], paragonDay: null, longestGap: 0, longWindow };
  const fe = feasibilityOf(plan, input);
  const weeksOfRow = new Map<string, PlanWeek[]>();
  for (const m of fe.milestones) if (!weeksOfRow.has(m.lineageId)) weeksOfRow.set(m.lineageId, m.weeks);
  const L = chainOfPlan(plan, input)?.L ?? AIM_DEPTHS[DEPTH_DEFAULT];
  const dayOf = (ms: MilestoneDraft) => daysBetween(today, ms.dueDay!);
  const gateDays: number[] = [];
  for (const ms of rows) {
    if (ms.measures.some((x) => x.gate === "PART")) {
      const from = Math.max(0, daysBetween(today, ms.windowStart!));
      gateDays.push(from + Math.min(FIRST_RANK_MAX_DAYS, Math.floor((dayOf(ms) - from) / 2)));
    }
    gateDays.push(dayOf(ms));
  }
  const gate = stageOfLevel(L);
  const topSpread = gate ? STAGE_RANK[gate] : 1;
  const rankDays: number[] = [];
  let best = 0;
  gateDays.forEach((d, i) => {
    const r = topicRankIndexOf(i + 1, gateDays.length, topSpread);
    if (r > best) {
      best = r;
      rankDays.push(d);
    }
  });
  const payDays: number[] = [];
  for (const ms of rows) {
    const practice = livePractices(ms).reduce((s, p) => s + practiceMinutesPerWeekOf(p), 0);
    const other = otherTrackedMinutesOf(weeksOfRow.get(ms.lineageId) ?? []) ?? 0;
    if (practice + EPS >= PRACTICE_PAY_FLOOR_MIN && practice + EPS >= PRACTICE_PAY_SHARE * (practice + other)) payDays.push(dayOf(ms));
  }
  const last = rows[rows.length - 1];
  const topRank = topRankIndexOfDepth({
    depth: L,
    track: false,
    hasStandard: opts.hasStandard ?? hasStandardOf(plan),
    keptStages: rows.length,
    spanDays: dayOf(last),
    coverageBelowPolicy: opts.coverageBelowPolicy ?? false,
    productionPlannedFromFluent: productionPlannedFromFluentOf(plan),
    planKind: "TOPICS",
  });
  const paragonDay = topRank === RANK_TOP ? dayOf(last) : null;
  const events = [...new Set([...rankDays, ...payDays, ...(paragonDay != null ? [paragonDay] : [])])].sort((a, b) => a - b);
  let longestGap = 0;
  let prev = 0;
  for (const e of events) {
    longestGap = Math.max(longestGap, e - prev);
    prev = e;
  }
  if (events.length === 0) longestGap = dayOf(last);
  return { firstRankDay: rankDays[0] ?? null, rankDays, payDays, paragonDay, longestGap, longWindow };
}

/**
 * A TOPICS row's Domain names by part (contracts §22.13, ProgressionItem.part): `own` (NEW) the row's own Domains
 * (a layer's; a depth row's specialisation), `carry` (CARRY) the layer before's (a depth row: every base topic's).
 */
function topicPartNamesOf(rows: readonly MilestoneDraft[], k: number, names?: Readonly<Record<string, DomainName>>): { own: DomainName[]; carry: DomainName[] } {
  const ms = rows[k];
  const own = stageNamesOf(ms, names);
  const nameOf = (d: { id: string; name: DomainName }): DomainName => (names && Object.prototype.hasOwnProperty.call(names, d.id) ? names[d.id] : d.name);
  if (ms.chainRole === "DEPTH") {
    const deep = new Set(rowDomainsOf(ms).map((d) => d.id));
    const carry: DomainName[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.chainRole !== "LAYER") continue;
      for (const d of rowDomainsOf(r)) {
        if (deep.has(d.id) || seen.has(d.id)) continue;
        seen.add(d.id);
        carry.push(nameOf(d));
      }
    }
    return { own, carry };
  }
  const before = ms.layer != null ? rows.find((r) => r.chainRole === "LAYER" && r.layer === (ms.layer as number) - 1) : undefined;
  return { own, carry: before ? stageNamesOf(before, names) : [] };
}

/** An item's part (lane 8's ProgressionItem.part, read as unknown so this file compiles before it lands): NEW, CARRY or none. */
function topicPartOf(x: ProgressionItem): "NEW" | "CARRY" | null {
  const part = (x as { part?: unknown }).part;
  return part === "NEW" || part === "CARRY" ? part : null;
}
