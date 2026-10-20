"use client";

/**
 * One deal as the pipeline and a customer's Deals tab draw it (deals.ts): its title (a tap opens its sheet) and value
 * ("$1,250"), the customer as a chip (a link to them; not on their own page), its day in words ("Close by Fri 30 Oct";
 * "Overdue · 12 Oct" in the owed ink; "Won Tue 20 Oct"), the note's first line, and its actions: "Move to…" (a menu of
 * the other stages, keyboard-friendly, no drag) and, once Won, "Create order" or its order's chip. useDealSheets hosts
 * the deal sheet and the order sheet a Won deal opens, and the moves (each with Undo in the dock).
 */
import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { createOrderFromDeal, moveDeal } from "@/app/actions/deals";
import { customerHref } from "@/lib/customers";
import { customerLabelOf } from "@/lib/customer-search";
import { DEAL_STAGE_LABEL, dealCloseLabel, formatMoney, isDealOverdue, moneyInputOf, moveTargetsOf, orderPrefillOf, type DealStage, type DealView } from "@/lib/deals";
import { detailPreviewOf } from "@/lib/scheduled-tasks";
import { ordersHref } from "@/lib/work-orders";
import type { DayKey } from "@/lib/life-day";
import { Icon } from "@/components/ui/Icon";
import { pushToast } from "@/components/ui/toast-store";
import { OrderSheet } from "@/components/orders/OrderSheet";
import { WorkMenu } from "@/components/work/WorkMenu";
import type { PickedCustomer } from "@/components/work/CustomerPicker";
import { DealSheet, dealCall, type DealFormValue } from "./DealSheet";

export function DealCard({
  deal,
  today,
  boardId,
  showCustomer = true,
  showStage = false,
  busy = false,
  onEdit,
  onMove,
  onCreateOrder,
}: {
  deal: DealView;
  today: DayKey;
  boardId: string;
  showCustomer?: boolean;
  /** A customer's own list (not in a stage's column): the stage beside the value. */
  showStage?: boolean;
  busy?: boolean;
  onEdit: () => void;
  onMove: (stage: DealStage) => void;
  onCreateOrder: () => void;
}) {
  const when = dealCloseLabel(deal, today);
  const overdue = isDealOverdue(deal, today);
  const note = detailPreviewOf(deal.note);
  return (
    <li className="dl-card" data-stage={deal.stage}>
      <button type="button" className="dl-open" onClick={onEdit} aria-haspopup="dialog" aria-label={`Edit deal: ${deal.title}, ${formatMoney(deal.valueCents)}, ${DEAL_STAGE_LABEL[deal.stage]}`}>
        <span className="dl-title">{deal.title}</span>
        <span className="dl-value">{formatMoney(deal.valueCents)}</span>
      </button>
      {((showCustomer && deal.customer) || showStage || when || note) && (
        <p className="dl-meta">
          {showStage && <span className="dl-stage">{DEAL_STAGE_LABEL[deal.stage]}</span>}
          {showCustomer && deal.customer && (
            <Link className="st-chip" href={customerHref(boardId, deal.customer.id)}>
              {customerLabelOf(deal.customer)}
            </Link>
          )}
          {when && (
            <span className="dl-when" data-overdue={overdue ? "" : undefined}>
              {when}
            </span>
          )}
          {note && <span className="st-detail">{note}</span>}
        </p>
      )}
      <div className="dl-acts">
        <WorkMenu
          label={`Move ${deal.title} to…`}
          buttonClass="st-act dl-move"
          align="start"
          disabled={busy}
          button={
            <>
              <Icon name="chev" />
              <span>Move to…</span>
            </>
          }
          items={moveTargetsOf(deal.stage).map((s) => ({ id: s, label: DEAL_STAGE_LABEL[s], onSelect: () => onMove(s) }))}
        />
        {deal.stage === "WON" &&
          (deal.order ? (
            <Link className="st-chip dl-order" href={ordersHref(boardId)}>
              <span className="sr-only">Order: </span>
              {deal.order.item}
            </Link>
          ) : (
            <button type="button" className="st-act dl-make" onClick={onCreateOrder} disabled={busy} aria-haspopup="dialog">
              <Icon name="plus" />
              <span>Create order</span>
            </button>
          ))}
      </div>
    </li>
  );
}

