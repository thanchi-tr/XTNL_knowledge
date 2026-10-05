"use client";

/**
 * TimeBar (ui-motion.md §4.5, D13, D27, D28): today → the realistic date,
 * with the earliest, exam and your-date markers.
 *
 *   Root role="group", aria-labelledby → the realism sentence. The line and markers are an
 *   aria-hidden SVG and HTML markers positioned in % (no viewBox scaling): a line from today to the
 *   realistic date; a t.earliest ghost tick; a quest.checkpoint mark for the exam; a t.pin for your
 *   date; a ◆ with ≈ (and «best case») for the realistic date.
 *   Labels are 12 px HTML spans placed here on the server from estimated text width (a character
 *   width table for the UI font) plus an 8 px gap: row 1, else row 2, else row 3; a label that
 *   still collides is not drawn and stays in the list. Height 52, 68 or 84 px by row count, decided
 *   on the server (no layout shift).
 *   A sibling list (sr-only) holds one item per marker with its full sentence; a 40 px "Dates"
 *   toggle shows that same list to touch users.
 *
 * date-moved (CHANGED): when the realistic (estimated) day differs from the one this viewer last
 * saw, the ◆ and its label crossfade. No line draw, no roll, no direction: an estimate never
 * draws toward its date (H3).
 */
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { playGlyph } from "@/lib/glyph-motion";
import { Glyph } from "./Glyph";
import type { VerdictKey } from "./HonestyChip";
import { useSeenEvent, type SeenKey } from "./useSeen";

// ─── The label placer ───────────────────────────────────────────────────────

/** Estimated advance widths at 12 px / 600 for the UI font (Inter), in px. Slightly generous on purpose. */
const NARROW = new Set([..."iljI.,:;'!|"]);
const SEMI = new Set([..."trf()[]/-"]);
const WIDE = new Set([..."mwMW@%"]);
export function textWidth12(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (ch === " ") w += 3.3;
    else if (/\d/.test(ch)) w += 7.5;
    else if (NARROW.has(ch)) w += 3.6;
    else if (SEMI.has(ch)) w += 4.8;
    else if (WIDE.has(ch)) w += 10.6;
    else if (ch === "·") w += 4;
    else if (ch === "≈" || ch === "–") w += 7.6;
    else if (ch === "→" || ch === "«" || ch === "»") w += 8.4;
    else if (/[A-Z]/.test(ch)) w += 8.4;
    else w += 7;
  }
  return Math.ceil(w);
}

export const TIMEBAR_ROW_PX = 16;
export const TIMEBAR_GAP_PX = 8;

export interface PlacedLabel {
  /** 1–3, or null: not drawn (it stays in the list). */
  row: 1 | 2 | 3 | null;
  /** px from the left at the layout width. */
  left: number;
  width: number;
}

/**
 * Places labels centred on their marks (x 0..1 of `width`), clamped inside, each on the first of
 * three rows where it keeps an 8 px gap from every label already there. Earlier marks win.
 */
export function placeLabels(marks: readonly { x: number; text: string }[], width = 278, gap = TIMEBAR_GAP_PX): PlacedLabel[] {
  const rows: [number, number][][] = [[], [], []];
  return marks.map((m) => {
    const w = textWidth12(m.text);
    const left = Math.max(0, Math.min(width - w, m.x * width - w / 2));
    for (let r = 0; r < 3; r++) {
      if (rows[r].every(([a, b]) => left + w + gap <= a || left >= b + gap)) {
        rows[r].push([left, left + w]);
        return { row: (r + 1) as 1 | 2 | 3, left, width: w };
      }
    }
    return { row: null, left, width: w };
  });
}

/** The bar's height by the rows it uses: 52, 68 or 84 px. */
export function timeBarHeight(rows: number): number {
  return 36 + TIMEBAR_ROW_PX * Math.max(1, Math.min(3, rows));
}

// ─── The bar ────────────────────────────────────────────────────────────────

export interface TimeBarMark {
  /** YYYY-MM-DD */
  day: string;
  /** The visible 12 px label ("Mar 2028", "earliest 4 Feb"). */
  label: string;
  /** The marker's full sentence (the list; examWaypointLine for the exam). */
  sentence: string;
}

export interface TimeBarProps {
  today: string;
  realistic: TimeBarMark & { estimate?: boolean; bestCase?: boolean };
  earliest?: TimeBarMark | null;
  exam?: TimeBarMark | null;
  mine?: TimeBarMark | null;
  verdict?: VerdictKey;
  /** The id of the realism sentence (the group's label). */
  labelledBy: string;
  /** The roadmap's seen key for date-moved (its `what` is "date"); none in fixtures. */
  seenKey?: Omit<SeenKey, "what"> | null;
  /** The width labels are placed at: the 278 px content box at 344. */
  width?: number;
  datesLabel?: string;
  bestCaseLabel?: string;
  className?: string;
}

