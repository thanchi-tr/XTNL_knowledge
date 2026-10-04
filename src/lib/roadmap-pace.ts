/**
 * Roadmap pace (lane R1, F11): projections from the exact spaced-repetition
 * pipeline (no slope line; revision 2's secondary least-squares line is
 * Deferred), and the re-plan triggers. Pure and client-importable. Triggers
 * show on the Roadmap page and the Aim card only: never on Today, never in
 * the bell.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R1.
 *
 *   projectCards · projectPractice · triggersOf
 * Added by R1 (compatible): cardsExpectedBy · slowestPaceOf · TriggerMilestone.id/dueDay/level
 * Fix round: QUESTS_BEHIND's line is roadmap-quests questsBehindLine (one wording, R6 handoff 7).
 */
import { addDays, daysBetween, weekdayOf, type DayKey } from "./life-day";
import { questsBehindLine as questsBehindSentence } from "./roadmap-quests";
import {
  BEHIND_DAYS,
  FAR_WEEKS,
  PRACTICE_LOW,
  PRACTICE_LOW_MIN_UNITS,
  PRACTICE_LOW_WEEKS,
  REPLAN_TRIGGERS,
  WEEK_QUEST_BEHIND_WRITING_WEEKS,
  bestReach,
  existingExpected,
  floorBase,
  type AddQuestSpec,
  type EffectiveCard,
  type PaceResult,
  type PracticePace,
  type RaiseQuestSpec,
  type RateSource,
  type ReplanTrigger,
  type TriggerHit,
  type WeekQuestSet,
} from "./roadmap-types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** "13 Dec" (the lib's own lines; R5's copy formats its own). */
const shortDay = (key: DayKey): string => {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
/** "Sun 22 Nov". */
const weekdayDay = (key: DayKey): string => `${WEEKDAYS[weekdayOf(key) - 1]} ${shortDay(key)}`;

/** A card measure as the projection reads it. */
export interface CardPaceMeasure {
  minLevel: number;
  target: number;
  baseline: number | null;
  dueDay: DayKey;
  reachedDay: DayKey | null;
}

/**
 * The exact pipeline's expected count on day d (F4 step 2, F11): the cards
 * already at ≥ L, plus each card below L whose bestReach(L) ≤ d discounted by
 * p^k, plus the new cards written at `rate` a week from today up to
 * lastCardDay = d − floorBase(L), discounted by p^(L−1). p = null (calibrating)
 * reads the best case (p = 1). `pipeline` is the count of cards below L that
 * can reach L by d if passed on their day (the best case, undiscounted).
 */
export function cardsExpectedBy(
  cards: readonly EffectiveCard[],
  level: number,
  d: DayKey,
  p: number | null,
  rate: number | null,
  today: DayKey,
  m = 1
): { expected: number; best: number; pipeline: number; newBest: number } {
  const pp = p == null ? 1 : Math.max(0, Math.min(1, p));
  const existing = existingExpected(cards, level, d, pp, m);
  let atLevel = 0;
  let pipeline = 0;
  for (const c of cards) {
    if (c.level >= level) atLevel += 1;
    else if (bestReach(c, level, m) <= d) pipeline += 1;
  }
  const lastCardDay = addDays(d, -floorBase(level, m));
  const r = rate != null && Number.isFinite(rate) && rate > 0 ? rate : 0;
  const newBest = lastCardDay >= today && r > 0 ? Math.floor((r / 7) * (daysBetween(today, lastCardDay) + 1)) : 0;
  const newExpected = Math.floor(newBest * Math.pow(pp, level - 1));
  return { expected: existing + newExpected, best: atLevel + pipeline + newBest, pipeline, newBest };
}

/**
 * The expected count by the due day from the exact pipeline (each card's
 * bestReach discounted by p^k; expected = best while p is calibrating, p =
 * null) plus new cards at the pace measured since Start, and the first day
 * the target is met (`far` beyond FAR_WEEKS). `cards` are effective states
 * (roadmap-types effectiveState). Expected counts only grow with the day, so
 * the first day is found by bisection.
 *   - reached (reachedDay set) → "Reached 3 Nov";
 *   - first day ≤ due → on-pace: "On pace for 13 Dec · 9 cards in the pipeline can reach level 6 by then if passed on their day";
 *   - first day > due → behind: "About 3 weeks behind: at your pace about 16 of 20 by 13 Dec";
 *   - beyond FAR_WEEKS → far.
 */
export function projectCards(
  measure: CardPaceMeasure,
  cards: readonly EffectiveCard[],
  p: number | null,
  paceSinceStart: number | null,
  today: DayKey,
  m = 1
): PaceResult {
  if (measure.reachedDay) return { kind: "reached", day: measure.reachedDay };
  if (!Number.isFinite(measure.target) || !Number.isInteger(measure.minLevel) || measure.minLevel < 1) return { kind: "not-measured" };
  const bestCase = p == null;
  const at = (d: DayKey) => cardsExpectedBy(cards, measure.minLevel, d, p, paceSinceStart, today, m);
  const meets = (d: DayKey) => at(d).expected >= measure.target - 1e-9;
  const horizon = FAR_WEEKS * 7;
  if (!meets(addDays(today, horizon))) return { kind: "far" };
  let lo = 0;
  let hi = horizon;
  if (!meets(today)) {
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (meets(addDays(today, mid))) hi = mid;
      else lo = mid;
    }
  } else hi = 0;
  const day = addDays(today, hi);
  const byDue = at(measure.dueDay < today ? today : measure.dueDay);
  if (day <= measure.dueDay) return { kind: "on-pace", day, pipeline: byDue.pipeline, bestCase };
  return { kind: "behind", day, daysLate: daysBetween(measure.dueDay, day), expectedByDue: Math.floor(byDue.expected + 1e-9), target: measure.target, bestCase };
}

