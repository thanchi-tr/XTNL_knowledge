"use client";

/**
 * FROZEN CONTRACT — ToastDock (L0-foundation). Mounted once by AppShell.
 * Push toasts with pushToast() from ./toast-store (any client code, including celebrate.ts).
 *
 *   One dock: tabbar-h + 12 on compact; bottom-right, 380 wide, from 600.
 *   role=status, one action (Undo / OK), a 4–10 s hold that pauses on hover or
 *   focus. A toast can carry a closing mini PromiseRing (a ring that closed off-screen).
 *   Portalled to <body>.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";
import { PromiseRing } from "./PromiseRing";
import { dismissToast, getServerToasts, getToasts, subscribeToasts, type ToastItem } from "./toast-store";

export function ToastDock() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The portal target only exists in the browser; mounting it once is the point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(document.body);
  }, []);
  if (!host) return null;
  return createPortal(
    <div className="dock">
      {toasts.map((t) => (
        <Toast key={t.id} item={t} />
      ))}
    </div>,
    host
  );
}

function Toast({ item }: { item: ToastItem }) {
  const [shown, setShown] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const arm = () => {
    clear();
    timer.current = window.setTimeout(() => dismissToast(item.id), item.holdMs);
  };
  useEffect(() => {
    arm();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.holdMs]);

  return (
    <div
      className={cx("toast", shown && "show")}
      role="status"
      onMouseEnter={clear}
      onMouseLeave={arm}
      onFocus={clear}
      onBlur={arm}
    >
      {item.ring && <PromiseRing value={1} target={1} size={34} label="Closed" closed glint />}
      <div className="tt">
        {item.title && <b>{item.title}</b>}
        {item.body}
      </div>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          item.action?.onAction();
          dismissToast(item.id);
        }}
      >
        {item.action?.label ?? "OK"}
      </button>
    </div>
  );
}
