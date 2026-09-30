"use client";

/**
 * M2-READY (presentational). The Days controls that arrive with rest days
 * and debt (docs/life-plan/m2.md): standing rest weekdays and "accept a
 * loss". Settings shows an honest "arrives with …" row until M2's server
 * honours these (LifeSettings.restWeekdays, LifeSettings.debtWriteOff);
 * then M2 swaps the rows for these and wires onChange to its action.
 * Fixtures belong on a gated /dev/style sub-route, never on a real page.
 */
import { ChipButton } from "@/components/ui/Chip";
import { Switch } from "@/components/ui/Tabs";
import { WEEKDAYS, normalizeWeekdays, restWeekdaysLabel } from "./settings-model";
import "./settings.css";

/** Seven 40 px toggle chips, Monday first. A rest day is held: nothing is owed and the streak waits. */
export function RestWeekdaysPicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const on = normalizeWeekdays(value);
  return (
    <div className="set-presets" role="group" aria-label={`Rest weekdays: ${restWeekdaysLabel(on)}`}>
      {WEEKDAYS.map((d) => (
        <ChipButton
          key={d.n}
          pressed={on.includes(d.n)}
          disabled={disabled}
          aria-label={d.long}
          onClick={() => onChange(normalizeWeekdays(on.includes(d.n) ? on.filter((x) => x !== d.n) : [...on, d.n]))}
        >
          {d.short}
        </ChipButton>
      ))}
    </div>
  );
}

/** The "accept a loss" row: write off debt older than 14 days. Off by default: debt stays until it is done. */
export function AcceptLossRow({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <div className="set-row">
      <div className="n">
        <b>Accept a loss</b>
        <span>{checked ? "Debt older than 14 days is written off, once, with its reason on the ledger." : "Off: debt stays until it is made up."}</span>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label="Accept a loss on debt older than 14 days" />
    </div>
  );
}
