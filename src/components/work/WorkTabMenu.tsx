"use client";

/**
 * A work tab's menu (the work header's ⋯ button, "Work tab menu"; it was the board card's until the Office workspace,
 * 2026-10-20): Rename (1..24 characters), the Customer list switch (customers.ts; off by default, off hides it and
 * deletes nothing), the Order list switch (work-orders.ts; the same), Follow-ups while the customer list is on (crm.ts,
 * Phase 2: Off · 7 · 14 · 30 · 60 · 90 days, a radio group; the Agenda's Follow up and the Customers count follow it)
 * and Archive, behind a confirm that says what
 * archiving does (the tab leaves the strip and frees its place; every task, customer and scheduled task is kept;
 * Settings › Work tabs restores it). After an archive the app goes back to the personal Board.
 */
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveWorkBoard, renameWorkBoard } from "@/app/actions/work-boards";
import { setCrm } from "@/app/actions/customers";
import { setOrdersOn } from "@/app/actions/work-orders";
import { setFollowUpDays } from "@/app/actions/crm";
import { FOLLOW_UP_CHOICES, followUpLabel } from "@/lib/crm";
import { WORK_BOARD_NAME_MAX, cleanWorkBoardName } from "@/lib/work-boards";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import type { WorkFrameBoard } from "./work-store";
import "@/components/shell/work-tabs.css";

/** The menu button's accessible name. */
export const WORK_MENU_LABEL = "Work tab menu";
/** The menu's line on what a work tab is: kept out of the game. */
export const WORK_CARD_NOTE = "Work only: kept apart from your personal Board, its week and its goals.";
/** The menu's switch: what a customer list is, and that off deletes nothing. */
export const CRM_SWITCH_NOTE = "A customer list for this tab: customer IDs, their interactions and scheduled tasks. Off hides it; nothing is deleted.";
/** The menu's order list switch: what an order list is, and that off deletes nothing. */
export const ORDERS_SWITCH_NOTE = "An order list for this tab: who it is for, what to order, whether it is ordered, and the date. Off hides it; nothing is deleted.";
/** The menu's follow-up alert (Phase 2): who it flags, and where. */
export const FOLLOW_UP_NOTE = "Customers with no contact for this long and nothing scheduled, or with an overdue task, show under Follow up on the Agenda. Inactive customers never do.";

const UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";

export function WorkTabMenu({ board, open, onClose }: { board: WorkFrameBoard; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const ids = useId();
  /** The follow-up alert's days while its write is in flight (then the refreshed prop). */
  const [followWant, setFollowWant] = useState<{ days: number | null } | null>(null);
  const [name, setName] = useState(board.name);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /** A switch's state while its write is in flight (then the refreshed prop). */
  const [crmWant, setCrmWant] = useState<boolean | null>(null);
  const [ordersWant, setOrdersWant] = useState<boolean | null>(null);

  function toggle(which: "crm" | "orders", on: boolean) {
    setError(null);
    (which === "crm" ? setCrmWant : setOrdersWant)(on);
    start(async () => {
      let res: { ok: true } | { ok: false; error: string };
      try {
        res = which === "crm" ? await setCrm(board.id, on, { refresh: true }) : await setOrdersOn(board.id, on, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      (which === "crm" ? setCrmWant : setOrdersWant)(null);
      if (!res.ok) setError(res.error);
    });
  }

  function setFollow(days: number | null) {
    setError(null);
    setFollowWant({ days });
    start(async () => {
      let res: Awaited<ReturnType<typeof setFollowUpDays>>;
      try {
        res = await setFollowUpDays(board.id, days, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      setFollowWant(null);
      if (!res.ok) setError(res.error);
    });
  }

  function rename() {
    const clean = cleanWorkBoardName(name);
    if (!clean.ok) {
      setError(clean.error);
      return;
    }
    if (clean.name === board.name) {
      onClose();
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
      onClose();
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
      onClose();
      router.replace("/today");
    });
  }

  return (
    <Sheet open={open} onClose={() => !pending && onClose()} title={board.name} description={WORK_CARD_NOTE}>
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
          <Switch checked={crmWant ?? board.crmOn} onChange={(on) => toggle("crm", on)} label="Customer list" disabled={pending} />
        </div>
      </div>

      <div className="work-menu-sec">
        <h3>Order list</h3>
        <div className="work-menu-switch">
          <p>{ORDERS_SWITCH_NOTE}</p>
          <Switch checked={ordersWant ?? board.ordersOn} onChange={(on) => toggle("orders", on)} label="Order list" disabled={pending} />
        </div>
      </div>

      {board.crmOn && (
        <div className="work-menu-sec">
          <h3 id={`${ids}-follow`}>Follow-ups</h3>
          <p>{FOLLOW_UP_NOTE}</p>
          <div className="st-channels" role="radiogroup" aria-labelledby={`${ids}-follow`}>
            {FOLLOW_UP_CHOICES.map((d) => {
              const current = followWant ? followWant.days : board.followUpDays;
              return (
                <label key={d ?? "off"} className="st-chan">
                  <input type="radio" name={`${ids}-follow-days`} value={d ?? "off"} checked={current === d} onChange={() => setFollow(d)} disabled={pending} />
                  {followUpLabel(d)}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="work-menu-sec">
        <h3>Archive</h3>
        <p>It leaves the tabs and frees its place. Every task, customer and scheduled task on it is kept, and Settings › Work tabs brings it back.</p>
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
  );
}
