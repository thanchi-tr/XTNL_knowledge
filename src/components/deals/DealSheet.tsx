"use client";

/**
 * Add or edit a deal (deals.ts holds every rule the server holds too). The fields: the title, the value in dollars
 * (AUD, "1,250" or "1250.50"; shown back as "$1,250"), the stage (New · Quoted · Won · Lost; Won and Lost stamp the day
 * it closed), the customer (optional: the work frame's matcher; fixed on a customer's own page), the day it is
 * expected to close, and a note. An edit adds Archive (Undo in the dock) and, for a Won deal with no order yet,
 * "Create order": the caller closes this sheet and opens the order sheet prefilled (deals.ts orderPrefillOf); while the
 * tab's order list is off it offers to switch it on (the tab's own switch, setOrdersOn). It calls the actions itself;
 * a parent remounts it (its `key`) each time it opens.
 */
import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { archiveDeal, createDeal, editDeal, restoreDeal } from "@/app/actions/deals";
import { setOrdersOn } from "@/app/actions/work-orders";
import { DEAL_NOTE_MAX, DEAL_STAGES, DEAL_STAGE_LABEL, DEAL_TITLE_MAX, cleanDealInput, formatMoney, type DealStage, type DealView } from "@/lib/deals";
import { ordersHref } from "@/lib/work-orders";
import { customerLabelOf } from "@/lib/customer-search";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { pushToast } from "@/components/ui/toast-store";
import { CustomerPicker, type PickedCustomer } from "@/components/work/CustomerPicker";

export const DEAL_UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";
const count = (s: string) => [...s].length;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export async function dealCall<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: DEAL_UNREACHABLE };
  }
}

export interface DealFormValue {
  title: string;
  /** Dollars as typed. */
  value: string;
  stage: DealStage;
  /** 'YYYY-MM-DD' or "". */
  expectedCloseDay: string;
  note: string;
  customer: PickedCustomer | null;
}

