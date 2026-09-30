"use client";

import { ruleOf, type BoardRow } from "@/lib/today-board";
import { fmtMinutes, fmtXp } from "./format";

interface Props {
  planned: number;
  capacity: number;
  over: number;
  suggestion: BoardRow | null;
  busy: boolean;
  onMove: (row: BoardRow) => void;
}

/**
 * The day's planned time against its capacity (Sunsama's workload line).
 *
 * Over capacity the tile turns amber and offers one move: the cheapest
 * card that is safe to move — never a compulsory one, never a study task.
 * It asks rather than moves, and one tap does it. A repeating task can't be
 * moved to tomorrow (tomorrow has its own), so for one the offer is to skip
 * today instead.
 */
export function CapacityTile({ planned, capacity, over, suggestion, busy, onMove }: Props) {
  const pct = capacity > 0 ? Math.min(1, planned / capacity) : 1;
  const isOver = over > 0;
  const skip = suggestion ? !!ruleOf(suggestion.template) : false;

  return (
    <div className="card flex min-w-0 flex-col gap-2" style={{ padding: "18px 16px", borderColor: isOver ? "rgba(240,160,48,0.3)" : undefined }}>
      <span className="label-xs">Capacity</span>
      <span className="mono" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: isOver ? "var(--amber)" : "var(--ink-0)" }}>
        {fmtMinutes(planned)}
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)" }}> of {fmtMinutes(capacity)}</span>
      </span>
      <div className="today-bar" data-tone={isOver ? "amber" : "blue"} aria-hidden>
        <div className="today-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      {isOver ? (
        <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--amber)" }}>
          Over by {fmtMinutes(over)}.
          {suggestion && (
            <>
              {" "}
              {skip ? "Skip" : "Move"} <span style={{ color: "var(--ink-0)" }}>{suggestion.template.title}</span>
              {skip ? " today" : " to tomorrow"}? ({fmtXp(suggestion.projection.xp)} XP)
              <div className="mt-1.5">
                <button type="button" className="today-pill" disabled={busy} onClick={() => onMove(suggestion)} style={{ minHeight: 34 }}>
                  {skip ? "Skip today" : "Move to tomorrow"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>Planned for today, done or not</span>
      )}
    </div>
  );
}
