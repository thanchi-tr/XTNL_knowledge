"use client";

import { useMemo } from "react";
import { parseCapture } from "@/lib/capture-parse";
import type { DayKey } from "@/lib/life-day";
import { IconButton } from "@/components/ui/Button";
import { PASTE_CAP_NOTE, PASTE_MUST_NOTE, wherePreviewOf } from "./capture-ui";

/**
 * A pasted list, one task per line (capture.md P2): shown in place of the
 * sheet's scroll region before anything is saved, so 'buy milk / eggs tmr /
 * bread' reads as three tasks with only the second dated, not one garbled
 * one. Each row is the title the parser will store, where it will probably
 * go (the board's own rule on the line's shape; the toast names the
 * server's), a dashed 'Must · needs a day' when its '!' has nothing to be
 * judged on, and a 40 px × to leave it out. Add N and Cancel sit where Add
 * always does.
 */

interface Props {
  lines: string[];
  truncated: boolean;
  today: DayKey;
  onRemove: (index: number) => void;
}

export function PastePreview({ lines, truncated, today, onRemove }: Props) {
  const rows = useMemo(
    () =>
      lines.map((line) => {
        const parsed = parseCapture(line, { today });
        return { line, parsed, where: parsed.title ? wherePreviewOf(parsed, today).label : null };
      }),
    [lines, today]
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
              <span className="capture-added-title">{r.parsed.title || r.line}</span>
              <span className="capture-added-meta">
                {r.where ?? "Needs a few words for a title"}
                {r.parsed.compulsoryWarning && (
                  <>
                    {" "}
                    <span className="chip capture-chip" data-warn="1">
                      {PASTE_MUST_NOTE}
                    </span>
                  </>
                )}
              </span>
            </span>
            <IconButton icon="x" label={`Leave out “${r.line}”`} onClick={() => onRemove(i)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
