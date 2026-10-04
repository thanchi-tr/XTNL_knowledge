"use client";

import { useRef, type ReactNode } from "react";
import type { BoardRow } from "@/lib/today-board";
import type { Receipt } from "@/lib/life-types";
import { habitLine } from "@/lib/habit";
import { Icon, Sigil } from "@/components/ui/Icon";
import { PricePill } from "@/components/ui/PricePill";
import { Tick, type TickState } from "@/components/ui/Tick";
import { cx } from "@/components/ui/cx";
import { TRACK_LABEL, TRACK_SIGIL, fmtMinutes, fmtXp } from "./format";
import { hhmmOf, pendingMetaOf, tickNameOf } from "./board-ui";
import type { RestKind } from "@/lib/duty-economy";

interface Props {
  row: BoardRow;
  /** What a tick pays now: the row's projection, re-priced live when the drawer's minutes change. */
  projection: Receipt;
  drawerOpen: boolean;
  undoable: boolean;
  /** A write for this row is in flight: the tick waits for it rather than queueing a second. */
  busy: boolean;
  /** The receipt sheet for this row is open. */
  receiptOpen: boolean;
  /** The receipt sheet's id, for the price pill's aria-controls. */
  receiptId: string;
  /** A rename on its way to the server: shown in place of the title until the answer lands. */
  pendingTitle?: string | null;
  /** Completes at the estimate; `from` is the price pill, where the "+N" token starts. */
  onTick: (from: Element | null) => void;
  onUndo: () => void;
  onToggleDrawer: () => void;
  onToggleReceipt: () => void;
  /** The minimum version, one tap from a Must row. */
  onMinimum?: (from: Element | null) => void;
  /** Just captured (the board found it after a capture or a '#t-<id>' link): outlined for a moment, and said. */
  justAdded?: boolean;
  /** M2: today's declaration (rest, sick, vacation), so a held row says so and an 'Even on rest days' must keeps 'must'. */
  restToday?: RestKind | null;
  /** The drawer, when open. */
  children?: ReactNode;
}

/**
 * One line on the board (redesign "Sigil & Slate"): a 64 px grid of
 * [tick][title + one meta line][price pill]. Everything else lives in the
 * drawer, which the title opens.
 *
 * The Tick is a checkbox: a circle for todos and habits, a diamond for
 * musts, half-filled for "Minimum kept". The pill on the right is the
 * price, not a guess: "≈ 3.6" is the same `planCompletion` the server pays
 * with, against the same day's ledger, and once ticked it reads "+3.6" on
 * the life-XP wash and says "paid 3.6 exactly". Tapping it opens the
 * receipt. Unchecking a done row inside its ten-minute window is the undo,
 * which nets to zero.
 */
