/**
 * GlyphLane (ui-motion.md §4.5, D25): who did what on a draft, with the
 * visible who-word. Server-safe.
 *
 *   <GlyphLane who="gemini" items={["Domains", "order", "picks"]}/>  → [pv.suggest] Gemini: Domains · order · picks
 *   <GlyphLane who="app" items={["practices", "words", "numbers"]}/>  → [pv.app] App: practices · words · numbers
 *
 * Gemini's items come from geminiV4PartsOf (needs, order, picks): an item Gemini did not touch on
 * this draft is not listed, and a Gemini lane with nothing to list is not drawn. The full lead
 * line is in the lanes' (i); `full` adds it sr-only only when no (i) carries it.
 */
import { cx } from "@/components/ui/cx";
import { Glyph } from "./Glyph";

export interface GlyphLaneProps {
  who: "gemini" | "app";
  /** One- or two-word items. */
  items: readonly string[];
  /** The who-word; default "Gemini:" / "App:" (GEMINI_LANE_WORD / APP_LANE_WORD in R0). */
  whoWord?: string;
  full?: string;
  defs?: string;
  className?: string;
}

export const LANE_WORDS = { gemini: "Gemini:", app: "App:" } as const;

export function GlyphLane({ who, items, whoWord, full, defs, className }: GlyphLaneProps) {
  if (who === "gemini" && items.length === 0) return null;
  return (
    <div className={cx("mg-lane", className)} data-who={who}>
      <Glyph name={who === "gemini" ? "pv.suggest" : "pv.app"} size={16} defs={defs} inherit />
      <span className="mg-lane-w" data-wc="honest">
        {whoWord ?? LANE_WORDS[who]}
      </span>
      <span className="mg-lane-i">{items.join(" · ")}</span>
      {full && <span className="sr-only">{full}</span>}
    </div>
  );
}