/**
 * The milestone's projection (F11): the latest day across its card measures,
 * since the slowest part decides. far beats behind beats on-pace (the later
 * day wins within a kind); a reached measure decides only when every one is
 * reached (the latest reach); not-measured when none is measured.
 */
export function slowestPaceOf(paces: readonly PaceResult[]): PaceResult {
  const rank = (p: PaceResult) => (p.kind === "far" ? 4 : p.kind === "behind" ? 3 : p.kind === "on-pace" ? 2 : p.kind === "reached" ? 1 : 0);
  let worst: PaceResult = { kind: "not-measured" };
  for (const p of paces) {
    const a = rank(p);
    const b = rank(worst);
    if (a > b || (a === b && "day" in p && "day" in worst && p.day > worst.day)) worst = p;
  }
  if (worst.kind === "reached" && paces.some((p) => p.kind === "not-measured")) return { kind: "not-measured" };
  return worst;
}

/**
 * kept + remaining planned units × the measured kept share against effTarget:
 * "on pace", or "about 3 sessions short". Not measured while there is no
 * kept share yet (no judged unit) and the target is not already met.
 */
export function projectPractice(kept: number, remainingPlanned: number, keptShare: number | null, effTarget: number): PracticePace {
  if (kept >= effTarget) return { kind: "on-pace" };
  if (keptShare == null || !Number.isFinite(keptShare)) return { kind: "not-measured" };
  const projected = kept + Math.max(0, remainingPlanned) * Math.max(0, Math.min(1, keptShare));
  if (projected >= effTarget - 1e-9) return { kind: "on-pace" };
  return { kind: "short", sessions: Math.ceil(effTarget - projected - 1e-9) };
}

/** One milestone's facts the triggers read. */
export interface TriggerMilestone {
  ord: number;
  /** Each card measure's projection (BEHIND: day > dueDay + BEHIND_DAYS). */
  cardPaces: readonly PaceResult[];
  /** Each PAYS measure's latest value against its baseline (SLIPPED) and whether it is met. */
  pays: readonly { value: number | null; baseline: number | null; met: boolean }[];
  /** Kept share over PRACTICE_LOW_WEEKS with the planned units it rests on (PRACTICE_LOW). */
  practice: { keptShare: number | null; planned: number } | null;
  /** Closed Carried, or rescheduled by more than CARRIED_RESCHEDULE_DAYS. */
  carried: boolean;
  /** The latest checkpoint log against its bar (CHECKPOINT_MISMATCH). */
  checkpoint: { score: number; bar: number } | null;
  /** R1 addition: the milestone's id (matches questWeek.milestoneId for QUESTS_BEHIND). */
  id?: string;
  /** R1 addition: its due day and card level, for QUESTS_BEHIND's "can still reach level 6 by 13 Dec". */
  dueDay?: DayKey | null;
  level?: number | null;
}

export interface TriggerInput {
  milestones: readonly TriggerMilestone[];
  /** The pace source at acceptance and now (PACE_MEASURED: YOURS or NONE then, measured now). */
  paceAtAcceptance: RateSource;
  paceNow: RateSource;
  /** This week's frozen set (QUESTS_BEHIND: cappedBy CATCHUP with fewer than 2 writing weeks left). */
  questWeek: WeekQuestSet | null;
}

const MEASURED_PACE: readonly RateSource[] = ["SCOPE", "FIELD"];

function behindLine(ord: number, pace: PaceResult): string | null {
  if (pace.kind === "far") return `Milestone ${ord}: at your pace its card target is more than ${FAR_WEEKS} weeks away`;
  if (pace.kind !== "behind" || pace.daysLate <= BEHIND_DAYS) return null;
  const due = addDays(pace.day, -pace.daysLate);
  const weeks = Math.max(1, Math.round(pace.daysLate / 7));
  return `About ${weeks} weeks behind: at your pace about ${pace.expectedByDue} of ${pace.target} by ${shortDay(due)}${pace.bestCase ? " (best case — your pass rate is still calibrating)" : ""}`;
}

/** The week's ADD spec when QUESTS_BEHIND fires on it: OPEN, capped by catch-up, under 2 writing weeks left. */
function behindAdd(set: WeekQuestSet | null): AddQuestSpec | null {
  if (!set || set.state !== "OPEN" || set.cappedBy !== "CATCHUP") return null;
  const add = set.quests.find((q): q is AddQuestSpec => q.kind === "ADD");
  if (!add || !(add.writingWeeksLeft < WEEK_QUEST_BEHIND_WRITING_WEEKS)) return null;
  return add;
}

