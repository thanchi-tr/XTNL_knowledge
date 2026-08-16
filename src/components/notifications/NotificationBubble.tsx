"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Notice, NoticeGroup, NotificationFeed } from "@/lib/notifications";

/**
 * The corner bubble: a standing readout of everything with a deadline or an
 * active effect on the player's numbers.
 *
 * Sits above the loadout bar rather than beside it. The bar answers "what am
 * I carrying"; this answers "what is asking something of me right now", and
 * the two are read at different moments — collapsing them into one strip
 * would make the permanent thing compete with the urgent one.
 *
 * Collapsed by default and silent when there is nothing to say. A badge that
 * is always lit teaches people to stop looking at it, so the count reflects
 * only items that actually want action: overdue cards, an unmet quota, a
 * ready encounter, a live penalty. A running boon and a met quota are good
 * news and are visible on open without ever nagging.
 */

const TONE: Record<Notice["tone"], { color: string; bg: string; border: string }> = {
  good: { color: "var(--green)", bg: "var(--green-10)", border: "rgba(0,204,122,.28)" },
  warn: { color: "var(--amber)", bg: "rgba(240,160,48,.10)", border: "rgba(240,160,48,.28)" },
  bad: { color: "var(--red)", bg: "var(--red-10)", border: "rgba(240,58,87,.26)" },
  info: { color: "var(--blue)", bg: "rgba(77,156,245,.10)", border: "rgba(77,156,245,.26)" },
};

const GROUP_ORDER: NoticeGroup[] = ["Due", "Challenges", "Active effects"];

export function NotificationBubble({ feed }: { feed: NotificationFeed }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Escape and outside-click both close, because a corner panel that can only
  // be dismissed by hitting the same small target again is a trap on a phone.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (feed.notices.length === 0) return null;

  const { actionable, hasPenalty } = feed;
  const accent = hasPenalty ? "var(--red)" : actionable > 0 ? "var(--amber)" : "var(--green)";

  return (
    <div className="notif-root">
      {open && (
        <div ref={panelRef} className="notif-panel card" role="dialog" aria-label="Notifications">
          <div className="flex items-baseline justify-between gap-2 px-3 pt-3">
            <p className="panel-title" style={{ fontSize: 12 }}>
              Standing
            </p>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)} style={{ fontSize: 11 }}>
              Close
            </button>
          </div>

          <div className="notif-scroll px-3 pb-3">
            {GROUP_ORDER.map((group) => {
              const items = feed.notices.filter((n) => n.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mt-2.5">
                  <p className="label-xs" style={{ fontSize: 9 }}>
                    {group}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {items.map((n) => {
                      const tone = TONE[n.tone];
                      const body = (
                        <>
                          <span
                            aria-hidden
                            className="notif-dot"
                            style={{ background: tone.color, boxShadow: `0 0 7px ${tone.color}` }}
                          />
                          <span className="min-w-0">
                            <span className="block" style={{ fontSize: 12, fontWeight: 600, color: tone.color }}>
                              {n.title}
                            </span>
                            <span
                              className="block"
                              style={{ fontSize: 10.5, color: "var(--ink-2)", lineHeight: 1.45, marginTop: 1 }}
                            >
                              {n.detail}
                            </span>
                          </span>
                        </>
                      );
                      const style = { background: tone.bg, border: `1px solid ${tone.border}` };
                      return (
                        <li key={n.id}>
                          {n.href ? (
                            <Link
                              href={n.href}
                              onClick={() => setOpen(false)}
                              className="notif-item no-underline"
                              style={style}
                            >
                              {body}
                            </Link>
                          ) : (
                            <div className="notif-item" style={style}>
                              {body}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        className="notif-bubble"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={
          actionable > 0
            ? `Notifications, ${actionable} needing attention`
            : "Notifications, nothing needs attention"
        }
        style={{ borderColor: accent, color: accent }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.6L4.5 15.5h15L18 12.6V9a6 6 0 0 0-6-6Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M9.75 18.5a2.25 2.25 0 0 0 4.5 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>

        {actionable > 0 && (
          <span className="notif-badge" style={{ background: accent }}>
            {actionable > 9 ? "9+" : actionable}
          </span>
        )}
      </button>
    </div>
  );
}
