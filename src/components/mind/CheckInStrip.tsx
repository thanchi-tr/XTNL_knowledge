"use client";

/**
 * Today's "Check in" strip (health-2026-10-27.md D3): one slim row in the side column, under the due-elsewhere strip
 * (TodayBoard's `checkIn` slot), that opens the check-in sheet. The page draws it only while check-ins are open
 * (mindOn), the view was read (the table is there and the read didn't fail, so a pause never fails open) and the user
 * hasn't paused them.
 *
 * Today is the Tasks section; this extends its ruling by one row and keeps its rules: never a count, never a value,
 * never red, never an Ask. The row says "Check in" and nothing about any check-in. After a save a second row reads
 * "Logged 14:32" with Undo for UNDO_MS (the time only: the words of the value stay in the sheet and on Body › Mind),
 * then folds away. The row stays put, so focus comes back to it when the sheet closes, and to it again when the
 * receipt goes (after a successful Undo, or when Undo times out while it had the focus), never to <body>. The action
 * is sent without refresh: nothing on Today changes with a check-in.
 */
import { useRef, useState, useTransition } from "react";
import { UNDO_MS } from "@/lib/mind";
import { Icon } from "@/components/ui/Icon";
import { CheckInReceipt, CheckInSheet, clockOf, type CheckInDraft } from "./CheckInSheet";
import type { CheckInActions, LoggedCheck } from "./types";

export function CheckInStrip({
  actions,
  logged: initialLogged = null,
  holdUndo = false,
  open: initialOpen = false,
  draft,
}: {
  actions: CheckInActions;
  /** Fixtures: start on a receipt. */
  logged?: LoggedCheck | null;
  /** Fixtures: keep Undo on screen. */
  holdUndo?: boolean;
  /** Fixtures: start with the sheet open. */
  open?: boolean;
  draft?: CheckInDraft;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [logged, setLogged] = useState<LoggedCheck | null>(initialLogged);
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  /** The receipt (and its Undo) is about to go: the focus goes back to "Check in" on the next frame. */
  const refocus = () => requestAnimationFrame(() => btnRef.current?.focus());

  function undo(check: LoggedCheck) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await actions.deleteCheck(check.id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setLogged(null);
        setSaid(res.value.deleted === 0 ? "Already deleted." : "Check-in taken back.");
        // Undo is reached only from the receipt, which this removes.
        refocus();
      } catch {
        setError("Couldn't reach the server. Try again.");
      }
    });
  }

  return (
    <div className="card mind-strip" data-wc-block="check-in">
      <button ref={btnRef} type="button" className="mind-strip-btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="grid" size={16} />
        <span>Check in</span>
      </button>
      {logged && (
        <CheckInReceipt
          key={logged.id}
          line={`Logged ${clockOf(logged.at)}`}
          onUndo={() => undo(logged)}
          pending={pending}
          holdUndo={holdUndo}
          onExpire={(hadFocus) => {
            setLogged(null);
            if (hadFocus) refocus();
          }}
        />
      )}
      {error && (
        <p role="alert" className="t-error mind-strip-msg">
          {error}
        </p>
      )}
      <p className="sr-only" role="status">
        {said}
      </p>
      <CheckInSheet
        open={open}
        onClose={() => setOpen(false)}
        via="today"
        logCheck={actions.logCheck}
        draft={draft}
        onLogged={(v) => {
          setOpen(false);
          setLogged(v);
          setError(null);
          setSaid(`Logged at ${clockOf(v.at)}. Undo stays for ${UNDO_MS / 1000} seconds.`);
        }}
      />
    </div>
  );
}
