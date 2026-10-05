"use client";

/**
 * Today's one quiet aim line (lane R5; roadmap-rev4.md F-R4-3;
 * final-today-quests.html): `.card.rm-aim-line`, a 20 px 'route' glyph, the
 * line as one link (14/19, ink-1, at most 3 lines, a target of 48 px or
 * more) and a 40 px quiet × that means "Not now" and says so:
 *
 *   SET    "A new week. Set an aim: what do you want to be able to do in a
 *          year or three?" (MONTH, BACK, NEXT) → /you/roadmap/new; × "Not
 *          now: no aim suggestions for 4 weeks", and it does what it says
 *          (fix round 2; decision 34: "Not now" quiets every set-an-aim
 *          suggestion, shared by /you and Today): hideAimPrompt, the 4-week
 *          'hide:' cookie the /you LATER × writes, so /you shows HIDDEN (no
 *          "Set an aim →" line) and this line stays away. 'later:'
 *          (snoozeAimPrompt) would leave /you's LATER line, an aim
 *          suggestion, under the same label.
 *   DRAFT  "A roadmap draft is waiting for your check." → /you/roadmap
 *   START  "Milestone 2 · Familiar is ready to start. Reaching it gives the
 *          Aim rank Journeyman." (or "It keeps your rank.") → /you/roadmap#now;
 *          the stage comes from STAGE_NAMES, so no title reaches Today
 *          DRAFT and START: × "Not now: hide this for a week" (snoozeAimStep)
 *
 * ≤ 72 px at 344. Never red (no --owed, warn, danger or gold), never counted
 * (nothing in todayCountsOf, the nav count, the bell or the Asks), no chime,
 * no shortcut, no data-template-id, no link to /review, and no behind, late,
 * overdue, missed, stalled or due-day copy. "Not now" goes through the
 * roadmap runtime, so the /dev/style/today fixtures (inside the fixtures
 * provider) never set the real cookies. Lane T mounts it in the quests slot
 * inside its `.rm-aim-slot` wrapper; roadmap.css hides the slot while it is
 * compact and Close the day is due.
 */
import Link from "next/link";
import { useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { ActionError } from "@/components/home/ActionError";
import type { AimLineView } from "@/lib/roadmap-types";
import { AIM_NOT_NOW_SET_LABEL, AIM_NOT_NOW_STEP_LABEL, aimLineCopy } from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { RoadmapGlyph } from "./RoadmapGlyph";
import "./roadmap.css";

export interface AimLineProps {
  view: AimLineView;
}

/** The × of a line, in words: every × on an aim surface means "Not now". */
export function aimLineNotNowLabel(view: AimLineView): string {
  return view.kind === "SET" ? AIM_NOT_NOW_SET_LABEL : AIM_NOT_NOW_STEP_LABEL;
}

export function AimLine({ view }: AimLineProps) {
  const [hidden, setHidden] = useState(false);
  const { run, error } = useRoadmapAction();
  // Collapsed at once on "Not now"; a refusal (a fixture, a lost connection) brings it back with its reason.
  if (hidden && !error) return null;
  const { lead, rest } = aimLineCopy(view);
  const notNow = () => {
    setHidden(true);
    run((a) => (view.kind === "SET" ? a.hideAimPrompt() : view.kind === "DRAFT" ? a.snoozeAimStep("DRAFT", view.roadmapId) : a.snoozeAimStep("START", view.milestoneId)), undefined, { refresh: false });
  };
  return (
    <section className="card rm-aim-line" aria-label="Aim">
      <Link className="rm-aim-line-a" href={view.href}>
        <RoadmapGlyph name="route" size={20} />
        <span className="rm-aim-line-t">
          <b>{lead}</b>
          {rest ? ` ${rest}` : ""}
        </span>
      </Link>
      <IconButton icon="x" label={aimLineNotNowLabel(view)} className="rm-aim-line-x" onClick={notNow} />
      {error && <ActionError>{error}</ActionError>}
    </section>
  );
}
