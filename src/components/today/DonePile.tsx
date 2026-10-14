"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { DONE_PILE_FOLDED, type DonePile as DonePileView } from "./board-ui";

/**
 * Done today: where a ticked row rests once it has left its lane (board-ui
 * donePileOf). The heading says "Done today · 5 · +23.4 XP" (a work tab
 * "Done today · 3": work pays no XP); folded, it shows the latest three as
 * compact rows (title, the time it was kept, what it paid, Undo while its
 * window is open), and "Show n more" opens the rest. Presentation only:
 * every lane keeps its honest count, and every count the day keeps is the
 * same. Nothing at 0. The rows are the board's own TaskRows (variant
 * "pile"), so the drawer, the receipt and the Undo work exactly as in a lane.
 */
export function DonePile({
  idBase = "done-today",
  pile,
  open,
  hidden,
  onToggle,
  className,
  children,
}: {
  /** Its ids' stem (the board has one; a fixture page several). */
  idBase?: string;
  pile: DonePileView;
  /** The rest are shown too. */
  open: boolean;
  /** Rows folded away (donePileShown). */
  hidden: number;
  onToggle: () => void;
  className?: string;
  /** The rows to draw (the latest three while folded). */
  children?: ReactNode;
}) {
  if (pile.count === 0) return null;
  return (
    <section className={cx("card today-done", className)} aria-labelledby={`${idBase}-h`} data-count={pile.count}>
      <h2 id={`${idBase}-h`} className="done-h">
        <Icon name="check" className="done-glyph" />
        <span aria-hidden="true">
          <b>Done today</b>
          <span className="done-figs num"> · {pile.figures}</span>
        </span>
        <span className="sr-only">{pile.speech}</span>
      </h2>
      <div id={`${idBase}-rows`} className="done-rows">
        {children}
      </div>
      {pile.count > DONE_PILE_FOLDED && (
        <button type="button" className="done-more" aria-expanded={open} aria-controls={`${idBase}-rows`} onClick={onToggle}>
          {open ? "Show fewer" : `Show ${hidden} more`}
          <Icon name="chev" size={14} className={cx("ink-2 chev", open && "open")} />
        </button>
      )}
    </section>
  );
}
