"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { BoardTemplate, InboxChoice } from "@/lib/today-board";
import { Sheet } from "@/components/ui/Sheet";
import { ChipButton } from "@/components/ui/Chip";

interface Props {
  open: boolean;
  items: BoardTemplate[];
  goals: { id: string; title: string }[];
  busy: boolean;
  onClarify: (templateId: string, choice: InboxChoice, parentId?: string) => void;
  onClose: () => void;
  /** The Undo line for a Drop made in this sheet, while it lasts (the dock sits under the scrim). */
  undo?: ReactNode;
}

const CHOICES: { choice: Exclude<InboxChoice, "goal">; label: string }[] = [
  { choice: "today", label: "Today" },
  { choice: "tomorrow", label: "Tomorrow" },
  { choice: "anytime", label: "Anytime" },
  { choice: "idea", label: "Idea" },
  { choice: "drop", label: "Drop" },
];

const DROP_TITLE = "Drop it. Undo stays on screen for 10 seconds.";

/** The full idea form for a draft: the same link a capture's toast gives (CapturedItem.href). */
const draftHref = (templateId: string): string => `/add?draft=${encodeURIComponent(templateId)}`;

/**
 * The inbox, clarified one tap at a time.
 *
 * Capture is allowed to be careless — a trailing '?' or an 'idea:' line lands
 * here without a decision — so the decision has to be cheap when it comes:
 * each item gets its answers as 40 px chips, and nothing needs typing. An
 * idea draft has two: Finish (the full idea form, which files it and clears
 * it from here) and Drop. The kit's Sheet: a bottom sheet on a phone (thumb
 * reach), a right drawer from 600; the app's one Escape stack, a focus
 * trap, focus back to the opener. Drop is undoable for ten seconds, in the
 * sheet.
 */
export function InboxSheet({ open, items, goals, busy, onClarify, onClose, undo }: Props) {
  const [pickingGoalFor, setPickingGoalFor] = useState<string | null>(null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Inbox"
      description={items.length === 0 ? "Nothing to sort." : `${items.length} line${items.length === 1 ? "" : "s"} captured on the go.`}
    >
      {undo}
      {items.length === 0 ? (
        <p className="t-meta">
          Anything captured with a trailing <span className="t-mono">?</span> lands here to sort later.
        </p>
      ) : (
        <ul className="today-inbox">
          {items.map((t) =>
            t.kind === "IDEA_DRAFT" ? (
              <li key={t.id} className="today-inbox-item">
                <div className="n">
                  <b>{t.title}</b>
                  {t.note && <span className="today-inbox-answer">{t.note}</span>}
                  <span className="t-meta">Idea draft · Finish files it</span>
                </div>
                <div className="today-opts" role="group" aria-label={`Sort ${t.title}`}>
                  <Link href={draftHref(t.id)} className="chip btn-chip today-finish" aria-label={`Finish ${t.title} in the idea form`}>
                    Finish
                  </Link>
                  <ChipButton disabled={busy} onClick={() => onClarify(t.id, "drop")} title={DROP_TITLE}>
                    Drop
                  </ChipButton>
                </div>
              </li>
            ) : (
              <li key={t.id} className="today-inbox-item">
                <div className="n">
                  <b>{t.title}</b>
                </div>
                <div className="today-opts" role="group" aria-label={`Sort ${t.title}`}>
                  {CHOICES.map((c) => (
                    <ChipButton
                      key={c.choice}
                      disabled={busy}
                      onClick={() => onClarify(t.id, c.choice)}
                      title={c.choice === "drop" ? DROP_TITLE : undefined}
                    >
                      {c.label}
                    </ChipButton>
                  ))}
                  {goals.length > 0 && (
                    <ChipButton disabled={busy} aria-expanded={pickingGoalFor === t.id} onClick={() => setPickingGoalFor((cur) => (cur === t.id ? null : t.id))}>
                      Goal ^
                    </ChipButton>
                  )}
                </div>
                {pickingGoalFor === t.id && (
                  <div className="today-opts" role="group" aria-label="Link to a goal">
                    {goals.map((g) => (
                      <ChipButton key={g.id} disabled={busy} onClick={() => onClarify(t.id, "goal", g.id)}>
                        ^{g.title}
                      </ChipButton>
                    ))}
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </Sheet>
  );
}
