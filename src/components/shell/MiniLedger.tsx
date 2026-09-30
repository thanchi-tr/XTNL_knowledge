"use client";

/**
 * FROZEN CONTRACT — the MiniLedger (L0-foundation).
 *
 *   useMiniLedger({ xp, pts }, watchRef)
 *     Called by the page that owns the ledger cells (Today's Day ledger).
 *     Publishes today's figures and the element whose scrolling away docks the
 *     compact ledger in the top bar, so every T0 flight lands on a visible
 *     target. Mark the page's own cells with data-ledger-target="xp" / "pts".
 *
 *   <MiniLedger/>   top bar only. aria-hidden (the page's cells are the real figures);
 *                   its glyphs carry data-mini-ledger="xp" / "pts" for celebrate.ledgerTarget().
 *                   Figures count from the last shown value, never from 0.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { countTo, formatFigure } from "@/lib/motion";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { setLedgerWatch, setMiniLedger, useShell, type LedgerValues } from "./shell-store";

export function useMiniLedger(values: LedgerValues | null, watchRef: RefObject<Element | null>): void {
  const xp = values?.xp;
  const pts = values?.pts;
  useEffect(() => {
    setMiniLedger(xp == null || pts == null ? null : { xp, pts });
  }, [xp, pts]);
  useEffect(() => {
    setLedgerWatch(watchRef.current);
    return () => {
      setLedgerWatch(null);
      setMiniLedger(null);
    };
  }, [watchRef]);
}

export function MiniLedger() {
  const ledger = useShell((s) => s.ledger);
  const watch = useShell((s) => s.watch);
  const [docked, setDocked] = useState(false);
  const xpRef = useRef<HTMLElement | null>(null);
  const ptsRef = useRef<HTMLElement | null>(null);
  const last = useRef<LedgerValues | null>(null);

  useEffect(() => {
    if (!watch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDocked(false);
      return;
    }
    const topbar = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 56;
    const io = new IntersectionObserver(([e]) => setDocked(!e.isIntersecting), { rootMargin: `-${Math.round(topbar)}px 0px 0px 0px` });
    io.observe(watch);
    return () => io.disconnect();
  }, [watch]);

  // The figures are written here, not as React children: countTo rewrites the
  // text in place, and a React-owned text node would be detached by it.
  useEffect(() => {
    if (!ledger) {
      last.current = null;
      return;
    }
    const prev = last.current;
    last.current = ledger;
    if (prev) {
      countTo(xpRef.current, prev.xp, ledger.xp);
      countTo(ptsRef.current, prev.pts, ledger.pts);
    } else {
      if (xpRef.current) xpRef.current.textContent = formatFigure(ledger.xp);
      if (ptsRef.current) ptsRef.current.textContent = formatFigure(ledger.pts);
    }
  }, [ledger]);

  if (!ledger) return null;
  return (
    <div className={cx("mini-ledger", docked && "show")} aria-hidden="true">
      <span className="cur" data-mini-ledger="xp">
        <CurrencyGlyph kind="xp" />
        <b ref={xpRef} className="num" />
      </span>
      <span className="cur" data-mini-ledger="pts">
        <CurrencyGlyph kind="pts" />
        <b ref={ptsRef} className="num" />
      </span>
    </div>
  );
}
