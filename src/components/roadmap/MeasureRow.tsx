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
 *
 * UI motion (ui-motion.md §3.3 screen 5, D1, D9, D13, D25, D26): the row is
 * "[s-know + ev.tested] Position Sizing, Risk Management · L6+ · 23%", its
 * meter, and "+5/21 since start". Every full sentence (holding, already
 * counted, the gap and its basis, measured, the pace) moves into the row's ▸,
 * in the DOM and one tap away. The meter fills from the value this viewer
 * last saw (meter-fill, SEEN), in either direction (D9), only under the same
 * plan basis and the same target (the target is in the key: a changed target
 * never animates, D8). A Gemini basis keeps its who-word visible
 * («Gemini · not checked», the note sr-only and in the ▸). The paused line
 * stays visible, verbatim. The root stays `<div class="rm-mr">` (the checks
 * cut rows on it).
 */
import { Glyph, Mark } from "@/components/glyph/Glyph";
import { Fig } from "@/components/glyph/GlyphStat";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { useSeenValue, type SeenKey } from "@/components/glyph/useSeen";
import type { EvidenceName } from "@/components/glyph/paths/evidence";
import { Meter } from "@/components/ui/Meter";
import { goalPercent } from "@/lib/goals";
import { parseMeasureKey, type MeasureRowView } from "@/lib/roadmap-types";
import { SHORT_GEMINI, SHORT_GEMINI_KEPT, basisClassNote, levelGapPhrase, measuredLabel, paceLine } from "./roadmap-copy";
import { seenMeasureWhat } from "./roadmap-ui-model";
// Revision 5, lane 9: pv.named (contracts ruling 67) and "climbing to 8" (ui-motion §15.6)
import { NamedText, hasNamed } from "@/components/glyph/NamedMark";
import { climbingToLine } from "./roadmap-copy";

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

/** The evidence badge a figure's caption names (D27: a glyph names the number's real class). */
export function evidenceOfCaption(caption: string | null | undefined): EvidenceName[] {
  const c = caption ?? "";
  const out: EvidenceName[] = [];
  if (/tested by your reviews/.test(c)) out.push("ev.tested");
  if (/from your ticks|you tick/.test(c)) out.push("ev.tick");
  if (/counted by the app/.test(c)) out.push("ev.counted");
  if (/you log/.test(c)) out.push("ev.log");
  return out;
}

/** A measure's meter key: the plan's basis, the measure and its target (a changed target is a new key, so it never animates; D8). */
export function measureSeenKeyOf(seen: Omit<SeenKey, "what"> | null | undefined, row: Pick<MeasureRowView, "measureKey" | "target">): SeenKey | null {
  return seen ? { ...seen, what: seenMeasureWhat(`${row.measureKey}@${row.target}`) } : null;
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
  scope,
  seen,
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
  /** The measure's Domain names ("Position Sizing, Risk Management"): the compact head; without them the label stands. */
  scope?: string | null;
  /** The plan's seen basis (seenBaseOf(bases, "plan")): the meter fills from the value this viewer last saw. None: no motion. */
  seen?: Omit<SeenKey, "what"> | null;
}) {
  const parsed = parseMeasureKey(row.measureKey);
  const level = parsed?.kind === "CARDS_AT_LEVEL" ? parsed.level : null;
  const g = measureFractionOf(row);
  const pct = g != null ? `${goalPercent(g)}%` : null;
  const measured = row.measuredAt ? measuredLabel(row.measuredAt, today) : writesOff ? "not recorded on this server" : "not measured yet";
  const pace = paceLine(row.pace, { level, today });
  const note = basisClassNote(row.basisClass);
  const key = measureSeenKeyOf(seen, row);
  const from = useSeenValue(g != null ? key : null, g ?? 0);
  const evidence = evidenceOfCaption(row.figure?.caption);
  const cards = row.kind === "CARDS_AT_LEVEL";
  const value = row.figure ? Number(row.figure.value) : null;
  // The compact head: the Domains and the level ("Position Sizing, Risk Management · L6+"), or "Practice kept".
  const head = hasNamed(row.labelParts) ? (
    // Revision 5, lane 9 (contracts ruling 67): a Gemini-named Domain in the label carries pv.named, from the view's NamedParts
    <span data-wc="name">
      <NamedText parts={row.labelParts} />
    </span>
  ) : cards && scope ? (
      <>
        <span data-wc="name">{scope}</span>
        {level != null && (
          <span className="rm-mr-lv">
            {" "}
            <Fig compact={`· L${level}+`} speech={`, level ${level} or higher`} />
          </span>
        )}
      </>
    ) : (
      label
    );
  const gain =
    cards && row.gained != null && row.needed != null ? (
      <span className="rm-mr-gain">
        <span aria-hidden="true">
          +{row.gained}/{row.needed} {since}
        </span>
        <span className="sr-only">
          {row.gained} of {row.needed} more {since}
        </span>
      </span>
    ) : !cards && value != null ? (
      <span className="rm-mr-gain">
        <span aria-hidden="true">
          {value}/{row.target}
        </span>
        <span className="sr-only">
          {value} of {row.target} sessions
        </span>
      </span>
    ) : null;
  return (
    <div className="rm-mr">
      <div className="rm-mr-h">
        <b className="rm-mr-k">
          <span className="rm-mr-g" aria-hidden="true">
            <Mark glyph={cards ? "s-know" : "ev.tick"} size={16} />
            {cards &&
              evidence.map((e) => (
                <Glyph key={e} name={e} size={12} inherit />
              ))}
          </span>
          <span className="rm-mr-l">{head}</span>
          {slowest && " "}
          {slowest && <span className="rm-slow">slowest</span>}
          {/* Revision 5, lane 9 (ui-motion §15.6): an earlier layer's measure, as context */}
          {row.climbing != null && <span className="rm-mr-climb"> · {climbingToLine(row.climbing)}</span>}
        </b>
        {pct && <span className="rm-pct">{pct}</span>}
      </div>
      {g != null && <Meter value={g} from={from} label={`${label}: ${pct}, ${row.figure?.caption ?? ""}`} />}
      {note && (
        <p className="rm-mr-f">
          <HonestyChip kind={row.basisClass === "KEPT_SUGGESTION" ? "gemini-kept" : "gemini"} label={row.basisClass === "KEPT_SUGGESTION" ? SHORT_GEMINI_KEPT : SHORT_GEMINI} sr={note} />
        </p>
      )}
      {pausedNote && <p className="t-meta rm-ink1">{pausedNote}</p>}
      {/* The facts line is the ▸: its full sentences one tap away (D13). */}
      <details className="rm-mr-d">
        <summary className="rm-mr-s t-meta">
          {gain ?? <span>{row.figure ? measured : writesOff ? "Not recorded on this server." : measured}</span>}
          <span className="sr-only"> · how {label} is measured</span>
          <Mark glyph="i-chev" size={16} className="rm-chev" />
        </summary>
        <div className="rm-mr-more">
          {row.figure ? (
            cards ? (
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
        </div>
      </details>
    </div>
  );
}
