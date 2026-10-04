/**
 * FROZEN CONTRACT (M5 lane 0 shell; lane A implements, F6) — goals: how far
 * a goal has got (g), and what closing it pays in mastery points.
 *
 * Spec: docs/life-plan/m5-refit.md F6; contract table:
 * docs/life-plan/m5-contracts.md. Pure and client-importable: it imports
 * life-economy and life-day, never Prisma or today-board. The server half
 * (readGoalCloseInput, closeGoalCore, rescheduleGoalCore, loadGoalLadder,
 * stateGoalMp) is goals-server.ts (lane A).
 *
 * Rules the implementation keeps (house rules): a goal's MP is stated when
 * it is created and frozen (goalMp); goals never pay XP and never write a
 * TRACK row; closing is explicit and final and writes exactly one
 * 'mp:GOAL:<id>' decision row (qty = MP paid, 0 allowed); nothing pays
 * before launch; a missed goal is 'Carried 0.55', never a debt.
 *
 * Exports (frozen):
 *
 *   Shapes        GoalStep · GoalProgressRow · GoalProgressInput · GoalMintRow · GoalInput
 *                 GoalPayout · GoalClosed · GoalLadderItem · GoalLadder
 *   Final (lane 0) goalAsOf(today, dueDay) · statedPayoutCopy(horizon, stated?)
 *   Lane A (F6)   goalProgress(input, asOf) · closeDecision(input)
 *   Added (lane A, compatible)
 *                 stepsDoneAsOf · progressQtyAsOf · goalProgressLabel(input, asOf) ('3 of 5 steps')
 *                 horizonOfGoalReason · trackGoalDepth(mints, track) · goalDepthAdded(mints, key)
 *                 goalCloseMint(goal, payout, day): the one 'mp:GOAL:<id>' decision row a close writes
 *   Added by the M5 review (compatible)
 *                 GoalMintRow.occurredAt? — same-day rows order by it, as the Seal does (C5)
 *                 goalPercent(g) — the one floored percentage Today and You show (U6)
 *                 goalLimitWindow(input) · GoalLimitWindow — what a close's limit and cap gates
 *                   counted, so goals-server re-checks them inside the close transaction (C3)
 *                 closedGoalReading(input, closeDay, why) — a closed goal measured as of its close (U5)
 *   Added by the phase B review (compatible)
 *                 GOAL_ALREADY_CLOSED — the refusal a replayed close gets; Today refreshes on it
 *   Added by roadmap lane 0 (types only; docs/life-plan/roadmap-contracts.md)
 *                 RoadmapSeriesPoint · RoadmapGoalEntry · GoalProgressInput.readings?
 *   Added by roadmap lane L (behaviour; docs/life-plan/roadmap.md F16 seam 1, compatible)
 *                 goalProgress · goalProgressLabel: the 'ROADMAP' branch, read from the stored series
 *                 roadmapPointAsOf(readings, asOf) — the series point a day reads · ROADMAP_CAPTION
 *                 statedPayoutCopy(h, 0) reads 'pays nothing' · statedPayoutLine(h, stated, zeroReason?)
 *                 closeDecision: 'it states 0 MP' is decided before the bar and age gates
 *                 closedGoalReading: a ROADMAP goal reads its stored closedScore (g at the close)
 *                 GoalInput.readingNote? → GoalPayout.readingNote? ('not recorded on this server')
 *                 GoalLadderItem.roadmap? (the goal's RoadmapGoalEntry: the ladder's chip, note and "measured" time)
 *   Added by the roadmap fix round (lane L, compatible)
 *                 GoalInput.lineagePaidOn? · lineagePaidOnOf(mints, goalIds) — at most one goal of a
 *                   milestone lineage pays: closeDecision refuses 'this milestone already paid on 3 Mar'
 */
