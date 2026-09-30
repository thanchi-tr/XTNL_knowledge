"use client";

/**
 * FROZEN CONTRACT — PromiseRing (L0-foundation).
 *
 *   <PromiseRing value={2} target={3} size={40} label="Musts" closed? glint? dashed? lap={120} from={lastSeen}/>
 *
 *   ONLY for fixed targets: Musts n/m, Quest n/15, Life deed n/1, weekly Move
 *   n/150 (pro-rated for rest days), and the recap quest. Never a backlog ring.
 *   SVG with pathLength=100: track at ink 10%, value in ink-0 with round caps.
 *   closed = kept stroke + check (closed defaults to value ≥ target).
 *   glint  = the T1 close: one 4.5% overshoot + one white glint lap (effects.css).
 *   empty (value 0) hides the value stroke. dashed track = calibrating.
 *   lap    = the unpaid second lap (ink at 55%, butt caps), in the same units as value.
 *   Sizes: 34 (toast), 40 (Day ledger), 56, 64, 128 (Train).
 *   `showCount` prints "n" in the centre; pass children for a custom centre.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { play } from "@/lib/motion";
import { cx } from "./cx";
import { Icon } from "./Icon";

interface PromiseRingProps {
  value: number;
  target: number;
  size?: 34 | 40 | 44 | 56 | 64 | 128 | number;
  /** Accessible name of the target ("Musts"). */
  label: string;
  closed?: boolean;
  glint?: boolean;
  dashed?: boolean;
  /** Value on the unpaid second lap (e.g. 240 of a 150 target shows 90 of the next lap, pays nothing). */
  lap?: number;
  /** Last-seen value: the stroke draws from here once after mount. */
  from?: number | null;
  showCount?: boolean;
  children?: ReactNode;
  className?: string;
}

const pctOf = (v: number, t: number) => (t > 0 ? Math.max(0, Math.min(100, (v / t) * 100)) : 0);

export function PromiseRing({
  value,
  target,
  size = 44,
  label,
  closed,
  glint,
  dashed,
  lap,
  from,
  showCount,
  children,
  className,
}: PromiseRingProps) {
  const valRef = useRef<SVGCircleElement | null>(null);
  const p = pctOf(value, target);
  const isClosed = closed ?? (target > 0 && value >= target);
  const p2 = lap != null && target > 0 ? Math.max(0, Math.min(100, ((lap - target) / target) * 100)) : 0;
  const sw = size >= 100 ? 7 : size <= 36 ? 4 : 4.5;

  useEffect(() => {
    if (from == null) return;
    const f = pctOf(from, target);
    if (f === p) return;
    void play(valRef.current, [{ strokeDashoffset: String(100 - f) }, { strokeDashoffset: String(100 - p) }], { duration: 600, fill: "backwards" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  return (
    <div
      className={cx("pring", isClosed && "closed", glint && "glinting", dashed && "dashed", p === 0 && "empty", className)}
      style={{ ["--sz" as string]: `${size}px`, ["--p" as string]: p, ["--p2" as string]: p2, ["--sw" as string]: sw }}
      role="img"
      aria-label={`${label}: ${Math.min(value, target)} of ${target}${isClosed ? ", closed" : ""}${dashed ? ", calibrating" : ""}`}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="trk" cx="18" cy="18" r="15.9" pathLength={100} />
        <circle ref={valRef} className="val" cx="18" cy="18" r="15.9" pathLength={100} />
        {p2 > 0 && <circle className="lap" cx="18" cy="18" r="15.9" pathLength={100} />}
        <circle className="glint" cx="18" cy="18" r="15.9" pathLength={100} />
      </svg>
      <div className="ctr" aria-hidden="true">
        {children ?? (showCount ? <span className="n num">{value}</span> : null)}
        {!children && <Icon name="check" />}
      </div>
    </div>
  );
}
