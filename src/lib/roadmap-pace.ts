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
 * Revision 4 (F-R4-8, F-R4-11; compatible):
 *   PaceCard · CardPaceMeasure.segment · PaceReachOpts (projectCards' and cardsExpectedBy's
 *   optional last argument: the reach model, roadmap-types reachTable, instead of p^k)
 *   TriggerInput.assumed / calibrated / depthPlan · calibratedLineOf · ASSUMED_WORDS
 *   - With the reach model, expected reach follows srs.ts (a miss costs a day, two cost a
 *     level, a card past its grace drops one; the measured clearance and clustered absences;
 *     the long-gap pass rate at level ≥ 9). While p, c or ρ is calibrating the published
 *     priors stand in (never p = 1), and BEHIND names what it assumed.
 *   - A key with a segment counts recall cards only; on `rc` a retry entry at L needs one
 *     more pass (cleanAt).
 *   - CALIBRATED: an input the date assumed is measured now: "Your pass rate is now
 *     measured (76%). Re-date the stages you haven't started?"
 */
import { addDays, daysBetween, weekdayOf, type DayKey } from "./life-day";
import { questsBehindLine as questsBehindSentence } from "./roadmap-quests";
import {
  BEHIND_DAYS,
  C_PRIOR,
  FAR_WEEKS,
  PASS_SHARE_MIN_REVIEWS,
  P_PRIOR,
  PRACTICE_LOW,
  PRACTICE_LOW_MIN_UNITS,
  PRACTICE_LOW_WEEKS,
  REPLAN_TRIGGERS,
  WEEK_QUEST_BEHIND_WRITING_WEEKS,
  bestReach,
  existingExpected,
  existingExpectedSlack,
  floorBase,
  newExpectedSlack,
  type AddQuestSpec,
  type CalibratingInput,
  type CardSegment,
  type EffectiveCard,
  type PaceResult,
  type PracticePace,
  type RaiseQuestSpec,
  type RateSource,
  type ReachCard,
  type ReachParams,
  type ReplanTrigger,
  type TriggerHit,
  type WeekQuestSet,
  type WriteDay,
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
  /** Revision 4: the measure key's segment (parseMeasureKey): `r` counts recall cards, `rc` also clean entry at minLevel. */
  segment?: CardSegment | null;
}

/** An existing card as the projection reads it: its effective state, and (rev 4) whether it is a recall card and entered its level on a retry. */
export interface PaceCard extends EffectiveCard {
  /** false for a NON_RECALL_TYPES card (multiple choice): a key with a segment does not count it. Absent reads as recall. */
  recall?: boolean;
  /** It entered its current level on a next-day retry (the readings' clean-entry read); `rc` needs one more pass from it. */
  retryEntry?: boolean;
}

/**
 * Revision 4: projectCards' and cardsExpectedBy's optional last argument.
 * `reach` (roadmap-types reachInputsOf(...).params) switches the projection to
 * the reach model; `calibrating` is what those params assumed (the priors).
 */
export interface PaceReachOpts {
  reach?: ReachParams | null;
  calibrating?: readonly CalibratingInput[];
}

/** The cards a measure counts: every card without a segment; recall cards only with one. */
function countedCards(cards: readonly PaceCard[], segment: CardSegment | null | undefined): readonly PaceCard[] {
  return segment ? cards.filter((c) => c.recall !== false) : cards;
}

/**
 * The exact pipeline's expected count on day d (F4 step 2, F11): the cards
 * already at ≥ L, plus each card below L whose bestReach(L) ≤ d discounted by
 * p^k, plus the new cards written at `rate` a week from today up to
 * lastCardDay = d − floorBase(L), discounted by p^(L−1). p = null (calibrating)
 * reads the best case (p = 1). `pipeline` is the count of cards below L that
 * can reach L by d if passed on their day (the best case, undiscounted).
 *
 * Revision 4 (F-R4-8): with `opts.reach` the expected count follows srs.ts
 * through the reach table: existingExpectedSlack over the cards plus
 * newExpectedSlack over the writing days (rate ÷ 7 a day from today to
 * lastCardDay), unrounded; `opts.cleanAt` = L applies clean entry (an `rc`
 * key). p is then unused (the params carry p, pLong, c and ρ).
 */
