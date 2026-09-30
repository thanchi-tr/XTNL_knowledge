"use client";

/**
 * FROZEN CONTRACT — Meter and SegmentStrip (L0-foundation).
 *
 *   <Meter value={0.62} from={lastSeen} gain={{ value: 0.72, kind: "xp" }} cap={0.88} thin? label="Duty level 7"/>
 *     One component: 8 px (6 thin), sunken track with a line-2 inset.
 *     base in ink-0 (scaleX); an optional gain segment in the currency that fed it
 *     (xp for life tracks, pts for Knowledge and domains); an optional cap tick.
 *     `from` (e.g. useLastSeen) animates old → new over 700 ms through the motion
 *     gateway, once; Still shows the final state. There is no daily life-XP meter.
 *
 *   <SegmentStrip segs={["on","on","miss","cur","off"]} tall? label="Quest 3 of 15"/>
 *     on = ink-0; miss = hatched owed with an outline (never colour alone); cur = ink outline.
 */
import { useEffect, useRef } from "react";
import { play } from "@/lib/motion";
import { cx } from "./cx";

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

interface MeterProps {
  /** 0..1 banked. */
  value: number;
  /** 0..1 last-seen; animates from here once after mount. */
  from?: number | null;
  /** This week's gain on top of the base, in the currency that fed it. */
  gain?: { value: number; from?: number | null; kind: "xp" | "pts" };
  /** 0..1 position of the cap tick. */
  cap?: number;
  thin?: boolean;
  /** Accessible name ("Duty, level 7, 62% to 8"). */
  label: string;
  /** aria-valuetext override; defaults to the percentage. */
  valueText?: string;
  className?: string;
}

export function Meter({ value, from, gain, cap, thin, label, valueText, className }: MeterProps) {
  const baseRef = useRef<HTMLElement | null>(null);
  const gainRef = useRef<HTMLElement | null>(null);
  const v = clamp01(value);
  const g = gain ? clamp01(gain.value) : null;

  useEffect(() => {
    if (from != null && clamp01(from) !== v) {
      void play(baseRef.current, [{ transform: `scaleX(${clamp01(from)})` }, { transform: `scaleX(${v})` }], { duration: 700, fill: "backwards" });
    }
    if (gain && gain.from != null && g != null && clamp01(gain.from) !== g) {
      void play(gainRef.current, [{ transform: `scaleX(${clamp01(gain.from)})` }, { transform: `scaleX(${g})` }], { duration: 700, fill: "backwards" });
    }
    // Only on mount and when the last-seen value arrives: later value changes use the CSS transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, gain?.from]);

  return (
    <div
      className={cx("meter", thin && "thin", className)}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-valuetext={valueText ?? `${Math.round(v * 100)}%`}
    >
      {g != null && <i ref={gainRef} className={cx("gain", gain?.kind === "pts" && "pts")} style={{ ["--v" as string]: g }} />}
      <i ref={baseRef} className="base" style={{ ["--v" as string]: v }} />
      {cap != null && <span className="cap" style={{ ["--at" as string]: `${clamp01(cap) * 100}%` }} />}
    </div>
  );
}

export type Segment = "on" | "miss" | "cur" | "off";

export function SegmentStrip({ segs, tall, label, className }: { segs: Segment[]; tall?: boolean; label: string; className?: string }) {
  return (
    <div className={cx("segs", tall && "tall", className)} role="img" aria-label={label}>
      {segs.map((s, i) => (
        <i key={i} className={s === "off" ? undefined : s} />
      ))}
    </div>
  );
}