import { addDays, daysBetween, weekStartKeyOf, type DayKey } from "./life-day";
import {
  GOAL_DEPTH,
  GOAL_DEPTH_CAP,
  GOAL_RULES,
  LIFE_MP_WEEK_CAP,
  cappedMp,
  goalMintKey,
  goalReasonOf,
  isLaunched,
  payBar,
  round2,
  statedGoalMp,
  type GoalMpReason,
  type LifeMintInput,
} from "./life-economy";
import type { Horizon, KrMetric, Track } from "./life-types";

/** The refusal a close of a goal that is already closed gets (a double tap, another device or tab). */
export const GOAL_ALREADY_CLOSED = "Already closed.";

// ── Inputs ────────────────────────────────────────────────────────────────

/** A one-off step: a non-recurring, non-goal, non-archived child of the goal. */
export interface GoalStep {
  /** The life day it was completed, or null while open. */
  completedDay: DayKey | null;
}

/** Σ GOAL_PROGRESS qty on one life day. */
export interface GoalProgressRow {
  day: DayKey;
  qty: number;
}

/**
 * One point of a roadmap milestone's stored series (roadmap lane 0 type;
 * docs/life-plan/roadmap.md F10, F16 seam 1): g on a life day, as the
 * minimum over its paying measures' last readings ≤ that day, with the
 * binding part's class and label for the caption ("tested by your reviews
 * · slowest: cards at level 6+"). Built by roadmap-measures.ts
 * milestoneGoalSeries from stored readings only.
 */
export interface RoadmapSeriesPoint {
  day: DayKey;
  /** 0..1, before the steps' share (goals.ts applies it). */
  g: number;
  /** ISO time of the binding reading ("measured 09:12"). */
  observedAt: string;
  bindingClass: "MEASURED" | "SELF_REPORTED";
  bindingLabel: string;
}

/**
 * What a surface knows about an open ROADMAP goal beyond the template
 * (roadmap lane 0 type; BoardData.roadmapGoals, keyed by goal id): its stored
 * series, "Roadmap · milestone 2 of 3", the "pays nothing · …" reason, and
 * the "measures removed by a reset" note.
 */
export interface RoadmapGoalEntry {
  series: readonly RoadmapSeriesPoint[];
  ord: number;
  of: number;
  zeroReason: string | null;
  note: string | null;
}

/** What goalProgress reads. The Today board (phase B) builds this from its own data. */
export interface GoalProgressInput {
  /** null reads as CHILDREN (the board's default). REVIEWS, IDEAS, WORKOUTS and RUN_KM give g = null. */
  krMetric: KrMetric | null;
  krTarget: number | null;
  steps: readonly GoalStep[];
  progress: readonly GoalProgressRow[];
  /**
   * ROADMAP goals only (roadmap lane 0 type; lane L reads it in the ROADMAP
   * branch, F16 seam 1): the stored series. g = the last point with day ≤
   * asOf, then the minimum with the steps' done share; null with no point.
   * Absent reads as no points.
   */
  readings?: readonly RoadmapSeriesPoint[];
}

/** One goal decision row ('mp:GOAL:<id>') as goals-server.ts reads it fresh. */
export interface GoalMintRow {
  key: string;
  templateId: string | null;
  track: Track | null;
  /** GOAL_SHORT | GOAL_MID | GOAL_LONG (life-economy parseMintDetail of the row's detail). */
  reason: string;
  day: DayKey;
  /** MP paid; 0 for a goal closed for nothing (it never counts as paying). */
  qty: number;
  /** When the row was written (epoch ms): orders two closes on one day. Absent rows order by key. */
  occurredAt?: number;
}

