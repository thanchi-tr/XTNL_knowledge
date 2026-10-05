"use client";

/**
 * RankSeal (ui-motion.md §4.4 Rank, §4.5, D5, D18). The notched medallion
 * at 34, 40, 48 or 72 px. Ink only; no padlock; no numeral (nothing under 12 px).
 *
 *   <RankSeal index={2} top={6} size={48} state="done" seenKey={…} label?/>
 *     state  idle (not reached / beyond the plan's top / Paragon on a draft) · active (the next rank,
 *            "gives") · done (held for good)
 *     label  standing alone: role="img" with the full words ("Aim rank Aspirant, 2 of 7, kept for good",
 *            rankSealLabel). Beside its label (the usual case) it is aria-hidden and the label carries
 *            the sr ", 2 of 7, kept for good" (rankSr).
 *     At 48 px and up, a 7-pip ladder: held pips solid, the next one a ring, beyond-plan pips ink-mute.
 *
 * rank-rise (SEEN): only when the counted held index rises above the last-seen one, on a held
 * (done) seal, once per viewer on whichever surface sees it first (the key's `what` is "rank",
 * never a surface). A pending reach moves no rank, so it never plays. One announce per event.
 */
import { useRef, type CSSProperties } from "react";
import { cx } from "@/components/ui/cx";
import { Glyph, type GlyphState } from "./Glyph";
import { RANK_WORDS, type RankName } from "./paths/rank";
import { usePlayOnSeen, type SeenKey } from "./useSeen";

export const RANK_SIZES = [34, 40, 48, 72] as const;
export type RankSize = (typeof RANK_SIZES)[number];

/** ", 2 of 7, kept for good" (held) or ", 3 of 7" — the sr tail a rank label carries. */
export function rankSr(index: number, held: boolean): string {
  return `, ${index + 1} of 7${held ? ", kept for good" : ""}`;
}
/** The full words of a seal standing alone. */
export function rankSealLabel(index: number, held: boolean): string {
  return `Aim rank ${RANK_WORDS[Math.max(0, Math.min(6, index))]}${rankSr(index, held)}`;
}

/** Plays only on a counted rise: a last-seen index exists and the held index is above it. */
export function rankRiseDecision(from: number | null, to: number): boolean {
  return from != null && Number.isFinite(from) && to > from;
}

export interface RankSealProps {
  /** 0 Initiate … 6 Paragon. */
  index: number;
  /** The plan's top rank index (pips above it are beyond the plan). Default 6. */
  top?: number;
  size?: RankSize;
  state?: GlyphState;
  /** The roadmap's seen key (its `what` is always "rank"); none in fixtures. */
  seenKey?: Omit<SeenKey, "what"> | null;
  /** Standing alone: role="img" with these words (rankSealLabel). */
  label?: string;
  className?: string;
}

export function RankSeal({ index, top = 6, size = 40, state = "done", seenKey, label, className }: RankSealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const N = Math.max(0, Math.min(6, Math.round(index)));
  const name = RANK_WORDS[N];
  const key = seenKey && state === "done" ? { ...seenKey, what: "rank" } : null;
  usePlayOnSeen(ref, key, N, "rank-rise", {
    seed: seenKey ? `aimrank:${seenKey.roadmapId}:${N}` : undefined,
    name,
    label: `Aim rank ${name} reached`,
    when: rankRiseDecision,
  });
  const held = state === "done" ? N : state === "active" ? N - 1 : -1;
  return (
    <span
      ref={ref}
      className={cx("mg-rs", `mg-rs-${size}`, className)}
      data-rank={N}
      data-s={state}
      style={{ "--rs": `${size}px` } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Glyph name={`rank.${N}` as RankName} state={state} size={size} />
      {size >= 48 && (
        <span className="mg-rs-pips" aria-hidden="true">
          {RANK_WORDS.map((_, i) => (
            <i
              key={i}
              className="mg-rs-pip"
              data-on={i <= held ? "" : undefined}
              data-next={i === held + 1 && i <= top && state !== "idle" ? "" : undefined}
              data-beyond={i > top ? "" : undefined}
            />
          ))}
        </span>
      )}
    </span>
  );
}
