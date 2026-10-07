"use client";

/**
 * The goals row on /you/roadmap (contracts §23.5; roadmap ruling N15): one pill per open goal in seat order (its seat,
 * its label; the goal shown is current), and [+ New goal] while a seat is free under GOALS_MAX (GoalSwitcherView.canAdd).
 * A pill links to `?goal=<id>` (roadmap-goals goalHrefOf); the new goal's form is /you/roadmap/new?new=1, which saves
 * under its own createKey so it never edits another goal's draft. Shown only when there is a choice to make: two open
 * goals or more, or a free seat beside one.
 */
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { goalHrefOf } from "@/lib/roadmap-goals";
import type { GoalSwitcherView } from "@/lib/roadmap-types";
import { ROADMAP_HREF, ROADMAP_NEW_HREF } from "./roadmap-links";

/** The new goal's form: never an existing draft (RoadmapForm saves with a createKey). */
export const NEW_GOAL_HREF = `${ROADMAP_NEW_HREF}?new=1`;

export function GoalSwitcher({ goals }: { goals: GoalSwitcherView | null | undefined }) {
  if (!goals || (goals.pills.length < 2 && !(goals.pills.length >= 1 && goals.canAdd))) return null;
  return (
    <nav className="rm-goals" aria-label="Your goals">
      {goals.pills.map((p) => (
        <Link key={p.roadmapId} className="rm-goal-pill" href={goalHrefOf(ROADMAP_HREF, p.roadmapId)} aria-current={p.current ? "page" : undefined}>
          <span className="rm-goal-slot" aria-hidden="true">
            {p.slot}
          </span>
          <span className="rm-goal-label" data-wc={p.labelIsYours ? "own" : "name"}>
            {p.label}
          </span>
          {p.status === "DRAFT" && <span className="rm-goal-st">draft</span>}
        </Link>
      ))}
      {goals.canAdd && (
        <Link className="rm-goal-pill rm-goal-add" href={NEW_GOAL_HREF}>
          <Icon name="plus" />
          <span>New goal</span>
        </Link>
      )}
    </nav>
  );
}