/** Everything closeDecision needs, read in one round trip by goals-server.ts readGoalCloseInput. */
export interface GoalInput extends GoalProgressInput {
  id: string;
  horizon: Horizon;
  track: Track;
  /** Frozen at creation; null (a goal from before launch) falls back to statedGoalMp(horizon). */
  goalMp: number | null;
  dueDay: DayKey | null;
  /** The life day the goal was created. lifetime = daysBetween(createdDay, today). */
  createdDay: DayKey;
  /** The close day. */
  today: DayKey;
  /** life-economy lifeLaunchDay(); before it (or with none) nothing pays. */
  launchDay: DayKey | null;
  /** Goal decision rows: every one dated in the last 91 days, plus this track's paying ones of any age. */
  goalMints: readonly GoalMintRow[];
  /** Σ capped MP (CAPPED_REASONS) already minted in the close day's life week. */
  cappedUsedThisWeek: number;
  /**
   * ROADMAP goals only (roadmap lane L): NOT_RECORDED_HERE when `readings`
   * carries a point computed live on a server that records nothing (F10). It
   * is passed through to GoalPayout.readingNote, so the Close sheet says so.
   */
  readingNote?: string | null;
  /**
   * ROADMAP goals only (roadmap fix round, lane L): the first day another
   * goal of this milestone's lineage closed paying (a dropped milestone and
   * its "Start again" copy share a lineage; lineagePaidOnOf). The close then
   * pays 0, "this milestone already paid on 3 Mar", whatever this goal
   * states, so a lineage never pays twice. Absent or null: no other paid.
   */
  lineagePaidOn?: DayKey | null;
}

// ── Outputs ───────────────────────────────────────────────────────────────

/** What closing pays, and why. The preview and the close compute it with the same function. */
export interface GoalPayout {
  horizon: Horizon;
  track: Track;
  reason: GoalMpReason;
  /** goalMp ?? statedGoalMp(horizon). */
  stated: number;
  /** payBar(horizon): SHORT 1, MID and LONG 0.7. */
  bar: number;
  /** Before gates and the cap: SHORT stated when g = 1 else 0; MID and LONG round2(stated × g). */
  scaled: number;
  /** min(1, progress) as of goalAsOf(today, dueDay); null when not measured. */
  g: number | null;
  /** MP the close mints (≥ 0, 2 dp). */
  pays: number;
  /** null when it pays `scaled` in full; else the first failing gate or the cap ('below 70%', …). */
  why: string | null;
  /** Track depth it adds: pays > 0 ? min(GOAL_DEPTH[h], 2 − the track's goal depth) : 0. */
  depth: number;
  /** ROADMAP only: GoalInput.readingNote, present when g was computed live and recorded nowhere. */
  readingNote?: string;
}

/** A closed goal, from its 'mp:GOAL:<id>' row and the template. */
export interface GoalClosed {
  paid: number;
  depth: number;
  day: DayKey;
  why: string | null;
}

/** One goal on the You sheet's ladder (goals-server.ts loadGoalLadder). */
export interface GoalLadderItem {
  id: string;
  title: string;
  horizon: Horizon;
  track: Track;
  stated: number;
  /** statedPayoutCopy(horizon, stated). */
  copy: string;
  g: number | null;
  /** '3 of 5 steps', '4 of 12 books'. */
  progressLabel: string;
  dueDay: DayKey | null;
  pastDue: boolean;
  /** g when past due and g < 1 ('Carried 0.55'); else null. */
  carried: number | null;
  /** Open goals: what closing now would pay. Closed goals: null. */
  preview: GoalPayout | null;
  closed: GoalClosed | null;
  /**
   * Open ROADMAP goals with a stored-series entry only (F16 seam 13): the
   * entry the board gets too (BoardData.roadmapGoals), for the ladder's chip
   * "Roadmap · milestone 2 of 3", its "measured 09:12" (the series point
   * roadmapPointAsOf reads at goalAsOf), the zero reason (already folded into
   * `copy` by statedPayoutLine) and the reset note.
   */
  roadmap?: RoadmapGoalEntry;
}

/** Open goals (LONG → MID → SHORT, then by due day) and goals closed in the last 30 days (newest first). */
export interface GoalLadder {
  open: GoalLadderItem[];
  closed: GoalLadderItem[];
}

// ── Final helpers (lane 0) ────────────────────────────────────────────────

/** The day g is measured on: min(today, dueDay). Progress after the due day never counts. */
export function goalAsOf(today: DayKey, dueDay: DayKey | null): DayKey {
  return dueDay && dueDay < today ? dueDay : today;
}

