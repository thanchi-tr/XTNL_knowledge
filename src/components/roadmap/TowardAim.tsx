"use client";

/**
 * "Toward the aim" (F10 aim end state, F18 §2): each end-state measure with
 * its own meter (never blended), "Milestones reached 1 of 3" on a strip that
 * never uses 'miss' (a late milestone is Carried, never debt), practice kept
 * since you began as context, a Body Area's weight line, and the fixed line
 * that leaves the judgement to the user.
 */
import { Icon, Sigil } from "@/components/ui/Icon";
import { SegmentStrip } from "@/components/ui/Meter";
import { parseMeasureKey, type MilestoneRowView, type TowardAimView } from "@/lib/roadmap-types";
import { plural } from "./roadmap-copy";
import { milestoneSegmentsOf, scopeNamesOf, type LibraryDomain } from "./roadmap-ui-model";
import { MeasureRow } from "./MeasureRow";
import { RoadmapGlyph } from "./RoadmapGlyph";

export function TowardAim({
  toward,
  rows,
  aim,
  cardsArea,
  m,
  today,
  firstAcceptedDay,
  domainIndex,
  writesOff,
}: {
  toward: TowardAimView;
  rows: readonly MilestoneRowView[];
  aim: string;
  /** A Field Area (the fixed line names the cards). */
  cardsArea: boolean;
  m: number;
  today: string;
  firstAcceptedDay: string | null;
  domainIndex: ReadonlyMap<string, LibraryDomain | { id: string; name: string }>;
  writesOff: boolean;
}) {
  const segs = milestoneSegmentsOf(rows, toward.scheduled, toward.reached);
  const current = rows.find((r) => r.state === "CURRENT" || r.state === "PENDING_REACH");
  const stripLabel = `${plural(toward.reached, "milestone")} reached of ${toward.scheduled}${current ? `, milestone ${current.ord} current` : ""}`;
  return (
    <section className="card">
      {toward.measures.map((row) => {
        const parsed = parseMeasureKey(row.measureKey);
        const names = parsed?.kind === "CARDS_AT_LEVEL" ? scopeNamesOf(parsed.domainIds, domainIndex) : null;
        const label = row.label ?? (parsed?.kind === "CARDS_AT_LEVEL" ? `${names ?? "The aim's Domains"} · cards at level ${parsed.level}+` : "Practice kept");
        return (
          <div key={row.measureKey} className="trk-row">
            <Sigil track="know" />
            <MeasureRow row={row} label={label} m={m} today={today} since="since you began" writesOff={writesOff} />
          </div>
        );
      })}
      <div className="trk-row">
        <Icon name="flag" size={22} />
        <div>
          <div className="rm-mr-h">
            <b>Milestones reached</b>
            <span className="rm-pct">
              {toward.reached} of {toward.scheduled}
            </span>
          </div>
          <SegmentStrip tall segs={segs} label={stripLabel} className="rm-strip" />
        </div>
      </div>
      {toward.practiceKept && (
        <div className="trk-row">
          <RoadmapGlyph name="tick" size={22} />
          <div>
            <div className="rm-mr-h">
              <b>Practice kept since you began</b>
              {toward.practiceKept.share != null && <span className="rm-pct">≈ {Math.round(toward.practiceKept.share * 100)}%</span>}
            </div>
            <div className="t-meta">{plural(toward.practiceKept.sessions, "session")} · from your ticks · context, not part of progress</div>
          </div>
        </div>
      )}
      {toward.weightLine && (
        <div className="trk-row">
          <Sigil track="body" />
          <div>
            <div className="rm-mr-h">
              <b>Weight</b>
            </div>
            <div className="t-meta">{toward.weightLine} · context, not part of progress</div>
          </div>
        </div>
      )}
      {firstAcceptedDay && toward.measures.length > 0 && <p className="rm-note rm-note-top">Counted from your first acceptance, so a re-plan can&apos;t rebase it.</p>}
      <p className="rm-note rm-note-top">
        {cardsArea
          ? `This app tests the cards you hold through your reviews and counts the practice you tick. Whether that makes you '${aim}' is yours to judge.`
          : `This app counts the practice and steps you tick. Whether that makes you '${aim}' is yours to judge.`}
      </p>
    </section>
  );
}
