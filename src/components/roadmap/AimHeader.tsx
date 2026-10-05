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
 *
 * UI motion (ui-motion.md §3.3 screens 4 and 12, §7.4, D1, D13, D18, D25):
 *   - the horizon band (64 px, SVG marks over the soft layer; no text on it)
 *     at the card's top, from horizonOfRoadmap: AMBIENT air ≤ 5 s per
 *     session on an ACTIVE measured plan, static on DONE / ARCHIVED (dimmed);
 *   - the aim verbatim; one chip row: the Area "[s-know] Trading · L6", the
 *     date "[t.cal] L12 by ≈ Dec 2027" (the app's estimate, month precision)
 *     or "[t.pin] 31 Dec 2027 · yours", the exam, «Over», «Target lowered
 *     46 → 38», «writes off», «Gemini's guess», «App policy» and «yours to
 *     judge» (a depth plan), «Aim not checked» + Add a figure. Every chip
 *     that is a button opens its full constant; the static ones carry it
 *     sr-only and in the header's (i);
 *   - the Aim rank and Proficiency are ProficiencyBlock's (R2);
 *   - DONE / ARCHIVED: the eyebrow "History", the rank actually held as a
 *     RankSeal, and "Reached 18 Dec 2026 · Aim rank Paragon · 96%" with the
 *     [m.seal] stamp (seal-reached, SEEN, once per viewer), or "Closed … ·
 *     the aim wasn't reached" with no seal; ARCHIVED, "Archived …";
 *   - SINCE_LINE after a long absence (H13), client-only;
 *   - one (i) with every full line the chips shortened: the date sentence,
 *     the exam waypoint, the plan line, the target lowered, the aim check,
 *     the depth's choices, the closing reason.
 * The estimated date crossfades when its month changed since this viewer
 * last saw it (date-moved, CHANGED; "moved from …" beside it); an estimate
 * never draws toward its date.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Glyph, Mark } from "@/components/glyph/Glyph";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { InfoTip } from "@/components/glyph/InfoTip";
import { RankSeal, rankSr } from "@/components/glyph/RankSeal";
import { useSeenEvent, usePlayOnSeen, useSinceLine } from "@/components/glyph/useSeen";
import { Fig } from "@/components/glyph/GlyphStat";
import { HorizonField } from "@/components/fx/HorizonField";
import { playGlyph } from "@/lib/glyph-motion";
import type { AimRankView, DateCheck, DepthView, MilestoneRowView, ParagonMissing, ProficiencyView, RoadmapHeader } from "@/lib/roadmap-types";
import {
  COVERAGE_UNCHECKED_LINE,
  CREDENTIAL_LINE,
  SHORT_GEMINI_GUESS,
  SHORT_HISTORY,
  SHORT_JUDGE,
  SHORT_OVER,
  SHORT_POLICY,
  SHORT_WRITES_OFF,
  SINCE_SEAL_ITEM,
  TRACK_SIGIL,
  TRACK_WORD,
  WRITES_OFF_BANNER,
  aimCheckLine,
  byLine,
  coverageChoiceLine,
  coverageJudgeLine,
  dateAppSetLine,
  dateFull,
  dayFull,
  dayLabel,
  dayWithWeekday,
  depthChoiceLine,
  depthLine,
  depthName,
  monthYear,
  domainOriginLine,
  examWaypointLine,
  overKeptLine,
  shortAimClosed,
  shortLowered,
  shortReachedAim,
} from "./roadmap-copy";
import { aimDateOfHeader, daySeenValue, dayOfSeenValue, seenBaseOf, seenBasesOfRoadmap, seenKeyOf, SEEN_WHAT, type HorizonModel } from "./roadmap-ui-model";
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

