import type { Metadata } from "next";
import "@/components/customers/customers.css";
import "@/components/orders/orders.css";
import "@/components/deals/deals.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadCustomerPage } from "@/lib/customers-server";
import { loadCustomerOrders } from "@/lib/work-orders-server";
import { resolveTaskParam } from "@/lib/scheduled-tasks-server";
import { loadCustomerCrm } from "@/lib/crm-server";
import { loadCustomerDeals } from "@/lib/deals-server";
import { TASK_PARAM, taskParamOf } from "@/lib/customers";
import { customerTabOf } from "@/lib/crm";
import { todayKey } from "@/lib/life-day";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CrmGate } from "@/components/customers/CrmGate";
import { CustomerView } from "@/components/customers/CustomerView";
import { CustomerOrders } from "@/components/orders/CustomerOrders";

// Overdue turns on the clock: never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Customer" };

/**
 * One customer on a work tab (customers.ts, crm.ts; /today/work/<id>/customers/<customerId>), as tabs since Phase 2:
 * Overview · Tasks · Check · Info · History · Orders · Deals (CustomerView). `?tab=` opens one; `?task=<id>` (an old
 * customer task reminder's tap URL; the id is a scheduled task's, or the customer task it was backfilled from) lands on
 * Tasks with that task highlighted and scrolled into view. One wave reads the customer (their details, scheduled tasks,
 * infos and log), their Check log, collections and follow-up (crm-server), their deals (deals-server) and, while the
 * tab's order list is on, their orders (work-orders.ts); a failed side read is no section, never a broken page. A
 * customer on another tab, or an unknown one, is a 404; an archived tab, or one whose list is off, says so.
 */
export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string; customerId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ boardId, customerId }, query] = await Promise.all([params, searchParams]);
  const now = new Date();
  const asked = taskParamOf(query[TASK_PARAM]);
  const [page, orders, focus, crm, deals] = await Promise.all([
    loadCustomerPage(getCurrentUserId(), boardId, customerId),
    loadCustomerOrders(getCurrentUserId(), boardId, customerId, now).catch((err) => {
      console.error("[orders] customer read failed", err);
      return null;
    }),
    asked ? resolveTaskParam(getCurrentUserId(), asked).catch(() => null) : Promise.resolve(null),
    loadCustomerCrm(getCurrentUserId(), boardId, customerId, now).catch((err) => {
      console.error("[crm] customer read failed", err);
      return null;
    }),
    loadCustomerDeals(getCurrentUserId(), boardId, customerId).catch((err) => {
      console.error("[deals] customer read failed", err);
      return null;
    }),
  ]);
  if (page.kind === "gone") notFound();
  if (page.kind !== "ok") {
    return (
      <>
        <ShellTitle eyebrow={page.board.name} title="Customer" />
        <CrmGate board={page.board} kind={page.kind} />
      </>
    );
  }

  const ordersOn = orders !== null;
  // Each order's open collection (its "Start a collection" names the one it has).
  const collectionOf: Record<string, { id: string; name: string }> = {};
  for (const c of crm?.collections ?? []) if (c.order && !c.closedAt) collectionOf[c.order.id] = { id: c.id, name: c.name };
  return (
    <>
      <ShellTitle eyebrow={page.board.name} title={page.customer.name} />
      <CustomerView
        board={page.board}
        customer={page.customer}
        tasks={page.tasks}
        infos={page.infos}
        interactions={page.interactions}
        checks={crm?.checks ?? []}
        collections={crm?.collections ?? []}
        deals={deals}
        followUp={crm?.followUp ?? null}
        followUpDays={crm ? crm.followUpDays : null}
        orderRefs={orders ? orders.orders.map((o) => ({ id: o.id, item: o.item, ordered: o.ordered })) : null}
        ordersOn={ordersOn}
        ordersTodo={orders ? orders.orders.filter((o) => !o.ordered).length : 0}
        tab={customerTabOf(query, { ordersOn })}
        highlightTask={asked ? (focus?.id ?? asked) : null}
        nowIso={now.toISOString()}
        today={todayKey(now)}
        orders={
          orders && (
            <CustomerOrders
              board={page.board}
              customer={{ id: page.customer.id, number: page.customer.number, name: page.customer.name, phone: page.customer.phone }}
              orders={orders.orders}
              today={orders.today}
              collectionOf={collectionOf}
            />
          )
        }
      />
    </>
  );
}
