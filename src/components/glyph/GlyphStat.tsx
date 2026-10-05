/**
 * Compact figures with spoken twins (ui-motion.md §4.5, D26, D27, D28).
 * Server-safe.
 *
 *   <GlyphStat glyph value unit label estimate? evidence? unverified? bestCase? calibrating? at?/>
 *       glyph + figure + unit word in tabular numerals. The compact text is aria-hidden; the sr twin is
 *       figureSpeech(value, unit, flags) + the label ("about 9 hours seen").
 *       estimate    an ≈ (spoken "about"); never with ev.measured (D27: a clock only beside a measured time)
 *       unverified  the visible word "unverified"
 *       bestCase    a visible «best case» chip
 *       calibrating the figure is replaced by "pass rate calibrating n/need"
 *       A figure with any of these flags never animates (H3).
 *   <StatRow items/>   GlyphStats separated by "·"
 *   <Fig compact speech?/>   any compact figure: aria-hidden text + its sr twin (speakFigure)
 */
import { cx } from "@/components/ui/cx";
import { figureSpeech, speakFigure } from "@/lib/figure-speech";
import { Glyph, Mark, type MarkRef } from "./Glyph";
import { HonestyChip } from "./HonestyChip";
import type { TrackSigil } from "./paths";
import type { EvidenceName } from "./paths/evidence";

/** A compact figure and its spoken twin: "≈ 110 d" (aria-hidden) + "about 110 days" (sr-only). */
export function Fig({ compact, speech, className }: { compact: string; speech?: string; className?: string }) {
  return (
    <span className={cx("mg-fig", className)}>
      <span aria-hidden="true">{compact}</span>
      <span className="sr-only">{speech ?? speakFigure(compact)}</span>
    </span>
  );
}

export interface GlyphStatProps {
  glyph?: MarkRef;
  value: number | string;
  /** A unit from figure-units.json ("h", "d", "%", "h/wk", "cards" …). */
  unit?: string;
  /** The unit word or caption beside the figure ("seen", "yours", "at L6+"). */
  label?: string;
  estimate?: boolean;
  /** A small evidence glyph after the figure. */
  evidence?: EvidenceName;
  unverified?: boolean;
  bestCase?: boolean;
  calibrating?: { n: number; need: number } | null;
  /** A measured time ("09:12"): the only licence for ev.measured. */
  at?: string;
  track?: TrackSigil;
  defs?: string;
  /** Override the spoken twin (only with the same facts). */
  speech?: string;
  className?: string;
}

/** The glyph a stat may carry: never ev.measured on an estimate or without a measured time (D27). */
export function statGlyph(glyph: MarkRef | undefined, o: { estimate?: boolean; at?: string }): MarkRef | null {
  if (!glyph) return null;
  if (glyph === "ev.measured" && (o.estimate || !o.at)) return o.estimate ? "ev.estimate" : null;
  return glyph;
}

function compactOf(value: number | string, unit?: string, estimate?: boolean): string {
  const u = unit ? (unit === "%" ? "%" : ` ${unit}`) : "";
  return `${estimate ? "≈ " : ""}${value}${u}`;
}

export function GlyphStat(p: GlyphStatProps) {
  const g = statGlyph(p.glyph, p);
  const cal = p.calibrating ?? null;
  const speech =
    p.speech ??
    [figureSpeech(p.value, p.unit, { estimate: p.estimate, unverified: p.unverified, calibrating: cal }), cal ? null : p.label].filter(Boolean).join(" ");
  return (
    <span className={cx("mg-stat", p.className)} data-stat="" data-estimate={p.estimate ? "" : undefined}>
      {g && <Mark glyph={g} size={14} defs={p.defs} track={p.track} />}
      {cal ? (
        <span className="mg-stat-f" aria-hidden="true" data-wc="honest">
          pass rate calibrating {cal.n}/{cal.need}
        </span>
      ) : (
        <>
          <span className="mg-stat-f" aria-hidden="true">
            {compactOf(p.value, p.unit, p.estimate)}
          </span>
          {p.label && (
            <span className="mg-stat-u" aria-hidden="true">
              {p.label}
            </span>
          )}
        </>
      )}
      {p.evidence && <Glyph name={p.evidence} size={14} defs={p.defs} inherit />}
      {p.unverified && (
        <span className="mg-stat-u" aria-hidden="true" data-wc="honest">
          unverified
        </span>
      )}
      <span className="sr-only">{speech}</span>
      {p.bestCase && <HonestyChip kind="best-case" defs={p.defs} />}
    </span>
  );
}

export function StatRow({ items, className }: { items: readonly GlyphStatProps[]; className?: string }) {
  return (
    <span className={cx("mg-statrow", className)}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && (
            <span className="mg-sep" aria-hidden="true">
              ·
            </span>
          )}
          <GlyphStat {...it} />
        </span>
      ))}
    </span>
  );
}