/**
 * g as a whole percentage, floored, so a goal never reads as reaching a bar
 * it has not: 2 of 3 steps is 66, 0.695 is 69 (and closing pays 0, 'below
 * 70%'). The 1e-9 only absorbs float noise (0.29 × 100 = 28.999…), the same
 * tolerance closeDecision gives the bar. The one rule for Today's goal cards
 * and the You sheet's ladder: render `${goalPercent(g)}%`.
 */
export function goalPercent(g: number): number {
  if (!Number.isFinite(g)) return 0;
  return Math.floor(Math.max(0, Math.min(1, g)) * 100 + 1e-9);
}

/**
 * 'pays ⬡ 1 when done' (SHORT); 'pays ⬡ 6 × progress from 70%' (MID, LONG
 * with its own stated); 'pays nothing' for a goal stated at 0 (a roadmap
 * milestone that is knowledge only, a token practice or an already paid
 * lineage; a hand-edited 0), whose caller appends the reason (statedPayoutLine).
 */
export function statedPayoutCopy(horizon: Horizon, stated: number = statedGoalMp(horizon)): string {
  const rounded = round2(stated);
  if (!(rounded > 0)) return "pays nothing";
  const mp = String(rounded);
  if (GOAL_RULES[horizon].binary) return `pays ⬡ ${mp} when done`;
  return `pays ⬡ ${mp} × progress from ${Math.round(payBar(horizon) * 100)}%`;
}

/**
 * statedPayoutCopy with a 0-stated goal's reason after it: 'pays nothing ·
 * knowledge is paid by reviews'. A reason already written 'pays nothing · …'
 * is used as it is; a goal that states MP ignores the reason.
 */
export function statedPayoutLine(horizon: Horizon, stated: number = statedGoalMp(horizon), zeroReason?: string | null): string {
  const copy = statedPayoutCopy(horizon, stated);
  const reason = zeroReason?.trim();
  if (copy !== "pays nothing" || !reason) return copy;
  return reason.startsWith(copy) ? reason : `${copy} · ${reason}`;
}

// ── Lane A (F6) ───────────────────────────────────────────────────────────

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Done steps as of a day, and how many there are (CHILDREN). */
export function stepsDoneAsOf(steps: readonly GoalStep[], asOf: DayKey): { done: number; total: number } {
  return { done: steps.filter((s) => s.completedDay != null && s.completedDay <= asOf).length, total: steps.length };
}

/** Σ GOAL_PROGRESS qty dated on or before a day (MANUAL). */
export function progressQtyAsOf(progress: readonly GoalProgressRow[], asOf: DayKey): number {
  let qty = 0;
  for (const p of progress) if (p.day <= asOf && Number.isFinite(p.qty)) qty += p.qty;
  return qty;
}

/**
 * The point of a ROADMAP goal's stored series that a day reads: the latest
 * point dated on or before `asOf` (by day, then observedAt), or null when
 * there is none. Points with no finite g are not readings and are skipped.
 */
export function roadmapPointAsOf(readings: readonly RoadmapSeriesPoint[] | undefined, asOf: DayKey): RoadmapSeriesPoint | null {
  let best: RoadmapSeriesPoint | null = null;
  for (const p of readings ?? []) {
    if (!p || typeof p.day !== "string" || p.day > asOf || !Number.isFinite(p.g)) continue;
    if (!best || p.day > best.day || (p.day === best.day && (p.observedAt ?? "") > (best.observedAt ?? ""))) best = p;
  }
  return best;
}

/** The caption of a ROADMAP goal's binding part (Provenance): cards tested by reviews, or the user's own ticks. */
export const ROADMAP_CAPTION = {
  MEASURED: "tested by your reviews",
  SELF_REPORTED: "from your ticks",
} as const satisfies Record<RoadmapSeriesPoint["bindingClass"], string>;

