"use client";

import { useRef, type ReactNode } from "react";
import { useMiniLedger } from "@/components/shell/MiniLedger";
import { Icon } from "@/components/ui/Icon";
import { CapacityFigure, LedgerFigure, capacityLabel, type DayLedgerProps } from "./DayLedger";
import { fmtMinutes } from "./format";

export interface PlanCardProps {
  planned: DayLedgerProps["planned"];
  /** Opens the Capacity sheet. */
  onCapacity: () => void;
  /** Life XP paid today: the ticks' "+N" tokens land on this cell ([data-ledger-target="xp"]). */
  xp: number;
  /** Review points today: published to the top bar's MiniLedger only (Today draws no review cell). */
  pts: number;
  /** Yesterday's open occurrences ("Record yesterday · 2 open"). */
  yesterdayOpen: number;
  onYesterday: () => void;
  /** Publishes the figures to the top-bar MiniLedger (off on /dev/style fixtures). */
  publish?: boolean;
  /** The Tasks section's Asks badge (record yesterday, the weekly review), in the card's corner. */
  children?: ReactNode;
}

/**
 * Today's plan card (the Tasks section): the day's planned time against its
 * capacity (a tap opens the Capacity sheet), the life XP the day's ticks have
 * paid (the landing cell of every tick's token, so a flight always lands, and
 * the top bar's MiniLedger docks once it scrolls away), and Record yesterday,
 * always one tap away. The streak and the Full day live on Character (/you);
 * review points on Ideas.
 */
export function PlanCard({ planned, onCapacity, xp, pts, yesterdayOpen, onYesterday, publish = true, children }: PlanCardProps) {
  const cellsRef = useRef<HTMLDivElement | null>(null);
  const noWatch = useRef<HTMLDivElement | null>(null);
  useMiniLedger(publish ? { xp, pts } : null, publish ? cellsRef : noWatch);
  const over = planned.chosen && planned.over > 0;
  return (
    <section className="card today-plan" aria-label="Today's plan">
      <div className="plan-cells" ref={cellsRef}>
        <button type="button" className="plan-cell plan-cap" onClick={onCapacity} aria-haspopup="dialog" aria-label={capacityLabel(planned)}>
          <CapacityFigure planned={planned} />
          <span className="k">{over ? `over by ${fmtMinutes(planned.over)}` : planned.chosen ? "planned of capacity" : "planned · set capacity"}</span>
        </button>
        <div className="plan-cell">
          <LedgerFigure kind="xp" value={xp} publishTarget={publish} />
          <span className="k">life XP today</span>
        </div>
      </div>
      {/* Always one tap away: what was due yesterday, and anything else forgotten (a tick counts on yesterday). */}
      <button type="button" className="plan-y" aria-haspopup="dialog" onClick={onYesterday}>
        <Icon name="undo" size={16} className="ink-2" />
        <span>Record yesterday{yesterdayOpen > 0 ? ` · ${yesterdayOpen} open` : ""}</span>
        <Icon name="chev" size={14} className="ink-2" />
      </button>
      {children}
    </section>
  );
}
