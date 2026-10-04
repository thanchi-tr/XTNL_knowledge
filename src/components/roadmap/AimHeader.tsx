"use client";

/**
 * The Aim header on /you/roadmap (F18 §1): the aim in the user's words; the
 * Area chip with its real level (or "Body · practice only"); "by 31 Mar · 26
 * wk left"; "Plan v2 · accepted 4 Oct"; the Aim rank and Proficiency with its
 * parts line and the "Aim ranks on this plan" disclosure; the aim check as a
 * line (never a verdict chip beside the aim); "Over" when kept over; the
 * credential line; "Target lowered" while it applies. An open roadmap's
 * unchecked aim offers "Add a figure" (the user's own figure, through R4's
 * setAimFigure). A DONE or ARCHIVED roadmap shows the same header read-only,
 * with its reason. `scheduled` is the plan's positions (positionsOf).
 */
import { Chip } from "@/components/ui/Chip";
import type { AimRankView, ProficiencyView, RoadmapHeader } from "@/lib/roadmap-types";
import { CREDENTIAL_LINE, aimCheckLine, byLine, dayLabel, dayWithWeekday } from "./roadmap-copy";
import { AreaChipView } from "./AimCard";
import { AddFigureLink } from "./AimFigure";
import { ProficiencyBlock } from "./ProficiencyBlock";

export function AimHeader({
  header,
  rank,
  proficiency,
  today,
  scheduled,
  writesOff,
  className,
}: {
  header: RoadmapHeader;
  rank: AimRankView | null;
  proficiency: ProficiencyView | null;
  today: string;
  scheduled: number;
  writesOff: boolean;
  className?: string;
}) {
  const closed = header.status === "DONE" || header.status === "ARCHIVED";
  return (
    <section className={`card rm-aim ${className ?? ""}`} aria-label="Aim">
      <div className="t-eyebrow">{header.status === "ARCHIVED" ? "Aim · archived" : header.status === "DONE" ? "Aim · done" : "Aim"}</div>
      <p className="rm-aim-t">{header.aim}</p>
      <div className="rm-chips">
        <AreaChipView area={header.area} />
        <Chip>{byLine(header.targetDay, today, !closed)}</Chip>
        {header.over && <Chip className="rm-qchip">Over</Chip>}
        {header.targetLowered && <Chip className="rm-qchip">Target lowered</Chip>}
      </div>
      <div className="rm-lines">
        {header.targetLowered && (
          <span>
            <b>
              Target lowered {header.targetLowered.from} → {header.targetLowered.to} on {dayLabel(header.targetLowered.on, today)} (re-plan)
            </b>
          </span>
        )}
        {header.version > 0 && <span>Plan v{header.version}{header.acceptedDay ? ` · accepted ${dayLabel(header.acceptedDay, today)}` : ""}</span>}
        {header.status === "DONE" && <span>{header.reachedDay ? `Aim reached ${dayWithWeekday(header.reachedDay, today)}` : header.doneDay ? `Marked done ${dayLabel(header.doneDay, today)}${header.doneReason ? ` · “${header.doneReason}”` : ""}` : "Done"}</span>}
        {header.status === "ARCHIVED" && <span>Archived{header.archivedDay ? ` ${dayLabel(header.archivedDay, today)}` : ""}{header.archiveReason ? ` · ${header.archiveReason}` : ""}. Its history, readings and Aim rank are kept.</span>}
      </div>
      {rank && <ProficiencyBlock rank={rank} proficiency={proficiency} variant="page" today={today} scheduled={scheduled} writesOff={writesOff} seenKey={header.id} />}
      {!closed && (
        <div className="rm-lines">
          <span>
            {aimCheckLine(header.aimCheck)}
            {/* An accepted plan's aim can still be checked: the figure is the user's (R4's setAimFigure). */}
            {header.aimCheck.kind === "unchecked" && (
              <>
                {" · "}
                <AddFigureLink roadmapId={header.id} />
              </>
            )}
          </span>
          {header.credential && !header.hasSyllabus && <span>{CREDENTIAL_LINE}</span>}
        </div>
      )}
    </section>
  );
}