/**
 * g in 0..1 as of `asOf` (use goalAsOf): CHILDREN = done steps (completedDay
 * ≤ asOf) ÷ steps, null with no steps; MANUAL = Σ progress qty (day ≤ asOf)
 * ÷ krTarget, null with no target; ROADMAP = the stored series point asOf
 * reads (roadmapPointAsOf), then the minimum with the steps' done share when
 * steps exist, null with no point (it pays 0, "not measured"); any other
 * metric null.
 */
export function goalProgress(input: GoalProgressInput, asOf: DayKey): number | null {
  const metric: KrMetric = input.krMetric ?? "CHILDREN";
  if (metric === "CHILDREN") {
    const { done, total } = stepsDoneAsOf(input.steps, asOf);
    return total > 0 ? clamp01(done / total) : null;
  }
  if (metric === "MANUAL") {
    const target = input.krTarget;
    if (target == null || !Number.isFinite(target) || target <= 0) return null;
    return clamp01(progressQtyAsOf(input.progress, asOf) / target);
  }
  if (metric === "ROADMAP") {
    // Stored readings only (roadmap.md decision 7): no surface appends a live value here.
    const point = roadmapPointAsOf(input.readings, asOf);
    if (!point) return null;
    const { done, total } = stepsDoneAsOf(input.steps, asOf);
    return total > 0 ? Math.min(clamp01(point.g), clamp01(done / total)) : clamp01(point.g);
  }
  // REVIEWS, IDEAS, WORKOUTS, RUN_KM: not measured in M5.
  return null;
}

/** A goal decision row's horizon, from its reason ('GOAL_MID' → MID), or null. */
export function horizonOfGoalReason(reason: string): Horizon | null {
  for (const h of Object.keys(GOAL_RULES) as Horizon[]) if (GOAL_RULES[h].reason === reason) return h;
  return null;
}

/** A decision row that paid (qty > 0) under a goal reason: the only kind that counts toward limits and depth. */
const isPaying = (m: GoalMintRow): boolean => m.qty > 0 && horizonOfGoalReason(m.reason) !== null;

/**
 * The goal depth a track already holds: Σ GOAL_DEPTH of its paying goal
 * rows, capped at GOAL_DEPTH_CAP (a qty-0 row adds nothing).
 */
export function trackGoalDepth(mints: readonly GoalMintRow[], track: Track, exceptKey?: string): number {
  let depth = 0;
  for (const m of mints) {
    if (m.track !== track || m.key === exceptKey || !isPaying(m)) continue;
    depth += GOAL_DEPTH[horizonOfGoalReason(m.reason)!];
  }
  return Math.min(GOAL_DEPTH_CAP, depth);
}

/**
 * The order goal rows were decided in: day, then the time written, then key
 * (snapshot.ts readGoals' order, so the ladder and the Seal agree).
 */