export function DealSheet({
  open,
  onClose,
  board,
  editing,
  initial,
  fixedCustomer = false,
  onCreateOrder,
}: {
  open: boolean;
  onClose: () => void;
  board: { id: string; name: string; ordersOn: boolean };
  editing: DealView | null;
  initial: DealFormValue;
  /** A customer's own page: the customer is shown, not picked. */
  fixedCustomer?: boolean;
  /** A Won deal's "Create order": the caller opens the order sheet. */
  onCreateOrder?: (deal: DealView) => void;
}) {
  const ids = useId();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof DealFormValue>(k: K) => (value: DealFormValue[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    if (error) setError(null);
  };

  function input() {
    return { title: v.title, value: v.value, stage: v.stage, expectedCloseDay: v.expectedCloseDay, note: v.note, customerId: v.customer?.id ?? null };
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const value = input();
    const local = cleanDealInput(value);
    if (!local.ok) {
      setError(local.error);
      return;
    }
    start(async () => {
      const res = editing ? await dealCall(() => editDeal(editing.id, value, { refresh: true })) : await dealCall(() => createDeal(board.id, value, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      if (!editing) pushToast({ key: `deal-new-${res.value.id}`, title: "Deal added", body: `${local.value.title} · ${formatMoney(local.value.valueCents)} · ${DEAL_STAGE_LABEL[local.value.stage]}` });
    });
  }

  function archive() {
    if (!editing) return;
    start(async () => {
      const res = await dealCall(() => archiveDeal(editing.id, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      pushToast({
        key: `deal-arch-${editing.id}`,
        title: "Deal archived",
        body: editing.title,
        holdMs: 10_000,
        action: { label: "Undo", onAction: () => void dealCall(() => restoreDeal(editing.id, { refresh: true })) },
      });
    });
  }

  function ordersOn() {
    start(async () => {
      const res = await dealCall(() => setOrdersOn(board.id, true, { refresh: true }));
      if (!res.ok) setError(res.error);
    });
  }

  const won = editing?.stage === "WON";
  return (
    <Sheet
      open={open}
      onClose={() => !pending && onClose()}
      title={editing ? "Edit deal" : "New deal"}
      description={editing ? `On ${board.name} · ${DEAL_STAGE_LABEL[editing.stage]}` : `On ${board.name}. What it is, what it is worth, and where it stands.`}
      footer={
        <div className="st-foot">
          <Button variant="primary" size="lg" type="submit" form={`${ids}-form`} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add deal"}
          </Button>
          {editing && (
            <Button variant="quiet" onClick={archive} disabled={pending}>
              Archive
            </Button>
          )}
        </div>
      }
    >
      <form id={`${ids}-form`} className="st-form" onSubmit={save} noValidate>
        {editing && won && (
          <div className="dl-won">
            {editing.order ? (
              <p className="st-hint">
                Its order: <b>{editing.order.item}</b>. <Link href={ordersHref(board.id)}>Open the order list</Link>
              </p>
            ) : board.ordersOn ? (
              <>
                <p className="st-hint">Won. Put it on the order list: the customer and this deal&apos;s title are filled in.</p>
                <Button variant="secondary" icon="plus" onClick={() => onCreateOrder?.(editing)} disabled={pending || !onCreateOrder} aria-haspopup="dialog">
                  Create order
                </Button>
              </>
            ) : (
              <>
                <p className="st-hint">Won. This tab keeps no order list yet: switch it on to turn this deal into an order (nothing else changes).</p>
                <Button variant="secondary" onClick={ordersOn} disabled={pending}>
                  Turn the order list on
                </Button>
              </>
            )}
          </div>
        )}

        <div className="st-field">
          <label className="st-label" htmlFor={`${ids}-title`}>
            Deal <span className="t-meta">{count(v.title.trim())}/{DEAL_TITLE_MAX}</span>
          </label>
          <input id={`${ids}-title`} className="st-input" value={v.title} onChange={(e) => set("title")(e.target.value)} maxLength={DEAL_TITLE_MAX + 8} autoComplete="off" placeholder="NBN 100 for the shop" data-autofocus />
        </div>

        <div className="st-field">
          <label className="st-label" htmlFor={`${ids}-value`}>
            Value <span className="t-meta">AUD</span>
          </label>
          <div className="dl-money-in">
            <span aria-hidden="true">$</span>
            <input id={`${ids}-value`} className="st-input" inputMode="decimal" value={v.value} onChange={(e) => set("value")(e.target.value)} autoComplete="off" placeholder="1,250" />
          </div>
        </div>

        <fieldset className="st-field">
          <legend className="st-label">Stage</legend>
          <div className="st-channels" role="radiogroup" aria-label="Stage">
            {DEAL_STAGES.map((s) => (
              <label key={s} className="st-chan">
                <input type="radio" name={`${ids}-stage`} value={s} checked={v.stage === s} onChange={() => set("stage")(s)} />
                {DEAL_STAGE_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="st-field">
          <label className="st-label" htmlFor={`${ids}-cust`}>
            Customer <span className="t-meta">optional</span>
          </label>
          {fixedCustomer && v.customer ? <p className="st-picked st-picked-l">{customerLabelOf(v.customer)}</p> : <CustomerPicker id={`${ids}-cust`} value={v.customer} onChange={(c) => set("customer")(c)} disabled={pending} />}
        </div>

        <div className="st-field">
          <label className="st-label" htmlFor={`${ids}-close`}>
            Expected to close <span className="t-meta">optional</span>
          </label>
          <input id={`${ids}-close`} className="st-input" type="date" value={v.expectedCloseDay} min="2000-01-01" max="2099-12-31" onChange={(e) => set("expectedCloseDay")(e.target.value)} />
        </div>

        <div className="st-field">
          <label className="st-label" htmlFor={`${ids}-note`}>
            Note <span className="t-meta">{count(v.note.trim())}/{DEAL_NOTE_MAX}</span>
          </label>
          <textarea id={`${ids}-note`} className="st-input" rows={3} value={v.note} onChange={(e) => set("note")(e.target.value)} maxLength={DEAL_NOTE_MAX + 20} />
        </div>

        {error && (
          <p className="st-err" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
