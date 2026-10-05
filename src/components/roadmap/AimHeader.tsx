"use client";

/**
 * The Aim header on /you/roadmap (F18 §1; roadmap-rev4.md F-R4-11, F-R4-15):
 * the aim in the user's words; the Area chip with its real level (or "Body ·
 * practice only"); the date chip — on a plan aimed at a depth "Mastered
 * (level 12) by Sun 12 Mar 2028" (or "by about … · estimate" while the
 * inputs calibrate), else rev 3's "by 31 Mar · 26 wk left"; the exam chip;
 * "Plan v2 · accepted 4 Oct" and, when the app set the date, "the date the
 * app set on 5 Oct" (never "as you chose"); the Depth line with every choice
 * and provenance line for the life of the plan, and the exam waypoint; the
 * Aim rank and Proficiency (labelled with its basis) with its parts line and
 * the "Aim ranks on this plan" disclosure; the aim check as a line (never a
 * verdict chip beside the aim); "Over" when kept over; "Target lowered"
 * while it applies. An open roadmap's unchecked aim offers "Add a figure".
 * A DONE or ARCHIVED roadmap shows the same header read-only, with its
 * reason. `scheduled` is the plan's positions (positionsOf).
 */
import { Chip } from "@/components/ui/Chip";
import type { AimRankView, DateCheck, DepthView, MilestoneRowView, ParagonMissing, ProficiencyView, RoadmapHeader } from "@/lib/roadmap-types";
import {
  COVERAGE_UNCHECKED_LINE,
  CREDENTIAL_LINE,
  aimCheckLine,
  byLine,
  coverageChoiceLine,
  coverageJudgeLine,
  dateAppSetLine,
  dayFull,
  dayLabel,
  dayWithWeekday,
  depthChoiceLine,
  depthLine,
  depthName,
  monthYear,
  domainOriginLine,
  examWaypointLine,
} from "./roadmap-copy";
import { AreaChipView } from "./AimCard";
import { AddFigureLink } from "./AimFigure";
import { ProficiencyBlock } from "./ProficiencyBlock";
import { RoadmapGlyph } from "./RoadmapGlyph";

/** The Depth line and its choices (F-R4-15), each for the life of the plan. Names come from the coverage rows (the user's Domains). */
export function DepthLines({ depth, m, aim, today, names }: { depth: DepthView; m: number; aim: string; today: string; names?: ReadonlyMap<string, string> }) {
  const nameOf = (id: string) => depth.coverage.find((c) => c.domainId === id)?.name ?? names?.get(id) ?? null;
  const origins = Object.entries(depth.domainOrigins)
    .map(([id, o]) => {
      const n = nameOf(id);
      return n ? domainOriginLine(n, o, today) : null;
    })
    .filter((l): l is string => Boolean(l));
  return (
    <div className="rm-depth">
      <span>{depthLine(depth.depth, depth.coverage, m)}</span>
      {origins.map((l) => (
        <span key={l} className="rm-depth-pl">
          <RoadmapGlyph name="info" />
          {l}
        </span>
      ))}
      {depth.coverageChoices.map((c) => {
        const n = nameOf(c.domainId);
        return n ? (
          <span key={c.domainId} className="rm-depth-pl">
            <RoadmapGlyph name="info" />
            {coverageChoiceLine(n, c, today)}
          </span>
        ) : null;
      })}
      {!depth.outlineChecked && <span className="rm-depth-pl">{COVERAGE_UNCHECKED_LINE}</span>}
      {depth.depthChoice && <span className="rm-depth-pl">{depthChoiceLine(depth.depthChoice, today)}</span>}
      {depth.exam && (
        <span className="rm-depth-pl">
          <RoadmapGlyph name="target" />
          {examWaypointLine(depth.exam.day, depth.exam.reachLevel)}
        </span>
      )}
      <span className="rm-depth-q">{coverageJudgeLine(aim)}</span>
    </div>
  );
}

export function AimHeader({
  header,
  rank,
  proficiency,
  today,
  scheduled,
  writesOff,
  className,
  depth,
  dateCheck,
  milestones,
  paragonMissing,
  m = 1,
  names,
}: {
  header: RoadmapHeader;
  rank: AimRankView | null;
  proficiency: ProficiencyView | null;
  today: string;
  scheduled: number;
  writesOff: boolean;
  className?: string;
  /** Revision 4: the Depth line (RoadmapView.depth), the accepted date check, the plan's rows and what keeps Paragon closed. */
  depth?: DepthView | null;
  dateCheck?: DateCheck | null;
  milestones?: readonly MilestoneRowView[];
  paragonMissing?: readonly ParagonMissing[];
  m?: number;
  /** The user's Domain names by id (the library), for a provenance line whose Domain left the coverage rows. */
  names?: ReadonlyMap<string, string>;
}) {
  const closed = header.status === "DONE" || header.status === "ARCHIVED";
  const estimate = Boolean(header.dateOrigin && header.dateOrigin.calibrating.length > 0);
  const dateChip =
    header.depth != null ? (estimate ? `${depthName(header.depth)} by about ${monthYear(header.targetDay)} · estimate` : `${depthName(header.depth)} by ${dayFull(header.targetDay)}`) : byLine(header.targetDay, today, !closed);
  const appSet = header.dateOrigin?.origin === "REALISTIC" && header.acceptedDay;
  return (
    <section className={`card rm-aim ${className ?? ""}`} aria-label="Aim">
      <div className="t-eyebrow">{header.status === "ARCHIVED" ? "Aim · archived" : header.status === "DONE" ? "Aim · done" : "Aim"}</div>
      <p className="rm-aim-t">{header.aim}</p>
      <div className="rm-chips">
        <AreaChipView area={header.area} />
        <Chip>{dateChip}</Chip>
        {header.examLabel && header.examDay && (
          <Chip>
            {header.examLabel} · {dayWithWeekday(header.examDay, today)}
          </Chip>
        )}
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
        {header.version > 0 && (
          <span>
            Plan v{header.version}
            {header.acceptedDay ? ` · accepted ${dayLabel(header.acceptedDay, today)}` : ""}
            {appSet ? ` · ${dateAppSetLine(header.acceptedDay as string, today)}` : ""}
          </span>
        )}
        {header.status === "DONE" && <span>{header.reachedDay ? `Aim reached ${dayWithWeekday(header.reachedDay, today)}` : header.doneDay ? `Marked done ${dayLabel(header.doneDay, today)}${header.doneReason ? ` · “${header.doneReason}”` : ""}` : "Done"}</span>}
        {header.status === "ARCHIVED" && <span>Archived{header.archivedDay ? ` ${dayLabel(header.archivedDay, today)}` : ""}{header.archiveReason ? ` · ${header.archiveReason}` : ""}. Its history, readings and Aim rank are kept.</span>}
      </div>
      {depth && <DepthLines depth={depth} m={m} aim={header.aim} today={today} names={names} />}
      {!depth && dateCheck?.reachByExam != null && header.examDay && <div className="rm-depth"><span>{examWaypointLine(header.examDay, dateCheck.reachByExam)}</span></div>}
      {rank && (
        <ProficiencyBlock
          rank={rank}
          proficiency={proficiency}
          variant="page"
          today={today}
          scheduled={scheduled}
          writesOff={writesOff}
          seenKey={header.id}
          ladder={milestones ? { milestones, depth: header.depth ?? null, paragonMissing: paragonMissing ?? [] } : undefined}
        />
      )}
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
          {header.credential && !header.hasSyllabus && header.depth == null && <span>{CREDENTIAL_LINE}</span>}
        </div>
      )}
    </section>
  );
}
