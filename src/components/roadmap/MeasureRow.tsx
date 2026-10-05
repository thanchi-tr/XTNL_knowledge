"use client";

/**
 * One measure on the living roadmap (F10, F11, F18 §2–3). Every figure is the
 * stored reading, branded by its class (tested by your reviews / from your
 * ticks), with the time it was measured; no surface appends a live value. The
 * gain is shown as gained of needed ("+6 of 8 since start · holding 18 of
 * 20"), "12 already counted when you started" when a high-water baseline
 * applies, then the pipeline's projection in words. No model figure sits in
 * a measured slot; with no reading the row says "not measured yet". A figure
 * worked out over Domains Gemini picked carries the propagation note ("worked
 * out on Gemini's suggested Domains (not checked)") from its basisClass.
 * A Practice kept that no longer pays because its practice was paused says
 * so under it (`note`; the lead's ruling 3).
 */
import { Meter } from "@/components/ui/Meter";
import { goalPercent } from "@/lib/goals";
import { parseMeasureKey, type MeasureRowView } from "@/lib/roadmap-types";
import { basisClassNote, levelGapPhrase, measuredLabel, paceLine } from "./roadmap-copy";

/** g_m for a measure row: (v − baseline) ÷ (target − baseline), clamped (F10). */
export function measureFractionOf(row: MeasureRowView): number | null {
  if (!row.figure) return null;
  const v = Number(row.figure.value);
  if (row.kind === "PRACTICE_KEPT") return row.target > 0 ? Math.max(0, Math.min(1, v / row.target)) : null;
  const b = row.baseline ?? 0;
  const span = row.target - b;
  if (span <= 0) return v >= row.target ? 1 : 0;
  return Math.max(0, Math.min(1, (v - b) / span));
}

export function MeasureRow({
  row,
  label,
  m,
  today,
  slowest,
  since,
  writesOff,
  note: pausedNote,
}: {
  row: MeasureRowView;
  /** "Cards at level 6+ in Risk Management, Position Sizing" or the end state's label. */
  label: string;
  m: number;
  today: string;
  slowest?: boolean;
  /** "since start" (a milestone) or "since you began" (the aim). */
  since: "since start" | "since you began";
  writesOff: boolean;
  /** A line under the row ("Strength session is paused because you said to avoid it, so from 5 Oct this no longer counts toward the milestone."). */
  note?: string | null;
}) {
  const parsed = parseMeasureKey(row.measureKey);
  const level = parsed?.kind === "CARDS_AT_LEVEL" ? parsed.level : null;
  const g = measureFractionOf(row);
  const pct = g != null ? `${goalPercent(g)}%` : null;
  const measured = row.measuredAt ? measuredLabel(row.measuredAt, today) : writesOff ? "not recorded on this server" : "not measured yet";
  const pace = paceLine(row.pace, { level, today });
  const note = basisClassNote(row.basisClass);
  return (
    <div className="rm-mr">
      <div className="rm-mr-h">
        <b>
          {label}
          {slowest && <span className="rm-slow">slowest</span>}
        </b>
        {pct && <span className="rm-pct">{pct}</span>}
      </div>
      {g != null && <Meter value={g} label={`${label}: ${pct}, ${row.figure?.caption ?? ""}`} />}
      {row.figure ? (
        row.kind === "CARDS_AT_LEVEL" ? (
          <>
            <p className="t-meta">
              {row.gained != null && row.needed != null && (
                <>
                  <b>
                    +{row.gained} of {row.needed}
                  </b>{" "}
                  {since} ·{" "}
                </>
              )}
              holding{" "}
              <b>
                {Number(row.figure.value)} of {row.target}
              </b>
              {row.alreadyCounted != null && row.alreadyCounted > 0 ? ` · ${row.alreadyCounted} already counted when you started` : ""}
            </p>
            <p className="t-meta">
              {level != null ? `${levelGapPhrase(level, m)} · ` : ""}
              {row.figure.caption} · {measured}
            </p>
          </>
        ) : (
          <p className="t-meta">
            <b>
              {Number(row.figure.value)} of {row.target}
            </b>{" "}
            sessions · {row.figure.caption} · {measured}
          </p>
        )
      ) : (
        <p className="t-meta">{writesOff ? "Not recorded on this server." : "Not measured yet — the first reading is recorded when you next open Today or You in the app."}</p>
      )}
      {note && (
        <p className="t-meta">
          <b>{note}</b>
        </p>
      )}
      {pace && <p className="t-meta">{pace}</p>}
      {pausedNote && <p className="t-meta rm-ink1">{pausedNote}</p>}
    </div>
  );
}