export function TaskRow(props: Props) {
  const { row, projection, drawerOpen, undoable, busy } = props;
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const t = row.template;
  const done = row.state === "done";
  const paid = done && row.paid && !row.paid.undone ? row.paid : null;
  const shownXp = paid ? paid.xp : projection.xp;
  const study = !!row.auto;
  const title = props.pendingTitle ?? t.title;
  const must = row.lane === "must" || t.compulsory;
  const tickState: TickState = done ? (row.minimum ? "minimum" : "done") : "open";
  const minimum = props.onMinimum && row.state === "open" && t.mvv ? props.onMinimum : null;
  const drawerId = `drawer-${row.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;

  return (
    <div className="t-row" data-state={row.state} data-lane={row.lane} data-template-id={t.id} data-just-added={props.justAdded ? "1" : undefined}>
      <div className={cx("row", done && "done")}>
        <Tick
          shape={must ? "diamond" : "circle"}
          state={tickState}
          label={tickNameOf(row)}
          disabled={busy || row.state === "locked" || (done && !undoable)}
          onClick={done ? props.onUndo : () => props.onTick(pillRef.current)}
          data-skipped={row.state === "skipped" ? "1" : undefined}
        />

        <div className="r-main">
          <button type="button" className="r-open" aria-expanded={drawerOpen} aria-controls={drawerOpen ? drawerId : undefined} onClick={props.onToggleDrawer}>
            <span className="r-title today-row-title" data-pending={props.pendingTitle ? "1" : undefined}>
              {title}
              {props.pendingTitle && <span className="r-saving"> · saving…</span>}
              {props.justAdded && <span className="sr-only">, just added</span>}
            </span>
            <span className="r-meta">
              {done ? <DoneMeta row={row} paidXp={paid?.xp ?? null} study={study} /> : <OpenMeta row={row} restToday={props.restToday ?? null} />}
            </span>
          </button>
          {(minimum || (done && undoable)) && (
            <div className="r-acts">
              {minimum && (
                <button type="button" className="r-act" onClick={() => minimum(pillRef.current)} disabled={busy}>
                  Minimum: {t.mvv}
                </button>
              )}
              {done && undoable && (
                <button type="button" className="r-act" onClick={props.onUndo} disabled={busy} aria-label={`Undo ${t.title}`}>
                  <Icon name="undo" size={16} />
                  Undo
                </button>
              )}
            </div>
          )}
        </div>

        <PricePill
          ref={pillRef}
          value={shownXp}
          paid={!!paid}
          kind="xp"
          subject={t.title}
          expanded={props.receiptOpen}
          controls={props.receiptId}
          onClick={props.onToggleReceipt}
          aria-haspopup="dialog"
        />
      </div>
      {drawerOpen && (
        <div id={drawerId} className="r-drawer">
          {props.children}
        </div>
      )}
    </div>
  );
}

const HELD_WORD: Record<RestKind, string> = { REST: "rest day", SICK: "sick day", VACATION: "vacation" };

/** The one meta line of an open row: track sigil, rung or length, streak, goal, due with its clock. */
function OpenMeta({ row, restToday }: { row: BoardRow; restToday: RestKind | null }) {
  const t = row.template;
  const bits: string[] = [TRACK_LABEL[t.track]];
  if (row.strength != null) bits.push(habitLine(row.strength));
  else if (!row.auto) bits.push(fmtMinutes(row.estMinutes));
  // A run that reaches the edge of the history read is a floor, and says so.
  // M2: '12 days · repaired' after a restoring make-up, '12 days · held' after the minimum or an excused day.
  if (row.streak && row.streak.days > 0) {
    const n = Math.round(row.streak.days);
    bits.push(`${n} day${n === 1 ? "" : "s"}${row.streak.capped ? "+" : ""}${row.streakNote ? ` · ${row.streakNote}` : ""}`);
  }
  if (row.progress) bits.push(row.progress.label);
  if (row.ruleLabel && row.strength == null) bits.push(row.ruleLabel);
  if (row.parentTitle) bits.push(`goal: ${row.parentTitle}`);
  // M2: a weakening still pending keeps the row, and says until when ('must · ends Thu 8 Oct').
  if (row.pendingNext) bits.push(pendingMetaOf(row.pendingNext));
  else if (t.compulsory && row.lane !== "must") bits.push("must");
  if (row.heldToday && restToday) bits.push(`${HELD_WORD[restToday]} · ${t.compulsory ? "nothing owed" : "streak holds"}`);
  else if (restToday && t.compulsory && t.compulsoryOnRest && row.lane === "must") bits.push("must · even on rest days");
  if (t.intrinsic) bits.push("#play");
  if (t.sizing) bits.push("sizing…");
  if (row.state === "skipped") bits.push("skipped today");
  return (
    <>
      <span className="r-bit">
        <Sigil track={TRACK_SIGIL[t.track]} />
        {bits.join(" · ")}
      </span>
      {row.dueLabel && (
        <span className="r-bit due">
          <Icon name="clock" size={14} />
          {row.dueLabel}
        </span>
      )}
    </>
  );
}

/** "Kept 08:05 · paid 3.6 exactly": the receipt equals the price. */
function DoneMeta({ row, paidXp, study }: { row: BoardRow; paidXp: number | null; study: boolean }) {
  const at = row.paid ? Date.parse(row.paid.occurredAt) : Number.NaN;
  const time = Number.isFinite(at) ? ` ${hhmmOf(at)}` : "";
  const word = row.minimum ? "Minimum kept" : "Kept";
  return (
    <>
      <span className="r-bit kept-at">
        {word}
        {time}
      </span>
      {study ? (
        <span className="r-bit">paid by reviews</span>
      ) : paidXp != null ? (
        <span className="r-bit">paid {fmtXp(paidXp)} exactly</span>
      ) : null}
      {row.timesDone > 1 && <span className="r-bit">×{row.timesDone} today</span>}
    </>
  );
}
