"use client";

/**
 * A customer's "Orders" section (their page, while the tab's order list is
 * on; work-orders.ts): the lines linked to them, read-only (To order or
 * Ordered, the item, the date in words), "Add order" with the customer fixed
 * (their name and phone filled in), and a link to the tab's whole list,
 * where a line is ticked or edited.
 */
import { useState } from "react";
import Link from "next/link";
import { addWorkOrder } from "@/app/actions/work-orders";
import { isOrderOverdue, orderDateLabel, ordersHref, type OrderCustomerRef, type OrderView } from "@/lib/work-orders";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { OrderSheet } from "./OrderSheet";

export function CustomerOrders({ board, customer, orders, today }: { board: { id: string; name: string }; customer: OrderCustomerRef; orders: OrderView[]; today: DayKey }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
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
    </section>
  );
}
