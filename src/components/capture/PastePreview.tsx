"use client";

import { useMemo } from "react";
import { parseCapture } from "@/lib/capture-parse";
import type { DayKey } from "@/lib/life-day";
import { IconButton } from "@/components/ui/Button";
import type { WeightUnit } from "@/lib/weight";
import { doneNowChipOf } from "@/lib/done-now";
import type { CaptureActiveTitle } from "@/app/actions/capture";
import { PASTE_AS_NEW, PASTE_CAP_NOTE, PASTE_MUST_NOTE, pasteAsNewLabel, tickMatchOf, wherePreviewOf } from "./capture-ui";
import { weighInOf, weighInPreview } from "./weight-capture";

/**
 * A pasted list, one task per line (capture.md P2): shown in place of the
 * sheet's scroll region before anything is saved, so 'buy milk / eggs tmr /
 * bread' reads as three tasks with only the second dated, not one garbled
 * one. Each row is the title the parser will store, where it will probably
 * go (the board's own rule on the line's shape; the toast names the
 * server's), a dashed 'Must · needs a day' when its '!' has nothing to be
 * judged on, and a 40 px × to leave it out. Add N and Cancel sit where Add
 * always does. A weigh-in line ('weight 72.4') previews as the reading it
 * logs ('Weight 72.4 kg · Train'), as the server will save it.
 *
 * A done-now line that names a row on today's Board (blueprint P6, D33; the
 * same rule as the line's chip, capture-ui tickMatchOf, over a list that is
 * today's and fresh) previews as the tick it is ('Ticks: Gym (Habits)'), with
 * a 44 px 'As a new task' toggle beside it: pressed, the line is saved as a
 * new task (sent `asNew`), as the chip's one tap does for a typed line.
 */

interface Props {
  lines: string[];
  truncated: boolean;
  today: DayKey;
  onRemove: (index: number) => void;
  /** The user's unit for a bare weigh-in number. */
  weightUnit?: WeightUnit;
  /** P6 review: the sheet's open titles when they are today's and fresh (null otherwise: no line shows a tick). */
  active?: readonly CaptureActiveTitle[] | null;
  /** On a work tab: a line never ticks a row. */
  work?: boolean;
  /** The lines turned back into new tasks, by index. */
  asNew?: readonly boolean[];
  onToggleAsNew?: (index: number) => void;
}

export function PastePreview({ lines, truncated, today, onRemove, weightUnit = "kg", active = null, work = false, asNew, onToggleAsNew }: Props) {
  const rows = useMemo(
    () =>
      lines.map((line, i) => {
        const w = weighInOf(line, [], today, weightUnit);
        if (w) {
          const preview = weighInPreview(w, weightUnit, today);
          return { line, title: preview.title, where: preview.where, mustNote: false, ticks: null };
        }
        const parsed = parseCapture(line, { today, work });
        const ticks = active ? tickMatchOf(parsed, active, { work }) : null;
        const where = ticks && !asNew?.[i] ? doneNowChipOf(ticks) : parsed.title ? wherePreviewOf(parsed, today).label : null;
        return { line, title: parsed.title || line, where, mustNote: !!parsed.compulsoryWarning && !(ticks && !asNew?.[i]), ticks };
      }),
    [lines, today, weightUnit, active, work, asNew]
  );
  return (
    <section className="capture-paste" aria-labelledby="capture-paste-h">
      <h3 className="capture-paste-h" id="capture-paste-h">
        Add {lines.length} {lines.length === 1 ? "line" : "lines"}
      </h3>
      {truncated && <p className="capture-note">{PASTE_CAP_NOTE}</p>}
      <ul className="capture-paste-list">
        {rows.map((r, i) => (
          <li key={`${i}:${r.line}`} className="capture-paste-row">
            <span className="capture-added-main">
              <span className="capture-added-title">{r.title}</span>
              <span className="capture-added-meta">
                {r.where ?? "Needs a few words for a title"}
                {r.mustNote && (
                  <>
                    {" "}
                    <span className="chip capture-chip" data-warn="1">
                      {PASTE_MUST_NOTE}
                    </span>
                  </>
                )}
              </span>
            </span>
            {r.ticks && onToggleAsNew && (
              <button
                type="button"
                className="chip btn-chip capture-chip capture-paste-new"
                aria-pressed={!!asNew?.[i]}
                onClick={() => onToggleAsNew(i)}
                aria-label={pasteAsNewLabel(r.line, r.ticks.title)}
                title={pasteAsNewLabel(r.line, r.ticks.title)}
              >
                {PASTE_AS_NEW}
              </button>
            )}
            <IconButton icon="x" label={`Leave out “${r.line}”`} onClick={() => onRemove(i)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
