"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BoardTemplate, InboxChoice } from "@/lib/today-board";
import { pushEscapeLayer, trapTab } from "@/components/capture/layers";

interface Props {
  items: BoardTemplate[];
  goals: { id: string; title: string }[];
  busy: boolean;
  onClarify: (templateId: string, choice: InboxChoice, parentId?: string) => void;
  onClose: () => void;
  /** The Undo line for a Drop made in this sheet, while it lasts. */
  undo?: ReactNode;
}

const CHOICES: { choice: Exclude<InboxChoice, "goal">; label: string; tone?: "red" }[] = [
  { choice: "today", label: "Today" },
  { choice: "tomorrow", label: "Tomorrow" },
  { choice: "anytime", label: "Anytime" },
  { choice: "idea", label: "Idea" },
  { choice: "drop", label: "Drop", tone: "red" },
];

/**
 * The inbox, clarified one tap at a time.
 *
 * Capture is allowed to be careless — a trailing '?' or an 'idea:' line lands
 * here without a decision — so the decision has to be cheap when it comes:
 * each item gets its six answers as buttons, and nothing needs typing. A
 * bottom sheet on a phone (thumb reach), a centred dialog on a desk; Escape
 * or the backdrop closes it. Drop is undoable for ten seconds, in the sheet.
 *
 * A modal in behaviour as well as name: Tab stays inside it, Escape closes
 * only it (the app's Escape stack), and focus goes back to what opened it.
 */
export function InboxSheet({ items, goals, busy, onClarify, onClose, undo }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pickingGoalFor, setPickingGoalFor] = useState<string | null>(null);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Once, on open: focus in, Escape registered as the top layer; on close,
  // focus back to the Inbox button (or whatever opened the sheet).
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const pop = pushEscapeLayer(() => closeRef.current());
    return () => {
      pop();
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <>
      <div className="today-sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="today-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-title"
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, panelRef.current)}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="inbox-title" style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-0)" }}>
            Inbox <span className="mono" style={{ color: "var(--ink-3)", fontSize: 13 }}>{items.length}</span>
          </h2>
          <button type="button" className="btn-ghost" style={{ minHeight: 40 }} onClick={onClose}>
            Close
          </button>
        </div>

        {undo}

        {items.length === 0 ? (
          <p className="mt-4" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
            Empty. Anything captured with a trailing <span className="mono">?</span> lands here to sort later.
          </p>
        ) : (
          <ul className="mt-2">
            {items.map((t) => (
              <li key={t.id} className="today-inbox-item">
                <div className="flex items-baseline justify-between gap-2">
                  <span style={{ fontSize: 13.5, color: "var(--ink-0)", overflowWrap: "anywhere" }}>{t.title}</span>
                  {t.kind === "IDEA_DRAFT" && <span className="today-chip" data-tone="blue">idea draft</span>}
                </div>
                <div className="today-drawer-row mt-2">
                  {CHOICES.map((c) => (
                    <button
                      key={c.choice}
                      type="button"
                      className="today-pill"
                      data-tone={c.tone}
                      disabled={busy}
                      onClick={() => onClarify(t.id, c.choice)}
                      title={c.choice === "drop" ? "Drop it. Undo stays on screen for 10 seconds." : undefined}
                    >
                      {c.label}
                    </button>
                  ))}
                  {goals.length > 0 && (
                    <button
                      type="button"
                      className="today-pill"
                      disabled={busy}
                      aria-expanded={pickingGoalFor === t.id}
                      onClick={() => setPickingGoalFor((cur) => (cur === t.id ? null : t.id))}
                    >
                      Goal ^
                    </button>
                  )}
                </div>
                {pickingGoalFor === t.id && (
                  <div className="today-drawer-row mt-2" role="group" aria-label="Link to a goal">
                    {goals.map((g) => (
                      <button key={g.id} type="button" className="today-pill" disabled={busy} onClick={() => onClarify(t.id, "goal", g.id)}>
                        ^{g.title}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
