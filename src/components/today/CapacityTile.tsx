"use client";

import { useState } from "react";
import { ruleOf, type BoardRow } from "@/lib/today-board";
import type { DayKey } from "@/lib/life-day";
import { fmtMinutes, fmtXp } from "./format";
import { capacityView, tomorrowOffer } from "./board-ui";

interface Props {
  planned: number;
  capacity: number;
  over: number;
  /** The capacity is one the player set, not the 4 h default. */
  chosen: boolean;
  suggestion: BoardRow | null;
  today: DayKey;
  busy: boolean;
  /** A capacity write in flight. */
  settingBusy?: boolean;
  onMove: (row: BoardRow) => void;
  /** Writes the player's own capacity (setDailyCapacity). */
  onSetCapacity?: (minutes: number) => void;
}

/** The capacities the tile offers, in minutes. */
const CAPACITY_CHOICES = [120, 180, 240, 360, 480] as const;

/**
 * The day's planned time against its capacity (Sunsama's workload line).
 *
 * The tile only warns against a capacity the player chose. Until then the
 * figure reads 'of 4h (default)', the tile stays neutral and offers to set
 * one: turning amber and proposing to move work because of a number nobody
 * picked would be a dishonest number.
 *
 * Over a chosen capacity it turns amber and offers one move: the cheapest
 * card that is safe to move (cheapestMovable) — and only a move the server
 * accepts (tomorrowOffer). It asks rather than moves, and one tap does it.
 * A repeating task can't be moved to tomorrow (tomorrow has its own), so
 * for one the offer is to skip today instead.
 */
export function CapacityTile({ planned, capacity, over, chosen, suggestion, today, busy, settingBusy = false, onMove, onSetCapacity }: Props) {
  const [choosing, setChoosing] = useState(false);
  const pct = capacity > 0 ? Math.min(1, planned / capacity) : 1;
  const view = capacityView({ over, chosen });
  const skip = suggestion ? !!ruleOf(suggestion.template) : false;
  const movable = suggestion ? skip || tomorrowOffer(suggestion.template, today).show : false;
  const showChoices = !!onSetCapacity && (!chosen || choosing);

  return (
    <div className="card flex min-w-0 flex-col gap-2" style={{ padding: "18px 16px", borderColor: view.warn ? "rgba(240,160,48,0.3)" : undefined }}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="label-xs">Capacity</span>
        {onSetCapacity && chosen && (
          <button
            type="button"
            className="today-inline-link"
            style={{ fontSize: 11, color: "var(--blue)" }}
            aria-expanded={choosing}
            onClick={() => setChoosing((c) => !c)}
          >
            {choosing ? "Done" : "Change"}
          </button>
        )}
      </span>
      <span className="mono" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: view.warn ? "var(--amber)" : "var(--ink-0)" }}>
        {fmtMinutes(planned)}
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)" }}>
          {" "}
          of {fmtMinutes(capacity)}
          {view.suffixDefault ? " (default)" : ""}
        </span>
      </span>
      <div className="today-bar" data-tone={view.tone} aria-hidden>
        <div className="today-bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      {view.warn ? (
        <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--amber)" }}>
          Over by {fmtMinutes(over)}.
          {suggestion && movable && view.offerMove && (
            <>
              {" "}
              {skip ? "Skip" : "Move"} <span style={{ color: "var(--ink-0)" }}>{suggestion.template.title}</span>
              {skip ? " today" : " to tomorrow"}? ({fmtXp(suggestion.projection.xp)} XP)
              <div className="mt-1.5">
                <button type="button" className="today-pill" disabled={busy} onClick={() => onMove(suggestion)}>
                  {skip ? "Skip today" : "Move to tomorrow"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <span style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
          {chosen
            ? "Planned for today, done or not"
            : `Planned for today, done or not. ${fmtMinutes(capacity)} is a default, not yours, so it never warns.${onSetCapacity ? " Set yours:" : ""}`}
        </span>
      )}
      {showChoices && (
        <div className="today-drawer-row" role="group" aria-label="Your daily capacity" aria-busy={settingBusy}>
          {CAPACITY_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              className="today-pill mono"
              aria-pressed={chosen && capacity === m}
              disabled={settingBusy}
              onClick={() => {
                setChoosing(false);
                onSetCapacity?.(m);
              }}
            >
              {fmtMinutes(m)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
