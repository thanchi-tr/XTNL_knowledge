"use client";

/**
 * What the order page shows instead of the list: the tab is archived
 * (Settings restores it), or its order list is switched off (one tap turns
 * it back on; nothing was deleted while it was off).
 */
import { useState, useTransition } from "react";
import { setOrdersOn } from "@/app/actions/work-orders";
import { workBoardHref } from "@/lib/work-boards";
import { Button } from "@/components/ui/Button";
import { ORDER_UNREACHABLE } from "./OrderSheet";

export function OrdersGate({ board, kind }: { board: { id: string; name: string }; kind: "archived" | "off" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function turnOn() {
    setError(null);
    start(async () => {
      let res: Awaited<ReturnType<typeof setOrdersOn>>;
      try {
        res = await setOrdersOn(board.id, true, { refresh: true });
      } catch {
        res = { ok: false, error: ORDER_UNREACHABLE };
      }
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="page narrow cq-main crm-page">
      {kind === "archived" ? (
        <section className="card crm-note" aria-label={`${board.name} is archived`}>
          <b>{board.name} is archived</b>
          <p>Its orders are kept. Restore the tab in Settings › Work tabs while a place is free.</p>
          <div className="crm-note-row">
            <Button variant="secondary" href="/settings#work-tabs">
              Open Settings
            </Button>
            <Button variant="quiet" href="/today">
              Back to Board
            </Button>
          </div>
        </section>
      ) : (
        <section className="card crm-note" aria-label="The order list is off">
          <b>The order list is off on {board.name}</b>
          <p>Turning it on brings back every order, ordered or not. Nothing was deleted.</p>
          <div className="crm-note-row">
            <Button variant="primary" onClick={turnOn} disabled={pending}>
              {pending ? "Turning on…" : "Turn the order list on"}
            </Button>
            <Button variant="quiet" href={workBoardHref(board.id)}>
              Back to {board.name}
            </Button>
          </div>
          {error && (
            <p className="crm-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
