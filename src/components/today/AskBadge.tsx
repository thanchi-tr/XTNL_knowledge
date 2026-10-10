"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icon";
import type { TodayAsk } from "./board-ui";
import { AskCard } from "./AskCard";

/**
 * The Asks on Today as a small badge in the corner of the block they concern
 * (board-ui.ts askHostOf), not as cards of their own: a 28 px bell with the
 * count, in a 40 px target, and a radial pulse that rings three times and
 * then stays still (none under Still motion or reduced motion). A tap opens
 * them in a small pop-over under the badge, each with its one action; Escape
 * or a tap outside closes it and focus goes back to the badge. Owed-toned
 * only for a penalty, as the cards were.
 */
export function AskBadge({ asks, label, onAction }: { asks: readonly TodayAsk[]; label: string; onAction: (ask: TodayAsk) => (() => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (asks.length === 0) return null;
  const owed = asks.some((a) => a.tone === "owed");
  const n = asks.length;
  const said = `${n} ${n === 1 ? "thing waits" : "things wait"} on ${label}: ${asks.map((a) => a.title).join("; ")}`;
  return (
    <div
      className="ask-badge-wrap"
      ref={root}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }}
    >
      <button
        ref={button}
        type="button"
        className={cx("ask-badge", owed && "owed")}
        aria-label={said}
        title={said}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ask-badge-dot" aria-hidden="true">
          <Icon name="bell" size={14} />
          {n > 1 && <span className="ask-badge-n num">{n}</span>}
        </span>
      </button>
      {open && (
        <div id={id} className="ask-pop" role="dialog" aria-label={`Waiting on ${label}`}>
          {asks.map((a) => (
            <AskCard
              key={a.id}
              className="ask-pop-card"
              title={a.title}
              detail={a.detail}
              action={a.action}
              href={a.href}
              tone={a.tone}
              clock={a.clock}
              onAction={(() => {
                const act = onAction(a);
                return act
                  ? () => {
                      setOpen(false);
                      act();
                    }
                  : undefined;
              })()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
