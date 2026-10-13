"use client";

/**
 * A work tab's order list (/today/work/<id>/orders; work-orders.ts). The
 * header counts what is left to order (and what is overdue), holds "Add
 * order" and the filter: To order · Ordered · All, each with its count (To
 * order first). Each line: a 44 px Ordered tick (ticked: stamped ordered now,
 * with an Undo), the item, who it is for and their contact (a phone is a tap
 * to call, an email a tap to email), and the date in words ("Overdue · 12
 * Oct" for a line not ordered whose date has gone by). Tapping a line opens
 * its sheet (edit, and Archive with an Undo). The lines still to order come
 * soonest first; the ordered ones after, newest first.
 */
import { useId, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { addWorkOrder, archiveWorkOrder, editWorkOrder, restoreWorkOrder, setWorkOrderOrdered } from "@/app/actions/work-orders";
import {
  ORDER_FILTERS,
  ORDER_FILTER_LABEL,
  contactLinkOf,
  filterOrders,
  isOrderOverdue,
  orderCountsOf,
  orderDateLabel,
  orderedPatch,
  sortOrders,
  type OrderCustomerRef,
  type OrderFilter,
  type OrderView,
  type OrdersBoardView,
} from "@/lib/work-orders";
import type { DayKey } from "@/lib/life-day";
import { workBoardHref } from "@/lib/work-boards";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Tick } from "@/components/ui/Tick";
import { pushToast } from "@/components/ui/toast-store";
import { ORDER_UNREACHABLE, OrderSheet, type OrderFormValue } from "./OrderSheet";

/** Lines drawn at once in a filter; "Show more" adds as many again. */
export const LIST_STEP = 100;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: ORDER_UNREACHABLE };
  }
}

/** A toast's Undo: the reverse write, and a word when it could not be made. */
function undo(fn: () => Promise<Result<unknown>>) {
  void call(fn).then((res) => {
    if (!res.ok) pushToast({ title: "Couldn't undo that", body: res.error });
  });
}

/** A line as it reads the moment it is ticked (the server stamps the same: orderedPatch). */
export function tickedView(o: OrderView, ordered: boolean, at: Date, today: DayKey): OrderView {
  const p = orderedPatch({ ordered: o.ordered, orderedAt: o.orderedAt ? new Date(o.orderedAt) : null, date: o.date }, ordered, at, today);
  return { ...o, ordered: p.ordered, orderedAt: p.orderedAt ? p.orderedAt.toISOString() : null, date: p.date };
}

