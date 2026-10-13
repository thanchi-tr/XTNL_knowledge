"use client";

/**
 * A work tab's header card (work-boards.ts; TodayBoard's `work`): where the
 * plan card stands on the personal Board. Its name, one line on what a work
 * tab is (separate from the game), and its menu (the ⋯ button, "Work tab
 * menu"): Rename (1..24 characters) and Archive, behind a confirm that says
 * what archiving does (the tab leaves the strip and frees its place; every
 * task is kept; Settings › Work tabs restores it). After an archive the board
 * goes back to the personal Board.
 *
 * Customers (customers.ts, 2026-10-12): the menu's "Customer list" switch
 * gives the tab its own customer list (off by default; off hides it and
 * deletes nothing). While it is on, the card links to the list with the
 * count of scheduled customer tasks due today (overdue included), read after
 * the card mounts.
 *
 * Orders (work-orders.ts, 2026-10-14): the menu's "Order list" switch gives
 * the tab its own order list (off by default; off hides it and deletes
 * nothing). While it is on, the card links to it under Customers, with the
 * count of lines still to order, read after the card mounts.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { archiveWorkBoard, renameWorkBoard } from "@/app/actions/work-boards";
import { customerDueCount, setCrm } from "@/app/actions/customers";
import { setOrdersOn, workOrderCount } from "@/app/actions/work-orders";
import { WORK_BOARD_NAME_MAX, cleanWorkBoardName } from "@/lib/work-boards";
import { customersHref, dueChipText, type DueCount } from "@/lib/customers";
import { ordersChipText, ordersHref } from "@/lib/work-orders";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import { cx } from "@/components/ui/cx";
import "@/components/shell/work-tabs.css";

/** The card's menu button's accessible name. */
export const WORK_MENU_LABEL = "Work tab menu";
/** The line under the name: work is kept out of the game. */
export const WORK_CARD_NOTE = "Work only: ticks here pay no XP and never touch your streak, your week or your goals.";

const UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";
/** The menu's switch: what a customer list is, and that off deletes nothing. */
export const CRM_SWITCH_NOTE = "A customer list for this tab: customer IDs, their interactions and scheduled reminders. Off hides it; nothing is deleted.";
/** The menu's order list switch: what an order list is, and that off deletes nothing. */
export const ORDERS_SWITCH_NOTE = "An order list for this tab: who it is for, what to order, whether it is ordered, and the date. Off hides it; nothing is deleted.";

export function WorkBoardCard({ board }: { board: { id: string; name: string; crmOn?: boolean; ordersOn?: boolean } }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState(board.name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const crmOn = board.crmOn === true;
  /** The switch's state while its write is in flight (then the refreshed prop). */
  const [crmWant, setCrmWant] = useState<boolean | null>(null);
  const [due, setDue] = useState<DueCount | null>(null);
  const ordersOn = board.ordersOn === true;
  /** The order list switch's state while its write is in flight (then the refreshed prop). */
  const [ordersWant, setOrdersWant] = useState<boolean | null>(null);
  const [toOrder, setToOrder] = useState<number | null>(null);

  // The list's due count, read once the card is up (a failed read shows no count).
  useEffect(() => {
    if (!crmOn) return;
    let live = true;
    customerDueCount(board.id)
      .then((res) => {
        if (live && res.ok) setDue(res.value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [board.id, crmOn]);

  // The order list's count of lines still to order, read once the card is up (a failed read shows no count).
  useEffect(() => {
    if (!ordersOn) return;
    let live = true;
    workOrderCount(board.id)
      .then((res) => {
        if (live && res.ok) setToOrder(res.value.todo);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [board.id, ordersOn]);

  function toggleOrders(on: boolean) {
    setError(null);
    setOrdersWant(on);
    start(async () => {
      let res: Awaited<ReturnType<typeof setOrdersOn>>;
      try {
        res = await setOrdersOn(board.id, on, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      setOrdersWant(null);
      if (!res.ok) setError(res.error);
    });
  }

  function toggleCrm(on: boolean) {
    setError(null);
    setCrmWant(on);
    start(async () => {
      let res: Awaited<ReturnType<typeof setCrm>>;
      try {
        res = await setCrm(board.id, on, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      setCrmWant(null);
      if (!res.ok) setError(res.error);
    });
  }

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
      {crmOn && (
        <Link className="work-crm-link" href={customersHref(board.id)}>
          <span className="work-crm-l">Customers</span>
          {due && dueChipText(due) && <span className={cx("chip", due.overdue > 0 && "owed")}>{dueChipText(due)}</span>}
          <Icon name="chev" />
        </Link>
      )}
      {ordersOn && (
        <Link className="work-crm-link" href={ordersHref(board.id)}>
          <span className="work-crm-l">Orders</span>
          {toOrder !== null && ordersChipText(toOrder) && <span className="chip">{ordersChipText(toOrder)}</span>}
          <Icon name="chev" />
        </Link>
      )}

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
          <h3>Customer list</h3>
          <div className="work-menu-switch">
            <p>{CRM_SWITCH_NOTE}</p>
            <Switch checked={crmWant ?? crmOn} onChange={toggleCrm} label="Customer list" disabled={pending} />
          </div>
        </div>

        <div className="work-menu-sec">
          <h3>Order list</h3>
          <div className="work-menu-switch">
            <p>{ORDERS_SWITCH_NOTE}</p>
            <Switch checked={ordersWant ?? ordersOn} onChange={toggleOrders} label="Order list" disabled={pending} />
          </div>
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
