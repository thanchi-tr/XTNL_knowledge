"use client";

/**
 * "How these week quests were set" (F13, F18 §3): the frozen set's own basis
 * lines (gap, floor, weeks left, reach expected and best, pace, the caps and
 * which one bound, the Field quota overlap, capacity with its class), stored
 * with the set, so this shows what was asked and why, not today's
 * recomputation. Every count is worked out by code; no model is called.
 */
import { Sheet } from "@/components/ui/Sheet";
import type { WeekQuestsView } from "@/lib/roadmap-types";
import { windowLabel } from "./roadmap-copy";

/** The fixed line the sheet always carries (a card due anyway counts). */
export const DUE_ANYWAY_LINE = "A card that was due anyway counts: passing its review is the step. The schedule never lets a card level early.";

/** Every line the sheet lists: the set's own basis, the fixed due-anyway line, and which cap bound. */
export function questBasisLines(view: Pick<WeekQuestsView, "basis" | "cappedBy">): string[] {
  const out = [...view.basis, DUE_ANYWAY_LINE];
  if (view.cappedBy === "CATCHUP") out.push("This week's new cards were capped by the catch-up limit, so missed weeks don't pile up.");
  if (view.cappedBy === "CAPACITY") out.push("Practices and reviews fill this week's time, so fewer new cards are asked.");
  return out;
}

export function QuestBasisSheet({ open, onClose, view, today }: { open: boolean; onClose: () => void; view: WeekQuestsView; today: string }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How these week quests were set"
      description={`Milestone ${view.milestoneOrd} · ${windowLabel(view.weekStart, view.weekEnd, today)} · ${view.frozen ? "fixed for the week" : "not fixed yet"}`}
    >
      <ul className="rm-basis">
        {questBasisLines(view).map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </Sheet>
  );
}
