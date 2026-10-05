/**
 * What a started milestone states (roadmap lane R4, F15; decision 8). Pure
 * and client-importable: the Start sheet, the Aim card and the roadmap page
 * read it, and startMilestoneCore freezes it into the goal's goalMp.
 *
 * A milestone states statedGoalMp('MID') (6) only when all three hold:
 *   - the practices it adds to Today plan at least PRACTICE_PAY_FLOOR_MIN
 *     minutes a week,
 *   - those minutes are at least PRACTICE_PAY_SHARE of its planned tracked
 *     minutes (practices + new cards + reviews), and
 *   - no goal of its lineage closed paying.
 * Otherwise it states 0, with the reason (StatedZeroReason) the copy puts in
 * words: "pays nothing · knowledge is paid by reviews", "· practice under an
 * hour a week", "· practice under a third of the plan", "· this milestone
 * already paid on 3 Mar".
 *
 * No new MP reason, cap or limit: GOAL_RULES pay a ROADMAP goal like any MID
 * goal (the 2-per-30-days limit, the 21-day lifetime, the 70% bar, one
 * 'mp:GOAL:<id>' row). Week quests, Proficiency and the Aim rank state nothing.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R4.
 *
 *   statedForMilestone
 *
 * Revision 4 (F-R4-13, pay honesty): when the 6 rests on a practice the app
 * added (STUDY_ADDED or PRODUCTION_ADDED) — without its minutes the milestone
 * would fall under the practice gate — `restsOnAdded` names it, so the Start
 * sheet says "Pays ⬡6 because of the practice the app added (Explain it in
 * your own words). Switch it off and this milestone pays 0."
 */
import type { DayKey } from "./life-day";
import { statedGoalMp } from "./life-economy";
import { PRACTICE_PAY_FLOOR_MIN, PRACTICE_PAY_SHARE, type StatedZeroReason } from "./roadmap-types";

export interface StatedInput {
  /** Planned minutes a week of the practices Start adds to Today (switched-off practices excluded). */
  practiceMinutesPerWeek: number;
  /** The milestone's planned tracked minutes a week: practices + new cards + reviews. */
  plannedTrackedMinutesPerWeek: number;
  /** Whether a card measure exists (knowledge alone pays 0: reviews already pay for it). */
  hasCards: boolean;
  /** The day a goal of the same lineage closed paying; null when none did. */
  lineagePaidOn: DayKey | null;
  /** Revision 4: the minutes a week of the practices the app added (part of practiceMinutesPerWeek), and the first one's name. */
  addedPracticeMinutesPerWeek?: number;
  addedPracticeName?: string | null;
}

export interface StatedForMilestone {
  /** statedGoalMp('MID') or 0. */
  stated: number;
  zeroReason: StatedZeroReason | null;
  /** "pays nothing · this milestone already paid on 3 Mar". */
  paidOn: DayKey | null;
  /** Revision 4: the added practice the 6 rests on (its name; "" when unnamed). Absent when the 6 doesn't rest on one (the goldens keep their shape). */
  restsOnAdded?: string | null;
}

/** Float noise only (a third of 180 is 60.000000000000004). */
const EPS = 1e-9;

const finiteOr0 = (n: number): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * 6 or 0 (F15 step 3). The first reason that applies, in order: a lineage
 * that already paid; no practice at all (KNOWLEDGE_ONLY with a card measure,
 * else PRACTICE_UNDER_HOUR); under PRACTICE_PAY_FLOOR_MIN minutes a week;
 * under PRACTICE_PAY_SHARE of the planned tracked minutes. A planned total
 * below the practice minutes reads as the practice minutes (practice is part
 * of it by definition).
 */
export function statedForMilestone(input: StatedInput): StatedForMilestone {
  const out = statedOf(input);
  const added = finiteOr0(input.addedPracticeMinutesPerWeek ?? 0);
  if (out.stated === 0 || added <= 0) return out;
  // Without the added practice's minutes, would the milestone fall under the practice gate?
  const without = statedOf({
    ...input,
    practiceMinutesPerWeek: Math.max(0, finiteOr0(input.practiceMinutesPerWeek) - added),
    plannedTrackedMinutesPerWeek: Math.max(0, finiteOr0(input.plannedTrackedMinutesPerWeek) - added),
  });
  return without.stated === 0 ? { ...out, restsOnAdded: input.addedPracticeName ?? "" } : out;
}

function statedOf(input: StatedInput): StatedForMilestone {
  if (input.lineagePaidOn) return { stated: 0, zeroReason: "LINEAGE_PAID", paidOn: input.lineagePaidOn };
  const practice = finiteOr0(input.practiceMinutesPerWeek);
  const planned = Math.max(practice, finiteOr0(input.plannedTrackedMinutesPerWeek));
  if (practice <= 0) return { stated: 0, zeroReason: input.hasCards ? "KNOWLEDGE_ONLY" : "PRACTICE_UNDER_HOUR", paidOn: null };
  if (practice + EPS < PRACTICE_PAY_FLOOR_MIN) return { stated: 0, zeroReason: "PRACTICE_UNDER_HOUR", paidOn: null };
  if (practice + EPS < PRACTICE_PAY_SHARE * planned) return { stated: 0, zeroReason: "PRACTICE_UNDER_SHARE", paidOn: null };
  return { stated: statedGoalMp("MID"), zeroReason: null, paidOn: null };
}