/** The policy chip's full text: the Depth line and every choice and provenance line on it (DepthLines without the judge line). */
function DepthPolicyLines({ depth, m, today, names }: { depth: DepthView; m: number; today: string; names?: ReadonlyMap<string, string> }) {
  const nameOf = (id: string) => depth.coverage.find((c) => c.domainId === id)?.name ?? names?.get(id) ?? null;
  const lines: string[] = [depthLine(depth.depth, depth.coverage, m)];
  for (const [id, o] of Object.entries(depth.domainOrigins)) {
    const n = nameOf(id);
    const l = n ? domainOriginLine(n, o, today) : null;
    if (l) lines.push(l);
  }
  for (const c of depth.coverageChoices) {
    const n = nameOf(c.domainId);
    if (n) lines.push(coverageChoiceLine(n, c, today));
  }
  if (!depth.outlineChecked) lines.push(COVERAGE_UNCHECKED_LINE);
  if (depth.depthChoice) lines.push(depthChoiceLine(depth.depthChoice, today));
  return (
    <>
      {lines.map((l) => (
        <span key={l} className="rm-tip-l">
          {l}
        </span>
      ))}
    </>
  );
}

/** Inline items with a space between each, so their text never runs together (a flex row ignores the spaces). */
export function spaced(items: readonly ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (const it of items) {
    if (it == null || it === false) continue;
    if (out.length > 0) out.push(" ");
    out.push(it);
  }
  return out;
}

/** "moved from Mar 2028": the static words beside a crossfaded estimate (date-moved, CHANGED). */
export function movedFromLine(day: string): string {
  return `moved from ${monthYear(day)}`;
}

/** The month an estimated date reads at (month precision), as a seen value: only a change of the shown month crossfades. */
export function monthSeenValue(day: string): number {
  return daySeenValue(`${day.slice(0, 7)}-01`);
}