function decidedBefore(a: GoalMintRow, b: GoalMintRow): boolean {
  if (a.day !== b.day) return a.day < b.day;
  if (a.occurredAt != null && b.occurredAt != null && a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt;
  return a.key < b.key;
}

/**
 * The depth one paid goal row added to its track: its horizon's GOAL_DEPTH,
 * within what was left under the cap after the track's earlier paying rows
 * (by day, then occurredAt, then key: the order they were closed in). 0 for
 * a row that paid nothing.
 */
export function goalDepthAdded(mints: readonly GoalMintRow[], key: string): number {
  const row = mints.find((m) => m.key === key);
  if (!row || !isPaying(row) || !row.track) return 0;
  const earlier = mints.filter((m) => m.track === row.track && m.key !== key && isPaying(m) && decidedBefore(m, row));
  const before = Math.min(GOAL_DEPTH_CAP, earlier.reduce((s, m) => s + GOAL_DEPTH[horizonOfGoalReason(m.reason)!], 0));
  return Math.max(0, Math.min(GOAL_DEPTH[horizonOfGoalReason(row.reason)!], GOAL_DEPTH_CAP - before));
}

const daysText = (n: number): string => (n === 0 ? "today" : n === 1 ? "1 day ago" : `${n.toLocaleString("en-GB")} days ago`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** '2026-03-03' → '3 Mar' (the roadmap's "already paid on 3 Mar"), read from the key itself, so no zone can shift it. */
function dayMonthText(day: DayKey): string {
  const [, m, d] = day.split("-").map(Number);
  const month = MONTHS[(m ?? 0) - 1];
  return month && Number.isFinite(d) ? `${d} ${month}` : day;
}

/**
 * The first day one of `goalIds` closed paying (its 'mp:GOAL:<id>' row with
 * qty > 0 under a goal reason), or null. goals-server passes the other goals
 * of a ROADMAP goal's milestone lineage, read with the goal's decision rows
 * (readGoalCloseInput keeps every paying one, of any age), so a lineage
 * whose dropped row or "Start again" copy already paid states it here.
 */
export function lineagePaidOnOf(mints: readonly GoalMintRow[], goalIds: readonly string[]): DayKey | null {
  if (goalIds.length === 0) return null;
  const keys = new Set(goalIds.map(goalMintKey));
  let first: DayKey | null = null;
  for (const m of mints) if (keys.has(m.key) && isPaying(m) && (first === null || m.day < first)) first = m.day;
  return first;
}

/**
 * What a close's limit gate and (SHORT) cap trim counted: the paying rows of
 * this goal's reason in its window — the close day's life week (SHORT), or
 * the days (close − N, close] (MID 30, LONG 91) — other than its own, and
 * the capped MP already in the close day's life week. closeDecision decides
 * from exactly these; goals-server.ts re-counts them inside the close
 * transaction, after the life-mint lock, and refuses the close when another
 * write changed them in between.
 */
export interface GoalLimitWindow {
  reason: GoalMpReason;
  /** Inclusive day range of the limit window. */
  from: DayKey;
  to: DayKey;
  /** Paying rows of `reason` dated in [from, to], this goal's own row excluded. */
  paying: number;
  /** The close day's life week and its capped MP as read: SHORT only (its pay is trimmed by the cap); null otherwise. */
  cappedWeek: { monday: DayKey; sunday: DayKey; used: number } | null;
}

export function goalLimitWindow(input: GoalInput): GoalLimitWindow {
  const rule = GOAL_RULES[input.horizon];
  const monday = weekStartKeyOf(input.today);
  const sunday = addDays(monday, 6);
  const from = rule.window === "LIFE_WEEK" ? monday : addDays(input.today, 1 - rule.windowDays);
  const to = rule.window === "LIFE_WEEK" ? sunday : input.today;
  const ownKey = goalMintKey(input.id);
  const paying = input.goalMints.filter((m) => m.key !== ownKey && isPaying(m) && m.reason === rule.reason && m.day >= from && m.day <= to).length;
  return {
    reason: rule.reason,
    from,
    to,
    paying,
    cappedWeek: rule.capped ? { monday, sunday, used: round2(Math.max(0, input.cappedUsedThisWeek)) } : null,
  };
}

/**
 * The payout of closing now. g is measured as of goalAsOf(today, dueDay);
 * stated = goalMp ?? statedGoalMp(h); scaled = SHORT stated when g = 1 (else
 * 0), MID and LONG round2(stated × g). The first gate that fails sets why
 * and pays 0:
 *   1. not launched                 'before life MP began'
 *   2. g null                       'not measured: add a step or a number'
 *                                   ('not measured yet' for a ROADMAP goal: no stored reading)
 *   3. stated 0                     'it states 0 MP'
 *      ROADMAP: its lineage paid    'this milestone already paid on 3 Mar' (lineagePaidOn)
 *   4. g below the bar              'not finished' (SHORT) / 'below 70%'
 *   5. lifetime < 3 / 21 / 90 days  'set 5 days ago; it pays once 21 days old'
 *   6. SHORT: 2 already paid in the close day's life week
 *   7. MID: 2 paid in the days (today − 30, today]
 *   8. LONG: 1 paid in the days (today − 91, today]
 * Then SHORT pays stated within the 8 MP life-week cap (trimmed, or 0 'the
 * life week's 8 MP cap is reached'); MID and LONG pay scaled. depth = pays >
 * 0 ? min(GOAL_DEPTH[h], 2 − the track's goal depth) : 0. Goals never pay XP.
 */
export function closeDecision(input: GoalInput): GoalPayout {
  const h = input.horizon;
  const rule = GOAL_RULES[h];
  const stated = typeof input.goalMp === "number" && Number.isFinite(input.goalMp) && input.goalMp >= 0 ? input.goalMp : statedGoalMp(h);
  const g = goalProgress(input, goalAsOf(input.today, input.dueDay));
  const scaled = g == null ? 0 : rule.binary ? (g >= 1 - 1e-9 ? stated : 0) : round2(stated * g);
  const note = input.readingNote ? { readingNote: input.readingNote } : {};
  const base = { horizon: h, track: input.track, reason: goalReasonOf(h), stated, bar: rule.bar, scaled, g, ...note };
  const refuse = (why: string): GoalPayout => ({ ...base, pays: 0, why, depth: 0 });

  if (!isLaunched(input.today, input.launchDay)) return refuse("before life MP began");
  if (g == null) return refuse(input.krMetric === "ROADMAP" ? "not measured yet" : "not measured: add a step or a number");
  // A goal stated at 0 pays nothing at any progress, so it says that before the bar and age gates:
  // it never reads 'below 70%', which would imply it pays from 70%. Roadmap milestones state 0 on
  // purpose when they are knowledge only (reviews already pay for cards), carry a token practice,
  // or belong to a lineage that already paid (roadmap.md decision 8); a hand-edited 0 reads the same.
  if (!(round2(stated) > 0)) return refuse("it states 0 MP");
  // At most one goal of a milestone lineage pays (roadmap.md F15 "a paid lineage states 0"; the fix
  // round's backstop at the one place that mints, for a dropped milestone, its copy and an unarchive).
  if (input.lineagePaidOn) return refuse(`this milestone already paid on ${dayMonthText(input.lineagePaidOn)}`);
  if (g + 1e-9 < rule.bar) return refuse(rule.binary ? "not finished" : `below ${Math.round(rule.bar * 100)}%`);
  const lifetime = daysBetween(input.createdDay, input.today);
  if (lifetime < rule.minLifetimeDays) return refuse(`set ${daysText(Math.max(0, lifetime))}; it pays once ${rule.minLifetimeDays} days old`);

  const ownKey = goalMintKey(input.id);
  const limit = goalLimitWindow(input);
  if (rule.window === "LIFE_WEEK") {
    if (limit.paying >= rule.maxPaying) {
      return refuse(`${rule.maxPaying} ${rule.name} goals already paid this week`);
    }
  } else {
    if (limit.paying >= rule.maxPaying) {
      return refuse(
        rule.maxPaying === 1
          ? `a ${rule.name} goal paid in the last ${rule.windowDays} days`
          : `${rule.maxPaying} ${rule.name} goals paid in the last ${rule.windowDays} days`
      );
    }
  }

  // Past the bar a stated goal scales above 0; this only catches a stated amount that rounds away.
  if (!(scaled > 0)) return refuse("it states 0 MP");
  let pays = scaled;
  let why: string | null = null;
  if (rule.capped) {
    pays = cappedMp(scaled, input.cappedUsedThisWeek);
    if (pays <= 0) return refuse(`the life week's ${LIFE_MP_WEEK_CAP} MP cap is reached`);
    if (pays < scaled) why = `trimmed by the life week's ${LIFE_MP_WEEK_CAP} MP cap`;
  }
  const depth = Math.max(0, Math.min(GOAL_DEPTH[h], GOAL_DEPTH_CAP - trackGoalDepth(input.goalMints, input.track, ownKey)));
  return { ...base, pays, why, depth };
}

/**
 * The one decision row a close writes ('mp:GOAL:<id>', dated the close day,
 * qty = MP paid, 0 allowed, detail = reason · why). mastery.ts
 * mintLifeMasteryOps turns it into the MP_MINT row (sink NONE) plus a ledger
 * entry only when it pays. Never a TRACK row: goals pay no XP.
 */
export function goalCloseMint(goal: { id: string; track: Track }, payout: GoalPayout, day: DayKey): LifeMintInput {
  return {
    reason: payout.reason,
    delta: payout.pays > 0 ? round2(payout.pays) : 0,
    why: payout.why,
    dedupeKey: goalMintKey(goal.id),
    day,
    track: goal.track,
    templateId: goal.id,
  };
}

/**
 * '3 of 5 steps', '4 of 12 books', '7 books so far', 'no steps yet', 'not
 * measured'. A ROADMAP goal names the part that sets its g, with that part's
 * evidence: 'tested by your reviews · slowest: cards at level 6+', 'from your
 * ticks · slowest: Backtest sessions', or 'from your ticks · slowest: 1 of 3
 * steps' when the steps bind; 'not measured yet' with no stored reading.
 */
export function goalProgressLabel(
  input: GoalProgressInput & { krUnit?: string | null },
  asOf: DayKey
): string {
  const metric: KrMetric = input.krMetric ?? "CHILDREN";
  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toFixed(1));
  const unit = input.krUnit ? ` ${input.krUnit}` : "";
  const stepsText = (done: number, total: number) => `${done} of ${total} step${total === 1 ? "" : "s"}`;
  if (metric === "CHILDREN") {
    const { done, total } = stepsDoneAsOf(input.steps, asOf);
    return total > 0 ? stepsText(done, total) : "no steps yet";
  }
  if (metric === "MANUAL") {
    const qty = progressQtyAsOf(input.progress, asOf);
    const target = input.krTarget;
    return target != null && Number.isFinite(target) && target > 0 ? `${fmt(qty)} of ${fmt(target)}${unit}` : `${fmt(qty)}${unit} so far`;
  }
  if (metric === "ROADMAP") {
    const point = roadmapPointAsOf(input.readings, asOf);
    if (!point) return "not measured yet";
    // The steps are a part of g too; they bind only when strictly below the measures (ties keep the measure).
    const { done, total } = stepsDoneAsOf(input.steps, asOf);
    if (total > 0 && done / total < clamp01(point.g)) return `${ROADMAP_CAPTION.SELF_REPORTED} · slowest: ${stepsText(done, total)}`;
    // Anything but MEASURED reads as the weaker class, never as tested.
    const caption = point.bindingClass === "MEASURED" ? ROADMAP_CAPTION.MEASURED : ROADMAP_CAPTION.SELF_REPORTED;
    const label = typeof point.bindingLabel === "string" ? point.bindingLabel.trim() : "";
    return label ? `${caption} · slowest: ${label}` : caption;
  }
  return "not measured";
}

/**
 * A closed goal as it stood when it was closed (M5 review U5): g and the
 * progress label both measured as of goalAsOf(closeDay, dueDay), so steps
 * ticked or numbers logged after the close move neither. g is null — no
 * percentage shown — when it cannot be measured, or when the close itself
 * was decided unmeasured (its why starts 'not measured'), even if a step was
 * added since. A ROADMAP goal is not re-derived: it reads its stored
 * closedScore, the g its close paid from (roadmap.md F16 seam 1).
 */
export function closedGoalReading(
  input: GoalProgressInput & { krUnit?: string | null; dueDay: DayKey | null; closedScore?: number | null },
  closeDay: DayKey,
  why: string | null
): { g: number | null; progressLabel: string; asOf: DayKey } {
  const asOf = goalAsOf(closeDay, input.dueDay);
  if (input.krMetric === "ROADMAP") {
    const score = input.closedScore;
    const g = why?.startsWith("not measured") || score == null || !Number.isFinite(score) ? null : clamp01(score);
    return { g, progressLabel: g == null ? "not measured" : "as measured at the close", asOf };
  }
  const measured = goalProgress(input, asOf);
  return { g: measured == null || why?.startsWith("not measured") ? null : measured, progressLabel: goalProgressLabel(input, asOf), asOf };
}
