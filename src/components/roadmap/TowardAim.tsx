"use client";

/**
 * "Toward the aim" (F10 aim end state, F18 §2): each end-state measure with
 * its own meter (never blended), "Milestones reached 1 of 3" on a strip that
 * never uses 'miss' (a late milestone is Carried, never debt), practice kept
 * since you began as context, a Body Area's weight line, and the fixed line
 * that leaves the judgement to the user.
 *
 * UI motion (ui-motion.md §3.3 screen 6, D1, D13, D27): each measure is a
 * compact MeasureRow ("12% [ev.tested]", its meter, "+6/40 since you
 * began", its ▸); the milestones as "[m.seal] 1/6" on the strip; practice as
 * "[ev.tick] 39 sessions «context only»" (a tick count is exact: no ≈); the
 * weight line verbatim with «context only». The fixed line is the «yours to
 * judge» chip, which opens it in full. One (i) holds the rest: the share of
 * practice kept, "context, not part of progress" and the rebase note.
 */
import { Mark } from "@/components/glyph/Glyph";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { InfoTip } from "@/components/glyph/InfoTip";
import type { SeenKey } from "@/components/glyph/useSeen";
import { SegmentStrip } from "@/components/ui/Meter";
import { parseMeasureKey, type MilestoneRowView, type TowardAimView } from "@/lib/roadmap-types";
import { SHORT_CONTEXT_ONLY, SHORT_JUDGE, plural } from "./roadmap-copy";
import { milestoneSegmentsOf, scopeNamesOf, type LibraryDomain } from "./roadmap-ui-model";
import { MeasureRow } from "./MeasureRow";

/** The fixed line that leaves the judgement to the user (the «yours to judge» chip's full text). */
export function towardJudgeLine(aim: string, cardsArea: boolean): string {
  return cardsArea
    ? `This app tests the cards you hold through your reviews and counts the practice you tick. Whether that makes you '${aim}' is yours to judge.`
    : `This app counts the practice and steps you tick. Whether that makes you '${aim}' is yours to judge.`;
}

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
  seen,
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
  /** The plan's seen basis: each meter fills from the value this viewer last saw. */
  seen?: Omit<SeenKey, "what"> | null;
}) {
  const segs = milestoneSegmentsOf(rows, toward.scheduled, toward.reached);
  const current = rows.find((r) => r.state === "CURRENT" || r.state === "PENDING_REACH");
  const stripLabel = `${plural(toward.reached, "milestone")} reached of ${toward.scheduled}${current ? `, milestone ${current.ord} current` : ""}`;
  const kept = toward.practiceKept;
  const rebase = Boolean(firstAcceptedDay && toward.measures.length > 0);
  const tip = Boolean(kept) || rebase;
  return (
    <section className="card rm-tw" aria-label="Toward the aim">
      {toward.measures.map((row) => {
        const parsed = parseMeasureKey(row.measureKey);
        const names = parsed?.kind === "CARDS_AT_LEVEL" ? scopeNamesOf(parsed.domainIds, domainIndex) : null;
        const label = row.label ?? (parsed?.kind === "CARDS_AT_LEVEL" ? `${names ?? "The aim's Domains"} · cards at level ${parsed.level}+` : "Practice kept");
        return (
          <div key={row.measureKey} className="rm-tw-row">
            <MeasureRow row={row} label={label} m={m} today={today} since="since you began" writesOff={writesOff} scope={names} seen={seen} />
          </div>
        );
      })}
      <div className="rm-tw-row rm-tw-ms">
        <span className="rm-tw-k" aria-hidden="true">
          <Mark glyph="m.seal" size={16} />
        </span>
        <SegmentStrip tall segs={segs} label={stripLabel} className="rm-strip" />
        <span className="rm-pct" aria-hidden="true">
          {toward.reached}/{toward.scheduled}
        </span>
        <span className="sr-only">Milestones reached: {toward.reached} of {toward.scheduled}</span>
      </div>
      {kept && (
        <div className="rm-tw-row rm-tw-f">
          <span className="rm-tw-k" aria-hidden="true">
            <Mark glyph="ev.tick" size={16} />
          </span>
          <span className="rm-tw-v">
            <span aria-hidden="true">{plural(kept.sessions, "session")}</span>
            <span className="sr-only">Practice kept since you began: {plural(kept.sessions, "session")} · from your ticks</span>
          </span>{" "}
          <HonestyChip kind="context-only" label={SHORT_CONTEXT_ONLY} sr="context, not part of progress" />
        </div>
      )}
      {toward.weightLine && (
        <div className="rm-tw-row rm-tw-f">
          <span className="rm-tw-k" aria-hidden="true">
            <Mark glyph="s-body" size={16} />
          </span>
          <span className="rm-tw-v">
            <span className="sr-only">Weight: </span>
            {toward.weightLine}
          </span>{" "}
          <HonestyChip kind="context-only" label={SHORT_CONTEXT_ONLY} sr="context, not part of progress" />
        </div>
      )}
      <div className="rm-tw-foot">
        <HonestyChip kind="judge" label={SHORT_JUDGE} full={towardJudgeLine(aim, cardsArea)} />{" "}
        {tip && (
          <InfoTip topic="Toward the aim">
            {kept && (
              <span className="rm-tip-l">
                Practice kept since you began{kept.share != null ? `: ≈ ${Math.round(kept.share * 100)}%` : ""} · {plural(kept.sessions, "session")} · from your ticks · context, not part of progress
              </span>
            )}
            {rebase && <span className="rm-tip-l">Counted from your first acceptance, so a re-plan can&apos;t rebase it.</span>}
          </InfoTip>
        )}
      </div>
    </section>
  );
}