/** Who the line is for, and their contact: a tel: or mailto: link (a 44 px target), else the words. */
export function OrderWho({ o, showCustomer }: { o: OrderView; showCustomer: boolean }) {
  const link = o.contact ? contactLinkOf(o.contact) : null;
  return (
    <span className="ord-who">
      {showCustomer && o.customer && <span className="ord-num">#{o.customer.number}</span>}
      <span>{o.name}</span>
      {o.contact && (
        <>
          <span aria-hidden="true">·</span>
          {link?.href ? (
            <a className="ord-contact" href={link.href} aria-label={`${link.kind === "tel" ? "Call" : "Email"} ${o.name}: ${o.contact}`}>
              {o.contact}
            </a>
          ) : (
            <span>{o.contact}</span>
          )}
        </>
      )}
    </span>
  );
}

function OrderLine({ o, today, showCustomer, onTick, onOpen }: { o: OrderView; today: DayKey; showCustomer: boolean; onTick: () => void; onOpen: () => void }) {
  const overdue = isOrderOverdue(o, today);
  return (
    <li className="ord-row" data-ordered={o.ordered ? "" : undefined} data-overdue={overdue ? "" : undefined}>
      <Tick state={o.ordered ? "done" : "open"} label={`Ordered: ${o.item}`} onClick={onTick} />
      <div className="ord-main">
        <button type="button" className="ord-edit" onClick={onOpen} aria-haspopup="dialog" aria-label={`Edit order: ${o.item}, for ${o.name}`} />
        <b className="ord-item">{o.item}</b>
        <OrderWho o={o} showCustomer={showCustomer} />
        <span className="ord-date">{orderDateLabel(o.date, today, o.ordered)}</span>
      </div>
    </li>
  );
}

type SheetState = { order: OrderView | null; initial: OrderFormValue } | null;

export function OrdersView({ board, orders, customers, today }: { board: OrdersBoardView; orders: OrderView[]; customers: OrderCustomerRef[]; today: DayKey }) {
  const id = useId();
  const [filter, setFilter] = useState<OrderFilter>("todo");
  const [limit, setLimit] = useState(LIST_STEP);
  // A tick shows at once (and the line moves); the refreshed list replaces it when the write lands.
  const [shown, tickShown] = useOptimistic(orders, (list: OrderView[], p: { id: string; ordered: boolean; at: Date }) =>
    sortOrders(list.map((o) => (o.id === p.id ? tickedView(o, p.ordered, p.at, today) : o)))
  );
  const [error, setError] = useState<string | null>(null);
  // The sheet's data stays after it closes, so it slides away (and gives focus back) before the next one replaces it.
  const [sheet, setSheet] = useState<SheetState>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [, start] = useTransition();

  const counts = orderCountsOf(shown);
  const overdue = shown.filter((o) => isOrderOverdue(o, today)).length;
  const visible = filterOrders(shown, filter);

  function show(next: Exclude<SheetState, null>) {
    setSheetKey((k) => k + 1);
    setSheet(next);
    setSheetOpen(true);
    setError(null);
  }
  const close = () => setSheetOpen(false);

  function openAdd() {
    show({ order: null, initial: { item: "", name: "", contact: "", date: today, ordered: false, customer: "" } });
  }

  function openEdit(o: OrderView) {
    show({ order: o, initial: { item: o.item, name: o.name, contact: o.contact ?? "", date: o.date ?? "", ordered: o.ordered, customer: o.customer?.number ?? "" } });
  }

  function tick(o: OrderView) {
    const ordered = !o.ordered;
    setError(null);
    start(async () => {
      tickShown({ id: o.id, ordered, at: new Date() });
      const res = await call(() => setWorkOrderOrdered(o.id, ordered, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (ordered) {
        pushToast({
          key: `ord-tick-${o.id}`,
          title: "Marked ordered",
          body: o.item,
          action: { label: "Undo", onAction: () => undo(() => setWorkOrderOrdered(o.id, false, { refresh: true })) },
        });
      }
    });
  }

  return (
    <div className="page narrow cq-main crm-page">
      <Link className="crm-back" href={workBoardHref(board.id)}>
        <Icon name="back" />
        {board.name}
      </Link>

      <section className="card ord-head" aria-labelledby={`${id}-sum`}>
        <div className="ord-head-top">
          <p className="ord-sum" id={`${id}-sum`}>
            <span>
              <b>{counts.todo}</b> to order
            </span>
            {overdue > 0 && <span className="chip owed">{overdue} overdue</span>}
          </p>
          <Button variant="primary" icon="plus" onClick={openAdd} aria-haspopup="dialog">
            Add order
          </Button>
        </div>
        {orders.length > 0 && (
          <fieldset className="ord-filters">
            <legend className="sr-only">Show</legend>
            {ORDER_FILTERS.map((f) => (
              <label key={f} className="ord-filter">
                <input
                  type="radio"
                  name={`${id}-filter`}
                  value={f}
                  checked={filter === f}
                  onChange={() => {
                    setFilter(f);
                    setLimit(LIST_STEP);
                  }}
                />
                {ORDER_FILTER_LABEL[f]}
                <span className="ord-n">{counts[f]}</span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      {error && !sheetOpen && (
        <p className="crm-error" role="alert">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <section className="card crm-empty" aria-label="No orders yet">
          <h2>Nothing on the order list yet</h2>
          <p>Add who an order is for, how to reach them, the item and a date. Tick it once it has been ordered.</p>
          <Button variant="primary" icon="plus" onClick={openAdd} aria-haspopup="dialog">
            Add the first order
          </Button>
        </section>
      ) : (
        <section className="card ord-card" aria-label={`${ORDER_FILTER_LABEL[filter]}: ${visible.length}`}>
          {visible.length === 0 ? (
            <p className="crm-sec-note" style={{ paddingTop: 10 }}>
              {filter === "todo" ? "Nothing left to order. Every line is ordered." : "Nothing ordered yet. Tick a line once it has been ordered."}
            </p>
          ) : (
            <ul className="ord-list">
              {visible.slice(0, limit).map((o) => (
                <OrderLine key={o.id} o={o} today={today} showCustomer={board.crmOn} onTick={() => tick(o)} onOpen={() => openEdit(o)} />
              ))}
            </ul>
          )}
          {visible.length > limit && (
            <div className="ord-more">
              <p>
                Showing {limit} of {visible.length}.
              </p>
              <Button variant="secondary" onClick={() => setLimit((l) => l + LIST_STEP)}>
                Show more
              </Button>
            </div>
          )}
        </section>
      )}

      {sheet && (
        <OrderSheet
          key={sheetKey}
          open={sheetOpen}
          onClose={close}
          editing={sheet.order !== null}
          description={sheet.order ? `On ${board.name}` : `On ${board.name}. Dated today unless you pick a day.`}
          initial={sheet.initial}
          customerField={board.crmOn || Boolean(sheet.order?.customer)}
          customers={customers}
          linked={sheet.order?.customer ?? null}
          onSave={async (value) => {
            const o = sheet.order;
            const res = o ? await editWorkOrder(o.id, value, { refresh: true }) : await addWorkOrder(board.id, value, { refresh: true });
            if (!res.ok) return res.error;
            close();
            // The saved line shows: a filter that would hide it turns to the one it is under.
            if (filter !== "all") setFilter(value.ordered ? "ordered" : "todo");
            return null;
          }}
          onArchive={
            sheet.order
              ? async () => {
                  const o = sheet.order as OrderView;
                  const res = await archiveWorkOrder(o.id, { refresh: true });
                  if (!res.ok) return res.error;
                  close();
                  pushToast({ key: `ord-arch-${o.id}`, title: "Order archived", body: o.item, action: { label: "Undo", onAction: () => undo(() => restoreWorkOrder(o.id, { refresh: true })) } });
                  return null;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