/** A deal sheet's start for a new deal (optionally for a customer). */
export function newDealValue(customer: PickedCustomer | null = null): DealFormValue {
  return { title: "", value: "", stage: "NEW", expectedCloseDay: "", note: "", customer };
}

/** A deal sheet's start for an edit. */
export function dealValueOf(d: DealView): DealFormValue {
  return { title: d.title, value: moneyInputOf(d.valueCents), stage: d.stage, expectedCloseDay: d.expectedCloseDay ?? "", note: d.note ?? "", customer: d.customer ? { id: d.customer.id, number: d.customer.number, name: d.customer.name } : null };
}

/**
 * The deal sheet, the order sheet a Won deal opens, and the moves, for a list of deals (the pipeline, a customer's
 * tab). Each sheet's data stays after it closes, so it slides away before the next opening replaces it.
 */
export function useDealSheets(board: { id: string; name: string; ordersOn: boolean }, today: DayKey, opts: { fixedCustomer?: boolean } = {}) {
  const [deal, setDeal] = useState<{ editing: DealView | null; initial: DealFormValue } | null>(null);
  const [dealOpen, setDealOpen] = useState(false);
  const [order, setOrder] = useState<DealView | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  // Stable (setters only), so a page may open one from an effect (?new=1).
  const openNew = useCallback((customer: PickedCustomer | null = null) => {
    setKey((k) => k + 1);
    setDeal({ editing: null, initial: newDealValue(customer) });
    setDealOpen(true);
  }, []);
  const openEdit = useCallback((d: DealView) => {
    setKey((k) => k + 1);
    setDeal({ editing: d, initial: dealValueOf(d) });
    setDealOpen(true);
  }, []);
  const openOrder = useCallback((d: DealView) => {
    setDealOpen(false);
    setKey((k) => k + 1);
    setOrder(d);
    setOrderOpen(true);
  }, []);
  function move(d: DealView, stage: DealStage) {
    setBusy(d.id);
    setError(null);
    const from = d.stage;
    start(async () => {
      const res = await dealCall(() => moveDeal(d.id, stage, { refresh: true }));
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      pushToast({
        key: `deal-move-${d.id}`,
        title: `Moved to ${DEAL_STAGE_LABEL[stage]}`,
        body: `${d.title} · ${formatMoney(d.valueCents)}`,
        action: { label: "Undo", onAction: () => void dealCall(() => moveDeal(d.id, from, { refresh: true })) },
      });
    });
  }

  const node = (
    <>
      {deal && (
        <DealSheet
          key={`deal-${key}`}
          open={dealOpen}
          onClose={() => setDealOpen(false)}
          board={board}
          editing={deal.editing}
          initial={deal.initial}
          fixedCustomer={opts.fixedCustomer}
          onCreateOrder={openOrder}
        />
      )}
      {order && (
        <OrderSheet
          key={`order-${key}`}
          open={orderOpen}
          onClose={() => setOrderOpen(false)}
          editing={false}
          description={`From the deal “${order.title}”. Dated today unless you pick a day.`}
          initial={orderPrefillOf(order, today)}
          customerField={false}
          customers={order.customer ? [order.customer] : []}
          fixedCustomer={order.customer ?? null}
          onSave={async (value) => {
            const res = await dealCall(() => createOrderFromDeal(order.id, value, { refresh: true }));
            if (!res.ok) return res.error;
            setOrderOpen(false);
            pushToast({ key: `deal-order-${order.id}`, title: "Order created", body: `${value.item} · on the order list` });
            return null;
          }}
        />
      )}
    </>
  );
  return { openNew, openEdit, openOrder, move, busy, error, node };
}
