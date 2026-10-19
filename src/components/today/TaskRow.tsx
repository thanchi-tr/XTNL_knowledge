"use client";

import type { TaskStyle } from "@/lib/task-style";
import { TaskIcon } from "@/components/task-style/TaskIcon";
import { useLayoutEffect, useRef, type PointerEvent, type ReactNode } from "react";
import type { BoardRow } from "@/lib/today-board";
import type { Receipt } from "@/lib/life-types";
import { habitLine } from "@/lib/habit";
import { Icon, Sigil } from "@/components/ui/Icon";
import { PricePill } from "@/components/ui/PricePill";
import { Tick, type TickState } from "@/components/ui/Tick";
import { cx } from "@/components/ui/cx";
import { TRACK_LABEL, TRACK_SIGIL, fmtMinutes, fmtXp } from "./format";
import { hhmmOf, pendingMetaOf, rowAccentOf, tickNameOf, type RowMotion } from "./board-ui";
import { NamedTitle } from "./NamedTitle";
import type { RestKind } from "@/lib/duty-economy";
import { stepsLine } from "@/lib/subtasks";
import { StepsList } from "./StepsList";

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
  /** The live fix (contracts §22.11): the Gemini-named Domain names a plan-born title holds; each shows with `namedMark` (the page's pv.named). */
  named?: readonly string[];
  namedMark?: ReactNode;
  /** The drawer, when open. */
  children?: ReactNode;
  /** The task's chosen icon and colour (BoardData.styles): drawn before the title when one is set. */
  taskStyle?: TaskStyle | null;
  /** Ticks one of the row's steps (row.steps); without it the steps are not drawn. */
  onStep?: (stepId: string, done: boolean, from: Element | null) => void;
  /**
   * A work tab's row (work-boards.ts): work pays no XP, so no price pill, no 'paid' and no track (a game word); a
   * done row reads 'Done 08:05'. Absent: the personal Board's row, exactly as before.
   */
  work?: boolean;
  /**
   * The row on its way (board-ui TICK_MOTION, today.css): "hold" just ticked in its lane (the ring fills in its code,
   * one ripple, the strike sweeps), "out" folding out of the lane, "arrive" landing in Done today, "enter" back in its
   * lane after an Undo. Absent: at rest.
   */
  motion?: RowMotion | null;
  /** "pile": a compact row in Done today (its steps stay folded; the drawer still opens from the title). */
  variant?: "pile";
}

/** The tick's tactile press: on pointerdown (not only :active, which a touch browser may skip), cleared on release. */
function pressOn(e: PointerEvent<HTMLButtonElement>) {
  if (!e.currentTarget.disabled) e.currentTarget.dataset.press = "1";
}
function pressOff(e: PointerEvent<HTMLButtonElement>) {
  delete e.currentTarget.dataset.press;
}

/**
 * One line on the board (redesign "Sigil & Slate"): a 64 px grid of
 * [tick][title + one meta line][price pill]. Everything else lives in the
 * drawer, which the title opens.
 *
 * The Tick is a checkbox: a circle for todos and habits, a diamond for
 * musts, half-filled for "Minimum kept". A must and a habit also wear their
 * colour code (data-accent: a leading rail and the open ring, --must or
 * --habit); a done tick rests kept whatever the row. The pill on the right is the
 * price, not a guess: "≈ 3.6" is the same `planCompletion` the server pays
 * with, against the same day's ledger, and once ticked it reads "+3.6" on
 * the life-XP wash and says "paid 3.6 exactly". Tapping it opens the
 * receipt. Unchecking a done row inside its ten-minute window is the undo,
 * which nets to zero.
 *
 * The tick's flourish (board-ui TICK_MOTION; ui-motion D10 as revised): the
 * ring presses on pointerdown, and a row just ticked in its lane
 * (motion "hold") fills its ring in its code, rings one ripple and sweeps a
 * strike across its title before it folds out ("out") into Done today, where
 * it rests struck through. CSS only (transform and opacity, plus the fold's
 * one row track); Still shows the finished row in Done today at once.
 */
