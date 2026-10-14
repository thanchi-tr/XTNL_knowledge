"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { BoardClearView } from "./board-ui";

/**
 * Board clear: the one-card summary at the top of the board once its last
 * open row is done (board-ui boardClearViewOf): the tasks done, the day's
 * life XP, the momentum run and quests when live, and the first thing
 * tomorrow. A work tab says only the tasks done. It appears after the tap
 * that cleared the board (with the board's one T1 chime, 'board-clear:<day>'),
 * stays for the life day while the board stays clear, and OK puts it away
 * for the day on this device. Every figure is the board's own.
 */
export function BoardClearCard({
  idBase = "board-clear",
  view,
  fresh,
  onDismiss,
}: {
  /** Its heading id's stem (the board has one card; a fixture page several). */
  idBase?: string;
  view: BoardClearView;
  /** The tap that cleared the board just played: it eases in (never on arrival). */
  fresh?: boolean;
  onDismiss: () => void;
}) {
  return (
    <section className="card today-clear" aria-labelledby={`${idBase}-h`} data-fresh={fresh ? "1" : undefined}>
      <span className="clear-ic" aria-hidden="true">
        <Icon name="check" />
      </span>
      <div className="clear-txt">
        <h2 id={`${idBase}-h`}>{view.title}</h2>
        <ul>
          {view.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <Button variant="quiet" onClick={onDismiss} aria-label="OK, put Board clear away for today">
        OK
      </Button>
    </section>
  );
}
