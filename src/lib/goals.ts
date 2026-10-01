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

/** What goalProgress reads. The Today board (phase B) builds this from its own data. */
export interface GoalProgressInput {
  /** null reads as CHILDREN (the board's default). REVIEWS, IDEAS, WORKOUTS and RUN_KM give g = null. */
  krMetric: KrMetric | null;
  krTarget: number | null;
  steps: readonly GoalStep[];
  progress: readonly GoalProgressRow[];
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

/** 'pays ⬡ 1 when done' (SHORT); 'pays ⬡ 6 × progress from 70%' (MID, LONG with its own stated). */
export function statedPayoutCopy(horizon: Horizon, stated: number = statedGoalMp(horizon)): string {
  const mp = String(round2(stated));
  if (GOAL_RULES[horizon].binary) return `pays ⬡ ${mp} when done`;
  return `pays ⬡ ${mp} × progress from ${Math.round(payBar(horizon) * 100)}%`;
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
 * g in 0..1 as of `asOf` (use goalAsOf): CHILDREN = done steps (completedDay
 * ≤ asOf) ÷ steps, null with no steps; MANUAL = Σ progress qty (day ≤ asOf)
 * ÷ krTarget, null with no target; any other metric null.
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
 * The depth one paid goal row added to its track: its horizon's GOAL_DEPTH,
 * within what was left under the cap after the track's earlier paying rows
 * (by day, then key). 0 for a row that paid nothing.
 */
export function goalDepthAdded(mints: readonly GoalMintRow[], key: string): number {
  const row = mints.find((m) => m.key === key);
  if (!row || !isPaying(row) || !row.track) return 0;
  const earlier = mints
    .filter((m) => m.track === row.track && m.key !== key && isPaying(m))
    .filter((m) => m.day < row.day || (m.day === row.day && m.key < key));
  const before = Math.min(GOAL_DEPTH_CAP, earlier.reduce((s, m) => s + GOAL_DEPTH[horizonOfGoalReason(m.reason)!], 0));
  return Math.max(0, Math.min(GOAL_DEPTH[horizonOfGoalReason(row.reason)!], GOAL_DEPTH_CAP - before));
}

const daysText = (n: number): string => (n === 0 ? "today" : n === 1 ? "1 day ago" : `${n.toLocaleString("en-GB")} days ago`);

/**
 * The payout of closing now. g is measured as of goalAsOf(today, dueDay);
 * stated = goalMp ?? statedGoalMp(h); scaled = SHORT stated when g = 1 (else
 * 0), MID and LONG round2(stated × g). The first gate that fails sets why
 * and pays 0:
 *   1. not launched                 'before life MP began'
 *   2. g null                       'not measured: add a step or a number'
 *   3. g below the bar              'not finished' (SHORT) / 'below 70%'
 *   4. lifetime < 3 / 21 / 90 days  'set 5 days ago (21 needed)'
 *   5. SHORT: 2 already paid in the close day's life week
 *   6. MID: 2 paid in the days (today − 30, today]
 *   7. LONG: 1 paid in the days (today − 91, today]
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
  const base = { horizon: h, track: input.track, reason: goalReasonOf(h), stated, bar: rule.bar, scaled, g };
  const refuse = (why: string): GoalPayout => ({ ...base, pays: 0, why, depth: 0 });

  if (!isLaunched(input.today, input.launchDay)) return refuse("before life MP began");
  if (g == null) return refuse("not measured: add a step or a number");
  if (g + 1e-9 < rule.bar) return refuse(rule.binary ? "not finished" : `below ${Math.round(rule.bar * 100)}%`);
  const lifetime = daysBetween(input.createdDay, input.today);
  if (lifetime < rule.minLifetimeDays) return refuse(`set ${daysText(Math.max(0, lifetime))} (${rule.minLifetimeDays} needed)`);

  const ownKey = goalMintKey(input.id);
  const sameHorizon = input.goalMints.filter((m) => m.key !== ownKey && isPaying(m) && m.reason === rule.reason);
  if (rule.window === "LIFE_WEEK") {
    const monday = weekStartKeyOf(input.today);
    const sunday = addDays(monday, 6);
    if (sameHorizon.filter((m) => m.day >= monday && m.day <= sunday).length >= rule.maxPaying) {
      return refuse(`${rule.maxPaying} ${rule.name} goals already paid this week`);
    }
  } else {
    const after = addDays(input.today, -rule.windowDays);
    if (sameHorizon.filter((m) => m.day > after && m.day <= input.today).length >= rule.maxPaying) {
      return refuse(
        rule.maxPaying === 1
          ? `a ${rule.name} goal paid in the last ${rule.windowDays} days`
          : `${rule.maxPaying} ${rule.name} goals paid in the last ${rule.windowDays} days`
      );
    }
  }

  // A goal stated at 0 (never by the table; only a hand-edited goalMp) pays nothing and says so.
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

/** '3 of 5 steps', '4 of 12 books', '7 books so far', 'no steps yet', 'not measured'. */
export function goalProgressLabel(
  input: GoalProgressInput & { krUnit?: string | null },
  asOf: DayKey
): string {
  const metric: KrMetric = input.krMetric ?? "CHILDREN";
  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toFixed(1));
  const unit = input.krUnit ? ` ${input.krUnit}` : "";
  if (metric === "CHILDREN") {
    const { done, total } = stepsDoneAsOf(input.steps, asOf);
    return total > 0 ? `${done} of ${total} step${total === 1 ? "" : "s"}` : "no steps yet";
  }
  if (metric === "MANUAL") {
    const qty = progressQtyAsOf(input.progress, asOf);
    const target = input.krTarget;
    return target != null && Number.isFinite(target) && target > 0 ? `${fmt(qty)} of ${fmt(target)}${unit}` : `${fmt(qty)}${unit} so far`;
  }
  return "not measured";
}
