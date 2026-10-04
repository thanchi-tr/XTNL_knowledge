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
 *     clamp(floor(share ÷ band), 1, 7) sessions.
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
  SESSIONS_MIN,
  SPAN_MAX_DAYS,
  SPAN_MIN_DAYS,
  START_POINT_FLOOR,
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
  /** A full week's minutes: min(hours × 60 × A, rampCap). */
  weekMin: number;
  declaredMin: number;
  a: number;
  aMeasured: boolean;
  rampCap: number | null;
  trackedMedian: number | null;
  trackedHave: number;
  unverified: boolean;
  class: "ESTIMATED" | "YOURS";
  rampBinds: boolean;
}

function capacityOf(input: RealismInput): Capacity {
  const adh = input.throughput.adherence;
  const aMeasured = adh.kind === "measured";
  const a = aMeasured ? clamp(adh.value, ADHERENCE_FLOOR, 1) : DECLARED_FACTOR;
  const tracked = input.throughput.trackedMinutes;
  const trackedMedian = tracked.kind === "measured" ? tracked.median : null;
  const rampCap = trackedMedian == null ? null : Math.max(RAMP_FLOOR_MIN, RAMP_ALLOWANCE * trackedMedian);
  const declaredMin = Math.max(0, input.hoursPerWeek) * 60 * a;
  const weekMin = rampCap == null ? declaredMin : Math.min(declaredMin, rampCap);
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
    rampBinds: rampCap != null && rampCap < declaredMin,
  };
}

/**
 * available(w) = min(hoursPerWeek × 60 × A, rampCap) × non-held days ÷ 7
 * (Constants), the days being the week's own from today on (Monday to
 * Sunday, or from today in the current week). It is not cut at the aim's
 * date (fix round): the week quests (R6, which pass today = weekStart and
 * scale by |E| ÷ the week's non-held days) need the whole week's capacity in
 * the aim's final week and in any week a Reschedule moved past it. The
 * plan's own weeks are cut to each milestone's window where load is (weeksOf).
 * Before calibration A = DECLARED_FACTOR, there is no rampCap and the verdict
 * is unverified (class YOURS: the declared fallback).
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
  const scopeOf = (domainIds: readonly string[]): RealismScope => {
    const ids = sortedUnique(domainIds);
    const key = ids.join(",");
    const hit = cache.get(key);
    if (hit) return hit;
    let scope = input.scopes.find((s) => s.key === key) ?? input.scopes.find((s) => sortedUnique(s.domainIds).join(",") === key);
    if (!scope) {
      const parts = ids.map((id) => input.scopes.find((s) => s.domainIds.length === 1 && s.domainIds[0] === id)).filter((s): s is RealismScope => !!s);
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
  return { input, today: input.today, m: input.m > 0 ? input.m : 1, held: new Set(input.heldDays), pr: passRateOf(input), cap: capacityOf(input), scopeOf };
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

function simulate(uses: readonly CardUse[], writing: Writing, ctx: Ctx): Sim {
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
  const retry = 1 + (1 - ctx.pr.p);
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

/** Steps a band down (PRACTICE_BANDS order) while one session is more than the share; D15 at least. */
function bandFor(method: PracticeMethod, share: number): PracticeBand {
  let i = PRACTICE_BANDS.indexOf(METHOD_DEFAULT_BAND[method]);
  while (i > 0 && share < practiceBandMinutes(PRACTICE_BANDS[i])) i -= 1;
  return PRACTICE_BANDS[Math.max(0, i)];
}

interface Allocation {
  /** Each WORKED_OUT practice's share of the budget a week; null with none to allocate. */
  share: number | null;
  /** Even one D15 session does not fit: the time verdict is OVER ("cut a practice or raise hours"). */
  cut: boolean;
}

function allocationOf(ms: MilestoneDraft, sim: Sim, ctx: Ctx, from: DayKey): Allocation {
  const practices = livePractices(ms);
  const auto = practices.filter((p) => p.planSource !== "YOURS");
  if (auto.length === 0) return { share: null, cut: false };
  const fixedMin = practices.filter((p) => p.planSource === "YOURS").reduce((s, p) => s + sessionsPerWeekOf(p) * bandMinutesOf(p), 0);
  const load = meanLoadWeek(sim, from, ms.dueDay!, ctx.held);
  const budget = PRACTICE_BUDGET_SHARE * (ctx.cap.weekMin - load) - fixedMin;
  const share = budget / auto.length;
  return { share, cut: share < practiceBandMinutes("D15") };
}

