"use client";

/**
 * A customer's Check tab (Phase 2, 2026-10-20; crm.ts): their checks, newest recorded first, each "Record at Tue 20 Oct"
 * and its Rate, Home and Work (only the filled ones), a tap to edit; "Add check" (today's day unless another is
 * picked, never after it). Archive is in the sheet, with Undo in the dock. The labels are the user's own: Rate, Home,
 * Work, Record at.
 */
import { useState } from "react";
import { addCustomerCheck, archiveCustomerCheck, editCustomerCheck, restoreCustomerCheck } from "@/app/actions/crm";
import { CHECK_FIELDS, CHECK_LABELS, dayLabel, type CustomerCheckView } from "@/lib/crm";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { pushToast } from "@/components/ui/toast-store";
import { CheckSheet, UNREACHABLE, type CheckFormValue } from "./CustomerSheets";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

export function CustomerChecks({ customer, checks, today }: { customer: { id: string; name: string }; checks: CustomerCheckView[]; today: DayKey }) {
  // The sheet's data stays after it closes, so it slides away before the next opening replaces it.
  const [sheet, setSheet] = useState<{ check: CustomerCheckView | null; initial: CheckFormValue } | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  function show(check: CustomerCheckView | null) {
    setKey((k) => k + 1);
    setSheet({ check, initial: check ? { rate: check.rate ?? "", home: check.home ?? "", work: check.work ?? "", recordedAt: check.recordedAt } : { rate: "", home: "", work: "", recordedAt: today } });
    setOpen(true);
  }

  return (
    <section className="card crm-sec" aria-labelledby="crm-check-h">
      <div className="crm-sec-h">
        <h2 id="crm-check-h">Check</h2>
        {checks.length > 0 && <span className="t-meta">{checks.length}</span>}
        <Button variant="secondary" icon="plus" onClick={() => show(null)} aria-haspopup="dialog">
          Add check
        </Button>
      </div>
      {checks.length === 0 ? (
        <p className="crm-sec-note">No checks yet. Record their Rate, Home and Work, and the day it was recorded.</p>
      ) : (
        <ol className="crm-checks">
          {checks.map((c) => (
            <li key={c.id}>
              <button type="button" className="crm-check-btn" onClick={() => show(c)} aria-haspopup="dialog">
                <span className="sr-only">Edit check: </span>
                <span className="crm-check-day">
                  {CHECK_LABELS.recordedAt} {dayLabel(c.recordedAt, today)}
                </span>
                <dl className="crm-check-dl">
                  {CHECK_FIELDS.filter((f) => c[f]).map((f) => (
                    <div key={f}>
                      <dt>{CHECK_LABELS[f]}</dt>
                      <dd>{c[f]}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            </li>
          ))}
        </ol>
      )}

      {sheet && (
        <CheckSheet
          key={key}
          open={open}
          onClose={() => setOpen(false)}
          editing={sheet.check !== null}
          initial={sheet.initial}
          today={today}
          onSave={async (value) => {
            const c = sheet.check;
            const res = c ? await call(() => editCustomerCheck(c.id, value, { refresh: true })) : await call(() => addCustomerCheck(customer.id, value, { refresh: true }));
            if (!res.ok) return res.error;
            setOpen(false);
            return null;
          }}
          onArchive={
            sheet.check
              ? async () => {
                  const c = sheet.check as CustomerCheckView;
                  const res = await call(() => archiveCustomerCheck(c.id, { refresh: true }));
                  if (!res.ok) return res.error;
                  setOpen(false);
                  pushToast({
                    key: `crm-check-${c.id}`,
                    title: "Check archived",
                    body: `${CHECK_LABELS.recordedAt} ${dayLabel(c.recordedAt, today)}`,
                    action: {
                      label: "Undo",
                      onAction: () =>
                        void call(() => restoreCustomerCheck(c.id, { refresh: true })).then((r) => {
                          if (!r.ok) pushToast({ title: "Couldn't undo that", body: r.error });
                        }),
                    },
                  });
                  return null;
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
