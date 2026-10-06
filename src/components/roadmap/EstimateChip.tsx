"use client";

/**
 * The estimate chip (roadmap revision 5, lane 9; ui-motion.md §15.4, D40,
 * H19; contracts §22.11, ruling 63). It renders a RatingView wherever the
 * layer count shows: the map card's heading, the chain's heading and the
 * draft's Depth and date card.
 *
 *   [pv.you] 4 layers · yours        first, when the plan's layers are yours (a SET or FEWER change)
 *   «4 layers · Gemini's estimate»   estimate-gemini (Gemini's own number; the who-word never goes away)
 *   «Gemini unsure · 3–5 layers»     estimate-unsure, with a bracket under pips low…high
 *   «App's rough estimate · no Gemini»  estimate-app, then "≈ 3 layers · your map fills 1" (advice only)
 *   · its map filled 3               static honesty words when Gemini's map filled fewer (data-wc="honest")
 *   ●●●●○○                           6 HTML pips, 12 px, aria-hidden; the spoken twin "4 layers of 6"
 *
 * The chip is a HonestyChip button; its panel (the (i)) holds, in order: the lead line (the only place
 * "difficulty" appears), the reason labels and "3 replies: 4, 4, 5", the breadth and its room, "its map
 * filled 4", each change with its day, the one-tap choices (1 reply; unsure's low…high, the current one
 * pressed) and [Change…] (setLayers, 1–6).
 *
 * Motion: `estimate-swap` (CHANGED) when the stored layers or origin differ from what this viewer last saw
 * (seen `what` "estimate"); nothing else moves. The pips never fill, draw or count (D40).
 */
import { useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { Fig } from "@/components/glyph/GlyphStat";
import { ProvMark } from "@/components/glyph/Glyph";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { usePlayOnSeen, type SeenKey } from "@/components/glyph/useSeen";
import { LAYERS_MAX, LAYERS_MIN, RATING_REASON_LABEL, topicSwitchesOf, type RatingView } from "@/lib/roadmap-types";
// Fix round: [Rate again] (rateAgain: a new estimate, then the chain as [Break it down]; only while the chain's switch is on).
import { RATE_AGAIN_WORD } from "./roadmap-copy";
import {
  CHANGE_LAYERS_WORD,
  ESTIMATE_APP_LEAD,
  ESTIMATE_PANEL_LEAD,
  appEstimateFigure,
  estimateBreadthLine,
  estimatePipsSr,
  estimateRepliesLine,
  estimateYoursLabel,
  itsMapFilledLine,
  layerChangeLine,
  layerChangeShort,
  oneReplyLine,
  pickLayersWord,
  yourMapFillsLine,
} from "./roadmap-copy";
import { useRoadmapAction } from "./roadmap-runtime";
import { estimateChipOf } from "./topic-map-model";

export interface EstimateChipProps {
  rating: RatingView;
  /** The roadmap the chip's [Change…] and one-tap choices write to (setLayers); null: read-only (a plan). */
  roadmapId?: string | null;
  /** The seen key's roadmap and basis (the plan version, or "draft/{version}"); `what` is "estimate". */
  seenKey?: Omit<SeenKey, "what"> | null;
  /** The chain heading's tail, after the chip: "· +1 to reach Fluent". */
  tail?: string | null;
  today?: string;
  /** A stable panel id. */
  id?: string;
  className?: string;
}

/** The 6 pips: K solid, the rest hollow; for unsure, a bracket under low…high. aria-hidden; the twin is sr-only. */
export function EstimatePips({ layers, unsure }: { layers: number; unsure: { low: number; high: number } | null }) {
  return (
    <span className="rm-est-pips">
      <span className="rm-est-pp" aria-hidden="true">
        {Array.from({ length: LAYERS_MAX }, (_, i) => (
          <i key={i} data-on={i < layers ? "" : undefined} data-br={unsure && i + 1 >= unsure.low && i + 1 <= unsure.high ? "" : undefined} />
        ))}
      </span>
      <span className="sr-only">{estimatePipsSr(layers, unsure, LAYERS_MAX)}</span>
    </span>
  );
}

export function EstimateChip({ rating, roadmapId, seenKey, tail, today, id, className }: EstimateChipProps) {
  const m = estimateChipOf(rating);
  const ref = useRef<HTMLSpanElement>(null);
  const [changing, setChanging] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  usePlayOnSeen(ref, seenKey ? { ...seenKey, what: "estimate" } : null, `${rating.layers}:${rating.origin}`, "estimate-swap");
  const set = (n: number) => {
    if (!roadmapId) return;
    run((a) => a.setLayers(roadmapId, { kind: "SET", layers: n }), () => setChanging(false));
  };
  const app = m.kind === "estimate-app";
  const choices: number[] = rating.unsure ? Array.from({ length: rating.unsure.high - rating.unsure.low + 1 }, (_, i) => rating.unsure!.low + i) : rating.oneReply != null ? [rating.oneReply] : [];
  const panel = (
    <>
      <span className="rm-est-l">{app ? ESTIMATE_APP_LEAD : ESTIMATE_PANEL_LEAD}</span>
      {!app && rating.reasons.length > 0 && <span className="rm-est-l">{rating.reasons.map((r) => RATING_REASON_LABEL[r]).join(" · ")}</span>}
      {!app && rating.replies.length > 0 && <span className="rm-est-l">{estimateRepliesLine(rating.replies)}</span>}
      {!app && <span className="rm-est-l">{estimateBreadthLine(rating.breadth, rating.room)}</span>}
      {rating.mapFilled != null && !app && <span className="rm-est-l">{itsMapFilledLine(rating.mapFilled)}</span>}
      {rating.changes.map((c, i) => (
        <span key={i} className="rm-est-l">
          {layerChangeLine(c, today)}
        </span>
      ))}
      {roadmapId && choices.length > 0 && (
        <span className="rm-est-ch">
          {choices.map((n) => (
            <button key={n} type="button" className="chip btn-chip" aria-pressed={n === rating.layers} disabled={pending} onClick={() => set(n)}>
              {rating.oneReply != null && !rating.unsure ? oneReplyLine(n) : pickLayersWord(n)}
            </button>
          ))}
        </span>
      )}
      {roadmapId && (
        <span className="rm-est-ch">
          <button type="button" className="chip btn-chip" aria-expanded={changing} onClick={() => setChanging((c) => !c)}>
            {CHANGE_LAYERS_WORD}
          </button>
          {changing &&
            Array.from({ length: LAYERS_MAX - LAYERS_MIN + 1 }, (_, i) => LAYERS_MIN + i).map((n) => (
              <button key={n} type="button" className="chip btn-chip" aria-pressed={n === rating.layers} disabled={pending} onClick={() => set(n)}>
                {pickLayersWord(n)}
              </button>
            ))}
        </span>
      )}
      {roadmapId && topicSwitchesOf().rate && (
        <span className="rm-est-ch">
          <button type="button" className="chip btn-chip" disabled={pending} onClick={() => run((a) => a.rateAgain(roadmapId))}>
            {RATE_AGAIN_WORD}
          </button>
        </span>
      )}
      {error && (
        <span role="alert" className="t-error act-err rm-est-l">
          {error}
        </span>
      )}
    </>
  );
  const changeWords = rating.changes.filter((c) => c.kind === "MERGED" || c.kind === "DEEPER").map(layerChangeShort);
  return (
    <span ref={ref} className={cx("rm-est", className)} data-est={m.kind}>
      {m.yours != null && (
        <span className="rm-est-yours">
          <ProvMark cls="you" size={12} />
          <span data-wc="honest">{estimateYoursLabel(m.yours)}</span>
        </span>
      )}
      <HonestyChip kind={m.kind} label={m.label} full={panel} id={id} wrap />
      {app ? (
        <span className="rm-est-app">
          <Fig compact={appEstimateFigure(rating.appEstimate)} />
          <span data-wc="honest">· {yourMapFillsLine(rating.mapFilled ?? rating.layers)}</span>
        </span>
      ) : (
        <EstimatePips layers={m.pips} unsure={m.unsure} />
      )}
      {m.mapFilled != null && <span data-wc="honest">· {itsMapFilledLine(m.mapFilled)}</span>}
      {changeWords.map((w, i) => (
        <span key={i} data-wc="honest">
          · {w}
        </span>
      ))}
      {tail && <span className="rm-est-tail">· {tail}</span>}
    </span>
  );
}
