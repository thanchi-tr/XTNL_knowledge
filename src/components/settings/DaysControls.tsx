"use client";

/**
 * The Days controls (presentational): "Accept a loss" and the standing rest
 * weekdays picker. Settings › Days renders AcceptLossRow from Duty's launch
 * day, wired to actions/duty setDebtWriteOff (LifeSettings.debtWriteOff);
 * RestWeekdaysPicker stays unused until standing rest weekdays ship
 * (m2-refit.md decision 14), and Settings keeps its honest 'not yet' row.
 * Fixtures belong on a gated /dev/style sub-route, never on a real page.
 */
import { WRITE_OFF_MIN_DAYS } from "@/lib/duty-economy";
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

/**
 * The "accept a loss" row. On, a debt WRITE_OFF_MIN_DAYS old or more offers
 * 'Accept the loss' on its make-up card (nothing is written off by itself;
 * the miss stays on the ledger). Off by default: debt stays until it is made up.
 */
export function AcceptLossRow({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <div className="set-row">
      <div className="n">
        <b>Accept a loss</b>
        <span>
          {checked
            ? `On: a debt ${WRITE_OFF_MIN_DAYS} days old or more offers Accept the loss on its card. The miss stays on the ledger.`
            : "Off: debt stays until it is made up."}
        </span>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={`Accept a loss on debt ${WRITE_OFF_MIN_DAYS} days old or more`} />
    </div>
  );
}