export function TaskRow(props: Props) {
  const { row, projection, drawerOpen, undoable, busy } = props;
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const t = row.template;
  const done = row.state === "done";
  const paid = done && row.paid && !row.paid.undone ? row.paid : null;
  const shownXp = paid ? paid.xp : projection.xp;
  const study = !!row.auto;
  const title = props.pendingTitle ?? t.title;
  // The colour code (a must's warm rail and ring, a habit's cool one) and the tick's shape are one answer. The work
  // skin has neither: a plain row and a round tick for every task (no lane colour, no diamond).
  const accent = props.work ? null : rowAccentOf(row);
  const must = accent === "must";
  const tickState: TickState = done ? (row.minimum ? "minimum" : "done") : "open";
  const minimum = props.onMinimum && row.state === "open" && t.mvv ? props.onMinimum : null;
  const drawerId = `drawer-${row.key.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const pile = props.variant === "pile";

  // Back in its lane after an Undo: the row unfolds from nothing (its one row track 0fr → 1fr, today.css), the
  // reverse of its way out. Set before the first paint, so it never shows at full height first.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || props.motion !== "enter") return;
    // The from-state is set with no transition (whatever was computed before), then released into the unfold.
    el.style.transition = "none";
    el.style.gridTemplateRows = "0fr";
    el.style.opacity = "0";
    void el.offsetHeight;
    el.style.transition = "";
    el.style.gridTemplateRows = "";
    el.style.opacity = "";
  }, [props.motion]);

  return (
    <div
      ref={rootRef}
      className="t-row"
      data-state={row.state}
      data-lane={row.lane}
      data-accent={accent ?? undefined}
      data-template-id={t.id}
      data-row-key={row.key}
      data-motion={props.motion ?? undefined}
      data-variant={props.variant}
      data-just-added={props.justAdded ? "1" : undefined}
    >
      <div className="t-row-in">
        <div className={cx("row", done && "done")}>
          <Tick
            shape={must ? "diamond" : "circle"}
            state={tickState}
            label={tickNameOf(row)}
            disabled={busy || row.state === "locked" || (done && !undoable)}
            onClick={done ? props.onUndo : () => props.onTick(pillRef.current)}
            onPointerDown={pressOn}
            onPointerUp={pressOff}
            onPointerCancel={pressOff}
            onPointerLeave={pressOff}
            data-skipped={row.state === "skipped" ? "1" : undefined}
          />

          <div className="r-main">
            <button type="button" className="r-open" aria-expanded={drawerOpen} aria-controls={drawerOpen ? drawerId : undefined} onClick={props.onToggleDrawer}>
              <span className="r-title today-row-title" data-pending={props.pendingTitle ? "1" : undefined}>
                {props.taskStyle && (props.taskStyle.icon || props.taskStyle.color) && <TaskIcon style={props.taskStyle} size={16} className="tsk-row-ico" />}
                <span className="r-name">{props.pendingTitle ? title : <NamedTitle title={title} named={props.named} mark={props.namedMark} />}</span>
                {props.pendingTitle && <span className="r-saving"> · saving…</span>}
                {props.justAdded && <span className="sr-only">, just added</span>}
              </span>
              <span className="r-meta">
                {done ? <DoneMeta row={row} paidXp={props.work ? null : (paid?.xp ?? null)} study={study} work={props.work} /> : <OpenMeta row={row} restToday={props.restToday ?? null} work={props.work} />}
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

          {!props.work && (
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
          )}
        </div>
        {!pile && row.steps && props.onStep && row.state !== "locked" && (
          <StepsList steps={row.steps} compulsory={t.compulsory} paidXp={!props.work && row.paid && !row.paid.undone ? row.paid.xp : null} busy={busy} onStep={props.onStep} />
        )}
        {drawerOpen && (
          <div id={drawerId} className="r-drawer">
            {props.children}
          </div>
        )}
      </div>
    </div>
  );
}

const HELD_WORD: Record<RestKind, string> = { REST: "rest day", SICK: "sick day", VACATION: "vacation" };

/** The one meta line of an open row: track sigil, rung or length, streak, goal, due with its clock. A work row has no track. */
function OpenMeta({ row, restToday, work }: { row: BoardRow; restToday: RestKind | null; work?: boolean }) {
  const t = row.template;
  const bits: string[] = work ? [] : [TRACK_LABEL[t.track]];
  if (row.strength != null) bits.push(habitLine(row.strength));
  else if (!row.auto) bits.push(fmtMinutes(row.estMinutes));
  // A run that reaches the edge of the history read is a floor, and says so.
  // M2: '12 days · repaired' after a restoring make-up, '12 days · held' after the minimum or an excused day.
  // The work skin shows no streak (no game figures on a work tab).
  if (!work && row.streak && row.streak.days > 0) {
    const n = Math.round(row.streak.days);
    bits.push(`${n} day${n === 1 ? "" : "s"}${row.streak.capped ? "+" : ""}${row.streakNote ? ` · ${row.streakNote}` : ""}`);
  }
  if (row.progress) bits.push(row.progress.label);
  if (row.steps) bits.push(stepsLine(row.steps.done.length, row.steps.items.length));
  if (row.ruleLabel && row.strength == null) bits.push(row.ruleLabel);
  if (row.parentTitle) bits.push(`goal: ${row.parentTitle}`);
  // M2: a weakening still pending keeps the row, and says until when ('must · ends Thu 8 Oct').
  if (row.pendingNext) bits.push(pendingMetaOf(row.pendingNext));
  else if (t.compulsory && row.lane !== "must") bits.push("must");
  if (row.heldToday && restToday) bits.push(`${HELD_WORD[restToday]} · ${t.compulsory ? "nothing owed" : "streak holds"}`);
  else if (restToday && t.compulsory && t.compulsoryOnRest && row.lane === "must") bits.push("must · even on rest days");
  if (t.intrinsic && !work) bits.push("#play");
  if (t.sizing && !work) bits.push("sizing…");
  // Back from a defer today (task-decisions.ts): "Deferred until Tue 09:00 · 2×".
  if (row.deferNote) bits.push(row.deferNote);
  if (row.state === "skipped") bits.push("skipped today");
  return (
    <>
      <span className="r-bit">
        {!work && <Sigil track={TRACK_SIGIL[t.track]} />}
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

/** "Kept 08:05 · paid 3.6 exactly": the receipt equals the price. A work row: "Done 08:05", nothing paid. */
function DoneMeta({ row, paidXp, study, work }: { row: BoardRow; paidXp: number | null; study: boolean; work?: boolean }) {
  const at = row.paid ? Date.parse(row.paid.occurredAt) : Number.NaN;
  const time = Number.isFinite(at) ? ` ${hhmmOf(at)}` : "";
  const word = work ? (row.minimum ? "Minimum done" : "Done") : row.minimum ? "Minimum kept" : "Kept";
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
