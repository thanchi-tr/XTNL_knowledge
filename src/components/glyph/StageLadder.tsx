"use client";

/**
 * StageLadder (ui-motion.md §4.5, D6): the aria-hidden visual twin of the
 * Depth radio group (the radios stay the control). An HTML/CSS grid,
 * repeat(12, 1fr), 100% of the content box (≈ 23 px a rung at 278; 32 px from
 * 600 px of container), 56 px tall, so its 12 px numerals never scale.
 *
 *   gate rungs 4, 6, 8, 10, 12 carry a 12 px cairn above and a 12 px HTML numeral below;
 *   ink-0 up to the chosen depth, ink-mute above; a ⚑ (the kit's i-flag) at the exam level;
 *   the gap bar is a %-positioned SVG line (no viewBox, no text). Hidden on track plans.
 *
 * `ladder` (ACT): when the chosen depth changes after mount (the user's pick), the rungs light up
 * to it (20 ms a rung) and the gap bar draws. Nothing on arrival.
 */
import { useEffect, useRef } from "react";
import { cx } from "@/components/ui/cx";
import { playGlyph } from "@/lib/glyph-motion";
import { Glyph, Mark } from "./Glyph";
import { GATE_LEVEL, STAGE_GATES, type StageName } from "./paths/stage";

export interface StageLadderProps {
  /** The chosen depth (level): rungs up to it are lit. */
  chosen: number;
  /** Rungs drawn. Default 12. */
  depth?: number;
  /** The exam's level (a ⚑). */
  exam?: number | null;
  /** The review gap at the chosen depth: draws the gap bar (its words, «review gap ≈ 110 d», sit beside). */
  gapDays?: number | null;
  /** A track plan has no levels: nothing is drawn. */
  track?: boolean;
  className?: string;
}

const GATE_AT = new Map(STAGE_GATES.map((g) => [GATE_LEVEL[g], g] as const));

export function StageLadder({ chosen, depth = 12, exam, gapDays, track, className }: StageLadderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current != null && prev.current !== chosen) void playGlyph(ref.current, "ladder", { licence: "ACT" });
    prev.current = chosen;
  }, [chosen]);
  if (track) return null;
  const n = Math.max(1, Math.min(12, Math.round(depth)));
  const at = Math.max(0, Math.min(n, Math.round(chosen)));
  return (
    <div ref={ref} className={cx("mg-sl", className)} aria-hidden="true" data-chosen={at} style={{ ["--sl-n" as string]: n }}>
      <div className="mg-sl-g">
        {Array.from({ length: n }, (_, i) => {
          const level = i + 1;
          const gate = GATE_AT.get(level);
          const on = level <= at;
          return (
            <div key={level} className="mg-sl-c" data-on={on ? "" : undefined} data-level={level}>
              <span className="mg-sl-gl">{gate ? <Glyph name={`stage.${gate}` as StageName} size={12} inherit /> : null}</span>
              <span className="mg-sl-r" data-on={on ? "" : undefined} />
              <span className="mg-sl-n">{gate ? level : ""}</span>
              {exam === level && (
                <span className="mg-sl-ex">
                  <Mark glyph="i-flag" size={12} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {gapDays != null && at > 0 && (
        <svg className="mg-sl-gap" width="100%" height="8" aria-hidden="true" focusable="false">
          <line x1="1%" x2={`${Math.max(1.5, (at / n) * 100 - 2)}%`} y1="4" y2="4" pathLength={100} />
        </svg>
      )}
    </div>
  );
}
