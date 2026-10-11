"use client";

import type { ReactNode, RefObject } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A lane on the board: an eyebrow header with a diamond mark and "n of m
 * kept", then its rows on one card. The Must lane's diamond and name wear
 * --must, the Habits lane's --habit (the colour code its rows' rails and
 * rings repeat); the other lanes stay ink. Once every row in the Must lane is
 * kept the mark fills kept and a KEPT stamp sits in the header (it lands
 * once, with one line sweep across the card, when the board says it just
 * happened).
 */
export function Lane({
  id,
  title,
  count,
  must,
  habit,
  kept,
  landing,
  bodyRef,
  className,
  note,
  badge,
  children,
}: {
  id: string;
  title: string;
  /** "0 of 3 kept". */
  count?: ReactNode;
  must?: boolean;
  /** The Habits lane: its diamond and name wear --habit. */
  habit?: boolean;
  /** Every row kept: the diamond fills and the stamp shows. */
  kept?: boolean;
  /** The stamp is landing and the line sweeps now. */
  landing?: boolean;
  bodyRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** A line above the rows ("Board clear."). */
  note?: ReactNode;
  /** Chips under the header (M2: 'Rest · nothing owed', 'Musts carry stakes from Mon 12 Oct'). Never owed-toned. */
  badge?: ReactNode;
  children?: ReactNode;
}) {
  const hid = `lane-${id}`;
  return (
    <section className={cx("today-lane", must && "lane-must", habit && "lane-habit", kept && "kept", landing && "fresh", className)} aria-labelledby={hid} data-lane={id}>
      <div className="lane-h">
        <span className="lane-mark" aria-hidden="true" />
        <h2 id={hid}>{title}</h2>
        {kept && (
          <span className={cx("stamp lane-stamp", landing && "landing")} aria-hidden="true">
            Kept
          </span>
        )}
        {count != null && <span className="lane-count num">{count}</span>}
      </div>
      {badge && <div className="lane-chips">{badge}</div>}
      <div ref={bodyRef} className="card lane-body">
        {note}
        {children}
      </div>
    </section>
  );
}
