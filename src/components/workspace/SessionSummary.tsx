"use client";

/**
 * The hub's hero (redesign › Study › Review › Hub): the quest ring, "17 due ·
 * about 9 minutes · pays review points, 0 life XP", Start (Enter), and the
 * 40 px field chips. Or, when nothing is due, the three questions an empty
 * queue has to answer: is anything in here, when does it come back, and
 * what do I do now.
 */
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { minutesFor } from "@/lib/review-facts";

export interface HubField {
  id: string;
  name: string;
  due: number;
}

interface Props {
  quest: { done: number; target: number };
  /** Due in the selected scope. */
  dueCount: number;
  totalDue: number;
  fields: HubField[];
  selected: string;
  onSelect: (fieldName: string) => void;
  onStart: () => void;
  scheduledCount: number;
  upcoming: { label: string; count: number } | null;
}

export const ALL_FIELDS = "ALL";

export function SessionSummary({ quest, dueCount, totalDue, fields, selected, onSelect, onStart, scheduledCount, upcoming }: Props) {
  const cleared = quest.target > 0 && quest.done >= quest.target;
  const ring = quest.target > 0 && (
    <PromiseRing value={Math.min(quest.done, quest.target)} target={quest.target} size={64} label="Today's quest" showCount />
  );

  if (totalDue === 0) {
    return (
      <section className="card rv-hero" aria-labelledby="rv-hub-h">
        <div className="rv-hero-top">
          {ring}
          <div style={{ minWidth: 0 }}>
            <div className="t-eyebrow">{cleared ? "Today's quest · cleared" : "Review"}</div>
            <h2 id="rv-hub-h">{scheduledCount > 0 ? "Nothing due today" : "No ideas yet"}</h2>
            <p className="t-meta">
              {scheduledCount > 0
                ? `${scheduledCount} idea${scheduledCount === 1 ? "" : "s"} scheduled${upcoming ? ` · next ${upcoming.count} ${upcoming.label}` : ""}`
                : "Add one and it enters the rotation immediately."}
            </p>
          </div>
        </div>
        <Button href="/add" variant={scheduledCount > 0 ? "secondary" : "primary"} size="lg" block icon="plus">
          New idea
        </Button>
      </section>
    );
  }

  const withDue = fields.filter((f) => f.due > 0);
  return (
    <section className="card rv-hero" aria-labelledby="rv-hub-h">
      <div className="rv-hero-top">
        {ring}
        <div style={{ minWidth: 0 }}>
          <div className="t-eyebrow">{quest.target > 0 ? `Today's quest · ${cleared ? "cleared" : `${quest.target} cards`}` : "Review"}</div>
          <h2 id="rv-hub-h">
            <span className="num">{dueCount}</span> due
          </h2>
          <p className="t-meta">
            about {minutesFor(dueCount)} minute{minutesFor(dueCount) === 1 ? "" : "s"} · pays review points, 0 life XP
          </p>
        </div>
      </div>
      <Button variant="primary" size="lg" block icon="study" kbd="Enter" onClick={onStart} disabled={dueCount === 0}>
        Start review
      </Button>
      {withDue.length > 1 && (
        <div className="rv-chips" role="group" aria-label="Fields">
          <ChipButton pressed={selected === ALL_FIELDS} onClick={() => onSelect(ALL_FIELDS)}>
            All fields <span className="num">{totalDue}</span>
          </ChipButton>
          {withDue.map((f) => (
            <ChipButton key={f.id} pressed={selected === f.name} onClick={() => onSelect(f.name)}>
              {f.name} <span className="num">{f.due}</span>
            </ChipButton>
          ))}
        </div>
      )}
    </section>
  );
}
