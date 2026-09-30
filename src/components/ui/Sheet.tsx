"use client";

/**
 * FROZEN CONTRACT — Sheet (L0-foundation). The ONE sheet (merges the two old ones).
 *
 *   <Sheet open={open} onClose={close} title="Receipt" description? variant="auto|center" id?>
 *     …body…
 *   </Sheet>
 *
 *   compact (<600): bottom sheet, radius 24, grabber, max 88dvh, keyboard-aware (--kb).
 *   from 600: right drawer 420 wide. variant="center": centred 560 dialog (Capture).
 *   Scrim (blur allowed: it is transient), focus trap, the app's one Escape stack
 *   (components/capture/layers.ts), focus returns to the opener.
 *   Portalled to <body>: never inside <main> (the @container would trap it).
 *   aria-modal dialog labelled by its title. Nothing renders while closed.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pushEscapeLayer, trapTab } from "@/components/capture/layers";
import { motionLevel } from "@/lib/motion";
import { cx } from "./cx";
import { IconButton } from "./Button";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  variant?: "auto" | "center";
  id?: string;
  children?: ReactNode;
  /** Sticky footer actions. */
  footer?: ReactNode;
  className?: string;
  /** Hide the close button (the body has its own). */
  hideClose?: boolean;
}

const EXIT_MS = 300;

export function Sheet({ open, onClose, title, description, variant = "auto", id, children, footer, className, hideClose }: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  const autoId = useId();
  const titleId = `${id ?? autoId}-title`;
  const descId = `${id ?? autoId}-desc`;

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Mount, then show on the next frame so the transform transition runs; on
  // close, hide, then unmount once it has slid away (at once in Still).
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), motionLevel() === "still" ? 0 : EXIT_MS);
    const opener = openerRef.current;
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    return () => window.clearTimeout(t);
  }, [open]);

  // Escape (the shared stack), focus in, and the keyboard inset.
  useEffect(() => {
    if (!open || !mounted) return;
    const pop = pushEscapeLayer(() => closeRef.current());
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? panel;
    const t = window.setTimeout(() => first?.focus({ preventScroll: true }), 60);
    const vv = window.visualViewport;
    const syncKb = () => {
      if (!panel || !vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      panel.style.setProperty("--kb", `${Math.round(inset)}px`);
    };
    syncKb();
    vv?.addEventListener("resize", syncKb);
    return () => {
      pop();
      window.clearTimeout(t);
      vv?.removeEventListener("resize", syncKb);
    };
  }, [open, mounted]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className={cx("scrim", shown && "show")} onClick={() => closeRef.current()} aria-hidden="true" />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx("sheet", variant === "center" && "center", shown && "show", className)}
        onKeyDown={(e) => trapTab(e, panelRef.current)}
      >
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-h">
          <div className="t">
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p className="sub" id={descId}>
                {description}
              </p>
            )}
          </div>
          {!hideClose && <IconButton icon="x" label="Close" onClick={() => closeRef.current()} />}
        </div>
        <div className="sheet-b" style={{ marginTop: 12 }}>
          {children}
        </div>
        {footer && (
          <div className="sheet-f" style={{ position: "sticky", bottom: 0, display: "flex", gap: 8, paddingTop: 12, background: "var(--overlay)" }}>
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
