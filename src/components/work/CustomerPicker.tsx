"use client";

/**
 * Pick a customer of the tab (Phase 2's deal sheet; the scheduled task sheet keeps its own, the same engine): the work
 * frame's index and the header's matcher (customer-search.ts), live as you type, "Jane Nguyen · C-1042" with the match
 * marked; Enter takes the top match and never submits the sheet, ↓ moves into the list; the picked one shows with a
 * 44 px × to clear it. Without the index (its read failed) it says so: the field is optional.
 */
import { useMemo, useState } from "react";
import { customerLabelOf, matchCustomers, prepareIndex } from "@/lib/customer-search";
import { Icon } from "@/components/ui/Icon";
import { CustomerResult } from "./WorkSearch";
import { useWorkContext } from "./work-store";

export interface PickedCustomer {
  id: string;
  number: string;
  name: string;
}

const PICKER_CAP = 6;

export function CustomerPicker({ id, value, onChange, disabled }: { id: string; value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; disabled?: boolean }) {
  const { index } = useWorkContext();
  const [q, setQ] = useState("");
  const prepared = useMemo(() => (index ? prepareIndex(index.customers) : null), [index]);
  const picks = prepared && q.trim() ? matchCustomers(prepared, q, { limit: PICKER_CAP }) : null;

  if (value) {
    return (
      <div className="st-picked">
        <span className="st-picked-l">{customerLabelOf(value)}</span>
        <button type="button" className="st-x" onClick={() => onChange(null)} disabled={disabled} aria-label={`Remove the customer ${customerLabelOf(value)}`}>
          <Icon name="x" />
        </button>
      </div>
    );
  }
  if (!index) return <p className="st-hint">The customer list couldn&apos;t load. Save without one, or try again.</p>;
  const take = (e: { id: string; number: string; name: string }) => {
    onChange({ id: e.id, number: e.number, name: e.name });
    setQ("");
  };
  return (
    <>
      <input
        id={id}
        className="st-input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const top = picks?.results[0];
            if (top) take(top.entry);
          } else if (e.key === "ArrowDown") {
            const first = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".st-pick");
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
        placeholder="Customer ID, name or phone"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-describedby={`${id}-n`}
      />
      <p id={`${id}-n`} className="st-hint" aria-live="polite">
        {!q.trim() ? "Type to find a customer of this tab." : picks && picks.total > 0 ? `${picks.total} found.` : "No customer matches."}
      </p>
      {picks && picks.results.length > 0 && (
        <ul className="st-picks" aria-label="Matching customers">
          {picks.results.map((m) => (
            <li key={m.entry.id}>
              <button type="button" className="st-pick" onClick={() => take(m.entry)}>
                <CustomerResult m={m} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
