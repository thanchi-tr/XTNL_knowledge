"use client";

import { useMemo, useState } from "react";
import { addDays } from "@/lib/life-day";
import type { BoardRow } from "@/lib/today-board";
import { SectionHeader } from "@/components/ui/Tabs";
import { TaskRow } from "@/components/today/TaskRow";
import { Lane } from "@/components/today/Lane";
import { DonePile } from "@/components/today/DonePile";
import { BoardClearCard } from "@/components/today/BoardClearCard";
import {
  boardClearViewOf,
  donePileOf,
  donePileShown,
  firstTomorrowOf,
  laneRowsOf,
  laneTally,
  splitTodayLane,
  type RowMotion,
} from "@/components/today/board-ui";
import { FIXTURE_TODAY, fixtureDoneBoard } from "./fixtures";

const noop = () => {};

/**
 * /dev/style/today · Done today (the tick's flourish, ui-motion D10 as revised): each state the board draws, from
 * the made-up day in fixtures.ts, at its real widths. "Just ticked" holds a row in its lane as the board does for
 * 450 ms (its ring in its code, the strike across its title); here it stays held. Every figure is a fixture.
 */
export function DoneFixtures() {
  const [open, setOpen] = useState(false);
  const day = useMemo(() => fixtureDoneBoard(), []);
  const { planned, habits } = splitTodayLane(day.todayRows);
  const rowsOf = [...day.must, ...day.todayRows, ...day.anytime];
  const pile = donePileOf(rowsOf);
  const workPile = donePileOf(rowsOf, { work: true });
  const folded = donePileShown(pile.rows, open);
  const allOpen = donePileShown(pile.rows, true);
  const mustTally = laneTally(day.must);
  const plannedTally = laneTally(planned);
  const habitTally = laneTally(habits);
  const latest = pile.rows[0]?.key;
  const row = (r: BoardRow, p: { motion?: RowMotion; pile?: boolean; work?: boolean } = {}) => (
    <TaskRow
      key={r.key}
      row={r}
      projection={r.projection}
      drawerOpen={false}
      undoable={r.state === "done" && r.key === latest}
      busy={p.motion === "hold"}
      receiptOpen={false}
      receiptId="dev-done-receipt"
      onTick={noop}
      onUndo={noop}
      onToggleDrawer={noop}
      onToggleReceipt={noop}
      motion={p.motion ?? null}
      variant={p.pile ? "pile" : undefined}
      work={p.work}
    />
  );
  // Just ticked: the walk (a habit, so its ring fills --habit), kept a moment ago and still held in its lane.
  const leavingKey = habits.find((r) => r.template.id === "d-walk")?.key ?? "";
  const plannedRows = laneRowsOf(planned, () => false);
  const habitsHeld = laneRowsOf(habits, (k) => k === leavingKey);
  const mustRows = laneRowsOf(day.must, () => false);
  const clear = boardClearViewOf({
    done: pile.count,
    lifeXp: pile.xp,
    momentum: { run: 12, quests: 3, questsDone: 2 },
    tomorrow: firstTomorrowOf({ tomorrow: addDays(FIXTURE_TODAY, 1), later: day.laterRows, upcoming: [] }),
  });
  return (
    <>
      <SectionHeader title="Done today" aside="just ticked · a lane all kept · the pile folded and open · Board clear · a work tab" />
      <div className="dev-grid dev-done">
        <div className="dev-quest" id="dev-done-ticked">
          <p className="t-meta">Just ticked (held in its lane): the ring in its code, the strike across the title.</p>
          <Lane id="dev-planned" title="Planned" count={`${plannedTally.kept} of ${plannedTally.total}`}>
            {plannedRows.rows.map((r) => row(r))}
          </Lane>
          <Lane id="dev-habits" title="Habits" habit count={`${habitTally.kept} of ${habitTally.total}`}>
            {habitsHeld.rows.map((r) => row(r, { motion: r.key === leavingKey ? "hold" : undefined }))}
          </Lane>
        </div>
        <div className="dev-quest" id="dev-done-allkept">
          <p className="t-meta">A lane all kept: its stamp, its honest count, and &quot;All kept&quot; in place of rows.</p>
          <Lane id="dev-must" title="Must" must kept count={`${mustTally.kept} of ${mustTally.total} kept`}>
            {mustRows.allDone && <p className="lane-note lane-all">All kept</p>}
          </Lane>
        </div>
        <div className="dev-quest" id="dev-done-folded">
          <p className="t-meta">Done today, folded: the latest three (Show more opens the rest).</p>
          <DonePile idBase="dev-done-a" pile={pile} open={open} hidden={folded.hidden} onToggle={() => setOpen((o) => !o)}>
            {folded.shown.map((r) => row(r, { pile: true }))}
          </DonePile>
        </div>
        <div className="dev-quest" id="dev-done-open">
          <p className="t-meta">Done today, open: every row, latest first.</p>
          <DonePile idBase="dev-done-b" pile={pile} open hidden={0} onToggle={noop}>
            {allOpen.shown.map((r) => row(r, { pile: true }))}
          </DonePile>
        </div>
        <div className="dev-quest" id="dev-board-clear">
          <p className="t-meta">Board clear, at the top of the board once its last open row is done (once a day; OK puts it away).</p>
          <BoardClearCard idBase="dev-clear-a" view={clear} onDismiss={noop} />
        </div>
        <div className="dev-quest" id="dev-done-work">
          <p className="t-meta">A work tab: Board clear says the tasks done only; Done today has no XP and no price.</p>
          <BoardClearCard idBase="dev-clear-b" view={boardClearViewOf({ done: workPile.count, work: true })} onDismiss={noop} />
          <DonePile idBase="dev-done-c" pile={workPile} open={false} hidden={donePileShown(workPile.rows, false).hidden} onToggle={noop}>
            {donePileShown(workPile.rows, false).shown.map((r) => row(r, { pile: true, work: true }))}
          </DonePile>
        </div>
      </div>
    </>
  );
}