/**
 * QUESTS_BEHIND's sentence: R6's questsBehindLine (the roadmap surfaces' one
 * wording, so the trigger and the week quests' note never differ) when the
 * owning milestone is known; this milestone's own words otherwise.
 */
function questsBehindLine(add: AddQuestSpec, set: WeekQuestSet, m: TriggerMilestone | undefined): string {
  const raise = set.quests.find((q): q is RaiseQuestSpec => q.kind === "RAISE");
  if (m) {
    const line = questsBehindSentence(set, { ord: m.ord, level: m.level ?? raise?.minLevel ?? null, dueDay: m.dueDay ?? null });
    if (line) return line;
  }
  const name = m ? `Milestone ${m.ord}` : "this milestone";
  const level = m?.level ?? raise?.minLevel ?? null;
  const reach = level != null ? `writing that can still reach level ${level}${m?.dueDay ? ` by ${shortDay(m.dueDay)}` : ""}` : "writing that can still count";
  const ends = add.lastCardDay ? `, and ${reach} ends ${weekdayDay(add.lastCardDay)}` : "";
  return `Behind on new cards for ${name}: this week asks ${add.count} of the ${add.pace} needed to stay on plan${ends}.`;
}

/**
 * Every trigger that fires, each on its own fixture only (F11, F14), in
 * milestone order and REPLAN_TRIGGERS order; PACE_MEASURED (the plan's) last.
 *   BEHIND        a card measure's pipeline day is more than BEHIND_DAYS after its due day (or far);
 *   SLIPPED       a PAYS measure's value is below its baseline;
 *   PRACTICE_LOW  kept share < PRACTICE_LOW over PRACTICE_LOW_WEEKS with ≥ PRACTICE_LOW_MIN_UNITS planned;
 *   CARRIED       closed Carried, or rescheduled by more than CARRIED_RESCHEDULE_DAYS;
 *   CHECKPOINT_MISMATCH  every PAYS measure met, the latest checkpoint log below its bar;
 *   QUESTS_BEHIND this week's set is OPEN, cappedBy CATCHUP, with fewer than
 *                 WEEK_QUEST_BEHIND_WRITING_WEEKS writing weeks left (never a CAPACITY cap, HELD or PAST_DUE week);
 *   PACE_MEASURED the pace source was YOURS or NONE at acceptance and is measured (SCOPE or FIELD) now.
 */
export function triggersOf(input: TriggerInput): TriggerHit[] {
  const hits: TriggerHit[] = [];
  const add = behindAdd(input.questWeek);
  const questOwner = add ? input.milestones.find((m) => m.id != null && m.id === input.questWeek!.milestoneId) : undefined;
  for (const m of input.milestones) {
    const found = new Map<ReplanTrigger, string>();
    for (const pace of m.cardPaces) {
      const line = behindLine(m.ord, pace);
      if (line && !found.has("BEHIND")) found.set("BEHIND", line);
    }
    if (m.pays.some((p) => p.value != null && p.baseline != null && p.value < p.baseline)) {
      found.set("SLIPPED", `Milestone ${m.ord} has slipped below where it started: a missed or overdue review lowers a level`);
    }
    const pr = m.practice;
    if (pr && pr.keptShare != null && pr.planned >= PRACTICE_LOW_MIN_UNITS && pr.keptShare < PRACTICE_LOW) {
      found.set("PRACTICE_LOW", `Milestone ${m.ord}: ${Math.round(pr.keptShare * 100)}% of planned sessions kept over the last ${PRACTICE_LOW_WEEKS} weeks · from your ticks`);
    }
    if (m.carried) found.set("CARRIED", `Milestone ${m.ord} was carried: the later milestones may need a re-fit to the time left`);
    if (m.checkpoint && m.pays.length > 0 && m.pays.every((p) => p.met) && m.checkpoint.score < m.checkpoint.bar) {
      found.set("CHECKPOINT_MISMATCH", "Your plan says ready; your checkpoint says not yet — the plan may be missing something.");
    }
    if (add && questOwner === m) found.set("QUESTS_BEHIND", questsBehindLine(add, input.questWeek!, m));
    for (const t of REPLAN_TRIGGERS) {
      const line = found.get(t);
      if (line) hits.push({ trigger: t, milestoneOrd: m.ord, line });
    }
  }
  if (add && !questOwner) hits.push({ trigger: "QUESTS_BEHIND", milestoneOrd: null, line: questsBehindLine(add, input.questWeek!, undefined) });
  const wasUnmeasured = input.paceAtAcceptance === "YOURS" || input.paceAtAcceptance === "NONE";
  if (wasUnmeasured && MEASURED_PACE.includes(input.paceNow)) {
    hits.push({ trigger: "PACE_MEASURED", milestoneOrd: null, line: "Your pace of new cards is now measured: a re-fit of the unstarted milestones can use it" });
  }
  return hits;
}