type Kind = "realistic" | "exam" | "mine" | "earliest";

const dayNum = (d: string): number => {
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Number.isFinite(t) ? t / 86_400_000 : 0;
};

export function TimeBar(p: TimeBarProps) {
  const { today, realistic, labelledBy, width = 278, datesLabel = "Dates", bestCaseLabel = "best case" } = p;
  const listId = `mg-tb${useId()}`;
  const [open, setOpen] = useState(false);
  const diaRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const moved = useSeenEvent(p.seenKey ? { ...p.seenKey, what: "date" } : null, realistic.day, diaRef, { label: `date moved to ${realistic.label}` });
  useEffect(() => {
    if (!moved.changed) return;
    void playGlyph(diaRef.current, "date-moved", { licence: "CHANGED" });
    void playGlyph(labelRef.current, "date-moved", { licence: "CHANGED" });
  }, [moved.changed]);

  const marks: { kind: Kind; m: TimeBarMark }[] = [{ kind: "realistic", m: realistic }];
  if (p.exam) marks.push({ kind: "exam", m: p.exam });
  if (p.mine) marks.push({ kind: "mine", m: p.mine });
  if (p.earliest) marks.push({ kind: "earliest", m: p.earliest });
  const t0 = dayNum(today);
  const span = Math.max(1, ...marks.map((x) => dayNum(x.m.day) - t0));
  const xOf = (d: string) => 0.04 + 0.92 * Math.max(0, Math.min(1, (dayNum(d) - t0) / span));
  const realisticText = (realistic.estimate ? "≈ " : "") + realistic.label + (realistic.bestCase ? ` · ${bestCaseLabel}` : "");
  const placed = placeLabels(
    marks.map((x) => ({ x: xOf(x.m.day), text: x.kind === "realistic" ? realisticText : x.m.label })),
    width
  );
  const rowsUsed = Math.max(1, ...placed.map((pl) => pl.row ?? 0));
  const xr = xOf(realistic.day);
  const xMax = Math.max(...marks.map((x) => xOf(x.m.day)));

  return (
    <div className={cx("mg-tb", p.className)} role="group" aria-labelledby={labelledBy} data-verdict={p.verdict}>
      <div className="mg-tb-bar" style={{ height: timeBarHeight(rowsUsed) }} data-rows={rowsUsed}>
        <svg className="mg-tb-line" width="100%" height="16" aria-hidden="true" focusable="false">
          <line className="mg-tb-axis" x1="4%" x2={`${(xMax * 100).toFixed(2)}%`} y1="8" y2="8" />
          <line className="mg-tb-run" x1="4%" x2={`${(xr * 100).toFixed(2)}%`} y1="8" y2="8" />
        </svg>
        <span className="mg-tb-m" aria-hidden="true" style={{ left: "4%" }}>
          <span className="mg-tb-today" />
        </span>
        {marks.map((x, i) => {
          const pl = placed[i];
          const left = `${((xOf(x.m.day)) * 100).toFixed(2)}%`;
          return (
            <span key={x.kind} style={{ display: "contents" }}>
              <span ref={x.kind === "realistic" ? diaRef : undefined} className="mg-tb-m" data-k={x.kind} aria-hidden="true" style={{ left }}>
                {x.kind === "realistic" ? (
                  <span className="mg-tb-dia" />
                ) : (
                  <Glyph name={x.kind === "exam" ? "quest.checkpoint" : x.kind === "mine" ? "t.pin" : "t.earliest"} size={16} inherit />
                )}
              </span>
              {pl.row != null && (
                <span
                  ref={x.kind === "realistic" ? labelRef : undefined}
                  className="mg-tb-l"
                  data-k={x.kind}
                  data-row={pl.row}
                  aria-hidden="true"
                  style={{ top: 32 + (pl.row - 1) * TIMEBAR_ROW_PX, left: `${((pl.left / width) * 100).toFixed(2)}%` }}
                >
                  {x.kind === "realistic" ? (
                    <>
                      {realistic.estimate ? "≈ " : ""}
                      <span className="mg-dm-t">{realistic.label}</span>
                      {realistic.bestCase && <span data-wc="honest">{` · ${bestCaseLabel}`}</span>}
                    </>
                  ) : (
                    x.m.label
                  )}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="mg-tb-foot">
        <button type="button" className="mg-tb-dates" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
          {datesLabel}
        </button>
      </div>
      <ul id={listId} className={cx("mg-tb-list", !open && "sr-only")}>
        {marks.map((x) => (
          <li key={x.kind} data-k={x.kind}>
            {x.m.sentence}
          </li>
        ))}
      </ul>
    </div>
  );
}
