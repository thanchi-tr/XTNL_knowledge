"use client";

/**
 * A customer's "Orders" section (their page, while the tab's order list is
 * on; work-orders.ts): the lines linked to them, read-only (To order or
 * Ordered, the item, the date in words), "Add order" with the customer fixed
 * (their name and phone filled in), and a link to the tab's whole list,
 * where a line is ticked or edited. Since Phase 2 (crm.ts) each line offers
 * "Start a collection" (a task collection for that order, prefilled with its
 * item: components/customers/CollectionSheet), or names the collection it has.
 */
import { useState } from "react";
import Link from "next/link";
import { addWorkOrder } from "@/app/actions/work-orders";
import { isOrderOverdue, orderDateLabel, ordersHref, type OrderCustomerRef, type OrderView } from "@/lib/work-orders";
import { COLLECTION_NAME_MAX, customerTabHref } from "@/lib/crm";
import { CollectionSheet } from "@/components/customers/CollectionSheet";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { OrderSheet } from "./OrderSheet";

export function CustomerOrders({
  board,
  customer,
  orders,
  today,
  collectionOf = {},
}: {
  board: { id: string; name: string };
  customer: OrderCustomerRef;
  orders: OrderView[];
  today: DayKey;
  /** Each order's open task collection (Phase 2), by the order's id. */
  collectionOf?: Readonly<Record<string, { id: string; name: string }>>;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const [collect, setCollect] = useState<OrderView | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const todo = orders.filter((o) => !o.ordered).length;

  return (
    <section className="card crm-sec" aria-labelledby="ord-cust-h">
      <div className="crm-sec-h">
        <h2 id="ord-cust-h">Orders</h2>
        {todo > 0 && <span className="t-meta">{todo} to order</span>}
        <Button
          variant="secondary"
          icon="plus"
          aria-haspopup="dialog"
          onClick={() => {
            setKey((k) => k + 1);
            setOpen(true);
          }}
        >
          Add order
        </Button>
      </div>
      {orders.length === 0 ? (
        <p className="crm-sec-note">No orders for {customer.name} yet.</p>
      ) : (
        <ul className="ord-mini">
          {orders.map((o) => (
            <li key={o.id} className="ord-mini-row" data-ordered={o.ordered ? "" : undefined} data-overdue={isOrderOverdue(o, today) ? "" : undefined}>
              <span className={cx("chip", o.ordered && "kept")}>{o.ordered ? "Ordered" : "To order"}</span>
              <span className="ord-mini-main">
                <b className="ord-item">{o.item}</b>
                <span className="ord-date">{orderDateLabel(o.date, today, o.ordered)}</span>
                {collectionOf[o.id] ? (
                  <Link className="ord-mini-act" href={customerTabHref(board.id, customer.id, "tasks")}>
                    Collection: {collectionOf[o.id].name}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="ord-mini-act"
                    aria-haspopup="dialog"
                    aria-label={`Start a collection for ${o.item}`}
                    onClick={() => {
                      setKey((k) => k + 1);
                      setCollect(o);
                      setCollectOpen(true);
                    }}
                  >
                    Start a collection
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link className="ord-all" href={ordersHref(board.id)}>
        Open the order list
        <Icon name="chev" />
      </Link>

      <OrderSheet
        key={key}
        open={open}
        onClose={() => setOpen(false)}
        editing={false}
        description={`For #${customer.number} on ${board.name}. Dated today unless you pick a day.`}
        initial={{ item: "", name: customer.name, contact: customer.phone ?? "", date: today, ordered: false, customer: customer.number }}
        customerField={false}
        customers={[customer]}
        fixedCustomer={customer}
        onSave={async (value) => {
          const res = await addWorkOrder(board.id, value, { refresh: true });
          if (!res.ok) return res.error;
          setOpen(false);
          return null;
        }}
      />
      {collect && (
        <CollectionSheet
          key={`coll-${key}`}
          open={collectOpen}
          onClose={() => setCollectOpen(false)}
          customer={{ id: customer.id, name: customer.name }}
          editing={null}
          initial={{ name: [...collect.item].slice(0, COLLECTION_NAME_MAX).join(""), note: "", orderId: collect.id }}
          ordersOn
          orders={orders.map((o) => ({ id: o.id, item: o.item, ordered: o.ordered }))}
        />
      )}
    </section>
  );
}
