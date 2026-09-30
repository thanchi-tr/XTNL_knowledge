"use client";

import type { ReactNode } from "react";
import type { BoardRow } from "@/lib/today-board";
import type { Receipt } from "@/lib/life-types";
import { themeFor } from "@/lib/attribute-themes";
import { habitLine } from "@/lib/habit";
import { BAND_LABEL, TRACK_LABEL, fmtXp } from "./format";

interface Props {
  row: BoardRow;
  /** What a tick pays now: the row's projection, re-priced live when the drawer's minutes change. */
  projection: Receipt;
  drawerOpen: boolean;
  undoable: boolean;
  /** A write for this row is in flight: the tick waits for it rather than queueing a second. */
  busy: boolean;
  onTick: () => void;
  onUndo: () => void;
  onToggleDrawer: () => void;
  onToggleReceipt: () => void;
  /** The minimum version, one tap from a Must row. */
  onMinimum?: () => void;
  /** The receipt, when open (rendered by the board). */
  receipt?: ReactNode;
  /** The drawer, when open. */
  children?: ReactNode;
}

type Tone = "amber" | "red" | "blue" | "green" | undefined;

function Chip({ tone, children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className="today-chip" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

/**
 * One line on the board: a 44 px tick, the title, what it is, and exactly
 * what it pays.
 *
 * The figure on the right is the price, not a guess: '≈ N XP' is the same
 * `planCompletion` the server pays with, against the same day's ledger, and
 * it turns green and loses its '≈' once paid. Tapping it opens the receipt.
 * A tap on the tick completes at the estimate; minutes, the minimum version,
 * skip and the rest live behind '…' so the common case stays one tap.
 */
export function TaskRow(props: Props) {
  const { row, projection, drawerOpen, undoable, busy } = props;
  const t = row.template;
  const done = row.state === "done";
  const paidXp = row.paid ? row.paid.xp : null;
  const shownXp = done && paidXp != null ? paidXp : projection.xp;
  const study = !!row.auto;

  let tickLabel: string;
  if (row.state === "locked") tickLabel = `${t.title} completes itself at ${row.progress?.label ?? "its target"}`;
  else if (done) tickLabel = undoable ? `Undo ${t.title}` : `${t.title}, done`;
  else if (row.state === "skipped") tickLabel = `Complete ${t.title} (skipped today)`;
  else tickLabel = `Complete ${t.title}`;

  const meta: string[] = [];
  // A run that reaches the edge of the history read is a floor, and says so.
  if (row.streak && row.streak.days > 0) meta.push(`${Math.round(row.streak.days)}d${row.streak.capped ? "+" : ""}`);
  if (row.strength != null) meta.push(habitLine(row.strength));
  if (row.progress) meta.push(row.progress.label);
  if (row.timesDone > 1) meta.push(`×${row.timesDone} today`);
  if (study && done) meta.push("paid by reviews");

  const attribute = t.topAttribute ? themeFor(t.topAttribute) : null;
  const dueTone: Tone = row.late ? "red" : row.dueLabel === "by today" ? "amber" : undefined;

  return (
    <div className="today-row-wrap">
      <div className="today-row" data-state={row.state} data-lane={row.lane}>
        <button
          type="button"
          className="today-tick"
          data-state={row.state}
          aria-label={tickLabel}
          aria-pressed={done}
          disabled={busy || row.state === "locked" || (done && !undoable)}
          onClick={done ? props.onUndo : props.onTick}
        >
          <span className="today-tick-ring" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path className="today-tick-check" d="M2.5 7.4 5.6 10.3 11.5 3.9" />
            </svg>
          </span>
        </button>

        <div className="today-row-main">
          <div className="today-row-title">{t.title}</div>

          <div className="today-chips">
            {row.ruleLabel && <Chip>{row.ruleLabel}</Chip>}
            {t.compulsory && row.lane !== "must" && <Chip tone="amber">must</Chip>}
            {row.dueLabel && <Chip tone={dueTone}>{row.dueLabel}</Chip>}
            {row.parentTitle && <Chip title="Counts toward this goal">^{row.parentTitle}</Chip>}
            <Chip title={`${BAND_LABEL[t.band]} band${t.bandOverride !== 0 ? " (self-rated)" : ""}`}>
              {BAND_LABEL[t.band]}
              {t.bandOverride > 0 ? " +1" : t.bandOverride < 0 ? ` ${t.bandOverride}` : ""}
            </Chip>
            <Chip title={attribute ? `Mostly trains ${attribute.attribute.toLowerCase().replace(/_/g, " ")}` : undefined}>
              {attribute && <span className="today-dot" style={{ background: attribute.color }} aria-hidden />}
              {TRACK_LABEL[t.track]}
            </Chip>
            {t.intrinsic && <Chip tone="blue">#play</Chip>}
            {t.sizing && <Chip tone="blue">sizing…</Chip>}
          </div>

          {(meta.length > 0 || (done && undoable) || (props.onMinimum && row.state === "open")) && (
            <div className="today-row-meta">
              {meta.join(" · ")}
              {props.onMinimum && row.state === "open" && t.mvv && (
                <button type="button" className="today-undo" style={{ color: "var(--amber)" }} onClick={props.onMinimum} disabled={busy}>
                  {meta.length > 0 ? " · " : ""}Minimum: {t.mvv}
                </button>
              )}
              {done && undoable && (
                <button type="button" className="today-undo" onClick={props.onUndo} disabled={busy}>
                  Undo
                </button>
              )}
            </div>
          )}
        </div>

        <div className="today-row-side">
          <button
            type="button"
            className="today-xp mono"
            data-paid={done && paidXp != null ? "1" : undefined}
            data-zero={shownXp === 0 ? "1" : undefined}
            onClick={props.onToggleReceipt}
            title={done ? "What this paid" : "What a tick pays now"}
          >
            {done && paidXp != null ? "" : "≈ "}
            {fmtXp(shownXp)} XP
          </button>
          <button
            type="button"
            className="today-more"
            aria-expanded={drawerOpen}
            aria-label={`More for ${t.title}`}
            onClick={props.onToggleDrawer}
          >
            ···
          </button>
        </div>
      </div>
      {props.receipt}
      {drawerOpen && props.children}
    </div>
  );
}
