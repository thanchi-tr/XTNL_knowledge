"use client";

import type { ReactNode, RefObject } from "react";
import { cx } from "@/components/ui/cx";

/**
 * A lane on the board: an eyebrow header with a diamond mark and "n of m
 * kept", then its rows on one card. The Must lane's mark is an ink
 * diamond; once every row in it is kept the mark fills kept and a KEPT
 * stamp sits in the header (it lands once, with one line sweep across the
 * card, when the board says it just happened).
 */
export function Lane({
  id,
  title,
  count,
  must,
  kept,
  landing,
  bodyRef,
  className,
  note,
  children,
}: {
  id: string;
  title: string;
  /** "0 of 3 kept". */
  count?: ReactNode;
  must?: boolean;
  /** Every row kept: the diamond fills and the stamp shows. */
  kept?: boolean;
  /** The stamp is landing and the line sweeps now. */
  landing?: boolean;
  bodyRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** A line above the rows ("Board clear."). */
  note?: ReactNode;
  children?: ReactNode;
}) {
  const hid = `lane-${id}`;
  return (
    <section className={cx("today-lane", must && "lane-must", kept && "kept", landing && "fresh", className)} aria-labelledby={hid} data-lane={id}>
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
      <div ref={bodyRef} className="card lane-body">
        {note}
        {children}
      </div>
    </section>
  );
}
