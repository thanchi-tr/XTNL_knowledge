"use client";

/**
 * What the customer pages show instead of the list: the tab is archived
 * (Settings restores it), or its customer list is switched off (one tap turns
 * it back on; nothing was deleted while it was off).
 */
import { useState, useTransition } from "react";
import { setCrm } from "@/app/actions/customers";
import { workBoardHref } from "@/lib/work-boards";
import { Button } from "@/components/ui/Button";
import { UNREACHABLE } from "./CustomerSheets";

export function CrmGate({ board, kind }: { board: { id: string; name: string }; kind: "archived" | "off" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function turnOn() {
    setError(null);
    start(async () => {
      let res: Awaited<ReturnType<typeof setCrm>>;
      try {
        res = await setCrm(board.id, true, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="page narrow cq-main crm-page">
      {kind === "archived" ? (
        <section className="card crm-note" aria-label={`${board.name} is archived`}>
          <b>{board.name} is archived</b>
          <p>Its customers are kept. Restore the tab in Settings › Work tabs while a place is free.</p>
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
        <section className="card crm-note" aria-label="The customer list is off">
          <b>The customer list is off on {board.name}</b>
          <p>Turning it on brings back every customer, their log and their scheduled tasks. Nothing was deleted.</p>
          <div className="crm-note-row">
            <Button variant="primary" onClick={turnOn} disabled={pending}>
              {pending ? "Turning on…" : "Turn the list on"}
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
