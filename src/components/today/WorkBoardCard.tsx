"use client";

/**
 * A work tab's header card (work-boards.ts; TodayBoard's `work`): where the
 * plan card stands on the personal Board. Its name, one line on what a work
 * tab is (separate from the game), and its menu (the ⋯ button, "Work tab
 * menu"): Rename (1..24 characters) and Archive, behind a confirm that says
 * what archiving does (the tab leaves the strip and frees its place; every
 * task is kept; Settings › Work tabs restores it). After an archive the board
 * goes back to the personal Board.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveWorkBoard, renameWorkBoard } from "@/app/actions/work-boards";
import { WORK_BOARD_NAME_MAX, cleanWorkBoardName } from "@/lib/work-boards";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import "@/components/shell/work-tabs.css";

/** The card's menu button's accessible name. */
export const WORK_MENU_LABEL = "Work tab menu";
/** The line under the name: work is kept out of the game. */
export const WORK_CARD_NOTE = "Work only: ticks here pay no XP and never touch your streak, your week or your goals.";

const UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";

export function WorkBoardCard({ board }: { board: { id: string; name: string } }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(board.name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openMenu() {
    setName(board.name);
    setConfirming(false);
    setError(null);
    setMenuOpen(true);
  }

  function rename() {
    const clean = cleanWorkBoardName(name);
    if (!clean.ok) {
      setError(clean.error);
      return;
    }
    if (clean.name === board.name) {
      setMenuOpen(false);
      return;
    }
    setError(null);
    start(async () => {
      let res: Awaited<ReturnType<typeof renameWorkBoard>>;
      try {
        res = await renameWorkBoard(board.id, clean.name, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMenuOpen(false);
    });
  }

  function archive() {
    setError(null);
    start(async () => {
      let res: Awaited<ReturnType<typeof archiveWorkBoard>>;
      try {
        res = await archiveWorkBoard(board.id, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMenuOpen(false);
      router.replace("/today");
    });
  }

  return (
    <section className="card work-card" aria-label={`Work tab: ${board.name}`}>
      <div className="work-card-h">
        <Icon name="grid" size={18} className="ink-1" />
        <b>{board.name}</b>
        <button type="button" className="work-menu-btn" aria-label={WORK_MENU_LABEL} aria-haspopup="dialog" onClick={openMenu}>
          <Icon name="dot3" size={20} />
        </button>
      </div>
      <p className="work-card-note">{WORK_CARD_NOTE}</p>

      <Sheet open={menuOpen} onClose={() => !pending && setMenuOpen(false)} title={board.name} description="This work tab">
        <div className="work-menu-sec">
          <h3>Rename</h3>
          <form
            className="work-name-form"
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
          >
            <input
              className="work-name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              maxLength={WORK_BOARD_NAME_MAX + 8}
              aria-label="Work tab name"
              aria-invalid={error ? true : undefined}
            />
            <Button type="submit" variant="secondary" disabled={pending || !name.trim()}>
              Save
            </Button>
          </form>
          <p>Up to {WORK_BOARD_NAME_MAX} characters.</p>
        </div>

        <div className="work-menu-sec">
          <h3>Archive</h3>
          <p>It leaves the tabs and frees its place. Every task and habit on it is kept, and Settings › Work tabs brings it back.</p>
          <div className="work-menu-row">
            {confirming ? (
              <>
                <Button variant="danger" onClick={archive} disabled={pending}>
                  {pending ? "Archiving…" : `Archive ${board.name}`}
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)} disabled={pending}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)} disabled={pending}>
                Archive…
              </Button>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="work-name-error">
            {error}
          </p>
        )}
      </Sheet>
    </section>
  );
}