export function cardsExpectedBy(
  cards: readonly PaceCard[],
  level: number,
  d: DayKey,
  p: number | null,
  rate: number | null,
  today: DayKey,
  m = 1,
  opts: { reach?: ReachParams | null; cleanAt?: number | null } = {}
): { expected: number; best: number; pipeline: number; newBest: number } {
  const reach = opts.reach ?? null;
  const mm = reach ? reach.m : m;
  let atLevel = 0;
  let pipeline = 0;
  for (const c of cards) {
    if (c.level >= level) atLevel += 1;
    else if (bestReach(c, level, mm) <= d) pipeline += 1;
  }
  const lastCardDay = addDays(d, -floorBase(level, mm));
  const r = rate != null && Number.isFinite(rate) && rate > 0 ? rate : 0;
  const writingDays = lastCardDay >= today && r > 0 ? daysBetween(today, lastCardDay) + 1 : 0;
  const newBest = writingDays > 0 ? Math.floor((r / 7) * writingDays) : 0;
  if (reach) {
    const cleanAt = opts.cleanAt === level ? level : null;
    const existing = existingExpectedSlack(cards as readonly ReachCard[], level, d, reach, { cleanAt });
    const days: WriteDay[] = [];
    for (let i = 0; i < writingDays; i++) days.push({ day: addDays(today, i), count: r / 7 });
    const fresh = newExpectedSlack(days, level, d, reach, { cleanAt });
    return { expected: existing + fresh, best: atLevel + pipeline + newBest, pipeline, newBest };
  }
  const pp = p == null ? 1 : Math.max(0, Math.min(1, p));
  const existing = existingExpected(cards, level, d, pp, m);
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
 *
 * Revision 4: `opts.reach` projects with the reach model (F-R4-8; R4 passes
 * reachInputsOf(throughput, m).params, the priors while calibrating, so it is
 * never the best case: bestCase false). A measure with a segment counts
 * recall cards only, and `rc` applies clean entry at its level.
 */
export function projectCards(
  measure: CardPaceMeasure,
  cards: readonly PaceCard[],
  p: number | null,
  paceSinceStart: number | null,
  today: DayKey,
  m = 1,
  opts: PaceReachOpts = {}
): PaceResult {
  if (measure.reachedDay) return { kind: "reached", day: measure.reachedDay };
  if (!Number.isFinite(measure.target) || !Number.isInteger(measure.minLevel) || measure.minLevel < 1) return { kind: "not-measured" };
  const reach = opts.reach ?? null;
  const bestCase = !reach && p == null;
  const counted = countedCards(cards, measure.segment);
  const cleanAt = measure.segment === "rc" ? measure.minLevel : null;
  const at = (d: DayKey) => cardsExpectedBy(counted, measure.minLevel, d, p, paceSinceStart, today, m, { reach, cleanAt });
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
  /** Revision 4: the inputs today's projections assumed (the priors); BEHIND names them. */
  assumed?: readonly CalibratingInput[];
  /**
   * Revision 4 (CALIBRATED, F-R4-11): the inputs the plan's date assumed when
   * it was set (DateOrigin.calibrating, kept in the acceptance's feasibility),
   * the ones still calibrating now, and today's measured pass rate and
   * clearance for the line. 'pace' is PACE_MEASURED's, not this trigger's.
   */
  calibrated?: { atAcceptance: readonly CalibratingInput[]; calibratingNow: readonly CalibratingInput[]; p?: number | null; c?: number | null } | null;
  /** Revision 4: a depth plan, whose re-plans re-date and never re-fit (the trigger lines say so). */
  depthPlan?: boolean;
}

const MEASURED_PACE: readonly RateSource[] = ["SCOPE", "FIELD"];

const pct = (x: number): string => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;

/** What each assumed input means, as the Date copy words it (F-R4-11: "assumes an 80% pass rate until 30 reviews are measured"). */
export const ASSUMED_WORDS: Readonly<Record<CalibratingInput, string>> = {
  p: `an ${pct(P_PRIOR)} pass rate until ${PASS_SHARE_MIN_REVIEWS} reviews are measured`,
  c: `that you clear ${pct(C_PRIOR)} of your due queue until it is measured`,
  rho: "that missed days bunch as they usually do until it is measured",
  pace: "your typed pace, which isn't measured yet",
};

function assumedSuffix(assumed: readonly CalibratingInput[] | undefined): string {
  const words = (assumed ?? []).filter((x, i, a) => a.indexOf(x) === i).map((x) => ASSUMED_WORDS[x]).filter(Boolean);
  return words.length ? ` (assumes ${words.join("; ")})` : "";
}

function behindLine(ord: number, pace: PaceResult, assumed?: readonly CalibratingInput[]): string | null {
  if (pace.kind === "far") return `Milestone ${ord}: at your pace its card target is more than ${FAR_WEEKS} weeks away${assumedSuffix(assumed)}`;
  if (pace.kind !== "behind" || pace.daysLate <= BEHIND_DAYS) return null;
  const due = addDays(pace.day, -pace.daysLate);
  const weeks = Math.max(1, Math.round(pace.daysLate / 7));
  return `About ${weeks} weeks behind: at your pace about ${pace.expectedByDue} of ${pace.target} by ${shortDay(due)}${pace.bestCase ? " (best case — your pass rate is still calibrating)" : assumedSuffix(assumed)}`;
}

/**
 * CALIBRATED's sentence (F-R4-11): the inputs now measured, with their
 * figures, and the offer. One input: "Your pass rate is now measured (76%).
 * Re-date the stages you haven't started?"; several: "Your pass rate (76%)
 * and the share of your due queue you clear (92%) are now measured. …".
 * Null when none of p, c or ρ is newly measured.
 */
export function calibratedLineOf(measuredNow: readonly CalibratingInput[], p?: number | null, c?: number | null): string | null {
  const parts: { name: string; fig: string }[] = [];
  const seen = new Set(measuredNow);
  if (seen.has("p")) parts.push({ name: "your pass rate", fig: p != null && Number.isFinite(p) ? ` (${pct(p)})` : "" });
  if (seen.has("c")) parts.push({ name: "the share of your due queue you clear", fig: c != null && Number.isFinite(c) ? ` (${pct(c)})` : "" });
  if (seen.has("rho")) parts.push({ name: "how your missed days bunch together", fig: "" });
  if (parts.length === 0) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const ask = "Re-date the stages you haven't started?";
  if (parts.length === 1) return `${cap(parts[0].name)} is now measured${parts[0].fig}. ${ask}`;
  const named = parts.map((x) => `${x.name}${x.fig}`);
  return `${cap(`${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`)} are now measured. ${ask}`;
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
 *   PACE_MEASURED the pace source was YOURS or NONE at acceptance and is measured (SCOPE or FIELD) now;
 *   CALIBRATED    (rev 4) an input the plan's date assumed (p, c or ρ) is measured now: re-date
 *                 the unstarted stages, which never lowers n_d or ℓ (R4 runs it on a tap).
 * On a depth plan (depthPlan) the lines that offered a re-fit offer re-dating.
 */
export function triggersOf(input: TriggerInput): TriggerHit[] {
  const hits: TriggerHit[] = [];
  const add = behindAdd(input.questWeek);
  const questOwner = add ? input.milestones.find((m) => m.id != null && m.id === input.questWeek!.milestoneId) : undefined;
  for (const m of input.milestones) {
    const found = new Map<ReplanTrigger, string>();
    for (const pace of m.cardPaces) {
      const line = behindLine(m.ord, pace, input.assumed);
      if (line && !found.has("BEHIND")) found.set("BEHIND", line);
    }
    if (m.pays.some((p) => p.value != null && p.baseline != null && p.value < p.baseline)) {
      found.set("SLIPPED", `Milestone ${m.ord} has slipped below where it started: a missed or overdue review lowers a level`);
    }
    const pr = m.practice;
    if (pr && pr.keptShare != null && pr.planned >= PRACTICE_LOW_MIN_UNITS && pr.keptShare < PRACTICE_LOW) {
      found.set("PRACTICE_LOW", `Milestone ${m.ord}: ${Math.round(pr.keptShare * 100)}% of planned sessions kept over the last ${PRACTICE_LOW_WEEKS} weeks · from your ticks`);
    }
    if (m.carried) found.set("CARRIED", input.depthPlan ? `Milestone ${m.ord} was carried: the later stages may need re-dating to the time left` : `Milestone ${m.ord} was carried: the later milestones may need a re-fit to the time left`);
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
    hits.push({
      trigger: "PACE_MEASURED",
      milestoneOrd: null,
      line: input.depthPlan ? "Your pace of new cards is now measured: re-dating the stages you haven't started can use it" : "Your pace of new cards is now measured: a re-fit of the unstarted milestones can use it",
    });
  }
  const cal = input.calibrated;
  if (cal) {
    const now = new Set(cal.calibratingNow);
    const measuredNow = cal.atAcceptance.filter((x, i, a) => x !== "pace" && a.indexOf(x) === i && !now.has(x));
    const line = calibratedLineOf(measuredNow, cal.p, cal.c);
    if (line) hits.push({ trigger: "CALIBRATED", milestoneOrd: null, line });
  }
  return hits;
}