/** Sets sessions, band and rule on the milestone's WORKED_OUT practices (planSource WORKED_OUT); YOURS ones keep theirs. */
function allocate(ms: MilestoneDraft, sim: Sim, ctx: Ctx, from: DayKey): Allocation {
  const alloc = allocationOf(ms, sim, ctx, from);
  if (alloc.share == null) return alloc;
  const share = Math.max(0, alloc.share);
  for (const p of livePractices(ms)) {
    if (p.planSource === "YOURS") continue;
    const band = bandFor(p.method ?? "DELIBERATE_PRACTICE", share);
    const sessions = clamp(Math.floor(share / practiceBandMinutes(band) + EPS), SESSIONS_MIN, SESSIONS_MAX);
    p.durationBand = band;
    p.sessionsPerWeek = sessions;
    p.rule = sessions >= SESSIONS_MAX ? "DAILY" : `TARGET:${sessions}/W`;
    p.planSource = "WORKED_OUT";
  }
  return alloc;
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
 */
export function fitPlan(plan: readonly MilestoneDraft[], input: RealismInput): MilestoneDraft[] {
  return fitWith(plan, input, {});
}

function fitWith(plan: readonly MilestoneDraft[], input: RealismInput, opts: { resetTyped?: boolean; makeId?: () => string }): MilestoneDraft[] {
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
    allocate(ms, state.sim, ctx, from);
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
  return `You've tracked ${hm(cap.trackedMedian ?? 0)} a week of tasks (task estimates). Plans may add up to +50% (${allowance}) until your tracked time grows; you said ${hours} h.`;
}

interface WeekRow {
  week: PlanWeek;
  load: WeekLoad;
  open: number;
}

function weeksOf(ms: MilestoneDraft, from: DayKey, state: PlanState, ctx: Ctx): WeekRow[] {
  const out: WeekRow[] = [];
  const to = ms.dueDay!;
  if (from > to) return out;
  const cm = cardMeasureOf(ms);
  const scope = cm ? ctx.scopeOf(cm.scope.domainIds!) : null;
  const lastCardDay = cm ? addDays(to, -floorBase(cm.minLevel!, ctx.m)) : null;
  const cutAt = (d: DayKey) => (lastCardDay == null ? d : minDay(d, lastCardDay));
  const cumAt = (d: DayKey) => (scope && lastCardDay != null && d >= ctx.today ? Math.floor(writtenThrough(state.writing, scope.key, cutAt(d)) + EPS) : 0);
  for (let w = weekStartKeyOf(from); w <= to; w = addDays(w, 7)) {
    const a = maxDay(w, from);
    const b = minDay(addDays(w, 6), to);
    const open = openDays(a, b, ctx.held);
    const reviewMin = sumIn(state.sim.review, state.sim, a, b);
    const writeMin = sumIn(state.sim.write, state.sim, a, b);
    const practiceMin = practiceMinutesIn(ms, a, b, ctx.held);
    const availableMin = (ctx.cap.weekMin * open) / 7;
    const newPerWeek = scope && lastCardDay != null && a <= lastCardDay ? cumAt(b) - cumAt(addDays(a, -1)) : 0;
    out.push({
      week: { weekStart: w, newPerWeek, practiceMin: round1(practiceMin), reviewMin: round1(reviewMin), availableMin: round1(availableMin), availableClass: ctx.cap.class },
      load: { weekStart: w, reviewMin: round1(reviewMin), writeMin: round1(writeMin), practiceMin: round1(practiceMin), availableMin: round1(availableMin), availableClass: ctx.cap.class },
      open,
    });
  }
  return out;
}

function timeCheckOf(ms: MilestoneDraft, from: DayKey, rows: readonly WeekRow[], state: PlanState, ctx: Ctx): TimeCheck {
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

  const alloc = allocationOf(ms, state.sim, ctx, from);
  if (alloc.cut) {
    verdict = "OVER";
    basis.push("Even one 15-minute session a week of each practice doesn't fit beside the reviews and new cards: cut a practice or raise hours.");
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
  let n = clamp(Math.min(nFor(span, unstarted.length, carriedPositions), unstarted.length), 0, MAX_MILESTONES);
  while (n > 0 && positionCountOf([...carriedAll, ...unstarted.slice(0, n)]) > MAX_MILESTONES) n -= 1;
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
 */
export function refit(plan: readonly MilestoneDraft[], input: RealismInput): MilestoneDraft[] {
  const split = resplit(plan, input, (span, unstarted) => Math.min(unstarted, milestoneCountFor(Math.max(span, 1))));
  return fitWith(split, input, {});
}

// ═══ Remedies (F4 step 9) ════════════════════════════════════════════════════

const passes = (fe: Feasibility): boolean => !fe.impossible && !fe.over;
const knowledgeProblem = (milestones: readonly MilestoneFeasibility[]): boolean => milestones.some((m) => m.knowledge.some((k) => k.verdict === "OVER" || k.verdict === "IMPOSSIBLE"));

function movedTo(plan: readonly MilestoneDraft[], input: RealismInput, targetDay: DayKey): { plan: MilestoneDraft[]; input: RealismInput } {
  const moved: RealismInput = { ...input, targetDay };
  const keep = Math.max(1, scheduledUnstarted(plan));
  return { plan: fitWith(resplit(plan, moved, () => keep), moved, {}), input: moved };
}

/**
 * Remedy (a)'s new aim date: the earliest Sunday after the current one, up
 * to SPAN_MAX_DAYS from today, on which the re-split plan has nothing
 * IMPOSSIBLE and nothing OVER; null when none does. The search assumes a
 * later date never hurts (reach only grows with time) and verifies the day
 * it returns. The caller stores it as Roadmap.targetDay.
 */
export function remedyTargetDay(plan: readonly MilestoneDraft[], input: RealismInput): DayKey | null {
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

function laterBy(plan: readonly MilestoneDraft[], input: RealismInput, k: number): MilestoneDraft[] {
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
  return fitWith(resplit(marked, input, () => keep), input, {});
}

function refitLight(plan: readonly MilestoneDraft[], input: RealismInput): { plan: MilestoneDraft[]; input: RealismInput } {
  const light: RealismInput = { ...input, intensity: "LIGHT" };
  return { plan: fitWith(plan, light, { resetTyped: true }), input: light };
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
 */
export function applyRemedy(plan: readonly MilestoneDraft[], input: RealismInput, remedy: Remedy): MilestoneDraft[] {
  if (remedy === "MOVE_DATE") {
    const day = remedyTargetDay(plan, input);
    return day ? movedTo(plan, input, day).plan : plan.map(cloneMilestone);
  }
  if (remedy === "REFIT_LIGHT") return refitLight(plan, input).plan;
  const k = laterCount(plan, input);
  return k == null ? plan.map(cloneMilestone) : laterBy(plan, input, k);
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

/** Syllabus lines split across n milestones in order, as evenly as possible (earlier ones take the extra), at most TOPICS_PER_MILESTONE each. */
function syllabusChunks(lines: number, n: number): number[][] {
  const out: number[][] = [];
  let next = 0;
  for (let i = 0; i < n; i++) {
    const size = Math.min(TOPICS_PER_MILESTONE, Math.floor(lines / n) + (i < lines % n ? 1 : 0));
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
 */
export function starterLadder(intake: Intake, input: RealismInput, names: Readonly<Record<string, DomainName>>, makeId: () => string): MilestoneDraft[] {
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
 */
export function manualLadder(intake: Intake, input: RealismInput, makeId: () => string): MilestoneDraft[] {
  void intake;
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
  /** "Target 20 was fitted when you accepted; fitted today it would be 14 (…)"; null when the stored target still fits. */
  todayCheck: { measureKey: string; stored: number; fittedNow: number; reason: string } | null;
  impossible: boolean;
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
 */
export function refitForStart(milestone: MilestoneDraft, plan: readonly MilestoneDraft[], input: RealismInput): StartRefit {
  const ctx = contextOf(input);
  const ms = cloneMilestone(milestone);
  ms.windowStart = ctx.today;
  const others = plan.filter((p) => p.lineageId !== milestone.lineageId && !(milestone.id != null && p.id === milestone.id));
  const full = [...others.map(cloneMilestone), ms];
  const state = planStateOf(full, ctx);
  if (ms.dueDay != null) {
    allocate(ms, state.sim, ctx, ctx.today);
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
 */
export function startSnapshotOf(milestone: MilestoneDraft, refitted: StartRefit, input: RealismInput, startedDay: DayKey): StartSnapshot {
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