/** The date chip: the app's estimate "[t.cal] L12 by ≈ Dec 2027" or your own "[t.pin] 31 Dec 2027 · yours" (C2-M2). */
function DateChip({ header, roadmapSeen }: { header: RoadmapHeader; roadmapSeen: ReturnType<typeof seenBasesOfRoadmap> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const d = aimDateOfHeader(header);
  const estimate = d.whose === "app";
  const key = estimate ? seenKeyOf(roadmapSeen, SEEN_WHAT.date) : null;
  const seen = useSeenEvent(key, monthSeenValue(d.day), ref);
  const fromDay = seen.changed ? dayOfSeenValue(seen.from) : null;
  const moved = fromDay && fromDay.slice(0, 7) !== d.day.slice(0, 7) ? fromDay : null;
  // CHANGED: one crossfade of the marker and its text, in place (no draw, no roll, no direction), once per seen change.
  useEffect(() => {
    if (moved) void playGlyph(ref.current, "date-moved", { licence: "CHANGED" });
  }, [moved]);
  return (
    <span ref={ref} className="chip rm-date" data-wc="honest" data-whose={d.whose ?? undefined}>
      {/* D27: t.cal says the app set it, t.pin that you did; a date whose setter the view doesn't record carries neither. */}
      {d.whose && <Glyph name={d.glyph} size={12} inherit />}
      {d.whose && " "}
      <Fig compact={d.text} speech={d.whose === "app" ? `${d.level != null ? `level ${d.level} ` : ""}by about ${monthYear(d.day)}, an estimate set by the app` : d.whose === "yours" ? `${dateFull(d.day)}, your own date` : undefined} />
      {moved && <span className="rm-date-was"> {movedFromLine(moved)}</span>}
    </span>
  );
}

/** The Area: "[s-know] Trading · L6", or "[s-body] Body · practice only". */
export function AreaChipShort({ header }: { header: RoadmapHeader }) {
  const a = header.area;
  if (a.kind === "FIELD")
    return (
      <span className="chip rm-area">
        <Mark glyph="s-know" size={12} />
        <span data-wc="name">{a.name}</span>{" "}
        <Fig compact={`· L${a.level}`} speech={`, level ${a.level}`} />
      </span>
    );
  return (
    <span className="chip rm-area">
      <Mark glyph={`s-${TRACK_SIGIL[a.track]}`} size={12} />
      <span data-wc="name">{TRACK_WORD[a.track]}</span> · practice only
    </span>
  );
}

/** DONE / ARCHIVED: the rank actually held, and the one line that says how the aim closed (D18: no seal on an aim closed unreached). */
function ClosedHero({ header, rank, proficiency, roadmapSeen, today }: { header: RoadmapHeader; rank: AimRankView | null; proficiency: ProficiencyView | null; roadmapSeen: ReturnType<typeof seenBasesOfRoadmap>; today: string }) {
  const sealRef = useRef<HTMLSpanElement>(null);
  const reached = header.status === "DONE" && Boolean(header.reachedDay);
  // seal-reached (SEEN): a counted done reach new since this viewer last saw it; never on an aim closed unreached.
  usePlayOnSeen(sealRef, reached ? seenKeyOf(roadmapSeen, SEEN_WHAT.seal) : null, 1, "seal-reached", { label: SINCE_SEAL_ITEM });
  const line =
    header.status === "ARCHIVED"
      ? `Archived${header.archivedDay ? ` ${dayLabel(header.archivedDay, today)}` : ""}`
      : reached
        ? rank && proficiency
          ? shortReachedAim(header.reachedDay!, rank.name, proficiency.percent)
          : `Aim reached ${dateFull(header.reachedDay!)}`
        : header.doneDay
          ? shortAimClosed(header.doneDay)
          : "Done";
  return (
    <div className="rm-hero">
      {/* The rank actually held; a counted rise this viewer hasn't seen plays once here (rank-rise, SEEN; the key has no surface). */}
      {rank && <RankSeal index={rank.index} top={rank.top.index} size={72} state="done" seenKey={seenBaseOf(roadmapSeen, "plan")} />}
      <p className="rm-hero-l">
        {reached && (
          <span ref={sealRef} className="rm-hero-seal" aria-hidden="true">
            <Glyph name="m.seal" state="done" size={20} />
          </span>
        )}
        <span>{line}</span>{" "}
        {rank && <span className="sr-only">{reached && proficiency ? rankSr(rank.index, true) : `Aim rank ${rank.name}${rankSr(rank.index, true)}`}</span>}
      </p>
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
  horizon,
  writesOffChip = false,
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
  /** The horizon band's inputs (roadmap-ui-model horizonOfRoadmap); none: no band. */
  horizon?: HorizonModel | null;
  /** The page's writes-off banner moves into the header as the «writes off» chip (the living page). */
  writesOffChip?: boolean;
}) {
  const closed = header.status === "DONE" || header.status === "ARCHIVED";
  const estimate = Boolean(header.dateOrigin && header.dateOrigin.calibrating.length > 0);
  const dateFullLine =
    header.depth != null ? (estimate ? `${depthName(header.depth)} by about ${monthYear(header.targetDay)} · estimate` : `${depthName(header.depth)} by ${dayFull(header.targetDay)}`) : byLine(header.targetDay, today, !closed);
  const appSet = header.dateOrigin?.origin === "REALISTIC" && header.acceptedDay;
  const roadmapSeen = seenBasesOfRoadmap({ header, proficiency });
  const since = useSinceLine();
  // The seal's baseline (seal-reached, SEEN): an open plan records "not reached" (0) once seen, so the reach plays once on the done page.
  const sectionRef = useRef<HTMLElement>(null);
  useSeenEvent(closed ? null : seenKeyOf(roadmapSeen, SEEN_WHAT.seal), 0, sectionRef);
  const unchecked = !closed && header.aimCheck.kind === "unchecked";
  const credential = !closed && header.credential && !header.hasSyllabus && header.depth == null;
  const examLine = depth?.exam ? examWaypointLine(depth.exam.day, depth.exam.reachLevel) : !depth && dateCheck?.reachByExam != null && header.examDay ? examWaypointLine(header.examDay, dateCheck.reachByExam) : null;
  const planLine =
    header.version > 0
      ? `Plan v${header.version}${header.acceptedDay ? ` · accepted ${dayLabel(header.acceptedDay, today)}` : ""}${appSet ? ` · ${dateAppSetLine(header.acceptedDay as string, today)}` : ""}`
      : null;
  const closedLine =
    header.status === "DONE"
      ? header.reachedDay
        ? `Aim reached ${dayWithWeekday(header.reachedDay, today)}`
        : header.doneDay
          ? `Marked done ${dayLabel(header.doneDay, today)}${header.doneReason ? ` · “${header.doneReason}”` : ""}`
          : "Done"
      : header.status === "ARCHIVED"
        ? `Archived${header.archivedDay ? ` ${dayLabel(header.archivedDay, today)}` : ""}${header.archiveReason ? ` · ${header.archiveReason}` : ""}. Its history, readings and Aim rank are kept.`
        : null;
  const overLine = header.over && dateCheck ? overKeptLine(header.targetDay, dateCheck.D_real) : null;
  const tipLines: ReactNode[] = [
    dateFullLine,
    overLine,
    examLine,
    planLine,
    header.targetLowered ? (
      <b key="tl">
        Target lowered {header.targetLowered.from} → {header.targetLowered.to} on {dayLabel(header.targetLowered.on, today)} (re-plan)
      </b>
    ) : null,
    !closed && !unchecked ? aimCheckLine(header.aimCheck) : null,
    closedLine,
    ...(since?.rest ?? []),
  ];
  return (
    <section ref={sectionRef} className={`card rm-aim ${className ?? ""}`} aria-label="Aim" data-wc-block={closed ? "roadmap-done-header" : "aim-header"}>
      {horizon && (
        <div className="rm-band">
          <HorizonField
            proficiency={horizon.basisKey ? horizon.proficiency : horizon.proficiency ? { ...horizon.proficiency, change: { kind: "rebased" } } : null}
            roadmapId={horizon.roadmapId}
            basisKey={horizon.basisKey ?? ""}
            depth={horizon.depth}
            status={horizon.status}
            variant="page"
          />
        </div>
      )}
      <div className="t-eyebrow">{closed ? `${SHORT_HISTORY}${header.status === "ARCHIVED" ? " · archived" : ""}` : "Aim"}</div>
      <p className="rm-aim-t" data-wc="own">
        {header.aim}
      </p>
      <Chips className="rm-aim-chips">
        {spaced([
          <AreaChipShort key="area" header={header} />,
          <DateChip key="date" header={header} roadmapSeen={roadmapSeen} />,
          header.examLabel && header.examDay ? (
            <span key="exam" className="chip rm-exam">
              <Glyph name="quest.checkpoint" size={12} inherit />
              <span data-wc="name">{header.examLabel}</span>{" "}
              <Fig compact={dayLabel(header.examDay, today)} speech={dayWithWeekday(header.examDay, today)} />
            </span>
          ) : null,
          header.over ? <HonestyChip key="over" kind="over" label={SHORT_OVER} sr={overLine ?? SHORT_OVER} /> : null,
          header.targetLowered ? (
            <HonestyChip key="lowered" kind="lowered" label={shortLowered(header.targetLowered.from, header.targetLowered.to)} sr={`Target lowered from ${header.targetLowered.from} to ${header.targetLowered.to}`} />
          ) : null,
          writesOffChip && writesOff ? <HonestyChip key="live" kind="live" label={SHORT_WRITES_OFF} full={WRITES_OFF_BANNER} /> : null,
          credential ? <HonestyChip key="cred" kind="credential" label={SHORT_GEMINI_GUESS} full={CREDENTIAL_LINE} /> : null,
          depth ? <HonestyChip key="policy" kind="policy" label={SHORT_POLICY} full={<DepthPolicyLines depth={depth} m={m} today={today} names={names} />} /> : null,
          depth ? <HonestyChip key="judge" kind="judge" label={SHORT_JUDGE} full={coverageJudgeLine(header.aim)} /> : null,
          unchecked ? <HonestyChip key="unc" kind="aim-unchecked" full={aimCheckLine(header.aimCheck)} /> : null,
          // An accepted plan's aim can still be checked: the figure is the user's (R4's setAimFigure).
          unchecked ? <AddFigureLink key="fig" roadmapId={header.id} /> : null,
          <InfoTip key="tip" topic="this aim">
            {tipLines
              .filter((l) => l != null && l !== "")
              .map((l, i) => (
                <span key={i} className="rm-tip-l">
                  {l}
                </span>
              ))}
          </InfoTip>,
        ])}
      </Chips>
      {closed && <ClosedHero header={header} rank={rank} proficiency={proficiency} roadmapSeen={roadmapSeen} today={today} />}
      {!closed && rank && (
        <ProficiencyBlock
          rank={rank}
          proficiency={proficiency}
          variant="page"
          today={today}
          scheduled={scheduled}
          writesOff={writesOff}
          seenKey={header.id}
          seen={roadmapSeen}
          ladder={milestones ? { milestones, depth: header.depth ?? null, paragonMissing: paragonMissing ?? [] } : undefined}
        />
      )}
      {since && (
        <p className="rm-since" role="status">
          {since.text}
        </p>
      )}
    </section>
  );
}
