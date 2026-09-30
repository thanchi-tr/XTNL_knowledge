"use client";

import { ruleOf, type BoardRow } from "@/lib/today-board";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { approx } from "@/components/ui/format";
import { fmtMinutes } from "./format";
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

/** The capacities on offer, in minutes. */
const CAPACITY_CHOICES = [120, 180, 240, 360, 480] as const;

/**
 * The day's planned time against its capacity (Sunsama's workload line),
 * opened from the Day ledger's third cell.
 *
 * It only warns against a capacity the player chose. Until then the
 * figure reads 'of 4h (default)', nothing warns, and it offers to set one:
 * proposing to move work because of a number nobody picked would be a
 * dishonest number (board-ui.capacityView).
 *
 * Over a chosen capacity it says by how much and offers one move: the
 * cheapest card that is safe to move (cheapestMovable) — and only a move
 * the server accepts (tomorrowOffer). It asks rather than moves, and one
 * tap does it. A repeating task can't be moved to tomorrow (tomorrow has
 * its own), so for one the offer is to skip today instead.
 */
export function CapacityPanel({ planned, capacity, over, chosen, suggestion, today, busy, settingBusy = false, onMove, onSetCapacity }: Props) {
  const view = capacityView({ over, chosen });
  const skip = suggestion ? !!ruleOf(suggestion.template) : false;
  const movable = suggestion ? skip || tomorrowOffer(suggestion.template, today).show : false;
  const pct = capacity > 0 ? Math.min(1, planned / capacity) : 1;

  return (
    <div className="today-capacity">
      <p className="cap-fig">
        <span className="t-numeral-s num">{fmtMinutes(planned)}</span>
        <span className="t-meta">
          {" "}
          planned of {fmtMinutes(capacity)}
          {view.suffixDefault ? " (default)" : ""}
        </span>
      </p>
      <Meter value={pct} thin label="Planned time against capacity" valueText={`${fmtMinutes(planned)} of ${fmtMinutes(capacity)}`} />
      {view.warn ? (
        <div className="cap-warn">
          <p>
            <b className="ink-0">Over by {fmtMinutes(over)}.</b>
            {suggestion && movable && view.offerMove && (
              <>
                {" "}
                {skip ? "Skip" : "Move"} <b className="ink-0">{suggestion.template.title}</b>
                {skip ? " today" : " to tomorrow"}?{" "}
                <span className="cur">
                  <CurrencyGlyph kind="xp" />
                  <span className="num">{approx(suggestion.projection.xp)}</span>
                </span>
              </>
            )}
          </p>
          {suggestion && movable && view.offerMove && (
            <Button variant="secondary" disabled={busy} onClick={() => onMove(suggestion)}>
              {skip ? "Skip today" : "Move to tomorrow"}
            </Button>
          )}
        </div>
      ) : (
        <p className="t-meta">
          {chosen
            ? "Planned for today, done or not."
            : `Planned for today, done or not. ${fmtMinutes(capacity)} is a default, not yours, so it never warns.${onSetCapacity ? " Set yours:" : ""}`}
        </p>
      )}
      {onSetCapacity && (
        <div className="today-opts" role="group" aria-label="Your daily capacity" aria-busy={settingBusy}>
          {CAPACITY_CHOICES.map((m) => (
            <ChipButton key={m} pressed={chosen && capacity === m} disabled={settingBusy} onClick={() => onSetCapacity(m)}>
              {fmtMinutes(m)}
            </ChipButton>
          ))}
        </div>
      )}
    </div>
  );
}
