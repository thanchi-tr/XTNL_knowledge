import type { Attribute } from "@prisma/client";
import type { UnlockBlocker } from "./skill-gates";

/**
 * "Time to achieve" for a locked skill, projected from observed rates
 * (`progress-rate.ts`).
 *
 * Pure and client-safe, so the tree's hover card can compute it per node
 * without a round trip.
 *
 * The honesty rules this follows, which matter more than the arithmetic:
 *
 *  - A rate of zero produces "no current progress", never `Infinity` or a
 *    hidden fallback constant. If you are not training Physical at all,
 *    the answer to "when do I get this" is genuinely "never, on your
 *    current trajectory" — and saying so is the entire point, because it
 *    is what tells you the path needs a Field you do not have.
 *  - Missing history produces "not enough history", not a guess.
 *  - The slowest requirement decides the estimate. Everything must be
 *    satisfied, so the bottleneck is the answer.
 *  - Prerequisites are reported as structural, not temporal: their own
 *    cost is not summed in, because you would see their estimate on their
 *    own node.
 */

export interface EtaInput {
  /** Everything still unmet. An empty list is the "available now" case. */
  blockers: UnlockBlocker[];
  masteryPerDay: number | null;
  scorePerDay: Record<string, number> | null;
}

export type EtaStatus =
  | "available"
  | "needs_prerequisite"
  | "projected"
  | "no_progress"
  | "unknown";

export interface EtaEstimate {
  status: EtaStatus;
  /** Projected days until every numeric gate clears. Null unless `status === "projected"`. */
  days: number | null;
  /** Short display string — "~3 weeks", "Available now". */
  label: string;
  /** Which requirement is the bottleneck, for the hover card's second line. */
  bottleneck: string | null;
}

function humaniseDays(days: number): string {
  if (days < 1) return "today";
  if (days < 2) return "~1 day";
  if (days < 14) return `~${Math.round(days)} days`;
  if (days < 60) return `~${Math.round(days / 7)} weeks`;
  if (days < 730) return `~${Math.round(days / 30)} months`;
  const years = days / 365;
  return years > 20 ? "beyond 20 years" : `~${years.toFixed(0)} years`;
}

export function estimateEta({ blockers, masteryPerDay, scorePerDay }: EtaInput): EtaEstimate {
  if (blockers.length === 0) {
    return { status: "available", days: 0, label: "Available now", bottleneck: null };
  }
  if (blockers.some((b) => b.reason === "ALREADY_OWNED")) {
    return { status: "available", days: 0, label: "Owned", bottleneck: null };
  }

  const missingPrereqs = blockers.filter((b) => b.reason === "PREREQUISITE");
  if (missingPrereqs.length > 0) {
    return {
      status: "needs_prerequisite",
      days: null,
      label: missingPrereqs.length === 1 ? "Locked behind 1 skill" : `Locked behind ${missingPrereqs.length} skills`,
      bottleneck: "Unlock its prerequisites first",
    };
  }

  const candidates: { days: number; label: string }[] = [];
  let sawUnmeasurable = false;
  let stalled: string | null = null;

  for (const blocker of blockers) {
    if (blocker.reason === "MASTERY") {
      const gap = blocker.need - blocker.have;
      if (masteryPerDay === null) {
        sawUnmeasurable = true;
      } else if (masteryPerDay <= 0) {
        stalled = stalled ?? "Mastery income has stopped";
      } else {
        candidates.push({ days: gap / masteryPerDay, label: `${gap.toFixed(1)} mastery to earn` });
      }
    }

    if (blocker.reason === "ATTRIBUTE" || blocker.reason === "BREADTH") {
      const gap = blocker.need - blocker.have;
      const rate = scorePerDay?.[blocker.attribute];
      if (rate === undefined) {
        sawUnmeasurable = true;
      } else if (rate <= 0) {
        stalled = stalled ?? attributeStallMessage(blocker.attribute, blocker.reason === "BREADTH");
      } else {
        candidates.push({ days: gap / rate, label: `${gap.toFixed(1)} more ${labelOf(blocker.attribute)}` });
      }
    }
  }

  // A stalled requirement dominates a measurable one: if one gate is not
  // moving at all, the projected date for the others is irrelevant.
  if (stalled) {
    return { status: "no_progress", days: null, label: "Not on track", bottleneck: stalled };
  }
  if (candidates.length === 0) {
    return {
      status: sawUnmeasurable ? "unknown" : "available",
      days: null,
      label: sawUnmeasurable ? "Not enough history" : "Available now",
      bottleneck: sawUnmeasurable ? "Review for a few more days to project this" : null,
    };
  }

  const slowest = candidates.reduce((a, b) => (b.days > a.days ? b : a));
  return {
    status: "projected",
    days: slowest.days,
    label: humaniseDays(slowest.days),
    bottleneck: slowest.label,
  };
}

function labelOf(attribute: Attribute): string {
  return attribute
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function attributeStallMessage(attribute: Attribute, breadth: boolean): string {
  const name = labelOf(attribute);
  return breadth
    ? `${name} isn't growing — this needs a field outside your usual`
    : `${name} isn't growing right now`;
}
